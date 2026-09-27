// SERVİS TESTLERİ — SOAP istemcisi: yer tutucuları doldurur, isteği gönderir, yanıtı kontrollerle değerlendirir.
// Genel motordur: proje/ürün adı içermez. Ağ isteği YALNIZCA çağıran (sunucu uç noktası) istediğinde yapılır.
import http from 'node:http';
import https from 'node:https';
import { wsdlSemalari } from './wsdl-semasi.mjs';
import { AD_KALIBI, BICIM_KALIBI, ETIKET_KALIBI } from '../tablolar/tablo-secimi.mjs';
import * as hesap from './hesap-kurallari.mjs';
import { tarihBicimle, VARSAYILAN_TARIH_BICIMI } from './hesap-kurallari.mjs';

export { tarihBicimle, VARSAYILAN_TARIH_BICIMI };

export const VARSAYILAN_ZAMAN_ASIMI_MS = 60_000;
/** Saklanan yanıt en çok bu kadar karakter tutulur (rapor boyutu). */
export const YANIT_SAKLAMA_SINIRI = 200_000;
export const MASKE = '***';

export class ServisHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'ServisHatasi';
  }
}

// ---------------------------------------------------------------------------------------
// Yer tutucular
// ---------------------------------------------------------------------------------------

/**
 * Tarih ifadesi ("bugun", "bugun+1y", "BEGIN_DATE-30g"; kurallar verilirse kural adları) → tarih. Hata ServisHatasi.
 * @param {string} ifade @param {Date} simdi @param {Record<string, string>} [kurallar]
 */
export function goreliTarih(ifade, simdi, kurallar = {}) {
  let v;
  try { v = hesap.ifadeDegeri(ifade, kurallar, { simdi }); } catch (e) { throw new ServisHatasi(/** @type {Error} */ (e).message); }
  if (!(v instanceof Date)) throw new ServisHatasi(`Tarih ifadesi anlaşılmadı: "${ifade}" (ör. bugun, bugun+1y, bugun-30g, BEGIN_DATE+1y).`);
  return v;
}

/** Parametre başvurusu: ${AD} ya da doğrudan tarih ${tarih:bugun+1y|yyyy-MM-dd}. */
// ${tarih:ifade|biçim} · ${AD} (eski parametre) · ${Tablo.Sütun} / ${Tablo[etiket].Sütun} (test verisi tablosu); başvuruda "|biçim"
// varsa değer tarih olarak okunup o biçimde yazılır (ör. ${Kişi.Doğum tarihi|yyyy-MM-dd'T'HH:mm:ss}) · ${akis:Ad} (servis akışında
// önceki adımın yanıtından okunan değer, ör. token).
const AKIS_ADI = '[A-Za-z_][A-Za-z0-9_-]{0,59}';
/** Akış değeri adı (okuma adı). */
export const AKIS_DEGERI_ADI = new RegExp(`^${AKIS_ADI}$`);
const PARAMETRE = new RegExp(`\\$\\{\\s*(?:tarih:([^|}]+)(?:\\|([^}]+))?|akis:(${AKIS_ADI})|([A-Za-z_][A-Za-z0-9_.-]{0,79}|${AD_KALIBI}(?:\\[${ETIKET_KALIBI}\\])?\\.${AD_KALIBI})\\s*(?:\\|(${BICIM_KALIBI}))?)\\s*\\}`, 'gu');

/**
 * Tablodaki tarih değeri → biçimli metin. Okunan: yyyy-MM-dd (ardından isteğe bağlı T/boşluk + HH:mm[:ss]), dd.MM.yyyy,
 * dd/MM/yyyy (isteğe bağlı saat). Okunamazsa hata (değer mesaja yazılmaz; kişisel olabilir).
 * @param {string} deger @param {string} bicim @param {string} ad
 */
export function tarihDegeriBicimle(deger, bicim, ad) {
  const v = deger.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  const p = iso ? [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]] : tr ? [tr[3], tr[2], tr[1], tr[4], tr[5], tr[6]] : null;
  const [y, a, g, s, dk, sn] = (p ?? []).map((x) => Number(x ?? 0));
  const t = p ? new Date(y, a - 1, g, s, dk, sn) : null;
  if (!t || t.getFullYear() !== y || t.getMonth() !== a - 1 || t.getDate() !== g) {
    throw new ServisHatasi(`"${ad}" değeri tarih olarak okunamadı (beklenen: 1983-05-10 ya da 10.05.1983).`);
  }
  return tarihBicimle(t, bicim);
}

