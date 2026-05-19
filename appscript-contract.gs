/**
 * WAREHOUSE EMPLOYEE CONTRACT MANAGEMENT SYSTEM
 * Backend: Google Apps Script
 * Spreadsheet ID: 16MJ1O6lcOhhPOZj1m3yu3CxXkYRiDSmz0RPPQ1NQhtU
 */

var SPREADSHEET_ID = "16MJ1O6lcOhhPOZj1m3yu3CxXkYRiDSmz0RPPQ1NQhtU";

function getSS() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {
    Logger.log("Running standalone: " + e.toString());
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  // Handle REST API calls from standalone HTML via fetch()
  if (e && e.parameter && e.parameter.action) {
    var action = e.parameter.action;
    var result;
    
    if (action === "getKaryawan") {
      result = getKaryawan(e.parameter.atasan || "");
    } else if (action === "getDaftarAtasan") {
      result = getDaftarAtasan();
    } else if (action === "getHistoryPenilaian") {
      result = getHistoryPenilaian(e.parameter.nik || "");
    } else {
      result = { error: "Unknown action: " + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return HtmlService.createHtmlOutputFromFile('hr-contract-management')
    .setTitle('Monitoring Kontrak Karyawan')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var result;
    
    if (action === "simpanPenilaian") {
      result = simpanPenilaian(payload.data);
    } else {
      result = { success: false, error: "Unknown action: " + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * HELPER: Parse Date from Frontend (YYYY-MM-DD) to Backend (DD/MM/YYYY)
 */
function parseDateFrontendToBackend(dateStr) {
  if (!dateStr) return "";
  var parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }
  return dateStr;
}

/**
 * HELPER: Parse Date from Backend (Date object or DD/MM/YYYY) to Frontend (YYYY-MM-DD)
 */
function parseDateBackendToFrontend(dateVal) {
  if (!dateVal) return "";
  if (dateVal instanceof Date) {
    var y = dateVal.getFullYear();
    var m = String(dateVal.getMonth() + 1).padStart(2, '0');
    var d = String(dateVal.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  var dateStr = String(dateVal).trim();
  if (dateStr.indexOf('/') !== -1) {
    var parts = dateStr.split('/');
    if (parts.length === 3) {
      return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
    }
  }
  if (dateStr.indexOf('-') !== -1) {
    var parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return dateStr;
    }
  }
  return dateStr;
}

/**
 * Get Sheet or create it with headers if not exists
 */
function getOrCreateSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
  }
  return sheet;
}

/**
 * Get list of employees filtered by supervisor login
 */
function getKaryawan(atasanLogin) {
  try {
    var ss = getSS();
    
    // 1. Ambil data dari Sheet1 (Master Karyawan)
    var sheet1 = ss.getSheetByName("Sheet1");
    if (!sheet1) {
      throw new Error("Sheet1 tidak ditemukan di spreadsheet.");
    }
    
    // Ambil HANYA baris yang ada datanya menggunakan getLastRow() — otomatis bertambah jika admin tambah data baru
    var lastRow = sheet1.getLastRow();
    if (lastRow < 3) return []; // Tidak ada data karyawan
    var totalRowsToRead = lastRow - 2; // Baris 1=header kosong, Baris 2=header kolom, data mulai baris 3
    var dataRange = sheet1.getRange(3, 2, totalRowsToRead, 6); // Col B to G (B: NO, C: NAMA, D: NIK, E: BAGIAN, F: PT, G: ATASAN LANGSUNG)
    var values = dataRange.getValues();
    
    // 2. Ambil data kontrak aktif dari DATA_KONTRAK
    var headers = ["NIK", "NAMA", "GRADE", "KONTRAK_LAMA_BERAKHIR", "TANGGUNG_JAWAB", "DISIPLIN", "SKILL", "ATTITUDE", "KEHADIRAN", "TOTAL_NILAI", "KEPUTUSAN", "DURASI_PERPANJANG", "SATUAN_DURASI", "KONTRAK_BARU_BERAKHIR", "TANGGAL_DINILAI", "DINILAI_OLEH"];
    var sheetKontrak = getOrCreateSheet(ss, "DATA_KONTRAK", headers);
    
    var kontrakValues = [];
    var lastRowKontrak = sheetKontrak.getLastRow();
    if (lastRowKontrak > 1) {
      kontrakValues = sheetKontrak.getRange(2, 1, lastRowKontrak - 1, headers.length).getValues();
    }
    
    // Map kontrak by NIK
    var kontrakMap = {};
    for (var i = 0; i < kontrakValues.length; i++) {
      var row = kontrakValues[i];
      var nikKey = String(row[0]).trim();
      if (nikKey) {
        kontrakMap[nikKey] = {
          grade: row[2],
          kontrakLamaBerakhir: parseDateBackendToFrontend(row[3]),
          tanggungJawab: row[4],
          disiplin: row[5],
          skill: row[6],
          attitude: row[7],
          kehadiran: row[8],
          totalNilai: row[9],
          keputusan: row[10],
          durasiPerpanjang: row[11],
          satuanDurasi: row[12],
          kontrakBaruBerakhir: parseDateBackendToFrontend(row[13]),
          tanggalDinilai: parseDateBackendToFrontend(row[14]),
          dinilaiOleh: row[15]
        };
      }
    }
    
    // 3. Gabungkan data & filter
    var result = [];
    var searchAtasan = String(atasanLogin).trim().toUpperCase();
    
    for (var j = 0; j < values.length; j++) {
      var empRow = values[j];
      var empNama = String(empRow[1]).trim();
      var empNik = String(empRow[2]).trim();
      
      // Jika NIK atau NAMA kosong, skip baris kosong/placeholder di spreadsheet
      if (!empNama || !empNik) {
        continue;
      }
      
      var empBagian = String(empRow[3]).trim();
      var empPt = String(empRow[4]).trim();
      var empAtasan = String(empRow[5]).trim();
      
      // Filter by Supervisor
      if (searchAtasan !== "CECEP" && empAtasan.toUpperCase() !== searchAtasan) {
        continue;
      }
      
      var hasContract = kontrakMap.hasOwnProperty(empNik);
      var contract = hasContract ? kontrakMap[empNik] : {};
      
      result.push({
        nik: empNik,
        nama: empNama,
        bagian: empBagian,
        pt: empPt,
        atasan: empAtasan,
        grade: contract.grade || "",
        kontrakLamaBerakhir: contract.kontrakLamaBerakhir || "",
        kontrakBaruBerakhir: contract.kontrakBaruBerakhir || "",
        totalNilai: contract.totalNilai !== undefined ? contract.totalNilai : null,
        keputusan: contract.keputusan || "",
        tanggalDinilai: contract.tanggalDinilai || "",
        sudahDinilai: hasContract,
        tanggungJawab: contract.tanggungJawab !== undefined ? contract.tanggungJawab : null,
        disiplin: contract.disiplin !== undefined ? contract.disiplin : null,
        skill: contract.skill !== undefined ? contract.skill : null,
        attitude: contract.attitude !== undefined ? contract.attitude : null,
        kehadiran: contract.kehadiran !== undefined ? contract.kehadiran : null,
        durasiPerpanjang: contract.durasiPerpanjang !== undefined ? contract.durasiPerpanjang : null,
        satuanDurasi: contract.satuanDurasi || ""
      });
    }
    
    return result;
  } catch (e) {
    Logger.log("Error in getKaryawan: " + e.toString());
    throw new Error("Gagal mengambil data karyawan: " + e.toString());
  }
}

/**
 * Get all unique supervisors for login dropdown
 */
function getDaftarAtasan() {
  try {
    var ss = getSS();
    var sheet1 = ss.getSheetByName("Sheet1");
    if (!sheet1) return ["CECEP"];
    
    // Ambil HANYA baris yang ada datanya — otomatis bertambah jika admin tambah data baru
    var lastRow = sheet1.getLastRow();
    if (lastRow < 3) return ["CECEP"];
    var totalRowsToRead = lastRow - 2;
    var values = sheet1.getRange(3, 7, totalRowsToRead, 1).getValues(); // Column G (ATASAN LANGSUNG)
    
    var atasanMap = {};
    for (var i = 0; i < values.length; i++) {
      var val = String(values[i][0]).trim().toUpperCase();
      if (val && val !== "ATASAN LANGSUNG" && val !== "G" && val !== "NO") {
        atasanMap[val] = true;
      }
    }
    
    // Always ensure CECEP is in the list
    atasanMap["CECEP"] = true;
    
    var uniqueList = Object.keys(atasanMap).sort();
    return uniqueList;
  } catch (e) {
    Logger.log("Error in getDaftarAtasan: " + e.toString());
    return ["CECEP"];
  }
}

/**
 * Save contract assessment (Insert/Update in DATA_KONTRAK and Append in HISTORY_PENILAIAN)
 */
function simpanPenilaian(data) {
  try {
    var ss = getSS();
    var headers = ["NIK", "NAMA", "GRADE", "KONTRAK_LAMA_BERAKHIR", "TANGGUNG_JAWAB", "DISIPLIN", "SKILL", "ATTITUDE", "KEHADIRAN", "TOTAL_NILAI", "KEPUTUSAN", "DURASI_PERPANJANG", "SATUAN_DURASI", "KONTRAK_BARU_BERAKHIR", "TANGGAL_DINILAI", "DINILAI_OLEH"];
    
    var sheetKontrak = getOrCreateSheet(ss, "DATA_KONTRAK", headers);
    var sheetHistory = getOrCreateSheet(ss, "HISTORY_PENILAIAN", headers);
    
    var searchNik = String(data.nik).trim();
    var lastRow = sheetKontrak.getLastRow();
    
    // Formulate row values
    var rowValues = [
      searchNik,
      data.nama,
      data.grade || "",
      parseDateFrontendToBackend(data.kontrakLamaBerakhir),
      data.tanggungJawab,
      data.disiplin,
      data.skill,
      data.attitude,
      data.kehadiran,
      data.totalNilai,
      data.keputusan,
      data.keputusan === "diperpanjang" ? data.durasiPerpanjang : null,
      data.keputusan === "diperpanjang" ? data.satuanDurasi : null,
      data.keputusan === "diperpanjang" ? parseDateFrontendToBackend(data.kontrakBaruBerakhir) : null,
      parseDateFrontendToBackend(data.tanggalDinilai),
      data.dinilaiOleh
    ];
    
    // 1. Update or Insert in DATA_KONTRAK
    var foundIndex = -1;
    if (lastRow > 1) {
      var nids = sheetKontrak.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < nids.length; i++) {
        if (String(nids[i][0]).trim() === searchNik) {
          foundIndex = i + 2; // row index is 1-based, offset by 2 (header and 0-indexing)
          break;
        }
      }
    }
    
    if (foundIndex !== -1) {
      sheetKontrak.getRange(foundIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheetKontrak.appendRow(rowValues);
    }
    
    // 2. Append to HISTORY_PENILAIAN
    sheetHistory.appendRow(rowValues);
    
    return { success: true };
  } catch (e) {
    Logger.log("Error in simpanPenilaian: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Get assessment history for a specific employee NIK
 */
function getHistoryPenilaian(nik) {
  try {
    var ss = getSS();
    var headers = ["NIK", "NAMA", "GRADE", "KONTRAK_LAMA_BERAKHIR", "TANGGUNG_JAWAB", "DISIPLIN", "SKILL", "ATTITUDE", "KEHADIRAN", "TOTAL_NILAI", "KEPUTUSAN", "DURASI_PERPANJANG", "SATUAN_DURASI", "KONTRAK_BARU_BERAKHIR", "TANGGAL_DINILAI", "DINILAI_OLEH"];
    
    var sheetHistory = getOrCreateSheet(ss, "HISTORY_PENILAIAN", headers);
    var lastRow = sheetHistory.getLastRow();
    if (lastRow < 2) return [];
    
    var values = sheetHistory.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var searchNik = String(nik).trim();
    
    var historyList = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      if (String(row[0]).trim() === searchNik) {
        historyList.push({
          nik: String(row[0]).trim(),
          nama: row[1],
          grade: row[2],
          kontrakLamaBerakhir: parseDateBackendToFrontend(row[3]),
          tanggungJawab: row[4],
          disiplin: row[5],
          skill: row[6],
          attitude: row[7],
          kehadiran: row[8],
          totalNilai: row[9],
          keputusan: row[10],
          durasiPerpanjang: row[11],
          satuanDurasi: row[12],
          kontrakBaruBerakhir: parseDateBackendToFrontend(row[13]),
          tanggalDinilai: parseDateBackendToFrontend(row[14]),
          dinilaiOleh: row[15]
        });
      }
    }
    
    // Sort descending by date (TANGGAL_DINILAI)
    historyList.sort(function(a, b) {
      return new Date(b.tanggalDinilai) - new Date(a.tanggalDinilai);
    });
    
    return historyList;
  } catch (e) {
    Logger.log("Error in getHistoryPenilaian: " + e.toString());
    return [];
  }
}
