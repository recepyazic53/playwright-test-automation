// MODEL KOŞUCUSU — GENEL ÖZELLİKLER (nötr). Eski ürüne özgü akış testlerinde sınanan genel motor davranışlarının nötr
// karşılığı: koşu planı (varsayılanlar, koşullar, göreli tarih, hazır kimlik profili), tekrar analizde bağımlı liste, akış
// düzenleyici gidiş-dönüşü, toleranslı mesaj eşleşmesi; gerçek tarayıcıyla koşucu davranışları (bağımlı liste, sorgu
// beklemesi, sorgudan sonra yeniden doldurma, VEYA başarı + kabul edilen uyarılar, tarayıcı uyarısı, hata penceresi);
// ortak akış, Dene, modeli değiştir ve ortak akış düzenleme. Uygulama 127.0.0.1'de sahte "Başvuru (akış)" ekranıdır
// (model-kosucu-ozellikleri-fikstur.ts); ayrı Nöbetçi örneği geçici veritabanıyla çalışır. Dış siteye istek gitmez.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { goreliTarih, modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { modelFarki } from '../../scripts/platform/ekranlar/model-farki.mjs';
import { adimlardanBloklar, akisDuzenlenebilirMi, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { mesajIceriyorMu } from '../support/beklenen-sonuc';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import {
  AKIS_YOLU, AkisUygulamasi, HAVUZLAR, HESAPLAMA_UYARILARI, KIMLIK_UYARISI, ONAY_AKIS_ANAHTARI, ONAY_RED, PLAN_UYARISI, akisModeli, akisPaketi, onayAkisPaketi
} from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Serbest = Record<string, any>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Ozellik-${randomBytes(6).toString('hex')}`;
const K1 = { kimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' };
const KURUM1 = { vergiNo: '1234567890', cepTelefonu: '5324445566' };
const YENI_KISI = { kimlikNo: '20000000046', dogumTarihi: '03.04.1985', cepTelefonu: '5327778899' };
const ONAY_DOSYASI = `${ONAY_AKIS_ANAHTARI}.model.json`;

let nobetci: Nobetci;
let uygulama: AkisUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
let ekranId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
async function ekranBul(ad: string): Promise<string> {
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  return String((liste.ekranlar.find((e) => e.ad === ad) as Nesne).id);
}
/** Senaryoyu formdan kaydeder ve koşar; sonucun ayrıntısını döndürür. */
async function kaydetVeKos(baslik: string, veri: Nesne, s: { ekran?: string; akisId?: string; ortam?: string } = {}): Promise<Nesne> {
  const ortam = s.ortam ?? ortamId;
  const yeni = await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId: s.ekran ?? ekranId, ...(s.akisId ? { akisId: s.akisId } : {}), baslik, ortamIdleri: [ortam], veri: { baslik, ...veri }
  });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId: ortam, canliOnay: true });
  expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
  return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
}
const alanlarHaritasi = (m: Serbest): Record<string, Serbest> => Object.fromEntries((m.adimlar as Serbest[]).flatMap((a) =>
  ((a.bolumler ?? []) as Serbest[]).flatMap((b) => (b.alanlar as Serbest[]).map((x) => [x.id, x]))));

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'model-ozellik-'));
  uygulama = new AkisUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Özellik Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  // Kimlik profilleri: havuz adıyla aynı adlı test verisi türleri.
  const tur = async (ad: string, alanlar: string[]): Promise<string> =>
    String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad, alanlar: alanlar.map((a) => ({ ad: a, hassas: true })) })).id);
  const ozel = await tur(HAVUZLAR.ozel, ['kimlikNo', 'dogumTarihi', 'cepTelefonu']);
  const tuzel = await tur(HAVUZLAR.tuzel, ['vergiNo', 'cepTelefonu']);
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: ozel, ad: 'k1', degerler: K1 });
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: tuzel, ad: 'kurum1', degerler: KURUM1 });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: akisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  ekranId = await ekranBul('Başvuru (akış)');
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket doğrulamadan geçer; akış diyagramda düzenlenebilir', async () => {
  expect(sayfaPaketiniDogrula(akisPaketi(), {})).toMatchObject({ gecerli: true, hatalar: [] });
  expect(sayfaPaketiniDogrula(onayAkisPaketi(), {})).toMatchObject({ gecerli: true, hatalar: [] });
  expect(await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).toMatchObject({ duzenlenebilir: true });
});

test('plan: boşlar varsayılanla dolar, koşullar varsayılanla hesaplanır; göreli tarihler; hazır kimlik profili; dosyanın varsayılanı plana girmez', () => {
  const model = akisModeli();
  const kimlikProfilleri = { [HAVUZLAR.ozel]: { k1: K1 }, [HAVUZLAR.tuzel]: { kurum1: KURUM1 } };
  const simdi = new Date('2026-12-30T22:30:00Z'); // İstanbul'da 31.12.2026
  const degerler = (veri: Nesne): Record<string, unknown> => {
    const plan = modelKosuPlani(model, { baslik: 'x', ...veri }, { kimlikProfilleri, simdi });
    expect(plan.hatalar).toEqual([]);
    return Object.fromEntries(plan.adimlar.filter((a) => a.dahil).flatMap((a) => a.alanlar.map((x) => [x.id, x.deger])));
  };
  // Tekli (varsayılan) + varsayılan kimlik profili (k1, özel): telefon sorgudan sonra yeniden yazılır.
  expect(degerler({ kategori: 'K1', urun: 'Ürün B' })).toEqual({
    kategori: 'K1', urun: 'Ürün B', baslangic: '31.12.2026', bitis: '07.01.2027', plan: '1', sorguTipi: 'tekli', musteriTipi: 'ozel',
    basvuranTelefon: K1.cepTelefonu, basvuranDogum: K1.dogumTarihi, basvuranKimlikNo: K1.kimlikNo, basvuranTelefonTekrar: K1.cepTelefonu
  });
  // Tüzel profil: türde karşılığı olmayan doğum tarihi atlanır; kimlik no → vergi no.
  const tuzel = degerler({ kategori: 'K2', urun: 'Ürün C', musteriTipi: 'tuzel', basvuranProfili: 'kurum1', plan: '2' });
  expect(tuzel).toMatchObject({ plan: '2', musteriTipi: 'tuzel', basvuranKimlikNo: KURUM1.vergiNo, basvuranTelefon: KURUM1.cepTelefonu });
  expect(tuzel).not.toHaveProperty('basvuranDogum');
  // Senaryoya özel yeni kimlik profili ezer.
  expect(degerler({ kategori: 'K1', urun: 'Ürün A', basvuranOzelKimligi: YENI_KISI })).toMatchObject({ basvuranKimlikNo: YENI_KISI.kimlikNo, basvuranDogum: YENI_KISI.dogumTarihi });
  // Çoklu: başvuran adımı koşulla kapsam dışı; dosya alanı görünür ama varsayılanı plana girmez (Ayarlar > Dosyalar'dan gelir).
  const coklu = degerler({ kategori: 'K1', urun: 'Ürün A', sorguTipi: 'coklu' });
  expect(coklu).toMatchObject({ sorguTipi: 'coklu' });
  expect(coklu).not.toHaveProperty('listeDosyasi');
  expect(coklu).not.toHaveProperty('basvuranKimlikNo');
  // Olmayan profil: alan açık nedenle atlanır.
  const eksik = modelKosuPlani(model, { baslik: 'x', kategori: 'K1', urun: 'Ürün A', basvuranProfili: 'yok' }, { kimlikProfilleri, simdi });
  expect(eksik.adimlar[1].alanlar[1]).toMatchObject({ id: 'basvuranKimlik', atla: expect.stringContaining('"yok" kimlik kaydı bulunamadı') });
  // Göreli tarih: biçim ve geri gün.
  expect(goreliTarih('bugun-3', 'yyyy-aa-gg', simdi)).toBe('2026-12-28');
  expect(goreliTarih('yarın', 'gg.aa.yyyy', simdi)).toBeNull();
});

test('tekrar analiz: düz liste bağımlı listeye (kategoriye göre) dönünce seçenekler "kaldırıldı" ya da "yeni" sayılmaz', () => {
  const yeni = akisModeli() as Serbest;
  const eski = JSON.parse(JSON.stringify(yeni)) as Serbest;
  const urun = alanlarHaritasi(eski).urun;
  delete urun.bagimlilik;
  urun.secenekler = ['Ürün A', 'Ürün B', 'Ürün C', 'Ürün D'].map((d) => ({ deger: d, metin: d }));
  const bulgular = modelFarki(eski, yeni) as unknown as Serbest[];
  expect(bulgular.filter((b) => b.tur === 'kaldirilanSecenek')).toEqual([]);
  expect(bulgular.some((b) => b.tur === 'yeniSecenek' && b.alanId === 'urun')).toBe(false);
  // Gerçekten kaldırılan seçenek (eski düz listede fazladan "Ürün E") kaldırıldı sayılır.
  urun.secenekler.push({ deger: 'Ürün E', metin: 'Ürün E' });
  expect((modelFarki(eski, yeni) as unknown as Serbest[]).some((b) => b.tur === 'kaldirilanSecenek' && b.alanId === 'urun')).toBe(true);
});

test('akış düzenleyici: sabit (göreli tarihli) alanlar, kimlik bloğu, kalıp göstergesi, uyarılar ve bekleme süresi diyagramdan geçip aynen geri gelir', () => {
  const model = akisModeli() as Serbest;
  expect(akisDuzenlenebilirMi(model)).toEqual({ duzenlenebilir: true, neden: null });
  const env = modeldenAkisEnvanteri(model);
  const bloklar = adimlardanBloklar(model, model.adimlar, env) as Serbest[];
  expect(bloklar.find((b) => b.tur === 'alanlar' && b.ad === 'Başvuran bilgileri girilir')).toMatchObject({ alanlar: ['musteriTipi', 'kimlik:basvuranKimlik'] });
  expect(bloklar.filter((b) => b.tur !== 'alanlar')).toEqual([
    { tur: 'aksiyon', dugme: 0, istegeBagli: false, zamanAsimiSn: 20 },
    { tur: 'mesaj', mesaj: expect.any(Number), metin: '[1-9]', desen: true },
    ...HESAPLAMA_UYARILARI.map((u) => ({ tur: 'mesaj', mesaj: expect.any(Number), metin: u.metin, uyari: true })),
    { tur: 'bitir' }
  ]);
  const ayik = bloklariAyikla(bloklar as Parameters<typeof bloklariAyikla>[0]);
  const c = akistanKayitEnvanteri(env, ayik.bloklar);
  expect([...ayik.hatalar, ...c.hatalar]).toEqual([]);
  const { paket } = kayitPaketiOlustur({
    ekranAnahtari: 'basvuru-akis', ekranAdi: 'Başvuru (akış)', urlYolu: AKIS_YOLU, girisGerekli: false, girissiz: true, ikiAsamali: 'bilinmiyor', baglamTuru: null, mevcutModel: model
  }, c.envanter as NonNullable<typeof c.envanter>);
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const yeni = paket.model as Serbest;
  const eski = alanlarHaritasi(model);
  const sonra = alanlarHaritasi(yeni);
  expect(Object.keys(sonra).sort()).toEqual(Object.keys(eski).sort());
  // Adım düzeyindeki koşul (başvuran adımı yalnızca tekli sorguda) alanlarına taşınır; diğer her şey aynen.
  const adimKosullu = ['musteriTipi', 'basvuranKimlik'];
  for (const id of adimKosullu) expect(sonra[id], id).toEqual({ ...eski[id], gorunurluk: { kosul: 'tekliSorgu' } });
  for (const id of Object.keys(eski).filter((x) => !adimKosullu.includes(x))) expect(sonra[id], id).toEqual(eski[id]);
  expect((yeni.adimlar as Serbest[]).map((a) => a.id)).toEqual((model.adimlar as Serbest[]).map((a) => a.id));
  expect((yeni.adimlar as Serbest[]).map((a) => a.kosu ?? null)).toEqual((model.adimlar as Serbest[]).map((a) => a.kosu ?? null));
  expect(Object.keys(yeni.kosullar).sort()).toEqual(Object.keys(model.kosullar).sort());
});

test('mesaj eşleşmesi: büyük harfli Latin sözcük küçük yazılınca da eşleşir; Türkçe harfler korunur', () => {
  expect(mesajIceriyorMu('PDF belgesi olmadan yalnızca ÖN BAŞVURU', 'pdf belgesi olmadan yalnızca ön başvuru')).toBe(true);
  expect(mesajIceriyorMu('İŞ KURALI: BAŞVURAN', 'iş kuralı: başvuran')).toBe(true);
  expect(mesajIceriyorMu('Seçilen “plan” kullanılamaz', 'seçilen "plan" kullanılamaz')).toBe(true);
  expect(mesajIceriyorMu('Ödeme alınamadı', 'odeme')).toBe(false);
});

test('özel / varsayılan profil: bağımlı liste dolunca metinle seçilir, gizli liste değerle; bugün / bugün+7; varsayılan plan; sorgu beklenir, telefon yeniden yazılır', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Özel / varsayılanlar', { kategori: 'K1', urun: 'Ürün B', gizliTur: '20' });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toEqual({
    kategori: 'K1', urun: 'U12', gizliTur: '20', baslangic: goreliTarih('bugun'), bitis: goreliTarih('bugun+7'), plan: '1', sorguTipi: '1',
    tip: 'O', dogum: K1.dogumTarihi, tel: K1.cepTelefonu, kimlikNo: K1.kimlikNo, ad: 'KİŞİ 146'
  });
});

test('tüzel profil: doğum tarihi atlanır (koşullu), vergi no sorgulanır ve ad gelene kadar beklenir; gizli liste metinle', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Tüzel / kurum1', { kategori: 'K2', urun: 'Ürün D', gizliTur: 'Standart', plan: '2', musteriTipi: 'tuzel', basvuranProfili: 'kurum1' });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    kategori: 'K2', urun: 'U22', gizliTur: '10', plan: '2', tip: 'T', dogum: null, tel: KURUM1.cepTelefonu, kimlikNo: KURUM1.vergiNo, ad: 'KURUM 890'
  });
  expect(uygulama.sorgular.at(-1)).toBe(KURUM1.vergiNo);
});

test('iş kuralı: hata penceresindeki beklenen uyarı okunur (senaryo başarılı); başarı beklenirken çıkarsa zaman aşımını beklemeden düşer', async () => {
  test.setTimeout(120_000);
  const beklenen = await kaydetVeKos('Plan 3 → iş kuralı', {
    kategori: 'K1', urun: 'Ürün A', plan: '3', beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'hesaplama', mesaj: 'seçilen plan bu ürün için kullanılamaz' }
  });
  expect(beklenen.durum, JSON.stringify(beklenen.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ plan: '3' });
  const bas = Date.now();
  const dusen = await kaydetVeKos('Plan 3 / başarı beklenir', { kategori: 'K1', urun: 'Ürün A', plan: '3' });
  expect(dusen.durum).toBe('basarisiz');
  expect(String(dusen.hataMesaji)).toContain(PLAN_UYARISI);
  expect(String(dusen.hataMesaji)).not.toContain('başarı göstergesi görünmedi');
  expect(Date.now() - bas).toBeLessThan(20_000);
});

test('tarayıcı uyarısı (alert): akıştaki kabul edilen uyarı beklenirse başarılı; başarı beklenirken çıkarsa hemen düşer', async () => {
  test.setTimeout(120_000);
  // Senaryoya özel kimlikte kimlik no yok → Hesapla'da tarayıcı uyarısı.
  const kimliksiz = { basvuranOzelKimligi: { dogumTarihi: K1.dogumTarihi, cepTelefonu: K1.cepTelefonu } };
  const hesapOnce = uygulama.hesaplamalar.length;
  const beklenen = await kaydetVeKos('Uyarı / kimlik yok (beklenen)', {
    kategori: 'K1', urun: 'Ürün A', ...kimliksiz, beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'hesaplama', mesaj: KIMLIK_UYARISI }
  });
  expect(beklenen.durum, JSON.stringify(beklenen.hataMesaji)).toBe('basarili');
  const bas = Date.now();
  const dusen = await kaydetVeKos('Uyarı / kimlik yok (başarı beklenir)', { kategori: 'K1', urun: 'Ürün A', ...kimliksiz });
  expect(dusen.durum).toBe('basarisiz');
  expect(String(dusen.hataMesaji)).toContain(KIMLIK_UYARISI);
  expect(Date.now() - bas).toBeLessThan(20_000);
  expect(uygulama.hesaplamalar.length).toBe(hesapOnce);
});

test('VEYA başarı + kabul edilen uyarılar: görülen seçenek raporda; başarı beklenirken uyarı çıkarsa hemen düşer; uyarı beklenirken seçilenlerden biri yeter', async () => {
  test.setTimeout(180_000);
  // Aynı modelden ikinci ekran: hesaplamada "olmayan mesaj VEYA sıfırdan farklı tutar".
  const paket = akisPaketi({ anahtar: 'basvuru-veya', ad: 'Başvuru (veya)' });
  const kosu = ((paket.model as Serbest).adimlar as Serbest[]).at(-1)?.kosu as Serbest;
  kosu.basariGostergesi = { tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Hiç görünmeyen onay mesajı' }, { tur: 'desen', deger: '[1-9]', secici: '#tutar' }] };
  kosu.uyarilar = [{ metin: 'Hiç görünmeyen başka uyarı' }, { metin: PLAN_UYARISI, secici: '#pencere' }];
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const ekran = await ekranBul('Başvuru (veya)');
  const sonuc = await kaydetVeKos('Veya / tutar', { kategori: 'K1', urun: 'Ürün A' }, { ekran });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(JSON.stringify(sonuc)).toContain('Tutar hesaplanır (görülen: #tutar metni /[1-9]/ kalıbına uyar)');
  const bas = Date.now();
  const dusen = await kaydetVeKos('Veya / başarı beklenir, uyarı çıkar', { kategori: 'K1', urun: 'Ürün A', plan: '3' }, { ekran });
  expect(dusen.durum).toBe('basarisiz');
  expect(String(dusen.hataMesaji)).toContain(PLAN_UYARISI);
  expect(Date.now() - bas).toBeLessThan(20_000);
  const uyarili = await kaydetVeKos('Veya / uyarılardan biri', {
    kategori: 'K1', urun: 'Ürün A', plan: '3',
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'hesaplama', mesaj: 'Hiç görünmeyen başka uyarı', mesajlar: ['Hiç görünmeyen başka uyarı', PLAN_UYARISI] }
  }, { ekran });
  expect(uyarili.durum, JSON.stringify(uyarili.hataMesaji)).toBe('basarili');
  expect(((uyarili.medya ?? []) as Nesne[]).map((x) => x.ad)).toContain(`04 - Tutar hesaplanır (görülen: uyarı "${PLAN_UYARISI}")`);
});

test('ortak akış: "+ > Ortak akış" bloğuyla akışa eklenir; "dahil" senaryoda profilden onaylanır, dahil değilse onay yok; canlıda atlanır; ret penceresi hızlı düşer', async () => {
  test.setTimeout(240_000);
  const onayTuru = String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: HAVUZLAR.onay, alanlar: [{ ad: 'kod', hassas: true }] })).id);
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: onayTuru, ad: 'ortak', degerler: { kod: '4321' } });
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: onayTuru, ad: 'red', degerler: { kod: '0000' } });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: onayAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  // Ortak akış senaryo listesinde ekran olarak görünmez.
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  expect(liste.ekranlar.some((e) => e.ad === 'Onay (ortak)')).toBe(false);

  // Diyagram: ana akışın kopyasına hesaplamadan sonra ortak akış bloğu (isteğe bağlı) eklenir.
  const tasarim = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&kopya=ana`) as Nesne & { bloklar: Nesne[]; ortakAkislar: Nesne[] };
  expect(tasarim.basarili, String(tasarim.mesaj ?? '')).toBe(true);
  expect(tasarim.ortakAkislar).toEqual([{ dosya: ONAY_DOSYASI, ad: 'Onay (ortak)', adimlar: ['Onay formu açılır', 'Onay kodu girilir, onaylanır'], yalnizTest: true }]);
  const bloklar = [...tasarim.bloklar.slice(0, -1), { tur: 'ortak', dosya: ONAY_DOSYASI, ad: 'Onay', istegeBagli: true }, { tur: 'bitir' }];
  const akisId = String((await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId, ad: 'Onaylı akış', bloklar, onay: true })).akisId);
  const geri = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&akisId=${akisId}`) as Nesne & { bloklar: Nesne[] };
  expect(geri.bloklar.at(-2)).toEqual({ tur: 'ortak', dosya: ONAY_DOSYASI, ad: 'Onay', istegeBagli: true });
  // Senaryo formu: "“Onay” dahil" ayarı ve ortak akışın adımları akışın modelinde.
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}&akisId=${akisId}`) as Nesne & { model: Serbest };
  const dahil = (form.model.senaryoDuzeyi.alanlar as Nesne[]).find((a) => (a.etiket as Nesne)?.form === '“Onay” dahil') as Nesne;
  expect(dahil).toBeTruthy();
  expect((form.model.adimlar as Nesne[]).map((a) => a.id).slice(-2)).toEqual(['onay_onayAc', 'onay_onayla']);

  const veri = { kategori: 'K1', urun: 'Ürün A' };
  const onayli = await kaydetVeKos('Onaylı / varsayılan kod', { ...veri, [String(dahil.id)]: true }, { akisId });
  expect(onayli.durum, JSON.stringify(onayli.hataMesaji)).toBe('basarili');
  expect((onayli.adimlar as Nesne[]).map((a) => a.ad)).toEqual(expect.arrayContaining(['Onay formu açılır', 'Onay kodu girilir, onaylanır']));
  expect(uygulama.onaylar).toEqual([{ kod: '4321' }]);

  const onaysiz = await kaydetVeKos('Onaysız', veri, { akisId });
  expect(onaysiz.durum, JSON.stringify(onaysiz.hataMesaji)).toBe('basarili');
  expect(uygulama.onaylar).toHaveLength(1);

  // Ret penceresi: adım zaman aşımını (60 sn) beklemeden mesajıyla düşer.
  const bas = Date.now();
  const red = await kaydetVeKos('Onay reddi', { ...veri, [String(dahil.id)]: true, onayKoduProfili: 'red' }, { akisId });
  expect(red.durum).toBe('basarisiz');
  expect(String(red.hataMesaji)).toContain(ONAY_RED);
  expect(Date.now() - bas).toBeLessThan(40_000);
  expect(uygulama.onaylar).toHaveLength(1);

  // Canlı işaretli ortam: ortak akışın "yalnızca test" adımları atlanır.
  const canliOrtam = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Canlı (deneme)', tabanUrl: fikstur.adres, canli: true })).ortam as Nesne).id);
  const canlida = await kaydetVeKos('Onaylı / canlı', { ...veri, [String(dahil.id)]: true }, { akisId, ortam: canliOrtam });
  expect(canlida.durum, JSON.stringify(canlida.hataMesaji)).toBe('basarili');
  expect((canlida.adimlar as Nesne[]).map((a) => a.ad)).toEqual(expect.arrayContaining(['Onay formu açılır (canlı ortam: atlandı)']));
  expect(uygulama.onaylar).toHaveLength(1);
});

