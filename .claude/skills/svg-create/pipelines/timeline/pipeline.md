# Timeline Pipeline

Orchestrates the generation of timeline diagrams, milestone charts, and Gantt charts (PPT type D).

## Pipeline Flow

```
Mermaid timeline/gantt or event list
      │
      ▼
┌─────────────────────┐
│  Timeline Parser     │  → Timeline IR (events, dates, spans)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Timeline Layout     │  → Positioned IR (axis, milestones, bars)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Timeline Renderer   │  → Complete SVG
└─────────────────────┘
```

## Supported Timeline Types

| Type | Input | Layout |
|------|-------|--------|
| `milestone` | Mermaid timeline / event list | Horizontal/vertical axis with milestone markers |
| `gantt` | Mermaid gantt / task list | Horizontal bars with dependencies |

## Step 1: Timeline Parser

Invoke: `Agent("timeline/parser.md", input)`

## Step 2: Timeline Layout

Invoke: `Agent("timeline/layout.md", timelineIR, theme, shell)`

## Step 3: Timeline Renderer

Invoke: `Agent("timeline/renderer.md", positionedIR, theme, shell)`
