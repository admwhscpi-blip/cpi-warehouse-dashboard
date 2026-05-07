const SPREADSHEET_ID = '1BsbFWFpI6FXQjN5Pgz18xIkalpB8S2BZc67l6PZUDGc';
const SHEET_MASTER   = 'BKK_Master';
const SHEET_BONGKAR  = 'BKK_Bongkar';
const SHEET_BONGKAR_SETUP = 'BKK_Bongkar_Setup';
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

/** Waktu kejadian baris: TIMESTAMP (jam simpan) lebih tepat daripada kolom TANGGAL saja. */
function gsRowInstantMs_(r) {
  if (!r) return 0;
  if (r.TIMESTAMP != null && r.TIMESTAMP !== '') {
    var t = r.TIMESTAMP;
    var ms = t instanceof Date ? t.getTime() : new Date(t).getTime();
    if (!isNaN(ms)) return ms;
  }
  var tg = r.TANGGAL;
  if (tg == null || tg === '') return 0;
  return tg instanceof Date ? tg.getTime() : new Date(tg).getTime();
}

function calculateStock(bkId, allOpname, allBongkar, allKirim) {
  var bkOpname = allOpname.filter(function(r) { return r.BK_ID == bkId; });
  bkOpname.sort(function(a, b) { return gsRowInstantMs_(b) - gsRowInstantMs_(a); });
  var lastOpname = bkOpname.length > 0 ? bkOpname[0] : null;
  var baseline = lastOpname ? Number(lastOpname.STOK_FISIK_KG) : 0;
  
  var cutoffTime = lastOpname ? gsRowInstantMs_(lastOpname) : 0;
  
  var totalBongkar = 0;
  for (var i=0; i<allBongkar.length; i++) {
    var rowBg = allBongkar[i];
    if (rowBg.BK_ID != bkId || gsRowInstantMs_(rowBg) <= cutoffTime) continue;
    var st = rowBg.STATUS_ROW;
    if (st === 'pending_final') continue;
    totalBongkar += Number(rowBg.NETTO_KG);
  }
  
  var totalKirim = 0;
  for (var j=0; j<allKirim.length; j++) {
    if (allKirim[j].BK_ID == bkId && gsRowInstantMs_(allKirim[j]) > cutoffTime) {
      totalKirim += Number(allKirim[j].NETTO_KG);
    }
  }
  
  var activeStock = baseline + totalBongkar - totalKirim;
  if (activeStock < 0) activeStock = 0;
  return activeStock;
}

/** Kolom G / AWAL ISI — untuk umur absolut dihitung di web (hari ini − awal isi). */
function getAwalIsiRawFromMasterRow_(bk) {
  if (!bk) return null;
  var v = bk.AWAL_ISI;
  if (v != null && String(v).trim() !== '') return v;
  v = bk['AWAL ISI'];
  if (v != null && String(v).trim() !== '') return v;
  return null;
}

