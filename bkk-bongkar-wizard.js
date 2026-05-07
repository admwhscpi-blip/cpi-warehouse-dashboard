/**
 * Bongkar wizard 3 langkah. Depends: $, appState, postAPI, fetchAPI,
 * toast, showLoader, pad2, bkkEnsureOpnameHistory, bkkValidateTanggalBongkarKirim,
 * bkkShowReject, todayStr, todayYMD_WIB, dashDateToYMD, applyBongkarMasterDefaults, loadDashboard
 */

var BW_BREAKDOWN_CATS = ['ISTIRAHAT', 'PINDAH HOPPER', 'JALUR OVERLOAD', 'TUNGGU KULI', 'TUNGGU TRUCK', 'OTHER'];

/** Material non-SBM: modal breakdown durasi urutan hanya bila gap > ini (menit). SBM tetap memakai 5 menit di bwSubmitStep2. */
var BW_NON_SBM_BREAKDOWN_MIN = 60;
var BW_SBM_INTAKE_PROCESS_MIN = 25;
var BW_SBM_INTAKE_GAP_TRUCK_MIN = 5;
var BW_ABQC_TO_PBSAMPAI_MIN = 180;

var bwWiz = { step: 1, bdPending: null, bdTargetMin: 0, saving: false, setupLocked: false, lockSnap: null, nopolBatch: [] };
bwWiz.liveBreakdowns = {};

/** Snapshot setup untuk Step 2: filter antrian = type bongkaran (Intake 71 = manual+tilting gabung) + material persis (kode/value select). */
function bwEffectiveSetup() {
  if (bwWiz.setupLocked && bwWiz.lockSnap) return bwWiz.lockSnap;
  var sel = $('bw_material');
  var lbl = '';
  if (sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
    lbl = String(sel.options[sel.selectedIndex].text || '').trim();
  }
  return {
    tanggal: ($('bw_tanggal') && $('bw_tanggal').value) || '',
    bk_id: ($('bw_bk_id') && $('bw_bk_id').value) || '',
    shift: ($('bw_shift') && $('bw_shift').value) || '',
    type_bongkaran: ($('bw_type_bongkaran') && $('bw_type_bongkaran').value) || '',
    material: ($('bw_material') && $('bw_material').value) || '',
    supplier: ($('bw_supplier') && $('bw_supplier').value) || '',
    materialLabel: lbl
  };
}

function bwEffectiveTypeBongkaran() {
  var es = bwEffectiveSetup();
  return String(es.type_bongkaran || '').trim();
}

function bwWizardTypeGroupFromType(typ) {
  var t = String(typ || '').trim();
  if (t === 'direct_gudang') return 'direct';
  if (t === 'intake71_manual' || t === 'intake71_tilting') return 'intake71';
  return '';
}

function bwRowMatchesTypeGroup(r, group) {
  var t = String(r.TYPE_BONGKARAN || '').trim();
  if (group === 'direct') return t === 'direct_gudang';
  if (group === 'intake71') {
    if (t === 'direct_gudang') return false;
    if (!t) return true;
    return t === 'intake71_manual' || t === 'intake71_tilting';
  }
  return false;
}

function bwRowMaterialExact(r, matVal) {
  var a = String(r.MATERIAL != null ? r.MATERIAL : '').trim();
  var b = String(matVal || '').trim();
  return a === b && b !== '';
}

function bwCaptureLockSnapshot() {
  var sel = $('bw_material');
  var lbl = '';
  if (sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
    lbl = String(sel.options[sel.selectedIndex].text || '').trim();
  }
  return {
    tanggal: ($('bw_tanggal') && $('bw_tanggal').value) || '',
    bk_id: ($('bw_bk_id') && $('bw_bk_id').value) || '',
    shift: ($('bw_shift') && $('bw_shift').value) || '',
    type_bongkaran: ($('bw_type_bongkaran') && $('bw_type_bongkaran').value) || '',
    material: ($('bw_material') && $('bw_material').value) || '',
    supplier: ($('bw_supplier') && $('bw_supplier').value) || '',
    materialLabel: lbl
  };
}

function bwValidateSetupFields() {
  var s = bwCaptureLockSnapshot();
  if (!s.tanggal || !s.bk_id || !s.type_bongkaran || !s.material) return false;
  return true;
}

function bwApplySetupLock() {
  if (!bwValidateSetupFields()) return false;
  bwWiz.lockSnap = bwCaptureLockSnapshot();
  bwWiz.setupLocked = true;
  bwUpdateSetupLockUI();
  bwPersistWizardLocal();
  return true;
}

function bwUnlockSetup(silent) {
  bwWiz.setupLocked = false;
  bwWiz.lockSnap = null;
  bwUpdateSetupLockUI();
  if (!silent && typeof toast === 'function') {
    toast('Setup dibuka — ubah BK / material / type lalu simpan atau buka Step 2 lagi untuk kunci baru.', 'w');
  }
  bwPersistWizardLocal();
}

function bwSetupStep1FieldsDisabled(dis) {
  ['bw_tanggal', 'bw_bk_id', 'bw_shift', 'bw_type_bongkaran', 'bw_material', 'bw_supplier'].forEach(function(id) {
    var el = $(id);
    if (el) el.disabled = !!dis;
  });
}

function bwUpdateSetupLockUI() {
  var ban = $('bw_setup_lock_banner');
  var tx = $('bw_setup_lock_text');
  if (bwWiz.setupLocked && bwWiz.lockSnap) {
    if (ban) ban.hidden = false;
    if (tx) {
      var g = bwWizardTypeGroupFromType(bwWiz.lockSnap.type_bongkaran) === 'direct' ? 'Direct Gudang' : 'Intake 71 (Manual & Tilting satu antrian)';
      tx.textContent = 'Setup terkunci untuk Step 2: ' + g + ' · ' + (bwWiz.lockSnap.materialLabel || bwWiz.lockSnap.material) +
        ' · BK ' + bwWiz.lockSnap.bk_id + ' · ' + bwWiz.lockSnap.tanggal + ' · Shift ' + bwWiz.lockSnap.shift;
    }
    bwSetupStep1FieldsDisabled(true);
  } else {
    if (ban) ban.hidden = true;
    if (tx) tx.textContent = '';
    bwSetupStep1FieldsDisabled(false);
  }
}

function bwEnsureStep2Entry() {
  if (!bwValidateSetupFields()) {
    if (typeof toast === 'function') toast('Lengkapi Setup: BK, tanggal, type bongkaran, dan material (wajib sama persis dengan sheet).', 'w');
    return false;
  }
  if (!bwWiz.setupLocked) bwApplySetupLock();
  return !!bwWiz.setupLocked;
}

function bwListFrom0700(fullList) {
  return (fullList || []).filter(function(x) {
    var y = x.dayYmd || '';
    var d0 = bwConcatMs(y, '07:00');
    return !isNaN(d0) && !isNaN(x.msStart) && x.msStart >= d0;
  });
}

/** Simpan wizard Bongkar di browser: tanggal operasi + setup + langkah + kunci (tetap dipakai setelah refresh sampai ganti tanggal / buka kunci). */
var BW_WIZ_LS_VER = 2;
var BW_WIZ_LS_PREFIX = 'bkk_bw_wizard_state';

function bwWizardLocalKey() {
  if (!appState.user || !appState.user.username) return '';
  return BW_WIZ_LS_PREFIX + '|v' + BW_WIZ_LS_VER + '|' + String(appState.user.username).toLowerCase();
}

function bwPersistWizardLocal() {
  var key = bwWizardLocalKey();
  if (!key) return;
  try {
    var snap = bwWiz.lockSnap;
    var o = {
      u: appState.user.username,
      tanggal: ($('bw_tanggal') && $('bw_tanggal').value) || '',
      bk_id: ($('bw_bk_id') && $('bw_bk_id').value) || '',
      shift: ($('bw_shift') && $('bw_shift').value) || '',
      type_bongkaran: ($('bw_type_bongkaran') && $('bw_type_bongkaran').value) || '',
      material: ($('bw_material') && $('bw_material').value) || '',
      supplier: ($('bw_supplier') && $('bw_supplier').value) || '',
      step: bwWiz.step || 1,
      setupLocked: !!bwWiz.setupLocked,
      lockSnap: snap ? JSON.parse(JSON.stringify(snap)) : null
    };
    localStorage.setItem(key, JSON.stringify(o));
  } catch (e) {}
}

function bwRestoreWizardLocal() {
  var key = bwWizardLocalKey();
  if (!key || !appState.user || !appState.user.username) return false;
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return false;
    var d = JSON.parse(raw);
    if (String(d.u || '').toLowerCase() !== String(appState.user.username).toLowerCase()) return false;
    if (!d.tanggal) return false;
    if ($('bw_tanggal')) $('bw_tanggal').value = d.tanggal;
    if (d.bk_id != null && $('bw_bk_id')) $('bw_bk_id').value = d.bk_id;
    if (d.shift != null && $('bw_shift')) $('bw_shift').value = d.shift;
    if (d.type_bongkaran != null && $('bw_type_bongkaran')) $('bw_type_bongkaran').value = d.type_bongkaran;
    if (d.material != null && $('bw_material')) $('bw_material').value = d.material;
    if (d.supplier != null && $('bw_supplier')) $('bw_supplier').value = d.supplier;
    if (d.step >= 1 && d.step <= 3) bwWiz.step = d.step;
    else bwWiz.step = 1;
    // Selalu mulai setup terbuka saat wizard dibuka ulang.
    bwWiz.setupLocked = false;
    bwWiz.lockSnap = null;
    if (typeof applyBongkarMasterDefaults === 'function') applyBongkarMasterDefaults($('bw_bk_id').value);
    bwUpdateSetupLockUI();
    return true;
  } catch (e) {
    return false;
  }
}

/** Overlay loading + cegah double-submit antar Step 1–3. */
function bwWizardSaveStart() {
  if (bwWiz.saving) return false;
  bwWiz.saving = true;
  if (typeof showLoader === 'function') showLoader(true);
  return true;
}

function bwWizardSaveEnd() {
  bwWiz.saving = false;
  if (typeof showLoader === 'function') showLoader(false);
}

function bwEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function bwDayPlus(ymd, plus) {
  var d = new Date(ymd + 'T00:00:00+07:00');
  if (isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + (plus || 0));
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function bwTimeMsWithOffset(ymd, hm, dayOffset) {
  if (!ymd || !hm) return NaN;
  return bwConcatMs(bwDayPlus(ymd, dayOffset || 0), hm);
}

function bwWarnPopup(title, text) {
  if (typeof Swal !== 'undefined' && Swal.fire) {
    Swal.fire({ icon: 'warning', title: title, text: text, confirmButtonText: 'OK' });
    return;
  }
  alert(title + '\n' + text);
}

function bwSuggestRevisePbTiming(tr, text, targetMin, detail) {
  var nopol = (tr && tr.cells && tr.cells[0] && tr.cells[0].textContent) ? String(tr.cells[0].textContent).trim() : '';
  var rowId = tr ? String(tr.getAttribute('data-id') || '').trim() : '';
  var openParam = function() {
    var t = Number(targetMin) || 0;
    if (t <= 0) t = 1;
    bwRequireRealtimeBreakdown(
      's3fix|' + (rowId || nopol || 'x') + '|abqc_pbsampai',
      t,
      'Parameter Step 2: AB QC vs PB Sampai (' + t + ' m)',
      detail || ('Nopol: ' + (nopol || '—')),
      function() {}
    );
  };
  var retryInput = function() {
    if (!tr) return;
    var iq = tr.querySelector('.bw-ab-qc');
    if (iq) {
      iq.value = '';
      bwStep3SetOffset(iq, 0);
      iq.focus();
    }
  };
  if (typeof Swal !== 'undefined' && Swal.fire) {
    Swal.fire({
      icon: 'warning',
      title: 'Urutan tidak valid',
      text: text + ' Revisi timeline PB di Step 2 dulu sebelum isi netto.',
      showCancelButton: true,
      confirmButtonText: 'Isi parameter Step 2',
      cancelButtonText: 'Nanti dulu'
    }).then(function(res) {
      if (res.isConfirmed) openParam();
      else retryInput();
    });
    return;
  }
  alert('Urutan tidak valid.\n' + text + '\nRevisi timeline PB di Step 2 dulu sebelum isi netto.');
  retryInput();
}

function bwRequireRealtimeBreakdown(key, targetMin, title, detail, done) {
  if (!bwWiz.liveBreakdowns) bwWiz.liveBreakdowns = {};
  var saved = bwWiz.liveBreakdowns[key];
  if (saved && saved.targetMin === targetMin && Array.isArray(saved.rows) && saved.rows.length) {
    if (typeof done === 'function') done(saved.rows);
    return;
  }
  bwRunBreakdownQueue([{ key: key, targetMin: targetMin, title: title, detail: detail || '' }], 0, {}, function(acc) {
    var rows = acc[key] || [];
    bwWiz.liveBreakdowns[key] = { targetMin: targetMin, rows: rows };
    if (typeof done === 'function') done(rows);
  });
}

function bwRequireRealtimeBreakdownQueue(items, done) {
  if (!Array.isArray(items) || !items.length) {
    if (typeof done === 'function') done();
    return;
  }
  if (!bwWiz.liveBreakdowns) bwWiz.liveBreakdowns = {};
  var prefilled = {};
  var queue = items.filter(function(it) {
    var sv = bwWiz.liveBreakdowns[it.key];
    if (sv && sv.targetMin === it.targetMin && Array.isArray(sv.rows) && sv.rows.length) {
      prefilled[it.key] = sv.rows;
      return false;
    }
    return true;
  });
  if (!queue.length) {
    if (typeof done === 'function') done();
    return;
  }
  bwRunBreakdownQueue(queue, 0, prefilled, function(acc) {
    Object.keys(acc || {}).forEach(function(k) {
      var rows = acc[k];
      var q = queue.find(function(x) { return x.key === k; });
      var tg = q ? q.targetMin : 0;
      bwWiz.liveBreakdowns[k] = { targetMin: tg, rows: rows };
    });
    if (typeof done === 'function') done();
  });
}

function bwAskNextDay(fieldLabel, prevLabel, prevHm, currHm, onYes, onNo) {
  var msg = fieldLabel + ' (' + currHm + ') lebih kecil dari ' + prevLabel + ' (' + prevHm + ').\n' +
    'Apakah ' + fieldLabel + ' dianggap tanggal berikutnya (+1)?';
  if (typeof Swal !== 'undefined' && Swal.fire) {
    Swal.fire({
      icon: 'question',
      title: 'Konfirmasi lintas tanggal',
      text: msg,
      showCancelButton: true,
      confirmButtonText: 'Ya, tanggal +1',
      cancelButtonText: 'Tidak, saya ubah lagi'
    }).then(function(res) {
      if (res.isConfirmed) onYes();
      else onNo();
    });
    return;
  }
  if (confirm(msg)) onYes();
  else onNo();
}

/** Riwayat dari API harus selalu array (JSONP kadang mengirim bentuk lain). */
function bwNormalizeBongkarHistory(data) {
  if (data == null) return [];
  var arr = Array.isArray(data) ? data : [];
  return typeof bwDedupeBongkarHistoryRows === 'function' ? bwDedupeBongkarHistoryRows(arr) : arr;
}

/** Cocokkan tanggal operasi wizard dengan baris sheet (TANGGAL ± TIMESTAMP). */
function bwRowMatchesWizardTanggal(r, tgl) {
  if (!tgl || !r) return false;
  if (dashDateToYMD(r.TANGGAL) === tgl) return true;
  var ts = r.TIMESTAMP;
  if (ts != null && ts !== '') {
    var d = ts instanceof Date ? ts : new Date(ts);
    if (!isNaN(d.getTime()) && dashDateToYMD(d) === tgl) return true;
  }
  return false;
}

function bwMaterialIsSBM() {
  var lab = '';
  if (bwWiz.setupLocked && bwWiz.lockSnap && bwWiz.lockSnap.materialLabel) {
    lab = String(bwWiz.lockSnap.materialLabel);
  } else {
    var sel = $('bw_material');
    if (!sel) return false;
    lab = (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || sel.value || '';
  }
  return String(lab).toLowerCase().indexOf('sbm') >= 0;
}

function bwTypeIsIntake71() {
  var v = bwEffectiveTypeBongkaran();
  return v === 'intake71_manual' || v === 'intake71_tilting';
}

function bwConcatMs(ymd, hm) {
  if (!ymd || !hm) return NaN;
  var p = String(hm).split(':');
  var h = parseInt(p[0], 10), m = parseInt(p[1] || '0', 10);
  if (isNaN(h) || isNaN(m)) return NaN;
  return new Date(ymd + 'T' + pad2(h) + ':' + pad2(m) + ':00+07:00').getTime();
}

function bwDiffMin(msA, msB) {
  if (isNaN(msA) || isNaN(msB)) return NaN;
  return Math.round((msB - msA) / 60000);
}

function bwParseDurasiJson(row) {
  if (!row) return null;
  var colBd = row.BREAKDOWN_DURASI;
  if ((colBd == null || colBd === '') && row['BREAKDOWN DURASI'] != null) colBd = row['BREAKDOWN DURASI'];
  var mergedBreakdowns = null;
  if (colBd != null && String(colBd).trim() !== '' && String(colBd).trim() !== '{}') {
    try {
      var ext = typeof colBd === 'string' ? JSON.parse(colBd) : colBd;
      if (ext && typeof ext === 'object' && !Array.isArray(ext)) mergedBreakdowns = ext;
    } catch (e0) {}
  }
  if (!row.DURASI_JSON) {
    return mergedBreakdowns ? { v: 1, breakdowns: mergedBreakdowns } : null;
  }
  try {
    var obj = typeof row.DURASI_JSON === 'string' ? JSON.parse(row.DURASI_JSON) : row.DURASI_JSON;
    if (!obj || typeof obj !== 'object') {
      return mergedBreakdowns ? { v: 1, breakdowns: mergedBreakdowns } : null;
    }
    if (mergedBreakdowns) obj.breakdowns = mergedBreakdowns;
    else if (!obj.breakdowns) obj.breakdowns = {};
    return obj;
  } catch (e) {
    return mergedBreakdowns ? { v: 1, breakdowns: mergedBreakdowns } : null;
  }
}

/** Jam dari sel Spreadsheet: string "HH:MM" atau Date. */
function bwNormalizeSheetTime(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    var s = v.trim();
    if (s.indexOf('T') !== -1) {
      try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      } catch (e) {}
    }
    return s.length >= 5 ? s.substring(0, 5) : s;
  }
  if (typeof v === 'object' && v instanceof Date && !isNaN(v.getTime())) {
    return pad2(v.getHours()) + ':' + pad2(v.getMinutes());
  }
  return String(v);
}

function bwSheetYMD(cell) {
  if (cell == null || cell === '') return '';
  if (typeof cell === 'object' && cell instanceof Date && !isNaN(cell.getTime())) return dashDateToYMD(cell);
  var s = String(cell).trim();
  if (!s) return '';
  if (s.indexOf('T') !== -1) {
    return typeof dashDateToYMD === 'function' ? dashDateToYMD(s) : s.substring(0, 10);
  }
  return s.substring(0, 10);
}

/**
 * Gabungan JSON (breakdown) + kolom waktu di sheet — sumber utama kolom agar parse tidak gagal.
 */
function bwGetDurasiFields(row) {
  if (!row) return null;
  var j = bwParseDurasiJson(row);
  if (!j) j = {};
  if (row.AB_TANGGAL != null && String(row.AB_TANGGAL).trim() !== '') j.ab_tanggal = j.ab_tanggal || bwSheetYMD(row.AB_TANGGAL);
  if (row.PB_TANGGAL != null && String(row.PB_TANGGAL).trim() !== '') j.pb_tanggal = j.pb_tanggal || bwSheetYMD(row.PB_TANGGAL);
  if (row.AB_ARRIVAL != null && String(row.AB_ARRIVAL).trim() !== '') j.ab_arrival = bwNormalizeSheetTime(row.AB_ARRIVAL);
  if (row.AB_QC != null && String(row.AB_QC).trim() !== '') j.ab_qc = bwNormalizeSheetTime(row.AB_QC);
  if (row.PB_SAMPAI != null && String(row.PB_SAMPAI).trim() !== '') j.pb_sampai = bwNormalizeSheetTime(row.PB_SAMPAI);
  if (row.PB_START != null && String(row.PB_START).trim() !== '') j.pb_start = bwNormalizeSheetTime(row.PB_START);
  if (row.PB_HOLD != null && String(row.PB_HOLD).trim() !== '') j.pb_hold = bwNormalizeSheetTime(row.PB_HOLD);
  if (row.PB_RESTART != null && String(row.PB_RESTART).trim() !== '') j.pb_restart = bwNormalizeSheetTime(row.PB_RESTART);
  if (row.PB_FINISH != null && String(row.PB_FINISH).trim() !== '') j.pb_finish = bwNormalizeSheetTime(row.PB_FINISH);
  if (!j.pb_start || !j.pb_finish) return null;
  return j;
}

function bwInputByMatchesUser(row) {
  if (!appState.user) return false;
  var ib = String(row.INPUT_BY || '').trim().toLowerCase();
  if (!ib) return false;
  var n = (appState.user.nama || '').trim().toLowerCase();
  if (n && ib.indexOf(n) >= 0) return true;
  var u = (appState.user.username || '').trim().toLowerCase();
  if (u && ib.indexOf(u) >= 0) return true;
  return false;
}

/** Baris yang masih harus dilengkapi di Step 3 (termasuk sheet tanpa kolom STATUS_ROW). */
function bwIsPendingBongkarRow(r) {
  var net = Number(r.NETTO_KG);
  if (isNaN(net)) net = 0;
  var st = String(r.STATUS_ROW == null ? '' : r.STATUS_ROW).trim();
  if (st === 'complete') return false;
  if (st === 'pending_final') return true;
  if (net === 0 && bwGetDurasiFields(r)) return true;
  var dj = r.DURASI_JSON;
  if (net === 0 && dj != null && String(dj).length > 2) return true;
  return false;
}

/** Jika sheet belum punya kolom SHIFT, jangan saring keluar. */
function bwShiftMatchesRow(r, sh) {
  var rs = String(r.SHIFT == null ? '' : r.SHIFT).trim();
  if (!rs) return true;
  return rs === String(sh || '').trim();
}

function bwWizardTypeDisplay() {
  var v = bwEffectiveTypeBongkaran();
  if (v === 'intake71_manual') return 'Intake 71 Manual';
  if (v === 'intake71_tilting') return 'Intake 71 Tilting';
  if (v === 'direct_gudang') return 'Direct Gudang';
  return v ? v.replace(/_/g, ' ') : '—';
}

function bwWizardMaterialLabel() {
  if (bwWiz.setupLocked && bwWiz.lockSnap && bwWiz.lockSnap.materialLabel) {
    return String(bwWiz.lockSnap.materialLabel).trim();
  }
  var sel = $('bw_material');
  if (!sel || sel.selectedIndex < 0) return '';
  var o = sel.options[sel.selectedIndex];
  return ((o && o.text) || sel.value || '').trim();
}

