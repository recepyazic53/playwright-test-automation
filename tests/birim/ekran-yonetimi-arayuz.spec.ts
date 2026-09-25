// ENTEGRASYON (yerel) — Nöbetçi arayüzü: Ekranlar > ⋯ menüsü (yeniden adlandır, düzenle, taşı, devre dışı bırak /
// etkinleştir, kalıcı sil + test kodunu kaldır), Senaryolar'da devre dışı ekranlar ve Sonuçlar'da "silinmiş ekran".
// Geçici bir veritabanı (SAHTE örnek dosyalardan aktarılmış) ile AYRI bir Nöbetçi sunucusu örneği başlatılır
// (TEST_SUNUCU_PORT: 5579 boşsa o, değilse boş bir port; TEST_SUNUCU_KOSU_KAPALI=1: hiçbir test koşusu başlatılamaz).
// KOD KÖKÜ geçicidir: deponun tests/scenarios klasörünün GEÇİCİ bir kopyası (NOBETCI_KOD_KOKU) — kod kaldırma yalnızca
// kopyada denenir; gerçek tests/scenarios'a dokunulmadığı doğrulanır. Tüm istekler 127.0.0.1'dedir (şirket alan adı yok).
// EKRAN_YONETIMI_EKRAN_KLASORU verilirse koyu/açık tema ekran görüntüleri oraya yazılır.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { adaptorBul } from '../../projeler/index.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { korumaliTarayici, SIRKET_DESENI } from './giris-fikstur';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const EKRAN_KLASORU = process.env.EKRAN_YONETIMI_EKRAN_KLASORU;
const SATIS_SPEC = 'scenarios/jet-satis/urun-ekranlari.spec.ts';
const LISTE = [
  { dosya: SATIS_SPEC, ad: 'Ürün A ekranı açılmalı' },
  { dosya: SATIS_SPEC, ad: 'Ürün B ekranı açılmalı' },
  { dosya: 'scenarios/trafik/jet-trafik.spec.ts', ad: 'Trafik kod testi' }
];

function portBosMu(port: number): Promise<boolean> {
  return new Promise((coz) => {
    const s = createServer();
    s.once('error', () => coz(false));
    s.listen(port, '127.0.0.1', () => s.close(() => coz(true)));
  });
}
function bosPort(): Promise<number> {
  return new Promise((coz, reddet) => {
    const s = createServer();
    s.once('error', reddet);
    s.listen(0, '127.0.0.1', () => {
      const adres = s.address();
      const port = typeof adres === 'object' && adres ? adres.port : 0;
      s.close(() => coz(port));
    });
  });
}

type Nobetci = { adres: string; token: string; surec: ChildProcess };

async function nobetciBaslat(klasor: string, vtYolu: string, kodKoku: string): Promise<Nobetci> {
  const port = (await portBosMu(5579)) ? 5579 : await bosPort();
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|NOBETCI_)/.test(k)) continue;
    env[k] = v;
  }
  const surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
    cwd: KOK,
    env: {
      ...env, TEST_SUNUCU_PORT: String(port), TEST_SUNUCU_KOSU_KAPALI: '1', PLATFORM_VERITABANI: vtYolu, NOBETCI_KOD_KOKU: kodKoku,
      PLATFORM_YEDEK_KLASORU: join(klasor, 'yedekler'), TEST_SUNUCU_LOG_DOSYASI: join(klasor, 'sunucu.log')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const cikti: string[] = [];
  await new Promise<void>((coz, reddet) => {
    const zaman = setTimeout(() => reddet(new Error(`Nöbetçi başlamadı:\n${cikti.join('')}`)), 20_000);
    const dinle = (p: Buffer): void => {
      cikti.push(p.toString('utf8'));
      if (cikti.join('').includes('Nöbetçi hazır')) { clearTimeout(zaman); coz(); }
    };
    surec.stdout?.on('data', dinle);
    surec.stderr?.on('data', dinle);
    surec.once('exit', (kod) => { clearTimeout(zaman); reddet(new Error(`Nöbetçi kapandı (${kod}):\n${cikti.join('')}`)); });
  });
  const adres = `http://127.0.0.1:${port}`;
  const html = await (await fetch(`${adres}/`)).text();
  const token = /name="oturum-tokeni" content="([^"]+)"/.exec(html)?.[1] ?? '';
  expect(token, 'oturum token').not.toBe('');
  return { adres, token, surec };
}

