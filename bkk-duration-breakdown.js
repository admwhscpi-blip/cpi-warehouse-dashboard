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
  var _bkkDbLastFiltered = [];
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

  /** Ambil JSON durasi dari berbagai nama kolom / encoding yang mungkin dari sheet/API. */
  function bkkDbParseDj(r) {
    if (!r) return null;
    var raw = r.DURASI_JSON;
    if ((raw == null || raw === '') && r.durasi_json != null) raw = r.durasi_json;
    if ((raw == null || raw === '') && r['DURASI JSON'] != null) raw = r['DURASI JSON'];
    if (raw == null || raw === '') return null;
    try {
      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof obj === 'string') {
        try {
          obj = JSON.parse(obj);
        } catch (e2) {
          return null;
        }
      }
      return obj && typeof obj === 'object' ? obj : null;
    } catch (e) {
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
      return v.getFullYear() + '-' + bkkDbP2(v.getMonth() + 1) + '-' + bkkDbP2(v.getDate());
    }
    var s = String(v).trim();
    if (s.indexOf('T') !== -1) {
      try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
          return d.getFullYear() + '-' + bkkDbP2(d.getMonth() + 1) + '-' + bkkDbP2(d.getDate());
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
  function bkkDbIntakeChainContext(row, poolRows) {
    if (!row || !poolRows || !poolRows.length) return null;
    if (!bkkDbRowInIntakeChain(row)) return null;

    var bk = String(bkkDbCol(row, 'BK_ID')).trim();
    var rowDay = bkkDbYmdFromCell(bkkDbCol(row, 'TANGGAL'));
    if (!bk || !rowDay) return null;

    var chain = [];
    for (var i = 0; i < poolRows.length; i++) {
      var r = poolRows[i];
      if (String(bkkDbCol(r, 'BK_ID')).trim() !== bk) continue;
      var d2 = bkkDbYmdFromCell(bkkDbCol(r, 'TANGGAL'));
      if (d2 !== rowDay) continue;
      if (!bkkDbShiftCompatible(row, r)) continue;
      if (!bkkDbRowInIntakeChain(r)) continue;

      var pbYmd = bkkDbYmdFromCell(bkkDbCol(r, 'PB_TANGGAL'));
      if (!pbYmd) pbYmd = bkkDbYmdFromCell(bkkDbCol(r, 'TANGGAL'));
      var ps = bkkDbNormalizeHM(bkkDbCol(r, 'PB_START'));
      var pf = bkkDbNormalizeHM(bkkDbCol(r, 'PB_FINISH'));
      if (!pbYmd || !ps || !pf) continue;
      var msS = bkkDbConcatMs(pbYmd, ps);
      var msF = bkkDbConcatMs(pbYmd, pf);
      if (isNaN(msS) || isNaN(msF)) continue;
      chain.push({
        id: bkkDbCol(r, 'ID'),
        nopol: String(bkkDbCol(r, 'NO_POLISI') || '').trim().toUpperCase(),
        msS: msS,
        msF: msF
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
        if (String(chain[j].id) === String(rid)) {
          myIdx = j;
          break;
        }
      }
    }
    if (myIdx < 0) {
      var np = String(bkkDbCol(row, 'NO_POLISI') || '').trim().toUpperCase();
      var rowPbY = bkkDbYmdFromCell(bkkDbCol(row, 'PB_TANGGAL')) || rowDay;
      var rowPs = bkkDbNormalizeHM(bkkDbCol(row, 'PB_START'));
      var rowMsS = bkkDbConcatMs(rowPbY, rowPs);
      for (var k = 0; k < chain.length; k++) {
        if (np && chain[k].nopol === np && !isNaN(rowMsS) && Math.abs(chain[k].msS - rowMsS) < 120000) {
          myIdx = k;
          break;
        }
      }
    }
    if (myIdx <= 0) return null;

    return { chain: chain, myIdx: myIdx };
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

  /** Rantai Intake 71 — sama logika wizard (exclude Direct Gudang). */
  function bkkDbRowInIntakeChain(r) {
    if (!r) return false;
    if (String(bkkDbCol(r, 'TYPE_BONGKARAN')).trim() === 'direct_gudang') return false;
    var t = String(bkkDbCol(r, 'TYPE_BONGKARAN')).trim();
    if (!t) return true;
    return t === 'intake71_manual' || t === 'intake71_tilting';
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
      gap_truck_ns: 'IDLE LOSS'
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
    var allTxt = { 'bkkdb-ms-material': 'SEMUA MATERIAL', 'bkkdb-ms-bk': 'SEMUA BK', 'bkkdb-ms-shift': 'SEMUA SHIFT' };
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

  function bkkDbGetMsSel(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var checked = el.querySelectorAll('input:checked');
    var total = el.querySelectorAll('input[type="checkbox"]');
    if (checked.length === 0 || checked.length === total.length) return null;
    return Array.from(checked).map(function(c) { return c.value; });
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
    var selSh = bkkDbGetMsSel('bkkdb-ms-shift');

    var out = rows.filter(function(r) {
      var t = String(r.TANGGAL || '').substring(0, 10);
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      if (selMat && selMat.indexOf(String(r.MATERIAL || '').trim()) < 0) return false;
      if (selBk && selBk.indexOf(String(r.BK_ID || '').trim()) < 0) return false;
      if (selSh && selSh.indexOf(String(r.SHIFT || '').trim()) < 0) return false;
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

    ['bkkdb-ms-material', 'bkkdb-ms-bk', 'bkkdb-ms-shift'].forEach(bkkDbUpdateMsLabel);

    var filtered = bkkDbFilterRows(rows);
    _bkkDbLastFiltered = filtered;

    var hasNs = _bkkDbSelNs.length > 0;
    var hasSbm = _bkkDbSelSbm.length > 0;
    var keyList = hasNs ? _bkkDbKeysNs : _bkkDbKeysSbm;
    var selectedKeys = hasNs ? _bkkDbSelNs : _bkkDbSelSbm;
    var selected = selectedKeys.map(function(k) {
      return bkkDbMetaForKey(k, keyList);
    }).filter(function(t) { return keyList.indexOf(t.key) >= 0; });

    var sumMap = {};
    var countMap = {};
    var distMap = {};
    selected.forEach(function(t) {
      sumMap[t.key] = 0;
      countMap[t.key] = 0;
      distMap[t.key] = [0, 0, 0, 0, 0];
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
        }
      });
      entry.total = hasAny ? rowTotal : null;
      entry.totalValid = hasAny;
      tableData.push(entry);
    });

    bkkDbRenderTopSummary(selected, tableData, sumMap, countMap);
    bkkDbRenderBottomSummary(filtered);
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
      return '<div class="db-mini-card" id="' + sid + '-card" style="border-top-color:' + t.color + ';">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">' +
        '<div><div style="font-size:0.85rem;font-weight:700;color:#475569;text-transform:uppercase;">' + bkkDbEsc(t.label) + '</div>' +
        '<div style="font-size:0.7rem;color:#94a3b8;margin-top:2px;">' + bkkDbEsc(t.sub) + '</div></div>' +
        '<span id="' + sid + '-sts"></span></div>' +
        '<div id="' + sid + '-avg" style="font-family:\'Rajdhani\',sans-serif;font-size:2rem;font-weight:800;color:' + t.color + ';margin-bottom:15px;">-</div>' +
        '<div style="height:120px;margin-bottom:15px;position:relative;"><canvas id="' + sid + '-chart"></canvas></div>' +
        '<div style="border-top:1px dashed #e2e8f0;padding-top:12px;font-size:0.75rem;color:#64748b;">Data valid: <span id="' + sid + '-cnt" style="color:' + t.color + ';font-weight:700;">0</span> truck</div></div>';
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
      html += '<td style="font-weight:700;">' + bkkDbEsc(entry.nopol) + '</td>';
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

  window.loadBkkDurationBreakdownPage = function() {
    bkkDbInitOnce();
    var now = new Date();
    var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    var fmt = function(d) {
      return d.getFullYear() + '-' + bkkDbPad2(d.getMonth() + 1) + '-' + bkkDbPad2(d.getDate());
    };
    var ds = document.getElementById('bkkdb_start_date');
    var de = document.getElementById('bkkdb_end_date');
    if (ds && !ds.value) ds.value = fmt(startOfMonth);
    if (de && !de.value) de.value = fmt(now);

    if (typeof fetchAPI !== 'function') return;
    if (typeof showLoader === 'function') showLoader(true);
    fetchAPI('getBongkarHistory', { limit: 8000 }, function(resp) {
      if (typeof showLoader === 'function') showLoader(false);
      var raw = resp.status !== 'error' ? resp.data : [];
      window._bkkDbHistoryRows = typeof bwNormalizeBongkarHistory === 'function' ? bwNormalizeBongkarHistory(raw) : (Array.isArray(raw) ? raw : []);

      var mats = new Set();
      var bks = new Set();
      var shifts = new Set();
      window._bkkDbHistoryRows.forEach(function(r) {
        if (r.MATERIAL) mats.add(String(r.MATERIAL).trim());
        if (r.BK_ID) bks.add(String(r.BK_ID).trim());
        if (r.SHIFT != null && r.SHIFT !== '') shifts.add(String(r.SHIFT));
      });
      bkkDbPopulateOneMs('bkkdb-ms-material', mats, 'SEMUA MATERIAL');
      bkkDbPopulateOneMs('bkkdb-ms-bk', bks, 'SEMUA BK');
      bkkDbPopulateOneMs('bkkdb-ms-shift', shifts, 'SEMUA SHIFT');

      bkkDbDiscoverKeys(window._bkkDbHistoryRows);
      bkkDbBuildChips();
      window.bkkDbRender();
    });
  };
})();
