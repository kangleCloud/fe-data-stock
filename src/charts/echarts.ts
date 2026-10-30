import { BarChart, PieChart, LineChart, TreemapChart, MapChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  GeoComponent,
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
  MapChart,
  TooltipComponent,
  GridComponent,
  GeoComponent,
  MarkLineComponent,
  VisualMapComponent,
  AriaComponent,
  CanvasRenderer,
]);

export { echarts };
