<script setup lang="ts">
import { Plus, Minus, Refresh, FullScreen } from "@element-plus/icons-vue";
import { useEventListener, usePreferredReducedMotion } from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import RiskInfo from "@/components/risk/RiskInfo.vue";
import RiskMapCanvas from "@/components/risk/RiskMapCanvas.vue";
import { echarts } from "@/charts/echarts";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskCount, riskRegion } from "@/utils/risk";
import { riskFlows } from "@/utils/riskFlows";
import { createRiskMapLoader, riskMapCounts, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
import { buildRiskMapOption } from "@/utils/riskMapOption";
import { defaultRiskMapView, riskMapViewKey, zoomRiskMapView, type RiskMapView } from "@/utils/riskMapView";

const props = defineProps<{ regions: { regionCode: string; requestCount: string }[]; serverTarget?: RiskServerTarget; backdrop?: boolean }>();
const emit = defineEmits<{ regionSelect: [code: string, view: RiskMapKind]; viewChange: [view: RiskMapKind]; statusChange: [messages: string[]] }>();

const mode = ref<"2d" | "3d">("3d");
const views = reactive<Record<RiskMapKind, RiskMapView>>({
  china: defaultRiskMapView(),
  world: defaultRiskMapView(),
});
const reducedMotion = usePreferredReducedMotion();
const motionReduced = computed(() => reducedMotion.value === "reduce");
const kind = ref<RiskMapKind>("china");
const loaded = shallowRef<RiskMapAsset>();
const state = ref<"loading" | "ready" | "unavailable">("loading");
const loader = createRiskMapLoader();
let revision = 0;
let disposed = false;

const mapRoot = ref<HTMLElement>();
const expanded = ref(false);

function selectMode(next: "2d" | "3d") {
  mode.value = next;
}

function zoom(factor: number) {
  views[kind.value] = zoomRiskMapView(views[kind.value], factor);
}

function resetView() {
  views[kind.value] = defaultRiskMapView();
}

function keydown(event: KeyboardEvent) {
  const next = riskMapViewKey(views[kind.value], event.key);
  if (next) {
    event.preventDefault();
    views[kind.value] = next;
  }
}

async function toggleFullscreen() {
  if (expanded.value) {
    expanded.value = false;
    if (document.fullscreenElement === mapRoot.value) await document.exitFullscreen?.();
    return;
  }
  expanded.value = true;
  try {
    await mapRoot.value?.requestFullscreen?.();
  } catch { /* Full viewport layout remains available. */ }
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  expanded.value = false;
  if (document.fullscreenElement === mapRoot.value) void document.exitFullscreen?.();
}

function onFullscreenChange() {
  if (!document.fullscreenElement) expanded.value = false;
}

function selectRegion(code: string) {
  if (loaded.value?.geo.features.some((feature) => feature.properties.code === code)) {
    emit("regionSelect", code, kind.value);
  }
}

async function selectMap(next: RiskMapKind) {
  if (next !== kind.value) emit("viewChange", next);
  kind.value = next;
  const current = ++revision;
  loaded.value = undefined;
  state.value = "loading";
  try {
    const asset = await loader.load(next);
    if (disposed || current !== revision) return;
    echarts.registerMap(`risk-v1-${next}`, asset.geo as Parameters<typeof echarts.registerMap>[1]);
    loaded.value = asset;
    state.value = "ready";
  } catch {
    if (!disposed && current === revision) state.value = "unavailable";
  }
}

const counts = computed(() => loaded.value ? riskMapCounts(kind.value, props.regions, loaded.value.geo) : undefined);
const showLegend = computed(() => counts.value?.safe && counts.value.exact.some(item => BigInt(item.count) > 0n));
const flows = computed(() => loaded.value ? riskFlows(kind.value, props.regions, props.serverTarget, loaded.value.geo) : undefined);

const messages = computed(() => [
  state.value === "loading" ? "正在加载地图边界" : state.value === "unavailable" ? "地图暂不可用，统计仍可查看" : "",
  flows.value?.notice ?? "",
  counts.value && !counts.value.safe ? "地图计数超出安全精度，显示中性边界" : "",
].filter(Boolean));

watch(messages, (value, previous) => {
  if (!previous || value.length !== previous.length || value.some((message, index) => message !== previous[index])) {
    emit("statusChange", value);
  }
}, { immediate: true });

const option = computed(() => {
  if (!loaded.value || !counts.value) return {};
  return buildRiskMapOption({
    kind: kind.value,
    asset: loaded.value,
    counts: counts.value,
    flows: flows.value!,
    view: views[kind.value],
    mode: mode.value,
    backdrop: !!props.backdrop,
    reducedMotion: motionReduced.value,
    serverTarget: props.serverTarget,
  });
});

const accessibleLabel = computed(() => `${kind.value === "china" ? "中国省级" : "世界国家"}请求数地图；${mode.value === "3d" ? "固定视角立体示意" : "二维俯视"}，精确数据见文字列表，无定位来源单列。`);

useEventListener(document, "keydown", onEscape);
useEventListener(document, "fullscreenchange", onFullscreenChange);

onMounted(() => { void selectMap("china"); });

onBeforeUnmount(() => {
  if (document.fullscreenElement === mapRoot.value) void document.exitFullscreen?.();
  disposed = true;
  revision++;
  loader.stop();
  loaded.value = undefined;
});
</script>

<template>
  <div
    ref="mapRoot"
    class="risk-region-map"
    :class="{ 'risk-map-expanded': expanded, 'risk-map-backdrop': backdrop, 'is-2d': mode === '2d', 'is-3d': mode === '3d' }"
    role="group"
    :aria-label="`${kind === 'china' ? '中国' : '世界'}地域请求地图。固定视角示意；加号减号缩放，0 复位，方向键平移，点选行政区查看细分。`"
    tabindex="0"
    @keydown="keydown"
  >
    <div class="risk-controls map-scope" role="group" aria-label="地图范围与视角">
      <button type="button" :aria-pressed="kind === 'china'" title="中国省级地图" @click="selectMap('china')">中国</button>
      <button type="button" :aria-pressed="kind === 'world'" title="世界国家地图" @click="selectMap('world')">世界</button>
      <button type="button" :aria-pressed="mode === '2d'" title="二维俯视" @click="selectMode('2d')">2D</button>
      <button type="button" :aria-pressed="mode === '3d'" title="固定视角立体示意" @click="selectMode('3d')">3D</button>
    </div>
    <div class="risk-controls map-navigation" role="group" aria-label="地图视图操作">
      <button v-if="!backdrop" type="button" :aria-label="expanded ? '退出地图全屏' : '地图全屏'" :title="expanded ? '退出地图全屏' : '地图全屏'" @click="toggleFullscreen"><FullScreen aria-hidden="true" /></button>
      <button type="button" aria-label="放大" title="放大（键盘 +）" :disabled="state !== 'ready'" @click="zoom(1.25)"><Plus aria-hidden="true" /></button>
      <button type="button" aria-label="缩小" title="缩小（键盘 −）" :disabled="state !== 'ready'" @click="zoom(0.8)"><Minus aria-hidden="true" /></button>
      <button type="button" aria-label="复位视图" title="复位视图（键盘 0）" :disabled="state !== 'ready'" @click="resetView"><Refresh aria-hidden="true" /></button>
    </div>

    <p v-if="state === 'loading' && !backdrop" role="status">正在加载地图边界…</p>
    <div v-if="state === 'unavailable' && !backdrop" class="risk-map-unavailable" role="status"><strong>地图暂不可用</strong><p>本地资源与固定版本补偿均未成功；地域排行与其他统计仍可查看。</p></div>
    <template v-if="state === 'ready' && loaded">
      <div class="risk-map-stage" :class="mode === '3d' ? 'stage-3d' : 'stage-2d'">
        <span class="risk-map-floor" aria-hidden="true" />
        <div class="risk-map-tilt">
          <RiskMapCanvas
            :key="kind"
            :option="option"
            :accessible-label="accessibleLabel"
            :kind="kind"
            :height="expanded ? '70vh' : backdrop ? '100%' : '520px'"
            @region-select="selectRegion"
          />
        </div>
        <span class="risk-map-axis" aria-hidden="true" />
      </div>
      <div v-if="backdrop" class="access-map-caption">
        <span class="risk-map-view-label">{{ mode === '3d' ? '立体固定视角' : '二维俯视' }}</span>
        <template v-if="showLegend"><span>地域请求量</span><span>低</span><i aria-hidden="true" /><span>高</span></template>
        <RiskInfo label="地图说明">立体为固定视角示意，非真实三维旋转。右上角按钮或键盘 + / − / 0 缩放复位，方向键平移；中国 / 世界切换保留各自缩放。金色终点为服务器，飞线由来源地域代表点指向服务器，表示筛选期汇总，不是真实网络路径。</RiskInfo>
      </div>
      <template v-if="!backdrop">
        <p v-if="flows?.notice" role="status">{{ flows.notice }}</p>
        <p v-if="flows?.target">来源 → 服务器：{{ serverTarget?.alias ?? '服务器' }} · 金色终点标记 · 筛选期请求汇聚。</p>
        <p class="risk-map-interaction">固定视角示意 · 键盘 + / − 缩放，0 复位，方向键平移；点选行政区查看细分。</p>
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
      <details class="risk-notes"><summary>地图来源与统计说明</summary><p>来源地域代表点 → 服务器；为筛选期汇总，不是真实网络路径或精确访客位置。线宽为归一化权重，金色标记表示服务器终点。二维与立体视角使用同一套真实经纬度，立体感仅由多层 Geo、Canvas 与 CSS 固定视角实现。</p><p>geoBoundaries CHN ADM1（代表2019，34单元）与 Natural Earth 1:110m，均为公有领域数据，固定版本随应用发布。边界仅用于访问统计展示；HK/MO/TW按统计编码显式映射，微小地域无本图边界时单列。来源与SHA见本端地图资产文档。</p><p>本地资源不可用时，每种地图每次页面访问最多尝试一次固定版本外部资源，不传业务鉴权、日志或内部地址；对方可见浏览器网络出口IP。</p><p>默认尊重系统“减弱动态”设置：开启后飞线保持静态，地图缩放与复位仍可用。</p></details>
    </template>
  </div>
</template>

<style scoped>
.risk-region-map { position: relative; min-width: 0; }
.risk-map-expanded { position: fixed; inset: 0; z-index: 3000; padding: 20px; overflow: auto; background: var(--risk-background, #061628); color: var(--risk-text, #edf6ff); }
.risk-region-map:fullscreen { overflow: auto; padding: 20px; background: #061628; }
.risk-region-map:focus-visible { outline: 2px solid #8af6ff; outline-offset: -3px; }
.risk-map-stage { position: relative; width: 100%; height: 520px; overflow: hidden; }
.risk-map-expanded .risk-map-stage { height: 70vh; }
.risk-map-backdrop .risk-map-stage { position: absolute; inset: 0; height: auto; }
.risk-map-tilt { position: absolute; inset: 0; transition: transform 260ms ease; }
.risk-map-floor { position: absolute; inset: 8% 4% 6%; pointer-events: none; background: radial-gradient(ellipse at 50% 62%, #0a8dbd3d, transparent 68%); }
.risk-map-axis { position: absolute; left: 18%; right: 18%; bottom: 9%; height: 1px; pointer-events: none; background: linear-gradient(90deg, transparent, #2ed6ef88, transparent); box-shadow: 0 0 18px #2ed6ef55; }
.stage-3d { perspective: 2400px; }
.stage-3d .risk-map-tilt { transform: rotateX(19deg) scale(1.06); transform-origin: 50% 61%; }
.stage-3d .risk-map-floor { transform: perspective(700px) rotateX(64deg); transform-origin: 50% 100%; background: linear-gradient(#1f9fc61f 1px, transparent 1px), linear-gradient(90deg, #1f9fc61f 1px, transparent 1px); background-size: 42px 42px; mask-image: radial-gradient(ellipse, #000 12%, transparent 72%); }
.stage-2d .risk-map-floor { opacity: .55; }
.risk-map-canvas { position: relative; z-index: 1; }
.risk-map-axis { z-index: 2; }
@media (max-width: 600px) { .stage-3d .risk-map-tilt { transform: rotateX(15deg) scale(1.04); } }
@media (prefers-reduced-motion: reduce) { .risk-map-tilt { transition: none; } }
</style>
