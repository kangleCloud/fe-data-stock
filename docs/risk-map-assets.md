# 风控地图资源配置

## 固定真实资产

`public/maps/risk-v1/china.geojson`：263343字节，34单元；geoBoundaries CHN-ADM1-43563684，代表2019。短SHA9469f09已解析到完整commit `9469f09592ced973a3448cf66b6100b741b64c0d`。Git raw响应是LFS指针，实际文件取同commit的media地址，SHA与LFS oid一致：`bc4afc7eacf4351ae5b3ae7a612327987ce1123cb5deb8574fb49107091c6623`。

`public/maps/risk-v1/world.geojson`：838726字节，177单元；Natural Earth 1:110m Admin-0 countries。下载时解析实际commit并固定为 `ca96624a56bd078437bca8184e78163e5039ad19`，运行时不使用master。SHA：`6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`。

两源均为Public Domain。许可及来源证据见随发布的 `public/maps/risk-v1/LICENSES.md`、`manifest.json`，精确URL、SHA和逐单元编码映射见 `src/data/riskMapAssets.json`。原资源字节未重绘/修改。地图资源不用于确认政治边界，也不改变服务端地域定义。

## 编码与统计

运行时以固定shapeID（中国）及ADM0_A3（世界）查静态映射；校验全部ID、原编码属性、单元数、几何与SHA。不会按英文地名猜测。中国原数据shapeISO统一为CHN，故不能直接作为省级编码；源中“Guangzhou Province”条目对应已审阅的广东shapeID，显式映射CN-44，非运行时名称推断。

省级数字编码CN-11等及字母编码CN-BJ等显式归一。HK/MO/TW，以及CN-91/CN-HK、CN-92/CN-MO、CN-71/CN-TW分别映射到HK/MO/TW边界，不改业务筛选或后端值。世界视图只将映射表中已知的中国大陆省份累计CN，CN国家行本身累计一次，其他地域行各处理一次；不按CN前缀猜未知省份。中国视图的CN国家行作为缺省份单列。

世界低分辨率图没有HK/MO几何，保留单列；Natural Earth无ISO2的CYN/SOL边界不分配猜测国家码，只画原始边界，不放业务计数。UNKNOWN/INTERNAL、未知编码或无geometry来源单列；原始地域排行始终保留。只渲染真实requestCount。所有累计用BigInt，超出安全整数时中性边界加精确计数，不给出有误热力值。

## 加载与隐私

每个页面访问创建独立loader：默认中国，世界按切换加载。本地 `BASE_URL + maps/risk-v1/…` 优先；本地404/网络/结构/编码/SHA错误才尝试同固定commit外部URL一次。每种地图缓存成功和失败Promise，包含并发单飞，十秒业务统计刷新与反复切换不会重下载。每次尝试最多5秒，包含fetch、正文读取和校验；卸载或失权销毁组件时abort并丢弃迟到结果，图表由BaseChart dispose。

地图使用原生fetch，不经过鉴权Axios。GET、credentials:omit、referrerPolicy:no-referrer、redirect:error；仅静态Accept头、无请求体，不携带日志/IP/token/cookie/内部服务字段。补偿站点仍可见浏览器出口IP。两源均失败时显示“地图暂不可用”，其他统计和排行继续显示。无需在线IP定位服务。资源SHA校验优先Web Crypto；HTTP内网离线环境使用同一SHA-256算法的无依赖回退，标准向量、中文及两份实际资产均与Node crypto交叉验证，不跳过校验。

## 细分边界资源

选中中国省份或世界国家后，地图按需加载 `public/maps/risk-detail-v2/` 下的合并细分边界。共206个文件（中国31个省、世界175个国家/地区），9,178,161字节，4,493个feature，其中3,178个feature带已核实编码。`manifest.json` 与 `src/data/riskDetailAssets.json` 逐文件记录 SHA256、字节数和feature数；`public/maps/risk-detail-v2/LICENSES.md` 记录来源证据与处理方式。

