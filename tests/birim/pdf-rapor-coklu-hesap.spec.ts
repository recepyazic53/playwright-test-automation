// KORUMA TESTLERİ — PDF raporu A2'nin SAF hesapları (veritabanı / ağ yok): çoklu ve karma toplama (sonuclar/coklu.mjs: sayılar ve
// kovalar toplanır, oran toplamdan; önceki eşit dönem; sağlık sıralaması; hata sınıfı dağılımı; bağlantılı sorunların tek aksiyonda
// birleşmesi) ve bağlantılı sorun örtüşmesi (sonuclar/sorun-modeli.mjs > baglantiliSorunlar, Jaccard).
import { expect, test } from '@playwright/test';
import {
  ROZET_SIRASI, aksiyonlariBirlestir, birlesikOzet, kovalariBirlestir, saglikSiralamasi, sayilariBirlestir, sinifDagilimi, sonucAdedi, sorunSayimi
} from '../../scripts/platform/sonuclar/coklu.mjs';
import { BAGLANTI_ESIKLERI, baglantiliSorunlar } from '../../scripts/platform/sonuclar/sorun-modeli.mjs';
import { basariYuzdesi } from '../../scripts/platform/sonuclar/hesaplama.mjs';

const ESIK = { yesil: 90, sari: 75 };

test.describe('Toplama', () => {
  test('sayılar toplanır; eksik alan 0; durdurulan başarı paydasına girmez', () => {
    const t = sayilariBirlestir([{ basarili: 8, basarisiz: 1, atlanan: 1 }, { basarili: 2, hata: 1, durduruldu: 4 }, {}]);
    expect(t).toEqual({ basarili: 10, basarisiz: 1, atlanan: 1, hata: 1, durduruldu: 4 });
    expect(sonucAdedi(t)).toBe(13);
    expect(sayilariBirlestir([])).toEqual({ basarili: 0, basarisiz: 0, atlanan: 0, hata: 0, durduruldu: 0 });
  });

  test('birleşik oran toplamdan hesaplanır (oranların ortalaması değil) ve Sonuçlar formülüyle aynıdır', () => {
    // A: 9/10 = %90, B: 1/2 = %50 → ortalama %70 olurdu; doğrusu 10/12 = %83,3.
    const o = birlesikOzet([{ basarili: 9, basarisiz: 1 }, { basarili: 1, basarisiz: 1 }], [{ basarili: 5, basarisiz: 5 }]);
    expect(o.basari).toBeCloseTo((10 / 12) * 100, 10);
    expect(o.basari).toBe(basariYuzdesi(o.sayilar));
    expect(o).toMatchObject({ adet: 12, oncekiAdet: 10, oncekiBasari: 50, oncekiVar: true });
    expect(o.fark).toBeCloseTo((10 / 12) * 100 - 50, 10);
  });

  test('önceki dönem yoksa önceki oran ve fark null; bu dönem boşsa oran null', () => {
    expect(birlesikOzet([{ basarili: 3 }], [{}, { durduruldu: 2 }])).toMatchObject({ basari: 100, oncekiBasari: null, oncekiAdet: null, fark: null, oncekiVar: false });
    expect(birlesikOzet([{}], [{ basarili: 1 }])).toMatchObject({ basari: null, oncekiBasari: 100, fark: null });
  });

  test('kovalar indeks bazında toplanır; kısa seri eksik kova 0 sayılır', () => {
    const k = kovalariBirlestir([[{ basarili: 2, basarisiz: 1 }, { basarili: 1 }], [{ basarili: 1, hata: 1 }]], 3);
    expect(k).toHaveLength(3);
    expect(k[0]).toMatchObject({ basarili: 3, basarisiz: 1, hata: 1, adet: 5, kalan: 2, oran: 60 });
    expect(k[1]).toMatchObject({ adet: 1, kalan: 0, oran: 100 });
    expect(k[2]).toMatchObject({ adet: 0, oran: null });
  });
});

test.describe('Sağlık sıralaması', () => {
  const oge = (ad: string, basari: number | null, p1 = 0, kotulesen = 0, acikSorun = 0) => ({ ad, basari, p1, kotulesen, acikSorun });

  test('rozet önce (Kritik → Dikkat → Sağlıklı), sonra düşük başarı; sonucu olmayan sonda; sıra 1\'den', () => {
    const s = saglikSiralamasi([oge('A', 95), oge('B', 70), oge('C', 85), oge('D', null), oge('E', 92, 1), oge('F', 99, 3)], ESIK);
    expect(s.map((x) => [x.sira, x.ad, x.rozet.durum])).toEqual([
      [1, 'B', 'kritik'], [2, 'F', 'kritik'], [3, 'C', 'dikkat'], [4, 'E', 'dikkat'], [5, 'A', 'saglikli'], [6, 'D', 'dikkat']
    ]);
    expect(ROZET_SIRASI.kritik).toBeLessThan(ROZET_SIRASI.dikkat);
  });

  test('eşit başarıda P1, sonra kötüleşen, sonra açık sorun, sonra ad', () => {
    const s = saglikSiralamasi([oge('Z', 80, 0, 0, 1), oge('Y', 80, 0, 2, 2), oge('X', 80, 1, 0, 0), oge('W', 80, 0, 0, 1)], ESIK);
    expect(s.map((x) => x.ad)).toEqual(['X', 'Y', 'W', 'Z']);
  });

  test('öğe başına sorun sayımı: çözülen / doğrulanamayan açık sayılmaz', () => {
    expect(sorunSayimi([
      { durum: 'yeni', bant: 'P1' }, { durum: 'artan', bant: 'P2' }, { durum: 'suregelen', bant: 'P1' }, { durum: 'cozulen', bant: 'P3' }, { durum: 'dogrulanamadi', bant: 'P1' }
    ])).toEqual({ acikSorun: 3, kotulesen: 2, p1: 2 });
  });
});