/**
 * Kural ya da satır içi ifade "İFADE|BİÇİM" (tarih ve hesaplama; bkz. hesap-kurallari.mjs) → metin. Tarihte biçim yoksa
 * varsayilanBicim (Ayarlar > Koşu > Varsayılan tarih biçimi). Hata ServisHatasi.
 * @param {string} kural @param {Date} simdi @param {string} [varsayilanBicim] @param {Record<string, string>} [kurallar]
 */
export function tarihKuraliUygula(kural, simdi, varsayilanBicim = VARSAYILAN_TARIH_BICIMI, kurallar = {}) {
  try { return hesap.ifadeUygula(kural, kurallar, { simdi }, varsayilanBicim); } catch (e) { throw new ServisHatasi(/** @type {Error} */ (e).message); }
}

/**
 * Gövdedeki ${AD} başvurularını doldurur: önce tarih kuralı (tarihKurallari[AD]), sonra değer (degerler[AD]; XML için
 * kaçışlanır). ${akis:Ad} akisDegerleri'nden (servis akışı / oturum). Değeri bulunamayan parametreler tek hatada listelenir
 * (nereden dolacağı "eksikAciklamasi" ile söylenir). kacis: 'xml' (gövde; varsayılan) · 'baslik' (HTTP başlığı: kaçış yok,
 * satır sonu içeren değer reddedilir) · 'json' (JSON metin kaçışı; REST gövdesi) · 'url' (URL kodlaması; REST yolu / form) · 'yok'.
 * @param {string} govde
 * @param {{ degerler: Record<string, string>; tarihKurallari?: Record<string, string>; simdi?: Date; eksikAciklamasi?: (ad: string) => string;
 *   akisDegerleri?: Record<string, string>; kacis?: 'xml' | 'baslik' | 'json' | 'url' | 'yok'; varsayilanTarihBicimi?: string;
 *   tarihOnbellegi?: Map<string, any>; gizliler?: string[] }} baglam  tarihKurallari: hesaplama kuralları (tarih kuralları dahil);
 *   tarihOnbellegi: aynı istekteki doldurmalar (gövde / yol / başlık) paylaşır; gizliler: hata mesajlarında maskelenir.
 */
