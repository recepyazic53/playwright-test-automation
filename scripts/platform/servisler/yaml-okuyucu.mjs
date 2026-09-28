// YAML OKUYUCU (küçük alt küme; bağımlılıksız) — OpenAPI / Swagger ve JSON Schema dosyalarının YAML hâli için.
// Desteklenen: blok eşlemeler ve diziler (girinti), "- anahtar: değer" satırları, düz / tek tırnaklı / çift tırnaklı metinler,
// sayı / true / false / null, akış biçimi [a, b] ve { a: b }, blok metinler (| ve >; -/+ uç işaretleri), yorumlar (#), tek belge.
// Desteklenmeyen (açık hatayla): çapa / takma ad (& *), birden çok belge, girintide sekme.

export class YamlHatasi extends Error {
  /** @param {string} mesaj @param {number} [satir] */
  constructor(mesaj, satir) { super(satir === undefined ? `YAML: ${mesaj}` : `YAML ${satir}. satır: ${mesaj}`); this.name = 'YamlHatasi'; }
}

/** Tırnak dışındaki yorumu atar. @param {string} s */
function yorumSil(s) {
  let tek = false;
  let cift = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !cift) tek = !tek;
    else if (c === '"' && !tek && s[i - 1] !== '\\') cift = !cift;
    else if (c === '#' && !tek && !cift && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s;
}

/** Düz metin → değer. @param {string} s @param {number} satir */
function duzDeger(s, satir) {
  const t = s.trim();
  if (/^[&*]/.test(t)) throw new YamlHatasi('çapa / takma ad (& *) desteklenmez.', satir);
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (/^(true|True|TRUE)$/.test(t)) return true;
  if (/^(false|False|FALSE)$/.test(t)) return false;
  if (/^[-+]?\d+$/.test(t) && !/^[-+]?0\d/.test(t)) return Number(t);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(t) && !/^[-+]?0\d/.test(t)) return Number(t);
  return t;
}

/** Çift tırnaklı metnin kaçışları. @param {string} s */
const ciftCoz = (s) => s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, k) => {
  if (k[0] === 'u' || k[0] === 'x') return String.fromCharCode(parseInt(k.slice(1), 16));
  return /** @type {Record<string, string>} */ ({ n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', '\\': '\\', '/': '/' })[k] ?? k;
});

/**
 * Tek satırlık değer (tırnaklı, akış biçimi ya da düz). Etiket (!!str) yok sayılır.
 * @param {string} ham @param {number} satir @returns {unknown}
 */
function satirDegeri(ham, satir) {
  let s = ham.trim().replace(/^!\S*\s*/, '');
  if (s.startsWith('[') || s.startsWith('{')) {
    const p = { s, i: 0 };
    const v = akisDegeri(p, satir);
    bosluk(p);
    if (p.i < s.length) throw new YamlHatasi('akış biçiminden sonra beklenmeyen metin.', satir);
    return v;
  }
  if (s.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"\s*$/.exec(s);
    if (!m) throw new YamlHatasi('kapanmamış çift tırnak.', satir);
    return ciftCoz(m[1]);
  }
  if (s.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'\s*$/.exec(s);
    if (!m) throw new YamlHatasi('kapanmamış tek tırnak.', satir);
    return m[1].replace(/''/g, "'");
  }
  s = s.trim();
  return duzDeger(s, satir);
}

/** @param {{ s: string; i: number }} p */
const bosluk = (p) => { while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++; };

/** Akış biçimi ([…], {…}). @param {{ s: string; i: number }} p @param {number} satir @returns {unknown} */
function akisDegeri(p, satir) {
  bosluk(p);
  const c = p.s[p.i];
  if (c === '[') {
    p.i++;
    const dizi = [];
    bosluk(p);
    if (p.s[p.i] === ']') { p.i++; return dizi; }
    for (;;) {
      dizi.push(akisDegeri(p, satir));
      bosluk(p);
      if (p.s[p.i] === ',') { p.i++; continue; }
      if (p.s[p.i] === ']') { p.i++; return dizi; }
      throw new YamlHatasi('akış dizisi kapanmamış.', satir);
    }
  }
  if (c === '{') {
    p.i++;
    /** @type {Record<string, unknown>} */
    const o = {};
    bosluk(p);
    if (p.s[p.i] === '}') { p.i++; return o; }
    for (;;) {
      const k = akisDegeri(p, satir);
      bosluk(p);
      if (p.s[p.i] !== ':') throw new YamlHatasi('akış eşlemesinde ":" bekleniyordu.', satir);
      p.i++;
      o[String(k)] = akisDegeri(p, satir);
      bosluk(p);
      if (p.s[p.i] === ',') { p.i++; continue; }
      if (p.s[p.i] === '}') { p.i++; return o; }
      throw new YamlHatasi('akış eşlemesi kapanmamış.', satir);
    }
  }
  if (c === '"' || c === "'") {
    const m = c === '"' ? /^"((?:[^"\\]|\\.)*)"/.exec(p.s.slice(p.i)) : /^'((?:[^']|'')*)'/.exec(p.s.slice(p.i));
    if (!m) throw new YamlHatasi('kapanmamış tırnak.', satir);
    p.i += m[0].length;
    return c === '"' ? ciftCoz(m[1]) : m[1].replace(/''/g, "'");
  }
  const bas = p.i;
  while (p.i < p.s.length && !/[,\]}]/.test(p.s[p.i]) && !(p.s[p.i] === ':' && /\s/.test(p.s[p.i + 1] ?? ' '))) p.i++;
  return duzDeger(p.s.slice(bas, p.i), satir);
}

