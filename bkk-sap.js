// ── CEK SAP ──────────────────────────────────────────────────────────────────
function loadSAPData() {
  // Cache global (tanpa bk_id): dipakai halaman lain; limit besar agar tidak menimpa subset BK saat user buka Riwayat.
  fetchAPI('getBongkarHistory', {}, function(resp) {
    if (resp.status !== 'error') appState.history.bongkar = resp.data || [];
  });
  fetchAPI('getKirimHistory', {}, function(resp) {
    if (resp.status !== 'error') appState.history.kirim = resp.data || [];
  });
  fetchAPI('getOpnameHistory', {}, function(resp) {
    if (resp.status !== 'error') appState.history.opname = resp.data || [];
  });
}

/** Muat riwayat bongkar/kirim/opname untuk perhitungan Stock Opname (penerimaan periode SO). */
function loadOpnamePageData() {
  var pending = 3;
  function done() {
    pending--;
    if (pending > 0) return;
    updateOpnameInfo();
  }
  fetchAPI('getBongkarHistory', {}, function(resp) {
    if (resp.status !== 'error') appState.history.bongkar = resp.data || [];
    done();
  });
  fetchAPI('getKirimHistory', {}, function(resp) {
    if (resp.status !== 'error') appState.history.kirim = resp.data || [];
    done();
  });
  fetchAPI('getOpnameHistory', {}, function(resp) {
    if (resp.status !== 'error') appState.history.opname = resp.data || [];
    done();
  });
}

/** Samakan format BK_ID dari sheet (BK-3 / BK3) dengan chip UI */
function sapNormalizeBkId(id) {
  if (id == null || id === '') return '';
  var s = String(id).trim();
  var m = s.match(/^BK\s*-?\s*(\d)$/i);
  if (m) return 'BK-' + m[1];
  return s;
}

function sapBkRowMatches(rowBk, targetBk) {
  return sapNormalizeBkId(rowBk) === sapNormalizeBkId(targetBk);
}

// ── Waktu periode penerimaan opname (tanggal + jam) ─────────────────────────
function bkkTodayYmdWIB() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  } catch (e) {
    return typeof todayStr === 'function' ? todayStr() : '';
  }
}

function bkkParseAnyDateTimeMs(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v).trim();
  if (!s) return NaN;
  var hasZone = /[zZ]$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(s);
  if (!hasZone) {
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      var sec = m[6] !== undefined && m[6] !== '' ? (+m[6]) : 0;
      return new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + pad2(sec) + '+07:00').getTime();
    }
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? NaN : d.getTime();
}

function bkkStartOfJakartaDayMs(tanggalVal) {
  var ymd = typeof dashDateToYMD === 'function' ? dashDateToYMD(tanggalVal) : String(tanggalVal || '').substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return NaN;
  return new Date(ymd + 'T00:00:00+07:00').getTime();
}

/** Momen kejadian baris: prioritas TIMESTAMP (jam simpan), fallback awal hari TANGGAL. */
function bkkRowEventTimeMs(row) {
  if (!row) return NaN;
  if (row.TIMESTAMP != null && row.TIMESTAMP !== '') {
    var ms = bkkParseAnyDateTimeMs(row.TIMESTAMP);
    if (!isNaN(ms)) return ms;
  }
  if (row.TANGGAL == null || row.TANGGAL === '') return NaN;
  return bkkStartOfJakartaDayMs(row.TANGGAL);
}

/** Batas akhir penerimaan: s/d akhir hari opname (WIB); jika hari ini = min(akhir hari, sekarang). */
function bkkOpnamePeriodEndMs(endYmd) {
  if (!endYmd || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return NaN;
  var endDay = new Date(endYmd + 'T23:59:59.999+07:00').getTime();
  if (isNaN(endDay)) return NaN;
  if (endYmd === bkkTodayYmdWIB()) return Math.min(endDay, Date.now());
  return endDay;
}

/** Ambil 10 transaksi terakhir untuk BK ini dari server (semua bulan). Tanpa bk_id, limit global sering membuang BK yang jarang aktif. */
function loadSAPHistoryForBK(bkId, cb) {
  var lim = 15;
  var bong = [];
  var kir = [];
  var pending = 2;
  function doneOne() {
    pending--;
    if (pending === 0) cb(bong, kir);
  }
  fetchAPI('getBongkarHistory', { bk_id: bkId, limit: lim }, function(resp) {
    if (resp.status !== 'error') bong = resp.data || [];
    doneOne();
  });
  fetchAPI('getKirimHistory', { bk_id: bkId, limit: lim }, function(resp) {
    if (resp.status !== 'error') kir = resp.data || [];
    doneOne();
  });
}

function sapSortRowsByTanggalDesc(rows) {
  var copy = (rows || []).slice();
  copy.sort(function(a, b) {
    var ta = a.TANGGAL ? new Date(a.TANGGAL).getTime() : 0;
    var tb = b.TANGGAL ? new Date(b.TANGGAL).getTime() : 0;
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });
  return copy.slice(0, 10);
}

var sapState = {
  currentIdx: 0,
  inputs: {}, // { 'BK-1': { stock: 1000, material: '...', kapal: '...' } }
  compareResult: [], // [{ bkId, material, kapal, sistem, sap, selisih, status }]
  detailBK: null,
  activeDiffResult: null,
  /** per BK: { kirimBelumTp, bongkarBelumSap } dari tombol Terapkan Step 3 */
  adjustPending: {},
  lastUiStep: 1
};

var BK_LIST_SAP = ['BK-1','BK-2','BK-3','BK-4','BK-5','BK-6'];

var sapDraftTimer = null;

function sapSerializeDraft() {
  return JSON.stringify({
    v: 2,
    inputs: sapState.inputs,
    adjustPending: sapState.adjustPending,
    detailBK: sapState.detailBK,
    currentIdx: sapState.currentIdx,
    uiStep: sapState.lastUiStep || 1
  });
}

function sapAutoSaveDraft() {
  if (!appState.user || !appState.user.username) return;
  clearTimeout(sapDraftTimer);
  sapDraftTimer = setTimeout(function() {
    postAPI('saveCekSAPDraft', {
      username: appState.user.username,
      nama: appState.user.nama || '',
      payload: sapSerializeDraft()
    }, function() {});
  }, 1200);
}

function sapApplyDraftPayload(pl) {
  if (!pl || typeof pl !== 'object') return;
  if (pl.inputs) {
    BK_LIST_SAP.forEach(function(bid) {
      if (pl.inputs[bid]) sapState.inputs[bid] = pl.inputs[bid];
    });
  }
  sapState.adjustPending = pl.adjustPending && typeof pl.adjustPending === 'object' ? pl.adjustPending : {};
  sapState.detailBK = pl.detailBK || null;
  if (typeof pl.currentIdx === 'number' && pl.currentIdx >= 0 && pl.currentIdx < BK_LIST_SAP.length) {
    sapState.currentIdx = pl.currentIdx;
  }
  sapState.lastUiStep = typeof pl.uiStep === 'number' ? pl.uiStep : 1;
}

function renderSAPAfterDraftOrInit() {
  var allFilled = BK_LIST_SAP.every(function(b) {
    return sapState.inputs[b] && sapState.inputs[b].stock != null;
  });
  if (allFilled) {
    sapBuildCompare();
    var step = sapState.lastUiStep || 1;
    if (step === 4) {
      renderSAPStep4();
      return;
    }
    if (step === 3 && sapState.detailBK) {
      sapShowDiff(sapState.detailBK);
      return;
    }
    if (step === 2) {
      renderSAPStep2();
      return;
    }
  }
  renderSAPStep1();
}

function initSAP() {
  sapState.currentIdx = 0;
  sapState.inputs = {};
  sapState.compareResult = [];
  sapState.detailBK = null;
  sapState.adjustPending = {};
  sapState.lastUiStep = 1;
  appState.dashData.forEach(function(bk) {
    sapState.inputs[bk.BK_ID] = {
      material: bk.MATERIAL_DEFAULT || '',
      stock: null
    };
  });

  var uname = appState.user && appState.user.username;
  if (!uname) {
    renderSAPStep1();
    return;
  }
  fetchAPI('getCekSAPDraft', { username: uname }, function(resp) {
    var hasPayload = resp.status !== 'error' && resp.data && resp.data.payload &&
      typeof resp.data.payload === 'object' && Object.keys(resp.data.payload).length > 0;
    if (!hasPayload) {
      renderSAPStep1();
      return;
    }
    var d = resp.data;
    var namaShow = sapEsc(d.nama || '—');
    var when = sapEsc(d.updatedAt || '');
    var runAfter = function(useDraft) {
      if (useDraft) sapApplyDraftPayload(d.payload);
      renderSAPAfterDraftOrInit();
    };
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Draft Cek SAP',
        html: 'Ditemukan penyimpanan terakhir.<br><strong>' + namaShow + '</strong><br><small style="color:#64748b">' + when + '</small><br><br>Lanjutkan draft atau mulai input baru?',
        showDenyButton: true,
        confirmButtonText: 'Lanjutkan draft',
        denyButtonText: 'Input baru'
      }).then(function(r) {
        runAfter(r.isConfirmed);
      });
    } else {
      runAfter(confirm('Lanjutkan draft Cek SAP?'));
    }
  });
}

