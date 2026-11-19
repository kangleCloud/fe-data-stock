<script setup lang="ts">
import { Plus, Minus, Refresh, FullScreen } from "@element-plus/icons-vue";
import { useEventListener, usePreferredReducedMotion } from "@vueuse/core";
import type { EChartsType } from "echarts/core";
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import RiskInfo from "@/components/risk/RiskInfo.vue";
import RiskMap3D from "@/components/risk/RiskMap3D.vue";
import RiskMapCanvas from "@/components/risk/RiskMapCanvas.vue";
import { echarts } from "@/charts/echarts";
import type { GeoBreakdown } from "@/types/geoDrilldown";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskCount, riskRegion } from "@/utils/risk";
import { defaultRiskCamera, type RiskCamera3D } from "@/utils/riskCamera3d";
import { riskFlows } from "@/utils/riskFlows";
import { createRiskMapLoader, riskMapCounts, type RiskMapAsset, type RiskMapKind } from "@/utils/riskMap";
import {
  createRiskDetailLoader,
  hasHan,
  mergeRiskDetailGeo,
  riskDetailCounts,
  riskDetailDisplayName,
  riskDetailFileKey,
  riskDetailLabelMap,
  type RiskDetailGeo,
  type RiskDetailLabels,
  type RiskViewportDetail,
} from "@/utils/riskMapDetail";
import { buildRiskMapOption, detailLabelMinimumZoom, type RiskMapCityLabel } from "@/utils/riskMapOption";
import {
  createRiskMapProjector,
  selectRiskViewportRegions,
  selectRiskVisibleLabels,
} from "@/utils/riskMapProjection";
import {
  defaultRiskMapView,
  riskMapFeatureBounds,
  riskMapFeatureCenter,
  riskMapViewKey,
  zoomRiskMapView,
  type RiskMapView,
} from "@/utils/riskMapView";
import { canRiskWebGL } from "@/utils/riskWebGL";

const props = defineProps<{
  regions: { regionCode: string; requestCount: string }[];
  serverTarget?: RiskServerTarget;
  backdrop?: boolean;
  selected?: { code: string; kind: "cities" | "subdivisions" };
  detail?: GeoBreakdown;
  detailLoading?: boolean;
  detailFailed?: boolean;
  detailStale?: boolean;
  /** 固定视角：不提供缩放、平移、旋转或二维/三维切换。 */
  fixedView?: boolean;
  /** 只允许加载随应用发布的本地边界，不尝试外部补偿。 */
  localOnly?: boolean;
  initialKind?: RiskMapKind;
}>();
const emit = defineEmits<{
  regionSelect: [code: string, view: RiskMapKind];
  viewChange: [view: RiskMapKind];
  statusChange: [messages: string[]];
  detailLabels: [value: RiskDetailLabels | undefined];
  detailSelect: [code: string | null, label: string];
}>();

const webglSupported = ref(canRiskWebGL());
const mode = ref<"2d" | "3d">(webglSupported.value && !props.fixedView ? "3d" : "2d");
const fallbackReason = ref(webglSupported.value || props.fixedView ? "" : "当前浏览器不支持 WebGL，已使用二维地图");
const effective3D = computed(() => mode.value === "3d" && webglSupported.value && !props.fixedView && !fallbackReason.value);
const views = reactive<Record<RiskMapKind, RiskMapView>>({
  china: defaultRiskMapView(),
  world: defaultRiskMapView(),
});
const cameras = reactive<Record<RiskMapKind, RiskCamera3D>>({
  china: defaultRiskCamera(),
  world: defaultRiskCamera(),
});
const reducedMotion = usePreferredReducedMotion();
const motionReduced = computed(() => reducedMotion.value === "reduce");
const kind = ref<RiskMapKind>(props.initialKind ?? "china");
const loaded = shallowRef<RiskMapAsset>();
const state = ref<"loading" | "ready" | "unavailable">("loading");
const loader = createRiskMapLoader({ externalFallback: !props.localOnly });
let detailLoader = createRiskDetailLoader();
let revision = 0;
let detailRevision = 0;
let disposed = false;
let map3d = ref<{ zoom: (factor: number) => void; resetView: () => void }>();
let map2dChart: EChartsType | undefined;
let viewport2dTimer: ReturnType<typeof setTimeout> | undefined;
let lastViewport2dParents = "";