function formatAwalIsiYmdForApi_(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    var dd = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    return m[3] + '-' + mm + '-' + dd;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  return '';
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
    var awalYmd = formatAwalIsiYmdForApi_(getAwalIsiRawFromMasterRow_(bk));
    result.push({
      BK_ID: String(bk.BK_ID != null ? bk.BK_ID : '').trim(),
      NAMA_BK: bk.NAMA_BK,
      KAPASITAS_KG: bk.KAPASITAS_KG,
      MATERIAL_DEFAULT: bk.MATERIAL_DEFAULT || bk.MATERIAL || '',
      SUPPLIER_DEFAULT: bk.SUPPLIER_DEFAULT || bk.SUPPLIER_DEF || bk.SUPPLIER || '',
      STOK_AKTIF: stock,
      AWAL_ISI_YMD: awalYmd
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

/** Cegah addBongkar dobel (klik ganda / fetch + fallback) dalam beberapa menit — kunci dari isi operasi. */
function bongkarAddDedupeCacheKey_(data, durObj) {
  var sig = [
    String(data.BK_ID || data.bk_id || ''),
    String(data.TANGGAL || data.tanggal || ''),
    String(data.NO_POLISI || data.no_polisi || '').toUpperCase().replace(/\s+/g, ''),
    String(data.SHIFT || data.shift || ''),
    String(data.MATERIAL || data.material || ''),
    String(data.TYPE_BONGKARAN || data.type_bongkaran || ''),
    String(durObj.pb_tanggal || ''),
    String(durObj.pb_start || ''),
    String(durObj.pb_finish || '')
  ].join('\u001e');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig, Utilities.Charset.UTF_8);
  return 'bokAddDup_' + Utilities.base64EncodeWebSafe(digest);
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
  
  // JSONP memakai GET: semua action baca diawali "get". Selain itu → tulis → handlePost
  // (addBongkar, saveBongkarSetup, finalizeBongkar, saveCekSAPDraft, dll.)
  if (action && action.indexOf('get') !== 0) {
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
    } else if (action === 'getCekSAPDraft') {
      return getCekSAPDraft(e.parameter.username || '');
    } else if (action === 'getBongkarSetup') {
      var g = getBongkarSetup(e.parameter.username || '', e.parameter.date_key || '');
      return { status: 'success', data: g };
    } else {
      return { status: 'error', message: 'Invalid action' };
    }
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

/** Tambah header kolom durasi di BKK_Bongkar bila belum ada (supaya insertRow bisa mengisi per kolom). */
function ensureBongkarMetaColumns_() {
  var names = ['TYPE_BONGKARAN', 'STATUS_ROW', 'DURASI_JSON'];
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BONGKAR);
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var miss = [];
  for (var i = 0; i < names.length; i++) {
    if (headers.indexOf(names[i]) < 0) miss.push(names[i]);
  }
  if (miss.length === 0) return;
  var start = lastCol + 1;
  for (var mi = 0; mi < miss.length; mi++) {
    sheet.getRange(1, start + mi).setValue(miss[mi]);
  }
}

/** Tambah header kolom durasi di BKK_Bongkar bila belum ada (supaya insertRow bisa mengisi per kolom). */
function ensureBongkarDurasiColumns_() {
  var names = ['AB_TANGGAL', 'PB_TANGGAL', 'AB_ARRIVAL', 'AB_QC', 'PB_SAMPAI', 'PB_START', 'PB_HOLD', 'PB_RESTART', 'PB_FINISH'];
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BONGKAR);
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var miss = [];
  for (var i = 0; i < names.length; i++) {
    if (headers.indexOf(names[i]) < 0) miss.push(names[i]);
  }
  if (miss.length === 0) return;
  var start = lastCol + 1;
  for (var mi = 0; mi < miss.length; mi++) {
    sheet.getRange(1, start + mi).setValue(miss[mi]);
  }
}

/** Ringkasan human-readable untuk kolom sheet (baca cepat tanpa parse JSON). */
function formatBreakdownTxt_(bd) {
  if (!bd || typeof bd !== 'object') return '';
  var parts = [];
  var keys = Object.keys(bd);
  for (var ki = 0; ki < keys.length; ki++) {
    var arr = bd[keys[ki]];
    if (!arr || !arr.length) continue;
    for (var ai = 0; ai < arr.length; ai++) {
      var row = arr[ai];
      if (!row) continue;
      var cat = String(row.cat != null ? row.cat : '').trim();
      var oth = String(row.other != null ? row.other : '').trim();
      var mn = row.min != null ? Number(row.min) : 0;
      var lab = cat;
      if (String(cat).toUpperCase() === 'OTHER' && oth) lab = oth;
      else if (oth) lab = cat + ' (' + oth + ')';
      parts.push(lab + ': ' + mn + ' mnt');
    }
  }
  return parts.join(' | ');
}

/** Kolom cadangan rincian breakdown (wizard); tidak bergantung pada DURASI_JSON utuh di URL. */
function ensureBongkarBreakdownColumns_() {
  var names = ['BREAKDOWN_DURASI', 'BREAKDOWN_TXT'];
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BONGKAR);
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var miss = [];
  for (var i = 0; i < names.length; i++) {
    if (headers.indexOf(names[i]) < 0) miss.push(names[i]);
  }
  if (miss.length === 0) return;
  var start = lastCol + 1;
  for (var mi = 0; mi < miss.length; mi++) {
    sheet.getRange(1, start + mi).setValue(miss[mi]);
  }
}

function insertRow(sheetName, rowData) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet " + sheetName + " not found");
  var numCols = sheet.getLastColumn();
  if (numCols < 1) throw new Error("Sheet " + sheetName + ": tidak ada header baris 1");
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var key = headers[i] != null ? String(headers[i]).trim() : '';
    if (!key) {
      row.push("");
      continue;
    }
    var val = rowData[key];
    row.push(val != null && val !== "" ? val : "");
  }
  if (row.length !== headers.length) {
    throw new Error("Sheet " + sheetName + ": jumlah sel tidak cocok header (" + row.length + " vs " + headers.length + ")");
  }
  sheet.appendRow(row);
}

/** Update kolom pada baris BKK_Bongkar yang ID-nya cocok. */
function updateBongkarById(id, updates) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BONGKAR);
  if (!sheet) throw new Error('Sheet Bongkar not found');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  var headers = data[0];
  var idCol = headers.indexOf('ID');
  if (idCol < 0) throw new Error('Kolom ID tidak ada');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idCol]) !== String(id)) continue;
    for (var key in updates) {
      var c = headers.indexOf(key);
      if (c >= 0) sheet.getRange(r + 1, c + 1).setValue(updates[key]);
    }
    return true;
  }
  return false;
}

