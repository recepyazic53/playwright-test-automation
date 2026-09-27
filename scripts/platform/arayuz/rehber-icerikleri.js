// EKRAN REHBERİ İÇERİKLERİ (bkz. rehber.js). Her rehber: { baslik, adimlar: [{ baslik, metin, hedef?, sira?, cizim?, ipucu? }] }.
//   hedef: vurgulanacak öğenin CSS seçicisi (ya da seçici listesi; ilk bulunan). Sayfada yoksa kart ortada açılır.
//   sira: numaralı iş listesi ("hangi sırayla"). cizim: { tur: 'akis', kutular } — örnek veri kurmadan anlatım çizimi.
// Metinler geneldir: hiçbir ürün / şirket adı içermez.

const ANA_AKIS = {
  tur: 'akis',
  kutular: [
    { baslik: 'Ortam + giriş', alt: 'Ayarlar', ikon: 'ayar' },
    { baslik: 'Ekran', alt: 'paket / tarama', ikon: 'ekran' },
    { baslik: 'Senaryo', alt: 'formdan', ikon: 'liste' },
    { baslik: 'Koşu', alt: 'Koşuyu başlat', ikon: 'oynat' },
    { baslik: 'Sonuç', alt: 'hata kalıpları', ikon: 'grafik' }
  ]
};

