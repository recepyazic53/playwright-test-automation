# Nöbetçi — yerel test otomasyon platformu

Nöbetçi, web uygulamalarınızın ekranlarını ve servislerini **kod yazmadan** test etmenizi sağlayan, bilgisayarınızda
çalışan bir platformdur. Ekranı tanıtırsınız (ekran paketi ya da otomatik tarama), senaryoları formdan oluşturursunuz,
Nöbetçi onları Playwright ile koşar; sonuçlar, ekran görüntüleri ve videolar şifreli olarak saklanır.

> **Verileriniz Git'te değildir.** Projeler, ortamlar, giriş bilgileri, test verisi, ekran modelleri, senaryolar ve
> sonuçlar yalnızca bu bilgisayardaki şifreli veritabanında durur (`veri/`). `veri/` Git'e ya da buluta gitmez.
> Kasa kapalıyken hiçbir kişisel veri okunamaz.

## Kurulum

```powershell
npm install
npx playwright install chromium
npm run baslat
```

`npm run baslat` yerel sunucuyu başlatır ve Nöbetçi'yi tarayıcıda açar (`http://127.0.0.1:5566/`; port
`TEST_SUNUCU_PORT` ile değişir). Sunucu yalnızca bu bilgisayardan erişilebilir (127.0.0.1).

## Taşınabilir sürüm (Windows)

