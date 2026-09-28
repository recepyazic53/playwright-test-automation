// SENARYO ÇALIŞTIRMA (genel) — POST /platform/senaryolar/calistir ve /platform/senaryo/dene'nin
// doğrulama + çözümleme katmanı. Senaryo KİMLİĞİ (UUID) gelir; sunucu bunu model spec'i + senaryonun etiketine
// çözer (senaryo-servisi.mjs > calistirmaHedefiCoz; koşu proje + ortam kimliğiyle), ardından enjekte edilen "koşucu" ile mevcut çalıştırma altyapısını kullanır
// (scripts/test-sunucu.mjs: --list beyaz listesi, dosya sırası, canlı görüntü, durdurma, platform
// raporlayıcısı). İstemciden gelen başlık/dosya ASLA kullanılmaz.
// Birim testleri sahte bir koşucu verir; gerçek koşu başlatmaz.
// NOT: import.meta KULLANILMAZ. Tipler: calistirma.d.mts.

import { randomBytes } from 'node:crypto';
import { DepoHatasi, ekranlariListele, ortamGetir } from '../veritabani/depo.mjs';
import { UYGULAMA_SURUMU_DEGISKENI, kosuUygulamaSurumu } from '../ayarlar/rapor-verileri.mjs';
import { calistirmaHedefiCoz, denemePaketiOlustur } from './senaryo-servisi.mjs';
import { senaryoVeriKosusuTahmini, tekrarSenaryoPlani, veriKosusuSiniri } from './veri-kosusu-plani.mjs';
import { KOSU_KIPLERI, TEKRAR_KAYNAGI_DEGISKENI, TEKRAR_PLANI_DEGISKENI, VERI_KIPI_DEGISKENI } from '../tablolar/veri-kosulari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./calistirma.d.mts').Kosucu} Kosucu */

/**
 * Koşularda "ortam" alanının değeri: yalnızca loglarda ve koşu kuyruğunda görünür. Ortamın ADI kullanılmaz — ad şifreli
 * saklanır ve sunucu logu düz metindir.
 */
export const GENEL_ORTAM_ETIKETI = 'genel';

const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const KOSU_KIMLIGI = /^[A-Za-z0-9-]{1,64}$/;

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !KIMLIK.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * Silinmiş ekranın senaryosu çalıştırılamaz / denenemez. Devre dışı ekranın senaryosu toplu koşuya ("Koşuyu başlat")
 * girmez; tek başına çalıştırma (▷) ve Dene'ye izin verilir (kullanıcı kararı, 2026-09-25).
 * @param {Veritabani} vt @param {string} senaryoId @param {string | null} [ekranId] verilirse doğrudan bu ekran denetlenir
 * @param {{ devreDisiIzinli?: boolean }} [s]
 */
function ekranEtkinOlmali(vt, senaryoId, ekranId, s = {}) {
  const id = ekranId ?? /** @type {string | null} */ (vt.tek('SELECT ekran_id FROM senaryolar WHERE id = ?', [senaryoId])?.ekran_id ?? null);
  if (!id) return;
  const e = vt.tek('SELECT ad, durum FROM ekranlar WHERE id = ?', [id]);
  if (e && e.durum === 'devre_disi' && !s.devreDisiIzinli) throw new DepoHatasi(`"${e.ad}" ekranı devre dışı; senaryoları toplu koşuya girmez (tek başına ▷ ile çalıştırılabilir). Ekranlar > ⋯ > Etkinleştir.`);
  if (e && e.durum === 'silindi') throw new DepoHatasi(`"${e.ad}" ekranı silinmiş; senaryoları çalıştırılamaz.`);
}

/**
 * Çalıştırma gövdesini doğrular ve senaryoyu çözer (hiçbir şey başlatmaz).
 *  - kosuId: bu tekil koşu isteğinin kimliği (durdurma / canlı görüntü bununla yapılır) — zorunlu.
 *  - kosuTuru 'tam' | 'tekil' (isteğe bağlı): birlikte başlatılan senaryolar ortak kosuKimligi taşır.
 *  - kosuKapsami yalnızca 'tam' koşuda: 'Genel' ya da projedeki bir ekranın adı.
 *  - tekBasina: true yalnızca tek senaryo (▷) çalıştırmasında; devre dışı ekranın senaryosu yalnızca böyle çalışır.
 * secenekler: yasakDesenleri (yasaklı adres koruması).
 * @param {Veritabani} vt @param {Record<string, unknown>} govde @param {import('./calistirma.d.mts').CalistirmaSecenekleri} [secenekler]
 */
