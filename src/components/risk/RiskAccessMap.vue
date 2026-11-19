<script setup lang="ts">
import { Lock, Warning } from "@element-plus/icons-vue";
import { useEventListener, usePreferredReducedMotion } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import RiskInfo from "@/components/risk/RiskInfo.vue";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";
import { canRiskWebGL } from "@/utils/riskWebGL";
import type { GeoBreakdown } from "@/types/geoDrilldown";
import { riskCount, riskRegion } from "@/utils/risk";
import {
  RISK_ACCESS_EMPTY_STYLE,
  riskAccessCamera,
  riskAccessLevelColor,
  riskAccessDetailFeatures,
  riskAccessHeatPoints,
  riskAccessTargetFlows,
  riskAccessMapFeatures,
  riskAccessSelectedFeature,
} from "@/utils/riskAccessMap";
import { createRiskMapLoader, riskMapCounts, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
import {
  createRiskDetailLoader,
  riskDetailCounts,
  riskDetailFileKey,
  riskDetailLabelMap,
  type RiskDetailGeo,
  type RiskDetailLabels,
} from "@/utils/riskMapDetail";

const props = defineProps<{
  regions: { regionCode: string; requestCount: string }[];
  targets?: import("@/types/riskMonitor").RiskDashboardTarget[];
  backdrop?: boolean;
  selected?: { code: string; kind: "cities" | "subdivisions" } | null;
  detail?: GeoBreakdown;
  detailLoading?: boolean;
  detailFailed?: boolean;
  detailStale?: boolean;
}>();
const emit = defineEmits<{
  regionSelect: [code: string, view: RiskMapKind];
  viewChange: [view: RiskMapKind];
  statusChange: [messages: string[]];
  detailLabels: [value: RiskDetailLabels | undefined];
}>();

interface L7SceneLike {
  addLayer: (layer: unknown) => void;
  destroy: () => void;
  fitBounds?: (bounds: unknown, options?: unknown) => void;
  getMapCanvasContainer?: () => HTMLElement;
  getMapService?: () => { map?: { resize?: () => void } };
  loaded?: boolean;
  map?: { jumpTo?: (options: { center: [number, number]; zoom: number }) => void };
  off?: (name: string, handler: (...args: unknown[]) => void) => void;
  on: (name: string, handler: (...args: unknown[]) => void) => void;
  render?: () => void;
  setEnableRender?: (enabled: boolean) => void;
  setZoomAndCenter?: (zoom: number, center: [number, number]) => void;
  setCenter?: (center: [number, number]) => void;
  setZoom?: (zoom: number) => void;
}
interface L7LayerLike {
  animate?: (options: unknown) => unknown;
  color: (value: string, scale?: readonly string[] | ((value: number) => string)) => L7LayerLike;
  hide: () => L7LayerLike;
  on: (name: string, handler: (event: unknown) => void) => L7LayerLike;
  setData: (data: unknown, options?: unknown) => L7LayerLike;
  shape: (value: string) => L7LayerLike;
  show: () => L7LayerLike;
  size: (value: number | string) => L7LayerLike;
  source: (data: unknown, options?: unknown) => L7LayerLike;
  style: (value: Record<string, unknown>) => L7LayerLike;
}
interface L7Packages {
  HeatmapLayer: new (options?: Record<string, unknown>) => L7LayerLike;
  LineLayer: new (options?: Record<string, unknown>) => L7LayerLike;
  MapLibre: new (options: Record<string, unknown>) => unknown;
  PointLayer: new (options?: Record<string, unknown>) => L7LayerLike;
  PolygonLayer: new (options?: Record<string, unknown>) => L7LayerLike;
  Scene: new (options: Record<string, unknown>) => L7SceneLike;
}

const webglSupported = ref(canRiskWebGL());
const fallback = ref(!webglSupported.value);
const fallbackReason = ref(webglSupported.value ? "" : "当前浏览器不支持 WebGL，已使用二维地图与文字排行");
const state = ref<"loading" | "ready" | "fallback" | "unavailable">(fallback.value ? "fallback" : "loading");
const kind = ref<RiskMapKind>("china");
const loaded = shallowRef<RiskMapAsset>();
const detailGeo = shallowRef<RiskDetailGeo>();
const detailState = ref<"idle" | "loading" | "ready" | "missing" | "failed">("idle");
const mapHost = ref<HTMLElement>();
const reducedMotion = usePreferredReducedMotion();
const motionReduced = computed(() => reducedMotion.value === "reduce");

let loader = createRiskMapLoader({ externalFallback: false });
let detailLoader = createRiskDetailLoader();
let scene: L7SceneLike | undefined;
let packages: L7Packages | undefined;
let regionLayer: L7LayerLike | undefined;
let heatLayer: L7LayerLike | undefined;
let flowLayer: L7LayerLike | undefined;
let targetLayer: L7LayerLike | undefined;
let selectedLayer: L7LayerLike | undefined;
let detailLayer: L7LayerLike | undefined;
let boundaryLayer: L7LayerLike | undefined;
let resizeObserver: ResizeObserver | undefined;
let contextCanvas: HTMLCanvasElement | undefined;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let initializing: Promise<void> | undefined;
let revision = 0;
let detailRevision = 0;
let disposed = false;

const selectedParent = computed(() => {
  const selected = props.selected;
  if (!selected) return undefined;
  if (selected.kind === "cities" && kind.value !== "china") return undefined;
  if (selected.kind === "subdivisions" && kind.value !== "world") return undefined;
  return selected;
});
const counts = computed(() => loaded.value ? riskMapCounts(kind.value, props.regions, loaded.value.geo) : undefined);
const mapFeatures = computed(() => loaded.value ? riskAccessMapFeatures(kind.value, loaded.value.geo, props.regions) : undefined);
const heatPoints = computed(() => loaded.value ? riskAccessHeatPoints(kind.value, loaded.value.geo, props.regions) : []);
const flows = computed(() => {
  if (!loaded.value) return undefined;
  return riskAccessTargetFlows(kind.value, loaded.value.geo, props.targets ?? []);
});
const selectedFeature = computed(() => loaded.value ? riskAccessSelectedFeature(loaded.value.geo, selectedParent.value?.code) : undefined);
const detailCounts = computed(() => {
  if (!detailGeo.value || !props.detail || props.detailStale) return undefined;
  return riskDetailCounts(selectedParent.value?.kind ?? "cities", props.detail.items, detailGeo.value);
});
const detailFeatureData = computed(() => detailGeo.value && detailCounts.value
  ? riskAccessDetailFeatures(detailGeo.value, detailCounts.value)
  : undefined);
const showLegend = computed(() => !!counts.value?.safe && (counts.value.exact.some((row) => BigInt(row.count) > 0n) || !!detailFeatureData.value?.features.length));

function setFallback(reason: string) {
  if (disposed) return;
  fallbackReason.value = reason;
  fallback.value = true;
  state.value = "fallback";
  destroyScene();
}

function sceneReady(target: L7SceneLike): Promise<void> {
  if (target.loaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (readyTimer) clearTimeout(readyTimer);
      readyTimer = undefined;
      target.off?.("loaded", loadedHandler);
      target.off?.("error", errorHandler);
      if (error) reject(error);
      else resolve();
    };
    const loadedHandler = () => finish();
    const errorHandler = (event: unknown) => finish(event instanceof Error ? event : new Error("MAP_SCENE_FAILED"));
    readyTimer = setTimeout(() => finish(new Error("MAP_SCENE_TIMEOUT")), 12_000);
    target.on("loaded", loadedHandler);
    target.on("error", errorHandler);
  });
}

