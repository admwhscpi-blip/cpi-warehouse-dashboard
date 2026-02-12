// js/rm-history.js
// SLICTHER RM-ANALYS PROJECT // SUPER ANALYTICS 2050

const HistoryApp = {
    history: [],
    data: null,
    charts: {},
    granularity: 'daily',
    selectedPeriod: 'all',
    selectedMaterial: null,
    SAFE_START_DATE: '2026-02-01',

    init: async function () {
        console.log("Slicther RM Engine Booting...");
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        this.data = await DataService.fetchData();
        if (!this.data) return;

        this.loadHistory();
        this.runAutoSnapshot(this.data);

        this.setupSearch();
        this.renderAll();

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
            this.history = this.generateInitialHistory();
            this.saveHistory();
        } else {
            try {
                this.history = JSON.parse(stored);
                if (this.history.length > 0 && this.history[0].date < this.SAFE_START_DATE) {
                    this.history = this.generateInitialHistory();
                    this.saveHistory();
                }
            } catch (err) {
                this.history = this.generateInitialHistory();
                this.saveHistory();
            }
        }
    },

    saveHistory: function () {
        localStorage.setItem('rm_stock_history', JSON.stringify(this.history));
    },

    generateInitialHistory: function () {
        const startDate = new Date(this.SAFE_START_DATE);
        const today = new Date();
        const initialHistory = [];
        const mockBase = this.data.materials.map(m => ({
            name: m.name,
            totalVal: m.stocks.reduce((a, b) => a + b, 0),
            category: m.category || 'General'
        }));

        let curr = new Date(startDate);
        while (curr < today) {
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
            initialHistory.push(snapshot);
            curr.setDate(curr.getDate() + 1);
        }
        return initialHistory;
    },

    runAutoSnapshot: function (realData) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const snapshot = {
            date: dateStr,
            materials: realData.materials.map(m => ({
                name: m.name,
                totalVal: m.stocks.reduce((a, b) => a + b, 0)
            }))
        };
        snapshot.totalStock = snapshot.materials.reduce((a, b) => a + b.totalVal, 0);
        const idx = this.history.findIndex(h => h.date === dateStr);
        if (idx !== -1) this.history[idx] = snapshot;
        else this.history.push(snapshot);
        this.saveHistory();
    },

    updateClock: function () {
        const now = new Date();
        const clock = document.getElementById('hud-clock');
        if (clock) clock.innerText = now.toLocaleTimeString('en-GB');
    },

    updateBranding: function () {
        const period = document.getElementById('periodFilter').value;
        const brand = document.querySelector('.brand-smart');
        if (brand) brand.innerHTML = period === 'all' ? `SLICTHER <span style="color:var(--neon-gold)">ALL PERIODS</span>` : `SLICTHER <span style="color:var(--neon-blue)">${period}</span>`;
    },

    setGranularity: function (mode) {
        this.granularity = mode;
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
        if (!input) return;
        let resDiv = document.getElementById('searchResults');
        if (!resDiv) {
            resDiv = document.createElement('div');
            resDiv.id = 'searchResults';
            resDiv.style.position = 'absolute';
            resDiv.style.top = '100%';
            resDiv.style.left = '0';
            resDiv.style.width = '100%';
            resDiv.style.background = '#0a0a0a';
            resDiv.style.border = '1px solid var(--neon-blue)';
            resDiv.style.zIndex = '2000';
            resDiv.style.display = 'none';
            resDiv.style.borderRadius = '0 0 10px 10px';
            input.parentElement.appendChild(resDiv);
        }
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) { resDiv.style.display = 'none'; return; }
            const matches = this.data.materials.filter(m => m.name.toLowerCase().includes(query));
            resDiv.innerHTML = '';
            matches.slice(0, 10).forEach(m => {
                const div = document.createElement('div');
                div.style.padding = '10px 20px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                div.innerHTML = `<div style="color:var(--neon-gold); font-size:0.85rem; font-family:'Orbitron';">${m.name}</div>`;
                div.onclick = () => { this.showDetail(m); input.value = m.name; resDiv.style.display = 'none'; };
                resDiv.appendChild(div);
            });
            resDiv.style.display = matches.length > 0 ? 'block' : 'none';
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

        let displayHistory = this.history;
        if (this.selectedPeriod !== 'all') {
            const [selMonth, selYear] = this.selectedPeriod.split(' ');
            const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
            const monthIdx = monthNames.indexOf(selMonth);
            displayHistory = this.history.filter(h => {
                const d = new Date(h.date);
                return d.getMonth() === monthIdx && d.getFullYear() === parseInt(selYear);
            });
        }

        const points = this.granularity === 'weekly' ? displayHistory.filter((_, i) => i % 7 === 0) : displayHistory;
        const labels = points.map(p => {
            const d = new Date(p.date);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        });

        const stockData = points.map(p => Math.round(p.totalStock / 1000));
        const capacityData = points.map(() => 26000);

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
        deltaEl.style.color = diffTotal >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';

        const annotations = [];
        for (let i = 0; i < stockData.length; i++) {
            const cur = stockData[i];
            const pre = i > 0 ? stockData[i - 1] : cur;
            const delta = cur - pre;
            const p = pre > 0 ? ((delta / pre) * 100).toFixed(1) : 0;
            const free = 26000 - cur;
            const sign = delta >= 0 ? '+' : '';
            const color = delta >= 0 ? '#00ff88' : '#ff003c';

            annotations.push({
                x: labels[i],
                y: 26000,
                marker: { size: 0 },
                label: {
                    borderColor: 'transparent',
                    offsetY: -55,
                    style: {
                        color: '#fff',
                        background: 'rgba(5,5,5,0.95)',
                        fontSize: '10px',
                        fontWeight: 900,
                        fontFamily: 'Orbitron',
                        padding: { left: 8, right: 8, top: 4, bottom: 4 }
                    },
                    text: `${free.toLocaleString()}\n${sign}${delta.toLocaleString()}\n${sign}${p}%`
                }
            });
        }

        const options = {
            series: [{ name: 'STOCK LEVEL', type: 'column', data: stockData }, { name: 'TOTAL CAPACITY', type: 'line', data: capacityData }],
            chart: {
                height: '100%', type: 'line', toolbar: { show: false },
                events: { dataPointSelection: (e, cc, cfg) => { this.showGlobalDetailAtDate(points[cfg.dataPointIndex].date); } }
            },
            annotations: { points: annotations },
            stroke: { width: [0, 2], curve: 'smooth', dashArray: [0, 8] },
            colors: ['#00f3ff', '#ff003c'],
            fill: { opacity: [0.95, 1] },
            dataLabels: {
                enabled: true,
                formatter: (v, { seriesIndex }) => (seriesIndex === 0 ? `${v.toLocaleString()}` : ''),
                style: { fontSize: '9px', fontFamily: 'Orbitron', colors: ['#000'] },
                offsetY: 10
            },
            xaxis: {
                categories: labels,
                labels: { style: { colors: '#ffffff', fontSize: '10px', fontFamily: 'Orbitron' } }
            },
            yaxis: {
                labels: { style: { colors: '#64748b' }, formatter: (v) => `${(v / 1000).toFixed(0)}K` },
                max: 30000
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            tooltip: {
                theme: 'dark', shared: true,
                y: {
                    formatter: function (val, { series, seriesIndex, dataPointIndex }) {
                        if (seriesIndex === 0 && dataPointIndex > 0) {
                            const pVal = series[seriesIndex][dataPointIndex - 1];
                            const d = val - pVal;
                            const p = pVal > 0 ? ((d / pVal) * 100).toFixed(1) : 0;
                            const s = d >= 0 ? '+' : '';
                            return `${val.toLocaleString()} TON <br><span style="color:${d >= 0 ? '#00ff88' : '#ff003c'}">(${s}${d.toLocaleString()} / ${s}${p}%)</span>`;
                        }
                        return `${val.toLocaleString()} TON`;
                    }
                }
            },
            legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: '#fff' } }
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
        const panel = document.getElementById('global-diff-detail');
        if (panel) panel.style.display = 'block';
        const d = new Date(dateStr);
        document.getElementById('detailTitle').innerHTML = `<span style="color:#fff">SNAPSHOT: ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span> // ANALYSIS`;
        const sorted = [...snapshot.materials].sort((a, b) => b.totalVal - a.totalVal);
        document.getElementById('list-gainers').innerHTML = sorted.slice(0, 10).map(m => `
            <div style="display:flex; justify-content:space-between; background:rgba(0,255,136,0.05); padding:5px 10px; border-radius:4px; margin-bottom:4px; border-left:2px solid var(--neon-green);">
                <span title="${m.name}" style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${m.name}</span>
                <span style="color:var(--neon-green); font-weight:700;">${Math.round(m.totalVal / 1000).toLocaleString()} T</span>
            </div>
        `).join('');
        document.getElementById('list-losers').innerHTML = sorted.slice(-10).reverse().map(m => `
            <div style="display:flex; justify-content:space-between; background:rgba(255,0,60,0.05); padding:5px 10px; border-radius:4px; margin-bottom:4px; border-left:2px solid var(--neon-red);">
                <span title="${m.name}" style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${m.name}</span>
                <span style="color:var(--neon-red); font-weight:700;">${Math.round(m.totalVal / 1000).toLocaleString()} T</span>
            </div>
        `).join('');
    },

    renderFastMoving: function () {
        if (this.history.length === 0) return;
        const latest = this.history[this.history.length - 1];
        const sorted = [...latest.materials].sort((a, b) => b.totalVal - a.totalVal).slice(0, 10);
        const options = {
            series: [{ name: 'STOCK WEIGHT', data: sorted.map(s => Math.round(s.totalVal / 1000)) }],
            chart: { type: 'bar', height: '100%', toolbar: { show: false } },
            plotOptions: { bar: { borderRadius: 4, horizontal: true } },
            colors: ['#00ff88'],
            xaxis: { categories: sorted.map(s => s.name.substring(0, 12)), labels: { style: { colors: '#64748b' } } },
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
        const panel = document.getElementById('global-diff-detail');
        if (panel) panel.style.display = 'none';
        const chartSpec = document.getElementById('chartSpecific');
        if (chartSpec) chartSpec.style.display = 'block';
        document.getElementById('detailTitle').innerHTML = `<span style="color:#fff">${mat.name}</span> // TREND`;
        const points = this.history.map(h => {
            const found = h.materials.find(m => m.name === mat.name);
            return found ? parseFloat((found.totalVal / 1000).toFixed(2)) : 0;
        });
        const labels = this.history.map(h => {
            const d = new Date(h.date);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        });
        const options = {
            series: [{ name: 'STOCK LEVEL', data: points }],
            chart: { type: 'area', height: '100%', toolbar: { show: false } },
            colors: ['#ffcc00'],
            stroke: { curve: 'smooth', width: 2 },
            xaxis: { categories: labels, labels: { style: { colors: '#64748b', fontSize: '10px' } } },
            yaxis: { labels: { style: { colors: '#64748b' } } },
            grid: { borderColor: 'rgba(255,255,255,0.05)' }
        };
        if (this.charts.specific) this.charts.specific.destroy();
        this.charts.specific = new ApexCharts(document.querySelector("#chartSpecific"), options);
        this.charts.specific.render();
    }
};

window.onload = () => HistoryApp.init();