export function calistirmaIsteginiHazirla(vt, govde, secenekler = {}) {
  const projeId = kimlik(govde.projeId, 'projeId');
  const kosuId = kimlik(govde.kosuId, 'kosuId');
  const kosuTuru = govde.kosuTuru === undefined || govde.kosuTuru === null ? null : govde.kosuTuru;
  if (kosuTuru !== null && kosuTuru !== 'tam' && kosuTuru !== 'tekil') throw new DepoHatasi('"kosuTuru" yalnızca "tam" ya da "tekil" olabilir.');
  let kosuKimligi = null;
  if (kosuTuru) {
    if (typeof govde.kosuKimligi !== 'string' || !KOSU_KIMLIGI.test(govde.kosuKimligi)) throw new DepoHatasi('"kosuKimligi" geçersiz (harf, rakam ve "-"; en fazla 64 karakter).');
    kosuKimligi = govde.kosuKimligi;
  }
  let kosuKapsami = null;
  if (kosuTuru === 'tam') {
    const kapsam = govde.kosuKapsami === undefined || govde.kosuKapsami === null ? 'Genel' : govde.kosuKapsami;
    if (typeof kapsam !== 'string' || (kapsam !== 'Genel' && !ekranlariListele(vt, projeId).some((e) => e.ad === kapsam))) {
      throw new DepoHatasi('"kosuKapsami" "Genel" ya da projedeki bir ekranın adı olmalıdır.');
    }
    kosuKapsami = kapsam;
  }
  const hedef = calistirmaHedefiCoz(vt, projeId, govde.senaryoId, govde.ortamId, secenekler);
  ekranEtkinOlmali(vt, hedef.senaryoId, null, { devreDisiIzinli: kosuTuru !== 'tam' && govde.tekBasina === true });
  return { projeId, kosuId, kosuTuru, kosuKimligi, kosuKapsami, hedef, ekOrtam: { ...veriKosusuOrtami(vt, projeId, hedef, govde), ...surumOrtami(vt, hedef, govde) } };
}

/**
 * UYGULAMA SÜRÜMÜ (PDF rapor A4): koşu kaydına etiket olarak yazılacak test edilen uygulama sürümü — gövdedeki "uygulamaSurumu"
 * (koşu başlatılırken girilen; isteğe bağlı), yoksa ortam ayarındaki. Sürüm hiçbir adrese sorulmaz. Ortam okunamazsa (ör. kasa
 * kilitli) sürümsüz koşar.
 * @param {Veritabani} vt @param {{ genel: { ortamId: string } }} hedef @param {Record<string, unknown>} govde @returns {Record<string, string>}
 */
function surumOrtami(vt, hedef, govde) {
  let ortam = null;
  try { ortam = ortamGetir(vt, hedef.genel.ortamId) ?? null; } catch { ortam = null; }
  const surum = kosuUygulamaSurumu(govde.uygulamaSurumu, ortam);
  return surum ? { [UYGULAMA_SURUMU_DEGISKENI]: surum } : {};
}

/**
 * VERİ KOŞULARI ve TEKRAR (tablolar/veri-kosulari.mjs): koşu sürecine verilecek ortam değişkenleri.
 *  - veriKipi (koşu anı ezmesi): 'senaryo' (varsayılan; senaryonun ayarı) | 'tek' (hepsi tek satır) | 'tumu' (uyan tüm satırlar).
 *  - Tahmini test sayısı Ayarlar > Koşu > "Tek senaryoda en çok veri koşusu"nu aşarsa koşu BAŞLATILMAZ.
 *  - tekrar: { kaynakKosuId, model?: 'kosudaki' | 'guncel', veri?: 'guncel' | 'kosudaki' } — yalnız o koşuda kalan veri koşuları, o
 *    koşudaki satırlar ve (varsayılan) o koşudaki model sürümüyle; plan sunucunun kaydından kurulur (istemci yalnız seçim gönderir).
 * @param {Veritabani} vt @param {string} projeId @param {{ senaryoId: string; genel: { ortamId: string } }} hedef @param {Record<string, unknown>} govde
 * @returns {Record<string, string>}
 */
