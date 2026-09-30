// SENARYO SERVİSİ (genel) — platform "Senaryolar" ekranının veritabanı işlemleri: liste (son sonuç,
// bağlam profili, beklenen sonuç rozeti), ayrıntı, model tabanlı form bağlamı, kaydet (tek
// doğrulayıcı + değişiklik geçmişi), kopyala, sil, koşuya dahil et, geçmiş, koşu hedefi çözümü
// (senaryo UUID → model spec'i + etiket) ve "Dene" (geçici deneme senaryosu) paketi.
//
// Senaryo KİMLİĞİ veritabanı UUID'sidir. Senaryo içeriği (senaryolar.icerik_json):
//   { kosucu: 'model' | paket,               → ekran modeliyle koşar (bkz. model-kosusu.mjs)
//     kaynak: { dosya, ad },                 → sanal spec yolu + GÜNCEL başlık (başlık tekilliği ve sonuç anahtarı)
//     veri: { dosya, yol },                  → senaryo verisinin grubu (ekran anahtarı)
//     ortamlar: { <ortamId>: { sira?, veri? } },   → senaryonun var olduğu ortamlar (+ ortama göre veri)
//     alanKurallari?: { mutlakaGorunmeli: [alanId] }, akis?,
//     talepler?: [metin] }                 → talep numaraları (serbest metin; senaryolar/talepler.mjs)
// Senaryo verisindeki hassas adlı alanlar (test verisi türlerinde hassas işaretli alan adları) kasa zarfı olarak yazılır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: senaryo-servisi.d.mts.

import {
  DepoHatasi, baglamProfilleriniListele, degisiklikGecmisiListele, ekranModeliGetir, ekranlariListele, girisProfilleriniListele,
  ortamlariListele, senaryoGetir, senaryoKaydet as depoSenaryoKaydet, senaryoSil, testVerisiProfilleriniListele, testVerisiTurleriniListele
} from '../veritabani/depo.mjs';
import { senaryoGirisi, senaryoGirisiniAyikla } from './senaryo-girisi.mjs';
import { senaryoAdimGoruntusuAyikla } from '../ayarlar/kayit-kurallari.mjs';
import { acikAnahtar, adliAlanlariDonustur, sifrele, zarflariCoz } from '../kasa.mjs';
import { ANA_AKIS_ID, akisListesi, akisModeli, beklenenSonucEtiketi, formSemasiOlustur, ortakAkislariAc, tumFormAlanlari } from './model-formu.mjs';
import { listeDegeri, modelSecimAlanlari, modeleListeleriUygula, senaryoAyariAlanlari } from './deger-listesi-modeli.mjs';
import { eskiyenTarihAlanlari } from './goreli-tarih.mjs';
import { BAGLAM_ONEKI, tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { basvuru, basvurununTekDegeri, grupAnahtari, sutunBul, tabloBul, tabloDegerListeleri } from '../tablolar/tablo-secimi.mjs';
import { etkinAlanBaglari, tabloEkranKullanimi } from '../tablolar/ekran-baglari.mjs';
import { tabloTuru } from '../tablolar/tablo-benzerligi.mjs';
import { ayarBasvurulariniDenetle, modelAlanBilgisi, tabloBasvurusuVarMi, tabloSecimleriniAyikla } from '../tablolar/ekran-basvurulari.mjs';
import { basvuruGruplari, veriKosulariniAc, veriKosulariniAyikla } from '../tablolar/veri-kosulari.mjs';
import { icerikTalepleri, talepleriAyikla } from './talepler.mjs';

/**
 * Ekranın seçim listeleri: tablo sütununa bağlı alanlar tablodan (Test verisi > Tablolar; aynı tablodaki alanlar birbirini
 * süzer; formdaki sıraya göre yukarıdan aşağı). Bağlı olmayan alanlar modeldeki seçenekleri kullanır. ortamId verilirse yalnız o
 * ortamda geçerli satırlar.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string | null} [ortamId] @param {string[]} [sira] formdaki alan sırası
 */
function ekranListeleri(vt, projeId, ekranId, ortamId = null, sira = undefined) {
  const baglar = etkinAlanBaglari(vt, ekranId);
  if (!Object.keys(baglar).length) return [];
  const tablolar = tablolariListele(vt, projeId).map((t) => (ortamId ? { ...t, satirlar: t.satirlar.filter((r) => !r.ortamId || r.ortamId === ortamId) } : t));
  return tabloDegerListeleri(baglar, tablolar, ekranId, sira);
}
/**
 * Senaryo ayarı alanlarının (deger-listesi-modeli.mjs senaryoAyariAlanlari) tablo listelerini işaretler (senaryoAyari: true): form
 * bu listeleri seçenek olarak kullanmaz (seçenekler modelin kodlarıdır), yalnız "Tablodan" başvurusu için okur.
 * @template {{ hedef?: { alan?: string } | null }} T @param {T[]} listeler @param {unknown} model @returns {Array<T & { senaryoAyari?: true }>}
 */
function senaryoAyariListeleri(listeler, model) {
  const ayarlar = senaryoAyariAlanlari(model);
  if (!ayarlar.size) return listeler;
  return listeler.map((l) => (l.hedef?.alan && ayarlar.has(l.hedef.alan) ? { ...l, senaryoAyari: /** @type {const} */ (true) } : l));
}
import { kartiNormallestir, krediKartlariAyniMi, senaryoyuDogrula } from '../../dogrulama/senaryo-dogrulayici.mjs';
import {
  MODEL_SPEC_DOSYASI, adresYasakliMi, modelEtiketi, modelGrepDeseni, modelSenaryosuMu, yasakliAdresMesaji
} from './model-kosusu.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Nesne */

/** "Dene" denemelerinin geçici başlık öneki (kalıcı başlık bununla başlayamaz). */
export const DENEME_BASLIK_ON_EKI = '__senaryo_deneme__ ';
export const BASLIK_EN_UZUN = 300;

/** Doğrulayıcı hataları (alan bazında) — HTTP 400 + hatalar. */
export class SenaryoDogrulamaHatasi extends DepoHatasi {
  /** @param {string} mesaj @param {Array<{ alan: string; mesaj: string }>} hatalar @param {Array<{ alan: string; mesaj: string }>} [uyarilar] */
  constructor(mesaj, hatalar, uyarilar = []) {
    super(mesaj);
    this.name = 'SenaryoDogrulamaHatasi';
    this.hatalar = hatalar;
    this.uyarilar = uyarilar;
  }
}

/** Çakışma (o an koşan senaryo, aynı başlık) — HTTP 409. */
export class SenaryoCakismaHatasi extends DepoHatasi {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'SenaryoCakismaHatasi';
  }
}

// ---------------------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------------------

/** @param {unknown} d @returns {d is Nesne} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @template T @param {T} d @returns {T} */
const kopya = (d) => JSON.parse(JSON.stringify(d));

/** İçerikteki Playwright kaynağı (dosya + güncel test başlığı). @param {unknown} icerik */
export function senaryoKaynagi(icerik) {
  const k = nesneMi(icerik) && nesneMi(icerik.kaynak) ? icerik.kaynak : null;
  return k && typeof k.dosya === 'string' && typeof k.ad === 'string' && k.dosya && k.ad ? { dosya: k.dosya, ad: k.ad } : null;
}

/** Koşu listesi / sonuç anahtarı "<dosya>::<başlık>" (kaynak yoksa null). @param {unknown} icerik */
export function senaryoKaynakAnahtari(icerik) {
  const k = senaryoKaynagi(icerik);
  return k ? `${k.dosya}::${k.ad}` : null;
}

/** Senaryonun verisi var mı (veri grubu tanımlı)? @param {unknown} icerik */
export function veriGudumluMu(icerik) {
  return nesneMi(icerik) && nesneMi(icerik.veri) && typeof icerik.veri.dosya === 'string' && typeof icerik.veri.yol === 'string';
}

/** @param {unknown} icerik @returns {string[]} */
const ortamKimlikleri = (icerik) => (nesneMi(icerik) && nesneMi(icerik.ortamlar) ? Object.keys(icerik.ortamlar) : []);

/**
 * "Koşuda" ORTAM BAŞINA: icerik.ortamlar[ortamId].kosuyaDahil (boolean) varsa o, yoksa senaryonun genel değeri
 * (kosuya_dahil sütunu). Sütun, senaryonun en az bir ortamda koşuda olup olmadığını tutar. Senaryo o ortamda tanımlı
 * değilse false.
 * @param {unknown} icerik @param {boolean} genel @param {string} ortamId
 */
export function ortamdaKosuyaDahil(icerik, genel, ortamId) {
  if (!nesneMi(icerik) || !nesneMi(icerik.ortamlar)) return false;
  const o = icerik.ortamlar[ortamId];
  if (!nesneMi(o)) return false;
  return typeof o.kosuyaDahil === 'boolean' ? o.kosuyaDahil : genel;
}

/** Test verisi türlerinde hassas işaretli alan adları (hassas !== false). */
function hassasAdlar(/** @type {Veritabani} */ vt, /** @type {string} */ projeId) {
  return new Set(testVerisiTurleriniListele(vt, projeId).flatMap((t) => t.alanlar.filter((a) => a.hassas !== false).map((a) => a.ad)));
}

/**
 * Modelde "hassas" işaretli alanların senaryo anahtarları (tüm akışlar + senaryo düzeyi). Bu alanlar senaryo verisinde de kasa
 * zarfıyla saklanır (ör. profilden türetilip senaryoya yazılan telefon). @param {unknown} model @returns {string[]}
 */
export function modelHassasAnahtarlari(model) {
  if (!nesneMi(model)) return [];
  /** @type {Set<string>} */
  const adlar = new Set();
  const alan = (/** @type {unknown} */ a) => {
    if (!nesneMi(a) || a.hassas !== true || !nesneMi(a.eslesme)) return;
    const s = a.eslesme.senaryo;
    for (const k of Array.isArray(s) ? s : [s]) if (typeof k === 'string' && k) adlar.add(k);
  };
  const adimlar = [...(Array.isArray(model.adimlar) ? model.adimlar : []), ...(Array.isArray(model.akislar) ? model.akislar.flatMap((/** @type {any} */ x) => (nesneMi(x) && Array.isArray(x.adimlar) ? x.adimlar : [])) : [])];
  for (const adim of adimlar) {
    for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) alan(a);
  }
  for (const a of nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : []) alan(a);
  return [...adlar];
}

/** @param {Veritabani} vt @param {string} projeId @param {unknown} veri @param {string[]} [ekHassas] modelin hassas anahtarları */
function veriyiSifrele(vt, projeId, veri, ekHassas = []) {
  return adliAlanlariDonustur(veri, new Set([...hassasAdlar(vt, projeId), ...ekHassas]), (m) => sifrele(vt, m));
}

/** Senaryonun akışı (içerikte; yoksa null = ekranın varsayılan akışı). @param {unknown} icerik */
export function senaryoAkisi(icerik) {
  return nesneMi(icerik) && typeof icerik.akis === 'string' && icerik.akis ? icerik.akis : null;
}

/**
 * Ekranın en son model sürümü + başvurduğu alt modeller (aynı projede, anahtarı alt model dosya
 * adından ".model.json" atılarak bulunan ekranların modelleri). Model yoksa null.
 * Çoklu akış: model, istenen akışın modelidir (akisModeli; akisId yoksa/bilinmiyorsa varsayılan akış); tamModel akışlarla
 * birlikte ham model; akislar ekranın akış listesi; akisId çözülen akış.
 * surum: tekrar koşusunda o koşudaki model sürümü (verilmezse en son sürüm; o sürüm yoksa null). Alt modeller ve ortak akışlar
 * her zaman son sürümleriyle okunur.
 * @param {Veritabani} vt @param {string} ekranId @param {string | null} [akisId] @param {{ listesiz?: boolean; surum?: number }} [secenekler]
 */
