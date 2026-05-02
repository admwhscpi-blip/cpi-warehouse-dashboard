// ─────────────────────────────────────────────────────────────────────
// bkk-kartustock.js  –  Kartu Stock Daily Module
// ─────────────────────────────────────────────────────────────────────

var ksState = {
  mode: 'summary',
  bk: 'BK-1',
  bulan: '',
  raw: { bongkar: [], kirim: [], opname: [] },
  loaded: false
};

var KS_BKS = ['BK-1','BK-2','BK-3','BK-4','BK-5','BK-6'];

// ── INIT ──────────────────────────────────────────────────────────────
function initKartuStock() {
  var sel = $('ks_bulan');
  if (!sel) return;

  getBulanOptions(sel);
  var now = new Date();
  var defVal = now.getFullYear() + '-' + pad2(now.getMonth() + 1);
  sel.value = defVal;
  ksState.bulan = defVal;

  ksRenderBKChips();

  document.querySelectorAll('.ks-mode-tab').forEach(function(tab) {
    var clone = tab.cloneNode(true);
    tab.parentNode.replaceChild(clone, tab);
  });
  document.querySelectorAll('.ks-mode-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      ksState.mode = tab.dataset.ksMode;
      document.querySelectorAll('.ks-mode-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var area = $('ks_bk_chips_area');
      if (area) area.style.display = ksState.mode === 'breakdown' ? 'flex' : 'none';
      renderKartuStock();
    });
  });

  sel.addEventListener('change', function() {
    ksState.bulan = sel.value;
    loadKartuStockData();
  });
}

function ksRenderBKChips() {
  var chips = $('ks_bk_chips_area');
  if (!chips) return;
  chips.innerHTML = '';
  KS_BKS.forEach(function(bk) {
    var btn = document.createElement('button');
    btn.className = 'ks-bk-chip' + (bk === ksState.bk ? ' active' : '');
    btn.textContent = bk;
    btn.addEventListener('click', function() {
      ksState.bk = bk;
      chips.querySelectorAll('.ks-bk-chip').forEach(function(c) { c.classList.remove('active'); });
      btn.classList.add('active');
      renderKartuStock();
    });
    chips.appendChild(btn);
  });
}

// ── DATA NORMALIZATION ────────────────────────────────────────────────
// Normalize BK_ID: "BK1" or "BK-1" → always "BK-1"
function ksNormBK(id) {
  return String(id || '').trim().replace(/^BK-?(\d)$/i, 'BK-$1');
}

// Normalize TANGGAL to 'YYYY-MM-DD' (WIB/UTC+7)
// GAS serializes Sheet Date as ISO UTC: "2026-04-30T17:00:00.000Z" = 2026-05-01 00:00 WIB
function ksNormalizeDate(r) {
  if (!r.TANGGAL) { r.NETTO_KG = Number(r.NETTO_KG) || 0; r.BK_ID = ksNormBK(r.BK_ID); return r; }
  var d = r.TANGGAL;
  var str;
  if (d instanceof Date) {
    var wib = new Date(d.getTime() + 7 * 3600000);
    str = wib.getUTCFullYear() + '-' + pad2(wib.getUTCMonth()+1) + '-' + pad2(wib.getUTCDate());
  } else if (typeof d === 'string') {
    if (d.indexOf('T') !== -1) {
      // ISO UTC from GAS JSON serialization — shift to WIB (+7h)
      var parsed = new Date(d);
      var wib2 = new Date(parsed.getTime() + 7 * 3600000);
      str = wib2.getUTCFullYear() + '-' + pad2(wib2.getUTCMonth()+1) + '-' + pad2(wib2.getUTCDate());
    } else if (d.indexOf('/') !== -1) {
      var parts = d.split('/');
      str = parts[2] + '-' + pad2(parts[0]) + '-' + pad2(parts[1]);
    } else {
      str = d.substring(0, 10);
    }
  } else {
    str = String(d).substring(0, 10);
  }
  r.TANGGAL = str;
  r.BK_ID = ksNormBK(r.BK_ID);
  r.NETTO_KG = Number(r.NETTO_KG) || 0;
  return r;
}

