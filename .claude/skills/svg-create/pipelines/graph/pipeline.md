# Graph Pipeline (UPDATED — deterministic engines)

Orchestrates structure diagrams, flowcharts, and relationship diagrams (PPT types A, F, G).

## Pipeline Flow

```
User Input / Mermaid
       │
       ▼
┌──────────────────────┐
│  Step 1: Parser      │  Claude → Graph IR (JSON)
│  (agents/graph/      │
│   parser.md)         │
└──────────┬───────────┘
           │  graph-ir.json
           ▼
┌──────────────────────┐
│  Step 2: Layout      │  node scripts/layout-graph.js
│  (JS ENGINE)         │  Deterministic: layered-grid / Sugiyama / tree
│  (scripts/layout-    │  → Positioned IR (exact x,y,w,h + edge paths)
│   graph.js)          │
└──────────┬───────────┘
           │  positioned-ir.json
           ▼
┌──────────────────────┐
│  Step 3: Serialize   │  node scripts/serialize-svg.js --theme business-blue
│  (JS ENGINE)         │  Guaranteed valid XML + data-svgc-* tracking
│  (scripts/serialize- │  → Complete SVG string
│   svg.js)            │
└──────────┬───────────┘
           │  output.svg
           ▼
┌──────────────────────┐
│  Step 4: Validate    │  node scripts/validate-svg.js output.svg --json
│  (Reviewer + Fix)    │  Precise mode (tracked elements) → pass/fail
└──────────────────────┘
```

## Step 1: Parser (Claude)

Invoke the Graph Parser agent (`parser.md`). It outputs **Graph IR** JSON:

```json
{
  "diagramType": "architecture",
  "direction": "LR",
  "title": "微服务架构图",
  "nodes": [
    {"id": "A", "label": "API Gateway", "shape": "hexagon", "layer": 0}
  ],
  "edges": [
    {"from": "A", "to": "B", "label": "HTTP"}
  ],
  "groups": [
    {"id": "entry", "label": "入口层", "nodes": ["A"], "type": "boundary"}
  ]
}
```

## Step 2: Layout Engine (JS)

```bash
node scripts/layout-graph.js --file graph-ir.json --width 1280 --height 720
```

Algorithm selection based on `diagramType`:
- `architecture` → **Layered Grid** — layers of evenly-spaced nodes
- `flowchart`, `state`, `er` → **Sugiyama** — hierarchical with crossing reduction
- `orgchart`, `mindmap` → **Tree** — recursive centering

No more Claude estimating coordinates. The engine computes exact positions.

## Step 3: SVG Serializer (JS)

```bash
node scripts/serialize-svg.js --file positioned-ir.json --theme business-blue
```

Guarantees:
- Valid XML (NO `<?xml?>`, NO `--` in comments, properly escaped)
- `data-svgc-*` tracking on EVERY visual element
- Proper shape rendering (hexagon, cylinder, rounded_rect, etc.)
- Edge routing with markers and labels
- Group boundary boxes

## Step 4: Validate

```bash
node scripts/validate-svg.js output.svg --json
```

With tracking attributes, validator runs in precise mode (no fallback).
