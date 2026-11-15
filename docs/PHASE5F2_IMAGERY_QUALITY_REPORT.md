# SELENORA Phase 5F.2 — Imagery quality and progressive loading

Tarih: 14–15 Kasım 2026. P0 kapsamı tamamlandı. NAC 1 m ve ShadowCam entegrasyonları kullanıcının son yönlendirmesiyle Phase 5F.3'e bırakıldı. Büyük raster arşivi indirilmedi; merge/push yapılmadı.

## Doğrulanmış taban ve çalışma alanı

- Taban: `feature/phase5f1-lroc-fix`, `cef848bc043c67d341d5fd8e9414a02467484f3f`. Önceki uygulama commit'i: `2731774dbd1406e23a17dcdb4245aa6b2ccebdde`.
- İzole worktree: `C:\Users\ahmet\.codex\worktrees\phase5f2\phase5f`.
- Branch: `feature/phase5f2-imagery-quality`.
- Uygulama commit'leri: `93de318` (piramidin kurulması), `c207031` (mobil panel/ilk boyama), `d824cbe3d5853a0454ce2605bc02eead5b05578c` (hazır LOLA ayrıntıları/istek azaltma).
- Phase 5F.1 worktree'si korunmuştur. Phase 6A `409a062` ve Phase 6B `c80002d` entegre edilmemiştir; bu worktree'lere yazılmamıştır. Phase 6C başlatılmamıştır.

Son backend ve production frontend `d824cbe` üzerinden başlatıldı. [Runtime kaydı](screenshots/phase5f2/runtime-final.json) worktree, branch, import anındaki commit, PID **143528**, `source_dirty=false` ve backend kaynak SHA-256 değerini içerir. Frontend aynı commit'i DOM `data-build` alanında bildirdi; [production ölçümünde](screenshots/phase5f2/13-production-cold-desktop.json) kayıtlıdır. Son kapanış commit'i rapor/kanıtlar ve launcher'ın hazır cache kullanımıyla ilgilidir.

Gerçek paket sürümü **0.1.0**'dır; tabandaki sürüm dosyası da bunu söylüyor. Önceki QA'daki `0.1.8` ifadesi bu tabanın sürüm kanıtı olarak kullanılmadı. Test edilen servisin kimliği sürüm etiketinden ziyade worktree/commit/kaynak hash'iyle doğrulandı. QA: `localhost:5195` → API `127.0.0.1:8044`; production preview: `localhost:5196` → aynı izole API. Mevcut başka sunuculara müdahale edilmedi.

## Kök nedenler

1. Phase 5F.1'in doğru projekte edilmiş 128 × 128 km rasterı daha büyük viewport'u kaplayamıyordu. Kutup görünümü düğmesi de tam 80°S görünümü yerine başlangıç odak enlemini kullanıyordu.
2. Başlangıç ve ayrıntı `ImageStatic` katmanlarının ayrı opaklıklarla üst üste çizilmesi kareleri belirginleştiriyordu. Sonlu extent'i genişletmek doğru bir çözüm değildi.
3. Değişen viewport BBOX'ları yeni cache anahtarları üretiyordu. Ayrıntı isteğinin yükleme/hata durumu, hazır genel görünümün durumunu eziyordu.
4. WAC'ın yaklaşık 100 m kaynak çözünürlüğü, 167 m başlangıç örneklemesi ve büyük pencere/512 px kısıtıyla daha da düşüyordu. Yakın zoom'da yalnızca WAC'ı büyütmek yeni ayrıntı sağlayamaz.

Phase 5F.1'in doğrudan kutupsal WMS yolu, projeksiyon düzeltmesi, kalıcı cache'i ve eski preview API'si korundu. 434° coğrafi pencere, antimeridyen düzeltme hilesi veya raster extent germe kullanılmadı.

## Seçilen mimari ve gerçek kapsam