// ── DATA LOADING ──────────────────────────────────────────────────────
function loadKartuStockData() {
  showLoader(true);
  var done = 0;
  function check() {
    done++;
    if (done === 3) {
      ksState.loaded = true;
      showLoader(false);
      if (appState.dashData && appState.dashData.length) {
        dashApplyLedgerStockFromHistory(ksState.raw.bongkar, ksState.raw.kirim, ksState.raw.opname);
      }
      renderKSKPIs();
      renderKartuStock();
    }
  }
  fetchAPI('getBongkarHistory', { limit: 4000 }, function(resp) {
    var raw = (resp.status !== 'error') ? (resp.data || []) : [];
    ksState.raw.bongkar = raw.map(ksNormalizeDate);
    check();
  });
  fetchAPI('getKirimHistory', { limit: 4000 }, function(resp) {
    var raw = (resp.status !== 'error') ? (resp.data || []) : [];
    ksState.raw.kirim = raw.map(ksNormalizeDate);
    check();
  });
  fetchAPI('getOpnameHistory', { limit: 800 }, function(resp) {
    var raw = (resp.status !== 'error') ? (resp.data || []) : [];
    ksState.raw.opname = raw.map(ksNormalizeDate);
    check();
  });
}

// ── DATE UTILITIES ────────────────────────────────────────────────────
function ksGetDates() {
  var bulan = ksState.bulan;
  if (!bulan) return [];
  var parts = bulan.split('-');
  var yr = parseInt(parts[0]);
  var mo = parseInt(parts[1]) - 1;
  var now = new Date();
  var isCurrentMonth = (yr === now.getFullYear() && mo === now.getMonth());
  var days = isCurrentMonth ? now.getDate() : new Date(yr, mo + 1, 0).getDate();
  var dates = [];
  for (var d = 1; d <= days; d++) {
    dates.push(yr + '-' + pad2(mo + 1) + '-' + pad2(d));
  }
  if (isCurrentMonth) dates.reverse(); // today at top
  return dates;
}

// ── STOCK COMPUTATION ─────────────────────────────────────────────────
// ascDates: YYYY-MM-DD strings sorted ascending (oldest first)
// Returns map: { 'YYYY-MM-DD': { b1,b2,b3,u1,u2,u3,tb,tu,hasOpname,opnameQty,selisih,persen,userSO,stock } }
function ksComputeStock(bkId, ascDates) {
  if (!ascDates.length) return {};

  var firstDate = ascDates[0];

  // Find last opname BEFORE the start of this period → initial stock baseline
  var lastOp = null;
  ksState.raw.opname.forEach(function(r) {
    if (r.BK_ID !== bkId) return;
    if (r.TANGGAL < firstDate) {
      if (!lastOp || r.TANGGAL > lastOp.TANGGAL) lastOp = r;
    }
  });

  var prevStock = 0;
  if (lastOp) {
    prevStock = Number(lastOp.STOK_FISIK_KG) || 0;
    // Forward-compute from lastOp.TANGGAL up to (but not including) firstDate
    ksState.raw.bongkar.forEach(function(r) {
      if (r.BK_ID === bkId && r.TANGGAL > lastOp.TANGGAL && r.TANGGAL < firstDate)
        prevStock += r.NETTO_KG;
    });
    ksState.raw.kirim.forEach(function(r) {
      if (r.BK_ID === bkId && r.TANGGAL > lastOp.TANGGAL && r.TANGGAL < firstDate)
        prevStock -= r.NETTO_KG;
    });
  } else {
    // No opname ever — fall back to current live stock
    var live = (appState.dashData || []).find(function(b) { return b.BK_ID === bkId; });
    prevStock = live ? (Number(live.STOK_AKTIF) || 0) : 0;
  }

  var result = {};
  ascDates.forEach(function(ds) {
    // Bongkar per shift (BKK_Bongkar may or may not have SHIFT column)
    var b1=0, b2=0, b3=0;
    ksState.raw.bongkar.forEach(function(r) {
      if (r.BK_ID !== bkId || r.TANGGAL !== ds) return;
      var s = String(r.SHIFT || '').trim();
      if (s === '2') b2 += r.NETTO_KG;
      else if (s === '3') b3 += r.NETTO_KG;
      else b1 += r.NETTO_KG; // shift 1 or no shift
    });

    // Usage per shift
    var u1=0, u2=0, u3=0;
    ksState.raw.kirim.forEach(function(r) {
      if (r.BK_ID !== bkId || r.TANGGAL !== ds) return;
      var s = String(r.SHIFT || '').trim();
      if (s === '2') u2 += r.NETTO_KG;
      else if (s === '3') u3 += r.NETTO_KG;
      else u1 += r.NETTO_KG;
    });

    var tb = b1+b2+b3, tu = u1+u2+u3;

    var opRec = ksState.raw.opname.find(function(r) {
      return r.BK_ID === bkId && r.TANGGAL === ds;
    });

    var stock;
    if (opRec) {
      stock = Number(opRec.STOK_FISIK_KG) || 0;
      var sel = stock - (prevStock + tb - tu);
      var pct = (prevStock + tb) > 0 ? (stock / (prevStock + tb)) * 100 : 0;
      result[ds] = { b1:b1,b2:b2,b3:b3,u1:u1,u2:u2,u3:u3,tb:tb,tu:tu,
        hasOpname:true,opnameQty:stock,selisih:sel,persen:pct,
        userSO:opRec.INPUT_BY||'—',stock:stock };
      prevStock = stock;
    } else {
      stock = prevStock + tb - tu;
      result[ds] = { b1:b1,b2:b2,b3:b3,u1:u1,u2:u2,u3:u3,tb:tb,tu:tu,
        hasOpname:false,opnameQty:null,selisih:null,persen:null,userSO:null,stock:stock };
      prevStock = stock;
    }
  });
  return result;
}

