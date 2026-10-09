// DEĞER SONRASI YENİDEN OKUMA (hızlı test). Gerçek ekranda görülen sorunun koruması (genel; siteye / alana özgü sabit yok): bir düğmeye
// basılınca beliren iki liste (üst + bağlı alt) sayfanın sorgusuyla DOLU geldi; Nöbetçi aralarındaki bağı bulmadı ve seçeneklerini tabloya
// yazmadı (kullanıcı değiştirmedi diye).
//  - Saf kurallar: sayfaFarki (beliren / kaybolan, dolan / değişen / boşalan liste, etkinleşen / kilitlenen, sayfanın doldurduğu),
//    farkOzeti, tetikHedefleri (zincirin alt halkası tetik hedefi değil); planKur tetik notu ve birlikte satır.
//  - Basış sonrası: beliren listeler ilk keşifle aynı zincir keşfinden geçer, sayfanın dolu değerleri sonunda geri yüklenir; sayfanın
//    doldurduğu listelerin seçenekleri ve gözlenen kombinasyonları zincir tablosuna yazılır; senaryoya değer yazılmaz; normal koşu bu
//    alanlara dokunmaz.
//  - Metin uygulaması: metin yazılıp alandan çıkılınca (düğmeye basılmadan) sayfaya uygulanır; fark özeti ve tetik veri durağında; liste
//    dolunca zincir keşfi; normal koşu metinden sonra listenin dolmasını bekler. 1440 / 390 px taşma yok.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (yeniden-okuma-fikstur.ts); geçici veritabanı; veri/ klasörüne dokunulmaz. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { farkOzeti, sayfaFarki, tetikHedefleri } from '../../scripts/platform/hizli-test/sayfa-farki.mjs';
import { planKur } from '../../scripts/platform/hizli-test/kayit-plani.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { YenidenOkumaUygulamasi } from './yeniden-okuma-fikstur';

type Nesne = Record<string, any>;
const liste = (anahtar: string, etiket: string, l: string[], ek: Nesne = {}): Nesne => ({
  anahtar, etiket, tur: 'select', secenekler: [{ deger: '', metin: 'Seçiniz' }, ...l.map((x) => ({ deger: x, metin: x }))], ...ek
});