Hazırlanmış küçük PNG'ler ile sabit metre ızgaralı tile piramidi birlikte kullanıldı. Birkaç büyük `ImageStatic` katmanı yerine her ürün için kalıcı bir OpenLayers `TileImage`/`TileLayer` vardır. OpenLayers'ın parent/interim tile çizimi, doğru clip sınırları ve LRU cache'i kullanılır. Hazır genel görünüm yeni ayrıntı yüklenirken kalır; tamamlanan çocuk tile'ların altında gereksiz parent çizimi sürdürülmez. Geri dönüş için cache'te tutulan parent, üst üste opak raster karesi olarak çizilmez.

Projeksiyon: `IAU2000:30120`, güney kutupsal stereografik; `lat_0=-90`, `lon_0=0`, `k=1`, Ay küresi `a=b=1737400 m`. Dünya penceresi **±768 km**, toplam **1536 × 1536 km**'dir. View bu pencerenin dışına taşmayacak şekilde sınırlandırılır. Bilimsel 80°S sınırı/işaretçilerin koordinat dönüşümü değiştirilmedi.

Tile kenarı WAC/LOLA için 240 px, NAC için 375 px; fiziksel kenar `768000 / 2^z` metredir. En büyük tek pencere 768 km olup mevcut 800 km API sınırının altındadır. WAC z5'te **100 m/px**, NAC z10'da **2 m/px**'e ulaşır; daha fazla kaynak ayrıntısı varmış gibi sunulmaz. Daha geniş görünümde gereksiz ince seviye yerine uygun kaba seviye seçilir.

Git'e eklenen hazır paket **44 PNG, toplam 2.545.840 byte**:

| Hazır görüntü | Adet | Örnekleme | Coğrafi pencere |
|---|---:|---:|---|
| WAC z0 | 4 | 3200 m/px | 1536 × 1536 km dünya penceresi |
| Merkez WAC z1 | 4 | 1600 m/px | 768 × 768 km |
| Merkez LOLA z1 | 4 | 1600 m/px | 768 × 768 km; gerçek kaynak maskesi korunur |
| Başlangıç WAC z5 | 20 | 100 m/px | x −48…48 km, y −72…48 km |
| Başlangıç WAC z4 | 6 | 200 m/px | x −48…48 km, y −96…48 km |
| Başlangıç LOLA z4 | 6 | 200 m/px | aynı başlangıç penceresi |

LOLA'nın pencere extent'i her pikselde veri olduğu anlamına gelmez: kaba dört tile'ın her birinde %37,3264 NoData vardır. Kaynak dışı alanlar şeffaftır. WAC genel görünüm PNG'lerinde alpha ile işaretlenen eksik veri bulunmadı. WAC kapsamı, normal viewport'un görüntüsüz ızgaraya açılmasını önler; LOLA kendi gerçek geçerli alanında fallback sağlar.

LOLA tile'ları gerçek NASA PGDA hillshade rasterından maskeli pencere okumalarıyla üretilir. Pencere başına percentile kontrastı yerine sabit DN 0–255 aktarımı kullanılır; böylece tile'lar farklı kontrastlarla dikiş üretmez. Siyah fotoğraf pikselleri geçerli gölgedir. Eksik kapsam yalnızca gerçek alpha/maskeden belirlenir; viewport kontrolü kısmi tile'ın başka yerdeki geçerli piksellerini de yanlışlıkla kapsam saymaz.

## Loading durumları ve kaynak yaşam döngüsü

`overviewReady`, ayrıntı `idle/loading/ready/failed`, `outsideLoaded`, `unavailable`, `fallback`, fotoğraf `none/partial/full` ve NAC durumu ayrı tutulur. Ayrıntı yüklenirken **“Yüksek çözünürlüklü görüntü hazırlanıyor.”** yazılır. Ayrıntı hatasında hazır genel görünüm korunur; tüm LROC altlığı kullanılamıyormuş gibi gösterilmez. Kapsamı olmayan NAC alanında WAC kalır ve kapsam yok mesajı görünür. Genel görünümün hazır olması ayrıntının da hazır olduğu şeklinde yorumlanmaz.

