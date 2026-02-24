/**
 * CPO DOWNTIME ANALYTICS - MAIN CONTROLLER
 * SMART WAREHOUSE V2.0
 */

const CPODowntimeApp = {
    rawData: [],
    filteredData: [],
    charts: {},

    // Mock Data untuk menampilkan UI karena API belum di-deploy
    mockData: [
        { tanggal: "2026-02-01", nopol: "BK 8123 AB", start_time: "08:00", end_time: "10:30", durasi_minutes: 150, netto_kg: 28500, suhu: 45, tanki: "TK01", shift: "SHIFT 1", keterangan: "LANCAR" },
        { tanggal: "2026-02-01", nopol: "BK 9921 CD", start_time: "10:45", end_time: "14:00", durasi_minutes: 195, netto_kg: 30200, suhu: 48, tanki: "TK02", shift: "SHIFT 1", keterangan: "QC LAMA" },
        { tanggal: "2026-02-01", nopol: "BK 7712 EF", start_time: "14:30", end_time: "16:45", durasi_minutes: 135, netto_kg: 27800, suhu: 44, tanki: "TK01", shift: "SHIFT 2", keterangan: "LANCAR" },
        { tanggal: "2026-02-02", nopol: "BK 1122 ZZ", start_time: "09:00", end_time: "12:00", durasi_minutes: 180, netto_kg: 29000, suhu: 46, tanki: "TK03", shift: "SHIFT 1", keterangan: "LANCAR" },
        { tanggal: "2026-02-02", nopol: "BK 3344 YY", start_time: "13:00", end_time: "16:30", durasi_minutes: 210, netto_kg: 31000, suhu: 50, tanki: "TK04", shift: "SHIFT 2", keterangan: "MANUVER SULIT" },
        { tanggal: "2026-02-03", nopol: "BK 5566 XX", start_time: "08:30", end_time: "11:00", durasi_minutes: 150, netto_kg: 28000, suhu: 43, tanki: "TK01", shift: "SHIFT 1", keterangan: "LANCAR" },
        { tanggal: "2026-02-03", nopol: "BK 7788 WW", start_time: "11:30", end_time: "13:45", durasi_minutes: 135, netto_kg: 29500, suhu: 47, tanki: "TK02", shift: "SHIFT 1", keterangan: "LANCAR" },
        { tanggal: "2026-02-04", nopol: "BK 9900 VV", start_time: "09:15", end_time: "11:45", durasi_minutes: 150, netto_kg: 30000, suhu: 45, tanki: "TK03", shift: "SHIFT 1", keterangan: "LANCAR" },
        { tanggal: "2026-02-04", nopol: "BK 1234 UU", start_time: "14:00", end_time: "17:30", durasi_minutes: 210, netto_kg: 28500, suhu: 49, tanki: "TK04", shift: "SHIFT 2", keterangan: "ANTRIAN PANJANG" }
    ],

    init: async function () {
        this.startLoading();
        this.initClock();
        this.setupFilters();

        await this.fetchData();
        this.applyFilters();

        this.stopLoading();
    },

    setupFilters: function () {
        const today = new Date();
        const monthSelect = document.getElementById('select-month');
        const yearSelect = document.getElementById('select-year');

        if (monthSelect) monthSelect.value = today.getMonth() + 1;
        if (yearSelect) yearSelect.value = today.getFullYear();

        monthSelect.addEventListener('change', () => this.applyFilters());
        yearSelect.addEventListener('change', () => this.applyFilters());
    },

    fetchData: async function () {
        if (!CONFIG.CPO_DOWNTIME_API_URL || CONFIG.CPO_DOWNTIME_API_URL === "") {
            console.warn("API URL not configured. Using Mock Data.");
            this.showMockWarning();
            this.rawData = this.mockData;
            return;
        }

        try {
            const res = await fetch(CONFIG.CPO_DOWNTIME_API_URL);
            const json = await res.json();
            if (json.success && json.data) {
                this.rawData = json.data.map(d => {
                    // 1. Standardize Date to YYYY-MM-DD
                    if (d.tanggal) {
                        try {
                            let tStr = String(d.tanggal).replace(/\(.*\)/g, '').trim();
                            let dateObj = new Date(tStr);
                            if (!isNaN(dateObj)) {
                                let y = dateObj.getFullYear();
                                let mo = String(dateObj.getMonth() + 1).padStart(2, '0');
                                let da = String(dateObj.getDate()).padStart(2, '0');
                                d.tanggal = `${y}-${mo}-${da}`;
                            }
                        } catch (e) { }
                    }

                    // 2. Fix duration bug
                    let dur = d.durasi_minutes;
                    if (!dur || dur <= 0 || dur > 1440 || isNaN(dur)) { // Invalid duration

                        if (d.start_time && d.end_time) {
                            let st = String(d.start_time).trim();
                            let et = String(d.end_time).trim();

                            // Extract just the time if formatted as a full string "Sat Dec 30 1899 21:29"
                            let mSt = st.match(/(\d{1,2}):(\d{2})/);
                            if (mSt) st = mSt[1].padStart(2, '0') + ":" + mSt[2];

                            let mEt = et.match(/(\d{1,2}):(\d{2})/);
                            if (mEt) et = mEt[1].padStart(2, '0') + ":" + mEt[2];

                            // If formatted as "0800" instead of "08:00"
                            if (st.length >= 3 && st.indexOf(':') === -1 && !isNaN(st)) {
                                st = st.substring(0, st.length - 2) + ":" + st.substring(st.length - 2);
                            }
                            if (et.length >= 3 && et.indexOf(':') === -1 && !isNaN(et)) {
                                et = et.substring(0, et.length - 2) + ":" + et.substring(et.length - 2);
                            }

                            let partsS = st.split(':');
                            let partsE = et.split(':');

                            if (partsS.length >= 2 && partsE.length >= 2) {
                                let ms = parseInt(partsS[0]) * 60 + parseInt(partsS[1]);
                                let me = parseInt(partsE[0]) * 60 + parseInt(partsE[1]);
                                dur = me - ms;
                                if (dur < 0) dur += 1440; // Crossed midnight
                            } else {
                                dur = 0;
                            }
                        } else {
                            dur = 0;
                        }
                    }

                    if (isNaN(dur)) dur = 0;
                    d.durasi_minutes = dur;
                    return d;
                });

                const statusIcon = document.getElementById('api-status-icon');
                if (statusIcon) {
                    statusIcon.className = "fas fa-satellite-dish";
                    statusIcon.style.color = "var(--neon-green)";
                }
                const syncTime = document.getElementById('last-sync-time');
                if (syncTime) {
                    syncTime.innerText = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }
            } else {
                throw new Error(json.message || "Failed to parse data");
            }
        } catch (error) {
            console.error("Fetch Data Error:", error);
            this.showMockWarning();
            this.rawData = this.mockData; // Fallback to mock
        }
    },

    showMockWarning: function () {
        const warning = document.getElementById('mock-warning');
        if (warning) warning.style.display = 'block';
    },

    applyFilters: function () {
        const m = parseInt(document.getElementById('select-month').value);
        const y = parseInt(document.getElementById('select-year').value);

        this.filteredData = this.rawData.filter(d => {
            if (!d.tanggal) return false;
            const dateObj = new Date(d.tanggal);
            return (dateObj.getMonth() + 1) === m && dateObj.getFullYear() === y;
        });

        this.calculateGrandTotals();
        this.renderDailyVolumeChart();
        this.renderDailyDurationChart();
        this.renderShiftDistribution();
        this.renderTankDistribution();
        this.renderCalendar();
    },

    calculateGrandTotals: function () {
        let totalNetto = 0;
        let totalDuration = 0;
        let totalSuhu = 0;
        let vehicleCount = this.filteredData.length;

        this.filteredData.forEach(d => {
            totalNetto += d.netto_kg || 0;
            totalDuration += d.durasi_minutes || 0;
            totalSuhu += d.suhu || 0;
        });

        const avgDuration = vehicleCount > 0 ? (totalDuration / vehicleCount) : 0;
        const avgSuhu = vehicleCount > 0 ? (totalSuhu / vehicleCount) : 0;
        const totalTon = totalNetto / 1000;

        document.getElementById('val-total-volume').innerText = totalTon.toLocaleString('id-ID', { maximumFractionDigits: 1 });
        document.getElementById('val-truck-count').innerText = vehicleCount.toLocaleString('id-ID');

        const h = Math.floor(avgDuration / 60);
        const m = Math.floor(avgDuration % 60);
        document.getElementById('val-avg-duration').innerText = `${h}H ${m}M`;
        document.getElementById('val-avg-suhu').innerText = avgSuhu.toFixed(1) + '°C';
    },

    // ---------------- CHARTS RENDERING ----------------

    renderDailyVolumeChart: function () {
        const agg = {};
        this.filteredData.forEach(d => {
            if (!agg[d.tanggal]) agg[d.tanggal] = 0;
            agg[d.tanggal] += (d.netto_kg || 0) / 1000;
        });

        const sortedDates = Object.keys(agg).sort();
        const dataSeries = sortedDates.map(date => Number(agg[date].toFixed(1)));
        const labels = sortedDates.map(d => {
            const dt = new Date(d);
            return `${dt.getDate()} ${dt.toLocaleString('default', { month: 'short' })}`;
        });

        if (this.charts.dailyVol) {
            this.charts.dailyVol.destroy();
        }

        const options = {
            series: [{ name: 'Volume CPO (Ton)', data: dataSeries }],
            chart: {
                type: 'area',
                height: 280,
                background: 'transparent',
                toolbar: { show: false },
                animations: { enabled: true, easing: 'easeinout', speed: 800 }
            },
            colors: ['#00f3ff'],
            fill: {
                type: 'gradient',
                gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1, stops: [0, 90, 100] }
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: {
                categories: labels,
                labels: { style: { colors: '#8892b0', fontFamily: 'Orbitron' } },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: { style: { colors: '#8892b0', fontFamily: 'Rajdhani', fontWeight: 600 } }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
            theme: { mode: 'dark' },
            tooltip: { theme: 'dark' }
        };

        this.charts.dailyVol = new ApexCharts(document.querySelector("#chart-daily-volume"), options);
        this.charts.dailyVol.render();
    },

    renderDailyDurationChart: function () {
        const agg = {};
        this.filteredData.forEach(d => {
            if (!agg[d.tanggal]) agg[d.tanggal] = { totalRaw: 0, count: 0 };
            agg[d.tanggal].totalRaw += (d.durasi_minutes || 0);
            agg[d.tanggal].count++;
        });

        const sortedDates = Object.keys(agg).sort();
        const dataSeries = sortedDates.map(date => {
            return Number((agg[date].totalRaw / agg[date].count).toFixed(0));
        });
        const labels = sortedDates.map(d => {
            const dt = new Date(d);
            return `${dt.getDate()} ${dt.toLocaleString('default', { month: 'short' })}`;
        });

        if (this.charts.dailyDur) this.charts.dailyDur.destroy();

        const options = {
            series: [{ name: 'Avg Duration (Min)', data: dataSeries }],
            chart: {
                type: 'bar',
                height: 250,
                background: 'transparent',
                toolbar: { show: false }
            },
            colors: ['#ff003c'],
            plotOptions: {
                bar: { borderRadius: 4, columnWidth: '50%' }
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories: labels,
                labels: { style: { colors: '#8892b0', fontFamily: 'Orbitron', fontSize: '10px' } }
            },
            yaxis: {
                labels: { style: { colors: '#8892b0', fontFamily: 'Rajdhani', fontWeight: 600 } }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            theme: { mode: 'dark' },
            tooltip: { theme: 'dark' }
        };

        this.charts.dailyDur = new ApexCharts(document.querySelector("#chart-daily-duration"), options);
        this.charts.dailyDur.render();
    },

    renderShiftDistribution: function () {
        const agg = {};
        this.filteredData.forEach(d => {
            const sh = d.shift || 'UNKNOWN';
            if (!agg[sh]) agg[sh] = 0;
            agg[sh] += (d.netto_kg || 0) / 1000;
        });

        const labels = Object.keys(agg);
        const dataSeries = labels.map(l => Number(agg[l].toFixed(1)));

        if (this.charts.shiftDist) this.charts.shiftDist.destroy();

        const options = {
            series: dataSeries,
            labels: labels,
            chart: {
                type: 'donut',
                height: 250,
                background: 'transparent'
            },
            colors: ['#bc13fe', '#00ff88', '#00f3ff', '#ffcc00'],
            stroke: { show: true, colors: ['#050505'], width: 2 },
            dataLabels: { enabled: true, style: { fontFamily: 'Rajdhani' } },
            legend: {
                position: 'bottom',
                labels: { colors: '#fff' },
                fontFamily: 'Orbitron'
            },
            theme: { mode: 'dark' },
            tooltip: { theme: 'dark' }
        };

        this.charts.shiftDist = new ApexCharts(document.querySelector("#chart-shift"), options);
        this.charts.shiftDist.render();
    },

    renderTankDistribution: function () {
        const agg = {};
        this.filteredData.forEach(d => {
            let tk = d.tanki ? String(d.tanki).toUpperCase().trim() : 'OTHER';
            if (tk === "" || tk === "-") tk = "OTHER";
            if (!agg[tk]) agg[tk] = 0;
            agg[tk]++; // Count by trucks, or volume? Let's do vehicle count.
        });

        const labels = Object.keys(agg);
        const dataSeries = labels.map(l => agg[l]);

        if (this.charts.tankDist) this.charts.tankDist.destroy();

        const options = {
            series: [{ data: dataSeries, name: 'Trucks Discharged' }],
            chart: {
                type: 'bar',
                height: 250,
                background: 'transparent',
                toolbar: { show: false }
            },
            plotOptions: {
                bar: { horizontal: true, borderRadius: 4, distributed: true }
            },
            colors: ['#ffcc00', '#00f3ff', '#00ff88', '#ff003c', '#bc13fe'],
            dataLabels: { enabled: true, style: { fontFamily: 'Rajdhani', colors: ['#000'] } },
            xaxis: {
                categories: labels,
                labels: { style: { colors: '#8892b0', fontFamily: 'Rajdhani' } }
            },
            yaxis: {
                labels: { style: { colors: '#fff', fontFamily: 'Orbitron', fontWeight: 600 } }
            },
            legend: { show: false },
            grid: { show: false },
            theme: { mode: 'dark' },
            tooltip: { theme: 'dark' }
        };

        this.charts.tankDist = new ApexCharts(document.querySelector("#chart-tank"), options);
        this.charts.tankDist.render();
    },

    // ---------------- CALENDAR & ANALYSIS ----------------

    renderCalendar: function () {
        const m = parseInt(document.getElementById('select-month').value);
        const y = parseInt(document.getElementById('select-year').value);
        const grid = document.getElementById('calendar-grid-v15');
        const monthYearLabel = document.getElementById('cal-month-year');
        if (!grid) return;

        const date = new Date(y, m - 1, 1);
        const monthName = date.toLocaleString('id-ID', { month: 'long' });
        if (monthYearLabel) monthYearLabel.innerText = `${monthName.toUpperCase()} ${y}`;

        // Aggregate volume per day
        const agg = {};
        this.filteredData.forEach(d => {
            if (!d.tanggal) return;
            const dtStr = d.tanggal.split('T')[0];
            if (!agg[dtStr]) agg[dtStr] = 0;
            agg[dtStr] += (d.netto_kg || 0) / 1000;
        });

        // Days of week header
        const days = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
        let html = '';
        days.forEach(d => html += `<div class="cal-day-header">${d}</div>`);

        const firstDayIndex = date.getDay();
        const daysInMonth = new Date(y, m, 0).getDate();

        // Empty cells for offset
        for (let i = 0; i < firstDayIndex; i++) {
            html += `<div class="cal-cell empty"></div>`;
        }

        // Active days
        let maxVol = Math.max(...Object.values(agg), 1);
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const vol = agg[dateStr] || 0;
            const hasDataClass = vol > 0 ? 'has-data' : '';
            const opacity = vol > 0 ? 0.3 + (vol / maxVol) * 0.7 : 0;

            let bgStyle = '';
            if (vol > 0) bgStyle = `style="background: rgba(0, 243, 255, ${opacity * 0.3}); border-color: rgba(0, 243, 255, ${opacity});"`;

            html += `
                <div class="cal-cell ${hasDataClass}" ${bgStyle} onclick="CPODowntimeApp.selectDate('${dateStr}')" id="cal-cell-${dateStr}">
                    <div class="cal-num">${day}</div>
                    ${vol > 0 ? `<div class="cal-vol">${vol.toFixed(1)} T</div>` : ''}
                </div>
            `;
        }
        grid.innerHTML = html;

        // Reset analysis text
        this.selectDate(null);
    },

    selectDate: function (dateStr) {
        // Remove active class
        document.querySelectorAll('.cal-cell').forEach(el => el.classList.remove('active'));
        const contentBox = document.getElementById('analysis-content-v15');
        const labelBox = document.getElementById('selected-date-label');

        if (!dateStr) {
            if (labelBox) labelBox.innerText = "SELECT DATE";
            if (contentBox) contentBox.innerHTML = `
                <div style="text-align:center; padding:80px 20px; color:#444; font-family:'Orbitron';">
                    <i class="fas fa-mouse-pointer" style="font-size:2.5rem; margin-bottom:15px; opacity:0.3;"></i><br>
                    <span style="font-size:0.7rem; letter-spacing:2px; display:block; margin-bottom:10px;">WAITING FOR TARGET DATE</span>
                    <span style="font-size:0.6rem; color:#888; font-family:'Rajdhani';">SILAKAN PILIH TANGGAL PADA KALENDER UNTUK MELIHAT RINCIAN</span>
                </div>`;
            return;
        }

        // Add active class
        const cell = document.getElementById(`cal-cell-${dateStr}`);
        if (cell) cell.classList.add('active');

        if (labelBox) labelBox.innerText = dateStr;

        const dayData = this.filteredData.filter(d => d.tanggal && d.tanggal.startsWith(dateStr));

        if (dayData.length === 0) {
            if (contentBox) contentBox.innerHTML = `
                <div style="text-align:center; padding:80px 20px; color:#444; font-family:'Orbitron';">
                    <i class="fas fa-box-open" style="font-size:2.5rem; margin-bottom:15px; opacity:0.3;"></i><br>
                    <span style="font-size:0.7rem; letter-spacing:2px; display:block; margin-bottom:10px;">NO DATA AVAILABLE</span>
                    <span style="font-size:0.6rem; color:#888; font-family:'Rajdhani';">TIDAK ADA TRUK MASUK PADA TANGGAL INI</span>
                </div>`;
            return;
        }

        // Generate Analysis Table
        let html = `
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th style="width: 25px;">NO</th>
                        <th style="width: 80px;">NOPOL</th>
                        <th>SHIFT</th>
                        <th>TANKI</th>
                        <th>AWAL</th>
                        <th>AKHIR</th>
                        <th>DUR ${'<span style="font-size: 0.5rem; opacity: 0.7;">(MENIT)</span>'}</th>
                        <th>VOL ${'<span style="font-size: 0.5rem; opacity: 0.7;">(TON)</span>'}</th>
                    </tr>
                </thead>
                <tbody>
        `;

        let totalMins = 0;
        let totalVol = 0;

        dayData.forEach((d, i) => {
            let ton = (d.netto_kg || 0) / 1000;
            totalMins += (d.durasi_minutes || 0);
            totalVol += ton;

            // Format time correctly
            let aw = d.start_time || "-";
            let ak = d.end_time || "-";
            // Make sure simple strings display right
            if (aw !== "-" && String(aw).length === 4 && String(aw).indexOf(':') === -1) {
                // if it's "0800" instead of "08:00"
                aw = aw.substring(0, 2) + ":" + aw.substring(2, 4);
            }
            if (ak !== "-" && String(ak).length === 4 && String(ak).indexOf(':') === -1) {
                ak = ak.substring(0, 2) + ":" + ak.substring(2, 4);
            }

            html += `
                <tr>
                    <td class="text-center" style="color:var(--text-muted); font-size: 0.7rem;">${i + 1}</td>
                    <td style="font-weight: 700; color: var(--neon-blue); font-size:0.8rem;">${d.nopol || "-"}</td>
                    <td style="font-size:0.75rem;"><span class="tank-badge">${d.shift || "-"}</span></td>
                    <td style="font-size:0.75rem;"><span class="tank-badge" style="background: rgba(255, 204, 0, 0.1); color: var(--neon-gold);">${d.tanki || "-"}</span></td>
                    <td class="shift-val" style="color:#aaa;">${aw}</td>
                    <td class="shift-val" style="color:#aaa;">${ak}</td>
                    <td class="shift-val highlight" style="font-size:0.9rem;">${d.durasi_minutes || 0}</td>
                    <td class="shift-val val-mono" style="font-size:0.9rem;">${ton.toFixed(1)}</td>
                </tr>
            `;
        });

        html += `
                <tr class="total-row">
                    <td colspan="4" style="text-align: right; color: var(--neon-blue); font-size: 0.7rem;">SUMMARY / AVERAGE</td>
                    <td colspan="2"></td>
                    <td class="shift-val" style="color:var(--neon-gold); font-size:1rem;">${(totalMins / dayData.length).toFixed(0)} <span style="font-size:0.6rem;">MIN</span></td>
                    <td class="shift-val text-green" style="font-size:1rem;">${totalVol.toFixed(1)} <span style="font-size:0.6rem;">TON</span></td>
                </tr>
            </tbody></table>
        `;

        if (contentBox) contentBox.innerHTML = html;
    },

    // ---------------- UTILS ----------------

    startLoading: function () {
        document.getElementById('loading').classList.remove('hidden');
    },

    stopLoading: function () {
        document.getElementById('loading').classList.add('hidden');
    },

    initClock: function () {
        const tick = () => {
            const now = new Date();

            // Clock Widget BKK Style
            const timeEl = document.getElementById('widget-time');
            const dayEl = document.getElementById('widget-day');
            const dateEl = document.getElementById('widget-date');
            const ampmEl = document.getElementById('widget-ampm');
            const progressEl = document.getElementById('widget-sec-progress');

            if (timeEl) {
                let h = now.getHours();
                const m = now.getMinutes();
                const s = now.getSeconds();
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12;
                h = h ? h : 12;

                timeEl.innerText = `${h}:${m < 10 ? '0' + m : m}`;
                if (ampmEl) ampmEl.innerText = ampm;

                const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

                if (dayEl) dayEl.innerText = days[now.getDay()];
                if (dateEl) dateEl.innerText = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

                if (progressEl) {
                    const pct = (s / 60) * 100;
                    progressEl.style.transform = `rotate(${pct * 3.6}deg)`;
                }
            }
        };
        setInterval(tick, 1000);
        tick();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    CPODowntimeApp.init();
});