test.describe('saf kurallar', () => {
  test('sayfaFarki: beliren / kaybolan, dolan / değişen / boşalan liste, etkinleşen / kilitlenen, sayfanın doldurduğu (yazılan hariç)', () => {
    const once = [
      { anahtar: '#kod', etiket: 'Kod', tur: 'text' },
      liste('#marka', 'Marka', []), liste('#model', 'Model', ['A']), liste('#renk', 'Renk', ['X', 'Y']),
      { anahtar: '#not', etiket: 'Not', tur: 'text', devreDisi: true },
      { anahtar: '#tarih', etiket: 'Tarih', tur: 'text' },
      { anahtar: '#eski', etiket: 'Eski', tur: 'text' },
      { anahtar: '#gizli', tur: 'hidden' }
    ];
    const sonra = [
      { anahtar: '#kod', etiket: 'Kod', tur: 'text', hazir: true, mevcut: 'A1' },
      liste('#marka', 'Marka', ['K', 'G'], { hazir: true, mevcut: 'K' }), liste('#model', 'Model', ['B']), liste('#renk', 'Renk', []),
      { anahtar: '#not', etiket: 'Not', tur: 'text' },
      { anahtar: '#tarih', etiket: 'Tarih', tur: 'text', kilit: 'salt-okunur' },
      { anahtar: '#yeni', etiket: 'Yeni', tur: 'text', hazir: true, mevcut: 'dolu' },
      { anahtar: '#gizli2', tur: 'hidden' }
    ];
    const f = sayfaFarki(once, sonra, ['#kod']);
    expect(f).toEqual({
      belirenler: ['#yeni'], kaybolanlar: ['#eski'], dolanListeler: ['#marka'], degisenListeler: ['#model'], bosalanListeler: ['#renk'],
      etkinlesenler: ['#not'], kilitlenenler: ['#tarih'], sayfaDoldurdu: [{ anahtar: '#marka', deger: 'K' }, { anahtar: '#yeni', deger: 'dolu' }]
    });
    const ad = (k: string): string => ({ '#marka': 'Marka', '#model': 'Model', '#renk': 'Renk', '#not': 'Not', '#tarih': 'Tarih', '#yeni': 'Yeni', '#eski': 'Eski' } as Record<string, string>)[k] ?? k;
    expect(farkOzeti(f, { neden: '“Kod” girilince', ad })).toBe('“Kod” girilince “Marka” listesi doldu; “Model” listesinin seçenekleri değişti; “Renk” listesi boşaldı; “Yeni” belirdi; “Eski” gizlendi; “Not” düzenlenebilir oldu; “Tarih” kilitlendi; sayfa “Marka” = “K”, “Yeni” = “dolu” doldurdu.');
    expect(farkOzeti(sayfaFarki(once, once), { ad })).toBe('');
  });

  test('tetikHedefleri: metin girilince beliren / dolan alanlar; zincirin alt halkası (üstü de hedef) ve kaynağın kendisi hedef değil', () => {
    const f = sayfaFarki([{ anahtar: '#kod', tur: 'text' }, liste('#marka', 'Marka', []), liste('#model', 'Model', [])],
      [{ anahtar: '#kod', tur: 'text' }, liste('#marka', 'Marka', ['K']), liste('#model', 'Model', ['K1']), { anahtar: '#ek', tur: 'text' }]);
    expect(tetikHedefleri(f, '#kod', new Map([['#model', '#marka']]))).toEqual([{ hedef: '#ek', olay: 'belirdi' }, { hedef: '#marka', olay: 'doldu' }]);
    // Bağ bilinmiyorsa iki liste de hedeftir.
    expect(tetikHedefleri(f, '#kod').map((x) => x.hedef)).toEqual(['#ek', '#marka', '#model']);
  });

  test('planKur: tetik hedefi zincirde değilse ve iki değer de kullanıcınınsa aynı kayıt tablosunda tek satır; diğer durumda tabloda tetik notu', () => {
    const alanlar = [{ anahtar: '#kod', etiket: 'Kod', tur: 'text' }, liste('#tip', 'Tip', ['T1', 'T2'])];
    const birlikte = planKur({ baslik: 'Deneme', alanlar, degerler: { '#kod': { deger: 'A1', kaynak: 'elle' }, '#tip': { deger: 'T2', kaynak: 'elle' } }, tetikler: [{ kaynak: '#kod', hedef: '#tip', olay: 'doldu' }] });
    const t = birlikte.tablolar.find((x) => x.alanlar.some((a) => a.oturumAnahtar === '#tip'));
    expect(t?.tur).toBe('kayit');
    expect(t?.alanlar.map((a) => a.oturumAnahtar).sort()).toEqual(['#kod', '#tip']);
    expect(t?.satirlar).toEqual([{ Kod: 'A1', Tip: 'T2' }]);
    expect(t?.tetik).toEqual(['“Tip” seçenekleri “Kod” girilince gelir.']);
    // Hedefin değeri yoksa kendi liste tablosunda kalır (tüm seçenekler), tetik notuyla.
    const ayri = planKur({ baslik: 'Deneme', alanlar, degerler: { '#kod': { deger: 'A1', kaynak: 'elle' } }, tetikler: [{ kaynak: '#kod', hedef: '#tip', olay: 'doldu' }] });
    const l = ayri.tablolar.find((x) => x.ad === 'Tip');
    expect(l?.satirlar).toEqual([{ Tip: 'T1' }, { Tip: 'T2' }]);
    expect(l?.tetik).toEqual(['“Tip” seçenekleri “Kod” girilince gelir.']);
  });
});

