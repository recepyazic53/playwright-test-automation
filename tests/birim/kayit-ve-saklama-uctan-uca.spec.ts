// UÇTAN UCA (yerel) — KAYIT VE SAKLAMA: Nöbetçi'nin koşu ucundan (/platform/senaryolar/calistir) gerçek yapılandırmayla
// (playwright.config.ts + model koşucusu + raporlayıcı) başarılı ve kalan senaryo koşulur; Ayarlar > Koşu > Kayıt seçimleri
// (adım ekran görüntüsü: her / yalnız kalan / seçili / kapalı; senaryonun kendi seçimi; video boyutu) sonuçta doğru medyayı
// bırakır. Kademeli saklama sonrası sonuç ekranı "saklama süresi doldu" ve "görüntü alınamadı" notlarını gösterir. Ayarlar,
// senaryo formu ve akış tasarımı arayüzü masaüstünde ve 390 px'te taşmasız.
// Güvenlik: yalnızca 127.0.0.1'deki örnek başvuru fikstürü (model-fikstur.ts); ayrı bir Nöbetçi geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { medyaInceltme } from '../../scripts/platform/medya.mjs';
import { KALAN_ADIM_EKI, medyaSinifi } from '../../scripts/platform/ayarlar/kayit-kurallari.mjs';
import { yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
type Medya = { id: string; tur: string; ad: string; icerikTuru: string; silinme: string | null };
const PAROLA = `Gecici-Kayit-${randomBytes(6).toString('hex')}`;
const BASARILI = 'Yetkili / onay adımı hariç';
const KALAN = 'Merkez / Ekonomi taksitli (başarı beklenir → kalır)';

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let vtYolu = '';
let projeId = '';
let ortamId = '';
let ekranId = '';
const senaryolar = new Map<string, string>();
let tarayici: Browser;
/** Son koşulan başarılı / kalan sonuçların kimlikleri (arayüz ve saklama testleri için). */
const sonSonuc = new Map<string, string>();

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
async function kasayiAc(): Promise<void> { await basarili('/platform/kasa/ac', { parola: PAROLA }); }

/** Senaryoyu koşar; sonucun durumu ve medyası. */
async function kos(baslik: string): Promise<{ id: string; durum: string; medya: Medya[] }> {
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: senaryolar.get(baslik), ortamId });
  expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  sonSonuc.set(baslik, String(sonuc.id));
  return { id: String(sonuc.id), durum: String(sonuc.durum), medya: sonuc.medya as Medya[] };
}
const sinif = (m: Medya) => medyaSinifi({ ad: m.ad, icerikTuru: m.icerikTuru, tur: m.tur });
const adimlar = (medya: Medya[]) => medya.filter((m) => sinif(m) === 'adim').map((m) => m.ad);

/** Şifreli videonun (sunucudan çözülmüş) WebM genişlik / yüksekliği (PixelWidth 0xB0, PixelHeight 0xBA). */
async function videoBoyutu(m: Medya): Promise<{ genislik: number; yukseklik: number }> {
  const r = await fetch(`${nobetci.adres}/platform/medya/${encodeURIComponent(m.id)}`, { headers: { 'x-test-sunucu-token': nobetci.token } });
  expect(r.status).toBe(200);
  const b = Buffer.from(await r.arrayBuffer());
  const oku = (i: number): { deger: number; son: number } | null => {
    const uzunluk = b[i] & 0x80 ? 1 : b[i] & 0x40 ? 2 : 0;
    if (uzunluk !== 1) return null;
    const n = b[i] & 0x7f;
    if (n < 1 || n > 4) return null;
    let deger = 0;
    for (let k = 0; k < n; k++) deger = deger * 256 + b[i + 1 + k];
    return { deger, son: i + 1 + n };
  };
  for (let i = 0; i < Math.min(b.length - 8, 4096); i++) {
    if (b[i] !== 0xb0) continue;
    const g = oku(i + 1);
    if (!g || b[g.son] !== 0xba) continue;
    const y = oku(g.son + 1);
    if (y && g.deger >= 100 && y.deger >= 100) return { genislik: g.deger, yukseklik: y.deger };
  }
  throw new Error('Videonun boyutu okunamadı.');
}

