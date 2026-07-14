#!/usr/bin/env node
/**
 * parse-mermaid.js — Mermaid AST Parser for svg-create Skill
 *
 * Usage:
 *   node parse-mermaid.js "graph TD; A-->B;"
 *   echo "graph TD; A-->B;" | node parse-mermaid.js
 *   node parse-mermaid.js --file diagram.mmd
 *
 * Output: JSON AST to stdout
 * Exit code: 0 on success, 1 on parse error
 */

import { readFileSync } from 'fs';

/**
 * Main: read input, parse, output JSON.
 */
async function main() {
  let input;

  // Determine input source
  const args = process.argv.slice(2);
  if (args[0] === '--file' && args[1]) {
    try {
      input = readFileSync(args[1], 'utf-8');
    } catch (err) {
      console.error(JSON.stringify({ success: false, error: `Cannot read file: ${args[1]} — ${err.message}` }));
      process.exit(1);
    }
  } else if (args.length > 0 && args[0] !== '--stdin') {
    input = args.join(' ');
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks).toString('utf-8').trim();
  }

  if (!input || input.trim().length === 0) {
    console.error(JSON.stringify({ success: false, error: 'No mermaid input provided' }));
    process.exit(1);
  }

  // Try mermaid.parse first (precise)
  let result;
  try {
    const mermaid = await import('mermaid');
    // mermaid.parse is synchronous despite the docs sometimes showing await
    const ast = await mermaid.default.parse(input.trim());
    result = extractFromMermaidAST(ast, input.trim());
  } catch (err) {
    // Fallback: structured heuristic extraction
    if (err.message?.includes('Cannot find module') || err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(JSON.stringify({
        success: false,
        error: 'mermaid package not installed. Run: npm install mermaid',
        fallback: 'heuristic'
      }));
      process.exit(1);
    }

    // Parse error from mermaid itself
    result = {
      success: false,
      error: err.message || String(err),
      raw: input.trim(),
      parseError: {
        message: err.message,
        // Try to extract line/column from mermaid error messages
        str: err.str,
        hash: err.hash,
      },
    };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

/**
 * Extract structured IR from mermaid AST.
 */
function extractFromMermaidAST(ast, raw) {
  const ir = {
    type: ast.type || 'graph',
    direction: 'TB',
    nodes: [],
    edges: [],
    subgraphs: [],
    classes: [],
    styles: [],
    raw,
  };

  // Determine direction from diagram type or directive
  if (ast.direction) {
    ir.direction = ast.direction;
  } else if (raw.match(/graph\s+(TB|TD|BT|LR|RL)/i)) {
    ir.direction = raw.match(/graph\s+(TB|TD|BT|LR|RL)/i)[1].toUpperCase();
  } else if (raw.match(/flowchart\s+(TB|TD|BT|LR|RL)/i)) {
    ir.direction = raw.match(/flowchart\s+(TB|TD|BT|LR|RL)/i)[1].toUpperCase();
  }

  // Extract nodes: mermaid AST nodes may be in ast.nodes or we parse from raw
  if (ast.nodes && Array.isArray(ast.nodes)) {
    for (const node of ast.nodes) {
      ir.nodes.push({
        id: node.id || node.label,
        label: node.label || node.id,
        shape: node.shape || node.type || 'rect',
        style: node.style || null,
        class: node.class || null,
      });
    }
  }

  // If AST doesn't have structured nodes, extract from raw text
  if (ir.nodes.length === 0) {
    ir.nodes = extractNodesFromRaw(raw);
    ir.edges = extractEdgesFromRaw(raw);
  } else if (ast.edges && Array.isArray(ast.edges)) {
    for (const edge of ast.edges) {
      ir.edges.push({
        from: edge.from || edge.source,
        to: edge.to || edge.target,
        label: edge.label || null,
        style: edge.style || 'solid',
      });
    }
  }

  // Extract subgraphs
  if (ast.subgraphs && Array.isArray(ast.subgraphs)) {
    for (const sg of ast.subgraphs) {
      ir.subgraphs.push({
        id: sg.id,
        label: sg.label || sg.title,
        nodes: sg.nodes || [],
      });
    }
  }

  // Extract classes
  if (ast.classes && Array.isArray(ast.classes)) {
    ir.classes = ast.classes;
  }

  return { success: true, ...ir };
}

/**
 * Fallback: heuristic extraction of nodes from raw mermaid text.
 * Handles: A[Label], B(Label), C{Label}, D((Label)), E[(Label)], F>Label], G{{Label}}
 */
function extractNodesFromRaw(raw) {
  const nodes = [];
  const seen = new Set();

  // Match mermaid node definitions: ID[Label], ID(Label), ID{Label}, ID((Label)), ID[(Label)], ID>Label], ID{{Label}}, ID[/Label/], ID[\Label\]
  const nodeRegex = /\b([A-Za-z_]\w*)\s*(\[.+?\]|\(.+?\)|\{.+?\}|\(\(.+?\)\)|\[\(.+?\)\]|>.+?\]|\{\{.+?\}\}|\[\/.+?\/\]|\[\\\\.+?\\\\\]|\[\/.+?\/\]|\[\\\\.+?\\\\\])/g;

  let match;
  while ((match = nodeRegex.exec(raw)) !== null) {
    const id = match[1];
    const bracket = match[2];
    let label = bracket.slice(1, -1);
    let shape = 'rect';

    if (bracket.startsWith('[(') && bracket.endsWith(')]')) { shape = 'cylinder'; label = bracket.slice(2, -2); }
    else if (bracket.startsWith('((') && bracket.endsWith('))')) { shape = 'circle'; label = bracket.slice(2, -2); }
    else if (bracket.startsWith('{{') && bracket.endsWith('}}')) { shape = 'hexagon'; label = bracket.slice(2, -2); }
    else if (bracket.startsWith('>') && bracket.endsWith(']')) { shape = 'parallelogram'; label = bracket.slice(1, -1); }
    else if (bracket.startsWith('[') && bracket.endsWith(']')) { shape = 'rect'; label = bracket.slice(1, -1); }
    else if (bracket.startsWith('(') && bracket.endsWith(')')) { shape = 'rounded_rect'; label = bracket.slice(1, -1); }
    else if (bracket.startsWith('{') && bracket.endsWith('}')) { shape = 'diamond'; label = bracket.slice(1, -1); }
    else if ((bracket.startsWith('[/') && bracket.endsWith('/]')) || (bracket.startsWith('[\\') && bracket.endsWith('\\]'))) { shape = 'parallelogram'; label = bracket.slice(2, -2); }

    if (!seen.has(id)) {
      nodes.push({ id, label, shape });
      seen.add(id);
    }
  }

  return nodes;
}

/**
 * Fallback: heuristic extraction of edges from raw mermaid text.
 */
function extractEdgesFromRaw(raw) {
  const edges = [];

  // Match edges: A-->B, A-->|label|B, A-.->B, A==>B, A--->B, etc.
  const edgeRegex = /([A-Za-z_]\w*)\s*(-->|--->|---|==>|===>|-\.->|-\.\.->|-\|.+?\|->|-->\|.+?\|)\s*([A-Za-z_]\w*)/g;

  let match;
  while ((match = edgeRegex.exec(raw)) !== null) {
    const from = match[1];
    const arrow = match[2];
    const to = match[3];
    let label = null;
    let style = 'solid';

    if (arrow.includes('|')) {
      const labelMatch = arrow.match(/\|(.+?)\|/);
      if (labelMatch) label = labelMatch[1];
    }
    if (arrow.includes('-.-') || arrow.includes('-..-')) style = 'dotted';
    if (arrow.includes('==')) style = 'thick';

    edges.push({ from, to, label, style });
  }

  return edges;
}

main().catch(err => {
  console.error(JSON.stringify({ success: false, error: `Unexpected error: ${err.message}` }));
  process.exit(1);
});
