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

const ortam = process.argv[2];

if (!ortam || !['test', 'canli'].includes(ortam)) {
  console.error('Kullanım: node scripts/urun-hata-raporu.mjs <test|canli>');
  process.exit(1);
}

const sonuclarKlasoru = join(process.cwd(), `allure-results-${ortam}`);

if (!existsSync(sonuclarKlasoru)) {
  console.error(`"${sonuclarKlasoru}" bulunamadı. Önce testleri çalıştırın (örn. npm run test:${ortam === 'test' ? 'test-ortami' : 'canli'}).`);
  process.exit(1);
}

// "Son koşu" hızlı bakış için: iki sonuç arasında bu kadar boşluk varsa (ms)
// aralarında yeni bir koşu (ayrı bir npm run test... çağrısı) başladığı kabul edilir.
const KOSU_BOSLUGU_MS = 10 * 60 * 1000; // 10 dakika

const KATEGORILER = [
  { ad: 'İş Kuralı / Ekran Hatası (Pop-up)', desen: /beklenmeyen bir hata pop.?up/i },
  { ad: 'Zaman Aşımı (Timeout)', desen: /timeout.*exceeded/i },
  { ad: 'Seçici / Elemana Ulaşılamadı', desen: /(element\(s\) not found|strict mode violation|waiting for locator)/i },
  { ad: 'Doğrulama (Assertion) Hatası', desen: /(toBeVisible|toBeChecked|toHaveValue|toHaveText|Expected)/i }
];

function kategoriBul(mesaj) {
  if (!mesaj) return 'Diğer / Sınıflandırılamadı';
  const eslesen = KATEGORILER.find((k) => k.desen.test(mesaj));
  return eslesen ? eslesen.ad : 'Diğer / Sınıflandırılamadı';
}

// Hata mesajının SABİT KALIBINI çıkarır: değişken (sayısal) kısımlar "#" olur.
// "250166487 numaralı teklif onaylanamadı" -> "# numaralı teklif onaylanamadı"
function kalipCikar(mesajTam) {
  if (!mesajTam) return 'Mesaj yok / boş hata';
  let ilkSatir = mesajTam.split('\n')[0].trim();
  if (!ilkSatir) return 'Mesaj yok / boş hata';

  let kalip = ilkSatir
    // UUID benzeri değerleri önce sil (sayı deseni bunları yarım bırakabilir)
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '#')
    // Her sayısal diziyi (teklif no, id, tarih, tutar vb.) tek karaktere indir
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

  if (kalip.length > 180) kalip = kalip.slice(0, 177) + '...';
  return kalip;
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

function gunAnahtari(zamanDamgasiMs) {
  return new Date(zamanDamgasiMs).toLocaleDateString('sv-SE'); // YYYY-MM-DD (input[type=date] ile uyumlu)
}

function kacHesapla(icerikTuru) {
  return icerikTuru.basarili + icerikTuru.basarisiz + icerikTuru.atlanan;
}

function ekranGoruntusuDataUriGetir(icerik, klasor) {
  const ekBulunan = (icerik.attachments ?? []).find(
    (ek) => ek.type === 'image/png' && /Ekran Görüntüsü/i.test(ek.name ?? '')
  );
  if (!ekBulunan?.source) return null;
  const ekYolu = join(klasor, ekBulunan.source);
  if (!existsSync(ekYolu)) return null;
  try {
    return `data:image/png;base64,${readFileSync(ekYolu).toString('base64')}`;
  } catch {
    return null;
  }
}

// --- 1) Tüm ham sonuç dosyalarını oku ---
const dosyalar = readdirSync(sonuclarKlasoru).filter((dosya) => dosya.endsWith('-result.json'));
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
  console.error('Sonuç dosyalarında zaman damgası bulunamadı, özet çıkarılamadı.');
  process.exit(1);
}

// --- 2) "Son koşu" hızlı bakış için sonuçları KOŞULARA kümele ---
const kosular = [];
for (const { icerik, zaman } of tumIcerikler) {
  const sonKosu = kosular[kosular.length - 1];
  if (!sonKosu || zaman - sonKosu.bitis > KOSU_BOSLUGU_MS) {
    kosular.push({ bitis: zaman, testler: new Map() });
  }
  const guncelKosu = kosular[kosular.length - 1];
  guncelKosu.bitis = Math.max(guncelKosu.bitis, zaman);
  const anahtar = icerik.historyId ?? icerik.uuid;
  const mevcut = guncelKosu.testler.get(anahtar);
  if (!mevcut || zaman >= (mevcut._zaman ?? 0)) {
    icerik._zaman = zaman;
    guncelKosu.testler.set(anahtar, icerik);
  }
}
for (const kosu of kosular) kosu.etiket = kosuEtiketi(kosu.bitis);

function kosuOzetiCikar(testMap) {
  let basarili = 0;
  let basarisiz = 0;
  let atlanan = 0;
  const urunToplamlari = {};
  for (const icerik of testMap.values()) {
    const epicEtiketi = (icerik.labels ?? []).find((e) => e.name === 'epic');
    const urun = epicEtiketi?.value ?? 'Bilinmiyor';
    urunToplamlari[urun] ??= { basarili: 0, basarisiz: 0, atlanan: 0 };
    if (icerik.status === 'passed') {
      basarili += 1;
      urunToplamlari[urun].basarili += 1;
    } else if (icerik.status === 'failed' || icerik.status === 'broken') {
      basarisiz += 1;
      urunToplamlari[urun].basarisiz += 1;
    } else if (icerik.status === 'skipped') {
      atlanan += 1;
      urunToplamlari[urun].atlanan += 1;
    }
  }
  return { basarili, basarisiz, atlanan, urunToplamlari };
}

