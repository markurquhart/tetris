/**
 * Tiny inline-SVG charts for the profile screens.
 *
 * Series colors are the validated dark-mode slots 1-3 (blue / orange / aqua)
 * against the app surface; see `--viz-series-*` in style.css. All-pairs CVD
 * and normal-vision separation pass at three slots, which is the cap here —
 * nothing in this app needs a fourth series.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ChartPoint {
  /** Short axis label (not every point is drawn). */
  label: string;
  value: number;
  /** Extra line in the tooltip. */
  detail?: string;
}

interface ChartOptions {
  series: 1 | 2 | 3;
  /** Formats the value for tooltips and the direct label. */
  format?: (n: number) => string;
  /** Accessible description; also used as the empty-state message source. */
  title: string;
  emptyMessage?: string;
}

/** Fallback width before the container has been laid out. */
const DEFAULT_W = 520;
const H = 150;
const PAD_L = 8;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 22;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function renderEmpty(container: HTMLElement, message: string): void {
  container.replaceChildren();
  const p = document.createElement('p');
  p.className = 'chart-empty';
  p.textContent = message;
  container.append(p);
}

type DrawFn = (
  svg: SVGSVGElement,
  tip: HTMLElement,
  container: HTMLElement,
  width: number,
  points: ChartPoint[],
  fmt: (n: number) => string,
) => void;

/**
 * Measures the container and draws at 1:1 pixel scale.
 *
 * An earlier version used `preserveAspectRatio="none"` with a fixed viewBox,
 * which stretched every glyph horizontally. Text has to live in an un-scaled
 * coordinate system, so the viewBox tracks the real width instead.
 */
function mount(
  container: HTMLElement,
  points: ChartPoint[],
  opts: ChartOptions,
  draw: DrawFn,
): void {
  if (!points.length) {
    renderEmpty(container, opts.emptyMessage ?? 'Not enough games yet.');
    return;
  }

  const fmt = opts.format ?? ((n: number) => String(n));
  let lastWidth = -1;

  const render = () => {
    const width = Math.max(220, Math.round(container.clientWidth) || DEFAULT_W);
    if (Math.abs(width - lastWidth) < 8) return;
    lastWidth = width;

    container.replaceChildren();
    container.classList.add('chart');

    const svg = el('svg', {
      viewBox: `0 0 ${width} ${H}`,
      role: 'img',
      'aria-label': opts.title,
      class: `chart-svg series-${opts.series}`,
    });

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;

    container.append(svg, tip);
    draw(svg, tip, container, width, points, fmt);
    container.append(tableView(points, fmt, opts.title));
  };

  render();

  if (typeof ResizeObserver !== 'undefined') {
    // Re-measure on layout changes; the 8px guard above stops feedback loops.
    new ResizeObserver(() => render()).observe(container);
  }
}

function positionTip(
  container: HTMLElement,
  tip: HTMLElement,
  xRatio: number,
  html: string,
): void {
  tip.innerHTML = html;
  tip.hidden = false;
  const width = container.clientWidth || 1;
  // Keep the tooltip inside the card rather than letting it clip at the edges.
  const raw = xRatio * width;
  const clamped = Math.min(Math.max(raw, 54), width - 54);
  tip.style.left = `${clamped}px`;
}

/**
 * Line chart with a crosshair. One series only — two measures of different
 * scale get two charts, never a second y-axis.
 */
