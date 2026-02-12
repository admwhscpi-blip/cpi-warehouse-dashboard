const BKKDowntimeApp = {
    aggregatedData: [],
    intake71Data: {},
    materialBreakdown: {},
    truckTypeData: {},
    directGudangData: {},
    filterMode: 'overall',
    selectedMaterial: '',
    timeView: 'daily',
    charts: {},
    availableMaterials: [],

    init: async function () {
        console.log("Initializing SEARCH-FIRST V7.1...");

        // Auto-set current month and year
        const now = new Date();
        document.getElementById('select-month').value = now.getMonth() + 1;
        document.getElementById('select-year').value = now.getFullYear();

        // V7: Sembunyikan loading screen agar parameter langsung muncul!
        if (document.getElementById('loading')) {
            document.getElementById('loading').classList.add('hidden');
        }
        this.renderDashboard();
    },

    /**
     * V6 CORE: APPLY FILTERS & FETCH AGGREGATED DATA
     */
    applyFilters: function () {
        return new Promise((resolve) => {
            const btnText = document.getElementById('btn-run-text');
            if (btnText) btnText.innerText = "PROCESSING...";
            document.getElementById('loading').classList.remove('hidden');

            const month = document.getElementById('select-month').value;
            const year = document.getElementById('select-year').value;
            const material = this.filterMode === 'material' ? document.getElementById('select-material').value : '';

            console.log(`[V7 DEBUG] Running Query: Month=${month}, Year=${year}, Material=${material}`);

            const cb = 'bkk_v6_' + Math.round(Math.random() * 100000);
            window[cb] = (result) => {
                console.log("[V7 DEBUG] Data Received:", result);
                if (btnText) btnText.innerText = "RUN ANALYTICS";
                delete window[cb];
                if (result && result.data && result.data.length > 0) {
                    this.aggregatedData = result.data;
                    this.intake71Data = result.intake71 || {};
                    this.materialBreakdown = result.materialBreakdown || {};
                    this.truckTypeData = result.truckTypes || {};
                    this.directGudangData = result.directGudang || {};
                    this.availableMaterials = result.materials || [];
                    this.populateMaterialSelect();
                    this.renderDashboard();
                    document.getElementById('sync-label').innerText = `SYNCED (V7): ${new Date().toLocaleTimeString()}`;
                } else {
                    console.warn("[V7 DEBUG] Result empty or invalid:", result);
                    this.aggregatedData = [];
                    this.renderDashboard(); // Render empty state with msg
                    alert("DATA TIDAK DITEMUKAN: Periksa apakah ada data pada periode " + month + "/" + year + " di 10.000 baris terbaru.");
                }
                document.getElementById('loading').classList.add('hidden');
                resolve();
            };

            const baseUrl = CONFIG.BKK_DOWNTIME_API_URL.split('?')[0];
            const matParam = material ? `&material=${encodeURIComponent(material)}` : '';
            const script = document.createElement('script');
            script.src = `${baseUrl}?action=getDowntimeQuery&month=${month}&year=${year}${matParam}&callback=${cb}&t=${Date.now()}`;
            console.log("[V7 DEBUG] Script Source:", script.src);
            document.body.appendChild(script);
        });
    },

    populateMaterialSelect: function () {
        const select = document.getElementById('select-material');
        const currentVal = select.value;
        select.innerHTML = '<option value="">SELECT MATERIAL...</option>';
        this.availableMaterials.forEach(m => {
            select.innerHTML += `<option value="${m}">${m}</option>`;
        });
        select.value = currentVal;
    },

    setFilterMode: function (mode) {
        this.filterMode = mode;
        document.getElementById('btn-overall').classList.toggle('active', mode === 'overall');
        document.getElementById('btn-material').classList.toggle('active', mode === 'material');
        document.getElementById('material-filter-container').style.display = mode === 'material' ? 'block' : 'none';

        if (mode === 'overall') {
            document.getElementById('select-material').value = '';
        }
        // V7: Don't auto-fetch, wait for button click
    },

    setTimeView: function (view) {
        this.timeView = view;
        document.getElementById('btn-daily').classList.toggle('active', view === 'daily');
        document.getElementById('btn-weekly').classList.toggle('active', view === 'weekly');
        document.getElementById('btn-monthly').classList.toggle('active', view === 'monthly');

        if (this.aggregatedData.length > 0) {
            this.renderDashboard(); // Local re-render if data already exists
        }
    },

    /**
     * RENDER ENGINE V8
     */
    renderDashboard: function () {
        this.renderKPIs();
        this.renderVolumeTrend();
        this.renderDistribution();
        this.renderSBMvsPKMChart();
        this.renderDirectGudang();
    },

    renderKPIs: function () {
        const emptyIds = ['val-netto', 'val-trucks', 'val-intake71-eff', 'val-active-min', 'val-idle-min',
            'val-net-discharge', 'val-manuver-dt', 'val-qc-hold', 'val-intake71-ton', 'val-intake71-trucks',
            'val-direct-netto', 'val-direct-trucks', 'val-net-pct', 'val-man-pct', 'val-qc-pct', 'val-idle-pct'];
        if (this.aggregatedData.length === 0) {
            emptyIds.forEach(id => { const el = document.getElementById(id); if (el) { el.innerText = '-'; } });
            ['material-breakdown', 'truck-type-breakdown', 'direct-material-breakdown', 'direct-truck-types'].forEach(id => {
                const el = document.getElementById(id); if (el) el.innerHTML = '';
            });
            return;
        }

        const totals = this.aggregatedData.reduce((acc, d) => {
            acc.netto += d.netto;
            acc.trucks += d.trucks;
            return acc;
        }, { netto: 0, trucks: 0 });

        document.getElementById('val-netto').innerText = Math.round(totals.netto).toLocaleString();
        document.getElementById('val-trucks').innerText = totals.trucks;

        // Material Breakdown sub-cards
        const matEl = document.getElementById('material-breakdown');
        if (matEl && this.materialBreakdown) {
            const sorted = Object.entries(this.materialBreakdown).sort((a, b) => b[1] - a[1]);
            matEl.innerHTML = sorted.map(([name, val]) => `
                <div style="display:flex; justify-content:space-between; padding:3px 6px; margin-bottom:3px; background:rgba(0,243,255,0.05); border-radius:4px; border-left:2px solid rgba(0,243,255,0.3);">
                    <span style="font-family:'Rajdhani'; font-size:0.6rem; color:#aab; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:55%;">${name}</span>
                    <span style="font-family:'Orbitron'; font-size:0.55rem; font-weight:700; color:var(--neon-blue);">${Math.round(val).toLocaleString()}</span>
                </div>`).join('');
        }

        // Truck Type Breakdown sub-cards
        const ttEl = document.getElementById('truck-type-breakdown');
        if (ttEl && this.truckTypeData) {
            const totalTrucks = Object.values(this.truckTypeData).reduce((s, c) => s + c, 0);
            const sorted = Object.entries(this.truckTypeData).sort((a, b) => b[1] - a[1]);
            ttEl.innerHTML = sorted.map(([name, count]) => {
                const pct = totalTrucks > 0 ? ((count / totalTrucks) * 100).toFixed(1) : 0;
                return `
                <div style="display:flex; justify-content:space-between; padding:3px 6px; margin-bottom:3px; background:rgba(255,204,0,0.05); border-radius:4px; border-left:2px solid rgba(255,204,0,0.3);">
                    <span style="font-family:'Rajdhani'; font-size:0.6rem; color:#aab;">${name}</span>
                    <span style="font-family:'Orbitron'; font-size:0.55rem; font-weight:700; color:var(--neon-gold);">${count} <span style="font-size:0.45rem; opacity:0.7;">(${pct}%)</span></span>
                </div>`;
            }).join('');
        }

        // INTAKE 71 Data
        const i71 = this.intake71Data || {};
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        const setBar = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = Math.min(100, pct) + '%'; };

        const active = i71.activeMin || 0;
        const idle = i71.idleMin || 0;
        const off = i71.offMin || 0;
        const activePct = i71.activePct || 0;
        const idlePct = i71.idlePct || 0;
        const offPct = i71.offPct || 0;

        const net = i71.netMin || 0;
        const man = i71.manMin || 0;
        const qc = i71.qcMin || 0;
        const netPct = active > 0 ? Math.round((net / active) * 100) : 0;
        const manPct = active > 0 ? Math.round((man / active) * 100) : 0;
        const qcPct = active > 0 ? Math.round((qc / active) * 100) : 0;

        setVal('val-intake71-eff', activePct + '%');
        setVal('val-intake71-trucks', (i71.trucks || 0) + ' trucks');
        setVal('val-active-min', active.toLocaleString() + ' min');
        setVal('val-net-discharge', net.toLocaleString() + ' min');
        setVal('val-net-pct', '(' + netPct + '%)');
        setVal('val-manuver-dt', man.toLocaleString() + ' min');
        setVal('val-man-pct', '(' + manPct + '%)');
        setVal('val-qc-hold', qc.toLocaleString() + ' min');
        setVal('val-qc-pct', '(' + qcPct + '%)');
        setVal('val-idle-min', idle.toLocaleString() + ' min');
        setVal('val-idle-pct', idlePct + '%');
        setVal('val-off-min', off.toLocaleString() + ' min');
        setVal('val-off-pct', offPct + '%');
        setVal('val-intake71-ton', ((i71.nettoKg || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' Ton');

        // Animate progress bars
        setTimeout(() => {
            setBar('bar-net', netPct);
            setBar('bar-man', manPct);
            setBar('bar-qc', qcPct);
        }, 100);

        // Active vs Idle vs Off donut chart
        if (this.charts.yieldLoss) this.charts.yieldLoss.destroy();
        this.charts.yieldLoss = new ApexCharts(document.getElementById('chart-yield-loss'), {
            series: [activePct, idlePct, offPct],
            labels: ['ACTIVE', 'IDLE', 'OFF'],
            chart: { type: 'donut', height: 130 },
            colors: ['#00ff88', '#ff003c', '#bc13fe'],
            stroke: { show: false },
            plotOptions: { pie: { donut: { size: '70%', labels: { show: true, name: { fontFamily: 'Orbitron', fontSize: '10px', color: '#ccc' }, value: { fontFamily: 'Orbitron', fontSize: '16px', color: '#fff', formatter: val => val + '%' }, total: { show: true, label: 'ACTIVE', fontFamily: 'Orbitron', fontSize: '9px', color: '#8892b0', formatter: () => activePct + '%' } } } } },
            legend: { show: false },
            tooltip: { enabled: true, theme: 'dark' }
        });
        this.charts.yieldLoss.render();

        // Direct Gudang KPIs
        const dg = this.directGudangData || {};
        setVal('val-direct-netto', (dg.totalNetto || 0).toLocaleString());
        setVal('val-direct-trucks', dg.totalTrucks || 0);

        // Direct Material Breakdown
        const dmEl = document.getElementById('direct-material-breakdown');
        if (dmEl && dg.materials) {
            const sorted = Object.entries(dg.materials).sort((a, b) => b[1] - a[1]);
            dmEl.innerHTML = sorted.map(([name, val]) => `
                <div style="display:flex; justify-content:space-between; padding:3px 6px; margin-bottom:3px; background:rgba(188,19,254,0.05); border-radius:4px; border-left:2px solid rgba(188,19,254,0.3);">
                    <span style="font-family:'Rajdhani'; font-size:0.6rem; color:#aab; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:55%;">${name}</span>
                    <span style="font-family:'Orbitron'; font-size:0.55rem; font-weight:700; color:var(--neon-purple);">${Math.round(val).toLocaleString()}</span>
                </div>`).join('');
        }

        // Direct Truck Types
        const dtEl = document.getElementById('direct-truck-types');
        if (dtEl && dg.truckTypes) {
            const totalDGTrucks = Object.values(dg.truckTypes).reduce((s, c) => s + c, 0);
            const sorted = Object.entries(dg.truckTypes).sort((a, b) => b[1] - a[1]);
            dtEl.innerHTML = sorted.map(([name, count]) => {
                const pct = totalDGTrucks > 0 ? ((count / totalDGTrucks) * 100).toFixed(1) : 0;
                return `
                <div style="display:flex; justify-content:space-between; padding:3px 6px; margin-bottom:3px; background:rgba(188,19,254,0.05); border-radius:4px; border-left:2px solid rgba(188,19,254,0.3);">
                    <span style="font-family:'Rajdhani'; font-size:0.6rem; color:#aab;">${name}</span>
                    <span style="font-family:'Orbitron'; font-size:0.55rem; font-weight:700; color:var(--neon-purple);">${count} <span style="font-size:0.45rem; opacity:0.7;">(${pct}%)</span></span>
                </div>`;
            }).join('');
        }
    },

    renderVolumeTrend: function () {
        if (this.aggregatedData.length === 0) {
            document.querySelector("#chart-main-volume").innerHTML = `
                <div style="display:flex; height:100%; align-items:center; justify-content:center; color:#444; font-family:Orbitron; font-size:1.2rem; letter-spacing:2px;">
                    <i class="fas fa-search" style="margin-right:15px; opacity:0.5;"></i> READY TO SCAN...
                </div>`;
            return;
        }

        const groups = {};
        this.aggregatedData.forEach(d => {
            const dateObj = new Date(d.date);
            const keys = {
                daily: d.date,
                weekly: this.getWeekStr(dateObj),
                monthly: d.date.substring(0, 7)
            };
            const key = keys[this.timeView] || keys.daily;

            if (!groups[key]) groups[key] = { netto: 0, trucks: 0 };
            groups[key].netto += d.netto;
            groups[key].trucks += d.trucks;
        });

        const sortedKeys = Object.keys(groups).sort();
        const seriesData = sortedKeys.map(k => Math.round(groups[k].netto));

        const options = {
            series: [{ name: 'NETTO (KG)', data: seriesData }],
            chart: {
                type: 'area', height: 380, toolbar: { show: false }, zoom: { enabled: false }
            },
            dataLabels: { enabled: false },
            colors: ['#00f3ff'],
            fill: { type: 'gradient', gradient: { opacityFrom: 0.6, opacityTo: 0.1 } },
            stroke: { curve: 'smooth', width: 3 },
            xaxis: {
                categories: sortedKeys,
                labels: { style: { colors: '#64748b', fontSize: '10px', fontFamily: 'Orbitron' } }
            },
            yaxis: {
                labels: { formatter: val => (val / 1000).toFixed(0) + 'T', style: { colors: '#64748b' } }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            tooltip: { theme: 'dark' }
        };

        if (this.charts.volume) this.charts.volume.destroy();
        this.charts.volume = new ApexCharts(document.querySelector("#chart-main-volume"), options);
        this.charts.volume.render();
    },

    renderDistribution: function () {
        if (this.aggregatedData.length === 0) {
            document.querySelector("#chart-distribution").innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#444; font-family:Orbitron; font-size:0.7rem;">NO DATA</div>`;
            return;
        }

        const totals = this.aggregatedData.reduce((acc, d) => {
            acc.intake += (d.netto * d.dist.intake / 100);
            acc.direct += (d.netto * d.dist.direct / 100);
            return acc;
        }, { intake: 0, direct: 0 });

        const options = {
            series: [Math.round(totals.intake), Math.round(totals.direct)],
            labels: ['INTAKE', 'DIRECT'],
            chart: { type: 'donut', height: 380 },
            colors: ['#00f3ff', '#ffcc00'],
            stroke: { show: false },
            legend: { position: 'bottom', labels: { colors: '#fff' }, fontFamily: 'Orbitron' },
            plotOptions: { pie: { donut: { size: '75%' } } },
            tooltip: { theme: 'dark', y: { formatter: val => val.toLocaleString() + ' KG' } }
        };

        if (this.charts.dist) this.charts.dist.destroy();
        this.charts.dist = new ApexCharts(document.querySelector("#chart-distribution"), options);
        this.charts.dist.render();
    },

    renderSBMvsPKMChart: function () {
        const i71 = this.intake71Data || {};
        const container = document.querySelector("#chart-sbm-pkm-71");
        if (!container) return;

        if (this.aggregatedData.length === 0 || !i71.materials) {
            container.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#444; font-family:Orbitron; font-size:0.7rem;">NO DATA</div>`;
            return;
        }

        let sbmTotal = 0;
        let pkmTotal = 0;
        let otherTotal = 0;

        Object.entries(i71.materials).forEach(([name, val]) => {
            const upper = name.toUpperCase();
            if (upper.includes("SBM")) sbmTotal += val;
            else if (upper.includes("PKM")) pkmTotal += val;
            else otherTotal += val;
        });

        const options = {
            series: [Math.round(sbmTotal), Math.round(pkmTotal), Math.round(otherTotal)],
            labels: ['SBM', 'PKM', 'OTHERS'],
            chart: { type: 'pie', height: 380 },
            colors: ['#00f3ff', '#ffcc00', '#64748b'],
            stroke: { show: false },
            legend: { position: 'bottom', labels: { colors: '#fff' }, fontFamily: 'Orbitron' },
            dataLabels: { enabled: true, formatter: (val) => val.toFixed(1) + "%" },
            tooltip: { theme: 'dark', y: { formatter: val => val.toLocaleString() + ' KG' } }
        };

        if (this.charts.sbmPkm) this.charts.sbmPkm.destroy();
        this.charts.sbmPkm = new ApexCharts(container, options);
        this.charts.sbmPkm.render();
    },

    renderDirectGudang: function () {
        const emptyHtml = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#444; font-family:Orbitron; font-size:0.7rem;">NO DIRECT DATA</div>`;
        const dg = this.directGudangData || {};
        const daily = dg.daily || [];

        if (daily.length === 0) {
            ['chart-direct-volume', 'chart-direct-material'].forEach(id => {
                const el = document.getElementById(id); if (el) el.innerHTML = emptyHtml;
            });
            return;
        }

        // --- Daily Volume Bar Chart ---
        const dates = daily.map(d => d.date);
        const nettos = daily.map(d => d.netto);
        const truckCounts = daily.map(d => d.trucks);

        const volOpts = {
            series: [
                { name: 'NETTO (KG)', type: 'bar', data: nettos },
                { name: 'TRUCKS', type: 'line', data: truckCounts }
            ],
            chart: { height: 330, toolbar: { show: false } },
            colors: ['#bc13fe', '#ffcc00'],
            stroke: { width: [0, 3], curve: 'smooth' },
            plotOptions: { bar: { columnWidth: '60%', borderRadius: 4 } },
            xaxis: { categories: dates, labels: { style: { colors: '#64748b', fontSize: '9px', fontFamily: 'Orbitron' } } },
            yaxis: [
                { labels: { formatter: val => (val / 1000).toFixed(0) + 'T', style: { colors: '#64748b' } } },
                { opposite: true, labels: { style: { colors: '#ffcc00' } } }
            ],
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            tooltip: { theme: 'dark' },
            legend: { labels: { colors: '#fff' }, fontFamily: 'Orbitron', fontSize: '9px' }
        };

        if (this.charts.directVol) this.charts.directVol.destroy();
        this.charts.directVol = new ApexCharts(document.getElementById('chart-direct-volume'), volOpts);
        this.charts.directVol.render();

        // --- Material Distribution Donut ---
        const mats = dg.materials || {};
        const matEntries = Object.entries(mats).sort((a, b) => b[1] - a[1]);
        const purpleShades = ['#bc13fe', '#9b59b6', '#8e44ad', '#7d3c98', '#6c3483', '#5b2c6f', '#4a235a'];

        const matOpts = {
            series: matEntries.map(([, v]) => Math.round(v)),
            labels: matEntries.map(([k]) => k),
            chart: { type: 'donut', height: 310 },
            colors: matEntries.map((_, i) => purpleShades[i % purpleShades.length]),
            stroke: { show: false },
            legend: { position: 'bottom', labels: { colors: '#fff' }, fontFamily: 'Orbitron', fontSize: '9px' },
            plotOptions: { pie: { donut: { size: '70%' } } },
            tooltip: { theme: 'dark', y: { formatter: val => val.toLocaleString() + ' KG' } }
        };

        if (this.charts.directMat) this.charts.directMat.destroy();
        this.charts.directMat = new ApexCharts(document.getElementById('chart-direct-material'), matOpts);
        this.charts.directMat.render();
    },

    showDrillDown: function (label) {
        const modal = document.getElementById('modal-drill');
        modal.style.display = 'flex';
        document.getElementById('modal-header').innerText = `SUMMARY: ${label}`;
        document.getElementById('modal-content-body').innerHTML = `
            <div style="text-align:center; padding:50px; color:#666; font-family:Orbitron;">
                <i class="fas fa-bolt" style="font-size:3rem; color:var(--neon-gold); margin-bottom:20px;"></i><br>
                DIRECT ANALYTICS V7 ACTIVE<br>
                <span style="font-size:0.8rem; color:#444;">Detailed logs are hidden for maximum performance.</span>
            </div>
        `;
    },

    closeModal: function () {
        document.getElementById('modal-drill').style.display = 'none';
    },

    // HELPERS
    toggleFullscreen: function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log("Fullscreen Error:", err);
            });
            document.body.classList.add('fullscreen-active');
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            document.body.classList.remove('fullscreen-active');
        }

        const fsChangeHandler = () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen-active');
                window.dispatchEvent(new Event('resize'));
                document.removeEventListener('fullscreenchange', fsChangeHandler);
            }
        };
        document.addEventListener('fullscreenchange', fsChangeHandler);

        // Trigger resize for ApexCharts
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    },

    getWeekStr: function (date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const weekNo = Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
    },

    formatMinutesToTime: function (totalMin) {
        if (isNaN(totalMin) || totalMin === 0) return "00:00";
        const mins = Math.floor(totalMin);
        const secs = Math.round((totalMin - mins) * 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
};

window.onload = () => BKKDowntimeApp.init();
