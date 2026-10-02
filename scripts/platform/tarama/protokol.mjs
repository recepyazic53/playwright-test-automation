// OTOMATİK TARAMA — sunucu ile tarama alt süreci (Playwright) arasındaki protokolün sabitleri (genel).
//
// Gizli değerler (giriş parolası, TOTP anahtarı, bağlam profili değerleri) DİSKE YAZILMAZ ve alt sürece ortam
// değişkeniyle VERİLMEZ: alt süreç yalnızca işin adresini ve işe özel tek kullanımlık token'ı alır; girdiyi
// sunucudan HTTP ile BİR KEZ çeker (sunucu girdiyi verdikten sonra belleğinden siler), ilerlemeyi ve sonucu aynı
// token'la geri gönderir:
//   GET  <adres>/girdi   → TaramaGirdisi (yalnızca bir kez)
//   POST <adres>/olay    ← TaramaOlayi
//   POST <adres>/sonuc   ← TaramaSonucu (envanter + ekran görüntüleri ya da hata)
//   POST <adres>/oturum  ← başarılı girişin oturumu (YALNIZ "Koşunun saklanan oturumunu kullan" seçiliyken; sunucu şifreli yazar)
// Token başlıkta taşınır (TARAMA_TOKEN_BASLIGI). SMS "elle" kodu mevcut dosya protokolüyle (giris/elle-kod.mjs,
// TEST_SUNUCU_KOD_YOLU) istenir; sunucu isteği iş durumunda gösterir, kullanıcının kodunu yanıt dosyasına yazar.
// NOT: import.meta KULLANILMAZ. Tipler: protokol.d.mts.

/** Alt sürece verilen: işin HTTP adresi (http://127.0.0.1:<port>/platform/tarama/is/<id>). */
export const TARAMA_ADRES_DEGISKENI = 'NOBETCI_TARAMA_ADRESI';
/** Alt sürece verilen: işe özel token (yalnızca bellekte; iş bitince geçersiz). */
export const TARAMA_TOKEN_DEGISKENI = 'NOBETCI_TARAMA_TOKENI';
/** Alt sürecin Playwright çıktı klasörü (geçici). */
export const TARAMA_CIKTI_DEGISKENI = 'NOBETCI_TARAMA_CIKTI';
/** Playwright test süresi (ms; iş zaman aşımından biraz uzun — asıl sınırı sunucu uygular). */
export const TARAMA_TEST_SURESI_DEGISKENI = 'NOBETCI_TARAMA_TEST_SURESI_MS';
/** "1" ise tarayıcı DNS çözümlemez (yalnızca 127.0.0.1/localhost) — yerel fikstürlü testler için. */
export const TARAMA_DNS_KAPALI_DEGISKENI = 'NOBETCI_TARAMA_DNS_KAPALI';
/** Sunucu tarafı: yalnızca bu kökenlere istek (virgülle; testler). Verilirse DNS de kapatılır. */
export const TARAMA_IZINLI_KOKENLER_DEGISKENI = 'NOBETCI_TARAMA_IZINLI_KOKENLER';
/** Sunucu tarafı: işin toplam süre sınırı (sn; varsayılan 300). */
export const TARAMA_ZAMAN_ASIMI_DEGISKENI = 'NOBETCI_TARAMA_ZAMAN_ASIMI_SN';
/** Alt sürecin işe özel token başlığı. */
export const TARAMA_TOKEN_BASLIGI = 'x-nobetci-tarama-tokeni';
/** Varsayılan toplam süre sınırı. */
export const VARSAYILAN_ZAMAN_ASIMI_SN = 300;

