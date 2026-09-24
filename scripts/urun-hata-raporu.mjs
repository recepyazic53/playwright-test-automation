// TEK EKRAN test dashboard'u: ürün bazlı özet + "son koşu" hızlı bakış + ürüne
// tıklayınca açılan, tarih aralığı seçilebilen HATA KALIBI tablosu.
//
// Neden "hata kalıbı"? Aynı hata farklı testlerde farklı değişken değerlerle
// (teklif no, id, tarih vb.) çıkar — örn:
//   "250166487 numaralı teklif onaylanamadı..."
//   "250166488 numaralı teklif onaylanamadı..."
// Bu script mesajdaki değişken (sayısal) kısımları "#" ile değiştirip sabit
// KALIBI çıkarır (örn. "# numaralı teklif onaylanamadı...") ve aynı kalıba
// düşen tüm hataları tek satırda toplayıp sayar. Ürüne tıklayıp iki tarih
// seçtiğinizde, o aralıkta hangi kalıptan kaç adet geldiğini gösterir.
//
// allure-results-<ortam>/ klasörü hiç temizlenmediği için (bkz. allure-history-sync.mjs
// ve README) içinde geçmişteki TÜM koşuların ham sonuç dosyaları birikir. Bu script
// o dosyaların tamamını okuyup tek bir HTML sayfasına gömer; tarih aralığı filtresi
// sayfa açıldıktan sonra JavaScript ile anlık çalışır — yeniden komut çalıştırmaya
// gerek kalmaz.
//
// Tek çıktı üretir: dashboard-<ortam>.html
// (npm run rapor:test / rapor:canli ile üretilip tarayıcıda otomatik açılır.
//  Allure raporu artık zorunlu ikinci ekran değil; sadece adım adım/trace
//  incelemek isterseniz diye dashboard'daki küçük bilgi notunda anılır.)
//
// Kullanım:
//   node scripts/urun-hata-raporu.mjs test
//   node scripts/urun-hata-raporu.mjs canli
// (veya npm run hata:ozet:test / npm run hata:ozet:canli / npm run rapor:test / rapor:canli)
//
// Kategori tanımları playwright.config.ts'teki allure-playwright "categories"
// listesiyle aynı mantığı kullanır; ikisini birlikte güncelleyin.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenGetirYaOlustur, tumSenaryolariGetir, PORT as TEST_SUNUCU_PORT } from './test-sunucu.mjs';
import { eskiVideolariTemizle } from './medya-temizligi.mjs';
import { haricTutulanlariOku, kosuListesiAnahtari } from './kosu-listesi.mjs';

const ortam = process.argv[2];

if (!ortam || !['test', 'canli'].includes(ortam)) {
  console.error('Kullanım: node scripts/urun-hata-raporu.mjs <test|canli>');
  process.exit(1);
}

// Dashboard'un "üretim anı" — sonuç dosyaları okunmaya BAŞLAMADAN alınır. İstemci
// tarafında localStorage'da tutulan dashboard koşularından (bkz. anlikKosuDepoyuYukle)
// zamanı bu değere eşit/küçük olanlar zaten aşağıda okunan Allure sonuçlarında yer
// aldığı için atılır (çift sayılmasınlar). Okumadan ÖNCE alınması, okuma sırasında
// biten bir koşunun hem rapordan hem depodan düşmesini engeller.
const uretimBaslangicMs = Date.now();

const sonuclarKlasoru = join(process.cwd(), `allure-results-${ortam}`);
const sonuclarKlasoruGoreli = `allure-results-${ortam}`;

// Video saklama kuralı: VIDEO_SAKLAMA_GUN'den (varsayılan 30) eski videolar rapor
// üretilmeden ÖNCE silinir — böylece aşağıda artık var olmayan bir videoya bağlantı
// verilmez (bkz. medya-temizligi.mjs). Ekran görüntüleri ve sonuç JSON'ları silinmez.
eskiVideolariTemizle(process.cwd(), [ortam], '[urun-hata-raporu]');

// Sonuç klasörü yoksa (ör. proje yeni kurulduysa ve hiç test koşulmadıysa) rapor
// DURMAZ — dashboard yine üretilir; ürünler ve senaryolar projedeki spec
// dosyalarından listelenir, sonuç tabloları boş görünür.
const sonuclarKlasoruVar = existsSync(sonuclarKlasoru);
if (!sonuclarKlasoruVar) {
  console.warn(`"${sonuclarKlasoru}" bulunamadı — henüz koşu yok, dashboard yalnızca senaryo listesiyle üretilecek.`);
}

// YEDEK gruplama: "kosuKimligi" etiketi OLMAYAN (bu özellikten önce yazılmış) eski
// sonuçlarda, iki sonuç arasında bu kadar boşluk varsa (ms) aralarında yeni bir koşu
// (ayrı bir npm run test... çağrısı) başladığı kabul edilir. Etiketli sonuçlar doğrudan
// kosuKimligi'ne göre gruplanır (bkz. aşağıdaki "2) ... KOŞULARA kümele").
const KOSU_BOSLUGU_MS = 10 * 60 * 1000; // 10 dakika

// Kategori ADLARI ve SIRASI (istemci tarafında renk eşlemesi bu sıraya göre yapılır —
// bkz. KATEGORI_RENKLERI). Sınıflandırma MANTIĞI ise aşağıdaki kategoriBul()'dadır;
// bu dizinin sırası artık "hangisi önce denenir" anlamına GELMEZ.
const KATEGORI = {
  popup: 'İş Kuralı / Ekran Hatası (Pop-up)',
  zamanAsimi: 'Zaman Aşımı (Timeout)',
  secici: 'Seçici / Elemana Ulaşılamadı',
  dogrulama: 'Doğrulama (Assertion) Hatası',
  diger: 'Diğer / Sınıflandırılamadı'
};
const KATEGORILER = [KATEGORI.popup, KATEGORI.zamanAsimi, KATEGORI.secici, KATEGORI.dogrulama].map((ad) => ({ ad }));