/** PB Start form saat ini (SBM pakai sbm fields) untuk pratinjau urutan jam. */
function bwDraftPbStartMs() {
  var ymd;
  var hm;
  if (bwMaterialIsSBM()) {
    ymd = (($('bw_sbm_pb_tgl') && $('bw_sbm_pb_tgl').value) || ($('bw_tanggal') && $('bw_tanggal').value) || '').trim();
    hm = ($('bw_sbm_pb_start') && $('bw_sbm_pb_start').value || '').trim();
  } else {
    ymd = (($('bw_pb_tgl') && $('bw_pb_tgl').value) || ($('bw_tanggal') && $('bw_tanggal').value) || '').trim();
    hm = ($('bw_pb_start') && $('bw_pb_start').value || '').trim();
  }
  if (!ymd || !hm) return NaN;
  return bwConcatMs(ymd, hm);
}

function bwRenderTruckBadge(el, mainText, subText) {
  if (!el) return;
  el.textContent = '';
  var m = document.createElement('div');
  m.className = 'bw-truck-badge-main';
  m.textContent = mainText;
  el.appendChild(m);
  if (subText) {
    var s = document.createElement('div');
    s.className = 'bw-truck-badge-sub';
    s.textContent = subText;
    el.appendChild(s);
  }
}

/**
 * Badge Step 2: nomor urut dari jam PB Start (semua operator), filter setup = type + material persis.
 * Urutan tampilan truck ke-N dari jam 07:00 (hari PB).
 */
function bwUpdateTruckBadge() {
  var el = $('bw_truck_badge');
  if (!el) return;
  var es = bwEffectiveSetup();
  var typeLab = bwWizardTypeDisplay();
  var matLab = bwWizardMaterialLabel() || '—';
  var grp = bwWizardTypeGroupFromType(es.type_bongkaran);
  var fullList = grp === 'direct' ? bwListDirectGudangTrucksForDay() : (grp === 'intake71' ? bwListIntake71TrucksForDay() : []);
  var list0700 = bwListFrom0700(fullList);
  var draftMs = bwDraftPbStartMs();
  var subBase = 'Filter: BK + tanggal + shift + type + material (sama persis). Intake 71 = Manual & Tilting satu antrian. Urutan dari jam PB Start; hitung truck ke-N dari ±07:00 WIB.';
  if (!es.material) {
    bwRenderTruckBadge(el, 'Lengkapi Setup (material wajib) lalu buka Step 2 — filter antrian mengikuti setup terkunci.', subBase);
    return;
  }
  if (isNaN(draftMs)) {
    var head = typeLab + ' — ' + matLab;
    var extra = list0700.length
      ? (' Dari 07:00: ' + list0700.length + ' truck di sheet. Isi PB Start untuk nomor urut pasti.')
      : (fullList.length
        ? (' Ada ' + fullList.length + ' truck sebelum 07:00 / di luar jendela tabel; isi PB Start.')
        : (' Belum ada truck di sheet untuk filter ini.'));
    bwRenderTruckBadge(el, head, subBase + extra);
    return;
  }
  var rank = 1;
  for (var i = 0; i < list0700.length; i++) {
    if (list0700[i].msStart < draftMs) rank++;
  }
  bwRenderTruckBadge(el, 'Truck ke-' + rank + ' — ' + typeLab + ' — ' + matLab, subBase);
}

function bwIntakeDirectColumnLabel() {
  var g = bwWizardTypeGroupFromType(bwEffectiveSetup().type_bongkaran);
  return g === 'direct' ? 'Direct' : 'Intake 71';
}

function bwInputByDisplayName(rawInputBy) {
  var txt = String(rawInputBy == null ? '' : rawInputBy).trim();
  if (!txt) return '—';
  return txt.replace(/\s*\(Shift\s*\d+\)\s*$/i, '').trim() || txt;
}

/** Daftar truck antrian (PB ≥ 07:00) untuk filter setup saat ini. */
function bwStep2QueueList0700() {
  var es = bwEffectiveSetup();
  var grp = bwWizardTypeGroupFromType(es.type_bongkaran);
  if (!es.material || !es.bk_id || !es.tanggal) return [];
  var fullList = grp === 'direct' ? bwListDirectGudangTrucksForDay() : (grp === 'intake71' ? bwListIntake71TrucksForDay() : []);
  return bwListFrom0700(fullList);
}

/** Shadow di samping nopol: truck berikutnya (lanjutan urutan tabel). */
function bwRefreshNopolShadow() {
  var el = $('bw_nopol_next_shadow');
  if (!el) return;
  if ((bwWiz.step || 1) !== 2 || !bwWiz.setupLocked) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  var es = bwEffectiveSetup();
  if (!es.material || !es.bk_id || !es.tanggal) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  var list0700 = bwStep2QueueList0700();
  var extra = (bwWiz.nopolBatch && bwWiz.nopolBatch.length) ? bwWiz.nopolBatch.length : 0;
  var nextN = list0700.length + 1 + extra;
  el.hidden = false;
  el.textContent = 'Truck ke-' + nextN + ' — pengisian form ini (lanjutan antrian). Isi nopol & durasi lalu simpan.';
}

