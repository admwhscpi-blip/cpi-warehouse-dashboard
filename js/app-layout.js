// APP LAYOUT SERVICE v2
// Handles Layout Visualization with Zoning Logic

const LayoutService = {
    containerId: 'view-layout',
    mapContainer: null,

    // DATA: ZONES (Visual Scopes)
    zones: [
        { id: 'z_mitra', label: 'SCOPE MITRA', class: 'zone-mitra', x: 1, y: 30, w: 20, h: 68 },
        { id: 'z_pabrik', label: 'SCOPE PABRIK', class: 'zone-pabrik', x: 24, y: 12, w: 25, h: 58 },
        { id: 'z_rental', label: 'SCOPE RENTAL (SAMPING & GEBANG)', class: 'zone-samping', x: 50, y: 10, w: 48, h: 60 },
    ],

    // DATA: BUILDINGS (Updated Positions & Metadata)
    buildings: [
        // 0. EXTERNALS (CORNERS)
        { id: 'port_jkt', type: 'external', label: 'TJ. PRIOK PORT', icon: '🚢', cap: 'IMPORT', dist: '225 KM', dest: 'Intl Source', x: 2, y: 5, w: 15, h: 10 },
        { id: 'port_smg', type: 'external', label: 'SEMARANG PORT', icon: '🚢', cap: 'IMPORT', dist: '240 KM', dest: 'Intl Source', x: 80, y: 5, w: 15, h: 10 },
        { id: 'supp', type: 'external', label: 'SUPPLIER LOKAL', icon: '🚛', cap: 'DOMESTIC', dist: 'VARIES', dest: 'Serba Serbi', x: 80, y: 85, w: 15, h: 10 },
        { id: 'hsb', type: 'mitra', label: 'GUDANG HSB', icon: '🏢', cap: 'MITRA', dist: '225 KM', dest: 'Mitra', x: 2, y: 85, w: 15, h: 10 },

        // 1. PABRIK (Center Core)
        { id: 'bk', type: 'pabrik', label: 'BK STORAGE', icon: '🛢️', cap: '6 UNITS', dist: '0 KM', dest: 'Lampung/Kalimantan', x: 30, y: 20, w: 10, h: 12 },
        { id: 'cpo', type: 'pabrik', label: 'CPO FARM', icon: '💧', cap: 'TANKS', dist: '0 KM', dest: 'Factory', x: 42, y: 20, w: 10, h: 12 },
        { id: 'rm', type: 'pabrik', label: 'RM WAREHOUSE', icon: '🏭', cap: 'MAIN HUB', dist: '0 KM', dest: 'Production', x: 32, y: 40, w: 18, h: 25 },

        // 2. MITRA (Left Flank)
        { id: 'gb', type: 'mitra', label: 'GUDANG BIRU', icon: '🏢', cap: '20.000 T', dist: '300 M', dest: 'Radius Pabrik', x: 7, y: 35, w: 15, h: 40 },

        // 3. RENTAL SAMPING (Right Flank - Inner)
        { id: 'sf', type: 'samping', label: 'SAMPING F', icon: '📦', cap: 'RENTAL', dist: '500 M', dest: 'Radius Pabrik', x: 55, y: 15, w: 20, h: 15 },
        { id: 'sc', type: 'samping', label: 'SAMPING C', icon: '📦', cap: 'RENTAL', dist: '500 M', dest: 'Radius Pabrik', x: 55, y: 35, w: 12, h: 18 },
        { id: 'se', type: 'samping', label: 'SAMPING E', icon: '📦', cap: 'RENTAL', dist: '500 M', dest: 'Radius Pabrik', x: 69, y: 35, w: 12, h: 45 },
        { id: 'sd', type: 'samping', label: 'SAMPING D', icon: '📦', cap: 'RENTAL', dist: '500 M', dest: 'Radius Pabrik', x: 55, y: 55, w: 12, h: 25 },

        // 4. RENTAL GEBANG (Right Flank - Outer)
        { id: 'ga', type: 'gebang', label: 'GEBANG A', icon: '🏗️', cap: 'RENTAL', dist: '14 KM', dest: 'Karawang/Jabar', x: 85, y: 25, w: 10, h: 15 },
        { id: 'gbb', type: 'gebang', label: 'GEBANG B', icon: '🏗️', cap: 'RENTAL', dist: '14 KM', dest: 'Wilayah 3 Cirebon', x: 88, y: 45, w: 10, h: 12 },
    ],

    // CONNECTIONS (Logical Flow)
    connections: [
        // 1. FROM PRIOK (Top Left) -> HSB, GB, BK, RM, CPO
        { from: 'port_jkt', to: 'hsb', type: 'flow' },
        { from: 'port_jkt', to: 'gb', type: 'flow' },
        { from: 'port_jkt', to: 'bk', type: 'flow' },
        { from: 'port_jkt', to: 'rm', type: 'flow' },
        { from: 'port_jkt', to: 'cpo', type: 'flow' },

        // 2. FROM SEMARANG (Top Right) -> RM, All Samping, All Gebang
        { from: 'port_smg', to: 'rm', type: 'flow' },
        { from: 'port_smg', to: 'sf', type: 'flow' },
        { from: 'port_smg', to: 'sc', type: 'flow' },
        { from: 'port_smg', to: 'se', type: 'flow' },
        { from: 'port_smg', to: 'sd', type: 'flow' },
        { from: 'port_smg', to: 'ga', type: 'flow' },
        { from: 'port_smg', to: 'gbb', type: 'flow' },

        // 3. FROM SUPPLIER (Bottom Right) -> All Rentals, RM, CPO, BK
        { from: 'supp', to: 'ga', type: 'flow' },
        { from: 'supp', to: 'gbb', type: 'flow' },
        { from: 'supp', to: 'sf', type: 'flow' },
        { from: 'supp', to: 'sc', type: 'flow' },
        { from: 'supp', to: 'se', type: 'flow' },
        { from: 'supp', to: 'sd', type: 'flow' },
        { from: 'supp', to: 'rm', type: 'flow' },
        { from: 'supp', to: 'cpo', type: 'flow' },
        { from: 'supp', to: 'bk', type: 'flow' },

        // 4. RENTALS TO RM (Internal Flow)
        { from: 'ga', to: 'rm', type: 'flow' },
        { from: 'gbb', to: 'rm', type: 'flow' },
        { from: 'sf', to: 'rm', type: 'flow' },
        { from: 'sc', to: 'rm', type: 'flow' },
        { from: 'se', to: 'rm', type: 'flow' },
        { from: 'sd', to: 'rm', type: 'flow' },
        { from: 'hsb', to: 'rm', type: 'flow' },
        { from: 'gb', to: 'rm', type: 'flow' },

        // 5. INTRA-FACTORY
        { from: 'bk', to: 'rm', type: 'pabrik' },
        { from: 'cpo', to: 'rm', type: 'pabrik' }
    ],

    init: function () {
        const mainContainer = document.getElementById(this.containerId);
        if (!mainContainer) return;

        mainContainer.innerHTML = '';
        mainContainer.style.display = 'block';

        const wrapper = document.createElement('div');
        wrapper.className = 'sim-luxury-wrapper';
        wrapper.innerHTML = `
            <div class="lux-header">
                <div class="header-left">
                    <div class="lux-title">STRATEGIC SUPPLY CHAIN MAP</div>
                    <div class="lux-subtitle">REAL-TIME LOGISTICS & ZONING MONITOR</div>
                </div>
                <div class="header-right">
                     <button id="btn-fullscreen" onclick="LayoutService.toggleFullScreen()">
                        ⛶ FULLSCREEN
                    </button>
                </div>
            </div>
            
            <div id="layout-map-container">
                <!-- COMPASS -->
                <div class="map-compass">
                    <div class="compass-circle"></div>
                    <div class="compass-marker n">U</div>
                    <div class="compass-marker e">T</div>
                    <div class="compass-marker s">S</div>
                    <div class="compass-marker w">B</div>
                    <div class="compass-needle"></div>
                    <div class="compass-center"></div>
                </div>

                <!-- SVG LAYER -->
                <svg id="layout-connections" width="100%" height="100%"></svg>
                
                <!-- LEGEND -->
                <div class="layout-legend">
                    <div class="legend-item"><div class="dot" style="background:#00ffff; box-shadow:0 0 5px #00ffff;"></div> CORE PABRIK</div>
                    <div class="legend-item"><div class="dot" style="background:#bc13fe; box-shadow:0 0 5px #bc13fe;"></div> SAMPING</div>
                    <div class="legend-item"><div class="dot" style="background:#ffa500; box-shadow:0 0 5px #ffa500;"></div> GEBANG</div>
                    <div class="legend-item"><div class="dot" style="background:#0088ff; box-shadow:0 0 5px #0088ff;"></div> MITRA</div>
                    <div class="legend-item"><div class="dot" style="background:#39ff14; box-shadow:0 0 5px #39ff14;"></div> EXTERNAL</div>
                </div>
            </div>
        `;
        mainContainer.appendChild(wrapper);
        this.mapContainer = document.getElementById('layout-map-container');
        this.renderMap();

        window.removeEventListener('resize', this.boundRender);
        this.boundRender = this.renderMap.bind(this);
        window.addEventListener('resize', this.boundRender);
    },

    toggleFullScreen: function () {
        const elem = document.getElementById('layout-map-container');
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(e => console.error(e));
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    },

    renderMap: function () {
        if (!this.mapContainer) return;
        const svg = document.getElementById('layout-connections');
        svg.innerHTML = '';

        // Clear Nodes & Zones
        this.mapContainer.querySelectorAll('.layout-node, .layout-zone').forEach(n => n.remove());

        // 1. RENDER ZONES (Scopes)
        this.zones.forEach(z => {
            const el = document.createElement('div');
            el.className = `layout-zone ${z.class}`;
            el.setAttribute('data-label', z.label);
            el.style.left = z.x + '%';
            el.style.top = z.y + '%';
            el.style.width = z.w + '%';
            el.style.height = z.h + '%';
            this.mapContainer.appendChild(el);
        });

        // 2. RENDER BUILDINGS
        this.buildings.forEach(b => {
            const el = document.createElement('div');
            el.className = `layout-node node-${b.type}`;
            el.style.left = b.x + '%';
            el.style.top = b.y + '%';
            el.style.width = b.w + '%';
            el.style.height = b.h + '%';

            // FUTURISTIC CONTENT
            el.innerHTML = `
                <div class="node-hud-corner"></div>
                <div class="node-icon">${b.icon}</div>
                <div class="node-title">${b.label}</div>
                <div class="node-meta">
                    <span class="meta-dist">📍 ${b.dist}</span>
                </div>
                <div class="node-dest">${b.dest}</div>
            `;

            // Interaction Trigger
            if (b.id === 'rm') {
                el.onclick = () => RMDetailService.open();
            } else if (b.id === 'sf') { // Samping F
                el.onclick = () => RentalFService.showPanel();
            } else {
                el.onclick = () => alert(`\nLOCATION DATA:\n${b.label}\n\nDistance: ${b.dist}\nDestination/Scope: ${b.dest}\nCapacity: ${b.cap}`);
            }

            this.mapContainer.appendChild(el);
        });

        // 3. DRAW LINES (Curved for Modern Look?) -> Straight is clearer for complex webs
        const w = this.mapContainer.clientWidth;
        const h = this.mapContainer.clientHeight;

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        // Marker for arrowheads maybe? -> Let's keep it clean neon lines first.
        svg.appendChild(defs);

        this.connections.forEach(conn => {
            const n1 = this.buildings.find(b => b.id === conn.from);
            const n2 = this.buildings.find(b => b.id === conn.to);
            if (!n1 || !n2) return;

            const x1 = (n1.x + n1.w / 2) * w / 100;
            const y1 = (n1.y + n1.h / 2) * h / 100;
            const x2 = (n2.x + n2.w / 2) * w / 100;
            const y2 = (n2.y + n2.h / 2) * h / 100;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", `M${x1},${y1} L${x2},${y2}`);
            path.setAttribute("class", `conn-line line-${conn.type}`);
            svg.appendChild(path);
        });
    }
};

window.LayoutService = LayoutService;
