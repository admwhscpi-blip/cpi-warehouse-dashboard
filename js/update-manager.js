/**
 * SMART UPDATE MANAGER V1.0
 * Ensures mobile/PWA users always have the latest version.
 */

const APP_VERSION = "20.0.1"; // Local version

async function checkAppUpdate() {
    try {
        console.log("Checking for updates...");
        // Use cache: "no-store" to bypass browser/PWA caching
        const response = await fetch('version.json?t=' + Date.now(), {
            cache: "no-store",
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (!response.ok) return;

        const serverData = await response.json();
        const serverVersion = serverData.version;

        if (serverVersion !== APP_VERSION) {
            console.warn(`Update available! Local: ${APP_VERSION} | Server: ${serverVersion}`);
            showUpdatePrompt(serverVersion, serverData.description);
        } else {
            console.log("App is up to date.");
        }
    } catch (err) {
        console.error("Update check failed:", err);
    }
}

function showUpdatePrompt(newVersion, description) {
    if (typeof Swal === 'undefined') {
        console.warn("SweetAlert2 not found, using standard confirm.");
        if (confirm(`Versi Baru (${newVersion}) tersedia! Update sekarang?`)) {
            performForceUpdate();
        }
        return;
    }

    Swal.fire({
        title: 'UPDATE TERSEDIA!',
        html: `
            <div style="text-align: left; font-family: 'Rajdhani', sans-serif;">
                <p style="color: var(--neon-cyan); font-weight: 700;">Versi Baru: ${newVersion}</p>
                <p style="font-size: 0.9rem; margin-top: 10px; color: #fff;">${description || 'Peningkatan performa & perbaikan fitur.'}</p>
                <hr style="border: 0.5px solid rgba(14, 165, 233, 0.2); margin: 15px 0;">
                <p style="font-size: 0.75rem; color: #94a3b8;">Sistem akan memuat ulang data terbaru agar aplikasi berjalan lancar.</p>
            </div>
        `,
        icon: 'info',
        iconColor: '#0ea5e9',
        background: '#020617',
        showCancelButton: true,
        confirmButtonColor: '#0ea5e9',
        cancelButtonColor: '#1e293b',
        confirmButtonText: 'UPDATE SEKARANG',
        cancelButtonText: 'NANTI SAJA',
        backdrop: `rgba(2, 6, 23, 0.9)`,
        customClass: {
            popup: 'swal-luxury'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            performForceUpdate();
        }
    });
}

function performForceUpdate() {
    console.log("Performing force update...");
    // Force reload with cache bypass
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (let registration of registrations) {
                registration.unregister();
            }
            location.reload(true);
        });
    } else {
        location.reload(true);
    }
}

// Global Luxury Styles for Swal
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.innerHTML = `
        .swal-luxury {
            border: 1px solid rgba(14, 165, 233, 0.4) !important;
            box-shadow: 0 0 30px rgba(14, 165, 233, 0.2) !important;
            border-radius: 20px !important;
        }
        .swal2-title {
            font-family: 'Orbitron', sans-serif !important;
            letter-spacing: 2px !important;
            font-size: 1.2rem !important;
        }
    `;
    document.head.appendChild(style);
}

// Auto check on load
window.addEventListener('load', () => {
    // Delay check slightly to not interfere with initial load
    setTimeout(checkAppUpdate, 3000);
});
