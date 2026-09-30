// KORUMA TESTLERİ — "Doldur": boş alanın değeri YALNIZ test verisi tablosundan seçilir; hiçbir yerde değer ÜRETİLMEZ.
//  (1) Saf eşleme (doldur-onerisi.mjs): bağlı sütun, adı uyan sütun (esnek başlık), seçim alanında liste tablosu, çoklu aday, gizli
//      sütun maskeli (tam değer yok), tablo yoksa aday yok; "Tümünü doldur" yalnız tek anlamlıları doldurur (satır seçimi aynı
//      gruptaki alanı tek anlamlı yapar), tablo yokken alan boş kalır.
//  (2) Arayüz: Senaryo önerileri > "Önizle" taslağında boş zorunlu alanlar vurgulu ve "Doldur"lu; "Tümünü doldur (tablodan)",
//      çoklu satır seçim listesi (gizli değer maskeli), "tablo yok" iletisi + Test verisi bağlantısı; önerinin kendi değerleri korunur;
//      "Senaryoyu oluştur" tablo bağlantılarıyla ve satır seçimiyle kaydeder.
// Ayrı Nöbetçi (127.0.0.1), geçici veritabanı; dış istek yok. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adaySecimi, doldurAdaylari, tekAnlamliSecim, tumunuDoldur, type DoldurTablosu } from '../../scripts/platform/tablolar/doldur-onerisi.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { sahteSoapSunucusu } from './servis-fikstur';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const KIMLIK_1 = '10000000146';
const KIMLIK_2 = '20000000292';

/** Saf testlerin tabloları (sunucunun secim=1 biçimi: gizli değer null, yalnız kısmi maske). */
function tablolar(): DoldurTablosu[] {
  return [
    {
      id: 't-kisi', ad: 'Kişi', sutunlar: [{ ad: 'Ad soyad' }, { ad: 'Telefon' }, { ad: 'Kimlik no', gizli: true }],
      satirlar: [
        { id: 'r1', ad: 'Ayşe', ortamId: null, degerler: { 'Ad soyad': 'Ayşe Deneme', Telefon: '5321112233', 'Kimlik no': null }, gizliMaskeleri: { 'Kimlik no': '1•••••••••6' } },
        { id: 'r2', ad: 'Mehmet', ortamId: null, degerler: { 'Ad soyad': 'Mehmet Deneme', Telefon: '5334445566', 'Kimlik no': null }, gizliMaskeleri: { 'Kimlik no': '2•••••••••2' } }
      ]
    },
    { id: 't-adres', ad: 'Adres', sutunlar: [{ ad: 'Şehir' }], satirlar: [{ id: 'a1', ad: 'Merkez', ortamId: null, degerler: { 'Şehir': 'Örnekşehir' } }] },
    {
      id: 't-liste', ad: 'Sipariş — Teslimat', kaynak: { tabloTuru: 'liste' }, sutunlar: [{ ad: 'Değer', karsiliklar: { 'Kargo ile': { sayfa: 'kargo' } } }],
      satirlar: [{ id: 'l1', ortamId: null, degerler: { 'Değer': 'Kargo ile' } }, { id: 'l2', ortamId: null, degerler: { 'Değer': 'magaza' } }]
    }
  ];
}

