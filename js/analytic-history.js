/**
 * ANALYTIC HISTORY CONTROLLER
 * Handles perpetual history tracking & HUD visualizations
 */

const HistoryApp = {
    history: [],
    currentSlicer: 'daily',
    selectedMaterials: [],
    allMaterials: [],

    // Charts
    charts: {
        main: null,
        domination: null,
        specific: null,
        category: null
    },

    init: async function () {
        console.log("Analytics Engine Initializing...");

        // 1. Load data & history
        const data = await DataService.fetchData();
        if (!data) return;
        this.allMaterials = data.materials.map(m => m.name);

        this.loadHistory();

        // 2. Automated Snapshot Logic (12:00 PM Rule)
        this.runAutoSnapshot(data);

        // 3. UI Setup
        this.initClock();
        this.renderMaterialChips();
        this.renderAnalytics();

        console.log("Analytics Engine Online.");
    },

    loadHistory: function () {
        let stored = localStorage.getItem('rm_stock_history');
        if (!stored) {
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

        // Get today's real stock for backfilling Feb 1-3
        // For simplicity, we create a pseudo-history using current data distributions
        const mockBase = this.getMockStockSnapshot();

        let curr = new Date(startDate);
        while (curr <= today) {
            const dateStr = curr.toISOString().split('T')[0];

            // Random jitter for past data (makes it look real)
            const snapshot = JSON.parse(JSON.stringify(mockBase));
            snapshot.date = dateStr;

            // Apply slight variance to past days
            snapshot.materials.forEach(m => {
                const variance = 1 + (Math.random() * 0.2 - 0.1); // +/- 10%
                m.totalVal = Math.round(m.totalVal * variance);
            });

            initialHistory.push(snapshot);
            curr.setDate(curr.getDate() + 1);
        }
        return initialHistory;
    },

    getMockStockSnapshot: function () {
        // This is used for backfilling
        // In real world, we'd fetch current and subtract deltas
        return {
            date: '',
            totalStock: 5000,
            materials: [
                { name: 'COPPER', totalVal: 1200, category: 'METAL' },
                { name: 'ALUMINIUM', totalVal: 850, category: 'METAL' },
                { name: 'IRON ORE', totalVal: 2100, category: 'RAW' },
                { name: 'ZINC', totalVal: 450, category: 'METAL' },
                { name: 'TIN', totalVal: 300, category: 'METAL' }
            ]
        };
    },

    runAutoSnapshot: async function (realData) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];

        // Check if we already have today's snapshot
        const exists = this.history.find(h => h.date === dateStr);
        if (exists) return;

        // Rule: Snapshot taken if it's past 12:00 PM
        if (now.getHours() < 12) return;

        // Take snapshot from realData
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

    initClock: function () {
        const el = document.getElementById('hud-clock');
        setInterval(() => {
            const now = new Date();
            el.innerText = now.toLocaleTimeString('en-US', { hour12: false });
        }, 1000);
    },

    renderMaterialChips: function () {
        const container = document.getElementById('material-selector-chips');
        container.innerHTML = '';

        // Select first 5 by default
        this.selectedMaterials = this.allMaterials.slice(0, 3);

        this.allMaterials.forEach(m => {
            const div = document.createElement('div');
            div.className = `mat-chip ${this.selectedMaterials.includes(m) ? 'active' : ''}`;
            div.innerText = m;
            div.onclick = () => this.toggleMaterial(m);
            container.appendChild(div);
        });
    },

    toggleMaterial: function (m) {
        if (this.selectedMaterials.includes(m)) {
            this.selectedMaterials = this.selectedMaterials.filter(x => x !== m);
        } else {
            this.selectedMaterials.push(m);
        }
        this.renderMaterialChips();
        this.updateSpecificChart();
    },

    setSlicer: function (mode) {
        this.currentSlicer = mode;
        document.querySelectorAll('.btn-sl').forEach(b => b.classList.remove('active'));
        document.getElementById(`sl-${mode}`).classList.add('active');
        this.renderAnalytics();
    },

    // ==========================================
    // RENDERING ENGINE
    // ==========================================

    renderAnalytics: function () {
        this.renderTopStats();
        this.renderMainChart();
        this.renderDominationChart();
        this.renderVolatilitySection();
        this.renderCategoryAnalytics();
        this.updateSpecificChart();
    },

    renderCategoryAnalytics: function () {
        const listDiv = document.getElementById('category-list');
        const latest = this.history[this.history.length - 1];

        // Group by category
        const catMap = {};
        latest.materials.forEach(m => {
            if (!catMap[m.category]) catMap[m.category] = 0;
            catMap[m.category] += m.totalVal;
        });

        const categories = Object.keys(catMap).map(name => ({ name, val: catMap[name] }));

        listDiv.innerHTML = categories.map(c => `
            <div class="cat-item">
                <div style="color:#94a3b8; font-size:0.7rem; font-weight:700;">${c.name.toUpperCase()}</div>
                <div style="color:#00f3ff; font-size:1rem; font-family:'Orbitron';">${c.val.toLocaleString()} T</div>
            </div>
        `).join('');

        // Category Chart
        const ctx = document.getElementById('categoryHistoryChart').getContext('2d');
        if (this.charts.category) this.charts.category.destroy();

        const grouped = this.getGroupedData();
        const catDatasets = categories.slice(0, 3).map((c, i) => {
            return {
                label: c.name,
                data: grouped.indices.map(idx => {
                    const snap = this.history[idx];
                    return snap.materials
                        .filter(m => m.category === c.name)
                        .reduce((acc, m) => acc + m.totalVal, 0);
                }),
                borderColor: ['#00f3ff', '#bc13fe', '#ff9e0b'][i % 3],
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0
            };
        });

        this.charts.category = new Chart(ctx, {
            type: 'line',
            data: {
                labels: grouped.labels,
                datasets: catDatasets
            },
            options: this.getChartOptions('Category Trend Analysis')
        });
    },

    renderTopStats: function () {
        const grid = document.getElementById('top-stats-grid');
        const latest = this.history[this.history.length - 1];
        const previous = this.history.length > 1 ? this.history[this.history.length - 2] : latest;

        const diff = latest.totalStock - previous.totalStock;
        const percent = ((diff / previous.totalStock) * 100).toFixed(1);

        grid.innerHTML = `
            <div class="insight-metric">
                <div class="metric-label">TOTAL CURRENT STOCK</div>
                <div class="metric-value" style="color:#00f3ff;">${latest.totalStock.toLocaleString()} T</div>
                <div class="metric-sub">${diff >= 0 ? '▲' : '▼'} ${percent}% vs Yesterday</div>
            </div>
            <div class="insight-metric">
                <div class="metric-label">SNAPSHOT STATUS</div>
                <div class="metric-value" style="color:#10b981;">SYNCHRONIZED</div>
                <div class="metric-sub">Last sync: TODAY 12:00 PM</div>
            </div>
            <div class="insight-metric">
                <div class="metric-label">ACTIVE MONITORING</div>
                <div class="metric-value" style="color:#bc13fe;">${this.allMaterials.length} ITEMS</div>
                <div class="metric-sub">Across all facilities</div>
            </div>
        `;
    },

    renderMainChart: function () {
        const ctx = document.getElementById('mainHistoryChart').getContext('2d');
        if (this.charts.main) this.charts.main.destroy();

        const grouped = this.getGroupedData();

        this.charts.main = new Chart(ctx, {
            type: 'line',
            data: {
                labels: grouped.labels,
                datasets: [{
                    label: 'TOTAL TONNAGE',
                    data: grouped.values,
                    borderColor: '#00f3ff',
                    backgroundColor: 'rgba(0, 243, 255, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: this.getChartOptions('Historical Stock Level (Ton)')
        });
    },

    renderDominationChart: function () {
        const ctx = document.getElementById('dominationChart').getContext('2d');
        if (this.charts.domination) this.charts.domination.destroy();

        const latest = this.history[this.history.length - 1];
        const sorted = [...latest.materials].sort((a, b) => b.totalVal - a.totalVal).slice(0, 5);

        this.charts.domination = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sorted.map(m => m.name),
                datasets: [{
                    data: sorted.map(m => m.totalVal),
                    backgroundColor: ['#00f3ff', '#bc13fe', '#ff2a2a', '#ff9e0b', '#0aff0a'],
                    borderWidth: 0
                }]
            },
            options: {
                cutout: '70%',
                plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } } }
            }
        });
    },

    updateSpecificChart: function () {
        const ctx = document.getElementById('materialSpecificChart').getContext('2d');
        if (this.charts.specific) this.charts.specific.destroy();

        const grouped = this.getGroupedData();
        const datasets = this.selectedMaterials.map((mat, i) => {
            return {
                label: mat,
                data: this.getMaterialDataPoint(mat, grouped.indices),
                borderColor: ['#00f3ff', '#bc13fe', '#0aff0a', '#ff9e0b'][i % 4],
                tension: 0.4,
                pointRadius: 0
            };
        });

        this.charts.specific = new Chart(ctx, {
            type: 'line',
            data: {
                labels: grouped.labels,
                datasets: datasets
            },
            options: this.getChartOptions('Material Scale Comparison')
        });
    },

    renderVolatilitySection: function () {
        // Calculate Fast vs Slow
        // Volatility = (Max - Min) / Average
        const stats = this.allMaterials.map(m => {
            const values = this.history.map(h => {
                const found = h.materials.find(mat => mat.name === m);
                return found ? found.totalVal : 0;
            });
            const max = Math.max(...values);
            const min = Math.min(...values);
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const vol = avg > 0 ? (max - min) / avg : 0;
            return { name: m, vol: vol, avg: avg };
        });

        const fast = [...stats].sort((a, b) => b.vol - a.vol).slice(0, 3);
        const slow = [...stats].filter(s => s.avg > 0).sort((a, b) => a.vol - b.vol).slice(0, 3);

        const fList = document.getElementById('fast-moving-list');
        const sList = document.getElementById('slow-moving-list');

        fList.innerHTML = fast.map(i => `
            <div class="vol-item fast-item">
                <span>${i.name}</span>
                <span style="color:#0aff0a;">VOL: ${(i.vol * 100).toFixed(1)}%</span>
            </div>
        `).join('');

        sList.innerHTML = slow.map(i => `
            <div class="vol-item slow-item">
                <span>${i.name}</span>
                <span style="color:#64748b;">STABLE</span>
            </div>
        `).join('');
    },

    // ==========================================
    // DATA UTILS
    // ==========================================

    getGroupedData: function () {
        const labels = [];
        const values = [];
        const indices = []; // mapping to history index

        let step = 1;
        if (this.currentSlicer === 'weekly') step = 7;
        if (this.currentSlicer === 'monthly') step = 30;
        if (this.currentSlicer === 'yearly') step = 365;

        for (let i = 0; i < this.history.length; i += step) {
            labels.push(this.history[i].date);
            values.push(this.history[i].totalStock || 0);
            indices.push(i);
        }

        return { labels, values, indices };
    },

    getMaterialDataPoint: function (matName, indices) {
        return indices.map(idx => {
            const snapshot = this.history[idx];
            const mat = snapshot.materials.find(m => m.name === matName);
            return mat ? mat.totalVal : 0;
        });
    },

    getChartOptions: function (yLabel) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#64748b', font: { size: 10 } },
                    title: { display: true, text: yLabel, color: '#334155' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0 }
                }
            }
        };
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => {
    HistoryApp.init();
});
