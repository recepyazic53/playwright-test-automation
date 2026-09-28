# Sayfa paketi (sürüm 1)

Nöbetçi'de yeni bir ekranın keşfi ve mevcut bir ekranın tekrar analizi **sayfa paketi** ile yapılır:

1. Kullanıcı Nöbetçi > **Ekranlar > Sayfa ekle > Yapay zekâ ile oluştur** kutusundaki **İstek metnini kopyala** ile istek
   metnini, **Paket biçimini indir** ile bu belgeyi (tek dosya: `sayfa-paketi-bicimi.md`) alır ve ikisini sayfanın bağlantısıyla
   birlikte yapay zekâ aracına (tarayıcıyı kullanabilen bir kodlama asistanı) verir. Araç belirli bir ürün olmak zorunda değildir.
2. Araç sayfayı aşağıdaki **düğme gruplarına** göre inceler ve bu belgedeki biçimde bir JSON dosyası üretir.
3. Kullanıcı dosyayı Nöbetçi > **Ekranlar > Sayfa ekle** (yeni ekran) ya da ekranın **Paket yükle**
   düğmesiyle (tekrar analiz) yükler. Önizleyip kabul edene kadar hiçbir şey kaydedilmez.

### Düğme grupları (aracın incelemesi)

| Grup | Örnek | Kural |
|---|---|---|
| Açan / ilerleten (kayıt yok) | Devam, Ek adres ekle, sekmeler, oklar, seçim değiştirme | Serbestçe basılır; koşullu alanlar, bağımlı listeler ve sonraki ekranın alanları böyle çıkarılır. |
| Hesaplayan / sorgulayan | Tutar hesapla, Kimlik sorgula | Basılır; sonuç alanları ve uyarılar (tarayıcı uyarıları — alert — dahil) toplanır. Kimlik sorgusunda yalnızca kullanıcının verdiği test kaydı kullanılır. |
| Kayıt oluşturan / gönderen / onaylayan / ödeme yapan | Kaydet, Gönder, Onayla, Ödemeyi tamamla | **Basılmaz.** Araç orada durur; o noktadan sonrası pakete "bilinmiyor" olarak yazılır. |

Ne yaptığından emin olunamayan düğme üçüncü gruptan sayılır (basılmaz, kullanıcıya sorulur). Kart, parola, kimlik no gibi
bilgiler hiçbir zaman girilmez; ödeme ekranında alanlar yalnızca okunur. Kayıt oluşturan adımlardan sonraki ekranlar için
**Akışı kaydet** (düğmelere kullanıcı basar, panel toplar) kullanılır. Nöbetçi'nin kendi "Ekranı otomatik tara" özelliği
yalnızca okur (düğmelere hiç basmaz).

### Yapay zekâ aracına verilecek istek

Ekranlar listesindeki ve **Sayfa ekle** sayfasındaki **İstek metnini kopyala** düğmesi bu metni kopyalar (metin ekranda
varsayılan olarak gösterilmez; "Metni göster" ile açılır). Metnin TEK kaynağı `scripts/platform/ekranlar/paket-istekleri.mjs`'dir
(`PAKET_OZU`, `INCELEME_KURALLARI`, `paketIstekCumlesi`): arayüz aynı dosyayı `/arayuz/paket-istekleri.mjs` olarak alır, sunucu
"Tekrar analiz et" istek dosyasına aynı kuralları yazar. Metin depo dosyasına değil, istekle birlikte verilen biçim dosyasına
(`sayfa-paketi-bicimi.md`) atıf yapar; zarfın özü (zorunlu anahtarlar) metnin içindedir, ayrıntı biçim dosyasındadır. Biçim
dosyasını Nöbetçi yerel olarak sunar (`GET /arayuz/sayfa-paketi-bicimi.md`, `scripts/platform/ekranlar/paket-bicimi.mjs`): bu
belge + zarf şeması + ekran modelinin tip tanımı (`tests/support/ekran-modeli.ts`), her istekte kaynaklardan birleştirilir. Özeti:

> `<sayfa bağlantısı>` sayfasını incele ve ekteki sayfa-paketi-bicimi.md dosyasındaki biçimde bir sayfa paketi JSON dosyası üret.
> Paket tek bir JSON nesnesidir (`tur`, `surum`, `meta`, `model`, `senaryoOnerileri`, `gerekenAyarlar`, `bilinmeyenler` zorunlu;
> `kanitlar`, `testVerisi` isteğe bağlı). Sayfayı yalnızca
> okuyarak incele (düğme grupları yukarıda); kayıt oluşturan / gönderen / onaylayan / ödeme yapan düğmelere basma; kart, parola,
> kimlik no girme; iş kuralı uyarısının öğesini `kosu.hataGostergesi`'ne, metinlerini `kosu.uyarilar`'a yaz. Alan bir iframe
> içindeyse `konum.cerceve`'ye iframe seçicisini (o iframe'deki düğme / göstergelerde de `cerceve`), gerçek `<select>`'i gizli
> özel açılır listelerde gerçek `<select>`'in seçicisini ve `"doldurucu": "ozelSecim"`'i yaz. Test verisini
> `testVerisi.tablolar`'a tablo olarak yaz: **(1) Ekran listeleri** — seçim alanlarının seçenekleri `"tur": "liste"` olan,
> **"<Ekran adı> — <Alan>"** adlı tablolara (bağımlı listelerde tek tablo "<Ekran adı> — <Üst alan> - <Alt alan>", satır = geçerli
> kombinasyon; en çok 60 karakter); hücrede görünen metin, sayfadaki value farklıysa `karsiliklar`; alanlar
> `testVerisi.baglantilar` ile sütunlara bağlanır, öneride bu alanlara tablodaki değer yazılır. **(2) Kişi ve kayıt verileri** —
> `"tur": "kayit"` olan tablolarda her satır bir kayıt; öneride değer `${Tablo.Sütun}` ya da `${Tablo[etiket].Sütun}` başvurusuyla
> verilir. Projede aynı işi gören tablo varsa onun adı kullanılır; gereken tabloların adları `gerekenAyarlar.testVerisiTurleri`'ne
> yazılır. Kişisel / gizli değer hiçbir yere yazılmaz; böyle bir sütun `"gizli": true` ve boştur.

Tekrar analiz istek dosyası ayrıca ekranın **mevcut alan bağlantılarını** ve bağlı tabloların **adlarını / sütunlarını**
(`testVerisi.alanBaglari`, `testVerisi.tablolar`; değer yok, gizli sütunun yalnız adı) içerir ve araçtan bu adları aynen
kullanmasını ister (`MEVCUT_TABLO_KURALI`).

