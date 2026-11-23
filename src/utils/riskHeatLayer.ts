export interface RiskHeatLayerRenderer {
  buildModels: () => Promise<void>;
  render: (options?: unknown) => unknown;
  prerender: () => void;
  renderModels: (options?: unknown) => unknown;
}

/** L7 2.29 can draw between replacing the heat model and finishing its GPU buffers. */
export function guardRiskHeatLayer(layer: RiskHeatLayerRenderer): void {
  const build = layer.buildModels.bind(layer);
  const prepare = layer.prerender.bind(layer);
  const render = layer.render.bind(layer);
  const draw = layer.renderModels.bind(layer);
  let pendingBuilds = 0;
  let ready = false;

  layer.buildModels = async () => {
    pendingBuilds++;
    ready = false;
    try {
      await build();
      ready = true;
    } finally {
      pendingBuilds--;
    }
  };
  layer.prerender = () => {
    if (ready && pendingBuilds === 0) prepare();
  };
  layer.render = (options) => pendingBuilds === 0 ? render(options) : layer;
  layer.renderModels = (options) => ready && pendingBuilds === 0 ? draw(options) : layer;
}
