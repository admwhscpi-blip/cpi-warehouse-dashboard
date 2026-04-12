/**
 * SMART WAREHOUSE V2 - ENTRY BONGKAR APPSCRIPT
 * Deploy sebagai Web App (Executable by Anyone)
 * 
 * Skenario Output: Buat 3 Sheet kosong dengan nama:
 * 1. "SETUP"
 * 2. "ABSENSI"
 * 3. "DATA_BONGKARAN"
 */

const SHEET_SETUP = "SETUP";
const SHEET_ABSENSI = "ABSENSI";
const SHEET_BONGKARAN = "DATA_BONGKARAN";
const SHEET_MUATAN = "DATA_MUATAN";
const SHEET_LOG_ABSENSI = "MASTER_ABSENSI_LOG";
const SCRIPT_VERSION = "2026.04.11-V3";

// === HELPERS ===
function fmtTime(val) {
  if (!val) return null;
  if (val instanceof Date) {
    let h = val.getHours();
    let m = val.getMinutes();
    return (h < 10 ? "0" + h : String(h)) + ":" + (m < 10 ? "0" + m : String(m));
  }
  let s = String(val).trim();
  if (s.includes(':')) return s;
  return null;
}

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

function findH(headers, variants) {
  if (!headers || !variants) return -1;
  const h = headers.map(s => String(s || "").toUpperCase().trim());
  for (let v of variants) {
    let idx = h.indexOf(v.toUpperCase().trim());
    if (idx >= 0) return idx;
    idx = h.findIndex(str => str.includes(v.toUpperCase().trim()));
    if (idx >= 0) return idx;
  }
  return -1;
}
// ===============
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = (data.action || "").toLowerCase();

    if (action === "savesetup") {
      return handleSaveSetup(data);
    } else if (action === "saveglobalattendance") {
      return handleSaveGlobalAttendance(data);
    } else if (action === "savebongkaran") {
      return handleSaveBongkaran(data);
    } else if (action === "savemuat") {
      return handleSaveMuat(data);
    } else if (action === "savestafelentry") {
      return handleSaveStafelEntry(data);
    } else if (action === "updatestafelstock") {
      return handleUpdateStafelStock(data);
    } else if (action === "updatenetto") {
      return handleUpdateNetto(data);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = (e.parameter.action || "").toLowerCase();

    if (action === "getdata") {
      return handleGetData();
    } else if (action === "gettaskqueue") {
      return handleGetTaskQueue(e);
    } else if (action === "getsetup") {
      return handleGetSetup();
    } else if (action === "getglobalattendance") {
      return handleGetGlobalAttendance();
    } else if (action === "getpendinglangsiran") {
      return handleGetPendingLangsiran();
    } else if (action === "getanalyticsv2") {
      return handleGetAnalyticsV2();
    } else if (action === "getstafeldata") {
      return handleGetStafelData();
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      version: SCRIPT_VERSION,
      message: "API Active - Unknown Action: '" + (e.parameter.action || "none") + "'. Silakan perbarui Deployment (New Deployment) di Editor Apps Script untuk memastikan kode terbaru aktif."
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


function handleSaveSetup(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Save SETUP
  const sheetSetup = ss.getSheetByName(SHEET_SETUP);
  if (!sheetSetup) throw new Error("Sheet SETUP belum dibuat");

  const setupTimestamp = new Date();

  // Clear previous setup to simulate single active shift (or append, but for simplicity we append)
  // Format: Timestamp | Shift | SLOC | Sampling Man | Tim Borong | Tim Harian | Kordinator | Jam Mulai | Jam Selesai
  sheetSetup.appendRow([
    setupTimestamp,
    data.shift,
    data.sloc,
    data.samplingMan,
    data.timBorong,
    data.timHarian,
    data.koordinator,
    data.jamMulai,
    data.jamSelesai
  ]);

  // 2. Save ABSENSI
  if (data.absensi && data.absensi.length > 0) {
    const sheetAbs = ss.getSheetByName(SHEET_ABSENSI);
    if (!sheetAbs) throw new Error("Sheet ABSENSI belum dibuat");
    // Format: Timestamp | Shift | Tim | Kategori | Nama Kuli | Status
    data.absensi.forEach(kuli => {
      sheetAbs.appendRow([
        setupTimestamp,
        data.shift,
        kuli.tim,
        kuli.kategori,
        kuli.nama,
        kuli.status
      ]);
    });
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Setup & Absensi berhasil disimppan" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleSaveBongkaran(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_BONGKARAN);

  // Auto-create sheet with headers if missing
  const BONGKAR_HEADERS = [
    "Timestamp", "Tipe Bongkaran", "Nama Krani", "Shift", "SLOC",
    "Jenis Truck", "Jenis RM", "Jumlah Bag", "Nopol", "Netto (KG)",
    "Gudang/Intake", "Kuli Penggarap", "Jumlah Kuli",
    "TANGGAL", "Arrival Time", "QC Sampling 1 Time",
    "Tanggal PB", "Sampai Gudang", "Start Bongkar",
    "Hold QC", "Restart QC", "Finish",
    "Delay Space", "Delay Operasional"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_BONGKARAN);
    sheet.appendRow(BONGKAR_HEADERS);
    sheet.getRange(1, 1, 1, BONGKAR_HEADERS.length).setFontWeight("bold");
  } else if (sheet.getLastRow() === 0) {
    // Sheet ada tapi kosong → tambahkan header
    sheet.appendRow(BONGKAR_HEADERS);
    sheet.getRange(1, 1, 1, BONGKAR_HEADERS.length).setFontWeight("bold");
  }

  const entryDate = new Date();

  // The data payload contains an array of unit/truck data along with shared timestamps
  if (data.trucks && data.trucks.length > 0) {
    data.trucks.forEach(truck => {
      sheet.appendRow([
        entryDate,
        data.tipeBongkaran, // 1 Jenis / Bareng
        data.kraniName,
        data.shift,
        data.sloc,

        // Data Truck Input
        truck.jenisTruck,
        truck.materialRM,
        truck.jumlahBag,
        truck.nopol,
        truck.netto,
        truck.lokasiSimpan,
        truck.kuliPenggarap,
        truck.jumlahKuli,

        // Timestamps (Semua dari Form)
        data.abTanggal,
        data.abArrivalTime,
        data.abQcTime1,
        data.pbTanggal,
        data.pbSampaiGudang,
        data.pbStartBongkar,
        data.pbHoldQc,
        data.pbRestartQc,
        data.pbFinish,

        // Keterangan Auto-Delays
        data.delaySpace || "-",
        data.delayOperasional || "-"
      ]);

      // UPDATE STATUS DI SHEET MUATAN (JIKA ADA ROW_ID)
      if (truck.source_row_id) {
        const mSheet = ss.getSheetByName(SHEET_MUATAN);
        if (mSheet) {
          const mHeaders = mSheet.getRange(1, 1, 1, mSheet.getLastColumn()).getValues()[0];
          const statusCol = mHeaders.indexOf("Status Validasi") + 1;
          if (statusCol > 0) {
            mSheet.getRange(truck.source_row_id, statusCol).setValue("BONGKAR_DONE");
          }
        }
      }
    });
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Data Bongkaran Tersimpan" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGetPendingLangsiran() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MUATAN);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);

  const headers = data[0].map(h => String(h).trim().toUpperCase());

  // Fungsi pembantu agar pencarian kolom lebih fleksibel
  const findCol = (name) => {
    const target = name.toUpperCase();
    return headers.findIndex(h => h.includes(target));
  }

  const idx = {
    tanggal: findCol("TANGGAL"),
    nopol: findCol("NOPOL"),
    material: findCol("MATERIAL"),
    otw: findCol("OTW PABRIK"),
    status: findCol("STATUS VALIDASI"),
    netto: findCol("NETTO"),
    bag: findCol("BAG"),
    shift: findCol("SHIFT"),
    gudangMuat: findCol("GUDANG MUAT")
  };

  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Jika kolom status tidak ditemukan, anggap saja kosong (agar data tetap muncul)
    const statusVal = idx.status === -1 ? "" : String(row[idx.status] || "").trim().toUpperCase();

    // Tampilkan jika status kosong, '-', atau unvalidated
    if (statusVal === "" || statusVal === "-" || statusVal === "UNVALIDATED" || statusVal === "UNDEFINED") {
      results.push({
        row_id: i + 1,
        tanggal: idx.tanggal === -1 ? "-" : (row[idx.tanggal] instanceof Date ? Utilities.formatDate(row[idx.tanggal], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[idx.tanggal]),
        nopol: idx.nopol === -1 ? "Tanpa Nopol" : row[idx.nopol],
        material: idx.material === -1 ? "-" : row[idx.material],
        jam_muat: idx.otw === -1 ? "-" : row[idx.otw],
        netto: idx.netto === -1 ? 0 : row[idx.netto],
        jumlah_bag: idx.bag === -1 ? 0 : row[idx.bag],
        shift_muat: idx.shift === -1 ? "-" : row[idx.shift],
        gudang_asal: idx.gudangMuat === -1 ? "RM" : row[idx.gudangMuat]
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify(results.reverse()))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGetSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSetup = ss.getSheetByName(SHEET_SETUP);
  const sheetAbs = ss.getSheetByName(SHEET_ABSENSI);

  if (!sheetSetup) throw new Error("Sheet SETUP hilang");

  const setupData = sheetSetup.getDataRange().getValues();
  if (setupData.length <= 1) { // Empty except header
    return ContentService.createTextOutput(JSON.stringify({ success: true, hasActiveSetup: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Ambil baris terakhir sebagai Active Setup
  const lastSetupRow = setupData[setupData.length - 1];

  // Parse End Time validity (if current time > Jam Selesai, it's expired)
  const today = new Date();
  const setupDate = new Date(lastSetupRow[0]); // Timestamp col A

  // Simple same-day validity check based on 'Jam Selesai' logic
  // Assume Jam Selesai format is "HH:MM". If it's valid, return it.
  const activeSetupParams = {
    shift: lastSetupRow[1],
    sloc: lastSetupRow[2],
    samplingMan: lastSetupRow[3],
    timBorong: lastSetupRow[4],
    timHarian: lastSetupRow[5],
    koordinator: lastSetupRow[6],
    jamMulai: lastSetupRow[7],
    jamSelesai: lastSetupRow[8]
  };

  // Optional: Build list of Absensi to default in frontend

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    hasActiveSetup: true,
    setupDate: setupDate.toISOString(),
    data: activeSetupParams
  }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleSaveMuat(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_MUATAN);

  // Auto-create sheet if missing (like legacy)
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MUATAN);
    const headers = [
      "Timestamp", "Tanggal", "Shift", "Kategori", "Nopol",
      "Material", "Netto (Kg)", "Jumlah Bag", "Tim Harian", "Jumlah Kuli",
      "Nama Krani", "Bongkar Stapel", "Start Muat", "Finish", "OTW Pabrik",
      "Status Validasi", "Validator", "SYSTEM_VERSION", "Gudang Muat"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  sheet.appendRow([
    new Date(),                 // A=0: Timestamp
    data.tanggal || '-',         // B=1: Tanggal
    data.shift || '-',           // C=2: Shift
    data.kategori_risip || '-',  // D=3: Kategori
    data.nopol || '-',           // E=4: Nopol
    data.material || '-',        // F=5: Material
    data.netto || '-',           // G=6: Netto (Kg)
    data.jumlah_bag || '-',      // H=7: Jumlah Bag
    data.tim_harian || '-',      // I=8: Tim Harian
    data.jumlah_kuli || '-',     // J=9: Jumlah Kuli
    data.krani || '-',           // K=10: Nama Krani
    data.bongkar_stapel || '-',  // L=11: Bongkar Stapel
    data.start_muat || '-',      // M=12: Start Muat
    data.finish || '-',          // N=13: Finish
    data.otw_pabrik || '-',      // O=14: OTW Pabrik
    "",                         // P=15: Status Validasi
    "",                         // Q=16: Validator
    "v20.0.3 ABSOLUTE-SYNC",    // R=17: SYSTEM_VERSION
    data.gudang || 'RM'          // S=18: Gudang Muat (Default RM)
  ]);

  return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Data Muatan Berhasil Tersimpan" }))
    .setMimeType(ContentService.MimeType.JSON);
}
function handleSaveGlobalAttendance(data) {
  const props = PropertiesService.getScriptProperties();
  const state = {
    date: data.tanggal,
    startTime: data.jamAwal,
    endTime: data.jamAkhir,
    absensi: data.absensi,
    timestamp: new Date().getTime()
  };

  props.setProperty("GLOBAL_ATTENDANCE_STATE", JSON.stringify(state));

  // 3. Save to Global Log Sheet (Grouped per Team)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(SHEET_LOG_ABSENSI);
  if (!sheetLog) {
    const newLog = ss.insertSheet(SHEET_LOG_ABSENSI);
    newLog.appendRow(["Timestamp", "Tanggal", "Tim", "Kategori", "Jumlah Hadir", "Keterangan (Alpha)"]);
    newLog.getRange(1, 1, 1, 6).setFontWeight("bold");
  }

  const logSheet = ss.getSheetByName(SHEET_LOG_ABSENSI);
  const ts = new Date();

  // Group by Team for logging
  const teams = [...new Set(data.absensi.map(k => k.tim))];
  teams.forEach(tName => {
    const kuliInTeam = data.absensi.filter(k => k.tim === tName);
    const presentCount = kuliInTeam.filter(k => k.status === 'H').length;
    const absentNames = kuliInTeam.filter(k => k.status === 'A').map(k => k.nama).join(", ");
    const category = kuliInTeam[0].kategori;

    logSheet.appendRow([ts, data.tanggal, tName, category, presentCount, absentNames || "-"]);
  });

  return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Absensi Global Berhasil Disimpan & Dicatat" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGetGlobalAttendance() {
  const props = PropertiesService.getScriptProperties();
  const rawState = props.getProperty("GLOBAL_ATTENDANCE_STATE");

  if (!rawState) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Belum ada absensi global" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const state = JSON.parse(rawState);
  const now = new Date();
  const nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm");

  const start = state.startTime;
  const end = state.endTime;

  let isActive = false;

  if (start < end) {
    // Skenario satu hari: 08:00 - 17:00
    if (nowStr >= start && nowStr <= end) isActive = true;
  } else {
    // Skenario lewat tengah malam: 19:00 - 07:00
    if (nowStr >= start || nowStr <= end) isActive = true;
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    isActive: isActive,
    data: state,
    currentTime: nowStr
  })).setMimeType(ContentService.MimeType.JSON);
}


// ================== ANALYTICS & STAFFEL V2.0 MIGRATION ==================
function handleGetAnalyticsV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var e = { parameter: { action: 'getAnalyticsV2' } };
  var SHEET_NAME = 'DATA_BONGKARAN';
  var MUAT_SHEET_NAME = 'DATA_MUATAN';
  if (e && e.parameter.action === 'getAnalyticsV2') {
    try {
      const bSheet = ss.getSheetByName(SHEET_NAME);        // DATA BONGKARAN
      const mSheet2 = ss.getSheetByName(MUAT_SHEET_NAME);  // DATA MUAT
      const absSheet = ss.getSheetByName("ABSENSI KULI");
      const stSheet = ss.getSheetByName("STAFFEL_LOG");

      // ----- 1. MINE DATA BONGKARAN → dailyActivity + template -----
      const dailyMap = {};  // tanggal → {muat, bongkar, st_*, prod_*}
      const templateRows = [];

      if (bSheet && bSheet.getLastRow() > 1) {
        const bData = bSheet.getDataRange().getValues();
        const bH = bData[0];
        const bIdx = {
          tanggal: findH(bH, ["TANGGAL", "DATE"]),
          material: findH(bH, ["MATERIAL", "JENIS RM", "KOMODITAS", "JENIS_RM", "NAMA BARANG"]),
          netto: findH(bH, ["NETTO (KG)", "REAL_BONGKAR_MT", "NETTO", "KG", "MT"]),
          gudang: findH(bH, ["SLOC", "GUDANG/INTAKE", "GUDANG", "LOKASI"]),
          tim: findH(bH, ["TIM KERJA", "TIM"]),
          jenisKuli: findH(bH, ["JENIS KULI", "KULI"]),
          startPanggil: findH(bH, ["START PANGGIL"]),
          truckReady: findH(bH, ["TRUCK READY"]),
          startBongkar: findH(bH, ["START BONGKAR"]),
          holdQC: findH(bH, ["HOLD QC"]),
          restartQC: findH(bH, ["RE-START", "RESTART QC"]),
          manuverAkhir: findH(bH, ["MANUVER", "MANUVER AKHIR"]),
          finish: findH(bH, ["FINISH", "TIME FINISH"]),
          nopol: findH(bH, ["NOPOL", "PLAT"]),
          lokasiSimpan: findH(bH, ["LOKASI SIMPAN", "SLOC"]),
          truck: findH(bH, ["JENIS TRUCK", "TRUCK"]),
          arrivalDate: findH(bH, ["ARRIVAL DATE"]),
          arrivalTime: findH(bH, ["ARRIVAL TIME"]),
          qcTime: findH(bH, ["QC SAMPLING 1 TIME", "QC TIME"]),
          timbangTime: findH(bH, ["TIME TIMBANG MASUK", "TIMBANG IN", "TIMBANG MASUK"]),
          tanggalPB: findH(bH, ["TANGGAL PB", "TANGGAL PROSES"]),
          sampaiGudang: findH(bH, ["SAMPAI GUDANG", "SM GUDANG"]),
          krani: findH(bH, ["NAMA KRANI", "KRANI", "OPERATOR", "USER"])
        };

        for (let i = 1; i < bData.length; i++) {
          const row = bData[i];
          let rawTgl = row[bIdx.tanggal];
          if (!rawTgl) continue;

          // v20.2.4 Robust Date Normalization (Backend)
          let tgl = "";
          if (rawTgl instanceof Date) {
            tgl = Utilities.formatDate(rawTgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          } else {
            // Handle common string formats like dd/MM/yyyy
            let s = String(rawTgl).trim();
            let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (m) tgl = m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
            else tgl = s; // fallback to raw string
          }

          const nettoIndex = bIdx.netto >= 0 ? bIdx.netto : bH.findIndex(h => h === "NETTO (KG)" || h === "REAL_BONGKAR_MT" || h.includes("NETTO"));
          const netto = Number(row[nettoIndex]) || 0;
          const tim = String(bIdx.tim >= 0 ? row[bIdx.tim] : "").toUpperCase().trim();
          const material = String(bIdx.material >= 0 ? row[bIdx.material] : "");
          const gudang = String(bIdx.gudang >= 0 ? row[bIdx.gudang] : "");

          // Template row (per-truck detail)
          templateRows.push({
            TANGGAL: tgl,
            JENIS_RM: material,
            JENIS_TRUCK: String(bIdx.truck >= 0 ? row[bIdx.truck] : ""),
            KEGIATAN: "BONGKAR",
            LOKASI: gudang,
            NOPOL: String(bIdx.nopol >= 0 ? row[bIdx.nopol] : ""),
            NAMA_KRANI: String(bIdx.krani >= 0 ? row[bIdx.krani] : ""),
            REAL_BONGKAR_MT: netto,
            REAL_BONGKAR_KG: netto, // Alias for clarity v20.2.3
            ARRIVAL_DATE: (function (v) {
              if (!v) return "";
              if (v instanceof Date) {
                let dd = v.getDate(); let mm = v.getMonth() + 1; let yy = v.getFullYear();
                return (dd < 10 ? "0" + dd : dd) + "." + (mm < 10 ? "0" + mm : mm) + "." + yy;
              }
              return String(v).trim();
            })(bIdx.arrivalDate >= 0 ? row[bIdx.arrivalDate] : ""),
            ARRIVAL_TIME: fmtTime(bIdx.arrivalTime >= 0 ? row[bIdx.arrivalTime] : ""),
            QC_SAMPLING_1: fmtTime(bIdx.qcTime >= 0 ? row[bIdx.qcTime] : ""),
            TIME_TIMBANG_MASUK: fmtTime(bIdx.timbangTime >= 0 ? row[bIdx.timbangTime] : ""),
            START_PANGGIL: fmtTime(bIdx.startPanggil >= 0 ? row[bIdx.startPanggil] : ""),
            TRUCK_READY: fmtTime(bIdx.truckReady >= 0 ? row[bIdx.truckReady] : ""),
            START_BONGKAR: fmtTime(bIdx.startBongkar >= 0 ? row[bIdx.startBongkar] : ""),
            HOLD_QC: fmtTime(bIdx.holdQC >= 0 ? row[bIdx.holdQC] : ""),
            RESTART_QC: fmtTime(bIdx.restartQC >= 0 ? row[bIdx.restartQC] : ""),
            MANUVER_AKHIR: fmtTime(bIdx.manuverAkhir >= 0 ? row[bIdx.manuverAkhir] : ""),
            FINISH_TIME: fmtTime(bIdx.finish >= 0 ? row[bIdx.finish] : ""),
            DURASI_BONGKAR: bIdx.startBongkar >= 0 && bIdx.finish >= 0 ? calcDurMin(row[bIdx.startBongkar], row[bIdx.finish]) : "-",
            PB_START: fmtTime(bIdx.startPanggil >= 0 ? row[bIdx.startPanggil] : ""),
            TUNGGU_QC: fmtTime(bIdx.holdQC >= 0 ? row[bIdx.holdQC] : ""),
            TANGGAL_PB: (function (v) {
              if (!v) return "";
              if (v instanceof Date) {
                return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
              }
              let s = String(v).trim();
              let m2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
              if (m2) return m2[3] + "-" + m2[2].padStart(2, "0") + "-" + m2[1].padStart(2, "0");
              return s;
            })(bIdx.tanggalPB >= 0 ? row[bIdx.tanggalPB] : ""),
            SAMPAI_GUDANG: fmtTime(bIdx.sampaiGudang >= 0 ? row[bIdx.sampaiGudang] : "")
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
          let rawTgl = mData[i][mTanggal];
          if (!rawTgl) continue;

          let tgl = "";
          if (rawTgl instanceof Date) {
            tgl = Utilities.formatDate(rawTgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          } else {
            let s = String(rawTgl).trim();
            let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (m) tgl = m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
            else tgl = s;
          }

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
      // FOKUS: Hanya entri berjenis "STAPEL" dari STAFFEL_LOG yang dimasukkan ke dashboard
      if (stSheet && stSheet.getLastRow() > 1) {
        const sData = stSheet.getDataRange().getValues();
        const sH = sData[0].map(h => String(h).toUpperCase());
        const sTgl = sH.indexOf("TANGGAL") >= 0 ? sH.indexOf("TANGGAL") : 1;
        const sTim = sH.indexOf("TIM") >= 0 ? sH.indexOf("TIM") : 3;
        const sJenis = sH.indexOf("JENIS") >= 0 ? sH.indexOf("JENIS") : 4;
        const sNetto = sH.findIndex(h => h.includes("NETTO"));
        
        const toNum = (v) => {
          if (v === null || v === undefined || v === "") return 0;
          if (typeof v === "number") return v;
          let s = String(v).replace(/[^0-9,.-]/g, "").replace(",", ".");
          return parseFloat(s) || 0;
        };

        for (let i = 1; i < sData.length; i++) {
          const row = sData[i];
          let rawTgl = row[sTgl];
          if (!rawTgl) continue;

          // Filter JENIS: Hanya yang STAPEL saja (BONGKARAN dilewati)
          const jenis = String(row[sJenis] || "").toUpperCase().trim();
          if (jenis !== "STAPEL") continue;

          let tgl = "";
          if (rawTgl instanceof Date) tgl = Utilities.formatDate(rawTgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          else tgl = String(rawTgl).trim();

          const tim = String(row[sTim] || "").toUpperCase().trim();
          const netto = toNum(row[sNetto >= 0 ? sNetto : 6]);

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

          // Masukkan ke templateRows agar muncul di Trend Chart & Analisis Harian Dashboard
          templateRows.push({
            TANGGAL: tgl,
            JENIS_RM: "STAPEL PALLET",
            JENIS_TRUCK: tim,
            KEGIATAN: "STAPEL",
            LOKASI: "AREA STAFFEL",
            REAL_BONGKAR_MT: netto,
            REAL_BONGKAR_KG: netto,
            DURASI_BONGKAR: null, PB_START: null, TUNGGU_QC: null
          });
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
          const kat = String(aData[i][aKat] || "").toUpperCase().trim();
          const isHadir = (String(aData[i][aStatus] || "H").toUpperCase().trim() === "H");

          if (isHadir && dailyMap[tgl]) {
            if (kat === "BORONG") {
              if (tim === "BADRUN") dailyMap[tgl].prod_badrun++;
              else if (tim === "KARTONO") dailyMap[tgl].prod_kartono++;
            } else {
              dailyMap[tgl].prod_kulhar++;
            }
          }
        }

        // Finalize prod: totalNetto / hadirCount
        Object.values(dailyMap).forEach(d => {
          d.prod_badrun = d.prod_badrun > 0 ? Math.round(d._bNetto.BADRUN / d.prod_badrun) : 0;
          d.prod_kartono = d.prod_kartono > 0 ? Math.round(d._bNetto.KARTONO / d.prod_kartono) : 0;
          d.prod_kulhar = d.prod_kulhar > 0 ? Math.round(d._bNetto.KULHAR / d.prod_kulhar) : 0;
        });
      }

      // 5. Build Material Summary & Pending Coords
      const materials = {};
      const pendingCoords = new Set();
      templateRows.forEach(r => {
        if (!materials[r.JENIS_RM]) materials[r.JENIS_RM] = 0;
        materials[r.JENIS_RM] += (Number(r.REAL_BONGKAR_MT) || 0);

        if (r.KEGIATAN === "BONGKAR" && (!r.LOKASI || r.LOKASI === "-" || r.LOKASI.trim() === "")) {
          pendingCoords.add(r.TANGGAL);
        }
      });

      const datesRes = Object.values(dailyMap).sort((a, b) => a.tanggal.localeCompare(b.tanggal));

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        dailyActivity: datesRes,
        templateDump: templateRows.reverse(),
        kuliBorong: kuliBorong,
        kuliHarian: kuliHarian,
        pendingCoords: Array.from(pendingCoords).sort(),
        materials: materials
      })).setMimeType(ContentService.MimeType.JSON);

    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: e.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
}

function handleGetStafelData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var e = { parameter: { action: "getStafelData" } };
  try {
    const STAFFEL_SHEET = "STAFFEL_LOG";
    const STAFFEL_CONFIG_SHEET = "STAFFEL_CONFIG";

    // 1. Read stock awal from config (or use defaults)
    let stockAwal = {
      "BADRUN": 162, "KARTONO": 112,
      "WAWAN": 25, "SURYANA": 25, "SAHLAN": 25,
      "PALLET_KOSONG": 137
    };

    let cfgSheet = ss.getSheetByName(STAFFEL_CONFIG_SHEET);
    if (cfgSheet && cfgSheet.getLastRow() > 0) {
      const cfgData = cfgSheet.getDataRange().getValues();
      cfgData.forEach(row => {
        let key = String(row[0] || "").trim().toUpperCase();
        let val = Number(row[1]) || 0;
        if (key && stockAwal.hasOwnProperty(key)) stockAwal[key] = val;
      });
    }

    // 2. Read all entries from STAFFEL_LOG
    let entries = [];
    let stSheet = ss.getSheetByName(STAFFEL_SHEET);
    if (stSheet && stSheet.getLastRow() > 1) {
      const stData = stSheet.getDataRange().getValues();
      const stH = stData[0].map(h => String(h).toUpperCase());
      const sIdx = {
        tanggal: stH.indexOf("TANGGAL") >= 0 ? stH.indexOf("TANGGAL") : 1,
        shift: stH.indexOf("SHIFT") >= 0 ? stH.indexOf("SHIFT") : 2,
        tim: stH.indexOf("TIM") >= 0 ? stH.indexOf("TIM") : 3,
        jenis: stH.indexOf("JENIS") >= 0 ? stH.indexOf("JENIS") : 4,
        pcs: stH.indexOf("JUMLAH PCS") >= 0 ? stH.indexOf("JUMLAH PCS") : 5,
        netto: stH.indexOf("NETTO KG") >= 0 ? stH.indexOf("NETTO KG") : 6,
        kuli: stH.indexOf("NAMA KULI") >= 0 ? stH.indexOf("NAMA KULI") : 7,
        krani: stH.indexOf("KRANI") >= 0 ? stH.indexOf("KRANI") : 8
      };

      for (let i = 1; i < stData.length; i++) {
        const row = stData[i];
        let rawTgl = row[sIdx.tanggal];
        let tglStr = "-";
        if (rawTgl) {
          if (rawTgl instanceof Date) tglStr = Utilities.formatDate(rawTgl, Session.getScriptTimeZone(), "yyyy-MM-dd");
          else tglStr = String(rawTgl);
        }
        entries.push({
          row_id: i + 1,
          tanggal: tglStr,
          shift: String(row[sIdx.shift] || "-"),
          tim: String(row[sIdx.tim] || "-").toUpperCase(),
          jenis: String(row[sIdx.jenis] || "-").toUpperCase(),
          pcs: Number(row[sIdx.pcs]) || 0,
          netto_kg: Number(row[sIdx.netto]) || 0,
          kuli: String(row[sIdx.kuli] || "-"),
          krani: String(row[sIdx.krani] || "-")
        });
      }
    }

    // 3. Calculate pallet summary
    const tims = ["BADRUN", "KARTONO", "WAWAN", "SURYANA", "SAHLAN"];
    const summary = {};
    let totalBongkaran = 0, totalStapel = 0;

    tims.forEach(t => {
      let bongkaranPcs = 0, stapelPcs = 0;
      entries.forEach(e => {
        if (e.tim === t) {
          if (e.jenis === "BONGKARAN") bongkaranPcs += e.pcs;
          else if (e.jenis === "STAPEL") stapelPcs += e.pcs;
        }
      });
      totalBongkaran += bongkaranPcs;
      totalStapel += stapelPcs;
      summary[t] = {
        stock_awal: stockAwal[t] || 0,
        bongkaran: bongkaranPcs,
        stapel: stapelPcs,
        pr_remaining: (stockAwal[t] || 0) + bongkaranPcs - stapelPcs
      };
    });

    // Total Pallet Kosong formula: Stock Awal PKosong - Total Bongkaran + Total Stapel
    summary.PALLET_KOSONG = (stockAwal.PALLET_KOSONG || 0) - totalBongkaran + totalStapel;

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: { summary: summary, stockAwal: stockAwal, logs: entries } })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleSaveStafelEntry(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var raw = data;
  const STAFFEL_SHEET = "STAFFEL_LOG";
  let sSheet = ss.getSheetByName(STAFFEL_SHEET);
  if (!sSheet) {
    sSheet = ss.insertSheet(STAFFEL_SHEET);
    sSheet.appendRow(["Timestamp", "Tanggal", "Shift", "Tim", "Jenis", "Jumlah Pcs", "Netto Kg", "Nama Kuli", "Krani"]);
  }

  const ts = new Date();
  const pcs = Number(raw.pcs || raw.jumlah_pcs) || 0;
  const nettoKg = Number(raw.netto_kg) || (pcs * 50);
  const namaKuli = raw.kuli || raw.nama_kuli || "-";
  sSheet.appendRow([
    ts,
    raw.tanggal || "-",
    raw.shift || "-",
    raw.tim || "-",
    raw.jenis || "-",
    pcs,
    nettoKg,
    namaKuli,
    raw.krani || "-"
  ]);

  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdateStafelStock(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var raw = data;
  const STAFFEL_CONFIG = "STAFFEL_CONFIG";
  let cSheet = ss.getSheetByName(STAFFEL_CONFIG);

  if (!cSheet) { cSheet = ss.insertSheet(STAFFEL_CONFIG); }
  else { cSheet.clear(); }

  cSheet.appendRow(["TIM KERJA", "SISA PALLET AWAL"]);
  Object.keys(raw.stocks).forEach(k => {
    cSheet.appendRow([k, raw.stocks[k]]);
  });

  return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Stock Awal Diperbarui" })).setMimeType(ContentService.MimeType.JSON);
}

// === HANDLERS FOR LENGKAPI DATA NETTO ===

function handleGetData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bSheet = ss.getSheetByName(SHEET_BONGKARAN);
  const mSheet = ss.getSheetByName(SHEET_MUATAN);
  const pendingKranis = new Set();
  
  const processSheet = (sheet) => {
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    const headers = data[0].map(h => String(h).toUpperCase());
    const idx = {
      netto: headers.indexOf("NETTO (KG)"),
      krani: headers.indexOf("NAMA KRANI") >= 0 ? headers.indexOf("NAMA KRANI") : headers.indexOf("KRANI BONGKAR")
    };
    
    if (idx.netto === -1 || idx.krani === -1) return;
    
    for (let i = 1; i < data.length; i++) {
      const netto = String(data[i][idx.netto] || "").trim();
      const krani = String(data[i][idx.krani] || "").trim();
      if (krani && (!netto || netto === "0" || netto === "-" || netto === "")) {
        pendingKranis.add(krani.toUpperCase());
      }
    }
  };

  processSheet(bSheet);
  processSheet(mSheet);

  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    pendingKranis: Array.from(pendingKranis).sort() 
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleGetTaskQueue(e) {
  const name = (e.parameter.name || "").toUpperCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bSheet = ss.getSheetByName(SHEET_BONGKARAN);
  const mSheet = ss.getSheetByName(SHEET_MUATAN);
  const tasks = [];

  const processSheet = (sheet, type) => {
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    const headers = data[0].map(h => String(h).toUpperCase());
    const idx = {
      nopol: findH(headers, ["NOPOL", "PLAT"]),
      netto: headers.indexOf("NETTO (KG)"),
      krani: headers.indexOf("NAMA KRANI") >= 0 ? headers.indexOf("NAMA KRANI") : headers.indexOf("KRANI BONGKAR"),
      material: findH(headers, ["JENIS RM", "MATERIAL"]),
      tanggal: headers.indexOf("TANGGAL") >= 0 ? headers.indexOf("TANGGAL") : 0
    };

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const krani = String(row[idx.krani] || "").toUpperCase().trim();
      const netto = String(row[idx.netto] || "").trim();
      
      if (krani === name && (!netto || netto === "0" || netto === "-" || netto === "")) {
        tasks.push({
          row_id: i + 1,
          sheet_name: sheet.getName(),
          nopol: String(row[idx.nopol] || "-"),
          material: String(row[idx.material] || "-"),
          tanggal: row[idx.tanggal] instanceof Date ? Utilities.formatDate(row[idx.tanggal], Session.getScriptTimeZone(), "dd/MM/yyyy") : String(row[idx.tanggal] || "-")
        });
      }
    }
  };

  processSheet(bSheet, "BONGKAR");
  processSheet(mSheet, "MUAT");

  return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdateNetto(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(data.sheet_name);
  if (!sheet) throw new Error("Sheet tidak ditemukan: " + data.sheet_name);
  
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase());
  const nettoIdx = headers.indexOf("NETTO (KG)") + 1;
  const ketIdx = headers.indexOf("KETERANGAN") + 1;
  
  if (nettoIdx === 0) throw new Error("Kolom Netto (KG) tidak ditemukan di sheet " + data.sheet_name);
  
  // Update Netto
  sheet.getRange(data.row_id, nettoIdx).setValue(data.netto);
  
  // Update Keterangan jika ada kolomnya dan ada datanya
  if (ketIdx > 0 && data.keterangan !== undefined) {
    sheet.getRange(data.row_id, ketIdx).setValue(data.keterangan);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    message: "Data berhasil diperbarui" + (ketIdx === 0 && data.keterangan ? " (Peringatan: Kolom KETERANGAN tidak ditemukan)" : "")
  })).setMimeType(ContentService.MimeType.JSON);
}
