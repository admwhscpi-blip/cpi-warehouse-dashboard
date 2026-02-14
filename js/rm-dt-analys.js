/**
 * RM ANALYTICS ENGINE (V3 - LUXURY PRO)
 * Logic: GLOBAL SLICER V3
 * Theme: Cyber Dark (New Visuals)
 */

const AnalysApp = {
    data: null,
    charts: {},
    currentMonth: '', // GLOBAL STATE

    currentOpsPeriod: 'daily',
    currentAbsBorongPeriod: 'daily',
    currentAbsHarianPeriod: 'daily',
    currentProdTeamPeriod: 'weekly',
    currentSumBongkarPeriod: 'weekly',
    currentSumMuatPeriod: 'weekly',
    currentTungguQCPeriod: 'daily',
    apiUrl: CONFIG.DOWNTIME_API_URL,

    init: function () {
        console.log("Analytics Engine V3 (Real Data Mode) Starting...");
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Outfit', sans-serif";
        Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';

        this.fetchData();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.exitAllFullscreen();
        });
    },

    fetchData: async function () {
        const statusText = document.querySelector('.status-pill');
        if (statusText) statusText.innerHTML = '<div class="status-dot" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></div> SYNCING...';

        try {
            const response = await fetch(this.apiUrl);
            this.data = await response.json();

            // INIT GLOBAL FILTER
            this.initGlobalFilter();

            // Render All
            this.renderAllCharts();
            this.renderKPIs();
            this.initMaterialFeed();

            if (statusText) statusText.innerHTML = '<div class="status-dot"></div> SYSTEM ONLINE';
        } catch (err) {
            console.error("FETCH ERROR:", err);
            if (statusText) statusText.innerHTML = '<div class="status-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></div> ERROR';
            alert("Connection Failed: " + err.message);
        }
    },

    initGlobalFilter: function () {
        // Collect all distinct months from all data sources for robustness
        let months = new Set();

        // 1. Ops
        (this.data.dailyActivity || []).forEach(i => { if (i.tanggal) months.add(i.tanggal.substring(0, 7)); });

        // 2. Absensi Headers (convert to YYYY-MM)
        ['kuliBorong', 'kuliHarian'].forEach(k => {
            if (this.data[k] && this.data[k].dateHeaders) {
                this.data[k].dateHeaders.forEach(h => {
                    let d = this.normalizeDate(h);
                    if (d) months.add(d.substring(0, 7));
                });
            }
        });

        // 3. Template (QC)
        (this.data.template || []).forEach(i => {
            let d = this.normalizeDate(i['TANGGAL']);
            if (d) months.add(d.substring(0, 7));
        });

        // FILTER: Remove Errors. Keep 2023+, Exclude Dec 2024.
        const currentY = new Date().getFullYear();
        const currentM = new Date().getMonth() + 1;

        // Convert to array and filter
        const validMonths = Array.from(months).filter(m => {
            if (!m || m.length < 7) return false;
            let parts = m.split('-');
            let y = parseInt(parts[0]);
            let mon = parseInt(parts[1]);

            // 1. Remove Glitch Years (206, 2001, etc) - Keep 2023+
            if (y < 2023) return false;

            // 2. SPECIFIC REQUEST: Remove Dec 2024
            if (y === 2024 && mon === 12) return false;

            // 3. Remove Future Years
            if (y > currentY) return false;

            // 4. Remove Future Months in Current Year
            if (y === currentY && mon > currentM) return false;

            return true;
        }).sort().reverse();

        const select = document.getElementById('global-month-filter');
        if (select) {
            select.innerHTML = '';
            validMonths.forEach(m => {
                let label = m;
                try { label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(); } catch (e) { }
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
            if (select.options.length > 0) {
                select.value = select.options[0].value;
                this.currentMonth = select.value;
            }
        }
    },

    handleGlobalFilterChange: function (val) {
        this.currentMonth = val;
        this.renderAllCharts();
    },

    renderAllCharts: function () {
        this.renderOpsDaily(this.currentOpsPeriod);
        this.renderAbsensiBorong(this.currentAbsBorongPeriod);
        this.renderAbsensiHarian(this.currentAbsHarianPeriod);
        this.renderProdTeam(this.currentProdTeamPeriod);
        this.renderSummaryGudang('sumBongkar', 'BONGKAR', this.currentSumBongkarPeriod);
        this.renderSummaryGudang('sumMuat', 'MUAT', this.currentSumMuatPeriod);
        this.renderTungguQC(this.currentTungguQCPeriod);
    },

    // ... (KPI Logic Unchanged) ...
    renderKPIs: function () {
        // KPI Logic needs to filter by CURRENT Month? 
        // User asked to "Global Month Filter", implied KPI should also follow?
        // Usually KPI is "Total" or "Current". 
        // Let's make KPI respect the filter for "Total Volume" to be useful
        // or keep it Global. 
        // Request: "otomatis grafik menampilkan data di range... sesuai yang dipilih"
        // Implied -> Charts. KPIs usually show dashboard aggregate. 
        // I will keep KPIs Global for now unless specified, but Charts will use filter.

        // 1. TOTAL VOLUME (GLOBAL SUM for now, or filtered?)
        // Let's just keep original KPI logic for now to avoid confusion unless requested.
        let totalVol = 0;
        let sumBongkar = 0;
        let sumMuat = 0;
        let sumStapel = 0;

        let opsData = this.data.dailyActivity || [];
        const selectedMonth = this.currentMonth;

        opsData.forEach(i => {
            // Apply Global Filter to KPIs? User requested breakdown. 
            // Usually KPIs show Total for the selected period.
            if (i.tanggal && i.tanggal.startsWith(selectedMonth)) {
                let b = Number(i.bongkar) || 0;
                let m = Number(i.muat) || 0;
                let s = (Number(i.st_badrun) || 0) + (Number(i.st_kartono) || 0) + (Number(i.st_kulhar) || 0);

                sumBongkar += b;
                sumMuat += m;
                sumStapel += s;
                totalVol += (b + m + s);
            }
        });

        this.animateValue('kpi-total-vol', 0, totalVol, 2000, " KG");
        // Breakdown
        if (document.getElementById('kpi-vol-bongkar')) document.getElementById('kpi-vol-bongkar').innerText = sumBongkar.toLocaleString();
        if (document.getElementById('kpi-vol-muat')) document.getElementById('kpi-vol-muat').innerText = sumMuat.toLocaleString();
        if (document.getElementById('kpi-vol-stapel')) document.getElementById('kpi-vol-stapel').innerText = sumStapel.toLocaleString();

        // 2. TOTAL MANPOWER (Latest available day in selected month)
        // Find latest date in opsData for selected month
        let latestDate = null;
        opsData.forEach(d => {
            if (d.tanggal && d.tanggal.startsWith(selectedMonth)) {
                if (!latestDate || d.tanggal > latestDate) latestDate = d.tanggal;
            }
        });

        let totalManpower = 0;
        if (latestDate) {
            let d = opsData.find(x => x.tanggal === latestDate);
            if (d) {
                // Assuming logic: Total people active today? 
                // Or sum of absensi "Hadir"? 
                // Quickest proxy: Sum of Productivity Counts if available (not ideal).
                // Better: Check Absensi Data for that date.
                // Let's use the explicit "Total Kuli" from request if available, 
                // else sum attendance from arrays for valid headers.

                // Fallback: Just user requested "Total Kuli Saat Ini". 
                // I will sum attendance from Absensi Data for the latest date found.
                totalManpower = this.calculateTotalManpower(selectedMonth);
            }
        }
        // If totalManpower is still 0 (maybe opsData loop failed), try one more time directly
        if (totalManpower === 0) totalManpower = this.calculateTotalManpower(selectedMonth);

        document.getElementById('kpi-total-attn').innerHTML = totalManpower + " <span class='text-sm text-gray-500'>ORG</span>";

        // 3. TOP PRODUCTIVITY

        // 3. TOP PRODUCTIVITY
        let teams = { 'BADRUN': 0, 'KARTONO': 0, 'KULHAR': 0 };
        let counts = { 'BADRUN': 0, 'KARTONO': 0, 'KULHAR': 0 };
        opsData.forEach(d => {
            teams['BADRUN'] += parseInt(d.prod_badrun || 0); counts['BADRUN']++;
            teams['KARTONO'] += parseInt(d.prod_kartono || 0); counts['KARTONO']++;
            teams['KULHAR'] += parseInt(d.prod_kulhar || 0); counts['KULHAR']++;
        });
        let avgScores = [];
        for (let t in teams) {
            if (counts[t] > 0) avgScores.push({ name: t, avg: Math.round(teams[t] / counts[t]) });
        }
        avgScores.sort((a, b) => b.avg - a.avg);
        if (avgScores.length > 0) {
            let top = avgScores[0];
            document.getElementById('kpi-top-team').innerText = top.name;
            this.animateValue('kpi-top-val', 0, top.avg, 2000, "");
        }

        // 4. QC WAIT
        let qcItems = this.data.template || [];
        let totalWait = 0; let waitCount = 0;
        qcItems.forEach(row => {
            let t1 = this.parseTime(row['PB_START']);
            let t2 = this.parseTime(row['TUNGGU_QC']);
            if (t1 && t2) {
                let diff = t1 - t2;
                if (diff < 0) diff += 1440;
                totalWait += diff; waitCount++;
            }
        });
        let metricsWait = waitCount > 0 ? Math.round(totalWait / waitCount) : 0;
        document.getElementById('kpi-qc-wait').innerText = metricsWait + " m";
        document.getElementById('kpi-qc-bar').style.width = Math.min((metricsWait / 15) * 100, 100) + "%";
    },

    animateValue: function (id, start, end, duration, suffix = "") {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            let val = Math.floor(progress * (end - start) + start);
            obj.innerHTML = val.toLocaleString() + "<span style='font-size:0.5em; color:#94a3b8;'>" + suffix + "</span>";
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    },

    renderSparkline: function (data) {
        const ctx = document.getElementById('spark-total');
        if (!ctx) return;
        let recent = data.slice(-14).map(d => (parseInt(d.muat || 0) + parseInt(d.bongkar || 0) + parseInt(d.st_badrun || 0)));
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: recent.map((_, i) => i),
                datasets: [{
                    data: recent,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } }
            }
        });
    },

    // =========================================================
    // OPS DAILY
    // =========================================================

    renderOpsDaily: function (period) {
        this.currentOpsPeriod = period;
        const items = this.data.dailyActivity || [];
        // USE GLOBAL SLICER
        const selectedMonth = this.currentMonth;

        let grouped = {};

        if (period === 'monthly') {
            grouped = this.groupDataByPeriod(items, 'monthly_global');
        } else {
            let filteredItems = items.filter(i => i.tanggal && i.tanggal.startsWith(selectedMonth));
            if (period === 'daily') grouped = this.groupDataByPeriod(filteredItems, 'daily');
            else if (period === 'weekly') {
                grouped = {};
                filteredItems.forEach(item => {
                    let day = parseInt(item.tanggal.split('-')[2]);
                    let weekNum = Math.ceil(day / 7);
                    let key = `W${weekNum}`;
                    if (!grouped[key]) grouped[key] = this.createEmptyGroup();
                    this.aggregateItemToGroup(grouped[key], item);
                });
            }
        }

        const sortedKeys = Object.keys(grouped).sort();
        const labels = sortedKeys.map(k => this.formatDateSimple(k, period));
        let dMuat = sortedKeys.map(l => grouped[l].sum.muat);
        let dBongkar = sortedKeys.map(l => grouped[l].sum.bongkar);
        let dStapel = sortedKeys.map(l => grouped[l].sum.st_badrun + grouped[l].sum.st_kartono + grouped[l].sum.st_kulhar);

        const ctx = document.getElementById('chart-opsDaily').getContext('2d');
        if (this.charts['opsDaily']) this.charts['opsDaily'].destroy();

        let gradMuat = ctx.createLinearGradient(0, 0, 0, 400);
        gradMuat.addColorStop(0, '#f97316'); gradMuat.addColorStop(1, 'rgba(249, 115, 22, 0.1)');
        let gradBongkar = ctx.createLinearGradient(0, 0, 0, 400);
        gradBongkar.addColorStop(0, '#06b6d4'); gradBongkar.addColorStop(1, 'rgba(6, 182, 212, 0.1)');

        this.charts['opsDaily'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'MUAT', data: dMuat, backgroundColor: gradMuat, borderRadius: 4 },
                    { label: 'BONGKAR', data: dBongkar, backgroundColor: gradBongkar, borderRadius: 4 },
                    { label: 'STAPEL', data: dStapel, backgroundColor: '#8b5cf6', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }
                },
                plugins: { legend: { position: 'bottom', labels: { color: '#fff', usePointStyle: true } } }
            }
        });
    },

    // =========================================================
    // MATERIAL FEED (REAL DATA)
    // =========================================================

    initMaterialFeed: function () { this.filterMaterialFeed(); },

    filterMaterialFeed: function () {
        const searchInput = document.getElementById('material-search');
        if (!searchInput) return;
        let input = searchInput.value.toUpperCase().trim();
        let elList = document.getElementById('material-matches');
        let items = this.data.template || [];

        // HIDE LIST IF INPUT IS EMPTY
        if (input.length === 0) {
            elList.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Type to search material...</div>';
            document.getElementById('mat-min').innerText = "-";
            document.getElementById('mat-max').innerText = "-";
            document.getElementById('mat-avg').innerText = "-";
            return;
        }

        let durations = [];
        let html = "";
        let count = 0;

        items.forEach(row => {
            let jenisRM = String(row['JENIS_RM'] || '').toUpperCase();
            if (jenisRM.includes(input)) {
                if (count < 50) {
                    let dur = this.parseTime(row['DURASI_BONGKAR']);
                    let durStr = dur !== null ? `${dur}m` : '-';
                    if (dur) durations.push(dur);

                    html += `
                    <div class="feed-item">
                        <div>
                            <div style="color:#fff; font-weight:600;">${row['JENIS_RM']}</div>
                            <div style="color:#64748b; font-size:0.7em;">${row['TANGGAL']} | ${row['LOKASI'] || 'GUDANG'}</div>
                        </div>
                        <div class="feed-val text-cyan">${durStr}</div>
                    </div>`;
                    count++;
                }
            }
        });

        if (count === 0) html = '<div style="padding:20px; text-align:center; color:#64748b;">No materials found.</div>';
        elList.innerHTML = html;

        if (durations.length > 0) {
            document.getElementById('mat-min').innerText = Math.min(...durations) + "m";
            document.getElementById('mat-max').innerText = Math.max(...durations) + "m";
            document.getElementById('mat-avg').innerText = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) + "m";
        } else {
            document.getElementById('mat-min').innerText = "-";
            document.getElementById('mat-max').innerText = "-";
            document.getElementById('mat-avg').innerText = "-";
        }
    },

    // =========================================================
    // ABSENSI (STRICT V2 LOGIC RESTORATION)
    // =========================================================

    renderAbsensiBorong: function (period) {
        this.renderGenericAbsensi('chart-absBorong', this.data.kuliBorong, period);
    },

    renderAbsensiHarian: function (period) {
        this.renderGenericAbsensi('chart-absHarian', this.data.kuliHarian, period);
    },

    renderGenericAbsensi: function (chartId, source, period) {
        const ctx = document.getElementById(chartId).getContext('2d');
        if (this.charts[chartId]) this.charts[chartId].destroy();

        if (!source || !source.rows) return;

        const selectedMonth = this.currentMonth; // GLOBAL STATE
        const headers = source.dateHeaders || [];
        let grouped = {};

        // 1. Map Headers to Groups
        headers.forEach((h, idx) => {
            let iso = this.normalizeDate(h);
            if (!iso) return;

            // Filter
            if (selectedMonth !== 'ALL' && !iso.startsWith(selectedMonth)) return;

            let key = iso;
            if (period === 'monthly') key = iso.substring(0, 7);
            else if (period === 'weekly') {
                let d = new Date(iso);
                let week = Math.ceil(d.getDate() / 7);
                key = `W${week}`;
            }

            if (!grouped[key]) grouped[key] = { teams: {} };

            // 2. Scan Rows for this Column Index
            source.rows.forEach(row => {
                let teamName = (row.tim || 'UNK').toUpperCase();
                let val = row.absensi[idx];

                // Allow broader truthy values for checkmarks
                // v, V, ✓, 1, '1', 'hadir' (just in case)
                if (val) {
                    let vStr = String(val).toLowerCase().trim();
                    if (['v', '✓', '1', 'x', 'hadir', 'yes', 'true'].includes(vStr)) {
                        if (!grouped[key].teams[teamName]) grouped[key].teams[teamName] = 0;
                        grouped[key].teams[teamName]++;
                    }
                }
            });
        });

        // 3. Prepare Chart Data
        let sortedKeys = Object.keys(grouped).sort();
        if (sortedKeys.length === 0) return; // No Data

        let labels = sortedKeys.map(k => this.formatDateSimple(k, period));

        // Unique Teams
        let allTeams = new Set();
        sortedKeys.forEach(l => Object.keys(grouped[l].teams).forEach(t => allTeams.add(t)));
        let teamList = Array.from(allTeams);

        let datasets = teamList.map((team, i) => {
            let data = sortedKeys.map(l => grouped[l].teams[team] || 0);
            let colors = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];
            return {
                label: team,
                data: data,
                backgroundColor: colors[i % colors.length],
                borderRadius: 4
            };
        });

        // RENDER CHART
        this.charts[chartId] = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    },

    // =========================================================
    // PRODUCTIVITY TEAM (RESTORED V2)
    // =========================================================

    renderProdTeam: function (period) {
        let items = this.data.dailyActivity || [];
        const selectedMonth = this.currentMonth; // GLOBAL STATE

        let filtered = items.filter(i => i.tanggal && i.tanggal.startsWith(selectedMonth));
        // FORCE DAILY for clearer view as requested
        let grouped = this.groupDataByPeriod(filtered, 'daily');
        let sortedKeys = Object.keys(grouped).sort();
        let labels = sortedKeys.map(k => this.formatDateSimple(k, 'daily'));

        let d_badrun = sortedKeys.map(l => grouped[l].avg.prod_badrun);
        let d_kartono = sortedKeys.map(l => grouped[l].avg.prod_kartono);
        let d_kulhar = sortedKeys.map(l => grouped[l].avg.prod_kulhar);

        const ctx = document.getElementById('chart-prodTeam').getContext('2d');
        if (this.charts['prodTeam']) this.charts['prodTeam'].destroy();

        this.charts['prodTeam'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'BADRUN', data: d_badrun, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true },
                    { label: 'KARTONO', data: d_kartono, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true },
                    { label: 'KULHAR', data: d_kulhar, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { display: true, grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.05)' } } },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    },

    // =========================================================
    // TREND FLOW (RESTORED V2)
    // =========================================================

    renderSummaryGudang: function (chartId, type, period) {
        const ctx = document.getElementById('chart-' + chartId).getContext('2d');
        if (this.charts[chartId]) this.charts[chartId].destroy();

        // 1. Filter Data (Real)
        let items = this.data.template || [];
        let related = items.filter(r => (r['KEGIATAN'] || '').toUpperCase().includes(type));

        // GLOBAL MONTH FILTER APPLIED HERE TOO
        const selectedMonth = this.currentMonth;
        related = related.filter(r => {
            let iso = this.normalizeDate(r['TANGGAL']);
            return iso && iso.startsWith(selectedMonth);
        });

        // 2. Group
        let grouped = {};
        related.forEach(r => {
            let iso = this.normalizeDate(r['TANGGAL']);
            if (!iso) return;
            let key = iso;
            // Force Daily for trends to show dates as requested
            // if (period === 'weekly') { ... } 

            if (!grouped[key]) grouped[key] = 0;
            grouped[key]++;
        });

        let sortedKeys = Object.keys(grouped).sort();
        let labels = sortedKeys.map(k => this.formatDateSimple(k, 'daily'));
        let data = sortedKeys.map(k => grouped[k]);

        let color = type === 'BONGKAR' ? '#06b6d4' : '#f97316';
        let grad = ctx.createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');

        this.charts[chartId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: type,
                    data: data,
                    borderColor: color,
                    backgroundColor: grad,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { display: true, ticks: { color: '#64748b' } }, y: { display: false } }
            }
        });
    },

    renderTungguQC: function (period) {
        const ctx = document.getElementById('chart-tungguQC').getContext('2d');
        if (this.charts['tungguQC']) this.charts['tungguQC'].destroy();

        let items = this.data.template || [];
        const selectedMonth = this.currentMonth;

        let dateMap = {}; // date -> {sum, count}

        items.forEach(r => {
            let iso = this.normalizeDate(r['TANGGAL']);
            if (!iso || !iso.startsWith(selectedMonth)) return;

            let t1 = this.parseTime(r['PB_START']);
            let t2 = this.parseTime(r['TUNGGU_QC']);
            if (t1 && t2) {
                let diff = t1 - t2;
                // Handle day wrap? Assuming simple subtract for now as per request
                if (!dateMap[iso]) dateMap[iso] = { sum: 0, count: 0 };
                dateMap[iso].sum += diff;
                dateMap[iso].count++;
            }
        });

        // Convert Map to Array & Average
        let processed = [];
        Object.keys(dateMap).sort().forEach(date => {
            let d = dateMap[date];
            let avg = Math.round(d.sum / d.count);
            processed.push({ date: date, val: avg });
        });

        let displayData = processed.map(p => p.val);
        let labels = processed.map(p => {
            // Return just Day Number
            let d = new Date(p.date);
            return d.getDate();
        });

        this.charts['tungguQC'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Avg Wait (Min)',
                    data: displayData,
                    borderColor: '#f43f5e',
                    borderWidth: 2,
                    pointBackgroundColor: '#f43f5e',
                    pointRadius: 4,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { display: true, ticks: { maxTicksLimit: 15 } }, y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } },
                plugins: { legend: { display: false } }
            }
        });
    },

    // Helper for Manpower
    calculateTotalManpower: function (targetMonth) {
        // We want the "Latest" or "Current" manpower count.
        // It's best to find the most recent date in the selected month that has data.

        let maxTotal = 0;

        // Collect all dates from headers
        let allDates = new Set();
        let sources = [this.data.kuliBorong, this.data.kuliHarian];

        sources.forEach(src => {
            if (src && src.dateHeaders) {
                src.dateHeaders.forEach(h => {
                    let iso = this.normalizeDate(h);
                    if (iso && iso.startsWith(targetMonth)) allDates.add(iso);
                });
            }
        });

        // Sort dates descending (latest first)
        let sortedDates = Array.from(allDates).sort().reverse();

        // Iterate to find first date with valid data
        for (let date of sortedDates) {
            let dailyTotal = 0;
            // Count for this date
            const countSource = (src) => {
                if (!src || !src.dateHeaders) return 0;
                let idx = -1;
                src.dateHeaders.forEach((h, i) => {
                    if (this.normalizeDate(h) === date) idx = i;
                });
                if (idx === -1) return 0;
                let count = 0;
                src.rows.forEach(r => {
                    let val = r.absensi[idx];
                    if (val) {
                        let vStr = String(val).toLowerCase().trim();
                        if (['v', '✓', '1', 'x', 'hadir', 'yes', 'true'].includes(vStr)) count++;
                    }
                });
                return count;
            };

            dailyTotal += countSource(this.data.kuliBorong);
            dailyTotal += countSource(this.data.kuliHarian);

            if (dailyTotal > 0) {
                return dailyTotal; // Return latest valid count
            }
        }

        return 0;
    },

    // UTILS
    setSlicer: function (key, val) {
        if (key === 'opsDaily') {
            this.currentOpsPeriod = val;
            this.renderOpsDaily(val);
        }
        else if (key === 'sumBongkar') {
            this.currentSumBongkarPeriod = val;
            this.renderSummaryGudang('sumBongkar', 'BONGKAR', val);
        }
        else if (key === 'sumMuat') {
            this.currentSumMuatPeriod = val;
            this.renderSummaryGudang('sumMuat', 'MUAT', val);
        }
    },

    formatDateSimple: function (dateStr, period) {
        if (!dateStr || period !== 'daily') return dateStr;
        let d = new Date(dateStr);
        if (!isNaN(d.getTime())) return String(d.getDate()); // Return String
        return dateStr;
    },

    createEmptyGroup: function () {
        return { sum: { muat: 0, bongkar: 0, bongkarKulhar: 0, st_badrun: 0, st_kartono: 0, st_kulhar: 0, prod_badrun: 0, prod_kartono: 0, prod_kulhar: 0 }, count: 0, avg: {} };
    },

    aggregateItemToGroup: function (group, item) {
        group.count++;
        ['muat', 'bongkar', 'bongkarKulhar', 'st_badrun', 'st_kartono', 'st_kulhar', 'prod_badrun', 'prod_kartono', 'prod_kulhar'].forEach(k => {
            group.sum[k] += (Number(item[k]) || 0);
        });
    },

    groupDataByPeriod: function (items, mode) {
        let grouped = {};
        items.forEach(item => {
            let key = item.tanggal;
            if (mode === 'monthly_global') key = item.tanggal.substring(0, 7);
            if (!grouped[key]) grouped[key] = this.createEmptyGroup();
            this.aggregateItemToGroup(grouped[key], item);
        });

        // Calc Avgs
        for (let k in grouped) {
            let g = grouped[k];
            ['prod_badrun', 'prod_kartono', 'prod_kulhar'].forEach(f => g.avg[f] = Math.round(g.sum[f] / g.count));
        }
        return grouped;
    },

    parseTime: function (strVal) {
        if (!strVal) return null;
        let str = String(strVal);
        let h = 0, m = 0;
        if (str.includes(':')) {
            let parts = str.split(':');
            h = parseInt(parts[0]); m = parseInt(parts[1]);
            return (h * 60) + m;
        }
        return parseInt(str) || null;
    },

    normalizeDate: function (str) {
        if (!str) return null;

        // Handle "DD MMM" format (e.g. "01 JAN", "05 FEB")
        // Common in Apps Script output
        const monthMap = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
            'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };

        let s = String(str).trim().toUpperCase();
        let parts = s.split(' ');
        if (parts.length === 2 && monthMap[parts[1]]) {
            // It's "DD MMM"
            let day = parts[0].padStart(2, '0');
            let m = monthMap[parts[1]];

            // Try to guess year from selected filter or default to current
            let y = new Date().getFullYear();
            if (this.currentMonth) {
                y = this.currentMonth.split('-')[0];
            }
            return `${y}-${m}-${day}`;
        }

        let d = new Date(str);
        if (isNaN(d.getTime())) return null;
        // Use local year/month/day
        let y = d.getFullYear();
        let m = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    populateElements: function (id, dataList) {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '';
            dataList.forEach(m => {
                let label = m;
                try { label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(); } catch (e) { }
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
            if (select.options.length > 0) select.value = select.options[0].value;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AnalysApp.init();
});
