// SERVİS TESTLERİ — istek gövdesi ↔ alan formu (ORTAK: sunucu ve arayüz kullanır; /arayuz/servis-govdesi.mjs olarak sunulur).
// Tarayıcıda da çalışır: Node modülü İÇE AKTARMAZ.
// - Operasyon şeması (WSDL'den; bkz. wsdl-semasi.mjs): { ad, eylem?, kok, ns, alanlar: Alan[] }.
// - Alan değeri: { kaynak: 'tablo' | 'sabit' | 'parametre' | 'bos' | 'nil' | 'gonderme', deger? }
//     tablo → <A>${Tablo.Sütun}</A> (değer koşuda seçilen tablo satırından) · parametre (eski) → <A>${AD}</A>
//     sabit → <A>değer</A> (XML kaçışlı; ${…} yer tutucusu yazılabilir) · bos → <A/>
//     nil → <A xsi:nil="true"/> · gonderme → alan hiç yazılmaz. Grup alanı, altında yazılan bir alan varsa yazılır.
// - Yol: kök öğenin altındaki yerel adlar "/" ile (ör. "Input/CreditCard/CardNumber").
// Gövdede şemada olmayan öğe, tekrar eden öğe ya da özellik (xsi:nil dışında) varsa form bu gövdeyi temsil edemez:
// govdeCoz "uyumsuz" listesiyle bildirir (arayüz XML görünümünde bırakır, veri kaybı olmaz).

/**
 * @typedef {'metin' | 'tamsayi' | 'ondalik' | 'mantiksal' | 'tarih' | 'tarihSaat'} AlanTipi
 * @typedef {{ ad: string; tip?: AlanTipi; zorunlu?: boolean; nillable?: boolean; coklu?: boolean; secenekler?: string[]; cocuklar?: Alan[]; ek?: boolean }} Alan
 * @typedef {{ ad: string; eylem?: string; kok: string; ns: string; alanlar: Alan[] }} OperasyonSemasi
 * @typedef {{ kaynak: 'tablo' | 'sabit' | 'parametre' | 'bos' | 'nil' | 'gonderme'; deger?: string }} AlanDegeri
 * @typedef {{ ad: string; yerel: string; oz: Record<string, string>; cocuklar: XmlOgesi[]; metin: string }} XmlOgesi
 */

export const KAYNAKLAR = /** @type {const} */ (['tablo', 'parametre', 'sabit', 'bos', 'nil', 'gonderme']);
/** Eski parametre adı (SIGORTALI_TC) ve tablo başvurusu (Servis girişi.Kanal / Kişi[ettiren].TC). */
const ESKI_PARAMETRE = /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/;
const TABLO_BASVURUSU = /^[^.[\]{}$<>&|]{1,60}(?:\[[^\]{}$<>&|]{1,40}\])?\.[^.[\]{}$<>&|]{1,60}(?:\|[^{}$]{1,60})?$/u;
const ZARF_NS = { '1.1': 'http://schemas.xmlsoap.org/soap/envelope/', '1.2': 'http://www.w3.org/2003/05/soap-envelope' };
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';

/** @param {string} s */
export const xmlKacis = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** @param {string} s */
const kacisCoz = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
/** @param {string} ad */
const yerelAd = (ad) => ad.slice(ad.indexOf(':') + 1);

/**
 * Küçük XML ayrıştırıcı (özellikler korunur; ad alanı önekleri "ad"da kalır, "yerel" öneksiz). Hatalı XML'de hata fırlatır.
 * @param {string} xml @returns {XmlOgesi}
 */
