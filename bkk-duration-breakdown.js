/**
 * Breakdown Durasi BKK — pola analisis seperti DTV2, filter durasi dari DURASI_JSON.breakdowns.
 * SBM vs Non-SBM saling eksklusif (sama seperti Bongkar vs Muat di DTV2).
 */
(function() {
  var BKKDB_PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  var BKKDB_SBM_DEFAULT = ['sbm_pb_window', 'sbm_gap_truck'];
  var BKKDB_NS_DEFAULT = ['seg_0_1', 'seg_1_2', 'seg_2_3', 'seg_3_4', 'gap_truck_ns'];

  var _bkkDbInit = false;
  var _bkkDbSelSbm = [];
  var _bkkDbSelNs = [];
  var _bkkDbSortCol = null;
  var _bkkDbSortAsc = true;
  var _bkkDbMiniCharts = {};
  var _bkkDbInapDonut = null;
  var _bkkDbInapTrend = null;
  var _bkkDbQtyTarget = null;
  var _bkkDbIntakeByDate = {};
  var _bkkDbLastFiltered = [];
  var _bkkDbAggBreakdownByKey = {};
  var _bkkDbKeysSbm = [];
  var _bkkDbKeysNs = [];

  window._bkkDbHistoryRows = window._bkkDbHistoryRows || [];

  function bkkDbEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function bkkDbEscAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /** Label tampilan untuk cat wizard (sama urutan kategori di wizard). */
  var BKKDB_BREAKDOWN_CAT_LABEL = {
    ISTIRAHAT: 'Istirahat',
    'PINDAH HOPPER': 'Pindah hopper',
    'JALUR OVERLOAD': 'Jalur overload',
    'TUNGGU KULI': 'Tunggu kuli',
    'TUNGGU TRUCK': 'Tunggu truck',
    OTHER: 'Lainnya'
  };

  /** Satu baris breakdown → teks keterangan untuk popup / tabel. */
  function bkkDbBreakdownKeterangan(item) {
    if (!item) return '—';
    var cat = String(item.cat != null ? item.cat : item.CAT || '').trim();
    var other = item.other != null ? String(item.other).trim() : '';
    if (cat.toUpperCase() === 'OTHER' && other) return other;
    if (!cat) return other || '—';
    return BKKDB_BREAKDOWN_CAT_LABEL[cat] || cat.replace(/_/g, ' ');
  }

  function bkkDbP2(n) {
    return String(n).padStart(2, '0');
  }

  /** Ambil JSON durasi; breakdown kategori diambil dari kolom BREAKDOWN_DURASI bila DURASI_JSON ringkas/kosong. */
  function bkkDbParseDj(r) {
    if (!r) return null;
    var colBd = r.BREAKDOWN_DURASI;
    if ((colBd == null || colBd === '') && r.breakdown_durasi != null) colBd = r.breakdown_durasi;
    if ((colBd == null || colBd === '') && r['BREAKDOWN DURASI'] != null) colBd = r['BREAKDOWN DURASI'];
    var mergedBreakdowns = null;
    var cs = colBd != null ? String(colBd).trim() : '';
    if (cs !== '' && cs !== '{}') {
      try {
        var ext = typeof colBd === 'string' ? JSON.parse(colBd) : colBd;
        if (ext && typeof ext === 'object' && !Array.isArray(ext)) mergedBreakdowns = ext;
      } catch (e0) {}
    }

    var raw = r.DURASI_JSON;
    if ((raw == null || raw === '') && r.durasi_json != null) raw = r.durasi_json;
    if ((raw == null || raw === '') && r['DURASI JSON'] != null) raw = r['DURASI JSON'];
    if (raw == null || raw === '') {
      if (mergedBreakdowns) return { v: 1, breakdowns: mergedBreakdowns };
      return null;
    }
    try {
      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof obj === 'string') {
        try {
          obj = JSON.parse(obj);
        } catch (e2) {
          if (mergedBreakdowns) return { v: 1, breakdowns: mergedBreakdowns };
          return null;
        }
      }
      if (!obj || typeof obj !== 'object') {
        if (mergedBreakdowns) return { v: 1, breakdowns: mergedBreakdowns };
        return null;
      }
      if (mergedBreakdowns) obj.breakdowns = mergedBreakdowns;
      else if (!obj.breakdowns) obj.breakdowns = {};
      return obj;
    } catch (e) {
      if (mergedBreakdowns) return { v: 1, breakdowns: mergedBreakdowns };
      return null;
    }
  }

  /** Jam HH:MM dari sel sheet (string, Date, atau ISO). */
  function bkkDbNormalizeHM(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'object' && v instanceof Date && !isNaN(v.getTime())) {
      return bkkDbP2(v.getHours()) + ':' + bkkDbP2(v.getMinutes());
    }
    var s = String(v).trim();
    if (s.indexOf('T') !== -1) {
      try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) return bkkDbP2(d.getHours()) + ':' + bkkDbP2(d.getMinutes());
      } catch (e) {}
    }
    if (/^\d{1,2}:\d{2}/.test(s)) return s.substring(0, 5);
    return s.length >= 5 ? s.substring(0, 5) : s;
  }

  function bkkDbYmdFromCell(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'object' && v instanceof Date && !isNaN(v.getTime())) {
      try {
        return v.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      } catch (e0) {
        return v.getFullYear() + '-' + bkkDbP2(v.getMonth() + 1) + '-' + bkkDbP2(v.getDate());
      }
    }
    var s = String(v).trim();
    if (s.indexOf('T') !== -1) {
      try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
          try {
            return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
          } catch (e1) {
            return d.getFullYear() + '-' + bkkDbP2(d.getMonth() + 1) + '-' + bkkDbP2(d.getDate());
          }
        }
      } catch (e) {}
    }
    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  function bkkDbConcatMs(ymd, hm) {
    if (!ymd || !hm) return NaN;
    var p = String(hm).split(':');
    var h = parseInt(p[0], 10);
    var m = parseInt(p[1] || '0', 10);
    if (isNaN(h) || isNaN(m)) return NaN;
    return new Date(ymd + 'T' + bkkDbP2(h) + ':' + bkkDbP2(m) + ':00+07:00').getTime();
  }

  function bkkDbFormatMsWib(ms) {
    if (ms == null || isNaN(ms)) return '—';
    try {
      return new Date(ms).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      return '—';
    }
  }

  /**
   * Rantai Intake 71 untuk satu baris: urutan truk + index baris ini.
   * Dipakai IDLE LOSS (menit) dan popup keterangan PB Finish / PB Start.
   */
var _bkkDbIntakeChainIndex = null;
var _bkkDbIntakeChainIndexRows = null;

