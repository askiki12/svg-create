# Shape Library

Reference for node shape SVG definitions. Each shape is a function that takes dimensions and returns SVG elements.

## Shapes Catalog

### 1. Rect (通用矩形)
```
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```

### 2. Rounded Rect (圆角矩形 — 服务/组件)
```
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" filter="url(#shadow)"/>
```

### 3. Circle (圆形 — 开始/结束/状态)
```
<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```

### 4. Cylinder (圆柱体 — 数据库)
```
<path d="M {x} {y+cy} A {w/2} {h*0.15} 0 0 0 {x+w} {y+cy} L {x+w} {y+h-cy} A {w/2} {h*0.15} 0 0 1 {x} {y+h-cy} Z" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```
Where cy = h * 0.15 (the cap height ratio).

Alternative simpler cylinder:
```
<ellipse cx="{cx}" cy="{cy_top}" rx="{rx}" ry="{ry}"/>
<rect x="{x}" y="{cy_top}" width="{w}" height="{h}"/>
<ellipse cx="{cx}" cy="{cy_bottom}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke}"/>
<path d="M {x} {cy_top} L {x} {cy_bottom} A {rx} {ry} 0 0 0 {x+w} {cy_bottom} L {x+w} {cy_top}" fill="none" stroke="{stroke}"/>
```

### 5. Hexagon (六边形 — 网关/入口)
```
<polygon points="{cx},{y} {x+w},{y+h*0.25} {x+w},{y+h*0.75} {cx},{y+h} {x},{y+h*0.75} {x},{y+h*0.25}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```

### 6. Diamond (菱形 — 判断/分支)
```
<polygon points="{cx},{y} {x+w},{cy} {cx},{y+h} {x},{cy}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```

### 7. Parallelogram (平行四边形 — 输入/输出)
```
<polygon points="{x+skew},{y} {x+w},{y} {x+w-skew},{y+h} {x},{y+h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```
Where skew = w * 0.15.

### 8. Cloud (云朵 — 外部服务)
```
<path d="M {cx-r*1.2} {cy+r*0.3} 
         a {r*0.4} {r*0.4} 0 0 1 {r*0.4} {-r*0.6}
         a {r*0.5} {r*0.5} 0 0 1 {r*0.8} {-r*0.2}
         a {r*0.45} {r*0.45} 0 0 1 {r*0.6} {r*0.5}
         a {r*0.35} {r*0.35} 0 0 1 {-r*0.1} {r*0.5}
         a {r*0.4} {r*0.4} 0 0 1 {-r*0.8} {r*0.4}
         a {r*0.35} {r*0.35} 0 0 1 {-r*0.6} {-r*0.2}
         a {r*0.3} {r*0.3} 0 0 1 {-r*0.3} {-r*0.4}
         Z" 
      fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```
Approximate cloud shape. Simpler alternative available for tighter spaces.

### 9. Person (人形 — 用户/角色)
```
<circle cx="{cx}" cy="{y+head_r}" r="{head_r}" fill="{fill}" stroke="{stroke}"/>
<path d="M {cx-body_w/2} {y+head_r*2+body_h*0.3} 
         Q {cx-body_w/2} {y+head_r*2} {cx} {y+head_r*2}
         Q {cx+body_w/2} {y+head_r*2} {cx+body_w/2} {y+head_r*2+body_h*0.3}
         L {cx+body_w/2+body_w*0.3} {y+head_r*2+body_h}
         L {cx+body_w/2} {y+head_r*2+body_h}
         L {cx+body_w/2} {y+head_r*2+body_h*0.6}
         L {cx-body_w/2} {y+head_r*2+body_h*0.6}
         L {cx-body_w/2} {y+head_r*2+body_h}
         L {cx-body_w/2-body_w*0.3} {y+head_r*2+body_h}
         Z"
      fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
```

### 10. Document (文档 — 文件)
```
<path d="M {x} {y} L {x+w*0.7} {y} L {x+w} {y+h*0.3} L {x+w} {y+h} L {x} {y+h} Z" 
      fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>
<path d="M {x+w*0.7} {y} L {x+w*0.7} {y+h*0.3} L {x+w} {y+h*0.3}" 
      fill="none" stroke="{stroke}" stroke-width="{sw}"/>
```

## Text Placement within Shapes

For centered text within any shape:
```
<text x="{shapeCenterX}" y="{shapeCenterY}" text-anchor="middle" dominant-baseline="central" 
      class="node-text" fill="{textColor}">{label}</text>
```

For multi-line text (use `<tspan>`):
```
<text x="{shapeCenterX}" y="{startY}" text-anchor="middle" class="node-text">
  <tspan x="{shapeCenterX}" dy="0">{line1}</tspan>
  <tspan x="{shapeCenterX}" dy="{lineHeight}">{line2}</tspan>
</text>
```

## Rules

1. All coordinates use the shape's bounding box: `{x, y, w, h, cx, cy}`.
2. `cx = x + w/2`, `cy = y + h/2` (center point).
3. All shapes support optional `filter="url(#shadow)"` for drop shadow.
4. Stroke width defaults to `var(--shape-stroke)` from theme.
5. Fill defaults to white with theme primary as stroke for nodes; use theme primary fill for highlighted nodes.
