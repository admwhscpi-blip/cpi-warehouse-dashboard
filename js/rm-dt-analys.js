/**
 * RM ANALYTICS ENGINE (V2)
 * Theme: Fiesta Analytics (Dark Navy/Orange)
 */

const AnalysApp = {
    data: null,
    charts: {},
    currentOpsPeriod: 'daily',
    currentAbsBorongPeriod: 'daily',
    currentAbsHarianPeriod: 'daily',
    currentProdTeamPeriod: 'weekly',
    currentProdManHourPeriod: 'weekly', // NEW
    currentSumBongkarPeriod: 'weekly',  // NEW
    currentSumMuatPeriod: 'weekly',     // NEW
    currentTungguQCPeriod: 'daily',     // NEW
    apiUrl: CONFIG.DOWNTIME_API_URL,

    init: function () {
        console.log("Analytics Engine V2 Starting...");
        this.fetchData();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.exitAllFullscreen();
        });
    },

    fetchData: async function () {
        const syncEl = document.getElementById('sync-status');
        if (syncEl) {
            syncEl.innerText = '● SYNCING...';
            syncEl.style.color = '#f97316';
        }

        try {
            const response = await fetch(this.apiUrl);
            this.data = await response.json();

            // Init Filters
            this.initOpsMonthFilter();
            this.initAbsBorongMonthFilter();
            this.initAbsHarianMonthFilter();
            this.initProdTeamMonthFilter();
            this.initTungguQCMonthFilter(); // NEW

            this.initCharts();
            // Removed auto calculation logic to wait for user input

            if (syncEl) {
                syncEl.innerText = '● ONLINE';
                syncEl.style.color = '#10b981';
            }
            if (document.getElementById('last-update')) {
                document.getElementById('last-update').innerText = 'LAST SYNC: ' + new Date().toLocaleTimeString();
            }
        } catch (err) {
            console.error("FETCH ERROR:", err);
            if (syncEl) {
                syncEl.innerText = '● ERROR';
                syncEl.style.color = '#ef4444';
            }
            alert("ANALYTICS ERROR:\n" + err.message + "\n\nCek Console!");
        }
    },

    // =========================================================
    // OPS DAILY LOGIC
    // =========================================================

    initOpsMonthFilter: function () {
        const items = this.data.dailyActivity || [];
        let months = new Set();
        items.forEach(item => { if (item.tanggal) months.add(item.tanggal.substring(0, 7)); });
        const sortedMonths = Array.from(months).sort().reverse();
        const select = document.getElementById('ops-month-filter');
        select.innerHTML = '';
        sortedMonths.forEach(m => {
            let date = new Date(m + "-01");
            let label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
            let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
        });
        if (sortedMonths.length > 0) select.value = sortedMonths[0];
    },

    renderOpsDaily: function (period) {
        this.currentOpsPeriod = period;
        const items = this.data.dailyActivity || [];
        const selectedMonth = document.getElementById('ops-month-filter').value;
        let grouped = {};

        if (period === 'monthly') {
            grouped = this.groupDataByPeriod(items, 'monthly_global');
            document.getElementById('ops-month-filter').disabled = true;
            document.getElementById('ops-month-filter').style.opacity = '0.5';
        } else {
            document.getElementById('ops-month-filter').disabled = false;
            document.getElementById('ops-month-filter').style.opacity = '1';
            let filteredItems = items.filter(i => i.tanggal && i.tanggal.startsWith(selectedMonth));
            if (period === 'daily') grouped = this.groupDataByPeriod(filteredItems, 'daily');
            else if (period === 'weekly') {
                grouped = {};
                filteredItems.forEach(item => {
                    let day = parseInt(item.tanggal.split('-')[2]);
                    let weekNum = Math.ceil(day / 7);
                    let key = `WEEK ${weekNum}`;
                    if (!grouped[key]) grouped[key] = this.createEmptyGroup();
                    this.aggregateItemToGroup(grouped[key], item);
                });
            }
        }

        const labels = Object.keys(grouped).sort();
        let displayLabels = labels.map(l => {
            if (period === 'daily') return parseInt(l.split('-')[2]);
            if (period === 'monthly') {
                let d = new Date(l + "-01");
                return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
            }
            return l;
        });

        let dMuat = labels.map(l => grouped[l].sum.muat);
        let dBongkar = labels.map(l => grouped[l].sum.bongkar);
        let dBongkarKH = labels.map(l => grouped[l].sum.bongkarKulhar);
        let dStapelBadrun = labels.map(l => grouped[l].sum.st_badrun);
        let dStapelKartono = labels.map(l => grouped[l].sum.st_kartono);
        let dStapelKulhar = labels.map(l => grouped[l].sum.st_kulhar);

        const ctx = document.getElementById('chart-opsDaily').getContext('2d');
        if (this.charts['opsDaily']) this.charts['opsDaily'].destroy();

        document.getElementById('ops-conclusion').innerHTML = "SELECT A BAR TO VIEW DETAILED CONCLUSION.";

        this.charts['opsDaily'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: displayLabels,
                datasets: [
                    { label: 'MUAT', data: dMuat, backgroundColor: '#f97316', borderRadius: 4 },
                    { label: 'BONGKAR', data: dBongkar, backgroundColor: '#3b82f6', borderRadius: 4 },
                    { label: 'BONGKAR KULHAR', data: dBongkarKH, backgroundColor: '#0ea5e9', borderRadius: 4 },
                    { label: 'STAPEL BADRUN', data: dStapelBadrun, backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'STAPEL KARTONO', data: dStapelKartono, backgroundColor: '#8b5cf6', borderRadius: 4 },
                    { label: 'STAPEL KULHAR', data: dStapelKulhar, backgroundColor: '#ec4899', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { grid: { display: false }, stacked: true, ticks: { color: '#94a3b8' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, stacked: true, ticks: { color: '#94a3b8' } } },
                plugins: { tooltip: { mode: 'index', intersect: false }, legend: { labels: { color: '#fff' } } },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const key = labels[idx];
                        const groupData = grouped[key];
                        const total = this.sumGroup(groupData);
                        document.getElementById('ops-detail-val').innerHTML = total.toLocaleString('id-ID') + " KG";
                        this.renderConclusion(period, key, groupData, labels, idx, selectedMonth, items);
                    }
                }
            }
        });
    },

    renderConclusion: function (period, key, groupData, allLabels, idx, selectedMonth, allItems) {
        const el = document.getElementById('ops-conclusion');
        let html = "";
        let muat = groupData.sum.muat.toLocaleString();
        let bongkar = groupData.sum.bongkar.toLocaleString();
        let stapel = (groupData.sum.st_badrun + groupData.sum.st_kartono + groupData.sum.st_kulhar).toLocaleString();

        if (period === 'daily') {
            html = `
                <div style="margin-bottom:8px;"><strong>DAILY REPORT [${key}]:</strong></div>
                <table style="width:100%; max-width:400px; font-size:0.85rem; border-collapse:collapse; color:#e2e8f0;">
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><td style="padding:4px 0; color:#94a3b8;">ACTIVITY</td><td style="padding:4px 0; text-align:right; color:#94a3b8;">VOLUME (KG)</td></tr>
                    <tr><td style="padding:4px 0;">MUAT</td><td style="padding:4px 0; text-align:right; color:#f97316;">${muat}</td></tr>
                    <tr><td style="padding:4px 0;">BONGKAR</td><td style="padding:4px 0; text-align:right; color:#3b82f6;">${bongkar}</td></tr>
                    <tr><td style="padding:4px 0;">STAPEL</td><td style="padding:4px 0; text-align:right; color:#10b981;">${stapel}</td></tr>
                    <tr style="border-top:1px solid rgba(255,255,255,0.2); font-weight:700;"><td style="padding:6px 0;">TOTAL</td><td style="padding:6px 0; text-align:right;">${this.sumGroup(groupData).toLocaleString()}</td></tr>
                </table>
            `;
        } else if (period === 'weekly') {
            let weekNum = parseInt(key.replace('WEEK ', ''));
            let startDay = (weekNum - 1) * 7 + 1;
            let endDay = weekNum * 7;
            let weekItems = allItems.filter(i => {
                if (!i.tanggal || !i.tanggal.startsWith(selectedMonth)) return false;
                let d = parseInt(i.tanggal.split('-')[2]);
                return d >= startDay && d <= endDay;
            });
            let avgDaily = weekItems.length > 0 ? Math.round(this.sumGroup(groupData) / weekItems.length).toLocaleString() : 0;
            let rows = weekItems.map(i => {
                let vol = (parseInt(i.muat || 0) + parseInt(i.bongkar || 0) + parseInt(i.bongkarKulhar || 0) + parseInt(i.st_badrun || 0) + parseInt(i.st_kartono || 0) + parseInt(i.st_kulhar || 0)).toLocaleString();
                let dayStr = i.tanggal.split('-')[2];
                return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:4px 8px;">Day ${dayStr}</td><td style="padding:4px 8px; text-align:right;">${vol}</td></tr>`;
            }).join('');

            html = `<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px;">
                    <div><strong>WEEKLY ANALYSIS [${key}]:</strong><br><div style="font-size:1.5rem; color:#f97316; font-weight:700; margin:5px 0;">${this.sumGroup(groupData).toLocaleString()} KG</div><div style="font-size:0.9rem; color:#94a3b8;">Avg Daily: <span style="color:#fff;">${avgDaily}</span> / Day</div></div>
                    <div style="flex-grow:1; max-width:500px;"><div style="font-size:0.75rem; color:#94a3b8; margin-bottom:5px; letter-spacing:1px;">DAILY BREAKDOWN</div><div style="max-height:150px; overflow-y:auto; background:rgba(0,0,0,0.2); border-radius:6px; padding:5px;"><table style="width:100%; font-size:0.8rem; border-collapse:collapse; color:#cbd5e1;"><thead style="color:#f97316; font-weight:600;"><tr><th style="text-align:left; padding:5px 8px;">DATE</th><th style="text-align:right; padding:5px 8px;">VOL (KG)</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
        } else if (period === 'monthly') {
            let monthName = new Date(key + "-01").toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
            html = `<strong>MONTHLY SUMMARY [${monthName}]:</strong><br>Total Operational Volume: ${this.sumGroup(groupData).toLocaleString()} KG.<br><small style="color:#94a3b8">Select 'Weekly' or 'Daily' mode and click specific bars for detailed breakdowns.</small>`;
        }
        el.innerHTML = html;
    },

    // =========================================================
    // ABSENSI KULI BORONG (DEBUG & ROBUST MODE)
    // =========================================================

    initAbsBorongMonthFilter: function () {
        const headers = this.data.kuliBorong ? (this.data.kuliBorong.dateHeaders || []) : [];
        console.log("AbsHeaders:", headers); // DEBUG

        let months = new Set();
        let validDates = 0;

        headers.forEach(h => {
            let iso = this.normalizeDate(h);
            if (iso) {
                months.add(iso.substring(0, 7)); // YYYY-MM
                validDates++;
            }
        });

        console.log("Parsed Months:", months); // DEBUG

        const select = document.getElementById('absBorong-month-filter');
        select.innerHTML = '';
        const sortedMonths = Array.from(months).sort().reverse();

        if (sortedMonths.length === 0) {
            // FALLBACK: If date parsing failed completely, maybe headers are just strings?
            // Show a "Show All" option
            let opt = document.createElement('option'); opt.value = 'ALL'; opt.text = 'SHOW ALL DATA'; select.appendChild(opt);
        } else {
            sortedMonths.forEach(m => {
                let date = new Date(m + "-01");
                let label = isNaN(date.getTime()) ? m : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
            select.value = sortedMonths[0];
        }
    },

    renderAbsensiBorong: function (period) {
        this.currentAbsBorongPeriod = period;
        const source = this.data.kuliBorong;
        if (!source || !source.rows) {
            console.error("No KuliBorong Data");
            return;
        }

        const selectedMonth = document.getElementById('absBorong-month-filter').value;
        const headers = source.dateHeaders || [];

        // Prepare Grouping Structure
        let grouped = {};
        let targetIndices = [];

        headers.forEach((h, idx) => {
            let iso = this.normalizeDate(h);
            // Logic: If 'ALL' is selected or dates failed, treat all as one group or try raw

            if (selectedMonth === 'ALL' || !iso) {
                // Fallback mode
                let key = iso || h || `Col ${idx + 1}`;
                if (!grouped[key]) grouped[key] = { total: 0, teams: {} };
                targetIndices.push({ idx: idx, key: key });
            } else {
                if (period === 'monthly') {
                    let mKey = iso.substring(0, 7);
                    if (!grouped[mKey]) grouped[mKey] = { total: 0, teams: {} };
                    targetIndices.push({ idx: idx, key: mKey });
                } else {
                    if (iso.startsWith(selectedMonth)) {
                        let key = iso;
                        if (period === 'weekly') {
                            let day = parseInt(iso.split('-')[2]);
                            let weekNum = Math.ceil(day / 7);
                            key = `WEEK ${weekNum}`;
                        }
                        if (!grouped[key]) grouped[key] = { total: 0, teams: {} };
                        targetIndices.push({ idx: idx, key: key });
                    }
                }
            }
        });

        // --- 2. Aggregate Data ---
        source.rows.forEach(row => {
            let teamName = row.tim.toUpperCase();
            targetIndices.forEach(t => {
                let val = row.absensi[t.idx];
                // Check for tick mark or non-empty
                if (val && (val === '✓' || val.toString().toLowerCase() === 'v' || val === 1)) {
                    if (!grouped[t.key].teams[teamName]) grouped[t.key].teams[teamName] = 0;
                    grouped[t.key].teams[teamName]++;
                    grouped[t.key].total++;
                }
            });
        });

        const labels = Object.keys(grouped).sort();
        if (labels.length === 0) {
            const ctx = document.getElementById('chart-absBorong').getContext('2d');
            if (this.charts['absBorong']) this.charts['absBorong'].destroy();
            document.getElementById('absBorong-conclusion').innerHTML = "NO MATCHING DATA FOUND.";
            return;
        }

        let displayLabels = labels.map(l => {
            // Formatter
            if (l.match(/^\d{4}-\d{2}-\d{2}$/)) { // Formatted like YYYY-MM-DD
                if (period === 'daily') return parseInt(l.split('-')[2]);
                return l;
            }
            if (period === 'monthly' && l.match(/^\d{4}-\d{2}$/)) {
                let d = new Date(l + "-01");
                return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
            }
            return l;
        });

        let teams = {};
        labels.forEach(l => {
            let g = grouped[l];
            for (let t in g.teams) teams[t] = true;
        });

        let datasets = [];
        const colors = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        let colorIdx = 0;

        Object.keys(teams).forEach(t => {
            let data = labels.map(l => grouped[l].teams[t] || 0);
            datasets.push({ label: t, data: data, backgroundColor: colors[colorIdx++ % colors.length], borderRadius: 4 });
        });

        const ctx = document.getElementById('chart-absBorong').getContext('2d');
        if (this.charts['absBorong']) this.charts['absBorong'].destroy();

        document.getElementById('absBorong-conclusion').innerHTML = "SELECT A BAR TO VIEW ATTENDANCE DETAILS.";

        this.charts['absBorong'] = new Chart(ctx, {
            type: 'bar',
            data: { labels: displayLabels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { grid: { display: false }, stacked: false, ticks: { color: '#94a3b8' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, stacked: false, ticks: { color: '#94a3b8' } } },
                plugins: { legend: { labels: { color: '#fff', boxWidth: 12 } } },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const key = labels[idx];
                        const groupData = grouped[key];

                        // Find indexes for this specific key to calculate absentees
                        // We need to re-find which header indices belong to this key
                        let specificIndices = targetIndices.filter(t => t.key === key);

                        document.getElementById('absBorong-detail-val').innerHTML = groupData.total + " CHECK-INS";
                        this.renderAbsBorongConclusion(period, key, groupData, source.rows, specificIndices);
                    }
                }
            }
        });

        if (selectedMonth === 'ALL' || period === 'monthly') {
            document.getElementById('absBorong-month-filter').disabled = true;
            document.getElementById('absBorong-month-filter').style.opacity = '0.5';
        } else {
            document.getElementById('absBorong-month-filter').disabled = false;
            document.getElementById('absBorong-month-filter').style.opacity = '1';
        }
    },

    renderAbsBorongConclusion: function (period, key, groupData, allRows, relevantIndices) {
        const el = document.getElementById('absBorong-conclusion');

        // 1. Presence Summary
        let rowsPresence = Object.entries(groupData.teams).map(([t, count]) => `<tr><td style="padding:4px 0;">${t}</td><td style="padding:4px 0; text-align:right; color:#f97316;">${count}</td></tr>`).join('');

        // 2. Absence Analysis
        let absenteeList = [];
        let totalSlots = relevantIndices.length;

        allRows.forEach(row => {
            let missedCount = 0;
            relevantIndices.forEach(t => {
                let val = row.absensi[t.idx];
                let isPresent = (val && (val === '✓' || val.toString().toLowerCase() === 'v' || val == 1));
                if (!isPresent) missedCount++;
            });

            if (missedCount > 0 && row.tim && row.tim.trim() !== '') {
                absenteeList.push({
                    name: row.nama,
                    team: row.tim,
                    missed: missedCount,
                    rate: Math.round((missedCount / totalSlots) * 100)
                });
            }
        });

        // Sort: Most missed first
        absenteeList.sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name));

        // Render Rows with Rank & Crown
        let absenteeRows = absenteeList.map((p, index) => {
            let color = p.rate > 50 ? '#ef4444' : '#f59e0b';
            let barWidth = p.rate + '%';

            // Crown Logic for Rank 1
            let rankDisp = `<span style="color:#64748b; font-weight:700;">#${index + 1}</span>`;
            let nameDisp = p.name;

            if (index === 0) {
                rankDisp = `<i class="fas fa-crown" style="color:#fbbf24; font-size:1rem; text-shadow:0 0 10px rgba(251, 191, 36, 0.5);"></i>`;
                nameDisp = `<span style="color:#fbbf24; font-weight:700;">${p.name}</span>`;
            } else if (index === 1) {
                rankDisp = `<span style="color:#e2e8f0; font-weight:700;">#2</span>`;
            } else if (index === 2) {
                rankDisp = `<span style="color:#b45309; font-weight:700;">#3</span>`;
            }

            return `
            <tr>
                <td style="padding:6px 8px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.05); width:40px;">
                    ${rankDisp}
                </td>
                <td style="padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight:500;">${nameDisp}</div>
                    <div style="font-size:0.7em; color:#64748b;">${p.team}</div>
                </td>
                <td style="padding:4px 8px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="color:${color}; font-weight:700;">${p.missed} <span style="font-size:0.75em; font-weight:400; color:#94a3b8;">/ ${totalSlots}</span></div>
                    <div style="background:rgba(255,255,255,0.1); h-height:3px; margin-top:2px; border-radius:2px; width:100%;">
                        <div style="background:${color}; height:3px; width:${barWidth}; border-radius:2px;"></div>
                    </div>
                </td>
            </tr>`;
        }).join('');

        if (absenteeList.length === 0) absenteeRows = `<tr><td colspan="3" style="padding:15px; text-align:center; color:#10b981; font-style:italic;">ALL PERSONNEL PRESENT (100%)</td></tr>`;

        let periodLabel = (period === 'daily') ? 'HARI INI' : (period === 'weekly' ? 'MINGGU INI' : 'BULAN INI');

        let html = `
            <div style="display:flex; gap:30px; align-items:flex-start; flex-wrap:wrap;">
                <!-- BOX 1: DATA KEHADIRAN -->
                <div style="min-width:220px;">
                     <div style="margin-bottom:5px; color:#94a3b8; font-size:0.8rem;">SUMMARY KEHADIRAN</div>
                     <div style="font-size:1.8rem; font-weight:700; color:#10b981; line-height:1;">${groupData.total} <span style="font-size:1rem; font-weight:400; color:#fff;">Hadir</span></div>
                     
                     <div style="margin-top:15px; padding-top:10px; border-top:1px solid #334155;">
                        <table style="width:100%; font-size:0.85rem; color:#cbd5e1;">${rowsPresence}</table>
                     </div>
                </div>
                
                <!-- BOX 2: ANALISIS KETIDAKHADIRAN -->
                <div style="flex-grow:1; max-width:650px; border-left:1px solid #334155; padding-left:25px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div>
                            <div style="color:#ef4444; font-weight:700;">TOP ABSENTEE ANALYSIS</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">Daftar orang yang tidak masuk pada periorde ${periodLabel}</div>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:1.5rem; font-weight:700; color:#fff;">${absenteeList.length}</span>
                            <div style="font-size:0.7rem; color:#94a3b8;">ORG BOLOS</div>
                        </div>
                    </div>
                    
                    <div style="max-height:200px; overflow-y:auto; background:rgba(15, 23, 42, 0.6); border:1px solid #334155; border-radius:8px;">
                        <table style="width:100%; font-size:0.85rem; border-collapse:collapse; color:#cbd5e1;">
                            <thead style="position:sticky; top:0; background:#1e293b; z-index:1;">
                                <tr>
                                    <th style="text-align:center; padding:8px 8px; color:#94a3b8; font-weight:600; width:40px;">#</th>
                                    <th style="text-align:left; padding:8px 12px; color:#94a3b8; font-weight:600;">PERSONNEL</th>
                                    <th style="text-align:right; padding:8px 12px; color:#94a3b8; font-weight:600;">FREQ (ABSEN)</th>
                                </tr>
                            </thead>
                            <tbody>${absenteeRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        el.innerHTML = html;
    },

    // NEW HELPER: Normalize any date string to YYYY-MM-DD
    normalizeDate: function (str) {
        if (!str) return null;
        let d = new Date(str);

        // If it's a valid date but potentially missing year (e.g. "01 Dec" -> defaults to current year 2026)
        // Check with dailyActivity data to find the "intended" year
        if (!isNaN(d.getTime())) {
            let yyyy = d.getFullYear();

            // IF the parsed year is 2026 AND we have data from 2025, it probably should be 2025
            if (yyyy === 2026 && this.data && this.data.dailyActivity && this.data.dailyActivity.length > 0) {
                let sampleTgl = this.data.dailyActivity[0].tanggal;
                if (sampleTgl && sampleTgl.startsWith('2025')) {
                    yyyy = 2025;
                }
            }

            let mm = String(d.getMonth() + 1).padStart(2, '0');
            let dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }

        // Fallback for weird manual formats if needed (e.g. "01/12/2025")
        if (str.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            let parts = str.split('/');
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return null;
    },

    // =========================================================
    // MATERIAL DURATION LOGIC (Manual Trigger)
    // =========================================================

    // 1. Render List (On Keyup) - Shows Raw Data Only
    renderMaterialList: function () {
        let input = document.getElementById('material-search').value.toUpperCase().trim();
        let elList = document.getElementById('material-matches');

        // Hide Stats Grid when typing new search
        document.getElementById('material-stats').style.display = 'none';

        if (!input) {
            elList.innerHTML = '<div style="padding:10px; text-align:center; color:#64748b; font-style:italic;">Type to search materials...</div>';
            return;
        }

        let items = this.data.template || [];
        let html = "";
        let count = 0;

        items.forEach(row => {
            let jenisRM = String(row['JENIS_RM'] || '').toUpperCase();
            if (jenisRM.includes(input)) {
                count++;
                let dur = this.parseTime(row['DURASI_BONGKAR']);
                let durStr = dur !== null ? `${dur} m` : 'N/A';

                html += `<div style="display:flex; justify-content:space-between; padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="color:#e2e8f0;">${jenisRM} <span style="color:#64748b; font-size:0.7em;">(${row['TANGGAL']})</span></span> 
                    <span style="color:#94a3b8;">${durStr}</span>
                </div>`;
            }
        });

        if (count === 0) {
            elList.innerHTML = '<div style="padding:10px; text-align:center; color:#ef4444;">No matches found.</div>';
        } else {
            elList.innerHTML = html;
        }
    },

    // 2. Calculate Stats (On Button Click) - Applies Outlier Logic
    calculateDurationStats: function () {
        let input = document.getElementById('material-search').value.toUpperCase().trim();
        let elMin = document.getElementById('val-min');
        let elAvg = document.getElementById('val-avg');
        let elMax = document.getElementById('val-max');
        let elStats = document.getElementById('material-stats');

        if (!input) return;

        let items = this.data.template || [];
        let rawValues = [];

        // Collect Values
        items.forEach(row => {
            let jenisRM = String(row['JENIS_RM'] || '').toUpperCase();
            if (jenisRM.includes(input)) {
                let dur = this.parseTime(row['DURASI_BONGKAR']);
                if (dur !== null) rawValues.push(dur);
            }
        });

        if (rawValues.length === 0) return;

        // Smart Outlier Filter (IQR)
        // Sort
        rawValues.sort((a, b) => a - b);
        let q1 = rawValues[Math.floor((rawValues.length / 4))];
        let q3 = rawValues[Math.floor((rawValues.length * (3 / 4)))];
        let iqr = q3 - q1;
        // Upper bound only usually matters for duration (unusually long)
        // But let's check both
        let lowerBound = q1 - 1.5 * iqr;
        let upperBound = q3 + 1.5 * iqr;

        let cleanValues = rawValues.filter(x => x >= lowerBound && x <= upperBound);

        // Handling edge case: if all data is uniform, cleanValues is full.
        // If data is too sparse, IQR might exclude justified variances. 
        // Fallback: If cleanValues is empty (weird case), use raw.
        if (cleanValues.length === 0) cleanValues = rawValues;

        let min = Math.min(...cleanValues);
        let max = Math.max(...cleanValues);
        let avg = Math.round(cleanValues.reduce((a, b) => a + b, 0) / cleanValues.length);

        elMin.innerText = min;
        elAvg.innerText = avg;
        elMax.innerText = max;

        // Show Stats
        elStats.style.display = 'grid';
    },

    // =========================================================
    // UI CONTROLS & HELPERS
    // =========================================================
    setSlicer: function (chartKey, period) {
        const group = document.querySelector(`.slicer-group[data-target="${chartKey}"]`);
        if (group) {
            group.querySelectorAll('.slicer-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
        }
        switch (chartKey) {
            case 'opsDaily': this.renderOpsDaily(period); break;
            case 'absBorong': this.renderAbsensiBorong(period); break;
            case 'absHarian': this.renderAbsensiHarian(period); break; // Corrected name
            case 'prodTeam': this.renderProdTeam(period); break;
            case 'prodManHour': this.renderProdManHour(period); break;
            case 'sumBongkar': this.renderSummaryGudang('sumBongkar', 'BONGKAR', period); break;
            case 'sumMuat': this.renderSummaryGudang('sumMuat', 'MUAT', period); break;
            case 'tungguQC': this.renderTungguQC(period); break;
        }
    },

    // ... (toggleFullscreen methods) ...

    // Helper: Parse "HH:mm" or ISO time to minutes
    parseTime: function (strVal) {
        if (!strVal) return null;
        let str = String(strVal);
        let h = 0, m = 0;
        if (str.includes('T')) {
            let d = new Date(str);
            if (isNaN(d.getTime())) return null;
            h = d.getHours(); m = d.getMinutes();
        } else if (str.includes(':')) {
            let parts = str.split(':');
            h = parseInt(parts[0]); m = parseInt(parts[1]);
        } else return null;
        return (h * 60) + m;
    },

    initCharts: function () {
        this.renderOpsDaily('daily');
        this.renderAbsensiBorong('daily');
        this.renderAbsensiHarian('daily');
        this.renderProdTeam('weekly');
        this.renderProdManHour('weekly');
        this.renderSummaryGudang('sumBongkar', 'BONGKAR', 'weekly');
        this.renderSummaryGudang('sumMuat', 'MUAT', 'weekly');
        this.renderTungguQC('daily');
    },

    renderAbsensi: function (chartId, sourceKey, period) {
        let source = this.data[sourceKey];
        if (!source || !source.rows) return;
        let dateHeaders = source.dateHeaders || [];
        // Fallback for Absensi Harian (Legacy simple srender)
        let labels = dateHeaders;
        let startIndex = 0;
        if (period === 'weekly') startIndex = Math.max(0, labels.length - 7);
        let finalLabels = labels.slice(startIndex);
        let datasets = [];
        let teams = {};
        source.rows.forEach(row => {
            let team = row.tim.toUpperCase();
            if (!teams[team]) teams[team] = new Array(finalLabels.length).fill(0);
            let slicedAbs = row.absensi.slice(startIndex);
            slicedAbs.forEach((val, i) => { if (val === '✓') teams[team][i]++; });
        });
        const colors = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
        let i = 0;
        for (let t in teams) datasets.push({ label: t, data: teams[t], backgroundColor: colors[i++ % colors.length], borderRadius: 4 });
        this.createChart(chartId, 'bar', finalLabels, datasets);
    },

    // =========================================================
    // ABSENSI KULI HARIAN (MIRROR OF BORONG)
    // =========================================================

    currentAbsHarianPeriod: 'daily', // Initialize state variable

    initAbsHarianMonthFilter: function () {
        const headers = this.data.kuliHarian ? (this.data.kuliHarian.dateHeaders || []) : [];
        let months = new Set();

        headers.forEach(h => {
            let iso = this.normalizeDate(h);
            if (iso) months.add(iso.substring(0, 7));
        });

        const sortedMonths = Array.from(months).sort().reverse();
        const select = document.getElementById('absHarian-month-filter');
        select.innerHTML = '';

        if (sortedMonths.length === 0) {
            let opt = document.createElement('option'); opt.value = 'ALL'; opt.text = 'SHOW ALL DATA'; select.appendChild(opt);
        } else {
            sortedMonths.forEach(m => {
                let date = new Date(m + "-01");
                let label = isNaN(date.getTime()) ? m : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
            select.value = sortedMonths[0];
        }
    },

    renderAbsensiHarian: function (period) {
        this.currentAbsHarianPeriod = period;
        const source = this.data.kuliHarian;
        if (!source || !source.rows) {
            console.error("No KuliHarian Data");
            return;
        }

        const selectedMonth = document.getElementById('absHarian-month-filter').value;
        const headers = source.dateHeaders || [];

        let grouped = {};
        let targetIndices = [];

        headers.forEach((h, idx) => {
            let iso = this.normalizeDate(h);

            if (selectedMonth === 'ALL' || !iso) {
                let key = iso || h || `Col ${idx + 1}`;
                if (!grouped[key]) grouped[key] = { total: 0, teams: {} };
                targetIndices.push({ idx: idx, key: key });
            } else {
                if (period === 'monthly') {
                    let mKey = iso.substring(0, 7);
                    if (!grouped[mKey]) grouped[mKey] = { total: 0, teams: {} };
                    targetIndices.push({ idx: idx, key: mKey });
                } else {
                    if (iso.startsWith(selectedMonth)) {
                        let key = iso;
                        if (period === 'weekly') {
                            let day = parseInt(iso.split('-')[2]);
                            let weekNum = Math.ceil(day / 7);
                            key = `WEEK ${weekNum}`;
                        }
                        if (!grouped[key]) grouped[key] = { total: 0, teams: {} };
                        targetIndices.push({ idx: idx, key: key });
                    }
                }
            }
        });

        source.rows.forEach(row => {
            let teamName = row.tim.toUpperCase();
            targetIndices.forEach(t => {
                let val = row.absensi[t.idx];
                if (val && (val === '✓' || val.toString().toLowerCase() === 'v' || val == 1)) {
                    if (!grouped[t.key].teams[teamName]) grouped[t.key].teams[teamName] = 0;
                    grouped[t.key].teams[teamName]++;
                    grouped[t.key].total++;
                }
            });
        });

        const labels = Object.keys(grouped).sort();
        if (labels.length === 0) {
            const ctx = document.getElementById('chart-absHarian').getContext('2d');
            if (this.charts['absHarian']) this.charts['absHarian'].destroy();
            document.getElementById('absHarian-conclusion').innerHTML = "NO MATCHING DATA FOUND.";
            return;
        }

        let displayLabels = labels.map(l => {
            if (l.match(/^\d{4}-\d{2}-\d{2}$/)) {
                if (period === 'daily') return parseInt(l.split('-')[2]);
                return l;
            }
            if (period === 'monthly' && l.match(/^\d{4}-\d{2}$/)) {
                let d = new Date(l + "-01");
                return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
            }
            return l;
        });

        let teams = {};
        labels.forEach(l => {
            let g = grouped[l];
            for (let t in g.teams) teams[t] = true;
        });

        let datasets = [];
        const colors = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        let colorIdx = 0;

        Object.keys(teams).forEach(t => {
            let data = labels.map(l => grouped[l].teams[t] || 0);
            datasets.push({ label: t, data: data, backgroundColor: colors[colorIdx++ % colors.length], borderRadius: 4 });
        });

        const ctx = document.getElementById('chart-absHarian').getContext('2d');
        if (this.charts['absHarian']) this.charts['absHarian'].destroy();

        document.getElementById('absHarian-conclusion').innerHTML = "SELECT A BAR TO VIEW ATTENDANCE DETAILS.";

        this.charts['absHarian'] = new Chart(ctx, {
            type: 'bar',
            data: { labels: displayLabels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { grid: { display: false }, stacked: false, ticks: { color: '#94a3b8' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, stacked: false, ticks: { color: '#94a3b8' } } },
                plugins: { legend: { labels: { color: '#fff', boxWidth: 12 } } },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const key = labels[idx];
                        const groupData = grouped[key];

                        let specificIndices = targetIndices.filter(t => t.key === key);

                        document.getElementById('absHarian-detail-val').innerHTML = groupData.total + " CHECK-INS";
                        this.renderAbsHarianConclusion(period, key, groupData, source.rows, specificIndices);
                    }
                }
            }
        });

        if (selectedMonth === 'ALL' || period === 'monthly') {
            document.getElementById('absHarian-month-filter').disabled = true;
            document.getElementById('absHarian-month-filter').style.opacity = '0.5';
        } else {
            document.getElementById('absHarian-month-filter').disabled = false;
            document.getElementById('absHarian-month-filter').style.opacity = '1';
        }
    },

    renderAbsHarianConclusion: function (period, key, groupData, allRows, relevantIndices) {
        const el = document.getElementById('absHarian-conclusion');

        let rowsPresence = Object.entries(groupData.teams).map(([t, count]) => `<tr><td style="padding:4px 0;">${t}</td><td style="padding:4px 0; text-align:right; color:#f97316;">${count}</td></tr>`).join('');

        let absenteeList = [];
        let totalSlots = relevantIndices.length;

        allRows.forEach(row => {
            let missedCount = 0;
            relevantIndices.forEach(t => {
                let val = row.absensi[t.idx];
                let isPresent = (val && (val === '✓' || val.toString().toLowerCase() === 'v' || val == 1));
                if (!isPresent) missedCount++;
            });

            if (missedCount > 0 && row.tim && row.tim.trim() !== '') {
                absenteeList.push({
                    name: row.nama,
                    team: row.tim,
                    missed: missedCount,
                    rate: Math.round((missedCount / totalSlots) * 100)
                });
            }
        });

        absenteeList.sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name));

        let absenteeRows = absenteeList.map((p, index) => {
            let color = p.rate > 50 ? '#ef4444' : '#f59e0b';
            let barWidth = p.rate + '%';

            let rankDisp = `<span style="color:#64748b; font-weight:700;">#${index + 1}</span>`;
            let nameDisp = p.name;

            if (index === 0) {
                rankDisp = `<i class="fas fa-crown" style="color:#fbbf24; font-size:1rem; text-shadow:0 0 10px rgba(251, 191, 36, 0.5);"></i>`;
                nameDisp = `<span style="color:#fbbf24; font-weight:700;">${p.name}</span>`;
            } else if (index === 1) {
                rankDisp = `<span style="color:#e2e8f0; font-weight:700;">#2</span>`;
            } else if (index === 2) {
                rankDisp = `<span style="color:#b45309; font-weight:700;">#3</span>`;
            }

            return `
            <tr>
                <td style="padding:6px 8px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.05); width:40px;">
                    ${rankDisp}
                </td>
                <td style="padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight:500;">${nameDisp}</div>
                    <div style="font-size:0.7em; color:#64748b;">${p.team}</div>
                </td>
                <td style="padding:4px 8px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="color:${color}; font-weight:700;">${p.missed} <span style="font-size:0.75em; font-weight:400; color:#94a3b8;">/ ${totalSlots}</span></div>
                    <div style="background:rgba(255,255,255,0.1); h-height:3px; margin-top:2px; border-radius:2px; width:100%;">
                        <div style="background:${color}; height:3px; width:${barWidth}; border-radius:2px;"></div>
                    </div>
                </td>
            </tr>`;
        }).join('');

        if (absenteeList.length === 0) absenteeRows = `<tr><td colspan="3" style="padding:15px; text-align:center; color:#10b981; font-style:italic;">ALL PERSONNEL PRESENT (100%)</td></tr>`;

        let periodLabel = (period === 'daily') ? 'HARI INI' : (period === 'weekly' ? 'MINGGU INI' : 'BULAN INI');

        let html = `
            <div style="display:flex; gap:30px; align-items:flex-start; flex-wrap:wrap;">
                <div style="min-width:220px;">
                     <div style="margin-bottom:5px; color:#94a3b8; font-size:0.8rem;">SUMMARY KEHADIRAN</div>
                     <div style="font-size:1.8rem; font-weight:700; color:#10b981; line-height:1;">${groupData.total} <span style="font-size:1rem; font-weight:400; color:#fff;">Hadir</span></div>
                     <div style="margin-top:15px; padding-top:10px; border-top:1px solid #334155;">
                        <table style="width:100%; font-size:0.85rem; color:#cbd5e1;">${rowsPresence}</table>
                     </div>
                </div>
                <div style="flex-grow:1; max-width:650px; border-left:1px solid #334155; padding-left:25px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div>
                            <div style="color:#ef4444; font-weight:700;">TOP ABSENTEE ANALYSIS</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">Daftar orang yang tidak masuk pada periorde ${periodLabel}</div>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:1.5rem; font-weight:700; color:#fff;">${absenteeList.length}</span>
                            <div style="font-size:0.7rem; color:#94a3b8;">ORG BOLOS</div>
                        </div>
                    </div>
                    <div style="max-height:200px; overflow-y:auto; background:rgba(15, 23, 42, 0.6); border:1px solid #334155; border-radius:8px;">
                        <table style="width:100%; font-size:0.85rem; border-collapse:collapse; color:#cbd5e1;">
                            <thead style="position:sticky; top:0; background:#1e293b; z-index:1;">
                                <tr>
                                    <th style="text-align:center; padding:8px 8px; color:#94a3b8; font-weight:600; width:40px;">#</th>
                                    <th style="text-align:left; padding:8px 12px; color:#94a3b8; font-weight:600;">PERSONNEL</th>
                                    <th style="text-align:right; padding:8px 12px; color:#94a3b8; font-weight:600;">FREQ (ABSEN)</th>
                                </tr>
                            </thead>
                            <tbody>${absenteeRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        el.innerHTML = html;
    },

    // =========================================================
    // PRODUCTIVITY & OTHER CHARTS
    // =========================================================

    // =========================================================
    // PRODUCTIVITY TEAM (UPGRADED V2)
    // =========================================================

    initProdTeamMonthFilter: function () {
        const items = this.data.dailyActivity || [];
        let months = new Set();
        items.forEach(item => {
            if (item.tanggal && item.tanggal.length >= 7) {
                months.add(item.tanggal.substring(0, 7));
            }
        });

        const sortedMonths = Array.from(months).sort().reverse();
        const select = document.getElementById('prodTeam-month-filter');
        select.innerHTML = '';

        if (sortedMonths.length === 0) {
            let opt = document.createElement('option'); opt.value = 'ALL'; opt.text = 'SHOW ALL DATA'; select.appendChild(opt);
        } else {
            // Add ALL option if needed or just default to latest
            // For productivity, showing ALL history might be too much, so default to latest month
            sortedMonths.forEach(m => {
                let date = new Date(m + "-01");
                let label = isNaN(date.getTime()) ? m : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
            // select.value = sortedMonths[0]; // Auto select first
        }
    },

    renderProdTeam: function (period) {
        this.currentProdTeamPeriod = period;
        const items = this.data.dailyActivity || [];
        const selectedMonth = document.getElementById('prodTeam-month-filter').value;

        // Filter Items by Month
        let filteredItems = items.filter(item => {
            if (selectedMonth === 'ALL') return true;
            return item.tanggal && item.tanggal.startsWith(selectedMonth);
        });

        if (filteredItems.length === 0) {
            if (this.charts['prodTeam']) this.charts['prodTeam'].destroy();
            document.getElementById('prodTeam-conclusion').innerHTML = "NO DATA FOR SELECTED PERIOD.";
            return;
        }

        // Aggregate Data
        const grouped = this.groupDataByPeriod(filteredItems, period);
        const labels = Object.keys(grouped);

        // Prepare Data Arrays
        const d_badrun = labels.map(l => grouped[l].avg.prod_badrun);
        const d_kartono = labels.map(l => grouped[l].avg.prod_kartono);
        const d_kulhar = labels.map(l => grouped[l].avg.prod_kulhar);

        // Chart Rendering
        // Cleaning Labels
        const cleanLabels = labels.map(l => {
            if (l.length > 10) return l.substring(0, 10); // "2026-01-01"
            return l;
        });

        this.createChart('prodTeam', 'line', cleanLabels, [
            { label: 'BADRUN', data: d_badrun, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', tension: 0.3, fill: true, pointRadius: 3 },
            { label: 'KARTONO', data: d_kartono, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.3, fill: true, pointRadius: 3 },
            { label: 'KULHAR (ALL)', data: d_kulhar, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.3, fill: true, pointRadius: 3 }
        ], {
            // CUSTOM OPTIONS FOR BETTER VISIBILITY
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#94a3b8',
                        maxRotation: 45,
                        minRotation: 0,
                        font: { size: 10 }
                    }
                },
                y: {
                    beginAtZero: true, // Keep 0 base but let max float
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 10 }
                    }
                }
            },
            elements: {
                line: { borderWidth: 2 }
            }
        });

        // Render Conclusion
        this.renderProdTeamConclusion(period, grouped, selectedMonth);

        // Disable Month Filter if Monthly View (shows all months anyway if we passed all data, but here we filtered first??)
        // Actually for "Monthly" view we might want to show trend over YEAR. 
        // But logic above filters by selected month first.
        // If Period == 'monthly', we should probably IGNORE the specific month filter or re-label filter to "YEAR".
        // For now, let's keep it simple: "Monthly" view means "Monthly aggregates WITHIN the selected month?" -> No that's just 1 point.
        // Correct logic: If 'monthly', we likely want to see multiple months.

        // Let's adjust filtering:
        if (period === 'monthly') {
            // If monthly, unfilter specific month? No, the user might want daily breakdown of that month.
            // Wait.
            // Daily View: 1..30 of Selected Month.
            // Weekly View: Week 1..4 of Selected Month.
            // Monthly View: Jan..Dec of Selected Year? Or just show all available months?
            // Since Month Filter is robust, let's force Month Filter to be ALL if Monthly view is selected?
            // Or just disable it.
            document.getElementById('prodTeam-month-filter').disabled = true;
            document.getElementById('prodTeam-month-filter').style.opacity = '0.5';

            // RE-AGGREGATE ALL DATA for Monthly View
            const allGrouped = this.groupDataByPeriod(items, 'monthly_global');
            const allLabels = Object.keys(allGrouped);
            const allBadrun = allLabels.map(l => allGrouped[l].avg.prod_badrun);
            const allKartono = allLabels.map(l => allGrouped[l].avg.prod_kartono);
            const allKulhar = allLabels.map(l => allGrouped[l].avg.prod_kulhar);

            this.createChart('prodTeam', 'line', allLabels, [
                { label: 'BADRUN', data: allBadrun, borderColor: '#f97316', tension: 0.4 },
                { label: 'KARTONO', data: allKartono, borderColor: '#3b82f6', tension: 0.4 },
                { label: 'KULHAR', data: allKulhar, borderColor: '#10b981', tension: 0.4 }
            ]);
            this.renderProdTeamConclusion('monthly', allGrouped, 'ALL HISTORY');
        } else {
            document.getElementById('prodTeam-month-filter').disabled = false;
            document.getElementById('prodTeam-month-filter').style.opacity = '1';
        }
    },

    renderProdTeamConclusion: function (period, groupedData, periodLabel) {
        const el = document.getElementById('prodTeam-conclusion');
        const detailVal = document.getElementById('prodTeam-detail-val');

        // Calculate Totals / Averages across the visible period
        let keys = Object.keys(groupedData);
        let count = keys.length;
        if (count === 0) return;

        let sumBadrun = 0, sumKartono = 0, sumKulhar = 0;
        keys.forEach(k => {
            sumBadrun += groupedData[k].avg.prod_badrun;
            sumKartono += groupedData[k].avg.prod_kartono;
            sumKulhar += groupedData[k].avg.prod_kulhar;
        });

        let avgBadrun = Math.round(sumBadrun / count);
        let avgKartono = Math.round(sumKartono / count);
        let avgKulhar = Math.round(sumKulhar / count);

        let performers = [
            { name: "BADRUN", val: avgBadrun, color: "#f97316" },
            { name: "KARTONO", val: avgKartono, color: "#3b82f6" },
            { name: "KULHAR", val: avgKulhar, color: "#10b981" }
        ];

        performers.sort((a, b) => b.val - a.val);
        let toper = performers[0];

        // Update Top Performer Box
        detailVal.innerHTML = `<span style="color:${toper.color}">${toper.name}</span> <span style="font-size:0.6em; color:#94a3b8;">(${toper.val} kg)</span>`;

        // Render Table
        let rows = performers.map((p, idx) => {
            let rankIcon = idx === 0 ? '<i class="fas fa-crown" style="color:#fbbf24;"></i>' : `<span style="color:#64748b; font-weight:700;">#${idx + 1}</span>`;
            return `
             <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:20px; text-align:center;">${rankIcon}</div>
                    <div style="font-weight:600; color:${p.color};">${p.name}</div>
                </div>
                <div style="font-family:'Orbitron'; color:#fff;">${p.val.toLocaleString()} <span style="font-size:0.7em; color:#64748b;">kg/avg</span></div>
             </div>`;
        }).join('');

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #334155; padding-bottom:5px;">
                <span style="color:#94a3b8; font-size:0.8rem;">AVERAGE PRODUCTIVITY (${period.toUpperCase()})</span>
                <span style="color:#10b981; font-weight:700;">${count} Data Points</span>
            </div>
            ${rows}
        `;
    },

    renderProdManHour: function (period) {
        this.currentProdManHourPeriod = period;
        const items = this.data.dailyActivity || [];
        const grouped = this.groupDataByPeriod(items, period);
        const labels = Object.keys(grouped);

        // Use Average Productivity per Man Hour
        const d = labels.map(l => grouped[l].avg.prod_kulhar_ph);

        // Clean Labels
        const cleanLabels = labels.map(l => {
            if (l.length >= 10) {
                let d = new Date(l);
                if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            }
            return l;
        });

        this.createChart('prodManHour', 'bar', cleanLabels, [{
            label: 'Man-Hour Prod',
            data: d,
            backgroundColor: '#f97316',
            borderRadius: 4,
            barPercentage: 0.6
        }], {
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
        });
    },

    renderSummaryGudang: function (chartId, type, period) {
        if (chartId === 'sumBongkar') this.currentSumBongkarPeriod = period;
        else this.currentSumMuatPeriod = period;

        const items = this.data.template || [];
        const relatedItems = items.filter(row => {
            let act = (row['KEGIATAN'] || '').toUpperCase();
            return act.includes(type);
        });

        // Group by Period
        let grouped = {};
        relatedItems.forEach(row => {
            let tgl = row['TANGGAL'];
            if (!tgl) return;
            let iso = this.normalizeDate(tgl);
            if (!iso) return;

            let key = iso;
            if (period === 'monthly') key = iso.substring(0, 7);
            else if (period === 'weekly') {
                let d = new Date(iso);
                let startOfYear = new Date(d.getFullYear(), 0, 1);
                let week = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
                key = `W${week}-${d.getFullYear()}`;
            }

            if (!grouped[key]) grouped[key] = { count: 0, gudang: {} };
            grouped[key].count++;

            let gdg = (row['GUDANG'] || 'UNKNOWN').toUpperCase();
            if (!grouped[key].gudang[gdg]) grouped[key].gudang[gdg] = 0;
            grouped[key].gudang[gdg]++;
        });

        const labels = Object.keys(grouped).sort();
        const dataVals = labels.map(k => grouped[k].count);

        const cleanLabels = labels.map(l => {
            if (period === 'daily') {
                let d = new Date(l);
                return isNaN(d) ? l : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            }
            return l;
        });

        let color = type === 'BONGKAR' ? '#f97316' : '#3b82f6';

        this.createChart(chartId, 'bar', cleanLabels, [{
            label: 'Total ' + type,
            data: dataVals,
            backgroundColor: color,
            borderRadius: 4
        }], {
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
        });

        this.renderSummaryConclusion(chartId, grouped, relatedItems.length);
    },

    renderSummaryConclusion: function (chartId, grouped, totalItems) {
        const el = document.getElementById(chartId + '-conclusion');
        if (!el) return;

        let gudangCounts = {};
        Object.values(grouped).forEach(g => {
            for (let gdg in g.gudang) {
                gudangCounts[gdg] = (gudangCounts[gdg] || 0) + g.gudang[gdg];
            }
        });

        let sortedGudang = Object.entries(gudangCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        let gudangHtml = sortedGudang.map((x, i) => `
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:4px;">
                <span style="color:#94a3b8;">#${i + 1} ${x[0]}</span>
                <span style="font-weight:600; color:#fff;">${x[1]}</span>
            </div>
        `).join('');

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span style="font-weight:700; color:#fff;">TOTAL DATA: ${totalItems}</span>
                <span style="font-size:0.7em; color:#94a3b8;">Displayed Period</span>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:5px;">
                <div style="font-size:0.75rem; color:#f97316; margin-bottom:3px;">TOP LOCATIONS</div>
                ${gudangHtml || '<div style="font-style:italic; color:#64748b;">No Data</div>'}
            </div>
        `;
    },

    initTungguQCMonthFilter: function () {
        const items = this.data.template || [];
        let months = new Set();
        items.forEach(item => {
            let tgl = item['TANGGAL'];
            if (tgl) {
                let iso = this.normalizeDate(tgl);
                if (iso) months.add(iso.substring(0, 7));
            }
        });

        const sortedMonths = Array.from(months).sort().reverse();
        const select = document.getElementById('tungguQC-month-filter');
        if (!select) return;
        select.innerHTML = '';

        if (sortedMonths.length === 0) {
            let opt = document.createElement('option'); opt.value = 'ALL'; opt.text = 'SHOW ALL DATA'; select.appendChild(opt);
        } else {
            sortedMonths.forEach(m => {
                let date = new Date(m + "-01");
                let label = isNaN(date.getTime()) ? m : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
        }
    },

    renderTungguQC: function (period) {
        this.currentTungguQCPeriod = period;
        let items = this.data.template || [];
        const selectedMonth = document.getElementById('tungguQC-month-filter').value;

        let processed = [];
        items.forEach(row => {
            let tgl = row['TANGGAL'];
            let iso = this.normalizeDate(tgl);
            if (!iso) return;

            // Filter by Month
            if (selectedMonth !== 'ALL' && !iso.startsWith(selectedMonth)) return;

            let t1 = this.parseTime(row['PB_START']);
            let t2 = this.parseTime(row['TUNGGU_QC']);
            if (t1 !== null && t2 !== null) {
                let diff = t1 - t2;
                if (diff < 0) diff += 1440;
                processed.push({ tgl: iso, diff: diff }); // Use ISO date
            }
        });

        if (processed.length === 0) {
            if (this.charts['tungguQC']) this.charts['tungguQC'].destroy();
            document.getElementById('tungguQC-conclusion').innerHTML = "NO DATA FOR SELECTED PERIOD.";
            return;
        }

        let grouped = {};
        processed.forEach(p => {
            let key = p.tgl;
            if (period === 'monthly') key = p.tgl.substring(0, 7);
            else if (period === 'weekly') {
                let d = new Date(p.tgl);
                let startOfYear = new Date(d.getFullYear(), 0, 1);
                let week = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
                key = `W${week}-${d.getFullYear()}`;
            }

            if (!grouped[key]) grouped[key] = { sum: 0, count: 0, vals: [] };
            grouped[key].sum += p.diff;
            grouped[key].count++;
            grouped[key].vals.push(p.diff);
        });

        let keys = Object.keys(grouped).sort();
        let dataAvg = keys.map(k => Math.round(grouped[k].sum / grouped[k].count));

        const cleanLabels = keys.map(l => {
            if (period === 'daily') {
                let d = new Date(l);
                return isNaN(d) ? l : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            }
            return l;
        });

        const ctx = document.getElementById('chart-tungguQC');
        if (this.charts['tungguQC']) this.charts['tungguQC'].destroy();

        // Initial Conclusion (Show Overall Stats or First Point)
        document.getElementById('tungguQC-conclusion').innerHTML = "CLICK ON A POINT TO VIEW DETAILED STATISTICS.";

        this.charts['tungguQC'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: cleanLabels,
                datasets: [{
                    label: 'Avg Wait (Mins)',
                    data: dataAvg,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#fff' }, position: 'top', align: 'end' } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const key = keys[idx];
                        const groupData = grouped[key];
                        this.renderTungguQCConclusion(period, key, groupData);
                    }
                }
            }
        });
    },

    renderTungguQCConclusion: function (period, key, groupData) {
        const el = document.getElementById('tungguQC-conclusion');
        if (!el || !groupData) return;

        let allVals = groupData.vals;
        let count = groupData.count;
        let sum = groupData.sum;
        let avg = Math.round(sum / count);
        let min = Math.min(...allVals);
        let max = Math.max(...allVals);

        let label = key;
        if (period === 'daily') {
            let d = new Date(key);
            label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }

        el.innerHTML = `
            <div style="border-bottom:1px solid #334155; margin-bottom:10px; padding-bottom:5px; display:flex; justify-content:space-between; align-items:flex-end;">
                 <span style="color:#ef4444; font-weight:700; font-size:1rem;">${label}</span>
                 <span style="color:#94a3b8; font-size:0.8rem;">TOTAL TRANSAKSI: <b style="color:#fff;">${count}</b></span>
            </div>
            <div style="display:flex; justify-content:space-around; align-items:center;">
                <div style="text-align:center;">
                    <div style="font-size:1.5rem; font-weight:700; color:#ef4444;">${avg}<span style="font-size:0.8rem;">m</span></div>
                    <div style="font-size:0.7rem; color:#94a3b8;">AVG WAIT</div>
                </div>
                <div style="border-left:1px solid #334155; height:30px;"></div>
                <div style="text-align:center;">
                    <div style="font-size:1.2rem; font-weight:600; color:#fff;">${max}<span style="font-size:0.6rem;">m</span></div>
                    <div style="font-size:0.7rem; color:#94a3b8;">MAX</div>
                </div>
                <div style="border-left:1px solid #334155; height:30px;"></div>
                <div style="text-align:center;">
                    <div style="font-size:1.2rem; font-weight:600; color:#10b981;">${min}<span style="font-size:0.6rem;">m</span></div>
                    <div style="font-size:0.7rem; color:#94a3b8;">MIN</div>
                </div>
            </div>
        `;
    },

    // =========================================================
    // DATA AGGREGATION HELPERS
    // =========================================================

    createEmptyGroup: function () {
        let g = { count: 0, sum: {}, avg: {} };
        ['muat', 'bongkar', 'bongkarKulhar', 'st_badrun', 'st_kartono', 'st_kulhar', 'prod_badrun', 'prod_kartono', 'prod_kulhar', 'prod_kulhar_ph'].forEach(k => g.sum[k] = 0);
        return g;
    },

    aggregateItemToGroup: function (g, item) {
        g.count++;
        ['muat', 'bongkar', 'bongkarKulhar', 'st_badrun', 'st_kartono', 'st_kulhar', 'prod_badrun', 'prod_kartono', 'prod_kulhar', 'prod_kulhar_ph'].forEach(k => {
            g.sum[k] += (Number(item[k]) || 0);
        });
    },

    sumGroup: function (g) {
        return g.sum.muat + g.sum.bongkar + g.sum.bongkarKulhar + g.sum.st_badrun + g.sum.st_kartono + g.sum.st_kulhar;
    },

    groupDataByPeriod: function (items, period) {
        let grouped = {};
        items.forEach(item => {
            if (!item.tanggal) return;
            let key = item.tanggal;
            if (period === 'monthly_global') key = item.tanggal.substring(0, 7);
            if (!grouped[key]) grouped[key] = this.createEmptyGroup();
            this.aggregateItemToGroup(grouped[key], item);
        });

        let allKeys = Object.keys(grouped).sort();
        let filteredGroup = {};
        allKeys.forEach(k => {
            let g = grouped[k];
            ['prod_badrun', 'prod_kartono', 'prod_kulhar', 'prod_kulhar_ph'].forEach(key => { g.avg[key] = Math.round(g.sum[key] / g.count); });
            filteredGroup[k] = g;
        });
        return filteredGroup;
    },

    createChart: function (id, type, labels, datasets, options = {}) {
        const ctx = document.getElementById('chart-' + id);
        if (!ctx) return;
        if (this.charts[id]) this.charts[id].destroy();
        this.charts[id] = new Chart(ctx, {
            type: type,
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#fff' }, position: 'top', align: 'end' } },
                scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } } },
                ...options
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => AnalysApp.init());
