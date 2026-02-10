// APP RENTAL F SERVICE (LIVE DATA)
// Modular Service - Fetches Data from Google Apps Script

const RentalFService = {
    // ENDPOINT API (OPSI A: USER AKAN DEPLOY SCRIPT & PASTE URL DI SINI)
    // Nanti ganti URL ini dengan URL Web App punya Bapak
    apiURL: 'https://script.google.com/macros/s/AKfycbz200AJLn1Ih0uXsQdoYCKys9KWEktSmHfBShEPnX4oToRrnxtJtJ99FOSWxad0_EbBJQ/exec',

    // VISUAL LAYOUT (Tetap Statis Kecuali user info ada perubahan fisik)
    // Koordinat ini mencerminkan "Rumah" untuk data yang masuk
    layoutMap: [
        { id: 'L1', x: 20, y: 10, w: 60, h: 15 },
        { id: 'L2', x: 20, y: 30, w: 60, h: 15 },
        { id: 'L3', x: 20, y: 50, w: 60, h: 15 },
        { id: 'L4', x: 60, y: 68, w: 20, h: 12 }
    ],

    gates: [
        { id: 'P1', label: 'P1', x: 45, y: 2, w: 10, h: 5 },
        { id: 'P2', label: 'P2', x: 10, y: 65, w: 10, h: 5 },
        { id: 'P3', label: 'P3', x: 10, y: 92, w: 10, h: 5 }
    ],

    // State Data Live
    liveData: null,
    loading: false,

    showPanel: function () {
        console.log("Opening Rental F Details (Manual Trigger)...");
        this.renderOverlay(true); // Render with loading state
        this.fetchData(); // Get Real Data
    },

    fetchData: function () {
        if (this.apiURL.includes('MASUKAN_URL')) {
            // Simulation Mode if API not set
            console.warn("API URL not set. Using Simulation Data.");
            this.simulateData();
            return;
        }

        this.loading = true;
        fetch(this.apiURL + '?gudang=F')
            .then(res => res.json())
            .then(res => {
                if (res.status === 'success') {
                    this.liveData = res.data;
                    this.renderOverlay(false);
                } else {
                    alert("Gagal ambil data: " + res.message);
                }
            })
            .catch(err => {
                console.error(err);
                alert("Koneksi Error. Cek console.");
            })
            .finally(() => this.loading = false);
    },

    // Fallback Data (Sesuai Gambar Excel Bapak)
    simulateData: function () {
        this.liveData = {
            info: {
                material: 'CGM CHINA',
                sap: 4003298,
                actual: 2158563,
                occupancy: 54
            },
            lots: [
                { id: 'L1', label: 'LOT 1', material: 'CGM CHINA (210101)', age: 62, stock: 978030, status: 'LANGSIR SELESAI' },
                { id: 'L2', label: 'LOT 2', material: 'CGM CHINA (210101)', age: 49, stock: 447676, status: 'PROSES LANGSIR' },
                { id: 'L3', label: 'LOT 3', material: 'CGM CHINA (210101)', age: 35, stock: 804926, status: 'HOLD' },
                { id: 'L4', label: 'LOT 4', material: 'CGM CHINA (210101)', age: 23, stock: 949884, status: 'HOLD' }
            ]
        };
        this.renderOverlay(false);
    },

    renderOverlay: function (isLoading) {
        let overlay = document.getElementById('rental-detail-overlay');
        if (!overlay) {
            // Create container if missing (copy logic from previous step)
            this.createBaseOverlay();
            overlay = document.getElementById('rental-detail-overlay');
        }

        if (isLoading) {
            document.getElementById('rental-f-stats').innerHTML = `<div style="color:white;text-align:center;margin-top:50px;">📡 CONTACTING SATELLITE (Gsheet)...</div>`;
            return;
        }

        const data = this.liveData;
        const mapContainer = document.getElementById('rental-f-map');
        mapContainer.innerHTML = '';

        // Render Gates
        this.gates.forEach(g => {
            const el = document.createElement('div');
            el.className = 'rental-gate';
            el.style.left = g.x + '%';
            el.style.top = g.y + '%';
            el.style.width = g.w + '%';
            el.style.height = g.h + '%';
            el.innerText = g.label;
            mapContainer.appendChild(el);
        });

        // Render Lots (Merge Visual Layout + Live Data)
        this.layoutMap.forEach(layout => {
            // Find matching data based on ID (L1 -> L1)
            const lotData = data.lots.find(l => l.id === layout.id) || { material: 'EMPTY', stock: 0, status: '-' };

            // Color Logic
            let bgColor = 'rgba(255,255,255,0.1)'; // Default format
            if (lotData.stock > 0) bgColor = '#ffff00'; // Yellow Base
            if (lotData.status.includes('HOLD')) bgColor = '#ffaa00'; // Orange Warning for Hold

            const el = document.createElement('div');
            el.className = 'rental-lot';
            el.style.left = layout.x + '%';
            el.style.top = layout.y + '%';
            el.style.width = layout.w + '%';
            el.style.height = layout.h + '%';
            el.style.backgroundColor = bgColor;

            el.innerHTML = `
                <div class="lot-label">${layout.id}</div>
                <div class="lot-info">
                    ${lotData.stock > 0 ? (lotData.stock / 1000).toLocaleString() + ' T' : 'EMPTY'}
                </div>
            `;

            // Tooltip on click
            el.onclick = () => alert(`DETAIL ${layout.id}\nMat: ${lotData.material}\nAge: ${lotData.age} Days\nStatus: ${lotData.status}`);

            mapContainer.appendChild(el);
        });

        // Render Stats
        this.renderStats(data);

        overlay.style.display = 'flex';
    },

    renderStats: function (data) {
        const statsContainer = document.getElementById('rental-f-stats');
        const s = data.info;

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">MAIN MATERIAL</div>
                <div class="stat-val-lg">${s.material}</div>
            </div>
            <div class="stat-row">
                <div class="stat-card half">
                    <div class="stat-label">CAPACITY (KG)</div>
                    <div class="stat-val">${s.max ? s.max.toLocaleString() : '-'}</div>
                </div>
                <div class="stat-card half">
                    <div class="stat-label">ACTUAL (KG)</div>
                    <div class="stat-val highlight">${s.actual.toLocaleString()}</div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">OCCUPANCY (${s.occupancy}%)</div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width:${Math.min(s.occupancy, 100)}%"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:0.8rem; color:#888;">
                    <span>Used: ${s.used ? s.used.toLocaleString() : '-'}</span>
                    <span>Max: ${s.max ? s.max.toLocaleString() : '-'}</span>
                </div>
            </div>

            <!-- Mini List -->
            <div class="mini-table-header">STACK DETAILS</div>
            <table class="mini-table">
                <thead><tr><td>LOT</td><td>AGE</td><td>STATUS</td></tr></thead>
                <tbody>
                    ${data.lots.map(l => `
                        <tr>
                            <td><b>${l.id}</b></td>
                            <td>${l.age} Days</td>
                            <td class="${l.status && l.status.includes('HOLD') ? 'text-red' : 'text-green'}">${l.status}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    createBaseOverlay: function () {
        const overlay = document.createElement('div');
        overlay.id = 'rental-detail-overlay';
        overlay.className = 'detail-overlay-glass';
        overlay.innerHTML = `
             <div class="detail-header">
                <div class="detail-title-group">
                    <div class="detail-main-title">GUDANG F (SAMPING)</div>
                    <div class="detail-sub-title">LIVE RENTAL MONITORING</div>
                </div>
                <button class="close-btn-rect" onclick="RentalFService.close()">CLOSE PANEL</button>
            </div>
            <div class="rental-split-view">
                <div id="rental-f-map" class="rental-map-container"></div>
                <div id="rental-f-stats" class="rental-stats-panel"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
};

window.RentalFService = RentalFService;
