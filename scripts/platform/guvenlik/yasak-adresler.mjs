// YASAK ADRESLER (genel) — Nöbetçi'nin HİÇBİR ZAMAN bağlanmaması gereken host kalıpları. İki kaynak birleşir:
//   1) Ayarlar > Güvenlik > "Yasak adresler" (veritabanında, ayarlar.guvenlik.yasakAdresler; şifreli — kasa açık olmalı)
//   2) NOBETCI_YASAK_ADRESLER ortam değişkeni (ek kaynak; virgül/boşlukla ayrılmış)
// Varsayılan BOŞTUR (kullanıcı karar verir). Kullananlar: koşu koruması (sunucu, global-setup, model koşucusu) ve
// ekran taraması (tarama işi yasaklı host'a hiç bağlanmaz). Kalıp biçimi: model-kosusu.mjs > yasakDesenleri
// ("*" joker, büyük/küçük harf duyarsız, host'un tamamına uygulanır).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { ayarGetir, ayarYaz, DepoHatasi } from '../veritabani/depo.mjs';
import { kasaAcikMi } from '../kasa.mjs';
import { YASAK_ADRES_DEGISKENI, yasakDesenleri } from '../senaryolar/model-kosusu.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const GUVENLIK_AYAR_ANAHTARI = 'guvenlik';
export const YASAK_ADRES_EN_COK = 100;
const KALIP_DESENI = /^[a-z0-9*][a-z0-9*.-]{0,252}$/;

/**
 * Kullanıcının girdiği listeyi doğrular ve normalleştirir (küçük harf, tekrarsız). Geçersiz kalıp → DepoHatasi.
 * Adres (https://…/yol) girilirse host'u alınır.
 * @param {unknown} ham metin dizisi ya da satır/virgülle ayrılmış metin
 * @returns {string[]}
 */
export function yasakAdresleriniNormallestir(ham) {
  const parcalar = Array.isArray(ham) ? ham : typeof ham === 'string' ? ham.split(/[\s,;]+/) : null;
  if (!parcalar) throw new DepoHatasi('"yasakAdresler" bir liste olmalıdır.');
  /** @type {string[]} */
  const sonuc = [];
  for (const p of parcalar) {
    if (typeof p !== 'string') throw new DepoHatasi('Yasak adres kalıpları metin olmalıdır.');
    let k = p.trim().toLowerCase();
    if (!k) continue;
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(k)) {
      try { k = new URL(k.replace(/\*/g, 'joker-yildiz')).hostname.replace(/joker-yildiz/g, '*'); } catch { throw new DepoHatasi(`"${p.trim()}" geçerli bir host kalıbı değil.`); }
    }
    if (!KALIP_DESENI.test(k) || k === '*' || /^\*+$/.test(k)) {
      throw new DepoHatasi(`"${p.trim()}" geçerli bir host kalıbı değil (harf, rakam, ".", "-" ve "*" kullanın; yalnızca "*" olamaz).`);
    }
    if (!sonuc.includes(k)) sonuc.push(k);
  }
  if (sonuc.length > YASAK_ADRES_EN_COK) throw new DepoHatasi(`En fazla ${YASAK_ADRES_EN_COK} kalıp girilebilir.`);
  return sonuc;
}

/**
 * Ayarlardaki kalıplar (kasa kilitliyse ya da ayar yoksa boş).
 * @param {Veritabani | null | undefined} vt @returns {string[]}
 */
export function ayarlardakiYasakAdresler(vt) {
  if (!vt || !kasaAcikMi(vt)) return [];
  try {
    const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, GUVENLIK_AYAR_ANAHTARI));
    const liste = ayar?.yasakAdresler;
    return Array.isArray(liste) ? liste.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().toLowerCase()) : [];
  } catch {
    return [];
  }
}

/** Ayarlardaki kalıpları kaydeder (kasa açık olmalı). @param {Veritabani} vt @param {unknown} ham @returns {string[]} */
export function yasakAdresleriKaydet(vt, ham) {
  const liste = yasakAdresleriniNormallestir(ham);
  const mevcut = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, GUVENLIK_AYAR_ANAHTARI));
  ayarYaz(vt, GUVENLIK_AYAR_ANAHTARI, { ...(mevcut ?? {}), yasakAdresler: liste });
  return liste;
}

/** Ortam değişkenindeki kalıplar. @param {NodeJS.ProcessEnv} [ortam] @returns {string[]} */
export function ortamdakiYasakAdresler(ortam = process.env) {
  return yasakDesenleri(ortam[YASAK_ADRES_DEGISKENI]).map((d) => d.kalip);
}

/**
 * Etkin kalıplar (ayarlar + ortam değişkeni, tekrarsız) — alt süreçlere NOBETCI_YASAK_ADRESLER olarak verilir.
 * @param {Veritabani | null | undefined} vt @param {NodeJS.ProcessEnv} [ortam] @returns {string[]}
 */
export function etkinYasakAdresler(vt, ortam = process.env) {
  return [...new Set([...ayarlardakiYasakAdresler(vt), ...ortamdakiYasakAdresler(ortam)])];
}

/** Etkin desenler (adresYasakliMi ile kullanılır). @param {Veritabani | null | undefined} vt @param {NodeJS.ProcessEnv} [ortam] */
export function etkinYasakDesenleri(vt, ortam = process.env) {
  return yasakDesenleri(etkinYasakAdresler(vt, ortam).join(','));
}
