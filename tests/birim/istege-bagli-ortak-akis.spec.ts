// KORUMA TESTİ — İsteğe bağlı ortak akış görünür ve yönetilebilir: akış diyagramında ortak akış bloğunun "Ne zaman çalışır?"
// seçimi (her senaryoda / isteğe bağlı + yeni senaryolarda dahil mi) ve durum rozeti; kaydetme ve "Ekranlara ekle" onay
// pencerelerinin seçimi tekrarlaması; senaryo formunda her isteğe bağlı blok için "“<ad>” dahil" anahtarı (kapalıysa adımlar
// "koşulmaz"), her senaryoda çalışan blok için yalnız bilgi; kapalı blok koşuda çalışmaz; eski (varsayilan'sız) "DahilKosulu"
// modelleri aynen çalışır; uçtan uca akışın ekran adımı senaryonun kendi seçimini kullanır.
// Güvenlik: yalnız 127.0.0.1 — örnek fikstürün GİRİŞSİZ sayfası (/acik-siparis/); ayrı Nöbetçi örneği, geçici veritabanı.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { formDegerleriniKur, formSemasiOlustur, ortakAkislariAc } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { akisDiyagrami } from '../../scripts/platform/senaryolar/akis-diyagrami.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { OrnekBasvuruUygulamasi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const ORTAK_ANAHTAR = 'kargo-ortak';
const ORTAK_DOSYA = `${ORTAK_ANAHTAR}.model.json`;
const DAHIL = 'kargoBlokuDahil';
const DAHIL_ETIKETI = '“Kargo bloğu” dahil';

