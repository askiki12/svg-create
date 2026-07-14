#!/usr/bin/env node
/**
 * layout-graph.js — Deterministic Graph Layout Engine for svg-create
 *
 * Replaces LLM coordinate estimation with precise, deterministic algorithms.
 *
 * Input:  Graph IR JSON (from stdin or --file)
 * Output: Positioned IR JSON (to stdout)
 *
 * Usage:
 *   node layout-graph.js --file graph-ir.json
 *   echo '{"nodes":[...],"edges":[...]}' | node layout-graph.js
 *   node layout-graph.js --file ir.json --width 1280 --height 720
 */

import { readFileSync } from 'fs';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const DEFAULTS = {
  canvasWidth: 1280,
  canvasHeight: 720,
  margin: 40,
  nodeMinWidth: 100,
  nodeMinHeight: 44,
  nodeHPadding: 16,
  nodeVPadding: 12,
  layerGap: 80,
  nodeHGap: 32,
  nodeVGap: 24,
  fontSize: 14,
  fontWidthCJK: 1.0,
  fontWidthLatin: 0.55,
};

// ═══════════════════════════════════════════════════════════════════
// TEXT WIDTH ESTIMATION
// ═══════════════════════════════════════════════════════════════════

function estimateTextWidth(text, fontSize = DEFAULTS.fontSize) {
  let width = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF) ||
        (code >= 0xAC00 && code <= 0xD7AF)) {
      width += fontSize * DEFAULTS.fontWidthCJK;
    } else if (char === ' ') {
      width += fontSize * 0.3;
    } else {
      width += fontSize * DEFAULTS.fontWidthLatin;
    }
  }
  return Math.ceil(width);
}

function computeNodeSize(label, minW = DEFAULTS.nodeMinWidth, minH = DEFAULTS.nodeMinHeight) {
  const textW = estimateTextWidth(label);
  const width = Math.max(minW, textW + DEFAULTS.nodeHPadding * 2);
  const height = minH;
  return { width, height, textWidth: textW };
}

// ═══════════════════════════════════════════════════════════════════
// LAYERED GRID LAYOUT — Architecture Diagrams
// ═══════════════════════════════════════════════════════════════════

function layoutLayeredGrid(ir, cfg) {
  const { margin, layerGap, nodeHGap } = cfg;
  const contentW = cfg.canvasWidth - margin * 2;

  // Group nodes by layer
  const layers = {};
  for (const node of ir.nodes) {
    const layer = node.layer || 0;
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(node);
  }

  const layerKeys = Object.keys(layers).map(Number).sort((a, b) => a - b);
  const positionedNodes = [];
  const positionedGroups = [];

  // Calculate total height needed
  let totalHeight = 0;
  for (const lk of layerKeys) {
    const maxNodeH = Math.max(...layers[lk].map(n => {
      const sz = computeNodeSize(n.label, cfg.nodeMinWidth, cfg.nodeMinHeight);
      return sz.height;
    }));
    totalHeight += maxNodeH + (lk < layerKeys[layerKeys.length - 1] ? layerGap : 0);
  }

  // Check if content fits horizontally
  const maxNodesInLayer = Math.max(...layerKeys.map(lk => layers[lk].length));
  const estimatedColW = contentW / Math.max(maxNodesInLayer, 1);
  const needsHorizontalScroll = estimatedColW < cfg.nodeMinWidth + nodeHGap;

  let currentY = margin + cfg.titleHeight;

  for (const lk of layerKeys) {
    const nodesInLayer = layers[lk];
    const colW = contentW / nodesInLayer.length;
    const nodeSizes = nodesInLayer.map(n => computeNodeSize(n.label, cfg.nodeMinWidth, cfg.nodeMinHeight));
    const maxH = Math.max(...nodeSizes.map(s => s.height));

    // If there are groups for this layer, place them first
    const layerGroups = (ir.groups || []).filter(g => {
      const gNodes = g.nodes || [];
      return gNodes.some(gn => nodesInLayer.find(n => n.id === gn));
    });

    // Position nodes evenly within the layer
    for (let i = 0; i < nodesInLayer.length; i++) {
      const node = nodesInLayer[i];
      const size = nodeSizes[i];
      const x = margin + i * colW + (colW - size.width) / 2;
      const y = currentY;
      const cx = x + size.width / 2;
      const cy = y + size.height / 2;

      positionedNodes.push({
        id: node.id,
        label: node.label,
        shape: node.shape || 'rounded_rect',
        x, y, width: size.width, height: size.height,
        centerX: cx, centerY: cy,
        ports: {
          top: { x: cx, y },
          bottom: { x: cx, y: y + size.height },
          left: { x, y: cy },
          right: { x: x + size.width, y: cy },
        },
        layer: lk,
        highlight: node.highlight || false,
        class: node.class || null,
      });
    }

    currentY += maxH + layerGap;
  }

  // Position groups (boundary boxes around their nodes)
  for (const group of (ir.groups || [])) {
    const groupNodeIds = group.nodes || [];
    const groupNodes = positionedNodes.filter(n => groupNodeIds.includes(n.id));
    if (groupNodes.length === 0) continue;

    const minX = Math.min(...groupNodes.map(n => n.x)) - 16;
    const minY = Math.min(...groupNodes.map(n => n.y)) - 28; // room for label
    const maxX = Math.max(...groupNodes.map(n => n.x + n.width)) + 16;
    const maxY = Math.max(...groupNodes.map(n => n.y + n.height)) + 16;

    positionedGroups.push({
      id: group.id || `group-${group.label}`,
      label: group.label,
      x: minX, y: minY,
      width: maxX - minX, height: maxY - minY,
      type: group.type || 'boundary',
      nodes: groupNodeIds,
    });
  }

  return { positionedNodes, positionedGroups, metadata: { algorithm: 'layered-grid' } };
}

