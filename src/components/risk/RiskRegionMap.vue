<script setup lang="ts">
import { Plus, Minus, Refresh, FullScreen } from "@element-plus/icons-vue";
import RiskInfo from "@/components/risk/RiskInfo.vue";
import type { EChartsCoreOption } from "echarts/core";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { echarts } from "@/charts/echarts";
import RiskMap3D from "@/components/risk/RiskMap3D.vue";
import { canRiskWebGL } from "@/utils/riskWebGL";
import { defaultRiskCamera, type RiskCamera3D } from "@/utils/riskCamera3d";
import BaseChart from "@/components/market/BaseChart.vue";
import { riskFlows } from "@/utils/riskFlows";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskCount, riskRegion } from "@/utils/risk";
import { createRiskMapLoader, riskMapCounts, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
const emit = defineEmits<{ regionSelect: [code: string, view: RiskMapKind]; viewChange: [view: RiskMapKind]; statusChange: [messages: string[]] }>();
const mode = ref<"2d" | "3d">("3d");
const modeError = ref("");
const cameras: Record<RiskMapKind, RiskCamera3D> = { china: defaultRiskCamera(), world: defaultRiskCamera() };
const camera3d = ref<InstanceType<typeof RiskMap3D>>();
function selectMode(next: "2d" | "3d") {
  modeError.value = "";
  if (next === "3d" && !canRiskWebGL()) { fallback("WebGL不可用，已切回二维地图"); return; }
  mode.value = next;
}
function fallback(reason: string) { mode.value = "2d"; modeError.value = reason; }
function zoom(factor: number) { if (mode.value === "3d") camera3d.value?.zoom(factor); else chartControl.value?.zoom(factor); }
function resetView() { if (mode.value === "3d") camera3d.value?.resetView(); else chartControl.value?.resetView(); }
const chartControl = ref<InstanceType<typeof BaseChart>>();
const mapRoot = ref<HTMLElement>();
const expanded = ref(false);
async function toggleFullscreen() {
  if (expanded.value) { expanded.value = false; if (document.fullscreenElement === mapRoot.value) await document.exitFullscreen?.(); return; }
  expanded.value = true;
  try { await mapRoot.value?.requestFullscreen?.(); } catch { /* Full viewport layout remains available. */ }
}
function onEscape(event: KeyboardEvent) { if (event.key === "Escape") { expanded.value = false; if (document.fullscreenElement === mapRoot.value) void document.exitFullscreen?.(); } }
function onFullscreenChange() { if (!document.fullscreenElement) expanded.value = false; }
function selectRegion(code: string) { if (loaded.value?.geo.features.some((feature) => feature.properties.code === code)) { emit("regionSelect", code, kind.value); } }
const props = defineProps<{ regions: { regionCode: string; requestCount: string }[]; serverTarget?: RiskServerTarget; backdrop?: boolean }>();
const kind = ref<RiskMapKind>("china");
const loaded = shallowRef<RiskMapAsset>();
const state = ref<"loading" | "ready" | "unavailable">("loading");
const loader = createRiskMapLoader();
let revision = 0;
let disposed = false;
async function selectMap(next: RiskMapKind) {
  if (next !== kind.value) emit("viewChange", next);
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
const showLegend = computed(() => counts.value?.safe && counts.value.exact.some(item => BigInt(item.count) > 0n));
const flows = computed(() => loaded.value ? riskFlows(kind.value, props.regions, props.serverTarget, loaded.value.geo) : undefined);
const messages = computed(() => [modeError.value, state.value === "loading" ? "正在加载地图边界" : state.value === "unavailable" ? "地图暂不可用，统计仍可查看" : "", flows.value?.notice ?? "", counts.value && !counts.value.safe ? "地图计数超出安全精度，显示中性边界" : ""].filter(Boolean));
watch(messages, (value, previous) => {
  if (!previous || value.length !== previous.length || value.some((message, index) => message !== previous[index])) emit("statusChange", value);
}, { immediate: true });
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
    visualMap: safe && data.length ? { show: !props.backdrop, seriesIndex: 0, min: 0, max: Math.max(1, ...data.map((item) => item.value)), left: props.backdrop ? "43%" : 0, bottom: props.backdrop ? "29%" : 0, orient: props.backdrop ? "horizontal" : "vertical", text: ["请求多", "少"], textStyle: { color: "#abc7e0" }, inRange: { color: ["#173d65", "#39d9ed"] }, calculable: false } : undefined,
    geo: { map: `risk-v1-${kind.value}`, roam: true, scaleLimit: { min: 1, max: 8 }, layoutCenter: props.backdrop ? ["50%", "48%"] : ["50%", "45%"], layoutSize: props.backdrop ? "90%" : "95%", itemStyle: { areaColor: "#112d49", borderColor: "#22b6d9", borderWidth: .8, shadowColor: "#0b83aa", shadowBlur: 10 }, emphasis: { label: { show: false } } },
    series: [{ type: "map", map: `risk-v1-${kind.value}`, geoIndex: 0, roam: false, selectedMode: false, data },
      { type: "lines", coordinateSystem: "geo", zlevel: 2, symbol: ["none", "arrow"], symbolSize: 7, effect: { show: false }, lineStyle: { curveness: .22, opacity: .85 }, data: flows.value?.lines ?? [] },
      { type: "scatter", coordinateSystem: "geo", zlevel: 3, symbol: "pin", symbolSize: 28, itemStyle: { color: "#ffb65c" }, data: flows.value?.target ? [{ name: props.serverTarget?.alias ?? "服务器", value: flows.value.target, isTarget: true }] : [] },
      { type: "scatter", coordinateSystem: "geo", zlevel: 4, symbol: "circle", symbolSize: 16, itemStyle: { color: "#ff655b" }, data: flows.value?.same ?? [] }],
  };
});
onMounted(() => { if (!canRiskWebGL()) fallback("WebGL不可用，已切回二维地图"); document.addEventListener("keydown", onEscape); document.addEventListener("fullscreenchange", onFullscreenChange); void selectMap("china"); });
onBeforeUnmount(() => { document.removeEventListener("keydown", onEscape); document.removeEventListener("fullscreenchange", onFullscreenChange); if (document.fullscreenElement === mapRoot.value) void document.exitFullscreen?.(); disposed = true; revision++; loader.stop(); loaded.value = undefined; });
</script>

