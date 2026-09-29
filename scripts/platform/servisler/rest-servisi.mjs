// SERVİS TESTLERİ — "Adım adım > REST" sihirbazı ve REST servisinin İşlemler sekmesi: uç (istek) tanımlarıyla REST servisi
// kaydı ve isteğe bağlı "Dene".
// - Servis tur 'rest', yol "/" (her uç kendi yolunu taşır); her uç bir operasyon: { ad, metot, yol, sorgu, icerikTuru, basliklar,
//   govdeOrnegi, gizliAlanlar }. Alan şeması uçtan üretilir (rest-semasi.mjs restSemasi) → alan bağlama / zorunluluk SOAP'takiyle
//   aynı ayarlarda (alanBaglari, alanZorunluluklari) ve Parametreler sekmesinde aynı bileşenle düzenlenir.
// - Gizli adlı başlığa (Authorization, X-Api-Key, token…) düz değer yazılırsa değer "<servis> başlıkları" test verisi tablosunun GİZLİ
//   sütununa şifreli yazılır; başlıkta yalnız başvuru (${Tablo.Sütun}; "Bearer " gibi şema korunur) kalır. Değer arayüze dönmez.
// - Erişim denetimi (WSDL) yoktur; kayıt ağ isteği atmaz. "Dene" yalnız kullanıcı isteğiyle (CANLI ortamda ayrıca onayla), yasak adres
//   denetiminden geçen adrese bir istek atar.
// - cURL'den ekleme (Servis ekle > cURL yapıştır): gizli değer yalnız kullanıcı onayladıysa gelir ve şifreli sütuna yazılır; onaysız
//   gizli değerin sütunu boş açılır (gizliBosSutun, gizliAlanDegerleri). Yeni servis adlandırılmış taban adresine bağlanabilir (tabanGrubu).
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { adresYasakliMi } from '../senaryolar/model-kosusu.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { basvuru } from '../tablolar/tablo-secimi.mjs';
import { gizlileriMaskele, ServisHatasi } from './soap-istemcisi.mjs';
import { adresBirlestirRest, restIstegi } from './rest-istemcisi.mjs';
import { baslangicSablonu, govdeOrnegiCoz, GOVDELI_METOTLAR, REST_METOTLARI, restSemasi } from './rest-semasi.mjs';
import { alanSatirlari } from './servis-govdesi.mjs';
import { servisGetir, servisKaydet, servisSenaryolariniListele, servisSenaryosuKaydet } from './servis-deposu.mjs';
import { alanBaglariniDogrula, alanZorunluluklariniDogrula, kuralBaglariniDenetle, tabanlariDogrula, tabanlariOrtamlaraKaydet, tarihKurallariniDogrula } from './servis-islemleri.mjs';
import { tabanKarari, tabanKarariUygula } from './taban-adresleri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ ad: string; eskiAd?: string; metot: string; yol: string; sorgu: Array<{ ad: string; deger: string }>; icerikTuru: string;
 *   basliklar: Array<{ ad: string; deger: string }>; govdeOrnegi: string; yalnizTest: boolean; gizliAlanlar: string[] }} RestUcu
 */

const KORUNAN = new Set(['content-type', 'content-length', 'host']);
const GIZLI_BASLIK = /authorization|api[-_]?key|token|secret|cookie/i;
const temizTabloAdi = (/** @type {string} */ a) => a.replace(/[.[\]{}$<>&|\u0000-\u001f]/g, '_').trim().slice(0, 60);

/**
 * Uç girdisini doğrular ve normalleştirir.
 * @param {unknown} x @param {number} i @returns {RestUcu}
 */
