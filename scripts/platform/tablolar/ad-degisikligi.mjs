// TABLO / SÜTUN ADI DEĞİŞİKLİĞİNİN YAYILMASI (genel). Test verisi tablosu ya da sütunu yeniden adlandırılınca onu ADIYLA kullanan başvurular
// (${Tablo.Sütun}, ${Tablo[etiket].Sütun}, biçimli başvurular) sessizce kırılmasın: aynı işlemde yeni ada çevrilir. Tabloya kimlikle bağlı
// olanlarda (ekran / servis alan bağları, satır seçimleri "<tabloId>|<etiket>") yalnız SÜTUN adı yeniden adlandırılınca güncellenir.
//   · Ekran senaryoları: her ortamın verisindeki başvuru değerleri (senaryoOrtamVerileriniYaz: tek doğrulayıcı, geçmiş).
//   · Servisler: alan varsayılanları (tablo kaynaklı), tarih / hesap kuralları; servis senaryolarının içeriği (gövde, yol, başlıklar,
//     akış adımları); servis akışları.
// Yazım tablo birleştirmeyle aynı yardımcılarla (tablo-birlestirme.mjs > metniYenidenYaz / derinYenidenYaz): etiket ve biçim korunur.
// Değer değişmez; yalnız başvurunun adı. Koşan senaryo varsa senaryoOrtamVerileriniYaz kendi kuralıyla reddeder.

import { ekranlariListele } from '../veritabani/depo.mjs';
import { zarflariCoz } from '../kasa.mjs';
import { senaryoOrtamVerileriniYaz, veriGudumluMu } from '../senaryolar/senaryo-servisi.mjs';
import { modelSenaryosuMu } from '../senaryolar/model-kosusu.mjs';
import {
  servisAkislariniListele, servisAkisiKaydet, servisKaydet, servisleriListele, servisSenaryolariniListele, servisSenaryosuKaydet
} from '../servisler/servis-deposu.mjs';
import { derinYenidenYaz, metniYenidenYaz, secimleriYenidenYaz } from './tablo-birlestirme.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet } from './ekran-baglari.mjs';
import { bagiDonustur } from './secime-gore-bag.mjs';
import { degerBasvurusu } from './tablo-secimi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const kucuk = (/** @type {unknown} */ s) => String(s ?? '').toLocaleLowerCase('tr');

/**
 * Ad eşlemi: eski tablo adı → yeni ad + sütun eşlemi (eski sütun adı → yeni). Değişiklik yoksa null.
 * @param {{ ad: string; sutunlar: Array<{ ad: string }> }} eski kaydetmeden önceki tablo
 * @param {string} yeniAd @param {Array<{ ad: string; eskiAd?: string | null }>} yeniSutunlar kaydedilen sütunlar (eskiAd: yeniden adlandırma)
 * @returns {Map<string, { yeniAd: string; sutunlar: Map<string, string> }> | null}
 */
export function adEslemi(eski, yeniAd, yeniSutunlar) {
  /** @type {Map<string, string>} */
  const sutunlar = new Map();
  const mevcut = new Set(eski.sutunlar.map((s) => s.ad));
  for (const s of yeniSutunlar) if (s.eskiAd && s.eskiAd !== s.ad && mevcut.has(s.eskiAd)) sutunlar.set(kucuk(s.eskiAd), s.ad);
  if (eski.ad === yeniAd && !sutunlar.size) return null;
  return new Map([[kucuk(eski.ad), { yeniAd, sutunlar }]]);
}

/**
 * Ad değişikliğini başvurulara yayar (yazar). Değişen kayıt sayıları döner.
 * @param {Veritabani} vt @param {string} projeId @param {string} tabloId @param {Map<string, { yeniAd: string; sutunlar: Map<string, string> }>} eslem
 * @param {{ yapan?: string; kosuyorMu?: (dosya: string, ad: string) => boolean }} [s]
 */
