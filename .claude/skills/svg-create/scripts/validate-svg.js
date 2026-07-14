#!/usr/bin/env node
/**
 * validate-svg.js — Programmatic SVG Quality Validator for svg-create
 *
 * Parses SVG, extracts all data-svgc-* tracked elements, computes bounding
 * boxes, and checks for overlaps and boundary violations.
 *
 * Usage:
 *   node validate-svg.js output.svg
 *   node validate-svg.js output.svg --json       (machine-readable output)
 *   node validate-svg.js output.svg --html       (generate visual report)
 *
 * Exit code: 0 = clean, 1 = violations found, 2 = parse error
 */

import { readFileSync, writeFileSync } from 'fs';

// ═══════════════════════════════════════════════════════════════════
// SVG XML PARSER (zero-dependency, regex-based)
// ═══════════════════════════════════════════════════════════════════

class SVGElement {
  constructor(tagName, attributes = {}, parent = null) {
    this.tagName = tagName;
    this.attributes = attributes;
    this.parent = parent;
    this.children = [];
    this.textContent = '';
  }

  getAttr(name, defaultValue = null) {
    return this.attributes[name] !== undefined ? this.attributes[name] : defaultValue;
  }

  hasAttr(name) {
    return name in this.attributes;
  }
}

/**
 * Parse an SVG string into a simple DOM tree.
 * Handles self-closing tags, nested elements, and attributes.
 */
function parseSVG(svgString) {
  const root = new SVGElement('root');
  const stack = [root];
  let pos = 0;
  const len = svgString.length;

  // Remove XML comments
  svgString = svgString.replace(/<!--[\s\S]*?-->/g, '');

  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9_-]*)((?:\s+[a-zA-Z][a-zA-Z0-9_-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)))?)\s*(\/?)>/g;
  let match;

  while ((match = tagRegex.exec(svgString)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];
    const attrString = match[2] || '';
    const selfClosing = match[3] === '/';

    // Parse attributes
    const attributes = {};
    const attrRegex = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      const name = attrMatch[1];
      const value = attrMatch[2] || attrMatch[3] || attrMatch[4] || '';
      attributes[name] = value;
    }

    if (fullMatch.startsWith('</')) {
      // Closing tag
      if (stack.length > 1 && stack[stack.length - 1].tagName === tagName) {
        stack.pop();
      }
    } else if (selfClosing || isVoidSVGElement(tagName)) {
      // Self-closing or void element
      const el = new SVGElement(tagName, attributes, stack[stack.length - 1]);
      stack[stack.length - 1].children.push(el);
    } else {
      // Opening tag
      const el = new SVGElement(tagName, attributes, stack[stack.length - 1]);
      stack[stack.length - 1].children.push(el);
      stack.push(el);
    }
  }

  return root;
}

function isVoidSVGElement(tagName) {
  return ['circle', 'ellipse', 'line', 'rect', 'path', 'polygon', 'polyline',
          'stop', 'use', 'image', 'animate', 'set', 'animateTransform',
          'feDropShadow', 'feColorMatrix', 'feGaussianBlur', 'feOffset',
          'feMerge', 'feMergeNode', 'feBlend', 'feFlood', 'feComposite'].includes(tagName);
}

/**
 * Find all descendant elements matching a predicate
 */
function findElements(root, predicate) {
  const results = [];
  function walk(el) {
    if (predicate(el)) results.push(el);
    for (const child of el.children) {
      walk(child);
    }
  }
  walk(root);
  return results;
}

/**
 * Find element by data-svgc-id
 */
function findById(root, id) {
  return findElements(root, el => el.getAttr('data-svgc-id') === id)[0] || null;
}

// ═══════════════════════════════════════════════════════════════════
// BOUNDING BOX CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the bounding box of an SVG element.
 * Returns {x, y, width, height} or null if not computable.
 */
function computeBBox(el, root) {
  const tag = el.tagName;
  const attr = el.attributes;

  switch (tag) {
    case 'rect':
      return rectBBox(attr);
    case 'circle':
      return circleBBox(attr);
    case 'ellipse':
      return ellipseBBox(attr);
    case 'line':
      return lineBBox(attr);
    case 'polygon':
    case 'polyline':
      return polygonBBox(attr);
    case 'path':
      return pathBBox(attr);
    case 'text':
      return textBBox(el);
    case 'g':
    case 'svg':
      return groupBBox(el, root);
    default:
      return null;
  }
}

function parseNum(val, defaultVal = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? defaultVal : n;
}

function rectBBox(attr) {
  const x = parseNum(attr.x, 0);
  const y = parseNum(attr.y, 0);
  const w = parseNum(attr.width, 0);
  const h = parseNum(attr.height, 0);
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
}

function circleBBox(attr) {
  const cx = parseNum(attr.cx, 0);
  const cy = parseNum(attr.cy, 0);
  const r = parseNum(attr.r, 0);
  return r > 0 ? { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r } : null;
}

function ellipseBBox(attr) {
  const cx = parseNum(attr.cx, 0);
  const cy = parseNum(attr.cy, 0);
  const rx = parseNum(attr.rx, 0);
  const ry = parseNum(attr.ry, 0);
  return rx > 0 && ry > 0 ? { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry } : null;
}

function lineBBox(attr) {
  const x1 = parseNum(attr.x1, 0);
  const y1 = parseNum(attr.y1, 0);
  const x2 = parseNum(attr.x2, 0);
  const y2 = parseNum(attr.y2, 0);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  return { x, y, width: w || 1, height: h || 1 }; // Minimum 1px for visibility
}

