import { mount } from "@vue/test-utils";
import { expect, it } from "vitest";
import Bars from "@/components/risk/RiskBars.vue";
import { riskBarWidths } from "@/utils/riskBars";
it("draws safe proportions including zero and preserves exact unsafe labels without bars", () => {
 expect(riskBarWidths(["0","5","10"])).toEqual([0,50,100]);
 expect(riskBarWidths(["1","9007199254740993"])).toEqual([null,null]);
 const w=mount(Bars,{props:{label:"排行",rows:[{key:"a",label:"北京",count:"9007199254740993"}]}});
 expect(w.text()).toContain("9,007,199,254,740,993");expect(w.find('.risk-bar-track').exists()).toBe(false);w.unmount();
});
it("provides a native keyboard-accessible selection button only for drillable rows", async()=>{
 const w=mount(Bars,{props:{label:"地域",rows:[{key:"CN-11",label:"北京",count:"9",selectable:true},{key:"UNKNOWN",label:"未知",count:"2"}]}});
 expect(w.findAll('button')).toHaveLength(1);await w.get('button').trigger('click');expect(w.emitted('select')).toEqual([["CN-11"]]);w.unmount();
});