Nöbetçi hiçbir yapay zekâ servisine istek atmaz. "Yapay zekâ ile yorumla" / "Tekrar analiz et" düğmeleri, yapay zekâ aracınıza
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
  "kanitlar": [ ... ],
  "testVerisi": { "tablolar": [ ... ], "baglantilar": [ ... ] }
}
```

Bilinmeyen anahtar hatadır. `kanitlar` ve `testVerisi` isteğe bağlıdır; diğerleri zorunludur (öneri ya da bilinmeyen
yoksa boş dizi yazılır — "bilinmeyen yok" açıkça söylenmiş olur).

## meta

| Alan | Tip | Açıklama |
|---|---|---|
| `proje` | metin (isteğe bağlı) | Bilgi amaçlı proje adı. |
| `ekran.anahtar` | metin | Kalıcı ekran anahtarı: küçük harf, rakam, `-` (ör. `odeme-formu`). `model.id` ile **aynı** olmalı. |
| `ekran.ad` | metin | Görünen ad (en fazla 120 karakter). |
| `ekran.urlYolu` | metin | `/` ile başlayan **yol** (ör. `/satis/odeme/`). Tam adres yazılmaz; ortam adresi Ayarlar > Ortamlar'dan gelir. |
| `olusturan` | metin | Paketi üreten (ör. yapay zekâ aracının adı). |
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

### Bağlam profili ve kayıt alanı anahtarları

Şema yalnızca aşağıdaki genel adları tanır; önceki sürümlerin anahtar adları okunmaz.

| Ad | Anlamı |
|---|---|
| `baglam` | Modelin bağlam profili ekranı: `{ aciklama, veriKaynagi, alanlar, bilinenProfiller, pageObject? }`. |
| `{ "baglam": { "alanSeti": "…" } }` | Koşul ifadesi: bağlam profiline göre alan seti (hedef ifade; doğrulayıcı "bilinmiyor" sayar). |
| `kosullar.<ad>.bilinenDurumlar[].profil` / `.profilKodu` | Bağlam profili bazında bilinen görünürlük; `profilKodu`, seçilen bağlam profilinin koduyla eşleşir. |
| `eslesme.kayitAlani` | Alt model alanının senaryodaki kayıt (ör. test verisi kaydı) içindeki adı. |
| Senaryo girdisi `baglamKodu` / `baglamKullanicisi` | Bağlam profilini seçen alanın (`baglamProfili`) form girdileri. |

Doğrulayıcı mesajları kullanıcıya dönüktür: alanın etiketi yoksa iç anahtar yerine "Bu alan" yazılır.

### Ortak akışlar (ör. ödeme)

Tek yerde tanımlanıp ekran akışlarına **adım olarak** eklenen akış. Model `"tur": "ortakAkis"`, `"semaSurumu": 2` olur.
Adımları ekran modeliyle aynı biçimdedir; ekran adresi, spec ya da page object içermez. İçinde alt model ya da başka ortak
akış olmaz. Nasıl çalışır:
- **Yükleme:** sayfa paketiyle yüklenir; `meta.ekran.urlYolu` verilmeyebilir. Ekranlar'da "Ortak akışlar" grubunda görünür;
  senaryo listelerinde ekran olarak görünmez, taranmaz.
- **Modeli güncelle** (ortak akışın sayfası): Paket yükle, Akışı kaydet, Tekrar analiz et, Yapay zekâ ile yorumla ("Ekranı tara"
  yok; alt modelde yalnız Paket yükle). Ortak akışın kendi adresi olmadığından önce **başlangıç ekranı** sorulur (ortak akışı
  kullanan ekranlar önde, yoksa adresi olan tüm ekranlar):
  - **Akışı kaydet:** kayıt başlangıç ekranının adresinde başlar. O ekranda gerekli adımlar (ör. hesaplama) yapılır, sonra ortak
    akışın kısmı yürütülür. Bitir'den sonra diyagramda başlangıç ekranına ait bloklar silinir; "Ortak akışı güncelle" onayla
    (kullanan ekranlar gösterilir) kayıt ortak akışın TEK akışına yazılır ve yeni model sürümü açılır. `tur`, `yalnizTestOrtami`,
    `senaryoDuzeyi` ve koşullar korunur; `ekranUrl` / spec / page object yazılmaz. Sayfa paketi (önizleme) yolu yoktur.
  - **Tekrar analiz et / Yapay zekâ ile yorumla:** istek metnine başlangıç ekranının adresi ve ortak akışın o ekranda hangi
    adımdan sonra başladığı yazılır; üretilecek paketin `model.tur` değerinin `"ortakAkis"` olacağı ve `meta.ekran.urlYolu`nun
    verilmeyebileceği belirtilir.
- **Ekrana ekleme:** ekran akışında `{ "id", "sira", "baslik", "ortakAkis": { "dosya": "<anahtar>.model.json" }, "gorunurluk"? }`
  adımı olarak yer alır. Akış tasarımında **"+ > Ortak akış"** ile eklenir. "Her senaryoda koşulmaz" seçilirse senaryoda
  "“<ad>” dahil" ayarıyla seçilir.
- **Koşuda açılma:** form, doğrulama ve koşu açılmış modeli görür (`model-formu.mjs > ortakAkislariAc`), ortak akış hep son
  sürümüyle kullanılır.
  - Açılan adımların kimliği `<başvuru adımı>_<ortak adım>` olur.
  - Başvuru adımının koşulu her açılan adıma eklenir.
  - Ortak akışın koşulları `<ortak id>_<ad>` olarak taşınır.
  - Ortak akış projede yoksa koşu açık bir hatayla durur.
- **Düzenleme:** ortak akışın Akışlar sekmesinde "Düzenle" ile aynı diyagram düzenleyicisinde değiştirilir (tek akış;
  içine ortak akış eklenmez). Kaydederken onu kullanan ekranlar gösterilir. "Ekranlara ekle…" ortak akışı seçilen
  ekranların varsayılan akışının sonuna ekler (isteğe bağlı seçilirse senaryoda "“<ad>” dahil" ile koşar).
- **Yalnızca test ortamı:** `"yalnizTestOrtami": true` ise adımları canlı işaretli ortamda koşulmaz, raporda
  "(canlı ortam: atlandı)" yazar.
- **Kart:** kimlik bloğu gibi bir kayıt bloğudur (`kimlikProfili`, `kimlikTuru: "kart"`). Değer, "Kredi kartı" tablosunun
  seçilen satırından (satır adı; varsayılan `ortak`) ya da senaryoya özel karttan gelir ve koşu anında çözülür. `{deger, metin}`
  biçimli değerler `deger` ile seçilir.

### Akışlar (bir ekranda birden çok akış)

`akislar` (isteğe bağlı): `[{ id, ad, varsayilan?: true, adimlar }]`. Varsayılan akışın `adimlar`ı modelin `adimlar`ıyla
AYNIDIR (yazılırken eşitlenir; akış bilmeyen okuyucular — eski modeller — `adimlar`ı okur). `akislar` yoksa
tek, örtük "Ana akış" (`id: "ana"`) vardır. Alanlar, koşullar ve senaryo düzeyi ayarlar ekranın ORTAK havuzundadır; aynı alan
(aynı kimlik) birden çok akışta olabilir. Her akış, `adimlar`ı o akışın adımlarıyla değiştirilmiş model olarak doğrulanır
(`model-formu.mjs > akisModeli`: o akışta olmayan adımlara bağlı iş kuralları, alanlara bağlı bağlam görünürlükleri ve başka
akışların isteğe bağlı adım ayarları/koşulları çıkarılır). Senaryo akışını içeriğinde tutar (`icerik.akis`; yoksa varsayılan).
Ekranlar > ekran > **Akışlar** sekmesi (Model geçmişi düzeni): akış listesi (adım / senaryo sayısı), "Akış ekle" (ad; boş
ya da bir akıştan kopya), seçilen akışın diyagramı; **Düzenle** / **Kopyala** / **Varsayılan yap** / **Sil** (senaryosu olan ya da
varsayılan akış silinemez; varsayılan değişince akışı yazılı olmayan senaryolara eski varsayılan yazılır). Düzenleme diyagram
düzenleyicisiyle yapılır (sağ liste YALNIZCA bu ekranın modelindeki alanlar); kaydetmeden önce etkilenen senaryolar gösterilir,
kaydedince yeni model sürümü (`ekranlar/akis-servisi.mjs`, `/platform/ekran/akis/*`). Diyagramda taşınanlar:
- **Sabit değerli alanlar** (`sabit` / `turetilmis` + `sabitDeger`, ör. "bugün + 7" tarih). Paletteki notları "sabit değer: …" olur.
- **Kimlik blokları** (`kimlikProfili`). Anahtarları `kimlik:<id>` olur; alt alanlarıyla aynen korunur.
- **Kalıp göstergesi** ("Metin bir kalıp", `desen`).
- **Uyarılar.**
- **Sonucu bekleme süresi** (aksiyon bloğunda, `kosu.zamanAsimiSn`).
- **Ekran görüntüsü al** işareti (alan grubunda / aksiyonda, `kosu.ekranGoruntusu`). Adım ekran görüntüleri "Seçili adımlarda"
  iken (Ayarlar > Koşu > Kayıt ya da senaryo formu) yalnız işaretli adımların sonunda görüntü alınır.
- **Düğmesiz adımın görünürlük koşulu.** Alanların koşuluna taşınır.

Alanlar mevcut tanımlarıyla (seçici ya da kimlik bloğu kimliği) eşleşir; bağımlı listeler, doldurucu parametreleri ve
varsayılanlar korunur. Adım kimlikleri başlıkla korunur, aynı ifadeli koşullar yeniden kullanılır. Alt model adımı,
düğmeli adımın koşulu ya da seçicisi olmayan başka alan içeren modeller diyagramdan düzenlenmez, yalnızca görüntülenir. Senaryo formunda önce **Akış** seçilir (varsayılan önde); akış
değişince form o akışa göre yeniden çizilir.

### Adım koşu tanımı (semaSurumu 2)

Her adıma isteğe bağlı `kosu` nesnesi yazılabilir; model koşucusu adımın alanlarını doldurduktan sonra
aksiyonları sırayla uygular, sonra başarı göstergesini bekler:

```json
"kosu": {
  "aksiyonlar": [ { "tur": "tikla", "secici": "#hesapla", "aciklama": "Hesapla" },
                  { "tur": "bekle", "secici": "#yukleniyor", "durum": "gizli" } ],
  "basariGostergesi": { "tur": "metin", "deger": "Toplam:", "secici": "#sonuc" },
  "hataGostergesi": { "secici": "#uyari" },
  "zamanAsimiSn": 30
}
```

| Alan | Açıklama |
|---|---|
| `cerceve` | Aksiyonda, başarı göstergesinde (`eleman` ya da seçicili `metin` / `desen`), `uyarilar[]`'da ve `hataGostergesi`'nde: öğe bir iframe içindeyse çerçeve seçicileri (dıştan içe, 1–2 öğe; ör. `["iframe#pencere"]`). Seçici o çerçevenin belgesine göredir; koşucu `page.frameLocator(...)` ile orada arar. |
| `aksiyonlar[]` | `tur`: `tikla` (düğme/bağlantı), `ekranaDon` (seçicisiz: ekranın adresi yeniden açılır — ör. ortak akış kullanıcı değiştirip ana sayfaya götürdükten sonra; ortak akış hangi ekrana eklendiyse onun adresi) ya da `bekle` (`durum`: `gorunur` varsayılan \| `gizli` \| `dolu` — öğenin metni/değeri boş değil; `secici` yoksa `sureSn` kadar beklenir); `secici` zorunlu; `metin` (birden çok öğe eşleşirse bu metni içeren), `aciklama`, `zamanAsimiSn` isteğe bağlı. **Kaydet/öde/onayla** gibi kalıcı işlem yapan düğmeler yalnızca test ortamında koşulacak adımlara yazılır. |
| `basariGostergesi` | `tur`: `metin` (sayfada ya da `secici` öğesinde toleranslı içerir), `eleman` (`deger` seçicisi görünür), `url` (`deger` düzenli ifadesi), `desen` (sayfanın ya da `secici` öğesinin metni `deger` düzenli ifadesine uyar; ör. toplam sıfırdan farklı: `[1-9]`), `veya` (`secenekler`: 2–5 gösterge; herhangi biri görünürse başarılı). |
| `uyarilar` | Adımda kabul edilen iş kuralı uyarıları `[{ metin, secici? }]` (en çok 10): senaryo "iş kuralı hatası" beklerken bunlardan seçer; başarı beklenen senaryoda biri görünürse test hemen düşer. |
| `hataGostergesi` | İş kuralı uyarısının göründüğü öğe (`secici`). Beklenen iş kuralı hatası buradan okunur; beklenmeyen bir uyarı çıkarsa test "Beklenen/Görülen" hatasıyla düşer. |
| `zamanAsimiSn` | Göstergeleri bekleme süresi (1–600, varsayılan 30). |
| `ekranGoruntusu` | `true`: "Ekran görüntüsü al" işareti. Adım ekran görüntüleri "Seçili adımlarda" iken (Ayarlar > Koşu > Kayıt ya da senaryo formu) yalnız işaretli adımların sonunda görüntü alınır; diğer seçimlerde etkisizdir. |

### Çerçeve (iframe) içindeki alanlar

Alan bir iframe'in içindeyse (ör. iframe'de açılan "kullanıcı seç" penceresi) `konum.cerceve`'ye iframe seçicileri dıştan içe
yazılır (en çok 2 düzey): `"konum": { "secici": "#kullanici", "kirilganlik": "dusuk", "cerceve": ["iframe#pencere"] }`. `secici` ve
`konum.yardimci` seçicileri o çerçevenin belgesine göredir; alan sonrası parametrelerinin (`tikla`, `bekle`, `gizle`) seçicileri de
aynı çerçevede aranır. Otomatik tarama ve akış kaydı aynı kökenli iframe'lerin içini okur, alanlara `cerceve`'yi kendisi yazar
(iframe seçicisi: kimlik → ad → `src` deseni → başlık → CSS yolu); başka kökenli (cross-origin) iframe'lerin içi okunamaz, notlara
"okunamadı" diye yazılır. Öğesiz metin göstergeleri (`secici` yok) sayfanın ve çerçevelerin metninde aranır.

### Özel açılır liste (`ozelSecim`)

Gerçek `<select>` gizli (`display:none` ya da erişilebilir gizleme), yanında görünen bir aramalı kutu varsa (select2, chosen,
bootstrap-select ve benzeri bileşenler; `role="combobox"`, `aria-controls` / `aria-owns`, `<select id>_chosen` /
`select2-<id>-container` gibi genel desenler) alan `secim` tipindedir, `konum.secici` gerçek `<select>`'in seçicisidir, seçenekler
ondan okunur ve `"doldurucu": "ozelSecim"` yazılır. Koşucu: değer zaten seçiliyse dokunmaz; görünen kutuya tıklar, açılan arama
kutusu varsa seçeneğin metnini yazar ve görünen seçeneğe tıklar; liste değeri değişmediyse gizli listeye değeri yazıp
`input` / `change` gönderir; sonunda `select.value`'yu doğrular (tutmazsa Beklenen / Görülen hatası). Tarama ve akış kaydı bu alanları
kendisi tanır (akış kaydı panelinde tür "özel liste").

Sürüm 2'de `okluSecim` doldurucusu (ok düğmeleriyle değer değiştiren özel bileşen) değeri gösteren öğeyi
(`konum.secici`) ve düğmeleri (`konum.yardimci.ileri` ve `konum.yardimci.geri`; eski adlarla `arttir`/`azalt`)
bildirmek zorundadır; `doldurucuParametreleri.maksDeneme` yön başına en fazla tıklamadır.

Koşucunun diğer alan olanakları:

| Olanak | Açıklama |
|---|---|
| `sabitDeger` | Senaryo alanı olmayan (`yapilandirma` `sabit`/`turetilmis`) alan her koşuda bu değerle doldurulur. Tarihte `bugun`, `bugun+7`, `bugun-3` (İstanbul günü, alanın `bicim`iyle). |
| Varsayılan | Senaryoda boş bırakılan alan modelin `varsayilan.deger`ini alır; görünürlük koşulları da bu değerle hesaplanır (dosya hariç). Senaryonun `bilerekBos` listesindeki alanlar (olumsuz senaryo: "zorunlu alan boşken uyarı çıkmalı") varsayılanı almaz ve doldurulmaz; doğrulayıcı bu alanların boşluğunu hata değil uyarı sayar. |
| `sinirlar` | Alanın uygulamadaki değer kuralları — senaryo verisini kısıtlamaz, yalnızca senaryo tasarım yardımcısının sınır değer önerileri bundan üretilir (kural yoksa öneri yok). Sayı: `enAz`, `enCok` (sayı), `artis` (varsayılan 1). Tarih: `enAz`, `enCok` (`bugun`, `bugun+30`, `gg.aa.yyyy` ya da `yyyy-aa-gg`). Metin: `enAzUzunluk`, `enCokUzunluk` (tam sayı), `desen` (düzenli ifade; değerin tamamı uymalı). Ör. `"sinirlar": { "enAz": 1, "enCok": 10 }`. Paket yalnızca sayfada belli olan sınırları yazar (tahmin yok); kullanıcı ekranın Akışlar sekmesinde alanın "Sınırlar" düğmesiyle ekler / değiştirir / kaldırır (akışı yeniden kaydetmek mevcut kuralları ve alanın diğer anahtarlarını korur). Senaryo formunda zorunlu alanın "Bilerek boş bırak" işareti `bilerekBos` listesini yönetir. |
| `kimlikProfili` | Senaryoya özel kimlik ya da seçilen (yoksa varsayılan) hazır kayıt (Ayarlar > Test verisi > Kişi ve kayıt verileri; havuz = aynı adlı tablo, kayıt = satır adı) `altAlanlar`a `sira` ile açılır; `eslesme.kimlikAlani` metin ya da kimlik türüne göre harita (türde karşılığı yoksa alt alan atlanır). |
| `doldurucuParametreleri` | Alan doldurulduktan sonra: `tus` (ör. `Tab`), `tikla` (seçici; ör. kimlik sorgula), `bekle {secici, durum: dolu \| gorunur \| gizli, zamanAsimiSn, icermez?}` (`icermez`: dolu sayılmayan geçici metin, ör. sorgu sürerken "Aranıyor"), `gizle` (seçici: alan doldurulunca açık kalıp sonraki tıklamayı kapatan katman gizlenir, ör. takvim `#ui-datepicker-div`). Alan sonrası tıklama en çok 15 sn denenir, sonra açık hatayla düşer. `maske` (ör. `"(###) ### ## ##"`): değerin rakamları kalıba yerleştirilerek yazılır (maskeli alanlarda `degerJs` ile birlikte). Alan beklemesi sırasında adımın hata göstergesi (`kosu.hataGostergesi`) açılırsa adım hemen düşer (akışın kabul ettiği uyarılar hariç). Oklu seçimde `yanitBekle`: her tıklamadan sonra adresi bu metni içeren isteğin bitmesi beklenir (ör. seçim değişince yeniden yüklenen bağımlı liste). |
| Doldurucular | `radyoZorla` / `onayKutusuZorla` (gizli çizimli girdiler; görünürlük yerine sayfada varlık), `secimGerekirse` (değer zaten seçiliyse dokunulmaz), `ozelSecim` (gizli `<select>` + görünen aramalı kutu; yukarıya bakın), `degerJs` (değer betikle yazılır + input/change; gizli alan ya da gizli <select> — sayfada varlık yeter; seçenek önce değerle, sonra metinle). Kapalı (disabled) alan doldurulmaz, "atlanan alanlar"a yazılır (mutlaka görünmeli ise hata). |
| Kimlik alanı dilimi | Alt alanda `eslesme.kimlikAlani: { "ad": "cepTelefonu", "dilim": [0, 3] }` (ya da türe göre `{ "ozel": { ad, dilim } }`): profildeki değerin parçası yazılır (boşluklar yok sayılır). |

Tekrar analizde koşu tanımı değişikliği **"Adım koşu tanımı"** bulgusu olur; sürüm 1 bir model bu bulgu kabul
edilince sürüm 2'ye yükselir.

## Model koşucusu

Tüm senaryolar `tests/model-kosucu/model-senaryolari.spec.ts` tarafından üretilen testlerle koşar. Her test `@model-<senaryo kimliği>` etiketini taşır; Nöbetçi tek senaryo koşusunu bu
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

**Tablodan değer (`${Tablo.Sütun}`):** ekran senaryosunda bir alanın değeri `"${Tablo.Sütun}"` ya da `"${Tablo[etiket].Sütun}"`
olabilir (senaryo formunda tabloya bağlı alanın listesinde / yanında **Tablodan**). Koşuda (`veri-oku.mjs` →
`tablolar/ekran-basvurulari.mjs`) servis gövdesindeki `${…}` ile AYNI kuralla (`tablo-secimi.mjs > basvuruyuCoz`) çözülür:
seçimler = içerikteki `tabloSecimleri` + aynı tabloya bağlı alanların senaryodaki düz değerleri; satırın ortamı boşsa her
ortamda geçerli, uyan İLK satır kullanılır. Ekrana, alanın seçenekleri tablodaki değeri tanıyorsa o (seçenek sayfa değeriyle
seçilir), yoksa değerin **sayfa karşılığı** (tanımsızsa tablodaki değer) yazılır. Çözülemeyen başvuru (tablo / sütun yok, "X
tablosunda bu ortamda satır yok", seçilen satırda boş) koşuyu tarayıcı açılmadan anlaşılır bir hatayla durdurur. Gizli sütundan
gelen değer yakalanan mesajlarda ve hata metinlerinde maskelenir. Düz metin değerler aynen çalışır (senaryolar dönüştürülmez).
Kaydederken tablo ve sütunun projede olduğu, seçim alanının gizli sütundan değer almadığı denetlenir.

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
  *"Adım/aksiyon tanımları (düğmeler, başarı göstergeleri) otomatik çıkarılamadı — yapay zekâ aracınızla (sayfa paketi) ya da akış kaydıyla tamamlayın."* + gezinmeler,
  engellenen yazma istekleri, keşfedilmeyen uzun listeler, etiketsiz alanlar, özel bileşenler/çerçeveler…),
  `kanitlar` (profil başına görünür alan ekran görüntüsü).
* Alan **değerleri** pakete hiç yazılmaz; sayfadan gelen metinlerde gizli veri kalıbı varsa metin atılır.
* `testVerisi`: her seçim alanının (açılır liste, radyo; gizli bilgi alanları hariç) seçenekleri "<Ekran adı> — <Alan>" adlı,
  türü `liste` olan bir tablo olur ve alan sütuna bağlanır (akış kaydında da aynı). Seçim keşfinde bir seçim değişince seçenekleri değişen listeler (bağımlı listeler) üst seçimle aynı tabloya
  girer (satır = kombinasyon). Hücre görünen metin, sayfa değeri farklıysa karşılık (aynı metin farklı değerlere denk
  geliyorsa sütun değerle yazılır).

Uçlar ve protokol: `scripts/platform/tarama/yonetici.mjs` (`/platform/tarama/*`) ve `protokol.mjs`.

### Akışı kaydet (kullanıcı yürütür)

Alanları bir düğmeyle açılan ekranlarda (çok adımlı formlar) otomatik tarama sonraki adımları göremez. **Akışı kaydet**
(Ekranlar > ekran > "Akışı kaydet", ya da "Sayfa ekle"deki seçenek) aynı iş altyapısını kullanır (`/platform/tarama/baslat`
`{ kip: "kayit", … }`), ama:

1. **Görünür bir tarayıcı** açılır; giriş ve bağlam değiştirme tarifle otomatik yapılır, sonra başlangıç sayfası açılır.
   En fazla **bir** bağlam profili; süre sınırı 30 dk (`NOBETCI_KAYIT_ZAMAN_ASIMI_SN`). **Giriş yapmadan aç**
   (`girissiz: true`; otomatik taramada da var): giriş ve bağlam değiştirme yapılmaz, model `girisGerekmez: true` olur ve
   model koşucusu da girişsiz koşar.
2. Akışı **kullanıcı** yürütür; sayfanın köşesindeki Nöbetçi paneli (`tarama/kayit-paneli.ts`; ayrı shadow kökünde) yalnızca
   **toplar** (topla → tasarla):
   - **Görülen alanlar:** ekranda görülen form alanlarının YAPISI (etiket, tür; değer yok). Ekran kendiliğinden okunur
     (açılışta, seçim / onay kutusu değişince, düğmeye basılmadan hemen önce ve basıldıktan sonra); yeni alanlar açılınca
     kullanıcı **Ekranı yeniden oku**ya basar. Kullanıcının **dokunduğu** alanlar listede işaretli gelir; kullanıcı
     işaretleri değiştirebilir ("şu an görünmüyor" / "yeni" işaretleri görünür). Aynı kökenli **iframe**'lerin içindeki alanlar,
     dokunuşlar ve düğmeler de kaydedilir (listede "çerçevede" işareti; alanın `konum.cerceve`'si); başka kökenli iframe'lerin içi
     okunamaz (kayıt notlarına yazılır). Gerçek `<select>`'i gizli **özel açılır listeler** (aramalı kutu) tür "özel liste" olarak
     görünür; kutuya / seçeneğe tıklamak alana dokunmaktır (model: `doldurucu: "ozelSecim"`).
   - **Basılan düğmeler** (seçici + görünen metni) kendiliğinden listeye girer.
   - **Mesaj seç:** sayfada beklenen mesajın yazdığı yere tıklanır (bu tıklama siteye gitmez).
   - **Bitir** (özet + "Bitir ve Nöbetçi’ye gönder"), **Sıfırla** (iki adımlı onay; toplananlar silinir), **İptal**.
   Her okumada seçim alanlarının (select / radyo) SEÇİLİ SEÇENEĞİ kaydedilir (yalnızca kayıtlı seçeneklerden biriyse; metin
   değerleri okunmaz) — seçime göre değişen alanların koşulu bundan çıkarılır (aşağıda).
   **Seçenek listeleri (arka planda):** her okumada seçim alanlarının seçenekleri, kullanıcı bir alana tıklayınca / ok
   tuşuyla açılan listbox / combobox listesinin seçenekleri (`kayit-paneli.ts > acikListeSecenekleri`; yazarak süzülen öneri
   listeleri alınmaz) o andaki diğer seçimlerle birlikte kaydedilir. Yalnız seçenek etiketi / değeri — kullanıcının yazdığı
   metin kaydedilmez. Panel "Seçenekleri yakalanan liste: N" gösterir. Üretilen paketin `testVerisi` bölümüne akıştaki
   alanlar için tablo olarak girer; üst seçimin değerine göre seçenekleri değişen listeler kombinasyon satırları olur.
3. **Akış diyagramı oluştur** (Nöbetçi'de, iş ekranı; `arayuz/akis-tasarimi.js`, saf kurallar `tarama/akis-tasarimi.mjs`):
   kayıttan hazırlanan **taslak** açılır — her düğme basışı bir **Aksiyon**, aradaki dokunulan (listede işaretli) alanlar bir
   **Alan grubu** (adı bölüm başlığından önerilir), seçilen mesajlar **Beklenen mesaj** (öneri: metnin sabit kısmı), sonunda
   **Bitir**. Kullanıcı blokları adlandırır, ↑/↓ ile taşır, siler; blokların arasındaki **+** ile Alan grubu / Aksiyon /
   Beklenen mesaj / Bekleme süresi / Bitir ekler. Alan grubundaki her alan **Zorunlu** (senaryoda değer şart; koşuda ekranda
   görünmezse test başarısız — koşullu alanda koşul sağlandığında; model: alanın `mutlakaGorunmeli: true`, senaryo formunda
   "Akışta zorunlu") ya da **Görünürse doldur** (boş bırakılabilir; görünmüyorsa atlanır); varsayılan sayfanın zorunluluğu.
   **Koşul:** alan grubundaki her alanın yanında koşulu yazar ("Müşteri tipi = Bireysel ise"; kayıt okumalarından otomatik
   bulunur, taslakta hazır gelir); "Koşul" ile seçim alanı + görünür olduğu seçenekler seçilerek düzeltilir ya da kaldırılır
   (`kosullar: { [alan]: { secim, degerler } | null }`; koşuldaki seçim alanı akışta olmalı; modeldeki koşulla aynıysa korunur).
   **Mevcut ekranın kaydı:** "Kayıt nereye yazılsın?" — varsayılan akışı güncelle (önizleme → Bulgular), yeni akış olarak ekle
   ya da seçilen akışı güncelle (etki onayı → yeni model sürümü; kaydın gerçek okumalarıyla).
   **Bekleme süresi** (1–120 sn) önceki düğmeden sonra (düğme yoksa alanlardan sonra) beklenir: `kosu.aksiyonlar` içinde
   `{ tur: "bekle", sureSn }`. Bekleme konmasa da koşucu sonraki alan / beklenen mesaj görünene kadar bekler. Sağda **Kayıtta yakalananlar**: alanlar (bir gruba sürüklenir ya da "Ekle" ile etkin gruba
   eklenir; alan tek grupta olur, başka gruba bırakılınca taşınır; listeye alınmamışlar isteğe bağlı gösterilir), düğmeler
   ("Aksiyon ekle"), mesajlar ("Mesaj ekle"). Değişiklikler taslak olarak saklanır (`POST /platform/tarama/akis
   { taslak: true }`); **Kaydet ve önizle** doğrular (hatalar bloğun altında) ve sayfa paketine çevirir; önizlemede
   **Diyagrama dön** ile düzenlemeye dönülür. Tasarım bekleyen iş sunucu belleğinde 12 saat saklanır (sunucu yeniden
   başlarsa kayıt kaybolur).
   Kurallar: **Bitir** zorunlu ve sonda; alan grubunun adı tekil; alan tek grupta; boş alan grubu yalnızca ardından aksiyon
   gelirse olur (alansız adımı adlandırmak için, ör. "Onay"); **zorunlu aksiyon** önceki grubun ilerleme düğmesidir (grup yoksa
   düğmenin adıyla bir adım olur); **"her senaryoda basılmaz" aksiyon** ve HEMEN ardından gelen alan grubu o düğmeyle açılan
   parçadır — senaryo formunda **"“<düğme>” dahil"** onay kutusu olur (isteğe bağlı adım kapsamı); aksiyondan sonraki
   **beklenen mesaj** o düğmeden sonra aranır, son mesaj akışın başarı göstergesidir (öğe seçilmediyse metin sayfanın
   tamamında aranır). **Art arda** konan beklenen mesajlar bir **VEYA** grubudur (en çok 5; mesaj bloğundaki "Veya mesaj
   ekle"): herhangi biri görünürse adım başarılıdır, görünen seçenek ekran görüntüsünün adında yazar; modelde
   `basariGostergesi: { tur: "veya", secenekler: [...] }`. Her beklenen mesaj **Başarı** ya da **Uyarı** işaretlenir: Uyarı
   işaretliler o adımın **kabul edilen iş kuralı uyarılarıdır** (`kosu.uyarilar: [{ metin, secici? }]`, en çok 10; VEYA
   grubuna girmez). Akışta uyarı varsa modele senaryo düzeyinde "Beklenen sonuç" (birleşim) alanı eklenir (adım seçenekleri:
   uyarılı adımlar). Senaryo formunda "İş kuralı hatası" seçilince uyarı yazılmaz, akıştakilerden seçilir (birden çoksa
   VEYA, senaryoda `beklenenSonuc.mesajlar`; adım uyarının adımıdır; listede yoksa elle yazılabilir). "Başarılı" senaryoda
   akışın başarı mesajları bilgi olarak görünür; koşuda kabul edilen uyarılardan biri çıkarsa test zaman aşımını beklemeden
   düşer. Diyagram **ekranın** akışıdır; senaryolar değerleri ve isteğe bağlı aksiyonları senaryo formunda seçer.
   **Seçime göre değişen alanlar** (ör. Bireysel → TC kimlik no, Tüzel → Vergi kimlik no): adımın alanlarının en az yarısının
   göründüğü okumalarda bir alan bazen görünüp bazen görünmüyorsa ve bu okumalar arasında değeri ayrışan TEK bir seçim varsa
   (seçimin boş / görünmediği okumalar yok sayılır) alana `gorunurluk: { kosul: "<alan>Gorunur" }` yazılır
   (`ifade: { alan: <seçim>, esit | icinde }`); birden çok aday varsa koşul yazılmaz, bilinmeyenlere not düşülür.
4. **Güvenlik:** kullanıcının bastığı düğmeler siteye **gerçek istek** gönderir (kayıt aşamasında yazma engeli yok;
   başlatırken açık onay istenir). Ortam **canlı** olarak işaretliyse (Ayarlar > Ortamlar) kayıt reddedilir. Yasaklı
   host ve izinli köken engeli her aşamada sürer.
5. **Gizlilik:** alan **değerleri** hiçbir zaman okunmaz; kayıtta **ekran görüntüsü alınmaz** (kullanıcının girdiği bilgileri
   içerirdi). Gösterge metninin değişken kısmı (ilk rakamdan sonrası: numara, tarih, tutar) atılır; gizli veri kalıbına
   benzeyen metin yazılmaz.

Üretilen paket (diyagram adım biçimine çevrilir: `akis-tasarimi.mjs > akistanKayitEnvanteri`, sonra
`paket-olusturucu.mjs > kayitPaketiOlustur`): `meta.olusturan: "Nöbetçi akış kaydı"`, model
`semaSurumu: 2` — adımlar kaydın sırası ve adlarıyla (alan açan düğmesi olan adım alt adımlara bölünür:
[ilk alanlar] → [“düğme”] → [“düğme” sonrası alanlar] → [ilerleme]; "her senaryoda basılmaz" düğmenin alt adımları
`gorunurluk: { kosul }` + `senaryoDuzeyi`'nde `<düğme>Dahil` onay kutusu); her adımda seçilen alanlar + **İşlemler** bölümü (ilerleme düğmesi
`buton`/`aksiyon`, son adımda gösterge `cikti`); `kosu.aksiyonlar` = ilerleme düğmesine tıkla, `kosu.basariGostergesi` =
sonraki adımın ilk alanı (yoksa ilerleme düğmesi) görünür / o düğmeden sonraki beklenen mesaj / son adımda son beklenen mesaj. Tarif bağlam değiştiriyorsa
`senaryoDuzeyi`'ne bağlam profili alanı eklenir (varsayılan: kaydın profili). **Mevcut ekranda** seçiciyle eşleşen alanların
kimliği ve ek bilgileri korunur; kayıtta olmayan alanlar yeni modelde yoktur (Bulgular'da "kaldırıldı", reddedilebilir);
artık var olmayan alan/adımlara bağlı koşullar ve iş kuralları çıkarılıp bilinmeyenlere yazılır.

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

* `veri`: modelin senaryo biçimi (alanların `eslesme.senaryo` anahtarları). Kişi, kart, adres gibi veriler değer olarak
  yazılmaz: alanın değeri **tablo başvurusudur** — `"${Tablo.Sütun}"` ya da aynı tablo iki kez gerekiyorsa
  `"${Tablo[etiket].Sütun}"` (ör. `"musteriAdi": "${Kişi.Ad}"`); kimlik bloğunda kayıt (satır) adı (ör. `"musteriProfili": "ozel1"`).
  Başvurulan tablo ve sütun pakette ya da projede olmalıdır (önizlemede denetlenir; seçim alanı gizli sütundan değer alamaz).
  Tabloya bağlı seçim alanında tablodaki değer ya da aynı sütuna başvuru yazılır. Koşuda çözümü: [Model koşucusu](#model-koşucusu).
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
| `testVerisiTurleri` | senaryoların gerektirdiği test verisi **tablolarının adları** (anahtar adı geriye uyum için korunur); önizlemede "Gereken tablo" satırı olur: projede var / paketle gelir / eksik |
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

## testVerisi (isteğe bağlı)

Test verisi **tablolara** yazılır (Ayarlar > Test verisi: Excel sayfası gibi; sütun = alan, satır = birlikte geçerli değerler) ve
alanlar sütunlara **bağlanır** (ekranın Test verisi sekmesi). İki tür tablo vardır (isteğe bağlı `tur`):

* **Ekran listesi** (`"tur": "liste"`): seçim alanının seçenekleri. Ad **"<Ekran adı> — <Alan>"** (bağımlı listede
  "<Ekran adı> — <Üst alan> - <Alt alan>"; en çok 60 karakter — sığmazsa ekran adı kısaltılır). Test verisi ekranında "Ekran
  listeleri" grubunda, ekran başına alt grupta görünür. Otomatik tarama ve akış kaydı bu adla ve bu türle üretir; yapay zekâ aracının
  paketinde ad farklı gelirse Nöbetçi adı değiştirmez.
* **Kişi ve kayıt verisi** (`"tur": "kayit"`): her satır bir kayıt (müşteri, araç, adres…); senaryo değeri `${Tablo.Sütun}`
  ile alır. "Kişi ve kayıt verileri" grubunda görünür.

Tür tabloda kaynağıyla birlikte saklanır (`kaynak.tabloTuru`); gruplama önce türe bakar, tür yoksa (eski tablolar) ada / kaynağa
göre tahmin eder. Biçim, mevcut tablo + alan bağlantısı modelinin paket karşılığıdır (`scripts/platform/tablolar/paket-tablolari.mjs`):

```json
"testVerisi": {
  "tablolar": [
    {
      "ad": "Adres formu — İl - İlçe",
      "tur": "liste",
      "aciklama": "İl seçilince ilçe listesi değişir",
      "sutunlar": [
        { "ad": "İl", "karsiliklar": { "İstanbul": { "sayfa": "34" }, "Ankara": { "sayfa": "06" } } },
        { "ad": "İlçe", "karsiliklar": { "Kadıköy": { "sayfa": "34-2" } } }
      ],
      "satirlar": [["İstanbul", "Kadıköy"], ["İstanbul", "Üsküdar"], ["Ankara", "Çankaya"]]
    },
    { "ad": "Adres formu — Müşteri tipi", "tur": "liste", "sutunlar": [{ "ad": "Müşteri tipi" }], "satirlar": [["Bireysel"], ["Kurumsal"]] },
    { "ad": "Servis girişi", "tur": "kayit", "sutunlar": [{ "ad": "Kullanıcı" }, { "ad": "Parola", "gizli": true }], "satirlar": [["kanal-1", null]] }
  ],
  "baglantilar": [
    { "alanId": "il", "tablo": "Adres formu — İl - İlçe", "sutun": "İl" },
    { "alanId": "ilce", "tablo": "Adres formu — İl - İlçe", "sutun": "İlçe" },
    { "alanId": "musteriTipi", "tablo": "Adres formu — Müşteri tipi", "sutun": "Müşteri tipi" }
  ]
}
```

| Alan | Kural |
|---|---|
| `tablolar[].ad`, `sutunlar[].ad` | En çok 60 karakter; `. [ ] { } $ < > & \|` yok. Pakette tablo adı, tabloda sütun adı tekil. En çok 50 tablo, 40 sütun, 5000 satır. Ekran listesinde ad "<Ekran adı> — <Alan>". |
| `tablolar[].tur` | (isteğe bağlı) `liste` (ekran listesi) \| `kayit` (kişi ve kayıt verisi). Başka değer hatadır. |
| `satirlar` | Her satır sütun sırasıyla hücre dizisi (metin / sayı / `null`). **Bağımlı listelerde satır = geçerli kombinasyon** (üst seçim + o seçimde görünen alt seçenek); bağımsız seçim alanı tek sütunlu tablodur. Tekrarlanan satır bir kez yazılır (uyarı). |
| Hücre değeri | Seçeneğin **görünen metni**. Sayfadaki `value` farklıysa sütunun `karsiliklar`ına `{ "<metin>": { "sayfa": "<value>" } }` yazılır (servise giden değer farklıysa `servis`). Bağlı seçim alanında karşılık, modeldeki seçenekten (metin ≠ değer) kendiliğinden de tamamlanır. |
| `gizli: true` | Değeri Nöbetçi'de **şifreli** girilen sütun (parola vb.): pakette hücreleri boştur (`null`); değer yazılırsa paket reddedilir. Adı gizli bilgi taşıyan (parola, şifre, token, PIN, güvenlik…) ama gizli işaretlenmemiş sütun **uyarı** verir, değer taşıyorsa **hata**. Kart / T.C. kimlik no / IBAN kalıpları her yerde olduğu gibi reddedilir. |
| `baglantilar[]` | `alanId`: modelde senaryoda ayarlanan seçim / metin alanı (gizli bilgi alanı bağlanmaz); `tablo` + `sutun` pakette olmalı, gizli sütuna bağlanmaz; alan bir kez bağlanır. `etiket` (isteğe bağlı): aynı tablo ekranda iki kez gerekiyorsa. |
| Senaryo önerileri | Tabloya bağlı alanda senaryo değeri **tablodaki değerdir**; öneriler tablolar modele uygulanarak doğrulanır. Kişi / kayıt değeri `${Tablo.Sütun}` başvurusudur (tablo ve sütun pakette ya da projede olmalı; seçim alanı gizli sütundan değer alamaz). |

**Önizleme ve onay** (Sayfa ekle / Paket yükle / tarama ve kayıt sonucu): "Test verisine yazılacaklar" bölümü her tabloyu (sütun /
satır sayısı, ilk satırlar, gizli sütunlar, bağlanacak alanlar) ve alan bağlantılarını (mevcut bağlantı değişiyorsa o da)
gösterir. Kullanıcı tablo başına **yaz / atla** seçer; projede **aynı adlı tablo** varsa **Birleştir** (mevcut satır ve sütunlar
değişmez; eksik sütunlar, tabloda olmayan satırlar ve eksik karşılıklar eklenir; tablonun **kaynağı** da değişmez — varsa korunur,
yoksa yok kalır) / **Yeni adla yaz** / **Atla** seçmeden kabul
edilemez. Bağlantılar tek tek seçilir. **Onaylanmayan hiçbir şey yazılmaz**; yazım ekran + model kaydıyla aynı işlemdedir
(`tablolar/paket-test-verisi.mjs`; uçlar `sayfa-paketi/ekle`, `ekran/model/degistir`, `ekran/analiz/yukle` gövdesinde
`testVerisi: { tablolar: { "<ad>": { islem: "yeni" | "birlestir" | "yeniAd" | "atla", yeniAd? } }, baglantilar: [alanId] }`).
**Tekrar analizde** tablolar onayla hemen yazılır; alan **bağlantıları bulgu kararına tabidir**: bu analizde bulgusu olan ya da
henüz modelde olmayan alanın bağlantısı bekleyen analizle saklanır ve Bulgular'da alanın bir bulgusu **kabul** edilince yazılır
(reddedilen ya da karar verilmeyen alanın bağı yazılmaz; analiz iptal edilirse düşer). Bulgusu olmayan, modelde zaten var olan
alanın bağlantısı hemen yazılır. Yeni tablonun **kaynağı** (sayfa paketi / otomatik tarama / akış kaydı, ekran, tarih, tablo türü)
Tablolar ekranında görünür. **Akış kaydında** mevcut ekranı doğrudan bir akışa yazan yol ("yeni akış olarak ekle" / "seçilen
akışı güncelle") da kayıtta yakalanan seçenek listelerini aynı biçimde önerir: onay penceresinde "Test verisine yazılacaklar"
bölümü görünür; yalnız seçilen tablolar / bağlantılar yeni model sürümüyle aynı işlemde yazılır, seçim yoksa test verisine hiçbir
şey yazılmaz (`POST /platform/tarama/akis` gövdesinde `hedef: { tur: "akis" }, onay: true, testVerisi`).

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

Sahte değerli örnek paketler: `tests/birim/fixtures/sayfa-paketi/ornek-rota-v1.json` (ilk inceleme) ve
`ornek-rota-v2.json` (zorunlu yeni alan, yeni seçenek, etiket değişikliği, kaldırılan alan, kaldırılan
seçenek, bağlam profiline göre görünürlük ve adım başlığı değişikliği).
