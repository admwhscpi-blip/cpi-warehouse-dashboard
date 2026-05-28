/**
 * Ekspor laporan stok harian BK — PDF (tab cetak) & CSV (unduh).
 * Memakai appState.dashData, appState.dashKpiToday, appState.history, sapState.compareResult (opsional).
 */
(function (global) {
  var BK_IDS = ['BK-1', 'BK-2', 'BK-3', 'BK-4', 'BK-5', 'BK-6'];
  /** Samakan query ?v= di bkk-dashboard.html + link CSS di tab cetak (hindari cache lama). */
  var LE_EXPORT_ASSET_V = '8';

  function normBK(id) {
    return String(id || '').trim().replace(/^BK-?(\d)$/i, 'BK-$1');
  }

  function rowYMD(val) {
    if (typeof dashDateToYMD === 'function') return dashDateToYMD(val);
    if (!val) return '';
    if (typeof val === 'string') return val.substring(0, 10);
    return '';
  }

  function wibYmdFromMs(ms) {
    try {
      return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } catch (e) {
      return '';
    }
  }

  function fmtDateTimeIndo(dateOrMs) {
    try {
      var d = new Date(dateOrMs);
      if (isNaN(d.getTime())) return '';
      
      var dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      var monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      
      var day = dayNames[d.getDay()];
      var date = d.getDate();
      var month = monthNames[d.getMonth()];
      var year = d.getFullYear();
      var hours = ('0' + d.getHours()).slice(-2);
      var minutes = ('0' + d.getMinutes()).slice(-2);
      
      return day + ', ' + date + ' ' + month + ' ' + year + ' ' + hours + ':' + minutes + ' WIB';
    } catch (e) {
      return '';
    }
  }

  function parseAnyDateTimeMs(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim();
    if (!s) return NaN;
    var hasZone = /[zZ]$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(s);
    if (!hasZone) {
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
      if (m) {
        var sec = m[6] !== undefined && m[6] !== '' ? Number(m[6]) : 0;
        return new Date(
          m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + pad2(sec) + '+07:00'
        ).getTime();
      }
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? NaN : d.getTime();
  }

  function rowEventMs(row) {
    if (!row) return NaN;
    if (row.TIMESTAMP != null && row.TIMESTAMP !== '') {
      var ts = parseAnyDateTimeMs(row.TIMESTAMP);
      if (!isNaN(ts)) return ts;
    }
    if (row.TANGGAL == null || row.TANGGAL === '') return NaN;
    var ymd = rowYMD(row.TANGGAL);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return NaN;
    return new Date(ymd + 'T00:00:00+07:00').getTime();
  }

  function buildExportRange() {
    var nowMs = Date.now();
    var todayYmd = typeof todayYMD_WIB === 'function' ? todayYMD_WIB() : wibYmdFromMs(nowMs);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todayYmd)) {
      return {
        startMs: NaN,
        endMs: nowMs,
        startLabel: '—',
        endLabel: fmtPrintTs()
      };
    }
    var todayStartMs = new Date(todayYmd + 'T00:00:00+07:00').getTime();
    var yStartMs = todayStartMs - 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000; // kemarin 07:00 WIB
    var ymdStart = wibYmdFromMs(yStartMs);
    var startLabel = ymdStart ? (ymdStart + ' 07:00 WIB') : 'Kemarin 07:00 WIB';
    return {
      startMs: yStartMs,
      endMs: nowMs,
      startLabel: startLabel,
      endLabel: fmtPrintTs()
    };
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtLongId(dateYmd) {
    try {
      var d = new Date(dateYmd + 'T12:00:00');
      if (isNaN(d.getTime())) return dateYmd;
      return d.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      return dateYmd;
    }
  }

  function fmtPrintTs() {
    try {
      return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    } catch (e2) {
      return new Date().toLocaleString('id-ID');
    }
  }

  function utilTier(pct) {
    if (pct == null || isNaN(pct)) return 'na';
    if (pct < 70) return 'lo';
    if (pct <= 90) return 'mid';
    return 'hi';
  }

  function utilBarClass(pct) {
    var t = utilTier(pct);
    if (t === 'lo') return 'le-util-lo';
    if (t === 'mid') return 'le-util-mid';
    return 'le-util-hi';
  }

  function sumKgForBkRange(rows, bkId, startMs, endMs) {
    var nb = normBK(bkId);
    var t = 0;
    (rows || []).forEach(function (r) {
      if (normBK(r.BK_ID) !== nb) return;
      if (r.STATUS_ROW === 'pending_final') return;
      var ms = rowEventMs(r);
      if (isNaN(ms)) return;
      if (ms < startMs || ms > endMs) return;
      t += Number(r.NETTO_KG) || 0;
    });
    return t;
  }

  function latestOpnameAtMs(bkId, pointMs) {
    var nb = normBK(bkId);
    var best = null;
    var bestMs = -Infinity;
    (appState.history && appState.history.opname || []).forEach(function (r) {
      if (normBK(r.BK_ID) !== nb) return;
      var ms = rowEventMs(r);
      if (isNaN(ms) || ms > pointMs) return;
      if (ms > bestMs) {
        bestMs = ms;
        best = r;
      }
    });
    return { row: best, ms: bestMs };
  }

  function stockAtMsForBk(bkId, pointMs) {
    var nb = normBK(bkId);
    var op = latestOpnameAtMs(nb, pointMs);
    var cutoff = op.row ? op.ms : -Infinity;
    var stock = op.row ? (Number(op.row.STOK_FISIK_KG) || 0) : 0;

    (appState.history && appState.history.bongkar || []).forEach(function (r) {
      if (normBK(r.BK_ID) !== nb) return;
      if (r.STATUS_ROW === 'pending_final') return;
      var ms = rowEventMs(r);
      if (isNaN(ms) || ms <= cutoff || ms > pointMs) return;
      stock += Number(r.NETTO_KG) || 0;
    });

    (appState.history && appState.history.kirim || []).forEach(function (r) {
      if (normBK(r.BK_ID) !== nb) return;
      var ms = rowEventMs(r);
      if (isNaN(ms) || ms <= cutoff || ms > pointMs) return;
      stock -= Number(r.NETTO_KG) || 0;
    });

    return stock < 0 ? 0 : stock;
  }

  function sapStatusForBk(bkId) {
    var list = typeof sapState !== 'undefined' && sapState.compareResult ? sapState.compareResult : [];
    var r = list.find(function (x) { return normBK(x.bkId) === normBK(bkId); });
    if (!r) return { code: 'na', label: '—' };
    var raw = Number(r.selisih);
    if (isNaN(raw) || Math.abs(raw) < 1e-6) return { code: 'ok', label: 'SESUAI' };
    return { code: 'bad', label: 'SELISIH' };
  }

  function buildRows() {
    var day = typeof todayYMD_WIB === 'function' ? todayYMD_WIB() : todayStr();
    var range = buildExportRange();
    var map = {};
    (appState.dashData || []).forEach(function (b) {
      map[normBK(b.BK_ID)] = b;
    });

    var totalStok = 0;

    var detail = BK_IDS.map(function (id) {
      var bk = map[id] || {};
      var material = (bk.MATERIAL_DEFAULT || bk.MATERIAL || '—').trim() || '—';
      var bToday = sumKgForBkRange(appState.history && appState.history.bongkar, id, range.startMs, range.endMs);
      var kToday = sumKgForBkRange(appState.history && appState.history.kirim, id, range.startMs, range.endMs);
      var stokKm = stockAtMsForBk(id, range.startMs);
      var stokH = stockAtMsForBk(id, range.endMs);
      if (!isFinite(stokH) || stokH === 0) {
        // fallback jika histori belum siap dimuat penuh
        stokH = Number(bk.STOK_AKTIF) || 0;
      }
      var kap = Number(bk.KAPASITAS_KG) || 0;
      var util = kap > 0 ? Math.min((stokH / kap) * 100, 999.99) : 0;
      var sap = sapStatusForBk(id);
      var ageDays = typeof bkUmurAbsolutHari === 'function' ? bkUmurAbsolutHari(bk.AWAL_ISI_YMD) : 0;
      totalStok += stokH;
      return {
        bkId: id,
        material: material,
        stokKemarin: stokKm,
        bongkar: bToday,
        kirim: kToday,
        stokHari: stokH,
        kapasitas: kap,
        utilisasi: util,
        sap: sap,
        ageDays: ageDays,
        namaBk: bk.NAMA_BK || '',
        supplierDefault: bk.SUPPLIER_DEFAULT || '',
        awalIsiYmd: bk.AWAL_ISI_YMD || ''
      };
    });

    /**
     * Ringkasan 4 kartu — satu rentang waktu (hari laporan):
     * Σ stok awal hari ini + Σ bongkar hari ini − Σ usage hari ini = Σ stok sekarang (pastikan konsisten dengan baris tabel).
     * "Stok awal" = jumlah kolom stok kemarin (saldo sebelum transaksi hari ini per BK).
     */
    var totalStokAwalHariIni = detail.reduce(function (acc, r) { return acc + r.stokKemarin; }, 0);
    var totalBongkarHariIni = detail.reduce(function (acc, r) { return acc + r.bongkar; }, 0);
    var totalUsageHariIni = detail.reduce(function (acc, r) { return acc + r.kirim; }, 0);

    var creatorName = (appState.user && (appState.user.nama || appState.user.username))
      ? String(appState.user.nama || appState.user.username)
      : '—';

    return {
      day: day,
      totalStokAwalHariIni: totalStokAwalHariIni,
      totalBongkarHariIni: totalBongkarHariIni,
      totalUsageHariIni: totalUsageHariIni,
      totalStok: totalStok,
      periodStartLabel: fmtDateTimeIndo(range.startMs),
      periodEndLabel: fmtDateTimeIndo(range.endMs),
      detail: detail,
      longDate: fmtLongId(day),
      printTs: fmtDateTimeIndo(Date.now()),
      creatorName: creatorName
    };
  }

  function svgWarehouse() {
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#00c8ff" d="M32 6L8 18v36h16V38h16v16h16V18L32 6z"/><path fill="#7c3aed" opacity=".85" d="M32 12l-18 9v8l18-9 18 9v-9l-18-9z"/><rect fill="#94a3b8" x="26" y="42" width="12" height="12" rx="1"/></svg>';
  }

  /** Sama seperti gauge dashboard: >85 hi, >60 mi */
  function gaugeZoneExport(pctDisplay) {
    var p = Number(pctDisplay);
    if (isNaN(p)) return 'lo';
    p = Math.min(Math.max(p, 0), 100);
    return p > 85 ? 'hi' : p > 60 ? 'mi' : 'lo';
  }

  function buildPrintGaugeSvg(pctDisplay) {
    var GAUGE_R = 68;
    var arcLen = Math.PI * GAUGE_R;
    var z = gaugeZoneExport(pctDisplay);
    var stroke = z === 'hi' ? '#ef4444' : z === 'mi' ? '#f59e0b' : '#0284c7';
    var target = Math.min(Math.max(Number(pctDisplay) || 0, 0), 100);
    var offset = arcLen * (1 - target / 100);
    return (
      '<svg class="le-pbk-gauge-svg" viewBox="0 0 200 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M 32 88 A ' + GAUGE_R + ' ' + GAUGE_R + ' 0 0 1 168 88" fill="none" stroke="rgba(148,163,184,0.35)" stroke-width="12" stroke-linecap="round"/>' +
      '<path d="M 32 88 A ' + GAUGE_R + ' ' + GAUGE_R + ' 0 0 1 168 88" fill="none" stroke="' + stroke + '" stroke-width="12" stroke-linecap="round" ' +
      'stroke-dasharray="' + arcLen + '" stroke-dashoffset="' + offset + '"/>' +
      '</svg>'
    );
  }

  function ageClsPrint(ageDays) {
    if (typeof ageClass === 'function') return ageClass(ageDays) || 'cm';
    return 'cm';
  }

  function buildDashStyleCardsHtml(data) {
    function fmtTbl(n) {
      return fmtNum(n);
    }
    return data.detail.map(function (r) {
      var pctShow = r.kapasitas ? Math.min(r.utilisasi, 100) : 0;
      var pctRead = r.kapasitas ? fmtNum(Math.round(r.utilisasi * 10) / 10) : '0';
      var ageDays = r.ageDays != null ? r.ageDays : 0;
      var aCls = ageClsPrint(ageDays);
      return (
        '<div class="le-print-bk-card">' +
        '<div class="le-pbk-head">' +
        '<div class="le-pbk-main">' +
        '<span class="le-pbk-id">' + escHtml(r.bkId) + '</span>' +
        '<span class="le-pbk-mat">' + escHtml(r.material) + '</span>' +
        '</div>' +
        '<span class="le-pbk-age le-pbk-age--' + aCls + '">' +
        '<svg class="le-pbk-clock" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M12 7v6l4 2"/></svg>' +
        ' ' + escHtml(String(ageDays)) + ' <span class="le-pbk-age-unit">hr</span>' +
        '</span>' +
        '</div>' +
        '<div class="le-pbk-gauge-wrap">' +
        buildPrintGaugeSvg(pctShow) +
        '<div class="le-pbk-readout">' +
        '<span class="le-pbk-pct">' + pctRead + '</span><span class="le-pbk-suf">%</span>' +
        '<div class="le-pbk-gl">utilisasi</div>' +
        '</div></div>' +
        '<div class="le-pbk-foot">' +
        '<div class="le-pbk-stat-row">' +
        '<span class="le-pbk-val">' + fmtTbl(r.stokHari) + '</span><span class="le-pbk-unit">kg</span>' +
        '<span class="le-pbk-sep">/</span>' +
        '<span class="le-pbk-cap">' + fmtTbl(r.kapasitas) + '</span><span class="le-pbk-unit">kg</span>' +
        '</div>' +
        '<div class="le-pbk-meta">' + (r.kapasitas ? fmtTbl(r.utilisasi) : '0') + '% slot terpakai</div>' +
        '</div></div>'
      );
    }).join('');
  }

  /** HTML lengkap untuk tab pratinjau / cetak browser (tampilan sama dengan dialog Cetak → Simpan sebagai PDF). */
  function buildPdfHtml(data) {
    var cssHref = 'laporan-export.css?v=' + LE_EXPORT_ASSET_V;
    try {
      cssHref = new URL('laporan-export.css?v=' + LE_EXPORT_ASSET_V, global.location.href).href;
    } catch (e) {}

    function fmtTbl(n) {
      return fmtNum(n);
    }

    var rowsHtml = data.detail.map(function (r, idx) {
      var tier = utilBarClass(r.utilisasi);
      var sap = r.sap;
      var badgeClass = sap.code === 'ok' ? 'ok' : sap.code === 'bad' ? 'bad' : 'na';
      var rowClass = idx % 2 === 0 ? 'le-row-even' : 'le-row-odd';
      return (
        '<tr class="' + rowClass + '">' +
        '<td>' + escHtml(r.bkId) + '</td>' +
        '<td>' + escHtml(r.material) + '</td>' +
        '<td class="le-num">' + fmtTbl(r.stokKemarin) + '</td>' +
        '<td class="le-num">' + fmtTbl(r.bongkar) + '</td>' +
        '<td class="le-num">' + fmtTbl(r.kirim) + '</td>' +
        '<td class="le-num le-td-stok-hari">' + fmtTbl(r.stokHari) + '</td>' +
        '<td class="le-num">' + fmtTbl(r.kapasitas) + '</td>' +
        '<td class="le-num le-util-cell ' + tier + '">' +
        (r.kapasitas ? r.utilisasi.toFixed(1) + '%' : '—') +
        (r.kapasitas
          ? '<div class="le-util-bar-wrap"><div class="le-util-bar-fill" style="width:' + Math.min(r.utilisasi, 100) + '%"></div></div>'
          : '') +
        '</td>' +
        '<td><span class="le-badge-sap ' + badgeClass + '">' + escHtml(sap.label) + '</span></td>' +
        '</tr>'
      );
    }).join('');

    var cardsHtml = buildDashStyleCardsHtml(data);

    return (
      '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Laporan Stock Harian — BK Storage</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">' +
      '<link rel="stylesheet" href="' + escHtml(cssHref) + '">' +
      '</head><body class="le-root">' +
      '<div class="le-screen-actions no-print">' +
      '<button type="button" class="le-btn-print" id="le_do_print">Cetak Sekarang</button>' +
      '<button type="button" class="le-btn-close" id="le_do_close">Tutup Tab</button>' +
      '</div>' +

      '<header class="le-kop">' +
      '<div class="le-kop-left">' +
      '<div class="le-kop-icon">' + svgWarehouse() + '</div>' +
      '<div>' +
      '<p class="le-kop-title">SMART WAREHOUSE</p>' +
      '<p class="le-kop-sub">Bulk Storage Smart Inventory System</p>' +
      '</div></div>' +
      '<div class="le-kop-right">' +
      '<p class="le-kop-co">PT Charoen Pokphand Indonesia – Cirebon</p>' +
      '<p class="le-kop-addr">CPI Feedmill Cirebon · Jl. Cirebon-Brebes No.Km.11, Astanajapura</p>' +
      '</div></header>' +
      '<div class="le-gradient-bar"></div>' +

      '<section class="le-doc-info">' +
      '<div>' +
      '<h1 class="le-doc-title">LAPORAN STOCK HARIAN — BK STORAGE</h1>' +
      '<p class="le-doc-meta">Laporan Rutin Harian · Tanggal: ' + escHtml(data.longDate) + ' · Dicetak: ' + escHtml(data.printTs) + '</p>' +
      '<p class="le-doc-meta">Periode hitung transaksi: ' + escHtml(data.periodStartLabel || '—') + ' s/d ' + escHtml(data.periodEndLabel || '—') + '</p>' +
      '</div>' +
      '<div class="le-badge-daily">DAILY REPORT</div>' +
      '</section>' +

      '<section class="le-summary-row le-summary-row--4">' +
      '<div class="le-sum-card le-sum-sk">' +
      '<div class="le-sum-val">' + fmtTbl(data.totalStokAwalHariIni) + '</div>' +
      '<div class="le-sum-lbl">Stok Awal (Kemarin 07:00)</div></div>' +
      '<div class="le-sum-card le-sum-bk">' +
      '<div class="le-sum-val">' + fmtTbl(data.totalBongkarHariIni) + '</div>' +
      '<div class="le-sum-lbl">Bongkar / Masuk (Periode)</div></div>' +
      '<div class="le-sum-card le-sum-uk">' +
      '<div class="le-sum-val">' + fmtTbl(data.totalUsageHariIni) + '</div>' +
      '<div class="le-sum-lbl">Usage / Kirim (Periode)</div></div>' +
      '<div class="le-sum-card le-sum-today">' +
      '<div class="le-sum-val">' + fmtTbl(data.totalStok) + '</div>' +
      '<div class="le-sum-lbl">Stok Saat Laporan</div></div>' +
      '</section>' +
      '<p class="le-sum-hint">Rumus saldo: <strong>Stok awal periode + Bongkar periode − Usage periode = Stok saat laporan</strong> (harus sama dengan kolom pada tabel di bawah).</p>' +

      '<section class="le-bk-cards-section le-bk-cards-area">' +
      '<div class="le-bk-cards-grid">' + cardsHtml + '</div>' +
      '</section>' +

      '<section class="le-table-wrap">' +
      '<table class="le-table">' +
      '<thead><tr>' +
      '<th>BK</th><th>Material</th><th>Stok Kemarin (kg)</th><th>Bongkar/Masuk (kg)</th><th>Usage/Kirim (kg)</th>' +
      '<th class="le-th-stok-hari">Stok Hari Ini (kg)</th><th>Kapasitas (kg)</th><th>Utilisasi (%)</th><th>Status SAP</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
      '</section>' +

      '<section class="le-sig-block">' +
      '<div class="le-sig-single">' +
      '<div class="le-sig-line" title="Tanda tangan"></div>' +
      '<p class="le-sig-by">Dibuat oleh: <strong>' + escHtml(data.creatorName || '—') + '</strong></p>' +
      '<p class="le-sig-job-line">Operator BK - Warehouse</p>' +
      '</div></section>' +

      '<footer class="le-footer">' +
      '<div class="le-footer-grad"></div>' +
      '<div class="le-footer-body">' +
      '<div class="le-footer-left">' +
      '<p>PT Charoen Pokphand Indonesia – Cirebon | Integrated Warehouse Information System</p>' +
      '<p class="le-footer-values">Accuracy · Transparency · Accountability</p></div>' +
      '<div class="le-footer-right">Halaman 1 / 1 — Dicetak: ' + escHtml(data.printTs) + '</div>' +
      '</div></footer>' +

      '</body></html>'
    );
  }

  function csvQuote(s) {
    var u = String(s == null ? '' : s);
    if (/[",\n\r]/.test(u)) return '"' + u.replace(/"/g, '""') + '"';
    return u;
  }

  function numRaw(n) {
    if (n == null || isNaN(n)) return '0';
    return String(Number(n));
  }

  function ymdToDmy(ymd) {
    if (!ymd) return '';
    var parts = ymd.split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return ymd;
  }

  function fmtIdKg(num) {
    if (num == null || isNaN(num)) return '0 Kg';
    var formatted = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return formatted + ' Kg';
  }

  function buildExcel(data) {
    var userName = (appState.user && (appState.user.nama || appState.user.username)) ? String(appState.user.nama || appState.user.username) : '—';
    var html = [];
    html.push('<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">');
    html.push('<head>');
    html.push('<meta charset="utf-8">');
    html.push('<!--[if gte mso 9]>');
    html.push('<xml>');
    html.push(' <x:ExcelWorkbook>');
    html.push('  <x:ExcelWorksheets>');
    html.push('   <x:ExcelWorksheet>');
    html.push('    <x:Name>Laporan Stock BK</x:Name>');
    html.push('    <x:WorksheetOptions>');
    html.push('     <x:DisplayGridlines/>');
    html.push('    </x:WorksheetOptions>');
    html.push('   </x:ExcelWorksheet>');
    html.push('  </x:ExcelWorksheets>');
    html.push(' </x:ExcelWorkbook>');
    html.push('</xml>');
    html.push('<![endif]-->');
    html.push('<style>');
    html.push('  body { font-family: Calibri, Arial, sans-serif; }');
    html.push('  .kop-main { font-size: 14pt; font-weight: bold; color: #1e3a8a; }');
    html.push('  .kop-sub { font-size: 11pt; color: #475569; }');
    html.push('  .kop-meta { font-size: 10pt; color: #334155; }');
    html.push('  table { border-collapse: collapse; }');
    html.push('  th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11pt; text-align: center; }');
    html.push('  td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 10pt; vertical-align: middle; }');
    html.push('  .text-center { text-align: center; }');
    html.push('  .text-right { text-align: right; }');
    html.push('  .stok-hari-ini { font-weight: bold; font-size: 12pt; background-color: #f1f5f9; color: #0f172a; text-align: right; border: 1px solid #cbd5e1; }');
    html.push('</style>');
    html.push('</head>');
    html.push('<body>');
    html.push('<table>');
    html.push('  <tr><td colspan="13" class="kop-main">PT Charoen Pokphand Indonesia - Cirebon</td></tr>');
    html.push('  <tr><td colspan="13" class="kop-sub">Smart Warehouse v2.0 - Bulk Storage Smart Inventory System</td></tr>');
    html.push('  <tr><td colspan="13" class="kop-meta">Laporan Stock Harian BK-Storage | Tanggal: ' + escHtml(data.longDate) + '</td></tr>');
    
    // Format periode transaksi dengan hari, tanggal, dan format jam yang rapi
    var startStyled = '<span style="color: #2563eb; font-weight: bold;">' + escHtml(data.periodStartLabel) + '</span>';
    var endStyled = '<span style="color: #16a34a; font-weight: bold;">' + escHtml(data.periodEndLabel) + '</span>';
    html.push('  <tr><td colspan="13" class="kop-meta">Periode transaksi: ' + startStyled + ' s/d ' + endStyled + '</td></tr>');
    
    html.push('  <tr><td colspan="13" style="border:none; height:10px;"></td></tr>');
    html.push('  <tr>');
    
    // Gunakan inline style th agar pasti dirender di semua versi Microsoft Excel
    var ths = 'style="background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11pt; text-align: center;"';
    html.push('    <th ' + ths + '>BK_ID</th>');
    html.push('    <th ' + ths + '>NAMA_BK</th>');
    html.push('    <th ' + ths + '>KAPASITAS_KG (kg)</th>');
    html.push('    <th ' + ths + '>MATERIAL_DEFAULT</th>');
    html.push('    <th ' + ths + '>SUPPLIER_DEFAULT</th>');
    html.push('    <th ' + ths + '>STATUS</th>');
    html.push('    <th ' + ths + '>AWAL ISI</th>');
    html.push('    <th ' + ths + '>Umur</th>');
    html.push('    <th ' + ths + '>Stock Kemarin (kg)</th>');
    html.push('    <th ' + ths + '>Penerimaan (kg)</th>');
    html.push('    <th ' + ths + '>Usage (kg)</th>');
    html.push('    <th ' + ths + '>Stock Hari Ini (kg)</th>');
    html.push('    <th ' + ths + '>Utilisasi</th>');
    html.push('  </tr>');
    
    data.detail.forEach(function (r) {
      html.push('  <tr>');
      html.push('    <td class="text-center" style="border: 1px solid #cbd5e1; text-align: center;">' + escHtml(r.bkId.replace('-', '')) + '</td>');
      html.push('    <td style="border: 1px solid #cbd5e1;">' + escHtml(r.namaBk) + '</td>');
      html.push('    <td class="text-right" style="border: 1px solid #cbd5e1; text-align: right;">' + escHtml(fmtIdKg(r.kapasitas)) + '</td>');
      html.push('    <td style="border: 1px solid #cbd5e1;">' + escHtml(r.material) + '</td>');
      html.push('    <td style="border: 1px solid #cbd5e1;">' + escHtml(r.supplierDefault) + '</td>');
      html.push('    <td class="text-center" style="border: 1px solid #cbd5e1; text-align: center;">' + escHtml('ACTIVE') + '</td>');
      html.push('    <td class="text-center" style="border: 1px solid #cbd5e1; text-align: center;">' + escHtml(ymdToDmy(r.awalIsiYmd)) + '</td>');
      html.push('    <td class="text-center" style="border: 1px solid #cbd5e1; text-align: center;">' + escHtml((r.ageDays || 0) + ' Hari') + '</td>');
      html.push('    <td class="text-right" style="border: 1px solid #cbd5e1; text-align: right;">' + escHtml(fmtIdKg(r.stokKemarin)) + '</td>');
      html.push('    <td class="text-right" style="border: 1px solid #cbd5e1; text-align: right;">' + escHtml(fmtIdKg(r.bongkar)) + '</td>');
      html.push('    <td class="text-right" style="border: 1px solid #cbd5e1; text-align: right;">' + escHtml(fmtIdKg(r.kirim)) + '</td>');
      
      // Inline styles untuk stock hari ini agar tebal, lebih besar, dan berlatar belakang lembut
      var shStyle = 'style="font-weight: bold; font-size: 11.5pt; background-color: #f1f5f9; color: #000000; text-align: right; border: 1px solid #cbd5e1;"';
      html.push('    <td class="stok-hari-ini" ' + shStyle + '>' + escHtml(fmtIdKg(r.stokHari)) + '</td>');
      
      html.push('    <td class="text-center" style="border: 1px solid #cbd5e1; text-align: center;">' + escHtml((r.kapasitas ? Math.round(r.utilisasi) : 0) + '%') + '</td>');
      html.push('  </tr>');
    });
    
    html.push('  <tr><td colspan="13" style="border:none; height:10px;"></td></tr>');
    html.push('  <tr><td colspan="13" class="kop-meta" style="font-weight:bold;">Dicetak oleh: ' + escHtml(userName) + ' | Tanggal cetak: ' + escHtml(data.printTs) + '</td></tr>');
    html.push('  <tr><td colspan="13" class="kop-meta" style="font-style:italic;">Accuracy | Transparency | Accountability</td></tr>');
    html.push('</table>');
    html.push('</body>');
    html.push('</html>');
    
    return '\uFEFF' + html.join('\r\n');
  }

  /**
   * Tab baru (about:blank) + CSS asli — tampilan sama dengan pratinjau cetak browser.
   * Simpan sebagai PDF: di dialog Cetak pilih "Simpan sebagai PDF" / "Microsoft Print to PDF".
   */
  function openPdf(data) {
    var html = buildPdfHtml(data);
    var w = global.open('', '_blank');
    if (!w) {
      if (typeof toast === 'function') {
        toast('Popup diblokir — izinkan tab baru untuk laporan & cetak PDF.', 'w');
      }
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();

    function wire() {
      var bp = w.document.getElementById('le_do_print');
      var bc = w.document.getElementById('le_do_close');
      if (bp) bp.onclick = function () { w.print(); };
      if (bc) bc.onclick = function () { w.close(); };
    }

    wire();
    setTimeout(function () {
      wire();
      try {
        w.focus();
        w.print();
      } catch (e) {}
    }, 480);
  }

  function run(format) {
    if (!(appState.dashData && appState.dashData.length)) {
      if (typeof toast === 'function') toast('Data BK belum tersedia — muat dashboard terlebih dahulu.', 'w');
      return false;
    }
    var data = buildRows();
    if (format === 'csv') {
      var xls = buildExcel(data);
      var fname = 'Laporan-Stock-Harian-' + data.day + '.xls';
      if (typeof downloadFile === 'function') {
        downloadFile(fname, 'application/vnd.ms-excel', xls);
      } else {
        var blob = new Blob([xls], { type: 'application/vnd.ms-excel;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(url);
      }
      return true;
    }
    if (format === 'pdf') {
      openPdf(data);
      return true;
    }
    return false;
  }

  global.LaporanExport = { run: run, buildRows: buildRows };
})(typeof window !== 'undefined' ? window : this);
