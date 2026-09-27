// KORUMA TESTLERİ — EKRAN SENARYOLARINDA DÜZ DEĞER → ${Tablo.Sütun} DÖNÜŞÜMÜ, SATIR SEÇİMİ, ONAY KUTUSU / DOSYA ALANINDA TABLO:
//  · saf: onay kutusu değeri evet/hayır olarak okunur (karşılık dahil; tanınmazsa anlaşılır hata, gizli değer gösterilmez), dosya
//    alanı dosya adı + uzantı / izinli klasör kuralı + gizli sütun yasağı; doğrulayıcı; satır seçimi biçimi; form değerleri.
//  · uçtan uca (127.0.0.1'deki sahte "Başvuru (akış)" uygulaması, ayrı Nöbetçi, geçici veritabanı; dış siteye istek yok): plan
//    (çevrilecek / atlanan nedenleri, gizli maskeleme, ortama göre değişen atlanır, onaysız hiçbir şey yazılmaz), arayüzde plan
//    tablosu + onay (yalnız işaretliler yazılır; masaüstü ve 390px), dönüşümden sonra koşuda ekrana giden değer aynı (her iki
//    ortamda), onaylı API yalnız seçilenleri yazar, formda satır seçimi kaydedilir ve koşuda o satır kullanılır, tablodan
//    onay kutusu / dosya çözülemezse koşu tarayıcı açılmadan durur. Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import type { Tablo } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { ekranBasvurulariniCoz, ekrandakiDeger, mantiksalDeger, modelAlanBilgisi, tabloSecimleriniAyikla } from '../../scripts/platform/tablolar/ekran-basvurulari.mjs';
import { NEDENLER } from '../../scripts/platform/tablolar/ekran-donusumu.mjs';
import { MESAJLAR, senaryoyuDogrula } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { formDegerleriniKur, formSemasiOlustur, senaryoNesnesiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { AkisUygulamasi, HAVUZLAR, akisModeli, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;

/** Ek alanlar: onay kutusu ve düz metin (yalnız plan / hata denetimi; sahte sayfada yoklar, tarayıcı açılmadan durulan koşular). */
function ekModel(): Nesne {
  const model = akisModeli() as Nesne;
  const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
    id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
  });
  (model.adimlar[0].bolumler[0].alanlar as Nesne[]).push(alan('bilgilendirme', 'onayKutusu', 'Bilgilendirme'), alan('uyeKodu', 'metin', 'Üye kodu'));
  return model;
}

