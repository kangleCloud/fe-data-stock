import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import Map3D from "@/components/risk/RiskMap3D.vue";
import { defaultRiskCamera } from "@/utils/riskCamera3d";
import type { RiskMapAsset } from "@/utils/riskMap";
const mock=vi.hoisted(()=>({ init:vi.fn(), option:vi.fn(), dispose:vi.fn(), resize:vi.fn(), flush:vi.fn(), stop:vi.fn(), start:vi.fn(), handlers:{} as Record<string,(event:unknown)=>void> }));
vi.mock("@/charts/risk3d",()=>({echarts:{init:mock.init}}));
const asset:RiskMapAsset={origin:"local",geo:{type:"FeatureCollection",features:[{type:"Feature",properties:{name:"CN-31",code:"CN-31",label:"上海"},geometry:{type:"Polygon",coordinates:[[[70,15],[140,15],[140,55],[70,55],[70,15]]]}}]}};
const originalResizeObserver = globalThis.ResizeObserver;
const wrappers:ReturnType<typeof mount>[]=[];
function render(){const w=mount(Map3D,{props:{asset,kind:"china",regions:[{regionCode:"CN-31",requestCount:"7"}],camera:defaultRiskCamera(),height:"500px"}});wrappers.push(w);return w;}
beforeEach(()=>{vi.clearAllMocks();mock.handlers={};mock.init.mockReturnValue({setOption:mock.option,dispose:mock.dispose,resize:mock.resize,on:(name:string,handler:(e:unknown)=>void)=>{mock.handlers[name]=handler;},getZr:()=>({on:vi.fn(),flush:mock.flush,animation:{stop:mock.stop,start:mock.start}})});});
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.restoreAllMocks();vi.stubGlobal("ResizeObserver", originalResizeObserver);});
it("keeps the instance and current camera across data refreshes and keyboard operations",async()=>{
 const w=render();await flushPromises();expect(mock.init).toHaveBeenCalledTimes(1);
 mock.handlers.geo3dcamerachanged!({alpha:55,beta:40,distance:180,center:[1,2,3]});
 await w.setProps({regions:[{regionCode:"CN-31",requestCount:"8"}]});
 expect(mock.init).toHaveBeenCalledTimes(1);expect(mock.option.mock.calls.at(-1)?.[0].geo3D.viewControl).toMatchObject({alpha:55,beta:40,distance:180,center:[1,2,3],autoRotate:false});
 await w.trigger("keydown",{key:"ArrowRight"});expect(mock.option.mock.calls.at(-1)?.[0].geo3D.viewControl.beta).toBe(50);
 await w.trigger("keydown",{key:"0"});expect(mock.option.mock.calls.at(-1)?.[0].geo3D.viewControl.alpha).toBe(35);
});
it("picks only known regions and suppresses clicks after rotation drags",async()=>{
 const w=render();await flushPromises();mock.handlers.click!({name:"CN-31"});mock.handlers.click!({name:"UNKNOWN"});expect(w.emitted("regionSelect")).toEqual([["CN-31"]]);
 w.element.dispatchEvent(new MouseEvent("pointerdown",{clientX:10,clientY:10}));w.element.dispatchEvent(new MouseEvent("pointermove",{clientX:50,clientY:15}));w.element.dispatchEvent(new MouseEvent("pointerup"));mock.handlers.click!({name:"CN-31"});expect(w.emitted("regionSelect")).toHaveLength(1);
});
it("keeps exact unsafe counts in tooltip, uniform extrusion and no target marker without valid location",async()=>{
 const w=render();await flushPromises();await w.setProps({regions:[{regionCode:"CN-31",requestCount:"9007199254740993"}]});
 const initial=mock.option.mock.calls[0]![0];expect(initial.geo3D.regionHeight).toBe(1.5);expect(initial.geo3D.zlevel).toBe(-1);expect(initial.series[0].zlevel).toBe(-2);expect(initial.geo3D.viewControl.autoRotate).toBe(false);expect(initial.geo3D.viewControl.minBeta).toBe(-Infinity);expect(initial.geo3D.viewControl.maxBeta).toBe(Infinity);
 expect(initial.tooltip.formatter({name:"CN-31"})).toContain("9,007,199,254,740,993");
 const latest=mock.option.mock.calls.at(-1)![0];expect(latest.series.find((s:{id:string})=>s.id==='risk3d-flows').data).toEqual([]);expect(latest.series.find((s:{id:string})=>s.id==='risk3d-target').data).toEqual([]);
});
it("falls back and disposes on context loss; hidden pages stop extra rendering",async()=>{
 const w=render();await flushPromises();vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));expect(mock.stop).toHaveBeenCalled();const n=mock.option.mock.calls.length;await w.setProps({regions:[]});expect(mock.option).toHaveBeenCalledTimes(n);
 await w.trigger('webglcontextlost');expect(w.emitted('failed')?.[0]?.[0]).toContain('上下文丢失');expect(mock.dispose).toHaveBeenCalledTimes(1);w.unmount();expect(mock.dispose).toHaveBeenCalledTimes(1);
});
it("reports runtime initialization failure without accepting a partial renderer",async()=>{mock.init.mockImplementation(()=>{throw new Error('GL disabled');});const w=render();await flushPromises();expect(w.emitted('failed')?.[0]?.[0]).toContain('初始化失败');});

it("rejects the GL library's partial fallback layer and releases its instance",async()=>{
 const w=render();mock.flush.mockImplementationOnce(()=>{const error=document.createElement('div');error.className='ecgl-nowebgl';w.element.append(error);});await flushPromises();expect(w.emitted('failed')?.[0]?.[0]).toContain('渲染器创建失败');expect(mock.dispose).toHaveBeenCalledTimes(1);
});
it("fits a narrow map frame without resetting the user's camera",async()=>{
 let resize=()=>undefined as void;
 vi.stubGlobal('ResizeObserver',class { constructor(callback:()=>void){resize=callback;}observe(){}disconnect(){} });
 const w=render();await flushPromises();mock.handlers.map3dcamerachanged!({alpha:50,beta:-20,distance:180,center:[1,0,0]});
 Object.defineProperty(w.element,'clientWidth',{value:360});Object.defineProperty(w.element,'clientHeight',{value:360});resize();
 const update=mock.option.mock.calls.at(-1)![0];expect(update.geo3D.boxWidth).toBeCloseTo(200/1.5);expect(update.geo3D.viewControl).toMatchObject({alpha:50,beta:-20,distance:180});expect(update.series[0].boxWidth).toBe(update.geo3D.boxWidth);w.unmount();
});
