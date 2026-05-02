// Donut chart + label pusat (HTML overlay, kompatibel Chart.js 2/3/4). Depends: $, appState, fmtNum, Chart
var chartInstances = {};

function updateDonutCenterLabel(totalStok, totalKap) {
  var el = $('chartDonutCenter');
  if (!el) return;
  var pct = totalKap > 0 ? (totalStok / totalKap) * 100 : 0;
  el.innerHTML =
    '<span class="chart-donut-pct">' + fmtNum(pct) + '%</span>' +
    '<span class="chart-donut-sub">terpakai</span>';
}

function renderCharts() {
  var data = appState.dashData;
  if (!data || !data.length) {
    destroyCharts();
    var el = $('chartDonutCenter');
    if (el) el.innerHTML = '';
    return;
  }
  destroyCharts();

  var stok = data.map(function(b) { return Number(b.STOK_AKTIF) || 0; });
  var kap = data.map(function(b) { return Number(b.KAPASITAS_KG) || 0; });

  var totalStok = stok.reduce(function(a, b) { return a + b; }, 0);
  var totalKap = kap.reduce(function(a, b) { return a + b; }, 0);
  var sisa = Math.max(totalKap - totalStok, 0);
  var el1 = $('chartDonut');
  if (!el1) return;

  chartInstances.donut = new Chart(el1.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Terpakai', 'Tersedia'],
      datasets: [{
        data: [totalStok, sisa],
        backgroundColor: ['#0284c7', '#e2e8f0'],
        borderWidth: 0,
        borderRadius: 8,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      animation: {
        animateRotate: true,
        duration: 1000
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 18,
            usePointStyle: true,
            font: { family: 'Rajdhani', weight: 700, size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ctx.label + ': ' + fmtNum(ctx.raw) + ' kg';
            }
          }
        }
      }
    }
  });

  updateDonutCenterLabel(totalStok, totalKap);
}

function destroyCharts() {
  Object.keys(chartInstances).forEach(function(k) {
    if (chartInstances[k]) {
      chartInstances[k].destroy();
      delete chartInstances[k];
    }
  });
}
