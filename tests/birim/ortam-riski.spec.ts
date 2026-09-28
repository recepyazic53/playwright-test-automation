// KORUMA TESTLERİ — "Ortam türü: Test / Canlı" KULLANICI SEÇİMİ (guvenlik/ortam-riski.mjs; tahmin yok; saklama geriye uyumlu:
// ayarlar.riskli true = Canlı, false = Test). Seçilmemiş → Canlı (güvenli taraf). Varsayılan ortam ve ad türü belirlemez (ad yalnız
// Test seçilirken onay ister). Eski canli: true Canlı sayılır ve kaydedilince riskli yazılır. Canlı → Test onay ister; her değişiklik
// geçmişe yazılır. Arayüz: ZORUNLU radyo (seçmeden kaydedilmez), "Türünü seçin" uyarısı (ortam listesi, koşu diyaloğu), koşu
// diyaloğunda CANLI ortamda "Başlat"tan sonra tek tip "CANLI ortam" onayı (Vazgeç → başlamaz; onay hatırlanmaz), masaüstü + 390 px
// taşma yok. İstek yok (127.0.0.1).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamGetir, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adCanliyiCagristiriyorMu, riskBelirtilmemisMi, riskliOrtamMi, riskliSecimi } from '../../scripts/platform/guvenlik/ortam-riski.mjs';
import { ortamTuru } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { ortamRiskliMi } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { gerekenIzinler } from '../../scripts/platform/guvenlik/uc-denetimi.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

test('saf kural: yalnız seçim; belirtilmemiş = riskli; varsayılan ve ad riski değiştirmez; eski canli geriye uyumlu', () => {
  expect(riskliOrtamMi({ ad: 'Canlı', varsayilan: false, ayarlar: { riskli: false } })).toBe(false);
  expect(riskliOrtamMi({ ad: 'TEST', varsayilan: true, ayarlar: { riskli: true } })).toBe(true);
  expect(riskliOrtamMi({ ad: 'TEST', varsayilan: true, ayarlar: {} })).toBe(true);
  expect(riskBelirtilmemisMi({ ad: 'TEST', varsayilan: true, ayarlar: {} })).toBe(true);
  expect(riskliSecimi({ ad: 'Eski', ayarlar: { canli: true } })).toBe(true);
  expect(riskliSecimi({ ad: 'Eski', ayarlar: { canli: true, riskli: false } })).toBe(false); // açık seçim kazanır
  // Arayüz görünümü (riskli: seçim, canli: etkin risk).
  expect(riskliOrtamMi({ ad: 'X', riskli: false, canli: false })).toBe(false);
  expect(riskliOrtamMi({ ad: 'X', riskli: null, canli: true })).toBe(true);
  expect(riskBelirtilmemisMi({ ad: 'X', riskli: null, canli: true })).toBe(true);
  // Tüm kullanım yerleri aynı fonksiyon.
  const o = { ad: 'HAZIRLIK', varsayilan: false, ayarlar: { riskli: false } };
  expect([ortamTuru(o), ortamRiskliMi(o)]).toEqual(['test', false]);
  expect([ortamTuru({ ...o, ayarlar: {} }), ortamRiskliMi({ ...o, ayarlar: {} })]).toEqual(['canli', true]);
  expect(adCanliyiCagristiriyorMu('PROD kopya')).toBe(true);
  expect(adCanliyiCagristiriyorMu('Hazırlık')).toBe(false);
});

