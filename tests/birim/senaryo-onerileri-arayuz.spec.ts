// UÇTAN UCA (yerel) — Senaryolar > ekran > "Senaryo önerileri" (senaryo tasarım yardımcısı): kapsam paneli (ölçüye tıklayınca
// eksikler), gerekçesi görünen sıralı öneri listesi (tür / neden rozeti, puan, "Daha fazla göster"), "Reddet" (neden isteğe bağlı;
// karar kaydedilir, öneri gizlenir), "Önizle" (formda doldurulmuş; kaydetmez), seçilenleri "Senaryo olarak ekle" (doğrulayıcıdan
// geçer; "Koşuda" KAPALI; beklenen sonucu belirsiz olan eklenmez; kabul kaydedilir; eklenen yeniden önerilmez), ikili kombinasyon
// alan seçimi; masaüstü ve 390px'te taşma yok. Ayrı Nöbetçi (127.0.0.1), geçici veritabanı; dış istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { MESAJLAR } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { EKRAN_ADI, siparisPaketi, tabanVerisi } from './senaryo-onerileri-fikstur';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Oneri-${randomBytes(6).toString('hex')}`;
const EKRAN_KLASORU = process.env.SENARYO_ONERILERI_EKRAN_KLASORU;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortamId = '';
let ekranId = '';

