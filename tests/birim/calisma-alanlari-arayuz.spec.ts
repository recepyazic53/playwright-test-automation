// ENTEGRASYON (yerel) — Nöbetçi arayüzü: çalışma alanları ve aynı çalışma alanında birden çok proje.
// AYRI bir Nöbetçi sunucusu örneği GEÇİCİ bir veri köküyle başlatılır (NOBETCI_VERI_KOKU; TEST_SUNUCU_PORT: 5578 boşsa o,
// değilse boş bir port; TEST_SUNUCU_KOSU_KAPALI=1: hiçbir test koşusu başlatılamaz). Veri kökünde eski düzende bir
// platform.db (bir örnek proje) vardır: sunucu onu YERİNDE ilk çalışma alanı olarak kaydeder.
// Akışlar: kilit ekranı (ad + "Başka çalışma alanı"), aynı kasada yeni proje sihirbazı, proje değiştirme / yeniden
// adlandırma / varsayılan / silme, çalışma alanını kapat (dışa aktarmadan · dışa aktar ve kapat · değişiklik yok), yeni
// çalışma alanı, yanlış parola beklemesi, bu bilgisayardan kaldır. Tüm istekler 127.0.0.1'dedir (yasak örnek alan adı yok).
// CALISMA_ALANLARI_EKRAN_KLASORU verilirse koyu/açık tema ekran görüntüleri oraya yazılır.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, SIRKET_DESENI } from './giris-fikstur';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const EKRAN_KLASORU = process.env.CALISMA_ALANLARI_EKRAN_KLASORU;
const PAROLA_A = 'Arayuz-Alan-A-Parola-1';
const PAROLA_B = 'Arayuz-Alan-B-Parola-2';
const ILK_AD = 'Çalışma alanı 1';

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

type Nobetci = { adres: string; surec: ChildProcess };

async function nobetciBaslat(veriKoku: string, logKlasoru: string): Promise<Nobetci> {
  const port = (await portBosMu(5578)) ? 5578 : await bosPort();
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|NOBETCI_)/.test(k)) continue;
    env[k] = v;
  }
  const surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
    cwd: KOK,
    env: { ...env, TEST_SUNUCU_PORT: String(port), TEST_SUNUCU_KOSU_KAPALI: '1', NOBETCI_VERI_KOKU: veriKoku, TEST_SUNUCU_LOG_DOSYASI: join(logKlasoru, 'sunucu.log') },
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
  expect(cikti.join('')).toContain('yerinde ilk çalışma alanı olarak kaydedildi');
  return { adres: `http://127.0.0.1:${port}`, surec };
}

let tarayici: Browser;
let nobetci: Nobetci;
let klasor: ReturnType<typeof geciciKlasor>;
let veriKoku = '';
let page: Page;
const istekler: string[] = [];
const hatalar: string[] = [];
let ornekProjeAdi = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = geciciKlasor('calisma-alanlari-arayuz');
  veriKoku = join(klasor.yol, 'veri');
  mkdirSync(veriKoku, { recursive: true });
  // Eski düzen: <veri kökü>/platform.db (bir örnek proje + ortam) — sunucu açılışta yerinde ilk çalışma alanı yapar.
  const vt = await veritabaniniHazirla(join(veriKoku, 'platform.db'));
  await kasaOlustur(vt, PAROLA_A, { kdf: HIZLI_KDF });
  ornekProjeAdi = 'Örnek başvuru projesi';
  const projeId = projeKaydet(vt, { ad: ornekProjeAdi });
  ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://basvuru.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
  vt.kapat();
  nobetci = await nobetciBaslat(veriKoku, klasor.yol);
  tarayici = await korumaliTarayici();
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, colorScheme: 'dark', viewport: { width: 1360, height: 960 }, acceptDownloads: true });
  baglam.on('request', (r) => { istekler.push(r.url()); });
  page = await baglam.newPage();
  page.on('pageerror', (e) => hatalar.push(String(e)));
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  klasor?.temizle();
});

test.afterEach(() => {
  expect(hatalar, 'sayfa hataları').toEqual([]);
  // Yalnızca yerel sunucu; yasak örnek alan adına hiçbir istek yok.
  expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
});

