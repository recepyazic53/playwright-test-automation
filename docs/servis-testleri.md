# Servis testleri (SOAP)

Nöbetçi'de ekran testlerinin yanında SOAP servis testleri. Servis kayıtları, senaryoları ve raporları ekranlardan **ayrıdır**.
Üstteki Sonuçlar ve Koşuyu başlat yalnız ekranlar içindir.

## Nerede

- Sol panel **ÜRÜNLER** → `1 · Ekranlar`, `2 · Servisler`. Paneldeki `Servis ekle` bağlantısı yeni servis ekler.
- Servis sayfasının sekmeleri:
  - **Senaryolar:** liste, Dene, düzenleyici.
  - **Akışlar:** sonraki aşama; ör. önce token al, sonra çağır.
  - **Sözleşme:** operasyon / uç başına yanıt sözleşmesi (aşağıda).
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

Gövdede yalnız parametre adı durur, SoapUI'deki gibi: `<IdentityNumber>${MUSTERI_TC}</IdentityNumber>`.
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

Değeri bulunamayan parametre, nedeniyle birlikte hata verir. Örnek: `MUSTERI_TC ("Bireysel kişi" türü, "musteri" rolü için profil seçilmedi)`.
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
- **★ servis varsayılanı:** bir alanın değeri servis varsayılanı yapılır (ör. `IdentityNumber` → `${MUSTERI_TC}`); yeni senaryolar bu değerlerle açılır.
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

## Taban adresleri toplu düzenleme

Ayarlar > Proje ve ortamlar > Servis taban adresleri: satır = servis, sütun = ortam. Hücre: özel adres, ortamın adresi ya da "bu ortamda yok" (eski tam adres ayarı salt okunur gösterilir).

- **Taban adres adı:** Aynı sunucuyu paylaşan servisler bir ada bağlanır (`ayarlar.tabanGrubu`). Addaki servislerin her ortamdaki adresi aynı olmalı; bir hücre değişince o ada bağlı tüm servisler birlikte değişir. Ayrı tablo yoktur, adresler servisin şifreli ayarlarında kalır; koşu değişmedi, göç gerekmedi.
- **Toplu işlemler:** Bul-değiştir (ortam seçilebilir; seçili satırlarda, seçim yoksa tümünde), seçilenlere adres ata, seçilenleri bir ada bağla.
- **Etki önizlemesi:** Hangi servisler, kaç senaryo ve akış etkilenir, eski → yeni adresler. Yalnız "Onayla ve kaydet" ile yazılır (`POST /platform/servis-tabanlari/uygula`, `onay: true`).
- **Denetim:** Adres http(s) olmalı ve yasak adres kalıplarına (Ayarlar > Güvenlik) uymamalı. Erişim kontrolü yapılmaz (dış istek yok). Adresi değişen ortamın eski erişim kaydı silinir; düzenlenen hücrede eski tam adres ayarı kalkar.

## Hesaplama kuralları (tarih kuralları dahil)

Servis > Parametreler > Hesaplama kuralları. Kural: `AD = ifade | biçim` (ayar adı geriye uyum için `tarihKurallari`; eski `bugun+1y|yyyy-MM-dd` kuralları aynen çalışır). Ayrıştırıcı `scripts/platform/servisler/hesap-kurallari.mjs` (eval yok).

- **İfade:** `${Parametre}` / `${Tablo.Sütun}`, `${akis:Ad}`, başka kural adı; `+ - * / %`, parantez, `= != < > <= >=`; süre `1y 3a 10g 2s`; `bugun`, `simdi`; fonksiyonlar `yuvarla, asagiYuvarla, yukariYuvarla, mutlak, min, max, uzunluk, birlestir, buyukHarf, kucukHarf, parca, eger, bosIse, tarih, gunFarki, sayi`.
- **Örnekler:** `${Tutar} / 100` · `yuvarla(${Toplam} * 1.18, 2) | #,##0.00` · `BEGIN_DATE+1y | yyyy-MM-dd` · `eger(${Tip} = 'T', ${VergiNo}, ${TcNo})` · `birlestir(${Ad}, ' ', ${Soyad})`.
- **Zincir:** `END_DATE = BEGIN_DATE+1y` bitişi başlangıca bağlar; aynı koşuda her kural bir kez hesaplanır (aynı an). Döngü, tanımsız ad, bilinmeyen fonksiyon kayıtta reddedilir; koşuda sayı olmayan değer / sıfıra bölme açık hatayla (gizli değerler maskeli).
- **Bağlama:** Metot alanları tablosunda alan bir kurala bağlanır (`alanBaglari[op][yol] = { kural }`; tarih alanlarında kurallar üstte, "+ Yeni kural…" canlı önizlemeli). Yeni senaryolarda alan kaynağı "Hesaplama kuralı" olur; mevcut senaryolardaki seçim değişmez.
- **Satır içi:** `${hesap: ifade | biçim}` (senaryo formunda "Satır içi hesap"); JSON gövdede tırnaksız yazılan sonuç sayı olarak gider.