function renderSAPStep1() {
  $('sap_step1').style.display = 'block';
  $('sap_step2').style.display = 'none';
  $('sap_step3').style.display = 'none';
  var s4 = $('sap_step4');
  if (s4) s4.style.display = 'none';
  sapState.lastUiStep = 1;
  updateStepIndicator(1);

  var bkId = BK_LIST_SAP[sapState.currentIdx];
  var bk = getBKById(bkId);
  var data = sapState.inputs[bkId] || {};

  $('sap_bk_id').value = bkId;
  $('sap_material').value = data.material || bk.MATERIAL_DEFAULT || '';
  $('sap_stock_input').value = data.stock != null ? data.stock : '';
  $('sap_stock_input').focus();

  $('sap_counter').textContent = 'BK ' + (sapState.currentIdx + 1) + ' / 6';
  $('sap_step_title').textContent = bkId + (data.material ? ' — ' + data.material : '');
  $('sap_step_sub').textContent = 'Material dari master BK';

  $('sap_prev_btn').disabled = sapState.currentIdx === 0;

  var allFilled = BK_LIST_SAP.every(function(b) {
    return sapState.inputs[b] && sapState.inputs[b].stock != null;
  });
  $('sap_next_btn').textContent = allFilled ? 'Review ✓' : 'Next';
  renderSAPStep1Preview();
  sapAutoSaveDraft();
}

/** Preview tabel di Step 1 — per BK: nilai tersimpan (setelah Next) + BK aktif dari field input (live). */
function renderSAPStep1Preview() {
  var tb = $('sap_preview_body');
  if (!tb) return;
  tb.innerHTML = '';
  var rows = [];
  var curBk = BK_LIST_SAP[sapState.currentIdx];
  var stockInp = $('sap_stock_input');
  var live = stockInp ? parseFloat(stockInp.value) : NaN;
  var hasLive = !isNaN(live) && live >= 0;
  BK_LIST_SAP.forEach(function(bkId) {
    var inp = sapState.inputs[bkId] || {};
    var sapStock = null;
    if (bkId === curBk && hasLive) {
      sapStock = live;
    } else if (inp.stock != null && !isNaN(inp.stock)) {
      sapStock = Number(inp.stock);
    }
    if (sapStock == null) return;
    var bk = getBKById(bkId);
    var sistem = bk.STOK_AKTIF ? Number(bk.STOK_AKTIF) : 0;
    var selisih = sistem - sapStock;
    rows.push({
      bkId: bkId,
      material: inp.material || bk.MATERIAL_DEFAULT || '',
      sistem: sistem,
      sap: sapStock,
      selisih: selisih
    });
  });
  if (rows.length === 0) {
    var tr0 = document.createElement('tr');
    var td0 = document.createElement('td');
    td0.colSpan = 6;
    td0.style.cssText = 'text-align:center;padding:22px;color:var(--ts);font-size:0.85rem;line-height:1.5;';
    td0.textContent = 'Belum ada baris. Ketik Stock SAP di form kiri — baris preview muncul di sini tanpa menunggu semua BK selesai.';
    tr0.appendChild(td0);
    tb.appendChild(tr0);
    return;
  }
  rows.forEach(function(r) {
    var selColor = r.selisih === 0 ? 'var(--cm)' : r.selisih > 0 ? 'var(--ck)' : 'var(--cw)';
    var statusLabel = r.selisih === 0 ? 'SESUAI ✓' : r.selisih > 0 ? 'KURANG DI SISTEM' : 'LEBIH DI SISTEM';
    var statusBg = r.selisih === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)';
    var tr = document.createElement('tr');
    var matEsc = String(r.material).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    tr.innerHTML =
      '<td><strong>' + r.bkId + '</strong></td>' +
      '<td style="font-size:0.82rem;max-width:140px;">' + matEsc + '</td>' +
      '<td class="cm">' + fmtNum(r.sistem) + '</td>' +
      '<td class="cs">' + fmtNum(r.sap) + '</td>' +
      '<td style="color:' + selColor + ';font-weight:700;">' + fmtNum(Math.abs(r.selisih)) + '</td>' +
      '<td><span style="padding:3px 8px;border-radius:4px;font-size:0.68rem;font-weight:700;background:' + statusBg + ';color:' + selColor + '">' + statusLabel + '</span></td>';
    tb.appendChild(tr);
  });
}

function sapNext() {
  // save current
  var bkId = BK_LIST_SAP[sapState.currentIdx];
  var val = parseFloat($('sap_stock_input').value);
  if (isNaN(val) || val < 0) { toast('Masukkan stock SAP yang valid', 'w'); return; }
  if (!sapState.inputs[bkId]) sapState.inputs[bkId] = {};
  sapState.inputs[bkId].stock = val;

  if (sapState.currentIdx < 5) {
    sapState.currentIdx++;
    renderSAPStep1();
  } else {
    // all filled → go to review
    sapBuildCompare();
    sapState.lastUiStep = 2;
    renderSAPStep2();
    sapAutoSaveDraft();
  }
}

function sapPrev() {
  if (sapState.currentIdx > 0) {
    // save current
    var bkId = BK_LIST_SAP[sapState.currentIdx];
    var val = parseFloat($('sap_stock_input').value);
    if (!isNaN(val) && val >= 0) {
      if (!sapState.inputs[bkId]) sapState.inputs[bkId] = {};
      sapState.inputs[bkId].stock = val;
    }
    sapState.currentIdx--;
    renderSAPStep1();
    sapAutoSaveDraft();
  }
}

function sapBuildCompare() {
  sapState.compareResult = BK_LIST_SAP.map(function(bkId) {
    var bk = getBKById(bkId);
    var inp = sapState.inputs[bkId] || {};
    var sistem = bk.STOK_AKTIF ? Number(bk.STOK_AKTIF) : 0;
    var sapStock = inp.stock != null ? inp.stock : 0;
    var selisih = sistem - sapStock;
    var status = selisih === 0 ? 'sesuai' : selisih > 0 ? 'kurang_sistem' : 'lebih_sistem';
    return {
      bkId: bkId,
      material: inp.material || bk.MATERIAL_DEFAULT || '',
      sistem: sistem,
      sap: sapStock,
      selisih: selisih,
      status: status
    };
  });
}

/** Setelah bongkar/kirim: bandingkan stok master dari API vs nilai sebelum mutasi; hindari race setTimeout vs loadDashboard async & backend yang lambat update STOK_AKTIF. */
function sapMergeCompareAfterBongkar(bkId, prevSistem, qtyAdded) {
  var r = sapState.compareResult.find(function(x) { return x.bkId === bkId; });
  if (!r || prevSistem == null || isNaN(prevSistem) || !qtyAdded || qtyAdded <= 0) return;
  var fresh = Number(getBKById(bkId).STOK_AKTIF) || 0;
  if (fresh <= prevSistem) {
    r.sistem = prevSistem + qtyAdded;
  } else {
    r.sistem = fresh;
  }
  r.selisih = r.sistem - r.sap;
  r.status = r.selisih === 0 ? 'sesuai' : r.selisih > 0 ? 'kurang_sistem' : 'lebih_sistem';
}

function sapMergeCompareAfterKirim(bkId, prevSistem, qtySent) {
  var r = sapState.compareResult.find(function(x) { return x.bkId === bkId; });
  if (!r || prevSistem == null || isNaN(prevSistem) || !qtySent || qtySent <= 0) return;
  var fresh = Number(getBKById(bkId).STOK_AKTIF) || 0;
  if (fresh >= prevSistem) {
    r.sistem = prevSistem - qtySent;
  } else {
    r.sistem = fresh;
  }
  r.selisih = r.sistem - r.sap;
  r.status = r.selisih === 0 ? 'sesuai' : r.selisih > 0 ? 'kurang_sistem' : 'lebih_sistem';
}