/** @type {Record<string, { baslik: string; adimlar: Array<Record<string, any>> }>} */
export const REHBERLER = {
  genel: {
    baslik: 'Nöbetçi',
    adimlar: [
      { baslik: "Nöbetçi'ye hoş geldiniz", metin: ['Nöbetçi, web ekranlarınızı ve servislerinizi kod yazmadan test etmenizi sağlar. Her şey bu bilgisayarda, şifreli bir kasada kalır.', 'Bir işe başlarken izlenecek sıra aşağıdadır; her ekranın kendi rehberi de vardır.'], cizim: ANA_AKIS },
      { baslik: 'Ana menü', hedef: '.ust-nav', metin: 'Sonuçlar, Senaryolar, Ekranlar ve Ayarlar buradan açılır. Servisler, Senaryolar bölümünün sol panelindedir.' },
      { baslik: 'Proje seçici', hedef: '.proje-secici-kap', metin: 'Birden çok projeniz varsa aralarında buradan geçersiniz; "+ Yeni proje" aynı kasada yeni bir proje açar.' },
      { baslik: 'Rehberi tekrar açmak', hedef: '.rehber-dugmesi', metin: 'Hangi ekrandaysanız o ekranın rehberini bu "?" düğmesiyle istediğiniz zaman yeniden başlatabilirsiniz. Rehberlerin ilk girişte kendiliğinden açılmasını Ayarlar > Arayüz\'den kapatabilirsiniz.' }
    ]
  },

  sonuclar: {
    baslik: 'Sonuçlar',
    adimlar: [
      { baslik: 'Sonuçlar ekranı', metin: 'Koşuların özetini, eğilimi ve kalan testleri burada izlersiniz. Soldan bir ürün / ekran seçerek yalnızca onun sonuçlarına bakabilirsiniz.', hedef: '.alt-nav' },
      { baslik: 'Kartlar', hedef: ['.sonuc-kartlari', '.sonuc-kartlari-bos'], metin: 'Son tam koşunun başarı oranı, kalan ve atlanan testler. Kalan testlerin hata kategorisi, Ayarlar > Koşu > Hata sınıflandırma kurallarıyla belirlenir.' },
      { baslik: 'Eğilim', hedef: '.trend-kapsayici', metin: 'Tam koşuların zaman içindeki başarı oranı. Bir noktanın üzerine gelince o koşunun ayrıntısı görünür.' },
      { baslik: 'Sıra', metin: 'Bir koşuyu incelemek için:', sira: ['Koşu geçmişinden koşuyu açın.', 'Kalan testin satırına tıklayın: hata, adımlar, ekran görüntüleri ve video açılır.', 'Aynı hatanın başka testlerde de olup olmadığını "Hata kalıpları"nda görün.'] }
    ]
  },
  'sonuclar-kosu': {
    baslik: 'Koşu ayrıntısı',
    adimlar: [
      { baslik: 'Koşu ayrıntısı', metin: 'Bu koşudaki tüm testler, durumları ve süreleri. Kalan bir testi açarak hatasını, adımlarını ve kayıtlarını inceleyin.' },
      { baslik: 'Önceki koşuyla karşılaştırma', metin: 'Tam koşularda yeni kalan ya da düzelen testler ayrıca işaretlenir; böylece yalnızca değişene odaklanırsınız.' }
    ]
  },
  'sonuclar-sonuc': {
    baslik: 'Test ayrıntısı',
    adimlar: [
      { baslik: 'Test ayrıntısı', metin: 'Hata mesajı, "Beklenen / Görülen" karşılaştırması, adım adım ekran görüntüleri, video ve iz (trace) burada. Medya şifrelidir; yalnızca kasa açıkken gösterilir.' },
      { baslik: 'Ne yapmalı?', sira: ['Hangi adımda kaldığına bakın (kırmızı adım).', 'Ekran değiştiyse Ekranlar\'da ekranı yeniden tarayın ya da yeni paket yükleyin (tekrar analiz).', 'Beklenen sonuç değiştiyse senaryoyu düzenleyin.', 'Ortamdan kaynaklı bir hataysa senaryoyu tekrar çalıştırın.'] }
    ]
  },

  senaryolar: {
    baslik: 'Senaryolar',
    adimlar: [
      { baslik: 'Senaryolar ekranı', metin: 'Bir ekranın test durumları (senaryolar) burada listelenir. Her senaryo, ekranın modelindeki alanlara verdiğiniz değerlerden oluşur ve Nöbetçi onu tarayıcıda koşar.', cizim: { tur: 'akis', kutular: [{ baslik: 'Ekran modeli', ikon: 'katman' }, { baslik: 'Senaryo formu', ikon: 'duzenle' }, { baslik: 'Dene / Çalıştır', ikon: 'oynat' }] } },
      { baslik: 'Ürünler ve ekranlar', hedef: '.alt-nav', metin: 'Soldan bir ekran seçin; yalnızca onun senaryoları görünür. Servisler de bu panelin altındadır.' },
      { baslik: 'Arama ve filtreler', hedef: '.senaryo-arac-cubugu', metin: 'Başlıkta arayın; Koşuda, beklenen sonuç ve son duruma göre süzün. Klavyede "/" aramaya gider.' },
      { baslik: 'Yeni senaryo ve koşu', hedef: '.sayfa-basligi .eylemler', metin: '"Yeni senaryo" ekran modelinden bir form açar. "Koşuyu başlat" Koşuda açık tüm senaryoları sırayla koşar; canlı ekran görüntüsünü panelden izlersiniz.' },
      { baslik: 'Tablo', hedef: '.senaryo-tablosu', metin: 'Satırdaki ▷ tek senaryoyu çalıştırır, kalem düzenler, ⋯ kopyalar / geçmişi gösterir / siler. Birden çok satır seçince toplu işlemler çıkar.' },
      { baslik: 'Önerilen sıra', sira: ['Ekranlar\'dan ekranın modelini ekleyin (paket ya da tarama).', 'Bu ekranda "Yeni senaryo" ile senaryoyu oluşturun; önce "Dene" ile kaydetmeden deneyin.', 'Kaydedin ve "Koşuda" açık bırakın.', '"Koşuyu başlat" ile koşun; sonuçlar Sonuçlar\'a düşer.'] }
    ]
  },
  'senaryo-formu': {
    baslik: 'Senaryo formu',
    adimlar: [
      { baslik: 'Senaryo formu', metin: 'Form, ekranın modelinden çizilir: adımlar akış sırasıyla, alanlar bölümler hâlinde. Görünürlük ve zorunluluk kuralları siz doldurdukça uygulanır; hatalar alanın altında görünür.' },
      { baslik: 'Doldurma sırası', sira: ['Başlığı yazın (senaryonun ne sınadığını anlatsın).', 'Ekranın birden çok akışı varsa akışı seçin.', 'Alanları yukarıdan aşağı doldurun; bağımlı listeler üstteki seçime göre süzülür.', 'Kişi / kart / adres gibi veriler için test verisi profili seçin (değer yazılmaz).', 'Beklenen sonucu seçin: başarı ya da beklenen hata mesajı.', '"Dene" ile kaydetmeden deneyin; sonra Kaydet.'] },
      { baslik: 'Akış diyagramı', metin: '"Akış diyagramı" sekmesi, seçimlerinizle koşacak adımları ve seçili ortamdaki son koşunun adım renklerini gösterir.' },
      { baslik: 'İpuçları', metin: 'Boş bıraktığınız alan modelin varsayılanını alır. "Mutlaka görünmeli" işaretli alan ekranda görünmezse test düşer.', ipucu: 'Dene sonucu kaydedilmez; yalnızca Sonuçlar\'da "deneme" olarak görünür.' }
    ]
  },

  servisler: {
    baslik: 'Servisler',
    adimlar: [
      { baslik: 'Servisler', metin: 'SOAP / REST servislerinizi tarayıcısız test edersiniz: istek gönderilir, yanıt kontrollerle doğrulanır.', cizim: { tur: 'akis', kutular: [{ baslik: 'Servis', alt: 'WSDL / adres' }, { baslik: 'Senaryo', alt: 'istek + kontroller' }, { baslik: 'Akış', alt: 'yanıt → sonraki istek' }] } },
      { baslik: 'Sıra', sira: ['"Servis ekle" ile servisi tanımlayın (WSDL, SoapUI projesi ya da elle).', 'Metodu seçip senaryo oluşturun; alanları test verisi tablolarına bağlayın.', 'Yanıt kontrollerini ekleyin (ör. hata yok, alan şu değere eşit).', 'Birbirine bağlı istekler için Akışlar sekmesini kullanın.'] }
    ]
  },
  'servis-ekle': {
    baslik: 'Servis ekle',
    adimlar: [
      { baslik: 'Servis ekleme', metin: 'Servisi WSDL adresinden, bir SoapUI projesinden ya da elle ekleyebilirsiniz. Gizli değerler (ör. parola) kasaya şifreli yazılır.' },
      { baslik: 'Sonra', sira: ['Servisin ortam adreslerini kontrol edin.', 'Giriş gerekiyorsa servis giriş bilgisini ekleyin.', 'Senaryolar sekmesinden ilk senaryoyu oluşturun.'] }
    ]
  },
  servis: {
    baslik: 'Servis',
    adimlar: [
      { baslik: 'Servis sayfası', metin: 'Sekmeler: Senaryolar (istekler ve kontroller), Akışlar (istekleri zincirleme), Parametreler (değer tanımları), Raporlar (koşu geçmişi), İşlemler (metotlar).' },
      { baslik: 'Senaryo oluşturma sırası', sira: ['Metodu seçin.', 'Alanları doldurun: sabit değer, test verisi tablosu sütunu, tarih kuralı ya da akış değeri.', 'Kontrolleri ekleyin.', '"Dene" ile seçili ortamda deneyin, sonra kaydedin.'] },
      { baslik: 'Gizli bilgiler', metin: 'Yanıtlarda ve raporlarda gizli adlı alanlar maskelenir. Maskelenecek ek adları Ayarlar > Güvenlik > Maskeleme\'den ekleyebilirsiniz.' }
    ]
  },
  'servis-akislari': {
    baslik: 'Servis akışları',
    adimlar: [
      { baslik: 'Akış nedir?', metin: 'Bir akış birden çok servis senaryosunu sırayla koşar. Bir adımın yanıtından okunan değer sonraki adımlarda ${akis:Ad} ile kullanılır.', cizim: { tur: 'akis', kutular: [{ baslik: '1. istek', alt: 'yanıttan No oku' }, { baslik: '2. istek', alt: '${akis:No} kullan' }] } },
      { baslik: 'Oturum (token) akışı', metin: 'Giriş gerektiren servisler için bir oturum akışı tanımlayın; token süresi dolana kadar mı yoksa her istekte mi yeniden alınacağını akışta siz seçersiniz.' },
      { baslik: 'Sıra', sira: ['"Yeni akış" ile adımları ekleyin (her adım kayıtlı bir servis senaryosu).', 'Okunacak değerleri tanımlayın (XPath / JSON yolu / başlık; gizliyse işaretleyin).', 'Sonraki adımın alanında akış değerini seçin.', 'Test ortamında deneyin, sonra kaydedin.'] }
    ]
  },

  ekranlar: {
    baslik: 'Ekranlar',
    adimlar: [
      { baslik: 'Ekranlar', metin: 'Test edeceğiniz her sayfa bir "ekran"dır. Ekranın modeli (alanlar, adımlar, kurallar) senaryo formunu ve koşuyu belirler.', cizim: { tur: 'akis', kutular: [{ baslik: 'Sayfa paketi', alt: 'ya da tarama' }, { baslik: 'Ekran modeli', alt: 'sürümlü' }, { baslik: 'Senaryolar' }] } },
      { baslik: 'Ekran ekleme yolları', sira: ['Sayfa ekle: Claude Code\'un sayfayı yalnızca okuyarak ürettiği paketi yükleyin.', 'Ekranı tara: Nöbetçi sayfayı seçtiğiniz ortamda kendisi okur.', 'Akışı kaydet: işlemi siz yaparken Nöbetçi adımları kaydeder.'] },
      { baslik: 'Sol panel', hedef: '.alt-nav', metin: 'Ekranlar, alt modeller (ör. kart bloğu) ve ortak akışlar burada. Devre dışı ekranlar varsayılan olarak gizlidir.' },
      { baslik: 'Ekran değişince', metin: 'Sayfa değiştiyse aynı ekrana yeni paket yükleyin ya da yeniden tarayın: farklar "bulgular" olarak gelir, kabul ettikleriniz yeni sürüm olur.' }
    ]
  },
  'ekran-ekle': {
    baslik: 'Sayfa ekle',
    adimlar: [
      { baslik: 'Sayfa paketi', metin: 'Paket, sayfanın alanlarını, adımlarını ve önerilen senaryoları içeren bir JSON dosyasıdır. Yükleyince önce önizleme gösterilir; hiçbir şey onayınız olmadan kaydedilmez.' },
      { baslik: 'Sıra', sira: ['Paketi yükleyin ya da "Ekranı tara"yı seçin.', 'Önizlemede alanları ve uyarıları kontrol edin.', 'Eklenecek senaryo önerilerini ve ortamlarını seçin.', 'Ekle: ekran, model sürüm 1 ve seçilen senaryolar oluşur.'] },
      { baslik: 'Güvenlik', metin: 'Tarama sayfayı yalnızca okur; kayıt oluşturan düğmelere basmaz. Yasak adreslere (Ayarlar > Güvenlik) hiç gidilmez.' }
    ]
  },
  ekran: {
    baslik: 'Ekran ayrıntısı',
    adimlar: [
      { baslik: 'Ekran ayrıntısı', metin: 'Modelin adımları, alanları ve kuralları; sürüm geçmişi; akışlar ve senaryolar bu sayfada.', hedef: '.sayfa-basligi' },
      { baslik: 'Eylemler', hedef: '.sayfa-basligi .eylemler', metin: 'Tekrar analiz (yeni paket), ekranı yeniden tara, akışı kaydet ve ⋯ menüsü (yeniden adlandır, URL yolunu düzenle, devre dışı bırak, sil).' },
      { baslik: 'Akışlar', metin: 'Bir ekranda birden çok akış olabilir (ör. farklı yollar). Akış diyagramında adımları sürükleyip düzenler, ortak akış bloklarını (ör. ödeme) eklersiniz.' },
      { baslik: 'Önerilen sıra', sira: ['Modeli kontrol edin (alan etiketleri, zorunluluk, seçenekler).', 'Gerekirse seçim alanlarını test verisi tablolarına bağlayın.', 'Senaryolar\'dan senaryo oluşturun.'] }
    ]
  },
  'akis-tasarimi': {
    baslik: 'Akış tasarımı',
    adimlar: [
      { baslik: 'Akış diyagramı', metin: 'Ekranın adımları kutular hâlinde, akış sırasıyla. Adımları sürükleyerek sıralar, koşullu adımları ve ortak akışları eklersiniz.' },
      { baslik: 'Sıra', sira: ['Mevcut akışı kopyalayın ya da "Yeni akış" açın.', 'Adımları ekleyin / sıralayın; koşulları yazın (ör. "Müşteri tipi = Kurumsal ise").', '"+ > Ortak akış" ile ortak blokları ekleyin; isteğe bağlıysa senaryoda "dahil" seçilir.', 'Kaydedin: etkilenen senaryolar önce gösterilir.'] }
    ]
  },
  bulgular: {
    baslik: 'Bulgular',
    adimlar: [
      { baslik: 'Tekrar analiz bulguları', metin: 'Yeni paket ya da tarama ile model arasındaki farklar: eklenen / kaldırılan alanlar, değişen seçenekler, seçiciler ve koşu tanımları.' },
      { baslik: 'Sıra', sira: ['Her bulguyu inceleyin (etkilenen senaryolar gösterilir).', 'Kabul ya da reddedin.', '"Uygula": yalnızca kabul edilenlerle yeni model sürümü oluşur. Reddedilenler bir sonraki analizde tekrar sorulmaz.'] }
    ]
  },
  tarama: {
    baslik: 'Ekran taraması',
    adimlar: [
      { baslik: 'Tarama', metin: 'Nöbetçi sayfayı seçili ortamda açar, alanları ve seçenekleri okur, bir sayfa paketi üretir. İlerlemeyi burada izlersiniz; bitince paket önizlemesine geçilir.' },
      { baslik: 'Dikkat', metin: 'Tarama yalnızca okur ve bilgi amaçlı düğmelere basar (sekme, ok, sorgula). Kayıt oluşturan düğmelere basılmaz.' }
    ]
  },

  'ayarlar-proje': {
    baslik: 'Proje ve ortamlar',
    adimlar: [
      { baslik: 'Ayarlar', hedef: '.alt-nav', metin: 'Ayarlar bölümleri solda. Buradaki her seçim sizin kararınızdır; kodda sabit bir tercih yoktur.' },
      { baslik: 'Ortamlar', metin: 'Testlerin çalışacağı adresler (ör. test, hazırlık, canlı). "Canlı" işaretli ortamda yalnızca test ortamına özel adımlar atlanır. Adresler kasada şifrelidir.' },
      { baslik: 'Kurulum sırası', sira: ['Ortamları ekleyin.', 'Giriş profillerini ve her ortamın giriş tarifini tanımlayın.', 'Test verisini (tablolar, kayıtlar) ekleyin.', 'Koşu ayarlarını (video, yeniden deneme, süreler) gözden geçirin.'] }
    ]
  },
  'ayarlar-giris': {
    baslik: 'Giriş profilleri',
    adimlar: [
      { baslik: 'Giriş profili', metin: 'Testlerin uygulamaya hangi kullanıcıyla gireceği. Parola, TOTP anahtarı ve sabit SMS kodu kasada şifreli saklanır, burada gösterilmez.' },
      { baslik: 'Giriş tarifi', metin: 'Her ortam için giriş sayfasının tarifi: kullanıcı / parola alanı, giriş düğmesi, başarı ve hata göstergeleri, iki aşamalı doğrulama ve girişten sonra bağlam seçimi (rol, şube…).' },
      { baslik: 'Sıra', sira: ['Giriş profilini ekleyin.', 'Ortamın giriş tarifinde "Varsayılanları öner" ile alanları algılatın (yalnızca siz basınca).', 'Önerileri kontrol edip kaydedin.'] }
    ]
  },
  'ayarlar-test-verisi': {
    baslik: 'Test verisi',
    adimlar: [
      { baslik: 'Tablolar', metin: 'Her satır birlikte geçerli değerlerdir (ör. kanal | kullanıcı | parola). Ekran alanları ve servis alanları sütunlara bağlanır; senaryoda seçtikçe süzülür.' },
      { baslik: 'Kayıtlar (profiller)', metin: 'Kişi, kart, adres gibi kayıtlar profil adıyla seçilir (değer senaryoya yazılmaz). Hassas işaretli alanlar kasada şifrelidir ve maskeli gösterilir.' },
      { baslik: 'Sıra', sira: ['Türü / tabloyu oluşturun (sütunlar).', 'Satırları ya da profilleri ekleyin (ortama özel olabilir).', 'Ekranın ya da servisin alanlarını sütunlara bağlayın.'] }
    ]
  },
  'ayarlar-dosyalar': {
    baslik: 'Dosyalar',
    adimlar: [{ baslik: 'Ekran dosyaları', metin: 'Ekranların varsayılan dosyaları (ör. toplu yükleme Excel\'i). Dosyalar yalnızca şifreli saklanır; koşuda geçici bir klasöre çözülür ve koşu bitince silinir.' }]
  },
  'ayarlar-kosu': {
    baslik: 'Koşu ayarları',
    adimlar: [
      { baslik: 'Koşu ayarları', metin: 'Video / ekran görüntüsü / iz kaydı, yeniden deneme, süre limiti, bekleme süreleri, servis zaman aşımı ve tarih biçimi. Değişiklik sonraki koşulardan itibaren geçerlidir.' },
      { baslik: 'Hata sınıflandırma', metin: 'Kalan testin hata mesajında belirli bir metin geçerse hangi kategoride görüneceğini siz tanımlarsınız (ör. uygulamanızın iş kuralı uyarısı).' }
    ]
  },
  'ayarlar-yedekleme': {
    baslik: 'Yedekleme',
    adimlar: [
      { baslik: 'Yedekler', metin: 'Dışa aktar: şifreli .tayedek dosyası. İçe aktar: başka bir bilgisayarın yedeğindeki kayıtları seçerek alın. Otomatik yedek her gün alınır.' },
      { baslik: 'Saklama', metin: 'Kaç otomatik yedeğin tutulacağını ve koşu sonuçlarının ne kadar saklanacağını siz belirlersiniz. Geçmiş sonuçları buradan silebilirsiniz (önce sayım gösterilir).' }
    ]
  },
  'ayarlar-guvenlik': {
    baslik: 'Güvenlik',
    adimlar: [
      { baslik: 'Kasa', metin: 'Kasa kilitlenince şifreli bilgiler okunamaz. İşlem yapılmazsa kasa ayarladığınız sürede kendiliğinden kilitlenir.' },
      { baslik: 'Yasak adresler', metin: 'Nöbetçi\'nin hiçbir zaman bağlanmayacağı host kalıpları: bu adreslere koşu ve tarama hiç başlamaz.' },
      { baslik: 'Maskeleme', metin: 'Raporlarda ve yanıtlarda maskelenecek ek gizli adlar.' }
    ]
  },
  'ayarlar-arayuz': {
    baslik: 'Arayüz',
    adimlar: [{ baslik: 'Rehberler', metin: 'Rehberlerin her ekranın ilk açılışında kendiliğinden başlayıp başlamayacağını seçin. "Tüm rehberleri yeniden göster" hepsini görülmemiş yapar. "?" düğmesi her zaman çalışır.' }]
  }
};
