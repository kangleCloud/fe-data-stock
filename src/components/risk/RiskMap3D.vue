<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import type { RiskServerTarget } from "@/types/riskServer";
import type { RiskGeo, RiskMapKind } from "@/utils/riskMap";
import type { riskMapCounts } from "@/utils/riskMap";
import {
  defaultRiskCamera,
  normalizeRiskCamera,
  riskCameraKey,
  riskCameraZoom,
  sameRiskCamera,
  zoomRiskCamera,
  type RiskCamera3D,
} from "@/utils/riskCamera3d";
import {
  riskDetailDisplayName,
  riskDetailFileKey,
  type RiskDetailFeature,
  type RiskDetailLayer,
  type RiskViewportDetail,
} from "@/utils/riskMapDetail";
import {
  buildRiskMap3DOption,
  risk3DDetailLabelMinimumZoom,
  risk3DViewControl,
  type Risk3DCityLabel,
} from "@/utils/riskMap3dOption";
import {
  createRiskChartProjector,
  selectRiskViewportRegions,
  selectRiskVisibleLabels,
  type RiskProjectionCandidate,
  type RiskProjectionRegion,
} from "@/utils/riskMapProjection";
import { riskMapFeatureBounds, riskMapFeatureCenter } from "@/utils/riskMapView";
import type { riskFlows } from "@/utils/riskFlows";

const props = defineProps<{
  kind: RiskMapKind;
  mapName: string;
  geo: RiskGeo;
  baseGeo?: RiskGeo;
  viewportDetails?: readonly RiskViewportDetail[];
  counts: ReturnType<typeof riskMapCounts>;
  flows: ReturnType<typeof riskFlows>;
  camera: RiskCamera3D;
  detail?: RiskDetailLayer;
  reducedMotion: boolean;
  serverTarget?: RiskServerTarget;
  height: string;
}>();

const emit = defineEmits<{
  regionSelect: [name: string];
  cameraChange: [value: RiskCamera3D];
  failed: [reason: string];
  viewportParents: [codes: string[]];
}>();

interface RiskCityCandidate extends RiskProjectionCandidate {
  feature: RiskDetailFeature;
  parentCode: string;
}

const root = ref<HTMLElement>();
let chart: EChartsType | undefined;
let observer: ResizeObserver | undefined;
let disposed = false;
let lost = false;
let renderedMapName = "";
let down: number[] | undefined;
let dragged = false;
let pickAfter = 0;
let applyingExternal = false;
let viewportTimer: ReturnType<typeof setTimeout> | undefined;
let lastViewportParents = "";

let camera = normalizeRiskCamera(props.camera);
const cameraSnapshot = ref(camera);
const frameAspect = ref(2);
const visibleDetailLabels = shallowRef<ReadonlySet<string>>(new Set());
const viewportCityLabels = shallowRef<Risk3DCityLabel[]>([]);
const boxWidth = computed(() => (props.kind === "world" ? 165 : 200) * Math.min(1, frameAspect.value / 1.5));

function fitFrame(): boolean {
  const element = root.value;
  if (!element?.clientWidth || !element.clientHeight) return false;
  const next = element.clientWidth / element.clientHeight;
  if (Math.abs(next - frameAspect.value) < 0.01) return false;
  frameAspect.value = next;
  return true;
}

function cleanupChart() {
  observer?.disconnect();
  observer = undefined;
  const renderer = chart;
  chart = undefined;
  try {
    renderer?.dispose();
  } catch {
    // The host still needs to fall back when a lost context prevents disposal.
  }
}

function fail(reason: string) {
  if (disposed || lost) return;
  lost = true;
  if (viewportTimer) {
    clearTimeout(viewportTimer);
    viewportTimer = undefined;
  }
  cleanupChart();
  emit("failed", reason);
}

