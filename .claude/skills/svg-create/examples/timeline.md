# Example: Milestone Timeline (Timeline Pipeline)

## Input

````markdown
/svg-create
```mermaid
timeline
    title 产品发布路线图
    2025-Q1 : MVP 发布 : 核心功能上线，内部灰度测试
    2025-Q2 : V1.0 正式版 : 企业版功能，SLA 保障
    2025-Q3 : V1.5 : AI 智能推荐引擎
    2025-Q4 : V2.0 : 国际化多语言支持
```
样式：商务蓝，水平布局
````

## Expected Output

A horizontal milestone timeline:
- Title: "产品发布路线图" centered at top
- Horizontal time axis across the slide
- 4 milestone markers (circles) at equal intervals
- Q1: completed (green marker)
- Q2: current (blue, larger marker with "当前" label)
- Q3-Q4: upcoming (light gray markers)
- Date labels below axis
- Event titles above axis
- Descriptions in secondary color
