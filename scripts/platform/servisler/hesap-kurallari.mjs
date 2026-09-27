// SERVİS TESTLERİ — hesaplama kuralları (ORTAK: sunucu ve arayüz; /arayuz/hesap-kurallari.mjs olarak sunulur). Node modülü İÇE AKTARMAZ.
// GÜVENLİ: eval / Function YOK. Küçük bir ayrıştırıcı ifadeyi ağaca çevirir, ağaç yalnız aşağıdaki işlemlerle değerlendirilir; ad arama
// yalnız kendi tablolarımızda (Object.hasOwn) yapılır — "constructor", "__proto__" gibi adlar tanımsız ad hatası verir.
//
// Kural: "İFADE | BİÇİM" (biçim isteğe bağlı; son üst düzey "|" ayırır). Servis ayarındaki tarihKurallari bütün hesaplama kurallarını
// tutar (ad geriye uyum için korundu; eski "bugun+1y|yyyy-MM-dd" kuralları aynen çalışır).
// İfade dili:
//   · başvurular: ${X} (senaryonun parametresi / tablo sütunu ${Tablo.Sütun}; koşuda çözülmüş değer) · ${akis:Ad} · başka kural adı
//   · sayılar, 'metin' (tek ya da çift tırnak), dört işlem + - * / ve %, parantez, tekli eksi; karşılaştırma = != < > <= >=
//   · süre: 1y (yıl) 3a (ay) 10g (gün) 2s (saat) → tarih ± süre (ör. BEGIN_DATE+1y, bugun-30g)
//   · sabitler: bugun, simdi (koşunun anı), dogru, yanlis
//   · fonksiyonlar: yuvarla, asagiYuvarla, yukariYuvarla, mutlak, min, max, uzunluk, birlestir, buyukHarf, kucukHarf, parca, eger,
//     bosIse, tarih, gunFarki, sayi
// "+": iki sayı (ya da sayıya benzeyen iki metin) toplanır, metinler birleşir, tarih + süre ileri alır. Sayılar ondalık hatası
// göstermez (0.1 + 0.2 → 0.3). Sonuç: tarih → biçimle (varsayılan: kullanıcının tarih biçimi); sayı → "0.00" / "#,##0.00" biçimi
// (ondalık ayırıcı biçimden: "0,00" virgül) ya da nokta ondalıklı düz yazım.
// Değerlendirme: başvurulan kurallar önce (bağımlılık sırası); aynı hesapta (önbellek) her kural bir kez hesaplanır; döngü hatadır.

export const VARSAYILAN_TARIH_BICIMI = "yyyy-MM-dd'T'HH:mm:ss";
/** Kural adı (gövdede ${AD}). */
export const KURAL_ADI = /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/;
const SABITLER = new Set(['bugun', 'simdi', 'dogru', 'yanlis']);
const AY_MS = 864e5;

export class HesapHatasi extends Error {
  /** @param {string} mesaj @param {string} [tur] */
  constructor(mesaj, tur = 'hesap') {
    super(mesaj);
    this.name = 'HesapHatasi';
    this.tur = tur;
  }
}

/**
 * @typedef {{ sure: true; n: number; birim: 'y' | 'a' | 'g' | 's' }} Sure
 * @typedef {number | string | boolean | Date | Sure | null} Deger
 * @typedef {{ tur: string; [k: string]: any }} Dugum
 * @typedef {{ simdi: Date; ref?: (ad: string) => string | undefined; akis?: (ad: string) => string | undefined; onbellek?: Map<string, Deger>;
 *   yigin?: string[] }} Baglam
 */

// ---------------------------------------------------------------------------------------------------------------------------
// Biçimler
// ---------------------------------------------------------------------------------------------------------------------------

/** @param {Date} t @param {string} bicim */
export function tarihBicimle(t, bicim) {
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const p = { yyyy: String(t.getFullYear()), MM: iki(t.getMonth() + 1), dd: iki(t.getDate()), HH: iki(t.getHours()), mm: iki(t.getMinutes()), ss: iki(t.getSeconds()) };
  return bicim.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, sabit) => (sabit !== undefined ? sabit : p[/** @type {keyof typeof p} */ (m)]));
}

/** Ondalık hatasız sayı (0.30000000000000004 → 0.3). @param {number} x */
const temizSayi = (x) => {
  if (!Number.isFinite(x)) throw new HesapHatasi('Sonuç sayı değil (sonsuz ya da tanımsız).');
  return parseFloat(x.toPrecision(15));
};

