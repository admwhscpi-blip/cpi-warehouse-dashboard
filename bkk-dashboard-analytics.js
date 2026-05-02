// KPI, material volume, inventory table. Depends: $, appState, fmtNum, pbarClass, ageClass, animateCounter
function ksEscapeHtml(str) {
  if (str == null) return '';
  var d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function aggregateMaterialVolume(data) {
  var map = {};
  (data || []).forEach(function(bk) {
    var st = Number(bk.STOK_AKTIF) || 0;
    if (st <= 0) return;
    var mat = (bk.MATERIAL_DEFAULT || '').trim();
    if (!mat) mat = '(Tanpa nama)';
    if (!map[mat]) map[mat] = { stock: 0, bkCount: 0 };
    map[mat].stock += st;
    map[mat].bkCount += 1;
  });
  var rows = Object.keys(map).map(function(k) {
    return { material: k, stock: map[k].stock, bkCount: map[k].bkCount };
  });
  rows.sort(function(a, b) { return b.stock - a.stock; });
  var total = rows.reduce(function(s, r) { return s + r.stock; }, 0);
  rows.forEach(function(r) {
    r.pct = total > 0 ? (r.stock / total) * 100 : 0;
  });
  return rows;
}

function renderKPIs() {
  var data = appState.dashData;
  var totalStok = 0;
  data.forEach(function(bk) {
    totalStok += Number(bk.STOK_AKTIF) || 0;
  });
  var todayMv = appState.dashKpiToday || { masuk: 0, keluar: 0 };
  var kpis = [
    { label: 'Total Stok', value: totalStok, sub: 'kg di seluruh BK', type: 'stok', icon: 'fa-cubes' },
    { label: 'Total Masuk', value: Number(todayMv.masuk) || 0, sub: 'kg Bongkar hari ini (WIB)', type: 'masuk', icon: 'fa-truck-loading' },
    { label: 'Total Keluar', value: Number(todayMv.keluar) || 0, sub: 'kg Kirim hari ini (WIB)', type: 'keluar', icon: 'fa-paper-plane' }
  ];
  var grid = $('kpiGrid');
  if (!grid) return;
  grid.classList.add('kpi-grid--dash3');
  grid.innerHTML = '';
  kpis.forEach(function(k, idx) {
    var div = document.createElement('div');
    div.className = 'kpi-card kpi-card--glass ' + k.type;
    div.style.animationDelay = (idx * 0.08) + 's';
    div.innerHTML =
      '<div class="kpi-card-shine"></div>' +
      '<i class="fas ' + k.icon + ' kpi-icon"></i>' +
      '<div class="kpi-label">' + k.label + '</div>' +
      '<div class="kpi-value" data-target="' + k.value + '">0</div>' +
      '<div class="kpi-sub">' + k.sub + '</div>';
    grid.appendChild(div);
    animateCounter(div.querySelector('.kpi-value'), k.value);
  });
}

function renderMaterialVolumeTable() {
  var tb = $('tblMaterialVolume');
  var emptyEl = $('materialVolumeEmpty');
  var wrap = $('materialVolumeWrap');
  if (!tb) return;
  if (!appState.dashData || !appState.dashData.length) {
    tb.innerHTML = '';
    if (emptyEl) { emptyEl.hidden = false; }
    if (wrap) wrap.style.display = 'none';
    return;
  }
  var rows = aggregateMaterialVolume(appState.dashData);
  tb.innerHTML = '';
  if (!rows.length) {
    if (emptyEl) { emptyEl.hidden = false; }
    if (wrap) wrap.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  if (wrap) wrap.style.display = '';
  rows.forEach(function(r, i) {
    var tr = document.createElement('tr');
    tr.style.animationDelay = (i * 0.04) + 's';
    tr.className = 'mat-vol-row';
    tr.innerHTML =
      '<td class="mat-name-cell">' + ksEscapeHtml(r.material) + '</td>' +
      '<td class="col-num">' + r.bkCount + '</td>' +
      '<td class="col-num cm">' + fmtNum(r.stock) + '</td>' +
      '<td class="col-pct"><div class="mat-pct-bar"><span style="width:' + Math.min(r.pct, 100) + '%"></span></div><span class="mat-pct-txt">' + fmtNum(r.pct) + '%</span></td>';
    tb.appendChild(tr);
  });
}

function renderInventoryTable() {
  var tbl = $('tblInv');
  if (!tbl) return;
  tbl.innerHTML = '';
  appState.dashData.forEach(function(bk) {
    var pct = bk.KAPASITAS_KG ? (Number(bk.STOK_AKTIF) / Number(bk.KAPASITAS_KG)) * 100 : 0;
    var ac = ageClass(bk.AGE_DAYS);
    var pcls = pbarClass(pct);
    var tr = document.createElement('tr');
    tr.className = 'dinv-row';
    tr.innerHTML =
      '<td class="dinv-bk"><span class="dinv-bk-pill">' + bk.BK_ID + '</span></td>' +
      '<td>' + (bk.NAMA_BK || '—') + '</td>' +
      '<td class="dinv-mat">' + (bk.MATERIAL_DEFAULT || '—') + '</td>' +
      '<td class="num cm">' + fmtNum(bk.STOK_AKTIF) + '</td>' +
      '<td class="num">' + fmtNum(bk.KAPASITAS_KG) + '</td>' +
      '<td class="dinv-util"><div class="dinv-pbar"><div class="dinv-pbar-fill ' + pcls + '" style="width:' + Math.min(pct, 100) + '%"></div></div><span class="dinv-pct">' + fmtNum(pct) + '%</span></td>' +
      '<td class="dinv-age"><span class="dinv-age-badge ' + ac + '">' + (bk.AGE_DAYS || 0) + ' h</span></td>';
    tbl.appendChild(tr);
  });
}