export function yerTutuculariDoldur(govde, baglam) {
  const simdi = baglam.simdi ?? new Date();
  /** @type {Set<string>} */
  const eksik = new Set();
  const kurallar = baglam.tarihKurallari ?? {};
  // Hesaplama bağlamı: aynı doldurmada (ve tarihOnbellegi paylaşılırsa aynı istekte) her kural bir kez hesaplanır.
  /** @type {import('./hesap-kurallari.mjs').Baglam} */
  const hb = {
    simdi, onbellek: baglam.tarihOnbellegi ?? new Map(),
    ref: (ad) => (Object.hasOwn(kurallar, ad) ? hesap.kuralUygula(ad, kurallar, hb, baglam.varsayilanTarihBicimi) : Object.hasOwn(baglam.degerler, ad) ? baglam.degerler[ad] : undefined),
    akis: (ad) => (baglam.akisDegerleri && Object.hasOwn(baglam.akisDegerleri, ad) ? baglam.akisDegerleri[ad] : undefined)
  };
  /** Hesap: eksik başvuru eksik listesine; diğer hata (gizliler maskeli) ServisHatasi. @param {() => string} f */
  const hesapla = (f) => {
    try { return f(); } catch (e) {
      if (e instanceof hesap.HesapHatasi && e.tur === 'tanimsiz' && /** @type {any} */ (e).ad) { eksik.add(/** @type {any} */ (e).ad); return ''; }
      if (e instanceof hesap.HesapHatasi) throw new ServisHatasi(gizlileriMaskele(e.message, baglam.gizliler ?? []));
      throw e;
    }
  };
  const kacis = (/** @type {string} */ v, /** @type {string} */ ad) => {
    if (baglam.kacis === 'json') return JSON.stringify(v).slice(1, -1);
    if (baglam.kacis === 'url') return encodeURIComponent(v);
    if (baglam.kacis === 'yok') return v;
    if (baglam.kacis !== 'baslik') return xmlKacis(v);
    if (/[\r\n]/.test(v)) throw new ServisHatasi(`"${ad}" değeri satır sonu içeriyor; başlıkta kullanılamaz.`);
    return v;
  };
  // Satır içi hesap: ${hesap: ifade | biçim} (XML gövdede ifade kaçışlı yazılır, önce çözülür).
  let metin = govde;
  for (const b of hesap.hesapBloklari(govde).reverse()) {
    const ic = !baglam.kacis || baglam.kacis === 'xml' ? xmlKacisCoz(b.ic) : b.ic;
    const d = hesapla(() => hesap.ifadeUygula(ic, kurallar, hb, baglam.varsayilanTarihBicimi));
    metin = `${metin.slice(0, b.bas)}${kacis(d, 'hesap')}${metin.slice(b.son)}`;
  }
  const sonuc = metin.replace(PARAMETRE, (_m, tarihIfadesi, bicim, akisAdi, hamAd, degerBicimi) => {
    if (tarihIfadesi) return hesapla(() => hesap.ifadeUygula(bicim ? `${tarihIfadesi}|${bicim}` : tarihIfadesi, kurallar, hb, baglam.varsayilanTarihBicimi));
    if (akisAdi) {
      const v = baglam.akisDegerleri && Object.hasOwn(baglam.akisDegerleri, akisAdi) ? baglam.akisDegerleri[akisAdi] : undefined;
      if (v === undefined) { eksik.add(`akis:${akisAdi}`); return ''; }
      return kacis(v, `akis:${akisAdi}`);
    }
    const ad = typeof hamAd === 'string' ? hamAd.trim() : hamAd;
    if (Object.hasOwn(kurallar, ad)) return kacis(hesapla(() => hesap.kuralUygula(ad, kurallar, hb, baglam.varsayilanTarihBicimi)), ad);
    const d = Object.hasOwn(baglam.degerler, ad) ? baglam.degerler[ad] : undefined;
    if (typeof d !== 'string') { eksik.add(ad); return ''; }
    return kacis(degerBicimi ? tarihDegeriBicimle(d, degerBicimi.trim(), ad) : d, ad);
  });
  if (eksik.size) {
    const aciklama = (/** @type {string} */ a) => (a.startsWith('akis:') ? 'akış değeri: yalnız servis akışında ya da oturum akışıyla dolar'
      : baglam.eksikAciklamasi ? baglam.eksikAciklamasi(a) : '');
    throw new ServisHatasi(`Değeri bulunamayan parametre: ${[...eksik].map((a) => (aciklama(a) ? `${a} (${aciklama(a)})` : a)).join(', ')}.`);
  }
  return sonuc;
}

/**
 * Gövdede geçen parametre adları (doğrudan tarih ifadeleri ve ${akis:…} hariç). ${hesap: …} bloklarının içindeki ${X} başvuruları
 * da sayılır (bloğun kendisi parametre değildir).
 * @param {string} govde
 */
export function kullanilanParametreler(govde) {
  const bloklar = hesap.hesapBloklari(govde);
  let duz = govde;
  for (const b of [...bloklar].reverse()) duz = `${duz.slice(0, b.bas)} ${duz.slice(b.son)}`;
  const ic = bloklar.flatMap((b) => [...b.ic.matchAll(/\$\{\s*([^{}]+?)\s*\}/g)].map((m) => m[1]).filter((x) => !x.startsWith('akis:')));
  return [...new Set([...[...duz.matchAll(PARAMETRE)].map((m) => m[4]?.trim()), ...ic].filter(Boolean))];
}

/** Metinde geçen akış değeri adları (${akis:Ad}). @param {string} metin */
export function kullanilanAkisDegerleri(metin) {
  return [...new Set([...metin.matchAll(PARAMETRE)].map((m) => m[3]).filter(Boolean))];
}

/**
 * Yanıttan değer okuma: xml (basit XPath: /A/B, //B, //A/B), json (a.b[0].c; baştaki "$." isteğe bağlı), baslik (yanıt başlığı).
 * Bulunamazsa undefined.
 * @param {{ govde: string; basliklar?: Record<string, string> }} yanit @param {{ kaynak?: 'xml' | 'json' | 'baslik'; yol: string }} okuma
 * @returns {string | undefined}
 */
