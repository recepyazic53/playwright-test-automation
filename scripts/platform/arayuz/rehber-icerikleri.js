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
      { baslik: 'Proje seçici', hedef: '.proje-secici-kap', metin: 'Birden çok uygulamayı test ediyorsanız her biri ayrı bir projedir. Aralarında buradan geçersiniz; "Proje ekle" aynı kasada yeni bir proje açar.' },
      { baslik: 'Rehberi tekrar açmak', hedef: '.rehber-dugmesi', metin: 'Hangi ekrandaysanız o ekranın rehberini bu "?" düğmesiyle istediğiniz an yeniden açabilirsiniz. Kendiliğinden açılmasını Ayarlar > Arayüz\'den kapatabilirsiniz.', ipucu: 'Rehberde ← / → tuşlarıyla gezinebilir, Esc ile kapatabilirsiniz.' }
    ]
  },

  sonuclar: {
    baslik: 'Sonuçlar',
    // Sonuçlar ekranının tüm bölümleri, ekrandaki sırayla: sol panel, sağlık noktası, rapor sekmeleri, başlık + Koşuyu başlat,
    // tarih aralığı, özet kartlar, koşu trendi, başarısız testler, test paneli, koşu geçmişi, hata kalıpları.
    adimlar: [
      {
        baslik: 'Sonuçlar ekranı',
        metin: ['Koşuların sonucu burada toplanır: ne kadar başarılı, hangi testler kaldı, zaman içinde iyiye mi kötüye mi gidiyor.', 'Bir testin neden kaldığını görmek için koşuyu, sonra testi açarsınız; her testin adım adım ekran görüntüleri ve videosu saklanır.'],
        cizim: { tur: 'maket', bolge: 'kartlar', etiket: 'Özet kartlar ve eğilim' }
      },
      {
        baslik: 'Ürün / ekran seçimi', hedef: '.alt-nav',
        metin: ['"Genel" bütün projeyi gösterir. Altında her ekran, renkli sağlık noktası ve senaryo sayısıyla listelenir; bir ekran seçerseniz kartlar, eğilim ve geçmiş yalnızca onun sonuçlarını gösterir.',
          'Devre dışı ("kapalı") ve silinmiş ekranların geçmiş sonuçları görünür kalır. Servisler bölümünden bir servis seçince yalnız o servisin sonuçları açılır.']
      },
      { baslik: 'Sağlık noktası', hedef: '.yan-panel .yan-not', metin: 'Ekran adının yanındaki nokta, son tam koşunun başarı oranına göre yeşil, sarı ya da kırmızıdır. Eşikler proje başınadır; "Eşikleri değiştir" Ayarlar > Arayüz\'e götürür.' },
      { baslik: 'Rapor sekmeleri', hedef: '.sonuc-sekmeleri', metin: '"Genel" görünümde dört sekme vardır: Ekranlar (ekran senaryolarının koşuları), Servisler (servis senaryolarının sonuçları), Uçtan uca akışlar (servis + ekran + SQL adımlı akışlar) ve Raporlar (kaydedilen PDF dönem raporları). Sekmeler yalnız "Genel" seçiliyken görünür.' },
      {
        baslik: 'Başlık ve "Koşuyu başlat"', hedef: '.sonuc-icerik > .sayfa-basligi',
        metin: ['Başlığın yanındaki rozet son tam koşuda kaç testin kaldığını ya da hepsinin geçtiğini söyler. Altında son tam koşunun zamanı, süresi, senaryo ve ekran sayısı (bir ekran seçiliyse koşunun kapsamı) yazar.',
          '"Koşuyu başlat" Senaryolar ekranına götürür; koşu orada onayla başlar. Devre dışı ya da silinmiş bir ekran seçiliyse düğme görünmez.']
      },
      { baslik: 'Tarih aralığı', hedef: '.sonuc-araligi', metin: 'Kartlar, eğilim, koşu geçmişi ve hata kalıpları seçtiğiniz aralığa (Son 1 saat, Bugün, Son 7 / 15 / 30 gün ya da Tümü) göre hesaplanır. Seçim bu oturum boyunca hatırlanır.' },
      {
        baslik: 'Özet kartlar', hedef: ['.sonuc-kartlari', '.sonuc-kartlari-bos'],
        metin: ['Son tam koşunun başarılı, başarısız, atlanan ve durdurulan test sayıları ile başarı oranı. Her kartta önceki tam koşuya göre fark (▲ ▼) ve aralıktaki gidişi gösteren küçük bir çizgi vardır; kartların altındaki satır hangi koşulardan hesaplandığını söyler.',
          'Kalan testlerin hata türü (ör. ortam hatası, iş kuralı uyarısı) Ayarlar > Koşu > Hata sınıflandırma kurallarına göre belirlenir.'],
        ipucu: 'Kartlar yalnız tam koşulardan (Koşuyu başlat) hesaplanır; tekil ▷ koşuları koşu geçmişinde görünür.'
      },
      { baslik: 'Koşu trendi', hedef: '.trend-kapsayici', metin: 'Tam koşuların zaman içindeki sonucu. "Adet" test sayılarını, "Oran" yüzdeleri gösterir. Bir çubuğun üzerine gelince o koşunun özeti görünür; tıklayınca koşu açılır.' },
      {
        baslik: 'Başarısız testler', hedef: ['section[aria-labelledby="basarisiz-basligi"]', '.sonuc-sutunu'],
        metin: ['Son tam koşu önceki tam koşularla karşılaştırılır: "Yeni başarısız" bu koşuda ilk kez kalanlar, "Tekrar eden" kaç koşudur kaldığıyla birlikte, "Düzeldi" önceki koşuda kalıp bu koşuda geçenler. Satırda ekran, hata türü, görüntü / video simgesi ve süre yazar.',
          '"Yalnızca başarısızları tekrar çalıştır" kalan senaryoları son koşunun ortamında, onayla, tekil koşu olarak yeniden çalıştırır.'],
        ipucu: 'Önce "Yeni başarısız" satırlara bakın: son değişiklikten etkilenenler onlardır.'
      },
      {
        baslik: 'Test paneli', hedef: ['.test-paneli', 'section[aria-labelledby="basarisiz-basligi"]'],
        metin: 'Başarısız bir teste tıklayınca yanda paneli açılır: durum, hata türü ve süre; ekran görüntüleri ("Videoyu izle", İndir, tam ekran), hata özeti (Beklenen / Görülen), adımlar, atlanan / doldurulamayan alanlar ve koşuda yakalanan mesajlar. "Tüm ayrıntılar" testin ayrıntı sayfasını açar.'
      },
      {
        baslik: 'Koşu geçmişi', hedef: 'section[aria-labelledby="gecmis-basligi"]',
        metin: ['Yapılan bütün koşuların listesi: tam koşular (Koşuyu başlat) ve tekil ▷ koşuları. Her satırda zaman, tür / kapsam, dağılım çubuğu, sayılar ve başarı oranı görünür; sütun başlığına tıklayınca sıralanır, liste sayfalıdır.',
          '"Tümü / Tam / Tekil" koşu türüne, "Yalnız kalanlar" başarısız testi olan koşulara süzer. Bir satıra tıklayınca koşunun ayrıntısı açılır; iki satırı işaretleyip "Karşılaştır" ile iki koşunun farkını görebilirsiniz.'],
        ipucu: 'Liste üstteki tarih aralığına göre süzülür.'
      },
      {
        baslik: 'Hata kalıpları', hedef: 'section[aria-labelledby="kalip-basligi"]',
        metin: ['Kalan testlerin hata mesajları benzerliklerine göre gruplanır: değişken sayılar # ile gösterilir, aynı sorun tek satırda toplanır ve kaç testi etkilediği yazar.',
          '"Kalan testlerin hataları" kalan testleri, "Koşuda yakalanan mesajlar" ise geçen testlerde de ekranda görülen uyarı / hata mesajlarını kapsar. Üstteki çipler hata türlerine göre dağılımı gösterir; bir kalıpta "Örnek" bir sonucu yanda açar, "Testler" etkilenen testleri listeler.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Hata mesajları', ikon: 'uyari' }, { baslik: 'Kalıp', alt: 'sayılar #', ikon: 'liste' }, { baslik: 'Etkilenenler', alt: 'test sayısı', ikon: 'grafik' }] },
        ipucu: 'Önce en çok testi etkileyen kalıba bakın: tek bir düzeltme birçok testi geçirebilir.'
      },
      {
        baslik: 'Dönem raporu (PDF)',
        metin: ['"Rapor al (PDF)" seçtiğiniz dönemin raporunu bu bilgisayarda üretir: durum rozeti (Sağlıklı / Dikkat / Kritik), önceki eşit döneme göre ▲▼ farklar, öncelikli aksiyonlar (P1 / P2 / P3), sorunların eğilimi ve kapsam.',
          'Kapsam: tek ekran, tek servis, birden çok ekran, birden çok servis, ekran + servis ya da genel (projenin tamamı; öğe seçilmez, akışlar, zamanlanmış koşular ve test verisi sağlığı da eklenir). Çoklu kapsamda listeden birden çok öğe seçin ya da "Tüm ekranlar" / "Tüm servisler"i işaretleyin (tümü, rapor her üretildiğinde o anki tüm öğeleri kapsar). Çoklu raporda öğeler sağlık sırasıyla karşılaştırılır; ekran + servis raporunda iki taraf ayrı özetlenir, aynı günlerde görülen ekran ve servis sorunları tek aksiyonda birleşir.',
          '"Raporlar\'a kaydet" açıksa PDF şifreli saklanır; Raporlar sekmesinde indirilir, aynı seçimlerle (dönem bugüne kaydırılarak) yeniden oluşturulur ya da silinir.'],
        ipucu: 'Gizli değerler, istek / yanıt gövdeleri ve test verisi değerleri rapora girmez; ortam adresi ve ekran görüntüleri yalnız siz seçerseniz eklenir.'
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
      { baslik: 'Koşu ayrıntısı', metin: ['Bu koşudaki tüm testler, durumları ve süreleri. Kalan bir testi açarak hatasını, adımlarını ve kayıtlarını inceleyin.', '"Yalnız kalanlar" yalnız kalan testleri gösterir; bir hata kalıbına tıklayınca yalnız o kalıptaki testler listelenir (çipteki × ile kaldırılır). Koşu geçmişinde de "Yalnız kalanlar" vardır.'], cizim: { tur: 'maket', bolge: 'tablo', etiket: 'Koşudaki testler' } },
      { baslik: 'Önceki koşuyla karşılaştırma', metin: 'Tam koşularda "yeni kalan" ve "düzelen" testler ayrıca işaretlenir; böylece yalnızca değişene odaklanırsınız.', ipucu: 'Bir test bir koşuda kalıp sonrakinde geçiyorsa ortamdan kaynaklı (kararsız) olabilir.' },
      { baslik: 'Veri koşuları', metin: 'Tablodan birden çok satırla koşan bir senaryonun her satırı (ya da kombinasyonu) ayrı testtir: "Senaryo [satır adı]". Bu testler tek senaryo satırında toplanır; satıra tıklayınca satır satır sonuçlar açılır. Testin ayrıntısında hangi tablo satırıyla koştuğu görünür; gizli sütunların değeri hiç saklanmaz, yalnız adıyla "•••" gösterilir.', cizim: { tur: 'akis', kutular: [{ baslik: 'Senaryo', alt: '3 veri koşusu', ikon: 'liste' }, { baslik: '[satır-1]', alt: 'geçti', ikon: 'onay' }, { baslik: '[satır-2]', alt: 'kaldı', ikon: 'uyari' }] } },
      { baslik: 'Başarısızları tekrar çalıştırmak', metin: '"Başarısızları tekrar çalıştır (N)" yalnız kalan testleri (veri koşularında yalnız kalan satırları) aynı ortamda, o koşudaki tablo satırı ve (varsayılan) o koşudaki model sürümüyle yeniden koşar. Başlamadan satırın verisi ya da ekran modeli o koşudan bu yana değiştiyse bildirilir ve siz seçersiniz: o koşudaki değerler yalnız gizli sütunu olmayan tablolarda saklandığı için, diğerleri güncel veriyle koşar. Yeni koşu "Tekrar: önceki koşu" bağıyla kaydedilir ve iki koşu karşılaştırılabilir.', ipucu: 'İzinler ve riskli ortam onayı normal koşudaki gibi uygulanır.' },
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
      { baslik: 'Test ayrıntısı', metin: 'Hata mesajı, "Beklenen / Görülen" karşılaştırması, adım adım ekran görüntüleri, video ve iz kaydı (trace) burada. Görüntüler ve video şifrelidir; yalnızca kasa açıkken gösterilir. Hangi görüntülerin alınacağı Ayarlar > Koşu > Kayıt\'tadır; saklama süresi dolup silinen ya da alınamayan görüntüler not olarak yazar.', cizim: { tur: 'akis', kutular: [{ baslik: 'Adımlar', ikon: 'liste' }, { baslik: 'Kalınan adım', alt: 'kırmızı', ikon: 'uyari' }, { baslik: 'Görüntü + video', ikon: 'video' }] } },
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
      { baslik: 'Yeni senaryo ve koşu', hedef: '.sayfa-basligi .eylemler', metin: '"Senaryo ekle" ekran modelinden bir form açar. "Koşuyu başlat", "Koşuda" açık olan tüm senaryoları sırayla koşar; canlı ekran görüntüsünü panelden izlersiniz.' },
      { baslik: 'Senaryo tablosu', hedef: '.senaryo-tablosu', metin: 'Satırdaki ▷ tek senaryoyu çalıştırır, kalem düzenler, ⋯ kopyalar / geçmişi gösterir / Playwright koduna dışa aktarır / siler. Birden çok satır seçince toplu işlemler (ör. toplu değer atama) çıkar.' },
      {
        baslik: 'Playwright koduna dışa aktar',
        hedef: '.senaryo-tablosu',
        metin: '⋯ > "Playwright koduna dışa aktar" (ya da senaryo ayrıntısındaki düğme) senaryoyu seçtiğiniz ortam için Nöbetçi\'nin koştuğu adımlarla tek bir .spec.ts dosyası olarak indirir; dosya Nöbetçi olmadan "npx playwright test" ile koşar.',
        ipucu: 'Parola, TOTP, gizli ve kişisel değerler dosyaya yazılmaz: dosyanın başında listelenen NOBETCI_… ortam değişkenleriyle verilir. SQL kontrolü gibi Nöbetçi\'ye özgü adımlar yorum olarak kalır. Dosya Nöbetçi dışındadır; ekran modeli değişince yeniden dışa aktarın.'
      },
      {
        baslik: 'Senaryo önerileri',
        hedef: '.senaryo-onerileri-dugmesi',
        metin: ['Bir ekran seçiliyken "Senaryo önerileri", ekranın modelinden, mevcut senaryolardan ve koşu geçmişinden AZ SAYIDA, gerekçeli öneri çıkarır. Sıra: risk (son dönemde hata veren değerler, test edilmemiş iş kuralı uyarıları) › hiç denenmemiş koşul dalları › eksik ikili kombinasyonlar (pairwise) › modeldeki kurallara göre sınır değerleri › zorunlu alan boş. Mevcut senaryoların zaten denediği şey önerilmez; sayfanın başındaki "Kapsam" ölçülerine tıklayınca eksikler listelenir.',
          'Öneri yalnızca öneridir: işaretleyip "Senaryo olarak ekle" demeden senaryo oluşmaz. "Önizle" öneriyi formda doldurulmuş açar (kaydetmez). "Reddet" (neden isteğe bağlı) öneriyi gizler; kabul ve redleriniz benzer önerilerin sırasını değiştirir. Eklenenler "Koşuda" kapalı gelir; beklenen sonucu belli olmayanlarda "Beklenen sonucu siz seçin" yazar.'],
        ipucu: 'Kişisel / gizli alanlarda değer üretilmez; mevcut senaryodaki değer ya da bağlı tablo kullanılır.'
      },
      {
        baslik: 'Önerilen çalışma sırası',
        sira: ['Ekranlar\'dan ekranı ekleyin (ekran paketi, tarama ya da akış kaydı).', 'Bu ekranda "Senaryo ekle" ile senaryoyu yazın; önce "Dene" ile kaydetmeden deneyin.', 'Kaydedin ve "Koşuda" açık bırakın.', '"Koşuyu başlat" ile hepsini koşun; sonuçlar Sonuçlar ekranına düşer.'],
        cizim: { tur: 'maket', bolge: 'eylem', etiket: '"Senaryo ekle" ve "Koşuyu başlat" sağ üstte' }
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
        sira: ['Başlığı yazın: senaryonun neyi sınadığını anlatsın.', 'Ekranın birden çok akışı varsa akışı seçin.', 'Alanları yukarıdan aşağı doldurun; bağımlı listeler üstteki seçime göre süzülür.', 'Kişi / kart / adres gibi veriler için değeri tablodan alın: alanın listesinde "Tablodan" (${Tablo.Sütun}; koşuda seçilen satırdan gelir; onay kutusu evet / hayır, dosya alanı dosya adı olarak) ya da kimlik alanında kayıt adı.', 'Tablodan alınan değerler için "Satır seçimi" kartında satırı seçin: Otomatik (bağlı alanlar ve ortam) ya da bir satır / koşullar.', 'Senaryo birden çok satırla koşacaksa "Çalıştırma biçimi"ni seçin: tek satır (varsayılan), seçili satırların her biri ya da uyan tüm satırlar; her satır ayrı test olur.','Beklenen sonucu seçin: başarı ya da beklenen hata mesajı.', '"Dene" ile kaydetmeden deneyin; sonra Kaydet.']
      },
      {
        baslik: 'Tarih alanları: sabit ya da bugüne göre',
        metin: 'Tarih alanında "Sabit tarih" ya da "Bugüne göre" seçilir. Bugüne göre: "Bugün / Ay başı / Ay sonu" + / − N gün (ör. bugün+7); altında "Bugün koşulursa: …" önizlemesi görünür, alanın sınırı dışındaysa uyarır. Senaryo her koşuda o günün tarihini (Türkiye saati) alanın biçimiyle yazar; tarih geçince senaryo kırılmaz. Sabit tarih geçmişte kaldıysa alanın altında "Bugüne göre yap" önerisi çıkar; Senaryolar listesinde "tarih eskidi" rozeti görünür ve seçilenler "Tarihleri bugüne göre yap…" ile topluca düzeltilir.',
        cizim: { tur: 'akis', kutular: [{ baslik: 'Bugüne göre', alt: 'bugün+7', ikon: 'takvim' }, { baslik: 'Önizleme', alt: 'bugün koşulursa', ikon: 'gorunum' }, { baslik: 'Her koşu', alt: 'o günün tarihi', ikon: 'oynat' }] },
        ipucu: 'Test verisi tablosunun tarih hücresine de "bugün", "bugün+7", "ay sonu" yazabilirsiniz; hücrenin altında bugünkü karşılığı görünür.'
      },
      { baslik: 'Akış diyagramı', metin: '"Akış diyagramı" sekmesi, seçimlerinize göre koşacak adımları kutular hâlinde gösterir; seçili ortamdaki son koşu varsa adımlar yeşil / kırmızı boyanır.', cizim: { tur: 'akis', kutular: [{ baslik: 'Giriş', ikon: 'anahtar' }, { baslik: 'Alanlar', ikon: 'duzenle' }, { baslik: 'Gönder', ikon: 'ok' }, { baslik: 'Kontrol', ikon: 'onay' }] } },
      {
        baslik: 'Birden çok satırla çalıştırma',
        metin: 'Satır seçimi kartındaki "Çalıştırma biçimi" her tablo grubu için ayrıdır. "Seçili satırların her biri" işaretlediğiniz satırları, "Uyan tüm satırlar" seçimlerle uyan tüm satırları ayrı test olarak koşar. İki ya da daha çok tablo çoklu ise satırları "Eşleştirerek" (çift çift) ya da "Tüm kombinasyonlar" olarak birleştirirsiniz. Tahmini test sayısı kartın altında görünür; tek senaryodaki üst sınır Ayarlar > Koşu\'dadır. Ortama özel satır yalnız kendi ortamında koşar.',
        cizim: { tur: 'akis', kutular: [{ baslik: 'Tablo', alt: 'satırlar', ikon: 'veri' }, { baslik: 'Çalıştırma biçimi', alt: 'seçili / tümü', ikon: 'liste' }, { baslik: 'Her satır', alt: 'ayrı test', ikon: 'oynat' }] },
        ipucu: 'Koşu diyaloğunda "Veri koşusu" ile bu biçimi o koşu için değiştirebilirsiniz (ör. hepsi tek satırla). Dene her zaman tek satırla koşar.'
      },
      { baslik: 'Bilmekte fayda var', metin: 'Boş bıraktığınız alan modelin varsayılanını alır; zorunlu bir alanı "Bilerek boş bırak" ile işaretlerseniz (olumsuz senaryo) koşucu o alana değer yazmaz. "Mutlaka görünmeli" işaretli bir alan ekranda görünmezse test bilerek düşer. "Adım ekran görüntüleri" varsayılan olarak Ayarlar > Koşu > Kayıt\'a uyar; bu senaryo için her adımda, yalnız kalan adımda, seçili adımlarda ya da kapalı seçebilirsiniz.', ipucu: 'Dene sonucu senaryoya kaydedilmez; Sonuçlar\'da "deneme" olarak görünür.' }
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
      { baslik: 'Servis sayfası', metin: 'Sekmeler: Senaryolar (istekler ve kontroller), Akışlar (istekleri zincirleme), Sözleşme (yanıtın beklenen yapısı), Parametreler (değer tanımları), Raporlar (koşu geçmişi), İşlemler (metotlar).', cizim: { tur: 'maket', bolge: 'arac', etiket: 'Sekmeler ekranın üstünde' } },
      {
        baslik: 'Senaryo türü: tek istek ya da akış',
        metin: ['"Senaryo ekle"de önce türü seçin. Tek istek: bir operasyona istek atılır. Akış: bir servis akışının operasyonları sırayla çağrılır (ör. önce sipariş, sonra fatura); akış başka servislerin operasyonlarını da içerebilir.',
          'Ekranlardaki gibi: akış adımların sırasını ve adımlar arasında taşınan değerleri tanımlar, senaryo ise verileri tutar.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Akış', alt: 'operasyon sırası', ikon: 'katman' }, { baslik: 'Senaryo', alt: 'her adımın verisi', ikon: 'liste' }, { baslik: 'Koşu', alt: 'adım adım', ikon: 'oynat' }] }
      },
      {
        baslik: 'Tek istek senaryosu',
        sira: ['Metodu seçin.', 'Alanları doldurun: sabit değer, test verisi tablosu sütunu, hesaplama kuralı ya da akış değeri.', 'Kontrolleri ekleyin.', 'Tablodan değer alıyorsa "Veri koşusu" bölümünde çalıştırma biçimini seçin: tek satır (varsayılan), seçili satırların her biri ya da uyan tüm satırlar; her satır ayrı çalıştırma olur ("Senaryo [satır adı]").', '"Dene" ile seçili ortamda deneyin, sonra kaydedin.'],
        cizim: { tur: 'form', alanlar: ['Metot', 'Alanlar', 'Kontroller'], dugme: 'Dene' }
      },
      {
        baslik: 'Akış senaryosu',
        sira: ['Türü "Akış" seçin ve akışı seçin (bu servisten geçen akışlar listelenir).', 'Her adım ayrı bölümde sorulur ("1. Servis · Operasyon"): o metodun zorunlu ve seçili alanlarını doldurun. Aynı adlı alan her adımda ayrı sorulur.',
          'Önceki adımdan gelen alanlar kilitlidir ("1. adımdan gelir") ve sorulmaz.', 'Her adımın beklenen sonucunu kontrol edin (ör. bu adım bir hata vermeli).', 'Dene ile TEST’te deneyin, sonra kaydedin. Akış senaryosu, akışın geçtiği her serviste "akış: <ad>" rozetiyle listelenir.'],
        cizim: { tur: 'form', alanlar: ['Akış', '1. adımın alanları', '2. adımın alanları (kilitliler hariç)', 'Beklenen sonuçlar'], dugme: 'Dene' }
      },
      { baslik: 'Yanıt sözleşmesi', metin: 'Senaryonun Kontroller bölümündeki "Yanıt sözleşmeye uymalı" kutusu (varsayılan kapalı) işaretlenirse yanıt, metodun Sözleşme sekmesindeki yapıya göre de doğrulanır; uymayan alanlar raporda yol yol listelenir ve senaryo kalır.' },
      {
        baslik: 'Yanıt bir dosyaysa',
        metin: 'Servis rapor, liste ya da belge döndürüyorsa (CSV, XLSX, PDF, metin) kontrollere "Yanıttaki dosyayı doğrula"yı ekleyin. Dosya adı yanıt başlığından (Content-Disposition) ya da adresten, biçimi içerik türünden bulunur; beklentiler ekrandaki "İndirilen dosyayı doğrula" ile aynıdır ve her biri sonuçta ayrı satırdır. Beklentide ${Parametre}, ${Tablo.Sütun} ve ${akis:Ad} kullanılabilir.',
        ipucu: 'İkili yanıt (XLSX / PDF) raporda metin olarak saklanmaz; yalnız özet durur. Dosyanın kendisi Ayarlar > Koşu > Kayıt > "Doğrulanan dosya" izin verirse saklanır; senaryo sonucunda "Dosyayı indir" ile (onayla, ham hâliyle) indirilir.'
      },
      { baslik: 'Gizli bilgiler', metin: 'Yanıtlarda ve raporlarda gizli adlı alanlar maskelenir. Maskelenecek ek adları Ayarlar > Güvenlik > Maskeleme\'den ekleyebilirsiniz.' }
    ]
  },
  'servis-sozlesmesi': {
    baslik: 'Servis sözleşmesi',
    adimlar: [
      {
        baslik: 'Sözleşme nedir?',
        metin: ['Sözleşme, bir metodun (REST\'te ucun) yanıtının beklenen yapısıdır: hangi alanların geleceği, türleri (metin, sayı, tam sayı, evet/hayır, nesne, dizi), hangilerinin zorunlu olduğu ve boş (null) gelip gelemeyeceği.',
          'Senaryoda "Yanıt sözleşmeye uymalı" açıksa (varsayılan kapalı) koşuda yanıt buna göre denetlenir. Uymazsa senaryo kalır; raporda "Sözleşme: Kaldı — N uyumsuzluk" ve yol yol liste görünür (ör. response.orderId: sayı bekleniyordu, metin geldi). Rapora değer yazılmaz.'],
        cizim: { tur: 'istek', sol: 'Nöbetçi', sag: 'Servis', gidis: 'istek', donus: 'yanıt', kontroller: ['Alanlar tam', 'Türler doğru', 'Null izinli mi'] }
      },
      {
        baslik: 'Sözleşmenin kaynağı',
        sira: ['WSDL / XSD\'den al (SOAP): servisin kayıtlı WSDL\'indeki yanıt öğesi ya da yüklediğiniz WSDL / XSD dosyaları.', 'OpenAPI / Swagger yükle: yerel JSON / YAML dosyası; yalnız başarılı yanıt şeması alınır, dış başvurular indirilmez.', 'JSON Schema yükle: dosya ya da yapıştırma.', 'Başarılı yanıttan taslak: kayıtlı bir ya da birkaç başarılı yanıttan türler çıkarılır.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Kaynak', alt: 'WSDL / OpenAPI / JSON Schema / yanıt', ikon: 'yukle' }, { baslik: 'Önizleme', alt: 'alan alan düzenle', ikon: 'duzenle' }, { baslik: 'Onay', ikon: 'onay' }, { baslik: 'Sözleşme', ikon: 'kalkan' }] }
      },
      { baslik: 'Taslak ve onay', metin: 'Önizleme ya da taslakta türü, zorunluluğu ve null iznini alan alan değiştirip gereksiz alanı kaldırabilirsiniz; "Onayla ve kaydet" demeden hiçbir şey yazılmaz. Tek yanıttan çıkan taslakta zorunluluk kesin değildir: birkaç başarılı yanıt seçin ya da gözden geçirin. Var olan sözleşmeyi değiştirmek ve silmek ayrıca onay ister; değişiklikler geçmişte görünür.' }
    ]
  },
  'servis-sonuclari': {
    baslik: 'Servis sonuçları',
    adimlar: [
      {
        baslik: 'Servis sonuçları',
        metin: ['Servis sonuçlarının tek yeri Sonuçlar > Servisler: başarı oranı, kalan ve atlanan senaryolar, süre ve zaman içindeki eğilim. Soldan bir servisi seçerek yalnızca onun sonuçlarına bakabilirsiniz; Servisler ekranındaki "Sonuçlar" da buraya getirir.', 'Servis sayfasındaki "Raporlar" sekmesi yalnız o servisin çalıştırma listesidir; üstündeki "Tüm servis sonuçları" buraya döner.'],
        cizim: { tur: 'maket', bolge: 'kartlar', etiket: 'Kartlar, eğilim ve koşu geçmişi' }
      },
      { baslik: 'Tarih aralığı ve ortam', metin: 'Üstteki tarih aralığıyla (Son 1 saat, Bugün, Son 7 gün…) ve ortam seçimiyle süzün. "Denemeleri de say" açıkken "Dene" ile yapılan tek çalıştırmalar da hesaba girer.' },
      {
        baslik: 'Kalan bir senaryoyu incelemek',
        sira: ['Koşu geçmişinden koşuyu açın.', 'Kalan senaryoya tıklayın: kontroller, istek ve yanıt (gizli alanlar maskeli), HTTP kodu ve süre açılır.', 'Aynı hata başka senaryolarda da var mı, "Hata kalıpları"na bakın.', 'Düzelttikten sonra koşu ayrıntısında "Başarısızları tekrar çalıştır": yalnız kalan çalıştırmalar aynı ortamda, o koşudaki tablo satırlarıyla koşar; yeni koşu "Tekrar: önceki koşu" bağı taşır.'],
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
      { baslik: 'Oturum (token) akışı', metin: 'Giriş gerektiren servisler için bir oturum akışı tanımlayın. Token\'ın süresi dolana kadar mı kullanılacağını, yoksa her istekte yeniden mi alınacağını akışta siz seçersiniz. "Yetki hatasında (401 / 403)": Tekrar deneme ya da Token\'ı yenile, bir kez tekrar dene (oturum / token adımı yeniden çalışır, istek bir kez daha gönderilir; raporda not olarak görünür). "Genel ayarı kullan" seçiliyse Ayarlar > Koşu\'daki genel değer (varsayılan: Token\'ı yenile, bir kez tekrar dene) kullanılır.', cizim: { tur: 'istek', sol: 'Nöbetçi', sag: 'Giriş servisi', gidis: 'giriş', donus: 'token', kontroller: ['Token alındı', 'Sonraki isteklere eklendi'] } },
      {
        baslik: 'Akış kurma sırası',
        sira: ['"Akış ekle"ta "+" ile adım koyun: bir servisin operasyonu (varsayılan), kayıtlı senaryo (eski tür) ya da SQL sorgusu.', 'Değer üreten adımda "Yanıttan oku" ile değeri tanımlayın (XPath / JSON yolu / başlık; gizliyse işaretleyin).',
          'Sonraki adımda "Alan bağla" ile o değeri operasyonun alanına bağlayın; diyagramdaki oklar taşınan değerleri gösterir.', 'Kaydedin; sayfanın altındaki "Bu akışın senaryoları"ndan "Senaryo ekle" ile verileri girin.'],
        cizim: { tur: 'akis', kutular: [{ baslik: '+ Operasyon', ikon: 'artiYalin' }, { baslik: 'Yanıttan oku', ikon: 'hedef' }, { baslik: 'Alan bağla', ikon: 'ok' }, { baslik: 'Senaryo ekle', ikon: 'liste' }] }
      }
    ]
  },

  'uctan-uca-akis': {
    baslik: 'Uçtan uca akış',
    adimlar: [
      {
        baslik: 'Uçtan uca akış nedir?',
        metin: ['Bir iş akışını baştan sona tek koşuda sınar: adımlar servis isteği, ekran senaryosu ya da SQL sorgusu olabilir ve sırayla koşar.',
          'Bir adımda okunan değer sonraki adımlarda ${akis:Ad} ile kullanılır. Örnek: servis sipariş oluşturur ve yanıttan sipariş numarası okunur, ekran adımı bu numarayla arama yapar ve ekrandaki durumu okur, SQL adımı veritabanındaki kaydı denetler.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Servis', alt: 'SiparisNo okunur', ikon: 'ag' }, { baslik: 'Ekran', alt: 'arama ← ${akis:SiparisNo}', ikon: 'ekran' }, { baslik: 'SQL', alt: 'durum denetlenir', ikon: 'veri' }, { baslik: 'Rapor', alt: 'tek koşu', ikon: 'grafik' }] }
      },
      {
        baslik: 'Akış kurma sırası',
        sira: ['"Uçtan uca akış ekle"ta "+" ile adım koyun: ekran senaryosu, bir servisin operasyonu (ya da kayıtlı senaryosu) veya SQL sorgusu.',
          'Değer üreten adımda okumayı tanımlayın: serviste "Yanıttan oku", ekranda "Değer oku" (seçici + ad), SQL\'de sonuç sütunu. Gizli değerleri işaretleyin.',
          'Sonraki adımda değeri kullanın: ekranda "Alan doldur" ile senaryonun bir alanına, serviste "Alan bağla" ile, SQL\'de sorgunun içinde ${akis:Ad}.',
          'Kaydedin ve "Koş…" ile ortam seçip çalıştırın.'],
        cizim: { tur: 'akis', kutular: [{ baslik: '+ Adım', ikon: 'artiYalin' }, { baslik: 'Değer oku', ikon: 'hedef' }, { baslik: 'Alan doldur', ikon: 'ok' }, { baslik: 'Koş…', ikon: 'oynat' }] }
      },
      {
        baslik: 'Koşu penceresi',
        metin: ['Ortamı seçince Nöbetçi hiçbir istek atmadan akışı denetler: bir adım o ortamda tanımlı değilse (servisin taban adresi yok, ekran senaryosu o ortamda yok, veritabanı eşlemesi yok) koşu başlamaz ve hangi adım olduğu yazılır.',
          'Gereken izinler (web erişimi, servis istekleri, veritabanı okuma, giriş bilgisi, canlı ortam) toplu listelenir; kapalı olan koşu başlarken sorulur. İzinler her adımdan önce yeniden denetlenir.'],
        ipucu: 'Bir adım kalırsa sonraki adımlar atlanır; adımda "Bu adım kalırsa da sonraki adımlara devam et" işaretliyse akış sürer.'
      },
      {
        baslik: 'Sonuç',
        metin: 'Koşu tek kayıttır (Sonuçlar > Uçtan uca akışlar): her adımın durumu ve süresi, ekran adımının ekran görüntüleri, servis adımının istek / yanıtı, SQL adımının sonuç tablosu ve taşınan değerler — gizliler maskeli.',
        cizim: { tur: 'maket', bolge: 'kartlar', etiket: 'Adım adım sonuç' }
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
        cizim: { tur: 'maket', bolge: 'eylem', etiket: 'Üçü de "Ekran ekle"de yan yana' }
      },
      { baslik: 'Sol panel', hedef: '.alt-nav', metin: 'Ekranlar, alt modeller (ör. bir kart bloğu) ve ortak akışlar (birden çok ekranın kullandığı adımlar, ör. ödeme) burada. Devre dışı ekranlar varsayılan olarak gizlidir.' },
      { baslik: 'Ekran değişince', metin: 'Sayfa değiştiyse aynı ekrana yeni paket yükleyin ya da yeniden tarayın. Farklar "bulgular" olarak gelir; kabul ettikleriniz yeni model sürümü olur, eski senaryolar korunur.', cizim: { tur: 'akis', kutular: [{ baslik: 'Yeni tarama', ikon: 'yenile' }, { baslik: 'Bulgular', alt: 'farklar', ikon: 'uyari' }, { baslik: 'Kabul / ret', ikon: 'onay' }, { baslik: 'Yeni sürüm', ikon: 'katman' }] } }
    ]
  },
  'ekran-ekle': {
    baslik: 'Ekran ekle',
    adimlar: [
      { baslik: 'Ekran paketi', metin: 'Paket, sayfanın alanlarını, adımlarını ve önerilen senaryoları içeren bir JSON dosyasıdır. Yükleyince önce önizleme gösterilir; hiçbir şey onayınız olmadan kaydedilmez.', cizim: { tur: 'akis', kutular: [{ baslik: 'Paket', alt: '.json', ikon: 'dosya' }, { baslik: 'Önizleme', ikon: 'goz' }, { baslik: 'Seçim', alt: 'senaryolar', ikon: 'liste' }, { baslik: 'Ekle', ikon: 'onay' }] } },
      { baslik: 'Paketiniz yoksa: üç yol', hedef: '.ekleme-kutulari', sira: ['Ekranı tara: Nöbetçi sayfayı yalnızca okuyarak tarar; düğmelere basmaz, form göndermez.', 'Akışı kaydet: işlemi siz yaparsınız, Nöbetçi adımları ve alanları kaydeder (çok adımlı formlar için).', 'Yapay zekâ ile oluştur: "İstek metnini kopyala" ile metni alın, sayfanın bağlantısıyla (ve "Paket biçimini indir" dosyasıyla) yapay zekâ aracınıza verin; ürettiği paketi yukarıdaki "Dosya seç" ile yükleyin.'] },
      { baslik: 'Adımlar', sira: ['Paketi yükleyin ya da aşağıdaki kutulardan birini seçin.', 'Önizlemede alanları ve uyarıları kontrol edin.', 'Eklenecek senaryo önerilerini ve ortamlarını seçin.', 'Test verisine yazılacakları seçin: tablo başına yaz / birleştir / yeni ad / atla ve bağlanacak alanlar (seçmediğiniz yazılmaz).', '"Ekle": ekran, model sürüm 1, seçilen senaryolar ve onayladığınız tablolar oluşur.'] },
      { baslik: 'Güvenlik', metin: 'Tarama sayfayı yalnızca okur; kayıt oluşturan düğmelere basmaz. Yasak adreslere (Ayarlar > Güvenlik) hiç gidilmez.' }
    ]
  },
  ekran: {
    baslik: 'Ekran ayrıntısı',
    adimlar: [
      { baslik: 'Ekran ayrıntısı', metin: 'Modelin adımları, alanları ve kuralları; sürüm geçmişi; akışlar ve senaryolar bu sayfada toplanır.', hedef: '.sayfa-basligi' },
      { baslik: 'Eylemler', hedef: '.sayfa-basligi .eylemler', metin: '"Modeli güncelle" menüsü modelle ilgili tüm eylemleri toplar; her seçeneğin altında ne zaman kullanılacağı yazar: Paket yükle, Ekranı tara, Akışı kaydet, Tekrar analiz et, Yapay zekâ ile yorumla. ⋯ menüsü: yeniden adlandır, URL yolunu düzenle, devre dışı bırak, sil.' },
      { baslik: 'Akışlar', metin: 'Bir ekranda birden çok akış olabilir (ör. bireysel ve kurumsal yol). Akış diyagramında adımları sürükleyip sıralar, ortak akış bloklarını eklersiniz.', cizim: { tur: 'akis', kutular: [{ baslik: 'Giriş', ikon: 'anahtar' }, { baslik: 'Form', ikon: 'duzenle' }, { baslik: 'Ortak akış', alt: 'ör. ödeme', ikon: 'pusula' }, { baslik: 'Sonuç', ikon: 'onay' }] } },
      { baslik: 'Önerilen sıra', sira: ['Modeli kontrol edin (alan etiketleri, zorunluluk, seçenekler).', 'Gerekirse seçim alanlarını test verisi tablolarına bağlayın.', 'Mevcut senaryolardaki düz değerleri Test verisi sekmesinde "Değerleri tabloya bağla…" ile tabloya çevirin (önce plan gösterilir, seçtikleriniz onayla yazılır; koşuda ekrana giden değer değişmez).', 'Senaryolar\'dan senaryo oluşturun.'] }
    ]
  },
  'akis-tasarimi': {
    baslik: 'Akış tasarımı',
    adimlar: [
      { baslik: 'Akış diyagramı', metin: 'Ekranın adımları kutular hâlinde, çalışma sırasıyla. Kutuları sürükleyerek sıralar, "+" ile koşullu adım ya da ortak akış eklersiniz.', cizim: { tur: 'akis', kutular: [{ baslik: 'Adım 1', ikon: 'duzenle' }, { baslik: 'Koşullu', alt: 'ör. Kurumsal ise', ikon: 'isaret' }, { baslik: 'Ortak akış', ikon: 'pusula' }, { baslik: 'Kontrol', ikon: 'onay' }] } },
      { baslik: 'Sıra', sira: ['Mevcut akışı kopyalayın ya da "Akış ekle" açın.', 'Adımları ekleyin / sıralayın; koşulları yazın (ör. "Müşteri tipi = Kurumsal ise").', '"+ > Ortak akış" ile ortak blokları ekleyin; isteğe bağlıysa senaryoda "dahil" seçilir.', 'Kaydedin: etkilenecek senaryolar önce gösterilir, onayınızla kaydedilir.'] },
      { baslik: 'Ekran görüntüsü al', metin: 'Alan grubunda (ya da aksiyonda) "Ekran görüntüsü al" işaretli adımların sonunda görüntü alınır — adım ekran görüntüleri "Seçili adımlarda" iken (Ayarlar > Koşu > Kayıt ya da senaryo formu). Diğer seçimlerde işaret etkisizdir.' },
      {
        baslik: 'İndirilen dosyayı doğrula',
        metin: ['Ekrandaki bir düğme dosya indiriyorsa (ör. sipariş listesi, fatura) "+ > İndirilen dosyayı doğrula" bloğunu ekleyin: düğmeyi seçin, beklentileri yazın. Koşuda düğmeye basılır, indirilen dosya okunur ve her beklenti ayrı ayrı denetlenir.',
          'Biçimler: CSV (ayraç ve kodlama otomatik bulunur: UTF-8, UTF-8-BOM, Windows-1254), Excel XLSX, PDF (metni olan PDF; şifreli ya da taranmış PDF açık bir hatayla kalır) ve düz metin. Beklentiler: dosya adı deseni (* ve ?), en az boyut, metin içeriyor / içermiyor, sütun var, satır sayısı (= ya da ≥; başlık hariç) ve "şu satırda şu sütun şu değer".',
          'Metinlerde ${Tablo.Sütun} (test verisi), ${akis:Ad} (önceki SQL adımında okunan) ve senaryo alanı yazılabilir. Karşılaştırma büyük / küçük harf farkını yok sayar.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Düğme', alt: 'indir', ikon: 'indir' }, { baslik: 'Dosya', alt: 'geçici klasör', ikon: 'dosya' }, { baslik: 'Beklentiler', alt: 'geçti / kaldı', ikon: 'onay' }, { baslik: 'Silinir', ikon: 'cop' }] },
        ipucu: 'Sonuçta her beklenti için Beklenen / Görülen yazar; gizli değerler maskelenir. Dosyanın kendisi varsayılan olarak saklanmaz; Ayarlar > Koşu > Kayıt > "Doğrulanan dosya" ile değiştirebilirsiniz. Saklanan dosya test ayrıntısında "Dosyayı indir" ile iner (ham hâliyle; indirmeden önce onay).'
      }
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
      { baslik: 'Tarama', metin: 'Nöbetçi sayfayı seçili ortamda açar, alanları ve seçenekleri okur ve bir ekran paketi üretir. İlerlemeyi burada izlersiniz; bitince paket önizlemesine geçilir.', cizim: { tur: 'maket', bolge: 'form', etiket: 'Alanlar tek tek okunur' } },
      { baslik: 'Dikkat', metin: 'Tarama yalnızca okur ve bilgi amaçlı düğmelere basar (sekme, ok, sorgula). Kayıt oluşturan düğmelere basılmaz. Süre sınırı ve girişte saklanan oturumun kullanılıp kullanılmayacağı Ayarlar > Koşu\'dadır; Giriş adımında hangisinin yapıldığı (saklanan oturum / baştan giriş) yazar.' }
    ]
  },

  'ayarlar-proje': {
    baslik: 'Proje ve ortamlar',
    adimlar: [
      { baslik: 'Ayarlar', hedef: '.alt-nav', metin: 'Ayarlar bölümleri solda. Buradaki her seçim sizin kararınızdır; Nöbetçi\'nin kodunda sizin yerinize verilmiş bir tercih yoktur.' },
      { baslik: 'Ortamlar', metin: 'Testlerin çalışacağı adresler (ör. test, hazırlık, canlı). Her ortamın türü Test ya da Canlı\'dır. Canlı ortamda yalnızca test ortamına özel adımlar (ör. ödeme) atlanır. Adresler kasada şifrelidir.', cizim: { tur: 'katman', katmanlar: [{ baslik: 'Proje' }, { baslik: 'TEST ortamı', alt: 'türü: Test' }, { baslik: 'CANLI ortamı', alt: 'türü: Canlı — her işlemde onay' }] } },
      {
        baslik: 'Ortam türü: Test / Canlı',
        metin: [RISKLI_ORTAM_TANIMI, 'Canlı ortamda koşu, Dene, tarama, akış / giriş kaydı ve servis istekleri yapılabilir; yalnız her işlem başlamadan "CANLI ortam" penceresinde onayınız istenir ("Evet, devam et") ve Ayarlar > İzinler\'de "Canlı ortamda çalıştırma" izni gerekir. Siz onaylamadıkça Canlı ortama istek gitmez.'],
        ipucu: 'Türü seçilmemiş (eski) ortamlar listede "Türünü seçin" olarak görünür. Canlı\'dan Test\'e geçmek onay ister; her değişiklik ortamın "Geçmiş"inde durur.'
      },
      {
        baslik: 'Servis taban adresleri',
        metin: ['Aynı sunucuyu kullanan servisler bir taban adresine bağlanır (ör. "Çekirdek": TEST ve CANLI adresleri). Listede her taban adresinin kaç servis tarafından kullanıldığı görünür; "Kullanan: N servis" açılınca servisler listelenir.',
          'Taban adresini değiştirince kaydetmeden önce etkilenen servisler (eski → yeni adres, senaryo / akış sayısı) gösterilir; onaylamadan yazılmaz. Bir ortamın adresini silmek ya da taban adresini silmek bağlı servislerin o ortamdaki adresini boş bırakır: servis o ortamda koşmaz ("taban adresi tanımlı değil"); onay penceresi bu servisleri listeler.',
          'Yeni taban adresi eklerken "Hangi servisler bu adresi kullansın?" sorulur: önce taban adresi boş olan servisler, sonra diğerleri şu anki adresleriyle; hiçbiri işaretli gelmez.',
          'Bağlı bir servisin adresi başka yoldan (içe aktarma, sihirbaz, servis sayfası, "Servis bazında") tabanınkinden farklı olacaksa kaydetmeden önce sorulur: "Servisi tabandan ayır" (yalnız bu servis), "Tabanın adresini güncelle" (bağlı tüm servisler; etki listesiyle) ya da "Vazgeç" (servis tabandaki adreste kalır).'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Taban adresi', alt: 'ortam başına', ikon: 'ag' }, { baslik: 'Etki', alt: 'servisler, senaryolar', ikon: 'liste' }, { baslik: 'Onay', ikon: 'onay' }] },
        ipucu: 'Servis sayfasında (İşlemler) taban adresi bu listeden seçilir; "Ayarlar\'da yönet" buraya getirir. "Servis bazında" görünüm servislerin adreslerini tek tek ve toplu düzenler. Hiçbir adrese istek atılmaz.'
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
      { baslik: 'Değer değişince', metin: 'Bir hücrenin değerini değiştirip (ör. "a" → "b") kaydettiğinizde, o değeri düz metin olarak kullanan senaryolar (ekran alanı, servis alanı, satır seçimi) listelenir: seçtiklerinizi tabloyla birlikte yeni değere güncelleyebilir ya da yalnız tabloyu kaydedebilirsiniz. Silinen değeri kullanan senaryolar uyarı olarak gösterilir; koşan senaryolar atlanır. Karşılıklar yeni değere kendiliğinden taşınır. SoapUI / Postman aktarımı ve "Test verisine taşı" mevcut bir değeri değiştirecekse bu, önizlemede "Tabloda değişecek değerler ve etkilenen senaryolar" bölümünde görünür (seçimlerinizle güncellenir; "Mevcut değerleri koru" ile dolu hücrelerin üzerine yazılmaz); aktarım işaretli senaryolarla birlikte yazılır, arada veri değiştiyse yeniden onay istenir.' },
      {
        baslik: 'Veri sağlığı', hedef: ['.veri-sagligi'],
        metin: 'Sayfanın üstündeki özet: birleştirilebilecek tablolar (adları farklı, sütun başlıkları aynı; büyük / küçük harf, Türkçe karakter, noktalama ve sütun sırası fark etmez; puana göre sıralı, "kod / açıklama / ad / değer / id" gibi genel adlar puanda düşük ağırlık alır, eşik altı öneriler "Düşük benzerlikleri de göster" ile açılır — eşik Veri sağlığı başlığındaki ayarlar (dişli) düğmesinin açtığı Test verisi ayarlarında), hiçbir yerde kullanılmayan tablolar, hiçbir satırında değer olmayan sütunlar ve kırık başvurular (silinmiş tabloyu ya da sütunu gösteren senaryo, alan bağı, satır seçimi, kural). Her maddeye tıklayınca ilgili tablo ya da ekran açılır. Değer gösterilmez.',
        cizim: { tur: 'katman', katmanlar: [{ baslik: 'Benzer tablolar', alt: 'birleştir' }, { baslik: 'Kullanılmayan / boş', alt: 'temizle' }, { baslik: 'Kırık başvurular', alt: 'düzelt' }] }
      },
      {
        baslik: 'Tabloları birleştirme',
        metin: ['"Birleştir…" penceresinde kalacak tabloyu seçersiniz; her tablonun nerede kullanıldığı (ekran / servis bağı, senaryo, satır seçimi, kural) yazar ve en çok kullanılan önerilir. İsterseniz kalan tabloya yeni ad verin. Emin olunamayan sütun eşlemeleri (ör. "E-posta adresi" ≈ "Eposta") siz onaylayana kadar bekler.',
          'Diğer tabloların farklı satırları kalan tabloya eklenir; aynı satırlar eklenmez, ortama özel satırlar kendi ortamında kalır. Aynı adlı ama değerleri farklı satırda ve farklı karşılıklarda seçimi siz yaparsınız (gizli sütunlar yalnız "aynı / farklı" diye gösterilir). Biri gizli biri açık iki sütun eşleşirse birleşik sütun gizli olur (önizlemede "Bu sütun gizli olacak" notu; değerler şifreli saklanır). Birleştirilen tabloları kullanan her şey kalan tabloya yeniden eşlenir; gerekirse aynı satırın seçilmesi için satır seçimi eklenir.',
          'Önizleme hiçbir şey yazmaz ve kuru doğrulama yapar: etkilenen her senaryo ve servis isteği her ortamda eski ve yeni hâliyle çözülür (hiçbir şey çalıştırılmaz). Bir değer değişecekse birleştirme yapılmaz, farklar listelenir. Onaylayınca önce otomatik yedek alınır, her şey tek işlemde yazılır ve değişiklik geçmişine düşer.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Kalacak tablo', ikon: 'veri' }, { baslik: 'Eşleme ve çakışmalar', ikon: 'esle' }, { baslik: 'Kuru doğrulama', ikon: 'kalkan' }, { baslik: 'Onay + yedek', ikon: 'onay' }] }
      },
      { baslik: 'Birleştirme sırası', sira: ['Veri sağlığı > Birleştirilebilecek tablolar > "Birleştir…".', 'Kalacak tabloyu seçin (gerekirse yeni ad).', 'Sütun eşlemesini onaylayın; satır ve karşılık çakışmalarında seçim yapın.', 'Kuru doğrulama "aynı değerleri üretiyor" diyorsa "Birleştir" ile onaylayın.', 'Kaynak tabloları istediğinizde ayrı onayla silin; Veri sağlığı başlığındaki geçmiş düğmesinden (Birleştirme geçmişi) bir birleştirmeyi geri almak onları da geri getirir.'],
        ipucu: 'Yeni tablo oluştururken, Excel / CSV yüklerken, ekran paketi ya da SoapUI / Postman aktarırken aynı başlıklı tablo varsa "Benzer tablo var: onu kullan / yine de yeni oluştur" sorulur.' },
      {
        baslik: 'Kişi alanlarını tabloya bağlama',
        metin: ['Ekran > Test verisi sekmesindeki "Kişi alanlarını tabloya bağla…", ekrandaki kişi / kimlik alanlarını (kimlik no, vergi no, pasaport, doğum tarihi, telefon, e-posta, ad soyad) bir kişi / kayıt tablosunun sütunlarına bağlamayı önerir; eşlemeyi siz onaylarsınız.',
          'Her senaryo için sonuç gösterilir (değer gösterilmez): "eşleşti" (kişinin değerleri tablodaki bir satırla aynı), "yeni satır" (tabloda yok: satır adı önerilir, ortama özel olup olmayacağını seçersiniz) ya da "atlandı" ve nedeni (ör. kişinin alanları tabloda farklı satırlarda). Bir kişinin alanları hep aynı satırdan gelir. Koşuda ekrana giden değer değişecek alan çevrilmez. Onaylayınca bağlar, yeni satırlar ve senaryolar tek işlemde yazılır.',
          'Aynı türden ikinci bir kişi alanı varsa (ör. ikinci telefon, "alıcı / ödeyen" ön ekli alanlar, ayrı bölümdeki kişiler) o alanlar ayrı bir ETİKETLE bağlanmak üzere önerilir (etiket alanın ya da bölümün adından, ör. "ödeyen"); iki kişi tablonun ayrı satırlarından gelir. Etiketi pencerede değiştirebilirsiniz.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Kişi alanları', ikon: 'kullanici' }, { baslik: 'Sütun eşleme', alt: 'öneri + onay', ikon: 'esle' }, { baslik: 'Satır', alt: 'eşleşti / yeni', ikon: 'veri' }, { baslik: 'Senaryo', alt: '${Tablo.Sütun}', ikon: 'onay' }] }
      }
    ]
  },
  'ayarlar-kosu': {
    baslik: 'Koşu ayarları',
    adimlar: [
      { baslik: 'Koşu ayarları', metin: 'Video / ekran görüntüsü / iz kaydı, yeniden deneme, süre limiti, bekleme süreleri, servis zaman aşımı, tarih biçimi, servislerde yetki hatasında (401 / 403) ne yapılacağı ve tarama / akış kaydı (süreler, ekran boyutu, dil, açılır liste keşif sınırı, girişte giriş alanı beklemesi; koşudaki giriş beklemelerinden ayrı). Tarama ve akış kaydında giriş: varsayılan her seferinde baştan giriş; "Koşunun saklanan oturumunu kullan" seçilirse koşunun aynı ortam ve giriş profili için şifreli sakladığı oturum denenir ("Girişte oturum kontrolü" süresiyle), geçersizse baştan girilip oturum güncellenir; "Giriş yapmadan aç" saklanan oturumu hiç kullanmaz. Değişiklik sonraki koşulardan itibaren geçerlidir.', cizim: { tur: 'form', alanlar: ['Video', 'Yeniden deneme', 'Süre limiti'], dugme: 'Kaydet' } },
      {
        baslik: 'Kayıt: görüntü, video ve iz',
        metin: ['Video, test sonu ekran görüntüsü ve iz (trace) için: her testte, yalnız başarılı testlerde, yalnız kalan testlerde ya da kapalı. "Yalnız başarılı"da kayıt her testte alınır, kalan testlerinki kaydedilmeden silinir.',
          'İz, testin adım adım kaydıdır: ağ istekleri, her adımdaki sayfa yapısı ve ekran anları. Sonuç ayrıntısından indirilir, Playwright iz görüntüleyicisiyle (npx playwright show-trace) açılır.',
          'Adım ekran görüntüleri: her adımda (varsayılan), yalnız kalan adımda, seçili adımlarda (akış tasarımında "Ekran görüntüsü al" işaretli adımlar) ya da kapalı; senaryo formunda senaryo başına değiştirilebilir. Video boyutu: Küçük (varsayılan) ya da Ekranla aynı (koşu ekran boyutu).'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Adımlar', alt: 'görüntü', ikon: 'ekran' }, { baslik: 'Test sonu', alt: 'görüntü', ikon: 'onay' }, { baslik: 'Video', alt: 'boyut', ikon: 'video' }, { baslik: 'İz', alt: 'trace', ikon: 'liste' }] }
      },
      { baslik: 'Gelişmiş koşu davranışı', metin: 'Açılır bölümde koşucunun kararları: alan görünmezse ne kadar beklenip atlanacağı ya da testin kalacağı, tarayıcı onay pencerelerine verilecek yanıt, adım / giriş beklemeleri, tablodan satır seçimi (ilk uyan ya da rastgele; ortamı boş satır her ortamda geçerli), SQL satır sınırı (SQL adımındaki beklenen satır sayısı bunu aşamaz: kaydederken uyarı verilir; sınırı düşürürseniz aşan adımlar koşuda anlaşılır bir hatayla kalır), koşu tarayıcısının boyutu, dili ve saat dilimi. Her ayarın varsayılanı Nöbetçi\'nin bugüne kadarki davranışıdır.', ipucu: 'Senaryolar her zaman sırayla koşar: giriş oturumu paylaşıldığı için eşzamanlı koşu sunulmaz.' },
      { baslik: 'Hata sınıflandırma', metin: 'Kalan testin hata mesajında belirli bir metin geçerse hangi kategoride görüneceğini siz tanımlarsınız (ör. uygulamanızın iş kuralı uyarısı "iş kuralı" sayılsın).' },
      {
        baslik: 'Zamanlanmış koşular',
        metin: 'Nöbetçi\'nin belirli saatlerde kendiliğinden koşu başlatmasını ayarlayın: her gün, haftanın seçili günleri ya da her N saatte bir. Kural ekran senaryolarını, servis akışlarını ve uçtan uca akışları koşabilir. Koşular yalnızca Nöbetçi açıkken ve kasa açıkken çalışır. Varsayılan olarak kaçan zamanlar sonradan koşulmaz, başka bir koşu sürerken gelen zaman atlanır; kartın "Zamanlanmış koşu davranışı" bölümünden "Sonra bir kez koş" / "Bitince koş" seçebilirsiniz.',
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
      { baslik: 'Yedekler', metin: 'Dışa aktar: şifreli .tayedek dosyası. İçe aktar: başka bir bilgisayarın yedeğindeki kayıtları seçerek alın. Otomatik yedek her gün alınır. Yedeğin tamamı yüklenince (ya da seçmeli içe aktarmada Ayarlar\'daki "izinler" kaydı alınınca) yedekteki izinler ve ortamların türleri (Test / Canlı) olduğu gibi geçerli olur; Nöbetçi açıldığında bir kez hangi izinlerin açık olduğunu gösteren bir uyarı çıkar ("Tamam" ya da "İzinlere git" ile kapatılınca kimse için bir daha çıkmaz).', cizim: { tur: 'akis', kutular: [{ baslik: 'Kasa', ikon: 'kilit' }, { baslik: '.tayedek', alt: 'şifreli', ikon: 'arsiv' }, { baslik: 'Başka bilgisayar', ikon: 'bilgisayar' }] } },
      { baslik: 'Saklama', metin: 'Kaç otomatik yedeğin tutulacağını ve koşu sonuçlarının ne kadar saklanacağını siz belirlersiniz. Geçmiş sonuçları buradan silebilirsiniz (önce kaç kayıt silineceği gösterilir).' },
      {
        baslik: 'Medyayı incelt (kademeli saklama)',
        metin: ['N günden eski sonuçlarda başarılı, kalan ya da tüm testlerin ekran görüntüleri ve videoları silinir; sonucun kendisi (durum, süre, hata metni, adımlar) ve izler kalır. Kalan testlerde "kalan adımın görüntüsünü ve test sonu görüntüsünü koru" işaretliyse (varsayılan) hatanın görüldüğü iki görüntü kalır. Silinen medya sonuçta "saklama süresi doldu" diye görünür.',
          'Günlük temizlikte sıra: önce "Koşu sonuçlarını sakla" (bütün sonucu siler), sonra inceltme, en son Güvenlik > Video saklama süresi. Video hangi süre önce dolarsa o zaman silinir.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Sonuç saklama', alt: 'bütün sonuç', ikon: 'cop' }, { baslik: 'İnceltme', alt: 'görüntü + video', ikon: 'ekran' }, { baslik: 'Video saklama', alt: 'Güvenlik', ikon: 'video' }] }
      }
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
      { baslik: 'Yedekten yüklemede', metin: 'Yedekten tam yüklemede izinler yedektekiyle olduğu gibi geçerli olur (değiştirilmez). Yüklemeden sonra Nöbetçi açılınca bir kez "Yedek yüklendi" penceresi açık izinleri ve ortamların türlerini (Test / Canlı) gösterir; buradan gözden geçirin.' }
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
      { baslik: 'Bağlama sırası', sira: ['"Bağlantı ekle" ile türü seçin.', 'Alanları doldurun; hangi olaylarda ve hangi ortamlarda çalışacağını seçin.', '"Bağlantıyı dene": önce hangi adrese deneme isteği gideceği gösterilir, onaylarsanız gider.', 'Kaydedin; durum rozeti bağlı / denenmedi / hata olarak görünür.'] },
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
  'ayarlar-raporlar': {
    baslik: 'Raporlar',
    adimlar: [
      {
        baslik: 'Rapor verileri',
        metin: ['PDF raporlarının kullandığı kararlarınız burada durur. Hepsi isteğe bağlıdır; boşken raporlar varsayılanlarla çalışır. Değişiklikler hemen kaydedilir ve yalnız raporları etkiler.'],
        cizim: { tur: 'akis', kutular: [{ baslik: 'Ekip', alt: 'sahip önerisi', ikon: 'liste' }, { baslik: 'Kritik', alt: 'öncelik + rozet', ikon: 'uyari' }, { baslik: 'Süre eşiği', alt: 'p95 > eşik', ikon: 'saat' }, { baslik: 'PDF rapor', ikon: 'grafik' }] }
      },
      { baslik: 'Ekipler', metin: 'Ekip ekleyin, yeniden adlandırın ya da silin. Ekran ve servis satırındaki "Ekip" seçimi, raporda o öğenin aksiyonlarının "Sahip önerisi" olur; seçilmezse sınıfın varsayılan ekibi yazılır.' },
      { baslik: 'Kritik işareti', metin: 'Ekran, ortak akış, servis ya da akış satırındaki "Kritik" anahtarı öncelik puanını artırır. Kritik işaretli bir öğe son koşusunda kaldıysa raporun durum rozeti Kritik olur ve "Kritik akış" kartında görünür.' },
      { baslik: 'Süre eşikleri', metin: 'Ekran ve servis için milisaniye cinsinden eşik; servislerde metot başına ayrı eşik de verebilirsiniz (metodun eşiği yoksa servisinki geçer). Dönemdeki p95 süre eşiği aşarsa raporda "Süre eşiği aşımları"nda ve aksiyon listesinde görünür.' },
      { baslik: 'Uygulama sürümü', metin: 'Sürüm bu bölümde değil, Proje ve ortamlar > ortam > "Uygulama sürümü"nde ya da koşu başlatılırken girilir. Raporlar sürüme göre başarıyı ve sorunun hangi sürümde başladığını gösterir.', ipucu: 'Nöbetçi sürümü hiçbir adrese sormaz; yalnız sizin girdiğiniz değer kullanılır.' }
    ]
  },
  'ayarlar-arayuz': {
    baslik: 'Arayüz',
    adimlar: [{ baslik: 'Görünüm ve rehberler', metin: 'Tema (Komuta merkezi, Kurumsal, Canlı), Nöbetçi\'nin kendi penceresinde mi tarayıcıda mı açılacağı, rehberlerin her ekranın ilk açılışında kendiliğinden başlayıp başlamayacağı ve listelerin sayfa boyları. "Tüm rehberleri yeniden göster" hepsini görülmemiş yapar; "?" düğmesi her zaman çalışır.', cizim: { tur: 'maket', bolge: 'soru', etiket: '"?" her ekranda sağ üstte' } },
      { baslik: 'Raporlar ve sağlık noktası', metin: 'HTML rapora gömülen ekran görüntülerinin toplam sınırı (varsayılan 25 MB) ve Sonuçlar ekranındaki sağlık noktasının renk eşikleri (proje başına; varsayılan yeşil ≥ %90, sarı ≥ %75).' }]
  }
};