test.describe('Nöbetçi taraması, kayıt ve normal koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Okuma-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  const u = new YenidenOkumaUygulamasi();
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
    return y;
  }
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      if (o.durum === 'kesifOnay' && !durumlar.includes('kesifOnay')) { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (durumlar.includes(o.durum)) return o;
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const alanBul = (o: Nesne, etiket: string): Nesne => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return a;
  };
  const tasmaYok = async (page: Page): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };
  const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
  /** Plaka girilir; Evet izni + tek aday: "Sorgula"ya basılır; ikinci adımın veri durağı. */
  async function sorguyaKadar(hedef: string, ekranAdi: string): Promise<{ id: string; o: Nesne }> {
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef, ekranAdi, izin: 'evet', cumle: 'Sorgula düğmesine bas, "Kayıt alındı" görünce bitir' })).id);
    let o = await bekle(id, ['veri'], 300);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Plaka').anahtar]: deger('06 DNM 01') } });
    o = await bekle(id, ['veri'], 300);
    expect(o.adimlar.length, JSON.stringify(o.gunluk)).toBe(2);
    return { id, o };
  }
  /** Kaydet'e basılır, "Kayıt alındı" bitiş olur, kaydet durağı. */
  async function bitir(id: string): Promise<void> {
    let o = await bekle(id, ['karar'], 180);
    const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
    expect(aday, JSON.stringify(o.soru.adaylar)).toBeTruthy();
    await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
    o = await bekle(id, ['karar']);
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    expect(bitti, JSON.stringify(o.soru.etiketler)).toBeTruthy();
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
  }
  async function kos(senaryoId: string): Promise<{ sonuc: Nesne; kayitlar: Array<Record<string, string>> }> {
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const once = u.kayitlar.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    return { sonuc, kayitlar: u.kayitlar.slice(once) };
  }
  /** Kaydedilen ekranın modeli, senaryosu ve zincir tablosu. */
  async function kayitlariOku(k: Nesne): Promise<{ m: (s: string) => Nesne; senaryo: Nesne; zincir: Nesne }> {
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    const alanlar = (model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const m = (secici: string): Nesne => alanlar.find((a) => a.konum?.secici === secici) as Nesne;
    const senaryo = (await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)).senaryo as Nesne;
    const tablolar = (await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
    const zincir = tablolar.find((t) => (t.sutunlar as Nesne[]).map((c) => c.ad).join('|') === 'Marka|Model') as Nesne;
    expect(zincir, JSON.stringify(tablolar.map((t) => t.ad))).toBeTruthy();
    return { m, senaryo, zincir };
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'deger-sonrasi-yeniden-okuma-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Okuma Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('basış sonrası beliren dolu listeler: zincir bulunur, sayfanın değerleri korunur; seçenekler ve kombinasyonlar tabloya, senaryoya değer yok; normal koşu dokunmaz', async () => {
    test.setTimeout(600_000);
    const istekOnce = u.istekler.length;
    const { id, o } = await sorguyaKadar('/sorgu-formu/', 'Sorgu formu');
    // Basıştan sonra beliren listeler ilk keşifle aynı zincir keşfinden geçti.
    expect(o.zincir, JSON.stringify(o.gunluk)).toEqual(['Marka → Model']);
    const marka = alanBul(o, 'Marka');
    const model = alanBul(o, 'Model');
    expect(marka).toMatchObject({ hazir: true, mevcut: 'Kuzey', deger: null });
    expect(model).toMatchObject({ hazir: true, mevcut: 'K-2', deger: null, bagli: { ust: marka.anahtar } });
    expect(JSON.stringify(o.gunluk)).toContain('“Sorgula” basılınca');
    // Keşif yazma isteği atmadı (yalnız sorgu / seçenek istekleri).
    expect(u.istekler.slice(istekOnce).filter((x) => x.startsWith('POST'))).toEqual([]);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Kod').anahtar]: deger('A1') } });
    await bitir(id);
    // Hızlı testte sayfanın doldurduğu değerler keşiften sonra geri yüklenmişti (Kaydet sayfadaki değerlerle gitti).
    expect(u.kayitlar.at(-1)).toEqual({ plaka: '06 DNM 01', kod: 'A1', marka: 'KZ', model: 'K2' });
    const baslik = 'Sorgu — dolu listeler';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    const zt = (oz.onizleme.tablolar as Nesne[]).find((t) => Array.isArray(t.zincir) && t.zincir.join('|') === 'Marka|Model');
    expect(zt, JSON.stringify((oz.onizleme.tablolar as Nesne[]).map((t) => t.ad))).toBeTruthy();
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, senaryoIndeksleri: [] });
    const { m, senaryo, zincir } = await kayitlariOku(k);
    // Tek zincir tablosu: sayfanın doldurduğu kombinasyon ve keşifte gözlenen başka kombinasyonlar (yalnız tam satırlar; en çok 200).
    const satirlar = (zincir.satirlar as Nesne[]).map((r) => [r.degerler.Marka, r.degerler.Model]);
    expect(satirlar).toEqual(expect.arrayContaining([['Kuzey', 'K-1'], ['Kuzey', 'K-2'], ['Kuzey', 'K-3']]));
    expect(satirlar.some((r) => r[0] !== 'Kuzey'), JSON.stringify(satirlar)).toBe(true);
    for (const r of satirlar) expect(r.every(Boolean), JSON.stringify(r)).toBe(true);
    expect(satirlar.length).toBeLessThanOrEqual(200);
    // Modelde bağımlılık; senaryoda Marka / Model değeri YOK (sayfadaki değer korunur).
    expect(m('#model').bagimlilik.alan).toBe(m('#marka').id);
    const anahtarlar = Object.keys(senaryo.veri as Nesne);
    expect(anahtarlar).not.toContain(String(m('#marka').eslesme.senaryo));
    expect(anahtarlar).not.toContain(String(m('#model').eslesme.senaryo));
    expect(anahtarlar).toContain(String(m('#kod').eslesme.senaryo));
    // Normal koşu: Marka / Model'e dokunulmaz, sayfanın doldurduğu değerlerle kaydedilir.
    const r = await kos(String(k.senaryoId));
    expect(r.sonuc.durum, JSON.stringify(r.sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(r.kayitlar).toEqual([{ plaka: '06 DNM 01', kod: 'A1', marka: 'KZ', model: 'K2' }]);
  });

  test('metin uygulaması: yazılıp alandan çıkılınca fark özeti ve tetik görünür, liste dolunca zincir bulunur; kayıtta tetik; normal koşu tetiği bekler; 1440 / 390 taşma yok', async () => {
    test.setTimeout(600_000);
    const istekOnce = u.istekler.length;
    const { id, o: o0 } = await sorguyaKadar('/sorgu-formu/?kip=kod', 'Sorgu formu kodlu');
    expect(o0.zincir).toEqual([]);
    expect(alanBul(o0, 'Marka').secenekler).toEqual([]);
    const tarayici = await korumaliTarayici();
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    try {
      await page.goto(`/#/hizli-test/o/${id}`);
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      // (Yeni beliren alanların adında "yeni alan" rozeti de okunur: satırlar alan anahtarıyla bulunur.)
      const satir = (ad: string) => soru.locator(`.hizli-alan[data-anahtar="${alanBul(o0, ad).anahtar}"]`);
      const kod = satir('Kod').getByRole('textbox');
      await kod.fill('A1');
      // Alandan çıkılır: değer düğmeye basılmadan sayfaya uygulanır; fark aynı durakta özetlenir.
      await kod.press('Tab');
      const not = soru.locator('.not-kutusu');
      await expect(not).toContainText('“Kod” girilince “Marka”, “Model” listeleri doldu', { timeout: 90_000 });
      await expect(not).toContainText('sayfa “Marka” = “Kuzey”, “Model” = “K-2” doldurdu');
      // Yazılan değer korunur; tetik ve zincir göstergesi.
      await expect(satir('Kod').getByRole('textbox')).toHaveValue('A1');
      await expect(satir('Marka').locator('.hizli-tetik')).toHaveText('Seçenekleri “Kod” girilince gelir.');
      await expect(satir('Model').locator('.hizli-tetik')).toHaveCount(0);
      await expect(satir('Model')).toContainText('Seçenekleri “Marka” seçimine göre gelir.');
      await expect(soru.locator('.hizli-zincir-gostergesi')).toContainText('Marka → Model');
      await expect(satir('Marka').getByRole('combobox')).toHaveValue('KZ');
      await tasmaYok(page);
      await page.screenshot({ path: test.info().outputPath('yeniden-okuma-1440.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(satir('Marka').locator('.hizli-tetik')).toBeVisible();
      await tasmaYok(page);
      await page.screenshot({ path: test.info().outputPath('yeniden-okuma-390.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      const o = await bekle(id, ['veri']);
      expect(o.zincir).toEqual(['Marka → Model']);
      expect(alanBul(o, 'Marka').tetik).toMatchObject({ kaynak: alanBul(o, 'Kod').anahtar, olay: 'doldu' });
      expect(alanBul(o, 'Model').tetik).toBeNull();
      expect(JSON.stringify(o.gunluk)).toContain('Tetik: “Marka” dolar — “Kod” girilince');
      expect(u.istekler.slice(istekOnce).filter((x) => x.startsWith('POST'))).toEqual([]);
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 120_000 });
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }
    await bitir(id);
    expect(u.kayitlar.at(-1)).toEqual({ plaka: '06 DNM 01', kod: 'A1', marka: 'KZ', model: 'K2' });
    const baslik = 'Sorgu — kodla dolan liste';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    const zt = (oz.onizleme.tablolar as Nesne[]).find((t) => Array.isArray(t.zincir) && t.zincir.join('|') === 'Marka|Model') as Nesne;
    expect(zt, JSON.stringify((oz.onizleme.tablolar as Nesne[]).map((t) => t.ad))).toBeTruthy();
    expect(zt.aciklama).toBe('“Marka” seçenekleri “Kod” girilince gelir.');
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, senaryoIndeksleri: [] });
    const { m, senaryo } = await kayitlariOku(k);
    expect(m('#marka').tetik).toEqual({ alan: m('#kod').id, olay: 'doldu' });
    expect(m('#model').tetik).toBeUndefined();
    expect(Object.keys(senaryo.veri as Nesne)).not.toContain(String(m('#marka').eslesme.senaryo));
    // Normal koşu: Kod doldurulunca sayfa 3 sn sonra (zamanlayıcıyla; istek yok) listeleri doldurur; koşu bunu bekler, Kaydet sayfanın
    // değerleriyle gider (beklemeseydi Marka / Model boş giderdi).
    u.kodGecikmeMs = 3_000;
    const r = await kos(String(k.senaryoId)).finally(() => { u.kodGecikmeMs = 700; });
    expect(r.sonuc.durum, JSON.stringify(r.sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(r.kayitlar).toEqual([{ plaka: '06 DNM 01', kod: 'A1', marka: 'KZ', model: 'K2' }]);
  });
});
