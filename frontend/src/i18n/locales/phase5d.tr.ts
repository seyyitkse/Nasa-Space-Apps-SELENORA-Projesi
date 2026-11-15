import type phase5dEn from './phase5d.en'

const phase5dTr: typeof phase5dEn = {
  imageryQuality: {
    options: 'Görüntü seçenekleri',
    sampled: 'Görünüm: {{resolution}} m/px',
    overview: 'Kutupsal genel görünüm hazır.', starting: 'NASA taban haritası hazırlanıyor.',
    detailLoading: 'Yüksek çözünürlüklü görüntü hazırlanıyor.', detailReady: 'Görünüm ayrıntısı hazır',
    detailFailed: 'Ayrıntı alınamadı. Kullanılabilir genel görünüm korunuyor.',
    outside: 'Bu görünüm yüklü görüntünün dışında. Kullanılabilir kapsam isteniyor.',
    unavailable: 'Bu görünümde geçerli görüntü yok. Yeniden deneyin veya Kutupsal Genel Görünüm’e dönün.',
    fallback: 'Yüklü fotoğraf olmayan alanlarda gerçek LOLA hillshade gösteriliyor.',
    nacOption: 'NAC 2 m · isteğe bağlı ayrıntı', 'nac_zoom-in': 'NAC ayrıntısı için yakınlaştırın.',
    nac_loading: 'NAC ayrıntısı hazırlanıyor; WAC görünür kalıyor.', nac_ready: 'Ön NAC mozaiği · doğal 2 m/px. NASA/GSFC/ASU.',
    'nac_no-coverage': 'Burada NAC kapsamı yok; WAC görünür kalıyor.', nac_failed: 'NAC servisine erişilemiyor; WAC görünür kalıyor.', nac_off: '',
  },
  mode: {
    label: 'Arayüz modu',
    explorer: 'Kaşif',
    scientist: 'Bilim insanı',
    explorerHint: 'Kaşif Modu: rehberli, önce anlaşılır sonuçlar. Aynı doğrulanmış veri.',
    scientistHint: 'Bilim İnsanı Modu: tüm kontroller, metrikler ve veri kökeni açık.',
    advancedHint: 'Aynı doğrulanmış sayılar. Metrikler, grafikler ve bilimsel sınırlamalar için genişletin.',
    scientificDetails: 'Bilimsel ayrıntılar',
  },
  home5d: {
    startGuided: 'Rehberli göreve başla',
    tenSecTitle: '10 saniyede SELENORA',
    s1: { title: 'İki iniş noktası seçin', body: 'Ay’ın güney kutbu yakınındaki aday noktaları seçin. Koordinat gerekmez.' },
    s2: {
      title: 'Güneş ve Dünya’yı ufkun üzerinde görün',
      body: 'Gerçek NASA/JPL konumları ve NASA LOLA arazisi, her noktanın ne zaman güneş ışığı ve Dünya’ya görüş hattı aldığını gösterir.',
    },
    s3: {
      title: 'Neyin kesin olduğunu bilin',
      body: 'Her sonuç, verinin gösterdiğini hâlâ bilinmeyenden ayırır ve bir noktanın neden önerilmeyebileceğini açıklar.',
    },
    modeNote: 'Kaşif Modu açık: önce açıklamalar, ayrıntılar istendiğinde. Tüm kontroller için üst çubuktan Bilim İnsanı Moduna geçin.',
  },
  glossary: {
    aria: '“{{term}}” ne demek?',
    ephemeris: {
      term: 'efemeris',
      def: 'Güneş ve Dünya’nın belirli zamanlarda gökyüzünde nerede göründüğünü veren tablo. SELENORA her nokta için NASA/JPL Horizons’tan alır.',
    },
    horizon: {
      term: '0° ufuk',
      def: 'Pürüzsüz bir Ay’ın düz, geometrik ufku. Gerçek tepeler bunun üzerinde kalıp görüşü kapatabilir.',
    },
    elevation: {
      term: 'yükseklik açısı',
      def: 'Bir cismin ufkun ne kadar üzerinde olduğu (derece). 0° ufuk çizgisi; eksi değer ufkun altı demektir.',
    },
    azimuth: {
      term: 'azimut',
      def: 'Gerçek kuzeyden saat yönünde pusula yönü (0° kuzey, 90° doğu, 180° güney, 270° batı).',
    },
    dem: {
      term: 'LOLA arazisi (DEM)',
      def: 'Sayısal yükselti modeli: NASA’nın Ay Yörünge Lazer Altimetresi ile ölçülmüş zemin yükseklikleri ızgarası. SELENORA güney kutbunda 5 metrelik karolar kullanır.',
    },
    terrainBlocked: {
      term: 'arazi engelli',
      def: 'Güneş veya Dünya 0° ufkun üzerinde, ancak yakındaki tepeler veya krater duvarları daha yüksek ve onu gizliyor.',
    },
    unknown: {
      term: 'BİLİNMİYOR',
      def: 'Veri o an için karar veremiyor (ör. arazi haritası yeterince uzağa ulaşmıyor). Bilinmeyen asla görünür sayılmaz.',
    },
    partialTerrain: {
      term: 'kısmi arazi',
      def: '5 m arazi karoları çevrenin 12 km’ye kadar yalnızca bir kısmını kapsıyor; uzaktaki bir sırt atlanabilir. SELENORA bu durumda nokta önermez.',
    },
    directToEarth: {
      term: 'doğrudan Dünya',
      def: 'Dünya yerel ufkun üzerinde; düz bir görüş hattı var. Bu tek başına çalışan bir radyo bağlantısını garanti etmez.',
    },
    joint: {
      term: 'ortak görünürlük',
      def: 'Güneş VE Dünya’nın birlikte göründüğü anlar: aynı anda enerji ve doğrudan iletişim.',
    },
    score: {
      term: 'görev puanı',
      def: 'Güneş, Dünya ve ortak görünürlük yüzdelerinin ağırlıklı ortalaması. Karşılaştırma aracıdır, NASA güvenlik puanı değildir.',
    },
    sampledEpoch: {
      term: 'örneklenmiş an',
      def: 'Konumların gerçekten hesaplandığı zaman (ör. 60 dakikada bir). SELENORA aradaki değerleri asla uydurmaz.',
    },
    exaggeration: {
      term: 'dikey abartma',
      def: 'Kabartmayı görmek için yükseklikler büyütülür. ×1 gerçek ölçektir. Görüş çizgileri de aynı şekilde büyütülür, böylece neyin neyi engellediği değişmez.',
    },
  },
  guided: {
    eyebrow: 'Kaşif Modu · rehberli',
    title: 'Rehberli görev',
    description: 'NASA/JPL verisinden hesaplanan gerçek bir analize dört kısa adım. Koordinat veya formül gerekmez.',
    stepsAria: 'Rehberli görev adımları',
    step: { objective: 'Hedef', sites: 'Noktalar', date: 'Tarih', run: 'Çalıştır' },
    objectiveQ: 'Göreviniz için en önemli olan ne?',
    presetNote: 'Bunlar SELENORA eğitim ön ayarlarıdır, NASA onaylı görev profilleri değildir. Yalnızca aynı doğrulanmış sonuçların nasıl ağırlıklandırılacağını değiştirir.',
    objective: {
      sunlight: { title: 'Güneş ışığı', body: 'Güneş enerjisi ve ısı: Güneş’in en sık ufkun üzerinde olduğu noktaları öne çıkarır.' },
      earth: { title: 'Doğrudan Dünya', body: 'İletişim: Dünya’ya en sık görüş hattı olan noktaları öne çıkarır.' },
      balanced: { title: 'Dengeli', body: 'Güneş ışığı ve Dünya görünürlüğünü eşit tartar; ikisinin birlikte göründüğü süreyi de ekler.' },
    },
    sitesQ: 'Karşılaştırmak için iki araştırma noktası seçin',
    sitesNote: 'İki kart seçin. Koordinatlar yayımlanmış çalışmalardaki yaklaşık referans noktalarıdır. “5 m arazi”, yerel NASA LOLA tepelerinin dahil edilebileceği anlamına gelir.',
    siteNotes: {
      'shackleton-rim-a': 'Shackleton kraterinin kenarında literatür noktası. 5 m arazi kontrolümüz yakında Güneş’i gizleyebilecek daha yüksek zemin buluyor.',
      'connecting-ridge-b': 'Shackleton ile de Gerlache kraterleri arasındaki sırt; uzun güneşlenme için sıkça anılır.',
      'shackleton-floor': 'Shackleton krateri tabanı: karanlık olması beklenen karşılaştırma örneği.',
      'bussey-2010-point-c': 'de Gerlache kenarında literatür noktası.',
      'bussey-2010-point-d': 'Shackleton sırtında, 2020 haritasında en çok aydınlananlar arasında bildirilen literatür noktası.',
      'de-gerlache': 'de Gerlache kraterinin merkezi.',
      'malapert-massif': 'Güney kutbunun Dünya’ya bakan yüzündeki dağ.',
      nobile: 'Büyük Nobile kraterinin merkezi.',
    },
    has5m: '5 m arazi',
    dateQ: 'Görev ne zaman yapılsın?',
    dateMode: {
      example: { title: 'Doğrulanmış örnek kullan', body: 'Bu iki nokta için gerçek NASA/JPL verisiyle önceden hesaplanmış kayıtlı bir analizi yükle. Anında.' },
      custom: { title: 'Kendi tarihlerimi seç', body: 'Canlı NASA/JPL Horizons verisinden yeni analiz hesapla (en fazla 7 gün, saatlik). Bir dakikayı bulabilir.' },
    },
    noExample: 'Henüz tam olarak bu iki noktayı karşılaştıran kayıtlı analiz yok. Hesaplamak için “kendi tarihlerim”i seçin.',
    exampleLabel: 'Örnek: {{date}} tarihinde kaydedilen analiz',
    startDate: 'Başlangıç tarihi (UTC)',
    days: 'Gün (1–{{max}})',
    includeTerrain: '5 m araziyi dahil et',
    terrainHelp:
      'NASA LOLA karolarından yakın tepeleri ekler. Yalnızca iki nokta da yerel 5 m karoların içindeyse mümkündür. Sonuçlar KISMİ olabilir; bu durumda nokta önerilmez.',
    terrainAvailable: 'İki noktada da 5 m arazi var.',
    terrainUnavailable: 'İki noktada da 5 m arazi gerekir.',
    reviewTitle: 'Hazır',
    reviewExample: 'Kayıtlı, doğrulanmış örnek',
    reviewCustom: '{{start}} itibarıyla {{days}} gün, saatlik, {{model}}',
    reviewNote: 'Güneş ve Dünya konumları NASA/JPL’den gelir',
    loadExample: 'Örnek sonuçları göster',
    runReal: 'Gerçek analizi çalıştır',
    running: 'NASA/JPL verisiyle hesaplanıyor…',
    back: 'Geri',
    next: 'İleri',
    missionName: 'Rehberli: {{a}} - {{b}}',
    resultsTitle: 'Görev sonuçlarınız',
    resultsDesc: 'Önce anlaşılır özet. Aşağıdaki her sayı kayıtlı backend analizinden gelir.',
    startOver: 'Yeni rehberli görev',
    sourceHelpLabel: 'Bu sonuçlar nereden geliyor?',
    sourceHelp:
      'Güneş ve Dünya konumları: NASA/JPL Horizons, saatte bir değer. Arazi (dahil edildiyse): NASA LOLA 5 m karoları. Hesaplamalar SELENORA sunucusunda yapılır; buradaki metin yalnızca açıklar.',
    timelineTitle: 'Güneş ve Dünya ne zaman görünürdü?',
    timelineHelp1: 'Her satır bir nokta. Renkli = görünür. Kırmızı =',
    timelineHelpStriped: 'Taralı =',
    timelineHelp2: 'Gri = ufkun altında.',
    openSimulator: 'Güneş ve Dünya’yı izle',
    open3d: '3D araziyi gör',
    openDetails: 'Bilimsel ayrıntılar',
    whatWeKnow: 'Verinin gösterdiği',
    whatIsUncertain: 'Belirsiz kalan',
    verdict: {
      recommended: 'Hedefinize en uygun: {{site}}',
      tie: 'Tek bir kazanan yok: noktaların puanı aynı.',
      refused: 'Bu analiz için nokta önerilmiyor',
      storedWhy: 'SELENORA karşılaştırma puanında {{margin}} puan önde. Bu puan bir planlama aracıdır, NASA güvenlik derecesi değildir.',
      reweightedWhy:
        'Kayıtlı yüzdeler hedefinize göre ağırlıklandırıldığında (sunucuyla aynı formül) {{margin}} puan önde. Bu puan bir planlama aracıdır, güvenlik derecesi değildir.',
      tieWhy: 'Puanlar eşit olduğundan SELENORA birini seçmez.',
      refusedWhy: {
        partial_terrain:
          '5 m arazi karoları her noktanın çevresinin yalnızca bir kısmını kapsıyor; uzaktaki bir sırt cevabı değiştirebilir. Nokta önermek, verinin desteklediğinden fazla kesinlik iddia etmek olurdu.',
        partial: 'Bazı NASA/JPL örnekleri eksik; sıralama güvenilir olmaz.',
        unavailable: 'Gerekli veri yok.',
        unscored: 'En az bir nokta puanlanamadı; adil karşılaştırma mümkün değil.',
      },
    },
    established: {
      sun: 'Kontrol edebildiğimiz anların %{{pct}} kadarında Güneş ufkun üzerindeydi.',
      earth: 'Dünya bunların %{{pct}} kadarında ufkun üzerindeydi (doğrudan görüş hattı).',
      joint: 'İkisi %{{pct}} oranında aynı anda görünürdü.',
      darkness: 'Güneşsiz en uzun süre: {{hours}} saat.',
      gap: 'Dünya’nın görünmediği en uzun süre: {{hours}} saat.',
      terrainBlocksSunAll:
        'Pürüzsüz bir Ay’da Güneş burada zamanın %{{geo}} kadarında ufkun üzerinde olurdu; ancak bu noktada yakındaki arazi daha yüksek ve onu sürekli gizliyor.',
      terrainReducesSun: 'Yakındaki arazi güneş ışığını %{{geo}} (pürüzsüz Ay) değerinden %{{terrain}} değerine düşürüyor.',
    },
    uncertain: {
      unknownHours: '{{hours}} saat boyunca arazi verisi karar veremedi; bu saatler BİLİNMİYOR olarak kalır ve görünür sayılmaz.',
      partialCoverage: '5 m arazi yönlerin yalnızca %{{pct}} kadarında tam {{km}} km’ye ulaşıyor; daha uzak bir sırt atlanabilir.',
      perEpochDerived:
        'An an arazi durumları henüz sunucu tarafından verilmiyor; zaman çizelgesindeki bazı anlar “görünür veya bilinmiyor” olarak gösteriliyor.',
      noTerrain: 'Yerel tepeler dahil edilmedi (pürüzsüz Ay ufku). Gerçek arazi bazı anlarda Güneş’i veya Dünya’yı engelleyebilir.',
    },
    general: {
      earthLink: 'Dünya’nın ufkun üzerinde olması görüş hattı demektir, garantili radyo bağlantısı değil.',
      heuristic: 'SELENORA bir araştırma ve eğitim aracıdır, sertifikalı bir iniş güvenliği sistemi değildir.',
      synthetic: 'Bu SENTETİK demo verisidir, NASA/JPL sonucu değildir.',
      approxCoords: 'Nokta koordinatları yaklaşık referanslardır; birkaç yüz metre kaymak arazi sonuçlarını değiştirebilir.',
    },
  },
  sim5d: {
    howTitle: 'Bu sayfa nasıl okunur',
    how1a: 'Her sütun noktanın üzerindeki gökyüzüdür. Kesikli kırmızı çizgi',
    how1b: '; sayısı pozitifse Güneş veya Dünya noktası onun üzerindedir.',
    how2a: 'Yeşil çizgi o yöndeki gerçek arazidir. Noktanın üzerindeyse cisim',
    how2b: 'durumdadır, 0°’nin üzerinde olsa bile.',
    how3a: '▶ veya kaydırıcıyla',
    how3b: 'arasında ilerleyin. Aralarında hiçbir şey çizilmez; gördüğünüz NASA/JPL’nin hesapladığıdır.',
  },
  terrain3d: {
    title: '3D arazi ve Güneş yönü',
    description:
      'Seçili noktanın çevresindeki gerçek NASA LOLA yükseklikleri, seçili andaki Güneş ve Dünya yönleriyle. Yön göstergeleri bir görselleştirmedir, aydınlatma simülasyonu değildir.',
    loadHint: 'NASA LOLA yükselti ağını (birkaç yüz kB) ve 3D motoru yalnızca istediğinizde yükler.',
    load: '3D araziyi yükle',
    noEndpoint: 'Sunucu /maps/mesh sağlamıyor; 3D arazi gösterilmiyor.',
    webglMissing: 'Tarayıcınızda WebGL yok; 3D görünüm gösterilemiyor. Tüm 2D sonuçlar kullanılabilir.',
    notCovered:
      '{{site}} için doğrulanmış NASA DEM yükselti verisi yok (yerel 5 m karolar ve uzak Product 90 COG’lar kullanılamıyor veya başarısız). SELENORA arazi yüksekliği uydurmaz.',
    extent: 'Alan',
    extentOption: '{{km}} × {{km}} km · {{step}} m ağ',
    exaggeration: 'Dikey abartma',
    trueScale: '×1: gerçek dikey ölçek.',
    exaggerated: 'Yükseklikler ×{{k}} (yatay gerçek ölçek). Görüş çizgileri de eşit büyütülür; engelleme ilişkileri değişmez.',
    aria: '{{site}} çevresinde 3D arazi görünümü',
    loading: 'NASA LOLA ağı yükleniyor…',
    trueNorth: 'Gerçek K',
    observer: 'Gözlemci · {{site}}',
    controlsHint: 'Sürükle: döndür · Sağ sürükle: kaydır · Tekerlek/kıstır: yakınlaştır',
    heightScale: 'Yükseklik (LOLA yüzeyi)',
    observerZ: 'nokta {{z}} m',
    resolution: 'Ağ aralığı',
    nativeRes: 'Yerel DEM',
    source: 'Kaynak',
    tier: 'Kapsam katmanı',
    extentShort: 'Alan',
    noData: 'Veri yok hücreleri',
    heightRef:
      'Yerel 5 m DEM’in nokta örnekleri. Gözlemcinin gözüne (+2 m) göre, Ay eğriliği çıkarılarak gösterilir; sunucunun ufuk hesabında kullandığı referansla aynı.',
    heightRefRemote:
      'Doğrulanmış NASA PGDA Product 90 LOLA yükselti COG nokta örnekleri (harita görselleştirme). Operasyonel TERRAIN ufuk skorunda kullanılmaz. Yükseklikler hillshade veya fotoğraftan uydurulmaz.',
    sunTitle: 'Bu anda Güneş',
    directionNote:
      'Çizgi, NASA/JPL Horizons’a göre Güneş’in yönünü gösterir (azimut gerçek kuzeyden harita ızgarasına çevrildi). Görsel bir göstergedir: gölge veya aydınlatma simüle edilmez.',
    noSample: 'Bu nokta ve zaman için anlık Güneş yönü yok; yön çizgisi çizilmiyor.',
    liveSource: 'sunucu, bu an',
    notProvided: 'sağlanmadı',
    explainBlocked:
      'Güneş yönünde arazi {{h}}°’ye yükseliyor, Güneş ise yalnızca {{e}}° yüksekte; bu yüzden gizli. O çizgideki en yüksek nokta yaklaşık {{d}} m uzakta.',
    explainClear: 'Güneş yönünde arazi {{h}}°’ye yükseliyor ve Güneş {{e}}°’de; araziyi aşıyor.',
    meshCheck:
      'Bu 3D ağdan görsel çapraz kontrol (yalnızca {{r}} m içinde): arazi {{d}} m’de {{deg}}°’ye ulaşıyor. Yukarıdaki sunucu 5 m, 12 km ufku esastır.',
  },
  lroc: {
    label: 'Altlık',
    photo: 'Fotoğraf',
    hillshade: 'Gölgeli kabartma',
    none: 'Kapalı',
    opacity: 'Opaklık',
    photoShort: 'Fotoğraf: henüz doğrulanmış LROC katmanı yok.',
    photoUnavailable:
      'Fotoğraf kullanılamıyor: sunucu henüz koordinatlandırılmış bir LROC görüntü katmanı yayınlamıyor. Yerine dekoratif görüntü konmaz.',
    helpAvailable:
      'Fotoğraf: ASU Lunaserv LROC WAC güney kutup mozaiği; sunucu eşleşen Ay kutup projeksiyonunda ister. Opaklıkla LOLA gölgeli kabartmayla karşılaştırın. Aydınlatma görüntü alındığı andadır — görev tarihinize göre değişmez.',
    helpUnavailable:
      'Gölgeli kabartma NASA LOLA yüksekliklerinden hesaplanır. LROC fotoğrafı, sunucu doğrulanmış bir görüntü katmanı sağladığında burada görünecek.',
    staticShort: 'Statik LROC fotoğrafı; görev tarihindeki aydınlatma değildir.',
    staticIllumination:
      'Resmî LROC WAC Güney Kutbu Yaz Mozaiği (WAC_ROI_SOUTH_SUMMER) — statik yaz mozaiği. Aydınlatma 2026/2027 görev zaman çizelgesiyle değişmez.',
    retry: 'LROC’u yeniden dene',
    pendingFallback: 'LROC yükleniyor. Gerçek NASA LOLA gölgeli kabartma altlığı kullanılabilir.',
    failedFallback: 'Bu görünüm için LROC yüklenemedi. Mevcut NASA LOLA gölgeli kabartma / önbellekli genel görünüm gösteriliyor. Yeniden deneyin veya Gölgeli kabartma’yı seçin.',
    loading: 'Bu harita penceresi için LROC fotoğrafı yükleniyor…',
  },
  artemis5e: {
    historical: '2022 tarihsel set (13)',
    current: '2024 Artemis III kısa listesi (9)',
    note: 'Yalnızca adlar ve tarihler — çokgen yok. 2022 listesi tarihsel bağlamdır; güncel iniş planı değildir.',
  },
  sim5f: {
    storedTitle: 'Örnek yönleri (kayıtlı analiz)',
    storedNote:
      'GET /analyses/{id}/epochs üzerinden yetkili Güneş/Dünya azimut, yükseklik ve VISIBLE/BLOCKED/UNKNOWN durumları — yeni Horizons isteği yok.',
    authoritativeNote:
      'Arazi ve geometrik durumlar yetkili /epochs uç noktasından gelir (VISIBLE / BLOCKED / UNKNOWN). Eksik DEM kapsamı UNKNOWN kalır; açık gökyüzü çıkarılmaz.',
  },
}

export default phase5dTr
