// AKIŞ DİYAGRAMI — ALAN GRUBUNDAN SONRA BEKLENEN MESAJ + "DOLDURDUKTAN SONRA" TUŞU: bazı uyarılar düğmeye basılmadan, alan
// doldurulup alandan çıkınca (Tab / Enter) görünür (ör. telefon eksik bırakılınca "zorunludur"). Diyagramda beklenen mesaj bir
// alan grubundan sonra da gelebilir: model karşılığı o (düğmesiz) adımın kosu.basariGostergesi / kosu.uyarilar'ı; alan satırındaki
// "Doldurduktan sonra" seçimi alanın doldurucuParametreleri.tus'u. Testler: saf gidiş-dönüş (blok → model → blok), veritabanı
// üzerinden kaydet → oku, koşucu (127.0.0.1'deki sahte sayfa: alandan Tab ile çıkınca uyarı / onay metni), arayüz (mesaj ekleme,
// tuş seçimi, ipucu). Nötr fikstür ("Başvuru"); değerler sahte; dışarıya istek yok.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranModeliGetir, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { adimlardanBloklar, akisKaydet, akisTasarimi, korunanParcalari, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla, type AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const alan = (id: string, tip: string, etiket: string, secici: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
const UYARI = 'Telefon numarası zorunludur';
const ONAY = 'Telefon doğrulandı';

