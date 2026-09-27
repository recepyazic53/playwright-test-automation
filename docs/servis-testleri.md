# Servis testleri (SOAP)

Nöbetçi'de ekran testlerinin yanında SOAP servis testleri. Servis kayıtları, senaryoları ve raporları ekranlardan **ayrıdır**.
Üstteki Sonuçlar ve Koşuyu başlat yalnız ekranlar içindir.

## Nerede

- Sol panel **ÜRÜNLER** → `1 · Ekranlar`, `2 · Servisler`. Paneldeki `Servis ekle` bağlantısı yeni servis ekler.
- Servis sayfasının sekmeleri:
  - **Senaryolar:** liste, Dene, düzenleyici.
  - **Akışlar:** sonraki aşama; ör. önce token al, sonra çağır.
  - **Parametreler**
  - **Raporlar:** servis koşuları.
  - **İşlemler:** ayarlar, silme.

## Kurallar

- **Erişim kontrolü ve Dene yalnız TEST'te.** TEST, ortam ayarında "canlı" işaretli olmayan ortamdır. Arayüz her istekten önce hangi ortama ve adrese gidileceğini sorar.
- **Yeni servis ancak başarılı erişim kontrolünden sonra kaydedilir.**
  - Kontrol, WSDL'i ister: `GET <adres>?wsdl`.
  - Kontrol 30 dakika geçerlidir.
  - Yol ya da ortama özel adres değişirse kontrol yeniden gerekir.
- **Adres:** servisin o ortamdaki taban adresi + yol (bkz. Servis ekle sihirbazı).
- **Senaryo kapsamı:** `test`, `canli` ya da `ikisi`. Uymayan ortamda koşmaz.
- **Yalnız TEST'te koşan operasyonlar:** İşlemler sekmesinde işaretlenir (ör. Approve). Bunlar CANLI'da hiç çağrılmaz.

## Parametreler

Gövdede yalnız parametre adı durur, SoapUI'deki gibi: `<CitizenshipNumber>${MUSTERI_TC}</CitizenshipNumber>`.
Değer sırası:

1. **Tarih kuralı** (servis, Parametreler sekmesi).
   - Örnek: `BEGIN_DATE = bugun|yyyy-MM-dd'T'HH:mm:ss`, `END_DATE = bugun+1y|…`.
   - Birimler: `y` yıl, `a` ay, `g` gün.
   - Gövdede doğrudan da yazılabilir: `${tarih:bugun+60g|dd.MM.yyyy}`.
2. **Giriş bilgisi profili** (kasada şifreli; değerler ekranda gösterilmez).
   - Adlı profiller, ör. "Kanal 100": `USERNAME`, `PASSWORD`, `CHANNEL`.
   - Servis bir profil seçer; senaryo ezebilir.
   - Profil tüm ortamlar için genel değer taşır. Ortama özel satır, ör. CANLI'da farklı parola, alan alan ezer.
3. **Test verisi.** Ayarlar > Test verisi > tür > alan > **Servis parametreleri** alanına `MUSTERI_TC:musteri, KEFIL_TC:kefil` yazılır.
   - Rol, aynı türün farklı kişileri için ayrı profil seçmeye yarar.
   - Servisin Parametreler sekmesinde her tür + rol için profil seçilir; senaryo ezebilir.
   - Bir parametre adı projede tek bir alana eşlenebilir.

Değeri bulunamayan parametre, nedeniyle birlikte hata verir. Örnek: `MUSTERI_TC ("Özel kişi" türü, "musteri" rolü için profil seçilmedi)`.
Raporda parola ve hassas test verisi maskelenir (`***`).

## Servis ekle sihirbazı

Servisler > Servis ekle > **Adım adım**:

