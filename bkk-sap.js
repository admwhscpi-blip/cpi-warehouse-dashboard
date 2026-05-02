// ── CEK SAP ──────────────────────────────────────────────────────────────────
function loadSAPData() {
  // load history so kirim/bongkar data available for diff detail
  fetchAPI('getBongkarHistory', { limit: 500 }, function(resp) {
    if (resp.status !== 'error') appState.history.bongkar = resp.data || [];
  });
  fetchAPI('getKirimHistory', { limit: 500 }, function(resp) {
    if (resp.status !== 'error') appState.history.kirim = resp.data || [];
  });
}

var sapState = {
  currentIdx: 0,
  inputs: {}, // { 'BK-1': { stock: 1000, material: '...', kapal: '...' } }
  compareResult: [], // [{ bkId, material, kapal, sistem, sap, selisih, status }]
  detailBK: null,
  activeDiffResult: null
};

var BK_LIST_SAP = ['BK-1','BK-2','BK-3','BK-4','BK-5','BK-6'];

function initSAP() {
  sapState.currentIdx = 0;
  sapState.inputs = {};
  sapState.compareResult = [];
  sapState.detailBK = null;
  appState.dashData.forEach(function(bk) {
    sapState.inputs[bk.BK_ID] = {
      material: bk.MATERIAL_DEFAULT || '',
      stock: null
    };
  });
  renderSAPStep1();
}

function renderSAPStep1() {
  $('sap_step1').style.display = 'block';
  $('sap_step2').style.display = 'none';
  $('sap_step3').style.display = 'none';
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
    renderSAPStep2();
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
      var arah = r.selisih > 0 ? 'SAP lebih ' + fmtNum(Math.abs(r.selisih)) + ' kg dari sistem' : 'Sistem lebih ' + fmtNum(Math.abs(r.selisih)) + ' kg dari SAP';
      details.push({ bk: r.bkId, material: r.material, selisih: r.selisih, arah: arah });
    }
  });

  var ketBox = $('sap_keterangan_box');
  var ketText = $('sap_keterangan_text');

  if (!adaSelisih) {
    ketText.innerHTML = '<span style="color:var(--cm);font-weight:700;"><i class="fas fa-check-circle"></i> SEMUA SESUAI —</span> Tidak ada perbedaan stock antara sistem dan SAP. Lanjut ekspor laporan atau done.';
    $('sap_done_all_btn').style.display = '';
    $('sap_lihat_detail_btn').style.display = 'none';
    ketBox.style.display = 'block';
  } else {
    var detailLines = details.map(function(d) {
      return '<div style="margin-bottom:6px;padding:8px 10px;background:#fef2f2;border-radius:6px;border-left:3px solid var(--ck);">' +
        '<strong>' + d.bk + '</strong> (' + d.material + '): <strong style="color:var(--ck);">' + d.arah + '</strong></div>';
    }).join('');
    ketText.innerHTML = '<div style="margin-bottom:8px;font-weight:700;color:var(--ck);"><i class="fas fa-exclamation-triangle"></i> DITEMUKAN ' + details.length + ' BK DENGAN SELISIH:</div>' + detailLines;
    $('sap_done_all_btn').style.display = 'none';
    $('sap_lihat_detail_btn').style.display = '';
    ketBox.style.display = 'block';
  }
  $('sap_export_btn').style.display = '';
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

