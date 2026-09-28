// KORUMA TESTLERİ — "Bu ortam riskli mi?" KULLANICI SEÇİMİ (guvenlik/ortam-riski.mjs; tahmin yok). Evet → riskli, Hayır → riskli
// değil, belirtilmemiş → riskli (güvenli taraf). Varsayılan ortam ve ad riski belirlemez (ad yalnız "Hayır"da onay ister). Eski
// canli: true "Evet" sayılır ve kaydedilince riskli yazılır. Evet → Hayır onay ister; her değişiklik geçmişe yazılır. Arayüz: radyo
// soru, "Riskli mi? belirtin" uyarısı (ortam listesi, koşu diyaloğu, servis sayfası), masaüstü + 390 px taşma yok. İstek yok (127.0.0.1).
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

  test('sunucu: seçim saklanır; eski canli geriye uyumlu; Evet → Hayır ve canlı adlı "Hayır" onay ister; değişiklikler geçmişte', async () => {
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
    expect((kayitlar as Nesne[]).map((k) => k.aciklama)).toEqual(['Riskli mi: Evet → Hayır', 'Riskli mi: Hayır → Evet']);
    // Belirtilmemiş yeni ortam: riskli sayılır; canlıyı çağrıştıran ada "Hayır" onay ister.
    const yeni = await api('/platform/ortam/kaydet', { projeId, ad: 'Hazırlık', tabanUrl: 'http://127.0.0.1:9' });
    expect(yeni.ortam).toMatchObject({ riskli: null, canli: true });
    expect((await api('/platform/ortam/kaydet', { projeId, ad: 'PROD kopya', tabanUrl: 'http://127.0.0.1:9', riskli: false })).mesaj).toMatch(/canlıyı çağrıştırıyor/);
    expect((await api('/platform/ortam/kaydet', { projeId, ad: 'PROD kopya', tabanUrl: 'http://127.0.0.1:9', riskli: false, onay: true })).ortam).toMatchObject({ riskli: false, canli: false });
  });

  test('arayüz: radyo soru, "Riskli mi? belirtin" uyarısı (liste + koşu diyaloğu), Evet → Hayır onayı; masaüstü ve 390 px taşma yok', async ({}, testInfo) => {
    test.setTimeout(120_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/proje');
    const satir = page.locator('.kayit-listesi li', { hasText: 'Hazırlık' });
    await expect(satir.getByRole('button', { name: /Riskli mi\? belirtin/ })).toBeVisible();
    await expect(page.locator('.risk-belirtin').first()).toContainText('Ayarlar > Proje ve ortamlar');
    await satir.getByRole('button', { name: /Riskli mi\? belirtin/ }).click();
    const form = page.getByRole('group', { name: /Bu ortam riskli mi\?/ });
    await expect(form.getByRole('radio', { name: 'Evet' })).not.toBeChecked();
    await expect(form.getByRole('radio', { name: 'Hayır' })).not.toBeChecked();
    const tasma = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('ortam-riski-masaustu.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('ortam-riski-390.png'), fullPage: true });
    await page.setViewportSize({ width: 1360, height: 900 });
    await form.getByRole('radio', { name: 'Evet' }).check();
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('.kayit-listesi li', { hasText: 'Hazırlık' }).getByText('Riskli', { exact: true })).toBeVisible();
    // Evet → Hayır: onay penceresi; vazgeçilince kaydedilmez, onaylanınca risk rozeti kalkar ("Riskli değil" rozeti gösterilmez).
    await page.locator('.kayit-listesi li', { hasText: 'Hazırlık' }).getByRole('button', { name: 'Hazırlık: düzenle' }).click();
    await page.getByRole('group', { name: /Bu ortam riskli mi\?/ }).getByRole('radio', { name: 'Hayır' }).check();
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    const onay = page.getByRole('dialog', { name: 'Ortam "riskli değil" yapılsın mı?' });
    await expect(onay).toBeVisible();
    await onay.getByRole('button', { name: 'Evet, riskli değil' }).click();
    await expect(onay).toBeHidden();
    await expect(page.locator('.kayit-listesi li', { hasText: 'Hazırlık' }).locator('.rozet.hata, .risk-belirtin-rozeti')).toHaveCount(0);
    await expect(page.locator('.kayit-listesi li', { hasText: 'Hazırlık' })).not.toContainText('Riskli');
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
    await expect(diyalog.getByRole('combobox')).toContainText('Belirsiz (riskli mi? belirtin)');
    await expect(diyalog.locator('.risk-belirtin')).toBeVisible();
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
