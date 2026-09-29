// SENARYO HAZIRLIĞI (sunucu) — kayıtlı ekran senaryosunun bir ortamda çalıştırılıp çalıştırılamayacağı ve nedeni. Kurallar ve metinler
// saf modülden (hazirlik.mjs; senaryo formu da aynısını kullanır): gönderme eylemi, beklenen sonuç, test verisi ve koşuyu kesin
// engelleyen durumlar (model yok, ekran silinmiş, ortamda tanımlı değil, ortak akış eksik). Koşucunun zaten kullandığı kurallardır
// (modelKosuPlani, ekran-basvurulari.mjs); hiçbir istek atılmaz, hiçbir şey yazılmaz.
//   senaryoHazirligi(vt, projeId, senaryoId, ortamId)  → { calistirilabilir, neden, nedenler, eksikler, maddeler }
//   listeHazirliklari(vt, projeId, satirlar, ortamId)   senaryo listesinin satırlarına ortam başına { calistirilabilir, neden, eksikler }
// "Alanlar hazır" (alan doğrulaması) yalnız senaryo formunda denetlenir: kayıtlı senaryo zaten doğrulanarak kaydedilir; koşucu da
// alanları doğrulamaz (bugünkü davranış; geriye uyum).
// Değer GÖSTERİLMEZ: test verisi maddesinde yalnız tablo ve satır ADI.
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ekranlariListele, ortamGetir, senaryoGetir } from '../veritabani/depo.mjs';
import { modelBaglami, senaryoAkisi, senaryoOrtamVerisi } from './senaryo-servisi.mjs';
import { modelKosuPlani, modelSenaryosuMu } from './model-kosusu.mjs';
import { NEDENLER, eylemDenetimi, hazirlikOzeti, veriMaddesi } from './hazirlik.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { etkinAlanBaglari } from '../tablolar/ekran-baglari.mjs';
import { ekranBasvurulariniCoz, modelAlanBilgisi, tabloBasvurusuVarMi } from '../tablolar/ekran-basvurulari.mjs';
import { satirSecimiOlustur } from '../tablolar/tablo-secimi.mjs';
import { basvuruGruplari, veriKosusuSayisi } from '../tablolar/veri-kosulari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./hazirlik.mjs').HazirlikMaddesi} HazirlikMaddesi */
/**
 * @typedef {{ modeller?: Map<string, ReturnType<typeof modelBaglami>>; tablolar?: import('../tablolar/tablo-deposu.mjs').Tablo[];
 *   baglar?: Map<string, ReturnType<typeof etkinAlanBaglari>>; ekranlar?: Map<string, { ad: string; durum: string }>; ortamAdlari?: Map<string, string> }} Onbellek
 */

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * Kesin engelle biten sonuç (madde yok).
 * @param {string} neden @returns {{ calistirilabilir: boolean; neden: string | null; nedenler: string[]; eksikler: string[]; maddeler: HazirlikMaddesi[] }}
 */
const engelli = (neden) => ({ ...hazirlikOzeti([], [neden]), maddeler: [] });

/**
 * Kayıtlı senaryonun bu ortamdaki hazırlığı.
 * @param {Veritabani} vt @param {string} projeId @param {string} senaryoId @param {string} ortamId @param {Onbellek} [onbellek]
 */
export function senaryoHazirligi(vt, projeId, senaryoId, ortamId, onbellek = {}) {
  const s = senaryoGetir(vt, senaryoId);
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  if (!modelSenaryosuMu(s.icerik)) return engelli(NEDENLER.kodluSenaryo);
  onbellek.ekranlar ??= new Map(ekranlariListele(vt, projeId, { silinenlerDahil: true }).map((e) => [e.id, { ad: e.ad, durum: e.durum }]));
  const ekran = s.ekranId ? onbellek.ekranlar.get(s.ekranId) : undefined;
  if (!s.ekranId || !ekran) return engelli(NEDENLER.modelYok);
  if (ekran.durum === 'silindi') return engelli(NEDENLER.ekranSilindi);
  const icerik = /** @type {Record<string, any>} */ (s.icerik);
  if (!nesneMi(icerik.ortamlar) || !nesneMi(icerik.ortamlar[ortamId])) {
    onbellek.ortamAdlari ??= new Map();
    if (!onbellek.ortamAdlari.has(ortamId)) onbellek.ortamAdlari.set(ortamId, (() => { try { return ortamGetir(vt, ortamId)?.ad ?? ''; } catch { return ''; } })());
    return engelli(NEDENLER.ortamdaTanimsiz(onbellek.ortamAdlari.get(ortamId) || null));
  }
  const akis = senaryoAkisi(icerik);
  onbellek.modeller ??= new Map();
  const anahtar = `${s.ekranId}\u0000${akis ?? ''}`;
  if (!onbellek.modeller.has(anahtar)) onbellek.modeller.set(anahtar, modelBaglami(vt, s.ekranId, akis));
  const mb = onbellek.modeller.get(anahtar);
  if (!mb) return engelli(NEDENLER.modelYok);
  const veri = senaryoOrtamVerisi(vt, icerik, ortamId) ?? {};
  const mutlaka = nesneMi(icerik.alanKurallari) && Array.isArray(icerik.alanKurallari.mutlakaGorunmeli) ? icerik.alanKurallari.mutlakaGorunmeli.filter((/** @type {unknown} */ x) => typeof x === 'string') : [];
  // Adım kapsamı ve beklenen sonuç koşucunun planıyla (modelKosuPlani) — aynı görünürlük ve aynı "son adım" kuralı.
  const plan = modelKosuPlani(mb.model, veri, { altModeller: mb.altModeller, mutlakaGorunmeli: mutlaka });
  const eylem = eylemDenetimi(mb.model, {
    adimDahil: Object.fromEntries(plan.adimlar.map((a) => [a.id, a.dahil])),
    beklenen: plan.beklenen.tur === 'hata' ? { tur: 'hata', adim: plan.beklenen.adim, mesaj: plan.beklenen.mesaj } : { tur: 'basari' }
  });
  const veriM = testVerisiMaddesi(vt, projeId, s.ekranId, mb.model, veri, icerik, ortamId, onbellek);
  const maddeler = [veriM, eylem.gonderme, eylem.beklenen];
  return { ...hazirlikOzeti(maddeler, eylem.engeller), maddeler };
}