async function goruntu(ad: string, hedef?: Locator, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  await page.evaluate(() => { for (const b of document.querySelectorAll('.bildirim')) b.remove(); });
  for (const renk of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: renk });
    await page.waitForTimeout(250);
    const yol = join(EKRAN_KLASORU, `${ad}-${renk === 'dark' ? 'koyu' : 'acik'}.png`);
    if (hedef) await hedef.screenshot({ path: yol, animations: 'disabled' });
    else await page.screenshot({ path: yol, animations: 'disabled', ...(clip ? { clip } : {}) });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
}

const diyalog = () => page.locator('dialog[open]');
const hesapMenusu = async (): Promise<Locator> => {
  await page.locator('.hesap-dugmesi').click();
  const menu = page.locator('.hesap-menusu .acilir-menu');
  await expect(menu).toBeVisible();
  return menu;
};
const projeMenusu = async (): Promise<Locator> => {
  await page.locator('.proje-secici').click();
  const menu = page.locator('.proje-menusu');
  await expect(menu).toBeVisible();
  return menu;
};

test('kilit ekranı çalışma alanının adını ve "Başka çalışma alanı"nı gösterir; kilidi açınca ana düzen + hesap menüsü', async () => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kasa kilitli' })).toBeVisible();
  await expect(page.locator('.kilit-alan-adi > span:last-child')).toHaveText(ILK_AD);
  await expect(page.getByRole('button', { name: 'Başka çalışma alanı' })).toBeVisible();
  await goruntu('01-kilit-ekrani');
  await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA_A);
  await page.getByRole('button', { name: 'Kilidi aç' }).click();
  await expect(page.locator('#proje-rozeti')).toHaveText(ornekProjeAdi);
  const menu = await hesapMenusu();
  await expect(menu.getByRole('menuitem')).toHaveText(['Kilitle', 'Yeniden adlandır', 'Çalışma alanını kapat…']);
  await goruntu('02-hesap-menusu', undefined, { x: 560, y: 0, width: 800, height: 240 });
  await page.keyboard.press('Escape');
});

