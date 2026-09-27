// EKRAN REHBERİ İÇERİKLERİ (bkz. rehber.js). Her rehber: { baslik, adimlar: [{ baslik, metin, hedef?, sira?, cizim?, ipucu? }] }.
//   hedef: vurgulanacak öğenin CSS seçicisi (ya da seçici listesi; ilk bulunan). Sayfada yoksa kart ortada, geniş açılır.
//   sira: numaralı iş listesi ("hangi sırayla"). cizim: canlandırılmış anlatım (tür: akis | maket | form | istek | katman;
//   ayrıntı rehber.js'te) — örnek veri kurulmaz.
// Yazım ilkesi: her adım "bu nedir → ne işe yarar → ne yapmalıyım" sorularını kısa cümlelerle cevaplar. Metinler geneldir:
// hiçbir ürün / şirket adı içermez.

import { IZIN_TANIMLARI } from './izin-tanimlari.mjs';
import { RISKLI_ORTAM_TANIMI } from './ortam-riski.mjs';

const ANA_AKIS = {
  tur: 'akis',
  kutular: [
    { baslik: 'Ortam + giriş', alt: 'Ayarlar', ikon: 'ayar' },
    { baslik: 'Ekran', alt: 'paket / tarama', ikon: 'ekran' },
    { baslik: 'Senaryo', alt: 'formdan', ikon: 'liste' },
    { baslik: 'Koşu', alt: 'tarayıcıda', ikon: 'oynat' },
    { baslik: 'Sonuç', alt: 'kanıtlarıyla', ikon: 'grafik' }
  ]
};