async function api(n: Nobetci, yol: string, govde?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(`${n.adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: n.token }) }
    : { headers: { 'x-test-sunucu-token': n.token } });
  return (await r.json()) as Record<string, unknown>;
}

let tarayici: Browser;
let nobetci: Nobetci;
let klasor: ReturnType<typeof geciciKlasor>;
let kodKoku = '';
let projeId = '';
const gercekDosyalar = readdirSync(join(KOK, 'tests', 'scenarios'), { recursive: true }).map(String).sort();

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = geciciKlasor('ekran-yonetimi-arayuz');
  // Deponun tests/scenarios'unun GEÇİCİ kopyası (kod kaldırma yalnızca burada).
  kodKoku = join(klasor.yol, 'kod');
  cpSync(join(KOK, 'tests', 'scenarios'), join(kodKoku, 'tests', 'scenarios'), { recursive: true });
  const adaptor = adaptorBul('galaksi');
  if (!adaptor) throw new Error('galaksi adaptörü yok');
  const paket = await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => LISTE });
  const vtYolu = join(klasor.yol, 'platform.db');
  const parola = randomBytes(18).toString('base64url');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  projeId = aktarimiUygula(vt, paket).projeId;
  // Trafik'in (kod testi) ve JetKasko'nun bir senaryosuna geçmiş sonuç (silinince/devre dışıyken görünür kalsın diye).
  const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
  const konutSenaryosu = String(vt.tek("SELECT s.id FROM senaryolar s JOIN ekranlar e ON e.id = s.ekran_id WHERE e.anahtar = 'trafik' LIMIT 1")?.id ?? '');
  const kaskoSenaryosu = String(vt.tek("SELECT s.id FROM senaryolar s JOIN ekranlar e ON e.id = s.ekran_id WHERE e.anahtar = 'jet-kasko' LIMIT 1")?.id ?? '');
  kosuKaydet(vt, { id: 'kosu-ornek-1', projeId, ortamId, tur: 'tam', kapsam: 'Genel' });
  expect(konutSenaryosu && kaskoSenaryosu).toBeTruthy();
  for (const [senaryoId, durum] of [[konutSenaryosu, 'basarili'], [kaskoSenaryosu, 'basarisiz']] as const) {
    sonucKaydet(vt, { kosuId: 'kosu-ornek-1', projeId, senaryoId, senaryoBaslik: 'Örnek senaryo', durum, hataMesaji: durum === 'basarisiz' ? 'sahte hata' : null });
  }
  vt.kapat();
  nobetci = await nobetciBaslat(klasor.yol, vtYolu, kodKoku);
  expect((await api(nobetci, '/platform/kasa/ac', { parola })).basarili).toBe(true);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  klasor?.temizle();
  // Gerçek tests/scenarios hiç değişmedi.
  expect(readdirSync(join(KOK, 'tests', 'scenarios'), { recursive: true }).map(String).sort()).toEqual(gercekDosyalar);
});

async function arayuz(renk: 'dark' | 'light' = 'dark'): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, colorScheme: renk, viewport: { width: 1360, height: 1000 } });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}

function agKontrol(istekler: string[]): void {
  expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
}

async function ekranGoruntusu(page: Page, ad: string, hedef: Locator = page.locator('main')): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  await page.evaluate(() => { for (const b of document.querySelectorAll('.bildirim')) b.remove(); });
  for (const renk of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: renk });
    await page.waitForTimeout(200);
    await hedef.screenshot({ path: join(EKRAN_KLASORU, `${ad}-${renk === 'dark' ? 'koyu' : 'acik'}.png`), animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
}

/** Birden çok öğeyi kapsayan alanın ekran görüntüsü (ör. kart + açılır menü). */
async function alanGoruntusu(page: Page, ad: string, hedefler: Locator[]): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  const kutular = (await Promise.all(hedefler.map((h) => h.boundingBox()))).filter((k): k is NonNullable<typeof k> => k !== null);
  const x = Math.min(...kutular.map((k) => k.x)) - 12;
  const y = Math.min(...kutular.map((k) => k.y)) - 12;
  const clip = { x, y, width: Math.max(...kutular.map((k) => k.x + k.width)) - x + 12, height: Math.max(...kutular.map((k) => k.y + k.height)) - y + 12 };
  for (const renk of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: renk });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(EKRAN_KLASORU, `${ad}-${renk === 'dark' ? 'koyu' : 'acik'}.png`), clip, animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
}

const kart = (page: Page, ad: string) => page.locator('article.ekran-karti').filter({ has: page.getByRole('heading', { name: ad, exact: true }) });
async function menuAc(page: Page, ad: string): Promise<Locator> {
  await page.getByRole('button', { name: `Ekran işlemleri: ${ad}` }).first().click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

test('⋯ menüsü: yeniden adlandır, düzenle (URL yolu), yukarı taşı', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await expect(kart(page, 'JetDASK')).toBeVisible();
  await ekranGoruntusu(page, '01-ekran-listesi');
  const menu = await menuAc(page, 'JetSeyahat');
  await expect(menu.getByRole('menuitem')).toHaveText(['Yeniden adlandır', 'Düzenle (URL yolu)', 'Yukarı taşı', 'Aşağı taşı', 'Devre dışı bırak', 'Sil (kalıcı)…']);
  await alanGoruntusu(page, '02-menu', [kart(page, 'JetSeyahat'), menu]);

  // Yeniden adlandır (anahtar aynı kalır).
  await menu.getByRole('menuitem', { name: 'Yeniden adlandır' }).click();
  const ad = page.getByRole('dialog', { name: 'Yeniden adlandır' });
  await ad.getByLabel('Görünen ad').fill('JetKasko');
  await ad.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ad.getByRole('alert')).toHaveText(/başka bir ekran var/);
  await ad.getByLabel('Görünen ad').fill('Jet Seyahat Sağlık');
  await ad.getByLabel('Açıklama').fill('Seyahat sigortası satış ekranı');
  await ekranGoruntusu(page, '03-yeniden-adlandir', ad);
  await ad.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ekran adı "Jet Seyahat Sağlık" olarak kaydedildi.')).toBeVisible();
  await expect(kart(page, 'Jet Seyahat Sağlık').locator('code')).toHaveText('jet-seyahat');

  // Düzenle: URL yolu → yeni model sürümü.
  await (await menuAc(page, 'Jet Seyahat Sağlık')).getByRole('menuitem', { name: 'Düzenle (URL yolu)' }).click();
  const duzenle = page.getByRole('dialog', { name: /^Düzenle:/ });
  await duzenle.getByLabel('URL yolu').fill('https://ornek.invalid/x');
  await duzenle.getByRole('button', { name: 'Kaydet' }).click();
  await expect(duzenle.getByRole('alert')).toHaveText(/YOL girin/);
  await duzenle.getByLabel('URL yolu').fill('/yeni/seyahat/');
  await ekranGoruntusu(page, '04-duzenle', duzenle);
  await duzenle.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/URL yolu kaydedildi \(model v2\)/)).toBeVisible();
  await expect(kart(page, 'Jet Seyahat Sağlık')).toContainText('/yeni/seyahat/');

  // Yukarı taşı: kart ve sol liste sırası değişir.
  const once = await page.locator('article.ekran-karti').evaluateAll((l) => l.map((e) => e.getAttribute('data-ekran')));
  const ad2 = await page.locator('article.ekran-karti').nth(1).getByRole('heading').innerText();
  await (await menuAc(page, ad2)).getByRole('menuitem', { name: 'Yukarı taşı' }).click();
  await expect.poll(async () => page.locator('article.ekran-karti').first().getByRole('heading').innerText()).toBe(ad2);
  const sonra = await page.locator('article.ekran-karti').evaluateAll((l) => l.map((e) => e.getAttribute('data-ekran')));
  expect(sonra.slice(0, 2)).toEqual([once[1], once[0]]);
  await expect(page.getByRole('navigation', { name: 'Ekranlar' }).locator('a').nth(2)).toContainText(ad2);
  await page.context().close();
  agKontrol(istekler);
});

test('devre dışı bırak: sol listelerden gizlenir (anahtarla görünür), Senaryolar\'da koşulamaz, etkinleştirince geri gelir', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await (await menuAc(page, 'JetKasko')).getByRole('menuitem', { name: 'Devre dışı bırak' }).click();
  await expect(page.getByText('"JetKasko" devre dışı bırakıldı; senaryoları koşulara girmez.')).toBeVisible();
  await expect(kart(page, 'JetKasko').getByText('devre dışı')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Ekranlar' });
  await expect(nav.getByRole('link', { name: /JetKasko/ })).toHaveCount(0);
  await nav.getByText('Devre dışı ekranları göster').click();
  await expect(nav.getByRole('link', { name: /JetKasko/ })).toContainText('kapalı');
  await ekranGoruntusu(page, '05-devre-disi-liste');
  await nav.getByText('Devre dışı ekranları göster').click();

  // Ayrıntı: şerit + Etkinleştir, başlıkta ⋯.
  await kart(page, 'JetKasko').getByRole('link', { name: 'JetKasko' }).click();
  await expect(page.getByText('Bu ekran devre dışı.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekran işlemleri: JetKasko' })).toBeVisible();
  await ekranGoruntusu(page, '06-devre-disi-ayrinti', page.locator('.sayfa-basligi').locator('..'));

  // Senaryolar: ekran ve senaryoları gizli; anahtarla görünür, ▷ kapalı, Koşuyu başlat onları saymaz.
  await page.goto('/#/senaryolar');
  const sNav = page.getByRole('navigation', { name: 'Ürünler / ekranlar' });
  await expect(sNav.getByRole('link', { name: /JetKasko/ })).toHaveCount(0);
  await expect(page.locator('td.ekran-hucresi', { hasText: 'JetKasko' })).toHaveCount(0);
  await sNav.getByText('Devre dışı ekranları göster').click();
  await sNav.getByRole('link', { name: /JetKasko/ }).click();
  const satir = page.locator('tbody tr').first();
  await expect(satir.getByText('ekran devre dışı')).toBeVisible();
  await expect(satir.getByRole('button', { name: /^Çalıştır:/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Koşuyu başlat' })).toBeDisabled();
  await ekranGoruntusu(page, '07-senaryolar-devre-disi');
  await sNav.getByText('Devre dışı ekranları göster').click();

  // Sunucu da reddeder (▷ API).
  const liste = await api(nobetci, `/platform/senaryolar?projeId=${projeId}`) as { ortamId: string; senaryolar: Array<{ id: string; ekranAdi: string }> };
  const kasko = liste.senaryolar.find((s) => s.ekranAdi === 'JetKasko');
  const red = await api(nobetci, '/platform/senaryolar/calistir', { projeId, ortamId: liste.ortamId, senaryoId: kasko?.id, kosuId: 'k1' });
  expect(String(red.mesaj)).toMatch(/devre dışı/);

  // Sonuçlar: "devre dışı" etiketiyle görünür kalır.
  await page.goto('/#/sonuclar');
  await expect(page.getByRole('navigation', { name: 'Ürünler' }).getByRole('link', { name: /JetKasko/ })).toContainText('kapalı');

  await page.goto('/#/ekranlar');
  await page.getByRole('navigation', { name: 'Ekranlar' }).getByText('Devre dışı ekranları göster').click();
  await page.getByRole('navigation', { name: 'Ekranlar' }).getByRole('link', { name: /JetKasko/ }).click();
  await page.getByRole('button', { name: 'Etkinleştir' }).click();
  await expect(page.getByText('"JetKasko" etkinleştirildi.')).toBeVisible();
  await expect(page.getByText('Bu ekran devre dışı.')).toHaveCount(0);
  await page.context().close();
  agKontrol(istekler);
});

test('kalıcı sil + test kodunu kaldır (geçici kopyada): onay adı, sayılar, tam dosya listesi', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await (await menuAc(page, 'Jet Satış')).getByRole('menuitem', { name: 'Sil (kalıcı)…' }).click();
  const d = page.getByRole('dialog', { name: 'Ekranı kalıcı sil: Jet Satış' });
  await expect(d.locator('.onay-ozeti dd')).toHaveText(['0', '2', '0', '0']);
  await expect(d.getByText('Test kodu projede kalıyor.')).toBeVisible();
  await expect(d.getByLabel(/Geçmiş sonuçları da sil/)).toBeDisabled();
  const sil = d.getByRole('button', { name: 'Kalıcı olarak sil' });
  await expect(sil).toBeDisabled();
  await d.getByLabel(/Bu ekranın test kodu da projeden kaldırılsın/).check();
  await expect(d.locator('.kod-dosyalari li')).toHaveText(['tests/scenarios/jet-satis/urun-ekranlari.spec.ts']);
  await expect(d.getByText('tests/scenarios/jet-satis/', { exact: true })).toBeVisible();
  await expect(d.getByText('Test kodu projede kalıyor.')).toBeHidden();
  await d.getByLabel(/Onaylamak için/).fill('Jet satış');
  await expect(sil).toBeDisabled();
  await d.getByLabel(/Onaylamak için/).fill('Jet Satış');
  await expect(sil).toBeEnabled();
  await ekranGoruntusu(page, '08-sil-kod-kaldir', d);
  await sil.click();
  await expect(page.getByText(/"Jet Satış" silindi \(2 senaryo, 0 model sürümü, 1 test dosyası\)/)).toBeVisible();
  await expect(kart(page, 'Jet Satış')).toHaveCount(0);
  // Geçici koddan kaldırıldı; gerçek depo dosyası duruyor.
  expect(existsSync(join(kodKoku, 'tests', SATIS_SPEC))).toBe(false);
  expect(existsSync(join(kodKoku, 'tests', 'scenarios', 'jet-satis'))).toBe(false);
  expect(existsSync(join(KOK, 'tests', SATIS_SPEC))).toBe(true);
  // Kod kaldırıldı ve sonucu yok → mezar taşı kalmaz; kodu kaldırılmış uyarısı yok.
  const ekranlar = await api(nobetci, `/platform/ekranlar?projeId=${projeId}`) as { silinmisEkranlar: unknown[] };
  expect(ekranlar.silinmisEkranlar).toEqual([]);
  // (SAHTE listedeki başka ekranların başlıkları gerçek kodda olmadığı için onlar uyarı verebilir; Jet Satış vermez.)
  const denetim = await api(nobetci, '/platform/senaryolar/kod-denetimi', { projeId }) as { senaryolar: Array<{ dosya: string | null }> };
  expect(denetim.senaryolar.filter((x) => x.dosya?.includes('jet-satis'))).toEqual([]);
  await page.context().close();
  agKontrol(istekler);
});

test('kalıcı sil (sonuçlar korunur): "Silinmiş ekranlar" bölümü, Sonuçlar\'da "silinmiş ekran", geri yükle', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar/');
  await (await menuAc(page, 'Trafik')).getByRole('menuitem', { name: 'Sil (kalıcı)…' }).click();
  const d = page.getByRole('dialog', { name: 'Ekranı kalıcı sil: Trafik' });
  await expect(d.locator('.onay-ozeti dd').nth(2)).toHaveText('1');
  await expect(d.getByLabel(/Geçmiş sonuçları da sil/)).not.toBeChecked();
  await expect(d.getByText('Test kodu projede kalıyor.')).toBeVisible();
  await ekranGoruntusu(page, '09-sil-sonuclar-korunur', d);
  await d.getByLabel(/Onaylamak için/).fill('Trafik');
  await d.getByRole('button', { name: 'Kalıcı olarak sil' }).click();
  await expect(page.getByText(/"Trafik" silindi .* 1 geçmiş sonuç korundu\./)).toBeVisible();
  const bolum = page.locator('details.silinmis-ekranlar');
  await bolum.locator('summary').click();
  await expect(bolum.getByText('Trafik', { exact: true })).toBeVisible();
  await expect(bolum).toContainText('1 geçmiş sonuç korunuyor');
  await ekranGoruntusu(page, '10-silinmis-ekranlar', bolum);
  // Koddaki test dosyası geçici kopyada duruyor (kaldırılmadı).
  expect(existsSync(join(kodKoku, 'tests', 'scenarios', 'trafik', 'jet-trafik.spec.ts'))).toBe(true);

  await page.goto('/#/sonuclar');
  const urun = page.getByRole('navigation', { name: 'Ürünler' }).getByRole('link', { name: /Trafik/ });
  await expect(urun).toContainText('silinmiş');
  await urun.click();
  await expect(page.locator('.sayfa-basligi').getByText('silinmiş ekran')).toBeVisible();
  await expect(page.locator('.sayfa-basligi').getByRole('link', { name: 'Koşuyu başlat' })).toHaveCount(0);
  await ekranGoruntusu(page, '11-sonuclar-silinmis-ekran');

  await page.goto('/#/ekranlar');
  await page.locator('details.silinmis-ekranlar summary').click();
  await page.locator('details.silinmis-ekranlar').getByRole('button', { name: 'Geri yükle' }).click();
  await expect(page.getByText(/"Trafik" geri yüklendi/)).toBeVisible();
  await expect(kart(page, 'Trafik')).toBeVisible();
  await page.context().close();
  agKontrol(istekler);
});

test('API doğrulaması: token, kasa, geçersiz gövde, yol dışı dosya listesi', async () => {
  const r = await fetch(`${nobetci.adres}/platform/ekran/sil`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projeId }) });
  expect(r.status).toBe(401);
  const ekranlar = await api(nobetci, `/platform/ekranlar?projeId=${projeId}`) as { ekranlar: Array<{ id: string; ad: string }> };
  const seyahat = ekranlar.ekranlar.find((e) => e.ad === 'Jet Seyahat Sağlık');
  expect((await api(nobetci, '/platform/ekran/durum', { projeId, ekranId: seyahat?.id, etkin: 'evet' })).mesaj).toMatch(/true ya da false/);
  expect((await api(nobetci, '/platform/ekran/sil', { projeId, ekranId: seyahat?.id, onayAdi: 'Jet Seyahat Sağlık', koduKaldir: 'evet' })).mesaj).toMatch(/true ya da false/);
  expect((await api(nobetci, '/platform/ekran/sil', { projeId, ekranId: seyahat?.id, onayAdi: 'Jet Seyahat Sağlık', koduKaldir: true, beklenenDosyalar: ['tests/../../etc/passwd'] })).mesaj)
    .toMatch(/değişti; hiçbir şey silinmedi/);
  expect(existsSync(join(kodKoku, 'tests', 'scenarios', 'jet-seyahat', 'prim-hesaplama.spec.ts'))).toBe(true);
  const dask = seyahat;
  expect((await api(nobetci, '/platform/ekran/sil', { projeId, ekranId: '../x', onayAdi: 'x' })).mesaj).toMatch(/geçersiz/);
  await api(nobetci, '/platform/kasa/kilitle', {});
  const kilitli = await fetch(`${nobetci.adres}/platform/ekran/sil/onizle`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projeId, ekranId: dask?.id, token: nobetci.token }) });
  expect(kilitli.status).toBe(423);
});
