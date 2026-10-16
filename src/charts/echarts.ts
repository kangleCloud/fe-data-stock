import { BarChart, PieChart, LineChart, TreemapChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  PieChart,
  LineChart,
  TreemapChart,
  TooltipComponent,
  GridComponent,
  MarkLineComponent,
  VisualMapComponent,
  AriaComponent,
  CanvasRenderer,
]);

export { echarts };
