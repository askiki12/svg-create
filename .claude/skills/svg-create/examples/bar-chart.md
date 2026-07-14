# Example: Bar Chart (Chart Pipeline)

## Input

````markdown
/svg-create chart
类型：分组柱状图
标题：Q3 各部门营收对比
数据：
```json
{
  "type": "bar",
  "title": "Q3 各部门营收对比",
  "categories": ["研发", "销售", "市场", "运营"],
  "series": [
    {"name": "Q2", "data": [120, 200, 150, 80]},
    {"name": "Q3", "data": [140, 230, 160, 95]}
  ],
  "config": {
    "yAxisLabel": "营收（万元）",
    "showValues": true,
    "valueFormat": "{value}万"
  }
}
```
配色：商务蓝
````

## Expected Output

A grouped bar chart:
- 4 category groups (研发, 销售, 市场, 运营)
- 2 bars per group (Q2, Q3)
- Y-axis: 0 to 250, labeled "营收（万元）"
- Value labels on top of each bar
- Legend at bottom: Q2 (blue), Q3 (amber)
- Title: "Q3 各部门营收对比"
