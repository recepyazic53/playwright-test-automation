// SENARYO ÇALIŞTIRMA (genel) — POST /platform/senaryolar/calistir ve /platform/senaryo/dene'nin
// doğrulama + çözümleme katmanı. Senaryo KİMLİĞİ (UUID) gelir; sunucu bunu veritabanından güncel
// Playwright dosyası + test başlığına ve ortamın çalıştırıcı anahtarına çözer (senaryo-servisi.mjs >
// calistirmaHedefiCoz), ardından enjekte edilen "koşucu" ile mevcut çalıştırma altyapısını kullanır
// (scripts/test-sunucu.mjs: --list beyaz listesi, dosya sırası, canlı görüntü, durdurma, platform
// raporlayıcısı). İstemciden gelen başlık/dosya ASLA kullanılmaz.
// Birim testleri sahte bir koşucu verir; gerçek koşu başlatmaz.
// NOT: import.meta KULLANILMAZ. Tipler: calistirma.d.mts.

import { randomBytes } from 'node:crypto';
import { DepoHatasi, ekranlariListele } from '../veritabani/depo.mjs';
import { calistirmaHedefiCoz, denemePaketiOlustur } from './senaryo-servisi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./calistirma.d.mts').Kosucu} Kosucu */

/**
 * Genel yol koşularında (elle oluşturulan proje/ortam) "ortam" alanının değeri: yalnızca loglarda ve koşu
 * kuyruğunda görünür. Ortamın ADI kullanılmaz — ad şifreli saklanır ve sunucu logu düz metindir.
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
 * secenekler: kodDosyasiVar (model senaryosu tespiti), yasakDesenleri (yasaklı adres koruması).
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
  return { projeId, kosuId, kosuTuru, kosuKimligi, kosuKapsami, hedef };
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
    ortam: h.hedef.ortamAnahtari ?? GENEL_ORTAM_ETIKETI, dosya: h.hedef.dosya, ad: h.hedef.ad, kosuId: h.kosuId,
    kosuTuru: h.kosuTuru, kosuKimligi: h.kosuKimligi, kosuKapsami: h.kosuKapsami, senaryoId: h.hedef.senaryoId,
    ...(h.hedef.model ? { etiket: h.hedef.etiket, grepDeseni: h.hedef.grepDeseni } : {}),
    ...(h.hedef.genel ? { genel: h.hedef.genel } : {})
  });
  return { httpDurum: sonuc.httpDurum ?? 200, govde: { ...sonuc.govde, senaryoId: h.hedef.senaryoId, baslik: h.hedef.baslik } };
}

/**
 * "Dene": taslak senaryoyu doğrular, geçici başlıklı ek veri paketi kurar ve koşucuya verir.
 * Veritabanına hiçbir şey yazılmaz.
 * @param {Veritabani} vt @param {Record<string, unknown>} govde
 * @param {Kosucu | null} kosucu @param {import('../../../projeler/index.d.mts').AktarimAdaptoru | null} adaptor
 */
export async function senaryoDene(vt, govde, kosucu, adaptor) {
  const projeId = kimlik(govde.projeId, 'projeId');
  const kosuId = kimlik(govde.kosuId, 'kosuId');
  ekranEtkinOlmali(vt, '', kimlik(govde.ekranId, 'ekranId'), { devreDisiIzinli: true });
  const paket = denemePaketiOlustur(vt, {
    projeId, ekranId: kimlik(govde.ekranId, 'ekranId'), ortamId: kimlik(govde.ortamId, 'ortamId'), veri: govde.veri,
    id: typeof govde.id === 'string' && KIMLIK.test(govde.id) ? govde.id : null,
    akisId: typeof govde.akisId === 'string' && KIMLIK.test(govde.akisId) ? govde.akisId : null, mutlakaGorunmeli: govde.mutlakaGorunmeli
  }, { adaptor, geciciEk: randomBytes(4).toString('hex') });
  if (!kosucu) throw new DepoHatasi('Test çalıştırıcısı bu sunucuda etkin değil.');
  if ('model' in paket && paket.model) {
    // Model senaryosu: geçici deneme senaryosu model spec'inde etiketle üretilir (veritabanına senaryo yazılmaz).
    if (!kosucu.modelDene) throw new DepoHatasi('Bu sunucuda model senaryosu denemesi desteklenmiyor.');
    const sonuc = await kosucu.modelDene({
      ortam: paket.ortamAnahtari ?? GENEL_ORTAM_ETIKETI, dosya: paket.spec, kosuId, etiket: paket.etiket, grepDeseni: paket.grepDeseni,
      genel: paket.genel, denemeSenaryosu: paket.denemeSenaryosu
    });
    return { httpDurum: sonuc.httpDurum ?? 200, govde: { ...sonuc.govde, uyarilar: paket.uyarilar } };
  }
  const sonuc = await kosucu.dene({ ortam: paket.ortamAnahtari, dosya: paket.spec, ad: paket.geciciBaslik, kosuId, ekVeri: paket.ekVeri });
  return { httpDurum: sonuc.httpDurum ?? 200, govde: { ...sonuc.govde, uyarilar: paket.uyarilar } };
}
