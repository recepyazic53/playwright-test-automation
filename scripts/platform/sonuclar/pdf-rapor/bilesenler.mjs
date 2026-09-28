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
<div class="lejant"><span><span class="kutu-l" style="background:#cfdcee"></span>${kacis(g.adetEtiketi)} (sağ eksen)</span><span><span class="kutu-l" style="background:#f4a3a0"></span>Kalan</span><span>— Başarı oranı (sol eksen): ● ≥ yeşil eşik · ◆ sarı bant · ▲ kırmızı bant</span>${oncekiOrt !== null ? `<span>- - önceki dönem ortalaması ${yz(oncekiOrt)}</span>` : ''}<span style="color:#1a7f37">- - yeşil eşik %${sy(g.esikler.yesil)}</span><span>Sol eksen alt sınırı %${sy(alt0)}.</span></div></div>`;
}

/** Süre eğilimi: p50 ve p95 çizgileri (ms), önceki dönem p95 kesikli. Ölçüm olmayan kova boş kalır.
 * @param {{ etiketler: string[]; p50: Array<number | null>; p95: Array<number | null>; oncekiP95: number | null; baslik: string }} g */
export function sureGrafigi(g) {
  const en = 700, boy = 150, sol = 46, sag = 12, ust = 10, alt = 22;
  const genislik = en - sol - sag, h = boy - ust - alt;
  const n = Math.max(1, g.etiketler.length);
  const x = (/** @type {number} */ i) => sol + (genislik / n) * (i + 0.5);
  const degerler = [...g.p95, ...g.p50, g.oncekiP95].filter((v) => v !== null).map(Number);
  const mx = Math.max(500, Math.ceil(Math.max(0, ...degerler) / 500) * 500);
  const y = (/** @type {number} */ v) => ust + h - (v / mx) * h;
  let s = '';
  for (let v = 0; v <= mx; v += mx / 4) s += `<line x1="${sol}" x2="${en - sag}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#eef1f5"/><text x="${sol - 4}" y="${(y(v) + 3).toFixed(1)}" font-size="8" text-anchor="end" fill="#6b7482">${kacis(sure(v))}</text>`;
  const etiketAdimi = Math.ceil(n / 16);
  g.etiketler.forEach((d, i) => { if (i % etiketAdimi === 0) s += `<text x="${x(i).toFixed(1)}" y="${boy - 8}" font-size="7.6" text-anchor="middle" fill="#57606a">${kacis(d)}</text>`; });
  if (g.oncekiP95 !== null) s += `<line x1="${sol}" x2="${en - sag}" y1="${y(g.oncekiP95).toFixed(1)}" y2="${y(g.oncekiP95).toFixed(1)}" stroke="#6b7482" stroke-dasharray="6 3"/><text x="${sol + 4}" y="${(y(g.oncekiP95) - 3).toFixed(1)}" font-size="7.5" fill="#57606a">önceki dönem p95 ${kacis(sure(g.oncekiP95))}</text>`;
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
<div class="lejant"><span>● p95 (koyu çizgi)</span><span>■ p50 / medyan (açık çizgi)</span><span>- - önceki dönem p95</span><span>Metot süre eşiği henüz tanımlı değil (çizgi yok).</span></div></div>`;
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
<div class="lejant"><span><span class="kutu-l" style="background:#fff"></span>0</span><span><span class="kutu-l" style="background:#fde2e0"></span>1</span><span><span class="kutu-l" style="background:#f7a8a3"></span>2–3</span><span><span class="kutu-l" style="background:#d9534f"></span>4+</span><span>Hücredeki sayı = o gün o adımda kalan test adedi; her kalan test yalnız ilk başarısız adımına sayılır.</span></div></div>`;
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
<div class="lejant"><span class="h-g">✓ geçti</span><span class="h-k">✗ kaldı</span><span class="h-a">○ atlandı</span><span class="h-a">· koşmadı</span><span>Sütunlar: dönemdeki son ${g.etiketler.length} tam koşu (soldan sağa eskiden yeniye). Başarı sütunu yalnız koşan hücrelerden.</span></div>`;
}

/**
 * @typedef {{ baslik: string; nerede: string; sinif: string; durum: string; puan: number; bant: string; aksiyon: string; sahip: string; neden: string;
 *   dayanak?: string; tur?: string }} AksiyonSatiri
 */

