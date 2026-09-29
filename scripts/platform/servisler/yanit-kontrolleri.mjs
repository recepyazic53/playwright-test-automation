// SERVİS YANITINDAN KONTROL — SAF modül: sunucu (koşuda değerlendirme) ve arayüz (yanıt ağacından kontrol önerisi) ORTAK kullanır
// (/arayuz/yanit-kontrolleri.mjs; yalnız aynı klasördeki sozlesme-dogrulayici.mjs'i içe aktarır). Genel motordur: alan adı / ürün kuralı yok.
// - yanitAlanlari: SOAP / XML ya da JSON yanıtın yaprak alanları (yol + son değer + değer biçimi). XML yolu "/Envelope/Body/X/Y" (önekler
//   atılır; aynı adlı kardeşlerde 1'den başlayan sıra: "Kalem[2]"); JSON yolu "veri.liste[0].no".
// - Kontrol "yanitAlani" { kaynak: xml | json, yol, islec, deger?, enAz?, enCok?, gizli? }: eşittir, içerir, var, yok, desen (tam eşleşme),
//   sayısal aralık. gizli: değer gizli / maskeli alandan — sonuç açıklamasına değer yazılmaz.
// - Kontrol "altinYanit" { bicim, yapi, alanlar, yokSay }: onaylanan yanıtın yapısı (alan yolları, dizilerde sıra yok sayılır) ve kullanıcının
//   seçtiği sabit alanların değerleri; sonraki yanıtlarda eklenen / kaldırılan / değişen alanlar YOL YOL raporlanır (değer yazılmaz).
//   Gizli ya da maskeli alanın değeri hiç saklanmaz; "yok sayılan" yollar (tarih, kimlik gibi her koşuda değişenler) karşılaştırılmaz.
// - Kontrol "yanitSuresi" { deger: ms }: yanıt en çok N ms'de gelmeli.
// - kontrolOnerisi: alanın değer biçiminden işleç önerisi (tarih → tarih deseni, 6+ haneli numara → \d{n}, sayı → aralık, diğer → eşittir);
//   gizli adlı ya da maskeli alanda DEĞER ÖNERİLMEZ (yalnız "var" ya da biçim deseni).
// - benzerAlanlar: bulunamayan okuma yolu için yanıttaki benzer adlar (ad + yol; değer yok) — akıştaki "Değer okunamadı" iletisi.
// Hiçbir şey kendiliğinden eklenmez: bu modül yalnız önerir / değerlendirir; kontrolü kullanıcı ekler.
import { xmlAgaciOku } from './sozlesme-dogrulayici.mjs';

