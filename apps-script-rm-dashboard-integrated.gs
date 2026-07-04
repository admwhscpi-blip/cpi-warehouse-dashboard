/**
 * SMART WAREHOUSE V2.0 - INTEGRATED DASHBOARD & SHARING API
 * ---------------------------------------------------------
 * Pembaruan Terakhir: 12-04-2026 (Integrasi Gudang Kopo 6)
 *
 * FILE INI = sumber untuk Web App RM dashboard (getData, share, simulasi).
 * Salin isi file ini ke Google Apps Script yang terhubung spreadsheet RM Anda.
 * Snapshot historis disimpan di sheet RM_DASH_SNAPSHOT pada workbook yang sama (CONFIG.RM.id).
 */

// KONFIGURASI - REVISI: Kolom C(3) s/d X(24) untuk gudang, Y(25) kode (skip), Z(26) kategori
const CONFIG = {
  'RM': {
    id: '14pK4Y9mq5r0cOqOy5uTRNkqzsI4vtjEDAjWR0d1pHVw',
    sheetName: 'Stock Daily',
    // warehouseCols: Kolom C(3) sampai X(24) — semua kolom gudang
    warehouseColStart: 3,   // Kolom C
    warehouseColEnd: 24,    // Kolom X
    rowStart: 3,
    rowEnd: 139,
    colName: 2,           // Kolom B (Material Name)
    colCategory: 26,      // Kolom Z (Category) — dipindah dari K ke Z
    colEnd: 26            // Diperluas ke Kolom Z agar bisa baca kategori
  },
  'SHARE_PROP': 'DASHBOARD_SHARE_TOKEN'
};

const RM_SNAPSHOT_SHEET = 'RM_DASH_SNAPSHOT';

function getRmWorkbook_() {
  return SpreadsheetApp.openById(CONFIG['RM'].id);
}