const sonKosu = kosular[kosular.length - 1];
const oncekiKosu = kosular[kosular.length - 2] ?? null;
const sonKosuOzet = kosuOzetiCikar(sonKosu.testler);
const oncekiKosuOzet = oncekiKosu ? kosuOzetiCikar(oncekiKosu.testler) : null;

// "Koşu geçmişi" tablosu + "Koşu trendi" grafiği için: TÜM koşuların başarılı/
// başarısız/atlanan sayıları, hem genel hem de ürün bazında (kronolojik sırayla,
// en eski önce). Grafik son TREND_KOSU_LIMIT koşuyla sınırlı kalır, ama tablo
// (kosuGecmisi) koşuların tamamını listeler — istemci tarafında sayfalanır ve
// tarih aralığına göre filtrelenir.
const TREND_KOSU_LIMIT = 12;
const tumKosuOzetleri = kosular.map((kosu) => {
  const ozet = kosuOzetiCikar(kosu.testler);
  return {
    etiket: kosu.etiket,
    etiketKisa: new Date(kosu.bitis).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
    z: kosu.bitis,
    basarili: ozet.basarili,
    basarisiz: ozet.basarisiz,
    atlanan: ozet.atlanan,
    urunler: ozet.urunToplamlari
  };
});
const trendKosulari = tumKosuOzetleri.slice(-TREND_KOSU_LIMIT);

