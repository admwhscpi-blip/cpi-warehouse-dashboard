/**
 * ACCESS CONTROL SYSTEM v1.0
 * Security Level: Basic (Frontend Only)
 * Target: Secured Homepage Experiment
 */

const AccessControl = {
    // CONFIG
    CODE: "194507", // Default Access Code
    SESSION_KEY: "wh_access_granted",
    MAX_ATTEMPTS: 3,

    // STATE
    attempts: 0,
    isLocked: true,

    init: function () {
        console.log("🛡️ Access Control Initializing...");

        // Check Session
        const session = sessionStorage.getItem(this.SESSION_KEY);
        if (session === 'true') {
            this.unlockInterface(true); // true = immediate/no animation
        } else {
            this.lockInterface();
        }

        // Setup Event Listeners
        this.setupListeners();
    },

    setupListeners: function () {
        // Modal Input Enter Key
        const input = document.getElementById('pin-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.validateCode();
            });
        }
    },

    // UI ACTIONS
    openModal: function () {
        const modal = document.getElementById('access-modal');
        const input = document.getElementById('pin-input');
        if (modal) {
            modal.classList.add('active');
            if (input) {
                input.value = '';
                setTimeout(() => input.focus(), 100);
            }
        }
    },

    closeModal: function () {
        const modal = document.getElementById('access-modal');
        if (modal) modal.classList.remove('active');
    },

    // CORE LOGIC
    validateCode: function () {
        const input = document.getElementById('pin-input');
        const code = input.value;
        const msg = document.getElementById('access-msg');

        if (code === this.CODE) {
            // SUCCESS
            this.grantAccess();
        } else {
            // FAIL
            this.attempts++;
            this.denyAccess(input, msg);
        }
    },

    grantAccess: function () {
        console.log("✅ Access Granted");
        sessionStorage.setItem(this.SESSION_KEY, 'true');
        this.closeModal();
        this.unlockInterface(false); // Play animation

        // Show Success Toast
        this.showToast("Identity Verified. Welcome, Authorized User.");
    },

    denyAccess: function (input, msgEl) {
        console.warn("⛔ Access Denied");

        // Shake Animation
        input.classList.add('error-shake');
        setTimeout(() => input.classList.remove('error-shake'), 400);

        // Msg
        if (msgEl) {
            msgEl.style.color = '#ff2a2a';
            msgEl.innerText = `Invalid Code. Attempts: ${this.attempts}/${this.MAX_ATTEMPTS}`;
        }

        if (this.attempts >= this.MAX_ATTEMPTS) {
            input.disabled = true;
            input.placeholder = "LOCKED";
            if (msgEl) msgEl.innerText = "System Locked. Refresh to retry.";
        }
    },

    // VISUAL STATES
    lockInterface: function () {
        this.isLocked = true;

        // Lock Menus
        document.querySelectorAll('.protected-menu').forEach(el => {
            el.classList.add('nav-locked');
            // Store original href if not already stored
            if (!el.dataset.href) el.dataset.href = el.getAttribute('href');
            el.setAttribute('href', '#'); // Disable link
        });

        // Blur Content
        document.querySelectorAll('.protected-content').forEach(el => {
            el.classList.add('access-blur');

            // Add Overlay if not exists
            if (!el.querySelector('.access-overlay')) {
                const overlay = document.createElement('div');
                overlay.className = 'access-overlay';
                overlay.innerHTML = `
                    <div class="access-msg-box">
                        <span>🔒 Restricted Area</span>
                        <button onclick="AccessControl.openModal()" style="background:#00f3ff; border:none; border-radius:4px; padding:5px 10px; font-weight:bold; cursor:pointer;">UNLOCK</button>
                    </div>
                `;
                el.parentElement.style.position = 'relative'; // Ensure parent is relative
                el.parentElement.appendChild(overlay);
            }
        });

        // Update Header Button
        const btn = document.getElementById('header-access-btn');
        if (btn) {
            btn.innerHTML = '🔒 Masukkan Kode Akses';
            btn.classList.remove('authorized');
            btn.onclick = () => this.openModal();
        }
    },

    unlockInterface: function (immediate) {
        this.isLocked = false;

        // Unlock Menus
        document.querySelectorAll('.protected-menu').forEach(el => {
            el.classList.remove('nav-locked');
            if (el.dataset.href) el.setAttribute('href', el.dataset.href);
        });

        // Unblur Content
        document.querySelectorAll('.protected-content').forEach(el => {
            el.classList.remove('access-blur');
        });

        // Remove Overlays
        document.querySelectorAll('.access-overlay').forEach(el => el.remove());

        // Update Header Button
        const btn = document.getElementById('header-access-btn');
        if (btn) {
            btn.innerHTML = '✓ Akses Penuh';
            btn.classList.add('authorized');
            btn.onclick = null; // Remove trigger
        }
    },

    showToast: function (msg) {
        const toast = document.createElement('div');
        toast.innerText = msg;
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: #00f3ff; color: #000; padding: 10px 20px; border-radius: 30px;
            font-weight: bold; z-index: 10000; box-shadow: 0 5px 20px rgba(0,243,255,0.3);
            animation: fadeIn 0.5s ease-out;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    // Explicit Logout
    lockdown: function () {
        sessionStorage.removeItem(this.SESSION_KEY);
        location.reload();
    }
};

// Auto Init
document.addEventListener('DOMContentLoaded', () => {
    AccessControl.init();
});
