/** Phase 7E — Ay Görevleri katmanı (küresel 3B Ay). */
const phase7eTr = {
  missions7e: {
    eyebrow: 'Faz 7E · Tarih',
    title: 'Ay Görevleri',
    lede: 'Küresel 3B Ay üzerinde isteğe bağlı Apollo ve CLPS tarih katmanı. Yalnızca doğrulanmış koordinatlar — araştırma puanlamasına dahil değildir.',
    layer: 'Kürede göster',
    loading: 'Görev kataloğu yükleniyor…',
    error: 'Görev kataloğu yüklenemedi.',
    unavailable: 'Bu backend henüz ay görevleri kataloğunu sunmuyor.',
    listOnly: 'yalnızca liste (iğne yok)',
    plannedRegion: 'planlanan/başarısız hedef bölgesi',
    source: 'NASA / birincil kaynak',
    lroc: 'LROC görüntüleri',
    filters: {
      program: 'Program filtresi',
      outcome: 'Sonuç filtresi',
      all: 'Tümü',
    },
    outcome: {
      successful: 'Başarılı',
      partial: 'Kısmi',
      unsuccessful: 'Başarısız',
      aborted: 'İptal',
      planned: 'Planlanan',
    },
    fields: {
      operator: 'Operatör',
      status: 'Görev durumu',
      landingOutcome: 'İniş sonucu',
      launch: 'Fırlatma',
      landing: 'İniş',
      actualSite: 'Gerçek iniş',
      plannedTarget: 'Planlanan hedef',
      frame: 'Kaynak çerçeve',
      uncertainty: 'Koordinat belirsizliği',
      confidence: 'Güven',
    },
  },
}

export default phase7eTr
