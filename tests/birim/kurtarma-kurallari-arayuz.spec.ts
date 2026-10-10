// KORUMA TESTLERİ — Ayarlar > Proje ve ortamlar > Kurtarma kuralları arayüzü (scripts/platform/arayuz/kurtarma-kurallari.js): hazır
// 401 / 403 kuralı (silinemez, kapatılabilir), ekran ve servis türünde kural ekle / düzenle / sil, "son 7 günde N kez", servis
// ayarlarında "Tekrar denenebilir metotlar"; 1440 ve 390 px'te yatay taşma yok. Yalnız yerel Nöbetçi (127.0.0.1, geçici veri); hiçbir
// servise istek atılmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import type { KurtarmaKurali } from '../../scripts/platform/ayarlar/kurtarma-kurallari.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { korumaliTarayici } from './giris-fikstur';
import { HIZLI_KDF } from './platform-ortak';

/** Kökün içinde görünen alanın sağına taşan öğe yok (kendi kaydırma kutusundakiler sayılmaz). */
async function tasmaYok(page: Page, kok: string): Promise<void> {
  const o = await page.evaluate((secici) => {
    const gorunen = document.documentElement.clientWidth;
    const ana = document.querySelector(secici);
    const kaydirmaIcinde = (e: Element) => {
      for (let p = e.parentElement; p && p !== ana; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const tasanlar = [...(ana?.querySelectorAll('*') ?? [])].filter((e) => !kaydirmaIcinde(e) && e.getBoundingClientRect().right > gorunen + 0.5)
      .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).replace(/\s+/g, '.')}`);
    return { tasanlar, gorunen, belge: document.documentElement.scrollWidth };
  }, kok);
  expect(o.tasanlar, `görünen ${o.gorunen}px; taşan: ${o.tasanlar.join(', ')}`).toEqual([]);
  expect(o.belge).toBeLessThanOrEqual(o.gorunen);
}

test.describe('kurtarma kuralları arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kurtarma-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let servisId = '';
  const kurallar = async (): Promise<Array<KurtarmaKurali & { son7Gun: number }>> =>
    (await nobetciApi(nobetci, `/platform/kurtarma-kurallari?projeId=${projeId}`)).kurallar as Array<KurtarmaKurali & { son7Gun: number }>;
  const sayfaAc = async (genislik: number): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/kosu/kurtarma');
    await expect(page.getByRole('heading', { level: 2, name: 'Koşu' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Kurtarma kuralları' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Kurtarma kuralları' })).toBeVisible();
    return { page, hatalar, kapat: () => baglam.close() };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kurtarma-arayuz-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Kurtarma Arayüz Projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    ortamKaydet(vt, { projeId, ad: 'IKINCI', tabanUrl: 'https://ikinci.ornek.invalid', ayarlar: { riskli: false } });
    ekranId = ekranKaydet(vt, { projeId, anahtar: 'islem', ad: 'İşlem' });
    servisId = servisKaydet(vt, { projeId, anahtar: 'deneme-api', ad: 'Deneme API', tur: 'rest', ayarlar: {
      yol: '/', operasyonlar: [{ ad: 'durum', metot: 'GET', yol: '/durum' }, { ad: 'kayit', metot: 'POST', yol: '/kayit' }], tekrarDenenebilirOperasyonlar: ['durum']
    } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('Koşu bölümünün içinde (ayrı bölüm yok); Proje ve ortamlar\'da liste yok; eski adresler ve "yeni" adresi', async () => {
    const { page, hatalar, kapat } = await sayfaAc(1440);
    const bolumler = page.getByRole('navigation', { name: 'Ayarlar bölümleri' });
    await expect(bolumler.getByRole('link', { name: 'Koşu' })).toHaveAttribute('aria-current', 'page');
    await expect(bolumler.getByRole('link', { name: 'Kurtarma kuralları' })).toHaveCount(0);
    // Eski yer: liste yok (bilgi notu da yok; bölüm Ayarlar menüsünden açılır).
    await page.goto('/#/ayarlar/proje');
    await expect(page.getByRole('heading', { level: 2, name: 'Proje ve ortamlar' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Kurtarma kuralları' })).toHaveCount(0);
    await expect(page.locator('.kurtarma-tasindi')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Ayarlar bölümleri' }).getByRole('link', { name: 'Koşu' }).click();
    await expect(page).toHaveURL(/#\/ayarlar\/kosu$/);
    await expect(page.getByRole('list', { name: 'Kurtarma kuralları' })).toBeVisible();
    // Eski adresler yönlenir (#/ayarlar/kurtarma, #/ayarlar/kurtarma-kurallari → Koşu > Kurtarma kuralları);
    // #/ayarlar/kurtarma/yeni ve yeni #/ayarlar/kosu/kurtarma-yeni "Kural ekle" penceresini açar (hızlı arama, Oluştur menüsü).
    await page.goto('/#/ayarlar/kurtarma');
    await expect(page).toHaveURL(/#\/ayarlar\/kosu\/kurtarma$/);
    await expect(page.getByRole('list', { name: 'Kurtarma kuralları' })).toBeVisible();
    await page.goto('/#/ayarlar/kurtarma-kurallari');
    await expect(page).toHaveURL(/#\/ayarlar\/kosu\/kurtarma$/);
    for (const adres of ['/#/ayarlar/kurtarma/yeni', '/#/ayarlar/kosu/kurtarma-yeni']) {
      await page.goto('/#/ayarlar/proje');
      await page.goto(adres);
      await expect(page).toHaveURL(/#\/ayarlar\/kosu\/kurtarma-yeni$/);
      const d = page.getByRole('dialog', { name: 'Yeni kurtarma kuralı' });
      await expect(d).toBeVisible();
      await d.getByRole('button', { name: 'Vazgeç' }).click();
      await expect(d).toBeHidden();
    }
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('hazır 401 / 403 kuralı: listede, silinemez, kapatılabilir; sayaç görünür', async () => {
    const { page, hatalar, kapat } = await sayfaAc(1440);
    const liste = page.getByRole('list', { name: 'Kurtarma kuralları' });
    const hazir = liste.getByRole('listitem').filter({ hasText: 'Hazır' });
    await expect(hazir).toContainText("Yetki hatasında token'ı yenile (401 / 403)");
    await expect(hazir).toContainText('HTTP 401, 403');
    await expect(hazir).toContainText('son 7 günde 0 kez');
    await expect(hazir.getByRole('button', { name: /: sil$/ })).toBeDisabled();
    await expect(hazir.getByRole('button', { name: /düzenle/ })).toHaveCount(0);
    await hazir.getByRole('checkbox', { name: /: açık$/ }).uncheck();
    await expect(liste.getByRole('listitem').filter({ hasText: 'Hazır' })).toContainText('Kapalı');
    expect((await kurallar())[0].acik).toBe(false);
    await liste.getByRole('listitem').filter({ hasText: 'Hazır' }).getByRole('checkbox', { name: /: açık$/ }).check();
    await expect(liste.getByRole('listitem').filter({ hasText: 'Hazır' })).not.toContainText('Kapalı');
    expect((await kurallar())[0].acik).toBe(true);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('ekran kuralı: ekle (koşul / eylem / sonra / ekran ve ortam kapsamı), düzenle, sil; 1440 ve 390 px taşma yok', async ({}, testInfo) => {
    const { page, hatalar, kapat } = await sayfaAc(1440);
    await page.locator('[data-alt-bolum="kurtarma"]').getByRole('button', { name: 'Kural ekle' }).click();
    const d = page.getByRole('dialog', { name: 'Yeni kurtarma kuralı' });
    await expect(d).toBeVisible();
    // Boş adla kaydetme: sunucu hatası pencerede görünür.
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d.getByRole('alert').filter({ hasText: 'Kuralın adı boş olamaz' })).toBeVisible();
    await d.getByLabel('Kuralın adı').fill('Oturum bitti');
    await expect(d.getByRole('radio', { name: 'Ekran', exact: true })).toBeChecked();
    await d.getByLabel('Ne görülünce').selectOption('metin');
    await d.getByLabel('Metin', { exact: true }).fill('Oturumunuz sona erdi');
    await d.getByLabel('Eylem').selectOption('girisYenile');
    await d.getByLabel('Sonra', { exact: true }).selectOption('tekrar');
    await d.getByLabel('Tekrar sayısı').fill('2');
    const ekranlar = d.getByRole('group', { name: 'Ekranlar' });
    await ekranlar.getByRole('radio', { name: 'Seçili' }).check();
    await ekranlar.getByRole('checkbox', { name: 'İşlem' }).check();
    await tasmaYok(page, 'dialog.kurtarma-diyalogu');
    await page.screenshot({ path: testInfo.outputPath('kurtarma-ekran-kurali-1440.png') });
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d).toBeHidden();
    const satir = page.getByRole('list', { name: 'Kurtarma kuralları' }).getByRole('listitem').filter({ hasText: 'Oturum bitti' });
    await expect(satir).toContainText('"Oturumunuz sona erdi" metni görünür → girişi yenile → adımı 2 kez tekrar dene');
    await expect(satir).toContainText('İşlem · tüm ortamlar');
    await expect(satir).toContainText('son 7 günde 0 kez');
    let k = (await kurallar()).find((x) => x.ad === 'Oturum bitti');
    expect(k).toMatchObject({ tur: 'ekran', acik: true, kosul: { tur: 'metin', metin: 'Oturumunuz sona erdi' }, eylem: { tur: 'girisYenile' }, sonra: { tur: 'tekrar', kez: 2 }, kapsam: { ogeler: [ekranId], ortamlar: null } });

    // Düzenle: öğe koşulu + tıkla + devam; ortam seçili.
    await satir.getByRole('button', { name: 'Oturum bitti: düzenle' }).click();
    const d2 = page.getByRole('dialog', { name: 'Kuralı düzenle: Oturum bitti' });
    await expect(d2.getByLabel('Metin', { exact: true })).toHaveValue('Oturumunuz sona erdi');
    await expect(d2.getByRole('radio', { name: 'Servis', exact: true })).toBeDisabled();
    await d2.getByLabel('Ne görülünce').selectOption('oge');
    await d2.getByLabel('CSS seçici').fill('#duyuru');
    await d2.getByLabel('Eylem').selectOption('tikla');
    await d2.getByLabel('Öğenin seçicisi').fill('#kapat');
    await d2.getByLabel('Sonra', { exact: true }).selectOption('devam');
    const ortamlar = d2.getByRole('group', { name: 'Ortamlar' });
    await ortamlar.getByRole('radio', { name: 'Seçili' }).check();
    await ortamlar.getByRole('checkbox', { name: 'TEST' }).check();
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page, 'dialog.kurtarma-diyalogu');
    await page.screenshot({ path: testInfo.outputPath('kurtarma-ekran-kurali-390.png') });
    await d2.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d2).toBeHidden();
    k = (await kurallar()).find((x) => x.ad === 'Oturum bitti');
    expect(k).toMatchObject({ kosul: { tur: 'oge', secici: '#duyuru' }, eylem: { tur: 'tikla', secici: '#kapat' }, sonra: { tur: 'devam' }, kapsam: { ogeler: [ekranId], ortamlar: [ortamId] } });
    await expect(satir).toContainText('#duyuru görünür → #kapat tıkla → devam et');
    await tasmaYok(page, 'main');
    await page.screenshot({ path: testInfo.outputPath('kurtarma-liste-390.png'), fullPage: true });

    // Sil (onaylı).
    await satir.getByRole('button', { name: 'Oturum bitti: sil' }).click();
    await satir.getByRole('button', { name: 'Oturum bitti: sil' }).click();
    await expect(satir).toHaveCount(0);
    expect((await kurallar()).some((x) => x.ad === 'Oturum bitti')).toBe(false);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('servis kuralı: ekle (HTTP kodu, süzgeç, bekle + tekrar + artan, metot ve ortam kapsamı), düzenle, sil; 390 px taşma yok', async ({}, testInfo) => {
    const { page, hatalar, kapat } = await sayfaAc(1440);
    await page.locator('[data-alt-bolum="kurtarma"]').getByRole('button', { name: 'Kural ekle' }).click();
    const d = page.getByRole('dialog', { name: 'Yeni kurtarma kuralı' });
    await d.getByLabel('Kuralın adı').fill('Yoğunluk');
    await d.getByRole('radio', { name: 'Servis', exact: true }).check();
    await d.getByLabel('Ne görülünce').selectOption('http');
    await d.getByLabel('Durum kodları').fill('503, 502');
    await d.getByLabel('Süzgeç parametresi').fill('Kaynak');
    await d.getByLabel('Süzgeç değeri').fill('A');
    await d.getByRole('checkbox', { name: 'Bekle', exact: true }).check();
    await d.getByLabel('Bekleme (sn)').fill('2');
    await d.getByRole('checkbox', { name: 'İsteği tekrar gönder' }).check();
    await d.getByLabel('En çok deneme (ilk istek dahil)').fill('3');
    await d.getByRole('checkbox', { name: 'Artan bekleme' }).check();
    const servisler = d.getByRole('group', { name: 'Servisler ve metotlar' });
    await servisler.getByRole('radio', { name: 'Seçili' }).check();
    await expect(servisler.getByRole('checkbox', { name: 'Deneme API › kayit' })).toBeVisible();
    await servisler.getByRole('checkbox', { name: 'Deneme API › durum (tekrar denenebilir)' }).check();
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page, 'dialog.kurtarma-diyalogu');
    await page.screenshot({ path: testInfo.outputPath('kurtarma-servis-kurali-390.png') });
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d).toBeHidden();
    let k = (await kurallar()).find((x) => x.ad === 'Yoğunluk');
    expect(k).toMatchObject({ tur: 'servis', kosul: { tur: 'http', kodlar: [503, 502] }, suzgec: { parametre: 'Kaynak', deger: 'A' },
      yapilacak: { bekleSn: 2, tokenYenile: false, tekrarGonder: true, enCokDeneme: 3, artanBekleme: true }, kapsam: { ogeler: [{ servisId, metot: 'durum' }], ortamlar: null } });
    const satir = page.getByRole('list', { name: 'Kurtarma kuralları' }).getByRole('listitem').filter({ hasText: 'Yoğunluk' });
    await expect(satir).toContainText('HTTP 503, 502 → 2 sn bekle, tekrar gönder (en çok 3 deneme, artan bekleme)');
    await expect(satir).toContainText('yalnız Kaynak = A iken');
    await expect(satir).toContainText('Deneme API › durum · tüm ortamlar');
    await tasmaYok(page, 'main');

    // Düzenle: yanıt alanı koşulu (içerir), süzgeç kaldırılır, token'ı yenile.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await satir.getByRole('button', { name: 'Yoğunluk: düzenle' }).click();
    const d2 = page.getByRole('dialog', { name: 'Kuralı düzenle: Yoğunluk' });
    await expect(d2.getByLabel('Durum kodları')).toHaveValue('503, 502');
    await d2.getByLabel('Ne görülünce').selectOption('alan');
    await d2.getByLabel('Yanıt alanı').fill('Mesaj');
    await d2.getByLabel('İşleç').selectOption('icerir');
    await d2.getByLabel('Değer', { exact: true }).fill('tekrar deneyiniz');
    await d2.getByLabel('Süzgeç parametresi').fill('');
    await d2.getByRole('checkbox', { name: "Token'ı yenile" }).check();
    await tasmaYok(page, 'dialog.kurtarma-diyalogu');
    await d2.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d2).toBeHidden();
    k = (await kurallar()).find((x) => x.ad === 'Yoğunluk');
    expect(k).toMatchObject({ kosul: { tur: 'alan', yol: 'Mesaj', islec: 'icerir', deger: 'tekrar deneyiniz' }, suzgec: null, yapilacak: { tokenYenile: true, tekrarGonder: true } });
    await expect(satir).toContainText('Mesaj içerir "tekrar deneyiniz"');

    await satir.getByRole('button', { name: 'Yoğunluk: sil' }).click();
    await satir.getByRole('button', { name: 'Yoğunluk: sil' }).click();
    await expect(satir).toHaveCount(0);
    expect((await kurallar()).map((x) => x.ad)).toEqual(["Yetki hatasında token'ı yenile (401 / 403)"]);
    expect(hatalar).toEqual([]);
    await kapat();
  });
});
