#!/usr/bin/env node
/**
 * serialize-svg.js — Deterministic SVG Serializer for svg-create
 *
 * Takes Positioned IR + Theme Config → produces correct, tracked SVG.
 * NEVER produces invalid XML. Automatically injects data-svgc-* attributes.
 *
 * Input:  Positioned IR JSON (stdin or --file) + optional --theme
 * Output: Complete SVG string (stdout)
 *
 * Usage:
 *   node serialize-svg.js --file positioned-ir.json
 *   node serialize-svg.js --file ir.json --theme business-blue
 */

import { readFileSync } from 'fs';

// ═══════════════════════════════════════════════════════════════════
// THEME PRESETS
// ═══════════════════════════════════════════════════════════════════

const THEMES = {
  'business-blue': {
    primary: '#2563EB', secondary: '#7C3AED', accent: '#059669',
    background: '#F8FAFC', text: '#1E293B', textSecondary: '#64748B',
    grid: '#E2E8F0', success: '#10B981', warning: '#F59E0B', danger: '#EF4444',
    chartCategorical: ['#2563EB','#F59E0B','#10B981','#EF4444','#8B5CF6','#F97316','#06B6D4','#EC4899'],
  },
  'dark-tech': {
    primary: '#38BDF8', secondary: '#A78BFA', accent: '#34D399',
    background: '#0F172A', text: '#E2E8F0', textSecondary: '#94A3B8',
    grid: '#334155', success: '#4ADE80', warning: '#FBBF24', danger: '#F87171',
    chartCategorical: ['#38BDF8','#FBBF24','#34D399','#F87171','#A78BFA','#FB923C','#22D3EE','#F472B6'],
  },
  'warm-vibrant': {
    primary: '#F59E0B', secondary: '#EF4444', accent: '#10B981',
    background: '#FFFBEB', text: '#451A03', textSecondary: '#92400E',
    grid: '#FDE68A', success: '#059669', warning: '#D97706', danger: '#DC2626',
    chartCategorical: ['#F59E0B','#EF4444','#10B981','#8B5CF6','#F97316','#06B6D4','#EC4899','#2563EB'],
  },
};

// ═══════════════════════════════════════════════════════════════════
// SHAPE RENDERERS
// ═══════════════════════════════════════════════════════════════════

function shapeRect(x, y, w, h, theme) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="white" stroke="${theme.primary}" stroke-width="2"/>`;
}

function shapeRoundedRect(x, y, w, h, theme) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="white" stroke="${theme.primary}" stroke-width="2" filter="url(#shadow)"/>`;
}

function shapeCircle(cx, cy, r, theme) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${theme.primary}" stroke-width="2"/>`;
}

function shapeCylinder(x, y, w, h, theme) {
  const cx = x + w / 2;
  const ry = h * 0.15;
  const cyTop = y + ry;
  const cyBot = y + h - ry;
  return [
    `<ellipse cx="${cx}" cy="${cyTop}" rx="${w/2}" ry="${ry}" fill="${theme.background}" stroke="${theme.primary}" stroke-width="2"/>`,
    `<rect x="${x}" y="${cyTop}" width="${w}" height="${h - 2*ry}" fill="${theme.background}" stroke="none"/>`,
    `<path d="M ${x} ${cyTop} L ${x} ${cyBot} A ${w/2} ${ry} 0 0 0 ${x+w} ${cyBot} L ${x+w} ${cyTop}" fill="none" stroke="${theme.primary}" stroke-width="2"/>`,
    `<ellipse cx="${cx}" cy="${cyBot}" rx="${w/2}" ry="${ry}" fill="${theme.background}" stroke="${theme.primary}" stroke-width="2"/>`,
  ].join('\n');
}

function shapeHexagon(x, y, w, h, theme) {
  const cx = x + w / 2;
  const pts = `${cx},${y} ${x+w},${y+h*0.25} ${x+w},${y+h*0.75} ${cx},${y+h} ${x},${y+h*0.75} ${x},${y+h*0.25}`;
  return `<polygon points="${pts}" fill="#EFF6FF" stroke="${theme.primary}" stroke-width="2"/>`;
}

function shapeDiamond(x, y, w, h, theme) {
  const cx = x + w / 2, cy = y + h / 2;
  const pts = `${cx},${y} ${x+w},${cy} ${cx},${y+h} ${x},${cy}`;
  return `<polygon points="${pts}" fill="white" stroke="${theme.accent}" stroke-width="2"/>`;
}

function shapeParallelogram(x, y, w, h, theme) {
  const skew = w * 0.15;
  const pts = `${x+skew},${y} ${x+w},${y} ${x+w-skew},${y+h} ${x},${y+h}`;
  return `<polygon points="${pts}" fill="white" stroke="${theme.primary}" stroke-width="2"/>`;
}

