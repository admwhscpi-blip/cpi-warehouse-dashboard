// ============================================
// KONFIGURASI GOOGLE APPS SCRIPT
// ============================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwngqhLdzcdAQvt5ubmcZpT3-fzrYcqBuwMpNqYZabMflPSE4gKRO6d7swFzS-FHhP0/exec';

// ============================================
// GLOBAL STATE
// ============================================
let rawData = [];
let filteredData = [];
let charts = {
    badrun: null,
    kartono: null,
    kulhar: null
};
let viewModes = {
    badrun: 'daily',
    kartono: 'daily',
    kulhar: 'daily'
};

// ============================================
// LOAD DATA FROM GOOGLE SHEETS
// ============================================
async function loadData() {
    const overlay = document.getElementById('loading-overlay');

    try {
        overlay.classList.remove('hidden');

        const response = await fetch(APPS_SCRIPT_URL);
        if (!response.ok) throw new Error('Failed to fetch data');

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to load data');

        rawData = result.data || [];
        filteredData = [...rawData];

        // Set default date range (last 30 days)
        if (rawData.length > 0) {
            const lastDate = new Date(rawData[rawData.length - 1].tanggal);
            const firstDate = new Date(lastDate);
            firstDate.setDate(firstDate.getDate() - 30);

            document.getElementById('start-date').valueAsDate = firstDate;
            document.getElementById('end-date').valueAsDate = lastDate;

            applyPeriodFilter();
        }

    } catch (error) {
        console.error('Error loading data:', error);
        alert('Gagal memuat data: ' + error.message);
    } finally {
        setTimeout(() => overlay.classList.add('hidden'), 500);
    }
}

// ============================================
// APPLY PERIOD FILTER
// ============================================
function applyPeriodFilter() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!startDate || !endDate) {
        alert('Please select both start and end dates');
        return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    filteredData = rawData.filter(row => {
        const rowDate = new Date(row.tanggal);
        return rowDate >= start && rowDate <= end;
    });

    // Refresh all charts
    renderChart('badrun');
    renderChart('kartono');
    renderChart('kulhar');
}

// ============================================
// CHANGE VIEW MODE
// ============================================
function changeViewMode(team, mode) {
    viewModes[team] = mode;

    // Update button states
    const container = document.getElementById(`chart-${team}-container`);
    const buttons = container.querySelectorAll('.view-mode-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === mode) {
            btn.classList.add('active');
        }
    });

    // Re-render chart
    renderChart(team);
}

// ============================================
// AGGREGATE DATA BY MODE
// ============================================
function aggregateData(team, mode) {
    const teamData = filteredData.map(row => ({
        date: new Date(row.tanggal),
        pemakaianBelumStapel: parseFloat(row[`pemakaian${team.charAt(0).toUpperCase() + team.slice(1)}`]) || 0,
        bongkaranBaru: parseFloat(row[`bongkaran${team.charAt(0).toUpperCase() + team.slice(1)}`]) || 0,
        hasilStapel: parseFloat(row[`stapel${team.charAt(0).toUpperCase() + team.slice(1)}`]) || 0
    }));

    if (mode === 'daily') {
        return teamData.map(d => ({
            ...d,
            label: d.date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
        }));
    } else if (mode === 'weekly') {
        return aggregateWeekly(teamData);
    } else if (mode === 'monthly') {
        return aggregateMonthly(teamData);
    }
}

function aggregateWeekly(data) {
    const weeks = {};

    data.forEach(d => {
        const weekNum = getWeekNumber(d.date);
        const weekKey = `Week ${weekNum}`;

        if (!weeks[weekKey]) {
            weeks[weekKey] = {
                label: weekKey,
                date: d.date,
                pemakaianBelumStapel: 0,
                bongkaranBaru: 0,
                hasilStapel: 0,
                count: 0
            };
        }

        weeks[weekKey].pemakaianBelumStapel += d.pemakaianBelumStapel;
        weeks[weekKey].bongkaranBaru += d.bongkaranBaru;
        weeks[weekKey].hasilStapel += d.hasilStapel;
        weeks[weekKey].count++;
    });

    return Object.values(weeks).map(w => ({
        ...w,
        pemakaianBelumStapel: w.pemakaianBelumStapel / w.count,
        bongkaranBaru: w.bongkaranBaru / w.count,
        hasilStapel: w.hasilStapel / w.count
    }));
}