function bkkDbBuildIntakeChainIndex(poolRows) {
  if (
    _bkkDbIntakeChainIndex &&
    _bkkDbIntakeChainIndexRows === poolRows
  ) {
    return _bkkDbIntakeChainIndex;
  }

  var index = {};

  for (var i = 0; i < poolRows.length; i++) {
    var r = poolRows[i];

    if (!r) continue;
    if (!bkkDbRowInIntakeChain(r)) continue;

    var bk = String(bkkDbCol(r, 'BK_ID') || '').trim();
    var day = bkkDbYmdFromCell(bkkDbCol(r, 'TANGGAL'));

    if (!bk || !day) continue;

    var shift = String(
      r.SHIFT != null ? r.SHIFT : ''
    ).trim();

    /*
     * Sama dengan bkkDbShiftCompatible():
     *
     * jika shift kosong, kompatibel dengan semuanya.
     * Karena itu row tanpa shift kita masukkan ke bucket khusus.
     */
    var key = bk + '|' + day + '|' + shift;

    if (!index[key]) {
      index[key] = [];
    }

    var pbYmd = bkkDbYmdFromCell(
      bkkDbCol(r, 'PB_TANGGAL')
    );

    if (!pbYmd) {
      pbYmd = day;
    }

    var ps = bkkDbNormalizeHM(
      bkkDbCol(r, 'PB_START')
    );

    var pf = bkkDbNormalizeHM(
      bkkDbCol(r, 'PB_FINISH')
    );

    if (!pbYmd || !ps || !pf) continue;

    var msS = bkkDbConcatMs(pbYmd, ps);
    var msF = bkkDbConcatMs(pbYmd, pf);

    if (isNaN(msS) || isNaN(msF)) continue;

    index[key].push({
      id: bkkDbCol(r, 'ID'),
      nopol: String(
        bkkDbCol(r, 'NO_POLISI') || ''
      ).trim().toUpperCase(),
      msS: msS,
      msF: msF
    });
  }

  Object.keys(index).forEach(function(key) {
    index[key].sort(function(a, b) {
      return a.msS - b.msS;
    });
  });

  _bkkDbIntakeChainIndex = index;
  _bkkDbIntakeChainIndexRows = poolRows;

  return index;
}

  // function bkkDbIntakeChainContext(row, poolRows) {
  //   if (!row || !poolRows || !poolRows.length) return null;
  //   if (!bkkDbRowInIntakeChain(row)) return null;

  //   var bk = String(bkkDbCol(row, 'BK_ID')).trim();
  //   var rowDay = bkkDbYmdFromCell(bkkDbCol(row, 'TANGGAL'));
  //   if (!bk || !rowDay) return null;

  //   var chain = [];
  //   for (var i = 0; i < poolRows.length; i++) {
  //     var r = poolRows[i];
  //     if (String(bkkDbCol(r, 'BK_ID')).trim() !== bk) continue;
  //     var d2 = bkkDbYmdFromCell(bkkDbCol(r, 'TANGGAL'));
  //     if (d2 !== rowDay) continue;
  //     if (!bkkDbShiftCompatible(row, r)) continue;
  //     if (!bkkDbRowInIntakeChain(r)) continue;

  //     var pbYmd = bkkDbYmdFromCell(bkkDbCol(r, 'PB_TANGGAL'));
  //     if (!pbYmd) pbYmd = bkkDbYmdFromCell(bkkDbCol(r, 'TANGGAL'));
  //     var ps = bkkDbNormalizeHM(bkkDbCol(r, 'PB_START'));
  //     var pf = bkkDbNormalizeHM(bkkDbCol(r, 'PB_FINISH'));
  //     if (!pbYmd || !ps || !pf) continue;
  //     var msS = bkkDbConcatMs(pbYmd, ps);
  //     var msF = bkkDbConcatMs(pbYmd, pf);
  //     if (isNaN(msS) || isNaN(msF)) continue;
  //     chain.push({
  //       id: bkkDbCol(r, 'ID'),
  //       nopol: String(bkkDbCol(r, 'NO_POLISI') || '').trim().toUpperCase(),
  //       msS: msS,
  //       msF: msF
  //     });
  //   }

  //   if (chain.length < 2) return null;

  //   chain.sort(function(a, b) {
  //     return a.msS - b.msS;
  //   });

  //   var rid = bkkDbCol(row, 'ID');
  //   var myIdx = -1;
  //   if (rid != null && String(rid).trim() !== '') {
  //     for (var j = 0; j < chain.length; j++) {
  //       if (String(chain[j].id) === String(rid)) {
  //         myIdx = j;
  //         break;
  //       }
  //     }
  //   }
  //   if (myIdx < 0) {
  //     var np = String(bkkDbCol(row, 'NO_POLISI') || '').trim().toUpperCase();
  //     var rowPbY = bkkDbYmdFromCell(bkkDbCol(row, 'PB_TANGGAL')) || rowDay;
  //     var rowPs = bkkDbNormalizeHM(bkkDbCol(row, 'PB_START'));
  //     var rowMsS = bkkDbConcatMs(rowPbY, rowPs);
  //     for (var k = 0; k < chain.length; k++) {
  //       if (np && chain[k].nopol === np && !isNaN(rowMsS) && Math.abs(chain[k].msS - rowMsS) < 120000) {
  //         myIdx = k;
  //         break;
  //       }
  //     }
  //   }
  //   if (myIdx <= 0) return null;

  //   return { chain: chain, myIdx: myIdx };
  // }

  function bkkDbIntakeChainContext(row, poolRows) {
  if (!row || !poolRows || !poolRows.length) return null;
  if (!bkkDbRowInIntakeChain(row)) return null;

  var bk = String(
    bkkDbCol(row, 'BK_ID') || ''
  ).trim();

  var rowDay = bkkDbYmdFromCell(
    bkkDbCol(row, 'TANGGAL')
  );

  if (!bk || !rowDay) return null;

  var shift = String(
    row.SHIFT != null ? row.SHIFT : ''
  ).trim();

  var index = bkkDbBuildIntakeChainIndex(poolRows);

  /*
   * Shift normal → ambil bucket BK + tanggal + shift
   */
  var key = bk + '|' + rowDay + '|' + shift;

  var chain = index[key] ? index[key].slice() : [];

  /*
   * bkkDbShiftCompatible() menganggap shift kosong
   * kompatibel dengan semua shift.
   *
   * Jadi jika row memiliki shift, tambahkan juga
   * record dari bucket shift kosong.
   */
  if (shift) {
    var emptyKey = bk + '|' + rowDay + '|';

    if (index[emptyKey]) {
      chain = chain.concat(index[emptyKey]);
    }
  } else {
    /*
     * Row saat ini tidak punya SHIFT.
     * Maka harus kompatibel dengan semua SHIFT.
     */
    var prefix = bk + '|' + rowDay + '|';

    Object.keys(index).forEach(function(k) {
      if (k.indexOf(prefix) !== 0) return;

      if (k === key) return;

      chain = chain.concat(index[k]);
    });
  }

  if (chain.length < 2) return null;

  chain.sort(function(a, b) {
    return a.msS - b.msS;
  });

  var rid = bkkDbCol(row, 'ID');
  var myIdx = -1;

  if (rid != null && String(rid).trim() !== '') {
    for (var j = 0; j < chain.length; j++) {
      if (
        String(chain[j].id) === String(rid)
      ) {
        myIdx = j;
        break;
      }
    }
  }

  /*
   * Fallback jika ID tidak ditemukan.
   */
  if (myIdx < 0) {
    var np = String(
      bkkDbCol(row, 'NO_POLISI') || ''
    ).trim().toUpperCase();

    var rowPbY =
      bkkDbYmdFromCell(
        bkkDbCol(row, 'PB_TANGGAL')
      ) || rowDay;

    var rowPs = bkkDbNormalizeHM(
      bkkDbCol(row, 'PB_START')
    );

    var rowMsS = bkkDbConcatMs(
      rowPbY,
      rowPs
    );

    for (var k = 0; k < chain.length; k++) {
      if (
        np &&
        chain[k].nopol === np &&
        !isNaN(rowMsS) &&
        Math.abs(chain[k].msS - rowMsS) < 120000
      ) {
        myIdx = k;
        break;
      }
    }
  }

  if (myIdx <= 0) return null;

  return {
    chain: chain,
    myIdx: myIdx
  };
}

  function bkkDbIdleLossDetailForPopup(row, poolRows) {
    var ctx = bkkDbIntakeChainContext(row, poolRows);
    if (!ctx) return null;
    var prev = ctx.chain[ctx.myIdx - 1];
    var curr = ctx.chain[ctx.myIdx];
    var gapMs = curr.msS - prev.msF;
    var gapMin = Math.round(gapMs / 60000);
    if (gapMin < 0) return null;
    return {
      gapMin: gapMin,
      prevNopol: prev.nopol || '—',
      currNopol: curr.nopol || '—',
      prevFinishStr: bkkDbFormatMsWib(prev.msF),
      currStartStr: bkkDbFormatMsWib(curr.msS),
      pos: ctx.myIdx + 1,
      totalInChain: ctx.chain.length
    };
  }

  /** Hitung menit per segmen dari kolom PB_* + IDLE LOSS dari rantai Intake 71. */
  function bkkDbComputeDurationsFromRow(row, dj, poolRows) {
    poolRows = poolRows || window._bkkDbHistoryRows || [];
    var out = {};
    var isSbm = bkkDbIsSbmRow(row, dj);
    var pbYmd = bkkDbYmdFromCell(bkkDbCol(row, 'PB_TANGGAL'));
    if (!pbYmd) pbYmd = bkkDbYmdFromCell(bkkDbCol(row, 'TANGGAL'));

    if (isSbm) {
      var psSbm = bkkDbNormalizeHM(bkkDbCol(row, 'PB_START'));
      var pfSbm = bkkDbNormalizeHM(bkkDbCol(row, 'PB_FINISH'));
      if (pbYmd && psSbm && pfSbm) {
        var msSS = bkkDbConcatMs(pbYmd, psSbm);
        var msFS = bkkDbConcatMs(pbYmd, pfSbm);
        if (!isNaN(msSS) && !isNaN(msFS) && msFS >= msSS) {
          out.sbm_pb_window = Math.round((msFS - msSS) / 60000);
        }
      }
    } else {
      var steps = [
        { field: 'PB_SAMPAI' },
        { field: 'PB_START' },
        { field: 'PB_HOLD' },
        { field: 'PB_RESTART' },
        { field: 'PB_FINISH' }
      ];
      var points = [];
      for (var si = 0; si < steps.length; si++) {
        var hm = bkkDbNormalizeHM(bkkDbCol(row, steps[si].field));
        if (!hm) continue;
        var ms = bkkDbConcatMs(pbYmd, hm);
        if (isNaN(ms)) continue;
        points.push({ ms: ms, idx: si });
      }
      for (var j = 1; j < points.length; j++) {
        var gap = Math.round((points[j].ms - points[j - 1].ms) / 60000);
        if (gap >= 0) {
          var segKey = 'seg_' + points[j - 1].idx + '_' + points[j].idx;
          out[segKey] = gap;
        }
      }
    }

    var idleKey = isSbm ? 'sbm_gap_truck' : 'gap_truck_ns';
    var idleMin = bkkDbComputeIdleLossMinutes(row, poolRows);
    if (idleMin != null && !isNaN(idleMin) && idleMin >= 0) {
      out[idleKey] = idleMin;
    }

    return out;
  }

  /** Gabungkan breakdown tersimpan + hitungan dari jam. */
  function bkkDbResolveMinutes(dj, key, computed) {
    if (dj && dj.breakdowns && dj.breakdowns[key]) {
      var arr = dj.breakdowns[key];
      if (Array.isArray(arr) && arr.length > 0) {
        var sum = bkkDbSumBreakdown(arr);
        if (sum !== null && !isNaN(sum)) return sum;
      }
    }
    if (computed && computed[key] != null && !isNaN(Number(computed[key]))) {
      return Number(computed[key]);
    }
    return null;
  }

  function bkkDbIsSbmRow(r, dj) {
    if (dj && dj.is_sbm === true) return true;
    if (dj && dj.is_sbm === false) return false;
    return String(r.MATERIAL || '').toLowerCase().indexOf('sbm') >= 0;
  }

  function bkkDbSumBreakdown(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    var s = 0;
    for (var i = 0; i < arr.length; i++) {
      var r = arr[i];
      var m = Number(r.min != null ? r.min : r.MIN);
      if (!isNaN(m)) s += m;
    }
    return s;
  }

  function bkkDbCol(row, name) {
    if (!row) return '';
    var v = row[name];
    if (v != null && v !== '') return v;
    var lo = name.toLowerCase();
    if (row[lo] != null && row[lo] !== '') return row[lo];
    return '';
  }

  function bkkDbRowTypeBongkaran(r) {
    var t = String(bkkDbCol(r, 'TYPE_BONGKARAN') || '').trim().toLowerCase();
    if (!t) {
      var dj = bkkDbParseDj(r);
      if (dj && dj.type_bongkaran) t = String(dj.type_bongkaran).trim().toLowerCase();
    }
    var norm = t.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (norm === 'intake_71_manual' || norm === 'intake71_manual') t = 'intake71_manual';
    else if (norm === 'intake_71_tilting' || norm === 'intake71_tilting' || norm === 'tilting') t = 'intake71_tilting';
    else if (norm === 'direct_gudang' || norm === 'direct') t = 'direct_gudang';
    else if (norm === 'sap_adjustment' || norm === 'sap') t = 'sap_adjustment';
    else t = norm || '';
    return t;
  }

  /** Rantai Intake 71 — sama logika wizard (exclude Direct Gudang). */
  function bkkDbRowInIntakeChain(r) {
    if (!r) return false;
    var t = bkkDbRowTypeBongkaran(r);
    if (t === 'direct_gudang') return false;
    if (!t) return bkkDbLegacyLooksIntake71(r);
    return t === 'intake71_manual' || t === 'intake71_tilting';
  }

  function bkkDbLegacyLooksIntake71(r) {
    var dj = bkkDbParseDj(r);
    var bd = dj && dj.breakdowns ? dj.breakdowns : {};
    return !!(bd.gap_truck_ns || bd.sbm_gap_truck);
  }

  /**
   * Type efektif untuk filter UI. Data lama tanpa TYPE_BONGKARAN diarahkan
   * ke Intake 71 Manual bila punya gap antar truck, selain itu Direct Gudang.
   */
  function bkkDbEffectiveFilterType(r) {
    var types = bkkDbEffectiveFilterTypes(r);
    return types.length ? types[0] : '';
  }

  function bkkDbEffectiveFilterTypes(r) {
    var t = bkkDbRowTypeBongkaran(r);
    if (t === 'sap_adjustment') return [];
    if (t === 'intake71_manual' || t === 'intake71_tilting' || t === 'direct_gudang') return [t];
    if (bkkDbLegacyLooksIntake71(r)) return ['intake71_manual', 'intake71_tilting'];
    return ['direct_gudang'];
  }

  function bkkDbShiftCompatible(rowA, rowB) {
    var sa = String(rowA && rowA.SHIFT != null ? rowA.SHIFT : '').trim();
    var sb = String(rowB && rowB.SHIFT != null ? rowB.SHIFT : '').trim();
    if (!sa || !sb) return true;
    return sa === sb;
  }

  /**
   * IDLE LOSS = PB Start truk ini − PB Finish truk sebelumnya (rantai sama BK, tanggal, shift).
   * Pool = seluruh riwayat agar urutan truk lengkap meski filter material aktif.
   */
  function bkkDbComputeIdleLossMinutes(row, poolRows) {
    var ctx = bkkDbIntakeChainContext(row, poolRows);
    if (!ctx) return null;
    var gapMs = ctx.chain[ctx.myIdx].msS - ctx.chain[ctx.myIdx - 1].msF;
    var gapMin = Math.round(gapMs / 60000);
    if (gapMin < 0) return null;
    return gapMin;
  }

  function bkkDbSegLabel(key) {
    var map = {
      sbm_pb_window: 'Durasi PB (Start–Finish)',
      sbm_gap_truck: 'IDLE LOSS',
      gap_truck_ns: 'IDLE LOSS',
      ab_arr_qc: 'AB Arrival → AB QC',
      ab_qc_pbsampai: 'AB QC → PB Sampai'
    };
    if (map[key]) return map[key];
    var m = /^seg_(\d+)_(\d+)$/.exec(key);
    if (!m) return key;
    var L = ['PB Sampai', 'PB Start', 'PB Hold', 'PB Restart', 'PB Finish'];
    var a = parseInt(m[1], 10);
    var b = parseInt(m[2], 10);
    return (L[a] || ('Tahap ' + a)) + ' → ' + (L[b] || ('Tahap ' + b));
  }

  function bkkDbKeyColor(keysArr, key) {
    var ix = keysArr.indexOf(key);
    if (ix < 0) ix = 0;
    return BKKDB_PALETTE[ix % BKKDB_PALETTE.length];
  }

  function bkkDbMetaForKey(key, keysArr) {
    var sub = 'Dari sheet / breakdown tersimpan';
    if (key === 'sbm_gap_truck' || key === 'gap_truck_ns') {
      sub = 'Antara PB Finish truk sebelumnya & PB Start (Intake 71, sama BK·tanggal·shift)';
    }
    return {
      key: key,
      label: bkkDbSegLabel(key),
      sub: sub,
      color: bkkDbKeyColor(keysArr, key)
    };
  }

  function bkkDbDiscoverKeys(rows) {
    var sbm = {};
    var ns = {};
    BKKDB_SBM_DEFAULT.forEach(function(k) { sbm[k] = true; });
    BKKDB_NS_DEFAULT.forEach(function(k) { ns[k] = true; });
    rows.forEach(function(r) {
      var dj = bkkDbParseDj(r);
      var isS = bkkDbIsSbmRow(r, dj);
      var comp = bkkDbComputeDurationsFromRow(r, dj, rows);
      Object.keys(comp).forEach(function(k) {
        if (isS) sbm[k] = true;
        else ns[k] = true;
      });
      if (dj && dj.breakdowns) {
        Object.keys(dj.breakdowns).forEach(function(k) {
          if (isS) sbm[k] = true;
          else ns[k] = true;
        });
      }
    });
    _bkkDbKeysSbm = Object.keys(sbm).sort();
    _bkkDbKeysNs = Object.keys(ns).sort();
  }

  window.bkkDbToggleMs = function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var drop = el.querySelector('.ms-dropdown');
    var trig = el.querySelector('.ms-trigger');
    document.querySelectorAll('.pivot-multi-select .ms-dropdown.show').forEach(function(d) {
      if (d !== drop) {
        d.classList.remove('show');
        var p = d.parentElement;
        if (p && p.querySelector('.ms-trigger')) p.querySelector('.ms-trigger').classList.remove('active');
      }
    });
    if (drop) drop.classList.toggle('show');
    if (trig) trig.classList.toggle('active');
  };

  window.bkkDbMsAll = function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('input[type="checkbox"]').forEach(function(i) { i.checked = true; });
    bkkDbUpdateMsLabel(id);
    window.bkkDbRender();
  };

  window.bkkDbMsNone = function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('input[type="checkbox"]').forEach(function(i) { i.checked = false; });
    bkkDbUpdateMsLabel(id);
    window.bkkDbRender();
  };

  window.bkkDbFilterMsList = function(input) {
    var term = String(input.value || '').toUpperCase();
    var items = input.parentElement.querySelectorAll('.ms-item');
    items.forEach(function(it) {
      var txt = it.textContent.toUpperCase();
      it.style.display = txt.indexOf(term) >= 0 ? 'flex' : 'none';
    });
  };

  function bkkDbUpdateMsLabel(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var checked = el.querySelectorAll('input:checked');
    var total = el.querySelectorAll('input[type="checkbox"]');
    var label = el.querySelector('.ms-label');
    if (!label) return;
    var allTxt = { 'bkkdb-ms-material': 'SEMUA MATERIAL', 'bkkdb-ms-bk': 'SEMUA BK', 'bkkdb-ms-type-bongkaran': 'SEMUA TYPE BONGKARAN' };
    if (checked.length === 0 || checked.length === total.length) {
      label.textContent = allTxt[id] || 'SEMUA';
      label.style.color = 'var(--text-secondary, #64748b)';
    } else {
      label.textContent = checked.length + ' TERPILIH';
      label.style.color = 'var(--accent-primary, #0284c7)';
    }
  }

  function bkkDbPopulateOneMs(id, items, allLabel) {
    var list = document.getElementById(id).querySelector('.ms-list');
    var label = document.getElementById(id).querySelector('.ms-label');
    if (!list) return;
    list.innerHTML = '';
    if (label) label.textContent = allLabel;
    Array.from(items).sort().forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'ms-item';
      div.onclick = function(e) {
        var inp = div.querySelector('input');
        if (e.target.tagName !== 'INPUT') inp.checked = !inp.checked;
        bkkDbUpdateMsLabel(id);
        window.bkkDbRender();
      };
      div.innerHTML = '<input type="checkbox" value="' + bkkDbEsc(item) + '" checked> <span>' + bkkDbEsc(item) + '</span>';
      list.appendChild(div);
    });
    bkkDbUpdateMsLabel(id);
  }

  function bkkDbPopulateTypeBongkaranMs() {
    var el = document.getElementById('bkkdb-ms-type-bongkaran');
    if (!el) return;
    var list = el.querySelector('.ms-dropdown .ms-list');
    var dropdown = el.querySelector('.ms-dropdown');
    var label = el.querySelector('.ms-label');
    if (!dropdown || !list) {
      // Fallback: jika struktur sedikit berbeda, ambil langsung ms-list
      list = el.querySelector('.ms-list');
    }
    if (!list) return;

    var opts = [
      { value: 'intake71_manual', text: 'Intake 71 Manual', checked: true },
      { value: 'intake71_tilting', text: 'Tilting', checked: true },
      { value: 'direct_gudang', text: 'Direct Gudang', checked: true }
    ];

    list.innerHTML = '';
    opts.forEach(function(opt) {
      var div = document.createElement('div');
      div.className = 'ms-item';
      div.onclick = function(e) {
        var inp = div.querySelector('input');
        if (e.target.tagName !== 'INPUT') {
          inp.checked = !inp.checked;
        }
        bkkDbUpdateMsLabel('bkkdb-ms-type-bongkaran');
        window.bkkDbRender();
      };
      div.innerHTML = '<input type="checkbox" value="' + bkkDbEscAttr(opt.value) + '"' + (opt.checked ? ' checked' : '') + '> <span>' + bkkDbEsc(opt.text) + '</span>';
      list.appendChild(div);
    });
    bkkDbUpdateMsLabel('bkkdb-ms-type-bongkaran');
  }

  function bkkDbGetMsSel(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var checked = el.querySelectorAll('input:checked');
    var total = el.querySelectorAll('input[type="checkbox"]');
    if (checked.length === 0 || checked.length === total.length) return null;
    return Array.from(checked).map(function(c) { return c.value; });
  }

  function bkkDbGetTypeSel() {
    var el = document.getElementById('bkkdb-ms-type-bongkaran');
    if (!el) return ['intake71_manual', 'intake71_tilting', 'direct_gudang'];
    return Array.from(el.querySelectorAll('input:checked')).map(function(c) { return c.value; });
  }

  function bkkDbPad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function bkkDbBuildChips() {
    var sbmEl = document.getElementById('bkkdb-chips-sbm');
    var nsEl = document.getElementById('bkkdb-chips-nonsbm');
    if (!sbmEl || !nsEl) return;

    sbmEl.innerHTML = '';
    _bkkDbKeysSbm.forEach(function(key) {
      var meta = bkkDbMetaForKey(key, _bkkDbKeysSbm);
      var chip = document.createElement('span');
      chip.className = 'db-chip' + (_bkkDbSelSbm.indexOf(key) >= 0 ? ' active' : '');
      chip.textContent = meta.label;
      chip.dataset.key = key;
      chip.dataset.mode = 'sbm';
      chip.onclick = function() {
        document.querySelectorAll('#bkkdb-chips-nonsbm .db-chip').forEach(function(c) { c.classList.remove('active'); });
        _bkkDbSelNs = [];
        chip.classList.toggle('active');
        _bkkDbSelSbm = Array.from(sbmEl.querySelectorAll('.db-chip.active')).map(function(c) { return c.dataset.key; });
        window.bkkDbRender();
      };
      sbmEl.appendChild(chip);
    });

    nsEl.innerHTML = '';
    _bkkDbKeysNs.forEach(function(key) {
      var meta = bkkDbMetaForKey(key, _bkkDbKeysNs);
      var chip = document.createElement('span');
      chip.className = 'db-chip' + (_bkkDbSelNs.indexOf(key) >= 0 ? ' active' : '');
      chip.textContent = meta.label;
      chip.dataset.key = key;
      chip.dataset.mode = 'ns';
      chip.onclick = function() {
        document.querySelectorAll('#bkkdb-chips-sbm .db-chip').forEach(function(c) { c.classList.remove('active'); });
        _bkkDbSelSbm = [];
        chip.classList.toggle('active');
        _bkkDbSelNs = Array.from(nsEl.querySelectorAll('.db-chip.active')).map(function(c) { return c.dataset.key; });
        window.bkkDbRender();
      };
      nsEl.appendChild(chip);
    });
  }

  function bkkDbFilterRows(rows) {
    var startDate = (document.getElementById('bkkdb_start_date') || {}).value || '';
    var endDate = (document.getElementById('bkkdb_end_date') || {}).value || '';
    var selMat = bkkDbGetMsSel('bkkdb-ms-material');
    var selBk = bkkDbGetMsSel('bkkdb-ms-bk');
    var selType = bkkDbGetTypeSel();

    var out = rows.filter(function(r) {
      var t = bkkDbYmdFromCell(bkkDbCol(r, 'TANGGAL'));
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      if (selMat && selMat.indexOf(String(r.MATERIAL || '').trim()) < 0) return false;
      if (selBk && selBk.indexOf(String(r.BK_ID || '').trim()) < 0) return false;
      var effTypes = bkkDbEffectiveFilterTypes(r);
      if (!effTypes.length || !effTypes.some(function(tp) { return selType.indexOf(tp) >= 0; })) return false;
      return true;
    });

    var hasNs = _bkkDbSelNs.length > 0;
    var hasSbm = _bkkDbSelSbm.length > 0;
    if (hasNs || hasSbm) {
      out = out.filter(function(r) {
        var dj = bkkDbParseDj(r);
        var isS = bkkDbIsSbmRow(r, dj);
        if (hasNs) return !isS;
        return isS;
      });
    }

    return out;
  }

  function bkkDbIsIntake71Type(v) {
    var t = String(v || '').trim().toLowerCase();
    return t === 'intake71_manual' || t === 'intake71_tilting';
  }

  function bkkDbComputeTrueTotalMinutes(row) {
    if (!row) return null;
    var dj = bkkDbParseDj(row);
    var isSbm = bkkDbIsSbmRow(row, dj);
    var pbYmd = bkkDbYmdFromCell(bkkDbCol(row, 'PB_TANGGAL'));
    if (!pbYmd) pbYmd = bkkDbYmdFromCell(bkkDbCol(row, 'TANGGAL'));
    if (!pbYmd) return null;

    if (isSbm) {
      var psSbm = bkkDbNormalizeHM(bkkDbCol(row, 'PB_START'));
      var pfSbm = bkkDbNormalizeHM(bkkDbCol(row, 'PB_FINISH'));
      if (psSbm && pfSbm) {
        var msSS = bkkDbConcatMs(pbYmd, psSbm);
        var msFS = bkkDbConcatMs(pbYmd, pfSbm);
        if (!isNaN(msSS) && !isNaN(msFS) && msFS >= msSS) {
          return Math.round((msFS - msSS) / 60000);
        }
      }
    } else {
      var pf = bkkDbNormalizeHM(bkkDbCol(row, 'PB_FINISH'));
      if (!pf) return null;
      var msF = bkkDbConcatMs(pbYmd, pf);
      if (isNaN(msF)) return null;

      // Ambil start: AB Arrival jika ada, jika tidak ada fallback ke PB Sampai
      var abTgl = dj ? dj.ab_tanggal : '';
      var abArr = dj ? dj.ab_arrival : '';
      if (!abTgl) abTgl = bkkDbYmdFromCell(bkkDbCol(row, 'AB_TANGGAL')) || pbYmd;
      if (!abArr) abArr = bkkDbNormalizeHM(bkkDbCol(row, 'AB_ARRIVAL'));

      var msS = NaN;
      if (abTgl && abArr) {
        msS = bkkDbConcatMs(abTgl, abArr);
      }
      if (isNaN(msS)) {
        var pbSampai = bkkDbNormalizeHM(bkkDbCol(row, 'PB_SAMPAI'));
        if (pbSampai) {
          msS = bkkDbConcatMs(pbYmd, pbSampai);
        }
      }

      if (!isNaN(msS) && msF >= msS) {
        return Math.round((msF - msS) / 60000);
      }
    }
    return null;
  }

  function bkkDbComputeRowTotalMinutes(row, allRows) {
    return bkkDbComputeTrueTotalMinutes(row);
  }

  function bkkDbMergeIntervals(intervals) {
    if (!intervals.length) return [];
    intervals.sort(function(a, b) { return a.s - b.s; });
    var merged = [intervals[0]];
    for (var i = 1; i < intervals.length; i++) {
      var cur = intervals[i];
      var last = merged[merged.length - 1];
      if (cur.s <= last.e) {
        if (cur.e > last.e) last.e = cur.e;
      } else {
        merged.push(cur);
      }
    }
    return merged;
  }

  function bkkDbBuildLeadtimeAnalytics(filtered, allRows) {
    var totalTruck = filtered.length;
    var inap = 0;
    var tidak = 0;
    var inapTon = 0;
    var byDate = {};
    var qtyByDate = {};
    var intakeByDate = {};
    var onlyDirectType = false;

    var selType = bkkDbGetTypeSel();
    if (selType && selType.length === 1 && selType[0] === 'direct_gudang') onlyDirectType = true;

    filtered.forEach(function(r) {
      var date = bkkDbYmdFromCell(bkkDbCol(r, 'TANGGAL'));
      if (!date) return;
      var totalMin = bkkDbComputeRowTotalMinutes(r, allRows);
      if (totalMin !== null && totalMin > 24 * 60) {
        inap++;
        inapTon += (Number(r.NETTO_KG) || 0) / 1000;
      } else {
        tidak++;
      }
      if (!byDate[date]) byDate[date] = { inap: 0, tidak: 0 };
      if (totalMin !== null && totalMin > 24 * 60) byDate[date].inap++;
      else byDate[date].tidak++;

      if (!qtyByDate[date]) qtyByDate[date] = { qtyTon: 0, inapTon: 0, hasSbm: false, hasNonSbm: false };
      var ton = (Number(r.NETTO_KG) || 0) / 1000;
      qtyByDate[date].qtyTon += ton;
      if (totalMin !== null && totalMin > 24 * 60) qtyByDate[date].inapTon += ton;
      var isS = bkkDbIsSbmRow(r, bkkDbParseDj(r));
      if (isS) qtyByDate[date].hasSbm = true; else qtyByDate[date].hasNonSbm = true;

      var isIntakeLike = bkkDbRowInIntakeChain(r);
      if (isIntakeLike) {
        if (!intakeByDate[date]) intakeByDate[date] = { trucks: 0, nettoKg: 0, intervals: [], details: [], fallbackActiveMin: 0 };
        var pbYmd = bkkDbYmdFromCell(bkkDbCol(r, 'PB_TANGGAL')) || date;
        var ps = bkkDbNormalizeHM(bkkDbCol(r, 'PB_START'));
        var pf = bkkDbNormalizeHM(bkkDbCol(r, 'PB_FINISH'));
        var msS = bkkDbConcatMs(pbYmd, ps);
        var msF = bkkDbConcatMs(pbYmd, pf);
        intakeByDate[date].trucks++;
        intakeByDate[date].nettoKg += Number(r.NETTO_KG) || 0;
        if (!isNaN(msS) && !isNaN(msF) && msF >= msS) {
          intakeByDate[date].intervals.push({ s: msS, e: msF });
          intakeByDate[date].details.push({
            nopol: String(r.NO_POLISI || '-'),
            start: bkkDbNormalizeHM(bkkDbCol(r, 'PB_START')) || '-',
            finish: bkkDbNormalizeHM(bkkDbCol(r, 'PB_FINISH')) || '-',
            durMin: Math.round((msF - msS) / 60000),
            nettoKg: Number(r.NETTO_KG) || 0
          });
        } else {
          var fallbackDur = bkkDbComputeRowTotalMinutes(r, allRows);
          if (fallbackDur && fallbackDur > 0) {
            intakeByDate[date].fallbackActiveMin += Math.min(1440, Math.round(fallbackDur));
            intakeByDate[date].details.push({
              nopol: String(r.NO_POLISI || '-'),
              start: '-',
              finish: '-',
              durMin: Math.round(fallbackDur),
              nettoKg: Number(r.NETTO_KG) || 0
            });
          }
        }
      }
    });

    var dates = Object.keys(byDate).sort();
    var trend = {
      labels: dates,
      inap: dates.map(function(d) { return byDate[d].inap; }),
      tidak: dates.map(function(d) { return byDate[d].tidak; })
    };
    var qtyTrend = {
      labels: Object.keys(qtyByDate).sort(),
      qtyTon: [],
      targetTon: [],
      inapTon: []
    };
    qtyTrend.labels.forEach(function(d) {
      var obj = qtyByDate[d];
      var tgt = (obj.hasSbm ? 800 : 0) + (obj.hasNonSbm ? 300 : 0);
      qtyTrend.qtyTon.push(Number(obj.qtyTon.toFixed(2)));
      qtyTrend.targetTon.push(tgt);
      qtyTrend.inapTon.push(Number(obj.inapTon.toFixed(2)));
    });

    var intakeRows = Object.keys(intakeByDate).sort().map(function(d) {
      var rec = intakeByDate[d];
      var merged = bkkDbMergeIntervals(rec.intervals.slice());
      var activeMin = merged.reduce(function(acc, it) { return acc + Math.max(0, Math.round((it.e - it.s) / 60000)); }, 0);
      if (activeMin <= 0 && rec.fallbackActiveMin > 0) activeMin = rec.fallbackActiveMin;
      if (activeMin > 1440) activeMin = 1440;
      var offMin = Math.max(0, 1440 - activeMin);
      var util = (activeMin / 1440) * 100;
      return {
        date: d,
        trucks: rec.trucks,
        activeMin: activeMin,
        offMin: offMin,
        nettoKg: rec.nettoKg,
        utilPct: util,
        details: rec.details
      };
    });

    return {
      totalTruck: totalTruck,
      inap: inap,
      tidak: tidak,
      inapPct: totalTruck > 0 ? (inap / totalTruck) * 100 : 0,
      trend: trend,
      qtyTrend: qtyTrend,
      intakeRows: intakeRows,
      onlyDirectType: onlyDirectType
    };
  }

  function bkkDbRenderLeadtimePanels(analytics) {
    var kpi = document.getElementById('bkkdb-inap-kpi-grid');
    if (kpi) {
      kpi.innerHTML =
        '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;border-top:4px solid #3b82f6;"><div style="font-size:.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">Total Truck</div><div style="font-family:\'Rajdhani\',sans-serif;font-size:2rem;font-weight:800;color:#1e293b;">' + analytics.totalTruck + '</div></div>' +
        '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;border-top:4px solid #ef4444;"><div style="font-size:.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">Inap (>24j)</div><div style="font-family:\'Rajdhani\',sans-serif;font-size:2rem;font-weight:800;color:#ef4444;">' + analytics.inap + '</div></div>' +
        '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;border-top:4px solid #10b981;"><div style="font-size:.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">Tidak Inap</div><div style="font-family:\'Rajdhani\',sans-serif;font-size:2rem;font-weight:800;color:#10b981;">' + analytics.tidak + '</div></div>' +
        '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;border-top:4px solid #8b5cf6;"><div style="font-size:.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">Proporsi Inap</div><div style="font-family:\'Rajdhani\',sans-serif;font-size:2rem;font-weight:800;color:#8b5cf6;">' + analytics.inapPct.toFixed(1) + '%</div></div>';
    }

    if (typeof Chart !== 'undefined') {
      if (_bkkDbInapDonut) { try { _bkkDbInapDonut.destroy(); } catch (e) {} _bkkDbInapDonut = null; }
      if (_bkkDbInapTrend) { try { _bkkDbInapTrend.destroy(); } catch (e) {} _bkkDbInapTrend = null; }
      if (_bkkDbQtyTarget) { try { _bkkDbQtyTarget.destroy(); } catch (e) {} _bkkDbQtyTarget = null; }

      var c1 = document.getElementById('bkkdb-inap-donut');
      if (c1) {
        _bkkDbInapDonut = new Chart(c1.getContext('2d'), {
          type: 'doughnut',
          data: { labels: ['Inap', 'Tidak Inap'], datasets: [{ data: [analytics.inap, analytics.tidak], backgroundColor: ['#ef4444', '#10b981'] }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '68%' }
        });
      }
      var c2 = document.getElementById('bkkdb-inap-trend');
      if (c2) {
        _bkkDbInapTrend = new Chart(c2.getContext('2d'), {
          type: 'line',
          data: {
            labels: analytics.trend.labels,
            datasets: [
              { label: 'Inap', data: analytics.trend.inap, borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.35, pointRadius: 3 },
              { label: 'Tidak Inap', data: analytics.trend.tidak, borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.35, pointRadius: 3 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
      }
      var c3 = document.getElementById('bkkdb-qty-target-chart');
      if (c3) {
        _bkkDbQtyTarget = new Chart(c3.getContext('2d'), {
          data: {
            labels: analytics.qtyTrend.labels,
            datasets: [
              { type: 'bar', label: 'Qty Bongkar (ton)', data: analytics.qtyTrend.qtyTon, backgroundColor: 'rgba(56,189,248,0.7)', borderRadius: 6 },
              { type: 'line', label: 'Target (ton)', data: analytics.qtyTrend.targetTon, borderColor: '#6366f1', borderWidth: 2, tension: 0.3, pointRadius: 3 },
              { type: 'bar', label: 'Qty Inapan (ton)', data: analytics.qtyTrend.inapTon, backgroundColor: 'rgba(225,29,72,0.65)', borderRadius: 6 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Ton' } } } }
        });
      }
    }

    var intakePanel = document.getElementById('bkkdb-intake71-panel');
    var intakeBody = document.getElementById('bkkdb-intake71-tbody');
    var note = document.getElementById('bkkdb-intake71-note');
    _bkkDbIntakeByDate = {};
    if (intakeBody) {
      if (analytics.onlyDirectType) {
        if (intakePanel) intakePanel.style.opacity = '0.6';
        if (note) note.textContent = 'Nonaktif karena filter hanya Direct Gudang.';
        intakeBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">Filter Direct Gudang aktif. Tabel Intake 71 dinonaktifkan.</td></tr>';
      } else {
        if (intakePanel) intakePanel.style.opacity = '1';
        if (note) note.textContent = 'Klik baris untuk popup durasi per truck.';
        if (!analytics.intakeRows.length) {
          intakeBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">Tidak ada data Intake 71 untuk filter ini.</td></tr>';
        } else {
          intakeBody.innerHTML = analytics.intakeRows.map(function(r) {
            _bkkDbIntakeByDate[r.date] = r.details || [];
            var actH = Math.floor(r.activeMin / 60), actM = r.activeMin % 60;
            var offH = Math.floor(r.offMin / 60), offM = r.offMin % 60;
            return '<tr style="cursor:pointer;" onclick="bkkDbShowIntakePopup(\'' + bkkDbEscAttr(r.date) + '\')">' +
              '<td>' + bkkDbEsc(r.date) + '</td>' +
              '<td style="text-align:center;font-weight:700;">' + r.trucks + '</td>' +
              '<td style="font-weight:700;color:#10b981;">' + actH + 'j ' + bkkDbP2(actM) + 'm</td>' +
              '<td style="font-weight:700;color:#ef4444;">' + offH + 'j ' + bkkDbP2(offM) + 'm</td>' +
              '<td style="text-align:right;font-family:\'Rajdhani\',sans-serif;font-weight:800;">' + (r.nettoKg || 0).toLocaleString('id-ID') + ' kg</td>' +
              '<td><span class="db-badge db-badge-normal">' + r.utilPct.toFixed(1) + '%</span></td></tr>';
          }).join('');
        }
      }
    }
  }

  function bkkDbFormatMin(m) {
    if (m === null || m === undefined || isNaN(m)) return '-';
    if (m < 0) m = 0;
    var hrs = Math.floor(m / 60);
    var mins = Math.round(m % 60);
    return hrs + 'j ' + (mins < 10 ? '0' : '') + mins + 'm';
  }

  function bkkDbRenderTopSummary(selected, tableData, sumMap, countMap) {
    var sumGrid = document.getElementById('bkkdb-top-summary-grid');
    if (!sumGrid) return;

    var totalMin = 0;
    var totalCnt = 0;
    tableData.forEach(function(e) {
      if (e.totalValid && e.total !== null) {
        totalMin += e.total;
        totalCnt++;
      }
    });
    var avgTotal = totalCnt > 0 ? totalMin / totalCnt : 0;
    var hTotal = Math.floor(avgTotal / 60);
    var mTotal = Math.round(avgTotal % 60);
    var avgTotalStr = totalCnt > 0 ? hTotal + 'j ' + (mTotal < 10 ? '0' : '') + mTotal + 'm' : '-';

    var maxAvg = -Infinity;
    var minAvg = Infinity;
    var bStage = null;
    var fStage = null;
    selected.forEach(function(t) {
      if (countMap[t.key] > 0) {
        var avg = sumMap[t.key] / countMap[t.key];
        if (avg > maxAvg) {
          maxAvg = avg;
          bStage = { label: t.label, avg: avg };
        }
        if (avg < minAvg) {
          minAvg = avg;
          fStage = { label: t.label, avg: avg };
        }
      }
    });

    function badge(avgMin) {
      if (avgMin === null || isNaN(avgMin)) return '';
      var hrs = avgMin / 60;
      if (hrs < 5) return '<span class="db-badge db-badge-cepat">Cepat</span>';
      if (hrs <= 10) return '<span class="db-badge db-badge-normal">Normal</span>';
      return '<span class="db-badge db-badge-lama">Lama</span>';
    }

    sumGrid.innerHTML =
      '<div class="db-summary-card" style="background:#ffffff;border-radius:16px;padding:20px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);border:1px solid #e2e8f0;border-top:4px solid #8b5cf6;display:flex;align-items:center;gap:20px;">' +
      '<div style="background:#f5f3ff;width:50px;height:50px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#8b5cf6;flex-shrink:0;"><i class="fas fa-stopwatch" style="font-size:1.5rem;"></i></div>' +
      '<div><div style="font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;">Rata-rata Total Durasi</div>' +
      '<div style="font-family:\'Rajdhani\',sans-serif;font-size:1.8rem;font-weight:800;color:#1e293b;margin-top:2px;">' + avgTotalStr + '</div>' +
      '<div style="font-size:0.7rem;color:#94a3b8;margin-top:4px;">Berdasarkan ' + totalCnt + ' truck valid</div></div></div>' +

      '<div class="db-summary-card" style="background:#ffffff;border-radius:16px;padding:20px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);border:1px solid #e2e8f0;border-top:4px solid #ef4444;display:flex;align-items:center;gap:20px;">' +
      '<div style="background:#fef2f2;width:50px;height:50px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#ef4444;flex-shrink:0;"><i class="fas fa-hourglass-half" style="font-size:1.5rem;"></i></div>' +
      '<div style="flex-grow:1;min-width:0;">' +
      '<div style="font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;">Bottleneck Utama</div>' +
      '<div style="font-family:\'Rajdhani\',sans-serif;font-size:1.2rem;font-weight:800;color:#1e293b;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + (bStage ? bkkDbEsc(bStage.label) : '') + '">' + (bStage ? bkkDbEsc(bStage.label) : '-') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;"><span style="font-family:\'Rajdhani\',sans-serif;font-size:1rem;font-weight:700;color:#475569;">' + (bStage ? bkkDbFormatMin(bStage.avg) : '-') + '</span>' + (bStage ? badge(bStage.avg) : '') + '</div></div></div>' +

      '<div class="db-summary-card" style="background:#ffffff;border-radius:16px;padding:20px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);border:1px solid #e2e8f0;border-top:4px solid #10b981;display:flex;align-items:center;gap:20px;">' +
      '<div style="background:#ecfdf5;width:50px;height:50px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#10b981;flex-shrink:0;"><i class="fas fa-bolt" style="font-size:1.5rem;"></i></div>' +
      '<div style="flex-grow:1;min-width:0;">' +
      '<div style="font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;">Tahap Tercepat</div>' +
      '<div style="font-family:\'Rajdhani\',sans-serif;font-size:1.2rem;font-weight:800;color:#1e293b;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + (fStage ? bkkDbEsc(fStage.label) : '') + '">' + (fStage ? bkkDbEsc(fStage.label) : '-') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;"><span style="font-family:\'Rajdhani\',sans-serif;font-size:1rem;font-weight:700;color:#475569;">' + (fStage ? bkkDbFormatMin(fStage.avg) : '-') + '</span>' + (fStage ? badge(fStage.avg) : '') + '</div></div></div>';
  }

  function bkkDbRenderBottomSummary(rows) {
    var bottomGrid = document.getElementById('bkkdb-bottom-summary-grid');
    if (!bottomGrid) return;

    var bkMap = {};
    var grandTotal = 0;
    rows.forEach(function(r) {
      var bk = String(r.BK_ID || '—').trim();
      var v = Number(r.NETTO_KG) || 0;
      bkMap[bk] = (bkMap[bk] || 0) + v;
      grandTotal += v;
    });

    var maxBk = 0;
    Object.keys(bkMap).forEach(function(k) {
      if (bkMap[k] > maxBk) maxBk = bkMap[k];
    });

    var bars = Object.keys(bkMap).sort(function(a, b) { return bkMap[b] - bkMap[a]; }).map(function(k) {
      var v = bkMap[k];
      var pct = maxBk > 0 ? (v / maxBk) * 100 : 0;
      return '<div style="margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:600;color:#475569;margin-bottom:4px;"><span>' + bkkDbEsc(k) + '</span>' +
        '<span style="font-family:\'Rajdhani\',sans-serif;font-weight:700;color:#1e293b;">' + v.toLocaleString('id-ID') + ' kg</span></div>' +
        '<div style="background:#f1f5f9;height:8px;border-radius:4px;overflow:hidden;">' +
        '<div style="background:#f59e0b;width:' + pct + '%;height:100%;border-radius:4px;"></div></div></div>';
    }).join('');

    if (!bars) bars = '<div style="color:#94a3b8;font-size:0.8rem;text-align:center;padding:15px;">Tidak ada data</div>';

    bottomGrid.innerHTML =
      '<div style="background:#ffffff;border-radius:16px;padding:20px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);border:1px solid #e2e8f0;border-top:4px solid #f59e0b;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:15px;">' +
      '<div style="background:#fef3c7;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#f59e0b;"><i class="fas fa-warehouse" style="font-size:1.2rem;"></i></div>' +
      '<div style="font-size:0.85rem;font-weight:800;color:#1e293b;text-transform:uppercase;">Ringkasan per BK</div></div>' +
      '<div style="max-height:220px;overflow-y:auto;padding-right:5px;">' + bars + '</div>' +
      '<div style="margin-top:15px;border-top:1px dashed #e2e8f0;padding-top:12px;display:flex;justify-content:space-between;">' +
      '<span style="font-size:0.75rem;font-weight:800;color:#64748b;">TOTAL NETTO</span>' +
      '<span style="font-family:\'Rajdhani\',sans-serif;font-size:1.2rem;font-weight:800;color:#f59e0b;">' + grandTotal.toLocaleString('id-ID') + ' kg</span></div></div>' +

      '<div style="background:#ffffff;border-radius:16px;padding:20px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);border:1px solid #e2e8f0;border-top:4px solid #0284c7;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">' +
      '<div style="background:#e0f2fe;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#0284c7;"><i class="fas fa-truck-loading" style="font-size:1.2rem;"></i></div>' +
      '<div style="font-size:0.85rem;font-weight:800;color:#1e293b;text-transform:uppercase;">Statistik</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:16px;">' +
      '<div style="display:flex;justify-content:space-between;padding:12px;background:#f0f9ff;border-radius:10px;">' +
      '<span style="font-size:0.85rem;font-weight:600;color:#475569;">Total truck (filter)</span>' +
      '<span style="font-family:\'Rajdhani\',sans-serif;font-weight:800;color:#0284c7;font-size:1.4rem;">' + rows.length + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:12px;background:#f0fdf4;border-radius:10px;">' +
      '<span style="font-size:0.85rem;font-weight:600;color:#475569;">Total netto</span>' +
      '<span style="font-family:\'Rajdhani\',sans-serif;font-weight:800;color:#10b981;font-size:1.4rem;">' + grandTotal.toLocaleString('id-ID') + ' kg</span></div></div></div>';
  }

  function bkkDbDestroyCharts() {
    Object.keys(_bkkDbMiniCharts).forEach(function(k) {
      try {
        _bkkDbMiniCharts[k].destroy();
      } catch (e) {}
    });
    _bkkDbMiniCharts = {};
  }

  window.bkkDbSortBy = function(col) {
    if (_bkkDbSortCol === col) _bkkDbSortAsc = !_bkkDbSortAsc;
    else {
      _bkkDbSortCol = col;
      _bkkDbSortAsc = true;
    }
    window.bkkDbRender();
  };

  window.bkkDbRender = function() {
    var rows = window._bkkDbHistoryRows || [];
    if (!rows.length) {
      var tg = document.getElementById('bkkdb-top-summary-grid');
      if (tg) tg.innerHTML = '';
      var mg = document.getElementById('bkkdb-mini-grid');
      if (mg) mg.innerHTML = '<div style="padding:30px;color:#64748b;">Belum ada data bongkar.</div>';
      var tb = document.getElementById('bkkdb-tbody');
      if (tb) tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;">Muat data dari server…</td></tr>';
      return;
    }

    ['bkkdb-ms-material', 'bkkdb-ms-bk'].forEach(bkkDbUpdateMsLabel);

    var filtered = bkkDbFilterRows(rows);
    _bkkDbLastFiltered = filtered;
    _bkkDbAggBreakdownByKey = {};

    var hasNs = _bkkDbSelNs.length > 0;
    var hasSbm = _bkkDbSelSbm.length > 0;
    var keyList = hasNs ? _bkkDbKeysNs : _bkkDbKeysSbm;
    var selectedKeys = hasNs ? _bkkDbSelNs : _bkkDbSelSbm;
    var selected = selectedKeys.map(function(k) {
      return bkkDbMetaForKey(k, keyList);
    }).filter(function(t) { return keyList.indexOf(t.key) >= 0; });

    if (!hasNs && !hasSbm) {
      bkkDbRenderTopSummary([], [], {}, {});
      bkkDbRenderLeadtimePanels(bkkDbBuildLeadtimeAnalytics([], rows));
      bkkDbRenderMiniGrid([], {}, {}, {});
      bkkDbRenderTable([], [], rows);
      return;
    }

    var sumMap = {};
    var countMap = {};
    var distMap = {};
    selected.forEach(function(t) {
      sumMap[t.key] = 0;
      countMap[t.key] = 0;
      distMap[t.key] = [0, 0, 0, 0, 0];
      _bkkDbAggBreakdownByKey[t.key] = { totalMin: 0, totalTruck: 0, causes: {} };
    });

    var tableData = [];
    filtered.forEach(function(row) {
      var dj = bkkDbParseDj(row);
      var computed = bkkDbComputeDurationsFromRow(row, dj, rows);
      var entry = {
        nopol: String(row.NO_POLISI || row.no_polisi || '-'),
        tanggal: bkkDbYmdFromCell(bkkDbCol(row, 'TANGGAL')) || String(bkkDbCol(row, 'TANGGAL') || '').substring(0, 10),
        durations: {},
        total: null,
        totalValid: false,
        breakdownRoot: dj && dj.breakdowns ? dj.breakdowns : {},
        computed: computed,
        kg: Number(row.NETTO_KG) || 0,
        sourceRow: row
      };
      var rowTotal = 0;
      var hasAny = false;
      selected.forEach(function(t) {
        var v = bkkDbResolveMinutes(dj, t.key, computed);
        entry.durations[t.key] = v;
        if (v !== null && !isNaN(v) && v >= 0) {
          sumMap[t.key] += v;
          countMap[t.key]++;
          rowTotal += v;
          hasAny = true;
          if (v < 30) distMap[t.key][0]++;
          else if (v < 60) distMap[t.key][1]++;
          else if (v < 120) distMap[t.key][2]++;
          else if (v < 240) distMap[t.key][3]++;
          else distMap[t.key][4]++;

          var agg = _bkkDbAggBreakdownByKey[t.key];
          if (agg) {
            agg.totalMin += Number(v) || 0;
            agg.totalTruck += 1;
            var rowBd = (entry.breakdownRoot && entry.breakdownRoot[t.key]) ? entry.breakdownRoot[t.key] : [];
            if (Array.isArray(rowBd) && rowBd.length) {
              rowBd.forEach(function(it) {
                var ket = bkkDbBreakdownKeterangan(it) || 'Lainnya';
                var mn = parseInt(it.min != null ? it.min : it.MIN, 10);
                if (isNaN(mn) || mn <= 0) return;
                agg.causes[ket] = (agg.causes[ket] || 0) + mn;
              });
            } else {
              agg.causes['Durasi dari selisih jam (tanpa breakdown)'] = (agg.causes['Durasi dari selisih jam (tanpa breakdown)'] || 0) + Number(v || 0);
            }
          }
        }
      });
      entry.total = bkkDbComputeTrueTotalMinutes(row);
      entry.totalValid = (entry.total !== null && entry.total >= 0);
      tableData.push(entry);
    });

    bkkDbRenderTopSummary(selected, tableData, sumMap, countMap);
    // Ringkasan per-BK & Statistik disembunyikan sesuai permintaan.
    bkkDbRenderLeadtimePanels(bkkDbBuildLeadtimeAnalytics(filtered, rows));
    bkkDbRenderMiniGrid(selected, sumMap, countMap, distMap);
    bkkDbRenderTable(selected, tableData, rows);
  };

  function bkkDbRenderMiniGrid(selected, sumMap, countMap, distMap) {
    var grid = document.getElementById('bkkdb-mini-grid');
    if (!grid) return;
    bkkDbDestroyCharts();

    if (selected.length === 0) {
      grid.innerHTML = '<div style="padding:30px;color:#64748b;font-weight:600;">Pilih minimal 1 tipe durasi (chip SBM atau Non-SBM).</div>';
      return;
    }

    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    grid.style.gap = '20px';

    grid.innerHTML = selected.map(function(t) {
      var sid = 'bkkdb-dmc-' + String(t.key).replace(/[^a-zA-Z0-9]/g, '_');
      return '<div class="db-mini-card" id="' + sid + '-card" style="border-top-color:' + t.color + ';cursor:pointer;" onclick="bkkDbShowAggregateByKey(\'' + bkkDbEscAttr(t.key) + '\',\'' + bkkDbEscAttr(t.label) + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">' +
        '<div><div style="font-size:0.85rem;font-weight:700;color:#475569;text-transform:uppercase;">' + bkkDbEsc(t.label) + '</div>' +
        '<div style="font-size:0.7rem;color:#94a3b8;margin-top:2px;">' + bkkDbEsc(t.sub) + '</div></div>' +
        '<span id="' + sid + '-sts"></span></div>' +
        '<div id="' + sid + '-avg" style="font-family:\'Rajdhani\',sans-serif;font-size:2rem;font-weight:800;color:' + t.color + ';margin-bottom:15px;">-</div>' +
        '<div style="height:120px;margin-bottom:15px;position:relative;"><canvas id="' + sid + '-chart"></canvas></div>' +
        '<div style="border-top:1px dashed #e2e8f0;padding-top:12px;font-size:0.75rem;color:#64748b;display:flex;justify-content:space-between;align-items:center;"><span>Data valid: <span id="' + sid + '-cnt" style="color:' + t.color + ';font-weight:700;">0</span> truck</span><span style="color:' + t.color + ';font-weight:700;font-size:0.68rem;">Klik detail</span></div></div>';
    }).join('');

    selected.forEach(function(t, idx) {
      var sid = 'bkkdb-dmc-' + String(t.key).replace(/[^a-zA-Z0-9]/g, '_');
      var card = document.getElementById(sid + '-card');
      if (card) {
        setTimeout(function() {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, idx * 70);
      }

      var avg = countMap[t.key] > 0 ? sumMap[t.key] / countMap[t.key] : null;
      var avgEl = document.getElementById(sid + '-avg');
      var cntEl = document.getElementById(sid + '-cnt');
      var stsEl = document.getElementById(sid + '-sts');
      if (avgEl) {
        if (avg !== null && !isNaN(avg)) {
          var h = Math.floor(avg / 60);
          var m = Math.round(avg % 60);
          avgEl.textContent = h + 'j ' + (m < 10 ? '0' : '') + m + 'm';
        } else avgEl.textContent = '-';
      }
      if (cntEl) cntEl.textContent = countMap[t.key];
      if (stsEl && avg !== null) {
        var hrs = avg / 60;
        if (hrs < 5) stsEl.innerHTML = '<span class="db-badge db-badge-cepat">Cepat</span>';
        else if (hrs <= 10) stsEl.innerHTML = '<span class="db-badge db-badge-normal">Normal</span>';
        else stsEl.innerHTML = '<span class="db-badge db-badge-lama">Lama</span>';
      }

      var canvasEl = document.getElementById(sid + '-chart');
      if (!canvasEl || typeof Chart === 'undefined') return;
      var ctx = canvasEl.getContext('2d');
      var dist = distMap[t.key];
      var hex = t.color;
      _bkkDbMiniCharts[t.key] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['<30m', '30-60m', '1-2j', '2-4j', '>4j'],
          datasets: [{
            data: dist,
            backgroundColor: [hex + '55', hex + '77', hex + '99', hex + 'bb', hex + 'dd'],
            borderColor: hex,
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600 },
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 9 } } },
            y: { display: false, beginAtZero: true }
          }
        }
      });
    });
  }

  function bkkDbRenderTable(selected, tableData, historyPool) {
    historyPool = historyPool || window._bkkDbHistoryRows || [];
    if (_bkkDbSortCol !== null) {
      tableData.sort(function(a, b) {
        var va, vb;
        if (_bkkDbSortCol === '__total') {
          va = a.total;
          vb = b.total;
        } else if (_bkkDbSortCol === '__nopol') {
          va = a.nopol;
          vb = b.nopol;
        } else if (_bkkDbSortCol === '__tanggal') {
          va = a.tanggal;
          vb = b.tanggal;
        } else if (_bkkDbSortCol === '__kg') {
          va = a.kg;
          vb = b.kg;
        } else {
          va = a.durations[_bkkDbSortCol];
          vb = b.durations[_bkkDbSortCol];
        }
        if (typeof va === 'string') return _bkkDbSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        var na = (va == null || isNaN(va)) ? -Infinity : va;
        var nb = (vb == null || isNaN(vb)) ? -Infinity : vb;
        return _bkkDbSortAsc ? na - nb : nb - na;
      });
    }

    function sortIcon(col) {
      var isActive = _bkkDbSortCol === col;
      var arrow = isActive ? (_bkkDbSortAsc ? '▲' : '▼') : '⇅';
      return '<span class="sort-icon">' + arrow + '</span>';
    }
    function thClick(col) {
      return 'onclick="bkkDbSortBy(\'' + col + '\')"';
    }

    var thead = document.getElementById('bkkdb-thead');
    if (!thead) return;
    var hr = '<tr>';
    hr += '<th ' + thClick('__nopol') + ' class="' + (_bkkDbSortCol === '__nopol' ? 'sort-active' : '') + '">No Polisi ' + sortIcon('__nopol') + '</th>';
    hr += '<th ' + thClick('__tanggal') + ' class="' + (_bkkDbSortCol === '__tanggal' ? 'sort-active' : '') + '">Tanggal ' + sortIcon('__tanggal') + '</th>';
    selected.forEach(function(t) {
      hr += '<th ' + thClick(t.key) + ' class="' + (_bkkDbSortCol === t.key ? 'sort-active' : '') + '" style="min-width:90px;">' + bkkDbEsc(t.label) + ' ' + sortIcon(t.key) + '</th>';
    });
    hr += '<th ' + thClick('__total') + ' class="' + (_bkkDbSortCol === '__total' ? 'sort-active' : '') + '" style="min-width:80px;">Total ' + sortIcon('__total') + '</th>';
    hr += '<th ' + thClick('__kg') + ' class="' + (_bkkDbSortCol === '__kg' ? 'sort-active' : '') + '" style="min-width:90px;">Netto (kg) ' + sortIcon('__kg') + '</th>';
    hr += '<th style="min-width:70px;">Status</th></tr>';
    thead.innerHTML = hr;

    var tbody = document.getElementById('bkkdb-tbody');
    var colSpan = 5 + selected.length;
    window._bkkDbTableRows = tableData;
    var html = '';
    var disp = tableData.slice(0, 1000);
    disp.forEach(function(entry, idx) {
      var totalHrs = entry.totalValid && entry.total !== null ? entry.total / 60 : null;
      var badge = '-';
      if (totalHrs !== null) {
        if (totalHrs < 5) badge = '<span class="db-badge db-badge-cepat">Cepat</span>';
        else if (totalHrs <= 10) badge = '<span class="db-badge db-badge-normal">Normal</span>';
        else badge = '<span class="db-badge db-badge-lama">Lama</span>';
      }
      html += '<tr style="animation-delay:' + Math.min(idx, 20) * 0.02 + 's;">';
      html += '<td class="tjp-nopol-cell" style="font-weight:700;cursor:pointer;color:#3b82f6;text-decoration:underline;text-decoration-style:dotted;" onclick="event.stopPropagation();showTruckJourneyPopup(' + idx + ')" title="Klik untuk lihat perjalanan truck">' + bkkDbEsc(entry.nopol) + '</td>';
      html += '<td style="color:var(--text-secondary,#64748b);">' + bkkDbEsc(entry.tanggal) + '</td>';
      selected.forEach(function(t) {
        var v = entry.durations[t.key];
        if (v !== null && !isNaN(v) && v >= 0) {
          var rowBd = (entry.breakdownRoot && entry.breakdownRoot[t.key]) ? entry.breakdownRoot[t.key] : [];
          if (!Array.isArray(rowBd)) rowBd = [];
          var jsonEnc = encodeURIComponent(JSON.stringify(rowBd));
          var safeNp = bkkDbEscAttr(entry.nopol || '');
          var idleEnc = '';
          if (t.key === 'sbm_gap_truck' || t.key === 'gap_truck_ns') {
            var idl = bkkDbIdleLossDetailForPopup(entry.sourceRow, historyPool);
            if (idl) idleEnc = encodeURIComponent(JSON.stringify(idl));
          }
          html += '<td style="text-align:center;color:' + t.color + ';">' +
            '<span class="breakdown-clickable" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;" ' +
            'onclick="event.preventDefault();event.stopPropagation();bkkDbShowBreakdownDetail(this)" ' +
            'data-nopol="' + safeNp + '" data-typekey="' + bkkDbEscAttr(t.key) + '" data-typelabel="' + bkkDbEscAttr(t.label) + '" ' +
            'data-json="' + jsonEnc + '" data-total="' + v + '" data-idle="' + idleEnc + '" title="Klik untuk lihat rincian breakdown">' +
            bkkDbFormatMin(v) + '</span></td>';
        } else html += '<td style="text-align:center;color:#cbd5e1;">-</td>';
      });
      html += '<td style="text-align:center;font-weight:800;">' + bkkDbFormatMin(entry.total) + '</td>';
      html += '<td style="text-align:center;">' + (entry.kg > 0 ? entry.kg.toLocaleString('id-ID') : '-') + '</td>';
      html += '<td style="text-align:center;">' + badge + '</td></tr>';
    });

    if (tableData.length === 0) {
      html = '<tr><td colspan="' + colSpan + '" style="text-align:center;padding:40px;color:#64748b;">Tidak ada data untuk filter ini</td></tr>';
    } else if (tableData.length > 1000) {
      html += '<tr><td colspan="' + colSpan + '" style="text-align:center;padding:12px;color:#64748b;">Menampilkan 1.000 baris pertama dari ' + tableData.length + ' data</td></tr>';
    }
    tbody.innerHTML = html;
  }

  function bkkDbAggToItems(causes) {
    var colors = ['#7c3aed', '#dc2626', '#2563eb', '#d97706', '#059669', '#0891b2', '#be185d', '#65a30d'];
    return causes.map(function(c, i) {
      var col = colors[i % colors.length];
      return {
        nama: c.ket,
        durasi: Math.round(Number(c.menit) || 0),
        warna: col,
        warnaLight: col + '22'
      };
    });
  }

  function bkkDbAggregateInsight(items, totalMin) {
    if (!items.length || totalMin <= 0) return 'Tidak ada rincian penyebab yang dapat dianalisis.';
    var top = items[0];
    var pct = ((top.durasi / totalMin) * 100).toFixed(1);
    var cum = 0;
    var n80 = 0;
    for (var i = 0; i < items.length; i++) {
      cum += items[i].durasi;
      if (cum / totalMin >= 0.8) {
        n80 = i + 1;
        break;
      }
    }
    return 'Penyebab terbesar adalah ' + top.nama + ' (' + pct + '%). Sekitar 80% durasi terkumpul dari ' + n80 + ' kategori teratas.';
  }

  function bkkDbBuildAggregateHtml(model) {
    var items = model.items || [];
    var totalMin = model.totalMin || 0;
    var top = items[0] || { nama: '-', durasi: 0, warna: '#7c3aed', warnaLight: '#ede9fe' };
    var topPct = totalMin > 0 ? ((top.durasi / totalMin) * 100).toFixed(1) : '0.0';
    var cum = 0;
    var n80 = 0;
    for (var i = 0; i < items.length; i++) {
      cum += items[i].durasi;
      if (cum / Math.max(1, totalMin) >= 0.8) {
        n80 = i + 1;
        break;
      }
    }
    var rankRows = '';
    var tableRows = '';
    var running = 0;
    items.forEach(function(d, idx) {
      running += d.durasi;
      var pct = totalMin > 0 ? ((d.durasi / totalMin) * 100).toFixed(1) : '0.0';
      var cpct = totalMin > 0 ? ((running / totalMin) * 100).toFixed(1) : '0.0';
      rankRows += '<div class="bdx-rank-row anim-item" style="animation-delay:' + (0.05 * (idx + 1)).toFixed(2) + 's;">' +
        '<div class="bdx-rank-head"><span><i class="fas fa-circle" style="font-size:8px;color:' + d.warna + ';margin-right:8px;"></i>' + bkkDbEsc(d.nama) + '</span><span style="font-weight:800;">' + bkkDbFormatMin(d.durasi) + '</span></div>' +
        '<div class="bdx-rank-track"><div class="bdx-rank-fill bdx-bar-anim" style="--bar-color:' + d.warna + '; --bar-w:' + pct + '%"></div></div>' +
        '<span class="bdx-cum-badge" style="background:' + d.warnaLight + '; color:' + d.warna + ';">Kumulatif ' + cpct + '%</span>' +
      '</div>';
      tableRows += '<tr class="anim-item" style="animation-delay:' + (0.05 * (idx + 1)).toFixed(2) + 's;">' +
        '<td>' + (idx + 1) + '</td>' +
        '<td><span style="font-weight:700;color:#1e1345;">' + bkkDbEsc(d.nama) + '</span></td>' +
        '<td style="font-weight:800;font-family:\'Rajdhani\',sans-serif;">' + bkkDbFormatMin(d.durasi) + '</td>' +
        '<td><span class="bdx-pct-badge" style="background:' + d.warnaLight + '; color:' + d.warna + ';">' + pct + '%</span></td>' +
        '<td style="font-weight:700;color:#8b7ec8;">' + cpct + '%</td>' +
        '<td><div class="bdx-mini-track"><div class="bdx-mini-fill bdx-bar-anim" style="--bar-color:' + d.warna + '; --bar-w:' + Math.min(90, Number(pct)).toFixed(1) + '%"></div></div></td>' +
      '</tr>';
    });
    var legend = items.slice(0, 8).map(function(d) {
      var pct = totalMin > 0 ? ((d.durasi / totalMin) * 100).toFixed(1) : '0.0';
      return '<div><i class="fas fa-circle" style="font-size:8px;color:' + d.warna + ';margin-right:6px;"></i>' + bkkDbEsc(d.nama) + ' <b>' + pct + '%</b></div>';
    }).join('');
    return '<div class="bdx-shell">' +
      '<style>' +
      '@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}' +
      '.swal2-popup.premium-panel .swal2-title{margin:0}.swal2-popup.premium-panel .swal2-html-container{margin:0}.swal2-popup.premium-panel{background:#f7f5ff;color:#1e1345;border:1px solid #ede8fb;border-radius:20px}' +
      '.bdx-shell{color:#1e1345;text-align:left}.bdx-scroll{max-height:calc(100vh - 250px);overflow:auto;padding-right:6px}.bdx-modal-header{position:sticky;top:0;z-index:10;background:rgba(247,245,255,.94);backdrop-filter:blur(12px);border-bottom:1px solid #ede8fb;padding:10px 2px 12px;margin-bottom:14px}' +
      '.bdx-title{font-family:Orbitron,Rajdhani,sans-serif;color:#7c3aed;font-size:1.15rem;letter-spacing:.8px;font-weight:800;display:flex;align-items:center;gap:8px}.bdx-subtitle{margin-top:8px;display:inline-block;background:#ede8fb;color:#7c3aed;border:1px solid #ddd6fe;padding:6px 12px;border-radius:999px;font-size:.78rem;font-weight:700}' +
      '.grid-4col{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.grid-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.grid-2col-15{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px}' +
      '.card-3d{background:#fff;border:1px solid #ede8fb;border-radius:16px;padding:12px;transform:perspective(1000px) rotateX(1.5deg);box-shadow:0 1px 0 #ede8fb,0 4px 16px rgba(124,58,237,.10),0 12px 40px rgba(124,58,237,.06);transition:.25s}.card-3d:hover{transform:perspective(1000px) rotateX(0deg) translateY(-3px)}' +
      '.anim-item{animation:fadeUp .45s ease both}.kpi-card{border-top:3px solid var(--kpi-color)}.kpi-label{font-size:.68rem;color:#8b7ec8;text-transform:uppercase;letter-spacing:.7px;font-weight:700}.kpi-val{font-size:1.35rem;font-family:Rajdhani,sans-serif;font-weight:900;color:#1e1345}.kpi-sub{font-size:.72rem;color:#8b7ec8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bdx-card-title{margin:0 0 10px 0;font-size:.75rem;text-transform:uppercase;color:#8b7ec8;letter-spacing:.8px;font-weight:800;display:flex;align-items:center;gap:8px}.bdx-chart-wrap{position:relative;height:230px}.bdx-insight{margin-top:10px;font-size:12px;line-height:1.35;color:#5b4ea1;background:#f8f6ff;border:1px solid #ddd6fe;border-radius:10px;padding:9px 10px}' +
      '.bdx-rank-row{margin-bottom:10px;border-bottom:1px dashed #ede8fb;padding-bottom:8px}.bdx-rank-head{display:flex;justify-content:space-between;font-size:.76rem;margin-bottom:5px;color:#1e1345}.bdx-rank-track,.bdx-mini-track{height:8px;background:#ede8fb;border-radius:999px;overflow:hidden}.bdx-rank-fill,.bdx-mini-fill{height:100%;width:var(--bar-w);background:var(--bar-color);transform-origin:left center}.bdx-bar-anim{animation:barGrow .8s ease both}.bdx-cum-badge,.bdx-pct-badge{display:inline-block;margin-top:5px;padding:3px 8px;border-radius:999px;font-size:.68rem;font-weight:700}' +
      '.bdx-donut-legend{margin-top:8px;display:flex;flex-direction:column;gap:4px;font-size:.73rem;color:#1e1345}.bdx-donut-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none}.bdx-donut-center .num{font-family:Rajdhani,sans-serif;font-size:1.35rem;font-weight:900;color:#7c3aed}' +
      '.bdx-table-wrap{overflow:auto}.bdx-table{width:100%;border-collapse:collapse;font-size:.78rem}.bdx-table thead th{background:#f3efff;color:#8b7ec8;text-transform:uppercase;font-size:.68rem;letter-spacing:.7px;padding:10px 8px;text-align:left;border-bottom:1px solid #ede8fb}.bdx-table tbody tr:nth-child(odd){background:#fff}.bdx-table tbody tr:nth-child(even){background:#fdfcff}.bdx-table td{padding:9px 8px;border-bottom:1px solid #f3efff}.bdx-footer{margin-top:10px;font-size:.76rem;color:#8b7ec8;border-top:1px solid #ede8fb;padding-top:8px;font-weight:700}' +
      '@media(max-width:768px){.grid-2col,.grid-2col-15{grid-template-columns:1fr}.grid-4col{grid-template-columns:repeat(2,1fr)}.bdx-chart-wrap{height:190px}.kpi-val{font-size:18px}}' +
      '</style>' +
      '<div class="bdx-scroll">' +
        '<div class="bdx-modal-header anim-item"><div class="bdx-title"><i class="fas fa-stopwatch"></i>BREAKDOWN DETAIL (AGGREGATE)</div><div class="bdx-subtitle">' + bkkDbEsc(model.stageLabel) + '</div></div>' +
        '<div class="grid-4col">' +
          '<div class="card-3d kpi-card anim-item" style="--kpi-color:#7c3aed;"><div class="kpi-label">Total Durasi</div><div class="kpi-val">' + bkkDbFormatMin(totalMin) + '</div><div class="kpi-sub">' + model.totalTruck + ' truck valid</div></div>' +
          '<div class="card-3d kpi-card anim-item" style="--kpi-color:' + top.warna + ';"><div class="kpi-label">Penyebab #1</div><div class="kpi-val">' + bkkDbFormatMin(top.durasi) + '</div><div class="kpi-sub">' + bkkDbEsc(top.nama) + ' (' + topPct + '%)</div></div>' +
          '<div class="card-3d kpi-card anim-item" style="--kpi-color:#d97706;"><div class="kpi-label">80% Delay</div><div class="kpi-val">' + n80 + '</div><div class="kpi-sub">kategori teratas</div></div>' +
          '<div class="card-3d kpi-card anim-item" style="--kpi-color:#059669;"><div class="kpi-label">Kategori</div><div class="kpi-val">' + items.length + '</div><div class="kpi-sub">penyebab tercatat</div></div>' +
        '</div>' +
        '<div class="grid-2col">' +
          '<div class="card-3d anim-item"><h5 class="bdx-card-title"><i class="fas fa-chart-line" style="color:#dc2626"></i>Pareto 80/20</h5><div class="bdx-chart-wrap"><canvas id="bkkAggPareto"></canvas></div><div class="bdx-insight">' + bkkDbEsc(bkkDbAggregateInsight(items, totalMin)) + '</div></div>' +
          '<div class="card-3d anim-item"><h5 class="bdx-card-title"><i class="fas fa-ranking-star" style="color:#d97706"></i>Ranking + Kumulatif %</h5>' + rankRows + '</div>' +
        '</div>' +
        '<div class="grid-2col-15">' +
          '<div class="card-3d anim-item"><h5 class="bdx-card-title"><i class="fas fa-table" style="color:#059669"></i>Detail Table</h5><div class="bdx-table-wrap"><table class="bdx-table"><thead><tr><th>#</th><th>Nama Delay</th><th>Durasi</th><th>%</th><th>Kumulatif %</th><th>Proporsi</th></tr></thead><tbody>' + tableRows + '</tbody><tfoot><tr><td colspan="2" style="text-align:right;font-weight:800;">TOTAL</td><td style="font-weight:900;color:#7c3aed;">' + bkkDbFormatMin(totalMin) + '</td><td colspan="3"></td></tr></tfoot></table></div></div>' +
          '<div class="card-3d anim-item"><h5 class="bdx-card-title"><i class="fas fa-chart-pie" style="color:#7c3aed"></i>Donut Komposisi</h5><div class="bdx-chart-wrap"><canvas id="bkkAggDonut"></canvas><div class="bdx-donut-center"><span class="num">' + bkkDbFormatMin(totalMin) + '</span><span style="font-size:.72rem;color:#8b7ec8;">total</span></div></div><div class="bdx-donut-legend">' + legend + '</div></div>' +
        '</div>' +
        '<div class="bdx-footer">Tahapan: ' + bkkDbEsc(model.stageLabel) + '</div>' +
      '</div>' +
    '</div>';
  }

  function bkkDbRenderAggregateCharts(model) {
    if (!model || !model.items || !model.items.length || typeof Chart === 'undefined') return;
    ['_bkkAggPareto', '_bkkAggDonut'].forEach(function(k) {
      if (window[k] && typeof window[k].destroy === 'function') {
        try { window[k].destroy(); } catch (e) {}
      }
    });
    var labels = model.items.map(function(x) { return x.nama; });
    var values = model.items.map(function(x) { return x.durasi; });
    var total = model.totalMin || 0;
    var run = 0;
    var cumPct = values.map(function(v) {
      run += v;
      return total > 0 ? Number(((run / total) * 100).toFixed(2)) : 0;
    });
    var pareto = document.getElementById('bkkAggPareto');
    if (pareto) {
      window._bkkAggPareto = new Chart(pareto.getContext('2d'), {
        data: {
          labels: labels,
          datasets: [
            { type: 'bar', label: 'Menit', data: values, yAxisID: 'y', backgroundColor: model.items.map(function(d) { return d.warna; }), borderRadius: 6 },
            { type: 'line', label: 'Kumulatif %', data: cumPct, yAxisID: 'y1', borderColor: '#dc2626', pointBackgroundColor: '#dc2626', borderDash: [4, 4], tension: 0.3 },
            { type: 'line', label: 'Target 80%', data: labels.map(function() { return 80; }), yAxisID: 'y1', borderColor: 'rgba(220,38,38,.55)', borderDash: [6, 6], pointRadius: 0, tension: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Menit' } },
            y1: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: function(v) { return v + '%'; } } },
            x: { ticks: { maxRotation: 35, minRotation: 0 } }
          }
        }
      });
    }
    var donut = document.getElementById('bkkAggDonut');
    if (donut) {
      window._bkkAggDonut = new Chart(donut.getContext('2d'), {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: values, backgroundColor: model.items.map(function(d) { return d.warna; }), borderColor: '#fff', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }
      });
    }
  }

  window.bkkDbShowAggregateByKey = function(stageKey, stageLabel) {
    try {
      var agg = _bkkDbAggBreakdownByKey[stageKey];
      if (!agg || !agg.totalTruck) {
        Swal.fire({ icon: 'info', title: 'Data kosong', text: 'Belum ada data untuk kategori ini pada filter aktif.' });
        return;
      }
      var totalMin = Number(agg.totalMin || 0);
      var causes = Object.keys(agg.causes || {}).map(function(k) {
        return { ket: k, menit: Number(agg.causes[k] || 0) };
      }).sort(function(a, b) { return b.menit - a.menit; });

      var model = {
        stageKey: stageKey,
        stageLabel: stageLabel || '-',
        totalMin: totalMin,
        totalTruck: agg.totalTruck || 0,
        items: bkkDbAggToItems(causes)
      };
      var html = bkkDbBuildAggregateHtml(model);

      Swal.fire({
        title: '',
        html: html,
        width: window.innerWidth <= 767 ? '95%' : 1180,
        heightAuto: false,
        focusConfirm: false,
        showCloseButton: true,
        confirmButtonText: '<i class="fas fa-times"></i> TUTUP',
        confirmButtonColor: '#64748b',
        customClass: { popup: 'premium-panel breakdown-redesign-popup' },
        didOpen: function() {
          bkkDbRenderAggregateCharts(model);
        }
      });
    } catch (e) {
      console.error('bkkDbShowAggregateByKey error', e);
      Swal.fire({ icon: 'error', title: 'Gagal membuka detail', text: String(e && e.message ? e.message : e) });
    }
  };

  /**
   * Popup breakdown + grafik doughnut — selaras rm-dt-v2 showBreakdownDetail.
   * Data BKK: array { cat, min, other } per segmen.
   */
  window.bkkDbShowBreakdownDetail = function(el) {
    if (!el || typeof Swal === 'undefined') return;

    var nopol = el.getAttribute('data-nopol') || '';
    var typeKey = el.getAttribute('data-typekey') || '';
    var typeLabel = el.getAttribute('data-typelabel') || '';
    var jsonEncoded = el.getAttribute('data-json') || '';
    var idleEncoded = el.getAttribute('data-idle') || '';
    var totalMin = parseInt(el.getAttribute('data-total'), 10) || 0;

    var rawArr = [];
    try {
      var js = decodeURIComponent(jsonEncoded);
      rawArr = JSON.parse(js);
    } catch (e) {
      rawArr = [];
    }
    if (!Array.isArray(rawArr)) rawArr = [];

    var idleObj = null;
    if (idleEncoded) {
      try {
        idleObj = JSON.parse(decodeURIComponent(idleEncoded));
      } catch (e2) {
        idleObj = null;
      }
    }

    var stepDetails = rawArr.map(function(item) {
      var ket = bkkDbBreakdownKeterangan(item);
      var mn = parseInt(item.min != null ? item.min : item.MIN, 10);
      if (isNaN(mn)) mn = 0;
      return { keterangan: ket, waktu: mn };
    });

    var isIdleKey = typeKey === 'sbm_gap_truck' || typeKey === 'gap_truck_ns';
    /** True jika satu-satunya baris tabel = fallback (tanpa array breakdown di DURASI_JSON). */
    var usedSyntheticIdleOnly = false;
    /** Hanya fallback bila tidak ada array breakdown tersimpan (bukan pengganti isian wizard). */
    if (!stepDetails.length && idleObj && isIdleKey) {
      usedSyntheticIdleOnly = true;
      stepDetails = [{
        keterangan: 'Total jeda antar PB',
        waktu: totalMin
      }];
    }

    var explainIdleHtml = '';
    if (idleObj && isIdleKey && idleObj.prevFinishStr) {
      explainIdleHtml =
        '<div style="margin-bottom:14px;padding:14px;text-align:left;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border:1px solid #bbf7d0;border-radius:12px;color:#14532d;font-size:0.88rem;line-height:1.55;">' +
        '<div style="font-weight:800;margin-bottom:10px;"><i class="fas fa-link" style="margin-right:6px;"></i>Rincian IDLE LOSS</div>' +
        'Urutan truk ke-<b>' + idleObj.pos + '</b> dari <b>' + idleObj.totalInChain + '</b> pada rantai Intake 71 (sama BK, tanggal operasi, dan shift).<br><br>' +
        '<span style="color:#64748b;">PB Finish truk sebelumnya</span> <b>' + bkkDbEsc(idleObj.prevNopol) + '</b>: <b>' + bkkDbEsc(idleObj.prevFinishStr) + '</b><br>' +
        '<span style="color:#64748b;">PB Start truk ini</span> <b>' + bkkDbEsc(idleObj.currNopol) + '</b>: <b>' + bkkDbEsc(idleObj.currStartStr) + '</b>' +
        '</div>';
    }

    var html = '<div style="text-align:left;font-size:0.95rem;margin-top:10px;">';
    html += explainIdleHtml;
    html += '<div id="bkkBreakdownChartWrap" style="width:100%;max-width:320px;height:260px;margin:16px auto;position:relative;display:' +
      (stepDetails.length ? 'block' : 'none') + ';">';
    html += '<canvas id="bkkBreakdownDoughnut"></canvas></div>';

    if (!stepDetails.length) {
      html += '<div style="padding:25px;text-align:center;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;">' +
        '<i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:10px;opacity:0.3;"></i><br>' +
        '<i>Tidak ada rincian kategori — durasi dari selisih jam di sheet.</i><br>' +
        '<span style="font-size:0.8rem;margin-top:5px;display:inline-block;">Durasi tercatat: <b>' + totalMin + ' menit</b></span>' +
        '</div>';
    } else {
      html += '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">' +
        '<thead style="background:linear-gradient(135deg,#f1f5f9,#e2e8f0);text-transform:uppercase;font-size:0.8rem;letter-spacing:1px;color:#475569;">' +
        '<tr><th style="padding:12px 15px;border-bottom:2px solid #cbd5e1;text-align:left;">Keterangan / Alasan Delay</th>' +
        '<th style="padding:12px 15px;border-bottom:2px solid #cbd5e1;text-align:right;">Durasi (Menit)</th></tr></thead><tbody>';
      var sumMin = 0;
      stepDetails.forEach(function(item, idx) {
        var bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        var ket = item.keterangan || '-';
        var mn = item.waktu || 0;
        sumMin += mn;
        html += '<tr style="background:' + bg + ';">' +
          '<td style="padding:12px 15px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-weight:500;">' +
          '<i class="fas fa-caret-right" style="color:#7c3aed;margin-right:8px;opacity:0.5;"></i>' + bkkDbEsc(ket) + '</td>' +
          '<td style="padding:12px 15px;border-bottom:1px solid #f1f5f9;text-align:right;font-family:\'Rajdhani\',sans-serif;font-weight:700;font-size:1.05rem;color:#0f172a;">' +
          mn + '</td></tr>';
      });
      html += '</tbody><tfoot style="background:#0f172a;color:#fff;">' +
        '<tr><td style="padding:12px 15px;font-weight:800;text-align:right;font-size:0.85rem;letter-spacing:1px;">TOTAL RINCIAN:</td>' +
        '<td style="padding:12px 15px;font-weight:800;text-align:right;font-family:\'Rajdhani\',sans-serif;font-size:1.2rem;color:#38bdf8;">' +
        sumMin + ' mnt</td></tr></tfoot></table>';

      if (usedSyntheticIdleOnly) {
        html += '<div style="margin-top:12px;padding:10px 12px;background:#f1f5f9;border-radius:8px;font-size:0.78rem;color:#475569;line-height:1.5;">' +
          '<i class="fas fa-lightbulb" style="margin-right:6px;color:#64748b;"></i>' +
          'Angka di atas hanya <b>total menit</b> dari selisih jam PB. Baris <b>istirahat / tunggu truck / lainnya</b> hanya muncul jika rincian breakdown wizard Step 2 ' +
          'ikut tersimpan di data bongkar. Data lama atau simpan lewat URL pendek bisa tanpa rincian — pakai versi aplikasi terbaru dan simpan ulang truk dari wizard bila perlu.</div>';
      }

      if (sumMin !== totalMin) {
        html += '<div style="margin-top:15px;padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:0.8rem;font-weight:600;display:flex;align-items:center;gap:8px;">' +
          '<i class="fas fa-exclamation-triangle"></i> Total rincian (' + sumMin + 'm) ≠ durasi tercatat (' + totalMin + 'm).</div>';
      }
    }
    html += '</div>';

    Swal.fire({
      title: '<div style="font-family:\'Orbitron\',sans-serif;color:#8b5cf6;font-size:1.4rem;font-weight:800;letter-spacing:1px;">' +
        '<i class="fas fa-stopwatch" style="margin-right:8px;"></i>BREAKDOWN DETAIL</div>' +
        '<div style="font-size:0.9rem;color:#64748b;font-family:\'Inter\',sans-serif;margin-top:8px;font-weight:600;background:#f1f5f9;padding:4px 10px;border-radius:20px;display:inline-block;">' +
        '<i class="fas fa-truck" style="margin-right:5px;"></i> ' + bkkDbEsc(nopol) + ' &nbsp;|&nbsp; ' + bkkDbEsc(typeLabel) + '</div>',
      html: html,
      confirmButtonText: '<i class="fas fa-times"></i> TUTUP',
      confirmButtonColor: '#64748b',
      width: 500,
      heightAuto: false,
      focusConfirm: false,
      customClass: { popup: 'premium-panel' },
      didOpen: function() {
        if (!stepDetails.length || typeof Chart === 'undefined') return;

        if (window._bkkBreakdownChartInst && typeof window._bkkBreakdownChartInst.destroy === 'function') {
          try {
            window._bkkBreakdownChartInst.destroy();
          } catch (e) {}
        }

        var labels = stepDetails.map(function(d) {
          return d.keterangan || '-';
        });
        var values = stepDetails.map(function(d) {
          return d.waktu || 0;
        });
        var chartTotal = values.reduce(function(a, b) {
          return a + b;
        }, 0);

        var canvas = document.getElementById('bkkBreakdownDoughnut');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var colors = ['#7C3AED', '#A855F7', '#C084FC', '#E879F9', '#6366F1', '#818CF8', '#38BDF8', '#34D399'];

        var centerTextPlugin = {
          id: 'bkkCenterText',
          afterDraw: function(chart) {
            var c = chart.ctx;
            var chartArea = chart.chartArea;
            if (!chartArea) return;
            var top = chartArea.top;
            var bottom = chartArea.bottom;
            var left = chartArea.left;
            var right = chartArea.right;
            c.save();
            c.font = 'bold 22px Inter, sans-serif';
            c.fillStyle = '#7C3AED';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            var cx = (left + right) / 2;
            var cy = (top + bottom) / 2 - 10;
            c.fillText(String(chartTotal), cx, cy);
            c.font = 'normal 12px Inter, sans-serif';
            c.fillStyle = '#64748b';
            c.fillText('menit', cx, cy + 20);
            c.restore();
          }
        };

        window._bkkBreakdownChartInst = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: values,
              backgroundColor: stepDetails.map(function(_, i) {
                return colors[i % colors.length];
              }),
              borderWidth: 3,
              borderColor: '#ffffff',
              hoverBorderColor: '#ffffff',
              hoverOffset: 12
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              animateRotate: true,
              animateScale: true,
              duration: 700,
              easing: 'easeInOutQuart'
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  usePointStyle: true,
                  boxWidth: 12,
                  padding: 10,
                  font: { size: 11 },
                  color: '#475569',
                  generateLabels: function(chart) {
                    var data = chart.data;
                    if (!data.labels.length || !data.datasets.length) return [];
                    return data.labels.map(function(label, i) {
                      var value = data.datasets[0].data[i];
                      return {
                        text: label + ' · ' + value + ' mnt',
                        fillStyle: data.datasets[0].backgroundColor[i],
                        strokeStyle: data.datasets[0].borderColor,
                        lineWidth: data.datasets[0].borderWidth,
                        hidden: isNaN(data.datasets[0].data[i]),
                        index: i
                      };
                    });
                  }
                }
              },
              tooltip: {
                callbacks: {
                  label: function(ctx) {
                    var pct = chartTotal > 0 ? ((ctx.parsed / chartTotal) * 100).toFixed(1) : '0';
                    return ' ' + ctx.label + ': ' + ctx.parsed + ' mnt (' + pct + '%)';
                  }
                }
              }
            },
            cutout: '70%'
          },
          plugins: [centerTextPlugin]
        });
      }
    });
  };

  window.bkkDbShowIntakePopup = function(dateKey) {
    if (typeof Swal === 'undefined') return;
    var rows = _bkkDbIntakeByDate[dateKey] || [];
    if (!rows.length) return;
    var totalNet = rows.reduce(function(a, b) { return a + (b.nettoKg || 0); }, 0);
    var totalMin = rows.reduce(function(a, b) { return a + (b.durMin || 0); }, 0);
    var body = '<div style="text-align:left;font-size:0.9rem;">' +
      '<div style="margin-bottom:10px;color:#64748b;">Tanggal <b>' + bkkDbEsc(dateKey) + '</b> · ' + rows.length + ' truck · Netto total <b>' + totalNet.toLocaleString('id-ID') + ' kg</b></div>' +
      '<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">' +
      '<thead><tr style="background:#f8fafc;"><th style="padding:8px;text-align:left;">No Polisi</th><th style="padding:8px;">Start</th><th style="padding:8px;">Finish</th><th style="padding:8px;text-align:right;">Durasi</th><th style="padding:8px;text-align:right;">Netto</th></tr></thead><tbody>';
    rows.forEach(function(r, i) {
      var bg = i % 2 ? '#f8fafc' : '#fff';
      body += '<tr style="background:' + bg + ';">' +
        '<td style="padding:8px;font-weight:700;">' + bkkDbEsc(r.nopol) + '</td>' +
        '<td style="padding:8px;text-align:center;">' + bkkDbEsc(r.start) + '</td>' +
        '<td style="padding:8px;text-align:center;">' + bkkDbEsc(r.finish) + '</td>' +
        '<td style="padding:8px;text-align:right;font-family:\'Rajdhani\',sans-serif;font-weight:700;">' + (r.durMin || 0) + ' mnt</td>' +
        '<td style="padding:8px;text-align:right;font-family:\'Rajdhani\',sans-serif;font-weight:700;">' + (r.nettoKg || 0).toLocaleString('id-ID') + ' kg</td>' +
        '</tr>';
    });
    body += '</tbody><tfoot><tr style="background:#0f172a;color:#fff;"><td colspan="3" style="padding:8px;text-align:right;font-weight:800;">TOTAL</td><td style="padding:8px;text-align:right;">' + totalMin + ' mnt</td><td style="padding:8px;text-align:right;">' + totalNet.toLocaleString('id-ID') + ' kg</td></tr></tfoot></table></div>';
    Swal.fire({
      title: '<div style="font-family:\'Orbitron\',sans-serif;color:#8b5cf6;font-size:1.1rem;letter-spacing:.8px;">DETAIL DURASI INTAKE 71</div>',
      html: body,
      width: 820,
      confirmButtonText: 'Tutup',
      confirmButtonColor: '#64748b'
    });
  };

  function bkkDbInitOnce() {
    if (_bkkDbInit) return;
    _bkkDbInit = true;
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.pivot-multi-select')) {
        document.querySelectorAll('.pivot-multi-select .ms-dropdown.show').forEach(function(d) {
          d.classList.remove('show');
          var tr = d.parentElement && d.parentElement.querySelector('.ms-trigger');
          if (tr) tr.classList.remove('active');
        });
      }
    });
  }

  // window.loadBkkDurationBreakdownPage = function() {
  //   bkkDbInitOnce();
  //   var now = new Date();
  //   var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  //   var fmt = function(d) {
  //     return d.getFullYear() + '-' + bkkDbPad2(d.getMonth() + 1) + '-' + bkkDbPad2(d.getDate());
  //   };
  //   var ds = document.getElementById('bkkdb_start_date');
  //   var de = document.getElementById('bkkdb_end_date');
  //   if (ds && !ds.value) ds.value = fmt(startOfMonth);
  //   if (de && !de.value) de.value = fmt(now);

  //   if (typeof fetchAPI !== 'function') return;
  //   if (typeof showLoader === 'function') showLoader(true);
  //   fetchAPI('getBongkarHistory', {}, function(resp) {
  //     if (typeof showLoader === 'function') showLoader(false);
  //     var raw = resp.status !== 'error' ? resp.data : [];
  //     window._bkkDbHistoryRows = typeof bwNormalizeBongkarHistory === 'function' ? bwNormalizeBongkarHistory(raw) : (Array.isArray(raw) ? raw : []);

  //     var mats = new Set();
  //     var bks = new Set();
  //     window._bkkDbHistoryRows.forEach(function(r) {
  //       if (r.MATERIAL) mats.add(String(r.MATERIAL).trim());
  //       if (r.BK_ID) bks.add(String(r.BK_ID).trim());
  //     });
  //     bkkDbPopulateOneMs('bkkdb-ms-material', mats, 'SEMUA MATERIAL');
  //     bkkDbPopulateOneMs('bkkdb-ms-bk', bks, 'SEMUA BK');
  //     bkkDbPopulateTypeBongkaranMs();

  //     bkkDbDiscoverKeys(window._bkkDbHistoryRows);
  //     bkkDbBuildChips();
  //     _bkkDbSelSbm = [];
  //     _bkkDbSelNs = [];
  //     document.querySelectorAll('#bkkdb-chips-sbm .db-chip, #bkkdb-chips-nonsbm .db-chip').forEach(function(c) {
  //       c.classList.remove('active');
  //     });
  //     window.bkkDbRender();
  //   });
  // };

  window.loadBkkDurationBreakdownPage = function() {

  console.log(
    '%c[DUR 01] loadBkkDurationBreakdownPage START',
    'color:red;font-weight:bold'
  );

  console.time('[DUR] TOTAL');

  console.log('[DUR 02] bkkDbInitOnce');

  bkkDbInitOnce();

  console.log('[DUR 03] bkkDbInitOnce FINISH');

  var now = new Date();

  var startOfMonth =
    new Date(now.getFullYear(), now.getMonth(), 1);

  var fmt = function(d) {
    return (
      d.getFullYear() +
      '-' +
      bkkDbPad2(d.getMonth() + 1) +
      '-' +
      bkkDbPad2(d.getDate())
    );
  };

  var ds = document.getElementById('bkkdb_start_date');
  var de = document.getElementById('bkkdb_end_date');

  if (ds && !ds.value) {
    ds.value = fmt(startOfMonth);
  }

  if (de && !de.value) {
    de.value = fmt(now);
  }

  console.log(
    '[DUR 04] tanggal',
    ds ? ds.value : null,
    de ? de.value : null
  );

  if (typeof fetchAPI !== 'function') {
    console.error('[DUR ERROR] fetchAPI tidak ditemukan');
    return;
  }

  console.log('[DUR 05] showLoader ON');

  if (typeof showLoader === 'function') {
    showLoader(true);
  }

  console.log('[DUR 06] fetch getBongkarHistory');

  fetchAPI('getBongkarHistory', {}, function(resp) {

    console.log(
      '%c[DUR 07] CALLBACK getBongkarHistory',
      'color:green;font-weight:bold',
      resp
    );

    if (typeof showLoader === 'function') {
      showLoader(false);
    }

    console.log('[DUR 08] showLoader OFF');

    var raw =
      resp.status !== 'error'
        ? resp.data
        : [];

    console.log(
      '[DUR 09] raw data',
      Array.isArray(raw) ? raw.length : typeof raw
    );

    console.time('[DUR] NORMALIZE');

    window._bkkDbHistoryRows =
      typeof bwNormalizeBongkarHistory === 'function'
        ? bwNormalizeBongkarHistory(raw)
        : (Array.isArray(raw) ? raw : []);

    console.timeEnd('[DUR] NORMALIZE');

    console.log(
      '%c[DUR 10] NORMALIZE SELESAI',
      'color:green;font-weight:bold',
      window._bkkDbHistoryRows.length
    );

    var mats = new Set();
    var bks = new Set();

    console.time('[DUR] BUILD SET');

    window._bkkDbHistoryRows.forEach(function(r) {

      if (r.MATERIAL) {
        mats.add(String(r.MATERIAL).trim());
      }

      if (r.BK_ID) {
        bks.add(String(r.BK_ID).trim());
      }

    });

    console.timeEnd('[DUR] BUILD SET');

    console.log(
      '[DUR 11] material =',
      mats.size,
      'BK =',
      bks.size
    );

    console.log('[DUR 12] populate material');

    bkkDbPopulateOneMs(
      'bkkdb-ms-material',
      mats,
      'SEMUA MATERIAL'
    );

    console.log('[DUR 13] populate material FINISH');

    console.log('[DUR 14] populate BK');

    bkkDbPopulateOneMs(
      'bkkdb-ms-bk',
      bks,
      'SEMUA BK'
    );

    console.log('[DUR 15] populate BK FINISH');

    console.log('[DUR 16] populate type bongkaran');

    bkkDbPopulateTypeBongkaranMs();

    console.log('[DUR 17] populate type bongkaran FINISH');

    console.log('[DUR 18] discover keys');

    console.time('[DUR] DISCOVER KEYS');

    bkkDbDiscoverKeys(
      window._bkkDbHistoryRows
    );

    console.timeEnd('[DUR] DISCOVER KEYS');

    console.log('[DUR 19] discover keys FINISH');

    console.log('[DUR 20] build chips');

    console.time('[DUR] BUILD CHIPS');

    bkkDbBuildChips();

    console.timeEnd('[DUR] BUILD CHIPS');

    console.log('[DUR 21] build chips FINISH');

    _bkkDbSelSbm = [];
    _bkkDbSelNs = [];

    console.log('[DUR 22] reset chips');

    document
      .querySelectorAll(
        '#bkkdb-chips-sbm .db-chip, #bkkdb-chips-nonsbm .db-chip'
      )
      .forEach(function(c) {
        c.classList.remove('active');
      });

    console.log('[DUR 23] reset chips FINISH');

    console.log(
      '%c[DUR 24] AKAN bkkDbRender()',
      'color:orange;font-weight:bold'
    );

    console.time('[DUR] RENDER');

    window.bkkDbRender();

    console.timeEnd('[DUR] RENDER');

    console.log(
      '%c[DUR 25] bkkDbRender() FINISH',
      'color:green;font-weight:bold'
    );

    console.timeEnd('[DUR] TOTAL');

  });
};
})();
