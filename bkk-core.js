// ── APP STATE ──────────────────────────────────────────────────────────────
var appState = {
  user: null,
  dashData: [],
  bkList: [],
  sapData: [],
  history: { bongkar: [], kirim: [], opname: [] },
  sidebarOpen: false,
  currentPage: 'dashboard',
  modalResolve: null,
  refreshTimer: null,
  opnameData: null
};

// ── UTILITIES ──────────────────────────────────────────────────────────────
function $ (id) { return document.getElementById(id); }

function getBKById(id) {
  return appState.dashData.find(function(bk) { return bk.BK_ID === id; }) || {};
}

function toast(msg, type) {
  type = type || 's';
  var icons = { s: 'fa-check-circle', e: 'fa-exclamation-circle', w: 'fa-exclamation-triangle', i: 'fa-info-circle' };
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<i class="fas ' + (icons[type] || icons.i) + '"></i> ' + msg;
  $('toastContainer').appendChild(t);
  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transform = 'translateX(24px)';
    setTimeout(function() { t.parentNode && t.parentNode.removeChild(t); }, 300);
  }, 3000);
}

function modal(title, body, yesLabel, noLabel) {
  return new Promise(function(resolve) {
    $('modalTitle').textContent = title;
    $('modalBody').textContent = body;
    $('modalYes').textContent = yesLabel || 'Ya';
    $('modalNo').textContent = noLabel || 'Batal';
    $('modal').classList.add('active');
    appState.modalResolve = resolve;
  });
}

// Wrap event listeners in DOMContentLoaded to ensure elements exist
document.addEventListener('DOMContentLoaded', function() {
  var mYes = $('modalYes');
  if (mYes) {
    mYes.addEventListener('click', function() {
      $('modal').classList.remove('active');
      if (appState.modalResolve) { appState.modalResolve(true); }
      appState.modalResolve = null;
    });
  }

  var mNo = $('modalNo');
  if (mNo) {
    mNo.addEventListener('click', function() {
      $('modal').classList.remove('active');
      if (appState.modalResolve) { appState.modalResolve(false); }
      appState.modalResolve = null;
    });
  }
});

function showLoader(on) {
  var el = $('loaderOverlay');
  if (on) { el.classList.add('active'); }
  else { el.classList.remove('active'); }
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayStr() {
  var d = new Date();
  var p = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

function pad2(n) { return String(n).padStart(2, '0'); }

function pbarClass(pct) {
  if (pct == null) return 'lo';
  return pct > 85 ? 'hi' : pct > 60 ? 'mi' : 'lo';
}

function ageClass(days) {
  if (days == null) return '';
  return days > 14 ? 'ck' : days > 7 ? 'cw' : 'cm';
}

function clearTbody(id) {
  var el = $(id);
  if (el) el.innerHTML = '';
}

function renderPagination(pgId, page, totalPages, onPage) {
  var pg = $(pgId);
  if (!pg) return;
  pg.innerHTML = '';
  if (totalPages <= 1) return;
  function btn(label, p, dis) {
    var b = document.createElement('button');
    b.textContent = label;
    b.disabled = !!dis;
    if (!dis) b.addEventListener('click', function() { onPage(p); });
    pg.appendChild(b);
  }
  btn('«', 1, page === 1);
  btn('‹', page - 1, page === 1);
  for (var i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    var b = document.createElement('button');
    b.textContent = i;
    if (i === page) b.style.fontWeight = '700';
    else (function(idx) { b.addEventListener('click', function() { onPage(idx); }); })(i);
    pg.appendChild(b);
  }
  btn('›', page + 1, page === totalPages);
  btn('»', totalPages, page === totalPages);
}

function getBulanOptions(selectEl) {
  selectEl.innerHTML = '<option value="">Semua</option>';
  var now = new Date();
  for (var i = 0; i < 12; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var opt = document.createElement('option');
    opt.value = d.getFullYear() + '-' + pad2(d.getMonth()+1);
    opt.textContent = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    selectEl.appendChild(opt);
  }
}

// ── JSONP API ──────────────────────────────────────────────────────────────
function fetchAPI(action, params, cb) {
  params = params || {};
  params.callback = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 99999);
  params.action = action;
  var url = CONFIG.SCRIPT_URL + '?' + Object.keys(params).map(function(k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var s = document.createElement('script');
  s.id = 'fetchScr';
  var cleanup = function() {
    var el = $('fetchScr');
    if (el) el.remove();
    delete window[params.callback];
  };
  window[params.callback] = function(data) {
    cleanup();
    cb(data);
  };
  s.onerror = function() {
    cleanup();
    cb({ status: 'error', message: 'Gagal koneksi ke server' });
  };
  s.src = url;
  document.head.appendChild(s);
  setTimeout(function() {
    if ($('fetchScr')) cleanup();
  }, 15000);
}

function postAPI(action, data, cb) {
  data = data || {};
  data.action = action;
  data.callback = 'pcb_' + Date.now() + '_' + Math.floor(Math.random() * 99999);
  var url = CONFIG.SCRIPT_URL + '?' + Object.keys(data).map(function(k) {
    return k + '=' + encodeURIComponent(data[k]);
  }).join('&');
  var s = document.createElement('script');
  s.id = 'postScr';
  window[data.callback] = function(resp) {
    var el = $('postScr');
    if (el) el.remove();
    delete window[data.callback];
    cb(resp);
  };
  s.onerror = function() {
    var el = $('postScr');
    if (el) el.remove();
    cb({ status: 'error', message: 'Gagal mengirim data' });
  };
  s.src = url;
  document.head.appendChild(s);
  setTimeout(function() {
    if ($('postScr')) { $('postScr').remove(); delete window[data.callback]; }
  }, 15000);
}

// ── NAVIGATION ─────────────────────────────────────────────────────────────
function navigateTo(page) {
  if (!appState.user) return;
  var perms = ROLE_PERMISSIONS[appState.user.role] || {};
  var menuNames = { bongkar:'Bongkar', kirim:'Kirim', opname:'Stock Opname', ceksap:'Cek SAP', history:'Riwayat', dashboard:'Dashboard', kartustock:'Kartu Stock' };
  if (!perms[page]) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon:'error', title:'Akses Ditolak 🔒', html:'<div style="font-size:0.95rem;color:#64748b;">Anda tidak memiliki otorisasi untuk mengakses menu <b style="color:#ef4444;">' + (menuNames[page]||page) + '</b></div>', confirmButtonText:'Mengerti', confirmButtonColor:'#0284c7', background:'#fff', customClass:{ popup:'swal-premium' } });
    } else { toast('Anda tidak punya akses ke halaman ini', 'w'); }
    return;
  }
  document.querySelectorAll('.page').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.bnav-item').forEach(function(el) { el.classList.remove('active'); });
  var pg = $('page-' + page);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item[data-page="' + page + '"]').forEach(function(el) { el.classList.add('active'); });
  document.querySelectorAll('.bnav-item[data-page="' + page + '"]').forEach(function(el) { el.classList.add('active'); });
  document.querySelectorAll('.header-tab').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.header-tab[data-page="' + page + '"]').forEach(function(el) { el.classList.add('active'); });
  appState.currentPage = page;
  if (appState.sidebarOpen) closeSidebar();
  if (page === 'dashboard') loadDashboard();
  if (page === 'ceksap') {
    loadSAPData(); // load history dulu
    initSAP();
  }
  if (page === 'history') initHistory();
  if (page === 'kartustock') { loadKartuStockData(); initKartuStock(); }
  updateSubnavDashKartu(page);
}

