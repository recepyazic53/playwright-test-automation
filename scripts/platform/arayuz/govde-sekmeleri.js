// GÖVDE GÖRÜNÜMÜ SEKMELERİ — servis isteğinin "Alanlar | Gövde (XML)" (REST'te "Gövde (JSON)") seçimi ve gövde alan formuna
// çözülemediğinde çıkan uyarı. Tek istek senaryo formu (servisler.js) ve akış senaryosunun her operasyon adımı
// (akis-senaryo-formu.js) AYNI bileşeni kullanır: görünüm ve davranış tek yerde.
//   Alanlar → Gövde: çağıran gövdeyi alanlardan üretir (govdeUret). Gövde → Alanlar: çağıran gövdeyi çözer (govdeCoz); çözülemeyen
//   kısım varsa geçiş yapılmaz, uyarı gösterilir ("Formu yine de kullan" ile şemada olmayan kısımlar bilerek atılır).
import { h, yerlestir } from './ortak.js';

/** @typedef {'alanlar' | 'xml'} GovdeGorunumu */

/**
 * Sekme çubuğu kabı (role=tablist). @param {string} [ad] erişilebilir ad
 * @returns {HTMLElement}
 */
export const govdeSekmeKabi = (ad = 'Gövde görünümü') => h('div', { class: 'segment govde-sekmeleri', role: 'tablist', 'aria-label': ad });

/**
 * Sekmeleri kabın içine çizer.
 * @param {HTMLElement} kap govdeSekmeKabi()
 * @param {{ mod: GovdeGorunumu; alanlarVar: boolean; rest?: boolean; sec: (m: GovdeGorunumu) => void }} s
 *   alanlarVar: operasyonun alan listesi var mı (yoksa "Alanlar" kapalı); sec: yalnız farklı sekmeye basılınca çağrılır.
 */
export function govdeSekmeleriCiz(kap, s) {
  /** @type {Array<[GovdeGorunumu, string]>} */
  const sekmeler = [['alanlar', 'Alanlar'], ['xml', s.rest ? 'Gövde (JSON)' : 'Gövde (XML)']];
  yerlestir(kap, ...sekmeler.map(([m, e]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': s.mod === m ? 'true' : 'false', disabled: m === 'alanlar' && !s.alanlarVar,
    title: m === 'alanlar' && !s.alanlarVar ? 'Bu operasyonun alan listesi yok' : null,
    onclick: () => { if (m !== s.mod) s.sec(m); }
  }, e)));
}

/**
 * Gövde alan formunda tam gösterilemiyor uyarısı (geçiş yapılmadı; gövde aynen duruyor).
 * @param {string[]} uyumsuz govdeCoz'un nedenleri @param {() => void} yineDeKullan şemada olmayan kısımları atarak forma geç
 */
export function govdeUyumsuzUyarisi(uyumsuz, yineDeKullan) {
  return h('div', { class: 'not-kutusu uyari', role: 'status' },
    h('b', {}, 'Bu gövde alan formunda tam gösterilemiyor: '), uyumsuz.slice(0, 6).join(' '), uyumsuz.length > 6 ? ` (+${uyumsuz.length - 6})` : '',
    h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'kucuk-dugme', onclick: yineDeKullan }, 'Formu yine de kullan (şemada olmayan kısımlar atılır)')));
}
