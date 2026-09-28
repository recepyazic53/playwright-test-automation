// KORUMA TESTLERİ — PDF raporunun SAF hesap modülleri (veritabanı / ağ yok): dönem ve önceki eşit dönem (sonuclar/donem.mjs),
// sorun modeli durum kuralları ve kararlılık (sonuclar/sorun-modeli.mjs), öncelik puanı / bant / rozet (sonuclar/oncelik.mjs),
// yüzdelikler ve yavaşlama (sonuclar/yuzdelik.mjs), başarı oranı (sonuclar/hesaplama.mjs — Sonuçlar ekranıyla aynı formül).
import { expect, test } from '@playwright/test';
import { DonemHatasi, donemHesapla, donemParcasi, donemiBuguneKaydir, gunAnahtari, kovaIndeksi } from '../../scripts/platform/sonuclar/donem.mjs';
import { yavasladiMi, yuzdelik, yuzdelikler } from '../../scripts/platform/sonuclar/yuzdelik.mjs';
import { aksiyonListesi, bant, durumRozeti, oncelikPuani, sahipOnerisi } from '../../scripts/platform/sonuclar/oncelik.mjs';
import { imzaKimligi, kararlilikHesapla, sinifTahmini, sorunlariHesapla, type Gozlem } from '../../scripts/platform/sonuclar/sorun-modeli.mjs';
import { KATEGORI } from '../../scripts/platform/sonuclar/siniflandirma.mjs';
import { basariOrani, basariYuzdesi } from '../../scripts/platform/sonuclar/hesaplama.mjs';

const SIMDI = new Date(2026, 8, 28, 15, 30);

