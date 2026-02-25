/**
 * SMART WAREHOUSE V2.0 - CPO INVENTORY ACCURACY
 * Complete analytics engine: clock, stock comparison, charts, particle effects, stability analysis
 */

let globalInventoryData = [];
let chartTimeline, chartDelta, chartTankAccuracy, chartVarianceTrend, chartRadar, chartCumulative;

const TANK_LABELS = ['TK01', 'TK02', 'TK03', 'TK04', 'TK05', 'TK06', 'TK07'];
const TANK_COLORS = ['#a3e635', '#38bdf8', '#c084fc', '#f87171', '#fbbf24', '#34d399', '#818cf8'];

// ============================
// HIGHCHARTS GLOBAL THEME
// ============================
Highcharts.theme = {
    colors: TANK_COLORS,
    chart: {
        backgroundColor: 'transparent',
        style: { fontFamily: 'Inter, sans-serif' }
    },
    title: { style: { color: '#f8fafc', fontWeight: 'bold', fontSize: '0.85rem' } },
    legend: {
        itemStyle: { color: '#94a3b8', fontSize: '0.75rem' },
        itemHoverStyle: { color: '#fff' }
    },
    xAxis: {
        labels: { style: { color: '#94a3b8', fontSize: '0.7rem' } },
        lineColor: 'rgba(255,255,255,0.08)',
        tickColor: 'rgba(255,255,255,0.08)'
    },
    yAxis: {
        gridLineColor: 'rgba(255,255,255,0.04)',
        labels: { style: { color: '#94a3b8', fontSize: '0.7rem' } },
        title: { style: { color: '#94a3b8', fontSize: '0.75rem' } }
    },
    tooltip: {
        backgroundColor: 'rgba(8, 8, 16, 0.96)',
        style: { color: '#fff', fontSize: '0.78rem' },
        borderWidth: 1,
        borderColor: 'rgba(163, 230, 53, 0.25)',
        borderRadius: 10,
        shadow: false
    },
    credits: { enabled: false }
};
Highcharts.setOptions(Highcharts.theme);

// ============================
// INIT
// ============================
document.addEventListener('DOMContentLoaded', () => {
    startClock();
    initParticles();
    init();
    scheduleAutoRefresh();
    document.getElementById('monthFilter').addEventListener('change', updateView);
    document.getElementById('tankFilter').addEventListener('change', updateView);

    // Close modal on overlay click
    document.getElementById('stockDetailModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeStockDetail();
    });

    // Close modal on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeStockDetail();
    });
});

function init() {
    const baseUrl = CONFIG.CPO_DOWNTIME_API_URL.split('?')[0];
    const cb = 'cpo_inv_' + Math.round(Math.random() * 100000);

    window[cb] = (json) => {
        delete window[cb];
        if (json && json.success) {
            globalInventoryData = json.data;
            populateMonthFilter(globalInventoryData);
            updateView();
        } else {
            console.error("API Error:", json ? json.message : "Invalid data shape");
            alert("Gagal memuat data Inventory: " + (json ? json.message : "Response Invalid"));
        }
        document.getElementById('loader').classList.add('hidden');
    };

    const script = document.createElement('script');
    script.src = `${baseUrl}?action=getInventoryData&callback=${cb}&t=${Date.now()}`;
    script.onerror = () => {
        console.error("Network Error (JSONP)");
        alert("Gagal terhubung ke Server CPO.");
        document.getElementById('loader').classList.add('hidden');
    };
    document.body.appendChild(script);
}

// ============================
// LIVE CLOCK
// ============================
function startClock() {
    const dayNames = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

    function update() {
        const now = new Date();
        document.getElementById('clock-day').textContent = dayNames[now.getDay()];
        document.getElementById('clock-date').textContent =
            `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        document.getElementById('clock-time').textContent = `${h}:${m}`;
        document.getElementById('clock-secs').textContent = `: ${s}`;

        // Progress ring based on seconds
        const circumference = 2 * Math.PI * 17; // r=17
        const offset = circumference - (now.getSeconds() / 60) * circumference;
        document.getElementById('clock-ring').style.strokeDashoffset = offset;
    }

    update();
    setInterval(update, 1000);
}

// ============================
// PARTICLE ANIMATION
// ============================
function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = [];
    const count = 60;

    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            r: Math.random() * 1.5 + 0.5,
            a: Math.random() * 0.3 + 0.1
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(163, 230, 53, ${p.a})`;
            ctx.fill();
        });

        // Draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(163, 230, 53, ${0.06 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(draw);
    }
    draw();
}