export function adDegisikliginiYay(vt, projeId, tabloId, eslem, s = {}) {
  const sayilar = { ekranSenaryolari: 0, servisSenaryolari: 0, servisler: 0, akislar: 0, ekranBaglari: 0 };
  const sutunlar = [...eslem.values()][0]?.sutunlar ?? new Map();
  /** Sütun adı eşlemi (kimlikle bağlı yerler için): tablo kimliği kendisine. */
  const idEslem = new Map([[tabloId, { hedefId: tabloId, sutunlar }]]);
  /** Bağın sütunu (bu tablo, yeniden adlandırılan sütun) yeni ada. @param {any} b */
  const bagCevir = (b) => bagiDonustur(b, (x) => (x.tablo === tabloId && sutunlar.has(kucuk(x.sutun)) ? { ...x, sutun: sutunlar.get(kucuk(x.sutun)) } : null));
  // Ekran senaryoları
  for (const ekran of ekranlariListele(vt, projeId)) {
    if (sutunlar.size) {
      const baglar = ekranAlanBaglari(vt, ekran.id);
      let n = 0;
      const yeni = Object.fromEntries(Object.entries(baglar).map(([k, b]) => { const c = bagCevir(b); if (c.degisti) n++; return [k, c.degisti ? c.bag : b]; }));
      if (n) { ekranAlanBaglariniKaydet(vt, projeId, ekran.id, yeni); sayilar.ekranBaglari += n; }
    }
    for (const r of vt.tumu('SELECT id, icerik_json FROM senaryolar WHERE proje_id = ? AND ekran_id = ?', [projeId, ekran.id])) {
      const icerik = /** @type {Nesne} */ (JSON.parse(String(r.icerik_json)));
      if (!modelSenaryosuMu(icerik) || !veriGudumluMu(icerik) || !nesneMi(icerik.ortamlar)) continue;
      /** @type {Record<string, Nesne>} */
      const ortamVerileri = {};
      /** @type {Set<string>} */
      const alanlar = new Set();
      for (const [o, ov] of Object.entries(/** @type {Record<string, Nesne>} */ (icerik.ortamlar))) {
        if (!nesneMi(ov) || !nesneMi(ov.veri)) continue;
        const veri = /** @type {Nesne} */ (zarflariCoz(vt, ov.veri));
        const yeni = { ...veri };
        let degisti = false;
        for (const [k, v] of Object.entries(veri)) {
          if (typeof v !== 'string' || !degerBasvurusu(v)) continue;
          const y = metniYenidenYaz(v, eslem);
          if (y !== v) { yeni[k] = y; degisti = true; alanlar.add(k); }
        }
        if (degisti) ortamVerileri[o] = yeni;
      }
      const secimler = nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : {};
      const sr = sutunlar.size ? secimleriYenidenYaz(secimler, idEslem) : null;
      const secimDegisti = Boolean(sr && JSON.stringify(sr.secimler) !== JSON.stringify(secimler));
      if (!Object.keys(ortamVerileri).length && !secimDegisti) continue;
      senaryoOrtamVerileriniYaz(vt, { projeId, id: String(r.id), ortamVerileri, denetlenecekAlanlar: [...alanlar], yapan: s.yapan, ...(secimDegisti && sr ? { tabloSecimleri: sr.secimler } : {}) }, { kosuyorMu: s.kosuyorMu });
      sayilar.ekranSenaryolari++;
    }
  }
  // Servisler: ayarlar ve senaryolar
  for (const servis of servisleriListele(vt, projeId)) {
    const a = JSON.parse(JSON.stringify(servis.ayarlar ?? {}));
    let degisti = false;
    for (const [op, alanlar] of Object.entries(/** @type {Record<string, Record<string, any>>} */ (a.alanBaglari ?? {}))) {
      for (const [yol, b] of Object.entries(alanlar ?? {})) {
        if (!b || b.tablo !== tabloId || !sutunlar.has(kucuk(b.sutun))) continue;
        a.alanBaglari[op][yol] = { ...b, sutun: sutunlar.get(kucuk(b.sutun)) };
        degisti = true;
      }
    }
    for (const alanlar of Object.values(/** @type {Record<string, Record<string, any>>} */ (a.alanVarsayilanlari ?? {}))) {
      for (const [yol, d] of Object.entries(alanlar ?? {})) {
        if (d?.kaynak !== 'tablo' || typeof d.deger !== 'string') continue;
        const y = metniYenidenYaz(`\${${d.deger}}`, eslem).slice(2, -1);
        if (y !== d.deger) { alanlar[yol] = { ...d, deger: y }; degisti = true; }
      }
    }
    for (const [ad, ifade] of Object.entries(/** @type {Record<string, string>} */ (a.tarihKurallari ?? {}))) {
      const y = metniYenidenYaz(String(ifade), eslem);
      if (y !== ifade) { a.tarihKurallari[ad] = y; degisti = true; }
    }
    if (degisti) {
      servisKaydet(vt, { id: servis.id, projeId, anahtar: servis.anahtar, ad: servis.ad, ayarlar: a, yapan: s.yapan });
      sayilar.servisler++;
    }
    for (const x of servisSenaryolariniListele(vt, servis.id)) {
      const yeni = /** @type {Nesne} */ (derinYenidenYaz(x.icerik, eslem));
      // Satır seçimleri (senaryo ve akış adımları) sütun adıyla.
      if (sutunlar.size) for (const u of [yeni, ...Object.values(nesneMi(yeni.adimlar) ? yeni.adimlar : {}).filter(nesneMi)]) if (nesneMi(u.tabloSecimleri)) u.tabloSecimleri = secimleriYenidenYaz(u.tabloSecimleri, idEslem).secimler;
      if (JSON.stringify(yeni) === JSON.stringify(x.icerik)) continue;
      servisSenaryosuKaydet(vt, { id: x.id, projeId, servisId: x.servisId, baslik: x.baslik, kapsam: x.kapsam, icerik: yeni, yapan: s.yapan });
      sayilar.servisSenaryolari++;
    }
  }
  for (const akis of servisAkislariniListele(vt, projeId)) {
    const yeni = /** @type {Nesne} */ (derinYenidenYaz(akis.icerik, eslem));
    if (JSON.stringify(yeni) === JSON.stringify(akis.icerik)) continue;
    servisAkisiKaydet(vt, { id: akis.id, projeId, baslik: akis.baslik, tur: akis.tur, kapsam: akis.kapsam, icerik: yeni, yapan: s.yapan });
    sayilar.akislar++;
  }
  return sayilar;
}
