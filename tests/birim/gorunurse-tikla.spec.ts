// "YALNIZ GÖRÜNÜRSE BAS" (kosu.aksiyonlar'da { tur: 'tikla', kosul: 'gorunurse' }): genel senaryo bazı ekranlarda onay düğmesinden
// sonra bir ARA PENCERE (yöntem seçimi) açar, bazılarında doğrudan sonraki pencereye geçer. Tek model ikisini de karşılar: ara
// pencere düğmesi kısa sürede görünürse basılır, görünmezse atlanır (raporda "atlandı (görünmedi)" notu; hata değil). Testler:
// doğrulayıcı (kabul / ret), koşucu (127.0.0.1'de iki sahte sayfa: A'da ara pencere var, B'de yok; aynı model ikisinde geçer),
// akış diyagramı gidiş-dönüşü (blok "gorunurse" ↔ model), arayüzde onay kutusu, Playwright dışa aktarma çıktısı. Nötr fikstür;
// değerler sahte; dışarıya istek yok.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { adimlardanBloklar, korunanParcalari, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla, type AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { playwrightKoduUret } from '../../scripts/platform/senaryolar/playwright-disa-aktarma.mjs';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const SONUC = 'İşlem tamamlandı';
const ARA_DUGME = { tur: 'tikla', secici: '#yontemA', aciklama: 'A yöntemiyle', kosul: 'gorunurse' };

