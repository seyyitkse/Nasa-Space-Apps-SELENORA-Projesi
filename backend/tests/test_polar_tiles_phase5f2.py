"""Geographic placement, genuine alpha, persistent/negative cache, bounded input."""
import io
import json
from unittest.mock import Mock

import numpy as np
import pytest
import rasterio
from PIL import Image
from rasterio.transform import from_origin

from app.services import polar_tile_service as tiles, map_preview_cache as cache
from app.services.polar_tile_grid import tile_spec, WAC_LAYER, NAC_LAYER
from app.services.raster_preview_service import MapServiceError


def test_grid_exact_children_and_native_resolution():
    parent, edge = tile_spec(WAC_LAYER, 0, 0, 0)
    assert parent == (-768000, 0, 0, 768000)
    assert tile_spec(WAC_LAYER, 1, 1, 1)[0] == (-384000, 0, 0, 384000)
    for layer, level, native in [(WAC_LAYER, 5, 100), (NAC_LAYER, 10, 2)]:
        bounds, edge = tile_spec(layer, level, 2 ** level, 2 ** level)
        assert (bounds[2] - bounds[0]) / edge == native


@pytest.mark.parametrize('args', [(WAC_LAYER, -1, 0, 0), (WAC_LAYER, 6, 0, 0), (WAC_LAYER, 0, 2, 0),
                                  (WAC_LAYER, 0, 0, -1), ('http://arbitrary', 0, 0, 0)])
def test_invalid_tiles_never_acquire(args, monkeypatch):
    monkeypatch.setattr(tiles.imagery_service, '_http_get', lambda *_: pytest.fail('invalid request reached upstream'))
    with pytest.raises(MapServiceError):
        tiles.render_tile(*args)


def test_nac_transparent_absence_is_cached_without_invented_pixels(monkeypatch):
    stream = io.BytesIO()
    Image.new('RGBA', (375, 375), (0, 0, 0, 0)).save(stream, 'PNG')
    acquire = Mock(return_value=stream.getvalue())
    monkeypatch.setattr(tiles.imagery_service, '_wms_getmap_png', acquire)
    first, meta = tiles.render_tile(NAC_LAYER, 8, 256, 256)
    again, warm = tiles.render_tile(NAC_LAYER, 8, 256, 256)
    assert meta.nodata_fraction == 1 and warm.cache_status == 'HIT'
    assert first == again == stream.getvalue() and acquire.call_count == 1
    assert cache.cache_key(tiles.tile_cache_spec(NAC_LAYER, 8, 256, 256)) != cache.cache_key(cache.cache_spec(NAC_LAYER, meta.bounds_m, 375))


def test_hill_tiles_keep_fixed_radiometry_and_transparent_geographic_absence(tmp_path, monkeypatch):
    path = tmp_path / 'genuine-raster-fixture.tif'
    with rasterio.open(path, 'w', driver='GTiff', height=8, width=8, count=1, dtype='float32',
                       transform=from_origin(0, 8, 1, 1), crs='+proj=stere +lat_0=-90 +a=1737400 +b=1737400', nodata=-9999) as ds:
        ds.write(np.full((8, 8), 123, dtype='float32'), 1)
    monkeypatch.setattr(tiles.raster_preview_service, '_open_path_for_layer', lambda _: str(path))
    png, meta = tiles._hill_tile((-4, 0, 4, 8), 8)
    rgba = np.asarray(Image.open(io.BytesIO(png)))
    assert meta.bounds_m == (-4, 0, 4, 8)
    assert np.all(rgba[:, :4, 3] == 0) and np.all(rgba[:, 4:, 3] == 255)
    assert np.all(rgba[:, 4:, :3] == 123)


def test_shipped_overviews_integrity_and_offline_http(client, monkeypatch):
    manifest = json.loads((tiles.BUNDLE / 'manifest.json').read_text())
    monkeypatch.setattr(tiles.imagery_service, '_http_get', lambda *_: pytest.fail('prepared overview contacted NASA'))
    for key in manifest['tiles']:
        layer, z, x, y = key.split('/')
        spec = tiles.tile_cache_spec(layer, int(z), int(x), int(y))
        assert tiles._bundled(layer, int(z), int(x), int(y), spec) is not None
    response = client.get(f'/api/v1/maps/tiles/{WAC_LAYER}/0/0/0.png')
    assert response.status_code == 200 and response.headers['x-selenora-crs'] == 'IAU2000:30120'
    assert response.headers['x-selenora-bounds-m'] == '-768000.0,0.0,0.0,768000.0'
    assert client.get(f'/api/v1/maps/tiles/{WAC_LAYER}/0/0/0.png').headers['x-selenora-cache'] == 'HIT'
    provenance = client.get('/api/v1/maps/runtime').json()
    assert provenance['phase'] == '5F.2' and provenance['package_version'] == '0.1.0'
