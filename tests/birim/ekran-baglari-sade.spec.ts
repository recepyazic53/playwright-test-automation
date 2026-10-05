// UÇTAN UCA (yerel) — Ekran > "Test verisi" sekmesinin sade görünümü (arayuz/ekran-baglari.js): bağlamak gerekmeyen alanlar
// (tabloya bağlı olmayan, seçenekleri modelde tanımlı seçimler ve senaryo ayarları) en altta, varsayılan kapalı "Bağlamak gerekmeyen
// alanlar (n)" bölümündedir; bağlanınca ana listeye geçer. Sayaç yalnız ana listeyi sayar. Genel senaryodan gelen alanlarda kaynak
// rozeti ("<ad>'dan"); ekranın kendi alanlarında ve genel senaryonun kendi sayfasında yok.
// Güvenlik: yalnız 127.0.0.1'deki ayrı Nöbetçi örneği ve geçici veritabanı; uygulama sayfası açılmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Sade-Bag-${randomBytes(6).toString('hex')}`;
const ORTAK_ANAHTAR = 'odeme-ortak';
const ORTAK_AD = 'Ödeme (ortak)';
const ROZET = `${ORTAK_AD}'tan`;
const TABLO = 'Örnek veriler';

let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortakId = '';
let ekranId = '';
let tabloId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Nesne> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
const baglar = async (id: string): Promise<Nesne> => (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${id}`)) as Nesne;

const paket = (model: Nesne, ekran: Nesne): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran, olusturan: 'test', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
  model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
});

/** Genel senaryo: senaryo ayarı (ekranda alan değil, seçenekli), seçenekli seçim ve bir metin alanı. */
function ortakModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ortakAkis', id: ORTAK_ANAHTAR, ad: ORTAK_AD, aciklama: 'Ortak ödeme kısmı (nötr fikstür).', kosullar: {},
    adimlar: [{
      id: 'odeme', sira: 1, baslik: 'Ödeme bilgisi girilir',
      bolumler: [{ id: 'odemeBolumu', baslik: 'Ödeme', alanlar: [
        { id: 'odemePlani', tip: 'secim', etiket: { ekran: 'Ödeme planı' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'odemePlani' },
          konum: { secici: '#plan', kirilganlik: 'dusuk' }, secenekler: [{ deger: 'tek', metin: 'Tek çekim' }, { deger: 'uc', metin: 'Üç taksit' }], seceneklerDurumu: 'tam' },
        { id: 'kartSahibi', tip: 'metin', etiket: { ekran: 'Kart sahibi' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'kartSahibi' }, konum: { secici: '#sahip', kirilganlik: 'dusuk' } }
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#ode', aciklama: 'Öde' }], basariGostergesi: { tur: 'metin', deger: 'Tamam', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{
      id: 'odemeSekli', tip: 'secim', etiket: { ekran: null, form: 'Ödeme şekli' }, zorunlu: true, yapilandirma: 'senaryo', ekrandaAlanDegil: true,
      eslesme: { senaryo: 'odemeSekli' }, secenekler: [{ deger: 'kart', metin: 'Kart' }, { deger: 'havale', metin: 'Havale' }], seceneklerDurumu: 'tam'
    }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Genel senaryoyu kullanan ekran: kendi metin alanı + tabloya bağlanacak seçim alanı, sonra genel senaryo. */
function ekranModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'sade-ekran', ad: 'Sade ekran', aciklama: 'Genel senaryoyu kullanan ekran (nötr fikstür).', ekranUrl: '/sade/', girisGerekmez: true,
    specDosyasi: 'tests/scenarios/sade-ekran/sade-ekran.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (sade-ekran)' },
    kosullar: {},
    adimlar: [
      {
        id: 'musteri', sira: 1, baslik: 'Müşteri bilgisi girilir',
        bolumler: [{ id: 'musteriBolumu', baslik: 'Müşteri', alanlar: [
          { id: 'adSoyad', tip: 'metin', etiket: { ekran: 'Ad soyad' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'adSoyad' }, konum: { secici: '#ad', kirilganlik: 'dusuk' } },
          { id: 'sehir', tip: 'secim', etiket: { ekran: 'Şehir' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'sehir' }, konum: { secici: '#sehir', kirilganlik: 'dusuk' },
            secenekler: [{ deger: 'a', metin: 'Birinci' }, { deger: 'b', metin: 'İkinci' }], seceneklerDurumu: 'tam' }
        ] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#plan' } }
      },
      { id: 'odemeAdimi', sira: 2, baslik: 'Ödeme', ortakAkis: { dosya: `${ORTAK_ANAHTAR}.model.json` } }
    ],
    senaryoDuzeyi: { alanlar: [] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'ekran-baglari-sade-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Sade Bağ Projesi' })).proje.id);
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ortakModel(), { anahtar: ORTAK_ANAHTAR, ad: ORTAK_AD }), senaryoIndeksleri: [], ortamIdleri: [] });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ekranModel(), { anahtar: 'sade-ekran', ad: 'Sade ekran', urlYolu: '/sade/' }), senaryoIndeksleri: [], ortamIdleri: [] });
  const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
  ortakId = String(ekranlar.find((e) => e.anahtar === ORTAK_ANAHTAR)?.id);
  ekranId = String(ekranlar.find((e) => e.anahtar === 'sade-ekran')?.id);
  tabloId = String((await basarili('/platform/tablo/kaydet', {
    projeId, ad: TABLO, sutunlar: [{ ad: 'Şehir' }, { ad: 'Plan' }], satirlar: [{ ad: 'Satır 1', degerler: { Şehir: 'Birinci', Plan: 'Tek çekim' } }]
  })).tablo.id);
  // "Şehir" seçim alanının seçenekleri tablodan gelir (bağlı): ana listede kalır.
  await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { sehir: { tablo: tabloId, sutun: 'Şehir' } } });
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function sayfa(genislik: number): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}
async function tasmaYok(page: Page): Promise<void> {
  const tasma = await page.evaluate(() => {
    const kok = document.documentElement;
    const bolum = [...document.querySelectorAll<HTMLElement>('.gerekmez-bolum, .ekran-baglari')].filter((b) => b.scrollWidth > b.clientWidth + 1).length;
    return { sayfa: kok.scrollWidth - kok.clientWidth, bolum };
  });
  expect(tasma).toEqual({ sayfa: 0, bolum: 0 });
}

test('uç: genel senaryodan gelen alanlar kaynağıyla (genel senaryonun kendi sayfasında kaynak yok)', async () => {
  const e = await baglar(ekranId);
  const kaynak = Object.fromEntries((e.girdiler as Nesne[]).map((g) => [g.id, g.kaynak ?? null]));
  expect(kaynak).toEqual({
    adSoyad: null, sehir: null,
    odemePlani: { id: ortakId, ad: ORTAK_AD }, kartSahibi: { id: ortakId, ad: ORTAK_AD }, odemeSekli: { id: ortakId, ad: ORTAK_AD }
  });
  expect((e.girdiler as Nesne[]).find((g) => g.id === 'odemeSekli')).toMatchObject({ senaryoAyari: true, modeldeSecenek: true });
  const o = await baglar(ortakId);
  expect((o.girdiler as Nesne[]).filter((g) => g.kaynak)).toEqual([]);
});

for (const genislik of [1440, 390]) {
  test(`arayüz (${genislik} px): ana listede yalnız bağlanması anlamlı alanlar; kapalı bölümde 2 alan; bağlanan ana listeye geçer; rozet ve sayaç; taşma yok`, async () => {
    test.setTimeout(90_000);
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { sehir: { tablo: tabloId, sutun: 'Şehir' } } });
    const { page, istekler } = await sayfa(genislik);
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
    const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
    const ana = kart.locator('.alan-formu.ekran-baglari').first();
    const anaAlanlar = () => ana.locator(':scope > .alan-satiri[data-alan]').evaluateAll((l) => l.map((x) => (x as HTMLElement).dataset.alan));
    await expect.poll(anaAlanlar).toEqual(['adSoyad', 'sehir', 'kartSahibi']);
    // Sayaç: bağlamak gerekmeyenler "bağlı değil" sayılmaz (Ad soyad + Kart sahibi).
    await expect(kart.locator('.bag-sayaci')).toHaveText('3 alan · 2 bağlı değil');

    // Kapalı bölüm: erişilebilir adında sayı ve durum; içindeki seçimler gizli.
    const bolum = kart.getByRole('region', { name: 'Bağlamak gerekmeyen alanlar' });
    const dugme = bolum.getByRole('button', { name: 'Bağlamak gerekmeyen alanlar, 2 alan, kapalı', exact: true });
    await expect(dugme).toHaveAttribute('aria-expanded', 'false');
    await expect(dugme).toHaveText('Bağlamak gerekmeyen alanlar (2)');
    await expect(bolum.getByRole('combobox')).toHaveCount(0);
    await expect(bolum.getByRole('combobox', { includeHidden: true })).toHaveCount(2);
    // Bölüm listenin en altında.
    expect((await bolum.boundingBox())?.y ?? 0).toBeGreaterThan((await ana.boundingBox())?.y ?? 0);
    await dugme.click();
    await expect(bolum.getByRole('button', { name: 'Bağlamak gerekmeyen alanlar, 2 alan, açık', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(bolum.getByText('Seçenekleri modelde tanımlı ya da senaryoda seçilen ayarlar; isterseniz yine bir tablo sütununa bağlayabilirsiniz.')).toBeVisible();
    await expect(bolum.getByText('Ekranda alan değil · senaryo ayarı')).toBeVisible();
    const plan = bolum.getByRole('combobox', { name: 'Ödeme planı tablo sütunu' });
    await expect(plan.locator('option:checked')).toHaveText('— seçenekler ekranda tanımlı (bağlamak gerekmez) —');
    await expect(bolum.getByRole('combobox', { name: 'Ödeme şekli tablo sütunu' })).toBeVisible();

    // Kaynak rozeti: genel senaryodan gelenlerde var, ekranın kendi alanlarında yok.
    const satir = (id: string) => kart.locator(`.alan-satiri[data-alan="${id}"]`);
    await expect(satir('kartSahibi').locator('.kaynak-rozeti')).toHaveText(ROZET);
    await expect(satir('odemePlani').locator('.kaynak-rozeti')).toHaveText(ROZET);
    await expect(satir('odemeSekli').locator('.kaynak-rozeti')).toHaveText(ROZET);
    await expect(satir('adSoyad').locator('.kaynak-rozeti')).toHaveCount(0);
    await expect(satir('sehir').locator('.kaynak-rozeti')).toHaveCount(0);
    await tasmaYok(page);

    // Bölümdeki alan bağlanınca ana listeye geçer ve kaydedilir; sayaç ve bölüm sayısı güncellenir.
    await plan.focus();
    await plan.selectOption({ label: `${TABLO} → Plan` });
    await expect(kart.getByText('✓ Kaydedildi')).toBeVisible();
    await expect.poll(async () => (await baglar(ekranId)).baglar).toEqual({ sehir: { tablo: tabloId, sutun: 'Şehir' }, odemePlani: { tablo: tabloId, sutun: 'Plan' } });
    await expect.poll(anaAlanlar).toEqual(['adSoyad', 'sehir', 'odemePlani', 'kartSahibi']);
    await expect(ana.getByRole('combobox', { name: 'Ödeme planı tablo sütunu' })).toBeFocused();
    await expect(kart.locator('.bag-sayaci')).toHaveText('4 alan · 2 bağlı değil');
    await expect(bolum.getByRole('button', { name: 'Bağlamak gerekmeyen alanlar, 1 alan, açık', exact: true })).toBeVisible();
    await page.reload();
    await expect.poll(anaAlanlar).toEqual(['adSoyad', 'sehir', 'odemePlani', 'kartSahibi']);
    await expect(bolum.getByRole('button', { name: 'Bağlamak gerekmeyen alanlar, 1 alan, kapalı', exact: true })).toBeVisible();
    await tasmaYok(page);

    // Genel senaryonun kendi sayfası: kaynak rozeti yok; bağlamak gerekmeyenler yine en altta.
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ortakId)}/veri`);
    const oKart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
    await expect(oKart.getByRole('button', { name: 'Bağlamak gerekmeyen alanlar, 2 alan, kapalı', exact: true })).toBeVisible();
    await expect(oKart.getByRole('combobox', { name: 'Kart sahibi tablo sütunu' })).toBeVisible();
    await expect(oKart.locator('.kaynak-rozeti')).toHaveCount(0);
    await tasmaYok(page);
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
    await page.close();
  });
}