function bwNormNopol(x) {
  return String(x || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function bwRenderNopolBatch() {
  var host = $('bw_nopol_batch_list');
  if (!host) return;
  host.innerHTML = '';
  var list = Array.isArray(bwWiz.nopolBatch) ? bwWiz.nopolBatch : [];
  if (!list.length) {
    host.innerHTML = '<span class="fhint" style="font-size:0.78rem;color:#64748b;">Belum ada nopol tambahan.</span>';
    bwRefreshNopolShadow();
    return;
  }
  list.forEach(function(np, idx) {
    var chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid #cbd5e1;background:#f8fafc;font-size:0.78rem;';
    chip.innerHTML = '<strong style="font-weight:700;">' + bwEsc(np) + '</strong>';
    var rm = document.createElement('button');
    rm.type = 'button';
    rm.textContent = 'x';
    rm.style.cssText = 'border:none;background:transparent;cursor:pointer;color:#64748b;font-weight:700;';
    rm.addEventListener('click', function() {
      bwWiz.nopolBatch.splice(idx, 1);
      bwRenderNopolBatch();
    });
    chip.appendChild(rm);
    host.appendChild(chip);
  });
  bwRefreshNopolShadow();
}

function bwAddCurrentNopolToBatch() {
  var inp = $('bw_nopol');
  if (!inp) return false;
  var nopol = bwNormNopol(inp.value);
  if (!nopol) {
    toast('Isi nopol dulu, lalu klik Tambah Nopol.', 'w');
    return false;
  }
  if (!Array.isArray(bwWiz.nopolBatch)) bwWiz.nopolBatch = [];
  if (bwWiz.nopolBatch.indexOf(nopol) >= 0) {
    toast('Nopol sudah ada di daftar.', 'w');
    return false;
  }
  bwWiz.nopolBatch.push(nopol);
  inp.value = '';
  bwRenderNopolBatch();
  inp.focus();
  return true;
}

function bwGetStep2NopolListForSubmit() {
  if (!Array.isArray(bwWiz.nopolBatch)) bwWiz.nopolBatch = [];
  var inp = $('bw_nopol');
  var liveNp = inp ? bwNormNopol(inp.value) : '';
  if (liveNp && bwWiz.nopolBatch.indexOf(liveNp) < 0) bwWiz.nopolBatch.push(liveNp);
  var out = [];
  var seen = {};
  bwWiz.nopolBatch.forEach(function(x) {
    var np = bwNormNopol(x);
    if (!np || seen[np]) return;
    seen[np] = true;
    out.push(np);
  });
  return out;
}

function bwRefreshStep2MiniTable() {
  var wrap = $('bw_step2_queue_wrap');
  var tb = $('bw_step2_queue_tb');
  var ctx = $('bw_step2_queue_ctx');
  if (!wrap || !tb) {
    bwRefreshNopolShadow();
    return;
  }
  if ((bwWiz.step || 1) !== 2 || !bwWiz.setupLocked) {
    wrap.hidden = true;
    tb.innerHTML = '';
    if (ctx) {
      ctx.hidden = true;
      ctx.textContent = '';
    }
    bwRefreshNopolShadow();
    return;
  }
  var es = bwEffectiveSetup();
  var grp = bwWizardTypeGroupFromType(es.type_bongkaran);
  if (!es.material || !es.bk_id || !es.tanggal) {
    wrap.hidden = true;
    tb.innerHTML = '';
    if (ctx) {
      ctx.hidden = true;
      ctx.textContent = '';
    }
    bwRefreshNopolShadow();
    return;
  }
  wrap.hidden = false;
  var list0700 = bwStep2QueueList0700();
  var matLine = es.materialLabel || es.material || '—';
  var routeCol = bwIntakeDirectColumnLabel();
  var userName = (appState.user && appState.user.nama) ? String(appState.user.nama).trim() : '—';
  if (ctx) {
    ctx.hidden = false;
    ctx.textContent = matLine + ' — ' + routeCol + ' — ' + userName;
  }
  tb.innerHTML = '';
  if (!list0700.length) {
    var tr0 = document.createElement('tr');
    var td0 = document.createElement('td');
    td0.colSpan = 5;
    td0.style.cssText = 'padding:12px;font-size:0.82rem;color:#64748b;';
    td0.textContent = 'Belum ada truck dengan PB Start ≥ 07:00 untuk filter setup ini (material + type).';
    tr0.appendChild(td0);
    tb.appendChild(tr0);
    bwRefreshNopolShadow();
    return;
  }
  list0700.forEach(function(x, idx) {
    var tr = document.createElement('tr');
    var net = x.nettoKg;
    var pending = !net || net <= 0;
    function td(txt) {
      var c = document.createElement('td');
      c.textContent = txt;
      return c;
    }
    tr.appendChild(td('Truck ke-' + (idx + 1)));
    tr.appendChild(td(x.pbStartHM || '—'));
    tr.appendChild(td(x.nopol || '—'));
    tr.appendChild(td(pending ? '—' : String(net)));
    tr.appendChild(td(x.userName || '—'));
    tb.appendChild(tr);
  });
  bwRefreshNopolShadow();
}

function bwClearStep2Form() {
  var np = $('bw_nopol');
  if (np) np.value = '';
  bwWiz.nopolBatch = [];
  bwWiz.liveBreakdowns = {};
  bwRenderNopolBatch();
  var s1 = $('bw_sbm_pb_start');
  var s2 = $('bw_sbm_pb_finish');
  if (s1) s1.value = '';
  if (s2) s2.value = '';
  ['bw_pb_sampai', 'bw_pb_start', 'bw_pb_hold', 'bw_pb_restart', 'bw_pb_finish'].forEach(function(id) {
    var x = $(id);
    if (x) {
      x.value = '';
      bwStep2SetFieldDayOffset(x, 0);
    }
  });
  bwStep2SetFieldDayOffset($('bw_sbm_pb_start'), 0);
  bwStep2SetFieldDayOffset($('bw_sbm_pb_finish'), 0);
  bwSyncGhostHint();
  bwUpdateTruckBadge();
  bwRefreshStep2MiniTable();
}

/** Patokan PB Finish — BK + tanggal + shift + material + grup type (Intake vs Direct) agar antrian tidak tercampur. */
function bwSessionPbFinishKey() {
  var es = bwEffectiveSetup();
  var grp = bwWizardTypeGroupFromType(es.type_bongkaran) || 'x';
  var mat = String(es.material || '').trim();
  return 'bkk_pb_finish|' + es.tanggal + '|' + es.shift + '|' + es.bk_id + '|' + mat + '|' + grp;
}

function bwSetSessionPbFinishHint(hm, optNopol) {
  if (hm == null || hm === '') return;
  try {
    var np = optNopol != null ? String(optNopol).trim() : '';
    if (np)
      sessionStorage.setItem(bwSessionPbFinishKey(), JSON.stringify({ hm: String(hm), np: np }));
    else
      sessionStorage.setItem(bwSessionPbFinishKey(), String(hm));
  } catch (e) {}
}

function bwGetSessionPbFinishHint() {
  try {
    var raw = sessionStorage.getItem(bwSessionPbFinishKey()) || '';
    if (!raw) return '';
    if (raw.charAt(0) === '{') {
      try {
        var o = JSON.parse(raw);
        return (o.hm != null ? String(o.hm) : '') || '';
      } catch (e1) {
        return raw;
      }
    }
    return raw;
  } catch (e) {
    return '';
  }
}

function bwGetSessionPrevNopol() {
  try {
    var raw = sessionStorage.getItem(bwSessionPbFinishKey()) || '';
    if (raw.charAt(0) === '{') {
      var o = JSON.parse(raw);
      return String(o.np || '').trim();
    }
    return '';
  } catch (e) {
    return '';
  }
}

/**
 * Core: BK + tanggal + shift + material (persis) + grup type (intake71 = manual+tilting gabung; direct terpisah).
 * Baris logis dobel (sheet / cache) disaring satu per kombinasi nopol + PB start/finish + hari PB.
 */
function bwListChainTrucksCore(optionalRows, chainKind) {
  var es = bwEffectiveSetup();
  var tgl = es.tanggal;
  var sh = es.shift;
  var bk = es.bk_id;
  var mat = es.material;
  if (!tgl || !bk || !mat) return [];
  var rows;
  if (optionalRows != null) {
    rows = Array.isArray(optionalRows) ? optionalRows.slice() : [];
  } else {
    rows = (appState.history && appState.history.bongkar) ? appState.history.bongkar.slice() : [];
  }
  var out = [];
  var seenLog = {};
  rows.forEach(function(r) {
    if (String(r.BK_ID) !== String(bk)) return;
    if (dashDateToYMD(r.TANGGAL) !== tgl) return;
    if (!bwShiftMatchesRow(r, sh)) return;
    if (!bwRowMaterialExact(r, mat)) return;
    if (chainKind === 'intake71' && !bwRowMatchesTypeGroup(r, 'intake71')) return;
    if (chainKind === 'direct' && !bwRowMatchesTypeGroup(r, 'direct')) return;
    var dj = bwGetDurasiFields(r);
    if (!dj) return;
    var ymd = dj.pb_tanggal || bwSheetYMD(r.PB_TANGGAL) || dashDateToYMD(r.TANGGAL) || tgl;
    var msS = bwConcatMs(ymd, dj.pb_start || '');
    var msF = bwConcatMs(ymd, dj.pb_finish || '');
    if (isNaN(msS) || isNaN(msF)) return;
    var logKey = [chainKind, bk, tgl, mat, String(r.NO_POLISI || '').trim().toUpperCase(), ymd, dj.pb_start || '', dj.pb_finish || '', String(msS)].join('|');
    if (seenLog[logKey]) return;
    seenLog[logKey] = true;
    var net = Number(r.NETTO_KG);
    if (isNaN(net)) net = 0;
    out.push({
      msStart: msS,
      msFinish: msF,
      pbFinishHM: dj.pb_finish,
      pbStartHM: dj.pb_start,
      nopol: String(r.NO_POLISI || '').trim().toUpperCase(),
      dayYmd: ymd,
      nettoKg: net,
      rowId: r.ID,
      userName: bwInputByDisplayName(r.INPUT_BY)
    });
  });
  out.sort(function(a, b) { return a.msStart - b.msStart; });
  return out;
}

/** Intake 71 Manual + Tilting satu antrian; filter material persis. */
function bwListIntake71TrucksForDay(optionalRows) {
  return bwListChainTrucksCore(optionalRows, 'intake71');
}

/** Direct Gudang — antrian terpisah vs Intake 71; filter material persis. */
function bwListDirectGudangTrucksForDay(optionalRows) {
  return bwListChainTrucksCore(optionalRows, 'direct');
}

/** Max PB Finish (ms), jam, nopol truk patokan — sheet + session. */
function bwPrevFinishPatokanDetail(optionalRows) {
  var es = bwEffectiveSetup();
  var tgl = es.tanggal;
  var list = bwListIntake71TrucksForDay(optionalRows);
  var bestMs = 0;
  var bestHm = '';
  var bestNp = '';
  list.forEach(function(x) {
    if (x.msFinish > bestMs) {
      bestMs = x.msFinish;
      bestHm = x.pbFinishHM || '';
      bestNp = x.nopol || '';
    }
  });
  var sessHm = bwGetSessionPbFinishHint();
  var sessNp = bwGetSessionPrevNopol();
  if (sessHm && tgl) {
    var sm = bwConcatMs(tgl, sessHm);
    if (!isNaN(sm) && sm >= bestMs) {
      bestMs = sm;
      bestHm = sessHm;
      bestNp = sessNp || bestNp;
    }
  }
  return { ms: bestMs, hm: bestHm, prevNopol: bestNp };
}

function bwPrevFinishPatokan(optionalRows) {
  var d = bwPrevFinishPatokanDetail(optionalRows);
  return { ms: d.ms, hm: d.hm };
}

/** Bandingan nopol + jam untuk popup jeda antar truck Intake 71. */
function bwFormatGapTruckSubtitle(curNopol, curPbStartHm) {
  var d = bwPrevFinishPatokanDetail();
  var pn = (d.prevNopol || '').trim();
  var ph = d.hm || '—';
  var cn = (curNopol || '').trim() || '—';
  var ch = curPbStartHm || '—';
  if (!pn) pn = '(nopol truk sebelumnya)';
  return pn + ' · PB Finish ' + ph + '   vs   ' + cn + ' · PB Start ' + ch;
}

function bwGhostPrevFinishHM(optionalRows) {
  var d = bwPrevFinishPatokanDetail(optionalRows);
  if (d.hm) bwSetSessionPbFinishHint(d.hm, d.prevNopol);
  return d.hm || '';
}

/** Intake 71 Manual/Tilting: PB Start harus STRICT setelah PB Finish truck lain (tidak boleh sama). */
function bwValidatePbStrictAfterPrevious(pbStartMs, pbFinishMs) {
  if (!bwTypeIsIntake71()) return null;
  if (bwEffectiveTypeBongkaran() === 'direct_gudang') return null;
  var p = bwPrevFinishPatokan();
  if (!p.ms && !p.hm) return null;
  if (pbStartMs <= p.ms) {
    var hm = p.hm || '';
    return 'PB Start truck ini harus setelah PB Finish truck sebelumnya' +
      (hm ? ' (patokan selesai: ' + hm + ').' : '.') + ' Tidak boleh sama atau lebih awal.';
  }
  return null;
}

/** optionalRows = data bongkar untuk BK ini (mis. hasil fetch segar). */
function bwSyncGhostHint(optionalRows) {
  var g1 = $('bw_pb_start_ghost');
  var g2 = $('bw_sbm_pb_ghost');
  if (!bwTypeIsIntake71()) {
    if (g1) g1.textContent = '';
    if (g2) g2.textContent = '';
    return;
  }
  var hm = bwGhostPrevFinishHM(optionalRows);
  var sbm = bwMaterialIsSBM();
  var txt = hm
    ? ('PB Finish sebelumnya: ' + hm + ' — PB Start wajib setelah jam ini (tidak sama).')
    : (sbm ? '—' : '');
  if (g1) g1.textContent = sbm ? '' : (hm ? txt : '');
  if (g2) g2.textContent = sbm ? (hm ? txt : '—') : '';
}

/** Ambil riwayat bongkar untuk BK aktif lalu isi bayangan (panggil saat buka Step 2). */
function bwRefreshGhostFromServer() {
  var es = bwEffectiveSetup();
  var bk = es.bk_id;
  var tgl = es.tanggal;
  if (!bk || !tgl) {
    bwSyncGhostHint();
    bwRefreshStep2MiniTable();
    return;
  }
  fetchAPI('getBongkarHistory', { bk_id: bk, limit: 800 }, function(resp) {
    var pack = resp.status !== 'error' ? resp.data : [];
    if (!Array.isArray(pack)) pack = [];
    syncBongkarHistoryMergeBK(bk, pack);
    bwSyncGhostHint(pack);
    bwUpdateTruckBadge();
    bwRefreshStep2MiniTable();
  });
}

/** Kunci logis untuk menyaring baris bongkar duplikat di cache (ID beda, isi sama). */
function bwBongkarLogicalMergeKey_(r) {
  var dj = bwGetDurasiFields(r);
  if (!dj || !dj.pb_start || !dj.pb_finish) {
    return 'raw|' + String(r.BK_ID || '') + '|' + dashDateToYMD(r.TANGGAL) + '|' + String(r.MATERIAL || '') + '|' +
      String(r.NO_POLISI || '').trim().toUpperCase().replace(/\s+/g, '') + '|' + String(r.ID || '') + '|' + String(r.TIMESTAMP || '');
  }
  var ps = String(dj.pb_start);
  var pf = String(dj.pb_finish);
  var py = String(dj.pb_tanggal || (r.PB_TANGGAL != null ? bwSheetYMD(r.PB_TANGGAL) : ''));
  return [
    String(r.BK_ID || ''),
    dashDateToYMD(r.TANGGAL),
    String(r.MATERIAL || ''),
    String(r.NO_POLISI || '').trim().toUpperCase().replace(/\s+/g, ''),
    py, ps, pf
  ].join('\u001f');
}

function bwDedupeBongkarHistoryRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  var seenId = {};
  var seenLog = {};
  var out = [];
  rows.forEach(function(r) {
    var id = String(r.ID != null ? r.ID : '').trim();
    if (id) {
      if (seenId[id]) return;
      seenId[id] = true;
    }
    var lk = bwBongkarLogicalMergeKey_(r);
    if (seenLog[lk]) return;
    seenLog[lk] = true;
    out.push(r);
  });
  return out;
}

/** Gabungkan baris BK ini ke cache global tanpa membuang BK lain. */
function syncBongkarHistoryMergeBK(bkId, bkRows) {
  var all = (appState.history && appState.history.bongkar) ? appState.history.bongkar.slice() : [];
  var norm = String(bkId || '');
  var rest = all.filter(function(r) { return String(r.BK_ID || '') !== norm; });
  var add = Array.isArray(bkRows) ? bkRows : [];
  appState.history.bongkar = bwDedupeBongkarHistoryRows(rest.concat(add));
}

function bwGapPrevIntakePB(pbStartMs) {
  var p = bwPrevFinishPatokan();
  if (!p.ms && !p.hm) return NaN;
  return bwDiffMin(p.ms, pbStartMs);
}

function bwValidateIntakeOverlap(pbStartMs, pbFinishMs) {
  if (!bwTypeIsIntake71()) return null;
  if (bwEffectiveTypeBongkaran() === 'direct_gudang') return null;
  var list = bwListIntake71TrucksForDay();
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    // overlap area: interval bersinggungan (termasuk sama-sama menit bila bentrok)
    if (pbStartMs < p.msFinish && pbFinishMs > p.msStart)
      return 'Durasi overlap dengan truck lain di rantai Intake 71. Ubah PB Start / PB Finish.';
  }
  return null;
}

/** Urutan PB saja (AB di Step 3). Pasangan berurutan yang keduanya terisi. */
function bwBuildSegmentQueueNonSBM(pbT) {
  var steps = [
    { y: pbT, hmId: 'bw_pb_sampai', lab: 'PB Sampai Gudang' },
    { y: pbT, hmId: 'bw_pb_start', lab: 'PB Start Bongkar' },
    { y: pbT, hmId: 'bw_pb_hold', lab: 'PB Hold QC' },
    { y: pbT, hmId: 'bw_pb_restart', lab: 'PB Restart QC' },
    { y: pbT, hmId: 'bw_pb_finish', lab: 'PB Finish' }
  ];
  var points = [];
  for (var i = 0; i < steps.length; i++) {
    var el = $(steps[i].hmId);
    var hm = el ? el.value : '';
    if (!hm) continue;
    var off = bwStep2GetFieldDayOffset(el);
    var ms = bwTimeMsWithOffset(steps[i].y, hm, off);
    if (isNaN(ms)) continue;
    points.push({ ms: ms, lab: steps[i].lab, idx: i });
  }
  var q = [];
  for (var j = 1; j < points.length; j++) {
    var gap = bwDiffMin(points[j - 1].ms, points[j].ms);
    var lab = points[j - 1].lab.split(' → ')[0] + ' → ' + points[j].lab;
    if (gap < 0) return { error: 'Urutan jam tidak kronologis (' + lab + ')' };
    if (gap > BW_NON_SBM_BREAKDOWN_MIN) q.push({ key: 'seg_' + points[j - 1].idx + '_' + points[j].idx, targetMin: gap, title: 'Breakdown: ' + lab + ' (' + gap + ' m)' });
  }
  return { queue: q };
}

