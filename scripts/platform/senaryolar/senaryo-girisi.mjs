// SENARYONUN GİRİŞ SEÇİMİ (genel, saf) — senaryo içeriğinde isteğe bağlı "giris": { kip, profil? }.
//   kip 'ortam'    ortamın girişiyle (VARSAYILAN; bugünkü davranış): kayıtlı oturum geçerliyse kullanılır, değilse ortamın
//                  giriş tarifiyle girilir.
//       'girissiz' giriş yapılmaz (ekran girişsiz açılır; bağlam değiştirme de yapılmaz).
//       'temiz'    kayıtlı oturum KULLANILMAZ: çerezler temizlenip ortamın tarifiyle yeniden girilir.
//   profil         giriş profilinin ADI (Ayarlar > Giriş profilleri); yoksa ortamın varsayılan profili. Varsayılan dışı bir
//                  profil seçilince kayıtlı (varsayılan profilin) oturumu kullanılmaz: temiz girişle o profille girilir.
// Varsayılan (kip 'ortam', profil yok) içeriğe YAZILMAZ: eski senaryolar aynen kalır. Ekran modeli girişsizse
// ("girisGerekmez": true) seçim ne olursa olsun etkin giriş 'girissiz'dir (arayüzde kilitli).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirir). Tipler: senaryo-girisi.d.mts.

export const GIRIS_KIPLERI = Object.freeze(['ortam', 'girissiz', 'temiz']);
export const GIRIS_KIP_ETIKETLERI = Object.freeze({
  ortam: 'Ortamın girişiyle (varsayılan)', girissiz: 'Girişsiz', temiz: 'Temiz oturumla yeniden giriş (kayıtlı oturumu kullanma)'
});
const PROFIL_EN_UZUN = 120;

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * Formdan / API'den gelen seçimi doğrular. Varsayılan seçim → giris: null (içeriğe yazılmaz).
 * @param {unknown} ham @returns {{ giris: { kip: 'ortam' | 'girissiz' | 'temiz'; profil: string | null } | null; hatalar: string[] }}
 */
export function senaryoGirisiniAyikla(ham) {
  if (ham === undefined || ham === null) return { giris: null, hatalar: [] };
  if (!nesneMi(ham)) return { giris: null, hatalar: ['Giriş seçimi bir nesne olmalı.'] };
  const kip = ham.kip === undefined || ham.kip === null || ham.kip === '' ? 'ortam' : ham.kip;
  if (!GIRIS_KIPLERI.includes(kip)) return { giris: null, hatalar: [`Giriş seçimi yalnızca ${GIRIS_KIPLERI.join(', ')} olabilir.`] };
  const profilHam = typeof ham.profil === 'string' ? ham.profil.trim() : '';
  if (profilHam.length > PROFIL_EN_UZUN) return { giris: null, hatalar: ['Giriş profili adı çok uzun.'] };
  const profil = kip === 'girissiz' || !profilHam ? null : profilHam;
  if (kip === 'ortam' && !profil) return { giris: null, hatalar: [] };
  return { giris: { kip: /** @type {'ortam' | 'girissiz' | 'temiz'} */ (kip), profil }, hatalar: [] };
}

/** Senaryo içeriğindeki seçim (yoksa / bozuksa null = varsayılan). @param {unknown} icerik */
export function senaryoGirisi(icerik) {
  if (!nesneMi(icerik)) return null;
  const { giris, hatalar } = senaryoGirisiniAyikla(icerik.giris);
  return hatalar.length ? null : giris;
}

/**
 * Koşuda etkin giriş: modeli girişsizse her zaman 'girissiz'; değilse senaryonun seçimi (yoksa 'ortam').
 * @param {{ kip: string; profil: string | null } | null | undefined} giris @param {unknown} model
 * @returns {{ kip: 'ortam' | 'girissiz' | 'temiz'; profil: string | null }}
 */
export function etkinSenaryoGirisi(giris, model) {
  if (nesneMi(model) && model.girisGerekmez === true) return { kip: 'girissiz', profil: null };
  if (!giris || !GIRIS_KIPLERI.includes(giris.kip)) return { kip: 'ortam', profil: null };
  return { kip: /** @type {'ortam' | 'girissiz' | 'temiz'} */ (giris.kip), profil: giris.kip === 'girissiz' ? null : giris.profil ?? null };
}