function ensureRmSnapshotSheet_() {
  const ss = getRmWorkbook_();
  let sh = ss.getSheetByName(RM_SNAPSHOT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(RM_SNAPSHOT_SHEET);
    sh.getRange(1, 1, 1, 2).setValues([['tanggal', 'payload_json']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Simpan / update satu baris snapshot (tanggal yyyy-MM-dd, JSON string). */
function saveRmSnapshotPayload_(dateStr, payloadStr) {
  const sh = ensureRmSnapshotSheet_();
  const sData = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < sData.length; i++) {
    const cell = sData[i][0];
    const ds = cell instanceof Date
      ? Utilities.formatDate(cell, 'Asia/Jakarta', 'yyyy-MM-dd')
      : String(cell || '').substring(0, 10);
    if (ds === dateStr) {
      rowIdx = i + 1;
      break;
    }
  }
  if (rowIdx === -1) {
    sh.appendRow([dateStr, payloadStr]);
  } else {
    sh.getRange(rowIdx, 1, rowIdx, 2).setValues([[dateStr, payloadStr]]);
  }
}

function doGet(e) {
  if (!e || !e.parameter) return errorResponse('No parameters provided');

  const action = e.parameter.action;

  // --- ACTION: GET SHARING STATUS ---
  if (action === 'getShareStatus') {
    const token = PropertiesService.getScriptProperties().getProperty(CONFIG.SHARE_PROP);
    return jsonResponse({
      success: true,
      active: !!token,
      token: token || ''
    }, e);
  }

  // --- ACTION: TOGGLE SHARING ---
  if (action === 'toggleShare') {
    const enable = e.parameter.enable === 'true';
    let newToken = '';
    if (enable) {
      newToken = 'db_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
      PropertiesService.getScriptProperties().setProperty(CONFIG.SHARE_PROP, newToken);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(CONFIG.SHARE_PROP);
    }
    return jsonResponse({ success: true, active: enable, token: newToken }, e);
  }

  // Action: getData (UTAMA DASHBOARD)
  if (action === 'getData') {
    const data = getComprehensiveData();
    return jsonResponse(data, e);
  }

  // --- Snapshot historis RM dashboard ---
  if (action === 'getRmSnapshot') {
    try {
      const tgl = String(e.parameter.tanggal || '').substring(0, 10);
      const sh = getRmWorkbook_().getSheetByName(RM_SNAPSHOT_SHEET);
      if (!sh || sh.getLastRow() < 2) {
        return jsonResponse({ success: false, message: 'empty' }, e);
      }
      const vals = sh.getDataRange().getValues();
      for (let i = 1; i < vals.length; i++) {
        const cell = vals[i][0];
        const rowDate = cell instanceof Date
          ? Utilities.formatDate(cell, 'Asia/Jakarta', 'yyyy-MM-dd')
          : String(cell || '').substring(0, 10);
        if (rowDate === tgl) {
          const payloadStr = String(vals[i][1] || '');
          let parsed = null;
          try {
            parsed = JSON.parse(payloadStr);
          } catch (ex) {
            parsed = null;
          }
          return jsonResponse({ success: true, data: parsed }, e);
        }
      }
      return jsonResponse({ success: false, message: 'not found' }, e);
    } catch (err) {
      return jsonResponse({ success: false, error: String(err) }, e);
    }
  }

  if (action === 'getRmSnapshotList') {
    try {
      const sh = getRmWorkbook_().getSheetByName(RM_SNAPSHOT_SHEET);
      const dates = [];
      if (sh && sh.getLastRow() >= 2) {
        const vals = sh.getDataRange().getValues();
        for (let i = 1; i < vals.length; i++) {
          const cell = vals[i][0];
          const ds = cell instanceof Date
            ? Utilities.formatDate(cell, 'Asia/Jakarta', 'yyyy-MM-dd')
            : String(cell || '').substring(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(ds) && dates.indexOf(ds) === -1) dates.push(ds);
        }
      }
      dates.sort();
      dates.reverse();
      return jsonResponse({ success: true, dates: dates.slice(0, 120) }, e);
    } catch (err) {
      return jsonResponse({ success: false, error: String(err) }, e);
    }
  }

  // Action: saveSimulation
  if (action === 'saveSimulation' && e.parameter.payload) {
    const id = saveSimulationData(e.parameter.payload);
    return jsonResponse({ success: true, id: id }, e);
  }

  // Action: getSimulation
  if (action === 'getSimulation' && e.parameter.id) {
    const data = getSimulationData(e.parameter.id);
    return jsonResponse({ success: true, data: data }, e);
  }

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Stock Simulator Simple')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    let raw = {};
    if (e.postData && e.postData.contents) {
      try {
        raw = JSON.parse(e.postData.contents);
      } catch (x) {
        raw = {};
      }
    }
    const action = raw.action || (e.parameter && e.parameter.action);

    if (action === 'saveSimulation') {
      const payload = (e.postData && e.postData.contents) ? e.postData.contents : (raw.payload || (e.parameter && e.parameter.payload));
      const id = saveSimulationData(payload);
      return jsonResponse({ success: true, id: id }, e);
    }

    if (action === 'saveRmSnapshot') {
      const dateStr = String(raw.tanggal || '').substring(0, 10);
      const payload = String(raw.payload || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return jsonResponse({ success: false, message: 'Invalid tanggal' }, e);
      }
      if (payload.length > 48000) {
        return jsonResponse({ success: false, message: 'Payload terlalu besar (>48k per sel)' }, e);
      }
      saveRmSnapshotPayload_(dateStr, payload);
      return jsonResponse({ success: true }, e);
    }

    return jsonResponse({ success: false, error: 'Invalid action' }, e);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() }, e);
  }
}