function bwBdAddRow(host) {
  var wrap = document.createElement('div');
  wrap.className = 'bw-bd-row';
  var sel = '<select class="bw-bd-cat" style="width:100%;padding:8px;border-radius:8px;border:1px solid #cbd5e1;">';
  BW_BREAKDOWN_CATS.forEach(function(c) {
    sel += '<option value="' + c + '">' + c + '</option>';
  });
  sel += '</select>';
  wrap.innerHTML = sel +
    '<input type="number" class="bw-bd-min" min="0" step="1" placeholder="menit" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;">';
  wrap.querySelector('.bw-bd-cat').addEventListener('change', function() {
    if (this.value === 'OTHER') {
      if (!wrap.querySelector('.bw-bd-other')) {
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'bw-bd-other';
        inp.placeholder = 'Keterangan OTHER';
        inp.style.cssText = 'grid-column:1/-1;width:100%;padding:8px;margin-top:6px;border-radius:8px;border:1px solid #cbd5e1;';
        wrap.appendChild(inp);
      }
    } else {
      var ox = wrap.querySelector('.bw-bd-other');
      if (ox) ox.remove();
    }
  });
  host.appendChild(wrap);
  bwBdUpdateSisa();
}

/** Sisa menit (seperti DT v2): live saat user mengisi angka. */
function bwBdUpdateSisa() {
  var total = bwWiz.bdTargetMin || 0;
  var host = $('bw_bd_rows');
  var sisaEl = $('bw_bd_sisa');
  var btn = $('bw_bd_ok');
  if (!host || !sisaEl) return;
  var sum = 0;
  host.querySelectorAll('.bw-bd-min').forEach(function(inp) {
    sum += parseInt(inp.value, 10) || 0;
  });
  var sisa = total - sum;
  if (sisa === 0) {
    sisaEl.textContent = 'PAS — sisa 0 menit (bisa OK)';
    sisaEl.style.color = '#10b981';
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
  } else if (sisa > 0) {
    sisaEl.textContent = 'Sisa ' + sisa + ' menit wajib diisi';
    sisaEl.style.color = '#f59e0b';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
  } else {
    sisaEl.textContent = Math.abs(sisa) + ' menit berlebih — kurangi isian';
    sisaEl.style.color = '#ef4444';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
  }
}

function bwBdCollectRows(host, targetMin) {
  var rows = host.querySelectorAll('.bw-bd-row');
  var sum = 0;
  var out = [];
  var ok = true;
  rows.forEach(function(row) {
    var cat = row.querySelector('.bw-bd-cat').value;
    var m = parseInt(row.querySelector('.bw-bd-min').value, 10) || 0;
    var otInp = row.querySelector('.bw-bd-other');
    var ot = otInp ? otInp.value.trim() : '';
    if (cat === 'OTHER' && !ot) {
      toast('Isi keterangan untuk OTHER', 'w');
      ok = false;
      return;
    }
    sum += m;
    out.push({ cat: cat, min: m, other: cat === 'OTHER' ? ot : '' });
  });
  if (!ok) return null;
  if (sum !== targetMin) {
    toast('Total breakdown harus tepat ' + targetMin + ' menit (isi: ' + sum + ')', 'w');
    return null;
  }
  return out;
}

function bwRunBreakdownQueue(queue, idx, acc, done) {
  if (!queue.length) {
    done(acc);
    return;
  }
  if (idx >= queue.length) {
    done(acc);
    return;
  }
  var item = queue[idx];
  $('bw_bd_title').textContent = item.title;
  var ctxEl = $('bw_bd_ctx');
  if (ctxEl) {
    if (item.detail) {
      ctxEl.textContent = item.detail;
      ctxEl.style.display = 'block';
    } else {
      ctxEl.textContent = '';
      ctxEl.style.display = 'none';
    }
  }
  $('bw_bd_total').textContent = item.targetMin + ' menit';
  bwWiz.bdTargetMin = item.targetMin;
  var host = $('bw_bd_rows');
  host.innerHTML = '';
  bwBdAddRow(host);
  bwBdUpdateSisa();
  if (typeof showLoader === 'function') showLoader(false);
  $('bw_bd_modal').classList.add('open');
  bwWiz.bdPending = { queue: queue, idx: idx, acc: acc, targetMin: item.targetMin, key: item.key, done: done };
  var addBtn = $('bw_bd_add');
  if (addBtn) addBtn.onclick = function() { bwBdAddRow(host); };
}

function bwBdConfirmOk() {
  var p = bwWiz.bdPending;
  if (!p) return;
  var item = p.queue[p.idx];
  var host = $('bw_bd_rows');
  var rows = bwBdCollectRows(host, item.targetMin);
  if (!rows) return;
  p.acc[item.key] = rows;
  $('bw_bd_modal').classList.remove('open');
  bwWiz.bdPending = null;
  bwRunBreakdownQueue(p.queue, p.idx + 1, p.acc, p.done);
}

function bwBdConfirmCancel() {
  $('bw_bd_modal').classList.remove('open');
  bwWiz.bdPending = null;
  bwWiz.bdTargetMin = 0;
  bwWizardSaveEnd();
}

function bwStep2SetFieldDayOffset(inputEl, dayOffset) {
  if (!inputEl) return;
  inputEl.setAttribute('data-day-offset', String(dayOffset || 0));
  var ghostId = inputEl.id + '_dayhint';
  var g = document.getElementById(ghostId);
  if (!g) {
    g = document.createElement('div');
    g.id = ghostId;
    g.className = 'fhint';
    g.style.cssText = 'font-size:0.75rem;color:#0369a1;margin-top:4px;';
    inputEl.insertAdjacentElement('afterend', g);
  }
  g.textContent = (dayOffset || 0) > 0 ? ('Tanggal +' + dayOffset) : '';
}

function bwStep2GetFieldDayOffset(inputEl) {
  if (!inputEl) return 0;
  var n = parseInt(inputEl.getAttribute('data-day-offset') || '0', 10);
  return isNaN(n) ? 0 : n;
}

function bwStep2ValidatePairOnMove(prevId, currId, prevLabel, currLabel, thresholdMin, thresholdLabel, breakdownKey) {
  var prevEl = $(prevId);
  var curEl = $(currId);
  if (!prevEl || !curEl) return;
  var tgl = ($('bw_pb_tgl') && $('bw_pb_tgl').value) || ($('bw_sbm_pb_tgl') && $('bw_sbm_pb_tgl').value) || $('bw_tanggal').value;
  var pv = (prevEl.value || '').trim();
  var cv = (curEl.value || '').trim();
  if (!tgl || !pv || !cv) return;
  var prevOff = bwStep2GetFieldDayOffset(prevEl);
  var curOff = bwStep2GetFieldDayOffset(curEl);
  var pm = bwTimeMsWithOffset(tgl, pv, prevOff);
  var cm = bwTimeMsWithOffset(tgl, cv, curOff);
  if (isNaN(pm) || isNaN(cm)) return;
  if (cm < pm) {
    bwAskNextDay(currLabel, prevLabel, pv, cv, function() {
      bwStep2SetFieldDayOffset(curEl, prevOff + 1);
      cm = bwTimeMsWithOffset(tgl, cv, prevOff + 1);
      var gap2 = bwDiffMin(pm, cm);
      if (!isNaN(gap2) && thresholdMin > 0 && gap2 > thresholdMin) {
        bwRequireRealtimeBreakdown(
          breakdownKey || ('live|' + prevId + '|' + currId),
          gap2,
          'Breakdown: ' + thresholdLabel + ' (' + gap2 + ' m)',
          prevLabel + ' ' + pv + ' → ' + currLabel + ' ' + cv + ' (Tanggal +' + (prevOff + 1) + ')'
        );
      }
    }, function() {
      curEl.value = '';
      bwStep2SetFieldDayOffset(curEl, 0);
      curEl.focus();
    });
    return;
  }
  var gap = bwDiffMin(pm, cm);
  if (!isNaN(gap) && thresholdMin > 0 && gap > thresholdMin) {
    bwRequireRealtimeBreakdown(
      breakdownKey || ('live|' + prevId + '|' + currId),
      gap,
      'Breakdown: ' + thresholdLabel + ' (' + gap + ' m)',
      prevLabel + ' ' + pv + ' → ' + currLabel + ' ' + cv
    );
  }
}

