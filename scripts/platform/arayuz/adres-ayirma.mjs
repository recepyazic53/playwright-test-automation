// GİRİŞ TARİFİ ADRES ALANLARI (saf; tarayıcı ve testler kullanır) — kullanıcı ortamın adresine göre bir yol (ör. /giris) ya da TAM adres
// (ör. https://site.ornek/giris) yazabilir. Tam adres, ortamın taban adresiyle AYNI kökendeyse taban adres + yol olarak ayrılır (tarife
// yalnız yol yazılır). Başka bir kökense tam adres olarak kalır; o kök ortamın kayıtlı taban adreslerinde yoksa arayüz kaydetmeyi önerir.
// Hiçbir istek atılmaz.
//   adresiAyir(girdi, tabanUrl)  → { tur, yol, koken, adres, mesaj? }
//     tur 'yol'   : yazılan zaten bir yoldur ("/" ile başlar; başında "/" yoksa eklenir)
//     tur 'ayni'  : tam adres, ortamın kökeniyle aynı → yol = yol + sorgu (parça atılır)
//     tur 'baska' : tam adres, başka bir kök → adres = tam adres (parça atılır), koken = kök
//     tur 'hata'  : geçersiz (mesaj Türkçe)
//   kokenKayitliMi(koken, tabanAdresleri)  köken kayıtlı taban adreslerden biri mi

/** @param {string} a */
const kokenOlarak = (a) => { try { return new URL(a).origin; } catch { return ''; } };

/**
 * @param {unknown} girdi @param {string | null | undefined} tabanUrl
 * @returns {{ tur: 'yol' | 'ayni' | 'baska' | 'hata'; yol: string; koken: string | null; adres: string; mesaj?: string }}
 */
export function adresiAyir(girdi, tabanUrl) {
  const metin = typeof girdi === 'string' ? girdi.trim() : '';
  if (!metin) return { tur: 'yol', yol: '', koken: null, adres: '' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(metin)) {
    if (metin.startsWith('//')) return { tur: 'hata', yol: metin, koken: null, adres: metin, mesaj: 'Adres “//” ile başlayamaz; yolu (ör. /giris) ya da tam adresi yazın.' };
    const yol = metin.startsWith('/') ? metin : `/${metin}`;
    return { tur: 'yol', yol, koken: null, adres: yol };
  }
  let u;
  try { u = new URL(metin); } catch { return { tur: 'hata', yol: metin, koken: null, adres: metin, mesaj: 'Adres geçerli değil; tam adres http:// ya da https:// ile başlamalı.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { tur: 'hata', yol: metin, koken: null, adres: metin, mesaj: 'Yalnızca http(s) adresi ya da yol yazılabilir.' };
  if (u.username || u.password) return { tur: 'hata', yol: metin, koken: null, adres: metin, mesaj: 'Adreste kullanıcı adı ya da parola yazılamaz.' };
  const yol = `${u.pathname}${u.search}` || '/';
  if (kokenOlarak(tabanUrl ?? '') === u.origin) return { tur: 'ayni', yol, koken: u.origin, adres: yol };
  return { tur: 'baska', yol, koken: u.origin, adres: `${u.origin}${yol}` };
}

/** @param {string} koken @param {string[] | null | undefined} tabanAdresleri */
export function kokenKayitliMi(koken, tabanAdresleri) {
  return (tabanAdresleri ?? []).some((a) => kokenOlarak(a) === koken);
}