/** "İşlem": Onay (Onayla → [ara pencere: "A yöntemiyle"] → form penceresi) → Form (ad soyad, Tamamla → "İşlem tamamlandı"). */
function temelModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'islem', ad: 'İşlem', aciklama: 'Görünürse bas (nötr fikstür; değerler sahte).',
    ekranUrl: '/islem-a', girisGerekmez: true, specDosyasi: 'tests/scenarios/islem/islem.spec.ts', pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (islem)' }, kosullar: {},
    adimlar: [
      {
        id: 'onay', sira: 1, baslik: 'Onay',
        bolumler: [{ id: 'onayIslemleri', baslik: 'İşlemler', alanlar: [
          { id: 'onaylaDugmesi', tip: 'buton', etiket: { ekran: 'Onayla' }, yapilandirma: 'aksiyon', konum: { secici: '#onayla', kirilganlik: 'orta' } },
          { id: 'yontemDugmesi', tip: 'buton', etiket: { ekran: 'A yöntemiyle' }, yapilandirma: 'aksiyon', konum: { secici: '#yontemA', kirilganlik: 'orta' } }
        ] }],
        // Başarı: form penceresi açılır — ara pencereden sonra ya da (ara pencere yoksa) doğrudan; "veya" ile ara pencerenin
        // kendisi de sayılmaz, yalnız form (iki durumda da aynı öğe).
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#onayla', aciklama: 'Onayla' }, ARA_DUGME], basariGostergesi: { tur: 'veya', secenekler: [{ tur: 'eleman', deger: '#adSoyad' }, { tur: 'eleman', deger: '#tamamla' }] } }
      },
      {
        id: 'form', sira: 2, baslik: 'Form',
        bolumler: [
          { id: 'formBilgileri', baslik: 'Form', alanlar: [
            { id: 'adSoyad', tip: 'metin', etiket: { ekran: 'Ad soyad' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'adSoyad' }, konum: { secici: '#adSoyad', kirilganlik: 'orta' }, zorunlu: false }
          ] },
          { id: 'formIslemleri', baslik: 'İşlemler', alanlar: [
            { id: 'tamamlaDugmesi', tip: 'buton', etiket: { ekran: 'Tamamla' }, yapilandirma: 'aksiyon', konum: { secici: '#tamamla', kirilganlik: 'orta' } },
            { id: 'sonucMesaji', tip: 'cikti', etiket: { ekran: SONUC }, yapilandirma: 'cikti', konum: { secici: '#sonuc', kirilganlik: 'orta' } }
          ] }
        ],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#tamamla', aciklama: 'Tamamla' }], basariGostergesi: { tur: 'metin', deger: SONUC, secici: '#sonuc' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const paket = (model: Nesne): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran: { anahtar: model.id, ad: model.ad, urlYolu: model.ekranUrl }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür.' },
  model, senaryoOnerileri: [],
  gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
  bilinmeyenler: []
});
const META = { ekranAnahtari: 'islem', ekranAdi: 'İşlem', urlYolu: '/islem-a', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const adimBul = (m: Nesne, id: string): Nesne => (m.adimlar as Nesne[]).find((a) => a.id === id) as Nesne;
const dogrula = (m: Nesne): string => { try { ekranModeliniDogrula('islem.model.json', m, () => { throw new Error('yok'); }); return ''; } catch (e) { return (e as Error).message; } };

// ---- Doğrulayıcı -------------------------------------------------------------------------------------------------------------

test('doğrulayıcı: "tikla" + kosul "gorunurse" (isteğe bağlı kısa süre) geçer; bilinmeyen koşul, bekle / ekranaDon\'da kosul hata', () => {
  const m = temelModel();
  expect(dogrula(m)).toBe('');
  adimBul(m, 'onay').kosu.aksiyonlar[1] = { ...ARA_DUGME, zamanAsimiSn: 3 };
  expect(dogrula(m)).toBe('');
  expect(sayfaPaketiniDogrula(paket(m)).hatalar).toEqual([]);
  const hatali = (a: Nesne): string => { const x = temelModel(); adimBul(x, 'onay').kosu.aksiyonlar[1] = a; return dogrula(x); };
  expect(hatali({ ...ARA_DUGME, kosul: 'her zaman' })).toContain('"kosul" yalnızca "tikla" aksiyonunda gorunurse olabilir');
  expect(hatali({ tur: 'bekle', secici: '#yontemA', kosul: 'gorunurse' })).toContain('"kosul" yalnızca "tikla" aksiyonunda');
  expect(hatali({ tur: 'ekranaDon', kosul: 'gorunurse' })).toContain('"ekranaDon" aksiyonunda "secici", "metin", "durum" ve "kosul" olmaz');
  expect(hatali({ ...ARA_DUGME, zamanAsimiSn: 0 })).toContain('"zamanAsimiSn" 1–600 arasında tam sayı olmalı');
});

// ---- Akış diyagramı (saf) ----------------------------------------------------------------------------------------------------

/** Bloklar → (ayıklama) → kayıt envanteri → model (mevcut modelle eşleşerek). */
function modele(m: Nesne, bloklar: unknown): { model: Nesne; paket: Nesne; hatalar: string[] } {
  const env = modeldenAkisEnvanteri(m);
  const ayik = bloklariAyikla(kopya(bloklar));
  expect(ayik.hatalar).toEqual([]);
  const c = akistanKayitEnvanteri(env, ayik.bloklar, { korunanlar: korunanParcalari(m).parcalar });
  if (!c.envanter) return { model: {}, paket: {}, hatalar: c.hatalar.map((h) => h.mesaj) };
  const p = kayitPaketiOlustur({ ...META, mevcutModel: m }, c.envanter).paket as Nesne;
  return { model: p.model as Nesne, paket: p, hatalar: [] };
}
const bloklari = (m: Nesne): AkisBlogu[] => kopya(adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m)));
const aksiyonlar = (m: Nesne): Nesne[] => (m.adimlar as Nesne[]).map((a) => a.kosu?.aksiyonlar ?? null);

