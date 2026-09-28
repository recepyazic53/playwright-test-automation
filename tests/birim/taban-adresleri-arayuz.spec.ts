// KORUMA TESTLERİ — Ayarlar > Proje ve ortamlar > Servis taban adresleri arayüzü (scripts/platform/arayuz/taban-adresler.js) ve
// servis sayfasındaki taban adresi seçimi. Ana liste = adlandırılmış taban adresleri ("Kullanan: N servis"); düzenle → etki
// penceresi (eski → yeni, senaryo sayısı) + onay, Vazgeç hiçbir şey değiştirmez; yeni taban → "Hangi servisler bu adresi
// kullansın?" (önce taban adresi boş olanlar, işaretsiz) → seçilenler bağlanır; sil → adresi boş kalacak servis listesi + onay,
// koşuda anlaşılır neden; eski veri (kaydı olmayan ad, adsız servisler) görünür; "Servis bazında" görünüm; masaüstü + 390px
// yatay taşma yok. Yalnız yerel Nöbetçi (127.0.0.1, geçici veri); adresler *.ornek.invalid — hiçbir servise istek atılmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Hucre = { deger: string; kaynak: string };
type Satir = { servisId: string; ad: string; grup: string | null; tabanlar: Record<string, Hucre> };
type TabanAdi = { ad: string; adresler: Record<string, string>; kullanan: string[] };

