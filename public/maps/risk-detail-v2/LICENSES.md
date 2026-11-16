# Bundled risk detail map data

Generated on 2026-11-16 from pinned upstream bytes. These files are derived
geometry, not hand-drawn or business-generated data. `manifest.json` records each
output file's SHA256, byte size and feature count.

## China city boundaries

- Dataset: China - Subnational Administrative Boundaries (COD-AB 2020),
  administrative level 2 (prefecture level).
- Publisher: OCHA Regional Office for Asia and the Pacific (ROAP), via the
  Humanitarian Data Exchange (HDX).
- Dataset page: https://data.humdata.org/dataset/cod-ab-chn
- Pinned resource: https://data.humdata.org/dataset/17a2aaa2-dea9-4a2e-8b3f-92d1bdfb850c/resource/9e67ddf9-ce26-4b7a-82b1-51e5ca0714c8/download/chn_adm_ocha_2020_shp.zip
- Dataset date: 2020-09-10. Resource last modified: 2020-09-10T09:00:06.531869.
- Resource SHA256: `f6a1f0fd969dbcc830e395c8211746730a80e8429585e045c6b0da92cd6e0ec9`.
- Used shapefile component SHA256:
  - `chn_admbnda_adm2_ocha_2020.shp`: `acb0881183eea5db5cf19597367eefd188b948d3d38962b3cc041656dbdb7dcd`
  - `chn_admbnda_adm2_ocha_2020.dbf`: `6fda17135a6b5651d8321b30f867ca8643ddd2b8024eae15d23f24c7ab27ad33`
  - `chn_admbnda_adm2_ocha_2020.prj`: `98aaf3d1c0ecadf1a424a4536de261c3daf4e373697cb86c40c43b989daf52eb`
- License: Creative Commons Attribution for Intergovernmental Organisations
  3.0 (CC BY-IGO 3.0).
  https://creativecommons.org/licenses/by/3.0/igo/legalcode
- Required attribution: China - Subnational Administrative Boundaries, OCHA
  Regional Office for Asia and the Pacific (ROAP), CC BY-IGO 3.0, via HDX.
  The bundled files are a modified derivative: boundaries were simplified,
  coordinates rounded, split into province files, and reconciled to the MCA
  2023 city dictionary as described below.
- Caveat documented by HDX: the boundaries were sourced from publicly available
  online sources rather than an official government source, and the dataset was
  reviewed for accuracy in October 2024. They are used for traffic statistics
  and geographic context only, not to determine political boundaries.

### Code reconciliation and coverage

- The source ADM2 collection contains 361 features. The three non-mainland ADM1
  features (Taiwan, Hong Kong and Macao) are excluded because this detail loader
  has no matching mainland province adcode. The bundled files contain the
  remaining 358 mainland ADM2 features across 31 province files.
- A six-digit city code is assigned only when both the ADM1 Chinese province name
  and the ADM2 Chinese name exactly match an entry in
  `src/data/geoAdministrativeCities.json` (MCA 2023 administrative divisions).
  Bracketed footnote markers are removed before comparison. No fuzzy matching,
  romanization, geometry guessing or P-code conversion is used. The OCHA P-codes
  are not six-digit adcodes and are therefore not used as codes.
- Result: 343 coded features and 15 uncoded features. Uncoded features keep
  `code: null`, render as boundaries without statistics, and are visible in the
  UI only as geography. The four direct-administered municipalities each have a
  single ADM2 feature that maps to their city-level adcode.
- Fifteen dictionary cities have no matching 2020 geometry. They are not
  invented or approximated: any backend statistics for them remain in the text
  "unplaced" list. These are the eleven Xinjiang province-direct cities created
  after 2020 plus `株洲市`, `文昌市`, `那曲市` and
  `海西蒙古族藏族自治州`, whose 2020 source names differ from the current
  dictionary names.
- Fifteen source features remain uncoded because they are not current
  prefecture-level entries in the dictionary: `莱芜市`, `神农架林区`,
  `那曲地区`, `海西蒙古族自治州`, `株州市`, and ten Hainan county-level
  features. They are retained as real geography but never receive statistics.

### Processing

- Douglas-Peucker simplification tolerance: 0.002 degrees.
- Coordinates rounded to five decimal places.
- Geometry is split into one file per mainland province, keyed by six-digit
  province adcode.
- `cp` is the planar centroid of the largest outer ring; `area` is the summed
  planar area of outer rings. Both are derived from the pinned source geometry
  and are used only for label placement and priority.

## World first-level subdivisions

- Dataset: Natural Earth 1:10m Admin-1 States and Provinces.
- Project: https://github.com/nvkelso/natural-earth-vector
- Fixed commit: `ca96624a56bd078437bca8184e78163e5039ad19`.
- Source URL: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_1_states_provinces.geojson
- Source SHA256: `22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5`
- Terms: https://www.naturalearthdata.com/about/terms-of-use/
- License: Public Domain. Made with Natural Earth.
- Usage: boundaries are grouped by `adm0_a3` and mapped to ISO2 only through the
  audited `src/data/riskMapAssets.json` country mapping. A feature receives a code
  only when its GeoNames `gn_a1_code` (for example `US.CA` -> `US-CA`) also exists
  in the backend's verified first-subdivisions dictionary. Duplicate codes are
  left null. Features without a verified code still render as boundaries but get
  no statistics. China uses the reviewed CN-XX province detail files above
  instead of Natural Earth admin-1 data.
- Processing: Douglas-Peucker tolerance 0.01 degrees; coordinates rounded to four
  decimal places. `name_zh` is used only when it contains Han characters;
  otherwise the original name is kept with `nameZh: false` and marked as an
  original name in the UI.

## Runtime

The browser fetches the selected province/country file, plus at most a small
bounded set of parent files whose real projected geometry is inside the current
2D or 3D viewport (six for China, eight for the world). At most two detail requests run
at once, duplicate parent codes are ignored, and failed assets are not retried
during the same page visit. Requests use the local application bundle with
`credentials: omit`, `referrerPolicy: no-referrer`, `redirect: error`, a
five-second timeout and a SHA256 check against `src/data/riskDetailAssets.json`.
There is no external runtime fallback for detail files: a missing or invalid file
keeps the parent map and text ranking. No application credentials, logs, tokens
or internal addresses are sent.
