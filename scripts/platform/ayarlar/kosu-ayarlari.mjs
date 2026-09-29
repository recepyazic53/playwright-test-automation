// KOŞU, SAKLAMA VE ARAYÜZ AYARLARI (Ayarlar > Koşu, Yedekleme, Arayüz) — kullanıcının verdiği kararlar. Kasada (ayarlar tablosu,
// anahtar "kosu") şifreli saklanır; verilmeyen ayar varsayılanını kullanır. Nöbetçi koşuyu başlatırken ayarları alt sürece
// ortam değişkeni olarak verir (kosuOrtamDegiskenleri); playwright.config.ts ve model koşucusu
// bu değişkenleri okur (yoksa aynı varsayılanlar). Servis ayarları (zaman aşımı, varsayılan tarih biçimi) sunucuda kullanılır.
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';
import { KOSU_HIZI_ALANLARI } from './kosu-hizi.mjs';

/** Koşu hızı ayarının varsayılanı ve sınırları (tek tanım: kosu-hizi.mjs). @param {string} a */
function hizAlani(a) {
  const t = /** @type {(typeof KOSU_HIZI_ALANLARI)[number]} */ (KOSU_HIZI_ALANLARI.find((x) => x.anahtar === a));
  return { varsayilan: t.varsayilan, enAz: t.enAz, enCok: t.enCok };
}

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const KOSU_AYAR_ANAHTARI = 'kosu';
/** Tarayıcı dili seçenekleri (BCP 47). @type {ReadonlyArray<[string, string]>} */
const DIL_SECENEKLERI = [['tr-TR', 'Türkçe (tr-TR)'], ['en-US', 'İngilizce (en-US)'], ['en-GB', 'İngilizce (en-GB)'], ['de-DE', 'Almanca (de-DE)'],
  ['fr-FR', 'Fransızca (fr-FR)'], ['es-ES', 'İspanyolca (es-ES)'], ['it-IT', 'İtalyanca (it-IT)'], ['nl-NL', 'Felemenkçe (nl-NL)'], ['ru-RU', 'Rusça (ru-RU)'], ['ar-SA', 'Arapça (ar-SA)']];
/** Saat dilimi seçenekleri (IANA); "bilgisayar": verilmez, bilgisayarın saat dilimi. @type {ReadonlyArray<[string, string]>} */
const SAAT_DILIMI_SECENEKLERI = [['bilgisayar', 'Bilgisayarın saat dilimi'], ['UTC', 'UTC'], ['Europe/Istanbul', 'Europe/Istanbul'], ['Europe/London', 'Europe/London'],
  ['Europe/Berlin', 'Europe/Berlin'], ['Europe/Moscow', 'Europe/Moscow'], ['Asia/Dubai', 'Asia/Dubai'], ['Asia/Tokyo', 'Asia/Tokyo'], ['America/New_York', 'America/New_York'],
  ['America/Los_Angeles', 'America/Los_Angeles']];

/**
 * Tanımlar: arayüz bu listeden formu çizer (bölüm: ayar sayfası, grup, etiket, açıklama, tür, sınırlar); sunucu doğrular.
 * env: alt sürece verilen ortam değişkeni (yoksa yalnız sunucuda kullanılır). carpan: ortam değişkenine yazılırken çarpan.
 * bolum 'zamanlama': Ayarlar > Koşu > Zamanlanmış koşular kartındaki form. altBolum 'gelismis': bölümün açılır "Gelişmiş koşu davranışı" kısmı.
 * Her ayarın varsayılanı, ayar eklenmeden önceki davranıştır.
 * etkinKosul: ayar yalnız başka bir ayar (anahtar) şu değerdeyken (deger) ya da şu değerlerden birindeyken (degerler) kullanılır; arayüz aksi hâlde alanı pasif gösterir
 * (pasifAciklama). Kaydedilen değer korunur.
 * tur 'onay': açık / kapalı (true / false; onay kutusu).
 * bolum 'testVerisi': Ayarlar > Test verisi > Veri sağlığı başlığındaki ayarlar (dişli) düğmesinin açtığı "Test verisi ayarları" diyaloğu.
 * @type {ReadonlyArray<{ anahtar: string; bolum?: 'kosu' | 'yedekleme' | 'arayuz' | 'zamanlama' | 'testVerisi'; altBolum?: 'gelismis'; grup: string; etiket: string; aciklama: string; tur: 'secim' | 'sayi' | 'metin' | 'onay';
 *   varsayilan: string | number | boolean; secenekler?: ReadonlyArray<[string, string]>; enAz?: number; enCok?: number; birim?: string; env?: string; carpan?: number;
 *   etkinKosul?: { anahtar: string; deger?: string; degerler?: string[]; pasifAciklama: string } }>}
 */
