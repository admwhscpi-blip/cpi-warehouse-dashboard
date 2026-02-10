// APP CORE
// Orchestrates Data Loading, View Switching, and System Selection

const App = {
    currentSystem: null, // 'RM' or 'CPO'
    data: null,

    init: async function () {
        console.log("App Initializing...");

        // 1. Fetch Data First (Preload)
        const data = await DataService.fetchData();
        if (data) {
            this.data = data;
            console.log("Data Loaded:", data);

            // Check if CPO data exists
            if (data.cpo) {
                console.log("CPO Data Detected:", data.cpo.tanks.length, "tanks");
            }

            // Remove Loading Text, Show Selector
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';

            // By default, system-selector is visible in HTML. 
            // We just ensure it's there.
            const sysSel = document.getElementById('system-selector');
            if (sysSel) sysSel.style.display = 'flex';
        } else {
            const loadEl = document.getElementById('loading');
            if (loadEl) loadEl.innerText = "CONNECTION FAILED. PLEASE REFRESH.";
        }
    },

    selectSystem: function (systemType, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Safety Check: Data must be loaded
        if (!this.data) {
            alert("Data sedang dimuat... Tunggu sebentar.");
            return;
        }

        console.log("System Selected:", systemType);
        this.currentSystem = systemType;

        // Hide Landing
        const selector = document.getElementById('system-selector');
        if (selector) selector.style.display = 'none';

        // Show Nav
        const nav = document.getElementById('main-nav');
        if (nav) nav.style.display = 'flex';

        // Hide All Modules first
        const modRM = document.getElementById('module-rm');
        const modCPO = document.getElementById('module-cpo');
        if (modRM) modRM.style.display = 'none';
        if (modCPO) modCPO.style.display = 'none';

        if (systemType === 'RM') {
            console.log("Activating RM Module...");
            // ACTIVATE RM MODULE
            if (modRM) modRM.style.display = 'block';

            try {
                // Validate Data
                if (!this.data.warehouses || this.data.warehouses.length === 0) {
                    console.error("RM DATA EMPTY:", this.data);
                    document.getElementById('warehouse-display').innerHTML =
                        '<div style="color:red; padding:20px;">Error: Data Gudang Kosong (Cek Nama Sheet di GAS)</div>';
                    return;
                }

                console.log(`Rendering ${this.data.warehouses.length} Warehouses...`);

                // Init RM Logic (Existing)
                if (typeof UIService !== 'undefined') {
                    UIService.renderDashboard(this.data);
                } else {
                    console.error("UIService is missing!");
                }

                if (typeof SimService !== 'undefined') {
                    SimService.init(this.data);
                }

            } catch (e) {
                console.error("Error Rendering RM:", e);
                alert("Gagal menampilkan RM Dashboard: " + e.message);
            }

            // Default View
            window.switchView('dashboard');

        } else if (systemType === 'CPO') {
            // ACTIVATE CPO MODULE
            document.getElementById('module-cpo').style.display = 'block';

            // Init CPO Logic (New)
            if (this.data.cpo) {
                const tanks = this.data.cpo.tanks || [];

                if (tanks.length === 0) {
                    // Empty State
                    const grid = document.getElementById('cpo-tank-grid');
                    if (grid) {
                        const logs = (this.data.logs || []).join('<br>');
                        grid.innerHTML = `
                            <div style="grid-column:1/-1; text-align:center; padding:50px; border:1px dashed #444; border-radius:10px; color:#888;">
                                <div style="font-size:3rem; margin-bottom:20px;">🕵️</div>
                                <h3>DIAGNOSE MODE</h3>
                                <p>Sedang membaca data dari Google Sheet...</p>
                                <div style="background:#000; color:#0f0; padding:15px; margin-top:20px; border-radius:5px; text-align:left; font-family:monospace; font-size:0.75rem; max-height:200px; overflow:auto;">
                                    <strong>BACKEND LOGS:</strong><br>
                                    ${logs || "No logs available."}
                                </div>
                                <p style="margin-top:10px;">Mohon fotokan Logs diatas jika data belum muncul.</p>
                            </div>
                       `;
                    }
                    if (typeof CPOService !== 'undefined') CPOService.initSimulation(this.data.cpo);
                } else {
                    // Normal Render
                    if (typeof CPOService !== 'undefined') {
                        CPOService.renderDashboard(this.data.cpo);
                        CPOService.initSimulation(this.data.cpo);
                    }
                }
            } else {
                console.warn("CPO Data structure missing");
            }

            // Default View CPO
            window.switchView('dashboard'); // Reuse switchView logic but contextual
        }
    },

    resetSystem: function () {
        location.reload(); // Simplest way to reset state fully
    }
};

// Global Switch View (Context Aware)
window.switchView = function (viewName) {
    // Nav Buttons Styling
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));

    // Determine Logic based on System
    if (App.currentSystem === 'RM') {
        if (viewName === 'dashboard') {
            document.getElementById('view-dashboard').style.display = 'block';
            document.getElementById('view-simulation').style.display = 'none';
            navBtns[0].classList.add('active');
        } else {
            document.getElementById('view-dashboard').style.display = 'none';
            document.getElementById('view-simulation').style.display = 'block';
            navBtns[1].classList.add('active');
        }
    } else if (App.currentSystem === 'CPO') {
        const cpoDash = document.getElementById('view-cpo-dashboard');
        const cpoSim = document.getElementById('view-cpo-simulation');

        if (viewName === 'dashboard') {
            if (cpoDash) cpoDash.style.display = 'block';
            if (cpoSim) cpoSim.style.display = 'none';
            navBtns[0].classList.add('active'); // Re-use buttons
        } else {
            if (cpoDash) cpoDash.style.display = 'none';
            if (cpoSim) cpoSim.style.display = 'block';
            navBtns[1].classList.add('active');
        }
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
