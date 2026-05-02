const SPREADSHEET_ID = '1BsbFWFpI6FXQjN5Pgz18xIkalpB8S2BZc67l6PZUDGc';
const SHEET_MASTER   = 'BKK_Master';
const SHEET_BONGKAR  = 'BKK_Bongkar';
const SHEET_KIRIM    = 'BKK_Kirim';
const SHEET_OPNAME   = 'BKK_Opname';

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function responseJson(status, dataOrMessage) {
  var output = { status: status };
  if (status === 'success') {
    output.data = dataOrMessage;
  } else {
    output.message = dataOrMessage;
  }
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
}

function getSheetData(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return rows;
}

function calculateStock(bkId, allOpname, allBongkar, allKirim) {
  var bkOpname = allOpname.filter(function(r) { return r.BK_ID == bkId; });
  bkOpname.sort(function(a, b) { return new Date(b.TANGGAL).getTime() - new Date(a.TANGGAL).getTime(); });
  
  // Terakhir opname (karena disort ascending, yang paling akhir di index terakhir, tapi mari kita pastikan descending)
  bkOpname.sort(function(a, b) { return new Date(b.TANGGAL).getTime() - new Date(a.TANGGAL).getTime(); });
  var lastOpname = bkOpname.length > 0 ? bkOpname[0] : null;
  var baseline = lastOpname ? Number(lastOpname.STOK_FISIK_KG) : 0;
  
  var cutoffTime = lastOpname ? new Date(lastOpname.TANGGAL).getTime() : 0;
  
  var totalBongkar = 0;
  for (var i=0; i<allBongkar.length; i++) {
    if (allBongkar[i].BK_ID == bkId && new Date(allBongkar[i].TANGGAL).getTime() > cutoffTime) {
      totalBongkar += Number(allBongkar[i].NETTO_KG);
    }
  }
  
  var totalKirim = 0;
  for (var j=0; j<allKirim.length; j++) {
    if (allKirim[j].BK_ID == bkId && new Date(allKirim[j].TANGGAL).getTime() > cutoffTime) {
      totalKirim += Number(allKirim[j].NETTO_KG);
    }
  }
  
  var activeStock = baseline + totalBongkar - totalKirim;
  if (activeStock < 0) activeStock = 0;
  return activeStock;
}

function calculateAgeDays(bkId, allBongkar) {
  var bkBongkar = allBongkar.filter(function(r) { return r.BK_ID == bkId; });
  bkBongkar.sort(function(a, b) { return new Date(b.TANGGAL).getTime() - new Date(a.TANGGAL).getTime(); });
  if (bkBongkar.length === 0) return 0;
  
  var lastDate = new Date(bkBongkar[0].TANGGAL);
  var now = new Date();
  var diffTime = now.getTime() - lastDate.getTime();
  var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays < 0 ? 0 : diffDays;
}

function getBKKDashboard() {
  var master = getSheetData(SHEET_MASTER).filter(function(r) { return r.STATUS === 'ACTIVE'; });
  var bongkar = getSheetData(SHEET_BONGKAR);
  var kirim = getSheetData(SHEET_KIRIM);
  var opname = getSheetData(SHEET_OPNAME);
  
  var result = [];
  for (var i=0; i<master.length; i++) {
    var bk = master[i];
    var stock = calculateStock(bk.BK_ID, opname, bongkar, kirim);
    var age = calculateAgeDays(bk.BK_ID, bongkar);
    result.push({
      BK_ID: bk.BK_ID,
      NAMA_BK: bk.NAMA_BK,
      KAPASITAS_KG: bk.KAPASITAS_KG,
      MATERIAL_DEFAULT: bk.MATERIAL_DEFAULT,
      SUPPLIER_DEFAULT: bk.SUPPLIER_DEFAULT,
      STOK_AKTIF: stock,
      AGE_DAYS: age
    });
  }
  return result;
}

