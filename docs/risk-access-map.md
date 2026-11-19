# 访问大屏 MapLibre + L7 地图

`RiskAccessMap.vue` 是访问大屏的主地图；`RiskRegionMap.vue` 继续作为二维 ECharts 回退和
管理端其他地图场景。两者共用已有的本地授权边界、编码校验、精确计数、细分加载和权限逻辑。

## 运行时资源

- MapLibre 本地空样式只声明 `background` 图层，`sources` 为空，不声明 `glyphs`、`sprite`、
  `transformRequest` 或任何远程瓦片。
- 基础边界仍来自 `public/maps/risk-v1/`；细分边界仍来自 `public/maps/risk-detail-v2/`。
  主地图的 loader 使用 `externalFallback: false`，不会在本地资源失败时请求第三方地址。
- 代表点来自 `src/data/risk-region-centers.json`，是地域代表坐标，不是实际 IP 位置。
- 飞线只使用 `RiskServerTarget` 中已配置且有效的服务器经纬度；未配置或位置无效时只显示说明，
  不绘制猜测路径。

## 固定视角

- MapLibre 以 `interactive: false`、`dragPan: false`、`dragRotate: false`、`scrollZoom: false`、
  `doubleClickZoom: false`、`touchZoomRotate: false`、`keyboard: false`、`boxZoom: false`
  初始化，也不注册缩放、旋转或全屏控件。
- 中国和世界分别由真实 GeoJSON 包围盒计算初始中心与缩放。切换范围只做程序化相机更新，
  不向用户暴露缩放/平移入口。
- 二维回退使用 `fixedView`，隐藏二维/三维切换和缩放控件，保留中国/世界切换与地域选择。

## 图层与生命周期

- L7 `PolygonLayer` 负责地域填色，`HeatmapLayer` 负责代表点热力，`LineLayer` 负责边界和
  来源汇聚飞线，`PointLayer` 标记有效服务器终点。
- 统计刷新只调用 `setData`，不重建 Scene 或 MapLibre 实例。
- 地图隐藏时暂停 L7 渲染；`prefers-reduced-motion` 打开时关闭飞线动画。
- 卸载或降级时移除 WebGL 上下文监听、ResizeObserver，停止地图与细分 loader，并销毁 L7 Scene。
- `webglcontextlost`、初始化超时或初始化异常会切换到二维地图，并在界面上保留原因和文字排行。

## 直接依赖许可

- `@antv/l7@2.29.1`：MIT。
- `maplibre-gl@3.6.2`：BSD-3-Clause。

两者只随应用代码打包，不从 CDN 加载。边界数据的来源、版本和 SHA256 继续由
`public/maps/risk-v1/LICENSES.md`、`public/maps/risk-v1/manifest.json`、
`public/maps/risk-detail-v2/LICENSES.md` 和 `src/data/riskMapAssets.json` 记录。
