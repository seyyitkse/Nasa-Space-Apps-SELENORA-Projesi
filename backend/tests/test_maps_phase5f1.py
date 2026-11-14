"""Deterministic regression tests; no test contacts NASA or changes the user DB."""

from __future__ import annotations

import io
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from urllib.parse import parse_qs, urlparse

import pytest
from PIL import Image

from app.science.lunar_projection import lonlat_to_stereo, stereo_to_lonlat
from app.services import imagery_service as imagery
from app.services import map_preview_cache as cache
from app.services import map_preview_service as service
from app.services.raster_preview_service import LayerUnavailableError, MapServiceError, PreviewMeta


def png(width=128, height=128, color=(0, 0, 0, 255)):
    out = io.BytesIO()
    Image.new("RGBA", (width, height), color).save(out, format="PNG")
    return out.getvalue()


def meta(bounds=(-1000., -1000., 1000., 1000.)):
    return PreviewMeta("lroc-wac-south-summer", "MAP_VISUALIZATION_ONLY", 128, 128,
                       bounds, 15.625, "wms_allowlisted", "NASA/GSFC/ASU", 0., 255., 0.)


@pytest.mark.parametrize("bounds", [
    (-30000., -26000., 18000., 6000.),  # original problematic viewport
    (-12000., -24000., 12000., -2000.),  # crosses geographic ±180°
    (-64000., -64000., 64000., 64000.),  # contains the south pole
])
def test_exact_polar_wms_bbox_without_degree_expansion(monkeypatch, bounds):
    captured = []
    width, height = cache.output_dimensions(bounds, 128)
    original = png(width, height)
    monkeypatch.setattr(imagery, "_http_get", lambda url: captured.append(url) or original)
    result, result_meta = imagery.render_imagery_preview(
        "lroc-wac-south-summer", bounds_m=bounds, max_edge_px=128,
    )
    params = parse_qs(urlparse(captured[0]).query)
    assert params["SRS"] == ["IAU2000:30120"]
    assert params["LAYERS"] == ["luna_wac_roi_south_summer"]
    assert params["FORMAT"] == ["image/png"]
    assert tuple(map(float, params["BBOX"][0].split(","))) == bounds
    assert result == original  # no resampling, invented data or alpha removal
    assert result_meta.bounds_m == bounds
    assert result_meta.nodata_fraction == 0  # black shadow is valid photographic data


def test_pixel_geometry_for_thin_window(monkeypatch):
    bounds = (-2000., -64000., 2000., 64000.)
    width, height = cache.output_dimensions(bounds, 768)
    assert (width, height) == (24, 768)
    monkeypatch.setattr(imagery, "_wms_getmap_png", lambda *args: png(width, height))
    _, result = imagery.render_imagery_preview("lroc-wac-south-summer", bounds_m=bounds, max_edge_px=768)
    assert (result.width_px, result.height_px) == (24, 768)


def test_rejects_wrong_dimensions_and_uncovered_source(monkeypatch):
    monkeypatch.setattr(imagery, "_wms_getmap_png", lambda *args: png(64, 64))
    with pytest.raises(LayerUnavailableError, match="dimensions"):
        imagery.render_imagery_preview("lroc-wac-south-summer", bounds_m=meta().bounds_m, max_edge_px=128)
    monkeypatch.setattr(imagery, "_wms_getmap_png", lambda *args: png(color=(0, 0, 0, 0)))
    with pytest.raises(LayerUnavailableError, match="coverage"):
        imagery.render_imagery_preview("lroc-wac-south-summer", bounds_m=meta().bounds_m, max_edge_px=128)


@pytest.mark.parametrize("bounds", [(0, 0, float("nan"), 100), (0, 0, float("inf"), 100), (1, 0, 0, 100)])
def test_bad_bounds_never_contact_upstream(monkeypatch, bounds):
    monkeypatch.setattr(imagery, "_http_get", lambda url: pytest.fail("invalid bounds contacted NASA"))
    with pytest.raises(MapServiceError):
        service.render_preview("lroc-wac-south-summer", bounds_m=bounds)


