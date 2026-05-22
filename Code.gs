/**
 * Smart Breakdown - Alat Berat Backend Script
 * Spreadsheet ID: 1DcJRsElu7E9RZkOpyLLiw1hwGV0zdc8XiiwvnL8uNfo
 * 
 * Script ini mendukung dual-mode:
 * 1. Sebagai Web App HTML untuk di-serve langsung di Google Sheets (doGet).
 * 2. Sebagai API JSON (GET & POST) untuk diakses dari file HTML lokal/standalone.
 * 3. Pemanggilan langsung via google.script.run dari dalam HTML.
 */

var SPREADSHEET_ID = "1DcJRsElu7E9RZkOpyLLiw1hwGV0zdc8XiiwvnL8uNfo";

/**
 * 1. doGet(e) - Serve HTML web app atau layani API GET
 */
function doGet(e) {
  // Jika ada parameter action, layani sebagai API JSON (untuk standalone mode)
  if (e && e.parameter && e.parameter.action) {
    return handleGetApi(e);
  }
  
  // Sebaliknya, serve file HTML utama sebagai Web App
  try {
    return HtmlService.createTemplateFromFile("apk-alat-berat")
      .evaluate()
      .setTitle("Smart Breakdown - Alat Berat")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput("<h1>Error Loading App</h1><p>" + err.toString() + "</p>");
  }
}

/**
 * doPost(e) - Layani API POST untuk mutasi data (untuk standalone mode)
 */
function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var payload = postData.payload || {};
    
    var result;
    if (action === "simpanBreakdownAwal") {
      result = simpanBreakdownAwal(payload);
    } else if (action === "lengkapiBreakdownAkhir") {
      result = lengkapiBreakdownAkhir(payload.idBreakdown, payload.operatorAkhir, payload.jamSelesaiStr);
    } else {
      throw new Error("Action POST tidak dikenal: " + action);
    }
    
    return createJsonResponse({ success: true, data: result });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handler API GET
 */
