// KORUMA TESTLERİ — VERİ TABLOSUNDAN ÇOKLU SENARYO ÇALIŞTIRMA ve BAŞARISIZLARI TEKRAR ÇALIŞTIRMA:
//  · saf: çalıştırma biçimi (tek / seçili / uyan tüm satırlar), ortama özel satır, kartezyen / eşleştirme, koşu anı ezmesi, doğrulama,
//    test başlıkları "Senaryo [satır]", sabit satır (tekrar) ve o koşudaki veri, tekrar planı ayrıştırma, sonuç deposu (veri koşusu,
//    "Tekrar:" bağı) ve gösterim maskesi;
//  · uçtan uca (127.0.0.1'deki sahte "Başvuru (akış)" uygulaması, ayrı Nöbetçi, geçici veritabanı; dış siteye istek yok): varsayılan
//    tek satır (davranış değişmez), seçili satırlar ayrı test + başlıklar + gruplama, gizli sütun maskesi, üst sınır, eşleştirme,
//    başarısızları tekrar çalıştırma (yalnız kalanlar, satır / model değişim uyarısı, "Tekrar:" bağı), arayüz (senaryo formu, koşu
//    diyaloğu tahmini sayı, sonuç gruplama; masaüstü + 390 px taşma yok). Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { basvuruyuCoz, degerBasvurusu, satirSecimiOlustur, type Satir, type Tablo } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import {
  basvuruGruplari, satirOzeti, tekrarPlaniniAyristir, veriKosulariniAc, veriKosulariniAyikla, veriKosusuSayisi, type VkTablo
} from '../../scripts/platform/tablolar/veri-kosulari.mjs';
import { modelTestAnahtari, modelTestBasliklari } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { kosuDetayi, kosuKaydet, kosuyuBitir, sonucDetayi, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { kosuDetayiniMaskele } from '../../scripts/platform/sonuclar/gosterim-maskesi.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { AkisUygulamasi, HAVUZLAR, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

/** Plan tablosu: ortamsız üç satır ve yalnız "o2" ortamına özel bir satır. */
const planTablosu = (): VkTablo & Tablo => ({
  id: 'p', ad: 'Plan',
  sutunlar: [{ ad: 'Plan', gizli: false }],
  satirlar: [
    { id: 's1', ad: 'plan-bir', ortamId: null, degerler: { Plan: '1' } },
    { id: 's2', ad: 'plan-iki', ortamId: null, degerler: { Plan: '2' } },
    { id: 's3', ad: 'plan-uc', ortamId: null, degerler: { Plan: '3' } },
    { id: 's4', ad: 'plan-diger', ortamId: 'o2', degerler: { Plan: '2' } }
  ] as Array<Satir & { id: string; ad: string }>
});
/** Ürün tablosu: gizli "Kod" sütunlu (değeri raporda hiç görünmemeli). */
const urunTablosu = (): VkTablo & Tablo => ({
  id: 'u', ad: 'Ürün',
  sutunlar: [{ ad: 'Ürün', gizli: false }, { ad: 'Kod', gizli: true }],
  satirlar: [
    { id: 'u1', ad: 'urun-a', ortamId: null, degerler: { Ürün: 'Ürün A', Kod: 'gizli-kod-1' } },
    { id: 'u2', ad: 'urun-b', ortamId: null, degerler: { Ürün: 'Ürün B', Kod: 'gizli-kod-2' } }
  ] as Array<Satir & { id: string; ad: string }>
});

test.describe('veri koşuları (saf)', () => {
  const tablolar = [planTablosu(), urunTablosu()];
  const veri = { plan: '${Plan.Plan}', urun: '${Ürün.Ürün}', duz: 'x' };
  const gruplar = basvuruGruplari(veri, tablolar);

  test('ayar yoksa (varsayılan) veri koşusu açılmaz: bugünkü gibi tek test; "tek" ezmesi de açmaz', () => {
    expect(gruplar.map((g) => g.anahtar)).toEqual(['p|', 'u|']);
    expect(veriKosulariniAc(undefined, { tablolar, gruplar, ortamId: 'o1' })).toEqual({ kosular: [], hatalar: [], cokluGruplar: [] });
    const ayar = { gruplar: { 'p|': { kip: 'tumu' as const } } };
    expect(veriKosulariniAc(ayar, { tablolar, gruplar, ortamId: 'o1', kip: 'tek' }).kosular).toEqual([]);
    expect(veriKosusuSayisi(undefined, { tablolar, gruplar, ortamId: 'o1' })).toEqual({ sayi: 1, hatalar: [], coklu: false });
  });

  test('seçili satırlar: her biri ayrı koşu; ortama özel satır yalnız kendi ortamında; uyan tüm satırlar seçimlerle süzülür', () => {
    const ayar = { gruplar: { 'p|': { kip: 'secili' as const, satirlar: ['s1', 's3', 's4'] } } };
    const o1 = veriKosulariniAc(ayar, { tablolar, gruplar, ortamId: 'o1' });
    expect(o1.kosular).toEqual([{ anahtar: 's1', ad: 'plan-bir', satirlar: { 'p|': 's1' } }, { anahtar: 's3', ad: 'plan-uc', satirlar: { 'p|': 's3' } }]);
    expect(veriKosulariniAc(ayar, { tablolar, gruplar, ortamId: 'o2' }).kosular.map((k) => k.ad)).toEqual(['plan-bir', 'plan-uc', 'plan-diger']);
    // Uyan tüm satırlar: tabloSecimleri (Plan = 2) ile uyanlar; o1'de o2 satırı yok.
    const tumu = { gruplar: { 'p|': { kip: 'tumu' as const } } };
    expect(veriKosulariniAc(tumu, { tablolar, gruplar, ortamId: 'o1', tabloSecimleri: { 'p|': { Plan: '2' } } }).kosular.map((k) => k.ad)).toEqual(['plan-iki']);
    expect(veriKosulariniAc(tumu, { tablolar, gruplar, ortamId: 'o2', tabloSecimleri: { 'p|': { Plan: '2' } } }).kosular.map((k) => k.ad)).toEqual(['plan-iki', 'plan-diger']);
    // Bu ortamda hiç satır kalmazsa açık hata (koşu tek test olarak hatayla kalır).
    const yalnizDiger = { gruplar: { 'p|': { kip: 'secili' as const, satirlar: ['s4'] } } };
    expect(veriKosulariniAc(yalnizDiger, { tablolar, gruplar, ortamId: 'o1' }).hatalar[0]).toContain('"Plan" tablosunda bu ortamda koşulacak satır yok');
  });

  test('iki çoklu grup: tüm kombinasyonlar (kartezyen) ve eşleştirerek; koşu anı "tumu" ezmesi; sayı', () => {
    const kart = { gruplar: { 'p|': { kip: 'secili' as const, satirlar: ['s1', 's2', 's3'] }, 'u|': { kip: 'tumu' as const } }, birlesim: 'kartezyen' as const };
    const k = veriKosulariniAc(kart, { tablolar, gruplar, ortamId: 'o1' });
    expect(k.kosular).toHaveLength(6);
    expect(k.kosular[0]).toEqual({ anahtar: 's1+u1', ad: 'plan-bir + urun-a', satirlar: { 'p|': 's1', 'u|': 'u1' } });
    expect(veriKosusuSayisi(kart, { tablolar, gruplar, ortamId: 'o1' })).toEqual({ sayi: 6, hatalar: [], coklu: true });
    const esle = { gruplar: { 'p|': { kip: 'tumu' as const }, 'u|': { kip: 'tumu' as const } }, birlesim: 'eslestir' as const, eslesmeler: [{ 'p|': 's1', 'u|': 'u2' }, { 'p|': 's4', 'u|': 'u1' }, { 'p|': 's2', 'u|': 'u1' }] };
    // Ortama özel satırı (s4) içeren eşleşme o1'de koşmaz.
    expect(veriKosulariniAc(esle, { tablolar, gruplar, ortamId: 'o1' }).kosular.map((x) => x.ad)).toEqual(['plan-bir + urun-b', 'plan-iki + urun-a']);
    expect(veriKosulariniAc(esle, { tablolar, gruplar, ortamId: 'o2' }).kosular).toHaveLength(3);
    // Koşu anı "uyan tüm satırlar": kullanılan her grup tümü, kombinasyon (o1: 3 plan × 2 ürün).
    expect(veriKosusuSayisi(undefined, { tablolar, gruplar, ortamId: 'o1', kip: 'tumu' }).sayi).toBe(6);
  });

  test('kaydedilecek ayarın doğrulaması: tek → yok sayılır; olmayan satır, boş işaret, eksik eşleşme reddedilir', () => {
    expect(veriKosulariniAyikla(null, tablolar)).toEqual({ ayar: undefined, hatalar: [] });
    expect(veriKosulariniAyikla({ gruplar: { 'p|': { kip: 'tek' } } }, tablolar)).toEqual({ ayar: undefined, hatalar: [] });
    expect(veriKosulariniAyikla({ gruplar: { 'p|': { kip: 'secili', satirlar: ['s1', 's1', 's2'] } } }, tablolar).ayar).toEqual({ gruplar: { 'p|': { kip: 'secili', satirlar: ['s1', 's2'] } } });
    expect(veriKosulariniAyikla({ gruplar: { 'p|': { kip: 'secili', satirlar: [] } } }, tablolar).hatalar[0]).toContain('en az bir satır');
    expect(veriKosulariniAyikla({ gruplar: { 'p|': { kip: 'secili', satirlar: ['yok'] } } }, tablolar).hatalar[0]).toContain('satır yok');
    expect(veriKosulariniAyikla({ gruplar: { 'x|': { kip: 'tumu' } } }, tablolar).hatalar[0]).toContain('tablo bu projede yok');
    const esle = veriKosulariniAyikla({ gruplar: { 'p|': { kip: 'tumu' }, 'u|': { kip: 'tumu' } }, birlesim: 'eslestir', eslesmeler: [{ 'p|': 's1' }] }, tablolar);
    expect(esle.hatalar[0]).toContain('"Ürün" satırı eksik');
  });

  test('test başlıkları: "Senaryo [satır]" (tek satırda başlık değişmez); sabit satır ve o koşudaki veri; kullanılan satırlar kaydedilir', () => {
    const b = modelTestBasliklari([
      { id: 'a', baslik: 'Sipariş', veriKosusu: { anahtar: 's1', ad: 'plan-bir' } },
      { id: 'a', baslik: 'Sipariş', veriKosusu: { anahtar: 's2', ad: 'plan-iki' } },
      { id: 'b', baslik: 'Sipariş', veriKosusu: { anahtar: null, ad: null } }
    ]);
    expect(b.get(modelTestAnahtari({ id: 'a', veriKosusu: { anahtar: 's1' } }))).toBe('Sipariş [plan-bir]');
    expect(b.get('a#s2')).toBe('Sipariş [plan-iki]');
    expect(b.get('b')).toBe('Sipariş (b)');
    // Sabit satır: seçimlere bakılmaz; başka ortamın satırı / silinmiş satır açık hata; o koşudaki veri yalnız gizli sütunsuz tabloda.
    const bsv = degerBasvurusu('${Plan.Plan}');
    const ss = { ...satirSecimiOlustur('ilk'), sabit: { 'p|': 's3' }, kullanilan: new Map() };
    const c = basvuruyuCoz(tablolar, bsv!, { 'p|': { Plan: '1' } }, 'o1', ss);
    expect('deger' in c && c.deger).toBe('3');
    expect(ss.kullanilan.get('p|')?.id).toBe('s3');
    expect(basvuruyuCoz(tablolar, bsv!, undefined, 'o1', { sabit: { 'p|': 's4' } })).toEqual({ hata: '"Plan" tablosunda koşunun satırı artık yok ya da bu ortamda geçerli değil' });
    const eski = basvuruyuCoz(tablolar, bsv!, undefined, 'o1', { sabit: { 'p|': 'silinmis' }, veriler: { 'p|': { Plan: '9' } } });
    expect('deger' in eski && eski.deger).toBe('9');
    const u = degerBasvurusu('${Ürün.Ürün}');
    expect(basvuruyuCoz(tablolar, u!, undefined, 'o1', { sabit: { 'u|': 'u2' }, veriler: { 'u|': { Ürün: 'Eski' } } })).toMatchObject({ deger: 'Ürün B' });
    // Rapor özeti: açık sütunlar; gizli sütunun yalnız adı.
    const oz = satirOzeti('u|', urunTablosu(), urunTablosu().satirlar[1]);
    expect(oz).toEqual({ grup: 'u|', tablo: 'Ürün', satirId: 'u2', satirAdi: 'urun-b', degerler: { Ürün: 'Ürün B' }, gizliSutunlar: ['Kod'] });
    expect(JSON.stringify(oz)).not.toContain('gizli-kod');
  });

  test('tekrar planı ayrıştırma: yalnız bilinen alanlar ve kimlik biçimindeki satırlar; bozuksa boş', () => {
    expect(tekrarPlaniniAyristir('bozuk')).toEqual({});
    expect(tekrarPlaniniAyristir(undefined)).toEqual({});
    const p = tekrarPlaniniAyristir(JSON.stringify({ senaryolar: { 'sen-1': { modelSurumu: 2, kosular: [{ anahtar: 's1', ad: 'plan-bir', satirlar: { 'p|': 's1', 'kotu anahtar': 'x', 'u|': '../x' }, veriler: { 'p|': { Plan: 5 } } }] }, 'kötü id': {} } }));
    expect(p).toEqual({ 'sen-1': { modelSurumu: 2, kosular: [{ anahtar: 's1', ad: 'plan-bir', satirlar: { 'p|': 's1' }, veriler: { 'p|': { Plan: '5' } } }] } });
  });

  test('sonuç deposu: veri koşusu ekte; "Tekrar:" bağı koşu bitince korunur; gösterim maskesi bilinen gizli değeri örter', async () => {
    const klasor = mkdtempSync(join(tmpdir(), 'veri-kosusu-depo-'));
    try {
      const vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
      vt.calistir("INSERT INTO projeler (id, ad, ayarlar_json, olusturulma, guncellenme) VALUES ('pr', 'Proje', '{}', 'x', 'x')");
      kosuKaydet(vt, { id: 'k1', projeId: 'pr', tur: 'tam' });
      const vk = { anahtar: 's1', ad: 'plan-bir', modelSurumu: 3, satirlar: [{ grup: 'p|', tablo: 'Plan', satirId: 's1', satirAdi: 'plan-bir', degerler: { Plan: 'sırlı-değer' }, gizliSutunlar: ['Kod'] }], fazla: 'yok sayılır' };
      const { id } = sonucKaydet(vt, { kosuId: 'k1', projeId: 'pr', senaryoBaslik: 'Sipariş [plan-bir]', durum: 'basarisiz', veriKosusu: vk });
      kosuyuBitir(vt, 'k1', { durum: 'tamamlandi' });
      kosuKaydet(vt, { id: 'k2', projeId: 'pr', tur: 'tekil', tekrarKaynagi: 'k1' });
      sonucKaydet(vt, { kosuId: 'k2', projeId: 'pr', senaryoBaslik: 'Sipariş [plan-bir]', durum: 'basarili' });
      kosuyuBitir(vt, 'k2', { durum: 'tamamlandi' });
      const d1 = kosuDetayi(vt, 'k1')!;
      expect(d1.sonuclar[0].veriKosusu).toEqual({ anahtar: 's1', ad: 'plan-bir', modelSurumu: 3, satirlar: [{ grup: 'p|', tablo: 'Plan', satirId: 's1', satirAdi: 'plan-bir', degerler: { Plan: 'sırlı-değer' }, gizliSutunlar: ['Kod'] }] });
      expect(d1.kosu.tekrarlar.map((t) => t.id)).toEqual(['k2']);
      expect(d1.kosu.tekrarKaynagi).toBeNull();
      const d2 = kosuDetayi(vt, 'k2')!;
      expect(d2.kosu.tekrarKaynagi).toMatchObject({ id: 'k1', var: true });
      expect(d2.sonuclar[0].veriKosusu).toBeNull();
      expect(sonucDetayi(vt, id)?.veriKosusu?.ad).toBe('plan-bir');
      // Tekrar bağı sayılarla birlikte özet JSON'unda (şema göçü yok).
      expect(JSON.parse(String(vt.tek("SELECT ozet_json FROM kosular WHERE id = 'k2'")?.ozet_json))).toMatchObject({ tekrarKaynagi: 'k1', basarili: 1 });
      const m = { metin: (x: unknown) => String(x), ad: (x: unknown) => String(x).replace('sırlı-değer', '•••') };
      expect(JSON.stringify(kosuDetayiniMaskele(d1, m))).not.toContain('sırlı-değer');
      vt.kapat();
    } finally {
      rmSync(klasor, { recursive: true, force: true });
    }
  });
});

test.describe('uçtan uca: tablodan çoklu senaryo ve başarısızları tekrar çalıştırma (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Veri-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: AkisUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let digerOrtam = '';
  let ekranId = '';
  let planTablo = '';
  let urunTablo = '';
  let satir: Record<string, string> = {};
  let senaryoA = '';
  let cokluKosu = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  /** Tekil koşu (kendi koşu kimliğiyle); yanıt + koşu ayrıntısı. */
  const kos = async (senaryoId: string, ek: Nesne = {}) => {
    const kosuKimligi = `kosu-${randomUUID()}`;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `k-${randomUUID()}`, senaryoId, ortamId, kosuTuru: 'tekil', kosuKimligi, ...ek });
    return { y, kosuKimligi, detay: y.basarili ? await api(`/platform/sonuclar/kosu?id=${kosuKimligi}`) : null };
  };
  const tabloSatirlari = async () => ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'coklu-veri-'));
    uygulama = new AkisUygulamasi();
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Çoklu Veri Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    digerOrtam = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Diğer', tabanUrl: fikstur.adres, riskli: false })).ortam as Nesne).id);
    // Başvuranın hazır kimliği (kimlik alanı; havuz = aynı adlı tablo).
    const tur = String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: HAVUZLAR.ozel, alanlar: ['kimlikNo', 'dogumTarihi', 'cepTelefonu'].map((ad) => ({ ad, hassas: true })) })).id);
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: tur, ad: 'k1', degerler: { kimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' } });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: akisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId, digerOrtam] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'Başvuru (akış)')?.id);
    // "Plan seçimi" (gizli sütunsuz): plan-uc sayfada "3" → uygulama iş kuralı hatası verir (test kalır). plan-diger yalnız Diğer ortamda.
    await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Plan seçimi', sutunlar: [{ ad: 'Plan' }],
      satirlar: [{ ad: 'plan-bir', degerler: { Plan: '1' } }, { ad: 'plan-iki', degerler: { Plan: '2' } }, { ad: 'plan-uc', degerler: { Plan: '3' } },
        { ad: 'plan-diger', ortamId: digerOrtam, degerler: { Plan: '2' } }]
    });
    // "Ürün seçimi": gizli "Kod" sütunu (değeri hiçbir yanıtta görünmemeli).
    await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Ürün seçimi', sutunlar: [{ ad: 'Ürün' }, { ad: 'Kod', gizli: true }],
      satirlar: [{ ad: 'urun-a', degerler: { Ürün: 'Ürün A', Kod: 'gizli-kod-aaa' } }, { ad: 'urun-b', degerler: { Ürün: 'Ürün B', Kod: 'gizli-kod-bbb' } }]
    });
    const tablolar = await tabloSatirlari();
    const p = tablolar.find((t) => t.ad === 'Plan seçimi') as Nesne;
    const u = tablolar.find((t) => t.ad === 'Ürün seçimi') as Nesne;
    planTablo = String(p.id);
    urunTablo = String(u.id);
    satir = Object.fromEntries([...p.satirlar, ...u.satirlar].map((r: Nesne) => [String(r.ad), String(r.id)]));
    senaryoA = String((await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Çoklu plan', ortamIdleri: [ortamId, digerOrtam], veri: { baslik: 'Çoklu plan', kategori: 'K1', urun: 'Ürün A', plan: '${Plan seçimi.Plan}' }
    })).id);
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('varsayılan: tek satırla TEK test, başlık değişmez (bugünkü davranış); hangi satırla koştuğu sonuçta', async () => {
    test.setTimeout(180_000);
    const { y, detay } = await kos(senaryoA);
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    expect(y.durum, JSON.stringify(y.hataMesaji)).toBe('passed');
    expect(y.veriKosulari).toBeUndefined();
    const sonuclar = detay?.sonuclar as Nesne[];
    expect(sonuclar.map((x) => x.senaryoBaslik)).toEqual(['Çoklu plan']);
    expect(sonuclar[0].veriKosusu).toMatchObject({ anahtar: null, ad: null, satirlar: [{ tablo: 'Plan seçimi', satirAdi: 'plan-bir', degerler: { Plan: '1' } }] });
    expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ plan: '1' });
    expect(((await api(`/platform/senaryo?id=${senaryoA}&ortamId=${ortamId}`)).senaryo as Nesne).veriKosulari).toBeNull();
  });

  test('seçili satırlar: her satır ayrı test "Senaryo [satır]"; ortama özel satır yalnız kendi ortamında; sonuç toplanır', async () => {
    test.setTimeout(240_000);
    const grup = `${planTablo}|`;
    await basarili('/platform/senaryo/kaydet', { id: senaryoA, projeId, baslik: 'Çoklu plan', veriKosulari: { gruplar: { [grup]: { kip: 'secili', satirlar: [satir['plan-bir'], satir['plan-iki'], satir['plan-uc'], satir['plan-diger']] } } } });
    expect(((await api(`/platform/senaryo?id=${senaryoA}&ortamId=${ortamId}`)).senaryo as Nesne).veriKosulari.gruplar[grup].satirlar).toHaveLength(4);
    const tahmin = async (o: string, kip?: string) => basarili('/platform/senaryolar/veri-kosusu-tahmini', { projeId, ortamId: o, senaryoIdleri: [senaryoA], ...(kip ? { kip } : {}) });
    expect(await tahmin(ortamId)).toMatchObject({ toplam: 3, gruplu: true, coklu: 1, asanlar: [] });
    expect((await tahmin(digerOrtam)).toplam).toBe(4);
    expect((await tahmin(ortamId, 'tek')).toplam).toBe(1);
    const once = uygulama.hesaplamalar.length;
    const { y, detay, kosuKimligi } = await kos(senaryoA);
    cokluKosu = kosuKimligi;
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    expect(y.durum).toBe('failed');
    expect((y.veriKosulari as Nesne[]).map((x) => [x.baslik, x.durum])).toEqual([
      ['Çoklu plan [plan-bir]', 'basarili'], ['Çoklu plan [plan-iki]', 'basarili'], ['Çoklu plan [plan-uc]', 'basarisiz']
    ]);
    expect(uygulama.hesaplamalar.slice(once).map((x) => x.plan)).toEqual(['1', '2', '3']);
    const sonuclar = detay?.sonuclar as Nesne[];
    expect(sonuclar.map((x) => x.senaryoBaslik).sort()).toEqual(['Çoklu plan [plan-bir]', 'Çoklu plan [plan-iki]', 'Çoklu plan [plan-uc]']);
    expect(sonuclar.every((x) => x.senaryoId === senaryoA && x.veriKosusu.anahtar)).toBe(true);
    expect(sonuclar.find((x) => x.durum === 'basarisiz')?.veriKosusu).toMatchObject({ ad: 'plan-uc', satirlar: [{ satirId: satir['plan-uc'] }] });
    // Koşu anı ezmesi "tek": bu koşuda tek test (başlık değişmez).
    const tek = await kos(senaryoA, { veriKipi: 'tek' });
    expect((tek.detay?.sonuclar as Nesne[]).map((x) => x.senaryoBaslik)).toEqual(['Çoklu plan']);
  });

  test('başarısızları tekrar çalıştır: yalnız kalan satır, o koşudaki satırla; satır değişince uyarı ve seçim; "Tekrar:" bağı', async () => {
    test.setTimeout(240_000);
    const plan = (await api(`/platform/sonuclar/tekrar-plani?kosuId=${cokluKosu}&projeId=${projeId}`)).plan as Nesne;
    expect(plan.sayi).toBe(1);
    expect(plan.senaryolar).toHaveLength(1);
    expect(plan.senaryolar[0]).toMatchObject({ id: senaryoA, testSayisi: 1, modelDegisti: false, satirDegisiklikleri: [], testler: [{ veriKosusu: 'plan-uc' }] });
    // plan-uc satırının verisi değişir (3 → 2): plan bildirir; tablo gizli sütunsuz → "o koşudaki veriyle" seçilebilir.
    await basarili('/platform/tablo/kaydet', { projeId, id: planTablo, ad: 'Plan seçimi', sutunlar: [{ ad: 'Plan', eskiAd: 'Plan' }], satirlar: [{ id: satir['plan-uc'], degerler: { Plan: '2' } }] });
    const plan2 = (await api(`/platform/sonuclar/tekrar-plani?kosuId=${cokluKosu}&projeId=${projeId}`)).plan as Nesne;
    expect(plan2.senaryolar[0].satirDegisiklikleri).toEqual([{ tablo: 'Plan seçimi', satirAdi: 'plan-uc', durum: 'degisti', kosudakiVeri: true }]);
    // O koşudaki veriyle: yine "3" → kalır; yalnız bir hesaplama (yalnız kalan satır koştu).
    const once = uygulama.hesaplamalar.length;
    const r1 = await kos(senaryoA, { tekrar: { kaynakKosuId: cokluKosu, veri: 'kosudaki' } });
    expect(r1.y.basarili, String(r1.y.mesaj ?? '')).toBe(true);
    expect(r1.y.durum, JSON.stringify(r1.y.hataMesaji)).toBe('failed');
    expect(String(r1.y.hataMesaji)).toContain('Seçilen plan bu ürün için kullanılamaz');
    expect(uygulama.hesaplamalar.slice(once).map((x) => x.plan)).toEqual(['3']);
    expect((r1.detay?.sonuclar as Nesne[]).map((x) => x.senaryoBaslik)).toEqual(['Çoklu plan [plan-uc]']);
    expect(r1.detay?.kosu.tekrarKaynagi).toMatchObject({ id: cokluKosu, var: true });
    // Güncel veriyle: "2" → geçer.
    const r2 = await kos(senaryoA, { tekrar: { kaynakKosuId: cokluKosu, veri: 'guncel' } });
    expect(r2.y.durum).toBe('passed');
    expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ plan: '2' });
    expect(((await api(`/platform/sonuclar/kosu?id=${cokluKosu}`)).kosu as Nesne).tekrarlar.map((t: Nesne) => t.id).sort()).toEqual([r1.kosuKimligi, r2.kosuKimligi].sort());
    // Tekrar yalnız o koşunun ortamında; kalan testi olmayan senaryo reddedilir.
    const baskaOrtam = await api('/platform/senaryolar/calistir', { projeId, kosuId: `k-${randomUUID()}`, senaryoId: senaryoA, ortamId: digerOrtam, tekrar: { kaynakKosuId: cokluKosu } });
    expect(baskaOrtam.basarili).toBe(false);
    expect(String(baskaOrtam.mesaj)).toContain('yalnız o koşunun ortamında');
    const kalansiz = await api('/platform/senaryolar/calistir', { projeId, kosuId: `k-${randomUUID()}`, senaryoId: senaryoA, ortamId, tekrar: { kaynakKosuId: r2.kosuKimligi } });
    expect(kalansiz.basarili).toBe(false);
  });

  test('model o koşudan bu yana değişince bildirilir; tekrar varsayılan olarak o koşudaki model sürümüyle koşar', async () => {
    test.setTimeout(240_000);
    const eskiSurum = ((await api(`/platform/sonuclar/kosu?id=${cokluKosu}`)).sonuclar as Nesne[])[0].veriKosusu.modelSurumu as number;
    expect(eskiSurum).toBeGreaterThanOrEqual(1);
    const paket = akisPaketi();
    const alanlar = (paket.model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const tur = alanlar.find((a) => a.id === 'gizliTur') as Nesne;
    tur.konum = { ...tur.konum, secici: 'select#gizliTur' };
    const r = await basarili('/platform/ekran/model/degistir', { projeId, ekranId, paket, onay: true });
    expect(Number(r.surum)).toBeGreaterThan(eskiSurum);
    const plan = (await api(`/platform/sonuclar/tekrar-plani?kosuId=${cokluKosu}&projeId=${projeId}`)).plan as Nesne;
    expect(plan.senaryolar[0]).toMatchObject({ modelDegisti: true, modelSurumu: eskiSurum, guncelModelSurumu: Number(r.surum), eskiModelVar: true });
    const kosudaki = await kos(senaryoA, { tekrar: { kaynakKosuId: cokluKosu } });
    expect((kosudaki.detay?.sonuclar as Nesne[])[0].veriKosusu.modelSurumu).toBe(eskiSurum);
    const guncel = await kos(senaryoA, { tekrar: { kaynakKosuId: cokluKosu, model: 'guncel' } });
    expect((guncel.detay?.sonuclar as Nesne[])[0].veriKosusu.modelSurumu).toBe(Number(r.surum));
  });

  test('iki tablo: kombinasyon sayısı ve üst sınır (başlatılmaz); eşleştirerek; gizli sütun değeri hiçbir yanıtta yok', async () => {
    test.setTimeout(240_000);
    const pg = `${planTablo}|`;
    const ug = `${urunTablo}|`;
    const b = String((await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Kombinasyon', ortamIdleri: [ortamId], veri: { baslik: 'Kombinasyon', kategori: 'K1', urun: '${Ürün seçimi.Ürün}', plan: '${Plan seçimi.Plan}' },
      veriKosulari: { gruplar: { [pg]: { kip: 'secili', satirlar: [satir['plan-bir'], satir['plan-iki']] }, [ug]: { kip: 'tumu' } }, birlesim: 'kartezyen' }
    })).id);
    expect((await basarili('/platform/senaryolar/veri-kosusu-tahmini', { projeId, ortamId, senaryoIdleri: [b] })).toplam).toBe(4);
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { enCokVeriKosusu: 3 } });
    const t = await basarili('/platform/senaryolar/veri-kosusu-tahmini', { projeId, ortamId, senaryoIdleri: [b] });
    expect(t).toMatchObject({ sinir: 3, asanlar: [{ id: b, sayi: 4 }] });
    const once = uygulama.hesaplamalar.length;
    const red = await api('/platform/senaryolar/calistir', { projeId, kosuId: `k-${randomUUID()}`, senaryoId: b, ortamId });
    expect(red.basarili).toBe(false);
    expect(String(red.mesaj)).toContain('en çok 3');
    expect(uygulama.hesaplamalar.length).toBe(once);
    // Eşleştirerek: iki çift → iki test.
    await basarili('/platform/senaryo/kaydet', {
      id: b, projeId, baslik: 'Kombinasyon',
      veriKosulari: { gruplar: { [pg]: { kip: 'tumu' }, [ug]: { kip: 'tumu' } }, birlesim: 'eslestir', eslesmeler: [{ [pg]: satir['plan-bir'], [ug]: satir['urun-b'] }, { [pg]: satir['plan-iki'], [ug]: satir['urun-a'] }] }
    });
    const { y, detay } = await kos(b);
    expect(y.durum, JSON.stringify(y.hataMesaji)).toBe('passed');
    expect(uygulama.hesaplamalar.slice(once).map((x) => [x.urun, x.plan]).sort()).toEqual([['U11', '2'], ['U12', '1']]);
    const sonuclar = detay?.sonuclar as Nesne[];
    // Başlıktaki satır sırası senaryodaki alan sırasıdır (ürün, sonra plan).
    expect(sonuclar.map((x) => x.senaryoBaslik).sort()).toEqual(['Kombinasyon [urun-a + plan-iki]', 'Kombinasyon [urun-b + plan-bir]']);
    const urunSatiri = sonuclar[0].veriKosusu.satirlar.find((s: Nesne) => s.tablo === 'Ürün seçimi');
    expect(urunSatiri.gizliSutunlar).toEqual(['Kod']);
    expect(urunSatiri.degerler).not.toHaveProperty('Kod');
    const tumu = JSON.stringify([detay, ...(await Promise.all(sonuclar.map((x) => api(`/platform/sonuclar/sonuc?id=${String(x.id)}`))))]);
    expect(tumu).not.toContain('gizli-kod');
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { enCokVeriKosusu: 50 } });
  });

  test('arayüz: senaryo formunda çalıştırma biçimi ve tahmini sayı, koşu diyaloğunda tahmini sayı, sonuçta gruplama + tekrar (masaüstü + 390 px)', async () => {
    test.setTimeout(180_000);
    const tarayici = await korumaliTarayici();
    const tasmaYok = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    try {
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      // 1) Senaryo formu: grubu olmayan tekil tablo (Plan): eski üç seçenekli "Çalıştırma biçimi" listesi yok; kayıtlı "seçili satırlar"
      //    korunur (kutu işaretli, 4 satır işareti) ve değiştirmeden kaydedince veriKosulari aynı kalır. Kutu kapatılınca tek test,
      //    yeniden açılınca "uyan her satır" (bu ortamda 3).
      const senaryoOku = async () => (await api(`/platform/senaryo?id=${senaryoA}&ortamId=${ortamId}`)).senaryo as Nesne;
      const kayitliVeriKosulari = (await senaryoOku()).veriKosulari as unknown;
      expect(kayitliVeriKosulari).toMatchObject({ gruplar: { [`${planTablo}|`]: { kip: 'secili' } } });
      await page.goto(`/#/senaryolar/duzenle/${senaryoA}`);
      const bicim = page.locator(`input[data-coklu-calistirma="${planTablo}|"]`);
      await expect(bicim).toBeVisible({ timeout: 20_000 });
      await expect(bicim).toBeChecked();
      await expect(page.locator('select[data-calistirma-bicimi]')).toHaveCount(0);
      await expect(page.locator('.satir-secimi-karti').getByText('Çalıştırma biçimi')).toHaveCount(0);
      await expect(page.locator('.satir-isaretleri input[type="checkbox"]:checked')).toHaveCount(4);
      await expect(page.locator('[data-tahmini-test]')).toHaveAttribute('data-tahmini-test', '3');
      await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
      await expect(page).not.toHaveURL(/duzenle/, { timeout: 15_000 });
      expect((await senaryoOku()).veriKosulari).toEqual(kayitliVeriKosulari);
      await page.goto(`/#/senaryolar/duzenle/${senaryoA}`);
      await expect(bicim).toBeChecked({ timeout: 20_000 });
      await bicim.uncheck();
      await expect(page.locator('[data-tahmini-test]')).toHaveCount(0);
      await bicim.check();
      await expect(page.locator('.satir-isaretleri')).toHaveCount(0);
      await expect(page.locator('[data-tahmini-test]')).toHaveAttribute('data-tahmini-test', '3');
      await page.locator('.satir-secimi-karti').screenshot({ path: test.info().outputPath('senaryo-formu-calistirma-bicimi.png'), animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(bicim).toBeVisible();
      await tasmaYok(page);
      await page.locator('.satir-secimi-karti').screenshot({ path: test.info().outputPath('senaryo-formu-calistirma-bicimi-telefon.png'), animations: 'disabled' });
      await page.setViewportSize({ width: 1400, height: 1000 });
      // Değişiklik kaydedilmeden çıkılır (kayıtlı "seçili satırlar" korunur).
      await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
      await page.locator('dialog[open]').getByRole('button', { name: 'Çık', exact: true }).click();
      await expect(page).not.toHaveURL(/duzenle/, { timeout: 15_000 });
      expect((await senaryoOku()).veriKosulari).toEqual(kayitliVeriKosulari);
      // 2) Koşu diyaloğu: ▷ tablodan veri alan senaryoda diyalog açılır; tahmini sayı, "Hepsi tek satırla" → 1.
      await page.goto(`/#/senaryolar/u/${ekranId}`);
      await page.getByRole('button', { name: 'Çalıştır: Çoklu plan' }).click();
      const diyalog = page.locator('dialog[open]');
      await expect(diyalog.locator('.veri-kosusu-tahmini')).toContainText('Tahmini test sayısı: 3', { timeout: 15_000 });
      await diyalog.getByLabel('Veri koşusu').selectOption('tek');
      await expect(diyalog.locator('.veri-kosusu-tahmini')).toContainText('Tahmini test sayısı: 1');
      await page.screenshot({ path: test.info().outputPath('kosu-diyalogu-veri-kosusu.png'), animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await diyalog.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
      await tasmaYok(page);
      await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
      await page.setViewportSize({ width: 1400, height: 1000 });
      // 3) Sonuçlar > Koşu: veri koşuları tek senaryo satırında; açılınca satırlar; "Başarısızları tekrar çalıştır (1)" planı gösterir.
      await page.goto(`/#/sonuclar/kosu/${cokluKosu}`);
      const grup = page.locator('tr.veri-kosusu-grubu');
      await expect(grup).toHaveCount(1, { timeout: 15_000 });
      await expect(grup).toContainText('3 veri koşusu');
      await expect(page.locator('tr.veri-kosusu-alt:visible')).toHaveCount(0);
      await grup.getByRole('button').click();
      await expect(page.locator('tr.veri-kosusu-alt:visible')).toHaveCount(3);
      await page.locator('section[aria-labelledby="senaryo-basligi"]').screenshot({ path: test.info().outputPath('sonuc-gruplama.png'), animations: 'disabled' });
      await expect(page.locator('tr.veri-kosusu-alt').filter({ hasText: 'plan-uc' })).toBeVisible();
      const tekrar = page.getByRole('button', { name: 'Başarısızları tekrar çalıştır (1)' });
      await expect(tekrar).toBeVisible();
      await expect(page.locator('.tekrar-bagi').filter({ hasText: 'Tekrarları' })).toBeVisible();
      await tekrar.click();
      const plan = page.locator('dialog[open]');
      await expect(plan.getByRole('list', { name: 'Tekrar çalıştırılacak testler' })).toContainText('Çoklu plan [plan-uc]');
      await expect(plan).toContainText('Ekran modeli o koşudan bu yana değişti');
      await expect(plan).toContainText('plan-uc (verisi değişti)');
      await page.screenshot({ path: test.info().outputPath('sonuc-gruplama-tekrar.png'), animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await plan.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
      await tasmaYok(page);
      await plan.getByRole('button', { name: 'Vazgeç' }).click();
      await tasmaYok(page);
      await page.screenshot({ path: test.info().outputPath('sonuc-gruplama-telefon.png'), animations: 'disabled', fullPage: true });
      // 4) Test ayrıntısı: kullanılan tablo satırı.
      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.locator('tr.veri-kosusu-alt a').filter({ hasText: 'plan-uc' }).click();
      await expect(page.getByRole('heading', { name: 'Kullanılan tablo satırları' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.tablo-satirlari')).toContainText('Plan seçimi → plan-uc');
      expect(hatalar).toEqual([]);
      await baglam.close();
    } finally {
      await tarayici.close();
    }
  });
});
