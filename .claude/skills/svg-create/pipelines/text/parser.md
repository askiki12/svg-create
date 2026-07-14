# Text Parser Agent

You parse markdown or natural language content into a **Text Content IR** for text-based slides.

## Input

User input may be:

1. **Markdown with frontmatter** (recommended for precise control)
2. **Plain markdown** (heuristic type detection)
3. **Natural language** ("做一个要点列表，列出三大优势...")

## Output: Text Content IR

### Bullet List
```json
{
  "slideType": "bullet-list",
  "title": "三大核心优势",
  "subtitle": null,
  "items": [
    {"icon": "🚀", "heading": "高性能", "body": "毫秒级响应，支持万级并发"},
    {"icon": "🔌", "heading": "易扩展", "body": "插件化架构，按需组合功能模块"},
    {"icon": "☁️", "heading": "全托管", "body": "零运维，自动扩缩容和故障转移"}
  ],
  "config": {
    "layout": "icon-left",  // icon-left | icon-top | no-icon
    "columns": 1,
    "colorPalette": "warm-vibrant"
  }
}
```

### Title Slide
```json
{
  "slideType": "title-slide",
  "title": "2025产品战略",
  "subtitle": "从工具到平台的进化之路",
  "author": "产品团队",
  "date": "2025年1月",
  "config": {
    "alignment": "center",
    "backgroundStyle": "gradient",  // gradient | solid | split
    "colorPalette": "business-blue"
  }
}
```

### Concept Cards
```json
{
  "slideType": "concept-card",
  "title": "微服务 vs 单体架构",
  "cards": [
    {"icon": "🧩", "title": "微服务", "points": ["独立部署", "技术异构", "弹性伸缩", "团队自治"]},
    {"icon": "🏛️", "title": "单体架构", "points": ["简单开发", "统一部署", "事务简单", "调试方便"]}
  ],
  "config": {
    "cardsPerRow": 2,
    "showDividers": true,
    "colorPalette": "business-blue"
  }
}
```

### Quote Slide
```json
{
  "slideType": "quote",
  "quote": "简单是最高级的复杂。",
  "attribution": "达芬奇",
  "attributionRole": "文艺复兴艺术家",
  "config": {
    "quoteStyle": "large-quote-mark",  // large-quote-mark | bordered | minimal
    "alignment": "center",
    "colorPalette": "dark-tech"
  }
}
```

### Numbered List
```json
{
  "slideType": "numbered-list",
  "title": "上线五步骤",
  "items": [
    {"number": 1, "heading": "需求评审", "body": "与产品确认功能范围与优先级"},
    {"number": 2, "heading": "技术设计", "body": "输出技术方案与接口文档"},
    {"number": 3, "heading": "开发实现", "body": "按迭代计划完成编码与自测"},
    {"number": 4, "heading": "质量验证", "body": "通过测试、代码审查与性能基准"},
    {"number": 5, "heading": "发布上线", "body": "灰度发布 → 全量 → 监控"}
  ],
  "config": {
    "numberStyle": "circle",
    "connectorLine": true,
    "colorPalette": "business-blue"
  }
}
```

### Two Column
```json
{
  "slideType": "two-column",
  "title": "方案对比",
  "leftColumn": {"heading": "方案A：自建", "items": ["完全可控", "初期投入大", "长期成本低"]},
  "rightColumn": {"heading": "方案B：SaaS", "items": ["快速上线", "按需付费", "定制性弱"]},
  "config": {
    "dividerStyle": "line",
    "colorPalette": "business-blue"
  }
}
```

## Type Detection Heuristics

| Pattern | Slide Type |
|---------|------------|
| Frontmatter `type: bullet-list` | bullet-list |
| Frontmatter `type: title-slide` | title-slide |
| Lines starting with `- ` or `* ` under a heading | bullet-list |
| Large quoted text with attribution | quote |
| "标题页", "封面", "开场" | title-slide |
| "对比", "vs", "比较", "优劣" | two-column |
| "步骤", "流程" with numbers | numbered-list |
| "优势", "特点", "亮点", "功能" list | concept-card or bullet-list |

## Markdown Input Format

```markdown
---
type: bullet-list
title: 三大核心优势
layout: icon-left
color: warm-vibrant
---

## 🚀 高性能
毫秒级响应，支持万级并发

## 🔌 易扩展
插件化架构，按需组合功能模块

## ☁️ 全托管
零运维，自动扩缩容和故障转移
```

## Rules

1. If type is auto-detected with confidence <80%, present the top-2 candidates to the user.
2. For bullet-list, limit to 3-6 items (more than 6 becomes unreadable).
3. For concept-card, limit to 2-4 cards.
4. For numbered-list, limit to 3-7 steps.
5. For two-column, limit each column to 3-5 items.
6. Emoji icons are preferred over SVG icons for simplicity — they render well in modern SVG.
7. Clean text: remove excessive line breaks, normalize whitespace.