function renderSAPStep2() {
  $('sap_step1').style.display = 'none';
  $('sap_step2').style.display = 'block';
  $('sap_step3').style.display = 'none';
  var s4 = $('sap_step4');
  if (s4) s4.style.display = 'none';
  sapState.lastUiStep = 2;
  updateStepIndicator(2);

  var tb = $('sap_compare_tbl');
  tb.innerHTML = '';
  var adaSelisih = false;
  var details = [];

  sapState.compareResult.forEach(function(r) {
    if (r.selisih !== 0) adaSelisih = true;
    var selColor = r.selisih === 0 ? 'var(--cm)' : r.selisih > 0 ? 'var(--ck)' : 'var(--cw)';
    var statusLabel = r.selisih === 0 ? 'SESUAI ✓' : r.selisih > 0 ? 'KURANG DI SISTEM' : 'LEBIH DI SISTEM';
    var statusBg = r.selisih === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><strong>' + r.bkId + '</strong></td>' +
      '<td>' + r.material + '</td>' +
      '<td class="cm">' + fmtNum(r.sistem) + '</td>' +
      '<td class="cs">' + fmtNum(r.sap) + '</td>' +
      '<td style="color:' + selColor + ';font-weight:700;">' + fmtNum(Math.abs(r.selisih)) + ' kg</td>' +
      '<td><span style="padding:3px 10px;border-radius:4px;font-size:0.72rem;font-weight:700;background:' + statusBg + ';color:' + selColor + '">' + statusLabel + '</span></td>';
    tb.appendChild(tr);

    if (r.selisih !== 0) {
      var arah = r.selisih > 0
        ? 'Stok sistem lebih besar daripada Stock SAP (input) sebesar ' + fmtNum(Math.abs(r.selisih)) + ' kg — potensi pengiriman sudah jalan tapi SAP belum tarik (belum TP), double input SAP, atau penyebab lain.'
        : 'Stock SAP (input) lebih tinggi daripada stok sistem sebesar ' + fmtNum(Math.abs(r.selisih)) + ' kg — potensi bongkaran/penerimaan belum ter-input di sistem, pengiriman ter-record berbeda, atau penyebab lain.';
      details.push({ bk: r.bkId, material: r.material, selisih: r.selisih, arah: arah });
    }
  });

  var ketBox = $('sap_keterangan_box');
  var ketText = $('sap_keterangan_text');

  var caraBaca =
    '<p style="margin-top:12px;padding:12px 14px;background:rgba(59,130,246,0.06);border-radius:10px;font-size:0.8rem;line-height:1.55;color:var(--tp);border:1px solid rgba(59,130,246,0.18);">' +
    '<strong>Logika terbaru (Step 3):</strong> Bandingan di tabel memakai Stock SAP mentah dari Step 1. Untuk menjelaskan selisih, hitung <strong>SAP efektif</strong> = Stock SAP input − pengiriman yang menurut Anda belum motong SAP (belum TP) + bongkar yang menurut Anda belum tercermin di SAP. ' +
    'Audit <strong>dua arah</strong>: centang kirim <em>dan</em> bongkar bila perlu — selisih bisa berasal dari salah satu sisi atau kombinasi. Jika masih tidak cocok, telusuri input salah BK, transaksi dobel, atau koreksi manual.</p>';

  if (!adaSelisih) {
    ketText.innerHTML = '<span style="color:var(--cm);font-weight:700;"><i class="fas fa-check-circle"></i> SEMUA SESUAI —</span> Tidak ada perbedaan stock mentah antara sistem dan SAP (Step 1). Lanjut ke Step 4 untuk ekspor laporan.' + caraBaca;
    $('sap_done_all_btn').style.display = '';
    $('sap_lihat_detail_btn').style.display = 'none';
    ketBox.style.display = 'block';
  } else {
    var detailLines = details.map(function(d) {
      return '<div style="margin-bottom:8px;padding:10px 12px;background:#fef2f2;border-radius:6px;border-left:3px solid var(--ck);font-size:0.84rem;line-height:1.5;">' +
        '<strong>' + d.bk + '</strong> (' + sapEsc(d.material) + ')<br>' + d.arah + '</div>';
    }).join('');
    ketText.innerHTML =
      '<div style="margin-bottom:8px;font-weight:700;color:var(--ck);"><i class="fas fa-exclamation-triangle"></i> Ada ' + details.length + ' BK dengan selisih (perbandingan SAP mentah vs sistem)</div>' +
      detailLines + caraBaca;
    $('sap_done_all_btn').style.display = 'none';
    $('sap_lihat_detail_btn').style.display = '';
    ketBox.style.display = 'block';
  }
  $('sap_export_btn').style.display = '';
  sapAutoSaveDraft();
}

function renderSAPStep4() {
  $('sap_step1').style.display = 'none';
  $('sap_step2').style.display = 'none';
  $('sap_step3').style.display = 'none';
  var s4 = $('sap_step4');
  if (s4) s4.style.display = 'block';
  sapState.lastUiStep = 4;
  updateStepIndicator(4);
  sapAutoSaveDraft();
}

function updateStepIndicator(step) {
  document.querySelectorAll('.sap-step').forEach(function(el) {
    el.classList.remove('active', 'done');
    var n = parseInt(el.dataset.step);
    if (n === step) el.classList.add('active');
    else if (n < step) el.classList.add('done');
  });
}

function sapEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderSAPHistorySplitTables(bkId, bongPreload, kirPreload) {
  var tbB = $('sap_last_bongkar_tb');
  var tbK = $('sap_last_kirim_tb');
  if (!tbB || !tbK) return;

  var bong;
  var kir;
  if (Array.isArray(bongPreload) && Array.isArray(kirPreload)) {
    bong = sapSortRowsByTanggalDesc(bongPreload);
    kir = sapSortRowsByTanggalDesc(kirPreload);
  } else {
    bong = sapSortRowsByTanggalDesc((appState.history.bongkar || []).filter(function(r) { return sapBkRowMatches(r.BK_ID, bkId); }));
    kir = sapSortRowsByTanggalDesc((appState.history.kirim || []).filter(function(r) { return sapBkRowMatches(r.BK_ID, bkId); }));
  }

  tbB.innerHTML = '';
  if (!bong.length) {
    var trb = document.createElement('tr');
    trb.innerHTML = '<td colspan="5" style="text-align:center;color:var(--ts);padding:14px;font-size:0.82rem;">Belum ada data bongkar untuk ' + sapEsc(bkId) + '</td>';
    tbB.appendChild(trb);
  } else {
    bong.forEach(function(r) {
      var net = Number(r.NETTO_KG) || 0;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="checkbox" class="sap-cb-bongkar" data-netto="' + net + '"></td>' +
        '<td>' + fmtDate(r.TANGGAL) + '</td>' +
        '<td style="font-size:0.78rem;">' + sapEsc(r.MATERIAL || '—') + '</td>' +
        '<td class="cm">' + fmtNum(net) + '</td>' +
        '<td style="font-size:0.72rem;color:var(--ts);">' + sapEsc(r.INPUT_BY || '—') + '</td>';
      tbB.appendChild(tr);
    });
  }

  tbK.innerHTML = '';
  if (!kir.length) {
    var trk = document.createElement('tr');
    trk.innerHTML = '<td colspan="6" style="text-align:center;color:var(--ts);padding:14px;font-size:0.82rem;">Belum ada data kirim untuk ' + sapEsc(bkId) + '</td>';
    tbK.appendChild(trk);
  } else {
    kir.forEach(function(r) {
      var net = Number(r.NETTO_KG) || 0;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="checkbox" class="sap-cb-kirim" data-netto="' + net + '"></td>' +
        '<td>' + fmtDate(r.TANGGAL) + '</td>' +
        '<td style="font-size:0.78rem;">' + sapEsc(r.MATERIAL || '—') + '</td>' +
        '<td>' + sapEsc(r.GRINDING || '—') + '</td>' +
        '<td class="ck">' + fmtNum(net) + '</td>' +
        '<td><span style="padding:2px 8px;border-radius:4px;font-size:0.65rem;background:rgba(148,163,184,0.15);color:var(--ts);">CEK SAP</span></td>';
      tbK.appendChild(tr);
    });
  }

  var ckK = $('sap_ck_all_kirim');
  var ckB = $('sap_ck_all_bongkar');
  if (ckK) ckK.checked = false;
  if (ckB) ckB.checked = false;
}

/** Selisih stok sistem − SAP efektif (kg). Positif = sistem lebih besar. */
var SAP_GAP_TOL_KG = 0.01;

function sapEffectiveGapKg(bkId) {
  var r = sapState.compareResult.find(function(x) { return x.bkId === bkId; });
  if (!r) return 0;
  var adj = sapState.adjustPending[bkId] || {};
  var k = Number(adj.kirimBelumTp) || 0;
  var b = Number(adj.bongkarBelumSap) || 0;
  var sapEff = Number(r.sap) - k + b;
  return Number(r.sistem) - sapEff;
}

function sapBkStillNeedsInvestigation(bkId) {
  return Math.abs(sapEffectiveGapKg(bkId)) > SAP_GAP_TOL_KG;
}

/** BK yang masih punya selisih efektif vs sistem — untuk chip Step 3. */
function sapListBkIdsStillNeedingInvestigation() {
  var out = [];
  BK_LIST_SAP.forEach(function(bid) {
    if (sapBkStillNeedsInvestigation(bid)) out.push(bid);
  });
  return out;
}

