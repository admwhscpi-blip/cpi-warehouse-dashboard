/**
 * PAGE CONTROLLER: FUTURE PROJECTION ENGINE
 * Handles specific logic for rm-simulation.html
 */

const SimPage = {
    data: null,
    session: [], // Comparison Queue: Array of Objects { material, facility, startDate, endDate, dailyIn, dailyOut, color, baseStock }
    colors: ['#00f3ff', '#bc13fe', '#ff2a2a', '#ff9e0b', '#0aff0a', '#ffffff'],
    chartInstance: null,
    hudChartInstance: null,
    currentSlicer: 'daily', // daily, weekly, monthly
    isFullscreen: false,

    init: async function () {
        console.log("SimPage Initializing...");

        // 1. Fetch Data
        this.data = await DataService.fetchData();
        if (!this.data) {
            console.error("No data fetched");
            return;
        }

        // 2. Populate Inputs
        this.populateDropdowns();

        // 3. Set Default Date (Next 14 Days)
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 14);

        document.getElementById('sim-start').valueAsDate = today;
        document.getElementById('sim-end').valueAsDate = nextWeek;

        // 4. Load History
        this.loadHistory();

        // Hide loading overlay after initialization
        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.add('hidden');
        }, 500);

        console.log("SimPage Ready");
    },

    populateDropdowns: function () {
        const matSelect = document.getElementById('sim-material');
        matSelect.innerHTML = '';

        if (this.data.materials) {
            this.data.materials.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                opt.innerText = m.name;
                matSelect.appendChild(opt);
            });
        }

        // Populate Facility Checkboxes with Space Info
        this.populateFacilityList();

        // Populate Import Facility Checkboxes
        this.populateImportFacilityList();
    },

    populateFacilityList: function () {
        const container = document.getElementById('facility-list');
        if (!container || !this.data.warehouses) return;
        container.innerHTML = '';

        this.data.warehouses.forEach((name, index) => {
            // Calculate current stock and available space
            let currentStock = 0;
            this.data.materials.forEach(m => {
                if (m.stocks && m.stocks[index]) currentStock += m.stocks[index];
            });
            let currentStockTon = currentStock;

            // Get hard capacity from config or fallback
            const hardCapTon = CONFIG.WAREHOUSE_CAPACITIES[name.toUpperCase()] || this.data.capacities[index];
            const availableSpace = Math.max(0, hardCapTon - currentStockTon).toFixed(0);
            const usagePercent = hardCapTon > 0 ? ((currentStockTon / hardCapTon) * 100).toFixed(0) : 0;
            const barColor = usagePercent >= 80 ? '#ef4444' : (usagePercent >= 60 ? '#ff9e0b' : '#00f3ff');

            const label = document.createElement('label');
            label.style.cssText = 'display:flex; flex-direction:column; padding:10px 15px; cursor:pointer; border-bottom:1px solid #1e293b; transition:background 0.2s;';
            label.onmouseenter = () => label.style.background = 'rgba(255,255,255,0.05)';
            label.onmouseleave = () => label.style.background = 'transparent';

            label.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" class="facility-checkbox" value="${name}" onchange="SimPage.updateFacilitySelection()" style="accent-color:#00f3ff;">
                    <span style="color:#fff; font-weight:600; flex:1;">${name}</span>
                    <span style="color:#64748b; font-size:0.75rem;">${usagePercent}% Full</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px; margin-top:6px; margin-left:24px;">
                    <div style="flex:1; height:4px; background:#1e293b; border-radius:2px; overflow:hidden;">
                        <div style="width:${usagePercent}%; height:100%; background:${barColor};"></div>
                    </div>
                    <span style="color:#10b981; font-size:0.7rem; font-weight:600;">Avail: ${availableSpace}T</span>
                </div>
            `;
            container.appendChild(label);
        });
    },

    toggleFacilityDropdown: function () {
        const menu = document.getElementById('facility-dropdown-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    },

    toggleAllFacilities: function (checked) {
        document.querySelectorAll('.facility-checkbox').forEach(cb => cb.checked = checked);
        this.updateFacilitySelection();
    },

    updateFacilitySelection: function () {
        const allCheckbox = document.getElementById('facility-all');
        const checkboxes = document.querySelectorAll('.facility-checkbox');
        const checkedBoxes = document.querySelectorAll('.facility-checkbox:checked');
        const textSpan = document.getElementById('facility-selected-text');

        // Update "ALL" checkbox state
        allCheckbox.checked = checkedBoxes.length === checkboxes.length;

        // Update display text
        if (checkedBoxes.length === 0 || checkedBoxes.length === checkboxes.length) {
            textSpan.innerText = 'ALL FACILITIES';
        } else if (checkedBoxes.length === 1) {
            textSpan.innerText = checkedBoxes[0].value;
        } else {
            textSpan.innerText = `${checkedBoxes.length} Gudang Dipilih`;
        }
    },

    getSelectedFacilities: function () {
        const checkedBoxes = document.querySelectorAll('.facility-checkbox:checked');
        if (checkedBoxes.length === 0) return 'ALL';
        return Array.from(checkedBoxes).map(cb => cb.value);
    },


    addToSession: function () {
        // Read Inputs
        const matName = document.getElementById('sim-material').value;
        const selectedFacilities = this.getSelectedFacilities();
        const startDate = document.getElementById('sim-start').value;
        const endDate = document.getElementById('sim-end').value;
        const defIn = parseFloat(document.getElementById('sim-daily-in').value) || 0;
        const defOut = parseFloat(document.getElementById('sim-daily-out').value) || 0;

        // Read New Document Inputs
        const docDateSemarang = document.getElementById('doc-date-semarang').value;
        const docDatePriok = document.getElementById('doc-date-priok').value;

        if (!matName) { alert("Please select a material"); return; }
        if (!startDate || !endDate) { alert("Please set date range"); return; }
        if (new Date(endDate) <= new Date(startDate)) { alert("End date must be after start date"); return; }

        // Get Current Base Stock (based on selected facilities)
        let currentStock = 0;
        const matData = this.data.materials.find(m => m.name === matName);
        if (matData) {
            if (selectedFacilities === 'ALL' || selectedFacilities.length === this.data.warehouses.length) {
                // Sum all
                currentStock = matData.stocks ? matData.stocks.reduce((a, b) => a + b, 0) : 0;
            } else {
                // Sum only selected facilities
                selectedFacilities.forEach(facName => {
                    const idx = this.data.warehouses.indexOf(facName);
                    if (idx !== -1 && matData.stocks[idx]) currentStock += matData.stocks[idx];
                });
            }
        }

        // Create Session Object
        const color = this.colors[this.session.length % this.colors.length];
        const id = Date.now() + Math.random().toString();

        const facilityLabel = selectedFacilities === 'ALL' ? 'ALL' : (Array.isArray(selectedFacilities) ? selectedFacilities.join(', ') : selectedFacilities);

        const sessionObj = {
            id: id,
            material: matName,
            facility: facilityLabel,
            startDate: startDate,
            endDate: endDate,
            defaultIn: defIn,
            defaultOut: defOut,
            baseStock: currentStock, // In KG
            color: color,
            docDateSemarang: docDateSemarang,
            docDatePriok: docDatePriok,
            overrides: {} // Map date_str -> { in, out }
        };

        this.session.push(sessionObj);

        // Render Updates
        this.renderQueue();
        this.renderTable();
        this.renderCharts(); // Updates both charts and summary
        this.calculateInsights();
        if (this.isFullscreen) this.renderHUD();
    },

    removeFromSession: function (id) {
        this.session = this.session.filter(s => s.id !== id);
        this.renderQueue();
        this.renderTable();
        this.renderCharts();
        this.calculateInsights();
        if (this.isFullscreen) this.renderHUD();
    },

    toggleFullscreen: function () {
        this.isFullscreen = !this.isFullscreen;
        const body = document.body;
        const viewport = document.getElementById('hud-viewport');

        if (this.isFullscreen) {
            body.classList.add('fullscreen-mode');
            viewport.style.display = 'flex';
            this.renderHUD();
        } else {
            body.classList.remove('fullscreen-mode');
            viewport.style.display = 'none';
        }

        // Always redraw chart to handle resize
        this.renderChart();
    },

    setSlicer: function (mode) {
        this.currentSlicer = mode;
        // Update UI
        document.querySelectorAll('.slicer-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`slicer-${mode}`).classList.add('active');

        const label = document.getElementById('hud-slicer-label');
        if (label) label.innerText = `MODE: ${mode.toUpperCase()}`;

        this.renderChart();
        this.renderTable();
        if (this.isFullscreen) this.renderHUD();
    },

    calculateInsights: function () {
        if (this.session.length === 0) return;

        const container = document.getElementById('analytics-grid');
        if (!container) return;

        let html = '';

        // 1. PROJECTED STATUS (Global)
        let isCritical = false;

        this.session.forEach(s => {
            const dates = this.getDateRange();
            dates.forEach(d => {
                const state = this.calculateStateAtDate(s, d.toISOString().split('T')[0], d);
                if (state.stock < 0) isCritical = true;
            });

            // 2. PEAK STOCK PER MATERIAL
            let maxStock = 0;
            let peakDate = '';
            dates.forEach(d => {
                const state = this.calculateStateAtDate(s, d.toISOString().split('T')[0], d);
                if (state.stock > maxStock) {
                    maxStock = state.stock;
                    peakDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                }
            });

            // COMPACT CARD DESIGN
            html += `
                <div class="insight-metric" style="padding:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="metric-label" style="font-size:0.6rem; color:#94a3b8;">PEAK: ${s.material}</span>
                        <span class="metric-date" style="font-size:0.6rem;">${peakDate}</span>
                    </div>
                    <div class="metric-value" style="color:${s.color}; font-size:1rem; line-height:1.2;">${maxStock.toLocaleString()}T</div>
                </div>
            `;
        });

        // Add Global Status Card at start (Compact Version)
        const statusHtml = `
            <div class="insight-metric" style="grid-column: 1 / -1; background:rgba(0,0,0,0.3); border-left:3px solid ${isCritical ? '#ef4444' : '#10b981'}; padding:8px; margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="metric-label" style="font-size:0.65rem; color:#cbd5e1;">GLOBAL STATUS</div>
                    <div class="metric-value" style="color:${isCritical ? '#ef4444' : '#10b981'}; font-size:0.9rem;">
                        ${isCritical ? 'CRITICAL' : 'NOMINAL'}
                    </div>
                </div>
                <div class="metric-sub" style="font-size:0.6rem; color:#64748b; margin-top:2px;">${isCritical ? 'Replenishment needed.' : 'Stocks secure.'}</div>
            </div>
        `;

        container.innerHTML = statusHtml + html;
    },

    renderHUD: function () {
        this.renderStockChart('hudStockChart');
        this.renderMovementChart('hudMovementChart');
        // this.renderTableHUD(); // Removed as per request (5 panels only)
        this.calculateInsights();
    },

    renderTableHUD: function () {
        // Limited HUD table view
        const thead = document.getElementById('hud-table-head');
        const tbody = document.getElementById('hud-table-body');
        if (!thead || !tbody) return;

        this.renderDetailedTable(thead, tbody, true); // true = HUD mode
    },

    showHistoricalDrilldown: function () {
        const overlay = document.getElementById('historical-drilldown-modal');
        const tbody = document.getElementById('drilldown-table-body');
        if (!overlay || !tbody) return;

        overlay.style.display = 'flex';
        tbody.innerHTML = '';

        if (this.session.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">No active simulation sessions in queue.</td></tr>';
            return;
        }

        // We show the breakdown of current session items
        this.session.forEach(s => {
            const tr = document.createElement('tr');

            // Check status (if stock < 0 = CRITICAL, else OK)
            const currentStock = s.baseStock;
            const statusColor = currentStock < 0 ? '#ef4444' : '#34d399';
            const statusText = currentStock < 0 ? 'CRITICAL' : 'STABLE';

            tr.innerHTML = `
                <td style="color:${s.color}; font-weight:700; padding:12px;">${s.material}</td>
                <td style="color:#94a3b8;">${s.facility}</td>
                <td style="color:#fff;">${currentStock.toLocaleString()} T</td>
                <td style="color:#34d399; font-weight:700;">+ ${s.totalIn ? s.totalIn.toLocaleString() : '0'} T</td>
                <td><span style="padding:4px 10px; border-radius:12px; background:rgba(${currentStock < 0 ? '239, 68, 68' : '52, 211, 153'}, 0.1); color:${statusColor}; font-size:0.6rem; font-weight:700;">${statusText}</span></td>
            `;
            tbody.appendChild(tr);
        });
    },

    closeDrilldown: function () {
        const overlay = document.getElementById('historical-drilldown-modal');
        if (overlay) overlay.style.display = 'none';
    },

    saveProject: function () {
        if (this.session.length === 0) {
            alert('Simulation queue is empty!');
            return;
        }

        const projectName = prompt('Enter Project/Scenario Name:', `Simulation ${new Date().toLocaleDateString()}`);
        if (!projectName) return;

        const updater = prompt('Enter Updater Name:', 'Operator');

        const project = {
            id: Date.now(),
            name: projectName,
            updater: updater,
            timestamp: new Date().toISOString(),
            session: this.session
        };

        const history = JSON.parse(localStorage.getItem('rm_sim_history') || '[]');
        history.unshift(project);
        localStorage.setItem('rm_sim_history', JSON.stringify(history.slice(0, 10))); // keep 10

        alert('Project Saved Successfully!');
        this.loadHistory();
    },

    loadHistory: function () {
        const history = JSON.parse(localStorage.getItem('rm_sim_history') || '[]');
        const container = document.getElementById('history-section');
        const list = document.getElementById('history-list');

        if (history.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        let html = '';
        history.forEach(h => {
            const date = new Date(h.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            html += `
                <div class="history-card" onclick="SimPage.launchFromHistory(${h.id})">
                    <div style="font-size:0.8rem; font-weight:700; color:#fff; margin-bottom:5px;">${h.name}</div>
                    <div style="font-size:0.65rem; color:#bc13fe; margin-bottom:10px;">👤 ${h.updater || 'Unknown'}</div>
                    <div style="font-size:0.6rem; color:#64748b;">${date}</div>
                    <div style="position:absolute; bottom:5px; right:10px; font-size:0.5rem; color:#10b981;">AUTO-SYNC READY</div>
                </div>
            `;
        });
        list.innerHTML = html;
    },

    launchFromHistory: function (id) {
        const history = JSON.parse(localStorage.getItem('rm_sim_history') || '[]');
        const project = history.find(h => h.id === id);
        if (!project) return;

        if (!confirm(`Restore scenario "${project.name}"? This will overwrite the current session.`)) return;

        // Restore and Sync Stock (Bonus feature: always use latest stock)
        const restoredSession = project.session.map(s => {
            // Re-calc baseStock from current live data
            let currentStock = 0;
            const matData = this.data.materials.find(m => m.name === s.material);
            if (matData) {
                if (s.facility === 'ALL') {
                    currentStock = matData.stocks ? matData.stocks.reduce((a, b) => a + b, 0) : 0;
                } else {
                    const facList = s.facility.split(',').map(f => f.trim());
                    facList.forEach(facName => {
                        const idx = this.data.warehouses.indexOf(facName);
                        if (idx !== -1 && matData.stocks[idx]) currentStock += matData.stocks[idx];
                    });
                }
            }
            return {
                ...s,
                baseStock: currentStock // Sync with live data
            };
        });

        this.session = restoredSession;
        this.renderQueue();
        this.renderTable();
        this.renderChart();
        this.calculateInsights();

        alert(`Scenario "${project.name}" loaded and synced with current stocks.`);
    },

    renderQueue: function () {
        const container = document.getElementById('session-queue');
        if (this.session.length === 0) {
            container.innerHTML = '<span class="queue-label">SESSION QUEUE (Ready to Compare):</span><span style="color:#444; font-size:0.8rem; font-style:italic;">No active simulations. Add a material above to start.</span>';
            return;
        }

        let html = '<span class="queue-label">SESSION QUEUE (Ready to Compare):</span>';
        this.session.forEach(s => {
            html += `
                <div class="sim-chip" title="${s.source || ''} | ${s.receiptDate || ''}">
                    <div class="chip-color" style="background:${s.color}; box-shadow:0 0 5px ${s.color};"></div>
                    <div style="display:flex; flex-direction:column; line-height:1.2;">
                        <span style="font-weight:600;">${s.material}</span>
                        <span style="font-size:0.6rem; color:#94a3b8;">${s.baseStock}T ${s.source ? ' | ' + s.source : ''}</span>
                    </div>
                    <span class="chip-close" onclick="SimPage.removeFromSession('${s.id}')">&times;</span>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    getDateRange: function () {
        if (this.session.length === 0) return [];

        let minDateStr = this.session[0].startDate;
        let maxDateStr = this.session[0].endDate;

        this.session.forEach(s => {
            if (s.startDate < minDateStr) minDateStr = s.startDate;
            if (s.endDate > maxDateStr) maxDateStr = s.endDate;
        });

        const dates = [];
        let curr = new Date(minDateStr);
        let max = new Date(maxDateStr);
        while (curr <= max) {
            dates.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }
        return dates;
    },

    renderTable: function () {
        const viewMode = document.getElementById('view-mode-select').value; // detailed or summary
        const thead = document.getElementById('sim-table-head');
        const tbody = document.getElementById('sim-table-body');

        thead.innerHTML = '';
        tbody.innerHTML = '';

        if (this.session.length === 0) return;

        if (viewMode === 'summary') {
            this.renderSummaryTable(thead, tbody);
        } else {
            this.renderDetailedTable(thead, tbody);
        }
    },

    renderSummaryTable: function (thead, tbody) {
        // Headers
        thead.innerHTML = `
            <tr>
                <th style="text-align:left;">MATERIAL</th>
                <th>INITIAL STOCK (TON)</th>
                <th>TOTAL INCOMING (TON)</th>
                <th>TOTAL USAGE (TON)</th>
                <th>PROJECTED END STOCK (TON)</th>
                <th>STATUS</th>
            </tr>
        `;

        this.session.forEach(s => {
            // Better logic: iterate ONLY this session's range for summary
            // But for now, let's just calc totals across specific session range
            let totalIn = 0;
            let totalOut = 0;

            // Helper to get logic range
            const sDate = new Date(s.startDate);
            const eDate = new Date(s.endDate);
            let curr = new Date(sDate);

            while (curr <= eDate) {
                const dateStr = curr.toISOString().split('T')[0];
                let dIn = s.defaultIn;
                let dOut = s.defaultOut;
                if (s.overrides[dateStr]) {
                    if (s.overrides[dateStr].in !== undefined) dIn = s.overrides[dateStr].in;
                    if (s.overrides[dateStr].out !== undefined) dOut = s.overrides[dateStr].out;
                }
                totalIn += dIn;
                totalOut += dOut;
                curr.setDate(curr.getDate() + 1);
            }

            const initialTon = s.baseStock;
            const finalTon = initialTon + totalIn - totalOut;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:left; color:${s.color}; font-weight:bold;">${s.material}</td>
                <td>${initialTon.toLocaleString()}</td>
                <td style="color:#34d399;">+${totalIn.toLocaleString()}</td>
                <td style="color:#f87171;">-${totalOut.toLocaleString()}</td>
                <td style="font-weight:bold; font-size:1.1rem; color:${finalTon < 0 ? '#ef4444' : '#fff'};">${finalTon.toLocaleString()}</td>
                <td>${finalTon < 0 ? 'CRITICAL LOW' : 'SAFE'}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderDetailedTable: function (thead, tbody, isHud = false) {
        const fullDates = this.getDateRange();
        let displayDates = fullDates;

        // Apply Slicer for Aggregation
        if (this.currentSlicer !== 'daily') {
            const step = this.currentSlicer === 'weekly' ? 7 : 30;
            displayDates = fullDates.filter((_, i) => i % step === 0);
        }

        // 1. Build Header Rows
        let row1 = `<tr><th rowspan="2" style="position:sticky; left:0; z-index:10; background:#0f172a; border-right:2px solid #333; width:${isHud ? '80px' : '100px'}; font-size:${isHud ? '0.6rem' : '0.8rem'};">DATE</th>`;
        let row2 = '<tr>';

        this.session.forEach(s => {
            row1 += `<th colspan="3" class="th-group-header" style="color:${s.color}; border-bottom:2px solid ${s.color}; font-size:${isHud ? '0.65rem' : '0.85rem'};">${s.material}</th>`;
            row2 += `
                <th class="col-stock" style="font-size:${isHud ? '0.55rem' : '0.8rem'};">STOCK</th>
                <th class="col-in" style="font-size:${isHud ? '0.55rem' : '0.8rem'};">IN</th>
                <th class="col-out" style="font-size:${isHud ? '0.55rem' : '0.8rem'};">OUT</th>
            `;
        });

        row1 += '</tr>';
        row2 += '</tr>';
        thead.innerHTML = row1 + row2;

        // 2. Build Data Rows
        displayDates.forEach((dateObj, idx) => {
            const dateStr = dateObj.toISOString().split('T')[0];
            let dateDisplay = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

            if (this.currentSlicer === 'weekly') dateDisplay = 'W' + (idx + 1);
            if (this.currentSlicer === 'monthly') dateDisplay = 'M' + (idx + 1);

            const tr = document.createElement('tr');
            if (isHud && idx > 5 && !this.showAllHudRows) tr.style.display = 'none'; // limit hud rows

            let tds = `<td style="position:sticky; left:0; z-index:5; background:#0a0a0a; border-right:2px solid #333; font-weight:bold; color:#cbd5e1; font-size:${isHud ? '0.6rem' : '0.85rem'};">${dateDisplay}</td>`;

            this.session.forEach(s => {
                const state = this.calculateStateAtDate(s, dateStr, dateObj);
                const stockTon = state.stock;

                tds += `
                    <td style="color:${stockTon < 0 ? '#ef4444' : '#fff'}; font-weight:700; font-size:${isHud ? '0.7rem' : '0.85rem'};">${stockTon.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                    <td style="padding:0;">
                        <input type="number" 
                            class="editable-cell" 
                            style="color:#34d399; font-size:${isHud ? '0.7rem' : '0.85rem'};" 
                            value="${state.inVal}" 
                            ${isHud ? 'readonly' : ''}
                            onchange="SimPage.updateOverride('${s.id}', '${dateStr}', 'in', this.value)"
                        />
                    </td>
                    <td style="padding:0;">
                        <input type="number" 
                            class="editable-cell" 
                            style="color:#f87171; font-size:${isHud ? '0.7rem' : '0.85rem'};" 
                            value="${state.outVal}" 
                            ${isHud ? 'readonly' : ''}
                            onchange="SimPage.updateOverride('${s.id}', '${dateStr}', 'out', this.value)"
                        />
                    </td>
                `;
            });

            tr.innerHTML = tds;
            tbody.appendChild(tr);
        });
    },

    renderCharts: function () {
        this.renderStockChart();
        this.renderMovementChart();
        this.renderSummaryBoxes();
    },

    renderStockChart: function (targetId = 'stockChart') {
        const ctx = document.getElementById(targetId);
        if (!ctx) return;

        const isHud = targetId.includes('hud');
        let inst = isHud ? this.hudStockChartInstance : this.stockChartInstance;
        if (inst) { inst.destroy(); inst = null; }

        const fullDates = this.getDateRange();
        if (fullDates.length === 0) return;

        const labels = this.getLabels(fullDates);
        const step = this.getStep();

        // 1. Calculate TOTAL GLOBAL CAPACITY
        let totalCapacity = 0;
        if (this.data.warehouses) {
            this.data.warehouses.forEach((w, idx) => {
                const cap = CONFIG.WAREHOUSE_CAPACITIES[w.toUpperCase()] || this.data.capacities[idx] || 0;
                totalCapacity += cap;
            });
        }

        // FIX: If capacity seems suspiciously low (e.g. in Tons but stock is Kg), convert it.
        // 26,000 is likely Tons => 26,000,000 Kg
        if (totalCapacity > 0 && totalCapacity < 1000000) {
            totalCapacity *= 1000;
        }

        if (totalCapacity === 0) totalCapacity = 25000000; // Fallback

        // 2. Calculate UNSIMULATED BASE STOCK
        // Sum of all materials in database
        let totalAllMatStock = 0;
        if (this.data.materials) {
            this.data.materials.forEach(m => {
                if (m.stocks) totalAllMatStock += m.stocks.reduce((a, b) => a + b, 0);
            });
        }

        let simulatedBaseStock = 0;
        this.session.forEach(s => simulatedBaseStock += s.baseStock);

        // This is the static bulk of everything else
        // We subtract the Base Stock of items currently being simulated, 
        // because we will add their *Dynamic* stock back in the loop.
        const unsimulatedStock = Math.max(0, totalAllMatStock - simulatedBaseStock);

        console.log(`[ChartDebug] TotalDB: ${totalAllMatStock}, SimBase: ${simulatedBaseStock}, Unsim: ${unsimulatedStock}`);

        // 3. Generate Time Series Data for GLOBAL STOCK
        let dataStock = [];
        let dataCap = [];

        for (let i = 0; i < fullDates.length; i += step) {
            const d = fullDates[i];
            const dStr = d.toISOString().split('T')[0];

            let simulatedCurrentTotal = 0;
            this.session.forEach(s => {
                // Ensure we use the exact logic as Movement Chart
                const state = this.calculateStateAtDate(s, dStr, d);
                simulatedCurrentTotal += state.stock;
            });

            const currentGlobal = unsimulatedStock + simulatedCurrentTotal;
            dataStock.push(currentGlobal);
            dataCap.push(totalCapacity);

            if (i === 0 || i === fullDates.length - 1) {
                console.log(`[ChartDebug] Date: ${dStr}, SimTotal: ${simulatedCurrentTotal}, Global: ${currentGlobal}`);
            }
        }

        // 4. Render Chart
        const newChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'MAX CAPACITY',
                        data: dataCap,
                        borderColor: '#FFE600', // NEON YELLOW
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        order: 0
                    },
                    {
                        type: 'bar',
                        label: 'TOTAL GLOBAL RM STOCK',
                        data: dataStock,
                        backgroundColor: '#ffffff',
                        borderColor: 'transparent',
                        borderWidth: 0,
                        barPercentage: 0.6,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: isHud ? '#fff' : '#94a3b8', font: { family: 'Orbitron', size: 11, weight: 'bold' } } },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255,255,255,0.2)',
                        borderWidth: 1,
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ${Math.round(context.raw).toLocaleString()} Kg`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: {
                            color: isHud ? '#fff' : '#94a3b8',
                            font: { weight: 'bold' },
                            stepSize: 4000000 // USER REQUEST: Per 4 Million
                        },
                        beginAtZero: true
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: isHud ? '#fff' : '#94a3b8', maxTicksLimit: 10, font: { weight: 'bold' } }
                    }
                }
            }
        });

        if (isHud) this.hudStockChartInstance = newChart;
        else this.stockChartInstance = newChart;
    },

    renderMovementChart: function (targetId = 'movementChart') {
        const ctx = document.getElementById(targetId);
        if (!ctx) return;

        const isHud = targetId.includes('hud');
        let inst = isHud ? this.hudMovementChartInstance : this.movementChartInstance;
        if (inst) { inst.destroy(); inst = null; }

        const fullDates = this.getDateRange();
        if (fullDates.length === 0) return;

        let labels = this.getLabels(fullDates);
        const step = this.getStep();

        // REVISION: Calculate ACCUMULATED STOCK Projection for each session (Line Chart)
        // Previous logic was Net Movement. New logic matches "Stock Chart" calculation but per material.
        const datasets = this.session.map(s => {
            let data = [];

            // Note: calculateStateAtDate already handles the logic of "freezing" after end date 
            // because we updated it earlier.

            for (let i = 0; i < fullDates.length; i += step) {
                const d = fullDates[i];
                const dStr = d.toISOString().split('T')[0];

                // Get Stock State at this date
                const state = this.calculateStateAtDate(s, dStr, d);

                // If it's a freeze (after end date), calculateStateAtDate returns the frozen stock value.
                // However, renderStockChart sums them. Here we just push the value.

                // One nuance: User requested "Hide/Zero" for movement chart after end date in previous step.
                // But for "Stock Projection", we probably want to see the line flatten or stop?
                // User said: "MOVEMENT IMPACT... FOKUS KEPADA PERGERAKAN STOCK... KEDEPANNYA MAKIN NAIK ATAU TURUN"
                // If we zero it, the line drops to bottom. If we freeze it, it stays flat.
                // In Step 26 id 241, we updated calculateStateAtDate to return frozen stock (currentKg) but 0 in/out.
                // So the stock value will remain constant (Flat Line). This is correct behavior for stock projection.

                data.push(state.stock);
            }

            return {
                label: s.material,
                data: data,
                borderColor: s.color,
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.3,
                fill: false
            };
        });

        const newChart = new Chart(ctx, {
            type: 'line', // CHANGED TO LINE
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, labels: { color: isHud ? '#fff' : '#94a3b8', font: { family: 'Orbitron', size: 11, weight: 'bold' } } },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ${Math.round(context.raw).toLocaleString()} Kg`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8', font: { size: isHud ? 8 : 12 } },
                        title: { display: !isHud, text: 'Stock Level (Kg)', color: '#64748b' } // Changed Unit Label
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: isHud ? 8 : 12 } }
                    }
                }
            }
        });

        if (isHud) this.hudMovementChartInstance = newChart;
        else this.movementChartInstance = newChart;
    },

    renderSummaryBoxes: function () {
        if (this.session.length === 0) return;

        // BOX 1: DOCUMENTS
        const s = this.session[this.session.length - 1]; // Use latest
        const semarangDate = s.docDateSemarang ? this.formatDate(s.docDateSemarang) : '-';
        const priokDate = s.docDatePriok ? this.formatDate(s.docDatePriok) : '-';

        // Update Main View
        document.getElementById('txt-semarang-date').innerText = semarangDate;
        document.getElementById('txt-priok-date').innerText = priokDate;

        // Update HUD View (if elements exist)
        const hudSemarang = document.getElementById('hud-txt-semarang-date');
        const hudPriok = document.getElementById('hud-txt-priok-date');
        if (hudSemarang) hudSemarang.innerText = semarangDate;
        if (hudPriok) hudPriok.innerText = priokDate;

        // BOX 2: DYNAMIC PREDICTIVE INSIGHT
        const textContainer = document.getElementById('summary-movement-text');
        const predictiveHtml = this.generatePredictiveText();
        textContainer.innerHTML = predictiveHtml;

        // Update HUD View
        const hudTextContainer = document.getElementById('hud-summary-movement-text');
        if (hudTextContainer) hudTextContainer.innerHTML = predictiveHtml;

        // BOX 3: TOTAL IMPACT
        // Calculate Total Net Change across all materials/sessions from Start to End
        let totalStartStock = 0;
        let totalEndStock = 0;

        const fullDates = this.getDateRange();
        if (fullDates.length > 0) {
            const endDate = fullDates[fullDates.length - 1];
            const startDate = fullDates[0];
            const endStr = endDate.toISOString().split('T')[0];
            const startStr = startDate.toISOString().split('T')[0];

            this.session.forEach(sess => {
                // Initial
                totalStartStock += sess.baseStock;
                // Final
                const endState = this.calculateStateAtDate(sess, endStr, endDate);
                totalEndStock += endState.stock;
            });
        }

        const netImpact = totalEndStock - totalStartStock;
        const sign = netImpact >= 0 ? '+' : '';
        document.getElementById('summary-total-impact').innerText = `${sign}${netImpact.toLocaleString()} TON`;
        document.getElementById('summary-total-impact').style.color = netImpact >= 0 ? '#34d399' : '#f87171';

        // Dynamic Desc
        const todayStock = totalStartStock.toLocaleString();
        const futureStock = totalEndStock.toLocaleString();
        const operator = netImpact >= 0 ? '<' : '>';
        document.getElementById('summary-impact-desc').innerText = `STOCK HARI INI (${todayStock}) ${operator} FUTURE (${futureStock}) -> ${netImpact >= 0 ? 'SURPLUS' : 'DEFICIT'}`;
    },

    generatePredictiveText: function () {
        // Logic: Iterate periods based on Slicer. 
        // "FEBRUARY WEEK 1: Material A +500..."
        const fullDates = this.getDateRange();
        const step = this.getStep();
        const labels = this.getLabels(fullDates);

        let html = '';

        // Limit to first 3 periods to avoid overflow, or make it scrollable? 
        // User wants "TIAP WEEK NYA". Let's show max 3 relevant periods.
        const maxUncollapsed = 100; // Unlimited for now, use div scroll

        for (let i = 0; i < fullDates.length && i < (step * 5); i += step) {
            const label = labels[Math.floor(i / step)];

            // Calculate movement for this period
            let periodMovements = [];
            let periodTotal = 0;

            this.session.forEach(s => {
                let net = 0;
                for (let j = 0; j < step && (i + j) < fullDates.length; j++) {
                    const d = fullDates[i + j];
                    const dateStr = d.toISOString().split('T')[0];
                    let dIn = s.defaultIn;
                    let dOut = s.defaultOut;
                    if (s.overrides[dateStr]) {
                        if (s.overrides[dateStr].in !== undefined) dIn = Number(s.overrides[dateStr].in);
                        if (s.overrides[dateStr].out !== undefined) dOut = Number(s.overrides[dateStr].out);
                    }
                    net += (dIn - dOut);
                }
                if (Math.abs(net) > 0) {
                    periodMovements.push({ mat: s.material, val: net, color: s.color });
                    periodTotal += net;
                }
            });

            if (periodMovements.length === 0) continue;

            // Sort by absolute impact
            periodMovements.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

            // Generate HTML
            html += `<div style="margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;">`;
            html += `<div style="font-weight:700; color:#00f3ff; font-size:0.85rem; margin-bottom:2px;">[${label}] TOTAL: ${periodTotal > 0 ? '+' : ''}${periodTotal.toLocaleString()} T</div>`;

            periodMovements.forEach(pm => {
                html += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; padding-left:10px;">
                            <span style="color:${pm.color};">• ${pm.mat}</span>
                            <span style="color:${pm.val >= 0 ? '#34d399' : '#f87171'}">${pm.val > 0 ? '+' : ''}${pm.val.toLocaleString()} T</span>
                         </div>`;
            });

            let stockImpactMsg = "";
            const currentStock = this.calculateTotalStockAtDate(fullDates[i]); // Approx start of period
            const futureStock = currentStock + periodTotal;
            if (periodTotal > 0) stockImpactMsg = `📈 Stock akumulasi naik ke ${futureStock.toLocaleString()} T`;
            else stockImpactMsg = `📉 Stock tergerus menjadi ${futureStock.toLocaleString()} T`;

            html += `<div style="font-size:0.7rem; color:#64748b; margin-top:2px; font-style:italic;">${stockImpactMsg}</div>`;
            html += `</div>`;
        }

        return html || '<div style="color:#64748b;">No movement detected in this range.</div>';
    },

    calculateTotalStockAtDate: function (dateObj) {
        let total = 0;
        const dStr = dateObj.toISOString().split('T')[0];
        this.session.forEach(s => {
            const st = this.calculateStateAtDate(s, dStr, dateObj);
            total += st.stock;
        });
        return total;
    },

    getDateRange: function () {
        if (this.session.length === 0) {
            // Fallback to inputs if no session
            const startInput = document.getElementById('sim-start').value;
            const endInput = document.getElementById('sim-end').value;
            if (!startInput || !endInput) return [];
            const start = new Date(startInput);
            const end = new Date(endInput);
            if (start > end) return [];
            let dates = [];
            let cur = new Date(start);
            while (cur <= end) {
                dates.push(new Date(cur));
                cur.setDate(cur.getDate() + 1);
            }
            return dates;
        }

        // Find Global Min Start and Max End from sessions
        let minStart = new Date(8640000000000000);
        let maxEnd = new Date(-8640000000000000);

        this.session.forEach(s => {
            const sDate = new Date(s.startDate);
            const eDate = new Date(s.endDate);
            if (sDate < minStart) minStart = sDate;
            if (eDate > maxEnd) maxEnd = eDate;
        });

        if (minStart > maxEnd) return [];

        let dates = [];
        let cur = new Date(minStart);
        while (cur <= maxEnd) {
            dates.push(new Date(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    },

    getStep: function () {
        return this.currentSlicer === 'daily' ? 1 : (this.currentSlicer === 'weekly' ? 7 : 30);
    },

    getLabels: function (fullDates) {
        if (this.currentSlicer === 'daily') {
            return fullDates.map(d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
        } else if (this.currentSlicer === 'weekly') {
            let labs = [];
            for (let i = 0; i < fullDates.length; i += 7) {
                const d = fullDates[i];
                labs.push('WEEK ' + (Math.floor(i / 7) + 1) + ' (' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ')');
            }
            return labs;
        } else {
            let labs = [];
            for (let i = 0; i < fullDates.length; i += 30) {
                const d = fullDates[i];
                labs.push('MONTH ' + (Math.floor(i / 30) + 1) + ' (' + d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) + ')');
            }
            return labs;
        }
    },

    formatDate: function (dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    renderChart: function () {
        // Legacy Redirect
        this.renderCharts();
    },

    calculateStateAtDate: function (sessionObj, dateStr, dateObj) {
        // Simple day-by-day accumulation from Start Date up to Target Date
        // Note: This is inefficient for long lists (O(N^2)), but fine for < 100 days.
        // Optimize: Calculate ALL states once and cache.

        // Let's do a simple iterative calculation from Session Start Date
        const startDate = new Date(sessionObj.startDate);
        const targetDate = new Date(dateStr);

        // Base Stock (Ton) -> Kg
        let currentKg = sessionObj.baseStock;

        // Iterate days from Start up to Target
        // If Target is before Start, return Base
        if (targetDate < startDate) return { stock: currentKg, inVal: 0, outVal: 0 };

        let d = new Date(startDate);
        let lastIn = 0;
        let lastOut = 0;

        while (d <= targetDate) {
            const dStr = d.toISOString().split('T')[0];

            // Get override or default
            let dIn = sessionObj.defaultIn;
            let dOut = sessionObj.defaultOut;

            if (sessionObj.overrides[dStr]) {
                if (sessionObj.overrides[dStr].in !== undefined) dIn = sessionObj.overrides[dStr].in;
                if (sessionObj.overrides[dStr].out !== undefined) dOut = sessionObj.overrides[dStr].out;
            }

            // Convert Ton -> Kg
            const inKg = dIn * 1000;
            const outKg = dOut * 1000;

            // Update Stock (Apply previous day's movement? Or today's? Usually end-of-day balance)
            // Logic: Start Day Bal = Base + In - Out
            currentKg = currentKg + (inKg - outKg);

            lastIn = dIn;
            lastOut = dOut;

            d.setDate(d.getDate() + 1);
        }

        // REVISION: If target date is beyond session end date, flow is 0, stock is stable (calculated up to end)
        const sessionEnd = new Date(sessionObj.endDate);
        if (targetDate > sessionEnd) {
            return { stock: currentKg, inVal: 0, outVal: 0 };
        }

        return { stock: currentKg, inVal: lastIn, outVal: lastOut };
    },

    updateOverride: function (sessionId, dateStr, type, value) {
        const session = this.session.find(s => s.id === sessionId);
        if (!session) return;

        if (!session.overrides[dateStr]) session.overrides[dateStr] = {};

        session.overrides[dateStr][type] = parseFloat(value) || 0;

        // Re-render to propagate changes to future dates
        this.renderTable();
        this.renderChart(); // Refresh chart too
    },

    // ===============================
    // EXCEL IMPORT ENGINE FUNCTIONS
    // ===============================

    excelData: null, // Parsed Excel data storage

    populateImportFacilityList: function () {
        const container = document.getElementById('import-facility-list');
        if (!container || !this.data.warehouses) return;
        container.innerHTML = '';

        this.data.warehouses.forEach((name, index) => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; padding:10px 15px; cursor:pointer; border-bottom:1px solid #1e293b; transition:background 0.2s;';
            label.onmouseenter = () => label.style.background = 'rgba(255,255,255,0.05)';
            label.onmouseleave = () => label.style.background = 'transparent';

            label.innerHTML = `
                <input type="checkbox" class="import-facility-checkbox" value="${name}" onchange="SimPage.updateImportFacilitySelection()" style="margin-right:10px; accent-color:#bc13fe;">
                <span style="color:#fff; font-weight:600;">${name}</span>
            `;
            container.appendChild(label);
        });
    },

    toggleImportFacilityDropdown: function () {
        const menu = document.getElementById('import-facility-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    },

    toggleImportAllFacilities: function (checked) {
        document.querySelectorAll('.import-facility-checkbox').forEach(cb => cb.checked = checked);
        this.updateImportFacilitySelection();
    },

    updateImportFacilitySelection: function () {
        const allCheckbox = document.getElementById('import-facility-all');
        const checkboxes = document.querySelectorAll('.import-facility-checkbox');
        const checkedBoxes = document.querySelectorAll('.import-facility-checkbox:checked');
        const textSpan = document.getElementById('import-facility-text');

        allCheckbox.checked = checkedBoxes.length === checkboxes.length;

        if (checkedBoxes.length === 0 || checkedBoxes.length === checkboxes.length) {
            textSpan.innerText = 'ALL FACILITIES';
        } else if (checkedBoxes.length === 1) {
            textSpan.innerText = checkedBoxes[0].value;
        } else {
            textSpan.innerText = `${checkedBoxes.length} Gudang Dipilih`;
        }
    },

    getImportSelectedFacilities: function () {
        const checkedBoxes = document.querySelectorAll('.import-facility-checkbox:checked');
        if (checkedBoxes.length === 0) return 'ALL';
        return Array.from(checkedBoxes).map(cb => cb.value);
    },

    previewExcelFile: function (input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Force SheetJS to recognize columns starting from A1 (index 0,0)
                // This prevents trimming of leading empty columns
                if (worksheet['!ref']) {
                    const range = XLSX.utils.decode_range(worksheet['!ref']);
                    range.s.c = 0; // Force Start Column to A
                    range.s.r = 0; // Force Start Row to 1
                    worksheet['!ref'] = XLSX.utils.encode_range(range);
                }

                // Convert to JSON
                this.excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Render Preview
                this.renderExcelPreview();
                // Verifikasi material manual dilakukan via tombol Preview & Verifikasi Material
            } catch (err) {
                alert('Error membaca file Excel: ' + err.message);
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    refreshPreview: function () {
        if (!this.excelData) return;
        this.renderExcelPreview();
        // REMOVED AUTO TRIGGER: detectAndShowMaterialUsage() no longer called here
    },

    renderExcelPreview: function () {
        if (!this.excelData || this.excelData.length === 0) return;

        const previewDiv = document.getElementById('excel-preview');
        const contentDiv = document.getElementById('excel-preview-content');
        previewDiv.style.display = 'block';

        // Get current mappings for preview
        const colDate = document.getElementById('col-date').value;
        const colMaterial = document.getElementById('col-material').value;
        const colQtyIn = document.getElementById('col-qty-in').value;
        const rangeVal = document.getElementById('row-data-range').value;

        const dateIdx = colDate ? this.getColumnIndex(colDate) : -1;
        const matIdx = colMaterial ? this.getColumnIndex(colMaterial) : -1;
        const qtyIdx = colQtyIn ? this.getColumnIndex(colQtyIn) : -1;

        // Parse Range for row coloring if needed
        let startRow = 2;
        if (rangeVal) {
            const parts = rangeVal.split(':');
            startRow = parseInt(parts[0]) || 2;
        }

        let html = '<table style="width:100%; border-collapse:collapse;">';
        // Show first 10 rows to be more helpful
        const maxRows = Math.min(10, this.excelData.length);
        for (let i = 0; i < maxRows; i++) {
            const row = this.excelData[i] || [];
            const headerRow = parseInt(document.getElementById('row-header').value) || 1;
            const isHeader = (i + 1) === headerRow;
            const isDataStart = (i + 1) === startRow;

            html += `<tr style="${isHeader ? 'background:rgba(0,243,255,0.1);' : (isDataStart ? 'background:rgba(188,19,254,0.1);' : '')}">`;

            // Show specific columns if mapped, else show first 5
            const columnsToShow = [dateIdx, matIdx, qtyIdx].filter(idx => idx !== -1);
            if (columnsToShow.length === 0) {
                for (let j = 0; j < Math.min(5, row.length); j++) {
                    html += `<td style="border:1px solid #334155; padding:4px 8px; color:${i === 0 ? '#00f3ff' : '#cbd5e1'}; font-size:0.75rem;">${this.getColumnLetter(j)}: ${row[j] || ''}</td>`;
                }
            } else {
                columnsToShow.forEach(idx => {
                    const colLetter = this.getColumnLetter(idx);
                    const cellVal = row[idx] !== undefined ? row[idx] : '';
                    html += `<td style="border:1px solid #334155; padding:4px 8px; color:${i === 0 ? '#00f3ff' : '#cbd5e1'}; font-size:0.75rem;">${colLetter}: ${cellVal}</td>`;
                });
            }
            html += '</tr>';
        }
        html += '</table>';
        html += `<div style="margin-top:10px; color:#10b981; font-size:0.75rem; display:flex; justify-content:space-between;">
                    <span>✓ Total ${this.excelData.length} baris terdeteksi</span>
                    <span style="color:#bc13fe; font-size:0.7rem;">Biru: Header | Ungu: Data Start</span>
                 </div>`;
        contentDiv.innerHTML = html;
    },

    pendingResolutions: [],
    materialResolutions: {}, // RawValue -> ResolvedName

    verifyAndPreviewData: function () {
        // Required Fields for Verification
        const colDate = document.getElementById('col-date').value;
        const colMaterial = document.getElementById('col-material').value;
        const colQtyIn = document.getElementById('col-qty-in').value;
        const colHeader = document.getElementById('row-header').value;
        const rangeVal = document.getElementById('row-data-range').value;

        if (!colDate || !colMaterial || !colQtyIn || !colHeader || !rangeVal) {
            alert('⚠️ HARAP LENGKAPI SEMUA PEMETAAN KOLOM (Tanggal, Material, Quantity, Header, & Range) sebelum melakukan verifikasi.');
            return;
        }

        if (!this.excelData) {
            alert('⚠️ Harap upload file Excel terlebih dahulu.');
            return;
        }

        // Trigger the logic
        this.detectAndShowMaterialUsage();
    },

    detectAndShowMaterialUsage: function () {
        const colMaterial = document.getElementById('col-material').value;
        const colQtyIn = document.getElementById('col-qty-in').value;
        const rangeVal = document.getElementById('row-data-range').value;

        if (!colMaterial || !this.excelData) return;

        const materialIdx = this.getColumnIndex(colMaterial);
        const qtyIdx = this.getColumnIndex(colQtyIn);

        // Parse Range
        let startRow = 2;
        let endRow = this.excelData.length;
        if (rangeVal && rangeVal.includes(':')) {
            const parts = rangeVal.split(':');
            startRow = parseInt(parts[0]) || 2;
            endRow = parseInt(parts[1]) || this.excelData.length;
        }

        const rawStats = {}; // RawValue -> { total: 0, count: 0, arrivals: [] }
        const colDate = document.getElementById('col-date').value;
        const dateIdx = colDate ? this.getColumnIndex(colDate) : -1;

        for (let i = startRow - 1; i < Math.min(endRow, this.excelData.length); i++) {
            const row = this.excelData[i];
            if (!row || !row[materialIdx]) continue;

            const raw = row[materialIdx].toString();
            const qty = parseFloat(row[qtyIdx]) || 0;
            const dateVal = dateIdx !== -1 ? row[dateIdx] : null;
            const parsedDate = dateVal ? this.parseSmartDate(dateVal) : null;
            const dateStr = parsedDate ? parsedDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown Date';

            if (!rawStats[raw]) rawStats[raw] = { total: 0, count: 0, arrivals: [] };
            rawStats[raw].total += qty;
            rawStats[raw].count++;
            rawStats[raw].arrivals.push({ date: dateStr, qty: qty });
        }

        this.pendingResolutions = [];
        const recognized = new Set();

        Object.keys(rawStats).forEach(raw => {
            const resolved = this.resolveMaterialName(raw);
            if (resolved) {
                recognized.add(resolved);
                this.materialResolutions[raw] = resolved;
            } else {
                this.pendingResolutions.push({
                    raw: raw,
                    total: rawStats[raw].total,
                    count: rawStats[raw].count,
                    arrivals: rawStats[raw].arrivals,
                    suggestions: this.getSimilarMaterials(raw)
                });
            }
        });

        if (this.pendingResolutions.length > 0) {
            this.showNextResolution();
        } else {
            this.renderUsageInputs(Array.from(recognized));
        }
    },

    showNextResolution: function () {
        if (this.pendingResolutions.length === 0) {
            const resolvedValues = new Set(Object.values(this.materialResolutions));
            this.renderUsageInputs(Array.from(resolvedValues));
            document.getElementById('material-resolver-overlay').style.display = 'none';
            return;
        }

        const current = this.pendingResolutions[0];
        const overlay = document.getElementById('material-resolver-overlay');
        overlay.style.display = 'flex';

        document.getElementById('resolver-raw-value').innerText = current.raw;
        document.getElementById('resolver-total-ton').innerText = current.total.toFixed(1) + ' TON';
        document.getElementById('resolver-row-count').innerText = current.count + ' Data';
        document.getElementById('resolver-progress').innerText = `Pending: ${this.pendingResolutions.length}`;

        // Render Breakdown Table
        const breakdownBody = document.getElementById('resolver-breakdown-body');
        breakdownBody.innerHTML = '';
        current.arrivals.forEach(arr => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:6px; border-bottom:1px solid rgba(255,255,255,0.05); color:#cbd5e1;">${arr.date}</td>
                <td style="padding:6px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right; color:#fff; font-weight:600;">${arr.qty.toLocaleString()} T</td>
            `;
            breakdownBody.appendChild(tr);
        });

        const suggContainer = document.getElementById('resolver-suggestions');
        suggContainer.innerHTML = '';

        // Generate suggestions: 7 suggestions + 1 Delete/Ignore option
        const maxSuggestions = 7;
        const availableSuggestions = current.suggestions.slice(0, maxSuggestions);

        // Clear and render 8 options
        suggContainer.innerHTML = '';

        // 1-7: Similarity Suggestions
        availableSuggestions.forEach(s => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.style.padding = '10px';
            div.style.fontSize = '0.75rem';
            div.innerHTML = `<span>${s}</span>`;
            div.onclick = () => {
                document.querySelectorAll('.suggestion-item').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                this.selectedResolution = s;
            };
            suggContainer.appendChild(div);
        });

        // 8: Hapus/Abaikan Option as a grid item
        const deleteDiv = document.createElement('div');
        deleteDiv.className = 'suggestion-item';
        deleteDiv.style.padding = '10px';
        deleteDiv.style.fontSize = '0.75rem';
        deleteDiv.style.border = '1px solid #ef4444';
        deleteDiv.style.background = 'rgba(239, 68, 68, 0.05)';
        deleteDiv.innerHTML = `<span style="color:#ef4444; font-weight:700;">🗑️ HAPUS / ABAIKAN DATA INI</span>`;
        deleteDiv.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Apakah Anda yakin ingin menghapus data "${current.raw}"?`)) {
                this.ignoreMaterial();
            }
        };
        suggContainer.appendChild(deleteDiv);

        this.selectedResolution = null;
    },

    applyResolution: function () {
        if (!this.selectedResolution) {
            alert('Silakan pilih salah satu target material atau hapus data ini.');
            return;
        }
        const current = this.pendingResolutions.shift();
        this.materialResolutions[current.raw] = this.selectedResolution;
        this.showNextResolution();
    },

    ignoreMaterial: function () {
        const current = this.pendingResolutions.shift();
        delete this.materialResolutions[current.raw];
        this.showNextResolution();
    },

    renderUsageInputs: function (materials) {
        const section = document.getElementById('material-usage-section');
        const listDiv = document.getElementById('material-usage-list');

        if (materials.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        const defaultUsage = document.getElementById('import-default-out').value || '0';

        let inputsHtml = '';
        materials.forEach((mat, idx) => {
            inputsHtml += `
                <div style="background:rgba(0,0,0,0.2); border:1px solid #334155; border-radius:6px; padding:10px;">
                    <label style="display:block; color:#00f3ff; font-size:0.75rem; margin-bottom:5px; font-weight:600;">${mat}</label>
                    <input type="number" id="mat-usage-${idx}" class="control-input mat-usage-input" 
                           data-material="${mat}" value="${defaultUsage}" 
                           style="font-size:0.8rem; padding:8px;"
                           placeholder="Usage (Ton/Hari)">
                </div>
            `;
        });
        listDiv.innerHTML = inputsHtml;
    },

    getMaterialUsageMap: function () {
        const usageMap = {};
        const inputs = document.querySelectorAll('.mat-usage-input');
        inputs.forEach(input => {
            const matName = input.dataset.material;
            const usage = parseFloat(input.value) || 0;
            usageMap[matName] = usage;
        });
        return usageMap;
    },

    getColumnLetter: function (index) {
        let letter = '';
        while (index >= 0) {
            letter = String.fromCharCode((index % 26) + 65) + letter;
            index = Math.floor(index / 26) - 1;
        }
        return letter;
    },

    getColumnIndex: function (letter) {
        letter = letter.toUpperCase().trim();
        let index = 0;
        for (let i = 0; i < letter.length; i++) {
            index = index * 26 + (letter.charCodeAt(i) - 64);
        }
        return index - 1; // 0-indexed
    },

    // Updated Color Palette: High Contrast Neons (STRICTLY NO DARK/PURPLE/PINK)
    // Cyan, Neon Green, Bright Yellow, Bright Orange, Neon Blue (Light), Vermilion
    colorPalette: [
        '#00f3ff', // Cyan
        '#39ff14', // Neon Lime
        '#ffe600', // Neon Yellow
        '#ff9500', // Bright Orange
        '#38bdf8', // Sky Blue (Light Blue)
        '#ff4d4d', // Bright Red/Coral (Safe)
    ],
    colorIndex: 0,

    getRandomColor: function () {
        // Return next color in palette, cycling
        const color = this.colorPalette[this.colorIndex % this.colorPalette.length];
        this.colorIndex++;
        return color;
    },

    importFromExcel: function () {
        if (!this.excelData || this.excelData.length === 0) {
            alert('Silakan upload file Excel terlebih dahulu!');
            return;
        }

        // Get column mappings
        const colDate = document.getElementById('col-date').value;
        const colMaterial = document.getElementById('col-material').value;
        const colQtyIn = document.getElementById('col-qty-in').value;
        const rowHeader = parseInt(document.getElementById('row-header').value) || 1;
        const rangeVal = document.getElementById('row-data-range').value;
        const defaultOut = parseFloat(document.getElementById('import-default-out').value) || 0;
        const selectedFacilities = this.getImportSelectedFacilities();

        // Metadata fields
        const sourceDoc = document.getElementById('import-source').value;
        const receiptDate = document.getElementById('import-receipt-date').value;

        // Override dates (optional - if empty, use dates from Excel data)
        const overrideStartDate = document.getElementById('import-start-date').value || null;
        const overrideEndDate = document.getElementById('import-end-date').value || null;

        // Get per-material usage map
        const materialUsageMap = this.getMaterialUsageMap();

        // Validate required columns
        if (!colDate || !colMaterial || !colQtyIn) {
            alert('Mohon isi semua kolom mapping (Tanggal, Material, Qty)!');
            return;
        }

        const dateIdx = this.getColumnIndex(colDate);
        const materialIdx = this.getColumnIndex(colMaterial);
        const qtyIdx = this.getColumnIndex(colQtyIn);

        // Group data by material
        const materialGroups = {};

        // Parse Range
        let startRow = 2;
        let endRow = this.excelData.length;
        if (rangeVal && rangeVal.includes(':')) {
            const parts = rangeVal.split(':');
            startRow = parseInt(parts[0]) || 2;
            endRow = parseInt(parts[1]) || this.excelData.length;
        } else if (rangeVal) {
            startRow = parseInt(rangeVal) || 2;
        }

        for (let i = startRow - 1; i < Math.min(endRow, this.excelData.length); i++) {
            const row = this.excelData[i];
            if (!row || row.length === 0) continue;

            const dateVal = row[dateIdx];
            const materialVal = row[materialIdx];
            const qtyVal = parseFloat(row[qtyIdx]) || 0;

            if (!materialVal || !dateVal) continue;

            // USE THE MAPPED RESOLUTION
            const matKey = this.materialResolutions[materialVal.toString()];
            if (!matKey) continue; // Skip if ignored or not resolved

            // Smart Date Parsing
            const parsedDate = this.parseSmartDate(dateVal);
            if (!parsedDate || isNaN(parsedDate.getTime())) continue;

            const dateStr = parsedDate.toISOString().split('T')[0];

            if (!materialGroups[matKey]) {
                materialGroups[matKey] = {
                    dates: {},
                    minDate: dateStr,
                    maxDate: dateStr,
                    totalIn: 0
                };
            }

            if (!materialGroups[matKey].dates[dateStr]) {
                materialGroups[matKey].dates[dateStr] = { in: 0, out: defaultOut };
            }
            materialGroups[matKey].dates[dateStr].in += qtyVal;
            materialGroups[matKey].totalIn += qtyVal;

            if (dateStr < materialGroups[matKey].minDate) materialGroups[matKey].minDate = dateStr;
            if (dateStr > materialGroups[matKey].maxDate) materialGroups[matKey].maxDate = dateStr;
        }

        // Create sessions for each material group
        const facilityLabel = selectedFacilities === 'ALL' ? 'ALL' : (Array.isArray(selectedFacilities) ? selectedFacilities.join(', ') : selectedFacilities);

        Object.keys(materialGroups).forEach(matName => {
            const group = materialGroups[matName];
            const color = this.colors[this.session.length % this.colors.length];
            const id = Date.now() + Math.random().toString();

            // Try to get base stock from loaded data
            let baseStock = 0;
            const matData = this.data.materials ? this.data.materials.find(m => m.name.toLowerCase() === matName.toLowerCase()) : null;
            if (matData && matData.stocks) {
                if (selectedFacilities === 'ALL') {
                    baseStock = matData.stocks.reduce((a, b) => a + b, 0);
                } else if (Array.isArray(selectedFacilities)) {
                    selectedFacilities.forEach(facName => {
                        const idx = this.data.warehouses.indexOf(facName);
                        if (idx !== -1 && matData.stocks[idx]) baseStock += matData.stocks[idx];
                    });
                }
            }

            // Get per-material usage (fallback to defaultOut)
            const matUsage = materialUsageMap[matName] !== undefined ? materialUsageMap[matName] : defaultOut;

            const sessionObj = {
                id: id,
                material: matName,
                facility: facilityLabel,
                startDate: overrideStartDate || group.minDate,
                endDate: overrideEndDate || group.maxDate,
                defaultIn: 0,
                defaultOut: matUsage,
                baseStock: baseStock,
                color: color,
                overrides: group.dates,
                source: sourceDoc,
                receiptDate: receiptDate
            };

            this.session.push(sessionObj);
        });

        // Render updates
        this.renderQueue();
        this.renderTable();
        this.renderChart();

        alert(`✓ Import berhasil! ${Object.keys(materialGroups).length} material ditambahkan ke simulasi.`);
    },

    // Smart Material Logic
    resolveMaterialName: function (rawValue) {
        if (!rawValue) return null;
        let strVal = rawValue.toString().trim().toUpperCase();

        // 1. Exact Match in Config
        if (CONFIG.MATERIAL_CODES && CONFIG.MATERIAL_CODES[strVal]) {
            return CONFIG.MATERIAL_CODES[strVal];
        }

        // 2. Try to extract numeric code and match
        const numericMatch = strVal.match(/\d+/);
        if (numericMatch) {
            const code = numericMatch[0];
            if (CONFIG.MATERIAL_CODES && CONFIG.MATERIAL_CODES[code]) {
                return CONFIG.MATERIAL_CODES[code];
            }
        }

        // 3. Match from loaded data materials (Case Insensitive)
        if (this.data && this.data.materials) {
            const exactMat = this.data.materials.find(m => m.name.toUpperCase() === strVal);
            if (exactMat) return exactMat.name;

            // Partial Match (contains)
            const partialMat = this.data.materials.find(m => m.name.toUpperCase().includes(strVal) || strVal.includes(m.name.toUpperCase()));
            if (partialMat) return partialMat.name;
        }

        return null; // Trigger manual resolver
    },

    getSimilarMaterials: function (input) {
        if (!input || !this.data || !this.data.materials) return [];
        const str = input.toString().toUpperCase();

        let scores = this.data.materials.map(m => {
            const target = m.name.toUpperCase();
            let score = 0;
            if (target.includes(str) || str.includes(target)) score += 0.5;
            const set1 = new Set(str.split(''));
            const set2 = new Set(target.split(''));
            let intersection = 0;
            set1.forEach(c => { if (set2.has(c)) intersection++; });
            score += (intersection / Math.max(set1.size, set2.size)) * 0.5;
            return { name: m.name, score: score };
        });

        return scores
            .filter(s => s.score > 0.2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(s => s.name);
    },

    // Smart Date Parsing - handles multiple formats
    parseSmartDate: function (rawValue) {
        if (!rawValue) return null;
        if (rawValue instanceof Date) return rawValue;
        if (typeof rawValue === 'number') return this.excelDateToJS(rawValue);

        let strVal = rawValue.toString().trim();
        const monthMap = {
            'jan': 0, 'januari': 0, 'january': 0,
            'feb': 1, 'februari': 1, 'february': 1,
            'mar': 2, 'maret': 2, 'march': 2,
            'apr': 3, 'april': 3,
            'may': 4, 'mei': 4,
            'jun': 5, 'juni': 5, 'june': 5,
            'jul': 6, 'juli': 6, 'july': 6,
            'aug': 7, 'agustus': 7, 'august': 7, 'agu': 7,
            'sep': 8, 'september': 8, 'sept': 8,
            'oct': 9, 'oktober': 9, 'october': 9, 'okt': 9,
            'nov': 10, 'november': 10, 'nop': 10,
            'dec': 11, 'desember': 11, 'december': 11, 'des': 11
        };

        // 1. DD/MM/YYYY
        const dmyMatch = strVal.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (dmyMatch) {
            let day = parseInt(dmyMatch[1]);
            let month = parseInt(dmyMatch[2]) - 1;
            let year = parseInt(dmyMatch[3]);
            if (year < 100) year += 2000;
            return new Date(year, month, day);
        }

        // 2. YYYY-MM-DD
        const isoMatch = strVal.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));

        // 3. DD MMM YYYY
        const textMonthMatch = strVal.match(/^(\d{1,2})[\s\-\.]+([a-zA-Z]+)[\s\-\.]+(\d{2,4})$/i);
        if (textMonthMatch) {
            const day = parseInt(textMonthMatch[1]);
            const month = monthMap[textMonthMatch[2].toLowerCase()];
            let year = parseInt(textMonthMatch[3]);
            if (year < 100) year += 2000;
            if (month !== undefined) return new Date(year, month, day);
        }

        let native = new Date(strVal);
        return isNaN(native.getTime()) ? null : native;
    },

    excelDateToJS: function (serial) {
        const utcDays = Math.floor(serial - 25569);
        const utcValue = utcDays * 86400;
        return new Date(utcValue * 1000);
    }
};

// Auto Init
document.addEventListener('DOMContentLoaded', () => {
    SimPage.init();
});
