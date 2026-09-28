// UÇ → İZİN DENETİMİ (sunucu). Bir isteğin (uç yolu + gövde) hangi izinleri gerektirdiğini hesaplar ve denetler. Koşulsuz eşleme
// izin-tanimlari.mjs'deki "islemler[].uclar" listesinden ÜRETİLİR (tek kaynak); koşullu izinler (riskli ortam, giriş tarifi, SQL
// adımı, TLS doğrulaması, bağlantı türü, tercih) burada hesaplanır. Aynı fonksiyonu HTTP uçları (sunucu-platform.mjs), ekran
// taraması (tarama/yonetici.mjs) ve zamanlayıcı (zamanlama/zamanlayici.mjs) kullanır.
//   gerekenIzinler(vt, yol, g) → { izinler: string[]; canliOnayGerekli: boolean }
//   ucDenetle(vt, yol, g)      kapalı izin → IzinHatasi (403); riskli ortam + canliOnay yok → CanliOnayHatasi (409)
//   kapaliIzinler(vt, yol, g)  zamanlayıcı için: kapalı izinlerin anahtarları (işlem atlanır, kayda "izin kapalı: X")
// NOT: import.meta KULLANILMAZ.
import { ortamGetir, senaryoGetir } from '../veritabani/depo.mjs';
import { servisAkisiGetir, servisGetir } from '../servisler/servis-deposu.mjs';
import { baglantiGetir } from '../entegrasyonlar/depo.mjs';
import { etkinGirisTarifi } from '../giris/tarif-deposu.mjs';
import { modelBaglami, senaryoAkisi } from '../senaryolar/senaryo-servisi.mjs';
import { etkinSenaryoGirisi, senaryoGirisi, senaryoGirisiniAyikla } from '../senaryolar/senaryo-girisi.mjs';
import { modeldekiSqlHedefleri } from '../sql/sorgu-bagdastirici.mjs';
import { IZIN_TANIMLARI } from './izin-tanimlari.mjs';
import { riskliOrtamMi } from './ortam-riski.mjs';
import { izinGerekli, izinleriOku } from './izinler.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Govde */

/** Riskli ortamda açık onay (istekte canliOnay: true) yok. */
export class CanliOnayHatasi extends Error {
  /** @param {string} ortamAdi */
  constructor(ortamAdi) {
    super(`"${ortamAdi}" canlı / riskli bir ortam: bu çalıştırma için açık onay gerekir (koşu penceresinde onaylayın; komut satırında --canli-onay).`);
    this.name = 'CanliOnayHatasi';
    this.kod = /** @type {const} */ ('CANLI_ONAY_GEREKLI');
  }
}

/** Koşulsuz uç → izin eşlemesi (izin tanımlarından). @type {Map<string, string[]>} */
const KOSULSUZ = new Map();
/** Koşullu listelenen uçlar (izin başına; koşul burada hesaplanır). @type {Map<string, Set<string>>} */
const KOSULLU = new Map();
for (const t of IZIN_TANIMLARI) {
  for (const i of t.islemler) {
    for (const uc of i.uclar) {
      if (i.kosul) {
        if (!KOSULLU.has(t.anahtar)) KOSULLU.set(t.anahtar, new Set());
        /** @type {Set<string>} */ (KOSULLU.get(t.anahtar)).add(uc);
      } else {
        KOSULSUZ.set(uc, [...new Set([...(KOSULSUZ.get(uc) ?? []), t.anahtar])]);
      }
    }
  }
}
/** @param {string} anahtar @param {string} yol */
const kosulluMu = (anahtar, yol) => Boolean(KOSULLU.get(anahtar)?.has(yol));

/** Denetlenen tüm uçlar (izin → uç tablosu, testler). */
export function denetlenenUclar() {
  return new Set([...KOSULSUZ.keys(), ...[...KOSULLU.values()].flatMap((s) => [...s])]);
}

/** @param {unknown} d */
const metin = (d) => (typeof d === 'string' ? d : '');
/** @param {() => any} fn */
const guvenli = (fn) => { try { return fn(); } catch { return undefined; } };

