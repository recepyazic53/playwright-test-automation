// KORUMA TESTLERİ — Aynı anda tek pencere (pencere-yoneticisi.js) ve isteğe bağlı sayfa rehberleri (rehber.js):
//   - iki işlem penceresi üst üste açılmaz (dışarıdan istenen ikinci pencere sıraya girer; pencerenin içinden istenen ve karar
//     pencereleri hemen açılır);
//   - işlem penceresi açıkken rehber başlamaz, pencere kapanınca da kendiliğinden başlamaz (bağlantı "hazır" kalır); rehber açıkken
//     işlem penceresi açılırsa rehber kapanır;
//   - yeni kurulumda "Rehberleri ilk girişte göster" kapalı, mevcut kullanıcının kayıtlı tercihi korunur;
//   - her sayfada "Bu sayfanın rehberi (N adım)" bağlantısı; boş Sonuçlar'da 3 adımlık kısa "ilk koşu" rehberi.
// Yalnız 127.0.0.1'deki geçici Nöbetçi sunucusu kullanılır.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ayarGetir, ayarYaz, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { REHBER_TERCIH_SURUMU, rehberAyarlariniKaydet, rehberAyarlariniOku } from '../../scripts/platform/ayarlar/rehber-ayarlari.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('rehber tercihi: yeni kurulumda kapalı; eski sürümün kendiliğinden yazdığı açık tercih bir kez kapanır, sonraki kullanıcı seçimi korunur', async () => {
  const klasor = geciciKlasor('rehber-varsayilan');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  const onceki = process.env.NOBETCI_REHBER_OTOMATIK;
  try {
    await kasaOlustur(vt, 'Gecici-Rehber-V1', { kdf: HIZLI_KDF });
    delete process.env.NOBETCI_REHBER_OTOMATIK;
    // Yeni kurulum: kayıt yok → kapalı; "görüldü" yazmak tercihi açmaz.
    expect(rehberAyarlariniOku(vt)).toEqual({ otomatik: false, gorulenler: [], ortamKapali: false });
    expect(rehberAyarlariniKaydet(vt, { gorulen: 'genel' })).toMatchObject({ otomatik: false, gorulenler: ['genel'] });
    // Eski sürümün işaretsiz kaydı (her "görüldü"de kendiliğinden otomatik: true yazılırdı) kullanıcı seçimi sayılmaz: bir kez
    // kapanır, görülenler korunur ve ilk kayıtta sürüm işareti yazılır.
    ayarYaz(vt, 'rehber', { otomatik: true, gorulenler: ['senaryolar'] });
    expect(rehberAyarlariniOku(vt)).toMatchObject({ otomatik: false, gorulenler: ['senaryolar'] });
    expect(rehberAyarlariniKaydet(vt, { gorulen: 'ekranlar' })).toMatchObject({ otomatik: false, gorulenler: ['senaryolar', 'ekranlar'] });
    expect(ayarGetir(vt, 'rehber')).toEqual({ tercihSurumu: REHBER_TERCIH_SURUMU, otomatik: false, gorulenler: ['senaryolar', 'ekranlar'] });
    // Geçişten sonra kullanıcı Ayarlar'dan açarsa açık kalır (görüldü işaretlemek de değiştirmez).
    expect(rehberAyarlariniKaydet(vt, { otomatik: true })).toMatchObject({ otomatik: true, gorulenler: ['senaryolar', 'ekranlar'] });
    expect(rehberAyarlariniKaydet(vt, { gorulen: 'veri' })).toMatchObject({ otomatik: true, gorulenler: ['senaryolar', 'ekranlar', 'veri'] });
    expect(rehberAyarlariniOku(vt).otomatik).toBe(true);
    // Kullanıcının kapattığı tercih de korunur.
    expect(rehberAyarlariniKaydet(vt, { otomatik: false })).toMatchObject({ otomatik: false });
    expect(rehberAyarlariniKaydet(vt, { gorulen: 'genel' })).toMatchObject({ otomatik: false });
  } finally {
    if (onceki === undefined) delete process.env.NOBETCI_REHBER_OTOMATIK; else process.env.NOBETCI_REHBER_OTOMATIK = onceki;
    vt.kapat();
    klasor.temizle();
  }
});