function option(): EChartsCoreOption {
  return buildRiskMap3DOption({
    kind: props.kind,
    mapName: props.mapName,
    geo: props.geo,
    counts: props.counts,
    flows: props.flows,
    camera,
    detail: props.detail,
    visibleDetailLabels: visibleDetailLabels.value,
    cityLabels: viewportCityLabels.value,
    reducedMotion: props.reducedMotion,
    serverTarget: props.serverTarget,
    boxWidth: boxWidth.value,
  });
}

function checkRenderer() {
  if (root.value?.querySelector(".ecgl-nowebgl")) fail("WebGL 渲染器创建失败，已切回二维地图");
}

function renderOption() {
  if (!chart || disposed || lost || document.visibilityState === "hidden") return;
  try {
    const next = option();
    const replace = renderedMapName !== props.mapName;
    chart.setOption(next, replace ? { notMerge: true } : { replaceMerge: ["series", "geo3D"], lazyUpdate: true });
    renderedMapName = props.mapName;
    checkRenderer();
  } catch {
    fail("三维地图更新失败，已切回二维地图");
  }
}

function writeViewportLabels() {
  if (!chart || disposed || lost) return;
  try {
    const next = option();
    const series = ((next.series ?? []) as { id?: string }[])
      .filter((item) => item.id === "risk3d-regions" || item.id === "risk3d-city-labels");
    chart.setOption({ series } as EChartsCoreOption, { lazyUpdate: true, silent: true });
    checkRenderer();
  } catch {
    fail("三维地图更新失败，已切回二维地图");
  }
}

function scheduleViewport(delay = 120) {
  if (viewportTimer) clearTimeout(viewportTimer);
  if (disposed || lost) return;
  viewportTimer = setTimeout(() => {
    viewportTimer = undefined;
    computeViewport();
  }, delay);
}

function update() {
  renderOption();
  scheduleViewport();
}

function sameNames(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const name of left) if (!right.has(name)) return false;
  return true;
}