function targetPoint() {
  return flows.value?.points.map(point => ({ lng: point[0], lat: point[1] })) ?? [];
}

function flowData() {
  return flows.value?.lines ?? [];
}

function attachContextListener() {
  contextCanvas = scene?.getMapCanvasContainer?.()?.querySelector("canvas") ?? mapHost.value?.querySelector("canvas") ?? undefined;
  contextCanvas?.addEventListener("webglcontextlost", onContextLost, false);
  contextCanvas?.addEventListener("webglcontextcreationerror", onContextLost, false);
}
function detachContextListener() {
  contextCanvas?.removeEventListener("webglcontextlost", onContextLost, false);
  contextCanvas?.removeEventListener("webglcontextcreationerror", onContextLost, false);
  contextCanvas = undefined;
}
function onContextLost(event: Event) {
  event.preventDefault?.();
  setFallback("WebGL 上下文丢失，已切回二维地图与文字排行");
}

function configureFlowAnimation() {
  if (!flowLayer) return;
  if (motionReduced.value || !flowData().length) {
    flowLayer.animate?.(false);
    return;
  }
  flowLayer.animate?.({ interval: 0.25, trailLength: 0.55, duration: 4 });
}

function buildLayers() {
  if (!packages || !scene || !mapFeatures.value) return;
  regionLayer = new packages.PolygonLayer({ autoFit: false, blend: "normal" })
    .source(mapFeatures.value, { parser: { type: "geojson" } })
    .shape("fill")
    .color("riskLevel", riskAccessLevelColor)
    .style({ opacity: 0.94 });
  regionLayer.on("click", onRegionClick);

  heatLayer = new packages.HeatmapLayer({ autoFit: false, blend: "normal" })
    .source(heatPoints.value, { parser: { type: "json", x: "lng", y: "lat" } })
    .shape("heatmap")
    .size("value")
    .style({
      intensity: 1.4,
      radius: 22,
      opacity: 0.72,
      rampColors: {
        colors: ["#0d4a67", "#1599a8", "#31d6dc", "#ffd166", "#ff8e4f"],
        positions: [0, 0.35, 0.62, 0.84, 1],
      },
    });

  flowLayer = new packages.LineLayer({ autoFit: false, blend: "additive" })
    .source(flowData(), { parser: { type: "json", x: "lng1", y: "lat1", x1: "lng2", y1: "lat2" } })
    .shape("arc")
    .size("width")
    .color("color")
    .style({ opacity: 0.86, thetaOffset: 0.35 });

  targetLayer = new packages.PointLayer({ autoFit: false })
    .source(targetPoint(), { parser: { type: "json", x: "lng", y: "lat" } })
    .shape("circle")
    .size(9)
    .color("#ffd166")
    .style({ opacity: 0.96, stroke: "#fff3c4", strokeWidth: 1.6 });

  selectedLayer = new packages.PolygonLayer({ autoFit: false, blend: "normal" })
    .source(selectedFeature.value, { parser: { type: "geojson" } })
    .shape("fill")
    .color("#26d9ff")
    .style({ opacity: 0.18 });

  detailLayer = new packages.PolygonLayer({ autoFit: false, blend: "normal" })
    .source(detailFeatureData.value ?? { type: "FeatureCollection", features: [] }, { parser: { type: "geojson" } })
    .shape("fill")
    .color("riskLevel", riskAccessLevelColor)
    .style({ opacity: 0.72 });

  boundaryLayer = new packages.LineLayer({ autoFit: false, blend: "normal" })
    .source(mapFeatures.value, { parser: { type: "geojson" } })
    .shape("line")
    .size(1.35)
    .color("#6ae8f4")
    .style({ opacity: 0.78, strokeWidth: 0.4, stroke: "#b5ffff" });

  for (const layer of [regionLayer, heatLayer, flowLayer, targetLayer, selectedLayer, detailLayer, boundaryLayer]) scene.addLayer(layer);
  configureFlowAnimation();
  syncLayerVisibility();
}

