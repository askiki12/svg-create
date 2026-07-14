# SVG Create Skill

Generate publication-quality SVG diagrams for academic papers, system architectures,
data visualization, and technical documentation. Also supports multi-slide PPT generation.

**Primary focus:** academic figures, architecture diagrams, data charts, documentation illustrations.
**Secondary capability:** multi-slide SVG decks, text-heavy slides, batch generation.

## Trigger

The user asks to create any SVG diagram, figure, or slide:
- Architecture / system topology / framework / flowchart diagrams
- Data charts — bar, line, pie, scatter, radar, funnel
- Timelines / Gantt charts / roadmaps
- Comparison matrices — SWOT, feature tables, 2×2 matrices
- Hierarchical taxonomies / tree diagrams / concept maps
- Documentation illustrations and README figures
- Text slides — bullet lists, title pages, quotes, concept cards
- Multi-slide SVG decks from outlines or topics
- Modifications to existing SVGs

## Input Formats

1. **Mermaid code blocks** (recommended for structural diagrams):
   ````markdown
   ```mermaid
   graph TD
       A[Gateway] --> B[Service] --> C[(Database)]
   ```
   ````

2. **Structured data** (recommended for charts):
   ```json
   {"type": "bar", "categories": ["A","B","C"], "series": [{"name":"X","data":[1,2,3]}]}
   ```

3. **Markdown with frontmatter** (for text-heavy figures):
   ```markdown
   ---
   type: bullet-list
   title: Key Findings
   ---
   ## Point 1
   Description
   ```

4. **Natural language**: "画一个微服务架构图，包含API网关、3个服务、数据库"

5. **Detailed specifications**: Precise coordinates, colors, and layout instructions for academic figures

## Workflow (UPDATED — 6 Steps)

### Step 0: Requirements Analysis (NEW)

Invoke the **Requirements Agent** (`agents/requirements-agent.md`).

This agent determines WHAT the user wants before anything is generated:
- **Document Mode**: Extract themes + sections from pasted article → plan N slides
- **Topic Mode**: User says "N页关于X的PPT" → generate outline with N slides
- **Outline Mode**: User provides bullet points → expand each into a full slide
- **Single Slide Mode**: One diagram/chart → pass through with enrichment
- **Modification Mode**: "改一下颜色" → route directly to Fix Agent
- **Clarification Mode**: Too vague → ask 2-3 questions before proceeding

Output: Structured JSON with `requestType` + per-slide `generationPrompt` fields.

### Step 1: Classify (per slide)

Invoke the **Classifier Agent** (`agents/classifier.md`):

```
Input → Classifier Agent
  ├─ Detect input mode (mermaid / structured data / markdown / natural language)
  ├─ Determine slide type (A:Structure / B:Chart / C:Text / D:Timeline / E:Matrix / F:Process / G:Relationship)
  ├─ Detect complexity level (L0-L5)
  └─ Route to the appropriate pipeline
```

### Step 1: Parse

Based on the classification result:

- **Mermaid input**: Run `node scripts/parse-mermaid.js` for precise AST extraction
  ```bash
  node .claude/skills/svg-create/scripts/parse-mermaid.js "<mermaid-text>"
  ```
  On parse failure: report error to user with line information.

- **JSON/CSV data**: Validate schema against chart data requirements

- **Markdown text**: Parse frontmatter + content tree

- **Natural language**: Use LLM understanding to extract entities, relationships, data

### Step 2: Route to Pipeline

| Slide Type | Pipeline | Path |
|------------|----------|------|
| A (Structure), F (Process), G (Relationship) | **Graph** | `pipelines/graph/` |
| B (Data Chart) | **Chart** | `pipelines/chart/` |
| C (Text Slide) | **Text** | `pipelines/text/` |
| D (Timeline/Gantt) | **Timeline** | `pipelines/timeline/` |
| E (Matrix/Comparison) | **Matrix** | `pipelines/matrix/` |
| H (Hybrid/Mixed) | Split → parallel → Compositor | multiple |

### Step 3: Execute Pipeline

Each pipeline runs its internal chain: **Parser → Layout → Renderer**

For each pipeline, invoke agents in sequence:
1. **Parser agent** — converts input to typed IR (Intermediate Representation)
2. **Layout agent** — computes positions, dimensions, routes
3. **Renderer agent** — generates final SVG code

Shared services are used by all pipelines:
- `shared/theme-manager.md` — color palettes, typography
- `shared/svg-shell.md` — SVG boilerplate, defs, viewBox
- `shared/shape-library.md` — node shape SVG templates
- `shared/typography.md` — text measurement, wrapping, CJK handling

### Step 4: Review & Fix Loop

**4a. Validate:**
Invoke the **Reviewer agent** (`shared/reviewer.md`):
```bash
node scripts/validate-svg.js output.svg --json
```

**4b. Analyze:**
- `pass: true` → Skip to Step 5 (Deliver) ✅
- `pass: false` → Invoke **Fix Agent** (`agents/fix-agent.md`)