export const KOSU_AYAR_TANIMLARI = Object.freeze([
  // Kayıt: seçimlerin Playwright kiplerine eşlenmesi ve "yalnız başarılı" süzgeci ayarlar/kayit-kurallari.mjs'dedir.
  { anahtar: 'video', grup: 'Kayıt', etiket: 'Video', aciklama: 'Nöbetçi\'den başlatılan koşularda video kaydı. "Yalnız başarılı testlerde": kayıt her testte alınır, kalan testlerinki kaydedilmeden silinir.', tur: 'secim', varsayilan: 'her',
    secenekler: [['her', 'Her testte'], ['yalnizBasari', 'Yalnız başarılı testlerde'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_VIDEO' },
  { anahtar: 'videoBoyutu', grup: 'Kayıt', etiket: 'Video boyutu', aciklama: 'Küçük: video 800 piksele sığdırılır (Playwright varsayılanı; dosya küçük). Ekranla aynı: koşu ekran boyutunda (Gelişmiş > Tarayıcı > Koşu ekran genişliği / yüksekliği) kaydedilir; metin daha net okunur, dosya büyür.',
    tur: 'secim', varsayilan: 'kucuk', secenekler: [['kucuk', 'Küçük'], ['ekran', 'Ekranla aynı']], env: 'NOBETCI_VIDEO_BOYUTU' },
  { anahtar: 'ekranGoruntusu', grup: 'Kayıt', etiket: 'Ekran görüntüsü (test sonu)', aciklama: 'Testin sonunda alınan ekran görüntüsü. Adım görüntüleri bundan bağımsızdır (aşağıdaki "Adım ekran görüntüleri").',
    tur: 'secim', varsayilan: 'yalnizHata', secenekler: [['her', 'Her testte'], ['yalnizBasari', 'Yalnız başarılı testlerde'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_EKRAN_GORUNTUSU' },
  { anahtar: 'adimGoruntusu', grup: 'Kayıt', etiket: 'Adım ekran görüntüleri',
    aciklama: 'Akış adımlarının ekran görüntüsü. Yalnız kalan adımda: yalnız testin kaldığı adımın görüntüsü alınır. Seçili adımlarda: yalnız ekranın akış tasarımında "Ekran görüntüsü al" işaretli adımlar (giriş ve ekran açılışı görüntüsü alınmaz). Senaryo formunda senaryo başına değiştirilebilir. Görüntü alınamazsa koşu sürer; raporda "görüntü alınamadı" notu kalır.',
    tur: 'secim', varsayilan: 'her', secenekler: [['her', 'Her adımda'], ['yalnizKalan', 'Yalnız kalan adımda'], ['secili', 'Seçili adımlarda'], ['kapali', 'Kapalı']], env: 'NOBETCI_ADIM_GORUNTUSU' },
  { anahtar: 'iz', grup: 'Kayıt', etiket: 'İz (trace)',
    aciklama: 'İz, testin adım adım kaydıdır: ağ istekleri, her adımdaki sayfa yapısı (DOM) ve ekran anları, konsol mesajları. Sonuç ayrıntısından indirilip Playwright iz görüntüleyicisiyle (npx playwright show-trace <dosya> ya da trace.playwright.dev) açılır. "Yalnız başarılı testlerde": iz her testte alınır, kalan testlerinki kaydedilmeden silinir.',
    tur: 'secim', varsayilan: 'yalnizHata',
    secenekler: [['her', 'Her testte'], ['yalnizBasari', 'Yalnız başarılı testlerde'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_IZ' },
  { anahtar: 'indirilenDosya', grup: 'Kayıt', etiket: 'Doğrulanan dosya (ek)',
    aciklama: 'İndirilen dosyayı doğrulama adımında (ekran) ve servis yanıtının dosya kontrolünde dosyanın kendisi rapora ek olarak (şifreli) saklansın mı. Saklanırsa sonuç ekranında "Dosyayı indir" ile (onayla, ham hâliyle) indirilir. Saklanmazsa raporda yalnız özet durur: dosyanın adı, boyutu, biçimi ve her beklentinin sonucu. İndirilen dosya koşunun geçici klasörüne yazılır ve doğrulamadan sonra silinir.',
    tur: 'secim', varsayilan: 'kapali', secenekler: [['kapali', 'Saklanmaz (yalnız özet)'], ['yalnizHata', 'Yalnız kalan doğrulamalarda'], ['her', 'Her zaman']], env: 'NOBETCI_INDIRILEN_DOSYA' },
  { anahtar: 'yenidenDeneme', grup: 'Koşu', etiket: 'Yeniden deneme', aciklama: 'Kalan test kaç kez yeniden denensin (0: denenmez).', tur: 'sayi', varsayilan: 0, enAz: 0, enCok: 3, env: 'NOBETCI_YENIDEN_DENEME' },
  { anahtar: 'kosuSureLimitiDk', grup: 'Koşu', etiket: 'Koşu süre limiti', aciklama: 'Tek bir koşu bu süreyi aşarsa durdurulur. Testin kendi süre sınırı da buna göre ayarlanır (limitten 30 sn önce dolar; hata kaydı ve görüntüler alınabilsin diye).',
    tur: 'sayi', varsayilan: 10, enAz: 1, enCok: 120, birim: 'dk', env: 'NOBETCI_KOSU_SURE_LIMITI_MS', carpan: 60_000 },
  { anahtar: 'enCokVeriKosusu', grup: 'Koşu', etiket: 'Tek senaryoda en çok veri koşusu',
    aciklama: 'Senaryo tablodan birden çok satırla (seçili satırlar, uyan tüm satırlar ya da kombinasyonlar) koşarken bir senaryodan çıkabilecek en çok test. Aşılırsa koşu başlatılmaz; senaryonun satır seçimini daraltın.',
    tur: 'sayi', varsayilan: 50, enAz: 1, enCok: 1000, birim: 'test' },
  { anahtar: 'alanBeklemeSn', grup: 'Bekleme süreleri', etiket: 'Alan işlemi', aciklama: 'Alan doldurulduktan sonraki tıklama / sorgu (ör. kimlik sorgula) en çok bu kadar beklenir.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_ALAN_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'zorlaIsaretlemeSn', grup: 'Bekleme süreleri', etiket: 'Zorla işaretlenecek seçenek', aciklama: 'Gizli radyo / onay kutusunun sayfada belirmesi için en çok bekleme.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_ZORLA_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'servisZamanAsimiSn', grup: 'Servisler', etiket: 'Servis isteği zaman aşımı', aciklama: 'Servis yanıtı bu sürede gelmezse istek kesilir.', tur: 'sayi', varsayilan: 60, enAz: 5, enCok: 600, birim: 'sn' },
  { anahtar: 'tarihBicimi', grup: 'Servisler', etiket: 'Varsayılan tarih biçimi', aciklama: 'Biçim verilmemiş tarih kurallarında ve ${tarih:…} ifadelerinde kullanılır. yyyy yıl, MM ay, dd gün, HH saat, mm dakika, ss saniye; sabitler tek tırnakta.',
    tur: 'metin', varsayilan: "yyyy-MM-dd'T'HH:mm:ss" },
  { anahtar: 'yetkiHatasinda', grup: 'Servisler', etiket: 'Yetki hatasında (401 / 403)',
    aciklama: 'Oturum akışı ya da token adımı olan servis isteği HTTP 401 / 403 dönerse. Tekrar deneme: istek tekrarlanmaz, sonuç olduğu gibi değerlendirilir. Token\'ı yenile, bir kez tekrar dene: oturum / token adımı yeniden çalıştırılır ve istek bir kez daha gönderilir (raporda not olarak görünür; ikinci deneme de reddedilirse normal hata). Akışta "Genel ayarı kullan" seçiliyse bu değer kullanılır (akışta ayrıca seçim yapılmışsa o geçerlidir). Tekrar da "Servis istekleri" iznine tabidir.',
    tur: 'secim', varsayilan: 'yenileVeTekrar', secenekler: [['tekrarYok', 'Tekrar deneme'], ['yenileVeTekrar', 'Token\'ı yenile, bir kez tekrar dene']] },
  // Koşu hızı (servis / ekran): sınırlar ayarlar/kosu-hizi.mjs'de; ortam formundaki "Koşu hızı" bu dört değeri ortam bazında ezer
  // (boş = bu genel ayar). Varsayılanlar önceki davranış: sırayla, beklemesiz.
  { anahtar: 'servisEszamanli', grup: 'Servis senaryoları', etiket: 'Aynı anda en çok servis senaryosu',
    aciklama: '1: sırayla. Daha büyük değer testleri hızlandırır ama hedef servise aynı anda daha çok istek gider; ağınız ya da hedef sistem bunu sınırlıyorsa 1\'de bırakın. Bir senaryonun kendi adımları (akış adımları, oturum / token) her zaman sırayla koşar. Ortam bazında Ayarlar > Proje ve ortamlar > ortam > Koşu hızı\'ndan değiştirilebilir.',
    tur: 'sayi', ...hizAlani('servisEszamanli'), birim: 'senaryo' },
  { anahtar: 'servisIstekBeklemeMs', grup: 'Servis senaryoları', etiket: 'İstekler arası bekleme',
    aciklama: 'Servise giden her istekten sonra bu kadar beklenir (akış adımları ve oturum / token isteği dahil). Ağ ya da hedef sistem yoğun istekte uyarı veriyorsa artırın; eşzamanlılığı 1\'de tutmak da yükü azaltır.',
    tur: 'sayi', ...hizAlani('servisIstekBeklemeMs'), birim: 'ms' },
  { anahtar: 'ekranEszamanli', grup: 'Ekran senaryoları', etiket: 'Aynı anda en çok ekran senaryosu',
    aciklama: '1: sırayla. Daha büyük değer koşuyu hızlandırır ama uygulamaya aynı anda birden çok tarayıcı bağlanır. Aynı kullanıcıyla eşzamanlı girişler birbirinin oturumunu düşürebilir; giriş tarifi olan ortamda 1 önerilir (giriş bir kez yapılır, diğer senaryolar aynı oturumu kullanır). Ortam bazında Ayarlar > Proje ve ortamlar > ortam > Koşu hızı\'ndan değiştirilebilir.',
    tur: 'sayi', ...hizAlani('ekranEszamanli'), birim: 'senaryo' },
  { anahtar: 'ekranBeklemeMs', grup: 'Ekran senaryoları', etiket: 'Senaryolar arası bekleme',
    aciklama: 'Bir ekran senaryosu bitince aynı yuvadaki sıradaki senaryo bu kadar bekledikten sonra başlar. Uygulama yoğun kullanımda uyarı veriyorsa artırın.',
    tur: 'sayi', ...hizAlani('ekranBeklemeMs'), birim: 'ms' },
  { anahtar: 'taramaZamanAsimiDk', grup: 'Tarama ve akış kaydı', etiket: 'Ekran taraması süre limiti', aciklama: 'Ekran taraması bu sürede bitmezse durdurulur.',
    tur: 'sayi', varsayilan: 5, enAz: 1, enCok: 60, birim: 'dk' },
  { anahtar: 'kayitZamanAsimiDk', grup: 'Tarama ve akış kaydı', etiket: 'Akış kaydı süre limiti', aciklama: 'Akışı kaydederken siz işlemi yaparken en çok bu kadar beklenir.',
    tur: 'sayi', varsayilan: 30, enAz: 5, enCok: 180, birim: 'dk' },
  { anahtar: 'taramaSayfaAcilmaSn', grup: 'Tarama ve akış kaydı', etiket: 'Sayfa açılma zaman aşımı', aciklama: 'Tarama ve akış kaydında hedef sayfa bu sürede açılmazsa iş durur.',
    tur: 'sayi', varsayilan: 30, enAz: 5, enCok: 300, birim: 'sn' },
  { anahtar: 'kesifSecenekSiniri', grup: 'Tarama ve akış kaydı', etiket: 'Açılır liste keşif sınırı', aciklama: 'Taramada seçenekleri tek tek denenen açılır listelerin en çok seçenek sayısı; daha uzun listeler denenmez (raporda belirtilir).',
    tur: 'sayi', varsayilan: 8, enAz: 2, enCok: 50, birim: 'seçenek' },
  { anahtar: 'taramaEkranGenisligi', grup: 'Tarama ve akış kaydı', etiket: 'Tarayıcı ekran genişliği', aciklama: 'Tarama ve akış kaydındaki tarayıcı penceresinin genişliği.',
    tur: 'sayi', varsayilan: 1366, enAz: 320, enCok: 3840, birim: 'px' },
  { anahtar: 'taramaEkranYuksekligi', grup: 'Tarama ve akış kaydı', etiket: 'Tarayıcı ekran yüksekliği', aciklama: 'Tarama ve akış kaydındaki tarayıcı penceresinin yüksekliği.',
    tur: 'sayi', varsayilan: 900, enAz: 240, enCok: 2160, birim: 'px' },
  { anahtar: 'taramaDili', grup: 'Tarama ve akış kaydı', etiket: 'Tarayıcı dili', aciklama: 'Tarama ve akış kaydında tarayıcının dili (sayfanın dil algılaması, tarih / sayı biçimi).',
    tur: 'secim', varsayilan: 'tr-TR', secenekler: DIL_SECENEKLERI },
  { anahtar: 'taramaGirisKipi', grup: 'Tarama ve akış kaydı', etiket: 'Tarama ve akış kaydında giriş',
    aciklama: 'Her seferinde baştan giriş yap: tarama ve akış kaydı boş tarayıcıyla açılır ve giriş yapar; oturum saklanmaz. Koşunun saklanan oturumunu kullan: koşunun bu ortam ve giriş profili için şifreli sakladığı oturum yüklenir; geçerliyse giriş atlanır, değilse baştan giriş yapılır ve başarılı girişin oturumu aynı şifreli dosyaya yazılır (koşu da kullanır). Yalnız aynı ortam ve giriş profilinin oturumu kullanılır; "Giriş yapmadan aç" ile başlatılan iş saklanan oturumu kullanmaz ve güncellemez. Kasa anahtarı yoksa oturum okunmaz, yazılmaz.',
    tur: 'secim', varsayilan: 'bastan', secenekler: [['bastan', 'Her seferinde baştan giriş yap'], ['saklananOturum', 'Koşunun saklanan oturumunu kullan']] },
  { anahtar: 'taramaOturumKontrolSn', grup: 'Tarama ve akış kaydı', etiket: 'Girişte oturum kontrolü',
    aciklama: 'Saklanan oturum yüklendiğinde geçerli olup olmadığı en çok bu kadar denetlenir; süre dolarsa baştan giriş yapılır. Koşudaki "Oturum kontrolü"nden (Gelişmiş koşu davranışı) ayrıdır.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn',
    // Arayüz: bağlı ayar bu değerde değilken alan pasif ve bu açıklama gösterilir (değer korunur).
    etkinKosul: { anahtar: 'taramaGirisKipi', deger: 'saklananOturum', pasifAciklama: 'Yalnız "Koşunun saklanan oturumunu kullan" seçiliyken kullanılır.' } },
  { anahtar: 'taramaGirisAlanBeklemeSn', grup: 'Tarama ve akış kaydı', etiket: 'Girişte giriş alanı beklemesi',
    aciklama: 'Tarama ve akış kaydındaki girişte giriş sayfasının alanlarının (kullanıcı adı, parola, giriş düğmesi, doğrulama kodu düğmesi) görünmesi için en çok bekleme. Giriş tarifindeki adımda süre verilmişse o kullanılır. Koşudaki "Giriş alanı beklemesi"nden ayrıdır.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn' },
  // ---- Gelişmiş koşu davranışı (Ayarlar > Koşu altında ayrı, açılır bölüm) ----
  { anahtar: 'gorunmeyenAlanBeklemeSn', altBolum: 'gelismis', grup: 'Alanlar', etiket: 'Alanın görünmesi için bekleme',
    aciklama: 'Senaryoda değeri olan alan ekranda bu süre içinde görünmezse görünmüyor sayılır (koşullu alanlar önceki seçimden sonra çizilebilir).',
    tur: 'sayi', varsayilan: 2, enAz: 1, enCok: 60, birim: 'sn', env: 'NOBETCI_GORUNURLUK_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'gorunmeyenAlan', altBolum: 'gelismis', grup: 'Alanlar', etiket: 'Alan görünmezse',
    aciklama: 'Atla: alan doldurulmadan geçilir ve sonuçta "atlanan alanlar"a yazılır. Testi kaldır: test Beklenen / Görülen hatasıyla kalır. "Mutlaka görünmeli" işaretli alan her durumda testi kaldırır.',
    tur: 'secim', varsayilan: 'atla', secenekler: [['atla', 'Atla ve not düş'], ['kaldir', 'Testi kaldır']], env: 'NOBETCI_GORUNMEYEN_ALAN' },
  { anahtar: 'alanSonrasiKosulSn', altBolum: 'gelismis', grup: 'Alanlar', etiket: 'Alan sonrası koşul beklemesi',
    aciklama: 'Alan doldurulduktan sonra beklenen koşul (ör. sorgulanan adın gelmesi) için süre verilmemişse en çok bu kadar beklenir.',
    tur: 'sayi', varsayilan: 20, enAz: 1, enCok: 600, birim: 'sn', env: 'NOBETCI_ALAN_KOSUL_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'arkaPlanIstekSn', altBolum: 'gelismis', grup: 'Alanlar', etiket: 'Alan sonrası arka plan istekleri',
    aciklama: 'Alan doldurulunca başlayan arka plan istekleri (ör. bağımlı listenin yüklenmesi) en çok bu kadar beklenir; bitmeyen istek koşuyu durdurmaz.',
    tur: 'sayi', varsayilan: 8, enAz: 1, enCok: 120, birim: 'sn', env: 'NOBETCI_ARKA_PLAN_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'adimGostergeSn', altBolum: 'gelismis', grup: 'Adımlar', etiket: 'Başarı / hata göstergesi beklemesi',
    aciklama: 'Adımın başarı ya da hata göstergesi (ve aksiyonları) için varsayılan bekleme. Adımda süre verilmişse o kullanılır.',
    tur: 'sayi', varsayilan: 30, enAz: 1, enCok: 600, birim: 'sn', env: 'NOBETCI_ADIM_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'onayPenceresi', altBolum: 'gelismis', grup: 'Adımlar', etiket: 'Tarayıcı onay pencereleri',
    aciklama: 'Sayfanın açtığı onay (confirm) ve soru (prompt) pencerelerine verilecek yanıt. Onayla: prompt varsayılan değeriyle onaylanır. Bilgi pencereleri (alert) her durumda kapatılır; mesajları sonuca yazılır.',
    tur: 'secim', varsayilan: 'iptal', secenekler: [['iptal', 'İptal et'], ['onayla', 'Onayla']], env: 'NOBETCI_ONAY_PENCERESI' },
  { anahtar: 'oturumKontrolSn', altBolum: 'gelismis', grup: 'Giriş', etiket: 'Oturum kontrolü',
    aciklama: 'Kayıtlı oturumun hâlâ geçerli olup olmadığı en çok bu kadar denetlenir; süre dolarsa yeniden giriş yapılır.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_OTURUM_KONTROL_MS', carpan: 1000 },
  { anahtar: 'girisAlanBeklemeSn', altBolum: 'gelismis', grup: 'Giriş', etiket: 'Giriş alanı beklemesi',
    aciklama: 'Giriş sayfasındaki alanların (kullanıcı adı, parola, doğrulama kodu) görünmesi için en çok bekleme. Senaryo alanlarındaki "Alan işlemi" beklemesinden ayrıdır.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_GIRIS_ALAN_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'tabloSatirSecimi', altBolum: 'gelismis', grup: 'Test verisi', etiket: 'Tablodan satır seçimi',
    aciklama: 'Senaryonun seçimleriyle birden çok satır uyduğunda hangisi kullanılsın (ekran ve servis senaryoları). Aynı tablo grubundaki tüm değerler aynı satırdan gelir. Ortamı boş satır her ortamda geçerlidir.',
    tur: 'secim', varsayilan: 'ilk', secenekler: [['ilk', 'İlk uyan satır'], ['rastgele', 'Rastgele']] },
  { anahtar: 'sqlSatirSiniri', altBolum: 'gelismis', grup: 'Test verisi', etiket: 'SQL sorgusunda okunan en çok satır',
    aciklama: 'SQL adımında sorgudan okunan en çok satır (satır sayısı ve tablo eşitliği kontrolleri bunun içinde yapılır; fazlası okunmaz). SQL adımındaki beklenen satır sayısı (ve beklenen tablo satırları) bu sınırı aşamaz: adım kaydedilirken uyarı verilir. Sınırı düşürürseniz, sınırı aşan beklenen sayıya sahip kayıtlı adımlar koşuda sorgu çalıştırılmadan anlaşılır bir hatayla kalır ve yeniden kaydedilirken uyarı verir.',
    tur: 'sayi', varsayilan: 1000, enAz: 1, enCok: 100_000, birim: 'satır', env: 'NOBETCI_SQL_SATIR_SINIRI' },
  { anahtar: 'kosuEkranGenisligi', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Koşu ekran genişliği', aciklama: 'Koşudaki tarayıcı penceresinin genişliği.',
    tur: 'sayi', varsayilan: 1280, enAz: 320, enCok: 3840, birim: 'px', env: 'NOBETCI_EKRAN_GENISLIGI' },
  { anahtar: 'kosuEkranYuksekligi', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Koşu ekran yüksekliği', aciklama: 'Koşudaki tarayıcı penceresinin yüksekliği.',
    tur: 'sayi', varsayilan: 720, enAz: 240, enCok: 2160, birim: 'px', env: 'NOBETCI_EKRAN_YUKSEKLIGI' },
  { anahtar: 'kosuDili', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Koşu tarayıcı dili', aciklama: 'Koşudaki tarayıcının dili. Tarayıcı varsayılanı: dil verilmez.',
    tur: 'secim', varsayilan: 'varsayilan', secenekler: [['varsayilan', 'Tarayıcı varsayılanı'], ...DIL_SECENEKLERI], env: 'NOBETCI_TARAYICI_DILI' },
  { anahtar: 'saatDilimi', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Saat dilimi', aciklama: 'Koşu, tarama ve akış kaydındaki tarayıcının saat dilimi.',
    tur: 'secim', varsayilan: 'bilgisayar', secenekler: SAAT_DILIMI_SECENEKLERI, env: 'NOBETCI_SAAT_DILIMI' },
  // ---- Zamanlanmış koşular (Ayarlar > Koşu > Zamanlanmış koşular kartında; tüm kurallar için) ----
  { anahtar: 'zamanliKacan', bolum: 'zamanlama', grup: 'Zamanlanmış koşu davranışı', etiket: 'Kaçan zaman',
    aciklama: 'Nöbetçi kapalıyken ya da kasa kilitliyken geçen zaman için. Sonra bir kez koş: Nöbetçi açılıp kasa açılınca, kaçan zamanlardan yalnız sonuncusu bir kez koşulur (8 günden eskiler sayılmaz).',
    tur: 'secim', varsayilan: 'atla', secenekler: [['atla', 'Atla'], ['sonraKos', 'Sonra bir kez koş']] },
  { anahtar: 'zamanliCakisma', bolum: 'zamanlama', grup: 'Zamanlanmış koşu davranışı', etiket: 'Koşu sürerken gelen zaman',
    aciklama: 'Vakti geldiğinde başka bir koşu sürüyorsa. Bitince koş: süren koşu bitince bir kez başlatılır (Nöbetçi o arada kapanırsa bekleyen koşu unutulur).',
    tur: 'secim', varsayilan: 'atla', secenekler: [['atla', 'Atla'], ['bitinceKos', 'Bitince koş']] },
  { anahtar: 'benzerlikEsigi', bolum: 'testVerisi', grup: 'Veri sağlığı', etiket: 'Birleştirme önerisi eşiği',
    aciklama: 'Benzerlik puanı bunun altındaki "Birleştirilebilecek tablolar" önerileri varsayılan olarak gizlenir ("Düşük benzerlikleri de göster" ile açılır). "kod, açıklama, ad, değer, id" gibi genel sütun adları puanda düşük ağırlık alır.',
    tur: 'sayi', varsayilan: 50, enAz: 0, enCok: 100, birim: '%' },
  { anahtar: 'senaryoSayfaBoyu', bolum: 'arayuz', grup: 'Listeler', etiket: 'Senaryolar sayfa boyu', aciklama: 'Senaryolar tablosunda bir sayfada gösterilen satır.',
    tur: 'sayi', varsayilan: 50, enAz: 10, enCok: 500, birim: 'satır' },
  { anahtar: 'kosuGecmisiSayfaBoyu', bolum: 'arayuz', grup: 'Listeler', etiket: 'Koşu geçmişi sayfa boyu', aciklama: 'Sonuçlar > Koşu geçmişinde bir sayfada gösterilen koşu.',
    tur: 'sayi', varsayilan: 15, enAz: 5, enCok: 200, birim: 'satır' },
  // Sonuçlar > Genel > Özet'in Dikkat / Bakım / Kapsam ve güvenlik kartları (sonuclar/farkindalik.mjs): eşikler kullanıcının kararıdır.
  { anahtar: 'ozetKirmiziGun', bolum: 'arayuz', grup: 'Sonuçlar özeti', etiket: 'Uzun süredir kırmızı',
    aciklama: 'Ekran, servis ya da akış bu kadar gündür kırmızıysa (son koşularının başarısı sağlık noktasının sarı eşiğinin altında ya da akış kaldı) Sonuçlar > Özet > Dikkat kartında görünür.',
    tur: 'sayi', varsayilan: 3, enAz: 1, enCok: 90, birim: 'gün' },
  { anahtar: 'ozetYavaslamaYuzde', bolum: 'arayuz', grup: 'Sonuçlar özeti', etiket: 'Yavaşlama eşiği',
    aciklama: 'Servis metodunun p95 süresi önceki eşit döneme göre en az bu kadar arttıysa (bu dönemde en az 20 ölçümle) Sonuçlar > Özet > Dikkat kartında görünür.',
    tur: 'sayi', varsayilan: 30, enAz: 5, enCok: 500, birim: '%' },
  { anahtar: 'ozetKosmayanGun', bolum: 'arayuz', grup: 'Sonuçlar özeti', etiket: 'Koşmayan senaryo',
    aciklama: 'Koşuya dahil bir ekran ya da servis senaryosu bu kadar gündür hiç koşmadıysa Sonuçlar > Özet > Bakım kartında görünür.',
    tur: 'sayi', varsayilan: 30, enAz: 1, enCok: 365, birim: 'gün' },
  { anahtar: 'ozetYedekGun', bolum: 'arayuz', grup: 'Sonuçlar özeti', etiket: 'Eski yedek',
    aciklama: 'Son yedek bu kadar günden eskiyse (ya da hiç yedek yoksa) Sonuçlar > Özet > Kapsam ve güvenlik kartında görünür.',
    tur: 'sayi', varsayilan: 7, enAz: 1, enCok: 365, birim: 'gün' },
  { anahtar: 'raporGoruntuSiniriMb', bolum: 'arayuz', grup: 'Raporlar', etiket: 'HTML rapora gömülen görüntü sınırı', aciklama: 'HTML rapora ekran görüntüsü eklenirken toplam boyut bu sınırı aşarsa kalan görüntüler eklenmez (raporda sayısı yazılır).',
    tur: 'sayi', varsayilan: 25, enAz: 1, enCok: 200, birim: 'MB' },
  // Sonuçlar > Raporlar'a kaydedilen PDF raporları (sonuclar/rapor-arsivi.mjs): günlük temizlikte bu süreden eskiler silinir.
  { anahtar: 'raporSaklamaGun', bolum: 'yedekleme', grup: 'Rapor saklama', etiket: 'Rapor saklama süresi',
    aciklama: 'Sonuçlar > Raporlar\'a kaydedilen PDF raporlarından bu süreden eski olanlar günlük temizlikte silinir (şifreli PDF dosyası dahil). Sınırsız: hiç silinmez.',
    tur: 'secim', varsayilan: '90', secenekler: [['30', '30 gün'], ['90', '90 gün'], ['180', '180 gün'], ['0', 'Sınırsız']] },
  { anahtar: 'otomatikYedekSayisi', bolum: 'yedekleme', grup: 'Otomatik yedek', etiket: 'Saklanacak otomatik yedek', aciklama: 'Günlük otomatik yedeklerden en yeni bu kadarı tutulur; eskiler silinir.',
    tur: 'sayi', varsayilan: 30, enAz: 1, enCok: 365, birim: 'adet' },
  { anahtar: 'sonucSaklamaGun', bolum: 'yedekleme', grup: 'Sonuç saklama', etiket: 'Koşu sonuçlarını sakla', aciklama: 'Bu süreden eski ekran ve servis koşu sonuçları (adımlar, ekran görüntüleri, videolar dahil) günlük temizlikte silinir. 0: süresiz (hiç silinmez).',
    tur: 'sayi', varsayilan: 0, enAz: 0, enCok: 3650, birim: 'gün' },
  // Kademeli saklama: sonucun kendisi (durum, süre, hata, adımlar) kalır; yalnız ekran görüntüleri ve videolar silinir. Günlük
  // temizlikte sıra: 1) sonuç saklama (bütün sonuç), 2) medya inceltme, 3) video saklama (Güvenlik), 4) sahipsiz dosyalar.
  { anahtar: 'medyaInceltme', bolum: 'yedekleme', grup: 'Sonuç saklama', etiket: 'Eski sonuçlarda medyayı incelt',
    aciklama: 'Aşağıdaki günden eski sonuçların ekran görüntüleri ve videoları günlük temizlikte silinir; sonucun kendisi (durum, süre, hata metni, adımlar) ve izler kalır. Silinen medya sonuçta "saklama süresi doldu" olarak görünür. Sıra: önce "Koşu sonuçlarını sakla" (bütün sonucu siler), sonra bu inceltme, en son Güvenlik > Video saklama süresi (videolar hangisi önce dolarsa o zaman silinir).',
    tur: 'secim', varsayilan: 'kapali', secenekler: [['kapali', 'Kapalı'], ['basarili', 'Başarılı testlerin görüntü ve videolarını sil'], ['hatali', 'Kalan testlerin görüntü ve videolarını sil'], ['ikisi', 'İkisini de sil']] },
  { anahtar: 'medyaInceltmeGun', bolum: 'yedekleme', grup: 'Sonuç saklama', etiket: 'Medyayı incelt: şu günden eski', aciklama: 'Koşu başlangıcı bu kadar günden eski sonuçlar inceltilir.',
    tur: 'sayi', varsayilan: 30, enAz: 1, enCok: 3650, birim: 'gün',
    etkinKosul: { anahtar: 'medyaInceltme', degerler: ['basarili', 'hatali', 'ikisi'], pasifAciklama: 'Yalnız medya inceltme açıkken kullanılır.' } },
  { anahtar: 'medyaInceltmeKoru', bolum: 'yedekleme', grup: 'Sonuç saklama', etiket: 'Kalan testlerde kalan adımın görüntüsünü ve test sonu görüntüsünü koru',
    aciklama: 'Kalan testlerin medyası silinirken hatanın görüldüğü iki görüntü kalır: kalan adımın görüntüsü (yoksa son adım görüntüsü) ve test sonu görüntüsü. Videolar yine silinir.',
    tur: 'onay', varsayilan: true,
    etkinKosul: { anahtar: 'medyaInceltme', degerler: ['hatali', 'ikisi'], pasifAciklama: 'Yalnız kalan testlerin medyası inceltilirken kullanılır.' } }
]);

/** @typedef {{ video: string; videoBoyutu: string; ekranGoruntusu: string; adimGoruntusu: string; iz: string; indirilenDosya: string; yenidenDeneme: number; kosuSureLimitiDk: number; alanBeklemeSn: number;
 *   zorlaIsaretlemeSn: number; servisZamanAsimiSn: number; servisEszamanli: number; servisIstekBeklemeMs: number; tarihBicimi: string; yetkiHatasinda: string; taramaZamanAsimiDk: number; kayitZamanAsimiDk: number;
 *   senaryoSayfaBoyu: number; kosuGecmisiSayfaBoyu: number; otomatikYedekSayisi: number; sonucSaklamaGun: number; taramaSayfaAcilmaSn: number;
 *   kesifSecenekSiniri: number; taramaEkranGenisligi: number; taramaEkranYuksekligi: number; taramaDili: string; taramaGirisKipi: string; taramaOturumKontrolSn: number;
 *   taramaGirisAlanBeklemeSn: number; gorunmeyenAlanBeklemeSn: number;
 *   gorunmeyenAlan: string; alanSonrasiKosulSn: number; arkaPlanIstekSn: number; adimGostergeSn: number; onayPenceresi: string; oturumKontrolSn: number;
 *   girisAlanBeklemeSn: number; tabloSatirSecimi: string; sqlSatirSiniri: number; kosuEkranGenisligi: number; kosuEkranYuksekligi: number; kosuDili: string;
 *   saatDilimi: string; ekranEszamanli: number; ekranBeklemeMs: number; zamanliKacan: string; zamanliCakisma: string; raporGoruntuSiniriMb: number; raporSaklamaGun: string; benzerlikEsigi: number;
 *   medyaInceltme: string; medyaInceltmeGun: number; medyaInceltmeKoru: boolean; enCokVeriKosusu: number;
 *   ozetKirmiziGun: number; ozetYavaslamaYuzde: number; ozetKosmayanGun: number; ozetYedekGun: number }} KosuAyarlari */

/** @returns {KosuAyarlari} */
export const varsayilanKosuAyarlari = () => /** @type {KosuAyarlari} */ (Object.fromEntries(KOSU_AYAR_TANIMLARI.map((t) => [t.anahtar, t.varsayilan])));

/**
 * Tek değeri doğrular; geçersizse hata (kaydederken) — okurken geçersiz değer varsayılana düşer.
 * @param {(typeof KOSU_AYAR_TANIMLARI)[number]} t @param {unknown} v
 */
function degerDogrula(t, v) {
  if (t.tur === 'onay') {
    if (typeof v !== 'boolean') throw new DepoHatasi(`"${t.etiket}" için açık / kapalı (true / false) verilmelidir.`);
    return v;
  }
  if (t.tur === 'secim') {
    if (!t.secenekler?.some(([d]) => d === v)) throw new DepoHatasi(`"${t.etiket}" için geçersiz seçim.`);
    return String(v);
  }
  if (t.tur === 'sayi') {
    const n = Number(v);
    if (!Number.isInteger(n) || n < /** @type {number} */ (t.enAz) || n > /** @type {number} */ (t.enCok)) {
      throw new DepoHatasi(`"${t.etiket}" ${t.enAz}–${t.enCok}${t.birim ? ` ${t.birim}` : ''} arasında bir tam sayı olmalıdır.`);
    }
    return n;
  }
  const m = typeof v === 'string' ? v.trim() : '';
  if (!m || m.length > 60 || /[{}$\u0000-\u001f]/.test(m) || !/yyyy|MM|dd|HH|mm|ss/.test(m)) throw new DepoHatasi(`"${t.etiket}" geçersiz (ör. yyyy-MM-dd'T'HH:mm:ss).`);
  return m;
}

/** Kayıtlı ayarlar + varsayılanlar (kasa açık olmalı; okunamazsa varsayılanlar). @param {Veritabani} vt @returns {KosuAyarlari} */
export function kosuAyarlariniOku(vt) {
  const sonuc = varsayilanKosuAyarlari();
  let kayit;
  try { kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, KOSU_AYAR_ANAHTARI)); } catch { kayit = undefined; }
  for (const t of KOSU_AYAR_TANIMLARI) {
    if (kayit?.[t.anahtar] === undefined) continue;
    try { /** @type {any} */ (sonuc)[t.anahtar] = degerDogrula(t, kayit[t.anahtar]); } catch { /* varsayılan kalır */ }
  }
  return sonuc;
}

/** Verilen ayarları doğrulayıp kaydeder (verilmeyenler korunur). @param {Veritabani} vt @param {unknown} girdi @returns {KosuAyarlari} */
export function kosuAyarlariniKaydet(vt, girdi) {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Ayarlar bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  const mevcut = /** @type {Record<string, unknown>} */ ((() => { try { return ayarGetir(vt, KOSU_AYAR_ANAHTARI); } catch { return undefined; } })() ?? {});
  /** @type {Record<string, unknown>} */
  const yeni = { ...mevcut };
  for (const t of KOSU_AYAR_TANIMLARI) if (g[t.anahtar] !== undefined) yeni[t.anahtar] = degerDogrula(t, g[t.anahtar]);
  ayarYaz(vt, KOSU_AYAR_ANAHTARI, yeni);
  return kosuAyarlariniOku(vt);
}

/**
 * SQL adımının satır sınırı (Ayarlar > Koşu > Gelişmiş > SQL sorgusunda okunan en çok satır) — beklenen satır sayısı doğrulamasının
 * TEK kaynağı (akış kaydetme / doğrulama ve koşu). Kasa okunamazsa varsayılan. @param {Veritabani} vt @returns {number}
 */
export function sqlSatirSiniriOku(vt) {
  try { return kosuAyarlariniOku(vt).sqlSatirSiniri; } catch { return /** @type {number} */ (KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === 'sqlSatirSiniri')?.varsayilan); }
}

/** Alt sürece verilecek ortam değişkenleri. @param {KosuAyarlari} a @returns {Record<string, string>} */
export function kosuOrtamDegiskenleri(a) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const t of KOSU_AYAR_TANIMLARI) {
    if (!t.env) continue;
    const v = /** @type {any} */ (a)[t.anahtar];
    env[t.env] = String(typeof v === 'number' && t.carpan ? v * t.carpan : v);
  }
  return env;
}

/**
 * Yalnız kullanıcının KAYDETTİĞİ (geçerli) ayarların ortam değişkenleri — veri okuyucu (veri-oku.mjs) bunları koşucuya verir;
 * ortam değişkeni verilmemiş koşularda (terminal / CI) kullanılır. Kaydedilmemiş ayar için değişken üretilmez (koşucunun
 * kendi varsayılanı — ör. CI'da 2 yeniden deneme — geçerli kalır). Kasa kapalıysa / okunamazsa boş.
 * @param {Veritabani} vt @returns {Record<string, string>}
 */
export function kayitliKosuOrtamDegiskenleri(vt) {
  let kayit;
  try { kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, KOSU_AYAR_ANAHTARI)); } catch { return {}; }
  const okunan = kosuAyarlariniOku(vt);
  const tam = kosuOrtamDegiskenleri(okunan);
  /** @type {Record<string, string>} */
  const env = {};
  for (const t of KOSU_AYAR_TANIMLARI) {
    if (!t.env || kayit?.[t.anahtar] === undefined) continue;
    try { degerDogrula(t, kayit[t.anahtar]); } catch { continue; }
    env[t.env] = tam[t.env];
  }
  return env;
}
