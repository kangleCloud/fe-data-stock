import { expect, it, vi } from "vitest";
import { guardRiskHeatLayer } from "@/utils/riskHeatLayer";

it("does not draw a heat model while L7 is replacing its GPU buffers", async () => {
  let completeBuild!: () => void;
  const buildModels = () => new Promise<void>(resolve => { completeBuild = resolve; });
  const prepare = vi.fn();
  const draw = vi.fn();
  const render = vi.fn(() => layer.renderModels({ pass: "color" }));
  const layer = { buildModels, prerender: prepare, render, renderModels: draw };
  guardRiskHeatLayer(layer);

  for (let build = 0; build < 2; build++) {
    const pending = layer.buildModels();
    layer.prerender();
    layer.render();
    layer.renderModels();
    expect(prepare).toHaveBeenCalledTimes(build);
    expect(render).toHaveBeenCalledTimes(build);
    expect(draw).toHaveBeenCalledTimes(build);

    completeBuild();
    await pending;
    layer.prerender();
    layer.render();
    expect(prepare).toHaveBeenCalledTimes(build + 1);
    expect(draw).toHaveBeenLastCalledWith({ pass: "color" });
  }
});
