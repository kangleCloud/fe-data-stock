"""Build the checksummed local dashboard maps from the three pinned inputs."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public/maps/risk-dashboard"
MANIFEST = ROOT / "src/data/riskMapAssets.json"
DATAV_URL = "https://datav.aliyun.com/portal/school/atlas/atlas_publish"
WORLD_URL = "https://github.com/datasets/geo-countries/blob/main/data/countries.geojson"
WORLD_BLOB = "0d4edb822d61e7cd0363e5540f0a886798b8360e"
INPUT_HASHES = {
    "china_boundary.geojson": "83ac502aeac66a5527607ec844169418505d990f1a2dc33226743643541eed3c",
    "china_provinces.geojson": "99adfeded5223848bbe37a0a12f8023e11ee12161c7800521c27db42fdeac275",
    "world_countries.geojson": "392a03db8aa3ba82c105852655620129b11182b95dfc34ef046827ea7d0e5b8c",
}
SPECIAL_PROVINCES = {"710000": "TW", "810000": "HK", "820000": "MO"}


def load(source_dir, file_name):
    raw = (source_dir / file_name).read_bytes()
    if hashlib.sha256(raw).hexdigest() != INPUT_HASHES[file_name]:
        raise ValueError(f"Input checksum does not match: {file_name}")
    return json.loads(raw)["features"]


def gcj02_to_wgs84(longitude, latitude):
    """Use the same approximation as the configured endpoint coordinate conversion."""
    if not (72.004 <= longitude <= 137.8347 and 0.8293 <= latitude <= 55.8271):
        return longitude, latitude
    x, y = longitude - 105, latitude - 35
    p = math.pi
    shared = (20 * math.sin(6 * x * p) + 20 * math.sin(2 * x * p)) * 2 / 3
    lat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    lat += shared + (20 * math.sin(y * p) + 40 * math.sin(y * p / 3)) * 2 / 3
    lat += (160 * math.sin(y * p / 12) + 320 * math.sin(y * p / 30)) * 2 / 3
    lng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    lng += shared + (20 * math.sin(x * p) + 40 * math.sin(x * p / 3)) * 2 / 3
    lng += (150 * math.sin(x * p / 12) + 300 * math.sin(x * p / 30)) * 2 / 3
    radians = latitude / 180 * p
    eccentricity = 0.006693421622965943
    magic = 1 - eccentricity * math.sin(radians) ** 2
    root = math.sqrt(magic)
    lat_delta = lat * 180 / (6378245 * (1 - eccentricity) / (magic * root) * p)
    lng_delta = lng * 180 / (6378245 / root * math.cos(radians) * p)
    return longitude - lng_delta, latitude - lat_delta


def ring_points(points, convert=None, precision=None):
    output = []
    for longitude, latitude, *_ in points:
        point = (longitude, latitude) if convert is None else convert(longitude, latitude)
        if precision is not None:
            point = tuple(round(value, precision) for value in point)
        if not output or point != output[-1]:
            output.append(point)
    if output[0] != output[-1]:
        output.append(output[0])
    return output


def polygons(geometry):
    coordinates = geometry["coordinates"]
    return [coordinates] if geometry["type"] == "Polygon" else coordinates


def crossing_anchors(features):
    # Hold shared junctions fixed. A shared edge between two junctions is simplified
    # in the same direction even when a neighbouring feature traces it in reverse.
    neighbours = {}
    junctions = set()
    for feature in features:
        for polygon in polygons(feature["geometry"]):
            for raw_ring in polygon:
                ring = ring_points(raw_ring)
                for index, point in enumerate(ring[:-1]):
                    before = ring[index - 1] if index else ring[-2]
                    after = ring[index + 1]
                    pair = tuple(sorted((before, after)))
                    if neighbours.setdefault(point, pair) != pair:
                        junctions.add(point)
                    if abs(point[0] - after[0]) > 180:
                        junctions.update((point, after))
    return junctions


def simplify_edge(points, tolerance):
    if len(points) <= 2:
        return range(len(points))
    reverse = points[0] > points[-1]
    canonical = points[::-1] if reverse else points
    keep = {0, len(canonical) - 1}
    intervals = [(0, len(canonical) - 1)]
    while intervals:
        start, end = intervals.pop()
        x, y = canonical[start]
        dx = canonical[end][0] - x
        dy = canonical[end][1] - y
        length = dx * dx + dy * dy
        best = tolerance * tolerance
        split = None
        for index in range(start + 1, end):
            px, py = canonical[index][0] - x, canonical[index][1] - y
            ratio = max(0, min(1, (px * dx + py * dy) / length)) if length else 0
            error = (px - ratio * dx) ** 2 + (py - ratio * dy) ** 2
            if error > best:
                best, split = error, index
        if split is not None:
            keep.add(split)
            intervals.extend(((start, split), (split, end)))
    return sorted(len(points) - 1 - index if reverse else index for index in keep)


def ring_area(ring):
    # Shift the origin to limit roundoff for islets with very small polygons.
    x, y = ring[0]
    return sum((a[0] - x) * (b[1] - y) - (b[0] - x) * (a[1] - y) for a, b in zip(ring, ring[1:]))


def crossing_segments(ring):
    def side(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    edges = sorted((min(a[0], b[0]), max(a[0], b[0]), min(a[1], b[1]), max(a[1], b[1]), index, a, b)
                   for index, (a, b) in enumerate(zip(ring, ring[1:])))
    active = []
    crossing = set()
    for left, right, bottom, top, index, a, b in edges:
        active = [edge for edge in active if edge[0] >= left]
        for _, low, high, other_index, c, d in active:
            if low < top and high > bottom and side(a, b, c) * side(a, b, d) < 0 and side(c, d, a) * side(c, d, b) < 0:
                crossing.update((index, other_index))
        active.append((right, bottom, top, index, a, b))
    return crossing


def simplify_ring(raw, junctions, tolerance):
    source = ring_points(raw)
    anchor_indices = [index for index, point in enumerate(source[:-1]) if point in junctions]
    if len(anchor_indices) < 2:
        indices = range(len(source) - 1)
        anchor_indices = sorted({*anchor_indices, min(indices, key=source.__getitem__), max(indices, key=source.__getitem__)})
    first = anchor_indices[0]
    source = source[first:-1] + source[:first + 1]
    boundaries = [index - first for index in anchor_indices] + [len(source) - 1]
    kept = {start + index for start, end in zip(boundaries, boundaries[1:])
            for index in simplify_edge(source[start:end + 1], tolerance)}
    area = ring_area(source)
    for _ in range(8):
        indices = sorted(kept)
        result = [source[index] for index in indices]
        if len(result) < 4 or ring_area(result) * area <= 0:
            return source
        crossing = crossing_segments(result)
        if not crossing:
            return result
        # Restore the affected source edges to remove crossings introduced by simplification.
        for index in crossing:
            kept.update(range(indices[index] + 1, indices[index + 1]))
        if len(kept) == len(indices):
            break
    return source


def output_geometry(source, transform_ring, minimum_area):
    components = polygons(source)
    if minimum_area > 0:
        areas = [abs(ring_area(polygon[0])) / 2 for polygon in components]
        largest = max(range(len(areas)), key=areas.__getitem__)
        components = [[polygon[0], *(hole for hole in polygon[1:] if abs(ring_area(hole)) / 2 >= minimum_area)]
                      for index, polygon in enumerate(components) if index == largest or areas[index] >= minimum_area]
    all_polygons = [[transform_ring(ring) for ring in polygon] for polygon in components]
    for polygon in all_polygons:
        for ring in polygon:
            if len(ring) < 4 or ring[0] != ring[-1] or not ring_area(ring):
                raise ValueError("Invalid output polygon ring")
            if any(not (-180 <= x <= 180 and -90 <= y <= 90) for x, y in ring):
                raise ValueError("Invalid output coordinate")
    return {"type": source["type"], "coordinates": all_polygons[0] if source["type"] == "Polygon" else all_polygons}


def make_asset(kind, file_name, rows, transform_ring, source_file, fallback=None, minimum_area=0):
    mapping = {}
    features = []
    seen_codes = set()
    for source, feature_id, source_code, code, label in rows:
        if feature_id in mapping or (code is not None and code in seen_codes):
            raise ValueError(f"Duplicate feature ID or region code: {feature_id}")
        seen_codes.add(code)
        mapping[feature_id] = {"code": code, "sourceCode": source_code, "label": label}
        features.append({
            "type": "Feature",
            "properties": {"id": feature_id, "sourceCode": source_code},
            "geometry": output_geometry(source["geometry"], transform_ring, minimum_area),
        })
    payload = (json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n").encode()
    china = source_file.startswith("china_")
    manifest = {
        "kind": kind,
        "repository": "DataV.GeoAtlas / Amap (inferred)" if china else "datasets/geo-countries",
        "commit": INPUT_HASHES[source_file] if china else WORLD_BLOB,
        "url": DATAV_URL if china else WORLD_URL,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bytes": len(payload),
        "features": len(features),
        "license": "Personal use authorized by repository owner" if china else "Public Domain / ODC-PDDL-1.0",
        "localPath": f"maps/risk-dashboard/{file_name}",
        "idProperty": "id",
        "codeProperty": "sourceCode",
        "coordinateSystem": "WGS84",
        "inputSha256": INPUT_HASHES[source_file],
        "externalFallback": False,
        "mapping": mapping,
    }
    if fallback is not None:
        manifest["fallback"] = fallback
    return manifest, payload


def generate(source_dir):
    existing = {asset["kind"]: asset for asset in json.loads(MANIFEST.read_bytes())}
    fallback = {kind: existing[kind].get("fallback", existing[kind]) for kind in ("china", "world")}
    china_labels = {row["code"]: row["label"] for row in fallback["china"]["mapping"].values() if row["code"]}
    world_labels = {row["code"]: row["label"] for row in fallback["world"]["mapping"].values() if row["code"]}
    provinces_file = "china_provinces.geojson"
    outline_file = "china_boundary.geojson"
    world_file = "world_countries.geojson"
    province_features = []
    for feature in load(source_dir, provinces_file):
        props = feature["properties"]
        adcode = str(props["adcode"])
        code = SPECIAL_PROVINCES.get(adcode, f"CN-{adcode[:2]}" if re.fullmatch(r"\d{2}0000", adcode) else None)
        if code not in china_labels:
            code = None
        label = china_labels.get(code, props["name"] or "未编码边界")
        province_features.append((feature, adcode, adcode, code, label))

    outline_features = [(f, str(f["properties"]["adcode"]), str(f["properties"]["adcode"]), None, "中国国界")
                        for f in load(source_dir, outline_file)]
    world = load(source_dir, world_file)
    junctions = crossing_anchors(world)
    world_features = []
    for index, feature in enumerate(world):
        props = feature["properties"]
        alpha2, alpha3 = props["ISO3166-1-Alpha-2"], props["ISO3166-1-Alpha-3"]
        code = alpha2 if re.fullmatch(r"[A-Z]{2}", alpha2) else "TW" if (alpha2, alpha3) == ("CN-TW", "TWN") else None
        world_features.append((feature, code or f"U{index:03}", alpha2, code, world_labels.get(code, props["name"])))
    backdrop_features = [(source, feature_id, alpha2, None, label)
                         for source, feature_id, alpha2, _, label in world_features]

    def china_ring(ring):
        return ring_points(ring, convert=gcj02_to_wgs84, precision=6)

    return [
        make_asset("china", "china-provinces.geojson", province_features, china_ring, provinces_file, fallback["china"]),
        make_asset("world", "world-interactive.geojson", world_features,
                   lambda ring: simplify_ring(ring, junctions, 0.025), world_file, fallback["world"], 0.002),
        make_asset("chinaOutline", "china-outline.geojson", outline_features, china_ring, outline_file),
        make_asset("worldBackdrop", "world-backdrop.geojson", backdrop_features,
                   lambda ring: simplify_ring(ring, junctions, 0.18), world_file, minimum_area=0.05),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT.parent / "map-resources")
    parser.add_argument("--check", action="store_true", help="Verify the generated assets without writing files")
    args = parser.parse_args()
    artifacts = generate(args.source_dir)
    manifests = [manifest for manifest, _ in artifacts]
    outputs = {ROOT / "public" / m["localPath"]: data for m, data in artifacts}
    outputs[MANIFEST] = (json.dumps(manifests, ensure_ascii=False, indent=2) + "\n").encode()
    if not args.check:
        ASSET_DIR.mkdir(exist_ok=True)
    for file, payload in outputs.items():
        if args.check:
            if file.read_bytes() != payload:
                raise ValueError(f"Generated file differs: {file.relative_to(ROOT)}")
        else:
            file.write_bytes(payload)
    for manifest in manifests:
        print(f"{manifest['kind']}: {manifest['features']} features, {manifest['bytes']} bytes, {manifest['sha256']}")


if __name__ == "__main__":
    main()