/** @type {Record<string, { baslik: string; adimlar: Array<Record<string, any>> }>} */
export const REHBERLER = {
  genel: {
    baslik: 'Nöbetçi',
    adimlar: [
      {
        baslik: "Nöbetçi'ye hoş geldiniz",
        metin: ['Nöbetçi, web ekranlarınızı ve servislerinizi kod yazmadan test eder: ekranı tanıtırsınız, senaryoyu formdan yazarsınız, Nöbetçi tarayıcıda sizin yerinize dener ve sonucu kanıtlarıyla (ekran görüntüsü, video) saklar.',
          'Çizim bir işin baştan sona yolunu gösteriyor. Her ekranın kendi rehberi, o ekrandaki adımları ayrıca anlatır.'],
        cizim: ANA_AKIS
      },
      {
        baslik: 'Verileriniz kasada',
        metin: ['Projeler, ortam adresleri, parolalar, test verisi ve sonuçlar yalnızca bu bilgisayarda, sizin parolanızla şifrelenmiş bir kasada durur. Kasa kilitliyken hiçbiri okunamaz.'],
        cizim: { tur: 'katman', katmanlar: [{ baslik: 'Kasa', alt: 'parolanızla şifreli' }, { baslik: 'Proje', alt: 'ekranlar, senaryolar, servisler' }, { baslik: 'Ortamlar', alt: 'test, canlı… ve giriş bilgileri' }] },
        ipucu: 'Kasa parolası unutulursa veriler kurtarılamaz. Ayarlar > Yedekleme\'den düzenli yedek alın.'
      },
      { baslik: 'Ana menü', hedef: '.ust-nav', metin: 'Sonuçlar, Senaryolar, Ekranlar ve Ayarlar buradan açılır. Servisler, Senaryolar bölümünün sol panelinde yer alır.' },
      { baslik: 'Proje seçici', hedef: '.proje-secici-kap', metin: 'Birden çok uygulamayı test ediyorsanız her biri ayrı bir projedir. Aralarında buradan geçersiniz; "+ Yeni proje" aynı kasada yeni bir proje açar.' },
      { baslik: 'Rehberi tekrar açmak', hedef: '.rehber-dugmesi', metin: 'Hangi ekrandaysanız o ekranın rehberini bu "?" düğmesiyle istediğiniz an yeniden açabilirsiniz. Kendiliğinden açılmasını Ayarlar > Arayüz\'den kapatabilirsiniz.', ipucu: 'Rehberde ← / → tuşlarıyla gezinebilir, Esc ile kapatabilirsiniz.' }
    ]
  },

  sonuclar: {
    baslik: 'Sonuçlar',
    adimlar: [
      {
        baslik: 'Sonuçlar ekranı',
        metin: ['Koşuların sonucu burada toplanır: ne kadar başarılı, hangi testler kaldı, zaman içinde iyiye mi kötüye mi gidiyor.', 'Bir testin neden kaldığını görmek için koşuyu, sonra testi açarsınız; her testin adım adım ekran görüntüleri ve videosu saklanır.'],
        cizim: { tur: 'maket', bolge: 'kartlar', etiket: 'Özet kartlar ve eğilim' }
      },
      { baslik: 'Ürün / ekran seçimi', hedef: '.alt-nav', metin: 'Soldan bir ekran seçerseniz kartlar, eğilim ve geçmiş yalnızca onun sonuçlarını gösterir. "Tümü" bütün projeyi gösterir.' },
      { baslik: 'Özet kartlar', hedef: ['.sonuc-kartlari', '.sonuc-kartlari-bos'], metin: 'Son tam koşunun başarı oranı, kalan ve atlanan test sayısı. Kalan testlerin hata türü (ör. ortam hatası, iş kuralı uyarısı) Ayarlar > Koşu > Hata sınıflandırma kurallarına göre belirlenir.' },
      { baslik: 'Eğilim', hedef: '.trend-kapsayici', metin: 'Tam koşuların zaman içindeki başarı oranı. Bir noktanın üzerine gelince o koşunun özeti görünür; tıklayınca koşu açılır.' },
      {
        baslik: 'Koşu geçmişi', hedef: 'section[aria-labelledby="gecmis-basligi"]',
        metin: ['Yapılan bütün koşuların listesi: tam koşular (Koşuyu başlat) ve tekil ▷ koşuları. Her satırda başlangıç zamanı, ortam, başarı oranı ve süre görünür.',
          'Bir satıra tıklayınca koşunun ayrıntısı açılır. İki satırı işaretleyip "Karşılaştır" ile iki koşunun farkını görebilirsiniz.'],
        ipucu: 'Liste üstteki tarih aralığına (Son 1 saat … Tümü) göre süzülür.'
      },
      {
        baslik: 'Hata kalıpları', hedef: 'section[aria-labelledby="kalip-basligi"]',
        metin: ['Kalan testlerin hata mesajları benzerliklerine göre gruplanır: değişken sayılar # ile gösterilir, aynı sorun tek satırda toplanır ve kaç testi etkilediği yazar.',
          '"Kalan testlerin hataları" kalan testleri, "Koşuda yakalanan mesajlar" ise geçen testlerde de ekranda görülen uyarı / hata mesajlarını kapsar. Bir kalıbı açınca etkilenen testler listelenir.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Hata mesajları', ikon: 'uyari' }, { baslik: 'Kalıp', alt: 'sayılar #', ikon: 'liste' }, { baslik: 'Etkilenenler', alt: 'test sayısı', ikon: 'grafik' }] },
        ipucu: 'Önce en çok testi etkileyen kalıba bakın: tek bir düzeltme birçok testi geçirebilir.'
      },
      {
        baslik: 'Kalan bir testi incelemek',
        sira: ['Koşu geçmişinden koşuyu açın.', 'Kalan testin satırına tıklayın: hata mesajı, "Beklenen / Görülen", adımlar, ekran görüntüleri ve video açılır.', 'Aynı hata başka testlerde de var mı, "Hata kalıpları"na bakın: tek bir sorun birçok testi düşürüyor olabilir.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Koşu', ikon: 'liste' }, { baslik: 'Kalan test', ikon: 'uyari' }, { baslik: 'Kanıtlar', alt: 'görüntü, video', ikon: 'video' }, { baslik: 'Karar', alt: 'düzelt / tekrarla', ikon: 'onay' }] }
      }
    ]
  },
  'sonuclar-kosu': {
    baslik: 'Koşu ayrıntısı',
    adimlar: [
      { baslik: 'Koşu ayrıntısı', metin: ['Bu koşudaki tüm testler, durumları ve süreleri. Kalan bir testi açarak hatasını, adımlarını ve kayıtlarını inceleyin.'], cizim: { tur: 'maket', bolge: 'tablo', etiket: 'Koşudaki testler' } },
      { baslik: 'Önceki koşuyla karşılaştırma', metin: 'Tam koşularda "yeni kalan" ve "düzelen" testler ayrıca işaretlenir; böylece yalnızca değişene odaklanırsınız.', ipucu: 'Bir test bir koşuda kalıp sonrakinde geçiyorsa ortamdan kaynaklı (kararsız) olabilir.' },
      { baslik: 'Raporu paylaşmak', metin: '"Raporu indir (HTML)" tek dosyalık, internet gerektirmeyen bir rapor üretir; e-postayla gönderebilir ya da yazdırabilirsiniz. Gizli bilgiler her zaman maskelenir; ekran görüntüleri ve ortam adresi yalnızca siz seçerseniz eklenir.', cizim: { tur: 'akis', kutular: [{ baslik: 'Seçenekler', ikon: 'ayar' }, { baslik: 'Önizleme', ikon: 'goz' }, { baslik: '.html', alt: 'tek dosya', ikon: 'indir' }] } }
    ]
  },
  'sonuclar-karsilastir': {
    baslik: 'Koşu karşılaştırması',
    adimlar: [
      { baslik: 'İki koşuyu seçmek', metin: 'Koşu geçmişinde iki satırı işaretleyip "Karşılaştır"a basın ya da bir koşunun ayrıntısında "Başka bir koşuyla karşılaştır…" deyin. Önceki koşu A, sonraki B olur; adres paylaşılabilir.', cizim: { tur: 'akis', kutular: [{ baslik: 'Koşu A', alt: 'önceki', ikon: 'liste' }, { baslik: 'Koşu B', alt: 'sonraki', ikon: 'liste' }, { baslik: 'Karşılaştır', ikon: 'grafik' }] } },
      { baslik: 'Özet ve değişimler', metin: 'Üstte A | B özeti ve farklar (↑ ↓). Tabloda her senaryonun A ve B durumu ile değişim rozeti: yeni kalan, düzelen, hep kalan, hep geçen, yalnız A\'da / yalnız B\'de. "Yalnız değişenler" varsayılan açıktır.', cizim: { tur: 'maket', bolge: 'tablo', etiket: 'A durumu | B durumu | değişim' }, ipucu: 'Önce "yeni kalan" satırlara bakın: son değişiklikten etkilenenler onlardır.' },
      { baslik: 'Adım adım fark', metin: 'Bir satırı açınca adımlar yan yana hizalanır; hata farkı (Beklenen / Görülen), iki tarafın ekran görüntüsü ve koşuda yakalanan mesajlar görünür. Servislerde istek başına HTTP kodu ve kontrol sonuçları karşılaştırılır; gövdeler gösterilmez.', cizim: { tur: 'istek', sol: 'A', sag: 'B', gidis: 'istek', donus: 'yanıt', kontroller: ['HTTP kodu', 'Kontrol sonuçları'] } },
      { baslik: 'Paylaşmak', metin: '"Karşılaştırmayı indir (HTML)" tek dosyalık bir rapor üretir. Gizli bilgiler her zaman maskelenir; ekran görüntüleri yalnız siz seçerseniz eklenir.' }
    ]
  },
  'sonuclar-sonuc': {
    baslik: 'Test ayrıntısı',
    adimlar: [
      { baslik: 'Test ayrıntısı', metin: 'Hata mesajı, "Beklenen / Görülen" karşılaştırması, adım adım ekran görüntüleri, video ve iz kaydı (trace) burada. Görüntüler ve video şifrelidir; yalnızca kasa açıkken gösterilir.', cizim: { tur: 'akis', kutular: [{ baslik: 'Adımlar', ikon: 'liste' }, { baslik: 'Kalınan adım', alt: 'kırmızı', ikon: 'uyari' }, { baslik: 'Görüntü + video', ikon: 'video' }] } },
      {
        baslik: 'Test kaldıysa ne yapmalı?',
        sira: ['Hangi adımda kaldığına bakın (kırmızı adım) ve o anın ekran görüntüsünü açın.', 'Ekran değiştiyse Ekranlar\'da ekranı yeniden tarayın ya da yeni paket yükleyin (tekrar analiz).', 'Beklenen sonuç değiştiyse senaryoyu düzenleyin.', 'Ortamdan kaynaklı geçici bir hataysa senaryoyu tekrar çalıştırın.']
      }
    ]
  },

  senaryolar: {
    baslik: 'Senaryolar',
    adimlar: [
      {
        baslik: 'Senaryolar ekranı',
        metin: ['Senaryo, bir ekranda denenecek tek bir durumdur: hangi alana ne yazılacağı ve sonunda ne görülmesi gerektiği. Örneğin "zorunlu alan boşken uyarı çıkmalı" bir senaryodur.', 'Senaryolar ekranın modelinden üretilen bir formla yazılır; Nöbetçi onları tarayıcıda sırayla dener.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Ekran modeli', alt: 'alanlar, kurallar', ikon: 'katman' }, { baslik: 'Senaryo formu', alt: 'değerler', ikon: 'duzenle' }, { baslik: 'Dene / Çalıştır', alt: 'tarayıcıda', ikon: 'oynat' }, { baslik: 'Sonuç', ikon: 'grafik' }] }
      },
      { baslik: 'Ekran seçimi', hedef: '.alt-nav', metin: 'Soldan bir ekran seçin; yalnızca onun senaryoları listelenir. Servisler de bu panelin altındadır.' },
      { baslik: 'Arama ve süzgeçler', hedef: '.senaryo-arac-cubugu', metin: 'Başlıkta arayın; "Koşuda", beklenen sonuç ve son duruma göre süzün.', ipucu: 'Klavyede "/" tuşu doğrudan aramaya gider.' },
      { baslik: 'Yeni senaryo ve koşu', hedef: '.sayfa-basligi .eylemler', metin: '"Yeni senaryo" ekran modelinden bir form açar. "Koşuyu başlat", "Koşuda" açık olan tüm senaryoları sırayla koşar; canlı ekran görüntüsünü panelden izlersiniz.' },
      { baslik: 'Senaryo tablosu', hedef: '.senaryo-tablosu', metin: 'Satırdaki ▷ tek senaryoyu çalıştırır, kalem düzenler, ⋯ kopyalar / geçmişi gösterir / siler. Birden çok satır seçince toplu işlemler (ör. toplu değer atama) çıkar.' },
      {
        baslik: 'Senaryo önerileri',
        hedef: '.senaryo-onerileri-dugmesi',
        metin: ['Bir ekran seçiliyken "Senaryo önerileri", ekranın modelinden ve mevcut senaryolardan öneri çıkarır: zorunlu alan boş, modeldeki kurallara göre sınır değerleri, koşullu alanların her dalı ve işaretlediğiniz 2–3 seçim alanının eksik kombinasyonları.',
          'Öneri yalnızca öneridir: işaretleyip "Senaryo olarak ekle" demeden senaryo oluşmaz. "Önizle" öneriyi formda doldurulmuş açar (kaydetmez). Eklenenler "Koşuda" kapalı gelir; beklenen sonucu belli olmayanlarda "Beklenen sonucu siz seçin" yazar.'],
        ipucu: 'Kişisel / gizli alanlarda değer üretilmez; mevcut senaryodaki değer ya da bağlı tablo kullanılır.'
      },
      {
        baslik: 'Önerilen çalışma sırası',
        sira: ['Ekranlar\'dan ekranı ekleyin (sayfa paketi, tarama ya da akış kaydı).', 'Bu ekranda "Yeni senaryo" ile senaryoyu yazın; önce "Dene" ile kaydetmeden deneyin.', 'Kaydedin ve "Koşuda" açık bırakın.', '"Koşuyu başlat" ile hepsini koşun; sonuçlar Sonuçlar ekranına düşer.'],
        cizim: { tur: 'maket', bolge: 'eylem', etiket: '"Yeni senaryo" ve "Koşuyu başlat" sağ üstte' }
      }
    ]
  },
  'senaryo-formu': {
    baslik: 'Senaryo formu',
    adimlar: [
      {
        baslik: 'Senaryo formu',
        metin: ['Form, ekranın modelinden çizilir: alanlar ekrandaki sırasıyla, bölümler hâlinde. Bir alanı doldurdukça ona bağlı alanlar görünür ya da gizlenir, zorunluluk kuralları hemen uygulanır.'],
        cizim: { tur: 'form', alanlar: ['Başlık', 'Akış', 'Alanlar', 'Beklenen sonuç'], dugme: 'Dene' }
      },
      {
        baslik: 'Doldurma sırası',
        sira: ['Başlığı yazın: senaryonun neyi sınadığını anlatsın.', 'Ekranın birden çok akışı varsa akışı seçin.', 'Alanları yukarıdan aşağı doldurun; bağımlı listeler üstteki seçime göre süzülür.', 'Kişi / kart / adres gibi veriler için değeri tablodan alın: alanın listesinde "Tablodan" (${Tablo.Sütun}; koşuda seçilen satırdan gelir; onay kutusu evet / hayır, dosya alanı dosya adı olarak) ya da kimlik alanında kayıt adı.', 'Tablodan alınan değerler için "Satır seçimi" kartında satırı seçin: Otomatik (bağlı alanlar ve ortam) ya da bir satır / koşullar.','Beklenen sonucu seçin: başarı ya da beklenen hata mesajı.', '"Dene" ile kaydetmeden deneyin; sonra Kaydet.']
      },
      { baslik: 'Akış diyagramı', metin: '"Akış diyagramı" sekmesi, seçimlerinize göre koşacak adımları kutular hâlinde gösterir; seçili ortamdaki son koşu varsa adımlar yeşil / kırmızı boyanır.', cizim: { tur: 'akis', kutular: [{ baslik: 'Giriş', ikon: 'anahtar' }, { baslik: 'Alanlar', ikon: 'duzenle' }, { baslik: 'Gönder', ikon: 'ok' }, { baslik: 'Kontrol', ikon: 'onay' }] } },
      { baslik: 'Bilmekte fayda var', metin: 'Boş bıraktığınız alan modelin varsayılanını alır; zorunlu bir alanı "Bilerek boş bırak" ile işaretlerseniz (olumsuz senaryo) koşucu o alana değer yazmaz. "Mutlaka görünmeli" işaretli bir alan ekranda görünmezse test bilerek düşer.', ipucu: 'Dene sonucu senaryoya kaydedilmez; Sonuçlar\'da "deneme" olarak görünür.' }
    ]
  },

  servisler: {
    baslik: 'Servisler',
    adimlar: [
      {
        baslik: 'Servis testleri',
        metin: ['Servis testleri tarayıcı açmadan çalışır: Nöbetçi servise bir istek gönderir, gelen yanıtı sizin tanımladığınız kontrollerle doğrular (ör. "hata yok", "numara alanı dolu").'],
        cizim: { tur: 'istek', sol: 'Nöbetçi', sag: 'Servis', gidis: 'istek', donus: 'yanıt', kontroller: ['Hata yok', 'Numara alanı dolu', 'Tutar > 0'] }
      },
      {
        baslik: 'Çalışma sırası',
        sira: ['"Servis ekle" ile servisi tanımlayın: WSDL adresi, SoapUI projesi, Postman koleksiyonu ya da elle.', 'Metodu seçip senaryo oluşturun; alanları sabit değer ya da test verisi tablolarına bağlayın.', 'Yanıt kontrollerini ekleyin.', 'Birbirine bağlı istekler için Akışlar sekmesini kullanın.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Servis', alt: 'ekle', ikon: 'ag' }, { baslik: 'Senaryo', alt: 'istek', ikon: 'duzenle' }, { baslik: 'Kontroller', ikon: 'onay' }, { baslik: 'Akış', alt: 'zincir', ikon: 'katman' }] }
      }
    ]
  },
  'servis-ekle': {
    baslik: 'Servis ekle',
    adimlar: [
      {
        baslik: 'Servis ekleme yolları',
        metin: ['Servisi WSDL adresinden, bir SoapUI projesinden, bir Postman koleksiyonundan ya da elle ekleyebilirsiniz. Her yolda önce önizleme gösterilir; onayınız olmadan hiçbir şey kaydedilmez.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Kaynak', alt: 'WSDL / SoapUI / Postman', ikon: 'yukle' }, { baslik: 'Önizleme', alt: 'metotlar', ikon: 'goz' }, { baslik: 'Onay', ikon: 'onay' }, { baslik: 'Servis', ikon: 'ag' }] }
      },
      {
        baslik: 'Yalnız adresiniz varsa: REST',
        metin: ['"Adım adım" sekmesinde türü "REST (JSON)" seçin. Tam adresi yapıştırın (ör. xxx.com/api/v1/authenticate): sunucu kısmı taban adres olur, şema yazılmadıysa https:// varsayılır. İstekler adımında yolun devamını ve HTTP işlemini (GET / POST / PUT…) seçin; POST için örnek JSON gövde yapıştırabilirsiniz, alanları tablo sütunlarına bağlanır.'],
        cizim: { tur: 'form', alanlar: ['Taban adres', 'HTTP işlemi + yol', 'Gövde örneği'], dugme: 'Kaydet' }
      },
      { baslik: 'Gizli değerler', metin: 'Parola, anahtar ya da token gibi gizli değerler kasaya şifreli yazılır ve ekranda maskeli görünür. Postman ortamındaki gizli değerler yalnızca siz onaylarsanız alınır.', cizim: { tur: 'katman', katmanlar: [{ baslik: 'Kasa', alt: 'şifreli' }, { baslik: 'Servis giriş bilgisi', alt: 'maskeli gösterilir' }] } },
      { baslik: 'Ekledikten sonra', sira: ['Servisin her ortamdaki adresini kontrol edin.', 'Giriş gerekiyorsa servis giriş bilgisini ekleyin.', 'Senaryolar sekmesinden ilk senaryoyu oluşturun.'] }
    ]
  },
  servis: {
    baslik: 'Servis',
    adimlar: [
      { baslik: 'Servis sayfası', metin: 'Sekmeler: Senaryolar (istekler ve kontroller), Akışlar (istekleri zincirleme), Parametreler (değer tanımları), Raporlar (koşu geçmişi), İşlemler (metotlar).', cizim: { tur: 'maket', bolge: 'arac', etiket: 'Sekmeler ekranın üstünde' } },
      {
        baslik: 'Senaryo türü: tek istek ya da akış',
        metin: ['"Senaryo ekle"de önce türü seçin. Tek istek: bir operasyona istek atılır. Akış: bir servis akışının operasyonları sırayla çağrılır (ör. önce sipariş, sonra fatura); akış başka servislerin operasyonlarını da içerebilir.',
          'Ekranlardaki gibi: akış adımların sırasını ve adımlar arasında taşınan değerleri tanımlar, senaryo ise verileri tutar.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Akış', alt: 'operasyon sırası', ikon: 'katman' }, { baslik: 'Senaryo', alt: 'her adımın verisi', ikon: 'liste' }, { baslik: 'Koşu', alt: 'adım adım', ikon: 'oynat' }] }
      },
      {
        baslik: 'Tek istek senaryosu',
        sira: ['Metodu seçin.', 'Alanları doldurun: sabit değer, test verisi tablosu sütunu, hesaplama kuralı ya da akış değeri.', 'Kontrolleri ekleyin.', '"Dene" ile seçili ortamda deneyin, sonra kaydedin.'],
        cizim: { tur: 'form', alanlar: ['Metot', 'Alanlar', 'Kontroller'], dugme: 'Dene' }
      },
      {
        baslik: 'Akış senaryosu',
        sira: ['Türü "Akış" seçin ve akışı seçin (bu servisten geçen akışlar listelenir).', 'Her adım ayrı bölümde sorulur ("1. Servis · Operasyon"): o metodun zorunlu ve seçili alanlarını doldurun. Aynı adlı alan her adımda ayrı sorulur.',
          'Önceki adımdan gelen alanlar kilitlidir ("1. adımdan gelir") ve sorulmaz.', 'Her adımın beklenen sonucunu kontrol edin (ör. bu adım bir hata vermeli).', 'Dene ile TEST’te deneyin, sonra kaydedin. Akış senaryosu, akışın geçtiği her serviste "akış: <ad>" rozetiyle listelenir.'],
        cizim: { tur: 'form', alanlar: ['Akış', '1. adımın alanları', '2. adımın alanları (kilitliler hariç)', 'Beklenen sonuçlar'], dugme: 'Dene' }
      },
      { baslik: 'Gizli bilgiler', metin: 'Yanıtlarda ve raporlarda gizli adlı alanlar maskelenir. Maskelenecek ek adları Ayarlar > Güvenlik > Maskeleme\'den ekleyebilirsiniz.' }
    ]
  },
  'servis-sonuclari': {
    baslik: 'Servis sonuçları',
    adimlar: [
      {
        baslik: 'Servis sonuçları',
        metin: ['Servis koşularının özeti: başarı oranı, kalan ve atlanan senaryolar, süre ve zaman içindeki eğilim. Soldan tek bir servisi ya da akışı seçerek yalnızca onun sonuçlarına bakabilirsiniz.'],
        cizim: { tur: 'maket', bolge: 'kartlar', etiket: 'Kartlar, eğilim ve koşu geçmişi' }
      },
      { baslik: 'Tarih aralığı ve ortam', metin: 'Üstteki tarih aralığıyla (Son 1 saat, Bugün, Son 7 gün…) ve ortam seçimiyle süzün. "Denemeleri de say" açıkken "Dene" ile yapılan tek çalıştırmalar da hesaba girer.' },
      {
        baslik: 'Kalan bir senaryoyu incelemek',
        sira: ['Koşu geçmişinden koşuyu açın.', 'Kalan senaryoya tıklayın: kontroller, istek ve yanıt (gizli alanlar maskeli), HTTP kodu ve süre açılır.', 'Aynı hata başka senaryolarda da var mı, "Hata kalıpları"na bakın.'],
        cizim: { tur: 'istek', sol: 'Nöbetçi', sag: 'Servis', gidis: 'istek', donus: 'yanıt', kontroller: ['Kontroller', 'Maskeli yanıt'] }
      }
    ]
  },
  'servis-akislari': {
    baslik: 'Servis akışları',
    adimlar: [
      {
        baslik: 'Akış nedir?',
        metin: ['Akış, hangi servise hangi sırayla istek atılacağını tanımlar: adımlar servislerin operasyonlarıdır (başka servisler de olabilir). Bir adımın yanıtından okunan değer (ör. oluşan kayıt numarası) sonraki adımın bir alanına bağlanır.',
          'Alan DEĞERLERİ akışta değil, akışı kullanan senaryodadır (ekranlardaki akış ↔ senaryo ayrımıyla aynı).'],
        cizim: { tur: 'akis', kutular: [{ baslik: '1. operasyon', alt: 'kayıt oluştur', ikon: 'ag' }, { baslik: 'Değer oku', alt: '${akis:No}', ikon: 'hedef' }, { baslik: '2. operasyon', alt: 'No alanı ← akış', ikon: 'ag' }, { baslik: 'Senaryo', alt: 'verileri doldurur', ikon: 'liste' }] }
      },
      { baslik: 'Oturum (token) akışı', metin: 'Giriş gerektiren servisler için bir oturum akışı tanımlayın. Token\'ın süresi dolana kadar mı kullanılacağını, yoksa her istekte yeniden mi alınacağını akışta siz seçersiniz.', cizim: { tur: 'istek', sol: 'Nöbetçi', sag: 'Giriş servisi', gidis: 'giriş', donus: 'token', kontroller: ['Token alındı', 'Sonraki isteklere eklendi'] } },
      {
        baslik: 'Akış kurma sırası',
        sira: ['"Yeni akış"ta "+" ile adım koyun: bir servisin operasyonu (varsayılan), kayıtlı senaryo (eski tür) ya da SQL sorgusu.', 'Değer üreten adımda "Yanıttan oku" ile değeri tanımlayın (XPath / JSON yolu / başlık; gizliyse işaretleyin).',
          'Sonraki adımda "Alan bağla" ile o değeri operasyonun alanına bağlayın; diyagramdaki oklar taşınan değerleri gösterir.', 'Kaydedin; sayfanın altındaki "Bu akışın senaryoları"ndan "Senaryo ekle" ile verileri girin.'],
        cizim: { tur: 'akis', kutular: [{ baslik: '+ Operasyon', ikon: 'artiYalin' }, { baslik: 'Yanıttan oku', ikon: 'hedef' }, { baslik: 'Alan bağla', ikon: 'ok' }, { baslik: 'Senaryo ekle', ikon: 'liste' }] }
      }
    ]
  },

  ekranlar: {
    baslik: 'Ekranlar',
    adimlar: [
      {
        baslik: 'Ekranlar',
        metin: ['Test edeceğiniz her sayfa bir "ekran"dır. Ekranın modeli; alanları, adımları ve kuralları (hangi alan ne zaman görünür, hangisi zorunlu) tutar. Senaryo formu ve koşu bu modelden çalışır.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Sayfa', alt: 'uygulamanızda', ikon: 'ekran' }, { baslik: 'Paket / tarama', alt: 'yalnız okur', ikon: 'ara' }, { baslik: 'Ekran modeli', alt: 'sürümlü', ikon: 'katman' }, { baslik: 'Senaryolar', ikon: 'liste' }] }
      },
      {
        baslik: 'Ekran eklemenin üç yolu',
        sira: ['Ekranı tara: Nöbetçi sayfayı seçtiğiniz ortamda kendisi açıp yalnızca okur.', 'Akışı kaydet: işlemi siz görünür bir tarayıcıda yaparken Nöbetçi adımları kaydeder.', 'Yapay zekâ ile oluştur: istek metnini kopyalayıp sayfanın bağlantısıyla yapay zekâ aracınıza verin, ürettiği paketi yükleyin.'],
        cizim: { tur: 'maket', bolge: 'eylem', etiket: 'Üçü de "Sayfa ekle"de yan yana' }
      },
      { baslik: 'Sol panel', hedef: '.alt-nav', metin: 'Ekranlar, alt modeller (ör. bir kart bloğu) ve ortak akışlar (birden çok ekranın kullandığı adımlar, ör. ödeme) burada. Devre dışı ekranlar varsayılan olarak gizlidir.' },
      { baslik: 'Ekran değişince', metin: 'Sayfa değiştiyse aynı ekrana yeni paket yükleyin ya da yeniden tarayın. Farklar "bulgular" olarak gelir; kabul ettikleriniz yeni model sürümü olur, eski senaryolar korunur.', cizim: { tur: 'akis', kutular: [{ baslik: 'Yeni tarama', ikon: 'yenile' }, { baslik: 'Bulgular', alt: 'farklar', ikon: 'uyari' }, { baslik: 'Kabul / ret', ikon: 'onay' }, { baslik: 'Yeni sürüm', ikon: 'katman' }] } }
    ]
  },
  'ekran-ekle': {
    baslik: 'Sayfa ekle',
    adimlar: [
      { baslik: 'Sayfa paketi', metin: 'Paket, sayfanın alanlarını, adımlarını ve önerilen senaryoları içeren bir JSON dosyasıdır. Yükleyince önce önizleme gösterilir; hiçbir şey onayınız olmadan kaydedilmez.', cizim: { tur: 'akis', kutular: [{ baslik: 'Paket', alt: '.json', ikon: 'dosya' }, { baslik: 'Önizleme', ikon: 'goz' }, { baslik: 'Seçim', alt: 'senaryolar', ikon: 'liste' }, { baslik: 'Ekle', ikon: 'onay' }] } },
      { baslik: 'Paketiniz yoksa: üç yol', hedef: '.ekleme-kutulari', sira: ['Ekranı tara: Nöbetçi sayfayı yalnızca okuyarak tarar; düğmelere basmaz, form göndermez.', 'Akışı kaydet: işlemi siz yaparsınız, Nöbetçi adımları ve alanları kaydeder (çok adımlı formlar için).', 'Yapay zekâ ile oluştur: "İstek metnini kopyala" ile metni alın, sayfanın bağlantısıyla (ve "Paket biçimini indir" dosyasıyla) yapay zekâ aracınıza verin; ürettiği paketi yukarıdaki "Dosya seç" ile yükleyin.'] },
      { baslik: 'Adımlar', sira: ['Paketi yükleyin ya da aşağıdaki kutulardan birini seçin.', 'Önizlemede alanları ve uyarıları kontrol edin.', 'Eklenecek senaryo önerilerini ve ortamlarını seçin.', 'Test verisine yazılacakları seçin: tablo başına yaz / birleştir / yeni ad / atla ve bağlanacak alanlar (seçmediğiniz yazılmaz).', '"Ekle": ekran, model sürüm 1, seçilen senaryolar ve onayladığınız tablolar oluşur.'] },
      { baslik: 'Güvenlik', metin: 'Tarama sayfayı yalnızca okur; kayıt oluşturan düğmelere basmaz. Yasak adreslere (Ayarlar > Güvenlik) hiç gidilmez.' }
    ]
  },
  ekran: {
    baslik: 'Ekran ayrıntısı',
    adimlar: [
      { baslik: 'Ekran ayrıntısı', metin: 'Modelin adımları, alanları ve kuralları; sürüm geçmişi; akışlar ve senaryolar bu sayfada toplanır.', hedef: '.sayfa-basligi' },
      { baslik: 'Eylemler', hedef: '.sayfa-basligi .eylemler', metin: 'Tekrar analiz (yeni paket), ekranı yeniden tara, akışı kaydet ve ⋯ menüsü (yeniden adlandır, URL yolunu düzenle, devre dışı bırak, sil).' },
      { baslik: 'Akışlar', metin: 'Bir ekranda birden çok akış olabilir (ör. bireysel ve kurumsal yol). Akış diyagramında adımları sürükleyip sıralar, ortak akış bloklarını eklersiniz.', cizim: { tur: 'akis', kutular: [{ baslik: 'Giriş', ikon: 'anahtar' }, { baslik: 'Form', ikon: 'duzenle' }, { baslik: 'Ortak akış', alt: 'ör. ödeme', ikon: 'pusula' }, { baslik: 'Sonuç', ikon: 'onay' }] } },
      { baslik: 'Önerilen sıra', sira: ['Modeli kontrol edin (alan etiketleri, zorunluluk, seçenekler).', 'Gerekirse seçim alanlarını test verisi tablolarına bağlayın.', 'Mevcut senaryolardaki düz değerleri Test verisi sekmesinde "Değerleri tabloya bağla…" ile tabloya çevirin (önce plan gösterilir, seçtikleriniz onayla yazılır; koşuda ekrana giden değer değişmez).', 'Senaryolar\'dan senaryo oluşturun.'] }
    ]
  },
  'akis-tasarimi': {
    baslik: 'Akış tasarımı',
    adimlar: [
      { baslik: 'Akış diyagramı', metin: 'Ekranın adımları kutular hâlinde, çalışma sırasıyla. Kutuları sürükleyerek sıralar, "+" ile koşullu adım ya da ortak akış eklersiniz.', cizim: { tur: 'akis', kutular: [{ baslik: 'Adım 1', ikon: 'duzenle' }, { baslik: 'Koşullu', alt: 'ör. Kurumsal ise', ikon: 'isaret' }, { baslik: 'Ortak akış', ikon: 'pusula' }, { baslik: 'Kontrol', ikon: 'onay' }] } },
      { baslik: 'Sıra', sira: ['Mevcut akışı kopyalayın ya da "Yeni akış" açın.', 'Adımları ekleyin / sıralayın; koşulları yazın (ör. "Müşteri tipi = Kurumsal ise").', '"+ > Ortak akış" ile ortak blokları ekleyin; isteğe bağlıysa senaryoda "dahil" seçilir.', 'Kaydedin: etkilenecek senaryolar önce gösterilir, onayınızla kaydedilir.'] }
    ]
  },
  bulgular: {
    baslik: 'Bulgular',
    adimlar: [
      { baslik: 'Tekrar analiz bulguları', metin: 'Yeni paket ya da tarama ile mevcut model arasındaki farklar: eklenen / kaldırılan alanlar, değişen seçenekler, seçiciler ve koşu tanımları.', cizim: { tur: 'akis', kutular: [{ baslik: 'Eski model', ikon: 'arsiv' }, { baslik: 'Farklar', ikon: 'uyari' }, { baslik: 'Kararınız', ikon: 'kullanici' }, { baslik: 'Yeni sürüm', ikon: 'katman' }] } },
      { baslik: 'Sıra', sira: ['Her bulguyu inceleyin (etkilenen senaryolar gösterilir).', 'Kabul ya da reddedin.', '"Uygula": yalnızca kabul edilenlerle yeni model sürümü oluşur. Reddedilenler bir sonraki analizde tekrar sorulmaz.'] }
    ]
  },
  tarama: {
    baslik: 'Ekran taraması',
    adimlar: [
      { baslik: 'Tarama', metin: 'Nöbetçi sayfayı seçili ortamda açar, alanları ve seçenekleri okur ve bir sayfa paketi üretir. İlerlemeyi burada izlersiniz; bitince paket önizlemesine geçilir.', cizim: { tur: 'maket', bolge: 'form', etiket: 'Alanlar tek tek okunur' } },
      { baslik: 'Dikkat', metin: 'Tarama yalnızca okur ve bilgi amaçlı düğmelere basar (sekme, ok, sorgula). Kayıt oluşturan düğmelere basılmaz. Süre sınırı ve girişte saklanan oturumun kullanılıp kullanılmayacağı Ayarlar > Koşu\'dadır; Giriş adımında hangisinin yapıldığı (saklanan oturum / baştan giriş) yazar.' }
    ]
  },

  'ayarlar-proje': {
    baslik: 'Proje ve ortamlar',
    adimlar: [
      { baslik: 'Ayarlar', hedef: '.alt-nav', metin: 'Ayarlar bölümleri solda. Buradaki her seçim sizin kararınızdır; Nöbetçi\'nin kodunda sizin yerinize verilmiş bir tercih yoktur.' },
      { baslik: 'Ortamlar', metin: 'Testlerin çalışacağı adresler (ör. test, hazırlık, canlı). Riskli ortamda yalnızca test ortamına özel adımlar (ör. ödeme) atlanır. Adresler kasada şifrelidir.', cizim: { tur: 'katman', katmanlar: [{ baslik: 'Proje' }, { baslik: 'TEST ortamı', alt: 'riskli değil' }, { baslik: 'CANLI ortamı', alt: 'riskli: yalnız güvenli adımlar' }] } },
      {
        baslik: 'Bu ortam riskli mi?',
        metin: [RISKLI_ORTAM_TANIMI, 'Riskli ortamda her çalıştırma ayrıca onay ve Ayarlar > İzinler\'de "Canlı / riskli ortamda çalıştırma" izni ister; akış / giriş kaydı yapılamaz; servis "Dene"si yapılamaz.'],
        ipucu: 'Yanıtlanmamış ortamlar listede "Riskli mi? belirtin" olarak görünür. "Evet"ten "Hayır"a geçmek onay ister; her değişiklik ortamın "Geçmiş"inde durur.'
      },
      { baslik: 'Kurulum sırası', sira: ['Ortamları ekleyin.', 'Giriş profillerini ve her ortamın giriş tarifini tanımlayın.', 'Test verisini (ekran listeleri, kişi ve kayıt tabloları) ekleyin.', 'Koşu ayarlarını (video, yeniden deneme, süreler) gözden geçirin.'], cizim: { tur: 'akis', kutular: [{ baslik: 'Ortamlar', ikon: 'ag' }, { baslik: 'Giriş', ikon: 'anahtar' }, { baslik: 'Test verisi', ikon: 'veri' }, { baslik: 'Koşu', ikon: 'ayar' }] } }
    ]
  },
  'ayarlar-giris': {
    baslik: 'Giriş profilleri',
    adimlar: [
      { baslik: 'Giriş profili', metin: 'Testlerin uygulamaya hangi kullanıcıyla gireceği. Parola, doğrulama (TOTP) anahtarı ve sabit SMS kodu kasada şifreli saklanır; burada gösterilmez.', cizim: { tur: 'form', alanlar: ['Kullanıcı adı', 'Parola', 'Doğrulama'], dugme: 'Giriş' } },
      { baslik: 'Giriş tarifi', metin: 'Her ortam için giriş sayfasının tarifi: kullanıcı / parola alanı, giriş düğmesi, başarı ve hata göstergeleri, iki aşamalı doğrulama ve girişten sonra bağlam seçimi (rol, şube…). Tüm senaryolar bu tarifle giriş yapar; giriş değişirse tek yerde düzeltirsiniz.', cizim: { tur: 'akis', kutular: [{ baslik: 'Giriş sayfası', ikon: 'ekran' }, { baslik: 'Kimlik', alt: 'kasadan', ikon: 'anahtar' }, { baslik: 'Doğrulama', alt: 'varsa', ikon: 'kalkan' }, { baslik: 'Bağlam', alt: 'rol / şube', ikon: 'kullanici' }] } },
      { baslik: 'Sıra', sira: ['Giriş profilini ekleyin.', 'Ortamın giriş tarifinde "Varsayılanları öner" ile alanları algılatın (yalnızca siz basınca).', 'Önerileri kontrol edip kaydedin.'] }
    ]
  },
  'ayarlar-test-verisi': {
    baslik: 'Test verisi',
    adimlar: [
      { baslik: 'Tablolar', metin: 'Her satır birlikte geçerli değerlerdir (ör. kanal | kullanıcı | ürün kodu). Ekran ve servis alanları sütunlara bağlanır; senaryoda seçim yaptıkça diğer seçenekler süzülür.', cizim: { tur: 'maket', bolge: 'tablo', etiket: 'Satırlar birlikte geçerli değerler' } },
      { baslik: 'Tablo grupları', metin: 'Soldaki liste iki gruptur: "Kişi ve kayıt verileri" (sizin tablolarınız) ve "Ekran listeleri" (ekranlardan içe alınan seçenek listeleri; ekran başına alt grup). Grupları açıp kapatabilirsiniz; tercih bu tarayıcıda hatırlanır. Arama tüm gruplarda çalışır.', cizim: { tur: 'maket', bolge: 'sol', etiket: 'Gruplar ve arama' } },
      { baslik: 'Kişi ve kayıt verileri', metin: 'Kişi, kart, adres gibi kayıtlar tablolarda satırdır. Senaryo değeri tablodan alır: ${Tablo.Sütun} (aynı tablo iki kez gerekiyorsa ${Tablo[etiket].Sütun}); koşuda seçilen satırdan gelir, değer senaryoya yazılmaz. Gizli sütunlar kasada şifrelidir ve maskeli gösterilir.', cizim: { tur: 'katman', katmanlar: [{ baslik: 'Tablo', alt: 'ör. Kişi' }, { baslik: 'Satır', alt: 'ör. Test kişisi 1' }, { baslik: 'Sütunlar', alt: 'gizli olanlar şifreli' }] } },
      {
        baslik: 'Karşılıklar', hedef: ['.karsilik-dugmesi', '.tablo-duzenleyici thead'],
        metin: ['Tabloya ekranda görünen değeri yazarsınız. Sayfadaki seçeneğin değeri ya da servise giden değer farklıysa, sütun başlığındaki "Karşılıklar" düğmesiyle her değer için ayrıca "Sayfa değeri" (ekrandaki seçeneğin değeri) ve "Servis değeri" (servis gövdesine yazılan) tanımlanır. Örnek: EKSPRES → sayfa: 1, servis: EXP.',
          'Boş bırakılan karşılıkta tablodaki değer kullanılır. Ekran taranınca ya da alan sütuna bağlanınca sayfa değerleri kendiliğinden dolabilir; düğmedeki sayı tanımlı karşılık sayısıdır.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Tablo değeri', alt: 'EKSPRES', ikon: 'veri' }, { baslik: 'Sayfa değeri', alt: '1', ikon: 'ekran' }, { baslik: 'Servis değeri', alt: 'EXP', ikon: 'ag' }] }
      },
      { baslik: 'Sıra', sira: ['Tabloyu oluşturun (sütunlar).', 'Satırları ekleyin (ortama özel olabilir).', 'Ekranın ya da servisin alanlarını sütunlara bağlayın; kişi / kayıt değerini senaryoda ${Tablo.Sütun} ile alın.'] },
      { baslik: 'Değer değişince', metin: 'Bir hücrenin değerini değiştirip (ör. "a" → "b") kaydettiğinizde, o değeri düz metin olarak kullanan senaryolar (ekran alanı, servis alanı, satır seçimi) listelenir: seçtiklerinizi tabloyla birlikte yeni değere güncelleyebilir ya da yalnız tabloyu kaydedebilirsiniz. Silinen değeri kullanan senaryolar uyarı olarak gösterilir; koşan senaryolar atlanır. Karşılıklar yeni değere kendiliğinden taşınır. SoapUI / Postman aktarımı ve "Test verisine taşı" mevcut bir değeri değiştirecekse bu, önizlemede "Tabloda değişecek değerler ve etkilenen senaryolar" bölümünde görünür (seçimlerinizle güncellenir; "Mevcut değerleri koru" ile dolu hücrelerin üzerine yazılmaz); aktarım işaretli senaryolarla birlikte yazılır, arada veri değiştiyse yeniden onay istenir.' }
    ]
  },
  'ayarlar-kosu': {
    baslik: 'Koşu ayarları',
    adimlar: [
      { baslik: 'Koşu ayarları', metin: 'Video / ekran görüntüsü / iz kaydı, yeniden deneme, süre limiti, bekleme süreleri, servis zaman aşımı, tarih biçimi ve tarama / akış kaydı (süreler, ekran boyutu, dil, açılır liste keşif sınırı, girişte giriş alanı beklemesi; koşudaki giriş beklemelerinden ayrı). Tarama ve akış kaydında giriş: varsayılan her seferinde baştan giriş; "Koşunun saklanan oturumunu kullan" seçilirse koşunun aynı ortam ve giriş profili için şifreli sakladığı oturum denenir ("Girişte oturum kontrolü" süresiyle), geçersizse baştan girilip oturum güncellenir; "Giriş yapmadan aç" saklanan oturumu hiç kullanmaz. Değişiklik sonraki koşulardan itibaren geçerlidir.', cizim: { tur: 'form', alanlar: ['Video', 'Yeniden deneme', 'Süre limiti'], dugme: 'Kaydet' } },
      { baslik: 'Gelişmiş koşu davranışı', metin: 'Açılır bölümde koşucunun kararları: alan görünmezse ne kadar beklenip atlanacağı ya da testin kalacağı, tarayıcı onay pencerelerine verilecek yanıt, adım / giriş beklemeleri, tablodan satır seçimi (ilk uyan ya da rastgele; ortamı boş satır her ortamda geçerli), SQL satır sınırı (SQL adımındaki beklenen satır sayısı bunu aşamaz: kaydederken uyarı verilir; sınırı düşürürseniz aşan adımlar koşuda anlaşılır bir hatayla kalır), koşu tarayıcısının boyutu, dili ve saat dilimi. Her ayarın varsayılanı Nöbetçi\'nin bugüne kadarki davranışıdır.', ipucu: 'Senaryolar her zaman sırayla koşar: giriş oturumu paylaşıldığı için eşzamanlı koşu sunulmaz.' },
      { baslik: 'Hata sınıflandırma', metin: 'Kalan testin hata mesajında belirli bir metin geçerse hangi kategoride görüneceğini siz tanımlarsınız (ör. uygulamanızın iş kuralı uyarısı "iş kuralı" sayılsın).' },
      {
        baslik: 'Zamanlanmış koşular',
        metin: 'Nöbetçi\'nin belirli saatlerde kendiliğinden koşu başlatmasını ayarlayın: her gün, haftanın seçili günleri ya da her N saatte bir. Koşular yalnızca Nöbetçi açıkken ve kasa açıkken çalışır. Varsayılan olarak kaçan zamanlar sonradan koşulmaz, başka bir koşu sürerken gelen zaman atlanır; kartın "Zamanlanmış koşu davranışı" bölümünden "Sonra bir kez koş" / "Bitince koş" seçebilirsiniz.',
        cizim: { tur: 'akis', kutular: [{ baslik: 'Zaman', alt: 'her gün 07:00', ikon: 'saat' }, { baslik: 'Kasa açık mı?', ikon: 'kilit' }, { baslik: 'Koşu', alt: '"Koşuda" senaryolar', ikon: 'oynat' }, { baslik: 'Bildirim', alt: 'isteğe bağlı', ikon: 'simsek' }] },
        ipucu: 'Canlı ortam için ayrıca açık onay gerekir. Her kuralın son 20 çalışması ve sonuç bağlantıları "Geçmiş"te durur. '
          + '"Kasa kilitliyken ve açılışta" bölümündeki üç seçenek (kilitliyken çalışma, Windows oturumuna bağlı açma, açılışta arka planda başlatma) varsayılan kapalıdır; her birinin ne yaptığı ve riski yanında yazar. '
          + 'Zamanlanmış koşular için Ayarlar > İzinler\'de "Arka plan çalışması" izni gerekir; Windows seçenekleri "Sistem değişikliği" izni ister.'
      }
    ]
  },
  'ayarlar-yedekleme': {
    baslik: 'Yedekleme',
    adimlar: [
      { baslik: 'Yedekler', metin: 'Dışa aktar: şifreli .tayedek dosyası. İçe aktar: başka bir bilgisayarın yedeğindeki kayıtları seçerek alın. Otomatik yedek her gün alınır. Yedeğin tamamı yüklenince (ya da seçmeli içe aktarmada Ayarlar\'daki "izinler" kaydı alınınca) yedekteki izinler ve ortamların riskli seçimleri olduğu gibi geçerli olur; Nöbetçi açıldığında bir kez hangi izinlerin açık olduğunu gösteren bir uyarı çıkar ("Tamam" ya da "İzinlere git" ile kapatılınca kimse için bir daha çıkmaz).', cizim: { tur: 'akis', kutular: [{ baslik: 'Kasa', ikon: 'kilit' }, { baslik: '.tayedek', alt: 'şifreli', ikon: 'arsiv' }, { baslik: 'Başka bilgisayar', ikon: 'bilgisayar' }] } },
      { baslik: 'Saklama', metin: 'Kaç otomatik yedeğin tutulacağını ve koşu sonuçlarının ne kadar saklanacağını siz belirlersiniz. Geçmiş sonuçları buradan silebilirsiniz (önce kaç kayıt silineceği gösterilir).' }
    ]
  },
  // İzin metinleri izin tanımlarından gelir (izin-tanimlari.mjs; Ayarlar > İzinler ve kapalı izin uyarısıyla aynı kaynak).
  'ayarlar-izinler': {
    baslik: 'İzinler',
    adimlar: [
      {
        baslik: 'İzinler nedir?',
        metin: ['Nöbetçi\'nin sizin adınıza yaptığı her işlem (tarayıcıyla siteye girmek, servise istek atmak, veritabanını sorgulamak, dışarıya bildirim göndermek…) bir izne bağlıdır.',
          'Tüm izinler varsayılan olarak KAPALIDIR. Kapalı bir izne bağlı işlem denenirse yapılmaz; ekranda "Bu işlem için Ayarlar > İzinler\'de … iznini açmalısınız." uyarısı ve "İzinlere git" düğmesi çıkar.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'İşlem', alt: 'ör. Koşuyu başlat', ikon: 'oynat' }, { baslik: 'İzin açık mı?', ikon: 'kalkan' }, { baslik: 'Yapılır', alt: 'mevcut onaylarla', ikon: 'onay' }] }
      },
      { baslik: 'İzin listesi', hedef: '.izin-listesi', sira: IZIN_TANIMLARI.map((t) => `${t.etiket}: ${t.aciklama}`) },
      { baslik: 'Ne yapar, nerede kullanılır?', hedef: '.izin-soru', metin: 'Her iznin yanındaki "?" düğmesi o iznin neler yapabildiğini, hangi ekranlarda ve hangi işlemlerde kullanıldığını, riskini ve kapalıyken ne olduğunu açar. Klavyeyle de açılır; Esc kapatır.' },
      { baslik: 'Açmak ve kapatmak', hedef: '.izin-anahtari', metin: 'Açarken kısa bir onay penceresi iznin ne yaptığını ve riskini gösterir. Kapatmak her zaman serbesttir. İzin açıkken de işlem başına onaylar (ör. canlı ortam onayı) sorulmaya devam eder.', ipucu: 'Zamanlanmış koşularda kapalı izne bağlı işlem atlanır ve geçmişte "izin kapalı: …" olarak görünür.' },
      { baslik: 'Son değişiklikler', metin: 'Hangi iznin kim tarafından, ne zaman açılıp kapandığı bu bölümün altında listelenir.' },
      { baslik: 'Yedekten yüklemede', metin: 'Yedekten tam yüklemede izinler yedektekiyle olduğu gibi geçerli olur (değiştirilmez). Yüklemeden sonra Nöbetçi açılınca bir kez "Yedek yüklendi" penceresi açık izinleri ve ortamların riskli seçimlerini gösterir; buradan gözden geçirin.' }
    ]
  },
  'ayarlar-guvenlik': {
    baslik: 'Güvenlik',
    adimlar: [
      { baslik: 'Kasa', metin: 'Kasa kilitlenince şifreli bilgiler okunamaz. İşlem yapılmazsa kasa ayarladığınız sürede kendiliğinden kilitlenir.', cizim: { tur: 'katman', katmanlar: [{ baslik: 'Kasa', alt: 'kilitli / açık' }, { baslik: 'Otomatik kilit', alt: 'boşta kalınca' }] } },
      { baslik: 'Yasak adresler', metin: 'Nöbetçi\'nin hiçbir zaman bağlanmayacağı adres kalıpları: bu adreslere koşu, tarama, servis istekleri (WSDL / şema dahil), entegrasyonlar ve "Varsayılanları öner" hiç bağlanmaz.', ipucu: 'Nöbetçi\'nin sizin adınıza yapabileceği işlemler ayrıca Ayarlar > İzinler\'e bağlıdır (varsayılan kapalı).' },
      { baslik: 'Maskeleme', metin: 'Raporlarda ve yanıtlarda maskelenecek ek gizli alan adları.' }
    ]
  },
  'ayarlar-entegrasyonlar': {
    baslik: 'Entegrasyonlar',
    adimlar: [
      {
        baslik: 'Entegrasyonlar',
        metin: ['Nöbetçi\'yi başka uygulamalara bağlarsınız: koşu bitince sohbet kanalına bildirim (webhook), kalan bir testten iş takip sisteminde hata kaydı açma ve SQL adımları için veritabanı bağlantısı.', 'Token, parola ve gizli adresler kasada şifreli durur; siz denemeden ya da seçtiğiniz olay gerçekleşmeden hiçbir istek gönderilmez.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Tür', alt: 'webhook / hata kaydı / veritabanı', ikon: 'liste' }, { baslik: 'Ayarlar', alt: 'gizliler kasada', ikon: 'kilit' }, { baslik: 'Dene', alt: 'onayınızla', ikon: 'simsek' }, { baslik: 'Bağlı', ikon: 'onay' }] }
      },
      { baslik: 'Bağlama sırası', sira: ['"Yeni bağlantı" ile türü seçin.', 'Alanları doldurun; hangi olaylarda ve hangi ortamlarda çalışacağını seçin.', '"Bağlantıyı dene": önce hangi adrese deneme isteği gideceği gösterilir, onaylarsanız gider.', 'Kaydedin; durum rozeti bağlı / denenmedi / hata olarak görünür.'] },
      { baslik: 'Veritabanı ve DBeaver', metin: 'Veritabanı bağlantıları varsayılan olarak yalnız okuma kipindedir (yalnız SELECT). DBeaver kullanıyorsanız bağlantı tanımlarını "DBeaver\'dan içe aktar" ile alabilirsiniz; parolalar alınmaz, siz girersiniz. Bildirim / hata kaydı için "Dış gönderim", veritabanı için "Veritabanı okuma" (yazma sorgusu için ayrıca "Veritabanına yazma") izni gerekir (Ayarlar > İzinler). Yeni bağlantıda olay seçimi kapalı başlar.', ipucu: 'Veritabanı sürücüleri ayrıca kurulur: npm install mssql oracledb pg mysql2' },
      {
        baslik: 'Veritabanları (ortama göre)',
        metin: ['SQL adımı bir bağlantıya değil, bir veritabanına bağlanır; koşu, seçtiğiniz ortamdaki bağlantıya gider. Tabloda satır veritabanı, sütun ortamdır; boş hücre o ortamda kullanılmaz (adım sorgu atmadan hatayla kalır, koşu diyaloğu önceden uyarır).',
          'Örnek: "Kayıt veritabanı" → TEST ortamında kayit-TEST (192.0.2.10), CANLI ortamında kayit-CANLI (192.0.2.20). Aynı senaryo TEST koşusunda TEST veritabanını, CANLI koşusunda CANLI veritabanını sorgular.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'SQL adımı', alt: 'Kayıt veritabanı', ikon: 'veri' }, { baslik: 'Koşunun ortamı', alt: 'TEST / CANLI', ikon: 'ag' }, { baslik: 'Bağlantı', alt: 'kayit-TEST / kayit-CANLI', ikon: 'kilit' }] },
        ipucu: 'Eski adımlar (doğrudan bağlantı) aynen çalışır; SQL adımında "Veritabanına çevir…" ile bağlantının eşlendiği veritabanına geçebilirsiniz.'
      }
    ]
  },
  'ayarlar-arayuz': {
    baslik: 'Arayüz',
    adimlar: [{ baslik: 'Görünüm ve rehberler', metin: 'Tema (Komuta merkezi, Kurumsal, Canlı), Nöbetçi\'nin kendi penceresinde mi tarayıcıda mı açılacağı, rehberlerin her ekranın ilk açılışında kendiliğinden başlayıp başlamayacağı ve listelerin sayfa boyları. "Tüm rehberleri yeniden göster" hepsini görülmemiş yapar; "?" düğmesi her zaman çalışır.', cizim: { tur: 'maket', bolge: 'soru', etiket: '"?" her ekranda sağ üstte' } },
      { baslik: 'Raporlar ve sağlık noktası', metin: 'HTML rapora gömülen ekran görüntülerinin toplam sınırı (varsayılan 25 MB) ve Sonuçlar ekranındaki sağlık noktasının renk eşikleri (proje başına; varsayılan yeşil ≥ %90, sarı ≥ %75).' }]
  }
};