function saveBongkarSetup(username, dateKey, nama, payloadJson) {
  if (!username) throw new Error('username wajib');
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BONGKAR_SETUP);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_BONGKAR_SETUP);
    sheet.appendRow(['USERNAME', 'DATE_KEY', 'NAMA', 'UPDATED_AT', 'PAYLOAD_JSON']);
  }
  var data = sheet.getDataRange().getValues();
  var ts = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(username) && String(data[i][1]) === String(dateKey)) {
      rowIdx = i + 1;
      break;
    }
  }
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 3, 1, 3).setValues([[nama || '', ts, payloadJson]]);
  } else {
    sheet.appendRow([username, dateKey, nama || '', ts, payloadJson]);
  }
}

function getBongkarSetup(username, dateKey) {
  if (!username || !dateKey) return null;
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BONGKAR_SETUP);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(username) && String(data[i][1]) === String(dateKey)) {
      var payloadStr = data[i][4];
      var parsed = {};
      try {
        parsed = payloadStr ? JSON.parse(payloadStr) : {};
      } catch (e) {
        parsed = {};
      }
      return {
        nama: data[i][2],
        updatedAt: data[i][3],
        payload: parsed
      };
    }
  }
  return null;
}

function doPost(e) {
  var result = handlePost(e);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
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
      var durasiJson = data.DURASI_JSON || data.durasi_json || '';
      if (typeof durasiJson === 'object') durasiJson = JSON.stringify(durasiJson);
      var durObj = {};
      try {
        durObj = durasiJson ? JSON.parse(durasiJson) : {};
      } catch (e) {
        durObj = {};
      }
      var dupKey = bongkarAddDedupeCacheKey_(data, durObj);
      var dupCache = CacheService.getScriptCache();
      var dupHit = dupCache.get(dupKey);
      if (dupHit) {
        try {
          return { status: 'success', data: JSON.parse(dupHit), duplicate_suppressed: true };
        } catch (eDup) {}
      }
      var slim = {
        v: durObj.v || 1,
        is_sbm: durObj.is_sbm === true || durObj.is_sbm === 'true',
        type_bongkaran: durObj.type_bongkaran || '',
        breakdowns: durObj.breakdowns || {}
      };
      var bdRaw = durObj.breakdowns || {};
      var bdJson = '';
      try {
        bdJson = Object.keys(bdRaw).length ? JSON.stringify(bdRaw) : '';
      } catch (eBd) {
        bdJson = '';
      }
      ensureBongkarMetaColumns_();
      ensureBongkarDurasiColumns_();
      ensureBongkarBreakdownColumns_();
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
        INPUT_BY: data.INPUT_BY || (data.operator ? data.operator + " (Shift " + (data.shift || "-") + ")" : data.input_by || ""),
        SHIFT: data.SHIFT || data.shift || "",
        TYPE_BONGKARAN: data.TYPE_BONGKARAN || data.type_bongkaran || "",
        STATUS_ROW: data.STATUS_ROW || data.status_row || 'complete',
        ARRIVAL_DATE: data.ARRIVAL_DATE || data.arrival_date || "",
        ARRIVAL_TIME: data.ARRIVAL_TIME || data.arrival_time || "",
        AB_TANGGAL: durObj.ab_tanggal || '',
        PB_TANGGAL: durObj.pb_tanggal || '',
        AB_ARRIVAL: durObj.ab_arrival || '',
        AB_QC: durObj.ab_qc || '',
        PB_SAMPAI: durObj.pb_sampai || '',
        PB_START: durObj.pb_start || '',
        PB_HOLD: durObj.pb_hold || '',
        PB_RESTART: durObj.pb_restart || '',
        PB_FINISH: durObj.pb_finish || '',
        DURASI_JSON: JSON.stringify(slim),
        BREAKDOWN_DURASI: bdJson,
        BREAKDOWN_TXT: formatBreakdownTxt_(bdRaw)
      };
      if (!rowData.INPUT_BY || rowData.INPUT_BY === '') {
        throw new Error('INPUT_BY (Operator) tidak boleh kosong');
      }
      insertRow(SHEET_BONGKAR, rowData);
      try {
        dupCache.put(dupKey, JSON.stringify(rowData), 300);
      } catch (ePut) {}
      return { status: 'success', data: rowData };

    } else if (action === 'finalizeBongkar') {
      ensureBongkarMetaColumns_();
      var fid = data.ID || data.id;
      if (!fid) throw new Error('ID wajib');
      var abTgl = data.AB_TANGGAL || data.ab_tanggal || '';
      var abArr = data.AB_ARRIVAL || data.ab_arrival || '';
      var abQc = data.AB_QC || data.ab_qc || '';
      var upd = {
        NETTO_KG: Number(data.NETTO_KG || data.netto_kg || 0),
        STATUS_ROW: 'complete',
        ARRIVAL_DATE: data.ARRIVAL_DATE || data.arrival_date || abTgl || '',
        ARRIVAL_TIME: data.ARRIVAL_TIME || data.arrival_time || abArr || '',
        AB_TANGGAL: abTgl,
        AB_ARRIVAL: abArr,
        AB_QC: abQc
      };
      if (!updateBongkarById(fid, upd)) throw new Error('Baris bongkar tidak ditemukan');
      return { status: 'success', message: 'Data dilengkapi' };

    } else if (action === 'saveBongkarSetup') {
      var un = data.username || data.USERNAME || '';
      var dk = data.date_key || data.DATE_KEY || '';
      var pay = data.payload;
      if (typeof pay === 'object') pay = JSON.stringify(pay);
      if (!un || !dk) throw new Error('username & date_key wajib');
      saveBongkarSetup(un, dk, data.nama || data.NAMA || '', pay || '{}');
      return { status: 'success', message: 'Setup tersimpan' };
      
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

    } else if (action === 'saveCekSAPDraft') {
      var uname = data.username || data.USERNAME || '';
      var nama = data.nama || data.NAMA || '';
      var payload = data.payload || data.PAYLOAD || '{}';
      if (!uname) throw new Error('username wajib');
      saveCekSAPDraft(uname, nama, payload);
      return { status: 'success', message: 'Draft tersimpan' };

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

var SHEET_CEK_SAP_DRAFT = 'BKK_CekSAP_Draft';

function saveCekSAPDraft(username, nama, payloadJson) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CEK_SAP_DRAFT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CEK_SAP_DRAFT);
    sheet.appendRow(['USERNAME', 'NAMA', 'UPDATED_AT', 'PAYLOAD_JSON']);
  }
  var data = sheet.getDataRange().getValues();
  var ts = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(username)) {
      rowIdx = i + 1;
      break;
    }
  }
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 2, rowIdx, 4).setValues([[nama, ts, payloadJson]]);
  } else {
    sheet.appendRow([username, nama, ts, payloadJson]);
  }
}

