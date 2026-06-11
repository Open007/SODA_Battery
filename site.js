(function () {
  const THEME_KEY = 'soda-theme';
  const DEFAULT_API_ORIGIN = 'http://sulingzhi.com:10031';
  const API_ORIGIN = (window.SODA_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
  const API_TIMEOUT_MS = 20000;
  const CHART_POINT_LIMIT = 100000;
  const CHART_LINE_OPACITY = .65;
  const CHART_HOVER_DIM_OPACITY = .28;
  const COLORS = ['#2563eb','#16a34a','#d97706','#e11d48','#7c3aed','#0891b2','#ca8a04','#db2777'];
  const hoverRestoreCharts = new WeakSet();

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.textContent = theme === 'dark' ? '☾' : '☀';
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
    });
  }

  function initTheme() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
    document.querySelectorAll('.theme-toggle').forEach(button => {
      const toggle = () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, nextTheme);
        applyTheme(nextTheme);
      };
      button.addEventListener('click', toggle);
      button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  function headerOffset() {
    const header = document.querySelector('nav.top');
    return Math.ceil(header ? header.getBoundingClientRect().height : 0) + 12;
  }

  function samePageHash(link) {
    const href = link.getAttribute('href');
    if (!href || href === '#' || !href.includes('#')) return '';
    const url = new URL(href, window.location.href);
    if (url.pathname !== window.location.pathname || url.origin !== window.location.origin) return '';
    return url.hash;
  }

  function targetForHash(hash) {
    if (!hash || hash === '#') return null;
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  }

  function setActiveHash(hash) {
    document.querySelectorAll('nav.top .nav-links a').forEach(link => {
      const linkHash = samePageHash(link);
      if (linkHash) link.classList.toggle('active', linkHash === hash);
    });
  }

  function scrollToHash(hash, options = {}) {
    const target = targetForHash(hash);
    if (!target) return false;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - headerOffset());
    window.scrollTo({ top, behavior: options.behavior || 'smooth' });
    if (options.updateHistory !== false && window.location.hash !== hash) {
      history.pushState(null, '', hash);
    }
    setActiveHash(hash);
    return true;
  }

  function initHashNavigation(selector) {
    document.querySelectorAll(selector).forEach(link => {
      link.addEventListener('click', event => {
        const hash = samePageHash(link);
        if (!targetForHash(hash)) return;
        event.preventDefault();
        scrollToHash(hash);
      });
    });

    if (window.location.hash) {
      window.requestAnimationFrame(() => {
        scrollToHash(window.location.hash, { behavior: 'auto', updateHistory: false });
      });
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      if (!window.location.hash) return;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        scrollToHash(window.location.hash, { behavior: 'auto', updateHistory: false });
      }, 120);
    });
  }

  async function apiFetch(path, fallback) {
    try {
      if (!String(path).startsWith('/api/')) {
        throw new Error(`invalid API path: ${path}`);
      }
      const url = new URL(path, API_ORIGIN);
      const r = await fetch(url, {signal: AbortSignal.timeout(API_TIMEOUT_MS)});
      if (!r.ok) {
        let message = String(r.status);
        try {
          const data = await r.json();
          message = data.message || data.error || message;
        } catch (error) {
          // Keep the status code as the useful fallback.
        }
        throw new Error(message);
      }
      return await r.json();
    } catch (error) {
      if (fallback !== undefined) return typeof fallback === 'function' ? fallback() : fallback;
      throw error;
    }
  }

  function setApiBadge(badge, statusPayload) {
    if (!badge) return;
    if (!statusPayload) {
      badge.textContent = 'Server Offline';
      badge.className = 'api-badge err';
      return;
    }
    badge.textContent = 'Server Online';
    badge.className = 'api-badge ok';
  }

  function cssVar(name, fallback = '') {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function formatChartTick(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const abs = Math.abs(number);
    if (abs >= 100) return String(Math.round(number));
    if (abs >= 10) return number.toFixed(1);
    if (abs >= 1) return number.toFixed(2);
    if (abs === 0) return '0.00';
    return number.toPrecision(3);
  }

  function normalChartFontSize() {
    return parseFloat(cssVar('--fs-note', '12')) || 12;
  }

  function yTickLabelOptions({ show = true, textSoft, fontSize, fontFamily }) {
    return {
      show,
      color: textSoft,
      fontSize,
      fontFamily,
      margin: 2,
      formatter: value => `{tick|${formatChartTick(value)}}`,
      rich: {
        tick: {
          width: Math.max(32, Math.round(fontSize * 2.55)),
          align: 'left',
          color: textSoft,
          fontSize,
          fontFamily
        }
      }
    };
  }

  function chartLayout() {
    const fontSize = normalChartFontSize();
    return {
      fontSize,
      grid: {
        left: 36,
        right: 12,
        top: 8,
        bottom: 40
      },
      xNameGap: 24
    };
  }

  function finiteExtent(values) {
    let min = Infinity;
    let max = -Infinity;
    let found = false;
    for (const value of values) {
      const number = Number(value);
      if (!Number.isFinite(number)) continue;
      found = true;
      if (number < min) min = number;
      if (number > max) max = number;
    }
    if (!found) return null;
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.05, 1);
      min -= pad;
      max += pad;
    }
    return { min, max };
  }

  function seriesExtent(series, field) {
    const values = [];
    series.forEach(item => {
      (item.data?.[field] || []).forEach(value => {
        values.push(value);
      });
    });
    return finiteExtent(values);
  }

  function axisInterval(min, max, divisions) {
    const span = max - min;
    return Number.isFinite(span) && span > 0 ? span / divisions : undefined;
  }

  function legendViewportHeight(fontSize, chartElement) {
    const lineHeight = Math.max(1, Math.round(fontSize + 4));
    const chartHeight = chartElement?.getBoundingClientRect?.().height || 0;
    const targetLines = chartHeight > 0
      ? Math.max(5, Math.round((chartHeight / 3) / lineHeight))
      : 5;
    return lineHeight * targetLines;
  }

  function truncateLegendName(name) {
    const value = String(name || '');
    return value.length > 24 ? `${value.slice(0, 23)}...` : value;
  }

  function axisLabel(label, unit) {
    const cleanLabel = String(label || '').trim();
    const cleanUnit = String(unit || '').trim();
    if (!cleanLabel) return cleanUnit;
    return cleanUnit ? `${cleanLabel} (${cleanUnit})` : cleanLabel;
  }

  function seriesPointCount(series) {
    return series.reduce((total, item) => {
      const xs = item.data?.cycles || [];
      const ys = item.data?.values || [];
      return total + Math.min(xs.length, ys.length);
    }, 0);
  }

  function limitSeriesForDisplay(series, maxPoints = CHART_POINT_LIMIT) {
    const pointLimit = Number.isFinite(Number(maxPoints)) && Number(maxPoints) > 0
      ? Number(maxPoints)
      : CHART_POINT_LIMIT;
    const totalPoints = seriesPointCount(series);
    if (totalPoints <= pointLimit) return series;
    const stride = Math.ceil(totalPoints / pointLimit);
    let cursor = 0;
    return series.map(item => {
      const xs = item.data?.cycles || [];
      const ys = item.data?.values || [];
      const cycles = [];
      const values = [];
      const pointCount = Math.min(xs.length, ys.length);
      for (let i = 0; i < pointCount; i += 1) {
        if (cursor % stride === 0) {
          cycles.push(xs[i]);
          values.push(ys[i]);
        }
        cursor += 1;
      }
      return {
        ...item,
        data: {
          ...item.data,
          cycles,
          values,
          n_display_points: cycles.length,
          display_decimated: true,
          display_stride: stride,
        },
      };
    }).filter(item => (item.data?.cycles || []).length && (item.data?.values || []).length);
  }

  function bindChartHoverRestore(chart) {
    if (!chart || hoverRestoreCharts.has(chart)) return;
    const restore = () => {
      try {
        chart.dispatchAction({ type: 'downplay' });
      } catch (error) {
        // Ignore stale chart instances during resize or theme redraws.
      }
    };
    chart.on('globalout', restore);
    chart.on('mouseout', params => {
      if (!params || params.componentType === 'series') restore();
    });
    hoverRestoreCharts.add(chart);
  }

  function lineSeriesOption({
    name,
    data,
    color,
    symbol = 'circle',
    symbolSize = 4,
    itemOpacity = 0,
    hoverItemOpacity = itemOpacity,
    blurItemOpacity = itemOpacity,
    lineWidth = 1.5,
    lineOpacity = CHART_LINE_OPACITY,
  }) {
    return {
      name,
      type: 'line',
      data,
      triggerLineEvent: true,
      showSymbol: true,
      symbol,
      symbolSize,
      smooth: false,
      itemStyle: { color, opacity: itemOpacity },
      lineStyle: { color, width: lineWidth, opacity: lineOpacity },
      blur: {
        itemStyle: { opacity: blurItemOpacity },
        lineStyle: { opacity: CHART_HOVER_DIM_OPACITY, width: lineWidth }
      },
      emphasis: {
        focus: 'series',
        itemStyle: { opacity: hoverItemOpacity },
        lineStyle: { opacity: 1, width: 2 }
      },
      progressive: 5000
    };
  }

  function scrollLegendOption({
    data,
    chartElement,
    fontSize,
    panelVar = '--panel',
    itemHeight = 2,
    selectedMode,
  }) {
    const option = {
      show: data.length > 0,
      type: 'scroll',
      orient: 'vertical',
      data,
      right: 0,
      top: 0,
      height: legendViewportHeight(fontSize, chartElement),
      width: 168,
      backgroundColor: cssVar(panelVar, '#ffffff'),
      borderColor: cssVar('--line', '#d9d9d9'),
      borderWidth: .6,
      padding: [5, 8],
      itemWidth: 20,
      itemHeight,
      itemGap: 4,
      pageIconColor: cssVar('--text', '#2b2b2b'),
      pageIconInactiveColor: cssVar('--line', '#d9d9d9'),
      pageTextStyle: { color: cssVar('--text-soft', '#666666'), fontSize },
      textStyle: { color: cssVar('--text', '#2b2b2b'), fontFamily: "'Source Serif 4', Georgia, serif", fontSize },
      formatter: truncateLegendName
    };
    if (selectedMode !== undefined) option.selectedMode = selectedMode;
    return option;
  }

  function chartBaseOption({
    xAxisLabel,
    yAxisLabel,
    xmin = 0,
    xmax = 1,
    ymin = 0,
    ymax = 1,
    message = '',
    showLabels = true,
    colors = COLORS,
    yDivisions = 5,
    panelVar = '--panel',
    tooltipFormatter,
  }) {
    const { fontSize, grid, xNameGap } = chartLayout();
    const text = cssVar('--text', '#2b2b2b');
    const textSoft = cssVar('--text-soft', '#666666');
    const line = cssVar('--line', '#d9d9d9');
    const line2 = cssVar('--line-2', '#ededed');
    const panel = cssVar(panelVar, cssVar('--panel', '#ffffff'));
    const fontFamily = "'Source Serif 4', Georgia, serif";
    return {
      animation: false,
      backgroundColor: 'transparent',
      color: colors,
      textStyle: { fontFamily, color: text, fontSize },
      grid: {
        left: grid.left,
        right: grid.right,
        top: grid.top,
        bottom: grid.bottom,
        containLabel: false
      },
      tooltip: {
        show: !message,
        trigger: 'item',
        confine: true,
        appendToBody: true,
        backgroundColor: panel,
        borderColor: line,
        borderWidth: 1,
        textStyle: { color: text, fontFamily, fontSize },
        formatter(params) {
          if (tooltipFormatter) return tooltipFormatter(params);
          const item = Array.isArray(params) ? params[0] : params;
          if (!item) return '';
          const x = Number(item.value?.[0]);
          const y = Number(item.value?.[1]);
          return `${esc(xAxisLabel)} ${Number.isFinite(x) ? formatChartTick(x) : '-'}<br>${esc(item.seriesName)}: ${Number.isFinite(y) ? formatChartTick(y) : '-'}`;
        }
      },
      legend: { show: false },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', disabled: !showLabels }],
      xAxis: {
        type: 'value',
        min: xmin,
        max: xmax,
        interval: axisInterval(xmin, xmax, 4),
        name: showLabels ? xAxisLabel : '',
        nameLocation: 'middle',
        nameGap: xNameGap,
        nameTextStyle: { color: text, fontSize, fontFamily },
        axisLine: { show: showLabels, lineStyle: { color: text, width: 1.1 } },
        axisTick: { show: showLabels, lineStyle: { color: text, width: .8 }, length: 4 },
        axisLabel: { show: showLabels, color: textSoft, fontSize, fontFamily, formatter: value => Math.round(value) },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: ymin,
        max: ymax,
        interval: axisInterval(ymin, ymax, yDivisions),
        axisLine: { show: showLabels, lineStyle: { color: text, width: 1.1 } },
        axisTick: { show: showLabels, lineStyle: { color: text, width: .8 }, length: 4 },
        axisLabel: yTickLabelOptions({ show: showLabels, textSoft, fontSize, fontFamily }),
        splitLine: { show: showLabels, lineStyle: { color: line2, width: .8 } }
      },
      graphic: message ? [{
        type: 'text',
        left: 'center',
        top: 'middle',
        style: { text: message, fill: textSoft, fontFamily, fontSize }
      }] : [],
      series: []
    };
  }

  window.SodaSite = {
    init(options = {}) {
      initTheme();
      initHashNavigation(options.hashLinksSelector || 'nav.top .nav-links a[href*="#"], footer a[href*="#"]');
    },
    scrollToHash,
    apiFetch,
    setApiBadge,
    esc,
    chart: {
      axisLabel,
      chartBaseOption,
      cssVar,
      finiteExtent,
      legendViewportHeight,
      limitSeriesForDisplay,
      bindChartHoverRestore,
      lineSeriesOption,
      normalChartFontSize,
      scrollLegendOption,
      seriesExtent,
      truncateLegendName,
    },
    constants: {
      CHART_POINT_LIMIT,
      CHART_LINE_OPACITY,
      CHART_HOVER_DIM_OPACITY,
      COLORS,
    },
  };
}());
