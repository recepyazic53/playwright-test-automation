// PDF RAPORU — ortak bileşenler (saf): stil, Türkçe sayı biçimi, ▲▼ fark, kartlar, satır içi SVG grafikler (kıvılcım, günlük eğilim,
// süre eğilimi, ısı haritası, süre dağılımı), senaryo matrisi, aksiyon ve sorun tabloları, yöntem + gizlilik kutusu.
// Dış kaynak YOK (font, CDN, görsel); betik YOK. Her metin çağıran tarafından verilen kaçış / maskeleme işleviyle yazılır:
//   e(x) = ad alanları (bilinen gizli değerler maskelenir + HTML kaçışı), m(x) = serbest metin (tam maskeleme + HTML kaçışı).
// Renk tek başına anlam taşımaz: her durum simge + metinle de yazılır (siyah-beyaz çıktıda okunur).
import { kacis } from '../html-rapor.mjs';
import { SINIFLAR } from '../oncelik.mjs';
import { SORUN_DURUMLARI } from '../sorun-modeli.mjs';

/** @typedef {(x: unknown) => string} Yazici */

// ---------------------------------------------------------------- Türkçe sayı biçimi
/** @param {number} n @param {number} [b] */
export const sy = (n, b = 0) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
/** @param {number | null | undefined} n @param {number} [b] */
export const yz = (n, b = 1) => (n === null || n === undefined || Number.isNaN(n) ? '—' : `%${sy(n, b)}`);
/** @param {number | null | undefined} ms */
export function sure(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${sy(Math.round(ms))} ms`;
  if (ms < 60_000) return `${sy(ms / 1000, 1)} sn`;
  const dk = Math.floor(ms / 60_000);
  return `${dk} dk ${Math.round((ms % 60_000) / 1000)} sn`;
}
/** @param {string | null | undefined} iso */
export function tarihSaat(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}
/** @param {string | null | undefined} iso */
export const kisaTarih = (iso) => tarihSaat(iso).slice(0, 10);
/** @param {number | null} v @param {{ yesil: number; sari: number }} e */
export const renkOran = (v, e) => (v === null ? '' : v >= e.yesil ? 'iyi' : v >= e.sari ? 'orta' : 'kotu');

// ---------------------------------------------------------------- sorun durumları ve sınıflar (renk + simge + metin)
export const DURUMLAR = Object.freeze({
  yeni: { ad: 'Yeni', simge: '✚', renk: '#b42318', zemin: '#fee4e2', aciklama: 'Bu dönemde ilk kez görüldü (90 günlük geriye bakışta yok)' },
  artan: { ad: 'Artan', simge: '▲', renk: '#c4320a', zemin: '#ffead5', aciklama: 'Önceki döneme göre oranı ≥ 1,5 kat ve adet farkı ≥ 2' },
  tekrar: { ad: 'Tekrar eden', simge: '↻', renk: '#7a2e98', zemin: '#f4ebff', aciklama: 'Daha önce çözülmüştü, bu dönemde geri geldi' },
  suregelen: { ad: 'Süregelen', simge: '●', renk: '#9a6700', zemin: '#fff4ce', aciklama: 'Belirgin değişim yok' },
  kararsiz: { ad: 'Kararsız', simge: '≈', renk: '#3b5b8c', zemin: '#e8eef8', aciklama: 'Aynı senaryo aynı koşullarda bazen geçiyor bazen kalıyor' },
  azalan: { ad: 'Azalan', simge: '▼', renk: '#0e7a6d', zemin: '#dcf5f0', aciklama: 'Önceki döneme göre oranı ≤ 0,67 kat ve adet farkı ≥ 2' },
  cozulen: { ad: 'Çözülen', simge: '✓', renk: '#1a7f37', zemin: '#dafbe1', aciklama: 'Önceki dönemde vardı; bu dönemde senaryoları ≥ 3 kez geçti, hata yok' },
  dogrulanamadi: { ad: 'Doğrulanamadı', simge: '?', renk: '#57606a', zemin: '#eef1f5', aciklama: 'Önceki dönemde vardı; bu dönemde senaryoları yeterince koşmadı' }
});
/** @param {string} d */
export const durumEtiketi = (d) => {
  const x = /** @type {Record<string, { ad: string; simge: string; renk: string; zemin: string }>} */ (DURUMLAR)[d] ?? DURUMLAR.suregelen;
  return `<span class="drm" style="color:${x.renk};background:${x.zemin}">${x.simge} ${kacis(x.ad)}</span>`;
};
/** @param {string} s */
export const sinifEtiketi = (s) => {
  const x = /** @type {Record<string, { ad: string; simge: string }>} */ (SINIFLAR)[s] ?? SINIFLAR.uygulama;
  return `<span class="snf snf-${/^[a-z]+$/.test(s) ? s : 'uygulama'}">${x.simge} ${kacis(x.ad)}</span>`;
};
/** @param {string} b @param {number} p */
export const puanEtiketi = (b, p) => `<span class="pn ${b === 'P1' ? 'p1' : b === 'P2' ? 'p2' : 'p3'}">${kacis(b)}</span><span class="pnd">${sy(p)}</span>`;

// ---------------------------------------------------------------- stil
export const CSS = `
@page { size: A4; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Segoe UI", "Segoe UI Symbol", Arial, sans-serif; color: #1c2430; font-size: 9.6pt; line-height: 1.38; margin: 0; background: #fff; }
main { max-width: 794px; margin: 0 auto; padding: 0; }
.ust { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1f4e8c; padding-bottom: 8px; margin-bottom: 10px; gap: 10px; }
.ust h1 { font-size: 18pt; margin: 0 0 2px; letter-spacing: -.01em; overflow-wrap: anywhere; }
.ust .alt { color: #525c6b; font-size: 9.5pt; }
.etiket-nobetci { background: #eef1f5; color: #24344d; border: 1px solid #c9d0d9; padding: 3px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; white-space: nowrap; }
.meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px 12px; font-size: 8.6pt; color: #2f3845; margin-bottom: 10px; background: #f6f8fa; border: 1px solid #e3e7ec; border-radius: 6px; padding: 7px 10px; }
.meta > div { min-width: 0; overflow-wrap: anywhere; }
.meta b { display: block; color: #6b7482; font-weight: 600; font-size: 7.2pt; text-transform: uppercase; letter-spacing: .04em; }
h2 { font-size: 12pt; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #c9d0d9; break-after: avoid; color: #13233a; }
h2 .no { color: #1f4e8c; margin-right: 6px; }
h3 { font-size: 10pt; margin: 10px 0 4px; break-after: avoid; color: #24344d; }
p { margin: 3px 0 6px; }
.bakis { display: grid; grid-template-columns: 170px 1fr; gap: 10px; margin-bottom: 6px; break-inside: avoid; }
.rozet-kutu { border-radius: 8px; padding: 10px; text-align: center; border: 2px solid; display: flex; flex-direction: column; justify-content: center; }
.rozet-kutu .b { font-size: 17pt; font-weight: 800; letter-spacing: .02em; }
.rozet-kutu .n { font-size: 8.2pt; margin-top: 4px; color: #2f3845; }
.r-saglikli { border-color: #1a7f37; background: #eefbf1; color: #1a7f37; }
.r-dikkat { border-color: #bf8700; background: #fff8e1; color: #8a5d00; }
.r-kritik { border-color: #cf222e; background: #fff0ef; color: #b42318; }
.kartlar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.kart { border: 1px solid #d8dde4; border-radius: 6px; padding: 5px 8px; break-inside: avoid; min-width: 0; }
.kart .e { font-size: 7.8pt; color: #5b6573; text-transform: uppercase; letter-spacing: .03em; font-weight: 600; }
.kart .d { font-size: 15pt; font-weight: 700; line-height: 1.15; }
.kart .f { font-size: 8pt; overflow-wrap: anywhere; }
.fk { font-weight: 600; white-space: nowrap; }
.iyi { color: #1a7f37; } .kotu { color: #b42318; } .notr { color: #57606a; } .orta { color: #9a6700; }
.ozet-madde { margin: 6px 0 2px; padding: 0; list-style: none; break-inside: avoid; }
.ozet-madde li { padding: 2px 0 2px 20px; position: relative; font-size: 9.2pt; }
.ozet-madde li::before { position: absolute; left: 2px; font-weight: 700; }
.ozet-madde li.m-iyi::before { content: "✓"; color: #1a7f37; }
.ozet-madde li.m-kotu::before { content: "✗"; color: #b42318; }
.ozet-madde li.m-oneri::before { content: "→"; color: #1f4e8c; }
table { width: 100%; border-collapse: collapse; font-size: 8.4pt; margin: 2px 0 6px; table-layout: auto; }
thead { display: table-header-group; }
th { text-align: left; background: #eef1f5; font-weight: 600; padding: 4px 5px; border-bottom: 1px solid #b9c2cd; color: #24344d; vertical-align: bottom; }
td { padding: 3px 5px; border-bottom: 1px solid #e6e9ee; vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; page-break-inside: avoid; }
td.s, th.s { text-align: right; white-space: nowrap; }
td.c, th.c { text-align: center; }
tr.grup td { background: #f6f8fa; font-weight: 700; font-size: 8.4pt; border-bottom: 1px solid #c9d0d9; padding-top: 5px; }
.drm { display: inline-block; padding: 0 5px; border-radius: 9px; font-size: 7.8pt; font-weight: 700; white-space: nowrap; }
.snf { font-size: 7.8pt; font-weight: 600; white-space: nowrap; }
.snf-uygulama { color: #b42318; } .snf-veri { color: #7a4d00; } .snf-bakim { color: #3b5b8c; } .snf-ortam { color: #57606a; } .snf-kararsiz { color: #3b5b8c; }
.pn { display: inline-block; min-width: 22px; text-align: center; padding: 0 4px; border-radius: 3px; font-weight: 800; font-size: 7.8pt; color: #fff; margin-right: 3px; }
.p1 { background: #b42318; } .p2 { background: #bf8700; } .p3 { background: #6b7482; }
.pnd { font-weight: 700; font-size: 8.4pt; }
.mono { font-family: Consolas, "Courier New", monospace; font-size: 7.6pt; color: #4b5563; word-break: break-word; }
.kucuk { font-size: 7.9pt; color: #5b6573; }
.not { background: #f4f7fb; border-left: 3px solid #1f4e8c; padding: 5px 9px; font-size: 8.6pt; margin: 6px 0; break-inside: avoid; }
.bos { color: #57606a; font-style: italic; }
.iki { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.iki > div { min-width: 0; }
.blok { break-inside: avoid; page-break-inside: avoid; }
.sayfa-sonu { break-before: page; }
.lejant { font-size: 7.6pt; color: #5b6573; margin-top: 1px; }
.lejant span { margin-right: 10px; }
.kutu-l { display: inline-block; width: 9px; height: 9px; vertical-align: -1px; margin-right: 3px; border: 1px solid #9aa4b1; }
.durum-hap { font-size: 7.8pt; font-weight: 700; white-space: nowrap; }
.h-g { color: #1a7f37; } .h-k { color: #b42318; } .h-a { color: #6b7482; }
svg { max-width: 100%; height: auto; }
pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 4px; padding: 5px 7px; white-space: pre-wrap; overflow-wrap: anywhere; font: 7.6pt/1.4 Consolas, "Courier New", monospace; margin: 4px 0; }
figure { margin: 4px 0; } figure img { max-width: 100%; max-height: 90mm; border: 1px solid #d0d7de; } figcaption { font-size: 7.6pt; color: #5b6573; }
.yontem { border: 1px solid #c9d0d9; border-radius: 6px; padding: 8px 11px; font-size: 8.1pt; background: #fbfcfd; break-inside: avoid; margin-top: 10px; }
.yontem h3 { margin-top: 0; }
.yontem dl { display: grid; grid-template-columns: 150px 1fr; gap: 2px 10px; margin: 0; }
.yontem dt { font-weight: 700; color: #24344d; }
.yontem dd { margin: 0; }
.gizlilik { margin-top: 8px; border: 1px solid #d0d7de; border-left: 3px solid #57606a; padding: 6px 10px; font-size: 8pt; background: #f6f8fa; break-inside: avoid; }
.ozet-sayilar { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 6px; }
.ozet-sayilar .x { border: 1px solid #d8dde4; border-radius: 5px; padding: 2px 8px; font-size: 8.4pt; }
.rozet-hap { display: inline-block; padding: 0 6px; border-radius: 9px; font-size: 7.8pt; font-weight: 700; white-space: nowrap; border: 1px solid; }
.rh-saglikli { color: #1a7f37; background: #eefbf1; border-color: #1a7f37; } .rh-dikkat { color: #8a5d00; background: #fff8e1; border-color: #bf8700; } .rh-kritik { color: #b42318; background: #fff0ef; border-color: #cf222e; }
.sira { display: inline-block; min-width: 18px; text-align: center; font-weight: 800; color: #24344d; background: #eef1f5; border-radius: 3px; font-size: 8pt; }
.taraf { border: 1px solid #d8dde4; border-radius: 6px; padding: 6px 9px; break-inside: avoid; }
.taraf h3 { margin-top: 0; }
.baglanti-notu { color: #3b5b8c; }
.kritik-hap { display: inline-block; padding: 0 5px; border-radius: 3px; font-size: 7.4pt; font-weight: 700; color: #b42318; border: 1px solid #cf222e; background: #fff0ef; white-space: nowrap; }
@media screen and (max-width: 640px) { .meta { grid-template-columns: 1fr 1fr; } .bakis, .iki { grid-template-columns: 1fr; } .kartlar { grid-template-columns: 1fr 1fr; } }
`;

// ---------------------------------------------------------------- fark (▲▼) ve kart
/**
 * @param {number | null | undefined} simdi @param {number | null | undefined} onceki
 * @param {{ yon?: 'yukari-iyi' | 'asagi-iyi' | 'notr'; birim?: 'puan' | 'adet' | 'ms'; b?: number; kapali?: boolean }} [s]
 */
export function fark(simdi, onceki, s = {}) {
  if (s.kapali) return '';
  if (simdi === null || simdi === undefined) return '<span class="fk notr">—</span>';
  if (onceki === null || onceki === undefined) return '<span class="fk notr">önceki dönem yok</span>';
  const { yon = 'yukari-iyi', birim = 'adet', b = 0 } = s;
  const d = simdi - onceki;
  if (Math.abs(d) < (b ? 0.05 : 0.5)) return '<span class="fk notr">= değişmedi</span>';
  const iyi = yon === 'notr' ? null : (d > 0) === (yon === 'yukari-iyi');
  const sinif = iyi === null ? 'notr' : iyi ? 'iyi' : 'kotu';
  const deger = birim === 'puan' ? `${sy(Math.abs(d), 1)} puan` : birim === 'ms' ? sure(Math.abs(d)) : sy(Math.abs(d), b);
  return `<span class="fk ${sinif}">${d > 0 ? '▲' : '▼'} ${kacis(deger)}</span>`;
}
/** @param {string} etiket @param {string} deger HTML @param {string} alt HTML @param {string} [sinif] */
export const kart = (etiket, deger, alt, sinif = '') => `<div class="kart"><div class="e">${kacis(etiket)}</div><div class="d ${sinif}">${deger}</div><div class="f">${alt}</div></div>`;

/**
 * @param {{ no: number; rozet: { durum: string; gerekce: string }; kartlar: string[]; maddeler: Array<[string, string]>; m: Yazici }} g
 */
export function tekBakista(g) {
  const ad = /** @type {Record<string, string>} */ ({ saglikli: '✓ SAĞLIKLI', dikkat: '◆ DİKKAT', kritik: '✗ KRİTİK' })[g.rozet.durum] ?? '◆ DİKKAT';
  const sinif = ['saglikli', 'dikkat', 'kritik'].includes(g.rozet.durum) ? g.rozet.durum : 'dikkat';
  return `<h2><span class="no">${g.no}</span>Tek bakışta</h2>
<div class="bakis"><div class="rozet-kutu r-${sinif}" role="status"><div class="b">${ad}</div><div class="n">${kacis(g.rozet.gerekce)}</div></div>
<div class="kartlar">${g.kartlar.join('')}</div></div>
<ul class="ozet-madde">${g.maddeler.map(([t, x]) => `<li class="m-${['iyi', 'kotu', 'oneri'].includes(t) ? t : 'oneri'}">${g.m(x)}</li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- SVG: kıvılcım (önceki dönem gri, bu dönem renkli)
/** @param {number[]} onceki @param {number[]} simdi @param {string} renk */
export function kivilcim(onceki, simdi, renk = '#b42318', en = 92, boy = 22) {
  const tum = [...onceki, ...simdi];
  if (tum.length < 2) return '';
  const mx = Math.max(1, ...tum);
  const x = (/** @type {number} */ i) => 2 + (i * (en - 4)) / (tum.length - 1);
  const y = (/** @type {number} */ v) => boy - 3 - (v / mx) * (boy - 6);
  const yol = (/** @type {number[]} */ a, /** @type {number} */ bas) => a.map((v, i) => `${i ? 'L' : 'M'}${x(bas + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const orta = x(onceki.length - 0.5);
  const alan = simdi.length ? `<path d="M${x(Math.max(0, onceki.length - 1)).toFixed(1)},${boy - 3} ${simdi.map((v, i) => `L${x(onceki.length + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} L${x(tum.length - 1).toFixed(1)},${boy - 3} Z" fill="${renk}" fill-opacity=".12"/>` : '';
  const oncekiYol = onceki.length ? `<path d="${yol(onceki, 0)}" fill="none" stroke="#9aa4b1" stroke-width="1.1"/>` : '';
  const baglanti = onceki.length ? `M${x(onceki.length - 1).toFixed(1)},${y(onceki[onceki.length - 1]).toFixed(1)} ${yol(simdi, onceki.length).replace('M', 'L')}` : yol(simdi, 0);
  const son = simdi.length ? `<circle cx="${x(tum.length - 1).toFixed(1)}" cy="${y(simdi[simdi.length - 1]).toFixed(1)}" r="1.8" fill="${renk}"/>` : '';
  const top = (/** @type {number[]} */ a) => a.reduce((p, c) => p + c, 0);
  return `<svg width="${en}" height="${boy}" viewBox="0 0 ${en} ${boy}" role="img" aria-label="Eğilim: önceki dönem ${top(onceki)}, bu dönem ${top(simdi)}">
<line x1="2" x2="${en - 2}" y1="${boy - 3}" y2="${boy - 3}" stroke="#d0d7de" stroke-width=".6"/>
${onceki.length ? `<line x1="${orta.toFixed(1)}" x2="${orta.toFixed(1)}" y1="1" y2="${boy - 2}" stroke="#9aa4b1" stroke-width=".6" stroke-dasharray="1.5 1.5"/>` : ''}
${alan}${oncekiYol}<path d="${baglanti}" fill="none" stroke="${renk}" stroke-width="1.4"/>${son}</svg>`;
}

// ---------------------------------------------------------------- SVG: eğilim (sütun = adet, çizgi = başarı)
/**
 * @param {{ kovalar: Array<{ etiket: string; adet: number; kalan: number; oran: number | null }>; oncekiOrt: number | null; esikler: { yesil: number; sari: number };
 *   adetEtiketi: string; baslik: string; karsilastir: boolean }} g
 */
export function trendGrafigi(g) {
  const en = 700, boy = 185, sol = 34, sag = 38, ust = 10, alt = 22;
  const genislik = en - sol - sag, h = boy - ust - alt;
  const n = Math.max(1, g.kovalar.length);
  const bw = (genislik / n) * 0.56;
  const x = (/** @type {number} */ i) => sol + (genislik / n) * (i + 0.5);
  const mxAdet = Math.ceil(Math.max(0, ...g.kovalar.map((k) => k.adet)) / 10) * 10 || 10;
  const ya = (/** @type {number} */ v) => ust + h - (v / mxAdet) * h;
  const oranlar = g.kovalar.map((k) => k.oran).filter((v) => v !== null).map(Number);
  const oncekiOrt = g.karsilastir ? g.oncekiOrt : null;
  const alt0 = Math.max(0, Math.floor((Math.min(...oranlar, oncekiOrt ?? 100, g.esikler.yesil) - 5) / 10) * 10);
  const yo = (/** @type {number} */ v) => ust + h - ((v - alt0) / (100 - alt0)) * h;
  let s = '';
  for (let j = 0; j <= 4; j++) { const v = alt0 + ((100 - alt0) * j) / 4; s += `<line x1="${sol}" x2="${en - sag}" y1="${yo(v).toFixed(1)}" y2="${yo(v).toFixed(1)}" stroke="#eef1f5"/><text x="${sol - 4}" y="${(yo(v) + 3).toFixed(1)}" font-size="8" text-anchor="end" fill="#6b7482">%${sy(v, v % 1 ? 1 : 0)}</text>`; }
  for (const v of [0, mxAdet / 2, mxAdet]) s += `<text x="${en - sag + 4}" y="${(ya(v) + 3).toFixed(1)}" font-size="8" fill="#6b7482">${sy(v)}</text>`;
  s += `<line x1="${sol}" x2="${en - sag}" y1="${yo(g.esikler.yesil).toFixed(1)}" y2="${yo(g.esikler.yesil).toFixed(1)}" stroke="#1a7f37" stroke-width=".8" stroke-dasharray="3 3"/>`;
  if (oncekiOrt !== null) s += `<line x1="${sol}" x2="${en - sag}" y1="${yo(oncekiOrt).toFixed(1)}" y2="${yo(oncekiOrt).toFixed(1)}" stroke="#6b7482" stroke-width="1" stroke-dasharray="6 3"/>`;
  const etiketAdimi = Math.ceil(n / 16);
  g.kovalar.forEach((k, i) => {
    s += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${ya(k.adet).toFixed(1)}" width="${bw.toFixed(1)}" height="${(ust + h - ya(k.adet)).toFixed(1)}" fill="#cfdcee"/>`;
    if (k.kalan) s += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${ya(k.kalan).toFixed(1)}" width="${bw.toFixed(1)}" height="${(ust + h - ya(k.kalan)).toFixed(1)}" fill="#f4a3a0"/>`;
    if (i % etiketAdimi === 0) s += `<text x="${x(i).toFixed(1)}" y="${boy - 8}" font-size="7.6" text-anchor="middle" fill="#57606a">${kacis(k.etiket)}</text>`;
  });
  // Başarı çizgisi: koşu olmayan kovada kesilir.
  let yol = '';
  let acik = false;
  g.kovalar.forEach((k, i) => {
    if (k.oran === null) { acik = false; return; }
    yol += `${acik ? 'L' : 'M'}${x(i).toFixed(1)},${yo(k.oran).toFixed(1)} `;
    acik = true;
  });
  if (yol) s += `<path d="${yol.trim()}" fill="none" stroke="#1f4e8c" stroke-width="2"/>`;
  g.kovalar.forEach((k, i) => {
    if (k.oran === null) return;
    const v = k.oran;
    const cx = x(i).toFixed(1), cy = yo(v).toFixed(1);
    s += v >= g.esikler.yesil ? `<circle cx="${cx}" cy="${cy}" r="3" fill="#1a7f37" stroke="#fff"/>`
      : v >= g.esikler.sari ? `<rect x="${(x(i) - 3).toFixed(1)}" y="${(yo(v) - 3).toFixed(1)}" width="6" height="6" transform="rotate(45 ${cx} ${cy})" fill="#bf8700" stroke="#fff"/>`
        : `<path d="M${(x(i) - 3.5).toFixed(1)},${(yo(v) + 3).toFixed(1)} L${cx},${(yo(v) - 3.5).toFixed(1)} L${(x(i) + 3.5).toFixed(1)},${(yo(v) + 3).toFixed(1)} Z" fill="#b42318" stroke="#fff"/>`;
  });
  return `<div class="blok"><h3>${kacis(g.baslik)}</h3><svg width="100%" viewBox="0 0 ${en} ${boy}" role="img" aria-label="${kacis(g.baslik)}">${s}</svg>
<div class="lejant"><span><span class="kutu-l" style="background:#cfdcee"></span>${kacis(g.adetEtiketi)} (sağ eksen)</span><span><span class="kutu-l" style="background:#f4a3a0"></span>Başarısız</span><span>— Başarı oranı (sol eksen): ● ≥ yeşil eşik · ◆ sarı bant · ▲ kırmızı bant</span>${oncekiOrt !== null ? `<span>- - önceki dönem ortalaması ${yz(oncekiOrt)}</span>` : ''}<span style="color:#1a7f37">- - yeşil eşik %${sy(g.esikler.yesil)}</span><span>Sol eksen alt sınırı %${sy(alt0)}.</span></div></div>`;
}

/** Süre eğilimi: p50 ve p95 çizgileri (ms), önceki dönem p95 kesikli, (A4) kullanıcı tanımlı süre eşiği kırmızı kesikli çizgi.
 * Ölçüm olmayan kova boş kalır.
 * esikNotu: tek çizgi çizilemediğinde (eşikler metot başına) lejanttaki not.
 * @param {{ etiketler: string[]; p50: Array<number | null>; p95: Array<number | null>; oncekiP95: number | null; baslik: string; esik?: number | null; esikNotu?: string }} g */
export function sureGrafigi(g) {
  const en = 700, boy = 150, sol = 46, sag = 12, ust = 10, alt = 22;
  const genislik = en - sol - sag, h = boy - ust - alt;
  const n = Math.max(1, g.etiketler.length);
  const x = (/** @type {number} */ i) => sol + (genislik / n) * (i + 0.5);
  const esik = typeof g.esik === 'number' && g.esik > 0 ? g.esik : null;
  const degerler = [...g.p95, ...g.p50, g.oncekiP95, esik].filter((v) => v !== null && v !== undefined).map(Number);
  const mx = Math.max(500, Math.ceil(Math.max(0, ...degerler) / 500) * 500);
  const y = (/** @type {number} */ v) => ust + h - (v / mx) * h;
  let s = '';
  for (let v = 0; v <= mx; v += mx / 4) s += `<line x1="${sol}" x2="${en - sag}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#eef1f5"/><text x="${sol - 4}" y="${(y(v) + 3).toFixed(1)}" font-size="8" text-anchor="end" fill="#6b7482">${kacis(sure(v))}</text>`;
  const etiketAdimi = Math.ceil(n / 16);
  g.etiketler.forEach((d, i) => { if (i % etiketAdimi === 0) s += `<text x="${x(i).toFixed(1)}" y="${boy - 8}" font-size="7.6" text-anchor="middle" fill="#57606a">${kacis(d)}</text>`; });
  if (g.oncekiP95 !== null) s += `<line x1="${sol}" x2="${en - sag}" y1="${y(g.oncekiP95).toFixed(1)}" y2="${y(g.oncekiP95).toFixed(1)}" stroke="#6b7482" stroke-dasharray="6 3"/><text x="${sol + 4}" y="${(y(g.oncekiP95) - 3).toFixed(1)}" font-size="7.5" fill="#57606a">önceki dönem p95 ${kacis(sure(g.oncekiP95))}</text>`;
  if (esik !== null) s += `<line x1="${sol}" x2="${en - sag}" y1="${y(esik).toFixed(1)}" y2="${y(esik).toFixed(1)}" stroke="#b42318" stroke-width="1.2" stroke-dasharray="2 2"/><text x="${en - sag - 4}" y="${(y(esik) - 3).toFixed(1)}" font-size="7.5" text-anchor="end" fill="#b42318">süre eşiği ${kacis(sure(esik))}</text>`;
  const cizgi = (/** @type {Array<number | null>} */ a, /** @type {string} */ renk, /** @type {number} */ gen) => {
    let yol = '';
    let acik = false;
    a.forEach((v, i) => { if (v === null) { acik = false; return; } yol += `${acik ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; acik = true; });
    return yol ? `<path d="${yol.trim()}" fill="none" stroke="${renk}" stroke-width="${gen}"/>` : '';
  };
  s += cizgi(g.p50, '#7aa2d6', 1.6) + cizgi(g.p95, '#1f4e8c', 2.2);
  g.p95.forEach((v, i) => { if (v !== null) s += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4" fill="#1f4e8c"/>`; });
  g.p50.forEach((v, i) => { if (v !== null) s += `<rect x="${(x(i) - 2).toFixed(1)}" y="${(y(v) - 2).toFixed(1)}" width="4" height="4" fill="#7aa2d6"/>`; });
  return `<div class="blok"><h3>${kacis(g.baslik)}</h3><svg width="100%" viewBox="0 0 ${en} ${boy}" role="img" aria-label="${kacis(g.baslik)}">${s}</svg>
<div class="lejant"><span>● p95 (koyu çizgi)</span><span>■ p50 / medyan (açık çizgi)</span><span>- - önceki dönem p95</span>${esik !== null
    ? `<span style="color:#b42318">·· süre eşiği ${kacis(sure(esik))} (Ayarlar &gt; Raporlar)</span>`
    : `<span>${g.esikNotu ? kacis(g.esikNotu) : 'Süre eşiği tanımlı değil (çizgi yok; Ayarlar &gt; Raporlar).'}</span>`}</div></div>`;
}

/** Isı haritası: satırlar × kovalar, hücrede adet (0 boş).
 * @param {{ satirlar: Array<{ ad: string; seri: number[] }>; etiketler: string[]; baslik: string; m: Yazici }} g */
export function isiHaritasi(g) {
  const renk = (/** @type {number} */ v) => (v === 0 ? '#ffffff' : v === 1 ? '#fde2e0' : v <= 3 ? '#f7a8a3' : '#d9534f');
  const yazi = (/** @type {number} */ v) => (v >= 4 ? '#fff' : '#5c1a14');
  const en = 700, solG = 200, hucre = (en - solG - 40) / Math.max(1, g.etiketler.length), hh = 17;
  const boy = 20 + g.satirlar.length * hh + 18;
  const etiketAdimi = Math.ceil(g.etiketler.length / 16);
  let s = '';
  g.etiketler.forEach((d, j) => { if (j % etiketAdimi === 0) s += `<text x="${(solG + hucre * (j + 0.5)).toFixed(1)}" y="12" font-size="7.4" text-anchor="middle" fill="#57606a">${kacis(d)}</text>`; });
  s += `<text x="${en - 20}" y="12" font-size="7.4" text-anchor="middle" fill="#24344d" font-weight="700">Top.</text>`;
  g.satirlar.forEach((r, i) => {
    const yy = 18 + i * hh;
    const ad = r.ad.length > 38 ? `${r.ad.slice(0, 37)}…` : r.ad;
    s += `<text x="${solG - 6}" y="${yy + 11.5}" font-size="8" text-anchor="end" fill="#24344d">${g.m(ad)}</text>`;
    r.seri.forEach((v, j) => {
      s += `<rect x="${(solG + hucre * j + 0.8).toFixed(1)}" y="${yy + 0.8}" width="${Math.max(0.5, hucre - 1.6).toFixed(1)}" height="${hh - 1.6}" fill="${renk(v)}" stroke="#e1e5ea" stroke-width=".6"/>`;
      if (v) s += `<text x="${(solG + hucre * (j + 0.5)).toFixed(1)}" y="${yy + 11.8}" font-size="8" font-weight="700" text-anchor="middle" fill="${yazi(v)}">${v}</text>`;
    });
    const t = r.seri.reduce((a, b) => a + b, 0);
    s += `<text x="${en - 20}" y="${yy + 11.8}" font-size="8.4" font-weight="700" text-anchor="middle" fill="${t ? '#b42318' : '#6b7482'}">${t}</text>`;
  });
  return `<div class="blok"><h3>${kacis(g.baslik)}</h3><svg width="100%" viewBox="0 0 ${en} ${boy}" role="img" aria-label="${kacis(g.baslik)}">${s}</svg>
<div class="lejant"><span><span class="kutu-l" style="background:#fff"></span>0</span><span><span class="kutu-l" style="background:#fde2e0"></span>1</span><span><span class="kutu-l" style="background:#f7a8a3"></span>2–3</span><span><span class="kutu-l" style="background:#d9534f"></span>4+</span><span>Hücredeki sayı = o gün o adımda başarısız test adedi; her başarısız test yalnız ilk başarısız adımına sayılır.</span></div></div>`;
}

/** Senaryo matrisi: G = geçti, K = kaldı, A = atlandı, - = koşmadı.
 * @param {{ satirlar: Array<{ ad: string; dizi: string; not: string }>; etiketler: string[] }} g @param {Yazici} e */
export function senaryoMatrisi(g, e) {
  const hucre = (/** @type {string} */ c) => (/** @type {Record<string, string>} */ ({ G: '<span class="h-g">✓</span>', K: '<span class="h-k">✗</span>', A: '<span class="h-a">○</span>' }))[c] ?? '<span class="h-a">·</span>';
  const zemin = (/** @type {string} */ c) => (/** @type {Record<string, string>} */ ({ G: '#eefbf1', K: '#fde2e0', A: '#f3f4f6' }))[c] ?? '#fff';
  return `<table><thead><tr><th scope="col">Senaryo</th>${g.etiketler.map((x) => `<th scope="col" class="c" style="font-size:6.6pt;padding:3px 1px">${kacis(x)}</th>`).join('')}<th scope="col" class="s">Başarı</th><th scope="col">Değerlendirme</th></tr></thead><tbody>
${g.satirlar.map((r) => {
    const d = [...r.dizi];
    const gecen = d.filter((c) => c === 'G').length;
    const kosan = d.filter((c) => c === 'G' || c === 'K').length;
    return `<tr><td>${e(r.ad)}</td>${d.map((c) => `<td class="c" style="background:${zemin(c)};padding:2px 1px;border-left:1px solid #fff">${hucre(c)}</td>`).join('')}<td class="s">${kosan ? yz((gecen / kosan) * 100, 0) : '—'}</td><td class="kucuk">${kacis(r.not)}</td></tr>`;
  }).join('')}</tbody></table>
<div class="lejant"><span class="h-g">✓ geçti</span><span class="h-k">✗ başarısız</span><span class="h-a">○ atlandı</span><span class="h-a">· koşmadı</span><span>Sütunlar: dönemdeki son ${g.etiketler.length} tam koşu (soldan sağa eskiden yeniye). Başarı sütunu yalnız koşan hücrelerden.</span></div>`;
}

/**
 * @typedef {{ baslik: string; nerede: string; sinif: string; durum: string; puan: number; bant: string; aksiyon: string; sahip: string; neden: string;
 *   dayanak?: string; tur?: string; baglanti?: string; kritik?: boolean; ilkSurum?: string | null; esikAsimi?: boolean }} AksiyonSatiri
 */

/** Kritik işaretli öğe hapı (A4; simge + metin, renk tek başına anlam taşımaz). */
export const KRITIK_HAP = '<span class="kritik-hap">★ kritik</span>';

/** @param {{ no: number; aksiyonlar: AksiyonSatiri[]; bantSayim: { P1: number; P2: number; P3: number }; e: Yazici; m: Yazici }} g */
export function aksiyonTablosu(g) {
  const bas = `<h2><span class="no">${g.no}</span>Ele alınması gerekenler</h2>
<p class="kucuk">Öncelik puanı sıralı (0–100). <b>P1</b> ≥ 60 bu hafta, <b>P2</b> 35–59 bu dönem, <b>P3</b> &lt; 35 izlenir. Toplam: ${g.bantSayim.P1} P1 · ${g.bantSayim.P2} P2 · ${g.bantSayim.P3} P3; aşağıda ilk ${g.aksiyonlar.length} aksiyon.</p>`;
  if (!g.aksiyonlar.length) return `${bas}<p class="bos">Ele alınması gereken açık sorun yok.</p>`;
  return `${bas}<table><thead><tr><th scope="col" style="width:52px">Öncelik</th><th scope="col">Ne / nerede</th><th scope="col" style="width:150px">Neden şimdi</th><th scope="col" style="width:170px">Önerilen aksiyon</th><th scope="col" style="width:96px">Sahip önerisi</th></tr></thead><tbody>
${g.aksiyonlar.map((s) => `<tr><td>${puanEtiketi(s.bant, s.puan)}</td><td><b>${g.m(s.baslik)}</b>${s.kritik ? ` ${KRITIK_HAP}` : ''}<br><span class="kucuk">${g.m(s.nerede)}</span><br>${s.sinif === 'kararsiz' && s.durum === 'kararsiz' ? durumEtiketi(s.durum) : `${sinifEtiketi(s.sinif)} ${durumEtiketi(s.durum)}`}${s.dayanak ? `<br><span class="kucuk">${s.esikAsimi ? '' : 'Tahmin dayanağı: '}${kacis(s.dayanak)}</span>` : ''}${s.ilkSurum ? `<br><span class="kucuk">Başladığı uygulama sürümü: ${g.e(s.ilkSurum)}</span>` : ''}${s.baglanti ? `<br><span class="kucuk baglanti-notu">⇄ Bağlantılı sorunla birleştirildi: ${g.m(s.baglanti)}</span>` : ''}</td>
<td class="kucuk">${kacis(s.neden)}</td><td class="kucuk">${kacis(s.aksiyon)}</td><td class="kucuk">${g.e(s.sahip)}</td></tr>`).join('')}
</tbody></table>`;
}

/**
 * @param {{ no: number; sorunlar: Array<AksiyonSatiri & { kalip: string; n: number; nOnceki: number; senaryo: number; seri: number[]; oncekiSeri: number[];
 *   ilk: string | null; son: string | null; tekrarRozeti: boolean }>; hatalar: boolean; karsilastir: boolean; kosuVar: boolean; m: Yazici; turSutunu?: boolean }} g
 *   turSutunu: ekran + servis raporunda sorunun kaynağı (Ekran / Servis) ayrı sütunda yazılır. A4: kritik öğe "★ kritik", "İlk / son"
 *   hücresinde sorunun başladığı uygulama sürümü (varsa).
 */
export function sorunTablosu(g) {
  const turHucresi = (/** @type {{ tur?: string }} */ s) => (g.turSutunu ? `<td class="kucuk">${s.tur === 'servis' ? '⇄ Servis' : '▭ Ekran'}</td>` : '');
  const bas = `<h2><span class="no">${g.no}</span>Sorunlar ve eğilimleri</h2>`;
  if (!g.sorunlar.length) return `${bas}<p class="bos">${g.kosuVar ? 'Bu dönemde ve önceki dönemde başarısız sonuç yok.' : 'Bu dönemde koşu yok.'}</p>`;
  /** @type {Record<string, number>} */
  const sayim = Object.fromEntries(SORUN_DURUMLARI.map((d) => [d, g.sorunlar.filter((s) => s.durum === d).length]));
  const top = (/** @type {number[]} */ a) => a.reduce((x, y) => x + y, 0);
  const oncekiTop = top(g.sorunlar.map((s) => s.nOnceki));
  const simdiTop = top(g.sorunlar.map((s) => s.n));
  let govde = '';
  for (const d of SORUN_DURUMLARI) {
    const grup = g.sorunlar.filter((s) => s.durum === d);
    if (!grup.length) continue;
    const x = /** @type {Record<string, { ad: string; simge: string; renk: string; aciklama: string }>} */ (DURUMLAR)[d];
    govde += `<tr class="grup"><td colspan="${g.turSutunu ? 6 : 5}" style="color:${x.renk}">${x.simge} ${kacis(x.ad)} (${grup.length}) <span class="kucuk" style="font-weight:400">— ${kacis(x.aciklama)}</span></td></tr>`;
    for (const s of grup) {
      govde += `<tr><td><b>${g.m(s.baslik)}</b>${s.tekrarRozeti && s.durum !== 'tekrar' ? ` ${durumEtiketi('tekrar')}` : ''}${g.hatalar && s.kalip ? `<br><span class="mono">${g.m(s.kalip)}</span>` : ''}</td>${turHucresi(s)}<td class="kucuk">${g.m(s.nerede)}${s.kritik ? ` ${KRITIK_HAP}` : ''}<br>${sinifEtiketi(s.sinif)}</td>
<td class="s">${g.karsilastir ? `<span class="notr">${s.nOnceki}</span> → ` : ''}<b>${s.n}</b><br><span class="kucuk">${s.senaryo} senaryo</span></td><td>${kivilcim(g.karsilastir ? s.oncekiSeri : [], s.seri, x.renk)}</td><td class="kucuk">${kisaTarih(s.ilk)}<br>${kisaTarih(s.son)}${s.ilkSurum ? `<br>sürüm ${g.m(s.ilkSurum)}` : ''}</td></tr>`;
    }
  }
  return `${bas}<div class="ozet-sayilar">${SORUN_DURUMLARI.filter((d) => sayim[d]).map((d) => {
    const x = /** @type {Record<string, { ad: string; simge: string; renk: string }>} */ (DURUMLAR)[d];
    return `<span class="x" style="border-color:${x.renk}"><b style="color:${x.renk}">${x.simge} ${sayim[d]}</b> ${kacis(x.ad.toLocaleLowerCase('tr'))}</span>`;
  }).join('')}<span class="x">Başarısız sonuç: <b>${g.karsilastir ? `${oncekiTop} → ` : ''}${simdiTop}</b> ${fark(simdiTop, oncekiTop, { yon: 'asagi-iyi', kapali: !g.karsilastir })}</span></div>
<table><thead><tr><th scope="col">Sorun${g.hatalar ? ' (hata kalıbı)' : ''}</th>${g.turSutunu ? '<th scope="col" style="width:52px">Tür</th>' : ''}<th scope="col" style="width:150px">Nerede · sınıf</th><th scope="col" class="s" style="width:62px">${g.karsilastir ? 'Önceki → bu' : 'Bu dönem'}</th><th scope="col" style="width:96px">Eğilim</th><th scope="col" style="width:66px">İlk / son</th></tr></thead>
<tbody>${govde}</tbody></table>
<div class="lejant"><span>Eğilim: ${g.karsilastir ? 'gri = önceki dönem, renkli = bu dönem, kesikli çizgi = dönem sınırı; ' : ''}kova başına başarısız sonuç adedi.</span></div>`;
}

/** Süre dağılımı: p50–p95 kutusu, p99'a bıyık (varsa), önceki p95 (◇).
 * @param {Array<{ ad: string; p50: number | null; p95: number | null; p99: number | null; oncekiP95: number | null; yavas: boolean }>} metotlar @param {Yazici} e */
export function sureDagilimi(metotlar, e) {
  const liste = metotlar.filter((m) => m.p50 !== null && m.p95 !== null);
  if (!liste.length) return '<p class="bos">Bu dönemde süre ölçümü yok.</p>';
  const en = 700, sol = 190, sag = 20, hh = 22;
  const ust = Math.max(...liste.map((m) => Math.max(Number(m.p99 ?? m.p95), Number(m.oncekiP95 ?? 0))));
  const mx = Math.max(1000, Math.ceil(ust / 1000) * 1000);
  const x = (/** @type {number} */ v) => sol + (v / mx) * (en - sol - sag);
  const boy = 22 + liste.length * hh + 8;
  let s = '';
  for (let v = 0; v <= mx; v += mx / 5) s += `<line x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="14" y2="${boy - 6}" stroke="#eef1f5"/><text x="${x(v).toFixed(1)}" y="10" font-size="7.6" text-anchor="middle" fill="#6b7482">${kacis(sure(v))}</text>`;
  liste.forEach((m, i) => {
    const y = 20 + i * hh + hh / 2;
    const p50 = Number(m.p50), p95 = Number(m.p95);
    const ad = m.ad.length > 34 ? `${m.ad.slice(0, 33)}…` : m.ad;
    s += `<text x="${sol - 6}" y="${y + 3}" font-size="8" text-anchor="end" fill="#24344d">${e(ad)}</text>`;
    if (m.p99 !== null) {
      s += `<line x1="${x(p50).toFixed(1)}" x2="${x(m.p99).toFixed(1)}" y1="${y}" y2="${y}" stroke="#57606a" stroke-width="1"/>`;
      s += `<line x1="${x(m.p99).toFixed(1)}" x2="${x(m.p99).toFixed(1)}" y1="${y - 4}" y2="${y + 4}" stroke="#57606a" stroke-width="1.2"/>`;
    }
    s += `<rect x="${x(p50).toFixed(1)}" y="${y - 6}" width="${Math.max(2, x(p95) - x(p50)).toFixed(1)}" height="12" fill="${m.yavas ? '#f7a8a3' : '#cfdcee'}" stroke="${m.yavas ? '#b42318' : '#1f4e8c'}" stroke-width=".8"/>`;
    s += `<line x1="${x(p50).toFixed(1)}" x2="${x(p50).toFixed(1)}" y1="${y - 6}" y2="${y + 6}" stroke="#1f4e8c" stroke-width="2"/>`;
    if (m.oncekiP95 !== null) { const o = x(m.oncekiP95); s += `<path d="M${o.toFixed(1)},${y - 5} L${(o + 4).toFixed(1)},${y} L${o.toFixed(1)},${y + 5} L${(o - 4).toFixed(1)},${y} Z" fill="#fff" stroke="#57606a" stroke-width="1"/>`; }
  });
  return `<div class="blok"><svg width="100%" viewBox="0 0 ${en} ${boy}" role="img" aria-label="Metot başına yanıt süresi dağılımı">${s}</svg>
<div class="lejant"><span>┃ p50 (kalın çizgi) · kutu p50–p95 · bıyık ucu p99 (20+ ölçümde)</span><span>◇ önceki dönem p95</span><span style="color:#b42318">kırmızı kutu = p95 ≥ %20 yavaşladı</span></div></div>`;
}

/** Öğe durum rozeti (küçük; simge + metin). @param {string} d */
export const rozetHap = (d) => {
  const x = /** @type {Record<string, string>} */ ({ saglikli: '✓ Sağlıklı', dikkat: '◆ Dikkat', kritik: '✗ Kritik' })[d] ?? '◆ Dikkat';
  return `<span class="rozet-hap rh-${['saglikli', 'dikkat', 'kritik'].includes(d) ? d : 'dikkat'}">${kacis(x)}</span>`;
};

/**
 * Oran kıvılcımı: kova başına başarı oranı (koşu olmayan kova boşluk), kesikli çizgi = yeşil eşik; son nokta simgesi banda göre
 * (● yeşil · ◆ sarı · ▲ kırmızı).
 * @param {Array<number | null>} seri @param {{ yesil: number; sari: number }} esikler
 */
export function oranKivilcimi(seri, esikler, en = 92, boy = 22) {
  const olculen = seri.filter((v) => v !== null).map(Number);
  if (!olculen.length) return '<span class="notr kucuk">koşu yok</span>';
  const alt0 = Math.max(0, Math.floor((Math.min(...olculen, esikler.sari) - 5) / 10) * 10);
  const n = Math.max(2, seri.length);
  const x = (/** @type {number} */ i) => 2 + (i * (en - 6)) / (n - 1);
  const y = (/** @type {number} */ v) => boy - 3 - ((v - alt0) / (100 - alt0 || 1)) * (boy - 6);
  let yol = '';
  let acik = false;
  seri.forEach((v, i) => { if (v === null) { acik = false; return; } yol += `${acik ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; acik = true; });
  const sonI = seri.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop() ?? 0;
  const son = Number(seri[sonI]);
  const renk = son >= esikler.yesil ? '#1a7f37' : son >= esikler.sari ? '#bf8700' : '#b42318';
  const cx = x(sonI).toFixed(1), cy = y(son).toFixed(1);
  const nokta = son >= esikler.yesil ? `<circle cx="${cx}" cy="${cy}" r="2.2" fill="${renk}"/>`
    : son >= esikler.sari ? `<rect x="${(x(sonI) - 2).toFixed(1)}" y="${(y(son) - 2).toFixed(1)}" width="4" height="4" transform="rotate(45 ${cx} ${cy})" fill="${renk}"/>`
      : `<path d="M${(x(sonI) - 2.6).toFixed(1)},${(y(son) + 2.2).toFixed(1)} L${cx},${(y(son) - 2.6).toFixed(1)} L${(x(sonI) + 2.6).toFixed(1)},${(y(son) + 2.2).toFixed(1)} Z" fill="${renk}"/>`;
  return `<svg width="${en}" height="${boy}" viewBox="0 0 ${en} ${boy}" role="img" aria-label="Kova başına başarı oranı; son ${yz(son)}">
<line x1="2" x2="${en - 2}" y1="${y(esikler.yesil).toFixed(1)}" y2="${y(esikler.yesil).toFixed(1)}" stroke="#1a7f37" stroke-width=".6" stroke-dasharray="2 2"/>
<path d="${yol.trim()}" fill="none" stroke="#1f4e8c" stroke-width="1.3"/>${nokta}</svg>`;
}

/** Sınıf renkleri (dağılım çubuğu; simge + sayı her parçada yazılır). */
const SINIF_RENKLERI = Object.freeze({ uygulama: '#b42318', veri: '#bf8700', bakim: '#3b5b8c', ortam: '#8c959f', kararsiz: '#9db4d6' });

/**
 * Hata sınıfı dağılımı: öğe başına bu dönemdeki başarısız sonuçların sınıfa göre yığılmış çubuğu.
 * @param {Array<{ ad: string; tur: string; sayilar: Record<string, number>; toplam: number }>} gruplar @param {Yazici} e @param {boolean} [turGoster]
 */
export function sinifDagilimiTablosu(gruplar, e, turGoster = false) {
  if (!gruplar.length) return '<p class="bos">Bu dönemde başarısız sonuç yok.</p>';
  const mx = Math.max(1, ...gruplar.map((g) => g.toplam));
  const renk = /** @type {Record<string, string>} */ (SINIF_RENKLERI);
  const sinif = /** @type {Record<string, { ad: string; simge: string }>} */ (SINIFLAR);
  return `<table><thead><tr><th scope="col" style="width:150px">Öğe</th><th scope="col">Başarısız sonuçların sınıfa göre dağılımı</th><th scope="col" class="s">Toplam</th></tr></thead><tbody>
${gruplar.map((g) => `<tr><td>${e(g.ad)}${turGoster ? ` <span class="kucuk">(${g.tur === 'servis' ? 'servis' : 'ekran'})</span>` : ''}</td><td><div style="display:flex;height:13px;width:${Math.max(4, (g.toplam / mx) * 100).toFixed(1)}%">${Object.entries(g.sayilar).filter(([, v]) => v > 0)
    .map(([c, v]) => `<div style="flex:${v};background:${renk[c] ?? '#8c959f'};color:#fff;font-size:7pt;font-weight:700;text-align:center;line-height:13px;border-right:1px solid #fff;overflow:hidden">${kacis(sinif[c]?.simge ?? '')}${v}</div>`).join('')}</div></td><td class="s"><b>${sy(g.toplam)}</b></td></tr>`).join('')}
</tbody></table><div class="lejant">${Object.entries(sinif).map(([c, x]) => `<span><span class="kutu-l" style="background:${renk[c]}"></span>${kacis(x.simge)} ${kacis(x.ad)}</span>`).join('')}<span>Sınıf bir tahmindir (dayanağı aksiyon satırında).</span></div>`;
}

/**
 * Üst bilgi (meta) satırları: proje, kapsam, dönem, karşılaştırılan dönem, ortam (adres yalnız seçilirse, maskeli), seçilenler,
 * oluşturulma, seçenekler. secilenler: çağıranda kaçışlanmış HTML.
 * @param {any} v rapor verisi @param {Yazici} e @param {Yazici} m @param {string} kapsam @param {string} secilenler
 * @returns {Array<[string, string]>}
 */
export function ortakMeta(v, e, m, kapsam, secilenler) {
  const ortamMetni = v.ortam ? e(v.ortam.ad) : 'Tüm ortamlar';
  const secenekler = [`Ekran görüntüsü: ${v.secenekler.goruntuler ? 'açık' : 'kapalı'}`, `Hata ayrıntısı: ${v.secenekler.hatalar ? 'açık' : 'kapalı'}`,
    `Ortam adresi: ${v.secenekler.adres ? 'açık' : 'gizli'}`].join(' · ');
  return [
    ['Proje', e(v.proje.ad)], ['Kapsam', kacis(kapsam)], ['Dönem', `${kacis(v.donem.etiket)} (${v.donem.gun} gün)`],
    ['Karşılaştırılan dönem', v.karsilastir ? kacis(v.donem.oncekiEtiket) : 'Kapalı'],
    ['Ortam', `${ortamMetni}${v.secenekler.adres && v.ortam?.adres ? `<br><span class="mono">${m(v.ortam.adres)}</span>` : ''}`],
    ['Seçilenler', secilenler], ['Oluşturulma', `${kacis(tarihSaat(v.olusturma))} · Nöbetçi`], ['Seçenekler', kacis(secenekler)]
  ];
}

/**
 * Rapor sayfası (üst bilgi + meta + gövde). Başlık ve meta değerleri çağıranda kaçışlanmış / maskelenmiş HTML'dir.
 * @param {{ baslik: string; alt: string; meta: Array<[string, string]>; govde: string }} g
 */
export function sayfaHtml(g) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>${g.baslik}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="ust"><div><h1>${g.baslik}</h1><div class="alt">${kacis(g.alt)}</div></div><span class="etiket-nobetci">Nöbetçi raporu</span></div>
<div class="meta">${g.meta.map(([a, b]) => `<div><b>${kacis(a)}</b>${b}</div>`).join('')}</div>
${g.govde}
</main>
</body>
</html>
`;
}

/** @param {string} d */
export const sonHap = (d) => (d === 'G' ? '<span class="durum-hap h-g">✓ Geçti</span>' : d === 'K' ? '<span class="durum-hap h-k">✗ Başarısız</span>' : d === 'A' ? '<span class="durum-hap h-a">○ Atlandı</span>' : '<span class="notr">—</span>');

/**
 * Yöntem notunun "Rapor verileri" satırı (A4): Ayarlar > Raporlar'daki verilerden hangileri tanımlı ve rapora nasıl girdi; tanımsız
 * olanlarda önceki (varsayılan) davranış.
 * @param {{ kritik: number; ekip: number; esik: number; surumluSonuc: number } | null | undefined} rv
 */
export function raporVerisiNotu(rv) {
  const r = rv ?? { kritik: 0, ekip: 0, esik: 0, surumluSonuc: 0 };
  return [
    r.kritik ? `Kritik işareti: ${r.kritik} öğe — öncelikte kritiklik 1; kapsamdaki kritik öğe / akış son koşusunda başarısız olduysa rozet Kritik.`
      : 'Kritik işareti yok: kritiklik 0 alınır.',
    r.ekip ? `Ekip eşlemesi: ${r.ekip} öğe — sahip önerisi öğenin ekibi; eşlenmeyenlerde sınıfın varsayılan ekibi.` : 'Ekip eşlemesi yok: sahip önerisi sınıfın varsayılan ekibidir.',
    r.esik ? `Süre eşiği: ${r.esik} öğe — p95 eşiği aşarsa “Süre eşiği aşımları”nda ve P2 ek aksiyon olarak gösterilir.` : 'Süre eşiği yok: süre grafiklerinde eşik çizgisi yoktur.',
    r.surumluSonuc ? `Uygulama sürümü: ${sy(r.surumluSonuc)} sonuç sürüm etiketli — sürüme göre başarı, sorunun başladığı sürüm; kararsızlıkta aynı sürümdeki koşular karşılaştırılır.`
      : 'Uygulama sürümü kayıtlı değil: kararsızlıkta sürüm yerine gün + model sürümü kullanılır.',
    'Bu veriler Ayarlar > Raporlar (kritik, ekip, eşik) ve ortam ayarı / koşu diyaloğunda (sürüm) girilir; Nöbetçi sürümü hiçbir adrese sormaz.'
  ].join(' ');
}

/** @param {Array<[string, string]>} ek @param {{ kritik: number; ekip: number; esik: number; surumluSonuc: number } | null} [rv] rapor verileri sayıları (A4) */
export function yontemKutusu(ek = [], rv = null) {
  const satir = [
    ['Başarı oranı', 'başarılı ÷ (başarılı + başarısız + atlanan [+ hata]); durdurulan paydaya girmez (Sonuçlar ekranıyla aynı formül). Ekran oranları yalnız tam koşulardan; servis oranları “koşu” türünden (“Dene” hariç).'],
    ['Dönem / karşılaştırma', 'Dönem: seçilen aralık (yerel saat, gün sınırı 00:00). Karşılaştırma: hemen önceki eşit uzunlukta dönem. ▲▼ = bu dönem − önceki dönem. ≤ 31 gün günlük, daha uzun haftalık kırılım.'],
    ['Sorun', 'Aynı imza = öğe + ilk başarısız adım (ekran) / metot (servis) + hata kategorisi / türü + hata kalıbı (maskeli metinden; sayılar “#”).'],
    ['Sorun durumları', 'Yeni: 90 günlük geriye bakışta yok · Artan / Azalan: maruziyete göre oran ≥ 1,5× / ≤ 0,67× ve adet farkı ≥ 2 · Çözülen: bu dönemde senaryoları ≥ 3 kez geçti, hata yok · Tekrar eden: çözülmüştü, geri geldi · Kararsız: başarısızlıkların ≥ %50’si kararsız senaryolardan (aynı senaryo, ortam, model sürümü ve uygulama sürümünde — sürüm kayıtlı değilse aynı günde — geçti↔başarısız değişimi ≥ %20, ≥ 5 koşu).'],
    ['Öncelik puanı', '100 × sınıf katsayısı × (0,30 etki + 0,25 sıklık + 0,20 eğilim + 0,15 kritiklik + 0,10 süreklilik). Sınıf: uygulama 1,0 · test verisi 0,8 · test bakımı 0,7 · ortam 0,6 · kararsız 0,5. Kritiklik: kritik işaretli öğe 1, diğer 0. Sınıf bir tahmindir; dayanağı aksiyon satırında yazar.'],
    ['Durum rozeti', 'Sağlıklı: dönem başarısı ≥ yeşil eşik ve P1 yok · Kritik: < sarı eşik ya da kapsamdaki kritik akış son koşusunda başarısız oldu ya da ≥ 3 P1 · diğer: Dikkat. Eşik ayarı: Ayarlar > Raporlar > Eşikler.'],
    ['Rapor verileri', raporVerisiNotu(rv)],
    ...ek
  ];
  return `<div class="yontem"><h3>Yöntem</h3><dl>${satir.map(([a, b]) => `<dt>${kacis(a)}</dt><dd>${kacis(b)}</dd>`).join('')}</dl></div>
<div class="gizlilik"><b>Gizlilik.</b> Rapor yerel bilgisayarda, Nöbetçi'nin kendi tarayıcı motoruyla üretildi; hiçbir veri dışarı gönderilmedi. Giriş profillerinin gizli değerleri, test verisi tablolarının gizli sütunları, Ayarlar &gt; Güvenlik &gt; Maskeleme'deki adlar, e-posta adresleri, uzun rakam dizileri ve adreslerdeki sorgu dizeleri maskelenir. İstek / yanıt gövdeleri, başlıklar, okunan değerler, giriş bilgileri ve test verisi değerleri rapora hiç girmez; ortam adresi ve ekran görüntüleri yalnız rapor alınırken seçilirse eklenir.</div>`;
}

// ---------------------------------------------------------------- A4: rapor verileri (kritik akış, uygulama sürümü, süre eşiği)

/**
 * "Kritik akış" kartı: kapsamdaki kritik işaretli öğe / akışlardan son koşusunda başarısız olanlar. Veri yoksa boş metin (kart eklenmez).
 * @param {{ toplam: number; kalan: number; ogeler: Array<{ tur: string; ad: string; son: string | null }> } | null | undefined} k @param {Yazici} e
 */
export function kritikKarti(k, e) {
  if (!k) return '';
  const kalanlar = k.ogeler.filter((o) => o.son === 'K');
  const alt = kalanlar.length
    ? `<span class="kotu fk">✗ son koşusunda başarısız oldu:</span> <span class="kucuk">${kalanlar.slice(0, 3).map((o) => e(o.ad)).join(', ')}${kalanlar.length > 3 ? ` ve ${kalanlar.length - 3} diğer` : ''}</span>`
    : `<span class="iyi fk">✓ hepsi son koşusunda geçti</span> <span class="notr">${k.ogeler.filter((o) => o.son === null).length ? `${k.ogeler.filter((o) => o.son === null).length} koşmadı` : ''}</span>`;
  return kart('Kritik akış', `${sy(k.kalan)} / ${sy(k.toplam)}`, alt, k.kalan ? 'kotu' : 'iyi');
}

/**
 * "Uygulama sürümlerine göre" tablosu: sürüm başına ekran testi / servis çağrısı başarısı, ilk / son görülme, o sürümde başlayan açık
 * sorun. Sürüm yoksa boş metin.
 * @param {{ liste: Array<{ surum: string; ekranTest: number; ekranBasari: number | null; cagri: number; servisBasari: number | null; ilk: string | null; son: string | null; baslayanSorun: number }>; toplam: number } | null | undefined} s
 * @param {{ e: Yazici; esik: { yesil: number; sari: number }; h2: (metin: string, ek?: string) => string }} y
 */
export function surumBolumu(s, y) {
  if (!s || !s.liste.length) return '';
  const { e, esik } = y;
  const ekranVar = s.liste.some((x) => x.ekranTest > 0);
  const servisVar = s.liste.some((x) => x.cagri > 0);
  return `${y.h2('Uygulama sürümlerine göre')}<table><thead><tr><th scope="col">Sürüm</th>${ekranVar ? '<th scope="col" class="s">Ekran testi</th><th scope="col" class="s">Ekran başarısı</th>' : ''}${servisVar ? '<th scope="col" class="s">Servis çağrısı</th><th scope="col" class="s">Servis başarısı</th>' : ''}<th scope="col">İlk / son görülme</th><th scope="col" class="s">Bu sürümde başlayan açık sorun</th></tr></thead><tbody>
${s.liste.map((x) => `<tr><td><b>${e(x.surum)}</b></td>${ekranVar ? `<td class="s">${sy(x.ekranTest)}</td><td class="s ${renkOran(x.ekranBasari, esik)}"><b>${yz(x.ekranBasari)}</b></td>` : ''}${servisVar ? `<td class="s">${sy(x.cagri)}</td><td class="s ${renkOran(x.servisBasari, esik)}"><b>${yz(x.servisBasari)}</b></td>` : ''}<td class="kucuk">${kisaTarih(x.ilk)} – ${kisaTarih(x.son)}</td><td class="s ${x.baslayanSorun ? 'kotu' : ''}">${sy(x.baslayanSorun)}</td></tr>`).join('')}
</tbody></table><p class="kucuk">Sürüm, koşuya bağlanan etikettir (koşu başlatılırken girilen ya da ortam ayarındaki; Nöbetçi sürümü sormaz). Yalnız bu dönemin etiketli sonuçları${s.toplam > s.liste.length ? `; en yeni ${s.liste.length} sürüm (toplam ${s.toplam})` : ''}. “Başlayan sorun” = ilk görüldüğü sonuç bu sürümde olan açık sorun.</p>`;
}

/**
 * Süre eşiği aşımları (kullanıcı tanımlı eşik; p95 > eşik = aştı). Eşik yoksa boş metin.
 * @param {Array<{ tur: string; oge: string; metot: string | null; esik: number; p95: number | null; asan: number; olculen: number; oncekiAsan: number; asti: boolean; kaynak?: string }> | null | undefined} l
 * @param {{ e: Yazici; k: boolean }} y
 */
export function esikTablosu(l, y) {
  if (!l || !l.length) return '';
  const { e, k } = y;
  const asan = l.filter((x) => x.asti).length;
  return `<h3>Süre eşiği aşımları (${asan} / ${l.length})</h3><table><thead><tr><th scope="col">Öğe › metot</th><th scope="col" class="s">Eşik</th><th scope="col" class="s">Bu dönem p95</th><th scope="col" class="s">Eşiği aşan ölçüm</th>${k ? '' : '<th scope="col" class="s">Önceki dönem aşan</th>'}<th scope="col">Durum</th></tr></thead><tbody>
${l.map((x) => `<tr><td>${e(x.oge)}${x.metot ? ` › <span class="mono" style="color:#1c2430">${e(x.metot)}</span>` : ` <span class="kucuk">(${x.tur === 'ekran' ? 'test süresi' : 'servis'})</span>`}${x.kaynak === 'servis' && x.metot ? ' <span class="kucuk">(servis eşiği)</span>' : ''}</td><td class="s">${kacis(sure(x.esik))}</td><td class="s ${x.asti ? 'kotu' : ''}"><b>${kacis(sure(x.p95))}</b></td><td class="s">${sy(x.asan)} / ${sy(x.olculen)}</td>${k ? '' : `<td class="s notr">${sy(x.oncekiAsan)}</td>`}<td>${x.asti ? '<span class="durum-hap h-k">✗ Aştı</span>' : x.olculen ? '<span class="durum-hap h-g">✓ Eşik içinde</span>' : '<span class="notr">ölçüm yok</span>'}</td></tr>`).join('')}
</tbody></table><p class="kucuk">Eşikler Ayarlar &gt; Raporlar'da öğe (ve servis için metot) başına tanımlanır. p95 eşiği aşarsa aksiyon listesine P2 olarak girer. Ekran: tam koşu test süresi; servis: çağrı süresi (yanıt gelmeyen “hata” hariç).</p>`;
}