test('varsayılan ortam değişince risk değişmez; canlı izni denetimi seçime bakar', async () => {
  const klasor = geciciKlasor('ortam-riski');
  try {
    const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Risk-1', { kdf: HIZLI_KDF });
    izinleriAc(vt);
    const projeId = projeKaydet(vt, { ad: 'Risk' });
    const a = ortamKaydet(vt, { projeId, ad: 'A', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const b = ortamKaydet(vt, { projeId, ad: 'B', tabanUrl: 'http://127.0.0.1:9', ayarlar: { riskli: false } });
    const risk = (id: string) => riskliOrtamMi(ortamGetir(vt, id));
    expect([risk(a), risk(b)]).toEqual([false, false]);
    ortamKaydet(vt, { id: b, projeId, ad: 'B', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    expect([ortamGetir(vt, a)?.varsayilan, risk(a), risk(b)]).toEqual([false, false, false]);
    expect(gerekenIzinler(vt, '/platform/senaryolar/calistir', { projeId, ortamId: a, senaryoId: 'yok' }).canliOnayGerekli).toBe(false);
    const c = ortamKaydet(vt, { projeId, ad: 'C', tabanUrl: 'http://127.0.0.1:9' });
    expect(gerekenIzinler(vt, '/platform/senaryolar/calistir', { projeId, ortamId: c, senaryoId: 'yok' })).toMatchObject({ canliOnayGerekli: true });
    vt.kapat();
  } finally {
    klasor.temizle();
  }
});

test.describe('ortam formu ve sunucu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Risk-${randomBytes(6).toString('hex')}`;
  let klasor = '';
  let nobetci: Nobetci;
  let tarayici: Browser;
  let projeId = '';
  let eski = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const ortamlar = async () => (await api(`/platform/ortamlar?projeId=${projeId}`)).ortamlar as Nesne[];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ortam-riski-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Risk projesi' });
    ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    eski = ortamKaydet(vt, { projeId, ad: 'Eski canlı', tabanUrl: 'http://127.0.0.1:9', ayarlar: { canli: true, digerAyar: 'korunur' } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    expect((await api('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sunucu: seçim saklanır; eski canli geriye uyumlu; Canlı → Test ve canlı adlı Test onay ister; değişiklikler geçmişte', async () => {
    let o = (await ortamlar()).find((x) => x.id === eski) as Nesne;
    expect(o).toMatchObject({ riskli: true, canli: true });
    // Seçim gönderilmeden kaydedilince eski işaret riskli: true olarak yazılır (diğer ayarlar korunur).
    await api('/platform/ortam/kaydet', { id: eski, projeId, ad: 'Eski canlı', tabanUrl: 'http://127.0.0.1:9' });
    o = (await ortamlar()).find((x) => x.id === eski) as Nesne;
    expect(o).toMatchObject({ riskli: true, canli: true });
    // Evet → Hayır onaysız reddedilir; onayla geçer.
    expect((await api('/platform/ortam/kaydet', { id: eski, projeId, ad: 'Eski canlı', tabanUrl: 'http://127.0.0.1:9', riskli: false })).mesaj).toMatch(/onaylayın/);
    expect((await api('/platform/ortam/kaydet', { id: eski, projeId, ad: 'Eski canlı', tabanUrl: 'http://127.0.0.1:9', riskli: false, onay: true })).basarili).toBe(true);
    expect((await ortamlar()).find((x) => x.id === eski)).toMatchObject({ riskli: false, canli: false });
    // Hayır → Evet serbest.
    expect((await api('/platform/ortam/kaydet', { id: eski, projeId, ad: 'Eski canlı', tabanUrl: 'http://127.0.0.1:9', riskli: true })).basarili).toBe(true);
    const { kayitlar } = await api(`/platform/gecmis?varlikTuru=ortam_riski&varlikId=${eski}`);
    expect((kayitlar as Nesne[]).map((k) => k.aciklama)).toEqual(['Ortam türü: Canlı → Test', 'Ortam türü: Test → Canlı']);
    // Belirtilmemiş yeni ortam: riskli sayılır; canlıyı çağrıştıran ada "Hayır" onay ister.
    const yeni = await api('/platform/ortam/kaydet', { projeId, ad: 'Hazırlık', tabanUrl: 'http://127.0.0.1:9' });
    expect(yeni.ortam).toMatchObject({ riskli: null, canli: true });
    expect((await api('/platform/ortam/kaydet', { projeId, ad: 'PROD kopya', tabanUrl: 'http://127.0.0.1:9', riskli: false })).mesaj).toMatch(/canlıyı çağrıştırıyor/);
    expect((await api('/platform/ortam/kaydet', { projeId, ad: 'PROD kopya', tabanUrl: 'http://127.0.0.1:9', riskli: false, onay: true })).ortam).toMatchObject({ riskli: false, canli: false });
  });

  test('arayüz: "Ortam türü" zorunlu radyo (Test / Canlı), "Türünü seçin" uyarısı (liste + koşu diyaloğu), Canlı → Test onayı; koşu diyaloğunda CANLI onayı; masaüstü ve 390 px taşma yok', async ({}, testInfo) => {
    test.setTimeout(120_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/proje');
    const satir = page.locator('.kayit-listesi li', { hasText: 'Hazırlık' });
    await expect(satir.getByRole('button', { name: /Türünü seçin/ })).toBeVisible();
    await expect(page.locator('.risk-belirtin').first()).toContainText('Ayarlar > Proje ve ortamlar');
    await satir.getByRole('button', { name: /Türünü seçin/ }).click();
    const form = page.getByRole('group', { name: /Ortam türü/ });
    await expect(form.getByRole('radio', { name: 'Test' })).not.toBeChecked();
    await expect(form.getByRole('radio', { name: 'Canlı' })).not.toBeChecked();
    // Zorunlu: tür seçilmeden kaydedilmez (sunucuya istek gitmez).
    let ortamKayitIstegi = 0;
    page.on('request', (r) => { if (r.url().includes('/platform/ortam/kaydet')) ortamKayitIstegi += 1; });
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveText('Ortam türünü seçin (Test / Canlı).');
    expect(ortamKayitIstegi).toBe(0);
    const tasma = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('ortam-riski-masaustu.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('ortam-riski-390.png'), fullPage: true });
    await page.setViewportSize({ width: 1360, height: 900 });
    await form.getByRole('radio', { name: 'Canlı' }).check();
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('.kayit-listesi li', { hasText: 'Hazırlık' }).getByText('Canlı', { exact: true })).toBeVisible();
    expect(ortamKayitIstegi).toBe(1);
    // Canlı → Test: onay penceresi; onaylanınca Canlı rozeti kalkar (Test ortamına rozet gösterilmez).
    await page.locator('.kayit-listesi li', { hasText: 'Hazırlık' }).getByRole('button', { name: 'Hazırlık: düzenle' }).click();
    await page.getByRole('group', { name: /Ortam türü/ }).getByRole('radio', { name: 'Test' }).check();
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    const onay = page.getByRole('dialog', { name: 'Ortam Test yapılsın mı?' });
    await expect(onay).toBeVisible();
    await onay.getByRole('button', { name: 'Evet, Test ortamı' }).click();
    await expect(onay).toBeHidden();
    await expect(page.locator('.kayit-listesi li', { hasText: 'Hazırlık' }).locator('.rozet.hata, .risk-belirtin-rozeti')).toHaveCount(0);
    await expect(page.locator('.kayit-listesi li', { hasText: 'Hazırlık' })).not.toContainText('Canlı');
    // Yeni ortam: tür seçilmeden kaydedilmez; Test seçilince kaydedilir.
    await page.getByRole('button', { name: /Ortam ekle/ }).click();
    const yeniForm = page.locator('form', { hasText: 'Yeni ortam' });
    await yeniForm.getByLabel('Ortam adı').fill('Yeni test');
    await yeniForm.getByLabel('Adres (link)').fill('http://127.0.0.1:9');
    await yeniForm.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(yeniForm.getByRole('group', { name: /Ortam türü/ }).getByRole('alert')).toHaveText('Ortam türünü seçin (Test / Canlı).');
    expect(ortamKayitIstegi).toBe(2);
    await yeniForm.getByRole('radio', { name: 'Test' }).check();
    await yeniForm.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('.kayit-listesi li', { hasText: 'Yeni test' })).toBeVisible();
    expect((await ortamlar()).find((x) => x.ad === 'Yeni test')).toMatchObject({ riskli: false, canli: false });
    // Belirtilmemiş ortam koşu diyaloğunda: ortam seçimi etiketi + uyarı.
    await api('/platform/ortam/kaydet', { projeId, ad: 'Belirsiz', tabanUrl: 'http://127.0.0.1:9' });
    const secenek = await page.evaluate(async () => {
      const m = await import('/arayuz/kosu-paneli.js' as string);
      const ortamlar = [{ id: 'b1', ad: 'Belirsiz', varsayilan: false, riskli: null, canli: true }, { id: 't1', ad: 'TEST', varsayilan: true, riskli: false, canli: false }];
      void m.kosuOnayi({ baslik: 'Deneme', ortamlar, ortam: ortamlar[0], hesapla: () => ({ senaryolar: [{ baslik: 'S' }] }), tur: 'tekil', esZamanli: true });
      return true;
    });
    expect(secenek).toBe(true);
    const diyalog = page.getByRole('dialog', { name: 'Deneme' });
    await expect(diyalog.getByRole('combobox')).toContainText('Belirsiz (türünü seçin)');
    await expect(diyalog.locator('.risk-belirtin')).toBeVisible();
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    // Koşu diyaloğu CANLI ortamda: "Başlat"tan sonra TEK TİP CANLI onayı (koşu diyaloğunda ayrıca onay kutusu yok).
    // Vazgeç → sonuç null ve canliOnayEki boş; Evet → sonuç ortam ve canliOnayEki BİR KEZ { canliOnay: true } (hatırlanmaz).
    const kosuDene = (id: string) => page.evaluate(async (ortamId) => {
      const m = await import('/arayuz/kosu-paneli.js' as string);
      const ortamlar = [{ id: 'c1', ad: 'Üretim', varsayilan: false, riskli: true, canli: true }, { id: 't1', ad: 'TEST', varsayilan: true, riskli: false, canli: false }];
      const o = ortamlar.find((x) => x.id === ortamId);
      (window as any).__kosu = m.kosuOnayi({ baslik: 'Koşu', ortamlar, ortam: o, hesapla: () => ({ senaryolar: [{ baslik: 'S' }] }), tur: 'tekil', esZamanli: true })
        .then((r: any) => ({ r: r ? r.ortam.id : null, ek1: m.canliOnayEki(ortamId), ek2: m.canliOnayEki(ortamId) }));
      return true;
    }, id);
    const sonucAl = () => page.evaluate(() => (window as any).__kosu);
    await kosuDene('c1');
    const kosuDiyalogu = page.getByRole('dialog', { name: 'Koşu' });
    await expect(kosuDiyalogu.locator('.not-kutusu.hata')).toContainText('Bu bir CANLI ortam');
    await expect(kosuDiyalogu.getByRole('checkbox')).toHaveCount(0);
    await kosuDiyalogu.getByRole('button', { name: /senaryoyu başlat/ }).click();
    const canliPencere = page.getByRole('dialog', { name: 'CANLI ortam' });
    await expect(canliPencere).toContainText('Bu işlem Üretim (CANLI) ortamında yapılacak; istekler gerçek sisteme gider. Emin misiniz?');
    await page.screenshot({ path: testInfo.outputPath('canli-onay-penceresi.png') });
    await canliPencere.getByRole('button', { name: 'Vazgeç' }).click();
    expect(await sonucAl()).toEqual({ r: null, ek1: {}, ek2: {} });
    await kosuDene('c1');
    await page.getByRole('dialog', { name: 'Koşu' }).getByRole('button', { name: /senaryoyu başlat/ }).click();
    await page.getByRole('dialog', { name: 'CANLI ortam' }).getByRole('button', { name: 'Evet, devam et' }).click();
    expect(await sonucAl()).toEqual({ r: 'c1', ek1: { canliOnay: true }, ek2: {} });
    // TEST ortamında CANLI penceresi çıkmaz.
    await kosuDene('t1');
    await page.getByRole('dialog', { name: 'Koşu' }).getByRole('button', { name: /senaryoyu başlat/ }).click();
    expect(await sonucAl()).toEqual({ r: 't1', ek1: {}, ek2: {} });
    await expect(page.getByRole('dialog', { name: 'CANLI ortam' })).toHaveCount(0);
    // 390 px: CANLI penceresi taşmaz.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { void import('/arayuz/ortak.js' as string).then((m) => { (window as any).__p = m.canliOnayPenceresi('Çok uzun adlı canlı ortam'); }); });
    await expect(page.getByRole('dialog', { name: 'CANLI ortam' })).toBeVisible();
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.getByRole('dialog', { name: 'CANLI ortam' }).getByRole('button', { name: 'Vazgeç' }).click();
    expect(await page.evaluate(() => (window as any).__p)).toBe(false);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
