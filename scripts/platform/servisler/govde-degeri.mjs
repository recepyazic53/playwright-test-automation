// SERVİS SENARYOSUNDA TEK ALANIN DÜZ DEĞERİNİ YERİNDE DEĞİŞTİRME (saf; vt yok). Test verisi tablosundaki bir değer değişince
// (tablolar/tablo-etkisi.mjs) o değeri düz metin olarak kullanan senaryo gövdesinde YALNIZ ilgili öğenin metni değişir; gövdenin
// geri kalanı (boşluklar, ad alanı önekleri, sıra, yorumlar) birebir kalır. Yeniden üretim (govdeUret) yapılmaz.
//   · SOAP: alan yolu ("Input/Channel") işlem öğesinin (kök) altındaki yerel adlardır. Yoldaki yaprak öğe(ler)den metni eski değere
//     eşit olan TEK öğe aranır; hiç yoksa ya da birden çoksa değişmez (neden döner).
//   · REST: "govde/a/b" JSON gövdede a.b (dizide her eleman), "sorgu/x" isteğin sorgu parametresi, "yol/x" yolun {x} parçası.
// Metin kaçışı: SOAP'ta XML kaçışı, JSON'da JSON dizesi, sorgu / yolda URL kodlaması.

/** @typedef {{ govde: string; yol?: string }} Icerik */
/** @typedef {{ sonuc: string } | { neden: string }} Degisim */

export const NEDENLER = Object.freeze({
  bulunamadi: 'gövdede bu değerle alan bulunamadı',
  cokEslesme: 'gövdede bu değer birden çok yerde; hangisi olduğu belirsiz',
  ozelIcerik: 'alan CDATA / yorum içeriyor; elle düzenleyin',
  sayiDegil: 'alan sayı; yeni değer sayı değil',
  gecersizJson: 'gövde geçerli JSON değil',
  sablonYok: 'metodun yol şablonu bulunamadı'
});