function shapeCloud(x, y, w, h, theme) {
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
  return `<path d="M ${cx - r*0.8} ${cy} a ${r*0.4} ${r*0.4} 0 0 1 ${r*0.8} ${-r*0.3} a ${r*0.5} ${r*0.5} 0 0 1 ${r*0.8} ${r*0.3} a ${r*0.3} ${r*0.3} 0 0 1 ${-r*0.1} ${r*0.4} a ${r*0.4} ${r*0.4} 0 0 1 ${-r*0.8} ${r*0.3} a ${r*0.35} ${r*0.35} 0 0 1 ${-r*0.7} ${-r*0.36} Z" fill="white" stroke="${theme.primary}" stroke-width="2"/>`;
}

function shapePerson(cx, cy, r, bodyH, theme) {
  const headR = r;
  const bodyY = cy + headR;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${headR}" fill="white" stroke="${theme.primary}" stroke-width="2"/>`,
    `<path d="M ${cx - r*0.6} ${bodyY} Q ${cx} ${bodyY - r*0.3} ${cx + r*0.6} ${bodyY} L ${cx + r*0.3} ${bodyY + bodyH} L ${cx - r*0.3} ${bodyY + bodyH} Z" fill="white" stroke="${theme.primary}" stroke-width="2"/>`,
  ].join('\n');
}

const SHAPE_RENDERERS = {
  rect: shapeRect,
  rounded_rect: shapeRoundedRect,
  circle: shapeCircle,
  cylinder: shapeCylinder,
  hexagon: shapeHexagon,
  diamond: shapeDiamond,
  parallelogram: shapeParallelogram,
  cloud: shapeCloud,
  person: shapePerson,
};

// ═══════════════════════════════════════════════════════════════════
// ELEMENT BUILDERS (with data-svgc-* tracking)
// ═══════════════════════════════════════════════════════════════════

let idCounter = 0;
function uid(prefix = 'el') { return `${prefix}-${idCounter++}`; }

function buildNode(n, theme) {
  const shapeFn = SHAPE_RENDERERS[n.shape] || shapeRoundedRect;
  const shapeSvg = shapeFn(n.x, n.y, n.width, n.height, theme);
  const nodeId = `node-${n.id}`;

  return `  <g data-svgc-id="${nodeId}" data-svgc-type="node" data-svgc-layer="${n.layer || 0}" filter="url(#shadow)">
    ${shapeSvg.replace('<rect ', `<rect data-svgc-id="${nodeId}-shape" data-svgc-type="node-shape" data-svgc-parent="${nodeId}" `)
              .replace('<polygon ', `<polygon data-svgc-id="${nodeId}-shape" data-svgc-type="node-shape" data-svgc-parent="${nodeId}" `)
              .replace('<path ', `<path data-svgc-id="${nodeId}-shape" data-svgc-type="node-shape" data-svgc-parent="${nodeId}" `)
              .replace('<circle ', `<circle data-svgc-id="${nodeId}-shape" data-svgc-type="node-shape" data-svgc-parent="${nodeId}" `)
              .replace('<ellipse ', `<ellipse data-svgc-id="${nodeId}-shape" data-svgc-type="node-shape" data-svgc-parent="${nodeId}" `)}
    <text x="${n.centerX}" y="${n.centerY}" text-anchor="middle" dominant-baseline="central"
          font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${theme.text}"
          data-svgc-id="${nodeId}-text" data-svgc-type="node-text" data-svgc-parent="${nodeId}">${esc(n.label)}</text>
  </g>`;
}

function buildEdge(e, theme) {
  const edgeId = `edge-${e.from}-${e.to}`;
  const dash = e.style === 'dotted' ? ' stroke-dasharray="4 4"' : e.style === 'dashed' ? ' stroke-dasharray="8 4"' : '';
  const sw = e.style === 'thick' ? '3' : '2';
  const color = e.style === 'thick' ? theme.primary : theme.textSecondary;

  let labelSvg = '';
  if (e.label) {
    labelSvg = `
    <rect x="${e.labelPosition.x - estimateTextWidth(e.label, 12) / 2 - 4}" y="${e.labelPosition.y - 10}" width="${estimateTextWidth(e.label, 12) + 8}" height="20" rx="3" fill="${theme.background}"
          data-svgc-id="${edgeId}-label-bg" data-svgc-type="edge-label-bg" data-svgc-parent="${edgeId}"/>
    <text x="${e.labelPosition.x}" y="${e.labelPosition.y + 5}" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${theme.textSecondary}"
          data-svgc-id="${edgeId}-label" data-svgc-type="edge-label" data-svgc-parent="${edgeId}">${esc(e.label)}</text>`;
  }

  return `  <g data-svgc-id="${edgeId}" data-svgc-type="edge">
    <path d="${e.path}" fill="none" stroke="${color}" stroke-width="${sw}"${dash} marker-end="url(#arrow)"
          data-svgc-id="${edgeId}-path" data-svgc-type="edge-path" data-svgc-parent="${edgeId}"/>${labelSvg}
  </g>`;
}

