# 风控地图固定视角实现（2026-11-11）

本次把风控大屏地图从 `echarts-gl` 的 WebGL 三维相机改为单 Canvas 多层 Geo 叠加与 CSS 固定视角，保留既有真实接口、地域编码、精确计数、权限、筛选、刷新、下钻和诊断能力。运行时依赖新增 `vue-echarts` 与 `@vueuse/core`，移除 `echarts-gl`。

`docs/risk-map3d-acceptance.md` 与 `docs/risk-visual-v2-acceptance.md` 描述此前的 WebGL 实现，作为历史验收记录保留；当前实现以下文为准。

## 渲染结构

- `RiskRegionMap.vue` 负责地图资产加载、缓存、范围与视角切换、缩放平移复位、全屏、状态上报和地域下钻。
- `RiskMapCanvas.vue` 是 `vue-echarts` 封装，只使用 Canvas renderer，转发 option 更新和字符串地域点选。
- `riskMapOption.ts` 在单个 Canvas 内叠放三层 Geo：底层与前层制造固定视角厚度，主层承载真实经纬度、飞线、目标点和行政区点选。3D 不使用 WebGL，也不伪造三维业务数据。
- `riskMapView.ts` 保存中国/世界各自的缩放与平移偏移。ECharts 的绝对 `center` 以地图几何包围盒中心为基准，再叠加用户偏移；默认不会把 0°E/0°N 当作中国地图中心。
- `riskFlows.ts` 继续把有效来源代表点连到有效服务器目标；同地域汇聚、未定位来源、未知编码和超过安全精度的计数保持原有文字语义。

## 交互与可访问性

- 默认 3D 固定视角，可切换 2D；中国/世界各自保留缩放和平移。
- 放大、缩小、复位按钮带可访问名称；聚焦地图后支持 `+`、`=`、`-`、`0` 和方向键平移。
- 键盘操作只改变视图，不改变地图范围、筛选或下钻选择。
- 点选仅在真实边界编码存在时发出下钻；无坐标来源不生成点或线。
- 尊重 `prefers-reduced-motion`：开启后关闭飞线动画与倾斜过渡，静态箭头和全部视图操作仍可用。
- 地图有 `aria` 文本说明，精确计数与未定位来源保留文字列表，不依赖颜色或 Canvas 才能理解。

## 验证

已执行：

- `pnpm lint`：通过。
- `pnpm type-check`：通过。
- `pnpm test`：70 个测试文件、474 项测试通过。
- `pnpm build risk-dashboard`：生产构建通过。
- `git diff --check`：通过。

新增回归覆盖地图视图边界与几何中心、双层/单层 Geo、2D/3D、真实坐标飞线、减弱动态、空数据、无坐标、异常、大数精度、点选编码、缩放复位、中国/世界视图保持和 ECharts runtime 投影。runtime 测试直接让 ECharts 接收生成的 option，并校验中国和世界地图几何中心投影落在 900×520 视口内。

未执行真实浏览器 Canvas 截图或人工视觉走查；本轮验证以组件测试、ECharts runtime 投影和构建为准。

大屏 `dashboard` chunk 约 913.49 kB / gzip 305.93 kB，仍有大于 500 kB 的构建提示；已无独立 `echarts-gl` 包。