function sapRefreshEffectiveStrip(bkId) {
  var result = sapState.compareResult.find(function(r) { return r.bkId === bkId; });
  if (!result) return;
  var adj = sapState.adjustPending[bkId] || {};
  var k = Number(adj.kirimBelumTp) || 0;
  var b = Number(adj.bongkarBelumSap) || 0;
  var sapIn = Number(result.sap) || 0;
  var sapEff = sapIn - k + b;
  var gapEff = Number(result.sistem) - sapEff;

  var elIn = $('sap_eff_sap_input');
  if (elIn) elIn.textContent = fmtNum(sapIn);
  var elK = $('sap_eff_k');
  if (elK) elK.textContent = fmtNum(k);
  var elB = $('sap_eff_b');
  if (elB) elB.textContent = fmtNum(b);
  var elT = $('sap_eff_total');
  if (elT) elT.textContent = fmtNum(sapEff);
  var elG = $('sap_eff_gap_vs_sys');
  if (elG) {
    elG.textContent = (gapEff >= 0 ? '+' : '−') + fmtNum(Math.abs(gapEff));
    elG.style.color = Math.abs(gapEff) < 1e-6 ? 'var(--cm)' : gapEff > 0 ? 'var(--ck)' : 'var(--cw)';
  }

  var rowM = $('sap_eff_row_minus');
  if (rowM) rowM.style.display = k > 0 ? 'flex' : 'none';
  var rowP = $('sap_eff_row_plus');
  if (rowP) rowP.style.display = b > 0 ? 'flex' : 'none';
  var panel = $('sap_effective_panel');
  if (panel) panel.style.display = 'block';

  var ss = $('sap_strip_sistem');
  if (ss) ss.textContent = fmtNum(result.sistem);
  var sp = $('sap_strip_sap');
  if (sp) sp.textContent = fmtNum(sapEff);
  var sg = $('sap_strip_gap');
  if (sg) sg.textContent = fmtNum(Math.abs(gapEff));
  var sgl = $('sap_strip_gap_lbl');
  if (sgl) {
    sgl.textContent = gapEff >= 0 ? 'Selisih sistem − SAP efektif (kg)' : 'Selisih SAP efektif − sistem (kg)';
  }
  var hdrSap = $('sap_strip_sap_hdr');
  if (hdrSap) hdrSap.textContent = 'SAP efektif (kg)';
}

function sapApplyKirimTerap() {
  var bkId = sapState.detailBK;
  if (!bkId) return;
  var sumK = 0;
  document.querySelectorAll('.sap-cb-kirim:checked').forEach(function(cb) {
    sumK += parseFloat(cb.getAttribute('data-netto')) || 0;
  });
  if (!sapState.adjustPending[bkId]) sapState.adjustPending[bkId] = {};
  sapState.adjustPending[bkId].kirimBelumTp = sumK;
  toast('Pengurangan SAP (kirim belum TP): ' + fmtNum(sumK) + ' kg', 's');
  sapRefreshEffectiveStrip(bkId);
  updateSapReconcileTotals();
  sapAutoSaveDraft();
  if (!sapBkStillNeedsInvestigation(bkId)) sapShowDiff(bkId);
}

function sapApplyBongkarTerap() {
  var bkId = sapState.detailBK;
  if (!bkId) return;
  var sumB = 0;
  document.querySelectorAll('.sap-cb-bongkar:checked').forEach(function(cb) {
    sumB += parseFloat(cb.getAttribute('data-netto')) || 0;
  });
  if (!sapState.adjustPending[bkId]) sapState.adjustPending[bkId] = {};
  sapState.adjustPending[bkId].bongkarBelumSap = sumB;
  toast('Penambahan SAP (bongkar belum di SAP): ' + fmtNum(sumB) + ' kg', 's');
  sapRefreshEffectiveStrip(bkId);
  updateSapReconcileTotals();
  sapAutoSaveDraft();
  if (!sapBkStillNeedsInvestigation(bkId)) sapShowDiff(bkId);
}

function updateSapReconcileTotals() {
  var result = sapState.activeDiffResult;
  var sumK = 0;
  var sumB = 0;
  document.querySelectorAll('.sap-cb-kirim:checked').forEach(function(cb) {
    sumK += parseFloat(cb.getAttribute('data-netto')) || 0;
  });
  document.querySelectorAll('.sap-cb-bongkar:checked').forEach(function(cb) {
    sumB += parseFloat(cb.getAttribute('data-netto')) || 0;
  });
  var elK = $('sap_sum_kirim_checked');
  var elB = $('sap_sum_bongkar_checked');
  if (elK) elK.textContent = fmtNum(sumK);
  if (elB) elB.textContent = fmtNum(sumB);

  var note = $('sap_reconcile_note');
  if (!note || !result) return;
  note.textContent =
    'Centang transaksi yang relevan di kedua tabel, lalu klik Terapkan pada kolom kirim dan/atau bongkar. ' +
    'Selisih bisa muncul dari pengiriman saja, bongkar saja, atau keduanya — audit dua sisi. ' +
    'Terpilih (belum Terapkan): kirim ' + fmtNum(sumK) + ' kg, bongkar ' + fmtNum(sumB) + ' kg.';
}

function sapPrefillSAPInlineForms(bkId, result) {
  $('sap_b_tanggal').value = todayStr();
  $('sap_b_bk_id').value = bkId;
  $('sap_b_operator').value = appState.user ? appState.user.nama : '';
  $('sap_b_shift').value = '1';
  var bkMaster = getBKById(bkId);
  $('sap_b_material').value =
    (result && result.material) ||
    (typeof bkMasterMaterial_ === 'function' ? bkMasterMaterial_(bkMaster) : (bkMaster.MATERIAL_DEFAULT || ''));
  $('sap_b_supplier').value =
    typeof bkMasterSupplier_ === 'function' ? bkMasterSupplier_(bkMaster) : String(bkMaster.SUPPLIER_DEFAULT || '').trim();
  $('sap_bongkar_input').value = '';

  $('sap_ik_tanggal').value = todayStr();
  $('sap_ik_bk_id').value = bkId;
  $('sap_ik_operator').value = appState.user ? appState.user.nama : '';
  $('sap_ik_shift').value = '1';
  $('sap_ik_netto').value = '';
  var sel = $('sap_ik_material');
  if (sel) {
    sel.innerHTML = '<option value="">— Pilih —</option>';
    var seen = {};
    (appState.dashData || []).forEach(function(bk) {
      var m = typeof bkMasterMaterial_ === 'function' ? bkMasterMaterial_(bk) : (bk.MATERIAL_DEFAULT || '').trim();
      if (m && !seen[m]) {
        seen[m] = 1;
        var o = document.createElement('option');
        o.value = m;
        o.textContent = m;
        sel.appendChild(o);
      }
    });
    if (result.material) sel.value = result.material;
  }
}

function sapShowDiff(bkId) {
  var needs = sapListBkIdsStillNeedingInvestigation();
  if (needs.length === 0) {
    toast('Investigasi selesai — SAP efektif sudah selaras dengan sistem. Silakan ekspor laporan.', 's');
    renderSAPStep4();
    return;
  }
  if (needs.indexOf(bkId) === -1) {
    bkId = needs[0];
  }

  sapState.detailBK = bkId;
  var result = sapState.compareResult.find(function(r) { return r.bkId === bkId; });
  if (!result) return;
  sapState.activeDiffResult = result;

  $('sap_step1').style.display = 'none';
  $('sap_step2').style.display = 'none';
  $('sap_step3').style.display = 'block';
  var s4 = $('sap_step4');
  if (s4) s4.style.display = 'none';
  sapState.lastUiStep = 3;
  updateStepIndicator(3);

  var chipList = $('sap_bk_diff_list');
  chipList.innerHTML = '';
  needs.forEach(function(bid) {
    var chip = document.createElement('button');
    chip.className = 'btn' + (bid === bkId ? '' : ' no');
    chip.style.padding = '6px 14px';
    chip.style.fontSize = '0.8rem';
    chip.textContent = bid + ' ⚠';
    chip.style.borderColor = 'var(--ck)';
    chip.style.color = 'var(--ck)';
    chip.addEventListener('click', function() { sapShowDiff(bid); });
    chipList.appendChild(chip);
  });

  var gapEff = sapEffectiveGapKg(bkId);
  var sesuai = Math.abs(gapEff) <= SAP_GAP_TOL_KG;
  var sistemLebih = gapEff > SAP_GAP_TOL_KG;
  var sapLebih = gapEff < -SAP_GAP_TOL_KG;

  $('sap_diff_sesuai_box').style.display = sesuai ? 'block' : 'none';
  var mismatch = $('sap_diff_mismatch_wrap');
  if (mismatch) mismatch.style.display = sesuai ? 'none' : 'block';

  var panelEff = $('sap_effective_panel');
  if (sesuai) {
    if (panelEff) panelEff.style.display = 'none';
    sapAutoSaveDraft();
    return;
  }

  var hint = $('sap_strip_hint');
  var panelB = $('sap_panel_bongkar_inline');
  var panelK = $('sap_panel_kirim_inline');
  var btnMb = $('sap_btn_miss_bongkar');
  var btnMk = $('sap_btn_miss_kirim');
  var recK = $('sap_reconcile_kirim_block');
  var manualW = $('sap_manual_kirim_wrap');

  if (hint) {
    hint.innerHTML =
      '<strong>Audit dua arah (kirim &amp; bongkar)</strong><br>' +
      (sapLebih
        ? '<span style="color:var(--tp);">Stock SAP (input Step 1) lebih tinggi daripada stok sistem. Potensi: bongkaran/penerimaan di gudang yang belum ter-input di aplikasi, pengiriman yang sudah ter-record di sistem dengan pola berbeda, kesalahan input SAP, atau kombinasi. ' +
          'Cek tabel <strong>bongkar</strong> (baris yang belum tercermin di SAP → Terapkan +) dan tabel <strong>kirim</strong> (yang sudah jalan tapi SAP belum tarik → Terapkan −). Urutkan penyebab lain satu per satu.</span>'
        : '<span style="color:var(--tp);">Stok sistem lebih besar daripada Stock SAP (input). Potensi: pengiriman sudah berjalan tetapi SAP belum memotong stok (belum TP / delay tarik), saldo SAP ter-input lebih kecil dari fisik, atau ada mutasi yang belum tercatat konsisten. ' +
          'Cek tabel <strong>kirim</strong> dan <strong>bongkar</strong> — selisih bisa dari satu sisi saja atau keduanya.</span>') +
      '<br><br><strong>SAP efektif</strong> = input Step 1 − total kirim belum TP (setelah Terapkan) + total bongkar belum di SAP (setelah Terapkan). Angka di strip kanan memakai SAP efektif.';
  }

  if (recK) recK.style.display = 'block';
  if (btnMb) btnMb.style.display = 'block';
  if (btnMk) btnMk.style.display = 'block';
  if (manualW) {
    manualW.style.display = sistemLebih ? 'block' : 'none';
    if (sistemLebih && $('sap_kirim_manual_input')) $('sap_kirim_manual_input').value = '';
  }
  if (panelB) panelB.style.display = 'none';
  if (panelK) panelK.style.display = 'none';

  showLoader(true);
  loadSAPHistoryForBK(bkId, function(bong, kir) {
    showLoader(false);
    renderSAPHistorySplitTables(bkId, bong, kir);
    sapPrefillSAPInlineForms(bkId, result);
    sapRefreshEffectiveStrip(bkId);
    updateSapReconcileTotals();
    sapAutoSaveDraft();
  });
}