test('aynı kasada yeni proje: sihirbaz (proje → ortamlar → giriş sorusu → proje hazır özeti; Evet → giriş tarifine geç)', async () => {
  const menu = await projeMenusu();
  await expect(menu.getByRole('menuitem', { name: 'Proje ekle' })).toBeVisible();
  await goruntu('03-proje-secici', undefined, { x: 0, y: 0, width: 760, height: 300 });
  await menu.getByRole('menuitem', { name: 'Proje ekle' }).click();
  await expect(page.getByRole('heading', { name: 'Yeni proje', level: 1 })).toBeVisible();
  // "Sizi tanıyalım" adımı yok: doğrudan proje; canlı ortam Ortamlar adımında "Ortam ekle" ile eklenir.
  await expect(page.locator('.adimlar li')).toHaveText(['Proje', 'Ortamlar', 'Giriş', 'Tamam']);
  await page.getByLabel('Proje adı').fill('İkinci proje');
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.getByLabel('Adres (link)').first().fill('https://ikinci.ornek.invalid');
  await page.getByRole('button', { name: 'Ortam ekle' }).click();
  await page.getByLabel('Ortam adı').nth(1).fill('CANLI');
  await page.locator('.ortam-satiri').nth(1).getByRole('radio', { name: 'Canlı' }).check();
  await page.getByLabel('Adres (link)').nth(1).fill('https://canli-ikinci.ornek.invalid');
  await page.getByRole('button', { name: 'Kaydet ve devam' }).click();
  // Giriş sorusu: Evet → Proje hazır'da birincil eylem giriş tarifi sayfası.
  await page.getByRole('radio', { name: /^Evet, giriş sayfası var/ }).check();
  await page.getByRole('button', { name: 'Devam' }).click();
  await expect(page.getByRole('heading', { name: 'Proje hazır' })).toBeVisible();
  const tarifeGec = page.getByRole('link', { name: 'Giriş tarifine geç' });
  await expect(tarifeGec).toHaveClass(/birincil/);
  await expect(tarifeGec).toBeFocused();
  await expect(tarifeGec).toHaveAttribute('href', /^#\/ayarlar\/giris\/tarif\/[0-9a-f-]{36}$/);
  await expect(page.locator('.ozet-ortamlar li')).toHaveCount(2);
  await expect(page.locator('.yapilacaklar-listesi')).toHaveCount(0);
  await goruntu('05-sihirbaz-tamam');
  await page.getByRole('button', { name: 'Ana sayfaya geç' }).click();
  await page.evaluate(() => { location.hash = '#/ayarlar/proje'; });
  await expect(page.locator('#proje-rozeti')).toHaveText('İkinci proje');
  // Kapsam: yeni projenin ortamı yalnızca kendisinde; Sonuçlar boş.
  await expect(page.locator('.kayit-listesi').filter({ hasText: 'ikinci.ornek.invalid' }).first()).toBeVisible();
});

type Kutu = { x: number; y: number; width: number; height: number };
const kesisir = (a: Kutu, b: Kutu): boolean =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
async function kutu(l: Locator): Promise<Kutu> {
  const k = await l.boundingBox();
  expect(k, 'öğe görünür olmalı').not.toBeNull();
  return k as Kutu;
}
/** Öğenin ortasındaki en üstteki öğe kendisi (ya da içindeki bir öğe) mi: başka bir katman tarafından örtülmüyor mu? */
const ortulmuyor = (l: Locator): Promise<boolean> => l.evaluate((e) => {
  const r = e.getBoundingClientRect();
  const ust = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return Boolean(ust && (ust === e || e.contains(ust)));
});
/** Sayfa yatayda taşmıyor. */
const yatayTasmaYok = (): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('proje seçici: ⋯ işlem satırı hiçbir satırı örtmez, 2 projede kaydırma yok, yan panel düğmesi avatarı örtmez; klavye', async () => {
  const menu = await projeMenusu();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(2);
  // 2 projede gereksiz dikey kaydırma yok.
  const kaydirma = async (): Promise<{ s: number; c: number }> => menu.evaluate((m) => ({ s: m.scrollHeight, c: m.clientHeight }));
  let o = await kaydirma();
  expect(o.s).toBeLessThanOrEqual(o.c);
  // Yan panelin "‹" düğmesi ilk projenin avatarını örtmez (liste üstte).
  const ilkAvatar = menu.locator('.proje-satiri .avatar').first();
  expect(await ortulmuyor(ilkAvatar)).toBe(true);
  const yanDugme = page.locator('.yan-panel-dugmesi');
  if (await yanDugme.isVisible()) {
    const y = await kutu(yanDugme);
    const ustte = await page.evaluate(({ x, yy }) => Boolean(document.elementFromPoint(x, yy)?.closest('.proje-menusu')), { x: y.x + y.width / 2, yy: y.y + y.height / 2 });
    if (kesisir(y, await kutu(menu))) expect(ustte, '"‹" düğmesi açık listenin altında kalmalı').toBe(true);
    expect(kesisir(y, await kutu(ilkAvatar)) && !ustte).toBe(false);
  }

  // İlk projenin ⋯: işlem satırı satırın altına açılır; ikinci proje, "Proje ekle" ve "Projeyi düzenle" görünür, örtülmez.
  const ilkDugme = menu.getByRole('button', { name: `Proje işlemleri: ${ornekProjeAdi}` });
  await ilkDugme.click();
  await expect(ilkDugme).toHaveAttribute('aria-expanded', 'true');
  const islem = menu.locator('.proje-islemleri:not([hidden])');
  await expect(islem).toHaveCount(1);
  await expect(islem.getByRole('menuitem')).toHaveCount(3);
  await expect(islem.getByRole('menuitem', { name: 'Sil (kalıcı)…' })).toBeVisible();
  await expect(islem.getByRole('menuitem', { name: 'Yeniden adlandır' })).toBeFocused();
  const islemKutusu = await kutu(islem);
  const digerleri = [
    menu.getByRole('menuitemradio', { name: 'İkinci proje' }),
    menu.getByRole('button', { name: 'Proje işlemleri: İkinci proje' }),
    menu.getByRole('menuitem', { name: 'Proje ekle' }),
    menu.getByRole('menuitem', { name: 'Projeyi düzenle' })
  ];
  for (const d of digerleri) {
    await expect(d).toBeVisible();
    expect(kesisir(islemKutusu, await kutu(d))).toBe(false);
    expect(await ortulmuyor(d)).toBe(true);
  }
  for (const b of await islem.getByRole('menuitem').all()) expect(await ortulmuyor(b)).toBe(true);
  o = await kaydirma();
  expect(o.s).toBeLessThanOrEqual(o.c);
  await goruntu('06a-proje-islem-satiri', undefined, { x: 0, y: 0, width: 760, height: 360 });

  // Klavye: ok tuşları açık işlem satırında gezer; Esc işlem satırını kapatır ve odak ⋯'e döner; ikinci Esc listeyi kapatır.
  await page.keyboard.press('ArrowDown');
  await expect(islem.locator('button:focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu.locator('.proje-islemleri:not([hidden])')).toHaveCount(0);
  await expect(ilkDugme).toBeFocused();
  await expect(ilkDugme).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: 'İkinci proje' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.proje-secici')).toBeFocused();

  // 390 px: liste ve işlem satırı ekrana sığar, sayfa yatayda taşmaz.
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    const dar = await projeMenusu();
    await dar.getByRole('button', { name: 'Proje işlemleri: İkinci proje' }).click();
    const darIslem = dar.locator('.proje-islemleri:not([hidden])');
    await expect(darIslem.getByRole('menuitem')).toHaveCount(3);
    const m = await kutu(dar);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(390);
    for (const b of await darIslem.getByRole('menuitem').all()) {
      const k = await kutu(b);
      expect(k.x).toBeGreaterThanOrEqual(m.x);
      expect(k.x + k.width).toBeLessThanOrEqual(m.x + m.width + 0.5);
    }
    await expect(dar.getByRole('menuitem', { name: 'Proje ekle' })).toBeVisible();
    expect(kesisir(await kutu(darIslem), await kutu(dar.getByRole('menuitem', { name: 'Proje ekle' })))).toBe(false);
    expect(await yatayTasmaYok()).toBe(true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dar).toBeHidden();
  } finally {
    await page.setViewportSize({ width: 1360, height: 960 });
  }
});

test('Ayarlar > Proje ve ortamlar > Projeler: satır düğmeleri (Ortamlar ile aynı biçim), Sil diyaloğu açılır ve iptal edilir; 390 px taşma yok', async () => {
  await page.evaluate(() => { location.hash = '#/ayarlar/proje'; });
  await expect(page.locator('.bolum-basligi h3').filter({ hasText: 'Projeler' })).toContainText('2');
  const liste = page.locator('.proje-listesi');
  await expect(liste.locator('li')).toHaveCount(2);
  for (const ad of [ornekProjeAdi, 'İkinci proje']) {
    const satir = liste.locator('li').filter({ hasText: ad });
    await expect(satir.getByRole('button', { name: `${ad}: yeniden adlandır` })).toBeVisible();
    await expect(satir.getByRole('button', { name: `${ad}: varsayılan yap` })).toBeVisible();
    await expect(satir.getByRole('button', { name: `${ad}: sil` })).toBeVisible();
  }
  // Varsayılan projede "Varsayılan yap" devre dışı ve nedeni ipucunda.
  const varsayilanSatir = liste.locator('li').filter({ has: page.locator('.rozet.vurgu') });
  if (await varsayilanSatir.count()) {
    const d = varsayilanSatir.locator('button[data-islem="varsayilan"]');
    await expect(d).toBeDisabled();
    await expect(d).toHaveAttribute('title', /zaten varsayılan/);
  }
  // Ortamlar satırındaki düğmelerle aynı boy ve biçim.
  const ortamDuzenle = page.locator('.kayit-listesi:not(.proje-listesi) li').first().getByRole('button', { name: /: düzenle$/ });
  const projeSil = liste.getByRole('button', { name: 'İkinci proje: sil' });
  expect(Math.round((await kutu(projeSil)).height)).toBe(Math.round((await kutu(ortamDuzenle)).height));
  await expect(projeSil).toHaveClass(/kucuk-dugme/);
  await expect(projeSil).toHaveClass(/tehlike/);
  await goruntu('06b-ayarlar-projeler', page.locator('.proje-listesi'));

  // Sil: aynı diyalog (kuru çalıştırma sayıları + adı yazarak onay), Vazgeç ile iptal; proje silinmez.
  await projeSil.click();
  const d = diyalog();
  await expect(d.getByRole('heading')).toContainText('Projeyi kalıcı sil: İkinci proje');
  await expect(d.locator('.onay-ozeti dt')).toContainText(['Ekran', 'Senaryo', 'Koşu', 'Sonuç']);
  await expect(d.getByRole('button', { name: 'Kalıcı olarak sil' })).toBeDisabled();
  await d.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(diyalog()).toHaveCount(0);
  await expect(liste.locator('li')).toHaveCount(2);

  // 390 px: Ayarlar sayfası yatayda taşmaz; düğmeler görünür.
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await expect(liste.getByRole('button', { name: 'İkinci proje: sil' })).toBeVisible();
    expect(await yatayTasmaYok()).toBe(true);
  } finally {
    await page.setViewportSize({ width: 1360, height: 960 });
  }
});

test('projeler arası geçiş, yeniden adlandır, varsayılan yap ve sil (adı yazarak; önce yedek)', async () => {
  let menu = await projeMenusu();
  await menu.getByRole('menuitemradio', { name: ornekProjeAdi }).click();
  await expect(page.locator('#proje-rozeti')).toHaveText(ornekProjeAdi);
  await expect(page).toHaveURL(/#\/ayarlar\/proje$/);
  await expect(page.locator('.kayit-listesi').filter({ hasText: 'ikinci.ornek.invalid' })).toHaveCount(0);
  // ⋯ > Yeniden adlandır
  menu = await projeMenusu();
  await menu.getByRole('button', { name: 'Proje işlemleri: İkinci proje' }).click();
  await page.getByRole('menuitem', { name: 'Yeniden adlandır' }).click();
  await diyalog().getByLabel('Proje adı').fill('İkinci proje (yeni)');
  await diyalog().getByRole('button', { name: 'Kaydet' }).click();
  await expect(diyalog()).toHaveCount(0);
  // ⋯ > Varsayılan yap
  menu = await projeMenusu();
  await menu.getByRole('button', { name: 'Proje işlemleri: İkinci proje (yeni)' }).click();
  await page.getByRole('menuitem', { name: 'Varsayılan yap' }).click();
  menu = await projeMenusu();
  await expect(menu.locator('.proje-satiri').filter({ hasText: 'İkinci proje (yeni)' }).locator('.varsayilan-rozeti')).toBeVisible();
  await goruntu('06-proje-menusu-iki-proje', undefined, { x: 0, y: 0, width: 760, height: 300 });
  // ⋯ > Sil: sayılar + ad yazılana kadar düğme kapalı
  await menu.getByRole('button', { name: 'Proje işlemleri: İkinci proje (yeni)' }).click();
  await goruntu('07-proje-alt-menusu', undefined, { x: 0, y: 0, width: 760, height: 360 });
  await page.getByRole('menuitem', { name: 'Sil (kalıcı)…' }).click();
  const d = diyalog();
  await expect(d.getByRole('heading')).toContainText('Projeyi kalıcı sil: İkinci proje (yeni)');
  await expect(d.locator('.onay-ozeti dt')).toContainText(['Ekran', 'Senaryo', 'Koşu', 'Sonuç', 'Medya', 'Ortam']);
  const sil = d.getByRole('button', { name: 'Kalıcı olarak sil' });
  await expect(sil).toBeDisabled();
  await d.getByRole('textbox').fill('İkinci proje (yeni)');
  await expect(sil).toBeEnabled();
  await goruntu('08-proje-sil', d);
  const yedekOnce = existsSync(join(veriKoku, 'yedekler')) ? readdirSync(join(veriKoku, 'yedekler')).length : 0;
  await sil.click();
  await expect(d).toHaveCount(0);
  menu = await projeMenusu();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(readdirSync(join(veriKoku, 'yedekler')).length).toBe(yedekOnce + 1);
});

test('çalışma alanını kapat (dışa aktarmadan): soru diyaloğu → başlangıç ekranında çalışma alanı listesi', async () => {
  const menu = await hesapMenusu();
  await menu.getByRole('menuitem', { name: 'Çalışma alanını kapat…' }).click();
  const d = diyalog();
  await expect(d.getByText('Son hâlini dışa aktarmak ister misiniz?')).toBeVisible();
  await expect(d.getByRole('button')).toHaveText(['Vazgeç', 'Dışa aktarmadan kapat', 'Dışa aktar ve kapat']);
  await goruntu('09-kapat-sorusu', d);
  await d.getByRole('button', { name: 'Dışa aktarmadan kapat' }).click();
  await expect(page.getByRole('heading', { name: 'Çalışma alanları' })).toBeVisible();
  await expect(page.locator('.ca-karti')).toHaveCount(1);
  await expect(page.locator('.ca-karti .ca-adi')).toHaveText(ILK_AD);
  await expect(page.locator('.ca-karti .ca-meta')).toContainText('1 proje');
  // Yeni çalışma alanı için yalnız iki kart: Yedek yükle, Yeni proje başlat.
  await expect(page.locator('.secim-karti')).toHaveCount(2);
  await goruntu('10-baslangic-ekrani');
});

test('yeni çalışma alanı: ad adımı (görünürlük uyarısı) → kasa → proje → ortam → hazır', async () => {
  await page.locator('.secim-karti').filter({ hasText: 'Yeni proje başlat' }).click();
  const d = diyalog();
  await expect(d.getByRole('heading')).toContainText('Yeni çalışma alanı');
  await expect(d.locator('.ad-gorunur-uyarisi')).toContainText('kilit açılmadan önce');
  await d.getByLabel('Çalışma alanı adı').fill('İş');
  await goruntu('11-yeni-calisma-alani-adi', d);
  await d.getByRole('button', { name: 'Oluştur ve devam et' }).click();
  // "Sizi tanıyalım" adımı yok: doğrudan kasa parolası.
  await expect(page.getByRole('heading', { name: 'Kasa parolası belirleyin' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sizi tanıyalım' })).toHaveCount(0);
  await expect(page.locator('.odak-ust')).toContainText('İş');
  await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA_B);
  await page.getByRole('textbox', { name: 'Kasa parolası (tekrar) (zorunlu)', exact: true }).fill(PAROLA_B);
  await page.getByText('Parolayı unutursam').click();
  await page.getByRole('button', { name: 'Kasayı oluştur ve devam et' }).click();
  await page.getByLabel('Proje adı').fill('Deneme');
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.getByLabel('Adres (link)').fill('https://deneme.ornek.invalid');
  await page.getByRole('button', { name: 'Kaydet ve devam' }).click();
  // İlk kurulumda izin paketi adımı (yeni çalışma alanı): Atla → hiçbir izin açılmaz.
  await page.getByRole('button', { name: 'Atla' }).click();
  // İsteğe bağlı giriş sorusu: varsayılanla devam.
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.getByRole('button', { name: 'Ana sayfaya geç' }).click();
  await expect(page.locator('#proje-rozeti')).toHaveText('Deneme');
  await expect(page.locator('.hesap-adi')).toHaveText('İş');
});

test('dışa aktar ve kapat: mevcut dışa aktarma formu (medya seçimi) → indirme → başlangıç ekranı', async () => {
  const menu = await hesapMenusu();
  await menu.getByRole('menuitem', { name: 'Çalışma alanını kapat…' }).click();
  const d = diyalog();
  await d.getByRole('button', { name: 'Dışa aktar ve kapat' }).click();
  await expect(d.locator('fieldset.medya-secimi')).toBeVisible();
  await expect(d.getByLabel('Ekran görüntüleri')).toBeVisible();
  await goruntu('12-disa-aktar-ve-kapat', d);
  await d.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA_B);
  const indirme = page.waitForEvent('download');
  await d.getByRole('button', { name: 'Dışa aktar ve kapat' }).click();
  const dosya = await indirme;
  // Dosya adı: çalışma alanı adı (ASCII) + tarih; bilgisayar adı geçmez.
  expect(dosya.suggestedFilename()).toMatch(/^Is-\d{4}-\d{2}-\d{2}-\d{4}\.tayedek$/);
  expect(await dosya.path()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Çalışma alanları' })).toBeVisible();
  await expect(page.locator('.ca-karti .ca-adi')).toHaveText(['İş', ILK_AD]);
});

test('tekrar aç ve değişiklik yapmadan kapat: yalnızca [Kapat] [Vazgeç] + "değişiklik yok" notu', async () => {
  await page.getByRole('button', { name: 'İş: aç' }).click();
  const d = diyalog();
  await d.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA_B);
  await d.getByRole('button', { name: 'Kilidi aç' }).click();
  await expect(page.locator('#proje-rozeti')).toHaveText('Deneme');
  const menu = await hesapMenusu();
  await menu.getByRole('menuitem', { name: 'Çalışma alanını kapat…' }).click();
  await expect(diyalog().locator('.degisiklik-yok')).toContainText('Son dışa aktarımdan beri değişiklik yok');
  await expect(diyalog().getByRole('button')).toHaveText(['Vazgeç', 'Kapat']);
  await goruntu('13-kapat-degisiklik-yok', diyalog());
  await diyalog().getByRole('button', { name: 'Kapat' }).click();
  await expect(page.getByRole('heading', { name: 'Çalışma alanları' })).toBeVisible();
});

test('yanlış parola: çalışma alanı başına bekleme (geri sayım, düğme kapalı)', async () => {
  await page.getByRole('button', { name: `${ILK_AD}: aç` }).click();
  const d = diyalog();
  await d.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill('yanlis-parola-000');
  await d.getByRole('button', { name: 'Kilidi aç' }).click();
  await expect(d.getByRole('alert')).toContainText('Parola yanlış.');
  await expect(d.getByRole('alert')).toContainText('saniye sonra tekrar deneyebilirsiniz');
  await goruntu('14-yanlis-parola-bekleme', d);
  await d.getByRole('button', { name: 'Vazgeç' }).click();
  // Diğer çalışma alanında bekleme yok.
  await page.goto('/');
  await expect(page.locator('.ca-karti').filter({ hasText: 'İş' }).locator('.rozet')).toHaveCount(0);
});

test('bu bilgisayardan kaldır: uyarı + adı yazarak onay; klasör silinir', async () => {
  const kart = page.locator('.ca-karti').filter({ hasText: 'İş' });
  const id = String(await kart.getAttribute('data-alan'));
  expect(existsSync(join(veriKoku, 'calisma-alanlari', id, 'platform.db'))).toBe(true);
  await page.getByRole('button', { name: 'Çalışma alanı işlemleri: İş' }).click();
  await page.getByRole('menuitem', { name: 'Bu bilgisayardan kaldır…' }).click();
  const d = diyalog();
  await expect(d).toContainText('Önce dışa aktardınız mı?');
  const kaldir = d.getByRole('button', { name: 'Kalıcı olarak kaldır' });
  await expect(kaldir).toBeDisabled();
  await d.getByLabel(/Onaylamak için/).fill('İş');
  await expect(kaldir).toBeEnabled();
  await goruntu('15-kaldir', d);
  await kaldir.click();
  await expect(page.locator('.ca-karti')).toHaveCount(1);
  expect(existsSync(join(veriKoku, 'calisma-alanlari', id))).toBe(false);
  expect(existsSync(join(veriKoku, 'platform.db'))).toBe(true);
});

test('Kilitle çalışma alanını korur; kilit ekranındaki "Başka çalışma alanı" başlangıç ekranına döner', async () => {
  await page.waitForTimeout(1200); // önceki testteki yanlış parola beklemesi
  await page.getByRole('button', { name: `${ILK_AD}: aç` }).click();
  await diyalog().getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA_A);
  await diyalog().getByRole('button', { name: 'Kilidi aç' }).click();
  await expect(page.locator('#proje-rozeti')).toHaveText(ornekProjeAdi);
  await page.getByRole('button', { name: 'Kilitle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kasa kilitli' })).toBeVisible();
  await expect(page.locator('.kilit-alan-adi > span:last-child')).toHaveText(ILK_AD);
  await page.getByRole('button', { name: 'Başka çalışma alanı' }).click();
  await expect(page.getByRole('heading', { name: 'Çalışma alanları' })).toBeVisible();
});