function getCekSAPDraft(username) {
  if (!username) return { status: 'success', data: null };
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CEK_SAP_DRAFT);
  if (!sheet) return { status: 'success', data: null };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(username)) {
      var payloadStr = data[i][3];
      var parsed = {};
      try {
        parsed = payloadStr ? JSON.parse(payloadStr) : {};
      } catch (e) {
        parsed = {};
      }
      return {
        status: 'success',
        data: {
          nama: data[i][1],
          updatedAt: data[i][2],
          payload: parsed
        }
      };
    }
  }
  return { status: 'success', data: null };
}

function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var sheets = {
    'BKK_Master':     ['BK_ID','NAMA_BK','KAPASITAS_KG','MATERIAL_DEFAULT','SUPPLIER_DEFAULT','STATUS','AWAL_ISI'],
    'BKK_Bongkar':    ['ID','TIMESTAMP','TANGGAL','BK_ID','MATERIAL','SUPPLIER','NETTO_KG','NO_POLISI','KETERANGAN','INPUT_BY','SHIFT','TYPE_BONGKARAN','STATUS_ROW','ARRIVAL_DATE','ARRIVAL_TIME','AB_TANGGAL','PB_TANGGAL','AB_ARRIVAL','AB_QC','PB_SAMPAI','PB_START','PB_HOLD','PB_RESTART','PB_FINISH','DURASI_JSON','BREAKDOWN_DURASI','BREAKDOWN_TXT'],
    'BKK_Bongkar_Setup': ['USERNAME','DATE_KEY','NAMA','UPDATED_AT','PAYLOAD_JSON'],
    'BKK_Kirim':      ['ID','TIMESTAMP','TANGGAL','BK_ID','MATERIAL','NETTO_KG','SHIFT','GRINDING','OPERATOR','INPUT_BY'],
    'BKK_Opname':     ['ID','TIMESTAMP','TANGGAL','BK_ID','STOK_FISIK_KG','MATERIAL','INPUT_BY','KETERANGAN'],
    'BKK_SAP':        ['ID','TIMESTAMP','TANGGAL','BK_ID','QTY_SAP_KG','INPUT_BY'],
    'BKK_SAP_Ceklis': ['ID','TIMESTAMP','TANGGAL','REF_KIRIM_ID','BK_ID','MATERIAL','NETTO_KG','STATUS_CEKLIS','CEKLIS_BY','KETERANGAN'],
    'BKK_CekSAP_Draft': ['USERNAME','NAMA','UPDATED_AT','PAYLOAD_JSON']
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
