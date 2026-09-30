// KORUMA TESTLERİ — Çok düzeyli bağımlı listeler (il → ilçe → belde → köy): kayıt / tarama gözlemlerinden test verisi tablosuna
// TÜM düzeyler yazılır. Tüm değerler SAHTEDİR.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { secenekTablolariUret } from '../../scripts/platform/tablolar/paket-tablolari.mjs';
import { tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import { kayitPaketiOlustur, type HamAlan, type PaketMetasi } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

type Secenek = { deger: string; metin: string };
type Gozlem = { anahtar: string; secimler: Record<string, string>; secenekler: Secenek[] };
const s = (metin: string, deger = metin): Secenek => ({ deger, metin });

/** Sahte 4 düzeyli ağaç: il → ilçe → belde → köy. "Merkez" adı iki ilde de vardır (aynı ad, farklı üst). */
const AGAC: Record<string, Record<string, Record<string, string[]>>> = {
  Aşkale: { Merkez: { 'Merkez Belde': ['Köy A', 'Köy B'], Yolüstü: ['Köy C'] }, Doğu: { Kuzey: ['Köy D'] } },
  Bozova: { Merkez: { 'Merkez Belde': ['Köy E'], Yeşil: ['Köy F', 'Köy G'] } }
};

const ALANLAR = [
  { anahtar: '#il', id: 'il', etiket: 'İl', secenekler: Object.keys(AGAC).map((x) => s(x)) },
  { anahtar: '#ilce', id: 'ilce', etiket: 'İlçe', secenekler: [] },
  { anahtar: '#belde', id: 'belde', etiket: 'Belde', secenekler: [] },
  { anahtar: '#koy', id: 'koy', etiket: 'Köy', secenekler: [] }
];

/** Kayıt paneli davranışı: her okumada tüm listeler, o anki DİĞER seçimlerle birlikte gözlenir. */
function kayitGozlemleri(): Gozlem[] {
  const g: Gozlem[] = [];
  for (const [il, ilceler] of Object.entries(AGAC)) {
    for (const [ilce, beldeler] of Object.entries(ilceler)) {
      for (const [belde, koyler] of Object.entries(beldeler)) {
        for (const koy of koyler) {
          const tam = { '#il': il, '#ilce': ilce, '#belde': belde, '#koy': koy };
          const haric = (k: string) => Object.fromEntries(Object.entries(tam).filter(([x]) => x !== k));
          g.push({ anahtar: '#il', secimler: haric('#il'), secenekler: Object.keys(AGAC).map((x) => s(x)) });
          g.push({ anahtar: '#ilce', secimler: haric('#ilce'), secenekler: Object.keys(ilceler).map((x) => s(x)) });
          g.push({ anahtar: '#belde', secimler: haric('#belde'), secenekler: Object.keys(beldeler).map((x) => s(x)) });
          g.push({ anahtar: '#koy', secimler: haric('#koy'), secenekler: koyler.map((x) => s(x)) });
        }
      }
    }
  }
  return g;
}

test('4 düzeyli bağımlı liste: tek tabloda tüm düzeyler (il, ilçe, belde, köy), aynı adlı alt öğeler ayrı satırlarda', () => {
  const { testVerisi, notlar } = secenekTablolariUret({ alanlar: ALANLAR, gozlemler: kayitGozlemleri(), ekranAdi: 'Adres formu' });
  expect(notlar).toEqual([]);
  expect(testVerisi?.tablolar).toHaveLength(1);
  const t = testVerisi?.tablolar[0] as { ad: string; sutunlar: Array<{ ad: string }>; satirlar: Array<Array<string | null>> };
  expect(t.sutunlar.map((c) => c.ad)).toEqual(['İl', 'İlçe', 'Belde', 'Köy']);
  const beklenen: string[][] = [];
  for (const [il, ilceler] of Object.entries(AGAC)) for (const [ilce, beldeler] of Object.entries(ilceler)) for (const [belde, koyler] of Object.entries(beldeler)) for (const koy of koyler) beklenen.push([il, ilce, belde, koy]);
  expect(t.satirlar).toEqual(beklenen);
  expect(testVerisi?.baglantilar.map((b) => `${b.alanId}:${b.sutun}`)).toEqual(['il:İl', 'ilce:İlçe', 'belde:Belde', 'koy:Köy']);
});

test('radyo düğmeleri: kayıtta okunan seçenekler (yalnız radyolar alanında) tabloya girer; tekrar üretimde sonuç aynı', () => {
  const bolum = { anahtar: 'b:temel', baslik: 'Temel' };
  const tip: HamAlan = {
    anahtar: '#tip', tur: 'radio', etiket: 'Müşteri tipi', etiketKaynagi: 'label', kimlik: 'tip', ad: 'tip', secici: 'input[name="tip"]', kirilganlik: 'dusuk', adaySeciciler: ['input[name="tip"]'],
    zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum, radyolar: [{ deger: 'b', metin: 'Bireysel', secici: null }, { deger: 'k', metin: 'Kurumsal', secici: null }]
  };
  const meta: PaketMetasi = { ekranAnahtari: 'adres-formu', ekranAdi: 'Adres formu', urlYolu: '/adres/', girisGerekli: false, ikiAsamali: 'yok', baglamTuru: null };
  const uret = () => kayitPaketiOlustur(meta, {
    kip: 'kayit', profil: null, adimlar: [{ ad: 'Adres', yol: '/adres/', baslik: 'Adres', alanlar: [tip], ilerleme: null }],
    basariGostergesi: null, engellenenler: [], notlar: [],
    secenekGozlemleri: [{ anahtar: '#tip', secimler: {}, secenekler: [{ deger: 'b', metin: 'Bireysel' }, { deger: 'k', metin: 'Kurumsal' }], kaynak: 'liste' }]
  }).paket.testVerisi;
  const tv = uret() as { tablolar: Array<{ ad: string; satirlar: unknown[][] }>; baglantilar: Array<{ alanId: string }> };
  expect(tv.tablolar.map((t) => [t.ad, t.satirlar])).toEqual([['Adres formu — Müşteri tipi', [['Bireysel'], ['Kurumsal']]]]);
  expect(tv.baglantilar.map((b) => b.alanId)).toEqual(['tip']);
  expect(uret()).toEqual(tv);
});

test.describe('Kayıt → tablo → alan bağlama (uçtan uca, 4 düzey)', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let projeId: string;
  test.beforeEach(async () => {
    klasor = geciciKlasor('cok-duzeyli-liste');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Cok-Duzeyli-Kasa-Parolasi-7', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });

  test('kayıttan gelen 4 düzeyli liste tek tabloya yazılır; dört alan da tablonun sütunlarına bağlanır', async () => {
    const bolum = { anahtar: 'b:temel', baslik: 'Temel' };
    const ham = (id: string, etiket: string): HamAlan => ({
      anahtar: `#${id}`, tur: 'select', etiket, etiketKaynagi: 'label', kimlik: id, ad: id, secici: `#${id}`, kirilganlik: 'dusuk', adaySeciciler: [`#${id}`],
      zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum, secenekler: [{ deger: 'x', metin: 'x' }, { deger: 'y', metin: 'y' }]
    });
    const meta: PaketMetasi = { ekranAnahtari: 'adres-formu', ekranAdi: 'Adres formu', urlYolu: '/adres/', girisGerekli: false, ikiAsamali: 'yok', baglamTuru: null };
    const { paket } = kayitPaketiOlustur(meta, {
      kip: 'kayit', profil: null,
      adimlar: [{ ad: 'Adres', yol: '/adres/', baslik: 'Adres', alanlar: [ham('il', 'İl'), ham('ilce', 'İlçe'), ham('belde', 'Belde'), ham('koy', 'Köy')], ilerleme: null }],
      basariGostergesi: null, engellenenler: [], notlar: [], secenekGozlemleri: kayitGozlemleri().map((g) => ({ ...g, kaynak: 'liste' as const }))
    });
    expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
    const tv = paket.testVerisi as { tablolar: Array<{ ad: string; sutunlar: Array<{ ad: string }>; satirlar: unknown[][] }>; baglantilar: Array<{ alanId: string }> };
    expect(tv.tablolar).toHaveLength(1);
    expect(tv.tablolar[0].sutunlar.map((c) => c.ad)).toEqual(['İl', 'İlçe', 'Belde', 'Köy']);
    expect(tv.baglantilar.map((b) => b.alanId)).toEqual(['il', 'ilce', 'belde', 'koy']);

    const ek = await sayfaEkle(vt, projeId, paket, {
      senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor.yol, 'medya'),
      testVerisi: { tablolar: { [tv.tablolar[0].ad]: { islem: 'yeni' } }, baglantilar: ['il', 'ilce', 'belde', 'koy'] }
    });
    expect(ek.testVerisi.baglanan).toBe(4);
    const [tablo] = tablolariListele(vt, projeId);
    expect(tablo.sutunlar.map((c) => c.ad)).toEqual(['İl', 'İlçe', 'Belde', 'Köy']);
    expect(tablo.satirlar).toHaveLength(tv.tablolar[0].satirlar.length);
    expect(ekranAlanBaglari(vt, ek.ekranId)).toEqual({
      il: { tablo: tablo.id, sutun: 'İl' }, ilce: { tablo: tablo.id, sutun: 'İlçe' }, belde: { tablo: tablo.id, sutun: 'Belde' }, koy: { tablo: tablo.id, sutun: 'Köy' }
    });
  });
});