function sapInlineKirimSave() {
  var bkId = $('sap_ik_bk_id').value;
  var netto = parseFloat($('sap_ik_netto').value);
  if (!bkId) return;
  if (isNaN(netto) || netto <= 0) { toast('Masukkan netto kirim', 'w'); return; }
  var grinding = $('sap_ik_grinding').value;
  if (!grinding) { toast('Pilih Grinding', 'w'); return; }
  var prevRow = sapState.compareResult.find(function(r) { return r.bkId === bkId; });
  var prevSistem = prevRow ? Number(prevRow.sistem) : NaN;
  var data = {
    action: 'addKirim',
    TANGGAL: $('sap_ik_tanggal').value,
    BK_ID: bkId,
    MATERIAL: $('sap_ik_material').value,
    NETTO_KG: netto,
    SHIFT: $('sap_ik_shift').value,
    GRINDING: grinding,
    INPUT_BY: (appState.user ? appState.user.nama + ' (SAP-detail)' : '')
  };
  showLoader(true);
  postAPI('addKirim', data, function(resp) {
    showLoader(false);
    if (resp.status === 'error') { toast('Gagal: ' + resp.message, 'e'); return; }
    toast('Kirim tersimpan.', 's');
    $('sap_ik_netto').value = '';
    loadSAPData();
    loadDashboard(function() {
      sapBuildCompare();
      sapMergeCompareAfterKirim(bkId, prevSistem, netto);
      sapShowDiff(bkId);
    });
  });
}

function sapBackToReview() {
  var s4 = $('sap_step4');
  if (s4) s4.style.display = 'none';
  renderSAPStep2();
}

function sapBackToInput() {
  sapState.currentIdx = 0;
  renderSAPStep1();
}

function sapDoneAll() {
  renderSAPStep4();
  toast('Ringkasan Step 4 — silakan ekspor laporan.', 's');
}

function sapExportReport() {
  showExportOptions();
}

function showExportOptions() {
  var body = '<div style="display:flex;flex-direction:column;gap:10px;">' +
    '<button class="btn" onclick="sapExport(\'csv\')" style="width:100%;"><i class="fas fa-file-csv"></i> Export CSV</button>' +
    '<button class="btn" onclick="sapExport(\'pdf\')" style="width:100%;"><i class="fas fa-file-pdf"></i> Export PDF</button>' +
    '</div>';
  $('modalTitle').textContent = 'Pilih Format Export';
  $('modalBody').innerHTML = body;
  $('modalYes').style.display = 'none';
  $('modalNo').textContent = 'Tutup';
  $('modalNo').onclick = function() {
    $('modal').classList.remove('active');
    $('modalYes').style.display = '';
    $('modalNo').textContent = 'Batal';
    $('modalNo').onclick = null;
  };
  $('modal').classList.add('active');
}

function sapExport(format) {
  $('modal').classList.remove('active');
  if (typeof LaporanExport !== 'undefined' && LaporanExport.run) {
    var ok = LaporanExport.run(format);
    if (ok) toast('Export ' + format.toUpperCase() + ' berhasil', 's');
    return;
  }
  toast('Modul ekspor laporan tidak dimuat.', 'e');
}

function downloadFile(filename, mime, content) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function sapLihatDetail() {
  var needs = sapListBkIdsStillNeedingInvestigation();
  if (needs.length) sapShowDiff(needs[0]);
  else toast('Tidak ada BK dengan selisih efektif — semua sudah selaras.', 'i');
}

function sapBongkarSave() {
  var bkId = $('sap_b_bk_id').value || sapState.detailBK;
  var qty = parseFloat($('sap_bongkar_input').value);
  var shift = $('sap_b_shift').value;
  var material = $('sap_b_material').value;
  var supplier = $('sap_b_supplier').value;
  var tgl = $('sap_b_tanggal').value;
  if (!bkId) return;
  if (isNaN(qty) || qty <= 0) { toast('Masukkan quantity bongkaran', 'w'); return; }
  var result = sapState.compareResult.find(function(r) { return r.bkId === bkId; });
  var prevSistem = result ? Number(result.sistem) : NaN;
  var data = {
    action: 'addBongkar',
    TANGGAL: tgl,
    BK_ID: bkId,
    MATERIAL: material,
    SUPPLIER: supplier || 'Penyesuaian SAP',
    NETTO_KG: qty,
    SHIFT: shift,
    TYPE_BONGKARAN: 'sap_adjustment',
    STATUS_ROW: 'complete',
    DURASI_JSON: JSON.stringify({ v: 1, is_sbm: String(material || '').toLowerCase().indexOf('sbm') >= 0, type_bongkaran: 'sap_adjustment', breakdowns: {} }),
    INPUT_BY: (appState.user ? appState.user.nama + ' (Auto-SAP)' : '')
  };
  showLoader(true);
  postAPI('addBongkar', data, function(resp) {
    showLoader(false);
    if (resp.status === 'error') { toast('Gagal: ' + resp.message, 'e'); return; }
    toast('Bongkaran penyesuaian SAP berhasil disimpan!', 's');
    $('sap_bongkar_input').value = '';
    loadSAPData();
    loadDashboard(function() {
      sapBuildCompare();
      sapMergeCompareAfterBongkar(bkId, prevSistem, qty);
      sapShowDiff(bkId);
    });
  });
}

function sapKirimSave() {
  var bkId = sapState.detailBK;
  var qty = parseFloat($('sap_kirim_manual_input').value);
  if (!bkId) return;
  if (isNaN(qty) || qty <= 0) { toast('Masukkan quantity pengiriman', 'w'); return; }
  var result = sapState.compareResult.find(function(r) { return r.bkId === bkId; });
  var prevSistem = result ? Number(result.sistem) : NaN;
  var inp = sapState.inputs[bkId] || {};
  var data = {
    action: 'addKirim',
    TANGGAL: todayStr(),
    BK_ID: bkId,
    MATERIAL: inp.material || '',
    NETTO_KG: qty,
    SHIFT: '1',
    GRINDING: 'Manual Input',
    INPUT_BY: (appState.user ? appState.user.nama + ' (Auto-SAP)' : '')
  };
  showLoader(true);
  postAPI('addKirim', data, function(resp) {
    showLoader(false);
    if (resp.status === 'error') { toast('Gagal: ' + resp.message, 'e'); return; }
    toast('Pengiriman penyesuaian SAP berhasil disimpan!', 's');
    $('sap_kirim_manual_input').value = '';
    loadSAPData();
    loadDashboard(function() {
      sapBuildCompare();
      sapMergeCompareAfterKirim(bkId, prevSistem, qty);
      sapShowDiff(bkId);
    });
  });
}

// ── FORMS ─────────────────────────────────────────────────────────────────────
function bkkEnsureOpnameHistory(callback) {
  if (appState.history && appState.history.opname && appState.history.opname.length) {
    callback();
    return;
  }
  fetchAPI('getOpnameHistory', {}, function(resp) {
    if (resp.status !== 'error') appState.history.opname = resp.data || [];
    callback();
  });
}

