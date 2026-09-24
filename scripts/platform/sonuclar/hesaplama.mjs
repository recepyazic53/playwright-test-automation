// SONUÇ HESAPLAMA (genel, saf fonksiyonlar): üst kartlar, önceki koşuya göre fark ve trend.
// Kurallar eski görünümdeki (scripts/rapor/veri-kosular.mjs > kartlariHesapla) ile AYNIDIR;
// Allure kaldırılınca mantık buraya taşındı ve girdi, veritabanından okunan genel bir koşu
// listesine dönüştü:
//   kosu = { id, z (bitiş ms), tur: 'tam' | 'tekil', kapsam: 'Genel' | ürün adı | null,
//            urunler: { [urunAnahtari]: { basarili, basarisiz, atlanan, durduruldu } } }
// Koşu türleri: 'tam' = koşu (platformdaki "Koşuyu başlat" ya da her terminal/CI koşusu);
// 'tekil' = diğer her şey (tek ▷, Seçilenleri çalıştır). Kartlar ve trend YALNIZCA 'tam'
// koşulara bakar — tekil koşular koşu geçmişinde (rozetle) ve hata kalıplarında sayılır.
//  - Ürün sayfası (P): P'nin sonucunu İÇEREN en son tam koşudaki yalnızca P'nin sayıları;
//    "önceki" = P'yi içeren bir önceki tam koşu.
//  - Genel: GÜNCEL DURUM = her ürünün kendi son tam koşusundaki sayıların toplamı; "önceki" = her
//    ürünün bir önceki koşusunun toplamı (önceki koşusu olmayan ürün kendi son koşusuyla sayılır);
//    hiçbir ürünün önceki koşusu yoksa fark gösterilmez.

/** @typedef {{ basarili: number; basarisiz: number; atlanan: number; durduruldu: number }} Sayilar */
/** @typedef {{ id: string; z: number; tur: string; kapsam: string | null; urunler: Record<string, Sayilar> }} HesapKosusu */

export const BOS_SAYILAR = Object.freeze({ basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 });

/** @param {Partial<Sayilar> | null | undefined} s */
export function durumToplami(s) {
  return s ? (s.basarili ?? 0) + (s.basarisiz ?? 0) + (s.atlanan ?? 0) + (s.durduruldu ?? 0) : 0;
}

/** @param {Array<Partial<Sayilar>>} liste @returns {Sayilar} */
export function sayilariTopla(liste) {
  const toplam = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
  for (const s of liste) {
    toplam.basarili += s.basarili ?? 0;
    toplam.basarisiz += s.basarisiz ?? 0;
    toplam.atlanan += s.atlanan ?? 0;
    toplam.durduruldu += s.durduruldu ?? 0;
  }
  return toplam;
}

/** Başarı oranı (yüzde, tam sayı); "durduruldu" paydaya girmez. Hiç sonuç yoksa null. @param {Sayilar} s */
export function basariOrani(s) {
  const payda = s.basarili + s.basarisiz + s.atlanan;
  return payda > 0 ? Math.round((s.basarili / payda) * 100) : null;
}

/** @param {HesapKosusu} kosu @param {string} urun */
function urunKosuOzeti(kosu, urun) {
  const s = kosu.urunler[urun];
  return { kosuId: kosu.id, z: kosu.z, kapsam: kosu.kapsam, ...sayilariTopla([s]) };
}

/**
 * Üst kartlar. kosular: kronolojik (en eski önce) — tekil koşular varsa yok sayılır.
 * @param {HesapKosusu[]} kosular
 */
export function kartlariHesapla(kosular) {
  const tamKosular = kosular.filter((k) => k.tur === 'tam');
  /** @type {Record<string, HesapKosusu[]>} */
  const urunTamKosulari = {};
  for (const kosu of tamKosular) {
    for (const [urun, sayilar] of Object.entries(kosu.urunler)) {
      if (durumToplami(sayilar) > 0) (urunTamKosulari[urun] ??= []).push(kosu);
    }
  }
  /** @type {Record<string, { son: ReturnType<typeof urunKosuOzeti>; onceki: ReturnType<typeof urunKosuOzeti> | null }>} */
  const urunler = {};
  for (const [urun, liste] of Object.entries(urunTamKosulari)) {
    urunler[urun] = {
      son: urunKosuOzeti(liste[liste.length - 1], urun),
      onceki: liste.length > 1 ? urunKosuOzeti(liste[liste.length - 2], urun) : null
    };
  }
  const kartListesi = Object.values(urunler);
  const genel = kartListesi.length
    ? {
        son: sayilariTopla(kartListesi.map((k) => k.son)),
        onceki: kartListesi.some((k) => k.onceki) ? sayilariTopla(kartListesi.map((k) => k.onceki ?? k.son)) : null,
        enYeniZ: Math.max(...kartListesi.map((k) => k.son.z)),
        enEskiZ: Math.min(...kartListesi.map((k) => k.son.z)),
        urunSayisi: kartListesi.length
      }
    : null;
  return { genel, urunler };
}

/**
 * Trend noktaları (kronolojik). urun verilmezse Genel trendi: yalnızca 'Genel' kapsamlı tam
 * koşuların toplamı; verilirse o ürünü içeren tam koşulardaki yalnızca o ürünün sayıları.
 * @param {HesapKosusu[]} kosular @param {string | null} urun
 */
export function trendHesapla(kosular, urun) {
  return kosular
    .filter((k) => k.tur === 'tam')
    .flatMap((k) => {
      if (urun) {
        const s = k.urunler[urun];
        return s && durumToplami(s) > 0 ? [{ kosuId: k.id, z: k.z, kapsam: k.kapsam, ...sayilariTopla([s]) }] : [];
      }
      if ((k.kapsam ?? 'Genel') !== 'Genel') return [];
      return [{ kosuId: k.id, z: k.z, kapsam: 'Genel', ...sayilariTopla(Object.values(k.urunler)) }];
    });
}
