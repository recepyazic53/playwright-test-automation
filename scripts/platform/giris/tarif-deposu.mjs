// GİRİŞ TARİFİ DEPOSU (genel) — tarif ortam ayarlarında durur: ortamlar.ayarlar_json > "girisTarifi"
// (sütun kasada şifreli, bkz. gocler.mjs > SIFRELI_ALANLAR; ŞEMA GÖÇÜ GEREKMEZ). Kasa açık olmalıdır.
// Etkin tarif: kaydedilmiş tarif; yoksa null (giriş yapılamaz — Ayarlar'dan tarif tanımlanmalı).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { DepoHatasi, ortamGetir, ortamKaydet } from '../veritabani/depo.mjs';
import { girisTarifiniDogrula } from './tarif.mjs';
import { girisSonrasiCoz } from './giris-sonrasi-akis.mjs';

export const GIRIS_TARIFI_ANAHTARI = 'girisTarifi';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./tarif.d.mts').GirisTarifi} GirisTarifi */

/**
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId
 * @returns {{ tarif: GirisTarifi | null; kaynak: 'kayitli' | 'yok'; hatalar: string[] }}
 */
export function etkinGirisTarifi(vt, projeId, ortamId) {
  const ortam = ortamGetir(vt, ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const kayitli = ortam.ayarlar[GIRIS_TARIFI_ANAHTARI];
  if (kayitli !== undefined && kayitli !== null) {
    const d = girisTarifiniDogrula(kayitli);
    // Her girişte çalışacak akış koşucu için çözülür (akış her seferinde modelden okunur; tarifte yalnız seçim + değerler durur).
    return { tarif: girisSonrasiCoz(vt, projeId, d.tarif), kaynak: 'kayitli', hatalar: d.hatalar };
  }
  return { tarif: null, kaynak: 'yok', hatalar: [] };
}

/**
 * Tarifi doğrulayıp ortam ayarlarına yazar (diğer ayarlar korunur). Geçersizse DepoHatasi (tüm hatalar).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {unknown} ham
 */
export function girisTarifiKaydet(vt, projeId, ortamId, ham) {
  const ortam = ortamGetir(vt, ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const { gecerli, tarif, hatalar } = girisTarifiniDogrula(ham);
  if (!gecerli || !tarif) throw new DepoHatasi(`Giriş tarifi kaydedilemedi: ${hatalar.join(' ')}`);
  ortamKaydet(vt, {
    id: ortam.id, projeId: ortam.projeId, ad: ortam.ad, tabanUrl: ortam.tabanUrl, varsayilan: ortam.varsayilan,
    ayarlar: { ...ortam.ayarlar, [GIRIS_TARIFI_ANAHTARI]: tarif }
  });
  return tarif;
}

/** Kayıtlı tarifi kaldırır. @param {Veritabani} vt @param {string} projeId @param {string} ortamId */
export function girisTarifiniSifirla(vt, projeId, ortamId) {
  const ortam = ortamGetir(vt, ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  if (!(GIRIS_TARIFI_ANAHTARI in ortam.ayarlar)) return false;
  const { [GIRIS_TARIFI_ANAHTARI]: _kaldirilan, ...kalan } = ortam.ayarlar;
  ortamKaydet(vt, { id: ortam.id, projeId: ortam.projeId, ad: ortam.ad, tabanUrl: ortam.tabanUrl, varsayilan: ortam.varsayilan, ayarlar: kalan });
  return true;
}
