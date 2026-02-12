const BKKDowntimeApp = {
    data: [],
    filterMode: 'overall', // overall, material
    selectedMaterial: '',
    timeView: 'daily', // daily, weekly, monthly
    charts: {},
    processedData: {},
    availableMaterials: [],

    init: async function () {
        console.log("Initializing CORE COMMAND V3.0...");
        await this.fetchData();
        // Auto refresh every 5 minutes
        setInterval(() => this.fetchData(), 300000);
    },

    fetchData: function () {
        return new Promise((resolve) => {
            const cb = 'bkk_cmd_' + Math.round(Math.random() * 100000);
            window[cb] = (result) => {
                delete window[cb];
                const scriptNode = document.getElementById(cb);
                if (scriptNode) scriptNode.remove();

                if (result && result.data) {
                    this.data = this.preprocessData(result.data);
                    this.extractMaterials();
                    this.processLogics();
                    this.renderDashboard();
                    document.getElementById('sync-label').innerText = `SYNCED: ${new Date().toLocaleTimeString()}`;
                } else {
                    console.error("Invalid data format received:", result);
                    document.getElementById('sync-label').innerText = "DATA ERROR";
                }
                document.getElementById('loading').classList.add('hidden');
                resolve();
            };

            const sep = CONFIG.BKK_DOWNTIME_API_URL.includes('?') ? '&' : '?';
            const script = document.createElement('script');
            script.id = cb;
            script.src = `${CONFIG.BKK_DOWNTIME_API_URL}${sep}callback=${cb}&t=${new Date().getTime()}`;
            script.onerror = () => {
                console.error("JSONP Fetch Failed");
                document.getElementById('sync-label').innerText = "SYNC FAILED";
                document.getElementById('loading').classList.add('hidden');
                resolve();
            };
            document.body.appendChild(script);
        });
    },

    preprocessData: function (raw) {
        return raw.map(d => {
            const dateObj = new Date(d.tanggal);
            const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;

            return {
                ...d,
                dateObj: validDate,
                dateStr: validDate.toISOString().split('T')[0],
                weekStr: this.getWeekStr(validDate),
                monthStr: validDate.toISOString().substring(0, 7),
                nettoVal: parseFloat(d.netto) || 0,
                ptMin: this.parseTimeToMinutes(d.pt_total),
                pbMin: this.parseTimeToMinutes(d.pb_total),
                manuverMin: this.parseTimeToMinutes(d.manuver_total),
                qcMin: this.parseTimeToMinutes(d.qc_total),
                cycleMin: this.parseTimeToMinutes(d.pt_total) + this.parseTimeToMinutes(d.pb_total) +
                    this.parseTimeToMinutes(d.manuver_total) + this.parseTimeToMinutes(d.qc_total)
            };
        });
    },

    extractMaterials: function () {
        const matSet = new Set();
        this.data.forEach(d => { if (d.material) matSet.add(d.material.trim().toUpperCase()); });
        this.availableMaterials = Array.from(matSet).sort();

        const select = document.getElementById('select-material');
        const currentVal = select.value;
        select.innerHTML = '<option value="">SELECT MATERIAL...</option>';
        this.availableMaterials.forEach(m => {
            select.innerHTML += `<option value="${m}">${m}</option>`;
        });
        select.value = currentVal;
    },

    getWeekStr: function (date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
    },

    processLogics: function () {
        // Filter data based on mode
        let filtered = this.data;
        if (this.filterMode === 'material' && this.selectedMaterial) {
            filtered = this.data.filter(d => (d.material || "").toUpperCase() === this.selectedMaterial);
        }

        const groups = { daily: {}, weekly: {}, monthly: {} };

        filtered.forEach(d => {
            const keys = { daily: d.dateStr, weekly: d.weekStr, monthly: d.monthStr };
            const key = keys[this.timeView];

            if (!groups[this.timeView][key]) {
                groups[this.timeView][key] = {
                    key: key,
                    nettoTotal: 0,
                    truckCount: 0,
                    ptTotal: 0, pbTotal: 0, manuverTotal: 0, qcTotal: 0, cycleTotal: 0,
                    intakeNetto: 0, directNetto: 0,
                    items: []
                };
            }

            const g = groups[this.timeView][key];
            g.nettoTotal += d.nettoVal;
            g.truckCount++;
            g.ptTotal += d.ptMin;
            g.pbTotal += d.pbMin;
            g.manuverTotal += d.manuverMin;
            g.qcTotal += d.qcMin;
            g.cycleTotal += d.cycleMin;
            g.items.push(d);

            const type = (d.intake_direct || "").toUpperCase();
            if (type.includes("INTAKE")) g.intakeNetto += d.nettoVal;
            else if (type.includes("DIRECT")) g.directNetto += d.nettoVal;
        });

        this.processedData = groups[this.timeView];
        this.filteredData = filtered;
    },

    setFilterMode: function (mode) {
        this.filterMode = mode;
        document.getElementById('btn-overall').classList.toggle('active', mode === 'overall');
        document.getElementById('btn-material').classList.toggle('active', mode === 'material');
        document.getElementById('material-filter-container').style.display = mode === 'material' ? 'block' : 'none';

        if (mode === 'overall') {
            this.selectedMaterial = '';
            document.getElementById('select-material').value = '';
        }

        this.processLogics();
        this.renderDashboard();
    },

    applyMaterialFilter: function () {
        this.selectedMaterial = document.getElementById('select-material').value.toUpperCase();
        this.processLogics();
        this.renderDashboard();
    },

    setTimeView: function (view) {
        this.timeView = view;
        document.getElementById('btn-daily').classList.toggle('active', view === 'daily');
        document.getElementById('btn-weekly').classList.toggle('active', view === 'weekly');
        document.getElementById('btn-monthly').classList.toggle('active', view === 'monthly');

        this.processLogics();
        this.renderDashboard();
    },

    renderDashboard: function () {
        this.renderKPIs();
        this.renderVolumeTrend();
        this.renderDistribution();
        this.renderProcessCharts();
    },

    renderKPIs: function () {
        if (this.filteredData.length === 0) {
            ['val-netto', 'val-trucks', 'val-cycle', 'val-efficiency'].forEach(id => document.getElementById(id).innerText = '-');
            return;
        }

        const totals = this.filteredData.reduce((acc, d) => {
            acc.netto += d.nettoVal;
            acc.cycle += d.cycleMin;
            return acc;
        }, { netto: 0, cycle: 0 });

        const count = this.filteredData.length;
        document.getElementById('val-netto').innerText = Math.round(totals.netto).toLocaleString();
        document.getElementById('val-trucks').innerText = count;
        document.getElementById('val-cycle').innerText = this.formatMinutesToTime(totals.cycle / count);

        // Efficiency Logic: Assume < 45 min per truck cycle is 100% efficient
        const avgCycle = totals.cycle / count;
        const efficiency = Math.max(0, Math.min(100, (45 / avgCycle) * 100));
        document.getElementById('val-efficiency').innerText = `${Math.round(efficiency)}%`;
    },

    renderVolumeTrend: function () {
        const sortedKeys = Object.keys(this.processedData).sort().slice(-20);
        const seriesData = sortedKeys.map(k => Math.round(this.processedData[k].nettoTotal));

        const options = {
            series: [{ name: 'NETTO (KG)', data: seriesData }],
            chart: {
                type: 'area',
                height: 380,
                toolbar: { show: false },
                zoom: { enabled: false },
                events: {
                    dataPointSelection: (event, chartContext, config) => {
                        const key = sortedKeys[config.dataPointIndex];
                        this.showDrillDown(key, this.processedData[key]);
                    }
                }
            },
            dataLabels: { enabled: false },
            colors: ['#00f3ff'],
            fill: {
                type: 'gradient',
                gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.1, stops: [0, 90, 100] }
            },
            stroke: { curve: 'smooth', width: 3 },
            xaxis: {
                categories: sortedKeys,
                labels: { style: { colors: '#64748b', fontSize: '10px', fontFamily: 'Orbitron' } }
            },
            yaxis: {
                labels: {
                    style: { colors: '#64748b' },
                    formatter: val => (val / 1000).toFixed(0) + 'T'
                }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            tooltip: { theme: 'dark' }
        };

        if (this.charts.volume) this.charts.volume.destroy();
        this.charts.volume = new ApexCharts(document.querySelector("#chart-main-volume"), options);
        this.charts.volume.render();
    },

    renderDistribution: function () {
        const totals = this.filteredData.reduce((acc, d) => {
            const type = (d.intake_direct || "").toUpperCase();
            if (type.includes("INTAKE")) acc.intake += d.nettoVal;
            else if (type.includes("DIRECT")) acc.direct += d.nettoVal;
            return acc;
        }, { intake: 0, direct: 0 });

        const options = {
            series: [Math.round(totals.intake), Math.round(totals.direct)],
            labels: ['INTAKE', 'DIRECT'],
            chart: { type: 'donut', height: 380 },
            colors: ['#00f3ff', '#ffcc00'],
            stroke: { show: false },
            legend: { position: 'bottom', labels: { colors: '#fff' }, fontFamily: 'Orbitron' },
            dataLabels: { enabled: true, formatter: val => val.toFixed(1) + "%" },
            plotOptions: { pie: { donut: { size: '75%', background: 'transparent' } } },
            tooltip: { theme: 'dark', y: { formatter: val => val.toLocaleString() + ' KG' } }
        };

        if (this.charts.dist) this.charts.dist.destroy();
        this.charts.dist = new ApexCharts(document.querySelector("#chart-distribution"), options);
        this.charts.dist.render();
    },

    renderProcessCharts: function () {
        const count = this.filteredData.length;
        if (count === 0) return;

        const avg = this.filteredData.reduce((acc, d) => {
            acc.pt += d.ptMin; acc.pb += d.pbMin; acc.man += d.manuverMin; acc.qc += d.qcMin;
            return acc;
        }, { pt: 0, pb: 0, man: 0, qc: 0 });

        const optionsA = {
            series: [{ name: 'Avg Duration', data: [(avg.pt / count).toFixed(1), (avg.pb / count).toFixed(1)] }],
            chart: { type: 'bar', height: 280, toolbar: { show: false } },
            plotOptions: { bar: { columnWidth: '45%', distributed: true, borderRadius: 6 } },
            colors: ['#00f3ff', '#00ff88'],
            xaxis: { categories: ['TIMBANG (PT)', 'BONGKAR (PB)'], labels: { style: { colors: '#fff', fontFamily: 'Orbitron', fontSize: '9px' } } },
            yaxis: { title: { text: 'Minutes', style: { color: '#666' } }, labels: { style: { colors: '#666' } } },
            legend: { show: false },
            tooltip: { theme: 'dark' }
        };

        const optionsB = {
            series: [{ name: 'Avg Duration', data: [(avg.man / count).toFixed(1), (avg.qc / count).toFixed(1)] }],
            chart: { type: 'bar', height: 280, toolbar: { show: false } },
            plotOptions: { bar: { columnWidth: '45%', distributed: true, borderRadius: 6 } },
            colors: ['#bc13fe', '#ff003c'],
            xaxis: { categories: ['MANUVER', 'QC DOWNTIME'], labels: { style: { colors: '#fff', fontFamily: 'Orbitron', fontSize: '9px' } } },
            yaxis: { title: { text: 'Minutes', style: { color: '#666' } }, labels: { style: { colors: '#666' } } },
            legend: { show: false },
            tooltip: { theme: 'dark' }
        };

        if (this.charts.procA) this.charts.procA.destroy();
        if (this.charts.procB) this.charts.procB.destroy();
        this.charts.procA = new ApexCharts(document.querySelector("#chart-process-a"), optionsA);
        this.charts.procB = new ApexCharts(document.querySelector("#chart-process-b"), optionsB);
        this.charts.procA.render();
        this.charts.procB.render();
    },

    showDrillDown: function (label, group) {
        const modal = document.getElementById('modal-drill');
        const header = document.getElementById('modal-header');
        const body = document.getElementById('modal-content-body');

        modal.style.display = 'flex';
        header.innerText = `LOGS: ${label} (${Math.round(group.nettoTotal).toLocaleString()} KG)`;

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>TRUCK</th>
                        <th>MATERIAL</th>
                        <th>NETTO (KG)</th>
                        <th>INTAKE/DIR</th>
                        <th>CYCLE</th>
                        <th>PB BONGKAR</th>
                    </tr>
                </thead>
                <tbody>
        `;

        group.items.forEach(d => {
            html += `
                <tr class="tr-hover">
                    <td style="font-weight:700">${d.nopol}</td>
                    <td style="color:var(--neon-gold)">${d.material}</td>
                    <td style="color:var(--neon-blue)">${Math.round(d.nettoVal).toLocaleString()}</td>
                    <td>${d.intake_direct}</td>
                    <td style="color:var(--neon-green)">${this.formatMinutesToTime(d.cycleMin)}</td>
                    <td style="color:var(--neon-red)">${d.pb_total || '-'}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        body.innerHTML = html;
    },

    closeModal: function () {
        document.getElementById('modal-drill').style.display = 'none';
    },

    parseTimeToMinutes: function (timeStr) {
        if (!timeStr || timeStr === "-") return 0;
        const parts = timeStr.toString().split(':');
        if (parts.length === 3) return (parseInt(parts[0]) * 60) + parseInt(parts[1]) + (parseInt(parts[2]) / 60);
        if (parts.length === 2) return parseInt(parts[0]) + (parseInt(parts[1]) / 60);
        return parseFloat(timeStr) || 0;
    },

    formatMinutesToTime: function (totalMin) {
        if (isNaN(totalMin) || totalMin === 0) return "00:00";
        const mins = Math.floor(totalMin);
        const secs = Math.round((totalMin - mins) * 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
};

window.onload = () => BKKDowntimeApp.init();