function updateSubnavDashKartu(page) {
  var bar = $('subnavDashStock');
  if (!bar) return;
  var show = page === 'dashboard' || page === 'kartustock';
  bar.hidden = !show;
  if (!show) return;
  bar.querySelectorAll('.view-tab').forEach(function(t) { t.classList.remove('active'); });
  var sel = page === 'dashboard' ? '.tab-dashboard' : '.tab-kartustock';
  var btn = bar.querySelector(sel);
  if (btn) btn.classList.add('active');
}

function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebarOvl').classList.add('active');
  appState.sidebarOpen = true;
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarOvl').classList.remove('active');
  appState.sidebarOpen = false;
}

// ── AUTHENTICATION ─────────────────────────────────────────────────────────
function doLogin() {
  var u = $('inpUser').value.trim().toLowerCase();
  var p = $('inpPass').value.trim();
  if (!u || !p) { toast('Username dan password harus diisi', 'w'); return; }
  
  var user = USERS_DATABASE.find(function(x) { return x.username.toLowerCase() === u && x.password === p; });
  if (user) {
    appState.user = user;
    sessionStorage.setItem('bkk_user', JSON.stringify(user));
    $('page-login').classList.remove('active');
    updateUserChrome(user);
    navigateTo('dashboard');
    toast('Selamat datang, ' + user.nama, 's');
  } else {
    var err = $('loginErr');
    if (err) {
      err.style.display = 'block';
      setTimeout(function() { err.style.display = 'none'; }, 3000);
    } else {
      toast('Username atau password salah', 'e');
    }
  }
}

function doLogout() {
  appState.user = null;
  sessionStorage.removeItem('bkk_user');
  document.querySelectorAll('.page').forEach(function(el) { el.classList.remove('active'); });
  $('page-login').classList.add('active');
  var nm = $('headerUserName');
  if (nm) nm.textContent = '—';
  var av = $('headerUserAvatar');
  if (av) av.textContent = '?';
  var sn = $('subnavDashStock');
  if (sn) sn.hidden = true;
  toast('Sesi berakhir', 'i');
}

function updateUserChrome(user) {
  if (!user) return;
  var nm = $('headerUserName');
  if (nm) nm.textContent = user.nama;
  var av = $('headerUserAvatar');
  if (av) {
    var ch = (user.nama || '').trim().charAt(0);
    av.textContent = ch ? ch.toUpperCase() : '?';
  }
}

function checkAuth() {
  var saved = sessionStorage.getItem('bkk_user');
  if (saved) {
    try {
      var user = JSON.parse(saved);
      appState.user = user;
      updateUserChrome(user);
      // We don't call navigateTo here because it's called from bkk-sap.js logic
      return true;
    } catch(e) { return false; }
  }
  return false;
}