/** Yarım yukarı (sıfırdan uzağa) yuvarlama. @param {number} x @param {number} b */
function yuvarlaSayi(x, b) {
  const k = Math.max(0, Math.min(12, Math.trunc(b)));
  const s = Math.sign(x) || 1;
  return temizSayi(s * Number(`${Math.round(Number(`${Math.abs(x)}e${k}`))}e-${k}`));
}

/** Düz sayı metni (üslü gösterim yok, nokta ondalık). @param {number} x */
export function sayiMetni(x) {
  const t = temizSayi(x);
  const s = String(t);
  return /e/i.test(s) ? t.toFixed(12).replace(/\.?0+$/, '') : s;
}

/**
 * Sayı biçimi: "0.00", "#,##0.00", "0,00", "#.##0,00", "0". Son ayırıcı; iki tür ayırıcı varsa ya da ardından "#" gelmiyorsa ondalıktır.
 * @param {number} x @param {string} bicim
 */
export function sayiBicimle(x, bicim) {
  const b = bicim.trim();
  const ayiricilar = [...b].filter((c) => c === '.' || c === ',');
  let ondalik = '';
  let grup = '';
  if (ayiricilar.length) {
    const son = ayiricilar[ayiricilar.length - 1];
    const sonra = b.slice(b.lastIndexOf(son) + 1);
    if (new Set(ayiricilar).size > 1) { ondalik = son; grup = ayiricilar[0]; }
    else if (ayiricilar.length === 1 && !sonra.includes('#') && !(b.startsWith('#') && sonra.length === 3)) ondalik = son;
    else grup = son;
  }
  const basamak = ondalik ? (b.slice(b.lastIndexOf(ondalik) + 1).match(/[0#]/g) ?? []).length : 0;
  const y = yuvarlaSayi(x, basamak);
  const [tam, kesir = ''] = Math.abs(y).toFixed(basamak).split('.');
  const tamGruplu = grup ? tam.replace(/\B(?=(\d{3})+(?!\d))/g, grup) : tam;
  return `${y < 0 ? '-' : ''}${tamGruplu}${basamak ? `${ondalik}${kesir}` : ''}`;
}

/** Sonuç → metin. @param {Deger} v @param {string} [bicim] @param {string} [varsayilanTarihBicimi] */
export function sonucBicimle(v, bicim = '', varsayilanTarihBicimi = VARSAYILAN_TARIH_BICIMI) {
  const b = bicim.trim();
  if (v instanceof Date) return tarihBicimle(v, b || varsayilanTarihBicimi);
  if (typeof v === 'number') return b && /[0#]/.test(b) ? sayiBicimle(v, b) : sayiMetni(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null) return '';
  if (typeof v === 'object') throw new HesapHatasi('Süre tek başına sonuç olamaz (bir tarihe ekleyin: bugun+1y).');
  return v;
}

/** "İFADE | BİÇİM" → parçalar (tırnak ve parantez dışındaki SON "|"). @param {string} metin */
export function kuralAyir(metin) {
  const s = String(metin ?? '');
  let derinlik = 0;
  /** @type {string | null} */
  let tirnak = null;
  let bol = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (tirnak) { if (c === tirnak) tirnak = null; continue; }
    if (c === "'" || c === '"') tirnak = c;
    else if (c === '(' || c === '{') derinlik++;
    else if (c === ')' || c === '}') derinlik--;
    else if (c === '|' && derinlik === 0) bol = i;
  }
  return bol < 0 ? { ifade: s.trim(), bicim: '' } : { ifade: s.slice(0, bol).trim(), bicim: s.slice(bol + 1).trim() };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Ayrıştırıcı
// ---------------------------------------------------------------------------------------------------------------------------

/** @param {string} ifade @returns {Array<{ tur: string; deger?: any; bas: number }>} */
function belirtecler(ifade) {
  /** @type {Array<{ tur: string; deger?: any; bas: number }>} */
  const b = [];
  let i = 0;
  while (i < ifade.length) {
    const c = ifade[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '$' && ifade[i + 1] === '{') {
      const son = ifade.indexOf('}', i + 2);
      if (son < 0) throw new HesapHatasi(`Kapanmamış başvuru: "${ifade.slice(i, i + 20)}" ("}" eksik).`);
      const ic = ifade.slice(i + 2, son).trim();
      if (!ic) throw new HesapHatasi('Boş başvuru: ${}.');
      const akis = /^akis:\s*(.+)$/.exec(ic);
      b.push(akis ? { tur: 'akis', deger: akis[1].trim(), bas: i } : { tur: 'ref', deger: ic, bas: i });
      i = son + 1;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(ifade[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+|^\d+/.exec(ifade.slice(i));
      const sayi = /** @type {RegExpExecArray} */ (m)[0];
      const sonra = ifade.slice(i + sayi.length);
      const sure = /^([yags])(?![\p{L}\p{N}_])/u.exec(sonra);
      if (sure && /^\d+$/.test(sayi)) { b.push({ tur: 'sure', deger: { sure: true, n: Number(sayi), birim: sure[1] }, bas: i }); i += sayi.length + 1; continue; }
      b.push({ tur: 'sayi', deger: Number(sayi), bas: i });
      i += sayi.length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let m = '';
      for (;;) {
        if (j >= ifade.length) throw new HesapHatasi('Kapanmamış metin (tırnak eksik).');
        if (ifade[j] === c) { if (ifade[j + 1] === c) { m += c; j += 2; continue; } break; }
        m += ifade[j++];
      }
      b.push({ tur: 'metin', deger: m, bas: i });
      i = j + 1;
      continue;
    }
    const ad = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(ifade.slice(i));
    if (ad) { b.push({ tur: 'ad', deger: ad[0], bas: i }); i += ad[0].length; continue; }
    const op = /^(<=|>=|!=|<>|==|[-+*/%()=<>,])/.exec(ifade.slice(i));
    if (op) { b.push({ tur: 'op', deger: op[1] === '<>' ? '!=' : op[1] === '==' ? '=' : op[1], bas: i }); i += op[1].length; continue; }
    throw new HesapHatasi(`Beklenmeyen karakter "${c}" (${i + 1}. sıra).`);
  }
  return b;
}

/**
 * İfade → ağaç. Sözdizimi hatası HesapHatasi.
 * @param {string} ifade @returns {Dugum}
 */
export function ayristir(ifade) {
  if (typeof ifade !== 'string' || !ifade.trim()) throw new HesapHatasi('İfade boş.');
  if (ifade.length > 2000) throw new HesapHatasi('İfade en çok 2000 karakter olabilir.');
  const b = belirtecler(ifade);
  let i = 0;
  const bak = () => b[i];
  const opMu = (/** @type {string} */ o) => bak()?.tur === 'op' && bak()?.deger === o;
  const bekle = (/** @type {string} */ o) => {
    if (!opMu(o)) throw new HesapHatasi(`"${o}" bekleniyordu${bak() ? ` ("${String(bak().deger)}" bulundu)` : ' (ifade bitti)'}.`);
    i++;
  };
  /** @returns {Dugum} */
  const karsilastirma = () => {
    let sol = toplama();
    while (bak()?.tur === 'op' && ['=', '!=', '<', '>', '<=', '>='].includes(bak().deger)) { const op = b[i++].deger; sol = { tur: 'ikili', op, sol, sag: toplama() }; }
    return sol;
  };
  /** @returns {Dugum} */
  const toplama = () => {
    let sol = carpma();
    while (opMu('+') || opMu('-')) { const op = b[i++].deger; sol = { tur: 'ikili', op, sol, sag: carpma() }; }
    return sol;
  };
  /** @returns {Dugum} */
  const carpma = () => {
    let sol = tekli();
    while (opMu('*') || opMu('/') || opMu('%')) { const op = b[i++].deger; sol = { tur: 'ikili', op, sol, sag: tekli() }; }
    return sol;
  };
  /** @returns {Dugum} */
  const tekli = () => {
    if (opMu('-')) { i++; return { tur: 'eksi', ic: tekli() }; }
    if (opMu('+')) { i++; return tekli(); }
    return birincil();
  };
  /** @returns {Dugum} */
  const birincil = () => {
    const t = b[i++];
    if (!t) throw new HesapHatasi('İfade eksik bitti.');
    if (t.tur === 'sayi' || t.tur === 'metin' || t.tur === 'sure') return { tur: t.tur, deger: t.deger };
    if (t.tur === 'ref') return { tur: 'ref', ad: t.deger, metin: `\${${t.deger}}` };
    if (t.tur === 'akis') return { tur: 'akis', ad: t.deger, metin: `\${akis:${t.deger}}` };
    if (t.tur === 'op' && t.deger === '(') { const ic = karsilastirma(); bekle(')'); return ic; }
    if (t.tur === 'ad') {
      if (opMu('(')) {
        i++;
        /** @type {Dugum[]} */
        const argumanlar = [];
        if (!opMu(')')) { do { argumanlar.push(karsilastirma()); } while (opMu(',') && ++i); }
        bekle(')');
        if (!Object.hasOwn(FONKSIYONLAR, t.deger)) throw new HesapHatasi(`Bilinmeyen fonksiyon: ${t.deger}(). Kullanılabilenler: ${Object.keys(FONKSIYONLAR).join(', ')}.`);
        return { tur: 'cagri', ad: t.deger, argumanlar };
      }
      return { tur: 'ad', ad: t.deger };
    }
    throw new HesapHatasi(`Beklenmeyen "${String(t.deger)}".`);
  };
  const agac = karsilastirma();
  if (i < b.length) throw new HesapHatasi(`Fazla ifade: "${String(b[i].deger)}" (işleç eksik olabilir).`);
  return agac;
}

/**
 * İfadenin başvuruları: ${X} / ${akis:X} ve adlar (kural adı olmalı).
 * @param {Dugum} d @param {{ refler: Set<string>; akislar: Set<string>; adlar: Set<string> }} [t]
 */
export function basvurular(d, t = { refler: new Set(), akislar: new Set(), adlar: new Set() }) {
  if (d.tur === 'ref') t.refler.add(d.ad);
  else if (d.tur === 'akis') t.akislar.add(d.ad);
  else if (d.tur === 'ad' && !SABITLER.has(d.ad)) t.adlar.add(d.ad);
  for (const c of [d.sol, d.sag, d.ic, ...(d.argumanlar ?? [])]) if (c) basvurular(c, t);
  return t;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Değerlendirme
// ---------------------------------------------------------------------------------------------------------------------------

const SAYI_METNI = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;
/** @param {unknown} v */
const sayiyaBenzer = (v) => typeof v === 'number' || (typeof v === 'string' && (SAYI_METNI.test(v.trim()) || /^[+-]?\d+,\d+$/.test(v.trim())));
const kisalt = (/** @type {unknown} */ v) => { const s = String(v); return s.length > 40 ? `${s.slice(0, 37)}…` : s; };
/** @param {Dugum} d */
const kaynakMetni = (d) => (d.tur === 'ref' || d.tur === 'akis' ? d.metin : d.tur === 'ad' ? d.ad : d.tur === 'cagri' ? `${d.ad}(…)` : d.tur === 'sayi' ? String(d.deger) : 'değer');

/** @param {Deger} v @param {Dugum} d */
function sayiOl(v, d) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v.trim();
    if (SAYI_METNI.test(s)) return Number(s);
    if (/^[+-]?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  }
  throw new HesapHatasi(`${kaynakMetni(d)} sayı değil ('${kisalt(v instanceof Date ? tarihBicimle(v, 'yyyy-MM-dd') : v === null ? '' : typeof v === 'object' ? 'süre' : v)}').`);
}

/** Metin / tarih → tarih (yyyy-MM-dd[THH:mm[:ss]] ya da dd.MM.yyyy). @param {Deger} v @param {string} [bicim] */
function tarihOl(v, bicim) {
  if (v instanceof Date) return new Date(v.getTime());
  const s = String(v ?? '').trim();
  if (bicim) {
    const sira = [...bicim.matchAll(/yyyy|MM|dd|HH|mm|ss/g)].map((m) => m[0]);
    const kalip = new RegExp(`^${bicim.replace(/'([^']*)'/g, '$1').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/yyyy/, '(\\d{4})').replace(/MM|dd|HH|mm|ss/g, '(\\d{1,2})')}$`);
    const m = kalip.exec(s);
    if (m) {
      const p = Object.fromEntries(sira.map((a, i) => [a, Number(m[i + 1])]));
      const t = new Date(p.yyyy ?? 1970, (p.MM ?? 1) - 1, p.dd ?? 1, p.HH ?? 0, p.mm ?? 0, p.ss ?? 0);
      if (t.getDate() === (p.dd ?? 1)) return t;
    }
    throw new HesapHatasi(`'${kisalt(s)}' "${bicim}" biçiminde bir tarih değil.`);
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  const p = iso ? [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]] : tr ? [tr[3], tr[2], tr[1], tr[4], tr[5], tr[6]] : null;
  if (p) {
    const [y, a, g, sa, dk, sn] = p.map((x) => Number(x ?? 0));
    const t = new Date(y, a - 1, g, sa, dk, sn);
    if (t.getMonth() === a - 1 && t.getDate() === g) return t;
  }
  throw new HesapHatasi(`'${kisalt(s)}' bir tarih değil (beklenen: 2026-05-10 ya da 10.05.2026).`);
}

/** @param {Date} t @param {Sure} s @param {number} yon */
function sureEkle(t, s, yon) {
  const r = new Date(t.getTime());
  const n = s.n * yon;
  if (s.birim === 'y' || s.birim === 'a') {
    // Ay sonu taşmaz: 31 Ocak + 1 ay = 28 / 29 Şubat (29 Şubat + 1 yıl = 28 Şubat).
    const gun = r.getDate();
    r.setDate(1);
    if (s.birim === 'y') r.setFullYear(r.getFullYear() + n); else r.setMonth(r.getMonth() + n);
    r.setDate(Math.min(gun, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  }
  else if (s.birim === 'g') r.setDate(r.getDate() + n);
  else r.setHours(r.getHours() + n);
  return r;
}
/** @param {unknown} v @returns {v is Sure} */
const sureMi = (v) => Boolean(v && typeof v === 'object' && !(v instanceof Date) && /** @type {any} */ (v).sure === true);
/** @param {Deger} v */
const metinOl = (v) => (v instanceof Date ? tarihBicimle(v, VARSAYILAN_TARIH_BICIMI) : typeof v === 'number' ? sayiMetni(v) : sureMi(v) ? `${v.n}${v.birim}` : v === null ? '' : String(v));
/** @param {Deger} v */
const dogruMu = (v) => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : v === null ? false : typeof v === 'string' ? v !== '' && v !== 'false' && v !== '0' : true);

/** @type {Record<string, (a: Dugum[], c: (d: Dugum) => Deger) => Deger>} */
const FONKSIYONLAR = Object.assign(Object.create(null), {
  yuvarla: (a, c) => yuvarlaSayi(sayiOl(c(a[0]), a[0]), a[1] ? sayiOl(c(a[1]), a[1]) : 0),
  asagiYuvarla: (a, c) => { const k = 10 ** (a[1] ? sayiOl(c(a[1]), a[1]) : 0); return temizSayi(Math.floor(temizSayi(sayiOl(c(a[0]), a[0]) * k)) / k); },
  yukariYuvarla: (a, c) => { const k = 10 ** (a[1] ? sayiOl(c(a[1]), a[1]) : 0); return temizSayi(Math.ceil(temizSayi(sayiOl(c(a[0]), a[0]) * k)) / k); },
  mutlak: (a, c) => Math.abs(sayiOl(c(a[0]), a[0])),
  min: (a, c) => { if (!a.length) throw new HesapHatasi('min() en az bir değer ister.'); return Math.min(...a.map((d) => sayiOl(c(d), d))); },
  max: (a, c) => { if (!a.length) throw new HesapHatasi('max() en az bir değer ister.'); return Math.max(...a.map((d) => sayiOl(c(d), d))); },
  uzunluk: (a, c) => metinOl(c(a[0])).length,
  birlestir: (a, c) => a.map((d) => metinOl(c(d))).join(''),
  buyukHarf: (a, c) => metinOl(c(a[0])).toLocaleUpperCase('tr'),
  kucukHarf: (a, c) => metinOl(c(a[0])).toLocaleLowerCase('tr'),
  parca: (a, c) => {
    const s = metinOl(c(a[0]));
    const bas = Math.max(1, Math.trunc(sayiOl(c(a[1]), a[1])));
    return a[2] ? s.substr(bas - 1, Math.max(0, Math.trunc(sayiOl(c(a[2]), a[2])))) : s.slice(bas - 1);
  },
  eger: (a, c) => { if (a.length < 2) throw new HesapHatasi('eger(koşul, doğruysa, yanlışsa) en az iki değer ister.'); return dogruMu(c(a[0])) ? c(a[1]) : a[2] ? c(a[2]) : ''; },
  bosIse: (a, c) => {
    let v;
    try { v = c(a[0]); } catch (e) { if (e instanceof HesapHatasi && e.tur === 'tanimsiz') v = null; else throw e; }
    return v === null || v === '' ? c(a[1]) : v;
  },
  tarih: (a, c) => tarihOl(c(a[0]), a[1] ? metinOl(c(a[1])) : undefined),
  gunFarki: (a, c) => {
    const gun = (/** @type {Date} */ t) => Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((gun(tarihOl(c(a[1]))) - gun(tarihOl(c(a[0])))) / AY_MS);
  },
  sayi: (a, c) => sayiOl(c(a[0]), a[0])
});
export const FONKSIYON_ADLARI = Object.freeze(Object.keys(FONKSIYONLAR));

/**
 * Ağacı değerlendirir. Kural adları kurallar'dan (önbellekli, döngü denetimli), ${X} baglam.ref, ${akis:X} baglam.akis ile.
 * @param {Dugum} d @param {Record<string, string>} kurallar @param {Baglam} b @returns {Deger}
 */
function degerlendirDugum(d, kurallar, b) {
  const c = (/** @type {Dugum} */ x) => degerlendirDugum(x, kurallar, b);
  switch (d.tur) {
    case 'sayi': case 'metin': case 'sure': return d.deger;
    case 'ref': {
      // Yalnız metin / sayı kabul edilir (nesne, prototip vb. değer tanımsız sayılır).
      const ham = b.ref?.(d.ad);
      const v = typeof ham === 'string' || typeof ham === 'number' ? ham : undefined;
      if (v === undefined) throw Object.assign(new HesapHatasi(`${d.metin} için değer yok.`, 'tanimsiz'), { ad: d.ad });
      return v;
    }
    case 'akis': {
      const ham = b.akis?.(d.ad);
      const v = typeof ham === 'string' ? ham : undefined;
      if (v === undefined) throw Object.assign(new HesapHatasi(`${d.metin} için değer yok (akış değeri yalnız servis akışında ya da oturum akışıyla dolar).`, 'tanimsiz'), { ad: `akis:${d.ad}` });
      return v;
    }
    case 'ad': {
      if (d.ad === 'bugun' || d.ad === 'simdi') return new Date(b.simdi.getTime());
      if (d.ad === 'dogru') return true;
      if (d.ad === 'yanlis') return false;
      return kuralDegeri(d.ad, kurallar, b);
    }
    case 'eksi': {
      const v = c(d.ic);
      if (sureMi(v)) return { ...v, n: -v.n };
      return temizSayi(-sayiOl(v, d.ic));
    }
    case 'cagri': return FONKSIYONLAR[d.ad](d.argumanlar, c);
    case 'ikili': {
      const sol = c(d.sol);
      const sag = c(d.sag);
      switch (d.op) {
        case '+':
          if (sol instanceof Date && sureMi(sag)) return sureEkle(sol, sag, 1);
          if (sureMi(sol) && sag instanceof Date) return sureEkle(sag, sol, 1);
          if (sayiyaBenzer(sol) && sayiyaBenzer(sag)) return temizSayi(sayiOl(sol, d.sol) + sayiOl(sag, d.sag));
          if (sol instanceof Date || sag instanceof Date) throw new HesapHatasi('Tarihe yalnız süre eklenir (ör. +1y, +10g).');
          return metinOl(sol) + metinOl(sag);
        case '-':
          if (sol instanceof Date && sureMi(sag)) return sureEkle(sol, sag, -1);
          if (sol instanceof Date && sag instanceof Date) throw new HesapHatasi('İki tarihin farkı için gunFarki(a, b) kullanın.');
          return temizSayi(sayiOl(sol, d.sol) - sayiOl(sag, d.sag));
        case '*': return temizSayi(sayiOl(sol, d.sol) * sayiOl(sag, d.sag));
        case '/': case '%': {
          const bolen = sayiOl(sag, d.sag);
          if (bolen === 0) throw new HesapHatasi(`Sıfıra bölme (${kaynakMetni(d.sag)} = 0).`);
          const bolunen = sayiOl(sol, d.sol);
          return temizSayi(d.op === '/' ? bolunen / bolen : bolunen % bolen);
        }
        default: {
          let x = sol;
          let y = sag;
          if (sayiyaBenzer(x) && sayiyaBenzer(y)) { x = sayiOl(x, d.sol); y = sayiOl(y, d.sag); }
          else if (x instanceof Date || y instanceof Date) { x = tarihOl(x).getTime(); y = tarihOl(y).getTime(); }
          else { x = metinOl(x); y = metinOl(y); }
          if (d.op === '=') return x === y;
          if (d.op === '!=') return x !== y;
          if (d.op === '<') return x < y;
          if (d.op === '>') return x > y;
          if (d.op === '<=') return x <= y;
          return x >= y;
        }
      }
    }
    default: throw new HesapHatasi('Bilinmeyen ifade.');
  }
}

/**
 * Adlı kuralın ham değeri (tarih / sayı / metin). Önbellek: aynı hesapta bir kez; döngü hatası.
 * @param {string} ad @param {Record<string, string>} kurallar @param {Baglam} b @returns {Deger}
 */
export function kuralDegeri(ad, kurallar, b) {
  if (!Object.hasOwn(kurallar, ad) || typeof kurallar[ad] !== 'string') throw new HesapHatasi(`"${ad}" adında kural yok.`, 'tanimsizKural');
  const onbellek = (b.onbellek ??= new Map());
  if (onbellek.has(ad)) return /** @type {Deger} */ (onbellek.get(ad));
  const yigin = b.yigin ?? [];
  if (yigin.includes(ad)) throw new HesapHatasi(`Kurallar döngüye giriyor: ${[...yigin, ad].join(' → ')}.`, 'dongu');
  const { ifade } = kuralAyir(kurallar[ad]);
  let v;
  try { v = degerlendirDugum(ayristir(ifade), kurallar, { ...b, onbellek, yigin: [...yigin, ad] }); } catch (e) {
    if (e instanceof HesapHatasi && !yigin.length && e.tur !== 'dongu') throw Object.assign(new HesapHatasi(`${ad} hesaplanamadı: ${e.message}`, e.tur), { ad: /** @type {any} */ (e).ad });
    throw e;
  }
  onbellek.set(ad, v);
  return v;
}

/**
 * Adlı kuralın metin sonucu (kuralın biçimiyle; tarih için biçim yoksa varsayilanTarihBicimi).
 * @param {string} ad @param {Record<string, string>} kurallar @param {Baglam} b @param {string} [varsayilanTarihBicimi]
 */
export function kuralUygula(ad, kurallar, b, varsayilanTarihBicimi) {
  return sonucBicimle(kuralDegeri(ad, kurallar, b), kuralAyir(kurallar[ad]).bicim, varsayilanTarihBicimi);
}

/**
 * İfadenin ham değeri (biçimsiz). @param {string} ifade @param {Record<string, string>} kurallar @param {Baglam} b @returns {Deger}
 */
export function ifadeDegeri(ifade, kurallar, b) {
  return degerlendirDugum(ayristir(ifade), kurallar, { ...b, onbellek: b.onbellek ??= new Map() });
}

/**
 * Satır içi ifade ("ifade | biçim"; ${hesap: …} ve ${tarih: …}) → metin.
 * @param {string} metin @param {Record<string, string>} kurallar @param {Baglam} b @param {string} [varsayilanTarihBicimi]
 */
export function ifadeUygula(metin, kurallar, b, varsayilanTarihBicimi) {
  const { ifade, bicim } = kuralAyir(metin);
  return sonucBicimle(degerlendirDugum(ayristir(ifade), kurallar, { ...b, onbellek: b.onbellek ??= new Map() }), bicim, varsayilanTarihBicimi);
}

/**
 * Metindeki ${hesap: …} blokları (iç içe ${X} başvuruları ve tırnaklar dikkate alınır).
 * @param {string} metin @returns {Array<{ bas: number; son: number; ic: string }>}
 */
export function hesapBloklari(metin) {
  /** @type {Array<{ bas: number; son: number; ic: string }>} */
  const sonuc = [];
  const ara = /\$\{\s*hesap:/g;
  let m;
  while ((m = ara.exec(metin))) {
    let derinlik = 1;
    /** @type {string | null} */
    let tirnak = null;
    let j = m.index + m[0].length;
    for (; j < metin.length && derinlik > 0; j++) {
      const c = metin[j];
      if (tirnak) { if (c === tirnak) tirnak = null; continue; }
      if (c === "'" || c === '"') tirnak = c;
      else if (c === '{') derinlik++;
      else if (c === '}') derinlik--;
    }
    if (derinlik !== 0) break;
    sonuc.push({ bas: m.index, son: j, ic: metin.slice(m.index + m[0].length, j - 1).trim() });
    ara.lastIndex = j;
  }
  return sonuc;
}

/**
 * Kural kümesini denetler: ad, sözdizimi, tanımsız kural adı, bilinmeyen fonksiyon, döngü. { <ad>: hata } (boş = geçerli).
 * ${X} başvuruları koşuda çözülür (burada denetlenmez).
 * @param {Record<string, string>} kurallar @returns {Record<string, string>}
 */
export function hesapKurallariniDenetle(kurallar) {
  /** @type {Record<string, string>} */
  const hatalar = {};
  /** @type {Record<string, Set<string>>} */
  const bagimlilik = {};
  for (const [ad, kural] of Object.entries(kurallar)) {
    if (!KURAL_ADI.test(ad)) { hatalar[ad] = `Geçersiz kural adı: "${ad}" (harf ya da "_" ile başlar; harf, rakam, "_", ".", "-").`; continue; }
    if (SABITLER.has(ad) || Object.hasOwn(FONKSIYONLAR, ad)) { hatalar[ad] = `"${ad}" ayrılmış bir ad; başka ad seçin.`; continue; }
    if (typeof kural !== 'string' || !kural.trim()) { hatalar[ad] = 'Kural boş.'; continue; }
    try {
      const t = basvurular(ayristir(kuralAyir(kural).ifade));
      const yok = [...t.adlar].filter((x) => !Object.hasOwn(kurallar, x));
      if (yok.length) { hatalar[ad] = `Tanımsız ad: ${yok.join(', ')} (kural adı değilse ${'${'}${yok[0]}} ile parametre olarak yazın).`; continue; }
      bagimlilik[ad] = t.adlar;
    } catch (e) { hatalar[ad] = /** @type {Error} */ (e).message; }
  }
  // Döngü: derinlik öncelikli arama.
  /** @type {Map<string, 0 | 1 | 2>} */
  const durum = new Map();
  /** @param {string} ad @param {string[]} yol @returns {string[] | null} */
  const gez = (ad, yol) => {
    if (durum.get(ad) === 2) return null;
    if (durum.get(ad) === 1) return [...yol.slice(yol.indexOf(ad)), ad];
    durum.set(ad, 1);
    for (const x of bagimlilik[ad] ?? []) { const d = gez(x, [...yol, ad]); if (d) return d; }
    durum.set(ad, 2);
    return null;
  };
  for (const ad of Object.keys(bagimlilik)) {
    const d = gez(ad, []);
    if (d) for (const x of new Set(d)) hatalar[x] ??= `Kurallar döngüye giriyor: ${d.join(' → ')}.`;
  }
  return hatalar;
}

/**
 * Kuralların ${X} ve ${akis:X} başvuruları (kural zincirleri dahil; örnek değer kutuları ve koşuda parametre çözümü için).
 * @param {string[]} adlar @param {Record<string, string>} kurallar
 */
export function kuralParametreleri(adlar, kurallar) {
  const refler = new Set();
  const akislar = new Set();
  const gorulen = new Set();
  const yigin = [...adlar];
  while (yigin.length) {
    const ad = /** @type {string} */ (yigin.pop());
    if (gorulen.has(ad) || !Object.hasOwn(kurallar, ad)) continue;
    gorulen.add(ad);
    try {
      const t = basvurular(ayristir(kuralAyir(kurallar[ad]).ifade));
      t.refler.forEach((x) => refler.add(x));
      t.akislar.forEach((x) => akislar.add(x));
      yigin.push(...t.adlar);
    } catch { /* sözdizimi hatası denetimde bildirilir */ }
  }
  return { refler: [...refler], akislar: [...akislar] };
}

/**
 * Örnek sonuçlar (bugün): ${X} değerleri ornek'ten; eksik / hatalı kuralda hata.
 * @param {Record<string, string>} kurallar @param {Record<string, string>} [ornek] @param {Date} [simdi] @param {string} [varsayilanTarihBicimi]
 * @returns {Record<string, { sonuc?: string; hata?: string }>}
 */
export function ornekSonuclar(kurallar, ornek = {}, simdi = new Date(), varsayilanTarihBicimi = VARSAYILAN_TARIH_BICIMI) {
  const b = { simdi, onbellek: new Map(), ref: (/** @type {string} */ x) => (Object.hasOwn(ornek, x) && ornek[x] !== '' ? ornek[x] : undefined), akis: (/** @type {string} */ x) => (Object.hasOwn(ornek, `akis:${x}`) && ornek[`akis:${x}`] !== '' ? ornek[`akis:${x}`] : undefined) };
  return Object.fromEntries(Object.keys(kurallar).map((ad) => {
    try { return [ad, { sonuc: kuralUygula(ad, kurallar, b, varsayilanTarihBicimi) }]; } catch (e) { return [ad, { hata: /** @type {Error} */ (e).message }]; }
  }));
}

/** Kuralın kısa okunur özeti (listelerde): "bugün", "BEGIN_DATE + 1 yıl" ya da ifadenin kendisi. @param {string} kural */
export function kuralOzeti(kural) {
  const { ifade } = kuralAyir(kural);
  const e = /^(bugun|simdi|[A-Za-z_][A-Za-z0-9_.]*)\s*(?:([+-])\s*(\d+)([yags]))?$/.exec(ifade);
  if (!e) return ifade.length > 40 ? `${ifade.slice(0, 37)}…` : ifade;
  const temel = e[1] === 'bugun' ? 'bugün' : e[1] === 'simdi' ? 'şimdi' : e[1];
  return e[2] ? `${temel} ${e[2] === '-' ? '−' : '+'} ${e[3]} ${{ y: 'yıl', a: 'ay', g: 'gün', s: 'saat' }[/** @type {'y' | 'a' | 'g' | 's'} */ (e[4])]}` : temel;
}
