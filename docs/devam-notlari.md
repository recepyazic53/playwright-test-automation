# Nöbetçi — devam notları

Bu belge, projede çalışacak bir sonraki Claude Code oturumu (ya da geliştirici) için yazıldı. Proje sahibiyle
yapılan uzun bir çalışmanın **kararlarını, kurallarını ve kalan işlerini** özetler. İçinde parola, adres, kimlik,
kart ya da senaryo verisi **yoktur ve olmamalıdır**.

> Yeni oturuma başlarken: bu belgeyi baştan sona oku, sonra kullanıcıya kaldığı yeri ve sıradaki işi kısaca özetleyip
> onay iste. Aşağıdaki **Çalışma kuralları** bölümü bağlayıcıdır.

---

## 1. Amaç

Proje, bir sigorta acente portalının (ilk proje: "Galaksi") Playwright testleriyle başladı; artık **Nöbetçi** adında
**genel bir yerel test otomasyon platformuna** dönüştü:

- Uygulamada yeni ekran/alan eklendikçe otomasyon bunu **keşfeder** (ekran taraması veya Claude'un hazırladığı
  "sayfa paketi"), farkları **Bulgular** ekranında gösterir, kullanıcı onaylar; senaryo formu ve senaryolar buna göre
  güncellenir.
- Herkes kendi uygulaması için kullanabilir (ör. başka biri projeyi indirip kendi uygulamasının linkini verir).
- **Tüm veriler yalnızca kullanıcının bilgisayarında**, yerel ve şifreli bir veritabanında durur. Git'te yalnızca
  genel motor ve (şimdilik) Galaksi'nin test kodu vardır.

## 2. Mimari (kısa)

| Parça | Yer |
|---|---|
| Sunucu (yalnız 127.0.0.1) + API | `scripts/test-sunucu.mjs`, `scripts/platform/sunucu-platform.mjs` |
| Arayüz (Nöbetçi tasarımı, koyu/açık tema) | `scripts/platform/arayuz/*` (tasarım sistemi `stil.css`, ürün adı `ortak.js > MARKA`) |
| Veritabanı (sql.js/SQLite, sürümlü göçler) | `scripts/platform/veritabani/*` — dosya: `veri/platform.db` (git dışı) |
| Kasa (scrypt + AES-256-GCM, alan bazında) | `scripts/platform/kasa.mjs`; şifreli sütun listesi `SIFRELI_ALANLAR` (`gocler.mjs`) |
| Şifreli medya deposu | `scripts/platform/medya.mjs` — `veri/medya/` |
| Yedek (`.tayedek`, biçim 2, parçalı şifreli akış) + içe aktarma (önizle → seç → uygula) | `scripts/platform/yedek.mjs`, `ice-aktarma.mjs` |
| Çalışma alanları (ayrı DB + kasa) ve çoklu proje | `scripts/platform/calisma-alanlari.mjs`, `proje-yonetimi.mjs` — kayıt `veri/calisma-alanlari.json` |
| Sonuç raporlayıcısı (Playwright → DB + şifreli medya) | `scripts/platform/raporlayici.mjs` |
| Senaryolar (UUID, model güdümlü form, çalıştırma) | `scripts/platform/senaryolar/*` |
| Ekranlar, sayfa paketi, fark motoru, Bulgular | `scripts/platform/ekranlar/*`, biçim: `docs/sayfa-paketi.md` |
| Ekranı otomatik tara (salt okunur) | `scripts/platform/tarama/*` |
| Akışı kaydet (kullanıcı yürütür; görünür tarayıcı + toplayan sayfa paneli) + akış diyagramı oluştur | `scripts/platform/tarama/kayit-motoru.ts`, `kayit-paneli.ts`, `akis-tasarimi.mjs` (taslak, doğrulama, çeviri), `paket-olusturucu.mjs > kayitPaketiOlustur`, arayüz `arayuz/akis-tasarimi.js` |
| Genel giriş motoru (tarif, TOTP/SMS, bağlam adımları) | `tests/support/giris-motoru.ts`, `scripts/platform/giris/*` |
| Ortak doğrulayıcı (sunucu + test + form) | `scripts/dogrulama/*` |
| Model koşucusu (test kodu olmayan senaryolar) | `tests/support/model-kosucu.ts`, `tests/model-kosucu/*` |
| Genel model koşusu (elle oluşturulan proje/ortam; adaptörsüz) | `playwright.config.ts`, `tests/support/genel-veri.ts` |
| Testlerin veri erişimi (yalnız DB) | `tests/support/platform-veri.ts` |
| Galaksi'ye özgü kod ("proje eklentisi") | `projeler/galaksi/*`, `tests/scenarios/**`, `tests/support/pages/**` |
| Birim/koruma testleri (tarayıcısız + yerel fikstürler) | `tests/birim/*`, `npm run test:birim` |

