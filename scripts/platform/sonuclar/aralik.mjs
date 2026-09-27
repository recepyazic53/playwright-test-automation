// Sonuç uçlarının tarih aralığı parametreleri (ORTAK): baslangic / bitis (ISO; biri ya da ikisi) ya da geriye uyum için
// gun (son N gün). Bitiş başlangıçtan önceyse açık hata. Karşılaştırma ISO metinle yapılır (kayıtlar ISO UTC tutulur).
import { DepoHatasi } from '../veritabani/depo.mjs';

/** @typedef {{ baslangic: string | null; bitis: string | null }} Aralik */

/** @param {unknown} d @param {string} alan @returns {string | null} */
function iso(d, alan) {
  if (d === undefined || d === null || d === '') return null;
  const t = new Date(String(d));
  if (Number.isNaN(t.getTime())) throw new DepoHatasi(`"${alan}" geçerli bir tarih değil.`);
  return t.toISOString();
}

/**
 * @param {URLSearchParams} q @param {Date} [simdi]
 * @returns {Aralik}
 */
export function sorgudanAralik(q, simdi = new Date()) {
  let baslangic = iso(q.get('baslangic'), 'baslangic');
  const bitis = iso(q.get('bitis'), 'bitis');
  const gun = q.get('gun');
  if (!baslangic && gun !== null && gun !== '') {
    const n = Number(gun);
    if (!Number.isFinite(n) || n <= 0 || n > 36_500) throw new DepoHatasi('"gun" 1 ile 36500 arasında olmalıdır.');
    baslangic = new Date(simdi.getTime() - n * 86_400_000).toISOString();
  }
  if (baslangic && bitis && bitis < baslangic) throw new DepoHatasi('Bitiş, başlangıçtan önce olamaz.');
  return { baslangic, bitis };
}

/** ISO zaman aralıkta mı (sınırsız aralıkta her zaman). @param {string | null | undefined} z @param {Aralik} a */
export function araliktaMi(z, a) {
  if (!a.baslangic && !a.bitis) return true;
  if (!z) return false;
  const t = new Date(z).toISOString();
  return (!a.baslangic || t >= a.baslangic) && (!a.bitis || t <= a.bitis);
}
