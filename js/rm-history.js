// js/rm-history.js
// SLICTHER RM-ANALYS PROJECT // SUPER ANALYTICS 2050

const HistoryApp = {
    data: null,
    charts: {},
    granularity: 'daily',
    selectedPeriod: 'all',
    selectedMaterial: null,

    init: async function () {
        console.log("Slicther RM Engine Booting...");
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        this.data = await DataService.fetchData();
        if (!this.data) return;

        this.setupSearch();
        this.renderAll();

        // Listeners
        document.getElementById('periodFilter').addEventListener('change', (e) => {
            this.selectedPeriod = e.target.value;
            this.updateBranding();
            this.renderAll();
        });
        this.updateBranding();
    },

    updateClock: function () {
        const now = new Date();
        const clock = document.getElementById('hud-clock');
        if (clock) clock.innerText = now.toLocaleTimeString('en-GB');
    },

    updateBranding: function () {
        const period = document.getElementById('periodFilter').value;
        const brand = document.querySelector('.brand-smart');
        if (period === 'all') {
            brand.innerHTML = `SLICTHER <span style="color:var(--neon-gold)">ALL PERIODS</span>`;
        } else {
            brand.innerHTML = `SLICTHER <span style="color:var(--neon-blue)">${period}</span>`;
        }
    },


    setGranularity: function (mode) {
        this.granularity = mode;
        document.getElementById('btnDaily').classList.toggle('active', mode === 'daily');
        document.getElementById('btnWeekly').classList.toggle('active', mode === 'weekly');
        this.renderAll();
    },

    toggleFullscreen: function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            document.body.classList.add('fullscreen-mode');
        } else {
            document.exitFullscreen();
            document.body.classList.remove('fullscreen-mode');
        }
        setTimeout(() => this.renderAll(), 100);
    },

    setupSearch: function () {
        const input = document.getElementById('matSearch');
        const results = document.getElementById('searchResults');

        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) {
                results.style.display = 'none';
                return;
            }

            const matches = this.data.materials.filter(m =>
                m.name.toLowerCase().includes(query) ||
                (m.category && m.category.toLowerCase().includes(query))
            );

            results.innerHTML = '';
            if (matches.length > 0) {
                matches.slice(0, 10).forEach(m => {
                    const div = document.createElement('div');
                    div.style.padding = '10px 15px';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    div.innerHTML = `
                        <div style="color:var(--neon-gold); font-size:0.8rem; font-family:'Orbitron';">${m.name}</div>
                        <div style="color:#888; font-size:0.6rem;">${m.category || 'NO CATEGORY'}</div>
                    `;
                    div.onclick = () => {
                        this.showDetail(m);
                        results.style.display = 'none';
                        input.value = m.name;
                    };
                    results.appendChild(div);
                });
                results.style.display = 'block';
            } else {
                results.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target)) results.style.display = 'none';
        });
    },

    renderAll: function () {
        this.renderGlobalStock();
        this.renderFastMoving();
        if (this.selectedMaterial) this.showDetail(this.selectedMaterial);
    },


    // --- CHART LOGIC ---

    renderGlobalStock: function () {
        const ctx = document.querySelector("#chartAllStock");
        if (!ctx) return;

        // Get actual capacity from data if exists, otherwise use mock 25,000
        const stats = DataService.processGlobalStats(this.data);
        const actualCapacity = (stats.totalCapacity / CONFIG.UNIT_DIVIDER) || 25000;

        // Mock Historical Data (Scaled to tens of thousands as requested)
        const labels = this.granularity === 'daily' ? ['01 Feb', '02 Feb', '03 Feb', '04 Feb', '05 Feb', '06 Feb', '07 Feb'] : ['W1', 'W2', 'W3', 'W4'];
        const stockData = this.granularity === 'daily'
            ? [18500, 19200, 20100, 21500, 21000, 22300, 23100]
            : [18000, 21000, 22500, 23100];

        const capacityData = labels.map(() => actualCapacity);

        // Calculate Total & Delta
        const totalValue = stockData[stockData.length - 1];
        const prevValue = stockData[stockData.length - 2];
        const diffAbs = totalValue - prevValue;
        const deltaPerc = ((diffAbs / prevValue) * 100).toFixed(1);
        const deltaColor = diffAbs >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
        const sign = diffAbs >= 0 ? '+' : '';

        // Update UI Header
        document.getElementById('global-total-val').innerText = `${totalValue.toLocaleString()} TON`;
        document.getElementById('total-mat-count').innerText = `${this.data.materials.length} ITEMS`;
        const deltaEl = document.getElementById('global-delta-val');
        deltaEl.innerText = `${sign}${diffAbs.toLocaleString()} (${sign}${deltaPerc}%)`;
        deltaEl.style.color = deltaColor;

        // Create Annotations for "In-Between" Deltas & Capacity Gap
        const annotations = [];
        for (let i = 1; i < stockData.length; i++) {
            const current = stockData[i];
            const prev = stockData[i - 1];
            const diff = current - prev;
            const perc = ((diff / prev) * 100).toFixed(1);
            const capGap = actualCapacity - current;

            const color = diff >= 0 ? '#00ff88' : '#ff003c';
            const signTxt = diff >= 0 ? '+' : '';

            // Label PINNED to capacity line at the top
            annotations.push({
                x: labels[i],
                xOffset: -42,
                y: actualCapacity,
                marker: { size: 0 },
                label: {
                    borderColor: 'transparent',
                    offsetY: -35,
                    style: {
                        color: '#ffff00', // Bright Neon Yellow
                        background: 'rgba(0,0,0,0.85)',
                        fontSize: '9px',
                        fontWeight: 700,
                        fontFamily: 'Orbitron',
                        textAlign: 'center'
                    },
                    text: `FREE: ${capGap.toLocaleString()} T\n┃\n${signTxt}${diff.toLocaleString()} (${signTxt}${perc}%)`
                }
            });
        }


        const options = {
            series: [
                {
                    name: 'STOCK LEVEL',
                    type: 'column',
                    data: stockData
                },
                {
                    name: 'TOTAL CAPACITY',
                    type: 'line',
                    data: capacityData
                }
            ],
            chart: {
                height: '100%',
                type: 'line',
                toolbar: { show: false },
                animations: { enabled: true, speed: 800 },
                events: {
                    dataPointSelection: (event, chartContext, config) => {
                        const val = config.w.config.series[0].data[config.dataPointIndex];
                        const label = config.w.config.xaxis.categories[config.dataPointIndex];
                        this.showGlobalDetail(label, val);
                    }
                }
            },
            annotations: {
                points: annotations
            },
            stroke: {
                width: [0, 2],
                curve: 'smooth',
                dashArray: [0, 8]
            },
            colors: ['#00f3ff', '#ff003c'],
            fill: { opacity: [0.95, 1] },
            dataLabels: {
                enabled: true,
                formatter: function (val, { seriesIndex }) {
                    return seriesIndex === 0 ? `${val.toLocaleString()} T` : '';
                },
                style: {
                    fontSize: '11px',
                    fontFamily: 'Rajdhani',
                    colors: ['#000'] // Black text for high contrast on Cyan bars
                }
            },
            plotOptions: {
                bar: {
                    columnWidth: '65%',
                    dataLabels: {
                        position: 'center',
                    },
                }
            },


            xaxis: {
                categories: labels,
                labels: {
                    show: true,
                    style: {
                        colors: '#ffffff',
                        fontSize: '11px',
                        fontFamily: 'Orbitron'
                    }
                },
                axisBorder: { show: true, color: 'rgba(255,255,255,0.1)' },
                axisTicks: { show: true, color: 'rgba(255,255,255,0.1)' }
            },
            yaxis: {
                labels: {
                    style: { colors: '#64748b' },
                    formatter: (val) => `${(val / 1000).toFixed(0)}K`
                }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            tooltip: {
                theme: 'dark',
                shared: true,
                intersect: false,
                y: {
                    formatter: function (val, { series, seriesIndex, dataPointIndex, w }) {
                        if (seriesIndex === 0 && dataPointIndex > 0) {
                            const prev = series[seriesIndex][dataPointIndex - 1];
                            const diff = val - prev;
                            const perc = ((diff / prev) * 100).toFixed(1);
                            const sign = diff >= 0 ? '+' : '';
                            return `${val.toLocaleString()} TON <br><span style="color:${diff >= 0 ? '#00ff88' : '#ff003c'}">(${sign}${diff.toLocaleString()} / ${sign}${perc}%)</span>`;
                        }
                        return `${val.toLocaleString()} TON`;
                    }
                }
            },
            legend: {
                show: true,
                position: 'top',
                horizontalAlign: 'right',
                labels: { colors: '#e0e0e0' }
            }
        };

        if (this.charts.global) this.charts.global.destroy();
        this.charts.global = new ApexCharts(ctx, options);
        this.charts.global.render();
    },

    showGlobalDetail: function (label, value) {
        document.getElementById('detailPlaceholder').style.display = 'none';
        document.getElementById('chartSpecific').style.display = 'none';
        const diffPanel = document.getElementById('global-diff-detail');
        diffPanel.style.display = 'block';

        document.getElementById('detailTitle').innerHTML = `<span style="color:#fff">SNAPSHOT: ${label}</span> // ANALYSIS FEED`;

        // Logika Gainers & Losers (Simulasi Komparasi Skala Besar)
        const gainers = [];
        const losers = [];

        this.data.materials.slice(0, 40).forEach(m => {
            // Skala simulasi diperbesar agar akumulasinya logis dengan 20rb ton
            const diff = Math.floor(Math.random() * 800) - 300;
            if (diff > 0) gainers.push({ name: m.name, val: diff });
            else if (diff < 0) losers.push({ name: m.name, val: Math.abs(diff) });
        });

        const gList = document.getElementById('list-gainers');
        const lList = document.getElementById('list-losers');

        gList.innerHTML = gainers.sort((a, b) => b.val - a.val).slice(0, 10).map(g => `
            <div style="display:flex; justify-content:space-between; background:rgba(0,255,136,0.05); padding:5px 10px; border-radius:4px; border-left:2px solid var(--neon-green);">
                <span title="${g.name}" style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px;">${g.name}</span>
                <span style="color:var(--neon-green); font-family:'Rajdhani'; font-weight:700;">+${g.val.toLocaleString()} T</span>
            </div>
        `).join('');

        lList.innerHTML = losers.sort((a, b) => b.val - a.val).slice(0, 10).map(l => `
            <div style="display:flex; justify-content:space-between; background:rgba(255,0,60,0.05); padding:5px 10px; border-radius:4px; border-left:2px solid var(--neon-red);">
                <span title="${l.name}" style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px;">${l.name}</span>
                <span style="color:var(--neon-red); font-family:'Rajdhani'; font-weight:700;">-${l.val.toLocaleString()} T</span>
            </div>
        `).join('');

    },


    renderFastMoving: function () {
        const stats = DataService.getAnalytics(this.data).top10;

        const options = {
            series: [{
                name: 'EXIT VOLUME',
                data: stats.map(s => s.totalTon)
            }],
            chart: { type: 'bar', height: '100%', toolbar: { show: false } },
            plotOptions: {
                bar: { borderRadius: 4, horizontal: true, barHeight: '60%' }
            },
            colors: ['#00ff88'],
            xaxis: {
                categories: stats.map(s => s.name.substring(0, 10)),
                labels: { style: { colors: '#64748b' } }
            },
            yaxis: { labels: { style: { colors: '#64748b' } } },
            grid: { borderColor: 'rgba(255,255,255,0.05)' }
        };

        if (this.charts.fast) this.charts.fast.destroy();
        this.charts.fast = new ApexCharts(document.querySelector("#chartFastMoving"), options);
        this.charts.fast.render();
    },

    showDetail: function (mat) {
        this.selectedMaterial = mat;
        document.getElementById('detailPlaceholder').style.display = 'none';
        document.getElementById('chartSpecific').style.display = 'block';
        document.getElementById('detailTitle').innerHTML = `<span style="color:#fff">${mat.name}</span> // DETAILED ANALYSIS`;

        const labels = ['01 Feb', '02 Feb', '03 Feb', '04 Feb', '05 Feb', '06 Feb', '07 Feb'];
        const data = labels.map(() => Math.floor(Math.random() * 100) + 50);

        const options = {
            series: [{ name: 'STOCK LEVEL', data: data }],
            chart: { type: 'area', height: '100%', toolbar: { show: false } },
            colors: ['#ffcc00'],
            stroke: { curve: 'smooth', width: 2 },
            fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } },
            xaxis: { categories: labels, labels: { style: { colors: '#64748b' } } },
            yaxis: { labels: { style: { colors: '#64748b' } } },
            grid: { borderColor: 'rgba(255,255,255,0.05)' }
        };

        if (this.charts.specific) this.charts.specific.destroy();
        this.charts.specific = new ApexCharts(document.querySelector("#chartSpecific"), options);
        this.charts.specific.render();
    }
};

window.onload = () => HistoryApp.init();