**4c. Fix (Round 1):**
The Fix Agent receives the SVG + the Reviewer's violation report:
- Surgical fixes: boundary shift, color darkening, edge re-routing
- Each fix is logged: what changed, before/after coordinates
- Unfixable issues are flagged for escalation

**4d. Re-validate (Round 2):**
```bash
node scripts/validate-svg.js output.svg --json
```

**4e. Degradation Check:**
Compare Round 1 vs Round 2 violation counts:
- **Improving** (R2 < R1): Apply one more fix round, deliver with remaining warnings
- **Stalled** (R2 == R1): STOP. Deliver with warnings. Structural issue — needs human.
- **Degrading** (R2 > R1): ROLLBACK to R1. Fixes made it worse. Deliver R1 with warnings.

**Maximum: 3 total review passes.** Then deliver regardless.

| Outcome | Quality Level | Action |
|---------|:--:|--------|
| 0 CRITICAL + 0 HIGH | A/B | Deliver ✅ |
| 0 CRITICAL + 0 HIGH after fixes | C | Deliver with fix log ⚠️ |
| Issues remain after 3 rounds | D | Deliver with escalation notes ⚠️ |
| CRITICAL still remain | F | Report to user, request guidance ❌ |

### Step 5: Deliver

1. Generate preview HTML using Preview Builder
2. For multi-slide decks: generate a navigation HTML page showing all slides
3. Present SVG(s) to the user
4. Enable feedback loop for modifications:
   - Style changes → incremental SVG edit → **re-validate**
   - Content changes → re-run from Parser → **re-validate**
   - Layout changes → re-run from Layout → **re-validate**
   - Type change → re-classify and re-route → **re-validate**

## Mandatory Validation Gate

**This rule cannot be bypassed.** Any SVG delivery — whether from a pipeline, a
background agent, a manual edit, or a fix — MUST pass through validate-svg.js:

```
Any SVG change (generation / fix / edit / polish)
       │
       ▼
  node scripts/validate-svg.js output.svg --json
       │
       ├── pass: true  →  allowed to deliver ✅
       │
       └── pass: false →  Fix Agent → re-validate
              │
              ├── pass: true  →  deliver ✅
              └── pass: false →  loop (max 3 rounds)
                     │
                     ├── improving → continue
                     ├── stalled   → deliver with warnings ⚠️
                     └── degrading → ROLLBACK to previous version
```

**Self-check before ANY delivery:** "Did I run validate-svg.js on this exact file?"
If the answer is no → run it NOW. No exceptions.

**Cascading prevention:** After modifying ANY element's coordinates (x, y, width,
height, font-size), re-run ALL checks. CHECK 9 specifically verifies that text
elements fit within their parent containers after any repositioning.

## Complexity Levels

| Level | Condition | Workflow |
|-------|-----------|----------|
| L0 | ≤3 elements (simple bullet list, single pie) | Single agent, direct generation |
| L1 | ≤10 elements, no sub-graphs | Classifier → Parser+Renderer (merged) |
| L2 | 11-30 elements, sub-graphs | Classifier → Parser → Layout → Renderer |
| L3 | >30 elements, multi-layer | L2 + Reviewer loop |
| L4 | Hybrid/mixed types | Classifier → Split → Parallel pipelines → Compositor |
| L5 | Batch generation | L0-L4 loop with style consistency check |

## Feedback Loop

After delivering SVG, accept modification requests:

- **Style changes** ("把这个改成红色"): Edit SVG directly, keep layout
- **Content changes** ("加一个Redis节点"): Re-run Parser → Layout → Renderer
- **Type switch** ("改成横向柱状图"): Re-classify, re-route
- **Mixed additions** ("右边再加个流程图"): Promote to L4 hybrid

## Quality Standards

Every generated SVG must:
- Use the PPT template (16:9 viewBox 1280×720 by default)
- Include proper `<title>` and `<desc>` for accessibility
- Embed original mermaid/text in `<desc>` for editability
- Use CSS variables for theming (no hardcoded colors)
- NOT use `<foreignObject>` (PPT import compatibility)
- Have minimum 12px font size (projector readability)
- Respect 40px safe margins
- Include semantic CSS classes and data attributes

## File Structure

```
.claude/skills/svg-create/
├── SKILL.md                    ← THIS FILE
├── agents/
│   ├── classifier.md           ← Type detection + routing
│   └── compositor.md           ← Hybrid slide composition
├── pipelines/
│   ├── graph/                  ← Structure / Flow / Relationship
│   ├── chart/                  ← Data visualization
│   ├── text/                   ← Text rendering
│   ├── timeline/               ← Timeline / Gantt
│   └── matrix/                 ← Matrix / Comparison
├── shared/                     ← Shared services
├── scripts/                    ← Utility scripts
├── templates/                  ← SVG templates
├── styles/                     ← CSS color palettes
└── examples/                   ← Usage examples
```