function bwSubmitStep2() {
  var bkId = $('bw_bk_id').value;
  var tgl = $('bw_tanggal').value;
  var shift = $('bw_shift').value;
  var mat = $('bw_material').value;
  var sup = $('bw_supplier').value;
  var typ = $('bw_type_bongkaran').value;
  var nopolList = bwGetStep2NopolListForSubmit();
  var nopol = nopolList[0] || '';
  if (!bkId || !tgl || !nopolList.length) {
    toast('Lengkapi BK, tanggal operasi, dan minimal 1 nopol', 'w');
    return;
  }
  if (!bwWizardSaveStart()) return;

  var isSbm = bwMaterialIsSBM();
  var dj = { v: 1, is_sbm: isSbm, type_bongkaran: typ, pb_tanggal: tgl };

  bkkEnsureOpnameHistory(function() {
    var queue = [];

    if (isSbm) {
      var ps = $('bw_sbm_pb_start').value;
      var pf = $('bw_sbm_pb_finish').value;
      var pbt = ($('bw_sbm_pb_tgl') && $('bw_sbm_pb_tgl').value) || tgl;
      var sbmStartOff = bwStep2GetFieldDayOffset($('bw_sbm_pb_start'));
      var sbmFinishOff = bwStep2GetFieldDayOffset($('bw_sbm_pb_finish'));
      dj.pb_tanggal = pbt;
      dj.pb_start = ps;
      dj.pb_finish = pf;
      dj.pb_day_offsets = { pb_start: sbmStartOff, pb_finish: sbmFinishOff };
      var msS = bwTimeMsWithOffset(pbt, ps, sbmStartOff);
      var msF = bwTimeMsWithOffset(pbt, pf, sbmFinishOff);
      if (isNaN(msS) || isNaN(msF)) {
        toast('Isi PB Start & PB Finish', 'w');
        bwWizardSaveEnd();
        return;
      }
      var vSo = bkkValidateTanggalBongkarKirim(bkId, pbt, { eventMs: msS });
      if (!vSo.ok) {
        bkkShowReject(vSo.msg);
        bwWizardSaveEnd();
        return;
      }
      if (msF < msS) {
        toast('PB Finish harus setelah PB Start', 'w');
        bwWizardSaveEnd();
        return;
      }
      var strictS = bwValidatePbStrictAfterPrevious(msS, msF);
      if (strictS) {
        toast(strictS, 'w');
        bwWizardSaveEnd();
        return;
      }
      var ovS = bwValidateIntakeOverlap(msS, msF);
      if (ovS) {
        toast(ovS, 'w');
        bwWizardSaveEnd();
        return;
      }

      var dmin = bwDiffMin(msS, msF);
      if (bwTypeIsIntake71() && dmin > BW_SBM_INTAKE_PROCESS_MIN) {
        queue.push({ key: 'sbm_pb_window', targetMin: dmin, title: 'Downtime PB (SBM Intake) — total ' + dmin + ' menit (wajib dirinci penuh)' });
      }

      if (bwTypeIsIntake71()) {
        var g = bwGapPrevIntakePB(msS);
        if (!isNaN(g) && g > BW_SBM_INTAKE_GAP_TRUCK_MIN) {
          queue.push({
            key: 'sbm_gap_truck',
            targetMin: g,
            title: 'Jeda vs truck Intake 71 sebelumnya — total ' + g + ' menit (wajib dirinci penuh)',
            detail: bwFormatGapTruckSubtitle(nopolList.join(', '), ps)
          });
        }
      }
    } else {
      var need = ['bw_pb_sampai', 'bw_pb_start', 'bw_pb_finish'];
      for (var ni = 0; ni < need.length; ni++) {
        if (!$(need[ni]).value) {
          toast('Lengkapi timeline: AB Arrival, AB QC, PB Sampai, PB Start, PB Finish', 'w');
          bwWizardSaveEnd();
          return;
        }
      }
      var hh = $('bw_pb_hold').value, rr = $('bw_pb_restart').value;
      if (hh && !rr) { toast('Isi PB Restart bila PB Hold diisi', 'w'); bwWizardSaveEnd(); return; }
      if (rr && !hh) { toast('Isi PB Hold bila PB Restart diisi', 'w'); bwWizardSaveEnd(); return; }

      var pbT = $('bw_pb_tgl').value || tgl;
      $('bw_pb_tgl').value = pbT;
      dj.pb_tanggal = pbT;
      dj.ab_tanggal = '';
      dj.ab_arrival = '';
      dj.ab_qc = '';
      dj.pb_sampai = $('bw_pb_sampai').value;
      dj.pb_start = $('bw_pb_start').value;
      dj.pb_hold = $('bw_pb_hold').value;
      dj.pb_restart = $('bw_pb_restart').value;
      dj.pb_finish = $('bw_pb_finish').value;
      var offSampai = bwStep2GetFieldDayOffset($('bw_pb_sampai'));
      var offStart = bwStep2GetFieldDayOffset($('bw_pb_start'));
      var offHold = bwStep2GetFieldDayOffset($('bw_pb_hold'));
      var offRestart = bwStep2GetFieldDayOffset($('bw_pb_restart'));
      var offFinish = bwStep2GetFieldDayOffset($('bw_pb_finish'));
      dj.pb_day_offsets = {
        pb_sampai: offSampai,
        pb_start: offStart,
        pb_hold: offHold,
        pb_restart: offRestart,
        pb_finish: offFinish
      };

      var pbMsS = bwTimeMsWithOffset(pbT, dj.pb_start, offStart);
      var pbMsF = bwTimeMsWithOffset(pbT, dj.pb_finish, offFinish);
      if (isNaN(pbMsS) || isNaN(pbMsF)) {
        toast('PB Start / PB Finish tidak valid', 'w');
        bwWizardSaveEnd();
        return;
      }
      var vSoN = bkkValidateTanggalBongkarKirim(bkId, pbT, { eventMs: pbMsS });
      if (!vSoN.ok) {
        bkkShowReject(vSoN.msg);
        bwWizardSaveEnd();
        return;
      }

      var seg = bwBuildSegmentQueueNonSBM(pbT);
      if (seg.error) {
        toast(seg.error, 'w');
        bwWizardSaveEnd();
        return;
      }
      seg.queue.forEach(function(s) { queue.push(s); });

      if (bwTypeIsIntake71()) {
        var strictN = bwValidatePbStrictAfterPrevious(pbMsS, pbMsF);
        if (strictN) {
          toast(strictN, 'w');
          bwWizardSaveEnd();
          return;
        }
        var ov2 = bwValidateIntakeOverlap(pbMsS, pbMsF);
        if (ov2) {
          toast(ov2, 'w');
          bwWizardSaveEnd();
          return;
        }
        var g2 = bwGapPrevIntakePB(pbMsS);
        if (!isNaN(g2) && g2 > BW_NON_SBM_BREAKDOWN_MIN) {
          queue.push({
            key: 'gap_truck_ns',
            targetMin: g2,
            title: 'Jeda vs truck Intake 71 sebelumnya — total ' + g2 + ' menit (wajib dirinci penuh)',
            detail: bwFormatGapTruckSubtitle(nopolList.join(', '), dj.pb_start)
          });
        }
      }
    }

    var prefilled = {};
    if (!bwWiz.liveBreakdowns) bwWiz.liveBreakdowns = {};
    queue = queue.filter(function(it) {
      var sv = bwWiz.liveBreakdowns[it.key];
      if (sv && sv.targetMin === it.targetMin && Array.isArray(sv.rows) && sv.rows.length) {
        prefilled[it.key] = sv.rows;
        return false;
      }
      return true;
    });
    bwRunBreakdownQueue(queue, 0, prefilled, function(breakdowns) {
      dj.breakdowns = breakdowns;
      var inpBy = (appState.user ? appState.user.nama + ' (Shift ' + shift + ')' : '');
      if (typeof showLoader === 'function') showLoader(true);
      /** POST body — hindari potong URL JSONP; breakdown wizard hilang jika DURASI_JSON terlalu panjang di query string. */
      var sendAdd = typeof postJSONAPI === 'function' ? postJSONAPI : postAPI;
      var okCount = 0;
      var fail = [];
      var idx = 0;
      function sendNext() {
        if (idx >= nopolList.length) {
          bwWizardSaveEnd();
          if (okCount > 0) {
            toast('Durasi tersimpan untuk ' + okCount + ' nopol. Lanjut isi truck berikutnya, atau buka Step 3.', 's');
            if (dj.pb_finish) bwSetSessionPbFinishHint(dj.pb_finish, nopolList[nopolList.length - 1]);
          }
          if (fail.length) {
            toast('Sebagian gagal: ' + fail.join(' | '), 'w');
          }
          bwUpdateTruckBadge();
          bwClearStep2Form();
          fetchAPI('getBongkarHistory', { limit: 1500 }, function(r2) {
            appState.history.bongkar = bwNormalizeBongkarHistory(r2.status !== 'error' ? r2.data : []);
            bwRefreshStep3();
            bwSyncGhostHint();
            bwRefreshStep2MiniTable();
            bwPersistWizardLocal();
          });
          if (typeof loadDashboard === 'function') {
            setTimeout(function() { loadDashboard(function() {}); }, 80);
          }
          bwGoStep(2);
          return;
        }
        var np = nopolList[idx++];
        var payload = {
          TANGGAL: tgl,
          BK_ID: bkId,
          MATERIAL: mat,
          SUPPLIER: sup,
          NETTO_KG: 0,
          NO_POLISI: np,
          SHIFT: shift,
          TYPE_BONGKARAN: typ,
          STATUS_ROW: 'pending_final',
          INPUT_BY: inpBy,
          DURASI_JSON: JSON.stringify(dj)
        };
        sendAdd('addBongkar', payload, function(resp) {
          if (resp.status === 'error') fail.push(np + ': ' + resp.message);
          else okCount++;
          sendNext();
        });
      }
      sendNext();
    });
  });
}

function bwGoStep(n) {
  bwWiz.step = n;
  document.querySelectorAll('.bw-step-btn').forEach(function(b) {
    b.classList.toggle('active', String(b.getAttribute('data-bw-step')) === String(n));
  });
  document.querySelectorAll('.bw-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'bw-panel-' + n);
  });
  if (n === 1) {
    bwUpdateSetupLockUI();
    var qw = $('bw_step2_queue_wrap');
    if (qw) qw.hidden = true;
    var tbc = $('bw_step2_queue_tb');
    if (tbc) tbc.innerHTML = '';
    var qctx = $('bw_step2_queue_ctx');
    if (qctx) {
      qctx.hidden = true;
      qctx.textContent = '';
    }
    bwRefreshNopolShadow();
  }
  if (n === 3) {
    showLoader(true);
    fetchAPI('getBongkarHistory', { limit: 4000 }, function(resp) {
      showLoader(false);
      appState.history.bongkar = bwNormalizeBongkarHistory(resp.status !== 'error' ? resp.data : []);
      bwRefreshStep3();
      bwPersistWizardLocal();
    });
    bwPersistWizardLocal();
    return;
  }
  if (n === 2) {
    bwToggleDurasiMode();
    bwUpdateTruckBadge();
    bwRefreshGhostFromServer();
    bwRefreshStep2MiniTable();
  }
  bwPersistWizardLocal();
}

function bwToggleDurasiMode() {
  var full = $('bw_durasi_full');
  var sbm = $('bw_durasi_sbm');
  if (!full || !sbm) return;
  var isSbm = bwMaterialIsSBM();
  full.style.display = isSbm ? 'none' : 'block';
  sbm.style.display = isSbm ? 'block' : 'none';
  var t = $('bw_tanggal').value;
  if ($('bw_sbm_pb_tgl')) $('bw_sbm_pb_tgl').value = t;
  if ($('bw_pb_tgl')) $('bw_pb_tgl').value = t;
}

/** Nilai awal AB untuk baris Step 3 dari sheet / DURASI_JSON. */
function bwStep3AbDefaults(r) {
  var dj = bwGetDurasiFields(r);
  var abTgl = '';
  var abArr = '';
  var abQc = '';
  if (dj) {
    abTgl = dj.ab_tanggal || '';
    abArr = dj.ab_arrival || '';
    abQc = dj.ab_qc || '';
  }
  if (r.AB_TANGGAL != null && String(r.AB_TANGGAL).trim() !== '') abTgl = abTgl || bwSheetYMD(r.AB_TANGGAL);
  if (r.AB_ARRIVAL != null && String(r.AB_ARRIVAL).trim() !== '') abArr = abArr || bwNormalizeSheetTime(r.AB_ARRIVAL);
  if (r.AB_QC != null && String(r.AB_QC).trim() !== '') abQc = abQc || bwNormalizeSheetTime(r.AB_QC);
  return { abTgl: abTgl, abArr: abArr, abQc: abQc };
}

function bwStep3PairMs(abTgl, hm, off) {
  if (!abTgl || !hm) return NaN;
  return bwTimeMsWithOffset(abTgl, hm, off || 0);
}

function bwStep3SetOffset(el, off) {
  if (!el) return;
  el.setAttribute('data-day-offset', String(off || 0));
  var hintId = (el.id || ('abw_' + Math.random())) + '_dayhint';
  var h = el.nextElementSibling;
  if (!h || !h.classList || !h.classList.contains('bw-day-hint')) {
    h = document.createElement('div');
    h.className = 'bw-day-hint';
    h.style.cssText = 'font-size:0.72rem;color:#0369a1;margin-top:2px;';
    el.insertAdjacentElement('afterend', h);
  }
  h.textContent = (off || 0) > 0 ? ('Tanggal +' + off) : '';
}

function bwStep3GetOffset(el) {
  if (!el) return 0;
  var n = parseInt(el.getAttribute('data-day-offset') || '0', 10);
  return isNaN(n) ? 0 : n;
}

