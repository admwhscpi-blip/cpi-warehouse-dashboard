/**
 * PAGE CONTROLLER: CPO FUTURE PROJECTION ENGINE
 * High-fidelity mirror of RM Simulation engine for CPO Tanks
 */

const SimPage = {
    data: null,
    session: [], // Comparison Queue: Array of Objects { material, facility, startDate, endDate, dailyIn, dailyOut, color, baseStock }
    colors: ['#00f3ff', '#bc13fe', '#ff2a2a', '#ff9e0b', '#0aff0a', '#ffffff'],
    stockChartInstance: null,
    movementChartInstance: null,
    hudStockChartInstance: null,
    hudMovementChartInstance: null,
    currentSlicer: 'daily', // daily, weekly, monthly
    isFullscreen: false,

    init: async function () {
        console.log("CPO SimPage Initializing...");

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

        // Hide loading overlay
        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.add('hidden');
        }, 500);

        console.log("CPO SimPage Ready");
    },

    populateDropdowns: function () {
        const matSelect = document.getElementById('sim-material');
        matSelect.innerHTML = '';

        // For CPO, we traditionally use the Tank Names as "Materials" or "CPO Grade"
        // But the data might have specific CPO materials. Let's filter for CPO related materials.
        const cpoMaterials = this.data.materials.filter(m =>
            m.name.toLowerCase().includes('cpo') ||
            (m.category && m.category.toLowerCase().includes('cpo'))
        );

        if (cpoMaterials.length > 0) {
            cpoMaterials.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                opt.innerText = m.name;
                matSelect.appendChild(opt);
            });
        } else {
            // Fallback: Use all materials if no CPO category found
            this.data.materials.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                opt.innerText = m.name;
                matSelect.appendChild(opt);
            });
        }

        // Populate Tank List (Instead of Warehouse)
        this.populateTankList();
    },

    populateTankList: function () {
        const container = document.getElementById('facility-list');
        if (!container || !this.data.warehouses) return;
        container.innerHTML = '';

        // Filter warehouses to only include CPO Tanks (TK01 - TK07)
        const tanks = this.data.warehouses.filter(w => w.toUpperCase().includes('TK'));

        tanks.forEach((name) => {
            const index = this.data.warehouses.indexOf(name);

            // Calculate current stock and available space
            let currentStock = 0;
            this.data.materials.forEach(m => {
                if (m.stocks && m.stocks[index]) currentStock += m.stocks[index];
            });
            let currentStockTon = currentStock / 1000;

            // Get capacity
            const hardCapTon = CONFIG.WAREHOUSE_CAPACITIES[name.toUpperCase()] || (this.data.capacities[index] / 1000);
            const availableSpace = Math.max(0, hardCapTon - currentStockTon).toFixed(0);
            const usagePercent = hardCapTon > 0 ? ((currentStockTon / hardCapTon) * 100).toFixed(0) : 0;
            const barColor = usagePercent >= 90 ? '#ef4444' : (usagePercent >= 75 ? '#ff9e0b' : '#00f3ff');

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

        allCheckbox.checked = checkedBoxes.length === checkboxes.length;

        if (checkedBoxes.length === 0 || checkedBoxes.length === checkboxes.length) {
            textSpan.innerText = 'ALL TANKS';
        } else if (checkedBoxes.length === 1) {
            textSpan.innerText = checkedBoxes[0].value;
        } else {
            textSpan.innerText = `${checkedBoxes.length} Tangki Dipilih`;
        }
    },

    getSelectedFacilities: function () {
        const checkedBoxes = document.querySelectorAll('.facility-checkbox:checked');
        if (checkedBoxes.length === 0) return 'ALL';
        return Array.from(checkedBoxes).map(cb => cb.value);
    },

    addToSession: function () {
        const matName = document.getElementById('sim-material').value;
        const selectedFacilities = this.getSelectedFacilities();
        const startDate = document.getElementById('sim-start').value;
        const endDate = document.getElementById('sim-end').value;
        const defIn = parseFloat(document.getElementById('sim-daily-in').value) || 0;
        const defOut = parseFloat(document.getElementById('sim-daily-out').value) || 0;

        if (!matName) { alert("Please select a CPO grade"); return; }
        if (!startDate || !endDate) { alert("Please set date range"); return; }

        let currentStockTon = 0;
        const matData = this.data.materials.find(m => m.name === matName);
        if (matData) {
            const tanks = this.data.warehouses.filter(w => w.toUpperCase().includes('TK'));
            if (selectedFacilities === 'ALL') {
                tanks.forEach(tank => {
                    const idx = this.data.warehouses.indexOf(tank);
                    if (idx !== -1 && matData.stocks[idx]) currentStockTon += (matData.stocks[idx] / 1000);
                });
            } else {
                selectedFacilities.forEach(facName => {
                    const idx = this.data.warehouses.indexOf(facName);
                    if (idx !== -1 && matData.stocks[idx]) currentStockTon += (matData.stocks[idx] / 1000);
                });
            }
        }

        const color = this.colors[this.session.length % this.colors.length];
        const id = Date.now() + Math.random().toString();

        const sessionObj = {
            id: id,
            material: matName,
            facility: selectedFacilities === 'ALL' ? 'ALL' : (Array.isArray(selectedFacilities) ? selectedFacilities.join(', ') : selectedFacilities),
            startDate: startDate,
            endDate: endDate,
            defaultIn: defIn,
            defaultOut: defOut,
            baseStock: currentStockTon, // In Ton
            color: color,
            overrides: {}
        };

        this.session.push(sessionObj);

        this.renderQueue();
        this.renderTable();
        this.renderCharts();
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
        this.renderCharts();
    },

    setSlicer: function (mode) {
        this.currentSlicer = mode;
        document.querySelectorAll('.slicer-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`slicer-${mode}`).classList.add('active');
        this.renderCharts();
        this.renderTable();
        if (this.isFullscreen) this.renderHUD();
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

    updateOverride: function (sessionId, dateStr, field, value) {
        const s = this.session.find(x => x.id === sessionId);
        if (!s) return;
        if (!s.overrides[dateStr]) s.overrides[dateStr] = {};
        s.overrides[dateStr][field] = parseFloat(value) || 0;

        this.renderTable();
        this.renderCharts();
        this.calculateInsights();
    },

    calculateStateAtDate: function (s, targetDateStr, targetDateObj) {
        const startDate = new Date(s.startDate);
        let currentStock = s.baseStock;
        let finalIn = s.defaultIn;
        let finalOut = s.defaultOut;

        let curr = new Date(startDate);
        while (curr <= targetDateObj) {
            const dateStr = curr.toISOString().split('T')[0];
            let dIn = s.defaultIn;
            let dOut = s.defaultOut;
            if (s.overrides[dateStr]) {
                if (s.overrides[dateStr].in !== undefined) dIn = s.overrides[dateStr].in;
                if (s.overrides[dateStr].out !== undefined) dOut = s.overrides[dateStr].out;
            }

            if (dateStr === targetDateStr) {
                finalIn = dIn;
                finalOut = dOut;
                // Stock at END of day involves today's flow
                currentStock += (dIn - dOut);
                break;
            }

            currentStock += (dIn - dOut);
            curr.setDate(curr.getDate() + 1);
        }

        return { stock: currentStock, inVal: finalIn, outVal: finalOut };
    },

    renderTable: function () {
        const viewMode = document.getElementById('view-mode-select').value;
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
        thead.innerHTML = `
            <tr>
                <th style="text-align:left;">CPO GRADE</th>
                <th>INITIAL (TON)</th>
                <th>TOTAL IN (TON)</th>
                <th>TOTAL OUT (TON)</th>
                <th>PROJECTED END (TON)</th>
                <th>STATUS</th>
            </tr>
        `;

        this.session.forEach(s => {
            let totalIn = 0;
            let totalOut = 0;
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

            const finalTon = s.baseStock + totalIn - totalOut;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:left; color:${s.color}; font-weight:bold;">${s.material}</td>
                <td>${s.baseStock.toLocaleString()}</td>
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

        if (this.currentSlicer !== 'daily') {
            const step = this.currentSlicer === 'weekly' ? 7 : 30;
            displayDates = fullDates.filter((_, i) => i % step === 0);
        }

        let row1 = `<tr><th rowspan="2" style="position:sticky; left:0; z-index:10; background:#0f172a; border-right:2px solid #333; width:${isHud ? '80px' : '100px'};">DATE</th>`;
        let row2 = '<tr>';

        this.session.forEach(s => {
            row1 += `<th colspan="3" class="th-group-header" style="color:${s.color}; border-bottom:2px solid ${s.color};">${s.material}</th>`;
            row2 += `<th class="col-stock">STOCK</th><th class="col-in">IN</th><th class="col-out">OUT</th>`;
        });

        row1 += '</tr>'; row2 += '</tr>';
        thead.innerHTML = row1 + row2;

        displayDates.forEach((dateObj) => {
            const dateStr = dateObj.toISOString().split('T')[0];
            let dateDisplay = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

            const tr = document.createElement('tr');
            let tds = `<td style="position:sticky; left:0; z-index:5; background:#0a0a0a; border-right:2px solid #333; font-weight:bold; color:#cbd5e1;">${dateDisplay}</td>`;

            this.session.forEach(s => {
                const state = this.calculateStateAtDate(s, dateStr, dateObj);
                tds += `
                    <td style="color:${state.stock < 0 ? '#ef4444' : '#fff'}; font-weight:700;">${state.stock.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                    <td style="padding:0;"><input type="number" class="editable-cell" value="${state.inVal}" onchange="SimPage.updateOverride('${s.id}', '${dateStr}', 'in', this.value)"></td>
                    <td style="padding:0;"><input type="number" class="editable-cell" value="${state.outVal}" onchange="SimPage.updateOverride('${s.id}', '${dateStr}', 'out', this.value)"></td>
                `;
            });
            tr.innerHTML = tds;
            tbody.appendChild(tr);
        });
    },

    calculateInsights: function () {
        const container = document.getElementById('analytics-grid');
        if (!container) return;
        let html = '';
        this.session.forEach(s => {
            const state = this.calculateStateAtDate(s, s.endDate, new Date(s.endDate));
            html += `
                <div class="insight-metric">
                    <div style="font-size:0.7rem; color:#94a3b8;">${s.material} FINAL PROJECTION</div>
                    <div style="color:${s.color}; font-size:1.2rem; font-weight:bold;">${state.stock.toLocaleString()} T</div>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    renderCharts: function () {
        this.renderStockChart('stockChart');
        this.renderMovementChart('movementChart');
    },

    renderHUD: function () {
        this.renderStockChart('hudStockChart');
        this.renderMovementChart('hudMovementChart');
        this.renderSummaryBoxes();
    },

    renderSummaryBoxes: function () {
        if (this.session.length === 0) return;
        const s = this.session[this.session.length - 1];

        document.getElementById('txt-active-projects').innerText = this.session.length;
        document.getElementById('txt-last-update').innerText = new Date().toLocaleTimeString();

        const textContainer = document.getElementById('summary-movement-text');
        const predictiveHtml = this.generatePredictiveText();
        textContainer.innerHTML = predictiveHtml;

        const hudTextContainer = document.getElementById('hud-summary-movement-text');
        if (hudTextContainer) hudTextContainer.innerHTML = predictiveHtml;

        let totalStart = 0, totalEnd = 0;
        this.session.forEach(sess => {
            totalStart += sess.baseStock;
            totalEnd += this.calculateStateAtDate(sess, sess.endDate, new Date(sess.endDate)).stock;
        });

        const net = totalEnd - totalStart;
        const impactEl = document.getElementById('summary-total-impact');
        impactEl.innerText = `${net >= 0 ? '+' : ''}${net.toLocaleString()} TON`;
        impactEl.style.color = net >= 0 ? '#34d399' : '#f87171';

        document.getElementById('summary-impact-desc').innerText = `TOTAL STOCK: ${totalStart.toLocaleString()} -> ${totalEnd.toLocaleString()} (${net >= 0 ? 'SURPLUS' : 'DEFICIT'})`;
    },

    generatePredictiveText: function () {
        if (this.session.length === 0) return "Waiting for data...";
        let html = '';
        this.session.forEach(s => {
            const startStr = s.startDate;
            const endStr = s.endDate;
            const startState = this.calculateStateAtDate(s, startStr, new Date(startStr));
            const endState = this.calculateStateAtDate(s, endStr, new Date(endStr));
            const diff = endState.stock - startState.stock;

            html += `<div style="margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:${s.color}; font-weight:bold;">${s.material}:</span> 
                <span style="color:${diff >= 0 ? '#34d399' : '#f87171'}">${diff >= 0 ? 'Naik' : 'Turun'} ${Math.abs(diff).toLocaleString()} T</span>
                <div style="font-size:0.75rem; color:#64748b;">Target: ${endState.stock.toLocaleString()} T pada ${endStr}</div>
            </div>`;
        });
        return html;
    },

    renderStockChart: function (targetId) {
        const ctx = document.getElementById(targetId);
        if (!ctx) return;
        const isHud = targetId.includes('hud');
        let inst = isHud ? this.hudStockChartInstance : this.stockChartInstance;
        if (inst) inst.destroy();

        const fullDates = this.getDateRange();
        if (fullDates.length === 0) return;

        const labels = fullDates.map(d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));

        const datasets = this.session.map(s => {
            const data = fullDates.map(d => {
                const dateStr = d.toISOString().split('T')[0];
                return this.calculateStateAtDate(s, dateStr, d).stock;
            });
            return {
                label: s.material,
                data: data,
                borderColor: s.color,
                backgroundColor: s.color + '20',
                fill: true,
                tension: 0.3
            };
        });

        const newChart = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 } }
                }
            }
        });

        if (isHud) this.hudStockChartInstance = newChart;
        else this.stockChartInstance = newChart;
    },

    renderMovementChart: function (targetId) {
        const ctx = document.getElementById(targetId);
        if (!ctx) return;
        const isHud = targetId.includes('hud');
        let inst = isHud ? this.hudMovementChartInstance : this.movementChartInstance;
        if (inst) inst.destroy();

        const fullDates = this.getDateRange();
        if (fullDates.length === 0) return;
        const labels = fullDates.map(d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));

        const datasets = [];
        this.session.forEach(s => {
            const dataIn = fullDates.map(d => {
                const dateStr = d.toISOString().split('T')[0];
                return this.calculateStateAtDate(s, dateStr, d).inVal;
            });
            const dataOut = fullDates.map(d => {
                const dateStr = d.toISOString().split('T')[0];
                return -this.calculateStateAtDate(s, dateStr, d).outVal;
            });

            datasets.push({
                label: s.material + ' (IN)',
                data: dataIn,
                backgroundColor: '#10b981',
                stack: s.id
            });
            datasets.push({
                label: s.material + ' (OUT)',
                data: dataOut,
                backgroundColor: '#ef4444',
                stack: s.id
            });
        });

        const newChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 } }
                }
            }
        });

        if (isHud) this.hudMovementChartInstance = newChart;
        else this.movementChartInstance = newChart;
    },

    renderQueue: function () {
        const container = document.getElementById('session-queue');
        if (this.session.length === 0) {
            container.innerHTML = '<span class="queue-label">SESSION QUEUE (CPO):</span><span style="color:#444; font-size:0.8rem;">No active simulations.</span>';
            return;
        }
        let html = '<span class="queue-label">SESSION QUEUE (CPO):</span>';
        this.session.forEach(s => {
            html += `
                <div class="sim-chip">
                    <div class="chip-color" style="background:${s.color};"></div>
                    <span>${s.material} (${s.baseStock.toFixed(0)}T)</span>
                    <span class="chip-close" onclick="SimPage.removeFromSession('${s.id}')">&times;</span>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    saveProject: function () {
        const name = prompt("Project Name:", "CPO Sim " + new Date().toLocaleDateString());
        if (!name) return;
        const history = JSON.parse(localStorage.getItem('cpo_sim_history') || '[]');
        history.unshift({ id: Date.now(), name, timestamp: new Date().toISOString(), session: this.session });
        localStorage.setItem('cpo_sim_history', JSON.stringify(history.slice(0, 10)));
        this.loadHistory();
    },

    loadHistory: function () {
        const history = JSON.parse(localStorage.getItem('cpo_sim_history') || '[]');
        const container = document.getElementById('history-section');
        const list = document.getElementById('history-list');
        if (history.length === 0) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        list.innerHTML = history.map(h => `
            <div class="history-card" onclick="SimPage.launchFromHistory(${h.id})" style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; cursor:pointer; min-width:150px;">
                <div style="font-weight:bold; font-size:0.8rem;">${h.name}</div>
                <div style="font-size:0.6rem; color:#64748b;">${new Date(h.timestamp).toLocaleString()}</div>
            </div>
        `).join('');
    },

    launchFromHistory: function (id) {
        const history = JSON.parse(localStorage.getItem('cpo_sim_history') || '[]');
        const h = history.find(x => x.id === id);
        if (h && confirm(`Load project "${h.name}"?`)) {
            this.session = h.session;
            this.renderQueue(); this.renderTable(); this.renderCharts();
        }
    },

    // ===============================
    // EXCEL IMPORT ENGINE FUNCTIONS
    // ===============================
    excelData: null,
    materialResolutions: {},

    previewExcelFile: function (input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                this.excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                this.renderExcelPreview();
            } catch (err) {
                alert('Error reading Excel: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    refreshPreview: function () {
        if (this.excelData) this.renderExcelPreview();
    },

    renderExcelPreview: function () {
        if (!this.excelData) return;
        const previewDiv = document.getElementById('excel-preview');
        const contentDiv = document.getElementById('excel-preview-content');
        previewDiv.style.display = 'block';

        const colDate = document.getElementById('col-date').value;
        const colMaterial = document.getElementById('col-material').value;
        const colQtyIn = document.getElementById('col-qty-in').value;
        const dateIdx = colDate ? this.getColumnIndex(colDate) : -1;
        const matIdx = colMaterial ? this.getColumnIndex(colMaterial) : -1;
        const qtyIdx = colQtyIn ? this.getColumnIndex(colQtyIn) : -1;

        let html = '<table style="width:100%; border-collapse:collapse;">';
        for (let i = 0; i < Math.min(5, this.excelData.length); i++) {
            const row = this.excelData[i] || [];
            html += `<tr>`;
            [dateIdx, matIdx, qtyIdx].forEach(idx => {
                if (idx === -1) return;
                html += `<td style="border:1px solid #334155; padding:4px 8px; color:#cbd5e1;">${row[idx] || ''}</td>`;
            });
            html += '</tr>';
        }
        html += '</table>';
        contentDiv.innerHTML = html;
    },

    verifyAndPreviewData: function () {
        if (!this.excelData) { alert("Please upload a file first"); return; }
        const colMat = document.getElementById('col-material').value;
        if (!colMat) { alert("Specify Material Column"); return; }

        const matIdx = this.getColumnIndex(colMat);
        const rawMats = new Set();
        this.excelData.slice(1).forEach(row => { if (row[mIdx]) rawMats.add(row[mIdx].toString()); });

        this.pendingResolutions = [];
        rawMats.forEach(raw => {
            const resolved = this.resolveMaterialName(raw);
            if (!resolved) {
                this.pendingResolutions.push({ raw: raw, suggestions: this.getSimilarMaterials(raw) });
            } else {
                this.materialResolutions[raw] = resolved;
            }
        });

        if (this.pendingResolutions.length > 0) this.showNextResolution();
        else alert("All materials recognized!");
    },

    showNextResolution: function () {
        const overlay = document.getElementById('material-resolver-overlay');
        const current = this.pendingResolutions[0];
        if (!current) { overlay.style.display = 'none'; return; }

        overlay.style.display = 'flex';
        document.getElementById('resolver-raw-value').innerText = current.raw;
        const container = document.getElementById('resolver-suggestions');
        container.innerHTML = '';
        current.suggestions.forEach(s => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerText = s;
            div.onclick = () => { this.materialResolutions[current.raw] = s; this.pendingResolutions.shift(); this.showNextResolution(); };
            container.appendChild(div);
        });
    },

    importFromExcel: function () {
        if (!this.excelData) return;
        const colDate = document.getElementById('col-date').value;
        const colMat = document.getElementById('col-material').value;
        const colQty = document.getElementById('col-qty-in').value;
        const range = document.getElementById('row-data-range').value.split(':');
        const startRow = parseInt(range[0]) || 2;
        const endRow = parseInt(range[1]) || this.excelData.length;

        const dIdx = this.getColumnIndex(colDate);
        const mIdx = this.getColumnIndex(colMat);
        const qIdx = this.getColumnIndex(colQty);

        const groups = {};
        for (let i = startRow - 1; i < Math.min(endRow, this.excelData.length); i++) {
            const row = this.excelData[i];
            if (!row || !row[mIdx]) continue;
            const res = this.materialResolutions[row[mIdx].toString()] || this.resolveMaterialName(row[mIdx]);
            if (!res) continue;
            const d = this.parseSmartDate(row[dIdx]);
            if (!d) continue;
            const dStr = d.toISOString().split('T')[0];

            if (!groups[res]) groups[res] = { dates: {}, min: dStr, max: dStr };
            if (!groups[res].dates[dStr]) groups[res].dates[dStr] = { in: 0, out: 0 };
            groups[res].dates[dStr].in += parseFloat(row[qIdx]) || 0;
            if (dStr < groups[res].min) groups[res].min = dStr;
            if (dStr > groups[res].max) groups[res].max = dStr;
        }

        Object.keys(groups).forEach(name => {
            const g = groups[name];
            this.session.push({
                id: Date.now() + Math.random(),
                material: name,
                facility: 'AUTO (Excel)',
                startDate: g.min,
                endDate: g.max,
                defaultIn: 0,
                defaultOut: parseFloat(document.getElementById('import-default-out').value) || 0,
                baseStock: 0,
                color: this.getRandomColor(),
                overrides: g.dates
            });
        });

        this.renderQueue(); this.renderTable(); this.renderCharts();
    },

    resolveMaterialName: function (raw) {
        if (!raw) return null;
        const str = raw.toString().toUpperCase();
        const found = this.data.materials.find(m => m.name.toUpperCase() === str || m.name.toUpperCase().includes(str));
        return found ? found.name : null;
    },

    getSimilarMaterials: function (raw) {
        if (!raw) return [];
        const str = raw.toString().toUpperCase();
        return this.data.materials
            .filter(m => m.name.toUpperCase().includes(str.substring(0, 3)))
            .map(m => m.name).slice(0, 5);
    },

    parseSmartDate: function (val) {
        if (typeof val === 'number') return this.excelDateToJS(val);
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    },

    excelDateToJS: function (serial) {
        return new Date(Math.floor(serial - 25569) * 86400 * 1000);
    },

    getColumnIndex: function (letter) {
        letter = letter.toUpperCase();
        let idx = 0;
        for (let i = 0; i < letter.length; i++) idx = idx * 26 + (letter.charCodeAt(i) - 64);
        return idx - 1;
    },

    getRandomColor: function () {
        return this.colors[Math.floor(Math.random() * this.colors.length)];
    }
};

window.onload = () => SimPage.init();
