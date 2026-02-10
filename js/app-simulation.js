// APP SIMULATION MODULE (REVISED)
// Features: Ending Date, Default Rates, Multi-Material Buffer, Chart.js

const SimService = {
    data: null,
    sessionData: [], // Stores: { material, data: [], color }
    currentProjection: [],
    currentCapacity: 0,
    currentMaterialName: "",
    chartInstance: null,

    // 1. INITIALIZATION
    init: function (data) {
        console.log("SimService Initializing with data:", data);
        if (!data) {
            alert("Gagal memuat data simulasi.");
            return;
        }
        this.data = data;
        this.populateDropdowns();

        // Set Default Dates
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + 14); // Default 2 weeks

        const startInput = document.getElementById('sim-start-date');
        const endInput = document.getElementById('sim-end-date');

        if (startInput) startInput.value = today.toISOString().split('T')[0];
        if (endInput) endInput.value = endDate.toISOString().split('T')[0];
    },

    setMode: function (mode) {
        // UI Toggle Only
        document.getElementById('mode-material').classList.toggle('active', mode === 'material');
        document.getElementById('mode-warehouse').classList.toggle('active', mode === 'warehouse');
    },

    populateDropdowns: function () {
        if (!this.data) return;
        const matSelect = document.getElementById('sim-material-select');
        matSelect.innerHTML = '';

        if (this.data.materials.length === 0) {
            const option = document.createElement('option');
            option.text = "No Data Available";
            matSelect.appendChild(option);
            return;
        }

        this.data.materials.forEach(mat => {
            const option = document.createElement('option');
            option.value = mat.name;
            option.innerText = mat.name;
            matSelect.appendChild(option);
        });

        const whSelect = document.getElementById('sim-warehouse-select');
        whSelect.innerHTML = '<option value="all">ALL FACILITIES (Combined)</option>';
        this.data.warehouses.forEach((wh, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.innerText = wh;
            whSelect.appendChild(option);
        });
    },

    // 2. CORE LOGIC: RUN PROJECTION (Now adds directly to session)
    runProjection: function () {
        // Collect Inputs
        const materialSelect = document.getElementById('sim-material-select');
        const materialName = materialSelect ? materialSelect.value : null;

        const warehouseIdx = document.getElementById('sim-warehouse-select').value;
        const startDateStr = document.getElementById('sim-start-date').value;
        const endDateStr = document.getElementById('sim-end-date').value;
        const defaultIn = parseFloat(document.getElementById('sim-daily-in').value) || 0;
        const defaultOut = parseFloat(document.getElementById('sim-daily-out').value) || 0;

        if (!this.data) {
            alert("Data sistem belum siap. Tunggu sebentar atau refresh halaman.");
            return;
        }
        if (!startDateStr || !endDateStr) {
            alert("Harap isi Tanggal Mulai dan Tanggal Akhir.");
            return;
        }
        if (materialName === 'Loading...' || !materialName) {
            alert("Data material belum termuat. Silakan refresh.");
            return;
        }

        // Date Logic
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        const diffTime = end - start;
        const duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (duration < 0) return alert("Error: Tanggal Akhir harus setelah Tanggal Mulai.");

        // Get Material Data
        const targetMat = this.data.materials.find(m => m.name === materialName);
        if (!targetMat) return alert("Material tidak ditemukan.");

        let currentStockKg = 0;
        let totalCapacityKg = 0;

        if (warehouseIdx === 'all') {
            currentStockKg = targetMat.stocks.reduce((a, b) => a + b, 0);
            totalCapacityKg = this.data.capacities.reduce((a, b) => a + b, 0);
        } else {
            const idx = parseInt(warehouseIdx);
            currentStockKg = targetMat.stocks[idx] || 0;
            totalCapacityKg = this.data.capacities[idx] || 0;
        }

        // Convert to TON
        let currentStockTon = currentStockKg / 1000;
        const capacityTon = totalCapacityKg / 1000;

        // Generate Table Data
        const projection = [];
        let runningStock = currentStockTon;
        let currentDate = new Date(start);

        for (let i = 0; i <= duration; i++) {
            // Logic: Opening + In - Out = Closing
            // For first day, opening is current stock. For next days, it's prev closing.

            const incoming = defaultIn;
            const usage = defaultOut;
            const closing = runningStock + incoming - usage;

            projection.push({
                date: currentDate.toISOString().split('T')[0],
                dayLabel: currentDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
                opening: runningStock,
                incoming: incoming,
                usage: usage,
                closing: closing
            });

            runningStock = closing;
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // PUSH TO SESSION DIRECTLY
        this.sessionData.push({
            material: materialName,
            data: projection,
            color: this.getRandomColor(this.sessionData.length),
            capacity: capacityTon
        });

        // UPDATE UI
        document.getElementById('sim-results-area').style.display = 'block';
        this.renderQueue();

        // Fix: Force Render with small delay to ensure container is visible and layout is calculated
        setTimeout(() => {
            console.log("Auto-refreshing Master Table & Chart...");

            this.renderMasterTable();
            const tableContainer = document.getElementById('sim-master-table-wrapper');
            if (tableContainer) {
                tableContainer.scrollLeft = tableContainer.scrollWidth;
            }

            // Render Chart AFTER display block
            this.renderChartJS();

        }, 100); // Increased slightly to 100ms to be safe
    },

    // 3. EDIT LOGIC (Targeted DOM Update)
    updateSessionData: function (sessionIdx, dayIdx, field, newValue) {
        const session = this.sessionData[sessionIdx];
        if (!session) return;

        // Update the specific cell data
        session.data[dayIdx][field] = parseFloat(newValue) || 0;

        // Recalculate subsequent days for THIS session
        for (let i = dayIdx; i < session.data.length; i++) {
            const row = session.data[i];

            // If not start node, update opening from prev closing
            if (i > 0) {
                row.opening = session.data[i - 1].closing;
            }

            row.closing = row.opening + row.incoming - row.usage;

            // TARGETED DOM UPDATE (No Re-render)
            // We only need to update the STOCK LEVEL (Closing) for this session
            // and potentially the Total Summary if visible.

            const mode = document.getElementById('sim-view-mode').value;

            if (mode === 'detailed') {
                // Update Stock Cell
                const stockCell = document.getElementById(`cell-stock-${sessionIdx}-${i}`);
                if (stockCell) {
                    stockCell.innerText = row.closing.toFixed(2);

                    // Update Color
                    let color = '#0aff0a'; // SAFE
                    if (row.closing < 0) color = '#ff2a2a'; // DEFICIT
                    else if (session.capacity > 0 && row.closing > session.capacity) color = '#ff9e0b'; // OVERLOAD
                    stockCell.style.color = color;
                }
            }
        }

        // If Summary Mode, we basically need to recalc everything for the affected rows? 
        // Or just re-render table because summary doesn't have inputs that lose focus?
        // Wait, Summary mode DOES NOT have inputs. It's read-only totals. 
        // So if user is editing, they MUST be in Detailed mode.
        // But wait, the previous code didn't have inputs in Summary mode.
        // So we only really care about Detailed mode updates preserving focus.

        // However, if we are in Summary mode, we shouldn't be able to edit? 
        // Check renderMasterTable: inputs are only in 'detailed'. Correct.

        // Rerender Chart (Safe to do, doesn't steal focus from table)
        this.renderChartJS();
    },

    // 4. MASTER TABLE (EDITABLE)
    renderMasterTable: function () {
        const container = document.getElementById('sim-master-table-wrapper');
        const mode = document.getElementById('sim-view-mode').value;

        if (this.sessionData.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No items in simulation. Add a material above.</div>';
            return;
        }

        const baseData = this.sessionData[0].data; // Time reference
        const materials = this.sessionData.map(s => s.material);

        let html = `<table class="sim-table" style="font-size:0.85rem">`;

        if (mode === 'detailed') {
            // DETAILED VIEW 
            html += `
                <thead>
                    <tr>
                        <th rowspan="2" style="background:#222; position:sticky; left:0; z-index:2;">DATE</th>
                        <th colspan="${materials.length}" style="text-align:center; background:rgba(0,120,255,0.2)">STOCK LEVELS</th>
                        <th colspan="${materials.length}" style="text-align:center; background:rgba(0,255,0,0.1)">INCOMING (Edit)</th>
                        <th colspan="${materials.length}" style="text-align:center; background:rgba(255,100,0,0.1)">USAGE (Edit)</th>
                    </tr>
                    <tr>
            `;

            materials.forEach(m => html += `<th style="max-width:80px; overflow:hidden; text-overflow:ellipsis;">${m}</th>`);
            materials.forEach(m => html += `<th style="max-width:80px; overflow:hidden; text-overflow:ellipsis; color:#0aff0a;">${m}</th>`);
            materials.forEach(m => html += `<th style="max-width:80px; overflow:hidden; text-overflow:ellipsis; color:#ff9e0b;">${m}</th>`);

            html += `</tr></thead><tbody>`;

            baseData.forEach((dayRow, i) => {
                html += `<tr>`;
                html += `<td style="position:sticky; left:0; background:#1a1f2e; border-right:2px solid #555;">${dayRow.dayLabel}</td>`;

                // Stock Cols (Read Only, Dynamic ID)
                this.sessionData.forEach((session, sIdx) => {
                    const val = session.data[i] ? session.data[i].closing : 0;
                    // Determine status color
                    let color = '#0aff0a'; // SAFE
                    if (val < 0) color = '#ff2a2a'; // DEFICIT
                    else if (session.capacity > 0 && val > session.capacity) color = '#ff9e0b'; // OVERLOAD

                    // ID for targeted update
                    html += `<td id="cell-stock-${sIdx}-${i}" style="color:${color}">${val.toFixed(2)}</td>`;
                });

                // Incoming Cols (Editable)
                this.sessionData.forEach((session, sIdx) => {
                    const val = session.data[i] ? session.data[i].incoming : 0;
                    // Added onfocus="this.select()" for better UX
                    html += `<td><input type="number" class="compact-input" value="${val}" 
                        oninput="SimService.updateSessionData(${sIdx}, ${i}, 'incoming', this.value)"
                        onfocus="this.select()"></td>`;
                });

                // Usage Cols (Editable)
                this.sessionData.forEach((session, sIdx) => {
                    const val = session.data[i] ? session.data[i].usage : 0;
                    html += `<td><input type="number" class="compact-input" value="${val}" 
                        oninput="SimService.updateSessionData(${sIdx}, ${i}, 'usage', this.value)"
                        onfocus="this.select()"></td>`;
                });

                html += `</tr>`;
            });

        } else {
            // SUMMARY VIEW
            html += `
                 <thead>
                    <tr>
                        <th>DATE</th>
                        <th>TOTAL OPENING</th>
                        <th style="color:#0aff0a">TOTAL INCOMING</th>
                        <th style="color:#ff9e0b">TOTAL USAGE</th>
                        <th style="font-weight:bold; color:#fff">TOTAL CLOSING</th>
                    </tr>
                </thead>
                <tbody>
            `;

            baseData.forEach((dayRow, i) => {
                let totOpen = 0;
                let totIn = 0;
                let totOut = 0;
                let totClose = 0;

                this.sessionData.forEach(session => {
                    if (session.data[i]) {
                        totOpen += session.data[i].opening;
                        totIn += session.data[i].incoming;
                        totOut += session.data[i].usage;
                        totClose += session.data[i].closing;
                    }
                });

                html += `
                    <tr>
                        <td>${dayRow.dayLabel}</td>
                        <td>${totOpen.toFixed(2)}</td>
                        <td style="color:#0aff0a">${totIn.toFixed(2)}</td>
                        <td style="color:#ff9e0b">${totOut.toFixed(2)}</td>
                        <td style="font-weight:bold; color:#fff">${totClose.toFixed(2)}</td>
                    </tr>
                `;
            });
        }

        html += `</tbody></table>`;
        container.innerHTML = html;
    },

    // 5. QUEUE RENDERER (Missing Function Fixed)
    renderQueue: function () {
        const container = document.getElementById('sim-queue-list');
        const queueDisplay = document.getElementById('sim-queue-display');

        if (!container || !queueDisplay) return;

        if (this.sessionData.length === 0) {
            queueDisplay.style.display = 'none';
            return;
        }

        queueDisplay.style.display = 'block';
        container.innerHTML = '';

        this.sessionData.forEach((session, index) => {
            const chip = document.createElement('div');
            // Style matches the futuristic theme with the specific color of the session
            chip.style.cssText = `
                display: flex; 
                align-items: center; 
                background: rgba(255,255,255,0.05); 
                border: 1px solid ${session.color}; 
                padding: 5px 12px; 
                border-radius: 20px; 
                color: #fff; 
                font-family: 'Rajdhani'; 
                font-weight: bold;
                font-size: 0.9rem;
            `;

            chip.innerHTML = `
                <span style="display:inline-block; width:10px; height:10px; background:${session.color}; border-radius:50%; margin-right:8px;"></span>
                ${session.material}
                <span onclick="SimService.removeFromQueue(${index})" style="margin-left:10px; cursor:pointer; color:#ff4444; font-weight:bold;">&times;</span>
            `;

            container.appendChild(chip);
        });
    },

    removeFromQueue: function (index) {
        this.sessionData.splice(index, 1);
        this.renderQueue();
        this.renderMasterTable();
        this.renderChartJS();

        if (this.sessionData.length === 0) {
            document.getElementById('sim-results-area').style.display = 'none';
        }
    },

    // 6. RENDER CHART.JS
    renderChartJS: function () {
        // Guard Clause: No Data
        if (this.sessionData.length === 0) return;

        // Guard Clause: Chart Library Missing
        if (typeof Chart === 'undefined') {
            console.error("Chart.js library is not loaded. Please check internet connection or index.html script tags.");
            return;
        }

        const canvas = document.getElementById('simChart');
        if (!canvas) {
            console.error("Canvas element 'simChart' not found in DOM.");
            return;
        }

        try {
            const ctx = canvas.getContext('2d');
            console.log("Rendering Chart for", this.sessionData.length, "items.");

            // Use dates from first dataset for labels
            const labels = this.sessionData[0].data.map(d => d.dayLabel);

            const datasets = this.sessionData.map(session => ({
                label: session.material,
                data: session.data.map(d => d.closing),
                borderColor: session.color,
                backgroundColor: session.color + '20', // Hex + Alpha
                pointBackgroundColor: session.color,
                borderWidth: 2,
                tension: 0.3,
                fill: true // Changed to true for better visibility
            }));

            // Destroy previous instance
            if (this.chartInstance) {
                this.chartInstance.destroy();
            }

            // Create New Chart
            this.chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            labels: { color: '#ccc' }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    },
                    scales: {
                        y: {
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            ticks: { color: '#aaa' },
                            title: { display: true, text: 'Stock Level (Ton)', color: '#888' },
                            beginAtZero: true
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#aaa' }
                        }
                    }
                }
            });
            console.log("Chart rendered successfully.");

        } catch (err) {
            console.error("Error creating Chart:", err);
            alert("Gagal membuat grafik: " + err.message);
        }
    },

    getRandomColor: function (i) {
        const colors = ['#00f3ff', '#bc13fe', '#ff2a2a', '#ff9e0b', '#0aff0a', '#ffffff'];
        return colors[i % colors.length];
    }
};