- 中国地级市：OCHA HDX《China - Subnational Administrative Boundaries (COD-AB 2020)》ADM2。数据集页 `https://data.humdata.org/dataset/cod-ab-chn`，固定resource UUID `9e67ddf9-ce26-4b7a-82b1-51e5ca0714c8`，dataset date 2020-09-10，resource last modified `2020-09-10T09:00:06.531869`。原始zip SHA256 `f6a1f0fd969dbcc830e395c8211746730a80e8429585e045c6b0da92cd6e0ec9`；所用 `ADM2 .shp`/`.dbf`/`.prj` SHA256分别为 `acb0881183eea5db5cf19597367eefd188b948d3d38962b3cc041656dbdb7dcd`、`6fda17135a6b5651d8321b30f867ca8643ddd2b8024eae15d23f24c7ab27ad33`、`98aaf3d1c0ecadf1a424a4536de261c3daf4e373697cb86c40c43b989daf52eb`。许可为 CC BY-IGO 3.0（`https://creativecommons.org/licenses/by/3.0/igo/legalcode`），署名：China - Subnational Administrative Boundaries, OCHA Regional Office for Asia and the Pacific (ROAP), CC BY-IGO 3.0, via HDX；本仓库发布的是简化并重分组后的衍生数据。HDX注明该边界源自公开在线资料而非官方政府来源，并于2024年10月复核；本图仅用于访问统计与地理展示，不用于确认政治边界。原ADM2共361个feature，排除无对应大陆省级编码的台湾、香港、澳门3个ADM1后保留358个，按6位省级adcode拆分。仅当ADM1中文省名与ADM2中文名同时与 `src/data/geoAdministrativeCities.json`（民政部2023年行政区划）完全一致时赋6位城市编码；比较前仅去除 `[1]`/`〔1〕` 类脚注，不做拼音、模糊、几何或P-code推断。OCHA P-code不是6位adcode，不参与编码。结果343个feature带编码、15个feature保持 `code:null`：这些未匹配边界只显示真实地理轮廓，不参与统计。4个直辖市各用其单一ADM2 feature映射到 `110000`/`120000`/`310000`/`500000`。字典中15个城市在2020数据中无对应边界（新疆11个后设直辖县级市及 `株洲市`、`文昌市`、`那曲市`、`海西蒙古族藏族自治州`），不补造、不近似，其统计留在文字未定位列表。Douglas-Peucker容差0.002度，坐标保留5位小数。该资源替代了此前无明确数据许可的第三方爬取资源包，旧版本目录已删除。
- 境外一级行政区：Natural Earth 1:10m Admin-1 States and Provinces，固定commit `ca96624a56bd078437bca8184e78163e5039ad19`，源文件SHA256 `22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5`；Public Domain。按 `adm0_a3` 分组，仅通过已审阅的 `src/data/riskMapAssets.json` 映射到ISO2；编码取GeoNames `gn_a1_code`（如 `US.CA` -> `US-CA`），且仅当同一键存在于后端 `first-subdivisions.json` 时赋码，重复编码置空。中国国家文件使用上述31个 `CN-XX` 省级轮廓。Douglas-Peucker容差0.01度，坐标保留4位小数。
- 中文名：仅采用含汉字的 `name_zh`；无可靠中文名保留原名并标记 `nameZh:false`，界面显示“（原名）”。内部匹配始终用编码，不用名称猜测；无可靠唯一匹配的feature不赋统计，只保留边界和文字排行。

细分loader与基础地图loader分离，每个页面访问独立创建。选中省/国家时加载其细分边界；二维中国全国视野缩放达到约1.8倍、三维地图缩放达到阈值后，还会上报当前真实视口内的少量父级（中国最多6个、世界最多8个），按需加载这些父级的细分文件以显示视野内城市/一级行政区标签。父级请求最多并发2个，按编码去重，失败Promise缓存且本页面访问内不再重试；平移离开视口时未开始的队列项直接丢弃，迟到结果按视图epoch丢弃。请求为本地 `BASE_URL + maps/risk-detail-v2/<kind>/<key>.geojson`，5秒超时，SHA256不符、结构/编码/prefix/重复编码异常均拒绝。细分资源没有外部补偿；缺失时显示状态，保留上级地图与文字排行。切换视图时abort旧loader并丢弃迟到结果。

## 二维与三维

默认在中国/世界基础地图上显示总览；选中省/国家后，将父级feature替换为细分feature并以独立地图名注册。二维和三维使用同一套真实经纬度与编码统计。三维依赖 `echarts-gl@2.1.0`，左键旋转、右键平移、滚轮缩放，键盘方向键旋转、`+`/`-` 缩放、`0` 复位；中国与世界分别保存相机。中国视图相机缩放约1.8倍后显示视野内城市标签，世界约2.2倍后显示一级行政区标签；标签用交互 `map3D` 的真实 view/projection 矩阵逐点投影，只接受NDC与近远裁剪均在视口内的点，再按真实像素间距和面积优先级贪心去重，因此不会显示视口外标签。全国/世界总览不预加载所有父级。二维中国全国视野使用 ECharts `geo` 的 `convertToPixel` 判断真实像素视口，缩放达到约1.8倍后隐藏省级标签，改为按需加载并显示已核实编码的城市中文标签；二维世界全国视野不加载城市标签，选中省/国家后仍显示其细分边界与标签。WebGL不可用或上下文丢失时自动回退二维并给出重试入口；回退不改变统计、筛选或细分状态。点击细分只高亮并展示现有细分接口的真实统计，不改变全屏筛选。
