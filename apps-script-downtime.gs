/**
 * SMART WAREHOUSE V2.0 - DOWNTIME SUBMISSION & WEBVIEW API
 * 1. Simpan data ke Google Sheets (DATA BONGKARAN / DATA MUAT)
 * 2. Menampilkan Form Input di HP (doGet)
 */

const SHEET_NAME = "DATA BONGKARAN"; 
const MUAT_SHEET_NAME = "DATA MUAT";
const SESSION_SHEET = "SESSIONS";
const RM_STOCK_SHEET = "RM STOCK";

const MASTER_HEADERS = [
  "Tanggal", "Shift", "Gudang/Intake", "SLoc", "Material", 
  "Lokasi Simpan", "Nopol", "Jenis Truck", "Netto (Kg)", "Krani Bongkar",
  "Sampling Man", "Koordinator Monitoring", "Jenis Kuli", "Tim Kerja",
  "Start Panggil", "Truck Ready", "Start Bongkar", 
  "Hold QC", "Re-start QC", "Manuver Akhir", "Finish", 
  "Tenaga Bongkar", "Backend Timestamp",
  "Arrival Date", "Arrival Time", "QC Sampling 1 Time", "Time Timbang Masuk",
  "Gudang Durasi", "Jumlah Bag" 
];

// v20.0.0 DEFINITIF: Harus sinkron dengan saveMuat dan Row 1 Spreadsheet
const MUAT_HEADERS = [
  "Timestamp", "Tanggal", "Shift", "Kategori", "Nopol",        // A, B, C, D, E (Index 0-4)
  "Material", "Netto (Kg)", "Jumlah Bag", "Tim Harian", "Jumlah Kuli", // F, G, H, I, J (Index 5-9)
  "Nama Krani", "Bongkar Stapel", "Start Muat", "Finish", "OTW Pabrik", // K, L, M, N, O (Index 10-14)
  "Status Validasi", "Validator", "SYSTEM_VERSION", "Gudang Muat"       // P, Q, R, S (Index 15-18)
];

// v20.2.0 Helper: Format time cell to HH:MM string
function fmtTime(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
  }
  let s = String(val).trim();
  if (s.includes(':')) return s;
  return null;
}

