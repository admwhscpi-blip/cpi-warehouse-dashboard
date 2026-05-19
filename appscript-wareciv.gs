// ═══════════════════════════════════════════════════════════════
// APPS SCRIPT KODE LENGKAP — WARECIV SYSTEM
// ═══════════════════════════════════════════════════════════════
// CARA DEPLOY:
// 1. Buka spreadsheet ID: 1nfSe5vtkv_nCYnfu6vz428TIQAkyQB3xE_XGX5PMxTY
// 2. Klik Extensions (Ekstensi) → Apps Script
// 3. Hapus semua kode default, paste seluruh isi file ini
// 4. Klik Save (Ctrl+S)
// 5. Klik Deploy → New deployment
// 6. Pilih type: Web App (Aplikasi Web)
// 7. Execute as: Me (your_email@gmail.com)
// 8. Who has access: Anyone
// 9. Klik Deploy, selesaikan otorisasi, lalu copy "Web App URL"
// 10. Paste URL tersebut ke konstanta APPS_SCRIPT_URL di baris 2484 file apk-wareciv.html

var SPREADSHEET_ID = "1nfSe5vtkv_nCYnfu6vz428TIQAkyQB3xE_XGX5PMxTY";
var SHEET_NAME = "WARECIV_DATA";

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function readParams(e) {
  var params = {};
  if (e.parameter) {
    for (var key in e.parameter) {
      params[key] = e.parameter[key];
    }
  }
  if (e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var key in body) {
        params[key] = body[key];
      }
    } catch (err) {
      // Bukan JSON atau kosong
    }
  }
  return params;
}

function handleRequest(e) {
  var params = readParams(e);
  var action = params.action;
  
  var response;
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      var headers = [
        "ID", "Tanggal_Laporan", "Waktu_Laporan", "Pelapor", "Gudang", "Lokasi_Spesifik",
        "Kategori", "Sub_Kategori", "Prioritas", "Deskripsi", "Foto_1", "Foto_2", "Foto_3",
        "Status", "Timestamp_Input", "Tim_Pengerjaan", "Nama_Teknisi", "Tanggal_Selesai",
        "Waktu_Selesai", "Durasi_Penanganan", "Catatan_Selesai", "Foto_Selesai_1", "Foto_Selesai_2"
      ];
      sheet.appendRow(headers);
    }
    
    if (action === "submit") {
      response = doSubmit(sheet, params);
    } else if (action === "getAll") {
      response = doGetAll(sheet);
    } else if (action === "updateStatus") {
      response = doUpdateStatus(sheet, params);
    } else {
      response = { success: false, error: "Aksi atau parameter tidak valid" };
    }
  } catch (err) {
    response = { success: false, error: err.toString() };
  }
  
  var callback = params.callback;
  var output = ContentService.createTextOutput();
  if (callback) {
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
    output.setContent(callback + "(" + JSON.stringify(response) + ")");
  } else {
    output.setMimeType(ContentService.MimeType.JSON);
    output.setContent(JSON.stringify(response));
  }
  return output;
}

function doSubmit(sheet, params) {
  var id = generateId(sheet);
  var rowData = [
    id,
    params.tanggal_laporan || "",
    params.waktu_laporan || "",
    params.pelapor || "",
    params.gudang || "",
    params.lokasi_spesifik || "",
    params.kategori || "",
    params.sub_kategori || "",
    params.prioritas || "",
    params.deskripsi || "",
    params.foto_1 || "",
    params.foto_2 || "",
    params.foto_3 || "",
    "Dilaporkan",
    new Date().toISOString(),
    "", "", "", "", "", "", "", ""
  ];
  sheet.appendRow(rowData);
  return { success: true, id: id };
}

function doGetAll(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, rows: [] };
  }
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      var val = row[j];
      if (val instanceof Date) {
        if (key === "Timestamp_Input") {
          obj[key] = val.toISOString();
        } else {
          obj[key] = Utilities.formatDate(val, Session.getScriptTimeZone(), "dd/MM/yyyy");
        }
      } else {
        obj[key] = val;
      }
    }
    rows.push(obj);
  }
  return { success: true, rows: rows };
}

function doUpdateStatus(sheet, params) {
  var id = params.id;
  if (!id) return { success: false, error: "ID wajib diisi" };
  
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) return { success: false, error: "Data tidak ditemukan untuk ID " + id };
  
  sheet.getRange(rowIndex, 14).setValue(params.status || "Selesai");
  sheet.getRange(rowIndex, 16).setValue(params.tim_pengerjaan || "");
  sheet.getRange(rowIndex, 17).setValue(params.nama_teknisi || "");
  sheet.getRange(rowIndex, 18).setValue(params.tanggal_selesai || "");
  sheet.getRange(rowIndex, 19).setValue(params.waktu_selesai || "");
  sheet.getRange(rowIndex, 20).setValue(params.durasi_penanganan || "");
  sheet.getRange(rowIndex, 21).setValue(params.catatan_selesai || "");
  sheet.getRange(rowIndex, 22).setValue(params.foto_selesai_1 || "");
  sheet.getRange(rowIndex, 23).setValue(params.foto_selesai_2 || "");
  return { success: true };
}

function generateId(sheet) {
  var todayStr = getFormattedDate();
  var data = sheet.getDataRange().getValues();
  var maxNum = 0;
  var prefix = "WCV-" + todayStr + "-";
  for (var i = 1; i < data.length; i++) {
    var id = data[i][0];
    if (id && id.indexOf(prefix) === 0) {
      var numPart = id.substring(prefix.length);
      var num = parseInt(numPart, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  var nextNum = maxNum + 1;
  var nextNumStr = nextNum.toString();
  while (nextNumStr.length < 3) nextNumStr = "0" + nextNumStr;
  return prefix + nextNumStr;
}

function getFormattedDate() {
  var d = new Date();
  var y = d.getFullYear().toString();
  var m = (d.getMonth() + 1).toString();
  var day = d.getDate().toString();
  if (m.length < 2) m = "0" + m;
  if (day.length < 2) day = "0" + day;
  return y + m + day;
}