export function restUcuDogrula(x, i) {
  const o = /** @type {Record<string, any>} */ (x && typeof x === 'object' ? x : {});
  const yer = `${i + 1}. istek`;
  const ad = typeof o.ad === 'string' ? o.ad.trim() : '';
  if (!ad || ad.length > 120 || /[\u0000-\u001f]/.test(ad)) throw new DepoHatasi(`${yer}: ad 1–120 karakter olmalı.`);
  const metot = String(o.metot ?? '').toUpperCase();
  if (!REST_METOTLARI.includes(metot)) throw new DepoHatasi(`${yer} (${ad}): HTTP işlemi ${REST_METOTLARI.join(' / ')} olmalı.`);
  const yol = typeof o.yol === 'string' ? o.yol.trim() : '';
  if (yol && (!yol.startsWith('/') || /[\s?#]/.test(yol) || yol.length > 2000)) throw new DepoHatasi(`${yer} (${ad}): yol "/" ile başlamalı; boşluk, "?" ve "#" içermemeli (sorgu parametreleri ayrı yazılır).`);
  const satirlar = (/** @type {unknown} */ v, /** @type {string} */ ne) => (Array.isArray(v) ? v : []).map((s) => /** @type {Record<string, unknown>} */ (s && typeof s === 'object' ? s : {}))
    .map((s) => ({ ad: typeof s.ad === 'string' ? s.ad.trim() : '', deger: typeof s.deger === 'string' ? s.deger : '' }))
    .filter((s) => s.ad || s.deger).map((s) => {
      if (!s.ad) throw new DepoHatasi(`${yer} (${ad}): ${ne} adı boş.`);
      if (/[\r\n]/.test(s.deger) || s.deger.length > 4000) throw new DepoHatasi(`${yer} (${ad}): "${s.ad}" ${ne} değeri tek satır olmalı.`);
      return s;
    });
  const sorgu = satirlar(o.sorgu, 'sorgu parametresi');
  const basliklar = satirlar(o.basliklar, 'başlık');
  for (const b of basliklar) {
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(b.ad)) throw new DepoHatasi(`${yer} (${ad}): geçersiz başlık adı "${b.ad}".`);
    if (KORUNAN.has(b.ad.toLowerCase())) throw new DepoHatasi(`${yer} (${ad}): "${b.ad}" başlığı içerik türünden yazılır.`);
  }
  const icerikTuru = typeof o.icerikTuru === 'string' && o.icerikTuru.trim() ? o.icerikTuru.trim() : 'application/json';
  if (icerikTuru.length > 200 || /[\r\n]/.test(icerikTuru)) throw new DepoHatasi(`${yer} (${ad}): içerik türü geçersiz.`);
  const govdeOrnegi = GOVDELI_METOTLAR.includes(metot) && typeof o.govdeOrnegi === 'string' ? o.govdeOrnegi.trim() : '';
  if (govdeOrnegi.length > 200_000) throw new DepoHatasi(`${yer} (${ad}): gövde örneği en çok 200 000 karakter.`);
  if (govdeOrnegi && /json/i.test(icerikTuru)) {
    try { govdeOrnegiCoz(govdeOrnegi); } catch (e) { throw new DepoHatasi(`${yer} (${ad}): ${/** @type {Error} */ (e).message}`); }
  }
  const gizliAlanlar = Array.isArray(o.gizliAlanlar) ? [...new Set(o.gizliAlanlar.filter((/** @type {unknown} */ y) => typeof y === 'string'))] : [];
  return {
    ad, ...(typeof o.eskiAd === 'string' && o.eskiAd ? { eskiAd: o.eskiAd } : {}), metot, yol, sorgu, icerikTuru, basliklar, govdeOrnegi,
    yalnizTest: o.yalnizTest === true, gizliAlanlar
  };
}

/**
 * Gizli alan değerleri girdisi: { <uç adı>: { <alan yolu>: değer | null } } (null: kullanıcı değeri onaylamadı, sütun boş açılır).
 * @param {unknown} v @returns {Record<string, Record<string, string | null>>}
 */
export function gizliAlanDegerleriniDogrula(v) {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi('"gizliAlanDegerleri" bir nesne olmalıdır.');
  /** @type {Record<string, Record<string, string | null>>} */
  const s = {};
  for (const [uc, alanlar] of Object.entries(v)) {
    if (!alanlar || typeof alanlar !== 'object' || Array.isArray(alanlar)) throw new DepoHatasi(`"${uc}" gizli değerleri bir nesne olmalıdır.`);
    for (const [yol, d] of Object.entries(alanlar)) {
      if (d !== null && (typeof d !== 'string' || d.length > 4000 || /[\r\n]/.test(d))) throw new DepoHatasi('Gizli değer tek satır ve en çok 4000 karakter olmalı.');
      (s[uc] ??= {})[yol] = d;
    }
  }
  return s;
}

/**
 * REST servisi ekler / günceller (uçlar, taban adresler, alan bağları, zorunluluklar) ve istenen uçlar için başlangıç senaryosu
 * oluşturur. Ağ isteği atılmaz.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ id?: string; anahtar: string; ad: string; tabanlar?: Record<string, string>; tlsDogrulama?: boolean; uclar: unknown[];
 *   alanBaglari?: unknown; alanZorunluluklari?: unknown; tarihKurallari?: unknown; senaryolar?: string[]; kapsam?: 'test' | 'canli' | 'ikisi'; yapan?: string;
 *   tabanGrubu?: string; gizliBosSutun?: boolean; gizliAlanDegerleri?: Record<string, Record<string, string | null>> }} girdi
 *   tarihKurallari: hesaplama kuralları (verilirse mevcutların yerine; tarih kuralları dahil).
 *   tabanGrubu: yeni servis bu adlandırılmış taban adresine bağlanır (tabanlar çağıran tarafından tabandan verilir).
 *   gizliBosSutun (cURL'den ekleme): gizli adlı başlığın değeri boşsa ya da yalnız şemaysa ("Bearer") değer YAZILMAZ; "<servis>
 *   başlıkları" tablosunda boş gizli sütun açılır, başlık ona başvurur (kullanıcı değeri tabloda doldurur).
 *   gizliAlanDegerleri (cURL'den ekleme): sorgu / gövde alanlarının gizli değerleri. Kullanıcının bağlamadığı her alan için
 *   "<servis> gizli değerleri" tablosunda gizli sütun açılır ve alan ona bağlanır; değer yalnız verildiyse (onaylıysa) şifreli yazılır.
 */
export function restServisiKaydet(vt, projeId, girdi) {
  const mevcut = girdi.id ? servisGetir(vt, girdi.id) : undefined;
  if (girdi.id && (!mevcut || mevcut.projeId !== projeId)) throw new DepoHatasi('Servis bulunamadı.');
  if (mevcut && mevcut.tur !== 'rest') throw new DepoHatasi('Bu bir SOAP servisi; REST uçları eklenemez.');
  if (!Array.isArray(girdi.uclar) || !girdi.uclar.length) throw new DepoHatasi('En az bir istek (uç) ekleyin.');
  const uclar = girdi.uclar.map(restUcuDogrula);
  const adlar = new Set();
  for (const u of uclar) {
    if (adlar.has(u.ad)) throw new DepoHatasi(`"${u.ad}" adlı iki istek var; adlar tekil olmalı.`);
    adlar.add(u.ad);
  }
  // Taban adresine bağlı servisin adresi farklılaşıyorsa kullanıcının kararı (taban-adresleri.mjs > tabanKarari).
  const karar = girdi.tabanlar === undefined ? { tabanlar: mevcut?.ayarlar.tabanlar ?? {}, ayir: false, guncelle: null }
    : tabanKarari(vt, projeId, { servis: mevcut, tabanlar: tabanlariDogrula(girdi.tabanlar), kararlar: girdi.tabanKararlari });
  const tabanlar = karar.tabanlar;
  const desenler = etkinYasakDesenleri(vt);
  for (const a of Object.values(tabanlar)) {
    const kalip = a ? adresYasakliMi(a, desenler) : null;
    if (kalip) throw new DepoHatasi(`Taban adres yasak adres kalıbına uyuyor: ${kalip}`);
  }
  const ad = typeof girdi.ad === 'string' ? girdi.ad.trim() : '';
  const ekler = ekGizliAdlar(vt);
  // Uç adı değişince alan ayarları yeni ada taşınır.
  const tasi = (/** @type {Record<string, any>} */ k) => Object.fromEntries(Object.entries(k).map(([op, v]) => [uclar.find((u) => u.eskiAd === op)?.ad ?? op, v]));
  const baglar = alanBaglariniDogrula(girdi.alanBaglari ?? tasi(mevcut?.ayarlar.alanBaglari ?? {}));
  const zorunlu = alanZorunluluklariniDogrula(girdi.alanZorunluluklari ?? tasi(mevcut?.ayarlar.alanZorunluluklari ?? {}));
  const opAdlari = new Set(uclar.map((u) => u.ad));
  const sadece = (/** @type {Record<string, any>} */ k) => Object.fromEntries(Object.entries(k).filter(([op]) => opAdlari.has(op)));
  const gizliAlanDegerleri = gizliAlanDegerleriniDogrula(girdi.gizliAlanDegerleri);

  /**
   * Gizli sütunları bir tabloya yazar (yoksa oluşturur; var olan sütunlar korunur). Değeri verilmeyen sütun boş kalır (kayıtlı
   * gizli değer korunur). @param {string} tabloAdi @param {string[]} sutunlar @param {Record<string, string>} degerler @returns {string} tablo kimliği
   */
  const gizliTabloyaYaz = (tabloAdi, sutunlar, degerler) => {
    const t = tablolariListele(vt, projeId).find((x) => x.ad.toLocaleLowerCase('tr') === tabloAdi.toLocaleLowerCase('tr'));
    // Yazılan sütun var olan tabloda gizli değilse gizli yapılır (değer hiçbir zaman düz yazılmaz).
    const eski = t ? t.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: c.gizli || sutunlar.includes(c.ad) })) : [];
    const yeni = sutunlar.filter((s) => !eski.some((c) => c.ad === s)).map((s) => ({ ad: s, gizli: true }));
    const satir = t?.satirlar.find((r) => r.ortamId === null);
    return tabloKaydet(vt, { projeId, ...(t ? { id: t.id } : {}), ad: t?.ad ?? tabloAdi, sutunlar: [...eski, ...yeni], satirlar: [{ ...(satir ? { id: satir.id } : {}), ortamId: null, degerler }] });
  };

  return vt.islem(() => {
    // Gizli başlıklardaki düz değerler → "<servis> başlıkları" tablosunun gizli sütunları. gizliBosSutun: boş / yalnız şema değerde
    // sütun boş açılır (değer yazılmaz), başlık yine sütuna başvurur.
    /** @type {Record<string, string>} */
    const gizliDegerler = {};
    /** @type {Set<string>} */
    const gizliSutunlar = new Set();
    /** @type {Map<string, string | null>} sütun → bu kayıtta yazılan değer (null: boş) */
    const kullanilanSutunlar = new Map();
    const tabloAdi = temizTabloAdi(`${ad || girdi.anahtar} başlıkları`);
    for (const u of uclar) {
      u.basliklar = u.basliklar.map((b) => {
        if (b.deger.includes('${') || !(gizliAdMi(b.ad, ekler) || GIZLI_BASLIK.test(b.ad))) return b;
        const bos = girdi.gizliBosSutun === true ? /^(?:(Bearer|Basic|Digest|Token)\s*)?$/i.exec(b.deger) : null;
        if (!b.deger && !bos) return b;
        const sema = bos ? null : /^(Bearer|Basic|Digest|Token)\s+(.+)$/i.exec(b.deger);
        let sutun = temizTabloAdi(b.ad);
        if (girdi.gizliBosSutun === true) {
          // cURL'den: aynı adlı başlık başka istekte farklı (ya da onaysız) değerle geliyorsa ayrı sütun (Authorization_2…).
          const deger = bos ? null : sema ? sema[2] : b.deger;
          const temel = sutun;
          for (let n = 2; kullanilanSutunlar.has(sutun) && (deger === null || kullanilanSutunlar.get(sutun) !== deger); n++) sutun = `${temel.slice(0, 56)}_${n}`;
          kullanilanSutunlar.set(sutun, deger);
        }
        gizliSutunlar.add(sutun);
        if (!bos) gizliDegerler[sutun] = sema ? sema[2] : b.deger;
        const on = bos ? bos[1] : sema?.[1];
        return { ad: b.ad, deger: `${on ? `${on} ` : ''}\${${basvuru(tabloAdi, sutun)}}` };
      });
    }
    if (gizliSutunlar.size) gizliTabloyaYaz(tabloAdi, [...gizliSutunlar], gizliDegerler);
    // Sorgu / gövde alanlarının gizli değerleri → "<servis> gizli değerleri" tablosu; kullanıcının bağlamadığı alan o sütuna bağlanır.
    /** @type {Array<{ uc: string; yol: string; sutun: string }>} */
    const alanSutunlari = [];
    /** @type {Record<string, string>} */
    const alanDegerleri = {};
    const alanTablosu = temizTabloAdi(`${ad || girdi.anahtar} gizli değerleri`);
    for (const u of uclar) {
      const istenen = gizliAlanDegerleri[u.ad];
      if (!istenen) continue;
      const yapraklar = new Set(alanSatirlari(restSemasi(u).alanlar).filter((x) => !x.grup).map((x) => x.yol));
      for (const [yol, d] of Object.entries(istenen)) {
        if (!yapraklar.has(yol) || baglar[u.ad]?.[yol]) continue;
        const temel = temizTabloAdi(yol.split('/').pop() ?? '') || 'deger';
        let sutun = temel;
        for (let n = 2; alanSutunlari.some((x) => x.sutun.toLocaleLowerCase('tr') === sutun.toLocaleLowerCase('tr')); n++) sutun = `${temel.slice(0, 56)}_${n}`;
        alanSutunlari.push({ uc: u.ad, yol, sutun });
        if (typeof d === 'string' && d) alanDegerleri[sutun] = d;
        if (!u.gizliAlanlar.includes(yol)) u.gizliAlanlar.push(yol);
      }
    }
    if (alanSutunlari.length) {
      const tabloId = gizliTabloyaYaz(alanTablosu, alanSutunlari.map((x) => x.sutun), alanDegerleri);
      for (const x of alanSutunlari) (baglar[x.uc] ??= {})[x.yol] = { tablo: tabloId, sutun: x.sutun };
    }
    tabanKarariUygula(vt, projeId, karar, girdi.yapan);
    tabanlariOrtamlaraKaydet(vt, projeId, tabanlar);
    const operasyonlar = uclar.map((u) => ({
      ad: u.ad, metot: u.metot, yol: u.yol, sorgu: u.sorgu, icerikTuru: u.icerikTuru, basliklar: u.basliklar, govdeOrnegi: u.govdeOrnegi, gizliAlanlar: u.gizliAlanlar
    }));
    const kurallar = girdi.tarihKurallari !== undefined ? tarihKurallariniDogrula(girdi.tarihKurallari) : (mevcut?.ayarlar.tarihKurallari ?? {});
    kuralBaglariniDenetle({ tarihKurallari: kurallar, alanBaglari: sadece(baglar) });
    const servisId = servisKaydet(vt, {
      id: mevcut?.id, projeId, anahtar: girdi.anahtar, ad, tur: 'rest', yapan: girdi.yapan,
      ayarlar: {
        ...(mevcut?.ayarlar ?? {}), yol: '/', adresler: mevcut?.ayarlar.adresler ?? {}, tabanlar, ...(girdi.tabanGrubu ? { tabanGrubu: girdi.tabanGrubu } : {}),
        ...(karar.ayir ? { tabanGrubu: undefined } : {}),
        ...(typeof girdi.tlsDogrulama === 'boolean' ? { tlsDogrulama: girdi.tlsDogrulama } : {}),
        operasyonlar, operasyonSemalari: Object.fromEntries(uclar.map((u) => [u.ad, restSemasi(u)])),
        yalnizTestOperasyonlari: uclar.filter((u) => u.yalnizTest).map((u) => u.ad),
        alanBaglari: sadece(baglar), alanZorunluluklari: sadece(zorunlu), tarihKurallari: kurallar
      }
    });
    // Adı değişen uçların senaryoları yeni ada geçer.
    const mevcutSenaryolar = servisSenaryolariniListele(vt, servisId);
    for (const u of uclar) {
      if (!u.eskiAd || u.eskiAd === u.ad) continue;
      for (const x of mevcutSenaryolar.filter((y) => y.icerik.operasyon === u.eskiAd)) {
        servisSenaryosuKaydet(vt, { id: x.id, projeId, servisId, baslik: x.baslik, kapsam: x.kapsam, kosuyaDahil: x.kosuyaDahil, icerik: { ...x.icerik, operasyon: u.ad } });
      }
    }
    // Başlangıç senaryoları: alanlar tablo sütunlarına bağlıysa şablonda başvuru; gizli alanın örnek değeri yazılmaz.
    const tablolar = tablolariListele(vt, projeId);
    const basliklar = new Set(mevcutSenaryolar.map((x) => x.baslik));
    /** @type {string[]} */
    const eklenen = [];
    for (const u of uclar.filter((x) => (girdi.senaryolar ?? []).includes(x.ad))) {
      const opBaglari = baglar[u.ad] ?? {};
      const ref = (/** @type {string} */ yol) => {
        const b = opBaglari[yol];
        if (b?.kural) return b.kural;
        const t = b ? tablolar.find((x) => x.id === b.tablo) : undefined;
        return b && t ? basvuru(t.ad, b.sutun, b.etiket || '', b.bicim || '') : undefined;
      };
      const sablon = baslangicSablonu(u, { ref, gizli: new Set(u.gizliAlanlar) });
      let baslik = u.ad;
      for (let n = 2; basliklar.has(baslik); n++) baslik = `${u.ad} (${n})`;
      basliklar.add(baslik);
      servisSenaryosuKaydet(vt, {
        projeId, servisId, baslik, kapsam: girdi.kapsam ?? 'test', yapan: girdi.yapan,
        icerik: {
          operasyon: u.ad, govde: sablon.govde, kontroller: [{ tur: 'durumKodu', deger: '200-299' }], kaynak: { arac: 'Sihirbaz' },
          http: { metot: u.metot, yol: sablon.yol, ...(sablon.govde ? { icerikTuru: u.icerikTuru } : {}) },
          ...(u.basliklar.length ? { basliklar: Object.fromEntries(u.basliklar.map((b) => [b.ad, b.deger])) } : {})
        }
      });
      eklenen.push(baslik);
    }
    return { id: servisId, eklenenSenaryolar: eklenen };
  });
}