const detailGeo = shallowRef<RiskDetailGeo>();
const detailState = ref<"idle" | "loading" | "ready" | "missing" | "failed">("idle");
const selectedDetailName = ref<string | null>(null);

const viewportDetails = shallowRef<RiskViewportDetail[]>([]);
const viewportCityLabels = shallowRef<RiskMapCityLabel[]>([]);
const viewport2dSize = shallowRef<{ width: number; height: number }>();
const viewportFailures = ref(0);
const viewportCache = new Map<string, RiskViewportDetail>();
const viewportFailed = new Set<string>();
const viewportQueued = new Set<string>();
const viewportLoading = new Set<string>();
let viewportQueue: string[] = [];
let viewportActive = 0;
let viewportEpoch = 0;
const MAX_VIEWPORT_LOADS = 2;

const mapRoot = ref<HTMLElement>();
const expanded = ref(false);

const selectedParent = computed(() => {
  const selected = props.selected;
  if (!selected) return undefined;
  if (selected.kind === "cities" && kind.value !== "china") return undefined;
  if (selected.kind === "subdivisions" && kind.value !== "world") return undefined;
  return selected;
});

const detailLayer = computed(() => {
  const selected = selectedParent.value;
  const geo = detailGeo.value;
  if (!selected || !geo) return undefined;
  const items = props.detail && !props.detailStale ? props.detail.items : [];
  return {
    kind: selected.kind,
    regionCode: selected.code,
    geo,
    counts: riskDetailCounts(selected.kind, items, geo),
    selectedName: selectedDetailName.value,
  };
});

const activeGeo = computed(() => {
  if (!loaded.value) return undefined;
  const detail = detailLayer.value;
  return detail ? mergeRiskDetailGeo(loaded.value.geo, detail.geo, detail.regionCode) : loaded.value.geo;
});
const activeMapName = computed(() => detailLayer.value
  ? `risk-v1-detail-${kind.value}-${detailLayer.value.regionCode}`
  : `risk-v1-${kind.value}`);

watch([activeGeo, activeMapName], ([geo, mapName]) => {
  if (geo) echarts.registerMap(mapName, geo as Parameters<typeof echarts.registerMap>[1]);
  schedule2DViewport(0);
}, { immediate: true, flush: "sync" });

function emitDetailLabels() {
  const selected = selectedParent.value;
  const geo = detailGeo.value;
  if (!selected || !geo) {
    emit("detailLabels", undefined);
    return;
  }
  emit("detailLabels", { kind: selected.kind, regionCode: selected.code, labels: riskDetailLabelMap(geo) });
}

async function loadDetail(selected: { code: string; kind: "cities" | "subdivisions" } | undefined) {
  const current = ++detailRevision;
  selectedDetailName.value = null;
  detailGeo.value = undefined;
  detailState.value = "idle";
  if (!selected) {
    emitDetailLabels();
    return;
  }
  if (!riskDetailFileKey(kind.value, selected.code)) {
    detailState.value = "missing";
    emitDetailLabels();
    return;
  }
  detailState.value = "loading";
  try {
    const asset = await detailLoader.load(kind.value, selected.code);
    if (disposed || current !== detailRevision) return;
    detailGeo.value = asset.geo;
    detailState.value = "ready";
    emitDetailLabels();
  } catch {
    if (disposed || current !== detailRevision) return;
    detailState.value = "failed";
    emitDetailLabels();
  }
}

watch(selectedParent, (value) => { void loadDetail(value); }, { immediate: true });