Komutlar: `npm run baslat` (sunucu + tarayıcı), `npm run test:birim`, `npm run typecheck`,
`npm run test:test-ortami` / `test:canli` (terminal koşuları kasa parolasını gizli girişle sorar; çalışma alanı
`NOBETCI_CALISMA_ALANI` ya da son açılan).

## 3. Alınmış kararlar (değiştirmeden önce kullanıcıya sor)

**Veri ve gizlilik**
- Tüm proje verisi yerel DB'de; bulut/otomatik eşitleme/uzak veritabanı **yok**. Paylaşım yalnız elle tetiklenen,
  parolalı `.tayedek` dışa aktarma ile.
- Tek kasa parolası: DB'deki hassas alanları ve yedek dosyasını korur; unutulursa veri kurtarılamaz.
- Şifreli: giriş kullanıcı adı/parola/TOTP/SMS ayarı, ortam adları+linkleri, bağlam profili değerleri (acente kodları),
  test verisi profillerinin **tüm** alanları, makine adı, genel ayarlar, senaryo dosyaları, tüm medya (görüntü/video/trace).
  Açık: proje/ekran/senaryo başlıkları, ekran modelleri, hata mesajları, profil adları, çalışma alanı adları.
- Medya yalnız dashboard'dan (kasa açıkken) izlenir; "İndir" kullanıcının kontrolünde. Videolar 30 gün tutulur.
- Dışa aktarmada: ekran görüntüleri varsayılan dahil, video ve trace varsayılan hariç.
- İçe aktarma: "en yeni kazanır" YOK — önizleme (yeni / değişen / yalnız burada), kullanıcı seçer.
- Allure kaldırıldı; Playwright HTML raporu üretilmez.
- Claude API / ücretli kullanım **yok** (kullanıcı Max planında). Yorum için "Claude ile yorumla" sırsız analiz dosyası
  yazar; kullanıcı Claude Code'a verir.

**Senaryo ve ekran kurgusu**
- Genel kavramlar kullanılır (Galaksi terimleri motora girmez): acente → **bağlam profili**; "ödeme adımı" → **adım
  kapsamı** (isteğe bağlı adımlar); kart/TC → **test verisi profilleri**; beklenen sonuç: başarılı akış / adım bazlı
  iş kuralı hatası (toleranslı mesaj eşleşmesi, "Beklenen / Görülen").
- Bağlama göre değişen alanlar: form tüm alanları gösterir; koşuda **görünüyorsa doldur, görünmüyorsa atla**; atlananlar
  sonuçta "Atlanan / doldurulamayan alanlar" başlığında; kritik alanlar için "mutlaka görünmeli".