/** SO terakhir untuk BK (tanggal kalender ≤ hari ini WIB): prioritas TIMESTAMP posting, bukan hanya TANGGAL. */
function bkkLatestOpnameInfoLeToday(bkId) {
  var todayWib = typeof todayYMD_WIB === 'function' ? todayYMD_WIB() : (typeof todayStr === 'function' ? todayStr() : '');
  var rows = appState.history.opname || [];
  var bestMs = -1;
  var best = null;
  var bestYmd = '';
  rows.forEach(function(r) {
    if (!sapBkRowMatches(r.BK_ID, bkId)) return;
    var y = typeof dashDateToYMD === 'function' ? dashDateToYMD(r.TANGGAL) : String(r.TANGGAL || '').substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return;
    if (y > todayWib) return;
    var ms = bkkRowEventTimeMs(r);
    if (isNaN(ms)) return;
    if (ms > bestMs) {
      bestMs = ms;
      best = r;
      bestYmd = y;
    }
  });
  if (!best || bestMs < 0) return null;
  return { row: best, eventMs: bestMs, ymd: bestYmd };
}

function bkkFormatWibClockHM_(ms) {
  if (isNaN(ms)) return '—';
  try {
    return new Date(ms).toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (e) {
    return '—';
  }
}

/**
 * @param {string} bkId
 * @param {string} tanggalYmd — tanggal operasi / transaksi (yyyy-MM-dd)
 * @param {{ eventMs?: number }=} opt — bila isi, dibandingkan dengan jam posting SO pada hari yang sama
 */
function bkkValidateTanggalBongkarKirim(bkId, tanggalYmd, opt) {
  opt = opt || {};
  var todayWib = typeof todayYMD_WIB === 'function' ? todayYMD_WIB() : (typeof todayStr === 'function' ? todayStr() : '');
  if (!tanggalYmd || String(tanggalYmd).length < 10)
    return { ok: false, msg: 'Pilih tanggal transaksi.' };
  var ymd = String(tanggalYmd).substring(0, 10);
  if (ymd > todayWib)
    return { ok: false, msg: 'Tanggal tidak boleh lebih maju dari hari ini (zona WIB).' };
  var info = bkkLatestOpnameInfoLeToday(bkId);
  if (!info) return { ok: true };
  var cutoffMs = info.eventMs;
  var cutoffYmd = info.ymd;
  if (ymd < cutoffYmd)
    return {
      ok: false,
      msg: 'Transaksi tanggal sebelum ' + cutoffYmd + ' ditolak — periode tersebut sudah ditutup oleh Stock Opname untuk BK ini. Minimal tanggal ' + cutoffYmd + '.'
    };
  if (ymd > cutoffYmd) return { ok: true };
  var txMs = opt.eventMs;
  if (txMs == null || isNaN(txMs)) {
    if (ymd === todayWib) txMs = Date.now();
    else txMs = bkkStartOfJakartaDayMs(ymd);
  }
  if (isNaN(txMs)) return { ok: true };
  if (txMs <= cutoffMs) {
    var jamSo = bkkFormatWibClockHM_(cutoffMs);
    return {
      ok: false,
      msg:
        'Operasi harus sesudah posting Stock Opname pada ' +
        cutoffYmd +
        ' pukul ' +
        jamSo +
        ' WIB. Setelah SO, stok di-reset — atur PB Start / waktu operasi agar benar-benar setelah jam tersebut (mis. SO 08:00 → PB Start 08:01 atau lebih).'
    };
  }
  return { ok: true };
}

function bkkShowReject(msg) {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'warning',
      title: 'Tanggal tidak boleh',
      html: '<div style="text-align:left;font-size:0.95rem;color:#475569;">' + msg + '</div>',
      confirmButtonText: 'Mengerti',
      confirmButtonColor: '#0284c7'
    });
  } else {
    toast(msg, 'w');
  }
}

function saveBongkar() {
  if (!$('b_bk_id') || !$('b_netto')) return;
  var bkId = $('b_bk_id').value;
  var netto = parseFloat($('b_netto').value);
  if (!bkId) { toast('Pilih BK terlebih dahulu', 'w'); return; }
  if (!netto || netto <= 0) { toast('Netto harus lebih dari 0', 'w'); return; }
  var shift = $('b_shift').value;
  var tgl = $('b_tanggal').value;

  function doPost() {
    var v = bkkValidateTanggalBongkarKirim(bkId, tgl, { eventMs: Date.now() });
    if (!v.ok) { bkkShowReject(v.msg); return; }
    var data = {
      action: 'addBongkar',
      TANGGAL: tgl,
      BK_ID: bkId,
      MATERIAL: $('b_material').value,
      SUPPLIER: $('b_supplier').value,
      NETTO_KG: netto,
      SHIFT: shift,
      INPUT_BY: (appState.user ? appState.user.nama + ' (Shift ' + shift + ')' : '')
    };
    showLoader(true);
    postAPI('addBongkar', data, function(resp) {
      showLoader(false);
      if (resp.status === 'error') { toast('Gagal: ' + resp.message, 'e'); return; }
      toast('Bongkar berhasil disimpan!', 's');
      $('b_netto').value = '';
      applyBongkarMasterDefaults(bkId);
      setTimeout(function() { loadDashboard(); }, 800);
    });
  }

  bkkEnsureOpnameHistory(doPost);
}

function saveKirim() {
  var bkId = $('k_bk_id').value;
  var netto = parseFloat($('k_netto').value);
  if (!bkId) { toast('Pilih BK terlebih dahulu', 'w'); return; }
  if (!netto || netto <= 0) { toast('Netto harus lebih dari 0', 'w'); return; }
  var bk = getBKById(bkId);
  if (bk.STOK_AKTIF && Number(bk.STOK_AKTIF) < netto) {
    modal('Peringatan', 'Stok BK ' + bkId + ' (' + fmtNum(bk.STOK_AKTIF) + ' kg) kurang dari ' + fmtNum(netto) + ' kg. Lanjut?', 'Lanjut', 'Batal').then(function(ok) {
      if (ok) doSaveKirim();
    });
  } else {
    doSaveKirim();
  }
}

function doSaveKirim() {
  var bkId = $('k_bk_id').value;
  var netto = parseFloat($('k_netto').value);
  bkkEnsureOpnameHistory(function() {
    var kv = bkkValidateTanggalBongkarKirim(bkId, $('k_tanggal').value, { eventMs: Date.now() });
    if (!kv.ok) { bkkShowReject(kv.msg); return; }
    var data = {
      action: 'addKirim',
      TANGGAL: $('k_tanggal').value,
      BK_ID: bkId,
      MATERIAL: $('k_material').value,
      NETTO_KG: netto,
      SHIFT: $('k_shift').value,
      GRINDING: $('k_grinding').value,
      INPUT_BY: (appState.user ? appState.user.nama : '')
    };
    showLoader(true);
    postAPI('addKirim', data, function(resp) {
      showLoader(false);
      if (resp.status === 'error') { toast('Gagal: ' + resp.message, 'e'); return; }
      toast('Kirim berhasil! ' + fmtNum(netto) + ' kg', 's');
      $('k_netto').value = '';
      setTimeout(function() { loadDashboard(); }, 800);
    });
  });
}