watch(
  [() => views[kind.value], kind, effective3D, viewportDetails],
  () => {
    if (effective3D.value) {
      viewportCityLabels.value = [];
      if (viewport2dTimer) clearTimeout(viewport2dTimer);
      viewport2dTimer = undefined;
      return;
    }
    schedule2DViewport();
  },
  { deep: false },
);

function viewportLoadingKey(epoch: number, parentCode: string): string {
  return `${epoch}:${parentCode}`;
}

function clearViewportDetails() {
  viewportEpoch++;
  viewportQueue = [];
  viewportQueued.clear();
  viewportLoading.clear();
  viewportFailed.clear();
  viewportCache.clear();
  viewportDetails.value = [];
  viewportCityLabels.value = [];
  viewportFailures.value = 0;
  lastViewport2dParents = "";
}

function resetDetailLoader() {
  detailLoader.stop();
  detailLoader = createRiskDetailLoader();
}

async function drainViewport() {
  const epoch = viewportEpoch;
  const requestedKind = kind.value;
  while (!disposed && epoch === viewportEpoch && viewportActive < MAX_VIEWPORT_LOADS && viewportQueue.length) {
    const parentCode = viewportQueue.shift()!;
    viewportQueued.delete(parentCode);
    const loadingKey = viewportLoadingKey(epoch, parentCode);
    if (viewportCache.has(parentCode) || viewportLoading.has(loadingKey) || viewportFailed.has(parentCode)) continue;
    if (!riskDetailFileKey(requestedKind, parentCode)) {
      viewportFailed.add(parentCode);
      continue;
    }
    viewportLoading.add(loadingKey);
    viewportActive++;
    void detailLoader.load(requestedKind, parentCode).then((asset) => {
      if (disposed || epoch !== viewportEpoch || kind.value !== requestedKind) return;
      const detail: RiskViewportDetail = { parentCode, features: asset.geo.features };
      viewportCache.set(parentCode, detail);
      viewportDetails.value = [...viewportDetails.value.filter((item) => item.parentCode !== parentCode), detail]
        .sort((left, right) => left.parentCode.localeCompare(right.parentCode));
    }).catch(() => {
      if (disposed || epoch !== viewportEpoch) return;
      if (!viewportFailed.has(parentCode)) {
        viewportFailed.add(parentCode);
        viewportFailures.value++;
      }
    }).finally(() => {
      viewportLoading.delete(loadingKey);
      viewportActive = Math.max(0, viewportActive - 1);
      // Old-epoch requests still free a concurrency slot; drain the current
      // queue so a scope switch cannot leave newly visible parents stuck.
      if (!disposed) void drainViewport();
    });
  }
}

/**
 * The 3D renderer reports only parent regions whose real projected center or
 * bounding-box probe is inside the current viewport. Queue at most two local
 * detail files, deduplicate by parent code and cache failures for this session.
 */
function onViewportParents(codes: string[]) {
  if (disposed) return;
  const selected = selectedParent.value?.code;
  const requested = new Set(codes.filter((code) => code !== selected && !!riskDetailFileKey(kind.value, code)));
  viewportQueue = viewportQueue.filter((code) => requested.has(code));
  for (const code of [...viewportQueued]) {
    if (!requested.has(code)) viewportQueued.delete(code);
  }
  for (const code of requested) {
    if (viewportCache.has(code) || viewportLoading.has(viewportLoadingKey(viewportEpoch, code)) || viewportFailed.has(code) || viewportQueued.has(code)) continue;
    viewportQueue.push(code);
    viewportQueued.add(code);
  }
  void drainViewport();
}

