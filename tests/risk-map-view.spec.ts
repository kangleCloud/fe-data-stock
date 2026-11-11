import { expect, it } from "vitest";
import { defaultRiskMapView, normalizeRiskMapView, riskMapGeoCenter, riskMapViewKey, zoomRiskMapView } from "@/utils/riskMapView";

it("clamps zoom and pan offsets without inventing map data", () => {
  expect(normalizeRiskMapView({ zoom: 99, offset: [240, -120] })).toEqual({ zoom: 8, offset: [180, -90] });
  expect(normalizeRiskMapView({ zoom: 0, offset: [NaN, 0] })).toEqual({ zoom: 0.6, offset: [0, 0] });
  expect(normalizeRiskMapView({ zoom: Number.POSITIVE_INFINITY, offset: [-181, 91] })).toEqual({ zoom: 1, offset: [-180, 90] });
  expect(normalizeRiskMapView({ zoom: 2.5, offset: [121.47, 31.23] })).toEqual({ zoom: 2.5, offset: [121.47, 31.23] });
});

it("keeps zoom and reset deterministic and only reacts to documented keys", () => {
  expect(zoomRiskMapView(defaultRiskMapView(), 1.25).zoom).toBe(1.25);
  expect(zoomRiskMapView({ zoom: 7, offset: [0, 0] }, 2).zoom).toBe(8);
  expect(zoomRiskMapView(defaultRiskMapView(), 0).zoom).toBe(1);
  expect(riskMapViewKey({ zoom: 2, offset: [10, 20] }, "+")?.zoom).toBe(2.5);
  expect(riskMapViewKey({ zoom: 2, offset: [10, 20] }, "=")?.zoom).toBe(2.5);
  expect(riskMapViewKey({ zoom: 2, offset: [10, 20] }, "-")?.zoom).toBe(1.6);
  expect(riskMapViewKey({ zoom: 2, offset: [10, 20] }, "ArrowLeft")?.offset).toEqual([7, 20]);
  expect(riskMapViewKey({ zoom: 2, offset: [10, 20] }, "ArrowRight")?.offset).toEqual([13, 20]);
  expect(riskMapViewKey({ zoom: 2, offset: [10, 20] }, "ArrowUp")?.offset).toEqual([10, 22]);
  expect(riskMapViewKey({ zoom: 2, offset: [10, 20] }, "ArrowDown")?.offset).toEqual([10, 18]);
  expect(riskMapViewKey({ zoom: 3, offset: [10, 20] }, "0")).toEqual(defaultRiskMapView());
  expect(riskMapViewKey(defaultRiskMapView(), "Tab")).toBeUndefined();
});

it("anchors the default view at the real geometry center and falls back safely", () => {
  const geo = {
    type: "FeatureCollection" as const,
    features: [{
      type: "Feature" as const,
      properties: { name: "test", label: "test", code: "TS" },
      geometry: { type: "Polygon" as const, coordinates: [[[73, 18], [135, 18], [135, 54], [73, 54], [73, 18]]] },
    }],
  };
  expect(riskMapGeoCenter(geo)).toEqual([104, 36]);
  expect(riskMapGeoCenter(geo)).toBe(riskMapGeoCenter(geo));
  expect(riskMapGeoCenter({ type: "FeatureCollection", features: [] })).toEqual([0, 0]);
});
