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

    initiateProjection: function () {
        if (this.selectedTanks.length === 0) {
            alert("Select at least one tank.");
            return;
        }

        const start = document.getElementById('sim-start-date').value;
        const end = document.getElementById('sim-end-date').value;
        if (!start || !end) { alert("Check dates"); return; }

        // Show Results
        document.getElementById('result-section').style.display = 'block';
        document.getElementById('result-section').scrollIntoView({ behavior: 'smooth' });

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

    // For CPO, "Summary" means Total Stats per Tank?
    // "Detailed" means Day-by-Day Table?
    renderTable: function () {
        const mode = document.getElementById('view-mode').value;
        const thead = document.getElementById('result-thead');
        const tbody = document.getElementById('result-tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        const dates = this.getDateRange();
        const dailyIn = parseFloat(document.getElementById('sim-daily-in').value) || 0;
        const dailyOut = parseFloat(document.getElementById('sim-daily-out').value) || 0;

        // Perform Calculation (Simple Cumulative for Prototype)
        // TODO: Waterfall Logic?
        // Current requirement: "Pilihan Hasil Samakan Persis RM Simulasi" (Table choice)
        // I will implement a simple projection where Daily In fills valid tanks based on priority,
        // and Daily Out drains valid tanks based on priority (or reverse?).
        // For simplicity V1: Apply Net Flow to the first available tank? Or Split?
        // Let's simpler: Just projection per tank assuming they all receive equal share or just one huge pool?
        // User screenshot said "Filling Priority", implies WATERFALL FILLING.
        // Logic:
        // Day 1: Net Flow = In - Out.
        // If Net > 0: Add to Tank 1. If Full, Add to Tank 2.
        // If Net < 0: Drain from Tank 1?? Or Drain from Last? Usually Drain from Active.
        // Let's assume Drain from Tank 1 first too (FIFO) or maybe user defines.
        // For PROTOTYPE UI: I will calculate "Projected Stock" for each tank independently assuming flow goes to them proportionally or specific logic.
        // Let's implement WATERFALL FILLING (Fill T1 -> T2).
        // DRAINING: Drain T1 -> T2? Or T7 -> T6?
        // Let's assume Drain T1 -> T2 for now.

        // Pre-calculate data for all days
        const projectionData = []; // [ {date, tankStocks: {TK01: val, ...} } ]

        // Initial Stocks
        let currentStocks = {};
        this.tanks.forEach(t => currentStocks[t.name] = t.stock / 1000); // Ton

        dates.forEach(d => {
            const netFlow = dailyIn - dailyOut;

            // Distribute Net Flow
            let remainingFlow = netFlow;

            // If Positive (Filling)
            if (remainingFlow > 0) {
                this.selectedTanks.forEach(tName => {
                    if (remainingFlow <= 0) return;
                    const t = this.tanks.find(x => x.name === tName);
                    const capTon = t.cap / 1000;
                    const space = capTon - currentStocks[tName];

                    const fillAmount = Math.min(space, remainingFlow);
                    currentStocks[tName] += fillAmount;
                    remainingFlow -= fillAmount;
                });
            }
            // If Negative (Draining)
            else if (remainingFlow < 0) {
                let drainNeed = Math.abs(remainingFlow);
                this.selectedTanks.forEach(tName => {
                    if (drainNeed <= 0) return;
                    const avail = currentStocks[tName];
                    const drainAmount = Math.min(avail, drainNeed);
                    currentStocks[tName] -= drainAmount;
                    drainNeed -= drainAmount;
                });
            }

            // Snapshot
            projectionData.push({
                date: d,
                stocks: { ...currentStocks },
                total: Object.values(currentStocks).reduce((a, b) => a + b, 0)
            });
        });


        if (mode === 'summary') {
            thead.innerHTML = `
                <tr>
                    <th style="padding:15px; text-align:left; color:#888;">TANK NAME</th>
                    <th style="padding:15px; color:#888;">INITIAL STOCK</th>
                    <th style="padding:15px; color:#888;">FINAL STOCK</th>
                    <th style="padding:15px; color:#888;">CHANGE</th>
                    <th style="padding:15px; color:#888;">STATUS</th>
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
            // Detailed
            let headerHTML = '<tr><th style="padding:10px; background:#111; position:sticky; left:0;">DATE</th>';
            this.selectedTanks.forEach(tName => {
                headerHTML += `<th style="padding:10px; color:#ff9e0b;">${tName} (T)</th>`;
            });
            headerHTML += '</tr>';
            thead.innerHTML = headerHTML;

            projectionData.forEach(row => {
                const dateStr = row.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                let rowHTML = `<tr><td style="padding:10px; background:#111; position:sticky; left:0; border-right:1px solid #333;">${dateStr}</td>`;

                this.selectedTanks.forEach(tName => {
                    rowHTML += `<td style="padding:10px; text-align:center; border:1px solid #222;">${row.stocks[tName].toFixed(2)}</td>`;
                });
                rowHTML += '</tr>';
                tbody.appendChild(document.createElement('tr')).innerHTML = rowHTML;
            });
        }

        this.lastProjectionData = projectionData; // Save for Chart
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