/** 二维全国视野：只有真实缩放达到阈值后才加载父级细分。 */
function baseParentCandidates() {
  const geo = loaded.value?.geo;
  if (!geo) return [];
  const selected = selectedParent.value?.code;
  return geo.features.flatMap((feature) => {
    const code = feature.properties.code;
    if (!code || code === selected || !riskDetailFileKey(kind.value, code)) return [];
    const bounds = riskMapFeatureBounds(feature);
    const center = riskMapFeatureCenter(feature);
    const midLng = center[0];
    const midLat = center[1];
    return [{
      code,
      center,
      probes: [
        [bounds.minLng, bounds.minLat],
        [bounds.minLng, bounds.maxLat],
        [bounds.maxLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
        [midLng, bounds.minLat],
        [midLng, bounds.maxLat],
        [bounds.minLng, midLat],
        [bounds.maxLng, midLat],
      ] as [number, number][],
    }];
  });
}

/** 只把已核实编码且含中文名的城市/一级行政区作为二维视野标签候选。 */
function viewportCityCandidates(): (RiskMapCityLabel & { feature: RiskViewportDetail["features"][number] })[] {
  const selected = selectedParent.value?.code;
  return viewportDetails.value.flatMap((detail) => {
    if (detail.parentCode === selected) return [];
    return detail.features.flatMap((feature) => {
      const properties = feature.properties;
      if (properties.code === null || !properties.nameZh || !hasHan(properties.label)) return [];
      return [{
        name: properties.name,
        label: properties.label,
        cp: properties.cp,
        area: properties.area,
        parentCode: detail.parentCode,
        feature,
      }];
    });
  });
}

const TWO_D_VIEWPORT_DELAY = 80;

function sync2DSize() {
  const chart = map2dChart;
  if (!chart) return;
  const width = chart.getWidth();
  const height = chart.getHeight();
  if (width > 0 && height > 0
    && (viewport2dSize.value?.width !== width || viewport2dSize.value?.height !== height)) {
    viewport2dSize.value = { width, height };
  }
}

function compute2DViewport() {
  if (disposed || effective3D.value || state.value !== "ready") return;
  sync2DSize();
  if (kind.value !== "china") {
    viewportCityLabels.value = [];
    onViewportParents([]);
    lastViewport2dParents = "";
    return;
  }
  const threshold = detailLabelMinimumZoom("china");
  if (views.china.zoom < threshold) {
    viewportCityLabels.value = [];
    bestEffortClearParents();
    return;
  }
  const projector = createRiskMapProjector(map2dChart, 0);
  if (!projector) return;

  const parents = selectRiskViewportRegions(baseParentCandidates(), projector.project, { limit: 6 });
  const parentKey = parents.join(",");
  if (parentKey !== lastViewport2dParents) {
    lastViewport2dParents = parentKey;
    onViewportParents(parents);
  }

  const picked = selectRiskVisibleLabels(viewportCityCandidates(), projector.project, {
    minPixelDistance: 48,
    limit: 40,
  });
  const next = picked.map((item) => ({
    name: item.name,
    label: item.label,
    cp: item.cp,
    area: item.area,
    parentCode: item.parentCode,
  }));
  const changed = viewportCityLabels.value.length !== next.length
    || viewportCityLabels.value.some((row, index) => {
      const candidate = next[index];
      return !candidate || candidate.name !== row.name || candidate.label !== row.label || candidate.parentCode !== row.parentCode;
    });
  if (changed) viewportCityLabels.value = next;
}

function bestEffortClearParents() {
  if (lastViewport2dParents === "") return;
  lastViewport2dParents = "";
  onViewportParents([]);
}

function schedule2DViewport(delay = TWO_D_VIEWPORT_DELAY) {
  if (viewport2dTimer) clearTimeout(viewport2dTimer);
  if (disposed || effective3D.value) return;
  viewport2dTimer = setTimeout(() => {
    viewport2dTimer = undefined;
    compute2DViewport();
  }, delay);
}

function on2DReady(chart: EChartsType) {
  map2dChart = chart;
  sync2DSize();
  lastViewport2dParents = "";
  schedule2DViewport(0);
}

/** VChart resizes asynchronously; give it time before re-projecting labels. */
function on2DViewportChange() {
  schedule2DViewport(160);
}

function selectMode(next: "2d" | "3d") {
  if (props.fixedView) {
    mode.value = "2d";
    return;
  }
  if (next === "2d") {
    mode.value = "2d";
    return;
  }
  if (canRiskWebGL()) {
    webglSupported.value = true;
    fallbackReason.value = "";
    mode.value = "3d";
    return;
  }
  webglSupported.value = false;
  fallbackReason.value = "当前浏览器不支持 WebGL，已使用二维地图";
  mode.value = "2d";
}

function retry3D() {
  selectMode("3d");
}

function on3DFailed(reason: string) {
  webglSupported.value = false;
  fallbackReason.value = reason;
  mode.value = "2d";
}

function updateCamera(value: RiskCamera3D) {
  cameras[kind.value] = value;
}

function zoom(factor: number) {
  if (props.fixedView) return;
  if (effective3D.value) {
    map3d.value?.zoom(factor);
    return;
  }
  views[kind.value] = zoomRiskMapView(views[kind.value], factor);
}

function resetView() {
  if (props.fixedView) return;
  if (effective3D.value) {
    map3d.value?.resetView();
    return;
  }
  views[kind.value] = defaultRiskMapView();
}

function keydown(event: KeyboardEvent) {
  if (props.fixedView || effective3D.value) return;
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

function selectFeature(name: string) {
  const detailFeature = detailLayer.value?.geo.features.find((feature) => feature.properties.name === name);
  if (detailFeature) {
    // Boundaries without a verified administrative code stay visible but are
    // not selectable, so a click can never attach stats to the wrong region.
    if (detailFeature.properties.code === null) return;
    selectedDetailName.value = detailFeature.properties.name;
    emit("detailSelect", detailFeature.properties.code, riskDetailDisplayName(detailFeature));
    return;
  }
  selectedDetailName.value = null;
  const feature = activeGeo.value?.features.find((item) => item.properties.name === name);
  if (feature?.properties.code) emit("regionSelect", feature.properties.code, kind.value);
}

async function selectMap(next: RiskMapKind) {
  if (next !== kind.value) {
    emit("viewChange", next);
    kind.value = next;
    selectedDetailName.value = null;
    detailGeo.value = undefined;
    detailState.value = "idle";
    resetDetailLoader();
    clearViewportDetails();
  }
  const current = ++revision;
  loaded.value = undefined;
  state.value = "loading";
  try {
    const asset = await loader.load(next);
    if (disposed || current !== revision) return;
    loaded.value = asset;
    state.value = "ready";
  } catch {
    if (!disposed && current === revision) state.value = "unavailable";
  }
}

const counts = computed(() => loaded.value ? riskMapCounts(kind.value, props.regions, loaded.value.geo) : undefined);
const showLegend = computed(() => counts.value?.safe && (counts.value.exact.some((item) => BigInt(item.count) > 0n) || !!detailLayer.value?.counts.exact.length));
const flows = computed(() => loaded.value ? riskFlows(kind.value, props.regions, props.serverTarget, loaded.value.geo) : undefined);

const detailStatus = computed(() => {
  if (!selectedParent.value) return "";
  if (detailState.value === "loading") return "正在加载细分边界…";
  if (detailState.value === "missing") return "该地域暂无细分边界资源，保留上级地图与文字排行。";
  if (detailState.value === "failed") return "细分边界加载失败，保留上级地图与文字排行。";
  const unplaced = detailLayer.value?.counts.unplaced.length ?? 0;
  if (unplaced) return `${unplaced} 条细分记录无对应边界，见文字排行。`;
  return "";
});

const messages = computed(() => [
  state.value === "loading" ? "正在加载地图边界" : state.value === "unavailable" ? "地图暂不可用，统计仍可查看" : "",
  detailStatus.value,
  viewportFailures.value ? "部分视野城市标签加载失败，已保留地图与文字排行。" : "",
  flows.value?.notice ?? "",
  counts.value && !counts.value.safe ? "地图计数超出安全精度，显示中性边界" : "",
  fallbackReason.value,
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
    mode: "2d",
    backdrop: !!props.backdrop,
    reducedMotion: motionReduced.value,
    serverTarget: props.serverTarget,
    geo: activeGeo.value,
    mapName: activeMapName.value,
    detail: detailLayer.value,
    cityLabels: viewportCityLabels.value,
    viewport: viewport2dSize.value,
  });
});

