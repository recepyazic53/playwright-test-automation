// SERVİS TESTLERİ — iş kuralları: erişim kontrolü, servis ekleme, SoapUI aktarımı, parametre çözümü, deneme ve koşu.
// Kurallar:
// - Erişim kontrolü, şema yenileme ve "Dene" her ortamda yapılabilir; CANLI ortamda istek yalnız kullanıcı onaylayınca (istekte
//   canliOnay: true; guvenlik/uc-denetimi.mjs) gider.
// - Yeni servis (ya da adresi değişen servis) ancak başarılı bir erişim kontrolünden sonra kaydedilir.
// - Senaryo kapsamı ('test' | 'canli' | 'ikisi') ortam türüyle uyuşmuyorsa koşulmaz; canlı ortamda "yalnız test"
//   işaretli operasyonlar (ör. kayıt oluşturanlar) hiç koşulmaz.
// - Gövdede değer kaynağı: ${Tablo.Sütun} (test verisi tablosu; senaryonun tablo seçimiyle uyan satır), ${KURAL} (servisin
//   hesaplama kuralı), ${akis:Ad}. GERİYE UYUM (eski kayıtlar; yeni aktarım bunları yazmaz): ${AD} giriş bilgisi profilinden
//   (kasada; ör. USERNAME / PASSWORD / CHANNEL) ya da test verisi türü alanının "servis parametreleri" eşlemesi + servisin
//   (senaryo ezebilir) o tür + rol için seçtiği profilden (veriProfilleri) gelir. Dönüşüm: soapui-aktarimi.mjs eskiParametreleriDonustur.
// - Saklanan istek / yanıtta parola ve hassas test verisi değerleri maskelenir.
// - "Yanıt sözleşmeye uymalı" (senaryo; varsayılan kapalı) açıksa yanıt servisin sözleşmesine göre doğrulanır (servis-sozlesmesi.mjs).
// - 401 / 403: yalnız kullanıcı "Token'ı yenile, bir kez tekrar dene" seçtiyse oturum / token yenilenip istek bir kez tekrarlanır.
import { randomUUID } from 'node:crypto';
import {
  DepoHatasi, ortamGetir, ortamKaydet, ortamlariListele, testVerisiProfiliGetir, testVerisiProfiliKaydet, testVerisiTuruKaydet, testVerisiTurleriniListele
} from '../veritabani/depo.mjs';
import {
  degerOku, erisimiDenetle, gizlileriMaskele, MASKE, kontrolleriDegerlendir, kullanilanAkisDegerleri, kullanilanParametreler, ServisHatasi, soapIstegi,
  yanitOzeti, YANIT_SAKLAMA_SINIRI, yerTutuculariDoldur
} from './soap-istemcisi.mjs';
import {
  senaryoIceriginiDogrula, servisAkisiGetir, servisGetir, servisKaydet, servisKimliginiCoz, servisKosusuKaydet,
  servisKimlikOzeti, servisleriListele, servisOrtamdaKosuyaDahil, servisSenaryolariniListele, servisSenaryosuGetir, servisSenaryosuKaydet, yetkiTekrariAcik
} from './servis-deposu.mjs';
import { yanitSozlesmesiniDenetle } from './servis-sozlesmesi.mjs';
import { adresBirlestirRest, govdeKacisi, restIstegi } from './rest-istemcisi.mjs';
import { ortakYol, postmanCozumle, postmanOzeti, sablonCevir, sablonDegiskenleri } from './postman-ice-aktarma.mjs';
import { KAYNAKLAR, alanSatirlari, govdeCoz, semaBirlestir } from './servis-govdesi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { etkiDenetimiyle } from '../tablolar/tablo-etkisi.mjs';
import { BICIM_KALIBI, basvuru, basvuruCoz, basvuruyuCoz, grupAnahtari, satirSecimiOlustur, servisDegeri, tabloBul } from '../tablolar/tablo-secimi.mjs';
import { satirOzeti, veriKosulariniAc } from '../tablolar/veri-kosulari.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { servisEszamanliOku, sinirliKos } from './eszamanli.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';
import { hesapKurallariniDenetle, kuralParametreleri } from './hesap-kurallari.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { tanimMetinleri, yanitDosyaAdi } from '../dosyalar/dosya-icerigi.mjs';
// Döngüsel içe aktarma (taban-adresleri bu modülün taban doğrulamasını kullanır): yalnız çağrı anında kullanılan işlevler.
import { tabanKarari, tabanKarariUygula } from './taban-adresleri.mjs';

/** Dosya kontrolünde rapora eklenecek (Ayarlar izin verirse) dosyanın en büyük boyutu; daha büyüğü yalnız özetle kalır. */
const DOSYA_EKI_SINIRI = 5 * 1024 * 1024;

/** Projedeki test verisi tablolarının gizli sütun değerleri (okunamazsa boş). @param {Veritabani} vt @param {string} projeId @returns {string[]} */
function gizliTabloDegerleri(vt, projeId) {
  try {
    return tablolariListele(vt, projeId, { cozulsun: true }).flatMap((t) => {
      const gizli = t.sutunlar.filter((s) => s.gizli).map((s) => s.ad);
      return t.satirlar.flatMap((r) => gizli.map((ad) => r.degerler[ad]).filter((v) => typeof v === 'string' && v.length > 0));
    });
  } catch { return []; }
}

/**
 * Yanıt ikili mi (metin olarak gösterilemez): NUL baytı, geçersiz UTF-8 ya da bilinen ikili imza (ZIP / PDF / eski Office).
 * @param {Buffer} v
 */
