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
npm run report              # Son (Playwright) HTML raporunu açar (yalnızca proje platforma aktarılmamışsa üretilir)
npm run baslat              # Platform arayüzü: Sonuçlar / Mevcut görünüm / Ayarlar
```

## Sonuçlar (platform)

Allure kaldırıldı. Her koşunun sonuçları `scripts/platform/raporlayici.mjs` (Playwright raporlayıcısı) tarafından doğrudan platform veritabanına yazılır: koşu (tam/tekil, kapsam, ortam), her testin durumu, süresi, hata mesajı, hata kategorisi/kalıbı, adımları, beklenen sonucu ve atlanan alanları. Ekran görüntüleri, videolar ve izler (trace) test bittiği anda **şifreli medya deposuna** (`veri/medya/`, AES-256-GCM) taşınır; düz metin kopyaları (yalnızca o koşunun `test-results/` çıktıları) silinir. Proje platform veritabanına aktarılmamışsa raporlayıcı hiçbir şey yapmaz.

Sonuçları görmek için `npm run baslat` → **Sonuçlar** sekmesi: ürün listesi, kartlar (önceki koşuya göre fark), trend, koşu geçmişi, hata kalıpları (tarih filtresiyle) ve test detayı (hata, beklenen/görülen, adımlar, ekran görüntüleri, ▶ video, ⬇ indir). Medya yalnızca kasa açıkken gösterilir. Videolar `VIDEO_SAKLAMA_GUN` (Ayarlar > Güvenlik ya da `.env`, varsayılan 30) günden sonra silinir; ekran görüntüleri ve sonuçlar kalır.

Eski `allure-results-<ortam>/` klasörleri "Mevcut proje dosyalarını aktar" adımında bir kez içe aktarılır (tekrarlanabilir; klasörler silinmez/değiştirilmez).

Varsayılan ortam TEST’tir. Elle seçim için PowerShell’de:

```powershell
$env:TEST_ENV = "test"   # veya "canli"
npx playwright test
```

CANLI Jet Kasko senaryosu, `tests/data/canli/jet-kasko.json` içindeki güvenli ve yetkili data tamamlanıp `aktif` değeri `true` yapılana kadar atlanır.

HTML report, her testin videosu, hata screenshot’ı ve hata trace’i `playwright.config.ts` üzerinden korunur. Senaryo adımlarının screenshot’ları rapora ayrıca eklenir.
