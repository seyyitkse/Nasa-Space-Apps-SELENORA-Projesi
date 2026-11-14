import io
from PIL import Image
from app.services import imagery_service


def test_nac_native_http_handles_unicode_attribution_and_alpha(client, monkeypatch):
    stream = io.BytesIO()
    Image.new('RGBA', (375, 375), (0, 0, 0, 0)).save(stream, 'PNG')
    monkeypatch.setattr(imagery_service, '_wms_getmap_png', lambda *args: stream.getvalue())
    response = client.get('/api/v1/maps/tiles/lroc-nac-2m-south-pole/10/1020/1036.png')
    assert response.status_code == 200
    assert response.content == stream.getvalue()
    assert response.headers['x-selenora-nodata'] == '1.0'
    assert response.headers['x-selenora-resolution-m'] == '2.0'
    assert 'NASA/GSFC/Arizona State University' in response.headers['x-selenora-attribution']