/**
 * "Dene": bir ucu seçilen ortamda gerçekten çağırır (yalnız kullanıcı onayıyla; arayüz yöntem + tam adresi sorar).
 * Yol yer tutucusu ({id}) ya da ${…} başvurusu kalmışsa istek atılmaz. Yanıt kırpılır; gizli başlık değerleri maskelenir.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ortamId: string; taban?: string; uc: unknown; tlsDogrulama?: boolean; servisId?: string }} girdi
 */
export async function restUcuDene(vt, projeId, girdi) {
  const ortam = ortamGetir(vt, girdi.ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const u = restUcuDogrula(girdi.uc, 0);
  const taban = girdi.taban === undefined || girdi.taban === null ? ortam.tabanUrl : String(girdi.taban);
  if (!taban) throw new DepoHatasi('Bu ortam için taban adres yok.');
  const t = tabanlariDogrula({ [ortam.id]: taban })[ortam.id];
  const sorgu = u.sorgu.map((x) => `${encodeURIComponent(x.ad)}=${encodeURIComponent(x.deger)}`).join('&');
  const adres = adresBirlestirRest(t, `${u.yol}${sorgu ? `?${sorgu}` : ''}`);
  if (/\{[^}]*\}|\$\{/.test(`${u.yol}${sorgu}`)) throw new DepoHatasi('Yolda ya da sorguda doldurulmamış yer tutucu var ({id} gibi); Dene için örnek değer yazın.');
  const kalip = adresYasakliMi(adres, etkinYasakDesenleri(vt));
  if (kalip) throw new DepoHatasi(`Adres yasak adres kalıbına uyuyor: ${kalip}`);
  const basliklar = Object.fromEntries(u.basliklar.filter((b) => !b.deger.includes('${')).map((b) => [b.ad, b.deger]));
  const atlanan = u.basliklar.filter((b) => b.deger.includes('${')).map((b) => b.ad);
  const gizliler = u.basliklar.map((b) => b.deger.replace(/^(Bearer|Basic|Digest|Token)\s+/i, '')).filter((d) => d && !d.includes('${'));
  try {
    const y = await restIstegi({
      adres, metot: u.metot, ...(u.govdeOrnegi ? { govde: u.govdeOrnegi, icerikTuru: u.icerikTuru } : {}), ekBasliklar: basliklar,
      // Zaman aşımı: Ayarlar > Koşu > Servis isteği zaman aşımı (servis koşularıyla aynı; önceden "Dene"de 30 sn sabitti).
      zamanAsimiMs: kosuAyarlariniOku(vt).servisZamanAsimiSn * 1000, ...(girdi.tlsDogrulama === false ? { tlsDogrulama: false } : {}), yasakDesenleri: etkinYasakDesenleri(vt)
    });
    return { basarili: true, adres, metot: u.metot, durumKodu: y.durumKodu, sureMs: y.sureMs, atlananBasliklar: atlanan, yanit: gizlileriMaskele(y.govde.slice(0, 4000), gizliler) };
  } catch (e) {
    if (e instanceof ServisHatasi) return { basarili: false, adres, metot: u.metot, mesaj: e.message, atlananBasliklar: atlanan };
    throw e;
  }
}

