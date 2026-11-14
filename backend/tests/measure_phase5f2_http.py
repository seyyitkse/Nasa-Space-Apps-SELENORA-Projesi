"""Small real HTTP measurements, isolated QA server; no bulk imagery."""
import concurrent.futures
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


def get(name, route):
    started = time.perf_counter()
    record = dict(scenario=name, route=route)
    try:
      with urllib.request.urlopen('http://127.0.0.1:8044' + route, timeout=120) as response:
        png = response.read()
        record.update(status=response.status, bytes=len(png),
                      cache=response.headers.get('X-SELENORA-Cache'), crs=response.headers.get('X-SELENORA-CRS'),
                      bounds=response.headers.get('X-SELENORA-Bounds-M'), key=response.headers.get('X-SELENORA-Cache-Key'),
                      seconds=round(time.perf_counter()-started, 5))
    except Exception as exc:
      record.update(error=str(exc), seconds=round(time.perf_counter()-started, 5))
    print(json.dumps(record), flush=True)
    return record


if __name__ == '__main__':
    wac = '/api/v1/maps/tiles/lroc-wac-south-summer/'
    nac = '/api/v1/maps/tiles/lroc-nac-2m-south-pole/'
    records = [get('prepared-overview-import', wac+'0/0/0.png'), get('prepared-overview-hit', wac+'0/0/0.png'),
               get('new-region-cold', wac+'5/42/40.png'), get('new-region-warm', wac+'5/42/40.png'),
               get('NAC-native-2m-cold', nac+'10/1021/1036.png'), get('NAC-native-2m-warm', nac+'10/1021/1036.png')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        records += list(pool.map(lambda n: get(f'concurrent-{n}', wac+'5/40/41.png'), range(2)))
    query = urllib.parse.urlencode(dict(layer_id='lroc-wac-south-summer', left_m=-64000, bottom_m=-64000, right_m=64000, top_m=64000, max_edge_px=768))
    records += [get('legacy-prepared-128km', '/api/v1/maps/preview?'+query), get('legacy-prepared-128km-repeat', '/api/v1/maps/preview?'+query)]
    (Path(__file__).resolve().parents[2]/'docs/screenshots/phase5f2/http-metrics.json').write_text(json.dumps(records,indent=2))