export function degerOku(yanit, okuma) {
  const yol = okuma.yol.trim();
  if (okuma.kaynak === 'baslik') {
    const b = Object.entries(yanit.basliklar ?? {}).find(([a]) => a.toLowerCase() === yol.toLowerCase());
    return b ? b[1] : undefined;
  }
  if (okuma.kaynak === 'json') {
    let v;
    try { v = JSON.parse(yanit.govde); } catch { return undefined; }
    for (const p of yol.replace(/^\$\.?/, '').split(/\.|\[(\d+)\]/).filter((x) => x !== undefined && x !== '')) {
      if (v === null || typeof v !== 'object') return undefined;
      v = /** @type {any} */ (v)[p];
    }
    return v === undefined || v === null ? undefined : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  const kok = xmlAgaci(yanit.govde);
  return kok ? xpathMetni(kok, yol) : undefined;
}

/** @param {string} s */
export const xmlKacis = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** @param {string} s */
export const xmlKacisCoz = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Saklanacak metinde gizli değerleri (parola vb.) maskeler (XML / JSON kaçışlı, URL kodlu ve düz hâlleri).
 * @param {string} metin @param {string[]} gizliler
 */
export function gizlileriMaskele(metin, gizliler) {
  let m = metin;
  for (const d of gizliler.filter((x) => x && x.length >= 2).sort((a, b) => b.length - a.length)) {
    for (const bicim of [xmlKacis(d), JSON.stringify(d).slice(1, -1), encodeURIComponent(d), d]) m = m.split(bicim).join(MASKE);
  }
  return m;
}

// ---------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------

/**
 * @typedef {{ durumKodu: number; basliklar: Record<string, string>; govde: string; sureMs: number }} HamYanit
 */

/**
 * @param {{ adres: string; yontem?: string; basliklar?: Record<string, string>; govde?: string; zamanAsimiMs?: number; tlsDogrulama?: boolean;
 *   sinyal?: AbortSignal; gonderildi?: () => void }} istek  gonderildi: istek gövdesi karşıya yazılınca çağrılır.
 * @returns {Promise<HamYanit>}
 */
export function httpIstegi(istek) {
  let url;
  try {
    url = new URL(istek.adres);
  } catch {
    return Promise.reject(new ServisHatasi(`Geçersiz adres: ${istek.adres}`));
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.reject(new ServisHatasi('Adres http(s) olmalıdır.'));
  const modul = url.protocol === 'https:' ? https : http;
  const bas = Date.now();
  const zamanAsimi = istek.zamanAsimiMs ?? VARSAYILAN_ZAMAN_ASIMI_MS;
  return new Promise((coz, red) => {
    const govde = istek.govde === undefined ? undefined : Buffer.from(istek.govde, 'utf8');
    const r = modul.request(url, {
      method: istek.yontem ?? (govde ? 'POST' : 'GET'),
      headers: { ...(istek.basliklar ?? {}), ...(govde ? { 'Content-Length': String(govde.length) } : {}) },
      timeout: zamanAsimi,
      ...(url.protocol === 'https:' ? { rejectUnauthorized: istek.tlsDogrulama !== false } : {})
    }, (y) => {
      /** @type {Buffer[]} */
      const parcalar = [];
      y.on('data', (p) => parcalar.push(p));
      y.on('end', () => coz({
        durumKodu: y.statusCode ?? 0,
        basliklar: Object.fromEntries(Object.entries(y.headers).map(([a, d]) => [a, Array.isArray(d) ? d.join(', ') : String(d ?? '')])),
        govde: Buffer.concat(parcalar).toString('utf8'), sureMs: Date.now() - bas
      }));
      y.on('error', red);
    });
    r.on('timeout', () => r.destroy(new ServisHatasi(`Yanıt ${Math.round(zamanAsimi / 1000)} sn içinde gelmedi.`)));
    r.on('error', (e) => red(e instanceof ServisHatasi ? e : new ServisHatasi(`Bağlantı kurulamadı: ${agHatasiMetni(e)}`)));
    // Durdurma: istek (ya da yanıt beklemesi) kesilir.
    if (istek.sinyal) {
      if (istek.sinyal.aborted) { r.destroy(new ServisHatasi('Kullanıcı durdurdu.')); return; }
      istek.sinyal.addEventListener('abort', () => r.destroy(new ServisHatasi('Kullanıcı durdurdu.')), { once: true });
    }
    if (govde) r.write(govde);
    r.end(() => istek.gonderildi?.());
  });
}

/** @param {any} e */
function agHatasiMetni(e) {
  const kod = e?.code ? `${e.code} ` : '';
  if (e?.code === 'ENOTFOUND') return `${kod}(adres çözülemedi — VPN / ağ bağlantısını kontrol edin)`;
  if (e?.code === 'ECONNREFUSED') return `${kod}(bağlantı reddedildi)`;
  if (/certificate|self.signed|UNABLE_TO_VERIFY/i.test(String(e?.code ?? e?.message))) return `${kod}(TLS sertifikası doğrulanamadı; iç ortamsa servis ayarında "TLS doğrulama" kapatılabilir)`;
  return `${kod}${e?.message ?? e}`;
}

/**
 * SOAP isteği. 1.1: text/xml + SOAPAction; 1.2: application/soap+xml; action=... ekBasliklar (ör. Authorization) eklenir;
 * Content-Type / SOAPAction ezilemez.
 * @param {{ adres: string; eylem?: string; soapSurumu?: '1.1' | '1.2'; govde: string; zamanAsimiMs?: number; tlsDogrulama?: boolean;
 *   sinyal?: AbortSignal; gonderildi?: () => void; ekBasliklar?: Record<string, string> }} istek
 */
export function soapIstegi(istek) {
  const soapBasliklari = istek.soapSurumu === '1.2'
    ? { 'Content-Type': `application/soap+xml; charset=utf-8${istek.eylem ? `; action="${istek.eylem}"` : ''}` }
    : { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${istek.eylem ?? ''}"` };
  const korunan = new Set(['content-type', 'soapaction', 'content-length', 'host']);
  const ek = Object.fromEntries(Object.entries(istek.ekBasliklar ?? {}).filter(([a]) => !korunan.has(a.toLowerCase())));
  const basliklar = { ...ek, ...soapBasliklari };
  return httpIstegi({ adres: istek.adres, yontem: 'POST', basliklar, govde: istek.govde, zamanAsimiMs: istek.zamanAsimiMs, tlsDogrulama: istek.tlsDogrulama,
    sinyal: istek.sinyal, gonderildi: istek.gonderildi });
}

// ---------------------------------------------------------------------------------------
// WSDL (erişim kontrolü)
// ---------------------------------------------------------------------------------------

/**
 * WSDL metninden SOAP operasyonları (binding içindeki soapAction'larıyla). Aynı ad birden çok binding'de varsa ilk eylem alınır.
 * @param {string} wsdl @returns {{ ad: string; eylem?: string }[]}
 */
export function wsdlOperasyonlari(wsdl) {
  /** @type {Map<string, string | undefined>} */
  const ops = new Map();
  for (const b of wsdl.matchAll(/<(?:\w+:)?binding\b[\s\S]*?<\/(?:\w+:)?binding>/g)) {
    for (const o of b[0].matchAll(/<(?:\w+:)?operation\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?operation>/g)) {
      const eylem = (o[2].match(/soapAction="([^"]*)"/) ?? [])[1];
      if (!ops.has(o[1]) || (!ops.get(o[1]) && eylem)) ops.set(o[1], eylem || undefined);
    }
  }
  return [...ops].map(([ad, eylem]) => (eylem ? { ad, eylem } : { ad }));
}

/** İçe aktarmalar en çok bu derinliğe ve bu sayıda belgeye kadar izlenir. */
const ICE_AKTARMA_DERINLIGI = 3;
const ICE_AKTARMA_SINIRI = 15;

/**
 * Belgedeki içe aktarma adresleri (wsdl:import location, xsd:import / xsd:include schemaLocation), temel adrese göre çözülmüş.
 * @param {string} metin @param {string} taban
 */
export function iceAktarmaAdresleri(metin, taban) {
  /** @type {string[]} */
  const adresler = [];
  for (const m of metin.matchAll(/<(?:[\w.-]+:)?(?:import|include)\b[^>]*?\b(?:schemaLocation|location)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const yer = (m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim();
    if (!yer) continue;
    try { adresler.push(new URL(yer, taban).toString()); } catch { /* geçersiz adres atlanır */ }
  }
  return [...new Set(adresler)];
}

/**
 * Servise erişimi denetler: WSDL'i (GET <adres>?wsdl) ister, operasyonları ve alan şemalarını çıkarır. WSDL ayrı şema ya da WSDL
 * dosyalarını içe aktarıyorsa (ör. Java JAX-WS: "?xsd=1", "?wsdl=1") bunlar da — yalnız AYNI sunucudan, en çok 3 kat derinlik ve
 * 15 belge — alınıp ana belgeye eklenir. Başarısızsa açık mesajlı ServisHatasi.
 * @param {{ adres: string; zamanAsimiMs?: number; tlsDogrulama?: boolean }} girdi
 */
export async function erisimiDenetle(girdi) {
  const wsdlAdresi = /\?wsdl$/i.test(girdi.adres) ? girdi.adres : `${girdi.adres}?wsdl`;
  const y = await httpIstegi({ adres: wsdlAdresi, yontem: 'GET', zamanAsimiMs: girdi.zamanAsimiMs ?? 20_000, tlsDogrulama: girdi.tlsDogrulama });
  if (y.durumKodu < 200 || y.durumKodu >= 300) throw new ServisHatasi(`Servis ${y.durumKodu} döndü (${wsdlAdresi}).`);
  if (!/<(?:\w+:)?definitions\b/.test(y.govde)) throw new ServisHatasi('Yanıt bir WSDL değil (adres ya da yol yanlış olabilir).');
  const koken = new URL(wsdlAdresi).origin;
  const alinan = new Set([wsdlAdresi]);
  /** @type {string[]} */
  const ekler = [];
  /** @type {string[]} */
  const alinamayan = [];
  let kuyruk = iceAktarmaAdresleri(y.govde, wsdlAdresi).map((a) => ({ adres: a, derinlik: 1 }));
  while (kuyruk.length && alinan.size <= ICE_AKTARMA_SINIRI) {
    const { adres, derinlik } = /** @type {{ adres: string; derinlik: number }} */ (kuyruk.shift());
    if (alinan.has(adres) || new URL(adres).origin !== koken) continue;
    alinan.add(adres);
    try {
      const e = await httpIstegi({ adres, yontem: 'GET', zamanAsimiMs: girdi.zamanAsimiMs ?? 20_000, tlsDogrulama: girdi.tlsDogrulama });
      if (e.durumKodu < 200 || e.durumKodu >= 300) { alinamayan.push(`${adres} (${e.durumKodu})`); continue; }
      ekler.push(e.govde.replace(/^\s*<\?xml[^>]*\?>/, ''));
      if (derinlik < ICE_AKTARMA_DERINLIGI) kuyruk = [...kuyruk, ...iceAktarmaAdresleri(e.govde, adres).map((a) => ({ adres: a, derinlik: derinlik + 1 }))];
    } catch (h) { alinamayan.push(`${adres} (${h instanceof Error ? h.message : String(h)})`); }
  }
  // İçe aktarılanlar ana belgenin kök öğesinin içine eklenir (tek XML; okuyucu tüm definitions / schema bölümlerini okur).
  const birlesik = ekler.length ? y.govde.replace(/<\/((?:[\w.-]+:)?definitions)>\s*$/, `${ekler.join('\n')}</$1>`) : y.govde;
  return {
    durumKodu: y.durumKodu, sureMs: y.sureMs, operasyonlar: wsdlOperasyonlari(birlesik), semalar: wsdlSemalari(birlesik),
    ...(ekler.length ? { iceAktarilan: ekler.length } : {}), ...(alinamayan.length ? { alinamayan } : {})
  };
}

// ---------------------------------------------------------------------------------------
// Yanıt değerlendirme
// ---------------------------------------------------------------------------------------

/** Basit XML ağacı (ad = yerel ad, önek atılır). @typedef {{ ad: string; cocuklar: XmlDugumu[]; metin: string }} XmlDugumu */

/** @param {string} xml @returns {XmlDugumu | null} */
export function xmlAgaci(xml) {
  /** @type {XmlDugumu} */
  const kok = { ad: '#kok', cocuklar: [], metin: '' };
  /** @type {XmlDugumu[]} */
  const yigin = [kok];
  const temiz = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const belirtec = /<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of temiz.matchAll(belirtec)) {
    const ust = yigin[yigin.length - 1];
    if (m[1] !== undefined) ust.metin += m[1];
    else if (m[2] !== undefined) {
      if (yigin.length <= 1 || yigin[yigin.length - 1].ad !== yerelAd(m[2])) return null;
      yigin.pop();
    } else if (m[3] !== undefined) {
      /** @type {XmlDugumu} */
      const d = { ad: yerelAd(m[3]), cocuklar: [], metin: '' };
      ust.cocuklar.push(d);
      if (!m[5]) yigin.push(d);
    } else if (m[6] !== undefined) ust.metin += xmlKacisCoz(m[6]);
  }
  return yigin.length === 1 && kok.cocuklar.length === 1 ? kok.cocuklar[0] : null;
}

/** @param {string} ad */
const yerelAd = (ad) => ad.slice(ad.indexOf(':') + 1);

/** @param {XmlDugumu} d @returns {string} */
const tumMetin = (d) => d.metin + d.cocuklar.map(tumMetin).join('');

/**
 * Basit XPath: "/Envelope/Body/X/Y" (önekler yok sayılır; "//Y" her derinlikte arar; "//X/Y" her derinlikteki X'in altındaki Y).
 * İlk eşleşen düğümün metni.
 * @param {XmlDugumu} kok @param {string} yol @returns {string | undefined}
 */
export function xpathMetni(kok, yol) {
  if (yol.startsWith('//')) {
    const [ilk, ...alt] = yol.slice(2).split('/').filter(Boolean).map(yerelAd);
    /** @param {XmlDugumu} d @returns {XmlDugumu | undefined} */
    const altina = (d) => alt.reduce((/** @type {XmlDugumu | undefined} */ x, p) => x?.cocuklar.find((c) => c.ad === p), d);
    /** @param {XmlDugumu} d @returns {XmlDugumu | undefined} */
    const ara = (d) => (d.ad === ilk && altina(d) ? altina(d) : d.cocuklar.map(ara).find(Boolean));
    const b = ara(kok);
    return b ? tumMetin(b).trim() : undefined;
  }
  const parcalar = yol.split('/').filter(Boolean).map(yerelAd);
  if (!parcalar.length || parcalar[0] !== kok.ad) return undefined;
  /** @type {XmlDugumu | undefined} */
  let d = kok;
  for (const p of parcalar.slice(1)) {
    d = d?.cocuklar.find((c) => c.ad === p);
    if (!d) return undefined;
  }
  return tumMetin(d).trim();
}

/**
 * @typedef {import('./servis-deposu.mjs').ServisKontrolu} ServisKontrolu
 * @typedef {{ tur: string; ad: string; gecti: boolean; aciklama: string; alt?: KontrolSonucu[] }} KontrolSonucu
 */

/** @param {ServisKontrolu} k */
export function kontrolAdi(k) {
  if (k.ad) return k.ad;
  switch (k.tur) {
    case 'durumKodu': return `HTTP durum kodu ${k.deger}`;
    case 'soapYaniti': return 'Yanıt geçerli bir SOAP zarfı';
    case 'soapHatasiYok': return 'SOAP hatası (Fault) yok';
    case 'soapHatasi': return 'SOAP hatası (Fault) döner';
    case 'icerir': return `Yanıtta geçer: "${k.deger}"`;
    case 'icermez': return `Yanıtta geçmez: "${k.deger}"`;
    case 'xpathEsit': return `${k.xpath} = "${k.deger}"`;
    case 'jsonEsit': return `JSON ${k.yol} = "${k.deger}"`;
    case 'veya': return `Şunlardan biri: ${(k.alt ?? []).map(kontrolAdi).join(' | ')}`;
    default: return String(k.tur);
  }
}

/** @param {string} govde @param {ServisKontrolu} k */
function metinEslesir(govde, k) {
  const deger = String(k.deger ?? '');
  if (k.duzenliIfade) return new RegExp(deger, k.buyukKucukDuyarsiz ? 'i' : '').test(govde);
  return k.buyukKucukDuyarsiz ? govde.toLocaleLowerCase('tr').includes(deger.toLocaleLowerCase('tr')) : govde.includes(deger);
}

/** @param {number} kod @param {string} ifade */
function durumKoduUyar(kod, ifade) {
  return ifade.split(',').map((p) => p.trim()).filter(Boolean).some((p) => {
    const a = /^(\d{3})\s*-\s*(\d{3})$/.exec(p);
    return a ? kod >= Number(a[1]) && kod <= Number(a[2]) : kod === Number(p);
  });
}

/**
 * @param {{ durumKodu: number; govde: string }} yanit @param {ServisKontrolu[]} kontroller @returns {KontrolSonucu[]}
 */
export function kontrolleriDegerlendir(yanit, kontroller) {
  const agac = xmlAgaci(yanit.govde);
  const zarf = agac && agac.ad === 'Envelope' ? agac : null;
  const govdeDugumu = zarf?.cocuklar.find((c) => c.ad === 'Body');
  const hata = govdeDugumu?.cocuklar.find((c) => c.ad === 'Fault');
  const hataMetni = hata ? (xpathMetni(hata, '//faultstring') ?? xpathMetni(hata, '//Text') ?? tumMetin(hata).trim()) : '';
  /** @param {ServisKontrolu} k @returns {KontrolSonucu} */
  const degerlendir = (k) => {
    const ad = kontrolAdi(k);
    const s = (/** @type {boolean} */ gecti, /** @type {string} */ aciklama) => ({ tur: k.tur, ad, gecti, aciklama });
    switch (k.tur) {
      case 'durumKodu': return durumKoduUyar(yanit.durumKodu, String(k.deger)) ? s(true, `Durum kodu ${yanit.durumKodu}`) : s(false, `Durum kodu ${yanit.durumKodu}`);
      case 'soapYaniti': return zarf && govdeDugumu ? s(true, 'SOAP zarfı') : s(false, 'Yanıt bir SOAP zarfı değil');
      case 'soapHatasiYok': return hata ? s(false, `SOAP hatası: ${hataMetni.slice(0, 300)}`) : s(true, 'Hata yok');
      case 'soapHatasi': return hata ? s(true, `SOAP hatası: ${hataMetni.slice(0, 300)}`) : s(false, 'SOAP hatası dönmedi');
      case 'icerir': return metinEslesir(yanit.govde, k) ? s(true, 'Bulundu') : s(false, 'Yanıtta bulunamadı');
      case 'icermez': return metinEslesir(yanit.govde, k) ? s(false, 'Yanıtta bulundu') : s(true, 'Geçmiyor');
      case 'xpathEsit': {
        const m = agac ? xpathMetni(agac, String(k.xpath)) : undefined;
        if (m === undefined) return s(false, agac ? 'Düğüm bulunamadı' : 'Yanıt XML değil');
        return m === k.deger ? s(true, `"${m}"`) : s(false, `Görülen: "${m.slice(0, 300)}"`);
      }
      case 'jsonEsit': {
        const m = degerOku(yanit, { kaynak: 'json', yol: String(k.yol ?? '') });
        if (m === undefined) return s(false, 'Değer bulunamadı (yanıt JSON değil ya da yol yok)');
        return m === k.deger ? s(true, `"${m}"`) : s(false, `Görülen: "${m.slice(0, 300)}"`);
      }
      case 'veya': {
        const altlar = (k.alt ?? []).map(degerlendir);
        const gecen = altlar.filter((a) => a.gecti);
        return { ...s(gecen.length > 0, gecen.length ? `Geçen: ${gecen.map((a) => a.ad).join(' | ')}` : 'Hiçbiri geçmedi'), alt: altlar };
      }
      default: return s(false, 'Bilinmeyen kontrol türü');
    }
  };
  return kontroller.map(degerlendir);
}

/**
 * Yanıttan kısa bir özet: SOAP Fault metni ya da bilinen durum açıklaması düğümlerinden ilki (rapor listesinde gösterilir).
 * @param {string} govde
 */
export function yanitOzeti(govde) {
  const agac = xmlAgaci(govde);
  if (!agac) return govde.replace(/\s+/g, ' ').trim().slice(0, 200);
  for (const ad of ['faultstring', 'StatusDescription', 'Message', 'Description', 'ErrorMessage']) {
    const m = xpathMetni(agac, `//${ad}`);
    if (m) return m.slice(0, 300);
  }
  return '';
}
