# Example: Hybrid Slide (Mixed Types)

## Input

````markdown
/svg-create
左边放用户增长折线图，右边放注册流程步骤图

折线图数据：
- 1月: 1000, 2月: 2500, 3月: 4800, 4月: 8200, 5月: 15000, 6月: 28000

注册流程：
1. 填写手机号 → 2. 验证短信 → 3. 设置密码 → 4. 完善资料 → 5. 注册成功

配色：商务蓝，16:9
````

## Expected Output

A composite slide (1280×720):
- Unified title at top: "用户增长与注册流程"
- Left half (50%): Line chart showing user growth (1-6月, 1000→28000)
- Center: thin vertical divider line
- Right half (50%): Horizontal flowchart showing 5 registration steps
- Each sub-SVG scaled to fit its allocated region
- Consistent business-blue theme across both