test('hata sınıfı dağılımı: öğe başına bu dönemin başarısız sonuçları sınıfa göre (bilinmeyen sınıf uygulama)', () => {
  const d = sinifDagilimi([
    { ogeId: 'e1', sinif: 'ortam', n: 3 }, { ogeId: 'e1', sinif: 'uygulama', n: 2 }, { ogeId: 'e1', sinif: 'bakim', n: 0 },
    { ogeId: 's1', sinif: 'tuhaf', n: 1 }, { ogeId: 'baska', sinif: 'veri', n: 9 }
  ], [{ id: 'e1', ad: 'Ekran', tur: 'ekran' }, { id: 's1', ad: 'Servis', tur: 'servis' }, { id: 'bos', ad: 'Boş', tur: 'ekran' }]);
  expect(d[0]).toMatchObject({ id: 'e1', toplam: 5, sayilar: { ortam: 3, uygulama: 2, bakim: 0, veri: 0, kararsiz: 0 } });
  expect(d[1]).toMatchObject({ id: 's1', tur: 'servis', toplam: 1, sayilar: { uygulama: 1 } });
  expect(d[2].toplam).toBe(0);
});

test.describe('Bağlantılı sorunlar', () => {
  const s = (imza: string, seri: number[], ek: Partial<{ puan: number; durum: string }> = {}) => ({
    imza, seri, n: seri.reduce((a, b) => a + b, 0), puan: ek.puan ?? 30, durum: ek.durum ?? 'yeni', baslik: imza, nerede: `yer ${imza}`
  });

  test('Jaccard ≥ 0,6 ve ≥ 2 ortak kova; en yüksek örtüşme önce; bu dönemde görülmeyen eşlenmez', () => {
    const e1 = s('e1', [0, 2, 1, 0, 0]); // {1,2}
    const e2 = s('e2', [1, 1, 1, 0, 0]); // {0,1,2}
    const e3 = s('e3', [0, 0, 0, 0, 0]); // bu dönemde yok
    const e4 = s('e4', [0, 0, 0, 1, 0]); // {3} — tek ortak kova
    const s1 = s('s1', [0, 1, 3, 0, 0]); // {1,2}
    const s2 = s('s2', [0, 0, 0, 1, 1]); // {3,4}
    const c = baglantiliSorunlar([e1, e2, e3, e4], [s1, s2]);
    expect(c.map((x) => [x.ekran.imza, x.servis.imza, x.ortak, x.birlesim])).toEqual([['e1', 's1', 2, 2], ['e2', 's1', 2, 3]]);
    expect(c[0].jaccard).toBe(1);
    expect(c[1].jaccard).toBeCloseTo(2 / 3, 10);
    // Eşik değiştirilebilir: %70'te ikinci çift düşer.
    expect(baglantiliSorunlar([e1, e2], [s1], { ...BAGLANTI_ESIKLERI, jaccard: 0.7 })).toHaveLength(1);
    // Sınır: tam 0,6 dahil (3 / 5).
    expect(baglantiliSorunlar([s('a', [1, 1, 1, 1, 0])], [s('b', [0, 1, 1, 1, 1])])[0].jaccard).toBe(0.6);
  });

  test('tek aksiyonda birleşme: puanı düşük olan listeden çıkar; açık olmayan ya da zaten birleşen çift atlanır', () => {
    const e1 = s('e1', [1, 1], { puan: 50 });
    const s1 = s('s1', [1, 1], { puan: 40 });
    const s2 = s('s2', [1, 1], { puan: 70 });
    const e2 = s('e2', [1, 1], { puan: 20, durum: 'cozulen' });
    const b = aksiyonlariBirlestir([{ ekran: e1, servis: s1, jaccard: 1 }, { ekran: e1, servis: s2, jaccard: 0.9 }, { ekran: e2, servis: s2, jaccard: 1 }]);
    expect([...b.haric]).toEqual(['s1']);
    expect(b.notlar.get('e1')).toBe('s1 — yer s1');
    expect(b.notlar.has('s2')).toBe(false);
    // Servis puanı yüksekse servis kalır.
    const b2 = aksiyonlariBirlestir([{ ekran: s('x', [1, 1], { puan: 10 }), servis: s('y', [1, 1], { puan: 90 }), jaccard: 1 }]);
    expect([...b2.haric]).toEqual(['x']);
    expect(b2.notlar.get('y')).toBe('x — yer x');
  });
});