## Postman aktarımı (REST)

Servis ekle > Postman koleksiyonu. Postman Collection v2.1 (v2.0 da olur) JSON; isteğe bağlı ortam dosyası (environment JSON). Dosyalar yalnız okunur, istek atılmaz; önizlemeden sonra kullanıcının seçimiyle kaydedilir.

- **Klasör → servis** (tür `rest`). Alt klasörlerin istekleri üst klasörün servisine girer (başlık `Alt / İstek`). Klasörsüz istekler koleksiyon adıyla tek serviste toplanır. Aynı anahtarlı REST servisi varsa senaryolar ona eklenir (aynı başlık atlanır); SOAP servisi varsa o klasör alınmaz.
- **İstek → senaryo.** Senaryoda `http: { metot, yol, icerikTuru }` (yol servis yoluna göredir, sorgu dahil), başlıklar ve gövde. Operasyon adı `METOT /yol`. Kontrol: test betiğindeki `pm.response.to.have.status(N)` → durumKodu, `pm.expect(pm.response.text()).to.include("x")` → icerir; yoksa `durumKodu 200-299`.
- **Adres.** Adresin başındaki değişken (`{{baseUrl}}`) ana makinedir: tabloya girmez; çözülen kökeni önizlemede bir ortamın taban adresi yapılabilir. Servis yolu isteklerin ortak dizinidir.
- **Değişkenler** (`{{ad}}`; ortam dosyası koleksiyonu ezer) bir test verisi tablosunun sütunları olur (`${Tablo.ad}`); değerler tek satıra yazılır (ortamı seçilir). Önizlemede her değişken için "Akış değeri" seçilebilir: `${akis:ad}` olur (ör. betikle atanan token → oturum akışı).
- **Gizli değerler.** Postman `secret` tipi ya da adı gizli ad listesinde / token, password, parola, secret, key, authorization içeren değişkenler gizli sütun olur. Değer yalnız kullanıcı önizlemede "Şifreli kaydet" işaretlerse şifreli yazılır; yoksa boş kalır. Önizleme yanıtı gizli değer içermez. İstekte düz yazılmış sırlar (Authorization / X-Api-Key başlığı, bearer / apikey yetkisi, gizli adlı sorgu parametresi ya da JSON alanı) değişkene çevrilir.
- **Yetki:** bearer → `Authorization: Bearer …`, apikey → başlık ya da sorgu (miras: istek > klasör > koleksiyon).
- **Desteklenmeyenler** uyarı olarak gösterilir: istek öncesi / test betiklerinin geri kalanı, form-data ve dosya gövdesi, basic / digest / oauth yetkileri, `{{$guid}}` gibi dinamik değişkenler (`{{$isoTimestamp}}` tarih ifadesine çevrilir), Postman v1.

REST koşusu: gövdedeki değerler içerik türüne göre kaçışlanır (JSON / form / XML), yoldaki değerler URL kodlanır; Content-Type içerik türünden yazılır. Yanıtta `jsonEsit` kontrolü (`yol: data.id`) ve akışta `json` okuması kullanılır. REST servisinde WSDL olmadığından erişim kontrolü istenmez.

## Kod

