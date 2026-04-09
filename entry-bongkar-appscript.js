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

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === "saveSetup") {
      return handleSaveSetup(data);
    } else if (action === "saveGlobalAttendance") {
      return handleSaveGlobalAttendance(data);
    } else if (action === "saveBongkaran") {
      return handleSaveBongkaran(data);
    } else if (action === "saveMuat") {
      return handleSaveMuat(data);
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
    if (e.parameter.action === "getSetup") {
      return handleGetSetup();
    } else if (e.parameter.action === "getGlobalAttendance") {
      return handleGetGlobalAttendance();
    } else if (e.parameter.action === "getPendingLangsiran") {
      return handleGetPendingLangsiran();
    }
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "API Running" }))
                         .setMimeType(ContentService.MimeType.JSON);
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
  const sheet = ss.getSheetByName(SHEET_BONGKARAN);
  if (!sheet) throw new Error("Sheet DATA_BONGKARAN belum dibuat");
  
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
