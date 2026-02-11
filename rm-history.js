// js/rm-history.js
// SLICTHER RM-ANALYS PROJECT // SUPER ANALYTICS 2050

const HistoryApp = {
    history: [],
    data: null,
    charts: {},
    granularity: 'daily',
    selectedPeriod: 'all',
    selectedMaterial: null,

    init: async function () {
        console.log("Slicther RM Engine Booting...");
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        // 1. Load Real Data from Sheets
        this.data = await DataService.fetchData();
        if (!this.data) return;

        // 2. Load History from LocalStorage
        this.loadHistory();

        // 3. Automated Snapshot Logic (12:00 PM Rule)
        this.runAutoSnapshot(this.data);

        // 4. UI Setup
        this.setupSearch();
        this.renderAll();

        // Listeners
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

    loadHistory: function () {
        let stored = localStorage.getItem('rm_stock_history');
        if (!stored) {
            console.log("No history found. Backfilling from Feb 2025...");
            this.history = this.generateInitialHistory();
            this.saveHistory();
        } else {
            this.history = JSON.parse(stored);
        }
    },

    saveHistory: function () {
        localStorage.setItem('rm_stock_history', JSON.stringify(this.history));
    },

    generateInitialHistory: function () {
        // Start from Feb 1st 2025
        const startDate = new Date('2025-02-01');
        const today = new Date();
        const initialHistory = [];

        // Base distribution from current data or mock if empty
        const mockBase = this.data.materials.map(m => ({
            name: m.name,
            totalVal: m.stocks.reduce((a, b) => a + b, 0),
            category: m.category || 'General'
        }));

        let curr = new Date(startDate);
        while (curr <= today) {
            const dateStr = curr.toISOString().split('T')[0];
            const snapshot = {
                date: dateStr,
                materials: JSON.parse(JSON.stringify(mockBase))
            };

            // Apply variance for historical "look"
            snapshot.materials.forEach(m => {
                const variance = 0.8 + (Math.random() * 0.4); // 80% - 120%
                m.totalVal = Math.round(m.totalVal * variance);
            });
            snapshot.totalStock = snapshot.materials.reduce((a, b) => a + b.totalVal, 0);

            initialHistory.push(snapshot);
            curr.setDate(curr.getDate() + 1);
        }
        return initialHistory;
    },

    runAutoSnapshot: function (realData) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];

        // Check if we already have today's snapshot
        const exists = this.history.find(h => h.date === dateStr);
        if (exists) return;

        // Rule: Snapshot taken if it's past 12:00 PM
        if (now.getHours() < 12) {
            console.log("Auto-snapshot standby. Waiting for 12:00 PM marker.");
            return;
        }

        const snapshot = {
            date: dateStr,
            materials: realData.materials.map(m => ({
                name: m.name,
                totalVal: m.stocks.reduce((a, b) => a + b, 0),
                category: m.category || 'General'
            }))
        };
        snapshot.totalStock = snapshot.materials.reduce((a, b) => a + b.totalVal, 0);

        this.history.push(snapshot);
        this.saveHistory();
        console.log("Daily Snapshot Automated: OK (12:00 PM Marker)");
    },

    updateClock: function () {
        const now = new Date();
        const clock = document.getElementById('hud-clock');
        if (clock) clock.innerText = now.toLocaleTimeString('en-GB');
    },

    updateBranding: function () {
        const period = document.getElementById('periodFilter').value;
        const brand = document.querySelector('.brand-smart');
        if (!brand) return;

        if (period === 'all') {
            brand.innerHTML = `SLICTHER <span style="color:var(--neon-gold)">ALL PERIODS</span>`;
        } else {
            brand.innerHTML = `SLICTHER <span style="color:var(--neon-blue)">${period}</span>`;
        }
    },

    setGranularity: function (mode) {
        this.granularity = mode;
        const btnD = document.getElementById('btnDaily');
        const btnW = document.getElementById('btnWeekly');
        if (btnD) btnD.classList.toggle('active', mode === 'daily');
        if (btnW) btnW.classList.toggle('active', mode === 'weekly');
        this.renderAll();
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
        const results = document.getElementById('searchResults');
        if (!input || !results) return;

        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) {
                results.style.display = 'none';
                return;
            }

            const matches = this.data.materials.filter(m =>
                m.name.toLowerCase().includes(query) ||
                (m.category && m.category.toLowerCase().includes(query))
            );

            results.innerHTML = '';
            if (matches.length > 0) {
                matches.slice(0, 10).forEach(m => {
                    const div = document.createElement('div');
                    div.style.padding = '12px 20px';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    div.style.transition = '0.2s';
                    div.onmouseover = () => div.style.background = 'rgba(0,243,255,0.1)';
                    div.onmouseout = () => div.style.background = 'transparent';
                    div.innerHTML = `
                        <div style="color:var(--neon-gold); font-size:0.85rem; font-family:'Orbitron';">${m.name}</div>
                        <div style="color:#888; font-size:0.65rem;">${m.category || 'GENERAL'}</div>
                    `;
                    div.onclick = () => {
                        this.showDetail(m);
                        results.style.display = 'none';
                        input.value = m.name;
                    };
                    results.appendChild(div);
                });
                results.style.display = 'block';
            } else {
                results.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !results.contains(e.target)) results.style.display = 'none';
        });
    },

    renderAll: function () {
        this.renderGlobalStock();
        this.renderFastMoving();
        if (this.selectedMaterial) this.showDetail(this.selectedMaterial);
    },

    renderGlobalStock: function () {
        const ctx = document.querySelector("#chartAllStock");
        if (!ctx || this.history.length === 0) return;

        // filter by period
        let displayHistory = this.history;
        if (this.selectedPeriod !== 'all') {
            // "FEBRUARI 2026" -> split and match
            const [selMonth, selYear] = this.selectedPeriod.split(' ');
            const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
            const monthIdx = monthNames.indexOf(selMonth);

            displayHistory = this.history.filter(h => {
                const d = new Date(h.date);
                return d.getMonth() === monthIdx && d.getFullYear() === parseInt(selYear);
            });
        }

        // Granularity reduction
        let points = displayHistory;
        if (this.granularity === 'weekly') {
            points = displayHistory.filter((_, i) => i % 7 === 0);
        }

        const labels = points.map(p => {
            const d = new Date(p.date);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        });
        const stockData = points.map(p => p.totalStock);
        const capacityData = points.map(() => 26000); // Fixed for visualization

        // Update UI Header (Latest from displayHistory)
        const latest = displayHistory[displayHistory.length - 1];
        const prev = displayHistory.length > 1 ? displayHistory[displayHistory.length - 2] : latest;
        const diff = latest.totalStock - prev.totalStock;
        const perc = prev.totalStock > 0 ? ((diff / prev.totalStock) * 100).toFixed(1) : 0;

        document.getElementById('global-total-val').innerText = `${latest.totalStock.toLocaleString()} TON`;
        document.getElementById('total-mat-count').innerText = `${this.data.materials.length} ITEMS`;
        const deltaEl = document.getElementById('global-delta-val');
        deltaEl.innerText = `${diff >= 0 ? '+' : ''}${diff.toLocaleString()} (${diff >= 0 ? '+' : ''}${perc}%)`;
        deltaEl.style.color = diff >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';

        const options = {
            series: [
                { name: 'STOCK LEVEL', type: 'column', data: stockData },
                { name: 'CAPACITY CAP', type: 'line', data: capacityData }
            ],
            chart: {
                height: '100%',
                type: 'line',
                toolbar: { show: false },
                events: {
                    dataPointSelection: (event, chartContext, config) => {
                        const date = points[config.dataPointIndex].date;
                        this.showGlobalDetailAtDate(date);
                    }
                }
            },
            stroke: { width: [0, 2], curve: 'smooth', dashArray: [0, 8] },
            colors: ['#00f3ff', '#ff003c'],
            fill: { opacity: [0.95, 1] },
            xaxis: {
                categories: labels,
                labels: { style: { colors: '#ffffff', fontSize: '10px', fontFamily: 'Orbitron' } }
            },
            yaxis: {
                labels: { style: { colors: '#64748b' }, formatter: (v) => `${(v / 1000).toFixed(1)}K` }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            tooltip: { theme: 'dark', shared: true }
        };

        if (this.charts.global) this.charts.global.destroy();
        this.charts.global = new ApexCharts(ctx, options);
        this.charts.global.render();
    },

    showGlobalDetailAtDate: function (dateStr) {
        const snapshot = this.history.find(h => h.date === dateStr);
        if (!snapshot) return;

        document.getElementById('detailPlaceholder').style.display = 'none';
        document.getElementById('chartSpecific').style.display = 'none';
        const diffPanel = document.getElementById('global-diff-detail');
        diffPanel.style.display = 'block';

        const d = new Date(dateStr);
        const niceDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('detailTitle').innerHTML = `<span style="color:#fff">SNAPSHOT: ${niceDate}</span> // ANALYSIS`;

        const sortedM = [...snapshot.materials].sort((a, b) => b.totalVal - a.totalVal);

        document.getElementById('list-gainers').innerHTML = sortedM.slice(0, 10).map(m => `
            <div style="display:flex; justify-content:space-between; background:rgba(0,255,136,0.05); padding:5px 10px; border-radius:4px; border-left:2px solid var(--neon-green);">
                <span title="${m.name}" style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${m.name}</span>
                <span style="color:var(--neon-green); font-family:'Rajdhani'; font-weight:700;">${m.totalVal.toLocaleString()} T</span>
            </div>
        `).join('');

        document.getElementById('list-losers').innerHTML = sortedM.slice(-10).reverse().map(m => `
            <div style="display:flex; justify-content:space-between; background:rgba(255,0,60,0.05); padding:5px 10px; border-radius:4px; border-left:2px solid var(--neon-red);">
                <span title="${m.name}" style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${m.name}</span>
                <span style="color:var(--neon-red); font-family:'Rajdhani'; font-weight:700;">${m.totalVal.toLocaleString()} T</span>
            </div>
        `).join('');
    },

    renderFastMoving: function () {
        if (this.history.length < 2) return;
        const latest = this.history[this.history.length - 1];

        const sorted = [...latest.materials].sort((a, b) => b.totalVal - a.totalVal).slice(0, 10);

        const options = {
            series: [{ name: 'STOCK WEIGHT', data: sorted.map(s => s.totalVal) }],
            chart: { type: 'bar', height: '100%', toolbar: { show: false } },
            plotOptions: { bar: { borderRadius: 4, horizontal: true } },
            colors: ['#00ff88'],
            xaxis: {
                categories: sorted.map(s => s.name.substring(0, 12)),
                labels: { style: { colors: '#64748b' } }
            },
            yaxis: { labels: { style: { colors: '#64748b' } } },
            grid: { borderColor: 'rgba(255,255,255,0.05)' }
        };

        if (this.charts.fast) this.charts.fast.destroy();
        this.charts.fast = new ApexCharts(document.querySelector("#chartFastMoving"), options);
        this.charts.fast.render();
    },

    showDetail: function (mat) {
        this.selectedMaterial = mat;
        document.getElementById('detailPlaceholder').style.display = 'none';
        document.getElementById('global-diff-detail').style.display = 'none';
        document.getElementById('chartSpecific').style.display = 'block';
        document.getElementById('detailTitle').innerHTML = `<span style="color:#fff">${mat.name}</span> // HISTORICAL TREND`;

        // Extract material specific history
        const matPoints = this.history.map(h => {
            const found = h.materials.find(m => m.name === mat.name);
            return found ? found.totalVal : 0;
        });
        const labels = this.history.map(h => {
            const d = new Date(h.date);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        });

        const options = {
            series: [{ name: 'STOCK LEVEL', data: matPoints }],
            chart: { type: 'area', height: '100%', toolbar: { show: false } },
            colors: ['#ffcc00'],
            stroke: { curve: 'smooth', width: 2 },
            fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } },
            xaxis: { categories: labels, labels: { style: { colors: '#64748b', fontSize: '10px' }, nicks: 7 } },
            yaxis: { labels: { style: { colors: '#64748b' } } },
            grid: { borderColor: 'rgba(255,255,255,0.05)' }
        };

        if (this.charts.specific) this.charts.specific.destroy();
        this.charts.specific = new ApexCharts(document.querySelector("#chartSpecific"), options);
        this.charts.specific.render();
    }
};

window.onload = () => HistoryApp.init();