test.describe('Dönem', () => {
  test('son 14 gün: bugün dahil, yerel 00:00 sınırı; önceki eşit dönem; günlük kovalar', () => {
    const d = donemHesapla({ tur: 'son14' }, SIMDI);
    expect(d.gun).toBe(14);
    expect(d.bas.getTime()).toBe(new Date(2026, 8, 15).getTime());
    expect(d.bit.getTime()).toBe(new Date(2026, 8, 29).getTime());
    expect(d.onceki.bas.getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(d.onceki.bit.getTime()).toBe(d.bas.getTime());
    expect(d.geriBakisBas.getTime()).toBe(new Date(2026, 5, 3).getTime()); // D′ başından 90 gün önce
    expect(d.etiket).toBe('15.09.2026 – 28.09.2026');
    expect(d.oncekiEtiket).toBe('01.09.2026 – 14.09.2026');
    expect(d.kirilim).toBe('gunluk');
    expect(d.kovalar).toHaveLength(14);
    expect(d.kovalar[0].etiket).toBe('15.09');
    expect(d.oncekiKovalar).toHaveLength(14);
    expect(donemHesapla({ tur: 'son7' }, SIMDI).bas.getTime()).toBe(new Date(2026, 8, 22).getTime());
    expect(donemHesapla({ tur: 'son30' }, SIMDI).gun).toBe(30);
  });

  test('özel aralık: iki gün dahil, ay sonu, haftalık kırılım (Pazartesi), hatalı girdiler', () => {
    const subat = donemHesapla({ tur: 'ozel', baslangic: '2026-02-27', bitis: '2026-03-02' }, SIMDI);
    expect(subat.gun).toBe(4); // 27, 28 Şubat + 1, 2 Mart
    expect(subat.onceki.bas.getTime()).toBe(new Date(2026, 1, 23).getTime());
    const uzun = donemHesapla({ tur: 'ozel', baslangic: '2026-09-01', bitis: '2026-10-05' }, SIMDI);
    expect(uzun.gun).toBe(35);
    expect(uzun.kirilim).toBe('haftalik');
    // 01.09.2026 Salı: ilk kova Pazartesi 07.09'a kadar kısmi, sonrakiler Pazartesi başlar.
    expect(uzun.kovalar.map((k) => k.etiket).slice(0, 3)).toEqual(['01.09', '07.09', '14.09']);
    expect(uzun.kovalar[uzun.kovalar.length - 1].bit.getTime()).toBe(uzun.bit.getTime());
    expect(() => donemHesapla({ tur: 'ozel', baslangic: '2026-09-10', bitis: '2026-09-01' }, SIMDI)).toThrow(DonemHatasi);
    expect(() => donemHesapla({ tur: 'ozel', baslangic: '2026-02-30', bitis: '2026-03-01' }, SIMDI)).toThrow('geçerli bir tarih');
    expect(() => donemHesapla({ tur: 'ozel', baslangic: '2024-01-01', bitis: '2026-01-01' }, SIMDI)).toThrow('en çok');
    expect(() => donemHesapla({ tur: 'son99' }, SIMDI)).toThrow(DonemHatasi);
  });

  test('kova indeksi, dönem parçası ve bugüne kaydırma', () => {
    const d = donemHesapla({ tur: 'son14' }, SIMDI);
    expect(kovaIndeksi(d.kovalar, new Date(2026, 8, 15, 0, 0).getTime())).toBe(0);
    expect(kovaIndeksi(d.kovalar, new Date(2026, 8, 28, 23, 59).getTime())).toBe(13);
    expect(kovaIndeksi(d.kovalar, new Date(2026, 8, 29).getTime())).toBe(-1);
    expect(donemParcasi(d, new Date(2026, 8, 20).getTime())).toBe('D');
    expect(donemParcasi(d, new Date(2026, 8, 2).getTime())).toBe('O');
    expect(donemParcasi(d, new Date(2026, 6, 20).getTime())).toBe('G');
    expect(donemParcasi(d, new Date(2026, 0, 1).getTime())).toBeNull();
    expect(donemiBuguneKaydir({ tur: 'son7' }, SIMDI)).toEqual({ tur: 'son7' });
    expect(donemiBuguneKaydir({ tur: 'ozel', baslangic: '2026-08-01', bitis: '2026-08-10' }, SIMDI)).toEqual({ tur: 'ozel', baslangic: '2026-09-19', bitis: '2026-09-28' });
    expect(gunAnahtari(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

test.describe('Yüzdelik ve yavaşlama', () => {
  test('en yakın sıra: küçük n, eşit değerler, p99 yalnız 20+ ölçümde', () => {
    expect(yuzdelik([], 95)).toBeNull();
    expect(yuzdelikler([])).toEqual({ n: 0, p50: null, p95: null, p99: null, ortalama: null });
    expect(yuzdelikler([500])).toMatchObject({ n: 1, p50: 500, p95: 500, p99: null });
    expect(yuzdelikler([7, 7, 7, 7])).toMatchObject({ p50: 7, p95: 7 });
    const yuz = Array.from({ length: 100 }, (_, i) => 100 - i); // sırasız verilir
    expect(yuzdelikler(yuz)).toMatchObject({ n: 100, p50: 50, p95: 95, p99: 99, ortalama: 50.5 });
    expect(yuzdelik([1, 2, 3, 4], 50)).toBe(2); // ceil(0,5 × 4) − 1 = 1
    expect(yuzdelik([1, 2, 3, 4], 95)).toBe(4);
    expect(yuzdelikler([1, 'x', null, Number.NaN, 3])).toMatchObject({ n: 2 });
  });

  test('yavaşlama: p95 ≥ 1,2 × önceki ve ölçüm ≥ 20', () => {
    expect(yavasladiMi(1200, 1000, 20)).toBe(true);
    expect(yavasladiMi(1190, 1000, 20)).toBe(false);
    expect(yavasladiMi(2000, 1000, 19)).toBe(false);
    expect(yavasladiMi(2000, null, 50)).toBe(false);
  });
});

test.describe('Öncelik, bant ve rozet', () => {
  test('tasarım örneği: uygulama, 4 senaryo, %40, yeni, kritik, 10 gün → 92 (P1); sınıf katsayısı ve sınırlar', () => {
    expect(oncelikPuani({ sinif: 'uygulama', durum: 'yeni', senaryo: 4, oran: 0.4, kritiklik: 1, acikGun: 10 })).toBe(92);
    // Kritiklik verisi yok (0): aynı sorun 77.
    expect(oncelikPuani({ sinif: 'uygulama', durum: 'yeni', senaryo: 4, oran: 0.4, kritiklik: 0, acikGun: 10 })).toBe(77);
    // Sınıf katsayısı: kararsız 0,5 → yarısı.
    expect(oncelikPuani({ sinif: 'kararsiz', durum: 'yeni', senaryo: 3, oran: 0.4, acikGun: 14 })).toBe(40);
    expect(oncelikPuani({ sinif: 'uygulama', durum: 'yeni', senaryo: 99, oran: 5, kritiklik: 9, acikGun: 999 })).toBe(100);
    expect(oncelikPuani({ sinif: 'ortam', durum: 'azalan', senaryo: 1, oran: 0.1, acikGun: 1 })).toBe(12);
    expect([bant(60), bant(59), bant(35), bant(34)]).toEqual(['P1', 'P2', 'P2', 'P3']);
    expect(sahipOnerisi('veri')).toBe('Test verisi sorumlusu');
    expect(sahipOnerisi('bilinmeyen')).toBe('Uygulama ekibi');
    const liste = aksiyonListesi([
      { durum: 'cozulen', puan: 99 }, { durum: 'yeni', puan: 40 }, { durum: 'artan', puan: 70 }, { durum: 'dogrulanamadi', puan: 90 }, { durum: 'azalan', puan: 10 }
    ], 2);
    expect(liste.map((x) => x.puan)).toEqual([70, 40]);
  });

  test('durum rozeti: Sağlıklı / Dikkat / Kritik kuralı', () => {
    const esikler = { yesil: 90, sari: 75 };
    expect(durumRozeti({ basari: 95, p1: 0, esikler }).durum).toBe('saglikli');
    expect(durumRozeti({ basari: 90, p1: 0, esikler }).durum).toBe('saglikli');
    expect(durumRozeti({ basari: 95, p1: 1, esikler }).durum).toBe('dikkat');
    expect(durumRozeti({ basari: 80, p1: 0, esikler }).durum).toBe('dikkat');
    expect(durumRozeti({ basari: 74.9, p1: 0, esikler }).durum).toBe('kritik');
    expect(durumRozeti({ basari: 99, p1: 3, esikler }).durum).toBe('kritik');
    expect(durumRozeti({ basari: 99, p1: 0, esikler, kritikKaldi: true }).durum).toBe('kritik');
    expect(durumRozeti({ basari: null, p1: 0, esikler }).durum).toBe('dikkat');
    expect(durumRozeti({ basari: 80, p1: 1, esikler }).gerekce).toContain('1 P1');
  });

  test('başarı oranı: Sonuçlar ekranıyla aynı formül (durdurulan paydaya girmez; servis "hata" paydada)', () => {
    expect(basariYuzdesi({ basarili: 3, basarisiz: 1, atlanan: 1, durduruldu: 5 })).toBe(60);
    expect(basariOrani({ basarili: 2, basarisiz: 1, atlanan: 0, durduruldu: 0 })).toBe(67);
    expect(basariYuzdesi({ basarili: 2, basarisiz: 1, atlanan: 0, durduruldu: 0 })).toBeCloseTo(66.667, 2);
    expect(basariYuzdesi({ basarili: 8, basarisiz: 1, hata: 1 })).toBe(80);
    expect(basariYuzdesi({ basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 3 })).toBeNull();
  });
});

test.describe('Sorun modeli', () => {
  const donem = donemHesapla({ tur: 'son14' }, SIMDI);
  const gun = (tab: Date, i: number, saat = 9, dk = 0): number => new Date(tab.getFullYear(), tab.getMonth(), tab.getDate() + i, saat, dk).getTime();
  const D = (i: number, saat?: number, dk?: number): number => gun(donem.bas, i, saat, dk);
  const O = (i: number): number => gun(donem.onceki.bas, i);
  const G = (i: number): number => gun(donem.geriBakisBas, i);
  const kal = (zaman: number, senaryo = 's1', imza = 'i1'): Gozlem => ({ zaman, durum: 'basarisiz', senaryo, maruz: senaryo, ortam: 'o', imza: { parcalar: [imza], bilgi: {} } });
  const gec = (zaman: number, senaryo = 's1', ek: Partial<Gozlem> = {}): Gozlem => ({ zaman, durum: 'basarili', senaryo, maruz: senaryo, ortam: 'o', ...ek });
  const tekDurum = (g: Gozlem[]): string => {
    const s = sorunlariHesapla(g, donem, { simdi: SIMDI.getTime() });
    expect(s).toHaveLength(1);
    return s[0].durum;
  };
  /** n kalan + (maruz − n) geçen; her sonuç ayrı ortamda (aynı gün değişimi kararsızlık sayılmasın). */
  const donemdeki = (bas: (i: number) => number, maruz: number, n: number): Gozlem[] =>
    Array.from({ length: maruz }, (_, i) => ({ ...(i < n ? kal(bas(i % 14) + i * 60_000) : gec(bas(i % 14) + i * 60_000)), ortam: `o${i}` }));

  test('yeni, çözülen, doğrulanamadı', () => {
    expect(tekDurum([kal(D(1)), kal(D(2)), gec(D(3))])).toBe('yeni');
    expect(tekDurum([kal(O(1)), kal(O(2)), gec(D(1)), gec(D(2)), gec(D(3))])).toBe('cozulen');
    expect(tekDurum([kal(O(1)), kal(O(2)), gec(D(1)), gec(D(2))])).toBe('dogrulanamadi');
    // Yalnız geriye bakışta görülen imza rapora girmez.
    expect(sorunlariHesapla([kal(G(5)), gec(D(1))], donem)).toHaveLength(0);
  });

  test('tekrar eden: G\'de görülmüş, sonra ≥ 3 kez geçmiş, bu dönem geri gelmiş (yoksa süregelen)', () => {
    const cozulmus = [kal(G(10)), gec(G(11)), gec(G(12)), gec(G(13)), gec(O(3)), kal(D(4))];
    expect(tekDurum(cozulmus)).toBe('tekrar');
    const cozulmemis = [kal(G(10)), gec(G(11)), gec(G(12)), kal(D(4))];
    expect(tekDurum(cozulmemis)).toBe('suregelen');
  });

  test('artan / azalan / süregelen: oran eşiği ve adet farkı ≥ 2; maruziyete göre oran', () => {
    expect(tekDurum([...donemdeki(O, 10, 2), ...donemdeki(D, 10, 5)])).toBe('artan'); // %20 → %50, fark 3
    expect(tekDurum([...donemdeki(O, 10, 2), ...donemdeki(D, 10, 3)])).toBe('suregelen'); // oran 1,5× ama fark 1
    expect(tekDurum([...donemdeki(O, 10, 6), ...donemdeki(D, 10, 2)])).toBe('azalan'); // %60 → %20, fark 4
    expect(tekDurum([...donemdeki(O, 10, 3), ...donemdeki(D, 10, 2)])).toBe('suregelen'); // fark 1
    // Daha çok koşulan dönem haksız yere "artan" görünmez: 2/4 (%50) → 4/20 (%20).
    expect(tekDurum([...donemdeki(O, 4, 2), ...donemdeki(D, 20, 4)])).toBe('suregelen');
    const s = sorunlariHesapla([...donemdeki(O, 10, 2), ...donemdeki(D, 10, 5)], donem, { simdi: SIMDI.getTime() })[0];
    expect(s).toMatchObject({ n: 5, nOnceki: 2, maruz: 10, maruzOnceki: 10, oran: 0.5, oranOnceki: 0.2 });
    expect(s.seri.reduce((a, b) => a + b, 0)).toBe(5);
    expect(s.oncekiSeri.reduce((a, b) => a + b, 0)).toBe(2);
  });

  test('kararsız: aynı gün geçti↔kaldı değişimi ≥ %20 ve ≥ 5 koşu; başarısızlıkların ≥ %50\'si kararsız senaryodan', () => {
    const dizi = ['G', 'K', 'G', 'K', 'G', 'K'].map((x, i) => (x === 'K' ? kal(D(5, 10, i * 5), 'x') : gec(D(5, 10, i * 5), 'x')));
    const k = kararlilikHesapla(dizi).get('x');
    expect(k).toMatchObject({ kosu: 6, degisim: 5, oran: 1, durum: 'kararsiz' });
    expect(tekDurum(dizi)).toBe('kararsiz');
    // 4 koşu: oran yüksek ama koşu < 5 → izlenir (kararsız değil); tekrar denemesinde geçmek ek kanıttır.
    expect(kararlilikHesapla(dizi.slice(0, 4)).get('x')?.durum).toBe('izlenir');
    expect(kararlilikHesapla([gec(D(1), 'y', { deneme: 1 }), gec(D(2), 'y')]).get('y')).toMatchObject({ ekKanit: true, durum: 'izlenir' });
    // Farklı günlerdeki değişim kararsızlık sayılmaz (grup: senaryo + ortam + gün + sürüm).
    expect(kararlilikHesapla([kal(D(1), 'z'), gec(D(2), 'z'), kal(D(3), 'z'), gec(D(4), 'z'), kal(D(5), 'z')]).get('z')?.durum).toBe('kararli');
  });

  test('dönem içinde çözülüp geri gelen imza "tekrar eden" rozeti alır', () => {
    const s = sorunlariHesapla([kal(D(1)), gec(D(2)), gec(D(3)), gec(D(4)), kal(D(5))], donem, { simdi: SIMDI.getTime() })[0];
    expect(s.durum).toBe('yeni');
    expect(s.tekrarRozeti).toBe(true);
    expect(sorunlariHesapla([kal(D(1)), gec(D(2)), kal(D(5))], donem)[0].tekrarRozeti).toBe(false);
  });

  test('sınıf tahmini ve imza kimliği', () => {
    expect(sinifTahmini({ tur: 'ekran', kategori: KATEGORI.zamanAsimi }).sinif).toBe('ortam');
    expect(sinifTahmini({ tur: 'ekran', kategori: KATEGORI.secici }).sinif).toBe('bakim');
    expect(sinifTahmini({ tur: 'ekran', kategori: KATEGORI.dogrulama }).sinif).toBe('uygulama');
    expect(sinifTahmini({ tur: 'ekran', kategori: 'Kullanıcı kuralı' }).sinif).toBe('uygulama');
    expect(sinifTahmini({ tur: 'ekran', kategori: KATEGORI.dogrulama, durum: 'kararsiz' }).sinif).toBe('kararsiz');
    expect(sinifTahmini({ tur: 'servis', hataTuru: 'h5' }).sinif).toBe('ortam');
    expect(sinifTahmini({ tur: 'servis', hataTuru: 'zaman' }).sinif).toBe('ortam');
    expect(sinifTahmini({ tur: 'servis', hataTuru: 'kontrol' }).sinif).toBe('uygulama');
    expect(imzaKimligi(['a', 'b'])).toBe(imzaKimligi(['a', 'b']));
    expect(imzaKimligi(['a', 'b'])).not.toBe(imzaKimligi(['ab', '']));
    expect(imzaKimligi(['a'])).toMatch(/^[0-9a-f]{16}$/);
  });
});