// Adım (step) bazlı başarı/başarısız gezgini için: allure-playwright her test.step()
// çağrısını icerik.steps altında (iç içe de olabilir) kaydeder. Ürün bazında, adım
// adına göre tüm zamanların başarılı/başarısız sayısını toplar.
function adimlariGezVeTopla(adimListesi, sayaclar) {
  for (const adim of adimListesi ?? []) {
    const ad = adim.name ?? 'İsimsiz adım';
    sayaclar[ad] ??= { basarili: 0, basarisiz: 0 };
    if (adim.status === 'passed') sayaclar[ad].basarili += 1;
    else if (adim.status === 'failed' || adim.status === 'broken') sayaclar[ad].basarisiz += 1;
    if (adim.steps?.length) adimlariGezVeTopla(adim.steps, sayaclar);
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
  const durum = icerik.status === 'passed' ? 'basarili' : icerik.status === 'skipped' ? 'atlanan' : 'basarisiz';

  urunAdimSayaclari[urun] ??= {};
  adimlariGezVeTopla(icerik.steps, urunAdimSayaclari[urun]);

  let kategori = null;
  let kalip = null;

  if (durum === 'basarisiz') {
    const mesajTam = icerik.statusDetails?.message ?? '';
    kategori = kategoriBul(mesajTam);
    kalip = kalipCikar(mesajTam);

    const anahtar = `${urun}|||${kategori}|||${kalip}`;
    const mevcutOrnek = ornekler.get(anahtar);
    const adayEkranGoruntusu = ekranGoruntusuDataUriGetir(icerik, sonuclarKlasoru);
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
        ekranGoruntusu: adayEkranGoruntusu
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

// Ürün başına adım listesi. ADIM_SIRASI'nda tanımlı ürünlerde ekran akışı sırası
// kullanılır; diğer ürünlerde (henüz elle sıralama tanımlanmamış) en çok başarısız
// olan adım en üstte gösterilir. En fazla ADIM_LISTESI_LIMIT satır.
const adimOzeti = {};
for (const urun of urunler) {
  const sayaclar = urunAdimSayaclari[urun] ?? {};
  const satirlar = Object.entries(sayaclar).map(([ad, s]) => ({
    ad,
    basarili: s.basarili,
    basarisiz: s.basarisiz,
    toplam: s.basarili + s.basarisiz
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
console.log(`\n${ortam.toUpperCase()} ortamı - son koşu: ${sonKosu.etiket} (kayıtlı koşu sayısı: ${kosular.length})\n`);
console.log(
  `Toplam: ${kacHesapla(sonKosuOzet)} test | Başarılı: ${sonKosuOzet.basarili} | Başarısız: ${sonKosuOzet.basarisiz} | Atlanan: ${sonKosuOzet.atlanan}`
);
console.table(
  Object.entries(sonKosuOzet.urunToplamlari).map(([urun, s]) => ({
    Ürün: urun,
    Başarılı: s.basarili,
    Başarısız: s.basarisiz,
    Atlanan: s.atlanan
  }))
);
console.log(`\nDetaylı, tarih aralığı filtrelenebilir hata kalıbı tablosu için dashboard-${ortam}.html dosyasını açın.`);

// --- 5) Kısa markdown özeti (paylaşım için) ---
const markdownSatirlari = [
  `# ${ortam.toUpperCase()} Ortamı - Hata ve Başarı Özeti`,
  '',
  `Son koşu: ${sonKosu.etiket}`,
  '',
  `Toplam: ${kacHesapla(sonKosuOzet)} test | Başarılı: ${sonKosuOzet.basarili} | Başarısız: ${sonKosuOzet.basarisiz} | Atlanan: ${sonKosuOzet.atlanan}`,
  ''
];
if (oncekiKosuOzet) {
  markdownSatirlari.push(
    `Önceki koşuya (${oncekiKosu.etiket}) göre değişim: Başarılı ${sonKosuOzet.basarili - oncekiKosuOzet.basarili >= 0 ? '+' : ''}${sonKosuOzet.basarili - oncekiKosuOzet.basarili}, ` +
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

const veri = {
  ortam,
  uretimZamani: new Date().toLocaleString('tr-TR'),
  sonKosuEtiket: sonKosu.etiket,
  urunler,
  // Sabit kategori sırası — istemci tarafında kategori-renk eşlemesi bu sıraya göre yapılır.
  kategoriler: [...KATEGORILER.map((k) => k.ad), 'Diğer / Sınıflandırılamadı'],
  kayitlar: tumKayitlar,
  // GENEL veya ürün seçimine göre üst istatistik kartları ve trend grafiğinin
  // kaynağı — hem toplam hem ürün bazlı kırılım burada.
  sonKosu: { etiket: sonKosu.etiket, genel: { basarili: sonKosuOzet.basarili, basarisiz: sonKosuOzet.basarisiz, atlanan: sonKosuOzet.atlanan }, urunler: sonKosuOzet.urunToplamlari },
  oncekiKosu: oncekiKosuOzet
    ? { etiket: oncekiKosu.etiket, genel: { basarili: oncekiKosuOzet.basarili, basarisiz: oncekiKosuOzet.basarisiz, atlanan: oncekiKosuOzet.atlanan }, urunler: oncekiKosuOzet.urunToplamlari }
    : null,
  kosuTrendi: trendKosulari,
  kosuGecmisi: tumKosuOzetleri,
  adimOzeti,
  ornekler: Object.fromEntries(
    [...ornekler.entries()].map(([anahtar, ornek]) => [
      anahtar,
      {
        t: kosuEtiketi(ornek.zaman),
        b: ornek.baslik,
        oz: ornek.ozellik,
        m: ornek.mesaj,
        g: ornek.ekranGoruntusu
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
  .viz-root {
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
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1: #1c1c19; --surface-2: #222220; --page-plane: #131311; --text-primary: #f5f4ef;
      --text-secondary: #c3c2b7; --text-muted: #918f83; --gridline: #2f2f2b;
      --border: rgba(255,255,255,0.09); --good: #33c23a; --critical: #ef6a6a;
      --warning: #eab04b; --accent: #7ea0f5; --accent-soft: rgba(126,160,245,0.14);
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.55);
    }
  }
  :root[data-theme="dark"] .viz-root {
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
  .viz-root { display: grid; grid-template-columns: 272px 1fr; min-height: 100vh; }

  /* ---------- Yan panel ---------- */
  .kenar-cubugu {
    background: var(--surface-1); border-right: 1px solid var(--border);
    padding: 22px 18px 18px; display: flex; flex-direction: column; gap: 22px;
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  .marka { display: flex; align-items: center; gap: 10px; }
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
  .urun-nav { display: flex; flex-direction: column; gap: 3px; flex: 1; overflow-y: auto; }
  .urun-oge {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 9px 11px; border-radius: 9px; cursor: pointer; font-size: 13.5px; font-weight: 600;
    color: var(--text-secondary); border: 1px solid transparent; background: none; text-align: left; width: 100%;
    font-family: inherit; transition: background .12s ease, color .12s ease;
  }
  .urun-oge:hover { background: var(--surface-2); color: var(--text-primary); }
  .urun-oge.aktif { background: var(--accent-soft); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .urun-oge-ad { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .urun-oge-adet {
    font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; flex-shrink: 0;
    background: var(--gridline); color: var(--text-secondary);
  }
  .urun-oge.aktif .urun-oge-adet { background: var(--accent); color: #fff; }
  .urun-oge-adet.sifir { background: transparent; color: var(--text-muted); }

  .kenar-alt-not {
    font-size: 12px; color: var(--text-muted); padding: 10px 12px; border-radius: 10px;
    background: var(--surface-2); border: 1px solid var(--border); line-height: 1.5;
  }

  /* ---------- Ana içerik ---------- */
  .icerik { padding: 28px 34px 56px; max-width: 1180px; }
  .ust-baslik { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 22px; }
  h1 { font-size: 21px; margin: 0; font-weight: 700; letter-spacing: -0.01em; }
  .alt-baslik { color: var(--text-secondary); font-size: 13.5px; margin-top: 4px; }

  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 30px; }
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

  .kart { background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 11px 16px; border-bottom: 1px solid var(--gridline); font-size: 13.5px; }
  th { color: var(--text-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--surface-2); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--surface-2); }

  .rozet { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .rozet-iyi { background: color-mix(in srgb, var(--good) 16%, transparent); color: var(--good); }
  .rozet-kritik { background: color-mix(in srgb, var(--critical) 14%, transparent); color: var(--critical); }
  .rozet-notr { background: var(--gridline); color: var(--text-secondary); }
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

  /* Tarih aralığı filtresi */
  .tarih-filtre {
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; box-shadow: var(--shadow);
  }
  .tarih-filtre label { font-size: 12.5px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; font-weight: 600; }
  .tarih-filtre input[type="date"] {
    font: inherit; padding: 6px 10px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary);
  }
  .tarih-filtre button {
    font: inherit; padding: 7px 14px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--page-plane); color: var(--text-primary); cursor: pointer; font-weight: 700; font-size: 12.5px;
  }
  .tarih-filtre button:hover { border-color: var(--accent); color: var(--accent); }
  .secim-ozeti { font-size: 12.5px; color: var(--text-muted); margin-left: auto; }

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
  .hata-kalip { font-weight: 600; flex: 1; min-width: 220px; }
  .hata-govde { padding: 0 16px 16px 39px; border-top: 1px solid var(--gridline); }
  .hata-mesaj {
    white-space: pre-wrap; word-break: break-word; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 9px; padding: 11px 13px; font-size: 12.5px; color: var(--text-secondary); margin: 12px 0;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .hata-goruntu { max-width: 100%; border-radius: 9px; border: 1px solid var(--border); display: block; }
  .hata-ornek-etiket { font-size: 12px; color: var(--text-muted); margin-top: 12px; margin-bottom: 2px; }

  /* Hata kalıpları paneli: kategori donut + liste yan yana */
  .hata-panel { display: grid; grid-template-columns: 250px 1fr; gap: 18px; align-items: start; }
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

  @media (max-width: 860px) {
    .viz-root { grid-template-columns: 1fr; }
    .kenar-cubugu { position: static; height: auto; }
    .icerik { padding: 22px 18px 40px; }
  }
</style>
</head>
<body>
<div class="viz-root">
  <aside class="kenar-cubugu">
    <div class="marka">
      <div class="marka-simge">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
      </div>
      <div>
        <div class="marka-metin-baslik">${ortam.toUpperCase()} Ortamı</div>
        <div class="marka-metin-alt">Test Dashboard</div>
      </div>
    </div>

    <div class="donut-kart">
      <div class="donut-satir">
        <div class="donut-sarma">
          <div class="donut-halka" style="--oran:${sonKosuOran}"></div>
          <div class="donut-oyuk">%${sonKosuOran}</div>
        </div>
        <div class="donut-detay">
          <div><span class="nokta nokta-iyi"></span>Başarılı ${sonKosuOzet.basarili}</div>
          <div><span class="nokta nokta-kotu"></span>Başarısız ${sonKosuOzet.basarisiz}</div>
          <div><span class="nokta nokta-notr"></span>Atlanan ${sonKosuOzet.atlanan}</div>
        </div>
      </div>
      <div class="donut-etiket">Son koşu: ${escapeHtml(veri.sonKosuEtiket)}</div>
    </div>

    <div>
      <div class="yan-baslik">Ürünler</div>
      <nav class="urun-nav" id="urunNav" style="margin-top:6px"></nav>
    </div>

    <div class="kenar-alt-not">İsteğe bağlı: adım adım/trace inceleme için Allure raporu ayrı bir sekmede açık — günlük kullanımda buna gerek yok.</div>
  </aside>

  <main class="icerik">
    <div class="ust-baslik">
      <div>
        <h1 id="anaBaslik">Genel Bakış</h1>
        <div class="alt-baslik">Üretim: ${escapeHtml(veri.uretimZamani)}</div>
      </div>
    </div>

    <div class="stat-grid" id="statGrid"></div>

    <section>
      <h2>Koşu trendi</h2>
      <p class="bolum-alt" id="trendAltBaslik"></p>
      <div class="kart trend-kart">
        <div class="trend-lejant">
          <span><span class="nokta" style="background:var(--good)"></span>Başarılı</span>
          <span><span class="nokta" style="background:var(--critical)"></span>Başarısız</span>
        </div>
        <div id="trendSvgAlani"></div>
      </div>
    </section>

    <section>
      <h2>Koşu geçmişi</h2>
      <p class="bolum-alt">Bugüne kadarki tüm koşular — tarih aralığıyla daraltabilir, sayfa sayfa gezebilirsiniz.</p>
      <div class="tarih-filtre">
        <label>Başlangıç <input type="date" id="baslangicTarihiKosu" /></label>
        <label>Bitiş <input type="date" id="bitisTarihiKosu" /></label>
        <button type="button" id="tumZamanlarButonuKosu">Tüm zamanlar</button>
        <span class="secim-ozeti" id="secimOzetiKosu"></span>
      </div>
      <div class="kart">
        <table class="veri-tablosu">
          <thead>
            <tr>
              <th>Koşu</th>
              <th class="num">Toplam</th>
              <th class="num">Başarılı</th>
              <th class="num">Başarısız</th>
              <th class="num">Atlanan</th>
              <th class="num">Başarı oranı</th>
            </tr>
          </thead>
          <tbody id="kosuGecmisiGovdesi"></tbody>
        </table>
        <div class="sayfalama" id="kosuGecmisiSayfalama"></div>
      </div>
    </section>

    <section>
      <h2 id="ikinciBaslik">Ürün bazlı özet</h2>
      <p class="bolum-alt" id="ikinciAltBaslik"></p>
      <div id="ikinciBolumAlani"></div>
    </section>

    <section>
      <h2 id="secilenUrunBasligi">Hata kalıpları</h2>
      <p class="bolum-alt">Tarih aralığını daraltın; aynı kalıptaki hatalar tek satırda toplanır.</p>
      <div class="tarih-filtre">
        <label>Başlangıç <input type="date" id="baslangicTarihi" /></label>
        <label>Bitiş <input type="date" id="bitisTarihi" /></label>
        <button type="button" id="tumZamanlarButonu">Tüm zamanlar</button>
        <span class="secim-ozeti" id="secimOzeti"></span>
      </div>
      <div class="hata-panel">
        <div class="kategori-kart" id="kategoriDonutAlani"></div>
        <div id="kalipTablosuAlani"></div>
      </div>
    </section>

    <footer>Bu sayfa her "npm run rapor:${ortam}" / "npm run hata:ozet:${ortam}" çalıştığında yeniden üretilir.</footer>
  </main>
</div>

<script>
  var VERI = ${veriJson};

  function escapeHtml(metin) {
    return String(metin).replace(/[&<>"']/g, function (k) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[k];
    });
  }

  function gunAnahtari(zamanMs) {
    var d = new Date(zamanMs);
    var yil = d.getFullYear();
    var ay = String(d.getMonth() + 1).padStart(2, '0');
    var gun = String(d.getDate()).padStart(2, '0');
    return yil + '-' + ay + '-' + gun;
  }

  // Kategori -> sabit renk eşlemesi (VERI.kategoriler sırasına göre).
  var KATEGORI_RENKLERI = ['#d03b3b', '#c47f0a', '#2456c9', '#7c5cff', '#8a8879'];
  function kategoriRengi(kategoriAdi) {
    var idx = VERI.kategoriler.indexOf(kategoriAdi);
    return KATEGORI_RENKLERI[idx >= 0 ? idx : KATEGORI_RENKLERI.length - 1];
  }

  // Ürün başına tüm-zamanlar başarısız sayısı (yan panel rozetleri için).
  var urunBasarisizSayilari = {};
  VERI.kayitlar.forEach(function (k) {
    if (k.d !== 'basarili' && k.d !== 'atlanan') {
      urunBasarisizSayilari[k.u] = (urunBasarisizSayilari[k.u] || 0) + 1;
    }
  });

  var GENEL = null; // "GENEL" sekmesi seçiliyken secilenUrun bu değeri alır (tüm ürünler).
  var genelBasarisizToplam = 0;
  Object.keys(urunBasarisizSayilari).forEach(function (urun) { genelBasarisizToplam += urunBasarisizSayilari[urun]; });

  var secilenUrun = GENEL; // Varsayılan ekran: GENEL (tüm ürünlerin özeti).
  var kosuGecmisiSayfa = 1; // "Koşu geçmişi" tablosunun geçerli sayfası (1'den başlar).
  var KOSU_GECMISI_SAYFA_BOYUTU = 10;

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
        secilenUrun = deger === '__genel__' ? GENEL : deger;
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
    document.getElementById(baslangicId).value = gunAnahtari(minZaman);
    document.getElementById(bitisId).value = gunAnahtari(maxZaman);
  }

  function secilenTarihAraligi(baslangicId, bitisId) {
    var baslangicStr = document.getElementById(baslangicId).value;
    var bitisStr = document.getElementById(bitisId).value;
    return {
      baslangicMs: baslangicStr ? new Date(baslangicStr + 'T00:00:00').getTime() : -Infinity,
      bitisMs: bitisStr ? new Date(bitisStr + 'T23:59:59.999').getTime() : Infinity
    };
  }

  // "Ürün bazlı özet" tablosu: seçilen tarih aralığında TÜM ürünlerin toplamlarını hesaplar.
  function urunOzetTablosunuGuncelle() {
    var govde = document.getElementById('urunOzetGovdesi');
    var ozetAlani = document.getElementById('secimOzetiUrun');
    if (!govde || !ozetAlani) return; // İkinci bölüm şu an adım tablosunu gösteriyorsa bu elemanlar yok.
    var aralik = secilenTarihAraligi('baslangicTarihiUrun', 'bitisTarihiUrun');

    var urunToplamlari = {}; // urun -> { basarili, basarisiz, atlanan }
    var toplamKayit = 0;
    VERI.kayitlar.forEach(function (k) {
      if (k.z < aralik.baslangicMs || k.z > aralik.bitisMs) return;
      toplamKayit++;
      if (!urunToplamlari[k.u]) urunToplamlari[k.u] = { basarili: 0, basarisiz: 0, atlanan: 0 };
      if (k.d === 'basarili') urunToplamlari[k.u].basarili++;
      else if (k.d === 'atlanan') urunToplamlari[k.u].atlanan++;
      else urunToplamlari[k.u].basarisiz++;
    });

    ozetAlani.textContent = toplamKayit + ' test kaydı';

    var siraliUrunler = Object.keys(urunToplamlari).sort(function (a, b) {
      return urunToplamlari[b].basarisiz - urunToplamlari[a].basarisiz;
    });

    if (siraliUrunler.length === 0) {
      govde.innerHTML = '<tr><td colspan="5">Seçilen tarih aralığında veri yok</td></tr>';
      return;
    }

    govde.innerHTML = siraliUrunler
      .map(function (urun) {
        var s = urunToplamlari[urun];
        var toplam = s.basarili + s.basarisiz + s.atlanan;
        var oran = toplam > 0 ? Math.round((s.basarili / toplam) * 100) : 0;
        var barRengi = oran >= 80 ? 'var(--good)' : oran >= 50 ? 'var(--warning)' : 'var(--critical)';
        return (
          '<tr>' +
          '<td>' + escapeHtml(urun) + '</td>' +
          '<td class="num">' + s.basarili + '</td>' +
          '<td class="num">' + s.basarisiz + '</td>' +
          '<td class="num">' + s.atlanan + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + oran + '%;background:' + barRengi + '"></div></div><span>%' + oran + '</span></div></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  // İkinci bölüm: GENEL seçiliyken "Ürün bazlı özet" (tarih filtreli tablo),
  // bir ürün seçiliyken o ürünün "Adım bazlı başarı" (step) tablosu.
  function ikinciBolumuCiz() {
    var baslik = document.getElementById('ikinciBaslik');
    var altBaslik = document.getElementById('ikinciAltBaslik');
    var alan = document.getElementById('ikinciBolumAlani');

    if (secilenUrun === GENEL) {
      baslik.textContent = 'Ürün bazlı özet';
      altBaslik.textContent = 'Tarih aralığı seçin — tüm ürünlerin o aralıktaki toplamları anlık hesaplanır.';
      alan.innerHTML =
        '<div class="tarih-filtre">' +
        '<label>Başlangıç <input type="date" id="baslangicTarihiUrun" /></label>' +
        '<label>Bitiş <input type="date" id="bitisTarihiUrun" /></label>' +
        '<button type="button" id="tumZamanlarButonuUrun">Tüm zamanlar</button>' +
        '<span class="secim-ozeti" id="secimOzetiUrun"></span>' +
        '</div>' +
        '<div class="kart"><table>' +
        '<thead><tr><th>Ürün</th><th class="num">Başarılı</th><th class="num">Başarısız</th><th class="num">Atlanan</th><th class="num">Başarı oranı</th></tr></thead>' +
        '<tbody id="urunOzetGovdesi"></tbody></table></div>';

      tarihSinirlariniAyarla('baslangicTarihiUrun', 'bitisTarihiUrun');
      urunOzetTablosunuGuncelle();
      document.getElementById('baslangicTarihiUrun').addEventListener('change', urunOzetTablosunuGuncelle);
      document.getElementById('bitisTarihiUrun').addEventListener('change', urunOzetTablosunuGuncelle);
      document.getElementById('tumZamanlarButonuUrun').addEventListener('click', function () {
        tarihSinirlariniAyarla('baslangicTarihiUrun', 'bitisTarihiUrun');
        urunOzetTablosunuGuncelle();
      });
      return;
    }

    baslik.textContent = 'Adım bazlı başarı — ' + secilenUrun;
    altBaslik.textContent = 'Tüm koşular toplamında bu ürünün adımlarında (test.step) görülen başarı/başarısız sayısı.';

    var adimlar = VERI.adimOzeti[secilenUrun] || [];
    if (adimlar.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Bu ürün için kayıtlı adım (step) verisi yok — testler test.step() kullanmıyor olabilir.</div>';
      return;
    }

    var satirlar = adimlar
      .map(function (a) {
        var oran = a.toplam > 0 ? Math.round((a.basarili / a.toplam) * 100) : 0;
        var barRengi = oran >= 80 ? 'var(--good)' : oran >= 50 ? 'var(--warning)' : 'var(--critical)';
        return (
          '<tr>' +
          '<td>' + escapeHtml(a.ad) + '</td>' +
          '<td class="num">' + a.basarili + '</td>' +
          '<td class="num">' + a.basarisiz + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + oran + '%;background:' + barRengi + '"></div></div><span>%' + oran + '</span></div></td>' +
          '</tr>'
        );
      })
      .join('');

    alan.innerHTML =
      '<div class="kart"><table>' +
      '<thead><tr><th>Adım</th><th class="num">Başarılı</th><th class="num">Başarısız</th><th class="num">Başarı oranı</th></tr></thead>' +
      '<tbody>' + satirlar + '</tbody></table></div>';
  }

  // Üst istatistik kartları: GENEL seçiliyken tüm ürünlerin son koşusu, bir ürün
  // seçiliyken sadece o ürünün son koşudaki sayıları gösterilir.
  var IKON_TOPLAM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';
  var IKON_BASARILI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var IKON_BASARISIZ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  var IKON_ATLANAN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>';

  function statTileClient(etiket, deger, delta, iyiYonAzalmaMi, ikon) {
    var deltaHtml = '';
    if (delta !== null && VERI.oncekiKosu) {
      var isaret = delta > 0 ? '+' : '';
      var iyiMi = iyiYonAzalmaMi ? delta <= 0 : delta >= 0;
      var renkSinifi = delta === 0 ? 'delta-notr' : iyiMi ? 'delta-iyi' : 'delta-kotu';
      deltaHtml = '<div class="stat-delta ' + renkSinifi + '">' + isaret + delta + ' <span class="stat-delta-etiket">(' + escapeHtml(VERI.oncekiKosu.etiket) + ')</span></div>';
    }
    return (
      '<div class="stat-tile">' +
      '<div class="stat-tile-ust"><div class="stat-label">' + escapeHtml(etiket) + '</div><div class="stat-ikon">' + ikon + '</div></div>' +
      '<div class="stat-value">' + deger + '</div>' +
      deltaHtml +
      '</div>'
    );
  }

  var BOS_KOSU_TOPLAM = { basarili: 0, basarisiz: 0, atlanan: 0 };

  function istatKartlariniGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var son = genelMi ? VERI.sonKosu.genel : VERI.sonKosu.urunler[secilenUrun] || BOS_KOSU_TOPLAM;
    var onceki = VERI.oncekiKosu ? (genelMi ? VERI.oncekiKosu.genel : VERI.oncekiKosu.urunler[secilenUrun] || BOS_KOSU_TOPLAM) : null;
    var toplam = son.basarili + son.basarisiz + son.atlanan;
    var toplamOnceki = onceki ? onceki.basarili + onceki.basarisiz + onceki.atlanan : null;

    document.getElementById('statGrid').innerHTML =
      statTileClient('Toplam test (son koşu)', toplam, onceki ? toplam - toplamOnceki : null, false, IKON_TOPLAM) +
      statTileClient('Başarılı', son.basarili, onceki ? son.basarili - onceki.basarili : null, false, IKON_BASARILI) +
      statTileClient('Başarısız', son.basarisiz, onceki ? son.basarisiz - onceki.basarisiz : null, true, IKON_BASARISIZ) +
      statTileClient('Atlanan', son.atlanan, onceki ? son.atlanan - onceki.atlanan : null, true, IKON_ATLANAN);
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
    var seriler = VERI.kosuTrendi.map(function (k) {
      var n = genelMi ? k : k.urunler[secilenUrun] || BOS_KOSU_TOPLAM;
      return { etiket: k.etiket, etiketKisa: k.etiketKisa, basarili: n.basarili, basarisiz: n.basarisiz };
    });
    document.getElementById('trendSvgAlani').innerHTML = trendSvgOlusturClient(seriler);
    document.getElementById('trendAltBaslik').textContent =
      'Son ' + seriler.length + ' koşuda ' + (genelMi ? 'tüm ürünlerde' : escapeHtml(secilenUrun) + ' ürününde') + ' başarılı/başarısız sayısı nasıl değişti';
  }

  // "Koşu geçmişi" tablosu: seçilen tarih aralığındaki TÜM koşuları (en yeni önce)
  // GENEL veya seçili ürüne göre listeler, 10'ar satırlık sayfalar halinde.
  function kosuGecmisiniGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var aralik = secilenTarihAraligi('baslangicTarihiKosu', 'bitisTarihiKosu');

    var kosular = VERI.kosuGecmisi
      .filter(function (k) { return k.z >= aralik.baslangicMs && k.z <= aralik.bitisMs; })
      .map(function (k) {
        var n = genelMi ? k : k.urunler[secilenUrun] || BOS_KOSU_TOPLAM;
        return { etiket: k.etiket, basarili: n.basarili, basarisiz: n.basarisiz, atlanan: n.atlanan };
      })
      .slice()
      .reverse(); // en yeni koşu en üstte

    var ozetAlani = document.getElementById('secimOzetiKosu');
    ozetAlani.textContent = kosular.length + ' koşu';

    var govde = document.getElementById('kosuGecmisiGovdesi');
    var sayfalamaAlani = document.getElementById('kosuGecmisiSayfalama');

    if (kosular.length === 0) {
      govde.innerHTML = '<tr><td colspan="6">Seçilen tarih aralığında koşu yok</td></tr>';
      sayfalamaAlani.innerHTML = '';
      return;
    }

    var toplamSayfa = Math.max(1, Math.ceil(kosular.length / KOSU_GECMISI_SAYFA_BOYUTU));
    if (kosuGecmisiSayfa > toplamSayfa) kosuGecmisiSayfa = toplamSayfa;
    if (kosuGecmisiSayfa < 1) kosuGecmisiSayfa = 1;

    var baslangicIdx = (kosuGecmisiSayfa - 1) * KOSU_GECMISI_SAYFA_BOYUTU;
    var sayfaKosulari = kosular.slice(baslangicIdx, baslangicIdx + KOSU_GECMISI_SAYFA_BOYUTU);

    govde.innerHTML = sayfaKosulari
      .map(function (k) {
        var toplam = k.basarili + k.basarisiz + k.atlanan;
        var oran = toplam > 0 ? Math.round((k.basarili / toplam) * 100) : 0;
        var barRengi = oran >= 80 ? 'var(--good)' : oran >= 50 ? 'var(--warning)' : 'var(--critical)';
        return (
          '<tr>' +
          '<td>' + escapeHtml(k.etiket) + '</td>' +
          '<td class="num">' + toplam + '</td>' +
          '<td class="num">' + k.basarili + '</td>' +
          '<td class="num">' + k.basarisiz + '</td>' +
          '<td class="num">' + k.atlanan + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + oran + '%;background:' + barRengi + '"></div></div><span>%' + oran + '</span></div></td>' +
          '</tr>'
        );
      })
      .join('');

    sayfalamaAlani.innerHTML =
      '<button type="button" id="kosuGecmisiOnceki"' + (kosuGecmisiSayfa <= 1 ? ' disabled' : '') + '>Önceki</button>' +
      '<span class="sayfa-bilgi">Sayfa ' + kosuGecmisiSayfa + ' / ' + toplamSayfa + '</span>' +
      '<button type="button" id="kosuGecmisiSonraki"' + (kosuGecmisiSayfa >= toplamSayfa ? ' disabled' : '') + '>Sonraki</button>';

    var oncekiDugme = document.getElementById('kosuGecmisiOnceki');
    var sonrakiDugme = document.getElementById('kosuGecmisiSonraki');
    if (oncekiDugme) oncekiDugme.addEventListener('click', function () { kosuGecmisiSayfa--; kosuGecmisiniGuncelle(); });
    if (sonrakiDugme) sonrakiDugme.addEventListener('click', function () { kosuGecmisiSayfa++; kosuGecmisiniGuncelle(); });
  }

  // Seçim (GENEL <-> ürün) her değiştiğinde ekranın tamamını tutarlı şekilde günceller.
  function secimGuncellendi() {
    urunNavCiz();
    document.getElementById('anaBaslik').textContent = secilenUrun === GENEL ? 'Genel Bakış' : secilenUrun;
    document.getElementById('secilenUrunBasligi').textContent = secilenUrun === GENEL ? 'Hata kalıpları' : 'Hata kalıpları — ' + secilenUrun;
    istatKartlariniGuncelle();
    trendGrafiginiGuncelle();
    kosuGecmisiSayfa = 1;
    kosuGecmisiniGuncelle();
    ikinciBolumuCiz();
    tabloyuGuncelle();
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
    var ozetAlani = document.getElementById('secimOzeti');
    var genelMi = secilenUrun === GENEL;

    var aralik = secilenTarihAraligi('baslangicTarihi', 'bitisTarihi');

    var urunKayitlari = VERI.kayitlar.filter(function (k) {
      return (genelMi || k.u === secilenUrun) && k.z >= aralik.baslangicMs && k.z <= aralik.bitisMs;
    });

    var basarili = 0, basarisiz = 0, atlanan = 0;
    var kalipSayaclari = {}; // 'urun|||kategori|||kalip' -> { adet, urun, kategori, kalip }
    var kategoriSayaclari = {}; // kategori -> adet
    urunKayitlari.forEach(function (k) {
      if (k.d === 'basarili') basarili++;
      else if (k.d === 'atlanan') atlanan++;
      else {
        basarisiz++;
        var anahtar = k.u + '|||' + k.k + '|||' + k.p;
        if (!kalipSayaclari[anahtar]) kalipSayaclari[anahtar] = { adet: 0, urun: k.u, kategori: k.k, kalip: k.p };
        kalipSayaclari[anahtar].adet++;
        kategoriSayaclari[k.k] = (kategoriSayaclari[k.k] || 0) + 1;
      }
    });

    ozetAlani.textContent = urunKayitlari.length + ' kayıt (Başarılı ' + basarili + ' · Başarısız ' + basarisiz + ' · Atlanan ' + atlanan + ')';
    kategoriDonutunuCiz(kategoriSayaclari, basarisiz);

    var siraliKaliplar = Object.keys(kalipSayaclari)
      .map(function (anahtar) { return kalipSayaclari[anahtar]; })
      .sort(function (a, b) { return b.adet - a.adet; });

    if (siraliKaliplar.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Seçilen tarih aralığında başarısız test yok. 🎉</div>';
      return;
    }

    alan.innerHTML = siraliKaliplar
      .map(function (s, i) {
        var ornekAnahtari = s.urun + '|||' + s.kategori + '|||' + s.kalip;
        var ornek = VERI.ornekler[ornekAnahtari];
        var govdeIcerik = '';
        if (ornek) {
          govdeIcerik += '<div class="hata-ornek-etiket">Örnek: ' + escapeHtml(ornek.b) + (ornek.oz ? ' (' + escapeHtml(ornek.oz) + ')' : '') + ' — en son görülme: ' + escapeHtml(ornek.t) + '</div>';
          if (ornek.m) govdeIcerik += '<pre class="hata-mesaj">' + escapeHtml(ornek.m) + '</pre>';
          if (ornek.g) govdeIcerik += '<img class="hata-goruntu" src="' + ornek.g + '" alt="Hata anı ekran görüntüsü" />';
          else govdeIcerik += '<div class="bos-durum">Bu kalıp için ekran görüntüsü bulunamadı.</div>';
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
  }

  // Sayfa açılışı: varsayılan ekran GENEL (tüm ürünlerin özeti).
  tarihSinirlariniAyarla('baslangicTarihi', 'bitisTarihi');
  tarihSinirlariniAyarla('baslangicTarihiKosu', 'bitisTarihiKosu');
  secimGuncellendi();

  document.getElementById('baslangicTarihi').addEventListener('change', tabloyuGuncelle);
  document.getElementById('bitisTarihi').addEventListener('change', tabloyuGuncelle);
  document.getElementById('tumZamanlarButonu').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihi', 'bitisTarihi');
    tabloyuGuncelle();
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
</script>
</body>
</html>`;

const htmlDosyaYolu = join(process.cwd(), `dashboard-${ortam}.html`);
writeFileSync(htmlDosyaYolu, html, 'utf-8');
console.log(`Dashboard sayfası yazıldı: ${htmlDosyaYolu}`);
