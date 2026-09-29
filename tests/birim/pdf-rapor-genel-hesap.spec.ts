// KORUMA TESTLERİ — PDF raporu A3: genel rapora özgü saf hesaplar (sonuclar/genel.mjs; veritabanı ve ağ YOK).
// Denetlenenler: takvimden beklenen tetikleme sayısı (günlük / haftalık / aralıklı, pencere sınırları), planlı koşu
// güvenilirliği (tamamlanan = tamamlandı + başarısız sonuçlu; kaçan; kural kaydından önceki zamanlar; devre dışı kural; 20 kayıtlık
// geçmişte pencerenin daraltılması), toplam güvenilirlik, kararsız listesi sırası, metot kapsamı, ortamlara göre oranlar.
import { expect, test } from '@playwright/test';
import {
  TAMAMLANAN_TETIKLEMELER, beklenenZamanlar, kararsizListesi, metotKapsami, ortamOranlari, pencereGuvenilirligi, toplamGuvenilirlik
} from '../../scripts/platform/sonuclar/genel.mjs';

const t = (gun: number, saat = 0, dk = 0): number => new Date(2026, 8, gun, saat, dk).getTime();
const tetikleme = (gun: number, durum: string, saat = 2) => ({ zaman: new Date(t(gun, saat)).toISOString(), durum });
const GUNLUK = { tur: 'gunluk', saat: '02:00' } as const;

test('beklenen zamanlar: günlük, haftalık, aralıklı; pencere [bas, bit)', () => {
  expect(beklenenZamanlar(GUNLUK, t(15), t(29))).toHaveLength(14);
  expect(beklenenZamanlar(GUNLUK, t(15, 3), t(29))).toHaveLength(13); // 15.09 02:00 pencereden önce
  expect(beklenenZamanlar(GUNLUK, t(15), t(28, 2))).toHaveLength(13); // 28.09 02:00 bit'e dahil değil
  // 2026-09-19 ve 26 Cumartesi (6).
  expect(beklenenZamanlar({ tur: 'haftalik', saat: '03:00', gunler: [6] }, t(15), t(29)).map((x) => new Date(x).getDate())).toEqual([19, 26]);
  expect(beklenenZamanlar({ tur: 'aralik', saatAraligi: 6, baslangic: '01:00' }, t(15), t(16))).toHaveLength(4);
  expect(beklenenZamanlar(GUNLUK, t(20), t(20))).toEqual([]);
});

test('pencere güvenilirliği: tamamlanan, kaçan, kayıt öncesi zamanlar, devre dışı kural', () => {
  expect(TAMAMLANAN_TETIKLEMELER).toEqual(['tamamlandi', 'basarisiz']);
  const kural = { zaman: GUNLUK, etkin: true, olusturulma: new Date(t(1)).toISOString() };
  const gecmis = [tetikleme(15, 'tamamlandi'), tetikleme(16, 'basarisiz'), tetikleme(17, 'atlandi'), tetikleme(18, 'yarida'), tetikleme(19, 'hata'), tetikleme(20, 'calisiyor'),
    tetikleme(10, 'tamamlandi')];
  const p = { bas: t(15), bit: t(22), simdi: t(28, 12), gecmisSiniri: 20 };
  const s = pencereGuvenilirligi(kural, gecmis, p);
  // 15–21.09 = 7 beklenen; 6 kayıt (biri çalışıyor: kaçan sayılmaz ama tamamlanmış da sayılmaz); 21.09 kaçan.
  expect(s).toMatchObject({ beklenen: 7, kayit: 6, tamamlandi: 2, basarisizSonuclu: 1, atlandi: 1, yarida: 1, hata: 1, kacan: 2, kisitli: false });
  expect(s.guvenilirlik).toBeCloseTo((2 / 7) * 100, 5);
  // Kural 18.09 12:00'de kaydedildi: öncesi beklenmez (19–21.09; kayıtlar 19 ve 20).
  expect(pencereGuvenilirligi({ ...kural, olusturulma: new Date(t(18, 12)).toISOString() }, gecmis, p)).toMatchObject({ beklenen: 3, kayit: 2 });
  // Pencere "şimdi"den sonrasına uzanmaz.
  expect(pencereGuvenilirligi(kural, [], { ...p, simdi: t(17, 12) })).toMatchObject({ beklenen: 3, kacan: 3, guvenilirlik: 0 });
  // Devre dışı kural: beklenen / kaçan / güvenilirlik yok; geçmiş yine sayılır.
  expect(pencereGuvenilirligi({ ...kural, etkin: false }, gecmis, p)).toMatchObject({ beklenen: null, kacan: null, guvenilirlik: null, tamamlandi: 2 });
  // Hiç beklenen yoksa güvenilirlik yok (bölme yok).
  expect(pencereGuvenilirligi(kural, [], { ...p, bas: t(20, 3), bit: t(21) }).guvenilirlik).toBeNull();
});

