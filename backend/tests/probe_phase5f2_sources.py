"""Bounded, repeatable live source verification. Never downloads bulk RDR data."""

from __future__ import annotations

import io
import hashlib
import json
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageStat

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.imagery_service import LUNASERV_WMS, _wms_getmap_png


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    cache = root / "data/cache/phase5f2_research"
    cache.mkdir(parents=True, exist_ok=True)
    evidence = root / "docs/screenshots/phase5f2"
    evidence.mkdir(parents=True, exist_ok=True)
    url = LUNASERV_WMS + "?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities"
    with urllib.request.urlopen(url, timeout=30) as response:
        xml = response.read(2_000_000)
    (cache / "capabilities.xml").write_bytes(xml)
    doc = ET.fromstring(xml)
    parent = doc.find("./Capability/Layer")
    targets = {"luna_wac_roi_south_summer", "luna_nac_2m_south_pole"}
    record = {"url": url, "version": doc.attrib["version"],
              "polar_crs": [el.text for el in parent.findall("SRS") if el.text == "IAU2000:30120"],
              "formats": [el.text for el in doc.findall("./Capability/Request/GetMap/Format")],
              "layers": [{"name": el.findtext("Name"), "title": el.findtext("Title"),
                          "abstract_sha256": hashlib.sha256((el.findtext("Abstract") or "").encode()).hexdigest(), "advertised_bbox": el.find("LatLonBoundingBox").attrib}
                         for el in parent.iter("Layer") if el.findtext("Name") in targets], "probes": []}
    jobs = [
        ("nac-shackleton-rim", "luna_nac_2m_south_pole", (-4500., -11500., -500., -7500.), 512),
        ("wac-same-rim", "luna_wac_roi_south_summer", (-4500., -11500., -500., -7500.), 512),
        ("nac-south-pole", "luna_nac_2m_south_pole", (-512., -512., 512., 512.), 512),
        ("nac-88s", "luna_nac_2m_south_pole", (-2000., 58000., 2000., 62000.), 256),
        ("nac-84s", "luna_nac_2m_south_pole", (-2000., 180000., 2000., 184000.), 256),
    ]
    for name, layer, bounds, edge in jobs:
        item = {"name": name, "layer": layer, "bounds_m": bounds, "size": [edge, edge]}
        started = time.perf_counter()
        try:
            data = _wms_getmap_png(layer, *bounds, edge, edge)
            (cache / f"{name}.png").write_bytes(data)
            with Image.open(io.BytesIO(data)) as image:
                rgba = image.convert("RGBA")
                alpha = rgba.getchannel("A")
                histogram = alpha.histogram()
                item.update(bytes=len(data), actual_size=image.size,
                            transparent_fraction=histogram[0] / (edge * edge),
                            stddev=ImageStat.Stat(rgba.convert("RGB")).stddev)
        except Exception as exc:
            item["error"] = str(exc)
        item["seconds"] = round(time.perf_counter() - started, 4)
        record["probes"].append(item)
        print(json.dumps(item), flush=True)
    (evidence / "wms-source-verification.json").write_text(json.dumps(record, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
