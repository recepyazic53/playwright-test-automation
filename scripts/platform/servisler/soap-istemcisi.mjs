// SERVİS TESTLERİ — SOAP istemcisi: yer tutucuları doldurur, isteği gönderir, yanıtı kontrollerle değerlendirir.
// Genel motordur: proje/ürün adı içermez. Ağ isteği YALNIZCA çağıran (sunucu uç noktası) istediğinde yapılır.
import http from 'node:http';
import https from 'node:https';
import { wsdlSemalari } from './wsdl-semasi.mjs';
import { AD_KALIBI, ETIKET_KALIBI } from '../tablolar/tablo-secimi.mjs';

export const VARSAYILAN_ZAMAN_ASIMI_MS = 60_000;
/** Saklanan yanıt en çok bu kadar karakter tutulur (rapor boyutu). */
export const YANIT_SAKLAMA_SINIRI = 200_000;
const MASKE = '***';

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
 * Tarih biçimi: yyyy, MM, dd, HH, mm, ss; tek tırnak içi olduğu gibi yazılır ("yyyy-MM-dd'T'HH:mm:ss").
 * @param {Date} t @param {string} bicim
 */
export function tarihBicimle(t, bicim) {
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const parcalar = { yyyy: String(t.getFullYear()), MM: iki(t.getMonth() + 1), dd: iki(t.getDate()), HH: iki(t.getHours()), mm: iki(t.getMinutes()), ss: iki(t.getSeconds()) };
  return bicim.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, sabit) => (sabit !== undefined ? sabit : parcalar[/** @type {keyof typeof parcalar} */ (m)]));
}

/**
 * "bugun", "bugun+1y", "bugun-30g", "bugun+2a" (y: yıl, a: ay, g: gün) → tarih.
 * @param {string} ifade @param {Date} simdi
 */
export function goreliTarih(ifade, simdi) {
  const e = /^bugun(?:([+-])(\d{1,4})([yag]))?$/.exec(ifade.trim());
  if (!e) throw new ServisHatasi(`Tarih ifadesi anlaşılmadı: "${ifade}" (ör. bugun, bugun+1y, bugun-30g, bugun+2a).`);
  const t = new Date(simdi.getTime());
  if (e[1]) {
    const n = Number(e[2]) * (e[1] === '-' ? -1 : 1);
    if (e[3] === 'y') t.setFullYear(t.getFullYear() + n);
    else if (e[3] === 'a') t.setMonth(t.getMonth() + n);
    else t.setDate(t.getDate() + n);
  }
  return t;
}

/** Parametre başvurusu: ${AD} ya da doğrudan tarih ${tarih:bugun+1y|yyyy-MM-dd}. */
// ${tarih:ifade|biçim} · ${AD} (eski parametre) · ${Tablo.Sütun} / ${Tablo[etiket].Sütun} (test verisi tablosu).
const PARAMETRE = new RegExp(`\\$\\{\\s*(?:tarih:([^|}]+)(?:\\|([^}]+))?|([A-Za-z_][A-Za-z0-9_.-]{0,79}|${AD_KALIBI}(?:\\[${ETIKET_KALIBI}\\])?\\.${AD_KALIBI}))\\s*\\}`, 'gu');

/** "bugun+1y|yyyy-MM-dd" → tarih metni. @param {string} kural @param {Date} simdi */
export function tarihKuraliUygula(kural, simdi) {
  const [ifade, bicim] = kural.split('|');
  return tarihBicimle(goreliTarih(ifade, simdi), (bicim ?? "yyyy-MM-dd'T'HH:mm:ss").trim());
}

/**
 * Gövdedeki ${AD} başvurularını doldurur: önce tarih kuralı (tarihKurallari[AD]), sonra değer (degerler[AD]; XML için
 * kaçışlanır). Değeri bulunamayan parametreler tek hatada listelenir (nereden dolacağı "eksikAciklamasi" ile söylenir).
 * @param {string} govde
 * @param {{ degerler: Record<string, string>; tarihKurallari?: Record<string, string>; simdi?: Date; eksikAciklamasi?: (ad: string) => string }} baglam
 */
export function yerTutuculariDoldur(govde, baglam) {
  const simdi = baglam.simdi ?? new Date();
  /** @type {Set<string>} */
  const eksik = new Set();
  const sonuc = govde.replace(PARAMETRE, (_m, tarihIfadesi, bicim, hamAd) => {
    const ad = typeof hamAd === 'string' ? hamAd.trim() : hamAd;
    if (tarihIfadesi) return tarihKuraliUygula(`${tarihIfadesi}|${bicim ?? "yyyy-MM-dd'T'HH:mm:ss"}`, simdi);
    const kural = baglam.tarihKurallari?.[ad];
    if (kural) return tarihKuraliUygula(kural, simdi);
    const d = baglam.degerler[ad];
    if (d === undefined) { eksik.add(ad); return ''; }
    return xmlKacis(d);
  });
  if (eksik.size) {
    throw new ServisHatasi(`Değeri bulunamayan parametre: ${[...eksik].map((a) => (baglam.eksikAciklamasi ? `${a} (${baglam.eksikAciklamasi(a)})` : a)).join(', ')}.`);
  }
  return sonuc;
}

/** Gövdede geçen parametre adları (doğrudan tarih ifadeleri hariç). @param {string} govde */
export function kullanilanParametreler(govde) {
  return [...new Set([...govde.matchAll(PARAMETRE)].map((m) => m[3]?.trim()).filter(Boolean))];
}

/** @param {string} s */
export const xmlKacis = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** @param {string} s */
export const xmlKacisCoz = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Saklanacak metinde gizli değerleri (parola vb.) maskeler (kaçışlı ve düz hâlleri).
 * @param {string} metin @param {string[]} gizliler
 */
export function gizlileriMaskele(metin, gizliler) {
  let m = metin;
  for (const d of gizliler.filter((x) => x && x.length >= 2).sort((a, b) => b.length - a.length)) {
    m = m.split(xmlKacis(d)).join(MASKE).split(d).join(MASKE);
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
 * @param {{ adres: string; yontem?: 'GET' | 'POST'; basliklar?: Record<string, string>; govde?: string; zamanAsimiMs?: number; tlsDogrulama?: boolean;
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
 * SOAP isteği. 1.1: text/xml + SOAPAction; 1.2: application/soap+xml; action=...
 * @param {{ adres: string; eylem?: string; soapSurumu?: '1.1' | '1.2'; govde: string; zamanAsimiMs?: number; tlsDogrulama?: boolean;
 *   sinyal?: AbortSignal; gonderildi?: () => void }} istek
 */
export function soapIstegi(istek) {
  const basliklar = istek.soapSurumu === '1.2'
    ? { 'Content-Type': `application/soap+xml; charset=utf-8${istek.eylem ? `; action="${istek.eylem}"` : ''}` }
    : { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${istek.eylem ?? ''}"` };
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
 * Basit XPath: "/Envelope/Body/X/Y" (önekler yok sayılır; "//Y" her derinlikte arar). İlk eşleşen düğümün metni.
 * @param {XmlDugumu} kok @param {string} yol @returns {string | undefined}
 */
export function xpathMetni(kok, yol) {
  if (yol.startsWith('//')) {
    const ad = yerelAd(yol.slice(2));
    /** @param {XmlDugumu} d @returns {XmlDugumu | undefined} */
    const ara = (d) => (d.ad === ad ? d : d.cocuklar.map(ara).find(Boolean));
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
