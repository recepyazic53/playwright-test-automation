// KORUMA TESTLERİ — TABLO BAĞI UYUMU (tablolar/tablo-uyumu.mjs; sunucu ve arayüz ORTAK). Seçenekleri modelde tanımlı alan bir tablo
// sütununa bağlıysa sütun değerleri sayfadaki seçeneklerle karşılaştırılır (değer, metin, sütunun "sayfa" karşılığı; harf ve Türkçe
// karakter farkı gözetilmez). Hiçbiri eşleşmiyorsa güçlü, bir kısmı eşleşmiyorsa zayıf uyarı; kısmi seçenekli alanda uyarı yok.
// Gösterim: Ekran > Test verisi satırı (seçim anında), senaryo formunda alanın altı, Veri sağlığı > "Uyumsuz tablo bağları".
// Güvenlik: yalnız 127.0.0.1'deki ayrı Nöbetçi örneği ve geçici veritabanı; uygulama sayfası açılmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloSecenekUyumu, uyumNormal } from '../../scripts/platform/tablolar/tablo-uyumu.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const SECENEKLER = [{ deger: 'Y', metin: 'Yabancı Kimlik No' }, { deger: 'P', metin: 'Pasaport' }];
const ALAN = { etiket: 'Kişinin Kimlik Tipi', secenekler: SECENEKLER, seceneklerDurumu: 'tam' };
const KARSILIK = { Özel: { sayfa: 'O' }, Tüzel: { sayfa: 'T' }, Pasaport: { sayfa: 'P' } };
const GUCLU_METIN = '“Kişinin Kimlik Tipi” bu tablodaki Özel, Tüzel değerlerini sayfada bulamaz (sayfadaki seçenekler: Yabancı Kimlik No, Pasaport)';