function getBKList() {
  return getSheetData(SHEET_MASTER).filter(function(r) { return r.STATUS === 'ACTIVE'; });
}

function getHistory(sheetName, bkId, limit) {
  var data = getSheetData(sheetName);
  if (bkId) {
    data = data.filter(function(r) { return r.BK_ID == bkId; });
  }
  data.sort(function(a, b) { 
    var dateA = a.TANGGAL ? new Date(a.TANGGAL).getTime() : 0;
    var dateB = b.TANGGAL ? new Date(b.TANGGAL).getTime() : 0;
    return dateB - dateA; 
  });
  if (limit) {
    data = data.slice(0, limit);
  }
  return data;
}

function generateId(prefix) {
  var now = new Date();
  var tz = 'Asia/Jakarta';
  var dateStr = Utilities.formatDate(now, tz, 'yyyyMMdd');
  var rand = Math.floor(Math.random() * 900) + 100;
  return prefix + '-' + dateStr + '-' + rand;
}

function getSAPData(tanggal) {
  var data = getSheetData('BKK_SAP');
  if (tanggal) {
    data = data.filter(function(r) {
      var d = r.TANGGAL;
      if (d instanceof Date) d = Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
      return d === tanggal;
    });
  }
  data.sort(function(a, b) {
    var dateA = a.TIMESTAMP ? new Date(a.TIMESTAMP).getTime() : 0;
    var dateB = b.TIMESTAMP ? new Date(b.TIMESTAMP).getTime() : 0;
    return dateB - dateA;
  });
  return data;
}

function getKirimByTanggal(tanggal, bkId) {
  var data = getSheetData(SHEET_KIRIM);
  if (tanggal) {
    data = data.filter(function(r) {
      var d = r.TANGGAL;
      if (d instanceof Date) d = Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
      return d === tanggal;
    });
  }
  if (bkId) {
    data = data.filter(function(r) { return r.BK_ID == bkId; });
  }
  data.sort(function(a, b) {
    var dateA = a.TIMESTAMP ? new Date(a.TIMESTAMP).getTime() : 0;
    var dateB = b.TIMESTAMP ? new Date(b.TIMESTAMP).getTime() : 0;
    return dateB - dateA;
  });
  return data;
}

