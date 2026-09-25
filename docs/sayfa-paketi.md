# Sayfa paketi (sürüm 1)

Nöbetçi'de yeni bir ekranın keşfi ve mevcut bir ekranın tekrar analizi **sayfa paketi** ile yapılır:

1. Kullanıcı sayfanın bağlantısını bir Claude Code sohbetine verir.
2. Claude sayfayı **yalnızca okuyarak** inceler (form göndermez, kayıt oluşturmaz, "kaydet/öde/onayla"
   türü düğmelere basmaz) ve bu belgedeki biçimde bir JSON dosyası üretir.
3. Kullanıcı dosyayı Nöbetçi > **Ekranlar > Sayfa ekle** (yeni ekran) ya da ekranın **Paket yükle**
   düğmesiyle (tekrar analiz) yükler. Önizleyip kabul edene kadar hiçbir şey kaydedilmez.

Claude API kullanılmaz. Nöbetçi'nin "Claude ile yorumla" / "Tekrar analiz et" düğmeleri, Claude Code'a
verilecek **gizli değer içermeyen** bir analiz/istek dosyası yazar (`veri/analiz/<ekran>-<tarih>.json`).

Makine tarafından okunabilir zarf şeması: [`sayfa-paketi.schema.json`](sayfa-paketi.schema.json).
Doğrulayıcı: `scripts/platform/ekranlar/sayfa-paketi.mjs` (sunucu ve birim testleri aynı kuralları kullanır).
Model kuralları: `scripts/dogrulama/ekran-modeli-dogrulayici.mjs` (testlerin model yükleyicisiyle ORTAK).

## Üst düzey

```json
{
  "tur": "sayfa-paketi",
  "surum": 1,
  "meta": { ... },
  "model": { ... },
  "senaryoOnerileri": [ ... ],
  "gerekenAyarlar": { ... },
  "bilinmeyenler": [ ... ],
  "kanitlar": [ ... ]
}
```

Bilinmeyen anahtar hatadır. `kanitlar` isteğe bağlıdır; diğerleri zorunludur (öneri ya da bilinmeyen
yoksa boş dizi yazılır — "bilinmeyen yok" açıkça söylenmiş olur).

## meta

| Alan | Tip | Açıklama |
|---|---|---|
| `proje` | metin (isteğe bağlı) | Bilgi amaçlı proje adı. |
| `ekran.anahtar` | metin | Kalıcı ekran anahtarı: küçük harf, rakam, `-` (ör. `odeme-formu`). `model.id` ile **aynı** olmalı. |
| `ekran.ad` | metin | Görünen ad (en fazla 120 karakter). |
| `ekran.urlYolu` | metin | `/` ile başlayan **yol** (ör. `/satis/odeme/`). Tam adres yazılmaz; ortam adresi Ayarlar > Ortamlar'dan gelir. |
| `olusturan` | metin | Paketi üreten (ör. `Claude Code`). |
| `olusturulma` | ISO-8601 | Üretim zamanı. |
| `baglamProfilleri` | metin dizisi | İncelemede kullanılan bağlam profillerinin **adları** (rol/şube/müşteri tipi…). Değer yazılmaz. |
| `not` | metin (isteğe bağlı) | İnceleme notu. |

## model

`semaSurumu`: `1` ya da `2` (sürüm 1 modeller aynen geçerlidir). Sürüm 2, model koşucusunun ihtiyaç duyduğu
**adım koşu tanımını** ekler (aşağıda). Platformdaki ekran modelleriyle **aynı şema** (`tests/support/ekran-modeli.ts > EkranModeli`): adımlar →
bölümler → alanlar (tip, etiket, seçenekler, zorunluluk, görünürlük koşulu, senaryo eşleşmesi…),
adlandırılmış koşullar, senaryo düzeyi ayarlar (başlık, adım kapsamı, beklenen sonuç), iş kuralları,
bilinmeyenler. Model kendi kendine yetmeli; alt model başvurusu (`altModel`) yalnızca projede zaten
var olan alt modellere yapılabilir.

Paket, modele isteğe bağlı bir **gözlem** ekler:

```json
"baglamGorunurlugu": {
  "profiller": ["varsayilan", "Yetkili"],
  "alanlar": {
    "indirimOrani": { "varsayilan": false, "Yetkili": true },
    "kampanyaKodu": { "varsayilan": true, "Yetkili": null }
  },
  "kaynak": "iki profille yalnızca okuma"
}
```