function renderSAPHistorySplitTables(bkId) {
  var tbB = $('sap_last_bongkar_tb');
  var tbK = $('sap_last_kirim_tb');
  if (!tbB || !tbK) return;

  var bong = (appState.history.bongkar || []).filter(function(r) { return r.BK_ID === bkId; });
  bong.sort(function(a, b) { return new Date(b.TANGGAL) - new Date(a.TANGGAL); });
  bong = bong.slice(0, 10);

  var kir = (appState.history.kirim || []).filter(function(r) { return r.BK_ID === bkId; });
  kir.sort(function(a, b) { return new Date(b.TANGGAL) - new Date(a.TANGGAL); });
  kir = kir.slice(0, 10);

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
  if (result.selisih <= 0) {
    note.textContent = '';
    return;
  }
  var gap = Math.abs(result.selisih);
  var parts = [];
  parts.push('Selisih yang perlu dijelaskan vs SAP: ' + fmtNum(gap) + ' kg.');
  parts.push(' Total terpilih kirim: ' + fmtNum(sumK) + ' kg, bongkar: ' + fmtNum(sumB) + ' kg.');
  if (gap > 0 && Math.abs(sumK - gap) <= Math.max(gap * 0.02, 1)) {
    parts.push(' Nilai kirim terpilih mendekati selisih — kemungkinan delay penarikan stok di SAP.');
  }
  note.textContent = parts.join('');
}

function sapPrefillSAPInlineForms(bkId, result) {
  $('sap_b_tanggal').value = todayStr();
  $('sap_b_bk_id').value = bkId;
  $('sap_b_operator').value = appState.user ? appState.user.nama : '';
  $('sap_b_shift').value = '1';
  $('sap_b_material').value = result.material || '';
  $('sap_b_supplier').value = '';
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
      var m = bk.MATERIAL_DEFAULT;
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
  sapState.detailBK = bkId;
  var result = sapState.compareResult.find(function(r) { return r.bkId === bkId; });
  if (!result) return;
  sapState.activeDiffResult = result;

  $('sap_step1').style.display = 'none';
  $('sap_step2').style.display = 'none';
  $('sap_step3').style.display = 'block';
  updateStepIndicator(3);

  var chipList = $('sap_bk_diff_list');
  chipList.innerHTML = '';
  sapState.compareResult.forEach(function(r) {
    var chip = document.createElement('button');
    chip.className = 'btn' + (r.bkId === bkId ? '' : ' no');
    chip.style.padding = '6px 14px';
    chip.style.fontSize = '0.8rem';
    chip.textContent = r.bkId + (r.selisih !== 0 ? ' ⚠' : ' ✓');
    chip.style.borderColor = r.selisih !== 0 ? 'var(--ck)' : 'var(--cm)';
    chip.style.color = r.selisih !== 0 ? 'var(--ck)' : 'var(--cm)';
    chip.addEventListener('click', function() { sapShowDiff(r.bkId); });
    chipList.appendChild(chip);
  });

  var sesuai = result.selisih === 0;
  var sistemLebih = result.selisih > 0;
  var sapLebih = result.selisih < 0;

  $('sap_diff_sesuai_box').style.display = sesuai ? 'block' : 'none';
  var mismatch = $('sap_diff_mismatch_wrap');
  if (mismatch) mismatch.style.display = sesuai ? 'none' : 'block';

  if (sesuai) return;

  $('sap_strip_sistem').textContent = fmtNum(result.sistem);
  $('sap_strip_sap').textContent = fmtNum(result.sap);
  $('sap_strip_gap').textContent = fmtNum(Math.abs(result.selisih));

  var hint = $('sap_strip_hint');
  var gapLbl = $('sap_strip_gap_lbl');

  var panelB = $('sap_panel_bongkar_inline');
  var panelK = $('sap_panel_kirim_inline');
  var btnMb = $('sap_btn_miss_bongkar');
  var btnMk = $('sap_btn_miss_kirim');
  var recK = $('sap_reconcile_kirim_block');
  var sumBline = $('sap_sum_line_bongkar');
  var manualW = $('sap_manual_kirim_wrap');

  if (sistemLebih) {
    if (gapLbl) gapLbl.textContent = 'Gap sistem vs SAP (kg)';
    if (hint) {
      hint.textContent =
        'Stok sistem lebih besar daripada SAP. Centang baris kirim/bongkar yang menurut Anda sudah motong SAP — jika total kirim terpilih mendekati gap, selisih bisa hanya delay SAP.';
    }
    if (recK) recK.style.display = 'block';
    if (sumBline) sumBline.style.display = 'block';
    if (btnMb) btnMb.style.display = 'none';
    if (btnMk) btnMk.style.display = 'none';
    if (manualW) manualW.style.display = 'block';
    if (panelB) panelB.style.display = 'none';
    if (panelK) panelK.style.display = 'none';
    $('sap_kirim_manual_input').value = '';
  } else if (sapLebih) {
    if (gapLbl) gapLbl.textContent = 'SAP lebih tinggi dari sistem (kg)';
    if (hint) {
      hint.textContent =
        'SAP lebih tinggi dari stok sistem. Gunakan tabel untuk audit; jika ada transaksi yang belum masuk aplikasi, buka form melalui tautan di bawah.';
    }
    if (recK) recK.style.display = 'none';
    if (sumBline) sumBline.style.display = 'none';
    if (btnMb) btnMb.style.display = 'block';
    if (btnMk) btnMk.style.display = 'block';
    if (manualW) manualW.style.display = 'none';
    if (panelB) panelB.style.display = 'none';
    if (panelK) panelK.style.display = 'none';
  }

  renderSAPHistorySplitTables(bkId);
  sapPrefillSAPInlineForms(bkId, result);
  updateSapReconcileTotals();
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
  renderSAPStep2();
}