// --- FUNGSI OUTPUT UNIFIED ---
function jsonResponse(data, e) {
  const json = JSON.stringify(data);
  const callback = e && e.parameter ? e.parameter.callback : null;

  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function errorResponse(msg) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- FUNGSI AMBIL DATA SHEETS ---
function getComprehensiveData() {
  try {
    const conf = CONFIG['RM'];
    const ss = SpreadsheetApp.openById(conf.id);
    const sheet = ss.getSheetByName(conf.sheetName);

    // 1 & 2. Ambil Nama Gudang (Baris 2) dan Kapasitas (Baris 141) — seluruh range
    const headerRange = sheet.getRange(2, 1, 1, conf.colEnd).getValues()[0];
    const capacityRange = sheet.getRange(141, 1, 1, conf.colEnd).getValues()[0];

    const warehouseNames = [];
    const capacities = [];
    const whOffsets = [];

    // Dinamis: loop dari kolom C(3) sampai X(24), skip yang header-nya kosong atau bukan gudang
    // Blacklist: kolom-kolom non-gudang yang mungkin ada di antara kolom gudang
    var skipKeywords = ['kategori', 'konsentrasi', 'status', 'saran', 'tindakan', 'kode', 'keterangan', 'catatan'];
    for (var colIdx = conf.warehouseColStart; colIdx <= conf.warehouseColEnd; colIdx++) {
      var hdrName = headerRange[colIdx - 1];
      if (hdrName && String(hdrName).trim() !== '') {
        var hdrLower = String(hdrName).trim().toLowerCase();
        // Skip jika header mengandung kata-kata non-gudang
        var isBlacklisted = skipKeywords.some(function(kw) { return hdrLower.indexOf(kw) !== -1; });
        if (!isBlacklisted) {
          warehouseNames.push(String(hdrName).trim());
          capacities.push(capacityRange[colIdx - 1]);
          whOffsets.push(colIdx - conf.colName);
        }
      }
    }

    // 3. Ambil Area Data Material (Baris 3-139, Kolom B s/d Z)
    const numRows = conf.rowEnd - conf.rowStart + 1;
    const numCols = conf.colEnd - conf.colName + 1;
    const dataRange = sheet.getRange(conf.rowStart, conf.colName, numRows, numCols).getValues();

    const catOffset = conf.colCategory - conf.colName;

    const materials = [];
    dataRange.forEach(function (row) {
      const matName = row[0];
      const category = row[catOffset];

      if (matName && matName.toString().trim() !== '') {
        const stocks = whOffsets.map(function (offset) {
          return parseFloat(row[offset]) || 0;
        });
        materials.push({
          name: matName,
          category: category || 'Lainnya',
          stocks: stocks
        });
      }
    });

    return {
      success: true,
      warehouses: warehouseNames,
      capacities: capacities,
      materials: materials,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// --- FUNGSI PENDUKUNG SIMULASI & STORAGE ---

function getWarehouseData() {
  const result = getComprehensiveData();
  if (!result.success) return result;

  const warehouses = [];
  for (let i = 0; i < result.warehouses.length; i++) {
    warehouses.push({
      name: result.warehouses[i],
      cap: (result.capacities[i] || 0) / 1000
    });
  }
  return { success: true, data: warehouses };
}

function saveSimulationData(payloadJson) {
  const ss = SpreadsheetApp.openById(CONFIG['RM'].id);
  let sheet = ss.getSheetByName('Simulations');
  if (!sheet) {
    sheet = ss.insertSheet('Simulations');
    sheet.appendRow(['ID', 'Timestamp', 'Payload']);
  }
  const id = 'SIM-' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd') + '-' + Math.floor(Math.random() * 1000000);
  sheet.appendRow([id, new Date(), payloadJson]);
  return id;
}

function getSimulationData(id) {
  const ss = SpreadsheetApp.openById(CONFIG['RM'].id);
  const sheet = ss.getSheetByName('Simulations');
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      return JSON.parse(rows[i][2]);
    }
  }
  return null;
}

/**
 * Jalankan sekali dari editor Apps Script: pemicu harian jam 12:00 Asia/Jakarta
 * menyimpan snapshot dari getComprehensiveData() ke sheet RM_DASH_SNAPSHOT.
 */
function installRmDashboardNoonTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'rmDashboardSnapshotNoonJob') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('rmDashboardSnapshotNoonJob')
    .timeBased()
    .atHour(12)
    .everyDays(1)
    .inTimezone('Asia/Jakarta')
    .create();
}

/** Dipanggil oleh trigger harian (atau manual dari editor). */
function rmDashboardSnapshotNoonJob() {
  const data = getComprehensiveData();
  if (!data || !data.success) return;
  const ymd = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  const inner = {
    warehouses: data.warehouses,
    capacities: data.capacities,
    materials: data.materials
  };
  saveRmSnapshotPayload_(ymd, JSON.stringify(inner));
}
