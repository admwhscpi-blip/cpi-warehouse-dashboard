(function() {
  var i71State = {
    loaded: false,
    allRows: [],
    rows: [],
    selectedDate: '',
    calendarMonth: '',
    charts: {
      util: null,
      type: null,
      timeline: null,
      steps: null
    }
  };

  function i71RowsFromApiPayload(payload) {
    // Support 2 bentuk data:
    // 1) array object [{COL:val,...}] (format API saat ini)
    // 2) Google Sheets-like matrix { values: [headerRow, ...dataRows] }
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    var values = Array.isArray(payload.values) ? payload.values : null;
    if (!values || values.length < 2 || !Array.isArray(values[0])) return [];
    var headers = values[0].map(function(h) { return String(h == null ? '' : h).trim(); });
    var out = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!Array.isArray(row)) continue;
      var obj = {};
      var hasValue = false;
      for (var c = 0; c < headers.length; c++) {
        var key = headers[c];
        if (!key) continue;
        var v = row[c];
        if (v != null && String(v).trim() !== '') hasValue = true;
        obj[key] = v;
      }
      if (hasValue) out.push(obj);
    }
    return out;
  }

  function i71Pad2(n) { return String(n).padStart(2, '0'); }

  function i71TodayWib() {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } catch (e) {
      return todayStr();
    }
  }

  function i71MonthKey(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
    return ymd.slice(0, 7);
  }

  function i71Type(raw) {
    var t = String(raw == null ? '' : raw).trim().toLowerCase();
    var norm = t.replace(/[^a-z0-9]+/g, '_');
    if (norm === 'intake_71_manual' || norm === 'intake71_manual') return 'manual';
    if (norm === 'intake_71_tilting' || norm === 'intake71_tilting' || norm === 'tilting') return 'tilting';
    return '';
  }

  function i71TimeToMinutes(timeStr) {
    if (!timeStr || timeStr === '-') return null;
    var m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var h = Number(m[1]);
    var mi = Number(m[2]);
    if (isNaN(h) || isNaN(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return h * 60 + mi;
  }

  function i71MinToTime(m) {
    var mm = Math.max(0, Math.min(1439, Number(m) || 0));
    return i71Pad2(Math.floor(mm / 60)) + ':' + i71Pad2(mm % 60);
  }

  function i71FormatMinutes(mins) {
    var m = Math.max(0, Math.round(Number(mins) || 0));
    return Math.floor(m / 60) + 'j ' + i71Pad2(m % 60) + 'm';
  }

  function i71FormatHourRange(startMin, endMin) {
    if (startMin == null || endMin == null) return '-';
    return i71MinToTime(startMin) + ' - ' + i71MinToTime(endMin);
  }

  function i71MonthTitle(ym) {
    if (!/^\d{4}-\d{2}$/.test(ym)) return '';
    var p = ym.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
  }

  function i71YmdDiffDays(fromYmd, toYmd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd || '')) return NaN;
    var f = new Date(fromYmd + 'T00:00:00+07:00').getTime();
    var t = new Date(toYmd + 'T00:00:00+07:00').getTime();
    if (isNaN(f) || isNaN(t)) return NaN;
    return Math.round((f - t) / 86400000);
  }

  function i71PrevYmd(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return '';
    var ms = new Date(ymd + 'T00:00:00+07:00').getTime();
    if (isNaN(ms)) return '';
    return wibYmdFromMs(ms - 86400000);
  }

  function wibYmdFromMs(ms) {
    try {
      return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } catch (e) {
      return '';
    }
  }

  function i71ParseAnyYmd(raw) {
    if (raw == null || raw === '') return '';
    if (raw instanceof Date) {
      var t = raw.getTime();
      return isNaN(t) ? '' : wibYmdFromMs(t);
    }
    var s = String(raw).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // ISO datetime or other Date-parseable strings
    if (s.indexOf('T') >= 0 || s.indexOf(':') >= 0) {
      var msIso = new Date(s).getTime();
      if (!isNaN(msIso)) return wibYmdFromMs(msIso);
    }

    // dd/mm/yyyy or dd-mm-yyyy (optionally with time suffix)
    var mDmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s|$)/);
    if (mDmy) {
      var dd = i71Pad2(Number(mDmy[1]));
      var mm = i71Pad2(Number(mDmy[2]));
      var yy = String(Number(mDmy[3]));
      return yy + '-' + mm + '-' + dd;
    }

    // yyyy/mm/dd or yyyy-mm-dd with trailing content
    var mYmd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s|$)/);
    if (mYmd) {
      return String(Number(mYmd[1])) + '-' + i71Pad2(Number(mYmd[2])) + '-' + i71Pad2(Number(mYmd[3]));
    }

    var msAny = new Date(s).getTime();
    if (!isNaN(msAny)) return wibYmdFromMs(msAny);
    return '';
  }

  function i71GetCol(row, key) {
    if (!row) return '';
    if (row[key] != null && row[key] !== '') return row[key];
    var lo = key.toLowerCase();
    if (row[lo] != null && row[lo] !== '') return row[lo];
    return '';
  }

  function i71GetColAny(row, keys) {
    var arr = Array.isArray(keys) ? keys : [keys];
    for (var i = 0; i < arr.length; i++) {
      var v = i71GetCol(row, arr[i]);
      if (v != null && String(v).trim() !== '') return v;
    }
    return '';
  }

  function i71RowTruckType(row) {
    // Ambil STRICT dari kolom asli sheet sesuai struktur BKK_Bongkar.
    return String(i71GetCol(row, 'JENIS_TRUCK') || '').trim();
  }

  function i71RowCrewCount(row) {
    // Ambil STRICT dari kolom asli sheet sesuai struktur BKK_Bongkar.
    var raw = i71GetCol(row, 'JUMLAH_KULI');
    var n = Number(raw);
    return isNaN(n) ? null : n;
  }

  function i71ParseDurasiJson(row) {
    var raw = i71GetCol(row, 'DURASI_JSON');
    var rawBd = i71GetCol(row, 'BREAKDOWN_DURASI');
    if (!rawBd) rawBd = i71GetCol(row, 'BREAKDOWN DURASI');

    var mergedBd = null;
    if (rawBd) {
      try {
        var bd = typeof rawBd === 'string' ? JSON.parse(rawBd) : rawBd;
        if (bd && typeof bd === 'object' && !Array.isArray(bd)) mergedBd = bd;
      } catch (e0) {}
    }
    if (!raw) {
      if (mergedBd) return { v: 1, breakdowns: mergedBd };
      return null;
    }
    try {
      var o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof o === 'string') o = JSON.parse(o);
      if (!o || typeof o !== 'object') {
        if (mergedBd) return { v: 1, breakdowns: mergedBd };
        return null;
      }
      if (mergedBd) o.breakdowns = mergedBd;
      else if (!o.breakdowns) o.breakdowns = {};
      return o;
    } catch (e) {
      if (mergedBd) return { v: 1, breakdowns: mergedBd };
      return null;
    }
  }

  function i71NormalizeHm(v) {
    if (v == null || v === '') return '';
    var s = String(v).trim();
    if (!s) return '';
    if (s.indexOf('T') >= 0) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return i71Pad2(d.getHours()) + ':' + i71Pad2(d.getMinutes());
    }
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return i71Pad2(Number(m[1])) + ':' + m[2];
    return '';
  }

  function i71RowDateYmd(row) {
    var rawPbDate = i71GetCol(row, 'PB_TANGGAL');
    if (!rawPbDate) {
      var dj = i71ParseDurasiJson(row);
      rawPbDate = dj && dj.pb_tanggal ? dj.pb_tanggal : '';
    }
    function toWibYmd(rawVal) {
      if (!rawVal) return '';
      var s = String(rawVal).trim();
      if (!s) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      var d = new Date(s);
      if (isNaN(d.getTime())) return '';
      var w = new Date(d.getTime() + 7 * 3600000);
      return w.getUTCFullYear() + '-' + i71Pad2(w.getUTCMonth() + 1) + '-' + i71Pad2(w.getUTCDate());
    }
    if (rawPbDate) {
      var pbYmd = toWibYmd(rawPbDate);
      if (pbYmd) return pbYmd;
    }
    var raw = i71GetCol(row, 'TANGGAL');
    if (!raw) return '';
    return toWibYmd(raw);
  }

  function i71RowType(row) {
    var t = i71Type(i71GetCol(row, 'TYPE_BONGKARAN'));
    if (t) return t;
    var dj = i71ParseDurasiJson(row);
    if (dj && dj.type_bongkaran) return i71Type(dj.type_bongkaran);
    return '';
  }

  function i71RowStart(row) {
    var v = i71NormalizeHm(i71GetCol(row, 'PB_START'));
    if (v) return v;
    var dj = i71ParseDurasiJson(row);
    if (dj && dj.pb_start) return i71NormalizeHm(dj.pb_start);
    return '';
  }

  function i71RowFinish(row) {
    var v = i71NormalizeHm(i71GetCol(row, 'PB_FINISH'));
    if (v) return v;
    var dj = i71ParseDurasiJson(row);
    if (dj && dj.pb_finish) return i71NormalizeHm(dj.pb_finish);
    return '';
  }

  function i71CategorizeDowntime(durationMinutes) {
    if (durationMinutes > 120) return 'Extended Break';
    if (durationMinutes > 60) return 'Shift Break';
    return 'Operational Gap';
  }

  function i71StepDuration(startHm, endHm) {
    var s = i71TimeToMinutes(startHm);
    var e = i71TimeToMinutes(endHm);
    if (s == null || e == null) return null;
    if (e < s) e += 1440;
    return e - s;
  }

  function i71DurasiMenitIso(isoA, isoB) {
    if (!isoA || !isoB) return 0;
    function toMinutes(v) {
      var s = String(v).trim();
      // Format HH:MM
      var m = s.match(/^(\d{1,2}):(\d{2})$/);
      if (m) return Number(m[1]) * 60 + Number(m[2]);
      // Format ISO datetime
      var d = new Date(s);
      if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
      return null;
    }
    var a = toMinutes(isoA);
    var b = toMinutes(isoB);
    if (a == null || b == null) return 0;
    var diff = b - a;
    if (diff < 0) diff += 1440;
    return Math.round(diff);
  }

  function i71BuildWindowRows(dateYmd) {
    var out = [];
    var baseRows = (i71State.allRows && i71State.allRows.length)
      ? i71FilterByDate(dateYmd)
      : (i71State.rows || []);
    (baseRows || []).forEach(function(r) {
      var rowDate = i71RowDateYmd(r);
      if (!rowDate) return;
      var dayDiff = i71YmdDiffDays(rowDate, dateYmd);
      if (isNaN(dayDiff) || dayDiff < -1 || dayDiff > 0) return;
      var startHm = i71RowStart(r);
      var finishHm = i71RowFinish(r);
      var s = i71TimeToMinutes(startHm);
      var e = i71TimeToMinutes(finishHm);
      var type = i71RowType(r);
      if (!type || s == null || e == null) return;

      var startRel = dayDiff * 1440 + s;
      var endRel = dayDiff * 1440 + e;
      if (endRel <= startRel) endRel += 1440;
      var clipS = Math.max(0, startRel);
      var clipE = Math.min(1440, endRel);
      if (clipE <= clipS) return;

      out.push({
        row: r,
        type: type,
        nopol: i71GetCol(r, 'NO_POLISI') || '-',
        netto: Number(i71GetCol(r, 'NETTO_KG') || 0),
        startMin: clipS,
        endMin: clipE,
        fullStartMin: startRel,
        fullEndMin: endRel,
        startHm: i71MinToTime(clipS),
        finishHm: i71MinToTime(clipE)
      });
    });
    return out;
  }

  function i71FilterByDate(tanggal) {
    var target = /^\d{4}-\d{2}-\d{2}$/.test(String(tanggal || '')) ? String(tanggal) : '';
    if (!target) return [];
    return (i71State.allRows || []).filter(function(row) {
      return i71RowDateYmd(row) === target;
    });
  }

  function i71ComputeStepStats(dayRows) {
    var tol = {
      pbSampaiStart: 50,
      pbStartHold: 20,
      pbHoldRestart: 30,
      pbRestartFinish: 30,
      pbWindowTilting: 60,
      idleLoss: 45
    };
    var mapBreakdownKey = {
      pbSampaiStart: ['seg_0_1'],
      pbStartHold: ['seg_1_2'],
      pbHoldRestart: ['seg_2_3'],
      pbRestartFinish: ['seg_3_4'],
      pbWindowTilting: ['sbm_pb_window'],
      idleLoss: ['gap_truck_ns', 'sbm_gap_truck']
    };
    var acc = {
      pbSampaiStart: [],
      pbStartHold: [],
      pbHoldRestart: [],
      pbRestartFinish: [],
      pbWindowTilting: [],
      idleLoss: []
    };
    var explain = {
      pbSampaiStart: {},
      pbStartHold: {},
      pbHoldRestart: {},
      pbRestartFinish: {},
      pbWindowTilting: {},
      idleLoss: {}
    };
    var totals = {
      pbSampaiStart: 0,
      pbStartHold: 0,
      pbHoldRestart: 0,
      pbRestartFinish: 0,
      pbWindowTilting: 0,
      idleLoss: 0
    };
    var overTotals = {
      pbSampaiStart: 0,
      pbStartHold: 0,
      pbHoldRestart: 0,
      pbRestartFinish: 0,
      pbWindowTilting: 0,
      idleLoss: 0
    };
    var trucks = [];
    (dayRows || []).forEach(function(r) {
      var dj = i71ParseDurasiJson(r) || {};
      var start = i71RowStart(r) || i71NormalizeHm(dj.pb_start);
      var finish = i71RowFinish(r) || i71NormalizeHm(dj.pb_finish);
      var type = i71RowType(r);
      var pbSampai = i71NormalizeHm(i71GetCol(r, 'PB_SAMPAI')) || i71NormalizeHm(dj.pb_sampai);
      var pbHold = i71NormalizeHm(i71GetCol(r, 'PB_HOLD')) || i71NormalizeHm(dj.pb_hold);
      var pbRestart = i71NormalizeHm(i71GetCol(r, 'PB_RESTART')) || i71NormalizeHm(dj.pb_restart);

      var d1 = i71StepDuration(pbSampai, start); if (d1 != null) acc.pbSampaiStart.push(d1);
      var d2 = i71StepDuration(start, pbHold); if (d2 != null) acc.pbStartHold.push(d2);
      var d3 = i71StepDuration(pbHold, pbRestart); if (d3 != null) acc.pbHoldRestart.push(d3);
      var d4 = i71StepDuration(pbRestart, finish); if (d4 != null) acc.pbRestartFinish.push(d4);
      if (type === 'tilting') {
        var dt = i71StepDuration(start, finish);
        if (dt != null) acc.pbWindowTilting.push(dt);
      }
      var sMin = i71TimeToMinutes(start);
      var fMin = i71TimeToMinutes(finish);
      if (sMin != null && fMin != null && fMin >= sMin) {
        trucks.push({ start: sMin, finish: fMin, nopol: i71GetCol(r, 'NO_POLISI') || '-' });
      }

      var bds = dj && dj.breakdowns ? dj.breakdowns : {};
      var bdsNorm = {};
      Object.keys(bds || {}).forEach(function(k) { bdsNorm[String(k).toLowerCase()] = bds[k]; });
      [
        ['pbSampaiStart', d1],
        ['pbStartHold', d2],
        ['pbHoldRestart', d3],
        ['pbRestartFinish', d4],
        ['pbWindowTilting', type === 'tilting' ? i71StepDuration(start, finish) : null]
      ].forEach(function(pair) {
        var key = pair[0];
        var val = pair[1];
        if (val == null) return;
        totals[key] += val;
        var over = Math.max(0, val - tol[key]);
        overTotals[key] += over;
        if (over <= 0) return;
        var bKeys = mapBreakdownKey[key] || [];
        var list = null;
        for (var bi = 0; bi < bKeys.length; bi++) {
          var candidate = bdsNorm[String(bKeys[bi]).toLowerCase()];
          if (Array.isArray(candidate) && candidate.length) {
            list = candidate;
            break;
          }
        }
        if (!Array.isArray(list) || !list.length) {
          explain[key]['Tanpa keterangan breakdown'] = (explain[key]['Tanpa keterangan breakdown'] || 0) + over;
          return;
        }
        var sumBd = 0;
        list.forEach(function(it) {
          var m = Number(it.min != null ? it.min : it.MIN);
          if (!isNaN(m) && m > 0) sumBd += m;
        });
        if (sumBd <= 0) {
          explain[key]['Tanpa keterangan breakdown'] = (explain[key]['Tanpa keterangan breakdown'] || 0) + over;
          return;
        }
        var ratio = Math.min(1, over / sumBd);
        list.forEach(function(it) {
          var mn = Number(it.min != null ? it.min : it.MIN);
          if (isNaN(mn) || mn <= 0) return;
          var cat = String(it.other || it.cat || it.CAT || 'Lainnya').trim();
          explain[key][cat] = (explain[key][cat] || 0) + (mn * ratio);
        });
      });
    });
    trucks.sort(function(a, b) { return a.start - b.start; });
    for (var i = 1; i < trucks.length; i++) {
      var gap = trucks[i].start - trucks[i - 1].finish;
      if (gap >= 0) acc.idleLoss.push(gap);
      totals.idleLoss += gap;
      var overGap = Math.max(0, gap - tol.idleLoss);
      overTotals.idleLoss += overGap;
      if (overGap > 0) explain.idleLoss['Gap antar truck'] = (explain.idleLoss['Gap antar truck'] || 0) + overGap;
    }
    function avg(arr) {
      if (!arr.length) return null;
      return arr.reduce(function(s, v) { return s + v; }, 0) / arr.length;
    }
    var rows = [
      { key: 'pbSampaiStart', label: 'PB Sampai → PB Start', avg: avg(acc.pbSampaiStart), count: acc.pbSampaiStart.length, tol: tol.pbSampaiStart, totalRaw: totals.pbSampaiStart, overRaw: overTotals.pbSampaiStart, explain: explain.pbSampaiStart },
      { key: 'pbStartHold', label: 'PB Start → PB Hold', avg: avg(acc.pbStartHold), count: acc.pbStartHold.length, tol: tol.pbStartHold, totalRaw: totals.pbStartHold, overRaw: overTotals.pbStartHold, explain: explain.pbStartHold },
      { key: 'pbHoldRestart', label: 'PB Hold → PB Restart', avg: avg(acc.pbHoldRestart), count: acc.pbHoldRestart.length, tol: tol.pbHoldRestart, totalRaw: totals.pbHoldRestart, overRaw: overTotals.pbHoldRestart, explain: explain.pbHoldRestart },
      { key: 'pbRestartFinish', label: 'PB Restart → PB Finish', avg: avg(acc.pbRestartFinish), count: acc.pbRestartFinish.length, tol: tol.pbRestartFinish, totalRaw: totals.pbRestartFinish, overRaw: overTotals.pbRestartFinish, explain: explain.pbRestartFinish },
      { key: 'pbWindowTilting', label: 'Tilting PB Start → PB Finish', avg: avg(acc.pbWindowTilting), count: acc.pbWindowTilting.length, tol: tol.pbWindowTilting, totalRaw: totals.pbWindowTilting, overRaw: overTotals.pbWindowTilting, explain: explain.pbWindowTilting },
      { key: 'idleLoss', label: 'IDLE LOSS Antar Truck', avg: avg(acc.idleLoss), count: acc.idleLoss.length, tol: tol.idleLoss, totalRaw: totals.idleLoss, overRaw: overTotals.idleLoss, explain: explain.idleLoss }
    ];
    var totalRawAll = rows.reduce(function(s, r) { return s + (Number(r.totalRaw) || 0); }, 0);
    rows.forEach(function(r) {
      r.total = Number(r.totalRaw) || 0;
      var tolBudgetRaw = (Number(r.tol) || 0) * (Number(r.count) || 0);
      r.toleransiMenit = Math.min(r.total, tolBudgetRaw);
      r.breakdownMenit = Math.max(0, r.total - r.toleransiMenit);
      var exScaled = {};
      Object.keys(r.explain || {}).forEach(function(k) { exScaled[k] = Number(r.explain[k]) || 0; });
      r.explainScaled = exScaled;
      // Jika total breakdown > porsi breakdown step, proporsikan agar tidak melebihi step.
      var sumEx = Object.keys(exScaled).reduce(function(s, k) { return s + (Number(exScaled[k]) || 0); }, 0);
      if (sumEx > 0 && r.breakdownMenit >= 0 && sumEx > r.breakdownMenit) {
        var ratio = r.breakdownMenit / sumEx;
        Object.keys(exScaled).forEach(function(k) { exScaled[k] = exScaled[k] * ratio; });
      }
    });
    var totalScaled = rows.reduce(function(s, r) { return s + (Number(r.total) || 0); }, 0);
    if (totalScaled < 1440) {
      rows.push({
        key: 'otherOff',
        label: 'Sisa Waktu / Off Operasional',
        avg: null,
        count: 1,
        tol: 0,
        totalRaw: 0,
        overRaw: 0,
        total: 1440 - totalScaled,
        toleransiMenit: 0,
        breakdownMenit: 1440 - totalScaled,
        explainScaled: { 'Sisa waktu tidak terpetakan step': 1440 - totalScaled }
      });
    }
    return { rows: rows };
  }

  function i71BreakdownMinutes(arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;
    return arr.reduce(function(sum, it) {
      var mn = Number(it && (it.min != null ? it.min : it.MIN));
      return sum + (isNaN(mn) || mn <= 0 ? 0 : mn);
    }, 0);
  }

  function i71BuildStepPerOperation(daySlices) {
    var mapBreakdownKey = {
      pbSampaiStart: ['seg_0_1'],
      pbStartHold: ['seg_1_2'],
      pbHoldRestart: ['seg_2_3'],
      pbRestartFinish: ['seg_3_4'],
      pbWindowTilting: ['sbm_pb_window'],
      idleLoss: ['gap_truck_ns', 'sbm_gap_truck']
    };
    var ops = [];
    (daySlices || []).forEach(function(slc, idx) {
      var r = slc.row;
      var dj = i71ParseDurasiJson(r) || {};
      var bds = dj && dj.breakdowns ? dj.breakdowns : {};
      var bdsNorm = {};
      Object.keys(bds || {}).forEach(function(k) { bdsNorm[String(k).toLowerCase()] = bds[k]; });
      function bdFor(stepKey) {
        var keys = mapBreakdownKey[stepKey] || [];
        var out = 0;
        for (var i = 0; i < keys.length; i++) {
          out += i71BreakdownMinutes(bdsNorm[String(keys[i]).toLowerCase()]);
        }
        return out;
      }
      var id = String(i71GetCol(r, 'ID') || ('row_' + idx)).trim();
      var nopol = String(i71GetCol(r, 'NO_POLISI') || '-').trim() || '-';
      var truckTypeRaw = i71RowTruckType(r);
      var crewCount = i71RowCrewCount(r);
      var type = slc.type || i71RowType(r);
      var startHm = slc.startHm || i71RowStart(r);
      var finishHm = slc.finishHm || i71RowFinish(r);
      var startMin = typeof slc.startMin === 'number' ? slc.startMin : i71TimeToMinutes(startHm);
      var endMin = typeof slc.endMin === 'number' ? slc.endMin : i71TimeToMinutes(finishHm);
      if (!type || startMin == null || endMin == null || endMin <= startMin) return;
      var nettoKg = Number(i71GetCol(r, 'NETTO_KG') || 0);
      if (isNaN(nettoKg)) nettoKg = 0;
      var pbSampai = i71NormalizeHm(i71GetCol(r, 'PB_SAMPAI')) || i71NormalizeHm(dj.pb_sampai);
      var pbHold = i71NormalizeHm(i71GetCol(r, 'PB_HOLD')) || i71NormalizeHm(dj.pb_hold);
      var pbRestart = i71NormalizeHm(i71GetCol(r, 'PB_RESTART')) || i71NormalizeHm(dj.pb_restart);
      var fullStartHm = i71RowStart(r);
      var fullFinishHm = i71RowFinish(r);
      var fullStart = i71TimeToMinutes(fullStartHm);
      var fullEnd = i71TimeToMinutes(fullFinishHm);
      if (fullStart == null || fullEnd == null) return;
      if (fullEnd <= fullStart) fullEnd += 1440;
      var fullDur = Math.max(1, fullEnd - fullStart);
      var clipDur = Math.max(0, endMin - startMin);
      var rawPbSampai = i71GetCol(r, 'PB_SAMPAI') || dj.pb_sampai || '';
      var rawPbStart  = i71GetCol(r, 'PB_START')  || dj.pb_start  || '';
      var rawPbHold   = i71GetCol(r, 'PB_HOLD')   || dj.pb_hold   || '';
      var rawPbRestart= i71GetCol(r, 'PB_RESTART')|| dj.pb_restart|| '';
      var rawPbFinish = i71GetCol(r, 'PB_FINISH') || dj.pb_finish || '';

      // Mapping segmen sesuai kolom asli sheet (PB_*).
      var d1 = i71DurasiMenitIso(rawPbSampai, rawPbStart);      // PB Sampai -> Start
      var d2 = i71DurasiMenitIso(rawPbStart, rawPbHold);        // PB Start -> Hold
      var d3 = i71DurasiMenitIso(rawPbHold, rawPbRestart);      // PB Hold -> Restart
      var d4 = i71DurasiMenitIso(rawPbRestart, rawPbFinish);    // PB Restart -> Finish
      var d5 = type === 'tilting' ? i71DurasiMenitIso(rawPbStart, rawPbFinish) : 0; // Tilting Start -> Finish

      var sumRawSteps = d1 + d2 + d3 + d4 + d5;
      var ratio = sumRawSteps > 0 ? Math.max(0, Math.min(1, clipDur / sumRawSteps)) : Math.max(0, Math.min(1, clipDur / fullDur));
      d1 *= ratio; d2 *= ratio; d3 *= ratio; d4 *= ratio; d5 *= ratio;

      // Jika detail step parsial/kosong, fallback ke durasi operasi aktual agar bar tetap terbaca.
      var stepSum = d1 + d2 + d3 + d4 + d5;
      if (stepSum <= 0 && clipDur > 0) {
        if (type === 'tilting') d5 = clipDur;
        else d4 = clipDur;
      }

      var b1 = Math.min(d1, bdFor('pbSampaiStart'));
      var b2 = Math.min(d2, bdFor('pbStartHold'));
      var b3 = Math.min(d3, bdFor('pbHoldRestart'));
      var b4 = Math.min(d4, bdFor('pbRestartFinish'));
      var b5 = Math.min(d5, bdFor('pbWindowTilting'));
      ops.push({
        id: id,
        nopol: nopol,
        truckType: truckTypeRaw,
        crewCount: crewCount,
        type: type,
        startHm: startHm,
        finishHm: finishHm,
        startMin: startMin,
        endMin: endMin,
        nettoKg: nettoKg,
        nettoTon: nettoKg / 1000,
        durations: {
          pbSampaiStart: d1,
          pbStartHold: d2,
          pbHoldRestart: d3,
          pbRestartFinish: d4,
          pbWindowTilting: d5,
          idleLoss: 0
        },
        breakdown: {
          pbSampaiStart: b1,
          pbStartHold: b2,
          pbHoldRestart: b3,
          pbRestartFinish: b4,
          pbWindowTilting: b5,
          idleLoss: 0
        },
        idleBreakdownRaw: bdFor('idleLoss')
      });
    });
    ops.sort(function(a, b) { return a.startMin - b.startMin; });
    for (var i = 0; i < ops.length; i++) {
      if (i === 0) continue;
      var gap = ops[i].startMin - ops[i - 1].endMin;
      if (gap > 0) {
        ops[i].durations.idleLoss = gap;
        ops[i].breakdown.idleLoss = Math.min(gap, Number(ops[i].idleBreakdownRaw) || 0);
      }
    }
    ops.forEach(function(op) {
      op.normal = {
        pbSampaiStart: Math.max(0, op.durations.pbSampaiStart - op.breakdown.pbSampaiStart),
        pbStartHold: Math.max(0, op.durations.pbStartHold - op.breakdown.pbStartHold),
        pbHoldRestart: Math.max(0, op.durations.pbHoldRestart - op.breakdown.pbHoldRestart),
        pbRestartFinish: Math.max(0, op.durations.pbRestartFinish - op.breakdown.pbRestartFinish),
        pbWindowTilting: Math.max(0, op.durations.pbWindowTilting - op.breakdown.pbWindowTilting),
        idleLoss: Math.max(0, op.durations.idleLoss - op.breakdown.idleLoss)
      };
      // Total durasi operasi yang ditampilkan = durasi step mentah (tanpa idle).
      op.totalDurasi =
        (Number(op.durations.pbSampaiStart) || 0) +
        (Number(op.durations.pbStartHold) || 0) +
        (Number(op.durations.pbHoldRestart) || 0) +
        (Number(op.durations.pbRestartFinish) || 0) +
        (Number(op.durations.pbWindowTilting) || 0);
      op.breakdownTotal =
        op.breakdown.pbSampaiStart + op.breakdown.pbStartHold + op.breakdown.pbHoldRestart +
        op.breakdown.pbRestartFinish + op.breakdown.pbWindowTilting + op.breakdown.idleLoss;
    });
    return ops;
  }

  function i71NormTruckType(raw) {
    var s = String(raw || '').trim().toLowerCase();
    if (!s) return 'truck';
    if (s.indexOf('gandeng') >= 0) return 'gandeng';
    if (s.indexOf('tronton') >= 0) return 'tronton';
    if (s.indexOf('trailer dump') >= 0 || s.indexOf('trailer') >= 0) return 'trailer_dump';
    if (s.indexOf('dump truck') >= 0 || s.indexOf('dumptruck') >= 0 || s.indexOf('dumpt truck') >= 0) return 'dump_truck';
    return 'truck';
  }

  function i71TruckTypeLabel(raw) {
    var k = i71NormTruckType(raw);
    if (k === 'gandeng') return 'Gandeng';
    if (k === 'tronton') return 'Tronton';
    if (k === 'trailer_dump') return 'Trailer Dump';
    if (k === 'dump_truck') return 'Dump Truck';
    return 'Truck';
  }

  function i71DrawTruckIcon(ctx, x, y, typeKey) {
    var c = {
      gandeng: '#0ea5e9',
      tronton: '#8b5cf6',
      trailer_dump: '#14b8a6',
      dump_truck: '#f59e0b',
      truck: '#64748b'
    }[typeKey] || '#64748b';
    var w = 28;
    var h = 10;
    ctx.save();
    ctx.fillStyle = c;
    ctx.strokeStyle = 'rgba(2,6,23,.35)';
    ctx.lineWidth = 1;
    // Body
    ctx.fillRect(x - w / 2, y - h, w * 0.62, h);
    // Cabin
    ctx.fillRect(x + w * 0.12, y - h + 2, w * 0.22, h - 2);
    // Type bump
    if (typeKey === 'gandeng') {
      ctx.fillRect(x - w * 0.64, y - h + 1, w * 0.2, h - 1);
      ctx.strokeRect(x - w * 0.64, y - h + 1, w * 0.2, h - 1);
    } else if (typeKey === 'tronton') {
      ctx.fillRect(x - w * 0.16, y - h - 3, w * 0.24, 3);
      ctx.strokeRect(x - w * 0.16, y - h - 3, w * 0.24, 3);
    } else if (typeKey === 'trailer_dump') {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.31, y - h);
      ctx.lineTo(x - w * 0.02, y - h - 4);
      ctx.lineTo(x + w * 0.08, y - h - 4);
      ctx.lineTo(x + w * 0.08, y - h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (typeKey === 'dump_truck') {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.24, y - h);
      ctx.lineTo(x + w * 0.06, y - h - 5);
      ctx.lineTo(x + w * 0.08, y - h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Wheels
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(x - w * 0.22, y + 1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.02, y + 1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.2, y + 1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function i71StepOpDisplayTruckColor(typeRaw) {
    var key = i71NormTruckType(typeRaw);
    if (key === 'gandeng') return '#38bdf8';
    if (key === 'tronton') return '#a78bfa';
    if (key === 'trailer_dump') return '#22d3ee';
    if (key === 'dump_truck') return '#34d399';
    return '#94a3b8';
  }

  function i71EnsureStepPerOpStyles() {
    if (document.getElementById('i71_stepop_modern_style')) return;
    var st = document.createElement('style');
    st.id = 'i71_stepop_modern_style';
    st.textContent =
      '#chart-step-per-operasi{background:linear-gradient(165deg,#0a0e1a,#0f172a 42%,#111827);border:1px solid rgba(56,189,248,.28);box-shadow:0 0 0 1px rgba(56,189,248,.12) inset,0 16px 28px -18px rgba(14,165,233,.55),0 8px 36px -18px rgba(147,51,234,.38);border-radius:16px;padding:12px 14px 10px;}' +
      '#chart-step-per-operasi .i71-step-per-op-title{font-family:Orbitron,Rajdhani,Inter,sans-serif;color:#7dd3fc;letter-spacing:.04em;text-transform:uppercase;margin:2px 0 10px;font-size:.86rem;}' +
      '#chart-step-per-operasi .i71-step-per-op-canvas{overflow-x:auto;overflow-y:hidden;border:1px solid rgba(56,189,248,.22);border-radius:12px;background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(10,14,26,.95));padding:8px 8px 2px;scrollbar-width:thin;scrollbar-color:#22d3ee rgba(15,23,42,.92);}' +
      '#chart-step-per-operasi .i71-step-per-op-canvas::-webkit-scrollbar{height:11px;}' +
      '#chart-step-per-operasi .i71-step-per-op-canvas::-webkit-scrollbar-track{background:rgba(2,6,23,.85);border-radius:999px;}' +
      '#chart-step-per-operasi .i71-step-per-op-canvas::-webkit-scrollbar-thumb{background:linear-gradient(90deg,#06b6d4,#8b5cf6);border-radius:999px;border:1px solid rgba(125,211,252,.25);}' +
      '.i71-stepop-tooltip{position:absolute;z-index:30;pointer-events:none;opacity:0;transform:translate(-50%,-120%);background:rgba(2,6,23,.95);border:1px solid rgba(56,189,248,.45);border-radius:10px;padding:7px 9px;color:#e2e8f0;font-size:11px;line-height:1.35;white-space:nowrap;box-shadow:0 10px 20px -12px rgba(14,165,233,.7);}'+
      '.i71-stepop-legend-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px;}'+
      '.i71-stepop-legend-item{display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border:1px solid rgba(125,211,252,.22);border-radius:999px;color:#cbd5e1;font-size:.72rem;background:rgba(15,23,42,.55);}'+
      '.i71-stepop-legend-swatch{width:11px;height:11px;border-radius:3px;display:inline-block;}'+
      '@keyframes i71BarGrow{from{transform:scaleY(0);opacity:.25;}to{transform:scaleY(1);opacity:1;}}'+
      '@keyframes i71IdleDraw{from{stroke-dashoffset:240;opacity:.1;}to{stroke-dashoffset:0;opacity:1;}}'+
      '@keyframes i71DotPop{from{transform:scale(.2);opacity:0;}to{transform:scale(1);opacity:1;}}';
    document.head.appendChild(st);
  }

  function i71EscHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function i71BuildStepStatsFromOps(stepPerOps) {
    var defs = [
      { key: 'pbSampaiStart', label: 'PB Sampai → PB Start' },
      { key: 'pbStartHold', label: 'PB Start → PB Hold' },
      { key: 'pbHoldRestart', label: 'PB Hold → PB Restart' },
      { key: 'pbRestartFinish', label: 'PB Restart → PB Finish' },
      { key: 'pbWindowTilting', label: 'Tilting PB Start → PB Finish' },
      { key: 'idleLoss', label: 'IDLE LOSS Antar Truck' }
    ];
    var rows = defs.map(function(d) {
      var total = 0;
      var breakdown = 0;
      var count = 0;
      (stepPerOps || []).forEach(function(op) {
        var dur = Number(op && op.durations ? op.durations[d.key] : 0) || 0;
        var bd = Number(op && op.breakdown ? op.breakdown[d.key] : 0) || 0;
        if (dur > 0) count++;
        total += dur;
        breakdown += bd;
      });
      return {
        key: d.key,
        label: d.label,
        avg: count > 0 ? (total / count) : null,
        count: count,
        tol: 0,
        totalRaw: total,
        overRaw: breakdown,
        total: total,
        toleransiMenit: Math.max(0, total - breakdown),
        breakdownMenit: Math.max(0, breakdown),
        explainScaled: breakdown > 0 ? { 'Breakdown tercatat': breakdown } : {}
      };
    });
    var totalMapped = rows.reduce(function(s, r) { return s + (Number(r.total) || 0); }, 0);
    if (totalMapped < 1440) {
      rows.push({
        key: 'otherOff',
        label: 'Sisa Waktu / Off Operasional',
        avg: null,
        count: 1,
        tol: 0,
        totalRaw: 0,
        overRaw: 0,
        total: 1440 - totalMapped,
        toleransiMenit: 0,
        breakdownMenit: 1440 - totalMapped,
        explainScaled: { 'Sisa waktu tidak terpetakan step': 1440 - totalMapped }
      });
    }
    return { rows: rows };
  }

  function i71DestroyCharts() {
    ['util', 'type', 'timeline', 'steps'].forEach(function(k) {
      if (i71State.charts[k] && typeof i71State.charts[k].destroy === 'function') {
        try { i71State.charts[k].destroy(); } catch (e) {}
      }
      i71State.charts[k] = null;
    });
  }

  function i71RenderCalendar() {
    var grid = document.getElementById('i71_calendar_grid');
    var title = document.getElementById('i71_calendar_title');
    if (!grid || !title || !i71State.calendarMonth) return;
    title.textContent = i71MonthTitle(i71State.calendarMonth);
    var monthHasData = {};
    (i71State.allRows || []).forEach(function(r) {
      var dy = i71RowDateYmd(r);
      if (dy && dy.indexOf(i71State.calendarMonth + '-') === 0) monthHasData[dy] = true;
    });

    var p = i71State.calendarMonth.split('-');
    var y = Number(p[0]);
    var m = Number(p[1]) - 1;
    var firstDay = new Date(y, m, 1);
    var startWeekday = firstDay.getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();

    grid.innerHTML = '';
    for (var i = 0; i < startWeekday; i++) {
      var blank = document.createElement('button');
      blank.type = 'button';
      blank.className = 'i71-cal-day is-blank';
      blank.disabled = true;
      grid.appendChild(blank);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var ymd = y + '-' + i71Pad2(m + 1) + '-' + i71Pad2(d);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'i71-cal-day';
      if (ymd === i71State.selectedDate) btn.classList.add('is-active');
      if (ymd === i71TodayWib()) btn.classList.add('is-today');
      if (monthHasData[ymd]) btn.classList.add('has-data');
      btn.textContent = String(d);
      btn.setAttribute('data-date', ymd);
      btn.addEventListener('click', function() {
        var sel = this.getAttribute('data-date');
        if (!sel) return;
        i71State.selectedDate = sel;
        var dateEl = document.getElementById('i71_date');
        if (dateEl) dateEl.value = sel;
        i71State.calendarMonth = i71MonthKey(sel);
        i71State.rows = i71FilterByDate(sel);
        i71RenderCalendar();
        i71Render(sel);
      });
      grid.appendChild(btn);
    }
  }

  function i71Analyze(opsRaw) {
    var invalidCount = 0;
    var skippedCount = 0;
    var totalNetto = 0;
    var tiltingStats = { count: 0, totalDuration: 0, totalNetto: 0 };
    var manualStats = { count: 0, totalDuration: 0, totalNetto: 0 };

    var operations = [];
    (opsRaw || []).forEach(function(op, idx) {
      var startMin = typeof op.startMin === 'number' ? op.startMin : i71TimeToMinutes(op.start);
      var endMin = typeof op.endMin === 'number' ? op.endMin : i71TimeToMinutes(op.finish);
      var type = i71Type(op.type);
      if (!type || startMin == null || endMin == null) {
        skippedCount++;
        return;
      }
      if (startMin >= endMin || startMin < 0 || endMin > 1440) {
        invalidCount++;
        return;
      }
      var netto = Number(op.netto) || 0;
      totalNetto += netto;
      var duration = endMin - startMin;
      if (type === 'tilting') {
        tiltingStats.count++;
        tiltingStats.totalDuration += duration;
        tiltingStats.totalNetto += netto;
      } else {
        manualStats.count++;
        manualStats.totalDuration += duration;
        manualStats.totalNetto += netto;
      }
      operations.push({
        id: 'op_' + idx,
        nopol: String(op.nopol || '-').trim(),
        type: type,
        startMin: startMin,
        endMin: endMin,
        duration: duration,
        netto: netto
      });
    });

    operations.sort(function(a, b) { return a.startMin - b.startMin; });

    var mergedPeriods = [];
    var current = null;
    operations.forEach(function(op) {
      if (!current) {
        current = { start: op.startMin, end: op.endMin, operations: [op] };
      } else if (op.startMin <= current.end) {
        current.end = Math.max(current.end, op.endMin);
        current.operations.push(op);
      } else {
        mergedPeriods.push(current);
        current = { start: op.startMin, end: op.endMin, operations: [op] };
      }
    });
    if (current) mergedPeriods.push(current);

    var totalActiveMinutes = mergedPeriods.reduce(function(sum, p) { return sum + (p.end - p.start); }, 0);

    var downtimes = [];
    if (mergedPeriods.length) {
      if (mergedPeriods[0].start > 0) {
        downtimes.push({
          start: 0,
          end: mergedPeriods[0].start,
          duration: mergedPeriods[0].start,
          reason: 'Before Operations'
        });
      }
      for (var i = 0; i < mergedPeriods.length - 1; i++) {
        var gap = mergedPeriods[i + 1].start - mergedPeriods[i].end;
        if (gap > 0) {
          downtimes.push({
            start: mergedPeriods[i].end,
            end: mergedPeriods[i + 1].start,
            duration: gap,
            reason: i71CategorizeDowntime(gap)
          });
        }
      }
      if (mergedPeriods[mergedPeriods.length - 1].end < 1440) {
        var tail = 1440 - mergedPeriods[mergedPeriods.length - 1].end;
        downtimes.push({
          start: mergedPeriods[mergedPeriods.length - 1].end,
          end: 1440,
          duration: tail,
          reason: 'After Operations'
        });
      }
    } else {
      downtimes.push({ start: 0, end: 1440, duration: 1440, reason: 'No Operations' });
    }

    var overlapMap = {};
    operations.forEach(function(op) {
      if (!overlapMap[op.startMin]) overlapMap[op.startMin] = { starts: [], ends: [] };
      if (!overlapMap[op.endMin]) overlapMap[op.endMin] = { starts: [], ends: [] };
      overlapMap[op.startMin].starts.push(op);
      overlapMap[op.endMin].ends.push(op);
    });
    var marks = Object.keys(overlapMap).map(Number).sort(function(a, b) { return a - b; });
    var active = {};
    var overlappingPeriods = [];
    for (var m = 0; m < marks.length; m++) {
      var t = marks[m];
      var bucket = overlapMap[t];
      bucket.ends.forEach(function(op) { delete active[op.id]; });
      bucket.starts.forEach(function(op) { active[op.id] = op; });
      var next = marks[m + 1];
      if (next == null || next <= t) continue;
      var activeOps = Object.keys(active).map(function(k) { return active[k]; });
      if (activeOps.length >= 2) {
        overlappingPeriods.push({
          start: t,
          end: next,
          duration: next - t,
          operationCount: activeOps.length,
          nopols: activeOps.map(function(op) { return op.nopol; })
        });
      }
    }
    var mergedOverlap = [];
    overlappingPeriods.forEach(function(seg) {
      var last = mergedOverlap[mergedOverlap.length - 1];
      if (last && seg.start <= last.end) {
        last.end = Math.max(last.end, seg.end);
        last.duration = last.end - last.start;
        last.operationCount = Math.max(last.operationCount, seg.operationCount);
        seg.nopols.forEach(function(n) { if (last.nopols.indexOf(n) < 0) last.nopols.push(n); });
      } else {
        mergedOverlap.push({
          start: seg.start,
          end: seg.end,
          duration: seg.duration,
          operationCount: seg.operationCount,
          nopols: seg.nopols.slice()
        });
      }
    });

    var totalDowntimeMinutes = downtimes.reduce(function(s, d) { return s + d.duration; }, 0);
    var longestDowntime = downtimes.reduce(function(max, d) { return d.duration > max.duration ? d : max; }, { duration: 0 });
    var utilizationRate = (totalActiveMinutes / 1440) * 100;

    return {
      totalOperations: operations.length,
      totalNetto: totalNetto,
      invalidCount: invalidCount,
      skippedCount: skippedCount,
      activeTime: {
        minutes: totalActiveMinutes,
        formatted: i71FormatMinutes(totalActiveMinutes),
        mergedPeriods: mergedPeriods.length
      },
      downtime: {
        minutes: totalDowntimeMinutes,
        formatted: i71FormatMinutes(totalDowntimeMinutes),
        gaps: downtimes
      },
      utilization: utilizationRate,
      byType: { tilting: tiltingStats, manual: manualStats },
      overlappingPeriods: mergedOverlap,
      mergedPeriods: mergedPeriods,
      operations: operations
    };
  }

  function i71AttachTimelineHeatmapHover(canvas, chart, hourlyNettoTon) {
    if (!canvas || !chart) return;
    if (canvas._i71HeatmapMove) canvas.removeEventListener('mousemove', canvas._i71HeatmapMove);
    if (canvas._i71HeatmapLeave) canvas.removeEventListener('mouseleave', canvas._i71HeatmapLeave);

    var host = canvas.parentElement;
    if (host && (!host.style.position || host.style.position === 'static')) host.style.position = 'relative';

    var tip = host ? host.querySelector('.i71-heatmap-tip') : null;
    if (!tip && host) {
      tip = document.createElement('div');
      tip.className = 'i71-heatmap-tip';
      tip.style.cssText = 'position:absolute;background:rgba(15,20,35,0.92);border:1px solid rgba(79,195,247,0.4);border-radius:8px;font-size:11px;color:#fff;padding:4px 10px;pointer-events:none;opacity:0;transform:translate(-50%,-120%);transition:opacity .12s ease;z-index:30;white-space:nowrap;';
      host.appendChild(tip);
    }

    function hideTip() {
      if (tip) tip.style.opacity = '0';
    }

    function onMove(ev) {
      if (!tip || !chart || !chart.chartArea) return;
      var area = chart.chartArea;
      var gapY = 1;
      var stripH = 12;
      var stripY = area.bottom + gapY;
      var rect = canvas.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var y = ev.clientY - rect.top;
      if (y < stripY || y > stripY + stripH || x < area.left || x > area.right) {
        hideTip();
        return;
      }

      var n = 24;
      var fullCell = area.width / n;
      var idx = Math.floor((x - area.left) / fullCell);
      if (idx < 0 || idx >= n) {
        hideTip();
        return;
      }
      var cellGap = 2;
      var cellLeft = area.left + idx * fullCell + (cellGap / 2);
      var cellRight = area.left + (idx + 1) * fullCell - (cellGap / 2);
      if (x < cellLeft || x > cellRight) {
        hideTip();
        return;
      }

      var v = Number((hourlyNettoTon && hourlyNettoTon[idx]) || 0);
      tip.textContent = i71Pad2(idx) + ':00 — ' + v.toFixed(2) + ' ton';
      tip.style.left = ((cellLeft + cellRight) / 2) + 'px';
      tip.style.top = stripY + 'px';
      tip.style.opacity = '1';
    }

    function onLeave() { hideTip(); }

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas._i71HeatmapMove = onMove;
    canvas._i71HeatmapLeave = onLeave;
  }

  function i71RenderCharts(res, stepStats, stepPerOps, dateYmd) {
    if (typeof Chart === 'undefined') return;
    i71DestroyCharts();
    function withAlpha(hex, a) {
      var h = String(hex || '').replace('#', '');
      if (h.length !== 6) return hex;
      var r = parseInt(h.slice(0, 2), 16);
      var g = parseInt(h.slice(2, 4), 16);
      var b = parseInt(h.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    var utilCanvas = document.getElementById('i71_chart_util');
    if (utilCanvas) {
      var uctx = utilCanvas.getContext('2d');
      var utilGradA = uctx.createLinearGradient(0, 0, 0, utilCanvas.height || 140);
      utilGradA.addColorStop(0, '#00e5ff');
      utilGradA.addColorStop(1, '#0ea5e9');
      var utilGradD = uctx.createLinearGradient(0, 0, 0, utilCanvas.height || 140);
      utilGradD.addColorStop(0, '#ff4d4f');
      utilGradD.addColorStop(1, '#f59e0b');
      i71State.charts.util = new Chart(uctx, {
        type: 'doughnut',
        data: {
          labels: ['Active', 'Downtime'],
          datasets: [{
            data: [res.activeTime.minutes, res.downtime.minutes],
            backgroundColor: [utilGradA, utilGradD],
            borderColor: ['#ffffff', '#ffffff'],
            borderWidth: 2,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 1300, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: '#0f172a' } },
            tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + i71FormatMinutes(ctx.parsed); } } }
          },
          cutout: '66%'
        }
      });
    }

    var typeCanvas = document.getElementById('i71_chart_type');
    if (typeCanvas) {
      var tctx = typeCanvas.getContext('2d');
      var gradTilting = tctx.createLinearGradient(0, 0, 0, typeCanvas.height || 140);
      gradTilting.addColorStop(0, '#7c3aed');
      gradTilting.addColorStop(1, '#3b82f6');
      var gradManual = tctx.createLinearGradient(0, 0, 0, typeCanvas.height || 140);
      gradManual.addColorStop(0, '#22c55e');
      gradManual.addColorStop(1, '#16a34a');
      i71State.charts.type = new Chart(tctx, {
        type: 'bar',
        data: {
          labels: ['Tilting', 'Manual'],
          datasets: [
            {
              label: 'Durasi (menit)',
              data: [res.byType.tilting.totalDuration, res.byType.manual.totalDuration],
              backgroundColor: [gradTilting, gradManual],
              borderColor: ['#4c1d95', '#166534'],
              borderWidth: 1.5,
              borderRadius: 8
            },
            {
              type: 'line',
              label: 'Netto (ton)',
              data: [res.byType.tilting.totalNetto / 1000, res.byType.manual.totalNetto / 1000],
              borderColor: '#ef4444',
              backgroundColor: withAlpha('#ef4444', 0.25),
              pointBackgroundColor: '#ef4444',
              pointRadius: 3,
              tension: 0.35,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 1200, easing: 'easeOutCubic' },
          plugins: { legend: { position: 'bottom', labels: { color: '#0f172a' } } },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#334155' }, grid: { display: false } },
            y1: { beginAtZero: true, position: 'right', grid: { display: false, drawOnChartArea: false }, ticks: { color: '#dc2626' } },
            x: { ticks: { color: '#334155' }, grid: { display: false } }
          }
        }
      });
    }

    var lineCanvas = document.getElementById('i71_chart_timeline');
    if (lineCanvas) {
      var points = [];
      var nettoTonPerHour = [];
      for (var h = 0; h < 24; h++) {
        var segStart = h * 60;
        var segEnd = segStart + 60;
        var active = 0;
        var nettoKg = 0;
        res.mergedPeriods.forEach(function(p) {
          var ov = Math.max(0, Math.min(segEnd, p.end) - Math.max(segStart, p.start));
          active += ov;
        });
        (res.operations || []).forEach(function(op) {
          if (op.startMin >= segStart && op.startMin < segEnd) nettoKg += Number(op.netto) || 0;
        });
        points.push(active);
        nettoTonPerHour.push(Number((nettoKg / 1000).toFixed(2)));
      }
      var lctx = lineCanvas.getContext('2d');
      var gradArea = lctx.createLinearGradient(0, 0, 0, lineCanvas.height || 150);
      gradArea.addColorStop(0, withAlpha('#06b6d4', 0.65));
      gradArea.addColorStop(1, withAlpha('#3b82f6', 0.08));
      var timelineLabelPlugin = {
        id: 'i71TimelineNettoLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx;
          var meta = chart.getDatasetMeta(2);
          if (!meta || !meta.data) return;
          var area = chart.chartArea;
          var totalTon = nettoTonPerHour.reduce(function(s, v) { return s + (Number(v) || 0); }, 0);
          ctx.save();
          ctx.font = '10px Inter, sans-serif';
          ctx.fillStyle = '#0c4a6e';
          ctx.textAlign = 'center';
          meta.data.forEach(function(pt, idx) {
            var v = nettoTonPerHour[idx];
            if (!v || v <= 0) return;
            ctx.fillText(v.toFixed(2) + 't', pt.x, pt.y - 8);
          });
          // Badge label netto total di dalam plot area (kanan atas)
          if (area) {
            var txt = 'Netto total: ' + totalTon.toFixed(2) + ' ton';
            ctx.textAlign = 'right';
            ctx.font = '11px Inter, sans-serif';
            var tx = area.right - 8;
            var ty = area.top + 12;
            var w = ctx.measureText(txt).width + 12;
            var h = 18;
            ctx.fillStyle = 'rgba(109,40,217,0.12)';
            ctx.strokeStyle = 'rgba(109,40,217,0.35)';
            ctx.lineWidth = 1;
            if (typeof ctx.roundRect === 'function') {
              ctx.beginPath();
              ctx.roundRect(tx - w, ty - 10, w, h, 6);
              ctx.fill();
              ctx.stroke();
            } else {
              ctx.fillRect(tx - w, ty - 10, w, h);
              ctx.strokeRect(tx - w, ty - 10, w, h);
            }
            ctx.fillStyle = '#6d28d9';
            ctx.fillText(txt, tx - 6, ty + 2);
          }
          ctx.restore();
        }
      };
      var timelineHeatmapStripPlugin = {
        id: 'i71TimelineHeatmapStrip',
        afterDraw: function(chart) {
          if (!chart || !chart.chartArea) return;
          var area = chart.chartArea;
          var ctx = chart.ctx;
          var values = nettoTonPerHour.slice(0, 24);
          var maxV = values.reduce(function(m, v) { return Math.max(m, Number(v) || 0); }, 0);
          var stripY = area.bottom + 1;
          var stripH = 12;
          var cellGap = 2;
          var cellW = area.width / 24;
          function drawRoundRect(x, y, w, h, r) {
            if (typeof ctx.roundRect === 'function') {
              ctx.beginPath();
              ctx.roundRect(x, y, w, h, r);
              return;
            }
            var rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.lineTo(x + w - rr, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
            ctx.lineTo(x + w, y + h - rr);
            ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
            ctx.lineTo(x + rr, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
            ctx.lineTo(x, y + rr);
            ctx.quadraticCurveTo(x, y, x + rr, y);
          }
          ctx.save();
          for (var hi = 0; hi < 24; hi++) {
            var vv = Number(values[hi]) || 0;
            var ratio = maxV > 0 ? (vv / maxV) : 0;
            var alpha = 0.15 + (0.85 * ratio);
            var x = area.left + (hi * cellW) + (cellGap / 2);
            var w = Math.max(2, cellW - cellGap);
            drawRoundRect(x, stripY, w, stripH, 3);
            ctx.fillStyle = 'rgba(79,195,247,' + alpha.toFixed(4) + ')';
            ctx.fill();
          }
          ctx.restore();
        }
      };
      var timelineLabels = Array.from({ length: 25 }, function(_, h2) { return i71Pad2(h2) + ':00'; });
      var points24 = points.slice();
      var netto24 = nettoTonPerHour.slice();
      points24.push(0);
      netto24.push(0);
      i71State.charts.timeline = new Chart(lctx, {
        type: 'line',
        data: {
          labels: timelineLabels,
          datasets: [
            {
              label: '_shadow',
              data: points24.map(function(v) { return Math.max(0, v - 4); }),
              borderColor: withAlpha('#0ea5e9', 0.35),
              backgroundColor: withAlpha('#0ea5e9', 0.14),
              fill: true,
              pointRadius: 0,
              tension: 0.38
            },
            {
              label: 'Aktif per jam (menit)',
              data: points24,
              borderColor: '#0284c7',
              borderWidth: 2.4,
              backgroundColor: gradArea,
              pointBackgroundColor: '#06b6d4',
              pointBorderColor: '#ffffff',
              pointRadius: 2.8,
              fill: true,
              tension: 0.38
            },
            {
              type: 'bar',
              label: 'Netto per jam (ton)',
              data: netto24,
              yAxisID: 'y1',
              backgroundColor: withAlpha('#7c3aed', 0.35),
              borderColor: withAlpha('#6d28d9', 0.9),
              borderWidth: 1,
              borderRadius: 4,
              barPercentage: 0.72,
              categoryPercentage: 0.9
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 1400, easing: 'easeOutQuart' },
          layout: { padding: { top: 2, bottom: 4 } },
          plugins: {
            legend: {
              display: false,
              labels: {
                color: '#334155',
                usePointStyle: true,
                boxWidth: 8,
                filter: function(item) { return item.text !== '_shadow'; }
              }
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#334155' }, grid: { display: false } },
            y1: { beginAtZero: true, position: 'right', grid: { display: false, drawOnChartArea: false }, ticks: { color: '#6d28d9' } },
            x: { ticks: { color: '#334155', padding: 4, maxRotation: 0, autoSkip: false, callback: function(v, idx) { return idx % 3 === 0 || idx === 24 ? timelineLabels[idx] : ''; } }, grid: { display: false } }
          }
        },
        plugins: [timelineLabelPlugin, timelineHeatmapStripPlugin]
      });
      i71AttachTimelineHeatmapHover(lineCanvas, i71State.charts.timeline, nettoTonPerHour);
      var tlg = document.getElementById('i71_timeline_legend_top');
      if (tlg) {
        tlg.innerHTML =
          '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#06b6d4;display:inline-block;"></span>Aktif per jam (menit)</span>' +
          '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#a78bfa;border:1px solid rgba(109,40,217,.45);display:inline-block;"></span>Netto per jam (ton)</span>';
      }
    }

    var stepCanvas = document.getElementById('i71_chart_steps');
    if (stepCanvas) {
      var labels = stepStats.rows.map(function(r) { return r.label; });
      var vals = stepStats.rows.map(function(r) { return Number((r.total || 0).toFixed(1)); });
      i71State.charts.steps = new Chart(stepCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: 'Total durasi (menit)', data: vals, backgroundColor: ['#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#22c55e', '#f59e0b', '#94a3b8'], borderRadius: 10 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { beginAtZero: true, grid: { display: false } },
            y: { grid: { display: false } }
          }
        }
      });
    }

    var stepPerOpCanvas = document.getElementById('canvas-step-per-operasi');
    var stepPerOpWrap = document.querySelector('#chart-step-per-operasi .i71-step-per-op-canvas');
    if (stepPerOpWrap) {
      if (window._chartStepPerOp && typeof window._chartStepPerOp.destroy === 'function') {
        try { window._chartStepPerOp.destroy(); } catch (eSp) {}
      }
      i71EnsureStepPerOpStyles();
      // Hard reset area render agar tidak ada elemen lama tersisa.
      stepPerOpWrap.innerHTML = '';
      if (stepPerOpCanvas) stepPerOpCanvas.style.display = 'none';
      var ops = Array.isArray(stepPerOps) ? stepPerOps.slice() : [];
      var stepTitle = document.querySelector('#chart-step-per-operasi .i71-step-per-op-title');
      if (stepTitle) {
        stepTitle.textContent = 'Peta Waktu Operasi Armada';
      }
      if (!ops.length) {
        stepPerOpWrap.style.height = '220px';
        stepPerOpWrap.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#93c5fd;font-family:Rajdhani,Orbitron,sans-serif;font-weight:700;letter-spacing:.03em;">' +
          'Tidak ada operasi valid pada tanggal ' + i71EscHtml(dateYmd || '-') +
          '</div>';
        var lgEmpty = document.getElementById('i71_step_per_op_legend');
        if (lgEmpty) lgEmpty.innerHTML = '';
        return;
      }
      var totalSvgW = Math.max(stepPerOpWrap.clientWidth || 980, 24 * 220);
      var svgH = 420;
      var margin = { top: 110, right: 40, bottom: 110, left: 44 };
      var plotW = totalSvgW - margin.left - margin.right;
      var plotH = svgH - margin.top - margin.bottom;
      var maxTotal = Math.max(1, ops.reduce(function(m, op) { return Math.max(m, Number(op.totalDurasi) || 0); }, 0));
      var yMax = Math.ceil(maxTotal / 60) * 60 + 60;
      function xByMin(min) { return margin.left + (Math.max(0, Math.min(1440, min)) / 1440) * plotW; }
      function yByVal(v) { return margin.top + plotH - ((Number(v) || 0) / yMax) * plotH; }
      var stepDefs = [
        { k: 'pbSampaiStart', label: 'PB Sampai→Start', c1: '#67e8f9', c2: '#0284c7' },
        { k: 'pbStartHold', label: 'PB Start→Hold', c1: '#6ee7b7', c2: '#059669' },
        { k: 'pbHoldRestart', label: 'PB Hold→Restart', c1: '#c4b5fd', c2: '#7c3aed' },
        { k: 'pbRestartFinish', label: 'PB Restart→Finish', c1: '#93c5fd', c2: '#2563eb' },
        { k: 'pbWindowTilting', label: 'Tilting Start→Finish', c1: '#5eead4', c2: '#0d9488' }
      ];
      var gradDefs = stepDefs.map(function(sd, i) {
        return '<linearGradient id="i71g_' + i + '" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="' + sd.c1 + '"/><stop offset="100%" stop-color="' + sd.c2 + '"/></linearGradient>';
      }).join('');
      var sheenDef = '<linearGradient id="i71_sheen" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(255,255,255,0)"/><stop offset="65%" stop-color="rgba(255,255,255,.08)"/><stop offset="100%" stop-color="rgba(255,255,255,.28)"/></linearGradient>';
      var gridSvg = '';
      for (var gy = 0; gy <= 6; gy++) {
        var yy = margin.top + (plotH * gy / 6);
        gridSvg += '<line x1="' + margin.left + '" y1="' + yy + '" x2="' + (margin.left + plotW) + '" y2="' + yy + '" stroke="rgba(0,255,255,.08)" stroke-width="1"/>';
      }
      for (var hr = 0; hr <= 24; hr++) {
        var xr = xByMin(hr * 60);
        gridSvg += '<line x1="' + xr + '" y1="' + margin.top + '" x2="' + xr + '" y2="' + (margin.top + plotH) + '" stroke="rgba(56,189,248,.12)" stroke-width="' + (hr % 6 === 0 ? 1.2 : 1) + '"/>';
      }
      var barsSvg = '';
      var idleLineSvg = '';
      var prevTop = null;
      var idleIdx = 0;
      // --- Anti-collision: hitung posisi center x semua bar dulu ---
      var barCenters = [];
      ops.forEach(function(op) {
        var barW = Math.max(16, Math.min(36, ((Number(op.totalDurasi) || 0) / 10) + 12));
        barCenters.push(xByMin(op.startMin));
      });
      var labelLevels = [];
      var MIN_LABEL_GAP = 68;
      barCenters.forEach(function(cx, idx) {
        if (idx === 0) { labelLevels.push(0); return; }
        var gap = cx - barCenters[idx - 1];
        if (gap < MIN_LABEL_GAP) {
          labelLevels.push((labelLevels[idx - 1] + 1) % 3);
        } else {
          labelLevels.push(0);
        }
      });
      ops.forEach(function(op, idx) {
        var barW = Math.max(16, Math.min(36, ((Number(op.totalDurasi) || 0) / 10) + 12));
        var x = xByMin(op.startMin) - barW / 2;
        var stackTop = yByVal(op.totalDurasi);
        var cursor = margin.top + plotH;
        var segRects = '';
        stepDefs.forEach(function(sd, sIdx) {
          var h = Math.max(0, Number(op.durations && op.durations[sd.k]) || 0);
          if (h <= 0) return;
          var pxH = (h / yMax) * plotH;
          cursor -= pxH;
          segRects += '<rect x="' + x + '" y="' + cursor + '" width="' + barW + '" height="' + pxH + '" fill="url(#i71g_' + sIdx + ')" rx="4" ry="4"/>';
        });
        var glowColor = stepDefs.find(function(sd) { return (Number(op.normal && op.normal[sd.k]) || 0) > 0; });
        var glow = glowColor ? 'filter="drop-shadow(0 0 8px ' + glowColor.c1 + '55)"' : '';
        barsSvg += '<g style="transform-origin:' + (x + barW / 2) + 'px ' + (margin.top + plotH) + 'px;animation:i71BarGrow .72s ease-out ' + (idx * 55) + 'ms both;" ' + glow + '>' +
          segRects +
          '<rect x="' + (x + barW * 0.62) + '" y="' + stackTop + '" width="' + (barW * 0.38) + '" height="' + ((margin.top + plotH) - stackTop) + '" fill="url(#i71_sheen)" rx="4" ry="4"/>' +
          '</g>';
        // --- Label stagger berdasarkan level anti-collision ---
        var lvl = labelLevels[idx] || 0;
        var topStagger = lvl * (-24);
        var botStagger = lvl * 16;
        var topAlpha = lvl === 0 ? '1' : '0.72';
        var topFontSize = lvl === 0 ? '11' : '10';
        var truckType = String(op.truckType || '').trim();
        var topTxtY = margin.top - 62 + topStagger;
        if (truckType) {
          barsSvg += '<text x="' + (x + barW / 2) + '" y="' + topTxtY + '" text-anchor="middle" fill="' + i71StepOpDisplayTruckColor(truckType) + '" font-family="Rajdhani,Orbitron,sans-serif" font-size="' + topFontSize + '" font-weight="700" opacity="' + topAlpha + '">' + i71EscHtml(i71TruckTypeLabel(truckType)) + '</text>';
          topTxtY += 13;
        }
        barsSvg += '<text x="' + (x + barW / 2) + '" y="' + topTxtY + '" text-anchor="middle" fill="#cbd5e1" font-family="Rajdhani,Orbitron,sans-serif" font-size="' + topFontSize + '" font-weight="700" opacity="' + topAlpha + '">Dur ' + Math.round(op.totalDurasi || 0) + 'm</text>' +
          '<text x="' + (x + barW / 2) + '" y="' + (topTxtY + 12) + '" text-anchor="middle" fill="#94a3b8" font-family="Rajdhani,Orbitron,sans-serif" font-size="' + topFontSize + '" font-weight="700" opacity="' + topAlpha + '">Kuli ' + (op.crewCount == null ? '-' : Number(op.crewCount)) + '</text>' +
          '<text x="' + (x + barW / 2) + '" y="' + (margin.top + plotH + 24 + botStagger) + '" text-anchor="middle" fill="#dbeafe" font-family="Rajdhani,Orbitron,sans-serif" font-size="' + topFontSize + '" font-weight="700" opacity="' + topAlpha + '">' + i71EscHtml(String(op.nopol || '-')) + '</text>' +
          '<text x="' + (x + barW / 2) + '" y="' + (margin.top + plotH + 37 + botStagger) + '" text-anchor="middle" fill="#2dd4bf" font-family="Rajdhani,Orbitron,sans-serif" font-size="' + topFontSize + '" font-weight="700" opacity="' + topAlpha + '">' + Number(op.nettoTon || 0).toFixed(2) + 't</text>';
        if (prevTop) {
          var idle = Number(op.durations && op.durations.idleLoss || 0) || 0;
          if (idle > 0) {
            var x2 = x + barW / 2;
            var y2 = stackTop;
            var pathId = 'i71_idle_path_' + idleIdx;
            idleLineSvg +=
              '<path id="' + pathId + '" d="M ' + prevTop.x + ' ' + prevTop.y + ' L ' + x2 + ' ' + y2 + '" stroke="rgba(245,158,11,.95)" stroke-width="2.2" fill="none" filter="drop-shadow(0 0 6px rgba(245,158,11,.55))" stroke-dasharray="6 4" style="animation:i71IdleDraw .66s ease-out ' + (300 + idx * 55) + 'ms both;"/>' +
              '<circle cx="' + prevTop.x + '" cy="' + prevTop.y + '" r="3.2" fill="#f59e0b" filter="drop-shadow(0 0 5px rgba(245,158,11,.65))" style="animation:i71DotPop .4s ease-out ' + (420 + idx * 55) + 'ms both;"/>' +
              '<circle cx="' + x2 + '" cy="' + y2 + '" r="3.2" fill="#f59e0b" filter="drop-shadow(0 0 5px rgba(245,158,11,.65))" style="animation:i71DotPop .4s ease-out ' + (460 + idx * 55) + 'ms both;"/>' +
              '<text x="' + ((prevTop.x + x2) / 2) + '" y="' + ((prevTop.y + y2) / 2 - 8) + '" text-anchor="middle" fill="#fbbf24" font-family="Rajdhani,Orbitron,sans-serif" font-size="11" font-weight="700">Idle ' + Math.round(idle) + 'm</text>';
            idleIdx++;
          }
        }
        prevTop = { x: xByMin(op.endMin), y: stackTop };
      });
      var hourLabels = '';
      for (var hL = 0; hL <= 24; hL++) {
        var xx = xByMin(hL * 60);
        hourLabels += '<text x="' + xx + '" y="' + (margin.top + plotH + 60) + '" text-anchor="middle" fill="#7dd3fc" font-family="Orbitron,Rajdhani,sans-serif" font-size="10" font-weight="700">' + i71Pad2(hL) + '</text>';
      }
      var svgHtml =
        '<svg width="' + totalSvgW + '" height="' + svgH + '" viewBox="0 0 ' + totalSvgW + ' ' + svgH + '" xmlns="http://www.w3.org/2000/svg">' +
        '<defs>' + gradDefs + sheenDef + '</defs>' +
        '<rect x="0" y="0" width="' + totalSvgW + '" height="' + svgH + '" fill="transparent"/>' +
        gridSvg +
        idleLineSvg +
        barsSvg +
        hourLabels +
        '</svg>';
      stepPerOpWrap.style.height = '430px';
      stepPerOpWrap.innerHTML = '<div style="position:relative;min-width:' + totalSvgW + 'px">' + svgHtml + '<div class="i71-stepop-tooltip" id="i71_stepop_tip"></div></div>';
      if (stepPerOpCanvas && stepPerOpCanvas.parentNode) {
        stepPerOpCanvas.style.display = 'none';
      }
      var tip = document.getElementById('i71_stepop_tip');
      var svg = stepPerOpWrap.querySelector('svg');
      if (svg && tip) {
        ops.forEach(function(op) {
          var x = xByMin(op.startMin);
          var payload = [
            'Nopol: ' + op.nopol,
            'Jenis Truck: ' + (String(op.truckType || '').trim() ? i71TruckTypeLabel(op.truckType) : '-'),
            'Jumlah Kuli: ' + (op.crewCount == null ? '-' : Number(op.crewCount)),
            'Durasi total: ' + Math.round(op.totalDurasi || 0) + ' m',
            'PB Sampai→Start: ' + Math.round(op.durations.pbSampaiStart || 0) + ' m',
            'PB Start→Hold: ' + Math.round(op.durations.pbStartHold || 0) + ' m',
            'PB Hold→Restart: ' + Math.round(op.durations.pbHoldRestart || 0) + ' m',
            'PB Restart→Finish: ' + Math.round(op.durations.pbRestartFinish || 0) + ' m',
            'Tilting Start→Finish: ' + Math.round(op.durations.pbWindowTilting || 0) + ' m'
          ].join('<br/>');
          var hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          hit.setAttribute('x', x - 18);
          hit.setAttribute('y', margin.top);
          hit.setAttribute('width', 36);
          hit.setAttribute('height', plotH);
          hit.setAttribute('fill', 'transparent');
          hit.style.cursor = 'pointer';
          hit.addEventListener('mousemove', function(ev) {
            var rect = stepPerOpWrap.getBoundingClientRect();
            tip.style.left = (ev.clientX - rect.left + stepPerOpWrap.scrollLeft) + 'px';
            tip.style.top = (ev.clientY - rect.top + stepPerOpWrap.scrollTop - 8) + 'px';
            tip.innerHTML = payload;
            tip.style.opacity = '1';
          });
          hit.addEventListener('mouseleave', function() { tip.style.opacity = '0'; });
          svg.appendChild(hit);
        });
      }
      var lg = document.getElementById('i71_step_per_op_legend');
      if (lg) {
        var stepLegend = stepDefs.map(function(sd, idx) {
          return '<span class="i71-stepop-legend-item"><span class="i71-stepop-legend-swatch" style="background:linear-gradient(145deg,' + sd.c1 + ',' + sd.c2 + ')"></span>' + sd.label + '</span>';
        }).join('');
        var truckLegend = [
          { label: 'Truck: Gandeng', color: '#38bdf8' },
          { label: 'Truck: Tronton', color: '#a78bfa' },
          { label: 'Truck: Trailer Dump', color: '#22d3ee' },
          { label: 'Truck: Dump Truck', color: '#34d399' },
          { label: 'Idle Loss Line', color: '#f59e0b' }
        ].map(function(it) {
          return '<span class="i71-stepop-legend-item"><span class="i71-stepop-legend-swatch" style="background:' + it.color + '"></span>' + it.label + '</span>';
        }).join('');
        lg.innerHTML = '<div class="i71-stepop-legend-row">' + stepLegend + '</div><div class="i71-stepop-legend-row">' + truckLegend + '</div>';
      }
    }
  }

  function i71Render(dateYmd) {
    // Hard guard: setiap render wajib sinkron ke tanggal aktif dari allRows.
    if (i71State.allRows && i71State.allRows.length) {
      i71State.rows = i71FilterByDate(dateYmd);
    }
    var daySlices = i71BuildWindowRows(dateYmd);
    var dayRows = daySlices.map(function(x) { return x.row; });
    var ops = daySlices.map(function(slc) {
      return {
        nopol: slc.nopol || '-',
        startMin: slc.startMin,
        endMin: slc.endMin,
        netto: slc.netto || 0,
        type: slc.type
      };
    });
    var res = i71Analyze(ops);
    var stepPerOps = i71BuildStepPerOperation(daySlices);
    var stepStats = i71BuildStepStatsFromOps(stepPerOps);
    var matInfoEl = document.getElementById('i71_material_info');
    if (matInfoEl) {
      var matMap = {};
      dayRows.forEach(function(r) {
        var mat = String(i71GetCol(r, 'MATERIAL') || '-').trim();
        if (!mat) mat = '-';
        var s = i71TimeToMinutes(i71RowStart(r));
        var e = i71TimeToMinutes(i71RowFinish(r));
        if (!matMap[mat]) matMap[mat] = { start: null, end: null, total: 0, count: 0 };
        if (s != null && e != null && e >= s) {
          matMap[mat].start = matMap[mat].start == null ? s : Math.min(matMap[mat].start, s);
          matMap[mat].end = matMap[mat].end == null ? e : Math.max(matMap[mat].end, e);
          matMap[mat].total += (e - s);
          matMap[mat].count++;
        }
      });
      var mats = Object.keys(matMap);
      if (!mats.length) {
        matInfoEl.innerHTML = '<b>Material:</b> -';
      } else if (mats.length === 1) {
        var only = mats[0];
        var one = matMap[only];
        matInfoEl.innerHTML =
          '<div><b>Material:</b> FULL ' + only + '</div>' +
          '<div><b>Rentang:</b> ' + i71FormatHourRange(one.start, one.end) + '</div>' +
          '<div><b>Durasi:</b> ' + i71FormatMinutes(one.total) + '</div>';
      } else {
        matInfoEl.innerHTML = mats.map(function(m) {
          var x = matMap[m];
          return '<div><b>' + m + ':</b> ' + i71FormatHourRange(x.start, x.end) + ' (' + i71FormatMinutes(x.total) + ')</div>';
        }).join('');
      }
    }

    var kpi = document.getElementById('i71_kpi_grid');
    if (kpi) {
      kpi.innerHTML =
        '<div class="i71-kpi-card"><div class="i71-kpi-label">Total Operasi</div><div class="i71-kpi-value">' + res.totalOperations + '</div></div>' +
        '<div class="i71-kpi-card"><div class="i71-kpi-label">Active Time</div><div class="i71-kpi-value">' + res.activeTime.formatted + '</div></div>' +
        '<div class="i71-kpi-card"><div class="i71-kpi-label">Downtime</div><div class="i71-kpi-value">' + res.downtime.formatted + '</div></div>' +
        '<div class="i71-kpi-card"><div class="i71-kpi-label">Utilization</div><div class="i71-kpi-value">' + res.utilization.toFixed(1) + '%</div></div>' +
        '<div class="i71-kpi-card"><div class="i71-kpi-label">Merged Period</div><div class="i71-kpi-value">' + res.activeTime.mergedPeriods + '</div></div>';
    }

    var sum = document.getElementById('i71_summary_text');
    if (sum) {
      sum.textContent = dateYmd + ' | Netto ' + fmtNum(res.totalNetto) + ' kg | Overlap period: ' + res.overlappingPeriods.length +
        ' | Data invalid: ' + res.invalidCount + ' | Data dilewati: ' + res.skippedCount;
    }

    var ovBody = document.getElementById('i71_overlap_body');
    if (ovBody) {
      if (!res.overlappingPeriods.length) {
        ovBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:16px;">Tidak ada overlap di tanggal ini.</td></tr>';
      } else {
        ovBody.innerHTML = res.overlappingPeriods.map(function(o) {
          return '<tr>' +
            '<td>' + i71MinToTime(o.start) + '</td>' +
            '<td>' + i71MinToTime(o.end) + '</td>' +
            '<td>' + o.duration + ' mnt</td>' +
            '<td>' + o.operationCount + '</td>' +
            '<td>' + o.nopols.join(', ') + '</td>' +
          '</tr>';
        }).join('');
      }
    }

    var stepExplain = document.getElementById('i71_step_explain');
    if (stepExplain) {
      var totalStep24 = stepStats.rows.reduce(function(s, r) { return s + (Number(r.total) || 0); }, 0);
      stepExplain.innerHTML = stepStats.rows.map(function(r) {
        var totalText = Number(r.total || 0).toFixed(1) + ' menit';
        var tolText = Number(r.toleransiMenit || 0).toFixed(1) + ' menit';
        var overText = Number(r.breakdownMenit || 0).toFixed(1) + ' menit';
        var causes = Object.keys(r.explainScaled || {}).map(function(k) { return { k: k, v: r.explainScaled[k] }; })
          .sort(function(a, b) { return b.v - a.v; })
          .slice(0, 2)
          .map(function(x) { return x.k + ' (' + Number(x.v).toFixed(1) + 'm)'; })
          .join(' • ');
        if (!causes) causes = 'Tidak ada over toleransi / tidak ada keterangan';
        return '<div class="i71-step-item">' +
          '<div class="i71-step-head"><strong>' + r.label + '</strong></div>' +
          '<div class="i71-step-meta">Total: <b>' + totalText + '</b> | Masuk toleransi: <b>' + tolText + '</b> | Breakdown: <b>' + overText + '</b></div>' +
          '<div class="i71-step-cause">' + causes + '</div>' +
        '</div>';
      }).join('') + '<div class="i71-step-item"><div class="i71-step-meta"><b>Total akumulasi 24 jam:</b> ' + Number(totalStep24).toFixed(1) + ' menit</div></div>';
    }

    i71RenderCharts(res, stepStats, stepPerOps, dateYmd);
  }

  window.loadIntake71Page = function() {
    var dateEl = document.getElementById('i71_date');
    if (!dateEl) return;
    var today = i71TodayWib();
    if (!dateEl.value) dateEl.value = today;
    if (!i71State.selectedDate) i71State.selectedDate = dateEl.value;
    if (!i71State.calendarMonth) i71State.calendarMonth = i71MonthKey(i71State.selectedDate) || i71MonthKey(today);

    var monthPrev = document.getElementById('i71_cal_prev');
    var monthNext = document.getElementById('i71_cal_next');
    if (!i71State.loaded) {
      i71State.loaded = true;
      function i71ApplyAllRowsAndRender(resp, selectedDate) {
        if (!resp || resp.status === 'error') {
          toast('Gagal memuat data Intake 71', 'e');
          return;
        }
        var parsedRows = i71RowsFromApiPayload(resp.data);
        i71State.allRows = parsedRows.filter(function(r) {
          var t = i71RowType(r);
          return t === 'manual' || t === 'tilting';
        });
        var targetDate = selectedDate || i71State.selectedDate || today;
        if (!i71State.allRows.some(function(r) { return i71RowDateYmd(r) === targetDate; })) {
          var dates = i71State.allRows.map(i71RowDateYmd).filter(Boolean).sort();
          if (dates.length) targetDate = dates[dates.length - 1];
        }
        i71State.selectedDate = targetDate;
        if (dateEl) dateEl.value = targetDate;
        i71State.calendarMonth = i71MonthKey(i71State.selectedDate) || i71MonthKey(today);
        i71State.rows = i71FilterByDate(i71State.selectedDate);
        i71RenderCalendar();
        i71Render(i71State.selectedDate);
      }

      dateEl.addEventListener('change', function() {
        i71State.selectedDate = dateEl.value || today;
        i71State.calendarMonth = i71MonthKey(i71State.selectedDate);
        i71State.rows = i71FilterByDate(i71State.selectedDate);
        i71RenderCalendar();
        i71Render(i71State.selectedDate);
      });
      if (monthPrev) {
        monthPrev.addEventListener('click', function() {
          var p = i71State.calendarMonth.split('-');
          var d = new Date(Number(p[0]), Number(p[1]) - 2, 1);
          i71State.calendarMonth = d.getFullYear() + '-' + i71Pad2(d.getMonth() + 1);
          i71RenderCalendar();
        });
      }
      if (monthNext) {
        monthNext.addEventListener('click', function() {
          var p = i71State.calendarMonth.split('-');
          var d = new Date(Number(p[0]), Number(p[1]), 1);
          i71State.calendarMonth = d.getFullYear() + '-' + i71Pad2(d.getMonth() + 1);
          i71RenderCalendar();
        });
      }
      fetchAPI('getBongkarHistory', { limit: 5000 }, function(resp) {
        i71ApplyAllRowsAndRender(resp, i71State.selectedDate);
      });
      return;
    }
    if ((!i71State.allRows || !i71State.allRows.length) && !i71State._reloadingAllRows) {
      i71State._reloadingAllRows = true;
      fetchAPI('getBongkarHistory', { limit: 5000 }, function(resp) {
        i71State._reloadingAllRows = false;
        if (resp && resp.status !== 'error') {
          i71State.allRows = i71RowsFromApiPayload(resp.data).filter(function(r) {
            var t = i71RowType(r);
            return t === 'manual' || t === 'tilting';
          });
          i71State.rows = i71FilterByDate(i71State.selectedDate || dateEl.value || today);
          i71RenderCalendar();
          i71Render(i71State.selectedDate || dateEl.value || today);
        } else {
          toast('Gagal memuat data Intake 71', 'e');
        }
      });
      return;
    }
    i71State.rows = i71FilterByDate(i71State.selectedDate || dateEl.value);
    i71RenderCalendar();
    i71Render(i71State.selectedDate || dateEl.value);
  };
})();
