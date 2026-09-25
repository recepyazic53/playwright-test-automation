// OTOMATİK TARAMA — sunucu ile tarama alt süreci (Playwright) arasındaki protokolün sabitleri (genel).
//
// Gizli değerler (giriş parolası, TOTP anahtarı, bağlam profili değerleri) DİSKE YAZILMAZ ve alt sürece ortam
// değişkeniyle VERİLMEZ: alt süreç yalnızca işin adresini ve işe özel tek kullanımlık token'ı alır; girdiyi
// sunucudan HTTP ile BİR KEZ çeker (sunucu girdiyi verdikten sonra belleğinden siler), ilerlemeyi ve sonucu aynı
// token'la geri gönderir:
//   GET  <adres>/girdi   → TaramaGirdisi (yalnızca bir kez)
//   POST <adres>/olay    ← TaramaOlayi
//   POST <adres>/sonuc   ← TaramaSonucu (envanter + ekran görüntüleri ya da hata)
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
/** Sonuç gövdesi sınırı (envanter + en fazla 12 × 4 MB ekran görüntüsünün base64'ü). */
export const SONUC_GOVDE_SINIRI = 72 * 1024 * 1024;
/** Olay gövdesi sınırı. */
export const OLAY_GOVDE_SINIRI = 64 * 1024;