/** "anahtar: değer" satırı (anahtar tırnaklı olabilir). */
const ANAHTAR = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#[\]{},&*!|>-][^#]*?|-[^\s#][^#]*?)\s*:(?:\s+(.*))?$/;

/**
 * YAML metni → değer.
 * @param {string} metin @returns {unknown}
 */
export function yamlOku(metin) {
  /** @type {Array<{ ind: number; metin: string; ham: string; no: number; bos: boolean }>} */
  const satirlar = [];
  let belgeSayisi = 0;
  for (const [n, ham] of String(metin).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').entries()) {
    if (/^---(\s|$)/.test(ham)) { if (++belgeSayisi > 1 || satirlar.some((x) => !x.bos)) throw new YamlHatasi('birden çok belge desteklenmez.', n + 1); continue; }
    if (/^\.\.\.(\s|$)/.test(ham)) break;
    if (/^%/.test(ham)) continue;
    const girinti = /^[ \t]*/.exec(ham)?.[0] ?? '';
    const t = yorumSil(ham.trim());
    if (!t) { satirlar.push({ ind: 0, metin: '', ham, no: n + 1, bos: true }); continue; }
    if (girinti.includes('\t')) throw new YamlHatasi('girintide sekme kullanılamaz.', n + 1);
    satirlar.push({ ind: girinti.length, metin: t, ham, no: n + 1, bos: false });
  }
  let i = 0;
  const atla = () => { while (i < satirlar.length && satirlar[i].bos) i++; };
  const diziSatiri = (/** @type {string} */ t) => t === '-' || t.startsWith('- ');

  /** Blok metin (| ya da >). @param {string} gosterge @param {number} ustInd @returns {string} */
  const blokMetin = (gosterge, ustInd) => {
    const katla = gosterge.startsWith('>');
    const uc = gosterge.includes('-') ? '-' : gosterge.includes('+') ? '+' : '';
    /** @type {string[]} */
    const parcalar = [];
    let blokInd = -1;
    while (i < satirlar.length) {
      const s = satirlar[i];
      if (!s.bos) {
        if (s.ind <= ustInd) break;
        if (blokInd < 0) blokInd = s.ind;
        if (s.ind < blokInd) break;
        parcalar.push(s.ham.slice(blokInd));
      } else parcalar.push('');
      i++;
    }
    let sonBos = 0;
    while (parcalar.length && parcalar[parcalar.length - 1] === '') { parcalar.pop(); sonBos++; }
    let govde = katla ? parcalar.reduce((a, x, k) => (k === 0 ? x : x === '' ? `${a}\n` : a.endsWith('\n') ? `${a}${x}` : `${a} ${x}`), '') : parcalar.join('\n');
    if (uc === '+') govde += '\n'.repeat(sonBos + 1);
    else if (uc === '') govde += parcalar.length ? '\n' : '';
    return govde;
  };

  /** Bir satırlık değer (+ düz metnin devam satırları). @param {string} deger @param {number} ind @param {number} no */
  const satirSonu = (deger, ind, no) => {
    const d = deger.trim();
    if (/^[|>][-+]?\d*$/.test(d)) return blokMetin(d, ind);
    if (/^[&*]/.test(d)) throw new YamlHatasi('çapa / takma ad (& *) desteklenmez.', no);
    let v = satirDegeri(d, no);
    // Düz çok satırlı metin: sonraki daha girintili (anahtar / dizi olmayan) satırlar boşlukla eklenir.
    if (typeof v === 'string' && !/^["'[{]/.test(d)) {
      for (;;) {
        const k = i;
        atla();
        const s = satirlar[i];
        if (!s || s.ind <= ind || diziSatiri(s.metin) || ANAHTAR.test(s.metin)) { i = k; break; }
        v = `${v} ${s.metin}`;
        i++;
      }
    }
    return v;
  };

  /** @param {number} enAz @returns {unknown} */
  const dugum = (enAz) => {
    atla();
    const s = satirlar[i];
    if (!s || s.ind < enAz) return null;
    if (diziSatiri(s.metin)) return dizi(s.ind);
    if (ANAHTAR.test(s.metin)) return esleme(s.ind);
    i++;
    return satirSonu(s.metin, s.ind - 1, s.no);
  };

  /** @param {number} ind */
  const dizi = (ind) => {
    const sonuc = [];
    for (;;) {
      atla();
      const s = satirlar[i];
      if (!s || s.ind !== ind || !diziSatiri(s.metin)) break;
      const ic = s.metin === '-' ? '' : s.metin.slice(2);
      const icTrim = ic.trimStart();
      if (!icTrim) { i++; sonuc.push(dugum(ind + 1)); continue; }
      const kayma = ind + 2 + (ic.length - icTrim.length);
      if (ANAHTAR.test(icTrim) || diziSatiri(icTrim)) {
        // "- anahtar: değer": satır, içeriğin sütununda başlayan bir eşleme / dizi gibi okunur.
        satirlar[i] = { ...s, ind: kayma, metin: icTrim };
        sonuc.push(diziSatiri(icTrim) ? dizi(kayma) : esleme(kayma));
        continue;
      }
      i++;
      sonuc.push(satirSonu(icTrim, ind, s.no));
    }
    return sonuc;
  };

  /** @param {number} ind */
  const esleme = (ind) => {
    /** @type {Record<string, unknown>} */
    const o = {};
    for (;;) {
      atla();
      const s = satirlar[i];
      if (!s || s.ind < ind) break;
      if (s.ind > ind) throw new YamlHatasi('beklenmeyen girinti.', s.no);
      const m = ANAHTAR.exec(s.metin);
      if (!m) { if (diziSatiri(s.metin)) break; throw new YamlHatasi('"anahtar: değer" bekleniyordu.', s.no); }
      const hamAnahtar = m[1].trim();
      if (hamAnahtar === '<<') throw new YamlHatasi('birleştirme anahtarı (<<) desteklenmez.', s.no);
      const anahtar = hamAnahtar.startsWith('"') ? ciftCoz(hamAnahtar.slice(1, -1)) : hamAnahtar.startsWith("'") ? hamAnahtar.slice(1, -1).replace(/''/g, "'") : hamAnahtar;
      i++;
      const deger = m[2];
      if (deger === undefined || !deger.trim()) {
        const k = i;
        atla();
        const sonraki = satirlar[i];
        i = k;
        // "anahtar:" altındaki dizi aynı girintide de başlayabilir.
        o[anahtar] = sonraki && sonraki.ind === ind && diziSatiri(sonraki.metin) ? dizi(ind) : dugum(ind + 1);
      } else o[anahtar] = satirSonu(deger, ind, s.no);
    }
    return o;
  };

  const sonuc = dugum(0);
  atla();
  if (i < satirlar.length) throw new YamlHatasi('okunamayan satır.', satirlar[i].no);
  return sonuc;
}
