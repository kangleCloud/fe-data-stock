# API访问大屏

动态组件risk/dashboard/index，沿既有登录权限。统一request读取dashboard、interfaces/page、sources/page及exceptions/page；异常要求risk:view和exception:view交集权限。只统计API，2xx/3xx成功，4xx/5xx失败含499；状态0及1xx计其他。失败比例为失败/(成功+失败)，分母0显示—。来源IP及method+path接口按整个筛选范围精确去重。

六KPI为总量、成功、失败、失败率、IP及接口数；地图背景与半透明面板，左接口/IP榜、右成功失败趋势/HTTP状态、底部地域/城市或境外一级。明细/失败/Geo按需抽屉，后台服务器配置页仍为带侧栏浅色表单，保存停留原页。

筛选支持最近90自然日内、最多31天闭区间，日期/地域/方法/路径字面包含/IP/HTTP状态。整数string及BigInt保留精度；不安全趋势不转Number绘图。每10秒非重入刷新，隐藏暂停，筛选/权限/卸载丢弃旧响应，失败保留旧数据并标记。图表和地图实例不因统计刷新销毁。

1920×1080和2560×1440单屏布局，宽小于1280或可用高小于720回到流式；键盘焦点可见，关闭动画，DB-IP署名保留。黄金响应仅复制到tests/fixtures，不进入生产包。实际联调与离线合成预览须分别记录。

## 本轮验证（2026-11-04）

最终全套61文件439项通过；lint、strict type-check与build通过，diff-check通过。最终测试的lint mock写法修正后，相关10项组件测试与lint再次通过。既有共享BaseChart约696.44kB/gzip234.20kB的chunk警告保留。

根java-service-response.json同字节消费副本SHA256=62610317a5f25d0af42ceae740e6332a30be815f7e2971be7e3ceb22aa69f30f；Python真实Collector三批原文经Java实际解析/入库/查询产物/tmp/risk-minute-java-collector-query.json的消费副本SHA256=6345030977258970f2c1044ca2b4c6cb98373bb7e693dec39cb4230b0d9b1c11，测试资源不进生产包。统一request实际消费核对12=成功7+失败3+其他2，失败率0.300000、精确IP4、接口2、499失败2；北京城市110000计9与全范围覆盖12分开，3个业务日期保留。组件六KPI断言一致。真实MySQL8及生产网络未验，不能以H2/离线adapter代替。

实际Chrome普通视口：1920×1080与2560×1440单屏，375回流。最终PNG截图为/tmp/access-dashboard-final-1920.png、/tmp/access-dashboard-final-2560.png、/tmp/access-dashboard-final-375.png（375×2687全页）；均使用Collector→Java离线响应且标明非真实联调。紧凑城市卡直接可见北京市/9，分母、起点、编码在点击覆盖Tips；统计口径Enter打开、Space关闭，覆盖Tips Enter打开已实操。Tips截图/tmp/access-dashboard-statistics-tip.png与/tmp/access-dashboard-coverage-tip.png。世界地图切换、IP抽屉与ESC关闭已实操。最初缺失图例模块警告已通过页面文字图例修复；视口切换曾有ResizeObserver通知循环警告，不宣称整个浏览器历史始终无告警。

全屏：顶部整个大屏requestFullscreen、退出、fullscreenchange与ESC已有真实组件测试；浏览器自动化点击未获全屏权限，原生Chrome操作工具随后超时，因此浏览器原生全屏进入列为未验，不绕过、不将尝试当通过。

基线/tmp/risk-redesign-fe-baseline.json：仅19个原有风控代码/测试/文档路径有意变化，新增2个测试数据副本与1个Service消费测试。旧RiskDashboardFrame及risk-v1-wire夹具删除；退出类型/SSE/P95/HLL/归档的API、类型及展示；后台服务器配置表单、Admin包装、通用布局/动态路由、菜单根目录修复、持仓与私有环境文件逐字节保持。预览HTML、服务和本轮最后标签已清理、尺寸已恢复；更早失去调试连接的标签交由工具自动清理。未改其他仓库或根契约，未提交、部署、SQL、Redis操作或Review。
