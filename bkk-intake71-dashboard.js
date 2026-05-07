(function() {
  var i71State = {
    loaded: false,
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

  function i71GetCol(row, key) {
    if (!row) return '';
    if (row[key] != null && row[key] !== '') return row[key];
    var lo = key.toLowerCase();
    if (row[lo] != null && row[lo] !== '') return row[lo];
    return '';
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
    var raw = i71GetCol(row, 'TANGGAL');
    var ymd = typeof dashDateToYMD === 'function' ? dashDateToYMD(raw) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    var s = String(raw || '').trim();
    return s.length >= 10 ? s.slice(0, 10) : '';
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
    if (s == null || e == null || e < s) return null;
    return e - s;
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
    i71State.rows.forEach(function(r) {
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
        i71State.selectedDate = sel;
        var dateEl = document.getElementById('i71_date');
        if (dateEl) dateEl.value = sel;
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
      var startMin = i71TimeToMinutes(op.start);
      var endMin = i71TimeToMinutes(op.finish);
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

  function i71RenderCharts(res, stepStats) {
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
            y: { beginAtZero: true, ticks: { color: '#334155' }, grid: { color: withAlpha('#64748b', 0.18) } },
            y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#dc2626' } },
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
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#334155',
                usePointStyle: true,
                boxWidth: 8,
                filter: function(item) { return item.text !== '_shadow'; }
              }
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#334155' }, grid: { color: withAlpha('#64748b', 0.16) } },
            y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#6d28d9' } },
            x: { ticks: { color: '#334155', maxRotation: 0, autoSkip: false, callback: function(v, idx) { return idx % 3 === 0 || idx === 24 ? timelineLabels[idx] : ''; } }, grid: { display: false } }
          }
        },
        plugins: [timelineLabelPlugin]
      });
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
          scales: { x: { beginAtZero: true } }
        }
      });
    }
  }

  function i71Render(dateYmd) {
    var dayRows = i71State.rows.filter(function(r) { return i71RowDateYmd(r) === dateYmd; });
    var ops = dayRows.map(function(r) {
      return {
        nopol: i71GetCol(r, 'NO_POLISI') || '-',
        start: i71RowStart(r),
        finish: i71RowFinish(r),
        netto: i71GetCol(r, 'NETTO_KG') || 0,
        type: i71RowType(r)
      };
    });
    var res = i71Analyze(ops);
    var stepStats = i71ComputeStepStats(dayRows);
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

    i71RenderCharts(res, stepStats);
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
      dateEl.addEventListener('change', function() {
        i71State.selectedDate = dateEl.value || today;
        i71State.calendarMonth = i71MonthKey(i71State.selectedDate);
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
      fetchAPI('getBongkarHistory', {}, function(resp) {
        if (resp.status === 'error') {
          toast('Gagal memuat data Intake 71', 'e');
          return;
        }
        i71State.rows = (resp.data || []).filter(function(r) {
          var t = i71RowType(r);
          return t === 'manual' || t === 'tilting';
        });
        if (!i71State.rows.some(function(r) { return i71RowDateYmd(r) === i71State.selectedDate; })) {
          var dates = i71State.rows.map(i71RowDateYmd).filter(Boolean).sort();
          if (dates.length) i71State.selectedDate = dates[dates.length - 1];
          dateEl.value = i71State.selectedDate;
          i71State.calendarMonth = i71MonthKey(i71State.selectedDate);
        }
        i71RenderCalendar();
        i71Render(i71State.selectedDate);
      });
      return;
    }
    i71RenderCalendar();
    i71Render(i71State.selectedDate || dateEl.value);
  };
})();
