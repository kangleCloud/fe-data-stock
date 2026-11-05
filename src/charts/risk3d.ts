import { echarts } from "@/charts/echarts";
import { Geo3DComponent } from "echarts-gl/components";
import { Map3DChart, Lines3DChart, Scatter3DChart } from "echarts-gl/charts";
import graphicGL from "echarts-gl/lib/util/graphicGL.js";
import displayShadowGLSL from "echarts-gl/lib/util/shader/displayShadow.glsl.js";
// Geo3DBuilder eagerly creates a shadow material, even with shadows disabled.
// In 2.1.0 its shader is otherwise registered only by the unused map SDK views.
graphicGL.Shader.import(displayShadowGLSL);
echarts.use([Geo3DComponent, Map3DChart, Lines3DChart, Scatter3DChart]);
export { echarts };
