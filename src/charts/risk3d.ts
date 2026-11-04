import { echarts } from "@/charts/echarts";
import { Geo3DComponent } from "echarts-gl/components";
import { Map3DChart, Lines3DChart, Scatter3DChart } from "echarts-gl/charts";
echarts.use([Geo3DComponent, Map3DChart, Lines3DChart, Scatter3DChart]);
export { echarts };
