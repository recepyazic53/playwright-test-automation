// SERVİS TESTLERİ — "Adım adım > REST" sihirbazı ve REST servisinin İşlemler sekmesi: uç (istek) tanımlarıyla REST servisi
// kaydı ve isteğe bağlı "Dene".
// - Servis tur 'rest', yol "/" (her uç kendi yolunu taşır); her uç bir operasyon: { ad, metot, yol, sorgu, icerikTuru, basliklar,
//   govdeOrnegi, gizliAlanlar }. Alan şeması uçtan üretilir (rest-semasi.mjs restSemasi) → alan bağlama / zorunluluk SOAP'takiyle
//   aynı ayarlarda (alanBaglari, alanZorunluluklari) ve Parametreler sekmesinde aynı bileşenle düzenlenir.
// - Gizli adlı başlığa (Authorization, X-Api-Key, token…) düz değer yazılırsa değer "<servis> başlıkları" test verisi tablosunun GİZLİ
//   sütununa şifreli yazılır; başlıkta yalnız başvuru (${Tablo.Sütun}; "Bearer " gibi şema korunur) kalır. Değer arayüze dönmez.
// - Erişim denetimi (WSDL) yoktur; kayıt ağ isteği atmaz. "Dene" yalnız kullanıcı isteğiyle, yalnız TEST ortamında, yasak adres
//   denetiminden geçen adrese bir istek atar.
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { adresYasakliMi } from '../senaryolar/model-kosusu.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { basvuru } from '../tablolar/tablo-secimi.mjs';
import { gizlileriMaskele, ServisHatasi } from './soap-istemcisi.mjs';
import { adresBirlestirRest, restIstegi } from './rest-istemcisi.mjs';
import { baslangicSablonu, govdeOrnegiCoz, GOVDELI_METOTLAR, REST_METOTLARI, restSemasi } from './rest-semasi.mjs';
import { servisGetir, servisKaydet, servisSenaryolariniListele, servisSenaryosuKaydet } from './servis-deposu.mjs';
import { alanBaglariniDogrula, alanZorunluluklariniDogrula, tabanlariDogrula, tabanlariOrtamlaraKaydet } from './servis-islemleri.mjs';

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
 * REST servisi ekler / günceller (uçlar, taban adresler, alan bağları, zorunluluklar) ve istenen uçlar için başlangıç senaryosu
 * oluşturur. Ağ isteği atılmaz.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ id?: string; anahtar: string; ad: string; tabanlar?: Record<string, string>; tlsDogrulama?: boolean; uclar: unknown[];
 *   alanBaglari?: unknown; alanZorunluluklari?: unknown; senaryolar?: string[]; kapsam?: 'test' | 'canli' | 'ikisi'; yapan?: string }} girdi
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
  const tabanlar = girdi.tabanlar === undefined ? (mevcut?.ayarlar.tabanlar ?? {}) : tabanlariDogrula(girdi.tabanlar);
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

  return vt.islem(() => {
    // Gizli başlıklardaki düz değerler → "<servis> başlıkları" tablosunun gizli sütunları.
    /** @type {Record<string, string>} */
    const gizliDegerler = {};
    const tabloAdi = temizTabloAdi(`${ad || girdi.anahtar} başlıkları`);
    for (const u of uclar) {
      u.basliklar = u.basliklar.map((b) => {
        if (!b.deger || b.deger.includes('${') || !(gizliAdMi(b.ad, ekler) || GIZLI_BASLIK.test(b.ad))) return b;
        const sema = /^(Bearer|Basic|Digest|Token)\s+(.+)$/i.exec(b.deger);
        const sutun = temizTabloAdi(b.ad);
        gizliDegerler[sutun] = sema ? sema[2] : b.deger;
        return { ad: b.ad, deger: `${sema ? `${sema[1]} ` : ''}\${${basvuru(tabloAdi, sutun)}}` };
      });
    }
    if (Object.keys(gizliDegerler).length) {
      const t = tablolariListele(vt, projeId).find((x) => x.ad.toLocaleLowerCase('tr') === tabloAdi.toLocaleLowerCase('tr'));
      const eski = t ? t.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: c.gizli })) : [];
      const yeni = Object.keys(gizliDegerler).filter((s) => !eski.some((c) => c.ad === s)).map((s) => ({ ad: s, gizli: true }));
      const satir = t?.satirlar.find((r) => r.ortamId === null);
      tabloKaydet(vt, { projeId, ...(t ? { id: t.id } : {}), ad: t?.ad ?? tabloAdi, sutunlar: [...eski, ...yeni], satirlar: [{ ...(satir ? { id: satir.id } : {}), ortamId: null, degerler: gizliDegerler }] });
    }
    tabanlariOrtamlaraKaydet(vt, projeId, tabanlar);
    const operasyonlar = uclar.map((u) => ({
      ad: u.ad, metot: u.metot, yol: u.yol, sorgu: u.sorgu, icerikTuru: u.icerikTuru, basliklar: u.basliklar, govdeOrnegi: u.govdeOrnegi, gizliAlanlar: u.gizliAlanlar
    }));
    const servisId = servisKaydet(vt, {
      id: mevcut?.id, projeId, anahtar: girdi.anahtar, ad, tur: 'rest', yapan: girdi.yapan,
      ayarlar: {
        ...(mevcut?.ayarlar ?? {}), yol: '/', adresler: mevcut?.ayarlar.adresler ?? {}, tabanlar,
        ...(typeof girdi.tlsDogrulama === 'boolean' ? { tlsDogrulama: girdi.tlsDogrulama } : {}),
        operasyonlar, operasyonSemalari: Object.fromEntries(uclar.map((u) => [u.ad, restSemasi(u)])),
        yalnizTestOperasyonlari: uclar.filter((u) => u.yalnizTest).map((u) => u.ad),
        alanBaglari: sadece(baglar), alanZorunluluklari: sadece(zorunlu)
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
 * "Dene": bir ucu seçilen TEST ortamında gerçekten çağırır (yalnız kullanıcı onayıyla; arayüz yöntem + tam adresi sorar).
 * Yol yer tutucusu ({id}) ya da ${…} başvurusu kalmışsa istek atılmaz. Yanıt kırpılır; gizli başlık değerleri maskelenir.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ortamId: string; taban?: string; uc: unknown; tlsDogrulama?: boolean; servisId?: string }} girdi
 */
export async function restUcuDene(vt, projeId, girdi) {
  const ortam = ortamGetir(vt, girdi.ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  if (ortam.ayarlar.canli === true) throw new DepoHatasi('"Dene" yalnızca test ortamında yapılır (seçilen ortam canlı işaretli).');
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
      zamanAsimiMs: 30_000, ...(girdi.tlsDogrulama === false ? { tlsDogrulama: false } : {})
    });
    return { basarili: true, adres, metot: u.metot, durumKodu: y.durumKodu, sureMs: y.sureMs, atlananBasliklar: atlanan, yanit: gizlileriMaskele(y.govde.slice(0, 4000), gizliler) };
  } catch (e) {
    if (e instanceof ServisHatasi) return { basarili: false, adres, metot: u.metot, mesaj: e.message, atlananBasliklar: atlanan };
    throw e;
  }
}