/** @param {Veritabani} vt @param {Govde} g */
function ortamBul(vt, g) {
  const id = metin(g.ortamId);
  if (!id) return undefined;
  const o = guvenli(() => ortamGetir(vt, id));
  if (!o || (g.projeId && o.projeId !== g.projeId)) return undefined;
  return o;
}

/**
 * Ekran senaryosunun (kayıtlı ya da Dene taslağı) modeli ve giriş seçimi.
 * @param {Veritabani} vt @param {string} yol @param {Govde} g
 */
function ekranSenaryosu(vt, yol, g) {
  if (yol === '/platform/senaryo/dene') {
    const ekranId = metin(g.ekranId);
    const akisId = metin(g.akisId) || null;
    return { mb: ekranId ? guvenli(() => modelBaglami(vt, ekranId, akisId)) : null, giris: senaryoGirisiniAyikla(g.giris).giris };
  }
  const s = guvenli(() => senaryoGetir(vt, metin(g.senaryoId)));
  if (!s || !s.ekranId) return { mb: null, giris: null };
  return { mb: guvenli(() => modelBaglami(vt, s.ekranId, senaryoAkisi(s.icerik))), giris: senaryoGirisi(s.icerik) };
}

/** Modelde "Yeniden giriş" adımı var mı? @param {unknown} model */
function yenidenGirisVar(model) {
  const adimlar = model && typeof model === 'object' && Array.isArray(/** @type {any} */ (model).adimlar) ? /** @type {any} */ (model).adimlar : [];
  return adimlar.some((/** @type {any} */ a) => a && typeof a === 'object' && a.yenidenGiris);
}

/**
 * Servis akışının (kayıtlı ya da taslak) adımları.
 * @param {Veritabani} vt @param {Govde} g @returns {any[]}
 */
function akisAdimlari(vt, g) {
  const taslak = g.icerik && typeof g.icerik === 'object' && Array.isArray(g.icerik.adimlar) ? g.icerik.adimlar : null;
  if (taslak) return taslak;
  const a = metin(g.akisId) ? guvenli(() => servisAkisiGetir(vt, metin(g.akisId))) : undefined;
  return a && a.projeId === g.projeId ? a.icerik.adimlar : [];
}

/**
 * Servisin (ya da akıştaki adımların servislerinin, oturum akışları dahil) TLS doğrulaması kapalı mı?
 * @param {Veritabani} vt @param {string[]} servisIdleri @param {Set<string>} [gorulen]
 */
function tlsKapaliServisVar(vt, servisIdleri, gorulen = new Set()) {
  for (const id of servisIdleri) {
    if (!id || gorulen.has(id)) continue;
    gorulen.add(id);
    const s = guvenli(() => servisGetir(vt, id));
    if (!s) continue;
    if (s.ayarlar?.tlsDogrulama === false) return true;
    const oturum = s.ayarlar?.oturumAkisi ? guvenli(() => servisAkisiGetir(vt, s.ayarlar.oturumAkisi)) : undefined;
    if (oturum && tlsKapaliServisVar(vt, oturum.icerik.adimlar.filter((/** @type {any} */ x) => x.tur !== 'sql').map((/** @type {any} */ x) => String(x.servisId ?? '')), gorulen)) return true;
  }
  return false;
}

/** Uçtan uca akışın koşu ucu (akislar/uctan-uca.mjs). */
export const UCTAN_UCA_KOS_UCU = '/platform/uctan-uca/kos';

/**
 * Bir akış adımının gerektirdiği izinler (riskli ortam izni hariç: o, ortama bağlıdır). Uçtan uca akışta koşu ucunda TOPLU,
 * koşu sırasında ADIM BAŞINA denetlenir. Ekran adımı: web erişimi; ortamın giriş tarifi varsa ve senaryo girişsiz değilse giriş
 * bilgisi; modelde SQL adımı varsa veritabanı okuma. SQL adımı: veritabanı okuma. Servis adımı: servis istekleri (TLS doğrulaması
 * kapalıysa güvenlik gevşetme).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {any} a @returns {string[]}
 */