function syncLayerVisibility() {
  if (!heatPoints.value.length) heatLayer?.hide();
  else heatLayer?.show();
  if (!flowData().length) flowLayer?.hide();
  else flowLayer?.show();
  if (!flows.value?.points.length) targetLayer?.hide();
  else targetLayer?.show();
  if (!selectedFeature.value?.features.length) selectedLayer?.hide();
  else selectedLayer?.show();
  if (!detailFeatureData.value?.features.length) detailLayer?.hide();
  else detailLayer?.show();
  if (!mapFeatures.value?.features.length) boundaryLayer?.hide();
  else boundaryLayer?.show();
}

function syncDataLayers() {
  if (!scene || !loaded.value || !mapFeatures.value) return;
  if (!regionLayer) {
    buildLayers();
    return;
  }
  regionLayer.setData(mapFeatures.value);
  heatLayer?.setData(heatPoints.value);
  flowLayer?.setData(flowData());
  targetLayer?.setData(targetPoint());
  selectedLayer?.setData(selectedFeature.value);
  detailLayer?.setData(detailFeatureData.value ?? { type: "FeatureCollection", features: [] });
  boundaryLayer?.setData(mapFeatures.value);
  configureFlowAnimation();
  syncLayerVisibility();
}

async function initScene() {
  if (initializing) {
    await initializing;
    if (!disposed && !fallback.value) {
      applyCamera();
      syncDataLayers();
    }
    return;
  }
  initializing = createScene();
  try { await initializing; } finally { initializing = undefined; }
}