test('diyagram: görünürse düğme "Yalnız görünürse bas" aksiyon bloğu olur; blok → model → blok gidiş-dönüşü kararlı; süre ve bekleme korunur', () => {
  const m = temelModel();
  const b = bloklari(m);
  expect(b.map((x) => x.tur)).toEqual(['alanlar', 'aksiyon', 'aksiyon', 'alanlar', 'aksiyon', 'mesaj', 'bitir']);
  expect(b[1]).toMatchObject({ tur: 'aksiyon', istegeBagli: false });
  expect(b[1]).not.toHaveProperty('gorunurse');
  expect(b[2]).toMatchObject({ tur: 'aksiyon', istegeBagli: false, gorunurse: true });
  expect(b.some((x) => x.tur === 'korunan')).toBe(false);
  // Değiştirmeden kaydetmek: aksiyonlar ve başarı göstergesi aynı; model geçerli.
  const r = modele(m, b);
  expect(r.hatalar).toEqual([]);
  expect(sayfaPaketiniDogrula(r.paket).hatalar).toEqual([]);
  expect(aksiyonlar(r.model)).toEqual(aksiyonlar(m));
  expect(adimBul(r.model, 'onay').kosu.basariGostergesi).toEqual(adimBul(m, 'onay').kosu.basariGostergesi);
  expect(bloklari(r.model)).toEqual(b);

  // Kullanıcı: görünmesi için 3 sn, ardından 2 sn bekleme; onaydan sonra 1 sn bekleme.
  const yeni = [b[0], b[1], { tur: 'bekle', saniye: 1 }, { ...b[2], zamanAsimiSn: 3 }, { tur: 'bekle', saniye: 2 }, ...b.slice(3)];
  const r2 = modele(m, yeni);
  expect(r2.hatalar).toEqual([]);
  expect(adimBul(r2.model, 'onay').kosu.aksiyonlar).toEqual([
    { tur: 'tikla', secici: '#onayla', aciklama: 'Onayla' }, { tur: 'bekle', sureSn: 1 },
    { ...ARA_DUGME, zamanAsimiSn: 3 }, { tur: 'bekle', sureSn: 2 }
  ]);
  expect(dogrula(r2.model)).toBe('');
  const b2 = bloklari(r2.model);
  expect(b2.slice(1, 5)).toEqual([yeni[1], yeni[2], yeni[3], yeni[4]]);
  expect(aksiyonlar(modele(r2.model, b2).model)).toEqual(aksiyonlar(r2.model));

  // İşaret kaldırılınca düz tıklama: yeni adım olur (her senaryoda basılır).
  const { gorunurse: _g, ...duz } = b[2] as Extract<AkisBlogu, { tur: 'aksiyon' }>;
  const r3 = modele(m, [b[0], b[1], duz, ...b.slice(3)]);
  expect(r3.hatalar).toEqual([]);
  expect(JSON.stringify(aksiyonlar(r3.model))).not.toContain('gorunurse');

  // Kurallar: ilerleme düğmesinden önce gelemez; "her senaryoda basılmaz" ile birlikte seçilemez.
  expect(modele(m, [b[0], b[2], b[1], ...b.slice(3)]).hatalar.join(' ')).toContain('ilerleme düğmesinden');
  expect(modele(m, [b[0], b[1], { ...b[2], istegeBagli: true }, ...b.slice(3)]).hatalar.join(' ')).toContain('birlikte seçilemez');
});

test('diyagram: gösterilemeyen görünürse tıklama (ilerleme düğmesinden önce) korunan aksiyon olarak aynen kalır', () => {
  const m = temelModel();
  adimBul(m, 'onay').kosu.aksiyonlar = [ARA_DUGME, { tur: 'tikla', secici: '#onayla', aciklama: 'Onayla' }];
  const b = bloklari(m);
  expect(b.map((x) => x.tur)).toContain('korunan');
  const r = modele(m, b);
  expect(r.hatalar).toEqual([]);
  expect(adimBul(r.model, 'onay').kosu.aksiyonlar).toEqual([ARA_DUGME, { tur: 'tikla', secici: '#onayla', aciklama: 'Onayla' }]);
});

// ---- Playwright dışa aktarma -------------------------------------------------------------------------------------------------

