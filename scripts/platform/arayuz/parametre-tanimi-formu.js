// TEST VERİSİ ORTAK YARDIMCILARI: değer çipleri (ilk n değer) ve Excel / CSV okuyucu (Tablolar ekranı içe alma).
import { h } from './ortak.js';
import { degerEtiketi } from './parametre-tanimlari.mjs';

/** Değer çipleri: ilk n değer + "+k". @param {Array<{ deger: string; aciklama?: string }>} degerler @param {number} [n] */
export function degerCipleri(degerler, n = 6) {
  if (!degerler.length) return h('span', { class: 'cok-soluk' }, '—');
  return h('span', { class: 'deger-cipleri' },
    degerler.slice(0, n).map((x) => h('span', { class: 'deger-cipi', title: x.aciklama || null }, degerEtiketi(x))),
    degerler.length > n ? h('span', { class: 'soluk kucuk', title: degerler.slice(n).map(degerEtiketi).join(', ') }, `+${degerler.length - n}`) : null);
}

/**
 * Excel (.xlsx) / CSV / TXT dosyasının ilk sayfası satırlar olarak (her satır hücre metinleri dizisi). Kütüphane kullanılmaz:
 * .xlsx bir ZIP'tir; tarayıcının DecompressionStream'i ile açılır, sayfa ve ortak metinler DOMParser ile okunur.
 * Eski ikili .xls desteklenmez (xlsx ya da csv olarak kaydedilmeli).
 * @param {File} dosya @returns {Promise<string[][]>}
 */
export async function tabloOku(dosya) {
  if (/\.(csv|txt)$/i.test(dosya.name)) {
    const metin = (await dosya.text()).replace(/^﻿/, '');
    const ilk = metin.split(/\r?\n/, 1)[0] || '';
    const ayrac = ilk.includes('\t') ? '\t' : ilk.includes(';') ? ';' : ',';
    return metin.split(/\r?\n/).filter((x) => x.trim()).map((x) => x.split(ayrac).map((y) => y.trim().replace(/^"|"$/g, '')));
  }
  if (/\.xls$/i.test(dosya.name)) throw new Error('Eski .xls biçimi okunamıyor; dosyayı Excel\'de .xlsx ya da .csv olarak kaydedin.');
  const zip = new Uint8Array(await dosya.arrayBuffer());
  const g = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let son = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (g.getUint32(i, true) === 0x06054b50) { son = i; break; }
  if (son < 0) throw new Error('Dosya .xlsx değil.');
  /** @type {Map<string, { yontem: number; boyut: number; yerel: number }>} */
  const girdiler = new Map();
  let p = g.getUint32(son + 16, true);
  for (let n = g.getUint16(son + 10, true); n > 0; n--) {
    if (g.getUint32(p, true) !== 0x02014b50) break;
    const adUz = g.getUint16(p + 28, true);
    const ad = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + adUz));
    girdiler.set(ad, { yontem: g.getUint16(p + 10, true), boyut: g.getUint32(p + 20, true), yerel: g.getUint32(p + 42, true) });
    p += 46 + adUz + g.getUint16(p + 30, true) + g.getUint16(p + 32, true);
  }
  const oku = async (ad) => {
    const e = girdiler.get(ad);
    if (!e) return null;
    const bas = e.yerel + 30 + g.getUint16(e.yerel + 26, true) + g.getUint16(e.yerel + 28, true);
    const ham = zip.subarray(bas, bas + e.boyut);
    const veri = e.yontem === 0 ? ham : new Uint8Array(await new Response(new Blob([ham]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    return new DOMParser().parseFromString(new TextDecoder().decode(veri), 'application/xml');
  };
  // İlk sayfa: workbook.xml'deki ilk <sheet> → ilişki dosyasındaki hedef.
  let sayfaYolu = 'xl/worksheets/sheet1.xml';
  const kitap = await oku('xl/workbook.xml');
  const iliski = await oku('xl/_rels/workbook.xml.rels');
  const ilkSayfa = kitap?.getElementsByTagName('sheet')[0];
  const rid = ilkSayfa ? ilkSayfa.getAttribute('r:id') || ilkSayfa.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') : null;
  const hedef = rid && iliski ? [...iliski.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target') : null;
  if (hedef) sayfaYolu = hedef.startsWith('/') ? hedef.slice(1) : `xl/${hedef.replace(/^\.\//, '')}`;
  const ortak = await oku('xl/sharedStrings.xml');
  const metinler = ortak ? [...ortak.getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((x) => x.textContent || '').join('')) : [];
  const sayfa = await oku(sayfaYolu);
  if (!sayfa) throw new Error('Sayfa bulunamadı.');
  const sutun = (ref) => { let n = 0; for (const c of (ref.match(/^[A-Z]+/) || ['A'])[0]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
  return [...sayfa.getElementsByTagName('row')].map((r) => {
    /** @type {string[]} */
    const satir = [];
    for (const c of r.getElementsByTagName('c')) {
      const tip = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const deger = tip === 's' ? metinler[Number(v)] ?? '' : tip === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent || '').join('') : tip === 'b' ? (v === '1' ? 'true' : 'false') : v;
      satir[sutun(c.getAttribute('r') || 'A')] = deger;
    }
    return Array.from(satir, (x) => x ?? '');
  }).filter((x) => x.some((y) => String(y).trim()));
}
