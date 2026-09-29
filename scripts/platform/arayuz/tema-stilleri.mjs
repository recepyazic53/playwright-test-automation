// GÖRÜNÜM TEMALARI (saf; tarayıcı ve testler kullanır) — Ayarlar > Arayüz > Tema. Seçim tarayıcıda 'platform.stil' anahtarında
// durur; ortak.js okur ve <html data-stil="…"> olarak uygular ("komuta" varsayılandır, özellik yazılmaz).
// Eski anahtarlar: bir tema yeniden adlandırılınca (ör. "Canlı" → "Parlak": "CANLI" yalnız ortam türü için kullanılır) kayıtlı
// eski anahtar yenisine eşlenir; kullanıcının seçimi kaybolmaz.

export const VARSAYILAN_STIL = 'komuta';

export const STILLER = /** @type {const} */ ([
  { ad: 'komuta', etiket: 'Komuta merkezi', aciklama: 'Yazılımsal: koyu ızgara, camgöbeği parıltı, cam paneller.' },
  { ad: 'kurumsal', etiket: 'Kurumsal', aciklama: 'Sade ve ciddi: lacivert-gri, düz paneller, keskin köşeler.' },
  { ad: 'parlak', etiket: 'Parlak', aciklama: 'Renkli: mor-pembe-turuncu geçişler, yumuşak köşeler.' }
]);

/** Eski tema anahtarı → yeni anahtar. */
export const ESKI_STIL_ADLARI = Object.freeze({ canli: 'parlak' });

/**
 * Kayıtlı değeri geçerli bir tema anahtarına çevirir: eski anahtar yenisine eşlenir, bilinmeyen / boş değer varsayılana düşer.
 * @param {unknown} kayit
 * @returns {string}
 */
export function stilAdiniCoz(kayit) {
  const ad = typeof kayit === 'string' ? (Object.hasOwn(ESKI_STIL_ADLARI, kayit) ? ESKI_STIL_ADLARI[/** @type {keyof typeof ESKI_STIL_ADLARI} */ (kayit)] : kayit) : '';
  return STILLER.some((x) => x.ad === ad) ? ad : VARSAYILAN_STIL;
}
