import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { SVGRenderer } from "echarts/renderers";
import { echarts } from "@/charts/echarts";
import { riskFlows } from "@/utils/riskFlows";
import { riskMapCounts, validateRiskGeo } from "@/utils/riskMap";
import { buildRiskMapOption } from "@/utils/riskMapOption";
import { defaultRiskMapView } from "@/utils/riskMapView";

echarts.use([SVGRenderer]);

describe("measure", () => {
  it("prints display list text", () => {
    const geo = validateRiskGeo("china", JSON.parse(readFileSync("public/maps/risk-v1/china.geojson", "utf8")));
    const asset = { geo, origin: "local" as const };
    echarts.registerMap("measure-china", geo as Parameters<typeof echarts.registerMap>[1]);
    const rows = [{ regionCode: "CN-65", requestCount: "1" }];
    const counts = riskMapCounts("china", rows, geo);
    const flows = riskFlows("china", rows, undefined, geo);
    const option = buildRiskMapOption({ kind: "china", asset, counts, flows, view: defaultRiskMapView(), mode: "2d", backdrop: true, reducedMotion: true });
    (option.geo as { map: string }[])[0]!.map = "measure-china";
    const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: 900, height: 520 });
    chart.setOption(option);
    type El = { type?: string; style?: { text?: string }; ignore?: boolean };
    const readTexts = () => {
      const list = (chart.getZr() as unknown as { storage: { getDisplayList: () => El[] } }).storage.getDisplayList();
      return list.map((el) => ({type: el.type, text: el.style?.text, content: (() => { const c = (el as unknown as {getTextContent?: () => unknown}).getTextContent?.(); return Array.isArray(c) ? (c as {style?: {text?: string}}[]).map((x) => x.style?.text) : (c as {style?: {text?: string}} | undefined)?.style?.text; })()}));
    };
    console.log("before", readTexts().slice(0, 20), readTexts().length);
    chart.dispatchAction({ type: "highlight", seriesIndex: 0, name: "CN-65" });
    console.log("after series highlight", readTexts().slice(0, 20), readTexts().length);
    chart.dispatchAction({ type: "downplay", seriesIndex: 0, name: "CN-65" });
    chart.dispatchAction({ type: "highlight", geoIndex: 0, name: "CN-65" });
    console.log("after geo highlight", readTexts().slice(0, 20), readTexts().length);
    chart.dispose();
  });
});
