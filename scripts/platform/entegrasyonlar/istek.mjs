// ENTEGRASYON İSTEKLERİ — dış uygulamalara giden HTTP(S) istekleri için tek kapı. Kurallar:
//   * yalnız http: / https: (başka şema reddedilir);
//   * Ayarlar > Güvenlik > "Yasak adresler" (ve NOBETCI_YASAK_ADRESLER) kalıplarına uyan host'a istek GİTMEZ;
//   * yönlendirme izlenmez (3xx hata sayılır — gizli başlıklar başka host'a taşınmasın);
//   * yanıt gövdesi en çok YANIT_SINIRI bayt okunur;
//   * hata mesajlarında gizli değer (token, parola, gizli adres) bulunmaz: yalnız host, HTTP kodu ve maskelenmiş kısa özet.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirebilir).
import { request as httpIstek } from 'node:http';
import { request as httpsIstek } from 'node:https';
import { DepoHatasi } from '../veritabani/depo.mjs';

export const MASKE = '••••••';
/** Okunacak en büyük yanıt gövdesi (bayt). */
export const YANIT_SINIRI = 1024 * 1024;

/** Entegrasyon hatası (mesajı kullanıcıya gösterilebilir; gizli değer içermez). */
export class EntegrasyonHatasi extends DepoHatasi {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'EntegrasyonHatasi';
  }
}

/**
 * Metindeki gizli değerleri (düz, URL kodlu, JSON kaçışlı hâlleri) maskeler.
 * @param {string} metin @param {ReadonlyArray<string | null | undefined>} gizliler
 */
export function gizlileriMaskele(metin, gizliler) {
  let m = String(metin ?? '');
  const liste = [...new Set(gizliler.filter((x) => typeof x === 'string' && x.length >= 2))].sort((a, b) => /** @type {string} */ (b).length - /** @type {string} */ (a).length);
  for (const d of /** @type {string[]} */ (liste)) {
    for (const bicim of [d, encodeURIComponent(d), JSON.stringify(d).slice(1, -1), Buffer.from(d).toString('base64')]) {
      if (bicim) m = m.split(bicim).join(MASKE);
    }
  }
  return m;
}

/**
 * Adresin kullanıcıya gösterilebilir hâli: yalnız şema + host (+ port). Yol / sorgu gizli bilgi taşıyabilir (ör. webhook anahtarı).
 * @param {string} adres
 */
export function adresOzeti(adres) {
  try {
    const u = new URL(adres);
    return `${u.protocol}//${u.host}${u.pathname && u.pathname !== '/' ? '/…' : ''}`;
  } catch {
    return '(geçersiz adres)';
  }
}

/**
 * Adresi doğrular: http(s), host var, yasak kalıba uymuyor. Geçersizse EntegrasyonHatasi.
 * @param {string} adres @param {ReadonlyArray<{ kalip: string; desen: RegExp }>} yasakDesenleri
 * @returns {URL}
 */