async function createScene() {
  if (fallback.value || disposed || !loaded.value) return;
  if (scene && packages) {
    applyCamera();
    syncDataLayers();
    state.value = "ready";
    return;
  }
  try {
    const module = await import("@antv/l7") as unknown as L7Packages;
    if (disposed || fallback.value) return;
    await nextTick();
    if (!mapHost.value) throw new Error("MAP_HOST_MISSING");
    const camera = riskAccessCamera(loaded.value.geo, cameraViewport());
    packages = module;
    scene = new module.Scene({
      id: mapHost.value,
      logoVisible: false,
      map: new module.MapLibre({
        style: RISK_ACCESS_EMPTY_STYLE,
        center: camera.center,
        zoom: camera.zoom,
        minZoom: 0,
        maxZoom: 8,
        bearing: 0,
        pitch: 0,
        interactive: false,
        attributionControl: false,
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        keyboard: false,
        boxZoom: false,
      }),
    });
    await sceneReady(scene);
    if (disposed || fallback.value) return;
    attachContextListener();
    if (typeof ResizeObserver !== "undefined" && mapHost.value) {
      resizeObserver = new ResizeObserver(() => {
        scene?.getMapService?.().map?.resize?.();
        applyCamera();
        scene?.render?.();
      });
      resizeObserver.observe(mapHost.value);
    }
    buildLayers();
    applyCamera();
    state.value = "ready";
  } catch (error) {
    const reason = error instanceof Error && error.message === "MAP_SCENE_TIMEOUT"
      ? "底图初始化超时，已切回二维地图与文字排行"
      : "底图初始化失败，已切回二维地图与文字排行";
    setFallback(reason);
  }
}

function cameraViewport() {
  const width = mapHost.value?.clientWidth ?? 0;
  const height = mapHost.value?.clientHeight ?? 0;
  return props.backdrop && width >= 1280 && height >= 720
    ? { width: width * 0.72, height: height * 0.52 }
    : { width, height };
}

function applyCamera() {
  if (!scene || !loaded.value) return;
  const camera = riskAccessCamera(loaded.value.geo, cameraViewport());
  if (scene.map?.jumpTo) scene.map.jumpTo({ center: camera.center, zoom: camera.zoom });
  else if (scene.setZoomAndCenter) scene.setZoomAndCenter(camera.zoom, camera.center);
  else {
    scene.setCenter?.(camera.center);
    scene.setZoom?.(camera.zoom);
  }
}

function onRegionClick(event: unknown) {
  const code = (event as { feature?: { properties?: { code?: unknown } } }).feature?.properties?.code;
  if (typeof code === "string" && code) emit("regionSelect", code, kind.value);
}

async function loadMap(next: RiskMapKind) {
  if (fallback.value) return;
  const current = ++revision;
  loaded.value = undefined;
  state.value = "loading";
  try {
    const asset = await loader.load(next);
    if (disposed || current !== revision || fallback.value) return;
    loaded.value = asset;
    await initScene();
  } catch {
    if (!disposed && current === revision) state.value = "unavailable";
  }
}

async function loadDetail(selected: { code: string; kind: "cities" | "subdivisions" } | undefined) {
  const current = ++detailRevision;
  detailGeo.value = undefined;
  detailState.value = "idle";
  if (!selected || fallback.value) {
    emit("detailLabels", undefined);
    syncDataLayers();
    return;
  }
  if (!riskDetailFileKey(kind.value, selected.code)) {
    detailState.value = "missing";
    emit("detailLabels", undefined);
    syncDataLayers();
    return;
  }
  detailState.value = "loading";
  try {
    const asset = await detailLoader.load(kind.value, selected.code);
    if (disposed || current !== detailRevision || fallback.value) return;
    detailGeo.value = asset.geo;
    detailState.value = "ready";
    emit("detailLabels", { kind: selected.kind, regionCode: selected.code, labels: riskDetailLabelMap(asset.geo) });
    syncDataLayers();
  } catch {
    if (disposed || current !== detailRevision) return;
    detailState.value = "failed";
    emit("detailLabels", undefined);
    syncDataLayers();
  }
}

