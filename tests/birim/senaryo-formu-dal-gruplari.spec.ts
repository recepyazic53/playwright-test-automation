// KORUMA TESTLERİ — SENARYO FORMUNDA DAL GRUPLARI: bir bölümde başka alanların görünürlüğünü belirleyen seçim (kontrol alanı) bölümün
// EN ÜSTÜNDE, kayıt gruplarından önce durur ("Önce bunu seçin"); kayıt grubu, alanlarının çoğu kontrolün bir değerine bağlıysa yalnız o
// dalda görünür ve başlığında dalı yazar ("Kayıt-1 — Kimlik tipi: Tip A"). Seçilmeyen dalın değerleri formda korunur (gizlenir), kayda
// yazılmaz; eski senaryodaki dal dışı değerler açılışta korunur, kayıtta düşülür (not gösterilir). Kontrol tablodan gelirse dal seçilen
// satırdan; bilinemiyorsa tüm dallar + "seçime göre değişir". İç içe kontrol (Farklı → Alt tip). 1440 / 390 px taşma yok; koşu
// seçili dalla geçer. Ayrı Nöbetçi, geçici veritabanı, 127.0.0.1'deki sahte sayfa; dış istek yok. Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { bolumDuzeni, grupDali, grupGorunurlugu, kosulHaritasi } from '../../scripts/platform/arayuz/senaryo-dallari.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const EKRAN = 'Dal formu';
const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
const radyo = (id: string, etiket: string, secenekler: Array<[string, string]>, ek: Nesne = {}): Nesne =>
  alan(id, 'radyo', etiket, { konum: { secici: `input[name="${id}"]`, kirilganlik: 'orta' }, secenekler: secenekler.map(([deger, metin]) => ({ deger, metin })), ...ek });
const kosul = (ifade: Nesne): Nesne => ({ gorunurluk: { ifade } });

