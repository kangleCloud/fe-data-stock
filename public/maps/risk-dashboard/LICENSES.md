# Risk dashboard map sources

The four bundled GeoJSON files are display derivatives. The repository's MIT license applies to its code. The datasets have the origins and use terms recorded below.

## China outline and provinces

The project owner supplied `china_boundary.geojson` and `china_provinces.geojson` and confirmed their use in the personal repository. Their field layout matches DataV.GeoAtlas and the supplied files omit CRS metadata. The original GCJ-02 interpretation follows the DataV/Amap documentation. The derived files use approximate WGS84 longitude and latitude, rounded to six decimals. This attribution records the project's personal use scope and the source inference. [DataV.GeoAtlas source and use notice](https://datav.aliyun.com/portal/school/atlas/atlas_publish) · [DataV coordinate system documentation](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/map-data-format-1)

| Input | SHA-256 |
| --- | --- |
| `china_boundary.geojson` | `83ac502aeac66a5527607ec844169418505d990f1a2dc33226743643541eed3c` |
| `china_provinces.geojson` | `99adfeded5223848bbe37a0a12f8023e11ee12161c7800521c27db42fdeac275` |

## World polygons

Made with Natural Earth 1:10m Admin-0 Countries, distributed by `datasets/geo-countries` under ODC PDDL 1.0. The supplied CRS84 `world_countries.geojson` matches upstream Git blob `0d4edb822d61e7cd0363e5540f0a886798b8360e` and SHA-256 `392a03db8aa3ba82c105852655620129b11182b95dfc34ef046827ea7d0e5b8c`. The background and interactive versions simplify the same source with different tolerances. Both retain all 258 features, preserve shared junctions during simplification, and omit small secondary polygons and holes at their respective scales. [Dataset and license](https://github.com/datasets/geo-countries#license) · [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/)

`src/data/riskMapAssets.json` records derivative byte lengths, feature counts, SHA-256 hashes and region mappings. Boundaries are used to display aggregate request statistics.