function saveOpname() {
  var bkId = $('o_bk_id').value;
  var ket = $('o_ket').value;
  if (!bkId) { toast('Pilih BK terlebih dahulu', 'w'); return; }
  var fisikRaw = $('o_stok_fisik') ? $('o_stok_fisik').value : '';
  if (fisikRaw === '' || fisikRaw == null) { toast('Isi stok fisik hasil timbang', 'w'); return; }
  var bk = getBKById(bkId);
  var sistem = bk.STOK_AKTIF ? Number(bk.STOK_AKTIF) : 0;
  var fisik = Number(fisikRaw);
  if (isNaN(fisik) || fisik < 0) { toast('Stok fisik tidak valid', 'w'); return; }
  var selisih = appState.opnameData ? appState.opnameData.selisih : 0;
  var penerimaan = appState.opnameData ? appState.opnameData.penerimaan : 0;
  var pengiriman = appState.opnameData ? appState.opnameData.pengiriman : 0;

  // Build ringkasan in modal body
  var selisihLabel = selisih > 0 ? 'Susut' : selisih < 0 ? 'Overfisik' : 'Sesuai';
  var selColor = selisih < 0 ? 'var(--ck)' : selisih > 0 ? 'var(--cw)' : 'var(--cm)';
  var pct = appState.opnameData ? appState.opnameData.persentase : null;
  var pctDisp = pct != null && !isNaN(pct) ? fmtPct2(pct) : '—';
  var pctColor = pct == null || isNaN(pct) ? 'var(--ts)' : pct < 85 ? 'var(--ck)' : pct < 95 ? 'var(--cw)' : 'var(--cm)';

  var tblHtml = '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-bottom:12px;">' +
    '<tr><td style="padding:5px;color:var(--ts);">Operator</td><td style="padding:5px;font-weight:600;">' + (appState.user ? appState.user.nama : '—') + '</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">BK</td><td style="padding:5px;font-weight:600;">' + bkId + '</td></tr>' +
    '<tr><td style="padding:5px;color:var(--ts);">Material</td><td style="padding:5px;font-weight:600;">' + ($('o_material').value || '—') + '</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">Stok Sistem</td><td style="padding:5px;font-weight:700;color:var(--cs);">' + fmtNum(sistem) + ' kg</td></tr>' +
    '<tr><td style="padding:5px;color:var(--ts);">Stok Fisik</td><td style="padding:5px;font-weight:700;color:var(--cs);">' + fmtNum(fisik) + ' kg</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">Penerimaan</td><td style="padding:5px;font-weight:700;color:var(--cm);">' + fmtNum(penerimaan) + ' kg</td></tr>' +
    '<tr><td style="padding:5px;color:var(--ts);">Pengiriman</td><td style="padding:5px;font-weight:700;color:var(--ck);">' + fmtNum(pengiriman) + ' kg</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">Selisih (' + selisihLabel + ')</td><td style="padding:5px;font-weight:700;color:' + selColor + ';">' + fmtNum(Math.abs(selisih)) + ' kg</td></tr>' +
    '<tr><td style="padding:5px;color:var(--ts);">Persentase</td><td style="padding:5px;font-weight:700;color:' + pctColor + ';">' + pctDisp + '</td></tr>' +
    '</table><div style="font-size:0.85rem;color:var(--ts);padding:8px 12px;background:#fff3cd;border-radius:6px;border:1px solid var(--cw);"><i class="fas fa-exclamation-triangle" style="color:var(--cw);"></i> Stock BK ' + bkId + ' akan di-reset sesuai hasil opname.</div>';

  modal('Konfirmasi Stock Opname', tblHtml, 'Simpan', 'Batal').then(function(ok) {
    if (!ok) return;
    // var data = {
    //   action: 'addOpname',
    //   TANGGAL: $('o_tanggal').value,
    //   BK_ID: bkId,
    //   STOK_FISIK_KG: fisik,
    //   MATERIAL: $('o_material').value,
    //   KETERANGAN: ket,
    //   INPUT_BY: (appState.user ? appState.user.nama : '')
    // };


    var data = {
      action: 'addOpname',
      TANGGAL: $('o_tanggal').value,
      BK_ID: bkId,

      STOK_SISTEM_KG: sistem,
      STOK_FISIK_KG: fisik,
      PENERIMAAN_KG: penerimaan,
      PENGIRIMAN_KG: pengiriman,
      SELISIH_KG: selisih,
      PERSENTASE: pct,

      MATERIAL: $('o_material').value,
      KETERANGAN: ket,
      INPUT_BY: (appState.user ? appState.user.nama : '')
    };

    showLoader(true);
    postAPI('addOpname', data, function(resp) {
      showLoader(false);
      if (resp.status === 'error') { toast('Gagal: ' + resp.message, 'e'); return; }
      toast('Opname berhasil disimpan!', 's');
      $('o_stok_sistem').textContent = '—';
      if ($('o_stok_fisik')) $('o_stok_fisik').value = '';
      $('o_selisih').textContent = '—';
      $('o_penerimaan').textContent = '— kg';
      $('o_persentase').textContent = '—';
      $('o_ket').value = '';
      $('o_ringkasan_box').style.display = 'none';
      setTimeout(function() { loadDashboard(); }, 800);
    });
  });
}

function updateOpnameInfo() {
  var bkId = $('o_bk_id').value;
  if (!bkId) {
    $('o_stok_sistem').textContent = '—';
    $('o_selisih').textContent = '—';
    $('o_penerimaan').textContent = '— kg';
    $('o_persentase').textContent = '—';
    $('o_ket').value = '';
    $('o_ringkasan_box').style.display = 'none';
    return;
  }
  var bk = getBKById(bkId);
  var om = $('o_material');
  var matO = typeof bkMasterMaterial_ === 'function' ? bkMasterMaterial_(bk) : (bk.MATERIAL_DEFAULT || '').trim();
  if (om) {
    if (matO && typeof ensureSelectOptionValue_ === 'function') ensureSelectOptionValue_(om, matO, matO);
    else if (om) om.value = '';
  }
  var sistem = bk.STOK_AKTIF ? Number(bk.STOK_AKTIF) : 0;
  $('o_stok_sistem').textContent = fmtNum(sistem) + ' kg';
  $('o_stok_sistem').style.color = sistem < 0 ? 'var(--ck)' : 'var(--ts)';

  var fisikInp = $('o_stok_fisik');
  var fisik = fisikInp && fisikInp.value !== '' && fisikInp.value != null ? Number(fisikInp.value) : null;
  if (fisik != null && isNaN(fisik)) fisik = null;

  // Hitung penerimaan = total bongkar setelah tanggal SO terakhir untuk BK ini, sampai tanggal opname (inklusif)
  var bongkarData = appState.history.bongkar || [];
  var kirimData = appState.history.kirim || [];
  var allOpname = appState.history.opname || [];
  var opRows = allOpname.filter(function(r) { return sapBkRowMatches(r.BK_ID, bkId); });
  opRows.sort(function(a, b) {
    var ma = bkkRowEventTimeMs(a);
    var mb = bkkRowEventTimeMs(b);
    if (isNaN(ma)) ma = 0;
    if (isNaN(mb)) mb = 0;
    return mb - ma;
  });
  var lastSO = opRows[0] || null;
  var lastSOMs = lastSO ? bkkRowEventTimeMs(lastSO) : NaN;
  var endYmd = $('o_tanggal').value || (typeof todayStr === 'function' ? todayStr() : '');
  var endCapMs = bkkOpnamePeriodEndMs(endYmd);

  var totalBongkar = 0, totalKirim = 0;
  bongkarData.forEach(function(r) {
    if (!sapBkRowMatches(r.BK_ID, bkId)) return;
    var evMs = bkkRowEventTimeMs(r);
    if (isNaN(evMs)) return;
    if (!isNaN(lastSOMs) && evMs <= lastSOMs) return;
    if (!isNaN(endCapMs) && evMs > endCapMs) return;
    totalBongkar += Number(r.NETTO_KG) || 0;
  });
  kirimData.forEach(function(r) {
    if (!sapBkRowMatches(r.BK_ID, bkId)) return;
    var evMs = bkkRowEventTimeMs(r);
    if (isNaN(evMs)) return;
    if (!isNaN(lastSOMs) && evMs <= lastSOMs) return;
    if (!isNaN(endCapMs) && evMs > endCapMs) return;
    totalKirim += Number(r.NETTO_KG) || 0;
  });
  var penerimaan = totalBongkar;

  var selisih = fisik != null ? sistem - fisik : null;
  var qtyMusnah = selisih != null ? Math.abs(selisih) : 0;
  var pct = null;
  if (penerimaan > 0 && selisih != null) pct = (qtyMusnah / penerimaan) * 100;
  else if (penerimaan === 0 && selisih != null && qtyMusnah === 0) pct = 0;

  $('o_penerimaan').textContent = fmtNum(penerimaan) + ' kg';
  if (selisih != null) {
    $('o_selisih').textContent = fmtNum(Math.abs(selisih)) + ' kg';
    $('o_selisih').style.color = selisih < 0 ? 'var(--ck)' : selisih > 0 ? 'var(--cw)' : 'var(--cm)';
  } else {
    $('o_selisih').textContent = '—';
    $('o_selisih').style.color = 'var(--ts)';
  }
  if (pct != null && !isNaN(pct)) {
    $('o_persentase').textContent = fmtPct2(pct);
    $('o_persentase').style.color = pct < 85 ? 'var(--ck)' : pct < 95 ? 'var(--cw)' : 'var(--cm)';
  } else if (selisih == null) {
    $('o_persentase').textContent = '—';
    $('o_persentase').style.color = 'var(--ts)';
  } else {
    $('o_persentase').textContent = penerimaan === 0 && qtyMusnah > 0 ? '—' : fmtPct2(0);
    $('o_persentase').style.color = 'var(--ts)';
  }

  var ketLabel = selisih == null ? '' : selisih > 0 ? 'Susut' : selisih < 0 ? 'Overfisik' : 'Sesuai';
  $('o_ket').value = ketLabel;

  // Ringkasan box
  appState.opnameData = {
    sistem: sistem,
    fisik: fisik,
    penerimaan: penerimaan,
    pengiriman: totalKirim,
    selisih: selisih != null ? selisih : 0,
    persentase: pct != null && !isNaN(pct) ? pct : null
  };
  var ringkasan = $('o_ringkasan_box');
  ringkasan.style.display = 'block';
  $('rs_operator').textContent = appState.user ? appState.user.nama : '—';
  $('rs_tanggal').textContent = $('o_tanggal').value;
  $('rs_bk').textContent = bkId;
  $('rs_material').textContent = $('o_material').value || '—';
  $('rs_stok_sistem').textContent = fmtNum(sistem) + ' kg';
  var rsF = $('rs_stok_fisik');
  if (rsF) rsF.textContent = fisik != null ? fmtNum(fisik) + ' kg' : '—';
  $('rs_penerimaan').textContent = fmtNum(penerimaan) + ' kg';
  $('rs_pengiriman').textContent = fmtNum(totalKirim) + ' kg';
  var selEl = $('rs_selisih');
  if (selisih != null) {
    selEl.textContent = fmtNum(Math.abs(selisih)) + ' kg (' + ketLabel + ')';
    selEl.style.color = selisih < 0 ? 'var(--ck)' : selisih > 0 ? 'var(--cw)' : 'var(--cm)';
  } else {
    selEl.textContent = '—';
    selEl.style.color = 'var(--ts)';
  }
  $('rs_persentase').textContent = pct != null && !isNaN(pct) ? fmtPct2(pct) : (selisih == null ? '—' : penerimaan === 0 && qtyMusnah > 0 ? '—' : fmtPct2(0));
}

