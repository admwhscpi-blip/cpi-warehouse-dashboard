/**
 * CPO SIMULATION CONTROLLER [V.19.55 - NEW FILE VER]
 * Handles the Advanced Projection Engine Logic
 */
window.CPO_ENGINE_VERSION = "19:55-V2";
console.log("CPO ENGINE LOADED: v19.55-V2 - CACHE BYPASS ACTIVE");

const CPOSim = {
    // Mock Data with Aging
    tanks: [
        { name: "TK01", stock: 72863, cap: 150000, age: 10 },
        { name: "TK02", stock: 96117, cap: 150000, age: 25 },
        { name: "TK03", stock: 103868, cap: 150000, age: 5 },
        { name: "TK04", stock: 272430, cap: 500000, age: 40 },
        { name: "TK05", stock: 0, cap: 500000, age: 0 },
        { name: "TK06", stock: 199626, cap: 500000, age: 15 },
        { name: "TK07", stock: 501021, cap: 500000, age: 30 }
    ],

    selectedTanks: [],
    chartInstance: null,

    init: function () {
        console.log("CPO Sim Engine V2 Initiated");
        this.renderTankGrid();
        this.setDefaults();
    },

    setDefaults: function () {
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 14);
        document.getElementById('sim-start-date').valueAsDate = today;
        document.getElementById('sim-end-date').valueAsDate = nextWeek;
    },

    renderTankGrid: function () {
        const grid = document.getElementById('tank-selection-grid');
        grid.innerHTML = '';
        this.tanks.forEach((t, index) => {
            const isSelected = this.selectedTanks.includes(t.name);
            const selectionIndex = this.selectedTanks.indexOf(t.name) + 1;
            const div = document.createElement('div');
            div.className = `tank-select-card ${isSelected ? 'selected' : ''}`;
            div.onclick = () => this.toggleSelection(t.name);
            div.innerHTML = `
                ${isSelected ? `<div class="tank-card-num">${selectionIndex}</div>` : ''}
                <div class="tank-card-name">${t.name}</div>
                <div class="tank-card-stock">${(t.stock / 1000).toLocaleString()} T</div>
                <div style="font-size:0.65rem; color:#64748b; margin-top:4px;">Umur: ${t.age} Hari</div>
            `;
            grid.appendChild(div);
        });
        this.renderPriorityList();
    },

    toggleSelection: function (tankName) {
        if (this.selectedTanks.includes(tankName)) {
            this.selectedTanks = this.selectedTanks.filter(t => t !== tankName);
        } else {
            if (this.selectedTanks.length < 7) {
                this.selectedTanks.push(tankName);
            }
        }
        this.renderTankGrid();
    },

    movePriority: function (tankName, direction) {
        const idx = this.selectedTanks.indexOf(tankName);
        if (idx < 0) return;
        if (direction === 'up' && idx > 0) {
            [this.selectedTanks[idx], this.selectedTanks[idx - 1]] = [this.selectedTanks[idx - 1], this.selectedTanks[idx]];
        } else if (direction === 'down' && idx < this.selectedTanks.length - 1) {
            [this.selectedTanks[idx], this.selectedTanks[idx + 1]] = [this.selectedTanks[idx + 1], this.selectedTanks[idx]];
        }
        this.renderTankGrid();
    },

    renderPriorityList: function () {
        const container = document.getElementById('priority-list-container');
        container.innerHTML = '';
        if (this.selectedTanks.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#555; padding:20px; font-style:italic;">Click tanks on the left to add to queue</div>';
            return;
        }
        this.selectedTanks.forEach((tName, i) => {
            const div = document.createElement('div');
            div.className = 'priority-item';
            div.innerHTML = `
                <div class="p-num">${i + 1}</div>
                <div class="p-name">${tName}</div>
                <div class="p-controls">
                    <button class="p-btn" onclick="CPOSim.movePriority('${tName}', 'up')">▲</button>
                    <button class="p-btn" onclick="CPOSim.movePriority('${tName}', 'down')">▼</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    overrides: {},

    initiateProjection: function () {
        if (this.selectedTanks.length === 0) {
            alert("Select at least one tank.");
            return;
        }
        document.getElementById('result-section').style.display = 'block';
        document.getElementById('result-section').scrollIntoView({ behavior: 'smooth' });
        this.renderTable();
        this.renderChart();
    },

    updateOverride: function (tankName, dateStr, field, value) {
        if (!this.overrides[dateStr]) this.overrides[dateStr] = {};
        if (!this.overrides[dateStr][tankName]) this.overrides[dateStr][tankName] = {};
        this.overrides[dateStr][tankName][field] = parseFloat(value) || 0;
        this.renderTable();
        this.renderChart();
    },

    getDateRange: function () {
        const start = new Date(document.getElementById('sim-start-date').value);
        const end = new Date(document.getElementById('sim-end-date').value);
        const dates = [];
        let curr = new Date(start);
        while (curr <= end) {
            dates.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }
        return dates;
    },

    calculateProjection: function () {
        const dates = this.getDateRange();
        const dailyIn = parseFloat(document.getElementById('sim-daily-in').value) || 0;
        const dailyOut = parseFloat(document.getElementById('sim-daily-out').value) || 0;
        const projectionData = [];
        let currentStocks = {};
        this.tanks.forEach(t => currentStocks[t.name] = t.stock / 1000);

        const drainPriority = [...this.selectedTanks].sort((a, b) => {
            const tankA = this.tanks.find(x => x.name === a);
            const tankB = this.tanks.find(x => x.name === b);
            return (tankB.age || 0) - (tankA.age || 0);
        });

        dates.forEach(d => {
            const dateStr = d.toISOString().split('T')[0];
            const dailyStats = {};
            this.selectedTanks.forEach(tName => dailyStats[tName] = { in: 0, out: 0 });
            let remIn = dailyIn;
            let remOut = dailyOut;

            this.selectedTanks.forEach(tName => {
                if (this.overrides[dateStr] && this.overrides[dateStr][tName]) {
                    const oIn = this.overrides[dateStr][tName].in || 0;
                    const oOut = this.overrides[dateStr][tName].out || 0;
                    currentStocks[tName] += (oIn - oOut);
                    dailyStats[tName] = { in: oIn, out: oOut };
                }
            });

            for (let tName of this.selectedTanks) {
                if (remIn <= 0) break;
                if (this.overrides[dateStr] && this.overrides[dateStr][tName]) continue;
                const t = this.tanks.find(x => x.name === tName);
                const cap = t.cap / 1000;
                const space = Math.max(0, cap - currentStocks[tName]);
                const fill = Math.min(space, remIn);
                currentStocks[tName] += fill;
                dailyStats[tName].in = (dailyStats[tName].in || 0) + fill;
                remIn -= fill;
            }

            for (let tName of drainPriority) {
                if (remOut <= 0) break;
                if (this.overrides[dateStr] && this.overrides[dateStr][tName]) continue;
                const avail = Math.max(0, currentStocks[tName]);
                const drain = Math.min(avail, remOut);
                currentStocks[tName] -= drain;
                dailyStats[tName].out = (dailyStats[tName].out || 0) + drain;
                remOut -= drain;
            }

            projectionData.push({ date: d, stocks: { ...currentStocks }, stats: dailyStats });
        });
        return projectionData;
    },

    renderTable: function () {
        const mode = document.getElementById('view-mode').value;
        const thead = document.getElementById('result-thead');
        const tbody = document.getElementById('result-tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';
        const projectionData = this.calculateProjection();
        this.lastProjectionData = projectionData;

        if (mode === 'summary') {
            thead.innerHTML = `<tr><th>TANK NAME</th><th>INITIAL</th><th>FINAL</th><th>CHANGE</th><th>STATUS</th></tr>`;
            this.selectedTanks.forEach(tName => {
                const t = this.tanks.find(x => x.name === tName);
                const init = t.stock / 1000;
                const final = projectionData[projectionData.length - 1].stocks[tName];
                const diff = final - init;
                tbody.innerHTML += `<tr><td>${tName}</td><td>${init.toLocaleString()} T</td><td>${final.toLocaleString()} T</td><td>${diff.toLocaleString()}</td><td>${final <= 0 ? 'EMPTY' : 'OK'}</td></tr>`;
            });
        } else {
            let row1 = '<tr><th rowspan="2">DATE</th>';
            let row2 = '<tr>';
            this.selectedTanks.forEach(tName => {
                row1 += `<th colspan="3">${tName}</th>`;
                row2 += `<th>STOCK</th><th>IN</th><th>OUT</th>`;
            });
            thead.innerHTML = row1 + '</tr>' + row2 + '</tr>';
            projectionData.forEach(row => {
                const dateStr = row.date.toISOString().split('T')[0];
                const dateDisplay = row.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                const tr = document.createElement('tr');
                let tds = `<td>${dateDisplay}</td>`;
                this.selectedTanks.forEach(tName => {
                    const stock = row.stocks[tName];
                    const stats = row.stats[tName];
                    tds += `<td>${stock.toFixed(2)}</td><td><input type="number" value="${stats.in}" onchange="CPOSim.updateOverride('${tName}', '${dateStr}', 'in', this.value)"></td><td><input type="number" value="${stats.out}" onchange="CPOSim.updateOverride('${tName}', '${dateStr}', 'out', this.value)"></td>`;
                });
                tr.innerHTML = tds;
                tbody.appendChild(tr);
            });
        }
    },

    renderChart: function () {
        const ctx = document.getElementById('cpoChart').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();
        const labels = this.lastProjectionData.map(d => d.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
        const datasets = [];
        const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6366f1'];
        this.selectedTanks.forEach((tName, i) => {
            const t = this.tanks.find(x => x.name === tName);
            const stockData = this.lastProjectionData.map(row => row.stocks[tName]);
            const capValue = t.cap / 1000;
            const capData = this.lastProjectionData.map(() => capValue);
            const color = colors[i % colors.length];
            datasets.push({ type: 'bar', label: `${tName} Level`, data: stockData, backgroundColor: color + '80', borderColor: color, borderWidth: 1 });
            datasets.push({ type: 'line', label: `${tName} Cap (${capValue}T)`, data: capData, borderColor: color, borderDash: [5, 5], pointRadius: 0, fill: false });
        });
        this.chartInstance = new Chart(ctx, {
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => { CPOSim.init(); });