// ============================
// MONTH FILTER POPULATION
// ============================
function populateMonthFilter(data) {
    const sel = document.getElementById('monthFilter');
    const months = new Set();

    data.forEach(row => {
        const parts = row.tanggal.split('-');
        if (parts.length === 3) {
            months.add(`${parts[2]}-${parts[1]}`);
        }
    });

    const sorted = Array.from(months).sort().reverse();
    const monthNames = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    sorted.forEach(my => {
        const parts = my.split('-');
        const opt = document.createElement('option');
        opt.value = my;
        opt.textContent = `${monthNames[parseInt(parts[1], 10)]} ${parts[0]}`;
        sel.appendChild(opt);
    });
}

// ============================
// UPDATE VIEW
// ============================
function updateView() {
    const monthVal = document.getElementById('monthFilter').value;
    const tankVal = document.getElementById('tankFilter').value;

    let filtered = [...globalInventoryData].sort((a, b) => {
        const pA = a.tanggal.split('-'), pB = b.tanggal.split('-');
        if (pA.length !== 3 || pB.length !== 3) return 0;
        return new Date(pA[2], pA[1] - 1, pA[0]) - new Date(pB[2], pB[1] - 1, pB[0]);
    });

    if (monthVal !== 'ALL') {
        filtered = filtered.filter(r => {
            const parts = r.tanggal.split('-');
            return parts.length === 3 && `${parts[2]}-${parts[1]}` === monthVal;
        });
    }

    renderStockComparison(filtered, tankVal);
    renderMetrics(filtered, tankVal);
    renderTimelineChart(filtered, tankVal);
    renderTankVarianceBars(filtered);
    renderDeltaAnalysis(filtered, tankVal);
    renderTankAccuracyChart(filtered);
    renderVarianceTrendChart(filtered);
    renderTankInsights(filtered);
    renderRadarChart(filtered);
    renderCumulativeChart(filtered, tankVal);
}

function getSum(arr) {
    return arr.reduce((sum, val) => sum + (Number(val) || 0), 0);
}

// ============================
// STOCK COMPARISON + CONNECTORS (TODAY's DATA)
// ============================
let todayRow = null; // Store today's row for modal access

