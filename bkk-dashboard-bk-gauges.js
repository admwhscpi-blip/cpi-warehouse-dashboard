// BK cards + semicircle gauge (speedometer). Depends: $, fmtNum, pbarClass, ageClass, appState, navigateTo, b_bk_id
(function() {
  var GAUGE_R = 68;
  var arcLen = Math.PI * GAUGE_R;

  function gaugeZone(pct) {
    if (pct == null) return 'lo';
    return pct > 85 ? 'hi' : pct > 60 ? 'mi' : 'lo';
  }

  function buildGaugeSvg(pctDisplay, gradId) {
    var gid = gradId || 'def';
    var z = gaugeZone(pctDisplay);
    return (
      '<svg class="bk-gauge-svg" viewBox="0 0 200 108" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="bkGaugeGrad-' + gid + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#6366f1"/>' +
      '</linearGradient></defs>' +
      '<path class="bk-gauge-track" d="M 32 88 A ' + GAUGE_R + ' ' + GAUGE_R + ' 0 0 1 168 88" fill="none" stroke="rgba(148,163,184,0.25)" stroke-width="12" stroke-linecap="round"/>' +
      '<path class="bk-gauge-arc bk-gauge-arc--' + z + '" d="M 32 88 A ' + GAUGE_R + ' ' + GAUGE_R + ' 0 0 1 168 88" fill="none" stroke-width="12" stroke-linecap="round" ' +
      'stroke-dasharray="' + arcLen + '" stroke-dashoffset="' + arcLen + '" style="transition:stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)"/>' +
      '</svg>' +
      '<div class="bk-gauge-readout">' +
      '<span class="bk-gauge-pct" data-target-pct="' + Math.min(pctDisplay, 999) + '">0</span>' +
      '<span class="bk-gauge-suffix">%</span>' +
      '<div class="bk-gauge-label">utilisasi</div>' +
      '</div>'
    );
  }

  function escMini(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function runPctCounter(el, target) {
    if (!el) return;
    var dur = 1100;
    var start = Date.now();
    function tick() {
      var t = Math.min((Date.now() - start) / dur, 1);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmtNum(Math.round(e * target * 10) / 10);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function dashNormalizeBkId_(raw) {
    var id = String(raw == null ? '' : raw).trim();
    if (!id) return '';
    if (/^BK-\d+$/i.test(id)) return 'BK-' + id.replace(/^BK-/i, '').replace(/^BK/i, '');
    var m = id.match(/^BK(\d+)$/i);
    if (m) return 'BK-' + m[1];
    return id;
  }

  function dashBkRowValidForCard_(bk) {
    var id = dashNormalizeBkId_(bk.BK_ID);
    if (!/^BK-\d+$/.test(id)) return false;
    if (/^BK_ID$/i.test(String(bk.BK_ID || '').trim())) return false;
    return true;
  }

  function dashBkNumKey_(bkId) {
    var m = String(bkId).match(/^BK-(\d+)$/);
    return m ? parseInt(m[1], 10) : 9999;
  }

  /** Satu kartu per BK_ID; beberapa baris master (material ke-2) → beberapa slot vertikal. */
  function groupDashBkSlots_(rows) {
    rows = rows || [];
    var order = [];
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var bk = rows[i];
      if (!dashBkRowValidForCard_(bk)) continue;
      var id = dashNormalizeBkId_(bk.BK_ID);
      if (!seen[id]) {
        seen[id] = [];
        order.push(id);
      }
      seen[id].push(bk);
    }
    order.sort(function(a, b) {
      return dashBkNumKey_(a) - dashBkNumKey_(b);
    });
    return order.map(function(id) {
      return { bkId: id, slots: seen[id] };
    });
  }

  function buildSlotBodyHtml_(bk, titleLine, gradId, showSupplier) {
    var pct = bk.KAPASITAS_KG ? (Number(bk.STOK_AKTIF) / Number(bk.KAPASITAS_KG)) * 100 : 0;
    var pctClamped = Math.min(Math.max(pct, 0), 100);
    var ageDays = typeof bkUmurAbsolutHari === 'function' ? bkUmurAbsolutHari(bk.AWAL_ISI_YMD) : 0;
    var ageCls = ageClass(ageDays) || 'cm';
    var matLabel = escMini((bk.MATERIAL_DEFAULT || bk.MATERIAL || '').trim()) || '—';
    var sup = escMini((bk.SUPPLIER_DEFAULT || bk.SUPPLIER_DEF || '').trim());
    var subMat = showSupplier && sup ? '<span class="bk-supplier" title="' + sup + '">' + sup + '</span>' : '';
    return (
      '<div class="bk-card-head">' +
      '<div class="bk-head-main">' +
      '<span class="bk-id">' + escMini(titleLine) + '</span>' +
      '<span class="bk-material" title="' + matLabel + '">' + matLabel + '</span>' +
      subMat +
      '</div>' +
      '<span class="bk-age ' + ageCls + '" title="Umur absolut (hari ini − AWAL ISI)">' +
      '<i class="fas fa-clock"></i> ' + ageDays + ' <span class="bk-age-unit">hr</span></span>' +
      '</div>' +
      '<div class="bk-gauge-wrap">' + buildGaugeSvg(pctClamped, gradId) + '</div>' +
      '<div class="bk-card-foot">' +
      '<div class="bk-stat-row">' +
      '<span class="bk-val">' + fmtNum(bk.STOK_AKTIF) + '</span><span class="bk-stat-unit">kg</span>' +
      '<span class="bk-stat-sep">/</span>' +
      '<span class="bk-cap">' + fmtNum(bk.KAPASITAS_KG) + '</span><span class="bk-stat-unit">kg</span>' +
      '</div>' +
      '<div class="bk-card-meta">' + fmtNum(pct) + '% slot terpakai</div>' +
      '</div>'
    );
  }

  window.renderBKCards = function() {
    var grid = $('bkGrid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.classList.add('bk-grid--dash');

    var groups = groupDashBkSlots_(appState.dashData || []);
    var uid = 0;

    groups.forEach(function(group) {
      var slots = group.slots;
      var div = document.createElement('div');
      var isSplit = slots.length > 1;
      div.className = 'bk-card bk-card--3d' + (isSplit ? ' bk-card--split' : '');
      div.setAttribute('data-bk-id', group.bkId);

      var glare = '<div class="bk-card-glare"></div>';
      var body;
      if (!isSplit) {
        body = buildSlotBodyHtml_(slots[0], group.bkId, 's' + uid++, false);
      } else {
        var parts = [];
        for (var si = 0; si < slots.length; si++) {
          var letter = String.fromCharCode(65 + si);
          var title = group.bkId + ' (' + letter + ')';
          if (si > 0) parts.push('<div class="bk-card-slot-split" aria-hidden="true"></div>');
          parts.push(
            '<div class="bk-card-slot">' +
            buildSlotBodyHtml_(slots[si], title, 's' + uid++ + '_' + si, true) +
            '</div>'
          );
        }
        body = parts.join('');
      }

      div.innerHTML = glare + body;

      div.addEventListener('click', function() {
        var leg = $('b_bk_id');
        var bw = $('bw_bk_id');
        if (leg) {
          leg.value = group.bkId;
          leg.dispatchEvent(new Event('change'));
        }
        if (bw) {
          bw.value = group.bkId;
          bw.dispatchEvent(new Event('change'));
        }
        navigateTo('bongkar');
      });
      grid.appendChild(div);
    });
  };

  function runOneArc(path) {
    var wrap = path.closest('.bk-gauge-wrap');
    if (!wrap || wrap.dataset.animated) return;
    wrap.dataset.animated = '1';
    var card = wrap.closest('.bk-card');
    var pctEl = card ? card.querySelector('.bk-gauge-pct') : null;
    var target = pctEl ? parseFloat(pctEl.getAttribute('data-target-pct')) || 0 : 0;
    var offset = arcLen * (1 - Math.min(target, 100) / 100);
    requestAnimationFrame(function() {
      path.style.strokeDashoffset = String(offset);
    });
    if (pctEl) runPctCounter(pctEl, target);
  }

  window.initBKGaugeObservers = function() {
    var arcs = document.querySelectorAll('.bk-gauge-arc');
    if (!arcs.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      arcs.forEach(runOneArc);
      return;
    }
    var io = new IntersectionObserver(
      function(entries) {
        entries.forEach(function(en) {
          if (!en.isIntersecting) return;
          runOneArc(en.target);
          io.unobserve(en.target);
        });
      },
      { threshold: 0.15 }
    );
    arcs.forEach(function(p) {
      io.observe(p);
    });
  };
})();