/** @param {{ no: number; aksiyonlar: AksiyonSatiri[]; bantSayim: { P1: number; P2: number; P3: number }; e: Yazici; m: Yazici }} g */
export function aksiyonTablosu(g) {
  const bas = `<h2><span class="no">${g.no}</span>Ele alınması gerekenler</h2>
<p class="kucuk">Öncelik puanı sıralı (0–100). <b>P1</b> ≥ 60 bu hafta, <b>P2</b> 35–59 bu dönem, <b>P3</b> &lt; 35 izlenir. Toplam: ${g.bantSayim.P1} P1 · ${g.bantSayim.P2} P2 · ${g.bantSayim.P3} P3; aşağıda ilk ${g.aksiyonlar.length} aksiyon.</p>`;
  if (!g.aksiyonlar.length) return `${bas}<p class="bos">Ele alınması gereken açık sorun yok.</p>`;
  return `${bas}<table><thead><tr><th scope="col" style="width:52px">Öncelik</th><th scope="col">Ne / nerede</th><th scope="col" style="width:150px">Neden şimdi</th><th scope="col" style="width:170px">Önerilen aksiyon</th><th scope="col" style="width:96px">Sahip önerisi</th></tr></thead><tbody>
${g.aksiyonlar.map((s) => `<tr><td>${puanEtiketi(s.bant, s.puan)}</td><td><b>${g.m(s.baslik)}</b><br><span class="kucuk">${g.m(s.nerede)}</span><br>${s.sinif === 'kararsiz' && s.durum === 'kararsiz' ? durumEtiketi(s.durum) : `${sinifEtiketi(s.sinif)} ${durumEtiketi(s.durum)}`}${s.dayanak ? `<br><span class="kucuk">Tahmin dayanağı: ${kacis(s.dayanak)}</span>` : ''}</td>
<td class="kucuk">${kacis(s.neden)}</td><td class="kucuk">${kacis(s.aksiyon)}</td><td class="kucuk">${kacis(s.sahip)}</td></tr>`).join('')}
</tbody></table>`;
}

/**
 * @param {{ no: number; sorunlar: Array<AksiyonSatiri & { kalip: string; n: number; nOnceki: number; senaryo: number; seri: number[]; oncekiSeri: number[];
 *   ilk: string | null; son: string | null; tekrarRozeti: boolean }>; hatalar: boolean; karsilastir: boolean; kosuVar: boolean; m: Yazici }} g
 */