export function adresDenetle(adres, yasakDesenleri = []) {
  let u;
  try { u = new URL(String(adres)); } catch { throw new EntegrasyonHatasi('Adres geçerli bir http(s) adresi değil.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new EntegrasyonHatasi('Entegrasyonlar yalnız http:// ya da https:// adreslerine istek gönderebilir.');
  if (!u.hostname) throw new EntegrasyonHatasi('Adreste sunucu adı yok.');
  hostDenetle(u.hostname, yasakDesenleri);
  return u;
}

/**
 * Host yasak kalıba uyuyorsa EntegrasyonHatasi.
 * @param {string} host @param {ReadonlyArray<{ kalip: string; desen: RegExp }>} yasakDesenleri
 */
export function hostDenetle(host, yasakDesenleri = []) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  const uyan = yasakDesenleri.find((d) => d.desen.test(h));
  if (uyan) {
    throw new EntegrasyonHatasi(`İstek gönderilmedi: ${h} yasaklı adres kalıbına ("${uyan.kalip}") uyuyor (Ayarlar > Güvenlik > Yasak adresler).`);
  }
}

/**
 * @typedef {{ durumKodu: number; basliklar: Record<string, string | string[] | undefined>; govde: string }} EntegrasyonYaniti
 */

/**
 * HTTP(S) isteği gönderir. Ağ hatasında EntegrasyonHatasi (yalnız host + hata kodu); HTTP hata kodları hata SAYILMAZ
 * (çağıran yorumlar), 3xx yönlendirme hata sayılır.
 * @param {{ adres: string; yontem?: string; basliklar?: Record<string, string>; govde?: string | Buffer; zamanAsimiMs?: number;
 *   yasakDesenleri?: ReadonlyArray<{ kalip: string; desen: RegExp }> }} istek
 * @returns {Promise<EntegrasyonYaniti>}
 */
export function entegrasyonIstegi(istek) {
  const u = adresDenetle(istek.adres, istek.yasakDesenleri ?? []);
  const zamanAsimiMs = Math.max(1000, Math.min(600_000, Number(istek.zamanAsimiMs) || 30_000));
  const govde = istek.govde === undefined ? undefined : Buffer.isBuffer(istek.govde) ? istek.govde : Buffer.from(istek.govde, 'utf8');
  /** @type {Record<string, string | number>} */
  const basliklar = { 'User-Agent': 'Nobetci-Entegrasyon/1', Accept: 'application/json', ...(istek.basliklar ?? {}) };
  if (govde) basliklar['Content-Length'] = govde.length;
  const istekFn = u.protocol === 'https:' ? httpsIstek : httpIstek;
  return new Promise((coz, reddet) => {
    let bitti = false;
    /** @param {Error} hata */
    const hataylaBitir = (hata) => { if (!bitti) { bitti = true; reddet(hata); } };
    const req = istekFn(u, { method: istek.yontem ?? 'POST', headers: basliklar }, (res) => {
      const durumKodu = res.statusCode ?? 0;
      if (durumKodu >= 300 && durumKodu < 400) {
        res.resume();
        hataylaBitir(new EntegrasyonHatasi(`${u.host} yönlendirme döndü (HTTP ${durumKodu}); yönlendirmeler izlenmez. Adresi doğrudan hedefe verin.`));
        return;
      }
      /** @type {Buffer[]} */
      const parcalar = [];
      let boyut = 0;
      res.on('data', (/** @type {Buffer} */ p) => {
        if (boyut >= YANIT_SINIRI) return;
        parcalar.push(p);
        boyut += p.length;
      });
      res.on('end', () => {
        if (bitti) return;
        bitti = true;
        coz({ durumKodu, basliklar: res.headers, govde: Buffer.concat(parcalar).subarray(0, YANIT_SINIRI).toString('utf8') });
      });
      res.on('error', () => hataylaBitir(new EntegrasyonHatasi(`${u.host} yanıtı okunamadı.`)));
    });
    req.setTimeout(zamanAsimiMs, () => {
      req.destroy();
      hataylaBitir(new EntegrasyonHatasi(`${u.host} ${Math.round(zamanAsimiMs / 1000)} sn içinde yanıt vermedi (zaman aşımı).`));
    });
    req.on('error', (/** @type {NodeJS.ErrnoException} */ h) => {
      hataylaBitir(new EntegrasyonHatasi(`${u.host} ile bağlantı kurulamadı${h && h.code ? ` (${h.code})` : ''}.`));
    });
    if (govde) req.write(govde);
    req.end();
  });
}

/**
 * Hata yanıtından kısa, maskelenmiş özet (JSON ise yalnız hata alanları; değilse ilk 160 karakter).
 * @param {string} govde @param {ReadonlyArray<string | null | undefined>} gizliler
 */
export function yanitOzeti(govde, gizliler) {
  let ozet = '';
  try {
    const j = JSON.parse(govde);
    if (j && typeof j === 'object') {
      const parcalar = [j.errorMessages, j.errors, j.message, j.error, j.value?.Message].filter((x) => x && (typeof x !== 'object' || Object.keys(x).length));
      ozet = parcalar.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    }
  } catch {
    ozet = /^\s*</.test(govde) ? '' : govde;
  }
  ozet = ozet.replace(/\s+/g, ' ').trim().slice(0, 160);
  return gizlileriMaskele(ozet, gizliler);
}