function parentCandidates(): RiskProjectionRegion[] {
  const geo = props.baseGeo ?? props.geo;
  const selected = props.detail?.regionCode;
  return geo.features.flatMap((feature) => {
    const code = feature.properties.code;
    if (!code || code === selected || !riskDetailFileKey(props.kind, code)) return [];
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

function cityCandidates(): RiskCityCandidate[] {
  const selected = props.detail?.regionCode;
  return (props.viewportDetails ?? []).flatMap((detail) => {
    if (detail.parentCode === selected) return [];
    return detail.features.flatMap((feature) => {
      const candidate: RiskCityCandidate = {
        name: feature.properties.name,
        cp: feature.properties.cp,
        area: feature.properties.area,
        feature,
        parentCode: detail.parentCode,
      };
      return [candidate];
    });
  });
}

function detailCandidates(): RiskProjectionCandidate[] {
  return props.detail?.geo.features.map((feature) => ({
    name: feature.properties.name,
    cp: feature.properties.cp,
    area: feature.properties.area,
  })) ?? [];
}

function computeViewport() {
  if (!chart || disposed || lost) return;
  const projector = createRiskChartProjector(chart);
  const enabled = riskCameraZoom(camera) >= risk3DDetailLabelMinimumZoom(props.kind);
  let detailLabels: ReadonlySet<string> = new Set();
  let cityLabels: Risk3DCityLabel[] = [];
  let parents: string[] = [];

  if (projector && enabled) {
    const combined: (RiskProjectionCandidate & { source: "city" | "detail"; city?: RiskCityCandidate })[] = [
      ...detailCandidates().map((candidate) => ({ ...candidate, source: "detail" as const })),
      ...cityCandidates().map((candidate) => ({ ...candidate, source: "city" as const, city: candidate })),
    ];
    const picked = selectRiskVisibleLabels(combined, projector.project, {
      minPixelDistance: props.kind === "china" ? 56 : 48,
      limit: 40,
    });
    cityLabels = picked.flatMap((item) => item.city ? [{
      name: item.city.feature.properties.name,
      label: riskDetailDisplayName(item.city.feature),
      cp: item.city.cp,
      area: item.city.area,
      parentCode: item.city.parentCode,
    }] : []);
    detailLabels = new Set(picked.filter((item) => item.source === "detail").map((item) => item.name));
    parents = selectRiskViewportRegions(parentCandidates(), projector.project, {
      limit: props.kind === "china" ? 6 : 8,
    });
  }

  const detailChanged = !sameNames(visibleDetailLabels.value, detailLabels);
  const cityChanged = viewportCityLabels.value.length !== cityLabels.length
    || viewportCityLabels.value.some((row, index) => {
      const next = cityLabels[index];
      return !next || next.name !== row.name || next.parentCode !== row.parentCode || next.label !== row.label;
    });
  if (detailChanged) visibleDetailLabels.value = detailLabels;
  if (cityChanged) viewportCityLabels.value = cityLabels;
  if (detailChanged || cityChanged) writeViewportLabels();
  if (lost) return;

  const parentKey = parents.join(",");
  if (parentKey !== lastViewportParents) {
    lastViewportParents = parentKey;
    emit("viewportParents", parents);
  }
}

function applyCamera(value: RiskCamera3D, syncMap = true) {
  if (!chart || disposed || lost) return;
  try {
    chart.setOption({
      geo3D: { viewControl: risk3DViewControl(value, false) },
      ...(syncMap ? { series: [{ id: "risk3d-regions", viewControl: risk3DViewControl(value) }] } : {}),
    } as EChartsCoreOption, { lazyUpdate: true, silent: true });
  } catch {
    fail("三维相机更新失败，已切回二维地图");
  }
}

interface RiskChartInternals {
  getModel?: () => { getSeriesByIndex?: (index: number) => unknown } | undefined;
  getViewOfSeriesModel?: (series: unknown) => unknown;
}

/**
 * map3dcamerachanged 只包含 alpha/beta/distance，右键平移后的 center 只能从
 * ECharts GL 的 OrbitControl 读取；读不到时保留当前 center，绝不重置平移。
 */
function readOrbitCenter(): number[] | undefined {
  try {
    const internals = chart as unknown as RiskChartInternals | undefined;
    const series = internals?.getModel?.()?.getSeriesByIndex?.(0);
    if (!series) return undefined;
    const view = internals?.getViewOfSeriesModel?.(series) as { _control?: { getCenter?: () => unknown } } | undefined;
    const center = view?._control?.getCenter?.();
    if (!Array.isArray(center) || center.length !== 3) return undefined;
    if (!center.every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
    return [...center] as number[];
  } catch {
    return undefined;
  }
}

function setCamera(value: RiskCamera3D, notify = true, syncMap = true) {
  const next = normalizeRiskCamera(value);
  const changed = !sameRiskCamera(camera, next);
  camera = next;
  cameraSnapshot.value = next;
  if (changed) {
    applyCamera(next, syncMap);
    scheduleViewport();
  }
  if (notify && !applyingExternal && !sameRiskCamera(next, props.camera)) emit("cameraChange", next);
}

function mapCameraChanged(event: unknown) {
  if (applyingExternal) return;
  const source = event as Partial<RiskCamera3D>;
  const payloadCenter = Array.isArray(source.center) && source.center.length === 3 && source.center.every((item) => Number.isFinite(item))
    ? ([...source.center] as number[])
    : undefined;
  const next = normalizeRiskCamera({ ...camera, ...source, center: payloadCenter ?? readOrbitCenter() ?? camera.center });
  if (sameRiskCamera(next, camera)) return;
  // The interactive map3D already owns the new view; only mirror the hidden
  // geo3D coordinate system so lines/scatter stay aligned without snapping pan.
  setCamera(next, true, false);
}

function pointerDown(event: PointerEvent) {
  down = [event.clientX, event.clientY];
  dragged = false;
}

function pointerMove(event: PointerEvent) {
  if (down && Math.hypot(event.clientX - down[0]!, event.clientY - down[1]!) > 5) dragged = true;
}

function pointerUp() {
  if (dragged) pickAfter = performance.now() + 250;
  down = undefined;
}

function contextLost(event: Event) {
  event.preventDefault();
  fail("WebGL 上下文丢失，已切回二维地图");
}

function click(event: unknown) {
  if (disposed || lost) return;
  if (dragged || performance.now() < pickAfter) return;
  if ((event as { seriesId?: unknown }).seriesId === "risk3d-city-labels") return;
  const name = (event as { name?: unknown }).name;
  if (typeof name === "string") emit("regionSelect", name);
}

function keydown(event: KeyboardEvent) {
  const next = riskCameraKey(camera, event.key);
  if (!next) return;
  event.preventDefault();
  setCamera(next);
}

function visibility() {
  if (document.visibilityState === "hidden") {
    chart?.getZr().animation.stop();
    return;
  }
  chart?.getZr().animation.start();
  chart?.resize();
  update();
}

function zoom(factor: number) {
  setCamera(zoomRiskCamera(camera, factor));
}

function resetView() {
  setCamera(defaultRiskCamera());
}

defineExpose({ zoom, resetView });

watch(() => props.camera, (value) => {
  const next = normalizeRiskCamera(value);
  if (sameRiskCamera(camera, next)) return;
  applyingExternal = true;
  camera = next;
  cameraSnapshot.value = next;
  applyCamera(next);
  applyingExternal = false;
  scheduleViewport();
});

watch(() => [props.geo, props.baseGeo, props.viewportDetails, props.counts, props.flows, props.detail, props.reducedMotion, props.serverTarget, props.mapName], update, { deep: false });

onMounted(async () => {
  try {
    const runtime = await import("@/charts/risk3d");
    if (disposed || !root.value) return;
    fitFrame();
    chart = runtime.echarts.init(root.value, undefined, {
      renderer: "canvas",
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });
    chart.on("click", click);
    chart.on("map3dcamerachanged", mapCameraChanged);
    chart.setOption(option(), { notMerge: true });
    renderedMapName = props.mapName;
    checkRenderer();
    if (lost) return;
    chart.getZr().flush();
    scheduleViewport(0);
    observer = new ResizeObserver(() => {
      if (document.visibilityState === "hidden") return;
      const changed = fitFrame();
      chart?.resize();
      if (changed) update();
    });
    observer.observe(root.value);
    document.addEventListener("visibilitychange", visibility);
  } catch {
    fail("三维模块或 WebGL 初始化失败，已切回二维地图");
  }
});

onBeforeUnmount(() => {
  disposed = true;
  if (viewportTimer) clearTimeout(viewportTimer);
  viewportTimer = undefined;
  document.removeEventListener("visibilitychange", visibility);
  cleanupChart();
});
</script>

<template>
  <div
    ref="root"
    class="risk-map-3d"
    role="img"
    aria-label="可旋转三维地域地图。左键旋转，右键平移，滚轮缩放；方向键旋转，加号减号缩放，0 复位；点选行政区查看细分。"
    :data-view-alpha="cameraSnapshot.alpha"
    :data-view-beta="cameraSnapshot.beta"
    :data-view-distance="cameraSnapshot.distance"
    :data-view-center="cameraSnapshot.center.join(',')"
    :style="{ height }"
    tabindex="0"
    @keydown="keydown"
    @contextmenu.prevent
    @pointerdown.capture="pointerDown"
    @pointermove.capture="pointerMove"
    @pointerup.capture="pointerUp"
    @pointercancel.capture="pointerUp"
    @webglcontextlost.capture="contextLost"
  />
</template>

<style scoped>
.risk-map-3d {
  position: relative;
  width: 100%;
  min-height: 160px;
  touch-action: none;
}
.risk-map-3d:focus-visible {
  outline: 2px solid var(--risk-accent, #2de7eb);
  outline-offset: -3px;
}
</style>