export function modelBaglami(vt, ekranId, akisId = null, secenekler = {}) {
  const kayit = ekranModeliGetir(vt, ekranId, secenekler.surum);
  if (!kayit || !nesneMi(kayit.model) || ['altModel', 'ortakAkis'].includes(kayit.model.tur) || !Array.isArray(kayit.model.adimlar)) return null;
  const tamModel = kayit.model;
  const akislar = akisListesi(tamModel);
  const akis = akislar.find((a) => a.id === akisId) ?? akislar[0];
  const model = /** @type {Nesne} */ (akisModeli(tamModel, akis.id));
  const ekran = vt.tek('SELECT proje_id FROM ekranlar WHERE id = ?', [ekranId]);
  /** @type {Set<string>} */
  const dosyalar = new Set();
  // Alt modeller tüm akışların adımlarından (akış değişince yeniden okunmasın).
  const basvurulari = (/** @type {Nesne} */ m) => {
    const tumAdimlar = [/** @type {Nesne[]} */ (Array.isArray(m.adimlar) ? m.adimlar : []), ...(Array.isArray(m.akislar) ? m.akislar.map((/** @type {Nesne} */ a) => (Array.isArray(a.adimlar) ? a.adimlar : [])) : [])].flat();
    /** @type {string[]} */
    const liste = [];
    for (const adim of /** @type {Nesne[]} */ (tumAdimlar)) {
      if (nesneMi(adim) && nesneMi(adim.altModel) && typeof adim.altModel.dosya === 'string') liste.push(adim.altModel.dosya);
      if (nesneMi(adim) && nesneMi(adim.ortakAkis) && typeof adim.ortakAkis.dosya === 'string') liste.push(adim.ortakAkis.dosya);
    }
    return liste;
  };
  for (const d of basvurulari(tamModel)) dosyalar.add(d);
  const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? /** @type {Nesne[]} */ (model.senaryoDuzeyi.alanlar) : [];
  for (const a of sd) if (nesneMi(a.altModel) && typeof a.altModel.dosya === 'string') dosyalar.add(a.altModel.dosya);
  /** @type {Record<string, Nesne>} */
  const altModeller = {};
  // Başvurulan ekranlar başka ekranlara da başvurabilir (ekran = ortak akış): kuyrukla, döngüye karşı her dosya bir kez okunur.
  const okunan = new Set();
  const kuyruk = [...dosyalar];
  for (let i = 0; i < kuyruk.length; i++) {
    const dosya = kuyruk[i];
    if (okunan.has(dosya)) continue;
    okunan.add(dosya);
    const anahtar = dosya.replace(/\.model\.json$/, '');
    const e = vt.tek('SELECT id FROM ekranlar WHERE proje_id = ? AND anahtar = ? AND durum <> ? ORDER BY rowid', [ekran?.proje_id ?? '', anahtar, 'silindi']);
    const alt = e ? ekranModeliGetir(vt, String(e.id)) : undefined;
    if (alt && nesneMi(alt.model)) {
      altModeller[dosya] = alt.model;
      if (alt.model.tur !== 'altModel') for (const d of basvurulari(alt.model)) if (!okunan.has(d)) kuyruk.push(d);
    }
  }
  // Ortak akış adımları açılır (form, doğrulama ve koşu düz modeli görür; ortak akış hep son sürümüyle).
  const acik = ortakAkislariAc(model, altModeller);
  // Tablo bağlantıları (Test verisi > Tablolar) modelin seçeneklerinin önüne geçer; model yalnız yedektir. listesiz: modelin kendisi.
  const sonModel = secenekler.listesiz || !ekran ? acik.model : modeleListeleriUygula(acik.model, /** @type {any} */ (ekranListeleri(vt, String(ekran.proje_id), ekranId, null, alanSirasi(acik.model, altModeller))));
  return { model: sonModel, altModeller, surum: kayit.surum, tamModel, akislar, akisId: akis.id, eksikOrtakAkislar: acik.eksikler };
}

/** Formdaki alan sırası (tablo bağlantılarında yukarıdan aşağı süzme). @param {Nesne} model @param {Record<string, Nesne>} altModeller */
function alanSirasi(model, altModeller) {
  try { return tumFormAlanlari(formSemasiOlustur(model, altModeller)).map((a) => String(a.id)); } catch { return undefined; }
}

/** @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
function ekranGetir(vt, projeId, ekranId) {
  const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
  if (!e) throw new DepoHatasi('Ekran bulunamadı.');
  return e;
}

/**
 * Yeni senaryonun veri kaynağı (sanal spec yolu + veri grubu): aynı ekranın mevcut bir senaryosundan; yoksa ve ekranın
 * modeli varsa ekran anahtarından türetilir (spec diskte yoktur). Bulunamazsa null (bu ekranda senaryo oluşturulamaz).
 * @param {Veritabani} vt @param {string} projeId @param {{ id: string; anahtar: string }} ekran
 * @returns {{ spec: string; dosya: string; yol: string; model: boolean } | null}
 */
export function ekranVeriKaynagi(vt, projeId, ekran) {
  for (const s of vt.tumu('SELECT icerik_json FROM senaryolar WHERE proje_id = ? AND ekran_id = ? ORDER BY rowid', [projeId, ekran.id])) {
    const icerik = JSON.parse(String(s.icerik_json));
    const kaynak = senaryoKaynagi(icerik);
    if (kaynak && veriGudumluMu(icerik)) {
      return { spec: kaynak.dosya, dosya: String(icerik.veri.dosya), yol: String(icerik.veri.yol), model: nesneMi(icerik.paket) || icerik.kosucu === 'model' };
    }
  }
  if (modelBaglami(vt, ekran.id)) return { spec: `scenarios/${ekran.anahtar}/${ekran.anahtar}.spec.ts`, dosya: ekran.anahtar, yol: 'senaryolar', model: true };
  return null;
}

/** Senaryonun (ortamdaki) verisi — hassas alanlar çözülmüş (kasa açık olmalı). */
function ortamVerisi(/** @type {Veritabani} */ vt, /** @type {Nesne} */ icerik, /** @type {string | null} */ ortamId) {
  if (!veriGudumluMu(icerik) || !nesneMi(icerik.ortamlar)) return null;
  const kimlik = ortamId && nesneMi(icerik.ortamlar[ortamId]) ? ortamId : ortamKimlikleri(icerik).find((o) => nesneMi(/** @type {Nesne} */ (icerik.ortamlar)[o]));
  const o = kimlik ? /** @type {Nesne} */ (/** @type {Nesne} */ (icerik.ortamlar)[kimlik]) : null;
  return o && nesneMi(o.veri) ? /** @type {Nesne} */ (zarflariCoz(vt, o.veri)) : null;
}

/**
 * Senaryonun bu ortamdaki verisi (hassas alanlar çözülmüş; kasa açık olmalı). Senaryo o ortamda tanımlı değilse null.
 * @param {Veritabani} vt @param {Nesne} icerik @param {string} ortamId
 */
export function senaryoOrtamVerisi(vt, icerik, ortamId) {
  return nesneMi(icerik.ortamlar) && nesneMi(icerik.ortamlar[ortamId]) ? ortamVerisi(vt, icerik, ortamId) : null;
}

/** Bağlam profili alanı (model şemasında havuzu bağlam türü olan "profil" alanı). */
function baglamAlani(/** @type {ReturnType<typeof formSemasiOlustur>} */ sema) {
  return tumFormAlanlari(sema).find((a) => a.tip === 'profil') ?? null;
}

// ---------------------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------------------

/**
 * Senaryolar ekranının listesi + sol ekran listesi.
 *  - ortamId verilirse: yalnız o ortamda var olan senaryolar; kosuyaDahil / sonSonuc o ortamın.
 *  - ortamId null ise (BİRLEŞİK): projenin tüm senaryoları; her satırda ortamlar: [{ ortamId, tanimli, kosuyaDahil,
 *    sonSonuc }] (projedeki her ortam için, ortam sırasıyla). Üst düzey kosuyaDahil = en az bir ortamda koşuda,
 *    sonSonuc = ortamlardan en yenisi. Ortamı bilinmeyen (eski) koşuların sonuçları her ortamda sayılır.
 * modelKosusu: senaryo model koşucusuyla çalışır (rozet "model"; bkz. model-kosusu.mjs).
 * @param {Veritabani} vt @param {string} projeId @param {string | null} ortamId
 */
export function senaryoListesi(vt, projeId, ortamId) {
  acikAnahtar(vt);
  /** @type {Map<string, { sema: ReturnType<typeof formSemasiOlustur> | null; model: boolean; akislar: Array<{ id: string; ad: string }> }>} */
  const semalar = new Map();
  const ekranlar = ekranlariListele(vt, projeId);
  const altModelEkranlari = new Set();
  for (const e of ekranlar) {
    const k = ekranModeliGetir(vt, e.id);
    if (k && nesneMi(k.model) && ['altModel', 'ortakAkis'].includes(k.model.tur)) altModelEkranlari.add(e.id);
    const mb = modelBaglami(vt, e.id);
    let sema = null;
    try { sema = mb ? formSemasiOlustur(mb.model, mb.altModeller) : null; } catch { sema = null; }
    semalar.set(e.id, { sema, model: Boolean(mb), akislar: mb ? mb.akislar : [] });
  }
  // Senaryonun akışına göre şema (varsayılan akış: ekranın şeması; diğerleri önbellekle).
  /** @type {Map<string, ReturnType<typeof formSemasiOlustur> | null>} */
  const akisSemalari = new Map();
  const semaAl = (/** @type {string} */ ekranId, /** @type {string | null} */ akis) => {
    const bilgi = semalar.get(ekranId);
    if (!akis || !bilgi || !bilgi.akislar.length || bilgi.akislar[0].id === akis) return bilgi?.sema ?? null;
    const k = `${ekranId}\u0000${akis}`;
    if (!akisSemalari.has(k)) {
      const mb = modelBaglami(vt, ekranId, akis);
      let sema = null;
      try { sema = mb ? formSemasiOlustur(mb.model, mb.altModeller) : null; } catch { sema = null; }
      akisSemalari.set(k, sema);
    }
    return akisSemalari.get(k) ?? null;
  };
  // Son sonuçlar (ORTAM BAŞINA): o ortamın (ya da ortamı bilinmeyen) koşularından, senaryo kimliğine; kimliği
  // olmayan eski sonuçlar için "<dosya>::<başlık>" anahtarına göre en yenisi.
  /** @typedef {{ durum: string; zaman: string; sonucId: string; kosuId: string }} SonSonuc */
  const projeOrtamlari = ortamId ? [ortamId] : ortamlariListele(vt, projeId).map((o) => o.id);
  /** @type {Map<string, { kimlik: Map<string, SonSonuc>; anahtar: Map<string, SonSonuc> }>} */
  const sonlar = new Map(projeOrtamlari.map((o) => [o, { kimlik: new Map(), anahtar: new Map() }]));
  for (const r of vt.tumu(
    `SELECT r.id, r.kosu_id, r.senaryo_id, r.senaryo_anahtari, r.durum, k.ortam_id, COALESCE(r.bitis, k.bitis, k.baslangic) AS zaman
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id
      WHERE k.proje_id = ? ${ortamId ? 'AND (k.ortam_id = ? OR k.ortam_id IS NULL)' : ''} ORDER BY zaman`, ortamId ? [projeId, ortamId] : [projeId]
  )) {
    const s = { durum: String(r.durum), zaman: String(r.zaman), sonucId: String(r.id), kosuId: String(r.kosu_id) };
    const hedefler = r.ortam_id == null ? [...sonlar.values()] : [sonlar.get(String(r.ortam_id))].filter((x) => x !== undefined);
    for (const m of hedefler) {
      if (r.senaryo_id) m.kimlik.set(String(r.senaryo_id), s);
      if (r.senaryo_anahtari) m.anahtar.set(String(r.senaryo_anahtari), s);
    }
  }
  /** @param {string} o @param {string} id @param {string | null} anahtar @returns {SonSonuc | null} */
  const sonSonucu = (o, id, anahtar) => {
    const m = sonlar.get(o);
    return (m && (m.kimlik.get(id) ?? (anahtar ? m.anahtar.get(anahtar) : undefined))) ?? null;
  };
  const ekranAdi = new Map(ekranlar.map((e) => [e.id, e.ad]));
  const ekranDurumu = new Map(ekranlar.map((e) => [e.id, e.durum]));
  const satirlar = [];
  /** @type {Map<string, number>} */
  const sayilar = new Map();
  for (const s of vt.tumu('SELECT * FROM senaryolar WHERE proje_id = ? ORDER BY baslik', [projeId])) {
    const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
    const tanimlilar = ortamKimlikleri(icerik);
    if (ortamId && !tanimlilar.includes(ortamId)) continue;
    const ekranId = s.ekran_id == null ? null : String(s.ekran_id);
    const bilgi = ekranId ? semalar.get(ekranId) : undefined;
    const veri = ortamVerisi(vt, icerik, ortamId);
    const akisId = senaryoAkisi(icerik);
    const sema = ekranId ? semaAl(ekranId, akisId) : null;
    const akislar = bilgi?.akislar ?? [];
    // Birden çok akışlı ekranda senaryonun akışı (listede gösterilir).
    const akis = akislar.length > 1 ? akislar.find((a) => a.id === akisId) ?? akislar[0] : null;
    const profilAlani = sema ? baglamAlani(sema) : null;
    const profilDegeri = profilAlani && veri && typeof veri[profilAlani.anahtar] === 'string' ? String(veri[profilAlani.anahtar]) : null;
    const anahtar = senaryoKaynakAnahtari(icerik);
    const genelDahil = s.kosuya_dahil === 1;
    const ortamlar = projeOrtamlari.map((o) => {
      const tanimli = tanimlilar.includes(o);
      return { ortamId: o, tanimli, kosuyaDahil: tanimli && ortamdaKosuyaDahil(icerik, genelDahil, o), sonSonuc: tanimli ? sonSonucu(o, String(s.id), anahtar) : null };
    });
    const sonuc = ortamId ? ortamlar[0].sonSonuc
      : ortamlar.map((o) => o.sonSonuc).filter((x) => x !== null).sort((a, b) => b.zaman.localeCompare(a.zaman))[0] ?? null;
    const kurallar = nesneMi(icerik.alanKurallari) && Array.isArray(icerik.alanKurallari.mutlakaGorunmeli) ? icerik.alanKurallari.mutlakaGorunmeli : [];
    sayilar.set(ekranId ?? '', (sayilar.get(ekranId ?? '') ?? 0) + 1);
    satirlar.push({
      id: String(s.id), baslik: String(s.baslik), ekranId, ekranAdi: ekranId ? ekranAdi.get(ekranId) ?? null : null,
      // Ekran devre dışıysa senaryo hiçbir koşuya girmez (Koşuyu başlat, ▷, npm run test; bkz. ekran-yonetimi.mjs).
      ekranEtkin: ekranId ? ekranDurumu.get(ekranId) !== 'devre_disi' : true,
      kosuyaDahil: ortamId ? ortamlar[0].kosuyaDahil : ortamlar.some((o) => o.kosuyaDahil), veriGudumlu: veriGudumluMu(icerik), modelVar: Boolean(bilgi?.model),
      kaynak: senaryoKaynagi(icerik),
      baglamProfili: profilAlani ? { deger: profilDegeri, varsayilan: profilDegeri ? false : true, ad: profilDegeri ?? profilAlani.varsayilanProfil } : null,
      beklenenSonuc: sema && veri ? beklenenSonucEtiketi(sema, veri) : null,
      sonSonuc: sonuc, mutlakaGorunmeliSayisi: kurallar.length, paketten: nesneMi(icerik.paket),
      akis: akis ? { id: akis.id, ad: akis.ad } : null,
      modelKosusu: modelSenaryosuMu(icerik),
      // Tarihi geçmiş (ya da bugün koşulursa sınır dışında kalan) SABİT tarih değerleri: listede "tarih eskidi" rozeti.
      eskiyenTarihler: sema && veri ? eskiyenTarihAlanlari(tumFormAlanlari(sema), veri, new Date(), String(s.guncellenme)).map((e) => ({ anahtar: e.anahtar, etiket: e.etiket, deger: e.deger, mesaj: e.mesaj })) : [],
      guncellenme: String(s.guncellenme),
      // Talep numaraları (listede süzme ve "Bu talebin senaryolarını koş").
      talepler: icerikTalepleri(icerik),
      // Hızlı testle oluşturulan ve henüz doğrulanmamış (Hayır izni) senaryo: listede "doğrulanmadı" rozeti için.
      ...(nesneMi(icerik.hizliTest) ? { hizliTest: { izin: icerik.hizliTest.izin, dogrulandi: icerik.hizliTest.dogrulandi === true } } : {}),
      ...(ortamId ? {} : { ortamlar })
    });
  }
  return {
    ekranlar: ekranlar.filter((e) => !altModelEkranlari.has(e.id)).map((e) => ({
      id: e.id, anahtar: e.anahtar, ad: e.ad, senaryoSayisi: sayilar.get(e.id) ?? 0, durum: e.durum,
      modelVar: Boolean(semalar.get(e.id)?.model), olusturulabilir: Boolean(semalar.get(e.id)?.sema) && Boolean(ekranVeriKaynagi(vt, projeId, e))
    })),
    senaryolar: satirlar
  };
}

