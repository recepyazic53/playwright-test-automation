// KORUMA TESTLERİ — TABLOYA BAĞLI SEÇİMLE AÇILAN KOŞULLU BÖLÜM: bir seçim alanı test verisi tablosuna bağlıyken (değer
// ${Tablo.Sütun} + satır seçimi, sütun karşılıklarında sayfa değeri) bölümün koşulu değerlendirilebilmeli. Seçilen satırdan TEK değer
// çıkıyorsa koşul o değerle (metinle ya da kodla yazılmış olsa da) değerlendirilir: "Tekli" → bölüm gizli, zorunlu dosyası hata
// üretmez; "Çoklu" → bölüm görünür, dosya zorunlu. Değer satıra göre değişiyorsa (birden çok satır, "uyan tüm satırlar", seçimsiz çok
// satırlı tablo) bilinmiyor kalır (bölüm görünür, "koşullu · satıra göre"). Doğrulayıcı (form + sunucu) ve koşu planı aynı sonucu
// verir; 127.0.0.1'deki sahte sayfada form ve koşu. Ayrı Nöbetçi, geçici veritabanı; dış istek yok. Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { gorunurlukleriHesapla, senaryoyuDogrula, type DogrulamaBaglami, type DogrulamaModeli } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { basvurununTekDegeri, tabloDegerListeleri, type Tablo } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { modeleListeleriUygula } from '../../scripts/platform/senaryolar/deger-listesi-modeli.mjs';
import { ekranBasvurulariniCoz, modelAlanBilgisi } from '../../scripts/platform/tablolar/ekran-basvurulari.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Json = Record<string, unknown>;
type Satirli = { id: string; ad: string; satirlar: Array<{ id: string; ad: string }> };

const EKRAN = 'İşlem formu';
const TABLO = 'İşlem tipi tablosu';
const SUTUN = 'İşlem tipi';
const TEKLI = 'Tekli işlem';
const COKLU = 'Çoklu işlem';
const REF = `\${${TABLO}.${SUTUN}}`;

/** Ekran modeli: seçim alanı (ekran etiketi yok) + aynı adımda koşullu "liste" bölümü (zorunlu dosya). kosulDegeri: koşulun yazımı. */
function islemModeli(kosul: { coklu: string; tekli: string } = { coklu: COKLU, tekli: TEKLI }): Json {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'islem-formu', ad: EKRAN, aciklama: 'Koşullu bölüm fikstürü (değerler sahte).', ekranUrl: '/islem', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' },
    kosullar: {
      cokluIslem: { aciklama: 'Çoklu işlem seçiliyken', ifade: { alan: 'islemTipi', esit: kosul.coklu } },
      tekliIslem: { aciklama: 'Tekli işlem seçiliyken', ifade: { alan: 'islemTipi', esit: kosul.tekli } }
    },
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'İşlem bilgileri',
      bolumler: [
        { id: 'secim', baslik: 'İşlem', alanlar: [{
          id: 'islemTipi', tip: 'secim', etiket: { ekran: null }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'islemTipi' },
          konum: { secici: '#islemTipi', kirilganlik: 'orta' },
          secenekler: [{ deger: '1', metin: TEKLI }, { deger: '2', metin: COKLU }], seceneklerDurumu: 'tam'
        }] },
        { id: 'listeBolumu', baslik: 'Çoklu işlem (dosyayla liste)', gorunurluk: { kosul: 'cokluIslem' }, alanlar: [{
          id: 'listeDosyasi', tip: 'dosya', etiket: { ekran: 'Liste dosyası' }, zorunlu: true, yapilandirma: 'senaryo', kabul: '.xlsx',
          eslesme: { senaryo: 'listeDosyasi' }, konum: { secici: '#listeDosyasi', kirilganlik: 'orta' }
        }] }
      ],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Gönderildi', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** İki satırlı tablo (ortamsız); karşılıklar sayfa değerini (seçenek value) verir. */
function islemTablosu(): Tablo {
  return {
    id: 't-islem', ad: TABLO,
    sutunlar: [{ ad: SUTUN, gizli: false, karsiliklar: { [TEKLI]: { sayfa: '1' }, [COKLU]: { sayfa: '2' } } }],
    satirlar: [{ id: 'r-tekli', ortamId: null, degerler: { [SUTUN]: TEKLI } }, { id: 'r-coklu', ortamId: null, degerler: { [SUTUN]: COKLU } }]
  };
}
const GRUP = 't-islem|';

