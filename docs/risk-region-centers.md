# 风控服务器目标与地域展示

## 代表点资产

`src/data/risk-region-centers.json`与根`docs/risk-region-centers.json`同字节，共208个编码。SHA256：`59dc9673418dc73a2af05239875a96a06610ef06bc8a64b802b99b81060fa6f2`。

`scripts/build-risk-centers.py`使用固定中国/世界GeoJSON及静态映射，选择最大Polygon，优先面积质心；不在面内时取最长有效面内扫描线区间中点并排除洞。保留六位小数后验证面内及范围，无法验证不填。代表点用于展示近似，不代表访客或服务器实际位置。实际服务器目标优先使用显式人工配置。

## 配置页面

动态菜单组件`risk/server-config/index`，建议路由`/risk/server-config`。GET `/risk/server-config`、POST `/risk/server-config/save`、POST `/risk/server-config/resolve`均通过统一request解包content。页面读取要求`system:risk:view`和`system:risk:config:view`，更新再要求`system:risk:config:update`。

保存提交字符串version、alias、publicIp及成组manualLocation；别名最多64码点，经纬度最多6位小数，公网IP由后端最终校验。版本冲突提示重新读取并保留输入，未知网络结果明确未确认。防重复提交；失权或卸载使在途响应失效，失权清除完整IP。页面不持久化或记录IP，不调用外部定位服务。看板只消费无IP的serverTarget投影。

## 地图与弧线

固定省界/国家边界及加载配置见[risk-map-assets.md](risk-map-assets.md)。地图支持省份/国家点选、键盘选择、缩放、平移、复位与全屏/ESC；全屏保留细分排行及DB-IP署名。

世界视图仅将已知大陆省码和CN国家行各累计一次至CN；HK/MO/TW保持明确编码语义。目标为省份时在世界图按国家汇聚。未知码不按前缀猜测。原始count使用BigInt，独立权重控制线宽颜色；零请求无箭头。弧线方向为来源→服务器，末端箭头静态，同地域在目标显示汇聚计数。无代表点或geometry、UNKNOWN/INTERNAL单列。中国图目标不在实际几何面内时提示切世界。

## 地域观测与覆盖

GET `/risk/geo/status`与汇总共用十秒轮询；两者独立失败保留上次成功数据并标记陈旧。展示当前双离线源健康、数据库及缓存版本、融合规则、字段来源与冲突。Provider.expiresAt为空显示“—”，不推断过期或永久有效。Python批次去重IP缓存决策不等同日志请求量；未知值不转成0，长计数保持精确。

国内城市最高展示精度为城市；境外只展示一级行政区。GET `/risk/geo/cities`追加provinceCode，GET `/risk/geo/subdivisions`追加countryCode。城市码与父省依据运行字典`src/data/geoAdministrativeCities.json`校验；不使用GeoNames ID补码，境外允许已验证的code=null名称型单元。名称安全插值，不做128字符截断。

coverage始终对照整个日期/type/region筛选范围；排行顶层计数及比例使用选中省/国家分母。NOT_COLLECTED、PARTIAL、未知和真实0分别展示；零分母为“—”。COUNTER与GEO_COUNTER不相加，精确计数及一致性校验失败直接报错。切换选择、视图、筛选或权限丢弃迟到响应，同类失败保留带旧选择标记的数据。

## 资产与时间边界

根`docs/geoip-v1/`是Geo黄金样例和行政字典来源；`tests/fixtures/geo-status-example.json`只供测试同字节消费，不进入生产入口。运行包保留实际使用的地图映射、代表点与行政字典。生产配置不包含观测fixture或Geo内部令牌。

所有时刻按Asia/Shanghai展示，空或非法值为“—”；单日轴HH:mm，多日MM-DD HH:mm，分钟表YYYY-MM-DD HH:mm，其他时刻带秒。自然日期独立校验，原请求值和排序不改。表格允许横向滚动。真实鉴权、MMDB、缓存TTL及部署环境跨端联调需单独验收。