// ---------------------------------------------------------------------------------------
// Ayrıntı ve form bağlamı
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} id @param {string | null} ortamId */
export function senaryoDetayi(vt, id, ortamId) {
  acikAnahtar(vt);
  const s = senaryoGetir(vt, id);
  if (!s) throw new DepoHatasi('Senaryo bulunamadı.');
  const icerik = s.icerik;
  const kurallar = nesneMi(icerik.alanKurallari) && Array.isArray(icerik.alanKurallari.mutlakaGorunmeli)
    ? icerik.alanKurallari.mutlakaGorunmeli.filter((x) => typeof x === 'string') : [];
  return {
    id: s.id, projeId: s.projeId, ekranId: s.ekranId, baslik: s.baslik, kosuyaDahil: s.kosuyaDahil,
    veriGudumlu: veriGudumluMu(icerik), kaynak: senaryoKaynagi(icerik), ortamlar: ortamKimlikleri(icerik),
    veri: ortamVerisi(vt, icerik, ortamId), mutlakaGorunmeli: kurallar, olusturulma: s.olusturulma, guncellenme: s.guncellenme,
    akis: senaryoAkisi(icerik),
    // Giriş seçimi (senaryo-girisi.mjs): null = ortamın girişiyle (varsayılan).
    giris: senaryoGirisi(icerik),
    // Adım ekran görüntüsü seçimi (null = Ayarlar > Koşu > Kayıt'a uyar, varsayılan).
    adimGoruntusu: senaryoAdimGoruntusuAyikla(icerik.adimGoruntusu).secim,
    // Satır seçimleri ({ "<tabloId>|<etiket>": { Sütun: değer } }; ${Tablo.Sütun} değerleri koşuda bu satırdan çözülür).
    tabloSecimleri: nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : null,
    // Çalıştırma biçimi (tablodan çoklu satır; yoksa null = her grup tek satır, bugünkü davranış).
    veriKosulari: nesneMi(icerik.veriKosulari) ? icerik.veriKosulari : null,
    // Talep numaraları (serbest metin; yoksa boş liste).
    talepler: icerikTalepleri(icerik),
    // Hızlı testle oluşturulduysa: izin, bitiş koşulu, doğrulandı mı (yoksa null).
    hizliTest: nesneMi(icerik.hizliTest) ? icerik.hizliTest : null
  };
}

/**
 * Senaryonun seçili ortamdaki (ya da ortamı bilinmeyen koşulardaki) EN SON sonucu — senaryo kimliğiyle; kimliği olmayan
 * eski sonuçlar için kaynak anahtarıyla (senaryo listesindeki "son sonuç" ile aynı kural). Yoksa null.
 * @param {Veritabani} vt @param {string} id @param {string} ortamId
 * @returns {{ sonucId: string; kosuId: string; durum: string; zaman: string } | null}
 */
export function senaryoSonSonucu(vt, id, ortamId) {
  const s = senaryoGetir(vt, id);
  if (!s) throw new DepoHatasi('Senaryo bulunamadı.');
  const sorgu = (kosul, deger) => vt.tek(
    `SELECT r.id, r.kosu_id, r.durum, COALESCE(r.bitis, k.bitis, k.baslangic) AS zaman
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id
      WHERE ${kosul} AND (k.ortam_id = ? OR k.ortam_id IS NULL) ORDER BY zaman DESC, r.rowid DESC LIMIT 1`, [deger, ortamId]
  );
  const anahtar = senaryoKaynakAnahtari(s.icerik);
  const r = sorgu('r.senaryo_id = ?', id) ?? (anahtar ? sorgu('r.senaryo_anahtari = ?', anahtar) : undefined);
  return r ? { sonucId: String(r.id), kosuId: String(r.kosu_id), durum: String(r.durum), zaman: String(r.zaman) } : null;
}

/**
 * Model tabanlı formun bağlamı: model + alt modeller, profil havuzlarının seçenekleri (bağlam
 * profilleri: ad + alanlar; test verisi profilleri: ad + MASKELİ önizleme), tarayıcı doğrulama
 * bağlamı ve ekranın veri kaynağı. Modeli olmayan ekranda model: null.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {string | null} [akisId]
 */
export function formBaglami(vt, projeId, ekranId, ortamId, akisId = null) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, projeId, ekranId);
  const ortamlar = ortamlariListele(vt, projeId).map((o) => ({ id: o.id, ad: o.ad, varsayilan: o.varsayilan }));
  if (!ortamlar.some((o) => o.id === ortamId)) throw new DepoHatasi('Ortam bulunamadı.');
  const mb = modelBaglami(vt, ekranId, akisId);
  const veriKaynagi = ekranVeriKaynagi(vt, projeId, ekran);
  if (!mb) return { ekran, ortamlar, model: null, altModeller: {}, profiller: {}, veriKaynagi, olusturulabilir: false, akislar: [], akisId: null };
  const sema = formSemasiOlustur(mb.model, mb.altModeller);
  /** @type {Set<string>} */
  const havuzlar = new Set();
  for (const a of tumFormAlanlari(sema)) {
    if (a.tip === 'profil') havuzlar.add(a.profilHavuzu);
    if (a.tip === 'kimlik' && a.profilHavuzu) {
      if (typeof a.profilHavuzu === 'string') havuzlar.add(a.profilHavuzu);
      else Object.values(a.profilHavuzu).forEach((h) => havuzlar.add(h));
    }
  }
  const turler = testVerisiTurleriniListele(vt, projeId);
  const ortamdaMi = (/** @type {string | null} */ o) => o === null || o === ortamId;
  /** @type {Record<string, Array<{ ad: string; tur: 'baglam' | 'testVerisi'; kapsam: 'tum' | 'ortam'; alanlar: Array<{ etiket: string; deger?: string; dolu: boolean }> }>>} */
  const profiller = {};
  for (const havuz of havuzlar) {
    // Havuz adı: aynı adlı test verisi türü varsa test verisi (ör. kimlik profilleri), yoksa bağlam türü (ör. "Şube").
    const t = turler.some((x) => x.ad === havuz) ? { tur: 'testVerisi', ad: havuz } : { tur: 'baglam', ad: havuz };
    /** @type {Map<string, (typeof profiller)[string][number]>} */
    const liste = new Map();
    if (t.tur === 'baglam') {
      for (const p of baglamProfilleriniListele(vt, projeId, t.ad).filter((x) => ortamdaMi(x.ortamId)).sort((a, b) => Number(a.ortamId !== null) - Number(b.ortamId !== null))) {
        liste.set(p.ad, {
          ad: p.ad, tur: 'baglam', kapsam: p.ortamId ? 'ortam' : 'tum',
          alanlar: Object.entries(p.alanlar ?? {}).slice(0, 4).map(([k, v]) => ({ etiket: k, deger: typeof v === 'string' ? v : JSON.stringify(v), dolu: v !== '' && v != null }))
        });
      }
    } else {
      const tur = turler.find((x) => x.ad === t.ad);
      if (!tur) continue;
      for (const p of testVerisiProfilleriniListele(vt, projeId, tur.id).filter((x) => ortamdaMi(x.ortamId)).sort((a, b) => Number(a.ortamId !== null) - Number(b.ortamId !== null))) {
        liste.set(p.ad, {
          ad: p.ad, tur: 'testVerisi', kapsam: p.ortamId ? 'ortam' : 'tum',
          // Maskeli önizleme: hassas alanların DEĞERİ gönderilmez, yalnızca dolu olup olmadığı.
          alanlar: tur.alanlar.map((a) => ({
            etiket: a.etiket, dolu: a.hassas ? p.doluHassasAlanlar.includes(a.ad) : p.degerler[a.ad] !== undefined && p.degerler[a.ad] !== null && p.degerler[a.ad] !== '',
            ...(a.hassas ? {} : { deger: p.degerler[a.ad] == null ? '' : String(p.degerler[a.ad]) })
          }))
        });
      }
    }
    profiller[havuz] = [...liste.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }
  return {
    ekran, ortamlar, model: mb.model, altModeller: mb.altModeller, modelSurumu: mb.surum, profiller, akislar: mb.akislar, akisId: mb.akisId,
    veriKaynagi,
    olusturulabilir: Boolean(veriKaynagi),
    // Senaryonun "Giriş" seçimi için giriş profillerinin ADLARI (değer yok; ortamId null = tüm ortamlar).
    girisProfilleri: girisProfilleriniListele(vt, projeId).map((p) => ({ ad: p.ad, ortamId: p.ortamId })),
    // Bu ekranın seçim listeleri (tablo bağlantıları + değer listeleri): seçim alanlarının seçeneklerini süzer. Senaryo ayarının
    // listesi (senaryoAyari: true) seçenekleri değiştirmez (kodlar modelden); yalnız "Tablodan" başvurusu için kullanılır.
    degerListeleri: senaryoAyariListeleri(ekranListeleri(vt, projeId, ekranId, ortamId, tumFormAlanlari(sema).map((a) => String(a.id))), mb.model),
    // Gizli sütuna (ör. CVV, parola) bağlı alanlar: değer listesine girmez; formun "Tablodan" başvurusu için yalnız tablo ve sütun ADI.
    // Kayıt tablosuna (tür 'kayit') bağlı alanlar ve kayıt tablolarının adları: form aynı tablo + etiketteki alanları tek KAYIT GRUBU
    // ("Hazır kayıt / Yeni") olarak gösterir (değer yok; satırlar formda /platform/tablolar'dan okunur).
    ...tabloBaglariOzeti(vt, projeId, ekranId)
  };
}

/**
 * Ekranın tablo bağlarının özeti (değer YOK): gizli sütuna bağlı alanlar (alan → tablo / sütun adı, etiket?), kayıt tablosuna bağlı
 * alanlar (alan → tablo / sütun adı, etiket?, gizli mi) ve projedeki kayıt tablolarının adları.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 */
function tabloBaglariOzeti(vt, projeId, ekranId) {
  const baglar = etkinAlanBaglari(vt, ekranId);
  const tablolar = tablolariListele(vt, projeId);
  const kayitIdleri = new Set(tablolar.filter((t) => tabloTuru(t, tabloEkranKullanimi(vt, projeId)) === 'kayit').map((t) => t.id));
  /** @type {Record<string, { tablo: string; sutun: string; etiket?: string }>} */
  const gizliBaglar = {};
  /** @type {Record<string, { tablo: string; sutun: string; etiket?: string; gizli: boolean }>} */
  const kayitBaglari = {};
  for (const [alan, b] of Object.entries(baglar)) {
    const t = tablolar.find((x) => x.id === b.tablo);
    const s = t ? t.sutunlar.find((c) => c.ad === b.sutun) : undefined;
    if (!t || !s) continue;
    const ozet = { tablo: t.ad, sutun: s.ad, ...(b.etiket ? { etiket: String(b.etiket) } : {}) };
    if (s.gizli) gizliBaglar[alan] = ozet;
    if (kayitIdleri.has(t.id)) kayitBaglari[alan] = { ...ozet, gizli: s.gizli === true };
  }
  return { gizliBaglar, kayitBaglari, kayitTablolari: tablolar.filter((t) => kayitIdleri.has(t.id)).map((t) => t.ad) };
}

