// PROJE ADAPTÖRLERİ KAYDI — platform motoru (scripts/platform/aktarim/) genel kalır; projeye özgü
// "mevcut dosyaları aktar" mantığı projeler/<proje>/aktarim.mjs içinde durur ve YALNIZCA burada
// kaydedilir. Yeni bir proje eklemek: projeler/<ad>/aktarim.mjs yazıp aşağıdaki listeye eklemek.
import { galaksiAdaptoru } from './galaksi/aktarim.mjs';

/** @type {ReadonlyArray<import('./index.d.mts').AktarimAdaptoru>} */
export const AKTARIM_ADAPTORLERI = Object.freeze([galaksiAdaptoru]);

/** @param {string} ad */
export function adaptorBul(ad) {
  return AKTARIM_ADAPTORLERI.find((a) => a.ad === ad);
}
