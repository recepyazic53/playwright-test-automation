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

const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const KOSU_KIMLIGI = /^[A-Za-z0-9-]{1,64}$/;

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !KIMLIK.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * Çalıştırma gövdesini doğrular ve senaryoyu çözer (hiçbir şey başlatmaz).
 *  - kosuId: bu tekil koşu isteğinin kimliği (durdurma / canlı görüntü bununla yapılır) — zorunlu.
 *  - kosuTuru 'tam' | 'tekil' (isteğe bağlı): birlikte başlatılan senaryolar ortak kosuKimligi taşır.
 *  - kosuKapsami yalnızca 'tam' koşuda: 'Genel' ya da projedeki bir ekranın adı.
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
    ortam: h.hedef.ortamAnahtari, dosya: h.hedef.dosya, ad: h.hedef.ad, kosuId: h.kosuId,
    kosuTuru: h.kosuTuru, kosuKimligi: h.kosuKimligi, kosuKapsami: h.kosuKapsami, senaryoId: h.hedef.senaryoId,
    ...(h.hedef.model ? { etiket: h.hedef.etiket, grepDeseni: h.hedef.grepDeseni } : {})
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
  const paket = denemePaketiOlustur(vt, {
    projeId, ekranId: kimlik(govde.ekranId, 'ekranId'), ortamId: kimlik(govde.ortamId, 'ortamId'), veri: govde.veri,
    id: typeof govde.id === 'string' && KIMLIK.test(govde.id) ? govde.id : null
  }, { adaptor, geciciEk: randomBytes(4).toString('hex') });
  if (!kosucu) throw new DepoHatasi('Test çalıştırıcısı bu sunucuda etkin değil.');
  const sonuc = await kosucu.dene({ ortam: paket.ortamAnahtari, dosya: paket.spec, ad: paket.geciciBaslik, kosuId, ekVeri: paket.ekVeri });
  return { httpDurum: sonuc.httpDurum ?? 200, govde: { ...sonuc.govde, uyarilar: paket.uyarilar } };
}
