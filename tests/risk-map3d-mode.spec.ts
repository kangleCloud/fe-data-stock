import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";
const mock=vi.hoisted(()=>({available:vi.fn(),load:vi.fn(),stop:vi.fn()}));
vi.mock('@/utils/riskWebGL',()=>({canRiskWebGL:mock.available}));
vi.mock('@/charts/echarts',()=>({echarts:{registerMap:vi.fn()}}));
vi.mock('@/utils/riskMap',async original=>({...await original<typeof import('@/utils/riskMap')>(),createRiskMapLoader:()=>({load:mock.load,stop:mock.stop})}));
const wrappers:ReturnType<typeof mount>[]=[];
function render(){const w=mount(RiskRegionMap,{props:{regions:[]},global:{stubs:{BaseChart:true,RiskMap3D:{name:'RiskMap3D',props:['camera','kind'],template:'<div data-3d />'}}}});wrappers.push(w);return w;}
beforeEach(()=>{vi.clearAllMocks();mock.available.mockReturnValue(true);mock.load.mockImplementation(async(kind:string)=>({origin:'local',geo:{type:'FeatureCollection',features:[{type:'Feature',properties:{name:kind==='china'?'CN-31':'US',code:kind==='china'?'CN-31':'US',label:'Region'},geometry:{type:'Polygon',coordinates:[[[70,15],[140,15],[140,55],[70,55],[70,15]]]}}]}}));});
afterEach(()=>wrappers.splice(0).forEach(w=>w.unmount()));
async function click(w:ReturnType<typeof mount>,text:string){await w.findAll('button').find(b=>b.text()===text)!.trigger('click');await flushPromises();}
it('defaults to 3D and falls back on failures without refetching or automatic retry',async()=>{
 const w=render();await flushPromises();const child=w.getComponent({name:'RiskMap3D'});child.vm.$emit('failed','WebGL上下文丢失');await flushPromises();expect(w.find('base-chart-stub').exists()).toBe(true);expect(w.text()).toContain('上下文丢失');expect(mock.load).toHaveBeenCalledTimes(1);
 await w.setProps({regions:[{regionCode:'CN-31',requestCount:'9'}]});expect(w.find('[data-3d]').exists()).toBe(false);
 await click(w,'3D');expect(w.find('[data-3d]').exists()).toBe(true);expect(mock.load).toHaveBeenCalledTimes(1);
});
it('starts with 2D when WebGL is unavailable and keeps an explicit retry control',async()=>{mock.available.mockReturnValue(false);const w=render();await flushPromises();expect(w.find('base-chart-stub').exists()).toBe(true);expect(w.text()).toContain('WebGL不可用');await click(w,'3D');expect(w.find('[data-3d]').exists()).toBe(false);expect(mock.load).toHaveBeenCalledTimes(1);});
it('remembers independent China/world cameras and keeps both map data and selection controlled',async()=>{
 const w=render();await flushPromises();w.getComponent({name:'RiskMap3D'}).vm.$emit('cameraChange',{alpha:55,beta:30,distance:180,center:[1,2,3]});await click(w,'世界');expect(w.getComponent({name:'RiskMap3D'}).props('camera').beta).toBe(0);
 w.getComponent({name:'RiskMap3D'}).vm.$emit('cameraChange',{alpha:45,beta:80,distance:200,center:[0,0,0]});await click(w,'中国');expect(w.getComponent({name:'RiskMap3D'}).props('camera')).toMatchObject({alpha:55,beta:30,distance:180});
 w.getComponent({name:'RiskMap3D'}).vm.$emit('regionSelect','CN-31');expect(w.emitted('regionSelect')).toEqual([['CN-31','china']]);
 await click(w,'2D');await click(w,'3D');expect(w.getComponent({name:'RiskMap3D'}).props('camera').beta).toBe(30);
});

it('moves backdrop failures into the host status area without rendering overlay prose',async()=>{
 mock.available.mockReturnValue(false);const w=mount(RiskRegionMap,{props:{regions:[],backdrop:true},global:{stubs:{BaseChart:true}}});wrappers.push(w);await flushPromises();expect(w.find('select').exists()).toBe(false);expect(w.find('[role="status"]').exists()).toBe(false);expect(w.emitted('statusChange')?.at(-1)?.[0]).toEqual(expect.arrayContaining([expect.stringContaining('WebGL不可用')]));
});