// ═══════════════════════════════════════════════════════════════════
// SUGIYAMA HIERARCHICAL LAYOUT — Flowcharts
// ═══════════════════════════════════════════════════════════════════

function layoutSugiyama(ir, cfg) {
  const { margin, nodeVGap, nodeHGap } = cfg;
  const direction = ir.direction || 'TB';

  // Step 1: Assign ranks (topological sort)
  const ranks = assignRanks(ir.nodes, ir.edges);

  // Step 2: Order nodes within ranks to minimize crossings
  const orderedRanks = orderRanks(ranks, ir.edges);

  // Step 3: Position nodes
  const positionedNodes = [];
  const maxRank = Math.max(...ranks.values());
  const rankEntries = [...orderedRanks.entries()].sort((a, b) => a[0] - b[0]);
  const rankCount = rankEntries.length;

  let contentLength;
  if (direction === 'TB' || direction === 'TD') {
    contentLength = cfg.canvasHeight - margin * 2 - (cfg.titleHeight || 0);
  } else {
    contentLength = cfg.canvasWidth - margin * 2;
  }

  const rankGap = contentLength / rankCount;
  const isVertical = direction === 'TB' || direction === 'TD';

  for (const [rank, nodeIds] of rankEntries) {
    const count = nodeIds.length;
    const crossLength = isVertical ? (cfg.canvasWidth - margin * 2) : (cfg.canvasHeight - margin * 2);
    const gap = crossLength / (count + 1);

    for (let i = 0; i < count; i++) {
      const nodeId = nodeIds[i];
      const nodeData = ir.nodes.find(n => n.id === nodeId);
      if (!nodeData) continue;

      const size = computeNodeSize(nodeData.label, cfg.nodeMinWidth, cfg.nodeMinHeight);
      const crossPos = margin + (i + 1) * gap - size.width / 2;

      let x, y;
      if (isVertical) {
        x = crossPos;
        y = margin + (cfg.titleHeight || 0) + rank * rankGap;
      } else {
        x = margin + rank * rankGap;
        y = crossPos;
      }

      const cx = x + size.width / 2;
      const cy = y + size.height / 2;

      positionedNodes.push({
        id: nodeData.id,
        label: nodeData.label,
        shape: nodeData.shape || 'rounded_rect',
        x, y, width: size.width, height: size.height,
        centerX: cx, centerY: cy,
        ports: {
          top: { x: cx, y },
          bottom: { x: cx, y: y + size.height },
          left: { x, y: cy },
          right: { x: x + size.width, y: cy },
        },
        rank,
        highlight: nodeData.highlight || false,
      });
    }
  }

  // Step 4: Route edges
  const positionedEdges = routeEdges(ir.edges, positionedNodes, direction, cfg);

  return {
    positionedNodes,
    positionedEdges,
    positionedGroups: [],
    metadata: { algorithm: 'sugiyama', rankCount, direction },
  };
}