function getDailyStockTable(bulan) {
  var master = getSheetData(SHEET_MASTER).filter(function(r) { return r.STATUS === 'ACTIVE'; });
  var bongkar = getSheetData(SHEET_BONGKAR);
  var kirim = getSheetData(SHEET_KIRIM);
  var opname = getSheetData(SHEET_OPNAME);

  var bkIds = master.map(function(r) { return r.BK_ID; });
  var startDate, endDate = new Date();

  if (bulan && bulan !== 'all') {
    var parts = bulan.split('-');
    startDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    endDate = new Date(parseInt(parts[0]), parseInt(parts[1]), 0);
  } else {
    startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  var rows = [];
  for (var d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    var tanggalStr = Utilities.formatDate(new Date(d), 'Asia/Jakarta', 'yyyy-MM-dd');
    var row = { tanggal: tanggalStr };
    for (var i = 0; i < bkIds.length; i++) {
      row['bk' + (i + 1) + '_stock'] = calculateStock(bkIds[i], opname, bongkar, kirim);
    }
    rows.push(row);
  }
  return rows;
}

function doGet(e) {
  var callback = e.parameter.callback;
  var action = e.parameter.action;
  var result;
  
  // Jika action adalah tulis (add...), gunakan handlePost untuk memproses parameter URL
  if (action && action.indexOf('add') === 0) {
    result = handlePost(e);
  } else {
    result = handleGet(e);
  }
  
  var json = JSON.stringify(result);
  if (e.parameter.callback) {
    return ContentService.createTextOutput(e.parameter.callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'getBKKDashboard') {
      return { status: 'success', data: getBKKDashboard() };
    } else if (action === 'getBKList') {
      return { status: 'success', data: getBKList() };
    } else if (action === 'getBongkarHistory') {
      return { status: 'success', data: getHistory(SHEET_BONGKAR, e.parameter.bk_id, e.parameter.limit) };
    } else if (action === 'getKirimHistory') {
      return { status: 'success', data: getHistory(SHEET_KIRIM, e.parameter.bk_id, e.parameter.limit) };
    } else if (action === 'getOpnameHistory') {
      return { status: 'success', data: getHistory(SHEET_OPNAME, e.parameter.bk_id, e.parameter.limit) };
    } else if (action === 'getSAPData') {
      return { status: 'success', data: getSAPData(e.parameter.tanggal) };
    } else if (action === 'getKirimByTanggal') {
      return { status: 'success', data: getKirimByTanggal(e.parameter.tanggal, e.parameter.bk_id) };
    } else if (action === 'getDailyStockTable') {
      return { status: 'success', data: getDailyStockTable(e.parameter.bulan) };
    } else if (action === 'getIntakeConfig') {
      var config = PropertiesService.getScriptProperties().getProperty('INTAKE_CONFIG');
      return { status: 'success', data: config ? JSON.parse(config) : null };
    } else {
      return { status: 'error', message: 'Invalid action' };
    }
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function insertRow(sheetName, rowData) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet " + sheetName + " not found");
  var headers = sheet.getDataRange().getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(rowData[headers[i]] || "");
  }
  sheet.appendRow(row);
}

function doPost(e) {
  var result = handlePost(e);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handlePost(e) {
  try {
    var data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      // Baca dari URL parameter (untuk JSONP/GET mode)
      data = e.parameter;
    }
    
    var action = data.action;
    var now = new Date();
    
    if (action === 'addBongkar') {
      var rowData = {
        ID: generateId('BNGKR'),
        TIMESTAMP: Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
        TANGGAL: data.TANGGAL || data.tanggal,
        BK_ID: data.BK_ID || data.bk_id,
        MATERIAL: data.MATERIAL || data.material,
        SUPPLIER: data.SUPPLIER || data.supplier || "",
        NETTO_KG: Number(data.NETTO_KG || data.netto_kg || 0),
        NO_POLISI: data.NO_POLISI || data.no_polisi || "",
        KETERANGAN: data.KETERANGAN || data.keterangan || "",
        INPUT_BY: data.INPUT_BY || (data.operator ? data.operator + " (Shift " + (data.shift || "-") + ")" : data.input_by || "")
      };
      if (!rowData.INPUT_BY || rowData.INPUT_BY === '') {
        throw new Error('INPUT_BY (Operator) tidak boleh kosong');
      }
      insertRow(SHEET_BONGKAR, rowData);
      return { status: 'success', data: rowData };
      
    } else if (action === 'addKirim') {
      var rowData = {
        ID: generateId('KIRM'),
        TIMESTAMP: Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
        TANGGAL: data.TANGGAL,
        BK_ID: data.BK_ID,
        MATERIAL: data.MATERIAL,
        NETTO_KG: Number(data.NETTO_KG),
        SHIFT: data.SHIFT || data.shift || "",
        GRINDING: data.GRINDING || data.grinding || "",
        OPERATOR: data.OPERATOR || data.operator || "",
        INPUT_BY: data.INPUT_BY || ""
      };
      if (!rowData.INPUT_BY || rowData.INPUT_BY === '') {
        throw new Error('INPUT_BY (Operator) tidak boleh kosong');
      }
      insertRow(SHEET_KIRIM, rowData);
      return { status: 'success', data: rowData };
      
    } else if (action === 'addOpname') {
      var rowData = {
        ID: generateId('OPN'),
        TIMESTAMP: Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
        TANGGAL: data.TANGGAL,
        BK_ID: data.BK_ID,
        STOK_FISIK_KG: Number(data.STOK_FISIK_KG),
        MATERIAL: data.MATERIAL,
        INPUT_BY: data.INPUT_BY,
        KETERANGAN: data.KETERANGAN
      };
      if (!rowData.INPUT_BY || rowData.INPUT_BY === '') {
        throw new Error('INPUT_BY (Operator) tidak boleh kosong');
      }
      insertRow(SHEET_OPNAME, rowData);
      return { status: 'success', data: rowData };
      
    } else if (action === 'saveIntakeConfig') {
      var configStr = data.config || data.CONFIG;
      if (!configStr) throw new Error('Config data is missing');
      PropertiesService.getScriptProperties().setProperty('INTAKE_CONFIG', configStr);
      return { status: 'success', message: 'Config saved' };

    } else if (action === 'addSAP') {
      return addSAP(data);
    } else if (action === 'addSAPCeklis') {
      return addSAPCeklis(data);

    } else {
      return { status: 'error', message: 'Invalid action' };
    }
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function addSAP(data) {
  var rowData = {
    ID: generateId('SAP'),
    TIMESTAMP: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
    TANGGAL: data.TANGGAL || data.tanggal,
    BK_ID: data.BK_ID || data.bk_id,
    QTY_SAP_KG: Number(data.QTY_SAP_KG || data.qty_sap_kg || 0),
    INPUT_BY: data.INPUT_BY || data.input_by || ''
  };
  insertRow('BKK_SAP', rowData);
  return { status: 'success', data: rowData };
}

function addSAPCeklis(data) {
  var rowData = {
    ID: generateId('CEK'),
    TIMESTAMP: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
    TANGGAL: data.TANGGAL || data.tanggal,
    REF_KIRIM_ID: data.REF_KIRIM_ID || data.ref_kirim_id || '',
    BK_ID: data.BK_ID || data.bk_id,
    MATERIAL: data.MATERIAL || data.material || '',
    NETTO_KG: Number(data.NETTO_KG || data.netto_kg || 0),
    STATUS_CEKLIS: data.STATUS_CEKLIS || data.status_ceklis || 'BELUM_MOTONG',
    CEKLIS_BY: data.CEKLIS_BY || data.ceklis_by || '',
    KETERANGAN: data.KETERANGAN || data.keterangan || ''
  };
  insertRow('BKK_SAP_Ceklis', rowData);
  return { status: 'success', data: rowData };
}

function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var sheets = {
    'BKK_Master':     ['BK_ID','NAMA_BK','KAPASITAS_KG','MATERIAL_DEFAULT','SUPPLIER_DEFAULT','STATUS'],
    'BKK_Bongkar':    ['ID','TIMESTAMP','TANGGAL','BK_ID','MATERIAL','SUPPLIER','NETTO_KG','NO_POLISI','KETERANGAN','INPUT_BY'],
    'BKK_Kirim':      ['ID','TIMESTAMP','TANGGAL','BK_ID','MATERIAL','NETTO_KG','SHIFT','GRINDING','OPERATOR','INPUT_BY'],
    'BKK_Opname':     ['ID','TIMESTAMP','TANGGAL','BK_ID','STOK_FISIK_KG','MATERIAL','INPUT_BY','KETERANGAN'],
    'BKK_SAP':        ['ID','TIMESTAMP','TANGGAL','BK_ID','QTY_SAP_KG','INPUT_BY'],
    'BKK_SAP_Ceklis': ['ID','TIMESTAMP','TANGGAL','REF_KIRIM_ID','BK_ID','MATERIAL','NETTO_KG','STATUS_CEKLIS','CEKLIS_BY','KETERANGAN']
  };

  for (var name in sheets) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var firstRow = sheet.getRange(1,1,1,1).getValue();
    if (!firstRow) {
      sheet.getRange(1, 1, 1, sheets[name].length).setValues([sheets[name]]);
    }
  }

  Logger.log('Setup selesai.');
}
