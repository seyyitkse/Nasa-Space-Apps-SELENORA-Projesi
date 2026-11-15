/** Faz 7B metinleri (göreli güneş potansiyeli). */
const phase7bTr = {
  solar7b: {
    title: 'Göreli güneş potansiyeli',
    description:
      'Bu analiz penceresinde her panel tipinin her sahada Güneş’e ne kadar iyi baktığı. Göreli bir karşılaştırmadır, güç tahmini değildir.',
    notPower:
      'Bu, aydınlanma geometrisidir; elektrik gücü değildir. Watt veya kWh için panel donanımı ve güneş ışınımı gerekir; bunlar burada modellenmez.',
    scale: '%100 = pencere boyunca engelsiz güneş ışığında, her an Güneş’e bakan bir panel.',
    loading: 'Güneş potansiyeli yükleniyor…',
    updating: 'Yeni panel ayarlarına göre güncelleniyor…',
    unavailable: 'Bu sunucu henüz güneş potansiyeli sağlamıyor.',
    capabilityUnknown: 'Sunucunun güneş potansiyeli sağlayıp sağlamadığı denetlenemedi.',
    synthetic: 'Sentetik demo için hesaplanmaz. Güneş potansiyeli, demoda bulunmayan JPL Horizons Güneş geometrisini kullanır.',
    step: 'Her {{n}} dakikada bir örnek',
    site: 'Saha',
    horizon: {
      GEOMETRIC: 'Geometrik ufuk',
      TERRAIN: 'Arazi dikkate alınır',
      hint: {
        GEOMETRIC: 'Ufuk, pürüzsüz Ay küresidir. Arazi gölgeleri hesaba katılmaz; gerçek güneş ışığı çok daha az olabilir.',
        TERRAIN: 'Yerel NASA LOLA 5 m arazi verisi kullanılır. Arazi verisinin karar veremediği yerde tek sayı yerine aralık gösterilir.',
      },
    },
    panel: {
      HORIZONTAL: 'Yatay panel',
      FIXED: 'Sabit panel',
      AZIMUTH_TRACKING: 'Azimut izleyen panel',
      DUAL_AXIS: 'Çift eksenli izleyen panel',
      hint: {
        HORIZONTAL: 'Yere paralel durur, tam yukarı bakar.',
        FIXED: 'Pencere boyunca tek eğim ve tek pusula yönü.',
        AZIMUTH_TRACKING: 'Dikey bir direk çevresinde dönerek Güneş’i izler; eğimi sabit kalır.',
        DUAL_AXIS: 'Her an doğrudan Güneş’e bakar. Bir panelin ulaşabileceği en iyi durum.',
      },
    },
    config: {
      tilt: 'eğim {{tilt}}°',
      azimuth: 'yön {{azimuth}}° ({{compass}})',
      OPTIMISED_HINDSIGHT_GEOMETRIC: 'yön, bu pencere için sonradan bakılarak ve arazi yok sayılarak seçildi',
      REQUESTED: 'yönü siz belirlediniz',
    },
    compass: { N: 'K', NE: 'KD', E: 'D', SE: 'GD', S: 'G', SW: 'GB', W: 'B', NW: 'KB' },
    controls: {
      title: 'Panel ayarları',
      azimuth: 'Sabit panel yönü (°)',
      azimuthHelp: 'Gerçek kuzeyden saat yönünde, 0 – 359,9. Boş bırakırsanız her saha için en iyi yön sonradan bakılarak seçilir.',
      azimuthPlaceholder: 'otomatik',
      tilt: 'Sabit panel eğimi (°)',
      trackingTilt: 'İzleyen panel eğimi (°)',
      tiltHelp: '0 = yatay, 90 = dik. Boş = 90.',
      errors: {
        azimuthRange: '0 ile 360 arasında (360 hariç) bir yön girin.',
        tiltRange: '0 ile 90 arasında bir eğim girin.',
      },
    },
    legend: {
      title: 'Açıklama',
      known: 'Bilinen örneklerle kanıtlanan',
      possible: 'Olası: veri bunu dışlayamıyor',
    },
    value: {
      range: 'Aralık',
      rangeAria: '{{min}} ile {{max}} arası',
      unavailable: 'Mevcut değil',
    },
    bar: '{{site}}, {{panel}}: {{value}}',
    unavailableReason: {
      NO_DURATION: 'Analiz penceresinin süresi yok.',
      NO_EPHEMERIS: 'Bu saha için Güneş konum verisi yok.',
      NO_KNOWN_VISIBILITY: 'Arazi verisi hiçbir örnekte Güneş görünürlüğüne karar veremiyor; bu yüzden arazi dikkate alınan bir değer yok.',
      NOT_COMPUTED: 'Bu yapılandırma için hesaplanmadı.',
    },
    panelUnavailable: {
      AZIMUTH_UNDEFINED_AT_POLE: 'Tam kutup noktasında pusula yönünün anlamı yoktur.',
      NO_SUNLIT_SAMPLE_TO_OPTIMISE_AZIMUTH: 'Bu pencerede Güneş hiç doğmuyor; en iyi yön seçilemez. Değer görmek için bir yön girin.',
    },
    unknownShare: 'Pencerenin {{pct}} kadarı bilinmiyor',
    mostlyUnknown: 'Büyük bölümü bilinmiyor. Aralığı tahmin olarak değil, tamamen açık olarak okuyun.',
    edge: 'Arazi kenarına yakın {{hours}} yalnızca üst sınırda sayıldı',
    geometricContext: 'Arazi yok sayılırsa (yalnızca bağlam): {{value}}',
    compare: {
      DISTINGUISHABLE: '{{site}} önde: alt sınırı diğer tüm sahaların üst sınırından yüksek.',
      NOT_DISTINGUISHABLE: 'Bu sahalar sıralanamaz: değerleri örtüşüyor veya eşit.',
      UNAVAILABLE: 'Sıralama yok: en az bir sahanın değeri yok.',
    },
    layers: {
      title: 'Güneş ışığına erişim',
      geometric: 'Güneş geometrik ufkun üzerinde',
      terrain: 'Güneş bilinen arazinin üzerinden görünüyor',
      terrainRange: 'pencerenin {{min}} ile {{max}} arası',
      missing: 'Güneş konum verisi yok',
      ofWindow: '{{total}} içinde {{hours}}',
      split: '{{visible}} görünür · {{blocked}} arazinin arkasında · {{unknown}} bilinmiyor',
      noTerrain: 'Arazi görünürlüğü geometrik analizin parçası değildir.',
    },
    notes: {
      title: 'Varsayımlar, sınırlar ve veri kaynakları',
      plain: {
        relative: 'Değerler yalnızca bu analiz içindeki sahaları ve panel tiplerini karşılaştırır. Güç saati veya enerji değildir.',
        unknown: 'Bilinmeyen, ne aydınlık ne gölgedir. Alt sınıra hiçbir şey, üst sınıra olabileceği her şeyi ekler.',
        range: 'Aralık bir olasılık değildir. İçindeki hiçbir değer diğerinden daha olası değildir.',
        photo: 'Harita fotoğrafı sabit bir yaz mozaiğidir. Seçtiğiniz tarihlerin güneş ışığı fotoğraftan değil, yalnızca Güneş konumlarından gelir.',
      },
      definition: 'İndeks tanımı',
      assumptions: 'Varsayımlar',
      limitations: 'Sınırlamalar',
      energy: 'Elektrik enerjisi',
      energyMissing: 'Mevcut değil. Eksik girdiler:',
      provenance: 'Veri kaynakları',
      api: 'API’den (İngilizce)',
    },
  },
}

export default phase7bTr
