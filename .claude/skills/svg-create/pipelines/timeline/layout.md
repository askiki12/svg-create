# Timeline Layout Agent

You compute positions for timeline events, axis markers, and gantt bars.

## Input

- `timelineIR`: Timeline IR from Timeline Parser
- `shellConfig`: SVG shell dimensions
- `themeConfig`: Typography settings

## Output: Positioned Timeline IR

### Milestone Timeline Layout

```
Horizontal orientation:
1. Time axis: horizontal line across the content area at y = contentArea.cy
2. Events distributed evenly along the axis
3. Alternating above/below the axis (or all above if space allows)
4. Each event:
   - Axis marker: circle on the axis line
   - Date label: near the marker, below axis
   - Event title: above/below axis
   - Description (if showDescriptions): below title

Event spacing = contentWidth / (numEvents - 1)

Vertical orientation:
Same but with vertical axis, events alternating left/right.
```

### Gantt Chart Layout

```
1. Header: month/week labels across the top
2. Left panel: task names (200px wide)
3. Right panel: gantt bars in a grid
4. Row height: 36px per task
5. Column width: proportional to time scale
6. Today marker: vertical dashed line at today's position
7. Dependency lines: arrows from end of one bar to start of another
8. Section headers: bold labels spanning full width
```

## Layout Calculations

### Milestone Timeline

```json
{
  "axis": {
    "x1": 100, "y1": 380, "x2": 1180, "y2": 380,
    "stroke": "var(--color-text)", "strokeWidth": 2
  },
  "events": [
    {
      "date": "2025-Q1",
      "title": "MVP 发布",
      "description": "核心功能上线",
      "status": "completed",
      "markerX": 100, "markerY": 380,
      "markerR": 8,
      "markerFill": "var(--color-accent)",
      "dateLabel": {"x": 100, "y": 400, "textAnchor": "middle"},
      "titleLabel": {"x": 100, "y": 355, "textAnchor": "middle"},
      "descriptionLabel": {"x": 100, "y": 335, "textAnchor": "middle"}
    }
  ],
  "connectors": [
    {"x1": 100, "y1": 380, "x2": 460, "y2": 380}
  ]
}
```

### Gantt Chart

```json
{
  "headerRow": {
    "y": 150, "height": 40,
    "cells": [
      {"x": 300, "width": 150, "label": "1月"},
      {"x": 450, "width": 150, "label": "2月"}
    ]
  },
  "taskRows": [
    {
      "y": 200, "height": 36,
      "label": {"x": 20, "y": 224, "text": "需求分析", "textAnchor": "start"},
      "bar": {"x": 300, "y": 208, "width": 180, "height": 20, "rx": 4,
              "fill": "var(--color-accent)", "progress": 1.0}
    }
  ],
  "todayMarker": {
    "x1": 600, "y1": 150, "x2": 600, "y2": 500,
    "stroke": "var(--color-danger)", "strokeWidth": 1, "strokeDasharray": "6 3"
  },
  "dependencyLines": [
    {"x1": 480, "y1": 218, "x2": 510, "y2": 254,
     "markerEnd": "url(#arrow-primary)"}
  ],
  "sections": [
    {"label": "规划阶段", "y": 190, "height": 86, "fill": "var(--color-bg)"}
  ]
}
```

## Time Scale for Gantt

```
function computeTimeScale(startDate, endDate, availableWidth):
  totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24)
  pixelsPerDay = availableWidth / totalDays

  // Choose header unit
  if pixelsPerDay > 20: headerUnit = "day"
  elif pixelsPerDay > 2: headerUnit = "week"
  else: headerUnit = "month"

  // Compute bar positions
  function dateToX(date):
    days = (date - startDate) / (1000 * 60 * 60 * 24)
    return leftMargin + days * pixelsPerDay
```

## Rules

1. Timeline axis must span 80% of content width (10% margins on each side).
2. Event markers on milestones: completed=12px radius, current=14px (highlighted), upcoming=8px.
3. Gantt bars: minimum visible width = 4px (very short tasks).
4. If events overflow the axis, compress spacing or switch to vertical layout.
5. Today marker on Gantt: only show if today falls within the date range.
6. Section background in Gantt: alternating light shades for visual grouping.