/**
 * Değer listesi formu için ekranın inputları: kimlik, etiket, tip ve seçenekler (bağımlı alanlarda tüm seçeneklerin birleşimi).
 * Modeli olmayan ekranda boş liste.
 * tumTipler: onay kutusu ve dosya alanları da (ekranın "Test verisi" sekmesi: bu alanlar da tablo sütununa bağlanabilir).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {{ tumTipler?: boolean }} [secenekler]
 */
export function ekranGirdileri(vt, projeId, ekranId, secenekler = {}) {
  acikAnahtar(vt);
  ekranGetir(vt, projeId, ekranId);
  // Ortak akış (kendi başına koşmaz): kendi modelinin alanları (Test verisi sekmesi; bağları onu kullanan ekranlara geçer).
  const kayit = ekranModeliGetir(vt, ekranId);
  const ortak = kayit && nesneMi(kayit.model) && kayit.model.tur === 'ortakAkis' && Array.isArray(kayit.model.adimlar) ? /** @type {Nesne} */ (kayit.model) : null;
  const mb = ortak ? { model: ortak, altModeller: {} } : modelBaglami(vt, ekranId, null);
  if (!mb) return { girdiler: [] };
  const sema = formSemasiOlustur(mb.model, mb.altModeller);
  // Seçenekler sayfa değeri / metniyle (liste kaydında korunur; model seçeneği kaldırılsa da koşu doğru seçer).
  const hamSecenekler = new Map(modelSecimAlanlari(mb.model).map((a) => [a.id, [...(Array.isArray(a.secenekler) ? a.secenekler : []),
    ...Object.values(a.bagimlilik?.secenekHaritasi || {}).flat()].filter((s) => s && typeof s === 'object').map(listeDegeri)]));
  const tipler = ['secim', 'metin', 'sayi', 'tarih', 'telefon', ...(secenekler.tumTipler ? ['onayKutusu', 'dosya'] : [])];
  // Senaryo ayarı (ekranda karşılığı olmayan, akışı dallandıran seçim; ör. ekrandaAlanDegil): senaryoAyari işaretiyle (Test verisi
  // sekmesinde rozet; karşılıklar seçenek metni → kod olarak dolar, tablolar/karsiliklar.mjs).
  const ayarlar = senaryoAyariAlanlari(mb.model);
  const girdiler = tumFormAlanlari(sema).filter((a) => a.anahtar && tipler.includes(a.tip)).map((a) => {
    /** @type {Map<string, { deger: string; metin: string; ekranDegeri?: string; ekranMetni?: string }>} */
    const s = new Map();
    for (const x of hamSecenekler.get(a.id) || []) if (!s.has(x.deger)) s.set(x.deger, { deger: x.deger, metin: x.aciklama || x.deger, ...(x.ekranDegeri ? { ekranDegeri: x.ekranDegeri } : {}), ...(x.ekranMetni ? { ekranMetni: x.ekranMetni } : {}) });
    for (const x of [...(a.secenekler || []), ...Object.values(a.bagimlilik?.harita || {}).flat()]) if (!s.has(x.deger)) s.set(x.deger, { deger: x.deger, metin: x.metin });
    return { id: a.id, etiket: a.etiket, tip: a.tip, secenekler: [...s.values()], ...(ayarlar.has(String(a.id)) ? { senaryoAyari: true } : {}) };
  });
  return { girdiler };
}

// ---------------------------------------------------------------------------------------
// Doğrulama + kaydet
// ---------------------------------------------------------------------------------------

/**
 * Senaryo verisini seçilen HER ortamın bağlamıyla doğrular; alt model (kayıt) alanlarını tek biçime
 * getirir ve varsayılan kayıtla aynıysa kaldırır. Hata varsa SenaryoDogrulamaHatasi.
 * @returns {{ veri: Nesne; uyarilar: Array<{ alan: string; mesaj: string }> }}
 */
function veriyiDogrula(/** @type {Veritabani} */ vt, /** @type {string} */ projeId, /** @type {{ model: Nesne; altModeller: Record<string, Nesne> }} */ mb,
  /** @type {Nesne} */ veri, /** @type {string[]} */ ortamIdleri, /** @type {Map<string, string>} */ ortamAdlari,
  /** @type {{ tabloSecimleri?: unknown; veriKosulari?: unknown }} */ satirlar = {}) {
  const sema = formSemasiOlustur(mb.model, mb.altModeller);
  let sonuc = kopya(veri);
  // Değeri ${Tablo.Sütun} olan alanlar: tablo ve sütun projede olmalı (değer koşuda seçilen satırdan gelir; ekran-basvurulari.mjs).
  const tamTablolar = tabloBasvurusuVarMi(veri) ? tablolariListele(vt, projeId) : undefined;
  const tablolar = tamTablolar?.map((t) => ({ ad: t.ad, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli })) }));
  // Koşullar (görünürlük) tablodan gelen değerle, senaryonun seçtiği satırdan TEK değer çıkıyorsa değerlendirilir (formla aynı kural).
  const tabloSecimleri = nesneMi(satirlar.tabloSecimleri) ? /** @type {Record<string, Record<string, string>>} */ (satirlar.tabloSecimleri) : null;
  const veriKosulari = nesneMi(satirlar.veriKosulari) ? /** @type {{ gruplar?: Record<string, { kip: string; satirlar?: string[] }> }} */ (satirlar.veriKosulari) : null;
  const tabloDegeri = (/** @type {string} */ ortamId) => tamTablolar
    ? (/** @type {import('../tablolar/tablo-secimi.mjs').Basvuru} */ b) => basvurununTekDegeri(tamTablolar, b, { tabloSecimleri, veriKosulari, ortamIdler: [ortamId] })
    : undefined;
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const hatalar = [];
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const uyarilar = [];
  const birden = ortamIdleri.length > 1;
  for (const ortamId of ortamIdleri) {
    // Profil bağlamı (havuzlar / bağlam profilleri / varsayılan kayıt) şu an verilmiyor: ilgili kontroller atlanır.
    /** @type {{ varsayilanKayit?: Nesne | null } | undefined} */
    const profiller = undefined;
    // Alt model ezme (ör. senaryoya özel kayıt): tek biçim + varsayılan kayıtla aynıysa yazılmaz.
    for (const alan of tumFormAlanlari(sema)) {
      if (alan.tip !== 'altModel' || !nesneMi(sonuc[alan.anahtar])) continue;
      // Alt model alanları modelde "eslesme.kayitAlani" ile tanımlıdır (kayıt kuralları doğrulayıcıdadır).
      if (!alan.alanlar.length) continue;
      const on = senaryoyuDogrula(sonuc, { model: mb.model, altModeller: mb.altModeller, profiller, kaynak: 'kayit', tablolar, tabloDegeri: tabloDegeri(ortamId) });
      if (on.hatalar.some((h) => h.alan.startsWith(`${alan.anahtar}.`) || h.alan === alan.anahtar)) continue;
      const varsayilan = profiller && nesneMi(profiller.varsayilanKayit) ? profiller.varsayilanKayit : null;
      const kart = kartiNormallestir(/** @type {Nesne} */ (sonuc[alan.anahtar]), varsayilan);
      if (varsayilan && krediKartlariAyniMi(kart, varsayilan)) delete sonuc[alan.anahtar];
      else sonuc[alan.anahtar] = kart;
    }
    const d = senaryoyuDogrula(sonuc, { model: mb.model, altModeller: mb.altModeller, profiller, kaynak: 'kayit', tablolar, tabloDegeri: tabloDegeri(ortamId) });
    const onEk = birden ? `[${ortamAdlari.get(ortamId) ?? ortamId}] ` : '';
    for (const h of d.hatalar) if (!hatalar.some((x) => x.alan === h.alan && x.mesaj.endsWith(h.mesaj))) hatalar.push({ alan: h.alan, mesaj: `${onEk}${h.mesaj}` });
    for (const u of d.uyarilar) if (!uyarilar.some((x) => x.alan === u.alan && x.mesaj.endsWith(u.mesaj))) uyarilar.push({ alan: u.alan, mesaj: `${onEk}${u.mesaj}` });
  }
  if (hatalar.length) {
    throw new SenaryoDogrulamaHatasi(hatalar.length === 1 ? hatalar[0].mesaj : `${hatalar.length} alan düzeltilmeli.`, hatalar, uyarilar);
  }
  sonuc = kopya(sonuc);
  return { veri: sonuc, uyarilar };
}

/**
 * Tablodan gelen SENARYO AYARLARI (deger-listesi-modeli.mjs senaryoAyariAlanlari; değeri ${Tablo.Sütun}): koşuya girecek satırların
 * (veri koşusunda her koşunun satırı; tek satırda seçimlerle uyan tüm satırlar) değeri seçenek koduna çevrilebilmeli
 * (ekran-basvurulari.mjs ayarKoduCoz). Çevrilemeyen değer SenaryoDogrulamaHatasi (alan: ayarın senaryo anahtarı).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {Nesne} model
 * @param {Record<string, Nesne>} ortamVerileri ortamId → çözülmüş veri @param {Nesne} icerik tabloSecimleri / veriKosulari için
 * @param {Map<string, string>} ortamAdlari
 */
function ayarTablolariniDenetle(vt, projeId, ekranId, model, ortamVerileri, icerik, ortamAdlari) {
  const bilgi = modelAlanBilgisi(model);
  if (!Object.keys(bilgi.ayarSecenekleri).length || !Object.values(ortamVerileri).some((v) => tabloBasvurusuVarMi(v))) return;
  const tablolar = tablolariListele(vt, projeId);
  const baglar = etkinAlanBaglari(vt, ekranId);
  const tabloSecimleri = nesneMi(icerik.tabloSecimleri) ? /** @type {Record<string, Record<string, string>>} */ (icerik.tabloSecimleri) : undefined;
  const birden = Object.keys(ortamVerileri).length > 1;
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const hatalar = [];
  for (const [ortamId, veri] of Object.entries(ortamVerileri)) {
    const acilim = veriKosulariniAc(/** @type {import('../tablolar/veri-kosulari.mjs').VeriKosulari | undefined} */ (icerik.veriKosulari), { tablolar, gruplar: basvuruGruplari(veri, tablolar), ortamId, tabloSecimleri: tabloSecimleri ?? null });
    const sabitler = acilim.kosular.length ? acilim.kosular.map((k) => k.satirlar) : [undefined];
    for (const sabit of sabitler) {
      const s = { tablolar, baglar, ...bilgi, ortamId, ...(tabloSecimleri ? { tabloSecimleri } : {}), ...(sabit ? { satirSecimi: { sabit } } : {}) };
      for (const h of ayarBasvurulariniDenetle(veri, s)) {
        const mesaj = `${birden ? `[${ortamAdlari.get(ortamId) ?? ortamId}] ` : ''}${h.mesaj}`;
        if (!hatalar.some((x) => x.alan === h.alan)) hatalar.push({ alan: h.alan, mesaj });
      }
    }
  }
  if (hatalar.length) throw new SenaryoDogrulamaHatasi(hatalar.length === 1 ? hatalar[0].mesaj : `${hatalar.length} alan düzeltilmeli.`, hatalar);
}

/**
 * Satır seçimlerini projenin tablolarına göre denetler (gizli sütun / olmayan tablo ya da sütun → SenaryoDogrulamaHatasi, alan
 * "tabloSecimleri"). Boşsa undefined. @param {Veritabani} vt @param {string} projeId @param {unknown} v
 */
function tabloSecimleriDenetle(vt, projeId, v) {
  if (v === null || v === undefined || (nesneMi(v) && !Object.keys(v).length)) return undefined;
  const t = tabloSecimleriniAyikla(v, tablolariListele(vt, projeId));
  if (t.hatalar.length) throw new SenaryoDogrulamaHatasi(t.hatalar[0], t.hatalar.map((mesaj) => ({ alan: 'tabloSecimleri', mesaj })));
  return t.secimler;
}

/**
 * Mevcut senaryonun ORTAM BAŞINA verisini ve (verilirse) satır seçimlerini yazar; ortamların sırası, Koşuda, başlık ve diğer
 * içerik değişmez (ör. toplu dönüşüm: tablolar/ekran-donusumu.mjs). Her ortamın verisi o ortamın bağlamında TEK doğrulayıcıyla
 * denetlenir; denetlenecekAlanlar verilirse yalnız o alanlardaki hatalar kaydı engeller (senaryoda önceden var olan hatalar
 * yeni değişikliği engellemesin). Hassas alanlar kasa zarfıyla yazılır; kayıt değişiklik geçmişine düşer (önceki içerik geri
 * alınabilir kalır). O an koşan senaryo değiştirilemez.
 * @param {Veritabani} vt
 * @param {{ projeId: string; id: string; ortamVerileri: Record<string, Nesne>; tabloSecimleri?: unknown; denetlenecekAlanlar?: string[]; yapan?: string }} girdi
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean }} [secenekler]
 * @returns {{ id: string; uyarilar: Array<{ alan: string; mesaj: string }> }}
 */