// v20.2.0 Helper: Calculate duration in minutes between two time cells
function calcDurMin(startVal, endVal) {
  const toMin = (v) => {
    if (!v) return null;
    if (v instanceof Date) { return v.getHours() * 60 + v.getMinutes(); }
    let s = String(v).trim();
    if (s.includes(':')) { let p = s.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); }
    return null;
  };
  const s = toMin(startVal), e = toMin(endVal);
  if (s === null || e === null) return null;
  let diff = e - s;
  if (diff < 0) diff += 1440; // day wrap
  return String(diff);
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  forceMuatHeaders();

  // 0. Action: Master Data (v19.9 Deployment Intelligence)
  if (e && e.parameter.action === 'getData') {
    let sheet = ss.getSheetByName(SHEET_NAME);
    let sSheet = ss.getSheetByName(SESSION_SHEET);
    let rmStockSheet = ss.getSheetByName(RM_STOCK_SHEET);
    let mSheet = ss.getSheetByName(MUAT_SHEET_NAME);
    
    let coords = ["ADE YANTO", "SAFII", "HADI"];
    let activeSessions = [];
    let warehouses = ["RM", "INTAKE 71", "BKK", "CPO"];
    let materials = [{name: "CORN"}, {name: "SOYBEAN"}, {name: "POLLARD"}, {name: "MBM"}, {name: "CPO"}, {name: "RM"}];
    
    // 1. Fetch All Downtime Data for Analysis
    // v19.1: Handle empty sheet scenario gracefully
    let downtimeData = [];
    if (sheet) {
      downtimeData = sheet.getDataRange().getValues();
    }
    
    // v20.0.1 Global Dynamic Indexing for Data Bongkaran
    const bHeaders = downtimeData.length > 0 ? downtimeData[0].map(h => String(h).toUpperCase()) : [];
    const idx = {
      tanggal: bHeaders.indexOf("TANGGAL"),
      shift: bHeaders.indexOf("SHIFT"),
      gudang: bHeaders.indexOf("GUDANG/INTAKE"),
      sloc: bHeaders.indexOf("SLOC"),
      material: bHeaders.indexOf("MATERIAL"),
      nopol: bHeaders.indexOf("NOPOL"),
      truck: bHeaders.indexOf("JENIS TRUCK"),
      netto: bHeaders.indexOf("NETTO (KG)"),
      sampling: bHeaders.indexOf("SAMPLING MAN"),
      krani: bHeaders.indexOf("KRANI BONGKAR"),
      coord: bHeaders.indexOf("KOORDINATOR MONITORING"),
      arrival_date: bHeaders.indexOf("ARRIVAL DATE"),
      arrival_time: bHeaders.indexOf("ARRIVAL TIME"),
      qc_time: bHeaders.indexOf("QC SAMPLING 1 TIME"),
      timbang_time: bHeaders.indexOf("TIME TIMBANG MASUK")
    };

    // Robust Fallbacks (based on MASTER_HEADERS v20)
    if (idx.tanggal === -1) idx.tanggal = 0; if (idx.shift === -1) idx.shift = 1;
    if (idx.gudang === -1) idx.gudang = 2; if (idx.sloc === -1) idx.sloc = 3;
    if (idx.material === -1) idx.material = 4; if (idx.nopol === -1) idx.nopol = 6;
    if (idx.truck === -1) idx.truck = 7; if (idx.netto === -1) idx.netto = 8;
    if (idx.sampling === -1) idx.sampling = 10; if (idx.krani === -1) idx.krani = 9;
    if (idx.coord === -1) idx.coord = 11; if (idx.arrival_date === -1) idx.arrival_date = 23;
    if (idx.arrival_time === -1) idx.arrival_time = 24; if (idx.qc_time === -1) idx.qc_time = 25;
    if (idx.timbang_time === -1) idx.timbang_time = 26;

  // Calculate pending status for sessions
  if (sSheet) {
    const sData = sSheet.getDataRange().getValues();
    // v18.10 Skip row 0 if it's "Krani" header
    for (let i = 0; i < sData.length; i++) {
        const rawName = String(sData[i][0]).trim();
        if (rawName.toUpperCase() === "KRANI" || !rawName) continue;
        
        const kraniName = rawName.toUpperCase();
        const coordName = String(sData[i][3]).trim().toUpperCase();
        
        let hasPendingKrani = false;
        let hasPendingCoord = false;

        if (downtimeData.length > 0) {
            for (let j = 0; j < downtimeData.length; j++) {
            const rowKrani = String(downtimeData[j][idx.krani] || "").trim().toUpperCase();
            const rowCoord = String(downtimeData[j][idx.coord] || "").trim().toUpperCase();
            
            // Rule 7: Krani pending if Netto is missing/0/-/blank
            if (rowKrani === kraniName) {
                const nettoValue = String(downtimeData[j][idx.netto] || "").trim();
                if (!nettoValue || nettoValue === "-" || nettoValue === "0" || nettoValue === "") hasPendingKrani = true;
            }

            // Rule 8: Coordinator pending if Arrival/QC/Timbang missing
            if (rowCoord === coordName) {
                const rowArrival = String(downtimeData[j][idx.arrival_date] || "").trim();
                const rowTimeArr = String(downtimeData[j][idx.arrival_time] || "").trim();
                const rowQC = String(downtimeData[j][idx.qc_time] || "").trim();
                const rowTimbang = String(downtimeData[j][idx.timbang_time] || "").trim();
                if (!rowArrival || !rowTimeArr || !rowQC || !rowTimbang || rowArrival === "-" || rowArrival === "" || rowQC === "-") hasPendingCoord = true;
            }
            
            if (hasPendingKrani && hasPendingCoord) break;
            }
        }

        activeSessions.push({
          krani: sData[i][0], shift: sData[i][1], gudang: sData[i][2],
          coordinator: sData[i][3], sampling: sData[i][4],
          tim_borong: sData[i][5], tim_harian: sData[i][6],
          hasPending: hasPendingKrani,
          hasPendingKrani: hasPendingKrani,
          hasPendingCoord: hasPendingCoord
        });
    }
  }

  // v18.12 Data Mining for Resume (Direct Scan)
  const pendingKranis = new Set();
  const pendingCoords = new Set();

  // Scan Downtime Data for any pending tasks (ignoring sessions)
  if (downtimeData.length > 0) {
    for (let i = 0; i < downtimeData.length; i++) {
        const row = downtimeData[i];
        // Skip header row if detected (usually checked by date/shift validation or just manual skip)
        if (String(row[0]).toUpperCase().includes("TANGGAL")) continue;

        const kName = String(row[idx.krani] || "").trim().toUpperCase();
        const nettoValue = String(row[idx.netto] || "").trim();
        
        // Rule 7: Krani Pending (v20.0.3: Netto in I/Index 8, Krani in J/Index 9)
        if (kName && kName.length > 2 && kName !== "KRANI" && kName !== "KRANI BONGKAR") {
            if (!nettoValue || nettoValue === "0" || nettoValue === "-" || nettoValue === "") pendingKranis.add(kName);
        }

        const cName = String(row[idx.coord] || "").trim().toUpperCase();
        const truckType = String(row[idx.truck] || "").trim().toUpperCase();
        
        // v18.15 Safety: Handle undefined columns for new fields (X,Y,Z,AA)
        // If row[idx] is undefined, default to "" to trigger pending check
        const arrD = (row[idx.arrival_date] === undefined) ? "" : String(row[idx.arrival_date]).trim();
        const arrT = (row[idx.arrival_time] === undefined) ? "" : String(row[idx.arrival_time]).trim();
        const qcT = (row[idx.qc_time] === undefined) ? "" : String(row[idx.qc_time]).trim();
        const timT = (row[idx.timbang_time] === undefined) ? "" : String(row[idx.timbang_time]).trim();

        // Rule 8: Coordinator Pending (ONLY FOR CONTAINER)
        if (cName && cName.length > 2 && cName !== "KOODINATOR") {
            // v18.14: Check if Container (20FT/40FT)
            if (truckType.includes("CONTAINER")) {
                if (!arrD || arrD === "-" || !arrT || !qcT || !timT) pendingCoords.add(cName);
            }
        }
    }
  }

    // 2. Fetch Dynamic Data from RM STOCK
    if (rmStockSheet) {
      const rmData = rmStockSheet.getDataRange().getValues();
      const rmHeaders = rmData[0].map(h => String(h).trim().toUpperCase());
      const mIdx = rmHeaders.indexOf("MATERIAL");
      const gIdx = rmHeaders.indexOf("GUDANG");
      
      if (mIdx !== -1) {
        const rawM = rmData.slice(1).map(r => String(r[mIdx]).trim()).filter(n => n && n.length > 1);
        materials = [...new Set(rawM)].sort().map(m => ({ name: m }));
      }
      if (gIdx !== -1) {
        const rawG = rmData.slice(1).map(r => String(r[gIdx]).trim()).filter(n => n && n.length > 1);
        warehouses = [...new Set(rawG)].sort();
      }
    }

    // v19.9.6: Scan for pending data using dynamic indexing
    const pendingMuats = new Set();
    if (mSheet && mSheet.getLastRow() > 0) {
      const mData = mSheet.getDataRange().getValues();
      const mHeaders = mData[0].map(h => String(h).toUpperCase());
      const kIdx = mHeaders.indexOf("NAMA KRANI");
      const nIdx = mHeaders.indexOf("NETTO (KG)");
      
      const finalK = (kIdx !== -1) ? kIdx : 10; // v20.0.1: K=10
      const finalN = (nIdx !== -1) ? nIdx : 6;  // G=6

      for (let i = 1; i < mData.length; i++) {
        const row = mData[i];
        const kraniName = String(row[finalK] || "").trim().toUpperCase();
        const nettoVal = String(row[finalN] || "").trim();
        if (kraniName && kraniName.length > 2 && kraniName !== "NAMA KRANI") {
          if (!nettoVal || nettoVal === "-" || nettoVal === "0" || nettoVal === "") {
             pendingMuats.add(kraniName);
          }
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      warehouses: warehouses,
      coordinators: coords,
      activeSessions: activeSessions,
      pendingKranis: Array.from(pendingKranis).sort(),
      pendingMuats: Array.from(pendingMuats).sort(),
      pendingCoords: Array.from(pendingCoords).sort(),
      materials: materials
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===== ACTION: getAnalyticsV2 (v20.2.0 Migrasi Analitik Maret 2026+) =====
  if (e && e.parameter.action === 'getAnalyticsV2') {
    try {
      const bSheet = ss.getSheetByName(SHEET_NAME);        // DATA BONGKARAN
      const mSheet2 = ss.getSheetByName(MUAT_SHEET_NAME);  // DATA MUAT
      const absSheet = ss.getSheetByName("ABSENSI KULI");
      const stSheet = ss.getSheetByName("DATA STAPEL");

      // ----- 1. MINE DATA BONGKARAN → dailyActivity + template -----
      const dailyMap = {};  // tanggal → {muat, bongkar, st_*, prod_*}
      const templateRows = [];

      if (bSheet && bSheet.getLastRow() > 1) {
        const bData = bSheet.getDataRange().getValues();
        const bH = bData[0].map(h => String(h).toUpperCase());
        const bIdx = {
          tanggal: bH.indexOf("TANGGAL"),
          material: bH.indexOf("MATERIAL"),
          netto: bH.findIndex(h => h.includes("NETTO")),
          gudang: bH.findIndex(h => h.includes("GUDANG")),
          tim: bH.findIndex(h => h.includes("TIM KERJA")),
          jenisKuli: bH.findIndex(h => h.includes("JENIS KULI")),
          startPanggil: bH.findIndex(h => h.includes("START PANGGIL")),
          truckReady: bH.findIndex(h => h.includes("TRUCK READY")),
          startBongkar: bH.findIndex(h => h.includes("START BONGKAR")),
          holdQC: bH.findIndex(h => h.includes("HOLD QC")),
          restartQC: bH.findIndex(h => h.includes("RE-START")),
          manuverAkhir: bH.findIndex(h => h.includes("MANUVER")),
          finish: bH.findIndex(h => h.includes("FINISH")),
          nopol: bH.indexOf("NOPOL"),
          lokasiSimpan: bH.findIndex(h => h.includes("LOKASI SIMPAN")),
          truck: bH.findIndex(h => h.includes("TRUCK")),
          arrivalDate: bH.findIndex(h => h.includes("ARRIVAL DATE")),
          arrivalTime: bH.findIndex(h => h.includes("ARRIVAL TIME")),
          qcTime: bH.findIndex(h => h.includes("QC SAMPLING 1 TIME")),
          timbangTime: bH.findIndex(h => h.includes("TIME TIMBANG MASUK"))
        };

        for (let i = 1; i < bData.length; i++) {
          const row = bData[i];
          let tgl = row[bIdx.tanggal];
          if (!tgl) continue;
          if (tgl instanceof Date) tgl = Utilities.formatDate(tgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          else tgl = String(tgl).trim();

          const netto = Number(row[bIdx.netto]) || 0;
          const tim = String(row[bIdx.tim] || "").toUpperCase().trim();
          const material = String(row[bIdx.material] || "");
          const gudang = String(row[bIdx.gudang >= 0 ? bIdx.gudang : 2] || "");
          
          // Template row (per-truck detail)
          templateRows.push({
            TANGGAL: tgl,
            JENIS_RM: material,
            JENIS_TRUCK: String(row[bIdx.truck >= 0 ? bIdx.truck : 7] || ""),
            KEGIATAN: "BONGKAR",
            LOKASI: gudang,
            NOPOL: String(row[bIdx.nopol >= 0 ? bIdx.nopol : 6] || ""),
            REAL_BONGKAR_MT: netto,
            ARRIVAL_DATE: String(row[bIdx.arrivalDate >= 0 ? bIdx.arrivalDate : 23] || ""),
            ARRIVAL_TIME: fmtTime(row[bIdx.arrivalTime >= 0 ? bIdx.arrivalTime : 24]),
            QC_SAMPLING_1: fmtTime(row[bIdx.qcTime >= 0 ? bIdx.qcTime : 25]),
            TIME_TIMBANG_MASUK: fmtTime(row[bIdx.timbangTime >= 0 ? bIdx.timbangTime : 26]),
            START_PANGGIL: fmtTime(row[bIdx.startPanggil]),
            TRUCK_READY: fmtTime(row[bIdx.truckReady]),
            START_BONGKAR: fmtTime(row[bIdx.startBongkar]),
            HOLD_QC: fmtTime(row[bIdx.holdQC]),
            RESTART_QC: fmtTime(row[bIdx.restartQC]),
            MANUVER_AKHIR: fmtTime(row[bIdx.manuverAkhir]),
            FINISH_TIME: fmtTime(row[bIdx.finish]),
            DURASI_BONGKAR: calcDurMin(row[bIdx.startBongkar], row[bIdx.finish]),
            PB_START: fmtTime(row[bIdx.startPanggil]),
            TUNGGU_QC: fmtTime(row[bIdx.holdQC])
          });

          // Daily aggregation
          if (!dailyMap[tgl]) dailyMap[tgl] = { 
            tanggal: tgl, bongkar: 0, muat: 0, 
            st_badrun: 0, st_kartono: 0, st_kulhar: 0,
            prod_badrun: 0, prod_kartono: 0, prod_kulhar: 0, 
            _bCount: { BADRUN: 0, KARTONO: 0, KULHAR: 0 },
            _bNetto: { BADRUN: 0, KARTONO: 0, KULHAR: 0 }
          };
          dailyMap[tgl].bongkar += netto;

          // Productivity per-tim aggregation
          if (tim === "BADRUN") { dailyMap[tgl]._bNetto.BADRUN += netto; dailyMap[tgl]._bCount.BADRUN++; }
          else if (tim === "KARTONO") { dailyMap[tgl]._bNetto.KARTONO += netto; dailyMap[tgl]._bCount.KARTONO++; }
          else { dailyMap[tgl]._bNetto.KULHAR += netto; dailyMap[tgl]._bCount.KULHAR++; }
        }
      }

      // ----- 2. MINE DATA MUAT → add muat to dailyMap -----
      if (mSheet2 && mSheet2.getLastRow() > 1) {
        const mData = mSheet2.getDataRange().getValues();
        const mH = mData[0].map(h => String(h).toUpperCase());
        const mTanggal = mH.indexOf("TANGGAL") >= 0 ? mH.indexOf("TANGGAL") : 1;
        const mNetto = mH.findIndex(h => h.includes("NETTO"));
        const mKat = mH.indexOf("KATEGORI") >= 0 ? mH.indexOf("KATEGORI") : 3;
        const mMaterial = mH.indexOf("MATERIAL") >= 0 ? mH.indexOf("MATERIAL") : 5;
        const mGudang = mH.indexOf("GUDANG MUAT") >= 0 ? mH.indexOf("GUDANG MUAT") : 18; // S=18

        for (let i = 1; i < mData.length; i++) {
          let tgl = mData[i][mTanggal];
          if (!tgl) continue;
          if (tgl instanceof Date) tgl = Utilities.formatDate(tgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          else tgl = String(tgl).trim();

          const netto = Number(mData[i][mNetto >= 0 ? mNetto : 6]) || 0;
          if (!dailyMap[tgl]) dailyMap[tgl] = { 
            tanggal: tgl, bongkar: 0, muat: 0, 
            st_badrun: 0, st_kartono: 0, st_kulhar: 0,
            prod_badrun: 0, prod_kartono: 0, prod_kulhar: 0,
            _bCount: { BADRUN: 0, KARTONO: 0, KULHAR: 0 },
            _bNetto: { BADRUN: 0, KARTONO: 0, KULHAR: 0 }
          };
          dailyMap[tgl].muat += netto;

          // MUAT template entries
          templateRows.push({
            TANGGAL: tgl, JENIS_RM: String(mData[i][mMaterial] || ""), KEGIATAN: "MUAT",
            REAL_BONGKAR_MT: netto,
            LOKASI: String(mData[i][mGudang >= 0 ? mGudang : 18] || "RM"), 
            DURASI_BONGKAR: null, PB_START: null, TUNGGU_QC: null
          });
        }
      }

      // ----- 3. MINE DATA STAPEL → add to dailyMap -----
      if (stSheet && stSheet.getLastRow() > 1) {
        const sData = stSheet.getDataRange().getValues();
        const sH = sData[0].map(h => String(h).toUpperCase());
        const sTgl = sH.indexOf("TANGGAL") >= 0 ? sH.indexOf("TANGGAL") : 1;
        const sTim = sH.indexOf("TIM") >= 0 ? sH.indexOf("TIM") : 3;
        const sKat = sH.indexOf("KATEGORI") >= 0 ? sH.indexOf("KATEGORI") : 4;
        const sNetto = sH.findIndex(h => h.includes("NETTO"));

        for (let i = 1; i < sData.length; i++) {
          let tgl = sData[i][sTgl];
          if (!tgl) continue;
          if (tgl instanceof Date) tgl = Utilities.formatDate(tgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          else tgl = String(tgl).trim();

          const tim = String(sData[i][sTim] || "").toUpperCase().trim();
          const netto = Number(sData[i][sNetto >= 0 ? sNetto : 5]) || 0;

          if (!dailyMap[tgl]) dailyMap[tgl] = {
            tanggal: tgl, bongkar: 0, muat: 0,
            st_badrun: 0, st_kartono: 0, st_kulhar: 0,
            prod_badrun: 0, prod_kartono: 0, prod_kulhar: 0,
            _bCount: { BADRUN: 0, KARTONO: 0, KULHAR: 0 },
            _bNetto: { BADRUN: 0, KARTONO: 0, KULHAR: 0 }
          };

          if (tim === "BADRUN") dailyMap[tgl].st_badrun += netto;
          else if (tim === "KARTONO") dailyMap[tgl].st_kartono += netto;
          else dailyMap[tgl].st_kulhar += netto;
        }
      }

      // ----- 4. MINE ABSENSI KULI → kuliBorong & kuliHarian -----
      let kuliBorong = { dateHeaders: [], rows: [] };
      let kuliHarian = { dateHeaders: [], rows: [] };

      if (absSheet && absSheet.getLastRow() > 1) {
        const aData = absSheet.getDataRange().getValues();
        const aH = aData[0].map(h => String(h).toUpperCase());
        const aTgl = aH.indexOf("TANGGAL") >= 0 ? aH.indexOf("TANGGAL") : 1;
        const aTim = aH.indexOf("TIM") >= 0 ? aH.indexOf("TIM") : 3;
        const aKat = aH.indexOf("KATEGORI") >= 0 ? aH.indexOf("KATEGORI") : 4;
        const aNama = aH.indexOf("NAMA") >= 0 ? aH.indexOf("NAMA") : 5;
        const aStatus = aH.indexOf("STATUS") >= 0 ? aH.indexOf("STATUS") : 6;

        // Group by kategori → {dates, people}
        const borongMap = {}; // nama → { tim, dates: { tgl: status } }
        const harianMap = {};
        const allBorongDates = new Set();
        const allHarianDates = new Set();

        for (let i = 1; i < aData.length; i++) {
          const row = aData[i];
          let tgl = row[aTgl];
          if (!tgl) continue;
          if (tgl instanceof Date) tgl = Utilities.formatDate(tgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          else tgl = String(tgl).trim();

          const nama = String(row[aNama] || "").trim();
          const tim = String(row[aTim] || "").trim();
          const kat = String(row[aKat] || "").toUpperCase().trim();
          const status = String(row[aStatus] || "H").toUpperCase().trim();
          const isHadir = (status === "H");

          if (kat === "BORONG") {
            allBorongDates.add(tgl);
            if (!borongMap[nama]) borongMap[nama] = { tim: tim, dates: {} };
            borongMap[nama].dates[tgl] = isHadir ? "v" : "";
          } else {
            allHarianDates.add(tgl);
            if (!harianMap[nama]) harianMap[nama] = { tim: tim, dates: {} };
            harianMap[nama].dates[tgl] = isHadir ? "v" : "";
          }
        }

        // Convert to old format: dateHeaders + rows[{tim, absensi[]}]
        const borongDates = Array.from(allBorongDates).sort();
        const harianDates = Array.from(allHarianDates).sort();

        kuliBorong.dateHeaders = borongDates;
        Object.entries(borongMap).forEach(([nama, d]) => {
          kuliBorong.rows.push({ tim: d.tim, nama: nama, absensi: borongDates.map(dt => d.dates[dt] || "") });
        });

        kuliHarian.dateHeaders = harianDates;
        Object.entries(harianMap).forEach(([nama, d]) => {
          kuliHarian.rows.push({ tim: d.tim, nama: nama, absensi: harianDates.map(dt => d.dates[dt] || "") });
        });

        // ----- Inject manpower into productivity (prod_xxx = netto / hadir count) -----
        // Count hadir per day per tim category
        for (let i = 1; i < aData.length; i++) {
          let tgl = aData[i][aTgl];
          if (!tgl) continue;
          if (tgl instanceof Date) tgl = Utilities.formatDate(tgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          else tgl = String(tgl).trim();
          
          const tim = String(aData[i][aTim] || "").toUpperCase().trim();
          const status = String(aData[i][aStatus] || "H").toUpperCase().trim();
          if (status !== "H") continue;

          if (dailyMap[tgl]) {
            if (tim === "BADRUN") dailyMap[tgl]._bCount.BADRUN++;
            else if (tim === "KARTONO") dailyMap[tgl]._bCount.KARTONO++;
            else dailyMap[tgl]._bCount.KULHAR++;
          }
        }
      }

      // ----- 5. FINALIZE dailyActivity: calculate productivity -----
      const dailyActivity = Object.values(dailyMap).map(d => {
        // Productivity = Total Netto Bongkar per Tim / Jumlah Hadir per Tim
        d.prod_badrun = d._bCount.BADRUN > 0 ? Math.round(d._bNetto.BADRUN / d._bCount.BADRUN) : 0;
        d.prod_kartono = d._bCount.KARTONO > 0 ? Math.round(d._bNetto.KARTONO / d._bCount.KARTONO) : 0;
        d.prod_kulhar = d._bCount.KULHAR > 0 ? Math.round(d._bNetto.KULHAR / d._bCount.KULHAR) : 0;
        delete d._bCount; delete d._bNetto;
        return d;
      });

      return ContentService.createTextOutput(JSON.stringify({
        dailyActivity: dailyActivity,
        template: templateRows,
        kuliBorong: kuliBorong,
        kuliHarian: kuliHarian
      })).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({
        error: err.toString(), dailyActivity: [], template: [], kuliBorong: { dateHeaders: [], rows: [] }, kuliHarian: { dateHeaders: [], rows: [] }
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // v19.4: Action for Manual Risip Filtering (Crosscheck)
  if (e && e.parameter.action === 'getManualRisip') {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(MUAT_SHEET_NAME);
      if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(h => String(h).toUpperCase());
      
      const idx = {
        kategori: headers.indexOf("KATEGORI"),
        nopol: headers.indexOf("NOPOL"),
        status: headers.indexOf("STATUS VALIDASI"),
        tanggal: headers.indexOf("TANGGAL"),
        material: headers.indexOf("MATERIAL")
      };

      // v20.0.2 Fallback Robust (Loose Lookup)
      if (idx.kategori === -1) idx.kategori = headers.findIndex(h => h.includes("KATEGORI"));
      if (idx.nopol === -1) idx.nopol = headers.findIndex(h => h.includes("NOPOL"));
      if (idx.material === -1) idx.material = headers.findIndex(h => h.includes("MATERIAL"));
      if (idx.status === -1) idx.status = headers.findIndex(h => h.includes("STATUS"));
      if (idx.tanggal === -1) idx.tanggal = headers.findIndex(h => h.includes("TANGGAL"));

      // Secondary Fallbacks (Hardcoded v20)
      if (idx.kategori === -1) idx.kategori = 3; 
      if (idx.nopol === -1) idx.nopol = 4;
      if (idx.material === -1) idx.material = 5;
      if (idx.status === -1) idx.status = 15;
      if (idx.tanggal === -1) idx.tanggal = 1;

      const results = [];
      // Loop data, skip header
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const kat = String(row[idx.kategori] || "").trim().toUpperCase();
        const status = String(row[idx.status] || "").trim().toUpperCase();
        const nopolVal = String(row[idx.nopol] || "").trim();
        const validator = (idx.validator !== -1) ? String(row[idx.validator] || "").trim() : "";
        
        // REVISI 1: MANUAL, Status (P) Kosong, Validator (Q) Kosong
        if (kat === "MANUAL" && (!status || status === "-" || status === "") && (!validator || validator === "-" || validator === "") && nopolVal && nopolVal !== "-") {
            results.push({
                row_id: i+1,
                tanggal: formatDate(row[idx.tanggal]),
                nopol: nopolVal,
                material: row[idx.material] || "-"
            });
        }
      }
      return ContentService.createTextOutput(JSON.stringify(results.reverse())).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (e && e.parameter.action === 'getTaskQueue') {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
      
      const data = sheet.getDataRange().getValues();
      const role = e.parameter.role;
      const name = String(e.parameter.name || "").toUpperCase().trim();
      const shiftFilter = String(e.parameter.shift || "").trim();
      
      const results = [];

      if (role === 'muat') {
        const mSheet = ss.getSheetByName(MUAT_SHEET_NAME);
        if (!mSheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
        const muatData = mSheet.getDataRange().getValues();
        if (muatData.length <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

        // v19.9.4 Dynamic Indexing (Immune to column shift)
        const mHeaders = muatData[0].map(h => String(h).toUpperCase());
        const dIdx = {
           krani: mHeaders.indexOf("NAMA KRANI"),
           netto: mHeaders.indexOf("NETTO (KG)"),
           nopol: mHeaders.indexOf("NOPOL"),
           mat: mHeaders.indexOf("MATERIAL"),
           tgl: mHeaders.indexOf("TANGGAL"),
           shift: mHeaders.indexOf("SHIFT")
        };

        // Fallback robustness
        if (dIdx.krani === -1) dIdx.krani = 10;
        if (dIdx.netto === -1) dIdx.netto = 6;
        if (dIdx.nopol === -1) dIdx.nopol = 4;
        if (dIdx.mat === -1) dIdx.mat = 5;
        if (dIdx.tgl === -1) dIdx.tgl = 1;
        if (dIdx.shift === -1) dIdx.shift = 2;

        for (let j = 1; j < muatData.length; j++) {
            const muatRow = muatData[j];
            const kraniRow = String(muatRow[dIdx.krani] || "").toUpperCase().trim();
            const nettoVal = String(muatRow[dIdx.netto] || "").trim();
            const noNetto = !nettoVal || nettoVal === "-" || nettoVal === "0" || nettoVal === "";

            // REVISI 3: Netto (G) Kosong, munculkan Nopol (E) milik Krani (K)
            if (kraniRow === name && noNetto) {
                results.push({
                    row_id: j + 1, nopol: muatRow[dIdx.nopol] || "NO NOPOL", material: muatRow[dIdx.mat] || "-",
                    status: "NETTO MUAT KOSONG", gudang: "-", tanggal: formatDate(muatRow[dIdx.tgl]),
                    jenis_truck: "-", netto: muatRow[dIdx.netto] || "-"
                });
            }
        }
        return ContentService.createTextOutput(JSON.stringify(results.reverse())).setMimeType(ContentService.MimeType.JSON);
      }

      // v20.0.2 Universal Dynamic Indexing (Bongkar/Coord)
      const bHeaders = data.length > 0 ? data[0].map(h => String(h).toUpperCase()) : [];
      const idx = {
        nopol: bHeaders.findIndex(h => h.includes("NOPOL")),
        mat: bHeaders.findIndex(h => h.includes("MATERIAL")),
        gudang: bHeaders.findIndex(h => h.includes("GUDANG") || h.includes("INTAKE")),
        tgl: bHeaders.findIndex(h => h.includes("TANGGAL")),
        shift: bHeaders.findIndex(h => h.includes("SHIFT")),
        netto: bHeaders.findIndex(h => h.includes("NETTO")),
        krani: bHeaders.findIndex(h => h.includes("KRANI")),
        coord: bHeaders.findIndex(h => h.includes("COORD") || h.includes("MONITOR")),
        truck: bHeaders.findIndex(h => h.includes("TRUCK")),
        arrival_date: bHeaders.findIndex(h => h.includes("ARRIVAL DATE")),
        arrival_time: bHeaders.findIndex(h => h.includes("ARRIVAL TIME")),
        qc_time: bHeaders.findIndex(h => h.includes("QC")),
        timbang_time: bHeaders.findIndex(h => h.includes("TIMBANG"))
      };

      // Fallbacks (Hardcoded v20)
      if (idx.nopol === -1) idx.nopol = 6; if (idx.mat === -1) idx.mat = 4;
      if (idx.gudang === -1) idx.gudang = 2; if (idx.tgl === -1) idx.tgl = 0;
      if (idx.shift === -1) idx.shift = 1; if (idx.netto === -1) idx.netto = 8;
      if (idx.krani === -1) idx.krani = 9; if (idx.coord === -1) idx.coord = 11;
      if (idx.truck === -1) idx.truck = 7; if (idx.arrival_date === -1) idx.arrival_date = 23;
      // v18.11 Start from 0 since Header is deleted/optional
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (String(row[0]).toUpperCase().includes("TANGGAL")) continue;
        
        const rowShift = String(row[idx.shift] || "").trim();
        // v18.11: If shiftFilter is provided and not matches, skip (unless it's null/empty)
        if (shiftFilter && rowShift != shiftFilter && shiftFilter !== "null" && shiftFilter !== "") continue;

        if (role === 'krani') {
          const kraniRow = String(row[idx.krani] || "").toUpperCase().trim();
          const nettoVal = String(row[idx.netto] || "").trim();
          const noNetto = !nettoVal || nettoVal === "-" || nettoVal === "0" || nettoVal === "";
          
          // REVISI 2: Netto (I) Kosong, munculkan Nopol (G) milik Krani (J)
          if (kraniRow === name && noNetto) {
            results.push({ 
                row_id: i+1, nopol: row[idx.nopol] || "NO NOPOL", material: row[idx.mat] || "-", 
                status: "TONASE KOSONG", gudang: row[idx.gudang] || "-", tanggal: formatDate(row[idx.tgl]),
                jenis_truck: row[idx.truck] || "-", netto: row[idx.netto] || "-"
            });
          }
        } else if (role === 'coordinator') {
          const coordRow = String(row[idx.coord] || "").toUpperCase().trim();
          const truckType = String(row[idx.truck] || "").toUpperCase();
          const rowArrival = String(row[idx.arrival_date] || "").trim();
          const rowTimeArr = String(row[idx.arrival_time] || "").trim();
          const rowQC = String(row[idx.qc_time] || "").trim();
          const rowTimbang = String(row[idx.timbang_time] || "").trim();
          
          // REVISI 4: Container (H), X:AA Kosong, munculkan Nopol (G) milik Coordinator (L)
          const noData = !rowArrival || rowArrival === "-" || rowArrival === "" || !rowTimeArr || rowTimeArr === "-" || !rowQC || rowQC === "-" || !rowTimbang || rowTimbang === "-";
          
          if (coordRow === name && truckType.includes("CONTAINER") && noData) {
            results.push({ 
                row_id: i+1, nopol: row[idx.nopol] || "NO NOPOL", material: row[idx.mat] || "-", 
                status: "DATA CONTAINER BELUM LENGKAP", gudang: row[idx.gudang] || "-", tanggal: formatDate(row[idx.tgl]),
                jenis_truck: row[idx.truck] || "-",
                arrival_date: rowArrival, arrival_time: rowTimeArr, qc_time: rowQC, timbang_time: rowTimbang
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify(results.reverse())).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('WHSMART v2.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// function forceMuatHeaders definitif v19.9.9
function forceMuatHeaders() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let mSheet = ss.getSheetByName(MUAT_SHEET_NAME);
    if (!mSheet) {
      mSheet = ss.insertSheet(MUAT_SHEET_NAME);
    }
    mSheet.getRange(1, 1, 1, MUAT_HEADERS.length)
          .setValues([MUAT_HEADERS])
          .setFontWeight("bold")
          .setBackground("#d9ead3")
          .setVerticalAlignment("middle")
          .setHorizontalAlignment("center");
    mSheet.getRange("R1").setValue("v20.0.3 ABSOLUTE-SYNC").setFontColor("red").setFontWeight("bold");
    SpreadsheetApp.flush();
  } catch(e) {}
}

// v19.4 Helper
function formatDate(date) {
    if (!date) return "-";
    if (typeof date === 'string') return date;
    const d = new Date(date);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// Header definitions moved to top for safety v19.9.6

function doPost(e) {
  try {
    const raw = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    let sSheet = ss.getSheetByName(SESSION_SHEET);
    let mSheet = ss.getSheetByName(MUAT_SHEET_NAME);
    
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1,1,1,MASTER_HEADERS.length).setValues([MASTER_HEADERS]).setFontWeight("bold");
    }
    if (!sSheet) {
      sSheet = ss.insertSheet(SESSION_SHEET);
      sSheet.getRange(1,1,1,7).setValues([["Krani", "Shift", "Gudang", "Coord", "Sampling", "TimBorong", "TimHarian"]]).setFontWeight("bold");
    }
    if (!mSheet) {
      mSheet = ss.insertSheet(MUAT_SHEET_NAME);
      mSheet.getRange(1,1,1,MUAT_HEADERS.length).setValues([MUAT_HEADERS]).setFontWeight("bold");
    }

    // ACTION: SAVE SESSION SETUP (v16.5)
    if (raw.action === "saveSession") {
      const sData = sSheet.getDataRange().getValues();
      let foundRow = -1;
      for (let i = 1; i < sData.length; i++) {
        if (sData[i][0] === raw.krani) { foundRow = i + 1; break; }
      }
      const newRow = [raw.krani, raw.shift, raw.gudang, raw.coordinator, raw.sampling, raw.tim_borong, raw.tim_harian];
      if (foundRow !== -1) {
        sSheet.getRange(foundRow, 1, 1, 7).setValues([newRow]);
      } else {
        sSheet.appendRow(newRow);
      }
      return ContentService.createTextOutput(JSON.stringify({success:true}));
    }

    // ACTION: TERMINATE SESSION (v16.5)
    if (raw.action === "terminateSession") {
      const sData = sSheet.getDataRange().getValues();
      for (let i = 1; i < sData.length; i++) {
        if (sData[i][0] === raw.krani) { sSheet.deleteRow(i + 1); break; }
      }
      return ContentService.createTextOutput(JSON.stringify({success:true}));
    }

    // ACTION: SAVE KRANI BATCH (v15.7 + v19.1 + v19.2)
    if (raw.units) {
      const common = raw.common;
      const rows = raw.units.map(unit => {
        return [
          common.tanggal, common.shift, common.gudang, unit.sloc, unit.material,
          unit.lokasi_simpan, unit.nopol, unit.jenis_truck, unit.netto, common.krani,
          common.sampling_man, common.coordinator, unit.jenis_kuli, unit.tim_kerja,
          common.start_panggil, common.truck_ready, common.start_bongkar,
          common.hold_qc, common.restart_qc, common.manuver_akhir, common.finish, 
          unit.tenaga_bongkar, new Date(),
          "", "", "", "",
          common.gudang_durasi || "-",
          unit.jumlah_bag || "-" // v19.2: Jumlah Bag
        ];
      });
      sheet.getRange(sheet.getLastRow()+1, 1, rows.length, 29).setValues(rows);
      return ContentService.createTextOutput(JSON.stringify({success:true}));
    }

    // ACTION: SAVE KRANI MUATAN (v20.0.0 Absolute Alignment)
    if (raw.action === "saveMuat") {
      forceMuatHeaders(); // Ensure headers are correct before appending
      mSheet = ss.getSheetByName(MUAT_SHEET_NAME);
      mSheet.appendRow([
        new Date(),                 // A=0: Timestamp
        raw.tanggal || '-',         // B=1: Tanggal
        raw.shift || '-',           // C=2: Shift
        raw.kategori_risip || '-',  // D=3: Kategori
        raw.nopol || '-',           // E=4: Nopol
        raw.material || '-',        // F=5: Material
        raw.netto || '-',           // G=6: Netto (Kg)
        raw.jumlah_bag || '-',      // H=7: Jumlah Bag
        raw.tim_harian || '-',      // I=8: Tim Harian
        raw.jumlah_kuli || '-',     // J=9: Jumlah Kuli
        raw.krani || '-',           // K=10: Nama Krani
        raw.bongkar_stapel || '-',  // L=11: Bongkar Stapel
        raw.start_muat || '-',      // M=12: Start Muat
        raw.finish || '-',          // N=13: Finish
        raw.otw_pabrik || '-',      // O=14: OTW Pabrik
        "",                         // P=15: Status Validasi
        "",                         // Q=16: Validator
        "v20.0.3 ABSOLUTE-SYNC",    // R=17: SYSTEM_VERSION
        raw.gudang || 'RM'          // S=18: Gudang Muat (Default RM)
      ]);
      return ContentService.createTextOutput(JSON.stringify({success:true}));
    }

    // ACTION: SAVE CROSSCHECK (v19.9.4 Dynamic Indexing Support)
    if (raw.action === "saveCrosscheck") {
      forceMuatHeaders(); // v19.9.9 Safety
      mSheet = ss.getSheetByName(MUAT_SHEET_NAME);
      const updates = raw.updates; 
      const validator = raw.validator;
      
      const mHeaders = mSheet.getRange(1, 1, 1, mSheet.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase());
      const nettoCol = mHeaders.indexOf("NETTO (KG)") + 1;
      const statusCol = mHeaders.indexOf("STATUS VALIDASI") + 1;
      const validCol = mHeaders.indexOf("VALIDATOR") + 1;
      
      // Safety Fallbacks
      const finalN = (nettoCol > 0) ? nettoCol : 7;
      const finalS = (statusCol > 0) ? statusCol : 16;
      const finalV = (validCol > 0) ? validCol : 17;
      
      updates.forEach(upd => {
        mSheet.getRange(upd.row_id, finalN).setValue(upd.netto);
        if (finalS > 0) mSheet.getRange(upd.row_id, finalS).setValue("DONE RISIP");
        if (finalV > 0) mSheet.getRange(upd.row_id, finalV).setValue(validator);
      });
      return ContentService.createTextOutput(JSON.stringify({success:true}));
    }

    // ACTION: UPDATE ARRIVAL (v15.7 + v20.0.1 Dynamic)
    if (raw.action === "updateCoordinator") {
      const bHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase());
      let startCol = bHeaders.indexOf("ARRIVAL DATE") + 1;
      if (startCol === 0) startCol = 24; // Fallback
      
      const updateArr = [[raw.arrival_date, raw.arrival_time, raw.qc_time, raw.timbang_time]];
      sheet.getRange(raw.row_id, startCol, 1, 4).setValues(updateArr);
      return ContentService.createTextOutput(JSON.stringify({success:true}));
    }

    // ACTION: UPDATE NETTO (v19.9.5 + v20.0.1 Dynamic)
    if (raw.action === "updateNetto") {
      const targetSheet = (raw.role === 'muat') ? mSheet : sheet;
      let nettoCol = (raw.role === 'muat') ? 7 : 9; // Fallbacks
      
      const hRes = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase());
      const nIdx = hRes.indexOf("NETTO (KG)");
      if (nIdx !== -1) nettoCol = nIdx + 1;
      
      targetSheet.getRange(raw.row_id, nettoCol).setValue(raw.netto);
      return ContentService.createTextOutput(JSON.stringify({success:true}));
    }

    // ACTION: SAVE ABSENSI KULI (v20.1.0)
    if (raw.action === "saveAbsensi") {
      const ABSENSI_SHEET = "ABSENSI KULI";
      const ABSENSI_HEADERS = ["Timestamp", "Tanggal", "Shift", "Tim", "Kategori", "Nama", "Status", "Keterangan", "Krani Pencatat"];
      
      let absSheet = ss.getSheetByName(ABSENSI_SHEET);
      if (!absSheet) {
        absSheet = ss.insertSheet(ABSENSI_SHEET);
        absSheet.getRange(1, 1, 1, ABSENSI_HEADERS.length)
          .setValues([ABSENSI_HEADERS])
          .setFontWeight("bold")
          .setBackground("#d9ead3")
          .setHorizontalAlignment("center");
        absSheet.setFrozenRows(1);
      }
      
      const rows = raw.rows.map(r => [
        new Date(),        // A: Timestamp
        r.tanggal || '-',  // B: Tanggal
        r.shift || '-',    // C: Shift
        r.tim || '-',      // D: Tim
        r.kategori || '-', // E: Kategori (BORONG/HARIAN)
        r.nama || '-',     // F: Nama
        r.status || 'H',   // G: Status (H/I/A)
        r.keterangan || '-', // H: Keterangan
        r.krani_pencatat || '-' // I: Krani Pencatat
      ]);
      
      if (rows.length > 0) {
        absSheet.getRange(absSheet.getLastRow() + 1, 1, rows.length, ABSENSI_HEADERS.length).setValues(rows);
      }
      
      return ContentService.createTextOutput(JSON.stringify({success: true, count: rows.length}));
    }

    // ACTION: SAVE STAPEL (v20.2.0)
    if (raw.action === "saveStapel") {
      const STAPEL_SHEET = "DATA STAPEL";
      const STAPEL_HEADERS = ["Timestamp", "Tanggal", "Shift", "Tim", "Kategori", "Netto Stapel (Kg)", "Krani Pencatat"];
      
      let stSheet = ss.getSheetByName(STAPEL_SHEET);
      if (!stSheet) {
        stSheet = ss.insertSheet(STAPEL_SHEET);
        stSheet.getRange(1, 1, 1, STAPEL_HEADERS.length)
          .setValues([STAPEL_HEADERS])
          .setFontWeight("bold")
          .setBackground("#fce5cd")
          .setHorizontalAlignment("center");
        stSheet.setFrozenRows(1);
      }
      
      stSheet.appendRow([
        new Date(),              // A: Timestamp
        raw.tanggal || '-',      // B: Tanggal
        raw.shift || '-',        // C: Shift
        raw.tim || '-',          // D: Tim
        raw.kategori || '-',     // E: Kategori (BORONG/HARIAN)
        Number(raw.netto) || 0,  // F: Netto Stapel (Kg)
        raw.krani_pencatat || '-' // G: Krani Pencatat
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({success: true}));
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false, error: err.toString()}));
  }
}