function ikiliMi(v) {
  const bas = v.subarray(0, 8);
  if (bas.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || bas.subarray(0, 4).toString('latin1') === '%PDF' || bas.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return true;
  if (v.subarray(0, 8192).includes(0)) return true;
  // Windows-1254 metin de UTF-8 değildir: ham hâliyle bozuk görüneceğinden ikili gibi yalnız özetle kalır.
  try { new TextDecoder('utf-8', { fatal: true }).decode(v.subarray(0, 65536), { stream: true }); return false; } catch { return true; }
}

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

/**
 * Ortam türü (servis kapsamı, "yalnız test" metotları). TEK TANIM: guvenlik/ortam-riski.mjs > riskliOrtamMi — canlı
 * ortam — kullanıcının "Bu ortam riskli mi?" seçimi; belirtilmemiş = riskli — 'canli' sayılır (arayüz ve sunucu aynı kural).
 * @param {{ ayarlar: Record<string, unknown>; varsayilan?: boolean; ad?: string }} ortam
 */
export const ortamTuru = (ortam) => (riskliOrtamMi(ortam) ? 'canli' : 'test');

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
 * @param {{ yol?: string; adresler?: Record<string, string>; tabanlar?: Record<string, string>; tabanGrubu?: string }} ayarlar @param {{ id: string; ad?: string; tabanUrl: string }} ortam
 */
export function servisAdresi(ayarlar, ortam) {
  const ozel = ayarlar.adresler?.[ortam.id];
  if (ozel) return ozel;
  if (!ayarlar.yol) throw new DepoHatasi('Servisin yolu tanımlı değil (ör. /AppService/servis.asmx).');
  const taban = ayarlar.tabanlar?.[ortam.id];
  if (taban === '') throw new DepoHatasi(tanimsizNedeni(ayarlar, ortam.ad));
  return adresBirlestir(taban || ortam.tabanUrl, ayarlar.yol);
}

/**
 * Servisin taban adresi bu ortamda boşken koşunun / atlamanın anlaşılır nedeni (bağlı olduğu adlandırılmış taban adresiyle).
 * @param {{ tabanGrubu?: string }} ayarlar @param {string} [ortamAd]
 */
export const tanimsizNedeni = (ayarlar, ortamAd) => `Servis ${ortamAd ? `"${ortamAd}"` : 'bu'} ortamında tanımlı değil: taban adresi tanımlı değil${
  ayarlar.tabanGrubu ? ` ("${ayarlar.tabanGrubu}" taban adresinin bu ortamda adresi yok)` : ''}.`;

/** Servis bu ortamda tanımlı mı (taban adresi bilerek boş bırakılmadıysa). @param {{ tabanlar?: Record<string, string> }} ayarlar @param {string} ortamId */
export const ortamdaTanimli = (ayarlar, ortamId) => ayarlar.tabanlar?.[ortamId] !== '';

/**
 * Ortam taban adresleri: { <ortamId>: adres | '' }. '' = servis o ortamda yok. Adres http(s) olmalı.
 * @param {unknown} tabanlar @returns {Record<string, string>}
 */
export function tabanlariDogrula(tabanlar) {
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
export function tabanlariOrtamlaraKaydet(vt, projeId, tabanlar) {
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

/**
 * Hesaplama kuralları (ayar adı geriye uyum için tarihKurallari): { AD: "bugun+1y|yyyy-MM-dd" | "yuvarla(${Tutar} / 100, 2)" }.
 * Sözdizimi, tanımsız kural adı, bilinmeyen fonksiyon ve döngü (A → B → A) açık hatayla reddedilir (bkz. hesap-kurallari.mjs).
 * @param {unknown} kurallar @returns {Record<string, string>}
 */
export function tarihKurallariniDogrula(kurallar) {
  if (kurallar === undefined || kurallar === null) return {};
  if (typeof kurallar !== 'object' || Array.isArray(kurallar)) throw new DepoHatasi('"tarihKurallari" bir nesne olmalıdır.');
  /** @type {Record<string, string>} */
  const s = {};
  for (const [ad, kural] of Object.entries(kurallar)) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(ad)) throw new DepoHatasi(`Geçersiz kural adı: "${ad}".`);
    if (typeof kural !== 'string' || !kural.trim()) continue;
    if (kural.length > 2000) throw new DepoHatasi(`${ad}: kural en çok 2000 karakter olabilir.`);
    s[ad] = kural.trim();
  }
  const hatalar = Object.entries(hesapKurallariniDenetle(s));
  if (hatalar.length) throw new DepoHatasi(hatalar.map(([ad, m]) => `${ad}: ${m}`).join(' '));
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
export function alanZorunluluklariniDogrula(v) {
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
      const degerli = d.kaynak === 'sabit' || d.kaynak === 'parametre' || d.kaynak === 'tablo' || d.kaynak === 'hesap';
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
export function alanBaglariniDogrula(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"alanBaglari" bir nesne olmalıdır.');
  /** @type {Record<string, Record<string, { tablo: string; sutun: string; etiket?: string; bicim?: string }>>} */
  const s = {};
  for (const [op, alanlar] of Object.entries(v)) {
    if (!alanlar || typeof alanlar !== 'object' || Array.isArray(alanlar)) throw new DepoHatasi(`"${op}" tablo bağlantıları bir nesne olmalıdır.`);
    for (const [yol, b] of Object.entries(alanlar)) {
      if (!ALAN_YOLU.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
      if (!b) continue;
      // Hesaplama kuralı bağı: alan servisin bir kuralından dolar ({ kural: 'BEGIN_DATE' }; tablo bağının yerine).
      if (typeof b === 'object' && typeof b.kural === 'string') {
        if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(b.kural)) throw new DepoHatasi(`"${yol}" için geçersiz kural adı.`);
        (s[op] ??= {})[yol] = { kural: b.kural };
        continue;
      }
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
 * WSDL'i yeniden alıp operasyon listesini ve alan şemalarını günceller (adres değişmez; CANLI ortamda onay HTTP ucunda).
 * @param {Veritabani} vt @param {string} projeId @param {{ servisId: string; ortamId: string }} girdi
 */
export async function semaYenile(vt, projeId, girdi) {
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const ortam = ortamiAl(vt, projeId, girdi.ortamId);
  const adres = servisAdresi(servis.ayarlar, ortam);
  let s;
  try { s = await erisimiDenetle({ adres, tlsDogrulama: servis.ayarlar.tlsDogrulama, yasakDesenleri: etkinYasakDesenleri(vt) }); } catch (e) {
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
 * Erişim kontrolü: WSDL istenir (CANLI ortamda onay HTTP ucunda). Başarılıysa kısa süre geçerli bir "erisimKimligi" döner; yeni servis
 * bu kimlikle kaydedilir.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ortamId: string; yol: string; adresler?: Record<string, string>; tabanlar?: Record<string, string>; tlsDogrulama?: boolean }} girdi
 */
export async function erisimKontrolu(vt, projeId, girdi) {
  const ortam = ortamiAl(vt, projeId, girdi.ortamId);
  const adres = servisAdresi({ yol: yolDogrula(girdi.yol), adresler: adresleriDogrula(girdi.adresler), tabanlar: tabanlariDogrula(girdi.tabanlar) }, ortam);
  try {
    const s = await erisimiDenetle({ adres, tlsDogrulama: girdi.tlsDogrulama, yasakDesenleri: etkinYasakDesenleri(vt) });
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
 *   oturumAkisi?: string | null; tabanGrubu?: string | null; tabanKararlari?: Record<string, import('./taban-adresleri.mjs').TabanKarari> }} girdi
 *   oturumAkisi: senaryolardaki ${akis:…} değerlerini (ör. token) sağlayan oturum akışı (""/null: yok).
 *   tabanKararlari: bağlı olduğu taban adresinden farklı adres yazılıyorsa kullanıcının kararı (yoksa TabanKarariHatasi; taban-adresleri.mjs).
 */
export function servisiKaydet(vt, projeId, girdi) {
  const mevcut = girdi.id ? servisGetir(vt, girdi.id) : undefined;
  if (girdi.id && (!mevcut || mevcut.projeId !== projeId)) throw new DepoHatasi('Servis bulunamadı.');
  const yol = yolDogrula(girdi.yol);
  const adresler = girdi.adresler === undefined && mevcut ? (mevcut.ayarlar.adresler ?? {}) : adresleriDogrula(girdi.adresler);
  const verilen = girdi.tabanlar === undefined && mevcut ? (mevcut.ayarlar.tabanlar ?? {}) : tabanlariDogrula(girdi.tabanlar);
  // Bağlı kaldığı tabandan farklı adres: kullanıcının kararı (bağ değişiyorsa — başka tabana bağlanma / ayrılma — sorulmaz).
  const bagKalir = mevcut?.ayarlar.tabanGrubu && (girdi.tabanGrubu === undefined || girdi.tabanGrubu === mevcut.ayarlar.tabanGrubu);
  const karar = bagKalir && girdi.tabanlar !== undefined
    ? tabanKarari(vt, projeId, { servis: mevcut, tabanlar: verilen, kararlar: girdi.tabanKararlari })
    : { tabanlar: verilen, ayir: false, guncelle: null };
  const tabanlar = karar.tabanlar;
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
  // Adlandırılmış taban adres (null: servise özel adres). Adresleri çağıran taban adresinden verir (servis-uclari.mjs).
  if (girdi.tabanGrubu !== undefined) {
    if (girdi.tabanGrubu) ayarlar.tabanGrubu = girdi.tabanGrubu;
    else delete ayarlar.tabanGrubu;
  }
  if (karar.ayir) delete ayarlar.tabanGrubu;
  kuralBaglariniDenetle(ayarlar);
  // REST servisinde WSDL yoktur: adres değişikliği erişim kontrolü (WSDL isteği) gerektirmez.
  if (adresDegisti && mevcut?.tur !== 'rest') {
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
    tabanKarariUygula(vt, projeId, karar, girdi.yapan);
    tabanlariOrtamlaraKaydet(vt, projeId, tabanlar);
    return servisKaydet(vt, { id: girdi.id, projeId, anahtar: girdi.anahtar, ad: girdi.ad, tur: mevcut?.tur ?? 'soap', durum: girdi.durum, ayarlar, yapan: girdi.yapan });
  });
}

/**
 * Kural bağları servisin kurallarında tanımlı olmalı (kural silinirken bağlı alan varsa açık hata).
 * @param {{ tarihKurallari?: Record<string, string>; alanBaglari?: ServisAyarlari['alanBaglari'] }} ayarlar
 */
export function kuralBaglariniDenetle(ayarlar) {
  const kurallar = ayarlar.tarihKurallari ?? {};
  for (const [op, alanlar] of Object.entries(ayarlar.alanBaglari ?? {})) {
    for (const [yol, b] of Object.entries(alanlar)) {
      if (b?.kural && !Object.hasOwn(kurallar, b.kural)) throw new DepoHatasi(`"${op}" metodunun "${yol}" alanı "${b.kural}" kuralına bağlı ama bu kural tanımlı değil (önce bağı kaldırın ya da kuralı ekleyin).`);
    }
  }
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
  for (const s of servisSenaryolariniListele(vt, servisId)) for (const p of kullanilanParametreler(s.icerik.govde ?? '')) if (!basvuruCoz(p)) kullanim.set(p, (kullanim.get(p) ?? 0) + 1);
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
 * sabit: veri koşusu / tekrar — grup → satır (ve istenirse o koşudaki değerler); verilmezse bugünkü kural (uyan ilk satır).
 * @param {Veritabani} vt @param {string} projeId @param {Servis} servis @param {ServisSenaryoIcerigi} icerik @param {string} ortamId
 * @param {{ tablolar?: import('../tablolar/tablo-deposu.mjs').Tablo[]; satirSecimKipi?: string; sabit?: Record<string, string>; veriler?: Record<string, Record<string, string | null>> }} [ek]
 *   kuru çözüm: hazır (çözülmüş) tablolar, satır seçimi kipi (verilmezse Ayarlar > Koşu); veri koşusu: sabit / veriler
 */
function parametreDegerleri(vt, projeId, servis, icerik, ortamId, ek = {}) {
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
  let tablolar = ek.tablolar ?? null;
  /** Kullanılan tablo satırları (raporda: hangi satırla koştu). @type {Array<{ tablo: string; etiket: string; satir: Record<string, string | null> }>} */
  const kullanilanSatirlar = [];
  // Birden çok satır uyduğunda seçim (Ayarlar > Koşu > Gelişmiş > Tablodan satır seçimi); bu çalıştırmada grubun değerleri aynı satırdan.
  const satirSecimi = {
    ...satirSecimiOlustur(ek.satirSecimKipi ?? (() => { try { return kosuAyarlariniOku(vt).tabloSatirSecimi; } catch { return 'ilk'; } })()),
    ...(ek.sabit ? { sabit: ek.sabit } : {}), ...(ek.veriler ? { veriler: ek.veriler } : {}), kullanilan: new Map()
  };
  for (const ad of adlar) {
    if (tarih[ad]) continue;
    // ${Tablo.Sütun} / ${Tablo[etiket].Sütun}: senaryonun seçimleriyle (ve ortamla) uyan ilk satırdan.
    const b = /[.[]/.test(ad) ? basvuruCoz(ad) : null;
    if (b) {
      tablolar ??= tablolariListele(vt, projeId, { cozulsun: true });
      // Ortak kural (ekran senaryosu koşusuyla aynı): tablo-secimi.mjs > basvuruyuCoz.
      const c = basvuruyuCoz(tablolar, b, icerik.tabloSecimleri, ortamId, satirSecimi);
      if ('deger' in c) {
        const { tablo: t, sutun, satir: r, deger: d } = c;
        // Değerin servis karşılığı tanımlıysa gövdeye o yazılır (ör. EKSPRES → EXPRESS).
        degerler[ad] = servisDegeri(sutun, d);
        if (sutun.gizli) gizliler.push(d);
        if (!kullanilanSatirlar.some((x) => x.tablo === t.ad && x.etiket === b.etiket)) {
          kullanilanSatirlar.push({ tablo: t.ad, etiket: b.etiket, satir: Object.fromEntries(t.sutunlar.filter((x) => !x.gizli).map((x) => [x.ad, r.degerler[x.ad]])) });
        }
        continue;
      }
      if (!c.tabloYok || !/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(ad)) { eksikNedeni[ad] = c.hata; continue; }
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
  // Veri koşusu / tekrar için: kullanılan satırların kimliği, adı, güncellenme zamanı ve açık sütunları (gizli sütunun yalnız adı).
  const satirOzetleri = tablolar ? [...satirSecimi.kullanilan.entries()].map(([g, r]) => {
    const t = /** @type {import('../tablolar/tablo-deposu.mjs').Tablo[]} */ (tablolar).find((x) => x.id === g.split('|')[0]);
    return t ? satirOzeti(g, t, /** @type {any} */ (r)) : null;
  }).filter((x) => x !== null) : [];
  return { degerler, tarihKurallari: tarih, gizliler, eksikNedeni, kimlikProfili, kullanilanSatirlar, satirOzetleri };
}

/**
 * VERİ KOŞULARI (tablolar/veri-kosulari.mjs): tek istekli servis senaryosunun bu ortamdaki veri koşuları — senaryonun gövde / başlık /
 * yolundaki ${Tablo.Sütun} gruplarından ve içerikteki çalıştırma biçiminden (icerik.veriKosulari). Çoklu yoksa kosular boş (bugünkü
 * gibi tek çalıştırma). Akış senaryosunda boş.
 * @param {Veritabani} vt @param {string} projeId @param {{ icerik: any }} s @param {string} ortamId @param {string | null} [kip] koşu anı ezmesi
 */
export function servisVeriKosulari(vt, projeId, s, ortamId, kip = null) {
  const icerik = s.icerik ?? {};
  if (icerik.tur === 'akis') return { kosular: [], hatalar: [], cokluGruplar: [] };
  const metin = [icerik.govde ?? '', ...Object.values(icerik.basliklar ?? {}), icerik.http?.yol ?? ''].join('\n');
  const refler = kullanilanParametreler(metin).map((ad) => (/[.[]/.test(ad) ? basvuruCoz(ad) : null)).filter((b) => b !== null);
  if (!refler.length) return { kosular: [], hatalar: [], cokluGruplar: [] };
  const tablolar = tablolariListele(vt, projeId);
  /** @type {Map<string, { anahtar: string; tablo: any; etiket: string }>} */
  const gruplar = new Map();
  for (const b of refler) {
    const t = tabloBul(tablolar, b.tablo);
    if (!t) continue;
    const anahtar = grupAnahtari(t.id, b.etiket);
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, { anahtar, tablo: t, etiket: b.etiket });
  }
  return veriKosulariniAc(icerik.veriKosulari, { tablolar, gruplar: [...gruplar.values()], ortamId, kip, tabloSecimleri: icerik.tabloSecimleri ?? null });
}

/**
 * Senaryonun bu ortamdaki çalıştırmaları: çoklu değilse tek (bugünkü), çoklu ise her veri koşusu ("Senaryo [ad]"). Bu ortamda
 * koşulacak satır yoksa hata; tek senaryodaki üst sınır (Ayarlar > Koşu) aşılırsa sinirAsildi (koşu başlatılmaz).
 * @param {Veritabani} vt @param {string} projeId @param {{ baslik: string; icerik: any }} s @param {string} ortamId
 * @returns {{ hata: string | null; sinirAsildi: boolean; calistirmalar: Array<{ baslik: string; veriKosusu: { anahtar: string; ad: string; sabit: Record<string, string> } | null }> }}
 */
export function servisCalistirmalari(vt, projeId, s, ortamId) {
  const r = servisVeriKosulari(vt, projeId, s, ortamId);
  if (r.hatalar.length) return { hata: r.hatalar.join(' '), sinirAsildi: false, calistirmalar: [] };
  const sinir = (() => { try { return kosuAyarlariniOku(vt).enCokVeriKosusu; } catch { return 50; } })();
  if (r.kosular.length > sinir) {
    return { hata: `"${s.baslik}" bu ortamda ${r.kosular.length} veri koşusu çıkarıyor; tek senaryoda en çok ${sinir} olabilir (Ayarlar > Koşu). Senaryonun satır seçimini daraltın.`, sinirAsildi: true, calistirmalar: [] };
  }
  if (!r.kosular.length) return { hata: null, sinirAsildi: false, calistirmalar: [{ baslik: s.baslik, veriKosusu: null }] };
  return { hata: null, sinirAsildi: false, calistirmalar: r.kosular.map((k) => ({ baslik: `${s.baslik} [${k.ad}]`, veriKosusu: { anahtar: k.anahtar, ad: k.ad, sabit: k.satirlar } })) };
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
 * onay verilmezse yalnız ne yapılacağı (ve tablo değer değişikliğinin senaryolara etkisi) döner.
 * @param {Veritabani} vt @param {string} projeId @param {{ ad: string; onay?: boolean; guncellenecekler?: unknown; beklenenImza?: unknown }} girdi
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean }} [secenekler]
 */
export function girisProfiliniTestVerisineTasi(vt, projeId, girdi, secenekler = {}) {
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
  // Tablo değer değişikliği (aynı adlı profil varsa değerleri üzerine yazılır; tablolar/tablo-etkisi.mjs): önizlemede etki (hiçbir
  // şey yazılmaz), onayda guncellenecekler verilirse taşıma + seçili senaryolar tek işlemde; verilmezse etkilenen varsa onay istenir.
  const guncellenecekler = Array.isArray(girdi.guncellenecekler) ? girdi.guncellenecekler : undefined;
  const calistir = () => etkiDenetimiyle(vt, { ...secenekler, etki: !girdi.onay ? 'onizle' : guncellenecekler ? 'uygula' : 'denetle', guncellenecekler, beklenenImza: girdi.beklenenImza },
    (y) => y.izle(projeId, mevcutTur?.id, () => tasi()));
  if (!girdi.onay) {
    // Önizleme eskisi gibi yalnız planı gösterebilmeli: deneme yazımı hata verirse etki boş döner (hata onayda görünür).
    let etki = { degisiklikler: [], etkilenenler: [], karsiliklar: [] };
    try { etki = calistir().etki; } catch (e) { if (!(e instanceof DepoHatasi)) throw e; }
    return { onizleme: { ...plan, etki } };
  }
  const r = calistir();
  if (r.onayGerekli) return { onayGerekli: true, ...(r.farkli ? { farkli: true } : {}), etki: r.etki };
  return { .../** @type {ReturnType<typeof tasi>} */ (r.sonuc), etki: r.etki, ...(r.guncelleme ? { guncelleme: r.guncelleme } : {}) };

  function tasi() {
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
    return { tasindi: /** @type {const} */ (true), ...plan, turId, profilId: genelId };
  }
}

// ---------------------------------------------------------------------------------------
// SoapUI aktarımı: yeni bağlama modeli (tablo sütunları + alan bağları + hesaplama kuralı önerileri) soapui-aktarimi.mjs'te.
// Eski eşleme (veriProfilleri) aktarımda yazılmaz; koşuda parametreDegerleri geriye uyum için okur.
// ---------------------------------------------------------------------------------------

export { eskiParametreleriDonustur, soapuiAktar, soapuiOnizle } from './soapui-aktarimi.mjs';

// ---------------------------------------------------------------------------------------
// Postman aktarımı (REST)
// ---------------------------------------------------------------------------------------

/** Tablo / sütun adında kullanılamayan karakterler ("." "[" "]" "{" "}" "$" "<" ">" "&" "|" ve denetim karakterleri) → "_". @param {string} ad */
const tabloAdiTemizle = (ad) => ad.replace(/[.[\]{}$<>&|\u0000-\u001f]/g, '_').trim().slice(0, 60);
/** Akış değeri adı: harf / "_" ile başlar; harf, rakam, "_", "-". @param {string} ad */
const akisAdiTemizle = (ad) => (ad.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^([^A-Za-z_])/, '_$1')).slice(0, 60);

/**
 * Önizleme: koleksiyonun klasörleri (→ servisler), istekler, değişkenler (gizli olanların DEĞERİ dönmez), taban adres adayları.
 * Hiçbir şey yazılmaz, ağ isteği yok.
 * @param {Veritabani} vt @param {string} projeId @param {{ koleksiyon: string; ortam?: string }} girdi
 */
export function postmanOnizle(vt, projeId, girdi) {
  const c = postmanCozumle(girdi.koleksiyon, { ...(girdi.ortam ? { ortamMetni: girdi.ortam } : {}), ekGizliAdlar: ekGizliAdlar(vt) });
  const mevcut = new Map(servisleriListele(vt, projeId).map((s) => [s.anahtar, s]));
  const o = postmanOzeti(c);
  return {
    ...o,
    klasorler: o.klasorler.map((kl) => {
      const s = mevcut.get(kl.anahtar);
      return { ...kl, mevcutServis: s ? { id: s.id, ad: s.ad, tur: s.tur } : null };
    }),
    varsayilanTabloAdi: tabloAdiTemizle(`Postman ${c.koleksiyon}`),
    tablolar: tablolariListele(vt, projeId).map((t) => t.ad)
  };
}

/**
 * Aktarım (kullanıcının önizlemedeki seçimleriyle):
 * - klasorler: içe alınacak klasör anahtarları; her biri bir REST servisi (aynı anahtarlı REST servisi varsa senaryolar ona eklenir;
 *   aynı başlıklı senaryo atlanır; aynı anahtarlı SOAP servisi varsa hata).
 * - Değişkenler bir test verisi tablosunun sütunları olur (tabloAdi; varsa sütunlar eklenir); değerler tek satıra yazılır
 *   (degerOrtami: satırın ortamı, boş = tüm ortamlar). Şablonda {{ad}} → ${Tablo.ad}.
 * - gizliler: gizli sütun olacak değişkenler (verilmezse dosyadaki / addan gelen varsayılan). Gizli değer YALNIZ sifreliKaydet'te
 *   adı varsa şifreli sütuna yazılır; değilse boş kalır (koşudan önce tabloda doldurulur).
 * - akisDegiskenleri: tabloya değil akış değerine (${akis:ad}) çevrilecek değişkenler (ör. betikle / oturum akışıyla alınan token).
 * - tabanOrtami: verilirse klasörün adres kökeni o ortamda servisin taban adresi olur (ortamın adres listesine de eklenir).
 * Ağ isteği atılmaz (REST servisinde WSDL / erişim kontrolü yok).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ koleksiyon: string; ortam?: string; klasorler: string[]; tabloAdi?: string; gizliler?: string[]; sifreliKaydet?: string[];
 *   akisDegiskenleri?: string[]; degerOrtami?: string | null; tabanOrtami?: string | null; kapsam?: 'test' | 'canli' | 'ikisi';
 *   mevcutDegerleriKoru?: boolean; etki?: unknown; guncellenecekler?: unknown; beklenenImza?: unknown; yapan?: string;
 *   tabanKararlari?: Record<string, import('./taban-adresleri.mjs').TabanKarari> }} girdi
 * - etki: 'onizle' → aktarım denenir ve geri alınır, yalnız etki döner; 'uygula' + beklenenImza: etki değiştiyse yazılmaz (farkli).
 * - tabanKararlari: var olan servis bir taban adresine bağlıysa ve koleksiyondaki köken farklıysa kullanıcının kararı (yoksa
 *   TabanKarariHatasi; hiçbir şey yazılmaz). Vazgeç: servisin adresi değişmez, istekler / senaryolar yine aktarılır.
 * - Tablo değer değişikliği (tablolar/tablo-etkisi.mjs): var olan satırın değeri değişiyorsa etki: 'denetle' iken etkilenen senaryo
 *   varsa HİÇBİR ŞEY yazılmaz, { onayGerekli, etki } döner; 'uygula' + guncellenecekler ile aktarım ve seçili senaryo güncellemeleri
 *   tek işlemde yazılır. mevcutDegerleriKoru: var olan satırda dolu hücrenin üzerine yazılmaz.
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean }} [secenekler]
 */
export function postmanAktar(vt, projeId, girdi, secenekler = {}) {
  const r = etkiDenetimiyle(vt, { ...secenekler, etki: girdi.etki, guncellenecekler: girdi.guncellenecekler, beklenenImza: girdi.beklenenImza, yapan: girdi.yapan },
    (y) => postmanAktarimi(vt, projeId, girdi, y));
  // Önizleme: aktarım geri alınır, yalnız tablo değişikliği etkisi döner. Onay / fark: hiçbir şey yazılmadı.
  if (girdi.etki === 'onizle') return { onizleme: true, etki: r.etki };
  if (r.onayGerekli) return { onayGerekli: true, ...(r.farkli ? { farkli: true } : {}), etki: r.etki };
  return { .../** @type {ReturnType<typeof postmanAktarimi>} */ (r.sonuc), etki: r.etki, ...(r.guncelleme ? { guncelleme: r.guncelleme } : {}) };
}

/**
 * @param {Veritabani} vt @param {string} projeId @param {Parameters<typeof postmanAktar>[2]} girdi
 * @param {import('../tablolar/tablo-etkisi.mjs').EtkiliYazici} yazici
 */
function postmanAktarimi(vt, projeId, girdi, yazici) {
  const c = postmanCozumle(girdi.koleksiyon, { ...(girdi.ortam ? { ortamMetni: girdi.ortam } : {}), ekGizliAdlar: ekGizliAdlar(vt) });
  const secilen = c.klasorler.filter((kl) => girdi.klasorler.includes(kl.anahtar));
  if (!secilen.length) throw new DepoHatasi('En az bir klasör (servis) seçin.');
  if (girdi.degerOrtami) ortamiAl(vt, projeId, girdi.degerOrtami);
  if (girdi.tabanOrtami) ortamiAl(vt, projeId, girdi.tabanOrtami);
  const degiskenler = new Map(c.degiskenler.map((v) => [v.ad, v]));
  const gizliler = new Set(girdi.gizliler ?? c.degiskenler.filter((v) => v.gizli).map((v) => v.ad));
  const sifreli = new Set(girdi.sifreliKaydet ?? []);
  const akis = new Set(girdi.akisDegiskenleri ?? []);
  // Seçilen isteklerde geçen değişkenler (sırayla).
  /** @type {string[]} */
  const kullanilan = [];
  for (const kl of secilen) {
    for (const i of kl.istekler) for (const ad of sablonDegiskenleri([i.yol, i.govde, ...Object.values(i.basliklar)].join('\n'))) if (!kullanilan.includes(ad)) kullanilan.push(ad);
  }
  const tabloya = kullanilan.filter((ad) => !akis.has(ad));
  const tabloAdi = tabloAdiTemizle(girdi.tabloAdi || `Postman ${c.koleksiyon}`);
  if (tabloya.length && !tabloAdi) throw new DepoHatasi('Tablo adı boş olamaz.');
  /** Değişken → sütun adı (tekil). @type {Map<string, string>} */
  const sutunAdi = new Map();
  for (const ad of tabloya) {
    const temel = tabloAdiTemizle(ad) || 'deger';
    let s = temel;
    for (let n = 2; [...sutunAdi.values()].some((x) => x.toLocaleLowerCase('tr') === s.toLocaleLowerCase('tr')); n++) s = `${temel.slice(0, 56)}_${n}`;
    sutunAdi.set(ad, s);
  }
  /** @param {string} s */
  const cevir = (s) => sablonCevir(s, (ad) => (akis.has(ad) ? `\${akis:${akisAdiTemizle(ad)}}` : sutunAdi.has(ad) ? `\${${basvuru(tabloAdi, /** @type {string} */ (sutunAdi.get(ad)))}}` : undefined));

  return vt.islem(() => {
    // --- Değişken tablosu ---
    /** @type {{ ad: string; yeni: boolean; sutunSayisi: number; sifreliYazilan: string[]; bosBirakilan: string[] } | null} */
    let tabloOzeti = null;
    if (tabloya.length) {
      const tablolar = tablolariListele(vt, projeId);
      const mevcut = tablolar.find((t) => t.ad.toLocaleLowerCase('tr') === tabloAdi.toLocaleLowerCase('tr'));
      const eskiSutunlar = mevcut ? mevcut.sutunlar.map((x) => ({ ad: x.ad, eskiAd: x.ad, gizli: x.gizli })) : [];
      const yeniSutunlar = tabloya.map((ad) => /** @type {string} */ (sutunAdi.get(ad)))
        .filter((s) => !eskiSutunlar.some((x) => x.ad.toLocaleLowerCase('tr') === s.toLocaleLowerCase('tr')))
        .map((s) => ({ ad: s, gizli: gizliler.has(/** @type {string} */ ([...sutunAdi].find(([, v]) => v === s)?.[0])) }));
      /** @type {Record<string, string>} */
      const degerler = {};
      /** @type {string[]} */
      const sifreliYazilan = [];
      /** @type {string[]} */
      const bosBirakilan = [];
      const ortamId = girdi.degerOrtami || null;
      const satir = mevcut?.satirlar.find((r) => (r.ortamId ?? null) === ortamId);
      for (const ad of tabloya) {
        const d = degiskenler.get(ad)?.deger ?? '';
        const sutun = /** @type {string} */ (sutunAdi.get(ad));
        const var_ = mevcut?.sutunlar.find((x) => x.ad.toLocaleLowerCase('tr') === sutun.toLocaleLowerCase('tr'));
        const gizliSutun = var_?.gizli ?? gizliler.has(ad);
        // Mevcut değeri koru: satırdaki dolu hücre aynen kalır (gizli: kayıtlı değer; açık: aynı değer yeniden yazılır).
        if (girdi.mevcutDegerleriKoru && satir && var_) {
          const eski = satir.degerler[var_.ad];
          if (satir.doluGizli.includes(var_.ad)) continue;
          if (eski !== null && eski !== undefined && eski !== '') { degerler[sutun] = eski; continue; }
        }
        if (gizliSutun) {
          // Gizli değer yalnız kullanıcı onayladıysa (şifreli sütuna); onay yoksa satıra hiç yazılmaz (boş kalır / mevcut korunur).
          if (sifreli.has(ad) && d) { degerler[sutun] = d; sifreliYazilan.push(ad); } else bosBirakilan.push(ad);
        } else degerler[sutun] = d;
      }
      yazici.tabloKaydet({
        projeId, ...(mevcut ? { id: mevcut.id } : {}), ad: mevcut?.ad ?? tabloAdi, sutunlar: [...eskiSutunlar, ...yeniSutunlar],
        satirlar: [{ ...(satir ? { id: satir.id } : {}), ortamId, degerler }], ortamVar: (id) => Boolean(ortamGetir(vt, id))
      });
      tabloOzeti = { ad: mevcut?.ad ?? tabloAdi, yeni: !mevcut, sutunSayisi: tabloya.length, sifreliYazilan, bosBirakilan };
    }

    // --- Servisler ve senaryolar ---
    const servisOzetleri = [];
    for (const kl of secilen) {
      const istekler = kl.istekler.map((i) => ({ ...i, yol: cevir(i.yol), govde: cevir(i.govde), basliklar: Object.fromEntries(Object.entries(i.basliklar).map(([a, v]) => [a, cevir(v)])) }));
      const mevcut = servisleriListele(vt, projeId).find((s) => s.anahtar === kl.anahtar);
      if (mevcut && mevcut.tur !== 'rest') throw new DepoHatasi(`"${kl.anahtar}" anahtarlı bir SOAP servisi var; klasörü içe almak için önce o servisin anahtarını değiştirin.`);
      const yol = mevcut?.ayarlar.yol ?? ortakYol(istekler.map((i) => i.yol));
      /** @param {string} tam */
      const goreli = (tam) => {
        const y = yol === '/' ? tam : tam.startsWith(yol) ? tam.slice(yol.length) : tam;
        return y && !/^[/?]/.test(y) ? `/${y}` : y;
      };
      const koken = istekler.map((i) => i.koken).find(Boolean);
      // Taban adresine bağlı servisin adresi değişecekse kullanıcının kararı (Vazgeç: adres değişmez, diğer içerik yine aktarılır).
      // Yalnız etki hesabında (onizle) sorulmaz; yeni adres yok sayılır.
      const karar = tabanKarari(vt, projeId, {
        servis: mevcut, tabanlar: { ...(mevcut?.ayarlar.tabanlar ?? {}), ...(girdi.tabanOrtami && koken ? { [girdi.tabanOrtami]: koken } : {}) },
        kararlar: girdi.tabanKararlari, onizleme: girdi.etki === 'onizle'
      });
      tabanKarariUygula(vt, projeId, karar, girdi.yapan);
      const tabanlar = karar.tabanlar;
      /** @type {import('./servis-deposu.mjs').ServisOperasyonu[]} */
      const operasyonlar = [...(mevcut?.ayarlar.operasyonlar ?? [])];
      for (const i of istekler) {
        if (!operasyonlar.some((o) => o.ad === i.operasyon)) operasyonlar.push({ ad: i.operasyon, metot: i.metot, yol: goreli(i.yol.split('?')[0]) });
      }
      if (Object.keys(tabanlar).length) tabanlariOrtamlaraKaydet(vt, projeId, tabanlariDogrula(tabanlar));
      const servisId = servisKaydet(vt, {
        ...(mevcut ? { id: mevcut.id } : {}), projeId, anahtar: kl.anahtar, ad: mevcut?.ad ?? kl.ad, tur: 'rest', yapan: girdi.yapan,
        ayarlar: { ...(mevcut?.ayarlar ?? {}), yol: yolDogrula(yol), adresler: mevcut?.ayarlar.adresler ?? {}, ...(Object.keys(tabanlar).length ? { tabanlar } : {}), operasyonlar,
          ...(karar.ayir ? { tabanGrubu: undefined } : {}) }
      });
      const basliklar = new Set(servisSenaryolariniListele(vt, servisId).map((x) => x.baslik));
      let eklenen = 0;
      /** @type {string[]} */
      const atlanan = [];
      for (const i of istekler) {
        if (basliklar.has(i.baslik)) { atlanan.push(i.baslik); continue; }
        servisSenaryosuKaydet(vt, {
          projeId, servisId, baslik: i.baslik, kapsam: girdi.kapsam ?? 'test', yapan: girdi.yapan,
          icerik: {
            operasyon: i.operasyon, govde: i.govde, kontroller: i.kontroller, kaynak: i.kaynak,
            http: { metot: i.metot, yol: goreli(i.yol), ...(i.icerikTuru ? { icerikTuru: i.icerikTuru } : {}) },
            ...(Object.keys(i.basliklar).length ? { basliklar: i.basliklar } : {}), ...(i.uyarilar.length ? { aciklama: i.uyarilar.join(' ') } : {})
          }
        });
        basliklar.add(i.baslik);
        eklenen++;
      }
      servisOzetleri.push({ servisId, anahtar: kl.anahtar, ad: mevcut?.ad ?? kl.ad, yeniServis: !mevcut, yol, eklenen, atlanan });
    }
    return { servisler: servisOzetleri, tablo: tabloOzeti, akisDegerleri: kullanilan.filter((ad) => akis.has(ad)).map(akisAdiTemizle) };
  });
}

// ---------------------------------------------------------------------------------------
// Deneme ve koşu
// ---------------------------------------------------------------------------------------

/**
 * Oturum sağlayıcı (servis-akislari.mjs kaydeder): servise atanan oturum akışının değerleri (token). Önbellekte geçerliyse
 * yeniden kullanılır (durum "onbellek"), yoksa ya da yenile ile oturum akışı koşulur (durum "alindi"). Eşzamanlı istekler tek
 * oturum alımında buluşur; gorulenSurum: yenilemede, isteğin kullandığı oturum sürümü (başka senaryo zaten yenilediyse yenisi döner).
 * @typedef {(vt: Veritabani, projeId: string, akisId: string, ortamId: string, s: { yenile?: boolean; sinyal?: AbortSignal; gorulenSurum?: number }) =>
 *   Promise<{ degerler: Record<string, string>; gizliler: string[]; baslik: string; durum: 'alindi' | 'onbellek'; surum?: number }>} OturumSaglayici
 */
/** @type {OturumSaglayici | null} */
let oturumSaglayici = null;
/** @param {OturumSaglayici | null} fn */
export function oturumSaglayicisiAyarla(fn) { oturumSaglayici = fn; }

/**
 * Akış senaryosu kancası (akis-senaryosu.mjs kaydeder): içeriği tur 'akis' olan senaryo akış motoruyla koşar; bir servisin toplu
 * koşusu, akışı o servisten geçen (başka serviste kayıtlı) akış senaryolarını da içerir.
 * @typedef {{ kos: (vt: Veritabani, projeId: string, girdi: any) => Promise<any>; gecenler: (vt: Veritabani, projeId: string, servisId: string) => any[];
 *   atlamaNedeni: (vt: Veritabani, senaryo: any, ortam: any) => string }} AkisSenaryoKancasi
 */
/** @type {AkisSenaryoKancasi | null} */
let akisSenaryoKancasi = null;
/** @param {AkisSenaryoKancasi | null} k */
export function akisSenaryoKancasiAyarla(k) { akisSenaryoKancasi = k; }
/** Kayıtlı kanca (servis-isleri.mjs kullanır). */
export const akisSenaryoKancasiAl = () => akisSenaryoKancasi;

/**
 * Tek bir senaryoyu (kayıtlı ya da taslak) bir ortamda çalıştırır ve sonucu servis koşuları tablosuna yazar.
 * tur 'dene': her ortamda (CANLI'da onay HTTP ucunda); kapsam denetlenmez. tur 'kosu': kapsam ortam türüyle uyuşmalı.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId: string; ortamId: string; tur: 'dene' | 'kosu'; senaryoId?: string; taslak?: { baslik?: string; kapsam?: 'test' | 'canli' | 'ikisi'; icerik: unknown };
 *   zamanAsimiMs?: number; simdi?: Date; sinyal?: AbortSignal;
 *   olay?: (adim: 'hazirlik' | 'gonderim' | 'yanit' | 'kontroller', durum: 'basladi' | 'tamam' | 'hata', bilgi?: Record<string, unknown>) => void;
 *   akisDegerleri?: Record<string, string>; ekGizliler?: string[]; okumalar?: AkisOkumasi[]; akis?: Record<string, unknown>;
 *   acikDegerler?: (d: { okunan: Record<string, string>; gizliler: string[] }) => void; oturumYenile?: boolean; oturumSurumu?: number;
 *   yetkiTekrari?: { ilkDurumKodu: number; not: string };
 *   yetkiYenile?: () => Promise<{ akisDegerleri: Record<string, string>; gizliler: string[] } | null>;
 *   veriKosusu?: { anahtar: string | null; ad: string | null; sabit?: Record<string, string>; veriler?: Record<string, Record<string, string | null>> }; tekrarKaynagi?: string }} girdi
 *   veriKosusu: tablodan çoklu satırla koşuda bu çalıştırmanın satırları (başlık "Senaryo [ad]"); tekrarKaynagi: başarısızları tekrar
 *   çalıştırmada önceki koşu (kayda "Tekrar:" bağı olarak yazılır).
 *   oturumYenile: oturum akışı önbelleği yok sayılıp yeniden koşulur (401 / 403 sonrası iç kullanım).
 *   yetkiTekrari: bu çalıştırma 401 / 403 sonrası tekrardır (iç kullanım; raporda not). yetkiYenile: akıştaki token adımını yeniden
 *   çalıştırıp yeni akış değerlerini veren geri çağırma (akış motoru, yalnız kullanıcı "Token'ı yenile, bir kez tekrar dene" seçtiyse verir).
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
  // Akış senaryosu: akış motoru koşar (akis-senaryosu.mjs); akışın geçtiği her servisten çalıştırılabilir.
  const hamIcerik = /** @type {any} */ (kayitli ? kayitli.icerik : girdi.taslak?.icerik);
  if (hamIcerik && typeof hamIcerik === 'object' && hamIcerik.tur === 'akis') {
    if (!akisSenaryoKancasi) throw new DepoHatasi('Akış senaryosu bu süreçte koşulamaz (akış motoru yüklü değil).');
    if (kayitli && kayitli.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
    return akisSenaryoKancasi.kos(vt, projeId, { ...girdi, servis, kayitli });
  }
  if (girdi.senaryoId && (!kayitli || kayitli.servisId !== servis.id)) throw new DepoHatasi('Senaryo bulunamadı.');
  if (!kayitli && !girdi.taslak) throw new DepoHatasi('"senaryoId" ya da "taslak" gerekli.');
  const icerik = kayitli ? kayitli.icerik : senaryoIceriginiDogrula(girdi.taslak?.icerik);
  const temelBaslik = kayitli?.baslik ?? girdi.taslak?.baslik ?? 'Taslak';
  const baslik = girdi.veriKosusu?.ad ? `${temelBaslik} [${girdi.veriKosusu.ad}]` : temelBaslik;
  const kapsam = kayitli?.kapsam ?? girdi.taslak?.kapsam ?? 'test';
  if (girdi.tur === 'kosu' && kapsam !== 'ikisi' && kapsam !== tur) throw new DepoHatasi(`Bu senaryo yalnızca ${kapsam === 'test' ? 'test' : 'canlı'} ortamda koşar.`);
  if (tur === 'canli' && (servis.ayarlar.yalnizTestOperasyonlari ?? []).includes(icerik.operasyon)) {
    throw new DepoHatasi(`"${icerik.operasyon}" operasyonu yalnız test ortamında koşar (servis ayarı).`);
  }
  const opTanimi = servis.ayarlar.operasyonlar?.find((o) => o.ad === icerik.operasyon);
  const eylem = opTanimi?.eylem;
  // REST: istek tanımı senaryoda (icerik.http); yoksa operasyonun metodu + yolu.
  const rest = servis.tur === 'rest';
  const http = rest ? (icerik.http ?? (opTanimi?.metot ? { metot: opTanimi.metot, yol: opTanimi.yol ?? '' } : undefined)) : undefined;
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
  /** Kullanılan oturumun sürümü (401 / 403 sonrası yenilemede eşzamanlı senaryolar oturumu bir kez yeniler). @type {number | undefined} */
  let kullanilanOturumSurumu;
  /** @type {Record<string, string>} Yanıttan okunan açık değerler (kayda yazılmaz). */
  const okunan = {};
  /** @type {Record<string, unknown>} */
  const sonuc = { operasyon: icerik.operasyon, ortam: ortam.ad, ortamTuru: tur, ...(girdi.akis ? { akis: girdi.akis } : {}), ...(girdi.yetkiTekrari ? { yetkiTekrari: girdi.yetkiTekrari } : {}),
    ...(girdi.tekrarKaynagi ? { tekrarKaynagi: girdi.tekrarKaynagi } : {}) };
  /** @type {'basarili' | 'basarisiz' | 'hata'} */
  let durum = 'hata';
  /** @type {'hazirlik' | 'gonderim' | 'yanit' | 'kontroller'} */
  let adim = 'hazirlik';
  try {
    olay('hazirlik', 'basladi');
    if (rest && !http) throw new DepoHatasi('REST senaryosunda HTTP metodu / yolu tanımlı değil.');
    const servisAdr = servisAdresi(servis.ayarlar, ortam);
    let adres = servisAdr;
    sonuc.adres = adres;
    if (http) sonuc.metot = http.metot;
    // ${akis:…} değeri verilmemişse ve servise oturum akışı atanmışsa değerler (ör. token) oturumdan: önbellekte geçerliyse
    // yeniden kullanılır, yoksa oturum akışı koşulur.
    const basliklarHam = icerik.basliklar ?? {};
    const gereken = kullanilanAkisDegerleri([icerik.govde, ...Object.values(basliklarHam), JSON.stringify(icerik.kontroller), http?.yol ?? ''].join('\n'))
      .filter((a) => akisDegerleri?.[a] === undefined);
    if (gereken.length && servis.ayarlar.oturumAkisi && oturumSaglayici) {
      const o = await oturumSaglayici(vt, projeId, servis.ayarlar.oturumAkisi, ortam.id, { yenile: girdi.oturumYenile === true, sinyal: girdi.sinyal,
        ...(girdi.oturumSurumu !== undefined ? { gorulenSurum: girdi.oturumSurumu } : {}) });
      kullanilanOturumSurumu = o.surum;
      akisDegerleri = { ...o.degerler, ...(akisDegerleri ?? {}) };
      gizliler = [...gizliler, ...o.gizliler];
      sonuc.oturum = { akis: o.baslik, durum: girdi.oturumYenile ? 'yenilendi' : o.durum };
      oturumKullanildi = true;
    }
    // Başlıklardaki ${Tablo.Sütun} de gövdedekilerle birlikte çözülür.
    const hamMetin = [icerik.govde, ...Object.values(basliklarHam), http?.yol ?? ''].join('\n');
    const kurallar = servis.ayarlar.tarihKurallari ?? {};
    const kuralRefleri = kuralParametreleri(kullanilanParametreler(hamMetin).filter((a) => Object.hasOwn(kurallar, a)), kurallar).refler.map((r) => `\${${r}}`);
    // Dosya kontrollerinin beklentilerindeki ${Parametre} / ${Tablo.Sütun} başvuruları da aynı kurallarla çözülür.
    const dosyaMetinleri = icerik.kontroller.flatMap((k) => (k.tur === 'dosya' ? tanimMetinleri(k.dosya) : []));
    const p = parametreDegerleri(vt, projeId, servis, { ...icerik, govde: [hamMetin, ...kuralRefleri, ...dosyaMetinleri].join('\n') }, ortam.id,
      girdi.veriKosusu?.sabit ? { sabit: girdi.veriKosusu.sabit, ...(girdi.veriKosusu.veriler ? { veriler: girdi.veriKosusu.veriler } : {}) } : {});
    gizliler = [...gizliler, ...p.gizliler];
    if (p.kimlikProfili) sonuc.kimlikProfili = p.kimlikProfili;
    if (p.kullanilanSatirlar.length) sonuc.tabloSatirlari = p.kullanilanSatirlar;
    // Veri koşusu (anahtar / ad) ve kullanılan satırların kimlikleri: sonuç ekranı ve başarısızları tekrar çalıştırma için.
    if (p.satirOzetleri.length || girdi.veriKosusu?.anahtar) sonuc.veriKosusu = { anahtar: girdi.veriKosusu?.anahtar ?? null, ad: girdi.veriKosusu?.ad ?? null, satirlar: p.satirOzetleri };
    // Aynı "şimdi" ve önbellek gövde / yol / başlık doldurmalarında paylaşılır: zincirli kurallar aynı anı temel alır.
    const doldurma = {
      degerler: p.degerler, tarihKurallari: p.tarihKurallari, simdi: girdi.simdi ?? baslangic, tarihOnbellegi: new Map(), gizliler, eksikAciklamasi: (/** @type {string} */ ad) => p.eksikNedeni[ad] ?? 'tanımsız',
      akisDegerleri, varsayilanTarihBicimi: kosu.tarihBicimi
    };
    // REST: gövde değerleri içerik türüne göre kaçışlanır (JSON / form / XML); yol değerleri URL kodlanır.
    const govde = yerTutuculariDoldur(icerik.govde, http ? { ...doldurma, kacis: govdeKacisi(http.icerikTuru) } : doldurma);
    if (http) {
      adres = adresBirlestirRest(servisAdr, yerTutuculariDoldur(http.yol, { ...doldurma, kacis: 'url' }));
      sonuc.adres = gizlileriMaskele(adres, gizliler);
    }
    const ekBasliklar = Object.fromEntries(Object.entries(basliklarHam).map(([a, d]) => [a, yerTutuculariDoldur(d, { ...doldurma, kacis: /** @type {const} */ ('baslik') })]));
    sonuc.istek = gizlileriMaskele(govde, gizliler);
    if (Object.keys(ekBasliklar).length) sonuc.istekBasliklari = basliklariMaskele(ekBasliklar, gizliler, ekAdlar);
    olay('hazirlik', 'tamam', { adres: sonuc.adres, istek: sonuc.istek });
    adim = 'gonderim';
    olay('gonderim', 'basladi');
    if (girdi.sinyal?.aborted) throw new ServisHatasi('Kullanıcı durdurdu.');
    const ortak = {
      adres, govde, zamanAsimiMs: girdi.zamanAsimiMs ?? kosu.servisZamanAsimiSn * 1000, tlsDogrulama: servis.ayarlar.tlsDogrulama, sinyal: girdi.sinyal,
      // Yasak adresler (Ayarlar > Güvenlik + ortam değişkeni): host uyuyorsa istek gönderilmez (servis koşusu, Dene, akışlar).
      yasakDesenleri: etkinYasakDesenleri(vt),
      ekBasliklar, gonderildi: () => { olay('gonderim', 'tamam'); adim = 'yanit'; olay('yanit', 'basladi'); }
    };
    const yanit = http
      ? await restIstegi({ ...ortak, metot: http.metot, ...(http.icerikTuru ? { icerikTuru: http.icerikTuru } : {}) })
      : await soapIstegi({ ...ortak, eylem, soapSurumu: servis.ayarlar.soapSurumu });
    // Yetki hatası (YALNIZ HTTP 401 / 403): kullanıcının seçimi (akışın "Yetki hatasında" ayarı; seçilmediyse Ayarlar > Koşu) "Token'ı
    // yenile, bir kez tekrar dene" ise oturum akışı / akıştaki token adımı yeniden çalışır ve istek BİR KEZ tekrarlanır. İlk deneme
    // ayrı sonuç olarak kaydedilmez; tekrarın sonucunda not olarak görünür. İkinci deneme de reddedilirse sonuç olduğu gibi değerlendirilir.
    const yetkiHatasi = yanit.durumKodu === 401 || yanit.durumKodu === 403;
    if (yetkiHatasi && girdi.yetkiTekrari) {
      sonuc.yetkiTekrari = { ...girdi.yetkiTekrari, ikinciDurumKodu: yanit.durumKodu, not: `${girdi.yetkiTekrari.not}; tekrar da ${yanit.durumKodu} döndü` };
    }
    if (yetkiHatasi && !girdi.yetkiTekrari) {
      const not = `${yanit.durumKodu} alındı, token yenilendi, tekrar denendi`;
      if (oturumKullanildi && servis.ayarlar.oturumAkisi && yetkiTekrariAcik(vt, servisAkisiGetir(vt, servis.ayarlar.oturumAkisi))) {
        return await servisSenaryosuCalistir(vt, projeId, { ...girdi, oturumYenile: true, ...(kullanilanOturumSurumu !== undefined ? { oturumSurumu: kullanilanOturumSurumu } : {}),
          yetkiTekrari: { ilkDurumKodu: yanit.durumKodu, not } });
      }
      const yeni = girdi.yetkiYenile ? await girdi.yetkiYenile() : null;
      if (yeni) {
        return await servisSenaryosuCalistir(vt, projeId, {
          ...girdi, akisDegerleri: yeni.akisDegerleri, ekGizliler: [...(girdi.ekGizliler ?? []), ...yeni.gizliler], yetkiTekrari: { ilkDurumKodu: yanit.durumKodu, not }
        });
      }
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
    // Dosya kontrolü olan senaryoda ikili yanıt (XLSX / PDF…) metin olarak gösterilmez / saklanmaz (yalnız özet).
    const dosyaVar = icerik.kontroller.some((k) => k.tur === 'dosya');
    const ikiliYanit = dosyaVar && ikiliMi(yanit.ham ?? Buffer.from(yanit.govde, 'utf8'));
    const gosterilecekYanit = ikiliYanit ? `(ikili dosya yanıtı: ${yanitDosyaAdi(yanit.basliklar, adres)}, ${(yanit.ham ?? Buffer.alloc(0)).length} bayt — içerik metin olarak saklanmaz)` : yanit.govde;
    olay('yanit', 'tamam', { durumKodu: yanit.durumKodu, sureMs: yanit.sureMs, yanit: gizlileriMaskele(gosterilecekYanit.slice(0, 20_000), gizliler) });
    // Kontrol değerlerinde ${akis:Ad} (ör. yanıttaki SiparisNo = önceki adımda okunan) çözülür.
    const kontrolListesi = akisDegerleri ? akisKontrolleriniCoz(icerik.kontroller, akisDegerleri) : icerik.kontroller;
    /** @type {Array<Record<string, unknown>>} */
    const dosyaEkleri = [];
    const indirilenDosya = kosu.indirilenDosya;
    const kontroller = [...kontrolleriDegerlendir(yanit, kontrolListesi, dosyaVar ? {
      // Dosya dış veridir: bu çalıştırmanın gizlileri + projedeki gizli tablo sütunlarının tüm değerleri kesitlerde maskelenir.
      adres, gizliler: [...gizliler, ...gizliTabloDegerleri(vt, projeId)], ekGizliAdlar: ekAdlar,
      // Beklentilerdeki başvurular: ${akis:Ad}, ${Parametre}, ${Tablo.Sütun}, ${tarih:…} — gövdeyle aynı kural; çözülemeyen → undefined.
      coz: (ifade) => {
        try { return yerTutuculariDoldur(`\${${ifade}}`, { ...doldurma, kacis: 'yok' }); } catch { return undefined; }
      },
      // Dosyanın kendisi yalnız Ayarlar > Koşu > Kayıt > "Doğrulanan dosya" izin verirse (şifreli koşu kaydında) saklanır.
      sonuc: (r, veri) => {
        const ek = indirilenDosya === 'her' || (indirilenDosya === 'yalnizHata' && !r.gecti);
        dosyaEkleri.push({ ...r.dosya, gecti: r.gecti, ...(ek && veri.length <= DOSYA_EKI_SINIRI ? { icerikBase64: veri.toString('base64') } : {}) });
      }
    } : {}), ...okumaSonuclari];
    if (dosyaEkleri.length) sonuc.dosyalar = dosyaEkleri;
    // "Yanıt sözleşmeye uymalı" (senaryo ayarı; varsayılan kapalı): uyumsuzluk senaryoyu kaldırır (servis-sozlesmesi.mjs).
    if (icerik.sozlesmeDogrula === true) {
      const sz = yanitSozlesmesiniDenetle(servis, icerik.operasyon, yanit, (m) => gizlileriMaskele(m, gizliler));
      kontroller.push(sz.kontrol);
      sonuc.sozlesme = sz.ozet;
    }
    durum = kontroller.every((k) => k.gecti) ? 'basarili' : 'basarisiz';
    if (Object.keys(okunan).length) {
      sonuc.okunanlar = Object.fromEntries((girdi.okumalar ?? []).filter((o) => okunan[o.ad] !== undefined).map((o) => [o.ad, okumaGizliMi(o, ekAdlar) ? MASKE : okunan[o.ad]]));
    }
    olay('kontroller', durum === 'basarili' ? 'tamam' : 'hata', { gecen: kontroller.filter((k) => k.gecti).length, toplam: kontroller.length });
    Object.assign(sonuc, {
      durumKodu: yanit.durumKodu, yanitSureMs: yanit.sureMs, kontroller, ozet: ikiliYanit ? '' : gizlileriMaskele(yanitOzeti(yanit.govde), gizliler),
      yanit: gizlileriMaskele(gosterilecekYanit.length > YANIT_SAKLAMA_SINIRI ? `${gosterilecekYanit.slice(0, YANIT_SAKLAMA_SINIRI)}\n…(kırpıldı)` : gosterilecekYanit, gizliler)
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
 * KURU ÇÖZÜM (istek GÖNDERİLMEZ, oturum akışı koşulmaz, kayıt yazılmaz): senaryonun bir ortamdaki isteğinin (gövde, REST yolu,
 * başlıklar) koşudakiyle aynı çözümleyicilerle (parametreDegerleri + yerTutuculariDoldur) doldurulmuş hâli. ${akis:…} değerleri
 * yer tutucu olarak kalır; "şimdi" sabittir. Tablo birleştirmenin kuru doğrulaması eski / yeni hâli karşılaştırır. Dönen metin
 * gizli değer içerebilir: YALNIZ bellekte karşılaştırma içindir, yanıta yazılmaz.
 * @param {Veritabani} vt @param {string} projeId @param {Servis} servis @param {ServisSenaryoIcerigi} icerik @param {string} ortamId
 * @param {{ simdi: Date; tablolar?: import('../tablolar/tablo-deposu.mjs').Tablo[] }} s
 * @returns {{ metin: string } | { hata: string }}
 */
export function servisIstegiKuruCoz(vt, projeId, servis, icerik, ortamId, s) {
  try {
    const opTanimi = servis.ayarlar.operasyonlar?.find((o) => o.ad === icerik.operasyon);
    const rest = servis.tur === 'rest';
    const http = rest ? (icerik.http ?? (opTanimi?.metot ? { metot: opTanimi.metot, yol: opTanimi.yol ?? '' } : undefined)) : undefined;
    if (rest && !http) return { hata: 'REST senaryosunda HTTP metodu / yolu tanımlı değil.' };
    const basliklarHam = icerik.basliklar ?? {};
    const hamMetin = [icerik.govde ?? '', ...Object.values(basliklarHam), http?.yol ?? ''].join('\n');
    const kurallar = servis.ayarlar.tarihKurallari ?? {};
    const kuralRefleri = kuralParametreleri(kullanilanParametreler(hamMetin).filter((a) => Object.hasOwn(kurallar, a)), kurallar).refler.map((r) => `\${${r}}`);
    const p = parametreDegerleri(vt, projeId, servis, { ...icerik, govde: [hamMetin, ...kuralRefleri].join('\n') }, ortamId, { tablolar: s.tablolar, satirSecimKipi: 'ilk' });
    const akisDegerleri = Object.fromEntries(kullanilanAkisDegerleri(hamMetin).map((a) => [a, `\u0000akis:${a}\u0000`]));
    const doldurma = {
      degerler: p.degerler, tarihKurallari: p.tarihKurallari, simdi: s.simdi, tarihOnbellegi: new Map(), gizliler: p.gizliler,
      eksikAciklamasi: (/** @type {string} */ ad) => p.eksikNedeni[ad] ?? 'tanımsız', akisDegerleri, varsayilanTarihBicimi: (() => { try { return kosuAyarlariniOku(vt).tarihBicimi; } catch { return undefined; } })()
    };
    const govde = yerTutuculariDoldur(icerik.govde ?? '', http ? { ...doldurma, kacis: govdeKacisi(http.icerikTuru) } : doldurma);
    const yol = http ? yerTutuculariDoldur(http.yol, { ...doldurma, kacis: 'url' }) : '';
    const basliklar = Object.entries(basliklarHam).map(([a, d]) => [a, yerTutuculariDoldur(d, { ...doldurma, kacis: /** @type {const} */ ('baslik') })]);
    return { metin: JSON.stringify([govde, yol, basliklar]) };
  } catch (e) {
    if (e instanceof ServisHatasi || e instanceof DepoHatasi) return { hata: e.message };
    throw e;
  }
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
 * Servisin koşuya dahil ve kapsamı ortama uyan senaryolarını sırayla koşar (verilirse yalnız senaryoIdleri); Ayarlar > Koşu >
 * Servisler > "Aynı anda en çok N servis senaryosu" > 1 ise en çok N'i aynı anda (sonuçlar yine senaryo sırasıyla).
 * @param {Veritabani} vt @param {string} projeId @param {{ servisId: string; ortamId: string; senaryoIdleri?: string[]; zamanAsimiMs?: number }} girdi
 */
export async function servisSenaryolariniKos(vt, projeId, girdi) {
  const ortam = ortamiAl(vt, projeId, girdi.ortamId);
  const tur = ortamTuru(ortam);
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const yalnizTest = new Set(servis.ayarlar.yalnizTestOperasyonlari ?? []);
  const secili = girdi.senaryoIdleri ? new Set(girdi.senaryoIdleri) : null;
  // Akışı bu servisten geçen (başka serviste kayıtlı) akış senaryoları da koşar.
  const liste = [...servisSenaryolariniListele(vt, girdi.servisId), ...(akisSenaryoKancasi?.gecenler(vt, projeId, girdi.servisId) ?? [])]
    .filter((s) => (secili ? secili.has(s.id) : servisOrtamdaKosuyaDahil(s, ortam.id)));
  const tanimli = ortamdaTanimli(servis.ayarlar, ortam.id);
  const akisMi = (/** @type {any} */ s) => s.icerik?.tur === 'akis';
  const kosulacak = liste.filter((s) => (akisMi(s) ? Boolean(akisSenaryoKancasi) && !akisSenaryoKancasi?.atlamaNedeni(vt, s, ortam)
    : tanimli && (s.kapsam === 'ikisi' || s.kapsam === tur) && !(tur === 'canli' && yalnizTest.has(s.icerik.operasyon))));
  /** @type {Array<{ senaryoId: string; baslik: string; hata?: string; veriKosusu?: any }>} Çalıştırmalar (sonuç sırası bu sıradır). */
  const plan = [];
  for (const s of kosulacak) {
    // Veri koşuları (tablodan çoklu satır): her satır / kombinasyon ayrı çalıştırma; çoklu değilse tek (bugünkü).
    const c = akisMi(s) ? { hata: null, calistirmalar: [{ baslik: s.baslik, veriKosusu: null }] } : servisCalistirmalari(vt, projeId, s, ortam.id);
    if (c.hata) { plan.push({ senaryoId: s.id, baslik: s.baslik, hata: c.hata }); continue; }
    for (const k of c.calistirmalar) plan.push({ senaryoId: s.id, baslik: k.baslik, ...(k.veriKosusu ? { veriKosusu: k.veriKosusu } : {}) });
  }
  // Ayarlar > Koşu > Servisler > "Aynı anda en çok N servis senaryosu" (1 = sırayla); sonuçlar plan sırasıyla.
  const sonuclar = /** @type {Array<{ senaryoId: string; baslik: string; durum: string; sureMs: number; kosuId: string | null; ozet: string }>} */ (
    await sinirliKos(plan, servisEszamanliOku(vt), async (p) => {
      if (p.hata) return { senaryoId: p.senaryoId, baslik: p.baslik, durum: 'hata', sureMs: 0, kosuId: null, ozet: p.hata };
      const r = await servisSenaryosuCalistir(vt, projeId, { servisId: girdi.servisId, ortamId: girdi.ortamId, tur: 'kosu', senaryoId: p.senaryoId, zamanAsimiMs: girdi.zamanAsimiMs, ...(p.veriKosusu ? { veriKosusu: p.veriKosusu } : {}) });
      return { senaryoId: p.senaryoId, baslik: p.baslik, durum: r.durum, sureMs: r.sureMs, kosuId: r.kosuId, ozet: String(r.hata ?? r.ozet ?? '') };
    }));
  return {
    ortam: ortam.ad, ortamTuru: tur, atlanan: liste.length - kosulacak.length, ...(tanimli ? {} : { atlamaNedeni: tanimsizNedeni(servis.ayarlar, ortam.ad) }), sonuclar,
    ozet: { basarili: sonuclar.filter((x) => x.durum === 'basarili').length, basarisiz: sonuclar.filter((x) => x.durum === 'basarisiz').length, hata: sonuclar.filter((x) => x.durum === 'hata').length }
  };
}