test('Dene (model senaryosu): kaydedilmemiş taslak koşar; senaryo yazılmaz; akış seçilebilir; geçersiz taslak koşmadan reddedilir', async () => {
  test.setTimeout(180_000);
  const say = async (): Promise<number> => ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)) as { senaryolar: Nesne[] }).senaryolar.length;
  const once = await say();
  const hesapOnce = uygulama.hesaplamalar.length;
  const d = await api('/platform/senaryo/dene', {
    projeId, ekranId, ortamId, kosuId: `kosu-${randomUUID()}`, veri: { kategori: 'K2', urun: 'Ürün C', musteriTipi: 'tuzel', basvuranProfili: 'kurum1' }
  });
  expect(d.basarili, JSON.stringify(d)).toBe(true);
  expect(d.durum, JSON.stringify(d.hataMesaji)).toBe('passed');
  expect(uygulama.hesaplamalar.length).toBe(hesapOnce + 1);
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ kategori: 'K2', urun: 'U21', tip: 'T', kimlikNo: KURUM1.vergiNo });
  // Akış seçilerek: onaylı akışla ve "dahil" işaretli.
  const akislar = (await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[];
  const akisId = String((akislar.find((a) => a.ad === 'Onaylı akış') as Nesne).id);
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}&akisId=${akisId}`) as Nesne & { model: Serbest };
  const dahil = String(((form.model.senaryoDuzeyi.alanlar as Nesne[]).find((a) => (a.etiket as Nesne)?.form === '“Onay” dahil') as Nesne).id);
  const onayOnce = uygulama.onaylar.length;
  const d2 = await api('/platform/senaryo/dene', { projeId, ekranId, ortamId, akisId, kosuId: `kosu-${randomUUID()}`, veri: { kategori: 'K1', urun: 'Ürün B', [dahil]: true } });
  expect(d2.durum, JSON.stringify(d2.hataMesaji)).toBe('passed');
  expect(uygulama.onaylar.length).toBe(onayOnce + 1);
  expect(await say()).toBe(once);
  // Geçersiz taslak (zorunlu ürün yok): koşmadan doğrulama hatası.
  const hatali = await api('/platform/senaryo/dene', { projeId, ekranId, ortamId, kosuId: `kosu-${randomUUID()}`, veri: { kategori: 'K1' } });
  expect(hatali.basarili).toBe(false);
  expect(uygulama.hesaplamalar.length).toBe(hesapOnce + 2);
});

test('modeli değiştir: mevcut ekrana paket yeni sürüm olarak yazılır; senaryolar ve diğer akışlar korunur, önce etki gösterilir', async () => {
  test.setTimeout(120_000);
  const oncekiListe = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Nesne[] };
  const senaryoSayisi = oncekiListe.senaryolar.filter((s) => s.ekranId === ekranId).length;
  const oncekiAkislar = ((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[]).map((a) => a.ad);
  expect(oncekiAkislar).toEqual(['Ana akış', 'Onaylı akış']);
  // Yeni paket: gizli türün seçicisi değişmiş (tekrar analizin taşıyamadığı değişiklik).
  const paket = akisPaketi();
  const tur = alanlarHaritasi(paket.model as Serbest).gizliTur;
  tur.konum = { ...tur.konum, secici: 'select#gizliTur' };
  expect(await api('/platform/sayfa-paketi/onizle', { projeId, paket, ekranId, mod: 'yeni' })).toMatchObject({ gecerli: false });
  const onizleme = await api('/platform/sayfa-paketi/onizle', { projeId, paket, ekranId, mod: 'degistir' }) as Nesne & { etki: { senaryolar: Nesne[]; korunanAkislar: string[] } };
  expect(onizleme.gecerli, JSON.stringify(onizleme.hatalar)).toBe(true);
  // Etki tüm ortamlardaki senaryoları listeler (liste ucu tek ortamınkileri verir; canlı ortamdaki senaryo da sayılır).
  expect(onizleme.etki.senaryolar.length).toBeGreaterThan(senaryoSayisi);
  expect(onizleme.etki.korunanAkislar).toEqual(oncekiAkislar.slice(1));
  // Onaysız: yalnızca etki; model değişmez.
  const onaysiz = await basarili('/platform/ekran/model/degistir', { projeId, ekranId, paket });
  expect(onaysiz.etki).toBeTruthy();
  const formOnce = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne & { model: Serbest };
  expect(alanlarHaritasi(formOnce.model).gizliTur.konum.secici).toBe('#gizliTur');
  const r = await basarili('/platform/ekran/model/degistir', { projeId, ekranId, paket, onay: true });
  expect(r.surum).toBeGreaterThan(1);
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne & { model: Serbest };
  expect(alanlarHaritasi(form.model).gizliTur).toMatchObject({ konum: { secici: 'select#gizliTur' } });
  const sonraListe = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Nesne[] };
  expect(sonraListe.senaryolar.filter((s) => s.ekranId === ekranId)).toHaveLength(senaryoSayisi);
  expect(((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[]).map((a) => a.ad)).toEqual(oncekiAkislar);
  // Değişen modelle senaryo koşar (gizli tür yeni seçiciyle yazılır).
  const sonuc = await kaydetVeKos('Modeli değiştir sonrası', { kategori: 'K1', urun: 'Ürün A', gizliTur: '10' });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ gizliTur: '10', urun: 'U11' });
});

test('ortak akış düzenleme: diyagramdan açılıp kaydedilir (gizli ayarlar korunur), kullanan ekranlar etki olarak gösterilir; "Ekranlara ekle" varsayılan akışa ekler', async () => {
  test.setTimeout(180_000);
  const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
  const ortakId = String((ekranlar.find((e) => e.modelTuru === 'ortakAkis') as Nesne).id);
  const model = async (id: string): Promise<Serbest> => (await api(`/platform/ekran?projeId=${projeId}&id=${id}`)).model as Serbest;
  const once = await model(ortakId);
  const liste = await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ortakId}`) as Nesne & { akislar: Nesne[]; kullananlar: Nesne[] };
  expect(liste).toMatchObject({ duzenlenebilir: true, ortakAkis: true });
  expect(liste.akislar).toHaveLength(1);
  expect(liste.kullananlar).toEqual([expect.objectContaining({ id: ekranId, akislar: ['Onaylı akış'] })]);
  // Yeni akış / kopya yok; içine ortak akış eklenmez.
  expect(await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ortakId}&kopya=ana`)).toMatchObject({ basarili: false });
  const tasarim = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ortakId}&akisId=ana`) as Nesne & { bloklar: Nesne[]; ortakAkislar: Nesne[] };
  expect(tasarim.ortakAkislar).toEqual([]);
  const ortakli = [...tasarim.bloklar.slice(0, -1), { tur: 'ortak', dosya: ONAY_DOSYASI, ad: 'Onay', istegeBagli: false }, { tur: 'bitir' }];
  expect(await api('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar: ortakli })).toMatchObject({ basarili: false });
  // Değiştirmeden kaydet: önce etki (kullanan ekran), onayla adımlar aynen kalır (hata penceresi, kimlik profili, yalnızca test).
  const etki = await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar: tasarim.bloklar });
  expect((etki.etki as Nesne).ekranlar).toEqual([expect.objectContaining({ id: ekranId })]);
  await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar: tasarim.bloklar, onay: true });
  const sonra = await model(ortakId);
  expect(sonra.adimlar).toEqual(once.adimlar);
  expect(sonra).toMatchObject({ tur: 'ortakAkis', yalnizTestOrtami: true });
  expect(sonra.akislar).toBeUndefined();
  // Düzenle: onay formundan önceki bekleme 2 sn.
  const bloklar = tasarim.bloklar.map((b) => (b.tur === 'bekle' ? { ...b, saniye: 2 } : b));
  await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar, onay: true });
  expect(((await model(ortakId)).adimlar[0].kosu.aksiyonlar as Nesne[])[0]).toEqual({ tur: 'bekle', sureSn: 2 });

  // Ekranlara ekle: varsayılan akışta yok → eklenebilir; önce etki, onayla eklenir; sonra "zaten var".
  const aday = await api(`/platform/ortak-akis/ekranlar?projeId=${projeId}&ekranId=${ortakId}`) as Nesne & { ekranlar: Nesne[] };
  expect(aday.ekranlar.find((x) => x.id === ekranId)).toMatchObject({ eklenebilir: true, kullananAkislar: ['Onaylı akış'] });
  expect(await api('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [] })).toMatchObject({ basarili: false });
  const on = await basarili('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [ekranId], istegeBagli: true });
  expect(on.etki).toMatchObject({ istegeBagli: true, ekranlar: [expect.objectContaining({ id: ekranId })] });
  const surumOnce = Number((await api(`/platform/ekran?projeId=${projeId}&id=${ekranId}`)).surum);
  const y = await basarili('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [ekranId], istegeBagli: true, onay: true });
  expect((y.eklenen as Nesne[])[0].surum).toBe(surumOnce + 1);
  expect(((await model(ekranId)).adimlar as Nesne[]).at(-1)).toMatchObject({ ortakAkis: { dosya: ONAY_DOSYASI } });
  expect(((await api(`/platform/ortak-akis/ekranlar?projeId=${projeId}&ekranId=${ortakId}`)).ekranlar as Nesne[]).find((x) => x.id === ekranId)).toMatchObject({ eklenebilir: false });
  // Varsayılan akışta "dahil" işaretli senaryo düzenlenen ortak akışla onaylar.
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne & { model: Serbest };
  const dahil = (form.model.senaryoDuzeyi.alanlar as Nesne[]).find((a) => (a.etiket as Nesne)?.form === '“Onay (ortak)” dahil') as Nesne;
  expect(dahil).toBeTruthy();
  const onaySayisi = uygulama.onaylar.length;
  const sonuc = await kaydetVeKos('Varsayılan akış / onaylı', { kategori: 'K1', urun: 'Ürün A', [String(dahil.id)]: true });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.onaylar).toHaveLength(onaySayisi + 1);

  // Arayüz: ortak akışın Akışlar sekmesi (yeni akış yok; kullanan ekranlar; Ekranlara ekle… listesi; Düzenle'de ortak akış bloğu yok).
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1200 } })).newPage();
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ortakId)}/akis`);
    await expect(page.getByRole('list', { name: 'Kullanan ekranlar' })).toContainText('Ana akış, Onaylı akış');
    await expect(page.getByRole('button', { name: 'Yeni akış oluştur' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kopyala' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ekranlara ekle…' }).click();
    const diyalog = page.locator('dialog.ekran-yonetim-diyalogu');
    const satir = diyalog.getByRole('listitem').filter({ hasText: 'zaten var' });
    await expect(satir.getByRole('checkbox')).toBeDisabled();
    await expect(diyalog.getByRole('checkbox', { name: /İsteğe bağlı/ })).toBeChecked();
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
    await page.getByRole('button', { name: 'Buraya blok ekle' }).first().click();
    await expect(page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'Ortak akış' })).toHaveCount(0);
  } finally {
    await tarayici.close();
  }
});