const xmlKacis = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kacisCoz = (/** @type {string} */ s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const yerel = (/** @type {string} */ ad) => ad.slice(ad.indexOf(':') + 1);
const reKacis = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * SOAP gövdesinde yoldaki yaprak öğeler (konumlarıyla). kok verilirse yol kök öğenin (işlem öğesi) altından sayılır; verilmezse
 * öğenin yolu yolla BİTMELİDİR.
 * @param {string} govde @param {string} yol @param {string} [kok]
 * @returns {Array<{ bas: number; son: number; metin: string; ozel: boolean }>}
 */
export function soapYapraklari(govde, yol, kok = '') {
  const hedef = yol.split('/').filter(Boolean);
  const desen = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  /** @type {Array<{ ad: string; bas: number; cocuk: boolean; ozel: boolean }>} */
  const yigin = [];
  /** @type {Array<{ bas: number; son: number; metin: string; ozel: boolean }>} */
  const sonuc = [];
  const uyar = (/** @type {string[]} */ yolAdlari) => {
    if (kok) {
      const i = yolAdlari.indexOf(kok);
      return i >= 0 && yolAdlari.length - i - 1 === hedef.length && hedef.every((p, k) => yolAdlari[i + 1 + k] === p);
    }
    return yolAdlari.length >= hedef.length && hedef.every((p, k) => yolAdlari[yolAdlari.length - hedef.length + k] === p);
  };
  for (const m of govde.matchAll(desen)) {
    const ust = yigin[yigin.length - 1];
    if (m[1] === undefined && m[2] === undefined) { if (ust) ust.ozel = true; continue; } // yorum, CDATA, işlem talimatı
    if (m[2] !== undefined) {
      if (ust) ust.cocuk = true;
      if (m[4]) {
        if (uyar([...yigin.map((x) => x.ad), yerel(m[2])])) sonuc.push({ bas: -1, son: -1, metin: '', ozel: true });
        continue;
      }
      yigin.push({ ad: yerel(m[2]), bas: /** @type {number} */ (m.index) + m[0].length, cocuk: false, ozel: false });
      continue;
    }
    const e = yigin.pop();
    if (!e) break;
    if (!e.cocuk && uyar([...yigin.map((x) => x.ad), e.ad])) {
      const ham = govde.slice(e.bas, m.index);
      sonuc.push({ bas: e.bas, son: /** @type {number} */ (m.index), metin: kacisCoz(ham), ozel: e.ozel });
    }
  }
  return sonuc;
}

/**
 * SOAP gövdesinde yoldaki öğenin metni eski → yeni (tek eşleşme şartı). @param {string} govde @param {string} yol
 * @param {string} eski @param {string} yeni @param {string} [kok] @returns {Degisim}
 */
export function soapDegeriniDegistir(govde, yol, eski, yeni, kok = '') {
  const adaylar = soapYapraklari(govde, yol, kok).filter((x) => x.metin === eski || (x.ozel && x.bas >= 0 && govde.slice(x.bas, x.son).includes(eski)));
  if (!adaylar.length) return { neden: NEDENLER.bulunamadi };
  if (adaylar.length > 1) return { neden: NEDENLER.cokEslesme };
  const a = adaylar[0];
  if (a.ozel) return { neden: NEDENLER.ozelIcerik };
  return { sonuc: `${govde.slice(0, a.bas)}${xmlKacis(yeni)}${govde.slice(a.son)}` };
}

/**
 * JSON değerinde yoldaki (dizilerde her eleman) yaprak değerler. @param {unknown} kok @param {string[]} parcalar
 * @returns {Array<{ anahtar: string; deger: unknown }>}
 */
function jsonYapraklari(kok, parcalar) {
  /** @type {unknown[]} */
  let simdiki = [kok];
  /** @type {Array<{ anahtar: string; deger: unknown }>} */
  let sonuc = [];
  parcalar.forEach((p, i) => {
    /** @type {unknown[]} */
    const sonraki = [];
    const ac = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.flatMap(ac) : [v]);
    for (const o of simdiki.flatMap(ac)) {
      if (!o || typeof o !== 'object' || Array.isArray(o) || !Object.hasOwn(o, p)) continue;
      const v = /** @type {Record<string, unknown>} */ (o)[p];
      if (i === parcalar.length - 1) sonuc = [...sonuc, ...ac(v).map((d) => ({ anahtar: p, deger: d }))];
      else sonraki.push(v);
    }
    simdiki = sonraki;
  });
  return sonuc;
}

/** @param {unknown} v */
const duzMetin = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

/** REST alanının düz değerleri (okuma; alan yolu govde/…, sorgu/…, yol/…). @param {Icerik} icerik @param {string} yol @param {string} [sablon] */
export function restDegerleri(icerik, yol, sablon = '') {
  const [grup, ...parcalar] = yol.split('/');
  if (grup === 'govde') {
    try { return jsonYapraklari(JSON.parse(icerik.govde || 'null'), parcalar).map((x) => duzMetin(x.deger)).filter((x) => x !== null); } catch { return []; }
  }
  const [yolKismi, sorgu = ''] = String(icerik.yol ?? '').split(/\?(.*)/s);
  if (grup === 'sorgu') return sorgu.split('&').filter(Boolean).map((p) => p.split(/=(.*)/s)).filter(([a]) => cozUrl(a) === parcalar[0]).map(([, d = '']) => cozUrl(d));
  if (grup === 'yol') {
    const i = yolParcasi(sablon, yolKismi, parcalar[0]);
    return i < 0 ? [] : [cozUrl(yolKismi.split('/')[i])];
  }
  return [];
}

