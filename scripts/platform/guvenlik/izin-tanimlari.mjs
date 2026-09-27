// İZİN TANIMLARI — TEK KAYNAK. Nöbetçi'nin kişi adına yaptığı her işlem bir izne bağlıdır (Ayarlar > İzinler). Her izin
// açık / kapalı bir anahtardır ve VARSAYILANI KAPALIDIR (yeni ve mevcut kurulumlar; kayıt yoksa kapalı sayılır).
// Bu dosya hem sunucuda (guvenlik/izinler.mjs, guvenlik/uc-denetimi.mjs: uç → izin eşlemesi bu listeden üretilir) hem
// arayüzde (/arayuz/izin-tanimlari.mjs: Ayarlar > İzinler, "?" açıklamaları, kapalı izin uyarısı, rehber) kullanılır — metin
// kopyası yoktur. Saf modül: yalnız saf ortam-riski.mjs'yi (riskli ortam tanımı) içe aktarır.
//
// Alanlar:
//   anahtar, etiket, aciklama     kısa tanım
//   yapabilecekleri[]             açıkken Nöbetçi'nin sizin adınıza yapabildikleri (sade dille)
//   yerler[]                      hangi ekran / bölümde kullanılır
//   islemler[]                    { ad, uclar[], kosul? } — kullanıcıya görünen işlem adı + denetlenen sunucu uçları.
//                                 kosul yoksa uç HER ZAMAN bu izni ister; kosul varsa izin yalnız o koşulda istenir
//                                 (koşul kodu: guvenlik/uc-denetimi.mjs). uclar boşsa işlem bir HTTP ucu değildir
//                                 (zamanlayıcı, koşucu, otomatik bildirim) ve aynı merkezden denetlenir.
//   risk                          riski
//   kapaliyken                    izin kapalıyken ne olur

import { RISKLI_ORTAM_TANIMI } from './ortam-riski.mjs';

/**
 * @typedef {{ ad: string; uclar: readonly string[]; kosul?: string }} IzinIslemi
 * @typedef {{
 *   anahtar: string; etiket: string; aciklama: string; yapabilecekleri: readonly string[]; yerler: readonly string[];
 *   islemler: readonly IzinIslemi[]; risk: string; kapaliyken: string
 * }} IzinTanimi
 */

const EKRAN_KOSU_UCLARI = Object.freeze(['/platform/senaryolar/calistir', '/platform/senaryo/dene']);
const SERVIS_KOSU_UCLARI = Object.freeze([
  '/platform/servis/senaryo/dene', '/platform/servis/is/baslat', '/platform/servis/kos', '/platform/servis-akisi/dene', '/platform/servis-akisi/kos'
]);

