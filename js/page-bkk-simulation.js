/**
 * BKK SIMULATION CONTROLLER
 * Handles the Advanced Projection Engine Logic for BKK Warehouses
 */

const BKKSim = {
    // Warehouse Data (Will fetch from API in production)
    warehouses: [],

    selectedWarehouses: [], // Array of Warehouse Names in Priority Order
    chartInstance: null,

    init: async function () {
        console.log("BKK Sim Init");
        await this.fetchWarehouseData();
        this.renderWarehouseGrid();
        this.setDefaults();
    },

    fetchWarehouseData: async function () {
        // Fetch from BKK API
        const BKK_API_URL = "https://script.google.com/macros/s/AKfycbzeYIfUcBkPdD5KqAy8Z6RHXev6NWM0LFLA3VKkwMlvGxfI9k9kiYnh_tj4wVGzIFR8/exec";

        try {
            const response = await fetch(BKK_API_URL + "?t=" + new Date().getTime());
            const data = await response.json();

            if (data && data.materials) {
                this.warehouses = data.materials.map(item => ({
                    name: item.warehouse || item.name,
                    stock: item.stock || 0,
                    cap: item.capacity || 0
                }));
            }
        } catch (error) {
            console.error("Failed to fetch BKK data, using dummy:", error);
            // Fallback dummy data
            this.warehouses = [
                { name: "BK01", stock: 2268863, cap: 6000000 },
                { name: "BK02", stock: 1877948, cap: 3000000 },
                { name: "BK03", stock: 2004568, cap: 3000000 },
                { name: "BK04", stock: 1988045, cap: 3000000 },
                { name: "BK05", stock: 777478, cap: 3000000 },
                { name: "BK06", stock: 875019, cap: 3000000 }
            ];
        }
    },

    setDefaults: function () {
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 14);

        document.getElementById('sim-start-date').valueAsDate = today;
        document.getElementById('sim-end-date').valueAsDate = nextWeek;
    },

    renderWarehouseGrid: function () {
        const grid = document.getElementById('bk-selection-grid');
        grid.innerHTML = '';

        this.warehouses.forEach((w, index) => {
            const isSelected = this.selectedWarehouses.includes(w.name);
            const selectionIndex = this.selectedWarehouses.indexOf(w.name) + 1;

            const div = document.createElement('div');
            div.className = `bk-select-card ${isSelected ? 'selected' : ''}`;
            div.onclick = () => this.toggleSelection(w.name);

            div.innerHTML = `
                ${isSelected ? `<div class="bk-card-num">${selectionIndex}</div>` : ''}
                <div class="bk-card-name">${w.name}</div>
                <div class="bk-card-stock">${(w.stock / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} T</div>
            `;
            grid.appendChild(div);
        });

        this.renderPriorityList();
    },

    toggleSelection: function (warehouseName) {
        if (this.selectedWarehouses.includes(warehouseName)) {
            // Remove
            this.selectedWarehouses = this.selectedWarehouses.filter(w => w !== warehouseName);
        } else {
            // Add (Max 6 for BKK)
            if (this.selectedWarehouses.length < 6) {
                this.selectedWarehouses.push(warehouseName);
            }
        }
        this.renderWarehouseGrid();
    },

    movePriority: function (warehouseName, direction) {
        const idx = this.selectedWarehouses.indexOf(warehouseName);
        if (idx < 0) return;

        if (direction === 'up' && idx > 0) {
            // Swap with idx-1
            [this.selectedWarehouses[idx], this.selectedWarehouses[idx - 1]] = [this.selectedWarehouses[idx - 1], this.selectedWarehouses[idx]];
        } else if (direction === 'down' && idx < this.selectedWarehouses.length - 1) {
            // Swap with idx+1
            [this.selectedWarehouses[idx], this.selectedWarehouses[idx + 1]] = [this.selectedWarehouses[idx + 1], this.selectedWarehouses[idx]];
        }
        this.renderWarehouseGrid();
    },

    renderPriorityList: function () {
        const container = document.getElementById('priority-list-container');
        container.innerHTML = '';

        if (this.selectedWarehouses.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#555; padding:20px; font-style:italic;">Click warehouses on the left to add to queue</div>';
            return;
        }

        this.selectedWarehouses.forEach((wName, i) => {
            const div = document.createElement('div');
            div.className = 'priority-item';
            div.innerHTML = `
                <div class="p-num">${i + 1}</div>
                <div class="p-name">${wName}</div>
                <div class="p-controls">
                    <button class="p-btn" onclick="BKKSim.movePriority('${wName}', 'up')">▲</button>
                    <button class="p-btn" onclick="BKKSim.movePriority('${wName}', 'down')">▼</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    // --- CALCULATION & RESULTS ---

    initiateProjection: function () {
        if (this.selectedWarehouses.length === 0) {
            alert("Select at least one warehouse.");
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

    renderTable: function () {
        const mode = document.getElementById('view-mode').value;
        const thead = document.getElementById('result-thead');
        const tbody = document.getElementById('result-tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        const dates = this.getDateRange();
        const dailyIn = parseFloat(document.getElementById('sim-daily-in').value) || 0;
        const dailyOut = parseFloat(document.getElementById('sim-daily-out').value) || 0;

        // Pre-calculate data for all days (Waterfall Logic)
        const projectionData = [];

        // Initial Stocks
        let currentStocks = {};
        this.warehouses.forEach(w => currentStocks[w.name] = w.stock / 1000); // Ton

        dates.forEach(d => {
            const netFlow = dailyIn - dailyOut;
            let remainingFlow = netFlow;

            // If Positive (Filling)
            if (remainingFlow > 0) {
                this.selectedWarehouses.forEach(wName => {
                    if (remainingFlow <= 0) return;
                    const w = this.warehouses.find(x => x.name === wName);
                    const capTon = w.cap / 1000;
                    const space = capTon - currentStocks[wName];

                    const fillAmount = Math.min(space, remainingFlow);
                    currentStocks[wName] += fillAmount;
                    remainingFlow -= fillAmount;
                });
            }
            // If Negative (Draining)
            else if (remainingFlow < 0) {
                let drainNeed = Math.abs(remainingFlow);
                this.selectedWarehouses.forEach(wName => {
                    if (drainNeed <= 0) return;
                    const avail = currentStocks[wName];
                    const drainAmount = Math.min(avail, drainNeed);
                    currentStocks[wName] -= drainAmount;
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
                    <th style="padding:15px; text-align:left; color:#888;">WAREHOUSE NAME</th>
                    <th style="padding:15px; color:#888;">INITIAL STOCK</th>
                    <th style="padding:15px; color:#888;">FINAL STOCK</th>
                    <th style="padding:15px; color:#888;">CHANGE</th>
                    <th style="padding:15px; color:#888;">STATUS</th>
                </tr>
            `;

            this.selectedWarehouses.forEach(wName => {
                const w = this.warehouses.find(x => x.name === wName);
                const init = w.stock / 1000;
                const final = projectionData[projectionData.length - 1].stocks[wName];
                const diff = final - init;

                tbody.innerHTML += `
                    <tr style="border-bottom:1px solid #222;">
                        <td style="padding:15px; color:#10b981; font-weight:bold;">${wName}</td>
                        <td style="text-align:center;">${init.toLocaleString('id-ID', { maximumFractionDigits: 2 })} T</td>
                        <td style="text-align:center; color:#fff; font-weight:bold;">${final.toLocaleString('id-ID', { maximumFractionDigits: 2 })} T</td>
                        <td style="text-align:center; color:${diff >= 0 ? '#4ade80' : '#ef4444'};">${diff > 0 ? '+' : ''}${diff.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                        <td style="text-align:center;">${final <= 0 ? 'EMPTY' : (final >= w.cap / 1000 ? 'FULL' : 'OK')}</td>
                    </tr>
                `;
            });
        }
        else {
            // Detailed
            let headerHTML = '<tr><th style="padding:10px; background:#111; position:sticky; left:0;">DATE</th>';
            this.selectedWarehouses.forEach(wName => {
                headerHTML += `<th style="padding:10px; color:#10b981;">${wName} (T)</th>`;
            });
            headerHTML += '</tr>';
            thead.innerHTML = headerHTML;

            projectionData.forEach(row => {
                const dateStr = row.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                let rowHTML = `<tr><td style="padding:10px; background:#111; position:sticky; left:0; border-right:1px solid #333;">${dateStr}</td>`;

                this.selectedWarehouses.forEach(wName => {
                    rowHTML += `<td style="padding:10px; text-align:center; border:1px solid #222;">${row.stocks[wName].toFixed(2)}</td>`;
                });
                rowHTML += '</tr>';
                tbody.innerHTML += rowHTML;
            });
        }

        this.lastProjectionData = projectionData; // Save for Chart
    },

    renderChart: function () {
        const ctx = document.getElementById('bkkChart').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();

        if (!this.lastProjectionData) return;

        const labels = this.lastProjectionData.map(d => d.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));

        // Dataset per Warehouse
        const datasets = this.selectedWarehouses.map((wName, i) => {
            const data = this.lastProjectionData.map(row => row.stocks[wName]);
            // Emerald color palette
            const colors = ['#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];
            const color = colors[i % colors.length];

            return {
                label: wName,
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
    BKKSim.init();
});
