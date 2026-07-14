# Quality Reviewer Agent

You are the **Quality Reviewer** for SVG slides. Your primary tool is a programmatic
validator that inspects every element for overlaps and boundary violations.

## Workflow

### Step 1: Save SVG to temp file

Write the generated SVG string to a temporary file:
```
/tmp/svg-create-review-{timestamp}.svg
```

### Step 2: Run the programmatic validator

```bash
node .claude/skills/svg-create/scripts/validate-svg.js /tmp/svg-create-review-{timestamp}.svg --json
```

This script:
1. Parses the SVG and extracts all `data-svgc-*` tracked elements
2. Computes bounding boxes for every element (rect, circle, path, text, group)
3. Checks every pair of elements for overlap
4. Consults the overlap allowance matrix to determine if each overlap is valid
5. Checks every element is fully inside the viewBox
6. Flags untracked visual elements
7. Outputs a detailed JSON report

### Step 3: Interpret the results

The script returns:
```json
{
  "pass": false,
  "viewBox": {"x": 0, "y": 0, "width": 1280, "height": 720},
  "stats": {
    "totalTracked": 15,
    "totalOverlapPairsChecked": 105,
    "violationsFound": 2,
    "untrackedElements": 0
  },
  "violations": [
    {
      "severity": "CRITICAL",
      "category": "boundary",
      "element": "node-C-text",
      "message": "Element extends outside viewBox: right edge +24px",
      "suggestion": "Reposition element or increase viewBox width"
    },
    {
      "severity": "HIGH",
      "category": "overlap",
      "elements": ["node-A", "node-B"],
      "types": ["node", "node"],
      "message": "Unallowed overlap: node-A overlaps node-B — area: 340px²",
      "suggestion": "Move node-B to x=460"
    }
  ],
  "warnings": [],
  "summary": "❌ FAIL — 2 violation(s) found (1 critical, 1 high)",
  "pass": false
}
```

### Step 4: Decide action

| Result | Action |
|--------|--------|
| `pass: true`, no violations | ✅ Deliver SVG to user |
| `pass: false`, auto-fixable | Apply fixes, re-run validator |
| `pass: false`, needs re-layout | Send violations back to Layout/Renderer agent with specific coordinates to fix |
| `pass: false`, needs re-render | Ask Renderer to regenerate with corrected positions |
| Script parse error | SVG XML is malformed → send back to Renderer for syntax fix |

### Step 5: Re-validate (max 2 rounds)

After fixes are applied, re-run the validator. If still failing after round 2, deliver
the SVG with a quality warning to the user.

## What the Script Checks (Programmatic + Enhanced)

The validator now performs 6 categories of checks:

| # | Check | Severity | Method |
|---|-------|----------|--------|
| 0 | **XML declaration** | HIGH | Detect `<?xml?>` — breaks `<img>` tag embedding in Markdown/HTML |
| 1 | **Boundary violations** | CRITICAL | `isInsideRect(element.bbox, viewBox)` — element outside viewBox |
| 2 | **Element overlap** | HIGH | `rectsOverlap(a.bbox, b.bbox)` → check overlap allowance matrix |
| 3 | **Untracked elements** | MEDIUM | Count visual elements without `data-svgc-*` — fallback to auto-classification |
| 4 | **Color contrast** | HIGH/MEDIUM | WCAG 2.1 contrast ratio: parse fill colors → compute relative luminance → flag ratio < 4.5:1 (body) or < 3:1 (large text) |
| 5 | **Edge proximity** | HIGH/MEDIUM | Flag elements within 3% or 20px of any viewBox edge — projection clipping risk |
| 6 | **Font size / proportion** | MEDIUM | Flag text < 8px; flag elements > 60% of canvas; flag long connector paths |
| 7 | **Visual balance / centering** | MEDIUM | Content center-of-mass vs viewBox center; offset > 8%(w) or 10%(h) → flag |

### NEW: Untracked Fallback Mode

When an SVG has NO `data-svgc-*` tracking attributes, the validator automatically:
1. Extracts ALL visual elements (`<rect>`, `<circle>`, `<text>`, `<path>`, `<line>`, `<polygon>`)
2. Auto-classifies each element using heuristics (tag name, CSS class, position, fill/stroke)
3. Computes bounding boxes for all elements
4. Runs boundary, overlap, contrast, and proximity checks
5. Reports results with a MEDIUM warning that tracking would improve accuracy

This means **even externally-generated SVGs or SVGs from older versions get validated**.

## Auto-Fix Rules

When the validator reports violations, these can be auto-fixed:

| Violation | Auto-Fix Strategy |
|-----------|-------------------|
| Boundary overflow ≤20px | Scale all coordinates by `viewBox.width / (maxX + overflow)` |
| Boundary overflow >20px | Return to Layout agent with viewBox constraints |
| Minor node overlap ≤10px | Shift the overlapping node by overlap vector |
| Major node overlap >10px | Return to Layout agent with conflict pair |
| Text overflow in node | Increase node width or reduce font-size |

## The Element Tracking Contract

