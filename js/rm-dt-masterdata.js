/**
 * RM DOWNTIME MASTERDATA CONTROLLER
 * Logic for fetching, processing, and rendering operational logs & attendance
 */

const MasterApp = {
    data: null,
    currentTab: 'template',
    apiUrl: CONFIG.DOWNTIME_API_URL, // Use centralized config

    init: function () {
        console.log("Masterdata Engine Starting...");
        this.fetchData();

        // Listen for Escape key to exit fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.exitFullscreen();
        });
    },

    toggleFullscreen: function () {
        document.body.classList.toggle('fullscreen-mode');
        // Force resize recalculations if needed
    },

    exitFullscreen: function () {
        document.body.classList.remove('fullscreen-mode');
    },

    switchTab: function (tabId) {
        this.currentTab = tabId;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        event.target.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
    },

    fetchData: async function () {
        const syncEl = document.getElementById('sync-status');
        syncEl.innerText = '● SYNCING...';
        syncEl.style.color = '#ff9e0b';

        try {
            const response = await fetch(this.apiUrl);
            const json = await response.json();

            // ERROR HANDLING V7
            if (json.status === 'error') {
                throw new Error(json.message);
            }

            this.data = json;

            this.renderAll();

            syncEl.innerText = '● SYSTEM ONLINE';
            syncEl.style.color = '#10b981';
            document.getElementById('last-update').innerText = 'LAST SYNC: ' + new Date().toLocaleTimeString();
        } catch (err) {
            console.error("Fetch Error:", err);
            // Inject Mock Data for Demo if real fetch fails
            this.injectMockData();
            this.renderAll();

            syncEl.innerText = '● OFFLINE (MODE: CACHED/MOCK)';
            syncEl.style.color = '#ef4444';
        }
    },

    renderAll: function () {
        if (!this.data) return;
        this.renderTemplateTable();
        this.renderBorongTable();
        this.renderHarianTable();
        this.renderActivityTable();
    },

    // HELPER: Format Utilities
    formatCell: function (val, colName) {
        if (val === null || val === undefined || val === '') return '-';

        // Convert to string for checking
        let strVal = String(val);

        // 1. Handle DURATION / TIME (Start, Finish, Durasi, Tunggu, etc.)
        // Key keywords: START, FINISH, DURASI, TUNGGU, JAM
        if (colName && (
            colName.includes('DURASI') ||
            colName.includes('START') ||
            colName.includes('FINISH') ||
            colName.includes('TUNGGU') ||
            colName.includes('QC') // Often time related in this context
        )) {
            // If it looks like a full ISO date string (e.g. 1899-12-30T02:55:00.000Z)
            if (strVal.includes('T') && strVal.includes('Z')) {
                // Extract HH:mm
                // New Date(strVal) might be creating timezone issues, so regex is safer for simple extraction if format is consistent
                // Try standard JS date first
                let d = new Date(strVal);
                if (!isNaN(d.getTime())) {
                    // Get Hours and Minutes
                    let h = d.getHours().toString().padStart(2, '0');
                    let m = d.getMinutes().toString().padStart(2, '0');
                    return `${h}:${m}`;
                }
            }
            // If it's already H:mm or HH:mm, just return it
            return strVal;
        }

        // 2. Handle DATE (Tanggal, Tgl)
        if (colName && (colName.includes('TANGGAL') || colName.includes('TGL'))) {
            // Remove Time part if exists (e.g. 2025-11-04T17:00:00.000Z)
            if (strVal.includes('T')) {
                return strVal.split('T')[0];
            }
            return strVal;
        }

        // 3. Handle Numbers -> Thousands separator
        if (typeof val === 'number') {
            return val.toLocaleString('id-ID'); // 79906 -> 79.906
        }

        // 4. Handle Strings -> Uppercase
        if (typeof val === 'string') {
            return val.toUpperCase();
        }

        return val;
    },

    // ---------------------------------------------------------
    // RENDER TABLE 1: TEMPLATE
    // ---------------------------------------------------------
    renderTemplateTable: function () {
        const head = document.getElementById('head-template');
        const body = document.getElementById('body-template');
        const items = this.data.template || [];

        if (items.length === 0) {
            body.innerHTML = '<tr><td colspan="10" style="text-align:center;">NO DATA AVAILABLE</td></tr>';
            return;
        }

        // Auto-detect columns from first item
        const cols = Object.keys(items[0]);
        head.innerHTML = cols.map(c => `<th>${c.toUpperCase()}</th>`).join('');

        body.innerHTML = items.map(row => {
            return `<tr>${cols.map(c => {
                let val = row[c];
                // Specific Logic based on column name
                if (c.includes('TANGGAL') || c.includes('TGL')) {
                    // Script V5 already ensures yyyy-MM-dd, so just ensure no time garbage
                    // If visual format needs DD MMM YYYY, we can parse it.
                    // Assuming V5 output is "yyyy-MM-dd", let's keep it clean or format?
                    // User said: "TANGGAL JANGAN TAMPILKAN JAM". V5 already does this.
                }
                return `<td>${this.formatCell(val, c)}</td>`;
            }).join('')}</tr>`;
        }).join('');
    },

    // ---------------------------------------------------------
    // RENDER TABLE 2: KULI BORONG
    // ---------------------------------------------------------
    renderBorongTable: function () {
        const head = document.getElementById('head-borong');
        const body = document.getElementById('body-borong');
        const data = this.data.kuliBorong;

        if (!data || !data.rows || data.rows.length === 0) {
            body.innerHTML = '<tr><td colspan="5">NO DATA</td></tr>';
            return;
        }

        const fixedHeaders = ["NO", "NAMA", "TIM"];
        const dateHeaders = data.dateHeaders || [];
        const allHeaders = fixedHeaders.concat(dateHeaders);

        head.innerHTML = allHeaders.map(h => `<th>${h.toUpperCase()}</th>`).join('');

        body.innerHTML = data.rows.map(row => {
            const fixedCells = `<td>${row.no}</td><td>${row.nama.toUpperCase()}</td><td>${row.tim.toUpperCase()}</td>`;
            const absensiCells = row.absensi.map(val =>
                `<td style="text-align:center; color:${val === '✓' ? '#0aff0a' : '#64748b'}; font-weight:900;">${val}</td>`
            ).join('');
            return `<tr>${fixedCells}${absensiCells}</tr>`;
        }).join('');
    },

    // ---------------------------------------------------------
    // RENDER TABLE 3: KULI HARIAN
    // ---------------------------------------------------------
    renderHarianTable: function () {
        const head = document.getElementById('head-harian');
        const body = document.getElementById('body-harian');
        const data = this.data.kuliHarian;

        if (!data || !data.rows || data.rows.length === 0) {
            body.innerHTML = '<tr><td colspan="5">NO DATA</td></tr>';
            return;
        }

        const fixedHeaders = ["NO", "NAMA", "TIM"];
        const dateHeaders = data.dateHeaders || [];
        const allHeaders = fixedHeaders.concat(dateHeaders);

        head.innerHTML = allHeaders.map(h => `<th>${h.toUpperCase()}</th>`).join('');

        body.innerHTML = data.rows.map(row => {
            const fixedCells = `<td>${row.no}</td><td>${row.nama.toUpperCase()}</td><td>${row.tim.toUpperCase()}</td>`;
            const absensiCells = row.absensi.map(val =>
                `<td style="text-align:center; color:${val === '✓' ? '#0aff0a' : '#64748b'}; font-weight:900;">${val}</td>`
            ).join('');
            return `<tr>${fixedCells}${absensiCells}</tr>`;
        }).join('');
    },

    // ---------------------------------------------------------
    // RENDER TABLE 4: DAILY ACTIVITY
    // ---------------------------------------------------------
    renderActivityTable: function () {
        const headMerger = document.getElementById('head-activity-merger');
        const headMain = document.getElementById('head-activity-main');
        const body = document.getElementById('body-activity');
        const items = this.data.dailyActivity || [];

        // Header 1: Merger
        headMerger.innerHTML = `
            <th rowspan="2">TANGGAL</th>
            <th colspan="2" class="merger-header">OPERASIONAL</th>
            <th rowspan="2">BONGKAR KULHAR</th>
            <th colspan="5" class="merger-header">MAN POWER</th>
            <th colspan="3" class="merger-header">STAPEL</th>
            <th colspan="3" class="merger-header">PRODUCTIVITY (KG/ORG)</th>
            <th rowspan="2">PROD. PH</th>
        `;

        // Header 2: Main
        headMain.innerHTML = `
            <th>MUAT</th><th>BONGKAR</th>
            <th>BADRUN</th><th>KARTONO</th><th>SAHLAN</th><th>WAWAN</th><th>SURYANA</th>
            <th>BADRUN</th><th>KARTONO</th><th>KULHAR</th>
            <th>BADRUN</th><th>KARTONO</th><th>KULHAR</th>
        `;

        if (items.length === 0) {
            body.innerHTML = '<tr><td colspan="16" style="text-align:center;">NO ACTIVITY DATA</td></tr>';
            return;
        }

        body.innerHTML = items.map(row => `
            <tr>
                <td>${row.tanggal}</td>
                <td style="text-align:right;">${this.formatCell(row.muat)}</td>
                <td style="text-align:right;">${this.formatCell(row.bongkar)}</td>
                <td style="text-align:right;">${this.formatCell(row.bongkarKulhar)}</td>
                <td>${this.formatCell(row.mp_badrun)}</td><td>${this.formatCell(row.mp_kartono)}</td><td>${this.formatCell(row.mp_sahlan)}</td><td>${this.formatCell(row.mp_wawan)}</td><td>${this.formatCell(row.mp_suryana)}</td>
                <td>${this.formatCell(row.st_badrun)}</td><td>${this.formatCell(row.st_kartono)}</td><td>${this.formatCell(row.st_kulhar)}</td>
                <td style="color:#00f3ff; font-weight:700;">${this.formatCell(row.prod_badrun)}</td>
                <td style="color:#00f3ff; font-weight:700;">${this.formatCell(row.prod_kartono)}</td>
                <td style="color:#00f3ff; font-weight:700;">${this.formatCell(row.prod_kulhar)}</td>
                <td>${this.formatCell(row.prod_kulhar_ph)}</td>
            </tr>
        `).join('');
    },

    injectMockData: function () {
        this.data = {
            template: [
                { "NOPOL": "B 1234 XY", "JENIS RM": "PK", "GRADE": "A", "JENIS KEGIATAN": "MUAT", "TANGGAL": "2026-02-05", "DURASI DT": "00:45", "SLOC": "W11", "NETTO TS": 25000 },
                { "NOPOL": "B 5678 Z", "JENIS RM": "CPO", "GRADE": "S", "JENIS KEGIATAN": "BONGKAR", "TANGGAL": "2026-02-05", "DURASI DT": "01:20", "SLOC": "E02", "NETTO TS": 32000 }
            ],
            kuliBorong: {
                headers: ["NO", "NAMA", "TIM", "01 DEC", "02 DEC", "03 DEC"],
                rows: [
                    ["1", "AHMAD", "BADRUN", "✓", "X", "✓"],
                    ["2", "SUDIN", "BADRUN", "✓", "✓", "✓"]
                ]
            },
            kuliHarian: {
                rows: [
                    ["NO", "NAMA", "NAMA TIM", "IGNORE", "01 JAN", "02 JAN"],
                    ["1", "UCOK", "HARIAN-A", "", "✓", "✓"]
                ]
            },
            dailyActivity: [
                {
                    tanggal: "2026-02-01", muat: 10, bongkar: 15, bongkarKulhar: 5,
                    manPower: { badrun: 5, kartono: 5, sahlan: 5, wawan: 5, suryana: 5 },
                    stapel: { badrun: 1, kartono: 1, kulhar: 2 },
                    productivity: { badrun: 4500, kartono: 4200, kulhar: 3800, kulharPH: 120 }
                }
            ]
        };
    }
};

document.addEventListener('DOMContentLoaded', () => MasterApp.init());