// ---- AKIŞ KAYDI ("Akışı kaydet"; aynı iş altyapısı, girdi.kip = 'kayit') ----
// Kullanıcı görünür bir tarayıcıda akışı KENDİSİ yürütür; sayfadaki Nöbetçi paneliyle adımları adlandırıp alır.
// Kayıt aşamasında kullanıcının bastığı düğmeler siteye GERÇEK istek gönderir (yazma engeli yok); yasaklı adres ve
// izinli köken engeli sürer. Alan DEĞERLERİ hiçbir zaman okunmaz/kaydedilmez.
/** Sunucu tarafı: kaydın toplam süre sınırı (sn; varsayılan 1800). */
export const KAYIT_ZAMAN_ASIMI_DEGISKENI = 'NOBETCI_KAYIT_ZAMAN_ASIMI_SN';
/** Varsayılan kayıt süre sınırı (kullanıcı akışı elle yürütür). */
export const VARSAYILAN_KAYIT_ZAMAN_ASIMI_SN = 1800;
/** Alt sürece verilen: "1" ise tarayıcı GÖRÜNÜR açılır (akış kaydı). */
export const TARAMA_GORUNUR_DEGISKENI = 'NOBETCI_TARAMA_GORUNUR';
/** Sunucu tarafı, YALNIZCA testler: "1" ise kayıt tarayıcısı başsız açılır. */
export const KAYIT_BASSIZ_DEGISKENI = 'NOBETCI_KAYIT_BASSIZ';
/** Sunucu tarafı, YALNIZCA testler: kayıt tarayıcısının uzaktan hata ayıklama portu (test paneli sürer). */
export const KAYIT_CDP_PORTU_DEGISKENI = 'NOBETCI_KAYIT_CDP_PORTU';
/** Sayfaya açılan köprü (panel → kayıt motoru). */
export const KAYIT_KOPRUSU = '__nobetciKayit';
/** Sayfadaki panelin kök öğesinin kimliği (taramaya ve ekran görüntülerine girmez). */
export const KAYIT_PANELI_KIMLIGI = 'nobetci-kayit-paneli';
// ---- ÖĞE SEÇME ("Sayfada seç"; aynı iş altyapısı, girdi.kip = 'ogeSecme') ----
// Görünür tarayıcıda kullanıcı "Öğe seç" modunda sayfadaki bir öğeye tıklar: tıklama YAKALANIR ve sayfaya İLETİLMEZ; öğenin türü
// sorulur, seçiciyi Nöbetçi üretir. Seçme aşamasında GET/HEAD dışındaki istekler engellenir (form gönderilmez, kayıt oluşmaz).
/** Sayfaya açılan köprü (öğe seçme paneli → motor). */
export const SECIM_KOPRUSU = '__nobetciSecim';
/** Öğe seçme panelinin kök öğesinin kimliği. */
export const SECIM_PANELI_KIMLIGI = 'nobetci-secim-paneli';
// ---- HIZLI TEST (girdi.kip = 'hizliTest'; ETKİLEŞİMLİ iş — hizli-test/yonetici.mjs sürer) ----
// Alt süreç görünür tarayıcıda sayfayı açar, keşfeder (hiçbir düğmeye basmadan) ve sunucudan KOMUT bekler: GET <adres>/komut
// (uzun yoklama; en çok HIZLI_KOMUT_BEKLEME_MS sonra { komut: null } döner, alt süreç yeniden sorar). Komutun sonucu POST
// <adres>/hizli ile gider (ekran görüntüsü taşıyabilir: HIZLI_OLAY_GOVDE_SINIRI). Düğmeye YALNIZ "bas" komutuyla basılır; sunucu bu
// komutu kullanıcının izni / onayı olmadan göndermez, alt süreç de "Hayır" izninde reddeder (iki katmanlı).
/** Komut uzun yoklamasının en uzun süresi. */
export const HIZLI_KOMUT_BEKLEME_MS = 20_000;
// Hızlı test süre sınırı: TOPLAM süre değil BOŞTA KALMA süresi (kullanıcı etkileşimi ya da tarayıcı işi sayacı sıfırlar) + mutlak üst
// sınır. Varsayılanlar Ayarlar > Koşu > Tarama ve akış kaydı'ndadır (hizliBostaKalmaDk / hizliUstSinirDk); ortam değişkenleri testler içindir.
/** Sunucu tarafı, testler: hızlı testin boşta kalma süresi (sn). */
export const HIZLI_BOSTA_DEGISKENI = 'NOBETCI_HIZLI_BOSTA_SN';
/** Sunucu tarafı, testler: hızlı testin mutlak üst sınırı (sn). */
export const HIZLI_UST_SINIR_DEGISKENI = 'NOBETCI_HIZLI_UST_SINIR_SN';
/** Süre dolmadan bu kadar önce arayüz uyarır ("Süreyi uzat"); boşta kalma süresinin yarısını geçmez. */
export const HIZLI_UYARI_ONCESI_MS = 5 * 60_000;
/** Hızlı test sonuç gövdesi sınırı (anlık + JPEG ekran görüntüsü). */
export const HIZLI_OLAY_GOVDE_SINIRI = 8 * 1024 * 1024;
/** Basıştan sonra bekleme göstergesinin kaybolmasını en çok bekleme (ms). */
export const HIZLI_BASIS_BEKLEME_EN_COK_MS = 60_000;
/** Sayfaya açılan köprü ("Başka düğmeye bas": sayfada tıklayarak seçme). */
export const HIZLI_SECIM_KOPRUSU = '__nobetciHizliSecim';
/** Seçme şeridinin kök öğesinin kimliği (metin / düğme okumalarına girmez: "nobetci" önekli). */
export const HIZLI_SECIM_KIMLIGI = 'nobetci-hizli-secim';
/** Sonuç gövdesi sınırı (envanter + en fazla 12 × 4 MB ekran görüntüsünün base64'ü). */
export const SONUC_GOVDE_SINIRI = 72 * 1024 * 1024;
/** Olay gövdesi sınırı. */
export const OLAY_GOVDE_SINIRI = 64 * 1024;
/**
 * "Koşunun saklanan oturumunu kullan" (Ayarlar > Koşu > Tarama ve akış kaydı): alt süreç başarılı girişten sonra oturumu
 * (storageState) POST <adres>/oturum ile sunucuya verir; sunucu koşunun şifreli oturum dosyasına ATOMİK yazar (alt süreç kasa
 * anahtarını hiç görmez, diske yazmaz). Gövde sınırı.
 */