`npm run paketle` Nöbetçi'yi `dist/Nöbetçi/` klasörüne, kurulum gerektirmeyen bir pakete dönüştürür: içinde Node, Playwright'ın
Chromium tarayıcısı ve `Nöbetçi.exe` başlatıcısı vardır. Klasörü (ya da zip'ini) başka bir bilgisayara kopyalayıp `Nöbetçi.exe`'ye
çift tıklamak yeter; Node, VS Code ya da internet gerekmez. Veriler paketin `uygulama/veri` klasöründe şifreli durur. Paket
bu bilgisayarda zaten olan dosyalardan üretilir (hiçbir şey indirilmez); başlatıcı Windows'un .NET Framework derleyicisiyle
derlenir ve imzasızdır (Windows ilk açılışta uyarı gösterebilir).

Hedef klasör her paketlemede yeniden oluşturulur, ama önce denetlenir: o klasörden çalışan bir Nöbetçi varsa (`runtime\node.exe`
/ `Nöbetçi.exe`) silme reddedilir ("önce kapatın"); içinde kullanıcı verisi (`uygulama\veri`) varsa uyarı verilip durulur.
Veriyi de silmek bilinçli bir kararsa: `npm run paketle -- [hedef] --zorla` (çalışan Nöbetçi'yi `--zorla` da aşmaz).

Paketin sonunda iki denetim yapılır: pakete giren modüllerin içe aktardığı her modül pakette var mı, ve **açılış denemesi**:
paketin kendi `runtime\node.exe`'siyle sunucu geçici bir veri kökü ve boş bir portla başlatılır (tarayıcı açılmaz), ana sayfa ve
tüm arayüz dosyaları 200 dönmeli; süreç kapatılır. Biri başarısızsa "Paket hazır" denmez ve komut hata koduyla biter.
Açılış denemesini atlamak: `npm run paketle -- --acilis-denemesi-yok`. macOS arşivinde (`npm run paketle:mac`) arşiv burada
açılamadığından yalnız içe aktarma çözümlemesi yapılır (indirmelerden önce).

## İlk açılış

Karşılama ekranında iki seçenek vardır:

1. **Yedek yükle** — başka bir bilgisayardan alınmış `.tayedek` dosyası (yedeğin parolası bu bilgisayarın kasa
   parolası olur).
2. **Yeni proje başlat** — önce kısa bir soru (testler hangi ortamlarda çalışacak), sonra kasa parolası, proje
   ve ortamlar (Ortam adı | Adres | Riskli mi?). Son adımda kısa bir "Proje hazır" özeti (kaydedilen ortamlar) gösterilir.
   Giriş profilleri ve iki aşamalı doğrulama Ayarlar > Giriş profilleri'nden, ekranlar Ekranlar sayfasından eklenir.

Karşılama ekranının altında **veri klasörü** görünür ("Değiştir…", "Var olan veri klasörünü aç…"); aynı seçim Ayarlar >
Yedekleme > "Veri klasörü"ndedir. Paketli sürümde seçim paketin dışındaki bir ayar dosyasında saklanır (Windows:
`%LOCALAPPDATA%\Nöbetçi\ayar.json`, macOS: `~/Library/Application Support/Nöbetçi/ayar.json`); taşımada veri kopyalanır,
doğrulanır ve eski klasör silinmez. Nöbetçi varsayılan olarak varsayılan tarayıcıda açılır (Ayarlar > Arayüz).

Kasa parolasını unutmayın: parola unutulursa veriler kurtarılamaz.

## Günlük kullanım

Her ekranın bir **rehberi** vardır: ekranı ve işlerin hangi sırayla yapılacağını anlatır. İlk açılışta kendiliğinden başlar
(Ayarlar > Arayüz'den kapatılabilir), sonra üst çubuktaki **?** düğmesiyle istediğiniz zaman yeniden açılır.

- **Ekranlar** — test edilecek ekranlar: ekran paketi yükleme, otomatik tarama, akış kaydı, akış diyagramı ve ortak
  akışlar, ekran modeli sürümleri.
- **Senaryolar** — ekran modelinden üretilen formla senaryo oluşturma/düzenleme, "Koşuda" seçimi, **Dene** (taslak,
  kaydetmeden) ve **Çalıştır** (canlı ekran görüntüsü, durdurma).
- **Servisler** — SOAP/REST servis senaryoları, servis akışları (bir yanıttan okunan değeri sonraki isteğe taşıma,
  oturum/token akışları).
- **Test verisi** — kayıtlar, tablolar ve değer listeleri.
- **Sonuçlar** — koşular, kartlar, trend, hata kalıpları, test ayrıntısı (ekran görüntüsü, video, iz). Medya
  şifrelidir ve yalnızca kasa açıkken gösterilir.
- **Ayarlar** — proje, ortamlar, giriş profilleri ve giriş tarifleri, bağlam profilleri, koşu ayarları,
  hata sınıflandırma kuralları, maskeleme, güvenlik (otomatik kilit, yasak adresler), yedekleme, entegrasyonlar
  (koşu bitti webhook bildirimi, iş takip sisteminde hata kaydı, veritabanı bağlantıları; gizliler kasada şifreli).

### Kayıt ve saklama

**Ayarlar > Koşu > Kayıt**: video, test sonu ekran görüntüsü ve iz (trace; ağ istekleri, sayfa yapısı ve adımların kaydı,
Playwright iz görüntüleyicisiyle açılır) için her testte / yalnız başarılı testlerde / yalnız kalan testlerde / kapalı
("yalnız başarılı"da kayıt her testte alınır, kalan testlerinki kaydedilmeden silinir). Adım ekran görüntüleri: her adımda
(varsayılan) / yalnız kalan adımda / seçili adımlarda (akış tasarımında "Ekran görüntüsü al" işaretli adımlar) / kapalı;
senaryo formunda senaryo başına değiştirilebilir. Video boyutu: Küçük (varsayılan, 800 px'e sığdırma) ya da Ekranla aynı.
**Ayarlar > Yedekleme > Saklama**: sonuçları N gün sonra silme ve "medyayı incelt" (N günden eski sonuçlarda başarılı,
kalan ya da tüm testlerin görüntü ve videoları silinir; sonucun kendisi kalır). Günlük temizlikte sıra: sonuç saklama →
medya inceltme → video saklama süresi (dördü Ayarlar > Yedekleme > Saklama kartında, tek zaman çizelgesiyle). Her yeni ayarın varsayılanı önceki davranıştır.

### Giriş

Her ortamın girişi yalnızca **Ayarlar > Giriş profilleri > Giriş tarifi**'nden yönetilir (Ekranlar'da listelenmez);
adımlar tarif formunda okunur özetle görünür. Kullanıcı adı, parola ve giriş düğmesinin önüne,
arasına ya da arkasına adım eklenebilir (ek alan, seçim, "Devam" ile iki sayfalı giriş, çerez onayı); bu adımların
değerleri giriş profilinde **Ek alanlar**'da durur, gizli işaretlenen (PIN gibi) kasada şifreli ve maskelidir.
**Girişi kaydet** ile girişi görünür tarayıcıda kendiniz yaparsınız (yazdığınız değerler kaydedilmez); alanları
işaretleyip önizledikten sonra tarif formunda kontrol edip kaydedersiniz.

### Senaryo dosyaları

Senaryonun dosya alanında **Dosya yükle** ile seçilen dosya bellekte şifrelenip şifreli medya deposuna (`veri/medya/`)
yazılır; diskte düz metin olarak durmaz. Koşu anında dosya yalnızca o koşuya özel, yalnızca kullanıcının okuyabildiği
geçici bir klasöre çözülür ve koşu bitince silinir.

### Yasak adresler

**Ayarlar > Güvenlik > Yasak adresler**: Nöbetçi'nin hiçbir zaman bağlanmayacağı host kalıpları (`*` joker). Listedeki
bir host'a giden koşu ve ekran taraması hiç başlamaz. Varsayılan boştur. `NOBETCI_YASAK_ADRESLER` ortam değişkeni ek
kaynak olarak desteklenir.

## Koşular

Koşular yalnızca Nöbetçi'den başlatılır: sunucu Playwright'ı (`playwright.config.ts`) proje ve ortam kimlikleriyle
çalıştırır; veri, giriş bilgisi ve giriş tarifi şifreli veritabanından okunur, sonuçlar şifreli olarak yazılır.
Playwright HTML raporu üretilmez.

### Zamanlanmış koşular ve kilitli kasa

**Ayarlar > Koşu > Zamanlanmış koşular**: kurallar varsayılan olarak yalnız Nöbetçi açıkken ve kasa açıkken çalışır.
"Kasa kilitliyken ve açılışta" bölümündeki üç seçenek **varsayılan kapalıdır** ve ayrı ayrı açılır:

- **Kilitliyken çalışsın (anahtar yalnız bellekte)** — kilitlemede arayüz kilitlenir (veri uçları 423), anahtarın kopyası
  yalnız zamanlayıcının belleğinde kalır; Nöbetçi kapanınca gider. Kilitlerken "Tamamen kilitle" anahtarı da siler.
- **Windows oturumuna bağlı otomatik açma (DPAPI)** — parola yeniden sorulur; anahtar DPAPI (CurrentUser) ile şifrelenip
  çalışma alanının klasörüne yazılır (`<veritabanı>.zamanlayici.dpapi`; yedeğe/pakete girmez). Açılışta yalnız zamanlayıcıya
  verilir, arayüz kilitli başlar. Risk: Windows oturumunuzu ele geçiren biri zamanlanmış koşuların kullandığı verilere erişebilir.
- **Bilgisayar açılınca arka planda başlasın** — Görev Zamanlayıcı'ya kendi hesabınızla, yönetici izni gerektirmeyen
  "Nöbetçi (arka plan)" görevi eklenir (`baslat.mjs --arka-plan`; pakette `Nöbetçi.exe --arka-plan`, pencere açılmaz).

## Yapı

```text
scripts/
├── baslat.mjs, test-sunucu.mjs       # Nöbetçi yerel sunucusu (yalnızca 127.0.0.1)
├── platform/                         # Veritabanı, kasa, yedek, ekranlar, senaryolar, servisler, raporlayıcı, arayüz
└── dogrulama/                        # Ekran modeli ve senaryo doğrulayıcıları (sunucu + form + koşucu)
tests/
├── model-kosucu/                     # Senaryoları ekran modeliyle koşan tek spec
├── support/                          # Model koşucusu, giriş motoru, veri erişimi
└── birim/                            # Tarayıcısız ve yerel sahte uygulamalı koruma testleri
docs/                                 # Ekran paketi biçimi, servis testleri
```

## Komutlar

```powershell
npm run baslat        # Nöbetçi (sunucu + tarayıcı)
npm run test-sunucu   # Yalnızca sunucu
npm run typecheck     # TypeScript kontrolü
npm test              # Koruma testleri (yalnızca yerel sahte uygulamalar; dış siteye bağlanmaz)
npm run paketle       # Taşınabilir Windows paketi (dist/Nöbetçi/)
```
