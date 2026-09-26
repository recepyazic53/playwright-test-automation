// SENARYO SERVİSİ (genel) — platform "Senaryolar" ekranının veritabanı işlemleri: liste (son sonuç,
// bağlam profili, beklenen sonuç rozeti), ayrıntı, model tabanlı form bağlamı, kaydet (tek
// doğrulayıcı + değişiklik geçmişi), kopyala, sil, koşuya dahil et, geçmiş, koşu hedefi çözümü
// (senaryo UUID → Playwright dosyası + güncel test başlığı) ve "Dene" (geçici ek veri) paketi.
//
// Senaryo KİMLİĞİ veritabanı UUID'sidir. Senaryo içeriği (senaryolar.icerik_json):
//   { kaynak: { dosya, ad },                 → Playwright spec dosyası + GÜNCEL test başlığı
//     veri?: { dosya, yol },                 → veri güdümlü senaryolarda testlerin okuduğu veri dizisi
//     ortamlar: { <ortamId>: { sira?, veri? } },   → senaryonun var olduğu ortamlar (+ ortama göre veri)
//     alanKurallari?: { mutlakaGorunmeli: [alanId] } }
// "veri" olan (veri güdümlü) senaryoların sahibi veritabanıdır: testler bu satırlardan üretilir
// (projeler/<proje>/aktarim.mjs > yenidenKur); oluşturma/düzenleme/silme yalnızca bunlarda yapılır.
// Kodda tanımlı senaryolarda (veri yok) yalnızca görünen başlık ve "Koşuda" değişir.
// Senaryo verisindeki hassas adlı alanlar (test verisi türlerinde hassas işaretli alan adları)
// aktarım motoruyla aynı kuralla kasa zarfı olarak yazılır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: senaryo-servisi.d.mts.

import {
  DepoHatasi, baglamProfilleriniListele, degisiklikGecmisiListele, ekranModeliGetir, ekranlariListele, kaynakEslemeleriniListele,
  ortamlariListele, senaryoGetir, senaryoKaydet as depoSenaryoKaydet, senaryoSil, testVerisiProfilleriniListele, testVerisiTurleriniListele
} from '../veritabani/depo.mjs';
import { acikAnahtar, sifrele } from '../kasa.mjs';
import { adliAlanlariDonustur, zarflariCoz } from '../aktarim/motor.mjs';
import { mezarTasiOku } from '../ekranlar/mezar-tasi.mjs';
import { ANA_AKIS_ID, akisListesi, akisModeli, beklenenSonucEtiketi, formSemasiOlustur, ortakAkislariAc, tumFormAlanlari } from './model-formu.mjs';
import { kartiNormallestir, krediKartlariAyniMi, senaryoyuDogrula } from '../../dogrulama/senaryo-dogrulayici.mjs';
import {
  MODEL_SPEC_DOSYASI, adresYasakliMi, modelEtiketi, modelGrepDeseni, modelSenaryosuMu, yasakliAdresMesaji
} from './model-kosusu.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('../../../projeler/index.d.mts').AktarimAdaptoru} AktarimAdaptoru */
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

/** Veri güdümlü mü (testler bu satırın verisinden üretilir)? @param {unknown} icerik */
export function veriGudumluMu(icerik) {
  return nesneMi(icerik) && nesneMi(icerik.veri) && typeof icerik.veri.dosya === 'string' && typeof icerik.veri.yol === 'string';
}

/**
 * Model koşucusuyla mı çalışır? (kodda karşılığı yok: sayfa paketinden/modelden; bkz. model-kosusu.mjs)
 * @param {Veritabani} vt @param {string} projeId @param {{ id: string; icerik: unknown }} s
 * @param {{ kodDosyasiVar?: (dosya: string) => boolean; eslemeliler?: Set<string> }} [secenekler]
 */
export function modelKosusuMu(vt, projeId, s, secenekler = {}) {
  const eslemeliler = secenekler.eslemeliler ?? new Set(kaynakEslemeleriniListele(vt, projeId, 'senaryo').map((e) => e.varlikId));
  return modelSenaryosuMu(s.icerik, { kodEslemesiVar: eslemeliler.has(s.id), kodDosyasiVar: secenekler.kodDosyasiVar });
}

/** @param {unknown} icerik @returns {string[]} */
const ortamKimlikleri = (icerik) => (nesneMi(icerik) && nesneMi(icerik.ortamlar) ? Object.keys(icerik.ortamlar) : []);

/** Ortam kimliği → test çalıştırıcısının ortam anahtarı (aktarım eşlemesi; ör. "test"). */
export function ortamAnahtariBul(/** @type {Veritabani} */ vt, /** @type {string} */ projeId, /** @type {string} */ ortamId) {
  return kaynakEslemeleriniListele(vt, projeId, 'ortam').find((e) => e.varlikId === ortamId)?.kaynakAnahtari ?? null;
}

/** Test verisi türlerinde hassas işaretli alan adları (aktarım motoruyla aynı kural: hassas !== false). */
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
 * @param {Veritabani} vt @param {string} ekranId @param {string | null} [akisId]
 */
