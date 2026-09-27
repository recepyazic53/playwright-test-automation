// KOŞU, SAKLAMA VE ARAYÜZ AYARLARI (Ayarlar > Koşu, Yedekleme, Arayüz) — kullanıcının verdiği kararlar. Kasada (ayarlar tablosu,
// anahtar "kosu") şifreli saklanır; verilmeyen ayar varsayılanını kullanır. Nöbetçi koşuyu başlatırken ayarları alt sürece
// ortam değişkeni olarak verir (kosuOrtamDegiskenleri); playwright.config.ts ve model koşucusu
// bu değişkenleri okur (yoksa aynı varsayılanlar). Servis ayarları (zaman aşımı, varsayılan tarih biçimi) sunucuda kullanılır.
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';

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
 * @type {ReadonlyArray<{ anahtar: string; bolum?: 'kosu' | 'yedekleme' | 'arayuz' | 'zamanlama'; altBolum?: 'gelismis'; grup: string; etiket: string; aciklama: string; tur: 'secim' | 'sayi' | 'metin';
 *   varsayilan: string | number; secenekler?: ReadonlyArray<[string, string]>; enAz?: number; enCok?: number; birim?: string; env?: string; carpan?: number }>}
 */
export const KOSU_AYAR_TANIMLARI = Object.freeze([
  { anahtar: 'video', grup: 'Kayıt', etiket: 'Video', aciklama: 'Nöbetçi\'den başlatılan koşularda video kaydı.', tur: 'secim', varsayilan: 'her',
    secenekler: [['her', 'Her koşuda'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_VIDEO' },
  { anahtar: 'ekranGoruntusu', grup: 'Kayıt', etiket: 'Ekran görüntüsü (test sonu)', aciklama: 'Testin sonunda alınan ekran görüntüsü. Adım görüntüleri bundan bağımsızdır.',
    tur: 'secim', varsayilan: 'yalnizHata', secenekler: [['her', 'Her testte'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_EKRAN_GORUNTUSU' },
  { anahtar: 'iz', grup: 'Kayıt', etiket: 'İz (trace)', aciklama: 'Hata incelemesi için Playwright izi (ağ, DOM, adımlar).', tur: 'secim', varsayilan: 'yalnizHata',
    secenekler: [['her', 'Her testte'], ['yalnizHata', 'Yalnız kalan testlerde'], ['kapali', 'Kapalı']], env: 'NOBETCI_IZ' },
  { anahtar: 'yenidenDeneme', grup: 'Koşu', etiket: 'Yeniden deneme', aciklama: 'Kalan test kaç kez yeniden denensin (0: denenmez).', tur: 'sayi', varsayilan: 0, enAz: 0, enCok: 3, env: 'NOBETCI_YENIDEN_DENEME' },
  { anahtar: 'kosuSureLimitiDk', grup: 'Koşu', etiket: 'Koşu süre limiti', aciklama: 'Tek bir koşu bu süreyi aşarsa durdurulur. Testin kendi süre sınırı da buna göre ayarlanır (limitten 30 sn önce dolar; hata kaydı ve görüntüler alınabilsin diye).',
    tur: 'sayi', varsayilan: 10, enAz: 1, enCok: 120, birim: 'dk', env: 'NOBETCI_KOSU_SURE_LIMITI_MS', carpan: 60_000 },
  { anahtar: 'alanBeklemeSn', grup: 'Bekleme süreleri', etiket: 'Alan işlemi', aciklama: 'Alan doldurulduktan sonraki tıklama / sorgu (ör. kimlik sorgula) en çok bu kadar beklenir.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_ALAN_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'zorlaIsaretlemeSn', grup: 'Bekleme süreleri', etiket: 'Zorla işaretlenecek seçenek', aciklama: 'Gizli radyo / onay kutusunun sayfada belirmesi için en çok bekleme.',
    tur: 'sayi', varsayilan: 15, enAz: 1, enCok: 300, birim: 'sn', env: 'NOBETCI_ZORLA_BEKLEME_MS', carpan: 1000 },
  { anahtar: 'servisZamanAsimiSn', grup: 'Servisler', etiket: 'Servis isteği zaman aşımı', aciklama: 'Servis yanıtı bu sürede gelmezse istek kesilir.', tur: 'sayi', varsayilan: 60, enAz: 5, enCok: 600, birim: 'sn' },
  { anahtar: 'tarihBicimi', grup: 'Servisler', etiket: 'Varsayılan tarih biçimi', aciklama: 'Biçim verilmemiş tarih kurallarında ve ${tarih:…} ifadelerinde kullanılır. yyyy yıl, MM ay, dd gün, HH saat, mm dakika, ss saniye; sabitler tek tırnakta.',
    tur: 'metin', varsayilan: "yyyy-MM-dd'T'HH:mm:ss" },
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
    aciklama: 'SQL adımında sorgudan okunan en çok satır (satır sayısı ve tablo eşitliği kontrolleri bunun içinde yapılır; fazlası okunmaz).',
    tur: 'sayi', varsayilan: 1000, enAz: 1, enCok: 100_000, birim: 'satır', env: 'NOBETCI_SQL_SATIR_SINIRI' },
  { anahtar: 'kosuEkranGenisligi', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Koşu ekran genişliği', aciklama: 'Koşudaki tarayıcı penceresinin genişliği.',
    tur: 'sayi', varsayilan: 1280, enAz: 320, enCok: 3840, birim: 'px', env: 'NOBETCI_EKRAN_GENISLIGI' },
  { anahtar: 'kosuEkranYuksekligi', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Koşu ekran yüksekliği', aciklama: 'Koşudaki tarayıcı penceresinin yüksekliği.',
    tur: 'sayi', varsayilan: 720, enAz: 240, enCok: 2160, birim: 'px', env: 'NOBETCI_EKRAN_YUKSEKLIGI' },
  { anahtar: 'kosuDili', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Koşu tarayıcı dili', aciklama: 'Koşudaki tarayıcının dili. Tarayıcı varsayılanı: dil verilmez.',
    tur: 'secim', varsayilan: 'varsayilan', secenekler: [['varsayilan', 'Tarayıcı varsayılanı'], ...DIL_SECENEKLERI], env: 'NOBETCI_TARAYICI_DILI' },
  { anahtar: 'saatDilimi', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Saat dilimi', aciklama: 'Koşu, tarama ve akış kaydındaki tarayıcının saat dilimi.',
    tur: 'secim', varsayilan: 'bilgisayar', secenekler: SAAT_DILIMI_SECENEKLERI, env: 'NOBETCI_SAAT_DILIMI' },
  { anahtar: 'eszamanliKosu', altBolum: 'gelismis', grup: 'Tarayıcı', etiket: 'Eşzamanlı senaryo',
    aciklama: 'Senaryolar her zaman sırayla koşar: aynı ortamın giriş oturumu tek dosyada paylaşılır ve aynı kullanıcıyla eşzamanlı girişler birbirinin oturumunu düşürebilir; bu yüzden birden çok eşzamanlı senaryo sunulmaz.',
    tur: 'secim', varsayilan: 'sirayla', secenekler: [['sirayla', 'Senaryolar sırayla (1)']] },
  // ---- Zamanlanmış koşular (Ayarlar > Koşu > Zamanlanmış koşular kartında; tüm kurallar için) ----
  { anahtar: 'zamanliKacan', bolum: 'zamanlama', grup: 'Zamanlanmış koşu davranışı', etiket: 'Kaçan zaman',
    aciklama: 'Nöbetçi kapalıyken ya da kasa kilitliyken geçen zaman için. Sonra bir kez koş: Nöbetçi açılıp kasa açılınca, kaçan zamanlardan yalnız sonuncusu bir kez koşulur (8 günden eskiler sayılmaz).',
    tur: 'secim', varsayilan: 'atla', secenekler: [['atla', 'Atla'], ['sonraKos', 'Sonra bir kez koş']] },
  { anahtar: 'zamanliCakisma', bolum: 'zamanlama', grup: 'Zamanlanmış koşu davranışı', etiket: 'Koşu sürerken gelen zaman',
    aciklama: 'Vakti geldiğinde başka bir koşu sürüyorsa. Bitince koş: süren koşu bitince bir kez başlatılır (Nöbetçi o arada kapanırsa bekleyen koşu unutulur).',
    tur: 'secim', varsayilan: 'atla', secenekler: [['atla', 'Atla'], ['bitinceKos', 'Bitince koş']] },
  { anahtar: 'senaryoSayfaBoyu', bolum: 'arayuz', grup: 'Listeler', etiket: 'Senaryolar sayfa boyu', aciklama: 'Senaryolar tablosunda bir sayfada gösterilen satır.',
    tur: 'sayi', varsayilan: 50, enAz: 10, enCok: 500, birim: 'satır' },
  { anahtar: 'kosuGecmisiSayfaBoyu', bolum: 'arayuz', grup: 'Listeler', etiket: 'Koşu geçmişi sayfa boyu', aciklama: 'Sonuçlar > Koşu geçmişinde bir sayfada gösterilen koşu.',
    tur: 'sayi', varsayilan: 15, enAz: 5, enCok: 200, birim: 'satır' },
  { anahtar: 'raporGoruntuSiniriMb', bolum: 'arayuz', grup: 'Raporlar', etiket: 'HTML rapora gömülen görüntü sınırı', aciklama: 'HTML rapora ekran görüntüsü eklenirken toplam boyut bu sınırı aşarsa kalan görüntüler eklenmez (raporda sayısı yazılır).',
    tur: 'sayi', varsayilan: 25, enAz: 1, enCok: 200, birim: 'MB' },
  { anahtar: 'otomatikYedekSayisi', bolum: 'yedekleme', grup: 'Otomatik yedek', etiket: 'Saklanacak otomatik yedek', aciklama: 'Günlük otomatik yedeklerden en yeni bu kadarı tutulur; eskiler silinir.',
    tur: 'sayi', varsayilan: 30, enAz: 1, enCok: 365, birim: 'adet' },
  { anahtar: 'sonucSaklamaGun', bolum: 'yedekleme', grup: 'Sonuç saklama', etiket: 'Koşu sonuçlarını sakla', aciklama: 'Bu süreden eski ekran ve servis koşu sonuçları (adımlar, ekran görüntüleri, videolar dahil) günlük temizlikte silinir. 0: süresiz (hiç silinmez).',
    tur: 'sayi', varsayilan: 0, enAz: 0, enCok: 3650, birim: 'gün' }
]);

/** @typedef {{ video: string; ekranGoruntusu: string; iz: string; yenidenDeneme: number; kosuSureLimitiDk: number; alanBeklemeSn: number;
 *   zorlaIsaretlemeSn: number; servisZamanAsimiSn: number; tarihBicimi: string; taramaZamanAsimiDk: number; kayitZamanAsimiDk: number;
 *   senaryoSayfaBoyu: number; kosuGecmisiSayfaBoyu: number; otomatikYedekSayisi: number; sonucSaklamaGun: number; taramaSayfaAcilmaSn: number;
 *   kesifSecenekSiniri: number; taramaEkranGenisligi: number; taramaEkranYuksekligi: number; taramaDili: string; gorunmeyenAlanBeklemeSn: number;
 *   gorunmeyenAlan: string; alanSonrasiKosulSn: number; arkaPlanIstekSn: number; adimGostergeSn: number; onayPenceresi: string; oturumKontrolSn: number;
 *   girisAlanBeklemeSn: number; tabloSatirSecimi: string; sqlSatirSiniri: number; kosuEkranGenisligi: number; kosuEkranYuksekligi: number; kosuDili: string;
 *   saatDilimi: string; eszamanliKosu: string; zamanliKacan: string; zamanliCakisma: string; raporGoruntuSiniriMb: number }} KosuAyarlari */

/** @returns {KosuAyarlari} */
export const varsayilanKosuAyarlari = () => /** @type {KosuAyarlari} */ (Object.fromEntries(KOSU_AYAR_TANIMLARI.map((t) => [t.anahtar, t.varsayilan])));

/**
 * Tek değeri doğrular; geçersizse hata (kaydederken) — okurken geçersiz değer varsayılana düşer.
 * @param {(typeof KOSU_AYAR_TANIMLARI)[number]} t @param {unknown} v
 */
function degerDogrula(t, v) {
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
