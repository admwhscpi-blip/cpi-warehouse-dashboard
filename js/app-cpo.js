// APP CPO SERVICE
// Handles Logic & Rendering for CPO Tank Module

const CPOService = {
    data: null,

    renderDashboard: function (cpoData) {
        console.log("Rendering CPO Dashboard...", cpoData);
        const container = document.getElementById('cpo-tank-grid');
        if (!container) return;
        container.innerHTML = '';

        const tableContainer = document.getElementById('cpo-table-container');

        // 1. Render Tanks (Visual)
        // 1. Calculate Max Capacity for Scaling
        // Cari kapasitas terbesar di armada untuk jadi patokan tinggi 100% (300px)
        // Set minimum visual 150.000 (agar tangki kecil tidak terlalu kerdil)
        let maxFleetCap = 500000; // Default baseline baseline
        cpoData.tanks.forEach(t => {
            if (t.capacity > maxFleetCap) maxFleetCap = t.capacity;
        });

        const MIN_HEIGHT = 120; // Tinggi visual terpendek (px) untuk tangki kecil
        const MAX_HEIGHT = 320; // Tinggi visual tertinggi (px) untuk tangki besar

        // 2. Render Tanks (Industrial Visual)
        container.classList.add('cpo-grid'); // Add flex grid class
        container.classList.remove('warehouse-grid'); // Remove old grid
        container.innerHTML = ''; // Clear content

        // Create Rows Containers
        const row1 = document.createElement('div');
        row1.className = 'cpo-row top-row'; // TK1-TK3

        const row2 = document.createElement('div');
        row2.className = 'cpo-row bottom-row'; // TK4-TK7

        // Helper Render Function
        const createTankHTML = (tank) => {
            const percentage = tank.capacity > 0 ? (tank.stock / tank.capacity) * 100 : 0;

            // Calculate Dynamic Height
            let scaleRatio = tank.capacity / maxFleetCap;
            if (scaleRatio < 0.5) scaleRatio = 0.5;
            const visualHeight = scaleRatio * MAX_HEIGHT;

            // Status Colors
            let liquidColor = 'linear-gradient(90deg, #cc6600, #ffae00 30%, #ffcc00 50%, #ffae00 70%, #cc6600)';
            let textColor = '#ffae00';

            if (percentage <= 15) {
                liquidColor = 'linear-gradient(90deg, #550000, #aa0000 50%, #550000)';
                textColor = '#ff3333';
            } else if (percentage >= 95) {
                liquidColor = 'linear-gradient(90deg, #cc4400, #ff6600 50%, #cc4400)';
                textColor = '#ff6600';
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'tank-wrapper';
            wrapper.setAttribute('data-tooltip', `Remark: ${tank.remark || 'Normal Operations'}`);

            wrapper.innerHTML = `
                <div class="tank-body" style="height: ${visualHeight}px;">
                    <div style="position:absolute; top:0; left:0; width:100%; height:5px; background:rgba(255,255,255,0.3); border-bottom:1px solid #000;"></div>
                    <div class="tank-liquid" style="height: ${percentage}%; background: ${liquidColor};"></div>
                    <div class="tank-ruler">
                        <div class="ruler-mark"></div><div class="ruler-mark"></div><div class="ruler-mark"></div><div class="ruler-mark"></div><div class="ruler-mark"></div>
                    </div>
                </div>
                <div class="tank-info">
                    <div class="tank-name">${tank.name}</div>
                    <div class="tank-fill-pct" style="color:${textColor}">${percentage.toFixed(1)}%</div>
                    <div class="tank-stats">
                        ${(tank.stock / 1000).toLocaleString('id-ID')} TON <br>
                        <span style="font-size:0.75rem; opacity:0.7;">Cap: ${(tank.capacity / 1000).toLocaleString('id-ID')} TON</span>
                    </div>
                    ${tank.age ? `<div style="margin-top:5px; font-size:0.7rem; color:#888;">Age: ${tank.age} Days</div>` : ''}
                </div>
            `;
            return wrapper;
        };

        // Distribute Tanks
        // Sort by Name first to ensure TK01, TK02 order
        const sortedTanks = [...cpoData.tanks].sort((a, b) => a.name.localeCompare(b.name));

        sortedTanks.forEach((tank, index) => {
            const el = createTankHTML(tank);
            if (index < 3) {
                row1.appendChild(el); // TK1, TK2, TK3
            } else {
                row2.appendChild(el); // TK4, TK5, TK6, TK7
            }
        });

        container.appendChild(row1);
        container.appendChild(row2);

        // 2. Render Table Data
        let tableHtml = `
            <table class="sim-table" style="width:100%;">
                <thead>
                    <tr>
                        <th>Tank Name</th>
                        <th>Stock (kg)</th>
                        <th>Capacity (kg)</th>
                        <th>Fill %</th>
                        <th>Age (Days)</th>
                        <th>Remark</th>
                    </tr>
                </thead>
                <tbody>
        `;

        cpoData.tanks.forEach(tank => {
            const pct = tank.capacity > 0 ? (tank.stock / tank.capacity) * 100 : 0;
            tableHtml += `
                <tr>
                    <td>${tank.name}</td>
                    <td style="color:#0aff0a">${tank.stock.toLocaleString()}</td>
                    <td>${tank.capacity.toLocaleString()}</td>
                    <td>
                        <div style="width:100px; height:6px; background:#333; border-radius:3px;">
                            <div style="width:${pct}%; height:100%; background:#00f3ff; border-radius:3px;"></div>
                        </div>
                    </td>
                    <td>${tank.age}</td>
                    <td>${tank.remark}</td>
                </tr>
            `;
        });
        tableHtml += `</tbody></table>`;
        if (tableContainer) tableContainer.innerHTML = tableHtml;
    },


    // --- SIMULATION MODULE (LUXURY EDITION) ---
    selectedTanks: [],
    priorityQueue: [],
    lastSimResult: null,

    initSimulation: function (cpoData) {
        if (!cpoData || !cpoData.tanks) return;
        this.data = cpoData;

        const container = document.getElementById('view-cpo-simulation');
        if (!container) return;

        // Reset
        this.priorityQueue = [];

        // --- LUXURY UI FRAMEWORK ---
        container.innerHTML = `
            <div class="sim-luxury-wrapper">
                <div class="lux-header">
                    <div class="lux-title">CPO ADVANCED PROJECTION ENGINE</div>
                    <div class="lux-subtitle">PRIORITIZED WATERFALL SIMULATION</div>
                </div>

                <div class="lux-dashboard">
                    <!-- 1. TANK COMMAND CENTER (Left) -->
                    <div class="lux-panel tank-panel">
                        <div class="panel-header">
                            <span class="icon">🛢️</span> TANK SELECTION
                        </div>
                        <div class="tank-card-grid" id="cpo-tank-grid-selector">
                            <!-- Cards Injected Here -->
                        </div>
                        <div class="panel-hint">Click tanks to add to Filling Queue</div>
                    </div>

                    <!-- 2. PRIORITY & CONTROL (Right) -->
                    <div class="lux-panel control-panel">
                        
                        <!-- PRIORITY QUEUE -->
                        <div class="priority-section">
                            <div class="panel-header"><span class="icon">🔢</span> FILLING PRIORITY</div>
                            <div id="cpo-priority-display" class="priority-display-area">
                                <div class="empty-state">SELECT TANKS TO BEGIN</div>
                            </div>
                        </div>

                        <!-- PARAMETERS -->
                        <div class="params-section">
                            <div class="panel-header"><span class="icon">⚙️</span> SIMULATION PARAMETERS</div>
                            <div class="params-grid">
                                <div class="param-group">
                                    <label>START DATE</label>
                                    <input type="date" id="cpoi-start" class="lux-input" value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div class="param-group">
                                    <label>END DATE</label>
                                    <input type="date" id="cpoi-end" class="lux-input">
                                </div>
                                <div class="param-group">
                                    <label>TOTAL DAILY IN (TON)</label>
                                    <input type="number" id="cpoi-in" class="lux-input highlight-in" placeholder="0" value="0">
                                </div>
                                <div class="param-group">
                                    <label>TOTAL DAILY OUT (TON)</label>
                                    <input type="number" id="cpoi-out" class="lux-input highlight-out" placeholder="0" value="0">
                                </div>
                            </div>
                        </div>

                        <button onclick="CPOService.runSimulation()" class="lux-action-btn">
                            <span class="btn-glow"></span>
                            <span class="btn-text">INITIATE PROJECTION</span>
                        </button>
                    </div>
                </div>

                <!-- 3. RESULTS DISPLAY -->
                <div id="cpo-sim-results" class="lux-results" style="display:none;">
                    
                    <!-- CHART SECTION -->
                    <div class="lux-chart-container">
                        <canvas id="cpoSimChart"></canvas>
                    </div>

                    <!-- DATA TABLE SECTION -->
                    <div class="lux-table-section">
                        <div class="table-controls">
                            <div class="table-title">DATA BREAKDOWN</div>
                            <div class="view-toggles">
                                <button class="view-btn active" onclick="CPOService.switchTableView('summary', this)">SUMMARY</button>
                                <button class="view-btn" onclick="CPOService.switchTableView('detailed_stock', this)">DETAILED STOCK</button>
                                <button class="view-btn" onclick="CPOService.switchTableView('detailed_flow', this)">DETAILED FLOW</button>
                            </div>
                        </div>
                        <div id="cpo-table-container" class="lux-table-wrapper"></div>
                    </div>

                </div>
            </div>
        `;

        this.renderTankSelector();

        // Auto-set End Date
        const d = new Date();
        d.setDate(d.getDate() + 14);
        document.getElementById('cpoi-end').value = d.toISOString().split('T')[0];
    },

    renderTankSelector: function () {
        const grid = document.getElementById('cpo-tank-grid-selector');
        if (!grid) return;

        // Sort tanks
        const tanks = [...this.data.tanks].sort((a, b) => a.name.localeCompare(b.name));

        grid.innerHTML = tanks.map(t => {
            const isSelected = this.priorityQueue.includes(t.name);
            const rank = this.priorityQueue.indexOf(t.name) + 1;
            const pct = (t.stock / t.capacity) * 100;

            return `
                <div class="lux-tank-card ${isSelected ? 'active' : ''}" onclick="CPOService.toggleTankSelection('${t.name}')">
                    <div class="card-bg" style="height:${pct}%"></div>
                    <div class="card-content">
                        <div class="card-name">${t.name}</div>
                        <div class="card-stock">${(t.stock / 1000).toLocaleString()} T</div>
                        ${isSelected ? `<div class="card-rank">#${rank}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    toggleTankSelection: function (tankName) {
        if (this.priorityQueue.includes(tankName)) {
            this.priorityQueue = this.priorityQueue.filter(n => n !== tankName);
        } else {
            this.priorityQueue.push(tankName);
        }
        this.renderTankSelector(); // Re-render cards to show rank/active
        this.renderPriorityDisplay();
    },

    renderPriorityDisplay: function () {
        const display = document.getElementById('cpo-priority-display');
        if (!display) return;

        if (this.priorityQueue.length === 0) {
            display.innerHTML = '<div class="empty-state">SELECT TANKS TO BEGIN</div>';
            return;
        }

        display.innerHTML = this.priorityQueue.map((name, idx) => `
            <div class="priority-pill">
                <span class="pill-rank">${idx + 1}</span>
                <span class="pill-name">${name}</span>
                <div class="pill-controls">
                    <span onclick="event.stopPropagation(); CPOService.movePriority('${name}', -1)">▲</span>
                    <span onclick="event.stopPropagation(); CPOService.movePriority('${name}', 1)">▼</span>
                </div>
            </div>
        `).join('<div class="flow-arrow">⬇</div>');
    },

    movePriority: function (name, dir) {
        const idx = this.priorityQueue.indexOf(name);
        if (idx < 0) return;

        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= this.priorityQueue.length) return;

        // Swap
        const temp = this.priorityQueue[newIdx];
        this.priorityQueue[newIdx] = name;
        this.priorityQueue[idx] = temp;

        this.renderTankSelector();
        this.renderPriorityDisplay();
    },

    // --- CORE SIMULATION LOGIC ---
    runSimulation: function () {
        if (this.priorityQueue.length === 0) {
            alert('Please select at least one tank.');
            return;
        }

        const start = new Date(document.getElementById('cpoi-start').value);
        const end = new Date(document.getElementById('cpoi-end').value);
        const dailyIn = parseFloat(document.getElementById('cpoi-in').value) || 0;
        const dailyOut = parseFloat(document.getElementById('cpoi-out').value) || 0;
        const dailyNet = dailyIn - dailyOut;

        // Init Sim Objects
        let simTanks = this.priorityQueue.map(name => {
            const real = this.data.tanks.find(t => t.name === name);
            return {
                name: name,
                stock: real.stock, // Kg
                capacity: real.capacity,
                initialStock: real.stock,
                history: [] // { date, stock, in, out }
            };
        });

        const dayDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        if (dayDiff <= 0) return;

        let globalHistory = [];

        // Loop Days
        for (let d = 0; d <= dayDiff; d++) {
            let currentDate = new Date(start);
            currentDate.setDate(start.getDate() + d);
            let dateStr = currentDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

            let remainingFlow = dailyNet * 1000; // KG
            let dailyTotalStock = 0;

            // Reset daily trackers
            simTanks.forEach(t => { t.dailyIn = 0; t.dailyOut = 0; });

            if (remainingFlow > 0) {
                // FILLING
                for (let t of simTanks) {
                    let space = t.capacity - t.stock;
                    if (remainingFlow > 0 && space > 0) {
                        let fill = Math.min(remainingFlow, space);
                        t.stock += fill;
                        t.dailyIn = fill;
                        remainingFlow -= fill;
                    }
                }
            } else if (remainingFlow < 0) {
                // DRAINING
                let drainNeeded = Math.abs(remainingFlow);
                for (let t of simTanks) {
                    if (drainNeeded > 0 && t.stock > 0) {
                        let drain = Math.min(drainNeeded, t.stock);
                        t.stock -= drain;
                        t.dailyOut = drain;
                        drainNeeded -= drain;
                    }
                }
            }

            // Snapshot
            simTanks.forEach(t => {
                t.history.push({
                    date: dateStr,
                    stock: t.stock,
                    in: t.dailyIn,
                    out: t.dailyOut
                });
                dailyTotalStock += t.stock;
            });

            globalHistory.push({
                date: dateStr,
                totalStock: dailyTotalStock,
                netFlow: dailyNet * 1000
            });
        }

        this.lastSimResult = { simTanks, globalHistory, days: dayDiff, startDate: start };

        // Show Results
        document.getElementById('cpo-sim-results').style.display = 'block';
        this.renderSimChart();
        this.switchTableView('summary'); // Default view

        // Smooth Scroll
        document.getElementById('cpo-sim-results').scrollIntoView({ behavior: 'smooth' });
    },

    switchTableView: function (mode, btnEl) {
        // ULTRA-ROBUST RENDERER
        const container = document.getElementById('cpo-table-container');
        if (!container) {
            console.error("CRITICAL: Table Container Not Found!");
            return;
        }

        if (!this.lastSimResult) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:orange;">DATA PROJECTION NOT READY</div>';
            return;
        }

        // Clean mode
        mode = mode ? mode.trim() : 'summary';

        // Update Buttons
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) {
            btnEl.classList.add('active');
        } else {
            const targetBtn = document.querySelector(`.view-btn[onclick*="'${mode}'"]`);
            if (targetBtn) targetBtn.classList.add('active');
        }

        const { simTanks, globalHistory } = this.lastSimResult;

        // DEBUG - CHECK DATA
        const rowsCount = globalHistory.length;
        if (rowsCount === 0) {
            container.innerHTML = '<div style="padding:20px; color:red;">SIMULATION RETURNED 0 DAYS</div>';
            return;
        }

        console.log(`Rendering Table: ${mode} with ${rowsCount} rows`);

        // Start HTML Construction
        let html = '';

        try {
            if (mode === 'summary') {
                html = '<table class="lux-table"><thead><tr><th class="sticky-col">DATE</th><th>TOTAL STOCK (TON)</th><th>NET FLOW</th><th>STATUS</th></tr></thead><tbody>';

                globalHistory.forEach(day => {
                    const total = (day.totalStock || 0) / 1000;
                    const net = (day.netFlow || 0) / 1000;
                    const status = net >= 0 ? '🟢 FILLING' : '🔴 DRAINING';
                    const cssClass = net >= 0 ? 'val-in' : 'val-out';

                    html += `
                        <tr>
                            <td class="sticky-col">${day.date}</td>
                            <td class="val-stock">${total.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="${cssClass}">${net.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                            <td>${status}</td>
                        </tr>
                    `;
                });

                html += '</tbody></table>';

            } else if (mode === 'detailed_stock') {
                let header = `<thead><tr><th class="sticky-col">DATE</th>`;
                simTanks.forEach(t => header += `<th>${t.name}<br><small>Stock</small></th>`);
                header += '</tr></thead>';

                let body = '<tbody>';
                globalHistory.forEach((day, i) => {
                    body += `<tr><td class="sticky-col">${day.date}</td>`;
                    simTanks.forEach(t => {
                        if (!t.history[i]) { body += '<td>-</td>'; return; }
                        const val = (t.history[i].stock || 0) / 1000;
                        const pct = val / (t.capacity / 1000);
                        let style = '';
                        if (pct > 0.95) style = 'color:orange; font-weight:bold;';
                        if (val <= 0) style = 'color:red;';
                        body += `<td style="${style}">${val.toFixed(2)}</td>`;
                    });
                    body += '</tr>';
                });
                body += '</tbody>';

                html = `<table class="lux-table">${header}${body}</table>`;

            } else if (mode === 'detailed_flow') {
                let header = `<thead><tr><th class="sticky-col">DATE</th>`;
                simTanks.forEach(t => header += `<th>${t.name}<br><small class="val-in">IN</small> / <small class="val-out">OUT</small></th>`);
                header += '</tr></thead>';

                let body = '<tbody>';
                globalHistory.forEach((day, i) => {
                    body += `<tr><td class="sticky-col">${day.date}</td>`;
                    simTanks.forEach(t => {
                        if (!t.history[i]) { body += '<td>-</td>'; return; }
                        const inVal = (t.history[i].in || 0) / 1000;
                        const outVal = (t.history[i].out || 0) / 1000;

                        let cell = '<span style="color:#555">-</span>';
                        if (inVal > 0 && outVal > 0) cell = `<span class="val-in">+${inVal.toFixed(1)}</span> / <span class="val-out">-${outVal.toFixed(1)}</span>`;
                        else if (inVal > 0) cell = `<span class="val-in">+${inVal.toFixed(1)}</span>`;
                        else if (outVal > 0) cell = `<span class="val-out">-${outVal.toFixed(1)}</span>`;

                        body += `<td>${cell}</td>`;
                    });
                    body += '</tr>';
                });
                body += '</tbody>';
                html = `<table class="lux-table">${header}${body}</table>`;
            }

            // Force Insert
            container.style.display = 'block';
            container.innerHTML = html;

        } catch (e) {
            console.error("RENDER ERROR:", e);
            container.innerHTML = `<div style="color:red; padding:20px;">ERROR RENDERING TABLE: ${e.message}</div>`;
        }
    },

    renderSimChart: function () {
        const ctx = document.getElementById('cpoSimChart').getContext('2d');
        const { simTanks, days, startDate } = this.lastSimResult;

        let labels = [];
        for (let i = 0; i <= days; i++) {
            let d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
        }

        const colors = ['#FFD700', '#FF8C00', '#FF4500', '#00FFFF', '#00FF00', '#FFFFFF']; // Gold, DkOrange, OrRed, Cyan, Lime

        const datasets = simTanks.map((t, idx) => ({
            label: t.name,
            data: t.history.map(h => h.stock / 1000),
            borderColor: colors[idx % colors.length],
            backgroundColor: colors[idx % colors.length] + '20', // Low opacity fill
            borderWidth: 2,
            pointRadius: 2,
            fill: true,
            tension: 0.4
        }));

        if (window.cpoChartInstance) window.cpoChartInstance.destroy();

        window.cpoChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#ccc', font: { family: 'Rajdhani' } } },
                    title: { display: true, text: 'PROJECTED STOCK LEVELS (TOTAL)', color: '#fff', font: { size: 16, family: 'Orbitron' } }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#888' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#888' }
                    }
                }
            }
        });
    }
};