def test_cache_identity_includes_all_geospatial_parameters():
    spec = cache.cache_spec("lroc-wac-south-summer", meta().bounds_m, 128)
    for field, value in [("layer", "other"), ("crs", "other"), ("source", "next"),
                         ("processing_version", "next"), ("output_dimensions", (128, 64)),
                         ("bounds_m", [-1000.1, -1000., 1000., 1000.]), ("max_edge_px", 256)]:
        assert cache.cache_key({**spec, field: value}) != cache.cache_key(spec)


def test_persistent_hit_and_corruption_recovery():
    spec = cache.cache_spec("lroc-wac-south-summer", meta().bounds_m, 128)
    calls = []
    def render():
        calls.append(1)
        return png(), meta()
    first = cache.get_or_create(spec, render)
    assert first[1].cache_status == "MISS"
    assert cache.get_or_create(spec, render)[1].cache_status == "HIT"
    assert len(calls) == 1
    (cache.cache_dir() / f"{cache.cache_key(spec)}.png").write_bytes(b"corrupt")
    assert cache.get_or_create(spec, render)[1].cache_status == "MISS"
    assert len(calls) == 2


def test_concurrent_identical_requests_fetch_once():
    spec = cache.cache_spec("lroc-wac-south-summer", meta().bounds_m, 128)
    entered, release = threading.Event(), threading.Event()
    calls = []
    def render():
        calls.append(1)
        entered.set()
        assert release.wait(3)
        return png(), meta()
    with ThreadPoolExecutor(max_workers=4) as pool:
        first = pool.submit(cache.get_or_create, spec, render)
        assert entered.wait(3)
        rest = [pool.submit(cache.get_or_create, spec, render) for _ in range(3)]
        time.sleep(.03)
        release.set()
        results = [first.result(), *[future.result() for future in rest]]
    assert len(calls) == 1
    assert all(result[0] == results[0][0] for result in results)
    assert {result[1].cache_status for result in results} <= {"MISS", "COALESCED", "HIT"}


def test_failed_upstream_is_not_cached_and_retry_succeeds():
    spec = cache.cache_spec("lroc-wac-south-summer", meta().bounds_m, 128)
    def failure():
        raise LayerUnavailableError("upstream failed")
    with pytest.raises(LayerUnavailableError):
        cache.get_or_create(spec, failure)
    assert cache.read_cached(spec) is None
    assert cache.get_or_create(spec, lambda: (png(), meta()))[1].cache_status == "MISS"


def test_cached_metadata_keeps_clipped_bounds():
    spec = cache.cache_spec("lola-site04-5mpp-surf", (-5000., -5000., 5000., 5000.), 128)
    clipped = replace(meta(), bounds_m=(-1000., -1000., 1000., 1000.))
    cache.get_or_create(spec, lambda: (png(), clipped))
    assert cache.read_cached(spec)[1].bounds_m == clipped.bounds_m


def test_shackleton_control_point_and_antimeridian_orientation():
    center = lonlat_to_stereo(129.78, -89.67)
    assert center.x_m == pytest.approx(7690, abs=30)
    assert center.y_m == pytest.approx(-6403, abs=30)
    assert stereo_to_lonlat(0, 0)[1] == pytest.approx(-90)
    a = lonlat_to_stereo(179.999, -89)
    b = lonlat_to_stereo(-179.999, -89)
    assert a.x_m > 0 > b.x_m
    assert a.y_m == pytest.approx(b.y_m)


def test_api_cache_headers_and_failure(client, monkeypatch):
    monkeypatch.setattr(imagery, "_wms_getmap_png", lambda *args: png())
    params = dict(layer_id="lroc-wac-south-summer", left_m=-1000, bottom_m=-1000,
                  right_m=1000, top_m=1000, max_edge_px=128)
    first = client.get("/api/v1/maps/preview", params=params)
    assert first.status_code == 200
    assert first.headers["X-SELENORA-Cache"] == "MISS"
    assert first.headers["X-SELENORA-CRS"] == "IAU2000:30120"
    assert client.get("/api/v1/maps/preview", params=params).headers["X-SELENORA-Cache"] == "HIT"
    def fail(*args):
        raise LayerUnavailableError("simulated LROC outage")
    monkeypatch.setattr(imagery, "_wms_getmap_png", fail)
    params["left_m"] = -2000
    assert client.get("/api/v1/maps/preview", params=params).status_code == 503