function sapBackToInput() {
  sapState.currentIdx = 0;
  renderSAPStep1();
}

function sapDoneAll() {
  modal('Konfirmasi Export', 'Semua data sesuai. Ekspor laporan sekarang?', 'Ya', 'Batal').then(function(ok) {
    if (!ok) return;
    showExportOptions();
  });
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
  var rows = [['BK','Material','Stock Sistem (kg)','Stock SAP (kg)','Selisih (kg)','Status']];
  sapState.compareResult.forEach(function(r) {
    var status = r.selisih === 0 ? 'SESUAI' : r.selisih > 0 ? 'KURANG_SISTEM' : 'LEBIH_SISTEM';
    rows.push([r.bkId, r.material, r.sistem, r.sap, r.selisih, status]);
  });
  if (format === 'csv') {
    var csv = rows.map(function(r) { return r.join(','); }).join('\n');
    downloadFile('cek_sap_report.csv', 'text/csv', csv);
  } else if (format === 'pdf') {
    var html = '<html><head><meta charset="UTF-8"><title>Laporan Cek SAP</title><style>body{font-family:Arial,sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #333;padding:8px;}th{background:#0f172a;color:#fff;}tr:nth-child(even){background:#f8fafc;}</style></head><body><h2>Laporan Cek SAP</h2><p>Tanggal: ' + todayStr() + '</p><table>' + rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>';}).join('') + '</table></body></html>';
    var w = window.open('');
    w.document.write(html);
    w.document.close();
    w.print();
  }
  toast('Export ' + format.toUpperCase() + ' berhasil', 's');
}

function downloadFile(filename, mime, content) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function sapLihatDetail() {
  // auto-select first BK with diff
  var diffBK = sapState.compareResult.find(function(r) { return r.selisih !== 0; });
  if (diffBK) sapShowDiff(diffBK.bkId);
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
function saveBongkar() {
  var bkId = $('b_bk_id').value;
  var netto = parseFloat($('b_netto').value);
  if (!bkId) { toast('Pilih BK terlebih dahulu', 'w'); return; }
  if (!netto || netto <= 0) { toast('Netto harus lebih dari 0', 'w'); return; }
  var shift = $('b_shift').value;
  var data = {
    action: 'addBongkar',
    TANGGAL: $('b_tanggal').value,
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
    $('b_supplier').value = '';
    setTimeout(function() { loadDashboard(); }, 800);
  });
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
}

