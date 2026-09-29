// KORUMA TESTİ — Akışa eklenmiş ortak akış bloğu ("dahil" anahtarıyla isteğe bağlı) ve ortak akışın EKRANDA ALANI OLMAYAN zorunlu
// senaryo ayarı (ör. "Teslim şekli"; ortak akışın kendi koşulları kullanır). Blok dahil değilken bu alan formda gizlenir, değeri
// yazılmaz; doğrulayıcı (form, sunucu kaydı, Dene) onu zorunlu saymamalı, koşu bloğun adımlarını koşmamalı. Blok dahilken zorunludur.
// Kök neden: ortak akışın senaryo düzeyi alanları açılan modele görünürlüksüz eklenirdi (model-formu.mjs > ortakAkislariAc); form
// alanı bloğun adımında gösterip gizlerken doğrulayıcı "her zaman görünür" sayıyordu.
// Güvenlik: yalnız 127.0.0.1 — örnek fikstürün GİRİŞSİZ sayfası (/acik-siparis/); ayrı Nöbetçi örneği, geçici veritabanı.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { gorunurlukleriHesapla, senaryoyuDogrula, type DogrulamaBaglami } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { formDegerleriniKur, formSemasiOlustur, ortakAkislariAc, senaryoNesnesiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { OrnekBasvuruUygulamasi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const ORTAK_ANAHTAR = 'kargo-ortak';
const DAHIL = 'kargoBlokuDahil';
const DAHIL_ETIKETI = '“Kargo bloğu” dahil';

