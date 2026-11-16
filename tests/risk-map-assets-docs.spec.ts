import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import riskDetailAssets from "@/data/riskDetailAssets.json";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("risk map asset documentation", () => {
  it("ends the Chinese asset guide with exactly one newline", () => {
    const text = read("docs/risk-map-assets.md");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("documents the verified HDX COD-AB source and CC BY-IGO license", () => {
    const text = read("public/maps/risk-detail-v2/LICENSES.md");
    expect(text).toContain("https://data.humdata.org/dataset/cod-ab-chn");
    expect(text).toContain("9e67ddf9-ce26-4b7a-82b1-51e5ca0714c8");
    expect(text).toContain("https://creativecommons.org/licenses/by/3.0/igo/legalcode");
    expect(text).toContain("CC BY-IGO 3.0");
    expect(text).toContain("f6a1f0fd969dbcc830e395c8211746730a80e8429585e045c6b0da92cd6e0ec9");
    expect(text).toContain("358 mainland ADM2 features");
    expect(text).toContain("343 coded features and 15 uncoded features");
  });

  it("does not retain the unlicensed DataV source in the asset guide", () => {
    const text = read("docs/risk-map-assets.md");
    expect(text).toContain("OCHA HDX");
    expect(text).toContain("CC BY-IGO 3.0");
    expect(text).not.toContain("DataV");
    expect(text).not.toContain("china-province-city-district-geojson");
    expect(text).not.toContain("risk-detail-v1");
  });

  it("keeps machine-readable HDX provenance and coverage in the manifest", () => {
    const source = riskDetailAssets.china.source;
    expect(source.resource).toContain("9e67ddf9-ce26-4b7a-82b1-51e5ca0714c8");
    expect(source.license).toContain("CC BY-IGO 3.0");
    expect(source.licenseUrl).toBe("https://creativecommons.org/licenses/by/3.0/igo/legalcode");
    expect(source.shpSha256).toHaveLength(64);
    expect(source.dbfSha256).toHaveLength(64);
    expect(source.prjSha256).toHaveLength(64);
    expect(source.coverage).toMatchObject({
      mainlandProvinces: 31,
      adm2Features: 358,
      codedFeatures: 343,
      uncodedFeatures: 15,
      citiesWithoutBoundary: 15,
    });
    expect(source.coverage?.uncoded).toHaveLength(15);
    expect(source.coverage?.citiesWithoutBoundaryList).toHaveLength(15);
  });
});