function assignRanks(nodes, edges) {
  const ranks = new Map();
  const inDegree = new Map();

  // Initialize
  for (const node of nodes) {
    ranks.set(node.id, 0);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  // Find sources (in-degree 0)
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  if (queue.length === 0 && nodes.length > 0) {
    // Graph has cycles — assign all to rank 0
    queue.push(nodes[0].id);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const currentRank = ranks.get(current);

    for (const edge of edges) {
      if (edge.from === current) {
        const newRank = currentRank + 1;
        if (newRank > (ranks.get(edge.to) || 0)) {
          ranks.set(edge.to, newRank);
        }
        const newDeg = (inDegree.get(edge.to) || 1) - 1;
        inDegree.set(edge.to, newDeg);
        if (newDeg === 0) queue.push(edge.to);
      }
    }
  }

  return ranks;
}

function orderRanks(ranks, edges) {
  const ordered = new Map();
  const maxRank = Math.max(...ranks.values());

  for (let r = 0; r <= maxRank; r++) {
    const nodeIds = [...ranks.entries()].filter(([, rank]) => rank === r).map(([id]) => id);

    // Simple barycenter heuristic to reduce crossings
    if (r > 0) {
      const prevRankNodes = ordered.get(r - 1) || [];
      nodeIds.sort((a, b) => {
        const aBary = barycenter(a, prevRankNodes, edges);
        const bBary = barycenter(b, prevRankNodes, edges);
        return aBary - bBary;
      });
    }

    ordered.set(r, nodeIds);
  }

  return ordered;
}

function barycenter(nodeId, prevRankNodes, edges) {
  let sum = 0, count = 0;
  for (let i = 0; i < prevRankNodes.length; i++) {
    const hasEdge = edges.some(e => e.from === prevRankNodes[i] && e.to === nodeId);
    if (hasEdge) { sum += i; count++; }
  }
  return count === 0 ? Infinity : sum / count;
}

function routeEdges(edges, positionedNodes, direction, cfg) {
  const positionedEdges = [];
  const nodeMap = {};
  for (const n of positionedNodes) nodeMap[n.id] = n;

  for (const edge of edges) {
    const fromNode = nodeMap[edge.from];
    const toNode = nodeMap[edge.to];
    if (!fromNode || !toNode) continue;

    const isVertical = direction === 'TB' || direction === 'TD';

    // Choose best ports
    let fromPort, toPort;
    if (isVertical) {
      fromPort = fromNode.ports.bottom;
      toPort = toNode.ports.top;
    } else {
      fromPort = fromNode.ports.right;
      toPort = toNode.ports.left;
    }

    // Orthogonal routing with one bend
    let path;
    if (isVertical) {
      const midY = (fromPort.y + toPort.y) / 2;
      path = `M ${fromPort.x} ${fromPort.y} L ${fromPort.x} ${midY} L ${toPort.x} ${midY} L ${toPort.x} ${toPort.y}`;
    } else {
      const midX = (fromPort.x + toPort.x) / 2;
      path = `M ${fromPort.x} ${fromPort.y} L ${midX} ${fromPort.y} L ${midX} ${toPort.y} L ${toPort.x} ${toPort.y}`;
    }

    // Label position (midpoint of the middle segment)
    const labelX = isVertical ? (fromPort.x + toPort.x) / 2 : (fromPort.x + toPort.x) / 2;
    const labelY = isVertical ? (fromPort.y + toPort.y) / 2 : (fromPort.y + toPort.y) / 2;

    positionedEdges.push({
      from: edge.from,
      to: edge.to,
      label: edge.label || null,
      style: edge.style || 'solid',
      path,
      labelPosition: { x: labelX, y: labelY },
      fromPort, toPort,
    });
  }

  return positionedEdges;
}

// ═══════════════════════════════════════════════════════════════════
// TREE LAYOUT — Org Charts / Mindmaps
// ═══════════════════════════════════════════════════════════════════

function layoutTree(ir, cfg) {
  const { margin, nodeHGap, nodeVGap } = cfg;

  // Find root (node with no incoming edges, or first node)
  const hasIncoming = new Set(ir.edges.map(e => e.to));
  const rootId = ir.nodes.find(n => !hasIncoming.has(n.id))?.id || ir.nodes[0]?.id;
  if (!rootId) return { positionedNodes: [], positionedEdges: [], positionedGroups: [] };

  // Build adjacency
  const children = {};
  for (const n of ir.nodes) children[n.id] = [];
  for (const e of ir.edges) {
    if (children[e.from]) children[e.from].push(e.to);
  }

  // Recursive positioning using Walker's algorithm (simplified)
  const positions = [];
  const nodeWidths = {};
  for (const n of ir.nodes) {
    nodeWidths[n.id] = computeNodeSize(n.label, cfg.nodeMinWidth, cfg.nodeMinHeight).width;
  }

  let nextX = margin;
  const levelGap = cfg.nodeMinHeight + nodeVGap * 2;

  function traverse(nodeId, depth) {
    const sz = computeNodeSize(
      ir.nodes.find(n => n.id === nodeId)?.label || nodeId,
      cfg.nodeMinWidth, cfg.nodeMinHeight
    );

    // Process children first to know subtree width
    const kidIds = children[nodeId] || [];
    for (const kid of kidIds) traverse(kid, depth + 1);

    // If leaf, place at nextX; if internal, center over children
    let x;
    if (kidIds.length === 0) {
      x = nextX;
      nextX += sz.width + nodeHGap;
    } else {
      const kidPositions = kidIds.map(kid => positions.find(p => p.id === kid)).filter(Boolean);
      const leftMost = Math.min(...kidPositions.map(p => p.x));
      const rightMost = Math.max(...kidPositions.map(p => p.x + p.width));
      x = (leftMost + rightMost) / 2 - sz.width / 2;
    }

    const y = margin + (cfg.titleHeight || 0) + depth * levelGap;
    const cx = x + sz.width / 2;
    const cy = y + sz.height / 2;

    positions.push({
      id: nodeId,
      label: ir.nodes.find(n => n.id === nodeId)?.label || nodeId,
      shape: ir.nodes.find(n => n.id === nodeId)?.shape || 'rounded_rect',
      x, y, width: sz.width, height: sz.height,
      centerX: cx, centerY: cy,
      ports: {
        top: { x: cx, y },
        bottom: { x: cx, y: y + sz.height },
        left: { x, y: cy },
        right: { x: x + sz.width, y: cy },
      },
      depth,
    });
  }

  traverse(rootId, 0);

  // Route edges (direct lines parent→child)
  const positionedEdges = [];
  for (const edge of ir.edges) {
    const from = positions.find(p => p.id === edge.from);
    const to = positions.find(p => p.id === edge.to);
    if (!from || !to) continue;

    positionedEdges.push({
      from: edge.from, to: edge.to,
      label: edge.label || null,
      style: edge.style || 'solid',
      path: `M ${from.ports.bottom.x} ${from.ports.bottom.y} L ${to.ports.top.x} ${to.ports.top.y}`,
      labelPosition: {
        x: (from.ports.bottom.x + to.ports.top.x) / 2,
        y: (from.ports.bottom.y + to.ports.top.y) / 2,
      },
    });
  }

  return {
    positionedNodes: positions,
    positionedEdges,
    positionedGroups: [],
    metadata: { algorithm: 'tree', rootId },
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

function layoutGraph(ir, overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides };
  cfg.titleHeight = ir.title ? 80 : 0;

  const diagramType = ir.diagramType || 'architecture';

  let result;
  switch (diagramType) {
    case 'architecture':
      result = layoutLayeredGrid(ir, cfg);
      break;
    case 'flowchart':
    case 'state':
    case 'er':
    case 'class':
      result = layoutSugiyama(ir, cfg);
      break;
    case 'orgchart':
    case 'mindmap':
      result = layoutTree(ir, cfg);
      break;
    default:
      // Default to layered grid
      result = layoutLayeredGrid(ir, cfg);
  }

  // Add canvas metadata
  result.canvas = {
    width: cfg.canvasWidth,
    height: cfg.canvasHeight,
    margin: cfg.margin,
    titleHeight: cfg.titleHeight,
  };

  result.metadata = {
    ...result.metadata,
    totalNodes: ir.nodes.length,
    totalEdges: ir.edges.length,
  };

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  let input;

  if (fileIdx >= 0 && args[fileIdx + 1]) {
    input = readFileSync(args[fileIdx + 1], 'utf-8');
  } else {
    // Read from stdin
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
      input = Buffer.concat(chunks).toString('utf-8').trim();
      processInput(input, args);
    });
    return;
  }

  processInput(input, args);
}

function processInput(input, args) {
  if (!input) {
    console.error(JSON.stringify({ error: 'No input provided' }));
    process.exit(1);
  }

  let ir;
  try {
    ir = JSON.parse(input);
  } catch {
    console.error(JSON.stringify({ error: 'Invalid JSON input' }));
    process.exit(1);
  }

  // Parse overrides
  const overrides = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--width' && args[i + 1]) overrides.canvasWidth = parseInt(args[i + 1]);
    if (args[i] === '--height' && args[i + 1]) overrides.canvasHeight = parseInt(args[i + 1]);
    if (args[i] === '--margin' && args[i + 1]) overrides.margin = parseInt(args[i + 1]);
  }

  const result = layoutGraph(ir, overrides);
  result.success = true;
  console.log(JSON.stringify(result, null, 2));
}

main();