function dalModeli(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'dal-formu', ad: EKRAN, aciklama: 'Dal grubu fikstürü (değerler sahte).', ekranUrl: '/dal', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'Bilgiler',
      bolumler: [
        // Kontrol alanı bilerek en sonda (gerçek ekrandaki gibi): form onu bölümün başına almalı.
        { id: 'kisi', baslik: 'Kişi bilgileri', alanlar: [
          alan('k1Ad', 'metin', 'Kayıt-1 adı', kosul({ alan: 'tip', esit: 'A' })),
          alan('k1No', 'metin', 'Kayıt-1 no', kosul({ alan: 'tip', esit: 'A' })),
          alan('k2Ad', 'metin', 'Kayıt-2 adı', kosul({ alan: 'tip', esit: 'B' })),
          alan('k2No', 'metin', 'Kayıt-2 no', kosul({ alan: 'tip', esit: 'B' })),
          alan('telefon', 'metin', 'Telefon'),
          radyo('tip', 'Kimlik tipi', [['A', 'Tip A'], ['B', 'Tip B']])
        ] },
        // İç içe: Farklı = Evet → Alt tip; Alt tip = Tür X → X adı, Tür Y → Y unvanı.
        { id: 'ikinci', baslik: 'İkinci düzey', alanlar: [
          alan('eAd', 'metin', 'X adı', kosul({ ve: [{ alan: 'farkli', esit: 'E' }, { alan: 'eTip', esit: 'G' }] })),
          alan('eUnvan', 'metin', 'Y unvanı', kosul({ ve: [{ alan: 'farkli', esit: 'E' }, { alan: 'eTip', esit: 'T' }] })),
          radyo('eTip', 'Alt tip', [['G', 'Tür X'], ['T', 'Tür Y']], kosul({ alan: 'farkli', esit: 'E' })),
          radyo('farkli', 'Farklı', [['E', 'Evet'], ['H', 'Hayır']])
        ] }
      ],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Alındı', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

const paket = (): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran: { anahtar: 'dal-formu', ad: EKRAN, urlYolu: '/dal' }, olusturan: 'birim testi', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
  model: dalModeli(), senaryoOnerileri: [],
  gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
  bilinmeyenler: []
});

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Dal</title></head><body>
<label><input type="radio" name="tip" value="A"> Tip A</label><label><input type="radio" name="tip" value="B"> Tip B</label>
<input id="k1Ad" type="text"><input id="k1No" type="text"><input id="k2Ad" type="text"><input id="k2No" type="text"><input id="telefon" type="text">
<label><input type="radio" name="farkli" value="E"> Evet</label><label><input type="radio" name="farkli" value="H"> Hayır</label>
<label><input type="radio" name="eTip" value="G"> Tür X</label><label><input type="radio" name="eTip" value="T"> Tür Y</label>
<input id="eAd" type="text"><input id="eUnvan" type="text">
<button id="gonder" type="button">Gönder</button><p id="sonuc"></p>
<script>
document.getElementById('gonder').addEventListener('click', async () => {
  const v = (id) => document.getElementById(id).value;
  const r = (ad) => (document.querySelector('input[name="' + ad + '"]:checked') || { value: '' }).value;
  await fetch('/gonder', { method: 'POST', body: JSON.stringify({ tip: r('tip'), k1Ad: v('k1Ad'), k2Ad: v('k2Ad'), telefon: v('telefon'), farkli: r('farkli'), eTip: r('eTip'), eAd: v('eAd') }) });
  document.getElementById('sonuc').textContent = 'Alındı';
});
</script></body></html>`;

// --- Saf modül -----------------------------------------------------------------------------------------------------------
test.describe('saf: dal düzeni (senaryo-dallari.mjs)', () => {
  const kosullar = kosulHaritasi(dalModeli());
  const bolum = (id: string) => (dalModeli().adimlar[0].bolumler as Nesne[]).find((b) => b.id === id)?.alanlar as Array<{ id: string }>;

  test('kontrol alanı bölümün başında; iç içe kontrolde üstteki önce; diğerleri özgün sırasıyla', () => {
    const k = bolumDuzeni(bolum('kisi'), kosullar);
    expect(k.kontroller.map((a) => a.id)).toEqual(['tip']);
    expect(k.digerleri.map((a) => a.id)).toEqual(['k1Ad', 'k1No', 'k2Ad', 'k2No', 'telefon']);
    const e = bolumDuzeni(bolum('ikinci'), kosullar);
    expect(e.kontroller.map((a) => a.id)).toEqual(['farkli', 'eTip']);
    expect(e.digerleri.map((a) => a.id)).toEqual(['eAd', 'eUnvan']);
    // Koşulsuz bölüm: kontrol yok.
    expect(bolumDuzeni([{ id: 'x' }, { id: 'y' }], kosullar).kontroller).toEqual([]);
  });

  test('grubun dalı: çoğu bağlıysa kontrol + değerler; yarısı ya da azı bağlıysa dal yok; iç içe eşitlikte derindeki kontrol', () => {
    expect(grupDali(['k1Ad', 'k1No'], kosullar)).toEqual({ kontrolId: 'tip', pozitif: ['A'], negatif: [] });
    expect(grupDali(['k1Ad', 'k1No', 'telefon'], kosullar)).toEqual({ kontrolId: 'tip', pozitif: ['A'], negatif: [] });
    expect(grupDali(['k1Ad', 'telefon'], kosullar)).toBeNull();
    expect(grupDali(['eAd', 'eUnvan'], kosullar)?.kontrolId).toBe('eTip');
    // "değil" altında geçen değer negatif.
    const m = new Map<string, unknown>([['x', { degil: { alan: 'k', esit: '1' } }], ['y', { degil: { alan: 'k', icinde: ['1', '2'] } }]]);
    expect(grupDali(['x', 'y'], m)).toEqual({ kontrolId: 'k', pozitif: [], negatif: ['1'] });
  });

  test('grup görünürlüğü: üyelerin yarıdan fazlası gizliyse gizli; görünür ve bilinmeyen üye varsa belirsiz', () => {
    expect(grupGorunurlugu([false, false])).toEqual({ gizli: true, belirsiz: false });
    expect(grupGorunurlugu([false, false, true])).toEqual({ gizli: true, belirsiz: false });
    expect(grupGorunurlugu([false, true])).toEqual({ gizli: false, belirsiz: false });
    expect(grupGorunurlugu([null, null])).toEqual({ gizli: false, belirsiz: true });
    expect(grupGorunurlugu([])).toEqual({ gizli: false, belirsiz: false });
  });
});

// --- Nöbetçi + sahte sayfa (127.0.0.1) -----------------------------------------------------------------------------------
test.describe('senaryo formu: dal grupları (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Dal-${randomBytes(6).toString('hex')}`;
  const gelenler: Nesne[] = [];
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  const tipSatiri: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const senaryoAl = async (id: string) => (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;
  const senaryoKaydet = async (baslik: string, veri: Nesne, ek: Nesne = {}) => String((await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId, baslik, ortamIdleri: [ortamId], kosuyaDahil: false, veri: { baslik, ...veri }, ...ek
  })).id);
  const senaryoIdBul = async (baslik: string) => {
    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    return String(liste.find((x) => x.baslik === baslik)?.id ?? '');
  };
  const tasmaYok = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  async function sayfaAc(adres: string, genislik = 1440): Promise<{ page: Page; hatalar: string[] }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(adres);
    await expect(page.locator('[data-alan="tip"]')).toBeVisible({ timeout: 20_000 });
    return { page, hatalar };
  }
  const alanKap = (page: Page, id: string): Locator => page.locator(`[data-alan="${id}"]`);
  const girdi = (page: Page, id: string): Locator => alanKap(page, id).locator('.alan-govdesi input[type="text"]');
  const grup = (page: Page, ad: string): Locator => page.locator(`.kayit-grubu[data-kayit-grubu="${ad}"]`);
  const sec = async (page: Page, id: string, metin: string) => { await alanKap(page, id).getByRole('radio', { name: metin, exact: true }).check(); };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'dal-grubu-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/dal') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
      if (i.yol === '/gonder' && i.yontem === 'POST') { gelenler.push(JSON.parse(i.govde) as Nesne); return { tur: 'application/json', govde: '{}' }; }
      return { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Dal Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === EKRAN)?.id);
    const tablo = async (govde: Nesne) => String((await basarili('/platform/tablo/kaydet', { projeId, ...govde })).tablo.id);
    const k1 = await tablo({ ad: 'Kayıt-1', tur: 'kayit', sutunlar: [{ ad: 'Ad' }, { ad: 'No' }], satirlar: [{ ad: 'bir', degerler: { Ad: 'Bir Kişi', No: '111' } }] });
    const k2 = await tablo({ ad: 'Kayıt-2', tur: 'kayit', sutunlar: [{ ad: 'Ad' }, { ad: 'No' }], satirlar: [{ ad: 'iki', degerler: { Ad: 'İki Kişi', No: '222' } }] });
    const tip = await tablo({ ad: 'Tip listesi', tur: 'liste', sutunlar: [{ ad: 'Tip' }], satirlar: [{ ad: 'tip-a', degerler: { Tip: 'A' } }, { ad: 'tip-b', degerler: { Tip: 'B' } }] });
    const t = ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((x) => x.id === tip) as Nesne;
    for (const r of t.satirlar as Nesne[]) tipSatiri[String(r.degerler.Tip)] = String(r.id);
    await basarili('/platform/ekran/alan-baglari/kaydet', {
      projeId, ekranId, baglar: {
        k1Ad: { tablo: k1, sutun: 'Ad' }, k1No: { tablo: k1, sutun: 'No' }, k2Ad: { tablo: k2, sutun: 'Ad' }, k2No: { tablo: k2, sutun: 'No' },
        tip: { tablo: tip, sutun: 'Tip' }
      }
    });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('form sırası: kontrol seçimi bölümün başında (kayıt gruplarından önce); A → yalnız Kayıt-1, B → yalnız Kayıt-2; dal değişince değerler korunur; iç içe dal; kayıtta yalnız seçili dal; 1440 / 390 px taşma yok', async () => {
    test.setTimeout(150_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const kisi = page.locator('[data-bolum="kisi"]');
    // Sıra: başlık → kontrol kutusu (Kimlik tipi) → kayıt grupları → diğer alanlar.
    const sira = await kisi.evaluate((b) => [...b.children].map((c) => (c.matches('[data-dal-kontrolleri]') ? 'kontrol' : c.matches('.kayit-grubu') ? 'grup' : c.matches('.alan-izgarasi') ? 'alanlar' : c.tagName.toLowerCase())));
    expect(sira).toEqual(['h4', 'kontrol', 'grup', 'grup', 'alanlar']);
    await expect(kisi.locator('[data-dal-kontrolleri]')).toContainText('Önce bunu seçin');
    await expect(kisi.locator('[data-dal-kontrolleri] [data-alan="tip"]')).toBeVisible();
    // Seçim yokken dal grupları sorulmaz; ortak alan görünür.
    await expect(grup(page, 'Kayıt-1')).toBeHidden();
    await expect(grup(page, 'Kayıt-2')).toBeHidden();
    await expect(alanKap(page, 'telefon')).toBeVisible();
    await sec(page, 'tip', 'Tip A');
    await expect(grup(page, 'Kayıt-1')).toBeVisible();
    await expect(grup(page, 'Kayıt-1').locator('[data-dal]')).toHaveText(' — Kimlik tipi: Tip A');
    await expect(grup(page, 'Kayıt-2')).toBeHidden();
    await expect(alanKap(page, 'k1Ad')).toBeVisible();
    await expect(alanKap(page, 'k2Ad')).toBeHidden();
    await girdi(page, 'k1Ad').fill('Elle Bir');
    await sec(page, 'tip', 'Tip B');
    await expect(grup(page, 'Kayıt-1')).toBeHidden();
    await expect(grup(page, 'Kayıt-2')).toBeVisible();
    await expect(grup(page, 'Kayıt-2').locator('[data-dal]')).toHaveText(' — Kimlik tipi: Tip B');
    await expect(alanKap(page, 'k1Ad')).toBeHidden();
    await girdi(page, 'k2Ad').fill('Elle İki');
    // Geri dönünce A dalının değeri yerinde.
    await sec(page, 'tip', 'Tip A');
    await expect(girdi(page, 'k1Ad')).toHaveValue('Elle Bir');
    await sec(page, 'tip', 'Tip B');
    await expect(girdi(page, 'k2Ad')).toHaveValue('Elle İki');
    await girdi(page, 'telefon').fill('5550001122');
    // İç içe: Farklı önce, Alt tip sonra; Evet → Alt tip; Tür X → yalnız X adı.
    const ikinci = page.locator('[data-bolum="ikinci"] [data-dal-kontrolleri]');
    expect(await ikinci.locator('[data-alan]').evaluateAll((l) => l.map((x) => x.getAttribute('data-alan')))).toEqual(['farkli', 'eTip']);
    await expect(alanKap(page, 'eTip')).toBeHidden();
    await expect(alanKap(page, 'eAd')).toBeHidden();
    await sec(page, 'farkli', 'Evet');
    await expect(alanKap(page, 'eTip')).toBeVisible();
    await sec(page, 'eTip', 'Tür X');
    await expect(alanKap(page, 'eAd')).toBeVisible();
    await expect(alanKap(page, 'eUnvan')).toBeHidden();
    await girdi(page, 'eAd').fill('İkinci Kişi');
    // Taşma: 1440 ve 390 px.
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(grup(page, 'Kayıt-2')).toBeVisible();
    await tasmaYok(page);
    expect(await kisi.locator('[data-dal-kontrolleri]').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
    expect(await grup(page, 'Kayıt-2').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
    await kisi.evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: test.info().outputPath('dal-gruplari-telefon.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('B dalı');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(() => senaryoIdBul('B dalı'), { timeout: 15_000 }).not.toBe('');
    const s = await senaryoAl(await senaryoIdBul('B dalı'));
    expect(s.veri).toMatchObject({ tip: 'B', k2Ad: 'Elle İki', telefon: '5550001122', farkli: 'E', eTip: 'G', eAd: 'İkinci Kişi' });
    expect(s.veri).not.toHaveProperty('k1Ad');
    expect(s.veri).not.toHaveProperty('eUnvan');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('eski senaryo: dal dışı değer açılışta korunur (gizli) ve not gösterilir; dal değişince geri gelir; kayıtta düşülür', async () => {
    test.setTimeout(120_000);
    const id = await senaryoKaydet('Eski dal dışı', { tip: 'A', k1Ad: 'Bir', k2Ad: 'Eski İki', telefon: '5559998877' });
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${id}`);
    const not = page.locator('[data-dal-disi]');
    await expect(not).toBeVisible();
    await expect(not).toContainText('Seçili dalın dışında 1 alanın değeri var');
    await expect(not).toContainText('Kayıt-2 adı');
    await expect(alanKap(page, 'k2Ad')).toBeHidden();
    // Değer kaybolmadı: B dalına geçince görünür (bu kez A dalı değeri dal dışında kalır).
    await sec(page, 'tip', 'Tip B');
    await expect(girdi(page, 'k2Ad')).toHaveValue('Eski İki');
    await expect(not).toContainText('Kayıt-1 adı');
    await sec(page, 'tip', 'Tip A');
    await expect(not).toContainText('Kayıt-2 adı');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect.poll(async () => (await senaryoAl(id)).veri.k2Ad ?? null, { timeout: 15_000 }).toBeNull();
    expect((await senaryoAl(id)).veri).toMatchObject({ tip: 'A', k1Ad: 'Bir', telefon: '5559998877' });
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('kontrol tablodan: satır seçilmeden tüm dallar + "seçime göre değişir"; satır seçilince dal o satırın değerinden; kayıtta yalnız o dal', async () => {
    test.setTimeout(120_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    await alanKap(page, 'tip').getByRole('button', { name: 'Kimlik tipi: Tablodan: Tip listesi › Tip' }).click();
    await expect(alanKap(page, 'tip').locator('.kaynak-kutusu')).toContainText('Tablodan: Tip listesi › Tip');
    const durum = page.locator('[data-dal-durumu="tip"]');
    await expect(durum).toContainText('seçime göre değişir');
    await expect(grup(page, 'Kayıt-1')).toBeVisible();
    await expect(grup(page, 'Kayıt-2')).toBeVisible();
    await expect(grup(page, 'Kayıt-1').locator('[data-dal-belirsiz]')).toBeVisible();
    await expect(grup(page, 'Kayıt-1').locator('[data-dal-belirsiz]')).toContainText('Seçime göre değişir');
    // Satır: B → yalnız Kayıt-2.
    const satir = page.locator('.satir-secimi-grubu[data-tablo="Tip listesi"] select').first();
    await satir.selectOption(`s:${tipSatiri.B}`);
    await expect(grup(page, 'Kayıt-1')).toBeHidden();
    await expect(grup(page, 'Kayıt-2')).toBeVisible();
    await expect(grup(page, 'Kayıt-2').locator('[data-dal-belirsiz]')).toBeHidden();
    await expect(durum).toContainText('seçilen satıra göre Tip B');
    await girdi(page, 'k2Ad').fill('Tablo dalı');
    await satir.selectOption(`s:${tipSatiri.A}`);
    await expect(grup(page, 'Kayıt-1')).toBeVisible();
    await expect(grup(page, 'Kayıt-2')).toBeHidden();
    await satir.selectOption(`s:${tipSatiri.B}`);
    await expect(girdi(page, 'k2Ad')).toHaveValue('Tablo dalı');
    await tasmaYok(page);
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Tablodan dal');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(() => senaryoIdBul('Tablodan dal'), { timeout: 15_000 }).not.toBe('');
    const s = await senaryoAl(await senaryoIdBul('Tablodan dal'));
    expect(s.veri).toMatchObject({ tip: '${Tip listesi.Tip}', k2Ad: 'Tablo dalı' });
    expect(s.veri).not.toHaveProperty('k1Ad');
    expect(Object.values(s.tabloSecimleri as Nesne)).toEqual([{ Tip: 'B' }]);
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('koşu: seçili dalla kaydedilen senaryo geçer; gizli dalın alanı sayfaya yazılmaz', async () => {
    test.setTimeout(180_000);
    const id = await senaryoIdBul('B dalı');
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: id, ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(gelenler.at(-1)).toEqual({ tip: 'B', k1Ad: '', k2Ad: 'Elle İki', telefon: '5550001122', farkli: 'E', eTip: 'G', eAd: 'İkinci Kişi' });
  });
});