`true` = o profille alan ekranda görüldü, `false` = görülmedi, `null` = bilinmiyor. Bu bilgi amaçlıdır:
koşuda alan **görünüyorsa doldurulur, görünmüyorsa atlanır**; senaryoda "mutlaka görünmeli" işaretli
alan görünmezse test başarısız olur; atlanan alanlar sonuçlarda listelenir. Bağlam ↔ alan eşlemesi elle
tutulmaz.

### Adım koşu tanımı (semaSurumu 2)

Her adıma isteğe bağlı `kosu` nesnesi yazılabilir; model koşucusu adımın alanlarını doldurduktan sonra
aksiyonları sırayla uygular, sonra başarı göstergesini bekler:

```json
"kosu": {
  "aksiyonlar": [ { "tur": "tikla", "secici": "#hesapla", "aciklama": "Hesapla" },
                  { "tur": "bekle", "secici": "#yukleniyor", "durum": "gizli" } ],
  "basariGostergesi": { "tur": "metin", "deger": "Prim:", "secici": "#sonuc" },
  "hataGostergesi": { "secici": "#uyari" },
  "zamanAsimiSn": 30
}
```

| Alan | Açıklama |
|---|---|
| `aksiyonlar[]` | `tur`: `tikla` (düğme/bağlantı) ya da `bekle` (`durum`: `gorunur` varsayılan \| `gizli`); `secici` zorunlu; `metin` (birden çok öğe eşleşirse bu metni içeren), `aciklama`, `zamanAsimiSn` isteğe bağlı. **Kaydet/öde/onayla** gibi kalıcı işlem yapan düğmeler yalnızca test ortamında koşulacak adımlara yazılır. |
| `basariGostergesi` | `tur`: `metin` (sayfada ya da `secici` öğesinde toleranslı içerir), `eleman` (`deger` seçicisi görünür), `url` (`deger` düzenli ifadesi). |
| `hataGostergesi` | İş kuralı uyarısının göründüğü öğe (`secici`). Beklenen iş kuralı hatası buradan okunur; beklenmeyen bir uyarı çıkarsa test "Beklenen/Görülen" hatasıyla düşer. |
| `zamanAsimiSn` | Göstergeleri bekleme süresi (1–600, varsayılan 30). |

Sürüm 2'de `okluSecim` doldurucusu (ok düğmeleriyle değer değiştiren özel bileşen) değeri gösteren öğeyi
(`konum.secici`) ve düğmeleri (`konum.yardimci.ileri` ve `konum.yardimci.geri`; eski adlarla `arttir`/`azalt`)
bildirmek zorundadır; `doldurucuParametreleri.maksDeneme` yön başına en fazla tıklamadır.

Tekrar analizde koşu tanımı değişikliği **"Adım koşu tanımı"** bulgusu olur; sürüm 1 bir model bu bulgu kabul
edilince sürüm 2'ye yükselir.

## Model koşucusu

Test kodu **olmayan** senaryolar (sayfa paketinden eklenmiş, kodlu bir teste eşlenmemiş ve kaynaktaki spec dosyası
diskte olmayan) `tests/model-kosucu/model-senaryolari.spec.ts` tarafından üretilen testlerle koşar; kodlu (Galaksi)
testler burada üretilmez. Her test `@model-<senaryo kimliği>` etiketini taşır; Nöbetçi tek senaryo koşusunu bu
etiketle daraltır, "Koşuyu başlat" Koşuda açık model senaryolarını da dahil eder.

