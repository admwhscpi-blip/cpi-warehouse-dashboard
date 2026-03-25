/**
 * RM TRACKING CONTAINER ENGINE
 * Visuals: Cyber Luxury / High-End Analytics
 * Description: Dedicated tracker for Container trucks (>= 19 Feb 2026)
 */

const TrackingApp = {
    allData: [],
    containerData: [],
    charts: {},
    currentYear: new Date().getFullYear(),
    activeDate: null,

    init: function () {
        console.log("Tracking Container Engine Starting...");
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Orbitron', sans-serif";
        Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';

        this.initYearSelect();
        this.fetchData();
    },

    initYearSelect: function () {
        const select = document.getElementById('year-filter');
        select.innerHTML = '';
        let current = new Date().getFullYear();
        // Since it starts from 2026-02-19, minimum is 2026
        for (let y = current + 1; y >= 2026; y--) {
            let opt = document.createElement('option');
            opt.value = y;
            opt.text = y;
            select.appendChild(opt);
        }
        this.currentYear = parseInt(select.value);
        document.getElementById('header-year-display').innerText = this.currentYear;
    },

    handleYearChange: function (year) {
        this.currentYear = parseInt(year);
        document.getElementById('header-year-display').innerText = this.currentYear;
        this.renderCalendars();
        this.activeDate = null;
        this.renderDailyPanel(null); // Clear panel
    },

    // === GOOGLE SHEETS CONFIG (for direct column access) ===
    SHEET_ID: '1m7q1IdtKyaNvjKP5QL85NPsk0FPEGUqV0scSB2CsXJ0',
    SHEET_NAME: 'DATA BONGKARAN',

    fetchData: function () {
        const statusPill = document.querySelector('.status-pill');
        if (statusPill) statusPill.innerHTML = '<div class="status-dot" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></div> <span id="system-status">SYNCING...</span>';

        // Use JSONP (script tag injection) to bypass CORS when page runs from file://
        // The gviz API supports a custom responseHandler via tqx parameter.
        const callbackName = '_gvizContainerCallback';
        const url = `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callbackName}&sheet=${encodeURIComponent(this.SHEET_NAME)}`;

        // Define global callback
        window[callbackName] = (gviz) => {
            try {
                if (!gviz || !gviz.table) throw new Error("Invalid Sheets data");

                this.allData = this.parseGvizTable(gviz.table);

                this.processContainerData();
                this.renderCalendars();
                this.initInapSlicers();
                this.renderInapAnalysis();

                if (statusPill) statusPill.innerHTML = '<div class="status-dot"></div> <span id="system-status">SYSTEM ONLINE</span>';
                console.log('Container data loaded:', this.containerData.length, 'containers from', this.allData.length, 'total rows');
            } catch (err) {
                console.error("PARSE ERROR:", err);
                if (statusPill) statusPill.innerHTML = '<div class="status-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></div> <span id="system-status">DATA ERROR</span>';
            }
            // Cleanup
            delete window[callbackName];
        };

        // Inject script tag
        const script = document.createElement('script');
        script.src = url;
        script.onerror = () => {
            console.error("FETCH ERROR: Script load failed");
            if (statusPill) statusPill.innerHTML = '<div class="status-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></div> <span id="system-status">CONNECTION ERROR</span>';
            delete window[callbackName];
        };
        document.head.appendChild(script);
    },

    /**
     * Parse a Google Visualization API table into an array of row-objects.
     * Header labels are normalized: spaces→underscores, UPPERCASE.
     * e.g. "Jenis Truck" => "JENIS_TRUCK", "Nopol" => "NOPOL"
     * The first date-type column with empty label is assigned "TANGGAL".
     * Aliases are created so existing field references still work.
     */
    parseGvizTable: function (table) {
        const cols = table.cols || [];
        const rows = table.rows || [];

        // Build normalized header list
        let foundTanggal = false;
        const headers = cols.map((c, idx) => {
            let label = String(c.label || '').trim().toUpperCase().replace(/[\s]+/g, '_');
            // The first column is the date column but may have blank label in gviz
            if (!label || label === '' || label === String(c.id || '').toUpperCase()) {
                if ((c.type === 'date' || c.type === 'datetime' || idx === 0) && !foundTanggal) {
                    label = 'TANGGAL';
                    foundTanggal = true;
                } else {
                    label = 'COL_' + idx;
                }
            }
            return label;
        });

        console.log('GVIZ headers:', headers.join(', '));

        const parsed = rows.map(row => {
            const obj = {};
            (row.c || []).forEach((cell, i) => {
                if (!headers[i]) return;
                let val = cell ? cell.v : null;
                if (val === null || val === undefined) { obj[headers[i]] = ''; return; }

                // Google encodes dates as "Date(y,m,d)" strings in JSON
                if (typeof val === 'string' && val.startsWith('Date(')) {
                    const m = val.match(/Date\((\d+),(\d+),(\d+)/);
                    if (m) val = `${m[1]}-${String(parseInt(m[2])+1).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
                }

                // Use formatted value (cell.f) if raw value is unhelpful
                let finalVal = (val !== null && val !== '') ? String(val) : '';
                if (finalVal === '' && cell && cell.f) finalVal = String(cell.f);

                obj[headers[i]] = finalVal;
            });

            // === ALIAS MAPPING ===
            // Map actual sheet column names to the field names used in the rest of this file.
            // This way we don't need to rewrite every function.
            // Sheet col "Finish"      -> code uses FINISH_BONGKAR or FINISH_TIME
            // Sheet col "Netto (Kg)"  -> code uses NETTO_KG
            // Sheet col "Start Bongkar" -> code uses START_BONGKAR (already matches)
            // Sheet col "Start Panggil" -> code uses PB_START or PANGGIL_BONGKAR
            if (obj['FINISH'] !== undefined && !obj['FINISH_BONGKAR']) obj['FINISH_BONGKAR'] = obj['FINISH'];
            if (obj['FINISH'] !== undefined && !obj['FINISH_TIME']) obj['FINISH_TIME'] = obj['FINISH'];
            if (obj['START_PANGGIL'] !== undefined && !obj['PB_START']) obj['PB_START'] = obj['START_PANGGIL'];
            if (obj['START_PANGGIL'] !== undefined && !obj['PANGGIL_BONGKAR']) obj['PANGGIL_BONGKAR'] = obj['START_PANGGIL'];
            if (obj['NETTO_(KG)'] !== undefined && !obj['NETTO_KG']) obj['NETTO_KG'] = obj['NETTO_(KG)'];
            if (obj['QC_SAMPLING_1_TIME'] !== undefined && !obj['QC_SAMPLING_1']) obj['QC_SAMPLING_1'] = obj['QC_SAMPLING_1_TIME'];
            if (obj['QC_SAMPLING_1_TIME'] !== undefined && !obj['TUNGGU_QC']) obj['TUNGGU_QC'] = obj['QC_SAMPLING_1_TIME'];
            if (obj['LOKASI_SIMPAN'] !== undefined && !obj['LOKASI']) obj['LOKASI'] = obj['LOKASI_SIMPAN'];
            if (obj['MATERIAL'] !== undefined && !obj['JENIS_RM']) obj['JENIS_RM'] = obj['MATERIAL'];
            if (obj['GUDANG/INTAKE'] !== undefined && !obj['GUDANG']) obj['GUDANG'] = obj['GUDANG/INTAKE'];
            if (obj['TIM_KERJA'] !== undefined && !obj['TIM']) obj['TIM'] = obj['TIM_KERJA'];
            if (obj['TRUCK_READY'] !== undefined && !obj['TIME_TIMBANG_MASUK']) obj['TIME_TIMBANG_MASUK'] = obj['TRUCK_READY'];

            // Calculate DURASI_BONGKAR (minutes) from START_BONGKAR and FINISH
            if (!obj['DURASI_BONGKAR'] || obj['DURASI_BONGKAR'] === '') {
                let tStart = this.parseTime(obj['START_BONGKAR']);
                let tFinish = this.parseTime(obj['FINISH'] || obj['FINISH_BONGKAR']);
                if (tStart !== null && tFinish !== null) {
                    let dur = tFinish - tStart;
                    if (dur < 0) dur += 1440;
                    obj['DURASI_BONGKAR'] = String(dur);
                }
            }

            return obj;
        }).filter(row => {
            // Skip empty rows and ensure TANGGAL exists
            return row['TANGGAL'] && row['TANGGAL'] !== '';
        });

        console.log('Parsed rows:', parsed.length, 'Sample:', parsed[0]);
        return parsed;
    },

    normalizeDate: function (dateStr) {
        if (!dateStr) return null;
        try {
            let ds = String(dateStr).trim();

            // Handle dd-MMM-yyyy (e.g. "19-Feb-2026")
            const monthMap = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
            let m = ds.match(/^(\d{1,2})[\-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\-\s](\d{4})$/i);
            if (m) {
                let day = parseInt(m[1]);
                let mon = monthMap[m[2].toLowerCase().substring(0,3)];
                let year = parseInt(m[3]);
                return `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            }

            // Handle dd/MM/yyyy or dd.MM.yyyy
            m = ds.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
            if (m) {
                return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
            }

            // Handle yyyy-MM-dd (ISO format)
            m = ds.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (m) {
                return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
            }

            // Fallback to Date parsing
            let d = new Date(ds);
            if (isNaN(d.getTime())) return null;
            return d.toISOString().split('T')[0];
        } catch (e) { return null; }
    },

    processContainerData: function () {
        // Filter: >= 19 Feb 2026 AND JENIS_TRUCK contains "CONTAINER" (20ft or 40ft)
        this.containerData = this.allData.filter(row => {
            let tglStr = this.normalizeDate(row['TANGGAL']);
            if (!tglStr || tglStr < '2026-02-19') return false;

            // JENIS_TRUCK is now available via direct gviz fetch (Col H)
            let truckType = String(row['JENIS_TRUCK'] || '').toUpperCase();
            if (truckType.includes('CONTAINER')) {
                return true;
            }
            return false;
        });

        // Group by Date for fast lookup
        this.dataByDate = {};
        this.containerData.forEach(row => {
            let d = this.normalizeDate(row['TANGGAL']);
            if (!this.dataByDate[d]) this.dataByDate[d] = [];
            this.dataByDate[d].push(row);
        });
    },

    // ==========================================
    // CALENDAR 1 YEAR GENERATION
    // ==========================================
    renderCalendars: function () {
        const container = document.getElementById('year-calendar-container');
        container.innerHTML = '';

        const year = this.currentYear;
        const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

        for (let m = 0; m < 12; m++) {
            let monthBlock = document.createElement('div');
            monthBlock.className = 'month-block';

            let monthName = document.createElement('div');
            monthName.className = 'month-name';
            monthName.innerText = monthNames[m];
            monthBlock.appendChild(monthName);

            let grid = document.createElement('div');
            grid.className = 'days-grid';

            // Headers
            ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(day => {
                let dHeader = document.createElement('div');
                dHeader.className = 'day-header';
                dHeader.innerText = day;
                grid.appendChild(dHeader);
            });

            // Days padding
            let firstDay = new Date(year, m, 1).getDay();
            let daysInMonth = new Date(year, m + 1, 0).getDate();

            for (let i = 0; i < firstDay; i++) {
                let empty = document.createElement('div');
                empty.className = 'day-cell empty';
                grid.appendChild(empty);
            }

            for (let d = 1; d <= daysInMonth; d++) {
                let cell = document.createElement('div');
                cell.className = 'day-cell';
                let isoDate = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                cell.innerText = d;
                cell.dataset.date = isoDate;

                // Highlight if data exists
                if (this.dataByDate && this.dataByDate[isoDate] && this.dataByDate[isoDate].length > 0) {
                    cell.classList.add('has-data');
                    let dot = document.createElement('div');
                    dot.className = 'day-dot';
                    cell.appendChild(dot);
                }

                // Skip disabled dates before 19 Feb 2026
                if (isoDate < '2026-02-19') {
                    cell.style.opacity = '0.2';
                    cell.style.cursor = 'not-allowed';
                } else {
                    cell.onclick = (e) => this.selectDate(isoDate, e.currentTarget);
                }

                grid.appendChild(cell);
            }

            monthBlock.appendChild(grid);
            container.appendChild(monthBlock);
        }

        // ===================================
        // ADDITION: RENDER YEARLY CHARTS
        // ===================================
        document.getElementById('chart-grid').style.display = 'grid'; // Ensure it's visible
        let yearData = this.containerData.filter(row => {
            let t = this.normalizeDate(row['TANGGAL']);
            return t && t.startsWith(this.currentYear.toString());
        });
        this.renderTimeComparisonChart(yearData);

    },

    selectDate: function (isoDate, cellElement) {
        // Remove active class from all
        document.querySelectorAll('.day-cell.active').forEach(el => el.classList.remove('active'));
        // Add to selected
        if (cellElement) cellElement.classList.add('active');

        this.activeDate = isoDate;
        this.renderDailyPanel(isoDate);
    },

    // ==========================================
    // DAILY ANALYTICS PANEL
    // ==========================================
    renderDailyPanel: function (isoDate) {
        const metricsContainer = document.getElementById('daily-metrics-container');
        const dataView = document.getElementById('daily-data-view');
        const dateLabel = document.getElementById('selected-date-label');
        const chartGrid = document.getElementById('chart-grid'); // Keep this to hide it

        if (!isoDate) {
            metricsContainer.style.display = 'flex';
            dataView.style.display = 'none';
            chartGrid.style.display = 'none'; // Hide charts when no date is selected
            dateLabel.innerText = 'SELECT A DATE ON THE LEFT';
            return;
        }

        // Format label
        let dObj = new Date(isoDate);
        dateLabel.innerText = dObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();

        const todayData = (this.dataByDate && this.dataByDate[isoDate]) ? this.dataByDate[isoDate] : [];

        if (todayData.length === 0) {
            metricsContainer.style.display = 'flex';
            dataView.style.display = 'none';
            chartGrid.style.display = 'none'; // Hide charts when no data for the day
            metricsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i><br>
                    <span style="font-size:0.8rem; letter-spacing:2px; display:block; margin-bottom:5px;">NO CONTAINER ACTIVITY</span>
                    <span style="font-size:0.65rem;">Tidak ada data bongkar kontainer terekam pada tanggal ini.</span>
                </div>
            `;
            return;
        }

        // We have data! Switch views.
        metricsContainer.style.display = 'none';
        dataView.style.display = 'flex';
        chartGrid.style.display = 'none'; // Hide charts for daily panel

        document.getElementById('log-count').innerText = `${todayData.length} RECORDS`;

        this.calculateMetrics(todayData);
        this.renderTrackingLogs(todayData);
    },

    parseTime: function (timeStr) {
        if (!timeStr || timeStr === '') return null;
        let parts = timeStr.toString().split(':');
        if (parts.length < 2) return null;
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return null;
        return (h * 60) + m; // Total minutes from midnight
    },

    /**
     * Robust date+time parser — same logic as outstanding-rm.
     * Supports: dd.MM.yyyy, dd/MM/yyyy, yyyy-MM-dd, ISO for dates
     *           HH:mm, HH:mm:ss, H:mm, HH.mm for times
     * Returns a Date object in local timezone, or null if parsing fails.
     */
    parseDateTimeStr: function (dateStr, timeStr) {
        if (!dateStr || String(dateStr).trim() === '') return null;
        let day, month, year;
        const ds = String(dateStr).trim();

        // Try dd.MM.yyyy or dd/MM/yyyy
        let dm = ds.match(/^(\d{1,2})[\./](\d{1,2})[\./](\d{4})$/);
        if (dm) {
            day = parseInt(dm[1]); month = parseInt(dm[2]) - 1; year = parseInt(dm[3]);
        } else {
            // Try yyyy-MM-dd or ISO
            dm = ds.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (dm) {
                year = parseInt(dm[1]); month = parseInt(dm[2]) - 1; day = parseInt(dm[3]);
            } else {
                // Last resort: native Date parse (but force local timezone)
                const fb = new Date(ds + 'T00:00:00');
                if (!isNaN(fb.getTime())) {
                    day = fb.getDate(); month = fb.getMonth(); year = fb.getFullYear();
                } else { return null; }
            }
        }

        // Parse time
        let hh = 0, mm = 0;
        const ts = String(timeStr || '').trim();
        if (ts) {
            const tm = ts.match(/^(\d{1,2}):(\d{2})/);
            if (tm) { hh = parseInt(tm[1]); mm = parseInt(tm[2]); }
            else {
                const tmDot = ts.match(/^(\d{1,2})\.(\d{2})$/);
                if (tmDot) { hh = parseInt(tmDot[1]); mm = parseInt(tmDot[2]); }
            }
        }

        const result = new Date(year, month, day, hh, mm);
        if (isNaN(result.getTime())) return null;
        return result;
    },

    calculateMetrics: function (data) {
        let total = data.length;
        let sumBongkar = 0; let countBongkar = 0;
        let countInap = 0; let countTidakInap = 0; let countNoData = 0;

        data.forEach(row => {
            // Durasi Bongkar
            let dur = Number(row['DURASI_BONGKAR']);
            if (!isNaN(dur) && dur > 0) { sumBongkar += dur; countBongkar++; }

            // Hitungan Inap — robust parsing
            // Arrival IN: Col X (date) & Col Y (time) — text from SAP
            let arrDateStr = String(row['ARRIVAL_DATE'] || '').trim();
            let arrTimeStr = String(row['ARRIVAL_TIME'] || '').trim();
            // Bongkar OUT: Col A (tanggal) & Col U (finish)
            let finDateStr = String(row['TANGGAL'] || '').trim();
            let finTimeStr = String(row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '').trim();

            // Check if arrival data exists (must have both date AND time)
            let hasArrival = arrDateStr && arrDateStr !== '-' && arrTimeStr && arrTimeStr !== '-';
            let hasFinish = finDateStr && finDateStr !== '-' && finTimeStr && finTimeStr !== '-';

            if (!hasArrival || !hasFinish) {
                countNoData++;
                return;
            }

            let dArr = this.parseDateTimeStr(arrDateStr, arrTimeStr);
            let dFin = this.parseDateTimeStr(finDateStr, finTimeStr);

            if (dArr && dFin) {
                if (dFin < dArr) dFin.setDate(dFin.getDate() + 1);
                let diffMs = dFin.getTime() - dArr.getTime();
                let durH = diffMs / (1000 * 60 * 60);

                if (durH >= 24) countInap++;
                else if (durH >= 0) countTidakInap++;
            } else {
                countNoData++;
            }
        });

        const avgBongkar = countBongkar > 0 ? Math.round(sumBongkar / countBongkar) : 0;
        let avgH = Math.floor(avgBongkar / 60);
        let avgM = Math.floor(avgBongkar % 60);
        let avgDurHtml = `${avgH}<span style="font-size:0.5em; color:var(--text-muted); margin:0 2px;">h</span>${avgM}<span style="font-size:0.5em; color:var(--text-muted); margin-left:2px;">m</span>`;

        // Update DOM — total = inap + tidak inap + no data
        this.animateValue('kpi-total-cont', 0, total, 1000, '');
        const domAvgDur = document.getElementById('kpi-avg-dur');
        if (domAvgDur) domAvgDur.innerHTML = avgDurHtml;
        this.animateValue('kpi-inap', 0, countInap, 1000, '');
        this.animateValue('kpi-tidak-inap', 0, countTidakInap, 1000, '');
        this.animateValue('kpi-no-data', 0, countNoData, 1000, '');
    },

    animateValue: function (id, start, end, duration, suffix = "") {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            let val = Math.floor(progress * (end - start) + start);
            obj.innerHTML = val.toLocaleString() + suffix;
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    },

    renderTimeComparisonChart: function (data) {
        const ctx = document.getElementById('timeComparisonChart').getContext('2d');
        if (this.charts['timeComp']) this.charts['timeComp'].destroy();

        // Custom plugin for Chart Glow effect
        const glowPlugin = {
            id: 'glow',
            beforeDraw: chart => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = 'rgba(6, 182, 212, 0.5)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            },
            afterDraw: chart => {
                chart.ctx.restore();
            }
        };

        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        let monthlyScalling = Array(12).fill(0);
        let monthlyTimStart = Array(12).fill(0);
        let monthlyBongkar = Array(12).fill(0);
        let monthlyCounts = Array(12).fill(0);

        data.forEach(row => {
            let tglRaw = row['TANGGAL'] || '';
            if (!tglRaw || tglRaw === '') return;
            let d = new Date(tglRaw);
            if (isNaN(d.getTime())) return;
            let m = d.getMonth();

            let durBongkar = Number(row['DURASI_BONGKAR']) || 0;
            let tArr = this.parseTime(row['ARRIVAL_TIME'] || row['PB_START']);
            let tQc = this.parseTime(row['QC_SAMPLING_1'] || row['TUNGGU_QC']); // Durasi Scalling 1
            let tTim = this.parseTime(row['TIME_TIMBANG_MASUK']);
            let tStart = this.parseTime(row['START_BONGKAR'] || row['PANGGIL_BONGKAR']);

            let durScalling = (tArr !== null && tQc !== null) ? (tQc - tArr < 0 ? tQc - tArr + 1440 : tQc - tArr) : 0;
            let durTimStart = (tTim !== null && tStart !== null) ? (tStart - tTim < 0 ? tStart - tTim + 1440 : tStart - tTim) : 0;

            monthlyScalling[m] += durScalling;
            monthlyTimStart[m] += durTimStart;
            monthlyBongkar[m] += durBongkar;
            monthlyCounts[m]++;
        });

        let dScallingAvg = [];
        let dTimStartAvg = [];
        let dBongkarAvg = [];

        for (let i = 0; i < 12; i++) {
            if (monthlyCounts[i] > 0) {
                dScallingAvg.push(Math.round(monthlyScalling[i] / monthlyCounts[i]));
                dTimStartAvg.push(Math.round(monthlyTimStart[i] / monthlyCounts[i]));
                dBongkarAvg.push(Math.round(monthlyBongkar[i] / monthlyCounts[i]));
            } else {
                dScallingAvg.push(0);
                dTimStartAvg.push(0);
                dBongkarAvg.push(0);
            }
        }

        // Gradients for Time Comparison Chart
        let gradQC = ctx.createLinearGradient(0, 0, 0, 400);
        gradQC.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
        gradQC.addColorStop(1, 'rgba(139, 92, 246, 0.2)');

        let gradTim = ctx.createLinearGradient(0, 0, 0, 400);
        gradTim.addColorStop(0, 'rgba(249, 115, 22, 0.8)');
        gradTim.addColorStop(1, 'rgba(249, 115, 22, 0.2)');

        let gradBon = ctx.createLinearGradient(0, 0, 0, 400);
        gradBon.addColorStop(0, 'rgba(6, 182, 212, 0.8)');
        gradBon.addColorStop(1, 'rgba(6, 182, 212, 0.2)');

        this.charts['timeComp'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthNames,
                datasets: [
                    { label: 'Scalling 1', data: dScallingAvg, backgroundColor: gradQC, borderColor: '#8b5cf6', borderWidth: 1, borderRadius: 6 },
                    { label: 'Timbang - Panggil', data: dTimStartAvg, backgroundColor: gradTim, borderColor: '#f97316', borderWidth: 1, borderRadius: 6 },
                    { label: 'Proses Bongkar', data: dBongkarAvg, backgroundColor: gradBon, borderColor: '#06b6d4', borderWidth: 1, borderRadius: 6 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false } }
                },
                plugins: {
                    legend: { labels: { color: '#fff', font: { family: "'Orbitron', sans-serif" } } },
                    tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', titleColor: '#06b6d4', bodyColor: '#cbd5e1', borderColor: 'rgba(6,182,212,0.5)', borderWidth: 1 }
                }
            },
            plugins: [glowPlugin]
        });

        // -- ADD DONUT CHART FOR INAP VS TIDAK INAP --
        const ctxType = document.getElementById('typeChart');
        if (ctxType) {
            if (this.charts['typeComp']) this.charts['typeComp'].destroy();

            let inapCount = 0;
            let tdkInapCount = 0;
            let noDataCount = 0;

            data.forEach(row => {
                let arrDateStr = String(row['ARRIVAL_DATE'] || '').trim();
                let arrTimeStr = String(row['ARRIVAL_TIME'] || '').trim();
                let finDateStr = String(row['TANGGAL'] || '').trim();
                let finTimeStr = String(row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '').trim();

                let hasArrival = arrDateStr && arrDateStr !== '-' && arrTimeStr && arrTimeStr !== '-';
                let hasFinish = finDateStr && finDateStr !== '-' && finTimeStr && finTimeStr !== '-';

                if (!hasArrival || !hasFinish) {
                    noDataCount++;
                    return;
                }

                let dArr = this.parseDateTimeStr(arrDateStr, arrTimeStr);
                let dFin = this.parseDateTimeStr(finDateStr, finTimeStr);

                if (dArr && dFin) {
                    if (dFin < dArr) dFin.setDate(dFin.getDate() + 1);
                    let diffMs = dFin.getTime() - dArr.getTime();
                    let durH = diffMs / (1000 * 60 * 60);

                    if (durH >= 24) inapCount++;
                    else if (durH >= 0) tdkInapCount++;
                } else {
                    noDataCount++;
                }
            });

            this.charts['typeComp'] = new Chart(ctxType.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['TIDAK INAP (<24H)', 'INAP (>=24H)', 'DATA TIDAK LENGKAP'],
                    datasets: [{
                        data: [tdkInapCount, inapCount, noDataCount],
                        backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                        borderColor: ['#34d399', '#f87171', '#fbbf24'],
                        borderWidth: 2,
                        hoverOffset: 15,
                        hoverBorderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '75%',
                    layout: { padding: 20 },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#e2e8f0', font: { family: "'Orbitron', sans-serif", size: 11, weight: 'bold' } } },
                        tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1 }
                    }
                },
                plugins: [{
                    id: 'glowDonut',
                    beforeDraw: chart => {
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
                        ctx.shadowBlur = 20;
                    },
                    afterDraw: chart => { chart.ctx.restore(); }
                }]
            });
        }
    },

    renderTrackingLogs: function (data) {
        const container = document.getElementById('tracking-logs');

        // Buat mini table html
        let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.65rem;">
            <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-muted);">
                    <th style="padding: 8px 4px; text-align: left;">ID / NOPOL</th>
                    <th style="padding: 8px 4px; text-align: left;">ARRIVAL (IN)</th>
                    <th style="padding: 8px 4px; text-align: left;">BONGKAR (OUT)</th>
                    <th style="padding: 8px 4px; text-align: right;">DURASI</th>
                    <th style="padding: 8px 4px; text-align: right;">STATUS</th>
                </tr>
            </thead>
            <tbody>
        `;

        data.forEach((row, i) => {
            let truckLine = row['JENIS_TRUCK'] || row['JENIS_RM'] || 'CONTAINER';
            let nopol = row['NOPOL'] || 'N/A';

            // Arrival IN: strictly Col X (ARRIVAL_DATE) & Col Y (ARRIVAL_TIME) only
            // These are SAP data — NO fallbacks to TANGGAL or PB_START
            let arrDateStr = row['ARRIVAL_DATE'] || '';
            let arrTimeStr = row['ARRIVAL_TIME'] || '';
            // Bongkar OUT: Col A (TANGGAL) & Col U (FINISH_TIME)
            let finDateStr = row['TANGGAL'] || '';
            let finTimeStr = row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '';

            // Display labels
            let arrDateDisplay = String(arrDateStr).trim() || '-';
            let arrTimeDisplay = String(arrTimeStr).trim() || 'No Data';
            let finDateDisplay = String(finDateStr).trim() || '-';
            let finTimeDisplay = String(finTimeStr).trim() || 'No Data';

            let statusInap = 'OK';
            let colorInap = 'var(--success)';
            let durasiHtml = '';

            // Check data completeness FIRST
            let hasArrival = arrTimeDisplay !== 'No Data' && arrDateDisplay !== '-';
            let hasFinish = finTimeDisplay !== 'No Data' && finDateDisplay !== '-';

            if (!hasArrival || !hasFinish) {
                // Missing data — no fake values
                durasiHtml = `<span style="color:#f59e0b;">-</span>`;
                statusInap = 'DATA TIDAK LENGKAP';
                colorInap = '#f59e0b';
            } else {
                // Parse using robust helper
                let dArr = this.parseDateTimeStr(arrDateStr, arrTimeStr);
                let dFin = this.parseDateTimeStr(finDateStr, finTimeStr);

                if (dArr && dFin) {
                    // If finish < arrival, must have crossed midnight
                    if (dFin < dArr) dFin.setDate(dFin.getDate() + 1);

                    let diffMs = dFin.getTime() - dArr.getTime();
                    let diffMins = Math.floor(diffMs / (1000 * 60));
                    let h = Math.floor(diffMins / 60);
                    let m = diffMins % 60;

                    if (diffMs < 0) {
                        durasiHtml = `<span style="color:#f59e0b;">-</span>`;
                        statusInap = 'DATA TIDAK LENGKAP';
                        colorInap = '#f59e0b';
                    } else {
                        if (h >= 24) {
                            statusInap = 'INAP';
                            colorInap = 'var(--danger)';
                        }
                        durasiHtml = `<span style="font-size:0.85rem; color:#fff;">${h}</span><span style="font-size:0.55rem; color:#64748b; margin:0 3px;">h</span><span style="font-size:0.85rem; color:#fff;">${m}</span><span style="font-size:0.55rem; color:#64748b;">m</span>`;
                    }
                } else {
                    durasiHtml = `<span style="color:#f59e0b;">-</span>`;
                    statusInap = 'DATA TIDAK LENGKAP';
                    colorInap = '#f59e0b';
                }
            }

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                    <td style="padding: 8px 4px;">
                        <span style="color: #fff; font-family: 'Orbitron'; font-weight: 700;">${nopol}</span><br>
                        <span style="font-size:0.6rem; color:#64748b;">${truckLine.substring(0, 15)}</span>
                    </td>
                    <td style="padding: 8px 4px; color: #94a3b8;">
                        <span style="color:#0ea5e9;">${arrDateDisplay}</span><br>
                        <span style="font-family:'Orbitron'; font-size:0.6rem; color:${arrTimeDisplay === 'No Data' ? '#ef4444' : '#fff'};">${arrTimeDisplay}</span>
                    </td>
                    <td style="padding: 8px 4px; color: #94a3b8;">
                        <span style="color:#10b981;">${finDateDisplay}</span><br>
                        <span style="font-family:'Orbitron'; font-size:0.6rem; color:${finTimeDisplay === 'No Data' ? '#ef4444' : 'var(--accent)'};">OUT: ${finTimeDisplay}</span>
                    </td>
                    <td style="padding: 8px 4px; text-align: right; color: #fff; font-family: 'Orbitron'; font-weight: 900;">
                        ${durasiHtml}
                    </td>
                    <td style="padding: 8px 4px; text-align: right;">
                        <span style="background: ${colorInap}20; color: ${colorInap}; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.6rem; border: 1px solid ${colorInap}50; letter-spacing: 1px;">
                            ${statusInap}
                        </span>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    },

    // ====================================================================
    // SECTION 3 & 4: INAP CORRELATION ANALYSIS + DETAIL
    // ====================================================================

    initInapSlicers: function () {
        const monthSel = document.getElementById('inap-month-filter');
        const yearSel = document.getElementById('inap-year-filter');
        if (!monthSel || !yearSel) return;

        const months = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
        const now = new Date();

        // Month
        monthSel.innerHTML = '<option value="ALL">SEMUA BULAN</option>';
        months.forEach((m, i) => {
            let opt = document.createElement('option');
            opt.value = i;
            opt.text = m;
            if (i === now.getMonth()) opt.selected = true;
            monthSel.appendChild(opt);
        });

        // Year
        yearSel.innerHTML = '';
        let currY = now.getFullYear();
        for (let y = currY + 1; y >= 2026; y--) {
            let opt = document.createElement('option');
            opt.value = y;
            opt.text = y;
            if (y === currY) opt.selected = true;
            yearSel.appendChild(opt);
        }
    },

    renderInapAnalysis: function () {
        const monthSel = document.getElementById('inap-month-filter');
        const yearSel = document.getElementById('inap-year-filter');
        if (!monthSel || !yearSel) return;

        const selMonth = monthSel.value; // 'ALL' or 0-11
        const selYear = parseInt(yearSel.value);
        const isAllMonths = selMonth === 'ALL';
        const selMonthInt = isAllMonths ? -1 : parseInt(selMonth);

        // Filter container data for selected year (and optionally month)
        const filtered = this.containerData.filter(row => {
            let tgl = this.normalizeDate(row['TANGGAL']);
            if (!tgl) return false;
            let d = new Date(tgl + 'T00:00:00');
            if (d.getFullYear() !== selYear) return false;
            if (!isAllMonths && d.getMonth() !== selMonthInt) return false;
            return true;
        });

        // Group by day (or month if ALL)
        let labels = [];
        let dailyMap = {};

        if (isAllMonths) {
            // Group by month
            const mNames = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGT', 'SEP', 'OKT', 'NOV', 'DES'];
            for (let m = 0; m < 12; m++) {
                let key = mNames[m];
                labels.push(key);
                dailyMap[key] = { inap: 0, tidakInap: 0, total: 0, ft20: 0, ft40: 0 };
            }
            filtered.forEach(row => {
                let tgl = this.normalizeDate(row['TANGGAL']);
                let d = new Date(tgl + 'T00:00:00');
                let key = mNames[d.getMonth()];
                let status = this._getInapStatus(row);
                dailyMap[key].total++;
                if (status === 'INAP') dailyMap[key].inap++;
                else dailyMap[key].tidakInap++;
                let truck = String(row['JENIS_TRUCK'] || '').toUpperCase();
                if (truck.includes('20')) dailyMap[key].ft20++;
                else dailyMap[key].ft40++;
            });
        } else {
            // Group by day of month
            let daysInMonth = new Date(selYear, selMonthInt + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                let key = String(day);
                labels.push(key);
                dailyMap[key] = { inap: 0, tidakInap: 0, total: 0, ft20: 0, ft40: 0 };
            }
            filtered.forEach(row => {
                let tgl = this.normalizeDate(row['TANGGAL']);
                let d = new Date(tgl + 'T00:00:00');
                let key = String(d.getDate());
                if (!dailyMap[key]) return;
                let status = this._getInapStatus(row);
                dailyMap[key].total++;
                if (status === 'INAP') dailyMap[key].inap++;
                else dailyMap[key].tidakInap++;
                let truck = String(row['JENIS_TRUCK'] || '').toUpperCase();
                if (truck.includes('20')) dailyMap[key].ft20++;
                else dailyMap[key].ft40++;
            });
        }

        // Build chart data arrays
        let dInap = labels.map(k => dailyMap[k].inap);
        let dTidakInap = labels.map(k => dailyMap[k].tidakInap);
        let dTotal = labels.map(k => dailyMap[k].total);
        let d20ft = labels.map(k => dailyMap[k].ft20);
        let d40ft = labels.map(k => dailyMap[k].ft40);

        // Render chart
        const ctx = document.getElementById('inapCorrelationChart');
        if (!ctx) return;
        if (this.charts['inapCorr']) this.charts['inapCorr'].destroy();

        const ctxC = ctx.getContext('2d');
        // Gradient for Inap bars
        let gradInap = ctxC.createLinearGradient(0, 0, 0, 380);
        gradInap.addColorStop(0, 'rgba(239, 68, 68, 0.9)');
        gradInap.addColorStop(1, 'rgba(239, 68, 68, 0.15)');
        // Gradient for Tidak Inap bars
        let gradOk = ctxC.createLinearGradient(0, 0, 0, 380);
        gradOk.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
        gradOk.addColorStop(1, 'rgba(16, 185, 129, 0.15)');

        this.charts['inapCorr'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'INAP (≥24H)',
                        data: dInap,
                        backgroundColor: gradInap,
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        label: 'TIDAK INAP (<24H)',
                        data: dTidakInap,
                        backgroundColor: gradOk,
                        borderColor: '#10b981',
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 3
                    },
                    {
                        label: 'TOTAL CONTAINER',
                        data: dTotal,
                        type: 'line',
                        borderColor: '#06b6d4',
                        backgroundColor: 'rgba(6, 182, 212, 0.08)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#06b6d4',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1.5,
                        pointHoverRadius: 7,
                        order: 1
                    },
                    {
                        label: '40FT',
                        data: d40ft,
                        type: 'line',
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [5, 4],
                        tension: 0.3,
                        pointRadius: 2,
                        pointBackgroundColor: '#f59e0b',
                        order: 0
                    },
                    {
                        label: '20FT',
                        data: d20ft,
                        type: 'line',
                        borderColor: '#8b5cf6',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [3, 3],
                        tension: 0.3,
                        pointRadius: 2,
                        pointBackgroundColor: '#8b5cf6',
                        order: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1200,
                    easing: 'easeInOutQuart'
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: {
                            color: '#64748b',
                            font: { size: 9, family: "'Outfit', sans-serif" }
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                        ticks: {
                            color: '#64748b',
                            font: { size: 9, family: "'Outfit', sans-serif" },
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { size: 10, family: "'Outfit', sans-serif", weight: 600 },
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(2,6,23,0.95)',
                        titleColor: '#06b6d4',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(6,182,212,0.4)',
                        borderWidth: 1,
                        padding: 12,
                        titleFont: { family: "'Orbitron', sans-serif", size: 11 },
                        bodyFont: { family: "'Outfit', sans-serif", size: 11 },
                        callbacks: {
                            afterBody: function (ctx) {
                                let idx = ctx[0].dataIndex;
                                let total = dTotal[idx];
                                let inap = dInap[idx];
                                if (total === 0) return '';
                                let pct = Math.round((inap / total) * 100);
                                return `\nRasio Inap: ${pct}%  |  40ft: ${d40ft[idx]}  20ft: ${d20ft[idx]}`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'glowLines',
                beforeDraw: chart => {
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.shadowColor = 'rgba(6, 182, 212, 0.3)';
                    ctx.shadowBlur = 12;
                },
                afterDraw: chart => { chart.ctx.restore(); }
            }]
        });

        // Insight strip
        let totalAll = filtered.length;
        let totalInap = filtered.filter(r => this._getInapStatus(r) === 'INAP').length;
        let total40 = filtered.filter(r => String(r['JENIS_TRUCK'] || '').toUpperCase().includes('40')).length;
        let total20 = totalAll - total40;
        let pctInap = totalAll > 0 ? Math.round((totalInap / totalAll) * 100) : 0;

        // Find peak day
        let peakKey = labels[0] || '-';
        let peakVal = 0;
        labels.forEach(k => { if (dailyMap[k].total > peakVal) { peakVal = dailyMap[k].total; peakKey = k; } });

        let peakInapKey = labels[0] || '-';
        let peakInapVal = 0;
        labels.forEach(k => { if (dailyMap[k].inap > peakInapVal) { peakInapVal = dailyMap[k].inap; peakInapKey = k; } });

        const strip = document.getElementById('inap-insight-strip');
        if (strip) {
            strip.innerHTML = [
                { label: 'TOTAL', val: totalAll, color: '#06b6d4' },
                { label: 'INAP', val: totalInap, color: '#ef4444' },
                { label: 'RASIO INAP', val: pctInap + '%', color: pctInap > 20 ? '#ef4444' : '#10b981' },
                { label: '40FT', val: total40, color: '#f59e0b' },
                { label: '20FT', val: total20, color: '#8b5cf6' },
                { label: 'PEAK VOLUME', val: peakKey + ' (' + peakVal + ')', color: '#06b6d4' },
                { label: 'PEAK INAP', val: peakInapKey + ' (' + peakInapVal + ')', color: '#ef4444' }
            ].map(i => `<div style="background:rgba(0,0,0,0.3); border:1px solid ${i.color}30; border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; align-items:center; min-width:90px;">
                <span style="font-size:0.55rem; color:#64748b; letter-spacing:1px; text-transform:uppercase;">${i.label}</span>
                <span style="font-family:'Orbitron'; font-size:0.85rem; font-weight:700; color:${i.color};">${i.val}</span>
            </div>`).join('');
        }

        // Also render the detail section
        this.renderInapDetail(filtered);
    },

    /**
     * Helper: determine INAP status for a single row.
     * DATA TIDAK LENGKAP treated as TIDAK INAP (temporary)
     */
    _getInapStatus: function (row) {
        let arrDateStr = String(row['ARRIVAL_DATE'] || '').trim();
        let arrTimeStr = String(row['ARRIVAL_TIME'] || '').trim();
        let finDateStr = String(row['TANGGAL'] || '').trim();
        let finTimeStr = String(row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '').trim();

        let hasArrival = arrDateStr && arrDateStr !== '-' && arrTimeStr && arrTimeStr !== '-';
        let hasFinish = finDateStr && finDateStr !== '-' && finTimeStr && finTimeStr !== '-';

        if (!hasArrival || !hasFinish) return 'TIDAK INAP'; // temporary: incomplete = tidak inap

        let dArr = this.parseDateTimeStr(arrDateStr, arrTimeStr);
        let dFin = this.parseDateTimeStr(finDateStr, finTimeStr);

        if (dArr && dFin) {
            if (dFin < dArr) dFin.setDate(dFin.getDate() + 1);
            let diffMs = dFin.getTime() - dArr.getTime();
            let durH = diffMs / (1000 * 60 * 60);
            return durH >= 24 ? 'INAP' : 'TIDAK INAP';
        }
        return 'TIDAK INAP';
    },

    /**
     * Get duration in hours for a single row (for detail table)
     */
    _getDurationHours: function (row) {
        let arrDateStr = String(row['ARRIVAL_DATE'] || '').trim();
        let arrTimeStr = String(row['ARRIVAL_TIME'] || '').trim();
        let finDateStr = String(row['TANGGAL'] || '').trim();
        let finTimeStr = String(row['FINISH_BONGKAR'] || row['FINISH_TIME'] || '').trim();

        let hasArrival = arrDateStr && arrDateStr !== '-' && arrTimeStr && arrTimeStr !== '-';
        let hasFinish = finDateStr && finDateStr !== '-' && finTimeStr && finTimeStr !== '-';
        if (!hasArrival || !hasFinish) return null;

        let dArr = this.parseDateTimeStr(arrDateStr, arrTimeStr);
        let dFin = this.parseDateTimeStr(finDateStr, finTimeStr);
        if (dArr && dFin) {
            if (dFin < dArr) dFin.setDate(dFin.getDate() + 1);
            return (dFin.getTime() - dArr.getTime()) / (1000 * 60 * 60);
        }
        return null;
    },

    renderInapDetail: function (filtered) {
        // --- MINI DONUT ---
        let totalInap = 0;
        let totalTidakInap = 0;
        let inapRows = [];

        filtered.forEach(row => {
            let status = this._getInapStatus(row);
            if (status === 'INAP') { totalInap++; inapRows.push(row); }
            else totalTidakInap++;
        });

        // Render donut
        const donutCtx = document.getElementById('inapDetailDonut');
        if (donutCtx) {
            if (this.charts['inapDonut2']) this.charts['inapDonut2'].destroy();

            const total = totalInap + totalTidakInap;
            const pctInap = total > 0 ? Math.round((totalInap / total) * 100) : 0;

            this.charts['inapDonut2'] = new Chart(donutCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['INAP', 'TIDAK INAP'],
                    datasets: [{
                        data: [totalInap, totalTidakInap],
                        backgroundColor: [
                            'rgba(239, 68, 68, 0.85)',
                            'rgba(16, 185, 129, 0.85)'
                        ],
                        borderColor: ['#f87171', '#34d399'],
                        borderWidth: 2,
                        hoverOffset: 10,
                        hoverBorderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '72%',
                    animation: { animateRotate: true, duration: 1200 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(2,6,23,0.95)',
                            titleColor: '#06b6d4',
                            bodyColor: '#e2e8f0',
                            borderColor: 'rgba(6,182,212,0.4)',
                            borderWidth: 1
                        }
                    }
                },
                plugins: [{
                    id: 'centerText',
                    afterDraw: function (chart) {
                        const ctx = chart.ctx;
                        const w = chart.width;
                        const h = chart.height;
                        ctx.save();
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.font = "bold 28px 'Orbitron', sans-serif";
                        ctx.fillStyle = pctInap > 20 ? '#ef4444' : '#10b981';
                        ctx.shadowColor = pctInap > 20 ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)';
                        ctx.shadowBlur = 15;
                        ctx.fillText(pctInap + '%', w / 2, h / 2 - 6);
                        ctx.font = "600 9px 'Outfit', sans-serif";
                        ctx.fillStyle = '#64748b';
                        ctx.shadowBlur = 0;
                        ctx.fillText('RASIO INAP', w / 2, h / 2 + 18);
                        ctx.restore();
                    }
                }]
            });

            // Custom legend
            const legend = document.getElementById('inap-donut-legend');
            if (legend) {
                legend.innerHTML = `
                    <div style="display:flex; align-items:center; gap:5px;">
                        <div style="width:10px; height:10px; border-radius:2px; background:#ef4444;"></div>
                        <span style="font-size:0.65rem; color:#94a3b8;">INAP: <b style="color:#ef4444;">${totalInap}</b></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <div style="width:10px; height:10px; border-radius:2px; background:#10b981;"></div>
                        <span style="font-size:0.65rem; color:#94a3b8;">TIDAK INAP: <b style="color:#10b981;">${totalTidakInap}</b></span>
                    </div>
                `;
            }
        }

        // --- DETAIL TABLE ---
        const detailContainer = document.getElementById('inap-detail-table');
        const detailCount = document.getElementById('inap-detail-count');
        if (!detailContainer) return;

        if (detailCount) detailCount.textContent = inapRows.length + ' CONTAINER INAP';

        if (inapRows.length === 0) {
            detailContainer.innerHTML = `
                <div style="text-align:center; padding:40px; color:#475569;">
                    <i class="fas fa-check-circle" style="font-size:2rem; color:#10b981; margin-bottom:10px;"></i><br>
                    <span style="font-family:'Orbitron'; font-size:0.75rem; letter-spacing:2px; color:#10b981;">ZERO INAP</span><br>
                    <span style="font-size:0.65rem; margin-top:5px; display:block;">Tidak ada container yang menginap pada periode ini</span>
                </div>`;
            return;
        }

        // Build correlation analysis
        // Group inap rows by date to identify pattern
        let dateGroups = {};
        inapRows.forEach(row => {
            let tgl = this.normalizeDate(row['TANGGAL']) || '-';
            if (!dateGroups[tgl]) dateGroups[tgl] = [];
            dateGroups[tgl].push(row);
        });

        let html = `
        <table style="width:100%; border-collapse:collapse; font-size:0.65rem;">
            <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.1); color:var(--text-muted);">
                    <th style="padding:8px 6px; text-align:left;">TGL BONGKAR</th>
                    <th style="padding:8px 6px; text-align:left;">NOPOL</th>
                    <th style="padding:8px 6px; text-align:left;">TIPE</th>
                    <th style="padding:8px 6px; text-align:left;">ARRIVAL</th>
                    <th style="padding:8px 6px; text-align:right;">DURASI</th>
                    <th style="padding:8px 6px; text-align:left;">KORELASI / PENYEBAB</th>
                </tr>
            </thead>
            <tbody>`;

        // Sort inap rows by date
        inapRows.sort((a, b) => {
            let da = this.normalizeDate(a['TANGGAL']) || '';
            let db = this.normalizeDate(b['TANGGAL']) || '';
            return da.localeCompare(db);
        });

        inapRows.forEach(row => {
            let tgl = this.normalizeDate(row['TANGGAL']) || '-';
            let nopol = row['NOPOL'] || '-';
            let truckType = String(row['JENIS_TRUCK'] || '').replace(/container/gi, '').trim() || 'Container';
            let arrDate = String(row['ARRIVAL_DATE'] || '-');
            let arrTime = row['ARRIVAL_TIME'] || '-';
            let durH = this._getDurationHours(row);
            let durStr = durH !== null ? Math.floor(durH) + 'h ' + Math.round((durH % 1) * 60) + 'm' : '-';

            // Correlation analysis
            let correlations = [];
            let sameDay = dateGroups[tgl] || [];
            let totalSameDay = (this.dataByDate[tgl] || []).length;
            let inapsOnDay = sameDay.length;

            // 1. Volume correlation
            if (totalSameDay >= 6) {
                correlations.push(`<span style="color:#f59e0b;"><i class="fas fa-boxes"></i> Volume tinggi (${totalSameDay} container)</span>`);
            }

            // 2. Truck size correlation
            let is40 = String(row['JENIS_TRUCK'] || '').toUpperCase().includes('40');
            if (is40) {
                correlations.push(`<span style="color:#8b5cf6;"><i class="fas fa-truck"></i> 40FT (bongkar lebih lama)</span>`);
            }

            // 3. Multiple inap on same day
            if (inapsOnDay >= 2) {
                correlations.push(`<span style="color:#ef4444;"><i class="fas fa-clone"></i> ${inapsOnDay} inap di tanggal ini</span>`);
            }

            // 4. Late arrival
            if (arrTime !== '-' && arrTime !== 'null') {
                let timeParts = arrTime.split(':');
                if (timeParts.length >= 2) {
                    let h = parseInt(timeParts[0]);
                    if (h >= 18 || h < 4) {
                        correlations.push(`<span style="color:#06b6d4;"><i class="fas fa-moon"></i> Arrival malam/dini hari</span>`);
                    }
                }
            }

            // 5. Duration over 36h is extreme
            if (durH !== null && durH >= 36) {
                correlations.push(`<span style="color:#ef4444; font-weight:700;"><i class="fas fa-exclamation-circle"></i> Ekstrem: >${Math.floor(durH)}h</span>`);
            }

            let corrHtml = correlations.length > 0
                ? correlations.join('<br>')
                : '<span style="color:#64748b;">Tidak teridentifikasi</span>';

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.03); transition:0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.05)'" onmouseout="this.style.background='transparent'">
                    <td style="padding:8px 6px; color:#94a3b8;">${tgl}</td>
                    <td style="padding:8px 6px;"><span style="color:#fff; font-family:'Orbitron'; font-weight:700; font-size:0.7rem;">${nopol}</span></td>
                    <td style="padding:8px 6px; color:${is40 ? '#f59e0b' : '#8b5cf6'};">${truckType}</td>
                    <td style="padding:8px 6px; color:#0ea5e9;">${arrDate}<br><span style="font-family:'Orbitron'; font-size:0.55rem;">${arrTime}</span></td>
                    <td style="padding:8px 6px; text-align:right; font-family:'Orbitron'; font-weight:700; color:#ef4444;">${durStr}</td>
                    <td style="padding:8px 6px; font-size:0.6rem; line-height:1.5;">${corrHtml}</td>
                </tr>`;
        });

        html += '</tbody></table>';
        detailContainer.innerHTML = html;
    }
};

window.onload = function () {
    TrackingApp.init();
};