function aggregateMonthly(data) {
    const months = {};

    data.forEach(d => {
        const monthKey = d.date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

        if (!months[monthKey]) {
            months[monthKey] = {
                label: monthKey,
                date: d.date,
                pemakaianBelumStapel: 0,
                bongkaranBaru: 0,
                hasilStapel: 0,
                count: 0
            };
        }

        months[monthKey].pemakaianBelumStapel += d.pemakaianBelumStapel;
        months[monthKey].bongkaranBaru += d.bongkaranBaru;
        months[monthKey].hasilStapel += d.hasilStapel;
        months[monthKey].count++;
    });

    return Object.values(months).map(m => ({
        ...m,
        pemakaianBelumStapel: m.pemakaianBelumStapel / m.count,
        bongkaranBaru: m.bongkaranBaru / m.count,
        hasilStapel: m.hasilStapel / m.count
    }));
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ============================================
// RENDER CHART
// ============================================
function renderChart(team) {
    const mode = viewModes[team];
    const aggregatedData = aggregateData(team, mode);

    const ctx = document.getElementById(`chart-${team}`).getContext('2d');

    // Destroy existing chart
    if (charts[team]) {
        charts[team].destroy();
    }

    // Create new chart
    charts[team] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: aggregatedData.map(d => d.label),
            datasets: [
                {
                    label: 'Pemakaian Belum Stapel',
                    data: aggregatedData.map(d => d.pemakaianBelumStapel),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 10,
                    pointBackgroundColor: '#ef4444',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Bongkaran Baru',
                    data: aggregatedData.map(d => d.bongkaranBaru),
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 10,
                    pointBackgroundColor: '#fbbf24',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Hasil Stapel',
                    data: aggregatedData.map(d => d.hasilStapel),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 10,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    generateInsight(team, aggregatedData, index, mode);
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#e2e8f0',
                        font: {
                            family: 'Inter',
                            size: 12,
                            weight: '600'
                        },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#00f3ff',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(0, 243, 255, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + Math.round(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            family: 'Rajdhani',
                            size: 12
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            family: 'Inter',
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            animation: {
                duration: 1500,
                easing: 'easeInOutQuart'
            }
        }
    });
}