test.describe('Tek pencere ve sayfa rehberleri', () => {
  const PAROLA = `Gecici-Pencere-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'pencere-rehber-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Pencere Projesi' });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  const rehberKarti = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') });
  const baglanti = (page: Page) => page.getByRole('button', { name: /^Bu sayfanın rehberi \(\d+ adım\)$/ });

  /** Sayfada test penceresi oluşturur (başlık = ad; içinde "Kapat" düğmesi). */
  const pencereKur = (page: Page, ad: string, karar = false) => page.evaluate(([a, k]) => {
    const d = document.createElement('dialog');
    d.setAttribute('aria-label', a);
    d.dataset.test = a;
    if (k) d.dataset.pencere = 'karar';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${a} kapat`;
    b.addEventListener('click', () => d.close());
    d.append(b);
    document.body.append(d);
  }, [ad, karar] as const);
  const pencereAc = (page: Page, ad: string) => page.evaluate((a) => (document.querySelector(`dialog[data-test="${a}"]`) as HTMLDialogElement).showModal(), ad);
  /** Kullanıcının son etkileşimi pencerelerin dışında (sayfa gövdesinde). */
  const sayfadaEtkilesim = (page: Page) => page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  const acikMi = (page: Page, ad: string) => page.evaluate((a) => (document.querySelector(`dialog[data-test="${a}"]`) as HTMLDialogElement).open, ad);

  test('iki işlem penceresi aynı anda açılmaz: dışarıdan istenen sıraya girer; içinden istenen ve karar penceresi hemen açılır', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/senaryolar');
    await expect(baglanti(page)).toBeVisible();
    for (const ad of ['Birinci', 'Ikinci', 'Alt', 'Karar']) await pencereKur(page, ad, ad === 'Karar');
    await sayfadaEtkilesim(page); // son etkileşim sayfada (pencerelerin dışında)
    await pencereAc(page, 'Birinci');
    await pencereAc(page, 'Ikinci');
    expect(await acikMi(page, 'Birinci')).toBe(true);
    expect(await acikMi(page, 'Ikinci')).toBe(false);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    // Karar penceresi (izin / CANLI onayı) işlemi beklettiği için sıraya girmez.
    await pencereAc(page, 'Karar');
    expect(await acikMi(page, 'Karar')).toBe(true);
    await page.getByRole('button', { name: 'Karar kapat' }).click();
    // Birinci pencerenin içinden istenen pencere (ör. "Sil" → onay) üstte açılır.
    await page.getByRole('dialog', { name: 'Birinci' }).click({ position: { x: 5, y: 5 } });
    await pencereAc(page, 'Alt');
    expect(await acikMi(page, 'Alt')).toBe(true);
    await page.getByRole('button', { name: 'Alt kapat' }).click();
    // Sıradaki pencere yalnız öncekiler kapanınca açılır.
    expect(await acikMi(page, 'Ikinci')).toBe(false);
    await page.getByRole('button', { name: 'Birinci kapat' }).click();
    await expect.poll(() => acikMi(page, 'Ikinci')).toBe(true);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Ikinci kapat' }).click();
    // Sırada beklerken kapatılan pencere sonradan açılmaz.
    await sayfadaEtkilesim(page);
    await pencereKur(page, 'Ucuncu');
    await pencereAc(page, 'Birinci');
    await pencereAc(page, 'Ucuncu');
    await page.evaluate(() => (document.querySelector('dialog[data-test="Ucuncu"]') as HTMLDialogElement).close());
    await page.getByRole('button', { name: 'Birinci kapat' }).click();
    await page.waitForTimeout(200);
    expect(await acikMi(page, 'Ucuncu')).toBe(false);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('rehber işlem penceresi açıkken başlamaz, kapanınca da kendiliğinden başlamaz; rehber açıkken pencere açılırsa rehber kapanır', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    await page.goto('/#/senaryolar');
    await expect(baglanti(page)).toBeVisible();
    await pencereKur(page, 'Islem');
    await pencereAc(page, 'Islem');
    const basladi = await page.evaluate(async () => (await import('/arayuz/rehber.js' as string)).rehberBaslat('senaryolar'));
    expect(basladi).toBe(false);
    await expect(rehberKarti(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Islem kapat' }).click();
    await page.waitForTimeout(800);
    await expect(rehberKarti(page)).toHaveCount(0);
    // Bağlantı "hazır" görünür ve rehberi açar.
    await expect(baglanti(page)).toHaveClass(/hazir/);
    await baglanti(page).click();
    await expect(rehberKarti(page)).toBeVisible();
    await expect(baglanti(page)).not.toHaveClass(/hazir/);
    // Rehber açıkken işlem penceresi açılırsa rehber kapanır (görüldü sayılmaz).
    await pencereAc(page, 'Islem');
    await expect(rehberKarti(page)).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Islem kapat' }).click();
    const { rehber } = (await nobetciApi(nobetci, '/platform/rehber')) as { rehber: { gorulenler: string[] } };
    expect(rehber.gorulenler).not.toContain('senaryolar');
    // Pencere yüzünden bekleyen başka bir rehber (ör. kurulum sonrası genel tanıtım) bağlantıdan açılır.
    await pencereAc(page, 'Islem');
    await page.evaluate(async () => (await import('/arayuz/rehber.js' as string)).rehberBaslat('genel'));
    await page.getByRole('button', { name: 'Islem kapat' }).click();
    const hazir = page.getByRole('button', { name: 'Rehber hazır: Genel tanıtım (5 adım)' });
    await expect(hazir).toBeVisible();
    await expect(rehberKarti(page)).toHaveCount(0);
    await hazir.click();
    await expect(rehberKarti(page).getByRole('heading', { name: "Nöbetçi'ye hoş geldiniz" })).toBeVisible();
    await expect(baglanti(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await baglam.close();
  });

  test('yeni kurulumda sayfa rehberleri kendiliğinden açılmaz; her sayfada "Bu sayfanın rehberi (N adım)" bağlantısı "?" ile aynı rehberi açar', async () => {
    expect(((await nobetciApi(nobetci, '/platform/rehber')) as { rehber: { otomatik: boolean } }).rehber.otomatik).toBe(false);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    // Otomatik açılma izinli olsa da tercih kapalı olduğu için açılmaz.
    await baglam.addInitScript(() => localStorage.setItem('nobetci-rehber-otomatik', '1'));
    const page = await baglam.newPage();
    for (const [adres, ilkBaslik] of [['/#/senaryolar', 'Senaryolar ekranı'], ['/#/ekranlar', null], ['/#/veri', null]] as const) {
      await page.goto(adres);
      await expect(baglanti(page)).toBeVisible();
      await page.waitForTimeout(1200);
      await expect(rehberKarti(page)).toHaveCount(0);
      const n = Number((await baglanti(page).textContent())?.match(/\((\d+) adım\)/)?.[1]);
      expect(n).toBeGreaterThan(0);
      await baglanti(page).click();
      await expect(rehberKarti(page).locator('.rehber-sayac')).toHaveText(`1 / ${n}`);
      if (ilkBaslik) await expect(rehberKarti(page).getByRole('heading', { name: ilkBaslik })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(rehberKarti(page)).toHaveCount(0);
    }
    await baglam.close();
  });

  test('boş Sonuçlar: 3 adımlık kısa "ilk koşu" rehberi (Özet ve Ekranlar sekmesi); hedefi olmayan adımlar atlanır', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    for (const adres of ['/#/sonuclar/ozet', '/#/sonuclar']) {
      await page.goto(adres);
      await expect(baglanti(page)).toHaveText('Bu sayfanın rehberi (3 adım)');
      await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
      const kart = rehberKarti(page);
      await expect(kart.locator('.rehber-sayac')).toHaveText('1 / 3');
      await expect(kart.getByRole('heading', { name: 'Sonuçlar koşudan sonra dolar' })).toBeVisible();
      await kart.getByRole('button', { name: 'İleri' }).click();
      await expect(kart.getByRole('heading', { name: 'Sıradaki adım: Başlarken' })).toBeVisible();
      await expect(kart).toContainText('Koşuyu başlat');
      await page.keyboard.press('Escape');
    }
    // Ayrıntılı rehberde hedefi sayfada olmayan adımlar atlanır (ör. boş projede Test paneli).
    const { toplam, gosterilen } = await page.evaluate(async () => {
      const { REHBERLER } = await import('/arayuz/rehber-icerikleri.js' as string);
      const { rehberBaslat } = await import('/arayuz/rehber.js' as string);
      rehberBaslat('sonuclar');
      const sayac = document.querySelector('.rehber-sayac')?.textContent || '';
      return { toplam: REHBERLER.sonuclar.adimlar.length as number, gosterilen: Number(sayac.split('/')[1]) };
    });
    expect(gosterilen).toBeLessThan(toplam);
    await expect(rehberKarti(page).getByRole('button', { name: /^Adım \d+: Test paneli$/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await baglam.close();
  });
});