test.describe('onay kutusu ve dosya alanında tablo değeri (saf)', () => {
  const sutun = { ad: 'Bilgi', gizli: false, karsiliklar: { Var: { sayfa: 'true' }, Liste: { sayfa: 'liste.xlsx' } } };
  test('evet / hayır: true/false, evet/hayır, 1/0, E/H (+ sayfa karşılığı); tanınmazsa anlaşılır hata, gizli değer yazılmaz', () => {
    for (const [d, b] of [['true', true], ['Evet', true], ['E', true], ['1', true], ['yes', true], ['FALSE', false], ['hayır', false], ['H', false], ['0', false], ['no', false]] as const) {
      expect(mantiksalDeger(d), d).toBe(b);
    }
    expect(mantiksalDeger('belki')).toBeNull();
    expect(ekrandakiDeger({ sutun, deger: 'Var' }, { tip: 'onayKutusu' })).toEqual({ deger: true });
    expect(ekrandakiDeger({ sutun, deger: 'belki' }, { tip: 'onayKutusu' })).toEqual({ hata: expect.stringContaining('"belki" değeri onay kutusu için evet / hayır olarak anlaşılamadı') });
    const gizli = ekrandakiDeger({ sutun: { ad: 'Gizli', gizli: true }, deger: 'gizli-deger-9' }, { tip: 'onayKutusu' });
    expect(JSON.stringify(gizli)).not.toContain('gizli-deger-9');
    expect(JSON.stringify(gizli)).toContain('•••');
  });

  test('dosya: dosya adı (sayfa karşılığı), uzantı ve izinli klasör denetimi; gizli sütundan dosya alınmaz', () => {
    expect(ekrandakiDeger({ sutun, deger: 'Liste' }, { tip: 'dosya', kabul: '.xlsx' })).toEqual({ deger: 'liste.xlsx' });
    expect(ekrandakiDeger({ sutun, deger: 'rapor.pdf' }, { tip: 'dosya', kabul: '.xlsx, .xls' })).toEqual({ hata: 'tablodaki "rapor.pdf" dosyası kabul edilen türde değil (.xlsx, .xls)' });
    expect(ekrandakiDeger({ sutun, deger: 'a.xls' }, { tip: 'dosya', kabul: '.xlsx, .xls' })).toEqual({ deger: 'a.xls' });
    const denetlenen: string[] = [];
    expect(ekrandakiDeger({ sutun, deger: 'yok.xlsx' }, { tip: 'dosya', dosyaDenetle: (ad) => { denetlenen.push(ad); return `"${ad}" dosyası izinli klasörde yok`; } }))
      .toEqual({ hata: '"yok.xlsx" dosyası izinli klasörde yok' });
    expect(denetlenen).toEqual(['yok.xlsx']);
    expect(ekrandakiDeger({ sutun: { ad: 'Yol', gizli: true }, deger: 'x.xlsx' }, { tip: 'dosya' })).toEqual({ hata: 'gizli "Yol" sütunundan dosya alınamaz' });
  });

  test('çözüm: model tipine göre onay kutusu boolean, dosya adı; çözülemeyen koşuyu durduran hata olur', () => {
    const tablolar: Tablo[] = [{ id: 't', ad: 'Ek', sutunlar: [{ ad: 'Bilgi', gizli: false }, { ad: 'Dosya', gizli: false }], satirlar: [{ ortamId: null, degerler: { Bilgi: 'Evet', Dosya: 'liste.xlsx' } }] },
      { id: 'b', ad: 'Belirsiz', sutunlar: [{ ad: 'Bilgi', gizli: false }], satirlar: [{ ortamId: null, degerler: { Bilgi: 'belki' } }] }];
    const bilgi = modelAlanBilgisi(ekModel());
    expect(bilgi.alanTipleri).toMatchObject({ bilgilendirme: 'onayKutusu', listeDosyasi: 'dosya', plan: 'secim' });
    expect(bilgi.kabuller).toEqual({ listeDosyasi: '.xlsx' });
    const r = ekranBasvurulariniCoz({ bilgilendirme: '${Ek.Bilgi}', listeDosyasi: '${Ek.Dosya}' }, { tablolar, ...bilgi, ortamId: 'o1' });
    expect(r.hatalar).toEqual([]);
    expect(r.veri).toEqual({ bilgilendirme: true, listeDosyasi: 'liste.xlsx' });
    const h = ekranBasvurulariniCoz({ bilgilendirme: '${Belirsiz.Bilgi}' }, { tablolar, ...bilgi, ortamId: 'o1' });
    expect(h.hatalar).toEqual([{ alan: 'bilgilendirme', mesaj: expect.stringContaining('evet / hayır olarak anlaşılamadı') }]);
  });

  test('doğrulayıcı: onay kutusu ve dosya tablodan alabilir; dosya gizli sütundan alamaz', () => {
    const model = ekModel();
    const tablolar = [{ ad: 'Ek', sutunlar: [{ ad: 'Bilgi' }, { ad: 'Dosya' }, { ad: 'Gizli', gizli: true }] }];
    const dogrula = (veri: Nesne) => senaryoyuDogrula({ baslik: 'x', kategori: 'K1', urun: 'Ürün A', ...veri }, { model: model as never, kaynak: 'kayit', tablolar });
    expect(dogrula({ bilgilendirme: '${Ek.Bilgi}' }).hatalar).toEqual([]);
    expect(dogrula({ sorguTipi: 'coklu', listeDosyasi: '${Ek.Dosya}' }).hatalar).toEqual([]);
    expect(dogrula({ sorguTipi: 'coklu', listeDosyasi: '${Ek.Gizli}' }).hatalar).toEqual([{ alan: 'listeDosyasi', mesaj: MESAJLAR.gizliSutunDosyada('Liste dosyası', 'Gizli') }]);
    // Düz değer eskisi gibi: onay kutusu boolean olmalı.
    expect(dogrula({ bilgilendirme: 'evet' }).hatalar.map((x) => x.alan)).toEqual(['bilgilendirme']);
  });

  test('form: onay kutusunda tablo başvurusu korunur (değerler ↔ senaryo)', () => {
    const sema = formSemasiOlustur(ekModel() as never, {});
    const d = formDegerleriniKur(sema, { bilgilendirme: '${Ek.Bilgi}' }) as Nesne;
    expect(d.bilgilendirme).toBe('${Ek.Bilgi}');
    expect((senaryoNesnesiOlustur(sema, { ...d, baslik: 'x' }) as Nesne).bilgilendirme).toBe('${Ek.Bilgi}');
    expect((senaryoNesnesiOlustur(sema, { ...formDegerleriniKur(sema, { bilgilendirme: true }), baslik: 'x' }) as Nesne).bilgilendirme).toBe(true);
  });

  test('satır seçimi biçimi: tablo ve sütun olmalı, gizli sütun seçimde kullanılmaz, boşlar atılır', () => {
    const tablolar = [{ id: 't1', ad: 'Kişi', sutunlar: [{ ad: 'Ad' }, { ad: 'Parola', gizli: true }] }];
    expect(tabloSecimleriniAyikla({ 't1|': { Ad: 'Ali', ad: '' }, 't1|kefil': {} }, tablolar)).toEqual({ secimler: { 't1|': { Ad: 'Ali' } }, hatalar: [] });
    expect(tabloSecimleriniAyikla(null, tablolar)).toEqual({ secimler: undefined, hatalar: [] });
    expect(tabloSecimleriniAyikla({ 't1|': { Parola: 'x' } }, tablolar).hatalar).toEqual(['"Kişi" tablosunun gizli "Parola" sütunu satır seçiminde kullanılamaz.']);
    expect(tabloSecimleriniAyikla({ 'yok|': { Ad: 'x' } }, tablolar).hatalar[0]).toContain('tablo bu projede yok');
    expect(tabloSecimleriniAyikla({ 't1|': { Soyad: 'x' } }, tablolar).hatalar).toEqual(['"Kişi" tablosunda "Soyad" sütunu yok (satır seçimi).']);
    expect(tabloSecimleriniAyikla({ 'bozuk anahtar': {} }, tablolar).hatalar[0]).toContain('Geçersiz satır seçimi');
  });
});

