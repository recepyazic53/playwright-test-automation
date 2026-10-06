// PROJE HATA PENCERELERİ (Ayarlar > Hata pencereleri; PROJE BAŞINA) — sitenin hata / uyarı mesajını gösterdiği pencereler (ör. sayfa içi
// uyarı kutusu). Koşu bir adımı beklerken önce adımın kendi göstergelerine (ekran modeli: başarı / hata göstergesi, senaryonun beklenen
// uyarısı) bakar; onlar bir şey söylemiyorken bu pencerelerden biri görünürse adım beklemeden başarısız olur, pencerenin metni hata
// iletisine yazılır. İçindeki yazıdan bağımsızdır (seçiciyle tanınır). Kullanıcı "Sayfada seç" ile pencereye tıklayarak tanımlar; küçük
// ekran görüntüsü yalnız listede gösterilir (eşleştirmede kullanılmaz). Kasada (ayarlar tablosu, anahtar "hataPencereleri",
// { projeId: HataPenceresi[] }) şifreli saklanır.
import { randomUUID } from 'node:crypto';
import { DepoHatasi, ayarGetir, ayarYaz, projeGetir } from '../veritabani/depo.mjs';
import { GORUNTU_EN_COK } from '../tarama/oge-isaretleri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ id: string; ad: string; secici: string; cerceve?: string[]; goruntu?: string; etkin: boolean }} HataPenceresi */

export const HATA_PENCERELERI_ANAHTARI = 'hataPencereleri';
/** Proje başına en çok pencere. */
export const HATA_PENCERESI_EN_COK = 20;

const nesneMi = (/** @type {unknown} */ x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);

/** Kayıtlı tüm projelerin listeleri (okunamazsa boş). @param {Veritabani} vt @returns {Record<string, unknown>} */
function kayit(vt) {
  try { const k = ayarGetir(vt, HATA_PENCERELERI_ANAHTARI); return nesneMi(k) ? /** @type {Record<string, unknown>} */ (k) : {}; } catch { return {}; }
}

/**
 * Tek pencereyi doğrular ve sadeleştirir (bilinmeyen alanlar atılır). @param {unknown} ham @param {number} sira
 * @returns {HataPenceresi}
 */
function pencereAyikla(ham, sira) {
  const yer = `${sira + 1}. pencere`;
  if (!nesneMi(ham)) throw new DepoHatasi(`${yer} okunamadı.`);
  const h = /** @type {Record<string, unknown>} */ (ham);
  const secici = typeof h.secici === 'string' ? h.secici.trim() : '';
  if (!secici || secici.length > 300) throw new DepoHatasi(`${yer}: seçici boş ya da çok uzun (en çok 300 karakter).`);
  const ad = typeof h.ad === 'string' && h.ad.trim() ? h.ad.trim().slice(0, 80) : `Hata penceresi ${sira + 1}`;
  const cerceve = Array.isArray(h.cerceve) && h.cerceve.length <= 2 && h.cerceve.every((c) => typeof c === 'string' && c) ? h.cerceve.map(String) : null;
  const goruntu = typeof h.goruntu === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(h.goruntu) && h.goruntu.length <= GORUNTU_EN_COK ? h.goruntu : null;
  return {
    id: typeof h.id === 'string' && /^[\w-]{1,64}$/.test(h.id) ? h.id : randomUUID(), ad, secici,
    ...(cerceve ? { cerceve } : {}), ...(goruntu ? { goruntu } : {}), etkin: h.etkin !== false
  };
}

/** Projenin hata pencereleri (görüntüleriyle). @param {Veritabani} vt @param {string} projeId @returns {HataPenceresi[]} */
export function hataPencereleriniOku(vt, projeId) {
  const liste = kayit(vt)[projeId];
  if (!Array.isArray(liste)) return [];
  /** @type {HataPenceresi[]} */
  const sonuc = [];
  liste.forEach((p, i) => { try { sonuc.push(pencereAyikla(p, i)); } catch { /* bozuk kayıt atlanır */ } });
  return sonuc;
}

/**
 * Projenin listesini doğrulayıp tümüyle yazar. @param {Veritabani} vt @param {string} projeId @param {unknown} girdi
 * @returns {HataPenceresi[]}
 */
export function hataPencereleriniKaydet(vt, projeId, girdi) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  if (!Array.isArray(girdi)) throw new DepoHatasi('Hata pencereleri liste olmalı.');
  if (girdi.length > HATA_PENCERESI_EN_COK) throw new DepoHatasi(`En fazla ${HATA_PENCERESI_EN_COK} hata penceresi tanımlanabilir.`);
  const liste = girdi.map((p, i) => pencereAyikla(p, i));
  const seciciler = new Set();
  for (const p of liste) {
    const k = `${JSON.stringify(p.cerceve ?? [])}${p.secici}`;
    if (seciciler.has(k)) throw new DepoHatasi(`"${p.secici}" seçicisi iki kez tanımlanmış.`);
    seciciler.add(k);
  }
  ayarYaz(vt, HATA_PENCERELERI_ANAHTARI, { ...kayit(vt), [projeId]: liste });
  return liste;
}

/**
 * Koşuya giden biçim: yalnız açık pencereler, görüntüsüz (ad, seçici, çerçeve). @param {Veritabani} vt @param {string} projeId
 * @returns {Array<{ ad: string; secici: string; cerceve?: string[] }>}
 */
export function kosuHataPencereleri(vt, projeId) {
  return hataPencereleriniOku(vt, projeId).filter((p) => p.etkin).map((p) => ({ ad: p.ad, secici: p.secici, ...(p.cerceve ? { cerceve: p.cerceve } : {}) }));
}