/** Model yüklenirken olduğu gibi: tablo bağlantısının değer listeleri modele uygulanır (seçenek senaryo değeri = tablodaki değer). */
function listeliModel(kosul?: { coklu: string; tekli: string }): Json {
  return modeleListeleriUygula(islemModeli(kosul), tabloDegerListeleri({ islemTipi: { tablo: 't-islem', sutun: SUTUN } }, [islemTablosu()], 'e'));
}

function baglam(model: Json, s: { tabloSecimleri?: Record<string, Record<string, string>>; veriKosulari?: { gruplar: Record<string, { kip: string; satirlar?: string[] }> } } = {}): DogrulamaBaglami {
  return {
    model: model as unknown as DogrulamaModeli, kaynak: 'kayit',
    tabloDegeri: (b) => basvurununTekDegeri([islemTablosu()], b, { ...s, ortamIdler: ['o1'] })
  };
}
const TEK_SATIR = (deger: string) => ({ tabloSecimleri: { [GRUP]: { [SUTUN]: deger } } });
const hataAlanlari = (veri: Json, b: DogrulamaBaglami) => senaryoyuDogrula(veri, b).hatalar.map((h) => h.alan);

test.describe('doğrulayıcı: tabloya bağlı seçimle açılan koşullu bölüm', () => {
  test('kök neden: çözücü yokken tablodan gelen değer koşulu "bilinmiyor" yapar (bölüm görünür, dosya zorunlu) — eski davranış korunur', () => {
    const b: DogrulamaBaglami = { model: listeliModel() as unknown as DogrulamaModeli, kaynak: 'kayit' };
    const g = gorunurlukleriHesapla({ baslik: 'x', islemTipi: REF }, b);
    expect(g.bolumler.listeBolumu).toBeNull();
    expect(g.satiraGore.bolumler.listeBolumu).toBe(true);
    expect(hataAlanlari({ baslik: 'x', islemTipi: REF }, b)).toEqual(['listeDosyasi']);
  });

  test('tek satır "Tekli" seçili → bölüm gizli, zorunlu dosya hatası yok', () => {
    const b = baglam(listeliModel(), TEK_SATIR(TEKLI));
    const g = gorunurlukleriHesapla({ baslik: 'x', islemTipi: REF }, b);
    expect(g.bolumler.listeBolumu).toBe(false);
    expect(g.alanlar.listeDosyasi).toBe(false);
    expect(g.satiraGore.bolumler.listeBolumu).toBeUndefined();
    expect(hataAlanlari({ baslik: 'x', islemTipi: REF }, b)).toEqual([]);
  });

  test('tek satır "Çoklu" seçili → bölüm görünür, dosya zorunlu', () => {
    const b = baglam(listeliModel(), TEK_SATIR(COKLU));
    expect(gorunurlukleriHesapla({ baslik: 'x', islemTipi: REF }, b).bolumler.listeBolumu).toBe(true);
    expect(hataAlanlari({ baslik: 'x', islemTipi: REF }, b)).toEqual(['listeDosyasi']);
    expect(hataAlanlari({ baslik: 'x', islemTipi: REF, listeDosyasi: 'liste.xlsx' }, b)).toEqual([]);
  });

  test('koşul kodla (sayfa değeri) yazılmışsa da çalışır: tablodan, düz metinle ve kodla verilen değer', () => {
    const kodla = { coklu: '2', tekli: '1' };
    for (const model of [listeliModel(kodla), islemModeli(kodla)]) {
      const tekli = baglam(model, TEK_SATIR(TEKLI));
      const coklu = baglam(model, TEK_SATIR(COKLU));
      expect(gorunurlukleriHesapla({ baslik: 'x', islemTipi: REF }, tekli).bolumler.listeBolumu).toBe(false);
      expect(gorunurlukleriHesapla({ baslik: 'x', islemTipi: REF }, coklu).bolumler.listeBolumu).toBe(true);
    }
    // Düz değer: metinle ya da kodla verilmiş seçim, koşulun hangi yazımla yazıldığından bağımsız aynı sonucu verir.
    for (const kosul of [kodla, undefined]) {
      for (const model of [listeliModel(kosul), islemModeli(kosul)]) {
        const b: DogrulamaBaglami = { model: model as unknown as DogrulamaModeli, kaynak: 'kayit' };
        for (const [deger, beklenen] of [[TEKLI, false], ['1', false], [COKLU, true], ['2', true]] as const) {
          expect(gorunurlukleriHesapla({ baslik: 'x', islemTipi: deger }, b).bolumler.listeBolumu, `${JSON.stringify(kosul)} ${deger}`).toBe(beklenen);
        }
      }
    }
  });

  test('değer satıra göre değişiyorsa bilinmiyor: seçimsiz iki satır, "uyan tüm satırlar", iki işaretli satır; tek işaretli satır bellidir', () => {
    const belirsizler = [{}, { veriKosulari: { gruplar: { [GRUP]: { kip: 'tumu' } } } }, { veriKosulari: { gruplar: { [GRUP]: { kip: 'secili', satirlar: ['r-tekli', 'r-coklu'] } } } }];
    for (const s of belirsizler) {
      const b = baglam(listeliModel(), s);
      const g = gorunurlukleriHesapla({ baslik: 'x', islemTipi: REF }, b);
      expect(g.bolumler.listeBolumu, JSON.stringify(s)).toBeNull();
      expect(g.satiraGore.bolumler.listeBolumu).toBe(true);
      expect(hataAlanlari({ baslik: 'x', islemTipi: REF }, b)).toEqual(['listeDosyasi']);
    }
    const tek = baglam(listeliModel(), { veriKosulari: { gruplar: { [GRUP]: { kip: 'secili', satirlar: ['r-tekli'] } } } });
    expect(gorunurlukleriHesapla({ baslik: 'x', islemTipi: REF }, tek).bolumler.listeBolumu).toBe(false);
  });

  test('tek değer: ortama özel satır ve gizli sütun', () => {
    const t = islemTablosu();
    t.satirlar = [{ id: 'a', ortamId: 'o1', degerler: { [SUTUN]: TEKLI } }, { id: 'b', ortamId: 'o2', degerler: { [SUTUN]: COKLU } }];
    const b = { tablo: TABLO, etiket: '', sutun: SUTUN, bicim: '' };
    expect(basvurununTekDegeri([t], b, { ortamIdler: ['o1'] })).toEqual({ deger: TEKLI, sayfa: '1' });
    expect(basvurununTekDegeri([t], b, { ortamIdler: ['o2'] })).toEqual({ deger: COKLU, sayfa: '2' });
    expect(basvurununTekDegeri([t], b, { ortamIdler: ['o1', 'o2'] })).toBeNull();
    expect(basvurununTekDegeri([t], b)).toBeNull();
    t.sutunlar[0].gizli = true;
    expect(basvurununTekDegeri([t], b, { ortamIdler: ['o1'] })).toBeNull();
    expect(basvurununTekDegeri([t], { ...b, tablo: 'Olmayan' })).toBeNull();
  });
});

