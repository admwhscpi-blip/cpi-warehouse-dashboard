// ── HISTORY ──────────────────────────────────────────────────────────────────
function loadHistoryData(tab, bkId, bulan) {
  var map = { bongkar: 'getBongkarHistory', kirim: 'getKirimHistory', opname: 'getOpnameHistory' };
  var params = {};
  if (bkId) params.bk_id = bkId;
  if (bulan) params.limit = 500;
  showLoader(true);
  fetchAPI(map[tab], params, function(resp) {
    showLoader(false);
    if (resp.status === 'error') { toast('Gagal load riwayat: ' + resp.message, 'e'); return; }
    var data = resp.data || [];
    if (bulan) {
      var yr = parseInt(bulan.split('-')[0]);
      var mo = parseInt(bulan.split('-')[1]) - 1;
      data = data.filter(function(r) {
        var d = new Date(r.TANGGAL);
        return d.getFullYear() === yr && d.getMonth() === mo;
      });
    }
    if (bkId) data = data.filter(function(r) { return r.BK_ID === bkId; });
    appState.history[tab] = data;
    renderHistoryTab(tab, 1);
  });
}

function renderHistoryTab(tab, page) {
  var size = CONFIG.PAGE_SIZES.default;
  var all = appState.history[tab] || [];
  var totalPages = Math.max(1, Math.ceil(all.length / size));
  if (page > totalPages) page = totalPages;
  var slice = all.slice((page - 1) * size, page * size);

  var cfg = {
    bongkar: {
      tbl: 'tblHBongkar', pg: 'pgHBongkar',
      row: function(r) {
        return '<td>' + fmtDate(r.TANGGAL) + '</td>' +
          '<td><strong>' + r.BK_ID + '</strong></td>' +
          '<td>' + (r.MATERIAL||'—') + '</td>' +
          '<td>' + (r.KAPAL||'—') + '</td>' +
          '<td class="cm">' + fmtNum(r.NETTO_KG) + '</td>' +
          '<td>' + (r.SUPPLIER||'—') + '</td>' +
          '<td style="font-size:0.75rem;color:var(--ts);">' + (r.INPUT_BY||'—') + '</td>';
      }
    },
    kirim: {
      tbl: 'tblHKirim', pg: 'pgHKirim',
      row: function(r) {
        return '<td>' + fmtDate(r.TANGGAL) + '</td>' +
          '<td><strong>' + r.BK_ID + '</strong></td>' +
          '<td>' + (r.MATERIAL||'—') + '</td>' +
          '<td class="ck">' + fmtNum(r.NETTO_KG) + '</td>' +
          '<td>' + (r.SHIFT||'—') + '</td>' +
          '<td>' + (r.GRINDING||'—') + '</td>' +
          '<td style="font-size:0.75rem;color:var(--ts);">' + (r.INPUT_BY||'—') + '</td>';
      }
    },
    opname: {
      tbl: 'tblHOpname', pg: 'pgHOpname',
      row: function(r) {
        return '<td>' + fmtDate(r.TANGGAL) + '</td>' +
          '<td><strong>' + r.BK_ID + '</strong></td>' +
          '<td class="cs">' + fmtNum(r.STOK_FISIK_KG) + '</td>' +
          '<td>' + (r.MATERIAL||'—') + '</td>' +
          '<td style="font-size:0.75rem;color:var(--ts);">' + (r.INPUT_BY||'—') + '</td>' +
          '<td style="font-size:0.75rem;">' + (r.KETERANGAN||'—') + '</td>';
      }
    }
  };

  var c = cfg[tab];
  if (!c) return;
  var tb = $(c.tbl);
  tb.innerHTML = '';
  if (slice.length === 0) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" style="text-align:center;color:var(--ts);padding:24px;">Tidak ada data</td>';
    tb.appendChild(tr);
  } else {
    slice.forEach(function(r) {
      var tr = document.createElement('tr');
      tr.innerHTML = c.row(r);
      tb.appendChild(tr);
    });
  }
  renderPagination(c.pg, page, totalPages, function(p) { renderHistoryTab(tab, p); });
}

function initHistory() {
  var bkSels = ['h_bk_bongkar', 'h_bk_kirim', 'h_bk_opname'];
  bkSels.forEach(function(id) { var el = $(id); if (el) el.value = ''; });
  var blnSels = ['h_bln_bongkar', 'h_bln_kirim', 'h_bln_opname'];
  blnSels.forEach(function(id) { var el = $(id); if (el) getBulanOptions(el); });
  loadHistoryData('bongkar', '', '');
}