export function adimIzinleri(vt, projeId, ortamId, a) {
  if (!a || typeof a !== 'object') return [];
  if (a.tur === 'sql') return ['veritabani-okuma'];
  if (a.tur === 'ekran') {
    const izinler = ['web-erisimi'];
    const s = guvenli(() => senaryoGetir(vt, metin(a.senaryoId)));
    const mb = s && s.ekranId ? guvenli(() => modelBaglami(vt, s.ekranId, senaryoAkisi(s.icerik))) : null;
    const tarif = projeId && ortamId ? guvenli(() => etkinGirisTarifi(vt, projeId, ortamId).tarif) : null;
    if (tarif && (etkinSenaryoGirisi(s ? senaryoGirisi(s.icerik) : null, mb?.model).kip !== 'girissiz' || yenidenGirisVar(mb?.model))) izinler.push('giris-bilgisi');
    if (mb) {
      const h = modeldekiSqlHedefleri([mb.model, mb.altModeller]);
      if (h.baglantiIdleri.size || h.veritabaniIdleri.size) izinler.push('veritabani-okuma');
    }
    return izinler;
  }
  return tlsKapaliServisVar(vt, [String(a.servisId ?? '')]) ? ['servis-istekleri', 'guvenlik-gevsetme'] : ['servis-istekleri'];
}

/**
 * İsteğin gerektirdiği izinler (açık / kapalı fark etmeksizin) ve açık canlı onayı gerekip gerekmediği.
 * @param {Veritabani} vt @param {string} yol @param {Govde} g
 * @returns {{ izinler: string[]; canliOnayGerekli: boolean; ortamAdi: string | null }}
 */