test('pencere güvenilirliği: 20 kayıtlık geçmiş dolu ve pencereden yeniyse hesap en eski kayıttan başlar (kısıtlı)', () => {
  const kural = { zaman: GUNLUK, etkin: true, olusturulma: new Date(t(1)).toISOString() };
  const gecmis = Array.from({ length: 20 }, (_, i) => tetikleme(7 + i, 'tamamlandi')); // 07–26.09
  const onceki = pencereGuvenilirligi(kural, gecmis, { bas: t(1), bit: t(15), simdi: t(28, 12), gecmisSiniri: 20 });
  expect(onceki).toMatchObject({ kisitli: true, beklenen: 8, tamamlandi: 8, guvenilirlik: 100, bas: t(7, 2) });
  const simdi = pencereGuvenilirligi(kural, gecmis, { bas: t(15), bit: t(29), simdi: t(28, 12), gecmisSiniri: 20 });
  expect(simdi).toMatchObject({ kisitli: false, beklenen: 14, tamamlandi: 12, kacan: 2 });
  // Sınır dolmadıysa pencere daraltılmaz (eski zamanlar "kaçan" sayılır).
  expect(pencereGuvenilirligi(kural, gecmis.slice(0, 19), { bas: t(1), bit: t(15), simdi: t(28, 12), gecmisSiniri: 20 })).toMatchObject({ kisitli: false, beklenen: 14 });
});

test('toplam güvenilirlik: devre dışı kural (beklenen null) toplama girmez', () => {
  expect(toplamGuvenilirlik([{ beklenen: 14, tamamlandi: 10 }, { beklenen: null, tamamlandi: 3 }, { beklenen: 6, tamamlandi: 6 }])).toEqual({ beklenen: 20, tamamlandi: 16, guvenilirlik: 80 });
  expect(toplamGuvenilirlik([])).toEqual({ beklenen: 0, tamamlandi: 0, guvenilirlik: null });
});

test('kararsız listesi: önce kararsız, sonra yüksek oran; kararlılar atılır; sınır', () => {
  const l = [
    { ad: 'A', oran: 0.1, durum: 'izlenir', kosu: 10 }, { ad: 'B', oran: 0.3, durum: 'kararsiz', kosu: 6 }, { ad: 'C', oran: 0.9, durum: 'izlenir', kosu: 3 },
    { ad: 'D', oran: 0, durum: 'kararli', kosu: 20 }, { ad: 'E', oran: 0.5, durum: 'kararsiz', kosu: 8 }
  ];
  expect(kararsizListesi(l, 10).map((x) => x.ad)).toEqual(['E', 'B', 'C', 'A']);
  expect(kararsizListesi(l, 2).map((x) => x.ad)).toEqual(['E', 'B']);
});

test('metot kapsamı: operasyon adı ya da REST "YÖNTEM yol" ile eşleşir; sözleşme yoksa ölçülmez', () => {
  expect(metotKapsami(undefined, [{ operasyon: 'x', metot: 'x' }])).toBeNull();
  expect(metotKapsami([], [])).toBeNull();
  const k = metotKapsami(
    [{ ad: 'KayitAl' }, { ad: 'KayitListele' }, { ad: 'kayitOlustur', metot: 'POST', yol: '/kayit?x=1' }, { ad: 'sil', metot: 'DELETE', yol: '/kayit/{id}' }],
    [{ operasyon: 'KayitAl', metot: 'KayitAl' }, { operasyon: 'baska', metot: 'POST /kayit' }]
  );
  expect(k).toEqual({ toplam: 4, senaryolu: 2, eksik: ['KayitListele', 'DELETE /kayit/{id}'] });
});

test('ortamlara göre: öğe başına sayılar ortam başına toplanır; oran toplamdan', () => {
  const r = ortamOranlari([{ id: 'a', ad: 'A', riskli: false }, { id: 'b', ad: 'B', riskli: true }, { id: 'c', ad: 'C', riskli: false }],
    [{ a: { basarili: 8, basarisiz: 1, atlanan: 1 } }, { a: { basarili: 5 }, b: { basarili: 2 } }],
    [{ a: { basarili: 9, hata: 1 } }]);
  expect(r).toEqual([
    { id: 'a', ad: 'A', riskli: false, test: 15, ekranBasari: (13 / 15) * 100, cagri: 10, servisBasari: 90 },
    { id: 'b', ad: 'B', riskli: true, test: 2, ekranBasari: 100, cagri: 0, servisBasari: null },
    { id: 'c', ad: 'C', riskli: false, test: 0, ekranBasari: null, cagri: 0, servisBasari: null }
  ]);
});
