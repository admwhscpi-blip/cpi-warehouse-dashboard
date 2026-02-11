/**
 * CPO SIMULATION CONTROLLER
 * Handles the Advanced Projection Engine Logic
 */

const CPOSim = {
    // Mock Data (Typically from API, but hardcoded here as per previous CPO page)
    tanks: [
        { name: "TK01", stock: 72863, cap: 150000 },
        { name: "TK02", stock: 96117, cap: 150000 },
        { name: "TK03", stock: 103868, cap: 150000 },
        { name: "TK04", stock: 272430, cap: 500000 },
        { name: "TK05", stock: 0, cap: 500000 },
        { name: "TK06", stock: 199626, cap: 500000 },
        { name: "TK07", stock: 501021, cap: 500000 }
    ],

    selectedTanks: [], // Array of Tank Names in Priority Order
    chartInstance: null,

    init: function () {
        console.log("CPO Sim Init");
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
            `;
            grid.appendChild(div);
        });

        this.renderPriorityList();
    },

    toggleSelection: function (tankName) {
        if (this.selectedTanks.includes(tankName)) {
            // Remove
            this.selectedTanks = this.selectedTanks.filter(t => t !== tankName);
        } else {
            // Add (Max 7)
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
            // Swap with idx-1
            [this.selectedTanks[idx], this.selectedTanks[idx - 1]] = [this.selectedTanks[idx - 1], this.selectedTanks[idx]];
        } else if (direction === 'down' && idx < this.selectedTanks.length - 1) {
            // Swap with idx+1
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

    // --- CALCULATION & RESULTS ---

    overrides: {}, // { [dateStr]: { [tankName]: { in: val, out: val } } }

    initiateProjection: function () {
        if (this.selectedTanks.length === 0) {
            alert("Select at least one tank.");
            return;
        }

        const start = document.getElementById('sim-start-date').value;
        const end = document.getElementById('sim-end-date').value;
        if (!start || !end) { alert("Check dates"); return; }

        // Reset overrides if the user restarts? No, let's keep them unless they explicitly clear.
        // But for a fresh run, maybe clear? Let's keep for now for persistence during a session.

        // Show Results
        document.getElementById('result-section').style.display = 'block';
        document.getElementById('result-section').scrollIntoView({ behavior: 'smooth' });

        this.renderTable();
        this.renderChart();
    },

    updateOverride: function (tankName, dateStr, field, value) {
        if (!this.overrides[dateStr]) this.overrides[dateStr] = {};
        if (!this.overrides[dateStr][tankName]) this.overrides[dateStr][tankName] = {};

        this.overrides[dateStr][tankName][field] = parseFloat(value) || 0;

        // Re-render
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
        this.tanks.forEach(t => currentStocks[t.name] = t.stock / 1000); // Ton

        dates.forEach(d => {
            const dateStr = d.toISOString().split('T')[0];
            const dailyStats = {};
            this.selectedTanks.forEach(tName => dailyStats[tName] = { in: 0, out: 0 });

            let remIn = dailyIn;
            let remOut = dailyOut;

            // 1. Process explicit overrides first (Subtract from global pool)
            this.selectedTanks.forEach(tName => {
                if (this.overrides[dateStr] && this.overrides[dateStr][tName]) {
                    const oIn = this.overrides[dateStr][tName].in || 0;
                    const oOut = this.overrides[dateStr][tName].out || 0;

                    // Apply to stock
                    currentStocks[tName] += (oIn - oOut);
                    dailyStats[tName] = { in: oIn, out: oOut };

                    // We DON'T subtract from remIn/remOut unless user intends these to be "contributions" to the pool.
                    // Usually, if a user manually sets an In, they are defining the intake.
                    // Let's assume the Global Parameters are "Auto-Waterfall" amounts.
                    // If a user manually edits a cell, that tank is "Manual" for that day.
                    // The Global amount still waterfalls into the "Automatic" tanks.
                }
            });

            // 2. Waterfall the "Default" global pool into tanks that DO NOT have overrides
            // Waterfall Fill
            this.selectedTanks.forEach(tName => {
                if (remIn <= 0) return;
                // Skip if this tank has an override for this day
                if (this.overrides[dateStr] && this.overrides[dateStr][tName]) return;

                const t = this.tanks.find(x => x.name === tName);
                const cap = t.cap / 1000;
                const space = Math.max(0, cap - currentStocks[tName]);
                const fill = Math.min(space, remIn);

                currentStocks[tName] += fill;
                dailyStats[tName].in = fill;
                remIn -= fill;
            });

            // Waterfall Drain
            this.selectedTanks.forEach(tName => {
                if (remOut <= 0) return;
                // Skip if this tank has an override for this day
                if (this.overrides[dateStr] && this.overrides[dateStr][tName]) return;

                const avail = Math.max(0, currentStocks[tName]);
                const drain = Math.min(avail, remOut);

                currentStocks[tName] -= drain;
                dailyStats[tName].out = drain;
                remOut -= drain;
            });

            projectionData.push({
                date: d,
                stocks: { ...currentStocks },
                stats: dailyStats
            });
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
            thead.innerHTML = `
                <tr>
                    <th style="padding:15px; text-align:left;">TANK NAME</th>
                    <th style="padding:15px;">INITIAL STOCK</th>
                    <th style="padding:15px;">FINAL STOCK</th>
                    <th style="padding:15px;">CHANGE</th>
                    <th style="padding:15px;">STATUS</th>
                </tr>
            `;

            this.selectedTanks.forEach(tName => {
                const t = this.tanks.find(x => x.name === tName);
                const init = t.stock / 1000;
                const final = projectionData[projectionData.length - 1].stocks[tName];
                const diff = final - init;

                tbody.innerHTML += `
                    <tr style="border-bottom:1px solid #222;">
                        <td style="padding:15px; color:#ff9e0b; font-weight:bold;">${tName}</td>
                        <td style="text-align:center;">${init.toLocaleString()} T</td>
                        <td style="text-align:center; color:#fff; font-weight:bold;">${final.toLocaleString(undefined, { maximumFractionDigits: 2 })} T</td>
                        <td style="text-align:center; color:${diff >= 0 ? '#4ade80' : '#ef4444'};">${diff > 0 ? '+' : ''}${diff.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td style="text-align:center;">${final <= 0 ? 'EMPTY' : (final >= t.cap / 1000 ? 'FULL' : 'OK')}</td>
                    </tr>
                `;
            });
        }
        else {
            // Detailed Table (RM Style)
            let row1 = '<tr><th rowspan="2" style="position:sticky; left:0; z-index:10; background:#0f172a; border-right:2px solid #333;">DATE</th>';
            let row2 = '<tr>';

            this.selectedTanks.forEach(tName => {
                row1 += `<th colspan="3" class="th-group-header">${tName}</th>`;
                row2 += `
                    <th class="col-stock">STOCK</th>
                    <th class="col-in">IN</th>
                    <th class="col-out">OUT</th>
                `;
            });
            row1 += '</tr>';
            row2 += '</tr>';
            thead.innerHTML = row1 + row2;

            projectionData.forEach(row => {
                const dateStr = row.date.toISOString().split('T')[0];
                const dateDisplay = row.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

                const tr = document.createElement('tr');
                let tds = `<td style="position:sticky; left:0; z-index:5; background:#0a0a0a; border-right:2px solid #333; font-weight:bold; color:#cbd5e1;">${dateDisplay}</td>`;

                this.selectedTanks.forEach(tName => {
                    const stock = row.stocks[tName];
                    const stats = row.stats[tName];

                    tds += `
                        <td class="col-stock" style="color:${stock < 0 ? '#ef4444' : '#fff'};">${stock.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="col-in" style="padding:0;">
                            <input type="number" class="editable-cell col-in" value="${stats.in}" onchange="CPOSim.updateOverride('${tName}', '${dateStr}', 'in', this.value)">
                        </td>
                        <td class="col-out" style="padding:0;">
                            <input type="number" class="editable-cell col-out" value="${stats.out}" onchange="CPOSim.updateOverride('${tName}', '${dateStr}', 'out', this.value)">
                        </td>
                    `;
                });

                tr.innerHTML = tds;
                tbody.appendChild(tr);
            });
        }
    },

    renderChart: function () {
        const ctx = document.getElementById('cpoChart').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();

        if (!this.lastProjectionData) return;

        const labels = this.lastProjectionData.map(d => d.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));

        // Dataset per Tank
        const datasets = this.selectedTanks.map((tName, i) => {
            const data = this.lastProjectionData.map(row => row.stocks[tName]);
            // Colors: gradients of Orange? Or varied?
            // Let's use predefined palette
            const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6366f1'];
            const color = colors[i % colors.length];

            return {
                label: tName,
                data: data,
                borderColor: color,
                backgroundColor: color,
                tension: 0.4,
                fill: false
            };
        });

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#ccc', font: { family: 'Orbitron' } } }
                },
                scales: {
                    y: { grid: { color: '#333' }, ticks: { color: '#888' } },
                    x: { grid: { display: false }, ticks: { color: '#888' } }
                }
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    CPOSim.init();
});