/** "Başvuru": İletişim (ad soyad, telefon — Tab'la çıkılır; eksikse uyarı) → Kayıt (Kaydet → "Başvuru alındı"). */
function temelModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'basvuru', ad: 'Başvuru', aciklama: 'Alan sonrası mesaj (nötr fikstür; değerler sahte).',
    ekranUrl: '/basvuru', girisGerekmez: true, specDosyasi: 'tests/scenarios/basvuru/basvuru.spec.ts', pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (basvuru)' }, kosullar: {},
    adimlar: [
      {
        id: 'iletisim', sira: 1, baslik: 'İletişim',
        bolumler: [{ id: 'iletisimBilgileri', baslik: 'İletişim bilgileri', alanlar: [
          alan('adSoyad', 'metin', 'Ad soyad', '#adSoyad'),
          alan('telefon', 'telefon', 'Telefon', '#telefon', { doldurucuParametreleri: { tus: 'Tab' } })
        ] }],
        kosu: { uyarilar: [{ metin: UYARI }] }
      },
      {
        id: 'kayit', sira: 2, baslik: 'Kayıt',
        bolumler: [{ id: 'kayitIslemleri', baslik: 'İşlemler', alanlar: [
          { id: 'kaydetDugmesi', tip: 'buton', etiket: { ekran: 'Kaydet' }, yapilandirma: 'aksiyon', konum: { secici: '#kaydet', kirilganlik: 'orta' } },
          { id: 'sonucMesaji', tip: 'cikti', etiket: { ekran: 'Başvuru alındı' }, yapilandirma: 'cikti', konum: { secici: '#sonuc', kirilganlik: 'orta' } }
        ] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Başvuru alındı', secici: '#sonuc' } }
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
const META = { ekranAnahtari: 'basvuru', ekranAdi: 'Başvuru', urlYolu: '/basvuru', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const adimBul = (m: Nesne, id: string): Nesne => (m.adimlar as Nesne[]).find((a) => a.id === id) as Nesne;
const alanBul = (m: Nesne, id: string): Nesne => (m.adimlar as Nesne[]).flatMap((a) => a.bolumler.flatMap((b: Nesne) => b.alanlar)).find((a: Nesne) => a.id === id) as Nesne;

/** Bloklar → (ayıklama) → kayıt envanteri → model (mevcut modelle eşleşerek). */
function modele(m: Nesne, bloklar: unknown): { model: Nesne; paket: Nesne } {
  const env = modeldenAkisEnvanteri(m);
  const ayik = bloklariAyikla(kopya(bloklar));
  expect(ayik.hatalar).toEqual([]);
  const c = akistanKayitEnvanteri(env, ayik.bloklar, { korunanlar: korunanParcalari(m).parcalar });
  expect(c.hatalar).toEqual([]);
  const p = kayitPaketiOlustur({ ...META, mevcutModel: m }, c.envanter as NonNullable<typeof c.envanter>).paket as Nesne;
  return { model: p.model as Nesne, paket: p };
}
const bloklari = (m: Nesne): AkisBlogu[] => kopya(adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m)));
/** Koşunun ilgilendiği kısımlar (adım, aksiyonlar, göstergeler, alanların tuşu). */
const ozet = (m: Nesne): Nesne[] => (m.adimlar as Nesne[]).map((a) => ({
  id: a.id, baslik: a.baslik, aksiyonlar: a.kosu?.aksiyonlar ?? null, basari: a.kosu?.basariGostergesi ?? null, uyarilar: a.kosu?.uyarilar ?? null,
  tuslar: a.bolumler.flatMap((b: Nesne) => b.alanlar).filter((x: Nesne) => x.yapilandirma === 'senaryo').map((x: Nesne) => [x.id, x.doldurucuParametreleri?.tus ?? null])
}));

test('saf: modelden diyagram → alan grubundan sonra uyarı + tuş seçimi; blok → model → blok gidiş-dönüşü kararlı', () => {
  const m = temelModel();
  const b = bloklari(m);
  // Düğmesiz adımın uyarısı alan grubundan hemen sonra; telefonun tuşu alan grubunda.
  expect(b.map((x) => x.tur)).toEqual(['alanlar', 'mesaj', 'alanlar', 'aksiyon', 'mesaj', 'bitir']);
  expect(b[0]).toMatchObject({ ad: 'İletişim', alanlar: ['adSoyad', 'telefon'], tuslar: { telefon: 'Tab' } });
  expect(b[1]).toMatchObject({ tur: 'mesaj', metin: UYARI, uyari: true });
  // Değiştirmeden kaydetmek: model aynı (adım kimlikleri, tuş, uyarı, aksiyonlar, göstergeler).
  const { model: m2, paket: p2 } = modele(m, b);
  expect(sayfaPaketiniDogrula(p2).hatalar).toEqual([]);
  expect(ozet(m2)).toEqual(ozet(m));
  expect(bloklari(m2)).toEqual(b);

  // Kullanıcı: alan grubundan sonra bir BAŞARI mesajı ekler, ad soyad'a Enter seçer, telefonun tuşunu kaldırır; aksiyonu doğrudan
  // mesajın ardına koyar (adım adı için boş grup olmadan) ve mesajdan sonra 2 sn bekleme koyar.
  const yeni = [
    { ...b[0], tuslar: { adSoyad: 'Enter', telefon: null } },
    { tur: 'mesaj', mesaj: null, metin: ONAY }, b[1], { tur: 'bekle', saniye: 2 }, b[3], b[4], b[5]
  ];
  const { model: m3, paket: p3 } = modele(m, yeni);
  expect(sayfaPaketiniDogrula(p3).hatalar).toEqual([]);
  expect(ozet(m3)).toEqual([
    { id: 'iletisim', baslik: 'İletişim', aksiyonlar: [{ tur: 'bekle', sureSn: 2 }], basari: { tur: 'metin', deger: ONAY }, uyarilar: [{ metin: UYARI }], tuslar: [['adSoyad', 'Enter'], ['telefon', null]] },
    { id: 'kayit', baslik: 'Kaydet', aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basari: { tur: 'metin', deger: 'Başvuru alındı', secici: '#sonuc' }, uyarilar: null, tuslar: [] }
  ].map((x, i) => (i === 1 ? { ...x, id: (m3.adimlar as Nesne[])[1].id } : x)));
  // Tuş kaldırılınca doldurucuParametreleri de kalkar (boş nesne bırakılmaz).
  expect(alanBul(m3, 'telefon').doldurucuParametreleri).toBeUndefined();
  // Model → blok → model: aynı model (bekleme mesajdan önce görünür; anlamı aynı: alanlardan sonra).
  const b3 = bloklari(m3);
  expect(b3.slice(0, 4).map((x) => x.tur)).toEqual(['alanlar', 'bekle', 'mesaj', 'mesaj']);
  expect(b3[0]).toMatchObject({ tuslar: { adSoyad: 'Enter' } });
  expect(ozet(modele(m3, b3).model)).toEqual(ozet(m3));
  // Verilmeyen tuş (tuslar yok) eşleşen tanımınkini korur.
  const { tuslar: _t, ...tussuz } = b[0] as Extract<AkisBlogu, { tur: 'alanlar' }>;
  expect(alanBul(modele(m, [tussuz, ...b.slice(1)]).model, 'telefon').doldurucuParametreleri).toEqual({ tus: 'Tab' });
  // Ayıklama: yalnız Tab / Enter / null; bilinmeyen tuş atılır (mevcut ayar korunur).
  expect(bloklariAyikla([{ tur: 'alanlar', ad: 'A', alanlar: ['a', 'b', 'c'], zorunlu: [], tuslar: { a: 'Tab', b: 'Escape', c: null, d: 'Enter' } }]).bloklar[0])
    .toMatchObject({ tuslar: { a: 'Tab', c: null } });
});

test('doğrulayıcı: doldurucuParametreleri.tus tuş adı olmalı; düğmesiz adımın göstergesi / uyarısı geçerli', () => {
  const dogrula = (m: Nesne) => { try { ekranModeliniDogrula('basvuru.model.json', m, () => { throw new Error('yok'); }); return ''; } catch (e) { return (e as Error).message; } };
  const m = temelModel();
  adimBul(m, 'iletisim').kosu.basariGostergesi = { tur: 'metin', deger: ONAY };
  expect(dogrula(m)).toBe('');
  alanBul(m, 'telefon').doldurucuParametreleri.tus = 'Tab; alert(1)';
  expect(dogrula(m)).toContain('"tus" bir tuş adı olmalı');
});

test.describe('veritabanı: diyagram → kaydet → yeniden oku', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let projeId: string;
  let ekranId: string;
  test.beforeEach(async () => {
    klasor = geciciKlasor('alan-sonrasi');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Alan-Sonrasi-Kasa-Parolasi-7', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    ekranId = (await sayfaEkle(vt, projeId, paket(temelModel()), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor.yol, 'medya') })).ekranId;
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });

  test('alan grubundan sonra başarı mesajı ve tuşlar kaydedilir; yeniden açılınca korunur, değiştirmeden kaydetmek modeli değiştirmez', () => {
    const model = (): Nesne => (ekranModeliGetir(vt, ekranId) as { model: Nesne }).model;
    const tasarim = (): AkisBlogu[] => akisTasarimi(vt, projeId, ekranId, { akisId: 'ana' }).bloklar;
    const kaydet = (b: AkisBlogu[]) => akisKaydet(vt, projeId, ekranId, { akisId: 'ana', ad: 'Ana akış', bloklar: kopya(b), onay: true }) as Nesne;
    const b = tasarim();
    expect(b[0]).toMatchObject({ tur: 'alanlar', tuslar: { telefon: 'Tab' } });
    const grup = b[0] as Extract<AkisBlogu, { tur: 'alanlar' }>;
    expect(kaydet([{ ...grup, tuslar: { adSoyad: 'Enter', telefon: 'Tab' } }, { tur: 'mesaj', mesaj: null, metin: ONAY }, ...b.slice(1)])).toMatchObject({ surum: 2 });
    const m = model();
    expect(adimBul(m, 'iletisim').kosu).toEqual({ basariGostergesi: { tur: 'metin', deger: ONAY }, uyarilar: [{ metin: UYARI }] });
    expect(alanBul(m, 'adSoyad').doldurucuParametreleri).toEqual({ tus: 'Enter' });
    expect(alanBul(m, 'telefon').doldurucuParametreleri).toEqual({ tus: 'Tab' });
    const ikinci = tasarim();
    expect(ikinci.slice(0, 3)).toMatchObject([
      { tur: 'alanlar', tuslar: { adSoyad: 'Enter', telefon: 'Tab' } }, { tur: 'mesaj', metin: ONAY }, { tur: 'mesaj', metin: UYARI, uyari: true }
    ]);
    kaydet(ikinci);
    expect(model().adimlar).toEqual(m.adimlar);
  });
});

// ---- Koşucu: 127.0.0.1'deki sahte sayfa ----------------------------------------------------------------------------------------

/** Telefon alanından çıkınca (blur): 10 hane değilse uyarı, 10 haneyse onay metni; Kaydet → "Başvuru alındı". */
const BASVURU_SAYFASI = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Başvuru</title></head><body>
<h1>Başvuru</h1>
<label>Ad soyad <input id="adSoyad" name="adSoyad"></label>
<label>Telefon <input id="telefon" name="telefon" type="tel"></label>
<p id="telefonUyari"></p><p id="telefonDurum"></p>
<button type="button" id="kaydet">Kaydet</button>
<p id="sonuc"></p>
<script>
const t = document.getElementById('telefon');
t.addEventListener('blur', () => {
  const n = t.value.replace(/\\D/g, '').length;
  document.getElementById('telefonUyari').textContent = n === 10 ? '' : '${UYARI} (10 hane).';
  document.getElementById('telefonDurum').textContent = n === 10 ? '${ONAY}' : '';
});
document.getElementById('kaydet').addEventListener('click', () => { document.getElementById('sonuc').textContent = 'Başvuru alındı'; });
</script></body></html>`;

test.describe('koşucu: alan grubundan sonra beklenen mesaj (düğmesiz adım)', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  test.beforeAll(async () => {
    sunucu = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => (i.yol === '/basvuru'
      ? { tur: 'text/html; charset=utf-8', govde: BASVURU_SAYFASI } : { durum: 404, tur: 'text/plain', govde: 'yok' }));
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });

  /** Diyagramdan model: İletişim (telefon Tab) → onay (başarı) + uyarı → Kaydet → "Başvuru alındı". Adımın sonucu en çok 3 sn beklenir. */
  function kosuModeli(tus: string | null = 'Tab'): Nesne {
    const m = temelModel();
    const b = bloklari(m);
    const { model, paket: p } = modele(m, [{ ...b[0], tuslar: { telefon: tus } }, { tur: 'mesaj', mesaj: null, metin: ONAY }, ...b.slice(1)]);
    expect(sayfaPaketiniDogrula(p).hatalar).toEqual([]);
    adimBul(model, 'iletisim').kosu.zamanAsimiSn = 3;
    return model;
  }
  async function kos(testInfo: TestInfo, model: Nesne, veri: Nesne): Promise<{ page: Page; hata: string | null; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
      tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
    };
    const s: PlatformModelSenaryosu = { id: 's1', baslik: 'Başvuru', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'basvuru', ad: 'Başvuru' }, model, modelSurumu: 1, altModeller: {}, veri, mutlakaGorunmeli: [] };
    let hata: string | null = null;
    try { await modelSenaryosunuKos(page, testInfo, s, ortam); } catch (e) { hata = (e as Error).message; }
    return { page, hata, kapat: () => baglam.close() };
  }

  test('başarı bekleyen senaryo: Tab ile alandan çıkınca mesaj görülürse adım geçer; tuş yoksa ya da uyarı çıkarsa kalır', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const gecerli = { adSoyad: 'Deniz Ak', telefon: '5321234567' };
    // Tab'a basılır → onay metni görünür → adım geçer; sonra Kaydet.
    const a = await kos(testInfo, kosuModeli(), gecerli);
    try {
      expect(a.hata).toBeNull();
      await expect(a.page.locator('#telefonDurum')).toHaveText(ONAY);
      await expect(a.page.locator('#sonuc')).toHaveText('Başvuru alındı');
    } finally { await a.kapat(); }
    // Tuş seçilmemiş: alandan çıkılmaz, mesaj görünmez → adım kalır (Kaydet'e basılmaz).
    const b = await kos(testInfo, kosuModeli(null), gecerli);
    try {
      expect(b.hata).toContain('başarı göstergesi görünmedi');
      expect(b.hata).toContain(ONAY);
      await expect(b.page.locator('#sonuc')).toHaveText('');
    } finally { await b.kapat(); }
    // Eksik telefon: kabul edilen uyarı görünür → başarı bekleyen senaryo kalır.
    const c = await kos(testInfo, kosuModeli(), { ...gecerli, telefon: '532' });
    try {
      expect(c.hata).toContain(UYARI);
      await expect(c.page.locator('#sonuc')).toHaveText('');
    } finally { await c.kapat(); }
  });

  test('iş kuralı uyarısı bekleyen senaryo: telefon boş bırakılır, alana girilip Tab\'a basılır, uyarı görülürse geçer; görülmezse kalır', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const model = kosuModeli();
    const bs = (model.senaryoDuzeyi.alanlar as Nesne[]).find((x) => x.tip === 'birlesim');
    expect(bs, 'uyarılı adım için "Beklenen sonuç" alanı').toBeTruthy();
    const hataBekle = { tip: 'isKuraliHatasi', adim: 'iletisim', mesaj: UYARI };
    // Plan: boş telefon "yalnız tuş" olarak adımda (yalnız beklenen hata adımında).
    const plan = modelKosuPlani(model, { adSoyad: 'Deniz Ak', beklenenSonuc: hataBekle });
    expect(plan.hatalar).toEqual([]);
    expect(plan.adimlar[0].alanlar.map((x) => [x.id, x.yalnizTus ?? null])).toEqual([['adSoyad', null], ['telefon', 'Tab']]);
    expect(modelKosuPlani(model, { adSoyad: 'Deniz Ak' }).adimlar[0].alanlar.map((x) => x.id)).toEqual(['adSoyad']);

    const a = await kos(testInfo, model, { adSoyad: 'Deniz Ak', beklenenSonuc: hataBekle });
    try {
      expect(a.hata).toBeNull();
      await expect(a.page.locator('#telefonUyari')).toContainText(UYARI);
      await expect(a.page.locator('#sonuc')).toHaveText('');
    } finally { await a.kapat(); }
    // Geçerli telefon: uyarı çıkmaz → beklenen uyarı görülmedi, test kalır.
    const b = await kos(testInfo, model, { adSoyad: 'Deniz Ak', telefon: '5321234567', beklenenSonuc: hataBekle });
    try {
      expect(b.hata).toContain(UYARI);
    } finally { await b.kapat(); }
  });
});

// ---- Arayüz ----------------------------------------------------------------------------------------------------------------------

test('arayüz: alan grubundan sonra beklenen mesaj eklenir; "Doldurduktan sonra" seçimi kaydedilir, yeniden açılınca korunur; tuş yoksa ipucu', async () => {
  test.setTimeout(120_000);
  const klasor = mkdtempSync(join(tmpdir(), 'alan-sonrasi-arayuz-'));
  const PAROLA = 'Alan-Sonrasi-Arayuz-Parolasi-3';
  const vtYolu = join(klasor, 'platform.db');
  let ekran = '';
  let projeId = '';
  {
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Başvuru projesi' });
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
    const grup = diyagram.getByRole('listitem', { name: /blok: Alan grubu \(İletişim\)$/ });
    const telefonTusu = grup.getByRole('combobox', { name: 'Telefon: doldurduktan sonra' });
    const adTusu = grup.getByRole('combobox', { name: 'Ad soyad: doldurduktan sonra' });
    await expect(telefonTusu).toHaveValue('Tab');
    await expect(adTusu).toHaveValue('');
    // Alan grubundan sonraki uyarı: son alanda tuş var → ipucu yok; tuş kaldırılınca ipucu (engellemez), geri seçilince gider.
    const uyari = diyagram.getByRole('listitem', { name: /^2\. blok: Beklenen mesaj$/ });
    const ipucu = uyari.getByRole('note', { name: 'Alan sonrası mesaj ipucu' });
    await expect(ipucu).toHaveCount(0);
    await telefonTusu.selectOption('');
    await expect(ipucu).toContainText('“Telefon”');
    await expect(ipucu).toContainText('Tab ya da Enter');
    await telefonTusu.selectOption('Tab');
    await expect(ipucu).toHaveCount(0);
    // Alan grubunun hemen ardına yeni bir beklenen (başarı) mesajı eklenir; ad soyad'a Enter seçilir.
    await page.locator('li.tasarim-ekle').nth(1).getByRole('button', { name: 'Buraya blok ekle' }).click();
    await page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'Beklenen mesaj' }).click();
    const yeni = diyagram.getByRole('listitem', { name: /^2\. blok: Beklenen mesaj$/ });
    await yeni.getByRole('textbox', { name: 'Aranacak metin' }).fill(ONAY);
    await yeni.getByRole('textbox', { name: 'Aranacak metin' }).blur();
    await adTusu.selectOption('Enter');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    const onay = page.locator('dialog.onay-diyalogu');
    await expect(onay.getByRole('heading', { name: '“Ana akış” akışı kaydedilsin mi?' })).toBeVisible();
    await onay.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeHidden();
    // Sunucudaki diyagram: mesaj alan grubundan sonra, tuşlar yazıldı.
    const t = (await nobetciApi(nobetci, `/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekran}&akisId=ana`)) as Nesne;
    expect((t.bloklar as Nesne[]).slice(0, 3)).toMatchObject([
      { tur: 'alanlar', tuslar: { adSoyad: 'Enter', telefon: 'Tab' } }, { tur: 'mesaj', metin: ONAY }, { tur: 'mesaj', metin: UYARI, uyari: true }
    ]);
    // Yeniden açılınca seçimler korunur.
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(adTusu).toHaveValue('Enter');
    await expect(telefonTusu).toHaveValue('Tab');
    await expect(diyagram.getByRole('listitem', { name: /^2\. blok: Beklenen mesaj$/ }).getByRole('textbox', { name: 'Aranacak metin' })).toHaveValue(ONAY);
    // Dar ekranda (390 px) taşma yok.
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    rmSync(klasor, { recursive: true, force: true });
  }
});
