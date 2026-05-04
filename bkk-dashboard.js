// Dashboard orchestration — detail KPI/Kartu/Tabel/Chart di file terpisah.

/** Samakan logika tanggal dengan Kartu Stock / sheet GAS (ISO UTC → kalender WIB). */
function dashDateToYMD(d) {
  if (d == null || d === '') return '';
  if (typeof d === 'object' && d instanceof Date) {
    var wib = new Date(d.getTime() + 7 * 3600000);
    return wib.getUTCFullYear() + '-' + pad2(wib.getUTCMonth() + 1) + '-' + pad2(wib.getUTCDate());
  }
  if (typeof d === 'string') {
    if (d.indexOf('T') !== -1) {
      var parsed = new Date(d);
      var wib2 = new Date(parsed.getTime() + 7 * 3600000);
      return wib2.getUTCFullYear() + '-' + pad2(wib2.getUTCMonth() + 1) + '-' + pad2(wib2.getUTCDate());
    }
    if (d.indexOf('/') !== -1) {
      var parts = d.split('/');
      return parts[2] + '-' + pad2(parts[0]) + '-' + pad2(parts[1]);
    }
    return d.substring(0, 10);
  }
  return String(d).substring(0, 10);
}

function todayYMD_WIB() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  } catch (e) {
    return todayStr();
  }
}

/** Umur absolut (hari): kalender WIB hari ini − tanggal AWAL ISI (YYYY-MM-DD dari API). */
function bkUmurAbsolutHari(awalYmd) {
  if (!awalYmd || typeof awalYmd !== 'string') return 0;
  var ymd = awalYmd.trim().substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 0;
  var aw = ymd.split('-');
  var awMs = Date.UTC(Number(aw[0]), Number(aw[1]) - 1, Number(aw[2]));
  var todayStr = typeof todayYMD_WIB === 'function' ? todayYMD_WIB() : '';
  if (!todayStr || !/^\d{4}-\d{2}-\d{2}/.test(todayStr)) return 0;
  var th = todayStr.substring(0, 10).split('-');
  var thMs = Date.UTC(Number(th[0]), Number(th[1]) - 1, Number(th[2]));
  var diff = Math.floor((thMs - awMs) / 86400000);
  return diff < 0 ? 0 : diff;
}

function loadDashboard(doneCb) {
  showLoader(true);
  fetchAPI('getBKKDashboard', {}, function(resp) {
    if (resp.status === 'error') {
      showLoader(false);
      toast('Gagal load dashboard: ' + resp.message, 'e');
      if (doneCb) doneCb(false);
      return;
    }
    var raw = resp.data || [];
    appState.dashData = raw.map(function(bk) {
      var id = String(bk.BK_ID == null ? '' : bk.BK_ID).trim();
      // Hanya alias legacy satu digit: BK1 / bk-1 → BK-1. Jangan ubah BK1b, BK-10, BK1B, dll.
      if (/^BK-?\d$/i.test(id)) {
        bk.BK_ID = 'BK-' + id.replace(/^BK-?/i, '');
      }
      return bk;
    });

    var rowsB = [];
    var rowsK = [];
    var rowsO = [];
    var pending = 3;
    var masuk = 0;
    var keluar = 0;
    var day = todayYMD_WIB();

    function finishHistory() {
      pending--;
      if (pending > 0) return;
      appState.dashKpiToday = { masuk: masuk, keluar: keluar };
      if (typeof dashApplyLedgerStockFromHistory === 'function') {
        dashApplyLedgerStockFromHistory(rowsB, rowsK, rowsO);
      }
      showLoader(false);
      renderDashboard();
      populateBKDropdowns();
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          if (typeof resizeDashboardCharts === 'function') resizeDashboardCharts();
        });
      });
      if (doneCb) doneCb(true);
    }

    fetchAPI('getBongkarHistory', { limit: 4000 }, function(r1) {
      if (r1.status !== 'error') {
        rowsB = r1.data || [];
        rowsB.forEach(function(row) {
          if (row.STATUS_ROW === 'pending_final') return;
          if (dashDateToYMD(row.TANGGAL) === day) masuk += Number(row.NETTO_KG) || 0;
        });
      }
      finishHistory();
    });
    fetchAPI('getKirimHistory', { limit: 4000 }, function(r2) {
      if (r2.status !== 'error') {
        rowsK = r2.data || [];
        rowsK.forEach(function(row) {
          if (dashDateToYMD(row.TANGGAL) === day) keluar += Number(row.NETTO_KG) || 0;
        });
      }
      finishHistory();
    });
    fetchAPI('getOpnameHistory', { limit: 800 }, function(r3) {
      if (r3.status !== 'error') rowsO = r3.data || [];
      finishHistory();
    });
  });
}