export function senaryoOrtamVerileriniYaz(vt, girdi, secenekler = {}) {
  acikAnahtar(vt);
  const mevcut = senaryoGetir(vt, girdi.id);
  if (!mevcut || mevcut.projeId !== girdi.projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  const kaynak = senaryoKaynagi(mevcut.icerik);
  if (!kaynak || !veriGudumluMu(mevcut.icerik) || !mevcut.ekranId) throw new DepoHatasi('Bu senaryonun biçimi desteklenmiyor (kodlu testlerden kalma).');
  if (secenekler.kosuyorMu?.(kaynak.dosya, kaynak.ad)) throw new SenaryoCakismaHatasi(`"${mevcut.baslik}" şu anda koşuyor (ya da sırada); bitmesini bekleyin.`);
  const mb = modelBaglami(vt, mevcut.ekranId, senaryoAkisi(mevcut.icerik));
  if (!mb) throw new DepoHatasi('Bu ekranın modeli yok; senaryo verisi yalnızca ekran modeliyle düzenlenebilir.');
  const icerik = kopya(mevcut.icerik);
  const ortamlar = /** @type {Record<string, Nesne>} */ (nesneMi(icerik.ortamlar) ? icerik.ortamlar : {});
  const ortamAdlari = new Map(ortamlariListele(vt, girdi.projeId).map((o) => [o.id, o.ad]));
  const tablolar = tablolariListele(vt, girdi.projeId).map((t) => ({ ad: t.ad, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli })) }));
  const ilgili = (/** @type {string} */ alan) => !girdi.denetlenecekAlanlar || girdi.denetlenecekAlanlar.some((a) => alan === a || alan.startsWith(`${a}.`));
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const uyarilar = [];
  for (const [ortamId, veri] of Object.entries(girdi.ortamVerileri)) {
    if (!nesneMi(ortamlar[ortamId])) throw new DepoHatasi('Senaryo bu ortamda tanımlı değil.');
    const d = senaryoyuDogrula(veri, { model: mb.model, altModeller: mb.altModeller, kaynak: 'kayit', tablolar });
    const onEk = ortamAdlari.size > 1 ? `[${ortamAdlari.get(ortamId) ?? ortamId}] ` : '';
    const engel = d.hatalar.filter((h) => ilgili(h.alan)).map((h) => ({ alan: h.alan, mesaj: `${onEk}${h.mesaj}` }));
    if (engel.length) throw new SenaryoDogrulamaHatasi(`"${mevcut.baslik}": ${engel[0].mesaj}`, engel);
    uyarilar.push(...d.uyarilar.filter((u) => ilgili(u.alan)).map((u) => ({ alan: u.alan, mesaj: `${onEk}${u.mesaj}` })));
    ortamlar[ortamId] = { ...ortamlar[ortamId], veri: veriyiSifrele(vt, girdi.projeId, veri, modelHassasAnahtarlari(mb.model)) };
  }
  icerik.ortamlar = ortamlar;
  if (girdi.tabloSecimleri !== undefined) {
    const t = tabloSecimleriDenetle(vt, girdi.projeId, girdi.tabloSecimleri);
    if (t) icerik.tabloSecimleri = t;
    else delete icerik.tabloSecimleri;
  }
  const id = depoSenaryoKaydet(vt, { id: mevcut.id, projeId: girdi.projeId, ekranId: mevcut.ekranId, baslik: mevcut.baslik, icerik, kosuyaDahil: mevcut.kosuyaDahil, yapan: girdi.yapan });
  return { id, uyarilar };
}

/** @param {unknown} d */
function baslikKontrol(d) {
  if (typeof d !== 'string' || !d.trim()) throw new SenaryoDogrulamaHatasi('Senaryo başlığı zorunludur.', [{ alan: 'baslik', mesaj: 'Senaryo başlığı zorunludur.' }]);
  const b = d.trim().replace(/\s+/g, ' ');
  if (b.length > BASLIK_EN_UZUN) throw new SenaryoDogrulamaHatasi(`Başlık en fazla ${BASLIK_EN_UZUN} karakter olabilir.`, [{ alan: 'baslik', mesaj: `Başlık en fazla ${BASLIK_EN_UZUN} karakter olabilir.` }]);
  if (b.startsWith(DENEME_BASLIK_ON_EKI.trim())) throw new SenaryoDogrulamaHatasi('Bu başlık önekine izin verilmiyor.', [{ alan: 'baslik', mesaj: 'Bu başlık önekine izin verilmiyor (deneme koşularına ayrılmıştır).' }]);
  return b;
}

/**
 * Aynı spec dosyasında aynı başlıklı başka senaryo var mı? (Playwright aynı dosyada aynı başlığa izin
 * vermez; koşu listesi ve sonuç anahtarları "<dosya>::<başlık>" olduğu için tekil olmalı.)
 */
function baslikCakisiyorMu(/** @type {Veritabani} */ vt, /** @type {string} */ projeId, /** @type {string} */ dosya, /** @type {string} */ baslik, /** @type {string | null} */ haricId) {
  return vt.tumu('SELECT id, icerik_json FROM senaryolar WHERE proje_id = ?', [projeId]).some((s) => {
    if (haricId && String(s.id) === haricId) return false;
    const k = senaryoKaynagi(JSON.parse(String(s.icerik_json)));
    return k !== null && k.dosya === dosya && k.ad === baslik;
  });
}

/** Ortamdaki veri dizisinde sıradaki "sira". */
function sonrakiSira(/** @type {Veritabani} */ vt, /** @type {string} */ projeId, /** @type {{ dosya: string; yol: string }} */ veri, /** @type {string} */ ortamId) {
  let enBuyuk = -1;
  for (const s of vt.tumu('SELECT icerik_json FROM senaryolar WHERE proje_id = ?', [projeId])) {
    const icerik = JSON.parse(String(s.icerik_json));
    if (!veriGudumluMu(icerik) || icerik.veri.dosya !== veri.dosya || icerik.veri.yol !== veri.yol) continue;
    const o = nesneMi(icerik.ortamlar) ? icerik.ortamlar[ortamId] : null;
    if (nesneMi(o) && typeof o.sira === 'number') enBuyuk = Math.max(enBuyuk, o.sira);
  }
  return enBuyuk + 1;
}

/** @param {unknown} v */
const kucukMetin = (v) => String(v ?? '').trim().toLocaleLowerCase('tr');

/**
 * Kayıt grubu "Yeni (elle gir)" + "Bu kaydı tabloya da ekle": gruptaki alanların (doğrulanmış, düz) değerleri tabloya YENİ SATIR
 * olarak eklenir; senaryo o satıra başvurur (alanlar ${Tablo[etiket].Sütun|biçim}, tabloSecimleri = satırın açık değerleri).
 * Çağıran işlemin (senaryoKaydet'in vt.islem'i) içinde çalışır: sonradan bir hata olursa tablo satırı da yazılmaz.
 *  - Satırın ortamı: senaryonun ortamı tekse o ortam, birden çoksa tüm ortamlar (null).
 *  - Aynı değerlerle (gruptaki tüm sütunlar, gizli dahil) senaryonun ortamlarında geçerli bir satır varsa yeni satır eklenmez, o
 *    satır kullanılır (yeni: false).
 *  - Açık değerleri aynı olup gizli değeri farklı bir satır varsa satır ayırt edilemez (koşu koşula uyan ilk satırı alır) → hata.
 *  - Satır adı tabloda tekil olmalı (senaryolar satırı adıyla da seçer); boşsa tablo sıradan ad verir.
 *  - Gizli sütun değeri tablo deposunda kasa zarfıyla yazılır; yanıtta ve hata metinlerinde yalnız tablo / satır adı vardır.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} istek @param {Nesne} veri doğrulanmış veri (yerinde başvuruya çevrilir)
 * @param {string[]} ortamIdleri
 * @returns {{ secimler: Record<string, Record<string, string>>; eklenenler: import('./senaryo-servisi.d.mts').TabloSatiriEklemesi[] }}
 */
function tabloSatirlariniEkle(vt, projeId, istek, veri, ortamIdleri) {
  const hata = (/** @type {string} */ m) => new SenaryoDogrulamaHatasi(m, [{ alan: 'yeniTabloSatirlari', mesaj: m }]);
  if (!Array.isArray(istek) || istek.length > 20) throw hata('"yeniTabloSatirlari" en çok 20 öğelik bir dizi olmalıdır.');
  const hedefOrtam = ortamIdleri.length === 1 ? ortamIdleri[0] : null;
  /** @type {Record<string, Record<string, string>>} */
  const secimler = {};
  /** @type {import('./senaryo-servisi.d.mts').TabloSatiriEklemesi[]} */
  const eklenenler = [];
  for (const x of istek) {
    const o = /** @type {Nesne} */ (nesneMi(x) ? x : {});
    const t = typeof o.tablo === 'string' ? tabloBul(tablolariListele(vt, projeId, { cozulsun: true }), o.tablo) : undefined;
    if (!t || t.id.startsWith(BAGLAM_ONEKI)) throw hata(`"${String(o.tablo ?? '')}" adında tablo yok (Test verisi > Tablolar).`);
    const etiket = typeof o.etiket === 'string' ? o.etiket.trim() : '';
    if (!/^[\p{L}\p{N} _-]{0,40}$/u.test(etiket)) throw hata('Satır etiketi geçersiz.');
    const anahtar = grupAnahtari(t.id, etiket);
    if (secimler[anahtar]) throw hata(`"${t.ad}" tablosuna aynı grup iki kez eklenemez.`);
    const alanlar = Array.isArray(o.alanlar) ? o.alanlar : [];
    if (!alanlar.length || alanlar.length > 40) throw hata(`"${t.ad}" tablosuna eklenecek alan yok.`);
    /** @type {Record<string, string>} */
    const degerler = {};
    /** @type {Array<{ anahtar: string; sutun: string; bicim: string }>} */
    const uyeler = [];
    for (const a of alanlar) {
      const u = /** @type {Nesne} */ (nesneMi(a) ? a : {});
      const sutun = typeof u.sutun === 'string' ? sutunBul(t, u.sutun) : undefined;
      if (typeof u.anahtar !== 'string' || !u.anahtar || !sutun) throw hata(`"${t.ad}" tablosunda "${String(u.sutun ?? '')}" sütunu yok.`);
      const bicim = typeof u.bicim === 'string' ? u.bicim.trim().slice(0, 40) : '';
      const v = veri[u.anahtar];
      if (v === undefined || v === null || v === '' || v === false) { uyeler.push({ anahtar: u.anahtar, sutun: sutun.ad, bicim }); continue; }
      if (!['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'string' && /^\s*\$\{/.test(v))) {
        throw hata(`"${sutun.ad}" değeri tabloya yazılamaz (sabit bir değer girin).`);
      }
      if (String(v).trim().length > 500) throw hata(`"${sutun.ad}" değeri en çok 500 karakter olabilir.`);
      degerler[sutun.ad] = String(v).trim();
      uyeler.push({ anahtar: u.anahtar, sutun: sutun.ad, bicim });
    }
    if (!Object.keys(degerler).length) throw hata(`"${t.ad}" tablosuna eklenecek değer yok; alanları doldurun.`);
    const acikKosul = Object.fromEntries(Object.entries(degerler).filter(([s]) => !sutunBul(t, s)?.gizli));
    if (!Object.keys(acikKosul).length) throw hata(`"${t.ad}" satırı yalnız gizli değerlerle seçilemez; gizli olmayan en az bir alanı doldurun.`);
    const gecerli = (/** @type {{ ortamId: string | null }} */ r) => !r.ortamId || (hedefOrtam !== null && r.ortamId === hedefOrtam);
    // Aynı değerler: tüm sütunlar (gizli dahil) eşit; gruptaki boş alanın sütunu satırda da boş.
    const ayni = (/** @type {Record<string, string | null>} */ d) => t.sutunlar.every((c) => String(d[c.ad] ?? '').trim() === (degerler[c.ad] ?? ''));
    const kosulaUyar = (/** @type {Record<string, string | null>} */ d) => Object.entries(acikKosul).every(([s, v]) => String(d[s] ?? '').trim() === v);
    let satir = t.satirlar.find((r) => gecerli(r) && ayni(r.degerler));
    const yeni = !satir;
    if (!satir) {
      const cakisan = t.satirlar.find((r) => (!r.ortamId || ortamIdleri.includes(r.ortamId)) && kosulaUyar(r.degerler));
      if (cakisan) {
        throw hata(`"${t.ad}" tablosundaki "${cakisan.ad}" satırı aynı açık değerlere sahip (gizli değer farklı); satırlar ayırt edilemez. `
          + `Hazır'dan o satırı seçin ya da bir değeri değiştirin.`);
      }
      const ad = typeof o.satirAdi === 'string' ? o.satirAdi.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) : '';
      if (ad && t.satirlar.some((r) => kucukMetin(r.ad) === kucukMetin(ad))) throw hata(`"${t.ad}" tablosunda "${ad}" adında bir satır zaten var; başka bir satır adı yazın.`);
      const onceki = new Set(t.satirlar.map((r) => r.id));
      tabloKaydet(vt, {
        projeId, id: t.id, ad: t.ad, sutunlar: t.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: c.gizli })),
        satirlar: [{ ...(ad ? { ad } : {}), ortamId: hedefOrtam, degerler }],
        ortamVar: (id) => ortamIdleri.includes(id)
      });
      satir = tablolariListele(vt, projeId, { tabloId: t.id })[0]?.satirlar.find((r) => !onceki.has(r.id));
      if (!satir) throw new DepoHatasi(`"${t.ad}" tablosuna satır eklenemedi.`);
    }
    for (const u of uyeler) veri[u.anahtar] = `\${${basvuru(t.ad, u.sutun, etiket, u.bicim)}}`;
    // Satır seçimi: satırın açık değerleri (formun "Hazır" seçimiyle aynı biçim; gizli sütun koşula girmez).
    const secilen = /** @type {NonNullable<typeof satir>} */ (satir);
    secimler[anahtar] = Object.fromEntries(t.sutunlar.filter((c) => !c.gizli && String(secilen.degerler[c.ad] ?? '').trim() !== '').map((c) => [c.ad, String(secilen.degerler[c.ad])]));
    eklenenler.push({ tablo: t.ad, etiket, satirId: secilen.id, satirAdi: secilen.ad, yeni });
  }
  return { secimler, eklenenler };
}