function polygonBBox(attr) {
  const points = (attr.points || '').trim();
  if (!points) return null;
  const coords = points.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
  if (coords.length < 4) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    minX = Math.min(minX, coords[i]);
    maxX = Math.max(maxX, coords[i]);
    minY = Math.min(minY, coords[i + 1]);
    maxY = Math.max(maxY, coords[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function pathBBox(attr) {
  // Parse path data to extract extreme points
  const d = (attr.d || '').trim();
  if (!d) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let x = 0, y = 0;
  let startX = 0, startY = 0;

  const cmdRegex = /([MLCQAZHVmlcqazhv])\s*([^MLCQAZHVmlcqazhv]*)/g;
  let match;

  function addPoint(px, py) {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }

  function parseArgs(str, count) {
    const nums = str.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    const result = [];
    for (let i = 0; i < nums.length; i += count) {
      result.push(nums.slice(i, i + count));
    }
    return result.flat();
  }

  while ((match = cmdRegex.exec(d)) !== null) {
    const cmd = match[1];
    const args = parseArgs(match[2], cmd === 'A' || cmd === 'a' ? 7 :
                                    cmd === 'C' || cmd === 'c' ? 6 :
                                    cmd === 'Q' || cmd === 'q' ? 4 :
                                    cmd === 'H' || cmd === 'h' ? 1 :
                                    cmd === 'V' || cmd === 'v' ? 1 : 2);

    for (let i = 0; i < args.length;) {
      switch (cmd) {
        case 'M': x = args[i++]; y = args[i++]; startX = x; startY = y; addPoint(x, y); break;
        case 'm': x += args[i++]; y += args[i++]; startX = x; startY = y; addPoint(x, y); break;
        case 'L': x = args[i++]; y = args[i++]; addPoint(x, y); break;
        case 'l': x += args[i++]; y += args[i++]; addPoint(x, y); break;
        case 'H': x = args[i++]; addPoint(x, y); break;
        case 'h': x += args[i++]; addPoint(x, y); break;
        case 'V': y = args[i++]; addPoint(x, y); break;
        case 'v': y += args[i++]; addPoint(x, y); break;
        case 'C': {
          const cx1 = args[i++], cy1 = args[i++], cx2 = args[i++], cy2 = args[i++];
          x = args[i++]; y = args[i++];
          addPoint(x, y); addPoint(cx1, cy1); addPoint(cx2, cy2);
          break;
        }
        case 'c': {
          const cx1 = x + args[i++], cy1 = y + args[i++], cx2 = x + args[i++], cy2 = y + args[i++];
          x += args[i++]; y += args[i++];
          addPoint(x, y); addPoint(cx1, cy1); addPoint(cx2, cy2);
          break;
        }
        case 'Q': addPoint(args[i++], args[i++]); x = args[i++]; y = args[i++]; addPoint(x, y); break;
        case 'q': addPoint(x + args[i++], y + args[i++]); x += args[i++]; y += args[i++]; addPoint(x, y); break;
        case 'A': case 'a': {
          const rx = args[i++], ry = args[i++], rot = args[i++], large = args[i++], sweep = args[i++];
          const tx = cmd === 'A' ? args[i++] : x + args[i++];
          const ty = cmd === 'A' ? args[i++] : y + args[i++];
          // Approximate: include endpoints + arc extremes
          addPoint(x, y); addPoint(tx, ty);
          addPoint(x - rx, y - ry); addPoint(x + rx, y + ry);
          x = tx; y = ty;
          break;
        }
        case 'Z': case 'z': x = startX; y = startY; break;
        default: i += 2;
      }
    }
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

/**
 * Estimate text element bounding box from font-size, content, and anchor.
 */
function textBBox(el) {
  const x = parseNum(el.attributes.x, 0);
  const y = parseNum(el.attributes.y, 0);
  const fontSize = parseFontSize(el);
  const text = getTextContent(el);
  const textAnchor = el.attributes['text-anchor'] || 'start';
  const dominantBaseline = el.attributes['dominant-baseline'] || 'alphabetic';

  if (!text || fontSize === 0) return null;

  const width = estimateTextWidth(text, fontSize);
  const height = fontSize * 1.2;

  let bboxX = x;
  if (textAnchor === 'middle') bboxX = x - width / 2;
  else if (textAnchor === 'end') bboxX = x - width;

  let bboxY = y;
  if (dominantBaseline === 'central' || dominantBaseline === 'middle') bboxY = y - height / 2;
  else if (dominantBaseline === 'hanging') bboxY = y;
  else bboxY = y - height * 0.8; // alphabetic

  return { x: bboxX, y: bboxY, width, height };
}

function parseFontSize(el) {
  // Check inline style
  const style = el.attributes.style || '';
  const styleMatch = style.match(/font-size\s*:\s*([\d.]+)px/);
  if (styleMatch) return parseFloat(styleMatch[1]);

  // Check font-size attribute
  if (el.attributes['font-size']) return parseNum(el.attributes['font-size']);

  // Check CSS class (heuristic: common class names)
  const cls = el.attributes.class || '';
  if (cls.includes('node-title')) return 36;
  if (cls.includes('node-subtitle')) return 24;
  if (cls.includes('node-heading')) return 20;
  if (cls.includes('node-text')) return 16;
  if (cls.includes('edge-label')) return 12;
  if (cls.includes('axis-label')) return 12;
  if (cls.includes('footer-text')) return 10;

  // Default
  return 16;
}

function getTextContent(el) {
  // Collect text from element and its tspan children
  let text = el.textContent || '';
  for (const child of el.children) {
    if (child.tagName === 'tspan') {
      text += (child.textContent || '');
    }
  }
  return text.trim();
}

function estimateTextWidth(text, fontSize) {
  let width = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0x4E00 && code <= 0x9FFF ||  // CJK Unified
        code >= 0x3400 && code <= 0x4DBF ||  // CJK Extension A
        code >= 0x3000 && code <= 0x303F ||  // CJK Punctuation
        code >= 0xFF00 && code <= 0xFFEF ||  // Fullwidth forms
        code >= 0xAC00 && code <= 0xD7AF) {  // Hangul
      width += fontSize * 1.0;
    } else if (char === ' ') {
      width += fontSize * 0.3;
    } else if (/[0-9]/.test(char)) {
      width += fontSize * 0.55;
    } else if (/[A-Za-z]/.test(char)) {
      width += fontSize * 0.55;
    } else {
      width += fontSize * 0.5;
    }
  }
  return Math.ceil(width);
}

function groupBBox(el, root) {
  if (el.children.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasBBox = false;

  for (const child of el.children) {
    const bbox = computeBBox(child, root);
    if (bbox) {
      hasBBox = true;
      minX = Math.min(minX, bbox.x);
      minY = Math.min(minY, bbox.y);
      maxX = Math.max(maxX, bbox.x + bbox.width);
      maxY = Math.max(maxY, bbox.y + bbox.height);
    }
  }

  if (!hasBBox) return null;

  // Apply transform
  const bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  return applyTransform(bbox, el.attributes.transform);
}

function applyTransform(bbox, transform) {
  if (!transform) return bbox;

  // Handle translate
  const translateMatch = transform.match(/translate\(([-\d.]+)\s*,?\s*([-\d.]+)?\)/);
  if (translateMatch) {
    const tx = parseFloat(translateMatch[1]);
    const ty = parseFloat(translateMatch[2] || 0);
    return {
      x: bbox.x + tx,
      y: bbox.y + ty,
      width: bbox.width,
      height: bbox.height,
    };
  }

  // Handle scale
  const scaleMatch = transform.match(/scale\(([-\d.]+)\)/);
  if (scaleMatch) {
    const s = parseFloat(scaleMatch[1]);
    return {
      x: bbox.x * s,
      y: bbox.y * s,
      width: bbox.width * s,
      height: bbox.height * s,
    };
  }

  return bbox; // Can't parse transform, return as-is
}

// ═══════════════════════════════════════════════════════════════════
// RECTANGLE OVERLAP DETECTION
// ═══════════════════════════════════════════════════════════════════

function rectsOverlap(a, b, tolerance = 2) {
  return (
    a.x + a.width - tolerance > b.x &&
    b.x + b.width - tolerance > a.x &&
    a.y + a.height - tolerance > b.y &&
    b.y + b.height - tolerance > a.y
  );
}

function rectOverlapArea(a, b) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function isInsideRect(inner, outer, tolerance = 2) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

// ═══════════════════════════════════════════════════════════════════
// ALLOWED OVERLAP RULES
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if an overlap between two elements is allowed.
 * Returns {allowed: boolean, reason: string}
 */
function isOverlapAllowed(elA, elB) {
  const typeA = elA.getAttr('data-svgc-type');
  const typeB = elB.getAttr('data-svgc-type');
  const idA = elA.getAttr('data-svgc-id');
  const idB = elB.getAttr('data-svgc-id');
  const parentA = elA.getAttr('data-svgc-parent');
  const parentB = elB.getAttr('data-svgc-parent');

  // Same element: no check
  if (idA === idB) return { allowed: true, reason: 'same element' };

  // Parent-child relationship
  if (parentA === idB || parentB === idA) {
    return { allowed: true, reason: 'parent-child relationship' };
  }

  // Same parent (siblings in same container)
  if (parentA && parentB && parentA === parentB) {
    // Children of the same node or edge are allowed to overlap
    return { allowed: true, reason: `shared parent: ${parentA}` };
  }

  // Specific type-based rules from the overlap matrix
  const allowedPairs = [
    ['node-text', 'node-shape'],
    ['edge-label', 'edge-path'],
    ['edge-label-bg', 'edge-path'],
    ['chart-value', 'chart-mark'],
    ['gantt-progress', 'gantt-bar'],
    ['group-label', 'group-box'],
    ['legend-label', 'legend-swatch'],
    ['legend-swatch', 'legend-label'],
    ['text-heading', 'text-card'],
    ['text-body', 'text-card'],
    ['text-icon', 'text-card'],
    ['timeline-date', 'timeline-event'],
    ['timeline-title', 'timeline-event'],
    ['timeline-desc', 'timeline-event'],
    ['timeline-marker', 'timeline-event'],
    ['gantt-label', 'timeline-event'],
    ['gantt-bar', 'timeline-event'],
  ];

  // Normalize: check both orders
  for (const [t1, t2] of allowedPairs) {
    if ((typeA === t1 && typeB === t2) || (typeA === t2 && typeB === t1)) {
      return { allowed: true, reason: `allowed pair: ${t1} ↔ ${t2}` };
    }
  }

  // Grid lines allowed to overlap everything
  if (typeA === 'grid-line' || typeB === 'grid-line') {
    return { allowed: true, reason: 'grid line (behind everything)' };
  }

  // Axis lines allowed to overlap chart marks
  if ((typeA === 'axis-line' || typeA === 'axis-tick') &&
      (typeB === 'chart-mark' || typeB === 'chart-value')) {
    return { allowed: true, reason: 'axis behind data' };
  }

  // Decorations allowed to overlap anything
  if (typeA === 'text-decoration' || typeB === 'text-decoration') {
    return { allowed: true, reason: 'decoration element' };
  }

  return { allowed: false, reason: 'no matching allowance rule' };
}

// ═══════════════════════════════════════════════════════════════════
// COLOR CONTRAST ANALYSIS (WCAG 2.1)
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse a CSS color string (hex, rgb, or named) to {r, g, b}.
 * Returns null for unrecognized formats.
 */
function parseColorToRGB(colorStr) {
  if (!colorStr || colorStr === 'none' || colorStr === 'transparent') return null;

  // Hex colors
  let hexMatch = colorStr.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length === 8) hex = hex.slice(0, 6); // Drop alpha
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  // rgb(r, g, b) / rgba(r, g, b, a)
  let rgbMatch = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }

  // Named colors (common subset used in our SVGs)
  const namedColors = {
    white: [255,255,255], black: [0,0,0], red: [255,0,0], green: [0,128,0],
    blue: [0,0,255], gray: [128,128,128], grey: [128,128,128],
    lightgray: [211,211,211], darkgray: [169,169,169], silver: [192,192,192],
    navy: [0,0,128], maroon: [128,0,0], purple: [128,0,128],
    teal: [0,128,128], olive: [128,128,0],
  };
  const named = namedColors[colorStr.toLowerCase()];
  if (named) return { r: named[0], g: named[1], b: named[2] };

  return null;
}

/**
 * Extract the effective fill color of an element.
 * Checks inline fill, style attribute, and CSS class heuristics.
 */
function getEffectiveFill(el) {
  // Direct fill attribute
  if (el.attributes.fill && el.attributes.fill !== 'none') {
    return el.attributes.fill;
  }
  // Inline style
  const style = el.attributes.style || '';
  const fillMatch = style.match(/fill\s*:\s*([^;]+)/);
  if (fillMatch) return fillMatch[1].trim();
  // Inherit from parent
  if (el.parent && el.parent.attributes.fill) {
    return el.parent.attributes.fill;
  }
  return null;
}

/**
 * Get the text color from a text element.
 */
function getTextColor(el) {
  if (el.attributes.fill && el.attributes.fill !== 'none') return el.attributes.fill;
  const style = el.attributes.style || '';
  const fillMatch = style.match(/fill\s*:\s*([^;]+)/);
  if (fillMatch) return fillMatch[1].trim();
  const cls = el.attributes.class || '';
  // Heuristic from common class names
  if (cls.includes('node-text')) return '#1E293B';
  if (cls.includes('node-title')) return '#1E293B';
  if (cls.includes('edge-label')) return '#64748B';
  return '#1E293B'; // default dark text
}

/**
 * Relative luminance per WCAG 2.1 definition.
 */
function relativeLuminance(r, g, b) {
  const rsRGB = r / 255, gsRGB = g / 255, bsRGB = b / 255;
  const rLin = rsRGB <= 0.04045 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLin = gsRGB <= 0.04045 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLin = bsRGB <= 0.04045 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * WCAG 2.1 contrast ratio between two luminances.
 */
function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ═══════════════════════════════════════════════════════════════════
// UNTRACKED FALLBACK: AUTO-CLASSIFY ALL VISUAL ELEMENTS
// ═══════════════════════════════════════════════════════════════════

/**
 * When no data-svgc-* attributes exist, auto-classify elements by heuristics.
 */
function autoClassifyElement(el) {
  const tag = el.tagName;
  const cls = el.attributes.class || '';
  const id = el.attributes.id || '';
  const fill = el.attributes.fill || '';
  const stroke = el.attributes.stroke || '';

  // Text elements
  if (tag === 'text') {
    if (cls.includes('title') || id.includes('title')) return 'text-title';
    if (cls.includes('subtitle')) return 'text-subtitle';
    if (cls.includes('edge') || cls.includes('label')) return 'edge-label';
    if (cls.includes('footer')) return 'text-decoration';
    return 'node-text';
  }

  // Rect elements
  if (tag === 'rect') {
    // Background detection: full-viewBox size, no stroke or very light
    const w = parseFloat(el.attributes.width || '0');
    const h = parseFloat(el.attributes.height || '0');
    if (w > 500 && h > 300 && (!stroke || stroke === 'none')) return 'text-decoration'; // background
    if (cls.includes('card') || cls.includes('bg-white')) return 'text-card';
    if (fill === 'none' && stroke !== 'none') return 'group-box';
    if (cls.includes('bar') || id.includes('bar')) return 'chart-mark';
    return 'node-shape';
  }

  // Circle elements
  if (tag === 'circle') {
    if (cls.includes('marker')) return 'timeline-marker';
    return 'node-shape';
  }

  // Path elements
  if (tag === 'path') {
    const d = el.attributes.d || '';
    if (d.includes('L') && (fill === 'none' || !fill)) return 'edge-path';
    return 'node-shape';
  }

  // Line elements
  if (tag === 'line') {
    if (cls.includes('grid')) return 'grid-line';
    if (cls.includes('axis')) return 'axis-line';
    return 'edge-path';
  }

  // Polygon
  if (tag === 'polygon') return 'node-shape';

  // Group
  if (tag === 'g') return 'node';

  return 'unknown';
}

/**
 * Extract all visual elements (not in defs) for untracked analysis.
 */
function extractAllVisualElements(root) {
  const visualTags = ['rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'path', 'text'];
  const elements = [];

  function walk(el, isInDefs) {
    if (el.tagName === 'defs') { isInDefs = true; }
    if (el.tagName === 'style') return;
    if (el.tagName === 'title' || el.tagName === 'desc') return;

    if (visualTags.includes(el.tagName) && !isInDefs) {
      elements.push(el);
    }
    for (const child of el.children) {
      walk(child, isInDefs);
    }
  }

  walk(root, false);
  return elements;
}

/**
 * Find the likely background element (largest rect usually).
 */
function findBackgroundElement(elements) {
  let best = null;
  let bestArea = 0;
  for (const el of elements) {
    if (el.tagName === 'rect') {
      const w = parseFloat(el.attributes.width || '0');
      const h = parseFloat(el.attributes.height || '0');
      const area = w * h;
      if (area > bestArea && area > 100000) { // > ~100k px²
        best = el;
        bestArea = area;
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN VALIDATION LOGIC
// ═══════════════════════════════════════════════════════════════════

function validateSVG(svgPath) {
  const svgString = readFileSync(svgPath, 'utf-8');
  const root = parseSVG(svgString);

  // Find the <svg> element to get viewBox
  const svgEl = root.children.find(c => c.tagName === 'svg') || root.children[0];
  const viewBox = parseViewBox(svgEl?.attributes.viewBox || '0 0 1280 720');
  const violations = [];
  const warnings = [];
  const stats = { totalTracked: 0, totalOverlapsChecked: 0, violationsFound: 0,
                  untrackedMode: false, contrastChecks: 0, contrastViolations: 0 };

  // ══════════════════════════════════════════════════════════════
  // CHECK 0a: XML declaration (can break <img> tag embedding)
  // ══════════════════════════════════════════════════════════════
  if (svgString.trim().startsWith('<?xml')) {
    warnings.push({
      severity: 'HIGH',
      category: 'xml-declaration',
      message: 'SVG contains <?xml?> declaration — this will cause loading failures when embedded via <img> tag in Markdown or HTML. Remove the <?xml?> line.',
      suggestion: 'Delete the line "<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>" — SVG files referenced as <img src> must start directly with <svg>',
    });
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 0b: Double-hyphen in XML comments (CRITICAL — breaks parser)
  // ══════════════════════════════════════════════════════════════
  // XML spec: "the string '--' MUST NOT occur within comments"
  const doubleHyphenComments = svgString.match(/<!--[^-]*--[^-]*-->/g);
  // Simpler: find all comments, check each for containing '--'
  const allComments = svgString.match(/<!--[\s\S]*?-->/g) || [];
  for (const comment of allComments) {
    // Extract content between <!-- and -->
    const content = comment.slice(4, -3); // Remove <!-- and -->
    if (content.includes('--')) {
      const lineNum = svgString.slice(0, svgString.indexOf(comment)).split('\n').length;
      violations.push({
        severity: 'CRITICAL',
        category: 'xml-comment-double-hyphen',
        message: `XML comment contains '--' (double hyphen) at approximately line ${lineNum}. This is forbidden by the XML spec and will cause strict XML parsers to reject the entire file.`,
        commentPreview: comment.slice(0, 60) + (comment.length > 60 ? '...' : ''),
        suggestion: 'Replace "----" (used as visual separator) with "====" or "———" (em-dash) in XML comments',
      });
    }
  }

  if (violations.length > 0) {
    // Double-hyphen in comments is a hard parse failure — return early
    return {
      svgPath,
      viewBox,
      stats: { ...stats, violationsFound: violations.length },
      violations,
      warnings,
      summary: `❌ FAIL — ${violations.length} CRITICAL XML violation(s): double-hyphen in comment breaks XML parser`,
      pass: false,
    };
  }

  // Collect tracked elements (preferred)
  let trackedElements = findElements(root, el => el.hasAttr('data-svgc-id'));

  // UNTRACKED FALLBACK: if no tracked elements, auto-classify all visual elements
  if (trackedElements.length === 0) {
    stats.untrackedMode = true;
    warnings.push({
      severity: 'MEDIUM',
      category: 'untracked-fallback',
      message: 'SVG has NO data-svgc-* tracking attributes. Running in untracked fallback mode — using heuristic auto-classification. Add tracking attributes for full accuracy.',
      suggestion: 'Add data-svgc-id and data-svgc-type to all rendered elements per shared/element-tracking.md',
    });

    const allVisual = extractAllVisualElements(root);
    const bgEl = findBackgroundElement(allVisual);

    // Build element map from auto-classified elements
    const elementMap = {};
    let autoId = 0;
    for (const el of allVisual) {
      const bbox = computeBBox(el, root);
      if (!bbox || (bbox.width === 0 && bbox.height === 0)) continue;
      const id = `auto-${autoId++}-${el.tagName}`;
      const type = autoClassifyElement(el);
      elementMap[id] = { element: el, bbox, type, parent: null, tagName: el.tagName };
    }
    stats.totalTracked = Object.keys(elementMap).length;
  }

  // Build element map: id → {element, bbox, type}
  const elementMap = {};
  if (trackedElements.length > 0) {
    // Use tracked elements
    for (const el of trackedElements) {
      const bbox = computeBBox(el, root);
      elementMap[el.getAttr('data-svgc-id')] = {
        element: el,
        bbox,
        type: el.getAttr('data-svgc-type') || 'unknown',
        parent: el.getAttr('data-svgc-parent') || null,
        tagName: el.tagName,
      };
    }
  } else {
    // Use auto-classified elements
    const allVisual = extractAllVisualElements(root);
    let autoId = 0;
    for (const el of allVisual) {
      const bbox = computeBBox(el, root);
      if (!bbox || (bbox.width === 0 && bbox.height === 0)) continue;
      const id = `auto-${autoId++}-${el.tagName}`;
      const type = autoClassifyElement(el);
      elementMap[id] = { element: el, bbox, type, parent: null, tagName: el.tagName };
    }
  }

  stats.totalTracked = Object.keys(elementMap).length;

  // Check 1: Boundary violations
  for (const [id, info] of Object.entries(elementMap)) {
    if (!info.bbox) continue;

    // Skip elements that are expected at edges
    const skipTypes = ['grid-line', 'text-decoration', 'axis-line'];
    if (skipTypes.includes(info.type)) continue;

    if (!isInsideRect(info.bbox, viewBox, 0)) {
      const overflowRight = (info.bbox.x + info.bbox.width) - (viewBox.x + viewBox.width);
      const overflowBottom = (info.bbox.y + info.bbox.height) - (viewBox.y + viewBox.height);
      const overflowLeft = viewBox.x - info.bbox.x;
      const overflowTop = viewBox.y - info.bbox.y;

      const overflowDesc = [];
      if (overflowRight > 0) overflowDesc.push(`right edge +${overflowRight.toFixed(0)}px`);
      if (overflowBottom > 0) overflowDesc.push(`bottom edge +${overflowBottom.toFixed(0)}px`);
      if (overflowLeft > 0) overflowDesc.push(`left edge -${overflowLeft.toFixed(0)}px`);
      if (overflowTop > 0) overflowDesc.push(`top edge -${overflowTop.toFixed(0)}px`);

      violations.push({
        severity: 'CRITICAL',
        category: 'boundary',
        element: id,
        message: `Element "${id}" (type: ${info.type}) extends outside viewBox: ${overflowDesc.join(', ')}`,
        bbox: info.bbox,
        viewBox,
        suggestion: `Reposition element inside viewBox bounds. Current position: (${info.bbox.x}, ${info.bbox.y}), size: ${info.bbox.width}×${info.bbox.height}`,
      });
      stats.violationsFound++;
    }
  }

  // Check 2: Overlap violations
  const ids = Object.keys(elementMap);
  const checkedPairs = new Set();

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const idA = ids[i];
      const idB = ids[j];
      const infoA = elementMap[idA];
      const infoB = elementMap[idB];

      // Both must have valid bboxes
      if (!infoA.bbox || !infoB.bbox) continue;

      // Skip if both bboxes are zero-sized (points)
      if (infoA.bbox.width === 0 && infoA.bbox.height === 0) continue;
      if (infoB.bbox.width === 0 && infoB.bbox.height === 0) continue;

      // Check for overlap
      if (!rectsOverlap(infoA.bbox, infoB.bbox)) continue;

      stats.totalOverlapsChecked++;

      // Is this overlap allowed?
      const allowance = isOverlapAllowed(infoA.element, infoB.element);

      if (!allowance.allowed) {
        const overlapArea = rectOverlapArea(infoA.bbox, infoB.bbox);
        violations.push({
          severity: 'HIGH',
          category: 'overlap',
          elements: [idA, idB],
          types: [infoA.type, infoB.type],
          message: `Unallowed overlap: "${idA}" (${infoA.type}) overlaps "${idB}" (${infoB.type}) — overlap area: ${overlapArea.toFixed(0)}px²`,
          bboxA: infoA.bbox,
          bboxB: infoB.bbox,
          reason: allowance.reason,
          suggestion: `Adjust position of one element. Element A "${idA}" at (${infoA.bbox.x}, ${infoA.bbox.y}), Element B "${idB}" at (${infoB.bbox.x}, ${infoB.bbox.y})`,
        });
        stats.violationsFound++;
      }

      checkedPairs.add(`${idA}↔${idB}`);
    }
  }

  // Check 3: Elements without tracking
  const allVisualElements = findElements(root, el =>
    ['rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'path', 'text'].includes(el.tagName) &&
    el.getAttr('data-svgc-id') === null &&
    // Exclude defs, style, and other non-visual elements
    !isInsideDefs(el)
  );

  if (allVisualElements.length > 0 && !stats.untrackedMode) {
    warnings.push({
      severity: 'LOW',
      category: 'untracked',
      count: allVisualElements.length,
      message: `${allVisualElements.length} visual elements are not tracked with data-svgc-id (incomplete validation coverage)`,
      suggestion: 'Add data-svgc-id and data-svgc-type attributes to all rendered elements',
    });
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 4: Color Contrast Analysis
  // ══════════════════════════════════════════════════════════════
  const allVisualElsForContrast = extractAllVisualElements(root);
  const bgElForContrast = findBackgroundElement(allVisualElsForContrast);
  let bgColor = { r: 255, g: 255, b: 255 }; // Default white

  if (bgElForContrast) {
    const bgFill = getEffectiveFill(bgElForContrast);
    const parsedBg = parseColorToRGB(bgFill);
    if (parsedBg) bgColor = parsedBg;
  }

  const bgLuminance = relativeLuminance(bgColor.r, bgColor.g, bgColor.b);

  for (const el of allVisualElsForContrast) {
    if (el.tagName !== 'text') continue;
    const textContent = getTextContent(el);
    if (!textContent) continue;

    stats.contrastChecks = (stats.contrastChecks || 0) + 1;
    const textColorStr = getTextColor(el);
    const textColor = parseColorToRGB(textColorStr);
    if (!textColor) continue;

    const textLuminance = relativeLuminance(textColor.r, textColor.g, textColor.b);
    const ratio = contrastRatio(textLuminance, bgLuminance);
    const fontSize = parseFontSize(el);
    const isLargeText = fontSize >= 18 || (fontSize >= 14 && el.attributes['font-weight'] === 'bold');
    const threshold = isLargeText ? 3.0 : 4.5;

    if (ratio < threshold) {
      stats.contrastViolations = (stats.contrastViolations || 0) + 1;
      warnings.push({
        severity: ratio < 2.5 ? 'HIGH' : 'MEDIUM',
        category: 'contrast',
        element: el.getAttr('data-svgc-id') || textContent.slice(0, 20),
        message: `Low contrast: text "${textContent.slice(0, 30)}" (${textColorStr}, ${fontSize}px) vs background — ratio ${ratio.toFixed(1)}:1 (need ≥${threshold}:1)`,
        contrastRatio: ratio.toFixed(1),
        suggestion: ratio < 2.5
          ? `CRITICAL: Darken/lighten text. Current: ${textColorStr}`
          : `Adjust text color. Current: ${textColorStr}`,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 5: Edge Proximity Warnings
  // ══════════════════════════════════════════════════════════════
  const edgeThreshold = Math.min(viewBox.width * 0.03, viewBox.height * 0.03, 20);

  for (const [id, info] of Object.entries(elementMap)) {
    if (!info.bbox) continue;
    const skipTypes = ['grid-line', 'text-decoration', 'axis-line', 'axis-tick'];
    if (skipTypes.includes(info.type)) continue;

    const distToLeft = info.bbox.x - viewBox.x;
    const distToRight = (viewBox.x + viewBox.width) - (info.bbox.x + info.bbox.width);
    const distToTop = info.bbox.y - viewBox.y;
    const distToBottom = (viewBox.y + viewBox.height) - (info.bbox.y + info.bbox.height);

    const tooClose = [];
    if (distToLeft < edgeThreshold && distToLeft >= 0) tooClose.push(`left (${distToLeft.toFixed(0)}px)`);
    if (distToRight < edgeThreshold && distToRight >= 0) tooClose.push(`right (${distToRight.toFixed(0)}px)`);
    if (distToTop < edgeThreshold && distToTop >= 0) tooClose.push(`top (${distToTop.toFixed(0)}px)`);
    if (distToBottom < edgeThreshold && distToBottom >= 0) tooClose.push(`bottom (${distToBottom.toFixed(0)}px)`);

    if (tooClose.length > 0) {
      const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
      warnings.push({
        severity: minDist < 2 ? 'HIGH' : 'MEDIUM',
        category: 'edge-proximity',
        element: id,
        message: `Near edge: "${id}" (${info.type}) within ${edgeThreshold.toFixed(0)}px of ${tooClose.join(', ')}`,
        suggestion: 'Move element away from viewBox edge or increase viewBox padding',
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 6: Proportion & Font Size Checks
  // ══════════════════════════════════════════════════════════════
  for (const el of allVisualElsForContrast) {
    if (el.tagName !== 'text') continue;
    const fontSize = parseFontSize(el);
    const text = getTextContent(el);
    if (!text || fontSize === 0) continue;
    if (fontSize < 8) {
      warnings.push({
        severity: 'MEDIUM',
        category: 'font-size',
        message: `Tiny text "${text.slice(0, 20)}" at ${fontSize}px — below 8px minimum for projector readability`,
        suggestion: 'Increase font size to at least 8px',
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 7: Visual Balance — content centering
  // ══════════════════════════════════════════════════════════════
  // Computes the "center of mass" of all content elements and compares
  // to the viewBox center. Flags significant asymmetry.
  const allBBoxes = Object.values(elementMap).map(info => info.bbox).filter(Boolean);
  if (allBBoxes.length >= 3) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of allBBoxes) {
      if (b.width === 0 && b.height === 0) continue;
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.width);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (minX !== Infinity) {
      const contentCenterX = (minX + maxX) / 2;
      const contentCenterY = (minY + maxY) / 2;
      const viewCenterX = viewBox.x + viewBox.width / 2;
      const viewCenterY = viewBox.y + viewBox.height / 2;
      const offsetX = Math.abs(contentCenterX - viewCenterX);
      const offsetY = Math.abs(contentCenterY - viewCenterY);
      const thresholdX = viewBox.width * 0.08; // 8% of width
      const thresholdY = viewBox.height * 0.10; // 10% of height

      if (offsetX > thresholdX) {
        const direction = contentCenterX < viewCenterX ? 'LEFT' : 'RIGHT';
        warnings.push({
          severity: 'MEDIUM',
          category: 'visual-balance',
          message: `Content is shifted ${direction}: content center at x=${contentCenterX.toFixed(0)}, viewBox center at x=${viewCenterX.toFixed(0)} (offset: ${offsetX.toFixed(0)}px, ${((offsetX/viewBox.width)*100).toFixed(0)}% of width)`,
          suggestion: `Shift all content elements ${direction === 'LEFT' ? 'right' : 'left'} by ${offsetX.toFixed(0)}px to center within the viewBox`,
        });
      }
      if (offsetY > thresholdY) {
        const direction = contentCenterY < viewCenterY ? 'UP' : 'DOWN';
        warnings.push({
          severity: 'MEDIUM',
          category: 'visual-balance',
          message: `Content is shifted ${direction}: content center at y=${contentCenterY.toFixed(0)}, viewBox center at y=${viewCenterY.toFixed(0)} (offset: ${offsetY.toFixed(0)}px, ${((offsetY/viewBox.height)*100).toFixed(0)}% of height)`,
          suggestion: `Shift all content elements ${direction === 'UP' ? 'down' : 'up'} by ${offsetY.toFixed(0)}px to center within the viewBox`,
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 8: Aesthetic Rules — measurable polish issues
  // ══════════════════════════════════════════════════════════════

  // 8a: Line-text proximity — text overlapping non-label paths
  for (const el of allVisualEls) {
    if (el.tagName !== 'text') continue;
    const textBbox = computeBBox(el, root);
    if (!textBbox || textBbox.width === 0) continue;
    const textContent = getTextContent(el);
    if (!textContent) continue;

    for (const other of allVisualEls) {
      if (other.tagName !== 'path' && other.tagName !== 'line') continue;
      const pathBbox = computeBBox(other, root);
      if (!pathBbox) continue;

      // Skip if text is an edge-label on this edge (allowed)
      const textParent = el.getAttr('data-svgc-parent');
      const pathParent = other.getAttr('data-svgc-parent');
      if (textParent && pathParent && textParent === pathParent) continue;

      if (rectsOverlap(textBbox, pathBbox, 0)) {
        // Check that text is not an intentional label for this path
        const textType = el.getAttr('data-svgc-type');
        const pathType = other.getAttr('data-svgc-type');
        if (textType === 'edge-label' && pathType === 'edge-path') continue;

        warnings.push({
          severity: 'MEDIUM',
          category: 'aesthetic-line-text',
          message: `Text "${textContent.slice(0, 25)}" overlaps non-label path/line — visually cluttered`,
          suggestion: 'Move text away from the line, or move the line to avoid the text',
        });
        break; // One warning per text element
      }
    }
  }

  // 8b: Stub arrows — arrow shaft shorter than 2x marker size
  const markerW = 6; // default markerWidth
  for (const el of allVisualEls) {
    if ((el.tagName !== 'line' && el.tagName !== 'path') || !el.hasAttr('marker-end')) continue;
    let shaftLen = 0;
    if (el.tagName === 'line') {
      const x1 = parseNum(el.attributes.x1, 0), y1 = parseNum(el.attributes.y1, 0);
      const x2 = parseNum(el.attributes.x2, 0), y2 = parseNum(el.attributes.y2, 0);
      shaftLen = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    } else {
      // Path: extract last segment length
      const d = (el.attributes.d || '').trim();
      const coords = d.match(/[-\d.]+/g);
      if (coords && coords.length >= 4) {
        const px = parseFloat(coords[coords.length-4]);
        const py = parseFloat(coords[coords.length-3]);
        const qx = parseFloat(coords[coords.length-2]);
        const qy = parseFloat(coords[coords.length-1]);
        shaftLen = Math.sqrt((qx-px)**2 + (qy-py)**2);
      }
    }
    if (shaftLen > 0 && shaftLen < markerW * 2 && shaftLen < 15) {
      warnings.push({
        severity: 'MEDIUM',
        category: 'aesthetic-stub-arrow',
        message: `${el.tagName} arrow shaft is only ${shaftLen.toFixed(0)}px — nearly invisible. Minimum 15px recommended for visual clarity.`,
        suggestion: 'Extend the line/path so the arrow has a visible shaft before the arrowhead',
      });
    }
  }

  // 8c: Connector visibility — lines between elements too short
  for (const el of allVisualEls) {
    if (el.tagName !== 'line') continue;
    if (!el.hasAttr('marker-end')) continue;
    const x1 = parseNum(el.attributes.x1, 0), y1 = parseNum(el.attributes.y1, 0);
    const x2 = parseNum(el.attributes.x2, 0), y2 = parseNum(el.attributes.y2, 0);
    const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    if (len < 20 && len > 0) {
      warnings.push({
        severity: 'MEDIUM',
        category: 'aesthetic-short-connector',
        message: `Connector line is only ${len.toFixed(0)}px — barely visible between elements`,
        suggestion: 'Increase spacing between the connected elements, or move the connector endpoint',
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 9: Text-Container Overflow
  // ══════════════════════════════════════════════════════════════
  // For every text with a data-svgc-parent, verify it fits inside
  // its parent container (card, node, badge, etc.)
  for (const [id, info] of Object.entries(elementMap)) {
    if (!info.bbox) continue;
    if (info.type !== 'node-text' && info.type !== 'text-body' &&
        info.type !== 'text-heading' && info.type !== 'text-title') continue;
    if (!info.parent) continue;
    const parentInfo = elementMap[info.parent];
    if (!parentInfo || !parentInfo.bbox) continue;
    // Parent must be a container type (card, node-shape, group-box)
    if (parentInfo.type !== 'text-card' && parentInfo.type !== 'node-shape' &&
        parentInfo.type !== 'node' && parentInfo.type !== 'group-box') continue;

    const textBbox = info.bbox;
    const containerBbox = parentInfo.bbox;
    const overflowLeft = containerBbox.x - textBbox.x;
    const overflowRight = (textBbox.x + textBbox.width) - (containerBbox.x + containerBbox.width);
    const overflowTop = containerBbox.y - textBbox.y;
    const overflowBottom = (textBbox.y + textBbox.height) - (containerBbox.y + containerBbox.height);
    const maxOverflow = Math.max(overflowLeft, overflowRight, overflowTop, overflowBottom);

    if (maxOverflow > 3) {
      const dirs = [];
      if (overflowLeft > 3) dirs.push(`left +${overflowLeft.toFixed(0)}px`);
      if (overflowRight > 3) dirs.push(`right +${overflowRight.toFixed(0)}px`);
      if (overflowTop > 3) dirs.push(`top +${overflowTop.toFixed(0)}px`);
      if (overflowBottom > 3) dirs.push(`bottom +${overflowBottom.toFixed(0)}px`);

      warnings.push({
        severity: 'HIGH',
        category: 'text-container-overflow',
        element: id,
        message: `Text "${id}" overflows its container "${info.parent}" (${parentInfo.type}): ${dirs.join(', ')}`,
        suggestion: overflowRight > 3
          ? `Widen the container by ${overflowRight.toFixed(0)}px, or shorten/label-wrap the text, or reduce font-size`
          : `Adjust the container size or text position to keep text within bounds`,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECK 10: Label Badge Overflow (sibling text + rect pairs)
  // ══════════════════════════════════════════════════════════════
  // Detects text that visually belongs inside a nearby small rect
  // (label badge pattern) but extends beyond it. These are siblings
  // without data-svgc-parent, so CHECK 9 misses them.
  const badgeRects = allVisualEls.filter(el =>
    el.tagName === 'rect' &&
    parseNum(el.attributes.width, 0) > 20 &&
    parseNum(el.attributes.width, 0) < 200 &&
    parseNum(el.attributes.height, 0) > 15 &&
    parseNum(el.attributes.height, 0) < 60
  );

  for (const rect of badgeRects) {
    const rBbox = computeBBox(rect, root);
    if (!rBbox) continue;
    const rFill = getEffectiveFill(rect);
    // Only check filled rects (likely badges, not border-only rects)
    if (!rFill || rFill === 'none') continue;

    for (const el of allVisualEls) {
      if (el.tagName !== 'text') continue;
      const textBbox = computeBBox(el, root);
      if (!textBbox) continue;
      const textContent = getTextContent(el);
      if (!textContent) continue;

      // Text center must be inside the rect (they're visually associated)
      const textCX = textBbox.x + textBbox.width / 2;
      const textCY = textBbox.y + textBbox.height / 2;
      if (textCX < rBbox.x || textCX > rBbox.x + rBbox.width ||
          textCY < rBbox.y || textCY > rBbox.y + rBbox.height) continue;

      // Text should be fully inside the rect
      const overLeft = rBbox.x - textBbox.x;
      const overRight = (textBbox.x + textBbox.width) - (rBbox.x + rBbox.width);
      const overTop = rBbox.y - textBbox.y;
      const overBottom = (textBbox.y + textBbox.height) - (rBbox.y + rBbox.height);

      if (Math.max(overLeft, overRight, overTop, overBottom) > 3) {
        warnings.push({
          severity: 'HIGH',
          category: 'label-badge-overflow',
          message: `Label text "${textContent.slice(0, 20)}" overflows its visual badge background — text extends ${Math.max(overLeft, overRight).toFixed(0)}px beyond the rect`,
          suggestion: `Widen the badge rect by ${Math.max(overLeft, overRight).toFixed(0)}px, or use text-anchor="middle" to center the text in the badge`,
        });
        break; // One warning per badge
      }
    }
  }

  return {
    svgPath,
    viewBox,
    stats: {
      ...stats,
      totalOverlapPairsChecked: checkedPairs.size,
      untrackedElements: stats.untrackedMode ? 0 : allVisualElements.length,
      contrastChecks: stats.contrastChecks || 0,
      contrastViolations: stats.contrastViolations || 0,
    },
    violations,
    warnings,
    summary: violations.length === 0
      ? '✅ PASS — No violations found'
      : `❌ FAIL — ${violations.length} violation(s) found (${violations.filter(v => v.severity === 'CRITICAL').length} critical, ${violations.filter(v => v.severity === 'HIGH').length} high)`,
    pass: violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH').length === 0,
  };
}

function parseViewBox(viewBoxStr) {
  const parts = (viewBoxStr || '0 0 1280 720').trim().split(/\s+/).map(Number);
  return {
    x: parts[0] || 0,
    y: parts[1] || 0,
    width: parts[2] || 1280,
    height: parts[3] || 720,
  };
}

function isInsideDefs(el) {
  let current = el;
  while (current) {
    if (current.tagName === 'defs') return true;
    current = current.parent;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// OUTPUT FORMATTERS
// ═══════════════════════════════════════════════════════════════════

function formatReport(result) {
  const lines = [];
  lines.push('═'.repeat(72));
  lines.push('  SVG VALIDATION REPORT');
  lines.push('═'.repeat(72));
  lines.push(`  File:    ${result.svgPath}`);
  lines.push(`  ViewBox: ${result.viewBox.x} ${result.viewBox.y} ${result.viewBox.width} ${result.viewBox.height}`);
  lines.push(`  Tracked: ${result.stats.totalTracked} elements`);
  lines.push(`  Checked: ${result.stats.totalOverlapPairsChecked} overlap pairs`);
  lines.push(`  Untracked: ${result.stats.untrackedElements} visual elements`);
  lines.push('─'.repeat(72));
  lines.push(`  ${result.summary}`);
  lines.push('─'.repeat(72));

  if (result.violations.length > 0) {
    lines.push('');
    lines.push('  VIOLATIONS:');
    for (const v of result.violations) {
      const icon = v.severity === 'CRITICAL' ? '🔴' : '🟠';
      lines.push(`  ${icon} [${v.severity}] [${v.category}] ${v.message}`);
      if (v.suggestion) {
        lines.push(`     💡 ${v.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('  WARNINGS:');
    for (const w of result.warnings) {
      lines.push(`  🟡 [${w.severity}] ${w.message}`);
    }
  }

  lines.push('');
  lines.push('═'.repeat(72));

  return lines.join('\n');
}

function generateHTMLReport(result) {
  const violationsHTML = result.violations.map(v => `
    <div class="violation ${v.severity.toLowerCase()}">
      <span class="severity">${v.severity}</span>
      <span class="category">${v.category}</span>
      <p class="message">${v.message}</p>
      ${v.suggestion ? `<p class="suggestion">💡 ${v.suggestion}</p>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SVG Validation Report — ${result.svgPath}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .summary { padding: 16px 24px; border-radius: 8px; margin-bottom: 24px; font-weight: bold; }
    .pass { background: #dcfce7; color: #166534; }
    .fail { background: #fef2f2; color: #991b1b; }
    .violation { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .violation.critical { border-left: 4px solid #ef4444; }
    .violation.high { border-left: 4px solid #f97316; }
    .severity { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .critical .severity { background: #fef2f2; color: #ef4444; }
    .high .severity { background: #fff7ed; color: #f97316; }
    .category { font-size: 12px; color: #64748b; }
    .message { margin-top: 8px; font-size: 14px; }
    .suggestion { margin-top: 4px; font-size: 13px; color: #2563eb; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; flex: 1; text-align: center; }
    .stat .value { font-size: 28px; font-weight: bold; }
    .stat .label { font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SVG Validation Report</h1>
    <div class="meta">
      File: ${result.svgPath} | ViewBox: ${result.viewBox.width}×${result.viewBox.height}
    </div>
    <div class="summary ${result.pass ? 'pass' : 'fail'}">${result.summary}</div>
    <div class="stats">
      <div class="stat"><div class="value">${result.stats.totalTracked}</div><div class="label">Tracked Elements</div></div>
      <div class="stat"><div class="value">${result.stats.totalOverlapPairsChecked}</div><div class="label">Overlap Checks</div></div>
      <div class="stat"><div class="value">${result.stats.violationsFound}</div><div class="label">Violations</div></div>
      <div class="stat"><div class="value">${result.stats.untrackedElements}</div><div class="label">Untracked</div></div>
    </div>
    ${violationsHTML}
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const svgPath = args.find(a => !a.startsWith('--'));
  const jsonMode = args.includes('--json');
  const htmlMode = args.includes('--html');

  if (!svgPath) {
    console.error('Usage: node validate-svg.js <file.svg> [--json] [--html]');
    console.error('  --json   Output machine-readable JSON');
    console.error('  --html   Generate visual HTML report');
    process.exit(2);
  }

  let result;
  try {
    result = validateSVG(svgPath);
  } catch (err) {
    console.error(JSON.stringify({ error: 'Parse failed', message: err.message }));
    process.exit(2);
  }

  if (htmlMode) {
    const htmlPath = svgPath.replace(/\.svg$/, '-report.html');
    writeFileSync(htmlPath, generateHTMLReport(result));
    console.log(`HTML report written to: ${htmlPath}`);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReport(result));
  }

  process.exit(result.pass ? 0 : 1);
}

main();