const selectedDetailLabel = computed(() => {
  const feature = detailLayer.value?.geo.features.find((item) => item.properties.name === selectedDetailName.value);
  return feature ? riskDetailDisplayName(feature) : "";
});

const accessibleLabel = computed(() => `${kind.value === "china" ? "中国省级" : "世界国家"}请求数地图；${props.fixedView ? "固定二维视角" : effective3D.value ? "可旋转三维" : "二维俯视"}，精确数据见文字列表，无定位来源单列。`);

useEventListener(document, "keydown", onEscape);
useEventListener(document, "fullscreenchange", onFullscreenChange);

onMounted(() => { void selectMap(kind.value); });

onBeforeUnmount(() => {
  if (document.fullscreenElement === mapRoot.value) void document.exitFullscreen?.();
  disposed = true;
  revision++;
  detailRevision++;
  viewportEpoch++;
  if (viewport2dTimer) clearTimeout(viewport2dTimer);
  viewport2dTimer = undefined;
  map2dChart = undefined;
  viewportQueue = [];
  viewportQueued.clear();
  viewportLoading.clear();
  loader.stop();
  detailLoader.stop();
  loaded.value = undefined;
  detailGeo.value = undefined;
  viewportDetails.value = [];
  viewportCityLabels.value = [];
  viewport2dSize.value = undefined;
});
</script>