/**
 * Hızlı test bilgisi (senaryo içeriğinde "hizliTest"): { izin: evet|sor|hayir, dogrulandi, bitis: { bitti[], hata[], devam[], adres } }.
 * Geçersizse null (yazılmaz). Değer içermez (yalnız sayfada görülen mesaj metinleri).
 * @param {unknown} d
 */
function hizliTestBilgisi(d) {
  if (!nesneMi(d) || !['evet', 'sor', 'hayir'].includes(String(d.izin))) return null;
  const liste = (/** @type {unknown} */ l) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 200)).slice(0, 10) : []);
  const b = nesneMi(d.bitis) ? d.bitis : {};
  return {
    izin: String(d.izin), dogrulandi: d.dogrulandi === true,
    bitis: { bitti: liste(b.bitti), hata: liste(b.hata), devam: liste(b.devam), adres: typeof b.adres === 'string' && b.adres.startsWith('/') ? b.adres.slice(0, 300) : null },
    ...(typeof d.olusturma === 'string' ? { olusturma: d.olusturma.slice(0, 40) } : {})
  };
}

/**
 * Senaryoyu kaydeder (yeni ya da mevcut). Kurallar:
 *  - Model: veri seçilen her ortam için tek doğrulayıcıyla doğrulanır; kaynak.ad ve verideki başlık yeni başlıkla
 *    eşitlenir; ortam kapsamı ortamIdleri ile belirlenir (en az bir ortam).
 *  - Modelsiz: yalnızca başlık (+ verideki başlık) ve Koşuda.
 *  - O an koşan senaryo (kosuyorMu) değiştirilemez.
 * @param {Veritabani} vt
 * Çoklu akış: senaryo bir akışa bağlıdır (akisId; verilmezse mevcut akışı, yeni senaryoda varsayılan akış); veri o akışın
 * modeliyle doğrulanır, akış içerikte (icerik.akis) saklanır (tek, örtük akışta yazılmaz).
 * Giriş seçimi (giris: { kip, profil? }; senaryo-girisi.mjs): verilmezse mevcut korunur; varsayılan seçim içeriğe yazılmaz.
 * Adım ekran görüntüsü seçimi (adimGoruntusu: her | yalnizKalan | secili | kapali; 'ayar' / null = Ayarlara uy): verilmezse mevcut korunur.
 * Satır seçimleri (tabloSecimleri; ekran-basvurulari.mjs): verilmezse mevcut korunur, null / {} kaldırır.
 * Çalıştırma biçimi (veriKosulari; tablolar/veri-kosulari.mjs): verilmezse mevcut korunur, null kaldırır.
 * Kayıt grubunu tabloya da ekleme (yeniTabloSatirlari; tabloSatirlariniEkle): senaryo ve tablo satırı TEK işlemde yazılır.
 * Talep numaraları (talepler; senaryolar/talepler.mjs): verilmezse mevcut korunur, null / [] kaldırır.
 * @param {{ id?: string | null; projeId: string; ekranId?: string | null; baslik: unknown; veri?: unknown; ortamIdleri?: unknown; kosuyaDahil?: unknown; mutlakaGorunmeli?: unknown; akisId?: unknown; giris?: unknown; adimGoruntusu?: unknown; tabloSecimleri?: unknown; veriKosulari?: unknown; yeniTabloSatirlari?: unknown; talepler?: unknown; hizliTest?: unknown; yapan?: string }} girdi
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean }} [secenekler]
 * @returns {{ id: string; uyarilar: Array<{ alan: string; mesaj: string }>; tabloSatirlari?: import('./senaryo-servisi.d.mts').TabloSatiriEklemesi[] }}
 */
export function senaryoKaydet(vt, girdi, secenekler = {}) {
  return vt.islem(() => senaryoKaydetIslem(vt, girdi, secenekler));
}

/** @param {Veritabani} vt @param {Parameters<typeof senaryoKaydet>[1]} girdi @param {Parameters<typeof senaryoKaydet>[2]} secenekler @returns {ReturnType<typeof senaryoKaydet>} */
function senaryoKaydetIslem(vt, girdi, secenekler = {}) {
  acikAnahtar(vt);
  const baslik = baslikKontrol(girdi.baslik);
  const mevcut = girdi.id ? senaryoGetir(vt, girdi.id) : undefined;
  if (girdi.id && (!mevcut || mevcut.projeId !== girdi.projeId)) throw new DepoHatasi('Senaryo bulunamadı.');
  const kosuyaDahil = girdi.kosuyaDahil === undefined ? mevcut?.kosuyaDahil ?? true : girdi.kosuyaDahil === true;
  const eskiKaynak = mevcut ? senaryoKaynagi(mevcut.icerik) : null;
  if (eskiKaynak && secenekler.kosuyorMu?.(eskiKaynak.dosya, eskiKaynak.ad)) {
    throw new SenaryoCakismaHatasi('Bu senaryo şu anda koşuyor (ya da sırada); bitmesini bekleyin veya durdurun.');
  }

  if (mevcut && (!veriGudumluMu(mevcut.icerik) || !eskiKaynak)) throw new DepoHatasi('Bu senaryonun biçimi desteklenmiyor (kodlu testlerden kalma).');

  const ekranId = mevcut ? mevcut.ekranId : typeof girdi.ekranId === 'string' ? girdi.ekranId : null;
  if (!ekranId) throw new DepoHatasi('Ekran seçilmedi.');
  const ekran = ekranGetir(vt, girdi.projeId, ekranId);
  const ortamlar = ortamlariListele(vt, girdi.projeId);
  const ortamAdlari = new Map(ortamlar.map((o) => [o.id, o.ad]));
  const ortamIdleri = Array.isArray(girdi.ortamIdleri)
    ? [...new Set(girdi.ortamIdleri.filter((o) => typeof o === 'string'))]
    : mevcut ? ortamKimlikleri(mevcut.icerik) : [];
  if (!ortamIdleri.length) throw new SenaryoDogrulamaHatasi('En az bir ortam seçin.', [{ alan: 'ortamlar', mesaj: 'En az bir ortam seçin.' }]);
  for (const o of ortamIdleri) if (!ortamAdlari.has(o)) throw new DepoHatasi('Seçilen ortam bu projede yok.');

  const kaynakVeri = mevcut ? { spec: /** @type {{ dosya: string }} */ (eskiKaynak).dosya, dosya: String(/** @type {Nesne} */ (mevcut.icerik.veri).dosya), yol: String(/** @type {Nesne} */ (mevcut.icerik.veri).yol), model: false }
    : ekranVeriKaynagi(vt, girdi.projeId, ekran);
  if (!kaynakVeri) throw new DepoHatasi('Bu ekran için senaryo verisi kaynağı bilinmiyor; yeni senaryo oluşturulamaz.');
  if (baslikCakisiyorMu(vt, girdi.projeId, kaynakVeri.spec, baslik, mevcut?.id ?? null)) {
    throw new SenaryoDogrulamaHatasi('Bu başlıkta bir senaryo zaten var.', [{ alan: 'baslik', mesaj: 'Bu ekranda bu başlıkta bir senaryo zaten var; başka bir başlık seçin.' }]);
  }

  const istenenAkis = typeof girdi.akisId === 'string' && girdi.akisId ? girdi.akisId : null;
  const mb = modelBaglami(vt, ekranId, istenenAkis ?? (mevcut ? senaryoAkisi(mevcut.icerik) : null));
  if (istenenAkis && mb && !mb.akislar.some((a) => a.id === istenenAkis)) throw new DepoHatasi('Seçilen akış bu ekranda yok.');
  /** @type {Array<{ alan: string; mesaj: string }>} */
  let uyarilar = [];
  /** @type {Record<string, Nesne>} ortamId → çözülmüş veri */
  const ortamVerileri = {};
  /** @type {ReturnType<typeof tabloSatirlariniEkle> | null} */
  let tabloEklemesi = null;
  if (girdi.veri !== undefined) {
    if (!mb) throw new DepoHatasi('Bu ekranın modeli yok; senaryo verisi yalnızca ekran modeliyle düzenlenebilir.');
    if (!nesneMi(girdi.veri)) throw new DepoHatasi('"veri" bir nesne olmalıdır.');
    const baslikAnahtari = formSemasiOlustur(mb.model, mb.altModeller).baslik;
    const d = veriyiDogrula(vt, girdi.projeId, mb, { ...girdi.veri, [baslikAnahtari]: baslik }, ortamIdleri, ortamAdlari, {
      tabloSecimleri: girdi.tabloSecimleri !== undefined ? girdi.tabloSecimleri : mevcut?.icerik.tabloSecimleri,
      veriKosulari: girdi.veriKosulari !== undefined ? girdi.veriKosulari : mevcut?.icerik.veriKosulari
    });
    uyarilar = d.uyarilar;
    // Kayıt grubu tabloya da eklenir (aynı işlemde; veri yerinde ${…} başvurusuna çevrilir).
    if (girdi.yeniTabloSatirlari !== undefined && girdi.yeniTabloSatirlari !== null) {
      tabloEklemesi = tabloSatirlariniEkle(vt, girdi.projeId, girdi.yeniTabloSatirlari, d.veri, ortamIdleri);
    }
    for (const o of ortamIdleri) ortamVerileri[o] = d.veri;
  } else {
    if (girdi.yeniTabloSatirlari !== undefined && girdi.yeniTabloSatirlari !== null) throw new DepoHatasi('Tabloya eklemek için senaryo verisi gerekir.');
    if (!mevcut) throw new DepoHatasi('Yeni senaryo için "veri" zorunludur.');
    // Veri değişmez: yalnızca başlık (ve verideki başlık alanı) güncellenir.
    for (const o of ortamIdleri) {
      const v = ortamVerisi(vt, mevcut.icerik, o) ?? ortamVerisi(vt, mevcut.icerik, null);
      if (!v) continue;
      ortamVerileri[o] = { ...v, ...(typeof v.baslik === 'string' ? { baslik } : {}) };
    }
  }

  const mutlaka = Array.isArray(girdi.mutlakaGorunmeli)
    ? [...new Set(girdi.mutlakaGorunmeli.filter((x) => typeof x === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(x)))]
    : nesneMi(mevcut?.icerik.alanKurallari) && Array.isArray(/** @type {Nesne} */ (mevcut?.icerik.alanKurallari).mutlakaGorunmeli)
      ? /** @type {string[]} */ (/** @type {Nesne} */ (mevcut?.icerik.alanKurallari).mutlakaGorunmeli) : [];
  const eskiOrtamlar = mevcut && nesneMi(mevcut.icerik.ortamlar) ? /** @type {Record<string, Nesne>} */ (mevcut.icerik.ortamlar) : {};
  /** @type {Record<string, Nesne>} */
  const yeniOrtamlar = {};
  // Ortam başına "Koşuda": genel değer değişmediyse korunur; değiştiyse (formdaki tek anahtar) tüm ortamlara uygulanır.
  const ortamDahilKorunur = Boolean(mevcut) && kosuyaDahil === mevcut?.kosuyaDahil;
  for (const o of ortamIdleri) {
    const eski = nesneMi(eskiOrtamlar[o]) ? eskiOrtamlar[o] : null;
    const sira = eski && typeof eski.sira === 'number' ? eski.sira : sonrakiSira(vt, girdi.projeId, kaynakVeri, o);
    yeniOrtamlar[o] = ortamVerileri[o] ? { sira, veri: veriyiSifrele(vt, girdi.projeId, ortamVerileri[o], modelHassasAnahtarlari(mb?.model)) } : { sira };
    if (ortamDahilKorunur && eski && typeof eski.kosuyaDahil === 'boolean') yeniOrtamlar[o].kosuyaDahil = eski.kosuyaDahil;
  }
  // Genel değer: en az bir ortamda koşuda mı (ortam başına değerler korunduysa onlardan).
  const genelDahil = ortamDahilKorunur ? ortamIdleri.some((o) => ortamdaKosuyaDahil({ ortamlar: yeniOrtamlar }, kosuyaDahil, o)) : kosuyaDahil;
  /** @type {Nesne} */
  const icerik = {
    ...(mevcut ? kopya(mevcut.icerik) : {}),
    // Yeni senaryo model koşucusuyla çalışır (bkz. model-kosusu.mjs > modelSenaryosuMu).
    ...(!mevcut ? { kosucu: 'model' } : {}),
    kaynak: { dosya: kaynakVeri.spec, ad: baslik },
    veri: { dosya: kaynakVeri.dosya, yol: kaynakVeri.yol },
    ortamlar: yeniOrtamlar
  };
  if (mutlaka.length) icerik.alanKurallari = { mutlakaGorunmeli: mutlaka };
  else delete icerik.alanKurallari;
  if (mb && mb.akisId !== ANA_AKIS_ID) icerik.akis = mb.akisId;
  else delete icerik.akis;
  // Giriş seçimi: verilmezse mevcut korunur (kopya); varsayılan (ortamın girişiyle) içeriğe yazılmaz.
  if (girdi.giris !== undefined) {
    const g = senaryoGirisiniAyikla(girdi.giris);
    if (g.hatalar.length) throw new SenaryoDogrulamaHatasi(g.hatalar[0], [{ alan: 'giris', mesaj: g.hatalar[0] }]);
    if (g.giris) icerik.giris = g.giris;
    else delete icerik.giris;
  }
  // Adım ekran görüntüsü seçimi: verilmezse mevcut korunur; "Ayarlara uy" (null / 'ayar') içeriğe yazılmaz.
  if (girdi.adimGoruntusu !== undefined) {
    const a = senaryoAdimGoruntusuAyikla(girdi.adimGoruntusu);
    if (a.hata) throw new SenaryoDogrulamaHatasi(a.hata, [{ alan: 'adimGoruntusu', mesaj: a.hata }]);
    if (a.secim) icerik.adimGoruntusu = a.secim;
    else delete icerik.adimGoruntusu;
  }
  // Satır seçimleri (ekran-basvurulari.mjs): verilmezse mevcut korunur; null / {} kaldırır.
  if (girdi.tabloSecimleri !== undefined) {
    const t = tabloSecimleriDenetle(vt, girdi.projeId, girdi.tabloSecimleri);
    if (t) icerik.tabloSecimleri = t;
    else delete icerik.tabloSecimleri;
  }
  // Çalıştırma biçimi (tablolar/veri-kosulari.mjs): verilmezse mevcut korunur; null / boş (hepsi "Tek satır") kaldırır.
  if (girdi.veriKosulari !== undefined) {
    const v = veriKosulariniAyikla(girdi.veriKosulari, tablolariListele(vt, girdi.projeId));
    if (v.hatalar.length) throw new SenaryoDogrulamaHatasi(v.hatalar[0], v.hatalar.map((mesaj) => ({ alan: 'veriKosulari', mesaj })));
    if (v.ayar) icerik.veriKosulari = v.ayar;
    else delete icerik.veriKosulari;
  }
  // Talep numaraları: verilmezse mevcut korunur (kopya); boş liste içerikten kaldırır.
  if (girdi.talepler !== undefined) {
    const t = talepleriAyikla(girdi.talepler);
    if (t.hata) throw new SenaryoDogrulamaHatasi(t.hata, [{ alan: 'talepler', mesaj: t.hata }]);
    if (t.talepler.length) icerik.talepler = t.talepler;
    else delete icerik.talepler;
  }
  // Hızlı test bilgisi (hizli-test/yonetici.mjs; verilmezse mevcut korunur, null kaldırır): basma izni, bitiş koşulu, doğrulandı mı.
  if (girdi.hizliTest !== undefined) {
    const h = hizliTestBilgisi(girdi.hizliTest);
    if (h) icerik.hizliTest = h;
    else delete icerik.hizliTest;
  }
  // Tabloya eklenen kayıt grubu: satır seçimi o satıra; grubun çoklu satır ayarı (varsa) kalkar (tek satır).
  if (tabloEklemesi) {
    icerik.tabloSecimleri = { ...(nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : {}), ...tabloEklemesi.secimler };
    const vk = nesneMi(icerik.veriKosulari) && nesneMi(icerik.veriKosulari.gruplar) ? /** @type {Nesne} */ (icerik.veriKosulari.gruplar) : null;
    if (vk) {
      for (const k of Object.keys(tabloEklemesi.secimler)) delete vk[k];
      if (!Object.keys(vk).length) delete icerik.veriKosulari;
    }
  }
  if (mb) ayarTablolariniDenetle(vt, girdi.projeId, ekranId, mb.model, ortamVerileri, icerik, ortamAdlari);
  const id = depoSenaryoKaydet(vt, {
    ...(mevcut ? { id: mevcut.id } : {}), projeId: girdi.projeId, ekranId, baslik, icerik, kosuyaDahil: genelDahil, yapan: girdi.yapan
  });
  return { id, uyarilar, ...(tabloEklemesi ? { tabloSatirlari: tabloEklemesi.eklenenler } : {}) };
}