async function sayfaAc(genislik = 1440, yukseklik = 1000): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(`pageerror: ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::|410|Gone/.test(m.text())) hatalar.push(`console: ${m.text()}`); });
  return { page, hatalar, kapat: () => baglam.close() };
}
/** Yatay taşma (px); taşma varsa taşan en içteki öğeler hata metnine yazılır. */
async function tasma(page: Page): Promise<number> {
  const d = await page.evaluate(() => {
    const tasanlar: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right <= window.innerWidth + 2 || r.width === 0) continue;
      let kap = el.parentElement; let kaydirilir = false;
      while (kap) { const s = getComputedStyle(kap); if (/(auto|scroll|hidden)/.test(s.overflowX) && kap.scrollWidth > kap.clientWidth) { kaydirilir = true; break; } kap = kap.parentElement; }
      if (kaydirilir) continue;
      if ([...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 2)) continue;
      const yol: string[] = [];
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) yol.unshift(`${p.tagName.toLowerCase()}.${[...p.classList].join('.')}`);
      tasanlar.push(`${yol.join(' > ')} (${Math.round(r.right)}px)`);
      if (tasanlar.length >= 5) break;
    }
    return { px: document.documentElement.scrollWidth - document.documentElement.clientWidth, tasanlar };
  });
  if (d.px > 0) console.log(`taşma ${d.px}px: ${d.tasanlar.join(', ')}`);
  return d.px;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  klasor = mkdtempSync(join(tmpdir(), 'kayit-saklama-'));
  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await kasayiAc();
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Kayıt Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  await basarili('/platform/giris-profili/kaydet', { projeId, ortamId, ad: 'Deneme kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI });
  await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() });
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
  // Modelde "Toplam hesaplanır" adımı "Ekran görüntüsü al" işaretli (seçili adımlarda yalnız bu adımın görüntüsü alınır).
  const paket = ornekBasvuruPaketi() as { model: { adimlar: Array<{ id: string; kosu?: Nesne }> } };
  const hesaplama = paket.model.adimlar.find((a) => a.id === 'hesaplama');
  if (hesaplama?.kosu) hesaplama.kosu.ekranGoruntusu = true;
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [4], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Array<{ id: string }>; senaryolar: Array<{ id: string; baslik: string }> };
  ekranId = liste.ekranlar[0].id;
  for (const s of liste.senaryolar) senaryolar.set(s.baslik, s.id);
  // Kalan senaryo: iş kuralına takılan değerler, beklenen sonuç başarı.
  const kalan = await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId, baslik: KALAN, ortamIdleri: [ortamId],
    veri: { urun: 'A', adSoyad: 'Kalan Kişi', baslangic: '2026-11-01', kampanya: false, subeProfili: 'Merkez', kapsam: 'EKONOMİ', odemeTipi: 'taksit', onayAdimiDahil: false }
  });
  senaryolar.set(KALAN, String(kalan.id));
  expect([...senaryolar.keys()].sort()).toEqual([KALAN, BASARILI].sort());
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('varsayılanlar (bugünkü davranış): her adımda görüntü, video her testte (küçük boyut), iz ve test sonu görüntüsü kalan testte', async () => {
  test.setTimeout(180_000);
  const b = await kos(BASARILI);
  expect(b.durum).toBe('basarili');
  expect(adimlar(b.medya)).toEqual(expect.arrayContaining([expect.stringContaining('Sisteme giriş yapıldı'), expect.stringContaining('Ekran açıldı'), expect.stringContaining('Toplam hesaplanır')]));
  expect(b.medya.some((m) => sinif(m) === 'video')).toBe(true);
  expect(b.medya.some((m) => sinif(m) === 'iz')).toBe(false);
  // Küçük (varsayılan): Playwright 800 px'e sığdırır.
  const boyut = await videoBoyutu(b.medya.find((m) => sinif(m) === 'video') as Medya);
  expect(boyut.genislik).toBeLessThanOrEqual(800);
  const k = await kos(KALAN);
  expect(k.durum).toBe('basarisiz');
  expect(k.medya.filter((m) => sinif(m) === 'kalanAdim')).toEqual([]);
  for (const s of ['video', 'iz', 'testSonu'] as const) expect(k.medya.some((m) => sinif(m) === s), s).toBe(true);
});

test('yalnız kalan adımda + video ekranla aynı: başarılıda adım görüntüsü yok, kalanda yalnız kalan adımın görüntüsü; video koşu ekran boyutunda', async () => {
  test.setTimeout(180_000);
  await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { adimGoruntusu: 'yalnizKalan', videoBoyutu: 'ekran' } });
  const b = await kos(BASARILI);
  expect(b.durum).toBe('basarili');
  expect(adimlar(b.medya)).toEqual([]);
  expect(b.medya.filter((m) => sinif(m) === 'kalanAdim')).toEqual([]);
  expect(await videoBoyutu(b.medya.find((m) => sinif(m) === 'video') as Medya)).toEqual({ genislik: 1280, yukseklik: 720 });
  const k = await kos(KALAN);
  expect(k.durum).toBe('basarisiz');
  expect(adimlar(k.medya)).toEqual([]);
  expect(k.medya.filter((m) => sinif(m) === 'kalanAdim').map((m) => m.ad)).toEqual([`01 - Toplam hesaplanır${KALAN_ADIM_EKI}`]);
});

test('seçili adımlarda: yalnız modelde işaretli adımın görüntüsü; kapalı: hiç; senaryonun kendi seçimi ayarı ezer', async () => {
  test.setTimeout(240_000);
  await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { adimGoruntusu: 'secili', videoBoyutu: 'kucuk' } });
  const b = await kos(BASARILI);
  expect(adimlar(b.medya)).toEqual(['01 - Toplam hesaplanır']);
  const k = await kos(KALAN);
  expect(adimlar(k.medya)).toEqual([]); // işaretli adım kaldı: başarılı adım görüntüsü alınmadı
  await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { adimGoruntusu: 'kapali' } });
  expect(adimlar((await kos(BASARILI)).medya)).toEqual([]);
  // Senaryo "Her adımda" seçerse ayar kapalı olsa da her adımın görüntüsü alınır; geçersiz seçim reddedilir.
  const kaydet = (adimGoruntusu: string) => api('/platform/senaryo/kaydet', { id: senaryolar.get(BASARILI), projeId, baslik: BASARILI, adimGoruntusu });
  expect((await kaydet('bazen')).basarili).toBe(false);
  expect((await kaydet('her')).basarili).toBe(true);
  expect(((await api(`/platform/senaryo?id=${senaryolar.get(BASARILI)}&ortamId=${ortamId}`)).senaryo as Nesne).adimGoruntusu).toBe('her');
  expect(adimlar((await kos(BASARILI)).medya).length).toBeGreaterThanOrEqual(3);
  expect((await kaydet('ayar')).basarili).toBe(true);
  await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { adimGoruntusu: 'her' } });
});

test('arayüz: Ayarlar > Koşu (Kayıt) ve Yedekleme (Sonuç saklama) — seçenekler, pasif alanlar, kayıt; senaryo formu; akış tasarımı işareti; masaüstü ve 390 px', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const { page, hatalar, kapat } = await sayfaAc();
  await page.goto('/#/ayarlar/kosu');
  const form = page.getByRole('form', { name: 'Koşu ayarları' });
  await expect(form.getByLabel('Video', { exact: true }).locator('option')).toHaveText(['Her testte', 'Yalnız başarılı testlerde', 'Yalnız kalan testlerde', 'Kapalı']);
  await expect(form.getByLabel('Adım ekran görüntüleri')).toHaveValue('her');
  await expect(form.getByLabel('Video boyutu')).toHaveValue('kucuk');
  await expect(form.getByLabel('İz (trace)')).toHaveValue('yalnizHata');
  await expect(form.locator('.alan').filter({ has: page.getByLabel('İz (trace)') }).locator('.yardim')).toContainText('ağ istekleri');
  await form.getByLabel('İz (trace)').selectOption('yalnizBasari');
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
  expect(((await api('/platform/kosu-ayarlari')).ayarlar as Nesne).iz).toBe('yalnizBasari');
  expect(await tasma(page)).toBeLessThanOrEqual(0);

  await page.goto('/#/ayarlar/yedekleme');
  const saklama = page.getByRole('form', { name: /Saklama|Yedekleme/ }).filter({ has: page.getByLabel('Eski sonuçlarda medyayı incelt') });
  const secim = saklama.getByLabel('Eski sonuçlarda medyayı incelt');
  const gun = saklama.getByLabel('Medyayı incelt: şu günden eski (gün)');
  const koru = saklama.getByLabel(/kalan adımın görüntüsünü ve test sonu görüntüsünü koru/);
  await expect(secim).toHaveValue('kapali');
  await expect(gun).toBeDisabled();
  await expect(koru).toBeDisabled();
  await expect(koru).toBeChecked();
  await secim.selectOption('basarili');
  await expect(gun).toBeEnabled();
  await expect(koru).toBeDisabled();
  await secim.selectOption('hatali');
  await expect(koru).toBeEnabled();
  await gun.fill('45');
  await koru.uncheck();
  await saklama.getByRole('button', { name: 'Kaydet' }).click();
  await expect(saklama.locator('.not-kutusu, [role=status], .mesaj').filter({ hasText: /kaydedildi/i }).first()).toBeVisible();
  expect((await api('/platform/kosu-ayarlari')).ayarlar).toMatchObject({ medyaInceltme: 'hatali', medyaInceltmeGun: 45, medyaInceltmeKoru: false });
  expect(await tasma(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('yedekleme-masaustu.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await tasma(page)).toBeLessThanOrEqual(0);
  await page.goto('/#/ayarlar/kosu');
  await expect(page.getByRole('form', { name: 'Koşu ayarları' })).toBeVisible();
  expect(await tasma(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('kosu-390.png'), fullPage: true });

  // Senaryo formu: "Adım ekran görüntüleri" (varsayılan Ayarlara uy).
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(String(senaryolar.get(BASARILI)))}`);
  const adimSecimi = page.getByLabel('Adım ekran görüntüleri');
  await expect(adimSecimi).toHaveValue('ayar');
  await expect(adimSecimi.locator('option')).toHaveText(['Ayarlara uy (varsayılan)', 'Her adımda', 'Yalnız kalan adımda', 'Seçili adımlarda', 'Kapalı']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await tasma(page)).toBeLessThanOrEqual(0);

  // Akış tasarımı: modeldeki işaret "Toplam hesaplanır" bloğunda işaretli görünür.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
  await page.getByRole('button', { name: 'Düzenle' }).first().click();
  const isaretler = page.locator('.goruntu-isareti input[type=checkbox]');
  await expect(isaretler.first()).toBeAttached();
  const blok = page.getByRole('listitem', { name: /Alan grubu \(Toplam hesaplanır\)/ });
  await expect(blok.getByRole('checkbox', { name: 'Ekran görüntüsü al (seçili adımlarda)' })).toBeChecked();
  expect(await page.locator('.goruntu-isareti input:checked').count()).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await tasma(page)).toBeLessThanOrEqual(0);
  expect(hatalar, hatalar.join('\n')).toEqual([]);
  await kapat();
});

