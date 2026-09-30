// KORUMA TESTLERİ — Çok düzeyli bağımlı listeler (il → ilçe → belde → köy): kayıt / tarama gözlemlerinden test verisi tablosuna
// TÜM düzeyler yazılır. Tüm değerler SAHTEDİR.
import { expect, test } from '@playwright/test';
import { secenekTablolariUret } from '../../scripts/platform/tablolar/paket-tablolari.mjs';

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