/**
 * Koşuda anahtarı (toplu).
 *  - ortamId verilirse yalnız O ORTAMDA (senaryo o ortamda tanımlı değilse atlanır); diğer ortamların değeri korunur.
 *  - Verilmezse senaryonun tanımlı olduğu TÜM ortamlarda (ortam başına değerler kaldırılır, genel değer yazılır).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} idler @param {boolean} dahil @param {string} [yapan]
 * @param {string | null} [ortamId]
 */
export function kosuyaDahilAyarla(vt, projeId, idler, dahil, yapan, ortamId = null) {
  const liste = kimlikListesi(idler);
  if (ortamId !== null && !ortamlariListele(vt, projeId).some((o) => o.id === ortamId)) throw new DepoHatasi('Ortam bulunamadı.');
  let degisen = 0;
  vt.islem(() => {
    for (const id of liste) {
      const s = senaryoGetir(vt, id);
      if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
      const tanimlilar = ortamKimlikleri(s.icerik);
      const ortamlar = /** @type {Record<string, Nesne>} */ (nesneMi(s.icerik.ortamlar) ? s.icerik.ortamlar : {});
      if (ortamId !== null) {
        if (!tanimlilar.includes(ortamId) || ortamdaKosuyaDahil(s.icerik, s.kosuyaDahil, ortamId) === dahil) continue;
        /** @type {Record<string, Nesne>} */
        const yeni = {};
        for (const o of tanimlilar) yeni[o] = { ...ortamlar[o], kosuyaDahil: o === ortamId ? dahil : ortamdaKosuyaDahil(s.icerik, s.kosuyaDahil, o) };
        depoSenaryoKaydet(vt, { ...s, icerik: { ...s.icerik, ortamlar: yeni }, kosuyaDahil: tanimlilar.some((o) => yeni[o].kosuyaDahil === true), yapan });
        degisen++;
        continue;
      }
      const ortamDegeriVar = tanimlilar.some((o) => typeof ortamlar[o]?.kosuyaDahil === 'boolean');
      if (!ortamDegeriVar && s.kosuyaDahil === dahil) continue;
      /** @type {Record<string, Nesne>} */
      const yeni = {};
      for (const o of Object.keys(ortamlar)) {
        yeni[o] = { ...ortamlar[o] };
        delete yeni[o].kosuyaDahil;
      }
      const degisti = s.kosuyaDahil !== dahil || tanimlilar.some((o) => ortamdaKosuyaDahil(s.icerik, s.kosuyaDahil, o) !== dahil);
      depoSenaryoKaydet(vt, { ...s, icerik: { ...s.icerik, ortamlar: yeni }, kosuyaDahil: dahil, yapan });
      if (degisti) degisen++;
    }
  });
  return { degisen };
}

/** @param {unknown} idler @returns {string[]} */
function kimlikListesi(idler) {
  if (!Array.isArray(idler) || !idler.length || idler.length > 5000) throw new DepoHatasi('"idler" boş olmayan bir kimlik dizisi olmalıdır.');
  return [...new Set(idler.map((d) => {
    if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi('Geçersiz senaryo kimliği.');
    return d;
  }))];
}

/**
 * Senaryoları siler. Koşan senaryo silinmez (listede biri koşuyorsa HİÇBİRİ silinmez).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} idler
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; yapan?: string }} [secenekler]
 */
export function senaryolariSil(vt, projeId, idler, secenekler = {}) {
  const liste = kimlikListesi(idler);
  const senaryolar = liste.map((id) => {
    const s = senaryoGetir(vt, id);
    if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
    return s;
  });
  for (const s of senaryolar) {
    const k = senaryoKaynagi(s.icerik);
    if (k && secenekler.kosuyorMu?.(k.dosya, k.ad)) throw new SenaryoCakismaHatasi(`"${s.baslik}" şu anda koşuyor; bitmesini bekleyin veya durdurun.`);
  }
  vt.islem(() => { for (const s of senaryolar) senaryoSil(vt, s.id, secenekler.yapan); });
  return { silinen: senaryolar.length };
}

/**
 * Senaryonun kopyası: "<başlık> (kopya[ N])", aynı ortamlar, verinin kopyası, sıranın
 * sonuna eklenir. Kopya Koşuda KAPALI başlar (aynı testin çift koşmaması için).
 * @param {Veritabani} vt @param {string} projeId @param {string} id @param {string} [yapan]
 */
export function senaryoKopyala(vt, projeId, id, yapan, istenenBaslik) {
  acikAnahtar(vt);
  const s = senaryoGetir(vt, id);
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  if (!veriGudumluMu(s.icerik) || !senaryoKaynagi(s.icerik)) throw new DepoHatasi('Bu senaryonun biçimi desteklenmiyor (kodlu testlerden kalma).');
  const kaynak = /** @type {{ dosya: string; ad: string }} */ (senaryoKaynagi(s.icerik));
  let baslik = '';
  if (istenenBaslik) {
    const aday = String(istenenBaslik).trim().slice(0, BASLIK_EN_UZUN);
    if (!aday) throw new DepoHatasi('Kopyanın başlığı boş olamaz.');
    if (baslikCakisiyorMu(vt, projeId, kaynak.dosya, aday, null)) throw new DepoHatasi(`Bu başlıkta bir senaryo zaten var: ${aday}`);
    baslik = aday;
  }
  for (let n = 1; !baslik && n < 1000; n++) {
    const aday = `${s.baslik} (kopya${n > 1 ? ` ${n}` : ''})`.slice(0, BASLIK_EN_UZUN);
    if (!baslikCakisiyorMu(vt, projeId, kaynak.dosya, aday, null)) { baslik = aday; break; }
  }
  if (!baslik) throw new DepoHatasi('Kopya için boş bir başlık bulunamadı.');
  const veri = /** @type {{ dosya: string; yol: string }} */ (s.icerik.veri);
  /** @type {Record<string, Nesne>} */
  const ortamlar = {};
  const modelHassas = s.ekranId ? modelHassasAnahtarlari(modelBaglami(vt, s.ekranId, senaryoAkisi(s.icerik))?.model) : [];
  for (const o of ortamKimlikleri(s.icerik)) {
    const v = ortamVerisi(vt, s.icerik, o);
    ortamlar[o] = { sira: sonrakiSira(vt, projeId, veri, o), ...(v ? { veri: veriyiSifrele(vt, projeId, { ...v, ...(typeof v.baslik === 'string' ? { baslik } : {}) }, modelHassas) } : {}) };
  }
  const yeniId = depoSenaryoKaydet(vt, {
    projeId, ekranId: s.ekranId, baslik, kosuyaDahil: false, yapan,
    icerik: { ...kopya(s.icerik), kaynak: { dosya: kaynak.dosya, ad: baslik }, ortamlar }
  });
  return { id: yeniId, baslik };
}

/**
 * TOPLU ÇOĞALTMA: seçilen her senaryodan "adet" kopya. Başlık şablonu: {baslik} ve {n} (1'den başlar); verilmezse
 * "{baslik} ({n})". Kopyalar "Koşuda" KAPALI gelir. onay verilmezse yalnızca önizleme döner (hiçbir şey yazılmaz): yeni
 * başlıklar ve çakışanlar. Onaylı çağrıda çakışan başlık varsa hiçbiri yazılmaz.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ idler: unknown; adet: unknown; sablon?: unknown; onay?: boolean }} g @param {string} [yapan]
 */
export function senaryolariCogalt(vt, projeId, g, yapan) {
  acikAnahtar(vt);
  const idler = Array.isArray(g.idler) ? [...new Set(g.idler.map(String))] : [];
  if (!idler.length || idler.length > 200) throw new DepoHatasi('1 ile 200 arasında senaryo seçin.');
  const adet = Number(g.adet);
  if (!Number.isInteger(adet) || adet < 1 || adet > 50) throw new DepoHatasi('Kopya sayısı 1 ile 50 arasında olmalı.');
  if (idler.length * adet > 500) throw new DepoHatasi('Tek seferde en çok 500 kopya oluşturulabilir.');
  const sablon = typeof g.sablon === 'string' && g.sablon.trim() ? g.sablon.trim() : '{baslik} ({n})';
  if (!sablon.includes('{n}')) throw new DepoHatasi('Başlık şablonunda {n} bulunmalı (kopyalar ayırt edilebilsin).');
  /** @type {Array<{ kaynakId: string; kaynakBaslik: string; baslik: string; cakisma: boolean }>} */
  const plan = [];
  const yeniBasliklar = new Set();
  for (const id of idler) {
    const s = senaryoGetir(vt, id);
    if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
    const kaynak = senaryoKaynagi(s.icerik);
    if (!veriGudumluMu(s.icerik) || !kaynak) throw new DepoHatasi(`Bu senaryonun biçimi desteklenmiyor: ${s.baslik}`);
    for (let n = 1; n <= adet; n++) {
      const baslik = sablon.replaceAll('{baslik}', s.baslik).replaceAll('{n}', String(n)).slice(0, BASLIK_EN_UZUN).trim();
      const anahtar = `${kaynak.dosya}\u0000${baslik}`;
      const cakisma = yeniBasliklar.has(anahtar) || baslikCakisiyorMu(vt, projeId, kaynak.dosya, baslik, null);
      yeniBasliklar.add(anahtar);
      plan.push({ kaynakId: id, kaynakBaslik: s.baslik, baslik, cakisma });
    }
  }
  const cakisanlar = plan.filter((p) => p.cakisma).length;
  if (!g.onay) return { onizleme: true, plan, cakisanlar };
  if (cakisanlar) throw new DepoHatasi(`${cakisanlar} kopyanın başlığı mevcut bir senaryoyla çakışıyor; şablonu değiştirin.`);
  const olusanlar = plan.map((p) => senaryoKopyala(vt, projeId, p.kaynakId, yapan, p.baslik));
  return { onizleme: false, olusanlar };
}