test('dışa aktarma: görünürse tıklama kısa bekleme + isVisible ile koşullu click olur', () => {
  const plan = modelKosuPlani(temelModel(), { adSoyad: 'Deniz Ak' });
  expect(plan.hatalar).toEqual([]);
  const r = playwrightKoduUret({
    plan, kaynak: { ekran: 'İşlem', senaryo: 'Görünürse bas', modelSurumu: 1, ortam: 'TEST', uretim: '2026-09-28T10:00:00.000Z' },
    tabanUrl: 'http://127.0.0.1:9', girisGerekli: false, girisProfili: null, tarif: null, baglam: null,
    gizlilik: { hassasAnahtarlar: [], gizliDegerler: [], kisiselAlanIdleri: [], ekGizliAdlar: [] }
  });
  expect(r.icerik).toContain('const oge = page.locator("#yontemA").filter({ visible: true }).first();');
  expect(r.icerik).toContain("await oge.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);");
  // Görünürse güvenli tıklamayla basılır (başarı göstergesi denetimi: "veya" öğeleri).
  expect(r.icerik).toMatch(/if \(await oge\.isVisible\(\)\) await guvenliTikla\(page, oge, \d+, async \(\) => \(await page\.locator\("#adSoyad"\)/);
  // Düz tıklama da güvenli tıklamayla.
  expect(r.icerik).toContain('await guvenliTikla(page, page.locator("#onayla").filter({ visible: true }).first(), ');
});

// ---- Koşucu: 127.0.0.1'deki iki sahte sayfa ------------------------------------------------------------------------------------

/** ara: true → Onayla'dan sonra ara pencere ("A yöntemiyle"), sonra form; false → doğrudan form. Tamamla → sonuç. */
const sayfa = (ara: boolean): string => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>İşlem</title></head><body>
<h1>İşlem</h1>
<button type="button" id="onayla">Onayla</button>
<div id="yontemPenceresi" role="dialog" aria-label="Yöntem seçimi" hidden><button type="button" id="yontemA">A yöntemiyle</button></div>
<div id="formPenceresi" role="dialog" aria-label="Form" hidden>
  <label>Ad soyad <input id="adSoyad"></label>
  <button type="button" id="tamamla">Tamamla</button>
</div>
<p id="sonuc"></p><p id="yontem"></p>
<script>
const ac = (id) => { document.getElementById(id).hidden = false; };
document.getElementById('onayla').addEventListener('click', () => setTimeout(() => ac(${ara ? "'yontemPenceresi'" : "'formPenceresi'"}), 150));
document.getElementById('yontemA').addEventListener('click', () => {
  document.getElementById('yontemPenceresi').hidden = true;
  document.getElementById('yontem').textContent = 'A';
  setTimeout(() => ac('formPenceresi'), 150);
});
document.getElementById('tamamla').addEventListener('click', () => { document.getElementById('sonuc').textContent = '${SONUC}'; });
</script></body></html>`;

test.describe('koşucu: aynı model ara pencereli ve ara penceresiz ekranda geçer', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  test.beforeAll(async () => {
    sunucu = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => (i.yol === '/islem-a' ? { tur: 'text/html; charset=utf-8', govde: sayfa(true) }
      : i.yol === '/islem-b' ? { tur: 'text/html; charset=utf-8', govde: sayfa(false) } : { durum: 404, tur: 'text/plain', govde: 'yok' }));
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });

  async function kos(testInfo: TestInfo, model: Nesne): Promise<{ page: Page; hata: string | null; atlanan: unknown[]; sureMs: number; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
      tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
    };
    const s: PlatformModelSenaryosu = { id: 's1', baslik: 'İşlem', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'islem', ad: 'İşlem' }, model, modelSurumu: 1, altModeller: {}, veri: { adSoyad: 'Deniz Ak' }, mutlakaGorunmeli: [] };
    const once = testInfo.annotations.length;
    const baslangic = Date.now();
    let hata: string | null = null;
    try { await modelSenaryosunuKos(page, testInfo, s, ortam); } catch (e) { hata = (e as Error).message; }
    const sureMs = Date.now() - baslangic;
    const not = testInfo.annotations.slice(once).find((x) => x.type === 'atlananAlanlar');
    return { page, hata, atlanan: not ? JSON.parse(String(not.description)) as unknown[] : [], sureMs, kapat: () => baglam.close() };
  }

  test('ara pencere varken düğmeye basılır; yokken kısa sürede atlanır ve "atlandı (görünmedi)" notu düşer', async ({}, testInfo) => {
    test.setTimeout(90_000);
    // A: ara pencere açılır → "A yöntemiyle"ye basılır → form → Tamamla.
    const a = await kos(testInfo, { ...temelModel(), ekranUrl: '/islem-a' });
    try {
      expect(a.hata).toBeNull();
      await expect(a.page.locator('#yontem')).toHaveText('A');
      await expect(a.page.locator('#sonuc')).toHaveText(SONUC);
      expect(a.atlanan).toEqual([]);
    } finally { await a.kapat(); }
    // B: ara pencere yok → düğme 2 sn içinde görünmez, atlanır (hata değil) → form → Tamamla.
    const m = temelModel();
    m.ekranUrl = '/islem-b';
    adimBul(m, 'onay').kosu.aksiyonlar[1] = { ...ARA_DUGME, zamanAsimiSn: 2 };
    const b = await kos(testInfo, m);
    try {
      expect(b.hata).toBeNull();
      await expect(b.page.locator('#yontem')).toHaveText('');
      await expect(b.page.locator('#sonuc')).toHaveText(SONUC);
      expect(b.atlanan).toEqual([{ alan: '“A yöntemiyle” düğmesi', neden: 'atlandı (görünmedi)' }]);
      // Kısa bekleme (2 sn) adımın süresinden bağımsız: koşu adımın varsayılan süresini beklemez.
      expect(b.sureMs).toBeLessThan(20_000);
    } finally { await b.kapat(); }
  });
});

// ---- Arayüz ----------------------------------------------------------------------------------------------------------------------

test('arayüz: düğme bloğunda "Yalnız görünürse bas" işaretli gelir; kaldırılıp yeniden işaretlenince kaydedilir, yeniden açılınca korunur', async () => {
  test.setTimeout(120_000);
  const klasor = mkdtempSync(join(tmpdir(), 'gorunurse-arayuz-'));
  const PAROLA = 'Gorunurse-Arayuz-Parolasi-5';
  const vtYolu = join(klasor, 'platform.db');
  let ekran = '';
  let projeId = '';
  {
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'İşlem projesi' });
    ekran = (await sayfaEkle(vt, projeId, paket(temelModel()), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor, 'medya') })).ekranId;
    vt.kapat();
  }
  const nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const tarayici = await korumaliTarayici();
  try {
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1400 } });
    const page = await baglam.newPage();
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekran)}/akis`);
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
    const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
    const araBlok = diyagram.getByRole('listitem', { name: /^3\. blok: Aksiyon$/ });
    const kutu = araBlok.getByRole('checkbox', { name: 'Yalnız görünürse bas' });
    await expect(kutu).toBeChecked();
    await expect(araBlok.getByText('görünürse basılır', { exact: true })).toBeVisible();
    await expect(araBlok.getByText('Her senaryoda basılmaz (senaryoda seçilir)')).toHaveCount(0);
    // İlerleme düğmesinde işaret yok.
    await expect(diyagram.getByRole('listitem', { name: /^2\. blok: Aksiyon$/ }).getByRole('checkbox', { name: 'Yalnız görünürse bas' })).not.toBeChecked();
    await kutu.uncheck();
    await expect(araBlok.getByText('Her senaryoda basılmaz (senaryoda seçilir)')).toBeVisible();
    await kutu.check();
    await araBlok.getByRole('spinbutton', { name: 'Görünmesini en çok bekleme (sn)' }).fill('4');
    await araBlok.getByRole('spinbutton', { name: 'Görünmesini en çok bekleme (sn)' }).blur();
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    const onay = page.locator('dialog.onay-diyalogu');
    await expect(onay.getByRole('heading', { name: '“Ana akış” akışı kaydedilsin mi?' })).toBeVisible();
    await onay.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeHidden();
    // Sunucudaki diyagram (modelden yeniden kurulur): görünürse düğme 4 sn ile.
    const t = (await nobetciApi(nobetci, `/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekran}&akisId=ana`)) as Nesne;
    expect((t.bloklar as Nesne[]).slice(1, 3)).toEqual([
      expect.objectContaining({ tur: 'aksiyon', istegeBagli: false }), { tur: 'aksiyon', dugme: expect.any(Number), istegeBagli: false, gorunurse: true, zamanAsimiSn: 4 }
    ]);
    // Yeniden açılınca korunur.
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(kutu).toBeChecked();
    await expect(araBlok.getByRole('spinbutton', { name: 'Görünmesini en çok bekleme (sn)' })).toHaveValue('4');
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    rmSync(klasor, { recursive: true, force: true });
  }
});