/** @type {readonly IzinTanimi[]} */
export const IZIN_TANIMLARI = Object.freeze([
  {
    anahtar: 'web-erisimi',
    etiket: 'Web uygulamasına erişim',
    aciklama: 'Nöbetçi test ettiğiniz web uygulamasını sizin adınıza tarayıcıda açar, ekranlarda gezinir ve formları doldurur.',
    yapabilecekleri: [
      'Senaryoları tarayıcıda koşmak: ekranları açmak, alanlara veri yazmak, düğmelere basmak.',
      'Senaryo formundaki taslağı "Dene" ile tarayıcıda denemek.',
      'Ekranı otomatik taramak; akış kaydı ve giriş kaydı için tarayıcı açmak.',
      'Giriş sayfasını açıp alanlarını önermek ("Varsayılanları öner").'
    ],
    yerler: [
      'Senaryolar > Koşuyu başlat, ▷ Çalıştır, Seçilenleri çalıştır',
      'Senaryolar > Senaryo formu > Dene',
      'Sonuçlar > Başarısızları tekrar çalıştır',
      'Ekranlar > Ekranı tara, Akışı kaydet',
      'Ayarlar > Giriş profilleri > Giriş tarifi > Varsayılanları öner, Girişi kaydet',
      'Komut satırı koşusu (npm run kos) ve zamanlanmış koşular'
    ],
    islemler: [
      { ad: 'Ekran senaryosu koşusu', uclar: ['/platform/senaryolar/calistir'] },
      { ad: 'Ekran senaryosu denemesi (Dene)', uclar: ['/platform/senaryo/dene'] },
      { ad: 'Ekran taraması, akış kaydı ve giriş kaydı', uclar: ['/platform/tarama/baslat'] },
      { ad: 'Giriş sayfası önerisi (Varsayılanları öner)', uclar: ['/platform/giris-tarifi/oner'] },
      { ad: 'Zamanlanmış koşudaki ekran senaryoları', uclar: [] }
    ],
    risk: 'Koşu uygulamada gerçek kayıt oluşturabilir, form gönderebilir; yanlış ortamda veri değişebilir.',
    kapaliyken: 'Hiçbir tarayıcı açılmaz: koşu, Dene, tarama, akış / giriş kaydı ve öneri başlamadan durur.'
  },
  {
    anahtar: 'servis-istekleri',
    etiket: 'Servis istekleri',
    aciklama: 'Nöbetçi SOAP ve REST servislerinize istek gönderir, WSDL / şema indirir ve servis akışlarını çalıştırır.',
    yapabilecekleri: [
      'SOAP ve REST servislerine senaryodaki isteği göndermek ve yanıtı denetlemek.',
      'Servis adresine erişimi denetlemek, WSDL / şemayı indirmek ve yenilemek.',
      'Servis akışlarını (oturum akışı dahil) adım adım çalıştırmak.'
    ],
    yerler: [
      'Servisler > Servis > Koş, Dene',
      'Servisler > Servis ekle > Erişimi kontrol et',
      'Servisler > Servis > Şemayı yenile',
      'Servisler > REST sihirbazı > Dene',
      'Servisler > Akışlar > Dene, Koş',
      'Zamanlanmış koşudaki servis akışları'
    ],
    islemler: [
      { ad: 'Erişim kontrolü (WSDL isteği)', uclar: ['/platform/servis/erisim'] },
      { ad: 'WSDL / şema yenileme', uclar: ['/platform/servis/sema/yenile'] },
      { ad: 'Servis senaryosu denemesi (Dene)', uclar: ['/platform/servis/senaryo/dene'] },
      { ad: 'Servis senaryolarını koşma', uclar: ['/platform/servis/is/baslat', '/platform/servis/kos'] },
      { ad: 'REST sihirbazında Dene', uclar: ['/platform/servis/rest/dene'] },
      { ad: 'Servis akışı Dene / Koş', uclar: ['/platform/servis-akisi/dene', '/platform/servis-akisi/kos'] },
      { ad: 'Zamanlanmış koşudaki servis akışları', uclar: [] }
    ],
    risk: 'İstekler servislerde gerçek işlem başlatabilir (kayıt oluşturma, güncelleme); yanıtlar kişisel veri içerebilir.',
    kapaliyken: 'Servislere hiçbir istek gönderilmez: koşu, Dene, erişim kontrolü, şema indirme ve servis akışları başlamadan durur.'
  },
  {
    anahtar: 'veritabani-okuma',
    etiket: 'Veritabanı okuma',
    aciklama: 'Nöbetçi tanımlı veritabanı bağlantılarına bağlanır ve okuma sorgusu (SELECT) çalıştırır.',
    yapabilecekleri: [
      'Ekran ve servis akışlarındaki SQL adımlarında veritabanını sorgulamak.',
      'Veritabanı bağlantısını "Bağlantıyı dene" ile sınamak.'
    ],
    yerler: [
      'Ayarlar > Entegrasyonlar > Veritabanı bağlantısı > Bağlantıyı dene',
      'Senaryolardaki SQL adımları (koşu ve Dene sırasında)',
      'Servisler > Akışlar > SQL adımı'
    ],
    islemler: [
      { ad: 'Veritabanı bağlantısını dene', uclar: ['/platform/entegrasyon/dene'], kosul: 'veritabanı bağlantısı denenirken' },
      { ad: 'Ekran koşusunda / Dene\'de SQL adımı', uclar: EKRAN_KOSU_UCLARI, kosul: 'senaryonun modelinde SQL adımı varsa' },
      { ad: 'Servis akışında SQL adımı', uclar: ['/platform/servis-akisi/dene', '/platform/servis-akisi/kos'], kosul: 'akışta SQL adımı varsa' }
    ],
    risk: 'Sorgular veritabanındaki kişisel ya da gizli verileri okuyabilir; ağır sorgular veritabanını yavaşlatabilir.',
    kapaliyken: 'Hiçbir veritabanına bağlanılmaz: SQL adımı sorgu atmadan hatayla kalır, bağlantı denenmez.'
  },
  {
    anahtar: 'veritabani-yazma',
    etiket: 'Veritabanına yazma',
    aciklama: '"Yalnız okuma" kapalı bağlantılarda veri değiştiren sorgulara (INSERT, UPDATE, DELETE…) izin verir.',
    yapabilecekleri: [
      '"Yalnız okuma" kapalı bir bağlantıda veri ya da şema değiştiren sorgu çalıştırmak.',
      'Bir veritabanı bağlantısında "Yalnız okuma" seçeneğini kapatmak.'
    ],
    yerler: [
      'Ayarlar > Entegrasyonlar > Veritabanı bağlantısı > Yalnız okuma',
      'SQL adımları ("Yalnız okuma" kapalı bağlantıda)'
    ],
    islemler: [
      { ad: 'Bağlantıda "Yalnız okuma"yı kapatma', uclar: ['/platform/entegrasyon/kaydet'], kosul: '"Yalnız okuma" kapatılırken' },
      { ad: 'SQL adımında yazma sorgusu', uclar: [...EKRAN_KOSU_UCLARI, '/platform/servis-akisi/dene', '/platform/servis-akisi/kos'], kosul: '"Yalnız okuma" kapalı bağlantıda yazma sorgusu çalışırken' }
    ],
    risk: 'Veriler kalıcı olarak değişebilir ya da silinebilir; geri alınamayabilir.',
    kapaliyken: 'Yazma sorgusu çalıştırılmaz ve "Yalnız okuma" kapatılamaz; okuma sorguları (izni açıksa) çalışır.'
  },
  {
    anahtar: 'canli-ortam',
    etiket: 'Canlı / riskli ortamda çalıştırma',
    aciklama: `Riskli ortamlarda koşu, Dene ve tarama yapılmasına izin verir. ${RISKLI_ORTAM_TANIMI}`,
    yapabilecekleri: [
      'Canlı / riskli ortamda ekran ve servis senaryolarını koşmak.',
      'Canlı / riskli ortamda ekran taraması yapmak ve giriş sayfası önermek.',
      'Zamanlanmış koşuları (kuralında canlı onayı varsa) riskli ortamda başlatmak.'
    ],
    yerler: [
      'Senaryolar > Koşuyu başlat (riskli ortam seçiliyken)',
      'Servisler > Koş (riskli ortam seçiliyken)',
      'Ekranlar > Ekranı tara (riskli ortam seçiliyken)',
      'Ayarlar > Koşu > Zamanlanmış koşular (riskli ortam kuralı)'
    ],
    islemler: [
      { ad: 'Riskli ortamda ekran koşusu ve Dene', uclar: EKRAN_KOSU_UCLARI, kosul: 'ortam riskliyse' },
      { ad: 'Riskli ortamda ekran taraması / kayıt', uclar: ['/platform/tarama/baslat'], kosul: 'ortam riskliyse' },
      { ad: 'Riskli ortamda giriş sayfası önerisi', uclar: ['/platform/giris-tarifi/oner'], kosul: 'ortam riskliyse' },
      // Servis Dene / erişim kontrolü / şema zaten YALNIZ test ortamında yapılır (riskli ortamda reddedilir).
      { ad: 'Riskli ortamda servis ve servis akışı koşusu', uclar: ['/platform/servis/is/baslat', '/platform/servis/kos', '/platform/servis-akisi/kos'], kosul: 'ortam riskliyse' },
      { ad: 'Riskli ortamda zamanlanmış koşu', uclar: [] }
    ],
    risk: 'Gerçek kullanıcıların verisi ve gerçek işlemler etkilenebilir. İzin açıkken de her çalıştırmada ayrıca onay sorulur.',
    kapaliyken: 'Riskli ortamda hiçbir koşu, Dene ya da tarama başlamaz; test ortamındaki çalışmalar etkilenmez.'
  },
  {
    anahtar: 'giris-bilgisi',
    etiket: 'Giriş bilgisi kullanımı',
    aciklama: 'Kasadaki kullanıcı adı, parola ve doğrulama kodunu (TOTP / SMS) test ettiğiniz sitenin giriş formuna yazar. Tarama ve akış kaydında koşunun saklanan oturumunu kullanmak da giriş sayılır (bu izin gerekir).',
    yapabilecekleri: [
      'Giriş profilindeki kullanıcı adı ve parolayı giriş formuna yazmak.',
      'TOTP ya da SMS doğrulama kodunu doldurmak.',
      'Senaryodaki "Yeniden giriş" adımında başka bir giriş profiliyle girmek.',
      'Tarama ve akış kaydında koşunun saklanan oturumunu kullanmak ve başarılı girişin oturumunu saklamak (Ayarlar > Koşu > Tarama ve akış kaydı > "Koşunun saklanan oturumunu kullan" seçiliyse).'
    ],
    yerler: [
      'Senaryo koşuları ve Dene (giriş tarifi olan ortamlarda)',
      'Ekranlar > Ekranı tara, Akışı kaydet (giriş tarifi olan ortamlarda)'
    ],
    islemler: [
      { ad: 'Koşu ve Dene sırasında giriş yapma', uclar: EKRAN_KOSU_UCLARI, kosul: 'ortamın giriş tarifi varsa ve senaryo girişsiz değilse' },
      { ad: 'Tarama ve akış kaydında giriş yapma', uclar: ['/platform/tarama/baslat'], kosul: 'ortamın giriş tarifi varsa ve "Giriş yapmadan aç" seçilmemişse (saklanan oturumla girişi atlamak da dahil)' },
      { ad: '"Yeniden giriş" adımı', uclar: [] }
    ],
    risk: 'Parola yanlış siteye yazılırsa ele geçebilir. Doldurma yalnız ortamın taban adresinin ya da giriş tarifindeki giriş adresinin kökenine yapılır.',
    kapaliyken: 'Giriş formu doldurulmaz; giriş gerektiren koşu ve tarama başlamadan durur.'
  },
  {
    anahtar: 'dis-gonderim',
    etiket: 'Dış gönderim',
    aciklama: 'Koşu sonuçlarını ve hata kayıtlarını dış sistemlere (webhook, iş takip sistemi) gönderir.',
    yapabilecekleri: [
      'Koşu bitince webhook bildirimi göndermek (sohbet kanalı vb.).',
      'Bir test sonucundan iş takip sisteminde hata kaydı açmak (isterseniz ekran görüntüsü / video ekiyle).',
      'Webhook ve iş takip bağlantılarını "Bağlantıyı dene" ile sınamak.'
    ],
    yerler: [
      'Ayarlar > Entegrasyonlar > Bağlantıyı dene',
      'Sonuçlar > Test ayrıntısı > Hata kaydı aç',
      'Koşu bitti bildirimi (seçtiğiniz olay)',
      'Ayarlar > Koşu > Zamanlanmış koşular > Sonuçları bildir'
    ],
    islemler: [
      { ad: 'Bildirim / iş takip bağlantısını dene', uclar: ['/platform/entegrasyon/dene'], kosul: 'veritabanı dışındaki bağlantı denenirken' },
      { ad: 'Hata kaydı açma', uclar: ['/platform/entegrasyon/hata-kaydi/ac'] },
      { ad: 'Koşu bitti bildirimi', uclar: [] }
    ],
    risk: 'Test sonuçları, hata metinleri ve ekler kurum dışındaki bir sisteme çıkabilir.',
    kapaliyken: 'Dışarıya hiçbir bildirim ya da kayıt gönderilmez; bağlantıların durumuna "izin kapalı" yazılır.'
  },
  {
    anahtar: 'arka-plan',
    etiket: 'Arka plan çalışması',
    aciklama: 'Siz ekran başında değilken zamanlanmış koşuların başlamasına ve kasa kilitliyken çalışmasına izin verir.',
    yapabilecekleri: [
      'Zamanlanmış koşuları vakti gelince sizin adınıza başlatmak.',
      'Kasa kilitliyken zamanlanmış koşular için kasa anahtarını yalnız bellekte tutmak ("Kilitliyken de çalışsın").'
    ],
    yerler: [
      'Ayarlar > Koşu > Zamanlanmış koşular',
      'Ayarlar > Koşu > Zamanlanmış koşular > Kilitliyken de çalışsın'
    ],
    islemler: [
      { ad: 'Zamanlanmış koşuların başlatılması', uclar: [] },
      { ad: '"Kilitliyken de çalışsın" tercihini açma', uclar: ['/platform/zamanlama/tercih'], kosul: '"Kilitliyken de çalışsın" açılırken' }
    ],
    risk: 'Koşular siz izlemezken çalışır; kilitliyken anahtar bellekte kalır.',
    kapaliyken: 'Zamanlanmış koşular başlamaz; geçmişte "izin kapalı" olarak görünür. "Kilitliyken de çalışsın" açılamaz.'
  },
  {
    anahtar: 'sistem-degisikligi',
    etiket: 'Sistem değişikliği',
    aciklama: 'Nöbetçi\'nin bilgisayarınızın ayarlarında kalıcı değişiklik yapmasına izin verir.',
    yapabilecekleri: [
      'Windows Görev Zamanlayıcı\'ya oturum açılışında Nöbetçi\'yi başlatan görev eklemek.',
      'Kasa anahtarını Windows DPAPI ile şifreleyip bilgisayara dosya olarak yazmak.'
    ],
    yerler: [
      'Ayarlar > Koşu > Zamanlanmış koşular > Windows oturumuna bağlı otomatik açma',
      'Ayarlar > Koşu > Zamanlanmış koşular > Bilgisayar açılınca başlasın'
    ],
    islemler: [
      { ad: 'DPAPI anahtar dosyası oluşturma', uclar: ['/platform/zamanlama/tercih'], kosul: 'DPAPI tercihi açılırken' },
      { ad: 'Windows oturum açılışı görevi ekleme', uclar: ['/platform/zamanlama/tercih'], kosul: 'oturum açılışı tercihi açılırken' }
    ],
    risk: 'Windows oturumunuzu açan herkes kasanın kilidini açmadan zamanlanmış koşuları çalıştırabilir; bilgisayar açılışı değişir.',
    kapaliyken: 'Görev eklenmez, anahtar dosyası yazılmaz. Mevcut görevi / dosyayı kaldırmak her zaman serbesttir.'
  },
  {
    anahtar: 'guvenlik-gevsetme',
    etiket: 'Güvenlik gevşetme',
    aciklama: 'Servislerde TLS sertifika doğrulamasının kapatılmasına ve bu ayarla istek gönderilmesine izin verir.',
    yapabilecekleri: [
      'Bir serviste TLS sertifika doğrulamasını kapatmak.',
      'TLS doğrulaması kapalı servislere istek göndermek.'
    ],
    yerler: [
      'Servisler > Servis > Ayarlar > TLS doğrulaması',
      'Servisler > Servis ekle / REST sihirbazı > TLS doğrulaması',
      'TLS doğrulaması kapalı servislerin koşuları'
    ],
    islemler: [
      { ad: 'TLS doğrulamasını kapatma', uclar: ['/platform/servis/kaydet', '/platform/servis/rest/kaydet'], kosul: 'TLS doğrulaması kapatılırken' },
      { ad: 'TLS doğrulaması kapalı istek', uclar: ['/platform/servis/erisim', '/platform/servis/sema/yenile', '/platform/servis/rest/dene', ...SERVIS_KOSU_UCLARI], kosul: 'servisin TLS doğrulaması kapalıysa' }
    ],
    risk: 'Sahte sertifikalı bir sunucu araya girip istekleri ve yanıtları (kimlik bilgileri dahil) okuyabilir.',
    kapaliyken: 'TLS doğrulaması kapatılamaz; doğrulaması kapalı servislere istek gönderilmez.'
  }
]);

