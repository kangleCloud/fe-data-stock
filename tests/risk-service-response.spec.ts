import { afterEach, expect, it } from "vitest";
import { AxiosHeaders } from "axios";
import { httpClient } from "@/utils/request";
import { getRiskDashboard, getRiskInterfaces, getRiskSources, getRiskExceptions } from "@/api/risk";
import { getGeoCities, getGeoSubdivisions } from "@/api/geoDrilldown";
import collector from "./fixtures/risk-collector-query.json";
import response from "./fixtures/risk-service-response.json";
const original = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = original; });
it("consumes the frozen Java Service projections with exact 499, unknown, source and city counts", async () => {
  httpClient.defaults.adapter = async config => {
    const key = `/admin/api${config.url}${config.url?.endsWith('/cities') ? '?provinceCode=CN-11' : config.url?.endsWith('/subdivisions') ? '?countryCode=US' : ''}`;
    const value = response[key as keyof typeof response];
    if (typeof value !== 'object' || !value) throw new Error('Missing frozen response');
    return { data: value, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config };
  };
  const query = { startDate: '2026-11-02', endDate: '2026-11-04', pageNum: 1, pageSize: 10 };
  const dashboard = await getRiskDashboard(query);
  expect(dashboard).toEqual(response['/admin/api/risk/dashboard'].content);
  expect(dashboard.metrics).toMatchObject({ requestCount: '12', successCount: '7', failureCount: '3', otherCount: '2', failureRate: '0.300000', sourceCount: '4' });
  expect((await getRiskInterfaces(query))).toEqual(response['/admin/api/risk/interfaces/page'].content);
  expect((await getRiskSources(query))).toEqual(response['/admin/api/risk/sources/page'].content);
  const failures = await getRiskExceptions(query);
  expect(failures).toEqual(response['/admin/api/risk/exceptions/page'].content);
  expect(failures.list.some(r => r.httpStatus === 499)).toBe(true);
  expect(await getGeoCities({ ...query, provinceCode: 'CN-11' })).toEqual(response['/admin/api/risk/geo/cities?provinceCode=CN-11'].content);
  expect(await getGeoSubdivisions({ ...query, countryCode: 'US' })).toEqual(response['/admin/api/risk/geo/subdivisions?countryCode=US'].content);
});

it("consumes actual Python Collector -> Java query output without losing unknowns or 499 failures", async () => {
  const mapping: Record<string, unknown> = { '/risk/dashboard': collector.dashboard, '/risk/interfaces/page': collector.interfaces, '/risk/sources/page': collector.sources, '/risk/exceptions/page': collector.exceptions, '/risk/geo/cities': collector.cities };
  httpClient.defaults.adapter = async config => ({ data: { success: true, code: 200, content: mapping[config.url!] }, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config });
  const query = { startDate: '2026-11-02', endDate: '2026-11-04', pageNum: 1, pageSize: 10 };
  const dashboard = await getRiskDashboard(query);
  expect(dashboard).toEqual(collector.dashboard);
  expect(dashboard.metrics).toEqual({ requestCount: '12', successCount: '7', failureCount: '3', otherCount: '2', failureRate: '0.300000', sourceCount: '4', interfaceCount: '2' });
  expect(dashboard.statuses.find(r => r.httpStatus === 499)?.requestCount).toBe('2');
  expect(dashboard.trend.map(r => r.minuteAt.slice(0, 10))).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  expect(await getRiskInterfaces(query)).toEqual(collector.interfaces);
  const sources = await getRiskSources(query); expect(sources).toEqual(collector.sources);
  expect(sources.list.filter(r => r.sourceIp !== null)).toHaveLength(4);
  expect(sources.list.some(r => r.sourceIp === null && r.otherCount === '1')).toBe(true);
  expect(await getRiskExceptions(query)).toEqual(collector.exceptions);
  const cities = await getGeoCities({ ...query, provinceCode: 'CN-11' }); expect(cities).toEqual(collector.cities);
  expect(cities.coverage.totalRequestCount).toBe('12'); expect(cities.identifiedRequestCount).toBe('9');
});
