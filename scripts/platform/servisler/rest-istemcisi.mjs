// SERVİS TESTLERİ — REST istemcisi: metot + adres + başlıklar + gövde (JSON / metin / form) ile HTTP isteği. Yanıt SOAP
// istemcisiyle aynı biçimdedir (durumKodu, basliklar, govde, sureMs); kontroller ve yanıttan değer okuma (degerOku: json / xml /
// baslik) ortaktır. Genel motordur: proje / ürün adı içermez. Ağ isteği YALNIZCA çağıran (sunucu uç noktası) istediğinde yapılır.
import { httpIstegi, ServisHatasi } from './soap-istemcisi.mjs';

/**
 * Servis adresi + isteğin göreli yolu: "" → servis adresi; "?a=1" → adres + sorgu; "/x" → adres/x.
 * @param {string} servisAdresi @param {string} yol
 */
export function adresBirlestirRest(servisAdresi, yol) {
  if (!yol) return servisAdresi;
  if (yol.startsWith('?')) return `${servisAdresi}${yol}`;
  return `${servisAdresi.replace(/\/+$/, '')}/${yol.replace(/^\/+/, '')}`;
}

/** Gövdesi olmayan metotlar (boş gövde gönderilmez). */
const GOVDESIZ = new Set(['GET', 'HEAD', 'OPTIONS']);
/** İsteğin kendisinin yazdığı başlıklar (senaryo ezemez). */
const KORUNAN = new Set(['content-type', 'content-length', 'host']);

/**
 * İçerik türüne göre gövdedeki değerlerin kaçışı: json → JSON metin kaçışı · form → URL kodlaması · xml → XML kaçışı · diğer: yok.
 * @param {string | undefined} icerikTuru @returns {'json' | 'url' | 'xml' | 'yok'}
 */
export function govdeKacisi(icerikTuru) {
  const t = String(icerikTuru ?? '').toLowerCase();
  if (/json/.test(t)) return 'json';
  if (/x-www-form-urlencoded/.test(t)) return 'url';
  if (/xml/.test(t)) return 'xml';
  return 'yok';
}

/**
 * REST isteği. ekBasliklar (ör. Authorization) eklenir; Content-Type içerik türünden yazılır (ezilemez). Accept verilmemişse
 * "application/json, *\/*".
 * @param {{ adres: string; metot: string; govde?: string; icerikTuru?: string; ekBasliklar?: Record<string, string>; zamanAsimiMs?: number;
 *   tlsDogrulama?: boolean; sinyal?: AbortSignal; gonderildi?: () => void }} istek
 */
export function restIstegi(istek) {
  const metot = istek.metot.toUpperCase();
  if (!/^[A-Z]{3,7}$/.test(metot)) return Promise.reject(new ServisHatasi(`Geçersiz HTTP metodu: ${istek.metot}`));
  const govdeVar = istek.govde !== undefined && istek.govde !== '' && !(GOVDESIZ.has(metot) && !istek.govde.trim());
  const ek = Object.fromEntries(Object.entries(istek.ekBasliklar ?? {}).filter(([a]) => !KORUNAN.has(a.toLowerCase())));
  const acceptVar = Object.keys(ek).some((a) => a.toLowerCase() === 'accept');
  /** @type {Record<string, string>} */
  const basliklar = {
    ...(acceptVar ? {} : { Accept: 'application/json, */*' }), ...ek,
    ...(govdeVar ? { 'Content-Type': istek.icerikTuru || 'application/json; charset=utf-8' } : {})
  };
  return httpIstegi({
    adres: istek.adres, yontem: metot, basliklar, ...(govdeVar ? { govde: istek.govde } : {}), zamanAsimiMs: istek.zamanAsimiMs,
    tlsDogrulama: istek.tlsDogrulama, sinyal: istek.sinyal, gonderildi: istek.gonderildi
  });
}