export function modelBaglami(vt, ekranId, akisId = null) {
  const kayit = ekranModeliGetir(vt, ekranId);
  if (!kayit || !nesneMi(kayit.model) || ['altModel', 'ortakAkis'].includes(kayit.model.tur) || !Array.isArray(kayit.model.adimlar)) return null;
  const tamModel = kayit.model;
  const akislar = akisListesi(tamModel);
  const akis = akislar.find((a) => a.id === akisId) ?? akislar[0];
  const model = /** @type {Nesne} */ (akisModeli(tamModel, akis.id));
  const ekran = vt.tek('SELECT proje_id FROM ekranlar WHERE id = ?', [ekranId]);
  /** @type {Set<string>} */
  const dosyalar = new Set();
  // Alt modeller tüm akışların adımlarından (akış değişince yeniden okunmasın).
  const tumAdimlar = [/** @type {Nesne[]} */ (tamModel.adimlar), ...(Array.isArray(tamModel.akislar) ? tamModel.akislar.map((/** @type {Nesne} */ a) => (Array.isArray(a.adimlar) ? a.adimlar : [])) : [])].flat();
  for (const adim of /** @type {Nesne[]} */ (tumAdimlar)) {
    if (nesneMi(adim) && nesneMi(adim.altModel) && typeof adim.altModel.dosya === 'string') dosyalar.add(adim.altModel.dosya);
    if (nesneMi(adim) && nesneMi(adim.ortakAkis) && typeof adim.ortakAkis.dosya === 'string') dosyalar.add(adim.ortakAkis.dosya);
  }
  const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? /** @type {Nesne[]} */ (model.senaryoDuzeyi.alanlar) : [];
  for (const a of sd) if (nesneMi(a.altModel) && typeof a.altModel.dosya === 'string') dosyalar.add(a.altModel.dosya);
  /** @type {Record<string, Nesne>} */
  const altModeller = {};
  for (const dosya of dosyalar) {
    const anahtar = dosya.replace(/\.model\.json$/, '');
    const e = vt.tek('SELECT id FROM ekranlar WHERE proje_id = ? AND anahtar = ? AND durum <> ? ORDER BY rowid', [ekran?.proje_id ?? '', anahtar, 'silindi']);
    const alt = e ? ekranModeliGetir(vt, String(e.id)) : undefined;
    if (alt && nesneMi(alt.model)) altModeller[dosya] = alt.model;
  }
  // Ortak akış adımları açılır (form, doğrulama ve koşu düz modeli görür; ortak akış hep son sürümüyle).
  const acik = ortakAkislariAc(model, altModeller);
  return { model: acik.model, altModeller, surum: kayit.surum, tamModel, akislar, akisId: akis.id, eksikOrtakAkislar: acik.eksikler };
}

/** @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
function ekranGetir(vt, projeId, ekranId) {
  const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
  if (!e) throw new DepoHatasi('Ekran bulunamadı.');
  return e;
}

/**
 * Yeni senaryonun veri kaynağı (spec + veri dosyası/yolu): adaptör biliyorsa ondan, yoksa aynı
 * ekranın mevcut veri güdümlü bir senaryosundan; o da yoksa ve ekranın modeli varsa MODEL kaynağı (test kodu
 * olmayan ekran — ör. elle oluşturulan projede tarama/sayfa paketiyle gelen ekran; spec adı taramanın kuralıyla,
 * diskte yoktur). Bulunamazsa null (bu ekranda senaryo oluşturulamaz).
 * model: true → yeni senaryo model koşucusuyla çalışır (icerik.kosucu = 'model'; bkz. senaryoKaydet).
 * @param {Veritabani} vt @param {string} projeId @param {{ id: string; anahtar: string }} ekran @param {AktarimAdaptoru | null | undefined} adaptor
 * @returns {{ spec: string; dosya: string; yol: string; model: boolean } | null}
 */