// ============================================
// GENERATE AI INSIGHT
// ============================================
function generateInsight(team, data, index, mode) {
    const current = data[index];
    const previous = index > 0 ? data[index - 1] : null;

    let insight = `<strong>📊 Analysis for ${current.label}</strong><br><br>`;

    // Data values
    insight += `<strong>Data Values:</strong><br>`;
    insight += `• Pemakaian Belum Stapel: <span class="insight-metric">${Math.round(current.pemakaianBelumStapel)}</span><br>`;
    insight += `• Bongkaran Baru: <span class="insight-metric">${Math.round(current.bongkaranBaru)}</span><br>`;
    insight += `• Hasil Stapel: <span class="insight-metric">${Math.round(current.hasilStapel)}</span><br><br>`;

    // Trend analysis
    if (previous) {
        insight += `<strong>📈 Trend Analysis (vs previous ${mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}):</strong><br>`;

        const belumStapelChange = current.pemakaianBelumStapel - previous.pemakaianBelumStapel;
        const bongkaranChange = current.bongkaranBaru - previous.bongkaranBaru;
        const stapelChange = current.hasilStapel - previous.hasilStapel;

        insight += `• Pemakaian Belum Stapel: ${getTrendText(belumStapelChange)}<br>`;
        insight += `• Bongkaran Baru: ${getTrendText(bongkaranChange)}<br>`;
        insight += `• Hasil Stapel: ${getTrendText(stapelChange)}<br><br>`;
    }

    // Performance insight
    insight += `<strong>🎯 Performance Insight:</strong><br>`;

    const stapelEfficiency = current.bongkaranBaru > 0
        ? (current.hasilStapel / current.bongkaranBaru * 100).toFixed(1)
        : 0;

    insight += `• Stapel Efficiency: <span class="insight-metric">${stapelEfficiency}%</span> `;
    insight += `(Hasil Stapel vs Bongkaran Baru)<br>`;

    // LOGIKA BARU: Backlog Work Rate (saat tidak ada bongkaran baru)
    const backlogWorkRate = current.bongkaranBaru === 0 && current.pemakaianBelumStapel > 0
        ? (current.hasilStapel / current.pemakaianBelumStapel * 100).toFixed(1)
        : 0;

    if (current.bongkaranBaru === 0 && current.pemakaianBelumStapel > 0) {
        insight += `• Backlog Work Rate: <span class="insight-metric">${backlogWorkRate}%</span> `;
        insight += `(Hasil Stapel untuk mengurangi Material Belum Stapel)<br>`;
    }

    // Behavioral analysis
    if (current.bongkaranBaru > 0 && current.hasilStapel > 0) {
        // Cek apakah material belum stapel berkurang atau tidak
        const belumStapelBerkurang = previous && current.pemakaianBelumStapel < previous.pemakaianBelumStapel;

        if (belumStapelBerkurang) {
            insight += `• ✅ BAGUS! Tim mengerjakan bongkaran baru DAN mengurangi backlog<br>`;
        } else {
            insight += `• 🔴 PERFORMA BURUK! Tim hanya fokus bongkaran baru, mengabaikan material belum stapel<br>`;
            insight += `• ⚠️ Material belum stapel tidak berkurang - Tim tidak proaktif mengerjakan backlog lama<br>`;
        }
    } else if (current.bongkaranBaru === 0 && current.hasilStapel === 0) {
        insight += `• ⚠️ Tidak ada bongkaran baru, tidak ada hasil stapel<br>`;
        if (current.pemakaianBelumStapel > 100) {
            insight += `• 🔴 BURUK! Ada ${Math.round(current.pemakaianBelumStapel)} material belum stapel tapi tidak dikerjakan<br>`;
        }
    } else if (current.bongkaranBaru > 0 && current.hasilStapel === 0) {
        insight += `• 🔴 Ada bongkaran baru tapi tidak ada hasil stapel - PERLU PERHATIAN!<br>`;
    } else if (current.bongkaranBaru === 0 && current.hasilStapel > 0) {
        insight += `• ✅ EXCELLENT! Tim proaktif mengerjakan backlog meskipun tidak ada bongkaran baru<br>`;
        if (backlogWorkRate > 50) {
            insight += `• 🌟 Backlog work rate ${backlogWorkRate}% - Tim sangat proaktif!<br>`;
        } else if (backlogWorkRate > 20) {
            insight += `• 👍 Backlog work rate ${backlogWorkRate}% - Performa baik<br>`;
        } else {
            insight += `• 📊 Backlog work rate ${backlogWorkRate}% - Masih bisa ditingkatkan<br>`;
        }
    }


    if (current.pemakaianBelumStapel > previous?.pemakaianBelumStapel) {
        insight += `• 📈 Material belum stapel bertambah - kemungkinan ada penumpukan<br>`;
    } else if (current.pemakaianBelumStapel < previous?.pemakaianBelumStapel) {
        insight += `• 📉 Material belum stapel berkurang - tim sedang mengurangi backlog<br>`;
    } else if (previous && current.pemakaianBelumStapel === previous.pemakaianBelumStapel && current.pemakaianBelumStapel > 0) {
        insight += `• ⚠️ Material belum stapel STAGNANT (${Math.round(current.pemakaianBelumStapel)}) - tidak ada pengurangan!<br>`;
    }

    // Recommendation
    insight += `<br><strong>💡 Recommendation:</strong><br>`;

    // Deteksi pola buruk: material stagnant saat ada bongkaran baru
    const materialStagnant = previous && current.pemakaianBelumStapel === previous.pemakaianBelumStapel && current.pemakaianBelumStapel > 0;
    const materialNaikSaatAdaBongkaran = current.bongkaranBaru > 0 && previous && current.pemakaianBelumStapel >= previous.pemakaianBelumStapel;

    if (materialNaikSaatAdaBongkaran && current.hasilStapel > 0) {
        insight += `• 🔴 CRITICAL! Tim hanya fokus bongkaran baru, backlog diabaikan - UBAH STRATEGI KERJA!<br>`;
        insight += `• 💡 Alokasikan sebagian tim untuk mengerjakan material belum stapel, jangan hanya fokus bongkaran baru<br>`;
    }

    if (materialStagnant && current.bongkaranBaru > 0) {
        insight += `• ⚠️ Material belum stapel tidak bergerak - Tim perlu balance antara bongkaran baru dan backlog<br>`;
    }

    if (current.pemakaianBelumStapel > 150 && current.hasilStapel < 100) {
        insight += `• Prioritaskan pengerjaan material belum stapel yang menumpuk<br>`;
    }
    if (stapelEfficiency < 50 && current.bongkaranBaru > 0) {
        insight += `• Tingkatkan efisiensi pengerjaan stapel dari bongkaran baru<br>`;
    }
    if (stapelEfficiency > 80 && current.pemakaianBelumStapel < previous?.pemakaianBelumStapel) {
        insight += `• ✅ Performa EXCELLENT! Efisien mengerjakan bongkaran baru DAN mengurangi backlog<br>`;
    }
    if (current.bongkaranBaru === 0 && backlogWorkRate < 20 && current.pemakaianBelumStapel > 100) {
        insight += `• 💪 Manfaatkan waktu tanpa bongkaran baru untuk clear backlog lebih agresif<br>`;
    }
    if (backlogWorkRate > 50) {
        insight += `• 🎉 Excellent! Tim sangat proaktif mengerjakan backlog<br>`;
    }

    document.getElementById(`insight-content-${team}`).innerHTML = insight;
}

function getTrendText(change) {
    if (change > 0) {
        return `<span class="insight-trend-up">↑ +${Math.round(change)} (naik)</span>`;
    } else if (change < 0) {
        return `<span class="insight-trend-down">↓ ${Math.round(change)} (turun)</span>`;
    } else {
        return `<span class="insight-neutral">→ 0 (stabil)</span>`;
    }
}

// ============================================
// INITIALIZE ON LOAD
// ============================================
window.onload = () => {
    loadData();
};