function renderDashboard() {
  renderKPIs();
  renderBKCards();
  renderInventoryTable();
  renderCharts();
  renderMaterialVolumeTable();
  initBKGaugeObservers();
}

function animateCounter(el, target) {
  if (!el) return;
  var dur = 1200;
  var start = Date.now();
  var tgt = Number(target) || 0;
  function tick() {
    var elapsed = Date.now() - start;
    var progress = Math.min(elapsed / dur, 1);
    var e = 1 - Math.pow(1 - progress, 4);
    var val = e * tgt;
    el.textContent = fmtNum(val);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = fmtNum(tgt);
    }
  }
  requestAnimationFrame(tick);
}

function initClockWidget() {
  function update() {
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    var dayNames = ['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
    var monthNames = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGU','SEP','OKT','NOV','DES'];

    var wd = $('widget-day');
    var wdate = $('widget-date');
    var wtime = $('widget-time');
    var wampm = $('widget-ampm');
    var wprog = $('widget-sec-progress');

    if (wd) wd.textContent = dayNames[now.getDay()];
    if (wdate) wdate.textContent = pad2(now.getDate()) + ' ' + monthNames[now.getMonth()];
    if (wtime) wtime.textContent = pad2(h12) + ':' + pad2(m);
    if (wampm) wampm.textContent = ampm;
    if (wprog) wprog.style.transform = 'rotate(' + (s * 6) + 'deg)';
  }
  update();
  setInterval(update, 1000);
}

function populateBKDropdowns() {
  var ids = ['b_bk_id', 'bw_bk_id', 'k_bk_id', 'o_bk_id', 'h_bk_bongkar', 'h_bk_kirim', 'h_bk_opname'];
  var mats = ['b_material', 'bw_material', 'k_material', 'o_material'];

  var bkOptions = '<option value="">— Pilih BK —</option>';
  appState.dashData.forEach(function(bk) {
    bkOptions += '<option value="' + bk.BK_ID + '">' + bk.BK_ID + ' (' + (bk.NAMA_BK || 'No Name') + ')</option>';
  });

  ids.forEach(function(id) {
    var el = $(id);
    if (el) {
      var current = el.value;
      el.innerHTML = bkOptions;
      if (current) el.value = current;
    }
  });

  var materials = [];
  appState.dashData.forEach(function(bk) {
    if (bk.MATERIAL_DEFAULT && materials.indexOf(bk.MATERIAL_DEFAULT) === -1) {
      materials.push(bk.MATERIAL_DEFAULT);
    }
  });

  var matOptions = '<option value="">— Pilih —</option>';
  materials.sort().forEach(function(m) {
    matOptions += '<option value="' + m + '">' + m + '</option>';
  });

  mats.forEach(function(id) {
    var el = $(id);
    if (el) {
      var current = el.value;
      el.innerHTML = matOptions;
      if (current) el.value = current;
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  initClockWidget();

  document.querySelectorAll('.view-toggle-bar .view-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var page = this.getAttribute('data-page');
      document.querySelectorAll('.view-toggle-bar .view-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      if (page === 'kartustock') navigateTo('kartustock');
      else if (page === 'outstanding') navigateTo('outstanding');
      else if (page === 'durbreakdown') navigateTo('durbreakdown');
      else if (page === 'dashboard') navigateTo('dashboard');
    });
  });

  var mt = $('mobileToggle');
  if (mt) mt.addEventListener('click', function() { openSidebar(); });
});