- **Akışı kaydet** (düğmeyle açılan adımlar için; kullanıcı kararı): akışı kullanıcı görünür tarayıcıda yürütür. **Topla →
  tasarla** (kullanıcı kararı, 2026-09-25): sayfadaki panel yalnızca TOPLAR (görülen alanlar listesi — kullanıcı işaretler,
  "Ekranı yeniden oku", basılan düğmeler, "Mesaj seç"); "Bitir"den sonra Nöbetçi'de **kayıttan hazırlanan taslak** akış
  diyagramı açılır (Alan grubu / Aksiyon / Beklenen mesaj / Bitir blokları, "+" ile ekleme, sağda yakalananlar; sürükle-bırak)
  ve kaydedilince sayfa paketine çevrilir. Eski "Bu adımı al" paneli kaldırıldı. Bastığı düğmeler siteye gerçek istek gönderir
  (başlatırken onay), **canlı işaretli ortamda kapalı** (Ayarlar > Ortamlar), en fazla bir bağlam profili; alan değerleri ve
  ekran görüntüleri kaydedilmez. Otomatik tarama salt okunur kalır. Kullanıcı kararlarıyla eklenenler: **Giriş yapmadan
  aç** (giriş gerektirmeyen sayfa; koşular da girişsiz), **alan açan düğme** sorusu (varsayılan: her senaryoda basılır;
  istisnaları kullanıcı işaretler → senaryoda "… dahil"), başarı göstergesinde **aranacak metni kullanıcı belirler**,
  **seçime göre değişen alanlar** (ekran okumalarından koşul otomatik). JetTrafik gerçek denemesinde: standart açılır listeler seçenekleriyle geldi, özel liste çıkmadı
  (özel açılır liste işi gerekmedi).
  (Ayrıntı: `docs/sayfa-paketi.md`.)
- Ekran keşfi iki yol: **Ekranı otomatik tara** (Playwright, hiçbir düğmeye basmaz/kaydetmez) veya **sayfa paketi**
  (Claude sohbette link üzerinden salt okunur inceler, paket üretir, kullanıcı yükler). Taramadan önce hangi bağlam
  profilleriyle taranacağı **her zaman kullanıcıya sorulur**.
- Koşu: "Koşuyu başlat" = tam koşu (kartları günceller); seçili/tekil koşular kartları etkilemez; birlikte başlatılanlar
  geçmişte tek satır; kullanıcının durdurduğu koşu "Durduruldu" (başarısız sayılmaz).
- Tasarım: "Nöbetçi" komuta merkezi görünümü (koyu öncelikli + açık tema), trend = yığılmış çubuk grafik. Kullanıcı
  sade/sıradan arayüzü beğenmez; yeni ekranlar bu tasarım sistemine uymalı.

## 4. Çalışma kuralları (bağlayıcı)

1. **Onay almadan değişiklik yapma.** Kullanıcı "öneri/ne dersin" diye sorduğunda önce açıkla; "uygula / evet /
   düzelt" deyince yap. Kararsız kaldığın her noktada tahminle ilerleme, **sor**.
2. **Kullanıcı yokken şirket sitesine (Galaksi TEST/CANLI) asla istek atma, gerçek test koşturma.** Doğrulamayı yerel
   fikstür uygulamaları ve geçici veritabanlarıyla yap; gerçek koşu gerektiren noktaları açıkça "denenmedi" diye bildir.
3. Kullanıcının gerçek verisine (`veri/platform.db`, `veri/medya`, `veri/yedekler`) doğrudan dokunma; testleri geçici
   kopyalarda/klasörlerde yap (`NOBETCI_VERI_KOKU`, `PLATFORM_VERITABANI`, ikinci sunucu portu). Şema göçü içeren
   bir güncellemeden önce DB'nin kopyasını al.
4. Git: commit/push yalnız kullanıcı isteyince; varsayılan dalda değilsen yeni dal aç; PR'ı kullanıcı GitHub'da
   birleştirir. **Push öncesi** git'teki tüm dosyalarda gizli bilgi taraması yap (gerçek adres, kullanıcı adı, TC,
   kart, acente kodu olmamalı). Git geçmişini yeniden yazma.
5. Veri silme, dosya kaldırma, `.env` silme gibi geri alınamaz işler için ayrıca açık onay al.
6. Yanıtlar Türkçe, sade ve teknik olmayan dille; kod açıklamaları Türkçe (bkz. `CLAUDE.md`).

## 5. Durum (bu belgenin yazıldığı an)

