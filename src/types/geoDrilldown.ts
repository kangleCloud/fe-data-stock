/** Frozen GeoIP V1.2 query contract. */
export interface GeoCoverage { status: "NOT_COLLECTED" | "PARTIAL" | "COLLECTED"; startedAt: string | null; collectedRequestCount: string; totalRequestCount: string; uncollectedRequestCount: string }
export interface GeoBreakdown { coverage: GeoCoverage; collectedRequestCount: string; identifiedRequestCount: string; unknownRequestCount: string; coverageRate: string | null; items: { cityCode?: string | null; cityName?: string | null; provinceCode?: string | null; provinceName?: string | null; requestCount: string }[] }

export interface DashboardGeoCoverage { coverage: GeoCoverage; china: { collectedRequestCount: string; provinceIdentifiedRequestCount: string; unknownProvinceRequestCount: string; provinceCoverageRate: string | null }; foreign: { collectedRequestCount: string; subdivisionIdentifiedRequestCount: string; unknownSubdivisionRequestCount: string; subdivisionCoverageRate: string | null }; unknownCountryRequestCount: string }
