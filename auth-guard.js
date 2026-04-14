(function () {
    const AUTH_KEY = "wh_auth_token";
    const AUTH_VALUE = "AUTHORIZED_WH_V2";
    const ROLE_KEY = "userRole";

    const path = window.location.pathname.toLowerCase();
    const href = window.location.href.toLowerCase();

    // DEBUG: Beritahu user di console apa yang sedang dideteksi
    console.log("AUTH GUARD LOG:", { path, href });

    const isPublicPage = href.indexOf('about-page') !== -1 ||
        path.indexOf('about-page') !== -1 ||
        path.endsWith('index.html') ||
        path.endsWith('login.html') ||
        path === '/' ||
        path.endsWith('/');

    const isBypass = href.indexOf('from=dtv2') !== -1;
    console.log("BYPASS DETECTED?", isBypass);

    if (!isPublicPage && !isBypass) {
        // Step 1: Check gatekeeper (index login)
        const token = sessionStorage.getItem(AUTH_KEY);
        if (token !== AUTH_VALUE) {
            window.location.href = "index.html";
            return;
        }

        // Step 2: Role-based check for restricted pages
        const role = sessionStorage.getItem(ROLE_KEY);

        // HR Pages Protection
        const isHrPage = path.includes('hr-absen') || path.includes('hr-cuti') || path.includes('hr-lembur') || path.includes('hr-payslip');
        if (isHrPage && role !== 'HR_ACCESS' && role !== 'FULL_ACCESS') {
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        // HUB Pages Protection
        const isHubPage = path.includes('material-audit') || path.includes('about-structure') || path.includes('bap4a') || path.includes('notulensi') || path.includes('op-') || path.includes('hub-sop-wi') || path.includes('knowledge-center') || path.includes('hub-track-record');
        if (isHubPage && role !== 'FULL_ACCESS') {
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        // INVENTORY Pages Protection (Same access as HR + HUB)
        const isInventoryPage = path.includes('inventory');
        if (isInventoryPage && role !== 'HR_ACCESS' && role !== 'FULL_ACCESS') {
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }
    }
})();
