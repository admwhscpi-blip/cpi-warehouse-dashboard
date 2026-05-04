/**
 * History Viewer — shell mirip BKK dashboard, menu terkunci, login username VIEWER.
 */
(function () {
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(36);
    }

    function getQueryKey() {
        const p = new URLSearchParams(window.location.search);
        return p.get('key') || '';
    }

    function updateSidebarClock() {
        const now = new Date();
        const days = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
        const dayEl = document.getElementById('widget-day');
        const dateEl = document.getElementById('widget-date');
        const timeEl = document.getElementById('widget-time');
        if (dayEl) dayEl.textContent = days[now.getDay()];
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }).toUpperCase();
        }
        if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    function showLockedMenu() {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'info',
                title: 'Menu terkunci',
                html: '<div style="font-size:3rem;margin-bottom:8px;"><i class="fas fa-lock" style="color:#8b5cf6;"></i></div><p>Mode viewer read-only. Menu operasional tidak tersedia.</p>',
                confirmButtonColor: '#6366f1'
            });
        } else {
            alert('Menu terkunci (viewer).');
        }
    }

    function bindLockedNav() {
        document.querySelectorAll('.nav-item.nav-locked').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                showLockedMenu();
            });
        });
    }

    function bindMobileToggle() {
        const btn = document.getElementById('mobileToggle');
        const side = document.getElementById('sidebar');
        const ovl = document.getElementById('sidebarOvl');
        if (!btn || !side) return;
        btn.addEventListener('click', () => side.classList.toggle('open'));
        if (ovl) {
            ovl.addEventListener('click', () => {
                side.classList.remove('open');
            });
        }
    }

    function checkSession(expectedKey) {
        try {
            return sessionStorage.getItem('rm_hist_vw_ok') === '1'
                && sessionStorage.getItem('rm_hist_vw_key') === expectedKey;
        } catch (e) {
            return false;
        }
    }

    function setSession(key) {
        sessionStorage.setItem('rm_hist_vw_ok', '1');
        sessionStorage.setItem('rm_hist_vw_key', key);
    }

    function clearSession() {
        sessionStorage.removeItem('rm_hist_vw_ok');
        sessionStorage.removeItem('rm_hist_vw_key');
    }

    function showApp() {
        const login = document.getElementById('viewerLoginShell');
        const app = document.getElementById('viewerAppShell');
        const nameEl = document.getElementById('headerUserName');
        const av = document.getElementById('headerUserAvatar');
        if (login) login.hidden = true;
        if (app) app.hidden = false;
        if (nameEl) nameEl.textContent = 'VIEWER';
        if (av) av.textContent = 'V';
    }

    function showLoginForm(msg) {
        const login = document.getElementById('viewerLoginShell');
        const app = document.getElementById('viewerAppShell');
        const err = document.getElementById('viewerLoginErr');
        if (login) login.hidden = false;
        if (app) app.hidden = true;
        if (err && msg) {
            err.textContent = msg;
            err.style.display = 'block';
        } else if (err) err.style.display = 'none';
    }

    function tryLogin(expectedKey) {
        const user = (document.getElementById('viewerUser')?.value || '').trim().toUpperCase();
        const pass = document.getElementById('viewerPass')?.value || '';
        const err = document.getElementById('viewerLoginErr');

        if (!expectedKey) {
            if (err) {
                err.textContent = 'Link tidak valid (tidak ada key). Gunakan link dari Generate di halaman History.';
                err.style.display = 'block';
            }
            return;
        }

        if (user !== 'VIEWER') {
            if (err) {
                err.textContent = 'Username harus VIEWER.';
                err.style.display = 'block';
            }
            return;
        }

        if (simpleHash(pass) !== expectedKey) {
            if (err) {
                err.textContent = 'Password salah.';
                err.style.display = 'block';
            }
            return;
        }

        setSession(expectedKey);
        showApp();
        if (err) err.style.display = 'none';
    }

    function init() {
        const expectedKey = getQueryKey();
        bindLockedNav();
        bindMobileToggle();
        setInterval(updateSidebarClock, 1000);
        updateSidebarClock();

        const btnLogin = document.getElementById('btnViewerLogin');
        const btnLogout = document.getElementById('btnLogout');

        if (!expectedKey) {
            showLoginForm('Link tidak valid. Pastikan membuka URL lengkap dengan ?key=… dari Generate.');
            if (btnLogin) btnLogin.disabled = true;
            return;
        }

        if (checkSession(expectedKey)) {
            showApp();
        } else {
            showLoginForm('');
        }

        if (btnLogin) {
            btnLogin.addEventListener('click', () => tryLogin(expectedKey));
        }

        const passInp = document.getElementById('viewerPass');
        if (passInp) {
            passInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') tryLogin(expectedKey);
            });
        }

        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                clearSession();
                showLoginForm('');
                window.location.reload();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