function handleGetApi(e) {
  var action = e.parameter.action;
  try {
    var result;
    if (action === "getJenisUnit") {
      result = getJenisUnit();
    } else if (action === "getKategoriKerusakan") {
      result = getKategoriKerusakan(e.parameter.jenisUnit);
    } else if (action === "getRiwayatBreakdown") {
      var filter = {
        tanggal_dari: e.parameter.tanggal_dari || "",
        tanggal_sampai: e.parameter.tanggal_sampai || "",
        jenis_unit: e.parameter.jenis_unit || "",
        type_unit: e.parameter.type_unit || "",
        status: e.parameter.status || "",
        kategori_kerusakan: e.parameter.kategori_kerusakan || "",
        search: e.parameter.search || ""
      };
      result = getRiwayatBreakdown(filter);
    } else if (action === "getDashboardStats") {
      var dashboardFilter = {
        tanggal_dari: e.parameter.tanggal_dari || "",
        tanggal_sampai: e.parameter.tanggal_sampai || "",
        jenis_unit: e.parameter.jenis_unit || "",
        type_unit: e.parameter.type_unit || "",
        status: e.parameter.status || "",
        kategori_kerusakan: e.parameter.kategori_kerusakan || ""
      };
      result = getDashboardStats(dashboardFilter);
    } else {
      throw new Error("Action GET tidak dikenal: " + action);
    }
    return createJsonResponse({ success: true, data: result });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Utilitas membuat respon JSON
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Membuka Spreadsheet secara aman
 */
function getActiveSpreadsheet() {
  try {
    if (SPREADSHEET_ID) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    throw new Error("Gagal membuka Spreadsheet. Periksa ID Spreadsheet atau izin akses: " + e.toString());
  }
}

/**
 * Menginisialisasi sheet RIWAYAT_BREAKDOWN jika belum ada
 */
function initRiwayatSheet(ss) {
  var sheetName = "RIWAYAT_BREAKDOWN";
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    "ID_BREAKDOWN", "TIMESTAMP_INPUT", "JENIS_UNIT", "TYPE_UNIT", "VENDOR", 
    "KATEGORI_KERUSAKAN", "PILHAN_KERUSAKAN", "DETAIL_KERUSAKAN", 
    "OPERATOR_AWAL", "JAM_MULAI", "OPERATOR_AKHIR", "JAM_SELESAI", 
    "DURASI_MENIT", "DURASI_JAM", "STATUS", "FOTO_URL", "KONDISI_OPERASIONAL"
  ];
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    // Format header agar rapi
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold")
               .setBackground("#2563EB")
               .setFontColor("#FFFFFF")
               .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  } else {
    // Self-healing: Pastikan header di baris 1 selalu up-to-date dan kolom sinkron
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight("bold")
               .setBackground("#2563EB")
               .setFontColor("#FFFFFF")
               .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 2. getJenisUnit() - Ambil data dari sheet JENIS UNIT
 */
function getJenisUnit() {
  try {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName("JENIS UNIT");
    if (!sheet) {
      throw new Error("Sheet 'JENIS UNIT' tidak ditemukan.");
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return [];
    
    // Ambil kolom B (Jenis Unit), C (Type Unit), D (Vendor) mulai baris 3
    var range = sheet.getRange(3, 2, lastRow - 2, 3);
    var values = range.getValues();
    
    var list = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var jenis = String(row[0]).trim();
      var type = String(row[1]).trim();
      var vendor = String(row[2]).trim();
      
      if (jenis && type) {
        list.push({
          jenisUnit: jenis.toUpperCase(),
          typeUnit: type,
          vendor: vendor || "-"
        });
      }
    }
    return list;
  } catch (err) {
    Logger.log("Error getJenisUnit: " + err.toString());
    throw new Error("Gagal mengambil Jenis Unit: " + err.message);
  }
}

/**
 * 3. getKategoriKerusakan(jenisUnit) - Ambil kategori kerusakan dari FORKLIFT atau LOADER
 */
function getKategoriKerusakan(jenisUnit) {
  try {
    if (!jenisUnit) throw new Error("Parameter 'jenisUnit' wajib diisi.");
    jenisUnit = jenisUnit.toUpperCase();
    
    if (jenisUnit !== "FORKLIFT" && jenisUnit !== "LOADER") {
      throw new Error("Jenis unit harus FORKLIFT atau LOADER.");
    }
    
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(jenisUnit);
    if (!sheet) {
      throw new Error("Sheet '" + jenisUnit + "' tidak ditemukan.");
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return [];
    
    // Kolom B: Kategori Kerusakan, Kolom C: Pilihan Kerusakan
    var range = sheet.getRange(3, 2, lastRow - 2, 2);
    var values = range.getValues();
    
    var categoriesMap = {};
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var kategori = String(row[0]).trim();
      var pilihan = String(row[1]).trim();
      
      if (kategori && pilihan) {
        // Bersihkan nama kategori dari tanda kurung jika ada (misal "(ENGINE)" -> "ENGINE")
        var cleanKategori = kategori.replace(/^\(|\)$/g, "").toUpperCase();
        
        if (!categoriesMap[cleanKategori]) {
          categoriesMap[cleanKategori] = [];
        }
        categoriesMap[cleanKategori].push(pilihan);
      }
    }
    
    // Konversi ke format array of objects
    var result = [];
    for (var catName in categoriesMap) {
      result.push({
        kategori: catName,
        pilihanKerusakan: categoriesMap[catName]
      });
    }
    return result;
  } catch (err) {
    Logger.log("Error getKategoriKerusakan: " + err.toString());
    throw new Error("Gagal mengambil Kategori Kerusakan: " + err.message);
  }
}

/**
 * 4. simpanBreakdownAwal(data) - Simpan data breakdown awal
 */
function simpanBreakdownAwal(data) {
  try {
    var ss = getActiveSpreadsheet();
    var sheet = initRiwayatSheet(ss);
    
    // Validasi data input
    if (!data.jenisUnit || !data.typeUnit || !data.kategoriKerusakan || !data.pilihanKerusakan || !data.operatorAwal || !data.jamMulai) {
      throw new Error("Data input breakdown awal tidak lengkap.");
    }
    
    // 1. Generate ID Unik: BD-[NAMAUNIT]/[3_DIGIT_SEQ]
    var unitClean = String(data.typeUnit).replace(/\s+/g, '').toUpperCase();
    var idPrefix = "BD-" + unitClean + "/";
    
    var lastRow = sheet.getLastRow();
    var count = 0;
    if (lastRow > 1) {
      // Kolom D (index 4) adalah TYPE_UNIT
      var typeUnits = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
      for (var i = 0; i < typeUnits.length; i++) {
        if (String(typeUnits[i][0]).trim().toLowerCase() === String(data.typeUnit).trim().toLowerCase()) {
          count++;
        }
      }
    }
    var seqString = ("000" + (count + 1)).slice(-3);
    var breakdownId = idPrefix + seqString;
    
    // 2. Tentukan Vendor dari master data jika tidak dikirim dari client
    var vendor = data.vendor || "-";
    if (vendor === "-" || !vendor) {
      var units = getJenisUnit();
      var foundUnit = units.find(function(u) {
        return u.typeUnit.toLowerCase() === data.typeUnit.toLowerCase();
      });
      if (foundUnit) {
        vendor = foundUnit.vendor;
      }
    }
    
    // 3. Parsing jamMulai (bisa berupa format ISO string atau date string lengkap)
    var timeMulai = new Date(data.jamMulai);
    if (isNaN(timeMulai.getTime())) {
      timeMulai = new Date(); // Fallback jika gagal parse
    }
    
    // 4. Susun baris baru
    var now = new Date();
    // A: ID_BREAKDOWN | B: TIMESTAMP_INPUT | C: JENIS_UNIT | D: TYPE_UNIT | E: VENDOR 
    // F: KATEGORI_KERUSAKAN | G: PILIHAN_KERUSAKAN | H: DETAIL_KERUSAKAN | I: OPERATOR_AWAL | J: JAM_MULAI
    // K: OPERATOR_AKHIR | L: JAM_SELESAI | M: DURASI_MENIT | N: DURASI_JAM | O: STATUS
    var newRow = [
      breakdownId,
      now,                                  // B: TIMESTAMP_INPUT
      data.jenisUnit.toUpperCase(),         // C: JENIS_UNIT
      data.typeUnit,                        // D: TYPE_UNIT
      vendor,                               // E: VENDOR
      data.kategoriKerusakan.toUpperCase(), // F: KATEGORI_KERUSAKAN
      data.pilihanKerusakan,                // G: PILIHAN_KERUSAKAN
      data.detailKerusakan,                 // H: DETAIL_KERUSAKAN
      data.operatorAwal,                    // I: OPERATOR_AWAL
      timeMulai,                            // J: JAM_MULAI
      "",                                   // K: OPERATOR_AKHIR (kosong saat awal)
      "",                                   // L: JAM_SELESAI (kosong saat awal)
      "",                                   // M: DURASI_MENIT (kosong saat awal)
      "",                                   // N: DURASI_JAM (kosong saat awal)
      "ONGOING",                            // O: STATUS
      data.photoUrl || "",                  // P: FOTO_URL
      data.kondisiOperasional || "BREAKDOWN" // Q: KONDISI_OPERASIONAL
    ];
    
    sheet.appendRow(newRow);
    return breakdownId;
  } catch (err) {
    Logger.log("Error simpanBreakdownAwal: " + err.toString());
    throw new Error("Gagal menyimpan laporan breakdown: " + err.message);
  }
}

/**
 * 5. lengkapiBreakdownAkhir(idBreakdown, operatorAkhir, jamSelesaiStr)
 * Menyelesaikan breakdown, mencatat operator akhir, jam selesai, durasi, dan mengubah status.
 */
function lengkapiBreakdownAkhir(idBreakdown, operatorAkhir, jamSelesaiStr) {
  try {
    if (!idBreakdown) throw new Error("ID Breakdown wajib diisi.");
    if (!operatorAkhir) throw new Error("Nama operator penyelesai wajib diisi.");
    if (!jamSelesaiStr) throw new Error("Jam selesai wajib diisi.");
    
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName("RIWAYAT_BREAKDOWN");
    if (!sheet) {
      throw new Error("Sheet RIWAYAT_BREAKDOWN belum diinisialisasi.");
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      throw new Error("Tidak ada data breakdown.");
    }
    
    var idRange = sheet.getRange(2, 1, lastRow - 1, 1);
    var ids = idRange.getValues();
    
    var targetRowIndex = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === idBreakdown.trim()) {
        targetRowIndex = i + 2; // Baris riil di excel (+2 karena index 0 dan header)
        break;
      }
    }
    
    if (targetRowIndex === -1) {
      throw new Error("Laporan Breakdown dengan ID '" + idBreakdown + "' tidak ditemukan.");
    }
    
    // Ambil JAM_MULAI dari baris target (Kolom J = 10)
    var cellJamMulai = sheet.getRange(targetRowIndex, 10).getValue();
    var timeMulai = new Date(cellJamMulai);
    if (isNaN(timeMulai.getTime())) {
      throw new Error("Waktu mulai breakdown tidak valid di sheet.");
    }
    
    // Parse Jam Selesai dari parameter input
    var timeSelesai = new Date(jamSelesaiStr);
    if (isNaN(timeSelesai.getTime())) {
      timeSelesai = new Date(); // Fallback jika gagal parse
    }
    
    // Pengamanan kalkulasi: Jika Jam Selesai mendahului Jam Mulai
    if (timeSelesai.getTime() < timeMulai.getTime()) {
      throw new Error("Waktu selesai tidak boleh lebih awal dari waktu mulai breakdown.");
    }
    
    // Hitung selisih waktu
    var diffMs = timeSelesai.getTime() - timeMulai.getTime();
    var durasiMenit = Math.round(diffMs / (60 * 1000));
    var durasiJam = Number((durasiMenit / 60).toFixed(2));
    
    // Update baris target di sheet
    // K: OPERATOR_AKHIR (11) | L: JAM_SELESAI (12) | M: DURASI_MENIT (13) | N: DURASI_JAM (14) | O: STATUS (15)
    sheet.getRange(targetRowIndex, 11).setValue(operatorAkhir);
    sheet.getRange(targetRowIndex, 12).setValue(timeSelesai);
    sheet.getRange(targetRowIndex, 13).setValue(durasiMenit);
    sheet.getRange(targetRowIndex, 14).setValue(durasiJam);
    sheet.getRange(targetRowIndex, 15).setValue("SELESAI");
    
    return {
      idBreakdown: idBreakdown,
      durasiMenit: durasiMenit,
      durasiJam: durasiJam,
      status: "SELESAI"
    };
  } catch (err) {
    Logger.log("Error lengkapiBreakdownAkhir: " + err.toString());
    throw new Error("Gagal menyelesaikan laporan breakdown: " + err.message);
  }
}

