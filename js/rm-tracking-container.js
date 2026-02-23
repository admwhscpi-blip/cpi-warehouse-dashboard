/**
 * RM TRACKING CONTAINER ENGINE
 * Visuals: Cyber Luxury / High-End Analytics
 * Description: Dedicated tracker for Container trucks (>= 19 Feb 2026)
 */

const TrackingApp = {
    allData: [],
    containerData: [],
    charts: {},
    currentYear: new Date().getFullYear(),
    activeDate: null,

    init: function () {
        console.log("Tracking Container Engine Starting...");
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Orbitron', sans-serif";
        Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';

        this.initYearSelect();
        this.fetchData();
    },

    initYearSelect: function () {
        const select = document.getElementById('year-filter');
        select.innerHTML = '';
        let current = new Date().getFullYear();
        // Since it starts from 2026-02-19, minimum is 2026
        for (let y = current + 1; y >= 2026; y--) {
            let opt = document.createElement('option');
            opt.value = y;
            opt.text = y;
            select.appendChild(opt);
        }
        this.currentYear = parseInt(select.value);
        document.getElementById('header-year-display').innerText = this.currentYear;
    },

    handleYearChange: function (year) {
        this.currentYear = parseInt(year);
        document.getElementById('header-year-display').innerText = this.currentYear;
        this.renderCalendars();
        this.activeDate = null;
        this.renderDailyPanel(null); // Clear panel
    },

    fetchData: async function () {
        const statusText = document.getElementById('system-status');
        if (statusText) statusText.parentElement.innerHTML = '<div class="status-dot" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></div> <span id="system-status">SYNCING...</span>';

        try {
            // Fetch from New API (Since data is only >= 19 Feb 2026)
            const res = await fetch(CONFIG.ANALYTICS_V2_URL).then(r => r.json());
            if (res && res.template) {
                this.allData = res.template;
                this.processContainerData();
                this.renderCalendars();

                if (statusText) statusText.parentElement.innerHTML = '<div class="status-dot"></div> <span id="system-status">SYSTEM ONLINE</span>';
            } else {
                throw new Error("Invalid API Data");
            }
        } catch (err) {
            console.error("FETCH ERROR:", err);
            if (statusText) statusText.parentElement.innerHTML = '<div class="status-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></div> <span id="system-status">CONNECTION ERROR</span>';
        }
    },

    normalizeDate: function (dateStr) {
        if (!dateStr) return null;
        try {
            let d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return d.toISOString().split('T')[0];
        } catch (e) { return null; }
    },

    processContainerData: function () {
        // Filter: >= 19 Feb 2026 AND JENIS_TRUCK contains "CONTAINER"
        this.containerData = this.allData.filter(row => {
            let tglStr = this.normalizeDate(row['TANGGAL']);
            if (!tglStr || tglStr < '2026-02-19') return false;

            // Note: The Apps Script needs to expose JENIS_TRUCK (Col H)
            let truckType = String(row['JENIS_TRUCK'] || row['JENIS_RM'] || '').toUpperCase();
            if (truckType.includes('CONTAINER')) {
                return true;
            }
            return false;
        });

        // Group by Date for fast lookup
        this.dataByDate = {};
        this.containerData.forEach(row => {
            let d = this.normalizeDate(row['TANGGAL']);
            if (!this.dataByDate[d]) this.dataByDate[d] = [];
            this.dataByDate[d].push(row);
        });
    },

    // ==========================================
    // CALENDAR 1 YEAR GENERATION
    // ==========================================
    renderCalendars: function () {
        const container = document.getElementById('year-calendar-container');
        container.innerHTML = '';

        const year = this.currentYear;
        const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

        for (let m = 0; m < 12; m++) {
            let monthBlock = document.createElement('div');
            monthBlock.className = 'month-block';

            let monthName = document.createElement('div');
            monthName.className = 'month-name';
            monthName.innerText = monthNames[m];
            monthBlock.appendChild(monthName);

            let grid = document.createElement('div');
            grid.className = 'days-grid';

            // Headers
            ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(day => {
                let dHeader = document.createElement('div');
                dHeader.className = 'day-header';
                dHeader.innerText = day;
                grid.appendChild(dHeader);
            });

            // Days padding
            let firstDay = new Date(year, m, 1).getDay();
            let daysInMonth = new Date(year, m + 1, 0).getDate();

            for (let i = 0; i < firstDay; i++) {
                let empty = document.createElement('div');
                empty.className = 'day-cell empty';
                grid.appendChild(empty);
            }

            for (let d = 1; d <= daysInMonth; d++) {
                let cell = document.createElement('div');
                cell.className = 'day-cell';
                let isoDate = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                cell.innerText = d;
                cell.dataset.date = isoDate;

                // Highlight if data exists
                if (this.dataByDate && this.dataByDate[isoDate] && this.dataByDate[isoDate].length > 0) {
                    cell.classList.add('has-data');
                    let dot = document.createElement('div');
                    dot.className = 'day-dot';
                    cell.appendChild(dot);
                }

                // Skip disabled dates before 19 Feb 2026
                if (isoDate < '2026-02-19') {
                    cell.style.opacity = '0.2';
                    cell.style.cursor = 'not-allowed';
                } else {
                    cell.onclick = (e) => this.selectDate(isoDate, e.currentTarget);
                }

                grid.appendChild(cell);
            }

            monthBlock.appendChild(grid);
            container.appendChild(monthBlock);
        }

        // ===================================
        // ADDITION: RENDER YEARLY CHARTS
        // ===================================
        document.getElementById('chart-grid').style.display = 'grid'; // Ensure it's visible
        let yearData = this.containerData.filter(row => {
            let t = this.normalizeDate(row['TANGGAL']);
            return t && t.startsWith(this.currentYear.toString());
        });
        this.renderTimeComparisonChart(yearData);

    },

    selectDate: function (isoDate, cellElement) {
        // Remove active class from all
        document.querySelectorAll('.day-cell.active').forEach(el => el.classList.remove('active'));
        // Add to selected
        if (cellElement) cellElement.classList.add('active');

        this.activeDate = isoDate;
        this.renderDailyPanel(isoDate);
    },

    // ==========================================
    // DAILY ANALYTICS PANEL
    // ==========================================
    renderDailyPanel: function (isoDate) {
        const metricsContainer = document.getElementById('daily-metrics-container');
        const dataView = document.getElementById('daily-data-view');
        const dateLabel = document.getElementById('selected-date-label');
        const chartGrid = document.getElementById('chart-grid'); // Keep this to hide it

        if (!isoDate) {
            metricsContainer.style.display = 'flex';
            dataView.style.display = 'none';
            chartGrid.style.display = 'none'; // Hide charts when no date is selected
            dateLabel.innerText = 'SELECT A DATE ON THE LEFT';
            return;
        }

        // Format label
        let dObj = new Date(isoDate);
        dateLabel.innerText = dObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();

        const todayData = (this.dataByDate && this.dataByDate[isoDate]) ? this.dataByDate[isoDate] : [];

        if (todayData.length === 0) {
            metricsContainer.style.display = 'flex';
            dataView.style.display = 'none';
            chartGrid.style.display = 'none'; // Hide charts when no data for the day
            metricsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i><br>
                    <span style="font-size:0.8rem; letter-spacing:2px; display:block; margin-bottom:5px;">NO CONTAINER ACTIVITY</span>
                    <span style="font-size:0.65rem;">Tidak ada data bongkar kontainer terekam pada tanggal ini.</span>
                </div>
            `;
            return;
        }

        // We have data! Switch views.
        metricsContainer.style.display = 'none';
        dataView.style.display = 'flex';
        chartGrid.style.display = 'none'; // Hide charts for daily panel

        document.getElementById('log-count').innerText = `${todayData.length} RECORDS`;

        this.calculateMetrics(todayData);
        this.renderTrackingLogs(todayData);
    },

    parseTime: function (timeStr) {
        if (!timeStr || timeStr === '') return null;
        let parts = timeStr.toString().split(':');
        if (parts.length < 2) return null;
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return null;
        return (h * 60) + m; // Total minutes from midnight
    },

    calculateMetrics: function (data) {
        let total = data.length;
        let sumBongkar = 0; let countBongkar = 0;
        let countInap = 0; let countTidakInap = 0;

        data.forEach(row => {
            // Durasi Bongkar
            let dur = Number(row['DURASI_BONGKAR']);
            if (!isNaN(dur) && dur > 0) { sumBongkar += dur; countBongkar++; }

            // Hitungan Inap
            let tglBongkarRaw = row['TANGGAL'] || '';
            let tglBongkar = tglBongkarRaw.substring(0, 10);
            let arrDateRaw = row['ARRIVAL_DATE'] || tglBongkarRaw;
            let arrDate = arrDateRaw.substring(0, 10);

            let arrTime = row['ARRIVAL_TIME'] || row['PB_START'] || '--:--';
            let finishTime = row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '--:--';

            let arrStr = arrTime !== '--:--' ? arrTime : '00:00';
            let finStr = finishTime !== '--:--' ? finishTime : '00:00';

            try {
                let dArr = new Date(arrDate);
                if (arrStr.includes(':')) {
                    let pts = arrStr.split(':');
                    dArr.setHours(parseInt(pts[0], 10), parseInt(pts[1], 10), 0);
                }

                let dFin = new Date(tglBongkar);
                if (finStr.includes(':')) {
                    let pts = finStr.split(':');
                    dFin.setHours(parseInt(pts[0], 10), parseInt(pts[1], 10), 0);
                }

                // If cross midnight same day
                if (dFin < dArr && tglBongkar === arrDate) {
                    dFin.setDate(dFin.getDate() + 1);
                }

                let diffMs = dFin.getTime() - dArr.getTime();
                let durH = diffMs / (1000 * 60 * 60);

                if (durH >= 24) {
                    countInap++;
                } else if (durH >= 0) {
                    countTidakInap++;
                }
            } catch (e) { }
        });

        const avgBongkar = countBongkar > 0 ? Math.round(sumBongkar / countBongkar) : 0;
        let avgH = Math.floor(avgBongkar / 60);
        let avgM = Math.floor(avgBongkar % 60);
        let avgDurHtml = `${avgH}<span style="font-size:0.5em; color:var(--text-muted); margin:0 2px;">h</span>${avgM}<span style="font-size:0.5em; color:var(--text-muted); margin-left:2px;">m</span>`;

        // Update DOM
        this.animateValue('kpi-total-cont', 0, total, 1000, '');
        const domAvgDur = document.getElementById('kpi-avg-dur');
        if (domAvgDur) domAvgDur.innerHTML = avgDurHtml;
        this.animateValue('kpi-inap', 0, countInap, 1000, '');
        this.animateValue('kpi-tidak-inap', 0, countTidakInap, 1000, '');
    },

    animateValue: function (id, start, end, duration, suffix = "") {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            let val = Math.floor(progress * (end - start) + start);
            obj.innerHTML = val.toLocaleString() + suffix;
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    },

    renderTimeComparisonChart: function (data) {
        const ctx = document.getElementById('timeComparisonChart').getContext('2d');
        if (this.charts['timeComp']) this.charts['timeComp'].destroy();

        // Custom plugin for Chart Glow effect
        const glowPlugin = {
            id: 'glow',
            beforeDraw: chart => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = 'rgba(6, 182, 212, 0.5)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            },
            afterDraw: chart => {
                chart.ctx.restore();
            }
        };

        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        let monthlyScalling = Array(12).fill(0);
        let monthlyTimStart = Array(12).fill(0);
        let monthlyBongkar = Array(12).fill(0);
        let monthlyCounts = Array(12).fill(0);

        data.forEach(row => {
            let tglRaw = row['TANGGAL'] || '';
            if (!tglRaw || tglRaw === '') return;
            let d = new Date(tglRaw);
            if (isNaN(d.getTime())) return;
            let m = d.getMonth();

            let durBongkar = Number(row['DURASI_BONGKAR']) || 0;
            let tArr = this.parseTime(row['ARRIVAL_TIME'] || row['PB_START']);
            let tQc = this.parseTime(row['QC_SAMPLING_1'] || row['TUNGGU_QC']); // Durasi Scalling 1
            let tTim = this.parseTime(row['TIME_TIMBANG_MASUK']);
            let tStart = this.parseTime(row['START_BONGKAR'] || row['PANGGIL_BONGKAR']);

            let durScalling = (tArr !== null && tQc !== null) ? (tQc - tArr < 0 ? tQc - tArr + 1440 : tQc - tArr) : 0;
            let durTimStart = (tTim !== null && tStart !== null) ? (tStart - tTim < 0 ? tStart - tTim + 1440 : tStart - tTim) : 0;

            monthlyScalling[m] += durScalling;
            monthlyTimStart[m] += durTimStart;
            monthlyBongkar[m] += durBongkar;
            monthlyCounts[m]++;
        });

        let dScallingAvg = [];
        let dTimStartAvg = [];
        let dBongkarAvg = [];

        for (let i = 0; i < 12; i++) {
            if (monthlyCounts[i] > 0) {
                dScallingAvg.push(Math.round(monthlyScalling[i] / monthlyCounts[i]));
                dTimStartAvg.push(Math.round(monthlyTimStart[i] / monthlyCounts[i]));
                dBongkarAvg.push(Math.round(monthlyBongkar[i] / monthlyCounts[i]));
            } else {
                dScallingAvg.push(0);
                dTimStartAvg.push(0);
                dBongkarAvg.push(0);
            }
        }

        // Gradients for Time Comparison Chart
        let gradQC = ctx.createLinearGradient(0, 0, 0, 400);
        gradQC.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
        gradQC.addColorStop(1, 'rgba(139, 92, 246, 0.2)');

        let gradTim = ctx.createLinearGradient(0, 0, 0, 400);
        gradTim.addColorStop(0, 'rgba(249, 115, 22, 0.8)');
        gradTim.addColorStop(1, 'rgba(249, 115, 22, 0.2)');

        let gradBon = ctx.createLinearGradient(0, 0, 0, 400);
        gradBon.addColorStop(0, 'rgba(6, 182, 212, 0.8)');
        gradBon.addColorStop(1, 'rgba(6, 182, 212, 0.2)');

        this.charts['timeComp'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthNames,
                datasets: [
                    { label: 'Scalling 1', data: dScallingAvg, backgroundColor: gradQC, borderColor: '#8b5cf6', borderWidth: 1, borderRadius: 6 },
                    { label: 'Timbang - Panggil', data: dTimStartAvg, backgroundColor: gradTim, borderColor: '#f97316', borderWidth: 1, borderRadius: 6 },
                    { label: 'Proses Bongkar', data: dBongkarAvg, backgroundColor: gradBon, borderColor: '#06b6d4', borderWidth: 1, borderRadius: 6 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false } }
                },
                plugins: {
                    legend: { labels: { color: '#fff', font: { family: "'Orbitron', sans-serif" } } },
                    tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', titleColor: '#06b6d4', bodyColor: '#cbd5e1', borderColor: 'rgba(6,182,212,0.5)', borderWidth: 1 }
                }
            },
            plugins: [glowPlugin]
        });

        // -- ADD DONUT CHART FOR INAP VS TIDAK INAP --
        const ctxType = document.getElementById('typeChart');
        if (ctxType) {
            if (this.charts['typeComp']) this.charts['typeComp'].destroy();

            let inapCount = 0;
            let tdkInapCount = 0;

            data.forEach(row => {
                let tglBongkarRaw = row['TANGGAL'] || '';
                let tglBongkar = tglBongkarRaw.substring(0, 10);
                let arrDateRaw = row['ARRIVAL_DATE'] || tglBongkarRaw;
                let arrDate = arrDateRaw.substring(0, 10);
                let arrTime = row['ARRIVAL_TIME'] || row['PB_START'] || '';
                let finishTime = row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '';

                if (arrTime && finishTime !== '' && arrTime !== 'No Data' && finishTime !== 'No Data') {
                    try {
                        let dArr = new Date(arrDate);
                        if (arrTime.includes(':')) {
                            let pts = arrTime.split(':');
                            dArr.setHours(parseInt(pts[0], 10), parseInt(pts[1], 10), 0);
                        }
                        let dFin = new Date(tglBongkar);
                        if (finishTime.includes(':')) {
                            let pts = finishTime.split(':');
                            dFin.setHours(parseInt(pts[0], 10), parseInt(pts[1], 10), 0);
                        }
                        if (dFin < dArr && tglBongkar === arrDate) dFin.setDate(dFin.getDate() + 1);
                        let diffMs = dFin.getTime() - dArr.getTime();
                        let durH = diffMs / (1000 * 60 * 60);

                        if (durH >= 24) inapCount++;
                        else if (durH >= 0) tdkInapCount++;
                    } catch (e) { }
                }
            });

            this.charts['typeComp'] = new Chart(ctxType.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['TIDAK INAP (<24H)', 'INAP (>=24H)'],
                    datasets: [{
                        data: [tdkInapCount, inapCount],
                        backgroundColor: ['#10b981', '#ef4444'],
                        borderColor: ['#34d399', '#f87171'],
                        borderWidth: 2,
                        hoverOffset: 15,
                        hoverBorderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '75%',
                    layout: { padding: 20 },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#e2e8f0', font: { family: "'Orbitron', sans-serif", size: 11, weight: 'bold' } } },
                        tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1 }
                    }
                },
                plugins: [{
                    id: 'glowDonut',
                    beforeDraw: chart => {
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
                        ctx.shadowBlur = 20;
                    },
                    afterDraw: chart => { chart.ctx.restore(); }
                }]
            });
        }
    },

    renderTrackingLogs: function (data) {
        const container = document.getElementById('tracking-logs');

        // Buat mini table html
        let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.65rem;">
            <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-muted);">
                    <th style="padding: 8px 4px; text-align: left;">ID / NOPOL</th>
                    <th style="padding: 8px 4px; text-align: left;">ARRIVAL (IN)</th>
                    <th style="padding: 8px 4px; text-align: left;">BONGKAR (OUT)</th>
                    <th style="padding: 8px 4px; text-align: right;">DURASI</th>
                    <th style="padding: 8px 4px; text-align: right;">STATUS</th>
                </tr>
            </thead>
            <tbody>
        `;

        data.forEach((row, i) => {
            let truckLine = row['JENIS_TRUCK'] || row['JENIS_RM'] || 'CONTAINER';
            let nopol = row['NOPOL'] || 'N/A';
            let tglBongkarRaw = row['TANGGAL'] || '';
            let tglBongkar = tglBongkarRaw.substring(0, 10);
            let arrDateRaw = row['ARRIVAL_DATE'] || tglBongkarRaw;
            let arrDate = arrDateRaw.substring(0, 10);

            let arrTime = row['ARRIVAL_TIME'] || row['PB_START'] || '';
            let startBongkar = row['START_BONGKAR'] || '';
            let finishTime = row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '';

            if (arrTime.trim() === '') arrTime = 'No Data';
            if (startBongkar.trim() === '') startBongkar = 'No Data';
            if (finishTime.trim() === '') finishTime = 'No Data';

            let arrStr = arrTime !== 'No Data' ? arrTime : '00:00';
            let finStr = finishTime !== 'No Data' ? finishTime : '00:00';

            let statusInap = 'OK';
            let colorInap = 'var(--success)';
            let durasiHtml = '';

            try {
                // Construct Date objects
                let dArr = new Date(arrDate);
                if (arrStr.includes(':')) {
                    let pts = arrStr.split(':');
                    dArr.setHours(parseInt(pts[0], 10), parseInt(pts[1], 10), 0);
                }

                let dFin = new Date(tglBongkar);
                if (finStr.includes(':')) {
                    let pts = finStr.split(':');
                    dFin.setHours(parseInt(pts[0], 10), parseInt(pts[1], 10), 0);
                }

                if (isNaN(dArr.getTime()) || isNaN(dFin.getTime())) {
                    throw "Invalid time format";
                }

                // If finish time is earlier than arrival time on the SAME day, add 1 day to finish (crossed midnight)
                if (dFin < dArr && tglBongkar === arrDate) {
                    dFin.setDate(dFin.getDate() + 1);
                }

                let diffMs = dFin.getTime() - dArr.getTime();
                let diffMins = Math.floor(diffMs / (1000 * 60));
                let h = Math.floor(diffMins / 60);
                let m = diffMins % 60;

                if (diffMs < 0 || arrTime === 'No Data' || finishTime === 'No Data') {
                    // Fallback if data is missing or weird
                    durasiHtml = `<span style="color:#ef4444;">-</span>`;
                    statusInap = 'N/A';
                    colorInap = '#64748b';
                } else {
                    if (h >= 24) {
                        statusInap = 'INAP';
                        colorInap = 'var(--danger)';
                    }
                    durasiHtml = `<span style="font-size:0.85rem; color:#fff;">${h}</span><span style="font-size:0.55rem; color:#64748b; margin:0 3px;">h</span><span style="font-size:0.85rem; color:#fff;">${m}</span><span style="font-size:0.55rem; color:#64748b;">m</span>`;
                }
            } catch (e) {
                console.warn("Time parse error", e);
                durasiHtml = `<span style="color:#ef4444;">-</span>`;
                statusInap = 'N/A';
                colorInap = '#64748b';
            }

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                    <td style="padding: 8px 4px;">
                        <span style="color: #fff; font-family: 'Orbitron'; font-weight: 700;">${nopol}</span><br>
                        <span style="font-size:0.6rem; color:#64748b;">${truckLine.substring(0, 15)}</span>
                    </td>
                    <td style="padding: 8px 4px; color: #94a3b8;">
                        <span style="color:#0ea5e9;">${arrDate}</span><br>
                        <span style="font-family:'Orbitron'; font-size:0.6rem; color:${arrTime === 'No Data' ? '#ef4444' : '#fff'};">${arrTime}</span>
                    </td>
                    <td style="padding: 8px 4px; color: #94a3b8;">
                        <span style="color:#10b981;">${tglBongkar}</span><br>
                        <span style="font-family:'Orbitron'; font-size:0.6rem; color:${finishTime === 'No Data' ? '#ef4444' : 'var(--accent)'};">OUT: ${finishTime}</span>
                    </td>
                    <td style="padding: 8px 4px; text-align: right; color: #fff; font-family: 'Orbitron'; font-weight: 900;">
                        ${durasiHtml}
                    </td>
                    <td style="padding: 8px 4px; text-align: right;">
                        <span style="background: ${colorInap}20; color: ${colorInap}; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.6rem; border: 1px solid ${colorInap}50; letter-spacing: 1px;">
                            ${statusInap}
                        </span>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }
};

window.onload = function () {
    TrackingApp.init();
};
