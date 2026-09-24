# Ekran Modelleri

Her ürün ekranı için **tek doğruluk kaynağı**. Bugün bir ekranın bilgisi beş ayrı yerde elle senkron tutuluyor: POM, spec, `test-data.ts` tipi, dashboard'daki "Senaryo Oluştur/Düzenle" formu ve `test-sunucu.mjs` doğrulaması. Hedef, bunların hepsinin bu klasördeki modelden türemesi.

| Dosya | İçerik |
|---|---|
| `jet-seyahat.model.json` | JetSeyahat ekranı (`tur: "ekran"`) |
| `odeme-kredi-karti.model.json` | Ürünler arasında paylaşılan poliçeleştirme ve kredi kartı ödeme alt modeli (`tur: "altModel"`) |

Yükleyici ve tipler `tests/support/ekran-modeli.ts` içinde (`ekranModeliniYukle`). Koruma testleri `tests/birim/` altında, `npm run test:birim` ile çalışır. Bu testler tarayıcı açmaz, şirket ortamına da bağlanmaz.

## Model neyi yönetecek (yol haritası)

1. **Doğrulama** (bugün): koruma testleri şunları kontrol eder:
   - model dosyasının kendisi (şema, benzersiz id'ler, başvurular),
   - senaryo verisindeki her özellik ve değerin modelde bilinmesi,
   - sunucunun `JET_SEYAHAT_FORM_ALANLARI` listesi ve TS senaryo tipinin modelle aynı olması,
   - dashboard formundaki `sof_*` kontrollerinin modelle birebir eşleşmesi.
2. **Tip üretimi**: senaryo tipi (`test-data.ts`) modelden üretilecek.
3. **Tek doğrulayıcı**: sunucu, spec ve istemci aynı model tabanlı kuralları kullanacak (`dogrulama` alanındaki bugünkü farklar kapanacak).
4. **Form**: dashboard formu bölüm bölüm modelden çizilecek. `form.id` değerleri (`sof_*`) korunacak.
5. **Genel doldurucu**: POM'daki `alanDoldur(alan, deger)`, alanın `tip` + `doldurucu` + `konum` bilgisiyle çalışacak.
6. **Crawler**: canlı ekranın anlık görüntüsü modelle karşılaştırılacak ve farklar raporlanacak (yeni alan, yeni seçenek, kalkan alan, etiket değişikliği). Crawler'ın bulduğu ama testin dokunmadığı alanlar `yapilandirma: "dokunulmuyor"` ile eklenecek.

**Bilinmeyen = açık.** Koddan çıkarılamayan her bilgi `null` olarak yazılır ve yanına `not` eklenir (ör. `"etiket": { "ekran": null }`, `"seceneklerDurumu": "bilinmiyor"`). Tahmin yazılmaz. İlk canlı taramada toplanacaklar `bilinmeyenler` listesinde durur.

## Üst düzey (ekran modeli)

| Anahtar | Anlamı |
|---|---|
| `semaSurumu` | Şema sürümü (şu an `1`). Yükleyici yalnızca `DESTEKLENEN_SEMA_SURUMU` değerini kabul eder. Şema değişince artırılır. |
| `tur` | `"ekran"` ya da `"altModel"` |
| `id`, `ad`, `aciklama`, `ekranUrl`, `specDosyasi`, `pageObject` | Ekranın kimliği ve kodla bağlantısı |
| `veriKaynaklari` | Değer yollarının kökleri: `urun.` = `tests/data/<ortam>/jet-seyahat.json > jetSeyahat`, `senaryo.` = `urun.senaryolar[i]`, `ortak.` = `ortak.json` |
| `kosullar` | Adlandırılmış görünürlük/etkinlik koşulları: `{ ifade, aciklama?, hedefIfade?, bilinenDurumlar?, not? }` |
| `adimlar[]` | Akış sırasıyla ekran adımları. `sira` 1..n olmalı. Her adımda ya `bolumler[]` (her bölümde `alanlar[]`) ya da `altModel: { dosya, bolum }` bulunur. Adım id'leri `beklenenSonuc.adim` değerlerini (`primHesaplama`, `policelestirme`, `odeme`) kapsar. |
| `senaryoDuzeyi.alanlar[]` | Ekrana ait OLMAYAN senaryo ayarları: `baslik`, `acenteProfili`, `odemeAdimiDahil`, `beklenenSonuc`, `krediKarti`, `kosuyaDahil` |
| `urunDuzeyi` | Ürün verisindeki (`jetSeyahat.<anahtar>`) her anahtar: `{ tip, degerler?, kullanan?: <alan id>, not? }`. Koruma testi veri dosyalarındaki anahtarlarla birebir karşılaştırır. |
| `acenteBaglami` | Kullanıcı Değiştir ekranı. Senaryo bağlamıdır ama alan setinin görünürlüğünü belirler. |
| `isKurallari[]` | Bilinen iş kuralları: `{ id, adim, kosul, gecerlilik?, mesaj, kaynak }`. Beklenen hata önerisinde kullanılacak. |
| `bilinmeyenler[]` | İlk canlı taramada toplanacaklar |

Alt model (`tur: "altModel"`) dosyasında `kullananlar`, `veriKaynaklari`, `bolumler[]`, `ekranDisiAlanlar` ve `bilinmeyenler` bulunur. Alt model dış başvuru (koşul ya da alan) içeremez; görünürlüğü onu kullanan ekranın adımı belirler (ör. JetSeyahat'te `gorunurluk: { kosul: "odemeDahil" }`).

## Alan nesnesi

```jsonc
{
  "id": "kapsam",                 // kalıcı, dosya içinde benzersiz (senaryo anahtarıyla aynı olmak zorunda değil)
  "tip": "okluSecim",             // aşağıdaki listeden
  "etiket": { "ekran": null, "form": "Kapsam", "not": "..." },   // ekran: sitede görünen metin (null = bilinmiyor)
  "secenekler": [{ "deger": "DÜNYA", "metin": "DÜNYA" }] | null,
  "seceneklerDurumu": "tam" | "kismi" | "bilinmiyor" | "dinamik",
  "seceneklerKaynagi": "...",     // listenin nereden alındığı
  "bagimlilik": { "alan": "kapsam", "secenekHaritasi": { "DÜNYA": [...] } },   // seçenekleri başka alana bağlı
  "zorunlu": true | false | null,
  "varsayilan": { "deger": ..., "kaynak": "...", "not": "..." },
  "yapilandirma": "senaryo" | "urun" | "turetilmis" | "sabit" | "cikti" | "aksiyon" | "dokunulmuyor" | "harici",
  "eslesme": { "senaryo": "kapsam" | ["a", "b"], "urun": "ulke.deger", "kart": "isim", "kimlikAlani": "tcKimlikNo", "donusum": "..." },
  "konum": { "secici": "#kapsam-text", "yardimci": { ... }, "kirilganlik": "dusuk" | "orta" | "yuksek", "not": "..." },
  "doldurucu": "okluSecim",
  "doldurucuParametreleri": { ... },
  "gorunurluk": { "kosul": "<kosullar anahtarı>" } | { "ifade": <koşul ifadesi> } | null,
  "form": { "id": "sof_kapsam", "kontrol": "select", "etiket": "Kapsam", "secenekler"?: [...],
            "yardimciKontroller"?: [{ "id": "sof_...", "kontrol": "radio", "amac": "..." }] } | null,
  "dogrulama": { "istemci": "...", "sunucu": "...", "ts": "..." },   // BUGÜNKÜ kurallar (farklar görünür kalsın diye ayrı ayrı)
  "altAlanlar": [ ... ],          // bileşik alanların parçaları (kimlik: doğum tarihi, telefon, TC)
  "ekranAlanlari": [ ... ],       // tek senaryo değerinin ekranda dağıldığı kontroller (ettiren → DifferentClient + ClientType)
  "altModel": { "dosya": "...", "bolum": "..." },   // yalnızca altModelGecersizKilma
  "notlar": ["..."]
}
```

Yükleyici bilinmeyen anahtarları reddeder, bu yüzden yazım hataları sessizce geçmez. Yukarıdakilere ek olarak şu tanımlayıcı anahtarlar da kabul edilir: `bicim`, `kabul`, `birim`, `hassas`, `ekrandaAlanDegil`, `kimlikTuru`, `sira`, `sonKontrol`, `kullanim`, `excelSutunlari`, `benzersiz`, `varyantlar`, `akisPlani`, `durum: "oneri"`.

### `tip`
`secim` (select), `okluSecim` (ok tuşlarıyla döngüsel seçim), `metin`, `sayi`, `tarih`, `telefon`, `onayKutusu`, `radyo`, `dosya`, `kimlikProfili` (hazır profil anahtarı ya da serbest kimlik nesnesi), `buton`, `baglanti`, `cikti` (salt okunur ekran çıktısı), `tablo`, `diyalog`, `birlesim` (ör. `beklenenSonuc` varyantları), `altModelGecersizKilma` (senaryonun bir alt model değerini ezmesi, ör. `krediKarti`).

### `yapilandirma`
- `senaryo`: senaryoda (ve formda) ayarlanabilir. `eslesme.senaryo` zorunludur (alt modelde `eslesme.kart`). Bu alanların senaryo anahtarları sunucunun `JET_SEYAHAT_FORM_ALANLARI` listesi (`scripts/jet-seyahat-alanlari.mjs`) ve TS senaryo tipiyle AYNI olmalı. Koruma testi (d) bunu kontrol eder.
- `urun`: ürün verisinde sabittir. Tüm senaryolar paylaşır, formda yoktur.
- `turetilmis`: başka bir değerden hesaplanır (ör. bitiş tarihi = bugün + `seyahatSuresiGun`).
- `sabit`: kodda sabittir.
- `cikti` / `aksiyon`: ekran okuma ya da buton. Veri tutmaz.
- `dokunulmuyor`: ekranda var ama test hiç dokunmuyor (crawler bulunca eklenir).
- `harici`: senaryo JSON'unda değil, başka bir dosyada tutulur (ör. `kosuyaDahil` → `tests/data/kosu-listesi.json`).

### `form`
Dashboard formundaki karşılık. `id` ana kontrolün id'sidir. Radyo gruplarında bu değer `name` olur. Bir model alanını birden fazla form kontrolü besliyorsa (hazır profil/yeni kimlik radyosu, profil select'i, düzenleme formundaki başlık) diğerleri `yardimciKontroller` altına yazılır. `kontrol` değerleri: `select`, `text`, `number`, `checkbox`, `radio`, `file`, `password`, `textarea`. Koruma testi (e), formdaki her `input/select/textarea` kontrolünün modelde bulunmasını, modeldeki her `form.id` değerinin de formda bulunmasını ister. Kontrol türlerini, sabit seçenek listelerini ve kapsam/alternatif sabitini de karşılaştırır. Düğmeler ve bilgi alanları bu kontrole dahil değildir.

### Koşul dili
`{ "alan": "<id>", "esit": <değer> }`, `{ "alan": "<id>", "icinde": [..] }`, `{ "senaryoAyari": "<senaryoDuzeyi id>", "esit": <değer> }`, `{ "ve": [...] }`, `{ "veya": [...] }`, `{ "degil": <ifade> }`, `{ "acente": { "alanSeti": "tam" } }` (hedef, bugün veride yok), `{ "calismaZamani": "gorunurse" }` (POM çalışma anında bakıyor; bilinen durumlar `bilinenDurumlar` altında).

Yükleyici, her `alan`, `senaryoAyari` ve adlandırılmış `kosul` başvurusunun modelde karşılığı olduğunu kontrol eder.

### Doldurucular
Genel doldurucunun `tip` + `doldurucu` ile seçeceği adlandırılmış işleyiciler: `secimGerekirse`, `secim`, `okluSecim`, `metinDoldur`, `tuslayarakYaz`, `tarihJs`, `telefonTuslama`, `onayKutusuZorla`, `radyoZorla`, `dosyaYukle`, `tcSorgulu`, `musteriSorgula`. Karmaşık davranışlar (AJAX bekleme, sıra zorunluluğu) işleyicinin içinde kalır. Model yalnızca işleyicinin adını ve parametrelerini taşır.

## Senaryo verisi kuralları (modelle birlikte gelenler)

- `odemeAdimiDahil` **her senaryoda zorunludur** ve varsayılanı yoktur. Eksikse `beklenenSonucuCoz` (TS) hata fırlatır. Sunucu `/senaryo-getir` ve `/senaryo-guncelle` isteklerinde 422 döner.
- `beklenenSonuc` yoksa `{ "tip": "basarili" }` kabul edilir.
- Eski `beklenenHataMesaji` / `beklenenHataAdimi` alanları artık desteklenmiyor. TS ve sunucu bu alanları reddeder.

## Model değişince

1. Modeli güncelle.
2. `npm run test:birim` çalıştır. Kalan farklar ya kodda ya veride gerçek bir tutarsızlıktır. Testi gevşetme; farkı düzelt ya da ilgili kontrolü gerekçesiyle `test.fixme` yap.
3. `npm run typecheck` çalıştır.