function buildGroup(g, theme) {
  const groupId = `group-${g.id || sanitizeId(g.label)}`;
  return [
    `  <g data-svgc-id="${groupId}" data-svgc-type="group-box">`,
    `    <rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="12" fill="none" stroke="${theme.grid}" stroke-width="1.5" stroke-dasharray="6 3"`,
    `          data-svgc-id="${groupId}-box" data-svgc-type="group-box" data-svgc-parent="${groupId}"/>`,
    `    <rect x="${g.x + 10}" y="${g.y - 11}" width="${estimateTextWidth(g.label, 14) + 16}" height="22" rx="4" fill="${theme.background}"`,
    `          data-svgc-id="${groupId}-label-bg" data-svgc-type="edge-label-bg" data-svgc-parent="${groupId}"/>`,
    `    <text x="${g.x + 18}" y="${g.y + 5}" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="${theme.textSecondary}"`,
    `          data-svgc-id="${groupId}-label" data-svgc-type="group-label" data-svgc-parent="${groupId}">${esc(g.label)}</text>`,
    `  </g>`,
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// SVG SHELL
// ═══════════════════════════════════════════════════════════════════

function buildSVGShell(width, height, theme) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.textSecondary}"/>
    </marker>
    <marker id="arrow-primary" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.primary}"/>
    </marker>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="#00000020"/>
    </filter>
  </defs>
  <style>
    text { font-family: Arial, Helvetica, sans-serif; }
  </style>`;
}

function buildTitle(title, width, theme) {
  if (!title) return '';
  return `
  <text x="${width / 2}" y="52" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="28" font-weight="bold" fill="${theme.text}"
        data-svgc-id="title" data-svgc-type="text-title">${esc(title)}</text>`;
}

function buildFooter(width, height, theme, meta) {
  const info = meta ? `${meta.totalNodes || 0} nodes · ${meta.totalEdges || 0} edges · svg-create` : 'svg-create';
  return `
  <text x="${width - 20}" y="${height - 12}" text-anchor="end"
        font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${theme.textSecondary}" opacity="0.6"
        data-svgc-id="footer" data-svgc-type="text-decoration">${esc(info)}</text>`;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeId(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

function estimateTextWidth(text, fontSize = 14) {
  let w = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)) {
      w += fontSize;
    } else if (char === ' ') {
      w += fontSize * 0.3;
    } else {
      w += fontSize * 0.55;
    }
  }
  return Math.ceil(w);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SERIALIZER
// ═══════════════════════════════════════════════════════════════════

function serialize(ir, themeName = 'business-blue') {
  idCounter = 0;
  const theme = THEMES[themeName] || THEMES['business-blue'];
  const { canvas, positionedNodes, positionedEdges, positionedGroups } = ir;
  const w = canvas?.width || 1280;
  const h = canvas?.height || 720;
  const title = ir.title || '';

  const parts = [];

  // 1. SVG shell
  parts.push(buildSVGShell(w, h, theme));

  // 2. Background
  parts.push(`  <rect width="${w}" height="${h}" fill="${theme.background}" data-svgc-id="bg" data-svgc-type="text-decoration"/>`);

  // 3. Title
  if (title) {
    parts.push(buildTitle(title, w, theme));
  }

  // 4. Groups (behind nodes)
  for (const g of (positionedGroups || [])) {
    parts.push(buildGroup(g, theme));
  }

  // 5. Edges (behind nodes)
  for (const e of (positionedEdges || [])) {
    parts.push(buildEdge(e, theme));
  }

  // 6. Nodes
  for (const n of (positionedNodes || [])) {
    parts.push(buildNode(n, theme));
  }

  // 7. Footer
  parts.push(buildFooter(w, h, theme, ir.metadata));

  // 8. Close
  parts.push('</svg>');

  return parts.filter(p => p).join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const themeIdx = args.indexOf('--theme');
  const themeName = themeIdx >= 0 ? args[themeIdx + 1] : 'business-blue';
  let input;

  if (fileIdx >= 0 && args[fileIdx + 1]) {
    input = readFileSync(args[fileIdx + 1], 'utf-8');
  } else {
    // stdin
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
      input = Buffer.concat(chunks).toString('utf-8').trim();
      output(input, themeName);
    });
    return;
  }

  output(input, themeName);
}

function output(input, themeName) {
  if (!input) { process.exit(1); }
  const ir = JSON.parse(input);
  const svg = serialize(ir, themeName);
  console.log(svg);
}

main();