export const OTURUM_GOVDE_SINIRI = 2 * 1024 * 1024;
/** Taramada giriş kipleri (Ayarlar > Koşu > Tarama ve akış kaydı > Tarama ve akış kaydında giriş). */
export const TARAMA_GIRIS_KIPLERI = Object.freeze(['bastan', 'saklananOturum']);

/**
 * Tarama / akış kaydı tarayıcısının kullanıcı kararları (Ayarlar > Koşu > Tarama ve akış kaydı; saat dilimi Gelişmiş > Tarayıcı).
 * Girdide yoksa (eski sunucu / testler) önceki sabitler: 1366×900, tr-TR, bilgisayarın saat dilimi, 30 sn sayfa açılma, 8 seçenek,
 * girişte 15 sn oturum kontrolü ve 15 sn giriş alanı beklemesi.
 * @param {{ tarayici?: { genislik?: number; yukseklik?: number; dil?: string | null; saatDilimi?: string | null; sayfaAcilmaMs?: number; kesifSecenekSiniri?: number;
 *   alanIslemMs?: number; oturumKontrolMs?: number; girisAlanBeklemeMs?: number; zincirDerinligi?: number; zincirOrnek?: number } }} g
 */
export function taramaTarayiciAyarlari(g) {
  const t = g.tarayici ?? {};
  const tam = (/** @type {unknown} */ v, /** @type {number} */ vars, /** @type {number} */ enAz, /** @type {number} */ enCok) =>
    (Number.isInteger(v) && Number(v) >= enAz && Number(v) <= enCok ? Number(v) : vars);
  const dil = t.dil === undefined ? 'tr-TR' : t.dil;
  return {
    baglam: {
      viewport: { width: tam(t.genislik, 1366, 320, 3840), height: tam(t.yukseklik, 900, 240, 2160) },
      ...(dil ? { locale: dil } : {}),
      ...(t.saatDilimi ? { timezoneId: t.saatDilimi } : {})
    },
    sayfaAcilmaMs: tam(t.sayfaAcilmaMs, 30_000, 5_000, 300_000),
    kesifSecenekSiniri: tam(t.kesifSecenekSiniri, 8, 2, 50),
    // Bağlı liste keşfi (zincir-motoru.ts; Ayarlar > Koşu > Tarama ve akış kaydı): en çok kat ve her katta denenecek değer.
    zincirDerinligi: tam(t.zincirDerinligi, 8, 1, 10),
    zincirOrnek: tam(t.zincirOrnek, 3, 1, 10),
    // Hızlı testte alan doldurma / seçme beklemesi (Ayarlar > Koşu > Tarama ve akış kaydı; varsayılan 30 sn).
    alanIslemMs: tam(t.alanIslemMs, 30_000, 3_000, 300_000),
    // Girişte (Ayarlar > Koşu > Tarama ve akış kaydı; koşudaki giriş ayarlarından ayrı): giriş motoruna verilir.
    oturumKontrolMs: tam(t.oturumKontrolMs, 15_000, 1_000, 300_000),
    girisAlanBeklemeMs: tam(t.girisAlanBeklemeMs, 15_000, 1_000, 300_000)
  };
}