function bwStep3ValidateRowRealtime(tr, trigger) {
  if (!tr) return;
  var isSbm = tr.getAttribute('data-bw-sbm') === '1';
  if (isSbm) return;
  var it = tr.querySelector('.bw-ab-tgl');
  var ia = tr.querySelector('.bw-ab-arr');
  var iq = tr.querySelector('.bw-ab-qc');
  if (!it || !ia || !iq) return;
  var abTgl = (it.value || '').trim();
  var abArr = (ia.value || '').trim();
  var abQc = (iq.value || '').trim();
  var pbTgl = tr.getAttribute('data-pb-tgl') || '';
  var pbSampai = tr.getAttribute('data-pb-sampai') || '';
  var baseAbTgl = abTgl || pbTgl || (($('bw_tanggal') && $('bw_tanggal').value) || '');
  var rowId = String(tr.getAttribute('data-id') || 'x');
  var nopolText = (tr.cells && tr.cells[0] && tr.cells[0].textContent) ? String(tr.cells[0].textContent).trim() : '—';
  var pendingBd = [];
  if (abTgl && pbTgl && abTgl > pbTgl) {
    bwWarnPopup('Urutan tidak valid', 'AB Tanggal tidak boleh lebih dari PB Tanggal.');
    it.focus();
    return;
  }
  if (abArr && abQc) {
    var arrOff = bwStep3GetOffset(ia);
    var qcOff = bwStep3GetOffset(iq);
    var arrMs = bwStep3PairMs(baseAbTgl, abArr, arrOff);
    var qcMs = bwStep3PairMs(baseAbTgl, abQc, qcOff);
    if (!isNaN(arrMs) && !isNaN(qcMs) && qcMs < arrMs) {
      bwAskNextDay('AB QC', 'AB Arrival', abArr, abQc, function() {
        bwStep3SetOffset(iq, arrOff + 1);
        var qcMs2 = bwStep3PairMs(baseAbTgl, abQc, arrOff + 1);
        var gap2 = bwDiffMin(arrMs, qcMs2);
        var chainItems = [];
        if (!isNaN(gap2) && gap2 > 60) {
          chainItems.push({
            key: 's3|' + rowId + '|ab_arr_qc',
            targetMin: gap2,
            title: 'Breakdown: AB Arrival → AB QC (' + gap2 + ' m)',
            detail: 'Nopol: ' + nopolText + ' · ' + abArr + ' → ' + abQc + ' (Tanggal +1)'
          });
        }
        if (pbSampai && pbTgl) {
          var pbMs2 = bwTimeMsWithOffset(pbTgl, pbSampai, 0);
          if (!isNaN(pbMs2) && !isNaN(qcMs2)) {
            if (qcMs2 > pbMs2) {
              var gapFix2 = bwDiffMin(pbMs2, qcMs2);
              bwSuggestRevisePbTiming(
                tr,
                'AB QC tidak boleh setelah PB Sampai Gudang.',
                gapFix2,
                'Nopol: ' + nopolText + ' · PB Sampai ' + pbSampai + ' vs AB QC ' + abQc
              );
              iq.focus();
              return;
            }
            var gapPb2 = bwDiffMin(qcMs2, pbMs2);
            if (gapPb2 > BW_ABQC_TO_PBSAMPAI_MIN) {
              chainItems.push({
                key: 's3|' + rowId + '|ab_qc_pbsampai',
                targetMin: gapPb2,
                title: 'Breakdown: AB QC → PB Sampai Gudang (' + gapPb2 + ' m)',
                detail: 'Nopol: ' + nopolText + ' · AB QC ' + abQc + ' → PB Sampai ' + pbSampai
              });
            }
          }
        }
        bwRequireRealtimeBreakdownQueue(chainItems, function() {});
      }, function() {
        iq.value = '';
        bwStep3SetOffset(iq, 0);
        iq.focus();
      });
      return;
    }
    var gap = bwDiffMin(arrMs, qcMs);
    if (!isNaN(gap) && gap > 60 && (trigger === 'to_qc' || trigger === 'to_netto')) {
      pendingBd.push({
        key: 's3|' + rowId + '|ab_arr_qc',
        targetMin: gap,
        title: 'Breakdown: AB Arrival → AB QC (' + gap + ' m)',
        detail: 'Nopol: ' + nopolText + ' · ' + abArr + ' → ' + abQc
      });
    }
  }
  if (abQc && pbSampai && pbTgl) {
    var qcOff2 = bwStep3GetOffset(iq);
    var qcMs3 = bwStep3PairMs(baseAbTgl, abQc, qcOff2);
    var pbMs = bwTimeMsWithOffset(pbTgl, pbSampai, 0);
    if (!isNaN(qcMs3) && !isNaN(pbMs)) {
      if (qcMs3 > pbMs) {
        var gapFix = bwDiffMin(pbMs, qcMs3);
        var nopolQ = (tr.cells && tr.cells[0] && tr.cells[0].textContent) ? String(tr.cells[0].textContent).trim() : '—';
        bwSuggestRevisePbTiming(
          tr,
          'AB QC tidak boleh setelah PB Sampai Gudang.',
          gapFix,
          'Nopol: ' + nopolQ + ' · PB Sampai ' + pbSampai + ' vs AB QC ' + abQc
        );
        iq.focus();
        return;
      }
      var gap3 = bwDiffMin(qcMs3, pbMs);
      if (gap3 > BW_ABQC_TO_PBSAMPAI_MIN && (trigger === 'to_qc' || trigger === 'to_netto')) {
        pendingBd.push({
          key: 's3|' + rowId + '|ab_qc_pbsampai',
          targetMin: gap3,
          title: 'Breakdown: AB QC → PB Sampai Gudang (' + gap3 + ' m)',
          detail: 'Nopol: ' + nopolText + ' · AB QC ' + abQc + ' → PB Sampai ' + pbSampai
        });
      }
    }
  }
  if (pendingBd.length) {
    bwRequireRealtimeBreakdownQueue(pendingBd, function() {});
  }
}

function bwRefreshStep3() {
  var tb = $('bw_step3_tb');
  var tbd = $('bw_step3_durasi_tb');
  var sum = $('bw_step3_summary');
  if (!tb || !appState.user) return;
  var tgl = $('bw_tanggal').value;
  var sh = $('bw_shift').value;
  var es = bwEffectiveSetup();
  var grp = bwWizardTypeGroupFromType(es.type_bongkaran);
  var matSel = $('bw_material');
  var matLabel = matSel && matSel.options[matSel.selectedIndex] ? matSel.options[matSel.selectedIndex].text : '';
  if (sum) {
    sum.innerHTML = '<strong>' + bwEsc(matLabel) + '</strong> · Shift ' + bwEsc(sh) + ' · ' + bwEsc(tgl) +
      ' · ' + bwEsc(appState.user.nama || '');
  }
  tb.innerHTML = '';
  if (tbd) tbd.innerHTML = '';
  var rows = bwNormalizeBongkarHistory(appState.history && appState.history.bongkar);
  var shown = 0;
  rows.forEach(function(r) {
    if (!bwIsPendingBongkarRow(r)) return;
    if (!bwRowMatchesWizardTanggal(r, tgl)) return;
    if (!bwShiftMatchesRow(r, sh)) return;
    if (es.bk_id && String(r.BK_ID || '') !== String(es.bk_id)) return;
    if (es.material && !bwRowMaterialExact(r, es.material)) return;
    var rowType = String(r.TYPE_BONGKARAN || '').trim();
    if (grp && rowType && !bwRowMatchesTypeGroup(r, grp)) return;
    if (!bwInputByMatchesUser(r)) return;

    var isSbm = String(r.MATERIAL || '').toLowerCase().indexOf('sbm') >= 0;
    var ab = bwStep3AbDefaults(r);
    var djDur = bwGetDurasiFields(r) || {};
    if (tbd) {
      var trd = document.createElement('tr');
      trd.innerHTML =
        '<td>' + bwEsc(r.NO_POLISI || '') + '</td>' +
        '<td>' + bwEsc(djDur.pb_tanggal || '—') + '</td>' +
        '<td>' + bwEsc(djDur.pb_sampai || '—') + '</td>' +
        '<td>' + bwEsc(djDur.pb_start || '—') + '</td>' +
        '<td>' + bwEsc(djDur.pb_hold || '—') + '</td>' +
        '<td>' + bwEsc(djDur.pb_restart || '—') + '</td>' +
        '<td>' + bwEsc(djDur.pb_finish || '—') + '</td>';
      tbd.appendChild(trd);
    }
    var tr = document.createElement('tr');
    tr.setAttribute('data-id', r.ID);
    tr.setAttribute('data-bw-sbm', isSbm ? '1' : '0');
    var dj2 = bwGetDurasiFields(r) || {};
    tr.setAttribute('data-pb-tgl', dj2.pb_tanggal || tgl);
    tr.setAttribute('data-pb-sampai', dj2.pb_sampai || '');
    tr.innerHTML =
      '<td>' + bwEsc(r.NO_POLISI || '') + '</td>' +
      (isSbm
        ? '<td><span class="bw-cell-x">—</span></td><td><span class="bw-cell-x">—</span></td><td><span class="bw-cell-x">—</span></td>'
        : '<td><input type="date" class="bw-ab-tgl"></td>' +
          '<td><input type="time" class="bw-ab-arr"></td>' +
          '<td><input type="time" class="bw-ab-qc"></td>') +
      '<td><input type="number" class="bw-netto" min="0" step="0.01" placeholder="kg"></td>';
    tb.appendChild(tr);
    if (!isSbm) {
      var it = tr.querySelector('.bw-ab-tgl');
      var ia = tr.querySelector('.bw-ab-arr');
      var iq = tr.querySelector('.bw-ab-qc');
      if (it && ab.abTgl) it.value = ab.abTgl.length >= 10 ? ab.abTgl.substring(0, 10) : ab.abTgl;
      if (ia && ab.abArr) ia.value = ab.abArr;
      if (iq && ab.abQc) iq.value = ab.abQc;
      if (it) it.addEventListener('change', function() { bwStep3ValidateRowRealtime(tr, 'to_arrival'); });
      if (ia) ia.addEventListener('blur', function() { bwStep3ValidateRowRealtime(tr, 'to_qc'); });
      if (iq) iq.addEventListener('blur', function() { bwStep3ValidateRowRealtime(tr, 'to_netto'); });
    }
    shown++;
  });
  if (sum && shown === 0) {
    sum.innerHTML += '<div style="margin-top:10px;font-size:0.88rem;color:#64748b;">Belum ada draft untuk BK + tanggal + shift ini (atau data belum dimuat — tutup & buka lagi Step 3).</div>';
  }
}

/** Kumpulkan baris yang siap disimpan (SBM: netto saja; non-SBM: AB + netto). */
function bwStep3CollectFilledRows() {
  var tb = $('bw_step3_tb');
  if (!tb) return { ok: [], skipIncomplete: 0 };
  var ok = [];
  var skipIncomplete = 0;
  tb.querySelectorAll('tr').forEach(function(tr) {
    var id = tr.getAttribute('data-id');
    if (!id) return;
    var isSbm = tr.getAttribute('data-bw-sbm') === '1';
    var netEl = tr.querySelector('.bw-netto');
    var netto = parseFloat(netEl && netEl.value);
    if (!netto || netto <= 0) return;
    if (isSbm) {
      ok.push({
        id: id,
        netto: netto,
        abTgl: '',
        abArr: '',
        abQc: '',
        nopol: (tr.cells[0] && tr.cells[0].textContent) || ''
      });
      return;
    }
    var abTgl = (tr.querySelector('.bw-ab-tgl') && tr.querySelector('.bw-ab-tgl').value) || '';
    var abArr = (tr.querySelector('.bw-ab-arr') && tr.querySelector('.bw-ab-arr').value) || '';
    var abQc = (tr.querySelector('.bw-ab-qc') && tr.querySelector('.bw-ab-qc').value) || '';
    if (!abTgl || !abArr || !abQc) {
      skipIncomplete++;
      return;
    }
    var pbTgl = tr.getAttribute('data-pb-tgl') || '';
    var pbSampai = tr.getAttribute('data-pb-sampai') || '';
    if (pbTgl && abTgl > pbTgl) {
      skipIncomplete++;
      return;
    }
    var arrOff = bwStep3GetOffset(tr.querySelector('.bw-ab-arr'));
    var qcOff = bwStep3GetOffset(tr.querySelector('.bw-ab-qc'));
    var arrMs = bwStep3PairMs(abTgl, abArr, arrOff);
    var qcMs = bwStep3PairMs(abTgl, abQc, qcOff);
    var pbMs = pbTgl && pbSampai ? bwTimeMsWithOffset(pbTgl, pbSampai, 0) : NaN;
    if (!isNaN(arrMs) && !isNaN(qcMs) && qcMs < arrMs) {
      skipIncomplete++;
      return;
    }
    if (!isNaN(qcMs) && !isNaN(pbMs) && qcMs > pbMs) {
      skipIncomplete++;
      return;
    }
    ok.push({
      id: id,
      netto: netto,
      abTgl: abTgl,
      abArr: abArr,
      abQc: abQc,
      nopol: (tr.cells[0] && tr.cells[0].textContent) || ''
    });
  });
  return { ok: ok, skipIncomplete: skipIncomplete };
}