`useExplorerPreviews` tiled basemap için eski başlangıç/viewport preview isteklerini üretmez; bilimsel raster overlay'lerinin mevcut `RasterSourceSlot` yolu korunur. Source nesneleri React render'larında yeniden kurulmaz. Geçici blob URL'leri decode sonrasında bırakılır. Eski decode yanıtı yeni tile'ı değiştiremez; bunun için geri ziyaret yarışını sınayan regresyon testi eklendi. Harita kapanırken pending işler iptal edilir.

Pan/zoom 280 ms debounce ile ele alınır; artık gerekmeyen işler iptal edilir. İstemci en fazla dört, backend acquisition bölümü süreç başına üç işi eşzamanlı yürütür. OpenLayers'ın varsayılan 16 pending tile sınırının hazır parent'ları ayrıntıların arkasında bekletmesi de düzeltildi: OL kuyruğuna giriş genişletildi, gerçek HTTP sınırı özel loader'da tutuldu. Ürün başına LRU hedefi 96 tile'dır. Mobilde ek seçenekler açılır paneldedir; işaretçiler/fotoğraf için alan bırakılır.

## Kaynak doğrulaması ve bilimsel hizalama

[Canlı GetCapabilities](https://webmap.lroc.asu.edu/lunaserv/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities) WMS 1.1.1, PNG ve `IAU2000:30120` çıktı desteğini doğruladı. [Küçük canlı problar](screenshots/phase5f2/wms-source-verification.json) gerçek yanıt boyutlarını, alpha oranlarını ve sürelerini içerir. Servisin genel LatLon BBOX'u gerçek ürün kapsamı olarak kabul edilmedi; iç depolama CRS'si bu genel metadata'dan ayrıca çıkarılmadı.

- WAC: `luna_wac_roi_south_summer`, yaklaşık 100 m kaynak çözünürlüğü. [Resmî ürün](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER).
- NAC: **`luna_nac_2m_south_pole`**, ön 2009–2010 güney kutup mozaiği; kaynak örneklemesi 2 m. Shackleton çevresi ve kutup probları gerçek, ayrıntılı PNG döndürdü. Denenen 88°S/84°S kuzey yönü pencereleri tamamen şeffaftı. Servis açıklamasındaki yaklaşık mutlak konum doğruluğu 10–20 m'dir. Bu ürün kontrollü 1 m RDR ile aynı değildir.
- LOLA: NASA GSFC [PGDA Product 90](https://pgda.gsfc.nasa.gov/products/90), Barker et al. (2021), 80 m hillshade; yalnızca görselleştirme rolündedir.

NAC isteğe bağlıdır ve ≤32 m/pixel harita çözünürlüğünde açılır. Operasyonel istek alanı kutup çevresinde ±60 km ile sınırlıdır; bu kare tam NAC kapsamı vaadi değildir. Source alpha korunur ve tamamen şeffaf NAC tile'ları da cache'lenir. Arayüz doğal kaynak çözünürlüğünü ve kullanılan görüntü örneklemesini ayrı gösterir. NAC atıf metnindeki Unicode noktalamanın HTTP header üretimini bozması canlı testte yakalanıp giderildi; PNG/alpha değişmeden döner ve HTTP regresyon testi vardır.

Shackleton Rim Point A'nın korunmuş koordinatı `(-2347.488475, -9415.262017) m`'dir. [WAC/NAC karşılaştırmasında](screenshots/phase5f2/alignment-check.json) viewport center, bounds, çözünürlük ve boyut **birebir aynıdır**. Bu, yerleştirme tutarlılığının kontrolüdür; bağımsız jeodezik/subpixel doğruluk iddiası değildir. Referans noktaların `APPROXIMATE_REFERENCE` işaretleri korunmuştur. WAC ve NAC'ın aydınlık/gölgeleri farklı edinim zamanlarından gelebilir; fark yalnızca çözünürlüğe atfedilmez. Statik fotoğraf, görev tarihindeki aydınlatma olarak sunulmaz.

JPL Horizons, LOLA horizon/visibility motoru, true-north düzeltmesi, scoring ve UNKNOWN arazi sınıflandırması değiştirilmedi.

## Cache ve ölçülmüş performans

Eski 128 km preview cache anahtarları aynı kaldı. Yeni tile anahtarı layer, kesin metre bounds'u, CRS, çıktı boyutları, kaynak, ızgara ve `phase5f2-tiles-v1` işleme sürümünü kapsar. Disk kaydı atomiktir; checksum/boyut kontrolü ve aynı istek için süreç içi Future/süreçler arası lock korunur. Limit 256 kayıt ve 64 MiB PNG yüküdür; küçük başlangıç kayıtları pinlenir. Hatalı uzak yanıtlar cache'lenmez.

Deployment: `backend` içinden `python -m app.services.prepare_polar_overviews`. Bu komut repoyla gelen doğrulanmış 44 görüntüyü kalıcı cache'e aktarır. Monorepo/backend imajında `frontend/public/lunar-overview` bulunmalıdır; Vite build bu varlıkları frontend dist'e de taşır. `SELENORA_MAP_CACHE_DIR` kalıcı diske yönlendirilmelidir. Launcher artık bu hazır piramidi hazırlar; isteğe bağlı eski `prepare_map_previews` uzak hazırlığı normal açılışı bekletmez. Eski komut ve API kullanılabilir durumdadır.

Tarayıcı süreleri tekil yerel ölçümlerdir; istatistiksel benchmark değildir. `firstRasterMs` harita kurulumundan gerçek ilk boyamaya, `firstRasterNavMs` navigation başlangıcından ilk boyamaya ölçülür.

| Production senaryosu | Navigation → ilk görüntü | Harita → ilk görüntü |
|---|---:|---:|
| Yeni production origin, ilk masaüstü ziyaret | **581,3 ms** | **183,2 ms** |
| Masaüstü tekrar ziyaret | 642,0 ms | 236,8 ms |
| Mobil 375 px, hazırlanmış görüntüler | 510,8 ms | 134,6 ms |
| Kontrollü LROC kesintisi, gerçek LOLA fallback | 812,7 ms | 290,8 ms |

İlk production ziyaretindeki boyanan tüm görüntüler `BUNDLED` idi; başlangıç için uzak WMS isteği gerekmedi. Warm ziyaretin tek örnekte biraz daha yavaş çıkması gizlenmedi. [Cold](screenshots/phase5f2/13-production-cold-desktop.json), [warm](screenshots/phase5f2/14-production-warm-desktop.json), [mobil](screenshots/phase5f2/18-production-mobile.json), [fallback](screenshots/phase5f2/23-final-lroc-503-lola.json) kayıtları saklandı.

[Gerçek HTTP ölçümleri](screenshots/phase5f2/http-metrics.json), tarayıcı toplam açılışından ayrı olarak:

| İstek | Cold/MISS | Warm/HIT |
|---|---:|---:|
| Yeni WAC bölgesi, 240 px | 3,591 s | 0,0195 s |
| NAC doğal 2 m tile, 375 px | 9,269 s | 0,0131 s |
| Korunmuş 128 km preview | — | 0,0338 s; tekrar 0,00349 s |

Aynı uncached tile'a iki eşzamanlı istek 2,969 s'de `MISS` ve `COALESCED` döndü. Hazır kaba tile HIT'i 15,4 ms ölçüldü. Önceki Phase 5F.1'in 13,60 s cold / 0,305 s prepared ölçümleri farklı kapsamda olduğundan doğrudan bütün-harita hızlanma oranı hesaplanmadı.

İlk soğuk LOLA ayrıntı turunda son tile'ın istemcide **kuyruk dahil 84,7 s**'de tamamlanması gözlendi. Bu, tek upstream isteğin saf süresi değildir. Alınmış altı LOLA başlangıç tile'ı tekrar indirilmeden pakete kondu; başlangıç bu beklemeyi artık yaşamaz. Hazır alan dışındaki ilk NASA/PGDA erişimleri hâlâ yavaş olabilir; genel görünüm korunur ve hata/loading doğru gösterilir.

Bellek: ilk desktop görüntüsünde decoded tile tahmini 4.838.400 byte, canvas 2.455.808 byte; mobilde 4.608.000 ve 643.464 byte. Bunlar JS heap/RSS toplamı değildir. [Son API PID ölçümü](screenshots/phase5f2/backend-memory-final.json): working set 156.962.816 byte, peak 159.420.416 byte. Ara geliştirme turunda başka izole API sürecinde 373 MB peak de gözlendi; bunu son sürecin ölçümüyle karıştırmadık.

## Testler ve gerçek ekran kanıtları

| Kontrol | Sonuç |
|---|---|
| Backend `python -B -m pytest` | **143 passed, 1 skipped, 3 deselected**; standart `not live` seçimi |
| Frontend `npx vitest run` | **93 passed**, 16 dosya |
| TypeScript | `tsc -b` başarılı |
| Production build | Başarılı; mevcut 3D chunk >900 kB uyarısı sürüyor |
| Lint | Exit 0; 37 uyarı, hata yok |

[Backend logu](screenshots/phase5f2/backend-tests.log), [frontend logu](screenshots/phase5f2/frontend-tests.log), [build](screenshots/phase5f2/production-build.log), [lint](screenshots/phase5f2/lint.log). Testler yeni projeksiyon ızgarasını, parent/child sınırlarını, gerçek alpha altpenceresini, cache/negatif kapsam kaydını, offline bundle bütünlüğünü, geç decode yarışını, URL temizliğini ve retry'ı kapsar.

Gerçek Chromium tabanlı in-app tarayıcıda ilk Explorer, Polar Overview, overview → zoom-in → overview, hızlı pan/zoom, WAC, NAC doğal 2 m, Photo → Hillshade → Photo, cached/uncached yanıtlar, kontrollü WMS 503 ve ağ kesintisi, geniş desktop ve 375 px mobil denendi. Nominal 1920 px viewport'ta document 1910 px; nominal 375 px'te document 365 px idi. Mobil `scrollWidth == clientWidth` doğrulandı.

| Kanıt | İçerik |
|---|---|
| [Phase 5F.1 başlangıç ekranı](screenshots/phase5f1/14-final-desktop-photo.jpg) | Taban commit'te bulunan önceki gerçek ekran; yeni bir baseline test turu açılmadı |
| [13 — Production başlangıç](screenshots/phase5f2/13-production-cold-desktop.jpg) | Hazır 100 m WAC ve bilimsel işaretçiler |
| [15 — Geniş kutup](screenshots/phase5f2/15-production-polar-overview.jpg) | Yaklaşık 668 × 782 km viewport, fotoğraf kapsamı `full` |
| [16 — Aynı koordinatta WAC](screenshots/phase5f2/16-production-wac-high-zoom.jpg) / [17 — NAC](screenshots/phase5f2/17-production-nac-native-2m.jpg) | Aynı bounds/center; gerçek 100 m ve 2 m kaynakların sınırı |
| [18 — Mobil](screenshots/phase5f2/18-production-mobile.jpg) | Kompakt kontroller ve görünür işaretçiler |
| [19 — NAC kapsamı yok](screenshots/phase5f2/19-production-nac-no-coverage.jpg) | Malapert'te WAC'ın korunması |
| [20 — Geniş zoom/pan](screenshots/phase5f2/20-production-widest-pan.jpg) | Normal navigasyonda geniş görüntü |
| [22 — Mobil LOLA](screenshots/phase5f2/22-production-mobile-lola.jpg) | Hazır gerçek 200 m hillshade |
| [23 — LROC kesintisi](screenshots/phase5f2/23-final-lroc-503-lola.jpg) | Gerçek LOLA fallback ve doğru kaynak atfı |
| [24 — Ağ kesintisi](screenshots/phase5f2/24-final-network-failure.jpg) | Ayrıntı hatası; hazır WAC genel görünümü kaybolmuyor |

Kesintiler yalnızca QA harness'inde simüle edildi; işletim sistemi ağı veya üretim kodunda güvenlik ayarı değiştirilmedi. [API'nin gerçek 503 yanıtı](screenshots/phase5f2/remote-failure.json) kayıtlıdır. Kesinti bayrakları kapatıldı. Son kullanıcı yönlendirmesinden sonra yeni browser/NASA test turu açılmadı; tamamlanmış kanıtlar raporlandı.

## Değişen dosyalar

- Backend: `polar_tile_grid.py`, `polar_tile_service.py`, `prepare_polar_overviews.py`, `map_runtime.py`; `maps.py`, CORS expose header'ları, `imagery_service.py`, preview routing ve mevcut cache'in quota/pinning uzantıları.
- Frontend: `PolarBasemap.ts`, `polarTiles.ts`, `LunarMap.tsx`, `ExplorerPage.tsx`, `useExplorerPreviews.ts`, `BasemapControl.tsx`, TR/EN metinleri, build provenance ve Vite config.
- Varlıklar: `frontend/public/lunar-overview/` içindeki 44 gerçek NASA PNG'si, SHA/bounds/attribution manifesti ve README.
- Doğrulama: yeni backend/frontend regresyon testleri, küçük kaynak probe/HTTP ölçüm script'leri ve yalnız QA için fault harness.
- Dağıtım/kayıt: `start-selenora.bat`, bu rapor ve `docs/screenshots/phase5f2/` kanıtları.

## Phase 5F.3'e bırakılanlar ve sınırlar

**NAC 1 m:** [Resmî `NAC_POLE_SOUTH_CM_AVG`](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_POLE_SOUTH_CM_AVG) ürünü 84–90°S, 1 m/pixel, 40 polar stereografik tile'dır; kontrol ağı 85°S'e kadar uzanır. 1,5° enlem bantlarında 4/8/12/16 tile bulunur. PDS IMG, tam çözünürlüklü 8-bit GeoTIFF ve düşük çözünürlüklü PNG browse ürünleri belgelenmiştir. CRS merkezi 90°S/0°E, yarıçap 1.737.400 m'dir. Atıf: Archinal et al. (2023), LPSC 2333. [Metadata/HEAD kaydı](screenshots/phase5f2/nac1m-metadata.json).

Yalnızca küçük README ve HEAD sorguları alındı. Denenen composite-adı dosya URL'leri 404 verdi; bu sonuç ürünün yokluğu anlamına gelmez. Gerçek 40 dosyanın güncel envanteri/toplam indirme boyutu doğrulanmadığından büyük indirme yapılmadı. 84°S kapağının 1 m 8-bit geometrik alanı yaklaşık **104,2 GB sıkıştırılmamış piksel** ölçeğindedir; dikdörtgen tile boşlukları, maskeler, sıkıştırma, overviews ve geçici dönüşüm alanı gerçek disk ihtiyacını değiştirir. Bu sayı ölçülmüş arşiv boyutu değildir.

5F.3 önerisi: önce resmî envanter/label/GeoTIFF geotransform ve range desteği; sonra küçük bir ROI üzerinde gerçek CRS/NoData kontrolü. Sınırlı kaynak LRU'su (ör. 2 GB), 64 MiB türetilmiş tile cache'i, kontrollü geçici alan ve düşük disk alanında durma kuralıyla COG/VRT pencere servisi değerlendirilmelidir. Tam veri seti önceden indirilmemelidir. Kaynak lisans/yeniden dağıtım koşulları envanterle birlikte doğrulanmalı; metadata'da bulunmayan bir CC lisansı varsayılmamalıdır. NASA/GSFC/ASU ve ürün makalesi atıfları korunmalıdır. Performans hedefi ancak küçük ROI benchmark'ıyla doğrulanabilir.

**ShadowCam:** bu fazda başlanmadı; Phase 5F.3 kapsamında ayrı değerlendirilir. Hazır alan dışındaki cold WMS/PGDA gecikmesi, NAC'ın sınırlı kapsamı ve gerçek ürünlerin farklı statik aydınlatmaları devam eden doğal sınırlardır. Yeni genel görünüm bunları sahte piksel, uzatılmış extent veya değiştirilmiş bilimsel hesapla gizlemez.
