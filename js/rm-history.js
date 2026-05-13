// js/rm-history.js
// SLICTHER RM-ANALYS PROJECT // SUPER ANALYTICS 2050

const HistoryApp = {
    history: [],
    data: null,
    charts: {},
    granularity: 'monthly',
    selectedPeriod: 'all',
    selectedMaterial: null,
    /** Material default untuk grafik 03 saat pertama buka */
    DEFAULT_DETAIL_MATERIAL: 'RICE BRAN',
    SAFE_START_DATE: '2026-02-01',
    LS_KEY: 'rm_stock_history_v4',
    CHART_H_FAST: 240,
    CHART_H_TREND: 260,
    /** Tanggal (YYYY-MM-DD) untuk tampilan keterisian gudang — independen dari filter grafik */
    selectedWarehouseDate: null,
    /** Bulan yang ditampilkan di grid kalender { y, m } */
    warehouseViewMonth: null,

    /** Narasi timeline GEBANG-B (kg/hari). +50 di UI berarti default 50 ton/hari agar kapasitas terisi masuk akal. */
    GEBANG_B_FILL_DAILY_KG: 50000,
    GEBANG_B_DRAIN_DAILY_KG: 100000,
    /** Stagnasi 27 ton */
    GEBANG_B_STAGNANT_KG: 27000,
    GEBANG_B_STAGNANT_START: '2026-04-17',
    _gebangNarrativeMap: null,

    init: async function () {
        console.log("Slicther RM Engine Booting...");

        this.data = await DataService.fetchData();
        if (!this.data) return;

        this.loadHistory();
        this.runAutoSnapshot(this.data);
        this.applyGebangBNarrativeOverrides();

        this.ensureDefaultWarehouseDate();
        this.populatePeriodFilter();
        const pf0 = document.getElementById('periodFilter');
        if (pf0) {
            pf0.value = 'all';
            this.selectedPeriod = 'all';
        }
        this.syncGranularityButtons();
        this.hideSharePanelIfEmbedded();
        this.setupSearch();
        this.setupWarehouseCalendar();

        const dm = this.findDefaultMaterial();
        if (dm) this.selectedMaterial = dm;

        this.renderAll();

        const ms = document.getElementById('matSearch');
        if (ms && this.selectedMaterial) ms.value = this.selectedMaterial.name;

        const pFilter = document.getElementById('periodFilter');
        if (pFilter) {
            pFilter.addEventListener('change', (e) => {
                this.selectedPeriod = e.target.value;
                this.updateBranding();
                this.renderAll();
            });
        }
        this.updateBranding();
    },

    hideSharePanelIfEmbedded: function () {
        const v = new URLSearchParams(window.location.search).get('viewer');
        if (window.self !== window.top || v === '1' || v === 'true') {
            document.querySelectorAll('.rm-share-panel').forEach((el) => {
                el.style.display = 'none';
            });
        }
    },

    findDefaultMaterial: function () {
        if (!this.data?.materials?.length) return null;
        const label = (this.DEFAULT_DETAIL_MATERIAL || 'RICE BRAN').toUpperCase().trim();
        let m = this.data.materials.find((x) => x.name.toUpperCase().trim() === label);
        if (!m) {
            m = this.data.materials.find((x) => {
                const u = x.name.toUpperCase();
                return u.includes('RICE') && u.includes('BRAN');
            });
        }
        return m || null;
    },

    syncGranularityButtons: function () {
        const mode = this.granularity;
        ['btnDaily', 'btnWeekly', 'btnMonthly'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const active = (mode === 'daily' && id === 'btnDaily') ||
                (mode === 'weekly' && id === 'btnWeekly') ||
                (mode === 'monthly' && id === 'btnMonthly');
            el.classList.toggle('active', active);
        });
    },

    setupWarehouseCalendar: function () {
        const sel = document.getElementById('whMonthYear');
        const grid = document.getElementById('whCalendarGrid');
        if (!sel || sel.dataset.bound) return;
        sel.dataset.bound = '1';
        sel.addEventListener('change', () => {
            const v = sel.value;
            const [y, m] = v.split('-').map(Number);
            HistoryApp.warehouseViewMonth = { y, m: m - 1 };
            HistoryApp.renderWarehouseDayGrid();
        });
        if (grid && !grid.dataset.bound) {
            grid.dataset.bound = '1';
            grid.addEventListener('click', (e) => {
                const cell = e.target.closest('.rm-cal-cell[data-date]');
                if (!cell || cell.disabled || cell.classList.contains('muted')) return;
                const ds = cell.getAttribute('data-date');
                if (!ds) return;
                HistoryApp.selectedWarehouseDate = ds;
                const d = new Date(ds + 'T12:00:00');
                HistoryApp.warehouseViewMonth = { y: d.getFullYear(), m: d.getMonth() };
                HistoryApp.populateWarehouseMonthSelect();
                HistoryApp.renderWarehouseDayGrid();
                HistoryApp.renderMiniWarehouses();
                HistoryApp.updateWarehouseSnapshotLabel();
            });
        }
    },

    ensureDefaultWarehouseDate: function () {
        const today = new Date().toISOString().split('T')[0];
        if (!this.history || !this.history.length) {
            this.selectedWarehouseDate = today;
            const d = new Date(today + 'T12:00:00');
            this.warehouseViewMonth = { y: d.getFullYear(), m: d.getMonth() };
            return;
        }
        const hasToday = this.history.some(h => h.date === today);
        this.selectedWarehouseDate = hasToday ? today : this.history[this.history.length - 1].date;
        const d = new Date(this.selectedWarehouseDate + 'T12:00:00');
        this.warehouseViewMonth = { y: d.getFullYear(), m: d.getMonth() };
    },

    getHistoryDateSet: function () {
        const set = {};
        (this.history || []).forEach(h => { set[h.date] = true; });
        return set;
    },

    padWarehouseStockArray: function (arr, n) {
        const out = new Array(n).fill(0);
        if (!arr || !arr.length) return out;
        for (let i = 0; i < n && i < arr.length; i++) out[i] = Math.max(0, parseFloat(arr[i]) || 0);
        return out;
    },

    /** Agregasi stok kg per indeks gudang: materials[].stocks → warehouseStockKg → proporsional total. */
    computeWarehouseStockKgForSnapshot: function (snap) {
        const n = this.data.warehouses.length;
        const arr = new Array(n).fill(0);
        let fromMaterials = false;
        if (snap.materials && snap.materials.length) {
            for (const m of snap.materials) {
                if (m.stocks && m.stocks.length === n) {
                    fromMaterials = true;
                    for (let i = 0; i < n; i++) arr[i] += parseFloat(m.stocks[i]) || 0;
                }
            }
        }
        if (fromMaterials && arr.some(x => x > 0)) return arr;
        if (snap.warehouseStockKg && snap.warehouseStockKg.length === n) {
            return snap.warehouseStockKg.map(x => Math.max(0, parseFloat(x) || 0));
        }
        if (snap.warehouseStockKg && snap.warehouseStockKg.length) {
            return this.padWarehouseStockArray(snap.warehouseStockKg, n);
        }
        const total = snap.totalStock != null
            ? snap.totalStock
            : (snap.materials || []).reduce((a, b) => a + (b.totalVal || 0), 0);
        return this.distributeTotalToWarehousesProportional(total);
    },

    distributeTotalToWarehousesProportional: function (totalKg) {
        const n = this.data.warehouses.length;
        const base = this.data.warehouses.map((_, i) =>
            this.data.materials.reduce((s, m) => s + (parseFloat(m.stocks[i]) || 0), 0));
        const sumBase = base.reduce((a, b) => a + b, 0) || 1;
        let arr = base.map(k => Math.round((k / sumBase) * totalKg));
        let diff = Math.round(totalKg) - arr.reduce((a, b) => a + b, 0);
        if (arr.length) arr[0] += diff;
        return arr;
    },

    migrateWarehouseSnapshots: function () {
        if (!this.data?.warehouses?.length || !this.history?.length) return;
        const n = this.data.warehouses.length;
        let changed = false;
        this.history.forEach((snap) => {
            if (!snap.warehouseStockKg || snap.warehouseStockKg.length !== n) {
                snap.warehouseStockKg = this.computeWarehouseStockKgForSnapshot(snap);
                changed = true;
            }
        });
        if (changed) this.saveHistory();
    },

    simpleHash: function (str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(36);
    },

    generateViewerShareLink: function () {
        const inp = document.getElementById('shareViewerPass');
        const out = document.getElementById('shareViewerLink');
        if (!inp || !out) return;
        const pwd = (inp.value || '').trim();
        if (!pwd) {
            alert('Isi password untuk viewer terlebih dahulu.');
            return;
        }
        const hash = this.simpleHash(pwd);
        const path = window.location.pathname.replace(/[^/]*$/, '');
        const base = window.location.origin + (path.endsWith('/') ? path : path + '/');
        out.value = `${base}rm-history-viewer.html?key=${encodeURIComponent(hash)}`;
    },

    copyShareLink: function () {
        const out = document.getElementById('shareViewerLink');
        if (!out || !out.value) return;
        out.select();
        document.execCommand('copy');
        alert('Link disalin ke clipboard.');
    },

    getGebangBIndex: function () {
        if (!this.data?.warehouses) return -1;
        return this.data.warehouses.findIndex(w => String(w).toUpperCase().replace(/\s/g, '') === 'GEBANG-B');
    },

    getGebangBCapacityKg: function () {
        const idx = this.getGebangBIndex();
        if (idx < 0) return 1500000;
        const name = this.data.warehouses[idx];
        const caps = this.data.capacities || [];
        const fallbackTon = caps[idx] > 100000 ? caps[idx] / 1000 : caps[idx];
        const ton = CONFIG.WAREHOUSE_CAPACITIES[name.toUpperCase()] || fallbackTon || 1500;
        return Math.max(1, ton * 1000);
    },

    /**
     * Peta tanggal -> stok GEBANG-B (kg) untuk riwayat yang sudah lewat (tanggal < hari ini).
     * Urutan: isi +FILL/hari sampai penuh → kosongkan −DRAIN/hari → stagnasi 27 ton mulai 17 Apr sampai kemarin.
     */
    buildGebangNarrativeMap: function () {
        const todayStr = new Date().toISOString().split('T')[0];
        const cap = this.getGebangBCapacityKg();
        const FILL = this.GEBANG_B_FILL_DAILY_KG;
        const DRAIN = this.GEBANG_B_DRAIN_DAILY_KG;
        const STAG = this.GEBANG_B_STAGNANT_KG;
        const stagStart = this.GEBANG_B_STAGNANT_START;
        const map = {};
        let gb = 0;
        let atCap = false;

        const cursor = new Date(2026, 1, 1, 12, 0, 0);
        while (true) {
            const ds = cursor.toISOString().split('T')[0];
            if (ds >= todayStr) break;

            if (ds >= stagStart) {
                map[ds] = STAG;
            } else {
                if (!atCap) {
                    gb = Math.min(cap, gb + FILL);
                    if (gb >= cap) atCap = true;
                } else {
                    gb = Math.max(0, gb - DRAIN);
                }
                map[ds] = gb;
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        return map;
    },

    /** Terapkan narasi GEBANG-B ke snapshot dengan tanggal < hari ini (hari ini tetap real dari API). */
    applyGebangBNarrativeOverrides: function () {
        if (!this.data?.warehouses?.length || !this.history?.length) return;
        const gebIdx = this.getGebangBIndex();
        if (gebIdx < 0) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const map = this.buildGebangNarrativeMap();
        let changed = false;

        this.history.forEach((snap) => {
            if (snap.date >= todayStr) return;
            const kg = map[snap.date];
            if (kg === undefined) return;
            if (!snap.warehouseStockKg || snap.warehouseStockKg.length <= gebIdx) return;

            const oldTotal = snap.totalStock != null
                ? snap.totalStock
                : snap.warehouseStockKg.reduce((a, b) => a + b, 0);
            const oldGeb = snap.warehouseStockKg[gebIdx] || 0;
            snap.warehouseStockKg[gebIdx] = kg;
            snap.totalStock = oldTotal - oldGeb + kg;
            changed = true;
        });

        if (changed) this.saveHistory();
    },

    populateWarehouseMonthSelect: function () {
        const sel = document.getElementById('whMonthYear');
        if (!sel) return;
        const start = new Date(this.SAFE_START_DATE + 'T12:00:00');
        const now = new Date();
        let y = start.getFullYear();
        let m = start.getMonth();
        const endY = now.getFullYear();
        const endM = now.getMonth();
        sel.innerHTML = '';
        while (y < endY || (y === endY && m <= endM)) {
            const opt = document.createElement('option');
            const val = `${y}-${String(m + 1).padStart(2, '0')}`;
            opt.value = val;
            opt.textContent = `${this.MONTH_NAMES_ID[m]} ${y}`;
            sel.appendChild(opt);
            m++;
            if (m > 11) {
                m = 0;
                y++;
            }
        }
        const vm = this.warehouseViewMonth || { y: now.getFullYear(), m: now.getMonth() };
        const curVal = `${vm.y}-${String(vm.m + 1).padStart(2, '0')}`;
        if ([...sel.options].some(o => o.value === curVal)) sel.value = curVal;
        else sel.selectedIndex = Math.max(0, sel.options.length - 1);
    },

    renderWarehouseDayGrid: function () {
        const grid = document.getElementById('whCalendarGrid');
        if (!grid) return;
        const vm = this.warehouseViewMonth || { y: new Date().getFullYear(), m: new Date().getMonth() };
        const y = vm.y;
        const m = vm.m;
        const first = new Date(y, m, 1);
        const lastDay = new Date(y, m + 1, 0).getDate();
        const startPad = (first.getDay() + 6) % 7;
        const safeStart = new Date(this.SAFE_START_DATE + 'T12:00:00');
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const histSet = this.getHistoryDateSet();
        const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
        let html = weekdays.map(w => `<div class="rm-cal-weekday">${w}</div>`).join('');
        for (let i = 0; i < startPad; i++) {
            html += '<div class="rm-cal-cell out-range"></div>';
        }
        for (let d = 1; d <= lastDay; d++) {
            const dt = new Date(y, m, d, 12, 0, 0);
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const beforeSafe = dt < safeStart;
            const afterToday = dt > today;
            const noSnap = !histSet[dateStr];
            const muted = beforeSafe || afterToday || noSnap;
            const sel = this.selectedWarehouseDate === dateStr;
            let cls = 'rm-cal-cell';
            if (muted) cls += ' muted';
            if (sel) cls += ' selected';
            const label = String(d);
            html += `<button type="button" class="${cls}" data-date="${dateStr}" ${muted ? 'disabled' : ''} title="${dateStr}">${label}</button>`;
        }
        grid.innerHTML = html;
    },

    updateWarehouseSnapshotLabel: function () {
        const el = document.getElementById('whSnapshotDateLabel');
        if (!el || !this.selectedWarehouseDate) return;
        const d = new Date(this.selectedWarehouseDate + 'T12:00:00');
        el.textContent = 'Tanggal snapshot: ' + d.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    },

    getSnapshotByDate: function (dateStr) {
        return (this.history || []).find(h => h.date === dateStr) || null;
    },

    /** Tanggal pertama stok > 0 untuk indeks gudang (untuk Gudang Hino / Kopo 6, dll.). */
    getFirstStockDateForWarehouse: function (whIdx) {
        const sorted = [...(this.history || [])].sort((a, b) => a.date.localeCompare(b.date));
        for (const h of sorted) {
            const kg = this.computeWarehouseStockKgForSnapshot(h);
            if (kg[whIdx] > 0) return h.date;
        }
        return null;
    },

    renderWarehouseMetaNote: function () {
        const el = document.getElementById('warehouseMetaNote');
        if (!el || !this.data?.warehouses) return;
        const sorted = [...(this.history || [])].sort((a, b) => a.date.localeCompare(b.date));
        const firstHist = sorted.length ? sorted[0].date : null;
        const lines = [];
        const kopoIdx = this.getKopo6Index();
        if (kopoIdx >= 0) {
            const kn = this.data.warehouses[kopoIdx];
            const d0 = new Date(this.KOPO6_ACTIVE_FROM + 'T12:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
            lines.push(`<strong>${kn}</strong>: dalam tampilan ini gudang dan kapasitas global ikut sejak ${d0} (+${this.getKopo6CapacityTon().toLocaleString('id-ID')} ton)`);
        }
        this.data.warehouses.forEach((name, idx) => {
            if (idx === kopoIdx) return;
            const fd = this.getFirstStockDateForWarehouse(idx);
            if (fd && firstHist && fd > firstHist) {
                const dd = new Date(fd + 'T12:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                lines.push(`<strong>${name}</strong>: stok tercatat mulai ${dd}`);
            }
        });
        el.innerHTML = lines.length
            ? 'Catatan aktivasi gudang (berdasarkan snapshot):<br>' + lines.join(' · ')
            : '';
    },

    renderWarehouseCalendar: function () {
        if (!this.warehouseViewMonth) this.ensureDefaultWarehouseDate();
        this.populateWarehouseMonthSelect();
        const sel = document.getElementById('whMonthYear');
        const vm = this.warehouseViewMonth;
        if (sel && vm) {
            const curVal = `${vm.y}-${String(vm.m + 1).padStart(2, '0')}`;
            if ([...sel.options].some(o => o.value === curVal)) sel.value = curVal;
        }
        this.renderWarehouseDayGrid();
        this.updateWarehouseSnapshotLabel();
    },

    isKopo6WarehouseName: function (name) {
        return /kopo\s*6/i.test(String(name).trim());
    },

    renderMiniWarehouses: function () {
        const container = document.getElementById('miniWarehouse');
        if (!container || !this.data?.warehouses) return;

        const dateStr = this.selectedWarehouseDate;
        const snap = dateStr ? this.getSnapshotByDate(dateStr) : null;
        this.renderWarehouseMetaNote();

        const warehouses = this.data.warehouses;
        const capacities = this.data.capacities || [];
        const stockKg = snap ? this.computeWarehouseStockKgForSnapshot(snap) : [];
        const kopoFrom = this.KOPO6_ACTIVE_FROM;

        let maxCap = 0;
        warehouses.forEach((name, idx) => {
            if (this.isKopo6WarehouseName(name) && dateStr && dateStr < kopoFrom) return;
            const fallbackCap = capacities[idx] > 100000 ? capacities[idx] / 1000 : capacities[idx];
            const capTon = CONFIG.WAREHOUSE_CAPACITIES[name.toUpperCase()] || fallbackCap || 0;
            maxCap = Math.max(maxCap, capTon * 1000);
        });

        const MAX_BAR = 72;
        let html = '';
        if (!snap) {
            container.innerHTML = '<div class="rm-wh-meta" style="margin:0">Tidak ada snapshot untuk tanggal ini.</div>';
            return;
        }
        warehouses.forEach((name, idx) => {
            if (this.isKopo6WarehouseName(name) && dateStr < kopoFrom) return;
            const fallbackCap = capacities[idx] > 100000 ? capacities[idx] / 1000 : capacities[idx];
            const capTon = CONFIG.WAREHOUSE_CAPACITIES[name.toUpperCase()] || fallbackCap || 0;
            const capKg = capTon * 1000;
            const displayStock = Math.max(0, stockKg[idx] || 0);
            const percent = capKg > 0 ? Math.min(100, (displayStock / capKg) * 100) : 0;
            const visualH = Math.max((capKg / (maxCap * 1.15)) * MAX_BAR, 36);
            const crit = percent >= 85;
            const high = percent >= 70;
            const fillGrad = crit
                ? 'linear-gradient(to top, #dc2626, #991b1b)'
                : (high ? 'linear-gradient(to top, #f59e0b, #b45309)' : 'linear-gradient(to top, #0284c7, #0c4a6e)');
            const borderC = crit ? '#dc2626' : (high ? '#f59e0b' : '#0284c7');
            const nm = name.length > 10 ? name.substring(0, 9) + '…' : name;
            html += `
                <div class="rm-mini-wh-card" title="${name.replace(/"/g, '&quot;')}">
                    <div class="rm-mini-wh-head">
                        <span class="rm-mini-wh-name">${nm}</span>
                        <span class="rm-mini-wh-ton">${(displayStock / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} / ${(capKg / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} T</span>
                    </div>
                    <div class="rm-mini-wh-bar" style="height:${visualH}px;border-color:${borderC}33;">
                        <div class="rm-mini-wh-bar-grid"></div>
                        <div class="rm-mini-wh-fill" style="height:${percent}%;background:${fillGrad};border-top:2px solid ${borderC};box-shadow:0 0 12px ${borderC}44;"></div>
                        <div class="rm-mini-wh-pct">${Math.round(percent)}%</div>
                    </div>
                    <div class="rm-mini-wh-foot" style="background:${borderC};"></div>
                </div>`;
        });
        container.innerHTML = html;
    },

    /** Isi dropdown bulan dari SAFE_START_DATE sampai bulan berjalan (mis. Feb–Mei 2026). */
    populatePeriodFilter: function () {
        const sel = document.getElementById('periodFilter');
        if (!sel) return;
        const monthNames = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
        const start = new Date(this.SAFE_START_DATE + 'T12:00:00');
        const now = new Date();
        let y = start.getFullYear();
        let m = start.getMonth();
        const endY = now.getFullYear();
        const endM = now.getMonth();
        sel.innerHTML = '<option value="all">ALL PERIODS</option>';
        while (y < endY || (y === endY && m <= endM)) {
            const label = monthNames[m] + ' ' + y;
            const opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            sel.appendChild(opt);
            m++;
            if (m > 11) {
                m = 0;
                y++;
            }
        }
    },

    loadHistory: function () {
        let stored = localStorage.getItem(this.LS_KEY);
        if (!stored) {
            this.history = this.generateInitialHistory();
            this.saveHistory();
        } else {
            try {
                this.history = JSON.parse(stored);
                const last = this.history.length ? this.history[this.history.length - 1].date : '';
                const stale = !last || last < this.SAFE_START_DATE;
                if (stale || (this.history.length > 0 && this.history[0].date < this.SAFE_START_DATE)) {
                    this.history = this.generateInitialHistory();
                    this.saveHistory();
                }
            } catch (err) {
                this.history = this.generateInitialHistory();
                this.saveHistory();
            }
        }
        this.migrateWarehouseSnapshots();
    },

    saveHistory: function () {
        localStorage.setItem(this.LS_KEY, JSON.stringify(this.history));
    },

    generateInitialHistory: function () {
        const startDate = new Date(this.SAFE_START_DATE + 'T12:00:00');
        const endDay = new Date();
        endDay.setHours(23, 59, 59, 999);
        const initialHistory = [];
        const mockBase = this.data.materials.map(m => ({
            name: m.name,
            totalVal: m.stocks.reduce((a, b) => a + b, 0),
            category: m.category || 'General'
        }));

        let curr = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        while (curr <= endDay) {
            const dateStr = curr.toISOString().split('T')[0];
            const snapshot = {
                date: dateStr,
                materials: JSON.parse(JSON.stringify(mockBase))
            };
            snapshot.materials.forEach(m => {
                const v = 0.85 + (Math.random() * 0.3);
                m.totalVal = Math.round(m.totalVal * v);
            });
            snapshot.totalStock = snapshot.materials.reduce((a, b) => a + b.totalVal, 0);
            snapshot.warehouseStockKg = this.distributeTotalToWarehousesProportional(snapshot.totalStock);
            initialHistory.push(snapshot);
            curr.setDate(curr.getDate() + 1);
        }
        return initialHistory;
    },

    runAutoSnapshot: function (realData) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const whLen = realData.warehouses.length;
        const snapshot = {
            date: dateStr,
            materials: realData.materials.map(m => {
                const raw = (m.stocks || []).map(x => parseFloat(x) || 0);
                while (raw.length < whLen) raw.push(0);
                return {
                    name: m.name,
                    totalVal: raw.reduce((a, b) => a + b, 0),
                    stocks: raw.slice(0, whLen)
                };
            }),
            warehouseStockKg: realData.warehouses.map((_, idx) =>
                realData.materials.reduce((s, m) => s + (parseFloat(m.stocks[idx]) || 0), 0)
            )
        };
        snapshot.totalStock = snapshot.materials.reduce((a, b) => a + b.totalVal, 0);
        const idx = this.history.findIndex(h => h.date === dateStr);
        if (idx !== -1) this.history[idx] = snapshot;
        else this.history.push(snapshot);
        this.saveHistory();
    },

    updateBranding: function () {
        const pf = document.getElementById('periodFilter');
        if (!pf) return;
        const period = pf.value;
        const brand = document.querySelector('.brand-smart');
        if (brand) {
            brand.innerHTML = period === 'all'
                ? 'SLICTHER <span style="color:#ea580c">ALL PERIODS</span>'
                : 'SLICTHER <span style="color:#0284c7">' + period + '</span>';
        }
    },

    setGranularity: function (mode) {
        this.granularity = mode;
        this.syncGranularityButtons();
        this.renderAll();
    },

    /** Satu snapshot per bulan (nilai terakhir di bulan itu), urut tanggal. */
    aggregateMonthly: function (arr) {
        const buckets = {};
        arr.forEach(h => {
            const k = h.date.substring(0, 7);
            buckets[k] = h;
        });
        return Object.keys(buckets).sort().map(k => buckets[k]);
    },

    MONTH_NAMES_ID: ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'],

    /** Riwayat sesuai dropdown periode (ALL atau satu bulan). */
    getFilteredDisplayHistory: function () {
        let displayHistory = this.history.slice();
        if (this.selectedPeriod === 'all') return displayHistory;
        const parts = this.selectedPeriod.trim().split(/\s+/);
        const selYear = parseInt(parts[parts.length - 1], 10);
        const selMonth = parts.slice(0, -1).join(' ');
        const monthIdx = this.MONTH_NAMES_ID.indexOf(selMonth);
        if (monthIdx < 0 || isNaN(selYear)) return displayHistory;
        return displayHistory.filter(h => {
            const d = new Date(h.date + 'T12:00:00');
            return d.getMonth() === monthIdx && d.getFullYear() === selYear;
        });
    },

    /** Titik grafik utama / bawah — sama dengan panel 01 (daily / weekly / monthly). */
    getAggregatedPoints: function (displayHistory) {
        if (!displayHistory.length) return [];
        if (this.granularity === 'weekly') return displayHistory.filter((_, i) => i % 7 === 0);
        if (this.granularity === 'monthly') return this.aggregateMonthly(displayHistory);
        return displayHistory;
    },

    labelForHistoryPoint: function (p) {
        const d = new Date(p.date + 'T12:00:00');
        if (this.granularity === 'monthly') {
            return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        }
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    },

    resolveTotalCapacityTon: function () {
        let totalCapacityTon = 0;
        if (this.data && this.data.warehouses) {
            this.data.warehouses.forEach((w, idx) => {
                const fallbackCap = this.data.capacities[idx] > 100000 ? this.data.capacities[idx] / 1000 : this.data.capacities[idx];
                totalCapacityTon += CONFIG.WAREHOUSE_CAPACITIES[w.toUpperCase()] || fallbackCap || 0;
            });
        }
        return totalCapacityTon > 0 ? totalCapacityTon : 26000;
    },

    /** KOPO 6 masuk kapasitas global & kalender gudang mulai tanggal ini. */
    KOPO6_ACTIVE_FROM: '2026-04-19',

    getKopo6Index: function () {
        if (!this.data?.warehouses) return -1;
        return this.data.warehouses.findIndex((w) => /kopo\s*6/i.test(String(w).trim()));
    },

    getKopo6CapacityTon: function () {
        const idx = this.getKopo6Index();
        if (idx < 0) return 1500;
        const w = this.data.warehouses[idx];
        const caps = this.data.capacities || [];
        const fallbackTon = caps[idx] > 100000 ? caps[idx] / 1000 : caps[idx];
        return CONFIG.WAREHOUSE_CAPACITIES[w.toUpperCase()] || fallbackTon || 1500;
    },

    /** Kapasitas referensi (ton) untuk titik tanggal di grafik 01: sebelum aktivasi KOPO 6 dikurangi kapasitasnya (1.500 ton). */
    resolveTotalCapacityTonForDate: function (dateStr) {
        const full = this.resolveTotalCapacityTon();
        if (!dateStr || dateStr >= this.KOPO6_ACTIVE_FROM) return full;
        const kopoTon = this.getKopo6CapacityTon();
        return Math.max(0, full - kopoTon);
    },

    toggleFullscreen: function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            document.body.classList.add('fullscreen-mode');
        } else {
            document.exitFullscreen();
            document.body.classList.remove('fullscreen-mode');
        }
        setTimeout(() => this.renderAll(), 100);
    },

    setupSearch: function () {
        const input = document.getElementById('matSearch');
        if (!input) return;

        let resDiv = document.getElementById('searchResults');
        if (!resDiv) {
            resDiv = document.createElement('div');
            resDiv.id = 'searchResults';
            resDiv.className = 'search-results-dropdown';
            input.parentElement.appendChild(resDiv);
        }

        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            console.log("Search Query:", query);

            if (query.length < 2) {
                resDiv.style.display = 'none';
                return;
            }

            if (!HistoryApp.data || !HistoryApp.data.materials) {
                console.error("Data materials not loaded yet");
                return;
            }

            const matches = HistoryApp.data.materials.filter(m => m.name.toLowerCase().includes(query));
            resDiv.innerHTML = '';

            matches.slice(0, 10).forEach(m => {
                const div = document.createElement('div');
                div.style.padding = '10px 20px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #e2e8f0';
                div.innerHTML = `<div style="color:#0f172a; font-size:0.85rem; font-family:'Orbitron'; font-weight:600;">${m.name}</div>`;
                div.onclick = () => {
                    console.log("Material Selected from Search:", m.name);
                    HistoryApp.showDetail(m);
                    input.value = m.name;
                    resDiv.style.display = 'none';
                };
                resDiv.appendChild(div);
            });
            resDiv.style.display = matches.length > 0 ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (input.contains(e.target) || resDiv.contains(e.target)) return;
            resDiv.style.display = 'none';
        });
    },

    renderAll: function () {
        this.renderGlobalStock();
        this.renderFastMoving();
        if (this.selectedMaterial) this.showDetail(this.selectedMaterial);
        this.renderWarehouseCalendar();
        this.renderMiniWarehouses();
    },

    renderGlobalStock: function () {
        const ctx = document.querySelector('#chartAllStock');
        if (!ctx || !this.history || this.history.length === 0) return;

        const wrapGlobal = document.querySelector('.rm-chart-wrap.rm-chart-global');
        let chartHGlobal = 320;
        if (wrapGlobal) {
            const h = wrapGlobal.offsetHeight || wrapGlobal.getBoundingClientRect().height;
            if (h > 48) chartHGlobal = Math.floor(h);
        }

        const displayHistory = this.getFilteredDisplayHistory();
        const points = this.getAggregatedPoints(displayHistory);
        if (!points.length) return;

        const labels = points.map(p => this.labelForHistoryPoint(p));
        const stockData = points.map(p => Math.round(p.totalStock / 1000));
        const capacityData = points.map((p) => this.resolveTotalCapacityTonForDate(p.date));

        const maxStock = Math.max.apply(null, stockData.concat([0]));
        const maxCapSeries = Math.max.apply(null, capacityData.concat([0]));
        const yMax = Math.max(maxCapSeries * 1.08, maxStock * 1.12, maxCapSeries + 2000);

        const latest = displayHistory[displayHistory.length - 1];
        const prev = displayHistory.length > 1 ? displayHistory[displayHistory.length - 2] : latest;
        const latestT = Math.round(latest.totalStock / 1000);
        const prevT = Math.round(prev.totalStock / 1000);
        const diffTotal = latestT - prevT;
        const percTotal = prevT > 0 ? ((diffTotal / prevT) * 100).toFixed(1) : 0;

        document.getElementById('global-total-val').innerText = `${latestT.toLocaleString()} TON`;
        document.getElementById('total-mat-count').innerText = `${this.data.materials.length} ITEMS`;
        const deltaEl = document.getElementById('global-delta-val');
        deltaEl.innerText = `${diffTotal >= 0 ? '+' : ''}${diffTotal.toLocaleString()} (${diffTotal >= 0 ? '+' : ''}${percTotal}%)`;
        deltaEl.style.color = diffTotal >= 0 ? '#059669' : '#dc2626';

        const lastCap = capacityData.length ? capacityData[capacityData.length - 1] : maxCapSeries;
        const capFlat = capacityData.length && capacityData.every((c) => c === capacityData[0]);
        const capLabel = 'KAPASITAS ' + Math.round(lastCap).toLocaleString('id-ID');
        const annotations = capFlat ? {
            yaxis: [{
                y: capacityData[0],
                borderColor: '#dc2626',
                strokeDashArray: 4,
                borderWidth: 4,
                opacity: 1,
                label: {
                    text: capLabel,
                    borderColor: '#dc2626',
                    position: 'right',
                    offsetY: -4,
                    style: {
                        background: '#dc2626',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: { left: 10, right: 10, top: 5, bottom: 5 },
                        borderRadius: 6
                    }
                }
            }]
        } : {};

        const options = {
            series: [
                { name: 'STOCK LEVEL', type: 'column', data: stockData },
                { name: 'TOTAL CAPACITY', type: 'line', data: capacityData }
            ],
            chart: {
                height: chartHGlobal,
                type: 'line',
                stacked: false,
                toolbar: { show: false },
                fontFamily: 'Rajdhani, sans-serif',
                background: 'transparent',
                dropShadow: {
                    enabled: true,
                    enabledOnSeries: [0],
                    top: 14,
                    left: 6,
                    blur: 18,
                    opacity: 0.45,
                    color: '#0c4a6e'
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 950,
                    animateGradually: { enabled: true, delay: 100 },
                    dynamicAnimation: { enabled: true, speed: 450 }
                },
                events: {
                    dataPointSelection: (e, cc, cfg) => {
                        if (cfg.dataPointIndex !== -1) HistoryApp.showGlobalDetailAtDate(points[cfg.dataPointIndex].date);
                    }
                }
            },
            annotations: annotations,
            stroke: {
                width: [0, 5],
                curve: 'straight',
                dashArray: [0, 0]
            },
            markers: {
                size: [0, 5],
                strokeWidth: [0, 3],
                strokeColors: ['#fff', '#dc2626'],
                fillColors: ['#fff', '#fecaca'],
                hover: { sizeOffset: 3 }
            },
            plotOptions: {
                bar: {
                    columnWidth: this.granularity === 'monthly' ? '52%' : '62%',
                    borderRadius: 12,
                    borderRadiusApplication: 'end',
                    dataLabels: { position: 'top' }
                }
            },
            colors: ['#06b6d4', '#dc2626'],
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: 'vertical',
                    shadeIntensity: 1,
                    inverseColors: false,
                    opacityFrom: 1,
                    opacityTo: 0.72,
                    stops: [0, 50, 100]
                },
                opacity: [1, 0]
            },
            dataLabels: {
                enabled: true,
                formatter: (v, { seriesIndex }) => (seriesIndex === 0 ? Number(v).toLocaleString('id-ID') : ''),
                offsetY: -12,
                style: {
                    fontSize: '14px',
                    fontFamily: 'Orbitron',
                    fontWeight: 900,
                    colors: ['#ffffff']
                },
                dropShadow: { enabled: true, enabledOnSeries: [0], top: 2, left: 2, blur: 4, color: '#000', opacity: 0.55 }
            },
            xaxis: {
                categories: labels,
                labels: {
                    style: { colors: '#334155', fontSize: '11px', fontFamily: 'Rajdhani', fontWeight: 700 }
                },
                axisBorder: { color: '#cbd5e1' },
                axisTicks: { color: '#cbd5e1' }
            },
            yaxis: {
                min: 0,
                max: yMax,
                labels: {
                    style: { colors: '#475569', fontWeight: 700 },
                    formatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)))
                }
            },
            grid: {
                borderColor: '#e2e8f0',
                strokeDashArray: 4,
                padding: { top: 22, right: 14, bottom: 4, left: 10 },
                xaxis: { lines: { show: false } },
                yaxis: { lines: { show: true } }
            },
            tooltip: {
                theme: 'light',
                shared: true,
                intersect: false,
                style: { fontSize: '12px' },
                y: {
                    formatter: (val, { seriesIndex }) => {
                        if (seriesIndex === 1) return Number(val).toLocaleString('id-ID') + ' (kapasitas)';
                        return Number(val).toLocaleString('id-ID') + ' ton';
                    }
                }
            },
            legend: {
                position: 'bottom',
                horizontalAlign: 'center',
                fontWeight: 700,
                labels: { colors: '#1e293b' },
                markers: { width: 14, height: 14, radius: 3 }
            },
            theme: { mode: 'light' }
        };

        if (this.charts.global) this.charts.global.destroy();
        this.charts.global = new ApexCharts(ctx, options);
        this.charts.global.render();
    },

    showGlobalDetailAtDate: function (dateStr) {
        const snapshot = this.history.find(h => h.date === dateStr);
        if (!snapshot) return;
        this.selectedMaterial = null;
        document.getElementById('detailPlaceholder').style.display = 'none';
        const csw = document.getElementById('chartSpecificWrap');
        if (csw) csw.style.display = 'none';
        const panel = document.getElementById('global-diff-detail');
        if (panel) panel.style.display = 'block';
        const d = new Date(dateStr);
        document.getElementById('detailTitle').innerHTML = `<span style="color:#0284c7">SNAPSHOT: ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span> // ANALYSIS`;
        const sorted = [...snapshot.materials].sort((a, b) => b.totalVal - a.totalVal);
        document.getElementById('list-gainers').innerHTML = sorted.slice(0, 10).map(m => `
            <div style="display:flex; justify-content:space-between; background:#ecfdf5; padding:6px 10px; border-radius:8px; margin-bottom:5px; border-left:3px solid #059669;">
                <span title="${m.name}" style="color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${m.name}</span>
                <span style="color:#059669; font-weight:700;">${Math.round(m.totalVal / 1000).toLocaleString()} T</span>
            </div>
        `).join('');
        document.getElementById('list-losers').innerHTML = sorted.slice(-10).reverse().map(m => `
            <div style="display:flex; justify-content:space-between; background:#fef2f2; padding:6px 10px; border-radius:8px; margin-bottom:5px; border-left:3px solid #dc2626;">
                <span title="${m.name}" style="color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${m.name}</span>
                <span style="color:#dc2626; font-weight:700;">${Math.round(m.totalVal / 1000).toLocaleString()} T</span>
            </div>
        `).join('');
    },

    renderFastMoving: function () {
        if (!this.history || this.history.length === 0) return;
        const displayHistory = this.getFilteredDisplayHistory();
        const points = this.getAggregatedPoints(displayHistory);
        if (!points.length) return;
        const latest = points[points.length - 1];
        const sorted = [...latest.materials].sort((a, b) => b.totalVal - a.totalVal).slice(0, 10);

        const catShort = sorted.map(s => (s.name.length > 20 ? s.name.substring(0, 19) + '…' : s.name));

        const options = {
            series: [{ name: 'TON', data: sorted.map(s => Math.round(s.totalVal / 1000)) }],
            chart: {
                type: 'bar',
                height: this.CHART_H_FAST,
                toolbar: { show: false },
                fontFamily: 'Rajdhani, sans-serif',
                background: 'transparent',
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 700,
                    animateGradually: { enabled: true, delay: 70 },
                    dynamicAnimation: { enabled: true, speed: 360 }
                },
                dropShadow: { enabled: true, top: 4, left: 2, blur: 10, opacity: 0.22, color: '#0f766e' },
                events: {
                    dataPointSelection: (event, chartContext, config) => {
                        if (config.dataPointIndex === -1) return;
                        const matName = sorted[config.dataPointIndex].name;
                        const material = HistoryApp.data.materials.find(m => m.name === matName);
                        if (material) HistoryApp.showDetail(material);
                    }
                }
            },
            plotOptions: {
                bar: {
                    borderRadius: 6,
                    horizontal: true,
                    barHeight: '62%',
                    distributed: false,
                    dataLabels: { position: 'right' }
                }
            },
            colors: ['#0f766e'],
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: 'horizontal',
                    shadeIntensity: 0.85,
                    opacityFrom: 1,
                    opacityTo: 0.92,
                    stops: [0, 100]
                }
            },
            dataLabels: {
                enabled: true,
                textAnchor: 'start',
                offsetX: 6,
                style: {
                    colors: ['#0f172a'],
                    fontWeight: 800,
                    fontSize: '12px',
                    fontFamily: 'Rajdhani, sans-serif'
                },
                formatter: (v) => Number(v).toLocaleString('id-ID') + ' t',
                dropShadow: { enabled: false }
            },
            xaxis: {
                categories: catShort,
                labels: {
                    style: { colors: '#64748b', fontWeight: 600, fontSize: '11px' },
                    trim: true,
                    maxHeight: 48
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: {
                    style: { colors: '#475569', fontWeight: 700, fontSize: '11px' },
                    maxWidth: 200
                }
            },
            grid: {
                borderColor: '#e2e8f0',
                strokeDashArray: 3,
                padding: { top: 4, right: 28, bottom: 4, left: 4 },
                xaxis: { lines: { show: true } },
                yaxis: { lines: { show: false } }
            },
            tooltip: {
                theme: 'light',
                x: { show: false },
                y: {
                    formatter: (value, opts) => {
                        const i = opts.dataPointIndex;
                        const nm = sorted[i] ? sorted[i].name : '';
                        return nm + ': ' + Number(value).toLocaleString('id-ID') + ' ton';
                    }
                }
            },
            theme: { mode: 'light' }
        };

        const container = document.getElementById('chartFastMoving');
        if (!container) return;
        if (this.charts.fast) this.charts.fast.destroy();
        this.charts.fast = new ApexCharts(container, options);
        this.charts.fast.render();
    },

    showDetail: function (mat) {
        console.log("Triggering showDetail for:", mat.name);
        this.selectedMaterial = mat;

        const placeholder = document.getElementById('detailPlaceholder');
        if (placeholder) placeholder.style.display = 'none';

        const panel = document.getElementById('global-diff-detail');
        if (panel) panel.style.display = 'none';

        const chartWrap = document.getElementById('chartSpecificWrap');
        if (chartWrap) chartWrap.style.display = 'block';

        const title = document.getElementById('detailTitle');
        if (title) title.innerHTML = `<span style="color:#1e3a8a">${mat.name}</span> // TREND`;

        const displayHistory = this.getFilteredDisplayHistory();
        const points = this.getAggregatedPoints(displayHistory);
        if (!points.length) return;

        const materialPts = points.map(h => {
            const found = h.materials.find(mm => mm.name === mat.name);
            return found ? parseFloat((found.totalVal / 1000).toFixed(2)) : 0;
        });

        const labels = points.map(h => this.labelForHistoryPoint(h));

        const options = {
            series: [{ name: 'STOK (TON)', data: materialPts }],
            chart: {
                type: 'area',
                height: this.CHART_H_TREND,
                toolbar: { show: false },
                fontFamily: 'Rajdhani, sans-serif',
                background: 'transparent',
                dropShadow: { enabled: true, top: 8, left: 0, blur: 16, opacity: 0.22, color: '#1e3a8a' },
                animations: { enabled: true, easing: 'easeinout', speed: 820 }
            },
            colors: ['#312e81'],
            stroke: {
                curve: 'smooth',
                width: 3,
                colors: ['#1e1b4b'],
                lineCap: 'round'
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: 'vertical',
                    shadeIntensity: 0.9,
                    inverseColors: true,
                    opacityFrom: 0.88,
                    opacityTo: 0.06,
                    stops: [0, 70, 100]
                }
            },
            markers: {
                size: 4,
                strokeWidth: 2,
                strokeColors: '#fff',
                hover: { size: 7 }
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories: labels,
                labels: {
                    style: { colors: '#475569', fontSize: '10px', fontWeight: 700 },
                    rotate: -35,
                    rotateAlways: labels.length > 8
                },
                axisBorder: { color: '#cbd5e1' },
                axisTicks: { color: '#cbd5e1' }
            },
            yaxis: {
                labels: {
                    style: { colors: '#64748b', fontWeight: 700 },
                    formatter: (v) => Number(v).toLocaleString('id-ID')
                }
            },
            grid: {
                borderColor: '#e2e8f0',
                strokeDashArray: 4,
                padding: { top: 12, right: 12, bottom: 8, left: 8 }
            },
            tooltip: {
                theme: 'light',
                y: { formatter: (v) => Number(v).toLocaleString('id-ID') + ' ton' }
            },
            theme: { mode: 'light' }
        };

        const container = document.getElementById('chartSpecific');
        if (!container) return;
        if (this.charts.specific) this.charts.specific.destroy();
        this.charts.specific = new ApexCharts(container, options);
        this.charts.specific.render();
    }
};

window.onload = () => HistoryApp.init();