/** İzin anahtarları (sıra: Ayarlar > İzinler'deki sıra). */
export const IZIN_ANAHTARLARI = Object.freeze(IZIN_TANIMLARI.map((t) => t.anahtar));

/** @param {string} anahtar @returns {IzinTanimi | undefined} */
export function izinTanimi(anahtar) {
  return IZIN_TANIMLARI.find((t) => t.anahtar === anahtar);
}

/** Standart kullanıcı uyarısı (sunucu yanıtı, koşucu, zamanlayıcı ve arayüz aynı metni kullanır). @param {string} anahtar */
export function izinMesaji(anahtar) {
  const t = izinTanimi(anahtar);
  return `Bu işlem için Ayarlar > İzinler'de "${t ? t.etiket : anahtar}" iznini açmalısınız.`;
}

/** Zamanlanmış koşu / otomatik işlem kaydındaki kısa not ("izin kapalı: X"). @param {string} anahtar */
export function izinKapaliNotu(anahtar) {
  const t = izinTanimi(anahtar);
  return `izin kapalı: ${t ? t.etiket : anahtar}`;
}

/** Ayarlar > İzinler'de izin satırının adresi (odak). @param {string} anahtar */
export const izinAdresi = (anahtar) => `#/ayarlar/izinler/${encodeURIComponent(anahtar)}`;
