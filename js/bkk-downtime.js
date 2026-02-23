window.onload = () => BKKDowntimeApp.init();

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
        console.log("Initializing SEARCH-FIRST V10.3...");
        const now = new Date();
        document.getElementById('select-month').value = now.getMonth() + 1;
        document.getElementById('select-year').value = now.getFullYear();
        if (document.getElementById('loading')) {
            document.getElementById('loading').classList.add('hidden');
        }
        this.startClock(); // V16.4: Start Premium Widget
        this.renderDashboard();
    },

    applyFilters: function () {
        return new Promise((resolve) => {
            const btnText = document.querySelector('.btn-run-v10'); // Fix selector
            if (btnText) btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESSING...';
            document.getElementById('loading').classList.remove('hidden');

            const month = document.getElementById('select-month').value;
            const year = document.getElementById('select-year').value;

            // V12: Safe material retrieval
            let material = '';
            if (this.filterMode === 'material') {
                const elMat = document.getElementById('select-material');
                if (elMat) material = elMat.value;
            }
            this.selectedMaterial = material;

            const cb = 'bkk_v10_' + Math.round(Math.random() * 100000);
            window[cb] = (result) => {
                if (btnText) btnText.innerHTML = '<i class="fas fa-play"></i> RUN ANALYTICS';
                delete window[cb];
                if (result && result.data && result.data.length > 0) {
                    this.aggregatedData = result.data;
                    this.intake71Data = result.intake71 || {};
                    this.materialBreakdown = result.materialBreakdown || {};
                    this.truckTypeData = result.truckTypes || {};
                    this.directGudangData = result.directGudang || {};
                    this.availableMaterials = result.materials || [];
                    this.renderMaterialTable();
                    this.renderDashboard();
                } else {
                    this.aggregatedData = [];
                    this.renderDashboard();
                    alert("DATA EMPTY for this period.");
                }
                document.getElementById('loading').classList.add('hidden');
                resolve();
            };

            const baseUrl = CONFIG.BKK_DOWNTIME_API_URL.split('?')[0];
            const matParam = material ? `&material=${encodeURIComponent(material)}` : '';
            const script = document.createElement('script');
            script.src = `${baseUrl}?action=getDowntimeQuery&month=${month}&year=${year}${matParam}&callback=${cb}&t=${Date.now()}`;
            document.body.appendChild(script);
        });
    },

    renderMaterialTable: function () {
        const tbody = document.getElementById('material-list-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.availableMaterials.forEach(m => {
            const tr = document.createElement('tr');
            tr.className = 'mat-row';
            if (this.selectedMaterial === m) tr.classList.add('selected');
            tr.innerHTML = `<td>${m}</td><td style="text-align:right; color:var(--neon-blue);"><i class="fas fa-check-circle" style="opacity:${this.selectedMaterial === m ? 1 : 0}"></i></td>`;
            tr.onclick = () => {
                this.selectedMaterial = m;
                this.renderMaterialTable();
                this.applyFilters();
            };
            tbody.appendChild(tr);
        });
    },

    setFilterMode: function (mode) {
        this.filterMode = mode;
        document.getElementById('btn-overall').classList.toggle('active', mode === 'overall');
        document.getElementById('btn-material').classList.toggle('active', mode === 'material');

        // V12: Toggle the new SBM/PKM selector
        const elMat = document.getElementById('select-material');
        if (elMat) elMat.classList.toggle('hidden', mode !== 'material');

        if (mode === 'overall') {
            this.selectedMaterial = '';
            this.applyFilters();
        } else {
            // If switched to material, trigger first filter (default SBM)
            this.applyFilters();
        }
    },

    // V16.4: PREMIUM CLOCK ENGINE
    startClock: function () {
        const update = () => {
            const now = new Date();
            const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

            // Date Elements
            const dayEl = document.getElementById('widget-day');
            const dateEl = document.getElementById('widget-date');
            if (dayEl) dayEl.innerText = days[now.getDay()];
            if (dateEl) dateEl.innerText = `${months[now.getMonth()]} ${now.getDate()}`;

            // Time Elements
            let h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            h = h ? h : 12; // 0 becomes 12
            const hStr = String(h).padStart(2, '0');

            const timeEl = document.getElementById('widget-time');
            const ampmEl = document.getElementById('widget-ampm');
            if (timeEl) timeEl.innerText = `${hStr}:${m}`;
            if (ampmEl) ampmEl.innerText = ampm;

            // Visual Progress (Seconds)
            const sec = now.getSeconds();
            const progressEl = document.getElementById('widget-sec-progress');
            if (progressEl) {
                const deg = (sec / 60) * 360;
                progressEl.style.transform = `rotate(${deg - 45}deg)`;
            }
        };
        update();
        setInterval(update, 1000);
    },

    renderDashboard: function () {
        this.renderIntake71Analysis();
        this.renderVolumeTrend(); // Top Full Width
        this.renderDistribution();
        this.renderSBMvsPKMChart();
        this.renderDirectGudang();
        // New V10 Logic:
        this.renderGrandTotal();
        this.renderProcessStats();
        this.renderEvalSection(); // V14: New consolidated evaluation
        this.renderCalendar(); // V15: New daily volume calendar
    },

    calculateProductivity: function () {
        // Called when manpower input changes (now calls renderEvalSection)
        this.renderIntake71Analysis();
        this.renderEvalSection();
    },

    renderGrandTotal: function () {
        // Sum Intake + Direct
        const i71 = this.intake71Data || {};
        const dg = this.directGudangData || {};
        const dailyDirect = dg.daily || [];

        const intakeNetto = i71.nettoKg || 0;
        const directNetto = dailyDirect.reduce((sum, d) => sum + (d.netto || 0), 0);
        const grandTotal = intakeNetto + directNetto;

        const el = document.getElementById('val-grand-total');
        if (el) el.innerText = (grandTotal / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 });

        // Also update subtitles
        document.getElementById('val-intake-total-ton').innerText = (intakeNetto / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' TON';
        document.getElementById('val-direct-total-ton').innerText = (directNetto / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' TON';
    },

    renderIntake71Analysis: function () {
        const i71 = this.intake71Data || {};

        // --- 1. PREPARE DATA ---
        const totalNetto = i71.nettoKg || 0;
        const totalTon = totalNetto / 1000;
        let netMin = i71.netDischarge || 0;
        let activeTotal = i71.activeTotal || 0;
        let idleLoss = i71.idleLoss || 0;
        let offSetup = i71.offSetup || 0;
        const totalTime = activeTotal + idleLoss + offSetup;

        // --- 2. CALCULATE SPEEDS (Min, Avg, Max) ---
        // Need Daily Data for Min/Max
        let dailyIntakeVol = [];

        if (this.aggregatedData && this.aggregatedData.length > 0) {
            this.aggregatedData.forEach(d => {
                // Estimate Intake share
                const intakeShare = d.dist && d.dist.intake ? d.dist.intake : (d.netto > 0 ? 100 : 0);
                const val = d.netto * (intakeShare / 100);

                // Push to daily volume series
                dailyIntakeVol.push({ x: new Date(d.date).getTime(), y: val });
            });
        }

        // --- 2. CALCULATE SPEEDS (Min, Avg, Max) ---
        const speedTonHr = i71.avgSpeed || 0;
        const minSpeed = i71.minSpeed || 0;
        const maxSpeed = i71.maxSpeed || 0;

        // Set Values
        const fmt = (n) => Math.round(n).toLocaleString();
        const fmtDec = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

        // Yield (V12.2: Active Working vs Total Month)
        let den = i71.totalMonthMin || 1;
        const yieldPct = ((i71.activeTotal || 0) / den) * 100;
        setVal('val-yield-pct', yieldPct.toFixed(1) + '%');

        setVal('val-intake-total-ton', fmtDec(totalTon) + ' TON');
        setVal('stat-min-speed', fmtDec(minSpeed));
        setVal('val-speed-ton', fmtDec(speedTonHr));
        setVal('stat-max-speed', fmtDec(maxSpeed));
        setVal('stat-max-date', 'REAL-TIME MEASURED');

        // --- 3. DURATION BREAKDOWN METRICS ---
        // V12.2: Perfect 100% Math
        den = i71.totalMonthMin || totalTime || 1;

        let activeTotalWorking;
        let activeSeries, activeLabels, activeColors;

        let wt = 0, bk = 0, qct = 0, mnv = 0, fn = 0;
        let hasNewBreakdown = false;

        if (this.aggregatedData) {
            this.aggregatedData.forEach(d => {
                const shifts = d.shiftData || {};
                ["1", "2", "3"].forEach(id => {
                    const s = shifts[id];
                    if (s && (s.wt !== undefined || s.bk !== undefined || s.qct !== undefined || s.mnv !== undefined || s.fn !== undefined)) {
                        hasNewBreakdown = true;
                        wt += (s.wt || 0);
                        bk += (s.bk || 0);
                        qct += (s.qct || 0);
                        mnv += (s.mnv || 0);
                        fn += (s.fn || 0);
                    }
                });
            });
        }

        if (hasNewBreakdown || (i71.isMarch26 && i71.i71_v2)) {
            activeTotalWorking = i71.activeTotal || (wt + bk + qct + mnv + fn);

            activeSeries = [wt, bk, qct, mnv, fn];
            activeLabels = ['Wait Panggil', 'Active Bongkar', 'QC Process', 'Manuver Akhir', 'Finish Delay'];
            activeColors = ['#ffea00', '#00e5ff', '#651fff', '#ff003c', '#ff9100'];

            setVal('micro-wait', fmt(wt) + 'm');
            setVal('micro-bongkar', fmt(bk) + 'm');
            setVal('micro-qc', fmt(qct) + 'm');
            setVal('micro-manuver', fmt(mnv) + 'm');
            setVal('micro-finish', fmt(fn) + 'm');
        } else {
            let manTime = i71.manuverTotal || 0;
            let qcTime = i71.qcTotal || 0;
            netMin = i71.netDischarge || 0;
            activeTotalWorking = i71.activeTotal || (netMin + manTime + qcTime);

            activeSeries = [netMin, manTime, qcTime];
            activeLabels = ['Net Bongkar', 'Manuver', 'QC Check'];
            activeColors = ['#00e5ff', '#2979ff', '#651fff'];

            setVal('micro-wait', '-');
            setVal('micro-bongkar', fmt(netMin) + 'm');
            setVal('micro-qc', fmt(qcTime) + 'm');
            setVal('micro-manuver', fmt(manTime) + 'm');
            setVal('micro-finish', '-');
        }

        setVal('val-active-min', fmt(activeTotalWorking) + ' MIN');
        setVal('val-active-pct', ((activeTotalWorking / den) * 100).toFixed(0) + '%');

        setVal('val-idle-min', fmt(idleLoss) + ' MIN');
        setVal('val-idle-pct', ((idleLoss / den) * 100).toFixed(0) + '%');

        setVal('val-off-min', fmt(offSetup) + ' MIN');
        setVal('val-off-pct', ((offSetup / den) * 100).toFixed(0) + '%');

        // Restore Deep Dive Metrics (V12.2)
        const avgGap = i71.trucks > 0 ? (idleLoss / i71.trucks) : 0;
        setVal('val-avg-gap', avgGap.toFixed(1));

        const days = dailyIntakeVol.length || 1;
        const avgSetup = days > 0 ? (offSetup / (days * 2)) : 0; // Assume 2 setups/day avg
        setVal('val-avg-setup', avgSetup.toFixed(1));

        // --- 4. CHARTS ---
        const activeOpts = {
            series: activeSeries,
            labels: activeLabels,
            chart: { type: 'donut', height: 160, background: 'transparent', fontFamily: 'Orbitron' },
            colors: activeColors,
            stroke: { show: false },
            dataLabels: { enabled: false },
            legend: { show: false },
            plotOptions: { pie: { donut: { size: '75%', labels: { show: true, name: { show: true, color: '#fff', fontSize: '10px' }, value: { show: true, color: '#fff', fontSize: '16px', formatter: v => Math.round(v) + 'm' } } } } },
            tooltip: { theme: 'dark' }
        };

        if (this.charts.activeBreakdown) this.charts.activeBreakdown.destroy();
        const elActive = document.getElementById('chart-active-breakdown');
        if (elActive) {
            this.charts.activeBreakdown = new ApexCharts(elActive, activeOpts);
            this.charts.activeBreakdown.render();
        }

        const intakeOpts = {
            series: [{ name: 'Intake Volume', data: dailyIntakeVol }],
            chart: { type: 'area', height: 220, toolbar: { show: false }, background: 'transparent', fontFamily: 'Orbitron' },
            colors: ['#d500f9'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.1, stops: [0, 95, 100] } },
            stroke: { curve: 'smooth', width: 2 },
            dataLabels: { enabled: false },
            xaxis: { type: 'datetime', labels: { style: { colors: '#aaa', fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: val => (val / 1000).toFixed(0) + 'T', style: { colors: '#aaa', fontSize: '11px' } }, grid: { show: false } },
            grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 3 },
            tooltip: { theme: 'dark', x: { format: 'dd MMM' } }
        };

        if (this.charts.intakeVol) this.charts.intakeVol.destroy();
        const elIntake = document.getElementById('chart-intake-volume');
        if (elIntake) {
            this.charts.intakeVol = new ApexCharts(elIntake, intakeOpts);
            this.charts.intakeVol.render();
        }

        // V11.3: Trigger with path separation
        this.renderTruckAnalysis('intake');
    },

    renderProcessStats: function () {
        const avg = parseFloat(document.getElementById('val-speed-ton').innerText.replace(/,/g, '')) || 0;
        const maxSpeed = (avg * 1.3);
        const elMax = document.getElementById('stat-max-speed');
        if (elMax) elMax.innerText = maxSpeed.toFixed(0);
        const elMaxDate = document.getElementById('stat-max-date');
        if (elMaxDate) elMaxDate.innerText = "ESTIMATED";
    },

    renderDowntimeBarChart: function (i71, active, idle, off) {
        const net = i71.netDischarge || 0;
        const man = i71.manuverTotal || 0;
        const qc = i71.qcTotal || 0;
        const options = {
            series: [{ name: 'NET DISCHARGE', data: [net] }, { name: 'MANUVER', data: [man] }, { name: 'QC HOLD', data: [qc] }, { name: 'IDLE LOSS', data: [idle] }, { name: 'OFF/SETUP', data: [off] }],
            chart: { type: 'bar', height: 140, stacked: true, toolbar: { show: false }, background: 'transparent' },
            plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
            colors: ['#00f3ff', '#00a8ff', '#bc13fe', '#ffcc00', '#ff003c'],
            dataLabels: { enabled: false },
            stroke: { width: 1, colors: ['#000'] },
            xaxis: { categories: ['TIME'], labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { show: false },
            tooltip: { theme: 'dark', y: { formatter: (val) => val.toLocaleString() + ' min' } },
            legend: { position: 'top', horizontalAlign: 'left', fontFamily: 'Orbitron', labels: { colors: '#fff' }, fontSize: '11px' },
            grid: { show: false }
        };
        if (this.charts.downtimeBar) this.charts.downtimeBar.destroy();
        this.charts.downtimeBar = new ApexCharts(document.getElementById('chart-downtime-bar'), options);
        this.charts.downtimeBar.render();
    },

    renderVolumeTrend: function () {
        const daily = this.aggregatedData || [];
        let intakeSeries = [];
        let directSeries = [];
        let cats = [];

        const dateMap = {};
        // Use dist percentages to split intake vs total correctly
        daily.forEach(d => {
            const intakePct = (d.dist && d.dist.intake) ? d.dist.intake : 100;
            const intakeVal = Math.round(d.netto * (intakePct / 100));
            dateMap[d.date] = { intake: intakeVal, direct: 0 };
        });

        if (this.directGudangData && this.directGudangData.daily) {
            this.directGudangData.daily.forEach(d => {
                if (!dateMap[d.date]) dateMap[d.date] = { intake: 0, direct: 0 };
                dateMap[d.date].direct = d.netto;
            });
        }

        const sortedDates = Object.keys(dateMap).sort();
        sortedDates.forEach(date => {
            cats.push(new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
            intakeSeries.push(dateMap[date].intake);
            directSeries.push(dateMap[date].direct);
        });

        const options = {
            series: [
                { name: 'Intake 71', data: intakeSeries },
                { name: 'Direct Gudang', data: directSeries }
            ],
            chart: {
                type: 'area',
                height: 200,
                background: 'transparent',
                toolbar: { show: false },
                fontFamily: 'Orbitron',
                zoom: { enabled: false }
            },
            colors: ['#d500f9', '#00e5ff'],
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.5,
                    opacityTo: 0.1,
                    stops: [0, 90, 100]
                }
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: {
                categories: cats,
                labels: { style: { colors: '#aaa', fontSize: '11px' } },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: {
                    formatter: val => (val / 1000).toFixed(0) + 'T',
                    style: { colors: '#aaa', fontSize: '11px' }
                },
                grid: { show: false }
            },
            grid: {
                borderColor: 'rgba(255,255,255,0.05)',
                strokeDashArray: 3,
                show: true
            },
            theme: { mode: 'dark' },
            legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: '#ccc' } }
        };

        if (this.charts.mainVolume) this.charts.mainVolume.destroy();
        this.charts.mainVolume = new ApexCharts(document.getElementById('chart-main-volume'), options);
        this.charts.mainVolume.render();
    },

    renderDistribution: function () {
        const i71Netto = (this.intake71Data.nettoKg || 0);
        const dgNetto = (this.directGudangData.daily || []).reduce((acc, d) => acc + (d.netto || 0), 0);

        const options = {
            series: [i71Netto, dgNetto],
            labels: ['Intake 71', 'Direct Gudang'],
            chart: { type: 'donut', height: 180, background: 'transparent', fontFamily: 'Orbitron' },
            colors: ['#d500f9', '#00e5ff'],
            plotOptions: { pie: { donut: { size: '70%', labels: { show: false } } } },
            dataLabels: { enabled: false },
            legend: { show: false },
            stroke: { show: false },
            tooltip: {
                theme: 'dark',
                y: { formatter: val => (val / 1000).toFixed(0) + ' Ton' }
            }
        };

        if (this.charts.distribution) this.charts.distribution.destroy();
        const el = document.getElementById('chart-distribution');
        if (el) {
            this.charts.distribution = new ApexCharts(el, options);
            this.charts.distribution.render();
        }
    },

    renderSBMvsPKMChart: function () {
        const i71 = this.intake71Data || {};
        const container = document.querySelector("#chart-sbm-pkm-71");
        if (!container) return;
        if (!i71.materials) {
            container.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#444; font-family:Orbitron;">NO DATA</div>`;
            return;
        }
        let sbm = 0, pkm = 0, other = 0;
        Object.entries(i71.materials).forEach(([name, val]) => {
            const u = name.toUpperCase();
            if (u.includes("SBM")) sbm += val; else if (u.includes("PKM")) pkm += val; else other += val;
        });
        const options = {
            series: [Math.round(sbm), Math.round(pkm), Math.round(other)],
            labels: ['SBM', 'PKM', 'OTHERS'],
            chart: { type: 'pie', height: 250 },
            colors: ['#00f3ff', '#ffcc00', '#64748b'],
            stroke: { show: false },
            legend: { position: 'bottom', labels: { colors: '#fff' }, fontFamily: 'Orbitron', fontSize: '11px' },
            plotOptions: { pie: {} },
            tooltip: { theme: 'dark', y: { formatter: val => val.toLocaleString() + ' KG' } }
        };
        if (this.charts.sbmPkm) this.charts.sbmPkm.destroy();
        this.charts.sbmPkm = new ApexCharts(container, options);
        this.charts.sbmPkm.render();
    },

    renderDirectGudang: function () {
        const dg = this.directGudangData || {};
        const daily = dg.daily || [];
        const breakdown = dg.materials || {};

        const totalNetto = daily.reduce((acc, d) => acc + (d.netto || 0), 0);
        const totalTrucks = daily.reduce((acc, d) => acc + (d.trucks || 0), 0);
        const avgLoad = totalTrucks > 0 ? (totalNetto / totalTrucks) : 0;

        const elNet = document.getElementById('val-direct-netto');
        const elTrk = document.getElementById('val-direct-trucks');
        const elAvg = document.getElementById('val-direct-avg-load');
        const elTon = document.getElementById('val-direct-total-ton');

        if (elNet) elNet.innerText = totalNetto.toLocaleString();
        if (elTrk) elTrk.innerText = totalTrucks.toLocaleString();
        if (elAvg) elAvg.innerText = Math.round(avgLoad).toLocaleString();
        if (elTon) elTon.innerText = (totalNetto / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' TON';

        if (daily.length === 0) {
            // Clear existing charts when no data (e.g. material filter applied)
            if (this.charts.directVol) { this.charts.directVol.destroy(); this.charts.directVol = null; }
            if (this.charts.directMat) { this.charts.directMat.destroy(); this.charts.directMat = null; }
            const elVol = document.getElementById('chart-direct-volume');
            if (elVol) elVol.innerHTML = '<div style="color:#444; font-family:Orbitron; font-size:0.8rem; text-align:center; padding:40px;">NO DATA</div>';
            const elMat = document.getElementById('chart-direct-material');
            if (elMat) elMat.innerHTML = '<div style="color:#444; font-family:Orbitron; font-size:0.8rem; text-align:center; padding:40px;">NO DATA</div>';
            this.renderTruckAnalysis('direct');
            return;
        }

        daily.sort((a, b) => new Date(a.date) - new Date(b.date));

        const volOpts = {
            series: [{ name: 'NETTO (KG)', data: daily.map(d => d.netto) }],
            chart: { type: 'bar', height: 250, toolbar: { show: false }, background: 'transparent', fontFamily: 'Orbitron' },
            colors: ['#00e5ff'],
            plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
            dataLabels: { enabled: false },
            xaxis: {
                categories: daily.map(d => new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })),
                labels: { style: { colors: '#aaa', fontSize: '11px' } },
                axisBorder: { show: false }, axisTicks: { show: false }
            },
            yaxis: { show: false },
            grid: { show: false },
            tooltip: { theme: 'dark', y: { formatter: val => (val / 1000).toFixed(1) + ' T' } }
        };

        if (this.charts.directVol) this.charts.directVol.destroy();
        const elVol = document.getElementById('chart-direct-volume');
        if (elVol) {
            this.charts.directVol = new ApexCharts(elVol, volOpts);
            this.charts.directVol.render();
        }

        const matEntries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
        const matOpts = {
            series: matEntries.map(([, v]) => Math.round(v)),
            labels: matEntries.map(([k]) => k),
            chart: { type: 'donut', height: 180, background: 'transparent', fontFamily: 'Orbitron' },
            colors: ['#00e5ff', '#ffea00', '#ff005c', '#76ff03'],
            stroke: { show: false },
            legend: { show: false },
            plotOptions: { pie: { donut: { size: '65%' } } },
            dataLabels: { enabled: false },
            tooltip: { theme: 'dark', y: { formatter: val => val.toLocaleString() + ' KG' } }
        };

        if (this.charts.directMat) this.charts.directMat.destroy();
        const elMat = document.getElementById('chart-direct-material');
        if (elMat) {
            this.charts.directMat = new ApexCharts(elMat, matOpts);
            this.charts.directMat.render();
        }

        // V11.3: Trigger with path separation
        this.renderTruckAnalysis('direct');
    },

    renderEvalSection: function () {
        const container = document.getElementById('section-eval-prod');
        if (!container) return;

        // 1. Determine Mode
        let mode = 'OVERALL';
        if (this.selectedMaterial && this.selectedMaterial.includes('SBM')) mode = 'SBM';
        if (this.selectedMaterial && this.selectedMaterial.includes('PKM')) mode = 'PKM';

        // OVERALL -> HIDE SECTION
        if (mode === 'OVERALL') {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        // Prepare Data
        const i71 = this.intake71Data || {};
        const dailyDetail = (i71 && i71.dailyDetail) ? i71.dailyDetail : [];
        const subTypes = (i71 && i71.intakeSubTypes) ? i71.intakeSubTypes : {};
        const workers = (i71 && i71.workerStats) ? i71.workerStats : {};
        const directTrucks = (this.directGudangData && this.directGudangData.truckTypes) ? this.directGudangData.truckTypes : {};

        // Helper: Find max/min
        let maxOutput = { val: 0, date: '-', detail: {} };
        let minOutput = { val: 999999999, date: '-', detail: {} };
        let maxIdle = { val: 0, date: '-' };
        let maxOff = { val: 0, date: '-' };

        dailyDetail.forEach(d => {
            if (d.tonPerHour > maxOutput.val) { maxOutput = { val: d.tonPerHour, date: d.date, detail: d }; }
            if (d.tonPerHour > 0 && d.tonPerHour < minOutput.val) { minOutput = { val: d.tonPerHour, date: d.date, detail: d }; }
            if (d.idleMin > maxIdle.val) { maxIdle = { val: d.idleMin, date: d.date }; }
            if (d.offMin > maxOff.val) { maxOff = { val: d.offMin, date: d.date }; }
        });
        if (minOutput.val === 999999999) minOutput.val = 0;

        // Build HTML Structure based on Mode
        let html = '';

        // PKM: 2 Columns (Prod Table + Eval). SBM: 1 Column (Eval only)
        const gridStyle = mode === 'PKM' ? 'display:grid; grid-template-columns: 1fr 1fr; gap:25px;' : 'display:block;';

        html += `<div style="${gridStyle}">`;

        // --- LEFT COLUMN: PRODUCTIVITY TABLE (PKM ONLY) ---
        if (mode === 'PKM') {
            html += `
            <div class="coin-card">
                <div class="coin-header">
                    <span style="color:var(--coin-accent);"><i class="fas fa-users-cog"></i> PRODUKTIVITAS TENAGA KERJA</span>
                </div>
                <div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px;">
                    <table class="data-table-v10">
                        <thead>
                            <tr style="color:#8892b0; font-size:0.7rem;">
                                <th>JUMLAH TEAM</th>
                                <th style="text-align:center;">TRUCK</th>
                                <th style="text-align:right;">SPEED (T/H)</th>
                                <th style="text-align:right;">AVG LOAD</th>
                            </tr>
                        </thead>
                        <tbody>`;

            const sortedWorkers = Object.values(workers).sort((a, b) => b.count - a.count);
            if (sortedWorkers.length === 0) {
                html += `<tr><td colspan="3" style="text-align:center; color:#666;">TIDAK ADA DATA</td></tr>`;
            } else {
                sortedWorkers.forEach(w => {
                    const avgLoad = w.trucks > 0 ? (w.totalNetto / w.trucks) : 0;
                    const speed = w.totalDur > 0 ? ((w.totalNetto / 1000) / (w.totalDur / 60)) : 0;

                    html += `
                    <tr>
                        <td style="color:#fff; font-weight:bold;">${w.count} ORANG</td>
                        <td style="text-align:center; color:var(--neon-blue);">${w.trucks}</td>
                        <td style="text-align:right; color:var(--neon-green); font-weight:bold; font-family:'Orbitron';">${speed.toFixed(1)} T/H</td>
                        <td style="text-align:right; color:#aaa; font-size:0.8rem;">${(avgLoad / 1000).toFixed(1)} T</td>
                    </tr>`;
                });
            }

            html += `</tbody></table>
                    <div style="padding:10px; font-size:0.6rem; color:#666; font-style:italic; text-align:center;">
                        *Analisa berdasarkan jumlah tenaga bongkar (Col 23)
                    </div>
                </div>
            </div>`;
        }

        // --- RIGHT COLUMN: EVALUASI OPERASIONAL (BOTH) ---
        html += `
        <div class="coin-card" style="${mode === 'SBM' ? 'max-width:800px; margin:0 auto;' : ''}">
            <div class="coin-header">
                <span style="color:#00e5ff;"><i class="fas fa-search-dollar"></i> EVALUASI OPERASIONAL (${mode})</span>
            </div>
            <div style="color:#ccc; font-family:'Rajdhani'; font-size:0.95rem; line-height:1.6;">
                <ul style="padding-left:15px; list-style-type:none;">`;

        // POINT 1: CAPAIAN TERTINGGI (SPEED)
        if (maxOutput.val > 0) {
            const d = maxOutput.detail;
            html += `<li style="margin-bottom:15px;">
                <div style="color:var(--neon-green); font-weight:bold; margin-bottom:4px;">1. PERFORMA TERTINGGI (SPEED) (${new Date(maxOutput.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})</div>
                <table style="width:100%; font-size:0.8rem; background:rgba(0,255,100,0.05); border-radius:4px;">
                    <tr><td style="padding:4px 8px;">Speed Output:</td><td style="text-align:right; color:var(--neon-green); font-weight:bold;">${d.tonPerHour} Ton/Jam</td></tr>
                    <tr><td style="padding:4px 8px;">Duration Active:</td><td style="text-align:right; color:#fff;">${(d.activeMin / 60).toFixed(1)} Jam</td></tr>
                    <tr><td style="padding:4px 8px;">Total Volume:</td><td style="text-align:right; color:#fff;">${(d.netto / 1000).toFixed(0)} Ton</td></tr>
                    <tr><td style="padding:4px 8px;">Idle Time:</td><td style="text-align:right; color:#fff;">${(d.idleMin / 60).toFixed(1)} Jam</td></tr>
                </table>
                <div style="font-size:0.8rem; color:#aaa; margin-top:3px;"><i>"Pertahankan ritme kerja pada tanggal ini."</i></div>
            </li>`;
        }

        // POINT 2: CAPAIAN TERENDAH (SPEED)
        if (minOutput.val > 0) {
            const d = minOutput.detail;
            html += `<li style="margin-bottom:15px;">
                <div style="color:var(--neon-red); font-weight:bold; margin-bottom:4px;">2. PERFORMA TERENDAH (SPEED) (${new Date(minOutput.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})</div>
                <table style="width:100%; font-size:0.8rem; background:rgba(255,0,0,0.05); border-radius:4px;">
                    <tr><td style="padding:4px 8px;">Speed Output:</td><td style="text-align:right; color:var(--neon-red); font-weight:bold;">${d.tonPerHour} Ton/Jam</td></tr>
                    <tr><td style="padding:4px 8px;">Duration Active:</td><td style="text-align:right; color:#fff;">${(d.activeMin / 60).toFixed(1)} Jam</td></tr>
                    <tr><td style="padding:4px 8px;">Total Volume:</td><td style="text-align:right; color:#fff;">${(d.netto / 1000).toFixed(0)} Ton</td></tr>
                    <tr><td style="padding:4px 8px;">Idle Time:</td><td style="text-align:right; color:#fff;">${(d.idleMin / 60).toFixed(1)} Jam</td></tr>
                </table>
            </li>`;
        }

        // POINT 3: IDLE TERBANYAK
        if (maxIdle.val > 0) {
            html += `<li style="margin-bottom:15px;">
                <strong style="color:var(--neon-blue)">3. IDLE TERBANYAK:</strong> Terjadi pada <b>${new Date(maxIdle.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</b> dengan total <b>${(maxIdle.val / 60).toFixed(1)} Jam</b> (${maxIdle.val} menit).
                <br><span style="color:#888; font-size:0.85rem;">Indikasi antrian truck kurang optimal atau masalah internal jetty.</span>
            </li>`;
        }

        // POINT 4: OFF TERLAMA
        if (maxOff.val > 0) {
            html += `<li style="margin-bottom:15px;">
                <strong style="color:#aaa">4. OFF TERLAMA:</strong> Terjadi pada <b>${new Date(maxOff.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</b> selama <b>${(maxOff.val / 60).toFixed(1)} Jam</b>.
            </li>`;
        }

        // POINT 5: INTAKE COMPARISON (TILTING VS MANUAL)
        const man = subTypes.MANUAL || { trucks: 0, netto: 0, duration: 0 };
        const tilt = subTypes.TILTING || { trucks: 0, netto: 0, duration: 0 };
        const manProd = man.duration > 0 ? ((man.netto / 1000) / (man.duration / 60)) : 0;
        const tiltProd = tilt.duration > 0 ? ((tilt.netto / 1000) / (tilt.duration / 60)) : 0;

        html += `<li style="margin-bottom:15px;">
            <div style="color:var(--neon-gold); font-weight:bold; margin-bottom:4px;">5. KOMPARASI INTAKE (PRODUKTIVITAS)</div>
            <table style="width:100%; font-size:0.8rem; background:rgba(255,255,255,0.05); border-radius:4px;">
                <tr>
                    <td style="padding:4px;">MANUAL</td>
                    <td style="text-align:right;">${man.trucks} Trucks</td>
                    <td style="text-align:right; color:var(--neon-blue); font-weight:bold;">${manProd.toFixed(0)} T/H</td>
                </tr>
                <tr>
                    <td style="padding:4px;">TILTING</td>
                    <td style="text-align:right;">${tilt.trucks} Trucks</td>
                    <td style="text-align:right; color:var(--neon-blue); font-weight:bold;">${tiltProd.toFixed(0)} T/H</td>
                </tr>
            </table>
        </li>`;

        // POINT 6 & 7: DIRECT DEEP ANALYSIS (PKM ONLY)
        if (mode === 'PKM') {
            let directHtml = '';
            let bestType = { name: '-', speed: 0 };
            let worstType = { name: '-', speed: 9999 };
            let typeCount = 0;

            const dTypes = Object.entries(directTrucks);
            if (dTypes.length > 0) {
                directHtml += `<table style="width:100%; font-size:0.8rem; background:rgba(0,229,255,0.05); border-radius:4px;">`;
                dTypes.forEach(([type, stats]) => {
                    const dProd = stats.validDurCount > 0 ? ((stats.netto / 1000) / (stats.duration / 60)) : 0;
                    if (dProd > bestType.speed) bestType = { name: type, speed: dProd };
                    if (dProd < worstType.speed && dProd > 0) worstType = { name: type, speed: dProd };
                    typeCount++;

                    directHtml += `<tr>
                        <td style="padding:4px;">${type}</td>
                        <td style="text-align:right;">${stats.trucks} Trucks</td>
                        <td style="text-align:right; color:#00e5ff; font-weight:bold;">${dProd.toFixed(0)} T/H</td>
                     </tr>`;
                });
                directHtml += `</table>`;
            } else {
                directHtml = '<i style="color:#666">Tidak ada data Direct Gudang.</i>';
            }

            html += `<li style="margin-bottom:15px;">
                <div style="color:#00e5ff; font-weight:bold; margin-bottom:4px;">6. ANALISA DIRECT GUDANG (BY TRUCK)</div>
                ${directHtml}
            </li>`;

            let conclusion = "";
            if (bestType.speed > 0) {
                conclusion = `Tipe truck <b>${bestType.name}</b> mencatatkan produktivitas tertinggi sebesar <b style="color:var(--neon-green)">${bestType.speed.toFixed(0)} Ton/Jam</b>.`;
                if (typeCount > 1 && worstType.speed < 9999) {
                    conclusion += ` Lebih efisien dibandingkan ${worstType.name} (${worstType.speed.toFixed(0)} T/H). Disarankan memprioritaskan ${bestType.name} untuk Direct Gudang.`;
                } else {
                    conclusion += ` Disarankan mempertahankan alokasi unit tipe ini.`;
                }
            } else {
                conclusion = `Belum ada data yang cukup untuk menyimpulkan produktivitas per tipe truck.`;
            }

            html += `<li style="margin-bottom:15px;">
                <strong>7. KESIMPULAN DIRECT:</strong> 
                <span style="color:#aaa; font-style:italic;">${conclusion}</span>
            </li>`;
        }

        html += `</ul></div></div></div>`;

        container.innerHTML = html;
    },

    renderTruckAnalysis: function (path) {
        console.log("renderTruckAnalysis HIT for path:", path);
        // V11.2 Fix: Use specific source for direct path
        const truckData = (path === 'direct') ? (this.directGudangData && this.directGudangData.truckTypes ? this.directGudangData.truckTypes : {}) : (this.truckTypeData || {});
        console.log("truckData retrieved:", truckData, "keys:", Object.keys(truckData));
        const container = document.getElementById('truck-list-' + path);
        if (!container) {
            console.log("Container NOT FOUND for path:", path);
            return;
        }

        let html = "";
        const entries = Object.entries(truckData);

        if (entries.length === 0) {
            container.innerHTML = `<div style="color:#666; font-size:0.8rem; text-align:center; padding:20px;">TIDAK ADA DATA TRUCK (${path.toUpperCase()})</div>`;
            return;
        }

        entries.forEach(([type, stats]) => {
            const total = stats.trucks || 0;
            const validCount = stats.validDurCount || 0;
            const avgDur = validCount > 0 ? (stats.duration / validCount) : 0;
            const minDur = (stats.min === 9999) ? 0 : (stats.min || 0);
            const maxDur = stats.max || 0;
            const avgNetto = total > 0 ? (stats.netto / total) : 0;

            const accent = (path === 'intake') ? '#d500f9' : '#00e5ff';

            html += `
            <div style="background:rgba(255,255,255,0.03); border-left:4px solid ${accent}; padding:18px; border-radius:8px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                    <span style="font-family:'Orbitron'; font-weight:bold; color:#fff; font-size:1.1rem; letter-spacing:1px;">${type.toUpperCase()}</span>
                    <span style="color:${accent}; font-family:'Orbitron'; font-size:1.2rem; font-weight:bold;">${total} TRUCK</span>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1.15fr; gap:15px;">
                    <div>
                        <div style="color:#888; font-size:0.75rem; font-family:'Rajdhani'; font-weight:bold; text-transform:uppercase;">Durasi (Min/Avg/Max)</div>
                        <div style="color:#fff; font-family:'Orbitron'; font-size:0.95rem; margin-top:4px;">
                            ${Math.round(minDur)} <span style="color:#444; font-size:0.7rem;">/</span> ${Math.round(avgDur)} <span style="color:#444; font-size:0.7rem;">/</span> ${Math.round(maxDur)}
                            <span style="color:#666; font-size:0.65rem; font-family:'Rajdhani';">MIN</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:#888; font-size:0.75rem; font-family:'Rajdhani'; font-weight:bold; text-transform:uppercase;">Avg Netto / Truck</div>
                        <div style="color:#fff; font-family:'Orbitron'; font-size:1.1rem; margin-top:4px; font-weight:bold; color:${accent};">
                            ${Math.round(avgNetto).toLocaleString()} <span style="color:#666; font-size:0.75rem; font-family:'Rajdhani';">KG</span>
                        </div>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    },

    renderCalendar: function () {
        const grid = document.getElementById('calendar-grid-v15');
        const monthYearLabel = document.getElementById('cal-month-year');
        if (!grid) return;

        const month = parseInt(document.getElementById('select-month').value);
        const year = parseInt(document.getElementById('select-year').value);

        const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
        if (monthYearLabel) monthYearLabel.innerText = `${monthNames[month - 1]} ${year}`;

        grid.innerHTML = '';

        // Add Day Headers
        ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].forEach(day => {
            const div = document.createElement('div');
            div.className = 'cal-day-header';
            div.innerText = day;
            grid.appendChild(div);
        });

        const firstDay = new Date(year, month - 1, 1).getDay();
        const daysInMonth = new Date(year, month, 0).getDate();

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'cal-cell empty';
            grid.appendChild(empty);
        }

        // Data map for easy lookup
        const dataMap = {};
        if (this.aggregatedData) {
            this.aggregatedData.forEach(d => {
                const day = parseInt(d.date.split("-")[2]);
                dataMap[day] = d;
            });
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement('div');
            cell.className = 'cal-cell';
            const dayData = dataMap[d];

            if (dayData) {
                cell.classList.add('has-data');
                const ton = Math.round(dayData.netto / 1000);
                cell.innerHTML = `
                    <div class="cal-num">${d}</div>
                    <div class="cal-vol">${ton}T</div>
                `;
                cell.onclick = () => {
                    document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('active'));
                    cell.classList.add('active');
                    this.showDayDetail(dayData);
                };
            } else {
                cell.innerHTML = `<div class="cal-num">${d}</div>`;
            }
            grid.appendChild(cell);
        }

        // V16.1: Reset gauges until a day is picked
        ["1", "2", "3"].forEach(id => {
            if (this.charts[`gaugeS${id}`]) {
                this.charts[`gaugeS${id}`].destroy();
                delete this.charts[`gaugeS${id}`];
            }
            const el = document.getElementById(`chart-gauge-s${id}`);
            if (el) el.innerHTML = '<div style="font-size:0.6rem; color:#111; margin-top:10px;">-</div>';
        });
    },

    showDayDetail: function (dayData) {
        const content = document.getElementById('analysis-content-v15');
        const label = document.getElementById('selected-date-label');
        if (!content || !dayData) return;

        label.innerText = new Date(dayData.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

        const shifts = dayData.shiftData || {};
        const s1 = shifts["1"] || { sbm_ins: 0, sbm_dg: 0, pkm_ins: 0, pkm_dg: 0, active: 0, qc: 0, man: 0, idle: 0, off: 0, workers: 0, trucks: 0 };
        const s2 = shifts["2"] || { sbm_ins: 0, sbm_dg: 0, pkm_ins: 0, pkm_dg: 0, active: 0, qc: 0, man: 0, idle: 0, off: 0, workers: 0, trucks: 0 };
        const s3 = shifts["3"] || { sbm_ins: 0, sbm_dg: 0, pkm_ins: 0, pkm_dg: 0, active: 0, qc: 0, man: 0, idle: 0, off: 0, workers: 0, trucks: 0 };

        const fmt = (n) => (n === 0) ? "" : (n / 1000).toFixed(1) + " T";
        const fmtM = (n) => (n === 0) ? "" : Math.round(n) + " M";

        const hasNewBreakdown = (s1.wt !== undefined && (s1.wt + s1.bk + s1.qct + s1.mnv + s1.fn) > 0);

        // Identify active shifts
        const activeShifts = ["1", "2", "3"].filter(id => {
            const s = shifts[id];
            if (!s) return false;
            const hasVolume = (s.sbm_ins + s.sbm_dg + s.pkm_ins + s.pkm_dg) > 0;
            const hasDur = (s.active + s.idle + s.off) > 0;
            const hasRem = (s.remIdle && s.remIdle.length) || (s.remOff && s.remOff.length);
            return hasVolume || hasDur || hasRem || s.trucks > 0;
        });

        // If no shifts active, default to Shift 1 to avoid empty table
        const displayShifts = activeShifts.length > 0 ? activeShifts : ["1"];

        let html = `
        <table class="comparison-table">
            <thead>
                <tr>
                    <th style="text-align:left;">OPERATIONAL METRICS</th>
                    ${displayShifts.map(id => `<th>SHIFT ${id}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="metric-name">SBM Via Intake 71</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmt(shifts[id]?.sbm_ins || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name">SBM Direct Gudang</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmt(shifts[id]?.sbm_dg || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name">PKM Via Intake 71</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmt(shifts[id]?.pkm_ins || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name">PKM Direct Gudang</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmt(shifts[id]?.pkm_dg || 0)}</td>`).join("")}
                </tr>
                
                <tr style="height:10px;"><td colspan="${displayShifts.length + 1}"></td></tr>
                
                <tr>
                    <td class="metric-name highlight">1. Active Discharge</td>
                    ${displayShifts.map(id => `<td class="shift-val highlight">${fmtM(shifts[id]?.active || 0)}</td>`).join("")}
                </tr>
                ${hasNewBreakdown ? `
                <tr>
                    <td class="metric-name sub-metric">- Wait Panggil (M-L)</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmtM(shifts[id]?.wt || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name sub-metric">- Active Bongkar (N-M)</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmtM(shifts[id]?.bk || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name sub-metric">- QC Process (O-N)</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmtM(shifts[id]?.qct || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name sub-metric">- Manuver Akhir (P-O)</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmtM(shifts[id]?.mnv || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name sub-metric">- Finish Delay (Q-P)</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmtM(shifts[id]?.fn || 0)}</td>`).join("")}
                </tr>
                ` : `
                <tr>
                    <td class="metric-name sub-metric">- Net Bongkar</td>
                    ${displayShifts.map(id => {
            const s = shifts[id] || { active: 0, qc: 0, man: 0 };
            return `<td class="shift-val">${fmtM(s.active - s.qc - s.man)}</td>`;
        }).join("")}
                </tr>
                <tr>
                    <td class="metric-name sub-metric">- DT - QC Checked</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmtM(shifts[id]?.qc || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name sub-metric">- DT - Manuver Unit</td>
                    ${displayShifts.map(id => `<td class="shift-val">${fmtM(shifts[id]?.man || 0)}</td>`).join("")}
                </tr>
                `}
                <tr>
                    <td class="metric-name highlight">2. Idle Loss</td>
                    ${displayShifts.map(id => `<td class="shift-val highlight">${fmtM(shifts[id]?.idle || 0)}</td>`).join("")}
                </tr>
                <tr>
                    <td class="metric-name highlight">3. OFF / Set-up</td>
                    ${displayShifts.map(id => `<td class="shift-val highlight">${fmtM(shifts[id]?.off || 0)}</td>`).join("")}
                </tr>
                
                <tr class="total-row">
                    <td class="metric-name" style="color:var(--coin-accent);">TOTAL VOLUME</td>
                    ${displayShifts.map(id => {
            const s = shifts[id] || { sbm_ins: 0, sbm_dg: 0, pkm_ins: 0, pkm_dg: 0 };
            return `<td class="shift-val" style="color:var(--coin-accent);">${fmt(s.sbm_ins + s.sbm_dg + s.pkm_ins + s.pkm_dg)}</td>`;
        }).join("")}
                </tr>
                <tr class="total-row">
                    <td class="metric-name">TRUCK COUNT</td>
                    ${displayShifts.map(id => `<td class="shift-val">${shifts[id]?.trucks || ""}</td>`).join("")}
                </tr>
                <tr class="total-row">
                    <td class="metric-name">WORKERS</td>
                    ${displayShifts.map(id => {
            const s = shifts[id] || { workerRows: 0, workers: 0 };
            return `<td class="shift-val">${s.workerRows > 0 ? (s.workers / s.workerRows).toFixed(1) : (s.workers || "")}</td>`;
        }).join("")}
                </tr>
                ${hasNewBreakdown ? `
                <tr class="total-row">
                    <td class="metric-name" style="font-size:0.65rem;">KRANI BONGKAR</td>
                    ${displayShifts.map(id => `<td class="shift-val" style="font-size:0.7rem; color:#888;">${shifts[id]?.krani?.length ? shifts[id].krani.join(", ") : ""}</td>`).join("")}
                </tr>
                <tr class="total-row">
                    <td class="metric-name" style="font-size:0.65rem;">OPERATOR SCADA</td>
                    ${displayShifts.map(id => `<td class="shift-val" style="font-size:0.7rem; color:#888;">${shifts[id]?.scada?.length ? shifts[id].scada.join(", ") : ""}</td>`).join("")}
                </tr>
                ` : ""}
            </tbody>
        </table>`;

        // Add Remarks if any
        let remHtml = "";
        const formatDur = (m) => {
            if (m < 60) return Math.round(m) + " mnt";
            const h = Math.floor(m / 60);
            const mm = Math.round(m % 60);
            return h + " jam" + (mm > 0 ? " " + mm + " mnt" : "");
        };

        const formatTime = (epoch) => {
            if (!epoch) return "??:??";
            const date = new Date(epoch);
            return date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');
        };

        displayShifts.forEach(id => {
            const s = shifts[id];
            const rawItems = [];
            if (s.remIdle) s.remIdle.forEach(r => rawItems.push({ type: 'IDLE', ...r, color: '#888', icon: 'fa-clock' }));
            if (s.remOff) s.remOff.forEach(r => rawItems.push({ type: 'OFF', ...r, color: '#ff003c', icon: 'fa-power-off' }));

            if (rawItems.length > 0) {
                // Consolidation Logic
                const grouped = {};
                rawItems.forEach(it => {
                    const key = `${it.type}_${it.t}`;
                    if (!grouped[key]) grouped[key] = { ...it, totalDur: 0, count: 0, intervals: [] };
                    grouped[key].totalDur += it.d;
                    grouped[key].count++;
                    if (it.s && it.e) grouped[key].intervals.push({ s: it.s, e: it.e });
                });

                remHtml += `<div style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.02); border-radius:6px; font-size:0.75rem;">
                    <div style="font-family:'Orbitron'; color:var(--coin-accent); margin-bottom:5px; font-size:0.7rem;">SHIFT ${id} REMARKS DETAIL</div>
                    <table style="width:100%; border-collapse:collapse;">
                        ${Object.values(grouped).map(g => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:4px 0; color:${g.color}; vertical-align:top; width:120px;">
                                <i class="fas ${g.icon}"></i> <b>${formatDur(g.totalDur)}</b>
                            </td>
                            <td style="padding:4px 0; color:#ddd;">
                                ${g.t} ${g.count > 1 ? `<span style="color:#666;">(${g.count}x)</span>` : ""}
                                ${g.count === 1 && g.intervals.length ? `<div style="font-size:0.65rem; color:#888;">${formatTime(g.intervals[0].s)} - ${formatTime(g.intervals[0].e)}</div>` : ""}
                            </td>
                        </tr>
                        `).join("")}
                    </table>
                    <div style="margin-top:8px; border-top:1px dashed #444; padding-top:4px; font-size:0.7rem; color:#aaa; text-align:right;">
                        TOTAL LOSS (S${id}): <span style="color:var(--coin-accent);">${formatDur((s.idle || 0) + (s.off || 0))}</span>
                    </div>
                </div>`;
            }
        });

        if (remHtml) html += remHtml;

        content.innerHTML = html;
        content.scrollTop = 0;

        // V16: Render Mini Speedometers
        this.renderShiftGauges(shifts);
    },

    renderShiftGauges: function (shifts) {
        const ids = ["1", "2", "3"];
        ids.forEach(id => {
            const targetElId = `chart-gauge-s${id}`;
            const el = document.getElementById(targetElId);
            if (!el) return;

            const s = shifts[id] || { active: 0, idle: 0, off: 0, wt: 0, bk: 0, qct: 0, mnv: 0, fn: 0 };
            const hasNew = (s.wt !== undefined && (s.wt + s.bk + s.qct + s.mnv + s.fn) > 0);

            // Calculate percentages based on 480 min
            const activePct = Math.min(100, (s.active / 480) * 100);
            const idlePct = Math.min(100, (s.idle / 480) * 100);
            const offPct = Math.min(100, (s.off / 480) * 100);

            if (activePct + idlePct + offPct === 0) {
                if (this.charts[`gaugeS${id}`]) {
                    this.charts[`gaugeS${id}`].destroy();
                    delete this.charts[`gaugeS${id}`];
                }
                el.innerHTML = '<div style="font-size:0.5rem; color:#1a1a1a; margin-top:20px; font-family:\'Orbitron\'">OFFLINE</div>';
                return;
            }

            let series = [activePct, idlePct, offPct];
            let colors = ['#bc13fe', '#888888', '#ff003c'];
            let labels = ['Active', 'Idle', 'Off'];

            if (hasNew) {
                series = [
                    Math.min(100, (s.bk / 480) * 100),  // Active Bongkar
                    Math.min(100, (s.wt / 480) * 100),  // Panggil
                    Math.min(100, (s.qct / 480) * 100), // QC
                    Math.min(100, (s.mnv / 480) * 100), // Manuver
                    Math.min(100, (s.idle / 480) * 100),
                    Math.min(100, (s.off / 480) * 100)
                ];
                colors = ['#00ff88', '#00f3ff', '#ffcc00', '#bc13fe', '#888888', '#ff003c'];
                labels = ['Bongkar', 'Wait', 'QC', 'Man', 'Idle', 'Off'];
            }

            const options = {
                series: series,
                chart: {
                    type: 'radialBar',
                    height: 180,
                    offsetY: -10,
                    sparkline: { enabled: true }
                },
                plotOptions: {
                    radialBar: {
                        startAngle: -90,
                        endAngle: 90,
                        hollow: { size: '30%' },
                        track: {
                            background: "rgba(255,255,255,0.02)",
                            margin: 2
                        },
                        dataLabels: {
                            name: { show: false },
                            value: {
                                offsetY: -2,
                                fontSize: '12px',
                                fontWeight: '700',
                                color: '#fff',
                                formatter: function (val, opt) {
                                    return Math.round(s.active) + "m";
                                }
                            }
                        }
                    }
                },
                colors: colors,
                stroke: { lineCap: 'round' },
                labels: labels,
                legend: {
                    show: hasNew,
                    position: 'bottom',
                    fontSize: '8px',
                    fontFamily: 'Rajdhani',
                    fontWeight: 600,
                    labels: { colors: '#888' },
                    markers: { width: 6, height: 6 },
                    itemMargin: { horizontal: 5, vertical: 0 }
                }
            };

            // Cleanup & Render
            if (this.charts[`gaugeS${id}`]) this.charts[`gaugeS${id}`].destroy();
            this.charts[`gaugeS${id}`] = new ApexCharts(el, options);
            this.charts[`gaugeS${id}`].render();
        });
    },

    closeModal: function () { document.getElementById('modal-drill').style.display = 'none'; }
};