test.describe('koşu planı: tekli senaryoda dosya bölümü atlanır', () => {
  /** Koşudaki sıra: başvuru seçilen satırdan çözülür (veri-oku.mjs), plan çözülmüş veriyle kurulur. */
  const plan = (model: Json, satir: string) => {
    const cozulmus = ekranBasvurulariniCoz({ baslik: 'x', islemTipi: REF }, {
      tablolar: [islemTablosu()], ...modelAlanBilgisi(model), ortamId: 'o1', tabloSecimleri: TEK_SATIR(satir).tabloSecimleri
    });
    expect(cozulmus.hatalar).toEqual([]);
    return { veri: cozulmus.veri, plan: modelKosuPlani(model, cozulmus.veri) };
  };
  const alanlar = (p: ReturnType<typeof modelKosuPlani>) => p.adimlar.flatMap((a) => a.alanlar.map((x) => x.id));

  test('listeli model (tablodaki değer seçenekte): Tekli → dosya planda yok; Çoklu → dosya planda', () => {
    const t = plan(listeliModel(), TEKLI);
    expect(t.veri.islemTipi).toBe(TEKLI);
    expect(t.plan.hatalar).toEqual([]);
    expect(alanlar(t.plan)).toEqual(['islemTipi']);
    const c = plan(listeliModel(), COKLU);
    expect(c.veri.islemTipi).toBe(COKLU);
    expect(alanlar(c.plan)).toEqual(['islemTipi']);
    // Çoklu senaryoda dosya değeri verilmediği için alan boştur (atlanır); değer verilince planda yer alır.
    expect(alanlar(modelKosuPlani(listeliModel(), { ...c.veri, listeDosyasi: 'liste.xlsx' }))).toEqual(['islemTipi', 'listeDosyasi']);
    expect(alanlar(modelKosuPlani(listeliModel(), { ...t.veri, listeDosyasi: 'liste.xlsx' }))).toEqual(['islemTipi']);
  });

  test('listesiz model (değer sayfa karşılığıyla gelir) ve kodla yazılmış koşul: aynı sonuç', () => {
    for (const kosul of [undefined, { coklu: '2', tekli: '1' }]) {
      const model = islemModeli(kosul);
      const t = plan(model, TEKLI);
      expect(t.veri.islemTipi).toBe('1');
      expect(alanlar(modelKosuPlani(model, { ...t.veri, listeDosyasi: 'liste.xlsx' }))).toEqual(['islemTipi']);
      const c = plan(model, COKLU);
      expect(c.veri.islemTipi).toBe('2');
      expect(alanlar(modelKosuPlani(model, { ...c.veri, listeDosyasi: 'liste.xlsx' }))).toEqual(['islemTipi', 'listeDosyasi']);
    }
  });
});

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>İşlem</title></head><body>
<label>İşlem tipi <select id="islemTipi"><option value="">Seçin</option><option value="1">${TEKLI}</option><option value="2">${COKLU}</option></select></label>
<div id="listeBolumu" hidden><label>Liste dosyası <input id="listeDosyasi" type="file" accept=".xlsx"></label></div>
<button id="gonder" type="button">Gönder</button><p id="sonuc"></p>
<script>
const tip = document.getElementById('islemTipi');
tip.addEventListener('change', () => { document.getElementById('listeBolumu').hidden = tip.value !== '2'; });
document.getElementById('gonder').addEventListener('click', async () => {
  const dosya = document.getElementById('listeDosyasi').files.length;
  await fetch('/gonder', { method: 'POST', body: JSON.stringify({ islemTipi: tip.value, dosya }) });
  document.getElementById('sonuc').textContent = 'Gönderildi';
});
</script></body></html>`;

test.describe('senaryo formu ve koşu: tabloya bağlı seçim + koşullu bölüm (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Islem-${randomBytes(6).toString('hex')}`;
  const gelenler: Json[] = [];
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let tabloId = '';
  const satirId: Record<string, string> = {};
  const api = (yol: string, govde?: Json) => nobetciApi(nobetci, yol, govde) as Promise<Json>;
  const basarili = async (yol: string, govde?: Json) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const bolum = (page: Page) => page.locator('[data-bolum="listeBolumu"]');
  const bolumCipi = (page: Page) => page.locator('[data-bolum-cipi="listeBolumu"]');

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosullu-bolum-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/islem') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
      if (i.yol === '/gonder' && i.yontem === 'POST') { gelenler.push(JSON.parse(i.govde) as Json); return { tur: 'application/json', govde: '{}' }; }
      return { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'İşlem Projesi' })).proje as Json).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Json).id);
    const paket = {
      tur: 'sayfa-paketi', surum: 1,
      meta: { ekran: { anahtar: 'islem-formu', ad: EKRAN, urlYolu: '/islem' }, olusturan: 'birim testi', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
      model: islemModeli(), senaryoOnerileri: [],
      gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
      bilinmeyenler: []
    };
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Json[]).find((e) => e.ad === EKRAN)?.id);
    await basarili('/platform/tablo/kaydet', {
      projeId, ad: TABLO, sutunlar: [{ ad: SUTUN, karsiliklar: { [TEKLI]: { sayfa: '1' }, [COKLU]: { sayfa: '2' } } }],
      satirlar: [{ ad: 'Tekli satırı', degerler: { [SUTUN]: TEKLI } }, { ad: 'Çoklu satırı', degerler: { [SUTUN]: COKLU } }]
    });
    const t = ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Satirli[]).find((x) => x.ad === TABLO) as Satirli;
    tabloId = t.id;
    for (const r of t.satirlar) satirId[r.ad] = r.id;
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { islemTipi: { tablo: tabloId, sutun: SUTUN } } });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sunucu: satırı "Tekli" olan senaryo dosyasız kaydedilir; "Çoklu" satırında dosya zorunlu', async () => {
    const kaydet = (baslik: string, satir: string) => api('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik, ortamIdleri: [ortamId], kosuyaDahil: false, veri: { baslik, islemTipi: REF },
      tabloSecimleri: { [`${tabloId}|`]: { [SUTUN]: satir } }
    });
    const tekli = await kaydet('Sunucu tekli', TEKLI);
    expect(tekli.basarili, JSON.stringify(tekli.hatalar ?? tekli.mesaj)).toBe(true);
    const coklu = await kaydet('Sunucu çoklu', COKLU);
    expect(coklu.basarili).toBe(false);
    expect((coklu.hatalar as Array<{ alan: string }>).map((h) => h.alan)).toEqual(['listeDosyasi']);
    // Satır seçimi yok (iki satır uyuyor): değer bilinmiyor, dosya zorunlu kalır (bugünkü davranış).
    const secimsiz = await api('/platform/senaryo/kaydet', { projeId, ekranId, baslik: 'Sunucu seçimsiz', ortamIdleri: [ortamId], kosuyaDahil: false, veri: { baslik: 'Sunucu seçimsiz', islemTipi: REF } });
    expect(secimsiz.basarili).toBe(false);
  });

  test('form: Tekli seçince bölüm gizlenir, Çoklu seçince açılır; tablodan + satır seçimiyle de; Tekli kaydedilir ve koşuda dosya bölümü atlanır', async () => {
    test.setTimeout(180_000);
    const baglamT = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglamT.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/senaryolar/yeni/${ekranId}`);
    const tip = page.locator('[data-alan="islemTipi"] select');
    await expect(tip).toBeVisible({ timeout: 20_000 });
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Formdan tekli');
    // Düz seçim.
    await tip.selectOption(TEKLI);
    await expect(bolum(page)).toBeHidden();
    await tip.selectOption(COKLU);
    await expect(bolum(page)).toBeVisible();
    await expect(page.locator('[data-alan="listeDosyasi"]')).toBeVisible();
    await expect(bolumCipi(page)).toBeHidden();
    // Tablodan: iki satır uyuyor (seçim yok) → bölüm görünür, "koşullu · satıra göre".
    await tip.selectOption(REF);
    await expect(bolum(page)).toBeVisible();
    await expect(bolumCipi(page)).toHaveText('koşullu · satıra göre');
    const satirSecimi = page.locator('.satir-secimi-grubu select').first();
    await expect(satirSecimi).toBeVisible();
    await satirSecimi.selectOption(`s:${satirId['Tekli satırı']}`);
    await expect(bolum(page)).toBeHidden();
    await satirSecimi.selectOption(`s:${satirId['Çoklu satırı']}`);
    await expect(bolum(page)).toBeVisible();
    await expect(bolumCipi(page)).toBeHidden();
    await satirSecimi.selectOption(`s:${satirId['Tekli satırı']}`);
    await expect(bolum(page)).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('kosullu-bolum-tekli.png'), fullPage: false });
    // Kaydetme dosya istemez.
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(async () => ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Json[]).some((x) => x.baslik === 'Formdan tekli'), { timeout: 15_000 }).toBe(true);
    expect(hatalar).toEqual([]);
    await baglamT.close();

    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Json[];
    const id = String(liste.find((x) => x.baslik === 'Formdan tekli')?.id);
    const kayit = (await api(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Json;
    expect((kayit.veri as Json).islemTipi).toBe(REF);
    expect((kayit.veri as Json).listeDosyasi).toBeUndefined();
    expect(kayit.tabloSecimleri).toEqual({ [`${tabloId}|`]: { [SUTUN]: TEKLI } });
    // Koşu: değer satırdan (sayfa karşılığı "1"), dosya bölümü atlanır; sayfa dosyasız gönderir.
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: id, ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Json;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(gelenler.at(-1)).toEqual({ islemTipi: '1', dosya: 0 });
  });
});
