# Element Tracking Specification

Every element rendered by any pipeline MUST carry tracking attributes. This enables the validator
to programmatically inspect every element's position, type, and relationship.

## Required Attributes

| Attribute | Required | Values | Description |
|-----------|----------|--------|-------------|
| `data-svgc-id` | ✅ | unique string | Unique element identifier, e.g. `"node-A"`, `"edge-A-B"` |
| `data-svgc-type` | ✅ | see below | Element type classification |
| `data-svgc-parent` | optional | element id | Parent element id (child elements allowed to overlap parent) |
| `data-svgc-layer` | optional | integer | Rendering layer (lower = drawn first, behind) |

## Element Types

### Structure Elements (Graph Pipeline)

| Type | Description | SVG tag | Parent? |
|------|-------------|---------|---------|
| `node` | Diagram node (any shape) | `<g>` | no |
| `node-shape` | The visual shape of a node | `<rect>`,`<circle>`,`<polygon>`,`<path>` | `node` |
| `node-text` | Text label inside a node | `<text>` | `node` |
| `edge` | Edge/connector line | `<g>` | no |
| `edge-path` | The visual path of an edge | `<path>` | `edge` |
| `edge-label` | Label on an edge | `<text>` | `edge` |
| `edge-label-bg` | Background rect behind edge label | `<rect>` | `edge` |
| `group-box` | Group/boundary box | `<rect>` | no |
| `group-label` | Group label text | `<text>` | `group-box` |

### Chart Elements (Chart Pipeline)

| Type | Description | SVG tag | Parent? |
|------|-------------|---------|---------|
| `chart-area` | The chart plotting area | `<g>` | no |
| `axis` | X or Y axis group | `<g>` | no |
| `axis-line` | Axis line | `<line>` | `axis` |
| `axis-tick` | Axis tick mark | `<line>` | `axis` |
| `axis-label` | Axis label text | `<text>` | `axis` |
| `grid-line` | Grid line | `<line>` | `chart-area` |
| `chart-mark` | Data mark (bar/line/point/slice) | `<rect>`,`<path>`,`<circle>` | `chart-area` |
| `chart-value` | Value label on a mark | `<text>` | `chart-mark` (the mark it labels) |
| `legend` | Legend group | `<g>` | no |
| `legend-item` | Single legend entry | `<g>` | `legend` |
| `legend-swatch` | Color swatch in legend | `<rect>` | `legend-item` |
| `legend-label` | Label in legend | `<text>` | `legend-item` |

### Text Elements (Text Pipeline)

| Type | Description | SVG tag | Parent? |
|------|-------------|---------|---------|
| `text-title` | Slide title | `<text>` | no |
| `text-subtitle` | Slide subtitle | `<text>` | no |
| `text-block` | A content block | `<g>` | no |
| `text-heading` | Item heading | `<text>` | `text-block` |
| `text-body` | Item body text | `<text>` | `text-block` |
| `text-icon` | Icon/emoji | `<text>` | `text-block` |
| `text-card` | Concept card container | `<rect>` | no |
| `text-decoration` | Decorative element | `<line>`,`<path>` | no |

### Timeline Elements (Timeline Pipeline)

| Type | Description | SVG tag | Parent? |
|------|-------------|---------|---------|
| `timeline-axis` | The main time axis | `<line>` | no |
| `timeline-event` | A milestone/task group | `<g>` | no |
| `timeline-marker` | Event marker circle | `<circle>` | `timeline-event` |
| `timeline-date` | Date label text | `<text>` | `timeline-event` |
| `timeline-title` | Event title text | `<text>` | `timeline-event` |
| `timeline-desc` | Event description text | `<text>` | `timeline-event` |
| `gantt-bar` | Gantt chart bar | `<rect>` | `timeline-event` |
| `gantt-progress` | Progress fill on bar | `<rect>` | `gantt-bar` |
| `gantt-label` | Label on gantt bar | `<text>` | `timeline-event` |
| `dependency-line` | Dependency arrow | `<path>` | no |

## Example: Properly Tagged SVG Element

```svg
<!-- A node with its shape and text -->
<g data-svgc-id="node-A" data-svgc-type="node" data-svgc-layer="1">
  <rect x="250" y="310" width="200" height="56" rx="8"
        fill="white" stroke="#2563EB" stroke-width="2"
        data-svgc-id="node-A-shape" data-svgc-type="node-shape" data-svgc-parent="node-A"/>
  <text x="350" y="342" text-anchor="middle" dominant-baseline="central"
        data-svgc-id="node-A-text" data-svgc-type="node-text" data-svgc-parent="node-A">
    User Service
  </text>
</g>

<!-- An edge -->
<g data-svgc-id="edge-A-B" data-svgc-type="edge">
  <path d="M 450 338 L 530 338"
        fill="none" stroke="#64748B" stroke-width="2" marker-end="url(#arrow)"
        data-svgc-id="edge-A-B-path" data-svgc-type="edge-path" data-svgc-parent="edge-A-B"/>
  <rect x="475" y="322" width="30" height="16" rx="3" fill="white"
        data-svgc-id="edge-A-B-label-bg" data-svgc-type="edge-label-bg" data-svgc-parent="edge-A-B"/>
  <text x="490" y="334" text-anchor="middle"
        data-svgc-id="edge-A-B-label" data-svgc-type="edge-label" data-svgc-parent="edge-A-B">
    HTTP
  </text>
</g>
```

## Overlap Allowance Matrix

This defines which element types are ALLOWED to overlap. All other overlaps are VIOLATIONS.

| Element Type A | Element Type B | Allowed? | Reason |
|---------------|---------------|----------|--------|
| `node-text` | `node-shape` (same `data-svgc-parent`) | ✅ | Text belongs inside its node |
| `edge-label` | `edge-path` (same `data-svgc-parent`) | ✅ | Label sits on its edge line |
| `edge-label-bg` | `edge-path` (same `data-svgc-parent`) | ✅ | Background for readability over line |
| `node-shape` | `group-box` (node is inside group) | ✅ | Node belongs to the group |
| `group-label` | `group-box` (same `data-svgc-parent`) | ✅ | Label on group boundary |
| `chart-value` | `chart-mark` (same `data-svgc-parent`) | ✅ | Value label on its bar/point |
| `grid-line` | ANY | ✅ | Grid lines render behind everything |
| `axis-line` | `chart-mark` | ✅ | Axis line is behind data |
| `gantt-progress` | `gantt-bar` (same `data-svgc-parent`) | ✅ | Progress fill inside bar |
| `text-decoration` | ANY | ✅ | Decorations are non-functional |

ALL OTHER overlaps between DIFFERENT `data-svgc-id` elements are VIOLATIONS unless
the elements share a `data-svgc-parent` chain.

## Boundary Rules

- Every element's bounding box must be fully within the viewBox
- Exception: elements with `data-svgc-type="grid-line"` may span edge-to-edge
- Exception: `data-svgc-type="text-decoration"` may extend to viewBox edges
- Minimum safe margin: 4px from viewBox boundary for all other elements