/** @param {string} s */
function cozUrl(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } }
/** Şablondaki {ad} parçasının sırası (senaryonun yolu aynı sayıda parçalıysa), yoksa -1. @param {string} sablon @param {string} yol @param {string} ad */
function yolParcasi(sablon, yol, ad) {
  const s = String(sablon).split('?')[0].split('/');
  const y = yol.split('/');
  return s.length === y.length ? s.indexOf(`{${ad}}`) : -1;
}

/**
 * REST senaryosunda alanın düz değeri eski → yeni (tek eşleşme şartı). Gövdede JSON sayıysa yeni değer sayı olarak yazılır.
 * @param {Icerik} icerik @param {string} yol @param {string} eski @param {string} yeni @param {string} [sablon] metodun yol şablonu (yol/…)
 * @returns {{ sonuc: Icerik } | { neden: string }}
 */
export function restDegeriniDegistir(icerik, yol, eski, yeni, sablon = '') {
  const [grup, ...parcalar] = yol.split('/');
  if (grup === 'govde') {
    let kok;
    try { kok = JSON.parse(icerik.govde || 'null'); } catch { return { neden: NEDENLER.gecersizJson }; }
    const yapraklar = jsonYapraklari(kok, parcalar).filter((x) => duzMetin(x.deger) === eski);
    if (!yapraklar.length) return { neden: NEDENLER.bulunamadi };
    if (yapraklar.length > 1) return { neden: NEDENLER.cokEslesme };
    const sayi = typeof yapraklar[0].deger === 'number';
    if (sayi && !/^-?\d+(\.\d+)?$/.test(yeni)) return { neden: NEDENLER.sayiDegil };
    const desen = new RegExp(`("${reKacis(JSON.stringify(parcalar[parcalar.length - 1]).slice(1, -1))}"\\s*:\\s*)${reKacis(JSON.stringify(yapraklar[0].deger))}(?=\\s*[,}\\]])`, 'g');
    const eslesen = [...icerik.govde.matchAll(desen)];
    if (!eslesen.length) return { neden: NEDENLER.bulunamadi };
    if (eslesen.length > 1) return { neden: NEDENLER.cokEslesme };
    const m = eslesen[0];
    const bas = /** @type {number} */ (m.index) + m[1].length;
    const son = /** @type {number} */ (m.index) + m[0].length;
    return { sonuc: { ...icerik, govde: `${icerik.govde.slice(0, bas)}${sayi ? yeni : JSON.stringify(yeni)}${icerik.govde.slice(son)}` } };
  }
  const tamYol = String(icerik.yol ?? '');
  const soru = tamYol.indexOf('?');
  const yolKismi = soru < 0 ? tamYol : tamYol.slice(0, soru);
  const sorgu = soru < 0 ? '' : tamYol.slice(soru + 1);
  if (grup === 'sorgu') {
    const parcaList = sorgu.split('&');
    const adaylar = parcaList.map((p, i) => ({ p, i })).filter(({ p }) => { const [a, d = ''] = p.split(/=(.*)/s); return cozUrl(a) === parcalar[0] && cozUrl(d) === eski; });
    if (!adaylar.length) return { neden: NEDENLER.bulunamadi };
    if (adaylar.length > 1) return { neden: NEDENLER.cokEslesme };
    const { p, i } = adaylar[0];
    parcaList[i] = `${p.split('=')[0]}=${encodeURIComponent(yeni)}`;
    return { sonuc: { ...icerik, yol: `${yolKismi}?${parcaList.join('&')}` } };
  }
  if (grup === 'yol') {
    if (!sablon) return { neden: NEDENLER.sablonYok };
    const i = yolParcasi(sablon, yolKismi, parcalar[0]);
    const y = yolKismi.split('/');
    if (i < 0 || cozUrl(y[i]) !== eski) return { neden: NEDENLER.bulunamadi };
    y[i] = encodeURIComponent(yeni);
    return { sonuc: { ...icerik, yol: `${y.join('/')}${soru < 0 ? '' : `?${sorgu}`}` } };
  }
  return { neden: NEDENLER.bulunamadi };
}