/** Simpan beberapa finalize beruntun (JSONP), lalu refresh Step 3 + dashboard. */
function bwFinalizeStep3Bulk() {
  var pack = bwStep3CollectFilledRows();
  if (pack.skipIncomplete > 0) {
    toast(pack.skipIncomplete + ' baris dilewati: AB belum lengkap atau urutan waktu tidak valid.', 'w');
  }
  if (!pack.ok.length) {
    toast('Isi netto pada baris yang ingin disimpan (baris kosong tidak diproses).', 'w');
    return;
  }
  if (!bwWizardSaveStart()) return;

  var idx = 0;
  var okCount = 0;
  var failMsg = [];

  function step() {
    if (idx >= pack.ok.length) {
      bwWizardSaveEnd();
      if (pack.ok.length && okCount === pack.ok.length) {
        toast('Semua ' + okCount + ' baris tersimpan.', 's');
      } else if (okCount > 0) {
        toast(okCount + ' baris tersimpan. ' + (pack.ok.length - okCount) + ' gagal.', 'w');
      } else if (failMsg.length === 1) {
        toast(failMsg[0], 'e');
      } else if (failMsg.length) {
        toast('Gagal menyimpan ' + failMsg.length + ' baris.', 'e');
      }
      fetchAPI('getBongkarHistory', { limit: 4000 }, function(r2) {
        appState.history.bongkar = bwNormalizeBongkarHistory(r2.status !== 'error' ? r2.data : []);
        bwRefreshStep3();
        if (typeof loadDashboard === 'function') loadDashboard(function() {});
        bwPersistWizardLocal();
      });
      return;
    }
    var p = pack.ok[idx];
    idx++;
    postAPI('finalizeBongkar', {
      ID: p.id,
      NETTO_KG: p.netto,
      AB_TANGGAL: p.abTgl || '',
      AB_ARRIVAL: p.abArr || '',
      AB_QC: p.abQc || '',
      ARRIVAL_DATE: p.abTgl || '',
      ARRIVAL_TIME: p.abArr || ''
    }, function(resp) {
      if (resp.status === 'error') {
        failMsg.push((p.nopol || p.id) + ': ' + resp.message);
      } else {
        okCount++;
      }
      step();
    });
  }
  step();
}

function bwSaveStep1() {
  if (!appState.user || !appState.user.username) return;
  if (!bwWizardSaveStart()) return;
  var dk = $('bw_tanggal').value;
  var payload = {
    tanggal: dk,
    bk_id: $('bw_bk_id').value,
    shift: $('bw_shift').value,
    material: $('bw_material').value,
    supplier: $('bw_supplier').value,
    type_bongkaran: $('bw_type_bongkaran').value
  };
  postAPI('saveBongkarSetup', {
    username: appState.user.username,
    date_key: dk,
    nama: appState.user.nama || '',
    payload: JSON.stringify(payload)
  }, function(resp) {
    bwWizardSaveEnd();
    if (resp.status === 'error') toast('Gagal simpan setup: ' + resp.message, 'e');
    else {
      toast('Setup tersimpan', 's');
      bwPersistWizardLocal();
    }
  });
}

function bwLoadSetupFromServer() {
  if (!appState.user || !appState.user.username) return;
  var dk = $('bw_tanggal').value || (typeof todayYMD_WIB === 'function' ? todayYMD_WIB() : todayStr());
  $('bw_tanggal').value = dk;
  fetchAPI('getBongkarSetup', { username: appState.user.username, date_key: dk }, function(resp) {
    if (resp.status === 'error' || !resp.data || !resp.data.payload) return;
    var p = resp.data.payload;
    if (p.bk_id) $('bw_bk_id').value = p.bk_id;
    if (p.shift) $('bw_shift').value = p.shift;
    if (p.material) $('bw_material').value = p.material;
    if (p.supplier) $('bw_supplier').value = p.supplier;
    if (p.type_bongkaran) $('bw_type_bongkaran').value = p.type_bongkaran;
    applyBongkarMasterDefaults($('bw_bk_id').value);
    bwToggleDurasiMode();
  });
}

function initBongkarWizard() {
  if (!$('bw-panel-1')) return;
  var restored = false;
  if (appState.user && appState.user.username) {
    restored = bwRestoreWizardLocal();
  }
  if (!restored) bwWiz.step = 1;
  // Default selalu buka Step 1 dalam kondisi unlocked.
  bwWiz.step = 1;
  bwWiz.setupLocked = false;
  bwWiz.lockSnap = null;
  bwUpdateSetupLockUI();
  fetchAPI('getBongkarHistory', { limit: 4000 }, function(resp) {
    appState.history.bongkar = bwNormalizeBongkarHistory(resp.status !== 'error' ? resp.data : []);
    bwSyncGhostHint();
    if ((bwWiz.step || 1) === 2) bwRefreshGhostFromServer();
    if ((bwWiz.step || 1) === 3) bwRefreshStep3();
    bwRefreshStep2MiniTable();
    bwPersistWizardLocal();
  });
  bwLoadSetupFromServer();
  bwGoStep(bwWiz.step || 1);
  bwToggleDurasiMode();
  bwUpdateTruckBadge();
  bwUpdateSetupLockUI();
  bwPersistWizardLocal();
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.bw-step-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var n = parseInt(btn.getAttribute('data-bw-step'), 10);
      if (n === 2 && !bwEnsureStep2Entry()) return;
      bwGoStep(n);
    });
  });
  var un = $('bw_btn_unlock_setup');
  if (un) un.addEventListener('click', bwUnlockSetup);
  var bs1 = $('bw_btn_save_step1');
  if (bs1) bs1.addEventListener('click', bwSaveStep1);
  var bs2 = $('bw_btn_save_step2');
  if (bs2) bs2.addEventListener('click', bwSubmitStep2);
  var bs3 = $('bw_btn_save_step3');
  if (bs3) bs3.addEventListener('click', bwFinalizeStep3Bulk);
  var addNp = $('bw_btn_add_nopol');
  if (addNp) addNp.addEventListener('click', bwAddCurrentNopolToBatch);
  var npInp = $('bw_nopol');
  if (npInp) npInp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      bwAddCurrentNopolToBatch();
    }
  });
  var bok = $('bw_bd_ok');
  if (bok) bok.addEventListener('click', bwBdConfirmOk);
  var bca = $('bw_bd_cancel');
  if (bca) bca.addEventListener('click', bwBdConfirmCancel);

  var mat = $('bw_material');
  if (mat) mat.addEventListener('change', function() {
    bwToggleDurasiMode();
    bwRefreshGhostFromServer();
    bwUpdateTruckBadge();
  });
  var bwt = $('bw_tanggal');
  var bws = $('bw_shift');
  if (bwt) bwt.addEventListener('change', function() {
    if (bwWiz.setupLocked) bwUnlockSetup(true);
    bwLoadSetupFromServer();
    bwUpdateTruckBadge();
    bwRefreshGhostFromServer();
    bwPersistWizardLocal();
  });
  if (bws) bws.addEventListener('change', function() { bwUpdateTruckBadge(); bwRefreshGhostFromServer(); });
  var bk = $('bw_bk_id');
  if (bk) bk.addEventListener('change', function() {
    applyBongkarMasterDefaults(this.value);
    bwRefreshGhostFromServer();
    bwUpdateTruckBadge();
  });
  var pbStart = $('bw_pb_start');
  if (pbStart) {
    pbStart.addEventListener('input', function() {
      bwSyncGhostHint();
      bwUpdateTruckBadge();
    });
  }
  var pbTgl = $('bw_pb_tgl');
  if (pbTgl) {
    pbTgl.addEventListener('change', bwUpdateTruckBadge);
    pbTgl.addEventListener('input', bwUpdateTruckBadge);
  }
  var sbmTgl = $('bw_sbm_pb_tgl');
  if (sbmTgl) sbmTgl.addEventListener('change', function() {
    bwRefreshGhostFromServer();
    bwUpdateTruckBadge();
  });
  var sbmPs = $('bw_sbm_pb_start');
  if (sbmPs) {
    sbmPs.addEventListener('focus', function() { bwRefreshGhostFromServer(); });
    sbmPs.addEventListener('input', function() {
      bwSyncGhostHint();
      bwUpdateTruckBadge();
    });
  }
  var pbSampai = $('bw_pb_sampai');
  var pbHold = $('bw_pb_hold');
  var pbRestart = $('bw_pb_restart');
  var pbFinish = $('bw_pb_finish');
  if (pbHold) pbHold.addEventListener('focus', function() {
    bwStep2ValidatePairOnMove('bw_pb_sampai', 'bw_pb_start', 'PB Sampai Gudang', 'PB Start', 60, 'PB Sampai Gudang vs PB Start', 'seg_0_1');
  });
  if (pbRestart) pbRestart.addEventListener('focus', function() {
    bwStep2ValidatePairOnMove('bw_pb_start', 'bw_pb_hold', 'PB Start', 'PB Hold', 60, 'PB Start vs PB Hold', 'seg_1_2');
  });
  if (pbFinish) pbFinish.addEventListener('focus', function() {
    bwStep2ValidatePairOnMove('bw_pb_hold', 'bw_pb_restart', 'PB Hold', 'PB Restart', 60, 'PB Hold vs PB Restart', 'seg_2_3');
  });
  if (pbFinish) pbFinish.addEventListener('blur', function() {
    if (($('bw_pb_restart') && $('bw_pb_restart').value) || ($('bw_pb_hold') && $('bw_pb_hold').value)) {
      bwStep2ValidatePairOnMove('bw_pb_restart', 'bw_pb_finish', 'PB Restart', 'PB Finish', 60, 'PB Restart vs PB Finish', 'seg_3_4');
    } else {
      bwStep2ValidatePairOnMove('bw_pb_start', 'bw_pb_finish', 'PB Start', 'PB Finish', 60, 'PB Start vs PB Finish', 'seg_1_4');
    }
  });
  if (sbmPs) sbmPs.addEventListener('change', function() { bwStep2SetFieldDayOffset(sbmPs, 0); });
  var sbmPf = $('bw_sbm_pb_finish');
  if (sbmPf) {
    sbmPf.addEventListener('blur', function() {
      bwStep2ValidatePairOnMove('bw_sbm_pb_start', 'bw_sbm_pb_finish', 'PB Start', 'PB Finish', BW_SBM_INTAKE_PROCESS_MIN, 'PB Start vs PB Finish (SBM Intake)', 'sbm_pb_window');
    });
  }
  [pbSampai, pbStart, pbHold, pbRestart, pbFinish, sbmPs, sbmPf].forEach(function(el) { bwStep2SetFieldDayOffset(el, 0); });
  var typEl = $('bw_type_bongkaran');
  if (typEl) typEl.addEventListener('change', function() {
    bwRefreshGhostFromServer();
    bwUpdateTruckBadge();
    bwRefreshStep2MiniTable();
  });

  var bdm = $('bw_bd_modal');
  if (bdm) {
    bdm.addEventListener('input', function(e) {
      if (e.target && e.target.classList && e.target.classList.contains('bw-bd-min')) bwBdUpdateSisa();
    });
    bdm.addEventListener('change', function(e) {
      if (e.target && e.target.classList && e.target.classList.contains('bw-bd-cat')) bwBdUpdateSisa();
    });
  }
  bwRenderNopolBatch();
});