export function sorunTablosu(g) {
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
    govde += `<tr class="grup"><td colspan="5" style="color:${x.renk}">${x.simge} ${kacis(x.ad)} (${grup.length}) <span class="kucuk" style="font-weight:400">— ${kacis(x.aciklama)}</span></td></tr>`;
    for (const s of grup) {
      govde += `<tr><td><b>${g.m(s.baslik)}</b>${s.tekrarRozeti && s.durum !== 'tekrar' ? ` ${durumEtiketi('tekrar')}` : ''}${g.hatalar && s.kalip ? `<br><span class="mono">${g.m(s.kalip)}</span>` : ''}</td><td class="kucuk">${g.m(s.nerede)}<br>${sinifEtiketi(s.sinif)}</td>
<td class="s">${g.karsilastir ? `<span class="notr">${s.nOnceki}</span> → ` : ''}<b>${s.n}</b><br><span class="kucuk">${s.senaryo} senaryo</span></td><td>${kivilcim(g.karsilastir ? s.oncekiSeri : [], s.seri, x.renk)}</td><td class="kucuk">${kisaTarih(s.ilk)}<br>${kisaTarih(s.son)}</td></tr>`;
    }
  }
  return `${bas}<div class="ozet-sayilar">${SORUN_DURUMLARI.filter((d) => sayim[d]).map((d) => {
    const x = /** @type {Record<string, { ad: string; simge: string; renk: string }>} */ (DURUMLAR)[d];
    return `<span class="x" style="border-color:${x.renk}"><b style="color:${x.renk}">${x.simge} ${sayim[d]}</b> ${kacis(x.ad.toLocaleLowerCase('tr'))}</span>`;
  }).join('')}<span class="x">Başarısız sonuç: <b>${g.karsilastir ? `${oncekiTop} → ` : ''}${simdiTop}</b> ${fark(simdiTop, oncekiTop, { yon: 'asagi-iyi', kapali: !g.karsilastir })}</span></div>
<table><thead><tr><th scope="col">Sorun${g.hatalar ? ' (hata kalıbı)' : ''}</th><th scope="col" style="width:150px">Nerede · sınıf</th><th scope="col" class="s" style="width:62px">${g.karsilastir ? 'Önceki → bu' : 'Bu dönem'}</th><th scope="col" style="width:96px">Eğilim</th><th scope="col" style="width:66px">İlk / son</th></tr></thead>
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

/** @param {string} d */
export const sonHap = (d) => (d === 'G' ? '<span class="durum-hap h-g">✓ Geçti</span>' : d === 'K' ? '<span class="durum-hap h-k">✗ Kaldı</span>' : d === 'A' ? '<span class="durum-hap h-a">○ Atlandı</span>' : '<span class="notr">—</span>');

/** @param {Array<[string, string]>} ek */
export function yontemKutusu(ek = []) {
  const satir = [
    ['Başarı oranı', 'başarılı ÷ (başarılı + başarısız + atlanan [+ hata]); durdurulan paydaya girmez (Sonuçlar ekranıyla aynı formül). Ekran oranları yalnız tam koşulardan; servis oranları “koşu” türünden (“Dene” hariç).'],
    ['Dönem / karşılaştırma', 'Dönem: seçilen aralık (yerel saat, gün sınırı 00:00). Karşılaştırma: hemen önceki eşit uzunlukta dönem. ▲▼ = bu dönem − önceki dönem. ≤ 31 gün günlük, daha uzun haftalık kırılım.'],
    ['Sorun', 'Aynı imza = öğe + ilk başarısız adım (ekran) / metot (servis) + hata kategorisi / türü + hata kalıbı (maskeli metinden; sayılar “#”).'],
    ['Sorun durumları', 'Yeni: 90 günlük geriye bakışta yok · Artan / Azalan: maruziyete göre oran ≥ 1,5× / ≤ 0,67× ve adet farkı ≥ 2 · Çözülen: bu dönemde senaryoları ≥ 3 kez geçti, hata yok · Tekrar eden: çözülmüştü, geri geldi · Kararsız: başarısızlıkların ≥ %50’si kararsız senaryolardan (aynı senaryo, ortam, gün ve model sürümünde geçti↔kaldı değişimi ≥ %20, ≥ 5 koşu).'],
    ['Öncelik puanı', '100 × sınıf katsayısı × (0,30 etki + 0,25 sıklık + 0,20 eğilim + 0,15 kritiklik + 0,10 süreklilik). Sınıf: uygulama 1,0 · test verisi 0,8 · test bakımı 0,7 · ortam 0,6 · kararsız 0,5. Sınıf bir tahmindir; dayanağı aksiyon satırında yazar.'],
    ['Durum rozeti', 'Sağlıklı: dönem başarısı ≥ yeşil eşik ve P1 yok · Kritik: < sarı eşik ya da kapsamdaki kritik akış son koşusunda kaldı ya da ≥ 3 P1 · diğer: Dikkat. Eşikler Ayarlar > Arayüz > Sağlık noktası.'],
    ['Henüz olmayan veri', 'Kritik akış işareti, ekip eşlemesi, uygulama sürümü ve metot süre eşiği tanımlı değil: kritiklik 0 alınır, sahip önerisi sınıfın varsayılan ekibidir, kararsızlıkta sürüm yerine gün + model sürümü kullanılır, süre grafiklerinde eşik çizgisi yoktur.'],
    ...ek
  ];
  return `<div class="yontem"><h3>Yöntem</h3><dl>${satir.map(([a, b]) => `<dt>${kacis(a)}</dt><dd>${kacis(b)}</dd>`).join('')}</dl></div>
<div class="gizlilik"><b>Gizlilik.</b> Rapor yerel bilgisayarda, Nöbetçi'nin kendi tarayıcı motoruyla üretildi; hiçbir veri dışarı gönderilmedi. Giriş profillerinin gizli değerleri, test verisi tablolarının gizli sütunları, Ayarlar &gt; Güvenlik &gt; Maskeleme'deki adlar, e-posta adresleri, uzun rakam dizileri ve adreslerdeki sorgu dizeleri maskelenir. İstek / yanıt gövdeleri, başlıklar, okunan değerler, giriş bilgileri ve test verisi değerleri rapora hiç girmez; ortam adresi ve ekran görüntüleri yalnız rapor alınırken seçilirse eklenir.</div>`;
}