// ── RENDER DISPATCH ───────────────────────────────────────────────────
function renderKartuStock() {
  if (!ksState.loaded) return;
  if (ksState.mode === 'summary') renderKSSummary();
  else renderKSBreakdown();
}

// ── RENDER SUMMARY ────────────────────────────────────────────────────
function renderKSSummary() {
  var dates = ksGetDates();
  if (!dates.length) {
    $('ks_tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b">Pilih bulan terlebih dahulu</td></tr>';
    return;
  }

  var ascDates = dates.slice().sort();
  var allData = {};
  KS_BKS.forEach(function(bk) { allData[bk] = ksComputeStock(bk, ascDates); });

  $('ks_thead').innerHTML = '<tr>' +
    '<th class="ks-th-date ks-sticky-col">Tanggal</th>' +
    KS_BKS.map(function(bk) { return '<th class="ks-th-bk">' + bk + '</th>'; }).join('') +
    '</tr>';

  var tbody = $('ks_tbody');
  tbody.innerHTML = '';
  var today = todayStr();

  dates.forEach(function(d) {
    var tr = document.createElement('tr');
    tr.className = d === today ? 'ks-row-today' : '';
    var cells = '<td class="ks-td-date ks-sticky-col">' +
      (d === today ? '<span class="ks-today-badge">HARI INI</span>' : '') +
      '<span class="ks-date-txt">' + fmtDate(d) + '</span></td>';
    KS_BKS.forEach(function(bk) {
      var day = allData[bk][d] || {};
      var s = day.stock;
      var cls = s == null ? 'ks-empty' : s < 0 ? 'ks-neg' : s === 0 ? 'ks-zero' : '';
      var badge = day.hasOpname ? '<span class="ks-so-dot">SO</span>' : '';
      cells += '<td class="ks-td-stock ' + cls + '">' + (s != null ? fmtNum(s) : '—') + badge + '</td>';
    });
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

// ── RENDER BREAKDOWN ─────────────────────────────────────────────────
function renderKSBreakdown() {
  var bkId = ksState.bk;
  var dates = ksGetDates();
  if (!dates.length) return;

  var ascDates = dates.slice().sort();
  var data = ksComputeStock(bkId, ascDates);
  var today = todayStr();

  $('ks_thead').innerHTML =
    '<tr>' +
    '<th class="ks-th-date ks-sticky-col" rowspan="2">Tanggal</th>' +
    '<th class="ks-th-group-b" colspan="3">Bongkar (kg)</th>' +
    '<th class="ks-th-group-u" colspan="3">Usage (kg)</th>' +
    '<th class="ks-th-group-so" colspan="5">Stock Opname</th>' +
    '<th class="ks-th-akhir" rowspan="2">Stock Akhir</th>' +
    '</tr>' +
    '<tr>' +
    '<th class="ks-th-s ks-b">S1</th><th class="ks-th-s ks-b">S2</th><th class="ks-th-s ks-b">S3</th>' +
    '<th class="ks-th-s ks-u">S1</th><th class="ks-th-s ks-u">S2</th><th class="ks-th-s ks-u">S3</th>' +
    '<th class="ks-th-s ks-so">Ada</th><th class="ks-th-s ks-so">Qty SO</th><th class="ks-th-s ks-so">Selisih</th><th class="ks-th-s ks-so">%</th><th class="ks-th-s ks-so">User SO</th>' +
    '</tr>';

  var tbody = $('ks_tbody');
  tbody.innerHTML = '';

  dates.forEach(function(d) {
    var day = data[d] || {};
    var isToday = d === today;
    var tr = document.createElement('tr');
    tr.className = isToday ? 'ks-row-today' : day.hasOpname ? 'ks-row-opname' : '';

    var selCls = day.selisih == null ? '' : day.selisih < 0 ? 'ks-neg' : day.selisih > 0 ? 'ks-warn' : 'ks-pos';
    var n = function(v) { return v ? fmtNum(v) : '<span class="ks-dash">—</span>'; };

    tr.innerHTML =
      '<td class="ks-td-date ks-sticky-col">' +
        (isToday ? '<span class="ks-today-badge">TODAY</span>' : '') +
        '<span class="ks-date-txt">' + fmtDate(d) + '</span></td>' +
      '<td class="ks-td-num ks-c-b">' + n(day.b1) + '</td>' +
      '<td class="ks-td-num ks-c-b">' + n(day.b2) + '</td>' +
      '<td class="ks-td-num ks-c-b">' + n(day.b3) + '</td>' +
      '<td class="ks-td-num ks-c-u">' + n(day.u1) + '</td>' +
      '<td class="ks-td-num ks-c-u">' + n(day.u2) + '</td>' +
      '<td class="ks-td-num ks-c-u">' + n(day.u3) + '</td>' +
      '<td class="ks-td-center">' + (day.hasOpname ? '<span class="ks-so-yes">✓</span>' : '<span class="ks-dash">—</span>') + '</td>' +
      '<td class="ks-td-num ks-c-so">' + (day.opnameQty != null ? fmtNum(day.opnameQty) : '<span class="ks-dash">—</span>') + '</td>' +
      '<td class="ks-td-num ' + selCls + '">' + (day.selisih != null ? fmtNum(Math.abs(day.selisih)) : '<span class="ks-dash">—</span>') + '</td>' +
      '<td class="ks-td-num ' + selCls + '">' + (day.persen != null ? fmtNum(day.persen) + '%' : '<span class="ks-dash">—</span>') + '</td>' +
      '<td class="ks-td-user">' + (day.userSO || '<span class="ks-dash">—</span>') + '</td>' +
      '<td class="ks-td-stock-end ' + (day.stock < 0 ? 'ks-neg' : '') + '">' + fmtNum(day.stock) + '</td>';

    tbody.appendChild(tr);
  });
}

/** Tanggal baris acuan KPI = baris atas tabel (hari ini jika bulan berjalan dipilih), atau tanggal terakhir bulan jika bukan. */
function ksKpiReferenceDateKey() {
  var dates = ksGetDates();
  if (!dates.length) return '';
  var parts = (ksState.bulan || '').split('-');
  if (parts.length < 2) return dates[0];
  var yr = parseInt(parts[0], 10);
  var mo = parseInt(parts[1], 10);
  var refWib = typeof todayYMD_WIB === 'function' ? todayYMD_WIB() : todayStr();
  var rw = refWib.split('-');
  var rY = parseInt(rw[0], 10);
  var rM = parseInt(rw[1], 10);
  var isSelectedCurrentMonth = rY === yr && rM === mo;
  if (isSelectedCurrentMonth) return dates[0];
  return dates[dates.length - 1];
}

/** Stok ledger di tanggal acuan — sama dengan kolom Stock Akhir pada baris acuan tabel Kartu Stock. */
function ksLedgerStockAtKpiDate(bkId) {
  var dates = ksGetDates();
  if (!dates.length) return null;
  var ascDates = dates.slice().sort();
  var refKey = ksKpiReferenceDateKey();
  if (!refKey) return null;
  var map = ksComputeStock(bkId, ascDates);
  var cell = map[refKey];
  if (!cell || cell.stock == null || isNaN(Number(cell.stock))) return null;
  return Number(cell.stock);
}

// ── SAMA DENGAN TABEL (ledger) — override STOK_AKTIF agar selaras ksComputeStock ──
/**
 * Pakai stok dari ksComputeStock untuk appState.dashData. Tanggal acuan = ksKpiReferenceDateKey (WIB).
 */
function dashApplyLedgerStockFromHistory(bongkarRows, kirimRows, opnameRows) {
  if (!appState.dashData || !appState.dashData.length) return;
  function normRows(rows) {
    return (rows || []).map(function(r) {
      return ksNormalizeDate(Object.assign({}, r));
    });
  }
  var savedB = ksState.raw.bongkar;
  var savedK = ksState.raw.kirim;
  var savedO = ksState.raw.opname;
  var savedBulan = ksState.bulan;

  ksState.raw.bongkar = normRows(bongkarRows);
  ksState.raw.kirim = normRows(kirimRows);
  ksState.raw.opname = normRows(opnameRows);

  var now = new Date();
  ksState.bulan = now.getFullYear() + '-' + pad2(now.getMonth() + 1);

  var dates = ksGetDates();
  var ascDates = dates.length ? dates.slice().sort() : [];
  var refKey = ksKpiReferenceDateKey();

  if (ascDates.length && refKey) {
    appState.dashData.forEach(function(bk) {
      var map = ksComputeStock(bk.BK_ID, ascDates);
      var cell = map[refKey];
      if (cell && cell.stock != null && !isNaN(Number(cell.stock))) {
        bk.STOK_AKTIF = cell.stock;
      }
    });
  }

  ksState.raw.bongkar = savedB;
  ksState.raw.kirim = savedK;
  ksState.raw.opname = savedO;
  ksState.bulan = savedBulan;
}

// ── KPIs ──────────────────────────────────────────────────────────────
function renderKSKPIs() {
  var kpiRow = $('ks_kpi_row');
  if (!kpiRow) return;
  var rows = appState.dashData || [];
  var totalStock = 0;
  rows.forEach(function(bk) {
    var led = ksLedgerStockAtKpiDate(bk.BK_ID);
    totalStock += led != null ? led : Number(bk.STOK_AKTIF) || 0;
  });
  var heroEl = $('ks_total_stock');
  if (heroEl) heroEl.textContent = fmtNum(totalStock);

  kpiRow.innerHTML = '';
  rows.forEach(function(bk) {
    var led = ksLedgerStockAtKpiDate(bk.BK_ID);
    var stok = led != null ? led : Number(bk.STOK_AKTIF) || 0;
    var pct = bk.KAPASITAS_KG ? Math.min((stok / Number(bk.KAPASITAS_KG)) * 100, 100) : 0;
    var hi = pct > 85 ? 'hi' : pct > 60 ? 'mi' : 'lo';
    var c = document.createElement('div');
    c.className = 'ks-kpi-card ks-kpi-' + hi;
    c.innerHTML =
      '<div class="ks-kpi-label">' + bk.BK_ID + '</div>' +
      '<div class="ks-kpi-val">' + fmtNum(stok) + '</div>' +
      '<div class="ks-kpi-unit">kg</div>' +
      '<div class="ks-kpi-bar"><div class="ks-kpi-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="ks-kpi-pct">' + pct.toFixed(1) + '%</div>';
    kpiRow.appendChild(c);
  });
}
