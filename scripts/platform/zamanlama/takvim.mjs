// ZAMANLANMIŞ KOŞULAR — zaman tanımı ve "vakti geldi mi" hesabı (SAF fonksiyonlar: saat dışarıdan verilir, yan etki yok).
// Zamanlar bu bilgisayarın YEREL saatine göredir. Biçim (cron yazdırılmaz):
//   { tur: 'gunluk',   saat: 'HH:MM' }                               her gün
//   { tur: 'haftalik', saat: 'HH:MM', gunler: [1..7] }                haftanın seçili günleri (1 = Pazartesi … 7 = Pazar)
//   { tur: 'aralik',   saatAraligi: 1|2|3|4|6|8|12, baslangic: 'HH:MM' }   her N saatte bir (gün içinde başlangıçtan itibaren)
// Kaçan zamanlar (sunucu kapalı / kasa kilitli) sonradan TOPLU koşulmaz: bir zaman yalnızca geçtikten sonraki kısa pencerede
// (TOLERANS_MS) tetiklenir; pencere kaçarsa bir sonraki zaman beklenir.
// NOT: import.meta KULLANILMAZ. Tipler: takvim.d.mts.
import { DepoHatasi } from '../veritabani/depo.mjs';

/** Zamanı geçen bir çalışmanın hâlâ başlatılabileceği süre (zamanlayıcı dakikada bir bakar). */
export const TOLERANS_MS = 5 * 60 * 1000;
/** "Her N saatte bir" için izin verilen N değerleri (24'ü tam böler: her gün aynı saatler). */
export const SAAT_ARALIKLARI = Object.freeze([1, 2, 3, 4, 6, 8, 12]);
export const GUN_ADLARI = Object.freeze(['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']);
const GUN_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const SAAT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** @typedef {import('./takvim.d.mts').Zaman} Zaman */

/** @param {unknown} d @param {string} etiket */
function saatAl(d, etiket) {
  if (typeof d !== 'string' || !SAAT.test(d.trim())) throw new DepoHatasi(`${etiket} SS:DD biçiminde olmalıdır (ör. 09:30).`);
  return d.trim();
}

/** @param {string} s @returns {number} gün içindeki dakika */
const dakika = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/**
 * Zaman tanımını doğrular ve sadeleştirir (bilinmeyen alanlar atılır).
 * @param {unknown} girdi @returns {Zaman}
 */
export function zamanDogrula(girdi) {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Zaman tanımı eksik.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  if (g.tur === 'gunluk') return { tur: 'gunluk', saat: saatAl(g.saat, 'Saat') };
  if (g.tur === 'haftalik') {
    const gunler = Array.isArray(g.gunler) ? [...new Set(g.gunler.map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b) : [];
    if (!gunler.length) throw new DepoHatasi('En az bir gün seçin.');
    return { tur: 'haftalik', saat: saatAl(g.saat, 'Saat'), gunler };
  }
  if (g.tur === 'aralik') {
    const n = Number(g.saatAraligi);
    if (!SAAT_ARALIKLARI.includes(n)) throw new DepoHatasi(`Saat aralığı şunlardan biri olmalıdır: ${SAAT_ARALIKLARI.join(', ')}.`);
    return { tur: 'aralik', saatAraligi: n, baslangic: saatAl(g.baslangic ?? '00:00', 'Başlangıç saati') };
  }
  throw new DepoHatasi('Zaman türü "gunluk", "haftalik" ya da "aralik" olmalıdır.');
}

/** Tarihin haftadaki günü (1 = Pazartesi … 7 = Pazar). @param {Date} t */
const haftaGunu = (t) => ((t.getDay() + 6) % 7) + 1;

/**
 * Verilen yerel günün (t'nin günü) çalışma zamanları, artan sırada.
 * @param {Zaman} z @param {Date} t
 * @returns {Date[]}
 */
export function gununZamanlari(z, t) {
  const y = t.getFullYear(), a = t.getMonth(), g = t.getDate();
  /** @param {number} dk */
  const an = (dk) => new Date(y, a, g, Math.floor(dk / 60), dk % 60, 0, 0);
  if (z.tur === 'gunluk') return [an(dakika(z.saat))];
  if (z.tur === 'haftalik') return z.gunler.includes(haftaGunu(new Date(y, a, g))) ? [an(dakika(z.saat))] : [];
  const bas = dakika(z.baslangic) % (z.saatAraligi * 60);
  /** @type {Date[]} */
  const liste = [];
  for (let dk = bas; dk < 24 * 60; dk += z.saatAraligi * 60) liste.push(an(dk));
  return liste;
}

/**
 * simdi'den SONRAKİ ilk çalışma zamanı (en çok 8 gün ileriye bakılır; tanım geçerliyse her zaman bulunur).
 * @param {Zaman} z @param {Date} simdi @returns {Date | null}
 */
export function sonrakiZaman(z, simdi) {
  for (let i = 0; i <= 8; i++) {
    const gun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() + i);
    const bulunan = gununZamanlari(z, gun).find((x) => x.getTime() > simdi.getTime());
    if (bulunan) return bulunan;
  }
  return null;
}

