# 风控地图增量（2026-10-30）

## 固定真实资产

`public/maps/risk-v1/china.geojson`：263343字节，34单元；geoBoundaries CHN-ADM1-43563684，代表2019。短SHA9469f09已解析到完整commit `9469f09592ced973a3448cf66b6100b741b64c0d`。Git raw响应是LFS指针，实际文件取同commit的media地址，SHA与LFS oid一致：`bc4afc7eacf4351ae5b3ae7a612327987ce1123cb5deb8574fb49107091c6623`。

`public/maps/risk-v1/world.geojson`：838726字节，177单元；Natural Earth 1:110m Admin-0 countries。下载时解析实际commit并固定为 `ca96624a56bd078437bca8184e78163e5039ad19`，运行时不使用master。SHA：`6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`。

两源均为Public Domain。许可及来源证据见随发布的 `public/maps/risk-v1/LICENSES.md`、`manifest.json`，精确URL、SHA和逐单元编码映射见 `src/data/riskMapAssets.json`。原资源字节未重绘/修改。地图资源不用于确认政治边界，也不改变服务端地域定义。

## 编码与统计

运行时以固定shapeID（中国）及ADM0_A3（世界）查静态映射；校验全部ID、原编码属性、单元数、几何与SHA。不会按英文地名猜测。中国原数据shapeISO统一为CHN，故不能直接作为省级编码；源中“Guangzhou Province”条目对应已审阅的广东shapeID，显式映射CN-44，非运行时名称推断。

省级数字编码CN-11等及字母编码CN-BJ等显式归一。HK/MO/TW，以及CN-91/CN-HK、CN-92/CN-MO、CN-71/CN-TW分别映射到HK/MO/TW边界，不改业务筛选或后端值。世界视图只将映射表中已知的中国大陆省份累计CN，CN国家行本身累计一次，其他地域行各处理一次；不按CN前缀猜未知省份。中国视图的CN国家行作为缺省份单列。

世界低分辨率图没有HK/MO几何，保留单列；Natural Earth无ISO2的CYN/SOL边界不分配猜测国家码，只画原始边界，不放业务计数。UNKNOWN/INTERNAL、未知编码或无geometry来源单列；原始地域排行始终保留。只渲染真实requestCount，与每日来源HLL无关。所有累计用BigInt，超出安全整数时中性边界加精确计数，不给出有误热力值。

## 加载与隐私

每个页面访问创建独立loader：默认中国，世界按切换加载。本地 `BASE_URL + maps/risk-v1/…` 优先；本地404/网络/结构/编码/SHA错误才尝试同固定commit外部URL一次。每种地图缓存成功和失败Promise，包含并发单飞，十秒业务统计刷新与反复切换不会重下载。每次尝试最多5秒，包含fetch、正文读取和校验；卸载或失权销毁组件时abort并丢弃迟到结果，图表由BaseChart dispose。

地图使用原生fetch，不经过鉴权Axios。GET、credentials:omit、referrerPolicy:no-referrer、redirect:error；仅静态Accept头、无请求体，不携带日志/IP/token/cookie/内部服务字段。补偿站点仍可见浏览器出口IP。两源均失败时显示“地图暂不可用”，其他统计和排行继续显示。无需在线IP定位服务。资源SHA校验优先Web Crypto；HTTP内网离线环境使用同一SHA-256算法的无依赖回退，标准向量、中文及两份实际资产均与Node crypto交叉验证，不跳过校验。

## 验证记录

pnpm lint、pnpm type-check、pnpm test、pnpm build、git diff --check均通过；51个测试文件394项（本轮地图2个新文件19项）。新增文件另外执行git diff --no-index --check，结果无空白错误。构建产物dist/maps与原资产两份SHA逐一一致。注册MapChart/GeoComponent后共享BaseChart chunk约674.43kB（gzip227.61kB），构建有大于500kB提示，未掩盖。

地图测试含实际资产及SHA/许可、完整编码/几何校验、本地成功零外部、BASE_URL子路径、404/非法/网络/结构/编码失败补偿、外部5秒超时/双失败缓存、并发单飞、十秒更新/切换缓存、无凭据/无Referrer/禁止重定向、精确汇总/无geometry/巨大计数、卸载取消。标准SHA向量/中文/真实两资产验证HTTP内网回退算法。地图动画始终关闭，断言无漫游/动画及可访问无数据描述，适配reduced-motion。既有页面权限回归继续通过。

浏览器已实际加载并渲染两份本地资源，中国与世界切换正常；默认桌面和真实375px视口均目视核对，地域排行持续存在。控制台warn/error列表为空。截图 `/tmp/risk-map-china.png`、`/tmp/risk-map-world.png`、`/tmp/risk-map-375.png` 为明确标注的非生产夹具。修复ECharts自动ARIA在无统计边界读出NaN的问题，改为清晰的边界/精确列表说明。临时预览文件/本机服务/浏览器标签已关闭，视口覆盖已reset。

外部补偿的真实浏览器网络连通、生产登录授权/真实统计、Nginx部署BASE_URL路径、系统reduced-motion设置与各浏览器兼容仍需部署环境联调；外部失败路径和子路径已做离线可执行回归，不冒称生产验收。

本轮SHA基线 `/tmp/risk-map-fe-baseline.json` 共243路径，含未提交/删除/被忽略本机文件。相对该基线只修改src/charts/echarts.ts、src/views/risk/dashboard/index.vue、tests/risk-dashboard.spec.ts、docs/risk-v1-frontend.md四个原文件，新增11个地图代码/资产/文档/测试文件。生成的components.d.ts在校验候选SHA与基线相同后恢复；持仓、认证、私有配置及其他既有文件SHA未改变。未修改其他仓库或根共享协议，不提交、不部署、不执行SQL、不启用Review。