/** Ortak akış: teslimat seçimi; "Teslim şekli" = kaydet ise kaydetme adımı. Teslim şekli ekranda alanı olmayan zorunlu senaryo ayarı. */
function ortakModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ortakAkis', id: ORTAK_ANAHTAR, ad: 'Kargo bloğu', aciklama: 'Kargo kısmı (nötr fikstür).',
    kosullar: { kaydedilir: { ifade: { senaryoAyari: 'teslimSekli', esit: 'kaydet' } } },
    adimlar: [
      {
        id: 'teslimat', sira: 1, baslik: 'Teslimat seçilir',
        bolumler: [{ id: 'teslimatBolumu', baslik: 'Teslimat', alanlar: [{
          id: 'teslimatSecimi', tip: 'secim', etiket: { ekran: 'Teslimat' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'teslimatSecimi' },
          konum: { secici: '#teslimat', kirilganlik: 'dusuk' }, secenekler: [{ deger: 'dar', metin: 'Dar' }, { deger: 'genis', metin: 'Geniş' }], seceneklerDurumu: 'tam'
        }] }]
      },
      {
        id: 'kaydet', sira: 2, baslik: 'Sipariş kaydedilir', gorunurluk: { kosul: 'kaydedilir' }, bolumler: [{ id: 'kaydetBolumu', baslik: 'Kaydet', alanlar: [{
          id: 'hediyeNotu', tip: 'onayKutusu', etiket: { ekran: 'Hediye notu' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'hediyeNotu' }, konum: { secici: '#ekTeslimat', kirilganlik: 'dusuk' }
        }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Siparisi kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Siparis oluşturuldu', secici: '#siparis-sonuc' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [{
      id: 'teslimSekli', tip: 'secim', zorunlu: true, yapilandirma: 'senaryo', ekrandaAlanDegil: true, eslesme: { senaryo: 'teslimSekli' },
      etiket: { ekran: null, form: 'Teslim şekli' }, secenekler: [{ deger: 'kaydet', metin: 'Kaydet' }, { deger: 'beklet', metin: 'Beklet' }]
    }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Ortak akışı "dahil" anahtarıyla kullanan ekran (girişsiz sayfa): müşteri adı → Devam → (dahilse) kargo bloğu. */
function ekranModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'kargolu-siparis', ad: 'Kargolu Sipariş', aciklama: 'Ortak akış bloğu isteğe bağlı (nötr fikstür).', ekranUrl: '/acik-siparis/', girisGerekmez: true,
    specDosyasi: 'tests/scenarios/kargolu-siparis/kargolu-siparis.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (kargolu-siparis)' },
    kosullar: { [`${DAHIL}Kosulu`]: { ifade: { senaryoAyari: DAHIL, esit: true } } },
    adimlar: [
      {
        id: 'musteri', sira: 1, baslik: 'Müşteri bilgisi girilir',
        bolumler: [{ id: 'musteriBolumu', baslik: 'Müşteri', alanlar: [{
          id: 'musteriAdi', tip: 'metin', etiket: { ekran: 'Ad Soyad' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'musteriAdi' }, konum: { secici: '#musteriAd', kirilganlik: 'dusuk' }
        }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#teslimat' } }
      },
      { id: 'kargoAdimi', sira: 2, baslik: 'Kargo bloğu', ortakAkis: { dosya: `${ORTAK_ANAHTAR}.model.json` }, gorunurluk: { kosul: `${DAHIL}Kosulu` } }
    ],
    senaryoDuzeyi: { alanlar: [
      { id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } },
      { id: DAHIL, tip: 'onayKutusu', yapilandirma: 'senaryo', eslesme: { senaryo: DAHIL }, etiket: { ekran: null, form: DAHIL_ETIKETI } }
    ] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

const acikModel = (ekran: Nesne = ekranModel(), ortaklar: Record<string, Nesne> = { [`${ORTAK_ANAHTAR}.model.json`]: ortakModel() }): Nesne => ortakAkislariAc(ekran, ortaklar).model;
const baglamOf = (model: Nesne): DogrulamaBaglami => ({ model, altModeller: {}, kaynak: 'kayit' } as unknown as DogrulamaBaglami);
const zorunluHatasi = { alan: 'teslimSekli', mesaj: '"Teslim şekli" zorunludur.' };

test.describe('saf işlevler', () => {
  test('doğrulayıcı: blok dahil değilken zorunlu senaryo ayarı hata vermez; dahilken verir; görünürlük bloğun koşulunu izler', () => {
    const model = acikModel();
    const b = baglamOf(model);
    const kapali = senaryoyuDogrula({ baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: false }, b);
    expect(kapali.hatalar).toEqual([]);
    expect(gorunurlukleriHesapla({ [DAHIL]: false }, b).alanlar.teslimSekli).toBe(false);
    const acik = senaryoyuDogrula({ baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: true, teslimatSecimi: 'dar' }, b);
    expect(acik.hatalar).toEqual([zorunluHatasi]);
    expect(gorunurlukleriHesapla({ [DAHIL]: true }, b).alanlar.teslimSekli).toBe(true);
    expect(senaryoyuDogrula({ baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: true, teslimatSecimi: 'dar', teslimSekli: 'beklet' }, b).hatalar).toEqual([]);
    // Blok kapalıyken kalan değer kullanılmaz: engellemez, uyarı verir.
    const kalan = senaryoyuDogrula({ baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: false, teslimSekli: 'kaydet' }, b);
    expect(kalan.hatalar).toEqual([]);
    expect(kalan.uyarilar.map((u) => u.alan)).toEqual(['teslimSekli']);
  });

  test('form: alan bloğun adımında; dahil kapatılınca değeri senaryodan çıkar ve doğrulama temiz; açılınca zorunlu', () => {
    const model = acikModel();
    const b = baglamOf(model);
    const sema = formSemasiOlustur(model);
    const yer = sema.adimlar.find((a) => a.bolumler.some((bl) => bl.alanlar.some((x) => x.id === 'teslimSekli')));
    expect(yer?.id).toBe('kargoAdimi_teslimat');
    const d = formDegerleriniKur(sema, { baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: true, teslimatSecimi: 'dar', teslimSekli: 'kaydet' });
    const olustur = () => senaryoNesnesiOlustur(sema, d, { gorunurlukHesapla: (t) => gorunurlukleriHesapla(t, b) }) as Nesne;
    d[DAHIL] = false;
    const kapali = olustur();
    expect(kapali).toEqual({ baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: false });
    expect(senaryoyuDogrula(kapali, b).hatalar).toEqual([]);
    d[DAHIL] = true;
    d.teslimSekli = '';
    expect(senaryoyuDogrula(olustur(), b).hatalar).toEqual([zorunluHatasi]);
  });

  test('koşu planı: blok dahil değilken bloğun adımları koşulmaz; dahilken koşulur', () => {
    const model = acikModel();
    const kapali = modelKosuPlani(model, { baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: false });
    expect(kapali.hatalar).toEqual([]);
    expect(kapali.adimlar.map((a) => [a.id, a.dahil])).toEqual([['musteri', true], ['kargoAdimi_teslimat', false], ['kargoAdimi_kaydet', false]]);
    const acik = modelKosuPlani(model, { baslik: 'x', musteriAdi: 'Ayşe', [DAHIL]: true, teslimatSecimi: 'dar', teslimSekli: 'kaydet' });
    expect(acik.adimlar.map((a) => [a.id, a.dahil])).toEqual([['musteri', true], ['kargoAdimi_teslimat', true], ['kargoAdimi_kaydet', true]]);
  });

  test('açılım: alanın kendi koşulu korunur (VE); aynı ortak akış iki blokta ise herhangi biri dahilse (VEYA); koşulsuz blokta koşul eklenmez', () => {
    const ortak = ortakModel();
    ortak.kosullar.gelismis = { ifade: { senaryoAyari: 'gelismisKargo', esit: true } };
    ortak.senaryoDuzeyi.alanlar[0].gorunurluk = { kosul: 'gelismis' };
    const tekBlok = acikModel(ekranModel(), { [`${ORTAK_ANAHTAR}.model.json`]: ortak });
    const alan = (m: Nesne): Nesne => m.senaryoDuzeyi.alanlar.find((a: Nesne) => a.id === 'teslimSekli');
    expect(alan(tekBlok).gorunurluk).toEqual({ ifade: { ve: [{ senaryoAyari: DAHIL, esit: true }, { senaryoAyari: 'gelismisKargo', esit: true }] } });
    const b = baglamOf(tekBlok);
    expect(senaryoyuDogrula({ baslik: 'x', musteriAdi: 'A', [DAHIL]: true, teslimatSecimi: 'dar', gelismisKargo: false }, b).hatalar).toEqual([]);

    const iki = ekranModel();
    iki.kosullar.ikinciDahilKosulu = { ifade: { senaryoAyari: 'ikinciDahil', esit: true } };
    iki.adimlar.push({ id: 'ikinciKargo', sira: 3, baslik: 'İkinci kargo', ortakAkis: { dosya: `${ORTAK_ANAHTAR}.model.json` }, gorunurluk: { kosul: 'ikinciDahilKosulu' } });
    iki.senaryoDuzeyi.alanlar.push({ id: 'ikinciDahil', tip: 'onayKutusu', yapilandirma: 'senaryo', eslesme: { senaryo: 'ikinciDahil' }, etiket: { ekran: null, form: 'İkinci kargo dahil' } });
    const ikiBlok = acikModel(iki);
    expect(alan(ikiBlok).gorunurluk).toEqual({ ifade: { veya: [{ senaryoAyari: DAHIL, esit: true }, { senaryoAyari: 'ikinciDahil', esit: true }] } });
    const b2 = baglamOf(ikiBlok);
    expect(senaryoyuDogrula({ baslik: 'x', musteriAdi: 'A', [DAHIL]: false, ikinciDahil: false }, b2).hatalar).toEqual([]);
    expect(senaryoyuDogrula({ baslik: 'x', musteriAdi: 'A', [DAHIL]: false, ikinciDahil: true, teslimatSecimi: 'dar' }, b2).hatalar).toEqual([zorunluHatasi]);

    const kosulsuz = ekranModel();
    delete kosulsuz.adimlar[1].gorunurluk;
    expect(alan(acikModel(kosulsuz)).gorunurluk).toBeUndefined();
    expect(senaryoyuDogrula({ baslik: 'x', musteriAdi: 'A', teslimatSecimi: 'dar' }, baglamOf(acikModel(kosulsuz))).hatalar).toEqual([zorunluHatasi]);
  });
});

test.describe('sunucu, koşu ve arayüz (sahte uygulama)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kargo-Dahil-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: OrnekBasvuruUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
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

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ortak-akis-dahil-'));
    uygulama = new OrnekBasvuruUygulamasi({ totp: false });
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Kargo Dahil Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ortakModel(), ORTAK_ANAHTAR, 'Kargo bloğu'), senaryoIndeksleri: [], ortamIdleri: [] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ekranModel(), 'kargolu-siparis', 'Kargolu Sipariş', '/acik-siparis/'), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
    ekranId = String(ekranlar.find((e) => e.anahtar === 'kargolu-siparis')?.id);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sunucu: blok kapalıyken değersiz kayıt geçer; açıkken "zorunlu" ile reddedilir; kapalı blokla koşuda bloğun adımları koşulmaz', async () => {
    test.setTimeout(120_000);
    const ret = await api('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Kargo dahil, şekil yok', ortamIdleri: [ortamId], veri: { baslik: 'Kargo dahil, şekil yok', musteriAdi: 'Ayşe Deneme', [DAHIL]: true, teslimatSecimi: 'dar' }
    });
    expect(ret.basarili).toBe(false);
    expect(ret.hatalar).toEqual([zorunluHatasi]);
    const yeni = await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Kargo dahil değil', ortamIdleri: [ortamId], veri: { baslik: 'Kargo dahil değil', musteriAdi: 'Ayşe Deneme', [DAHIL]: false }
    });
    const onceki = uygulama.acikSiparisler.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    // Bloğun kaydetme adımı koşulmadı: sahte uygulamaya sipariş yazılmadı.
    expect(uygulama.acikSiparisler.length).toBe(onceki);
  });

  test('arayüz: "dahil" kapatılınca "zorunlu" hatası kaybolur, Kaydet ve Dene etkin; açılınca geri gelir', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 1000 } });
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`);
    await page.getByRole('textbox', { name: 'Başlık' }).fill('Arayüzden kargo dahil değil');
    await page.getByRole('textbox', { name: 'Ad Soyad' }).fill('Ayşe Deneme');
    const anahtar = page.getByRole('switch', { name: DAHIL_ETIKETI }).first();
    const ozet = page.locator('.dogrulama-ozeti');
    const zorunlu = page.getByText('"Teslim şekli" zorunludur.');
    const kaydet = page.getByRole('button', { name: 'Senaryoyu oluştur' });
    const dene = page.getByRole('button', { name: 'Dene', exact: true });

    // Açık: Teslim şekli boş → zorunlu hatası ("Göster" ile tüm hatalar).
    await anahtar.check();
    await page.getByRole('combobox', { name: 'Teslimat' }).selectOption('dar');
    await expect(ozet).toContainText('1 alan düzeltilmeli');
    await ozet.getByRole('button', { name: 'Göster' }).click();
    await expect(zorunlu).toBeVisible();

    // Kapalı: hata kaybolur, özet temiz; Kaydet ve Dene etkin.
    await anahtar.uncheck();
    await expect(ozet).toContainText('Tüm kurallar sağlanıyor');
    await expect(zorunlu).toHaveCount(0);
    await expect(kaydet).toBeEnabled();
    await expect(dene).toBeEnabled();

    // Yeniden açılınca hata geri gelir.
    await anahtar.check();
    await expect(ozet).toContainText('1 alan düzeltilmeli');
    await expect(zorunlu).toBeVisible();

    // Kapatıp kaydet: sunucu da kabul eder; Teslim şekli senaryoya yazılmaz.
    await anahtar.uncheck();
    await expect(ozet).toContainText('Tüm kurallar sağlanıyor');
    await kaydet.click();
    await expect(page).toHaveURL(/#\/senaryolar\/u\//);
    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    const kayit = liste.find((x) => x.baslik === 'Arayüzden kargo dahil değil') as Nesne;
    expect(kayit).toBeTruthy();
    const veri = ((await api(`/platform/senaryo?id=${String(kayit.id)}&ortamId=${ortamId}`)).senaryo as Nesne).veri as Nesne;
    expect(veri).toMatchObject({ musteriAdi: 'Ayşe Deneme', [DAHIL]: false });
    expect(veri).not.toHaveProperty('teslimSekli');
    expect(hatalar).toEqual([]);
    expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
    await baglam.close();
  });
});