test('kademeli saklama sonrası sonuç ekranı: silinen görüntüler "saklama süresi doldu", alınamayan görüntü notu; sonuç ve adımlar duruyor; 390 px', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const id = String(sonSonuc.get(BASARILI));
  // Sunucu kapatılır (veritabanının tek sahibi); sahte saatle (40 gün sonra) inceltme ve bir "alınamadı" notu yazılır.
  nobetci.surec.kill('SIGTERM');
  await new Promise((r) => { if (nobetci.surec.exitCode !== null) r(null); else nobetci.surec.once('exit', r); });
  const vt = await veritabaniniHazirla(vtYolu);
  try {
    const s = medyaInceltme(vt, join(klasor, 'medya'), { secim: 'ikisi', gun: 30, koru: true, simdi: Date.now() + 40 * 86_400_000 });
    expect(s.silinenGoruntu).toBeGreaterThan(0);
    vt.calistir(`INSERT INTO medya (id, sonuc_id, sira, tur, ad, icerik_turu, boyut, dosya, olusturulma) VALUES (?, ?, 99, 'diger', ?, 'text/plain', 10, ?, ?)`,
      [randomUUID(), id, '09 - Başvuru bilgileri girilir (ekran görüntüsü alınamadı: 15 sn süre sınırı doldu)', `${randomBytes(16).toString('hex')}.medya`, new Date().toISOString()]);
  } finally { vt.kapat(); }
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await kasayiAc();
  const { page, hatalar, kapat } = await sayfaAc();
  await page.goto(`/#/sonuclar/sonuc/${encodeURIComponent(id)}`);
  const notlar = page.getByRole('list', { name: 'Medya notları' });
  await expect(notlar).toContainText('saklama süresi dolduğu için');
  await expect(notlar).toContainText('Görüntü alınamadı: 15 sn süre sınırı doldu — 09 - Başvuru bilgileri girilir');
  // Sonuç ve adımlar duruyor; silinen görüntüler ızgarada yok (kırık resim yok).
  await expect(page.getByRole('heading', { name: /Ekran görüntüleri \(0\)/ })).toBeVisible();
  await expect(page.locator('.gorsel-izgarasi img')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('Toplam hesaplanır');
  expect(await tasma(page)).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await tasma(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('sonuc-saklama-390.png'), fullPage: true });
  expect(hatalar, hatalar.join('\n')).toEqual([]);
  await kapat();
});