test.describe('saf eşleme (doldur-onerisi.mjs)', () => {
  test('bağlı sütundan doldurma: bağ varsa yalnız o sütun; tek satır tek anlamlıdır, değer tablo bağlantısıdır', () => {
    const t = tablolar();
    const bagli = doldurAdaylari({ alan: { id: 'cep', etiket: 'Cep' }, tablolar: t, bag: { tablo: 't-kisi', sutun: 'Telefon' } });
    expect(bagli.map((a) => [a.tablo, a.sutun, a.neden])).toEqual([['Kişi', 'Telefon', 'bagli']]);
    expect(bagli[0].satirlar.map((r) => r.gosterim)).toEqual(['5321112233', '5334445566']);
    expect(tekAnlamliSecim(bagli)).toBeNull();
    // Bağ tablo ADIYLA da verilebilir (ekran formunun baglanti biçimi); aynı gruptaki satır seçimi satırları süzer → tek anlamlı.
    const suzulmus = doldurAdaylari({ alan: { id: 'cep', etiket: 'Cep' }, tablolar: t, bag: { tablo: 'Kişi', sutun: 'Telefon' }, tabloSecimleri: { 't-kisi|': { 'Ad soyad': 'Mehmet Deneme' } } });
    const secim = tekAnlamliSecim(suzulmus);
    expect(secim?.deger).toBe('${Kişi.Telefon}');
    expect(secim?.basvuru).toBe('Kişi.Telefon');
    expect(secim?.tabloSecimi).toEqual({ anahtar: 't-kisi|', kosul: { 'Ad soyad': 'Mehmet Deneme', Telefon: '5334445566' } });
    // Etiketli bağ: ${Tablo[etiket].Sütun}; bağlı diğer alanların düz değerleri de satırları süzer.
    const etiketli = doldurAdaylari({
      alan: { id: 'cep', etiket: 'Cep' }, tablolar: t, bag: { tablo: 't-kisi', sutun: 'Telefon', etiket: 'kefil' },
      digerDegerler: [{ tablo: 'Kişi', sutun: 'Ad soyad', etiket: 'kefil', deger: 'Ayşe Deneme' }, { tablo: 'Kişi', sutun: 'Ad soyad', deger: '${Kişi.Ad soyad}' }]
    });
    expect(tekAnlamliSecim(etiketli)).toMatchObject({ deger: '${Kişi[kefil].Telefon}', tabloSecimi: { anahtar: 't-kisi|kefil' } });
  });

  test('adı uyan sütun (esnek başlık: büyük / küçük harf, Türkçe karakter, noktalama) ve kimlikteki son parça', () => {
    const t = tablolar();
    expect(doldurAdaylari({ alan: { id: 'x', etiket: 'AD SOYAD' }, tablolar: t }).map((a) => `${a.tablo}.${a.sutun}:${a.neden}`)).toEqual(['Kişi.Ad soyad:ad']);
    expect(doldurAdaylari({ alan: { id: 'adres/sehir', etiket: 'İl' }, tablolar: t }).map((a) => a.sutun)).toEqual(['Şehir']);
    const tek = tekAnlamliSecim(doldurAdaylari({ alan: { id: 'x', etiket: 'Şehir' }, tablolar: t }));
    expect(tek).toMatchObject({ deger: '${Adres.Şehir}', tabloSecimi: { anahtar: 't-adres|', kosul: { 'Şehir': 'Örnekşehir' } } });
  });

  test('seçim alanı: liste tablosu (seçenekler ve karşılıklarla uyan sütun); gizli sütun önerilmez', () => {
    const t = tablolar();
    const alan = { id: 'teslimat', etiket: 'Teslim şekli', tip: 'secim', secenekler: [{ deger: 'kargo', metin: 'Kargo' }, { deger: 'magaza', metin: 'Mağazadan' }] };
    const a = doldurAdaylari({ alan, tablolar: t });
    expect(a.map((x) => `${x.tablo}.${x.sutun}:${x.neden}`)).toEqual(['Sipariş — Teslimat.Değer:liste']);
    expect(a[0].satirlar.map((r) => r.gosterim)).toEqual(['Kargo ile', 'magaza']);
    // Seçenekte olmayan değerli sütun liste sayılmaz; seçim alanına gizli sütun (adı uysa da) önerilmez.
    expect(doldurAdaylari({ alan: { ...alan, secenekler: ['baska'] }, tablolar: t })).toEqual([]);
    expect(doldurAdaylari({ alan: { id: 'k', etiket: 'Kimlik no', tip: 'secim', secenekler: ['1'] }, tablolar: t })).toEqual([]);
  });

  test('çoklu aday: iki tabloda adı uyan sütun → seçim listesi (tek anlamlı değil); seçilen satır grubun satır seçimi olur', () => {
    const t = [...tablolar(), { id: 't-kefil', ad: 'Kefil', sutunlar: [{ ad: 'Telefon' }], satirlar: [{ id: 'k1', ad: 'K', ortamId: null, degerler: { Telefon: '5000000000' } }] }];
    const a = doldurAdaylari({ alan: { id: 'telefon', etiket: 'Telefon' }, tablolar: t });
    expect(a.map((x) => x.tablo)).toEqual(['Kişi', 'Kefil']);
    expect(tekAnlamliSecim(a)).toBeNull();
    const s = adaySecimi(a[0], 'r2');
    expect(s).toMatchObject({ deger: '${Kişi.Telefon}', satir: { ad: 'Mehmet' }, tabloSecimi: { anahtar: 't-kisi|', kosul: { Telefon: '5334445566' } } });
    // Çoklu satır grubunda (veri koşusu) satır seçimi yazılmaz; tek aday yeterlidir.
    const coklu = doldurAdaylari({ alan: { id: 'telefon', etiket: 'Telefon' }, tablolar: tablolar(), cokluGruplar: ['t-kisi|'] });
    expect(tekAnlamliSecim(coklu)).toMatchObject({ deger: '${Kişi.Telefon}', tabloSecimi: null });
  });

  test('gizli sütun ve hassas alan: yalnız maske gösterilir, tam değer adaylarda yoktur', () => {
    const a = doldurAdaylari({ alan: { id: 'kimlikNo', etiket: 'Kimlik no', hassas: true }, tablolar: tablolar() });
    expect(a[0]).toMatchObject({ tablo: 'Kişi', sutun: 'Kimlik no', gizli: true, deger: '${Kişi.Kimlik no}' });
    expect(a[0].satirlar.map((r) => r.gosterim)).toEqual(['1•••••••••6', '2•••••••••2']);
    expect(JSON.stringify(a)).not.toContain(KIMLIK_1);
    // Satır koşulu gizli sütunu içermez; hassas alanda açık sütunun değeri de kısmi maskelidir.
    expect(adaySecimi(a[0], 'r1').tabloSecimi?.kosul).toEqual({ 'Ad soyad': 'Ayşe Deneme', Telefon: '5321112233' });
    const hassas = doldurAdaylari({ alan: { id: 'telefon', etiket: 'Telefon', hassas: true }, tablolar: tablolar() });
    expect(hassas[0].satirlar.map((r) => r.gosterim)).toEqual(['5••••••••3', '5••••••••6']);
  });

  test('tablo yoksa aday yok; ortamı farklı ve sütunu boş satırlar sayılmaz; bağlam tabloları önerilmez', () => {
    expect(doldurAdaylari({ alan: { id: 'vergiNo', etiket: 'Vergi no' }, tablolar: tablolar() })).toEqual([]);
    expect(doldurAdaylari({ alan: { id: 'x', etiket: 'Ad soyad' }, tablolar: [] })).toEqual([]);
    const t: DoldurTablosu[] = [
      { id: 'baglam_eA', ad: 'Şube', baglam: true, sutunlar: [{ ad: 'Şube' }], satirlar: [{ id: 'b', ortamId: null, degerler: { 'Şube': 'A' } }] },
      { id: 't', ad: 'T', sutunlar: [{ ad: 'Şube' }], satirlar: [{ id: '1', ortamId: 'o-2', degerler: { 'Şube': 'B' } }, { id: '2', ortamId: null, degerler: { 'Şube': '' } }] }
    ];
    expect(doldurAdaylari({ alan: { id: 's', etiket: 'Şube' }, tablolar: t, ortamId: 'o-1' })).toEqual([]);
    // Bağlı sütunda değer yoksa aday kalır ama satırı yoktur ("sütunda değer yok"); tek anlamlı sayılmaz.
    const bos = doldurAdaylari({ alan: { id: 's', etiket: 'Şube' }, tablolar: t, ortamId: 'o-1', bag: { tablo: 't', sutun: 'Şube' } });
    expect(bos.map((x) => x.satirlar.length)).toEqual([0]);
    expect(tekAnlamliSecim(bos)).toBeNull();
  });

  test('"Tümünü doldur": yalnız tek anlamlılar dolar; satır seçimi aynı gruptaki alanları tek anlamlı yapar; kalanlar nedenli', () => {
    const alanlar = [
      { alan: { id: 'adSoyad', etiket: 'Ad soyad' } },
      { alan: { id: 'sehir', etiket: 'Şehir' } },
      { alan: { id: 'vergiNo', etiket: 'Vergi no' } }
    ];
    const r = tumunuDoldur({ alanlar, tablolar: tablolar() });
    expect(r.dolanlar.map((d) => [d.alanId, d.secim.deger])).toEqual([['sehir', '${Adres.Şehir}']]);
    expect(r.kalanlar).toEqual([
      { alanId: 'adSoyad', etiket: 'Ad soyad', neden: 'coklu', adaySayisi: 1 },
      { alanId: 'vergiNo', etiket: 'Vergi no', neden: 'yok', adaySayisi: 0 }
    ]);
    // Grubun satırı seçiliyse (ör. kullanıcı bir alanda satır seçti) aynı tablodaki alanlar tek anlamlı olur.
    const r2 = tumunuDoldur({ alanlar: [{ alan: { id: 'telefon', etiket: 'Telefon' } }, { alan: { id: 'kimlikNo', etiket: 'Kimlik no', hassas: true } }], tablolar: tablolar(), tabloSecimleri: { 't-kisi|': { 'Ad soyad': 'Ayşe Deneme' } } });
    expect(r2.dolanlar.map((d) => d.secim.deger)).toEqual(['${Kişi.Telefon}', '${Kişi.Kimlik no}']);
    expect(r2.kalanlar).toEqual([]);
    expect(r2.tabloSecimleri['t-kisi|']).toEqual({ 'Ad soyad': 'Ayşe Deneme', Telefon: '5321112233' });
  });

  test('hiçbir yerde değer üretilmez: tablo yokken tüm alanlar boş kalır', () => {
    const alanlar = ['Ad soyad', 'Telefon', 'Kimlik no', 'E-posta', 'Doğum tarihi', 'Kart no', 'CVV', 'Parola'].map((etiket, i) => ({ alan: { id: `a${i}`, etiket, hassas: i >= 2 } }));
    const r = tumunuDoldur({ alanlar, tablolar: [] });
    expect(r.dolanlar).toEqual([]);
    expect(r.kalanlar.every((k) => k.neden === 'yok')).toBe(true);
    expect(r.tabloSecimleri).toEqual({});
    for (const x of alanlar) expect(tekAnlamliSecim(doldurAdaylari({ alan: x.alan, tablolar: [] }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------
// Arayüz: öneriden senaryo tamamlama
// ---------------------------------------------------------------------------------------

const EKRAN = 'Başvuru formu';
const secenek = (deger: string, metin: string): Nesne => ({ deger, metin });
const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: true, ...ek
});

function basvuruPaketi(): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'basvuru-formu', ad: EKRAN, aciklama: 'Doldur fikstürü (değerler sahte).', ekranUrl: '/basvuru', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'Başvuru bilgileri',
      bolumler: [{ id: 'b1', baslik: 'Başvuran', alanlar: [
        alan('plan', 'secim', 'Plan', { seceneklerDurumu: 'tam', secenekler: [secenek('temel', 'Temel'), secenek('genis', 'Geniş')] }),
        alan('kanal', 'secim', 'Kanal', { seceneklerDurumu: 'tam', secenekler: [secenek('web', 'Web'), secenek('sube', 'Şube')] }),
        alan('adSoyad', 'metin', 'Ad soyad'),
        alan('telefon', 'metin', 'Telefon'),
        alan('kimlikNo', 'metin', 'Kimlik no', { hassas: true }),
        alan('sehir', 'metin', 'Şehir'),
        alan('vergiNo', 'metin', 'Vergi no')
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Alındı', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'basvuru-formu', ad: EKRAN, urlYolu: '/basvuru' }, olusturan: 'birim testi', olusturulma: '2026-09-30T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
    bilinmeyenler: []
  };
}

test.describe('arayüz: öneriden senaryo tamamlama (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Doldur-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const senaryolar = async () => ((await basarili(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[]).filter((x) => x.ekranId === ekranId);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'doldur-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Doldur Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: basvuruPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === EKRAN)?.id);
    await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Kişi', tur: 'kayit', sutunlar: [{ ad: 'Ad soyad' }, { ad: 'Telefon' }, { ad: 'Kimlik no', gizli: true }],
      satirlar: [
        { ad: 'Ayşe', degerler: { 'Ad soyad': 'Ayşe Deneme', Telefon: '5321112233', 'Kimlik no': KIMLIK_1 } },
        { ad: 'Mehmet', degerler: { 'Ad soyad': 'Mehmet Deneme', Telefon: '5334445566', 'Kimlik no': KIMLIK_2 } }
      ]
    });
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Adres', tur: 'kayit', sutunlar: [{ ad: 'Şehir' }], satirlar: [{ ad: 'Merkez', degerler: { 'Şehir': 'Örnekşehir' } }] });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  async function sayfa(genislik = 1400): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    return { page, hatalar, kapat: () => baglam.close() };
  }
  /** Öneriler sayfasını açar ve değeri eksik ilk önerinin önizlemesini açar; önerinin plan / kanal değerlerini döndürür. */
  async function oneriyiOnizle(page: Page): Promise<{ plan: string; kanal: string }> {
    await page.goto(`/#/senaryolar/u/${ekranId}`);
    await page.getByRole('link', { name: 'Senaryo önerileri' }).click();
    await expect(page.getByRole('heading', { name: 'Senaryo önerileri', level: 2 })).toBeVisible();
    const oneri = page.locator('li.oneri[data-neden="pairwise"], li.oneri[data-neden="kapsam"]').filter({ hasText: 'değer eksik' }).first();
    await expect(oneri).toBeVisible();
    await expect(oneri).toContainText('"Doldur" ile tablodan seçin');
    await oneri.getByRole('button', { name: /: önizle$/ }).click();
    await expect(page.getByRole('heading', { name: 'Yeni senaryo', level: 2 })).toBeVisible();
    return { plan: await page.locator('[data-alan="plan"] select').inputValue(), kanal: await page.locator('[data-alan="kanal"] select').inputValue() };
  }
  const kap = (page: Page, id: string) => page.locator(`[data-alan="${id}"]`);
  const doldur = (page: Page, id: string) => kap(page, id).getByRole('button', { name: 'Doldur', exact: true });
  const secimPaneli = (page: Page, id: string) => kap(page, id).getByRole('group', { name: 'Tablodan seçim' });

  test('390px: Doldur seçim listesi ve Tümünü doldur sonucu sayfayı yatay kaydırmaz', async () => {
    test.setTimeout(60_000);
    const { page, kapat } = await sayfa(390);
    await oneriyiOnizle(page);
    await page.getByRole('note').filter({ hasText: 'Öneri önizlemesi — kaydedilmedi.' }).getByRole('button', { name: 'Tümünü doldur (tablodan)' }).click();
    await doldur(page, 'adSoyad').click();
    await expect(secimPaneli(page, 'adSoyad')).toBeVisible();
    const tasma = await page.evaluate(() => {
      const tasan = [...document.querySelectorAll('.doldur-paneli:not([hidden]), .doldur-tumu-kap')]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).map((e) => e.className);
      return { sayfa: document.documentElement.scrollWidth - innerWidth, tasan };
    });
    expect(tasma.sayfa).toBeLessThanOrEqual(2);
    expect(tasma.tasan).toEqual([]);
    await kapat();
  });

  test('öneri taslağı: boş zorunlular vurgulu; Tümünü doldur yalnız tek anlamlıları doldurur; çoklu satır seçimi; tablo yok iletisi; senaryo oluşur', async () => {
    test.setTimeout(90_000);
    const { page, hatalar, kapat } = await sayfa();
    const { plan, kanal } = await oneriyiOnizle(page);
    expect(plan).not.toBe('');
    expect(kanal).not.toBe('');
    // Boş zorunlu alanlar vurgulu ve her birinde "Doldur"; önerinin kendi değerleri (plan / kanal) dolu → Doldur yok.
    for (const id of ['adSoyad', 'telefon', 'kimlikNo', 'sehir', 'vergiNo']) {
      await expect(kap(page, id)).toHaveClass(/doldur-bekliyor/);
      await expect(kap(page, id).getByRole('button', { name: /^Doldur/ })).toBeVisible();
    }
    for (const id of ['plan', 'kanal']) await expect(kap(page, id).getByRole('button', { name: /^Doldur/ })).toBeHidden();

    // Tümünü doldur: yalnız Şehir (tek tablo, tek satır); kalanlar nedenleriyle listelenir.
    const not = page.getByRole('note').filter({ hasText: 'Öneri önizlemesi — kaydedilmedi.' });
    await not.getByRole('button', { name: 'Tümünü doldur (tablodan)' }).click();
    const sonuc = not.getByRole('status');
    await expect(sonuc).toContainText('1 alan tablodan dolduruldu.');
    const kalanlar = sonuc.getByRole('list', { name: 'Doldurulmayan alanlar' });
    await expect(kalanlar).toContainText('Ad soyad: birden çok seçenek var');
    await expect(kalanlar).toContainText('Vergi no: tablo yok — elle yazın ya da tablo ekleyin');
    await expect(kap(page, 'sehir')).toContainText('Tablodan: Adres › Şehir');
    await expect(kap(page, 'sehir')).not.toHaveClass(/doldur-bekliyor/);
    await expect(kap(page, 'vergiNo').locator('input[type="text"]')).toHaveValue('');

    // Kimlik no: çoklu satır listesi; gizli değer yalnız kısmi maskeyle.
    await doldur(page, 'kimlikNo').click();
    const panel = secimPaneli(page, 'kimlikNo');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Kişi › Kimlik no');
    await expect(panel.getByRole('button', { name: 'Ayşe — 1•••••••••6' })).toBeVisible();
    await expect(page.getByText(KIMLIK_1)).toHaveCount(0);
    await panel.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(panel).toBeHidden();

    // Ad soyad: satır seç → tablo bağlantısı + grubun satır seçimi; ardından Tümünü doldur Telefon ve Kimlik no'yu aynı satırdan doldurur.
    await doldur(page, 'adSoyad').click();
    await secimPaneli(page, 'adSoyad').getByRole('button', { name: 'Mehmet — Mehmet Deneme' }).click();
    await expect(kap(page, 'adSoyad')).toContainText('Tablodan: Kişi › Ad soyad');
    await not.getByRole('button', { name: 'Tümünü doldur (tablodan)' }).click();
    await expect(sonuc).toContainText('2 alan tablodan dolduruldu.');
    await expect(kap(page, 'telefon')).toContainText('Tablodan: Kişi › Telefon');
    await expect(kap(page, 'kimlikNo')).toContainText('Tablodan: Kişi › Kimlik no');

    // Vergi no: tablo yok → ileti + Test verisi bağlantısı; değer üretilmez (alan boş kalır), kullanıcı elle yazar.
    await doldur(page, 'vergiNo').click();
    const yok = secimPaneli(page, 'vergiNo');
    await expect(yok).toContainText('Bu alan için tablo yok — elle yazın ya da tablo ekleyin.');
    await expect(yok.getByRole('link', { name: 'Test verisi tabloları' })).toHaveAttribute('href', '#/veri');
    await yok.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(kap(page, 'vergiNo').locator('input[type="text"]')).toHaveValue('');
    await kap(page, 'vergiNo').locator('input[type="text"]').fill('1234567890');
    await expect(doldur(page, 'vergiNo')).toBeHidden();

    // Senaryoyu oluştur: önerinin değerleri korunur; tablo bağlantıları ve satır seçimi kaydedilir.
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(async () => (await senaryolar()).length, { timeout: 15_000 }).toBe(1);
    const [kayit] = await senaryolar();
    const tam = (await basarili(`/platform/senaryo?id=${kayit.id}&ortamId=${ortamId}`)).senaryo as Nesne;
    expect(tam.veri).toMatchObject({
      plan, kanal, adSoyad: '${Kişi.Ad soyad}', telefon: '${Kişi.Telefon}', kimlikNo: '${Kişi.Kimlik no}', sehir: '${Adres.Şehir}', vergiNo: '1234567890'
    });
    const kisiId = String(((await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.ad === 'Kişi')?.id);
    expect(tam.tabloSecimleri?.[`${kisiId}|`]).toMatchObject({ 'Ad soyad': 'Mehmet Deneme', Telefon: '5334445566' });
    expect(JSON.stringify(tam)).not.toContain(KIMLIK_2);
    expect(hatalar).toEqual([]);
    await kapat();
  });
});

