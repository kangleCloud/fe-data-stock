import { expect, it, vi } from "vitest";
it("registers the real shadow shader required by selectively loaded Geo3D builders", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await import("@/charts/risk3d");
    const { default: graphicGL } = await import("echarts-gl/lib/util/graphicGL.js");
    expect(graphicGL.Shader.source("ecgl.displayShadow.vertex")).toContain("void main");
    expect(graphicGL.Shader.source("ecgl.displayShadow.fragment")).toContain("void main");
    expect(graphicGL.createMaterial("ecgl.shadow")).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  } finally { errors.mockRestore(); }
});