function veriKosusuOrtami(vt, projeId, hedef, govde) {
  const ortamId = hedef.genel.ortamId;
  if (govde.tekrar !== undefined && govde.tekrar !== null) {
    if (typeof govde.tekrar !== 'object' || Array.isArray(govde.tekrar)) throw new DepoHatasi('"tekrar" bir nesne olmalıdır.');
    const t = /** @type {Record<string, unknown>} */ (govde.tekrar);
    if (t.model !== undefined && t.model !== 'kosudaki' && t.model !== 'guncel') throw new DepoHatasi('"tekrar.model" "kosudaki" ya da "guncel" olmalıdır.');
    if (t.veri !== undefined && t.veri !== 'kosudaki' && t.veri !== 'guncel') throw new DepoHatasi('"tekrar.veri" "kosudaki" ya da "guncel" olmalıdır.');
    const plan = tekrarSenaryoPlani(vt, { kaynakKosuId: t.kaynakKosuId, senaryoId: hedef.senaryoId, ortamId, model: t.model, veri: t.veri });
    return {
      [TEKRAR_PLANI_DEGISKENI]: JSON.stringify({ senaryolar: { [hedef.senaryoId]: { modelSurumu: plan.modelSurumu, kosular: plan.kosular } } }),
      [TEKRAR_KAYNAGI_DEGISKENI]: String(t.kaynakKosuId)
    };
  }
  const kip = govde.veriKipi === undefined || govde.veriKipi === null ? 'senaryo' : govde.veriKipi;
  if (!KOSU_KIPLERI.includes(/** @type {string} */ (kip))) throw new DepoHatasi('"veriKipi" "senaryo", "tek" ya da "tumu" olmalıdır.');
  // Tahmin okunamazsa (ör. kasa kilitli) burada engellenmez: koşucu aynı sınırı veri okurken uygular (test açık hatayla kalır).
  const tahmin = (() => { try { return senaryoVeriKosusuTahmini(vt, projeId, hedef.senaryoId, ortamId, /** @type {string} */ (kip)); } catch { return null; } })();
  const sinir = veriKosusuSiniri(vt);
  if (tahmin && tahmin.sayi > sinir) {
    throw new DepoHatasi(`"${tahmin.baslik}" bu ortamda ${tahmin.sayi} veri koşusu çıkarıyor; tek senaryoda en çok ${sinir} olabilir (Ayarlar > Koşu). Senaryonun satır seçimini daraltın (senaryo formu > Satır seçimi) ya da koşuyu tek satırla başlatın.`);
  }
  return kip === 'tek' || kip === 'tumu' ? { [VERI_KIPI_DEGISKENI]: String(kip) } : {};
}

/**
 * Senaryoyu koşucu ile çalıştırır ve (koşu bitene kadar bekleyip) sonucu döner.
 * @param {Veritabani} vt @param {Record<string, unknown>} govde @param {Kosucu | null} kosucu
 * @param {import('./calistirma.d.mts').CalistirmaSecenekleri} [secenekler]
 */
export async function senaryoCalistir(vt, govde, kosucu, secenekler = {}) {
  const h = calistirmaIsteginiHazirla(vt, govde, secenekler);
  if (!kosucu) throw new DepoHatasi('Test çalıştırıcısı bu sunucuda etkin değil.');
  const sonuc = await kosucu.calistir({
    ortam: GENEL_ORTAM_ETIKETI, dosya: h.hedef.dosya, ad: h.hedef.ad, kosuId: h.kosuId,
    kosuTuru: h.kosuTuru, kosuKimligi: h.kosuKimligi, kosuKapsami: h.kosuKapsami, senaryoId: h.hedef.senaryoId,
    etiket: h.hedef.etiket, grepDeseni: h.hedef.grepDeseni, genel: h.hedef.genel,
    ...(Object.keys(h.ekOrtam).length ? { ekOrtam: h.ekOrtam } : {})
  });
  return { httpDurum: sonuc.httpDurum ?? 200, govde: { ...sonuc.govde, senaryoId: h.hedef.senaryoId, baslik: h.hedef.baslik } };
}

/**
 * "Dene": taslak senaryoyu doğrular, geçici deneme senaryosu kurar ve koşucuya verir. Veritabanına hiçbir şey yazılmaz.
 * @param {Veritabani} vt @param {Record<string, unknown>} govde @param {Kosucu | null} kosucu
 */
export async function senaryoDene(vt, govde, kosucu) {
  const projeId = kimlik(govde.projeId, 'projeId');
  const kosuId = kimlik(govde.kosuId, 'kosuId');
  ekranEtkinOlmali(vt, '', kimlik(govde.ekranId, 'ekranId'), { devreDisiIzinli: true });
  const paket = denemePaketiOlustur(vt, {
    projeId, ekranId: kimlik(govde.ekranId, 'ekranId'), ortamId: kimlik(govde.ortamId, 'ortamId'), veri: govde.veri,
    id: typeof govde.id === 'string' && KIMLIK.test(govde.id) ? govde.id : null,
    akisId: typeof govde.akisId === 'string' && KIMLIK.test(govde.akisId) ? govde.akisId : null, mutlakaGorunmeli: govde.mutlakaGorunmeli,
    giris: govde.giris, adimGoruntusu: govde.adimGoruntusu, ...(govde.tabloSecimleri !== undefined ? { tabloSecimleri: govde.tabloSecimleri } : {})
  }, { geciciEk: randomBytes(4).toString('hex') });
  if (!kosucu) throw new DepoHatasi('Test çalıştırıcısı bu sunucuda etkin değil.');
  const sonuc = await kosucu.modelDene({
    ortam: GENEL_ORTAM_ETIKETI, dosya: paket.spec, kosuId, etiket: paket.etiket, grepDeseni: paket.grepDeseni,
    genel: paket.genel, denemeSenaryosu: paket.denemeSenaryosu
  });
  return { httpDurum: sonuc.httpDurum ?? 200, govde: { ...sonuc.govde, uyarilar: paket.uyarilar } };
}
