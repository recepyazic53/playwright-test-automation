// BASİT MOD SAYFA REHBERLERİ (rehber-icerikleri.js > REHBERLER'e eklenir; biçim orada anlatılır). Kısa tutulur; kendiliğinden
// açılmaz ("?" ya da "Bu sayfanın rehberi" ile açılır). Metinler geneldir: ürün / şirket adı içermez.

/** @type {Record<string, { baslik: string; adimlar: Array<Record<string, any>> }>} */
export const BASIT_MOD_REHBERLERI = {
  testlerim: {
    baslik: 'Testlerim',
    adimlar: [
      {
        baslik: 'Testlerim',
        metin: ['Her satır bir ekranın testidir. Altındaki değişkenler aynı testin farklı değerlerle denenen hâlleridir (ör. bireysel ve kurumsal başvuru).',
          'Yol hep aynıdır: adres girin, Nöbetçi keşfetsin, eksikleri tamamlayın, çalıştırın, sonucu görün.']
      },
      { baslik: 'Ortam ve Hepsini çalıştır', hedef: '.basit-sayfa .sayfa-basligi .eylemler', metin: 'Testlerin hangi ortamda çalışacağını seçin. "Hepsini çalıştır" şimdi başlatır ya da her gün aynı saatte çalışacak bir plan kurar.' },
      { baslik: 'Bir test', hedef: '.test-satiri', metin: 'Rozet son sonucu gösterir. ▷ yalnız bu testi çalıştırır; ⋯ ile testi düzenler, değişken ekler ya da silersiniz. "Eksik" rozeti varsa gerekçe cümlesi altta yazar; "Tamamla" eksik olanı açar.' },
      { baslik: 'Gelişmiş\'te olanlar', hedef: '.gelismis-testler-notu:not([hidden])', metin: 'Gelişmiş modda oluşturulmuş servis testleri ve uçtan uca akışlar burada listelenmez; sayıları not olarak görünür. Hiçbiri silinmez.' },
      { baslik: 'Yeni test', hedef: '.yeni-test-dugmesi', metin: '"Yeni test" yeni bir ekranı test etmeye başlatır: sayfanın adresini verirsiniz, alanları Nöbetçi bulur.' }
    ]
  },
  'hizli-test': {
    baslik: 'Hızlı test',
    adimlar: [
      {
        baslik: 'Hızlı test',
        metin: ['Sayfanın adresini verin; Nöbetçi alanları bulur, eksik veriyi size sorar ve testi sizinle birlikte kurar. Altı durak vardır: Başlat, Keşfet, Veri durağı, Adım adım, Bitiş koşulu, Kaydet.',
          'Değer uydurulmaz: her alanı siz yazarsınız ya da “Doldur” ile test verisi tablosundan seçersiniz.']
      },
      { baslik: 'Düğmelere basma izni', hedef: '.hizli-izinler', metin: '“Evet”: gereken düğmelere basar, birden çok aday varsa sorar. “Bana sor”: her basıştan önce onay ister. “Hayır”: hiç basmaz; düğmeyi ve mesajı siz seçersiniz, test “doğrulanmadı” kaydedilir. CANLI ortamda bir kez ayrıca onay istenir.' },
      { baslik: 'Adım adım', hedef: '.hizli-duraklar', metin: 'Her basıştan sonra sayfada ne değiştiği gösterilir (yeni metinler, alanlar, düğmeler). “Şimdi ne yapayım?” sorusuyla bitirir ya da sonraki düğmeye geçersiniz; zincir istediğiniz kadar uzar.' },
      { baslik: 'Bitiş koşulu', metin: 'Görülen metinlerin her biri Bitti, Devam ya da Hata etiketlenir. Koşuda Bitti görülünce test başarılı, Hata görülünce başarısız biter; hiçbiri görünmezse “Bitiş mesajı görülmedi”.' }
    ]
  },
  'basit-sonuclar': {
    baslik: 'Sonuçlar',
    adimlar: [
      { baslik: 'Sonuçlar', metin: ['Koşuların sonucu burada sade hâliyle görünür: son koşu, başarısız testlerin nedeni ve kanıtı.', 'Ayrıntılı analiz Gelişmiş Sonuçlar\'dadır; bağlantısı sayfanın altındadır.'] },
      { baslik: 'Son koşu', hedef: '.basit-son-kosu', metin:'En son koşu en üstte: kaç test başarılı, kaç test başarısız. Başarısız testin nedeni tek cümleyle yazar.' },
      { baslik: 'Kanıt ve Yeniden', hedef: '.basit-sonuc.basarisiz', metin: '"Son görüntü" ve "Video" testin başarısız olduğu anı gösterir. "Yeniden" aynı değişkeni aynı ortamda tekrar çalıştırır.' },
      { baslik: 'Önceki koşular', hedef: '.basit-onceki', metin: 'Önceki koşulardan birine tıklayınca o koşu üstte açılır.' },
      { baslik: 'Ayrıntılar ve rapor', hedef: '.basit-baglantilar', metin: 'Eğilim, hata kalıpları ve karşılaştırma Gelişmiş Sonuçlar\'dadır. "Rapor al (PDF)" paylaşılabilir bir rapor hazırlar.' }
    ]
  }
};