Koşu: giriş tarifiyle giriş → senaryonun bağlam profiliyle (modelde `eslesme.profilHavuzu` olan alan; havuz adı
giriş tarifinin bağlam türüdür) bağlam değiştirme → `ekranUrl` → modelin adımları sırayla. Senaryoda değeri olan her
alan ekranda **görünüyorsa** tipine göre doldurulur (`secim`: değer ya da görünen metin; `okluSecim`; `metin`/`sayi`;
`tarih` (`tarihJs` doldurucusuyla betikle); `onayKutusu`; `radyo` (seçeneğin `secici`'si ya da `value`); `dosya`:
senaryo formunda **Dosya yükle** ile yüklenen ŞİFRELİ senaryo dosyası — veride `nobetci-dosya://<kimlik>/<ad>`
referansı durur, koşuda yalnızca o koşuya özel, yalnızca kullanıcının okuyabildiği geçici bir klasöre çözülür ve koşu
bitince silinir; eski biçimde izinli klasördeki bir dosyanın ADI da kabul edilir — `NOBETCI_YUKLEME_KLASORU` ya da
`veri/yuklenecek-dosyalar/`),
görünmüyorsa atlanır ve sonuçta **atlanan alanlar**a yazılır; "mutlaka görünmeli" alan görünmezse test düşer.
İsteğe bağlı adımlar senaryonun adım kapsamına göre koşulur; koşu beklenen hata adımında ya da kapsamdaki son adımda
durur. Her adım bir `test.step` ve bir ekran görüntüsüdür.

**Yasaklı adres koruması:** Ayarlar > Güvenlik > **Yasak adresler** (host kalıpları, `*` joker; varsayılan boş) ve
ek kaynak olarak `NOBETCI_YASAK_ADRESLER` ortam değişkeni (virgülle ayrılmış; ikisi birleşir) doluysa, ortamın adresi
(ya da giriş tarifindeki tam bir adres) bir kalıba uyan koşu sunucuda,
`global-setup`'ta ve model koşucusunda **tarayıcı hiçbir yere gitmeden** reddedilir; koşu sırasında yasaklı host'a
giden her istek iptal edilir ve test başarısız sayılır.

## Otomatik tarama

Sayfa paketinin ikinci kaynağı Nöbetçi'nin kendisidir: **Ekranlar > Sayfa ekle** (yükleme alanının altındaki
"Ya da: Ekranı otomatik tara") ve ekran sayfasındaki **Ekranı tara** düğmesi. Akış:

1. **Seçim (her seferinde onaylanır):** ortam, bağlam profilleri (tekrar analiz diyaloğuyla aynı seçim; ekran için son
   seçim işaretli gelir), taranacak sayfa (ortam adresine göre yol; tam adres yalnızca ortamla aynı kökende), seçim
   keşfi (varsayılan açık) ve yeni ekranın adı/anahtarı. Diyalog açıkça uyarır: *"Bu işlem seçilen ortama bağlanır;
   hiçbir şey kaydedilmez/gönderilmez"* — kullanıcı onay kutusunu işaretlemeden başlatılamaz. Kasa açık olmalıdır.
2. **İş:** sunucu ayrı bir süreç grubunda başsız bir Playwright işi başlatır (`scripts/platform/tarama/tarama.config.ts`
   + `tarama.spec.ts`; iptal edilebilir, varsayılan süre sınırı 5 dk — `NOBETCI_TARAMA_ZAMAN_ASIMI_SN`). Aynı anda tek
   tarama çalışır. Parola, TOTP anahtarı ve bağlam profili değerleri **diske yazılmaz**, ortam değişkeniyle verilmez:
   iş girdisini sunucudan işe özel tek kullanımlık token'la bir kez HTTP ile alır, ilerlemeyi ve sonucu aynı token'la
   geri gönderir. SMS "elle" kodu iş ekranında istenir.
3. **Tarama:** giriş tarifiyle giriş (CAPTCHA, hatalı kimlik, zaman aşımı açık hata verir) → her bağlam profili için
   tarifin bağlam adımları → hedef sayfa → görünür alanların envanteri (etiket, tür, name/id, seçici önerisi,
   zorunluluk, seçenekler, radyo/onay kutusu grupları, dosya `accept`, tarih, devre dışı/salt okunur, fieldset/legend ve
   başlıklara göre bölümler) → profil başına ekran görüntüsü → isteğe bağlı **seçim keşfi**: en fazla 8 seçenekli her
   açılır listede seçenekler tek tek seçilir, beliren/kaybolan alanlar kaydedilir, ilk değer geri yüklenir; seçim sayfayı
   başka adrese götürürse bilinmeyenlere yazılır ve hedefe dönülür.