| Dosya | İçerik |
|---|---|
| `scripts/platform/servisler/servis-deposu.mjs` | Tablolar (göç 9): `servisler`, `servis_senaryolari`, `servis_kimlikleri`, `servis_kosulari` |
| `scripts/platform/servisler/soap-istemcisi.mjs` | Parametre doldurma, HTTP/SOAP isteği, WSDL, kontroller |
| `scripts/platform/servisler/soapui-ice-aktarma.mjs` | SoapUI okuyucu |
| `scripts/platform/servisler/postman-ice-aktarma.mjs` | Postman koleksiyonu okuyucu |
| `scripts/platform/servisler/rest-istemcisi.mjs` | REST isteği |
| `scripts/platform/servisler/taban-adresleri.mjs` | Taban adresleri toplu düzenleme (önizleme → onay) |
| `scripts/platform/servisler/servis-islemleri.mjs` | Erişim kontrolü, kayıt, parametre çözümü, Dene / koşu |
| `scripts/platform/servisler/servis-uclari.mjs` | HTTP uçları |
| `scripts/platform/arayuz/servisler.js` | Arayüz |

Testler (sahte SOAP sunucusu, 127.0.0.1): `tests/birim/servis-testleri.spec.ts`, `tests/birim/servis-uclari.spec.ts`.

## Yanıt sözleşmesi

Servis sayfasının **Sözleşme** sekmesinde her operasyon (REST'te uç) için yanıtın beklenen yapısı tanımlanır. Hiçbir kaynak ağ isteği atmaz.

- **Kaynaklar:** WSDL / XSD (kayıtlı WSDL'deki yanıt öğesi ya da yüklenen dosyalar), OpenAPI / Swagger (yerel JSON / YAML; yalnız başarılı yanıt şeması, belge içi `$ref` çözülür, dış `$ref` indirilmez), JSON Schema (dosya ya da yapıştırma), **başarılı yanıttan taslak** (seçilen kayıtlı başarılı yanıtlardan: zorunlu = tüm örneklerde var, null görüldüyse null izinli; tek örnekte zorunluluk kesin değildir uyarısı).
- **Önizleme / taslak** alan alan düzenlenir (tür, zorunlu, null izinli, kaldır); "Onayla ve kaydet" ile servis ayarlarına (kasada şifreli) yazılır. Var olan sözleşmeyi değiştirmek ve silmek onay ister (fark gösterilir); değişiklikler geçmişe yazılır.
- **Senaryo:** "Yanıt sözleşmeye uymalı" (varsayılan kapalı). Açıkken yanıt doğrulanır; uyumsuzluk senaryoyu kaldırır. Rapor: `Sözleşme: Kaldı — N uyumsuzluk` ve yol bazında liste — SOAP'ta XML yolları (`/SiparisResponse/Kalemler/Kalem[2]/Adet: zorunlu alan yok`), REST'te JSON yolları (`response.orderId: sayı bekleniyordu, metin geldi`). Mesajlar değer içermez; gizli değerler maskelenir.
- Desteklenen alt küme: `type` (dizi ve `null` dahil), `required`, `properties`, `items`, `enum`, `nullable`, `format` (date, date-time, email), `anyOf` / `oneOf`, `allOf` (birleştirilir). Fazla alan uyumsuzluk sayılmaz.

## Yetki hatasında (401 / 403)

Oturum akışı ya da token adımı olan akışlarda "Yetki hatasında (401 / 403)" seçimi: **Tekrar deneme** ya da **Token'ı yenile, bir kez tekrar dene**. Akışta seçilmediyse Ayarlar > Koşu'daki genel değer kullanılır (varsayılan: Tekrar deneme).

- Açıkken istek 401 / 403 dönerse oturum akışı / akıştaki token adımı yeniden çalışır ve istek **bir kez** tekrarlanır. İlk deneme ayrı sonuç olarak kaydedilmez; raporda not görünür: "401 alındı, token yenilendi, tekrar denendi". İkinci deneme de 401 / 403 ise sonuç olduğu gibi değerlendirilir (not: "tekrar da 401 döndü").
- Yalnız HTTP durum kodu dikkate alınır (SOAP Fault içeriği yetki hatası sayılmaz).
- Tekrar da "Servis istekleri" iznine tabidir (aynı çalıştırmanın parçasıdır).
- Bu ayardan önce kaydedilmiş oturum akışları o zamanki davranışı korur (bir kez yenileyip tekrar dener); düzenleyicide öyle görünür.