For the validator to work, all rendered elements MUST have:
- `data-svgc-id` — unique identifier
- `data-svgc-type` — element type (see `shared/element-tracking.md`)
- `data-svgc-parent` — parent element id (for allowance rules)

**If an element lacks tracking attributes, the validator cannot check it and will report
it as a warning.** The renderer agents are responsible for adding these attributes.

## Review Loop with Degradation Detection

```
ROUND 1:
  Generate SVG → Validate → Report
  
  If PASS (0 CRITICAL + 0 HIGH):
    → Deliver ✅
  
  If FAIL:
    → Fix Agent applies surgical fixes
    → Go to ROUND 2

ROUND 2:
  Validate fixed SVG → Report
  
  If PASS:
    → Deliver ✅ (with fix log)
  
  If FAIL — Check degradation:
    Compare R1_violationCount vs R2_violationCount:
    
    R2 < R1 (improving):
      → Fix Agent tries one more targeted fix
      → Deliver with remaining warnings ⚠️
    
    R2 == R1 (stalled):
      → STOP. Deliver with all warnings ⚠️
      → Reason: Same issues persist → likely structural problem
    
    R2 > R1 (degrading!):
      → ROLLBACK to R1 version
      → Deliver R1 version with all warnings ⚠️
      → Reason: Fix attempts are making things worse

MAXIMUM: 2 rounds of Fix Agent + 1 "best effort" round = 3 total reviews.
After that, deliver regardless of status.

**MANDATORY GATE: Before any SVG is delivered, the delivering agent MUST:**
1. Run `node scripts/validate-svg.js <file.svg> --json`
2. Confirm `pass: true` in the output
3. If `pass: false` → Fix Agent → re-validate → confirm pass
4. Report the validation result to the user alongside the SVG
5. **Background agents are NOT exempt** — they must invoke validate-svg.js before returning

**Self-check question: "Did I run validate-svg.js on this file?"** If answer is no → run it NOW.

**Cascading prevention:** When fixing one issue, you may create another. After ANY
coordinate change (x, y, width, height, font-size on any element), re-run ALL
checks — not just the one you were fixing. CHECK 9 (text-container-overflow) and
CHECK 2 (overlap) are especially sensitive to position changes.

### Escalation Path

### Escalation Path

```
Fix Agent can fix:
  ✅ Boundary overflow → shift element
  ✅ Color contrast → darken/lighten fill
  ✅ Edge proximity → shift inward
  ✅ Minor overlap → shift element + reconnect edges
  ✅ Font size → scale up if <6px

Fix Agent CANNOT fix (returns to pipeline):
  ❌ Major structural overlap (>10px, many connections)
  ❌ Content errors (wrong text, missing elements)
  ❌ Layout algorithm failure (everything in wrong place)
  
Unfixable issues → escalate to:
  → Layout Agent (for position problems)
  → Renderer Agent (for rendering problems)  
  → User (for requirement clarification)
```

### Degradation Score

To detect if fixes are making things worse:

```
degradationScore = R2_CRITICAL*10 + R2_HIGH*5 + R2_MEDIUM*1
                 - (R1_CRITICAL*10 + R1_HIGH*5 + R1_MEDIUM*1)

If degradationScore > 0:  ROLLBACK (fixes made it worse)
If degradationScore == 0: STALLED  (fixes had no effect)  
If degradationScore < 0:  IMPROVING (continue if still failing)
```

### Delivery Quality Levels

| Level | Condition | User Sees |
|-------|-----------|-----------|
| **A — Clean** | 0 CRITICAL + 0 HIGH + 0 MEDIUM | "✅ 验证通过" |
| **B — Acceptable** | 0 CRITICAL + 0 HIGH, ≤5 MEDIUM | "✅ 通过（有轻微警告）" |
| **C — Warned** | 0 CRITICAL + 0 HIGH, >5 MEDIUM | "⚠️ 通过（请检查警告列表）" |
| **D — Degraded** | Loop exhausted, issues remain | "⚠️ 已尽力修复，以下问题需人工处理：…" |
| **F — Rejected** | CRITICAL remain after all rounds | "❌ 无法自动修复，请调整需求或手动编辑" |

1. **ALWAYS run the validator script — NEVER skip.** This is MANDATORY for every generated SVG.
2. **A pass from the validator is required before delivering to the user.**
3. **Generation agents MUST include tracking attributes.** SVGs without `data-svgc-*` will trigger untracked fallback mode and receive a MEDIUM warning.
4. **Violations with severity CRITICAL block delivery.** Fix and re-validate.
5. **Contrast violations of severity HIGH block delivery.** Text must be readable.
6. **Edge proximity HIGH warnings require attention.** Elements within 2px of viewBox edges are at high risk of clipping.
7. **Renderer agents must follow the tracking spec in `shared/element-tracking.md`.**
8. **The validator exit code determines pass/fail:** 0=clean, 1=violations, 2=parse error.
9. **After any fix, re-run the validator.** Maximum 2 fix-review rounds.
10. **If a figure was generated by an external agent (not through the pipeline), validation is STILL MANDATORY.** The untracked fallback mode handles this.
