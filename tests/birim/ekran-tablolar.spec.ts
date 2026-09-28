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
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { ornekBasvuruModeli } from './model-fikstur';

type Nesne = Record<string, any>;

const ROTA_EKRANI = 'Rota seçimi';

/** Küçük nötr ekran paketi: Kapsam / Alternatif seçenekleri modelde, Ülke listesi yalnız tablodan; Sorgu tipi sayfa değerli. */
function rotaPaketi(): Nesne {
  const secim = (deger: string, metin: string, ek: Nesne = {}) => ({ deger, metin, ...ek });
  const alan = (id: string, etiket: string, secici: string, ek: Nesne = {}) => ({
    id, tip: 'secim', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' },
    zorunlu: false, doldurucu: 'secimGerekirse', ...ek
  });
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { proje: 'Örnek', ekran: { anahtar: 'rota-secimi', ad: ROTA_EKRANI, urlYolu: '/rota/' }, olusturan: 'birim testi', olusturulma: '2026-09-25T09:00:00Z', baglamProfilleri: [] },
    model: {
      semaSurumu: 2, tur: 'ekran', id: 'rota-secimi', ad: ROTA_EKRANI, aciklama: 'Tablo bağlantısı fikstürü (değerler sahte).',
      ekranUrl: '/rota/', specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, girisGerekmez: true, kosullar: {},
      adimlar: [{
        id: 'bilgiler', sira: 1, baslik: 'Rota bilgileri girilir',
        bolumler: [{
          id: 'rota', baslik: 'Rota', alanlar: [
            alan('kapsam', 'Kapsam', '#kapsam', { seceneklerDurumu: 'tam', secenekler: [secim('BÖLGE-1', 'BÖLGE-1'), secim('BÖLGE-2', 'BÖLGE-2')] }),
            alan('plan', 'Plan', '#plan', { seceneklerDurumu: 'tam', secenekler: [secim('1', 'Plan 1'), secim('2', 'Plan 2')] }),
            alan('alternatif', 'Alternatif', '#alternatif', {
              seceneklerDurumu: 'tam', secenekler: [secim('SEÇENEK A', 'SEÇENEK A'), secim('SEÇENEK B', 'SEÇENEK B'), secim('SEÇENEK C', 'SEÇENEK C')]
            }),
            alan('ulke', 'Ülke', '#ulke', { seceneklerDurumu: 'bilinmiyor', secenekler: null, seceneklerKaynagi: 'Test verisi tablosu (Ülke sütunu).' }),
            alan('sorguTipi', 'Sorgu tipi', '#sorgu', {
              varsayilan: { deger: 'tekli' },
              secenekler: [secim('1', 'Tekli', { senaryoDegeri: 'tekli', formMetni: 'Tekli' }), secim('2', 'Çoklu', { senaryoDegeri: 'coklu', formMetni: 'Çoklu' })]
            })
          ]
        }]
      }],
      senaryoDuzeyi: { aciklama: 'Ekran alanı olmayan ayarlar.', alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
      urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
    },
    senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
    bilinmeyenler: []
  };
}

