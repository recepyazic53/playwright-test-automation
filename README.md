# Playwright test otomasyonu

TEST ve CANLI ortamlarında aynı Playwright senaryolarını çalıştıran TypeScript projesidir.

## Kurulum

```powershell
npm install
npx playwright install chromium
Copy-Item .env.example .env
```

Kullanıcı adı, şifre ve Authenticator kodu yalnızca yerel `.env` dosyasında tutulur. İş verileri `tests/data/test` ve `tests/data/canli` altında birbirinden ayrı tutulur.

## Yapı

```text
tests/
├── scenarios/                 # Ortak TEST/CANLI senaryoları
├── support/
│   ├── flows/test-baslangici.ts
│   ├── pages/
│   ├── environments.ts
│   ├── screenshots.ts
│   └── test-data.ts
└── data/
    ├── test/
    └── canli/
```

`testBaslangiciniHazirla`, bütün ürün senaryolarında ortama göre giriş ve acente/kullanıcı değişimini yapar. TEST ortamında Authenticator kullanılmaz; CANLI ortamında `CANLI_AUTH_CODE` okunur.

## Platform: mevcut proje dosyalarını aktarma

`npm run baslat` ile açılan platformda, bu klasörde eski proje dosyaları varsa hoş geldiniz ekranında **"Mevcut proje dosyalarını aktar"** kartı çıkar: kasa parolası (iki kez) → önizleme (yalnızca sayılar) → aktar → özet. `.env` (ortam adresleri, kullanıcı/parola/2FA), `tests/data/<ortam>/*.json`, `kosu-listesi.json` ve `tests/ekran-modelleri/` şifreli yerel veritabanına (`veri/platform.db`, Git'e girmez) aktarılır; **dosyalar değiştirilmez**. Aynı işlem daha sonra **Ayarlar > Yedekleme > "Proje dosyalarından yeniden aktar"** ile tekrarlanabilir: kaynak anahtarına göre birleştirir, çift kayıt üretmez; dosyada değişmeyen kayıtlarda platformda yapılan düzenlemeler korunur.

- Genel motor `scripts/platform/aktarim/`; projeye özgü okuma/eşleme `projeler/galaksi/aktarim.mjs` (kayıt: `projeler/index.mjs`).
- Aktarımdan sonra testler veriyi (test verisi, taban adres, giriş bilgisi, koşu listesi) veritabanından okur; şekiller dosyalarla birebir aynıdır (`npm run test:birim` > `platform-esdegerlik` kontrol eder). Testlere `senaryoId` (UUID) annotation'ı eklenir, başlıklar değişmez.
- **Terminalden koşarken** (`npm run test...`) kasa parolası gizli olarak sorulur (yazılanlar görünmez); anahtar yalnızca o koşunun belleğinde tutulur. Dashboard'dan başlatılan koşularda kasa açıksa sorulmaz.
- Etkileşimsiz ortam (CI): parolayı `PLATFORM_KASA_PAROLASI` ortam değişkeniyle verin (gizli değişken olarak; önerilen yol etkileşimli terminaldir). Veritabanını kullanmadan eski dosyalardan koşmak için `PLATFORM_VERI_KAYNAGI=dosya`.
- Dosyalar veya `.env` aktarımdan sonra değişirse (ör. eski dashboard'daki senaryo düzenleyicisi hâlâ dosyaya yazar) testler davranış değişmesin diye dosyaları kullanır ve uyarı yazar; sunucu kasa açıkken bu değişiklikleri otomatik olarak yeniden aktarır.
- Kasa, Ayarlar > Güvenlik'te belirlenen süre (5–120 dk, varsayılan 15) boyunca işlem yapılmazsa otomatik kilitlenir.

## Komutlar

```powershell
npm run typecheck          # TypeScript kontrolü
npm run test:test-ortami   # Ortak senaryoları TEST datasıyla çalıştırır
npm run test:canli         # Ortak senaryoları CANLI datasıyla çalıştırır
npm run test:headed        # Seçili ortamı görünür tarayıcıyla çalıştırır
npm run test:ui            # Playwright UI modu
npm run test:debug         # Debug modu
npm run report              # Son (Playwright) HTML raporunu açar
npm run rapor:test          # TEK KOMUT: TEST raporunu (dashboard + Allure) üretir ve açar
npm run rapor:canli         # TEK KOMUT: CANLI raporunu (dashboard + Allure) üretir ve açar
npm run allure:report:test  # Sadece Allure raporunu üretir ve açar (TEST)
npm run allure:report:canli # Sadece Allure raporunu üretir ve açar (CANLI)
npm run hata:ozet:test       # Sadece dashboard/özet dosyalarını üretir, açmaz (TEST)
npm run hata:ozet:canli      # Sadece dashboard/özet dosyalarını üretir, açmaz (CANLI)
```

## Tek komutla rapor: `npm run rapor:test` / `npm run rapor:canli`

Testler bittikten sonra tüm raporlama tek komutla yapılır:

```powershell
npm run rapor:test     # veya: npm run rapor:canli
```

Bu komut sırayla: Allure raporunu üretir, ürün bazlı özeti/gün-gün karşılaştırmayı hesaplar, kendi **dashboard sayfasını** (`dashboard-<ortam>.html`) tarayıcıda açar ve ardından Allure raporunu ayrı bir sekmede açar. Yani tek komutla iki sekme açılır:

- **Dashboard sekmesi** (bizim ürettiğimiz, tek ekran): toplam/başarılı/başarısız/atlanan sayıları (önceki koşuya göre değişimiyle birlikte), ürün bazlı başarı tablosu, **hata kategorisi değişim tablosu** (hangi ürünün hangi hatası arttı/azaldı/yeni çıktı/giderildi) ve en altta **"Başarısız testler - detay"** bölümü: o günün her başarısız senaryosu satır satır listelenir, üstüne tıklayınca (ürün/akış/kategori etiketleriyle birlikte) hata mesajı ve **"❌ HATA ANI" ekran görüntüsü doğrudan bu sayfada açılır** — Allure'a hiç geçmeden hangi testin nerede takıldığını görürsünüz.
- **Allure sekmesi**: bir senaryonun TÜM adımlarının (01, 02, 03...) ekran görüntüleri, trend grafiği, Behaviors/Categories gibi daha derin/adım-adım inceleme gerektiğinde.

İkisini ayrı sekmeler olarak açmamızın sebebi teknik bir kısıt: Allure'ın raporu kendi yerel sunucusuyla servis ediliyor (dosya olarak açılınca çalışmıyor), bu yüzden Allure'ın kendi arayüzünü dashboard'a gömemiyoruz — ama başarısız testlerin hata anı ekran görüntüsünü ve mesajını, Allure'ın ham verisinden (`allure-results-<ortam>/`) doğrudan kendi dashboard'umuza çektik; asıl aradığın "hatanın nerede alındığını görmek" ihtiyacı artık Allure'a hiç girmeden, tek ekranda karşılanıyor.

## Allure raporu (kurumsal/paylaşılabilir rapor)

Her test koşusunda ham sonuçlar, ortama özel bir klasöre yazılır: TEST için `allure-results-test/`, CANLI için `allure-results-canli/` (`playwright.config.ts`'deki `allure-playwright` reporter'ı, `TEST_ENV`'e göre klasörü otomatik seçer). Bu ikisi **kasıtlı olarak ayrı tutulur** — TEST ortamının verileri CANLI'nın gerçek/yetkili verileriyle karışmasın diye. Okunabilir bir HTML raporuna dönüştürmek için:

```powershell
npm run allure:report:test    # veya: npm run allure:report:canli
```

Bu komut önce raporu üretir (`allure:generate:test` / `:canli`, çıktı: `allure-report-test/` veya `allure-report-canli/`), sonra tarayıcıda açar (`allure:open:test` / `:canli`). Argümansız `npm run allure:report` (ve `allure:generate`/`allure:open`) geriye dönük uyumluluk için TEST ortamına eş değerdir.

**Önkoşul:** Allure komut satırı aracı Java (JRE 8+) gerektirir. Bilgisayarınızda Java kurulu değilse "java bulunamadı" hatası verir — [Eclipse Temurin](https://adoptium.net/) üzerinden bir JRE kurmanız yeterlidir.

Rapor; senaryoları ürün bazında (Epic: JetKasko, JetSeyahat, Trafik...) ve akış bazında (Feature: Yeni Kayıt, Teklif Matrisi...) otomatik gruplar (Behaviors sekmesi), hata kategorilerini (İş Kuralı/Pop-up, Zaman Aşımı, Seçici Hatası, Doğrulama Hatası) sınıflandırır, ortam bilgisini (TEST/CANLI, taban URL, koşu tarihi) gösterir ve her senaryonun adım ekran görüntülerini gömülü gösterir. Bir senaryo başarısız olursa, hatanın alındığı son ekran görüntüsü ve okunabilir hata mesajı "❌ HATA ANI" etiketiyle testin sonuna eklenir — raporu açan kişi hatayı aramadan görür.

Her `allure:generate:*` çalıştığında, bir önceki raporun trend geçmişi (`scripts/allure-history-sync.mjs` ile) otomatik olarak sonuç klasörüne geri kopyalanır; böylece Allure'ın "Trend" grafiği koşular arasında kesintisiz birikir, elle bir şey yapmanız gerekmez.

`npm run hata:ozet:test` / `hata:ozet:canli`, o ortamın son koşusundaki başarısız/bozuk testleri ürün (epic) ve hata kategorisi kırılımında bir tabloya döker (konsola ve `urun-hata-ozeti-<ortam>.md` dosyasına) — "hangi üründen hangi hata sıklıkla geliyor" sorusunun cevabı budur; Allure'ın kendi Categories widget'ı bunu ürün bazında kırmadığı için ayrı bir script olarak eklendi.

Bu script ayrıca **gün-gün karşılaştırma** yapar: `allure-results-<ortam>/` klasörü hiç temizlenmediği için içinde geçmiş koşuların hepsi birikir; script bunları kendi zaman damgalarına göre günlere ayırıp en son iki koşu gününü otomatik kıyaslar — genel başarılı/başarısız sayılarındaki değişim ile birlikte, hangi ürünün hangi hata kategorisinin **arttığını**, **azaldığını**, **yeni çıktığını** ("dün yoktu, bugün çıktı") veya **tamamen giderildiğini** satır satır gösterir. Belirli bir günü baz almak için tarihi elle de verebilirsiniz: `node scripts/urun-hata-raporu.mjs test 2026-09-20`. Bu kıyas için ekstra bir geçmiş dosyası tutmuyoruz — kaynak doğrudan `allure-results-<ortam>/` klasörünün kendisi; bu yüzden o klasörü periyodik olarak silmeyin (disk yer sorunu olursa, eski günlerin detaylı dosyalarını atıp sadece özet sayıları koruyan bir temizlik script'i ayrıca eklenebilir).

Varsayılan ortam TEST’tir. Elle seçim için PowerShell’de:

```powershell
$env:TEST_ENV = "test"   # veya "canli"
npx playwright test
```

CANLI Jet Kasko senaryosu, `tests/data/canli/jet-kasko.json` içindeki güvenli ve yetkili data tamamlanıp `aktif` değeri `true` yapılana kadar atlanır.

HTML report, her testin videosu, hata screenshot’ı ve hata trace’i `playwright.config.ts` üzerinden korunur. Senaryo adımlarının screenshot’ları rapora ayrıca eklenir.
