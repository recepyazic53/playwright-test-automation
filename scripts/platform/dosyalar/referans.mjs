// DOSYA REFERANSI (genel, bağımlılıksız) — senaryo verisinde / ekran ayarlarında şifreli senaryo dosyasını gösteren
// metin: "nobetci-dosya://<medya kimliği>/<dosya adı>". Tarayıcı arayüzü ve testler de kullanır (import yok).
// Ayrıntı: senaryo-dosyalari.mjs. NOT: import.meta KULLANILMAZ. Tipler: referans.d.mts.

export const DOSYA_REFERANS_ON_EKI = 'nobetci-dosya://';
const REFERANS_DESENI = /^nobetci-dosya:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([^/\\]{1,200})$/;

/** @param {string} id @param {string} ad */
export function dosyaReferansi(id, ad) {
  return `${DOSYA_REFERANS_ON_EKI}${id}/${ad}`;
}

/** Referans metni mi? Değilse null. @param {unknown} deger @returns {{ id: string; ad: string } | null} */
export function referansCoz(deger) {
  if (typeof deger !== 'string') return null;
  const e = REFERANS_DESENI.exec(deger);
  return e ? { id: e[1], ad: e[2] } : null;
}