/**
 * Test verisi: tablo başvuruları bu ortamda koşucunun kuralıyla (ekran-basvurulari.mjs; senaryonun satır seçimleri, ilk uyan satır)
 * çözülebiliyor mu? Kullanılacak satırlar ADIYLA (değer yok).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {any} model @param {Record<string, unknown>} veri
 * @param {Record<string, any>} icerik @param {string} ortamId @param {Onbellek} onbellek @returns {HazirlikMaddesi}
 */
function testVerisiMaddesi(vt, projeId, ekranId, model, veri, icerik, ortamId, onbellek) {
  if (!tabloBasvurusuVarMi(veri)) return veriMaddesi({ kullaniliyor: false });
  onbellek.tablolar ??= tablolariListele(vt, projeId, { cozulsun: true });
  onbellek.baglar ??= new Map();
  if (!onbellek.baglar.has(ekranId)) onbellek.baglar.set(ekranId, etkinAlanBaglari(vt, ekranId));
  const tablolar = onbellek.tablolar;
  const tabloSecimleri = nesneMi(icerik.tabloSecimleri) ? /** @type {Record<string, Record<string, string>>} */ (icerik.tabloSecimleri) : undefined;
  const satirSecimi = { ...satirSecimiOlustur('ilk'), kullanilan: /** @type {Map<string, any>} */ (new Map()) };
  const r = ekranBasvurulariniCoz(veri, {
    tablolar, baglar: onbellek.baglar.get(ekranId), ...modelAlanBilgisi(model), ortamId, satirSecimi, ...(tabloSecimleri ? { tabloSecimleri } : {})
  });
  const vk = veriKosusuSayisi(/** @type {any} */ (icerik.veriKosulari), { tablolar, gruplar: basvuruGruplari(veri, tablolar), ortamId, kip: null, tabloSecimleri: tabloSecimleri ?? null });
  const sorun = r.hatalar[0]?.mesaj ?? vk.hatalar[0] ?? null;
  const satirlar = [...satirSecimi.kullanilan.entries()].map(([g, satir]) => {
    const t = tablolar.find((x) => x.id === g.split('|')[0]);
    return `${t ? t.ad : '?'}: ${satir?.ad || 'adsız satır'}`;
  });
  return veriMaddesi({ kullaniliyor: true, sorun, satirlar });
}

/**
 * Senaryo listesinin satırlarına hazırlık özeti (ortam başına; sunucu uçları): birleşik listede her ortam kaydına, tek ortamlı listede
 * satırın kendisine { calistirilabilir, neden, eksikler }. Hesaplanamazsa (ör. kasa kilitli) hazırlık yazılmaz (arayüz bilinmiyor sayar).
 * @param {Veritabani} vt @param {string} projeId
 * @param {Array<Record<string, any>>} satirlar senaryoListesi(...).senaryolar @param {string | null} ortamId
 */
export function listeHazirliklari(vt, projeId, satirlar, ortamId) {
  /** @type {Onbellek} */
  const onbellek = {};
  const hesapla = (/** @type {string} */ id, /** @type {string} */ o) => {
    try {
      const h = senaryoHazirligi(vt, projeId, id, o, onbellek);
      return { calistirilabilir: h.calistirilabilir, neden: h.neden, eksikler: h.eksikler };
    } catch {
      return null;
    }
  };
  for (const x of satirlar) {
    if (ortamId) {
      const h = hesapla(String(x.id), ortamId);
      if (h) x.hazirlik = h;
      continue;
    }
    for (const o of Array.isArray(x.ortamlar) ? x.ortamlar : []) {
      if (!o.tanimli) continue;
      const h = hesapla(String(x.id), String(o.ortamId));
      if (h) o.hazirlik = h;
    }
  }
  return satirlar;
}
