// KOŞU GRUPLARI (Testlerim > Koşu oluştur; Gelişmiş: Senaryolar): kullanıcının isimli senaryo seçimi (ör. "Regresyon testi").
// Farklı ekranlardan karışık senaryolar bir gruba girer; grup "Çalıştır" ile mevcut toplu koşu altyapısıyla koşar (koşuyu arayüz
// başlatır: kosu-paneli.js > kosuBaslat). Grup yalnız senaryo KİMLİKLERİNİ tutar; ortam, "Toplu koşuya dahil" ve hazırlık kuralları
// koşu anında bugünkü gibi uygulanır.
// Kasada (ayarlar tablosu, anahtar "kosuGruplari", { projeId: [grup] }) şifreli saklanır: yedeğe girer, yedek yüklenince gelir; şema
// değişikliği gerekmez. Kod içinde kullanıcı verisi yoktur; grup adları ve seçimler yalnız kullanıcıdan gelir.
import { randomUUID } from 'node:crypto';
import { DepoHatasi, ayarGetir, ayarYaz, projeGetir, senaryoGetir } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ id: string; projeId: string; ad: string; senaryoIdleri: string[]; olusturulma: string; guncellenme: string }} KosuGrubu */

export const KOSU_GRUBU_AYAR_ANAHTARI = 'kosuGruplari';
export const KOSU_GRUBU_AD_SINIRI = 80;
export const KOSU_GRUBU_SENARYO_SINIRI = 500;

/** @param {Veritabani} vt @returns {Record<string, KosuGrubu[]>} */
function tumu(vt) {
  let kayit;
  try { kayit = ayarGetir(vt, KOSU_GRUBU_AYAR_ANAHTARI); } catch { kayit = undefined; }
  return kayit && typeof kayit === 'object' && !Array.isArray(kayit) ? /** @type {Record<string, KosuGrubu[]>} */ (kayit) : {};
}

/** @param {Veritabani} vt @param {string} projeId @returns {KosuGrubu[]} */
function projeninGruplari(vt, projeId) {
  const l = tumu(vt)[projeId];
  return Array.isArray(l) ? l.filter((g) => g && typeof g.id === 'string' && typeof g.ad === 'string' && Array.isArray(g.senaryoIdleri)) : [];
}

/** @param {Veritabani} vt @param {string} projeId @param {KosuGrubu[]} liste */
function yaz(vt, projeId, liste) {
  const hepsi = { ...tumu(vt) };
  if (liste.length) hepsi[projeId] = liste; else delete hepsi[projeId];
  ayarYaz(vt, KOSU_GRUBU_AYAR_ANAHTARI, hepsi);
}

/**
 * Projenin grupları (ada göre sıralı). Her grupta: senaryoIdleri (var olanlar) ve kayipSayisi (silinmiş senaryolar).
 * @param {Veritabani} vt @param {string} projeId
 */
export function kosuGruplariniListele(vt, projeId) {
  return projeninGruplari(vt, projeId).map((g) => {
    const mevcutlar = g.senaryoIdleri.filter((id) => senaryoGetir(vt, id)?.projeId === projeId);
    return { ...g, senaryoIdleri: mevcutlar, kayipSayisi: g.senaryoIdleri.length - mevcutlar.length };
  }).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/**
 * Grubu doğrulayıp kaydeder (yeni ya da id ile düzenleme). girdi: { id?, projeId, ad, senaryoIdleri }.
 * @param {Veritabani} vt @param {{ id?: string | null; projeId: string; ad: unknown; senaryoIdleri: unknown }} girdi @returns {KosuGrubu}
 */
export function kosuGrubuKaydet(vt, girdi) {
  if (!projeGetir(vt, girdi.projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const ad = typeof girdi.ad === 'string' ? girdi.ad.trim().replace(/\s+/g, ' ') : '';
  if (!ad) throw new DepoHatasi('Grup adı boş olamaz.');
  if (ad.length > KOSU_GRUBU_AD_SINIRI) throw new DepoHatasi(`Grup adı en çok ${KOSU_GRUBU_AD_SINIRI} karakter olabilir.`);
  if (!Array.isArray(girdi.senaryoIdleri) || girdi.senaryoIdleri.some((x) => typeof x !== 'string' || !x)) throw new DepoHatasi('Senaryo seçimi geçersiz.');
  const idler = [...new Set(/** @type {string[]} */ (girdi.senaryoIdleri))];
  if (!idler.length) throw new DepoHatasi('En az bir senaryo seçin.');
  if (idler.length > KOSU_GRUBU_SENARYO_SINIRI) throw new DepoHatasi(`Bir grupta en çok ${KOSU_GRUBU_SENARYO_SINIRI} senaryo olabilir.`);
  for (const id of idler) {
    if (senaryoGetir(vt, id)?.projeId !== girdi.projeId) throw new DepoHatasi('Seçilen senaryolardan biri bu projede bulunamadı.');
  }
  const liste = projeninGruplari(vt, girdi.projeId);
  const mevcut = girdi.id ? liste.find((g) => g.id === girdi.id) : undefined;
  if (girdi.id && !mevcut) throw new DepoHatasi('Koşu grubu bulunamadı.');
  if (liste.some((g) => g.id !== mevcut?.id && g.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) throw new DepoHatasi(`"${ad}" adlı bir koşu grubu zaten var.`);
  const simdi = new Date().toISOString();
  /** @type {KosuGrubu} */
  const grup = { id: mevcut?.id ?? randomUUID(), projeId: girdi.projeId, ad, senaryoIdleri: idler, olusturulma: mevcut?.olusturulma ?? simdi, guncellenme: simdi };
  yaz(vt, girdi.projeId, mevcut ? liste.map((g) => (g.id === grup.id ? grup : g)) : [...liste, grup]);
  return grup;
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id */
export function kosuGrubuSil(vt, projeId, id) {
  const liste = projeninGruplari(vt, projeId);
  if (!liste.some((g) => g.id === id)) throw new DepoHatasi('Koşu grubu bulunamadı.');
  yaz(vt, projeId, liste.filter((g) => g.id !== id));
  return { silindi: true };
}

/** Projenin tüm grupları silinir (proje silinirken). @param {Veritabani} vt @param {string} projeId */
export function kosuGruplariniTemizle(vt, projeId) {
  if (tumu(vt)[projeId] !== undefined) yaz(vt, projeId, []);
}
