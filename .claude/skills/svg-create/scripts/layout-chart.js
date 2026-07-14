#!/usr/bin/env node
/**
 * layout-chart.js — Deterministic Chart Layout Engine
 *
 * Handles axis scale calculation, bar/line/pie mark positioning, and legend placement.
 *
 * Input:  Chart IR JSON (stdin or --file)
 * Output: Positioned Chart IR JSON (stdout)
 */

import { readFileSync } from 'fs';

const DEFAULTS = {
  canvasWidth: 1280,
  canvasHeight: 720,
  margin: 60,
  chartTopMargin: 120,
  chartBottomMargin: 100,
  chartLeftMargin: 100,
  chartRightMargin: 60,
};

function niceTicks(min, max, targetCount = 5) {
  const range = max - min;
  if (range === 0) return [min];
  const roughStep = range / (targetCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceStep;
  if (residual <= 2) niceStep = 2 * magnitude;
  else if (residual <= 5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks = [];
  for (let v = start; v <= max + niceStep * 0.001; v += niceStep) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

function layoutBarChart(ir, cfg) {
  const { canvasWidth, canvasHeight, margin, chartTopMargin, chartBottomMargin, chartLeftMargin, chartRightMargin } = cfg;
  const chartX = chartLeftMargin;
  const chartY = chartTopMargin;
  const chartW = canvasWidth - chartLeftMargin - chartRightMargin;
  const chartH = canvasHeight - chartTopMargin - chartBottomMargin;
  const categories = ir.categories || [];
  const series = ir.series || [];
  const orientation = ir.config?.orientation || 'vertical';
  const stacked = ir.config?.stacked || false;

  // Find data range
  let maxVal = 0;
  for (const s of series) {
    for (const v of (s.data || [])) {
      if (stacked) {
        // For stacked, need to sum across series
      }
      maxVal = Math.max(maxVal, v);
    }
  }
  maxVal = Math.ceil(maxVal * 1.15); // 15% headroom

  const yTicks = niceTicks(0, maxVal);
  const yScale = chartH / maxVal;

  const nCats = categories.length;
  const nSeries = series.length;
  const groupW = chartW / nCats;
  const barW = (groupW * 0.7) / nSeries;

  const marks = [];
  for (let si = 0; si < nSeries; si++) {
    for (let ci = 0; ci < nCats; ci++) {
      const val = series[si].data[ci] || 0;
      const barH = val * yScale;
      const groupX = chartX + ci * groupW;
      const barX = groupX + groupW * 0.15 + si * barW;
      const barY = chartY + chartH - barH;

      marks.push({
        series: series[si].name,
        seriesIndex: si,
        category: categories[ci],
        categoryIndex: ci,
        type: 'bar',
        x: Math.round(barX), y: Math.round(barY),
        width: Math.round(barW), height: Math.round(barH),
        value: val,
        color: series[si].color || null,
      });
    }
  }

  const axes = {
    x: {
      line: { x1: chartX, y1: chartY + chartH, x2: chartX + chartW, y2: chartY + chartH },
      ticks: categories.map((cat, i) => ({
        x: Math.round(chartX + i * groupW + groupW / 2),
        y: chartY + chartH,
        label: cat,
      })),
    },
    y: {
      line: { x1: chartX, y1: chartY, x2: chartX, y2: chartY + chartH },
      ticks: yTicks.map(v => ({
        y: Math.round(chartY + chartH - v * yScale),
        label: String(v),
        value: v,
      })),
      gridLines: yTicks.slice(1).map(v => ({
        y1: Math.round(chartY + chartH - v * yScale),
        y2: Math.round(chartY + chartH - v * yScale),
      })),
    },
  };

  const legend = {
    x: chartX + chartW / 2 - series.length * 60,
    y: canvasHeight - 30,
    items: series.map((s, i) => ({
      label: s.name,
      color: s.color || cfg.chartColors?.[i] || '#2563EB',
    })),
  };

  return { chartArea: { x: chartX, y: chartY, width: chartW, height: chartH }, marks, axes, legend };
}

function layoutPieChart(ir, cfg) {
  const { canvasWidth, canvasHeight, chartLeftMargin, chartRightMargin } = cfg;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2 + 20;
  const r = Math.min(canvasWidth - chartLeftMargin - chartRightMargin, canvasHeight - 200) / 2;
  const series = ir.series?.[0] || { data: [] };
  const categories = ir.categories || [];
  const total = (series.data || []).reduce((s, v) => s + v, 0);
  if (total === 0) return { marks: [], axes: null, legend: null };

  const isDonut = ir.chartType === 'donut';
  const innerR = isDonut ? r * 0.55 : 0;

  const marks = [];
  let currentAngle = -Math.PI / 2; // Start at 12 o'clock
  const chartColors = cfg.chartColors || ['#2563EB','#F59E0B','#10B981','#EF4444','#8B5CF6','#F97316','#06B6D4','#EC4899'];

  for (let i = 0; i < (series.data || []).length; i++) {
    const val = series.data[i];
    const sweep = (val / total) * Math.PI * 2;
    const endAngle = currentAngle + sweep;
    const midAngle = currentAngle + sweep / 2;

    // Arc path
    const x1 = cx + r * Math.cos(currentAngle);
    const y1 = cy + r * Math.sin(currentAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = sweep > Math.PI ? 1 : 0;

    let path;
    if (isDonut) {
      const ix1 = cx + innerR * Math.cos(currentAngle);
      const iy1 = cy + innerR * Math.sin(currentAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);
      path = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${ix2.toFixed(1)} ${iy2.toFixed(1)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1.toFixed(1)} ${iy1.toFixed(1)} Z`;
    } else {
      path = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
    }

    // Label position (outside the slice)
    const labelR = r * 1.2;
    const labelX = cx + labelR * Math.cos(midAngle);
    const labelY = cy + labelR * Math.sin(midAngle);
    const pct = ((val / total) * 100).toFixed(0);

    marks.push({
      category: categories[i] || `Slice ${i + 1}`,
      value: val,
      percentage: pct,
      color: chartColors[i % chartColors.length],
      path,
      labelX: Math.round(labelX),
      labelY: Math.round(labelY),
    });

    currentAngle = endAngle;
  }

  return { marks, axes: null, legend: null, centerLabel: isDonut ? { x: cx, y: cy, total } : null };
}

function layoutChart(ir, overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides };
  cfg.chartColors = ['#2563EB','#F59E0B','#10B981','#EF4444','#8B5CF6','#F97316','#06B6D4','#EC4899'];

  const chartType = ir.chartType || 'bar';

  let result;
  switch (chartType) {
    case 'bar':
      result = layoutBarChart(ir, cfg);
      break;
    case 'line':
      // Line uses same axes as bar but different marks
      result = layoutBarChart(ir, cfg);
      result.marks = result.marks.map(m => ({ ...m, type: 'point' }));
      break;
    case 'pie':
    case 'donut':
      result = layoutPieChart(ir, cfg);
      break;
    default:
      result = layoutBarChart(ir, cfg);
  }

  return {
    ...result,
    canvas: { width: cfg.canvasWidth, height: cfg.canvasHeight },
    title: ir.title || null,
    chartType,
    success: true,
  };
}

function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  let input;
  if (fileIdx >= 0) input = readFileSync(args[fileIdx + 1], 'utf-8');
  else { const chunks = []; process.stdin.on('data', c => chunks.push(c)); process.stdin.on('end', () => { input = Buffer.concat(chunks).toString().trim(); processIt(input, args); }); return; }
  processIt(input, args);
}

function processIt(input, args) {
  const ir = JSON.parse(input);
  const ov = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--width') ov.canvasWidth = parseInt(args[i+1]);
    if (args[i] === '--height') ov.canvasHeight = parseInt(args[i+1]);
  }
  console.log(JSON.stringify(layoutChart(ir, ov), null, 2));
}

main();