export function gerekenIzinler(vt, yol, g) {
  /** @type {Set<string>} */
  const izinler = new Set(KOSULSUZ.get(yol) ?? []);
  let canliOnayGerekli = false;
  let ortamAdi = null;

  // Canlı / riskli ortam (tek tanım: ortam-riski.mjs).
  if (kosulluMu('canli-ortam', yol)) {
    const o = ortamBul(vt, g);
    if (o && riskliOrtamMi(o)) { izinler.add('canli-ortam'); canliOnayGerekli = true; ortamAdi = o.ad; }
  }

  // Ekran koşusu / Dene: giriş bilgisi (tarif + girişli senaryo), SQL adımı.
  if (yol === '/platform/senaryolar/calistir' || yol === '/platform/senaryo/dene') {
    const { mb, giris } = ekranSenaryosu(vt, yol, g);
    const projeId = metin(g.projeId);
    const ortamId = metin(g.ortamId);
    const tarif = projeId && ortamId ? guvenli(() => etkinGirisTarifi(vt, projeId, ortamId).tarif) : null;
    if (tarif && (etkinSenaryoGirisi(giris, mb?.model).kip !== 'girissiz' || yenidenGirisVar(mb?.model))) izinler.add('giris-bilgisi');
    if (mb) {
      const h = modeldekiSqlHedefleri([mb.model, mb.altModeller]);
      if (h.baglantiIdleri.size || h.veritabaniIdleri.size) izinler.add('veritabani-okuma');
    }
  }

  // Tarama / akış kaydı: giriş tarifi varsa ve "Giriş yapmadan aç" değilse (giriş kaydında kullanıcı kendisi girer).
  // Tarama / akış kaydı: giriş tarifi varsa giriş bilgisi izni — "Koşunun saklanan oturumunu kullan" seçiliyken de (oturumla
  // girişi atlamak da giriş sayılır; oturum geçersizse zaten form doldurulur).
  if (yol === '/platform/tarama/baslat' && g.kip !== 'girisKaydi' && g.girissiz !== true) {
    const projeId = metin(g.projeId);
    const ortamId = metin(g.ortamId);
    if (projeId && ortamId && guvenli(() => etkinGirisTarifi(vt, projeId, ortamId).tarif)) izinler.add('giris-bilgisi');
  }

  // Entegrasyon denemesi: veritabanı bağlantısı → okuma; diğerleri (webhook, iş takip) → dış gönderim.
  if (yol === '/platform/entegrasyon/dene') {
    const b = metin(g.id) ? guvenli(() => baglantiGetir(vt, metin(g.id), metin(g.projeId) || undefined)) : undefined;
    const tur = b ? b.tur : metin(g.tur);
    izinler.add(tur === 'veritabani' ? 'veritabani-okuma' : 'dis-gonderim');
  }

  // "Yalnız okuma"yı kapatmak (bağlantı kaydı): önceden açıksa (ya da yeni bağlantıysa).
  if (yol === '/platform/entegrasyon/kaydet' && g.alanlar && typeof g.alanlar === 'object' && g.alanlar.yalnizOkuma === false) {
    const b = metin(g.id) ? guvenli(() => baglantiGetir(vt, metin(g.id), metin(g.projeId) || undefined)) : undefined;
    const tur = b ? b.tur : metin(g.tur);
    if (tur === 'veritabani' && b?.alanlar?.yalnizOkuma !== false) izinler.add('veritabani-yazma');
  }

  // Zamanlanmış koşu tercihleri (yalnız AÇARKEN; kapatmak serbest).
  if (yol === '/platform/zamanlama/tercih' && g.acik === true) {
    if (g.ad === 'kilitliyken') izinler.add('arka-plan');
    if (g.ad === 'dpapi' || g.ad === 'oturumAcilisi') izinler.add('sistem-degisikligi');
  }

  // Servis akışları: SQL adımı → veritabanı okuma.
  if (yol === '/platform/servis-akisi/dene' || yol === '/platform/servis-akisi/kos') {
    if (akisAdimlari(vt, g).some((a) => a && a.tur === 'sql')) izinler.add('veritabani-okuma');
  }

  // Uçtan uca akış: adımların izinlerinin birleşimi (ekran / servis / SQL; bkz. adimIzinleri). Riskli ortam yukarıda.
  if (yol === UCTAN_UCA_KOS_UCU) {
    for (const a of akisAdimlari(vt, g)) for (const x of adimIzinleri(vt, metin(g.projeId), metin(g.ortamId), a)) izinler.add(x);
  }

  // TLS doğrulamasını kapatmak (kayıt) ve doğrulaması kapalı istek.
  if (kosulluMu('guvenlik-gevsetme', yol)) {
    let gevsek = false;
    if (yol === '/platform/servis/kaydet' || yol === '/platform/servis/rest/kaydet') {
      const mevcut = metin(g.id) ? guvenli(() => servisGetir(vt, metin(g.id))) : undefined;
      gevsek = g.tlsDogrulama === false && mevcut?.ayarlar?.tlsDogrulama !== false;
    } else if (yol === '/platform/servis/erisim' || yol === '/platform/servis/rest/dene') {
      gevsek = g.tlsDogrulama === false;
    } else if (yol === '/platform/servis-akisi/dene' || yol === '/platform/servis-akisi/kos') {
      gevsek = tlsKapaliServisVar(vt, akisAdimlari(vt, g).filter((a) => a && a.tur !== 'sql').map((a) => String(a.servisId ?? '')));
    } else {
      gevsek = tlsKapaliServisVar(vt, [metin(g.servisId)]);
    }
    if (gevsek) izinler.add('guvenlik-gevsetme');
  }

  return { izinler: [...izinler], canliOnayGerekli, ortamAdi };
}

/**
 * HTTP uçlarının denetimi: kapalı izin → IzinHatasi (işlem YAPILMAZ); riskli ortamda canliOnay: true yoksa CanliOnayHatasi.
 * @param {Veritabani} vt @param {string} yol @param {Govde} g
 */
export function ucDenetle(vt, yol, g) {
  const r = gerekenIzinler(vt, yol, g);
  for (const a of r.izinler) izinGerekli(vt, a, yol);
  if (r.canliOnayGerekli && g.canliOnay !== true) throw new CanliOnayHatasi(r.ortamAdi ?? '');
}

/**
 * Zamanlayıcı / otomatik işlemler için: gereken izinlerden KAPALI olanlar (boşsa işlem yapılabilir).
 * @param {Veritabani} vt @param {string} yol @param {Govde} g @returns {string[]}
 */
export function kapaliIzinler(vt, yol, g) {
  const durum = izinleriOku(vt);
  return gerekenIzinler(vt, yol, g).izinler.filter((a) => durum[a] !== true);
}