export function lineChart(
  container: HTMLElement,
  points: ChartPoint[],
  opts: ChartOptions,
): void {
  mount(container, points, opts, (svg, tip, host, W, pts, fmt) => {
    const max = Math.max(...pts.map((p) => p.value), 1);
    const min = Math.min(...pts.map((p) => p.value), 0);
    const span = max - min || 1;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    const x = (i: number) =>
      pts.length === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (pts.length - 1)) * plotW;
    const y = (v: number) => PAD_T + plotH - ((v - min) / span) * plotH;

    // Recessive baseline + midline only; no full grid.
    for (const ratio of [0, 0.5, 1]) {
      svg.append(
        el('line', {
          x1: PAD_L,
          x2: W - PAD_R,
          y1: PAD_T + plotH * ratio,
          y2: PAD_T + plotH * ratio,
          class: 'chart-grid',
        }),
      );
    }

    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
    const areaD = `${d} L${x(pts.length - 1)},${PAD_T + plotH} L${x(0)},${PAD_T + plotH} Z`;

    svg.append(el('path', { d: areaD, class: 'chart-area' }));
    svg.append(el('path', { d, class: 'chart-line' }));

    const crosshair = el('line', {
      y1: PAD_T,
      y2: PAD_T + plotH,
      class: 'chart-crosshair',
      opacity: 0,
    });
    const marker = el('circle', { r: 4.5, class: 'chart-marker', opacity: 0 });
    svg.append(crosshair, marker);

    // Direct-label the final value instead of numbering every point.
    const last = pts[pts.length - 1];
    const lastLabel = el('text', {
      x: W - PAD_R,
      y: Math.max(y(last.value) - 9, PAD_T + 9),
      class: 'chart-last-label',
      'text-anchor': 'end',
    });
    lastLabel.textContent = fmt(last.value);
    svg.append(lastLabel);

    const show = (clientX: number) => {
      const rect = svg.getBoundingClientRect();
      const ratio = (clientX - rect.left) / (rect.width || 1);
      const i = Math.min(Math.max(Math.round(ratio * (pts.length - 1)), 0), pts.length - 1);
      const p = pts[i];
      crosshair.setAttribute('x1', String(x(i)));
      crosshair.setAttribute('x2', String(x(i)));
      crosshair.setAttribute('opacity', '1');
      marker.setAttribute('cx', String(x(i)));
      marker.setAttribute('cy', String(y(p.value)));
      marker.setAttribute('opacity', '1');
      positionTip(
        host,
        tip,
        (x(i) - PAD_L) / plotW,
        `<strong>${fmt(p.value)}</strong><span>${p.detail ?? p.label}</span>`,
      );
    };

    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerenter', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', () => {
      crosshair.setAttribute('opacity', '0');
      marker.setAttribute('opacity', '0');
      tip.hidden = true;
    });
  });
}

/** Bars anchored to the baseline, 2px surface gap, rounded data-ends. */
export function barChart(
  container: HTMLElement,
  points: ChartPoint[],
  opts: ChartOptions,
): void {
  mount(container, points, opts, (svg, tip, host, W, pts, fmt) => {
    const max = Math.max(...pts.map((p) => p.value), 1);
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    // Cap the bar so a handful of categories don't become giant slabs, and
    // centre the group when the cap leaves slack.
    const slot = plotW / pts.length;
    const barW = Math.max(2, Math.min(slot - 2, 44));
    const groupW = slot * pts.length;
    const originX = PAD_L + (plotW - groupW) / 2;

    svg.append(
      el('line', {
        x1: PAD_L,
        x2: W - PAD_R,
        y1: PAD_T + plotH,
        y2: PAD_T + plotH,
        class: 'chart-grid',
      }),
    );

    pts.forEach((p, i) => {
      const h = Math.max(2, (p.value / max) * plotH);
      const bx = originX + i * slot + (slot - barW) / 2;
      const by = PAD_T + plotH - h;
      const bar = el('rect', {
        x: bx,
        y: by,
        width: barW,
        height: h,
        rx: Math.min(4, barW / 2),
        class: 'chart-bar',
      });
      bar.addEventListener('pointerenter', () => {
        bar.classList.add('is-active');
        positionTip(
          host,
          tip,
          (bx + barW / 2 - PAD_L) / plotW,
          `<strong>${fmt(p.value)}</strong><span>${p.detail ?? p.label}</span>`,
        );
      });
      bar.addEventListener('pointerleave', () => {
        bar.classList.remove('is-active');
        tip.hidden = true;
      });
      svg.append(bar);
    });

    // Label only the ends so the axis never collides with itself.
    if (pts.length > 1) {
      const first = el('text', { x: originX, y: H - 6, class: 'chart-axis-label' });
      first.textContent = pts[0].label;
      const lastT = el('text', {
        x: originX + groupW,
        y: H - 6,
        class: 'chart-axis-label',
        'text-anchor': 'end',
      });
      lastT.textContent = pts[pts.length - 1].label;
      svg.append(first, lastT);
    }
  });
}

/** Every chart ships a table view — identity is never color-alone. */
function tableView(
  points: ChartPoint[],
  fmt: (n: number) => string,
  title: string,
): HTMLElement {
  const details = document.createElement('details');
  details.className = 'chart-table';

  const summary = document.createElement('summary');
  summary.textContent = 'View as table';
  details.append(summary);

  const table = document.createElement('table');
  const head = document.createElement('tr');
  head.innerHTML = '<th scope="col">Point</th><th scope="col">Value</th>';
  table.append(head);

  for (const p of points) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = p.detail ?? p.label;
    const td = document.createElement('td');
    td.textContent = fmt(p.value);
    tr.append(th, td);
    table.append(tr);
  }

  table.caption = document.createElement('caption');
  table.caption.textContent = title;
  details.append(table);
  return details;
}

/** Deterministic avatar tint so a player looks the same everywhere. */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
