import { LineChart, TreemapChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  TreemapChart,
  TooltipComponent,
  GridComponent,
  AriaComponent,
  CanvasRenderer,
]);

export { echarts };
