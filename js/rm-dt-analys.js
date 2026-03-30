/**
 * RM ANALYTICS ENGINE (V3 - LUXURY PRO)
 * Logic: GLOBAL SLICER V3
 * Theme: Cyber Dark (New Visuals)
 */

const AnalysApp = {
    data: null,
    charts: {},
    currentMonth: '', // GLOBAL STATE

    currentOpsPeriod: 'daily',
    currentAbsBorongPeriod: 'daily',
    currentAbsHarianPeriod: 'daily',
    currentProdTeamPeriod: 'weekly',
    currentSumBongkarPeriod: 'weekly',
    currentSumMuatPeriod: 'weekly',
    currentTungguQCPeriod: 'daily',
    apiUrl: CONFIG.DOWNTIME_API_URL,
    apiV2Url: CONFIG.ANALYTICS_V2_URL,
    dataOld: null,  // ≤ Feb 2026
    dataV2: null,   // ≥ Mar 2026
    containerData: [], // Data dari Container Tracking
    containerDataByDate: {}, // Grouped containers

    // CONFIG GOOGLE SHEETS (Container)
    CONTAINER_SHEET_ID: '1m7q1IdtKyaNvjKP5QL85NPsk0FPEGUqV0scSB2CsXJ0',
    CONTAINER_SHEET_NAME: 'DATA BONGKARAN',

    init: function () {
        console.log("Analytics Engine V3 (Real Data Mode) Starting...");
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Outfit', sans-serif";
        Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';

        this.fetchData();
        this.fetchContainerData(); // Parallel fetch

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.exitAllFullscreen();
        });
    },

    fetchData: async function () {
        const statusText = document.querySelector('.status-pill');
        if (statusText) statusText.innerHTML = '<div class="status-dot" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></div> SYNCING...';

        // FORCE CLEAR CACHE TO PULL FRESH DATA FROM NEW APIS
        localStorage.removeItem('rm_dt_data_old');
        localStorage.removeItem('rm_dt_data_v2');

        // 1. FAST LOAD FROM CACHE (Bypassed initially to ensure fresh data)
        try {
            const cachedOld = localStorage.getItem('rm_dt_data_old');
            const cachedV2 = localStorage.getItem('rm_dt_data_v2');
            if (cachedOld || cachedV2) {
                this.dataOld = cachedOld ? JSON.parse(cachedOld) : null;
                this.dataV2 = cachedV2 ? JSON.parse(cachedV2) : null;
                this.data = this.dataOld || this.dataV2 || { dailyActivity: [], template: [], kuliBorong: {}, kuliHarian: {} };
                this.initGlobalFilter();
                this.renderAllCharts();
                this.renderKPIs();
                this.initMaterialFeed();
                if (statusText) statusText.innerHTML = '<div class="status-dot"></div> SYSTEM CACHED';
            }
        } catch (e) { console.warn("Cache read error", e); }

        // 2. FETCH LATEST IN BACKGROUND
        console.log(`[FETCH] Starting background sync: ${this.apiUrl} & ${this.apiV2Url}`);
        try {
            const [resOld, resV2] = await Promise.all([
                fetch(this.apiUrl).then(r => r.json()).catch(err => { console.error("Old API Error:", err); return null; }),
                this.apiV2Url ? fetch(this.apiV2Url).then(r => r.json()).catch(err => { console.error("V2 API Error:", err); return null; }) : Promise.resolve(null)
            ]);

            if (resV2) {
                console.log(`[FETCH] V2 API SUCCESS: ${(resV2.template || []).length} template rows, ${(resV2.dailyActivity || []).length} activity rows.`);
                if (resV2.template && resV2.template.length > 0) {
                    console.log(`[DEBUG] Sample V2 Template Row:`, resV2.template[0]);
                    // Table debugger for Bongkaran entries
                    const bDebug = resV2.template.filter(r => {
                        let k = String(r['KEGIATAN'] || r['JENIS KEGIATAN'] || '').toUpperCase();
                        return k.includes('BONGKAR');
                    }).slice(0, 20);
                    if (bDebug.length > 0) {
                        console.log("[V2 BONGKARAN DEBUGGER]");
                        console.table(bDebug);
                    }
                }
            } else {
                console.warn(`[FETCH] V2 API returned NULL or failed.`);
            }

            let changed = true; // Force re-render after fetch

            // UPDATE CACHE IF CHANGED
            if (resOld) {
                localStorage.setItem('rm_dt_data_old', JSON.stringify(resOld));
                this.dataOld = resOld;
            }
            if (resV2) {
                localStorage.setItem('rm_dt_data_v2', JSON.stringify(resV2));
                this.dataV2 = resV2;
            }

            // RE-RENDER IF THERE WAS A CHANGE
            if (changed || (!this.dataOld && !this.dataV2)) {
                // v20.2.4: Ensure we pick the right month's data after fetch
                this.data = this.buildDataForMonth(this.currentMonth);
                this.initGlobalFilter();
                this.renderAllCharts();
                this.renderKPIs();
                this.initMaterialFeed();
            }
            if (statusText) statusText.innerHTML = '<div class="status-dot"></div> SYSTEM ONLINE';
        } catch (err) {
            console.error("FETCH ERROR:", err);
            if (!this.dataOld && !this.dataV2) {
                if (statusText) statusText.innerHTML = '<div class="status-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></div> ERROR';
                alert("Connection Failed: " + err.message);
            }
        }
    },

    fetchContainerData: function () {
        const callbackName = '_gvizContainerAnalysisCallback';
        const url = `https://docs.google.com/spreadsheets/d/${this.CONTAINER_SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callbackName}&sheet=${encodeURIComponent(this.CONTAINER_SHEET_NAME)}&tq=${encodeURIComponent('SELECT A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB')}`;

        window[callbackName] = (gviz) => {
            try {
                if (!gviz || !gviz.table) throw new Error("Invalid Container data");
                const raw = this.parseGvizTable(gviz.table);
                console.log(`[ContainerData] Received ${raw.length} rows from Sheet.`);

                this.containerData = raw.filter(row => {
                    let iso = this.normalizeDate(row['TANGGAL']);
                    return !!iso;
                });

                console.log(`[ContainerData] ${this.containerData.length} rows successfully normalized and filtered.`);
                if (this.containerData.length > 0) {
                    const dates = this.containerData.map(r => r['TANGGAL']).sort();
                    console.log(`[ContainerData] Date range: ${dates[0]} to ${dates[dates.length-1]}`);
                    console.log(`[ContainerData] Sample row:`, this.containerData[0]);
                }

                // Update filter dropdown with months from container data
                this.initGlobalFilter();

                // Group by Date for fast lookup
                this.containerDataByDate = {};
                this.containerData.forEach(row => {
                    let d = this.normalizeDate(row['TANGGAL']);
                    if (!this.containerDataByDate[d]) this.containerDataByDate[d] = [];
                    this.containerDataByDate[d].push(row);
                });

                console.log('Container analysis data loaded:', this.containerData.length);
                
                // RE-RENDER UI after container data arrives
                this.renderAllCharts();
                this.renderKPIs();
                this.initMaterialFeed();
            } catch (err) {
                console.error("CONTAINER FETCH ERROR:", err);
            }
            delete window[callbackName];
        };

        const script = document.createElement('script');
        script.src = url;
        document.head.appendChild(script);
    },

    parseGvizTable: function (table) {
        const cols = table.cols || [];
        const rows = table.rows || [];
        let foundTanggal = false;
        const headers = cols.map((c, idx) => {
            let label = String(c.label || '').trim().toUpperCase().replace(/[\s]+/g, '_');
            if (!label || label === '' || label === String(c.id || '').toUpperCase()) {
                if ((c.type === 'date' || c.type === 'datetime' || idx === 0) && !foundTanggal) {
                    label = 'TANGGAL'; foundTanggal = true;
                } else { label = 'COL_' + idx; }
            }
            return label;
        });

        return rows.map(row => {
            const obj = {};
            (row.c || []).forEach((cell, i) => {
                if (!headers[i]) return;
                let val = cell ? cell.v : null;
                if (val === null || val === undefined) { obj[headers[i]] = ''; return; }

                // Google encodes dates as "Date(y,m,d)" strings in JSON
                if (typeof val === 'string' && val.startsWith('Date(')) {
                    const m = val.match(/Date\((\d+),(\d+),(\d+)/);
                    if (m) val = `${m[1]}-${String(parseInt(m[2]) + 1).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
                }
                
                // Use formatted value (cell.f) if raw value is unhelpful
                let finalVal = (val !== null && val !== '') ? String(val) : '';
                if (finalVal === '' && cell && cell.f) finalVal = String(cell.f);

                obj[headers[i]] = finalVal;
            });

            // === ALIAS MAPPING (Consistent with rm-tracking-container) ===
            if (obj['FINISH'] !== undefined && !obj['FINISH_BONGKAR']) obj['FINISH_BONGKAR'] = obj['FINISH'];
            if (obj['NETTO_(KG)'] !== undefined) {
                let rawVol = String(obj['NETTO_(KG)']).replace(/,/g, '');
                obj['NETTO_KG'] = parseFloat(rawVol) || 0;
            } else if (obj['NETTO_KG'] !== undefined) {
                // If already named NETTO_KG, ensure it is float
                obj['NETTO_KG'] = parseFloat(String(obj['NETTO_KG']).replace(/,/g, '')) || 0;
            }

            if (obj['MATERIAL'] !== undefined) obj['JENIS_RM'] = obj['MATERIAL'];
            if (obj['START_PANGGIL'] !== undefined) obj['PB_START'] = obj['START_PANGGIL'];
            if (obj['QC_SAMPLING_1_TIME'] !== undefined) obj['TUNGGU_QC'] = obj['QC_SAMPLING_1_TIME'];
            if (obj['LOKASI_SIMPAN'] !== undefined) obj['LOKASI'] = obj['LOKASI_SIMPAN'];
            if (obj['GUDANG/INTAKE'] !== undefined) obj['GUDANG'] = obj['GUDANG/INTAKE'];
            if (obj['TIM_KERJA'] !== undefined) obj['TIM'] = obj['TIM_KERJA'];

            return obj;
        });
    },

    // v20.2.3: Robust volume extraction (handles Kg/MT and field name changes)
    getUnloadingVol: function (row) {
        if (!row) return 0;
        // 1. Check for explicit Kg fields (Direct from Sheet or correctly mapped)
        if (row['NETTO_KG'] !== undefined && row['NETTO_KG'] !== '') return parseFloat(row['NETTO_KG']) || 0;
        if (row['REAL_BONGKAR_KG'] !== undefined && row['REAL_BONGKAR_KG'] !== '') return parseFloat(row['REAL_BONGKAR_KG']) || 0;
        
        // 2. Check for V2 API field (REAL_BONGKAR_MT is often KG in current backend or vice versa)
        if (row['REAL_BONGKAR_MT'] !== undefined && row['REAL_BONGKAR_MT'] !== '') {
            let val = parseFloat(String(row['REAL_BONGKAR_MT']).replace(/,/g, '')) || 0;
            if (val > 0 && val < 500) return val * 1000; // Auto-detect MT (e.g. 25.5 -> 25500)
            return val; 
        }

        // 3. Broad Catch-all for any column containing 'NETTO' or 'KG' or 'MT'
        for (let key in row) {
            let k = key.toUpperCase();
            if ((k.includes('NETTO') || k.includes('_KG') || k === 'MT' || k.includes('BERAT')) && row[key] !== '' && row[key] !== null) {
                let val = parseFloat(String(row[key]).replace(/,/g, '')) || 0;
                if (val > 0 && val < 500) return val * 1000; // MT detected
                if (val > 0) return val;
            }
        }
        return 0;
    },

    initGlobalFilter: function () {
        // Collect all distinct months from all data sources for robustness
        let months = new Set();

        // From OLD data
        if (this.dataOld) {
            (this.dataOld.dailyActivity || []).forEach(i => { if (i.tanggal) months.add(i.tanggal.substring(0, 7)); });
            ['kuliBorong', 'kuliHarian'].forEach(k => {
                if (this.dataOld[k] && this.dataOld[k].dateHeaders) {
                    this.dataOld[k].dateHeaders.forEach(h => {
                        let d = this.normalizeDate(h);
                        if (d) months.add(d.substring(0, 7));
                    });
                }
            });
            (this.dataOld.template || []).forEach(i => {
                let d = this.normalizeDate(i['TANGGAL']);
                if (d) months.add(d.substring(0, 7));
            });
        }

        // From V2 data
        if (this.dataV2) {
            (this.dataV2.dailyActivity || []).forEach(i => { if (i.tanggal) months.add(i.tanggal.substring(0, 7)); });
            ['kuliBorong', 'kuliHarian'].forEach(k => {
                if (this.dataV2[k] && this.dataV2[k].dateHeaders) {
                    this.dataV2[k].dateHeaders.forEach(h => {
                        let d = this.normalizeDate(h);
                        if (d) months.add(d.substring(0, 7));
                    });
                }
            });
        }
        
        // From Container Data (Google Sheet)
        if (this.containerData) {
            this.containerData.forEach(row => {
                let d = this.normalizeDate(row['TANGGAL']);
                if (d) months.add(d.substring(0, 7));
            });
        }

        // FILTER: Remove Errors. Keep 2023+, Exclude Dec 2024.
        const currentY = new Date().getFullYear();
        const currentM = new Date().getMonth() + 1;

        // Convert to array and filter
        const validMonths = Array.from(months).filter(m => {
            if (!m || m.length < 7) return false;
            let parts = m.split('-');
            let y = parseInt(parts[0]);
            let mon = parseInt(parts[1]);

            // 1. Remove Glitch Years (206, 2001, etc) - Keep 2023+
            if (y < 2023) return false;

            // 2. SPECIFIC REQUEST: Remove Dec 2024
            if (y === 2024 && mon === 12) return false;

            // 3. Remove Far Future Years (allow current + 1)
            if (y > currentY + 1) return false;

            // 4. Remove Far Future Months (allow up to currentMonth + 1 for staging)
            if (y === currentY && mon > currentM + 1) return false;

            return true;
        }).sort().reverse();

        const select = document.getElementById('global-month-filter');
        if (select) {
            select.innerHTML = '';
            validMonths.forEach(m => {
                let label = m;
                try { label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(); } catch (e) { }
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
            if (select.options.length > 0) {
                select.value = select.options[0].value;
                this.currentMonth = select.value;
                // v20.2.2: Set correct data source for initial month (may merge)
                this.data = this.buildDataForMonth(this.currentMonth);
            }
        }
    },

    // v20.2.2 CUTOVER DATE: Feb 19, 2026
    V2_CUTOVER: '2026-02-19',

    buildDataForMonth: function (month) {
        const cutMonth = this.V2_CUTOVER.substring(0, 7); // '2026-02'

        // Pure old (before cutover month)
        if (month < cutMonth) {
            return this.dataOld || { dailyActivity: [], template: [], kuliBorong: {}, kuliHarian: {} };
        }
        // Pure V2 (after cutover month)
        if (month > cutMonth) {
            return this.dataV2 || { dailyActivity: [], template: [], kuliBorong: {}, kuliHarian: {} };
        }
        // MIXED MONTH (Feb 2026): old < Feb19, V2 >= Feb19
        if (!this.dataOld && !this.dataV2) return { dailyActivity: [], template: [], kuliBorong: {}, kuliHarian: {} };
        if (!this.dataOld) return this.dataV2;
        if (!this.dataV2) return this.dataOld;

        return this.mergeDataSources(this.dataOld, this.dataV2, this.V2_CUTOVER);
    },

    mergeDataSources: function (old, v2, cutover) {
        const merged = {};

        // 1. dailyActivity: old dates < cutover, v2 dates >= cutover
        const oldDA = (old.dailyActivity || []).filter(d => d.tanggal && d.tanggal < cutover);
        const newDA = (v2.dailyActivity || []).filter(d => d.tanggal && d.tanggal >= cutover);
        merged.dailyActivity = [...oldDA, ...newDA].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

        // 2. template: same logic
        const normDate = (r) => {
            let d = r['TANGGAL'];
            if (!d) return null;
            return this.normalizeDate(d);
        };
        const oldTpl = (old.template || []).filter(r => { let d = normDate(r); return d && d < cutover; });
        const newTpl = (v2.template || []).filter(r => { let d = normDate(r); return d && d >= cutover; });
        merged.template = [...oldTpl, ...newTpl];

        // 3. kuliBorong: merge dateHeaders + rows
        merged.kuliBorong = this.mergeAbsensi(old.kuliBorong, v2.kuliBorong, cutover);

        // 4. kuliHarian: merge dateHeaders + rows
        merged.kuliHarian = this.mergeAbsensi(old.kuliHarian, v2.kuliHarian, cutover);

        return merged;
    },

    mergeAbsensi: function (oldAbs, newAbs, cutover) {
        oldAbs = oldAbs || { dateHeaders: [], rows: [] };
        newAbs = newAbs || { dateHeaders: [], rows: [] };

        // Normalize old dateHeaders (could be "dd MMM" format) to ISO
        const normOldHeaders = (oldAbs.dateHeaders || []).map(h => this.normalizeDate(h) || h);
        const normNewHeaders = (newAbs.dateHeaders || []).map(h => this.normalizeDate(h) || h);

        // Filter by cutover
        const keepOldIdx = normOldHeaders.map((h, i) => ({ h, i })).filter(x => x.h < cutover);
        const keepNewIdx = normNewHeaders.map((h, i) => ({ h, i })).filter(x => x.h >= cutover);

        const mergedHeaders = [...keepOldIdx.map(x => oldAbs.dateHeaders[x.i]), ...keepNewIdx.map(x => newAbs.dateHeaders[x.i])];

        // Merge rows by nama
        const peopleMap = {};
        (oldAbs.rows || []).forEach(r => {
            const key = r.nama || r.no;
            if (!peopleMap[key]) peopleMap[key] = { tim: r.tim, nama: r.nama || r.no, absensi: [] };
            keepOldIdx.forEach(x => {
                peopleMap[key].absensi.push(r.absensi ? r.absensi[x.i] || '' : '');
            });
        });
        (newAbs.rows || []).forEach(r => {
            const key = r.nama || r.no;
            if (!peopleMap[key]) {
                // Person only in V2 — pad old dates with empty
                peopleMap[key] = { tim: r.tim, nama: r.nama || r.no, absensi: keepOldIdx.map(() => '') };
            }
            keepNewIdx.forEach(x => {
                peopleMap[key].absensi.push(r.absensi ? r.absensi[x.i] || '' : '');
            });
        });
        // Pad old-only people with empty for new dates
        Object.values(peopleMap).forEach(p => {
            while (p.absensi.length < mergedHeaders.length) p.absensi.push('');
        });

        return { dateHeaders: mergedHeaders, rows: Object.values(peopleMap) };
    },

    handleGlobalFilterChange: function (val) {
        this.currentMonth = val;
        // v20.2.2: Build merged/single-source data for selected month
        this.data = this.buildDataForMonth(val);
        this.renderAllCharts();
        this.renderKPIs();
        this.initMaterialFeed();
    },

    renderAllCharts: function () {
        this.renderOpsDaily(this.currentOpsPeriod);
        this.renderAbsensiBorong(this.currentAbsBorongPeriod);
        this.renderAbsensiHarian(this.currentAbsHarianPeriod);
        this.renderProdTeam(this.currentProdTeamPeriod);
        this.renderSummaryGudang('sumBongkar', 'BONGKAR', this.currentSumBongkarPeriod);
        this.renderSummaryGudang('sumMuat', 'MUAT', this.currentSumMuatPeriod);
        this.renderTungguQC(this.currentTungguQCPeriod);
    },

    // ... (KPI Logic Unchanged) ...
    renderKPIs: function () {
        let totalVol = 0;
        let sumBongkar = 0;
        let sumMuat = 0;
        let sumStapel = 0;

        let opsData = this.data.dailyActivity || [];
        const selectedMonth = this.currentMonth;

        opsData.forEach(i => {
            if (i.tanggal && i.tanggal.startsWith(selectedMonth)) {
                let b = Number(i.bongkar) || 0;
                let m = Number(i.muat) || 0;
                let s = (Number(i.st_badrun) || 0) + (Number(i.st_kartono) || 0) + (Number(i.st_kulhar) || 0);
                sumBongkar += b; sumMuat += m; sumStapel += s;
                totalVol += (b + m + s);
            }
        });

        // INTEGRATION: Unified Unloading Aggregation
        // Step 1: Add all from Container Data (Source of truth for containers/Rice Bran)
        const countedContainers = new Set(); // Track unique identifiers if possible, or just sum
        this.containerData.forEach(row => {
            let tgl = this.normalizeDate(row['TANGGAL']);
            if (tgl && tgl.startsWith(selectedMonth)) {
                let vol = this.getUnloadingVol(row);
                sumBongkar += vol;
                totalVol += vol;
                // If it's a specific container, we might want to mark it as counted
                // For now, we assume ALL rows in containerData are valid unloading
            }
        });

        // Step 2: Add materials from V2 Template that are NOT in containerData
        // Convention: ContainerData usually covers RICE BRAN. Other materials come from V2 API.
        const v2Template = this.data.template || [];
        v2Template.forEach(row => {
            let tgl = this.normalizeDate(row['TANGGAL']);
            if (tgl && tgl.startsWith(selectedMonth)) {
                let activity = String(row['KEGIATAN'] || '').toUpperCase();
                if (activity === 'BONGKAR') {
                    let mat = String(row['MATERIAL'] || row['JENIS_RM'] || '').toUpperCase();
                    // CRITICAL: Ensure we read material even if field names vary
                    let volKG = this.getUnloadingVol(row);
                    
                    // AVOID DOUBLE COUNTING: 
                    // If the material is RICE BRAN, we skip it here because it's already in containerData loop
                    if (!mat.includes('RICE BRAN')) {
                        sumBongkar += volKG;
                        totalVol += volKG;
                    }
                }
            }
        });

        this.animateValue('kpi-total-vol', 0, totalVol, 2000, " KG");
        if (document.getElementById('kpi-vol-bongkar')) document.getElementById('kpi-vol-bongkar').innerText = sumBongkar.toLocaleString();
        if (document.getElementById('kpi-vol-muat')) document.getElementById('kpi-vol-muat').innerText = sumMuat.toLocaleString();
        if (document.getElementById('kpi-vol-stapel')) document.getElementById('kpi-vol-stapel').innerText = sumStapel.toLocaleString();

        // 2. TOTAL ATTENDANCE (Strictly V2 logic >= 19 Feb 2026) -> Changed to Manual per request
        document.getElementById('kpi-total-attn').innerHTML = "46 <span class='text-sm text-gray-500'>ORG</span>";
        document.getElementById('kpi-attn-date').innerText = 'MANUAL';
        document.getElementById('kpi-attn-borong').innerText = "20";
        document.getElementById('kpi-attn-harian').innerText = "26";

        // 3. TOP PRODUCTIVITY (Rank all teams)
        let teams = { 'BADRUN': 0, 'KARTONO': 0, 'KULHAR': 0 };
        let counts = { 'BADRUN': 0, 'KARTONO': 0, 'KULHAR': 0 };
        opsData.forEach(d => {
            if (d.tanggal && d.tanggal >= '2026-02-19') { // Strict constraint to new data
                teams['BADRUN'] += parseInt(d.prod_badrun || 0); counts['BADRUN']++;
                teams['KARTONO'] += parseInt(d.prod_kartono || 0); counts['KARTONO']++;
                teams['KULHAR'] += parseInt(d.prod_kulhar || 0); counts['KULHAR']++;
            }
        });

        // If no data > Feb 19, fallback to global month selection for backwards compatibility
        if (counts['BADRUN'] === 0 && counts['KARTONO'] === 0 && counts['KULHAR'] === 0) {
            opsData.forEach(d => {
                if (d.tanggal && d.tanggal.startsWith(selectedMonth)) {
                    teams['BADRUN'] += parseInt(d.prod_badrun || 0); counts['BADRUN']++;
                    teams['KARTONO'] += parseInt(d.prod_kartono || 0); counts['KARTONO']++;
                    teams['KULHAR'] += parseInt(d.prod_kulhar || 0); counts['KULHAR']++;
                }
            });
        }

        let avgScores = [];
        for (let t in teams) {
            if (counts[t] > 0) avgScores.push({ name: t, avg: Math.round(teams[t] / counts[t]) });
        }
        avgScores.sort((a, b) => b.avg - a.avg);

        const prodList = document.getElementById('kpi-prod-list');
        if (prodList) {
            if (avgScores.length > 0) {
                let listHtml = '';
                let colors = ['var(--accent)', 'var(--primary)', 'var(--secondary)'];
                avgScores.forEach((team, idx) => {
                    let color = colors[idx % colors.length];
                    listHtml += `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:30px; height:30px; background:${color}; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem; box-shadow:0 0 10px ${color}66; color:#fff;">
                                #${idx + 1}
                            </div>
                            <div style="font-weight:700; font-size:0.9rem; color:#fff;">${team.name}</div>
                        </div>
                        <div style="font-size:0.8rem; color:#94a3b8; font-family:'Orbitron';">
                            <span style="color:${color}; font-weight:700;">${team.avg.toLocaleString()}</span> kg/org
                        </div>
                    </div>`;
                });
                prodList.innerHTML = listHtml;
            } else {
                prodList.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">No data for selection</div>';
            }
        }

        // 4. QC WAIT
        let qcItems = this.data.template || [];
        let totalWait = 0; let waitCount = 0;
        qcItems.forEach(row => {
            if (row['TANGGAL'] && this.normalizeDate(row['TANGGAL'])?.startsWith(selectedMonth)) {
                let t1 = this.parseTime(row['PB_START']);
                let t2 = this.parseTime(row['TUNGGU_QC']);
                if (t1 && t2) {
                    let diff = t1 - t2;
                    if (diff < 0) diff += 1440;
                    totalWait += diff; waitCount++;
                }
            }
        });
        let metricsWait = waitCount > 0 ? Math.round(totalWait / waitCount) : 0;
        if (document.getElementById('kpi-qc-wait')) {
            document.getElementById('kpi-qc-wait').innerText = metricsWait + " m";
            document.getElementById('kpi-qc-bar').style.width = Math.min((metricsWait / 15) * 100, 100) + "%";
        }

        this.generateCalendar();
    },

    animateValue: function (id, start, end, duration, suffix = "") {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            let val = Math.floor(progress * (end - start) + start);
            obj.innerHTML = val.toLocaleString() + "<span style='font-size:0.5em; color:#94a3b8;'>" + suffix + "</span>";
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    },

    renderSparkline: function (data) {
        const ctx = document.getElementById('spark-total');
        if (!ctx) return;
        let recent = data.slice(-14).map(d => (parseInt(d.muat || 0) + parseInt(d.bongkar || 0) + parseInt(d.st_badrun || 0)));
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: recent.map((_, i) => i),
                datasets: [{
                    data: recent,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } }
            }
        });
    },

    // =========================================================
    // OPS DAILY
    // =========================================================

    renderOpsDaily: function (period) {
        this.currentOpsPeriod = period;
        const items = this.data.dailyActivity || [];
        // USE GLOBAL SLICER
        const selectedMonth = this.currentMonth;

        let grouped = {};

        if (period === 'monthly') {
            grouped = this.groupDataByPeriod(items, 'monthly_global');
        } else {
            let filteredItems = items.filter(i => i.tanggal && i.tanggal.startsWith(selectedMonth));
            if (period === 'daily') grouped = this.groupDataByPeriod(filteredItems, 'daily');
            else if (period === 'weekly') {
                grouped = {};
                filteredItems.forEach(item => {
                    let day = parseInt(item.tanggal.split('-')[2]);
                    let weekNum = Math.ceil(day / 7);
                    let key = `W${weekNum}`;
                    if (!grouped[key]) grouped[key] = this.createEmptyGroup();
                    this.aggregateItemToGroup(grouped[key], item);
                });
            }
        }

        // INTEGRATION: Add Container Unloading + V2 Multi-Material to Ops Daily Chart
        this.containerData.forEach(row => {
            let tgl = this.normalizeDate(row['TANGGAL']);
            if (tgl && tgl.startsWith(selectedMonth)) {
                let key = tgl;
                if (period === 'monthly') key = tgl.substring(0, 7);
                else if (period === 'weekly') {
                    let day = parseInt(tgl.split('-')[2]);
                    let weekNum = Math.ceil(day / 7);
                    key = `W${weekNum}`;
                }
                
                if (!grouped[key]) grouped[key] = this.createEmptyGroup();
                let vol = this.getUnloadingVol(row);
                grouped[key].sum.bongkar += vol;
                
                // Track material for dynamic labeling
                if (!grouped[key].materials) grouped[key].materials = new Set();
                let m = row['MATERIAL'] || row['JENIS_RM'] || 'RM';
                grouped[key].materials.add(m.split(' (')[0]); 
            }
        });

        // Add V2 Template Multi-Material Unloading
        const v2Tpl_ops = this.data.template || [];
        v2Tpl_ops.forEach(row => {
            let tgl = this.normalizeDate(row['TANGGAL']);
            if (tgl && tgl.startsWith(selectedMonth)) {
                let act = String(row['KEGIATAN'] || '').toUpperCase();
                if (act === 'BONGKAR') {
                    let mat = String(row['MATERIAL'] || row['JENIS_RM'] || '').toUpperCase();
                    if (!mat.includes('RICE BRAN')) {
                        let key = tgl;
                        if (period === 'monthly') key = tgl.substring(0, 7);
                        else if (period === 'weekly') {
                            let day = parseInt(tgl.split('-')[2]);
                            let weekNum = Math.ceil(day / 7);
                            key = `W${weekNum}`;
                        }
                        if (!grouped[key]) grouped[key] = this.createEmptyGroup();
                        let volKG = this.getUnloadingVol(row);
                        grouped[key].sum.bongkar += volKG;
                        if (!grouped[key].materials) grouped[key].materials = new Set();
                        grouped[key].materials.add(mat.split(' (')[0]);
                    }
                }
            }
        });

        const sortedKeys = Object.keys(grouped).sort();
        const labels = sortedKeys.map(k => this.formatDateSimple(k, period));
        let dMuat = sortedKeys.map(l => grouped[l].sum.muat);
        let dBongkar = sortedKeys.map(l => grouped[l].sum.bongkar);
        let dStapel = sortedKeys.map(l => grouped[l].sum.st_badrun + grouped[l].sum.st_kartono + grouped[l].sum.st_kulhar);

        const ctx = document.getElementById('chart-opsDaily').getContext('2d');
        if (this.charts['opsDaily']) this.charts['opsDaily'].destroy();

        let gradMuat = ctx.createLinearGradient(0, 0, 0, 400);
        gradMuat.addColorStop(0, '#f97316'); gradMuat.addColorStop(1, 'rgba(249, 115, 22, 0.1)');
        let gradBongkar = ctx.createLinearGradient(0, 0, 0, 400);
        gradBongkar.addColorStop(0, '#06b6d4'); gradBongkar.addColorStop(1, 'rgba(6, 182, 212, 0.1)');

        this.charts['opsDaily'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'MUAT', data: dMuat, backgroundColor: gradMuat, borderRadius: 4 },
                    { label: 'BONGKAR', data: dBongkar, backgroundColor: gradBongkar, borderRadius: 4 },
                    { label: 'STAPEL', data: dStapel, backgroundColor: '#8b5cf6', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }
                },
                plugins: { legend: { position: 'bottom', labels: { color: '#fff', usePointStyle: true } } }
            }
        });
    },

    // =========================================================
    // MATERIAL FEED (REAL DATA)
    // =========================================================

    initMaterialFeed: function () { this.filterMaterialFeed(); },

    filterMaterialFeed: function () {
        const searchInput = document.getElementById('material-search');
        if (!searchInput) return;
        let input = searchInput.value.toUpperCase().trim();
        let elList = document.getElementById('material-matches');
        let items = this.data.template || [];

        // HIDE LIST IF INPUT IS EMPTY
        if (input.length === 0) {
            elList.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Type to search material...</div>';
            document.getElementById('mat-min').innerText = "-";
            document.getElementById('mat-max').innerText = "-";
            document.getElementById('mat-avg').innerText = "-";
            return;
        }

        let durations = [];
        let html = "";
        let count = 0;

        items.forEach(row => {
            let jenisRM = String(row['JENIS_RM'] || '').toUpperCase();
            if (jenisRM.includes(input)) {
                if (count < 50) {
                    let dur = this.parseTime(row['DURASI_BONGKAR']);
                    let durStr = dur !== null ? `${dur}m` : '-';
                    if (dur) durations.push(dur);

                    html += `
                    <div class="feed-item">
                        <div>
                            <div style="color:#fff; font-weight:600;">${row['JENIS_RM']}</div>
                            <div style="color:#64748b; font-size:0.7em;">${row['TANGGAL']} | ${row['LOKASI'] || 'GUDANG'}</div>
                        </div>
                        <div class="feed-val text-cyan">${durStr}</div>
                    </div>`;
                    count++;
                }
            }
        });

        if (count === 0) html = '<div style="padding:20px; text-align:center; color:#64748b;">No materials found.</div>';
        elList.innerHTML = html;

        if (durations.length > 0) {
            document.getElementById('mat-min').innerText = Math.min(...durations) + "m";
            document.getElementById('mat-max').innerText = Math.max(...durations) + "m";
            document.getElementById('mat-avg').innerText = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) + "m";
        } else {
            document.getElementById('mat-min').innerText = "-";
            document.getElementById('mat-max').innerText = "-";
            document.getElementById('mat-avg').innerText = "-";
        }
    },

    // =========================================================
    // ABSENSI (STRICT V2 LOGIC RESTORATION)
    // =========================================================

    renderAbsensiBorong: function (period) {
        this.renderGenericAbsensi('chart-absBorong', this.data.kuliBorong, period);
    },

    renderAbsensiHarian: function (period) {
        this.renderGenericAbsensi('chart-absHarian', this.data.kuliHarian, period);
    },

    renderGenericAbsensi: function (chartId, source, period) {
        const ctx = document.getElementById(chartId).getContext('2d');
        if (this.charts[chartId]) this.charts[chartId].destroy();

        if (!source || !source.rows) return;

        const selectedMonth = this.currentMonth; // GLOBAL STATE
        const headers = source.dateHeaders || [];
        let grouped = {};

        // 1. Map Headers to Groups
        headers.forEach((h, idx) => {
            let iso = this.normalizeDate(h);
            if (!iso) return;

            // Filter
            if (selectedMonth !== 'ALL' && !iso.startsWith(selectedMonth)) return;

            let key = iso;
            if (period === 'monthly') key = iso.substring(0, 7);
            else if (period === 'weekly') {
                let d = new Date(iso);
                let week = Math.ceil(d.getDate() / 7);
                key = `W${week}`;
            }

            if (!grouped[key]) grouped[key] = { teams: {} };

            // 2. Scan Rows for this Column Index
            source.rows.forEach(row => {
                let teamName = (row.tim || 'UNK').toUpperCase();
                let val = row.absensi[idx];

                // Allow broader truthy values for checkmarks
                // v, V, ✓, 1, '1', 'hadir' (just in case)
                if (val) {
                    let vStr = String(val).toLowerCase().trim();
                    if (['v', '✓', '1', 'x', 'hadir', 'yes', 'true'].includes(vStr)) {
                        if (!grouped[key].teams[teamName]) grouped[key].teams[teamName] = 0;
                        grouped[key].teams[teamName]++;
                    }
                }
            });
        });

        // 3. Prepare Chart Data
        let sortedKeys = Object.keys(grouped).sort();
        if (sortedKeys.length === 0) return; // No Data

        let labels = sortedKeys.map(k => this.formatDateSimple(k, period));

        // Unique Teams
        let allTeams = new Set();
        sortedKeys.forEach(l => Object.keys(grouped[l].teams).forEach(t => allTeams.add(t)));
        let teamList = Array.from(allTeams);

        let datasets = teamList.map((team, i) => {
            let data = sortedKeys.map(l => grouped[l].teams[team] || 0);
            let colors = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];
            return {
                label: team,
                data: data,
                backgroundColor: colors[i % colors.length],
                borderRadius: 4
            };
        });

        // RENDER CHART
        this.charts[chartId] = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    },

    // =========================================================
    // PRODUCTIVITY TEAM (RESTORED V2)
    // =========================================================

    renderProdTeam: function (period) {
        let items = this.data.dailyActivity || [];
        const selectedMonth = this.currentMonth; // GLOBAL STATE

        let filtered = items.filter(i => i.tanggal && i.tanggal.startsWith(selectedMonth));
        // FORCE DAILY for clearer view as requested
        let grouped = this.groupDataByPeriod(filtered, 'daily');
        let sortedKeys = Object.keys(grouped).sort();
        let labels = sortedKeys.map(k => this.formatDateSimple(k, 'daily'));

        let d_badrun = sortedKeys.map(l => grouped[l].avg.prod_badrun);
        let d_kartono = sortedKeys.map(l => grouped[l].avg.prod_kartono);
        let d_kulhar = sortedKeys.map(l => grouped[l].avg.prod_kulhar);

        const ctx = document.getElementById('chart-prodTeam').getContext('2d');
        if (this.charts['prodTeam']) this.charts['prodTeam'].destroy();

        this.charts['prodTeam'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'BADRUN', data: d_badrun, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true },
                    { label: 'KARTONO', data: d_kartono, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true },
                    { label: 'KULHAR', data: d_kulhar, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { display: true, grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.05)' } } },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    },

    // =========================================================
    // TREND FLOW (RESTORED V2)
    // =========================================================

    renderSummaryGudang: function (chartId, type, period) {
        const ctx = document.getElementById('chart-' + chartId).getContext('2d');
        if (this.charts[chartId]) this.charts[chartId].destroy();

        // 1. Filter Data (Real)
        let items = this.data.template || [];
        let related = items.filter(r => (r['KEGIATAN'] || '').toUpperCase().includes(type));

        // GLOBAL MONTH FILTER APPLIED HERE TOO
        const selectedMonth = this.currentMonth;
        related = related.filter(r => {
            let iso = this.normalizeDate(r['TANGGAL']);
            return iso && iso.startsWith(selectedMonth);
        });

        // 2. Group
        let grouped = {};
        related.forEach(r => {
            let iso = this.normalizeDate(r['TANGGAL']);
            if (!iso) return;
            let key = iso;
            // Force Daily for trends to show dates as requested
            // if (period === 'weekly') { ... } 

            if (!grouped[key]) grouped[key] = 0;
            let valMT = parseFloat(r['REAL_BONGKAR_MT'] || r['REAL_MUAT_MT'] || 0);
            if (valMT > 0) grouped[key] += (valMT * 1000);
            else grouped[key]++; // Fallback to count if weight missing
        });

        // INTEGRATION: Add Container Records to Trend Flow (Bongkar)
        if (type === 'BONGKAR') {
            this.containerData.forEach(row => {
                let iso = this.normalizeDate(row['TANGGAL']);
                if (iso && iso.startsWith(selectedMonth)) {
                    if (!grouped[iso]) grouped[iso] = 0;
                    grouped[iso] += this.getUnloadingVol(row);
                }
            });
            // V2 Template Multi-Material
            const v2Tpl = this.data.template || [];
            v2Tpl.forEach(row => {
                let iso = this.normalizeDate(row['TANGGAL']);
                if (iso && iso.startsWith(selectedMonth)) {
                    let act = String(row['KEGIATAN'] || '').toUpperCase();
                    if (act === 'BONGKAR') {
                        let mat = String(row['MATERIAL'] || row['JENIS_RM'] || '').toUpperCase();
                        if (!mat.includes('RICE BRAN')) {
                            if (!grouped[iso]) grouped[iso] = 0;
                            grouped[iso] += this.getUnloadingVol(row);
                        }
                    }
                }
            });
        }

        let sortedKeys = Object.keys(grouped).sort();
        let labels = sortedKeys.map(k => this.formatDateSimple(k, 'daily'));
        let data = sortedKeys.map(k => grouped[k]);

        let color = type === 'BONGKAR' ? '#06b6d4' : '#f97316';
        let grad = ctx.createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');

        this.charts[chartId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: type,
                    data: data,
                    borderColor: color,
                    backgroundColor: grad,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { display: true, ticks: { color: '#64748b' } }, y: { display: false } }
            }
        });
    },

    renderTungguQC: function (period) {
        const ctx = document.getElementById('chart-tungguQC').getContext('2d');
        if (this.charts['tungguQC']) this.charts['tungguQC'].destroy();

        let items = this.data.template || [];
        const selectedMonth = this.currentMonth;

        let dateMap = {}; // date -> {sum, count}

        items.forEach(r => {
            let iso = this.normalizeDate(r['TANGGAL']);
            if (!iso || !iso.startsWith(selectedMonth)) return;

            let t1 = this.parseTime(r['PB_START']);
            let t2 = this.parseTime(r['TUNGGU_QC']);
            if (t1 && t2) {
                let diff = t1 - t2;
                // Handle day wrap? Assuming simple subtract for now as per request
                if (!dateMap[iso]) dateMap[iso] = { sum: 0, count: 0 };
                dateMap[iso].sum += diff;
                dateMap[iso].count++;
            }
        });

        // INTEGRATION: Add Container QC Wait Time
        this.containerData.forEach(r => {
            let iso = this.normalizeDate(r['TANGGAL']);
            if (!iso || !iso.startsWith(selectedMonth)) return;

            let t1 = this.parseTime(r['PB_START']);
            let t2 = this.parseTime(r['TUNGGU_QC']);
            if (t1 && t2) {
                let diff = t1 - t2;
                if (diff < 0) diff += 1440;
                if (!dateMap[iso]) dateMap[iso] = { sum: 0, count: 0 };
                dateMap[iso].sum += diff;
                dateMap[iso].count++;
            }
        });

        // Convert Map to Array & Average
        let processed = [];
        Object.keys(dateMap).sort().forEach(date => {
            let d = dateMap[date];
            let avg = Math.round(d.sum / d.count);
            processed.push({ date: date, val: avg });
        });

        let displayData = processed.map(p => p.val);
        let labels = processed.map(p => {
            // Return just Day Number
            let d = new Date(p.date);
            return d.getDate();
        });

        this.charts['tungguQC'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Avg Wait (Min)',
                    data: displayData,
                    borderColor: '#f43f5e',
                    borderWidth: 2,
                    pointBackgroundColor: '#f43f5e',
                    pointRadius: 4,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { display: true, ticks: { maxTicksLimit: 15 } }, y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } },
                plugins: { legend: { display: false } }
            }
        });
    },

    // Helper for Manpower
    calculateTotalManpower: function (targetMonth) {
        let allDates = new Set();
        let sources = [this.data.kuliBorong, this.data.kuliHarian];

        sources.forEach(src => {
            if (src && src.dateHeaders) {
                src.dateHeaders.forEach(h => {
                    let iso = this.normalizeDate(h);
                    // MUST be >= Feb 19, 2026 per user strict instruction
                    if (iso && iso >= '2026-02-19' && iso.startsWith(targetMonth)) allDates.add(iso);
                });
            }
        });

        // If no strict dates, rollback to any date in targetMonth to avoid unbroken UI
        if (allDates.size === 0) {
            sources.forEach(src => {
                if (src && src.dateHeaders) {
                    src.dateHeaders.forEach(h => {
                        let iso = this.normalizeDate(h);
                        if (iso && iso.startsWith(targetMonth)) allDates.add(iso);
                    });
                }
            });
        }

        let sortedDates = Array.from(allDates).sort().reverse();

        for (let date of sortedDates) {
            let borong = 0;
            let harian = 0;

            const countSource = (src) => {
                if (!src || !src.dateHeaders) return 0;
                let idx = -1;
                src.dateHeaders.forEach((h, i) => { if (this.normalizeDate(h) === date) idx = i; });
                if (idx === -1) return 0;
                let count = 0;
                src.rows.forEach(r => {
                    let val = r.absensi[idx];
                    if (val) {
                        let vStr = String(val).toLowerCase().trim();
                        if (['v', '✓', '1', 'x', 'hadir', 'yes', 'true'].includes(vStr)) count++;
                    }
                });
                return count;
            };

            borong = countSource(this.data.kuliBorong);
            harian = countSource(this.data.kuliHarian);

            if (borong + harian > 0) {
                return { total: borong + harian, borong: borong, harian: harian, date: date };
            }
        }

        return { total: 0, borong: 0, harian: 0, date: '-' };
    },

    // UTILS
    setSlicer: function (key, val) {
        if (key === 'opsDaily') {
            this.currentOpsPeriod = val;
            this.renderOpsDaily(val);
        }
        else if (key === 'sumBongkar') {
            this.currentSumBongkarPeriod = val;
            this.renderSummaryGudang('sumBongkar', 'BONGKAR', val);
        }
        else if (key === 'sumMuat') {
            this.currentSumMuatPeriod = val;
            this.renderSummaryGudang('sumMuat', 'MUAT', val);
        }
    },

    formatDateSimple: function (dateStr, period) {
        if (!dateStr || period !== 'daily') return dateStr;
        let d = new Date(dateStr);
        if (!isNaN(d.getTime())) return String(d.getDate()); // Return String
        return dateStr;
    },

    createEmptyGroup: function () {
        return { sum: { muat: 0, bongkar: 0, bongkarKulhar: 0, st_badrun: 0, st_kartono: 0, st_kulhar: 0, prod_badrun: 0, prod_kartono: 0, prod_kulhar: 0 }, count: 0, avg: {} };
    },

    aggregateItemToGroup: function (group, item) {
        group.count++;
        ['muat', 'bongkar', 'bongkarKulhar', 'st_badrun', 'st_kartono', 'st_kulhar', 'prod_badrun', 'prod_kartono', 'prod_kulhar'].forEach(k => {
            group.sum[k] += (Number(item[k]) || 0);
        });
    },

    groupDataByPeriod: function (items, mode) {
        let grouped = {};
        items.forEach(item => {
            let key = item.tanggal;
            if (mode === 'monthly_global') key = item.tanggal.substring(0, 7);
            if (!grouped[key]) grouped[key] = this.createEmptyGroup();
            this.aggregateItemToGroup(grouped[key], item);
        });

        // Calc Avgs
        for (let k in grouped) {
            let g = grouped[k];
            ['prod_badrun', 'prod_kartono', 'prod_kulhar'].forEach(f => g.avg[f] = Math.round(g.sum[f] / g.count));
        }
        return grouped;
    },

    parseTime: function (strVal) {
        if (!strVal) return null;
        let str = String(strVal);
        let h = 0, m = 0;
        if (str.includes(':')) {
            let parts = str.split(':');
            h = parseInt(parts[0]); m = parseInt(parts[1]);
            return (h * 60) + m;
        }
        return parseInt(str) || null;
    },

    normalizeDate: function (str) {
        if (!str) return null;

        // Handle "DD MMM" format (e.g. "01 JAN", "05 FEB")
        const monthMap = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
            'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };

        let s = String(str).trim().toUpperCase();
        
        // Handle ISO Direct (yyyy-mm-dd)
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

        let parts = s.split(' ');
        if (parts.length === 2 && monthMap[parts[1]]) {
            let day = parts[0].padStart(2, '0');
            let m = monthMap[parts[1]];
            let y = new Date().getFullYear();
            if (this.currentMonth) y = this.currentMonth.split('-')[0];
            return `${y}-${m}-${day}`;
        }

        // Handle dd-MMM-yyyy (e.g. "26-Mar-2026")
        let m2 = s.match(/^(\d{1,2})[\-\/\s\.](JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\-\/\s\.](\d{4})$/i);
        if (m2) {
            let day = m2[1].padStart(2, '0');
            let mon = monthMap[m2[2].toUpperCase().substring(0, 3)];
            let year = m2[3];
            return `${year}-${mon}-${day}`;
        }

        // Handle dd/MM/yyyy or dd.MM.yyyy
        let m3 = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
        if (m3) {
            let day = m3[1].padStart(2, '0');
            let mon = m3[2].padStart(2, '0');
            let year = m3[3];
            return `${year}-${mon}-${day}`;
        }

        let d = new Date(str);
        if (isNaN(d.getTime())) return null;
        
        // v20.2.4 TZ-Safe: Use individual components to avoid UTC shift
        let y = d.getFullYear();
        let m = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        
        // Check for 1899 glitch (common in cell time values)
        if (y < 1910) return null; 

        return `${y}-${m}-${day}`;
    },

    populateElements: function (id, dataList) {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '';
            dataList.forEach(m => {
                let label = m;
                try { label = new Date(m + "-01").toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(); } catch (e) { }
                let opt = document.createElement('option'); opt.value = m; opt.text = label; select.appendChild(opt);
            });
            if (select.options.length > 0) select.value = select.options[0].value;
        }
    },

    // ==========================================
    // CALENDAR MODULE (PORTED FROM BKK-DOWNTIME)
    // ==========================================
    generateCalendar: function () {
        const grid = document.getElementById('calendar-grid-v15');
        const monthLabel = document.getElementById('cal-month-year');
        if (!grid) return;

        let [year, month] = this.currentMonth.split('-');
        let d = new Date(year, parseInt(month) - 1, 1);

        let monthNameText = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
        if (monthLabel) monthLabel.innerText = monthNameText;

        // Prepare volume map per day
        let volMap = {};
        (this.data.dailyActivity || []).forEach(row => {
            if (row.tanggal && row.tanggal.startsWith(this.currentMonth)) {
                let dayNum = parseInt(row.tanggal.split('-')[2]);
                let b = Number(row.bongkar) || 0;
                let m = Number(row.muat) || 0;
                let s = (Number(row.st_badrun) || 0) + (Number(row.st_kartono) || 0) + (Number(row.st_kulhar) || 0);
                volMap[dayNum] = b + m + s;
            }
        });

        // INTEGRATION: Add Container Unloading to Calendar
        this.containerData.forEach(row => {
            let tgl = this.normalizeDate(row['TANGGAL']);
            if (tgl && tgl.startsWith(this.currentMonth)) {
                let dayNum = parseInt(tgl.split('-')[2]);
                let vol = parseFloat(row['NETTO_KG']) || 0;
                volMap[dayNum] = (volMap[dayNum] || 0) + vol;
            }
        });

        // Render Calendar
        let html = '';
        ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].forEach(d => {
            html += `<div style="font-family:'Orbitron'; font-size:0.6rem; text-align:center; color:var(--text-muted); padding:5px; text-transform:uppercase; letter-spacing:1px;">${d}</div>`;
        });

        let firstDay = new Date(year, parseInt(month) - 1, 1).getDay();
        let daysInMonth = new Date(year, parseInt(month), 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            html += `<div class="bento-card" style="opacity:0.2; pointer-events:none; min-height:60px;"></div>`;
        }

        for (let i = 1; i <= daysInMonth; i++) {
            let hasData = volMap[i] > 0;
            let valTon = hasData ? (volMap[i] / 1000) : 0;
            let valTonStr = valTon.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
            let displayVolHtml = hasData ? `<span class="cyber-value" style="color:#00f3ff; font-family:'Orbitron'; text-shadow:0 0 5px rgba(0,243,255,0.5);">${valTonStr}</span> <span class="cyber-unit" style="color:#fce7f3; text-shadow:0 0 8px #ec4899;">TON</span>` : "-";
            let isoDate = `${year}-${month}-${String(i).padStart(2, '0')}`;

            let bgStyle = hasData ? 'background: linear-gradient(145deg, rgba(6, 182, 212, 0.08), rgba(0,0,0,0.5)); border: 1px solid rgba(6, 182, 212, 0.3); box-shadow: 0 0 10px rgba(6, 182, 212, 0.1); cursor:pointer;' : 'opacity:0.4; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); cursor:default; min-height:60px; pointer-events:none;';
            let hoverClass = hasData ? 'onmouseover="this.style.boxShadow=\'0 0 20px rgba(6,182,212,0.4)\'; this.style.borderColor=\'var(--primary)\'; this.style.transform=\'scale(1.05)\'" onmouseout="this.style.boxShadow=\'0 0 10px rgba(6,182,212,0.1)\'; this.style.borderColor=\'rgba(6,182,212,0.3)\'; this.style.transform=\'scale(1)\'"' : '';

            // Premium top accent if has data
            let accent = hasData ? `<div style="position:absolute; top:0; left:0; width:100%; height:3px; background:linear-gradient(90deg, transparent, var(--primary), transparent); opacity:0.8;"></div>` : '';

            html += `
            <div class="bento-card" style="padding:4px; display:flex; flex-direction:column; justify-content:space-between; position:relative; overflow:hidden; border-radius:6px; ${bgStyle} transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);" ${hoverClass} onclick="${hasData ? `AnalysApp.showShiftAnalysis('${isoDate}', ${i})` : ''}">
                ${accent}
                <div style="font-family:'Orbitron'; font-size:0.8rem; font-weight:800; color:${hasData ? '#fff' : '#555'}; text-shadow: ${hasData ? '0 0 5px rgba(255,255,255,0.5)' : 'none'}; padding-left:2px;">${i}</div>
                <div style="font-family:'Rajdhani'; font-size:0.75rem; font-weight:700; color:var(--primary); text-align:right; margin-top:4px; text-shadow:0 0 5px rgba(6,182,212,0.4);">${displayVolHtml}</div>
            </div>
            `;
        }

        let styleInject = `
        <style>
            @keyframes cyber-pulse {
                0% { opacity: 0.8; text-shadow: 0 0 5px currentColor; filter: brightness(1); }
                50% { opacity: 1; text-shadow: 0 0 15px currentColor, 0 0 30px currentColor; filter: brightness(1.3); }
                100% { opacity: 0.8; text-shadow: 0 0 5px currentColor; filter: brightness(1); }
            }
            .cyber-value { animation: cyber-pulse 2s infinite ease-in-out; }
            .cyber-unit { font-size: 0.55rem; vertical-align: super; font-weight: 800; animation: cyber-pulse 1.5s infinite alternate; letter-spacing: 1px; }
            .table-row-hover { border-bottom:1px dashed rgba(255,255,255,0.05); transition: background 0.3s; }
            .table-row-hover:hover { background: rgba(255,255,255,0.05); }
        </style>
        `;

        grid.innerHTML = styleInject + html;

        // Auto-select first date with data
        let targetAuto = Object.keys(volMap).find(k => volMap[k] > 0);
        if (targetAuto) {
            let iso = `${year}-${month}-${String(targetAuto).padStart(2, '0')}`;
            this.showShiftAnalysis(iso, targetAuto);
        }
    },

    showShiftAnalysis: function (isoDate, dayNum) {
        document.getElementById('selected-date-label').innerText = `${dayNum} ${document.getElementById('cal-month-year').innerText}`;

        let container = document.getElementById('analysis-content-v15');

        // Robust matching: Try both normalized and raw string matching
        let related = (this.data.template || []).filter(r => {
            let d = r['TANGGAL'];
            if (!d) return false;
            let norm = this.normalizeDate(d);
            return norm === isoDate || String(d).startsWith(isoDate);
        });
        let dailyRec = (this.data.dailyActivity || []).find(r => r.tanggal === isoDate) || {};

        let bMats = {};
        let mMats = {};

        let totalDayVol = 0;
        related.forEach(r => {
            let keg = (r['KEGIATAN'] || r['JENIS KEGIATAN'] || '').toUpperCase();
            let mat = (r['JENIS_RM'] || r['JENIS RM'] || r['MATERIAL'] || 'UNKNOWN').toUpperCase();

            // Handle various NETTO column names
            let val = this.getUnloadingVol(r);

            if (keg.includes('BONGKAR')) {
                // AVOID DOUBLE COUNTING: 
                // convention: ContainerData usually covers RICE BRAN. Other materials come from V2 API.
                if (!mat.includes('RICE BRAN')) {
                    if (!bMats[mat]) bMats[mat] = 0;
                    bMats[mat] += val;
                    totalDayVol += val;
                }
            }
            else if (keg.includes('MUAT')) {
                let lok = (r['LOKASI'] || r['SLOC'] || 'UNKNOWN').toUpperCase();
                let key = `${mat} | ${lok}`;
                if (!mMats[key]) mMats[key] = 0;
                mMats[key] += val;
                totalDayVol += val;
            } else {
                totalDayVol += val;
            }
        });

        // INTEGRATION: Add Container Unloading to Daily Details (Source of Truth for Rice Bran)
        if (this.containerDataByDate && this.containerDataByDate[isoDate]) {
            this.containerDataByDate[isoDate].forEach(row => {
                let mat = (row['MATERIAL'] || 'RICE BRAN').toUpperCase();
                let vol = this.getUnloadingVol(row);
                let key = mat; 
                // We add everything from containerData. 
                // If there's RICE BRAN here and also in V2 template, the V2 loop (above) skips it to avoid double counting.
                if (!bMats[key]) bMats[key] = 0;
                bMats[key] += vol;
                totalDayVol += vol;
            });
        }

        let stBadrun = Number(dailyRec.st_badrun) || 0;
        let stKartono = Number(dailyRec.st_kartono) || 0;
        let stKulhar = Number(dailyRec.st_kulhar) || 0;
        let totalStapel = stBadrun + stKartono + stKulhar;
        totalDayVol += totalStapel;

        if (totalDayVol === 0 && stBadrun === 0 && stKartono === 0 && stKulhar === 0 && Object.keys(bMats).length === 0 && Object.keys(mMats).length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:50px; color:var(--text-muted);">No Operational Details Found for ${isoDate}</div>`;
            return;
        }

        let html = '<div style="display:flex; flex-direction:column; gap:15px; padding-bottom:10px;">';

        html += `
        <div style="background:rgba(6, 182, 212, 0.1); border:1px solid rgba(6, 182, 212, 0.3); border-radius:12px; padding:15px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 0 15px rgba(6,182,212,0.15);">
            <div style="font-family:'Orbitron'; color:#fff; font-size:0.8rem;">TOTAL HARIAN</div>
            <div style="font-family:'Orbitron'; color:var(--primary); font-size:1.4rem; font-weight:800; text-shadow:0 0 10px rgba(6,182,212,0.5);">${(totalDayVol / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} TON</div>
        </div>
        `;

        // 1. BONGKARAN
        html += `
        <div style="background:linear-gradient(135deg, rgba(15,23,42,0.9), rgba(0,0,0,0.8)); border-radius:8px; padding:10px; border-left:3px solid var(--primary); box-shadow:0 2px 10px rgba(0,0,0,0.3); position:relative;">
            <div style="font-family:'Orbitron'; font-size:0.75rem; color:var(--primary); margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; display:flex; align-items:center; gap:6px; text-shadow:0 0 5px rgba(6,182,212,0.5);">
                <i class="fas fa-truck-loading" class="cyber-value"></i> BONGKARAN
            </div>
            <table style="width:100%; font-family:'Inter', sans-serif; font-size:0.7rem; border-collapse:collapse;">
        `;
        let bTotal = 0;
        let bKeys = Object.keys(bMats);
        if (bKeys.length > 0) {
            bKeys.forEach(m => {
                bTotal += bMats[m];
                html += `
                <tr class="table-row-hover">
                    <td style="padding:4px 2px; color:#cbd5e1; font-weight:500;">${m}</td>
                    <td style="padding:4px 2px; text-align:right; color:#06b6d4; font-weight:700; font-family:'Rajdhani';" class="cyber-value">${(bMats[m] / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#00f3ff; font-weight:600;">TON</span></td>
                </tr>`;
            });
            html += `
            <tr style="border-top:1px dashed rgba(6,182,212,0.3); background:rgba(6,182,212,0.05);">
                <td style="padding:6px 2px; color:#fff; font-weight:700; font-family:'Orbitron'; font-size:0.65rem; letter-spacing:1px;">SUBTOTAL</td>
                <td style="padding:6px 2px; text-align:right; color:#00f3ff; font-weight:800; font-family:'Rajdhani'; font-size:0.9rem;" class="cyber-value">${(bTotal / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#00f3ff;">TON</span></td>
            </tr>`;
        } else {
            html += `<tr><td style="padding:4px 2px; color:var(--text-muted); font-style:italic; font-size:0.65rem;">Tidak ada data bongkar</td></tr>`;
        }
        html += `</table></div>`;

        // 2. MUAT
        html += `
        <div style="background:linear-gradient(135deg, rgba(15,23,42,0.9), rgba(0,0,0,0.8)); border-radius:8px; padding:10px; border-left:3px solid var(--secondary); box-shadow:0 2px 10px rgba(0,0,0,0.3); position:relative;">
            <div style="font-family:'Orbitron'; font-size:0.75rem; color:var(--secondary); margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; display:flex; align-items:center; gap:6px; text-shadow:0 0 5px rgba(16,185,129,0.5);">
                <i class="fas fa-dolly" class="cyber-value"></i> MUAT
            </div>
            <table style="width:100%; font-family:'Inter', sans-serif; font-size:0.7rem; border-collapse:collapse;">
        `;
        let mTotal = 0;
        let mKeys = Object.keys(mMats);
        if (mKeys.length > 0) {
            mKeys.forEach(k => {
                let pts = k.split(' | ');
                mTotal += mMats[k];
                html += `
                <tr class="table-row-hover">
                    <td style="padding:4px 2px;">
                        <span style="color:#cbd5e1; font-weight:500;">${pts[0]}</span>
                        <span style="color:var(--secondary); font-size:0.6rem; margin-left:6px;"><i class="fas fa-map-marker-alt"></i> ${pts[1]}</span>
                    </td>
                    <td style="padding:4px 2px; text-align:right; color:var(--secondary); font-weight:700; font-family:'Rajdhani';" class="cyber-value">${(mMats[k] / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#a7f3d0; font-weight:600;">TON</span></td>
                </tr>`;
            });
            html += `
            <tr style="border-top:1px dashed rgba(16,185,129,0.3); background:rgba(16,185,129,0.05);">
                <td style="padding:6px 2px; color:#fff; font-weight:700; font-family:'Orbitron'; font-size:0.65rem; letter-spacing:1px;">SUBTOTAL</td>
                <td style="padding:6px 2px; text-align:right; color:#10b981; font-weight:800; font-family:'Rajdhani'; font-size:0.9rem;" class="cyber-value">${(mTotal / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#a7f3d0;">TON</span></td>
            </tr>`;
        } else {
            html += `<tr><td style="padding:4px 2px; color:var(--text-muted); font-style:italic; font-size:0.65rem;">Tidak ada data muat</td></tr>`;
        }
        html += `</table></div>`;

        // 3. STAPEL
        html += `
        <div style="background:linear-gradient(135deg, rgba(15,23,42,0.9), rgba(0,0,0,0.8)); border-radius:8px; padding:10px; border-left:3px solid var(--accent); box-shadow:0 2px 10px rgba(0,0,0,0.3); position:relative;">
            <div style="font-family:'Orbitron'; font-size:0.75rem; color:var(--accent); margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; display:flex; align-items:center; gap:6px; text-shadow:0 0 5px rgba(139,92,246,0.5);">
                <i class="fas fa-layer-group" class="cyber-value"></i> STAPEL
            </div>
            <table style="width:100%; font-family:'Inter', sans-serif; font-size:0.7rem; border-collapse:collapse;">
        `;
        if (totalStapel > 0) {
            html += `
            <tr class="table-row-hover">
                <td style="padding:4px 2px; color:#cbd5e1; font-weight:500;">BADRUN</td>
                <td style="padding:4px 2px; text-align:right; color:var(--accent); font-weight:700; font-family:'Rajdhani';" class="cyber-value">${(stBadrun / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#ddd6fe; font-weight:600;">TON</span></td>
            </tr>
            <tr class="table-row-hover">
                <td style="padding:4px 2px; color:#cbd5e1; font-weight:500;">KARTONO</td>
                <td style="padding:4px 2px; text-align:right; color:var(--accent); font-weight:700; font-family:'Rajdhani';" class="cyber-value">${(stKartono / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#ddd6fe; font-weight:600;">TON</span></td>
            </tr>
            <tr class="table-row-hover">
                <td style="padding:4px 2px; color:#cbd5e1; font-weight:500;">KULHAR</td>
                <td style="padding:4px 2px; text-align:right; color:var(--accent); font-weight:700; font-family:'Rajdhani';" class="cyber-value">${(stKulhar / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#ddd6fe; font-weight:600;">TON</span></td>
            </tr>`;
            html += `
            <tr style="border-top:1px dashed rgba(139,92,246,0.3); background:rgba(139,92,246,0.05);">
                <td style="padding:6px 2px; color:#fff; font-weight:700; font-family:'Orbitron'; font-size:0.65rem; letter-spacing:1px;">SUBTOTAL</td>
                <td style="padding:6px 2px; text-align:right; color:#8b5cf6; font-weight:800; font-family:'Rajdhani'; font-size:0.9rem;" class="cyber-value">${(totalStapel / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span class="cyber-unit" style="color:#ddd6fe;">TON</span></td>
            </tr>`;
        } else {
            html += `<tr><td style="padding:4px 2px; color:var(--text-muted); font-style:italic; font-size:0.65rem;">Tidak ada data stapel</td></tr>`;
        }
        html += `</table></div>`;

        html += '</div>';

        container.innerHTML = html;
        container.style.animation = 'none';
        container.offsetHeight; // trigger reflow
        container.style.animation = 'fadeIn 0.5s ease-out forwards';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AnalysApp.init();
});