<template>
  <div ref="mapRoot" class="risk-region-map" :class="{ 'risk-map-expanded': expanded, 'risk-map-backdrop': backdrop }">
    <div class="risk-controls map-scope" role="group" aria-label="地图范围"><button type="button" :aria-pressed="kind === 'china'" @click="selectMap('china')">中国</button><button type="button" :aria-pressed="kind === 'world'" @click="selectMap('world')">世界</button><button type="button" :aria-pressed="mode === '2d'" @click="selectMode('2d')">2D</button><button type="button" :aria-pressed="mode === '3d'" @click="selectMode('3d')">3D</button></div>
    <div class="risk-controls map-navigation" role="group" aria-label="地图视图操作"><button v-if="!backdrop" type="button" :aria-label="expanded ? '退出地图全屏' : '地图全屏'" @click="toggleFullscreen"><FullScreen aria-hidden="true" /></button><button type="button" aria-label="放大" title="放大" :disabled="state !== 'ready'" @click="zoom(1.25)"><Plus aria-hidden="true" /></button><button type="button" aria-label="缩小" title="缩小" :disabled="state !== 'ready'" @click="zoom(0.8)"><Minus aria-hidden="true" /></button><button type="button" aria-label="复位" title="复位" :disabled="state !== 'ready'" @click="resetView"><Refresh aria-hidden="true" /></button></div>

    <p v-if="modeError && !backdrop" class="risk-mode-error" role="status">{{ modeError }}</p>
    <p v-if="state === 'loading' && !backdrop" role="status">正在加载地图边界…</p>
    <div v-if="state === 'unavailable' && !backdrop" class="risk-map-unavailable" role="status"><strong>地图暂不可用</strong><p>本地资源与固定版本补偿均未成功；地域排行与其他统计仍可查看。</p></div>
    <template v-if="state === 'ready'">
      <RiskMap3D v-if="mode === '3d' && loaded" ref="camera3d" :key="kind" :asset="loaded" :kind="kind" :regions="regions" :server-target="serverTarget" :camera="cameras[kind]" :height="expanded ? '70vh' : backdrop ? '100%' : '520px'" @region-select="selectRegion" @camera-change="cameras[kind] = $event" @failed="fallback" />
      <BaseChart v-else :interactive-map="true" ref="chartControl" :key="kind" @region-select="selectRegion" :option="option" :accessible-label="`${kind === 'china' ? '中国省级' : '世界国家'}请求数地图；精确数据见下方列表，无定位来源单列`" :height="expanded ? '70vh' : backdrop ? '100%' : '520px'" />
      <div v-if="backdrop" class="access-map-caption" :class="{ 'is-2d': mode === '2d' }">
        <template v-if="showLegend"><span>地域请求量</span><span>低</span><i aria-hidden="true" /><span>高</span></template>
        <RiskInfo label="地图说明">3D 支持拖动旋转、右键平移及滚轮缩放。聚焦后可用方向键、加减键和 0 操作。弧线从来源地域代表点指向金色服务器终点，表示筛选期汇总。</RiskInfo>
      </div>
      <template v-if="!backdrop">
        <p v-if="flows?.notice" role="status">{{ flows.notice }}</p>
        <p v-if="flows?.target">来源 → 服务器：{{ serverTarget?.alias ?? '服务器' }} · 金色终点标记 · 筛选期请求汇聚。</p>
        <p>行政区颜色由深到浅表示请求量；弧线权重：青（低）· 橙（中）· 红（高）</p>
        <ul class="risk-list"><li v-for="row in flows?.same" :key="row.name"><span>{{ row.name }} · 同地域汇聚</span><strong>{{ riskCount(row.count) }}</strong></li><li v-for="(row, index) in flows?.unplaced" :key="index"><span>{{ row.regionCode }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul>
        <p v-if="!counts?.safe" class="risk-warning">请求数超出安全绘图精度，仅显示边界；精确计数见下方。</p>
        <p v-else-if="!counts?.exact.length" class="risk-muted">无可定位请求数据，仅展示边界。</p>
        <p class="risk-muted">{{ loaded?.origin === 'local' ? '本地离线边界' : '固定版本外部补偿边界' }} · 请求次数。</p>
        <details><summary>本图精确计数与未定位来源</summary><ul class="risk-list"><li v-for="row in counts?.exact" :key="row.name"><span>{{ riskRegion(row.name) }}</span><strong>{{ riskCount(row.count) }}</strong></li><li v-for="(row, index) in counts?.unplaced" :key="`${row.regionCode}:${index}`"><span>{{ riskRegion(row.regionCode) }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul></details>
      </template>
    </template>
    <template v-if="!backdrop">
      <p>IP Geolocation by <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">DB-IP</a></p>
      <slot name="details" />
      <details class="risk-notes"><summary>地图来源与统计说明</summary><p>来源地域代表点 → 服务器；为筛选期汇总，不是真实网络路径或精确访客位置。线宽为归一化权重，金色标记表示服务器终点。二维箭头指向服务器，三维弧线保持静态。</p><p>geoBoundaries CHN ADM1（代表2019，34单元）与 Natural Earth 1:110m，均为公有领域数据，固定版本随应用发布。边界仅用于访问统计展示；HK/MO/TW按统计编码显式映射，微小地域无本图边界时单列。来源与SHA见本端地图资产文档。</p><p>本地资源不可用时，每种地图每次页面访问最多尝试一次固定版本外部资源，不传业务鉴权、日志或内部地址；对方可见浏览器网络出口IP。</p></details>
    </template>
  </div>
</template>

<style scoped>
.risk-map-expanded { position: fixed; inset: 0; z-index: 3000; padding: 20px; overflow: auto; background: var(--risk-background, #061628); color: var(--risk-text, #edf6ff); }
.risk-region-map:fullscreen { overflow: auto; padding: 20px; background: #061628; }
</style>
