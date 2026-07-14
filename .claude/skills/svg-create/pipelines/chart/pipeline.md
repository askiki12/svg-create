# Chart Pipeline

Orchestrates the generation of data visualization charts (PPT type B).

## Pipeline Flow

```
Structured Data / Mermaid xychart/pie
      │
      ▼
┌─────────────────┐
│  Chart Parser    │  → Chart IR (type, series, categories, config)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Chart Layout    │  → Positioned IR (axes, scales, marks, legend)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Chart Renderer  │  → Complete SVG for the chart
└─────────────────┘
```

## Step 1: Chart Parser

Invoke: `Agent("chart/parser.md", input)`

Parses data input (JSON/CSV/markdown table or mermaid xychart/pie) into **Chart IR**.

## Step 2: Chart Layout

Invoke: `Agent("chart/layout.md", chartIR, theme, shell)`

Computes:
- Chart area dimensions and position
- Axis scales (linear, categorical, time)
- Data mark positions (bar x/y/w/h, line points, pie arcs)
- Legend position
- Title and subtitle positions

## Step 3: Chart Renderer

Invoke: `Agent("chart/renderer.md", positionedIR, theme, shell)`

Generates SVG:
- Axis lines, ticks, labels
- Grid lines
- Data marks (bars, lines, points, arcs)
- Legend items
- Title and subtitle

## Supported Chart Types

| Type | Input | Description |
|------|-------|-------------|
| `bar` / `column` | JSON categories + series | Vertical or horizontal bars |
| `line` | JSON categories + series | Connected data points |
| `pie` / `donut` | JSON labels + values | Proportional slices |
| `scatter` | JSON x/y data points | Point distribution |
| `area` | JSON categories + series | Filled line chart |
| `radar` | JSON axes + series | Multi-dimensional comparison |
| `funnel` | JSON stages + values | Decreasing stages |

## Output

- Complete SVG string
- Preview HTML page