test.describe('uçtan uca: değerleri tabloya bağla + satır seçimi (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Donusum-${randomBytes(6).toString('hex')}`;
  const GIZLI = 'gizli-parola-2';
  let nobetci: Nobetci;
  let uygulama: AkisUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamA = '';
  let ortamB = '';
  let ekran1 = '';
  let ekran2 = '';
  const tablo: Record<string, string> = {};
  const senaryo: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const detay = async (id: string, ortamId = ortamA) => (await api(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;
  const gecmisSayisi = async (id: string) => ((await api(`/platform/senaryo/gecmis?id=${id}`)).kayitlar as Nesne[]).length;
  const kos = async (senaryoId: string, ortamId = ortamA) => {
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId, ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  };
  const kaydet = async (ekranId: string, baslik: string, veri: Nesne, ortamIdleri = [ortamA, ortamB]) =>
    String((await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri, veri: { baslik, kategori: 'K1', urun: 'Ürün A', ...veri } })).id);
  const plan = async (ekranId?: string) => ((await basarili('/platform/ekran/senaryolar/tablo-donusumu', { projeId, ...(ekranId ? { ekranId } : {}) })).onizleme as Nesne);
  const satiri = (p: Nesne, s: string, alan: string) => (p.satirlar as Nesne[]).find((x) => x.senaryoId === senaryo[s] && x.alan === alan) as Nesne;
  const tasmaYok = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    klasor = mkdtempSync(join(tmpdir(), 'ekran-donusum-'));
    mkdirSync(join(klasor, 'yuklenecek'));
    uygulama = new AkisUygulamasi();
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_YUKLEME_KLASORU: join(klasor, 'yuklenecek') });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Dönüşüm Projesi' })).proje as Nesne).id);
    ortamA = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
    ortamB = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Diğer', tabanUrl: fikstur.adres })).ortam as Nesne).id);
    const tur = String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: HAVUZLAR.ozel, alanlar: ['kimlikNo', 'dogumTarihi', 'cepTelefonu'].map((ad) => ({ ad, hassas: true })) })).id);
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: tur, ad: 'k1', degerler: { kimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' } });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: akisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamA] });
    const ek = akisPaketi({ anahtar: 'basvuru-ek', ad: 'Başvuru (ek)' });
    ek.model = ekModel();
    ek.model.id = 'basvuru-ek';
    ek.model.ad = 'Başvuru (ek)';
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ek, senaryoIndeksleri: [], ortamIdleri: [ortamA] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamA}`) as { ekranlar: Nesne[] };
    ekran1 = String(liste.ekranlar.find((e) => e.ad === 'Başvuru (akış)')?.id);
    ekran2 = String(liste.ekranlar.find((e) => e.ad === 'Başvuru (ek)')?.id);
    // Senaryolar bağlardan ÖNCE (düz değerler): bağlanınca seçim alanlarının seçenekleri tablodan gelir.
    senaryo.S1 = await kaydet(ekran1, 'Plan iki', { plan: '2', gizliTur: '10' });
    senaryo.S2 = await kaydet(ekran1, 'Plan üç', { urun: 'Ürün B', plan: '3', gizliTur: '20' });
    senaryo.S3 = await kaydet(ekran1, 'Kurumsal', { kategori: 'K2', urun: 'Ürün C' });
    senaryo.S4 = await kaydet(ekran2, 'Ek bilgiler', { bilgilendirme: true, uyeKodu: GIZLI }, [ortamA]);
    const tabloKaydet = async (ad: string, sutunlar: Nesne[], satirlar: Nesne[]) => {
      tablo[ad] = String(((await basarili('/platform/tablo/kaydet', { projeId, ad, sutunlar, satirlar })).tablo as Nesne).id);
    };
    await tabloKaydet('Plan tablosu', [{ ad: 'Plan', karsiliklar: { 'Plan bir': { sayfa: '1' }, 'Plan iki': { sayfa: '2' } } }, { ad: 'Kategori' }, { ad: 'Parola', gizli: true }], [
      { ad: 'Birinci', degerler: { Plan: 'Plan bir', Kategori: 'K1', Parola: 'gizli-parola-1' } },
      { ad: 'İkinci', degerler: { Plan: 'Plan iki', Kategori: 'K1', Parola: GIZLI } }
    ]);
    // Diğer ortamın satırı önde: o ortamda ilk satır "20".
    await tabloKaydet('Tür tablosu', [{ ad: 'Tür' }], [{ ortamId: ortamB, degerler: { Tür: '20' } }, { degerler: { Tür: '10' } }]);
    await tabloKaydet('Onay tablosu', [{ ad: 'Bilgi' }], [{ degerler: { Bilgi: 'Evet' } }]);
    await tabloKaydet('Belirsiz', [{ ad: 'Bilgi' }], [{ degerler: { Bilgi: 'belki' } }]);
    await tabloKaydet('Dosyalar', [{ ad: 'Dosya' }, { ad: 'Gizli yol', gizli: true }], [{ degerler: { Dosya: 'olmayan-liste.xlsx', 'Gizli yol': 'x.xlsx' } }]);
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId: ekran1, baglar: {
      plan: { tablo: tablo['Plan tablosu'], sutun: 'Plan' }, kategori: { tablo: tablo['Plan tablosu'], sutun: 'Kategori' },
      gizliTur: { tablo: tablo['Tür tablosu'], sutun: 'Tür' }, listeDosyasi: { tablo: tablo.Dosyalar, sutun: 'Dosya' }
    } });
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId: ekran2, baglar: {
      bilgilendirme: { tablo: tablo['Onay tablosu'], sutun: 'Bilgi' }, uyeKodu: { tablo: tablo['Plan tablosu'], sutun: 'Parola' }
    } });
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('plan: çevrilecek / atlanan nedenleri, satır seçimi, gizli maskeleme; onaysız hiçbir şey yazılmaz', async () => {
    const onceki = await Promise.all(Object.values(senaryo).map(async (id) => [JSON.stringify(await detay(id)), await gecmisSayisi(id)]));
    const ham = await api('/platform/ekran/senaryolar/tablo-donusumu', { projeId });
    expect(JSON.stringify(ham)).not.toContain(GIZLI);
    const p = ham.onizleme as Nesne;
    // S1: plan "2" = "Plan iki"nin sayfa karşılığı → çevrilir; ilk satır "Plan bir" olduğu için satır seçimi yazılır.
    expect(satiri(p, 'S1', 'plan')).toMatchObject({ durum: 'cevrilecek', eskiDeger: '2', yeniDeger: '${Plan tablosu.Plan}' });
    expect(satiri(p, 'S1', 'plan').satirSecimi).toBe('Plan tablosu: Plan = Plan iki, Kategori = K1');
    expect(satiri(p, 'S1', 'kategori')).toMatchObject({ durum: 'cevrilecek', yeniDeger: '${Plan tablosu.Kategori}' });
    // Tür "10": Diğer ortamda ilk satır "20" → satır seçimiyle her iki ortamda "10".
    expect(satiri(p, 'S1', 'gizliTur')).toMatchObject({ durum: 'cevrilecek', satirSecimi: 'Tür tablosu: Tür = 10', ortamlar: ['Deneme', 'Diğer'] });
    // S2: "3" tabloda yok; kategori "3" ile aynı satırda olamaz; Tür "20" yalnız Diğer ortamın satırında → ortama göre değişir.
    expect(satiri(p, 'S2', 'plan')).toMatchObject({ durum: 'atlandi', neden: NEDENLER.tablodaYok });
    expect(satiri(p, 'S2', 'kategori')).toMatchObject({ durum: 'atlandi', neden: NEDENLER.ayniSatir });
    expect(satiri(p, 'S2', 'gizliTur')).toMatchObject({ durum: 'atlandi', neden: NEDENLER.ortamaGore });
    expect(satiri(p, 'S3', 'kategori')).toMatchObject({ durum: 'atlandi', neden: NEDENLER.tablodaYok, eskiDeger: 'K2' });
    // Gizli sütun: değer gösterilmez; satır açık sütunlarla seçilir. Onay kutusu "Evet" → işaretli.
    expect(satiri(p, 'S4', 'uyeKodu')).toMatchObject({ durum: 'cevrilecek', gizli: true, eskiDeger: '•••', yeniDeger: '${Plan tablosu.Parola}', satirSecimi: 'Plan tablosu: Plan = Plan iki, Kategori = K1' });
    expect(satiri(p, 'S4', 'bilgilendirme')).toMatchObject({ durum: 'cevrilecek', eskiDeger: 'işaretli', yeniDeger: '${Onay tablosu.Bilgi}' });
    expect(p.ozet).toMatchObject({ cevrilecek: 5, atlanan: 4, senaryo: 4 });
    // Ekran filtresi.
    expect(new Set(((await plan(ekran2)).satirlar as Nesne[]).map((x) => x.ekranId))).toEqual(new Set([ekran2]));
    // Onaysız: hiçbir senaryo ve geçmiş değişmedi.
    const sonraki = await Promise.all(Object.values(senaryo).map(async (id) => [JSON.stringify(await detay(id)), await gecmisSayisi(id)]));
    expect(sonraki).toEqual(onceki);
    // Onay var ama seçim yok → hata, yazım yok.
    const bos = await api('/platform/ekran/senaryolar/tablo-donusumu', { projeId, onay: true, secimler: [] });
    expect(bos.basarili).toBe(false);
    expect(String(bos.mesaj)).toContain('En az bir alan seçin');
  });

  test('arayüz: plan tablosu, onay penceresi (masaüstü + 390px taşma yok); yalnız işaretliler yazılır', async () => {
    test.setTimeout(120_000);
    const tarayici = await korumaliTarayici();
    try {
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekran1)}/veri`);
      await page.getByRole('button', { name: 'Değerleri tabloya bağla…' }).click();
      const pencere = page.locator('dialog[open]');
      await expect(pencere.getByRole('heading', { name: 'Değerler tabloya bağlansın mı?' })).toBeVisible({ timeout: 15_000 });
      const tabloEl = pencere.getByRole('table', { name: 'Dönüşüm planı' });
      await expect(tabloEl.locator('tbody tr')).toHaveCount(7);
      await expect(tabloEl.locator('tr.atlandi')).toHaveCount(4);
      await expect(pencere.getByText('3 alan seçili')).toBeVisible();
      await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
      await page.screenshot({ path: test.info().outputPath('donusum-plani.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(tabloEl).toBeVisible();
      expect(await pencere.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
      await tasmaYok(page);
      await page.screenshot({ path: test.info().outputPath('donusum-plani-telefon.png') });
      await page.setViewportSize({ width: 1400, height: 1000 });
      // S1'in kategorisi işaretten çıkarılır: düz kalır.
      await pencere.getByRole('checkbox', { name: 'Plan iki · Kategori: çevir' }).uncheck();
      await expect(pencere.getByText('2 alan seçili')).toBeVisible();
      await pencere.getByRole('button', { name: 'Tabloya bağla' }).click();
      await expect(page.getByText('1 senaryoda 2 alan tabloya bağlandı.')).toBeVisible({ timeout: 15_000 });
      expect(hatalar).toEqual([]);
      await baglam.close();
    } finally {
      await tarayici.close();
    }
    const s1 = await detay(senaryo.S1);
    expect(s1.veri).toMatchObject({ plan: '${Plan tablosu.Plan}', gizliTur: '${Tür tablosu.Tür}', kategori: 'K1' });
    expect((await detay(senaryo.S1, ortamB)).veri).toMatchObject({ plan: '${Plan tablosu.Plan}', gizliTur: '${Tür tablosu.Tür}' });
    expect(s1.tabloSecimleri).toEqual({ [`${tablo['Plan tablosu']}|`]: { Plan: 'Plan iki', Kategori: 'K1' }, [`${tablo['Tür tablosu']}|`]: { Tür: '10' } });
    expect(await gecmisSayisi(senaryo.S1)).toBe(2);
    // Diğer senaryolar değişmedi.
    expect((await detay(senaryo.S2)).veri).toMatchObject({ plan: '3', gizliTur: '20' });
    expect((await detay(senaryo.S4)).veri).toMatchObject({ bilgilendirme: true });
  });

  test('dönüşümden sonra koşuda ekrana giden değer aynı (iki ortamda)', async () => {
    test.setTimeout(240_000);
    for (const o of [ortamA, ortamB]) {
      const d = await kos(senaryo.S1, o);
      expect(d.durum, JSON.stringify(d.hataMesaji)).toBe('basarili');
      expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ kategori: 'K1', urun: 'U11', plan: '2', gizliTur: '10' });
    }
  });

  test('onaylı API yalnız seçilen alanları yazar; gizli değer yanıtta yok', async () => {
    const y = await basarili('/platform/ekran/senaryolar/tablo-donusumu', { projeId, ekranId: ekran2, onay: true, secimler: [{ senaryoId: senaryo.S4, alan: 'bilgilendirme' }] });
    expect(JSON.stringify(y)).not.toContain(GIZLI);
    expect(y).toMatchObject({ uygulandi: true, guncellenenSenaryo: 1, cevrilenAlan: 1 });
    expect(satiri(y, 'S4', 'uyeKodu').durum).toBe('secilmedi');
    const s4 = await detay(senaryo.S4);
    expect(s4.veri).toMatchObject({ bilgilendirme: '${Onay tablosu.Bilgi}', uyeKodu: GIZLI });
    expect(s4.tabloSecimleri).toBeNull();
    // Aynı alan tekrar planda görünmez (artık tablodan).
    expect(satiri(await plan(ekran2), 'S4', 'bilgilendirme')).toBeUndefined();
  });

  test('tablodan onay kutusu / dosya çözülemezse koşu tarayıcı açılmadan anlaşılır hatayla durur; dosya gizli sütundan alınamaz', async () => {
    test.setTimeout(120_000);
    const once = uygulama.hesaplamalar.length;
    const onay = await kaydet(ekran2, 'Belirsiz onay', { bilgilendirme: '${Belirsiz.Bilgi}' }, [ortamA]);
    const d1 = await kos(onay);
    expect(d1.durum).toBe('basarisiz');
    expect(String(d1.hataMesaji)).toContain('evet / hayır olarak anlaşılamadı');
    expect(String(d1.hataMesaji)).toContain('Tarayıcı açılmadı');
    const dosya = await kaydet(ekran1, 'Tablodan liste', { sorguTipi: 'coklu', listeDosyasi: '${Dosyalar.Dosya}' }, [ortamA]);
    const d2 = await kos(dosya);
    expect(d2.durum).toBe('basarisiz');
    expect(String(d2.hataMesaji)).toContain('"olmayan-liste.xlsx" dosyası izinli klasörde yok');
    expect(String(d2.hataMesaji)).toContain('Tarayıcı açılmadı');
    expect(uygulama.hesaplamalar.length).toBe(once);
    const gizli = await api('/platform/senaryo/kaydet', { projeId, ekranId: ekran1, baslik: 'Gizli yol', ortamIdleri: [ortamA],
      veri: { baslik: 'Gizli yol', kategori: 'K1', urun: 'Ürün A', sorguTipi: 'coklu', listeDosyasi: '${Dosyalar.Gizli yol}' } });
    expect(gizli.basarili).toBe(false);
    expect((gizli.hatalar as Nesne[]).map((h) => h.mesaj)).toEqual([MESAJLAR.gizliSutunDosyada('Liste dosyası', 'Gizli yol')]);
    // Satır seçiminde gizli sütun reddedilir.
    const secim = await api('/platform/senaryo/kaydet', { projeId, id: senaryo.S1, baslik: 'Plan iki', tabloSecimleri: { [`${tablo['Plan tablosu']}|`]: { Parola: 'x' } } });
    expect(secim.basarili).toBe(false);
    expect(String(secim.mesaj)).toContain('gizli "Parola" sütunu satır seçiminde kullanılamaz');
  });

  test('senaryo formu: satır seçimi (ortam etiketiyle) kaydedilir ve koşuda o satır kullanılır; telefonda taşma yok', async () => {
    test.setTimeout(180_000);
    const tarayici = await korumaliTarayici();
    try {
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/senaryolar/yeni/${ekran1}`);
      const planSecimi = page.locator('[data-alan="plan"] select');
      await expect(planSecimi).toBeVisible({ timeout: 15_000 });
      await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Formdan satır seçimi');
      await page.locator('[data-alan="kategori"] select').selectOption('K1');
      await page.locator('[data-alan="urun"] select').selectOption('Ürün A');
      await planSecimi.selectOption('${Plan tablosu.Plan}');
      await page.locator('[data-alan="gizliTur"] select').selectOption('${Tür tablosu.Tür}');
      const kart = page.locator('.satir-secimi-karti');
      await expect(kart.getByRole('heading', { name: 'Satır seçimi' })).toBeVisible();
      const planGrubu = kart.locator('.satir-secimi-grubu[data-tablo="Plan tablosu"]');
      await expect(planGrubu.getByRole('status')).toHaveText('Koşuda bağlı alanların değerleri ve ortamla uyan ilk satır kullanılır.');
      // Ortama özel satır ortam adıyla.
      await expect(kart.locator('.satir-secimi-grubu[data-tablo="Tür tablosu"] option', { hasText: '[Diğer]' })).toHaveCount(1);
      await planGrubu.getByLabel('Plan tablosu satırı').selectOption({ label: 'İkinci — Plan iki · K1' });
      await expect(planGrubu.getByRole('status')).toHaveText('✓ Deneme ortamında tek satır uyuyor.');
      await page.locator('.satir-secimi-grubu[data-tablo="Tür tablosu"]').getByLabel('Tür tablosu satırı').selectOption({ label: 'Satır 2 — 10' });
      await kart.scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath('satir-secimi.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await kart.evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await expect(kart).toBeVisible();
      await tasmaYok(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: test.info().outputPath('satir-secimi-telefon.png') });
      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
      await expect.poll(async () => ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamA}`)).senaryolar as Nesne[]).some((x) => x.baslik === 'Formdan satır seçimi'), { timeout: 15_000 }).toBe(true);
      expect(hatalar).toEqual([]);
      await baglam.close();
    } finally {
      await tarayici.close();
    }
    const satir = ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamA}`)).senaryolar as Nesne[]).find((x) => x.baslik === 'Formdan satır seçimi') as Nesne;
    const d = await detay(String(satir.id));
    expect(d.veri).toMatchObject({ plan: '${Plan tablosu.Plan}', gizliTur: '${Tür tablosu.Tür}' });
    expect(d.tabloSecimleri).toEqual({ [`${tablo['Plan tablosu']}|`]: { Plan: 'Plan iki', Kategori: 'K1' }, [`${tablo['Tür tablosu']}|`]: { Tür: '10' } });
    const k = await kos(String(satir.id));
    expect(k.durum, JSON.stringify(k.hataMesaji)).toBe('basarili');
    // Otomatikte ilk satır ("Plan bir" → 1) olurdu; seçilen satır "Plan iki" → sayfa değeri 2.
    expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ plan: '2', gizliTur: '10' });
  });
});
