import { describe, expect, it } from "vitest";
import {
  createRiskChartProjector,
  createRiskMapProjector,
  projectRiskPoint,
  selectRiskViewportRegions,
  selectRiskVisibleLabels,
} from "@/utils/riskMapProjection";

const identity = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];
const worldScale = [
  1 / 180, 0, 0, 0,
  0, 1 / 90, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];
const viewport = { x: 0, y: 0, width: 600, height: 400 };
const matrices = { viewMatrix: identity, projectionMatrix: worldScale, viewport };

function chartWith(projection = worldScale) {
  return {
    getModel: () => ({
      getSeriesByType: () => [{
        coordinateSystem: {
          dataToPoint: (data: number[]) => [data[0], data[1], data[2]],
          viewGL: {
            camera: {
              viewMatrix: { array: identity },
              projectionMatrix: { array: projection },
            },
            viewport,
          },
        },
      }],
    }),
  };
}

describe("risk map camera projection", () => {
  it("projects real geo points to pixels and rejects off-screen, behind-camera and clipped points", () => {
    expect(projectRiskPoint([90, 45, 0], matrices)).toEqual({
      x: 450,
      y: 300,
      ndcX: 0.5,
      ndcY: 0.5,
      visible: true,
    });
    expect(projectRiskPoint([180, 90, 0], matrices)?.visible).toBe(true);
    expect(projectRiskPoint([181, 0, 0], matrices)?.visible).toBe(false);
    expect(projectRiskPoint([90, 120, 0], matrices)?.visible).toBe(false);
    expect(projectRiskPoint([0, 0, 2], matrices)?.visible).toBe(false);
    const behind = [...worldScale];
    behind[15] = -1;
    expect(projectRiskPoint([0, 0, 0], { ...matrices, projectionMatrix: behind })).toBeUndefined();
  });

  it("reads only the interactive map3D coordinate system and its live camera", () => {
    const projector = createRiskChartProjector(chartWith());
    expect(projector?.project([90, 45, 0])).toMatchObject({ x: 450, y: 300, visible: true });
    expect(createRiskChartProjector({ getModel: () => ({ getSeriesByType: () => [] }) })).toBeUndefined();
    expect(createRiskChartProjector({})).toBeUndefined();
  });
});

describe("risk 2D geo pixel projector", () => {
  it("uses the live ECharts geo coordinate system and rejects off-screen or invalid pixels", () => {
    const calls: unknown[] = [];
    const chart = {
      getWidth: () => 400,
      getHeight: () => 300,
      convertToPixel: (finder: unknown, point: [number, number]) => {
        calls.push([finder, point]);
        return [point[0], point[1]];
      },
    };
    const projector = createRiskMapProjector(chart, 0)!;
    expect(projector.project([100, 120, 0])).toMatchObject({
      x: 100,
      y: 120,
      visible: true,
    });
    expect(projector.project([100, 120, 0])?.ndcX).toBeCloseTo(-0.5);
    expect(projector.project([100, 120, 0])?.ndcY).toBeCloseTo(0.2);
    expect(calls[0]).toEqual([{ geoIndex: 0 }, [100, 120]]);
    expect(projector.project([0, 0, 0])?.visible).toBe(true);
    expect(projector.project([400, 300, 0])?.visible).toBe(true);
    expect(projector.project([401, 300, 0])?.visible).toBe(false);
    expect(projector.project([100, -1, 0])?.visible).toBe(false);
  });

  it("returns no projector without a sized chart and survives converter errors", () => {
    expect(createRiskMapProjector(undefined)).toBeUndefined();
    expect(createRiskMapProjector({})).toBeUndefined();
    expect(createRiskMapProjector({ getWidth: () => 0, getHeight: () => 0, convertToPixel: () => [0, 0] })).toBeUndefined();

    const broken = createRiskMapProjector({
      getWidth: () => 400,
      getHeight: () => 300,
      convertToPixel: () => {
        throw new Error("not laid out");
      },
    })!;
    expect(broken.project([121, 31, 0])).toBeUndefined();

    const nan = createRiskMapProjector({
      getWidth: () => 400,
      getHeight: () => 300,
      convertToPixel: () => [Number.NaN, 10],
    })!;
    expect(nan.project([121, 31, 0])).toBeUndefined();

    const noSize = createRiskMapProjector({
      getWidth: () => {
        throw new Error("disposed");
      },
      getHeight: () => 300,
      convertToPixel: () => [0, 0],
    });
    expect(noSize).toBeUndefined();
  });

  it("crops labels and parents by the real 2D pixel viewport", () => {
    const chart = {
      getWidth: () => 600,
      getHeight: () => 400,
      convertToPixel: (_finder: unknown, point: [number, number]) => [point[0] * 2, point[1] * 2],
    };
    const project = createRiskMapProjector(chart, 0)!.project;
    const picked = selectRiskVisibleLabels([
      { name: "inside", cp: [100, 100], area: 5 },
      { name: "edge", cp: [299, 199], area: 2 },
      { name: "outside", cp: [320, 100], area: 99 },
      { name: "overlap", cp: [102, 100], area: 1 },
    ], project, { minPixelDistance: 48, limit: 10 });
    expect(picked.map((item) => item.name)).toEqual(["inside", "edge"]);
    expect(selectRiskViewportRegions([
      { code: "OFF", center: [350, 100], probes: [] },
      { code: "ON", center: [100, 100], probes: [] },
    ], project)).toEqual(["ON"]);
  });
});

describe("risk viewport label selection", () => {
  const project = createRiskChartProjector(chartWith())!.project;

  it("keeps only truly visible points and enforces pixel spacing by real area priority", () => {
    const picked = selectRiskVisibleLabels([
      { name: "large", cp: [0, 0], area: 100 },
      { name: "overlap", cp: [10, 0], area: 50 },
      { name: "offscreen", cp: [0, 120], area: 200 },
    ], project, { minPixelDistance: 56, limit: 8 });
    expect(picked.map((item) => item.name)).toEqual(["large"]);

    const dense = selectRiskVisibleLabels([
      { name: "large", cp: [0, 0], area: 100 },
      { name: "small", cp: [10, 0], area: 50 },
    ], project, { minPixelDistance: 0, limit: 1 });
    expect(dense.map((item) => item.name)).toEqual(["large"]);
  });

  it("supports a bounded parent queue with viewport probes and stable deduplication", () => {
    const codes = selectRiskViewportRegions([
      { code: "A", center: [90, 45], probes: [] },
      { code: "B", center: [0, 120], probes: [[0, 45]] },
      { code: "C", center: [179, 89], probes: [] },
      { code: "A", center: [90, 45], probes: [] },
    ], project, { limit: 2 });
    expect(codes).toHaveLength(2);
    expect(new Set(codes).size).toBe(2);
    expect(codes).toContain("A");
    expect(codes).toContain("B");
    expect(selectRiskViewportRegions([{ code: "OFF", center: [0, 120], probes: [] }], project)).toEqual([]);
  });
});
