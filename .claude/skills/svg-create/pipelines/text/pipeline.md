# Text Pipeline

Orchestrates the generation of text-based slides — bullet lists, title slides, concept cards, quote slides (PPT type C).

## Pipeline Flow

```
Markdown / User Input
      │
      ▼
┌─────────────────┐
│  Text Parser     │  → Content Tree IR (heading levels, bullets, annotations)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Typography      │  → Positioned IR (text blocks, decorations, alignment)
│  Layout          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Text Renderer   │  → Complete SVG for the text slide
└─────────────────┘
```

## Supported Text Slide Types

| Type | Description | Typical Use |
|------|-------------|-------------|
| `bullet-list` | Title + bullet points | Key points, feature lists |
| `title-slide` | Large centered title + subtitle | Presentation cover |
| `concept-card` | Icon + title + description blocks | Concept explanations |
| `quote` | Large quote text + attribution | Testimonials, key messages |
| `numbered-list` | Title + numbered items | Step-by-step, rankings |
| `two-column` | Two columns of text | Comparison, parallel content |
| `big-number` | Large statistic + label | KPI highlights |

## Step 1: Text Parser

Invoke: `Agent("text/parser.md", input)`

Parses markdown or natural language into **Text Content IR**.

## Step 2: Typography Layout

Invoke: `Agent("text/layout.md", contentIR, theme, shell)`

Computes text positions, line breaks, font sizes, decoration placement.

## Step 3: Text Renderer

Invoke: `Agent("text/renderer.md", positionedIR, theme, shell)`

Generates SVG with proper typography, decorations, and layout.