export function ekranVeriKaynagi(vt, projeId, ekran, adaptor) {
  const a = adaptor?.senaryoVeriKaynagi?.(ekran.anahtar);
  if (a) return { spec: a.spec, dosya: a.dosya, yol: a.yol, model: false };
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

/** Bağlam profili alanı (model şemasında havuzu bağlam türü olan "profil" alanı). */
function baglamAlani(/** @type {ReturnType<typeof formSemasiOlustur>} */ sema) {
  return tumFormAlanlari(sema).find((a) => a.tip === 'profil') ?? null;
}

// ---------------------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------------------

/**
 * Senaryolar ekranının listesi (seçili ortamda var olan senaryolar) + sol ekran listesi.
 * modelKosusu: senaryo test kodu olmadan model koşucusuyla çalışır (rozet "model"; bkz. model-kosusu.mjs).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {AktarimAdaptoru | null} [adaptor]
 * @param {{ kodDosyasiVar?: (dosya: string) => boolean }} [secenekler]
 */
export function senaryoListesi(vt, projeId, ortamId, adaptor = null, secenekler = {}) {
  acikAnahtar(vt);
  const senaryoEslemeleri = kaynakEslemeleriniListele(vt, projeId, 'senaryo');
  const eslemeliler = new Set(senaryoEslemeleri.map((e) => e.varlikId));
  const eslemeAnahtarlari = new Map(senaryoEslemeleri.map((e) => [e.varlikId, e.kaynakAnahtari]));
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
  // Son sonuçlar: seçili ortamın (ya da ortamı bilinmeyen) koşularından, senaryo kimliğine; kimliği
  // olmayan eski sonuçlar için "<dosya>::<başlık>" anahtarına göre en yenisi.
  /** @type {Map<string, { durum: string; zaman: string; sonucId: string; kosuId: string }>} */
  const sonKimlik = new Map();
  /** @type {Map<string, { durum: string; zaman: string; sonucId: string; kosuId: string }>} */
  const sonAnahtar = new Map();
  for (const r of vt.tumu(
    `SELECT r.id, r.kosu_id, r.senaryo_id, r.senaryo_anahtari, r.durum, COALESCE(r.bitis, k.bitis, k.baslangic) AS zaman
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id
      WHERE k.proje_id = ? AND (k.ortam_id = ? OR k.ortam_id IS NULL) ORDER BY zaman`, [projeId, ortamId]
  )) {
    const s = { durum: String(r.durum), zaman: String(r.zaman), sonucId: String(r.id), kosuId: String(r.kosu_id) };
    if (r.senaryo_id) sonKimlik.set(String(r.senaryo_id), s);
    if (r.senaryo_anahtari) sonAnahtar.set(String(r.senaryo_anahtari), s);
  }
  const ekranAdi = new Map(ekranlar.map((e) => [e.id, e.ad]));
  const ekranDurumu = new Map(ekranlar.map((e) => [e.id, e.durum]));
  const satirlar = [];
  /** @type {Map<string, number>} */
  const sayilar = new Map();
  for (const s of vt.tumu('SELECT * FROM senaryolar WHERE proje_id = ? ORDER BY baslik', [projeId])) {
    const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
    if (!ortamKimlikleri(icerik).includes(ortamId)) continue;
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
    const sonuc = sonKimlik.get(String(s.id)) ?? (anahtar ? sonAnahtar.get(anahtar) : undefined) ?? null;
    const kurallar = nesneMi(icerik.alanKurallari) && Array.isArray(icerik.alanKurallari.mutlakaGorunmeli) ? icerik.alanKurallari.mutlakaGorunmeli : [];
    sayilar.set(ekranId ?? '', (sayilar.get(ekranId ?? '') ?? 0) + 1);
    satirlar.push({
      id: String(s.id), baslik: String(s.baslik), ekranId, ekranAdi: ekranId ? ekranAdi.get(ekranId) ?? null : null,
      // Ekran devre dışıysa senaryo hiçbir koşuya girmez (Koşuyu başlat, ▷, npm run test; bkz. ekran-yonetimi.mjs).
      ekranEtkin: ekranId ? ekranDurumu.get(ekranId) !== 'devre_disi' : true,
      kosuyaDahil: s.kosuya_dahil === 1, veriGudumlu: veriGudumluMu(icerik), modelVar: Boolean(bilgi?.model),
      kaynak: senaryoKaynagi(icerik),
      baglamProfili: profilAlani ? { deger: profilDegeri, varsayilan: profilDegeri ? false : true, ad: profilDegeri ?? profilAlani.varsayilanProfil } : null,
      beklenenSonuc: sema && veri ? beklenenSonucEtiketi(sema, veri) : null,
      sonSonuc: sonuc, mutlakaGorunmeliSayisi: kurallar.length, paketten: nesneMi(icerik.paket),
      akis: akis ? { id: akis.id, ad: akis.ad } : null,
      modelKosusu: modelSenaryosuMu(icerik, { kodEslemesiVar: eslemeliler.has(String(s.id)), kodDosyasiVar: secenekler.kodDosyasiVar }),
      // "Kodu kaldırılmış": spec dosyası diskte yok (hızlı denetim; başlık denetimi kodKaldirilmisSenaryolar ile).
      kodDurumu: kodKaldirilmaNedeni({ id: String(s.id), icerik }, { eslemeliler, eslemeAnahtarlari, kodDosyasiVar: secenekler.kodDosyasiVar }),
      guncellenme: String(s.guncellenme)
    });
  }
  return {
    ekranlar: ekranlar.filter((e) => !altModelEkranlari.has(e.id)).map((e) => ({
      id: e.id, anahtar: e.anahtar, ad: e.ad, senaryoSayisi: sayilar.get(e.id) ?? 0, durum: e.durum,
      modelVar: Boolean(semalar.get(e.id)?.model), olusturulabilir: Boolean(semalar.get(e.id)?.sema) && Boolean(ekranVeriKaynagi(vt, projeId, e, adaptor))
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
    akis: senaryoAkisi(icerik)
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
 * Doğrulayıcının "ortak" bağlamı (tam; YALNIZCA sunucuda kullanılır). Adaptör sağlamıyorsa
 * undefined (profil varlığı / bağlama göre görünürlük kontrolleri atlanır).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {AktarimAdaptoru | null | undefined} adaptor
 */
function dogrulamaOrtagi(vt, projeId, ortamId, adaptor) {
  const anahtar = ortamAnahtariBul(vt, projeId, ortamId);
  if (!anahtar || !adaptor?.dogrulamaBaglami) return undefined;
  return adaptor.dogrulamaBaglami(vt, projeId, anahtar) ?? undefined;
}

/**
 * Tarayıcıya gidecek doğrulama bağlamı: profil ANAHTARLARI (değerler değil), bağlam profillerinin
 * görünürlüğü belirleyen kodları ve ortak kartın yalnızca son kullanma tarihi (süre uyarısı için).
 * @param {Nesne | undefined} ortak
 */
function tarayiciOrtagi(ortak) {
  if (!ortak) return null;
  /** @type {Nesne} */
  const sonuc = {};
  if (nesneMi(ortak.kimlikProfilleri)) {
    sonuc.kimlikProfilleri = Object.fromEntries(Object.entries(ortak.kimlikProfilleri).map(([tur, havuz]) =>
      [tur, nesneMi(havuz) ? Object.fromEntries(Object.keys(havuz).map((k) => [k, {}])) : {}]));
  }
  if (nesneMi(ortak.acenteProfilleri)) sonuc.acenteProfilleri = kopya(ortak.acenteProfilleri);
  const kart = nesneMi(ortak.varsayilanKrediKarti) ? ortak.varsayilanKrediKarti : null;
  if (kart) sonuc.varsayilanKrediKarti = { sonKullanmaAyi: kart.sonKullanmaAyi ?? null, sonKullanmaYili: kart.sonKullanmaYili ?? null };
  return sonuc;
}

/**
 * Model tabanlı formun bağlamı: model + alt modeller, profil havuzlarının seçenekleri (bağlam
 * profilleri: ad + alanlar; test verisi profilleri: ad + MASKELİ önizleme), tarayıcı doğrulama
 * bağlamı ve ekranın veri kaynağı. Modeli olmayan ekranda model: null.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {AktarimAdaptoru | null | undefined} adaptor
 */
export function formBaglami(vt, projeId, ekranId, ortamId, adaptor, akisId = null) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, projeId, ekranId);
  const ortamlar = ortamlariListele(vt, projeId).map((o) => ({ id: o.id, ad: o.ad, varsayilan: o.varsayilan }));
  if (!ortamlar.some((o) => o.id === ortamId)) throw new DepoHatasi('Ortam bulunamadı.');
  const mb = modelBaglami(vt, ekranId, akisId);
  const veriKaynagi = ekranVeriKaynagi(vt, projeId, ekran, adaptor);
  if (!mb) return { ekran, ortamlar, model: null, altModeller: {}, profiller: {}, ortak: null, veriKaynagi, olusturulabilir: false, akislar: [], akisId: null };
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
  const tanimlar = adaptor?.profilHavuzlari?.() ?? {};
  const turler = testVerisiTurleriniListele(vt, projeId);
  const ortamdaMi = (/** @type {string | null} */ o) => o === null || o === ortamId;
  /** @type {Record<string, Array<{ ad: string; tur: 'baglam' | 'testVerisi'; kapsam: 'tum' | 'ortam'; alanlar: Array<{ etiket: string; deger?: string; dolu: boolean }> }>>} */
  const profiller = {};
  for (const havuz of havuzlar) {
    // Adaptörün tanımı yoksa (elle oluşturulan proje) havuzun adı bağlam türüdür (ör. akış kaydının "Şube" alanı).
    // Tanım yoksa (elle oluşturulan proje): aynı adlı test verisi türü varsa test verisi (ör. kimlik profilleri), yoksa bağlam türü.
    const t = tanimlar[havuz] ?? (turler.some((x) => x.ad === havuz) ? { tur: 'testVerisi', ad: havuz } : { tur: 'baglam', ad: havuz });
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
    ortak: tarayiciOrtagi(dogrulamaOrtagi(vt, projeId, ortamId, adaptor)), veriKaynagi,
    olusturulabilir: Boolean(veriKaynagi)
  };
}

// ---------------------------------------------------------------------------------------
// Doğrulama + kaydet
// ---------------------------------------------------------------------------------------

/**
 * Senaryo verisini seçilen HER ortamın bağlamıyla doğrular; alt model (kart) alanlarını tek biçime
 * getirir ve ortak değerle aynıysa kaldırır. Hata varsa SenaryoDogrulamaHatasi.
 * @returns {{ veri: Nesne; uyarilar: Array<{ alan: string; mesaj: string }> }}
 */
function veriyiDogrula(/** @type {Veritabani} */ vt, /** @type {string} */ projeId, /** @type {{ model: Nesne; altModeller: Record<string, Nesne> }} */ mb,
  /** @type {Nesne} */ veri, /** @type {string[]} */ ortamIdleri, /** @type {AktarimAdaptoru | null | undefined} */ adaptor, /** @type {Map<string, string>} */ ortamAdlari) {
  const sema = formSemasiOlustur(mb.model, mb.altModeller);
  let sonuc = kopya(veri);
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const hatalar = [];
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const uyarilar = [];
  const birden = ortamIdleri.length > 1;
  for (const ortamId of ortamIdleri) {
    const ortak = dogrulamaOrtagi(vt, projeId, ortamId, adaptor);
    // Alt model ezme (ör. senaryoya özel kart): tek biçim + ortak değerle aynıysa yazılmaz.
    for (const alan of tumFormAlanlari(sema)) {
      if (alan.tip !== 'altModel' || !nesneMi(sonuc[alan.anahtar])) continue;
      // Alt model alanları modelde "eslesme.kart" ile tanımlıdır (kart şeması doğrulayıcıdadır).
      if (!alan.alanlar.length) continue;
      const on = senaryoyuDogrula(sonuc, { model: mb.model, altModeller: mb.altModeller, ortak, kaynak: 'kayit' });
      if (on.hatalar.some((h) => h.alan.startsWith(`${alan.anahtar}.`) || h.alan === alan.anahtar)) continue;
      const varsayilan = ortak && nesneMi(ortak.varsayilanKrediKarti) ? ortak.varsayilanKrediKarti : null;
      const kart = kartiNormallestir(/** @type {Nesne} */ (sonuc[alan.anahtar]), varsayilan);
      if (varsayilan && krediKartlariAyniMi(kart, varsayilan)) delete sonuc[alan.anahtar];
      else sonuc[alan.anahtar] = kart;
    }
    const d = senaryoyuDogrula(sonuc, { model: mb.model, altModeller: mb.altModeller, ortak, kaynak: 'kayit' });
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

/**
 * Senaryoyu kaydeder (yeni ya da mevcut). Kurallar:
 *  - Veri güdümlü + model: veri seçilen her ortam için tek doğrulayıcıyla doğrulanır; kaynak.ad ve
 *    verideki başlık yeni başlıkla eşitlenir (test başlığı = senaryo başlığı); ortam kapsamı
 *    ortamIdleri ile belirlenir (en az bir ortam).
 *  - Veri güdümlü, modelsiz: yalnızca başlık (+ verideki başlık) ve Koşuda.
 *  - Kodda tanımlı: yalnızca görünen başlık ve Koşuda (testin koddaki adı değişmez).
 *  - O an koşan senaryo (kosuyorMu) değiştirilemez.
 * @param {Veritabani} vt
 * Çoklu akış: senaryo bir akışa bağlıdır (akisId; verilmezse mevcut akışı, yeni senaryoda varsayılan akış); veri o akışın
 * modeliyle doğrulanır, akış içerikte (icerik.akis) saklanır (tek, örtük akışta yazılmaz).
 * @param {{ id?: string | null; projeId: string; ekranId?: string | null; baslik: unknown; veri?: unknown; ortamIdleri?: unknown; kosuyaDahil?: unknown; mutlakaGorunmeli?: unknown; akisId?: unknown; yapan?: string }} girdi
 * @param {{ adaptor?: AktarimAdaptoru | null; kosuyorMu?: (dosya: string, ad: string) => boolean }} [secenekler]
 * @returns {{ id: string; uyarilar: Array<{ alan: string; mesaj: string }> }}
 */
export function senaryoKaydet(vt, girdi, secenekler = {}) {
  acikAnahtar(vt);
  const baslik = baslikKontrol(girdi.baslik);
  const mevcut = girdi.id ? senaryoGetir(vt, girdi.id) : undefined;
  if (girdi.id && (!mevcut || mevcut.projeId !== girdi.projeId)) throw new DepoHatasi('Senaryo bulunamadı.');
  const kosuyaDahil = girdi.kosuyaDahil === undefined ? mevcut?.kosuyaDahil ?? true : girdi.kosuyaDahil === true;
  const eskiKaynak = mevcut ? senaryoKaynagi(mevcut.icerik) : null;
  if (eskiKaynak && secenekler.kosuyorMu?.(eskiKaynak.dosya, eskiKaynak.ad)) {
    throw new SenaryoCakismaHatasi('Bu senaryo şu anda koşuyor (ya da sırada); bitmesini bekleyin veya durdurun.');
  }

  // Kodda tanımlı senaryo: yalnızca görünen başlık + Koşuda.
  if (mevcut && !veriGudumluMu(mevcut.icerik)) {
    depoSenaryoKaydet(vt, { ...mevcut, baslik, kosuyaDahil, yapan: girdi.yapan });
    return { id: mevcut.id, uyarilar: [] };
  }

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
    : ekranVeriKaynagi(vt, girdi.projeId, ekran, secenekler.adaptor);
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
  if (girdi.veri !== undefined) {
    if (!mb) throw new DepoHatasi('Bu ekranın modeli yok; senaryo verisi yalnızca ekran modeliyle düzenlenebilir.');
    if (!nesneMi(girdi.veri)) throw new DepoHatasi('"veri" bir nesne olmalıdır.');
    const baslikAnahtari = formSemasiOlustur(mb.model, mb.altModeller).baslik;
    const d = veriyiDogrula(vt, girdi.projeId, mb, { ...girdi.veri, [baslikAnahtari]: baslik }, ortamIdleri, secenekler.adaptor, ortamAdlari);
    uyarilar = d.uyarilar;
    for (const o of ortamIdleri) ortamVerileri[o] = d.veri;
  } else {
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
  for (const o of ortamIdleri) {
    const eski = nesneMi(eskiOrtamlar[o]) ? eskiOrtamlar[o] : null;
    const sira = eski && typeof eski.sira === 'number' ? eski.sira : sonrakiSira(vt, girdi.projeId, kaynakVeri, o);
    yeniOrtamlar[o] = ortamVerileri[o] ? { sira, veri: veriyiSifrele(vt, girdi.projeId, ortamVerileri[o], modelHassasAnahtarlari(mb?.model)) } : { sira };
  }
  /** @type {Nesne} */
  const icerik = {
    ...(mevcut ? kopya(mevcut.icerik) : {}),
    // Test kodu olmayan ekranda (model kaynağı) yeni senaryo model koşucusuyla çalışır (bkz. model-kosusu.mjs > modelSenaryosuMu).
    ...(!mevcut && kaynakVeri.model ? { kosucu: 'model' } : {}),
    kaynak: { dosya: kaynakVeri.spec, ad: baslik },
    veri: { dosya: kaynakVeri.dosya, yol: kaynakVeri.yol },
    ortamlar: yeniOrtamlar
  };
  if (mutlaka.length) icerik.alanKurallari = { mutlakaGorunmeli: mutlaka };
  else delete icerik.alanKurallari;
  if (mb && mb.akisId !== ANA_AKIS_ID) icerik.akis = mb.akisId;
  else delete icerik.akis;
  const id = depoSenaryoKaydet(vt, {
    ...(mevcut ? { id: mevcut.id } : {}), projeId: girdi.projeId, ekranId, baslik, icerik, kosuyaDahil, yapan: girdi.yapan
  });
  return { id, uyarilar };
}

/**
 * Koşuda anahtarı (toplu).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} idler @param {boolean} dahil @param {string} [yapan]
 */
export function kosuyaDahilAyarla(vt, projeId, idler, dahil, yapan) {
  const liste = kimlikListesi(idler);
  let degisen = 0;
  vt.islem(() => {
    for (const id of liste) {
      const s = senaryoGetir(vt, id);
      if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
      if (s.kosuyaDahil === dahil) continue;
      depoSenaryoKaydet(vt, { ...s, kosuyaDahil: dahil, yapan });
      degisen++;
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
 * Senaryoları siler — yalnızca veri güdümlü (sahibi veritabanı olan) senaryolar. Kodda tanımlı bir
 * senaryo listede varsa HİÇBİRİ silinmez. Koşan senaryo silinmez.
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
  const kodda = senaryolar.filter((s) => !veriGudumluMu(s.icerik));
  if (kodda.length) {
    throw new DepoHatasi(`${kodda.length} senaryo kodda tanımlı (ör. "${kodda[0].baslik}"); bunlar silinemez, koşudan çıkarmak için Koşuda anahtarını kapatın.`);
  }
  for (const s of senaryolar) {
    const k = senaryoKaynagi(s.icerik);
    if (k && secenekler.kosuyorMu?.(k.dosya, k.ad)) throw new SenaryoCakismaHatasi(`"${s.baslik}" şu anda koşuyor; bitmesini bekleyin veya durdurun.`);
  }
  vt.islem(() => { for (const s of senaryolar) senaryoSil(vt, s.id, secenekler.yapan); });
  return { silinen: senaryolar.length };
}

// ---------------------------------------------------------------------------------------
// Kodu kaldırılmış senaryolar (spec dosyası ya da test başlığı artık yok)
// ---------------------------------------------------------------------------------------

/**
 * Senaryonun Playwright kaynağı: içerikteki (dosya + güncel başlık) ya da aktarım eşlemesindeki "<dosya>::<başlık>".
 * @param {{ id: string; icerik: unknown }} s @param {Map<string, string>} eslemeAnahtarlari
 */
function kodKaynagi(s, eslemeAnahtarlari) {
  const k = senaryoKaynagi(s.icerik);
  if (k) return k;
  const a = eslemeAnahtarlari.get(s.id);
  const i = a ? a.indexOf('::') : -1;
  return a && i > 0 ? { dosya: a.slice(0, i), ad: a.slice(i + 2) } : null;
}

/**
 * Kodla çalışan (model koşucusu senaryosu OLMAYAN) senaryonun kodu kaldırılmış mı?
 *  - 'dosya-yok'  : kaynaktaki spec dosyası diskte yok,
 *  - 'baslik-yok' : spec dosyası var ama kodda tanımlı (veri güdümlü olmayan) testin başlığı güncel Playwright
 *                   listesinde yok (yalnızca testVar verildiyse denetlenir; veri güdümlü testler veritabanından
 *                   üretildiği için dosya varsa her zaman vardır).
 * Model senaryoları (sayfa paketinden; kodu hiç olmayan) hiçbir zaman "kodu kaldırılmış" sayılmaz.
 * @param {{ id: string; icerik: unknown }} s
 * @param {{ eslemeliler: Set<string>; eslemeAnahtarlari: Map<string, string>; kodDosyasiVar?: (dosya: string) => boolean; testVar?: (dosya: string, ad: string) => boolean }} b
 * @returns {'dosya-yok' | 'baslik-yok' | null}
 */
export function kodKaldirilmaNedeni(s, b) {
  if (!b.kodDosyasiVar) return null;
  if (modelSenaryosuMu(s.icerik, { kodEslemesiVar: b.eslemeliler.has(s.id), kodDosyasiVar: b.kodDosyasiVar })) return null;
  const k = kodKaynagi(s, b.eslemeAnahtarlari);
  if (!k || k.dosya === MODEL_SPEC_DOSYASI) return null;
  if (!b.kodDosyasiVar(k.dosya)) return 'dosya-yok';
  if (b.testVar && !veriGudumluMu(s.icerik) && !b.testVar(k.dosya, k.ad)) return 'baslik-yok';
  return null;
}

/**
 * Ortamdaki "kodu kaldırılmış" senaryolar. testListesi verilirse (Playwright'ın güncel listesi) başlığı listede
 * olmayan kodlu testler de bulunur; alınamazsa yalnızca dosya denetimi yapılır (baslikDenetlendi: false).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId
 * @param {{ kodDosyasiVar: (dosya: string) => boolean; testListesi?: Array<{ dosya: string; ad: string }> | null }} secenekler
 */
export function kodKaldirilmisSenaryolar(vt, projeId, ortamId, secenekler) {
  const senaryoEslemeleri = kaynakEslemeleriniListele(vt, projeId, 'senaryo');
  const b = {
    eslemeliler: new Set(senaryoEslemeleri.map((e) => e.varlikId)),
    eslemeAnahtarlari: new Map(senaryoEslemeleri.map((e) => [e.varlikId, e.kaynakAnahtari])),
    kodDosyasiVar: secenekler.kodDosyasiVar,
    ...(secenekler.testListesi ? { testVar: ((liste) => (/** @type {string} */ d, /** @type {string} */ a) => liste.has(`${d}::${a}`))(new Set(secenekler.testListesi.map((t) => `${t.dosya}::${t.ad}`))) } : {})
  };
  // Silinmiş ekranların (mezar taşı) kodu kaldırılan / hariç tutulan dosyaları: bu dosyalara bağlı (ör. yedekten ya da
  // aktarımdan gelen) kalıntı satırlar "kodu kaldırılmış" uyarısı üretmez — ekran bilerek silindi.
  /** @type {Set<string>} */
  const silinmisDosyalar = new Set();
  for (const e of vt.tumu("SELECT silinme_json FROM ekranlar WHERE proje_id = ? AND durum = 'silindi'", [projeId])) {
    const m = mezarTasiOku(e.silinme_json);
    if (m) for (const d of [...m.kaldirilanDosyalar, ...m.kod.dosyalar]) silinmisDosyalar.add(d);
  }
  /** @type {Array<{ id: string; baslik: string; neden: 'dosya-yok' | 'baslik-yok'; dosya: string | null; ad: string | null }>} */
  const sonuc = [];
  for (const r of vt.tumu(
    "SELECT s.id, s.baslik, s.icerik_json FROM senaryolar s LEFT JOIN ekranlar e ON e.id = s.ekran_id WHERE s.proje_id = ? AND (e.durum IS NULL OR e.durum <> 'silindi') ORDER BY s.baslik",
    [projeId]
  )) {
    const s = { id: String(r.id), icerik: JSON.parse(String(r.icerik_json)) };
    if (!ortamKimlikleri(s.icerik).includes(ortamId)) continue;
    const neden = kodKaldirilmaNedeni(s, b);
    if (!neden) continue;
    const k = kodKaynagi(s, b.eslemeAnahtarlari);
    if (k && silinmisDosyalar.has(k.dosya)) continue;
    sonuc.push({ id: s.id, baslik: String(r.baslik), neden, dosya: k?.dosya ?? null, ad: k?.ad ?? null });
  }
  return { senaryolar: sonuc, baslikDenetlendi: Boolean(secenekler.testListesi) };
}

/**
 * Kodu kaldırılmış senaryoları veritabanından siler (değişiklik geçmişi KORUNUR: silinen kaydın son hali geçmişe
 * yazılır; eski koşu sonuçları kalır). Her kimlik SUNUCUDA yeniden denetlenir: kodu hâlâ duran bir senaryo
 * listedeyse HİÇBİRİ silinmez. Koşan senaryo silinmez.
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {unknown} idler
 * @param {{ kodDosyasiVar: (dosya: string) => boolean; testListesi?: Array<{ dosya: string; ad: string }> | null; kosuyorMu?: (dosya: string, ad: string) => boolean; yapan?: string }} secenekler
 */
export function kodKaldirilmisSenaryolariSil(vt, projeId, ortamId, idler, secenekler) {
  const liste = kimlikListesi(idler);
  const denetim = kodKaldirilmisSenaryolar(vt, projeId, ortamId, secenekler);
  const kaldirilmis = new Map(denetim.senaryolar.map((x) => [x.id, x]));
  const kodu = liste.filter((id) => !kaldirilmis.has(id));
  if (kodu.length) {
    const s = senaryoGetir(vt, kodu[0]);
    if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
    throw new DepoHatasi(`"${s.baslik}" senaryosunun kodu hâlâ duruyor (ya da bu ortamda denetlenemedi); kaldırılmadı. Yalnızca "kodu kaldırılmış" senaryolar silinebilir.`);
  }
  for (const id of liste) {
    const x = /** @type {{ dosya: string | null; ad: string | null; baslik: string }} */ (kaldirilmis.get(id));
    if (x.dosya && x.ad && secenekler.kosuyorMu?.(x.dosya, x.ad)) throw new SenaryoCakismaHatasi(`"${x.baslik}" şu anda koşuyor; bitmesini bekleyin veya durdurun.`);
  }
  vt.islem(() => { for (const id of liste) senaryoSil(vt, id, secenekler.yapan); });
  return { silinen: liste.length };
}

/**
 * Veri güdümlü senaryonun kopyası: "<başlık> (kopya[ N])", aynı ortamlar, verinin kopyası, sıranın
 * sonuna eklenir. Kopya Koşuda KAPALI başlar (aynı testin çift koşmaması için).
 * @param {Veritabani} vt @param {string} projeId @param {string} id @param {string} [yapan]
 */
export function senaryoKopyala(vt, projeId, id, yapan) {
  acikAnahtar(vt);
  const s = senaryoGetir(vt, id);
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  if (!veriGudumluMu(s.icerik)) throw new DepoHatasi('Kodda tanımlı senaryolar kopyalanamaz.');
  const kaynak = /** @type {{ dosya: string; ad: string }} */ (senaryoKaynagi(s.icerik));
  let baslik = '';
  for (let n = 1; n < 1000; n++) {
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
      if (once.kosuya_dahil !== sonra.kosuya_dahil) degisenler.push(`Koşuda: ${once.kosuya_dahil === 1 ? 'açık' : 'kapalı'} → ${sonra.kosuya_dahil === 1 ? 'açık' : 'kapalı'}`);
      const a = icerikOku(once);
      const b = icerikOku(sonra);
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
 * Senaryo kimliğini çalıştırılacak Playwright testine çözer: içerikteki kaynak (dosya + GÜNCEL
 * test başlığı; yoksa aktarım eşlemesindeki "<dosya>::<başlık>") ve ortamın çalıştırıcı anahtarı.
 * Kasa gerekmez (kaynak ve eşlemeler açık metindir) — yasaklı adres deseni verildiyse gerekir (ortam adresi şifreli).
 * Model senaryosunda (kodda karşılığı yok) hedef model spec'idir: ad yerine etiket + grep deseni döner.
 * GENEL YOL: model senaryosunun ortamı aktarımla bir çalıştırıcı anahtarına ("test"/"canli") eşlenmemişse (elle
 * oluşturulan proje/ortam) ortamAnahtari null, genel = { projeId, ortamId } döner — koşu genel model yapılandırmasıyla
 * (playwright.model.config.ts) proje ve ortam KİMLİKLERİYLE yapılır; hiçbir adaptöre bağlı değildir.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} senaryoId @param {unknown} ortamId
 * @param {{ kodDosyasiVar?: (dosya: string) => boolean; yasakDesenleri?: Array<{ kalip: string; desen: RegExp }> }} [secenekler]
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
  if (modelKosusuMu(vt, projeId, s, { kodDosyasiVar: secenekler.kodDosyasiVar })) {
    // Model senaryosu: tek model spec'i, senaryonun etiketiyle (UUID) daraltılır; test kodu gerekmez.
    if (!s.ekranId || !modelBaglami(vt, s.ekranId)) throw new DepoHatasi(`"${s.baslik}" senaryosunun ekran modeli yok; model koşucusuyla çalıştırılamaz.`);
    if (!ortamKimlikleri(s.icerik).includes(ortamId)) throw new DepoHatasi(`"${s.baslik}" seçilen ortamda tanımlı değil.`);
    const ortamAnahtari = ortamAnahtariBul(vt, projeId, ortamId);
    return {
      senaryoId: s.id, baslik: s.baslik, dosya: MODEL_SPEC_DOSYASI, ad: null, ortamAnahtari, ekranId: s.ekranId,
      model: true, etiket: modelEtiketi(s.id), grepDeseni: modelGrepDeseni(s.id),
      genel: ortamAnahtari ? null : { projeId, ortamId }
    };
  }
  let kaynak = senaryoKaynagi(s.icerik);
  if (!kaynak) {
    const e = kaynakEslemeleriniListele(vt, projeId, 'senaryo').find((x) => x.varlikId === s.id);
    const i = e ? e.kaynakAnahtari.indexOf('::') : -1;
    if (e && i > 0) kaynak = { dosya: e.kaynakAnahtari.slice(0, i), ad: e.kaynakAnahtari.slice(i + 2) };
  }
  if (!kaynak) throw new DepoHatasi(`"${s.baslik}" senaryosunun test dosyası bilinmiyor; çalıştırılamaz.`);
  if (!ortamKimlikleri(s.icerik).includes(ortamId)) throw new DepoHatasi(`"${s.baslik}" seçilen ortamda tanımlı değil.`);
  const ortamAnahtari = ortamAnahtariBul(vt, projeId, ortamId);
  if (!ortamAnahtari) throw new DepoHatasi('Seçilen ortam test çalıştırıcısına eşlenmemiş (proje dosyalarından aktarılmış bir ortam olmalı).');
  return { senaryoId: s.id, baslik: s.baslik, dosya: kaynak.dosya, ad: kaynak.ad, ortamAnahtari, ekranId: s.ekranId, model: false, etiket: null, grepDeseni: null, genel: null };
}

/**
 * Model senaryosunun "Dene" paketi: taslak (akışın modeliyle doğrulanmış) GEÇİCİ bir deneme senaryosu olarak döner; koşucu
 * bunu geçici bir dosyayla veri okuyucuya verir (TEST_SUNUCU_MODEL_DENEME_DOSYASI), model spec'i onu "@model-deneme-…"
 * etiketiyle tek test olarak üretir. Veritabanına senaryo YAZILMAZ (koşu sonucu, kodlu Dene gibi senaryosuz kaydedilir).
 * @param {Veritabani} vt @param {{ projeId: string; ekranId: string; ortamId: string; veri: unknown; akisId?: string | null; mutlakaGorunmeli?: unknown }} girdi
 * @param {NonNullable<ReturnType<typeof modelBaglami>>} mb @param {{ adaptor?: AktarimAdaptoru | null; geciciEk: string }} secenekler
 */
function modelDenemePaketi(vt, girdi, mb, secenekler) {
  const ortamlar = ortamlariListele(vt, girdi.projeId);
  if (!ortamlar.some((o) => o.id === girdi.ortamId)) throw new DepoHatasi('Seçilen ortam bu projede yok.');
  const baslikAnahtari = formSemasiOlustur(mb.model, mb.altModeller).baslik;
  const geciciBaslik = `${DENEME_BASLIK_ON_EKI}${secenekler.geciciEk}`;
  const d = veriyiDogrula(vt, girdi.projeId, mb, { .../** @type {Nesne} */ (girdi.veri), [baslikAnahtari]: geciciBaslik }, [girdi.ortamId], secenekler.adaptor,
    new Map(ortamlar.map((o) => [o.id, o.ad])));
  const ortamAnahtari = ortamAnahtariBul(vt, girdi.projeId, girdi.ortamId);
  const denemeId = `deneme-${secenekler.geciciEk}`;
  const mutlaka = Array.isArray(girdi.mutlakaGorunmeli) ? girdi.mutlakaGorunmeli.filter((x) => typeof x === 'string').slice(0, 500) : [];
  return {
    model: /** @type {const} */ (true), ortamAnahtari, genel: ortamAnahtari ? null : { projeId: girdi.projeId, ortamId: girdi.ortamId },
    spec: MODEL_SPEC_DOSYASI, geciciBaslik, etiket: modelEtiketi(denemeId), grepDeseni: modelGrepDeseni(denemeId), uyarilar: d.uyarilar,
    denemeSenaryosu: { id: denemeId, ekranId: girdi.ekranId, akisId: mb.akisId, ortamId: girdi.ortamId, baslik: geciciBaslik, veri: d.veri, mutlakaGorunmeli: mutlaka }
  };
}

/**
 * "Dene" (deneme koşusu) paketi: taslak senaryo modelle doğrulanır ve GEÇİCİ bir başlıkla, testlerin
 * kalıcı veriye eklediği bir "ek veri" (overlay) nesnesi olarak döner. Veritabanına YAZILMAZ.
 * @param {Veritabani} vt
 * @param {{ projeId: string; ekranId: string; ortamId: string; veri: unknown; id?: string | null; akisId?: string | null; mutlakaGorunmeli?: unknown }} girdi
 * @param {{ adaptor?: AktarimAdaptoru | null; geciciEk: string }} secenekler geciciEk: geçici başlığın rastgele son eki
 */
export function denemePaketiOlustur(vt, girdi, secenekler) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, girdi.projeId, girdi.ekranId);
  const mb = modelBaglami(vt, ekran.id, girdi.akisId ?? null);
  if (!mb) throw new DepoHatasi('Bu ekranın modeli yok; deneme yapılamaz.');
  if (!nesneMi(girdi.veri)) throw new DepoHatasi('"veri" bir nesne olmalıdır.');
  const mevcut = girdi.id ? senaryoGetir(vt, girdi.id) : undefined;
  const modelSenaryosu = mevcut
    ? modelKosusuMu(vt, girdi.projeId, mevcut, {})
    : Boolean(ekranVeriKaynagi(vt, girdi.projeId, ekran, secenekler.adaptor)?.model);
  if (modelSenaryosu) return modelDenemePaketi(vt, girdi, mb, secenekler);
  const kaynakVeri = mevcut && veriGudumluMu(mevcut.icerik) && senaryoKaynagi(mevcut.icerik)
    ? { spec: /** @type {{ dosya: string }} */ (senaryoKaynagi(mevcut.icerik)).dosya, dosya: String(/** @type {Nesne} */ (mevcut.icerik.veri).dosya), yol: String(/** @type {Nesne} */ (mevcut.icerik.veri).yol) }
    : ekranVeriKaynagi(vt, girdi.projeId, ekran, secenekler.adaptor);
  if (!kaynakVeri) throw new DepoHatasi('Bu ekran için senaryo verisi kaynağı bilinmiyor; deneme yapılamaz.');
  const ortamAnahtari = ortamAnahtariBul(vt, girdi.projeId, girdi.ortamId);
  if (!ortamAnahtari) throw new DepoHatasi('Seçilen ortam test çalıştırıcısına eşlenmemiş.');
  const ortamlar = ortamlariListele(vt, girdi.projeId);
  const baslikAnahtari = formSemasiOlustur(mb.model, mb.altModeller).baslik;
  const geciciBaslik = `${DENEME_BASLIK_ON_EKI}${secenekler.geciciEk}`;
  const d = veriyiDogrula(vt, girdi.projeId, mb, { ...girdi.veri, [baslikAnahtari]: geciciBaslik }, [girdi.ortamId], secenekler.adaptor,
    new Map(ortamlar.map((o) => [o.id, o.ad])));
  return {
    ortamAnahtari, spec: kaynakVeri.spec, geciciBaslik, uyarilar: d.uyarilar,
    ekVeri: { ortam: ortamAnahtari, ekVeriler: [{ dosya: kaynakVeri.dosya, yol: kaynakVeri.yol.split('.'), ogeler: [d.veri] }] }
  };
}
