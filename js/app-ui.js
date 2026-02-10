// app-ui.js
// Fokus pada update tampilan (Render HTML)

const UIService = {
    renderDashboard: function (data) {
        const stats = DataService.processGlobalStats(data);
        const analytics = DataService.getAnalytics(data);
        const categoryStats = DataService.getCategoryStats(data); // New

        // FORCE NAV SHOW
        const nav = document.getElementById('main-nav');
        if (nav) nav.style.display = 'flex';

        this.renderGlobalStats(stats);
        this.renderAnalytics(analytics);
        this.renderCategoryStats(categoryStats); // New
        this.renderWarehouseCards(data);
    },

    renderCategoryStats: function (categories) {
        const container = document.getElementById('category-chart-container');
        if (!categories || categories.length === 0) {
            container.innerHTML = "Data kategori tidak tersedia.";
            return;
        }

        // Layout: Grid 2 Column (Chart | Legend)
        let html = '<div class="donut-layout">';

        // 1. Chart Area
        html += `
            <div class="donut-visual">
                ${this.generateDonutChartSVG(categories)}
            </div>
        `;

        // 2. Legend Area
        html += '<div class="donut-legend">';
        categories.forEach((cat, index) => {
            const colorClass = index < 6 ? `cat-color-${index + 1}` : 'cat-color-default';

            html += `
                <div class="legend-item">
                    <span class="legend-dot ${colorClass}"></span>
                    <span class="legend-name">${cat.name}</span>
                    <span class="legend-val">${Math.round(cat.totalTon)}T (${cat.percent.toFixed(1)}%)</span>
                </div>
            `;
        });
        html += '</div></div>'; // Close legend & layout

        container.innerHTML = html;
    },

    renderAnalytics: function (analytics) {
        const container = document.getElementById('analytics-dashboard');
        const tableContainer = document.getElementById('top-items-table');
        container.style.display = 'block';

        const maxVal = analytics.top10[0] ? analytics.top10[0].totalTon : 1;

        let html = `
            <table class="analytics-table">
                <thead>
                    <tr>
                        <th style="width:50px">Rank</th>
                        <th>Material</th>
                        <th>Total Stok (${CONFIG.UNIT_LABEL})</th>
                        <th>Visual</th>
                    </tr>
                </thead>
                <tbody>
        `;

        analytics.top10.forEach((item, index) => {
            const rank = index + 1;
            const percent = (item.totalTon / maxVal) * 100;

            html += `
                <tr class="tr-rank-${rank}">
                    <td><span class="rank-badge">${rank}</span></td>
                    <td style="font-weight:500; color:#333;">${item.name}</td>
                    <td style="font-family:'Consolas', monospace; font-weight:bold;">${item.totalTon.toLocaleString('id-ID')}</td>
                    <td>
                        <div class="bar-container">
                            <div class="bar-fill" style="width:${percent}%"></div>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        tableContainer.innerHTML = html;

        // Setup Search Listener (karena elemen barusan dirender/tampil)
        this.setupSearchListener();
    },

    setupSearchListener: function () {
        const input = document.getElementById('material-search');
        if (!input) return;

        // Debounce simple
        let timeout = null;
        input.oninput = (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const query = e.target.value;
                // Kita perlu akses data global. 
                // Karena data tidak disimpan di UI, kita ambil via fetch ulang atau simpan di global var.
                // Untuk efisiensi, sebaiknya data disimpan di app-core.js sebagai state.
                // TAPI, di sini kita bisa hack sedikit dengan re-fetching atau passing data.
                // REVISI: Cara terbaik, simpan data di property UIService sementara atau pass dari app-core.

                // Panggil Custom Event agar app-core yang handle search
                document.dispatchEvent(new CustomEvent('search-request', { detail: query }));
            }, 300);
        };
    },

    renderSearchResults: function (results) {
        const container = document.getElementById('search-results');
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="search-hint">Tidak ada material ditemukan.</div>';
            return;
        }

        let html = '';
        results.forEach(item => {
            html += `
                <div class="search-item-card">
                    <div class="item-header">
                        <span class="item-name">${item.name}</span>
                        <span class="item-total">Total: ${item.totalTon} ${CONFIG.UNIT_LABEL}</span>
                    </div>
            `;

            if (item.distribution.length === 0) {
                html += `<div class="no-stock-msg">Stok Habis di Semua Gudang</div>`;
            } else {
                item.distribution.forEach(dist => {
                    html += `
                        <div class="dist-row">
                            <div class="dist-wh-name">${dist.warehouse}</div>
                            <div class="dist-bar-area">
                                <div class="dist-bar-fill" style="width:${dist.percent}%"></div>
                            </div>
                            <div class="dist-val">${dist.qtyTon}</div>
                        </div>
                    `;
                });
            }

            html += `</div>`;
        });

        container.innerHTML = html;
    },

    renderGlobalStats: function (stats) {
        const container = document.getElementById('global-stats');
        container.style.display = 'grid'; // Aktifkan grid

        // Warna status
        let strokeColor = '#00f3ff';
        let statusText = 'OPTIMAL';
        if (stats.percentage > 70) { strokeColor = '#ff9e0b'; statusText = 'HIGH LOAD'; }
        if (stats.percentage > 90) { strokeColor = '#ff2a2a'; statusText = 'CRITICAL'; }

        container.innerHTML = `
            <div class="stat-card blue-card">
                <div class="stat-title">TOTAL OCCUPANCY</div>
                <div class="stat-value">${DataService.convertKgToTon(stats.totalFilled)} <span class="unit">${CONFIG.UNIT_LABEL}</span></div>
                <div class="stat-desc">Total Capacity: ${DataService.convertKgToTon(stats.totalCapacity)} ${CONFIG.UNIT_LABEL}</div>
            </div>
            
            <div class="stat-card white-card">
                <div class="stat-title" style="color:var(--warning-neon)">IDLE CAPACITY</div>
                <div class="stat-value" style="color:var(--warning-neon)">${DataService.convertKgToTon(stats.totalSpace)} <span class="unit">${CONFIG.UNIT_LABEL}</span></div>
                <div class="stat-desc">Ready for Allocation</div>
            </div>

            <div class="stat-card dark-card" style="display:flex; align-items:center; justify-content:space-between;">
                <div>
                    <div class="stat-title">UTILIZATION RATE</div>
                    <div class="stat-value">${stats.percentage.toFixed(1)}%</div>
                    <div class="stat-desc" style="color:${strokeColor}">${statusText}</div>
                </div>
                <!-- Mini Circular Indicator -->
                 <div style="width:60px; height:60px; position:relative;">
                    <svg width="60" height="60" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${strokeColor}" stroke-width="4" stroke-dasharray="${stats.percentage}, 100" class="circular-chart" />
                    </svg>
                 </div>
            </div>
        `;
    },

    renderWarehouseCards: function (data) {
        const container = document.getElementById('warehouse-display');
        container.innerHTML = '';
        container.className = 'warehouse-rack-container'; // Ganti layout grid jadi rack

        if (!data.materials || data.materials.length === 0) return;

        // 1. Cari Kapasitas Terbesar untuk Skala
        const maxCapacity = Math.max(...data.capacities);
        const MAX_VISUAL_HEIGHT = 280; // pixel
        const MIN_VISUAL_HEIGHT = 80;  // pixel

        data.warehouses.forEach((warehouseName, index) => {
            const capacityKg = data.capacities[index];
            const capacityTon = DataService.convertKgToTon(capacityKg);

            // Hitung Total Terisi per Gudang
            let currentLoadKg = 0;
            data.materials.forEach(mat => {
                if (mat.stocks[index]) currentLoadKg += mat.stocks[index];
            });
            const currentLoadTon = DataService.convertKgToTon(currentLoadKg);

            // Persentase & Visual Calculation
            let usagePercent = 0;
            if (capacityKg > 0) usagePercent = (currentLoadKg / capacityKg) * 100;

            // Height Proportion
            let visualHeight = (capacityKg / maxCapacity) * MAX_VISUAL_HEIGHT;
            if (visualHeight < MIN_VISUAL_HEIGHT) visualHeight = MIN_VISUAL_HEIGHT;

            // Status Colors
            let fillClass = '';
            let statusText = 'NORMAL';
            if (usagePercent > 70) { fillClass = 'fill-warning'; statusText = 'WARNING'; }
            if (usagePercent > 90) { fillClass = 'fill-critical'; statusText = 'CRITICAL'; }

            // --- HTML Building Unit ---
            const unit = document.createElement('div');
            unit.className = 'wh-unit';
            unit.onclick = () => { UIService.openWarehouseDetail(data, index, warehouseName); };

            unit.innerHTML = `
                <div class="wh-label-top">
                    <div>${warehouseName}</div>
                    <div style="font-size:0.7rem; opacity:0.7">Cap: ${capacityTon}</div>
                </div>
                
                <div class="wh-building" style="height: ${visualHeight}px;">
                    <div class="wh-fill ${fillClass}" style="height: ${usagePercent}%;"></div>
                    <div class="wh-label-inside">
                        ${Math.round(usagePercent)}%
                    </div>
                </div>
                <div class="wh-base"></div>
            `;

            container.appendChild(unit);
        });
    },

    openWarehouseDetail: function (data, warehouseIndex, warehouseName) {
        const modal = document.getElementById('detail-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        title.innerText = "Detail Gudang: " + warehouseName;
        modal.style.display = 'flex';

        // Filter material yang ada isinya saja di gudang ini
        const activeMaterials = data.materials.filter(m => m.stocks[warehouseIndex] > 0);

        // Sortir dari yang terbanyak (Optional but good)
        activeMaterials.sort((a, b) => b.stocks[warehouseIndex] - a.stocks[warehouseIndex]);

        if (activeMaterials.length === 0) {
            body.innerHTML = "<p style='text-align:center; color:#999;'>Gudang ini kosong.</p>";
            return;
        }

        // Render Table
        let html = `
            <table class="detail-table">
                <thead>
                    <tr>
                        <th>ITEM NAME</th>
                        <th class="stock-head">INVENTORY LEVEL (${CONFIG.UNIT_LABEL})</th>
                    </tr>
                </thead>
                <tbody>
        `;

        activeMaterials.forEach(mat => {
            const ton = DataService.convertKgToTon(mat.stocks[warehouseIndex]);
            html += `
                <tr>
                    <td>${mat.name}</td>
                    <td class="stock-val">${ton}</td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
        body.innerHTML = html;
    },

    closeModal: function () {
        document.getElementById('detail-modal').style.display = 'none';
    },

    // --- HELPER: Generate Simple SVG Donut Chart ---
    generateDonutChartSVG: function (categories) {
        let svgContent = '';
        let startAngle = 0;
        const radius = 15.9155; // Radius for circumference of 100
        const cx = 21;
        const cy = 21;

        // Background Circle
        svgContent += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="transparent" stroke="rgba(255,255,255,0.05)" stroke-width="5"></circle>`;

        categories.forEach((cat, index) => {
            const percent = cat.percent;
            if (percent <= 0) return;

            const dashArray = `${percent} ${100 - percent}`;
            // Color based on index
            const hexColors = ["#00f3ff", "#bc13fe", "#ff2a2a", "#ff9e0b", "#0aff0a", "#ffffff"];
            const color = index < 6 ? hexColors[index] : "#94a3b8";

            // Offset 25 (top) - startAngle
            const offset = 25 - startAngle;

            svgContent += `
                <circle class="donut-segment" cx="${cx}" cy="${cy}" r="${radius}" 
                    fill="transparent" 
                    stroke="${color}" 
                    stroke-width="5" 
                    stroke-dasharray="${dashArray}" 
                    stroke-dashoffset="${offset}"
                    style="--segment-color: ${color}">
                </circle>
            `;

            startAngle += percent;
        });

        // Center Text
        svgContent += `
            <g class="chart-text">
                <text x="50%" y="50%" class="chart-number">
                    ${categories.length}
                </text>
                <text x="50%" y="65%" class="chart-label">
                    Jenis
                </text>
            </g>
        `;

        return `
            <svg width="100%" height="100%" viewBox="0 0 42 42" class="donut-chart">
                ${svgContent}
            </svg>
        `;
    }
};
