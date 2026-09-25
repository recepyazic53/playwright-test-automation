# Playwright test otomasyonu — Nöbetçi

TEST ve CANLI ortamlarında aynı Playwright senaryolarını çalıştıran TypeScript projesidir. Senaryolar,
test verisi, ortam adresleri, giriş bilgileri ve sonuçlar yerel test otomasyon platformu **Nöbetçi**
üzerinden yönetilir.

> **Proje verisi Git'te DEĞİLDİR.** Test verisi, ekran modelleri, koşu listesi, ortam adresleri, giriş
> bilgileri ve sonuçlar yalnızca bu bilgisayardaki şifreli platform veritabanında durur (`veri/`:
> `veri/platform.db`, şifreli medya `veri/medya/`, yerel yedekler `veri/yedekler/`). `veri/` Git'e/buluta
> gitmez. Git'te yalnızca motor, spec'ler/page object'ler (kod) ve birim testlerinin **sahte değerli**
> örnekleri (`tests/birim/fixtures/`) vardır.

## Kurulum

```powershell
npm install
npx playwright install chromium
npm run baslat
```

`npm run baslat` yerel sunucuyu başlatır ve Nöbetçi'yi tarayıcıda açar (`http://127.0.0.1:5566/`;
port `TEST_SUNUCU_PORT` ile değişir).

## İlk kurulum (bu bilgisayarda henüz veritabanı yoksa)

Hoş geldiniz ekranında üç seçenek vardır:

1. **Yedek yükle** — başka bir bilgisayardan alınmış `.tayedek` dosyası (yedeğin parolası bu
   bilgisayarın kasa parolası olur).
2. **Yeni proje başlat** — kasa parolası, proje ve ortamları sıfırdan tanımlayın.
3. **Eski proje dosyalarını aktar** — yalnızca eski dosyaların bulunduğu bir klasör varsa görünür:
   varsayılan olarak en yeni `veri/eski-dosyalar/<YYYYMMDD-HHMM>/` yedeği (geçişte eski `tests/data/**`,
   `tests/ekran-modelleri/**`, `kosu-listesi.json` ve eski proje dosyaları buraya yedeklendi; içinde
   `MANIFEST.sha256` vardır). Akış: kasa parolası (iki kez) → önizleme (yalnızca sayılar; burada **başka
   bir klasör seçebilirsiniz**) → aktar → özet. Eski dosyalar değiştirilmez.
   - Eski dosyaları olan **başka bir makinede**: eski klasörü (içinde `tests/data/<ortam>/ortak.json`
     olan) önizleme adımında seçin. Klasörde bir `.env` varsa taban adresler ve giriş bilgileri oradan,
     yoksa proje kökündeki `.env`'den okunur (yalnızca bu aktarım için).
   - Aynı işlem sonradan **Ayarlar > Yedekleme > "Eski proje dosyalarından yeniden aktar"** ile
     tekrarlanabilir (kaynak anahtarına göre birleştirir, çift kayıt üretmez). Dosyalardan veritabanına
     **otomatik** aktarım yoktur.

Kasa parolasını unutmayın: parola unutulursa veriler kurtarılamaz.

## Günlük kullanım

- **Senaryolar** — senaryoları görüntüleme, oluşturma/düzenleme (ekran modelinden üretilen form),
  "Koşuda" seçimi, **Dene** (taslak, kaydetmeden) ve **Çalıştır** (canlı ekran görüntüsü, durdurma).
- **Sonuçlar** — koşular, kartlar, trend, hata kalıpları, test detayı (ekran görüntüsü, video, iz).
  Medya şifrelidir ve yalnızca kasa açıkken gösterilir.
- **Ayarlar** — proje, ortamlar, giriş profilleri, bağlam/test verisi profilleri, **dosyalar** (ekranların
  varsayılan dosyaları, ör. ürünün çoklu sorgu Excel'i), güvenlik (otomatik kilit, video saklama, **yasak
  adresler**, **açık dosyaları şifreli depoya taşı**), yedekleme (dışa/içe aktar, otomatik yedek).

### Senaryo dosyaları (ör. çoklu sorgu Excel'i)

Senaryonun dosya alanında **Dosya yükle** ile seçilen dosya bellekte şifrelenip şifreli medya deposuna
(`veri/medya/`) yazılır; diskte düz metin olarak durmaz, arayüzden indirilemez (yalnızca ad ve boyut görünür).
Senaryo verisinde yalnızca bir referans (`nobetci-dosya://<kimlik>/<ad>`) saklanır. Koşu anında test süreci
dosyayı **yalnızca o koşuya özel**, yalnızca kullanıcının okuyabildiği geçici bir klasöre çözer (işletim
sisteminin kullanıcı geçici klasöründe `nobetci-dosyalar/…`; klasör 0700, dosya 0600) ve koşu bitince klasörü
ezip siler; çöken koşulardan kalanlar Nöbetçi açılırken silinir. Senaryoda dosya yoksa ekranın varsayılan
dosyası (Ayarlar > Dosyalar) kullanılır. Senaryo dosyaları yedeğe her zaman (şifreli haliyle) girer.

