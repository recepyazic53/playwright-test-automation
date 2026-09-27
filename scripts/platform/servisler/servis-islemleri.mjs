// SERVİS TESTLERİ — iş kuralları: erişim kontrolü, servis ekleme, SoapUI aktarımı, parametre çözümü, deneme ve koşu.
// Kurallar:
// - Erişim kontrolü ve "Dene" YALNIZCA test ortamında (ortam ayarında "canli" işaretli olmayan) yapılır.
// - Yeni servis (ya da adresi değişen servis) ancak başarılı bir erişim kontrolünden sonra kaydedilir.
// - Senaryo kapsamı ('test' | 'canli' | 'ikisi') ortam türüyle uyuşmuyorsa koşulmaz; canlı ortamda "yalnız test"
//   işaretli operasyonlar (ör. kayıt oluşturanlar) hiç koşulmaz.
// - Gövdede yalnız parametre adı durur (${AD}). Değer sırası: 1) servisin tarih kuralı, 2) giriş bilgisi profili
//   (kasada; ör. USERNAME / PASSWORD / CHANNEL), 3) test verisi: parametre adı test verisi türünün bir alanına eşlidir
//   (tür detayında "servis parametreleri"), değer servisin (senaryo ezebilir) o tür + rol için seçtiği profilden gelir.
// - Saklanan istek / yanıtta parola ve hassas test verisi değerleri maskelenir.
import { randomUUID } from 'node:crypto';
import {
  DepoHatasi, ortamGetir, ortamKaydet, ortamlariListele, testVerisiProfiliGetir, testVerisiProfiliKaydet, testVerisiTuruKaydet, testVerisiTurleriniListele
} from '../veritabani/depo.mjs';
import {
  degerOku, erisimiDenetle, gizlileriMaskele, MASKE, goreliTarih, kontrolleriDegerlendir, kullanilanAkisDegerleri, kullanilanParametreler, ServisHatasi, soapIstegi,
  yanitOzeti, YANIT_SAKLAMA_SINIRI, yerTutuculariDoldur
} from './soap-istemcisi.mjs';
import {
  senaryoIceriginiDogrula, servisAkisiGetir, servisGetir, servisKaydet, servisKimliginiCoz, servisKosusuKaydet,
  servisKimlikOzeti, servisleriListele, servisSenaryolariniListele, servisSenaryosuGetir, servisSenaryosuKaydet
} from './servis-deposu.mjs';
import { servisTaslaklari, soapuiCozumle, soapuiOzeti } from './soapui-ice-aktarma.mjs';
import { KAYNAKLAR, alanSatirlari, govdeCoz, semaBirlestir } from './servis-govdesi.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { BICIM_KALIBI, basvuru, basvuruCoz, grupAnahtari, secilenSatir, servisDegeri, sutunBul, tabloBul } from '../tablolar/tablo-secimi.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').Servis} Servis */
/** @typedef {import('./servis-deposu.mjs').ServisAyarlari} ServisAyarlari */
/** @typedef {import('./servis-deposu.mjs').ServisSenaryoIcerigi} ServisSenaryoIcerigi */

/** Alan yolu (grup/alan): WSDL öğe adları Türkçe harf de içerebilir (ör. "müşteri-detayları"). */
const ALAN_YOLU = /^[\p{L}_][\p{L}\p{N}_.-]*(\/[\p{L}_][\p{L}\p{N}_.-]*)*$/u;

/** Başarılı erişim kontrolünün geçerlilik süresi (bu sürede "Kaydet" yapılmalı). */
export const ERISIM_GECERLILIK_MS = 30 * 60_000;
/** Giriş bilgisi profilinde gizli sayılan (raporda maskelenen) parametre adları. */

/** @typedef {{ adres: string; ortamId: string; projeId: string; zaman: number; durumKodu: number; operasyonlar: { ad: string; eylem?: string }[];
 *   semalar: Record<string, import('./servis-govdesi.mjs').OperasyonSemasi> }} ErisimKaydi */
/** @type {Map<string, ErisimKaydi>} */
const erisimler = new Map();

/** @param {{ ayarlar: Record<string, unknown> }} ortam */
export const ortamTuru = (ortam) => (ortam.ayarlar.canli === true ? 'canli' : 'test');