- `main` = platformun son hâli (PR #2). Mac'te gerçek Galaksi TEST üzerinde doğrulananlar: yeni giriş tarifi,
  sonuçların DB'ye ve şifreli medyaya yazılması, çoklu sorgu (ödeme bekleme süresi 90 sn yapıldı).
- **Windows doğrulandı (PR #4):** kurulum, birim testleri, yedek yükleme, gerçek TEST koşusu (sonuç + şifreli
  medya) ve Durdur çalışıyor. Bulunan hata: Node 22.12+ ile raporlayıcı açılışta yüklenemiyordu; raporlayıcı artık
  TypeScript giriş noktasından yüklenir (`tests/support/platform-raporlayici.ts`, koruma testi
  `tests/birim/raporlayici-yukleme.spec.ts`). **Node sürümü farkı:** Mac 22.11, Windows 24 — raporlayıcıyı yeniden
  doğrudan `.mjs` olarak verme; Mac'te Node güncellenirse de sorun çıkmaz.
- Windows notları: dosya izinleri (0600/0700) Windows'ta uygulanmaz (birim testlerinde `POSIX_IZINLERI`); VS Code'un
  Playwright eklentisi arka planda kendi `test-server` sürecini açık tutar, Nöbetçi'ye ait değildir.
- Açık dosyalar (eski veri klasörü, Excel) şifreli depoya taşındı ve silindi. `.env` hâlâ duruyor (artık kod kullanmıyor).
- Jet Satış ekranı kullanıcı tarafından devre dışı bırakıldı / silinecek (gereksiz test).

## 6. Kalan işler (kullanıcıyla kararlaştırılan sıra)

1. ~~**Windows doğrulaması**~~ — tamamlandı (PR #4; bkz. §5).
2. ~~**Yeni projelerde senaryoların koşması**~~ — yapıldı (yerel fikstürle doğrulandı; gerçek bir uygulamayla
   **denenmedi**, 3. işte birlikte denenecek). Aktarımla "test"/"canli" anahtarına eşlenmemiş ortamdaki model
   senaryoları Nöbetçi'den **genel yolla** koşar: `playwright.config.ts` + `tests/support/genel-veri.ts` +
   `veri-oku.mjs genel` (proje/ortam KİMLİKLERİYLE, adaptörsüz; giriş profili ve kayıtlı giriş tarifi ortamın kendisinden).
   Test kodu olmayan ekranda formdan yeni senaryo da oluşturulabilir (`icerik.kosucu = 'model'`). Koruma testi:
   `tests/birim/genel-model-kosusu.spec.ts`. Bilinçli sınırlar (kullanıcı kararı): yalnızca Nöbetçi'den başlatılır
   (terminal `npm run test` yok). Model senaryolarında "Dene" 2026-09-25'te eklendi (bkz. aşağıda "Nöbetçi geliştirmeleri").
3. **İlk gerçek tarama:** kullanıcı JetTrafik'te "Ekranı otomatik tara"yı denedi — düğmeyle açılan 2. adımın alanları
   görülemedi. Bunun için **Akışı kaydet** eklendi, sonra kullanıcı isteğiyle **topla → tasarla** biçimine çevrildi (panel
   toplar, diyagram Nöbetçi'de taslaktan kurulur; yerel fikstürle doğrulandı). Sıradaki: JetTrafik'te gerçek bir akış
   kaydı + kayıttan çıkan modelle bir senaryo koşusu (kullanıcıyla birlikte; **denenmedi**).
   **Senaryo akış diyagramı** (kullanıcı onaylı, 3 aşama; Nöbetçi görünümünde, dış kütüphane yok, dikey):
   Diyagramdan akış kurma (3c'nin çekirdeği) kayıt sonrasına taşındı ve yapıldı. ~~3a salt okunur~~ yapıldı — senaryo sayfasında "Akış diyagramı" sekmesi: akış modelden + formdaki GÜNCEL seçimlerden
   (`scripts/platform/senaryolar/akis-diyagrami.mjs`, arayüz `senaryo-diyagrami.js`), renkler seçili ortamdaki son
   koşudan (`GET /platform/senaryo/son-sonuc`; adımlar test.step başlığıyla eşlenir). Sırada 3b (diyagramdan o senaryonun
   adım verisini düzenleme), 3c (sürükle/ekle ile akış değişikliği = EKRAN düzeyinde: yeni model sürümü + etki uyarısı +
   onay; senaryoya özel akış yok).
   **Çoklu akış** (kullanıcı kararı, 2026-09-25; "ekran başına tek akış" kararının yerine): ekranın Akışlar sekmesi, varsayılan
   akış, yeni akış (boş / kopya), düzenle / varsayılan yap / sil, senaryo formunda akış seçimi, kayıttan "yeni akış / şu akışı
   güncelle". Bireysel/Tüzel gibi farklar TEK akışta (seçimi senaryo yapar, koşul otomatik; "Yol A") — seçimi akışa sabitleme
   YOK. Diyagramda alan başına Zorunlu / Görünürse doldur, Koşul düzenleme, Bekleme süresi bloğu. Yapıldı, yerel fikstürle
   doğrulandı; gerçek sitede **denenmedi**. Sonraki: mevcut ürünlerin senaryoları için akışları oluşturmak (kullanıcı istedi).
   ~~Ekran görüntüsü alma ara sıra donuyor~~ — düzeltildi (2026-09-25; bkz. "Nöbetçi geliştirmeleri").
4. **Galaksi ürünlerini model koşucusuna taşımak** (ürün ürün, JetSeyahat'ten başla; eski test ile yan yana
   karşılaştır, sonuçlar aynıysa eski kodu kaldır).
   **JetSeyahat (akış) — 1. aşama yapıldı** (kullanıcı kararı: JetTrafik yerine JetSeyahat; mevcut JetSeyahat ekranı ve
   kodlu testi DEĞİŞMEZ, ayrı ekran). Paket koddan üretilir: `projeler/galaksi/jetseyahat-akis.mjs`, çıktı
   `node scripts/jetseyahat-akis-paketi.mjs` → `Claude outputs/jetseyahat-akis.paket.json` (kullanıcı Sayfa ekle > Paket
   yükle ile yükler). Koşucuya eklenen genel özellikler: sabit / göreli değer (`sabitDeger`, tarihte `bugun+7`), kimlik
   profili açılımı (hazır profil ya da senaryoya özel kimlik → doğum tarihi / telefon / T.C.-VKN alt alanları), alan sonrası
   `tus` / `tikla` / `bekle {durum: dolu}`, gizli çizimli radyo / onay kutusu (`radyoZorla`, `onayKutusuZorla`),
   `secimGerekirse`, başarı göstergesi `desen`; boş bırakılan alan modelin varsayılanını alır (koşullar da). Doğrulayıcıda
   "dosya + kişi sayısı birlikte" kuralı yalnız iki alanı taşıyan modelde; mesaj eşleşmesinde ı→i (ekrandaki "COVID" ile
   yazılan "covid" eşleşir — kodlu testleri de etkiler). Koruma testi: `tests/birim/jetseyahat-akis.spec.ts` (JetSeyahat
   benzeri yerel fikstür). Sınırlar: ÖDEME YOK (2. aşama: ortak akış olarak); kayak seçicisi ve acenteye göre görünen
   alanlar TEST'te doğrulanmalı; ülke / plan / iptal bedeli seçenekleri kısmi. Gerçek TEST'te **denenmedi**.
   **2026-09-25 güncelleme:** kullanıcı TEST'te ilk senaryoyu başarıyla koştu. Sonra Claude TEST ekranını (kullanıcının
   oturumuyla) inceledi. Listeler `projeler/galaksi/jetseyahat-secenekler.mjs`'e alındı; alternatif ve ülke kapsama bağlı.
   İptal bedeli `#Bedel_Select` (yalnız SEYAHAT PAKET), kayak `#kayak`. Hesapla'nın doğrulama mesajları tarayıcı uyarısı
   (alert) çıkıyor; koşucu artık bunları yakalıyor ve akışa "Uyarı" olarak eklendiler. Ekran silinip paket yeniden
   yüklendi (kullanıcı onayıyla). Akışta Başarı/Uyarı mesajları, VEYA grubu ve senaryonun akıştaki uyarılardan seçmesi
   eklendi. Tekrar analiz artık bağlı listeye dönen seçenekleri "kaldırıldı" saymıyor; ama seçici ve bağımlılık
   değişikliklerini hâlâ taşımıyor. Kodlu JetSeyahat ekranında akış düzenlenemez (seçicisiz alanlar); akışlar
   "JetSeyahat (akış)"ta. Bitince git'te Galaksi'ye özgü kod neredeyse kalmaz
   (alternatif: Galaksi kodunu ayrı gizli depoya taşımak — kullanıcı projeyi başkasına vermeden önce).
   **Nöbetçi geliştirmeleri (dal `nobetci-gelistirmeler`, 2026-09-25; kullanıcı onaylı liste; yerel fikstürle doğrulandı,
   gerçek sitede denenmedi):**
   - Ekran görüntüsü donması: görüntüler sayfa başına sırayla ve süre sınırıyla alınır (`tests/support/screenshots.ts`);
     tam sayfa alınamazsa görünen alan, o da olmazsa rapora "(ekran görüntüsü alınamadı)" yazılır; koşu takılmaz.
   - **Modeli değiştir:** ekranın "Paket yükle" sayfasında "Tekrar analiz / Modeli değiştir" seçimi. Değiştir: paket yeni
     model sürümü olur; senaryolar ve varsayılan dışı akışlar (kullandıkları koşul / ayarlarla) korunur; önce etki gösterilir
     (`ekran-servisi.mjs > modeliPaketleDegistir`, `POST /platform/ekran/model/degistir`).
   - **Dene (model senaryoları):** kaydedilmemiş taslak geçici dosyayla koşar, senaryo yazılmaz (`senaryo-servisi.mjs >
     modelDenemePaketi`, `test-sunucu.mjs > modelDene`).
   - **Ortak akışı düzenleme:** ortak akışın Akışlar sekmesinde "Düzenle" (tek akış; yeni akış / kopya / içine ortak akış
     yok). Kaydederken onu kullanan ekranlar etki olarak gösterilir. Diyagramda görünmeyen adım ayarları (hata penceresi,
     öğe "veya" göstergesi, bölüm kimlikleri) mevcut adımdan korunur. "Ekranlara ekle…": seçilen ekranların varsayılan
     akışının sonuna eklenir (varsayılan: isteğe bağlı, mevcut senaryolar etkilenmez).
   - Akış tasarımında kaydedilmemiş değişiklikle sayfadan çıkarken onay istenir.
   - Kararlar: CANLI'da gerçek kart işareti gerekmiyor ("hiç bir zaman gerçek kart kullanılmayacak"); diyagramdan senaryo
     düzenleme (3b) ertelendi.
   **JetDASK (akış) — 1. aşama (koddan) yapıldı** (2026-09-25, dal `jetdask-akis`, commit yok): `projeler/galaksi/jetdask-akis.mjs`,
   çıktı `node scripts/jetdask-akis-paketi.mjs` → `Claude outputs/jetdask-akis.paket.json` (ödeme ortak akışıyla; Nöbetçi'de ödeme
   ortak akışı yüklü olmalı). Sigortalı özel / tüzel / pasaport (kimlik profili; türe göre doğum tarihi, uyruk, sorgu düğmesi),
   UAVT, tapu, poliçe, prim, ödeme. Koşucuya genel ek: `bekle.icermez` (sorgu sürerken "Aranıyor" dolu sayılmaz). Koruma testi:
   `tests/birim/jetdask-akis.spec.ts` (yerel fikstür). Eksik: açılır listelerin seçenekleri (kodda yok; TEST ekranından
   okunacak — kullanıcı oturumu + onayı), "bulunduğu kat" TEST'te eksik seçenek, sunucu hata göstergesi. Senaryolar henüz yok
   (kodlu 6 kombinasyon: 3 kimlik tipi × 2 sıfat; değerleri şifreli test verisinde — kasa açılınca taşınacak).
   **Diğer ürünler koddan (2026-09-26, dal `jetdask-akis`, commit yok):** JetSağlık, JetKOBİ, JetKonut, JetİlkAteşKonut, JetKasko
   paketleri (`projeler/galaksi/<ürün>-akis.mjs`, `scripts/<ürün>-akis-paketi.mjs`, yerel fikstür + e2e testleri). Ödeme ortak
   akışları `projeler/galaksi/odeme-akis.mjs`'te: "Ödeme (kredi kartı)" (JetSeyahat, JetDASK, JetKasko), "Ödeme (teklif kaydet +
   kredi kartı)" (JetKOBİ, JetKonut, JetİlkAteşKonut), "Ödeme (doğrudan kart formu)" (JetSağlık). Hepsi kullanıcının Nöbetçi'sine
   yüklendi (onaylı; senaryosuz). Listelerin seçenekleri TEST ekranından okunacak.
   **Koşucu:** her alandan sonra alanın başlattığı XHR / fetch istekleri bitene kadar otomatik bekleme (en çok 8 sn;
   `ALAN_SONRASI_EN_COK_MS`); oklu seçimde `yanitBekle` (JetSeyahat ülke listesi — TEST'te ülkenin silinmesi buydu, düzeldi,
   kullanıcı doğruladı). **Akış tasarımı:** grup içi sıra (sol üstte numara, ↑/↓, alanın üstüne bırakınca önüne); modelde sıra
   diyagramdakiyle aynı (bölümler ardışık parçalanır).
   **Kodlu senaryoları akışa taşı** (kullanıcı onaylı yöntem): `scripts/platform/senaryolar/akis-tasima.mjs` (genel; önizleme =
   senaryo kaydıyla aynı doğrulama, yazılıp geri alınır), adaptör kancası `akisSenaryoTaslaklari` / `akisTasimaEkranlari`,
   Galaksi taşıyıcıları `projeler/galaksi/akis-tasima.mjs` + `tasima-*.mjs` (ürün verisi sunucuda okunur, kimlik profil adıyla,
   başlık kodlu testinkiyle aynı). Arayüz: akış ekranında "Kodlu senaryoları taşı…" (ortam seç, önizle, seçilenleri taşı; senaryolar
   yalnızca o ortamda, Koşuda kapalı). Kullanıcı yapacak (değerleri yalnızca o görür).
   **Açık konular:** kodlu testlerin ürüne özgü kabul edilen ödeme sonuçları ortak akışlarda yok (önizleme notu; ortak akışa "veya"
   mesajı eklenmeli); ajanların bulduğu motor eksikleri (görünmüyorsa tıklamayı atla, gizli alana değer yaz, telefon bölme, kapalı
   alanı atla, bağlam profilinden değer, alan beklemesinde hata penceresi) — kullanıcıya liste olarak sunulacak.
5. **CANLI ortamda authenticator ile giriş** denemesi (kullanıcıyla).
6. **`.env` silinmesi** (Mac ve Windows) — 5 başarılı olunca (1 tamam), onayla.
7. ~~**Küçük kararlar**~~ (2026-09-25): kilit ekranında proje sayısı GİZLENMEYECEK (kullanıcı: hayır); devre dışı
   ekranda tek senaryo (▷) ve Dene ÇALIŞIR — yapıldı (calistirma.mjs; toplu koşular yine almaz).
   **Giriş kurgusu** (tarifte giriş adımları / "Girişi kaydet"): kullanıcı kararıyla BEKLİYOR — girişi farklı (ek alan, iki
   sayfalı, ön adım) bir uygulama gelince yalnızca gereken kadarı eklenecek (büyük olasılıkla tarife "girişten önce
   adımlar" + "parola ayrı sayfadaysa Devam düğmesi").
8. Kullanım geri bildirimleri: görsel ve akış ince ayarları.

İleriye bırakılanlar: Claude Code CLI ile dashboard'dan otomatik yorum (Max planı içinde, `ANTHROPIC_API_KEY`
her zaman silinerek), ekip büyürse ortak sunucu veritabanı.