<template>
  <div
    ref="mapRoot"
    class="risk-region-map"
    :class="{ 'risk-map-expanded': expanded, 'risk-map-backdrop': backdrop, 'is-2d': mode === '2d', 'is-3d': mode === '3d' }"
    role="group"
    :aria-label="fixedView ? `${kind === 'china' ? '中国' : '世界'}地域请求地图。固定二维视角，不可拖动、缩放或旋转；点选行政区查看细分。` : `${kind === 'china' ? '中国' : '世界'}地域请求地图。${effective3D ? '三维可旋转，左键旋转，右键平移，滚轮缩放' : '二维俯视'}；加号减号缩放，0 复位，方向键${effective3D ? '旋转' : '平移'}，点选行政区查看细分。`"
    tabindex="0"
    @keydown="keydown"
  >
    <div class="risk-controls map-scope" role="group" aria-label="地图范围与视角">
      <button type="button" :aria-pressed="kind === 'china'" title="中国省级地图" @click="selectMap('china')">中国</button>
      <button type="button" :aria-pressed="kind === 'world'" title="世界国家地图" @click="selectMap('world')">世界</button>
      <template v-if="!fixedView">
        <button type="button" :aria-pressed="mode === '2d'" title="二维俯视" @click="selectMode('2d')">2D</button>
        <button type="button" :aria-pressed="mode === '3d'" title="三维可旋转地图" @click="selectMode('3d')">3D</button>
      </template>
    </div>
    <div v-if="!fixedView" class="risk-controls map-navigation" role="group" aria-label="地图视图操作">
      <button v-if="!backdrop" type="button" :aria-label="expanded ? '退出地图全屏' : '地图全屏'" :title="expanded ? '退出地图全屏' : '地图全屏'" @click="toggleFullscreen"><FullScreen aria-hidden="true" /></button>
      <button type="button" aria-label="放大" title="放大（键盘 +）" :disabled="state !== 'ready'" @click="zoom(1.25)"><Plus aria-hidden="true" /></button>
      <button type="button" aria-label="缩小" title="缩小（键盘 −）" :disabled="state !== 'ready'" @click="zoom(0.8)"><Minus aria-hidden="true" /></button>
      <button type="button" aria-label="复位视图" title="复位视图（键盘 0）" :disabled="state !== 'ready'" @click="resetView"><Refresh aria-hidden="true" /></button>
    </div>

    <p v-if="state === 'loading' && !backdrop" role="status">正在加载地图边界…</p>
    <div v-if="state === 'unavailable' && !backdrop" class="risk-map-unavailable" role="status"><strong>地图暂不可用</strong><p>{{ localOnly ? '本地授权地图资源不可用' : '本地资源与固定版本补偿均未成功' }}；地域排行与其他统计仍可查看。</p></div>
    <template v-if="state === 'ready' && loaded">
      <div class="risk-map-stage" :class="effective3D ? 'stage-3d' : 'stage-2d'">
        <span class="risk-map-floor" aria-hidden="true" />
        <RiskMap3D
          v-if="effective3D"
          :key="activeMapName"
          ref="map3d"
          :kind="kind"
          :map-name="activeMapName"
          :geo="activeGeo!"
          :base-geo="loaded.geo"
          :viewport-details="viewportDetails"
          :counts="counts!"
          :flows="flows!"
          :camera="cameras[kind]"
          :detail="detailLayer"
          :reduced-motion="motionReduced"
          :server-target="serverTarget"
          :height="expanded ? '70vh' : backdrop ? '100%' : '520px'"
          @region-select="selectFeature"
          @camera-change="updateCamera"
          @failed="on3DFailed"
          @viewport-parents="onViewportParents"
        />
        <RiskMapCanvas
          v-else
          :key="activeMapName"
          :option="option"
          :accessible-label="accessibleLabel"
          :kind="kind"
          :height="expanded ? '70vh' : backdrop ? '100%' : '520px'"
          @region-select="selectFeature"
          @chart-ready="on2DReady"
          @viewport-change="on2DViewportChange"
        />
        <span class="risk-map-axis" aria-hidden="true" />
      </div>
      <p v-if="fallbackReason && !backdrop" class="risk-warning" role="status">{{ fallbackReason }} <button type="button" @click="retry3D">重试三维</button></p>
      <p v-if="selectedParent && detailState === 'loading' && !backdrop" role="status">正在加载细分边界…</p>
      <div v-if="selectedParent && (detailState === 'missing' || detailState === 'failed') && !backdrop" class="risk-map-unavailable" role="status"><strong>{{ detailState === 'missing' ? '暂无细分边界' : '细分边界加载失败' }}</strong><p>保留上级地图与文字排行；不会猜测或模拟细分统计。</p></div>
      <p v-if="selectedDetailLabel && !backdrop" class="risk-muted">已选细分：{{ selectedDetailLabel }} · 仅高亮，不改变筛选。</p>
      <div v-if="backdrop" class="access-map-caption">
        <span class="risk-map-view-label">{{ effective3D ? '三维可旋转' : '二维俯视' }}<template v-if="detailLayer"> · 细分边界</template></span>
        <template v-if="showLegend"><span>地域请求量</span><span>低</span><i aria-hidden="true" /><span>高</span></template>
        <RiskInfo label="地图说明">三维使用 WebGL：左键旋转，右键平移，滚轮缩放；键盘方向键旋转，+ / − 缩放，0 复位。二维用方向键平移。中国 / 世界分别保存视角与相机。选中省/国家后按需加载城市或境外一级行政区边界；二维中国视图放大约 1.8 倍、三维缩放后，均只按真实视口加载少量父级并显示已核实的城市中文标签。细分统计按已核实编码匹配，未匹配项只保留文字排行。点击细分只高亮并展示现有统计，不改变筛选。WebGL 不可用或上下文丢失时回退二维。飞线为筛选期来源地域代表点到服务器的汇总，不是真实网络路径。</RiskInfo>
      </div>
      <template v-if="!backdrop">
        <p v-if="flows?.notice" role="status">{{ flows.notice }}</p>
        <p v-if="flows?.target">来源 → 服务器：{{ serverTarget?.alias ?? '服务器' }} · 金色终点标记 · 筛选期请求汇聚。</p>
        <p class="risk-map-interaction">{{ effective3D ? '三维可旋转：左键旋转，右键平移，滚轮缩放' : '二维俯视' }} · 键盘 + / − 缩放，0 复位，方向键{{ effective3D ? '旋转' : '平移' }}；点选行政区查看细分。</p>
        <p>行政区颜色由深到浅表示请求量；弧线权重：青（低）· 橙（中）· 红（高）</p>
        <ul class="risk-list"><li v-for="row in flows?.same" :key="row.name"><span>{{ riskRegion(row.name) }} · 同地域汇聚</span><strong>{{ riskCount(row.count) }}</strong></li><li v-for="(row, index) in flows?.unplaced" :key="index"><span>{{ row.regionCode }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul>
        <p v-if="!counts?.safe" class="risk-warning">请求数超出安全绘图精度，仅显示边界；精确计数见下方。</p>
        <p v-else-if="!counts?.exact.length" class="risk-muted">无可定位请求数据，仅展示边界。</p>
        <p class="risk-muted">{{ loaded?.origin === 'local' ? '本地离线边界' : '固定版本外部补偿边界' }} · 请求次数。</p>
        <details><summary>本图精确计数与未定位来源</summary><ul class="risk-list"><li v-for="row in counts?.exact" :key="row.name"><span>{{ riskRegion(row.name) }}</span><strong>{{ riskCount(row.count) }}</strong></li><li v-for="(row, index) in counts?.unplaced" :key="`${row.regionCode}:${index}`"><span>{{ riskRegion(row.regionCode) }} · {{ row.reason }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul></details>
      </template>
    </template>
    <template v-if="!backdrop">
      <p>IP Geolocation by <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">DB-IP</a></p>
      <slot name="details" />
      <details class="risk-notes"><summary>地图来源与统计说明</summary><p>来源地域代表点 → 服务器；为筛选期汇总，不是真实网络路径或精确访客位置。线宽为归一化权重，金色标记表示服务器终点。二维与三维视角使用同一套真实经纬度；三维由 ECharts GL 实时渲染。</p><p>基础边界：geoBoundaries CHN ADM1（代表2019，34单元）与 Natural Earth 1:110m，均为公有领域数据，固定版本随应用发布。细分边界：中国地级市来自 OCHA HDX COD-AB 2020（CC BY-IGO 3.0，固定资源，简化后衍生，未匹配编码的边界不参与统计）；境外一级行政区来自 Natural Earth 1:10m Admin-1（公有领域，固定 commit）。均按需加载并校验 SHA。边界仅用于访问统计展示；HK/MO/TW按统计编码显式映射，微小地域无本图边界时单列。来源、许可与SHA见本端地图资产文档。</p><p>本地资源不可用时，每种基础地图每次页面访问最多尝试一次固定版本外部资源；细分边界没有外部补偿，缺失时保留上级地图与文字排行。请求不传业务鉴权、日志或内部地址；对方可见浏览器网络出口IP。</p><p>默认尊重系统“减弱动态”设置：开启后飞线保持静态，三维相机和地图缩放仍可用。</p></details>
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
.risk-map-floor { position: absolute; inset: 5% 3% 5%; z-index: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 62%, #0a9dcc4d, transparent 70%); }
.stage-3d .risk-map-floor { background: linear-gradient(#1f9fc61f 1px, transparent 1px), linear-gradient(90deg, #1f9fc61f 1px, transparent 1px); background-size: 42px 42px; mask-image: radial-gradient(ellipse, #000 12%, transparent 72%); }
.stage-2d .risk-map-floor { opacity: .7; }
.risk-map-3d, .risk-map-canvas { position: relative; z-index: 1; }
.risk-map-axis { position: absolute; left: 18%; right: 18%; bottom: 9%; z-index: 2; height: 1px; pointer-events: none; background: linear-gradient(90deg, transparent, #2ed6ef88, transparent); box-shadow: 0 0 18px #2ed6ef55; }
.risk-warning button { margin-left: 8px; }
@media (max-width: 600px) { .risk-map-stage { height: 420px; } }
@media (prefers-reduced-motion: reduce) { .risk-map-floor { transition: none; } }
</style>
