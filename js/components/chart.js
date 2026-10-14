import { h } from '../utils/dom.js';
import { compact, MONTHS_SHORT } from '../utils/format.js';

// Highcharts is lazy loaded on the first chart; styledMode keeps colors in CSS (dark mode + strict CSP)
const VERSION = '11.4.8';
const SCRIPTS = [
  `https://cdn.jsdelivr.net/npm/highcharts@${VERSION}/highcharts.js`,
  `https://cdn.jsdelivr.net/npm/highcharts@${VERSION}/modules/accessibility.js`,
];

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('โหลดกราฟไม่สำเร็จ'));
    };
    document.head.append(script);
  });
}

function loadHighcharts() {
  if (!loading) {
    loading = SCRIPTS.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve())
      .then(() => {
        const H = window.Highcharts;
        H.setOptions({
          lang: { thousandsSep: ',', decimalPoint: '.', numericSymbols: ['K', 'M', 'B'] },
          credits: { enabled: false },
          accessibility: { enabled: true },
        });
        return H;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

// Pages repaint by replacing DOM, so charts whose container left the page are destroyed
function sweep(H) {
  H.charts.forEach((c) => { if (c && !c.renderTo.isConnected) c.destroy(); });
}

function mount(cls, height, label, build) {
  const el = h('div', { class: `chart-box ${cls}`, style: { '--h': height } }, h('p', { class: 'chart-loading muted' }, 'กำลังโหลดกราฟ...'));
  loadHighcharts().then((H) => {
    sweep(H);
    if (!el.isConnected) return;
    el.replaceChildren();
    H.chart(el, build());
  }, () => {
    el.replaceChildren(h('p', { class: 'chart-loading muted' }, `โหลดกราฟไม่สำเร็จ · ${label}`));
  });
  return el;
}

const baseChart = (type, label) => ({
  chart: { type, styledMode: true, spacing: [8, 4, 8, 4] },
  title: { text: null },
  accessibility: { description: label },
  xAxis: { categories: MONTHS_SHORT, crosshair: true },
  yAxis: { title: { text: null }, labels: { formatter() { return compact(this.value); } } },
});

const pointsWith = (values, classOf) => values.map((y, i) => ({ y, className: classOf(y, i) }));

// Spending columns against per-month income (Max); columns over Max turn red
export function MonthChart({ values, limits = [], current = -1, label }) {
  return mount('chart-month', '16rem', label, () => ({
    ...baseChart('column', label),
    tooltip: { shared: true, valueDecimals: 2, valueSuffix: ' บาท' },
    plotOptions: { column: { borderRadius: 3 } },
    series: [
      {
        name: 'รายจ่าย',
        data: pointsWith(values, (v, i) => `${limits[i] != null && v > limits[i] ? 'is-neg' : ''}${i === current ? ' is-cur' : ''}`),
      },
      limits.length > 0 && {
        type: 'line', name: 'รายรับ (Max)', className: 'series-limit', step: 'center', data: limits, marker: { enabled: false },
      },
    ].filter(Boolean),
  }));
}

// Monthly balance around zero, positive green / negative red
export function BalanceChart({ values, current = -1, label }) {
  return mount('chart-balance', '17rem', label, () => ({
    ...baseChart('column', label),
    legend: { enabled: false },
    tooltip: { valueDecimals: 2, valueSuffix: ' บาท' },
    plotOptions: {
      column: {
        borderRadius: 3,
        dataLabels: { enabled: true, formatter() { return compact(this.y); } },
      },
    },
    series: [{
      name: 'คงเหลือ',
      data: pointsWith(values, (v, i) => `${v < 0 ? 'is-neg' : 'is-pos'}${i === current ? ' is-cur' : ''}`),
    }],
  }));
}

// Grouped income/expense columns with the income (Max) line and a marker on the current month
export function IncomeExpenseChart({ income, expense, current = -1, label }) {
  return mount('chart-flow', '18rem', label, () => ({
    ...baseChart('column', label),
    xAxis: {
      categories: MONTHS_SHORT,
      crosshair: true,
      // Label sits inside the plot area so it is not clipped at the top edge
      plotLines: current >= 0 ? [{ value: current - 0.5, className: 'plot-current', label: { text: 'เดือนนี้', rotation: 0, x: 6, y: 14 } }] : [],
    },
    tooltip: { shared: true, valueDecimals: 2, valueSuffix: ' บาท' },
    plotOptions: { column: { borderRadius: 4, groupPadding: 0.18, pointPadding: 0.06 } },
    series: [
      { name: 'รายรับ', className: 'series-income', data: income },
      {
        name: 'รายจ่าย',
        className: 'series-expense',
        data: pointsWith(expense, (v, i) => (v > income[i] ? 'is-over' : '')),
      },
      { type: 'line', name: 'รายรับ (Max)', className: 'series-limit', step: 'center', data: income, marker: { enabled: false } },
    ],
  }));
}

// Decorative trend line; cls/height let stat cards place it as a background
export function Sparkline(values, current = -1, { cls = 'chart-spark', height = '2.5rem' } = {}) {
  const hasNegative = values.some((v) => v < 0);
  return mount(cls, height, 'แนวโน้มรายเดือน', () => ({
    chart: { type: 'areaspline', styledMode: true, margin: [2, 0, 2, 0], animation: false },
    title: { text: null },
    accessibility: { enabled: false },
    xAxis: { visible: false, categories: MONTHS_SHORT },
    yAxis: { visible: false, min: hasNegative ? null : 0 },
    legend: { enabled: false },
    tooltip: { enabled: false },
    // Sparkline sits inside a card link, so it stays decorative and non-interactive
    plotOptions: { series: { animation: false, enableMouseTracking: false, marker: { enabled: false } } },
    series: [{ data: values.map((y, i) => (i === current ? { y, marker: { enabled: true }, className: 'is-cur' } : y)) }],
  }));
}
