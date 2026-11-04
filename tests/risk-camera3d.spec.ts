import { expect, it } from "vitest";
import { defaultRiskCamera, normalizeRiskCamera, riskCameraKey, riskArc3D } from "@/utils/riskCamera3d";
it("clamps camera controls and keeps reset deterministic without automatic rotation", () => {
  expect(normalizeRiskCamera({ alpha: 100, beta: -10, distance: -5, center: [NaN,0,0] })).toEqual({ alpha:75,beta:-10,distance:60,center:[0,0,0] });
  expect(riskCameraKey(defaultRiskCamera(),"ArrowUp")?.alpha).toBe(40);
  expect(riskCameraKey(defaultRiskCamera(),"ArrowLeft")?.beta).toBe(-10);
  expect(riskCameraKey(defaultRiskCamera(),"+")?.distance).toBe(128);
  expect(riskCameraKey({alpha:70,beta:25,distance:250,center:[1,2,3]},"0")).toEqual(defaultRiskCamera());
  expect(riskCameraKey(defaultRiskCamera(),"Tab")).toBeUndefined();
});
it("builds a bounded static arc in source-to-target order", () => {
  const arc=riskArc3D([[100,30],[120,40]]); expect(arc).toHaveLength(25);
  expect(arc[0]).toEqual([100,30,.02]); expect(arc[24]![0]).toBe(120); expect(arc[24]![1]).toBe(40);
  expect(arc[12]![2]).toBeCloseTo(.92); expect(arc.flat().every(Number.isFinite)).toBe(true);
});