/**
 * Senaryoların değişiklik geçmişini siler (senaryolar kalır). Geri alınamaz: yalnızca açık onayla (onay: true); onaysız çağrı
 * silinecek kayıt sayısını döner. Ör. eski sürümlerde şifrelenmemiş kalmış hassas değerleri temizlemek için.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} idler @param {{ onay?: boolean }} [s]
 * @returns {{ senaryo: number; kayit: number; silindi: boolean }}
 */
export function senaryoGecmisiniSil(vt, projeId, idler, s = {}) {
  acikAnahtar(vt);
  const liste = Array.isArray(idler) ? [...new Set(idler.filter((x) => typeof x === 'string'))] : [];
  if (!liste.length) throw new DepoHatasi('En az bir senaryo seçin.');
  if (liste.length > 500) throw new DepoHatasi('Tek seferde en çok 500 senaryo.');
  for (const id of liste) {
    const sen = senaryoGetir(vt, id);
    if (!sen || sen.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  }
  const yer = liste.map(() => '?').join(', ');
  const kayit = Number(vt.tek(`SELECT COUNT(*) AS n FROM degisiklik_gecmisi WHERE varlik_turu = 'senaryo' AND varlik_id IN (${yer})`, liste)?.n ?? 0);
  if (s.onay !== true) return { senaryo: liste.length, kayit, silindi: false };
  vt.islem(() => vt.calistir(`DELETE FROM degisiklik_gecmisi WHERE varlik_turu = 'senaryo' AND varlik_id IN (${yer})`, liste));
  return { senaryo: liste.length, kayit, silindi: true };
}

// ---------------------------------------------------------------------------------------
// Geçmiş
// ---------------------------------------------------------------------------------------

/**
 * Senaryonun değişiklik geçmişi (yeniden eskiye). Değişiklikler insan-okur özetlenir: başlık ve
 * Koşuda değerleri; veride yalnızca DEĞİŞEN ALAN ADLARI (değerler gösterilmez — hassas olabilir);
 * ortam kapsamı değişikliği.
 * @param {Veritabani} vt @param {string} id
 */
export function senaryoGecmisi(vt, id) {
  acikAnahtar(vt);
  const ortamAdlari = new Map();
  const kayitlar = degisiklikGecmisiListele(vt, 'senaryo', id);
  const projeId = kayitlar.map((k) => k.sonraki?.proje_id ?? k.onceki?.proje_id).find((x) => typeof x === 'string');
  if (typeof projeId === 'string') for (const o of ortamlariListele(vt, projeId)) ortamAdlari.set(o.id, o.ad);
  /** @param {Nesne | null} satir */
  const icerikOku = (satir) => {
    if (!satir || typeof satir.icerik_json !== 'string') return null;
    try { return /** @type {Nesne} */ (JSON.parse(satir.icerik_json)); } catch { return null; }
  };
  return kayitlar.map((k) => {
    /** @type {string[]} */
    const degisenler = [];
    const once = k.onceki;
    const sonra = k.sonraki;
    if (once && sonra) {
      if (once.baslik !== sonra.baslik) degisenler.push(`Başlık: "${once.baslik}" → "${sonra.baslik}"`);
      const a = icerikOku(once);
      const b = icerikOku(sonra);
      const acikMi = (/** @type {boolean} */ x) => (x ? 'açık' : 'kapalı');
      // Koşuda: ortam başına (her iki sürümde tanımlı ortamlar); ortam başına fark yoksa genel değer.
      const ortakOrtamlar = a && b ? ortamKimlikleri(b).filter((o) => ortamKimlikleri(a).includes(o)) : [];
      const ortamFarklari = ortakOrtamlar.flatMap((o) => {
        const x = ortamdaKosuyaDahil(a, once.kosuya_dahil === 1, o);
        const y = ortamdaKosuyaDahil(b, sonra.kosuya_dahil === 1, o);
        return x === y ? [] : [`Toplu koşuya dahil (${ortamAdlari.get(o) ?? o}): ${acikMi(x)} → ${acikMi(y)}`];
      });
      // Tüm ortamlar birlikte değiştiyse tek (genel) satır; bir kısmı değiştiyse ortam başına satırlar.
      if (ortamFarklari.length && (ortamFarklari.length < ortakOrtamlar.length || once.kosuya_dahil === sonra.kosuya_dahil)) degisenler.push(...ortamFarklari);
      else if (once.kosuya_dahil !== sonra.kosuya_dahil) degisenler.push(`Toplu koşuya dahil: ${acikMi(once.kosuya_dahil === 1)} → ${acikMi(sonra.kosuya_dahil === 1)}`);
      if (a && b) {
        const oa = ortamKimlikleri(a);
        const ob = ortamKimlikleri(b);
        const eklenen = ob.filter((o) => !oa.includes(o)).map((o) => ortamAdlari.get(o) ?? o);
        const cikan = oa.filter((o) => !ob.includes(o)).map((o) => ortamAdlari.get(o) ?? o);
        if (eklenen.length) degisenler.push(`Ortam eklendi: ${eklenen.join(', ')}`);
        if (cikan.length) degisenler.push(`Ortamdan çıkarıldı: ${cikan.join(', ')}`);
        /** @type {Set<string>} */
        const alanlar = new Set();
        for (const o of ob.filter((x) => oa.includes(x))) {
          const va = ortamVerisi(vt, a, o) ?? {};
          const vb = ortamVerisi(vt, b, o) ?? {};
          for (const ad of new Set([...Object.keys(va), ...Object.keys(vb)])) {
            if (ad === 'baslik') continue;
            if (JSON.stringify(va[ad]) !== JSON.stringify(vb[ad])) alanlar.add(ad);
          }
        }
        if (alanlar.size) degisenler.push(`Değişen alanlar: ${[...alanlar].join(', ')}`);
        if (JSON.stringify(a.alanKurallari ?? null) !== JSON.stringify(b.alanKurallari ?? null)) degisenler.push('"Mutlaka görünmeli" alanları değişti');
        if (JSON.stringify(a.giris ?? null) !== JSON.stringify(b.giris ?? null)) degisenler.push('Giriş seçimi değişti');
        if ((a.adimGoruntusu ?? null) !== (b.adimGoruntusu ?? null)) degisenler.push('Adım ekran görüntüsü seçimi değişti');
      }
    }
    return {
      id: k.id, zaman: k.zaman, islem: k.islem, yapan: k.yapan, makineId: k.makineId, aciklama: k.aciklama,
      baslik: String((sonra ?? once)?.baslik ?? ''), degisenler
    };
  }).reverse();
}

// ---------------------------------------------------------------------------------------
// Koşu hedefi (UUID → dosya + güncel başlık) ve "Dene" paketi
// ---------------------------------------------------------------------------------------

/**
 * Senaryo kimliğini koşu hedefine çözer: model spec'i + senaryonun etiketi (UUID) ve grep deseni; koşu proje + ortam
 * KİMLİKLERİYLE yapılır (genel). Kasa gerekmez — yasaklı adres deseni verildiyse gerekir (ortam adresi şifreli).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} senaryoId @param {unknown} ortamId
 * @param {{ yasakDesenleri?: Array<{ kalip: string; desen: RegExp }> }} [secenekler]
 */
export function calistirmaHedefiCoz(vt, projeId, senaryoId, ortamId, secenekler = {}) {
  if (typeof senaryoId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(senaryoId)) throw new DepoHatasi('Geçersiz senaryo kimliği.');
  if (typeof ortamId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(ortamId)) throw new DepoHatasi('Geçersiz ortam.');
  const s = senaryoGetir(vt, senaryoId);
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  // Yasaklı adres koruması (yalnızca desen verildiyse; ortamın adresi şifreli olduğu için kasa açık olmalı):
  // koşu HİÇ başlatılmaz, tarayıcı hiçbir yere gitmez.
  if (secenekler.yasakDesenleri?.length) {
    const ortam = ortamlariListele(vt, projeId).find((o) => o.id === ortamId);
    const kalip = ortam ? adresYasakliMi(ortam.tabanUrl, secenekler.yasakDesenleri) : null;
    if (ortam && kalip) throw new DepoHatasi(yasakliAdresMesaji(ortam.tabanUrl, kalip));
  }
  if (!modelSenaryosuMu(s.icerik)) throw new DepoHatasi(`"${s.baslik}" kodlu testlerden kalma bir senaryo; çalıştırılamaz. Senaryoyu ekran modeliyle yeniden oluşturun.`);
  // Tek model spec'i, senaryonun etiketiyle (UUID) daraltılır.
  if (!s.ekranId || !modelBaglami(vt, s.ekranId)) throw new DepoHatasi(`"${s.baslik}" senaryosunun ekran modeli yok; model koşucusuyla çalıştırılamaz.`);
  if (!ortamKimlikleri(s.icerik).includes(ortamId)) throw new DepoHatasi(`"${s.baslik}" seçilen ortamda tanımlı değil.`);
  return {
    senaryoId: s.id, baslik: s.baslik, dosya: MODEL_SPEC_DOSYASI, ad: null, ekranId: s.ekranId,
    model: true, etiket: modelEtiketi(s.id), grepDeseni: modelGrepDeseni(s.id),
    genel: { projeId, ortamId }
  };

}

/**
 * Model senaryosunun "Dene" paketi: taslak (akışın modeliyle doğrulanmış) GEÇİCİ bir deneme senaryosu olarak döner; koşucu
 * bunu geçici bir dosyayla veri okuyucuya verir (TEST_SUNUCU_MODEL_DENEME_DOSYASI), model spec'i onu "@model-deneme-…"
 * etiketiyle tek test olarak üretir. Veritabanına senaryo YAZILMAZ (koşu sonucu, kodlu Dene gibi senaryosuz kaydedilir).
 * @param {Veritabani} vt @param {{ projeId: string; ekranId: string; ortamId: string; veri: unknown; akisId?: string | null; mutlakaGorunmeli?: unknown; giris?: unknown; adimGoruntusu?: unknown; tabloSecimleri?: unknown }} girdi
 * @param {NonNullable<ReturnType<typeof modelBaglami>>} mb @param {{ geciciEk: string }} secenekler
 */
function modelDenemePaketi(vt, girdi, mb, secenekler) {
  const ortamlar = ortamlariListele(vt, girdi.projeId);
  if (!ortamlar.some((o) => o.id === girdi.ortamId)) throw new DepoHatasi('Seçilen ortam bu projede yok.');
  const baslikAnahtari = formSemasiOlustur(mb.model, mb.altModeller).baslik;
  const geciciBaslik = `${DENEME_BASLIK_ON_EKI}${secenekler.geciciEk}`;
  const d = veriyiDogrula(vt, girdi.projeId, mb, { .../** @type {Nesne} */ (girdi.veri), [baslikAnahtari]: geciciBaslik }, [girdi.ortamId],
    new Map(ortamlar.map((o) => [o.id, o.ad])), { tabloSecimleri: girdi.tabloSecimleri });
  const denemeId = `deneme-${secenekler.geciciEk}`;
  const mutlaka = Array.isArray(girdi.mutlakaGorunmeli) ? girdi.mutlakaGorunmeli.filter((x) => typeof x === 'string').slice(0, 500) : [];
  return {
    model: /** @type {const} */ (true), genel: { projeId: girdi.projeId, ortamId: girdi.ortamId },
    spec: MODEL_SPEC_DOSYASI, geciciBaslik, etiket: modelEtiketi(denemeId), grepDeseni: modelGrepDeseni(denemeId), uyarilar: d.uyarilar,
    denemeSenaryosu: { id: denemeId, ekranId: girdi.ekranId, akisId: mb.akisId, ortamId: girdi.ortamId, baslik: geciciBaslik, veri: d.veri, mutlakaGorunmeli: mutlaka,
      giris: senaryoGirisiniAyikla(girdi.giris).giris,
      adimGoruntusu: senaryoAdimGoruntusuAyikla(girdi.adimGoruntusu).secim,
      // Formdaki satır seçimleri (denetlenmiş; ${Tablo.Sütun} değerleri denemede de bu satırdan gelir).
      ...(girdi.tabloSecimleri !== undefined ? { tabloSecimleri: tabloSecimleriDenetle(vt, girdi.projeId, girdi.tabloSecimleri) ?? null } : {}) }
  };
}

/**
 * "Dene" (deneme koşusu) paketi: taslak senaryo ekranın (akışın) modeliyle doğrulanır ve geçici bir deneme senaryosu
 * olarak döner (bkz. modelDenemePaketi). Veritabanına YAZILMAZ.
 * @param {Veritabani} vt
 * @param {{ projeId: string; ekranId: string; ortamId: string; veri: unknown; id?: string | null; akisId?: string | null; mutlakaGorunmeli?: unknown; giris?: unknown; adimGoruntusu?: unknown; tabloSecimleri?: unknown }} girdi
 * @param {{ geciciEk: string }} secenekler geciciEk: geçici başlığın rastgele son eki
 */
export function denemePaketiOlustur(vt, girdi, secenekler) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, girdi.projeId, girdi.ekranId);
  const mb = modelBaglami(vt, ekran.id, girdi.akisId ?? null);
  if (!mb) throw new DepoHatasi('Bu ekranın modeli yok; deneme yapılamaz.');
  if (!nesneMi(girdi.veri)) throw new DepoHatasi('"veri" bir nesne olmalıdır.');
  return modelDenemePaketi(vt, girdi, mb, secenekler);
}
