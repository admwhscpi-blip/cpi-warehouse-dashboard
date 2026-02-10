// APP RM DETAILS SERVICE
// Handles Detailed Blueprint Rendering for RM Warehouse
// Modular - Called by LayoutService

const RMDetailService = {
    currentOverlay: null,

    // DATA MAP (Relative Coordinates 0-100%)
    // Based on "LAYOUT RM CPI CIREBON" Blueprint
    layout: [
        // --- TOP SECTION ---
        // Alokasi Mineral (Kiri Atas - Putih)
        { id: 'min_1', type: 'area-mineral', label: 'Alokasi Mineral (Binder, Lime Stone, SALT)', x: 12, y: 5, w: 25, h: 10 },
        // OPGD B (Tengah Atas)
        { id: 'opgd_b', type: 'area-mineral', label: 'OPGD B<br>Alokasi Remix', x: 38, y: 5, w: 15, h: 10 },
        // Store Room (Kanan Atas)
        { id: 'store', type: 'area-mineral', label: 'AREA STORE ROOM', x: 54, y: 5, w: 32, h: 10 },

        // --- LEFT SECTION ---
        // OPGD A (Kiri Pol)
        { id: 'opgd_a', type: 'area-mineral', label: 'OPGD A', x: 2, y: 20, w: 7, h: 8 },
        // Area Fullfat (Hijau Besar)
        { id: 'fullfat', type: 'area-fullfat', label: 'AREA PENYIMPANAN<br>FULLFAT', x: 10, y: 20, w: 18, h: 25 },
        // Kantor RM
        { id: 'office', type: 'area-mineral', label: 'KANTOR RM', x: 10, y: 46, w: 8, h: 8 },
        // Lokal CC Liquid (Kiri Bawah Panjang)
        { id: 'cc_liq', type: 'area-mineral', label: 'ALOKASI CC<br>LIQUID & LECITHIN', x: 2, y: 55, w: 7, h: 35 },

        // --- CENTER BLOCKS (A-F) ---

        // BLOK A (Bawah OPGD B)
        { id: 'hdr_a', type: 'rm-block-header', label: 'BLOK A', x: 38, y: 20, w: 15, h: 4 },
        { id: 'premix', type: 'area-mineral', label: 'Alokasi Premix, Vitamin, Anticocci, Enzyme', x: 38, y: 25, w: 38, h: 4 }, // Lebar ke kanan

        // BLOK B (Tengah)
        { id: 'hdr_b', type: 'rm-block-header', label: 'BLOK B', x: 38, y: 35, w: 12, h: 4 },

        // BLOK C & D (Feed Additive & CGM)
        { id: 'hdr_c', type: 'rm-block-header', label: 'BLOK C', x: 38, y: 48, w: 10, h: 3 },
        { id: 'loc_c', type: 'area-lokal', label: 'LOKAL IN BAG', x: 38, y: 52, w: 15, h: 5 }, // Cyan
        { id: 'loc_cx', type: 'area-lokal', label: 'LOKAL IN BAG', x: 54, y: 48, w: 22, h: 9 }, // Cyan Besar Kanan

        { id: 'hdr_d', type: 'rm-block-header', label: 'BLOK D', x: 38, y: 62, w: 15, h: 3 },
        { id: 'cgm_d', type: 'area-import', label: 'CGM IMPORT', x: 38, y: 66, w: 15, h: 5 }, // Kuning
        { id: 'cgm_big', type: 'area-import', label: 'CGM IMPORT', x: 54, y: 62, w: 22, h: 9 }, // Kuning Besar Kanan

        // DDGS Import (Hijau Tua Kanan)
        { id: 'ddgs', type: 'area-ddgs', label: 'DDGS IMPORT', x: 77, y: 55, w: 8, h: 16 },

        // BLOK E (Bawah D)
        { id: 'loc_e', type: 'area-lokal', label: 'LOKAL IN BAG', x: 38, y: 75, w: 15, h: 5 },
        { id: 'hdr_e', type: 'rm-block-header', label: 'BLOK E', x: 38, y: 81, w: 15, h: 3 },
        { id: 'loc_ex', type: 'area-lokal', label: 'LOKAL IN BAG', x: 54, y: 75, w: 22, h: 9 },

        // --- BOTTOM SECTION ---
        // Area Ayun Pallet (Merah Kiri Bawah)
        { id: 'ayun', type: 'area-red', label: 'AREA AYUN PALLET', x: 10, y: 88, w: 13, h: 8 },
        // MBM Import (Hijau Olive)
        { id: 'mbm1', type: 'area-mbm', label: 'MBM IMPORT', x: 24, y: 88, w: 13, h: 8 },
        // Blok F (Tengah Bawah)
        { id: 'hdr_f', type: 'rm-block-header', label: 'BLOK F', x: 38, y: 88, w: 15, h: 3 },
        { id: 'mbm_imp', type: 'area-mbm', label: 'MBM IMPORT', x: 38, y: 92, w: 15, h: 4 },
        // MBM L/I (Kanan Bawah)
        { id: 'mbm_li', type: 'area-mbm', label: 'MBM L/I', x: 54, y: 88, w: 25, h: 8 },
        // CFM Lokal (Pojok Kanan Bawah)
        { id: 'cfm', type: 'area-mineral', label: 'CFM LOKAL', x: 80, y: 88, w: 8, h: 8 },

        // --- RIGHT SECTION (OPGD C & AYAK) ---
        { id: 'opgd_c', type: 'area-mineral', label: 'OPGD C', x: 88, y: 20, w: 8, h: 5 },
        { id: 'sweep', type: 'area-mineral', label: 'ALOKASI BIN<br>SWEEPING &<br>HASIL AYAK', x: 88, y: 26, w: 8, h: 10 },
        { id: 'mc_ayak', type: 'area-mineral', label: 'MC<br>AYAK BIN', x: 88, y: 38, w: 8, h: 4 },
        { id: 'res_ayak', type: 'area-mineral', label: 'ALOKASI HASIL<br>AYAK', x: 88, y: 44, w: 8, h: 4 },
        { id: 'ns', type: 'area-mineral', label: 'NS', x: 88, y: 65, w: 8, h: 15 }
    ],

    // DOORS (Pintu Merah)
    doors: [
        { id: 'p04', label: 'PINTU 04', x: 9, y: 30, w: 2, h: 10 }, // Samping Fullfat
        { id: 'p03', label: 'PINTU 03', x: 15, y: 15, w: 15, h: 2 }, // Atas Fullfat
        { id: 'p02', label: 'PINTU 02', x: 45, y: 15, w: 5, h: 2 }, // Atas Blok A
        { id: 'p01', label: 'PINTU 01', x: 75, y: 15, w: 5, h: 2 }, // Atas Store
        { id: 'p08', label: 'PINTU 08', x: 86, y: 55, w: 2, h: 10 }, // Samping DDGS
        { id: 'p07', label: 'PINTU 07', x: 86, y: 85, w: 2, h: 5 },  // Bawah Kanan
        { id: 'p06', label: 'PINTU 06', x: 9, y: 83, w: 2, h: 8 },   // Bawah Kiri
        { id: 'p05', label: 'PINTU 05', x: 9, y: 55, w: 2, h: 8 },   // Tengah Kiri
    ],

    open: function () {
        console.log("Opening RM Details...");
        this.renderOverlay();
    },

    renderOverlay: function () {
        // Create or Get Overlay
        let overlay = document.getElementById('rm-detail-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'rm-detail-overlay';
            overlay.innerHTML = `
                <div id="rm-detail-header">
                    <div id="rm-detail-title">RM WAREHOUSE BLUEPRINT</div>
                    <button id="rm-close-btn" onclick="RMDetailService.close()">CLOSE X</button>
                </div>
                <div id="rm-blueprint-container">
                    <!-- Blocks injected here -->
                </div>
            `;
            document.body.appendChild(overlay);
        }

        const container = document.getElementById('rm-blueprint-container');
        container.innerHTML = ''; // Clear

        // 1. Render Areas (Blocks)
        this.layout.forEach(item => {
            const el = document.createElement('div');
            el.className = `rm-area ${item.type}`;
            el.style.left = item.x + '%';
            el.style.top = item.y + '%';
            el.style.width = item.w + '%';
            el.style.height = item.h + '%';
            el.innerHTML = `<span class="rm-label">${item.label}</span>`;

            // Interaction
            el.onclick = () => alert(`Stock Detail: ${item.label.replace('<br>', ' ')}\n(Live Data Integration Coming Soon)`);

            container.appendChild(el);
        });

        // 2. Render Doors
        this.doors.forEach(d => {
            const el = document.createElement('div');
            el.className = 'rm-door';
            el.style.left = d.x + '%';
            el.style.top = d.y + '%';
            el.style.width = d.w + '%';
            el.style.height = d.h + '%';
            el.innerText = d.label;
            container.appendChild(el);
        });

        overlay.style.display = 'flex';
    },

    close: function () {
        const overlay = document.getElementById('rm-detail-overlay');
        if (overlay) overlay.style.display = 'none';
    }
};

window.RMDetailService = RMDetailService;
