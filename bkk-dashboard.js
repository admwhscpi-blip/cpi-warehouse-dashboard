// Dashboard orchestration — detail KPI/Kartu/Tabel/Chart di file terpisah.
function loadDashboard(doneCb) {
  showLoader(true);
  fetchAPI('getBKKDashboard', {}, function(resp) {
    showLoader(false);
    if (resp.status === 'error') { toast('Gagal load dashboard: ' + resp.message, 'e'); if (doneCb) doneCb(false); return; }
    var raw = resp.data || [];
    appState.dashData = raw.map(function(bk) {
      var id = bk.BK_ID || '';
      if (!/^BK-\d$/.test(id)) {
        var m = id.match(/^BK(\d)$/i);
        if (m) bk.BK_ID = 'BK-' + m[1];
      }
      return bk;
    });
    renderDashboard();
    populateBKDropdowns();
    if (doneCb) doneCb(true);
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
  function tick() {
    var elapsed = Date.now() - start;
    var progress = Math.min(elapsed / dur, 1);
    var e = 1 - Math.pow(1 - progress, 4);
    var val = e * target;
    el.textContent = fmtNum(Math.floor(val));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function startRefresh() {
  stopRefresh();
  appState.refreshTimer = setInterval(function() {
    if (appState.currentPage === 'dashboard') loadDashboard();
  }, CONFIG.REFRESH_MS);
}

function stopRefresh() {
  if (appState.refreshTimer) { clearInterval(appState.refreshTimer); appState.refreshTimer = null; }
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
  var ids = ['b_bk_id', 'k_bk_id', 'o_bk_id', 'h_bk_bongkar', 'h_bk_kirim', 'h_bk_opname'];
  var mats = ['b_material', 'k_material', 'o_material'];

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
      else if (page === 'dashboard') navigateTo('dashboard');
    });
  });

  var mt = $('mobileToggle');
  if (mt) mt.addEventListener('click', function() { openSidebar(); });
});
