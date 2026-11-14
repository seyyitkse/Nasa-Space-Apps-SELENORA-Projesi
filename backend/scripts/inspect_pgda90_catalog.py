"""Inspect PGDA product 90 HTML for LDEM/LPSR asset URLs and reported sizes.

Does not download rasters — catalog research only.
"""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

UA = {"User-Agent": "SELENORA/0.4 research (NASA Space Apps)"}
PRODUCT_90 = "https://pgda.gsfc.nasa.gov/products/90"
TARGETS = [
    "LDEM_80S_80MPP_ADJ.TIF",
    "LDEM_80S_80MPP_ADJ_HILL.TIF",
    "LDSM_80S_80MPP_ADJ.TIF",
    "LPSR_80S_20MPP_ADJ.TIF",
]


def main() -> None:
    html = urllib.request.urlopen(
        urllib.request.Request(PRODUCT_90, headers=UA), timeout=90
    ).read().decode("utf-8", "replace")
    out = Path(__file__).resolve().parents[2] / "data" / "cache" / "pgda90_catalog_snip.txt"
    out.parent.mkdir(parents=True, exist_ok=True)

    links = sorted(set(re.findall(r'https?://[^"\'\s<>]+', html)))
    tif_links = [u for u in links if re.search(r"\.(tif|tiff|zip)(\?|$)", u, re.I)]
    print(f"page_bytes={len(html)} links={len(links)} tif_or_zip={len(tif_links)}")
    for u in tif_links[:80]:
        print("ASSET", u)

    for name in TARGETS:
        hits = [u for u in links if name.lower() in u.lower()] + (
            [name] if name.lower() in html.lower() else []
        )
        print(f"TARGET {name}: mentioned={name.lower() in html.lower()} urls={hits[:5]}")

    # HEAD selected absolute URLs if any match targets
    candidates = []
    for u in tif_links:
        for name in TARGETS:
            if name.split(".")[0].lower() in u.lower():
                candidates.append(u)
    for u in sorted(set(candidates))[:12]:
        try:
            req = urllib.request.Request(u, method="HEAD", headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                print(
                    "HEAD",
                    u,
                    r.status,
                    "len=",
                    r.headers.get("Content-Length"),
                    "accept_ranges=",
                    r.headers.get("Accept-Ranges"),
                    "type=",
                    r.headers.get("Content-Type"),
                )
        except Exception as exc:  # noqa: BLE001
            print("HEAD_ERR", u, type(exc).__name__, exc)

    # Keep a short text extract for the report (not full HTML).
    snip = []
    for line in html.splitlines():
        if any(t.split(".")[0] in line for t in TARGETS) or "80S" in line or "MPP" in line:
            snip.append(re.sub(r"<[^>]+>", " ", line).strip())
    out.write_text("\n".join(s for s in snip if s)[:20000], encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    main()