function stokHint(stok, kapasitas) {
  if (!stok || !kapasitas) return { cls: 'ok', txt: '—' };
  var pct = (stok / kapasitas) * 100;
  if (pct > 90) return { cls: 'err', txt: 'OVER CAPACITY! (' + fmtNum(pct) + '%)' };
  if (pct > 85) return { cls: 'warn', txt: 'Hampir penuh (' + fmtNum(pct) + '%)' };
  return { cls: 'ok', txt: 'Normal (' + fmtNum(pct) + '%)' };
}

function initFormDefaults() {
  var t = todayStr();
  var bdt = $('b_tanggal');
  if (bdt) bdt.value = t;
  var bwt = $('bw_tanggal');
  if (bwt) bwt.value = t;
  $('k_tanggal').value = t;
  $('o_tanggal').value = t;
}

// ── DOMCONTENTLOADED ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {

  // Login
  $('btnLogin').addEventListener('click', doLogin);
  $('inpPass').addEventListener('keypress', function(e) { if (e.key === 'Enter') doLogin(); });

  // Logout
  $('btnLogout').addEventListener('click', doLogout);

  // Refresh
  var refreshBtn = $('btnRefresh');
  if (refreshBtn) refreshBtn.addEventListener('click', function() {
    if (appState.currentPage === 'dashboard') loadDashboard();
    else if (appState.currentPage === 'ceksap') loadSAPData();
    toast('Data di-refresh', 'i');
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.addEventListener('click', function() { navigateTo(this.dataset.page); });
  });

  // Header tab navigation
  document.querySelectorAll('.header-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.header-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      navigateTo(this.dataset.page);
    });
  });

  // Form buttons
  var btnB = $('btnBongkar');
  if (btnB) btnB.addEventListener('click', saveBongkar);
  $('btnKirim').addEventListener('click', saveKirim);
  $('btnOpname').addEventListener('click', saveOpname);

  // Auto-fill Bongkar BK — material & supplier dari BKK_Master
  var bBk = $('b_bk_id');
  if (bBk) bBk.addEventListener('change', function() {
    applyBongkarMasterDefaults(this.value);
  });

  // Auto-fill Kirim BK
  $('k_bk_id').addEventListener('change', function() {
    var bk = getBKById(this.value);
    var km = $('k_material');
    var mat = typeof bkMasterMaterial_ === 'function' ? bkMasterMaterial_(bk) : (bk.MATERIAL_DEFAULT || '').trim();
    if (km) {
      if (mat && typeof ensureSelectOptionValue_ === 'function') ensureSelectOptionValue_(km, mat, mat);
      else if (km) km.value = '';
    }
    var hint = $('k_hint');
    if (hint) {
      var h = stokHint(bk.STOK_AKTIF, bk.KAPASITAS_KG);
      hint.textContent = 'Stok tersedia: ' + fmtNum(bk.STOK_AKTIF) + ' kg — ' + h.txt;
      hint.className = 'fg full fhint ' + h.cls;
    }
  });

  // Opname BK change
  $('o_bk_id').addEventListener('change', updateOpnameInfo);
  $('o_tanggal').addEventListener('change', updateOpnameInfo);
  var oFisik = $('o_stok_fisik');
  if (oFisik) oFisik.addEventListener('input', updateOpnameInfo);

  // Cek SAP tabs
  document.querySelectorAll('#page-ceksap .tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#page-ceksap .tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('#page-ceksap .tc').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
      var tabId = this.dataset.tab;
      var tc = $(tabId);
      if (tc) tc.classList.add('active');
      if (tabId === 'tab-inv-sistem') renderInvSistem();
      if (tabId === 'tab-inv-sap') renderSAPTable(1);
    });
  });

  // Cek SAP new flow
  $('sap_next_btn').addEventListener('click', sapNext);
  $('sap_prev_btn').addEventListener('click', sapPrev);
  $('sap_back_to_input').addEventListener('click', sapBackToInput);
  $('sap_back_to_review').addEventListener('click', sapBackToReview);
  $('sap_done_all_btn').addEventListener('click', sapDoneAll);
  $('sap_export_btn').addEventListener('click', sapExportReport);
  $('sap_lihat_detail_btn').addEventListener('click', sapLihatDetail);
  var sTapK = $('sap_btn_terap_kirim');
  if (sTapK) sTapK.addEventListener('click', sapApplyKirimTerap);
  var sTapB = $('sap_btn_terap_bongkar');
  if (sTapB) sTapB.addEventListener('click', sapApplyBongkarTerap);
  var sGo4 = $('sap_go_step4_btn');
  if (sGo4) sGo4.addEventListener('click', function() { renderSAPStep4(); });
  var sEx4 = $('sap_step4_export_btn');
  if (sEx4) sEx4.addEventListener('click', sapExportReport);
  var sBk4 = $('sap_step4_back_review');
  if (sBk4) sBk4.addEventListener('click', sapBackToReview);
  $('sap_bongkar_save').addEventListener('click', sapBongkarSave);
  $('sap_kirim_save').addEventListener('click', sapKirimSave);
  var ikSave = $('sap_ik_save');
  if (ikSave) ikSave.addEventListener('click', sapInlineKirimSave);

  var pgCek = $('page-ceksap');
  if (pgCek) {
    pgCek.addEventListener('change', function(e) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'sap_ck_all_kirim') {
        document.querySelectorAll('#sap_last_kirim_tb .sap-cb-kirim').forEach(function(c) { c.checked = t.checked; });
        updateSapReconcileTotals();
        return;
      }
      if (t.id === 'sap_ck_all_bongkar') {
        document.querySelectorAll('#sap_last_bongkar_tb .sap-cb-bongkar').forEach(function(c) { c.checked = t.checked; });
        updateSapReconcileTotals();
        return;
      }
      if (t.classList.contains('sap-cb-kirim') || t.classList.contains('sap-cb-bongkar')) {
        updateSapReconcileTotals();
      }
    });
    pgCek.addEventListener('click', function(e) {
      var mb = e.target.closest('#sap_btn_miss_bongkar');
      var mk = e.target.closest('#sap_btn_miss_kirim');
      if (mb) {
        var pb = $('sap_panel_bongkar_inline');
        if (pb) pb.style.display = pb.style.display === 'none' || pb.style.display === '' ? 'block' : 'none';
      }
      if (mk) {
        var pk = $('sap_panel_kirim_inline');
        if (pk) pk.style.display = pk.style.display === 'none' || pk.style.display === '' ? 'block' : 'none';
      }
    });
  }

  $('sap_stock_input').addEventListener('input', renderSAPStep1Preview);
  $('sap_stock_input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sapNext();
  });

  // History tabs
  document.querySelectorAll('#page-history .tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#page-history .tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('#page-history .htab').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
      var tabId = this.dataset.tab;
      var tc = $(tabId);
      if (tc) tc.classList.add('active');
      var tabMap = { 'htab-bongkar': 'bongkar', 'htab-kirim': 'kirim', 'htab-opname': 'opname' };
      var tab = tabMap[tabId];
      if (tab) {
        var bkSel = $('h_bk_' + tab);
        var blnSel = $('h_bln_' + tab);
        loadHistoryData(tab, bkSel ? bkSel.value : '', blnSel ? blnSel.value : '');
      }
    });
  });

  // History filters
  $('h_bk_bongkar').addEventListener('change', function() { loadHistoryData('bongkar', this.value, $('h_bln_bongkar').value); });
  $('h_bln_bongkar').addEventListener('change', function() { loadHistoryData('bongkar', $('h_bk_bongkar').value, this.value); });
  $('h_bk_kirim').addEventListener('change', function() { loadHistoryData('kirim', this.value, $('h_bln_kirim').value); });
  $('h_bln_kirim').addEventListener('change', function() { loadHistoryData('kirim', $('h_bk_kirim').value, this.value); });
  $('h_bk_opname').addEventListener('change', function() { loadHistoryData('opname', this.value, $('h_bln_opname').value); });
  $('h_bln_opname').addEventListener('change', function() { loadHistoryData('opname', $('h_bk_opname').value, this.value); });

  // Init defaults
  initFormDefaults();

  // Check saved auth
  if (!checkAuth()) {
    $('page-login').classList.add('active');
  } else {
    navigateTo('dashboard');
  }

  // Sidebar overlay close
  var sovl = $('sidebarOvl');
  if (sovl) sovl.addEventListener('click', closeSidebar);

});