/** @param {Veritabani} vt @param {string} projeId @param {string} ortamId */
function ortamiAl(vt, projeId, ortamId) {
  const o = ortamGetir(vt, ortamId);
  if (!o || o.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  return o;
}

/** Taban adres + yol (metin olarak: tabanın kendi yolu korunur — "https://x.com/api/" + "/a.asmx" → ".../api/a.asmx"). @param {string} taban @param {string} yol */
export const adresBirlestir = (taban, yol) => `${taban.replace(/\/+$/, '')}/${yol.replace(/^\/+/, '')}`;

/**
 * Servisin bir ortamdaki tam adresi:
 * - ayarlar.adresler[ortamId] (eski: servise özel TAM adres) varsa o;
 * - ayarlar.tabanlar[ortamId] tanımlıysa taban + yol; boş metinse servis bu ortamda TANIMLI DEĞİL (hata);
 * - yoksa ortamın taban adresi + yol.
 * @param {{ yol?: string; adresler?: Record<string, string>; tabanlar?: Record<string, string> }} ayarlar @param {{ id: string; ad?: string; tabanUrl: string }} ortam
 */
export function servisAdresi(ayarlar, ortam) {
  const ozel = ayarlar.adresler?.[ortam.id];
  if (ozel) return ozel;
  if (!ayarlar.yol) throw new DepoHatasi('Servisin yolu tanımlı değil (ör. /AppService/servis.asmx).');
  const taban = ayarlar.tabanlar?.[ortam.id];
  if (taban === '') throw new DepoHatasi(`Servis ${ortam.ad ? `"${ortam.ad}"` : 'bu'} ortamında tanımlı değil (taban adres boş).`);
  return adresBirlestir(taban || ortam.tabanUrl, ayarlar.yol);
}

/** Servis bu ortamda tanımlı mı (taban adresi bilerek boş bırakılmadıysa). @param {{ tabanlar?: Record<string, string> }} ayarlar @param {string} ortamId */
export const ortamdaTanimli = (ayarlar, ortamId) => ayarlar.tabanlar?.[ortamId] !== '';

/**
 * Ortam taban adresleri: { <ortamId>: adres | '' }. '' = servis o ortamda yok. Adres http(s) olmalı.
 * @param {unknown} tabanlar @returns {Record<string, string>}
 */
function tabanlariDogrula(tabanlar) {
  if (tabanlar === undefined || tabanlar === null) return {};
  if (typeof tabanlar !== 'object' || Array.isArray(tabanlar)) throw new DepoHatasi('"tabanlar" bir nesne olmalıdır.');
  /** @type {Record<string, string>} */
  const s = {};
  for (const [ortamId, adres] of Object.entries(tabanlar)) {
    if (typeof adres !== 'string') continue;
    const a = adres.trim();
    if (a) {
      try {
        const u = new URL(a);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protokol');
      } catch {
        throw new DepoHatasi(`Taban adres geçersiz: ${a} (http:// ya da https:// ile başlamalı)`);
      }
    }
    s[ortamId] = a;
  }
  return s;
}

/**
 * Yeni kullanılan taban adresleri ortamın listesine eklenir (sonraki servislerde seçilebilsin). Ortamın asıl adresi zaten listede.
 * @param {Veritabani} vt @param {string} projeId @param {Record<string, string>} tabanlar
 */
function tabanlariOrtamlaraKaydet(vt, projeId, tabanlar) {
  for (const [ortamId, adres] of Object.entries(tabanlar)) {
    if (!adres) continue;
    const o = ortamGetir(vt, ortamId);
    if (!o || o.projeId !== projeId) throw new DepoHatasi('Taban adresi verilen ortam bulunamadı.');
    const mevcut = Array.isArray(o.ayarlar.tabanAdresleri) ? /** @type {string[]} */ (o.ayarlar.tabanAdresleri) : [];
    const ayni = (/** @type {string} */ x) => x.replace(/\/+$/, '') === adres.replace(/\/+$/, '');
    if (ayni(o.tabanUrl) || mevcut.some(ayni)) continue;
    ortamKaydet(vt, { id: o.id, projeId, ad: o.ad, tabanUrl: o.tabanUrl, varsayilan: o.varsayilan, ayarlar: { ...o.ayarlar, tabanAdresleri: [...mevcut, adres] } });
  }
}

/** @param {unknown} yol */
function yolDogrula(yol) {
  if (typeof yol !== 'string' || !/^\/[^\s?#]*$/.test(yol.trim())) throw new DepoHatasi('"yol" "/" ile başlamalı, boşluk ve "?" içermemelidir (ör. /AppService/servis.asmx).');
  return yol.trim();
}

/** @param {unknown} adresler @returns {Record<string, string>} */
function adresleriDogrula(adresler) {
  if (adresler === undefined || adresler === null) return {};
  if (typeof adresler !== 'object' || Array.isArray(adresler)) throw new DepoHatasi('"adresler" bir nesne olmalıdır.');
  /** @type {Record<string, string>} */
  const s = {};
  for (const [ortamId, adres] of Object.entries(adresler)) {
    if (typeof adres !== 'string' || !adres.trim()) continue;
    try {
      const u = new URL(adres.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protokol');
    } catch {
      throw new DepoHatasi(`Ortama özel adres geçersiz: ${adres}`);
    }
    s[ortamId] = adres.trim();
  }
  return s;
}

/** Tarih kuralları: { AD: "bugun+1y|yyyy-MM-dd" }. @param {unknown} kurallar @returns {Record<string, string>} */
export function tarihKurallariniDogrula(kurallar) {
  if (kurallar === undefined || kurallar === null) return {};
  if (typeof kurallar !== 'object' || Array.isArray(kurallar)) throw new DepoHatasi('"tarihKurallari" bir nesne olmalıdır.');
  /** @type {Record<string, string>} */
  const s = {};
  for (const [ad, kural] of Object.entries(kurallar)) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(ad)) throw new DepoHatasi(`Geçersiz parametre adı: "${ad}".`);
    if (typeof kural !== 'string' || !kural.trim()) continue;
    try { goreliTarih(kural.split('|')[0], new Date()); } catch (e) { throw new DepoHatasi(`${ad}: ${/** @type {Error} */ (e).message}`); }
    s[ad] = kural.trim();
  }
  return s;
}

/**
 * Elle eklenen alanlar: { <operasyon>: [{ yol, tip }] } — WSDL'de olmayan alanlar; alan formunda şemaya katılır (semaBirlestir).
 * @param {unknown} v @returns {Record<string, Array<{ yol: string; tip: string }>>}
 */
function ekAlanlariDogrula(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"ekAlanlar" bir nesne olmalıdır.');
  /** @type {Record<string, Array<{ yol: string; tip: string }>>} */
  const s = {};
  const tipler = ['metin', 'tamsayi', 'ondalik', 'mantiksal', 'tarih', 'tarihSaat'];
  for (const [op, liste] of Object.entries(v)) {
    if (!Array.isArray(liste)) throw new DepoHatasi(`"${op}" elle eklenen alanları bir dizi olmalıdır.`);
    s[op] = liste.map((/** @type {any} */ e) => {
      if (!e || typeof e.yol !== 'string' || !ALAN_YOLU.test(e.yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${e?.yol}".`);
      return { yol: e.yol, tip: tipler.includes(e.tip) ? e.tip : 'metin' };
    });
    if (new Set(s[op].map((e) => e.yol)).size !== s[op].length) throw new DepoHatasi(`"${op}" elle eklenen alanlarda aynı yol iki kez var.`);
  }
  return s;
}

/**
 * Alan zorunlulukları: { <operasyon>: [<yol>, …] } — iş kuralına göre zorunlu alanlar (kullanıcı belirler; WSDL'deki minOccurs
 * iş kuralını yansıtmayabilir: .asmx'te sayı / evet-hayır alanları hep "zorunlu", metinler hep "isteğe bağlı" görünür).
 * Senaryo düzenleyicide vurgulanır ve süzülür; koşuyu ENGELLEMEZ (olumsuz senaryolar bilerek göndermeyebilir).
 * @param {unknown} v @returns {Record<string, string[]>}
 */
function alanZorunluluklariniDogrula(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"alanZorunluluklari" bir nesne olmalıdır.');
  /** @type {Record<string, string[]>} */
  const s = {};
  for (const [op, yollar] of Object.entries(v)) {
    if (!Array.isArray(yollar)) throw new DepoHatasi(`"${op}" zorunlu alanları bir dizi olmalıdır.`);
    for (const yol of yollar) if (typeof yol !== 'string' || !ALAN_YOLU.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
    s[op] = [...new Set(/** @type {string[]} */ (yollar))];
  }
  return s;
}

/**
 * Alan varsayılanları: { <operasyon>: { <yol>: { kaynak, deger? } } } — yeni senaryo açılınca alanlar bunlarla dolar.
 * @param {unknown} v @returns {Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>}
 */
function alanVarsayilanlariniDogrula(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"alanVarsayilanlari" bir nesne olmalıdır.');
  /** @type {Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>} */
  const s = {};
  for (const [op, alanlar] of Object.entries(v)) {
    if (!alanlar || typeof alanlar !== 'object' || Array.isArray(alanlar)) throw new DepoHatasi(`"${op}" varsayılanları bir nesne olmalıdır.`);
    for (const [yol, d] of Object.entries(alanlar)) {
      if (!ALAN_YOLU.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
      if (!d || typeof d !== 'object' || !KAYNAKLAR.includes(d.kaynak)) throw new DepoHatasi(`"${yol}" için geçersiz kaynak.`);
      const degerli = d.kaynak === 'sabit' || d.kaynak === 'parametre' || d.kaynak === 'tablo';
      if (degerli && typeof d.deger !== 'string') throw new DepoHatasi(`"${yol}" için değer gerekli.`);
      (s[op] ??= {})[yol] = degerli ? { kaynak: d.kaynak, deger: d.deger } : { kaynak: d.kaynak };
    }
  }
  return s;
}

/**
 * Alan → değer listesi bağlantıları: { <operasyon>: { <yol>: tanımId | '' } } ('' = bilerek liste yok).
 * @param {unknown} v @returns {Record<string, Record<string, string>>}
 */
function alanListeleriniDogrula(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"alanListeleri" bir nesne olmalıdır.');
  /** @type {Record<string, Record<string, string>>} */
  const s = {};
  for (const [op, alanlar] of Object.entries(v)) {
    if (!alanlar || typeof alanlar !== 'object' || Array.isArray(alanlar)) throw new DepoHatasi(`"${op}" liste bağlantıları bir nesne olmalıdır.`);
    for (const [yol, id] of Object.entries(alanlar)) {
      if (!ALAN_YOLU.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
      if (typeof id !== 'string' || (id && !/^[A-Za-z0-9_-]{1,100}$/.test(id))) throw new DepoHatasi(`"${yol}" için geçersiz liste.`);
      (s[op] ??= {})[yol] = id;
    }
  }
  return s;
}

/**
 * Alan → tablo sütunu bağlantıları: { <operasyon>: { <yol>: { tablo: tabloId, sutun, etiket?, bicim? } } }. Aynı tablo bir istekte
 * iki kez gerekiyorsa etiket (başvuran / kefil) iki ayrı satır seçimi demektir. bicim: değer tarih olarak okunup bu biçimde
 * gönderilir (ör. yyyy-MM-dd'T'HH:mm:ss).
 * @param {unknown} v @returns {Record<string, Record<string, { tablo: string; sutun: string; etiket?: string; bicim?: string }>>}
 */
function alanBaglariniDogrula(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"alanBaglari" bir nesne olmalıdır.');
  /** @type {Record<string, Record<string, { tablo: string; sutun: string; etiket?: string; bicim?: string }>>} */
  const s = {};
  for (const [op, alanlar] of Object.entries(v)) {
    if (!alanlar || typeof alanlar !== 'object' || Array.isArray(alanlar)) throw new DepoHatasi(`"${op}" tablo bağlantıları bir nesne olmalıdır.`);
    for (const [yol, b] of Object.entries(alanlar)) {
      if (!ALAN_YOLU.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
      if (!b) continue;
      if (typeof b !== 'object' || typeof b.tablo !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(b.tablo) || typeof b.sutun !== 'string' || !b.sutun.trim() || b.sutun.length > 60) {
        throw new DepoHatasi(`"${yol}" için geçersiz tablo bağlantısı.`);
      }
      const etiket = typeof b.etiket === 'string' ? b.etiket.trim() : '';
      if (etiket && !/^[\p{L}\p{N} _-]{1,40}$/u.test(etiket)) throw new DepoHatasi(`"${yol}" etiketi geçersiz (harf, rakam, boşluk, "_", "-").`);
      const bicim = typeof b.bicim === 'string' ? b.bicim.trim() : '';
      if (bicim && (!new RegExp(`^${BICIM_KALIBI}$`, 'u').test(bicim) || !/yyyy|MM|dd|HH|mm|ss/.test(bicim))) {
        throw new DepoHatasi(`"${yol}" tarih biçimi geçersiz (ör. yyyy-MM-dd'T'HH:mm:ss; yyyy MM dd HH mm ss).`);
      }
      (s[op] ??= {})[yol] = { tablo: b.tablo, sutun: b.sutun.trim(), ...(etiket ? { etiket } : {}), ...(bicim ? { bicim } : {}) };
    }
  }
  return s;
}

/**
 * WSDL'i yeniden alıp operasyon listesini ve alan şemalarını günceller (yalnız test ortamı; adres değişmez).
 * @param {Veritabani} vt @param {string} projeId @param {{ servisId: string; ortamId: string }} girdi
 */
export async function semaYenile(vt, projeId, girdi) {
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const ortam = ortamiAl(vt, projeId, girdi.ortamId);
  if (ortamTuru(ortam) !== 'test') throw new DepoHatasi('WSDL yalnızca test ortamından alınır.');
  const adres = servisAdresi(servis.ayarlar, ortam);
  let s;
  try { s = await erisimiDenetle({ adres, tlsDogrulama: servis.ayarlar.tlsDogrulama }); } catch (e) {
    if (e instanceof ServisHatasi) throw new DepoHatasi(e.message);
    throw e;
  }
  servisKaydet(vt, { id: servis.id, projeId, anahtar: servis.anahtar, ad: servis.ad, ayarlar: {
    ...servis.ayarlar, ...(s.operasyonlar.length ? { operasyonlar: s.operasyonlar } : {}), operasyonSemalari: s.semalar,
    erisim: { ortamId: ortam.id, zaman: new Date().toISOString(), durumKodu: s.durumKodu }
  } });
  return { adres, durumKodu: s.durumKodu, operasyonSayisi: s.operasyonlar.length, alanliOperasyonlar: Object.values(s.semalar).filter((x) => x.alanlar.length).map((x) => x.ad) };
}

/** Tür + rol için seçilen profiller: { "<turId>:<rol>": profilId }. @param {unknown} secim @returns {Record<string, string>} */
function veriProfilleriniDogrula(secim) {
  if (secim === undefined || secim === null) return {};
  if (typeof secim !== 'object' || Array.isArray(secim)) throw new DepoHatasi('"veriProfilleri" bir nesne olmalıdır.');
  return Object.fromEntries(Object.entries(secim).filter(([, v]) => typeof v === 'string' && v));
}

/**
 * Erişim kontrolü (yalnız test ortamı): WSDL istenir. Başarılıysa kısa süre geçerli bir "erisimKimligi" döner; yeni servis
 * bu kimlikle kaydedilir.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ortamId: string; yol: string; adresler?: Record<string, string>; tabanlar?: Record<string, string>; tlsDogrulama?: boolean }} girdi
 */
export async function erisimKontrolu(vt, projeId, girdi) {
  const ortam = ortamiAl(vt, projeId, girdi.ortamId);
  if (ortamTuru(ortam) !== 'test') throw new DepoHatasi('Erişim kontrolü yalnızca test ortamında yapılır (seçilen ortam canlı işaretli).');
  const adres = servisAdresi({ yol: yolDogrula(girdi.yol), adresler: adresleriDogrula(girdi.adresler), tabanlar: tabanlariDogrula(girdi.tabanlar) }, ortam);
  try {
    const s = await erisimiDenetle({ adres, tlsDogrulama: girdi.tlsDogrulama });
    const erisimKimligi = randomUUID();
    for (const [k, e] of erisimler) if (Date.now() - e.zaman > ERISIM_GECERLILIK_MS) erisimler.delete(k);
    erisimler.set(erisimKimligi, { adres, ortamId: ortam.id, projeId, zaman: Date.now(), durumKodu: s.durumKodu, operasyonlar: s.operasyonlar, semalar: s.semalar });
    return { erisilebilir: true, erisimKimligi, adres, ortam: ortam.ad, durumKodu: s.durumKodu, sureMs: s.sureMs, operasyonlar: s.operasyonlar, semalar: s.semalar };
  } catch (e) {
    if (e instanceof ServisHatasi) return { erisilebilir: false, adres, ortam: ortam.ad, mesaj: e.message };
    throw e;
  }
}

/** @param {string | undefined} erisimKimligi @param {string} projeId @param {(ortam: { id: string; tabanUrl: string }) => string} adresHesapla @param {Veritabani} vt */
function erisimiDogrula(erisimKimligi, projeId, adresHesapla, vt) {
  const e = erisimKimligi ? erisimler.get(erisimKimligi) : undefined;
  if (!e || e.projeId !== projeId || Date.now() - e.zaman > ERISIM_GECERLILIK_MS) {
    throw new DepoHatasi('Önce "Erişimi kontrol et" başarılı olmalı (kontrol 30 dakika geçerlidir).');
  }
  const ortam = ortamiAl(vt, projeId, e.ortamId);
  if (adresHesapla(ortam) !== e.adres) throw new DepoHatasi('Adres, erişim kontrolünden sonra değişti; yeniden "Erişimi kontrol et".');
  return e;
}

/**
 * Servis ekler / günceller. Yeni servis ya da yolu / ortama özel adresleri değişen servis için erisimKimligi gerekir.
 * Verilmeyen ayarlar korunur.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ id?: string; anahtar: string; ad: string; yol: string; soapSurumu?: '1.1' | '1.2'; adresler?: Record<string, string>; tabanlar?: Record<string, string>;
 *   secilenOperasyonlar?: string[];
 *   kimlikProfili?: string; tarihKurallari?: Record<string, string>; veriProfilleri?: Record<string, string>;
 *   yalnizTestOperasyonlari?: string[]; tlsDogrulama?: boolean; durum?: 'etkin' | 'devre_disi'; erisimKimligi?: string; yapan?: string;
 *   alanVarsayilanlari?: unknown; alanZorunluluklari?: unknown; ekAlanlar?: unknown; alanListeleri?: unknown; alanBaglari?: unknown;
 *   oturumAkisi?: string | null }} girdi  oturumAkisi: senaryolardaki ${akis:…} değerlerini (ör. token) sağlayan oturum akışı (""/null: yok).
 */
export function servisiKaydet(vt, projeId, girdi) {
  const mevcut = girdi.id ? servisGetir(vt, girdi.id) : undefined;
  if (girdi.id && (!mevcut || mevcut.projeId !== projeId)) throw new DepoHatasi('Servis bulunamadı.');
  const yol = yolDogrula(girdi.yol);
  const adresler = girdi.adresler === undefined && mevcut ? (mevcut.ayarlar.adresler ?? {}) : adresleriDogrula(girdi.adresler);
  const tabanlar = girdi.tabanlar === undefined && mevcut ? (mevcut.ayarlar.tabanlar ?? {}) : tabanlariDogrula(girdi.tabanlar);
  const adresDegisti = !mevcut || mevcut.ayarlar.yol !== yol || JSON.stringify(mevcut.ayarlar.adresler ?? {}) !== JSON.stringify(adresler)
    || JSON.stringify(mevcut.ayarlar.tabanlar ?? {}) !== JSON.stringify(tabanlar);
  /** @type {ServisAyarlari} */
  const ayarlar = {
    ...(mevcut?.ayarlar ?? {}), yol, adresler, ...(Object.keys(tabanlar).length ? { tabanlar } : {}), soapSurumu: girdi.soapSurumu ?? mevcut?.ayarlar.soapSurumu ?? '1.1',
    ...(girdi.kimlikProfili !== undefined ? { kimlikProfili: girdi.kimlikProfili || undefined } : {}),
    ...(girdi.tarihKurallari !== undefined ? { tarihKurallari: tarihKurallariniDogrula(girdi.tarihKurallari) } : {}),
    ...(girdi.veriProfilleri !== undefined ? { veriProfilleri: veriProfilleriniDogrula(girdi.veriProfilleri) } : {}),
    ...(girdi.yalnizTestOperasyonlari !== undefined ? { yalnizTestOperasyonlari: girdi.yalnizTestOperasyonlari.filter((x) => typeof x === 'string' && x) } : {}),
    ...(girdi.tlsDogrulama !== undefined ? { tlsDogrulama: girdi.tlsDogrulama } : {}),
    ...(girdi.alanVarsayilanlari !== undefined ? { alanVarsayilanlari: alanVarsayilanlariniDogrula(girdi.alanVarsayilanlari) } : {}),
    ...(girdi.alanZorunluluklari !== undefined ? { alanZorunluluklari: alanZorunluluklariniDogrula(girdi.alanZorunluluklari) } : {}),
    ...(girdi.ekAlanlar !== undefined ? { ekAlanlar: ekAlanlariDogrula(girdi.ekAlanlar) } : {}),
    ...(girdi.alanListeleri !== undefined ? { alanListeleri: alanListeleriniDogrula(girdi.alanListeleri) } : {}),
    ...(girdi.alanBaglari !== undefined ? { alanBaglari: alanBaglariniDogrula(girdi.alanBaglari) } : {}),
    ...(girdi.oturumAkisi !== undefined ? { oturumAkisi: oturumAkisiDogrula(vt, projeId, girdi.oturumAkisi) } : {})
  };
  if (adresDegisti) {
    const e = erisimiDogrula(girdi.erisimKimligi, projeId, (o) => servisAdresi({ yol, adresler, tabanlar }, o), vt);
    ayarlar.erisim = { ortamId: e.ortamId, zaman: new Date(e.zaman).toISOString(), durumKodu: e.durumKodu };
    // Sihirbazda seçilen metotlar: yalnız onlar (ve şemaları) saklanır.
    const secilen = girdi.secilenOperasyonlar ? new Set(girdi.secilenOperasyonlar) : null;
    if (secilen && !e.operasyonlar.some((o) => secilen.has(o.ad))) throw new DepoHatasi('En az bir metot seçin.');
    const ops = secilen ? e.operasyonlar.filter((o) => secilen.has(o.ad)) : e.operasyonlar;
    if (ops.length) ayarlar.operasyonlar = ops;
    const semalar = Object.fromEntries(Object.entries(e.semalar).filter(([ad]) => !secilen || secilen.has(ad)));
    if (Object.keys(semalar).length) ayarlar.operasyonSemalari = semalar;
  }
  return vt.islem(() => {
    tabanlariOrtamlaraKaydet(vt, projeId, tabanlar);
    return servisKaydet(vt, { id: girdi.id, projeId, anahtar: girdi.anahtar, ad: girdi.ad, tur: 'soap', durum: girdi.durum, ayarlar, yapan: girdi.yapan });
  });
}

/**
 * Servise atanan oturum akışı: projenin "oturum" türündeki akışı olmalı. Boş → kaldırılır (undefined).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} v @returns {string | undefined}
 */
function oturumAkisiDogrula(vt, projeId, v) {
  if (v === null || v === '') return undefined;
  const a = typeof v === 'string' ? servisAkisiGetir(vt, v) : undefined;
  if (!a || a.projeId !== projeId) throw new DepoHatasi('Oturum akışı bulunamadı.');
  if (a.tur !== 'oturum') throw new DepoHatasi(`"${a.baslik}" bir oturum akışı değil (akış türü: oturum olmalı).`);
  return a.id;
}

// ---------------------------------------------------------------------------------------
// Parametreler
// ---------------------------------------------------------------------------------------

/**
 * Projedeki test verisi eşlemeleri: servis parametresi adı → tür / alan / rol.
 * @param {Veritabani} vt @param {string} projeId
 * @returns {Map<string, { turId: string; turAd: string; alan: string; alanEtiketi: string; rol: string; hassas: boolean }>}
 */
export function parametreEslemeleri(vt, projeId) {
  /** @type {Map<string, { turId: string; turAd: string; alan: string; alanEtiketi: string; rol: string; hassas: boolean }>} */
  const harita = new Map();
  for (const t of testVerisiTurleriniListele(vt, projeId)) {
    for (const a of t.alanlar) {
      for (const sp of a.servisParametreleri ?? []) harita.set(sp.ad, { turId: t.id, turAd: t.ad, alan: a.ad, alanEtiketi: a.etiket, rol: sp.rol, hassas: a.hassas });
    }
  }
  return harita;
}

/**
 * Servisin Parametreler görünümü: senaryo gövdelerinde geçen her parametre ve nereden dolduğu; tür + rol başına seçilen
 * profil. DEĞER DÖNMEZ.
 * @param {Veritabani} vt @param {string} projeId @param {string} servisId
 */
export function servisParametreleri(vt, projeId, servisId) {
  const servis = servisGetir(vt, servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const eslemeler = parametreEslemeleri(vt, projeId);
  const kimlikAlanlari = new Set(servis.ayarlar.kimlikProfili ? Object.keys(servisKimliginiCoz(vt, projeId, servis.ayarlar.kimlikProfili, '')) : []);
  /** @type {Map<string, number>} */
  const kullanim = new Map();
  for (const s of servisSenaryolariniListele(vt, servisId)) for (const p of kullanilanParametreler(s.icerik.govde)) if (!basvuruCoz(p)) kullanim.set(p, (kullanim.get(p) ?? 0) + 1);
  // Henüz senaryoda geçmese de servis varsayılanlarında (★) kullanılan parametreler (senaryo sayısı 0).
  for (const alanlar of Object.values(servis.ayarlar.alanVarsayilanlari ?? {})) {
    for (const v of Object.values(alanlar)) if (v.kaynak === 'parametre' && v.deger && !kullanim.has(v.deger)) kullanim.set(v.deger, 0);
  }
  const tarih = servis.ayarlar.tarihKurallari ?? {};
  const parametreler = [...kullanim].sort((a, b) => a[0].localeCompare(b[0])).map(([ad, senaryoSayisi]) => {
    const e = eslemeler.get(ad);
    const kaynak = tarih[ad] ? { tur: 'tarih', kural: tarih[ad] }
      : kimlikAlanlari.has(ad) ? { tur: 'kimlik', profil: servis.ayarlar.kimlikProfili }
        : e ? { tur: 'veri', turId: e.turId, turAd: e.turAd, alan: e.alan, alanEtiketi: e.alanEtiketi, rol: e.rol }
          : { tur: 'eslenmemis' };
    return { ad, senaryoSayisi, kaynak };
  });
  /** @type {Map<string, { turId: string; turAd: string; rol: string; profilId: string | null }>} */
  const roller = new Map();
  for (const p of parametreler) {
    if (p.kaynak.tur !== 'veri') continue;
    const k = /** @type {{ turId: string; turAd: string; rol: string }} */ (p.kaynak);
    const anahtar = `${k.turId}:${k.rol}`;
    if (!roller.has(anahtar)) roller.set(anahtar, { turId: k.turId, turAd: k.turAd, rol: k.rol, profilId: servis.ayarlar.veriProfilleri?.[anahtar] ?? null });
  }
  return { parametreler, roller: [...roller.entries()].map(([anahtar, r]) => ({ anahtar, ...r })), kimlikProfili: servis.ayarlar.kimlikProfili ?? null };
}

/**
 * Bir gövdenin parametre değerlerini çözer (yalnız sunucu içinde). Bulunamayanlar yerTutuculariDoldur'da açıklamayla listelenir.
 * @param {Veritabani} vt @param {string} projeId @param {Servis} servis @param {ServisSenaryoIcerigi} icerik @param {string} ortamId
 */
function parametreDegerleri(vt, projeId, servis, icerik, ortamId) {
  const adlar = kullanilanParametreler(icerik.govde);
  const tarih = { ...(servis.ayarlar.tarihKurallari ?? {}) };
  const kimlikProfili = icerik.kimlikProfili || servis.ayarlar.kimlikProfili;
  const kimlik = kimlikProfili ? servisKimliginiCoz(vt, projeId, kimlikProfili, ortamId) : {};
  /** @type {Record<string, string>} */
  const degerler = {};
  /** @type {string[]} */
  const gizliler = [];
  /** @type {Record<string, string>} */
  const eksikNedeni = {};
  const eslemeler = parametreEslemeleri(vt, projeId);
  const secimler = { ...(servis.ayarlar.veriProfilleri ?? {}), ...(icerik.veriProfilleri ?? {}) };
  /** @type {Map<string, Record<string, unknown>>} */
  const profiller = new Map();
  /** @type {import('../tablolar/tablo-deposu.mjs').Tablo[] | null} */
  let tablolar = null;
  /** Kullanılan tablo satırları (raporda: hangi satırla koştu). @type {Array<{ tablo: string; etiket: string; satir: Record<string, string | null> }>} */
  const kullanilanSatirlar = [];
  for (const ad of adlar) {
    if (tarih[ad]) continue;
    // ${Tablo.Sütun} / ${Tablo[etiket].Sütun}: senaryonun seçimleriyle (ve ortamla) uyan ilk satırdan.
    const b = /[.[]/.test(ad) ? basvuruCoz(ad) : null;
    if (b) {
      tablolar ??= tablolariListele(vt, projeId, { cozulsun: true });
      const t = tabloBul(tablolar, b.tablo);
      if (t) {
        const sutun = sutunBul(t, b.sutun);
        if (!sutun) { eksikNedeni[ad] = `"${t.ad}" tablosunda "${b.sutun}" sütunu yok`; continue; }
        const secim = icerik.tabloSecimleri?.[grupAnahtari(t.id, b.etiket)] ?? {};
        const r = secilenSatir(t, secim, ortamId);
        const grup = `"${t.ad}${b.etiket ? ` (${b.etiket})` : ''}"`;
        if (!r) { eksikNedeni[ad] = Object.keys(secim).length ? `${grup} tablosunda seçimlerle uyan satır yok` : `${grup} tablosunda bu ortamda satır yok`; continue; }
        const d = r.degerler[sutun.ad];
        if (d === null || d === undefined || d === '') { eksikNedeni[ad] = `${grup} tablosunun seçilen satırında "${sutun.ad}" boş`; continue; }
        // Değerin servis karşılığı tanımlıysa gövdeye o yazılır (ör. DÜNYA → WORLD).
        degerler[ad] = servisDegeri(sutun, d);
        if (sutun.gizli) gizliler.push(d);
        if (!kullanilanSatirlar.some((x) => x.tablo === t.ad && x.etiket === b.etiket)) {
          kullanilanSatirlar.push({ tablo: t.ad, etiket: b.etiket, satir: Object.fromEntries(t.sutunlar.filter((x) => !x.gizli).map((x) => [x.ad, r.degerler[x.ad]])) });
        }
        continue;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(ad)) { eksikNedeni[ad] = `"${b.tablo}" adında tablo yok`; continue; }
    }
    if (kimlik[ad] !== undefined) {
      degerler[ad] = kimlik[ad];
      if (gizliAdMi(ad, ekGizliAdlar(vt))) gizliler.push(kimlik[ad]);
      continue;
    }
    const e = eslemeler.get(ad);
    if (!e) { eksikNedeni[ad] = kimlikProfili ? `giriş profilinde yok ve test verisinde eşlenmemiş` : 'test verisinde eşlenmemiş; giriş bilgisiyse servis için giriş profili seçin'; continue; }
    const profilId = secimler[`${e.turId}:${e.rol}@${ortamId}`] || secimler[`${e.turId}:${e.rol}`];
    if (!profilId) { eksikNedeni[ad] = `"${e.turAd}" türü, "${e.rol}" rolü için profil seçilmedi`; continue; }
    if (!profiller.has(profilId)) {
      const p = testVerisiProfiliGetir(vt, profilId, { coz: true });
      if (!p || p.turId !== e.turId) { eksikNedeni[ad] = `seçilen "${e.turAd}" profili bulunamadı`; continue; }
      profiller.set(profilId, p.degerler);
    }
    const d = /** @type {Record<string, unknown>} */ (profiller.get(profilId))[e.alan];
    if (d === undefined || d === null || d === '') { eksikNedeni[ad] = `profilde "${e.alanEtiketi}" boş`; continue; }
    degerler[ad] = String(d);
    if (e.hassas) gizliler.push(String(d));
  }
  return { degerler, tarihKurallari: tarih, gizliler, eksikNedeni, kimlikProfili, kullanilanSatirlar };
}

// ---------------------------------------------------------------------------------------
// Eski servis giriş profillerini test verisine taşıma
// ---------------------------------------------------------------------------------------

/** Bilinen giriş parametreleri → test verisi alan adı; CHANNEL açık (listede görünsün), diğerleri hassas. */
const GIRIS_ALANLARI = /** @type {Record<string, { alan: string; etiket: string; hassas: boolean }>} */ ({
  CHANNEL: { alan: 'kanal', etiket: 'Kanal', hassas: false },
  USERNAME: { alan: 'kullanici', etiket: 'Kullanıcı adı', hassas: true },
  PASSWORD: { alan: 'parola', etiket: 'Parola', hassas: true }
});
export const SERVIS_GIRISI_TURU = 'Servis girişi';

/**
 * Eski "servis giriş profili"ni (kasadaki servis_kimlikleri) test verisine taşır: parametreler (USERNAME / PASSWORD / CHANNEL…)
 * bir test verisi türünün alanlarına eşlenir (zaten eşliyse o tür, değilse "Servis girişi" türü; rol "giris"), profilin genel
 * değerleri aynı adla bir test verisi profili, ortama özel değerleri "<ad> · <ortam>" profilleri olur; profili kullanan servisler
 * bu test verisi profillerine bağlanır (ortama özel olan "<tür>:<rol>@<ortam>" ile). Eski kayıt SİLİNMEZ (yalnız servislerden ayrılır).
 * onay verilmezse yalnız ne yapılacağı döner.
 * @param {Veritabani} vt @param {string} projeId @param {{ ad: string; onay?: boolean }} girdi
 */
export function girisProfiliniTestVerisineTasi(vt, projeId, girdi) {
  const ozet = servisKimlikOzeti(vt, projeId).find((p) => p.ad === girdi.ad);
  if (!ozet) throw new DepoHatasi(`"${girdi.ad}" servis giriş profili bulunamadı.`);
  const ortamlar = ortamlariListele(vt, projeId);
  const parametreler = [...new Set([...ozet.alanlar, ...Object.values(ozet.ortamlar).flat()])];
  const eslemeler = parametreEslemeleri(vt, projeId);
  const esli = parametreler.filter((p) => eslemeler.has(p)).map((p) => /** @type {NonNullable<ReturnType<typeof eslemeler.get>>} */ (eslemeler.get(p)));
  const hedefler = new Set(esli.map((e) => `${e.turId}:${e.rol}`));
  if (hedefler.size > 1) throw new DepoHatasi(`Profilin alanları farklı test verisi türlerine / rollerine eşli (${esli.map((e) => `${e.turAd}.${e.alan} (${e.rol})`).join(', ')}); elle taşıyın.`);
  const turler = testVerisiTurleriniListele(vt, projeId);
  const mevcutTur = esli.length ? turler.find((t) => t.id === esli[0].turId) : turler.find((t) => t.ad === SERVIS_GIRISI_TURU);
  const rol = esli.length ? esli[0].rol : 'giris';
  const eklenecek = parametreler.filter((p) => !eslemeler.has(p)).map((p) => {
    const b = GIRIS_ALANLARI[p] ?? { alan: p.toLocaleLowerCase('en').replace(/[^a-z0-9_]/g, '_'), etiket: p, hassas: true };
    return { parametre: p, ...b };
  });
  const alanAdi = (/** @type {string} */ p) => eslemeler.get(p)?.alan ?? eklenecek.find((x) => x.parametre === p)?.alan ?? p;
  if (mevcutTur) for (const e of eklenecek) if (mevcutTur.alanlar.some((a) => a.ad === e.alan)) throw new DepoHatasi(`"${mevcutTur.ad}" türünde "${e.alan}" alanı zaten var ama ${e.parametre} parametresine eşli değil; elle eşleyin.`);
  const kullanan = servisleriListele(vt, projeId).filter((s) => s.ayarlar.kimlikProfili === girdi.ad);
  const ozelProfiller = Object.entries(ozet.ortamlar).map(([ortamId, alanlar]) => ({ ortamId, ortam: ortamlar.find((o) => o.id === ortamId)?.ad ?? ortamId, alanlar }));
  const plan = {
    tur: mevcutTur ? mevcutTur.ad : SERVIS_GIRISI_TURU, yeniTur: !mevcutTur, rol,
    eklenecekAlanlar: eklenecek.map((e) => ({ alan: e.alan, parametre: e.parametre, hassas: e.hassas })),
    profiller: [{ ad: girdi.ad, ortam: null, alanlar: ozet.alanlar.map(alanAdi) }, ...ozelProfiller.map((o) => ({ ad: `${girdi.ad} · ${o.ortam}`, ortam: o.ortam, alanlar: [...new Set([...ozet.alanlar, ...o.alanlar])].map(alanAdi) }))],
    servisler: kullanan.map((s) => s.ad)
  };
  if (!girdi.onay) return { onizleme: plan };
  return vt.islem(() => {
    const turId = testVerisiTuruKaydet(vt, {
      ...(mevcutTur ? { id: mevcutTur.id } : {}), projeId, ad: plan.tur,
      alanlar: [
        ...(mevcutTur ? mevcutTur.alanlar.map((a) => ({ ad: a.ad, etiket: a.etiket, tip: a.tip, hassas: a.hassas })) : []),
        ...eklenecek.map((e) => ({ ad: e.alan, etiket: e.etiket, tip: 'metin', hassas: e.hassas, servisParametreleri: [{ ad: e.parametre, rol }] }))
      ]
    });
    const degerlerAl = (/** @type {string} */ ortamId) => Object.fromEntries(Object.entries(servisKimliginiCoz(vt, projeId, girdi.ad, ortamId)).map(([p, v]) => [alanAdi(p), v]));
    const profilBul = (/** @type {string} */ ad) => vt.tek('SELECT id FROM test_verisi_profilleri WHERE proje_id = ? AND tur_id = ? AND ad = ?', [projeId, turId, ad]);
    const genelId = testVerisiProfiliKaydet(vt, { id: profilBul(girdi.ad)?.id, projeId, turId, ortamId: null, ad: girdi.ad, degerler: degerlerAl('') });
    /** @type {Record<string, string>} */
    const secim = { [`${turId}:${rol}`]: genelId };
    for (const o of ozelProfiller) {
      const ad = `${girdi.ad} · ${o.ortam}`;
      secim[`${turId}:${rol}@${o.ortamId}`] = testVerisiProfiliKaydet(vt, { id: profilBul(ad)?.id, projeId, turId, ortamId: o.ortamId, ad, degerler: degerlerAl(o.ortamId) });
    }
    for (const s of kullanan) {
      const { kimlikProfili: _eski, ...ayarlar } = s.ayarlar;
      servisKaydet(vt, { id: s.id, projeId, anahtar: s.anahtar, ad: s.ad, ayarlar: { ...ayarlar, veriProfilleri: { ...(ayarlar.veriProfilleri ?? {}), ...secim } } });
    }
    return { tasindi: true, ...plan, turId, profilId: genelId };
  });
}

// ---------------------------------------------------------------------------------------
// SoapUI aktarımı
// ---------------------------------------------------------------------------------------

/**
 * Önizleme: durum verilmezse dosyadaki test durumlarının özeti; verilirse o durumun servis / senaryo taslakları ve
 * parametrelerin eşlenme durumu. Giriş bilgisi DEĞERLERİ dönmez (yalnız adlar).
 * @param {Veritabani} vt @param {string} projeId @param {string} xml @param {{ takim?: string; durum?: string }} [secim]
 */
export function soapuiOnizle(vt, projeId, xml, secim = {}) {
  const cozum = soapuiCozumle(xml);
  if (!secim.takim || !secim.durum) return { proje: cozum.proje, durumlar: soapuiOzeti(cozum) };
  const t = servisTaslaklari(cozum, { takim: secim.takim, durum: secim.durum });
  const eslemeler = parametreEslemeleri(vt, projeId);
  return {
    proje: cozum.proje, durum: t.durum, kimlikParametreleri: t.kimlikParametreleri, tarihKurallari: t.tarihKurallari,
    veriParametreleri: t.veriParametreleri.map((ad) => {
      const e = eslemeler.get(ad);
      return { ad, esleme: e ? { turAd: e.turAd, alan: e.alan, rol: e.rol } : null };
    }),
    servisler: t.servisler.map((s) => ({ ...s, senaryolar: s.senaryolar.map(({ govde, ...x }) => ({ ...x, govdeUzunlugu: govde.length })) }))
  };
}

/** @param {unknown} x */
const kucukAd = (x) => String(x ?? '').toLocaleLowerCase('tr');

/**
 * Bağlanmamış alanlar için tablo bağlantısı önerisi (sihirbazla aynı kural): başka serviste aynı adlı alanın bağlantısı; yoksa
 * adı alanla aynı sütun (gizli dahil: parola). Mevcut bağlantılara dokunulmaz.
 * @param {Veritabani} vt @param {string} projeId @param {Servis} servis @param {import('../tablolar/tablo-deposu.mjs').Tablo[]} tablolar
 */
function bagOnerileriniUygula(vt, projeId, servis, tablolar) {
  /** @type {Record<string, { tablo: string; sutun: string; etiket?: string }>} */
  const ogrenilen = {};
  for (const s of servisleriListele(vt, projeId)) {
    if (s.id === servis.id) continue;
    for (const alanlar of Object.values(s.ayarlar.alanBaglari ?? {})) {
      for (const [yol, b] of Object.entries(alanlar)) if (b && tablolar.some((t) => t.id === b.tablo)) ogrenilen[kucukAd(yol.split('/').pop())] ??= b;
    }
  }
  const baglar = /** @type {NonNullable<ServisAyarlari['alanBaglari']>} */ (JSON.parse(JSON.stringify(servis.ayarlar.alanBaglari ?? {})));
  let yeni = 0;
  for (const [op, sm] of Object.entries(servis.ayarlar.operasyonSemalari ?? {})) {
    for (const st of alanSatirlari(semaBirlestir(sm, servis.ayarlar.ekAlanlar?.[op] ?? []).alanlar)) {
      if (st.grup || baglar[op]?.[st.yol]) continue;
      const ad = kucukAd(st.alan.ad);
      let b = ogrenilen[ad];
      if (!b) {
        for (const t of tablolar) {
          const c = t.sutunlar.find((x) => kucukAd(x.ad) === ad);
          if (c) { b = { tablo: t.id, sutun: c.ad }; break; }
        }
      }
      if (b) { (baglar[op] ??= {})[st.yol] = { ...b }; yeni++; }
    }
  }
  return { baglar, yeni };
}

/**
 * SoapUI senaryosunu tablolara çevirir: gövdedeki ${PARAMETRE}, tabloya bağlı bir alandaysa ${Tablo.Sütun} (etiketliyse
 * ${Tablo[etiket].Sütun}) olur; dosyadaki giriş bilgisi değeri (kanal / kullanıcı) senaryonun tablo seçimi olur. Gövdenin geri
 * kalanı (biçim, sabit değerler, tarih kuralları) olduğu gibi kalır. Bağlantısı olmayan parametreye eski eşleme (test verisi
 * alanının servis parametreleri) uygulanır; o da yoksa parametre kalır.
 * @param {Servis} servis @param {string} op @param {string} govde @param {import('../tablolar/tablo-deposu.mjs').Tablo[]} tablolar
 * @param {Record<string, string>} kimlik dosyadaki giriş bilgileri (CHANNEL / USERNAME / PASSWORD)
 * @param {Map<string, { turId: string; alan: string; rol: string }>} eslemeler eski parametre eşlemeleri
 */
function senaryoyuTablolaraCevir(servis, op, govde, tablolar, kimlik, eslemeler) {
  const tarih = servis.ayarlar.tarihKurallari ?? {};
  /** @type {Record<string, Record<string, string>>} */
  const secimler = {};
  /** Grup → dosyadaki giriş değerleri (gizli sütunlar dahil; tabloya satır eklemek için). @type {Map<string, { t: import('../tablolar/tablo-deposu.mjs').Tablo; degerler: Record<string, string> }>} */
  const girisler = new Map();
  /** Parametre → tablo başvurusu. @type {Map<string, string>} */
  const donusum = new Map();
  const sm = servis.ayarlar.operasyonSemalari?.[op];
  if (sm) {
    const c = govdeCoz(govde, semaBirlestir(sm, servis.ayarlar.ekAlanlar?.[op] ?? []));
    const baglar = servis.ayarlar.alanBaglari?.[op] ?? {};
    for (const [yol, v] of Object.entries(c.degerler)) {
      if (v.kaynak !== 'parametre' || !v.deger || tarih[v.deger] || donusum.has(v.deger)) continue;
      const b = baglar[yol];
      const tb = b ? tablolar.find((x) => x.id === b.tablo) : undefined;
      const s = tb && b ? tb.sutunlar.find((x) => x.ad === b.sutun) : undefined;
      if (!tb || !s || !b) continue;
      donusum.set(v.deger, basvuru(tb.ad, s.ad, b.etiket || '', b.bicim || ''));
      const dosyada = kimlik[v.deger];
      if (!dosyada) continue;
      const grup = grupAnahtari(tb.id, b.etiket || '');
      if (!s.gizli) (secimler[grup] ??= {})[s.ad] = dosyada;
      if (!girisler.has(grup)) girisler.set(grup, { t: tb, degerler: {} });
      /** @type {{ degerler: Record<string, string> }} */ (girisler.get(grup)).degerler[s.ad] = dosyada;
    }
  }
  const etiketi = (/** @type {string | undefined} */ rol) => (!rol || rol === 'giris' || rol === 'varsayilan' ? '' : rol);
  const yeni = govde.replace(/\$\{\s*([A-Za-z_][A-Za-z0-9_.-]{0,79})\s*\}/g, (m, ad) => {
    if (tarih[ad]) return m;
    const ref = donusum.get(ad);
    if (ref) return `\${${ref}}`;
    // Alan formu yoksa (şema yok) eski eşleme metin olarak uygulanır; şema varsa bağlanmamış parametre olduğu gibi kalır.
    const e = sm ? undefined : eslemeler.get(ad);
    const tb = e ? tablolar.find((x) => x.id === e.turId) : undefined;
    return e && tb ? `\${${basvuru(tb.ad, e.alan, etiketi(e.rol))}}` : m;
  });
  return { govde: yeni, secimler, girisler };
}

/**
 * Aktarım: seçilen test durumunun bir servisini ve senaryolarını yazar. Aynı anahtarlı servis varsa senaryolar ona eklenir
 * (aynı başlıklı senaryo atlanır); yoksa servis erisimKimligi ile (erişim kontrolünden sonra) oluşturulur. Tarih kuralları
 * servise eklenir (mevcut kural korunur). Bağlanmamış alanlar tablolara bağlanır (öneri kuralı) ve senaryolar tablolara
 * çevrilir (bkz. senaryoyuTablolaraCevir). girisEkle: dosyadaki giriş bilgisi (kanal / kullanıcı / parola) bağlı tabloda
 * yoksa satır olarak eklenir (parola gizli sütunda şifreli).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ xml: string; takim: string; durum: string; servis: string; erisimKimligi?: string; kapsam?: 'test' | 'canli' | 'ikisi';
 *   girisEkle?: boolean; yapan?: string }} girdi
 */
export function soapuiAktar(vt, projeId, girdi) {
  const t = servisTaslaklari(soapuiCozumle(girdi.xml), { takim: girdi.takim, durum: girdi.durum });
  const taslak = t.servisler.find((s) => s.anahtar === girdi.servis);
  if (!taslak) throw new DepoHatasi(`Test durumunda "${girdi.servis}" servisi yok.`);
  return vt.islem(() => {
    const mevcut = vt.tek('SELECT id FROM servisler WHERE proje_id = ? AND anahtar = ?', [projeId, taslak.anahtar]);
    const servisId = mevcut ? String(mevcut.id) : servisiKaydet(vt, projeId, {
      anahtar: taslak.anahtar, ad: taslak.ad, yol: taslak.yol, soapSurumu: taslak.soapSurumu, erisimKimligi: girdi.erisimKimligi, yapan: girdi.yapan
    });
    let s = /** @type {Servis} */ (servisGetir(vt, servisId));
    let tablolar = tablolariListele(vt, projeId);
    const oneri = bagOnerileriniUygula(vt, projeId, s, tablolar);
    /** @type {ServisAyarlari} */
    const ayarlar = {
      ...s.ayarlar,
      tarihKurallari: { ...t.tarihKurallari, ...(s.ayarlar.tarihKurallari ?? {}) },
      ...(!s.ayarlar.operasyonlar?.length ? { operasyonlar: taslak.operasyonlar } : {}),
      alanBaglari: oneri.baglar
    };
    servisKaydet(vt, { id: servisId, projeId, anahtar: s.anahtar, ad: s.ad, ayarlar, yapan: girdi.yapan });
    s = /** @type {Servis} */ (servisGetir(vt, servisId));
    const eslemeler = parametreEslemeleri(vt, projeId);
    // Giriş bilgisi satırı (istenirse): ilk senaryodan dosyadaki kanal / kullanıcı / parola hangi tabloya gidiyorsa.
    let girisSatiriEklendi = false;
    if (girdi.girisEkle && Object.keys(t.kimlikAdaylari).length) {
      for (const x of taslak.senaryolar) {
        const { girisler } = senaryoyuTablolaraCevir(s, x.operasyon, x.govde, tablolar, t.kimlikAdaylari, eslemeler);
        for (const { t: tablo, degerler } of girisler.values()) {
          const acik = tablo.sutunlar.filter((c) => !c.gizli && degerler[c.ad] !== undefined);
          if (!acik.length || tablo.satirlar.some((r) => acik.every((c) => r.degerler[c.ad] === degerler[c.ad]))) continue;
          tabloKaydet(vt, { projeId, id: tablo.id, ad: tablo.ad, sutunlar: tablo.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: c.gizli })),
            satirlar: [{ ortamId: null, degerler }] });
          girisSatiriEklendi = true;
        }
        if (girisler.size) break;
      }
      if (girisSatiriEklendi) tablolar = tablolariListele(vt, projeId);
    }
    const mevcutBasliklar = new Set(servisSenaryolariniListele(vt, servisId).map((x) => x.baslik));
    let eklenen = 0;
    /** @type {string[]} */
    const atlanan = [];
    /** Tabloda satırı bulunmayan seçimler (senaryo koşmaz; tabloya satır eklenmeli). @type {Set<string>} */
    const eksikSatirlar = new Set();
    for (const x of taslak.senaryolar) {
      if (mevcutBasliklar.has(x.baslik)) { atlanan.push(x.baslik); continue; }
      const c = senaryoyuTablolaraCevir(s, x.operasyon, x.govde, tablolar, t.kimlikAdaylari, eslemeler);
      for (const [grup, secim] of Object.entries(c.secimler)) {
        const tablo = tablolar.find((y) => y.id === grup.split('|')[0]);
        if (tablo && !secilenSatir(tablo, secim)) eksikSatirlar.add(`${tablo.ad}: ${Object.entries(secim).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
      }
      servisSenaryosuKaydet(vt, {
        projeId, servisId, baslik: x.baslik, kapsam: girdi.kapsam ?? 'test', kosuyaDahil: x.kosuyaDahil,
        icerik: {
          operasyon: x.operasyon, govde: c.govde, kontroller: x.kontroller.length ? x.kontroller : [{ tur: 'soapYaniti' }], kaynak: x.kaynak,
          ...(Object.keys(c.secimler).length ? { tabloSecimleri: c.secimler } : {}), ...(x.uyarilar.length ? { aciklama: x.uyarilar.join(' ') } : {})
        },
        yapan: girdi.yapan
      });
      mevcutBasliklar.add(x.baslik);
      eklenen++;
    }
    const kalanParametreler = [...new Set(servisSenaryolariniListele(vt, servisId).flatMap((y) => kullanilanParametreler(y.icerik.govde)))]
      .filter((ad) => !(s.ayarlar.tarihKurallari ?? {})[ad] && !basvuruCoz(ad) && !eslemeler.has(ad));
    return { servisId, yeniServis: !mevcut, eklenen, atlanan, baglananAlan: oneri.yeni, girisSatiriEklendi, eksikSatirlar: [...eksikSatirlar], eslenmemisParametreler: kalanParametreler };
  });
}

// ---------------------------------------------------------------------------------------
// Deneme ve koşu
// ---------------------------------------------------------------------------------------

/**
 * Oturum sağlayıcı (servis-akislari.mjs kaydeder): servise atanan oturum akışının değerleri (token). Önbellekte geçerliyse
 * yeniden kullanılır (durum "onbellek"), yoksa ya da yenile ile oturum akışı koşulur (durum "alindi").
 * @typedef {(vt: Veritabani, projeId: string, akisId: string, ortamId: string, s: { yenile?: boolean; sinyal?: AbortSignal }) =>
 *   Promise<{ degerler: Record<string, string>; gizliler: string[]; baslik: string; durum: 'alindi' | 'onbellek' }>} OturumSaglayici
 */
/** @type {OturumSaglayici | null} */
let oturumSaglayici = null;
/** @param {OturumSaglayici | null} fn */
export function oturumSaglayicisiAyarla(fn) { oturumSaglayici = fn; }

/**
 * Tek bir senaryoyu (kayıtlı ya da taslak) bir ortamda çalıştırır ve sonucu servis koşuları tablosuna yazar.
 * tur 'dene': yalnız test ortamı; kapsam denetlenmez. tur 'kosu': kapsam ortam türüyle uyuşmalı.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId: string; ortamId: string; tur: 'dene' | 'kosu'; senaryoId?: string; taslak?: { baslik?: string; kapsam?: 'test' | 'canli' | 'ikisi'; icerik: unknown };
 *   zamanAsimiMs?: number; simdi?: Date; sinyal?: AbortSignal;
 *   olay?: (adim: 'hazirlik' | 'gonderim' | 'yanit' | 'kontroller', durum: 'basladi' | 'tamam' | 'hata', bilgi?: Record<string, unknown>) => void;
 *   akisDegerleri?: Record<string, string>; ekGizliler?: string[]; okumalar?: AkisOkumasi[]; akis?: Record<string, unknown>;
 *   acikDegerler?: (d: { okunan: Record<string, string>; gizliler: string[] }) => void; oturumYenile?: boolean }} girdi
 *   oturumYenile: oturum akışı önbelleği yok sayılıp yeniden koşulur (401 / 403 sonrası iç kullanım).
 *   olay: canlı panel için adım bildirimi (istek / yanıt maskeli). sinyal: durdurma (bekleyen istek kesilir).
 *   Servis akışı: akisDegerleri (${akis:Ad} değerleri), ekGizliler (maskelenecek önceki değerler), okumalar (yanıttan okunacak
 *   değerler; açık değerler YALNIZ acikDegerler geri çağırmasıyla, bellekte; kayıtta ve dönüşte gizliler maskeli), akis (kayda
 *   yazılan akış bilgisi).
 */
export async function servisSenaryosuCalistir(vt, projeId, girdi) {
  const olay = girdi.olay ?? (() => undefined);
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const ortam = ortamiAl(vt, projeId, girdi.ortamId);
  const tur = ortamTuru(ortam);
  const kayitli = girdi.senaryoId ? servisSenaryosuGetir(vt, girdi.senaryoId) : undefined;
  if (girdi.senaryoId && (!kayitli || kayitli.servisId !== servis.id)) throw new DepoHatasi('Senaryo bulunamadı.');
  if (!kayitli && !girdi.taslak) throw new DepoHatasi('"senaryoId" ya da "taslak" gerekli.');
  const icerik = kayitli ? kayitli.icerik : senaryoIceriginiDogrula(girdi.taslak?.icerik);
  const baslik = kayitli?.baslik ?? girdi.taslak?.baslik ?? 'Taslak';
  const kapsam = kayitli?.kapsam ?? girdi.taslak?.kapsam ?? 'test';
  if (girdi.tur === 'dene' && tur !== 'test') throw new DepoHatasi('"Dene" yalnızca test ortamında yapılır.');
  if (girdi.tur === 'kosu' && kapsam !== 'ikisi' && kapsam !== tur) throw new DepoHatasi(`Bu senaryo yalnızca ${kapsam === 'test' ? 'test' : 'canlı'} ortamda koşar.`);
  if (tur === 'canli' && (servis.ayarlar.yalnizTestOperasyonlari ?? []).includes(icerik.operasyon)) {
    throw new DepoHatasi(`"${icerik.operasyon}" operasyonu yalnız test ortamında koşar (servis ayarı).`);
  }
  const eylem = servis.ayarlar.operasyonlar?.find((o) => o.ad === icerik.operasyon)?.eylem;
  const baslangic = new Date();
  const bas = Date.now();
  /** @type {string[]} */
  let gizliler = [...(girdi.ekGizliler ?? [])];
  let akisDegerleri = girdi.akisDegerleri;
  /** Kullanıcının koşu ayarları (servis zaman aşımı, varsayılan tarih biçimi). */
  const kosu = kosuAyarlariniOku(vt);
  /** Kullanıcının ek gizli adları (Ayarlar > Güvenlik > Maskeleme). */
  const ekAdlar = ekGizliAdlar(vt);
  let oturumKullanildi = false;
  /** @type {Record<string, string>} Yanıttan okunan açık değerler (kayda yazılmaz). */
  const okunan = {};
  /** @type {Record<string, unknown>} */
  const sonuc = { operasyon: icerik.operasyon, ortam: ortam.ad, ortamTuru: tur, ...(girdi.akis ? { akis: girdi.akis } : {}) };
  /** @type {'basarili' | 'basarisiz' | 'hata'} */
  let durum = 'hata';
  /** @type {'hazirlik' | 'gonderim' | 'yanit' | 'kontroller'} */
  let adim = 'hazirlik';
  try {
    olay('hazirlik', 'basladi');
    const adres = servisAdresi(servis.ayarlar, ortam);
    sonuc.adres = adres;
    // ${akis:…} değeri verilmemişse ve servise oturum akışı atanmışsa değerler (ör. token) oturumdan: önbellekte geçerliyse
    // yeniden kullanılır, yoksa oturum akışı koşulur.
    const basliklarHam = icerik.basliklar ?? {};
    const gereken = kullanilanAkisDegerleri([icerik.govde, ...Object.values(basliklarHam), JSON.stringify(icerik.kontroller)].join('\n'))
      .filter((a) => akisDegerleri?.[a] === undefined);
    if (gereken.length && servis.ayarlar.oturumAkisi && oturumSaglayici) {
      const o = await oturumSaglayici(vt, projeId, servis.ayarlar.oturumAkisi, ortam.id, { yenile: girdi.oturumYenile === true, sinyal: girdi.sinyal });
      akisDegerleri = { ...o.degerler, ...(akisDegerleri ?? {}) };
      gizliler = [...gizliler, ...o.gizliler];
      sonuc.oturum = { akis: o.baslik, durum: girdi.oturumYenile ? 'yenilendi' : o.durum };
      oturumKullanildi = true;
    }
    // Başlıklardaki ${Tablo.Sütun} de gövdedekilerle birlikte çözülür.
    const p = parametreDegerleri(vt, projeId, servis, { ...icerik, govde: [icerik.govde, ...Object.values(basliklarHam)].join('\n') }, ortam.id);
    gizliler = [...gizliler, ...p.gizliler];
    if (p.kimlikProfili) sonuc.kimlikProfili = p.kimlikProfili;
    if (p.kullanilanSatirlar.length) sonuc.tabloSatirlari = p.kullanilanSatirlar;
    const doldurma = {
      degerler: p.degerler, tarihKurallari: p.tarihKurallari, simdi: girdi.simdi, eksikAciklamasi: (/** @type {string} */ ad) => p.eksikNedeni[ad] ?? 'tanımsız',
      akisDegerleri, varsayilanTarihBicimi: kosu.tarihBicimi
    };
    const govde = yerTutuculariDoldur(icerik.govde, doldurma);
    const ekBasliklar = Object.fromEntries(Object.entries(basliklarHam).map(([a, d]) => [a, yerTutuculariDoldur(d, { ...doldurma, kacis: /** @type {const} */ ('baslik') })]));
    sonuc.istek = gizlileriMaskele(govde, gizliler);
    if (Object.keys(ekBasliklar).length) sonuc.istekBasliklari = basliklariMaskele(ekBasliklar, gizliler, ekAdlar);
    olay('hazirlik', 'tamam', { adres, istek: sonuc.istek });
    adim = 'gonderim';
    olay('gonderim', 'basladi');
    if (girdi.sinyal?.aborted) throw new ServisHatasi('Kullanıcı durdurdu.');
    const yanit = await soapIstegi({
      adres, eylem, soapSurumu: servis.ayarlar.soapSurumu, govde, zamanAsimiMs: girdi.zamanAsimiMs ?? kosu.servisZamanAsimiSn * 1000, tlsDogrulama: servis.ayarlar.tlsDogrulama, sinyal: girdi.sinyal,
      ekBasliklar, gonderildi: () => { olay('gonderim', 'tamam'); adim = 'yanit'; olay('yanit', 'basladi'); }
    });
    // Oturum değeri (token) sunucuca reddedildiyse: oturum bir kez yenilenip senaryo yeniden denenir (bu deneme kaydedilmez).
    if (oturumKullanildi && !girdi.oturumYenile && (yanit.durumKodu === 401 || yanit.durumKodu === 403)) {
      return await servisSenaryosuCalistir(vt, projeId, { ...girdi, oturumYenile: true });
    }
    adim = 'kontroller';
    // Yanıttan okuma (akış): gizli değerler kayda / panele yazılmadan önce maskeleme listesine girer.
    /** @type {import('./soap-istemcisi.mjs').KontrolSonucu[]} */
    const okumaSonuclari = [];
    for (const o of girdi.okumalar ?? []) {
      const v = degerOku(yanit, o);
      if (v === undefined || v === '') {
        okumaSonuclari.push({ tur: 'okuma', ad: `Değer okunamadı: ${o.ad}`, gecti: false, aciklama: `${o.kaynak ?? 'xml'} yolu "${o.yol}" yanıtta bulunamadı` });
        continue;
      }
      okunan[o.ad] = v;
      if (okumaGizliMi(o, ekAdlar)) gizliler.push(v);
      okumaSonuclari.push({ tur: 'okuma', ad: `Değer okundu: ${o.ad}`, gecti: true, aciklama: okumaGizliMi(o, ekAdlar) ? 'gizli (maskelendi)' : '' });
    }
    olay('yanit', 'tamam', { durumKodu: yanit.durumKodu, sureMs: yanit.sureMs, yanit: gizlileriMaskele(yanit.govde.slice(0, 20_000), gizliler) });
    // Kontrol değerlerinde ${akis:Ad} (ör. yanıttaki TeklifNo = önceki adımda okunan) çözülür.
    const kontrolListesi = akisDegerleri ? akisKontrolleriniCoz(icerik.kontroller, akisDegerleri) : icerik.kontroller;
    const kontroller = [...kontrolleriDegerlendir(yanit, kontrolListesi), ...okumaSonuclari];
    durum = kontroller.every((k) => k.gecti) ? 'basarili' : 'basarisiz';
    if (Object.keys(okunan).length) {
      sonuc.okunanlar = Object.fromEntries((girdi.okumalar ?? []).filter((o) => okunan[o.ad] !== undefined).map((o) => [o.ad, okumaGizliMi(o, ekAdlar) ? MASKE : okunan[o.ad]]));
    }
    olay('kontroller', durum === 'basarili' ? 'tamam' : 'hata', { gecen: kontroller.filter((k) => k.gecti).length, toplam: kontroller.length });
    Object.assign(sonuc, {
      durumKodu: yanit.durumKodu, yanitSureMs: yanit.sureMs, kontroller, ozet: gizlileriMaskele(yanitOzeti(yanit.govde), gizliler),
      yanit: gizlileriMaskele(yanit.govde.length > YANIT_SAKLAMA_SINIRI ? `${yanit.govde.slice(0, YANIT_SAKLAMA_SINIRI)}\n…(kırpıldı)` : yanit.govde, gizliler)
    });
  } catch (e) {
    if (!(e instanceof ServisHatasi) && !(e instanceof DepoHatasi)) throw e;
    sonuc.hata = e.message;
    if (girdi.sinyal?.aborted) sonuc.durduruldu = true;
    olay(adim, 'hata', { mesaj: e.message });
  }
  const sureMs = Date.now() - bas;
  const kosuId = servisKosusuKaydet(vt, {
    projeId, servisId: servis.id, senaryoId: kayitli?.id ?? null, ortamId: ortam.id, tur: girdi.tur, durum,
    baslangic: baslangic.toISOString(), sureMs, baslik, sonuc
  });
  // Açık değerler yalnız çağıran akış motoruna (geri çağırma); dönüş / API yanıtı / kayıt maskeli kalır.
  girdi.acikDegerler?.({ okunan, gizliler });
  return { kosuId, durum, sureMs, baslik, ...sonuc };
}

/**
 * Akışta yanıttan okunacak değer: ad (${akis:Ad}), kaynak (xml: basit XPath · json: a.b[0] · baslik: yanıt başlığı), yol; gizli
 * (varsayılan: adı token / parola / secret / session / cookie / auth içeriyorsa) — gizli değer kayıtta maskelenir.
 * @typedef {{ ad: string; kaynak?: 'xml' | 'json' | 'baslik'; yol: string; gizli?: boolean }} AkisOkumasi
 */

/** Okuma gizli mi: açıkça işaretlendiyse o; yoksa adı gizli ad listesinde mi (çekirdek + kullanıcının ekleri). @param {AkisOkumasi} o @param {ReadonlyArray<string>} [ekler] */
export const okumaGizliMi = (o, ekler = []) => (o.gizli !== undefined ? o.gizli : gizliAdMi(o.ad, ekler));

/**
 * Adı gizli sayılan başlıklar (Authorization, Cookie, X-Api-Key… ve kullanıcının ek adları) raporda her zaman maskelenir (şema
 * kalır: "Bearer ***"); diğerlerinde yalnız gizli değerler maskelenir.
 * @param {Record<string, string>} b @param {string[]} gizliler @param {ReadonlyArray<string>} ekler
 */
function basliklariMaskele(b, gizliler, ekler) {
  return Object.fromEntries(Object.entries(b).map(([a, d]) => {
    if (!gizliAdMi(a, ekler)) return [a, gizlileriMaskele(d, gizliler)];
    const sema = /^(Bearer|Basic|Digest|Token)\s+/i.exec(d);
    return [a, sema ? `${sema[1]} ${MASKE}` : MASKE];
  }));
}

/**
 * Kontrol değerlerindeki ${akis:Ad} → değer (VEYA alt kontrolleri dahil). Tanımsız ad olduğu gibi kalır (kontrol düşer).
 * @param {import('./servis-deposu.mjs').ServisKontrolu[]} kontroller @param {Record<string, string>} degerler
 * @returns {import('./servis-deposu.mjs').ServisKontrolu[]}
 */
function akisKontrolleriniCoz(kontroller, degerler) {
  const coz = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.replace(/\$\{\s*akis:([A-Za-z_][A-Za-z0-9_-]{0,59})\s*\}/g, (m, ad) => degerler[ad] ?? m) : v);
  return kontroller.map((k) => /** @type {any} */ ({ ...k, ...(k.deger !== undefined ? { deger: coz(k.deger) } : {}), ...(Array.isArray(k.alt) ? { alt: akisKontrolleriniCoz(k.alt, degerler) } : {}) }));
}

/**
 * Servisin koşuya dahil ve kapsamı ortama uyan senaryolarını sırayla koşar (verilirse yalnız senaryoIdleri).
 * @param {Veritabani} vt @param {string} projeId @param {{ servisId: string; ortamId: string; senaryoIdleri?: string[]; zamanAsimiMs?: number }} girdi
 */
export async function servisSenaryolariniKos(vt, projeId, girdi) {
  const ortam = ortamiAl(vt, projeId, girdi.ortamId);
  const tur = ortamTuru(ortam);
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const yalnizTest = new Set(servis.ayarlar.yalnizTestOperasyonlari ?? []);
  const secili = girdi.senaryoIdleri ? new Set(girdi.senaryoIdleri) : null;
  const liste = servisSenaryolariniListele(vt, girdi.servisId).filter((s) => (secili ? secili.has(s.id) : s.kosuyaDahil));
  const tanimli = ortamdaTanimli(servis.ayarlar, ortam.id);
  const kosulacak = tanimli ? liste.filter((s) => (s.kapsam === 'ikisi' || s.kapsam === tur) && !(tur === 'canli' && yalnizTest.has(s.icerik.operasyon))) : [];
  const sonuclar = [];
  for (const s of kosulacak) {
    const r = await servisSenaryosuCalistir(vt, projeId, { servisId: girdi.servisId, ortamId: girdi.ortamId, tur: 'kosu', senaryoId: s.id, zamanAsimiMs: girdi.zamanAsimiMs });
    sonuclar.push({ senaryoId: s.id, baslik: s.baslik, durum: r.durum, sureMs: r.sureMs, kosuId: r.kosuId, ozet: String(r.hata ?? r.ozet ?? '') });
  }
  return {
    ortam: ortam.ad, ortamTuru: tur, atlanan: liste.length - kosulacak.length, ...(tanimli ? {} : { atlamaNedeni: `Servis "${ortam.ad}" ortamında tanımlı değil (taban adres boş).` }), sonuclar,
    ozet: { basarili: sonuclar.filter((x) => x.durum === 'basarili').length, basarisiz: sonuclar.filter((x) => x.durum === 'basarisiz').length, hata: sonuclar.filter((x) => x.durum === 'hata').length }
  };
}