export const KONTROL_ISLECLERI = Object.freeze(['esit', 'icerir', 'var', 'yok', 'desen', 'aralik']);
export const ISLEC_ETIKETLERI = Object.freeze({ esit: 'eşittir', icerir: 'içerir', var: 'var (boş değil)', yok: 'yok', desen: 'desen', aralik: 'sayısal aralık' });
/** Yanıt ağacında en çok kaç yaprak alan listelenir. */
export const EN_COK_ALAN = 500;
/** Altın yanıtta en çok kaç sabit alan / yapı yolu saklanır. */
export const EN_COK_ALTIN_ALAN = 500;
export const EN_COK_ALTIN_YOL = 2000;
/** Rapor ve kayıtlarda kullanılan maske biçimleri. */
const MASKE = /\*{3,}|•{3,}/;
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const TARIH_SAAT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DESENLER = Object.freeze({ tarih: '\\d{4}-\\d{2}-\\d{2}', tarihSaat: '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:?\\d{2})?', uuid: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' });

/** @param {unknown} m */
export const maskeliMi = (m) => MASKE.test(String(m ?? ''));

/**
 * Sayı okuma: "1245.50", "-3", Türkçe biçim "1.245,50" / "12,5". Sayı değilse null.
 * @param {unknown} d @returns {number | null}
 */
export function sayiOku(d) {
  const s = String(d ?? '').trim();
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return Number(s);
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  return null;
}

/**
 * Değerin biçimi: tarih, tarihSaat, uuid, numara (6+ hane), sayi, mantiksal, bos, null, metin.
 * @param {string | null} d
 */
export function degerBicimi(d) {
  if (d === null) return 'null';
  const s = d.trim();
  if (!s) return 'bos';
  if (TARIH.test(s)) return 'tarih';
  if (TARIH_SAAT.test(s)) return 'tarihSaat';
  if (UUID.test(s)) return 'uuid';
  if (/^\d{6,}$/.test(s)) return 'numara';
  if (sayiOku(s) !== null) return 'sayi';
  if (/^(true|false)$/i.test(s)) return 'mantiksal';
  return 'metin';
}

/** @param {any} d @param {string} yol @param {Array<{ yol: string; deger: string | null }>} liste */
function jsonYapraklari(d, yol, liste) {
  if (liste.length >= EN_COK_ALAN) return;
  if (Array.isArray(d)) { d.forEach((x, i) => jsonYapraklari(x, `${yol}[${i}]`, liste)); if (!d.length) liste.push({ yol, deger: null }); return; }
  if (d && typeof d === 'object') {
    const g = Object.entries(d);
    if (!g.length) { liste.push({ yol, deger: null }); return; }
    for (const [a, v] of g) jsonYapraklari(v, yol ? `${yol}.${a}` : a, liste);
    return;
  }
  liste.push({ yol, deger: d === null ? null : String(d) });
}

/**
 * @typedef {{ ad: string; oz: Record<string, string>; cocuklar: XmlDugumu[]; metin: string }} XmlDugumu
 * @param {XmlDugumu} d @param {string} yol @param {Array<{ yol: string; deger: string | null }>} liste
 */
function xmlYapraklari(d, yol, liste) {
  if (liste.length >= EN_COK_ALAN) return;
  if (!d.cocuklar.length) { liste.push({ yol, deger: d.oz.nil === 'true' || d.oz.nil === '1' ? null : d.metin.trim() }); return; }
  /** @type {Map<string, number>} */
  const sayilar = new Map();
  for (const c of d.cocuklar) sayilar.set(c.ad, (sayilar.get(c.ad) ?? 0) + 1);
  /** @type {Map<string, number>} */
  const sira = new Map();
  for (const c of d.cocuklar) {
    const n = (sira.get(c.ad) ?? 0) + 1;
    sira.set(c.ad, n);
    xmlYapraklari(c, `${yol}/${c.ad}${(sayilar.get(c.ad) ?? 0) > 1 ? `[${n}]` : ''}`, liste);
  }
}

/**
 * Yanıtın yaprak alanları. JSON önce denenir; değilse XML. Okunamazsa bicim null.
 * @param {string} govde
 * @returns {{ bicim: 'xml' | 'json' | null; alanlar: Array<{ yol: string; ad: string; deger: string | null; bicim: string; maskeli: boolean }>; kirpildi: boolean }}
 */
export function yanitAlanlari(govde) {
  /** @type {Array<{ yol: string; deger: string | null }>} */
  const liste = [];
  let bicim = /** @type {'xml' | 'json' | null} */ (null);
  const s = String(govde ?? '').trim();
  if (/^[[{]/.test(s)) {
    try { jsonYapraklari(JSON.parse(s), '', liste); bicim = 'json'; } catch { /* JSON değil */ }
  }
  if (!bicim) {
    const kok = xmlAgaciOku(s);
    if (kok) { xmlYapraklari(kok, `/${kok.ad}`, liste); bicim = 'xml'; }
  }
  return {
    bicim, kirpildi: liste.length >= EN_COK_ALAN,
    alanlar: liste.map((x) => ({ ...x, ad: alanAdi(x.yol), bicim: degerBicimi(x.deger), maskeli: maskeliMi(x.deger) }))
  };
}

/** Yolun son adı ("…/Kalem[2]/Kod" → "Kod"; "a.b[0]" → "b"). @param {string} yol */
export const alanAdi = (yol) => String(yol).split(/[/.]/).filter(Boolean).pop()?.replace(/\[\d+\]$/, '') ?? '';

/** İki ad arasındaki düzenleme uzaklığı (harf ekleme / silme / değiştirme sayısı). @param {string} a @param {string} b */
function uzaklik(a, b) {
  let onceki = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const satir = [i];
    for (let j = 1; j <= b.length; j++) satir[j] = Math.min(onceki[j] + 1, satir[j - 1] + 1, onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    onceki = satir;
  }
  return onceki[b.length];
}

/**
 * Okuma yolunun aradığı ad: son adımın yerel adı (önek, sıra, "$." atılır). "//ns:Token" → "Token"; "veri.liste[0].no" → "no".
 * @param {string} yol
 */
export function arananAd(yol) {
  const son = String(yol).trim().replace(/^\$\.?/, '').split(/[/.]/).filter(Boolean).pop() ?? '';
  return son.replace(/(\[\d+\])+$/, '').replace(/^[^:]*:/, '').replace(/^@/, '');
}

/**
 * Bulunamayan okuma yolu için yanıttaki BENZER alanlar: yalnız ad ve yol (DEĞER YOK — gizli / maskeli alanın değeri de hiç taşınmaz).
 * Sıra: aynı ad (büyük / küçük harf farkı) → biri ötekini içeriyor → yazım yakınlığı. Aynı yapıdaki tekrarlar (Kalem[1], Kalem[2]) bir kez.
 * @param {string} govde @param {string} yol @param {number} [enCok]
 * @returns {{ bicim: 'xml' | 'json' | null; ad: string; alanlar: Array<{ ad: string; yol: string }>; toplam: number }}
 */
export function benzerAlanlar(govde, yol, enCok = 5) {
  const y = yanitAlanlari(govde);
  const ad = arananAd(yol);
  const hedef = ad.toLowerCase();
  if (!y.bicim || !hedef) return { bicim: y.bicim, ad, alanlar: [], toplam: y.alanlar.length };
  /** @type {Map<string, { ad: string; yol: string; puan: number }>} */
  const adaylar = new Map();
  for (const a of y.alanlar) {
    const k = a.ad.toLowerCase();
    if (!k) continue;
    const puan = k === hedef ? 0 : k.includes(hedef) || (k.length >= 3 && hedef.includes(k)) ? 1 : uzaklik(k, hedef) <= Math.max(1, Math.floor(hedef.length / 4)) ? 2 : -1;
    if (puan < 0) continue;
    const anahtar = yapiYolu(a.yol);
    const onceki = adaylar.get(anahtar);
    if (!onceki || puan < onceki.puan) adaylar.set(anahtar, { ad: a.ad, yol: a.yol, puan });
  }
  const alanlar = [...adaylar.values()].sort((a, b) => a.puan - b.puan || a.yol.length - b.yol.length).slice(0, enCok).map(({ ad: x, yol: p }) => ({ ad: x, yol: p }));
  return { bicim: y.bicim, ad, alanlar, toplam: y.alanlar.length };
}
/**
 * Dizi sıralarını atan yol (yapı karşılaştırması). XML'de tek ya da çok tekrar aynı yapıdır: "…/Kalem[2]/Kod" → "…/Kalem/Kod";
 * JSON'da dizi işareti kalır: "a[0].b" → "a[].b".
 * @param {string} yol
 */
export const yapiYolu = (yol) => (String(yol).startsWith('/') ? String(yol).replace(/\[\d+\]/g, '') : String(yol).replace(/\[\d+\]/g, '[]'));

/**
 * Tek alan okuma. XML: "/Envelope/Body/X/Y[2]/Z" (önekler yok sayılır; sırasız ad ilk öğe); JSON: "a.b[0].c" (baştaki "$." isteğe bağlı).
 * @param {string} govde @param {'xml' | 'json'} kaynak @param {string} yol @returns {{ bulundu: boolean; deger: string | null }}
 */
export function yanitAlaniOku(govde, kaynak, yol) {
  if (kaynak === 'json') {
    /** @type {any} */
    let v;
    try { v = JSON.parse(String(govde)); } catch { return { bulundu: false, deger: null }; }
    for (const p of String(yol).replace(/^\$\.?/, '').split(/\.|\[(\d+)\]/).filter((x) => x !== undefined && x !== '')) {
      if (v === null || typeof v !== 'object' || !Object.hasOwn(v, p)) return { bulundu: false, deger: null };
      v = v[p];
    }
    return { bulundu: v !== undefined, deger: v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v) };
  }
  const kok = xmlAgaciOku(String(govde));
  if (!kok) return { bulundu: false, deger: null };
  const parcalar = String(yol).split('/').filter(Boolean).map((p) => { const m = /^(?:[\w.-]+:)?([^[\]]+)(?:\[(\d+)\])?$/.exec(p); return m ? { ad: m[1], sira: m[2] ? Number(m[2]) : 1 } : { ad: p, sira: 1 }; });
  if (!parcalar.length || parcalar[0].ad !== kok.ad) return { bulundu: false, deger: null };
  /** @type {XmlDugumu | undefined} */
  let d = kok;
  for (const p of parcalar.slice(1)) {
    d = d?.cocuklar.filter((c) => c.ad === p.ad)[p.sira - 1];
    if (!d) return { bulundu: false, deger: null };
  }
  const tum = (/** @type {XmlDugumu} */ x) => x.metin + x.cocuklar.map(tum).join('');
  return { bulundu: true, deger: d.oz.nil === 'true' || d.oz.nil === '1' ? null : tum(d).trim() };
}

/** @param {string} desen */
function desenDerle(desen) {
  try { return new RegExp(`^(?:${desen})$`, 'u'); } catch { return null; }
}

/**
 * "yanitAlani" kontrolünün adı (raporda). Gizli alanın değeri ada yazılmaz (zaten yalnız var / desen).
 * @param {{ yol?: string; islec?: string; deger?: string; enAz?: number; enCok?: number; kaynak?: string }} k
 */
export function yanitAlaniAdi(k) {
  const yol = `${k.kaynak === 'json' ? 'JSON ' : ''}${k.yol ?? ''}`;
  switch (k.islec) {
    case 'esit': return `${yol} = "${k.deger ?? ''}"`;
    case 'icerir': return `${yol} içerir "${k.deger ?? ''}"`;
    case 'var': return `${yol} var`;
    case 'yok': return `${yol} yok`;
    case 'desen': return `${yol} desen /${k.deger ?? ''}/`;
    case 'aralik': return `${yol} aralık ${k.enAz ?? '−∞'} – ${k.enCok ?? '+∞'}`;
    default: return yol;
  }
}

/**
 * "yanitAlani" kontrolünü değerlendirir. gizli: açıklamaya değer yazılmaz.
 * @param {string} govde
 * @param {{ kaynak?: 'xml' | 'json'; yol?: string; islec?: string; deger?: string; enAz?: number; enCok?: number; gizli?: boolean }} k
 * @returns {{ gecti: boolean; aciklama: string }}
 */
export function yanitAlaniDegerlendir(govde, k) {
  const r = yanitAlaniOku(govde, k.kaynak === 'json' ? 'json' : 'xml', String(k.yol ?? ''));
  const var_ = r.bulundu && r.deger !== null && r.deger !== '';
  const goster = (/** @type {string | null} */ d) => (k.gizli || maskeliMi(d) ? 'gizli değer' : `"${String(d ?? '').slice(0, 300)}"`);
  if (k.islec === 'var') return var_ ? { gecti: true, aciklama: 'Alan var' } : { gecti: false, aciklama: r.bulundu ? 'Alan boş' : 'Alan yanıtta yok' };
  if (k.islec === 'yok') return !var_ ? { gecti: true, aciklama: r.bulundu ? 'Alan boş' : 'Alan yanıtta yok' } : { gecti: false, aciklama: 'Alan yanıtta var' };
  if (!r.bulundu) return { gecti: false, aciklama: 'Alan yanıtta yok' };
  const d = r.deger ?? '';
  if (k.islec === 'esit') return d === k.deger ? { gecti: true, aciklama: goster(d) } : { gecti: false, aciklama: `Görülen: ${goster(d)}` };
  if (k.islec === 'icerir') return d.includes(String(k.deger ?? '')) ? { gecti: true, aciklama: 'Geçiyor' } : { gecti: false, aciklama: `Görülen: ${goster(d)}` };
  if (k.islec === 'desen') {
    const re = desenDerle(String(k.deger ?? ''));
    if (!re) return { gecti: false, aciklama: 'Desen geçersiz' };
    return re.test(d) ? { gecti: true, aciklama: 'Desene uyuyor' } : { gecti: false, aciklama: k.gizli || maskeliMi(d) ? 'Desene uymuyor' : `Desene uymuyor: ${goster(d)}` };
  }
  if (k.islec === 'aralik') {
    const n = sayiOku(d);
    if (n === null) return { gecti: false, aciklama: `Sayı değil: ${goster(d)}` };
    const ic = (k.enAz === undefined || n >= k.enAz) && (k.enCok === undefined || n <= k.enCok);
    return ic ? { gecti: true, aciklama: goster(d) } : { gecti: false, aciklama: `Aralık dışında: ${goster(d)}` };
  }
  return { gecti: false, aciklama: 'Bilinmeyen işleç' };
}

/**
 * Alanın değer biçiminden kontrol önerisi. Gizli adlı ya da maskeli alanda değer önerilmez: biçimi belliyse desen, değilse "var".
 * @param {{ yol: string; ad?: string; deger: string | null; bicim?: string; maskeli?: boolean }} alan @param {(ad: string) => boolean} [gizliMi]
 * @returns {{ islec: string; deger?: string; enAz?: number; enCok?: number; gizli: boolean; neden: string }}
 */
export function kontrolOnerisi(alan, gizliMi = () => false) {
  const bicim = alan.bicim ?? degerBicimi(alan.deger);
  const gizli = Boolean(alan.maskeli || maskeliMi(alan.deger) || gizliMi(alan.ad ?? alanAdi(alan.yol)));
  const d = String(alan.deger ?? '').trim();
  const desenli = bicim === 'tarih' ? { islec: 'desen', deger: DESENLER.tarih, neden: 'tarih biçimi (yyyy-MM-dd)' }
    : bicim === 'tarihSaat' ? { islec: 'desen', deger: DESENLER.tarihSaat, neden: 'tarih-saat biçimi' }
      : bicim === 'uuid' ? { islec: 'desen', deger: DESENLER.uuid, neden: 'kimlik (UUID) biçimi' }
        : bicim === 'numara' ? { islec: 'desen', deger: `\\d{${d.length}}`, neden: `${d.length} haneli numara` } : null;
  if (gizli) {
    // Maskeli değerin biçimi bilinmez; açık ama gizli adlı değerin yalnız biçimi (uzunluk / desen) önerilir, kendisi asla.
    if (desenli && !alan.maskeli && !maskeliMi(alan.deger)) return { ...desenli, gizli: true, neden: `gizli alan: değer saklanmaz; ${desenli.neden}` };
    return { islec: 'var', gizli: true, neden: 'gizli alan: değer saklanmaz, yalnız var olduğu denetlenir' };
  }
  if (bicim === 'null' || bicim === 'bos') return { islec: 'var', gizli: false, neden: 'son yanıtta boş' };
  if (desenli) return { ...desenli, gizli: false };
  if (bicim === 'sayi') return { islec: 'aralik', gizli: false, neden: 'sayı: aralığı siz girin' };
  return { islec: 'esit', deger: d, gizli: false, neden: bicim === 'mantiksal' ? 'evet / hayır' : 'sabit metin' };
}

/** Her koşuda değişmesi olası alan (altın yanıtta varsayılan "yok say"): tarih, tarih-saat, UUID, 6+ haneli numara. @param {{ deger: string | null; bicim?: string }} alan */
export const degiskenMi = (alan) => ['tarih', 'tarihSaat', 'uuid', 'numara'].includes(alan.bicim ?? degerBicimi(alan.deger));

/** Yol, yok sayılan bir yolun kendisi ya da altında mı (dizi sıraları yok sayılır). @param {string} yol @param {string[]} yokSay */
function yokSayilir(yol, yokSay) {
  const y = yapiYolu(yol);
  return yokSay.some((x) => { const z = yapiYolu(x); return y === z || y.startsWith(`${z}/`) || y.startsWith(`${z}.`) || y.startsWith(`${z}[`); });
}

/**
 * Onaylanan yanıttan "altinYanit" kontrolü: yapı (tüm yaprak yollar, dizi sıraları atılmış), kullanıcının seçtiği sabit alanların
 * değerleri (gizli / maskeli olanlar atlanır — değer saklanmaz), yok sayılan yollar.
 * @param {string} govde @param {{ karsilastir: string[]; yokSay: string[]; gizliMi?: (ad: string) => boolean }} s
 */
export function altinYanitOlustur(govde, s) {
  const y = yanitAlanlari(govde);
  if (!y.bicim) throw new Error('Yanıt XML ya da JSON olarak okunamadı; altın yanıt oluşturulamaz.');
  const gizliMi = s.gizliMi ?? (() => false);
  const secili = new Set(s.karsilastir);
  const yokSay = [...new Set(s.yokSay.map(String))].slice(0, EN_COK_ALTIN_ALAN);
  const alanlar = y.alanlar.filter((a) => secili.has(a.yol) && !yokSayilir(a.yol, yokSay) && !a.maskeli && !gizliMi(a.ad) && a.deger !== null)
    .slice(0, EN_COK_ALTIN_ALAN).map((a) => ({ yol: a.yol, deger: /** @type {string} */ (a.deger) }));
  const yapi = [...new Set(y.alanlar.map((a) => yapiYolu(a.yol)))].slice(0, EN_COK_ALTIN_YOL);
  return { tur: 'altinYanit', bicim: y.bicim, yapi, alanlar, yokSay };
}

/**
 * Yanıtı altın yanıtla karşılaştırır: eklenen / kaldırılan alan (yapı) ve değişen sabit alan; yok sayılanlar hariç. Değer yazılmaz.
 * @param {string} govde @param {{ bicim?: string; yapi?: string[]; alanlar?: Array<{ yol: string; deger: string }>; yokSay?: string[] }} k
 * @returns {{ gecti: boolean; aciklama: string; farklar: Array<{ tur: 'eklenen' | 'kaldirilan' | 'degisen'; yol: string }> }}
 */
export function altinYanitKarsilastir(govde, k) {
  const y = yanitAlanlari(govde);
  if (!y.bicim) return { gecti: false, aciklama: 'Yanıt XML ya da JSON olarak okunamadı', farklar: [] };
  if (k.bicim && y.bicim !== k.bicim) return { gecti: false, aciklama: `Yanıt biçimi değişti (${k.bicim} → ${y.bicim})`, farklar: [] };
  const yokSay = k.yokSay ?? [];
  const onceki = new Set((k.yapi ?? []).filter((x) => !yokSayilir(x, yokSay)));
  const simdiki = new Set(y.alanlar.map((a) => yapiYolu(a.yol)).filter((x) => !yokSayilir(x, yokSay)));
  /** @type {Array<{ tur: 'eklenen' | 'kaldirilan' | 'degisen'; yol: string }>} */
  const farklar = [];
  for (const x of simdiki) if (!onceki.has(x)) farklar.push({ tur: 'eklenen', yol: x });
  for (const x of onceki) if (!simdiki.has(x)) farklar.push({ tur: 'kaldirilan', yol: x });
  for (const a of k.alanlar ?? []) {
    if (yokSayilir(a.yol, yokSay)) continue;
    const r = yanitAlaniOku(govde, y.bicim, a.yol);
    if (!r.bulundu) { if (!farklar.some((f) => f.tur === 'kaldirilan' && f.yol === yapiYolu(a.yol))) farklar.push({ tur: 'kaldirilan', yol: a.yol }); continue; }
    if ((r.deger ?? '') !== a.deger) farklar.push({ tur: 'degisen', yol: a.yol });
  }
  if (!farklar.length) return { gecti: true, aciklama: `Yapı ve ${(k.alanlar ?? []).length} sabit alan aynı`, farklar };
  const say = (/** @type {string} */ t) => farklar.filter((f) => f.tur === t).length;
  return { gecti: false, aciklama: [say('eklenen') ? `${say('eklenen')} eklenen` : '', say('kaldirilan') ? `${say('kaldirilan')} kaldırılan` : '', say('degisen') ? `${say('degisen')} değişen` : ''].filter(Boolean).join(', ') + ' alan', farklar };
}

/** "yanitSuresi" kontrolü: yanıt en çok N ms'de gelmeli. @param {number | undefined} sureMs @param {{ deger?: string }} k */
export function yanitSuresiDegerlendir(sureMs, k) {
  const sinir = Number(k.deger);
  if (typeof sureMs !== 'number' || !Number.isFinite(sureMs)) return { gecti: false, aciklama: 'Yanıt süresi ölçülemedi' };
  return sureMs <= sinir ? { gecti: true, aciklama: `${sureMs} ms` } : { gecti: false, aciklama: `${sureMs} ms (sınır ${sinir} ms)` };
}