const POPUP_DESENI = /beklenmeyen bir hata pop.?up/i;
// "locator.click: Timeout 30000ms exceeded." / "Test timeout of 180000ms exceeded." /
// "TimeoutError: page.waitForFunction: Timeout 20000ms exceeded."
const ZAMAN_ASIMI_DESENI = /\btimeout\b.*\bexceeded\b/i;
// Playwright 1.5x doğrulama mesajının İLK satırı: "Error: expect(locator).toHaveText(expected) failed",
// "expect.poll(...)..." vb. (başındaki "Error: " öneki Playwright'ın serializeError'ından gelir).
const DOGRULAMA_ILK_SATIR_DESENI = /^(?:\w*Error:\s*)?expect(?:\.\w+)?\(.*\).*\bfailed\b/;
// Özel mesajlı expect (expect(x, 'Açıklama').toBeTruthy()) ilk satırda açıklamayı taşır;
// asıl matcher satırı ("expect(received).toBeTruthy()") ve "Expected:/Received:" satırları
// mesajın devamında, SATIR BAŞINDA yer alır.
const DOGRULAMA_GOVDE_DESENI = /^\s*(?:expect(?:\.\w+)?\((?:received|locator|page)\)|Expected(?: string| value| pattern)?:|Received(?: string| value)?:)/m;
// Playwright 1.5x çağrı günlüğü artık "waiting for locator(...)" yerine çoğunlukla
// "waiting for getByRole(...)" yazar — ikisi de kapsanır.
const SECICI_DESENI = /(element\(s\) not found|strict mode violation|resolved to \d+ elements|waiting for (?:locator|getBy\w+|frameLocator)\()/i;

// Hata kategorisini bulur. ÖNEMLİ: Playwright'ın locator doğrulama mesajları
// (toHaveText/toHaveValue/toBeVisible...) HER ZAMAN çağrı günlüğünde
// "waiting for locator(...)" ya da "element(s) not found" satırı içerir; tüm mesaj
// üzerinde sırayla desen aransaydı (eski davranış) bunlar hep "Seçici" sayılır,
// "Doğrulama" neredeyse hiç eşleşmezdi. Bu yüzden karar öncelikle mesajın İLK
// satırına göre, şu sırayla verilir:
//   1) Beklenmeyen hata pop-up'ı (iş kuralı) — tüm mesajda aranır, özel/uzun metin.
//   2) Zaman aşımı — ilk satırda "timeout ... exceeded" (test/aksiyon zaman aşımı).
//      (Çağrı günlüğündeki "Timeout 45000ms exceeded while waiting on the predicate"
//      gibi satırlar ilk satırda olmadığından doğrulama olarak kalır.)
//   3) Doğrulama — ilk satır "expect(...)... failed" ya da mesajda satır başında
//      "expect(received)..." / "Expected:" / "Received:" var.
//   4) Seçici — element(s) not found / strict mode violation / "waiting for locator".
//   5) Diğer.
// playwright.config.ts'teki allure "categories" regex'leri aynı sırayı/mantığı taklit
// eder (Allure bir sonucu eşleşen TÜM kategorilere koyduğundan orada karşılıklı
// dışlayan regex'ler kullanıldı); ikisini birlikte güncelleyin.
function kategoriBul(mesaj) {
  if (!mesaj) return KATEGORI.diger;
  const ilkSatir = mesaj.split('\n')[0].trim();
  if (POPUP_DESENI.test(mesaj)) return KATEGORI.popup;
  if (ZAMAN_ASIMI_DESENI.test(ilkSatir)) return KATEGORI.zamanAsimi;
  if (DOGRULAMA_ILK_SATIR_DESENI.test(ilkSatir) || DOGRULAMA_GOVDE_DESENI.test(mesaj)) return KATEGORI.dogrulama;
  if (SECICI_DESENI.test(mesaj)) return KATEGORI.secici;
  return KATEGORI.diger;
}

// Hata mesajındaki hedef locator'ı bulur. Playwright 1.5x doğrulama mesajlarında ayrı
// bir "Locator: getByRole('button', { name: 'Prim Hesapla' })" satırı bulunur; yoksa
// (ör. "locator.click: Timeout ... exceeded" gibi aksiyon hatalarında) çağrı
// günlüğündeki ilk "waiting for <locator>" satırı kullanılır.
function locatorBul(mesajTam) {
  const locatorSatiri = mesajTam.match(/^\s*Locator:\s*(.+)$/m);
  if (locatorSatiri) return locatorSatiri[1].trim();
  const beklemeSatiri = mesajTam.match(/^\s*-\s*waiting for ((?:locator|getBy\w+|frameLocator)\(.+)$/m);
  return beklemeSatiri ? beklemeSatiri[1].trim() : null;
}

// Hata mesajının SABİT KALIBINI çıkarır: değişken (sayısal) kısımlar "#" olur.
// "250166487 numaralı teklif onaylanamadı" -> "# numaralı teklif onaylanamadı"
// Mesajda bir locator varsa kalıba eklenir; böylece farklı ekranlardaki
// "expect(locator).toBeVisible() failed" hataları tek satıra yığılmaz:
// "Error: expect(locator).toBeVisible() failed · getByRole('button', { name: 'Prim Hesapla' })"
function kalipCikar(mesajTam) {
  if (!mesajTam) return 'Mesaj yok / boş hata';
  let ilkSatir = mesajTam.split('\n')[0].trim();
  if (!ilkSatir) return 'Mesaj yok / boş hata';

  const locator = locatorBul(mesajTam);
  // İlk satır locator'ı zaten içeriyorsa (ör. strict mode violation) tekrar eklenmez.
  const hamKalip = locator && !ilkSatir.includes(locator) ? `${ilkSatir} · ${locator}` : ilkSatir;

  let kalip = hamKalip
    // UUID benzeri değerleri önce sil (sayı deseni bunları yarım bırakabilir)
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '#')
    // Her sayısal diziyi (teklif no, id, tarih, tutar vb.) tek karaktere indir
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

  // Locator eklendiği için sınır 180'den 240'a çıkarıldı.
  if (kalip.length > 240) kalip = kalip.slice(0, 237) + '...';
  return kalip;
}

// --- Durum eşleme (TEK KAYNAK) ---
// Bir Allure sonucunu dashboard durumuna çevirir: 'basarili' | 'basarisiz' | 'atlanan' |
// 'durduruldu'. kosuOzetiCikar, kosuSenaryolariCikar ve tumKayitlar hep bunu kullanır
// (eskiden 'unknown' bir yerde yok sayılıp diğerlerinde başarısız sayılıyordu).
// "Durduruldu" = kullanıcı durdurdu / koşu yarıda kesildi — BAŞARISIZ SAYILMAZ:
//   - status 'unknown' ya da hiç yok (Allure sonucu tamamlanmamış),
//   - failed/broken ama mesaj "Test was interrupted" (Playwright interrupted),
//   - failed/broken ve HİÇ hata mesajı yok: Playwright, Ctrl+C/SIGTERM ile kesilen
//     (status 'interrupted') testlere hata eklemez; allure-playwright bunu 'failed'
//     olarak yazar. Kendi başına başarısız olan her test (zaman aşımı dahil — o
//     'broken' + "Test timeout of ...ms exceeded." mesajıyla gelir) bir hata taşır.
// NOT: "navigation ... is interrupted by another navigation" gibi GERÇEK hatalar
// kasıtlı olarak eşleşmez (desen yalnızca "Test was interrupted").
const KESINTI_DESENI = /\bTest (?:run )?was interrupted\b/i;
function durumEsle(icerik) {
  const status = icerik.status;
  if (status === 'passed') return 'basarili';
  if (status === 'skipped') return 'atlanan';
  if (status === 'failed' || status === 'broken') {
    const mesaj = icerik.statusDetails?.message ?? '';
    if (!mesaj.trim() || KESINTI_DESENI.test(mesaj)) return 'durduruldu';
    return 'basarisiz';
  }
  return 'durduruldu'; // 'unknown', undefined veya tanınmayan bir değer
}

function kosuEtiketi(zamanDamgasiMs) {
  return new Date(zamanDamgasiMs).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Başarı ORANI paydası: "Durduruldu" (kullanıcı durdurdu) testler bilinçli olarak
// dahil edilmez — oranı düşürüp başarısızlık gibi görünmesinler.
function kacHesapla(icerikTuru) {
  return icerikTuru.basarili + icerikTuru.basarisiz + icerikTuru.atlanan;
}

// NOT (dosya boyutu): Ekran görüntüleri eskiden HTML'e base64 "data:" URI olarak
// gömülüyordu (aynı görüntü 3 yere kadar) ve dashboard onlarca MB'a çıkıyordu. Allure
// ekleri zaten dashboard'un yanındaki allure-results-<ortam>/ klasöründe dosya olarak
// durduğu için artık yalnızca GÖRELİ YOL taşınır (ör. "allure-results-test/<uuid>-
// attachment.png"); dashboard file:// olarak aynı klasörden açıldığından tarayıcı
// dosyayı doğrudan bulur. Dosya diskte yoksa (silinmiş/taşınmış) null döner ve
// arayüz "ekran görüntüsü bulunamadı"/video bağlantısı yok davranışına düşer.
function ekGoreliYolu(ek) {
  if (!ek?.source) return null;
  if (!existsSync(join(sonuclarKlasoru, ek.source))) return null;
  return `${sonuclarKlasoruGoreli}/${encodeURIComponent(ek.source)}`;
}

function ekranGoruntusuYoluGetir(icerik) {
  // Ekran görüntüsü eki iki farklı yerde olabilir: klasik icerik.attachments dizisinde,
  // ya da (allure-playwright "detail:true" ile) icerik.steps içinde ayrı bir "sözde adım"
  // olarak (o adımın kendi attachments alanında). Playwright'ın kendi "screenshot:
  // only-on-failure" eki tam olarak böyle, "screenshot" adlı bir sözde adımın içinde
  // gelir ve testin hata anına en yakın çekilen görüntüdür — bizim hataYakalayici
  // fixture'ımızın "❌ HATA ANI - Ekran Görüntüsü" eki ise (özellikle test.setTimeout ile
  // sayfa/context zaten kapanmışsa) çoğu zaman hiç oluşmaz; bu yüzden "screenshot" önce
  // denenir, o yoksa bizim eke bakılır.
  const tumEkler = [...(icerik.attachments ?? []), ...(icerik.steps ?? []).flatMap((s) => s.attachments ?? [])];
  const ekBulunan =
    tumEkler.find((ek) => ek.type === 'image/png' && ek.name === 'screenshot') ??
    tumEkler.find((ek) => ek.type === 'image/png' && /Ekran Görüntüsü/i.test(ek.name ?? ''));
  return ekGoreliYolu(ekBulunan);
}

// Playwright'ın koşu videosu (allure-playwright bunu "video/webm" türünde ek olarak
// kopyalar; ek, sözde adımların içinde de olabildiği için adımlar derinlemesine gezilir).
// VIDEO_SAKLAMA_GUN'den eski videolar silindiğinden dosya yoksa null döner — arayüz o
// zaman "▶ Videoyu izle" bağlantısını hiç göstermez.
function videoYoluGetir(icerik) {
  const yigin = [icerik];
  while (yigin.length) {
    const dugum = yigin.pop();
    const ek = (dugum.attachments ?? []).find((e) => e.type === 'video/webm');
    if (ek) return ekGoreliYolu(ek);
    for (const adim of dugum.steps ?? []) yigin.push(adim);
  }
  return null;
}

// --- 1) Tüm ham sonuç dosyalarını oku ---
const dosyalar = (sonuclarKlasoruVar ? readdirSync(sonuclarKlasoru) : []).filter((dosya) => dosya.endsWith('-result.json'));
const tumIcerikler = [];

for (const dosya of dosyalar) {
  let icerik;
  try {
    icerik = JSON.parse(readFileSync(join(sonuclarKlasoru, dosya), 'utf-8'));
  } catch {
    continue;
  }
  const zaman = icerik.stop ?? icerik.start;
  if (!zaman) continue; // zaman bilgisi yoksa (bozuk/eksik dosya) atla
  tumIcerikler.push({ icerik, zaman });
}

tumIcerikler.sort((a, b) => a.zaman - b.zaman);

if (tumIcerikler.length === 0) {
  console.warn('Henüz kayıtlı koşu sonucu yok — dashboard yalnızca senaryo listesiyle üretilecek.');
}

// --- 2) "Son koşu" hızlı bakış için sonuçları KOŞULARA kümele ---
// Öncelik "kosuKimligi" Allure etiketinde (global-setup.ts her "playwright test"
// çağrısına benzersiz bir kimlik verir, fixtures.ts bunu her sonuca yazar): aynı
// kimliği taşıyan sonuçlar — koşu ne kadar uzun sürerse sürsün — tek koşudur. Etiketi
// olmayan ESKİ sonuçlar kendi aralarında eskisi gibi 10 dakikalık boşluk kuralıyla
// gruplanır. Her koşunun bir türü vardır: 'tam' (npm run test / CI) ya da 'tekil'
// (dashboard'daki ▷ ile tetiklenen tek senaryo, kosuTuru etiketi). Etiketsiz eski
// koşular 'tam' kabul edilir (o dönemde tür bilgisi yoktu).
function etiketDegeri(icerik, ad) {
  return (icerik.labels ?? []).find((e) => e.name === ad)?.value ?? null;
}

function kosuyaEkle(kosu, icerik, zaman) {
  kosu.bitis = Math.max(kosu.bitis, zaman);
  const anahtar = icerik.historyId ?? icerik.uuid;
  const mevcut = kosu.testler.get(anahtar);
  if (!mevcut || zaman >= (mevcut._zaman ?? 0)) {
    icerik._zaman = zaman;
    kosu.testler.set(anahtar, icerik);
  }
}

const kosular = [];
const kimlikliKosular = new Map(); // kosuKimligi -> koşu
let sonEtiketsizKosu = null;
for (const { icerik, zaman } of tumIcerikler) {
  const kimlik = etiketDegeri(icerik, 'kosuKimligi');
  let kosu;
  if (kimlik) {
    kosu = kimlikliKosular.get(kimlik);
    if (!kosu) {
      kosu = { bitis: zaman, testler: new Map(), kimlik, tur: 'tam', kapsam: 'Genel' };
      kimlikliKosular.set(kimlik, kosu);
      kosular.push(kosu);
    }
    // Koşudaki TEK bir sonuç bile "tam" ise koşu tamdır; hepsi "tekil" ise tekildir.
    if (etiketDegeri(icerik, 'kosuTuru') === 'tekil' && kosu.testler.size === 0) kosu.tur = 'tekil';
    else if (etiketDegeri(icerik, 'kosuTuru') !== 'tekil') {
      kosu.tur = 'tam';
      // Kapsam: dashboard'da bir ürün seçiliyken başlatılan koşu o ürünün adını taşır;
      // etiketsiz (eski) ya da terminal/CI koşuları 'Genel'dir (bkz. fixtures.ts).
      kosu.kapsam = etiketDegeri(icerik, 'kosuKapsami') || kosu.kapsam || 'Genel';
    }
  } else {
    if (!sonEtiketsizKosu || zaman - sonEtiketsizKosu.bitis > KOSU_BOSLUGU_MS) {
      sonEtiketsizKosu = { bitis: zaman, testler: new Map(), kimlik: null, tur: 'tam', kapsam: 'Genel' };
      kosular.push(sonEtiketsizKosu);
    }
    kosu = sonEtiketsizKosu;
  }
  kosuyaEkle(kosu, icerik, zaman);
}
// Kronolojik sıra (en eski önce) — koşunun BİTİŞ zamanına göre; "son koşu" en son biten.
kosular.sort((a, b) => a.bitis - b.bitis);
for (const kosu of kosular) kosu.etiket = kosuEtiketi(kosu.bitis);

function kosuOzetiCikar(testMap) {
  let basarili = 0;
  let basarisiz = 0;
  let atlanan = 0;
  let durduruldu = 0;
  const urunToplamlari = {};
  for (const icerik of testMap.values()) {
    const epicEtiketi = (icerik.labels ?? []).find((e) => e.name === 'epic');
    const urun = epicEtiketi?.value ?? 'Bilinmiyor';
    urunToplamlari[urun] ??= { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
    const durum = durumEsle(icerik);
    if (durum === 'basarili') basarili += 1;
    else if (durum === 'basarisiz') basarisiz += 1;
    else if (durum === 'atlanan') atlanan += 1;
    else durduruldu += 1;
    urunToplamlari[urun][durum] += 1;
  }
  return { basarili, basarisiz, atlanan, durduruldu, urunToplamlari };
}

// Bir koşudaki her testin (senaryonun) adım adım (test.step) başarı/başarısız listesini,
// ürün bazında gruplayarak çıkarır — "Koşu geçmişi" satırına tıklayınca açılan
// Koşu > Ürün > Senaryo > Adım detay penceresinin veri kaynağıdır. Sadece BAŞARISIZ
// adımlarda mesaj/ekran görüntüsü taşınır (dosya boyutu büyümesin diye) — başarılı
// adımlarda zaten gösterilecek bir "açıklama" yok.
function kosuSenaryolariCikar(testMap) {
  const urunSenaryolari = {}; // urun -> [ { senaryoAdi, durum, genelMesaj, adimlar: [...] } ]
  for (const icerik of testMap.values()) {
    const epicEtiketi = (icerik.labels ?? []).find((e) => e.name === 'epic');
    const urun = epicEtiketi?.value ?? 'Bilinmiyor';
    const durum = durumEsle(icerik);

    const adimlar = [];
    for (const adim of icerik.steps ?? []) {
      const ad = adim.name ?? 'İsimsiz adım';
      if (adimGurultuMu(ad)) continue;
      if (adim.status !== 'passed' && adim.status !== 'failed' && adim.status !== 'broken') continue;
      // Durdurulan testte yarıda kesilen adım "başarısız" gösterilmez (yalnızca geçenler listelenir).
      if (durum === 'durduruldu' && adim.status !== 'passed') continue;
      const adimBasarisizMi = adim.status === 'failed' || adim.status === 'broken';
      adimlar.push({
        ad,
        basarili: !adimBasarisizMi,
        m: adimBasarisizMi ? adim.statusDetails?.message || icerik.statusDetails?.message || '' : '',
        g: adimBasarisizMi ? ekranGoruntusuYoluGetir(icerik) : null,
        v: adimBasarisizMi ? videoYoluGetir(icerik) : null
      });
    }

    urunSenaryolari[urun] ??= [];
    urunSenaryolari[urun].push({
      ad: icerik.name ?? icerik.fullName ?? 'İsimsiz test',
      durum,
      genelMesaj: durum === 'basarisiz' ? (icerik.statusDetails?.message ?? '') : '',
      adimlar
    });
  }
  // Her ürün içinde başarısız senaryolar üstte (araması gereken kişi önce onları görsün),
  // aralarında isim sırasına göre (tutarlı/tekrarlanabilir bir sıralama için).
  for (const urun of Object.keys(urunSenaryolari)) {
    urunSenaryolari[urun].sort((a, b) => {
      if (a.durum === 'basarisiz' && b.durum !== 'basarisiz') return -1;
      if (a.durum !== 'basarisiz' && b.durum === 'basarisiz') return 1;
      return a.ad.localeCompare(b.ad, 'tr');
    });
  }
  return urunSenaryolari;
}

// --- Üst kartlar (ürün bazlı "koşu" mantığı) ---
// Koşu türleri: 'tam' = "koşu" (dashboard'daki aramasız "Koşuyu başlat" ya da her
// terminal/CI koşusu); 'tekil' = diğer her şey (Seçilenleri çalıştır, tek ▷, aramalı
// koşular). Kartlar ve trend YALNIZCA 'tam' koşulara bakar — tekil koşular "Koşu
// geçmişi"nde (rozetle), hata kalıplarında ve ürün/adım tablolarında sayılmaya devam eder.
//
// Ürün sayfası (P): P'nin sonuçlarını İÇEREN en son koşudaki (P kapsamlı ya da Genel)
// yalnızca P'nin sayıları; "önceki" = P'yi içeren bir önceki koşu.
// Genel sayfa: GÜNCEL DURUM = her ürünün kendi son koşusundaki sayıların toplamı (yalnızca
// JetSeyahat koşulursa toplamın yalnızca JetSeyahat kısmı değişir); "önceki" = her ürünün
// bir önceki koşusunun toplamı (önceki koşusu olmayan ürün, değişim üretmesin diye kendi
// son koşusuyla sayılır). Hiçbir ürünün önceki koşusu yoksa fark gösterilmez.
function durumToplami(s) {
  return s ? s.basarili + s.basarisiz + s.atlanan + (s.durduruldu || 0) : 0;
}
function sayilariTopla(liste) {
  const toplam = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
  for (const s of liste) {
    toplam.basarili += s.basarili;
    toplam.basarisiz += s.basarisiz;
    toplam.atlanan += s.atlanan;
    toplam.durduruldu += s.durduruldu || 0;
  }
  return toplam;
}

for (const kosu of kosular) kosu.ozet = kosuOzetiCikar(kosu.testler);
const tamKosular = kosular.filter((kosu) => kosu.tur === 'tam');

// urun -> o ürünün sonucunu içeren tam koşular (kronolojik, en eski önce).
const urunTamKosulari = {};
for (const kosu of tamKosular) {
  for (const [urun, sayilar] of Object.entries(kosu.ozet.urunToplamlari)) {
    if (durumToplami(sayilar) > 0) (urunTamKosulari[urun] ??= []).push(kosu);
  }
}

function urunKosuOzeti(kosu, urun) {
  const s = kosu.ozet.urunToplamlari[urun];
  return { etiket: kosu.etiket, z: kosu.bitis, kapsam: kosu.kapsam, basarili: s.basarili, basarisiz: s.basarisiz, atlanan: s.atlanan, durduruldu: s.durduruldu };
}

const urunKartlari = {};
for (const [urun, liste] of Object.entries(urunTamKosulari)) {
  urunKartlari[urun] = {
    son: urunKosuOzeti(liste[liste.length - 1], urun),
    onceki: liste.length > 1 ? urunKosuOzeti(liste[liste.length - 2], urun) : null
  };
}

const urunKartListesi = Object.values(urunKartlari);
const genelOncekiVarMi = urunKartListesi.some((k) => k.onceki);
const genelKart = urunKartListesi.length
  ? {
      son: sayilariTopla(urunKartListesi.map((k) => k.son)),
      onceki: genelOncekiVarMi ? sayilariTopla(urunKartListesi.map((k) => k.onceki ?? k.son)) : null,
      // Kaynak açıklaması için: ürünlerin son koşularından en yenisi ve en eskisi.
      enYeniZ: Math.max(...urunKartListesi.map((k) => k.son.z)),
      enEskiZ: Math.min(...urunKartListesi.map((k) => k.son.z)),
      urunSayisi: urunKartListesi.length
    }
  : null;
if (genelKart) {
  genelKart.enYeniEtiket = kosuEtiketi(genelKart.enYeniZ);
  genelKart.enEskiEtiket = kosuEtiketi(genelKart.enEskiZ);
}

// Konsol/markdown özeti ve kenar çubuğu donutu Genel GÜNCEL DURUMU gösterir (kartlarla aynı).
const sonKosuOzet = {
  ...(genelKart?.son ?? { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 }),
  urunToplamlari: Object.fromEntries(Object.entries(urunKartlari).map(([urun, k]) => [urun, k.son]))
};
const oncekiKosuOzet = genelKart?.onceki ?? null;
const sonKosuEtiketi = !genelKart
  ? 'Henüz koşu yok'
  : genelKart.enYeniZ === genelKart.enEskiZ
    ? genelKart.enYeniEtiket
    : `her ürünün son koşusu (en yenisi ${genelKart.enYeniEtiket})`;

// "Koşu geçmişi" tablosu + "Koşu trendi" grafiği için: TÜM koşuların başarılı/
// başarısız/atlanan sayıları, hem genel hem de ürün bazında (kronolojik sırayla,
// en eski önce). Her ikisi de istemci tarafında aynı diziden (VERI.kosuGecmisi),
// kendi tarih aralığı filtresine göre süzülür.
const tumKosuOzetleri = kosular.map((kosu) => {
  const ozet = kosu.ozet;
  return {
    etiket: kosu.etiket,
    etiketKisa: new Date(kosu.bitis).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
    z: kosu.bitis,
    // 'tam' | 'tekil' — istemci trendi yalnızca 'tam' koşularla çizer, "Koşu geçmişi"nde
    // tekil koşulara küçük bir rozet koyar.
    tur: kosu.tur,
    // 'Genel' ya da ürün adı (yalnızca tam koşularda anlamlı) — Genel trendi yalnızca
    // 'Genel' kapsamlı koşulardan çizilir; ürün kapsamlı koşular geçmişte rozetle görünür.
    kapsam: kosu.tur === 'tam' ? kosu.kapsam : null,
    basarili: ozet.basarili,
    basarisiz: ozet.basarisiz,
    atlanan: ozet.atlanan,
    durduruldu: ozet.durduruldu,
    urunler: ozet.urunToplamlari
  };
});

// Adım (step) bazlı başarı/başarısız gezgini için: allure-playwright her test.step()
// çağrısını icerik.steps altında kaydeder. SADECE üst seviye (senaryo dosyalarımızda
// bizim açtığımız test.step() bloklarına karşılık gelen) adımlar sayılır — playwright.
// config.ts'deki `detail: true` ayarı yüzünden her fixture kurulumu ve her sayfa
// aksiyonu (Fill/Click/Navigate/Launch browser vb.) da otomatik olarak iç içe adım
// gibi kaydediliyor; bunların içine inmiyoruz (recursion yok), yoksa "Fill 'değer'"
// gibi anlamsız ve hatta hassas veri içerebilecek satırlar tabloyu doldurur.
// Ayrıca bilinen fixture/hook/otomatik-aksiyon adları ve boş (0/0) adımlar filtrelenir.
const ADIM_GURULTU_ADLARI = new Set([
  'Before Hooks',
  'After Hooks',
  'Launch browser',
  'Create context',
  'Create page',
  'Close context',
  'Navigate',
  'Click',
  'Screenshot'
]);

function adimGurultuMu(ad) {
  if (ADIM_GURULTU_ADLARI.has(ad)) return true;
  // "Fixture X", "Fill 'değer'", "Attach ..." gibi Playwright/allure otomatik
  // enstrümantasyon adları — hepsi belirli bir önekle başlıyor.
  return /^(Fixture |Fill |Attach |Expect |Get by|Locator|Wait for)/.test(ad);
}

// icerik/zaman parametreleri; her adım geçişi/başarısızlığı için (dashboard'da
// adım satırına tıklanınca açılan detay/popup listesi için) tek tek KAYIT tutulur —
// sadece sayaç değil. Başarısız kayıtlarda mesaj + varsa ekran görüntüsü de eklenir.
function adimlariGezVeTopla(icerik, zaman, sayaclar) {
  for (const adim of icerik.steps ?? []) {
    const ad = adim.name ?? 'İsimsiz adım';
    if (adimGurultuMu(ad)) continue;
    sayaclar[ad] ??= { basarili: 0, basarisiz: 0, kayitlar: [] };
    const basariliMi = adim.status === 'passed';
    const basarisizMi = adim.status === 'failed' || adim.status === 'broken';
    if (!basariliMi && !basarisizMi) continue; // 'skipped' vb. adım tablosuna dahil değil
    if (basariliMi) sayaclar[ad].basarili += 1;
    else sayaclar[ad].basarisiz += 1;
    sayaclar[ad].kayitlar.push({
      basarili: basariliMi,
      zaman,
      senaryoAdi: icerik.name ?? icerik.fullName ?? 'İsimsiz test',
      mesaj: basarisizMi ? (adim.statusDetails?.message || icerik.statusDetails?.message || '') : '',
      ekranGoruntusu: basarisizMi ? ekranGoruntusuYoluGetir(icerik) : null,
      video: basarisizMi ? videoYoluGetir(icerik) : null
    });
    // Kasıtlı olarak adim.steps içine inilmiyor — bizim test.step() bloklarımız kendi
    // içlerinde iç içe adım açmıyor, alt seviyedeki her şey Playwright'ın otomatik
    // enstrümantasyonudur.
  }
}

const ADIM_LISTESI_LIMIT = 30; // ürün başına gösterilecek en fazla adım satırı

// --- 3) Ürün + tarih aralığı gezgini için TÜM kayıtları düz listeye çıkar ---
// (retry/tekrar koşu ayrımı yapmadan — geçmişteki her çalıştırma bir "olay"dır,
// tarih aralığı istatistiği bunların tamamını sayar.)
const tumKayitlar = [];
// ornekler: 'urun|||kategori|||kalip' -> en son görülen örnek (mesaj + ekran görüntüsü)
const ornekler = new Map();
// urunAdimSayaclari: urun -> { [adımAdı]: { basarili, basarisiz } }
const urunAdimSayaclari = {};

for (const { icerik, zaman } of tumIcerikler) {
  const epicEtiketi = (icerik.labels ?? []).find((e) => e.name === 'epic');
  const featureEtiketi = (icerik.labels ?? []).find((e) => e.name === 'feature');
  const urun = epicEtiketi?.value ?? 'Bilinmiyor';
  const ozellik = featureEtiketi?.value ?? '';
  const durum = durumEsle(icerik);

  urunAdimSayaclari[urun] ??= {};
  // Durdurulan testlerin adımları "Adım bazlı başarı" tablosuna hiç yansımaz —
  // yarıda kesilen adım başarısız sayılmasın.
  if (durum !== 'durduruldu') adimlariGezVeTopla(icerik, zaman, urunAdimSayaclari[urun]);

  let kategori = null;
  let kalip = null;

  if (durum === 'basarisiz') {
    const mesajTam = icerik.statusDetails?.message ?? '';
    kategori = kategoriBul(mesajTam);
    kalip = kalipCikar(mesajTam);

    const anahtar = `${urun}|||${kategori}|||${kalip}`;
    const mevcutOrnek = ornekler.get(anahtar);
    const adayEkranGoruntusu = ekranGoruntusuYoluGetir(icerik);
    // Ekran görüntüsü olan bir örneği tercih et; ikisi de var/yoksa en yeniyi tut.
    const adayDahaIyiMi =
      !mevcutOrnek ||
      (!!adayEkranGoruntusu !== !!mevcutOrnek.ekranGoruntusu ? !!adayEkranGoruntusu : zaman >= mevcutOrnek.zaman);
    if (adayDahaIyiMi) {
      ornekler.set(anahtar, {
        zaman,
        baslik: icerik.name ?? icerik.fullName ?? 'İsimsiz test',
        ozellik,
        mesaj: mesajTam,
        ekranGoruntusu: adayEkranGoruntusu,
        video: videoYoluGetir(icerik)
      });
    }
  }

  tumKayitlar.push({ u: urun, z: zaman, d: durum, k: kategori, p: kalip });
}

const urunler = [...new Set(tumKayitlar.map((k) => k.u))].sort((a, b) => a.localeCompare(b, 'tr'));

// Bazı ürünlerde adım bazlı özet tablosu, en çok başarısız olan adımı değil, gerçek
// ekran akışı sırasını takip etsin diye (kullanıcı tercihi) elle tanımlı bir sıralama
// listesi tutuluyor. Listede olmayan bir adım (örn. henüz yeniden yapılandırılmamış
// eski bir isim) listenin sonuna, en çok başarısız olan üstte kalacak şekilde eklenir.
const ADIM_SIRASI = {
  JetKasko: [
    'Özel sigortalı ve plaka bilgileri girilir',
    'Tüzel sigortalı ve plaka bilgileri girilir',
    'Sigorta ettiren farklı tüzel ve araç bilgisi girişi',
    'Sigorta ettiren farklı özel ve araç bilgisi girişi',
    'Sigorta ettiren kendisi ve araç bilgisi girişi',
    'Prim hesaplanır',
    'Ürün seçimi',
    'Poliçeleştirme süreci başlatılması',
    'Kart bilgileri girişi',
    'Ödeme gönderilir ve sonuç doğrulanır'
  ]
};

// Tüm ürünlerde ortak olan, ürüne özel bilgi taşımayan adımlar (giriş/acente
// değiştirme testBaslangiciniHazirla() içinden, tüm senaryolarda birebir aynı) —
// ürün bazlı "Adım bazlı başarı" tablosunda gösterilmez. Bu adımların hata durumu
// zaten üstteki genel Başarısız sayısına ve "Hata kalıpları" bölümüne yansır.
const ORTAK_ADIMLAR = new Set(['Sisteme giriş yapılır', 'Acente ve kullanıcı değiştirilir']);

// "Koşu geçmişi" satırına tıklayınca açılan detay penceresi için: tumKosuOzetleri ile
// AYNI SIRADA/UZUNLUKTA, ama ayrı bir dizide tutulur (bu ağır veriyi (mesaj/ekran
// görüntüsü içerir) veri.kosuGecmisi'ne gömseydik gereksiz yere şişerdi).
// İstemci tarafında VERI.kosuDetaylari[i], VERI.kosuGecmisi[i] ile aynı koşuya karşılık gelir.
const kosuDetaylari = kosular.map((kosu) => kosuSenaryolariCikar(kosu.testler));

// Ürün başına adım listesi. ADIM_SIRASI'nda tanımlı ürünlerde ekran akışı sırası
// kullanılır; diğer ürünlerde (henüz elle sıralama tanımlanmamış) en çok başarısız
// olan adım en üstte gösterilir. En fazla ADIM_LISTESI_LIMIT satır.
const adimOzeti = {};
for (const urun of urunler) {
  const sayaclar = urunAdimSayaclari[urun] ?? {};
  const satirlar = Object.entries(sayaclar)
    .filter(([ad, s]) => !ORTAK_ADIMLAR.has(ad) && s.basarili + s.basarisiz > 0)
    .map(([ad, s]) => ({
      ad,
      basarili: s.basarili,
      basarisiz: s.basarisiz,
      toplam: s.basarili + s.basarisiz,
      // En yeni kayıt en üstte olacak şekilde sıralanır (detay popup'ında/listesinde
      // gösterilecek sıra budur).
      kayitlar: s.kayitlar
        .slice()
        .sort((a, b) => b.zaman - a.zaman)
        .map((k) => ({
          basarili: k.basarili,
          z: k.zaman, // istemci tarafında tarih aralığı filtresi için ham zaman damgası
          t: kosuEtiketi(k.zaman),
          ad: k.senaryoAdi,
          m: k.mesaj,
          g: k.ekranGoruntusu,
          v: k.video
        }))
    }));

  const sira = ADIM_SIRASI[urun];
  if (sira) {
    satirlar.sort((a, b) => {
      const aSira = sira.indexOf(a.ad);
      const bSira = sira.indexOf(b.ad);
      // Listede olmayan adımlar (-1) sona atılır, aralarında en çok başarısız üstte.
      if (aSira === -1 && bSira === -1) return b.basarisiz - a.basarisiz || b.toplam - a.toplam;
      if (aSira === -1) return 1;
      if (bSira === -1) return -1;
      return aSira - bSira;
    });
  } else {
    satirlar.sort((a, b) => b.basarisiz - a.basarisiz || b.toplam - a.toplam);
  }

  adimOzeti[urun] = satirlar.slice(0, ADIM_LISTESI_LIMIT);
}

// --- 4) Konsola kısa özet (hızlı bakış) ---
console.log(
  `\n${ortam.toUpperCase()} ortamı - güncel durum: ${sonKosuEtiketi} (kayıtlı koşu sayısı: ${kosular.length}, koşu: ${tamKosular.length}, tekil: ${kosular.length - tamKosular.length})\n`
);
console.log(
  `Toplam: ${kacHesapla(sonKosuOzet) + sonKosuOzet.durduruldu} test | Başarılı: ${sonKosuOzet.basarili} | Başarısız: ${sonKosuOzet.basarisiz} | Atlanan: ${sonKosuOzet.atlanan} | Durduruldu: ${sonKosuOzet.durduruldu}`
);
console.table(
  Object.entries(sonKosuOzet.urunToplamlari).map(([urun, s]) => ({
    Ürün: urun,
    Başarılı: s.basarili,
    Başarısız: s.basarisiz,
    Atlanan: s.atlanan,
    Durduruldu: s.durduruldu
  }))
);
console.log(`\nDetaylı, tarih aralığı filtrelenebilir hata kalıbı tablosu için dashboard-${ortam}.html dosyasını açın.`);

// --- 5) Kısa markdown özeti (paylaşım için) ---
const markdownSatirlari = [
  `# ${ortam.toUpperCase()} Ortamı - Hata ve Başarı Özeti`,
  '',
  `Güncel durum: ${sonKosuEtiketi}`,
  '',
  `Toplam: ${kacHesapla(sonKosuOzet) + sonKosuOzet.durduruldu} test | Başarılı: ${sonKosuOzet.basarili} | Başarısız: ${sonKosuOzet.basarisiz} | Atlanan: ${sonKosuOzet.atlanan} | Durduruldu: ${sonKosuOzet.durduruldu}`,
  ''
];
if (oncekiKosuOzet) {
  markdownSatirlari.push(
    `Her ürünün önceki koşusuna göre değişim: Başarılı ${sonKosuOzet.basarili - oncekiKosuOzet.basarili >= 0 ? '+' : ''}${sonKosuOzet.basarili - oncekiKosuOzet.basarili}, ` +
      `Başarısız ${sonKosuOzet.basarisiz - oncekiKosuOzet.basarisiz >= 0 ? '+' : ''}${sonKosuOzet.basarisiz - oncekiKosuOzet.basarisiz}`,
    ''
  );
}
markdownSatirlari.push(
  `_Ürün bazlı hata kalıpları ve tarih aralığı filtresi için dashboard-${ortam}.html dosyasını açın._`
);
const markdownDosyaYolu = join(process.cwd(), `urun-hata-ozeti-${ortam}.md`);
writeFileSync(markdownDosyaYolu, markdownSatirlari.join('\n'), 'utf-8');

// --- 6) Tek ekranlık, etkileşimli HTML dashboard ---
function escapeHtml(metin) {
  return String(metin).replace(/[&<>"']/g, (karakter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[karakter]));
}

// "Senaryolar" tablosu için: koşu geçmişinden bağımsız, projede o an GERÇEKTEN var
// olan tüm senaryoların listesi. "npx playwright test --list" çalıştırır — ağ/tarayıcı
// gerektirmez, sadece spec dosyalarını (ve varsa matris JSON verilerini) statik olarak
// değerlendirir. Başarısız olursa (ör. npx bulunamadı) rapor üretimini DURDURMAZ,
// tablo boş bir uyarıyla gösterilir.
const tumSenaryolarHam = await tumSenaryolariGetir(ortam).catch((hata) => {
  console.warn(
    `[urun-hata-raporu] Senaryo listesi alınamadı, "Senaryolar" tablosu boş kalacak: ${hata.message}`
  );
  return [];
});
// Koşu listesi (tests/data/kosu-listesi.json): her senaryo için "dahil" bayrağı —
// "Senaryolar" tablosundaki "Koşuda" anahtarları ve "Koşuyu başlat" bunu kullanır.
// Dosya bozuksa rapor durmaz, tüm senaryolar dahil görünür (uyarı yazılır).
let haricTutulanAnahtarlar = new Set();
try {
  haricTutulanAnahtarlar = new Set(haricTutulanlariOku());
} catch (hata) {
  console.warn(`[urun-hata-raporu] tests/data/kosu-listesi.json okunamadı, tüm senaryolar koşuya dahil gösterilecek: ${hata.message}`);
}
const tumSenaryolar = tumSenaryolarHam
  .map((s) => ({ ad: s.ad, urun: s.urun, dosya: s.dosya, dahil: !haricTutulanAnahtarlar.has(kosuListesiAnahtari(s.dosya, s.ad)) }))
  .sort((a, b) => a.urun.localeCompare(b.urun, 'tr') || a.ad.localeCompare(b.ad, 'tr'));

// Ürün listesi yalnızca koşu sonuçlarından değil, projede tanımlı senaryolardan da
// beslenir — böylece hiç koşulmamış (veya sonuç klasörü boş olan) ürünler de
// kenar çubuğunda görünür.
const tumUrunler = [...new Set([...urunler, ...tumSenaryolar.map((s) => s.urun)])].sort((a, b) =>
  a.localeCompare(b, 'tr')
);

const veri = {
  ortam,
  tumSenaryolar,
  uretimZamani: new Date(uretimBaslangicMs).toLocaleString('tr-TR'),
  // Sayısal üretim anı (bkz. uretimBaslangicMs) — istemci, localStorage'daki bundan eski
  // dashboard koşularını atar (zaten bu rapordaki Allure sonuçlarında yer alıyorlar).
  uretimMs: uretimBaslangicMs,
  sonKosuEtiket: sonKosuEtiketi,
  urunler: tumUrunler,
  // Sabit kategori sırası — istemci tarafında kategori-renk eşlemesi bu sıraya göre yapılır.
  kategoriler: [...KATEGORILER.map((k) => k.ad), KATEGORI.diger],
  kayitlar: tumKayitlar,
  // GENEL veya ürün seçimine göre üst istatistik kartları ve trend grafiğinin
  // kaynağı — hem toplam hem ürün bazlı kırılım burada.
  // Üst kartların kaynağı (bkz. yukarıdaki "Üst kartlar" açıklaması) — istemci yalnızca
  // seçili görünüme göre birini okur: genel (null = henüz koşu yok) ya da urunler[P]
  // ({ son, onceki } — P'yi içeren son / bir önceki koşu; ürün hiç koşulmadıysa yok).
  kartlar: { genel: genelKart, urunler: urunKartlari },
  kosuGecmisi: tumKosuOzetleri,
  kosuDetaylari,
  adimOzeti,
  ornekler: Object.fromEntries(
    [...ornekler.entries()].map(([anahtar, ornek]) => [
      anahtar,
      {
        t: kosuEtiketi(ornek.zaman),
        b: ornek.baslik,
        oz: ornek.ozellik,
        m: ornek.mesaj,
        g: ornek.ekranGoruntusu,
        v: ornek.video
      }
    ])
  )
};

const veriJson = JSON.stringify(veri).replace(/</g, '\\u003c'); // </script> enjeksiyonunu engelle

// Sidebar'daki genel başarı oranı donutu her zaman TÜM ürünlerin son koşusunu gösterir
// (seçimden bağımsız — Allure'daki gibi sabit bir "genel durum" göstergesi).
const sonKosuToplam = kacHesapla(sonKosuOzet);
const sonKosuOran = sonKosuToplam > 0 ? Math.round((sonKosuOzet.basarili / sonKosuToplam) * 100) : 0;

// Üst istatistik kartları ve koşu trendi grafiği, GENEL/ürün seçimine göre değiştiği
// için tamamen istemci tarafında (JS) çizilir — bkz. aşağıdaki <script> bloğu.

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${ortam.toUpperCase()} Ortamı - Test Dashboard</title>
<style>
  :root, .viz-root {
    color-scheme: light;
    --surface-1: #ffffff;
    --surface-2: #f3f2ee;
    --page-plane: #f6f5f1;
    --text-primary: #16150f;
    --text-secondary: #57564d;
    --text-muted: #918f83;
    --gridline: #e7e5dd;
    --border: rgba(22,21,15,0.09);
    --good: #0ca30c;
    --critical: #d03b3b;
    --warning: #c47f0a;
    --accent: #2456c9;
    --accent-soft: rgba(36,86,201,0.10);
    --shadow: 0 1px 2px rgba(20,18,10,0.04), 0 8px 20px -12px rgba(20,18,10,0.18);
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])), :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1: #1c1c19; --surface-2: #222220; --page-plane: #131311; --text-primary: #f5f4ef;
      --text-secondary: #c3c2b7; --text-muted: #918f83; --gridline: #2f2f2b;
      --border: rgba(255,255,255,0.09); --good: #33c23a; --critical: #ef6a6a;
      --warning: #eab04b; --accent: #7ea0f5; --accent-soft: rgba(126,160,245,0.14);
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.55);
    }
  }
  :root[data-theme="dark"], :root[data-theme="dark"] .viz-root {
    color-scheme: dark;
    --surface-1: #1c1c19; --surface-2: #222220; --page-plane: #131311; --text-primary: #f5f4ef;
    --text-secondary: #c3c2b7; --text-muted: #918f83; --gridline: #2f2f2b;
    --border: rgba(255,255,255,0.09); --good: #33c23a; --critical: #ef6a6a;
    --warning: #eab04b; --accent: #7ea0f5; --accent-soft: rgba(126,160,245,0.14);
    --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.55);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    background: var(--page-plane); color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
  }
  .viz-root { display: grid; grid-template-columns: 272px 1fr; min-height: 100vh; transition: grid-template-columns .18s ease; }
  .viz-root.kenar-kapali { grid-template-columns: 60px 1fr; }

  /* ---------- Yan panel ---------- */
  .kenar-cubugu {
    background: var(--surface-1); border-right: 1px solid var(--border);
    padding: 22px 18px 18px; display: flex; flex-direction: column; gap: 22px;
    position: sticky; top: 0; height: 100vh; overflow-y: auto; overflow-x: hidden;
  }
  .kenar-kapali .kenar-cubugu { padding-left: 10px; padding-right: 10px; align-items: center; }
  .kenar-daralinca-gizli { transition: opacity .12s ease; }
  .kenar-kapali .kenar-daralinca-gizli { display: none; }
  .kenar-urun-blok { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .kenar-kapali .marka { justify-content: center; }
  .kenar-cubugu-dugme {
    display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
    border-radius: 999px; border: 1px solid var(--border); background: var(--surface-1);
    color: var(--text-secondary); cursor: pointer; padding: 0; align-self: flex-end; flex-shrink: 0;
    margin-top: auto;
  }
  .kenar-cubugu-dugme:hover { border-color: var(--accent); color: var(--accent); }
  .kenar-cubugu-dugme svg { transition: transform .18s ease; }
  .kenar-kapali .kenar-cubugu-dugme { align-self: center; }
  .kenar-kapali .kenar-cubugu-dugme svg { transform: rotate(180deg); }
  /* Üstteki daralt/genişlet butonu: markanın sağında durur, daraltılmışken üst çubukta
     yer kalmadığı için gizlenir — daraltıldığında sidebar'ı açmak için alttaki buton kullanılır. */
  .kenar-cubugu-dugme-ust { align-self: center; margin-top: 0; flex-shrink: 0; }
  .kenar-kapali .kenar-cubugu-dugme-ust { display: none; }
  .marka { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .marka-sol { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .marka-simge {
    width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #6c3fd4));
    display: flex; align-items: center; justify-content: center; color: #fff;
  }
  .marka-metin-baslik { font-size: 15px; font-weight: 700; letter-spacing: 0.01em; }
  .marka-metin-alt { font-size: 11.5px; color: var(--text-muted); }

  .donut-kart { background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
  .donut-satir { display: flex; align-items: center; gap: 16px; }
  .donut-sarma { position: relative; width: 76px; height: 76px; flex-shrink: 0; }
  .donut-halka { width: 100%; height: 100%; border-radius: 50%; background: conic-gradient(var(--good) calc(var(--oran) * 1%), var(--critical) 0); }
  .donut-halka.bos { background: var(--gridline); }
  .donut-oyuk {
    position: absolute; inset: 9px; border-radius: 50%; background: var(--surface-2);
    display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700;
  }
  .donut-detay { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--text-secondary); }
  .donut-detay div { display: flex; align-items: center; gap: 6px; }
  .nokta { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .nokta-iyi { background: var(--good); }
  .nokta-kotu { background: var(--critical); }
  .nokta-notr { background: var(--text-muted); }
  .donut-etiket { font-size: 11.5px; color: var(--text-muted); margin-top: 12px; }

  .yan-baslik { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 4px 2px 0; font-weight: 700; }
  .yan-baslik-dugme {
    display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 6px;
    background: none; border: none; padding: 4px 2px; cursor: pointer; font: inherit;
  }
  .yan-baslik-dugme:hover { color: var(--text-secondary); }
  .yan-baslik-dugme svg { flex-shrink: 0; transition: transform .15s ease; }
  .yan-baslik-dugme[aria-expanded="false"] svg { transform: rotate(-90deg); }
  .urun-nav.urun-nav-kapali { display: none; }
  .urun-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; overflow-y: auto; padding: 2px 1px; }
  .urun-oge {
    position: relative; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 12px 10px 16px; border-radius: 10px; cursor: pointer; font-size: 13.5px; font-weight: 600;
    color: var(--text-secondary); border: 1px solid var(--border); background: var(--surface-2);
    text-align: left; width: 100%; font-family: inherit;
    transition: background .15s ease, color .15s ease, border-color .15s ease, transform .15s ease, box-shadow .15s ease;
  }
  /* Sol vurgu çubuğu: pasifken gizli, üzerine gelince yarım, seçiliyken tam yükseklikte belirir. */
  .urun-oge::before {
    content: ''; position: absolute; left: 4px; top: 8px; bottom: 8px; width: 3px; border-radius: 999px;
    background: var(--accent); transform: scaleY(0); transition: transform .18s ease;
  }
  .urun-oge:hover {
    background: var(--surface-1); color: var(--text-primary);
    border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
    transform: translateX(2px); box-shadow: var(--shadow);
  }
  .urun-oge:hover::before { transform: scaleY(.55); }
  .urun-oge:active { transform: translateX(1px) scale(.985); }
  .urun-oge:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .urun-oge.aktif {
    background: var(--accent-soft); color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 38%, transparent); box-shadow: var(--shadow);
  }
  .urun-oge.aktif::before { transform: scaleY(1); }
  .urun-oge.aktif:hover { transform: translateX(2px); }
  .urun-oge-ad { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .urun-oge-adet {
    font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; flex-shrink: 0;
    background: var(--gridline); color: var(--text-secondary); transition: background .15s ease, color .15s ease;
  }
  .urun-oge.aktif .urun-oge-adet { background: var(--accent); color: #fff; }
  .urun-oge-adet.sifir { background: transparent; color: var(--text-muted); }

  /* ---------- Ana içerik ---------- */
  /* Geniş ekranlarda tablo/grafik içeren bölümler mevcut genişliği kullansın diye üst
     sınır çok yükseğe çekildi — asıl kısıtlayıcı artık kenar çubuğundan arta kalan alan. */
  .icerik { width: 100%; padding: 28px 34px 56px; max-width: 2200px; margin: 0 auto; transition: max-width .18s ease; }
  /* Sidebar daraltılınca boşalan 212px'lik alan (272px - 60px) içeriğin azami genişliğine
     eklenir, böylece kartlar/tablolar da orantılı biçimde genişler. */
  .kenar-kapali .icerik { max-width: 2412px; }
  .ikiz-izgara {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(min(620px, 100%), 1fr)); gap: 22px; align-items: start;
  }
  .ikiz-izgara > section { min-width: 0; }
  /* "Ürün bazlı özet" ve "Koşu geçmişi" yan yana: ikisinin kart yüksekliği eşit olsun
     diye tablo kartı esner (flex:1) — veri az olan tarafta boşluk kalır, veri arttıkça
     doldurur, kartların dış boyu birbirine eşit görünür. Eşitlenen yükseklik JS tarafından
     (bkz. ikizTablolarinYuksekliginiEsitle) sabit bir max-height olarak da uygulanır; böylece
     örn. sağdaki "Adım bazlı başarı" tablosunda bir satır açılıp kayıt listesi görününce kart
     büyümez, kendi içinde kayar — soldaki "Koşu geçmişi" kartını da uzatmaz.
  */
  .ikiz-izgara-tablolar { align-items: stretch; }
  .ikiz-izgara-tablolar > section { display: flex; flex-direction: column; }
  .ikiz-izgara-tablolar > section > .kart,
  .ikiz-izgara-tablolar > section > div > .kart { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
  .ikiz-izgara-tablolar .kart table { flex-shrink: 0; }
  .ikiz-izgara-tablolar .kart .sayfalama { margin-top: auto; position: sticky; bottom: 0; }
  #ikinciBolumAlani { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  /* Hata kalıpları gibi tek panelli bölümler için: geniş ekranda %50 genişlik,
     diğer yarı ileride ikinci bir panel eklenebilsin diye bilinçli olarak boş bırakılır. */
  /* İki bölüm, her biri en az ~560px'e sığabiliyorsa yan yana; değilse alt alta
     (ekran genişliğine değil, içeriğin gerçekten kullanabildiği alana göre). */
  .yari-izgara { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(560px, 100%), 1fr)); gap: 22px; }
  .yari-izgara > section { min-width: 0; margin-bottom: 0; }
  /* Bölümler kendi genişliklerine göre sıkışabilsin diye "container" olarak işaretlenir
     (bkz. aşağıdaki @container kuralları). */
  .ikiz-izgara > section, .yari-izgara > section { container-type: inline-size; }
  .ust-baslik { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 22px; }
  h1 { font-size: 21px; margin: 0; font-weight: 700; letter-spacing: -0.01em; }
  .alt-baslik { color: var(--text-secondary); font-size: 13.5px; margin-top: 4px; }

  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 230px)); gap: 14px; margin-bottom: 30px; }
  .stat-tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; box-shadow: var(--shadow); }
  .stat-tile-ust { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .stat-label { font-size: 12.5px; color: var(--text-secondary); font-weight: 600; }
  .stat-ikon { color: var(--text-muted); display: flex; }
  .stat-value { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .stat-delta { font-size: 12.5px; margin-top: 6px; font-weight: 700; }
  .stat-delta-etiket { font-weight: 500; color: var(--text-muted); }
  .delta-iyi { color: var(--good); }
  .delta-kotu { color: var(--critical); }
  .delta-notr { color: var(--text-muted); }

  section { margin-bottom: 30px; }
  h2 { font-size: 15px; margin: 0 0 4px; font-weight: 700; }
  .bolum-alt { font-size: 13px; color: var(--text-muted); margin: 0 0 14px; }
  /* Bölüm başlığı + toplam sayısı tek satırda (Allure'daki "Categories · 3 items total" düzeni). */
  .bolum-baslik-satir { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; }
  .bolum-baslik-satir h2 { margin: 0; }
  .bolum-baslik-sayi { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  .bolum-baslik-sayi:empty { display: none; }

  .kart { background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
  .kart:has(table) { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; min-width: 560px; }
  th, td { text-align: left; padding: 11px 16px; border-bottom: 1px solid var(--gridline); font-size: 13.5px; }
  th { color: var(--text-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--surface-2); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--surface-2); }

  th.siralanabilir { cursor: pointer; user-select: none; white-space: nowrap; }
  th.siralanabilir:hover { color: var(--text-primary); }
  .siralama-ok { display: inline-block; width: 10px; margin-left: 3px; opacity: .35; font-size: 10px; }
  .siralama-ok::after { content: '↕'; }
  th.siram-asc .siralama-ok, th.siram-desc .siralama-ok { opacity: 1; color: var(--accent); }
  th.siram-asc .siralama-ok::after { content: '↑'; }
  th.siram-desc .siralama-ok::after { content: '↓'; }

  .rozet { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .rozet-iyi { background: color-mix(in srgb, var(--good) 16%, transparent); color: var(--good); }
  .rozet-kritik { background: color-mix(in srgb, var(--critical) 14%, transparent); color: var(--critical); }
  .rozet-notr { background: var(--gridline); color: var(--text-secondary); }
  .kosu-urun-rozetleri { display: flex; flex-wrap: wrap; gap: 5px; max-width: 260px; }
  .bos-durum-mini { color: var(--text-muted); font-size: 12.5px; }
  .kosu-satir { cursor: pointer; }
  .kosu-satir:hover td { background: var(--surface-2); }
  .bos-durum { color: var(--text-muted); font-size: 13.5px; padding: 22px; text-align: center; background: var(--surface-1); border: 1px dashed var(--border); border-radius: 14px; }
  footer { color: var(--text-muted); font-size: 11.5px; margin-top: 36px; }

  /* Başarı oranı çubuğu (ürün tablosu) */
  .oran-hucre { display: flex; align-items: center; justify-content: flex-end; gap: 9px; }
  .oran-bar { width: 72px; height: 6px; border-radius: 999px; background: var(--gridline); overflow: hidden; }
  .oran-dolum { height: 100%; border-radius: 999px; }

  /* Koşu trendi grafiği */
  .trend-kart { padding: 18px 20px 8px; }
  .trend-svg { width: 100%; height: auto; display: block; }
  .trend-lejant { display: flex; gap: 18px; margin-bottom: 4px; font-size: 12.5px; color: var(--text-secondary); font-weight: 600; }
  .trend-lejant span { display: inline-flex; align-items: center; gap: 6px; }
  .trend-lejant .nokta { width: 9px; height: 9px; border-radius: 50%; }

  /* Ürün/adım bazlı başarı çubuk grafiği — Koşu trendinin yanındaki ikinci grafik */
  .grafik-kart { padding: 18px 20px; }
  .ozet-grafik { display: flex; flex-direction: column; gap: 12px; }
  /* Etiket sütunu artık sabit 150px'e değil, satırın genişliğine oranla büyüyor — uzun
     adım/adlar ("Ödeme tamamlanır ve beklenen hata doğrulanır" gibi) daha az kırpılır. */
  .ozet-grafik-satir { display: grid; grid-template-columns: minmax(150px, 1.3fr) minmax(120px, 1fr) 56px; align-items: center; gap: 14px; font-size: 12.5px; }
  .ozet-grafik-etiket { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-weight: 600; }
  .ozet-grafik-iz { background: var(--surface-2); border-radius: 6px; height: 14px; overflow: hidden; }
  .ozet-grafik-dolum { height: 100%; display: flex; min-width: 2px; }
  .ozet-grafik-basarili { background: var(--good); height: 100%; }
  .ozet-grafik-basarisiz { background: var(--critical); height: 100%; }
  .ozet-grafik-sayi { text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums; }

  /* Tarih aralığı filtresi */
  .tarih-filtre {
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; box-shadow: var(--shadow);
  }
  .tarih-filtre label { font-size: 12.5px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; font-weight: 600; }
  .tarih-filtre input[type="datetime-local"] {
    font: inherit; padding: 6px 10px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary);
  }
  .tarih-filtre button {
    font: inherit; padding: 7px 14px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); cursor: pointer; font-weight: 700; font-size: 12.5px;
  }
  .tarih-filtre button:hover { border-color: var(--accent); color: var(--accent); }
  .secim-ozeti { font-size: 12.5px; color: var(--text-muted); margin-left: auto; }

  /* "+ Senaryo Oluştur" butonu (üst başlıkta, sadece uygun ürün seçiliyken görünür)
     ve popup'taki (senaryoOlusturModalOrtu) form alanları. */
  .senaryo-olustur-buton {
    font: inherit; padding: 9px 16px; border-radius: 9px; border: 1px solid var(--accent);
    background: var(--accent); color: #fff; cursor: pointer; font-weight: 700; font-size: 12.5px; white-space: nowrap;
  }
  .senaryo-olustur-buton:hover { opacity: 0.88; }
  .senaryo-form-alan { margin-bottom: 12px; }
  .senaryo-form-alan label { display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 5px; }
  .senaryo-form-alan .senaryo-form-yardim { font-weight: 400; color: var(--text-muted); margin-left: 4px; }
  .senaryo-form-alan input[type="text"], .senaryo-form-alan select, .senaryo-form-alan textarea {
    font: inherit; font-size: 12.5px; width: 100%; padding: 8px 10px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); box-sizing: border-box;
  }
  .senaryo-form-alan textarea { min-height: 56px; resize: vertical; }
  .senaryo-form-satir { display: flex; gap: 12px; flex-wrap: wrap; }
  .senaryo-form-satir .senaryo-form-alan { flex: 1; min-width: 160px; }
  .senaryo-form-checkbox { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
  .senaryo-form-checkbox input { margin: 0; }
  .senaryo-form-radio-grup { display: flex; gap: 14px; margin-bottom: 8px; font-size: 12.5px; }
  .senaryo-form-radio-grup label { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
  .senaryo-form-alt-blok { border: 1px dashed var(--border); border-radius: 9px; padding: 10px 12px; margin-top: 6px; }
  .senaryo-form-hata { color: var(--critical); font-size: 12.5px; margin: 6px 0; }
  .senaryo-form-buton-satir { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
  .senaryo-form-buton-satir button {
    font: inherit; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); cursor: pointer; font-weight: 700; font-size: 12.5px;
  }
  .senaryo-form-buton-satir button.birincil { background: var(--accent); border-color: var(--accent); color: #fff; }
  .senaryo-form-buton-satir button:hover { opacity: 0.88; }
  .toplu-onay-canli { color: var(--critical); font-weight: 700; }
  .toplu-onay-not { color: var(--text-secondary); font-size: 12.5px; }
  .senaryo-form-buton-satir button:disabled { opacity: 0.5; cursor: default; }
  .senaryo-form-alt-blok.gizli, .senaryo-form-alan.gizli { display: none; }

  /* Koşu geçmişi tablosu sayfalama */
  .sayfalama { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 12px 16px; background: var(--surface-2); border-top: 1px solid var(--gridline); font-size: 12.5px; color: var(--text-secondary); }
  .sayfalama button {
    font: inherit; padding: 6px 12px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); cursor: pointer; font-weight: 700; font-size: 12.5px;
  }
  .sayfalama button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .sayfalama button:disabled { opacity: 0.4; cursor: default; }
  .sayfalama .sayfa-bilgi { font-weight: 600; color: var(--text-muted); }

  /* Hata kalıbı detay satırları */
  .hata-detay { background: var(--surface-1); border: 1px solid var(--border); border-left: 3px solid var(--critical); border-radius: 12px; margin-bottom: 10px; overflow: hidden; box-shadow: var(--shadow); }
  .hata-detay summary {
    cursor: pointer; padding: 13px 15px; display: flex; flex-wrap: wrap; align-items: center; gap: 11px;
    font-size: 13.5px; list-style: none;
  }
  .hata-detay summary::-webkit-details-marker { display: none; }
  .hata-detay summary::before {
    content: '›'; display: inline-block; font-size: 16px; font-weight: 700; color: var(--text-muted);
    transform: rotate(0deg); transition: transform .15s ease; width: 10px;
  }
  .hata-detay[open] summary::before { transform: rotate(90deg); }
  .hata-adet {
    font-variant-numeric: tabular-nums; font-weight: 800; min-width: 30px; text-align: center;
    background: color-mix(in srgb, var(--critical) 14%, transparent); color: var(--critical); border-radius: 7px; padding: 3px 8px; font-size: 12.5px;
  }
  .hata-kalip { font-weight: 600; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .hata-govde { padding: 0 16px 16px 39px; border-top: 1px solid var(--gridline); }
  .hata-mesaj {
    white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; max-width: 100%; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 9px; padding: 11px 13px; font-size: 12.5px; color: var(--text-secondary); margin: 12px 0;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .hata-goruntu { max-width: 100%; border-radius: 9px; border: 1px solid var(--border); display: block; cursor: zoom-in; }
  /* Koşu videosu artık sayfaya gömülmez; yeni sekmede açılan küçük bir bağlantıdır. */
  .video-baglanti { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 12.5px; font-weight: 700; color: var(--accent); text-decoration: none; }
  .video-baglanti:hover { text-decoration: underline; }
  .rozet-tekil { margin-left: 6px; padding: 1px 7px; font-size: 10.5px; vertical-align: middle; }
  .rozet-kapsam { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }

  /* Üst kartların kaynağını açıklayan satır ("Her ürünün son koşusu" / "Son koşu: ...") */
  .stat-kaynak { margin: -18px 0 26px; font-size: 12.5px; color: var(--text-muted); }
  .stat-value-bos { color: var(--text-muted); }

  /* "Senaryolar" > "Koşuda" anahtarı (koşu listesi) */
  .senaryo-tablosu-kosuda-hucre { width: 64px; text-align: center; }
  .kosuda-anahtar { position: relative; display: inline-block; width: 32px; height: 18px; vertical-align: middle; }
  .kosuda-anahtar input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; z-index: 1; }
  .kosuda-anahtar-iz {
    position: absolute; inset: 0; border-radius: 999px; background: var(--gridline); border: 1px solid var(--border);
    transition: background .15s ease;
  }
  .kosuda-anahtar-iz::after {
    content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
    background: var(--surface-1); box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s ease;
  }
  .kosuda-anahtar input:checked + .kosuda-anahtar-iz { background: var(--good); border-color: var(--good); }
  .kosuda-anahtar input:checked + .kosuda-anahtar-iz::after { transform: translateX(14px); }
  .kosuda-anahtar input:focus-visible + .kosuda-anahtar-iz { outline: 2px solid var(--accent); outline-offset: 2px; }
  .kosuda-anahtar input:disabled { cursor: progress; }
  .kosuda-anahtar input:disabled + .kosuda-anahtar-iz { opacity: .6; }
  tr.senaryo-satir-haric td.senaryo-tablosu-urun,
  tr.senaryo-satir-haric td.senaryo-tablosu-ad { opacity: .45; }
  .kosuda-sayaci { font-size: 12.5px; color: var(--text-secondary); font-weight: 600; }
  .kosu-listesi-bildirim {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 70; max-width: min(560px, calc(100vw - 32px));
    padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; box-shadow: var(--shadow);
    background: var(--surface-1); border: 1px solid var(--critical); color: var(--critical);
  }
  .kosu-listesi-bildirim.basarili { border-color: var(--good); color: var(--good); }
  .kosuya-dahil-soru { margin: 12px 0 6px; font-weight: 700; font-size: 12.5px; }
  .senaryo-sonuc-video { max-width: 100%; border-radius: 9px; border: 1px solid var(--border); display: block; background: #000; }
  .hata-ornek-etiket { font-size: 12px; color: var(--text-muted); margin-top: 12px; margin-bottom: 2px; }
  .olasi-neden {
    background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 9px; padding: 11px 13px; font-size: 12.5px; color: var(--text-primary); line-height: 1.5; margin: 10px 0 12px;
  }
  .olasi-neden b { color: var(--accent); }

  /* Hata kalıpları paneli: kategori donut + liste yan yana */
  .hata-panel { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 18px; align-items: start; }
  .hata-panel > * { min-width: 0; }
  .kategori-kart {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow);
    padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 14px; position: sticky; top: 16px;
  }
  .kategori-donut-sarma { position: relative; width: 132px; height: 132px; flex-shrink: 0; }
  .kategori-donut-halka { width: 100%; height: 100%; border-radius: 50%; }
  .kategori-donut-oyuk {
    position: absolute; inset: 20px; border-radius: 50%; background: var(--surface-1);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .kategori-donut-oyuk b { font-size: 22px; font-weight: 800; line-height: 1; }
  .kategori-donut-oyuk span { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
  .kategori-lejant { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .kategori-lejant-oge { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-secondary); }
  .kategori-lejant-nokta { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .kategori-lejant-ad { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kategori-lejant-adet { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-primary); }

  @media (max-width: 860px) {
    .hata-panel { grid-template-columns: 1fr; }
    .kategori-kart { position: static; }
  }
  /* Hata kalıpları bölümü daraldığında donut ve liste alt alta dizilir. */
  @container (max-width: 700px) {
    .hata-panel { grid-template-columns: 1fr; }
    .kategori-kart { position: static; }
    .hata-govde { padding-left: 16px; }
  }
  /* Tablolar dar bir bölümdeyken sıkışık görünüme geçer: daha az boşluk, küçük başlık,
     kısa oran çubuğu — 8 sütunlu koşu geçmişi de yatay kaydırma olmadan sığar. */
  @container (max-width: 900px) {
    th, td { padding: 9px 8px; font-size: 12.5px; }
    th { font-size: 10px; letter-spacing: 0; }
    .oran-bar { width: 40px; }
    .oran-hucre { gap: 6px; }
  }
  @container (max-width: 720px) {
    th, td { padding: 8px 6px; font-size: 12px; }
    /* Uzun başlıklar ("BAŞARI ORANI", "DURDURULDU") iki satıra inebilir. */
    th.siralanabilir { white-space: normal; }
    .oran-bar { display: none; }
  }

  @media (max-width: 860px) {
    .viz-root { grid-template-columns: 1fr; }
    .kenar-cubugu { position: static; height: auto; }
    .icerik { padding: 22px 18px 40px; }
  }

  /* Adım bazlı başarı tablosu: satıra tıklayınca açılan kayıt listesi + kayda
     tıklayınca açılan detay popup'ı (modal). */
  .adim-satir { cursor: pointer; }
  .adim-satir:hover td { background: var(--surface-2); }
  .adim-satir td:first-child { display: flex; align-items: center; gap: 8px; }
  .adim-satir td:first-child::before {
    content: '›'; display: inline-block; font-size: 15px; font-weight: 700; color: var(--text-muted);
    transform: rotate(0deg); transition: transform .15s ease; width: 9px;
  }
  .adim-satir.acik td:first-child::before { transform: rotate(90deg); }
  .adim-detay-satir.gizli { display: none; }
  .adim-detay-satir td { background: var(--surface-2); padding: 10px 16px 14px 39px; border-bottom: 1px solid var(--gridline); }
  .adim-kayit-listesi { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; }
  .adim-kayit {
    display: flex; align-items: center; gap: 10px; padding: 8px 11px; border-radius: 8px;
    background: var(--surface-1); border: 1px solid var(--border); cursor: pointer; font-size: 12.5px;
  }
  .adim-kayit:hover { border-color: var(--accent); }
  .adim-kayit-nokta { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .adim-kayit-nokta.iyi { background: var(--good); }
  .adim-kayit-nokta.kotu { background: var(--critical); }
  .adim-kayit-tarih { color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .adim-kayit-ad { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Detay popup (modal) */
  .modal-ortu {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 50;
    align-items: center; justify-content: center; padding: 24px;
  }
  .modal-ortu.acik { display: flex; }
  .modal-kutu {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow);
    max-width: 620px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 22px; position: relative;
  }
  .modal-kutu.genis { max-width: 920px; }
  .kosu-detay-ekmek { font-size: 12.5px; color: var(--text-muted); margin: 0 0 14px; padding-right: 30px; }
  .kosu-detay-ekmek button {
    font: inherit; font-size: inherit; background: none; border: none; padding: 0; color: var(--accent);
    cursor: pointer; font-weight: 600;
  }
  .kosu-detay-ekmek button:hover { text-decoration: underline; }
  .kosu-detay-liste { display: flex; flex-direction: column; gap: 6px; }
  .kosu-detay-oge {
    display: flex; align-items: center; gap: 10px; padding: 10px 13px; border-radius: 9px;
    background: var(--surface-2); border: 1px solid var(--border); cursor: pointer; font-size: 13px;
  }
  .kosu-detay-oge:hover { border-color: var(--accent); }
  .kosu-detay-oge-ad { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kosu-detay-adim-satir {
    display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 9px;
    background: var(--surface-2); border: 1px solid var(--border); font-size: 12.5px;
  }
  .kosu-detay-adim-govde { margin: 4px 0 2px 0; padding-left: 18px; border-left: 2px solid var(--gridline); }
  .kosu-detay-adim-govde.gizli { display: none; }
  .kosu-detay-adim-satir { cursor: pointer; }
  .kosu-detay-adim-satir:hover { border-color: var(--accent); }
  .kosu-detay-adim-satir .kosu-detay-oge-ad::before {
    content: '›'; display: inline-block; font-size: 14px; font-weight: 700; color: var(--text-muted);
    margin-right: 6px; transform: rotate(0deg); transition: transform .15s ease;
  }
  .kosu-detay-adim-satir.acik .kosu-detay-oge-ad::before { transform: rotate(90deg); }
  .kosu-detay-geri-buton {
    display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
    background: none; border: 1px solid var(--border); border-radius: 999px; color: var(--text-primary);
    cursor: pointer; padding: 0; margin: 0 0 8px;
  }
  .kosu-detay-geri-buton:hover { border-color: var(--accent); color: var(--accent); }
  .kosu-detay-geri-buton svg { display: block; }
  .senaryo-baslat-buton {
    display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
    flex: 0 0 auto; background: none; border: 1px solid var(--border); border-radius: 999px;
    color: var(--good); cursor: pointer; padding: 0;
  }
  .senaryo-baslat-buton:hover { border-color: var(--good); background: color-mix(in srgb, var(--good) 14%, transparent); }
  .senaryo-baslat-buton:disabled { opacity: .5; cursor: default; }
  .senaryo-baslat-buton svg { display: block; }
  .senaryo-durum-mesaji {
    font-size: 11.5px; color: var(--text-muted); margin: -2px 0 6px; padding: 0 2px;
  }
  .senaryo-durum-mesaji.hata { color: var(--critical); }
  .senaryo-durum-mesaji.basarili { color: var(--good); }

  /* Çalışırken görünen "Durdur" ikonu — spinner'ın hemen yanında */
  .senaryo-calisan-kontroller { display: inline-flex; align-items: center; gap: 6px; }
  .senaryo-durdur-buton {
    display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
    flex: 0 0 auto; background: none; border: 1px solid var(--border); border-radius: 999px;
    color: var(--critical); cursor: pointer; padding: 0; margin-left: 6px;
  }
  .senaryo-durdur-buton:hover { border-color: var(--critical); background: color-mix(in srgb, var(--critical) 14%, transparent); }
  .senaryo-durdur-buton:disabled { opacity: .5; cursor: default; }
  .senaryo-durdur-buton svg { display: block; }

  /* "Senaryolar" tablosu (tüm proje, koşu geçmişinden bağımsız — ▷ ile doğrudan tetikleme) */
  .tarih-filtre input[type="text"] {
    font: inherit; padding: 6px 10px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); min-width: 220px;
  }
  .senaryo-tablosu-urun { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
  .senaryo-tablosu-calistir-hucre { text-align: right; white-space: nowrap; }
  .senaryo-tablosu-secim-hucre { width: 30px; text-align: center; }
  .senaryo-toplu-buton {
    font: inherit; font-size: 12.5px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); cursor: pointer;
  }
  .senaryo-toplu-buton:hover { border-color: var(--accent); color: var(--accent); }
  .senaryo-toplu-buton:disabled { opacity: .5; cursor: default; }
  .senaryo-toplu-buton-vurgulu { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .senaryo-toplu-durum {
    display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-secondary);
    background: color-mix(in srgb, var(--accent) 7%, transparent); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 12px; margin: -4px 0 12px;
  }
  .senaryo-toplu-durum .senaryo-durdur-buton { margin-left: auto; }

  /* "Canlı koşu paneli": toplu koşu (Koşuyu başlat / Seçilenleri çalıştır) başlayınca
     açılan, her senaryonun anlık durumunu listeleyen ve bittiğinde tıklanınca video/ekran
     görüntüsü gösteren panel. */
  /* Kosu paneli kapatilinca (X veya disariya tiklayinca) hala calisan/son biten bir
     kosu varsa saga-altta beliren, tiklaninca paneli tekrar acan kucuk rozet. */
  .canli-panel-kucuk-rozet {
    position: fixed; right: 22px; bottom: 22px; z-index: 500;
    display: flex; align-items: center; gap: 8px; max-width: 320px;
    background: var(--page-plane); border: 1px solid var(--border); border-radius: 999px;
    padding: 9px 16px; box-shadow: 0 6px 20px rgba(0,0,0,.22); cursor: pointer;
    font-size: 12.5px; color: var(--text-primary);
  }
  .canli-panel-kucuk-rozet:hover { border-color: var(--accent); color: var(--accent); }
  .canli-panel-kucuk-rozet span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .canli-panel-baslik-satir { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-right: 30px; }
  .canli-panel-baslik-satir .senaryo-durdur-buton { flex: 0 0 auto; margin-top: 2px; }
  .canli-panel-satir {
    border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
    background: var(--page-plane);
  }
  .canli-panel-satir-ust { display: flex; align-items: center; gap: 10px; }
  .canli-panel-satir { cursor: pointer; }
  .canli-panel-satir-ad { flex: 1 1 auto; font-size: 13px; min-width: 0; overflow-wrap: break-word; }
  .canli-panel-sure { font-size: 11.5px; color: var(--text-muted); flex: 0 0 auto; }
  .canli-panel-durum-ikon {
    flex: 0 0 auto; width: 20px; height: 20px; border-radius: 999px; display: flex; align-items: center;
    justify-content: center; color: #fff; font-size: 12px; line-height: 1;
  }
  .canli-panel-durum-ikon.bekliyor { background: var(--gridline); color: var(--text-muted); }
  .canli-panel-durum-ikon.basarili { background: var(--good); }
  .canli-panel-durum-ikon.basarisiz { background: var(--critical); }
  .canli-panel-durum-ikon.notr { background: var(--warning); }
  .canli-panel-detay { margin-top: 10px; display: none; }
  .canli-panel-satir.acik .canli-panel-detay { display: block; }
  .canli-panel-canli-etiket { font-size: 11.5px; color: var(--text-muted); margin: 0 0 6px; display: flex; align-items: center; gap: 6px; }
  .canli-panel-canli-nokta {
    width: 7px; height: 7px; border-radius: 999px; background: var(--critical); flex: 0 0 auto;
    animation: senaryoCanliNokta 1.1s ease-in-out infinite;
  }
  @keyframes senaryoCanliNokta { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
  .canli-panel-canli-goruntu { max-width: 100%; border-radius: 9px; border: 1px solid var(--border); display: block; background: #111; }
  @keyframes senaryoCalisiyorNabiz {
    0%, 100% { background: transparent; }
    50% { background: color-mix(in srgb, var(--accent) 9%, transparent); }
  }
  tr.senaryo-satir-calisiyor { animation: senaryoCalisiyorNabiz 1.1s ease-in-out infinite; }
  .senaryo-spinner {
    display: inline-block; width: 15px; height: 15px; border-radius: 999px;
    border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent);
    animation: senaryoSpinnerDon .7s linear infinite; vertical-align: middle;
  }
  @keyframes senaryoSpinnerDon { to { transform: rotate(360deg); } }
  .senaryo-sonuc-satir { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 10px 0 4px; }
  .senaryo-sonuc-ozet { font-size: 12.5px; color: var(--text-secondary); margin: 0 0 4px; }
  .modal-kapat {
    position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); cursor: pointer; font-size: 16px; line-height: 1; font: inherit;
  }
  .modal-kapat:hover { border-color: var(--accent); color: var(--accent); }
  .modal-baslik { font-size: 14.5px; font-weight: 700; margin: 0 0 4px; padding-right: 30px; }
  .modal-alt { font-size: 12.5px; color: var(--text-muted); margin: 0 0 14px; }

  /* Ekran görüntüsü büyütme (lightbox): "Bu kalıp/adım için ekran görüntüsü" küçük resimlerine
     tıklanınca resmi ortalayıp büyük gösteren ayrı bir modal. */
  .gorsel-buyutme-ortu { background: rgba(0,0,0,.78); z-index: 60; cursor: zoom-out; }
  .gorsel-buyutme-kutu { position: relative; max-width: 95vw; max-height: 92vh; cursor: default; }
  .gorsel-buyutme-kutu img {
    display: block; max-width: 95vw; max-height: 92vh; width: auto; height: auto;
    border-radius: 10px; box-shadow: var(--shadow); border: 1px solid var(--border);
  }
  .gorsel-buyutme-kutu .modal-kapat {
    top: -16px; right: -16px; background: var(--surface-1);
  }
</style>
</head>
<body>
<div class="viz-root">
  <aside class="kenar-cubugu">
    <div class="marka">
      <div class="marka-sol">
        <div class="marka-simge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
        </div>
        <div class="kenar-daralinca-gizli">
          <div class="marka-metin-baslik">${ortam.toUpperCase()} Ortamı</div>
          <div class="marka-metin-alt">Test Dashboard</div>
        </div>
      </div>
      <button type="button" class="kenar-cubugu-dugme kenar-cubugu-dugme-ust" id="kenarCubuguDugmesiUst" title="Kenar çubuğunu daralt/genişlet" aria-label="Kenar çubuğunu daralt/genişlet">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
      </button>
    </div>

    <div class="donut-kart kenar-daralinca-gizli">
      <div class="donut-satir">
        <div class="donut-sarma">
          <div class="donut-halka${sonKosuToplam === 0 ? ' bos' : ''}" style="--oran:${sonKosuOran}"></div>
          <div class="donut-oyuk">${sonKosuToplam === 0 ? '—' : '%' + sonKosuOran}</div>
        </div>
        <div class="donut-detay">
          <div><span class="nokta nokta-iyi"></span>Başarılı ${sonKosuOzet.basarili}</div>
          <div><span class="nokta nokta-kotu"></span>Başarısız ${sonKosuOzet.basarisiz}</div>
          <div><span class="nokta nokta-notr"></span>Atlanan ${sonKosuOzet.atlanan}</div>
          ${sonKosuOzet.durduruldu ? `<div><span class="nokta nokta-notr"></span>Durduruldu ${sonKosuOzet.durduruldu}</div>` : ''}
        </div>
      </div>
      <div class="donut-etiket">Güncel durum: ${escapeHtml(veri.sonKosuEtiket)}</div>
    </div>

    <div class="kenar-daralinca-gizli kenar-urun-blok">
      <button type="button" class="yan-baslik yan-baslik-dugme" id="urunListesiBasligi" aria-expanded="true">
        <span>Ürünler</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
      </button>
      <nav class="urun-nav" id="urunNav" style="margin-top:6px"></nav>
    </div>

    <button type="button" class="kenar-cubugu-dugme" id="kenarCubuguDugmesi" title="Kenar çubuğunu daralt/genişlet" aria-label="Kenar çubuğunu daralt/genişlet">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
    </button>
  </aside>

  <main class="icerik">
    <div class="ust-baslik">
      <div>
        <h1 id="anaBaslik">Genel Bakış</h1>
        <div class="alt-baslik">Üretim: ${escapeHtml(veri.uretimZamani)}</div>
      </div>
      <button type="button" id="senaryoOlusturButonu" class="senaryo-olustur-buton" style="display:none">+ Senaryo Oluştur</button>
    </div>

    <div class="stat-grid" id="statGrid"></div>
    <p class="stat-kaynak" id="statKaynak"></p>

    <div class="ikiz-izgara">
      <section>
        <div class="bolum-baslik-satir"><h2>Koşu trendi</h2><span class="bolum-baslik-sayi" id="trendBaslikSayisi"></span></div>
        <p class="bolum-alt" id="trendAltBaslik"></p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihiTrend" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihiTrend" /></label>
          <button type="button" id="tumZamanlarButonuTrend">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzetiTrend"></span>
        </div>
        <div class="kart trend-kart">
          <div class="trend-lejant">
            <span><span class="nokta" style="background:var(--good)"></span>Başarılı</span>
            <span><span class="nokta" style="background:var(--critical)"></span>Başarısız</span>
          </div>
          <div id="trendSvgAlani"></div>
        </div>
      </section>

      <section>
        <div class="bolum-baslik-satir"><h2 id="ucuncuBaslik">Ürün bazlı başarı</h2><span class="bolum-baslik-sayi" id="ucuncuBaslikSayisi"></span></div>
        <p class="bolum-alt" id="ucuncuAltBaslik"></p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihiUrun" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihiUrun" /></label>
          <button type="button" id="tumZamanlarButonuUrun">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzetiUrun"></span>
        </div>
        <div class="kart grafik-kart" id="ozetGrafikAlani"></div>
      </section>
    </div>

    <div class="ikiz-izgara ikiz-izgara-tablolar">
      <section>
        <div class="bolum-baslik-satir"><h2>Koşu geçmişi</h2><span class="bolum-baslik-sayi" id="kosuGecmisiBaslikSayisi"></span></div>
        <p class="bolum-alt">Bugüne kadarki tüm koşular — tarih aralığıyla daraltabilir, sayfa sayfa gezebilirsiniz.</p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihiKosu" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihiKosu" /></label>
          <button type="button" id="tumZamanlarButonuKosu">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzetiKosu"></span>
        </div>
        <div class="kart">
          <table class="veri-tablosu">
            <thead>
              <tr>
                <th class="siralanabilir" data-tablo="kosuGecmisi" data-anahtar="z" data-tur="zaman">Koşu<span class="siralama-ok"></span></th>
                <th>Ürünler</th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="toplam" data-tur="sayi">Toplam<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="basarili" data-tur="sayi">Başarılı<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="basarisiz" data-tur="sayi">Başarısız<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="atlanan" data-tur="sayi">Atlanan<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="durduruldu" data-tur="sayi">Durduruldu<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="oran" data-tur="sayi">Başarı oranı<span class="siralama-ok"></span></th>
              </tr>
            </thead>
            <tbody id="kosuGecmisiGovdesi"></tbody>
          </table>
          <div class="sayfalama" id="kosuGecmisiSayfalama"></div>
        </div>
      </section>

      <section>
        <div class="bolum-baslik-satir"><h2 id="ikinciBaslik">Ürün bazlı özet</h2><span class="bolum-baslik-sayi" id="ikinciBaslikSayisi"></span></div>
        <p class="bolum-alt" id="ikinciAltBaslik"></p>
        <div id="ikinciBolumAlani"></div>
      </section>
    </div>

    <div class="yari-izgara">
      <section>
        <div class="bolum-baslik-satir"><h2 id="secilenUrunBasligi">Hata kalıpları</h2><span class="bolum-baslik-sayi" id="kalipBaslikSayisi"></span></div>
        <p class="bolum-alt">Tarih aralığını daraltın; aynı kalıptaki hatalar tek satırda toplanır.</p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihi" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihi" /></label>
          <button type="button" id="tumZamanlarButonu">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzeti"></span>
        </div>
        <div class="hata-panel">
          <div class="kategori-kart" id="kategoriDonutAlani"></div>
          <div>
            <div id="kalipTablosuAlani"></div>
            <div class="sayfalama" id="kalipTablosuSayfalama"></div>
          </div>
        </div>
      </section>
      <section>
        <div class="bolum-baslik-satir"><h2 id="senaryoTablosuBasligi">Senaryolar</h2><span class="bolum-baslik-sayi" id="senaryoTablosuBaslikSayisi"></span></div>
        <p class="bolum-alt">Soldaki ürün listesinden birini seçtiğinizde sadece o ürünün senaryoları listelenir — ▷ ikonuna basarak doğrudan buradan çalıştırabilirsiniz. "Koşuda" anahtarı senaryonun koşuya (Koşuyu başlat, npm run test) dahil olup olmadığını belirler; hariç senaryolar soluk görünür ama ▷ ile yine çalıştırılabilir. Çalışması için bir terminalde "npm run test-sunucu" açık olmalıdır.</p>
        <div class="tarih-filtre">
          <label>Ara <input type="text" id="senaryoTablosuArama" placeholder="Senaryo veya ürün adı..." /></label>
          <span class="secim-ozeti" id="senaryoTablosuSecimOzeti"></span>
          <span class="kosuda-sayaci" id="senaryoKosudaSayaci" title="Görünen senaryolardan kaçı koşu listesinde (tests/data/kosu-listesi.json)"></span>
          <button type="button" class="senaryo-toplu-buton" id="senaryoTumunuCalistirButonu" title="Bu görünümdeki, koşuya dahil senaryoları sırayla koşar">▷ Koşuyu başlat</button>
          <button type="button" class="senaryo-toplu-buton senaryo-toplu-buton-vurgulu" id="senaryoSecilenleriCalistirButonu" style="display:none;">▷ Seçilenleri çalıştır (<span id="senaryoSecilenSayisi">0</span>)</button>
          <button type="button" class="senaryo-toplu-buton" id="senaryoKosuyaEkleButonu" style="display:none;">+ Koşuya ekle (<span id="senaryoKosuyaEkleSayisi">0</span>)</button>
          <button type="button" class="senaryo-toplu-buton" id="senaryoKosudanCikarButonu" style="display:none;">− Koşudan çıkar (<span id="senaryoKosudanCikarSayisi">0</span>)</button>
        </div>
        <div class="kart">
          <table class="veri-tablosu">
            <thead>
              <tr>
                <th class="senaryo-tablosu-secim-hucre"><input type="checkbox" id="senaryoTumunuSecCheckbox" title="Görünen tüm senaryoları seç/kaldır" aria-label="Görünen tüm senaryoları seç/kaldır" /></th>
                <th>Ürün</th>
                <th>Senaryo</th>
                <th class="senaryo-tablosu-kosuda-hucre" title="Koşuya dahil mi? (Koşuyu başlat ve npm run test yalnızca dahil senaryoları koşar)">Koşuda</th>
                <th class="num">Çalıştır</th>
              </tr>
            </thead>
            <tbody id="senaryoTablosuGovdesi"></tbody>
          </table>
          <div class="sayfalama" id="senaryoTablosuSayfalama"></div>
        </div>
      </section>
    </div>

    <footer>Bu sayfa her "npm run rapor:${ortam}" / "npm run hata:ozet:${ortam}" çalıştığında yeniden üretilir. Senaryo listesindeki ▷ Başlat ikonlarının çalışması için bir terminalde "npm run test-sunucu" açık olmalıdır.</footer>
  </main>

  <div class="modal-ortu" id="adimDetayModalOrtu">
    <div class="modal-kutu">
      <button type="button" class="modal-kapat" id="adimDetayModalKapatButonu" aria-label="Kapat">×</button>
      <div id="adimDetayModalIcerik"></div>
    </div>
  </div>

  <div class="modal-ortu gorsel-buyutme-ortu" id="gorselBuyutmeOrtu">
    <div class="gorsel-buyutme-kutu">
      <button type="button" class="modal-kapat" id="gorselBuyutmeKapatButonu" aria-label="Kapat">×</button>
      <img id="gorselBuyutmeResim" src="" alt="Büyütülmüş ekran görüntüsü" />
    </div>
  </div>

  <div class="modal-ortu" id="senaryoSonucModalOrtu">
    <div class="modal-kutu">
      <button type="button" class="modal-kapat" id="senaryoSonucModalKapatButonu" aria-label="Kapat">×</button>
      <div id="senaryoSonucModalIcerik"></div>
    </div>
  </div>

  <div class="modal-ortu" id="senaryoCanliPanelOrtu">
    <div class="modal-kutu genis">
      <button type="button" class="modal-kapat" id="senaryoCanliPanelKapatButonu" aria-label="Kapat">×</button>
      <div class="canli-panel-baslik-satir">
        <div>
          <p class="modal-baslik" id="senaryoCanliPanelBaslik">Senaryolar çalışıyor...</p>
          <p class="modal-alt" id="senaryoCanliPanelAltBaslik" style="margin:0;"></p>
        </div>
        <button type="button" class="senaryo-durdur-buton" id="senaryoCanliPanelDurdurButonu" title="Tümünü durdur" aria-label="Tümünü durdur">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14"></rect></svg>
        </button>
      </div>
      <div id="senaryoCanliPanelListesi"></div>
    </div>
  </div>

  <div class="modal-ortu" id="topluKosuOnayOrtu">
    <div class="modal-kutu" role="dialog" aria-modal="true" aria-labelledby="topluKosuOnayBaslik">
      <button type="button" class="modal-kapat" id="topluKosuOnayKapatButonu" aria-label="Kapat">×</button>
      <p class="modal-baslik" id="topluKosuOnayBaslik">Toplu koşuyu başlat?</p>
      <p id="topluKosuOnayMetni"></p>
      <div class="senaryo-form-buton-satir">
        <button type="button" id="topluKosuOnayIptal">Vazgeç</button>
        <button type="button" class="birincil" id="topluKosuOnayBaslat">▷ Başlat</button>
      </div>
    </div>
  </div>

  <div class="modal-ortu" id="senaryoOlusturModalOrtu">
    <div class="modal-kutu genis">
      <button type="button" class="modal-kapat" id="senaryoOlusturModalKapatButonu" aria-label="Kapat">×</button>
      <div id="senaryoOlusturModalIcerik"></div>
    </div>
  </div>

  <div id="kosuListesiBildirim" class="kosu-listesi-bildirim" role="status" aria-live="polite" hidden></div>

  <div id="canliPanelKucukRozet" class="canli-panel-kucuk-rozet" role="button" tabindex="0" title="Koşu panelini yeniden aç" style="display:none;">
    <span class="senaryo-spinner" id="canliPanelKucukRozetSpinner" style="width:12px;height:12px;border-width:2px;"></span>
    <span id="canliPanelKucukRozetMetin"></span>
  </div>
</div>

<script>
  var VERI = ${veriJson};
  // Dashboard'daki ▷ Başlat butonlarının konuştuğu yerel test tetikleme sunucusu
  // (bkz. scripts/test-sunucu.mjs — "npm run test-sunucu" ile ayrı bir pencerede
  // çalıştırılmalı). Token yalnızca bu makinede üretilir, sunucu da aynı dosyadan
  // okur; başka bir origin bu isteği asla tetikleyemez.
  var ORTAM = ${JSON.stringify(ortam)};
  var TEST_SUNUCU = { taban: ${JSON.stringify(`http://127.0.0.1:${TEST_SUNUCU_PORT}`)}, token: ${JSON.stringify(tokenGetirYaOlustur())} };
  // "Adım bazlı başarı" tablosunda o an açık olan ürünün adım listesi (satır tıklama
  // olay dinleyicilerinin büyük veriyi DOM'a yazmadan erişmesi için).
  var AKTIF_ADIM_LISTESI = [];
  // "Adım bazlı başarı" tablosunda açık olan satırın adı — tablo yeniden çizildiğinde
  // (ör. bir koşu bitince) satır kapanmasın diye tutulur; ürün değişince null olur.
  var ACIK_ADIM_ADI = null;

  function escapeHtml(metin) {
    return String(metin).replace(/[&<>"']/g, function (k) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[k];
    });
  }

  // "▶ Videoyu izle" bağlantısı (yeni sekmede açılır). yol: rapordaki göreli dosya yolu
  // (allure-results-<ortam>/...webm) ya da canlı koşuda test sunucusunun /medya URL'si.
  // Video yoksa (hiç kaydedilmemiş ya da saklama süresi dolup silinmiş) boş döner.
  function videoBaglantisiHtml(yol) {
    if (!yol) return '';
    return '<div><a class="video-baglanti" href="' + escapeHtml(yol) + '" target="_blank" rel="noopener">▶ Videoyu izle</a></div>';
  }

  // Ham (teknik) hata mesajını okuyup, tanınan kalıplardan biriyle eşleşiyorsa sade bir
  // Türkçe "olası neden" açıklaması üretir. Yeni bir hata kalıbı görüldükçe buraya yeni
  // bir if bloğu eklenir — tanınmayan bir mesaj için null döner (yanlış yorum yapıp
  // yanıltmaktansa hiçbir şey göstermemeyi tercih ederiz).
  function olasiNedenBul(mesaj) {
    if (!mesaj) return null;

    if (/Target page, context or browser has been closed/i.test(mesaj)) {
      return 'Tarayıcı/sayfa bu hatadan önce zaten kapanmıştı — genelde testin genel süre sınırına ' +
        '(test timeout) takılıp otomatik sonlandırılmasının bir sonucudur, kendisi ayrı/yeni bir hata değildir.';
    }

    if (/Test timeout of [0-9]+ms exceeded/i.test(mesaj) && /waiting for (getByRole|getByText|getByLabel|getByTestId|getByPlaceholder|locator)/i.test(mesaj)) {
      var elemanEslesme = mesaj.match(/name: '([^']+)'/);
      var elemanAdi = elemanEslesme ? elemanEslesme[1] : null;
      return (elemanAdi ? 'Sistem "' + elemanAdi + '" elemanını' : 'Sistem ilgili elemanı') +
        ' belirtilen süre boyunca aradı ama bulamadı. Genelde üç sebepten biri: (1) önceki adımda oluşan ' +
        'sessiz bir hata yüzünden akış beklenen ekrana hiç ulaşmamış, (2) ekrandaki buton/metin adı ' +
        'değişmiş, (3) sunucu yanıtı normalden çok geç gelmiş (performans/ağ sorunu).';
    }

    if (/strict mode violation|resolved to [0-9]+ elements/i.test(mesaj)) {
      return 'Aynı isim/metinle eşleşen birden fazla eleman bulundu, seçici (locator) tek bir elemanı ' +
        'işaret etmiyor — sayfada beklenmeyen bir tekrar/kopya eleman olabilir.';
    }

    if (/toBeVisible/i.test(mesaj)) {
      return 'Beklenen eleman ekranda görünür değildi — ilgili ekran hiç açılmamış ya da farklı bir ' +
        'durumda kalmış olabilir.';
    }

    if (/toHaveValue|toHaveText|toHaveURL/i.test(mesaj)) {
      return 'Ekranda görünen değer/metin, testin beklediğinden farklı çıktı — ya ekran davranışı ' +
        'değişmiş ya da test verisiyle ekran senkron değil.';
    }

    if (/net::ERR_/i.test(mesaj)) {
      return 'Tarayıcı sunucuya bağlanamadı / istek tamamlanamadı (ağ veya sunucu tarafı bir sorun olabilir).';
    }

    return null;
  }

  // input[type=datetime-local] ile uyumlu "YYYY-MM-DDTHH:mm" biçimi.
  function gunSaatAnahtari(zamanMs) {
    var d = new Date(zamanMs);
    var yil = d.getFullYear();
    var ay = String(d.getMonth() + 1).padStart(2, '0');
    var gun = String(d.getDate()).padStart(2, '0');
    var saat = String(d.getHours()).padStart(2, '0');
    var dakika = String(d.getMinutes()).padStart(2, '0');
    return yil + '-' + ay + '-' + gun + 'T' + saat + ':' + dakika;
  }

  // Kategori -> sabit renk eşlemesi (VERI.kategoriler sırasına göre).
  var KATEGORI_RENKLERI = ['#d03b3b', '#c47f0a', '#2456c9', '#7c5cff', '#8a8879'];
  function kategoriRengi(kategoriAdi) {
    var idx = VERI.kategoriler.indexOf(kategoriAdi);
    return KATEGORI_RENKLERI[idx >= 0 ? idx : KATEGORI_RENKLERI.length - 1];
  }

  // Ürün başına tüm-zamanlar başarısız sayısı (yan panel rozetleri için).
  // "Durduruldu" (kullanıcı durdurdu) kayıtlar başarısız SAYILMAZ.
  var urunBasarisizSayilari = {};
  VERI.kayitlar.forEach(function (k) {
    if (k.d === 'basarisiz') {
      urunBasarisizSayilari[k.u] = (urunBasarisizSayilari[k.u] || 0) + 1;
    }
  });

  var GENEL = null; // "GENEL" sekmesi seçiliyken secilenUrun bu değeri alır (tüm ürünler).
  var genelBasarisizToplam = 0;
  Object.keys(urunBasarisizSayilari).forEach(function (urun) { genelBasarisizToplam += urunBasarisizSayilari[urun]; });

  var secilenUrun = GENEL; // Varsayılan ekran: GENEL (tüm ürünlerin özeti).
  var kosuGecmisiSayfa = 1; // "Koşu geçmişi" tablosunun geçerli sayfası (1'den başlar).
  var KOSU_GECMISI_SAYFA_BOYUTU = 10;
  var kalipSayfa = 1; // "Hata kalıpları" listesinin geçerli sayfası (1'den başlar).
  var KALIP_SAYFA_BOYUTU = 8; // Her kalıp ekran görüntüsü içerebildiğinden sayfa boyutu küçük tutulur.
  var senaryoTablosuSayfa = 1; // "Senaryolar" tablosunun geçerli sayfası (1'den başlar).
  var SENARYO_TABLOSU_SAYFA_BOYUTU = 10;

  function urunNavCiz() {
    var alan = document.getElementById('urunNav');
    var genelAktifSinif = secilenUrun === GENEL ? ' aktif' : '';
    var genelHtml =
      '<button type="button" class="urun-oge' + genelAktifSinif + '" data-urun="__genel__" style="margin-bottom:4px">' +
      '<span class="urun-oge-ad">Genel</span>' +
      '<span class="urun-oge-adet' + (genelBasarisizToplam === 0 ? ' sifir' : '') + '">' + genelBasarisizToplam + '</span>' +
      '</button>';

    if (VERI.urunler.length === 0) {
      alan.innerHTML = genelHtml + '<div class="bos-durum">Kayıtlı ürün verisi yok.</div>';
    } else {
      alan.innerHTML =
        genelHtml +
        VERI.urunler
          .map(function (urun) {
            var aktifSinif = urun === secilenUrun ? ' aktif' : '';
            var adet = urunBasarisizSayilari[urun] || 0;
            var adetSinif = adet === 0 ? ' sifir' : '';
            return (
              '<button type="button" class="urun-oge' + aktifSinif + '" data-urun="' + escapeHtml(urun) + '">' +
              '<span class="urun-oge-ad">' + escapeHtml(urun) + '</span>' +
              '<span class="urun-oge-adet' + adetSinif + '">' + adet + '</span>' +
              '</button>'
            );
          })
          .join('');
    }

    Array.prototype.forEach.call(alan.querySelectorAll('.urun-oge'), function (dugme) {
      dugme.addEventListener('click', function () {
        var deger = dugme.getAttribute('data-urun');
        var yeniUrun = deger === '__genel__' ? GENEL : deger;
        // Ürün değişince "Senaryolar" tablosundaki seçim temizlenir — gizlenen ürünün
        // seçili senaryoları sonradan "Seçilenleri çalıştır" ile fark edilmeden koşmasın.
        if (yeniUrun !== secilenUrun) SENARYO_TABLOSU_SECILI.clear();
        secilenUrun = yeniUrun;
        // Ürün değişince "Senaryolar" listesi baştan değişir, bu yüzden sayfa 1'e
        // dönülür — ama secimGuncellendi() BAŞKA yerlerden de (ör. tek bir senaryo
        // koşusu bitince) çağrıldığından bu satır kasıtlı olarak SADECE burada, gerçek
        // ürün değişiminde duruyor; secimGuncellendi()'nin içine KONMADI — yoksa bir
        // koşu bitip listeyi tazelediğinde kullanıcı sayfa 3'teyken sayfa 1'e atılırdı.
        senaryoTablosuSayfa = 1;
        // Aynı gerekçeyle "Koşu geçmişi" / "Hata kalıpları" sayfaları ve açık adım
        // satırı da YALNIZCA burada (ürün değişince) sıfırlanır; koşu bitince çağrılan
        // secimGuncellendi() mevcut sayfayı korur (sayfa artık yoksa çizim sırasında
        // son sayfaya sıkıştırılır — bkz. kosuGecmisiniGuncelle/tabloyuGuncelle).
        kosuGecmisiSayfa = 1;
        kalipSayfa = 1;
        ACIK_ADIM_ADI = null;
        secimGuncellendi();
      });
    });
  }

  function tarihSinirlariniAyarla(baslangicId, bitisId) {
    if (VERI.kayitlar.length === 0) return;
    var minZaman = VERI.kayitlar[0].z;
    var maxZaman = VERI.kayitlar[0].z;
    VERI.kayitlar.forEach(function (k) {
      if (k.z < minZaman) minZaman = k.z;
      if (k.z > maxZaman) maxZaman = k.z;
    });
    // Bitiş alanı dakikaya yuvarlanırken (saniyeler atılır) son kaydın dışarıda
    // kalmaması için bir dakika yukarı taşınır.
    document.getElementById(baslangicId).value = gunSaatAnahtari(minZaman);
    document.getElementById(bitisId).value = gunSaatAnahtari(maxZaman + 60000);
  }

  function secilenTarihAraligi(baslangicId, bitisId) {
    var baslangicStr = document.getElementById(baslangicId).value;
    var bitisStr = document.getElementById(bitisId).value;
    return {
      baslangicMs: baslangicStr ? new Date(baslangicStr).getTime() : -Infinity,
      bitisMs: bitisStr ? new Date(bitisStr).getTime() : Infinity
    };
  }

  // ---------- Tablo sütun başlıklarına tıklayarak sıralama ----------
  // Her tablo için { anahtar, yon } tutulur. anahtar: null => tablonun doğal/varsayılan
  // sırası kullanılır (ör. adım tablosunda ürüne özel ekran akışı sırası bozulmasın diye).
  var SIRALAMA_DURUMU = {
    urunOzet: { anahtar: 'basarisiz', yon: 'desc' },
    kosuGecmisi: { anahtar: 'z', yon: 'desc' },
    adimOzet: { anahtar: null, yon: null }
  };

  function diziyiSirala(dizi, anahtar, yon, degerFn) {
    if (!anahtar || !degerFn) return dizi;
    var isaret = yon === 'asc' ? 1 : -1;
    return dizi.slice().sort(function (a, b) {
      var va = degerFn(a), vb = degerFn(b);
      if (typeof va === 'string') return va.localeCompare(vb, 'tr') * isaret;
      if (va < vb) return -1 * isaret;
      if (va > vb) return 1 * isaret;
      return 0;
    });
  }

  // th.siralanabilir'lerin ok yönünü mevcut SIRALAMA_DURUMU'na göre günceller —
  // hangi tabloya ait olursa olsun, o an DOM'da bulunan tüm sıralanabilir başlıklarda çalışır.
  function siralamaOklariniGuncelle() {
    Array.prototype.forEach.call(document.querySelectorAll('th.siralanabilir'), function (th) {
      var tablo = th.getAttribute('data-tablo');
      var anahtar = th.getAttribute('data-anahtar');
      var durum = SIRALAMA_DURUMU[tablo];
      th.classList.remove('siram-asc', 'siram-desc');
      if (durum && durum.anahtar === anahtar) th.classList.add(durum.yon === 'asc' ? 'siram-asc' : 'siram-desc');
    });
  }

  document.addEventListener('click', function (olay) {
    var th = olay.target.closest('th.siralanabilir');
    if (!th) return;
    var tablo = th.getAttribute('data-tablo');
    var anahtar = th.getAttribute('data-anahtar');
    var tur = th.getAttribute('data-tur') || 'sayi';
    var durum = SIRALAMA_DURUMU[tablo];
    if (!durum) return;
    if (durum.anahtar === anahtar) {
      durum.yon = durum.yon === 'asc' ? 'desc' : 'asc';
    } else {
      durum.anahtar = anahtar;
      durum.yon = tur === 'metin' ? 'asc' : 'desc';
    }
    if (tablo === 'urunOzet') urunOzetTablosunuGuncelle();
    else if (tablo === 'kosuGecmisi') kosuGecmisiniGuncelle();
    else if (tablo === 'adimOzet') ikinciBolumuCiz();
  });

  // "Koşu trendi"nin yanındaki ikinci grafik: satır başına (ürün ya da adım) başarılı/başarısız
  // yığılmış yatay çubuk. Çubuğun toplam uzunluğu o satırın toplam test sayısıyla, rengi
  // başarılı/başarısız oranıyla orantılı — aynı veri "Ürün bazlı özet" / "Adım bazlı başarı"
  // tablosunda sayısal olarak da gösterilir.
  function ozetBarGrafiginiCiz(kapAlaniId, satirlar) {
    var alan = document.getElementById(kapAlaniId);
    if (!alan) return;
    if (satirlar.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Gösterilecek veri yok.</div>';
      return;
    }
    var maxToplam = 1;
    satirlar.forEach(function (s) {
      var t = s.basarili + s.basarisiz;
      if (t > maxToplam) maxToplam = t;
    });
    alan.innerHTML =
      '<div class="ozet-grafik">' +
      satirlar
        .map(function (s) {
          var toplam = s.basarili + s.basarisiz;
          var izGenislik = (toplam / maxToplam) * 100;
          var basariliYuzde = toplam > 0 ? (s.basarili / toplam) * 100 : 0;
          var basarisizYuzde = toplam > 0 ? (s.basarisiz / toplam) * 100 : 0;
          return (
            '<div class="ozet-grafik-satir">' +
            '<div class="ozet-grafik-etiket" title="' + escapeHtml(s.etiket) + '">' + escapeHtml(s.etiket) + '</div>' +
            '<div class="ozet-grafik-iz"><div class="ozet-grafik-dolum" style="width:' + izGenislik.toFixed(1) + '%">' +
            '<div class="ozet-grafik-basarili" style="flex-basis:' + basariliYuzde.toFixed(1) + '%"></div>' +
            '<div class="ozet-grafik-basarisiz" style="flex-basis:' + basarisizYuzde.toFixed(1) + '%"></div>' +
            '</div></div>' +
            '<div class="ozet-grafik-sayi">' + s.basarili + '/' + s.basarisiz + '</div>' +
            '</div>'
          );
        })
        .join('') +
      '</div>';
  }

  // "Koşu geçmişi" ile yanındaki tablonun (Ürün bazlı özet / Adım bazlı başarı) kart
  // yüksekliklerini eşitler. Bilerek CSS'teki canlı flex-stretch yerine burada, her iki
  // taraf da KAPALI/başlangıç haliyken (adım satırı açılmadan önce) tek seferlik ölçüm
  // yapılır ve sonuç sabit bir max-height olarak uygulanır. Böylece sağdaki tabloda bir
  // adım satırı açılıp kayıt listesi görününce kart büyümez, kendi içinde kayar —
  // soldaki "Koşu geçmişi" kartı bundan etkilenmez.
  function ikizTablolarinYuksekliginiEsitle() {
    var cift = document.querySelector('.ikiz-izgara-tablolar');
    if (!cift) return;
    var kartlar = cift.querySelectorAll(':scope > section > .kart, :scope > section > div > .kart');
    if (kartlar.length < 2) return;
    // Kartların dış görünür boyu zaten CSS Grid + flex:1 ile (kartı saran <section>'lar eşit
    // yüksekliğe gerilir, her kart kendi bölümünün kalan boşluğunu doldurur) hizalanıyor —
    // burada o hizayı BOZMADAN, her kartın kendi o anki (kapalı/başlangıç) yüksekliğini kendi
    // max-height'i olarak dondurup kilitliyoruz. Böylece örn. sağdaki tabloda bir adım satırı
    // açılıp kayıt listesi görününce o kart büyümez, kendi içinde kayar; soldaki kart, kendi
    // bağımsız max-height'iyle hiç etkilenmez.
    Array.prototype.forEach.call(kartlar, function (k) { k.style.maxHeight = 'none'; });
    Array.prototype.forEach.call(kartlar, function (k) { k.style.maxHeight = k.offsetHeight + 'px'; });
  }

  // "Ürün bazlı özet" tablosu: seçilen tarih aralığında TÜM ürünlerin toplamlarını hesaplar.
  function urunOzetTablosunuGuncelle() {
    var govde = document.getElementById('urunOzetGovdesi');
    var ozetAlani = document.getElementById('secimOzetiUrun');
    if (!govde || !ozetAlani) return; // İkinci bölüm şu an adım tablosunu gösteriyorsa bu elemanlar yok.
    var aralik = secilenTarihAraligi('baslangicTarihiUrun', 'bitisTarihiUrun');

    var urunToplamlari = {}; // urun -> { basarili, basarisiz, atlanan, durduruldu }
    var toplamKayit = 0;
    VERI.kayitlar.forEach(function (k) {
      if (k.z < aralik.baslangicMs || k.z > aralik.bitisMs) return;
      toplamKayit++;
      if (!urunToplamlari[k.u]) urunToplamlari[k.u] = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
      if (urunToplamlari[k.u][k.d] !== undefined) urunToplamlari[k.u][k.d]++;
    });

    ozetAlani.textContent = toplamKayit + ' test kaydı';
    document.getElementById('ucuncuBaslikSayisi').textContent = toplamKayit + ' test kaydı';

    var satirDizisi = Object.keys(urunToplamlari).map(function (urun) {
      var s = urunToplamlari[urun];
      var toplam = s.basarili + s.basarisiz + s.atlanan;
      var oran = toplam > 0 ? Math.round((s.basarili / toplam) * 100) : 0;
      return { urun: urun, basarili: s.basarili, basarisiz: s.basarisiz, atlanan: s.atlanan, durduruldu: s.durduruldu, oran: oran };
    });
    document.getElementById('ikinciBaslikSayisi').textContent = satirDizisi.length + ' ürün';

    var durum = SIRALAMA_DURUMU.urunOzet;
    var DEGER_FN_URUN = {
      urun: function (r) { return r.urun; },
      basarili: function (r) { return r.basarili; },
      basarisiz: function (r) { return r.basarisiz; },
      atlanan: function (r) { return r.atlanan; },
      durduruldu: function (r) { return r.durduruldu; },
      oran: function (r) { return r.oran; }
    };
    satirDizisi = diziyiSirala(satirDizisi, durum.anahtar, durum.yon, DEGER_FN_URUN[durum.anahtar]);
    siralamaOklariniGuncelle();

    if (satirDizisi.length === 0) {
      govde.innerHTML = '<tr><td colspan="6">Seçilen tarih aralığında veri yok</td></tr>';
      ozetBarGrafiginiCiz('ozetGrafikAlani', []);
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    ozetBarGrafiginiCiz('ozetGrafikAlani', satirDizisi.map(function (r) {
      return { etiket: r.urun, basarili: r.basarili, basarisiz: r.basarisiz };
    }));

    govde.innerHTML = satirDizisi
      .map(function (r) {
        var barRengi = r.oran >= 80 ? 'var(--good)' : r.oran >= 50 ? 'var(--warning)' : 'var(--critical)';
        return (
          '<tr>' +
          '<td>' + escapeHtml(r.urun) + '</td>' +
          '<td class="num">' + r.basarili + '</td>' +
          '<td class="num">' + r.basarisiz + '</td>' +
          '<td class="num">' + r.atlanan + '</td>' +
          '<td class="num">' + r.durduruldu + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + r.oran + '%;background:' + barRengi + '"></div></div><span>%' + r.oran + '</span></div></td>' +
          '</tr>'
        );
      })
      .join('');
    ikizTablolarinYuksekliginiEsitle();
  }

  // İkinci bölüm: GENEL seçiliyken "Ürün bazlı özet" (tarih filtreli tablo),
  // bir ürün seçiliyken o ürünün "Adım bazlı başarı" (step) tablosu.
  function ikinciBolumuCiz() {
    var baslik = document.getElementById('ikinciBaslik');
    var altBaslik = document.getElementById('ikinciAltBaslik');
    var alan = document.getElementById('ikinciBolumAlani');
    var ucuncuBaslik = document.getElementById('ucuncuBaslik');
    var ucuncuAltBaslik = document.getElementById('ucuncuAltBaslik');

    if (secilenUrun === GENEL) {
      baslik.textContent = 'Ürün bazlı özet';
      altBaslik.textContent = 'Ürün bazlı başarıda seçilen tarih aralığına göre filtrelenir.';
      ucuncuBaslik.textContent = 'Ürün bazlı başarı';
      ucuncuAltBaslik.textContent = 'Seçili tarih aralığında ürün başına başarılı/başarısız dağılımı — altındaki tabloyla aynı veri.';
      alan.innerHTML =
        '<div class="kart"><table>' +
        '<thead><tr>' +
        '<th class="siralanabilir" data-tablo="urunOzet" data-anahtar="urun" data-tur="metin">Ürün<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="basarili" data-tur="sayi">Başarılı<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="basarisiz" data-tur="sayi">Başarısız<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="atlanan" data-tur="sayi">Atlanan<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="durduruldu" data-tur="sayi">Durduruldu<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="oran" data-tur="sayi">Başarı oranı<span class="siralama-ok"></span></th>' +
        '</tr></thead>' +
        '<tbody id="urunOzetGovdesi"></tbody></table></div>';

      urunOzetTablosunuGuncelle();
      return;
    }

    baslik.textContent = 'Adım bazlı başarı — ' + secilenUrun;
    altBaslik.textContent = 'Yukarıdaki tarih aralığı filtresine göre bu ürünün adımlarında (test.step) görülen başarı/başarısız sayısı.';
    ucuncuBaslik.textContent = 'Adım bazlı başarı — ' + secilenUrun;
    ucuncuAltBaslik.textContent = 'Seçili tarih aralığında adım başına başarılı/başarısız dağılımı — altındaki tabloyla aynı veri.';

    var adimlarHam = VERI.adimOzeti[secilenUrun] || [];
    if (adimlarHam.length === 0) {
      document.getElementById('secimOzetiUrun').textContent = '0 adım kaydı';
      document.getElementById('ucuncuBaslikSayisi').textContent = '0 adım kaydı';
      document.getElementById('ikinciBaslikSayisi').textContent = '0 adım';
      alan.innerHTML = '<div class="bos-durum">Bu ürün için kayıtlı adım (step) verisi yok — testler test.step() kullanmıyor olabilir.</div>';
      ozetBarGrafiginiCiz('ozetGrafikAlani', []);
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    // Adım başına başarılı/başarısız sayıları, seçili tarih aralığındaki kayıtlar (test
    // çalıştırma olayları) üzerinden yeniden hesaplanır — toplam sayı değil, o aralıkta
    // gerçekleşenler sayılır.
    var aralikAdim = secilenTarihAraligi('baslangicTarihiUrun', 'bitisTarihiUrun');
    var adimSatirlari = adimlarHam.map(function (a) {
      var kayitlarAralikta = (a.kayitlar || []).filter(function (k) { return k.z >= aralikAdim.baslangicMs && k.z <= aralikAdim.bitisMs; });
      var basarili = 0, basarisiz = 0;
      kayitlarAralikta.forEach(function (k) { if (k.basarili) basarili++; else basarisiz++; });
      var toplam = basarili + basarisiz;
      return { ad: a.ad, basarili: basarili, basarisiz: basarisiz, toplam: toplam, oran: toplam > 0 ? Math.round((basarili / toplam) * 100) : 0, kayitlar: kayitlarAralikta };
    }).filter(function (a) { return a.toplam > 0; });

    var toplamAdimKaydi = adimSatirlari.reduce(function (t, a) { return t + a.toplam; }, 0);
    document.getElementById('secimOzetiUrun').textContent = toplamAdimKaydi + ' adım kaydı';
    document.getElementById('ucuncuBaslikSayisi').textContent = toplamAdimKaydi + ' adım kaydı';
    document.getElementById('ikinciBaslikSayisi').textContent = adimSatirlari.length + ' adım';

    if (adimSatirlari.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Seçilen tarih aralığında bu ürün için adım verisi yok.</div>';
      ozetBarGrafiginiCiz('ozetGrafikAlani', []);
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    var durumAdim = SIRALAMA_DURUMU.adimOzet;
    var DEGER_FN_ADIM = {
      ad: function (r) { return r.ad; },
      basarili: function (r) { return r.basarili; },
      basarisiz: function (r) { return r.basarisiz; },
      oran: function (r) { return r.oran; }
    };
    adimSatirlari = diziyiSirala(adimSatirlari, durumAdim.anahtar, durumAdim.yon, DEGER_FN_ADIM[durumAdim.anahtar]);

    // Tıklanan satırın kayıt listesini (adim-kayit) render edebilmek için satır
    // index'iyle eşleşen veriyi burada tutuyoruz; büyük veri DOM'a data-* olarak değil,
    // bu değişken üzerinden erişilir.
    AKTIF_ADIM_LISTESI = adimSatirlari;

    ozetBarGrafiginiCiz('ozetGrafikAlani', adimSatirlari.map(function (a) {
      return { etiket: a.ad, basarili: a.basarili, basarisiz: a.basarisiz };
    }));

    var satirlar = adimSatirlari
      .map(function (a, i) {
        var barRengi = a.oran >= 80 ? 'var(--good)' : a.oran >= 50 ? 'var(--warning)' : 'var(--critical)';
        return (
          '<tr class="adim-satir" data-index="' + i + '">' +
          '<td>' + escapeHtml(a.ad) + '</td>' +
          '<td class="num">' + a.basarili + '</td>' +
          '<td class="num">' + a.basarisiz + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + a.oran + '%;background:' + barRengi + '"></div></div><span>%' + a.oran + '</span></div></td>' +
          '</tr>' +
          '<tr class="adim-detay-satir gizli" data-detay-index="' + i + '"><td colspan="4"></td></tr>'
        );
      })
      .join('');

    alan.innerHTML =
      '<div class="kart"><table>' +
      '<thead><tr>' +
      '<th class="siralanabilir" data-tablo="adimOzet" data-anahtar="ad" data-tur="metin">Adım<span class="siralama-ok"></span></th>' +
      '<th class="num siralanabilir" data-tablo="adimOzet" data-anahtar="basarili" data-tur="sayi">Başarılı<span class="siralama-ok"></span></th>' +
      '<th class="num siralanabilir" data-tablo="adimOzet" data-anahtar="basarisiz" data-tur="sayi">Başarısız<span class="siralama-ok"></span></th>' +
      '<th class="num siralanabilir" data-tablo="adimOzet" data-anahtar="oran" data-tur="sayi">Başarı oranı<span class="siralama-ok"></span></th>' +
      '</tr></thead>' +
      '<tbody>' + satirlar + '</tbody></table></div>';
    siralamaOklariniGuncelle();

    Array.prototype.forEach.call(alan.querySelectorAll('.adim-satir'), function (satir) {
      satir.addEventListener('click', function () {
        var i = Number(satir.getAttribute('data-index'));
        var detaySatir = alan.querySelector('.adim-detay-satir[data-detay-index="' + i + '"]');
        var aciliyorMu = detaySatir.classList.contains('gizli');
        // Aynı anda sadece bir satır açık kalsın (karışıklık olmasın diye).
        Array.prototype.forEach.call(alan.querySelectorAll('.adim-satir'), function (s) { s.classList.remove('acik'); });
        Array.prototype.forEach.call(alan.querySelectorAll('.adim-detay-satir'), function (d) { d.classList.add('gizli'); });
        if (!aciliyorMu) { ACIK_ADIM_ADI = null; return; } // zaten açıktı, kapatıldı — yeniden açma
        satir.classList.add('acik');
        detaySatir.classList.remove('gizli');
        ACIK_ADIM_ADI = AKTIF_ADIM_LISTESI[i].ad;
        adimKayitListesiniCiz(detaySatir.querySelector('td'), AKTIF_ADIM_LISTESI[i]);
      });
    });
    // Yeniden çizimden önce açık olan adım hâlâ listedeyse tekrar aç.
    var acikIndex = ACIK_ADIM_ADI === null ? -1 : adimSatirlari.findIndex(function (a) { return a.ad === ACIK_ADIM_ADI; });
    if (acikIndex >= 0) {
      var acikSatir = alan.querySelector('.adim-satir[data-index="' + acikIndex + '"]');
      var acikDetay = alan.querySelector('.adim-detay-satir[data-detay-index="' + acikIndex + '"]');
      acikSatir.classList.add('acik');
      acikDetay.classList.remove('gizli');
      adimKayitListesiniCiz(acikDetay.querySelector('td'), adimSatirlari[acikIndex]);
    }
    ikizTablolarinYuksekliginiEsitle();
  }

  // Bir adımın altındaki (açılan) kayıt listesini çizer — her kayıt tıklanınca detay
  // popup'ı (açıklama + varsa ekran görüntüsü) açılır.
  function adimKayitListesiniCiz(hucre, adim) {
    var kayitlar = adim.kayitlar || [];
    if (kayitlar.length === 0) {
      hucre.innerHTML = '<div class="bos-durum">Bu adım için kayıt bulunamadı.</div>';
      return;
    }
    hucre.innerHTML =
      '<div class="adim-kayit-listesi">' +
      kayitlar
        .map(function (k, i) {
          return (
            '<div class="adim-kayit" data-kayit-index="' + i + '">' +
            '<span class="adim-kayit-nokta ' + (k.basarili ? 'iyi' : 'kotu') + '"></span>' +
            '<span class="adim-kayit-tarih">' + escapeHtml(k.t) + '</span>' +
            '<span class="adim-kayit-ad">' + escapeHtml(k.ad) + '</span>' +
            '<span class="rozet ' + (k.basarili ? 'rozet-iyi' : 'rozet-kritik') + '">' + (k.basarili ? 'Başarılı' : 'Başarısız') + '</span>' +
            '</div>'
          );
        })
        .join('') +
      '</div>';

    Array.prototype.forEach.call(hucre.querySelectorAll('.adim-kayit'), function (satir) {
      satir.addEventListener('click', function () {
        var i = Number(satir.getAttribute('data-kayit-index'));
        adimDetayModalAc(adim.ad, kayitlar[i]);
      });
    });
  }

  function adimDetayModalAc(adimAdi, kayit) {
    document.querySelector('#adimDetayModalOrtu .modal-kutu').classList.remove('genis');
    var icerikAlani = document.getElementById('adimDetayModalIcerik');
    var govde =
      '<p class="modal-baslik">' + escapeHtml(adimAdi) + '</p>' +
      '<p class="modal-alt">' + escapeHtml(kayit.ad) + ' — ' + escapeHtml(kayit.t) + ' — ' +
      '<span class="rozet ' + (kayit.basarili ? 'rozet-iyi' : 'rozet-kritik') + '">' + (kayit.basarili ? 'Başarılı' : 'Başarısız') + '</span></p>';

    if (kayit.basarili) {
      govde += '<div class="bos-durum">Bu adım başarıyla tamamlandı, hata mesajı/ekran görüntüsü yok.</div>';
    } else {
      govde += '<div class="hata-ornek-etiket">Açıklama</div>';
      govde += kayit.m
        ? '<pre class="hata-mesaj">' + escapeHtml(kayit.m) + '</pre>'
        : '<div class="bos-durum">Bu kayıt için hata mesajı bulunamadı.</div>';
      var olasiNeden = olasiNedenBul(kayit.m);
      if (olasiNeden) {
        govde += '<div class="hata-ornek-etiket">Olası neden</div>';
        govde += '<div class="olasi-neden">' + escapeHtml(olasiNeden) + '</div>';
      }
      govde += kayit.g
        ? '<img class="hata-goruntu" src="' + escapeHtml(kayit.g) + '" alt="Adım hata anı ekran görüntüsü" />'
        : '<div class="bos-durum">Bu kayıt için ekran görüntüsü bulunamadı.</div>';
      govde += videoBaglantisiHtml(kayit.v);
    }

    icerikAlani.innerHTML = govde;
    document.getElementById('adimDetayModalOrtu').classList.add('acik');
  }

  function adimDetayModalKapat() {
    document.getElementById('adimDetayModalOrtu').classList.remove('acik');
  }

  // "Koşu geçmişi" satırına tıklayınca açılan Koşu > Ürün > Senaryo > Adım detay
  // penceresi. Tek bir durum nesnesiyle 3 seviye arasında gezinir; ekmek kırıntısındaki
  // (breadcrumb) adımlara tıklayarak geri dönülür.
  var KOSU_DETAY = { kosuIndex: null, urun: null, senaryoIndex: null };

  // Bir ürün sayfasındayken (GENEL değilken) detay penceresi doğrudan o ürünün
  // senaryo listesinden başlar; "tüm ürünler" seviyesi atlanır. GENEL'de kök null'dur.
  function kosuDetayKokUrun() {
    return secilenUrun === GENEL ? null : secilenUrun;
  }

  function kosuDetayAc(kosuIndex) {
    KOSU_DETAY = { kosuIndex: kosuIndex, urun: kosuDetayKokUrun(), senaryoIndex: null };
    document.querySelector('#adimDetayModalOrtu .modal-kutu').classList.add('genis');
    kosuDetayCiz();
    document.getElementById('adimDetayModalOrtu').classList.add('acik');
  }

  function kosuDetayEkmekCiz() {
    var kok = kosuDetayKokUrun();
    // Kök seviyedeyken (henüz kökten ileri gidilmemişken) breadcrumb, üstteki başlıkla
    // birebir aynı şeyi tekrar eder — o yüzden sadece daha derin seviyelerde gösterilir.
    if (KOSU_DETAY.urun === kok && KOSU_DETAY.senaryoIndex === null) return '';
    var kosu = VERI.kosuGecmisi[KOSU_DETAY.kosuIndex];
    var parcalar = [];
    // "Tüm ürünler" kırıntısı sadece GENEL modunda (kök null iken) anlamlıdır; ürüne özel
    // sayfada zaten en üstte seçili ürün var, tekrar ayrı bir "koşu" seviyesi gösterilmez.
    if (kok === null) {
      parcalar.push(KOSU_DETAY.urun === null
        ? '<b>' + escapeHtml(kosu.etiket) + '</b>'
        : '<button type="button" data-ekmek="kosu">' + escapeHtml(kosu.etiket) + '</button>');
    }
    if (KOSU_DETAY.urun !== null) {
      parcalar.push(KOSU_DETAY.senaryoIndex === null
        ? '<b>' + escapeHtml(KOSU_DETAY.urun) + '</b>'
        : '<button type="button" data-ekmek="urun">' + escapeHtml(KOSU_DETAY.urun) + '</button>');
    }
    if (KOSU_DETAY.senaryoIndex !== null) {
      var senaryo = VERI.kosuDetaylari[KOSU_DETAY.kosuIndex][KOSU_DETAY.urun][KOSU_DETAY.senaryoIndex];
      parcalar.push('<b>' + escapeHtml(senaryo.ad) + '</b>');
    }
    return '<p class="kosu-detay-ekmek">' + parcalar.join(' <span style="opacity:.5">›</span> ') + '</p>';
  }

  function kosuDetayGeri() {
    var kok = kosuDetayKokUrun();
    if (KOSU_DETAY.senaryoIndex !== null) KOSU_DETAY.senaryoIndex = null;
    else if (KOSU_DETAY.urun !== kok) KOSU_DETAY.urun = kok;
    else return; // zaten kök seviyedeyiz, gidecek yer yok
    kosuDetayCiz();
  }

  // Kök seviyedeyken geri gidecek bir yer olmadığı için boş döner.
  function kosuDetayGeriDugmesiCiz() {
    var kok = kosuDetayKokUrun();
    if (KOSU_DETAY.urun === kok && KOSU_DETAY.senaryoIndex === null) return '';
    return '<button type="button" class="kosu-detay-geri-buton" id="kosuDetayGeriDugmesi" title="Geri" aria-label="Geri">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>' +
      '</button>';
  }

  function kosuDetayCiz() {
    var icerikAlani = document.getElementById('adimDetayModalIcerik');
    var kosu = VERI.kosuGecmisi[KOSU_DETAY.kosuIndex];
    var senaryolar = VERI.kosuDetaylari[KOSU_DETAY.kosuIndex] || {};
    var govde = '';

    if (KOSU_DETAY.urun === null) {
      // 1. seviye: bu koşudaki ürünler (en üst seviye — geri butonu yok).
      govde += '<p class="modal-baslik">Koşu — ' + escapeHtml(kosu.etiket) + '</p>';
      govde += kosuDetayEkmekCiz();
      var urunAdlari = Object.keys(senaryolar).sort(function (a, b) { return a.localeCompare(b, 'tr'); });
      if (urunAdlari.length === 0) {
        govde += '<div class="bos-durum">Bu koşu için senaryo detayı bulunamadı.</div>';
      } else {
        govde += '<div class="kosu-detay-liste">' + urunAdlari.map(function (urunAdi) {
          var liste = senaryolar[urunAdi];
          var basarisizAdet = liste.filter(function (s) { return s.durum === 'basarisiz'; }).length;
          return (
            '<div class="kosu-detay-oge" data-urun="' + escapeHtml(urunAdi) + '">' +
            '<span class="kosu-detay-oge-ad">' + escapeHtml(urunAdi) + '</span>' +
            '<span class="rozet ' + (basarisizAdet > 0 ? 'rozet-kritik' : 'rozet-iyi') + '">' + basarisizAdet + '/' + liste.length + '</span>' +
            '</div>'
          );
        }).join('') + '</div>';
      }
      icerikAlani.innerHTML = govde;
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('.kosu-detay-oge'), function (oge) {
        oge.addEventListener('click', function () {
          KOSU_DETAY.urun = oge.getAttribute('data-urun');
          kosuDetayCiz();
        });
      });
    } else if (KOSU_DETAY.senaryoIndex === null) {
      // 2. seviye: seçilen üründeki senaryolar (testler).
      var urunSenaryolari = senaryolar[KOSU_DETAY.urun] || [];
      govde += kosuDetayGeriDugmesiCiz();
      govde += '<p class="modal-baslik">' + escapeHtml(KOSU_DETAY.urun) + '</p>';
      govde += kosuDetayEkmekCiz();
      if (urunSenaryolari.length === 0) {
        govde += '<div class="bos-durum">Bu koşuda ' + escapeHtml(KOSU_DETAY.urun) + ' için senaryo çalıştırılmamış.</div>';
      } else {
        govde += '<div class="kosu-detay-liste">' + urunSenaryolari.map(function (s, i) {
          var rozetSinif = s.durum === 'basarisiz' ? 'rozet-kritik' : s.durum === 'atlanan' || s.durum === 'durduruldu' ? 'rozet-notr' : 'rozet-iyi';
          var rozetMetin = s.durum === 'basarisiz' ? 'Başarısız' : s.durum === 'atlanan' ? 'Atlandı' : s.durum === 'durduruldu' ? 'Durduruldu' : 'Başarılı';
          // ▷ / (çalışıyorsa) spinner + Durdur — "Senaryolar" tablosuyla AYNI global
          // çalışma durumundan (CALISAN_SENARYOLAR) çizilir; bkz. kosuDetayBaslatHtml.
          return (
            '<div class="kosu-detay-oge" data-senaryo-index="' + i + '">' +
            kosuDetayBaslatHtml(kosuDetaySenaryoAnahtari(s.ad, KOSU_DETAY.urun)) +
            '<span class="kosu-detay-oge-ad">' + escapeHtml(s.ad) + '</span>' +
            '<span class="rozet ' + rozetSinif + '">' + rozetMetin + '</span>' +
            '</div>'
          );
        }).join('') + '</div>';
      }
      icerikAlani.innerHTML = govde;
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('.kosu-detay-oge'), function (oge) {
        oge.addEventListener('click', function (olay) {
          if (olay.target.closest('[data-senaryo-baslat]') || olay.target.closest('[data-senaryo-durdur]')) return;
          KOSU_DETAY.senaryoIndex = Number(oge.getAttribute('data-senaryo-index'));
          kosuDetayCiz();
        });
      });
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('[data-senaryo-baslat]'), function (buton) {
        buton.addEventListener('click', function (olay) {
          olay.stopPropagation();
          senaryoBaslat(buton.getAttribute('data-senaryo-anahtar'), buton);
        });
      });
    } else {
      // 3. seviye: seçilen senaryonun adım adım (test.step) dökümü.
      var senaryo = (senaryolar[KOSU_DETAY.urun] || [])[KOSU_DETAY.senaryoIndex];
      govde += kosuDetayGeriDugmesiCiz();
      govde += '<p class="modal-baslik">' + escapeHtml(senaryo.ad) + '</p>';
      govde += kosuDetayEkmekCiz();

      if (senaryo.adimlar.length === 0) {
        govde += '<div class="bos-durum">Bu senaryo için adım (test.step) verisi yok.</div>';
        if (senaryo.durum === 'basarisiz' && senaryo.genelMesaj) {
          govde += '<div class="hata-ornek-etiket">Açıklama</div><pre class="hata-mesaj">' + escapeHtml(senaryo.genelMesaj) + '</pre>';
        }
      } else {
        govde += '<div class="kosu-detay-liste">' + senaryo.adimlar.map(function (a, i) {
          var parca = '<div class="kosu-detay-adim" data-adim-index="' + i + '">';
          parca += '<div class="kosu-detay-adim-satir' + (a.basarili ? '' : ' acik') + '">' +
            '<span class="kosu-detay-oge-ad">' + escapeHtml(a.ad) + '</span>' +
            '<span class="rozet ' + (a.basarili ? 'rozet-iyi' : 'rozet-kritik') + '">' + (a.basarili ? 'Başarılı' : 'Başarısız') + '</span>' +
            '</div>';
          var olasiNeden = a.m ? olasiNedenBul(a.m) : null;
          parca += '<div class="kosu-detay-adim-govde' + (a.basarili ? ' gizli' : '') + '">';
          if (a.basarili) {
            parca += '<div class="bos-durum">Bu adım başarıyla tamamlandı.</div>';
          } else {
            parca += a.m
              ? '<pre class="hata-mesaj">' + escapeHtml(a.m) + '</pre>'
              : '<div class="bos-durum">Bu adım için hata mesajı bulunamadı.</div>';
            if (olasiNeden) parca += '<div class="olasi-neden">' + escapeHtml(olasiNeden) + '</div>';
            parca += a.g
              ? '<img class="hata-goruntu" src="' + escapeHtml(a.g) + '" alt="Adım hata anı ekran görüntüsü" />'
              : '';
            parca += videoBaglantisiHtml(a.v);
          }
          parca += '</div>';
          parca += '</div>';
          return parca;
        }).join('') + '</div>';
      }
      icerikAlani.innerHTML = govde;
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('.kosu-detay-adim-satir'), function (satir) {
        satir.addEventListener('click', function () {
          var govdeEl = satir.nextElementSibling;
          if (!govdeEl) return;
          satir.classList.toggle('acik');
          govdeEl.classList.toggle('gizli');
        });
      });
    }

    Array.prototype.forEach.call(icerikAlani.querySelectorAll('[data-ekmek]'), function (dugme) {
      dugme.addEventListener('click', function () {
        var seviye = dugme.getAttribute('data-ekmek');
        if (seviye === 'kosu') { KOSU_DETAY.urun = null; KOSU_DETAY.senaryoIndex = null; }
        else if (seviye === 'urun') { KOSU_DETAY.senaryoIndex = null; }
        kosuDetayCiz();
      });
    });
    var geriDugmesi = document.getElementById('kosuDetayGeriDugmesi');
    if (geriDugmesi) geriDugmesi.addEventListener('click', kosuDetayGeri);
  }

  // Yerel test sunucusuna (scripts/test-sunucu.mjs, "npm run test-sunucu" ile ayrı bir
  // pencerede çalıştırılmalı) bir senaryoyu çalıştırması için istek atar ve sonucu
  // BEKLER — sunucu, test bitene kadar yanıt vermiyor (bkz. testiCalistirVeBekle).
  // Dönen Promise, sunucudan gelen JSON gövdesiyle çözülür (asla reddedilmez —
  // ağ hatası da { basarili: false, mesaj: ... } şeklinde normalleştirilir).
  // kosuId: bu TEKİL koşu isteğine özel benzersiz kimlik — sunucu tarafında
  // calisanSurecler'i (ve /durdur, /canli uçlarını) senaryoAdi yerine bununla anahtarlar,
  // çünkü aynı başlık birden fazla ürün dosyasında tekrarlanabiliyor (bkz.
  // kosuIdOlustur ve satır bazlı Durdur butonundaki kullanım).
  function kosuIdOlustur() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Aynı başlık birden fazla ürün dosyasında bulunabildiği için "Senaryolar" tablosu
  // senaryoları "dosya::ad" anahtarıyla tanır. Anahtarsız (yalnızca ad) çağrılar da
  // desteklenir; o durumda dosya gönderilmez ve sunucu adın tek dosyada olduğunu doğrular.
  var SENARYO_ANAHTAR_AYRACI = '::';
  function senaryoAnahtari(s) {
    return s.dosya ? s.dosya + SENARYO_ANAHTAR_AYRACI + s.ad : s.ad;
  }
  function senaryoAnahtarCoz(anahtar) {
    var i = anahtar.indexOf(SENARYO_ANAHTAR_AYRACI);
    var bilinen = i > 0 && (VERI.tumSenaryolar || []).some(function (s) { return s.dosya === anahtar.slice(0, i); });
    return bilinen
      ? { dosya: anahtar.slice(0, i), ad: anahtar.slice(i + SENARYO_ANAHTAR_AYRACI.length) }
      : { dosya: null, ad: anahtar };
  }

  // Sunucu tek bir koşuyu en fazla ~10 dk sonra kendisi durdurur (süre limiti). Bu
  // istemci tarafı sınır yalnızca sunucu hiç yanıt vermezse (takılma, bağlantı kopması)
  // satırın sonsuza kadar "çalışıyor" kalmaması için son güvencedir; sıra bekleme süresini
  // de kapsayacak kadar uzun tutulur.
  var SENARYO_ISTEK_ZAMAN_ASIMI_MS = 90 * 60 * 1000;

  function senaryoCalistirIstegiGonder(senaryoAnahtarVeyaAdi, kosuId, ekAlanlar) {
    var senaryo = senaryoAnahtarCoz(senaryoAnahtarVeyaAdi);
    var iptalDenetleyici = typeof AbortController === 'function' ? new AbortController() : null;
    var zamanlayici = iptalDenetleyici ? setTimeout(function () { iptalDenetleyici.abort(); }, SENARYO_ISTEK_ZAMAN_ASIMI_MS) : null;
    return fetch(TEST_SUNUCU.taban + '/calistir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ ortam: ORTAM, senaryoAdi: senaryo.ad, dosya: senaryo.dosya, kosuId: kosuId, token: TEST_SUNUCU.token }, ekAlanlar || {})),
      signal: iptalDenetleyici ? iptalDenetleyici.signal : undefined
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function (hata) {
        if (hata && hata.name === 'AbortError') {
          senaryoDurdurIstegiGonder(kosuId);
          return { basarili: false, mesaj: 'Test sunucusundan uzun süre yanıt alınamadı; koşu durduruldu.' };
        }
        return {
          basarili: false,
          mesaj: 'Test sunucusuna ulaşılamadı. Bir terminalde "npm run test-sunucu" çalıştırıp tekrar deneyin.'
        };
      })
      .finally(function () { if (zamanlayici) clearTimeout(zamanlayici); });
  }

  // Sunucuda o an çalışan bir koşuyu (aynı senaryoAdi ile) durdurmasını ister.
  // Sonucu beklemez — asıl sonuç, açık duran /calistir isteğinin yanıtından
  // (durum: "iptal") gelecektir.
  function senaryoDurdurIstegiGonder(kosuId) {
    return fetch(TEST_SUNUCU.taban + '/durdur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kosuId: kosuId, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false }; });
  }

  // Küçük bir "Durdur" ikon butonu üretir (id kontrolü için çağıran bağlar).
  function senaryoDurdurButonuOlustur() {
    var durdurButonu = document.createElement('button');
    durdurButonu.type = 'button';
    durdurButonu.className = 'senaryo-durdur-buton';
    durdurButonu.title = 'Durdur';
    durdurButonu.setAttribute('aria-label', 'Bu koşuyu durdur');
    durdurButonu.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14"></rect></svg>';
    return durdurButonu;
  }

  function senaryoDurumEtiketi(durum) {
    if (durum === 'passed') return 'Başarılı';
    if (durum === 'skipped') return 'Atlandı';
    if (durum === 'iptal') return 'Durduruldu';
    if (durum === 'failed' || durum === 'timedOut' || durum === 'interrupted') return 'Başarısız';
    return durum || 'Bilinmiyor';
  }

  function senaryoSureMetni(sureMs) {
    return typeof sureMs === 'number' ? (sureMs / 1000).toFixed(1) + ' sn' : '';
  }

  function kosuEtiketiClient(zamanDamgasiMs) {
    return new Date(zamanDamgasiMs).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  // senaryoAnahtarVeyaAdi: "dosya::ad" anahtarı (tercih edilen — aynı başlık birden
  // fazla ürün dosyasında olabildiği için doğru ürünü bulur) ya da yalnızca ad (eski
  // localStorage kayıtları / anahtarı bilinmeyen çağrılar — ada göre ilk eşleşme).
  function senaryoUrunuBul(senaryoAnahtarVeyaAdi) {
    var cozulen = senaryoAnahtarCoz(senaryoAnahtarVeyaAdi);
    var eslesme = (VERI.tumSenaryolar || []).find(function (s) {
      return s.ad === cozulen.ad && (!cozulen.dosya || s.dosya === cozulen.dosya);
    });
    return eslesme ? eslesme.urun : 'Diğer';
  }

  // Dashboard'dan (▷ ikonuyla) tetiklenen tekil bir senaryo koşusu bittiğinde, raporu
  // yeniden üretmeden/sayfayı yeniden açmadan "Koşu geçmişi" tablosuna ANINDA yansısın
  // diye VERI'ye sentetik bir "tekil" koşu kaydı ekler (toplam=1). Tekil kayıtlar üst
  // özet kartlarını (VERI.kartlar — yalnızca TAM koşulardan, sunucuda hesaplanır) ve trend grafiğini
  // (yalnızca TAM koşular) KASITLI OLARAK ETKİLEMEZ; "Koşu geçmişi"nde "tekil" rozetiyle
  // görünür.
  //
  // NOT (kalıcılık): Bu kayıt AYRICA (varsayılan olarak, "depolaMi" false geçilmediği
  // sürece) tarayıcının localStorage'ına da yazılır — kullanıcı "Koşu geçmişi"nde
  // gördüğü bir sonucu sayfayı kapatıp/yenileyip tekrar bulamıyordu (rapor dosyası
  // statik olduğundan bir önceki "npm run rapor:*"teki veriyle yeniden yükleniyordu).
  // Sayfa açılışında (bkz. aşağıdaki anlikKosuDepoyuYukle) bu depo okunur; raporun
  // üretim anından (VERI.uretimMs) SONRA biten kayıtlar VERI'ye geri eklenir, öncekiler
  // (zaten rapordaki Allure sonuçlarında yer aldıkları için) atılır.
  // Ekran görüntüsü/video KASITLI OLARAK depolanmaz (localStorage boyutu — birkaç MB —
  // hızla dolar); sadece durum/hata mesajı kalıcı olur.
  // senaryoAnahtarVeyaAdi: "dosya::ad" anahtarı ya da yalnızca ad (bkz. senaryoUrunuBul).
  // grup: { kimlik, tur } — birlikte başlatılan senaryoların ortak koşu kimliği. Aynı
  // kimlikli sonuçlar "Koşu geçmişi"nde tek satırda toplanır.
  function anlikKosuKaydiEkle(senaryoAnahtarVeyaAdi, veri, depolaMi, grup) {
    var zamanMs = Date.now();
    if (!anlikKosuVeriyeEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup)) return;

    if (depolaMi !== false) {
      anlikKosuDepoyaEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup);
    }

    // NOT (önemli, koşu geçmişi görünmeme kök nedeni): "Koşu geçmişi" ve "Koşu trendi"
    // tabloları, sayfa açılışında "tüm zamanlar" diye doldurulan bitisTarihiKosu/
    // bitisTarihiTrend tarih filtrelerine göre süzülüyor (bkz. kosuGecmisiniGuncelle/
    // trendGrafiginiGuncelle). O ilk dolum SADECE o anki (geçmiş Allure) veriye
    // bakıyor — sonradan dashboard'dan tetiklenen YENİ bir koşunun zaman damgası bu
    // sınırın DIŞINDA kaldığından, kayıt VERI.kosuGecmisi'ne eklenmiş olsa bile
    // filtreye takılıp hiç görünmüyordu. Çözüm: yeni kaydın zamanı, bu iki tarih
    // filtresinin bitişini aşıyorsa bitişi buna göre ileri çekiyoruz.
    anlikKosuTarihSinirlariniGenisletGerekirse(zamanMs);

    secimGuncellendi();
  }

  // Kaydı yalnızca VERI'ye ekler (depolama/yeniden çizim YOK) — hem yeni biten koşu
  // (anlikKosuKaydiEkle) hem sayfa açılışında depodan geri yükleme (anlikKosuDepoyuYukle,
  // kaydın GERÇEK zamanıyla) bunu kullanır. Eklenmediyse (geçersiz sonuç) false döner.
  function anlikKosuVeriyeEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup) {
    if (!veri || !veri.basarili || !veri.durum) return false;

    var senaryoAdi = senaryoAnahtarCoz(senaryoAnahtarVeyaAdi).ad;
    var urun = senaryoUrunuBul(senaryoAnahtarVeyaAdi);
    var basariliMi = veri.durum === 'passed';
    var atlandiMi = veri.durum === 'skipped';
    // Kullanıcının "Durdur" ile kestiği koşu (sunucu durum: 'iptal') "Durduruldu"
    // sayılır — başarısız DEĞİL. Sunucunun 10 dk süre limitiyle kestiği koşu
    // ('timedOut') ise testin kendi sorunu olduğundan başarısız kalır.
    var durdurulduMu = veri.durum === 'iptal';
    var basarili = basariliMi ? 1 : 0;
    var basarisiz = !basariliMi && !atlandiMi && !durdurulduMu ? 1 : 0;
    var atlanan = atlandiMi ? 1 : 0;
    var durduruldu = durdurulduMu ? 1 : 0;
    var senaryoKaydi = {
      ad: senaryoAdi,
      durum: basariliMi ? 'basarili' : atlandiMi ? 'atlanan' : durdurulduMu ? 'durduruldu' : 'basarisiz',
      genelMesaj: durdurulduMu ? '' : veri.hataMesaji || '',
      adimlar: []
    };

    // Aynı gruptan (birlikte başlatılmış) bir satır zaten varsa sonuç ona eklenir.
    var grupKimligi = grup && grup.kimlik;
    var mevcutIndex = -1;
    if (grupKimligi) {
      for (var i = VERI.kosuGecmisi.length - 1; i >= 0; i--) {
        if (VERI.kosuGecmisi[i].grup === grupKimligi) { mevcutIndex = i; break; }
      }
    }
    if (mevcutIndex !== -1) {
      var satir = VERI.kosuGecmisi[mevcutIndex];
      satir.basarili += basarili;
      satir.basarisiz += basarisiz;
      satir.atlanan += atlanan;
      satir.durduruldu = (satir.durduruldu || 0) + durduruldu;
      var u = satir.urunler[urun] || (satir.urunler[urun] = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 });
      u.basarili += basarili;
      u.basarisiz += basarisiz;
      u.atlanan += atlanan;
      u.durduruldu = (u.durduruldu || 0) + durduruldu;
      var detay = VERI.kosuDetaylari[mevcutIndex];
      (detay[urun] || (detay[urun] = [])).push(senaryoKaydi);
      return true;
    }

    var urunler = {};
    urunler[urun] = { basarili: basarili, basarisiz: basarisiz, atlanan: atlanan, durduruldu: durduruldu };

    VERI.kosuGecmisi.push({
      grup: grupKimligi || null,
      etiket: kosuEtiketiClient(zamanMs),
      etiketKisa: new Date(zamanMs).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      z: zamanMs,
      tur: (grup && grup.tur) || 'tekil',
      kapsam: grup && grup.tur === 'tam' ? grup.kapsam || 'Genel' : null,
      basarili: basarili,
      basarisiz: basarisiz,
      atlanan: atlanan,
      durduruldu: durduruldu,
      urunler: urunler
    });

    var urunSenaryolari = {};
    urunSenaryolari[urun] = [senaryoKaydi];
    VERI.kosuDetaylari.push(urunSenaryolari);
    return true;
  }

  function anlikKosuTarihSinirlariniGenisletGerekirse(zamanMs) {
    ['bitisTarihiKosu', 'bitisTarihiTrend'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var mevcutMs = el.value ? new Date(el.value).getTime() : -Infinity;
      if (zamanMs > mevcutMs) el.value = gunSaatAnahtari(zamanMs + 60000);
    });
  }

  // "Koşu geçmişi"nin kalıcılığı için localStorage'daki basit JSON dizisi: her ortam
  // (TEST/CANLI) kendi anahtarında tutulur, karışmasınlar diye.
  var ANLIK_KOSU_DEPO_ANAHTARI = 'urunHataRaporuAnlikKosular_' + ORTAM;
  // Depo sınırsız büyümesin diye tutulan azami kayıt sayısı — bunu aşan en eski
  // kayıtlar atılır (asıl kalıcı geçmiş zaten bir sonraki "npm run rapor:*" ile
  // gerçek Allure verisinden yeniden üretilir, bu depo sadece ARADAKİ boşluğu doldurur).
  var ANLIK_KOSU_DEPO_MAKS_KAYIT = 300;

  function anlikKosuDepoyuOku() {
    try {
      var ham = localStorage.getItem(ANLIK_KOSU_DEPO_ANAHTARI);
      var liste = ham ? JSON.parse(ham) : [];
      return Array.isArray(liste) ? liste : [];
    } catch (e) {
      return []; // bozuk JSON/gizli sekme vb. — sıfırdan başla
    }
  }

  function anlikKosuDepoyaEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup) {
    try {
      var liste = anlikKosuDepoyuOku();
      liste.push({
        // "dosya::ad" anahtarı (yalnızca ad olan eski kayıtlar da okunabilir).
        senaryoAdi: senaryoAnahtarVeyaAdi,
        z: zamanMs,
        grup: grup || null,
        // Ekran görüntüsü/video KASITLI OLARAK depolanmaz (bkz. yukarıdaki NOT).
        veri: { basarili: veri.basarili, durum: veri.durum, hataMesaji: veri.hataMesaji || null }
      });
      if (liste.length > ANLIK_KOSU_DEPO_MAKS_KAYIT) liste = liste.slice(-1 * ANLIK_KOSU_DEPO_MAKS_KAYIT);
      localStorage.setItem(ANLIK_KOSU_DEPO_ANAHTARI, JSON.stringify(liste));
    } catch (e) {
      // localStorage dolu/gizli sekme vb. — yoksay, sadece bu koşu kalıcı olmaz.
    }
  }

  // Sayfa açılışında localStorage'daki depoyu okuyup VERI'ye geri ekler — "Koşu
  // geçmişi" tablosu, sayfa yenilense/kapatılıp açılsa bile en son "npm run rapor:*"ten
  // SONRA dashboard'dan tetiklenen koşuları da göstermeye devam eder.
  //  - Kayıtlar KENDİ (gerçek) zamanlarıyla eklenir (eskiden sayfa açılış anıyla
  //    ekleniyordu; hepsi "şimdi" olmuş gibi görünüyordu).
  //  - Zamanı raporun üretim anından (VERI.uretimMs) önce/eşit olan kayıtlar, o koşuların
  //    Allure sonuçları zaten bu rapora dahil olduğundan ATILIR ve depodan da silinir
  //    (aksi halde "Koşu geçmişi"nde iki kez sayılıyorlardı).
  //  - Ekran burada ÇİZİLMEZ — çağıran (sayfa açılışı) en sonda tek bir secimGuncellendi()
  //    yapar (eskiden her kayıt için tüm ekran yeniden çiziliyordu).
  function anlikKosuDepoyuYukle() {
    var liste = anlikKosuDepoyuOku();
    var uretimMs = Number(VERI.uretimMs) || 0;
    var kalanlar = liste.filter(function (kayit) {
      return kayit && typeof kayit.z === 'number' && kayit.z > uretimMs;
    });
    if (kalanlar.length !== liste.length) {
      try {
        if (kalanlar.length) localStorage.setItem(ANLIK_KOSU_DEPO_ANAHTARI, JSON.stringify(kalanlar));
        else localStorage.removeItem(ANLIK_KOSU_DEPO_ANAHTARI);
      } catch (e) {
        // gizli sekme vb. — yoksay; bir sonraki açılışta yine süzülür.
      }
    }
    var enGecZaman = -Infinity;
    kalanlar
      .slice()
      .sort(function (a, b) { return a.z - b.z; })
      .forEach(function (kayit) {
        if (anlikKosuVeriyeEkle(kayit.senaryoAdi, kayit.veri, kayit.z, kayit.grup) && kayit.z > enGecZaman) enGecZaman = kayit.z;
      });
    if (enGecZaman > -Infinity) anlikKosuTarihSinirlariniGenisletGerekirse(enGecZaman);
  }

  // ---------- Global "çalışan senaryolar" durumu ----------
  // anahtar ("dosya::ad", bkz. senaryoAnahtari) -> { kosuId, durduruluyor }.
  // NOT (kök neden): Çalışan satırın spinner'ı + Durdur butonu eskiden yalnızca o anki
  // DOM satırında tutuluyordu; tablo herhangi bir sebeple yeniden çizilince (başka bir
  // koşunun bitmesi, arama, sayfa/ürün değişimi, tümünü seç) satır ▷'ye dönüyor, Durdur
  // kayboluyor ve aynı senaryo ikinci kez başlatılabiliyordu. Artık "Senaryolar" tablosu
  // ve "Koşu geçmişi" detay penceresindeki ▷'ler bu tek haritadan çizilir; sonuç, satırın
  // DOM'u değişmiş olsa bile anahtar üzerinden uygulanır.
  var CALISAN_SENARYOLAR = new Map();

  function senaryoCalisiyorMu(anahtar) {
    return CALISAN_SENARYOLAR.has(anahtar);
  }

  function calisanSenaryoEkle(anahtar, kosuId) {
    CALISAN_SENARYOLAR.set(anahtar, { kosuId: kosuId, durduruluyor: false });
    calisanSenaryoGorunumleriniGuncelle();
  }

  function calisanSenaryoCikar(anahtar, kosuId) {
    var kayit = CALISAN_SENARYOLAR.get(anahtar);
    // Aynı anahtarla sonradan başlatılmış BAŞKA bir koşunun kaydını silmemek için kosuId eşleşmeli.
    if (kayit && kayit.kosuId === kosuId) CALISAN_SENARYOLAR.delete(anahtar);
    calisanSenaryoGorunumleriniGuncelle();
  }

  // Global Durdur: hangi görünümdeki (tablo / koşu detay penceresi) Durdur'a basılırsa
  // basılsın aynı koşu durdurulur; tüm kopyalar "Durduruluyor..." durumuna geçer.
  function calisanSenaryoyuDurdur(anahtar) {
    var kayit = CALISAN_SENARYOLAR.get(anahtar);
    if (!kayit || kayit.durduruluyor) return;
    kayit.durduruluyor = true;
    senaryoDurdurIstegiGonder(kayit.kosuId);
    calisanSenaryoGorunumleriniGuncelle();
  }

  function calisanDurdurButonuHtml(anahtar) {
    var kayit = CALISAN_SENARYOLAR.get(anahtar);
    var durduruluyor = kayit && kayit.durduruluyor;
    return '<button type="button" class="senaryo-durdur-buton" data-senaryo-durdur="' + escapeHtml(anahtar) + '"' +
      (durduruluyor ? ' disabled title="Durduruluyor..."' : ' title="Durdur"') + ' aria-label="Bu koşuyu durdur">' +
      '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14"></rect></svg>' +
      '</button>';
  }

  var BASLAT_IKONU_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"></path></svg>';

  // "Senaryolar" tablosundaki çalıştır hücresinin içeriği: çalışıyorsa spinner + Durdur,
  // değilse ▷.
  function senaryoTablosuCalistirHucresiHtml(anahtar) {
    if (senaryoCalisiyorMu(anahtar)) {
      return '<span class="senaryo-calisan-kontroller"><span class="senaryo-spinner" title="Çalışıyor..."></span>' +
        calisanDurdurButonuHtml(anahtar) + '</span>';
    }
    return '<button type="button" class="senaryo-baslat-buton" data-senaryo-tablosu-baslat title="Bu senaryoyu şimdi çalıştır" aria-label="Bu senaryoyu şimdi çalıştır">' +
      BASLAT_IKONU_SVG + '</button>';
  }

  // Koşu detay penceresindeki ▷ (çalışıyorsa devre dışı + spinner, yanında Durdur).
  function kosuDetayBaslatHtml(anahtar) {
    var calisiyor = senaryoCalisiyorMu(anahtar);
    return '<button type="button" class="senaryo-baslat-buton" data-senaryo-baslat data-senaryo-anahtar="' + escapeHtml(anahtar) + '"' +
      (calisiyor ? ' disabled title="Çalışıyor..."' : ' title="Bu senaryoyu şimdi çalıştır"') + ' aria-label="Bu senaryoyu şimdi çalıştır">' +
      (calisiyor ? '<span class="senaryo-spinner"></span>' : BASLAT_IKONU_SVG) +
      '</button>' +
      (calisiyor ? calisanDurdurButonuHtml(anahtar) : '');
  }

  // Koşu detayındaki senaryo yalnızca ADIYLA bilinir; aynı başlık birden fazla ürün
  // dosyasında olabildiği için önce (ürün + ad) ile TEK eşleşme aranır, bulunursa
  // tablodakiyle aynı "dosya::ad" anahtarı kullanılır (böylece iki görünüm aynı çalışma
  // durumunu paylaşır ve sunucuya dosya da gönderilir). Bulunamazsa yalnızca ad.
  function kosuDetaySenaryoAnahtari(ad, urun) {
    var eslesenler = (VERI.tumSenaryolar || []).filter(function (s) { return s.ad === ad && (!urun || s.urun === urun); });
    if (eslesenler.length !== 1) {
      eslesenler = (VERI.tumSenaryolar || []).filter(function (s) { return s.ad === ad; });
    }
    return eslesenler.length === 1 ? senaryoAnahtari(eslesenler[0]) : ad;
  }

  // Tablo/pencere TAMAMEN yeniden çizilmeden, yalnızca ▷/Durdur hücrelerini global
  // duruma göre günceller (açık durum mesajları, sayfa, seçim vb. bozulmasın diye).
  function calisanSenaryoGorunumleriniGuncelle() {
    Array.prototype.forEach.call(document.querySelectorAll('#senaryoTablosuGovdesi tr[data-senaryo-anahtar]'), function (satir) {
      var anahtar = satir.getAttribute('data-senaryo-anahtar');
      var hucre = satir.querySelector('.senaryo-tablosu-calistir-hucre');
      if (!hucre) return;
      var calisiyor = senaryoCalisiyorMu(anahtar);
      var yeniHtml = senaryoTablosuCalistirHucresiHtml(anahtar);
      if (hucre.innerHTML !== yeniHtml) hucre.innerHTML = yeniHtml;
      satir.classList.toggle('senaryo-satir-calisiyor', calisiyor);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#adimDetayModalIcerik [data-senaryo-baslat]'), function (buton) {
      var anahtar = buton.getAttribute('data-senaryo-anahtar');
      var eskiDurdur = buton.nextElementSibling && buton.nextElementSibling.hasAttribute('data-senaryo-durdur') ? buton.nextElementSibling : null;
      var sablon = document.createElement('span');
      sablon.innerHTML = kosuDetayBaslatHtml(anahtar);
      var yeniButon = sablon.firstChild;
      buton.disabled = yeniButon.disabled;
      buton.title = yeniButon.title;
      buton.innerHTML = yeniButon.innerHTML;
      if (eskiDurdur) eskiDurdur.remove();
      if (sablon.childNodes.length > 1) buton.insertAdjacentElement('afterend', sablon.childNodes[1]);
    });
  }

  // Durdur butonları (tablo + koşu detay penceresi) için tek, belge düzeyinde dinleyici —
  // butonlar yeniden çizilse bile çalışır.
  document.addEventListener('click', function (olay) {
    var durdurButonu = olay.target.closest && olay.target.closest('[data-senaryo-durdur]');
    if (!durdurButonu || durdurButonu.disabled) return;
    calisanSenaryoyuDurdur(durdurButonu.getAttribute('data-senaryo-durdur'));
  });

  // Koşu geçmişi > ürün > senaryo listesindeki ▷ ikonu: sonucu, satırın altına küçük
  // bir mesaj olarak yazar (bu görünümde popup açmaya gerek yok, zaten bir modal içinde).
  // Çalışırken ▷ devre dışı kalır ve yanında "Durdur" ikonu görünür — ikisi de global
  // CALISAN_SENARYOLAR durumundan çizildiği için pencere yeniden çizilse de korunur ve
  // aynı senaryo "Senaryolar" tablosundan ikinci kez başlatılamaz.
  function senaryoBaslat(anahtar, buton) {
    if (!anahtar || senaryoCalisiyorMu(anahtar)) return;
    senaryoDurumGoster(buton, null);

    var kosuId = kosuIdOlustur();
    calisanSenaryoEkle(anahtar, kosuId);

    senaryoCalistirIstegiGonder(anahtar, kosuId).then(function (veri) {
      calisanSenaryoCikar(anahtar, kosuId);
      // Pencere bu arada yeniden çizilmiş olabilir — mesaj GÜNCEL butonun altına yazılır.
      var guncelButon = document.querySelector('#adimDetayModalIcerik [data-senaryo-baslat][data-senaryo-anahtar="' + CSS.escape(anahtar) + '"]') || buton;
      if (veri && veri.basarili) {
        var sure = senaryoSureMetni(veri.sureMs);
        senaryoDurumGoster(guncelButon, {
          basarili: veri.durum === 'passed',
          mesaj: senaryoDurumEtiketi(veri.durum) + (sure ? ' (' + sure + ')' : '') + (veri.hataMesaji ? ' — ' + veri.hataMesaji : '')
        });
        anlikKosuKaydiEkle(anahtar, veri);
      } else {
        senaryoDurumGoster(guncelButon, { basarili: false, mesaj: (veri && veri.mesaj) || 'Başlatılamadı.' });
      }
    });
  }

  // Buton ile aynı satırın hemen altına geçici bir durum mesajı ekler/günceller.
  function senaryoDurumGoster(buton, sonuc) {
    var satir = buton.closest('.kosu-detay-oge');
    if (!satir) return;
    var mevcut = satir.nextElementSibling;
    if (mevcut && mevcut.classList && mevcut.classList.contains('senaryo-durum-mesaji')) {
      mevcut.remove();
    }
    if (!sonuc) return;
    var el = document.createElement('div');
    el.className = 'senaryo-durum-mesaji ' + (sonuc.basarili ? 'basarili' : 'hata');
    el.textContent = sonuc.mesaj;
    satir.insertAdjacentElement('afterend', el);
    if (sonuc.basarili) {
      setTimeout(function () { el.remove(); }, 6000);
    }
  }

  // ---------- "Senaryolar" tablosu (koşu geçmişinden bağımsız, tüm proje) ----------
  var SENARYO_TABLOSU_ARAMA = '';
  // Seçili satırlar burada, checkbox'lardan BAĞIMSIZ olarak (senaryoAdi ile) tutulur —
  // filtre/arama değişip tablo yeniden çizilse bile seçim kaybolmaz.
  var SENARYO_TABLOSU_SECILI = new Set();
  // "Koşuyu başlat" / "Seçilenleri çalıştır" toplu koşu durumu.
  // calisanlar: index -> kosuId (senaryoAdi DEĞİL — aynı başlık birden fazla ürün
  // dosyasında tekrarlanabildiği için, satır bazlı "Durdur" doğru süreci hedefleyebilsin
  // diye her koşuya benzersiz bir kosuId atanır; bkz. kosuIdOlustur).
  var TOPLU_KOSU = { calisiyor: false, iptal: false, calisanlar: new Map() };

  // senaryoTablosuCiz (görünüm) VE "Koşuyu başlat" (hangi senaryoların
  // çalıştırılacağını bilmek için) AYNI filtrelenmiş listeyi kullanır.
  // Aramada Türkçe karakterler ve büyük/küçük harf fark etmesin: "ILK ATES",
  // "ilk ateş" ve "İLK ATEŞ" aynı sonuçları verir.
  function aramaIcinSadelestir(metin) {
    return String(metin)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // ---------- Koşu listesi ("Koşuda" anahtarları) ----------
  // Hangi senaryoların koşuya dahil olduğu tests/data/kosu-listesi.json'da tutulur (rapor
  // üretilirken VERI.tumSenaryolar[i].dahil olarak gömülür). Burada, "dosya::ad"
  // anahtarlarıyla HARİÇ tutulanlar kümesi olarak izlenir. Değişiklikler iyimser (optimistic)
  // uygulanır: anahtar hemen döner, sunucu (/kosu-listesi) reddederse ya da ulaşılamazsa
  // eski değere geri alınır ve kısa bir bildirim gösterilir.
  var KOSU_LISTESI_HARIC = new Set(
    (VERI.tumSenaryolar || []).filter(function (s) { return s.dahil === false; }).map(senaryoAnahtari)
  );
  // Sunucuda sonucu beklenen istek sayısı — hepsi bitince küme sunucunun döndürdüğü
  // (dosyadaki) GERÇEK listeyle eşitlenir (arada yapılan iyimser değişiklikler ezilmesin diye).
  var KOSU_LISTESI_BEKLEYEN_ISTEK = 0;
  var KOSU_LISTESI_BEKLEYEN_ANAHTARLAR = new Set();

  function kosuyaDahilMi(anahtar) {
    return !KOSU_LISTESI_HARIC.has(anahtar);
  }

  // Sunucu "/" ayracıyla normalize edilmiş anahtarlar döner; tablodaki anahtarlar ise
  // "--list" çıktısındaki dosya yolunu (Windows'ta "\") kullanır — eşleştirmek için.
  function kosuListesiAnahtarNormalize(anahtar) {
    var i = anahtar.indexOf(SENARYO_ANAHTAR_AYRACI);
    // NOT: Bu kod bir template literal içinde üretiliyor — "\\\\" çıktıda "\\" olur.
    return i > 0 ? anahtar.slice(0, i).replace(/\\\\/g, '/') + anahtar.slice(i) : anahtar;
  }

  var KOSU_LISTESI_BILDIRIM_ZAMANLAYICI = null;
  function kosuListesiBildirimGoster(mesaj, basariliMi) {
    var el = document.getElementById('kosuListesiBildirim');
    el.textContent = mesaj;
    el.classList.toggle('basarili', !!basariliMi);
    el.hidden = false;
    if (KOSU_LISTESI_BILDIRIM_ZAMANLAYICI) clearTimeout(KOSU_LISTESI_BILDIRIM_ZAMANLAYICI);
    KOSU_LISTESI_BILDIRIM_ZAMANLAYICI = setTimeout(function () { el.hidden = true; }, basariliMi ? 2500 : 6000);
  }

  function kosuListesiIstegiGonder(anahtarlar, dahil) {
    return fetch(TEST_SUNUCU.taban + '/kosu-listesi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token, anahtarlar: anahtarlar, dahil: dahil })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () {
        return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı. Bir terminalde "npm run test-sunucu" çalıştırıp tekrar deneyin.' };
      });
  }

  // anahtarlar: "dosya::ad" listesi; dahil: true (koşuya ekle) / false (koşudan çıkar).
  function kosuListesiniDegistir(anahtarlar, dahil) {
    var degisecekler = anahtarlar.filter(function (a) { return kosuyaDahilMi(a) !== dahil; });
    if (!degisecekler.length) return;
    // İyimser güncelleme — önceki değerler geri alma için saklanır.
    degisecekler.forEach(function (a) {
      if (dahil) KOSU_LISTESI_HARIC.delete(a);
      else KOSU_LISTESI_HARIC.add(a);
      KOSU_LISTESI_BEKLEYEN_ANAHTARLAR.add(a);
    });
    KOSU_LISTESI_BEKLEYEN_ISTEK++;
    senaryoTablosuCiz();
    kosuListesiIstegiGonder(degisecekler, dahil).then(function (sonuc) {
      KOSU_LISTESI_BEKLEYEN_ISTEK--;
      degisecekler.forEach(function (a) { KOSU_LISTESI_BEKLEYEN_ANAHTARLAR.delete(a); });
      if (!sonuc || !sonuc.basarili) {
        // Geri al: yalnızca bu isteğin değiştirdiği anahtarlar eski hâline döner.
        degisecekler.forEach(function (a) {
          if (dahil) KOSU_LISTESI_HARIC.add(a);
          else KOSU_LISTESI_HARIC.delete(a);
        });
        kosuListesiBildirimGoster('Koşu listesi güncellenemedi: ' + ((sonuc && sonuc.mesaj) || 'bilinmeyen hata.'), false);
      } else {
        if (KOSU_LISTESI_BEKLEYEN_ISTEK === 0 && Array.isArray(sonuc.haricTutulanlar)) {
          var sunucuHaric = new Set(sonuc.haricTutulanlar);
          KOSU_LISTESI_HARIC = new Set(
            (VERI.tumSenaryolar || []).map(senaryoAnahtari).filter(function (a) { return sunucuHaric.has(kosuListesiAnahtarNormalize(a)); })
          );
        }
        if (degisecekler.length > 1) {
          kosuListesiBildirimGoster(degisecekler.length + ' senaryo ' + (dahil ? 'koşuya eklendi.' : 'koşudan çıkarıldı.'), true);
        }
      }
      senaryoTablosuCiz();
    });
  }

  function kosudaHucresiHtml(anahtar, ad) {
    var dahilMi = kosuyaDahilMi(anahtar);
    var bekliyor = KOSU_LISTESI_BEKLEYEN_ANAHTARLAR.has(anahtar);
    return '<label class="kosuda-anahtar" title="' + (dahilMi ? 'Koşuya dahil — çıkarmak için tıklayın' : 'Koşudan hariç — eklemek için tıklayın') + '">' +
      '<input type="checkbox" role="switch" class="senaryo-kosuda-anahtari"' + (dahilMi ? ' checked' : '') + (bekliyor ? ' disabled' : '') +
      ' aria-checked="' + (dahilMi ? 'true' : 'false') + '" aria-label="Koşuya dahil: ' + escapeHtml(ad) + '" />' +
      '<span class="kosuda-anahtar-iz" aria-hidden="true"></span></label>';
  }

  function senaryoTablosuFiltrelenmisListeyiGetir() {
    var tumu = VERI.tumSenaryolar || [];
    var genelMi = secilenUrun === GENEL;
    // Soldaki ürün listesinden bir ürün seçiliyse (ör. "JetKasko"), diğer bölümlerle
    // (Hata kalıpları, Koşu geçmişi vb.) tutarlı olsun diye bu tablo da SADECE o
    // ürünün senaryolarını gösterir — GENEL seçiliyken hepsi listelenir.
    var urunSuzulmus = genelMi ? tumu : tumu.filter(function (s) { return s.urun === secilenUrun; });
    var arama = aramaIcinSadelestir(SENARYO_TABLOSU_ARAMA).trim();
    return !arama
      ? urunSuzulmus
      : urunSuzulmus.filter(function (s) {
          return aramaIcinSadelestir(s.ad).indexOf(arama) !== -1 ||
            aramaIcinSadelestir(s.urun).indexOf(arama) !== -1;
        });
  }

  // "Seçilenleri çalıştır"ın GERÇEKTEN çalıştıracağı anahtarlar: yalnızca o an GÖRÜNEN
  // (ürün + arama filtresinden geçen) listede seçili olanlar, halihazırda çalışanlar
  // hariç. NOT (kök neden): eskiden tüm SENARYO_TABLOSU_SECILI çalıştırılıyordu — ürün/
  // arama değişince gizlenen seçimler de koşuyor, butondaki sayı (2) ile koşan sayı (4)
  // tutmuyordu. Buton sayısı, onay penceresi ve koşu artık hep bu listeyi kullanır.
  function seciliCalistirilacakAnahtarlar() {
    return senaryoTablosuFiltrelenmisListeyiGetir()
      .map(senaryoAnahtari)
      .filter(function (anahtar) { return SENARYO_TABLOSU_SECILI.has(anahtar) && !senaryoCalisiyorMu(anahtar); });
  }

  function senaryoTablosuSecimDurumunuGuncelle() {
    var liste = senaryoTablosuFiltrelenmisListeyiGetir();
    var seciliSayisi = 0;
    liste.forEach(function (s) { if (SENARYO_TABLOSU_SECILI.has(senaryoAnahtari(s))) seciliSayisi++; });
    var calistirilacakSayisi = seciliCalistirilacakAnahtarlar().length;

    var tumunuSecCheckbox = document.getElementById('senaryoTumunuSecCheckbox');
    tumunuSecCheckbox.checked = liste.length > 0 && seciliSayisi === liste.length;
    tumunuSecCheckbox.indeterminate = seciliSayisi > 0 && seciliSayisi < liste.length;

    var secilenleriCalistirButonu = document.getElementById('senaryoSecilenleriCalistirButonu');
    // Kullanıcının isteği: sadece BİRDEN FAZLA seçiliyken bu buton görünsün — tek
    // seçimde zaten satırdaki ▷ ikonu var.
    secilenleriCalistirButonu.style.display = calistirilacakSayisi > 1 ? '' : 'none';
    document.getElementById('senaryoSecilenSayisi').textContent = calistirilacakSayisi;

    // "Koşuya ekle / Koşudan çıkar": görünen listede seçili olanlardan durumu değişecek
    // olanların sayısı gösterilir; değişecek bir şey yoksa buton gizlenir.
    var eklenecekler = kosuListesiSeciliAnahtarlar(true).length;
    var cikarilacaklar = kosuListesiSeciliAnahtarlar(false).length;
    document.getElementById('senaryoKosuyaEkleButonu').style.display = eklenecekler ? '' : 'none';
    document.getElementById('senaryoKosuyaEkleSayisi').textContent = eklenecekler;
    document.getElementById('senaryoKosudanCikarButonu').style.display = cikarilacaklar ? '' : 'none';
    document.getElementById('senaryoKosudanCikarSayisi').textContent = cikarilacaklar;
  }

  // Görünen (ürün + arama filtreli) listede seçili olup koşu listesi durumu "dahil"e
  // (hedefDahil=true) ya da "hariç"e (false) göre DEĞİŞECEK olan anahtarlar.
  function kosuListesiSeciliAnahtarlar(hedefDahil) {
    return senaryoTablosuFiltrelenmisListeyiGetir()
      .map(senaryoAnahtari)
      .filter(function (anahtar) { return SENARYO_TABLOSU_SECILI.has(anahtar) && kosuyaDahilMi(anahtar) !== hedefDahil; });
  }

  // "Koşuyu başlat"ın koşacağı liste: görünen listedeki koşuya DAHİL senaryolar
  // (halihazırda çalışanlar hariç).
  function kosuyaDahilGorunenAnahtarlar() {
    return senaryoTablosuFiltrelenmisListeyiGetir()
      .map(senaryoAnahtari)
      .filter(function (anahtar) { return kosuyaDahilMi(anahtar) && !senaryoCalisiyorMu(anahtar); });
  }

  function senaryoTablosuCiz() {
    var govdeEl = document.getElementById('senaryoTablosuGovdesi');
    var tumu = VERI.tumSenaryolar || [];
    var genelMi = secilenUrun === GENEL;
    var liste = senaryoTablosuFiltrelenmisListeyiGetir();

    document.getElementById('senaryoTablosuBasligi').textContent = genelMi ? 'Senaryolar' : 'Senaryolar — ' + secilenUrun;
    document.getElementById('senaryoTablosuBaslikSayisi').textContent = liste.length;
    document.getElementById('senaryoTablosuSecimOzeti').textContent =
      liste.length !== tumu.length ? liste.length + ' / ' + tumu.length + ' gösteriliyor' : '';

    var dahilSayisi = liste.filter(function (s) { return kosuyaDahilMi(senaryoAnahtari(s)); }).length;
    document.getElementById('senaryoKosudaSayaci').textContent = liste.length ? 'Koşuda: ' + dahilSayisi + ' / ' + liste.length : '';

    var tumunuCalistirButonu = document.getElementById('senaryoTumunuCalistirButonu');
    tumunuCalistirButonu.disabled = dahilSayisi === 0 || TOPLU_KOSU.calisiyor;

    var sayfalamaAlani = document.getElementById('senaryoTablosuSayfalama');

    if (liste.length === 0) {
      govdeEl.innerHTML = '<tr><td colspan="5"><div class="bos-durum">' +
        (tumu.length === 0
          ? 'Senaryo listesi alınamadı — rapor üretilirken "npx playwright test --list" çalıştırılamamış olabilir (terminaldeki "npm run rapor:' + ORTAM + '" çıktısına bakın).'
          : 'Eşleşen senaryo bulunamadı.') +
        '</div></td></tr>';
      sayfalamaAlani.innerHTML = '';
      senaryoTablosuSecimDurumunuGuncelle();
      return;
    }

    // Sayfalama: "Koşu geçmişi" tablosuyla aynı mantık/görünüm. Seçim (SENARYO_TABLOSU_SECILI)
    // sayfadan bağımsız (senaryoAdi ile) tutulduğu için 1. sayfada seçip 2. sayfaya
    // geçmek seçimi KAYBETMEZ — "Seçilenleri çalıştır" tüm sayfalardaki seçimi kapsar.
    var toplamSayfa = Math.max(1, Math.ceil(liste.length / SENARYO_TABLOSU_SAYFA_BOYUTU));
    if (senaryoTablosuSayfa > toplamSayfa) senaryoTablosuSayfa = toplamSayfa;
    if (senaryoTablosuSayfa < 1) senaryoTablosuSayfa = 1;
    var baslangicIdx = (senaryoTablosuSayfa - 1) * SENARYO_TABLOSU_SAYFA_BOYUTU;
    var sayfaListesi = liste.slice(baslangicIdx, baslangicIdx + SENARYO_TABLOSU_SAYFA_BOYUTU);

    govdeEl.innerHTML = sayfaListesi.map(function (s) {
      var seciliMi = SENARYO_TABLOSU_SECILI.has(senaryoAnahtari(s));
      var dahilMi = kosuyaDahilMi(senaryoAnahtari(s));
      return (
        '<tr data-senaryo-ad="' + escapeHtml(s.ad) + '" data-senaryo-anahtar="' + escapeHtml(senaryoAnahtari(s)) + '"' + (dahilMi ? '' : ' class="senaryo-satir-haric"') + '>' +
        '<td class="senaryo-tablosu-secim-hucre"><input type="checkbox" class="senaryo-tablosu-secim-kutusu"' + (seciliMi ? ' checked' : '') + ' aria-label="Bu senaryoyu seç" /></td>' +
        '<td class="senaryo-tablosu-urun">' + escapeHtml(s.urun) + '</td>' +
        '<td class="senaryo-tablosu-ad">' + escapeHtml(s.ad) + (dahilMi ? '' : ' <span class="rozet rozet-notr rozet-tekil" title="Koşu listesinde değil — Koşuyu başlat ve npm run test bu senaryoyu koşmaz">hariç</span>') + '</td>' +
        '<td class="senaryo-tablosu-kosuda-hucre">' + kosudaHucresiHtml(senaryoAnahtari(s), s.ad) + '</td>' +
        // Çalışan satırlar (global CALISAN_SENARYOLAR) yeniden çizimde de spinner + Durdur gösterir.
        '<td class="senaryo-tablosu-calistir-hucre">' + senaryoTablosuCalistirHucresiHtml(senaryoAnahtari(s)) + '</td>' +
        '</tr>'
      );
    }).join('');
    Array.prototype.forEach.call(govdeEl.querySelectorAll('tr[data-senaryo-anahtar]'), function (satir) {
      satir.classList.toggle('senaryo-satir-calisiyor', senaryoCalisiyorMu(satir.getAttribute('data-senaryo-anahtar')));
    });

    // ▷ tıklaması tbody üzerinde tek dinleyiciyle (delegation) yakalanır — hücreler
    // calisanSenaryoGorunumleriniGuncelle ile yerinde değiştirildiğinde de çalışsın diye.
    govdeEl.onclick = function (olay) {
      var buton = olay.target.closest('[data-senaryo-tablosu-baslat]');
      if (!buton || buton.disabled) return;
      var anahtar = buton.closest('tr').getAttribute('data-senaryo-anahtar');
      if (senaryoCalisiyorMu(anahtar)) return;
      // Tek bir senaryoyu de "Seçilenleri çalıştır" ile AYNI canlı panel/popup
      // deneyimiyle (durum ikonu, canlı ekran görüntüsü izleme, kendi Durdur
      // ikonu, kapatınca sağ-altta rozet) çalıştırır — kullanıcı isteği: tek/çoklu
      // koşu arasında fark olmasın.
      topluKosuBaslat([anahtar], true);
    };

    Array.prototype.forEach.call(govdeEl.querySelectorAll('.senaryo-kosuda-anahtari'), function (anahtarKutusu) {
      anahtarKutusu.addEventListener('change', function () {
        var anahtar = anahtarKutusu.closest('tr').getAttribute('data-senaryo-anahtar');
        kosuListesiniDegistir([anahtar], anahtarKutusu.checked);
      });
    });

    Array.prototype.forEach.call(govdeEl.querySelectorAll('.senaryo-tablosu-secim-kutusu'), function (kutu) {
      kutu.addEventListener('change', function () {
        var satir = kutu.closest('tr');
        var anahtar = satir.getAttribute('data-senaryo-anahtar');
        if (kutu.checked) SENARYO_TABLOSU_SECILI.add(anahtar);
        else SENARYO_TABLOSU_SECILI.delete(anahtar);
        senaryoTablosuSecimDurumunuGuncelle();
      });
    });

    sayfalamaAlani.innerHTML =
      '<button type="button" id="senaryoTablosuOnceki"' + (senaryoTablosuSayfa <= 1 ? ' disabled' : '') + '>Önceki</button>' +
      '<span class="sayfa-bilgi">Sayfa ' + senaryoTablosuSayfa + ' / ' + toplamSayfa + '</span>' +
      '<button type="button" id="senaryoTablosuSonraki"' + (senaryoTablosuSayfa >= toplamSayfa ? ' disabled' : '') + '>Sonraki</button>';
    var oncekiDugme = document.getElementById('senaryoTablosuOnceki');
    var sonrakiDugme = document.getElementById('senaryoTablosuSonraki');
    if (oncekiDugme) oncekiDugme.addEventListener('click', function () { senaryoTablosuSayfa--; senaryoTablosuCiz(); });
    if (sonrakiDugme) sonrakiDugme.addEventListener('click', function () { senaryoTablosuSayfa++; senaryoTablosuCiz(); });

    senaryoTablosuSecimDurumunuGuncelle();
  }

  // Senaryoyu çalıştırır; çalıştığı sürece global CALISAN_SENARYOLAR'a kaydedilir —
  // "Senaryolar" tablosundaki satır (DOM'da olsun ya da olmasın, sonradan kaç kez
  // yeniden çizilirse çizilsin) spinner + Durdur gösterir. Sonuç gelince kayıt silinir
  // ve sonuç anahtar üzerinden uygulanır (satırın eski DOM düğümüne bağlı DEĞİL).
  // "gosterPopup" true ise sonuç popup'ı açılır; toplu koşularda (topluKosuBaslat) false
  // geçilir — 87 senaryo art arda 87 popup açmasın diye. Sonucu her zaman "Koşu
  // geçmişi"ne ekler. Bir Promise döner ki toplu koşu fonksiyonları bekleyebilsin.
  // kosuId çağıran (topluKosuBaslat > birTaneCalistir) tarafından üretilip geçirilir —
  // canlı panelin kendi Durdur ikonuyla AYNI koşuyu hedeflesin diye.
  function senaryoTablosuCalistir(anahtar, secenekler, kosuId) {
    var gosterPopup = !secenekler || secenekler.gosterPopup !== false;
    calisanSenaryoEkle(anahtar, kosuId);
    var gorunenAd = senaryoAnahtarCoz(anahtar).ad;
    return senaryoCalistirIstegiGonder(anahtar, kosuId, secenekler && secenekler.ekAlanlar).then(function (veri) {
      // Önce çalışma kaydı silinir ki anlikKosuKaydiEkle'nin tetiklediği yeniden çizimde
      // satır ▷'ye dönsün.
      calisanSenaryoCikar(anahtar, kosuId);
      if (gosterPopup) senaryoSonucPopupGoster(gorunenAd, veri);
      var ek = secenekler && secenekler.ekAlanlar;
      anlikKosuKaydiEkle(anahtar, veri, true, ek ? { kimlik: ek.kosuKimligi, tur: ek.kosuTuru, kapsam: ek.kosuKapsami || null } : null);
      return veri;
    });
  }

  function senaryoTabloDisindaCalistir(anahtar, kosuId, ekAlanlar) {
    return senaryoTablosuCalistir(anahtar, { gosterPopup: false, ekAlanlar: ekAlanlar }, kosuId);
  }

  function canliPanelSatirIdGetir(index) {
    return 'canliPanelSatir' + index;
  }

  // index -> { zamanlayici, sonUrl } — bir satır çalışırken açılan canlı ekran görüntüsü
  // sorgulama (polling) döngüsünü tutar. Satır bitince (canliPanelSatirBitir) veya panel
  // kapanınca durdurulup temizlenir.
  var CANLI_IZLEME_POLL = {};
  // index -> { ad, kosuId }, o an "çalışıyor" durumunda olan satırlar — panel kapatılıp
  // küçük rozetten tekrar açılınca hangi satırların canlı görüntü sorgulamasını
  // (bkz. canliPanelIzlemeyiBaslat) yeniden başlatması gerektiğini bilmek için.
  var CANLI_PANEL_CALISAN_INDEXLER = {};

  function canliPanelIzlemeyiDurdur(index) {
    var kayit = CANLI_IZLEME_POLL[index];
    if (!kayit) return;
    clearInterval(kayit.zamanlayici);
    if (kayit.sonUrl) URL.revokeObjectURL(kayit.sonUrl);
    delete CANLI_IZLEME_POLL[index];
  }

  // Bir senaryo çalışırken satırın detay alanına 1-1.5 saniyede bir güncellenen bir
  // ekran görüntüsü akıtır — kullanıcı ayrı bir Chrome penceresi görmeden, panel
  // içindeki satıra tıklayıp testi "canlı" izleyebilsin diye (bkz. test-sunucu.mjs
  // > /canli ve fixtures.ts > canliIzlemeYayini).
  function canliPanelIzlemeyiBaslat(index, ad, kosuId) {
    canliPanelIzlemeyiDurdur(index);
    var satir = document.getElementById(canliPanelSatirIdGetir(index));
    if (!satir) return;
    var img = satir.querySelector('.canli-panel-canli-goruntu');
    if (!img) return;

    function birTikSorgula() {
      var url =
        TEST_SUNUCU.taban + '/canli?token=' + encodeURIComponent(TEST_SUNUCU.token) +
        '&kosuId=' + encodeURIComponent(kosuId);
      fetch(url)
        .then(function (yanit) {
          if (!yanit.ok) return null;
          return yanit.blob();
        })
        .then(function (blob) {
          if (!blob) return;
          var guncelSatir = document.getElementById(canliPanelSatirIdGetir(index));
          var guncelImg = guncelSatir && guncelSatir.querySelector('.canli-panel-canli-goruntu');
          if (!guncelImg) return;
          var yeniUrl = URL.createObjectURL(blob);
          var eskiUrl = CANLI_IZLEME_POLL[index] && CANLI_IZLEME_POLL[index].sonUrl;
          guncelImg.src = yeniUrl;
          if (CANLI_IZLEME_POLL[index]) CANLI_IZLEME_POLL[index].sonUrl = yeniUrl;
          if (eskiUrl) URL.revokeObjectURL(eskiUrl);
        })
        .catch(function () {
          // Sunucuya erişilemedi/koşu henüz görüntü üretmedi — bir sonraki tikte tekrar denenir.
        });
    }

    CANLI_IZLEME_POLL[index] = { zamanlayici: setInterval(birTikSorgula, 1200), sonUrl: null };
    birTikSorgula();
  }

  function senaryoDurumIkonSinifi(veri) {
    if (!veri || !veri.basarili) return 'basarisiz';
    if (veri.durum === 'passed') return 'basarili';
    if (veri.durum === 'skipped' || veri.durum === 'iptal') return 'notr';
    return 'basarisiz';
  }

  function senaryoDurumIkonHarfi(sinif) {
    if (sinif === 'basarili') return '✓';
    if (sinif === 'basarisiz') return '✕';
    return '–';
  }

  // Toplu koşu başlarken TÜM senaryoları "bekliyor" durumunda listeleyen paneli açar —
  // kullanıcının isteği: seçtikleri alt alta görünsün, her biri bitince yeşil/kırmızı
  // yansın, tıklayınca o senaryonun ekran görüntüsünü/videosunu görsün.
  function canliPanelAc(senaryolar) {
    Object.keys(CANLI_IZLEME_POLL).forEach(function (index) { canliPanelIzlemeyiDurdur(index); });
    CANLI_PANEL_CALISAN_INDEXLER = {};

    var listeEl = document.getElementById('senaryoCanliPanelListesi');
    listeEl.innerHTML = senaryolar.map(function (ad, i) {
      return (
        '<div class="canli-panel-satir" id="' + canliPanelSatirIdGetir(i) + '" data-senaryo-ad="' + escapeHtml(ad) + '">' +
        '<div class="canli-panel-satir-ust">' +
        '<span class="canli-panel-durum-ikon bekliyor">…</span>' +
        '<span class="canli-panel-satir-ad">' + escapeHtml(ad) + '</span>' +
        '<span class="canli-panel-sure"></span>' +
        '</div>' +
        '<div class="canli-panel-detay"></div>' +
        '</div>'
      );
    }).join('');

    document.getElementById('senaryoCanliPanelBaslik').textContent = 'Senaryolar çalışıyor...';
    document.getElementById('senaryoCanliPanelAltBaslik').textContent = '0 / ' + senaryolar.length + ' tamamlandı';
    var durdurButonu = document.getElementById('senaryoCanliPanelDurdurButonu');
    durdurButonu.style.display = '';
    durdurButonu.disabled = false;
    document.getElementById('senaryoCanliPanelOrtu').classList.add('acik');
    // Yeni bir koşu başladı — panel zaten açık olduğundan küçük rozete gerek yok,
    // ama bundan sonra panel kapatılırsa rozet gösterilebilir hale gelir.
    CANLI_PANEL_ROZET_GORUNSUN = true;
    canliPanelRozetGizle();

    // Satırlar EN BAŞTAN (henüz "bekliyor" durumundayken) tıklanabilir — kullanıcı bir
    // senaryo çalışmaya başlar başlamaz üzerine tıklayıp canlı izlemeye geçebilsin diye.
    // Tek bir olay dinleyicisi (delegation) tüm satırları kapsar, her satır yeniden
    // çizilmeden hayatta kalır.
    listeEl.onclick = function (olay) {
      if (olay.target.closest('video') || olay.target.closest('.video-baglanti') || olay.target.closest('.hata-goruntu') || olay.target.closest('.canli-panel-canli-goruntu') || olay.target.closest('.senaryo-durdur-buton')) return;
      var satir = olay.target.closest('.canli-panel-satir');
      if (!satir) return;
      satir.classList.toggle('acik');
    };
  }

  function canliPanelSatirCalisiyorGoster(index, ad, kosuId) {
    var satir = document.getElementById(canliPanelSatirIdGetir(index));
    if (!satir) return;
    satir.querySelector('.canli-panel-durum-ikon').outerHTML =
      '<span class="canli-panel-durum-ikon"><span class="senaryo-spinner" style="width:12px;height:12px;border-width:2px;"></span></span>';

    // Her satir KENDI "Durdur" ikonunu alir - kullanici hangi satirdakine tiklarsa
    // SADECE o senaryo durur, ustteki "Tumunu durdur" gibi tum kosuyu etkilemez.
    // NOT (4. kök neden — satır Durdur'un takılması): burada ÖNCEDEN senaryoAdi (ad)
    // gönderiliyordu; aynı başlık başka bir ürün dosyasında da varsa sunucu tarafındaki
    // calisanSurecler kaydı ikisi arasında paylaşılıp EZİLİYORDU, bu satırın gerçek süreci
    // hiç ölmüyor ve buton sonsuza dek "Durduruluyor..." kalıyordu. Artık bu koşuya özel
    // kosuId gönderiliyor (bkz. birTaneCalistir > kosuIdOlustur).
    var sureEl = satir.querySelector('.canli-panel-sure');
    if (sureEl && !satir.querySelector('.senaryo-durdur-buton')) {
      var satirDurdurButonu = senaryoDurdurButonuOlustur();
      satirDurdurButonu.title = 'Bu kosuyu durdur';
      satirDurdurButonu.addEventListener('click', function (olay) {
        olay.stopPropagation();
        satirDurdurButonu.disabled = true;
        satirDurdurButonu.title = 'Durduruluyor...';
        senaryoDurdurIstegiGonder(kosuId);
      });
      sureEl.insertAdjacentElement('afterend', satirDurdurButonu);
    }
    CANLI_PANEL_CALISAN_INDEXLER[index] = { ad: ad, kosuId: kosuId };

    // Satır henüz "çalışıyor" durumundayken, tıklanınca canlı ekran görüntüsünü
    // gösterecek detay alanını şimdiden hazırlar ve sorgulamayı (polling) başlatır —
    // kullanıcı satıra tıkladığı an görüntü zaten akıyor olsun diye.
    var detayEl = satir.querySelector('.canli-panel-detay');
    detayEl.innerHTML =
      '<p class="canli-panel-canli-etiket"><span class="canli-panel-canli-nokta"></span>Canlı izleniyor</p>' +
      '<img class="canli-panel-canli-goruntu" alt="' + escapeHtml(ad) + ' - canlı görüntü" />';
    canliPanelIzlemeyiBaslat(index, ad, kosuId);
  }

  // Bir senaryo bitince satırı yeşile/kırmızıya çevirir, süresini yazar ve — varsa —
  // tıklanınca açılan bir detay alanına son ekran görüntüsünü + koşu videosu için
  // "▶ Videoyu izle" bağlantısını (yeni sekmede, test sunucusunun /medya ucundan) ekler.
  // Video artık sayfaya <video> olarak gömülmüyor (kullanıcı kararı).
  function canliPanelSatirBitir(index, ad, veri) {
    canliPanelIzlemeyiDurdur(index);
    var satir = document.getElementById(canliPanelSatirIdGetir(index));
    if (!satir) return;
    var sinif = senaryoDurumIkonSinifi(veri);
    satir.querySelector('.canli-panel-durum-ikon').outerHTML =
      '<span class="canli-panel-durum-ikon ' + sinif + '">' + senaryoDurumIkonHarfi(sinif) + '</span>';
    satir.querySelector('.canli-panel-sure').textContent = veri && veri.sureMs ? senaryoSureMetni(veri.sureMs) : '';
    // Kosu bitti - artik durduracak bir sey kalmadigi icin satirin kendi Durdur
    // ikonu kaldirilir.
    var satirDurdurButonu = satir.querySelector('.senaryo-durdur-buton');
    if (satirDurdurButonu) satirDurdurButonu.remove();
    delete CANLI_PANEL_CALISAN_INDEXLER[index];

    var detayHtml = '';
    if (!veri || !veri.basarili) {
      detayHtml = '<pre class="hata-mesaj">' + escapeHtml((veri && veri.mesaj) || 'Çalıştırılamadı.') + '</pre>';
    } else {
      if (veri.durum === 'iptal') {
        detayHtml += '<div class="bos-durum">Bu koşu durduruldu.</div>';
      } else if (veri.hataMesaji) {
        detayHtml += '<pre class="hata-mesaj">' + escapeHtml(veri.hataMesaji) + '</pre>';
      } else if (veri.mesaj && veri.durum !== 'passed') {
        detayHtml += '<pre class="hata-mesaj">' + escapeHtml(veri.mesaj) + '</pre>';
      }
      if (veri.ekranGoruntusu) {
        detayHtml += '<img class="hata-goruntu" src="data:image/png;base64,' + veri.ekranGoruntusu + '" alt="' + escapeHtml(ad) + '" />';
      }
      detayHtml += videoBaglantisiHtml(veri.videoUrl);
    }

    var detayEl = satir.querySelector('.canli-panel-detay');
    detayEl.innerHTML = detayHtml || '<div class="bos-durum">Gösterilecek ek bilgi yok.</div>';
    satir.classList.add('canli-panel-satir-bittiyse');
    // Tıklama zaten canliPanelAc'ta listeEl üzerinde delegation ile bağlandı — burada
    // ayrıca dinleyici eklemeye gerek yok (satır zaten en baştan tıklanabilirdi).
  }

  function canliPanelIlerlemeGuncelle(tamamlanan, toplam) {
    document.getElementById('senaryoCanliPanelAltBaslik').textContent = tamamlanan + ' / ' + toplam + ' tamamlandı';
    canliPanelRozetDurumunuGuncelle();
  }

  function canliPanelBitir(basarili, basarisiz, atlanan, calistirilamadi, iptalEdildiMi) {
    document.getElementById('senaryoCanliPanelBaslik').textContent = iptalEdildiMi ? 'Durduruldu' : 'Tamamlandı';
    document.getElementById('senaryoCanliPanelAltBaslik').textContent =
      basarili + ' başarılı, ' + basarisiz + ' başarısız' +
      (atlanan ? ', ' + atlanan + ' atlandı' : '') +
      (calistirilamadi ? ', ' + calistirilamadi + ' çalıştırılamadı' : '');
    document.getElementById('senaryoCanliPanelDurdurButonu').style.display = 'none';
    canliPanelRozetDurumunuGuncelle();
  }

  // Panel kapatılınca (X ikonu, dışarı tıklama veya Escape) TAMAMEN kaybolmasın diye:
  // en son "Koşuyu başlat"/"Seçilenleri çalıştır" ile en az bir koşu başlatıldıysa
  // (CANLI_PANEL_ROZET_GORUNSUN), sağ altta küçük bir rozet belirir — üzerine tıklanınca
  // panel (o an çalışıyor olsun ya da bitmiş olsun) aynı içerikle tekrar açılır.
  var CANLI_PANEL_ROZET_GORUNSUN = false;

  function canliPanelRozetDurumunuGuncelle() {
    var rozet = document.getElementById('canliPanelKucukRozet');
    if (!rozet) return;
    var baslik = document.getElementById('senaryoCanliPanelBaslik').textContent;
    var altBaslik = document.getElementById('senaryoCanliPanelAltBaslik').textContent;
    document.getElementById('canliPanelKucukRozetMetin').textContent = baslik + (altBaslik ? ' — ' + altBaslik : '');
    document.getElementById('canliPanelKucukRozetSpinner').style.display = TOPLU_KOSU.calisiyor ? '' : 'none';
  }

  function canliPanelRozetGoster() {
    if (!CANLI_PANEL_ROZET_GORUNSUN) return;
    canliPanelRozetDurumunuGuncelle();
    document.getElementById('canliPanelKucukRozet').style.display = 'flex';
  }

  function canliPanelRozetGizle() {
    document.getElementById('canliPanelKucukRozet').style.display = 'none';
  }

  function senaryoCanliPanelKapat() {
    document.getElementById('senaryoCanliPanelOrtu').classList.remove('acik');
    canliPanelRozetGoster();
    // Panel kapanınca hâlâ çalışan satırlar varsa bile canlı görüntü sorgulamasını
    // durdur — arka planda gereksiz istek atılmasın.
    Object.keys(CANLI_IZLEME_POLL).forEach(function (index) { canliPanelIzlemeyiDurdur(index); });
  }

  // "Koşuyu başlat" SIRAYLA çalışır (bir bitmeden diğeri başlamaz) —
  // düzinelerce senaryoyu (bazı ürünlerde 80'i aşkın) aynı anda paralel çalıştırmak
  // hem makineyi hem de testlerin paylaştığı acente/kullanıcı oturumunu (bkz.
  // playwright.config.ts'teki fullyParallel:false notu) karıştırır. "Seçilenleri
  // çalıştır" ise kullanıcının BİLİNÇLİ OLARAK seçtiği (genelde küçük) bir grup
  // olduğu için, kullanıcının isteği doğrultusunda AYNI ANDA (paralel) çalışır.
  // kapsam: 'Genel' ya da ürün adı — yalnızca tam koşularda sunucuya "kosuKapsami" olarak
  // gönderilir (bkz. fixtures.ts > kosuKapsami etiketi, ürün kartları/trend hesabı).
  function topluKosuBaslat(senaryolar, esZamanliMi, tamKosuMu, kapsam) {
    // Onay penceresi açıkken başka bir yerden başlatılmış olabilecek senaryolar atlanır
    // (aynı senaryo iki kez koşmasın).
    senaryolar = senaryolar.filter(function (anahtar) { return !senaryoCalisiyorMu(anahtar); });
    if (TOPLU_KOSU.calisiyor || !senaryolar.length) return;
    TOPLU_KOSU.calisiyor = true;
    TOPLU_KOSU.iptal = false;
    TOPLU_KOSU.calisanlar = new Map();
    // Tam koşu: tüm senaryolar aynı kosuKimligi ile 'tam' olarak etiketlenir; bitince rapor
    // yeniden üretilir ve üst kartlar bu koşuyla güncellenir.
    // Kısmi koşular (seçilenler, ürüne/aramaya daraltılmış liste, tek ▷) da ortak bir
    // kimlik alır; koşu geçmişinde tek bir "tekil" satır olarak toplanırlar.
    var ekAlanlar = { kosuTuru: tamKosuMu ? 'tam' : 'tekil', kosuKimligi: 'dashboard-' + kosuIdOlustur() };
    if (tamKosuMu) ekAlanlar.kosuKapsami = kapsam || 'Genel';

    var toplam = senaryolar.length;
    var tamamlanan = 0;
    var basarili = 0, basarisiz = 0, atlanan = 0, calistirilamadi = 0;

    // senaryolar "dosya::ad" anahtarlarıdır; panelde yalnızca ad gösterilir.
    var gorunenAdlar = senaryolar.map(function (anahtar) { return senaryoAnahtarCoz(anahtar).ad; });
    canliPanelAc(gorunenAdlar);
    senaryoTablosuCiz(); // "Koşuyu başlat" butonunu devre dışı bırakmak için

    function birTaneCalistir(ad, index) {
      // kosuId: bu TEKİL koşuya özel benzersiz kimlik — aynı başlık (ad) başka bir
      // ürün dosyasında da seçilmiş olabileceğinden, satırın kendi Durdur ikonunun ve
      // canlı izlemenin doğru süreci hedeflemesi için "ad" yerine bu kullanılır.
      var kosuId = kosuIdOlustur();
      var anahtar = ad;
      ad = gorunenAdlar[index];
      TOPLU_KOSU.calisanlar.set(index, kosuId);
      canliPanelSatirCalisiyorGoster(index, ad, kosuId);
      return senaryoTabloDisindaCalistir(anahtar, kosuId, ekAlanlar).then(function (veri) {
        TOPLU_KOSU.calisanlar.delete(index);
        tamamlanan++;
        canliPanelSatirBitir(index, ad, veri);
        canliPanelIlerlemeGuncelle(tamamlanan, toplam);

        if (!veri || !veri.basarili) calistirilamadi++;
        else if (veri.durum === 'passed') basarili++;
        else if (veri.durum === 'skipped') atlanan++;
        else if (veri.durum !== 'iptal') basarisiz++;
        return veri;
      });
    }

    var bittiMi = false;
    function bitir() {
      if (bittiMi) return;
      bittiMi = true;
      TOPLU_KOSU.calisiyor = false;
      senaryoTablosuCiz();
      canliPanelBitir(basarili, basarisiz, atlanan, calistirilamadi, TOPLU_KOSU.iptal);
      // Her koşudan sonra rapor yeniden üretilir: adım/ürün tabloları, hata kalıpları ve
      // (tam koşuysa) kartlar ancak Allure sonuçlarından yeniden hesaplanınca güncellenir.
      kosuSonrasiRaporuGuncelle();
    }

    if (esZamanliMi) {
      // Bir koşuda beklenmeyen bir hata olsa bile toplu koşu kilitli kalmasın diye
      // bitir() her durumda çağrılır.
      Promise.all(senaryolar.map(function (ad, i) { return birTaneCalistir(ad, i); })).then(bitir, bitir);
    } else {
      (function siradaki(i) {
        if (i >= senaryolar.length || TOPLU_KOSU.iptal) {
          bitir();
          return;
        }
        birTaneCalistir(senaryolar[i], i).then(
          function () { siradaki(i + 1); },
          function () { siradaki(i + 1); }
        );
      })(0);
    }
  }

  // Toplu koşuyu durdurur: sıradaki senaryoların başlamasını engeller VE o an
  // fiilen çalışmakta olan her senaryo için sunucuya ayrı ayrı /durdur isteği yollar
  // (eş zamanlı modda birden fazla senaryo aynı anda çalışıyor olabilir).
  // Birden fazla senaryoyu tek tıkla başlatmadan önce sayfa içi onay ister: kaç
  // senaryonun, hangi ortamda ve nasıl (sırayla / aynı anda) koşacağı gösterilir.
  var TOPLU_KOSU_ONAY_BEKLEYEN = null;
  // secenekler (yalnızca "Koşuyu başlat" için): { kosuMu, tamKosuMu, kapsam, aramaVarMi,
  // haricSayisi }. "Seçilenleri çalıştır" seçeneksiz çağırır (kısmi/tekil koşu).
  function topluKosuOnayiIste(senaryolar, esZamanliMi, secenekler) {
    if (TOPLU_KOSU.calisiyor || !senaryolar.length) return;
    var sec = secenekler || {};
    var tamKosuMu = !!sec.tamKosuMu;
    TOPLU_KOSU_ONAY_BEKLEYEN = { senaryolar: senaryolar, esZamanliMi: esZamanliMi, tamKosuMu: tamKosuMu, kapsam: sec.kapsam || 'Genel' };
    var canliMi = String(ORTAM) === 'canli';
    var ortamHtml = '<strong' + (canliMi ? ' class="toplu-onay-canli"' : '') + '>' + escapeHtml(String(ORTAM).toUpperCase()) + '</strong>';
    var metin;
    var not;
    if (sec.kosuMu) {
      document.getElementById('topluKosuOnayBaslik').textContent = 'Koşuyu başlat?';
      metin = '<strong>' + senaryolar.length + ' senaryo</strong> (' + escapeHtml(sec.kapsam || 'Genel') + ') koşusu, ' + ortamHtml + ' ortamında sırayla çalıştırılacak.';
      if (sec.haricSayisi) {
        metin += '<br><span class="toplu-onay-not">' + sec.haricSayisi + ' senaryo koşu listesinde olmadığı için dahil edilmedi.</span>';
      }
      if (sec.aramaVarMi) {
        not = 'Arama filtresi etkin: yalnızca aramayla eşleşenler koşar. Bu yüzden kısmi (tekil) koşu olarak kaydedilir; üst kartları ve trendi DEĞİŞTİRMEZ, koşu geçmişinde "tekil" görünür.';
      } else if ((sec.kapsam || 'Genel') === 'Genel') {
        not = 'Koşu olarak kaydedilir; bitince Genel kartlar, Genel trend ve koşulan her ürünün kartları güncellenir.';
      } else {
        not = 'Koşu olarak kaydedilir; bitince ' + escapeHtml(sec.kapsam) + ' kartları ve trendi güncellenir (Genel kartlarda da ' + escapeHtml(sec.kapsam) + ' kısmı yenilenir; Genel trend değişmez).';
      }
    } else {
      document.getElementById('topluKosuOnayBaslik').textContent = 'Toplu koşuyu başlat?';
      metin = '<strong>' + senaryolar.length + ' senaryo</strong>, ' + ortamHtml + ' ortamında ' + (esZamanliMi ? 'aynı anda' : 'sırayla') + ' çalıştırılacak.';
      not = tamKosuMu
        ? 'Koşu olarak kaydedilir; bitince üst kartlar bu koşuyla güncellenir.'
        : 'Kısmi koşu olarak kaydedilir; üst kartları değiştirmez, koşu geçmişinde "tekil" görünür.';
    }
    document.getElementById('topluKosuOnayMetni').innerHTML =
      metin +
      (canliMi ? '<br><span class="toplu-onay-canli">Dikkat: CANLI ortamda gerçek işlem oluşturabilir.</span>' : '') +
      '<br><span class="toplu-onay-not">' + not + '</span>';
    document.getElementById('topluKosuOnayOrtu').classList.add('acik');
    document.getElementById('topluKosuOnayBaslat').focus();
  }
  function topluKosuOnayKapat() {
    TOPLU_KOSU_ONAY_BEKLEYEN = null;
    document.getElementById('topluKosuOnayOrtu').classList.remove('acik');
  }

  // Koşu bitince sunucudan raporu yeniden üretmesini ister; üretim bitince sayfayı
  // yenilemek için panelde bir buton gösterir (panel kapalıysa sayfa doğrudan yenilenir).
  function kosuSonrasiRaporuGuncelle() {
    var altBaslik = document.getElementById('senaryoCanliPanelAltBaslik');
    var ozet = altBaslik.textContent;
    altBaslik.textContent = ozet + ' — tablolar güncelleniyor...';
    fetch(TEST_SUNUCU.taban + '/rapor-uret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
      .then(function (veri) {
        if (!veri || !veri.basarili) {
          altBaslik.textContent = ozet + ' — tablolar güncellenemedi (terminalde "npm run rapor:' + ORTAM + '" çalıştırın).';
          canliPanelRozetDurumunuGuncelle();
          return;
        }
        if (!document.getElementById('senaryoCanliPanelOrtu').classList.contains('acik')) {
          location.reload();
          return;
        }
        altBaslik.textContent = ozet + ' — tablolar güncellendi. ';
        var yenile = document.createElement('button');
        yenile.type = 'button';
        yenile.className = 'senaryo-toplu-buton senaryo-toplu-buton-vurgulu';
        yenile.textContent = '↻ Sayfayı yenile';
        yenile.addEventListener('click', function () { location.reload(); });
        altBaslik.appendChild(yenile);
        canliPanelRozetDurumunuGuncelle();
      });
  }

  function topluKosuDurdur() {
    TOPLU_KOSU.iptal = true;
    TOPLU_KOSU.calisanlar.forEach(function (kosuId) { senaryoDurdurIstegiGonder(kosuId); });
  }

  function senaryoSonucPopupGoster(senaryoAdi, veri) {
    var icerikAlani = document.getElementById('senaryoSonucModalIcerik');
    var calistirilamadiMi = !veri || !veri.basarili;
    var govde = '<p class="modal-baslik">' + escapeHtml(senaryoAdi) + '</p>';
    govde += '<p class="senaryo-sonuc-ozet">Ortam: ' + escapeHtml(String(ORTAM).toUpperCase()) + '</p>';

    if (calistirilamadiMi) {
      govde += '<div class="senaryo-sonuc-satir"><span class="rozet rozet-kritik">Çalıştırılamadı</span></div>';
      govde += '<pre class="hata-mesaj">' + escapeHtml((veri && veri.mesaj) || 'Bilinmeyen hata.') + '</pre>';
    } else {
      var basariliMi = veri.durum === 'passed';
      var notrMu = veri.durum === 'skipped' || veri.durum === 'iptal';
      var rozetSinif = basariliMi ? 'rozet-iyi' : notrMu ? 'rozet-notr' : 'rozet-kritik';
      var sure = senaryoSureMetni(veri.sureMs);
      govde += '<div class="senaryo-sonuc-satir"><span class="rozet ' + rozetSinif + '">' + escapeHtml(senaryoDurumEtiketi(veri.durum)) + '</span>' +
        (sure ? '<span class="senaryo-sonuc-ozet">' + escapeHtml(sure) + '</span>' : '') + '</div>';
      if (veri.durum === 'iptal') {
        govde += '<div class="bos-durum">Bu koşu, "Durdur" ikonuyla kullanıcı tarafından iptal edildi.</div>';
      } else if (veri.hataMesaji) {
        govde += '<div class="hata-ornek-etiket">Hata</div><pre class="hata-mesaj">' + escapeHtml(veri.hataMesaji) + '</pre>';
      } else if (!basariliMi) {
        govde += '<div class="bos-durum">Detaylı hata mesajı yok — test-sunucu terminalindeki çıktıya bakın.</div>';
      }

      // Başarılı koşularda da fixtures.ts'in çektiği son ekran görüntüsü — "hata-goruntu"
      // sınıfı sayesinde tıklanınca mevcut lightbox (gorselBuyutmeAc) ile büyütülebilir.
      if (veri.ekranGoruntusu) {
        var goruntuEtiketi = basariliMi ? 'Son ekran görüntüsü' : 'Hata anındaki ekran görüntüsü';
        govde += '<div class="hata-ornek-etiket">' + escapeHtml(goruntuEtiketi) + '</div>' +
          '<img class="hata-goruntu" src="data:image/png;base64,' + veri.ekranGoruntusu + '" alt="' + escapeHtml(senaryoAdi) + ' — ' + escapeHtml(goruntuEtiketi) + '" />';
      }

      // Koşu videosu — playwright.config.ts'in "video: 'on'" (dashboard koşularına
      // özel) ayarı sayesinde başarılı/başarısız her koşuda mevcuttur. Sayfaya gömülmez;
      // yeni sekmede açılan bir bağlantı olarak verilir.
      govde += videoBaglantisiHtml(veri.videoUrl);
    }

    icerikAlani.innerHTML = govde;
    document.getElementById('senaryoSonucModalOrtu').classList.add('acik');
  }

  function senaryoSonucModalKapat() {
    document.getElementById('senaryoSonucModalOrtu').classList.remove('acik');
  }

  // ------------------------------------------------------------------------------
  // "+ Senaryo Oluştur" (JetSeyahat) — kullanıcı popup'ta ürüne özel alanları
  // doldurur, "Senaryoyu Koş" ile GEÇİCİ bir başlıkla deneme koşusu yaptırır
  // (jet-seyahat.json'a geçici eklenip sonuç alındıktan sonra sunucu tarafında geri
  // çıkarılır — bkz. test-sunucu.mjs /jetseyahat-senaryo/dene), sonucu görür, isterse
  // "Kaydet" ile kalıcı bir başlıkla jet-seyahat.json'a KALICI olarak ekletir
  // (/jetseyahat-senaryo/kaydet). Kayıttan sonra "Senaryolar" listesinde görünmesi
  // için dashboard'un yeniden üretilmesi (npm run rapor:test) gerekir — mevcut
  // "Koşu geçmişi" statik anlık görüntü sınırlamasıyla aynı mimari kısıt.
  // ------------------------------------------------------------------------------
  var SENARYO_OLUSTUR_SON_SONUC = null; // Son "Senaryoyu Koş" denemesinin sonucu (kaydet adımında kullanılır).
  // /jetseyahat-yardimci-veri'den gelen hazır profil listeleri (ettiren/sigortalı
  // dropdown'larını "tc1 (45520772518, 13.04.1998)" gibi etiketlerle doldurmak için) ve
  // "Çoklu" sorgu tipinde kullanılacak sabit Excel bilgisi. Modal her açıldığında tazelenir;
  // fetch tamamlanana kadar boş listelerle başlar.
  var SENARYO_OLUSTUR_KIMLIK_PROFILLERI = { ozel: {}, tuzel: {} };
  var SENARYO_OLUSTUR_COKLU_SORGU_BILGISI = {};
  // Popup'ta "Çoklu" sorgu için özel bir Excel yüklendiyse (bkz. cokluSorguDosyasiSecildi),
  // sunucunun döndüğü { dosyaYolu, dosyaAdi } burada tutulur; senaryoOlusturFormundanVeriTopla
  // bunu senaryo.cokluSorguDosyasi olarak gönderir. Modal her açıldığında sıfırlanır.
  var SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;

  // Kapsam/alternatif eşleşmesi GALAKSİ ekranında sabit — her popup açılışında ekrandan
  // okumaya gerek yok (bu daha önce canlı bir tarayıcı açıp birkaç saniye sürüyordu).
  // Ekrana ileride yeni bir kapsam/alternatif eklenirse burası elle güncellenir.
  var JETSEYAHAT_KAPSAM_ALTERNATIF = {
    'DÜNYA': ['VİZE TÜM DÜNYA', 'SEYAHAT PAKET'],
    'AVRUPA': ['VİZE SCHENGEN', 'SEYAHAT PAKET']
  };

  // Kapsam dropdown'unu sabit listeyle doldurur; alternatif listesi kapsam seçimine
  // göre senaryoOlusturAlternatifleriGuncelle ile tazelenir.
  function senaryoOlusturSecenekleriYukle() {
    var kapsamSelect = document.getElementById('sof_kapsam');
    if (!kapsamSelect) return;
    kapsamSelect.innerHTML = Object.keys(JETSEYAHAT_KAPSAM_ALTERNATIF).map(function (k) {
      return '<option value="' + escapeHtml(k) + '">' + escapeHtml(k) + '</option>';
    }).join('');
    senaryoOlusturAlternatifleriGuncelle();
  }

  // Alternatif seçenekleri KAPSAM'a göre değiştiğinden (ör. AVRUPA'da SCHENGEN varken
  // DÜNYA'da yok), kapsam her değiştiğinde alternatif listesi bu fonksiyonla tazelenir.
  function senaryoOlusturAlternatifleriGuncelle() {
    var kapsamSelect = document.getElementById('sof_kapsam');
    var alternatifSelect = document.getElementById('sof_alternatif');
    if (!kapsamSelect || !alternatifSelect) return;
    var secenekler = JETSEYAHAT_KAPSAM_ALTERNATIF[kapsamSelect.value] || [];
    alternatifSelect.innerHTML = secenekler.map(function (a) {
      return '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>';
    }).join('');
  }

  // Hazır profil listelerini ve çoklu-sorgu Excel bilgisini sunucudan çeker; modal zaten
  // açıksa (ettiren/sigortalı bloğu "farklı" konumundaysa) o bloğu güncel etiketlerle
  // yeniden çizer.
  function senaryoOlusturYardimciVeriYukle() {
    fetch(TEST_SUNUCU.taban + '/jetseyahat-yardimci-veri?ortam=' + encodeURIComponent(ORTAM) + '&token=' + encodeURIComponent(TEST_SUNUCU.token))
      .then(function (yanit) { return yanit.json(); })
      .then(function (sonuc) {
        if (!sonuc || !sonuc.basarili) return;
        SENARYO_OLUSTUR_KIMLIK_PROFILLERI = sonuc.kimlikProfilleri || { ozel: {}, tuzel: {} };
        SENARYO_OLUSTUR_COKLU_SORGU_BILGISI = sonuc.cokluSorgu || {};
        var ettirenSelect = document.getElementById('sof_ettiren');
        if (ettirenSelect && ettirenSelect.value !== 'ayni') ettirenAltBlokCiz();
        var sigortaliSelect = document.getElementById('sof_sigortaliTipi');
        if (sigortaliSelect && sigortaliSelect.value !== 'varsayilan') sigortaliAltBlokGuncelle();
        cokluSorguVarsayilanGuncelle();
      })
      .catch(function () {});
  }

  // "Çoklu" sorgu tipi seçildiğinde yükleme alanını gösterir/gizler; bir dosya zaten
  // yüklendiyse (SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME) durum metnine dokunmaz, yoksa
  // ürünün sabit dosyasının kullanılacağını hatırlatır.
  function cokluSorguAlaniGuncelle() {
    var alanEl = document.getElementById('sof_cokluSorguAlan');
    var sorguTipiEl = document.getElementById('sof_sorguTipi');
    if (!alanEl || !sorguTipiEl) return;
    alanEl.classList.toggle('gizli', sorguTipiEl.value !== 'coklu');
    cokluSorguVarsayilanGuncelle();
  }

  // "Özel Excel yüklenmezse ürünün sabit dosyası kullanılır" hatırlatmasını günceller;
  // bir dosya zaten başarıyla yüklendiyse bu hatırlatma gösterilmez (cokluSorguDosyasiSecildi
  // o alana kendi "Yüklendi: ..." mesajını yazar).
  function cokluSorguVarsayilanGuncelle() {
    var varsayilanEl = document.getElementById('sof_cokluSorguVarsayilan');
    var sorguTipiEl = document.getElementById('sof_sorguTipi');
    if (!varsayilanEl || !sorguTipiEl) return;
    if (sorguTipiEl.value !== 'coklu' || SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME) {
      varsayilanEl.innerHTML = '';
      return;
    }
    var bilgi = SENARYO_OLUSTUR_COKLU_SORGU_BILGISI || {};
    var kisiSayisiMetni = bilgi.kisiSayisi ? ' (' + escapeHtml(String(bilgi.kisiSayisi)) + ' kişi)' : '';
    varsayilanEl.innerHTML = '<p class="senaryo-form-yardim">Excel yüklenmezse ürünün sabit dosyası kullanılır: ' +
      escapeHtml(bilgi.dosya || '(yükleniyor...)') + kisiSayisiMetni + '</p>';
  }

  // Seçilen .xlsx dosyasını base64'e çevirip sunucuya yükler (bkz. test-sunucu.mjs >
  // /jetseyahat-coklu-sorgu-yukle); başarılı olursa dönen göreli yol
  // SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME'de tutulur ve senaryoOlusturFormundanVeriTopla
  // bunu senaryo.cokluSorguDosyasi olarak gönderir. Kişi sayısı otomatik algılanamadığından
  // (Excel içeriği ayrıştırılmıyor) kullanıcı ayrı bir alana kendisi girer.
  function cokluSorguDosyasiSecildi(olay) {
    var dosya = olay.target.files && olay.target.files[0];
    var durumEl = document.getElementById('sof_cokluSorguDurum');
    SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;
    cokluSorguVarsayilanGuncelle();
    if (!dosya) { durumEl.innerHTML = ''; return; }
    if (!/\.xlsx$/i.test(dosya.name)) {
      durumEl.innerHTML = '<p class="senaryo-form-hata">Yalnızca .xlsx dosyaları desteklenir.</p>';
      olay.target.value = '';
      return;
    }
    durumEl.innerHTML = '<p class="senaryo-form-yardim">Yükleniyor...</p>';
    var okuyucu = new FileReader();
    okuyucu.onload = function () {
      var base64 = String(okuyucu.result || '').split(',')[1] || '';
      fetch(TEST_SUNUCU.taban + '/jetseyahat-coklu-sorgu-yukle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token, dosyaAdi: dosya.name, veriBase64: base64 })
      })
        .then(function (yanit) { return yanit.json(); })
        .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
        .then(function (sonuc) {
          if (!sonuc || !sonuc.basarili) {
            durumEl.innerHTML = '<p class="senaryo-form-hata">Yüklenemedi: ' + escapeHtml((sonuc && sonuc.mesaj) || 'bilinmeyen hata') + '</p>';
            return;
          }
          SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = { dosyaYolu: sonuc.dosyaYolu, dosyaAdi: dosya.name };
          cokluSorguVarsayilanGuncelle();
          durumEl.innerHTML = '<p class="senaryo-form-yardim">Yüklendi: ' + escapeHtml(dosya.name) + ' — kişi sayısını girmeyi unutmayın.</p>';
        });
    };
    okuyucu.onerror = function () {
      durumEl.innerHTML = '<p class="senaryo-form-hata">Dosya okunamadı.</p>';
    };
    okuyucu.readAsDataURL(dosya);
  }

  // Ettiren ve sigortalı bloklarının ikisi de aynı desende: "hazır profil kullan" (bir
  // profil anahtarı seç, gerçek kimlik test anında ortak.json'dan çözülür) ya da "yeni
  // kimlik gir" (bu senaryoya özel serbest kimlik alanları). alanOnEki, üretilen
  // eleman id'lerinin ve radio-grup adının önekidir (ör. "sof_ettiren", "sof_sigortali").
  function kimlikAltBlokCiz(blokEl, tip, alanOnEki) {
    var profiller = (tip === 'tuzel'
      ? (SENARYO_OLUSTUR_KIMLIK_PROFILLERI || {}).tuzel
      : (SENARYO_OLUSTUR_KIMLIK_PROFILLERI || {}).ozel) || {};
    var hazirProfilSecenekleri = Object.keys(profiller).map(function (anahtar) {
      var p = profiller[anahtar] || {};
      var etiket = tip === 'tuzel'
        ? anahtar + ' (' + (p.vergiKimlikNo || '') + ')'
        : anahtar + ' (' + (p.tcKimlikNo || '') + ', ' + (p.dogumTarihi || '') + ')';
      return '<option value="' + escapeHtml(anahtar) + '">' + escapeHtml(etiket) + '</option>';
    }).join('');
    var serbestAlanlariHtml = tip === 'tuzel'
      // Vergi Dairesi ekranda hiç kullanılmıyor (bkz. jet-seyahat.page.ts >
      // farkliTuzelEttirenGir — yalnızca vergiKimlikNo + cepTelefonu ile sorgulanıyor),
      // bu yüzden popup'ta da istenmiyor.
      ? '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>Vergi Kimlik No</label><input type="text" id="' + alanOnEki + 'Vkn" /></div>' +
          '<div class="senaryo-form-alan"><label>Cep Telefonu</label><input type="text" id="' + alanOnEki + 'Telefon" /></div>' +
        '</div>'
      : '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>T.C. Kimlik No</label><input type="text" id="' + alanOnEki + 'Tc" /></div>' +
          '<div class="senaryo-form-alan"><label>Doğum Tarihi <span class="senaryo-form-yardim">(gg.aa.yyyy)</span></label><input type="text" id="' + alanOnEki + 'Dogum" placeholder="13.04.1998" /></div>' +
          '<div class="senaryo-form-alan"><label>Cep Telefonu</label><input type="text" id="' + alanOnEki + 'Telefon" /></div>' +
        '</div>';
    var radioAdi = alanOnEki + 'Kaynak';
    blokEl.innerHTML =
      '<div class="senaryo-form-alt-blok">' +
        '<div class="senaryo-form-radio-grup">' +
          '<label><input type="radio" name="' + radioAdi + '" value="hazir" checked /> Hazır profil kullan</label>' +
          '<label><input type="radio" name="' + radioAdi + '" value="serbest" /> Yeni kimlik gir</label>' +
        '</div>' +
        '<div id="' + alanOnEki + 'HazirAlani" class="senaryo-form-alan"><label>Profil</label><select id="' + alanOnEki + 'Profili">' + hazirProfilSecenekleri + '</select></div>' +
        '<div id="' + alanOnEki + 'SerbestAlani" class="senaryo-form-alan gizli">' + serbestAlanlariHtml + '</div>' +
      '</div>';
    Array.prototype.forEach.call(blokEl.querySelectorAll('[name="' + radioAdi + '"]'), function (radio) {
      radio.addEventListener('change', function () {
        var hazirSecili = document.querySelector('[name="' + radioAdi + '"]:checked').value === 'hazir';
        document.getElementById(alanOnEki + 'HazirAlani').classList.toggle('gizli', !hazirSecili);
        document.getElementById(alanOnEki + 'SerbestAlani').classList.toggle('gizli', hazirSecili);
      });
    });
  }

  function senaryoOlusturModalAc() {
    var icerikAlani = document.getElementById('senaryoOlusturModalIcerik');
    SENARYO_OLUSTUR_SON_SONUC = null;
    icerikAlani.innerHTML =
      '<p class="modal-baslik">JetSeyahat — Senaryo Oluştur</p>' +
      '<p class="modal-alt">Ekranda normalde doldurduğunuz alanları girin, "Senaryoyu Koş" ile önce deneyin.</p>' +
      '<form id="senaryoOlusturForm">' +
        '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>Kapsam</label>' +
            '<select id="sof_kapsam"></select>' +
          '</div>' +
          '<div class="senaryo-form-alan"><label>Alternatif</label>' +
            '<select id="sof_alternatif"></select>' +
          '</div>' +
        '</div>' +
        '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>COVID Teminatı</label>' +
            '<select id="sof_covid"><option value="E">Evet</option><option value="H">Hayır</option></select>' +
          '</div>' +
          '<div class="senaryo-form-alan"><label>Sorgu Tipi</label>' +
            '<select id="sof_sorguTipi"><option value="tekli">Tekli</option><option value="coklu">Çoklu</option></select>' +
          '</div>' +
        '</div>' +
        '<div class="senaryo-form-alan gizli" id="sof_cokluSorguAlan">' +
          '<label>Özel Excel Yükle <span class="senaryo-form-yardim">(yalnızca "Çoklu" sorguda; boş bırakılırsa ürünün sabit dosyası kullanılır)</span></label>' +
          '<div class="senaryo-form-satir" style="align-items:flex-end">' +
            '<div class="senaryo-form-alan" style="flex:2 1 200px"><input type="file" id="sof_cokluSorguDosyasi" accept=".xlsx" /></div>' +
            '<div class="senaryo-form-alan" style="flex:0 0 120px"><label>Kişi Sayısı</label><input type="number" min="1" id="sof_cokluSorguKisiSayisi" placeholder="ör. 10" /></div>' +
          '</div>' +
          '<div id="sof_cokluSorguVarsayilan"></div>' +
          '<div id="sof_cokluSorguDurum"></div>' +
        '</div>' +
        '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>Acente Kodu <span class="senaryo-form-yardim">(boş=varsayılan acente)</span></label><input type="text" id="sof_acenteKodu" placeholder="örn. 30447" /></div>' +
          '<div class="senaryo-form-alan"><label>Acente Kullanıcı Kodu</label><input type="text" id="sof_acenteKullanicisi" placeholder="örn. 604" /></div>' +
        '</div>' +
        '<div class="senaryo-form-alan"><label class="senaryo-form-checkbox"><input type="checkbox" id="sof_kayak" /> Kayak teminatı</label></div>' +
        '<div class="senaryo-form-alan"><label>Sigorta Ettiren</label>' +
          '<select id="sof_ettiren"><option value="ayni">Sigortalı ile aynı</option><option value="farkliOzel">Farklı özel (T.C.)</option><option value="farkliTuzel">Farklı tüzel (VKN)</option></select>' +
        '</div>' +
        '<div id="sof_ettirenAltBlok"></div>' +
        '<div class="senaryo-form-alan"><label>Sigortalı</label>' +
          '<select id="sof_sigortaliTipi"><option value="varsayilan">Ürün varsayılanı</option><option value="farkli">Farklı özel (T.C.)</option></select>' +
        '</div>' +
        '<div id="sof_sigortaliAltBlok"></div>' +
        '<div class="senaryo-form-alan"><label>Beklenen İş Kuralı Hatası <span class="senaryo-form-yardim">(doluysa: seçilen adımda bu hata beklenir, sonraki adımlara geçilmez)</span></label>' +
          '<div class="senaryo-form-satir" style="align-items:flex-end">' +
            '<div class="senaryo-form-alan" style="flex:0 0 220px"><label>Hatanın Beklendiği Adım</label>' +
              '<select id="sof_beklenenHataAdimi">' +
                '<option value="primHesaplama">Prim hesaplanır</option>' +
                '<option value="policelestirme">Poliçeleştirme açılır</option>' +
              '</select>' +
            '</div>' +
            '<div class="senaryo-form-alan" style="flex:2 1 200px"><textarea id="sof_beklenenHata" placeholder="Boş bırakılırsa normal akış (prim + ödeme) denenir"></textarea></div>' +
          '</div>' +
        '</div>' +
        '<div id="sof_hataAlani"></div>' +
        '<div id="sof_sonucAlani"></div>' +
        '<div class="senaryo-form-buton-satir">' +
          '<button type="button" id="sof_kosButonu" class="birincil">Senaryoyu Koş</button>' +
          '<button type="button" id="sof_vazgecButonu">Vazgeç</button>' +
        '</div>' +
      '</form>';

    ettirenAltBlokCiz();
    document.getElementById('sof_ettiren').addEventListener('change', ettirenAltBlokCiz);

    sigortaliAltBlokGuncelle();
    document.getElementById('sof_sigortaliTipi').addEventListener('change', sigortaliAltBlokGuncelle);

    SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;
    document.getElementById('sof_sorguTipi').addEventListener('change', cokluSorguAlaniGuncelle);
    document.getElementById('sof_cokluSorguDosyasi').addEventListener('change', cokluSorguDosyasiSecildi);
    cokluSorguAlaniGuncelle();

    document.getElementById('sof_vazgecButonu').addEventListener('click', senaryoOlusturModalKapat);
    document.getElementById('sof_kosButonu').addEventListener('click', senaryoOlusturDene);

    document.getElementById('sof_kapsam').addEventListener('change', senaryoOlusturAlternatifleriGuncelle);
    senaryoOlusturSecenekleriYukle();
    senaryoOlusturYardimciVeriYukle();

    document.getElementById('senaryoOlusturModalOrtu').classList.add('acik');
  }

  // Sigorta Ettiren bloğuyla AYNI desen (bkz. kimlikAltBlokCiz): "ayni" seçiliyken blok
  // boş; "farkliOzel"/"farkliTuzel" seçiliyken ilgili tip için hazır profil/serbest giriş
  // alanları çizilir.
  function ettirenAltBlokCiz() {
    var deger = document.getElementById('sof_ettiren').value;
    var blokEl = document.getElementById('sof_ettirenAltBlok');
    if (deger === 'ayni') { blokEl.innerHTML = ''; return; }
    kimlikAltBlokCiz(blokEl, deger === 'farkliOzel' ? 'ozel' : 'tuzel', 'sof_ettiren');
  }

  // Sigortalı her zaman bir gerçek kişi olduğundan (VKN yok), "farkli" seçiliyken sadece
  // özel (T.C.) tipiyle kimlikAltBlokCiz çağrılır.
  function sigortaliAltBlokGuncelle() {
    var deger = document.getElementById('sof_sigortaliTipi').value;
    var blokEl = document.getElementById('sof_sigortaliAltBlok');
    if (deger === 'varsayilan') { blokEl.innerHTML = ''; return; }
    kimlikAltBlokCiz(blokEl, 'ozel', 'sof_sigortali');
  }

  function senaryoOlusturModalKapat() {
    document.getElementById('senaryoOlusturModalOrtu').classList.remove('acik');
  }

  // Formdaki alanlardan sunucuya gönderilecek senaryo nesnesini üretir; ettiren/
  // sigortalı kimlik bilgileri "hazır profil" (profil adı) ya da "serbest giriş"
  // (doğrudan kimlik alanları) olabildiğinden ikisi de destekiği için ayrı ayrı okunur.
  function senaryoOlusturFormundanVeriTopla() {
    var el = function (id) { return document.getElementById(id); };
    var veri = {
      kapsam: el('sof_kapsam').value,
      alternatif: el('sof_alternatif').value,
      covidTeminati: el('sof_covid').value,
      sorguTipi: el('sof_sorguTipi').value,
      ettiren: el('sof_ettiren').value,
      kayakTeminati: el('sof_kayak').checked,
      beklenenHataMesaji: el('sof_beklenenHata').value.trim() || undefined,
      beklenenHataAdimi: el('sof_beklenenHataAdimi').value
    };

    // Acente kodu ve kullanıcı kodu doğrudan elle yazılır — canlı bir sorgu/doğrulama
    // YAPILMAZ, kullanıcı doğru değerleri zaten bildiğini belirtti.
    var acenteKoduDeger = el('sof_acenteKodu').value.trim();
    if (acenteKoduDeger) {
      veri.acenteKodu = acenteKoduDeger;
      veri.acenteKullanicisi = el('sof_acenteKullanicisi').value.trim();
    }

    if (veri.ettiren !== 'ayni') {
      var kaynakEl = document.querySelector('[name="sof_ettirenKaynak"]:checked');
      var kaynak = kaynakEl ? kaynakEl.value : 'hazir';
      if (kaynak === 'hazir') {
        veri.ettirenProfili = el('sof_ettirenProfili').value;
      } else if (veri.ettiren === 'farkliOzel') {
        veri.ettirenOzelKimligi = {
          tcKimlikNo: (el('sof_ettirenTc') || {}).value || '',
          dogumTarihi: (el('sof_ettirenDogum') || {}).value || '',
          cepTelefonu: (el('sof_ettirenTelefon') || {}).value || ''
        };
      } else {
        veri.ettirenTuzelKimligi = {
          vergiKimlikNo: (el('sof_ettirenVkn') || {}).value || '',
          cepTelefonu: (el('sof_ettirenTelefon') || {}).value || ''
        };
      }
    }

    if (el('sof_sigortaliTipi').value === 'farkli') {
      var sigortaliKaynakEl = document.querySelector('[name="sof_sigortaliKaynak"]:checked');
      var sigortaliKaynak = sigortaliKaynakEl ? sigortaliKaynakEl.value : 'hazir';
      if (sigortaliKaynak === 'hazir') {
        veri.sigortaliProfili = el('sof_sigortaliProfili').value;
      } else {
        veri.sigortaliKimligi = {
          tcKimlikNo: (el('sof_sigortaliTc') || {}).value || '',
          dogumTarihi: (el('sof_sigortaliDogum') || {}).value || '',
          cepTelefonu: (el('sof_sigortaliTelefon') || {}).value || ''
        };
      }
    }

    // Çoklu sorguda özel bir Excel yüklendiyse (bkz. cokluSorguDosyasiSecildi), o dosyanın
    // sunucudaki göreli yolu ve kullanıcının girdiği kişi sayısı gönderilir; yüklenmediyse
    // hiçbir alan set edilmez ve ürünün sabit dosyası kullanılmaya devam eder.
    if (veri.sorguTipi === 'coklu' && SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME) {
      veri.cokluSorguDosyasi = SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME.dosyaYolu;
      var kisiSayisiDeger = parseInt(el('sof_cokluSorguKisiSayisi').value, 10);
      if (kisiSayisiDeger > 0) veri.cokluSorguKisiSayisi = kisiSayisiDeger;
    }

    return veri;
  }

  function senaryoOlusturDene() {
    var hataAlani = document.getElementById('sof_hataAlani');
    var sonucAlani = document.getElementById('sof_sonucAlani');
    var kosButonu = document.getElementById('sof_kosButonu');
    hataAlani.innerHTML = '';
    sonucAlani.innerHTML = '';

    var veri = senaryoOlusturFormundanVeriTopla();
    if (!veri.kapsam || !veri.alternatif) {
      hataAlani.innerHTML = '<p class="senaryo-form-hata">Kapsam ve alternatif alanları zorunludur (seçenekler yüklenene kadar bekleyin).</p>';
      return;
    }
    if (veri.sorguTipi === 'coklu' && SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME && !veri.cokluSorguKisiSayisi) {
      hataAlani.innerHTML = '<p class="senaryo-form-hata">Özel bir Excel yüklediniz — Exceldeki kişi sayısını da girmelisiniz.</p>';
      return;
    }
    if (veri.acenteKodu && !veri.acenteKullanicisi) {
      hataAlani.innerHTML = '<p class="senaryo-form-hata">Acente kodu girildiyse acente kullanıcı kodu da girilmelidir.</p>';
      return;
    }

    kosButonu.disabled = true;
    kosButonu.textContent = 'Koşuluyor...';
    sonucAlani.innerHTML = '<div class="senaryo-form-hata" style="color:var(--text-muted)">Senaryo deneniyor, bu biraz sürebilir (login + tüm adımlar)...</div>';

    fetch(TEST_SUNUCU.taban + '/jetseyahat-senaryo/dene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, senaryo: veri, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () {
        return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı. Bir terminalde "npm run test-sunucu" çalıştırıp tekrar deneyin.' };
      })
      .then(function (sonuc) {
        kosButonu.disabled = false;
        kosButonu.textContent = 'Senaryoyu Koş';
        SENARYO_OLUSTUR_SON_SONUC = { veri: veri, sonuc: sonuc };
        senaryoOlusturSonucGoster(sonuc);
      });
  }

  function senaryoOlusturSonucGoster(sonuc) {
    var sonucAlani = document.getElementById('sof_sonucAlani');
    var basariliMi = sonuc && sonuc.basarili && sonuc.durum === 'passed';
    var durdurulduMu = !!(sonuc && sonuc.durum === 'iptal');
    var rozetSinif = basariliMi ? 'rozet-iyi' : durdurulduMu ? 'rozet-notr' : 'rozet-kritik';
    var rozetMetin = basariliMi ? 'Başarılı' : durdurulduMu ? 'Durduruldu' : 'Başarısız';
    var govde = '<div class="senaryo-sonuc-satir"><span class="rozet ' + rozetSinif + '">' + escapeHtml(rozetMetin) + '</span></div>';
    if (!basariliMi) {
      var mesaj = (sonuc && (sonuc.hataMesaji || sonuc.mesaj)) || 'Detaylı hata mesajı yok — test-sunucu terminalindeki çıktıya bakın.';
      govde += '<pre class="hata-mesaj">' + escapeHtml(mesaj) + '</pre>';
    }
    if (sonuc && sonuc.ekranGoruntusu) {
      govde += '<img class="hata-goruntu" src="data:image/png;base64,' + sonuc.ekranGoruntusu + '" alt="Senaryo deneme sonucu" />';
    }
    govde +=
      '<p style="margin:14px 0 6px;font-weight:700;font-size:12.5px;">Bu senaryo kalıcı olarak kaydedilsin mi?</p>' +
      '<div class="senaryo-form-buton-satir">' +
        '<button type="button" id="sof_kaydetButonu" class="birincil">Evet, kaydet</button>' +
        '<button type="button" id="sof_kaydetmeButonu">Hayır</button>' +
      '</div>' +
      '<div id="sof_kaydetAlani"></div>';
    sonucAlani.innerHTML = govde;

    document.getElementById('sof_kaydetmeButonu').addEventListener('click', function () {
      document.getElementById('sof_kaydetButonu').closest('.senaryo-form-buton-satir').remove();
    });
    document.getElementById('sof_kaydetButonu').addEventListener('click', senaryoOlusturBaslikSor);
  }

  function senaryoOlusturBaslikSor() {
    var kaydetAlani = document.getElementById('sof_kaydetAlani');
    kaydetAlani.innerHTML =
      '<div class="senaryo-form-alan"><label>Senaryo Başlığı</label><input type="text" id="sof_baslik" placeholder="örn. 30447 / DÜNYA / ... " /></div>' +
      '<div id="sof_kaydetHataAlani"></div>' +
      '<div class="senaryo-form-buton-satir"><button type="button" id="sof_kaydetOnayButonu" class="birincil">Kaydet</button></div>' +
      '<div id="sof_kosuyaDahilAlani"></div>';
    document.getElementById('sof_kaydetOnayButonu').addEventListener('click', senaryoOlusturKaydet);
  }

  // "Kaydet"e her basıldığında AÇIKÇA sorulur: yeni senaryo koşuya (Koşuyu başlat,
  // npm run test) dahil edilsin mi? Varsayılan yok — kullanıcı iki düğmeden birini seçmeden
  // istek gönderilmez; sunucu da cevapsız isteği reddeder (bkz. test-sunucu.mjs > /kaydet).
  function senaryoOlusturKaydet() {
    var baslikEl = document.getElementById('sof_baslik');
    var hataAlani = document.getElementById('sof_kaydetHataAlani');
    var soruAlani = document.getElementById('sof_kosuyaDahilAlani');
    var baslik = baslikEl.value.trim();
    hataAlani.innerHTML = '';
    soruAlani.innerHTML = '';
    if (!baslik) {
      hataAlani.innerHTML = '<p class="senaryo-form-hata">Başlık boş olamaz.</p>';
      return;
    }
    if (!SENARYO_OLUSTUR_SON_SONUC) return;

    soruAlani.innerHTML =
      '<p class="kosuya-dahil-soru" id="sof_kosuyaDahilSoru">Bu senaryo koşuya dahil edilsin mi?</p>' +
      '<div class="senaryo-form-buton-satir" role="group" aria-labelledby="sof_kosuyaDahilSoru">' +
        '<button type="button" id="sof_kosuyaDahilEvet" class="birincil">Evet, dahil et</button>' +
        '<button type="button" id="sof_kosuyaDahilHayir">Hayır, dahil etme</button>' +
      '</div>';
    document.getElementById('sof_kosuyaDahilEvet').addEventListener('click', function () { senaryoOlusturKaydetGonder(baslik, true); });
    document.getElementById('sof_kosuyaDahilHayir').addEventListener('click', function () { senaryoOlusturKaydetGonder(baslik, false); });
    document.getElementById('sof_kosuyaDahilEvet').focus();
  }

  function senaryoOlusturKaydetGonder(baslik, kosuyaDahil) {
    var hataAlani = document.getElementById('sof_kaydetHataAlani');
    var onayButonu = document.getElementById('sof_kaydetOnayButonu');
    var evetButonu = document.getElementById('sof_kosuyaDahilEvet');
    var hayirButonu = document.getElementById('sof_kosuyaDahilHayir');
    hataAlani.innerHTML = '';
    onayButonu.disabled = true;
    evetButonu.disabled = true;
    hayirButonu.disabled = true;
    onayButonu.textContent = 'Kaydediliyor...';

    fetch(TEST_SUNUCU.taban + '/jetseyahat-senaryo/kaydet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, senaryo: SENARYO_OLUSTUR_SON_SONUC.veri, baslik: baslik, kosuyaDahil: kosuyaDahil, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
      .then(function (sonuc) {
        onayButonu.disabled = false;
        evetButonu.disabled = false;
        hayirButonu.disabled = false;
        onayButonu.textContent = 'Kaydet';
        if (sonuc && sonuc.basarili) {
          document.getElementById('sof_kaydetAlani').innerHTML =
            '<p style="color:var(--good);font-weight:700;font-size:12.5px;">Kaydedildi' +
            (kosuyaDahil ? ' ve koşuya dahil edildi' : '; koşuya dahil edilmedi (Senaryolar tablosunda "Koşuda" anahtarıyla sonradan eklenebilir)') +
            '. "Senaryolar" listesinde görünmesi için dashboard sayfasını yeniden üretip (npm run rapor:' + escapeHtml(ORTAM) + ') tarayıcıyı yenileyin.</p>';
        } else {
          hataAlani.innerHTML = '<p class="senaryo-form-hata">' + escapeHtml((sonuc && sonuc.mesaj) || 'Kaydedilemedi.') + '</p>';
        }
      });
  }

  // Üst istatistik kartları: GENEL seçiliyken tüm ürünlerin son koşusu, bir ürün
  // seçiliyken sadece o ürünün son koşudaki sayıları gösterilir.
  var IKON_TOPLAM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';
  var IKON_BASARILI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var IKON_BASARISIZ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  var IKON_ATLANAN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>';

  // deger null ise (görünüm için henüz koşu yok) "—" gösterilir; delta null ise fark
  // satırı hiç çizilmez. deltaEtiketi: farkın neye göre olduğu ("önceki koşu" tarihi vb.).
  function statTileClient(etiket, deger, delta, iyiYonAzalmaMi, ikon, deltaEtiketi) {
    var deltaHtml = '';
    if (delta !== null && deger !== null) {
      var isaret = delta > 0 ? '+' : '';
      var iyiMi = iyiYonAzalmaMi ? delta <= 0 : delta >= 0;
      var renkSinifi = delta === 0 ? 'delta-notr' : iyiMi ? 'delta-iyi' : 'delta-kotu';
      deltaHtml = '<div class="stat-delta ' + renkSinifi + '">' + isaret + delta + (deltaEtiketi ? ' <span class="stat-delta-etiket">(' + escapeHtml(deltaEtiketi) + ')</span>' : '') + '</div>';
    }
    return (
      '<div class="stat-tile">' +
      '<div class="stat-tile-ust"><div class="stat-label">' + escapeHtml(etiket) + '</div><div class="stat-ikon">' + ikon + '</div></div>' +
      '<div class="stat-value' + (deger === null ? ' stat-value-bos' : '') + '">' + (deger === null ? '—' : deger) + '</div>' +
      deltaHtml +
      '</div>'
    );
  }

  var BOS_KOSU_TOPLAM = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };

  function kapsamMetni(kapsam) {
    return !kapsam || kapsam === 'Genel' ? 'Genel koşu' : kapsam + ' koşusu';
  }

  // Üst kartlar (hesap sunucuda — bkz. urun-hata-raporu.mjs > "Üst kartlar"):
  //  - Genel: her ürünün kendi son koşusundaki sayıların toplamı (güncel durum); fark,
  //    her ürünün bir önceki koşusunun toplamına göre.
  //  - Ürün P: P'yi içeren son koşudaki yalnızca P sayıları; fark, P'yi içeren bir önceki koşuya göre.
  // Görünüm için hiç koşu yoksa kartlar "—", kaynak satırı "Henüz koşu yok" gösterir.
  // Tekil koşular (Seçilenleri çalıştır, tek ▷, aramalı koşu) kartları değiştirmez.
  function istatKartlariniGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var kartlar = VERI.kartlar || { genel: null, urunler: {} };
    var kaynakEl = document.getElementById('statKaynak');
    var son = null;
    var onceki = null;
    var deltaEtiketi = '';
    if (genelMi) {
      var genel = kartlar.genel;
      if (genel) {
        son = genel.son;
        onceki = genel.onceki;
        deltaEtiketi = 'önceki koşulara göre';
        kaynakEl.textContent = genel.urunSayisi > 1 && genel.enYeniZ !== genel.enEskiZ
          ? 'Güncel durum: her ürünün son koşusu (' + genel.urunSayisi + ' ürün; ' + genel.enEskiEtiket + ' – ' + genel.enYeniEtiket + ')'
          : 'Güncel durum — son koşu: ' + genel.enYeniEtiket;
      } else {
        kaynakEl.textContent = 'Henüz koşu yok — "▷ Koşuyu başlat" ile ya da terminalden bir koşu yapıldığında kartlar dolar.';
      }
    } else {
      var urunKart = kartlar.urunler[secilenUrun];
      if (urunKart) {
        son = urunKart.son;
        onceki = urunKart.onceki;
        deltaEtiketi = onceki ? onceki.etiket : '';
        kaynakEl.textContent = 'Son koşu: ' + son.etiket + ' (' + kapsamMetni(son.kapsam) + ')' +
          (onceki ? ' · önceki: ' + onceki.etiket + ' (' + kapsamMetni(onceki.kapsam) + ')' : '');
      } else {
        kaynakEl.textContent = 'Henüz koşu yok — ' + secilenUrun + ' için bir koşu yapıldığında kartlar dolar.';
      }
    }

    function sayi(n, alan) { return n ? n[alan] || 0 : null; }
    function fark(alan) { return son && onceki ? (son[alan] || 0) - (onceki[alan] || 0) : null; }
    var toplam = son ? son.basarili + son.basarisiz + son.atlanan + (son.durduruldu || 0) : null;
    var toplamOnceki = onceki ? onceki.basarili + onceki.basarisiz + onceki.atlanan + (onceki.durduruldu || 0) : null;
    var sonDurduruldu = son ? son.durduruldu || 0 : 0;
    var oncekiDurduruldu = onceki ? onceki.durduruldu || 0 : 0;

    document.getElementById('statGrid').innerHTML =
      statTileClient(genelMi ? 'Toplam test (güncel)' : 'Toplam test (son koşu)', toplam, son && onceki ? toplam - toplamOnceki : null, false, IKON_TOPLAM, deltaEtiketi) +
      statTileClient('Başarılı', sayi(son, 'basarili'), fark('basarili'), false, IKON_BASARILI, deltaEtiketi) +
      statTileClient('Başarısız', sayi(son, 'basarisiz'), fark('basarisiz'), true, IKON_BASARISIZ, deltaEtiketi) +
      statTileClient('Atlanan', sayi(son, 'atlanan'), fark('atlanan'), true, IKON_ATLANAN, deltaEtiketi) +
      // "Durduruldu" kartı yalnızca son/önceki koşuda durdurulan test varsa gösterilir (nötr, gri).
      (sonDurduruldu || oncekiDurduruldu
        ? statTileClient('Durduruldu', sonDurduruldu, null, true, IKON_ATLANAN, '') // delta renklendirilmez: nötr durum
        : '');
  }

  // Trend serisi için koşu filtresi: Genel → yalnızca 'Genel' kapsamlı tam koşular (tüm
  // ürünleri kapsayan, birbiriyle karşılaştırılabilir koşular); ürün P → P'nin sonucunu
  // içeren TÜM tam koşular (P kapsamlı ya da Genel), yalnızca P'nin sayılarıyla.
  function trendKosusuMu(k, genelMi) {
    if (k.tur === 'tekil') return false;
    if (genelMi) return (k.kapsam || 'Genel') === 'Genel';
    var n = k.urunler[secilenUrun];
    return !!n && n.basarili + n.basarisiz + n.atlanan + (n.durduruldu || 0) > 0;
  }

  // Koşu trendi grafiği: sunucu tarafında üretilen svg mantığının istemci karşılığı
  // — GENEL veya seçili ürüne göre farklı seri çizer.
  function trendSvgOlusturClient(seriler) {
    if (seriler.length < 2) {
      return '<div class="bos-durum">Trend grafiği için en az 2 koşu gerekir — daha fazla koşu biriktikçe burada görünecek.</div>';
    }

    var genislik = 900, yukseklik = 220, solPad = 34, sagPad = 12, ustPad = 16, altPad = 34;
    var cizimGenislik = genislik - solPad - sagPad;
    var cizimYukseklik = yukseklik - ustPad - altPad;
    var maxDeger = 1;
    seriler.forEach(function (s) {
      if (s.basarili > maxDeger) maxDeger = s.basarili;
      if (s.basarisiz > maxDeger) maxDeger = s.basarisiz;
    });
    var adimX = cizimGenislik / (seriler.length - 1);

    function nokta(i, deger) {
      return [solPad + i * adimX, ustPad + cizimYukseklik - (deger / maxDeger) * cizimYukseklik];
    }
    function cizgiYolu(anahtar) {
      return seriler.map(function (s, i) { var n = nokta(i, s[anahtar]); return (i === 0 ? 'M' : 'L') + n[0].toFixed(1) + ',' + n[1].toFixed(1); }).join(' ');
    }
    function alanYolu(anahtar) {
      var ustCizgi = cizgiYolu(anahtar);
      var sonX = nokta(seriler.length - 1, 0)[0];
      var ilkX = nokta(0, 0)[0];
      var tabanY = (ustPad + cizimYukseklik).toFixed(1);
      return ustCizgi + ' L' + sonX.toFixed(1) + ',' + tabanY + ' L' + ilkX.toFixed(1) + ',' + tabanY + ' Z';
    }

    var izgara = [0, 0.25, 0.5, 0.75, 1]
      .map(function (oran) {
        var y = ustPad + cizimYukseklik - oran * cizimYukseklik;
        var deger = Math.round(oran * maxDeger);
        return '<line x1="' + solPad + '" y1="' + y.toFixed(1) + '" x2="' + (genislik - sagPad) + '" y2="' + y.toFixed(1) + '" stroke="var(--gridline)" stroke-width="1" /><text x="' + (solPad - 8) + '" y="' + (y + 3.5).toFixed(1) + '" font-size="10" fill="var(--text-muted)" text-anchor="end">' + deger + '</text>';
      })
      .join('');

    var noktalar = seriler
      .map(function (s, i) {
        var nb = nokta(i, s.basarili);
        var nk = nokta(i, s.basarisiz);
        return (
          '<circle cx="' + nb[0].toFixed(1) + '" cy="' + nb[1].toFixed(1) + '" r="3.2" fill="var(--good)"><title>' + escapeHtml(s.etiket) + ' — Başarılı: ' + s.basarili + '</title></circle>' +
          '<circle cx="' + nk[0].toFixed(1) + '" cy="' + nk[1].toFixed(1) + '" r="3.2" fill="var(--critical)"><title>' + escapeHtml(s.etiket) + ' — Başarısız: ' + s.basarisiz + '</title></circle>'
        );
      })
      .join('');

    var etiketAraligi = Math.ceil(seriler.length / 8);
    var etiketler = seriler
      .map(function (s, i) {
        if (i % etiketAraligi !== 0 && i !== seriler.length - 1) return '';
        var x = nokta(i, 0)[0];
        return '<text x="' + x.toFixed(1) + '" y="' + (yukseklik - 10) + '" font-size="10" fill="var(--text-muted)" text-anchor="middle">' + escapeHtml(s.etiketKisa) + '</text>';
      })
      .join('');

    return (
      '<svg viewBox="0 0 ' + genislik + ' ' + yukseklik + '" class="trend-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Koşu trendi grafiği">' +
      izgara +
      '<path d="' + alanYolu('basarisiz') + '" fill="var(--critical)" fill-opacity="0.08" stroke="none" />' +
      '<path d="' + alanYolu('basarili') + '" fill="var(--good)" fill-opacity="0.08" stroke="none" />' +
      '<path d="' + cizgiYolu('basarisiz') + '" fill="none" stroke="var(--critical)" stroke-width="2" />' +
      '<path d="' + cizgiYolu('basarili') + '" fill="none" stroke="var(--good)" stroke-width="2" />' +
      noktalar +
      etiketler +
      '</svg>'
    );
  }

  function trendGrafiginiGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var aralik = secilenTarihAraligi('baslangicTarihiTrend', 'bitisTarihiTrend');
    // Trend yalnızca TAM koşularla çizilir — dashboard'dan tek senaryo koşuları (tekil,
    // toplam=1) çizgiyi anlamsızca 0-1'e çekmesin.
    var seriler = VERI.kosuGecmisi
      .filter(function (k) { return trendKosusuMu(k, genelMi) && k.z >= aralik.baslangicMs && k.z <= aralik.bitisMs; })
      .map(function (k) {
        var n = genelMi ? k : k.urunler[secilenUrun] || BOS_KOSU_TOPLAM;
        return { etiket: k.etiket, etiketKisa: k.etiketKisa, basarili: n.basarili, basarisiz: n.basarisiz };
      });
    document.getElementById('trendSvgAlani').innerHTML = trendSvgOlusturClient(seriler);
    document.getElementById('secimOzetiTrend').textContent = seriler.length + ' koşu';
    document.getElementById('trendBaslikSayisi').textContent = seriler.length + ' koşu';
    document.getElementById('trendAltBaslik').textContent =
      genelMi
        ? 'Seçili tarih aralığındaki ' + seriler.length + ' Genel koşuda (tüm ürünler) başarılı/başarısız sayısı nasıl değişti — ürün kapsamlı ve tekil koşular dahil değil'
        : 'Seçili tarih aralığında ' + secilenUrun + ' ürününü içeren ' + seriler.length + ' koşuda (ürün ya da Genel kapsamlı) ' + secilenUrun + ' sayıları';
  }

  // "Koşu geçmişi" tablosu: seçilen tarih aralığındaki TÜM koşuları (en yeni önce)
  // GENEL veya seçili ürüne göre listeler, 10'ar satırlık sayfalar halinde.
  function kosuGecmisiniGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var aralik = secilenTarihAraligi('baslangicTarihiKosu', 'bitisTarihiKosu');

    var kosular = VERI.kosuGecmisi
      .map(function (k, i) { return { k: k, i: i }; }) // filtrelemeden önce VERI.kosuGecmisi/kosuDetaylari ile eşleşen orijinal index'i sakla
      .filter(function (x) { return x.k.z >= aralik.baslangicMs && x.k.z <= aralik.bitisMs; })
      .map(function (x) {
        var k = x.k;
        var n = genelMi ? k : k.urunler[secilenUrun] || BOS_KOSU_TOPLAM;
        var durduruldu = n.durduruldu || 0;
        // Oran paydası "Durduruldu"yu içermez (başarısızlık gibi oranı düşürmesin).
        var oranPaydasi = n.basarili + n.basarisiz + n.atlanan;
        var toplam = oranPaydasi + durduruldu;
        var oran = oranPaydasi > 0 ? Math.round((n.basarili / oranPaydasi) * 100) : 0;
        // GENEL görünümde, koşunun hangi ürünleri kapsadığını satırda rozet olarak
        // göstermek için ürün kırılımını da taşıyoruz (tek ürün seçiliyken gereksiz,
        // zaten o üründe olduğumuz belli).
        return { orijinalIndex: x.i, etiket: k.etiket, tekilMi: k.tur === 'tekil', kapsam: k.tur === 'tekil' ? null : k.kapsam || 'Genel', z: k.z, basarili: n.basarili, basarisiz: n.basarisiz, atlanan: n.atlanan, durduruldu: durduruldu, toplam: toplam, oran: oran, urunler: genelMi ? k.urunler : null };
      });

    var durumKosu = SIRALAMA_DURUMU.kosuGecmisi;
    var DEGER_FN_KOSU = {
      z: function (r) { return r.z; },
      toplam: function (r) { return r.toplam; },
      basarili: function (r) { return r.basarili; },
      basarisiz: function (r) { return r.basarisiz; },
      atlanan: function (r) { return r.atlanan; },
      durduruldu: function (r) { return r.durduruldu; },
      oran: function (r) { return r.oran; }
    };
    kosular = diziyiSirala(kosular, durumKosu.anahtar, durumKosu.yon, DEGER_FN_KOSU[durumKosu.anahtar]);
    siralamaOklariniGuncelle();

    var ozetAlani = document.getElementById('secimOzetiKosu');
    ozetAlani.textContent = kosular.length + ' koşu';
    document.getElementById('kosuGecmisiBaslikSayisi').textContent = kosular.length + ' koşu';

    var govde = document.getElementById('kosuGecmisiGovdesi');
    var sayfalamaAlani = document.getElementById('kosuGecmisiSayfalama');

    if (kosular.length === 0) {
      govde.innerHTML = '<tr><td colspan="8">Seçilen tarih aralığında koşu yok</td></tr>';
      sayfalamaAlani.innerHTML = '';
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    var toplamSayfa = Math.max(1, Math.ceil(kosular.length / KOSU_GECMISI_SAYFA_BOYUTU));
    if (kosuGecmisiSayfa > toplamSayfa) kosuGecmisiSayfa = toplamSayfa;
    if (kosuGecmisiSayfa < 1) kosuGecmisiSayfa = 1;

    var baslangicIdx = (kosuGecmisiSayfa - 1) * KOSU_GECMISI_SAYFA_BOYUTU;
    var sayfaKosulari = kosular.slice(baslangicIdx, baslangicIdx + KOSU_GECMISI_SAYFA_BOYUTU);

    govde.innerHTML = sayfaKosulari
      .map(function (k) {
        var toplam = k.toplam;
        var oran = k.oran;
        var barRengi = oran >= 80 ? 'var(--good)' : oran >= 50 ? 'var(--warning)' : 'var(--critical)';

        // Ürün rozetleri: GENEL görünümde bu koşuda hangi ürünlerin çalıştığını ve
        // her birinin başarısız/toplam sayısını gösterir. Hiç testi olmayan ürünler
        // (toplamı 0) gösterilmez.
        var urunRozetleri = '';
        if (k.urunler) {
          urunRozetleri = Object.keys(k.urunler)
            .sort(function (a, b) { return a.localeCompare(b, 'tr'); })
            .map(function (urunAdi) {
              var u = k.urunler[urunAdi];
              var uToplam = u.basarili + u.basarisiz + u.atlanan + (u.durduruldu || 0);
              if (uToplam === 0) return '';
              var sinif = u.basarisiz > 0 ? 'rozet-kritik' : 'rozet-iyi';
              return '<span class="rozet ' + sinif + '">' + escapeHtml(urunAdi) + ' <b>' + u.basarisiz + '/' + uToplam + '</b></span>';
            })
            .join('');
        }

        return (
          '<tr class="kosu-satir" data-kosu-index="' + k.orijinalIndex + '">' +
          '<td>' + escapeHtml(k.etiket) +
          (k.tekilMi ? '<span class="rozet rozet-notr rozet-tekil" title="Kısmi koşu (Seçilenleri çalıştır, tek ▷ ya da aramalı koşu) — üst kartları ve trendi değiştirmez">tekil</span>' : '') +
          (k.kapsam && k.kapsam !== 'Genel' ? '<span class="rozet rozet-kapsam rozet-tekil" title="Yalnızca bu ürünü kapsayan koşu — ürün kartlarını ve trendini günceller, Genel trende girmez">' + escapeHtml(k.kapsam) + ' koşusu</span>' : '') +
          '</td>' +
          '<td><div class="kosu-urun-rozetleri">' + (urunRozetleri || '<span class="bos-durum-mini">—</span>') + '</div></td>' +
          '<td class="num">' + toplam + '</td>' +
          '<td class="num">' + k.basarili + '</td>' +
          '<td class="num">' + k.basarisiz + '</td>' +
          '<td class="num">' + k.atlanan + '</td>' +
          '<td class="num">' + k.durduruldu + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + oran + '%;background:' + barRengi + '"></div></div><span>%' + oran + '</span></div></td>' +
          '</tr>'
        );
      })
      .join('');

    Array.prototype.forEach.call(govde.querySelectorAll('.kosu-satir'), function (satir) {
      satir.addEventListener('click', function () {
        kosuDetayAc(Number(satir.getAttribute('data-kosu-index')));
      });
    });

    sayfalamaAlani.innerHTML =
      '<button type="button" id="kosuGecmisiOnceki"' + (kosuGecmisiSayfa <= 1 ? ' disabled' : '') + '>Önceki</button>' +
      '<span class="sayfa-bilgi">Sayfa ' + kosuGecmisiSayfa + ' / ' + toplamSayfa + '</span>' +
      '<button type="button" id="kosuGecmisiSonraki"' + (kosuGecmisiSayfa >= toplamSayfa ? ' disabled' : '') + '>Sonraki</button>';

    var oncekiDugme = document.getElementById('kosuGecmisiOnceki');
    var sonrakiDugme = document.getElementById('kosuGecmisiSonraki');
    if (oncekiDugme) oncekiDugme.addEventListener('click', function () { kosuGecmisiSayfa--; kosuGecmisiniGuncelle(); });
    if (sonrakiDugme) sonrakiDugme.addEventListener('click', function () { kosuGecmisiSayfa++; kosuGecmisiniGuncelle(); });
    ikizTablolarinYuksekliginiEsitle();
  }

  // Seçim (GENEL <-> ürün) her değiştiğinde ekranın tamamını tutarlı şekilde günceller.
  function secimGuncellendi() {
    urunNavCiz();
    document.getElementById('anaBaslik').textContent = secilenUrun === GENEL ? 'Genel Bakış' : secilenUrun;
    // "+ Senaryo Oluştur" butonu, şimdilik yalnızca JetSeyahat ürünü seçiliyken görünür
    // (server tarafında da sadece /jetseyahat-senaryo/* uçları var — bkz. test-sunucu.mjs).
    document.getElementById('senaryoOlusturButonu').style.display = secilenUrun === 'JetSeyahat' ? '' : 'none';
    document.getElementById('secilenUrunBasligi').textContent = secilenUrun === GENEL ? 'Hata kalıpları' : 'Hata kalıpları — ' + secilenUrun;
    istatKartlariniGuncelle();
    trendGrafiginiGuncelle();
    // NOT: kosuGecmisiSayfa/kalipSayfa burada SIFIRLANMAZ — bu fonksiyon her koşu
    // bitişinde de çağrılıyor; sıfırlama ürün değişiminde (urunNavCiz) ve tarih
    // filtresi değişiminde (kalipFiltresiDegisti/kosuGecmisiFiltresiDegisti) yapılır.
    kosuGecmisiniGuncelle();
    ikinciBolumuCiz();
    tabloyuGuncelle();
    senaryoTablosuCiz();
  }

  function kategoriDonutunuCiz(kategoriSayaclari, basarisiz) {
    var alan = document.getElementById('kategoriDonutAlani');
    var kategoriler = Object.keys(kategoriSayaclari).sort(function (a, b) { return kategoriSayaclari[b] - kategoriSayaclari[a]; });

    if (basarisiz === 0 || kategoriler.length === 0) {
      alan.innerHTML =
        '<div class="kategori-donut-sarma"><div class="kategori-donut-halka" style="background:var(--gridline)"></div>' +
        '<div class="kategori-donut-oyuk"><b>0</b><span>hata</span></div></div>' +
        '<div class="bos-durum" style="padding:10px;font-size:12px;">Seçili aralıkta hata yok 🎉</div>';
      return;
    }

    var birikimli = 0;
    var gradyanParcalari = kategoriler.map(function (kategori) {
      var adet = kategoriSayaclari[kategori];
      var baslangicYuzde = (birikimli / basarisiz) * 100;
      birikimli += adet;
      var bitisYuzde = (birikimli / basarisiz) * 100;
      return kategoriRengi(kategori) + ' ' + baslangicYuzde.toFixed(2) + '% ' + bitisYuzde.toFixed(2) + '%';
    });

    var lejantHtml = kategoriler
      .map(function (kategori) {
        var adet = kategoriSayaclari[kategori];
        var yuzde = Math.round((adet / basarisiz) * 100);
        return (
          '<div class="kategori-lejant-oge">' +
          '<span class="kategori-lejant-nokta" style="background:' + kategoriRengi(kategori) + '"></span>' +
          '<span class="kategori-lejant-ad">' + escapeHtml(kategori) + '</span>' +
          '<span class="kategori-lejant-adet">' + adet + ' <span style="color:var(--text-muted);font-weight:500;">(%' + yuzde + ')</span></span>' +
          '</div>'
        );
      })
      .join('');

    alan.innerHTML =
      '<div class="kategori-donut-sarma">' +
      '<div class="kategori-donut-halka" style="background:conic-gradient(' + gradyanParcalari.join(', ') + ')"></div>' +
      '<div class="kategori-donut-oyuk"><b>' + basarisiz + '</b><span>hata</span></div>' +
      '</div>' +
      '<div class="kategori-lejant">' + lejantHtml + '</div>';
  }

  function tabloyuGuncelle() {
    var alan = document.getElementById('kalipTablosuAlani');
    var sayfalamaAlani = document.getElementById('kalipTablosuSayfalama');
    var ozetAlani = document.getElementById('secimOzeti');
    var genelMi = secilenUrun === GENEL;

    var aralik = secilenTarihAraligi('baslangicTarihi', 'bitisTarihi');

    var urunKayitlari = VERI.kayitlar.filter(function (k) {
      return (genelMi || k.u === secilenUrun) && k.z >= aralik.baslangicMs && k.z <= aralik.bitisMs;
    });

    var basarili = 0, basarisiz = 0, atlanan = 0, durduruldu = 0;
    var kalipSayaclari = {}; // 'urun|||kategori|||kalip' -> { adet, urun, kategori, kalip }
    var kategoriSayaclari = {}; // kategori -> adet
    urunKayitlari.forEach(function (k) {
      if (k.d === 'basarili') basarili++;
      else if (k.d === 'atlanan') atlanan++;
      else if (k.d === 'durduruldu') durduruldu++; // başarısız sayılmaz, kalıba/kategoriye girmez
      else {
        basarisiz++;
        var anahtar = k.u + '|||' + k.k + '|||' + k.p;
        if (!kalipSayaclari[anahtar]) kalipSayaclari[anahtar] = { adet: 0, urun: k.u, kategori: k.k, kalip: k.p };
        kalipSayaclari[anahtar].adet++;
        kategoriSayaclari[k.k] = (kategoriSayaclari[k.k] || 0) + 1;
      }
    });

    ozetAlani.textContent = urunKayitlari.length + ' kayıt (Başarılı ' + basarili + ' · Başarısız ' + basarisiz + ' · Atlanan ' + atlanan + (durduruldu ? ' · Durduruldu ' + durduruldu : '') + ')';
    kategoriDonutunuCiz(kategoriSayaclari, basarisiz);

    var siraliKaliplar = Object.keys(kalipSayaclari)
      .map(function (anahtar) { return kalipSayaclari[anahtar]; })
      .sort(function (a, b) { return b.adet - a.adet; });

    document.getElementById('kalipBaslikSayisi').textContent = siraliKaliplar.length + ' kalıp toplam';

    if (siraliKaliplar.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Seçilen tarih aralığında başarısız test yok. 🎉</div>';
      sayfalamaAlani.innerHTML = '';
      return;
    }

    var toplamKalipSayfa = Math.max(1, Math.ceil(siraliKaliplar.length / KALIP_SAYFA_BOYUTU));
    if (kalipSayfa > toplamKalipSayfa) kalipSayfa = toplamKalipSayfa;
    if (kalipSayfa < 1) kalipSayfa = 1;
    var kalipBaslangicIdx = (kalipSayfa - 1) * KALIP_SAYFA_BOYUTU;
    var sayfaKaliplari = siraliKaliplar.slice(kalipBaslangicIdx, kalipBaslangicIdx + KALIP_SAYFA_BOYUTU);

    alan.innerHTML = sayfaKaliplari
      .map(function (s, i) {
        var ornekAnahtari = s.urun + '|||' + s.kategori + '|||' + s.kalip;
        var ornek = VERI.ornekler[ornekAnahtari];
        var govdeIcerik = '';
        if (ornek) {
          govdeIcerik += '<div class="hata-ornek-etiket">Örnek: ' + escapeHtml(ornek.b) + (ornek.oz ? ' (' + escapeHtml(ornek.oz) + ')' : '') + ' — en son görülme: ' + escapeHtml(ornek.t) + '</div>';
          if (ornek.m) govdeIcerik += '<pre class="hata-mesaj">' + escapeHtml(ornek.m) + '</pre>';
          var kalipOlasiNeden = olasiNedenBul(ornek.m);
          if (kalipOlasiNeden) {
            govdeIcerik += '<div class="hata-ornek-etiket">Olası neden</div>';
            govdeIcerik += '<div class="olasi-neden">' + escapeHtml(kalipOlasiNeden) + '</div>';
          }
          if (ornek.g) govdeIcerik += '<img class="hata-goruntu" src="' + escapeHtml(ornek.g) + '" alt="Hata anı ekran görüntüsü" />';
          else govdeIcerik += '<div class="bos-durum">Bu kalıp için ekran görüntüsü bulunamadı.</div>';
          govdeIcerik += videoBaglantisiHtml(ornek.v);
        }
        return (
          '<details class="hata-detay"' + (i === 0 ? ' open' : '') + '>' +
          '<summary>' +
          '<span class="hata-adet">' + s.adet + '</span>' +
          '<span class="hata-kalip">' + escapeHtml(s.kalip) + '</span>' +
          (genelMi ? '<span class="rozet rozet-notr">' + escapeHtml(s.urun) + '</span>' : '') +
          '<span class="rozet rozet-kritik">' + escapeHtml(s.kategori) + '</span>' +
          '</summary>' +
          '<div class="hata-govde">' + govdeIcerik + '</div>' +
          '</details>'
        );
      })
      .join('');

    sayfalamaAlani.innerHTML =
      '<span class="sayfa-bilgi">' + siraliKaliplar.length + ' kalıptan ' + (kalipBaslangicIdx + 1) + '–' +
      Math.min(kalipBaslangicIdx + KALIP_SAYFA_BOYUTU, siraliKaliplar.length) + ' arası gösteriliyor</span>' +
      '<button type="button" id="kalipOnceki"' + (kalipSayfa <= 1 ? ' disabled' : '') + '>Önceki</button>' +
      '<span class="sayfa-bilgi">Sayfa ' + kalipSayfa + ' / ' + toplamKalipSayfa + '</span>' +
      '<button type="button" id="kalipSonraki"' + (kalipSayfa >= toplamKalipSayfa ? ' disabled' : '') + '>Sonraki</button>';

    var kalipOncekiDugme = document.getElementById('kalipOnceki');
    var kalipSonrakiDugme = document.getElementById('kalipSonraki');
    if (kalipOncekiDugme) kalipOncekiDugme.addEventListener('click', function () { kalipSayfa--; tabloyuGuncelle(); });
    if (kalipSonrakiDugme) kalipSonrakiDugme.addEventListener('click', function () { kalipSayfa++; tabloyuGuncelle(); });
  }

  // Kenar çubuğu daralt/genişlet: tercih tarayıcıda saklanır, sayfa yeniden
  // üretildiğinde/yenilendiğinde son durum korunur.
  (function () {
    var vizRoot = document.querySelector('.viz-root');
    var dugmeAlt = document.getElementById('kenarCubuguDugmesi');
    var dugmeUst = document.getElementById('kenarCubuguDugmesiUst');
    var ANAHTAR = 'urunHataRaporuKenarKapali';
    var kapaliMi = false;
    try { kapaliMi = localStorage.getItem(ANAHTAR) === '1'; } catch (e) { /* gizli sekme vb. — yoksay */ }
    if (kapaliMi) vizRoot.classList.add('kenar-kapali');
    function kenarCubugunuAcKapat() {
      var suAnKapaliMi = vizRoot.classList.toggle('kenar-kapali');
      try { localStorage.setItem(ANAHTAR, suAnKapaliMi ? '1' : '0'); } catch (e) { /* yoksay */ }
    }
    dugmeAlt.addEventListener('click', kenarCubugunuAcKapat);
    dugmeUst.addEventListener('click', kenarCubugunuAcKapat);
  })();

  // "Ürünler" başlığı: tıklanınca ürün listesi açılıp kapanır, tercih tarayıcıda saklanır.
  (function () {
    var baslikDugmesi = document.getElementById('urunListesiBasligi');
    var liste = document.getElementById('urunNav');
    var ANAHTAR = 'urunHataRaporuUrunListesiKapali';
    var kapaliMi = false;
    try { kapaliMi = localStorage.getItem(ANAHTAR) === '1'; } catch (e) { /* gizli sekme vb. — yoksay */ }
    function durumuUygula(kapali) {
      liste.classList.toggle('urun-nav-kapali', kapali);
      baslikDugmesi.setAttribute('aria-expanded', kapali ? 'false' : 'true');
    }
    durumuUygula(kapaliMi);
    baslikDugmesi.addEventListener('click', function () {
      kapaliMi = !kapaliMi;
      durumuUygula(kapaliMi);
      try { localStorage.setItem(ANAHTAR, kapaliMi ? '1' : '0'); } catch (e) { /* yoksay */ }
    });
  })();

  // Sayfa açılışı: varsayılan ekran GENEL (tüm ürünlerin özeti). Tüm tarih filtreleri
  // başlangıçta "tüm zamanlar" aralığıyla doldurulur.
  tarihSinirlariniAyarla('baslangicTarihi', 'bitisTarihi');
  tarihSinirlariniAyarla('baslangicTarihiKosu', 'bitisTarihiKosu');
  tarihSinirlariniAyarla('baslangicTarihiTrend', 'bitisTarihiTrend');
  tarihSinirlariniAyarla('baslangicTarihiUrun', 'bitisTarihiUrun');
  // "Koşu geçmişi"nde dashboard'dan tetiklenip localStorage'a kalıcı olarak yazılmış
  // (bkz. anlikKosuKaydiEkle) önceki koşuları geri getirir — secimGuncellendi()'den
  // ÖNCE çağrılır ki ilk çizimde bu kayıtlar da görünsün.
  anlikKosuDepoyuYukle();
  secimGuncellendi();
  document.getElementById('senaryoTablosuArama').addEventListener('input', function (olay) {
    SENARYO_TABLOSU_ARAMA = olay.target.value;
    senaryoTablosuSayfa = 1;
    senaryoTablosuCiz();
  });
  document.getElementById('senaryoTumunuSecCheckbox').addEventListener('change', function (olay) {
    var liste = senaryoTablosuFiltrelenmisListeyiGetir();
    if (olay.target.checked) liste.forEach(function (s) { SENARYO_TABLOSU_SECILI.add(senaryoAnahtari(s)); });
    else liste.forEach(function (s) { SENARYO_TABLOSU_SECILI.delete(senaryoAnahtari(s)); });
    senaryoTablosuCiz();
  });
  // "▷ Koşuyu başlat": görünümdeki (Genel → tüm ürünler, ürün seçiliyse o ürün) koşuya
  // DAHİL senaryoları sırayla koşar. Arama boşsa gerçek bir "koşu"dur (kosuTuru 'tam',
  // kosuKapsami = 'Genel' ya da ürün adı) ve kartları/trendi günceller; arama varsa yalnızca
  // eşleşenler koştuğu için kısmi (tekil) koşu sayılır. Zaten çalışan senaryolar (ör. koşu
  // detay penceresinden başlatılmış) ikinci kez başlatılmaz.
  document.getElementById('senaryoTumunuCalistirButonu').addEventListener('click', function () {
    var liste = kosuyaDahilGorunenAnahtarlar();
    var gorunen = senaryoTablosuFiltrelenmisListeyiGetir();
    var haricSayisi = gorunen.filter(function (s) { return !kosuyaDahilMi(senaryoAnahtari(s)); }).length;
    var aramaVarMi = !!SENARYO_TABLOSU_ARAMA.trim();
    topluKosuOnayiIste(liste, false, {
      kosuMu: true,
      tamKosuMu: !aramaVarMi,
      kapsam: secilenUrun === GENEL ? 'Genel' : secilenUrun,
      aramaVarMi: aramaVarMi,
      haricSayisi: haricSayisi
    });
  });
  document.getElementById('senaryoKosuyaEkleButonu').addEventListener('click', function () {
    kosuListesiniDegistir(kosuListesiSeciliAnahtarlar(true), true);
  });
  document.getElementById('senaryoKosudanCikarButonu').addEventListener('click', function () {
    kosuListesiniDegistir(kosuListesiSeciliAnahtarlar(false), false);
  });
  document.getElementById('senaryoSecilenleriCalistirButonu').addEventListener('click', function () {
    // Butondaki sayıyla birebir aynı liste (bkz. seciliCalistirilacakAnahtarlar).
    topluKosuOnayiIste(seciliCalistirilacakAnahtarlar(), true);
  });
  document.getElementById('topluKosuOnayIptal').addEventListener('click', topluKosuOnayKapat);
  document.getElementById('topluKosuOnayKapatButonu').addEventListener('click', topluKosuOnayKapat);
  document.getElementById('topluKosuOnayOrtu').addEventListener('click', function (olay) {
    if (olay.target.id === 'topluKosuOnayOrtu') topluKosuOnayKapat();
  });
  document.getElementById('topluKosuOnayBaslat').addEventListener('click', function () {
    var bekleyen = TOPLU_KOSU_ONAY_BEKLEYEN;
    topluKosuOnayKapat();
    if (!bekleyen) return;
    // Toplu koşu başlarken seçim temizlenir (topluKosuBaslat tabloyu yeniden çizer,
    // kutucuklar da boşalır) — aynı seçim yanlışlıkla tekrar koşulmasın.
    SENARYO_TABLOSU_SECILI.clear();
    topluKosuBaslat(bekleyen.senaryolar, bekleyen.esZamanliMi, bekleyen.tamKosuMu, bekleyen.kapsam);
  });
  document.getElementById('senaryoCanliPanelDurdurButonu').addEventListener('click', function (olay) {
    olay.target.closest('button').disabled = true;
    topluKosuDurdur();
  });

  function kalipFiltresiDegisti() {
    kalipSayfa = 1;
    tabloyuGuncelle();
  }
  document.getElementById('baslangicTarihi').addEventListener('change', kalipFiltresiDegisti);
  document.getElementById('bitisTarihi').addEventListener('change', kalipFiltresiDegisti);
  document.getElementById('tumZamanlarButonu').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihi', 'bitisTarihi');
    kalipFiltresiDegisti();
  });

  function kosuGecmisiFiltresiDegisti() {
    kosuGecmisiSayfa = 1;
    kosuGecmisiniGuncelle();
  }
  document.getElementById('baslangicTarihiKosu').addEventListener('change', kosuGecmisiFiltresiDegisti);
  document.getElementById('bitisTarihiKosu').addEventListener('change', kosuGecmisiFiltresiDegisti);
  document.getElementById('tumZamanlarButonuKosu').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihiKosu', 'bitisTarihiKosu');
    kosuGecmisiFiltresiDegisti();
  });

  document.getElementById('baslangicTarihiTrend').addEventListener('change', trendGrafiginiGuncelle);
  document.getElementById('bitisTarihiTrend').addEventListener('change', trendGrafiginiGuncelle);
  document.getElementById('tumZamanlarButonuTrend').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihiTrend', 'bitisTarihiTrend');
    trendGrafiginiGuncelle();
  });

  // Bu filtre hem üstteki "Ürün/Adım bazlı başarı" grafiğini hem altındaki tabloyu
  // (aynı veri) birlikte günceller — ikisi de ikinciBolumuCiz() içinden çizilir.
  document.getElementById('baslangicTarihiUrun').addEventListener('change', ikinciBolumuCiz);
  document.getElementById('bitisTarihiUrun').addEventListener('change', ikinciBolumuCiz);
  document.getElementById('tumZamanlarButonuUrun').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihiUrun', 'bitisTarihiUrun');
    ikinciBolumuCiz();
  });

  // Adım detay popup'ı: X butonu, karartılmış alana tıklama veya Escape ile kapanır.
  document.getElementById('adimDetayModalKapatButonu').addEventListener('click', adimDetayModalKapat);
  document.getElementById('adimDetayModalOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) adimDetayModalKapat();
  });

  // "Senaryolar" tablosundan tetiklenen çalıştırmanın sonuç popup'ı — aynı kurallarla kapanır.
  document.getElementById('senaryoSonucModalKapatButonu').addEventListener('click', senaryoSonucModalKapat);
  document.getElementById('senaryoSonucModalOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) senaryoSonucModalKapat();
  });

  // Toplu koşu "canlı panel"i — kapatılsa bile arka planda koşu devam eder (DOM'a
  // bağlı değil, Promise zincirleriyle yürür); kullanıcı istediğinde tekrar sonucu
  // görmek isterse en son "Koşuyu başlat"/"Seçilenleri çalıştır" ile tekrar açar.
  document.getElementById('senaryoCanliPanelKapatButonu').addEventListener('click', senaryoCanliPanelKapat);
  document.getElementById('senaryoCanliPanelOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) senaryoCanliPanelKapat();
  });
  // Sağ alttaki küçük rozete tıklanınca panel (o an çalışıyor olsun ya da bitmiş
  // olsun) aynı içerikle tekrar açılır — hâlâ çalışan satırlar varsa canlı görüntü
  // sorgulaması da (panel kapanınca durdurulmuştu) kaldığı yerden devam eder.
  document.getElementById('canliPanelKucukRozet').addEventListener('click', function () {
    document.getElementById('senaryoCanliPanelOrtu').classList.add('acik');
    canliPanelRozetGizle();
    Object.keys(CANLI_PANEL_CALISAN_INDEXLER).forEach(function (index) {
      var kayit = CANLI_PANEL_CALISAN_INDEXLER[index];
      canliPanelIzlemeyiBaslat(index, kayit.ad, kayit.kosuId);
    });
  });

  // "+ Senaryo Oluştur" popup'ı — aynı kurallarla kapanır (bkz. senaryoOlusturModalKapat).
  document.getElementById('senaryoOlusturModalKapatButonu').addEventListener('click', senaryoOlusturModalKapat);
  document.getElementById('senaryoOlusturModalOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) senaryoOlusturModalKapat();
  });
  document.getElementById('senaryoOlusturButonu').addEventListener('click', senaryoOlusturModalAc);

  // Ekran görüntüsü büyütme: sayfadaki (veya başka bir modal içindeki) herhangi bir
  // ".hata-goruntu" küçük resmine tıklanınca resmi ortalanmış/büyük halde gösterir.
  function gorselBuyutmeAc(src, alt) {
    if (!src) return;
    document.getElementById('gorselBuyutmeResim').src = src;
    document.getElementById('gorselBuyutmeResim').alt = alt || 'Büyütülmüş ekran görüntüsü';
    document.getElementById('gorselBuyutmeOrtu').classList.add('acik');
  }
  function gorselBuyutmeKapat() {
    document.getElementById('gorselBuyutmeOrtu').classList.remove('acik');
    document.getElementById('gorselBuyutmeResim').src = '';
  }
  document.addEventListener('click', function (olay) {
    var resim = olay.target.closest('.hata-goruntu');
    if (resim) gorselBuyutmeAc(resim.getAttribute('src'), resim.getAttribute('alt'));
  });
  document.getElementById('gorselBuyutmeKapatButonu').addEventListener('click', gorselBuyutmeKapat);
  document.getElementById('gorselBuyutmeOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) gorselBuyutmeKapat();
  });

  document.addEventListener('keydown', function (olay) {
    if (olay.key !== 'Escape') return;
    if (document.getElementById('topluKosuOnayOrtu').classList.contains('acik')) topluKosuOnayKapat();
    else if (document.getElementById('gorselBuyutmeOrtu').classList.contains('acik')) gorselBuyutmeKapat();
    else if (document.getElementById('senaryoSonucModalOrtu').classList.contains('acik')) senaryoSonucModalKapat();
    else if (document.getElementById('senaryoCanliPanelOrtu').classList.contains('acik')) senaryoCanliPanelKapat();
    else if (document.getElementById('senaryoOlusturModalOrtu').classList.contains('acik')) senaryoOlusturModalKapat();
    else adimDetayModalKapat();
  });
</script>
</body>
</html>`;

const htmlDosyaYolu = join(process.cwd(), `dashboard-${ortam}.html`);
writeFileSync(htmlDosyaYolu, html, 'utf-8');
console.log(`Dashboard sayfası yazıldı: ${htmlDosyaYolu}`);
