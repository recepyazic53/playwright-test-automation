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
  erisimiDenetle, gizlileriMaskele, goreliTarih, kontrolleriDegerlendir, kullanilanParametreler, ServisHatasi, soapIstegi,
  yanitOzeti, YANIT_SAKLAMA_SINIRI, yerTutuculariDoldur
} from './soap-istemcisi.mjs';
import {
  senaryoIceriginiDogrula, servisGetir, servisKaydet, servisKimligiKaydet, servisKimliginiCoz, servisKosusuKaydet,
  servisKimlikOzeti, servisleriListele, servisSenaryolariniListele, servisSenaryosuGetir, servisSenaryosuKaydet
} from './servis-deposu.mjs';
import { servisTaslaklari, soapuiCozumle, soapuiOzeti } from './soapui-ice-aktarma.mjs';
import { KAYNAKLAR } from './servis-govdesi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').Servis} Servis */
/** @typedef {import('./servis-deposu.mjs').ServisAyarlari} ServisAyarlari */
/** @typedef {import('./servis-deposu.mjs').ServisSenaryoIcerigi} ServisSenaryoIcerigi */

/** Başarılı erişim kontrolünün geçerlilik süresi (bu sürede "Kaydet" yapılmalı). */
export const ERISIM_GECERLILIK_MS = 30 * 60_000;
/** Giriş bilgisi profilinde gizli sayılan (raporda maskelenen) parametre adları. */
const GIZLI_KIMLIK_PARAMETRELERI = /pass|parola|sifre|secret|token/i;

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
      if (!e || typeof e.yol !== 'string' || !/^[A-Za-z_][\w.-]*(\/[A-Za-z_][\w.-]*)*$/.test(e.yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${e?.yol}".`);
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
    for (const yol of yollar) if (typeof yol !== 'string' || !/^[A-Za-z_][\w.-]*(\/[A-Za-z_][\w.-]*)*$/.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
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
      if (!/^[A-Za-z_][\w.-]*(\/[A-Za-z_][\w.-]*)*$/.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
      if (!d || typeof d !== 'object' || !KAYNAKLAR.includes(d.kaynak)) throw new DepoHatasi(`"${yol}" için geçersiz kaynak.`);
      if ((d.kaynak === 'sabit' || d.kaynak === 'parametre') && typeof d.deger !== 'string') throw new DepoHatasi(`"${yol}" için değer gerekli.`);
      (s[op] ??= {})[yol] = d.kaynak === 'sabit' || d.kaynak === 'parametre' ? { kaynak: d.kaynak, deger: d.deger } : { kaynak: d.kaynak };
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
 *   alanVarsayilanlari?: unknown; alanZorunluluklari?: unknown; ekAlanlar?: unknown }} girdi
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
    ...(girdi.ekAlanlar !== undefined ? { ekAlanlar: ekAlanlariDogrula(girdi.ekAlanlar) } : {})
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
  for (const s of servisSenaryolariniListele(vt, servisId)) for (const p of kullanilanParametreler(s.icerik.govde)) kullanim.set(p, (kullanim.get(p) ?? 0) + 1);
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
  for (const ad of adlar) {
    if (tarih[ad]) continue;
    if (kimlik[ad] !== undefined) {
      degerler[ad] = kimlik[ad];
      if (GIZLI_KIMLIK_PARAMETRELERI.test(ad)) gizliler.push(kimlik[ad]);
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
  return { degerler, tarihKurallari: tarih, gizliler, eksikNedeni, kimlikProfili };
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

/**
 * Aktarım: seçilen test durumunun bir servisini ve senaryolarını yazar. Aynı anahtarlı servis varsa senaryolar ona eklenir
 * (aynı başlıklı senaryo atlanır); yoksa servis erisimKimligi ile (erişim kontrolünden sonra) oluşturulur. Tarih kuralları
 * servise eklenir (mevcut kural korunur). kimlikProfili.ad verilirse servis bu profili kullanır; kimlikProfili.kaydet true
 * ise dosyadaki giriş bilgileri bu profilin genel değerleri olarak kasaya yazılır (kullanıcı onayıyla).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ xml: string; takim: string; durum: string; servis: string; erisimKimligi?: string; kapsam?: 'test' | 'canli' | 'ikisi';
 *   kimlikProfili?: { ad: string; kaydet?: boolean }; yapan?: string }} girdi
 */
export function soapuiAktar(vt, projeId, girdi) {
  const t = servisTaslaklari(soapuiCozumle(girdi.xml), { takim: girdi.takim, durum: girdi.durum });
  const taslak = t.servisler.find((s) => s.anahtar === girdi.servis);
  if (!taslak) throw new DepoHatasi(`Test durumunda "${girdi.servis}" servisi yok.`);
  const profilAdi = girdi.kimlikProfili?.ad?.trim() || undefined;
  return vt.islem(() => {
    const mevcut = vt.tek('SELECT id FROM servisler WHERE proje_id = ? AND anahtar = ?', [projeId, taslak.anahtar]);
    const servisId = mevcut ? String(mevcut.id) : servisiKaydet(vt, projeId, {
      anahtar: taslak.anahtar, ad: taslak.ad, yol: taslak.yol, soapSurumu: taslak.soapSurumu, erisimKimligi: girdi.erisimKimligi, yapan: girdi.yapan
    });
    const s = /** @type {Servis} */ (servisGetir(vt, servisId));
    /** @type {ServisAyarlari} */
    const ayarlar = {
      ...s.ayarlar,
      tarihKurallari: { ...t.tarihKurallari, ...(s.ayarlar.tarihKurallari ?? {}) },
      ...(!s.ayarlar.operasyonlar?.length ? { operasyonlar: taslak.operasyonlar } : {}),
      ...(profilAdi && !s.ayarlar.kimlikProfili ? { kimlikProfili: profilAdi } : {})
    };
    servisKaydet(vt, { id: servisId, projeId, anahtar: s.anahtar, ad: s.ad, ayarlar, yapan: girdi.yapan });
    const mevcutBasliklar = new Set(servisSenaryolariniListele(vt, servisId).map((x) => x.baslik));
    let eklenen = 0;
    /** @type {string[]} */
    const atlanan = [];
    for (const x of taslak.senaryolar) {
      if (mevcutBasliklar.has(x.baslik)) { atlanan.push(x.baslik); continue; }
      servisSenaryosuKaydet(vt, {
        projeId, servisId, baslik: x.baslik, kapsam: girdi.kapsam ?? 'test', kosuyaDahil: x.kosuyaDahil,
        icerik: { operasyon: x.operasyon, govde: x.govde, kontroller: x.kontroller.length ? x.kontroller : [{ tur: 'soapYaniti' }], kaynak: x.kaynak, ...(x.uyarilar.length ? { aciklama: x.uyarilar.join(' ') } : {}) },
        yapan: girdi.yapan
      });
      mevcutBasliklar.add(x.baslik);
      eklenen++;
    }
    let kimlikKaydedildi = false;
    if (profilAdi && girdi.kimlikProfili?.kaydet && Object.keys(t.kimlikAdaylari).length) {
      servisKimligiKaydet(vt, { projeId, ad: profilAdi, degerler: t.kimlikAdaylari });
      kimlikKaydedildi = true;
    }
    const eslemeler = parametreEslemeleri(vt, projeId);
    return { servisId, yeniServis: !mevcut, eklenen, atlanan, kimlikKaydedildi, eslenmemisParametreler: t.veriParametreleri.filter((ad) => !eslemeler.has(ad)) };
  });
}

// ---------------------------------------------------------------------------------------
// Deneme ve koşu
// ---------------------------------------------------------------------------------------

/**
 * Tek bir senaryoyu (kayıtlı ya da taslak) bir ortamda çalıştırır ve sonucu servis koşuları tablosuna yazar.
 * tur 'dene': yalnız test ortamı; kapsam denetlenmez. tur 'kosu': kapsam ortam türüyle uyuşmalı.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId: string; ortamId: string; tur: 'dene' | 'kosu'; senaryoId?: string; taslak?: { baslik?: string; kapsam?: 'test' | 'canli' | 'ikisi'; icerik: unknown };
 *   zamanAsimiMs?: number; simdi?: Date }} girdi
 */
export async function servisSenaryosuCalistir(vt, projeId, girdi) {
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
  let gizliler = [];
  /** @type {Record<string, unknown>} */
  const sonuc = { operasyon: icerik.operasyon, ortam: ortam.ad, ortamTuru: tur };
  /** @type {'basarili' | 'basarisiz' | 'hata'} */
  let durum = 'hata';
  try {
    const adres = servisAdresi(servis.ayarlar, ortam);
    sonuc.adres = adres;
    const p = parametreDegerleri(vt, projeId, servis, icerik, ortam.id);
    gizliler = p.gizliler;
    if (p.kimlikProfili) sonuc.kimlikProfili = p.kimlikProfili;
    const govde = yerTutuculariDoldur(icerik.govde, {
      degerler: p.degerler, tarihKurallari: p.tarihKurallari, simdi: girdi.simdi, eksikAciklamasi: (ad) => p.eksikNedeni[ad] ?? 'tanımsız'
    });
    sonuc.istek = gizlileriMaskele(govde, gizliler);
    const yanit = await soapIstegi({ adres, eylem, soapSurumu: servis.ayarlar.soapSurumu, govde, zamanAsimiMs: girdi.zamanAsimiMs, tlsDogrulama: servis.ayarlar.tlsDogrulama });
    const kontroller = kontrolleriDegerlendir(yanit, icerik.kontroller);
    durum = kontroller.every((k) => k.gecti) ? 'basarili' : 'basarisiz';
    Object.assign(sonuc, {
      durumKodu: yanit.durumKodu, yanitSureMs: yanit.sureMs, kontroller, ozet: gizlileriMaskele(yanitOzeti(yanit.govde), gizliler),
      yanit: gizlileriMaskele(yanit.govde.length > YANIT_SAKLAMA_SINIRI ? `${yanit.govde.slice(0, YANIT_SAKLAMA_SINIRI)}\n…(kırpıldı)` : yanit.govde, gizliler)
    });
  } catch (e) {
    if (!(e instanceof ServisHatasi) && !(e instanceof DepoHatasi)) throw e;
    sonuc.hata = e.message;
  }
  const sureMs = Date.now() - bas;
  const kosuId = servisKosusuKaydet(vt, {
    projeId, servisId: servis.id, senaryoId: kayitli?.id ?? null, ortamId: ortam.id, tur: girdi.tur, durum,
    baslangic: baslangic.toISOString(), sureMs, baslik, sonuc
  });
  return { kosuId, durum, sureMs, baslik, ...sonuc };
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
