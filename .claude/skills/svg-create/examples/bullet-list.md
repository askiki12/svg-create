# Example: Bullet List (Text Pipeline)

## Input

````markdown
/svg-create text
```markdown
---
type: bullet-list
title: 三大核心优势
color: warm-vibrant
---

## 🚀 高性能
毫秒级响应，支持万级并发，99.99% 可用性保证

## 🔌 易扩展
插件化架构，按需组合功能模块，支持自定义插件开发

## ☁️ 全托管
零运维，自动扩缩容和故障转移，7×24 监控告警
```
````

## Expected Output

A text slide:
- Title: "三大核心优势" at top (36px, bold)
- Decorative accent line under title (warm amber)
- 3 items with icons, headings, and descriptions
- Each item: icon (left), heading (bold, 20px), body (16px, secondary color)
- Theme: warm-vibrant (amber/orange tones)