function saveOpname() {
  var bkId = $('o_bk_id').value;
  var ket = $('o_ket').value;
  if (!bkId) { toast('Pilih BK terlebih dahulu', 'w'); return; }
  var bk = getBKById(bkId);
  var sistem = bk.STOK_AKTIF ? Number(bk.STOK_AKTIF) : 0;
  var selisih = appState.opnameData ? appState.opnameData.selisih : 0;
  var penerimaan = appState.opnameData ? appState.opnameData.penerimaan : 0;
  var pengiriman = appState.opnameData ? appState.opnameData.pengiriman : 0;

  // Build ringkasan in modal body
  var selisihLabel = selisih < 0 ? 'Over Fisik' : selisih > 0 ? 'Susut' : 'Sesuai';
  var selColor = selisih < 0 ? 'var(--ck)' : selisih > 0 ? 'var(--cw)' : 'var(--cm)';
  var pct = appState.opnameData ? appState.opnameData.persentase : 0;
  var pctColor = pct < 85 ? 'var(--ck)' : pct < 95 ? 'var(--cw)' : 'var(--cm)';

  var tblHtml = '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-bottom:12px;">' +
    '<tr><td style="padding:5px;color:var(--ts);">Operator</td><td style="padding:5px;font-weight:600;">' + (appState.user ? appState.user.nama : '—') + '</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">BK</td><td style="padding:5px;font-weight:600;">' + bkId + '</td></tr>' +
    '<tr><td style="padding:5px;color:var(--ts);">Material</td><td style="padding:5px;font-weight:600;">' + ($('o_material').value || '—') + '</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">Stok Sistem</td><td style="padding:5px;font-weight:700;color:var(--cs);">' + fmtNum(sistem) + ' kg</td></tr>' +
    '<tr><td style="padding:5px;color:var(--ts);">Penerimaan</td><td style="padding:5px;font-weight:700;color:var(--cm);">' + fmtNum(penerimaan) + ' kg</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">Pengiriman</td><td style="padding:5px;font-weight:700;color:var(--ck);">' + fmtNum(pengiriman) + ' kg</td></tr>' +
    '<tr><td style="padding:5px;color:var(--ts);">Selisih (' + selisihLabel + ')</td><td style="padding:5px;font-weight:700;color:' + selColor + ';">' + fmtNum(Math.abs(selisih)) + ' kg</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:5px;color:var(--ts);">Persentase</td><td style="padding:5px;font-weight:700;color:' + pctColor + ';">' + fmtNum(pct) + '%</td></tr>' +
    '</table><div style="font-size:0.85rem;color:var(--ts);padding:8px 12px;background:#fff3cd;border-radius:6px;border:1px solid var(--cw);"><i class="fas fa-exclamation-triangle" style="color:var(--cw);"></i> Stock BK ' + bkId + ' akan di-reset sesuai hasil opname.</div>';

  modal('Konfirmasi Stock Opname', tblHtml, 'Simpan', 'Batal').then(function(ok) {
    if (!ok) return;
    var data = {
      action: 'addOpname',
      TANGGAL: $('o_tanggal').value,
      BK_ID: bkId,
      STOK_FISIK_KG: sistem,
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
  if (bk.MATERIAL_DEFAULT) $('o_material').value = bk.MATERIAL_DEFAULT;
  var sistem = bk.STOK_AKTIF ? Number(bk.STOK_AKTIF) : 0;
  $('o_stok_sistem').textContent = fmtNum(sistem) + ' kg';
  $('o_stok_sistem').style.color = sistem < 0 ? 'var(--ck)' : 'var(--ts)';

  // Hitung penerimaan dari periode SO terakhir
  var bongkarData = appState.history.bongkar.filter(function(r) { return r.BK_ID === bkId; });
  var kirimData = appState.history.kirim.filter(function(r) { return r.BK_ID === bkId; });
  var lastSO = null;
  var allOpname = appState.history.opname || [];
  allOpname.filter(function(r) { return r.BK_ID === bkId; }).forEach(function(r) {
    if (!lastSO || new Date(r.TANGGAL) > new Date(lastSO.TANGGAL)) lastSO = r;
  });
  var startDate = lastSO ? new Date(lastSO.TANGGAL) : new Date('2020-01-01');
  var endDate = new Date();
  var totalBongkar = 0, totalKirim = 0;
  bongkarData.forEach(function(r) {
    var d = new Date(r.TANGGAL);
    if (d >= startDate && d <= endDate) totalBongkar += Number(r.NETTO_KG) || 0;
  });
  kirimData.forEach(function(r) {
    var d = new Date(r.TANGGAL);
    if (d >= startDate && d <= endDate) totalKirim += Number(r.NETTO_KG) || 0;
  });
  var penerimaan = totalBongkar;
  var selisih = sistem; // sistem = fisik karena reset
  var pct = penerimaan > 0 ? (Math.abs(sistem) / penerimaan) * 100 : 0;

  $('o_penerimaan').textContent = fmtNum(penerimaan) + ' kg';
  $('o_selisih').textContent = fmtNum(Math.abs(selisih)) + ' kg';
  $('o_selisih').style.color = selisih < 0 ? 'var(--ck)' : selisih > 0 ? 'var(--cw)' : 'var(--cm)';
  $('o_persentase').textContent = fmtNum(pct) + '%';
  $('o_persentase').style.color = pct < 85 ? 'var(--ck)' : pct < 95 ? 'var(--cw)' : 'var(--cm)';

  var ketLabel = selisih < 0 ? 'Over Fisik' : selisih > 0 ? 'Susut' : 'Sesuai';
  $('o_ket').value = ketLabel;

  // Ringkasan box
  appState.opnameData = { sistem: sistem, penerimaan: penerimaan, pengiriman: totalKirim, selisih: selisih, persentase: pct };
  var ringkasan = $('o_ringkasan_box');
  ringkasan.style.display = 'block';
  $('rs_operator').textContent = appState.user ? appState.user.nama : '—';
  $('rs_tanggal').textContent = $('o_tanggal').value;
  $('rs_bk').textContent = bkId;
  $('rs_material').textContent = $('o_material').value || '—';
  $('rs_stok_sistem').textContent = fmtNum(sistem) + ' kg';
  $('rs_penerimaan').textContent = fmtNum(penerimaan) + ' kg';
  $('rs_pengiriman').textContent = fmtNum(totalKirim) + ' kg';
  var selEl = $('rs_selisih');
  selEl.textContent = fmtNum(Math.abs(selisih)) + ' kg (' + ketLabel + ')';
  selEl.style.color = selisih < 0 ? 'var(--ck)' : selisih > 0 ? 'var(--cw)' : 'var(--cm)';
  $('rs_persentase').textContent = fmtNum(pct) + '%';
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
  $('b_tanggal').value = t;
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
  document.querySelectorAll('.bnav-item').forEach(function(el) {
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
  $('btnBongkar').addEventListener('click', saveBongkar);
  $('btnKirim').addEventListener('click', saveKirim);
  $('btnOpname').addEventListener('click', saveOpname);

  // Auto-fill Bongkar BK
  $('b_bk_id').addEventListener('change', function() {
    var bk = getBKById(this.value);
    if (bk.MATERIAL_DEFAULT) $('b_material').value = bk.MATERIAL_DEFAULT;
    if (bk.SUPPLIER_DEFAULT) $('b_supplier').value = bk.SUPPLIER_DEFAULT;
  });

  // Auto-fill Kirim BK
  $('k_bk_id').addEventListener('change', function() {
    var bk = getBKById(this.value);
    if (bk.MATERIAL_DEFAULT) $('k_material').value = bk.MATERIAL_DEFAULT;
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