export function xmlAyristir(xml) {
  /** @type {XmlOgesi} */
  const kok = { ad: '#', yerel: '#', oz: {}, cocuklar: [], metin: '' };
  /** @type {XmlOgesi[]} */
  const yigin = [kok];
  const temiz = xml.replace(/^﻿/, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  const belirtec = /<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  for (const m of temiz.matchAll(belirtec)) {
    const ust = yigin[yigin.length - 1];
    if (m[7]) throw new Error('XML ayrıştırılamadı (kapanmamış "<").');
    if (m[1] !== undefined) ust.metin += m[1];
    else if (m[2] !== undefined) {
      if (yigin.length <= 1 || ust.ad !== m[2]) throw new Error(`XML ayrıştırılamadı: </${m[2]}> beklenmiyordu.`);
      yigin.pop();
    } else if (m[3] !== undefined) {
      /** @type {Record<string, string>} */
      const oz = {};
      for (const o of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) oz[o[1]] = kacisCoz(o[2] ?? o[3] ?? '');
      /** @type {XmlOgesi} */
      const d = { ad: m[3], yerel: yerelAd(m[3]), oz, cocuklar: [], metin: '' };
      ust.cocuklar.push(d);
      if (!m[5]) yigin.push(d);
    } else if (m[6] !== undefined) ust.metin += kacisCoz(m[6]);
  }
  if (yigin.length !== 1) throw new Error(`XML ayrıştırılamadı: <${yigin[yigin.length - 1].ad}> kapanmadı.`);
  if (kok.cocuklar.length !== 1) throw new Error('XML tek bir kök öğe içermeli.');
  return kok.cocuklar[0];
}

/**
 * WSDL şemasına elle eklenen alanları (WSDL'de yok) katar: { yol: "Input/YeniAlan", tip?, zorunlu? }. Yol üzerindeki gruplar
 * yoksa oluşturulur; alan grubun sonuna "ek: true" işaretiyle eklenir; aynı adlı alan varsa eklenmez. Şemanın kopyası döner.
 * @param {OperasyonSemasi} sema @param {Array<{ yol: string; tip?: AlanTipi; zorunlu?: boolean }>} [ekler] @returns {OperasyonSemasi}
 */
export function semaBirlestir(sema, ekler = []) {
  /** @type {OperasyonSemasi} */
  const kopya = JSON.parse(JSON.stringify(sema));
  for (const e of ekler) {
    const parcalar = String(e.yol || '').split('/').filter(Boolean);
    if (!parcalar.length) continue;
    let liste = kopya.alanlar;
    for (const g of parcalar.slice(0, -1)) {
      let grup = liste.find((a) => a.ad === g);
      if (!grup) { grup = { ad: g, cocuklar: [] }; liste.push(grup); }
      grup.cocuklar ??= [];
      liste = grup.cocuklar;
    }
    const ad = parcalar[parcalar.length - 1];
    if (!liste.some((a) => a.ad === ad)) liste.push({ ad, tip: e.tip || 'metin', ek: true, ...(e.zorunlu ? { zorunlu: true } : {}) });
  }
  return kopya;
}

/** Şemadaki yaprak alanlar ve yolları (form satırları). @param {Alan[]} alanlar @param {string} [on] @returns {Array<{ yol: string; alan: Alan; derinlik: number; grup: boolean }>} */
export function alanSatirlari(alanlar, on = '', derinlik = 0) {
  /** @type {Array<{ yol: string; alan: Alan; derinlik: number; grup: boolean }>} */
  const satirlar = [];
  for (const a of alanlar) {
    const yol = on ? `${on}/${a.ad}` : a.ad;
    if (a.cocuklar && a.cocuklar.length) {
      satirlar.push({ yol, alan: a, derinlik, grup: true });
      satirlar.push(...alanSatirlari(a.cocuklar, yol, derinlik + 1));
    } else satirlar.push({ yol, alan: a, derinlik, grup: false });
  }
  return satirlar;
}

/**
 * Yeni senaryonun başlangıç değerleri: servis varsayılanı varsa o; yoksa zorunlu + nillable → nil, zorunlu → boş, isteğe bağlı →
 * gönderme. İsteğe bağlı bir grubun (ör. kredi kartı) alanları başlangıçta gönderilmez (grup yazılmasın). En üst düzey sarmalayıcı
 * (.asmx'te "Input" hep isteğe bağlı işaretlidir) bu kurala girmez.
 * @param {OperasyonSemasi} sema @param {Record<string, AlanDegeri>} [varsayilanlar]
 */
export function baslangicDegerleri(sema, varsayilanlar = {}) {
  /** @type {Record<string, AlanDegeri>} */
  const d = {};
  /** @param {Alan[]} alanlar @param {string} on @param {number} derinlik @param {boolean} istegeBagliGrupta */
  const gez = (alanlar, on, derinlik, istegeBagliGrupta) => {
    for (const a of alanlar) {
      const yol = on ? `${on}/${a.ad}` : a.ad;
      if (a.cocuklar && a.cocuklar.length) { gez(a.cocuklar, yol, derinlik + 1, istegeBagliGrupta || (derinlik > 0 && !a.zorunlu)); continue; }
      d[yol] = varsayilanlar[yol] ?? { kaynak: a.zorunlu && !istegeBagliGrupta ? (a.nillable ? 'nil' : 'bos') : 'gonderme' };
    }
  };
  gez(sema.alanlar, '', 0, false);
  return d;
}

/**
 * Formdan SOAP gövdesi.
 * @param {OperasyonSemasi} sema @param {Record<string, AlanDegeri>} degerler @param {{ soapSurumu?: '1.1' | '1.2' }} [secenekler]
 */
export function govdeUret(sema, degerler, secenekler = {}) {
  const girinti = (n) => '  '.repeat(n);
  /** @param {Alan[]} alanlar @param {string} on @param {number} d @returns {string[]} */
  const yaz = (alanlar, on, d) => {
    /** @type {string[]} */
    const satirlar = [];
    for (const a of alanlar) {
      const yol = on ? `${on}/${a.ad}` : a.ad;
      if (a.cocuklar && a.cocuklar.length) {
        const ic = yaz(a.cocuklar, yol, d + 1);
        if (ic.length) satirlar.push(`${girinti(d)}<${a.ad}>`, ...ic, `${girinti(d)}</${a.ad}>`);
        continue;
      }
      const v = degerler[yol] ?? { kaynak: 'gonderme' };
      if (v.kaynak === 'gonderme') continue;
      if (v.kaynak === 'bos') satirlar.push(`${girinti(d)}<${a.ad}/>`);
      else if (v.kaynak === 'nil') satirlar.push(`${girinti(d)}<${a.ad} xsi:nil="true"/>`);
      else if (v.kaynak === 'parametre' || v.kaynak === 'tablo') satirlar.push(`${girinti(d)}<${a.ad}>\${${v.deger ?? ''}}</${a.ad}>`);
      else satirlar.push(`${girinti(d)}<${a.ad}>${xmlKacis(v.deger ?? '')}</${a.ad}>`);
    }
    return satirlar;
  };
  const surum = secenekler.soapSurumu === '1.2' ? '1.2' : '1.1';
  const govde = yaz(sema.alanlar, '', 3);
  return [
    `<soap:Envelope xmlns:soap="${ZARF_NS[surum]}" xmlns:xsi="${XSI}">`,
    '  <soap:Body>',
    govde.length ? `    <${sema.kok}${sema.ns ? ` xmlns="${sema.ns}"` : ''}>` : `    <${sema.kok}${sema.ns ? ` xmlns="${sema.ns}"` : ''}/>`,
    ...govde,
    ...(govde.length ? [`    </${sema.kok}>`] : []),
    '  </soap:Body>',
    '</soap:Envelope>'
  ].join('\n');
}

/**
 * SOAP gövdesinden form değerleri. Form gövdeyi tam temsil edemiyorsa "uyumsuz" dolu döner (neden listesi).
 * @param {string} govde @param {OperasyonSemasi} sema
 * @returns {{ degerler: Record<string, AlanDegeri>; uyumsuz: string[] }}
 */
export function govdeCoz(govde, sema) {
  /** @type {Record<string, AlanDegeri>} */
  const degerler = {};
  /** @type {string[]} */
  const uyumsuz = [];
  let kok;
  try { kok = xmlAyristir(govde); } catch (e) { return { degerler: baslangicDegerleri(sema), uyumsuz: [/** @type {Error} */ (e).message] }; }
  const body = kok.yerel === 'Envelope' ? kok.cocuklar.find((c) => c.yerel === 'Body') : null;
  if (!body) return { degerler: baslangicDegerleri(sema), uyumsuz: ['SOAP zarfı (Envelope / Body) bulunamadı.'] };
  const sarmal = body.cocuklar[0];
  if (!sarmal || sarmal.yerel !== sema.kok) return { degerler: baslangicDegerleri(sema), uyumsuz: [`Gövdedeki işlem öğesi "${sarmal?.yerel ?? '—'}", operasyonun kökü "${sema.kok}" değil.`] };
  if (body.cocuklar.length > 1) uyumsuz.push('Body içinde birden çok öğe var.');
  /** @param {XmlOgesi} ogeler @param {Alan[]} alanlar @param {string} on */
  const gez = (oge, alanlar, on) => {
    const gorulen = new Set();
    for (const c of oge.cocuklar) {
      const a = alanlar.find((x) => x.ad === c.yerel);
      const yol = on ? `${on}/${c.yerel}` : c.yerel;
      if (!a) { uyumsuz.push(`"${yol}" şemada yok.`); continue; }
      if (gorulen.has(c.yerel)) { uyumsuz.push(`"${yol}" birden çok kez var (form tek tekrar destekler).`); continue; }
      gorulen.add(c.yerel);
      const ozler = Object.keys(c.oz).filter((o) => !/^xmlns(:|$)/.test(o) && yerelAd(o) !== 'nil');
      if (ozler.length) uyumsuz.push(`"${yol}" özellik taşıyor (${ozler.join(', ')}).`);
      if (a.cocuklar && a.cocuklar.length) {
        if (c.metin.trim()) uyumsuz.push(`"${yol}" grup öğesi ama metin içeriyor.`);
        gez(c, a.cocuklar, yol);
        continue;
      }
      if (c.cocuklar.length) { uyumsuz.push(`"${yol}" alt öğe içeriyor, şemada değer alanı.`); continue; }
      const nil = Object.entries(c.oz).find(([o]) => yerelAd(o) === 'nil');
      if (nil && nil[1] === 'true') degerler[yol] = { kaynak: 'nil' };
      else if (c.metin === '') degerler[yol] = { kaynak: 'bos' };
      else {
        const p = /^\$\{\s*([^{}$]{1,200}?)\s*\}$/u.exec(c.metin.trim());
        const ic = p ? p[1] : '';
        degerler[yol] = p && ESKI_PARAMETRE.test(ic) ? { kaynak: 'parametre', deger: ic }
          : p && TABLO_BASVURUSU.test(ic) ? { kaynak: 'tablo', deger: ic } : { kaynak: 'sabit', deger: c.metin };
      }
    }
  };
  if (sarmal.metin.trim()) uyumsuz.push('İşlem öğesi metin içeriyor.');
  gez(sarmal, sema.alanlar, '');
  for (const s of alanSatirlari(sema.alanlar)) if (!s.grup && !degerler[s.yol]) degerler[s.yol] = { kaynak: 'gonderme' };
  return { degerler, uyumsuz };
}

/** Tipe göre sabit değer denetimi (arayüz uyarısı; ${…} yer tutucusu her zaman geçer). @param {Alan} alan @param {string} deger */
export function sabitDegerUyarisi(alan, deger) {
  if (/\$\{[^}]+\}/.test(deger) || deger === '') return null;
  switch (alan.tip) {
    case 'tamsayi': return /^-?\d+$/.test(deger) ? null : 'Tam sayı bekleniyor.';
    case 'ondalik': return /^-?\d+(\.\d+)?$/.test(deger) ? null : 'Sayı bekleniyor (ondalık ayıracı nokta).';
    case 'mantiksal': return /^(true|false|1|0)$/.test(deger) ? null : 'true / false bekleniyor.';
    case 'tarih': return /^\d{4}-\d{2}-\d{2}$/.test(deger) ? null : 'Tarih bekleniyor (yyyy-MM-dd).';
    case 'tarihSaat': return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(deger) ? null : 'Tarih-saat bekleniyor (yyyy-MM-ddTHH:mm:ss).';
    default: return alan.secenekler && alan.secenekler.length && !alan.secenekler.includes(deger) ? `Şu değerlerden biri bekleniyor: ${alan.secenekler.join(', ')}` : null;
  }
}
