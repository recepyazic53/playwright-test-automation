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

Platformdaki ekran modelleriyle **aynı şema** (`tests/support/ekran-modeli.ts > EkranModeli`): adımlar →
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
  gösterilir ve seçilemez. Kabul edilen öneriler **Koşuda kapalı** eklenir (test kodu yazılıp gözden
  geçirilince koşuya alınır).

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