function selectMap(next: RiskMapKind) {
  if (next === kind.value) return;
  emit("viewChange", next);
  kind.value = next;
  detailRevision++;
  detailGeo.value = undefined;
  detailState.value = "idle";
  detailLoader.stop();
  detailLoader = createRiskDetailLoader();
  emit("detailLabels", undefined);
  if (fallback.value) return;
  void loadMap(next);
}

function onFallbackViewChange(next: RiskMapKind) {
  kind.value = next;
  emit("viewChange", next);
}

function destroyScene() {
  detachContextListener();
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  if (readyTimer) clearTimeout(readyTimer);
  readyTimer = undefined;
  regionLayer = undefined;
  heatLayer = undefined;
  flowLayer = undefined;
  targetLayer = undefined;
  selectedLayer = undefined;
  detailLayer = undefined;
  boundaryLayer = undefined;
  try { scene?.destroy(); } catch { /* A failed initializer may already own no resources. */ }
  scene = undefined;
  packages = undefined;
}

function onVisibilityChange() {
  if (!scene || document.visibilityState === "hidden") scene?.setEnableRender?.(false);
  else scene?.setEnableRender?.(true);
}

watch([mapFeatures, heatPoints, flows, selectedFeature, detailFeatureData], syncDataLayers, { deep: false });
watch(motionReduced, configureFlowAnimation);
watch(selectedParent, (value) => { void loadDetail(value ?? undefined); }, { immediate: true });
useEventListener(document, "visibilitychange", onVisibilityChange);
onMounted(() => { void loadMap("china"); });
onBeforeUnmount(() => {
  disposed = true;
  revision++;
  detailRevision++;
  loader.stop();
  detailLoader.stop();
  destroyScene();
  loaded.value = undefined;
  detailGeo.value = undefined;
});

const statusMessages = computed(() => [
  state.value === "loading" ? "正在加载本地地图边界" : "",
  state.value === "unavailable" ? "本地地图资源不可用，统计文字仍可查看" : "",
  detailState.value === "loading" ? "正在加载细分边界" : "",
  detailState.value === "missing" ? "该地域暂无细分边界，保留上级地图与文字排行" : "",
  detailState.value === "failed" ? "细分边界读取失败，保留上级地图与文字排行" : "",
  counts.value && !counts.value.safe ? "计数超出安全绘图精度，地图使用中性边界，精确值见文字明细" : "",
  flows.value?.notice ?? "",
  fallbackReason.value,
].filter(Boolean));
watch(statusMessages, (value, previous) => {
  if (!previous || value.length !== previous.length || value.some((message, index) => message !== previous[index])) emit("statusChange", value);
}, { immediate: true });

const detailStatus = computed(() => {
  if (!selectedParent.value) return "";
  if (detailState.value === "loading") return "正在加载细分边界…";
  if (detailState.value === "missing") return "该地域暂无细分边界资源，保留上级地图与文字排行。";
  if (detailState.value === "failed") return "细分边界加载失败，保留上级地图与文字排行。";
  const unplaced = detailCounts.value?.unplaced.length ?? 0;
  return unplaced ? `${unplaced} 条细分记录无对应边界，见文字排行。` : "";
});
const accessibleLabel = computed(() => `${kind.value === "china" ? "中国省级" : "世界国家"}访问请求地图，固定视角且不可拖动、缩放或旋转。区域颜色表示请求量；代表点为已核实地域代表点，不是实际 IP 位置；飞线仅连接有效服务器坐标。精确数据见文字明细。`);
</script>