const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
const senaryolar = async () => ((await basarili(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[]).filter((s) => s.ekranId === ekranId);
/** Bugünden 5 gün sonrası (gg.aa.yyyy). */
const tarih = () => { const t = new Date(); t.setDate(t.getDate() + 5); return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`; };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'senaryo-onerileri-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Öneri Projesi' })).proje.id);
  ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: siparisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  ekranId = String(liste.ekranlar.find((e) => e.ad === EKRAN_ADI)?.id);
  await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik: 'Kitap siparişi', veri: tabanVerisi(tarih()), ortamIdleri: [ortamId], kosuyaDahil: true });
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function onerileriAc(page: Page): Promise<void> {
  await page.goto(`/#/senaryolar/u/${ekranId}`);
  await page.getByRole('link', { name: 'Senaryo önerileri' }).click();
  await expect(page.getByRole('heading', { name: 'Senaryo önerileri', level: 2 })).toBeVisible();
}
const oneri = (page: Page, baslik: string) => page.locator('li.oneri').filter({ has: page.getByText(baslik, { exact: true }) });
const baglamOku = async () => basarili(`/platform/senaryo/oneri-baglami?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`);
/** Öneri görünene dek "Daha fazla göster". */
async function gorunurKil(page: Page, baslik: string): Promise<void> {
  for (let i = 0; i < 10 && !(await oneri(page, baslik).count()); i++) await page.getByRole('button', { name: /^Daha fazla göster/ }).click();
  await expect(oneri(page, baslik)).toBeVisible();
}

test('kapsam paneli ve gerekçeli liste; reddet kaydedilir; önizleme kaydetmez; eklenenler "Koşuda" kapalı ve yeniden önerilmez', async () => {
  test.setTimeout(90_000);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await onerileriAc(page);
  await expect(page.getByRole('note').filter({ hasText: 'Öneriler yalnızca öneridir.' })).toBeVisible();
  await expect(page.getByText('Taban: “Kitap siparişi”')).toBeVisible();

  // Kapsam: dört ölçü; tıklayınca eksikler.
  const kapsam = page.getByRole('region', { name: 'Kapsam' });
  await expect(kapsam.locator('.kapsam-olcusu')).toHaveCount(4);
  const alanlar = kapsam.getByRole('button', { name: /Alanlar/ });
  await expect(alanlar).toContainText('6 / 11');
  await alanlar.click();
  await expect(alanlar).toHaveAttribute('aria-expanded', 'true');
  await expect(kapsam.getByRole('list', { name: 'Alanlar: eksikler' })).toContainText('Sipariş notu');
  await kapsam.getByRole('button', { name: /Koşul dalları/ }).click();
  await expect(kapsam.getByRole('list', { name: 'Koşul dalları: eksikler' })).toContainText('Kategori = Giyim');
  await expect(kapsam.getByRole('button', { name: /Görülen uyarılar/ })).toContainText('—');

  // Liste: en çok 10, her satırda gerekçe; ilk sıradakiler kapsam boşluğu (denenmemiş dal içeren ikili satırı).
  const liste = page.getByRole('list', { name: 'Öneriler' });
  await expect(liste.locator('li.oneri')).toHaveCount(10);
  for (const g of await liste.locator('.oneri-gerekcesi').allTextContents()) expect(g.trim()).not.toBe('');
  await expect(liste.locator('li.oneri').first().locator('.oneri-gerekcesi')).toContainText(/dall?a?r?ı hiç denenmedi/);
  await expect(liste.locator('li.oneri').first()).toContainText('Kapsam boşluğu');
  await expect(liste.locator('li.oneri').first().locator('.oneri-puani')).toHaveText(/^puan \d+$/);
  await expect(page.getByText('5550001122')).toHaveCount(0);

  // Reddet: neden seçilir, karar kaydedilir, öneri listeden çıkar.
  const ilk = liste.locator('li.oneri').first();
  const ilkKimlik = String(await ilk.getAttribute('data-oneri'));
  const ilkBaslik = (await ilk.locator('.oneri-basligi').textContent())?.trim() ?? '';
  await ilk.getByRole('button', { name: `${ilkBaslik}: reddet` }).click();
  const redGrubu = page.getByRole('group', { name: `${ilkBaslik}: red nedeni` });
  await expect(redGrubu).toBeVisible();
  await redGrubu.getByRole('button', { name: 'Gereksiz' }).click();
  await expect(page.locator(`li.oneri[data-oneri="${ilkKimlik}"]`)).toHaveCount(0);
  await expect(page.locator('.oneri-elenen').filter({ hasText: '1 öneri reddedildi' })).toBeVisible();
  expect((await baglamOku()).kararlar).toContainEqual(expect.objectContaining({ kimlik: ilkKimlik, karar: 'red', redNedeni: 'gereksiz', ekranId }));
  // Reddedilenler istenirse işaretli görünür.
  await page.getByRole('button', { name: 'Reddedilenleri göster' }).click();
  await gorunurKil(page, ilkBaslik);
  await expect(page.locator(`li.oneri[data-oneri="${ilkKimlik}"] .rozet`, { hasText: 'reddedildi' })).toBeVisible();
  await page.getByRole('button', { name: 'Reddedilenleri gizle' }).click();

  // Önizle: formda doldurulmuş; bilerek boş; Koşuda kapalı; kaydedilmez.
  await gorunurKil(page, 'Zorunlu alan boş: Adet');
  await page.getByRole('button', { name: 'Zorunlu alan boş: Adet: önizle' }).click();
  await expect(page.getByRole('heading', { name: 'Yeni senaryo', level: 2 })).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'Öneri önizlemesi — kaydedilmedi.' })).toBeVisible();
  await expect(page.locator('[data-alan="urunAdi"] input[type="text"]')).toHaveValue('Roman');
  await expect(page.locator('[data-alan="adet"] input[type="number"]')).toBeDisabled();
  await expect(page.locator('[data-alan="adet"]')).toContainText(MESAJLAR.bilerekBos('Adet'));
  await expect(page.getByRole('switch', { name: 'Koşuda' })).not.toBeChecked();
  expect(await senaryolar()).toHaveLength(1);
  await page.getByRole('button', { name: 'Önerilere dön' }).click();
  await expect(page.getByRole('heading', { name: 'Senaryo önerileri', level: 2 })).toBeVisible();

  // Seç ve ekle: ikisi eklenir; beklenen sonucu belirsiz olan atlanır ve nedeni yazar; kabul kararları kaydedilir.
  const secilecekler = ['Zorunlu alan boş: Adet', 'Sınır: Adet = 10 (üst sınır)', 'Zorunlu alan boş: Teslimat tarihi'];
  for (const b of secilecekler) {
    await gorunurKil(page, b);
    await page.getByRole('checkbox', { name: `${b}: seç` }).check();
  }
  await expect(page.getByRole('region', { name: 'Seçilen öneriler' })).toContainText('3 öneri seçili');
  await page.getByRole('button', { name: 'Senaryo olarak ekle' }).click();
  const durum = page.locator('.not-kutusu[role="status"]');
  await expect(durum).toContainText('2 senaryo eklendi; "Koşuda" kapalı');
  await expect(durum.getByRole('list', { name: 'Eklenmeyen öneriler' })).toContainText('Zorunlu alan boş: Teslimat tarihi: beklenen sonucu siz seçin');
  const kayitli = await senaryolar();
  expect(kayitli.map((x) => x.baslik).sort()).toEqual(['Kitap siparişi', 'Sınır: Adet = 10 (üst sınır)', 'Zorunlu alan boş: Adet']);
  for (const x of kayitli.filter((y) => y.baslik !== 'Kitap siparişi')) expect(x.kosuyaDahil, x.baslik).toBe(false);
  const adet = (await basarili(`/platform/senaryo?id=${kayitli.find((x) => x.baslik === 'Zorunlu alan boş: Adet')?.id}&ortamId=${ortamId}`)).senaryo;
  expect(adet.veri).toMatchObject({ bilerekBos: ['adet'], beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'urun', mesaj: 'Lütfen adet giriniz.' } });
  const kararlar = (await baglamOku()).kararlar as Nesne[];
  expect(kararlar.filter((k) => k.karar === 'kabul').map((k) => k.kimlik).sort()).toEqual(['sinir:adet:10', 'zorunlu:adet']);
  // Eklenenler yeni bir şey kapsamadığı için artık önerilmez; belirsiz olan seçili kalır.
  for (let i = 0; i < 5; i++) if (await page.getByRole('button', { name: /^Daha fazla göster/ }).count()) await page.getByRole('button', { name: /^Daha fazla göster/ }).click();
  await expect(oneri(page, 'Zorunlu alan boş: Adet')).toHaveCount(0);
  await expect(oneri(page, 'Sınır: Adet = 10 (üst sınır)')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Zorunlu alan boş: Teslimat tarihi: seç' })).toBeChecked();

  // İkili kombinasyon alanları: varsayılan seçili; alan çıkarınca özet değişir, "Varsayılana dön".
  const kombinasyon = page.getByRole('group', { name: 'Kombinasyon alanları' });
  await expect(kombinasyon.getByRole('checkbox', { name: /Kategori/ })).toBeChecked();
  const onceki = await page.locator('.kombinasyon-ozeti').textContent();
  await kombinasyon.getByRole('checkbox', { name: /Beden/ }).uncheck();
  await expect(page.locator('.kombinasyon-ozeti')).not.toHaveText(String(onceki));
  await expect(page.locator('.kombinasyon-ozeti')).toContainText('mevcut senaryolarda denenmiş');
  await page.getByRole('button', { name: 'Varsayılana dön' }).click();
  await expect(kombinasyon.getByRole('checkbox', { name: /Beden/ })).toBeChecked();
  expect(hatalar).toEqual([]);
  await baglam.close();
});