/** Ortak akış: teslimat seçimi (her zaman) → "Hediye" (kendi koşulu: hediye paketi seçiliyse). */
function ortakModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ortakAkis', id: ORTAK_ANAHTAR, ad: 'Kargo bloğu', aciklama: 'Kargo kısmı (nötr fikstür).',
    kosullar: { hediyeli: { ifade: { senaryoAyari: 'hediyePaketi', esit: true } } },
    adimlar: [
      {
        id: 'teslimat', sira: 1, baslik: 'Teslimat seçilir',
        bolumler: [{ id: 'teslimatBolumu', baslik: 'Teslimat', alanlar: [{
          id: 'teslimatSecimi', tip: 'secim', etiket: { ekran: 'Teslimat' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'teslimatSecimi' },
          konum: { secici: '#teslimat', kirilganlik: 'dusuk' }, secenekler: [{ deger: 'dar', metin: 'Dar' }, { deger: 'genis', metin: 'Geniş' }], seceneklerDurumu: 'tam'
        }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Siparisi kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Siparis oluşturuldu', secici: '#siparis-sonuc' } }
      },
      {
        id: 'hediye', sira: 2, baslik: 'Hediye notu', gorunurluk: { kosul: 'hediyeli' }, bolumler: [{ id: 'hediyeBolumu', baslik: 'Hediye', alanlar: [{
          id: 'hediyeNotu', tip: 'onayKutusu', etiket: { ekran: 'Hediye notu' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'hediyeNotu' }, konum: { secici: '#ekTeslimat', kirilganlik: 'dusuk' }
        }] }]
      }
    ],
    senaryoDuzeyi: { alanlar: [{
      id: 'hediyePaketi', tip: 'onayKutusu', yapilandirma: 'senaryo', ekrandaAlanDegil: true, eslesme: { senaryo: 'hediyePaketi' }, etiket: { ekran: null, form: 'Hediye paketi' }
    }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Ekran (girişsiz sayfa): müşteri adı → Devam → kargo bloğu. dahil: blok "DahilKosulu" ile isteğe bağlı (bugünkü yapı); değilse her zaman. */
function ekranModel(anahtar: string, ad: string, blok: 'istege' | 'her' | 'yok'): Nesne {
  const dahil = blok === 'istege';
  return {
    semaSurumu: 2, tur: 'ekran', id: anahtar, ad, aciklama: 'Ortak akış bloğu (nötr fikstür).', ekranUrl: '/acik-siparis/', girisGerekmez: true,
    specDosyasi: `tests/scenarios/${anahtar}/${anahtar}.spec.ts`, pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: `Nöbetçi > Senaryolar (${anahtar})` },
    kosullar: dahil ? { [`${DAHIL}Kosulu`]: { ifade: { senaryoAyari: DAHIL, esit: true } } } : {},
    adimlar: [
      {
        id: 'musteri', sira: 1, baslik: 'Müşteri bilgisi girilir',
        bolumler: [{ id: 'musteriBolumu', baslik: 'Müşteri', alanlar: [{
          id: 'musteriAdi', tip: 'metin', etiket: { ekran: 'Ad Soyad' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'musteriAdi' }, konum: { secici: '#musteriAd', kirilganlik: 'dusuk' }
        }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#teslimat' } }
      },
      ...(blok === 'yok' ? [] : [{ id: 'kargoAdimi', sira: 2, baslik: 'Kargo bloğu', ortakAkis: { dosya: ORTAK_DOSYA }, ...(dahil ? { gorunurluk: { kosul: `${DAHIL}Kosulu` } } : {}) }])
    ],
    senaryoDuzeyi: { alanlar: [
      { id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } },
      ...(dahil ? [{ id: DAHIL, tip: 'onayKutusu', yapilandirma: 'senaryo', eslesme: { senaryo: DAHIL }, etiket: { ekran: null, form: DAHIL_ETIKETI } }] : [])
    ] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

const acik = (ekran: Nesne): Nesne => ortakAkislariAc(ekran, { [ORTAK_DOSYA]: ortakModel() }).model;

// ---- Saf işlevler ---------------------------------------------------------------------------------------------

const hamAlan = (anahtar: string, etiket: string): HamAlan => ({
  anahtar, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Genel' }
});
const META = { ekranAnahtari: 'siparis', ekranAdi: 'Siparis', urlYolu: '/siparis/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const ENV = {
  kip: 'kayit' as const, bicim: 'akis' as const, profil: null, baslik: 'Siparis',
  alanlar: [{ alan: hamAlan('#ad', 'Ad Soyad'), secili: true }],
  dugmeler: [{ secici: '#devam', metin: 'Devam' }], mesajlar: [], olaylar: [], engellenenler: [], notlar: []
};
/** Diyagram blokları → model (mevcut model verilirse onun üstüne; akış kaydıyla aynı çeviri). */
function diyagramdanModel(ortaklar: Nesne[], mevcutModel?: Nesne): Nesne {
  const { envanter, hatalar } = akistanKayitEnvanteri(ENV, [
    { tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad'], zorunlu: [] }, { tur: 'aksiyon', dugme: 0, istegeBagli: false }, ...ortaklar, { tur: 'bitir' }
  ] as never);
  expect(hatalar).toEqual([]);
  return kayitPaketiOlustur({ ...META, ...(mevcutModel ? { mevcutModel } : {}) }, envanter as NonNullable<typeof envanter>).paket.model as Nesne;
}
const ayarAlani = (m: Nesne, form: string): Nesne | undefined => m.senaryoDuzeyi.alanlar.find((a: Nesne) => a.etiket?.form === form);

test.describe('saf işlevler', () => {
  test('diyagram → model: seçim modele doğru yazılır (isteğe bağlı + yeni senaryolarda dahil / dahil değil, her zaman); geri okunur ve güncellenir', () => {
    const m = diyagramdanModel([
      { tur: 'ortak', dosya: ORTAK_DOSYA, ad: 'Kargo bloğu', istegeBagli: true, dahilVarsayilan: true },
      { tur: 'ortak', dosya: 'cikis.model.json', ad: 'Çıkış', istegeBagli: true },
      { tur: 'ortak', dosya: 'sabit.model.json', ad: 'Sabit blok', istegeBagli: false, dahilVarsayilan: true }
    ]);
    const kargo = ayarAlani(m, DAHIL_ETIKETI) as Nesne;
    expect(kargo).toMatchObject({ tip: 'onayKutusu', yapilandirma: 'senaryo', varsayilan: { deger: true } });
    expect(ayarAlani(m, '“Çıkış” dahil')).not.toHaveProperty('varsayilan');
    expect(ayarAlani(m, '“Sabit blok” dahil')).toBeUndefined();
    const adim = (baslik: string): Nesne => m.adimlar.find((a: Nesne) => a.baslik === baslik);
    expect(m.kosullar[adim('Kargo bloğu').gorunurluk.kosul].ifade).toEqual({ senaryoAyari: kargo.id, esit: true });
    expect(adim('Sabit blok').gorunurluk).toBeUndefined();

    // Geri okuma (diyagramı yeniden açma): bloklar seçimi taşır; "her zaman" blokta dahilVarsayilan yok.
    const ortaklar = (model: Nesne): Nesne[] => adimlardanBloklar(model, model.adimlar, modeldenAkisEnvanteri(model)).filter((b) => b.tur === 'ortak') as Nesne[];
    expect(ortaklar(m)).toEqual([
      { tur: 'ortak', dosya: ORTAK_DOSYA, ad: 'Kargo bloğu', istegeBagli: true, dahilVarsayilan: true },
      { tur: 'ortak', dosya: 'cikis.model.json', ad: 'Çıkış', istegeBagli: true },
      { tur: 'ortak', dosya: 'sabit.model.json', ad: 'Sabit blok', istegeBagli: false }
    ]);

    // Güncelleme: aynı ayar (kimliği, koşulu) yeniden kullanılır; yalnız varsayılan değişir.
    const m2 = diyagramdanModel([
      { tur: 'ortak', dosya: ORTAK_DOSYA, ad: 'Kargo bloğu', istegeBagli: true },
      { tur: 'ortak', dosya: 'cikis.model.json', ad: 'Çıkış', istegeBagli: true, dahilVarsayilan: true }
    ], m);
    expect(ayarAlani(m2, DAHIL_ETIKETI)).toMatchObject({ id: kargo.id });
    expect(ayarAlani(m2, DAHIL_ETIKETI)).not.toHaveProperty('varsayilan');
    expect(ayarAlani(m2, '“Çıkış” dahil')).toMatchObject({ id: ayarAlani(m, '“Çıkış” dahil')?.id, varsayilan: { deger: true } });
    // Girdi modeli değişmedi.
    expect(ayarAlani(m, DAHIL_ETIKETI)).toMatchObject({ varsayilan: { deger: true } });
  });

  test('senaryo formu: isteğe bağlı bloğun her adımında anahtar (kendi koşulu olan adım dahil); yeni senaryoda varsayılan uygulanır, kayıtlıda değer yoksa dahil değil', () => {
    const ekran = ekranModel('kargolu', 'Kargolu', 'istege');
    (ekran.senaryoDuzeyi.alanlar as Nesne[]).find((a) => a.id === DAHIL)!.varsayilan = { deger: true };
    const sema = formSemasiOlustur(acik(ekran));
    // "Hediye notu" adımının kendi koşulu var (ve): yine de blok anahtarının kapsamında.
    expect(sema.adimlar.map((a) => [a.id, a.ayar, a.ortakAkis ?? null])).toEqual([
      ['musteri', null, null], ['kargoAdimi_teslimat', DAHIL, 'Kargo bloğu'], ['kargoAdimi_hediye', DAHIL, 'Kargo bloğu']
    ]);
    expect(sema.adimKapsami).toEqual([{ ayar: DAHIL, alanId: DAHIL, etiket: DAHIL_ETIKETI, adimlar: ['kargoAdimi_teslimat', 'kargoAdimi_hediye'], zorunlu: false, varsayilanDahil: true }]);
    // Anahtar senaryo alanı olarak ikinci kez görünmez.
    expect(sema.senaryoAlanlari.map((a) => a.id)).not.toContain(DAHIL);
    expect(formDegerleriniKur(sema, {}, { yeni: true })[DAHIL]).toBe(true);
    expect(formDegerleriniKur(sema, {})[DAHIL]).toBe(false);
    expect(formDegerleriniKur(sema, { baslik: 'x' })[DAHIL]).toBe(false);
    expect(formDegerleriniKur(sema, { [DAHIL]: false }, { yeni: true })[DAHIL]).toBe(false);
    // Koşu: kayıtlı senaryoda değer yoksa varsayılan uygulanmaz — blok koşulmaz.
    const plan = modelKosuPlani(acik(ekran), { baslik: 'x', musteriAdi: 'A' });
    expect(plan.adimlar.map((a) => [a.id, a.dahil])).toEqual([['musteri', true], ['kargoAdimi_teslimat', false], ['kargoAdimi_hediye', false]]);
  });

  test('eski model ("DahilKosulu", varsayılansız) aynen çalışır; her zaman çalışan blokta anahtar yok, bilgi var; diyagram rozetleri tutarlı', () => {
    const eski = acik(ekranModel('kargolu', 'Kargolu', 'istege'));
    const sema = formSemasiOlustur(eski);
    expect(sema.adimKapsami[0]).toMatchObject({ ayar: DAHIL, varsayilanDahil: false });
    expect(formDegerleriniKur(sema, {}, { yeni: true })[DAHIL]).toBe(false);
    const kapali = modelKosuPlani(eski, { baslik: 'x', musteriAdi: 'A', [DAHIL]: false });
    expect(kapali.adimlar.map((a) => [a.id, a.dahil])).toEqual([['musteri', true], ['kargoAdimi_teslimat', false], ['kargoAdimi_hediye', false]]);
    const acikPlan = modelKosuPlani(eski, { baslik: 'x', musteriAdi: 'A', [DAHIL]: true, teslimatSecimi: 'dar' });
    expect(acikPlan.adimlar.map((a) => [a.id, a.dahil])).toEqual([['musteri', true], ['kargoAdimi_teslimat', true], ['kargoAdimi_hediye', false]]);

    const her = formSemasiOlustur(acik(ekranModel('sabit', 'Sabit', 'her')));
    // Blok her zaman çalışır; bloğun içindeki kendi koşullu adımı (Hediye paketi) yine kendi anahtarıyla seçilir.
    expect(her.adimlar.filter((a) => a.ortakAkis).map((a) => [a.id, a.ayar])).toEqual([['kargoAdimi_teslimat', null], ['kargoAdimi_hediye', 'hediyePaketi']]);
    expect(her.adimKapsami.map((k) => k.ayar)).toEqual(['hediyePaketi']);

    // Diyagram: açılmış modelde (senaryo) ve ekranın Akışlar sekmesinde (açılmamış) aynı bilgi.
    const d = akisDiyagrami(eski, {});
    expect(d.adimlar.map((a) => [a.id, a.istegeBagli, a.ortakAkis])).toEqual([['musteri', false, null], ['kargoAdimi_teslimat', true, 'Kargo bloğu'], ['kargoAdimi_hediye', true, 'Kargo bloğu']]);
    const ekranda = akisDiyagrami(ekranModel('kargolu', 'Kargolu', 'istege'), {});
    expect(ekranda.adimlar.map((a) => [a.id, a.istegeBagli, a.kapsamEtiketi, a.ortakAkis])).toEqual([['musteri', false, null, null], ['kargoAdimi', true, DAHIL_ETIKETI, 'Kargo bloğu']]);
    const sabit = akisDiyagrami(ekranModel('sabit', 'Sabit', 'her'), {});
    expect(sabit.adimlar.map((a) => [a.id, a.istegeBagli, a.ortakAkis])).toEqual([['musteri', false, null], ['kargoAdimi', false, 'Kargo bloğu']]);
  });
});

// ---- Sunucu, koşu ve arayüz ---------------------------------------------------------------------------------------

test.describe('sunucu, koşu ve arayüz (sahte uygulama)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Istege-Bagli-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: OrnekBasvuruUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const ekranlar: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Nesne> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
    return y;
  }
  const paket = (model: Nesne, anahtar: string, ad: string, urlYolu?: string): Nesne => ({
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar, ad, ...(urlYolu ? { urlYolu } : {}) }, olusturan: 'test', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  });
  /** Ekranın (varsayılan akış) "“Kargo bloğu” dahil" ayar alanı. */
  const dahilAyari = async (ekranId: string): Promise<Nesne | undefined> =>
    (((await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`)) as Nesne).model as { senaryoDuzeyi: { alanlar: Nesne[] } }).senaryoDuzeyi.alanlar.find((a) => a.id === DAHIL);
  /** Sayfa yatay taşmıyor. */
  const tasmaYok = async (page: Page, yer: string): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), yer).toBeLessThanOrEqual(0);
  };
  /** Yalnız Nöbetçi'ye istek: sayfa hatası yok, dış adres yok. */
  async function sayfaAc(genislik: number): Promise<{ page: Page; bitir: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const istekler: string[] = [];
    const hatalar: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    page.on('pageerror', (e) => hatalar.push(String(e)));
    return {
      page,
      bitir: async () => {
        expect(hatalar).toEqual([]);
        expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
        expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
        await baglam.close();
      }
    };
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'istege-bagli-ortak-'));
    uygulama = new OrnekBasvuruUygulamasi({ totp: false });
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'İsteğe Bağlı Blok Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ortakModel(), ORTAK_ANAHTAR, 'Kargo bloğu'), senaryoIndeksleri: [], ortamIdleri: [] });
    for (const [anahtar, ad, blok] of [['kargolu-siparis', 'Kargolu Sipariş', 'istege'], ['sabit-kargolu', 'Sabit Kargolu', 'her'], ['yalin-siparis', 'Yalın Sipariş', 'yok']] as const) {
      await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ekranModel(anahtar, ad, blok), anahtar, ad, '/acik-siparis/'), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    }
    for (const e of (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[]) ekranlar[String(e.anahtar)] = String(e.id);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  for (const genislik of [1440, 390]) {
    test(`diyagram (${genislik} px): blokta seçim ve rozet; kaydetme onayı seçimi tekrarlar; model güncellenir; taşma yok`, async () => {
      test.setTimeout(90_000);
      const { page, bitir } = await sayfaAc(genislik);
      const ekranId = ekranlar['kargolu-siparis'];
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
      // Ekranın Akışlar sekmesi: bloğun durumu rozetle.
      await expect(page.getByText(`isteğe bağlı: ${DAHIL_ETIKETI}`).first()).toBeVisible();
      await page.getByRole('button', { name: 'Düzenle' }).click();
      await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
      const blok = page.locator('.tasarim-blogu.tur-ortak');
      await expect(blok.locator('[data-ortak-durumu]')).toHaveText('isteğe bağlı');
      const secim = blok.getByRole('group', { name: 'Kargo bloğu: ne zaman çalışır' });
      await expect(secim.getByRole('radio', { name: /^İsteğe bağlı/ })).toBeChecked();
      await expect(secim.getByRole('radio', { name: /^Dahil değil/ })).toBeChecked();
      await tasmaYok(page, `diyagram ${genislik}`);

      // Her senaryoda → rozet "her zaman", "Yeni senaryolarda" gizlenir; geri isteğe bağlı + dahil.
      await secim.getByRole('radio', { name: /^Her senaryoda çalışır/ }).check();
      await expect(blok.locator('[data-ortak-durumu]')).toHaveText('her zaman');
      await expect(blok.getByRole('radio', { name: /^Dahil değil/ })).toBeHidden();
      await blok.getByRole('radio', { name: /^İsteğe bağlı/ }).check();
      await expect(blok.locator('[data-ortak-durumu]')).toHaveText('isteğe bağlı');
      await blok.getByRole('radio', { name: /^Dahil$/ }).check();
      await expect(blok.getByRole('radio', { name: /^Dahil$/ })).toBeFocused();
      await tasmaYok(page, `diyagram seçim ${genislik}`);

      await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
      const onay = page.locator('dialog.onay-diyalogu');
      await expect(onay).toContainText(/“Kargo bloğu”: isteğe bağlı, yeni senaryolarda dahil(?! değil)/);
      await tasmaYok(page, `kaydetme onayı ${genislik}`);
      await onay.getByRole('button', { name: 'Kaydet' }).click();
      await expect(onay).toBeHidden();
      await expect.poll(async () => (await dahilAyari(ekranId))?.varsayilan ?? null).toEqual({ deger: true });
      expect(await dahilAyari(ekranId)).toMatchObject({ etiket: { form: DAHIL_ETIKETI } });

      // Sonraki genişlikte eski hâline döner (dahil değil) — seçim ters yönde de yazılır.
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
      await page.getByRole('button', { name: 'Düzenle' }).click();
      const blok2 = page.locator('.tasarim-blogu.tur-ortak');
      await expect(blok2.getByRole('radio', { name: /^Dahil$/ })).toBeChecked();
      await blok2.getByRole('radio', { name: /^Dahil değil/ }).check();
      await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
      await expect(onay).toContainText('“Kargo bloğu”: isteğe bağlı, yeni senaryolarda dahil değil');
      await onay.getByRole('button', { name: 'Kaydet' }).click();
      await expect(onay).toBeHidden();
      await expect.poll(async () => (await dahilAyari(ekranId))?.varsayilan ?? null).toBeNull();
      await bitir();
    });
  }

  test('"Ekranlara ekle": seçim penceresi ve onay metni seçimi tekrarlar; eklenen blok isteğe bağlı + dahil', async () => {
    test.setTimeout(90_000);
    const { page, bitir } = await sayfaAc(390);
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranlar[ORTAK_ANAHTAR])}/akis`);
    await page.getByRole('button', { name: 'Ekranlara ekle…' }).click();
    const diyalog = page.locator('dialog.ekran-yonetim-diyalogu');
    await diyalog.getByRole('listitem').filter({ hasText: 'Yalın Sipariş' }).getByRole('checkbox').check();
    await expect(diyalog.getByRole('radio', { name: /^Her senaryoda/ })).toBeChecked();   // varsayılan (kullanıcı kararı)
    await diyalog.getByRole('radio', { name: /^İsteğe bağlı/ }).check();
    await diyalog.getByRole('radio', { name: /^Dahil$/ }).check();
    await tasmaYok(page, 'ekranlara ekle 390');
    await diyalog.getByRole('button', { name: 'Devam' }).click();
    const onay = page.getByRole('dialog', { name: /1 ekrana eklensin mi/ });
    await expect(onay).toContainText('“Kargo bloğu”: isteğe bağlı, yeni senaryolarda dahil.');
    await onay.getByRole('button', { name: 'Ekle' }).click();
    await expect(onay).toBeHidden();
    await expect(page.getByText(/Ortak akış 1 ekrana eklendi/).first()).toBeVisible();
    const t = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranlar['yalin-siparis']}&akisId=ana`) as Nesne;
    expect((t.bloklar as Nesne[]).find((b) => b.tur === 'ortak')).toEqual({ tur: 'ortak', dosya: ORTAK_DOSYA, ad: 'Kargo bloğu', istegeBagli: true, dahilVarsayilan: true });
    await bitir();
  });

  for (const genislik of [1440, 390]) {
    test(`senaryo formu (${genislik} px): "“Kargo bloğu” dahil" anahtarı her adımda; kapalıysa "koşulmaz"; her zaman blokta yalnız bilgi; taşma yok`, async () => {
      test.setTimeout(90_000);
      const { page, bitir } = await sayfaAc(genislik);
      await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranlar['kargolu-siparis'])}`);
      const anahtarlar = page.getByRole('switch', { name: DAHIL_ETIKETI });
      await expect(anahtarlar).toHaveCount(2);
      await expect(anahtarlar.first()).not.toBeChecked();   // "Yeni senaryolarda: dahil değil"
      await expect(page.locator('.kapsam-anahtari').first()).toContainText(DAHIL_ETIKETI);
      const kart = page.locator('.adim-karti').filter({ has: page.getByRole('heading', { name: 'Teslimat seçilir' }) });
      await expect(kart).toContainText(`Koşulmaz: ${DAHIL_ETIKETI} kapalı`);
      await tasmaYok(page, `form kapalı ${genislik}`);
      await anahtarlar.first().check();
      await expect(anahtarlar.nth(1)).toBeChecked();
      await expect(kart).toContainText('“Kargo bloğu” adımları · İsteğe bağlı adım');
      await tasmaYok(page, `form açık ${genislik}`);
      await bitir();

      // Her senaryoda çalışan blok: anahtar yok, yalnız bilgi (kaydedilmemiş form çıkışı sormasın diye yeni sayfada).
      const ikinci = await sayfaAc(genislik);
      await ikinci.page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranlar['sabit-kargolu'])}`);
      await expect(ikinci.page.locator('.adim-karti [data-ortak-durumu="her-zaman"]')).toHaveCount(1);
      await expect(ikinci.page.locator('.adim-karti [data-ortak-durumu="her-zaman"]')).toHaveText('her senaryoda çalışır');
      await expect(ikinci.page.getByRole('switch', { name: /Kargo bloğu/ })).toHaveCount(0);
      await tasmaYok(ikinci.page, `form her zaman ${genislik}`);
      await ikinci.bitir();
    });
  }

  test('yeni senaryoda varsayılan "dahil"; kapatılıp kaydedilen senaryo koşuda bloğu çalıştırmaz; uçtan uca ekran adımı seçimi görür', async () => {
    test.setTimeout(180_000);
    const ekranId = ekranlar['yalin-siparis'];
    const { page, bitir } = await sayfaAc(1440);
    await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`);
    await page.getByRole('textbox', { name: 'Başlık' }).fill('Blok kapalı');
    await page.getByRole('textbox', { name: 'Ad Soyad' }).fill('Ayşe Deneme');
    const anahtar = page.getByRole('switch', { name: DAHIL_ETIKETI }).first();
    await expect(anahtar).toBeChecked();   // "Ekranlara ekle"de "Yeni senaryolarda: dahil"
    await anahtar.uncheck();
    await expect(page.locator('.adim-karti').filter({ has: page.getByRole('heading', { name: 'Teslimat seçilir' }) })).toContainText('Koşulmaz');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect(page).toHaveURL(/#\/senaryolar\/u\//);
    await bitir();

    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    const kayit = liste.find((x) => x.baslik === 'Blok kapalı') as Nesne;
    const veri = ((await api(`/platform/senaryo?id=${String(kayit.id)}&ortamId=${ortamId}`)).senaryo as Nesne).veri as Nesne;
    const ayarId = Object.keys(veri).find((k) => k.endsWith('Dahil')) as string;
    expect(veri[ayarId]).toBe(false);

    const onceki = uygulama.acikSiparisler.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: kayit.id, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect((sonuc.adimlar as Nesne[]).map((a) => a.ad)).not.toContain('Teslimat seçilir');
    expect(uygulama.acikSiparisler.length).toBe(onceki);

    // Uçtan uca akışın ekran adımı: senaryonun kendi "dahil" seçimi (ezmelerle değişmez) bilgi olarak gelir.
    const secenekler = (await api(`/platform/uctan-uca/ekran-senaryolari?projeId=${projeId}`)).senaryolar as Nesne[];
    expect(secenekler.find((x) => x.id === kayit.id)?.ortakBloklar).toEqual([{ ad: 'Kargo bloğu', etiket: DAHIL_ETIKETI, istegeBagli: true, dahil: false }]);
    expect((secenekler.find((x) => x.id === kayit.id)?.alanlar as Nesne[]).map((a) => a.anahtar)).not.toContain(ayarId);
  });
});
