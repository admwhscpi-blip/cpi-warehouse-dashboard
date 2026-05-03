/**
 * Bongkar wizard 3 langkah. Depends: $, appState, postAPI, fetchAPI,
 * toast, showLoader, pad2, bkkEnsureOpnameHistory, bkkValidateTanggalBongkarKirim,
 * bkkShowReject, todayStr, todayYMD_WIB, dashDateToYMD, applyBongkarMasterDefaults, loadDashboard
 */

var BW_BREAKDOWN_CATS = ['ISTIRAHAT', 'PINDAH HOPPER', 'JALUR OVERLOAD', 'TUNGGU KULI', 'TUNGGU TRUCK', 'OTHER'];

var bwWiz = { step: 1, bdPending: null, bdTargetMin: 0 };

function bwEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Riwayat dari API harus selalu array (JSONP kadang mengirim bentuk lain). */
function bwNormalizeBongkarHistory(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  return [];
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
  var sel = $('bw_material');
  if (!sel) return false;
  var t = (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || sel.value || '';
  return t.toLowerCase().indexOf('sbm') >= 0;
}

function bwTypeIsIntake71() {
  var v = ($('bw_type_bongkaran') && $('bw_type_bongkaran').value) || '';
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
  if (!row || !row.DURASI_JSON) return null;
  try {
    return typeof row.DURASI_JSON === 'string' ? JSON.parse(row.DURASI_JSON) : row.DURASI_JSON;
  } catch (e) {
    return null;
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
  return String(cell).substring(0, 10);
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

/** Hanya baris Intake 71 (atau legacy tanpa type) dalam rantai — selain itu tidak ikut ghost/overlap. */
function bwRowInIntake71Chain(r) {
  if (bwRowExcludedFromIntakeChain(r)) return false;
  var t = String(r.TYPE_BONGKARAN || '').trim();
  if (!t) return true;
  return t === 'intake71_manual' || t === 'intake71_tilting';
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

function bwTruckSessionKey() {
  var u = (appState.user && appState.user.username) ? String(appState.user.username) : '';
  var t = ($('bw_tanggal') && $('bw_tanggal').value) || '';
  var s = ($('bw_shift') && $('bw_shift').value) || '';
  return 'bkk_truckseq|' + u + '|' + t + '|' + s;
}

function bwGetTruckSavedCount() {
  try {
    var v = sessionStorage.getItem(bwTruckSessionKey());
    return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
  } catch (e) {
    return 0;
  }
}

function bwSetTruckSavedCount(n) {
  try {
    sessionStorage.setItem(bwTruckSessionKey(), String(Math.max(0, n)));
  } catch (e) {}
}

/** Jika sheet belum punya kolom SHIFT, jangan saring keluar. */
function bwShiftMatchesRow(r, sh) {
  var rs = String(r.SHIFT == null ? '' : r.SHIFT).trim();
  if (!rs) return true;
  return rs === String(sh || '').trim();
}

function bwUpdateTruckBadge() {
  var el = $('bw_truck_badge');
  if (!el) return;
  var next = bwGetTruckSavedCount() + 1;
  el.textContent = 'Truck ke-' + next + ' — sesi tanggal & shift ini';
}

function bwClearStep2Form() {
  var np = $('bw_nopol');
  if (np) np.value = '';
  var s1 = $('bw_sbm_pb_start');
  var s2 = $('bw_sbm_pb_finish');
  if (s1) s1.value = '';
  if (s2) s2.value = '';
  ['bw_ab_arrival', 'bw_ab_qc', 'bw_pb_sampai', 'bw_pb_start', 'bw_pb_hold', 'bw_pb_restart', 'bw_pb_finish'].forEach(function(id) {
    var x = $(id);
    if (x) x.value = '';
  });
  bwSyncGhostHint();
}

/** Direct Gudang diabaikan dalam rantai Intake 71; kosong = ikut rantai (kompatibel sheet tanpa kolom). */
function bwRowExcludedFromIntakeChain(r) {
  return String(r.TYPE_BONGKARAN || '').trim() === 'direct_gudang';
}

/** Patokan PB Finish terakhir di sesi (tetap ada walau GET riwayat belum selesai). */
function bwSessionPbFinishKey() {
  var u = (appState.user && appState.user.username) ? String(appState.user.username) : '';
  var t = ($('bw_tanggal') && $('bw_tanggal').value) || '';
  var s = ($('bw_shift') && $('bw_shift').value) || '';
  var bk = ($('bw_bk_id') && $('bw_bk_id').value) || '';
  return 'bkk_pb_finish|' + u + '|' + t + '|' + s + '|' + bk;
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
 * Truck lain di BK+tanggal+shift+user dengan PB — kolom sheet + JSON (breakdown).
 * optionalRows: hasil fetch khusus BK (tanpa mengandalkan cache global).
 */
function bwListIntake71TrucksForDay(optionalRows) {
  var tgl = $('bw_tanggal') && $('bw_tanggal').value;
  var sh = $('bw_shift') && $('bw_shift').value;
  var bk = $('bw_bk_id') && $('bw_bk_id').value;
  if (!tgl || !bk) return [];
  var rows;
  if (optionalRows != null) {
    rows = Array.isArray(optionalRows) ? optionalRows.slice() : [];
  } else {
    rows = (appState.history && appState.history.bongkar) ? appState.history.bongkar.slice() : [];
  }
  var out = [];
  rows.forEach(function(r) {
    if (String(r.BK_ID) !== String(bk)) return;
    if (dashDateToYMD(r.TANGGAL) !== tgl) return;
    if (!bwShiftMatchesRow(r, sh)) return;
    if (!bwInputByMatchesUser(r)) return;
    if (!bwRowInIntake71Chain(r)) return;
    var dj = bwGetDurasiFields(r);
    if (!dj) return;
    var ymd = dj.pb_tanggal || bwSheetYMD(r.PB_TANGGAL) || dashDateToYMD(r.TANGGAL) || tgl;
    var msS = bwConcatMs(ymd, dj.pb_start || '');
    var msF = bwConcatMs(ymd, dj.pb_finish || '');
    if (isNaN(msS) || isNaN(msF)) return;
    out.push({
      msStart: msS,
      msFinish: msF,
      pbFinishHM: dj.pb_finish,
      pbStartHM: dj.pb_start,
      nopol: String(r.NO_POLISI || '').trim().toUpperCase()
    });
  });
  out.sort(function(a, b) { return a.msStart - b.msStart; });
  return out;
}

/** Max PB Finish (ms), jam, nopol truk patokan — sheet + session. */
function bwPrevFinishPatokanDetail(optionalRows) {
  var tgl = $('bw_tanggal') && $('bw_tanggal').value;
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
  if (($('bw_type_bongkaran') && $('bw_type_bongkaran').value) === 'direct_gudang') return null;
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
  var bk = $('bw_bk_id') && $('bw_bk_id').value;
  var tgl = $('bw_tanggal') && $('bw_tanggal').value;
  if (!bk || !tgl) {
    bwSyncGhostHint();
    return;
  }
  fetchAPI('getBongkarHistory', { bk_id: bk, limit: 800 }, function(resp) {
    var pack = resp.status !== 'error' ? resp.data : [];
    if (!Array.isArray(pack)) pack = [];
    syncBongkarHistoryMergeBK(bk, pack);
    bwSyncGhostHint(pack);
  });
}

/** Gabungkan baris BK ini ke cache global tanpa membuang BK lain. */
function syncBongkarHistoryMergeBK(bkId, bkRows) {
  var all = (appState.history && appState.history.bongkar) ? appState.history.bongkar.slice() : [];
  var norm = String(bkId || '');
  var rest = all.filter(function(r) { return String(r.BK_ID || '') !== norm; });
  var add = Array.isArray(bkRows) ? bkRows : [];
  appState.history.bongkar = rest.concat(add);
}

function bwGapPrevIntakePB(pbStartMs) {
  var p = bwPrevFinishPatokan();
  if (!p.ms && !p.hm) return NaN;
  return bwDiffMin(p.ms, pbStartMs);
}

function bwValidateIntakeOverlap(pbStartMs, pbFinishMs) {
  if (!bwTypeIsIntake71()) return null;
  if (($('bw_type_bongkaran') && $('bw_type_bongkaran').value) === 'direct_gudang') return null;
  var list = bwListIntake71TrucksForDay();
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    // overlap area: interval bersinggungan (termasuk sama-sama menit bila bentrok)
    if (pbStartMs < p.msFinish && pbFinishMs > p.msStart)
      return 'Durasi overlap dengan truck lain di rantai Intake 71. Ubah PB Start / PB Finish.';
  }
  return null;
}

/** Urutan tetap (RM-style): hanya pasangan berurutan yang keduanya terisi. */
function bwBuildSegmentQueueNonSBM(abT, pbT) {
  var steps = [
    { y: abT, hmId: 'bw_ab_arrival', lab: 'AB Arrival → AB QC' },
    { y: abT, hmId: 'bw_ab_qc', lab: 'AB QC (akhir segmen AB)' },
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
    var ms = bwConcatMs(steps[i].y, hm);
    if (isNaN(ms)) continue;
    points.push({ ms: ms, lab: steps[i].lab, idx: i });
  }
  var q = [];
  for (var j = 1; j < points.length; j++) {
    var gap = bwDiffMin(points[j - 1].ms, points[j].ms);
    var lab = points[j - 1].lab.split(' → ')[0] + ' → ' + points[j].lab;
    if (gap < 0) return { error: 'Urutan jam tidak kronologis (' + lab + ')' };
    if (gap > 0) q.push({ key: 'seg_' + points[j - 1].idx + '_' + points[j].idx, targetMin: gap, title: 'Breakdown: ' + lab + ' (' + gap + ' m)' });
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
}

function bwSubmitStep2() {
  var bkId = $('bw_bk_id').value;
  var tgl = $('bw_tanggal').value;
  var shift = $('bw_shift').value;
  var mat = $('bw_material').value;
  var sup = $('bw_supplier').value;
  var typ = $('bw_type_bongkaran').value;
  var nopol = ($('bw_nopol') && $('bw_nopol').value || '').trim().toUpperCase();
  if (!bkId || !tgl || !nopol) {
    toast('Lengkapi BK, tanggal operasi, dan nopol', 'w');
    return;
  }

  var isSbm = bwMaterialIsSBM();
  var dj = { v: 1, is_sbm: isSbm, type_bongkaran: typ, pb_tanggal: tgl };

  bkkEnsureOpnameHistory(function() {
    var v = bkkValidateTanggalBongkarKirim(bkId, tgl);
    if (!v.ok) {
      bkkShowReject(v.msg);
      return;
    }

    var queue = [];

    if (isSbm) {
      var ps = $('bw_sbm_pb_start').value;
      var pf = $('bw_sbm_pb_finish').value;
      var pbt = ($('bw_sbm_pb_tgl') && $('bw_sbm_pb_tgl').value) || tgl;
      dj.pb_tanggal = pbt;
      dj.pb_start = ps;
      dj.pb_finish = pf;
      var msS = bwConcatMs(pbt, ps);
      var msF = bwConcatMs(pbt, pf);
      if (isNaN(msS) || isNaN(msF)) {
        toast('Isi PB Start & PB Finish', 'w');
        return;
      }
      if (msF < msS) {
        toast('PB Finish harus setelah PB Start', 'w');
        return;
      }
      var strictS = bwValidatePbStrictAfterPrevious(msS, msF);
      if (strictS) {
        toast(strictS, 'w');
        return;
      }
      var ovS = bwValidateIntakeOverlap(msS, msF);
      if (ovS) {
        toast(ovS, 'w');
        return;
      }

      var dmin = bwDiffMin(msS, msF);
      if (dmin > 5) queue.push({ key: 'sbm_pb_window', targetMin: dmin, title: 'Downtime PB — total ' + dmin + ' menit (wajib dirinci penuh)' });

      if (bwTypeIsIntake71()) {
        var g = bwGapPrevIntakePB(msS);
        if (!isNaN(g) && g > 5) {
          queue.push({
            key: 'sbm_gap_truck',
            targetMin: g,
            title: 'Jeda vs truck Intake 71 sebelumnya — total ' + g + ' menit (wajib dirinci penuh)',
            detail: bwFormatGapTruckSubtitle(nopol, ps)
          });
        }
      }
    } else {
      var need = ['bw_ab_arrival', 'bw_ab_qc', 'bw_pb_sampai', 'bw_pb_start', 'bw_pb_finish'];
      for (var ni = 0; ni < need.length; ni++) {
        if (!$(need[ni]).value) {
          toast('Lengkapi timeline: AB Arrival, AB QC, PB Sampai, PB Start, PB Finish', 'w');
          return;
        }
      }
      var hh = $('bw_pb_hold').value, rr = $('bw_pb_restart').value;
      if (hh && !rr) { toast('Isi PB Restart bila PB Hold diisi', 'w'); return; }
      if (rr && !hh) { toast('Isi PB Hold bila PB Restart diisi', 'w'); return; }

      var abT = $('bw_ab_tgl').value || tgl;
      var pbT = $('bw_pb_tgl').value || tgl;
      $('bw_ab_tgl').value = abT;
      $('bw_pb_tgl').value = pbT;
      dj.ab_tanggal = abT;
      dj.pb_tanggal = pbT;
      dj.ab_arrival = $('bw_ab_arrival').value;
      dj.ab_qc = $('bw_ab_qc').value;
      dj.pb_sampai = $('bw_pb_sampai').value;
      dj.pb_start = $('bw_pb_start').value;
      dj.pb_hold = $('bw_pb_hold').value;
      dj.pb_restart = $('bw_pb_restart').value;
      dj.pb_finish = $('bw_pb_finish').value;

      var seg = bwBuildSegmentQueueNonSBM(abT, pbT);
      if (seg.error) {
        toast(seg.error, 'w');
        return;
      }
      seg.queue.forEach(function(s) { queue.push(s); });

      var pbMsS = bwConcatMs(pbT, dj.pb_start);
      var pbMsF = bwConcatMs(pbT, dj.pb_finish);
      if (!isNaN(pbMsS) && !isNaN(pbMsF) && bwTypeIsIntake71()) {
        var strictN = bwValidatePbStrictAfterPrevious(pbMsS, pbMsF);
        if (strictN) {
          toast(strictN, 'w');
          return;
        }
        var ov2 = bwValidateIntakeOverlap(pbMsS, pbMsF);
        if (ov2) {
          toast(ov2, 'w');
          return;
        }
        var g2 = bwGapPrevIntakePB(pbMsS);
        if (!isNaN(g2) && g2 > 5) {
          queue.push({
            key: 'gap_truck_ns',
            targetMin: g2,
            title: 'Jeda vs truck Intake 71 sebelumnya — total ' + g2 + ' menit (wajib dirinci penuh)',
            detail: bwFormatGapTruckSubtitle(nopol, dj.pb_start)
          });
        }
      }
    }

    bwRunBreakdownQueue(queue, 0, {}, function(breakdowns) {
      dj.breakdowns = breakdowns;
      var inpBy = (appState.user ? appState.user.nama + ' (Shift ' + shift + ')' : '');
      var payload = {
        TANGGAL: tgl,
        BK_ID: bkId,
        MATERIAL: mat,
        SUPPLIER: sup,
        NETTO_KG: 0,
        NO_POLISI: nopol,
        SHIFT: shift,
        TYPE_BONGKARAN: typ,
        STATUS_ROW: 'pending_final',
        INPUT_BY: inpBy,
        DURASI_JSON: JSON.stringify(dj)
      };
      showLoader(true);
      postAPI('addBongkar', payload, function(resp) {
        showLoader(false);
        if (resp.status === 'error') {
          toast('Gagal: ' + resp.message, 'e');
          return;
        }
        toast('Durasi truck tersimpan. Lanjut isi truck berikutnya, atau buka Step 3 untuk netto & arrival.', 's');
        if (dj.pb_finish) bwSetSessionPbFinishHint(dj.pb_finish, nopol);
        bwSetTruckSavedCount(bwGetTruckSavedCount() + 1);
        bwUpdateTruckBadge();
        bwClearStep2Form();
        // Hanya refresh riwayat bongkar (untuk Step 3 & validasi truck berikutnya). Dashboard full dipanggil di background supaya tidak terasa lama.
        fetchAPI('getBongkarHistory', { limit: 1500 }, function(r2) {
          appState.history.bongkar = bwNormalizeBongkarHistory(r2.status !== 'error' ? r2.data : []);
          bwRefreshStep3();
          bwSyncGhostHint();
        });
        if (typeof loadDashboard === 'function') {
          setTimeout(function() { loadDashboard(function() {}); }, 80);
        }
        bwGoStep(2);
      });
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
  if (n === 3) {
    showLoader(true);
    fetchAPI('getBongkarHistory', { limit: 4000 }, function(resp) {
      showLoader(false);
      appState.history.bongkar = bwNormalizeBongkarHistory(resp.status !== 'error' ? resp.data : []);
      bwRefreshStep3();
    });
    return;
  }
  if (n === 2) {
    bwToggleDurasiMode();
    bwUpdateTruckBadge();
    bwRefreshGhostFromServer();
  }
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
  if ($('bw_ab_tgl')) $('bw_ab_tgl').value = t;
  if ($('bw_pb_tgl')) $('bw_pb_tgl').value = t;
}

function bwRefreshStep3() {
  var tb = $('bw_step3_tb');
  var sum = $('bw_step3_summary');
  if (!tb || !appState.user) return;
  var tgl = $('bw_tanggal').value;
  var sh = $('bw_shift').value;
  var matSel = $('bw_material');
  var matLabel = matSel && matSel.options[matSel.selectedIndex] ? matSel.options[matSel.selectedIndex].text : '';
  if (sum) {
    sum.innerHTML = '<strong>' + bwEsc(matLabel) + '</strong> · Shift ' + bwEsc(sh) + ' · ' + bwEsc(tgl) +
      ' · ' + bwEsc(appState.user.nama || '');
  }
  tb.innerHTML = '';
  var rows = bwNormalizeBongkarHistory(appState.history && appState.history.bongkar);
  var shown = 0;
  rows.forEach(function(r) {
    if (!bwIsPendingBongkarRow(r)) return;
    if (!bwRowMatchesWizardTanggal(r, tgl)) return;
    if (!bwShiftMatchesRow(r, sh)) return;
    if (!bwInputByMatchesUser(r)) return;

    var isSbm = String(r.MATERIAL || '').toLowerCase().indexOf('sbm') >= 0;
    var tr = document.createElement('tr');
    tr.setAttribute('data-id', r.ID);
    tr.setAttribute('data-bw-sbm', isSbm ? '1' : '0');
    tr.innerHTML =
      '<td>' + bwEsc(r.NO_POLISI || '') + '</td>' +
      '<td>' +
      (isSbm ? '<span class="bw-cell-x">X (tidak diisi)</span>' : '<input type="date" class="bw-arrival-d">') +
      '</td>' +
      '<td>' +
      (isSbm ? '<span class="bw-cell-x">X</span>' : '<input type="time" class="bw-arrival-t">') +
      '</td>' +
      '<td><input type="number" class="bw-netto" min="0" step="0.01" placeholder="kg"></td>';
    tb.appendChild(tr);
    shown++;
  });
  if (sum && shown === 0) {
    sum.innerHTML += '<div style="margin-top:10px;font-size:0.88rem;color:#64748b;">Belum ada draft untuk BK + tanggal + shift ini (atau data belum dimuat — tutup & buka lagi Step 3).</div>';
  }
}

/** Kumpulkan baris yang siap disimpan (netto valid; non-SBM wajib arrival). */
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
    var ad = tr.querySelector('.bw-arrival-d');
    var at = tr.querySelector('.bw-arrival-t');
    var arrD = isSbm ? '' : (ad ? ad.value : '');
    var arrT = isSbm ? '' : (at ? at.value : '');
    if (!isSbm && (!arrD || !arrT)) {
      skipIncomplete++;
      return;
    }
    ok.push({ id: id, netto: netto, arrD: arrD, arrT: arrT, nopol: (tr.cells[0] && tr.cells[0].textContent) || '' });
  });
  return { ok: ok, skipIncomplete: skipIncomplete };
}

/** Simpan beberapa finalize beruntun (JSONP), lalu refresh Step 3 + dashboard. */
function bwFinalizeStep3Bulk() {
  var pack = bwStep3CollectFilledRows();
  if (pack.skipIncomplete > 0) {
    toast(pack.skipIncomplete + ' baris punya netto tapi arrival belum lengkap — tidak ikut disimpan.', 'w');
  }
  if (!pack.ok.length) {
    toast('Isi netto pada baris yang ingin disimpan (baris kosong tidak diproses).', 'w');
    return;
  }

  var idx = 0;
  var okCount = 0;
  var failMsg = [];
  showLoader(true);

  function step() {
    if (idx >= pack.ok.length) {
      showLoader(false);
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
      });
      return;
    }
    var p = pack.ok[idx];
    idx++;
    postAPI('finalizeBongkar', {
      ID: p.id,
      NETTO_KG: p.netto,
      ARRIVAL_DATE: p.arrD,
      ARRIVAL_TIME: p.arrT
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
    if (resp.status === 'error') toast('Gagal simpan setup: ' + resp.message, 'e');
    else toast('Setup tersimpan', 's');
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
  fetchAPI('getBongkarHistory', { limit: 4000 }, function(resp) {
    appState.history.bongkar = bwNormalizeBongkarHistory(resp.status !== 'error' ? resp.data : []);
    bwSyncGhostHint();
    if ((bwWiz.step || 1) === 2) bwRefreshGhostFromServer();
    if ((bwWiz.step || 1) === 3) bwRefreshStep3();
  });
  bwLoadSetupFromServer();
  bwGoStep(bwWiz.step || 1);
  bwToggleDurasiMode();
  bwUpdateTruckBadge();
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.bw-step-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      bwGoStep(parseInt(btn.getAttribute('data-bw-step'), 10));
    });
  });
  var bs1 = $('bw_btn_save_step1');
  if (bs1) bs1.addEventListener('click', bwSaveStep1);
  var bs2 = $('bw_btn_save_step2');
  if (bs2) bs2.addEventListener('click', bwSubmitStep2);
  var bs3 = $('bw_btn_save_step3');
  if (bs3) bs3.addEventListener('click', bwFinalizeStep3Bulk);
  var bok = $('bw_bd_ok');
  if (bok) bok.addEventListener('click', bwBdConfirmOk);
  var bca = $('bw_bd_cancel');
  if (bca) bca.addEventListener('click', bwBdConfirmCancel);

  var mat = $('bw_material');
  if (mat) mat.addEventListener('change', function() {
    bwToggleDurasiMode();
    bwRefreshGhostFromServer();
  });
  var bwt = $('bw_tanggal');
  var bws = $('bw_shift');
  if (bwt) bwt.addEventListener('change', function() { bwUpdateTruckBadge(); bwRefreshGhostFromServer(); });
  if (bws) bws.addEventListener('change', function() { bwUpdateTruckBadge(); bwRefreshGhostFromServer(); });
  var bk = $('bw_bk_id');
  if (bk) bk.addEventListener('change', function() {
    applyBongkarMasterDefaults(this.value);
    bwRefreshGhostFromServer();
  });
  var pbStart = $('bw_pb_start');
  if (pbStart) pbStart.addEventListener('input', bwSyncGhostHint);
  var sbmTgl = $('bw_sbm_pb_tgl');
  if (sbmTgl) sbmTgl.addEventListener('change', function() { bwRefreshGhostFromServer(); });
  var sbmPs = $('bw_sbm_pb_start');
  if (sbmPs) {
    sbmPs.addEventListener('focus', function() { bwRefreshGhostFromServer(); });
    sbmPs.addEventListener('input', bwSyncGhostHint);
  }
  var typEl = $('bw_type_bongkaran');
  if (typEl) typEl.addEventListener('change', function() { bwRefreshGhostFromServer(); });

  var bdm = $('bw_bd_modal');
  if (bdm) {
    bdm.addEventListener('input', function(e) {
      if (e.target && e.target.classList && e.target.classList.contains('bw-bd-min')) bwBdUpdateSisa();
    });
    bdm.addEventListener('change', function(e) {
      if (e.target && e.target.classList && e.target.classList.contains('bw-bd-cat')) bwBdUpdateSisa();
    });
  }
});