1. **Adresler:** servis adı; her ortam için **taban adres** (adresin başı). Ortamın listesinden seçilir ya da yenisi yazılır; yeni yazılan adres ortama kaydedilir ve sonraki servislerde listede hazır olur. CANLI için "Bu ortamda yok" seçilebilir; servis o ortamda koşmaz. Tam adres yapıştırılırsa taban + yol kendiliğinden ayrılır.
2. **Metotlar:** yol (tüm ortamlarda aynı) + **Denetle** (TEST'e WSDL isteği, onayla). Metotlar listelenir, istenenler seçilir. Kayıt / belge üreten metotlar (Approve, Print…) "CANLI'da çağrılmasın" işaretli gelir.
3. **Parametreler:** seçilen metotların alanları; her alan için varsayılan değer kaynağı. Öneriler hazır gelir: Username / Password / Channel → giriş bilgisi; BeginDate / EndDate → tarih kuralı; başka serviste ★ yapılmış alan adları. Bunlar servis varsayılanı (★) olur.
4. **Giriş bilgisi:** kayıtlı profil / yeni profil (kasada şifreli) / yok.
5. **Özet → Kaydet.**

Adres = taban adres + yol, metin olarak birleştirilir: tabanın kendi yolu korunur (`https://x.com/api/` + `/a.asmx` → `https://x.com/api/a.asmx`). Mevcut servisler etkilenmez (taban tanımlı değilse ortamın asıl adresi kullanılır). Servisin İşlemler sekmesinde taban adresler aynı seçimle değiştirilir.

## Senaryo düzenleyici: alan formu

- Erişim kontrolünde (ve İşlemler > "WSDL'den yeniden al") WSDL şemasından her operasyonun istek alanları alınır: grup, tip (metin / sayı / evet-hayır / tarih / tarih-saat / liste), zorunluluk.
- Senaryo düzenleyicide **Alanlar** sekmesi: her alan için değer kaynağı — Parametre (test verisi / giriş bilgisi / tarih kuralı listesinden), Sabit değer (tipe göre giriş: evet/hayır, tarih, liste), Boş gönder (`<A/>`), Boş (nil), Gönderme.
- **★ servis varsayılanı:** bir alanın değeri servis varsayılanı yapılır (ör. `CitizenshipNumber` → `${MUSTERI_TC}`); yeni senaryolar bu değerlerle açılır.
- **Gövde (XML)** sekmesi ileri kullanım içindir. Form gövdeyi tam temsil edemezse (şemada olmayan / tekrar eden öğe) neden gösterilir ve XML görünümünde kalınır; veri kaybolmaz.
- Kaydedilen gövde yine SOAP XML'idir (koşucu, SoapUI aktarımı, raporlar aynı).

## Test verisi eşlemesi (Ayarlar > Test verisi)

Alan satırında **Servis parametreleri**: servis seçilir → o servisin senaryolarında geçen parametrelerden biri seçilir (eşlenmemişler önce) ya da "Elle yaz…"; rol addan tahmin edilir (`MUSTERI_…` → musteri, `KEFIL_…` → kefil). Eşleme parametre adına göredir: aynı ad tüm servislerde bu alandan dolar.

## SoapUI aktarımı

Servis ekle > SoapUI dosyasından. Dosya yalnız okunur, istek atılmaz.

- **Arayüz → servis.** Yol endpoint'ten, SOAPAction operasyondan alınır.
- **İstek adımı → senaryo.** Başlık adım adıdır. Doğrulamalar şöyle çevrilir:

  | SoapUI | Nöbetçi |
  |---|---|
  | `SOAP Response` | soapYaniti |
  | `Simple Contains` / `NotContains` | icerir / icermez |
  | `SOAP Fault` / `Not SOAP Fault` | soapHatasi / soapHatasiYok |
  | `Valid HTTP Status Codes` | durumKodu |

- **`${#TestCase#X}` → `${X}`.** Giriş bilgisi özellikleri ve gövdeye düz yazılmış `<Username>`, `<Password>`, `<Channel>` şöyle işlenir:
  - Durumda en çok geçen değer `${USERNAME}` gibi parametre olur ve onayla profile kaydedilir.
  - Farklı değer gönderen adım (bilerek başka kanal deneyen) kendi değerini korur ve not düşülür.
- **Groovy tarihleri** (`now.plusYears(1).format(...)` vb.) tarih kuralı olur.
- **Diğer özellikler** test verisinde eşlenmesi gereken parametre olarak listelenir; değerleri aktarılmaz.
- **Desteklenmeyenler** uyarı olarak gösterilir: Property Transfer, Groovy doğrulaması, başka adım çalıştıran Groovy.

## Kod

| Dosya | İçerik |
|---|---|
| `scripts/platform/servisler/servis-deposu.mjs` | Tablolar (göç 9): `servisler`, `servis_senaryolari`, `servis_kimlikleri`, `servis_kosulari` |
| `scripts/platform/servisler/soap-istemcisi.mjs` | Parametre doldurma, HTTP/SOAP isteği, WSDL, kontroller |
| `scripts/platform/servisler/soapui-ice-aktarma.mjs` | SoapUI okuyucu |
| `scripts/platform/servisler/servis-islemleri.mjs` | Erişim kontrolü, kayıt, parametre çözümü, Dene / koşu |
| `scripts/platform/servisler/servis-uclari.mjs` | HTTP uçları |
| `scripts/platform/arayuz/servisler.js` | Arayüz |

Testler (sahte SOAP sunucusu, 127.0.0.1): `tests/birim/servis-testleri.spec.ts`, `tests/birim/servis-uclari.spec.ts`.
