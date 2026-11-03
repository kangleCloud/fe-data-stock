<script setup lang="ts">
import type { EChartsCoreOption } from "echarts/core";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { echarts } from "@/charts/echarts";
import BaseChart from "@/components/market/BaseChart.vue";
import { riskFlows } from "@/utils/riskFlows";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskCount, riskRegion } from "@/utils/risk";
import { createRiskMapLoader, riskMapCounts, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
const emit = defineEmits<{ regionSelect: [code: string, view: RiskMapKind]; viewChange: [view: RiskMapKind] }>();
const chartControl = ref<InstanceType<typeof BaseChart>>();
const mapRoot = ref<HTMLElement>();
const expanded = ref(false);
const keyboardRegion = ref("");
async function toggleFullscreen() {
  if (expanded.value) { expanded.value = false; if (document.fullscreenElement === mapRoot.value) await document.exitFullscreen?.(); return; }
  expanded.value = true;
  try { await mapRoot.value?.requestFullscreen?.(); } catch { /* Full viewport layout remains available. */ }
}
function onEscape(event: KeyboardEvent) { if (event.key === "Escape") { expanded.value = false; if (document.fullscreenElement === mapRoot.value) void document.exitFullscreen?.(); } }
function onFullscreenChange() { if (!document.fullscreenElement) expanded.value = false; }
function selectRegion(code: string) { if (loaded.value?.geo.features.some((feature) => feature.properties.code === code)) { keyboardRegion.value = code; emit("regionSelect", code, kind.value); } }
const props = defineProps<{ regions: { regionCode: string; requestCount: string }[]; serverTarget?: RiskServerTarget }>();
const kind = ref<RiskMapKind>("china");
const loaded = shallowRef<RiskMapAsset>();
const state = ref<"loading" | "ready" | "unavailable">("loading");
const loader = createRiskMapLoader();
let revision = 0;
let disposed = false;
async function selectMap(next: RiskMapKind) {
  if (next !== kind.value) emit("viewChange", next);
  keyboardRegion.value = "";
  kind.value = next;
  const current = ++revision;
  loaded.value = undefined; state.value = "loading";
  try {
    const asset = await loader.load(next);
    if (disposed || current !== revision) return;
    echarts.registerMap(`risk-v1-${next}`, asset.geo as Parameters<typeof echarts.registerMap>[1]);
    loaded.value = asset; state.value = "ready";
  } catch { if (!disposed && current === revision) state.value = "unavailable"; }
}
const counts = computed(() => loaded.value ? riskMapCounts(kind.value, props.regions, loaded.value.geo) : undefined);
const flows = computed(() => loaded.value ? riskFlows(kind.value, props.regions, props.serverTarget, loaded.value.geo) : undefined);
const option = computed<EChartsCoreOption>(() => {
  const exact = new Map(counts.value?.exact.map((item) => [item.name, item.count]));
  const labels = new Map(loaded.value?.geo.features.map((feature) => [feature.properties.name, feature.properties.label]));
  const safe = counts.value?.safe ?? true;
  const data = safe ? counts.value?.exact.map((item) => ({ name: item.name, value: Number(item.count) })) ?? [] : [];
  return {
    animation: false, aria: { enabled: true, label: { description: `${kind.value === "china" ? "中国省级" : "世界国家"}请求数地图；无统计的地域仅显示边界，精确计数与未定位来源见下方列表。` } },
    tooltip: { renderMode: "richText", formatter: (params: unknown) => {
      const name = (params as { name?: string }).name ?? "";
      const datum = (params as { data?: { count?: string; isTarget?: boolean } }).data;
      if (datum?.isTarget) return `服务器：${props.serverTarget?.alias ?? "服务器"}\n已配置有效位置`;
      if (datum?.count) return `${labels.get(name) ?? name} → ${props.serverTarget?.alias ?? "服务器"}\n请求：${riskCount(datum.count)}`;
      return `${labels.get(name) ?? name}\n请求：${exact.has(name) ? riskCount(exact.get(name)) : "无可定位统计"}`;
    } },
    visualMap: safe && data.length ? { seriesIndex: 0, min: 0, max: Math.max(1, ...data.map((item) => item.value)), left: 0, bottom: 0, text: ["请求多", "少"], textStyle: { color: "#abc7e0" }, inRange: { color: ["#173d65", "#39d9ed"] }, calculable: false } : undefined,
    geo: { map: `risk-v1-${kind.value}`, roam: true, scaleLimit: { min: 1, max: 8 }, layoutCenter: ["50%", "45%"], layoutSize: "95%", itemStyle: { areaColor: "#112d49", borderColor: "#5c9ac1", borderWidth: .6 }, emphasis: { label: { show: false } } },
    series: [{ type: "map", map: `risk-v1-${kind.value}`, geoIndex: 0, roam: false, selectedMode: false, data },
      { type: "lines", coordinateSystem: "geo", zlevel: 2, symbol: ["none", "arrow"], symbolSize: 7, effect: { show: false }, lineStyle: { curveness: .22, opacity: .85 }, data: flows.value?.lines ?? [] },
      { type: "scatter", coordinateSystem: "geo", zlevel: 3, symbol: "pin", symbolSize: 28, itemStyle: { color: "#ffb65c" }, data: flows.value?.target ? [{ name: props.serverTarget?.alias ?? "服务器", value: flows.value.target, isTarget: true }] : [] },
      { type: "scatter", coordinateSystem: "geo", zlevel: 4, symbol: "circle", symbolSize: 16, itemStyle: { color: "#ff655b" }, data: flows.value?.same ?? [] }],
  };
});
onMounted(() => { document.addEventListener("keydown", onEscape); document.addEventListener("fullscreenchange", onFullscreenChange); void selectMap("china"); });
onBeforeUnmount(() => { document.removeEventListener("keydown", onEscape); document.removeEventListener("fullscreenchange", onFullscreenChange); if (document.fullscreenElement === mapRoot.value) void document.exitFullscreen?.(); disposed = true; revision++; loader.stop(); loaded.value = undefined; });
</script>

<template>
  <div ref="mapRoot" class="risk-region-map" :class="{ 'risk-map-expanded': expanded }">
    <div class="risk-controls" role="group" aria-label="地图范围"><button type="button" :aria-pressed="kind === 'china'" @click="selectMap('china')">中国</button><button type="button" :aria-pressed="kind === 'world'" @click="selectMap('world')">世界</button></div>
    <div class="risk-controls" role="group" aria-label="地图视图操作"><button type="button" @click="toggleFullscreen">{{ expanded ? '退出全屏（ESC）' : '地图全屏' }}</button><button type="button" @click="chartControl?.zoom(1.25)">放大</button><button type="button" @click="chartControl?.zoom(0.8)">缩小</button><button type="button" @click="chartControl?.resetView()">复位</button></div>
    <label v-if="loaded">键盘选择地域下钻<select v-model="keyboardRegion" @change="selectRegion(keyboardRegion)"><option value="">选择省份或国家</option><option v-for="feature in loaded.geo.features.filter((row) => row.properties.code)" :key="feature.properties.name" :value="feature.properties.code!">{{ feature.properties.label }} ({{ feature.properties.code }})</option></select></label>
    <p v-if="state === 'loading'" role="status">正在加载地图边界…</p>
    <div v-else-if="state === 'unavailable'" class="risk-map-unavailable" role="status"><strong>地图暂不可用</strong><p>本地资源与固定版本补偿均未成功；地域排行与其他统计仍可查看。</p></div>
    <template v-else>
      <BaseChart :interactive-map="true" ref="chartControl" :key="kind" @region-select="selectRegion" :option="option" :accessible-label="`${kind === 'china' ? '中国省级' : '世界国家'}请求数地图；精确数据见下方列表，无定位来源单列`" :height="expanded ? '70vh' : '520px'" />
      <p v-if="flows?.notice" role="status">{{ flows.notice }}</p>
      <p v-if="flows?.target">目标：{{ serverTarget?.alias ?? '服务器' }} · 筛选期请求汇聚。</p>
      <p>请求次数：青（低）· 橙（中）· 红（高）</p>
      <ul class="risk-list"><li v-for="row in flows?.same" :key="row.name"><span>{{ row.name }} · 同地域汇聚</span><strong>{{ riskCount(row.count) }}</strong></li><li v-for="(row, index) in flows?.unplaced" :key="index"><span>{{ row.regionCode }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul>
      <p v-if="!counts?.safe" class="risk-warning">请求数超出安全绘图精度，仅显示边界；精确计数见下方。</p>
      <p v-else-if="!counts?.exact.length" class="risk-muted">无可定位请求数据，仅展示边界。</p>
      <p class="risk-muted">{{ loaded?.origin === 'local' ? '本地离线边界' : '固定版本外部补偿边界' }} · 请求次数，不代表每日来源估算。</p>
      <details><summary>本图精确计数与未定位来源</summary><ul class="risk-list"><li v-for="row in counts?.exact" :key="row.name"><span>{{ riskRegion(row.name) }}</span><strong>{{ riskCount(row.count) }}</strong></li><li v-for="(row, index) in counts?.unplaced" :key="`${row.regionCode}:${index}`"><span>{{ riskRegion(row.regionCode) }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul></details>
    </template>
    <p>IP Geolocation by <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">DB-IP</a></p>
    <slot name="details" />
    <details class="risk-notes"><summary>地图来源与统计说明</summary><p>来源地域代表点 → 服务器；为筛选期汇总，不是真实网络路径或精确访客位置。线宽为归一化权重，静态箭头始终指向服务器。</p><p>geoBoundaries CHN ADM1（代表2019，34单元）与 Natural Earth 1:110m，均为公有领域数据，固定版本随应用发布。边界仅用于访问统计展示；HK/MO/TW按统计编码显式映射，微小地域无本图边界时单列。来源与SHA见本端地图资产文档。</p><p>本地资源不可用时，每种地图每次页面访问最多尝试一次固定版本外部资源，不传业务鉴权、日志或内部地址；对方可见浏览器网络出口IP。</p></details>
  </div>
</template>

<style scoped>
.risk-map-expanded { position: fixed; inset: 0; z-index: 3000; padding: 20px; overflow: auto; background: var(--risk-background, #061628); color: var(--risk-text, #edf6ff); }
.risk-region-map:fullscreen { overflow: auto; padding: 20px; background: #061628; }
</style>