/**
 * 6. getRiwayatBreakdown(filter) - Ambil riwayat breakdown terfilter
 */
function getRiwayatBreakdown(filter) {
  try {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName("RIWAYAT_BREAKDOWN");
    if (!sheet) {
      return []; // Return kosong jika belum ada transaksi
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    
    var range = sheet.getRange(2, 1, lastRow - 1, 17);
    var values = range.getValues();
    
    var list = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var id = String(row[0]).trim();
      var timestamp = row[1];
      var jenis = String(row[2]).trim();
      var type = String(row[3]).trim();
      var vendor = String(row[4]).trim();
      var kategori = String(row[5]).trim();
      var pilihan = String(row[6]).trim();
      var detail = String(row[7]).trim();
      var opAwal = String(row[8]).trim();
      var jamMulai = row[9];
      var opAkhir = String(row[10]).trim();
      var jamSelesai = row[11];
      var durasiMenit = row[12];
      var durasiJam = row[13];
      var status = String(row[14]).trim();
      var photoUrl = row.length > 15 ? String(row[15]).trim() : "";
      var kondisiOperasional = row.length > 16 ? String(row[16]).trim() : "BREAKDOWN";
      
      // Persiapkan konversi Tanggal untuk client-side
      var jamMulaiStr = jamMulai instanceof Date ? Utilities.formatDate(jamMulai, "GMT+7", "yyyy-MM-dd'T'HH:mm") : String(jamMulai);
      var jamSelesaiStr = jamSelesai instanceof Date ? Utilities.formatDate(jamSelesai, "GMT+7", "yyyy-MM-dd'T'HH:mm") : String(jamSelesai);
      
      var item = {
        idBreakdown: id,
        timestamp: timestamp instanceof Date ? Utilities.formatDate(timestamp, "GMT+7", "yyyy-MM-dd HH:mm:ss") : String(timestamp),
        jenisUnit: jenis,
        typeUnit: type,
        vendor: vendor,
        kategoriKerusakan: kategori,
        pilihanKerusakan: pilihan,
        detailKerusakan: detail,
        operatorAwal: opAwal,
        jamMulai: jamMulaiStr,
        operatorAkhir: opAkhir || "-",
        jamSelesai: jamSelesai ? jamSelesaiStr : "-",
        durasiMenit: durasiMenit !== "" ? Number(durasiMenit) : null,
        durasiJam: durasiJam !== "" ? Number(durasiJam) : null,
        status: status || "ONGOING",
        photoUrl: photoUrl || "",
        kondisiOperasional: kondisiOperasional || "BREAKDOWN"
      };
      
      // Terapkan Filter
      if (filter) {
        var match = true;
        
        // Filter rentang tanggal (berdasarkan JAM_MULAI)
        if (filter.tanggal_dari) {
          var dateDari = new Date(filter.tanggal_dari + "T00:00:00+07:00");
          var dateMulai = jamMulai instanceof Date ? jamMulai : new Date(jamMulai);
          if (!isNaN(dateDari.getTime()) && !isNaN(dateMulai.getTime()) && dateMulai < dateDari) {
            match = false;
          }
        }
        
        if (filter.tanggal_sampai) {
          var dateSampai = new Date(filter.tanggal_sampai + "T23:59:59+07:00");
          var dateMulai = jamMulai instanceof Date ? jamMulai : new Date(jamMulai);
          if (!isNaN(dateSampai.getTime()) && !isNaN(dateMulai.getTime()) && dateMulai > dateSampai) {
            match = false;
          }
        }
        
        // Filter dropdown
        if (filter.jenis_unit && item.jenisUnit.toLowerCase() !== filter.jenis_unit.toLowerCase()) {
          match = false;
        }
        if (filter.type_unit && item.typeUnit.toLowerCase() !== filter.type_unit.toLowerCase()) {
          match = false;
        }
        if (filter.status && item.status.toLowerCase() !== filter.status.toLowerCase()) {
          match = false;
        }
        if (filter.kategori_kerusakan && item.kategoriKerusakan.toLowerCase() !== filter.kategori_kerusakan.toLowerCase()) {
          match = false;
        }
        
        // Filter Search Bar (Cocokkan dengan ID, Type, Pilihan, Operator)
        if (filter.search) {
          var searchLower = filter.search.toLowerCase();
          var idMatch = item.idBreakdown.toLowerCase().indexOf(searchLower) > -1;
          var typeMatch = item.typeUnit.toLowerCase().indexOf(searchLower) > -1;
          var choiceMatch = item.pilihanKerusakan.toLowerCase().indexOf(searchLower) > -1;
          var detailMatch = item.detailKerusakan.toLowerCase().indexOf(searchLower) > -1;
          var opMatch = item.operatorAwal.toLowerCase().indexOf(searchLower) > -1 || item.operatorAkhir.toLowerCase().indexOf(searchLower) > -1;
          
          if (!idMatch && !typeMatch && !choiceMatch && !detailMatch && !opMatch) {
            match = false;
          }
        }
        
        if (match) {
          list.push(item);
        }
      } else {
        list.push(item);
      }
    }
    
    // Urutkan berdasarkan ID secara descending (terbaru dulu)
    list.sort(function(a, b) {
      return b.idBreakdown.localeCompare(a.idBreakdown);
    });
    
    return list;
  } catch (err) {
    Logger.log("Error getRiwayatBreakdown: " + err.toString());
    throw new Error("Gagal memuat Riwayat Breakdown: " + err.message);
  }
}