test('tablo bağlantılarından koşullu listeler: formdaki sırayla yukarıdan aşağı süzülür', () => {
  const tablo = { id: 't', ad: 'Rota', sutunlar: [{ ad: 'Kapsam', gizli: false }, { ad: 'Alternatif', gizli: false }, { ad: 'Ülke', gizli: false }], satirlar: [
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
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', {
      projeId, paket: rotaPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId]
    });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === ROTA_EKRANI)?.id);
    girdiler = (await basarili(`/platform/ekran/girdiler?projeId=${projeId}&ekranId=${ekranId}`)).girdiler;
    K = girdi('kapsam').secenekler.map((x: Nesne) => x.deger).slice(0, 2);
    A = girdi('alternatif').secenekler.map((x: Nesne) => x.deger).slice(0, 3);
    // Ülke seçenekleri modelde yok (kodda liste tutulmaz); değerler yalnız tablodan gelir.
    expect(girdi('ulke').secenekler).toEqual([]);
    U = ['ALMANYA', 'FRANSA', 'A.B.D', 'İSPANYA', 'İTALYA'];
    tabloId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Rota seçenekleri', sutunlar: [{ ad: 'Kapsam' }, { ad: 'Alternatif' }, { ad: 'Ülke' }], satirlar: [
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

  test('bağlantı kaydedilince modeldeki sayfa değerleri sütunun karşılıklarına eklenir; kullanıcının karşılığı değişmez; senaryo formu sayfa değerini taşır', async () => {
    const sorguId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Sorgu', sutunlar: [{ ad: 'Sorgu tipi', karsiliklar: { coklu: { servis: 'MULTI' } } }],
      satirlar: [{ degerler: { 'Sorgu tipi': 'tekli' } }, { degerler: { 'Sorgu tipi': 'coklu' } }] })).tablo.id;
    const baglar = (await basarili(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar;
    const r = await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { ...baglar, sorguTipi: { tablo: sorguId, sutun: 'Sorgu tipi' } } });
    expect(r.karsiliklar).toEqual({ eklenen: 2, tablolar: ['Sorgu'] });
    const sutun = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === sorguId).sutunlar[0];
    expect(sutun.karsiliklar).toEqual({ tekli: { sayfa: '1' }, coklu: { servis: 'MULTI', sayfa: '2' } });
    // Kullanıcı sayfa değerini değiştirdiyse yeniden almak ezmez.
    await basarili('/platform/tablo/kaydet', { projeId, id: sorguId, ad: 'Sorgu', sutunlar: [{ ad: 'Sorgu tipi', eskiAd: 'Sorgu tipi', karsiliklar: { tekli: { sayfa: '01' }, coklu: { sayfa: '2' } } }] });
    expect(await basarili('/platform/ekran/karsiliklari-al', { projeId, ekranId })).toMatchObject({ eklenen: 0 });
    const f = await basarili(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`);
    expect(f.degerListeleri.find((l: Nesne) => l.hedef.alan === 'sorguTipi' && !l.kosullar.length).degerler).toEqual([{ deger: 'tekli', ekranDegeri: '01' }, { deger: 'coklu', ekranDegeri: '2' }]);
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
    // Tablodan seçenekleri (${Tablo.Sütun}) ayrı grupta: satırdan süzülen değerler onlarsız karşılaştırılır.
    const degerler = async (id: string) => (await secim(id).locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).filter((v) => v && !v.startsWith('${'));
    await expect(secim('kapsam')).toBeVisible();
    expect(await degerler('kapsam')).toEqual(K);
    await expect(secim('kapsam').locator('optgroup[label="Test verisi tablosundan"] option')).toHaveAttribute('value', '${Rota seçenekleri.Kapsam}');
    await secim('kapsam').selectOption(K[0]);
    await expect.poll(() => degerler('alternatif')).toEqual([A[0], A[1]]);
    await secim('alternatif').selectOption(A[0]);
    await expect.poll(() => degerler('ulke')).toEqual([U[0], U[1]]);
    await secim('kapsam').selectOption(K[1]);
    await expect.poll(() => degerler('alternatif')).toEqual([A[2]]);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: gizli sütun (ör. CVV) metin alanına bağlanır (seçim alanına sunulmaz, değer gösterilmez); senaryo formunda "Tablodan" başvuru yazar', async () => {
    test.setTimeout(60_000);
    const GIZLI = 'GIZLI-DEGER-9173';
    const kartId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kart', sutunlar: [{ ad: 'Kart adı' }, { ad: 'CVV', gizli: true }],
      satirlar: [{ ad: 'test', degerler: { 'Kart adı': 'Deneme', CVV: GIZLI } }] })).tablo.id;
    // Metin alanlı örnek ekran (rota modelinde metin alanı yok).
    const model = ornekBasvuruModeli() as unknown as Nesne;
    const bEkranId = String((await basarili('/platform/sayfa-paketi/ekle', { projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId], paket: {
      tur: 'sayfa-paketi', surum: 1, meta: { ekran: { anahtar: String(model.id), ad: String(model.ad), urlYolu: String(model.ekranUrl) }, olusturan: 'test', olusturulma: new Date().toISOString(), baglamProfilleri: [] },
      model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: true, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
    } })).ekranId);
    const tumGirdiler = (await basarili(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${bEkranId}`)).girdiler as Nesne[];
    const metin = tumGirdiler.find((g) => g.tip === 'metin') as Nesne;
    const secimAlani = tumGirdiler.find((g) => g.tip === 'secim') as Nesne;
    expect(metin, 'rota modelinde metin alanı').toBeTruthy();
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/ekranlar/e/${bEkranId}/veri`);
    const bolum = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
    const sec = (g: Nesne) => bolum.getByLabel(`${g.etiket} tablo sütunu`);
    // Seçim alanı gizli sütunu listelemez; metin alanı "(gizli)" etiketiyle listeler.
    await expect(sec(secimAlani).locator(`option[value="${kartId}\u0001CVV"]`)).toHaveCount(0);
    await expect(sec(metin).locator(`option[value="${kartId}\u0001CVV"]`)).toHaveText('Kart → CVV (gizli)');
    await sec(metin).selectOption(`${kartId}\u0001CVV`);
    await expect(bolum.getByText('✓ Kaydedildi')).toBeVisible();
    await expect(bolum.getByText('gizli sütun: değer şifreli')).toBeVisible();
    await expect(bolum.getByText(GIZLI)).toHaveCount(0);
    // Senaryo formu: gizli bağ değer listesinde yok, "Tablodan" yalnız başvuruyu yazar.
    const f = await basarili(`/platform/senaryo/form?projeId=${projeId}&ekranId=${bEkranId}&ortamId=${ortamId}`);
    expect(f.gizliBaglar).toEqual({ [metin.id]: { tablo: 'Kart', sutun: 'CVV' } });
    expect(JSON.stringify(f)).not.toContain(GIZLI);
    await page.goto(`/#/senaryolar/yeni/${bEkranId}`);
    const alan = page.locator(`[data-alan="${metin.id}"]`);
    await alan.getByRole('button', { name: /Tablodan: Kart → CVV/ }).click();
    await expect(alan.locator('input[type="text"]')).toHaveValue('${Kart.CVV}');
    await expect(page.getByText(GIZLI)).toHaveCount(0);
    // Alan başlığındaki "Tablodan" / "Bilerek boş bırak" yandaki alanın etiketine binmez: başlık öğeleri kendi alan kutusunda
    // kalır (dar ızgarada alt satıra iner).
    for (let genislik = 700; genislik <= 1500; genislik += 40) {
      await page.setViewportSize({ width: genislik, height: 1000 });
      const tasanlar = await page.locator('.model-alani').evaluateAll((alanlar) => alanlar.flatMap((a) => {
        const k = a.getBoundingClientRect();
        if (!k.width) return [];
        return [...a.querySelectorAll('.alan-ust *')].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.left < k.left - 1 || r.right > k.right + 1);
        }).map((e) => `${a.getAttribute('data-alan')}: ${(e.textContent || '').trim().slice(0, 30)}`);
      }));
      expect(tasanlar, `${genislik}px`).toEqual([]);
    }
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