4. **Güvenlik:** düğmelere/bağlantılara tıklanmaz, form gönderilmez, alanlara yazılmaz, Enter'a basılmaz. Tarama
   aşamasında GET/HEAD dışındaki **her istek** (form gönderimi, otomatik kaydetme XHR'ı, `sendBeacon`, WebSocket)
   ağ katmanında iptal edilir ve raporlanır; sayfada ayrıca `submit`/`requestSubmit` etkisizleştirilir. Yalnızca giriş
   ve bağlam değiştirme adımları (tarif güdümlü) istek gönderebilir. **Yasak adresler** (Ayarlar > Güvenlik +
   `NOBETCI_YASAK_ADRESLER`): ortam adresi, hedef ya da tarifteki bir adres kalıba uyuyorsa tarama **tarayıcı
   açılmadan** reddedilir; tarama sırasında yasaklı host'a giden her istek iptal edilir.
5. **Sonuç:** sayfa paketi (sürüm 1, model `semaSurumu: 1`), yüklenen paketle **aynı** önizleme → kabul (yeni ekran)
   ya da bulgular (mevcut ekran) akışına girer. İşler ~1 saat sonra sunucu belleğinden silinir; ekran görüntüleri
   kabul edilene kadar yalnızca bellekte durur.

Üretilen paket:

* `meta.olusturan`: `"Nöbetçi otomatik tarama"`, `meta.baglamProfilleri`: taranan profil adları.
* Model taslağı: tek adım, bölümler, alanlar — tip eşlemesi `select→secim`, `text/email/textarea→metin`,
  `number→sayi`, `date→tarih`, `tel→telefon`, `checkbox→onayKutusu`, radyo grubu → `radyo` (seçeneğin `secici`'si ile),
  `file→dosya` (tek uzantılı `accept` → `kabul`); `etiket.ekran`, `secenekler` (değer + metin; boş değerli "Seçiniz"
  yazılmaz, `seceneklerDurumu: "tam"`), `zorunlu`, `konum { secici, kirilganlik }` (`#id` → `[name=…]` →
  `role=…[name=…]` → CSS yolu), `yapilandirma: "senaryo"` + `eslesme.senaryo` (devre dışı/salt okunur alanlar
  `"dokunulmuyor"`), keşifte bulunan bağımlı alanlar için adlandırılmış koşul (`<alan>Gorunur`) + `gorunurluk`,
  `baglamGorunurlugu` (`kaynak: "otomatik tarama"`).
* **Mevcut ekranda** (tekrar analiz) güncel model TABAN alınır: alanlar seçiciyle eşleşir (kimlik/senaryo anahtarı
  korunur), etiket/zorunluluk/seçenek güncellenir, yeni alanlar en yakın eşleşen alanın bölümüne eklenir; taramada
  görülmeyen alanlar **kaldırılmaz** (başka adımda/koşulda olabilir) ve bilinmeyenlere yazılır.
* `senaryoOnerileri: []`, `gerekenAyarlar` (giriş, iki aşamalı tür, bağlam türü), `bilinmeyenler` (her zaman
  *"Adım/aksiyon tanımları (düğmeler, başarı göstergeleri) otomatik çıkarılamadı — Claude ile tamamlayın."* + gezinmeler,
  engellenen yazma istekleri, keşfedilmeyen uzun listeler, etiketsiz alanlar, özel bileşenler/çerçeveler…),
  `kanitlar` (profil başına görünür alan ekran görüntüsü).
* Alan **değerleri** pakete hiç yazılmaz; sayfadan gelen metinlerde gizli veri kalıbı varsa metin atılır.

Uçlar ve protokol: `scripts/platform/tarama/yonetici.mjs` (`/platform/tarama/*`) ve `protokol.mjs`.

## senaryoOnerileri

```json
{
  "baslik": "Yetkili / indirimli / tek çekim",
  "veri": { "urun": "A", "indirimOrani": "10", "odemeAdimiDahil": true, "baglamProfili": "Yetkili" },
  "adimKapsami": ["odeme"],
  "beklenenSonuc": { "tur": "basari", "aciklama": "Ödeme adımı tamamlanır." },
  "gerekce": "İndirim alanının göründüğü profille ana akış."
}
```

* `veri`: modelin senaryo biçimi (alanların `eslesme.senaryo` anahtarları). Kişi, kart, adres gibi
  veriler için **test verisi profil adı** kullanılır (ör. `"sigortaliProfili": "ozel1"`), değer yazılmaz.
* `adimKapsami`: dahil edilen isteğe bağlı adımların kimlikleri (modelin adım kapsamı ayarlarına çevrilir).
* `beklenenSonuc.tur`: `basari` | `hata` (iş kuralı hatası beklenir — ayrıntısı `veri`deki beklenen sonuç alanında).
* Öneriler tek senaryo doğrulayıcısından geçirilir; modele uymayan öneri önizlemede sorunlarıyla
  gösterilir ve seçilemez. Kabul edilen öneriler **Koşuda kapalı** eklenir: test kodu gerekmez, **model
  koşucusuyla** çalışırlar (Senaryolar'da "model" rozeti; bkz. [Model koşucusu](#model-koşucusu)). Koşuya
  almak kullanıcının kararıdır (Koşuda anahtarı).

## gerekenAyarlar

| Alan | Değerler |
|---|---|
| `girisGerekli` | `true` / `false` |
| `ikiAsamaliDogrulama` | `yok` \| `totp` \| `sms` \| `bilinmiyor` |
| `captchaGoruldu` | `true` / `false` (otomasyon CAPTCHA geçmez) |
| `testVerisiTurleri` | gereken test verisi türlerinin **adları** |
| `baglamTurleri` | (isteğe bağlı) gereken bağlam türleri |
| `not` | (isteğe bağlı) |

Önizleme her maddeyi projenin ayarlarıyla karşılaştırır (hazır / eksik / kontrol edin) ve ilgili
Ayarlar bölümüne bağlantı verir.

## bilinmeyenler

İncelemede netleşmeyen her nokta açıkça yazılır (ör. "Seçenek listesinin tamamı görülemedi").
Önizlemede ve ekranın model görünümünde vurgulanır.

## kanitlar (isteğe bağlı)

En fazla 12 PNG ekran görüntüsü: `{ "ad", "aciklama"?, "icerikTuru": "image/png", "veri": "<base64>" }`,
her biri en fazla 4 MB. Kabul edilince medya deposunda **şifreli** saklanır. Paket (kanıtlar dahil) en
fazla 16 MB olabilir. Görüntülerde gerçek kişi/kart verisi bulunmamalıdır.

## Gizli değer yasağı

Paket gizli ya da kişisel veri **içeremez**. Doğrulayıcı şunları bulursa paketi açık bir hatayla reddeder:

* adı parola/şifre/secret/token/OTP/PIN/CVV/API anahtarı… olan bir alanda değer (ör. `"parola": "…"`),
* Luhn kontrolünden geçen kart numarası, resmi algoritmaya uyan T.C. kimlik numarası, IBAN,
* JWT / `Bearer` yetkilendirme değeri, özel anahtar, adreste `kullanıcı:parola@`,
* modelde parola ya da hassas alanın dolu varsayılan değeri,
* `meta.ekran.urlYolu` ya da `model.ekranUrl` alanında tam adres (yalnızca yol yazılır).

## Tekrar analiz

Aynı ekran için yeni paket yüklenince güncel modelle karşılaştırılır ve her fark bir **bulgu** olur:
yeni/kaldırılan alan, yeni/kaldırılan seçenek, etiket, zorunluluk, tip, görünürlük (koşul ya da bağlam
profiline göre) ve adım değişiklikleri (yeni/kaldırılan adım veya bölüm, başlık, sıra, adım koşulu,
alan taşıma). Bulgular ekranında her bulgu kabul ya da reddedilir; **yalnızca kabul edilenlerle** yeni
model sürümü oluşur. Reddedilen bulgular imzasıyla hatırlanır: aynı değişiklik sonraki paketlerde
gösterilmez (değişiklik farklıysa yeniden gelir). Etki paneli her bulgunun senaryolara etkisini
gösterir (ör. yeni zorunlu alan N senaryoda boş → toplu değer atama).

"Tekrar analiz et" düğmesi taramadan önce hangi bağlam profillerinin kullanılacağını **her seferinde**
sorar (ekran için son seçim işaretli gelir) ve seçilen profil **adlarını** içeren bir istek dosyası yazar.

## Örnek

Sahte değerli örnek paketler: `tests/birim/fixtures/sayfa-paketi/ornek-seyahat-v1.json` (ilk inceleme) ve
`ornek-seyahat-v2.json` (zorunlu yeni alan, yeni seçenek, etiket değişikliği, kaldırılan alan, kaldırılan
seçenek, bağlam profiline göre görünürlük ve adım başlığı değişikliği).
