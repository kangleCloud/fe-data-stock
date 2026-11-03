# 风控前端接口与展示边界

## 页面与接口

看板动态组件`risk/dashboard/index`，建议路由`/risk/dashboard`，由受控动态视图注册表识别。全部业务接口通过统一request处理前缀及`CommonResult.content`。

四个GET接口为`/risk/dashboard`、`/risk/interfaces/page`、`/risk/exceptions/page`、`/risk/archives/page`，分页保持list/total。失败保留成功画面并提示，不视为0或空成功。归档仅按日期和分页查询。

全部页面请求要求`system:risk:view`，异常再要求`system:risk:exception:view`，归档再要求`system:risk:archive:view`，按AND判断。异常和归档按需读取，失权清除显示并丢弃在途响应。

## 统计与交互

- 上海日期支持今日/昨日/近7日、自定义闭区间最多31天，拒绝非法、逆序和未来日期；筛选变更重置页码。
- 汇总结束后十秒刷新，隐藏暂停、恢复刷新、非重入；筛选/权限变化与卸载使迟到结果失效。
- 未成功更新时标明旧结果，展示更新时间、生成时刻、采集心跳、延迟、最后事件、完整性和固定警告。
- 累计整数保留字符串并以BigInt格式化；超安全整数改看精确表格。
- HTTP错误不含499，499及上游失败尝试单列。REST P95与SSE连接时长P95独立，明确分桶近似、溢出及无样本。SSE结束数不推导在线人数或消息量。
- 每日来源HLL为估算，不跨日合计；UNKNOWN与INTERNAL独立。质量只按日期，不随地域/类型缩小。

页面复用BaseChart/ECharts，使用安全Vue插值和richText tooltip，窄屏表格独立横向滚动且可键盘聚焦，不加载外部字体或跟踪脚本。地图、目标弧线始终关闭流动特效；漫游缩放可用。

地图资源与下载配置见[risk-map-assets.md](risk-map-assets.md)，服务器配置、地域细分与代表点见[risk-region-centers.md](risk-region-centers.md)。地图不可用时显示真实排行和其他统计，不伪造边界或点位。

## 测试资产边界

根`docs/risk-v1/`与`docs/geoip-v1/`为各自黄金样例权威源。`tests/fixtures/`中的响应及wire样例仅用于离线回归，生产src与public不导入纯fixture。`src/data/`保留运行需要的行政字典、地图映射和代表点。

检查命令为`pnpm lint`、`pnpm type-check`、相关`pnpm exec vitest run …`、`pnpm build`及`git diff --check`。构建的共享图表chunk存在大于500kB提示。离线测试不替代真实登录菜单权限、Java/Python/Redis/MySQL及生产BASE_URL/CSP联调。