/**
 * simdi'ye eşit ya da ondan ÖNCEKİ son çalışma zamanı (en çok 8 gün geriye).
 * @param {Zaman} z @param {Date} simdi @returns {Date | null}
 */
export function oncekiZaman(z, simdi) {
  for (let i = 0; i <= 8; i++) {
    const gun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() - i);
    const liste = gununZamanlari(z, gun).filter((x) => x.getTime() <= simdi.getTime());
    if (liste.length) return liste[liste.length - 1];
  }
  return null;
}

/**
 * Vakti gelen çalışma zamanı: simdi'den önceki son zaman, (1) "tuketilen"den (son tetiklenen ya da kuralın kaydedildiği an)
 * SONRA ve (2) en çok toleransMs kadar önce ise o zaman döner; değilse null. Böylece aynı zaman iki kez tetiklenmez, kaçan
 * zamanlar sonradan toplu koşulmaz ve kural kaydedilmeden önceki bir zaman tetiklenmez.
 * @param {Zaman} z @param {Date} simdi @param {string | null | undefined} tuketilen ISO zaman
 * @param {number} [toleransMs]
 * @returns {Date | null}
 */
export function vadesiGelenZaman(z, simdi, tuketilen, toleransMs = TOLERANS_MS) {
  const onceki = oncekiZaman(z, simdi);
  if (!onceki) return null;
  if (simdi.getTime() - onceki.getTime() > toleransMs) return null;
  const sinir = tuketilen ? Date.parse(tuketilen) : NaN;
  if (Number.isFinite(sinir) && onceki.getTime() <= sinir) return null;
  return onceki;
}

/**
 * simdi'den sonraki adet kadar çalışma zamanı (önizleme için).
 * @param {Zaman} z @param {Date} simdi @param {number} adet @returns {Date[]}
 */
export function sonrakiZamanlar(z, simdi, adet) {
  /** @type {Date[]} */
  const liste = [];
  let t = simdi;
  while (liste.length < adet) {
    const s = sonrakiZaman(z, t);
    if (!s) break;
    liste.push(s);
    t = s;
  }
  return liste;
}

/** @param {number} n */
const iki = (n) => String(n).padStart(2, '0');

/**
 * Tanımın okunur metni ("Her gün 09:00", "Pzt, Çar, Cum 09:00", "Her 4 saatte bir (00:30, 04:30 …)").
 * @param {Zaman} z @returns {string}
 */
export function zamanMetni(z) {
  if (z.tur === 'gunluk') return `Her gün ${z.saat}`;
  if (z.tur === 'haftalik') {
    if (z.gunler.length === 7) return `Her gün ${z.saat}`;
    if (z.gunler.join(',') === '1,2,3,4,5') return `Hafta içi her gün ${z.saat}`;
    if (z.gunler.join(',') === '6,7') return `Hafta sonu ${z.saat}`;
    return `${z.gunler.map((g) => GUN_KISA[g]).join(', ')} ${z.saat}`;
  }
  const bas = dakika(z.baslangic) % (z.saatAraligi * 60);
  const ilkler = [0, 1].map((k) => bas + k * z.saatAraligi * 60).filter((dk) => dk < 24 * 60).map((dk) => `${iki(Math.floor(dk / 60))}:${iki(dk % 60)}`);
  return `Her ${z.saatAraligi === 1 ? '' : `${z.saatAraligi} `}saatte bir (${ilkler.join(', ')}${24 / z.saatAraligi > 2 ? ' …' : ''})`;
}
