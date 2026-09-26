// KORUMA TESTLERİ — ekran input'ları test verisi tablolarına bağlanır (ekran sayfası > "Test verisi" sekmesi, anında kayıt).
// Bağlı seçim alanlarının seçenekleri tablodan gelir; aynı tablodaki alanlar senaryo formunda seçtikçe birbirini süzer
// (Kapsam → Alternatif → Ülke; koşul tanımı yok). Model (doğrulayıcı / koşu) aynı listeleri görür. Yalnız yerel sunucu.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { birlesikDegerler, eslesenListeler, type ParametreTanimi } from '../../scripts/platform/servisler/parametre-tanimlari.mjs';
import { tabloDegerListeleri } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { jetSeyahatAkisPaketi } from '../../projeler/galaksi/jetseyahat-akis.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;

test('tablo bağlantılarından koşullu listeler: formdaki sırayla yukarıdan aşağı süzülür', () => {
  const tablo = { id: 't', ad: 'Seyahat', sutunlar: [{ ad: 'Kapsam', gizli: false }, { ad: 'Alternatif', gizli: false }, { ad: 'Ülke', gizli: false }], satirlar: [
    ['D', 'V', 'ALMANYA'], ['D', 'V', 'FRANSA'], ['D', 'P', 'ABD'], ['A', 'S', 'ALMANYA'], ['A', 'P', 'İSPANYA']
  ].map(([k, a, u]) => ({ ortamId: null, degerler: { Kapsam: k, Alternatif: a, Ülke: u } })) };
  // Bağlantıların sırası karışık; formdaki sıra kapsam → alternatif → ülke.
  const listeler = tabloDegerListeleri({ ulke: { tablo: 't', sutun: 'Ülke' }, kapsam: { tablo: 't', sutun: 'Kapsam' }, alternatif: { tablo: 't', sutun: 'Alternatif' } }, [tablo], 'e', ['kapsam', 'plan', 'alternatif', 'ulke']) as unknown as ParametreTanimi[];
  const secenek = (alan: string, d: Record<string, string>) => birlesikDegerler(eslesenListeler(listeler, (l) => l.hedef?.alan === alan, (a) => d[a])).map((x) => x.deger);
  expect(secenek('kapsam', {})).toEqual(['D', 'A']);
  expect(secenek('alternatif', { kapsam: 'D' })).toEqual(['V', 'P']);
  expect(secenek('ulke', { kapsam: 'D' })).toEqual(['ALMANYA', 'FRANSA', 'ABD']);
  expect(secenek('ulke', { kapsam: 'D', alternatif: 'V' })).toEqual(['ALMANYA', 'FRANSA']);
  // Alttaki seçim üsttekini daraltmaz (kapsam değiştirilebilir; uyumsuz alt seçimi form temizler).
  expect(secenek('kapsam', { ulke: 'İSPANYA', alternatif: 'V' })).toEqual(['D', 'A']);
  expect(secenek('alternatif', { ulke: 'ALMANYA' })).toEqual(['V', 'P', 'S']);
});

test.describe('ekran alanları tablolardan', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-ETablo-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let tabloId = '';
  let girdiler: Nesne[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const girdi = (id: string) => girdiler.find((g) => g.id === id) as Nesne;
  let K: string[] = [];
  let A: string[] = [];
  let U: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ekran-tablo-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Ekran Tablo Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', {
      projeId, paket: jetSeyahatAkisPaketi({ havuzlar: { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', acente: 'Acente' }, girissiz: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
    });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'JetSeyahat (akış)')?.id);
    girdiler = (await basarili(`/platform/ekran/girdiler?projeId=${projeId}&ekranId=${ekranId}`)).girdiler;
    K = girdi('kapsam').secenekler.map((x: Nesne) => x.deger).slice(0, 2);
    A = girdi('alternatif').secenekler.map((x: Nesne) => x.deger).slice(0, 3);
    U = girdi('ulke').secenekler.map((x: Nesne) => x.deger).slice(1, 6);
    tabloId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Seyahat seçenekleri', sutunlar: [{ ad: 'Kapsam' }, { ad: 'Alternatif' }, { ad: 'Ülke' }], satirlar: [
      [K[0], A[0], U[0]], [K[0], A[0], U[1]], [K[0], A[1], U[2]], [K[1], A[2], U[3]]
    ].map(([k, a, u]) => ({ degerler: { Kapsam: k, Alternatif: a, Ülke: u } })) })).tablo.id;
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('arayüz: "Test verisi" sekmesinde input\'lar tablo sütunlarına bağlanır (adı aynı sütunlar önerilir; anında kayıt)', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/ekranlar/e/${ekranId}/veri`);
    const bolum = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
    await expect(bolum).toBeVisible();
    const sec = (id: string) => bolum.getByLabel(`${girdi(id).etiket} tablo sütunu`);
    await sec('kapsam').selectOption(`${tabloId}\u0001Kapsam`);
    await sec('alternatif').selectOption(`${tabloId}\u0001Alternatif`);
    await sec('ulke').selectOption(`${tabloId}\u0001Ülke`);
    await expect(bolum.getByText('✓ Kaydedildi')).toBeVisible();
    await expect.poll(async () => (await basarili(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar).toEqual({
      kapsam: { tablo: tabloId, sutun: 'Kapsam' }, alternatif: { tablo: tabloId, sutun: 'Alternatif' }, ulke: { tablo: tabloId, sutun: 'Ülke' }
    });
    await page.reload();
    await expect(sec('ulke')).toHaveValue(`${tabloId}\u0001Ülke`);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: senaryo formunda bağlı alanlar tablodan; Kapsam → Alternatif → Ülke süzülür; model aynı listeleri görür', async () => {
    test.setTimeout(60_000);
    // Model (doğrulayıcı / koşu): Ülke'nin bağımlılık haritası tablodan.
    const f = await basarili(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`);
    expect(f.degerListeleri.some((l: Nesne) => l.hedef.alan === 'ulke' && l.kosullar.length === 2)).toBe(true);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/senaryolar/yeni/${ekranId}`);
    const secim = (id: string) => page.locator(`[data-alan="${id}"] select`);
    const degerler = async (id: string) => (await secim(id).locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).filter(Boolean);
    await expect(secim('kapsam')).toBeVisible();
    expect(await degerler('kapsam')).toEqual(K);
    await secim('kapsam').selectOption(K[0]);
    await expect.poll(() => degerler('alternatif')).toEqual([A[0], A[1]]);
    await secim('alternatif').selectOption(A[0]);
    await expect.poll(() => degerler('ulke')).toEqual([U[0], U[1]]);
    await secim('kapsam').selectOption(K[1]);
    await expect.poll(() => degerler('alternatif')).toEqual([A[2]]);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