Eski proje düzenindeki düz metin dosyalar (`tests/fixtures/**`) aktarımda şifreli depoya **kopyalanır** ve
yol değerleri referansa çevrilir. Düz metin kopyaları silmek için bir kez **Ayarlar > Güvenlik > "Açık
dosyaları şifreli depoya taşı"** kullanın: önce liste gösterilir; onaylanınca her dosya şifreli depoya alınır,
şifreli kopyası doğrulanır ve düz metin dosya ezilip silinir (doğrulanamayan dosya silinmez).

### Yasak adresler

**Ayarlar > Güvenlik > Yasak adresler**: Nöbetçi'nin hiçbir zaman bağlanmayacağı host kalıpları (`*` joker).
Listedeki bir host'a giden koşu ve ekran taraması hiç başlamaz; koşu sırasında bu host'lara istek iptal edilir.
Varsayılan boştur. `NOBETCI_YASAK_ADRESLER` ortam değişkeni ek kaynak olarak desteklenir (ikisi birleşir).

Kasa, Ayarlar > Güvenlik'te belirlenen süre (5–120 dk, varsayılan 15) işlem yapılmazsa otomatik kilitlenir;
kasa kilitliyken koşu başlatılmaz.

## Terminalden koşu

```powershell
npx playwright test                  # varsayılan ortam TEST (TEST_ENV)
npm run test:test-ortami             # TEST
npm run test:canli                   # CANLI
npm run test:headed | test:ui | test:debug
```

- Testler veriyi **yalnızca** platform veritabanından okur. Veritabanı yoksa ya da proje aktarılmamışsa
  koşu açık bir hatayla durur: *"Veritabanı hazır değil — Nöbetçi'yi açıp projeyi aktarın/yedek yükleyin"*.
- Koşu başında **kasa parolası gizli olarak sorulur** (yazılanlar görünmez); türetilen anahtar yalnızca o
  koşunun belleğinde tutulur. Nöbetçi'den başlatılan koşularda kasa açıksa sorulmaz.
- Etkileşimsiz ortam (CI) ve `npx playwright test --list` (VS Code eklentisi dahil): parolayı
  `PLATFORM_KASA_PAROLASI` ortam değişkeniyle verin (gizli değişken olarak; dosyaya yazmayın).
- Sonuçlar ve ekran görüntüsü/video/izler koşu biter bitmez veritabanına ve şifreli medya deposuna yazılır
  (`scripts/platform/raporlayici.mjs`); Nöbetçi açıksa sonuçlar sunucu üzerinden yazılır. Playwright HTML
  raporu üretilmez.

## Yapı

```text
scripts/
├── baslat.mjs, test-sunucu.mjs     # Nöbetçi yerel sunucusu (yalnızca 127.0.0.1)
├── platform/                       # Veritabanı, kasa, yedek, aktarım motoru, raporlayıcı, arayüz
└── dogrulama/senaryo-dogrulayici.mjs  # Tek senaryo doğrulayıcısı (spec + sunucu + form)
projeler/galaksi/aktarim.mjs        # Galaksi'ye özgü eski dosya → veritabanı eşlemesi
tests/
├── scenarios/, canli/              # Ortak TEST/CANLI senaryoları (kod)
├── support/                        # Page object'ler, akışlar, veritabanı erişim katmanı (platform-veri.ts)
└── birim/                          # Tarayıcısız koruma testleri + sahte değerli örnekler (fixtures/)
```

`testBaslangiciniHazirla`, bütün ürün senaryolarında ortama göre giriş ve acente/kullanıcı değişimini
yapar. CANLI'da iki aşamalı doğrulama kodu giriş profilindeki TOTP anahtarından anlık üretilir.

## Komutlar

```powershell
npm run baslat        # Nöbetçi (sunucu + tarayıcı)
npm run test-sunucu   # Yalnızca sunucu
npm run typecheck     # TypeScript kontrolü
npm run test:birim    # Tarayıcısız koruma testleri (sahte örnek verilerle; siteye bağlanmaz)
```

CANLI Jet Kasko senaryosu, veritabanındaki `jet-kasko` verisinde (CANLI) güvenli ve yetkili data
tamamlanıp `aktif` değeri `true` yapılana kadar atlanır.