// ---------------------------------------------------------------------------------------
// Arayüz: servis senaryosu alan formu (parametre alanlarında aynı eşleme)
// ---------------------------------------------------------------------------------------

test.describe('arayüz: servis senaryosu alan formunda Doldur (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-DoldurS-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: Awaited<ReturnType<typeof sahteSoapSunucusu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let servisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'doldur-servis-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Doldur Servis' })).proje.id);
    const ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Müşteri', tur: 'kayit', sutunlar: [{ ad: 'ClientType' }], satirlar: [{ ad: 'Tek', degerler: { ClientType: 'T' } }] });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('boş zorunlu parametre: adı uyan sütundan tek anlamlı doldurma (kaynak Tablodan); tablo yoksa ileti, değer üretilmez', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (x) => hatalar.push(String(x)));
    await page.goto(`/#/servisler/s/${servisId}/senaryo/yeni`);
    const form = page.locator('.alan-formu');
    await expect(form).toBeVisible();
    const satir = (ad: string) => form.locator('.alan-satiri').filter({ has: page.locator('.alan-adi', { hasText: new RegExp(`^${ad}`) }) });
    // Bağlı olmayan zorunlu alan: "Doldur" görünür; adı uyan tek satırlı sütun doğrudan yazılır.
    await satir('ClientType').getByRole('button', { name: 'Doldur', exact: true }).click();
    await expect(satir('ClientType').getByLabel('ClientType değer kaynağı')).toHaveValue('tablo');
    await expect(satir('ClientType')).toContainText('Müşteri → ClientType');
    await expect(satir('ClientType').getByRole('button', { name: /^Doldur/ })).toBeHidden();
    // Tablo yok: ileti; alan gönderilmez olarak kalır.
    await satir('BeginDate').getByRole('button', { name: 'Doldur', exact: true }).click();
    await expect(satir('BeginDate').getByRole('group', { name: 'Tablodan seçim' })).toContainText('Bu alan için tablo yok — elle yazın ya da tablo ekleyin.');
    await expect(satir('BeginDate').getByLabel('BeginDate değer kaynağı')).toHaveValue('gonderme');
    await page.getByLabel('Başlık').fill('Doldur ile servis senaryosu');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page).toHaveURL(/\/senaryo\/[0-9a-f-]{36}$/);
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kayit = d.senaryolar.find((x: Nesne) => x.baslik === 'Doldur ile servis senaryosu');
    expect(kayit.icerik.govde).toContain('<ClientType>${Müşteri.ClientType}</ClientType>');
    expect(kayit.icerik.govde).not.toContain('<BeginDate>');
    expect(Object.values(kayit.icerik.tabloSecimleri ?? {})).toContainEqual({ ClientType: 'T' });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