/**
 * 7. getDashboardStats(filter) - Hitung data statistik agregat dashboard
 */
function getDashboardStats(filter) {
  try {
    var riwayat = getRiwayatBreakdown(filter); // Ambil riwayat yang sesuai filter saat ini
    
    var totalBreakdown = riwayat.length;
    var ongoingCount = 0;
    var completedCount = 0;
    var totalDurasiMenit = 0;
    
    var breakdownBulanIni = 0;
    var now = new Date();
    var currentMonthYear = Utilities.formatDate(now, "GMT+7", "yyyy-MM");
    
    var unitCountMap = {};       // Sebaran per Type Unit
    var categoryCountMap = {};   // Sebaran per Kategori Kerusakan
    var choiceCountMap = {};     // Sebaran per Pilihan Kerusakan
    
    var weeklyCountMap = {};     // Tren breakdown mingguan
    var weeklyDurationMap = {};  // Durasi per minggu
    
    for (var i = 0; i < riwayat.length; i++) {
      var item = riwayat[i];
      var isOngoing = item.status.toLowerCase() === "ongoing";
      
      if (isOngoing) {
        ongoingCount++;
      } else {
        completedCount++;
        if (item.durasiMenit) {
          totalDurasiMenit += item.durasiMenit;
        }
      }
      
      // Ambil timestamp dari ID (BD-YYYYMMDD-XXXX) atau parse jamMulai
      var datePart = "";
      if (item.idBreakdown && item.idBreakdown.length >= 11) {
        datePart = item.idBreakdown.substring(3, 11); // "20260519"
      }
      
      if (datePart) {
        var year = datePart.substring(0, 4);
        var month = datePart.substring(4, 6);
        var itemMonthYear = year + "-" + month;
        if (itemMonthYear === currentMonthYear) {
          breakdownBulanIni++;
        }
      }
      
      // Agregasi Type Unit (Forklift / Loader)
      var unitKey = item.typeUnit;
      if (!unitCountMap[unitKey]) {
        unitCountMap[unitKey] = {
          typeUnit: unitKey,
          jenisUnit: item.jenisUnit,
          vendor: item.vendor,
          count: 0,
          totalDurasi: 0,
          completedCount: 0
        };
      }
      unitCountMap[unitKey].count++;
      if (!isOngoing && item.durasiMenit) {
        unitCountMap[unitKey].totalDurasi += item.durasiMenit;
        unitCountMap[unitKey].completedCount++;
      }
      
      // Agregasi Kategori Kerusakan
      var catKey = item.kategoriKerusakan.toUpperCase();
      if (!categoryCountMap[catKey]) {
        categoryCountMap[catKey] = 0;
      }
      categoryCountMap[catKey]++;
      
      // Agregasi Pilihan Kerusakan
      var choiceKey = item.pilihanKerusakan;
      if (!choiceCountMap[choiceKey]) {
        choiceCountMap[choiceKey] = 0;
      }
      choiceCountMap[choiceKey]++;
      
      // Agregasi Mingguan (4 minggu terakhir / trend)
      // Dapatkan nomor minggu
      var dateObj = new Date(item.jamMulai);
      if (!isNaN(dateObj.getTime())) {
        var weekLabel = getWeekLabel(dateObj);
        
        if (!weeklyCountMap[weekLabel]) {
          weeklyCountMap[weekLabel] = 0;
          weeklyDurationMap[weekLabel] = { total: 0, count: 0 };
        }
        weeklyCountMap[weekLabel]++;
        if (!isOngoing && item.durasiMenit) {
          weeklyDurationMap[weekLabel].total += item.durasiMenit;
          weeklyDurationMap[weekLabel].count++;
        }
      }
    }
    
    // 1. Rata-rata Durasi
    var avgDurasiMenit = completedCount > 0 ? Math.round(totalDurasiMenit / completedCount) : 0;
    var avgDurasiJam = Number((avgDurasiMenit / 60).toFixed(2));
    
    // Format rata-rata durasi string: "X jam Y menit"
    var avgDurasiString = "-";
    if (avgDurasiMenit > 0) {
      var h = Math.floor(avgDurasiMenit / 60);
      var m = avgDurasiMenit % 60;
      if (h > 0) {
        avgDurasiString = h + " jam " + m + " menit";
      } else {
        avgDurasiString = m + " menit";
      }
    }
    
    // 2. Breakdown per Jenis Unit (Forklift vs Loader)
    var forkliftCount = riwayat.filter(function(r) { return r.jenisUnit.toUpperCase() === "FORKLIFT"; }).length;
    var loaderCount = riwayat.filter(function(r) { return r.jenisUnit.toUpperCase() === "LOADER"; }).length;
    
    // 3. Konversi unitCountMap ke array & sorting untuk Unit Paling Sering Breakdown
    var unitBreakdownList = [];
    for (var uKey in unitCountMap) {
      var itemMap = unitCountMap[uKey];
      var avgUnitMenit = itemMap.completedCount > 0 ? Math.round(itemMap.totalDurasi / itemMap.completedCount) : 0;
      var avgUnitJam = Number((avgUnitMenit / 60).toFixed(1));
      
      var avgUnitString = "-";
      if (avgUnitMenit > 0) {
        var uh = Math.floor(avgUnitMenit / 60);
        var um = avgUnitMenit % 60;
        avgUnitString = uh > 0 ? (uh + "j " + um + "m") : (um + "m");
      }
      
      unitBreakdownList.push({
        typeUnit: itemMap.typeUnit,
        jenisUnit: itemMap.jenisUnit,
        vendor: itemMap.vendor,
        count: itemMap.count,
        avgDurasi: avgUnitString,
        avgDurasiJam: avgUnitJam
      });
    }
    // Urutkan dari breakdown terbanyak
    unitBreakdownList.sort(function(a, b) { return b.count - a.count; });
    
    // 4. Konversi Kategori Kerusakan ke Array
    var categoryStats = [];
    for (var cKey in categoryCountMap) {
      var percent = totalBreakdown > 0 ? Math.round((categoryCountMap[cKey] / totalBreakdown) * 100) : 0;
      categoryStats.push({
        kategori: cKey,
        count: categoryCountMap[cKey],
        percentage: percent
      });
    }
    categoryStats.sort(function(a, b) { return b.count - a.count; });
    
    // 5. Konversi Pilihan Kerusakan ke Array & Top 10
    var topChoices = [];
    for (var chKey in choiceCountMap) {
      topChoices.push({
        pilihan: chKey,
        count: choiceCountMap[chKey]
      });
    }
    topChoices.sort(function(a, b) { return b.count - a.count; });
    var top10Choices = topChoices.slice(0, 10);
    
    // 6. Tren Mingguan
    var weeklyTrend = [];
    var sortedWeeks = Object.keys(weeklyCountMap).sort();
    // Ambil 4 minggu terakhir jika ada banyak
    if (sortedWeeks.length > 4) {
      sortedWeeks = sortedWeeks.slice(-4);
    }
    for (var w = 0; w < sortedWeeks.length; w++) {
      var label = sortedWeeks[w];
      var weekStats = weeklyDurationMap[label];
      var avgMin = weekStats.count > 0 ? Math.round(weekStats.total / weekStats.count) : 0;
      weeklyTrend.push({
        week: label,
        count: weeklyCountMap[label],
        avgDurasiJam: Number((avgMin / 60).toFixed(1))
      });
    }
    
    return {
      kpi: {
        totalBreakdown: totalBreakdown,
        breakdownBulanIni: breakdownBulanIni,
        ongoingCount: ongoingCount,
        avgDurasiMenit: avgDurasiMenit,
        avgDurasiJam: avgDurasiJam,
        avgDurasiString: avgDurasiString
      },
      jenisUnitShare: {
        forklift: forkliftCount,
        loader: loaderCount
      },
      topUnits: unitBreakdownList, // Ranking unit breakdown
      kategoriStats: categoryStats,
      topChoices: top10Choices,
      weeklyTrend: weeklyTrend
    };
  } catch (err) {
    Logger.log("Error getDashboardStats: " + err.toString());
    throw new Error("Gagal menyusun Statistik Dashboard: " + err.message);
  }
}

/**
 * Utilitas untuk mengelompokkan Tanggal ke Label Minggu format "W-YYYY-MM [1/2/3/4]"
 */
function getWeekLabel(date) {
  var year = date.getFullYear();
  var month = ("0" + (date.getMonth() + 1)).slice(-2);
  var day = date.getDate();
  
  // Hitung nomor minggu dalam bulan (1-4/5)
  var weekNum = Math.ceil(day / 7);
  if (weekNum > 4) weekNum = 4; // Batasi maksimal minggu ke-4 agar rapi
  
  return "W" + weekNum + " " + year + "-" + month;
}