function getTodayString() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function findTodayRow(allData) {
    const todayStr = getTodayString();
    // Try exact match first
    let row = allData.find(r => r.tanggal === todayStr);
    if (row) return row;

    // If no today data yet, use the latest available row
    // Sort all data chronologically and take the last one
    const sorted = [...allData].sort((a, b) => {
        const pA = a.tanggal.split('-'), pB = b.tanggal.split('-');
        if (pA.length !== 3 || pB.length !== 3) return 0;
        return new Date(pA[2], pA[1] - 1, pA[0]) - new Date(pB[2], pB[1] - 1, pB[0]);
    });
    return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

function renderStockComparison(data, tankFilter) {
    // Always use global data for today lookup (not filtered)
    const row = findTodayRow(globalInventoryData);
    todayRow = row; // Store for modal

    // Update today date badge
    const dateEl = document.getElementById('stock-today-date');
    if (row) {
        dateEl.textContent = row.tanggal;
    } else {
        dateEl.textContent = '—';
    }

    if (!row) {
        ['total-data', 'total-aktual', 'total-sap'].forEach(id => {
            document.getElementById(id).innerHTML = '0 <span class="stock-unit">KG</span>';
        });
        return;
    }

    let dataTotal, aktualTotal, sapTotal;

    if (tankFilter === 'ALL') {
        dataTotal = getSum(row.data_stock);
        aktualTotal = getSum(row.cek_aktual);
        sapTotal = getSum(row.sap);
    } else {
        const idx = parseInt(tankFilter, 10);
        dataTotal = Number(row.data_stock[idx]) || 0;
        aktualTotal = Number(row.cek_aktual[idx]) || 0;
        sapTotal = Number(row.sap[idx]) || 0;
    }

    const fmt = v => Math.round(v).toLocaleString('en-US');

    document.getElementById('total-data').innerHTML = `${fmt(dataTotal)} <span class="stock-unit">KG</span>`;
    document.getElementById('total-aktual').innerHTML = `${fmt(aktualTotal)} <span class="stock-unit">KG</span>`;
    document.getElementById('total-sap').innerHTML = `${fmt(sapTotal)} <span class="stock-unit">KG</span>`;

    // Connectors
    const setConnector = (id, diff, ref) => {
        const el = document.getElementById(id);
        const absDiff = Math.abs(diff);
        const pct = ref > 0 ? (absDiff / ref) * 100 : 0;
        const sign = diff >= 0 ? '+' : '';
        el.textContent = `Δ ${sign}${fmt(diff)} KG`;

        el.className = 'connector-badge';
        if (pct <= 1) el.classList.add('green');
        else if (pct <= 3) el.classList.add('yellow');
        else el.classList.add('red');
    };

    setConnector('diff-data-aktual', aktualTotal - dataTotal, dataTotal);
    setConnector('diff-aktual-sap', sapTotal - aktualTotal, aktualTotal);
    setConnector('diff-data-sap', sapTotal - dataTotal, dataTotal);
}

// ============================
// METRICS (ACCURACY + SELISIH)
// ============================
function renderMetrics(data, tankFilter) {
    if (data.length === 0) {
        document.getElementById('card-aktual-gap').innerHTML = '0 <span class="acc-unit">KG</span>';
        document.getElementById('card-sap-gap').innerHTML = '0 <span class="acc-unit">KG</span>';
        document.getElementById('card-aktual-acc').innerText = '0%';
        document.getElementById('card-sap-acc').innerText = '0%';
        return;
    }

    let sumData = 0, sumAktualAbsDiff = 0, sumSapAbsDiff = 0;

    data.forEach(r => {
        if (tankFilter === 'ALL') {
            const rd = getSum(r.data_stock), ra = getSum(r.cek_aktual), rs = getSum(r.sap);
            sumData += rd;
            sumAktualAbsDiff += Math.abs(ra - rd);
            sumSapAbsDiff += Math.abs(rs - rd);
        } else {
            const idx = parseInt(tankFilter, 10);
            const td = Number(r.data_stock[idx]) || 0;
            const ta = Number(r.cek_aktual[idx]) || 0;
            const ts = Number(r.sap[idx]) || 0;
            sumData += td;
            sumAktualAbsDiff += Math.abs(ta - td);
            sumSapAbsDiff += Math.abs(ts - td);
        }
    });

    const aktualAcc = sumData > 0 ? 100 - ((sumAktualAbsDiff / sumData) * 100) : 0;
    const sapAcc = sumData > 0 ? 100 - ((sumSapAbsDiff / sumData) * 100) : 0;

    const fmtKG = v => `${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })} <span class="acc-unit">KG</span>`;
    document.getElementById('card-aktual-gap').innerHTML = fmtKG(sumAktualAbsDiff);
    document.getElementById('card-sap-gap').innerHTML = fmtKG(sumSapAbsDiff);

    const aktAccEl = document.getElementById('card-aktual-acc');
    const sapAccEl = document.getElementById('card-sap-acc');
    aktAccEl.innerText = `${Math.max(0, aktualAcc).toFixed(2)}%`;
    sapAccEl.innerText = `${Math.max(0, sapAcc).toFixed(2)}%`;

    aktAccEl.style.color = aktualAcc >= 98 ? 'var(--accent-green)' : (aktualAcc >= 95 ? '#fbbf24' : 'var(--accent-red)');
    sapAccEl.style.color = sapAcc >= 98 ? 'var(--accent-green)' : (sapAcc >= 95 ? '#fbbf24' : 'var(--accent-red)');
}

// ============================
// CHART 1: TIMELINE
// ============================
function renderTimelineChart(data, tankFilter) {
    const categories = [], sData = [], sAktual = [], sSap = [];

    data.forEach(r => {
        categories.push(r.tanggal.substring(0, 5));
        if (tankFilter === 'ALL') {
            sData.push(getSum(r.data_stock));
            sAktual.push(getSum(r.cek_aktual));
            sSap.push(getSum(r.sap));
        } else {
            const idx = parseInt(tankFilter, 10);
            sData.push(Number(r.data_stock[idx]) || 0);
            sAktual.push(Number(r.cek_aktual[idx]) || 0);
            sSap.push(Number(r.sap[idx]) || 0);
        }
    });

    if (chartTimeline) chartTimeline.destroy();

    chartTimeline = Highcharts.chart('chart-timeline', {
        chart: { type: 'areaspline', backgroundColor: 'transparent' },
        title: { text: null },
        xAxis: { categories },
        yAxis: { title: { text: 'STOCK (KG)' } },
        plotOptions: {
            areaspline: {
                fillOpacity: 0.08,
                lineWidth: 2.5,
                marker: { symbol: 'circle', radius: 3, fillColor: '#fff', lineWidth: 2, lineColor: null }
            }
        },
        series: [{
            name: 'DATA STOCK (LOGBOOK)',
            data: sData,
            color: '#a3e635',
            fillColor: {
                linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                stops: [[0, 'rgba(163,230,53,0.15)'], [1, 'rgba(163,230,53,0)']]
            }
        }, {
            name: 'CEK AKTUAL (PHYSICAL)',
            data: sAktual,
            color: '#38bdf8',
            fillColor: {
                linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                stops: [[0, 'rgba(56,189,248,0.12)'], [1, 'rgba(56,189,248,0)']]
            }
        }, {
            name: 'SAP SYSTEM',
            data: sSap,
            color: '#c084fc',
            fillColor: {
                linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                stops: [[0, 'rgba(192,132,252,0.10)'], [1, 'rgba(192,132,252,0)']]
            }
        }]
    });
}

// ============================
// CHART 2: DAILY DELTA ANALYSIS
// ============================
function renderDeltaAnalysis(data, tankFilter) {
    const categories = [], deltaAktual = [], deltaSap = [];

    data.forEach(r => {
        categories.push(r.tanggal.substring(0, 5));
        if (tankFilter === 'ALL') {
            const d = getSum(r.data_stock), a = getSum(r.cek_aktual), s = getSum(r.sap);
            deltaAktual.push(a - d);
            deltaSap.push(s - d);
        } else {
            const idx = parseInt(tankFilter, 10);
            const d = Number(r.data_stock[idx]) || 0;
            const a = Number(r.cek_aktual[idx]) || 0;
            const s = Number(r.sap[idx]) || 0;
            deltaAktual.push(a - d);
            deltaSap.push(s - d);
        }
    });

    if (chartDelta) chartDelta.destroy();

    chartDelta = Highcharts.chart('chart-delta', {
        chart: { type: 'column', backgroundColor: 'transparent' },
        title: { text: null },
        xAxis: { categories },
        yAxis: {
            title: { text: 'SELISIH (KG)' },
            plotLines: [{ value: 0, color: 'rgba(255,255,255,0.15)', width: 1 }]
        },
        plotOptions: {
            column: {
                borderRadius: 3,
                borderWidth: 0,
                groupPadding: 0.15,
                pointPadding: 0.05
            }
        },
        tooltip: {
            shared: true,
            formatter: function () {
                let s = `<b>${this.x}</b><br/>`;
                this.points.forEach(p => {
                    const arrow = p.y > 0 ? '▲' : (p.y < 0 ? '▼' : '●');
                    s += `<span style="color:${p.series.color}">${arrow}</span> ${p.series.name}: <b>${p.y.toLocaleString()} KG</b><br/>`;
                });
                // Find which tank caused the biggest deviation
                if (tankFilter === 'ALL' && data.length > 0) {
                    const dayIdx = categories.indexOf(this.x);
                    if (dayIdx >= 0) {
                        const row = data[dayIdx];
                        let maxTank = '', maxDev = 0;
                        for (let i = 0; i < 7; i++) {
                            const dev = Math.abs((Number(row.cek_aktual[i]) || 0) - (Number(row.data_stock[i]) || 0));
                            if (dev > maxDev) { maxDev = dev; maxTank = TANK_LABELS[i]; }
                        }
                        if (maxTank) s += `<br/><span style="color:#fbbf24">⚠ Penyebab Utama: ${maxTank} (${maxDev.toLocaleString()} KG)</span>`;
                    }
                }
                return s;
            }
        },
        series: [{
            name: 'DELTA AKTUAL vs DATA',
            data: deltaAktual,
            color: '#38bdf8'
        }, {
            name: 'DELTA SAP vs DATA',
            data: deltaSap,
            color: '#c084fc'
        }]
    });
}

// ============================
// CHART 3: PER-TANK ACCURACY
// ============================
function renderTankAccuracyChart(data) {
    if (data.length === 0) {
        if (chartTankAccuracy) chartTankAccuracy.destroy();
        return;
    }

    // Calculate per-tank accuracy
    const accAktual = [], accSap = [];

    for (let i = 0; i < 7; i++) {
        let sumD = 0, sumDiffA = 0, sumDiffS = 0;
        data.forEach(r => {
            const d = Number(r.data_stock[i]) || 0;
            const a = Number(r.cek_aktual[i]) || 0;
            const s = Number(r.sap[i]) || 0;
            sumD += d;
            sumDiffA += Math.abs(a - d);
            sumDiffS += Math.abs(s - d);
        });
        accAktual.push(sumD > 0 ? Math.max(0, 100 - (sumDiffA / sumD * 100)) : 100);
        accSap.push(sumD > 0 ? Math.max(0, 100 - (sumDiffS / sumD * 100)) : 100);
    }

    if (chartTankAccuracy) chartTankAccuracy.destroy();

    chartTankAccuracy = Highcharts.chart('chart-tank-accuracy', {
        chart: { type: 'bar', backgroundColor: 'transparent' },
        title: { text: null },
        xAxis: { categories: TANK_LABELS },
        yAxis: {
            min: 90, max: 100.5,
            title: { text: 'ACCURACY (%)' },
            plotBands: [
                { from: 98, to: 101, color: 'rgba(163,230,53,0.05)', label: { text: 'TARGET ≥98%', style: { color: '#a3e635', fontSize: '0.65rem' } } }
            ]
        },
        plotOptions: {
            bar: {
                borderRadius: 4,
                borderWidth: 0,
                dataLabels: {
                    enabled: true,
                    format: '{y:.1f}%',
                    style: { color: '#fff', fontSize: '0.7rem', textOutline: 'none' }
                }
            }
        },
        series: [{
            name: 'AKURASI AKTUAL',
            data: accAktual,
            color: '#38bdf8'
        }, {
            name: 'AKURASI SAP',
            data: accSap,
            color: '#c084fc'
        }]
    });
}

// ============================
// CHART 4: VARIANCE TREND BY TANK
// ============================
function renderVarianceTrendChart(data) {
    if (data.length === 0) {
        if (chartVarianceTrend) chartVarianceTrend.destroy();
        return;
    }

    const categories = data.map(r => r.tanggal.substring(0, 5));
    const series = [];

    for (let t = 0; t < 7; t++) {
        const vals = data.map(r => {
            const d = Number(r.data_stock[t]) || 0;
            const a = Number(r.cek_aktual[t]) || 0;
            return Math.abs(a - d);
        });
        series.push({
            name: TANK_LABELS[t],
            data: vals,
            color: TANK_COLORS[t]
        });
    }

    if (chartVarianceTrend) chartVarianceTrend.destroy();

    chartVarianceTrend = Highcharts.chart('chart-variance-trend', {
        chart: { type: 'area', backgroundColor: 'transparent' },
        title: { text: null },
        xAxis: { categories },
        yAxis: { title: { text: 'VARIANCE |AKTUAL - DATA| (KG)' } },
        plotOptions: {
            area: {
                stacking: 'normal',
                fillOpacity: 0.3,
                lineWidth: 1.5,
                marker: { enabled: false }
            }
        },
        tooltip: {
            shared: true,
            headerFormat: '<b>{point.key}</b><br/>',
            pointFormat: '<span style="color:{series.color}">●</span> {series.name}: <b>{point.y:,.0f} KG</b><br/>'
        },
        series
    });
}

// ============================
// CHART 5: TANK STABILITY RADAR
// ============================
function renderRadarChart(data) {
    if (data.length === 0) {
        if (chartRadar) chartRadar.destroy();
        return;
    }

    // Stability metric: coefficient of variation of daily delta per tank
    // Lower CV = more stable
    const stability = [];
    for (let t = 0; t < 7; t++) {
        const deltas = data.map(r => {
            const d = Number(r.data_stock[t]) || 0;
            const a = Number(r.cek_aktual[t]) || 0;
            return Math.abs(a - d);
        });
        const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
        const variance = deltas.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / deltas.length;
        const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
        stability.push(Math.round(cv));
    }

    // Also compute SAP stability
    const sapStability = [];
    for (let t = 0; t < 7; t++) {
        const deltas = data.map(r => {
            const d = Number(r.data_stock[t]) || 0;
            const s = Number(r.sap[t]) || 0;
            return Math.abs(s - d);
        });
        const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
        const variance = deltas.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / deltas.length;
        const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
        sapStability.push(Math.round(cv));
    }

    if (chartRadar) chartRadar.destroy();

    chartRadar = Highcharts.chart('chart-radar', {
        chart: {
            polar: true,
            type: 'line',
            backgroundColor: 'transparent'
        },
        title: { text: null },
        pane: {
            size: '85%',
            background: [{
                backgroundColor: 'rgba(255,255,255,0.02)',
                borderColor: 'rgba(255,255,255,0.05)',
                borderWidth: 1
            }]
        },
        xAxis: {
            categories: TANK_LABELS,
            tickmarkPlacement: 'on',
            lineWidth: 0
        },
        yAxis: {
            gridLineInterpolation: 'polygon',
            min: 0,
            title: { text: 'CV (%)' }
        },
        tooltip: {
            headerFormat: '<b>{point.key}</b><br/>',
            pointFormat: '{series.name}: <b>{point.y}% CV</b><br/><span style="font-size:0.7rem;color:#94a3b8">Semakin tinggi = semakin fluktuatif</span>'
        },
        series: [{
            name: 'FLUKTUASI AKTUAL',
            data: stability,
            color: '#38bdf8',
            pointPlacement: 'on',
            fillOpacity: 0.15,
            type: 'area'
        }, {
            name: 'FLUKTUASI SAP',
            data: sapStability,
            color: '#c084fc',
            pointPlacement: 'on',
            fillOpacity: 0.1,
            type: 'area'
        }]
    });
}

// ============================
// CHART 6: CUMULATIVE DEVIATION TREND
// ============================
function renderCumulativeChart(data, tankFilter) {
    const categories = [];
    const cumAktual = [], cumSap = [];
    let runningA = 0, runningS = 0;

    data.forEach(r => {
        categories.push(r.tanggal.substring(0, 5));
        let dayDiff_A, dayDiff_S;
        if (tankFilter === 'ALL') {
            dayDiff_A = getSum(r.cek_aktual) - getSum(r.data_stock);
            dayDiff_S = getSum(r.sap) - getSum(r.data_stock);
        } else {
            const idx = parseInt(tankFilter, 10);
            dayDiff_A = (Number(r.cek_aktual[idx]) || 0) - (Number(r.data_stock[idx]) || 0);
            dayDiff_S = (Number(r.sap[idx]) || 0) - (Number(r.data_stock[idx]) || 0);
        }
        runningA += dayDiff_A;
        runningS += dayDiff_S;
        cumAktual.push(runningA);
        cumSap.push(runningS);
    });

    if (chartCumulative) chartCumulative.destroy();

    chartCumulative = Highcharts.chart('chart-cumulative', {
        chart: { type: 'spline', backgroundColor: 'transparent' },
        title: { text: null },
        xAxis: { categories },
        yAxis: {
            title: { text: 'KUMULATIF DEVIASI (KG)' },
            plotLines: [{ value: 0, color: 'rgba(255,255,255,0.12)', width: 1, dashStyle: 'Dash' }]
        },
        plotOptions: {
            spline: {
                lineWidth: 2.5,
                marker: { symbol: 'circle', radius: 2 }
            }
        },
        tooltip: {
            shared: true,
            headerFormat: '<b>{point.key}</b><br/>',
            pointFormat: '<span style="color:{series.color}">●</span> {series.name}: <b>{point.y:,.0f} KG</b><br/>'
        },
        series: [{
            name: 'KUMULATIF DELTA AKTUAL',
            data: cumAktual,
            color: '#38bdf8',
            zones: [{ value: 0, color: '#f87171' }, { color: '#38bdf8' }]
        }, {
            name: 'KUMULATIF DELTA SAP',
            data: cumSap,
            color: '#c084fc',
            zones: [{ value: 0, color: '#fb923c' }, { color: '#c084fc' }]
        }]
    });
}

// ============================
// TANK VARIANCE BARS (NOW 7 CHARTS)
// ============================
function renderTankVarianceBars(data) {
    if (data.length === 0) return;

    const categories = data.map(r => r.tanggal.substring(0, 5));

    for (let t = 0; t < 7; t++) {
        const deltaAktualData = []; // Data vs Aktual (Aktual - Data)
        const deltaSapData = [];    // Data vs SAP (SAP - Data)
        const deltaSapAktual = [];  // Aktual vs SAP (SAP - Aktual)

        data.forEach(r => {
            const d = Number(r.data_stock[t]) || 0;
            const a = Number(r.cek_aktual[t]) || 0;
            const s = Number(r.sap[t]) || 0;

            deltaAktualData.push(a - d);
            deltaSapData.push(s - d);
            deltaSapAktual.push(s - a);
        });

        Highcharts.chart(`chart-tk0${t + 1}-var`, {
            chart: { type: 'column', backgroundColor: 'transparent' },
            title: { text: null },
            xAxis: {
                categories,
                labels: { style: { fontSize: '0.65rem' } }
            },
            yAxis: {
                title: { text: null },
                plotLines: [{ value: 0, color: 'rgba(255,255,255,0.2)', width: 1 }],
                labels: { style: { fontSize: '0.65rem' } }
            },
            legend: {
                enabled: true,
                itemStyle: { fontSize: '0.65rem' }
            },
            plotOptions: {
                column: {
                    borderRadius: 3,
                    borderWidth: 0,
                    groupPadding: 0.1,
                    pointPadding: 0.05
                }
            },
            tooltip: {
                shared: true,
                style: { fontSize: '0.75rem' },
                formatter: function () {
                    let s = `<b>${this.x}</b><br/>`;
                    this.points.forEach(p => {
                        const arrow = p.y > 0 ? '▲' : (p.y < 0 ? '▼' : '●');
                        const prefix = p.y > 0 ? '+' : '';
                        s += `<span style="color:${p.series.color}">${arrow}</span> ${p.series.name}: <b>${prefix}${p.y.toLocaleString()} KG</b><br/>`;
                    });
                    return s;
                }
            },
            series: [{
                name: 'DATA vs AKTUAL',
                data: deltaAktualData,
                color: '#38bdf8'
            }, {
                name: 'DATA vs SAP',
                data: deltaSapData,
                color: '#c084fc'
            }, {
                name: 'AKTUAL vs SAP',
                data: deltaSapAktual,
                color: '#a3e635'
            }],
            credits: { enabled: false }
        });
    }
}

// ============================
// TANK INSIGHTS (STABILITY ANALYSIS)
// ============================
function renderTankInsights(data) {
    const listEl = document.getElementById('tank-insights-list');
    listEl.innerHTML = '';
    if (data.length === 0) return;

    for (let t = 0; t < 7; t++) {
        // Compute stats
        const deltas = data.map(r => {
            return (Number(r.cek_aktual[t]) || 0) - (Number(r.data_stock[t]) || 0);
        });

        const absDeltas = deltas.map(d => Math.abs(d));
        const avgDelta = absDeltas.reduce((s, v) => s + v, 0) / absDeltas.length;
        const maxDelta = Math.max(...absDeltas);
        const minDelta = Math.min(...absDeltas);

        // Trend: is delta increasing or decreasing?
        let trendUp = 0, trendDown = 0;
        for (let i = 1; i < absDeltas.length; i++) {
            if (absDeltas[i] > absDeltas[i - 1]) trendUp++;
            else if (absDeltas[i] < absDeltas[i - 1]) trendDown++;
        }

        // CV for classification
        const mean = avgDelta;
        const variance = absDeltas.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / absDeltas.length;
        const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;

        let status, statusClass, reason;

        if (cv < 40 && avgDelta < 500) {
            status = 'STABIL';
            statusClass = 'stable';
            reason = `Variansi rata-rata ${Math.round(avgDelta).toLocaleString()} KG dengan fluktuasi rendah (CV ${cv.toFixed(0)}%). Tangki ini konsisten.`;
        } else if (cv >= 40 && cv < 80) {
            status = 'FLUKTUATIF';
            statusClass = 'fluctuative';
            reason = `Selisih bervariasi antara ${Math.round(minDelta).toLocaleString()}-${Math.round(maxDelta).toLocaleString()} KG (CV ${cv.toFixed(0)}%). ` +
                (trendUp > trendDown ?
                    'Trend selisih cenderung NAIK — perlu dicek penerimaan/usage.' :
                    'Trend selisih cenderung TURUN — perbaikan teridentifikasi.');
        } else {
            status = 'DEVIASI TINGGI';
            statusClass = 'deviant';
            reason = `Fluktuasi tinggi (CV ${cv.toFixed(0)}%), rata-rata selisih ${Math.round(avgDelta).toLocaleString()} KG, puncak ${Math.round(maxDelta).toLocaleString()} KG. ` +
                'Perlu investigasi: cek kalibrasi sensor, kebocoran, atau kesalahan input logbook.';
        }

        listEl.innerHTML += `
            <div class="insight-card">
                <div class="insight-tank">
                    <span style="color:${TANK_COLORS[t]}">${TANK_LABELS[t]}</span>
                    <span class="insight-status ${statusClass}">${status}</span>
                </div>
                <div class="insight-reason">${reason}</div>
            </div>`;
    }
}

// ============================
// STOCK DETAIL MODAL
// ============================
function openStockDetail(focusType) {
    if (!todayRow) return;

    const modal = document.getElementById('stockDetailModal');
    const tbody = document.getElementById('modal-tbody');
    const titleEl = document.getElementById('modal-title');
    const dateEl = document.getElementById('modal-date');

    const titles = {
        'data': 'DETAIL RINCIAN — DATA STOCK (LOGBOOK)',
        'aktual': 'DETAIL RINCIAN — CEK AKTUAL (PHYSICAL)',
        'sap': 'DETAIL RINCIAN — SAP SYSTEM STOCK'
    };

    titleEl.textContent = titles[focusType] || 'DETAIL RINCIAN PER TANGKI';
    dateEl.textContent = `Tanggal: ${todayRow.tanggal}`;

    const fmt = v => Math.round(v).toLocaleString('en-US');
    let html = '';

    let totalD = 0, totalA = 0, totalS = 0;

    for (let i = 0; i < 7; i++) {
        const d = Number(todayRow.data_stock[i]) || 0;
        const a = Number(todayRow.cek_aktual[i]) || 0;
        const s = Number(todayRow.sap[i]) || 0;
        const diffA = a - d;
        const diffS = s - d;

        totalD += d;
        totalA += a;
        totalS += s;

        const diffAClass = diffA === 0 ? '' : (Math.abs(diffA) < 500 ? 'val-yellow' : 'val-red');
        const diffSClass = diffS === 0 ? '' : (Math.abs(diffS) < 500 ? 'val-yellow' : 'val-red');
        const signA = diffA >= 0 ? '+' : '';
        const signS = diffS >= 0 ? '+' : '';

        // Highlight the focused column
        const highlightD = focusType === 'data' ? 'val-green' : '';
        const highlightA = focusType === 'aktual' ? 'val-blue' : '';
        const highlightS = focusType === 'sap' ? 'val-purple' : '';

        html += `<tr>
            <td style="color:${TANK_COLORS[i]}">${TANK_LABELS[i]}</td>
            <td class="${highlightD}">${fmt(d)}</td>
            <td class="${highlightA}">${fmt(a)}</td>
            <td class="${highlightS}">${fmt(s)}</td>
            <td class="${diffAClass}">${signA}${fmt(diffA)}</td>
            <td class="${diffSClass}">${signS}${fmt(diffS)}</td>
        </tr>`;
    }

    // Total row
    const totalDiffA = totalA - totalD;
    const totalDiffS = totalS - totalD;
    const signTA = totalDiffA >= 0 ? '+' : '';
    const signTS = totalDiffS >= 0 ? '+' : '';

    html += `<tr class="total-row">
        <td>TOTAL</td>
        <td class="val-green">${fmt(totalD)}</td>
        <td class="val-blue">${fmt(totalA)}</td>
        <td class="val-purple">${fmt(totalS)}</td>
        <td class="${totalDiffA === 0 ? '' : (Math.abs(totalDiffA) < 2000 ? 'val-yellow' : 'val-red')}">${signTA}${fmt(totalDiffA)}</td>
        <td class="${totalDiffS === 0 ? '' : (Math.abs(totalDiffS) < 2000 ? 'val-yellow' : 'val-red')}">${signTS}${fmt(totalDiffS)}</td>
    </tr>`;

    tbody.innerHTML = html;
    modal.classList.add('active');
}

function closeStockDetail() {
    document.getElementById('stockDetailModal').classList.remove('active');
}

// ============================
// AUTO-REFRESH AT 09:00 WIB
// ============================
function scheduleAutoRefresh() {
    function getNextRefresh() {
        const now = new Date();
        const target = new Date(now);
        target.setHours(9, 0, 0, 0);

        // If it's already past 09:00 today, schedule for tomorrow
        if (now >= target) {
            target.setDate(target.getDate() + 1);
        }

        return target - now;
    }

    function doRefresh() {
        console.log('[CPO Inventory] Auto-refresh triggered at 09:00 WIB');
        init(); // Re-fetch data from API

        // Schedule next refresh (tomorrow 09:00)
        setTimeout(doRefresh, getNextRefresh());
    }

    // Schedule first refresh
    const msUntilRefresh = getNextRefresh();
    console.log(`[CPO Inventory] Next auto-refresh in ${Math.round(msUntilRefresh / 60000)} minutes`);
    setTimeout(doRefresh, msUntilRefresh);
}
