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
- **Adres:** ortamın taban adresi + servisin yolu. Servis gerekirse ortama özel tam adres verebilir.
- **Senaryo kapsamı:** `test`, `canli` ya da `ikisi`. Uymayan ortamda koşmaz.
- **Yalnız TEST'te koşan operasyonlar:** İşlemler sekmesinde işaretlenir (ör. Approve). Bunlar CANLI'da hiç çağrılmaz.

## Parametreler

Gövdede yalnız parametre adı durur, SoapUI'deki gibi: `<CitizenshipNumber>${SIGORTALI_TC}</CitizenshipNumber>`.
Değer sırası:

1. **Tarih kuralı** (servis, Parametreler sekmesi).
   - Örnek: `BEGIN_DATE = bugun|yyyy-MM-dd'T'HH:mm:ss`, `END_DATE = bugun+1y|…`.
   - Birimler: `y` yıl, `a` ay, `g` gün.
   - Gövdede doğrudan da yazılabilir: `${tarih:bugun+60g|dd.MM.yyyy}`.
2. **Giriş bilgisi profili** (kasada şifreli; değerler ekranda gösterilmez).
   - Adlı profiller, ör. "Kanal 100": `USERNAME`, `PASSWORD`, `CHANNEL`.
   - Servis bir profil seçer; senaryo ezebilir.
   - Profil tüm ortamlar için genel değer taşır. Ortama özel satır, ör. CANLI'da farklı parola, alan alan ezer.
3. **Test verisi.** Ayarlar > Test verisi > tür > alan > **Servis parametreleri** alanına `SIGORTALI_TC:sigortali, SIGORTA_ETTIREN_TC:ettiren` yazılır.
   - Rol, aynı türün farklı kişileri için ayrı profil seçmeye yarar.
   - Servisin Parametreler sekmesinde her tür + rol için profil seçilir; senaryo ezebilir.
   - Bir parametre adı projede tek bir alana eşlenebilir.

Değeri bulunamayan parametre, nedeniyle birlikte hata verir. Örnek: `SIGORTALI_TC ("Özel kişi" türü, "sigortali" rolü için profil seçilmedi)`.
Raporda parola ve hassas test verisi maskelenir (`***`).

## Senaryo düzenleyici: alan formu

- Erişim kontrolünde (ve İşlemler > "WSDL'den yeniden al") WSDL şemasından her operasyonun istek alanları alınır: grup, tip (metin / sayı / evet-hayır / tarih / tarih-saat / liste), zorunluluk.
- Senaryo düzenleyicide **Alanlar** sekmesi: her alan için değer kaynağı — Parametre (test verisi / giriş bilgisi / tarih kuralı listesinden), Sabit değer (tipe göre giriş: evet/hayır, tarih, liste), Boş gönder (`<A/>`), Boş (nil), Gönderme.
- **★ servis varsayılanı:** bir alanın değeri servis varsayılanı yapılır (ör. `CitizenshipNumber` → `${SIGORTALI_TC}`); yeni senaryolar bu değerlerle açılır.
- **Gövde (XML)** sekmesi ileri kullanım içindir. Form gövdeyi tam temsil edemezse (şemada olmayan / tekrar eden öğe) neden gösterilir ve XML görünümünde kalınır; veri kaybolmaz.
- Kaydedilen gövde yine SOAP XML'idir (koşucu, SoapUI aktarımı, raporlar aynı).

## Test verisi eşlemesi (Ayarlar > Test verisi)

Alan satırında **Servis parametreleri**: servis seçilir → o servisin senaryolarında geçen parametrelerden biri seçilir (eşlenmemişler önce) ya da "Elle yaz…"; rol addan tahmin edilir (`SIGORTALI_…` → sigortali, `SIGORTA_ETTIREN_…` → ettiren). Eşleme parametre adına göredir: aynı ad tüm servislerde bu alandan dolar.

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