test('masaüstü ve 390px: sayfa yatay kaymaz; öneri satırları, kapsam paneli ve red paneli taşmaz', async () => {
  test.setTimeout(60_000);
  for (const [genislik, yukseklik] of [[1400, 900], [390, 844]] as const) {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    const page = await baglam.newPage();
    await onerileriAc(page);
    await expect(page.locator('li.oneri').first()).toBeVisible();
    await page.getByRole('region', { name: 'Kapsam' }).getByRole('button', { name: /İkili kombinasyonlar/ }).click();
    await page.locator('li.oneri').first().getByRole('button', { name: /: reddet$/ }).click();
    await expect(page.locator('.oneri-red-paneli')).toBeVisible();
    const olcum = await page.evaluate(() => {
      const tasan = [...document.querySelectorAll('li.oneri, .oneri-eylem-cubugu, .kombinasyon-karti, .oneri-grubu, .sayfa-basligi, .kapsam-paneli, .kapsam-olcusu, .oneri-red-paneli')]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1)
        .map((e) => `${e.className} sag=${Math.round(e.getBoundingClientRect().right)} sw=${e.scrollWidth} cw=${e.clientWidth}`);
      return { sayfa: document.documentElement.scrollWidth - innerWidth, tasan };
    });
    expect(olcum.sayfa, `${genislik}px sayfa taşması`).toBeLessThanOrEqual(2);
    expect(olcum.tasan, `${genislik}px taşan öğe`).toEqual([]);
    if (EKRAN_KLASORU) await page.screenshot({ path: join(EKRAN_KLASORU, `senaryo-onerileri-${genislik}.png`), fullPage: true });
    await baglam.close();
  }
});