/** Sayfa yatay taşmıyor mu (kendi kaydırma kutusundaki öğeler sayılmaz). */
async function tasmaYok(page: Page, kok = 'main'): Promise<void> {
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

test.describe('servis taban adresleri arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Taban-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let T = '';
  let C = '';
  const id: Record<string, string> = {};
  const ortak = () => ({ [T]: 'https://api-test.ornek.invalid', [C]: 'https://api.ornek.invalid' });

  const tablo = async (): Promise<{ satirlar: Map<string, Satir>; tabanlar: TabanAdi[] }> => {
    const y = await nobetciApi(nobetci, `/platform/servis-tabanlari?projeId=${projeId}`);
    return { satirlar: new Map((y.satirlar as Satir[]).map((s) => [s.ad, s])), tabanlar: y.tabanAdlari as TabanAdi[] };
  };
  const sayfaAc = async (genislik = 1400, adres = '/#/ayarlar/proje'): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(adres);
    if (adres.includes('ayarlar')) await expect(page.getByRole('heading', { name: /Servis taban adresleri/ })).toBeVisible();
    return { page, hatalar, kapat: () => baglam.close() };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'taban-arayuz-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Taban Arayüz Projesi' });
    T = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    C = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid', ayarlar: { canli: true } });
    const sv = (anahtar: string, ad: string, ayarlar: Record<string, unknown>, tur: 'soap' | 'rest' = 'soap') => {
      id[ad] = servisKaydet(vt, { projeId, anahtar, ad, tur, ayarlar: { yol: tur === 'rest' ? '/' : `/${anahtar}.asmx`, ...ayarlar } });
    };
    // Eski veri: "Çekirdek" adı yalnız servislerde (kayıtlı taban adresi yok); diğerleri adsız (özel / ortamın adresi / yok).
    sv('a1', 'Sipariş', { tabanlar: ortak(), tabanGrubu: 'Çekirdek' });
    sv('a2', 'Fatura', { tabanlar: ortak(), tabanGrubu: 'Çekirdek' });
    sv('a3', 'Hasar', { tabanlar: ortak() });
    sv('a4', 'Kampanya', { tabanlar: { [T]: 'https://api-test.ornek.invalid', [C]: '' } });
    sv('o1', 'Rapor', {});
    sv('b1', 'Diğer', { tabanlar: { [T]: 'https://diger-test.ornek.invalid', [C]: 'https://api.ornek.invalid' } });
    sv('r1', 'Uç', { tabanlar: { [T]: 'https://uc-test.ornek.invalid' } }, 'rest');
    servisSenaryosuKaydet(vt, { projeId, servisId: id['Sipariş'], baslik: 'S1', icerik: { operasyon: 'Op', govde: '<x/>', kontroller: [] } });
    servisSenaryosuKaydet(vt, { projeId, servisId: id['Kampanya'], baslik: 'K1', kapsam: 'ikisi', icerik: { operasyon: 'Op', govde: '<x/>', kontroller: [] } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('ana liste: taban adresleri ve "Kullanan: N servis"; eski veri (kaydı olmayan ad, adsız servisler); 390px taşma yok', async ({}, testInfo) => {
    const { page, hatalar, kapat } = await sayfaAc();
    await expect(page.getByRole('radio', { name: 'Taban adresleri' })).toHaveAttribute('aria-checked', 'true');
    const t = page.getByRole('table', { name: 'Taban adresleri' });
    await expect(t.locator('tbody > tr')).toHaveCount(1);
    const satir = t.locator('tbody > tr').first();
    await expect(satir).toContainText('Çekirdek');
    await expect(satir).toContainText('https://api-test.ornek.invalid');
    await expect(satir).toContainText('https://api.ornek.invalid');
    await page.getByRole('button', { name: 'Çekirdek — Kullanan: 2 servis' }).click();
    const uyeler = page.getByRole('list', { name: 'Çekirdek: servisler' });
    await expect(uyeler.getByRole('listitem')).toHaveCount(2);
    await expect(uyeler.getByRole('listitem').filter({ hasText: 'Sipariş' })).toContainText('/a1.asmx · 1 senaryo');
    await page.getByText('Adlandırılmamış adres kullanan 5 servis').click();
    const adsiz = page.getByRole('list', { name: 'Adlandırılmamış adres kullanan servisler' });
    await expect(adsiz.getByRole('listitem')).toHaveCount(5);
    await expect(adsiz.getByRole('listitem').filter({ hasText: 'Kampanya' })).toContainText('CANLI: bu ortamda yok');
    await expect(adsiz.getByRole('listitem').filter({ hasText: 'Rapor' })).toContainText('https://test.ornek.invalid (ortamın adresi)');
    // "Gruptan ayır" gibi ek kavram yok.
    await expect(page.getByRole('button', { name: /gruptan ayır/i })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('taban-adlari-masaustu.png'), fullPage: true });
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(t).toBeVisible();
    await tasmaYok(page);
    await page.screenshot({ path: testInfo.outputPath('taban-adlari-390.png'), fullPage: true });
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('değiştir: etki penceresi (servisler, eski → yeni, senaryo sayısı); Vazgeç hiçbir şey değiştirmez; onayla yazılır', async () => {
    const { page, hatalar, kapat } = await sayfaAc();
    const once = await tablo();
    await page.getByRole('button', { name: 'Çekirdek: düzenle' }).click();
    const pencere = page.getByRole('dialog', { name: '"Çekirdek" taban adresini düzenle' });
    await expect(pencere.getByLabel('TEST adresi')).toHaveValue('https://api-test.ornek.invalid');
    await pencere.getByLabel('TEST adresi').fill('https://api2-test.ornek.invalid');
    await pencere.getByRole('button', { name: 'Etkiyi göster' }).click();
    const etki = pencere.getByRole('region', { name: 'Değişikliğin etkisi' });
    await expect(etki).toContainText('Bu değişiklik şu 2 servisi etkiler (1 senaryo)');
    const liste = etki.getByRole('list', { name: 'Etkilenen servisler' });
    await expect(liste.locator(':scope > li')).toHaveCount(2);
    await expect(liste.locator(':scope > li').filter({ hasText: 'Sipariş' })).toContainText('TEST: https://api-test.ornek.invalid → https://api2-test.ornek.invalid');
    await expect(etki.getByRole('list', { name: 'Adresi boş kalacak servisler' })).toHaveCount(0);
    // Vazgeç: hiçbir şey yazılmaz.
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toHaveCount(0);
    expect(await tablo()).toEqual(once);
    // Onay: bağlı iki servis birlikte değişir; adsız aynı adresli servis (Hasar) değişmez.
    await page.getByRole('button', { name: 'Çekirdek: düzenle' }).click();
    await pencere.getByLabel('TEST adresi').fill('https://api2-test.ornek.invalid');
    await pencere.getByRole('button', { name: 'Etkiyi göster' }).click();
    await pencere.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(pencere).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Taban adresleri' })).toContainText('https://api2-test.ornek.invalid');
    const { satirlar, tabanlar } = await tablo();
    for (const ad of ['Sipariş', 'Fatura']) expect(satirlar.get(ad)?.tabanlar[T]).toEqual({ deger: 'https://api2-test.ornek.invalid', kaynak: 'servis' });
    expect(satirlar.get('Hasar')?.tabanlar[T]).toEqual({ deger: 'https://api-test.ornek.invalid', kaynak: 'servis' });
    expect(tabanlar.find((x) => x.ad === 'Çekirdek')?.adresler[T]).toBe('https://api2-test.ornek.invalid');
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('yeni taban: "Hangi servisler bu adresi kullansın?" — boşlar önce, işaretsiz; seçilenler bağlanır; 390px taşma yok', async ({}, testInfo) => {
    const { page, hatalar, kapat } = await sayfaAc(390);
    await page.getByRole('button', { name: 'Taban adresi ekle' }).click();
    const pencere = page.getByRole('dialog', { name: 'Yeni taban adresi' });
    await pencere.getByLabel('Taban adresinin adı').fill('Kampanya sunucusu');
    await pencere.getByLabel('TEST adresi').fill('https://kampanya-test.ornek.invalid');
    await pencere.getByLabel('CANLI adresi').fill('https://kampanya.ornek.invalid');
    await pencere.getByRole('button', { name: 'İleri: servisleri seç' }).click();
    await expect(pencere).toContainText('Hangi servisler bu adresi kullansın?');
    const gruplar = pencere.locator('fieldset.taban-secim-grubu > legend');
    await expect(gruplar.first()).toContainText('Taban adresi boş olan servisler');
    await expect(gruplar.nth(1)).toContainText('Diğer servisler (şu anki adresleriyle)');
    const boslar = pencere.getByRole('list', { name: 'Taban adresi boş olan servisler' });
    await expect(boslar.getByRole('listitem')).toHaveCount(1);
    await expect(boslar.getByRole('listitem')).toContainText('Kampanya');
    await expect(boslar.getByRole('listitem')).toContainText('CANLI: boş');
    const digerleri = pencere.getByRole('list', { name: 'Diğer servisler (şu anki adresleriyle)' });
    await expect(digerleri.getByRole('listitem')).toHaveCount(6);
    await expect(digerleri.getByRole('listitem').filter({ hasText: 'Sipariş' })).toContainText('şu an: Çekirdek');
    for (const c of await pencere.getByRole('checkbox').all()) await expect(c).not.toBeChecked();
    await tasmaYok(page, 'dialog');
    await page.screenshot({ path: testInfo.outputPath('taban-yeni-secim-390.png') });
    await pencere.getByRole('checkbox', { name: 'Kampanya' }).check();
    await pencere.getByRole('checkbox', { name: 'Hasar' }).check();
    await pencere.getByRole('button', { name: 'Etkiyi göster' }).click();
    const etki = pencere.getByRole('region', { name: 'Değişikliğin etkisi' });
    await expect(etki).toContainText('Bu değişiklik şu 2 servisi etkiler');
    await expect(etki.getByRole('list', { name: 'Etkilenen servisler' }).locator(':scope > li').filter({ hasText: /^Kampanya \d/ }))
      .toContainText('CANLI: bu ortamda yok → https://kampanya.ornek.invalid');
    await pencere.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(pencere).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kampanya sunucusu — Kullanan: 2 servis' })).toBeVisible();
    await tasmaYok(page);
    const { satirlar } = await tablo();
    for (const ad of ['Kampanya', 'Hasar']) {
      expect(satirlar.get(ad)?.grup).toBe('Kampanya sunucusu');
      expect(satirlar.get(ad)?.tabanlar[T]).toEqual({ deger: 'https://kampanya-test.ornek.invalid', kaynak: 'servis' });
      expect(satirlar.get(ad)?.tabanlar[C]).toEqual({ deger: 'https://kampanya.ornek.invalid', kaynak: 'servis' });
    }
    expect(satirlar.get('Rapor')?.grup).toBeNull();
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('sil: adresi boş kalacak servislerin listesi + onay (Vazgeç değiştirmez); koşuda "taban adresi tanımlı değil"', async () => {
    const { page, hatalar, kapat } = await sayfaAc();
    const once = await tablo();
    await page.getByRole('button', { name: 'Kampanya sunucusu: sil' }).click();
    const pencere = page.getByRole('dialog', { name: '"Kampanya sunucusu" taban adresi silinsin mi?' });
    await expect(pencere).toContainText('Şu 2 servisin taban adresi BOŞ kalacak');
    const bos = pencere.getByRole('list', { name: 'Adresi boş kalacak servisler' });
    await expect(bos.getByRole('listitem')).toHaveText(['Hasar — CANLI, TEST', 'Kampanya — CANLI, TEST']);
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    expect(await tablo()).toEqual(once);
    await page.getByRole('button', { name: 'Kampanya sunucusu: sil' }).click();
    await pencere.getByRole('button', { name: 'Onayla ve sil' }).click();
    await expect(pencere).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Kampanya sunucusu — Kullanan/ })).toHaveCount(0);
    const { satirlar, tabanlar } = await tablo();
    expect(tabanlar.map((x) => x.ad)).toEqual(['Çekirdek']);
    expect(satirlar.get('Kampanya')?.grup).toBeNull();
    expect(satirlar.get('Kampanya')?.tabanlar[T]).toEqual({ deger: '', kaynak: 'yok' });
    // Koşu: senaryo bu ortamda koşmaz, neden anlaşılır (koşu diyaloğu / senaryo tablosu aynı nedeni kullanır; istek atılmaz).
    const s = await nobetciApi(nobetci, `/platform/servis?projeId=${projeId}&id=${id['Kampanya']}`);
    const senaryolar = s.senaryolar as Array<{ ortamlar: Array<{ ortamId: string; tanimli: boolean; neden: string }> }>;
    expect(senaryolar[0]?.ortamlar.find((o) => o.ortamId === T)).toMatchObject({ tanimli: false, neden: 'Servis "TEST" ortamında tanımlı değil: taban adresi tanımlı değil.' });
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('servis bazında görünüm (seçim hatırlanır); 390px taşma yok', async ({}, testInfo) => {
    const { page, hatalar, kapat } = await sayfaAc();
    // Açıklama örnekli; anahtarın her seçeneği ne gösterdiğini ipucunda ve seçilince yanında söyler.
    const bolum = page.locator('section.taban-adresleri');
    await expect(bolum.locator('.taban-aciklama')).toContainText('TEST: https://test.ornek.local');
    await expect(bolum.locator('.taban-aciklama')).toContainText('servisler adresin geri kalanını (yolu) kendileri ekler');
    await expect(page.getByRole('radio', { name: 'Servis bazında' })).toHaveAttribute('title', /Her servisin her ortamdaki adresi/);
    await expect(bolum.locator('.taban-gorunum-ipucu')).toContainText('Her taban adresi ve onu kullanan servisler');
    await page.getByRole('radio', { name: 'Servis bazında' }).click();
    await expect(bolum.locator('.taban-gorunum-ipucu')).toContainText('Her servisin her ortamdaki adresi tek tabloda');
    const t = page.getByRole('table', { name: 'Servis taban adresleri', exact: true });
    await expect(t.locator('tbody > tr')).toHaveCount(7);
    await expect(page.getByLabel('Sipariş: taban adres adı')).toHaveValue('Çekirdek');
    await expect(page.getByLabel('Kampanya · CANLI: adres türü')).toHaveValue('yok');
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.screenshot({ path: testInfo.outputPath('taban-servis-bazinda-390.png'), fullPage: true });
    await page.reload();
    await expect(page.getByRole('table', { name: 'Servis taban adresleri', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Servis bazında' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: 'Taban adresleri' }).click();
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('servis sayfası: taban adresi adlandırılmış tabanlardan seçilir, adres oradan gelir; "Ayarlar\'da yönet"', async ({}, testInfo) => {
    // Bağlı servis: seçim ve kaynağı gösterilir.
    const bagli = await sayfaAc(1400, `/#/servisler/s/${id['Sipariş']}/islemler`);
    const secim = bagli.page.getByRole('combobox', { name: 'Taban adresi', exact: true });
    await expect(secim).toHaveValue('Çekirdek');
    await expect(bagli.page.getByText('Adresler "Çekirdek" taban adresinden gelir')).toBeVisible();
    await expect(bagli.page.getByRole('link', { name: 'Ayarlar\'da yönet' })).toHaveAttribute('href', '#/ayarlar/proje');
    expect(bagli.hatalar).toEqual([]);
    await bagli.kapat();
    // REST servis (erişim kontrolü gerekmez): özel adresten tabana bağlanır; kaydedilince adresleri tabandan.
    const { page, hatalar, kapat } = await sayfaAc(390, `/#/servisler/s/${id['Uç']}/islemler`);
    const sec = page.getByRole('combobox', { name: 'Taban adresi', exact: true });
    await expect(sec).toHaveValue('');
    await expect(sec.locator('option')).toHaveText(['— Servise özel adres —', 'Çekirdek']);
    await sec.selectOption('Çekirdek');
    await expect(page.getByText('Adresler "Çekirdek" taban adresinden gelir')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'TEST taban adresi' })).toBeHidden();
    await tasmaYok(page);
    await page.screenshot({ path: testInfo.outputPath('servis-taban-secimi-390.png'), fullPage: true });
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Servis kaydedildi.')).toBeVisible();
    const { satirlar, tabanlar } = await tablo();
    expect(satirlar.get('Uç')?.grup).toBe('Çekirdek');
    expect(satirlar.get('Uç')?.tabanlar[T]).toEqual({ deger: 'https://api2-test.ornek.invalid', kaynak: 'servis' });
    expect(satirlar.get('Uç')?.tabanlar[C]).toEqual({ deger: 'https://api.ornek.invalid', kaynak: 'servis' });
    expect(tabanlar.find((x) => x.ad === 'Çekirdek')?.kullanan).toHaveLength(3);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('bağlı servisin adresi farklılaşırken karar penceresi: servis sayfası (Vazgeç, Ayır) ve servis bazında (Tabanın adresini güncelle)', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const { page, hatalar, kapat } = await sayfaAc(1400, `/#/servisler/s/${id['Uç']}/islemler`);
    await expect(page.getByRole('combobox', { name: 'Taban adresi', exact: true })).toHaveValue('Çekirdek');
    const adresYaz = async (adres: string) => {
      await page.getByRole('combobox', { name: 'TEST taban adresi' }).selectOption('__yeni');
      await page.getByRole('textbox', { name: 'TEST yeni taban adresi' }).fill(adres);
      await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    };
    await adresYaz('https://uc2-test.ornek.invalid');
    const pencere = page.getByRole('dialog', { name: 'Taban adresine bağlı servis' });
    await expect(pencere).toContainText('"Uç" "Çekirdek" taban adresine bağlı; yeni adres farklı');
    await expect(pencere).toContainText('https://api2-test.ornek.invalid');
    await expect(pencere.getByRole('button')).toContainText(['Vazgeç', 'Servisi tabandan ayır', 'Tabanın adresini güncelle']);
    await pencere.getByText(/"Tabanın adresini güncelle" etkisi/).click();
    await expect(pencere.getByRole('list', { name: 'Etkilenen servisler' })).toContainText('Sipariş');
    await page.screenshot({ path: testInfo.outputPath('taban-karari-pencere.png') });
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.getByText('Servis kaydedildi.')).toBeVisible();
    let { satirlar } = await tablo();
    expect(satirlar.get('Uç')).toMatchObject({ grup: 'Çekirdek', tabanlar: { [T]: { deger: 'https://api2-test.ornek.invalid', kaynak: 'servis' } } });
    // Ayır: yalnız bu servis yeni adresi kullanır.
    await page.reload();
    await adresYaz('https://uc2-test.ornek.invalid');
    await page.getByRole('dialog', { name: 'Taban adresine bağlı servis' }).getByRole('button', { name: 'Servisi tabandan ayır' }).click();
    await expect(page.getByText('Servis kaydedildi.')).toBeVisible();
    ({ satirlar } = await tablo());
    expect(satirlar.get('Uç')).toMatchObject({ grup: null, tabanlar: { [T]: { deger: 'https://uc2-test.ornek.invalid', kaynak: 'servis' } } });
    expect(satirlar.get('Sipariş')?.tabanlar[T]?.deger).toBe('https://api2-test.ornek.invalid');
    expect(hatalar).toEqual([]);
    await kapat();

    // Servis bazında: bağlı servisin hücresi değişince "Etkiyi göster"de pencere; "Tabanın adresini güncelle" → bağlı tüm servisler.
    const s2 = await sayfaAc(1400);
    await s2.page.getByRole('radio', { name: 'Servis bazında' }).click();
    await s2.page.getByLabel('Fatura · TEST: taban adres').fill('https://api3-test.ornek.invalid');
    await s2.page.getByLabel('Fatura · TEST: taban adres').press('Tab');
    await s2.page.getByRole('button', { name: 'Etkiyi göster' }).click();
    const p2 = s2.page.getByRole('dialog', { name: 'Taban adresine bağlı servis' });
    await expect(p2).toContainText('"Fatura" "Çekirdek" taban adresine bağlı');
    await p2.getByRole('button', { name: 'Tabanın adresini güncelle' }).click();
    const etki = s2.page.getByRole('region', { name: 'Değişikliğin etkisi' });
    await expect(etki).toContainText('Sipariş');
    await etki.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(s2.page.getByText(/servisin taban adresi güncellendi/)).toBeVisible();
    await expect(p2).toBeHidden();
    const son = await tablo();
    for (const ad of ['Sipariş', 'Fatura']) expect(son.satirlar.get(ad)?.tabanlar[T]?.deger).toBe('https://api3-test.ornek.invalid');
    expect(son.tabanlar.find((x) => x.ad === 'Çekirdek')?.adresler[T]).toBe('https://api3-test.ornek.invalid');
    await s2.page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(s2.page);
    expect(s2.hatalar).toEqual([]);
    await s2.kapat();
  });

  test('uzun sorgu dizili adres: uyarı + "Yine de kaydet"; tek satır hücre (ipucu, Kopyala), makul satır yüksekliği; "kaldır" temizler; 390px', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const sorgu = `?${Array.from({ length: 40 }, (_, i) => `parametre${i}=deger${i}`).join('&')}`;
    const uzun = `https://uzun.ornek.invalid/api/v1${sorgu}`;
    const { page, hatalar, kapat } = await sayfaAc();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: nobetci.adres });
    // Yeni taban: sorgu dizili adres → açık uyarı; "Yine de kaydet" ile devam edilir.
    await page.getByRole('button', { name: 'Taban adresi ekle' }).click();
    const pencere = page.getByRole('dialog', { name: 'Yeni taban adresi' });
    await pencere.getByLabel('Taban adresinin adı').fill('Uzun sunucu');
    await pencere.getByLabel('TEST adresi').fill(uzun);
    await pencere.getByLabel('CANLI adresi').fill('https://uzun-canli.ornek.invalid');
    await pencere.getByRole('button', { name: 'İleri: servisleri seç' }).click();
    const uyari = pencere.getByRole('alert').filter({ hasText: 'Taban adresinde sorgu dizisi var' });
    await expect(uyari).toContainText('servisler bunun sonuna yol ekler, genelde yanlıştır. Yine de kaydet?');
    await expect(uyari.getByRole('list', { name: 'Sorgu dizili adresler' })).toContainText('TEST: https://uzun.ornek.invalid/api/v1?parametre0');
    await expect(pencere).not.toContainText('Hangi servisler bu adresi kullansın?');
    await page.screenshot({ path: testInfo.outputPath('taban-sorgu-uyarisi.png') });
    await uyari.getByRole('button', { name: 'Yine de kaydet' }).click();
    await expect(pencere).toContainText('Hangi servisler bu adresi kullansın?');
    await pencere.getByRole('checkbox', { name: 'Rapor' }).check();
    await pencere.getByRole('button', { name: 'Etkiyi göster' }).click();
    const etki = pencere.getByRole('region', { name: 'Değişikliğin etkisi' });
    await expect(etki.getByRole('list', { name: 'Sorgu dizili adresler' })).toContainText(uzun);
    await pencere.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(pencere).toHaveCount(0);
    expect((await tablo()).tabanlar.find((x) => x.ad === 'Uzun sunucu')?.adresler[T]).toBe(uzun);

    // Tablo: satır makul yükseklikte, adres tek satır ("…"), tam adres ipucunda, İşlem düğmeleri görünür ve tek satırda.
    const t = page.getByRole('table', { name: 'Taban adresleri' });
    const satir = t.locator('tbody > tr').filter({ hasText: 'Uzun sunucu' });
    const olc = async () => satir.evaluate((tr) => {
      const kod = tr.querySelector('code.taban-adres-metni[title^="https://uzun.ornek"]') as HTMLElement;
      const d = [...tr.querySelectorAll('.taban-satir-dugmeleri button')].map((b) => b.getBoundingClientRect());
      const r = kod.getBoundingClientRect();
      return { yukseklik: tr.getBoundingClientRect().height, kodYukseklik: r.height, kesik: kod.scrollWidth > kod.clientWidth, dugmeUstleri: d.map((x) => Math.round(x.top)), dugmeYukseklik: Math.max(...d.map((x) => x.height)) };
    });
    let o = await olc();
    expect(o.yukseklik, 'satır yüksekliği').toBeLessThan(80);
    expect(o.kodYukseklik).toBeLessThan(30);
    expect(o.kesik, 'uzun adres "…" ile kesilir').toBe(true);
    expect(new Set(o.dugmeUstleri).size, 'İşlem düğmeleri tek satırda').toBe(1);
    await expect(satir.getByRole('button', { name: 'Uzun sunucu: düzenle' })).toBeVisible();
    await expect(satir.getByRole('button', { name: 'Uzun sunucu: sil' })).toBeVisible();
    await expect(satir.getByRole('button', { name: 'Uzun sunucu — Kullanan: 1 servis' })).toBeVisible();
    await expect(satir.locator('code.taban-adres-metni').filter({ hasText: 'uzun.ornek.invalid' })).toHaveAttribute('title', new RegExp(`^${uzun.replace(/[.?*+^$()[\]{}|\\/]/g, '\\$&')}\\n`));
    await expect(satir.locator('.taban-adres-sorgu').first()).toHaveText(sorgu);
    // Ortam sütun başlığında ad + tür rozeti.
    await expect(t.locator('thead th').filter({ hasText: 'TEST' })).toHaveText(/^TEST\s*Test$/);
    await expect(t.locator('thead th').filter({ hasText: 'CANLI' })).toHaveText(/^CANLI\s*Canlı$/);
    await page.screenshot({ path: testInfo.outputPath('taban-uzun-adres-masaustu.png'), fullPage: true });
    // Kopyala: panoya tam adres yazılır.
    await satir.getByRole('button', { name: 'Uzun sunucu · TEST: tam adresi kopyala' }).click();
    await expect(page.getByText('Adres panoya kopyalandı.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(uzun);
    // Pano yoksa: adres metni seçilir ve bildirilir.
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('izin yok')) }, configurable: true }); });
    await satir.getByRole('button', { name: 'Uzun sunucu · TEST: tam adresi kopyala' }).click();
    await expect(page.getByText('Panoya kopyalanamadı; adres seçildi')).toBeVisible();
    expect(await page.evaluate(() => String(window.getSelection()))).toBe(uzun);

    // 390 px: kart görünümü, taşma yok; düğmeler görünür, satır yine makul.
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    o = await olc();
    expect(o.kesik).toBe(true);
    expect(new Set(o.dugmeUstleri).size).toBe(1);
    expect(o.yukseklik).toBeLessThan(200);
    await expect(satir.getByRole('button', { name: 'Uzun sunucu: sil' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('taban-uzun-adres-390.png'), fullPage: true });

    // Servis bazında: aynı kısaltma (girdi tek satır, tam değer ipucunda), sorgu uyarısı + "Sorgu dizisini kaldır"; 390 px taşma yok.
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.getByRole('radio', { name: 'Servis bazında' }).click();
    const girdi = page.getByLabel('Rapor · TEST: taban adres');
    await expect(girdi).toHaveValue(uzun);
    await expect(girdi).toHaveAttribute('title', uzun);
    const hucre = page.locator('td').filter({ has: girdi });
    expect((await hucre.boundingBox())?.width ?? 999).toBeLessThan(400);
    await expect(hucre.getByRole('status')).toContainText('Taban adresinde sorgu dizisi var');
    await expect(hucre.getByRole('button', { name: 'Sorgu dizisini kaldır' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.getByRole('radio', { name: 'Taban adresleri' }).click();

    // Düzenle: sorgu dizili yeni adres → uyarı → "Sorgu dizisini kaldır" girdiyi temizler; kayıt sorgusuz adresle.
    await page.getByRole('button', { name: 'Uzun sunucu: düzenle' }).click();
    const duzenle = page.getByRole('dialog', { name: '"Uzun sunucu" taban adresini düzenle' });
    await duzenle.getByLabel('CANLI adresi').fill('https://uzun-canli.ornek.invalid/kok/?a=1#b');
    await duzenle.getByRole('button', { name: 'Etkiyi göster' }).click();
    const u2 = duzenle.getByRole('alert').filter({ hasText: 'Taban adresinde sorgu dizisi var' });
    // Kayıtlı (değişmeyen) TEST adresi uyarılmaz; yalnız değişen CANLI.
    await expect(u2.getByRole('listitem')).toHaveCount(1);
    await expect(u2.getByRole('listitem')).toContainText('CANLI:');
    await u2.getByRole('button', { name: 'Sorgu dizisini kaldır' }).click();
    await expect(duzenle.getByLabel('CANLI adresi')).toHaveValue('https://uzun-canli.ornek.invalid/kok');
    await expect(u2).toHaveCount(0);
    await duzenle.getByRole('button', { name: 'Etkiyi göster' }).click();
    await duzenle.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(duzenle).toHaveCount(0);
    const son = (await tablo()).tabanlar.find((x) => x.ad === 'Uzun sunucu');
    expect(son?.adresler).toEqual({ [T]: uzun, [C]: 'https://uzun-canli.ornek.invalid/kok' });
    expect(hatalar).toEqual([]);
    await kapat();
  });
});
