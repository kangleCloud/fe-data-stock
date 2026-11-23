import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import Panel from '@/components/risk/RiskResourceStatus.vue';
import type { RiskResourceCurrent } from '@/types/riskMonitor';
it('shows placeholders for missing metrics without collection-error details', () => {
  const sample = { targetId:'1', collectorId:'c', sampledTime:'2026-11-20T11:26:45.369+08:00', status:'PARTIAL', freshness:'STALE', cpuPercent:null, memoryUsedBytes:null, memoryTotalBytes:null, diskUsedBytes:'1073741824', diskTotalBytes:'2147483648', networkReceiveBytesPerSecond:null, networkTransmitBytesPerSecond:null, load1:'0.83', uptimeSeconds:null, unavailableReasons:{cpu:'READ_FAILED'} } as RiskResourceCurrent;
  const w = mount(Panel, { props: { resources:[sample] } });
  expect(w.text()).toContain('已过期'); expect(w.text()).toContain('1.00 GiB / 2.00 GiB');
  expect(w.text()).toContain('— / —'); expect(w.text()).not.toContain('采集异常');
  expect(w.text()).not.toContain('READ_FAILED'); expect(w.text()).not.toContain('2026-11-20T');
});