test.describe('tablo bağı uyumu (saf)', () => {
  test('tam uyumsuz: hiçbir değer (ne kendisi ne sayfa karşılığı) sayfada yok → güçlü uyarı', () => {
    const u = tabloSecenekUyumu(ALAN, { karsiliklar: KARSILIK }, ['Özel', 'Tüzel', 'Özel', '', null]);
    expect(u).toMatchObject({ duzey: 'guclu', eslesmeyen: ['Özel', 'Tüzel'], eslesen: 0, toplam: 2 });
    expect(u?.metin).toBe(GUCLU_METIN);
  });
  test('kısmi uyumsuz: bir kısmı eşleşiyor → zayıf uyarı; tek değer "değerini"', () => {
    const u = tabloSecenekUyumu(ALAN, { karsiliklar: KARSILIK }, ['Özel', 'Pasaport']);
    expect(u).toMatchObject({ duzey: 'zayif', eslesmeyen: ['Özel'], eslesen: 1 });
    expect(u?.metin).toBe('“Kişinin Kimlik Tipi” bu tablodaki Özel değerini sayfada bulamaz (sayfadaki seçenekler: Yabancı Kimlik No, Pasaport)');
  });
  test('karşılık koduyla, metinle, harf ve Türkçe karakter farkıyla uyumlu → uyarı yok', () => {
    expect(tabloSecenekUyumu(ALAN, { karsiliklar: { Yabancı: { sayfa: 'y' } } }, ['Yabancı', 'PASAPORT', 'yabanci kimlik no', 'p', '${Tablo.Sütun}'])).toBeNull();
    expect(uyumNormal('  İĞNE  ÇÖŞÜ ı ')).toBe('igne cosu i');
    // Sayfa değeri / sayfa metni (liste kaydı) de sayılır.
    expect(tabloSecenekUyumu({ etiket: 'X', secenekler: [{ deger: 'a', metin: 'A', ekranDegeri: '01', ekranMetni: 'Birinci' }] }, {}, ['01', 'birinci'])).toBeNull();
  });
  test('kısmi / bilinmiyor / dinamik seçenekli alanda, gizli ya da boş sütunda, seçeneksiz alanda uyarı yok', () => {
    for (const durum of ['kismi', 'bilinmiyor', 'dinamik']) expect(tabloSecenekUyumu({ ...ALAN, seceneklerDurumu: durum }, {}, ['Özel'])).toBeNull();
    expect(tabloSecenekUyumu(ALAN, { gizli: true }, ['Özel'])).toBeNull();
    expect(tabloSecenekUyumu(ALAN, {}, ['', null])).toBeNull();
    expect(tabloSecenekUyumu({ etiket: 'X', secenekler: [] }, {}, ['Özel'])).toBeNull();
    // Durumu yazılmamış (eski) model: tam sayılır.
    expect(tabloSecenekUyumu({ etiket: 'X', secenekler: SECENEKLER }, {}, ['Özel'])?.duzey).toBe('guclu');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Uçtan uca (yerel)
// ---------------------------------------------------------------------------------------------------------------------------

const PAROLA = `Gecici-Uyum-${randomBytes(6).toString('hex')}`;
const TABLO = 'Kişi tipleri';
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ekranId = '';
let tabloId = '';
let ortamId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Nesne> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}

/** Ekran: radyo "Kişinin Kimlik Tipi" (seçenekler tam) ve kısmi seçenekli "Belge türü". */
function ekranModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'uyum-ekrani', ad: 'Uyum ekranı', aciklama: 'Tablo bağı uyumu (nötr fikstür).', ekranUrl: '/uyum/', girisGerekmez: true,
    specDosyasi: 'tests/scenarios/uyum-ekrani/uyum-ekrani.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (uyum-ekrani)' },
    kosullar: {},
    adimlar: [{
      id: 'kisi', sira: 1, baslik: 'Kişi bilgisi',
      bolumler: [{ id: 'kisiBolumu', baslik: 'Kişi', alanlar: [
        { id: 'kimlikTipi', tip: 'radyo', etiket: { ekran: 'Kişinin Kimlik Tipi' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'kimlikTipi' },
          konum: { secici: '[name=tip]', kirilganlik: 'dusuk' }, secenekler: SECENEKLER, seceneklerDurumu: 'tam' },
        { id: 'belgeTuru', tip: 'secim', etiket: { ekran: 'Belge türü' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'belgeTuru' },
          konum: { secici: '#belge', kirilganlik: 'dusuk' }, secenekler: [{ deger: 'P', metin: 'Pasaport' }], seceneklerDurumu: 'kismi' }
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'metin', deger: 'Tamam', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

test.describe('tablo bağı uyumu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'tablo-bag-uyumu-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Uyum Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId], paket: {
      tur: 'sayfa-paketi', surum: 1, meta: { ekran: { anahtar: 'uyum-ekrani', ad: 'Uyum ekranı', urlYolu: '/uyum/' }, olusturan: 'test', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
      model: ekranModel(), senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
    } });
    ekranId = String(((await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[]).find((e) => e.anahtar === 'uyum-ekrani')?.id);
    // Grup: hiçbiri sayfada yok (güçlü); Tip: Pasaport var (zayıf); Uyumlu: karşılık koduyla / metinle hepsi var.
    tabloId = String((await basarili('/platform/tablo/kaydet', {
      projeId, ad: TABLO,
      sutunlar: [{ ad: 'Grup', karsiliklar: { Özel: { sayfa: 'O' }, Tüzel: { sayfa: 'T' } } }, { ad: 'Tip', karsiliklar: KARSILIK }, { ad: 'Uyumlu', karsiliklar: { Yabancı: { sayfa: 'Y' } } }],
      satirlar: [
        { ad: 'Bir', degerler: { Grup: 'Özel', Tip: 'Özel', Uyumlu: 'Yabancı' } },
        { ad: 'İki', degerler: { Grup: 'Tüzel', Tip: 'Tüzel', Uyumlu: 'pasaport' } },
        { ad: 'Üç', degerler: { Grup: 'Özel', Tip: 'Pasaport', Uyumlu: 'Yabancı' } }
      ]
    })).tablo.id);
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { kimlikTipi: { tablo: tabloId, sutun: 'Grup' }, belgeTuru: { tablo: tabloId, sutun: 'Grup' } } });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sunucu: Veri sağlığında "Uyumsuz tablo bağı" (kısmi seçenekli alan yok); senaryo formu bağlamında alan uyarısı', async () => {
    const s = await api(`/platform/tablolar/veri-sagligi?projeId=${projeId}`);
    expect(s.uyumsuzBaglar).toEqual([{
      ekranId, ekran: 'Uyum ekranı', alanId: 'kimlikTipi', alan: 'Kişinin Kimlik Tipi', tablo: TABLO, sutun: 'Grup', duzey: 'guclu', metin: GUCLU_METIN,
      git: `#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`
    }]);
    const f = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`);
    expect(f.tabloUyumsuzluklari).toEqual({ kimlikTipi: { duzey: 'guclu', metin: GUCLU_METIN } });
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
  const tasmaYok = async (page: Page): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };

  for (const genislik of [1440, 390]) {
    test(`arayüz (${genislik} px): Test verisi satırında anında uyarı (güçlü / zayıf / yok); senaryo formunda ve Veri sağlığında; taşma yok`, async () => {
      test.setTimeout(90_000);
      const { page, istekler } = await sayfa(genislik);
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
      const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
      const satir = kart.locator('.alan-satiri[data-alan="kimlikTipi"]');
      const not = satir.locator('.tablo-uyumu');
      await expect(not).toHaveClass(/guclu/);
      await expect(not).toContainText(GUCLU_METIN);
      // Seçim kutusunun açıklaması uyarıdır (ekran okuyucu).
      await expect(kart.getByRole('combobox', { name: 'Kişinin Kimlik Tipi tablo sütunu' })).toHaveAccessibleDescription(/sayfada bulamaz/);
      // Kısmi seçenekli alan: uyarı yok.
      await expect(kart.locator('.alan-satiri[data-alan="belgeTuru"] .tablo-uyumu')).toHaveCount(0);
      await tasmaYok(page);
      // Bağ seçilirken anında: zayıf → yok → yeniden güçlü (kaydedilir).
      const sec = kart.getByRole('combobox', { name: 'Kişinin Kimlik Tipi tablo sütunu' });
      await sec.selectOption({ label: `${TABLO} → Tip` });
      await expect(not).toHaveClass(/zayif/);
      await expect(not).toContainText('“Kişinin Kimlik Tipi” bu tablodaki Özel, Tüzel değerlerini sayfada bulamaz');
      await sec.selectOption({ label: `${TABLO} → Uyumlu` });
      await expect(not).toHaveCount(0);
      await sec.selectOption({ label: `${TABLO} → Grup` });
      await expect(not).toHaveClass(/guclu/);
      await expect(kart.getByText('✓ Kaydedildi')).toBeVisible();

      // Senaryo formu: alanın altında uyarı; kısmi seçenekli alanda yok.
      await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`);
      const formNotu = page.locator('[data-alan="kimlikTipi"] .tablo-uyumu');
      await expect(formNotu).toBeVisible();
      await expect(formNotu).toContainText(GUCLU_METIN);
      await expect(page.locator('[data-alan="belgeTuru"] .tablo-uyumu')).toHaveCount(0);
      await tasmaYok(page);

      // Veri sağlığı: "Uyumsuz tablo bağları" bölümünde ekran ve alan adıyla, ekranın Test verisi sekmesine bağlantı.
      await page.goto('/#/veri');
      const saglik = page.getByRole('region', { name: 'Veri sağlığı' });
      const bag = saglik.getByRole('link', { name: 'Uyumsuz tablo bağı: Uyum ekranı · Kişinin Kimlik Tipi' });
      await expect(bag).toBeVisible();
      await expect(bag).toHaveAttribute('href', `#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
      await expect(saglik.getByText(/Belge türü/)).toHaveCount(0);
      await tasmaYok(page);
      await bag.click();
      await expect(page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' }).locator('.alan-satiri[data-alan="kimlikTipi"] .tablo-uyumu')).toBeVisible();
      expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
      await page.close();
    });
  }
});