<template>
  <div class="risk-access-map" :class="{ 'risk-access-backdrop': backdrop, 'risk-access-fallback': fallback }" role="group" :aria-label="accessibleLabel">
    <p v-if="fallback" class="risk-access-fallback-note" role="status">{{ fallbackReason }}</p>
    <RiskRegionMap
      v-if="fallback"
      class="risk-access-fallback-map"
      :regions="regions"
      :backdrop="backdrop"
      :initial-kind="kind"
      :selected="selected ?? undefined"
      :detail="detail"
      :detail-loading="detailLoading"
      :detail-failed="detailFailed"
      :detail-stale="detailStale"
      fixed-view
      local-only
      @region-select="(code, view) => emit('regionSelect', code, view)"
      @view-change="onFallbackViewChange"
      @status-change="(messages) => emit('statusChange', messages)"
      @detail-labels="(value) => emit('detailLabels', value)"
    />

    <template v-else>
      <div ref="mapHost" class="risk-access-host" aria-hidden="true" />
      <div class="risk-access-scope risk-controls" role="group" aria-label="地图范围">
        <button type="button" :aria-pressed="kind === 'china'" title="中国省级地图" @click="selectMap('china')">中国</button>
        <button type="button" :aria-pressed="kind === 'world'" title="世界国家地图" @click="selectMap('world')">世界</button>
      </div>
      <p class="risk-access-fixed"><Lock aria-hidden="true" />固定视角</p>
      <p v-if="state === 'loading'" class="risk-access-loading" role="status">正在加载本地地图边界…</p>
      <div v-if="state === 'unavailable'" class="risk-access-unavailable" role="status">
        <strong>地图暂不可用</strong>
        <span>本地授权边界读取失败，排行与统计文字仍可查看。</span>
      </div>
      <div class="risk-access-legend" aria-hidden="true">
        <span v-if="showLegend">请求热度</span>
        <template v-if="showLegend"><span>低</span><i /><span>高</span></template>
        <span v-if="heatPoints.length" class="risk-access-legend-heat">代表点热力</span>
        <span v-if="flows?.lines.length" class="risk-access-legend-flow">来源汇聚飞线</span>
      </div>
      <div class="risk-access-help">
        <RiskInfo label="地图说明">
          <p>本地空样式 MapLibre 底图，不加载外部瓦片、字体或精灵。区域着色、代表点热力和飞线由 L7 渲染。</p>
          <p>中国和世界为固定视角，不可拖动、缩放或旋转。点选有已核实编码的行政区可下钻。</p>
          <p>代表点来自已核实地域代表坐标，不是实际 IP 位置；飞线只连接有效服务器坐标，是筛选期请求汇聚，不是真实网络路径。</p>
          <p>{{ fallbackReason || "WebGL 不可用、上下文丢失或底图初始化失败时，自动切换到二维地图和文字排行。" }}</p>
        </RiskInfo>
      </div>
      <details v-if="counts" class="risk-access-text">
        <summary>文字明细 · 精确计数与未定位来源</summary>
        <div class="risk-access-text-body">
          <p v-if="!counts.exact.length" class="risk-access-empty">当前范围没有可定位到本图的请求。</p>
          <ul v-else>
            <li v-for="row in counts.exact" :key="row.name"><span>{{ riskRegion(row.name) }}</span><strong>{{ riskCount(row.count) }}</strong></li>
          </ul>
          <p v-if="!counts.safe" class="risk-access-warning"><Warning aria-hidden="true" />计数超出安全绘图精度，仅显示精确文本。</p>
          <p v-if="counts.unplaced.length" class="risk-access-warning">以下来源没有本图边界，未绘制：</p>
          <ul v-if="counts.unplaced.length">
            <li v-for="(row, index) in counts.unplaced" :key="`${row.regionCode}:${index}`"><span>{{ riskRegion(row.regionCode) }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li>
          </ul>
          <p class="risk-access-note">代表点为地域代表坐标，不代表实际 IP 位置。飞线为筛选期来源汇聚，不是真实网络路径。</p>
          <p v-if="detailStatus" class="risk-access-warning">{{ detailStatus }}</p>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.risk-access-map { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; background: #031426; }
.risk-access-map:focus-within { outline: 2px solid #8af6ff; outline-offset: -3px; }
.risk-access-host { position: absolute; inset: 0; }
.risk-access-host :deep(canvas) { cursor: default !important; }
.risk-access-host :deep(.maplibregl-ctrl) { display: none !important; }
.risk-access-fallback-map { position: absolute; inset: 0; }
.risk-access-fallback-note { position: absolute; z-index: 6; left: 50%; bottom: 10px; transform: translateX(-50%); max-width: calc(100% - 32px); margin: 0; padding: 4px 10px; border: 1px solid #7a5a24; border-radius: 3px; background: #2b210ddd; color: #ffd37d; font-size: 11px; text-align: center; }
.risk-access-scope { position: absolute; z-index: 4; top: 10px; right: 12px; display: flex; margin: 0; gap: 0; }
.risk-access-scope button { min-height: 28px; padding: 2px 12px; border-radius: 0; margin-left: -1px; }
.risk-access-scope button:first-child { border-radius: 4px 0 0 4px; }
.risk-access-scope button:last-child { border-radius: 0 4px 4px 0; }
.risk-access-fixed { position: absolute; z-index: 4; top: 12px; left: 12px; display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 3px 9px; border: 1px solid #1b6f8f; border-radius: 12px; background: #02182ecc; color: #8feaf4; font-size: 11px; letter-spacing: .6px; }
.risk-access-fixed svg { width: 12px; height: 12px; }
.risk-access-loading { position: absolute; z-index: 4; left: 50%; top: 50%; margin: 0; transform: translate(-50%, -50%); color: #a8c9de; font-size: 13px; }
.risk-access-unavailable { position: absolute; z-index: 4; inset: 24% 16%; display: grid; place-content: center; gap: 6px; padding: 20px; border: 1px dashed #1e6c8b; background: #03192cbb; text-align: center; color: #a8c9de; font-size: 12px; }
.risk-access-unavailable strong { color: #e8f7ff; font-size: 14px; }
.risk-access-legend { position: absolute; z-index: 4; left: 12px; bottom: 12px; right: 12px; display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 6px 10px; border: 1px solid #1c789a80; border-radius: 4px; background: linear-gradient(90deg, #02182ecc, #042f4ccc 42%, #02182ed9); color: #a8c9de; font-size: 11px; backdrop-filter: blur(2px); }
.risk-access-legend i { display: block; width: 82px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, #0b2f49, #1596a8, #56e4e0, #ffd166); }
.risk-access-legend-heat::before, .risk-access-legend-flow::before { content: ""; display: inline-block; width: 14px; height: 3px; margin-right: 5px; vertical-align: middle; border-radius: 2px; background: #ffd166; box-shadow: 0 0 7px #ffd16699; }
.risk-access-legend-flow::before { background: #39d9ed; box-shadow: 0 0 7px #39d9ed99; }
.risk-access-help { position: absolute; z-index: 5; right: 12px; bottom: 48px; }
.risk-access-help :deep(.access-info-button) { background: #02182ecc; border: 1px solid #1b6f8f; border-radius: 3px; }
.risk-access-help :deep(.access-info-content) { top: auto; right: 0; bottom: 100%; left: auto; }
.risk-access-text { position: absolute; z-index: 4; left: 12px; bottom: 48px; max-width: min(420px, calc(100% - 80px)); border: 1px solid #1c789a80; border-radius: 4px; background: #02182ef2; color: #dff8ff; font-size: 11px; }
.risk-access-text summary { min-height: 28px; padding: 5px 10px; color: #8feaf4; cursor: pointer; }
.risk-access-text-body { max-height: min(260px, 38vh); overflow: auto; padding: 0 10px 8px; }
.risk-access-text ul { margin: 0; padding: 0; list-style: none; }
.risk-access-text li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #14608466; }
.risk-access-text strong { font-variant-numeric: tabular-nums; }
.risk-access-warning { display: flex; align-items: flex-start; gap: 5px; margin: 6px 0; color: #ffd37d; }
.risk-access-warning svg { width: 12px; height: 12px; margin-top: 2px; flex-shrink: 0; }
.risk-access-empty, .risk-access-note { margin: 6px 0; color: #a8c9de; }
.risk-access-map :deep(.l7-logo) { display: none !important; }
@media (min-width:1280px) and (min-height:720px) {
  .risk-access-backdrop .risk-access-scope { top: 264px; right: 24%; }
  .risk-access-backdrop .risk-access-fixed { top: 266px; left: 24%; }
  .risk-access-backdrop .risk-access-legend { left: 24%; right: 24%; bottom: max(310px, 23vh); }
  .risk-access-backdrop .risk-access-help { right: 24%; bottom: max(346px, calc(23vh + 36px)); }
  .risk-access-backdrop .risk-access-text { left: 24%; bottom: max(346px, calc(23vh + 36px)); }
}
@media (min-width:1280px) and (max-width:1599px) and (min-height:720px) {
  .risk-access-backdrop .risk-access-scope { top: 230px; }
  .risk-access-backdrop .risk-access-fixed { top: 232px; }
}
@media (max-width: 760px) {
  .risk-access-legend { justify-content: flex-start; flex-wrap: wrap; }
  .risk-access-text { bottom: 84px; max-width: calc(100% - 24px); }
  .risk-access-help { bottom: 52px; }
}
</style>
