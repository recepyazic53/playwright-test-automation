// ORTAM BAĞLANTISI DENETİMİ ("Hazırlık kontrolü" > Ortam bağlantısı > Denetle). KENDİLİĞİNDEN İSTEK ATILMAZ: yalnız kullanıcı
// "Denetle"ye basınca (POST /platform/ortam/denetle) seçili ortamın adresine TEK bir GET gider. İzinler uçta denetlenir
// (guvenlik/uc-denetimi.mjs): ekran senaryosunda "Web uygulamasına erişim", servis senaryosunda "Servis istekleri"; ortam Canlıysa
// "Canlı ortamda çalıştırma" izni ve istekte açık onay (canliOnay: true). Yasak adres kalıbına uyan adrese istek gönderilmez.
//  - Ekran senaryosu: ortamın giriş tarifi ve bu ortam + giriş profili için koşunun SAKLANAN oturumu varsa (ve "Giriş bilgisi kullanımı"
//    izni açıksa) istek tarifin oturum kontrol adresine, oturumun YALNIZ o adrese uyan çerezleriyle gider: 2xx → oturum geçerli,
//    yönlendirme / 401 / 403 → geçersiz (koşu yeniden giriş yapar). Oturum yoksa ya da izin kapalıysa istek taban adrese çerezsiz gider.
//  - Servis senaryosu: servisin bu ortamdaki adresine (taban + yol) çerezsiz GET; yanıt kodu ne olursa olsun erişildi sayılır.
// Sonuç (süre, durum kodu, oturum) sunucu belleğinde 10 dk saklanır (GET /platform/ortam/denetim yeniden istek atmadan okur); diske
// yazılmaz. Yanıt gövdesi saklanmaz ve döndürülmez.
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ortamGetir, ortamVarsayilanGirisProfiliId } from '../veritabani/depo.mjs';
import { acikAnahtar } from '../kasa.mjs';
import { izinleriOku } from '../guvenlik/izinler.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { etkinGirisTarifi } from '../giris/tarif-deposu.mjs';
import { girisKokenleri } from '../giris/tarif.mjs';
import { oturumAnahtariTuret, oturumDosyaYolu, oturumDosyasiniOku, oturumuKokenlereSinirla } from '../giris/oturum-dosyasi.mjs';
import { httpIstegi } from '../servisler/soap-istemcisi.mjs';
import { servisGetir } from '../servisler/servis-deposu.mjs';
import { servisAdresi } from '../servisler/servis-islemleri.mjs';
import { ORTAM_DENETIMI_GECERLILIK_MS } from './hazirlik.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ ortamId: string; servisId: string | null; host: string; erisilebilir: boolean; durumKodu: number | null; sureMs: number;
 *   oturum: 'gecerli' | 'gecersiz' | 'yok' | 'izinsiz' | null; mesaj: string | null; zaman: number }} OrtamDenetimi
 */

/** Denetim ucu (izin tanımları ve sunucu). */
export const ORTAM_DENETIM_UCU = '/platform/ortam/denetle';
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const ZAMAN_ASIMI_MS = 15_000;

/** @type {Map<string, OrtamDenetimi>} */
const sonuclar = new Map();

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !KIMLIK.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {string} projeId @param {string} ortamId @param {string | null} servisId */
const anahtar = (projeId, ortamId, servisId) => `${projeId}\u0000${ortamId}\u0000${servisId ?? ''}`;

/**
 * Saklanan son denetim (10 dk; süresi geçen silinir). İstek atmaz.
 * @param {string} projeId @param {string} ortamId @param {string | null} [servisId] @param {number} [simdi] @returns {OrtamDenetimi | null}
 */
export function ortamDenetimSonucu(projeId, ortamId, servisId = null, simdi = Date.now()) {
  for (const [k, v] of sonuclar) if (simdi - v.zaman > ORTAM_DENETIMI_GECERLILIK_MS) sonuclar.delete(k);
  return sonuclar.get(anahtar(projeId, ortamId, servisId)) ?? null;
}

/** Testler için: saklanan sonuçları siler. */
export function ortamDenetimleriniSil() { sonuclar.clear(); }

/** Çerez alanı bu host'a uyar mı (RFC 6265 alan eşleşmesi). @param {string} alan @param {string} host */
function alanUyar(alan, host) {
  const a = String(alan).replace(/^\./, '').toLowerCase();
  const h = host.toLowerCase();
  return Boolean(a) && (h === a || h.endsWith(`.${a}`));
}

/**
 * Saklanan oturumun hedef adrese gidecek çerezleri ("ad=değer; …"): alan, yol, secure ve süresi uyanlar. Değerler yalnız bu istekte.
 * @param {{ cookies: Array<Record<string, unknown>> }} durum @param {URL} hedef
 */
function cerezBasligi(durum, hedef) {
  const simdiSn = Date.now() / 1000;
  return durum.cookies.filter((c) => typeof c.name === 'string' && typeof c.value === 'string'
    && alanUyar(String(c.domain ?? ''), hedef.hostname)
    && hedef.pathname.startsWith(String(c.path || '/'))
    && (!c.secure || hedef.protocol === 'https:')
    && (typeof c.expires !== 'number' || c.expires <= 0 || c.expires > simdiSn))
    .map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Ekran ortamında istek hedefi ve (varsa) saklanan oturumun çerezleri.
 * @param {Veritabani} vt @param {string} projeId @param {{ id: string; tabanUrl: string }} ortam
 * @returns {{ adres: string; cerez: string; oturum: OrtamDenetimi['oturum'] }}
 */
function ekranHedefi(vt, projeId, ortam) {
  const tarif = (() => { try { return etkinGirisTarifi(vt, projeId, ortam.id).tarif; } catch { return null; } })();
  if (!tarif) return { adres: ortam.tabanUrl, cerez: '', oturum: null };
  if (izinleriOku(vt)['giris-bilgisi'] !== true) return { adres: ortam.tabanUrl, cerez: '', oturum: 'izinsiz' };
  const profilId = ortamVarsayilanGirisProfiliId(vt, projeId, ortam.id);
  let a = null;
  try { a = oturumAnahtariTuret(acikAnahtar(vt)); } catch { a = null; }
  try {
    const durum = profilId && a && vt.yol ? oturumDosyasiniOku(oturumDosyaYolu(vt.yol, ortam.id, profilId), a) : undefined;
    const sinirli = durum ? oturumuKokenlereSinirla(durum, girisKokenleri(ortam.tabanUrl, tarif)) : null;
    if (!sinirli || !sinirli.cookies.length) return { adres: ortam.tabanUrl, cerez: '', oturum: 'yok' };
    const t = /** @type {{ oturumKontrolAdresi?: string; girisAdresi?: string }} */ (tarif);
    const hedef = new URL(String(t.oturumKontrolAdresi || '').trim() || String(t.girisAdresi || '').trim() || '/', ortam.tabanUrl);
    const cerez = cerezBasligi(sinirli, hedef);
    return cerez ? { adres: hedef.toString(), cerez, oturum: 'gecerli' } : { adres: ortam.tabanUrl, cerez: '', oturum: 'yok' };
  } finally {
    a?.fill(0);
  }
}

/**
 * "Denetle": seçili ortamın adresine TEK GET (izinler ve CANLI onayı uçta denetlendi). Sonuç 10 dk saklanır.
 * @param {Veritabani} vt @param {{ projeId: unknown; ortamId: unknown; servisId?: unknown }} g
 * @param {{ istek?: typeof httpIstegi }} [s] istek: testlerde değiştirilebilir (varsayılan httpIstegi)
 * @returns {Promise<OrtamDenetimi>}
 */
export async function ortamBaglantisiniDenetle(vt, g, s = {}) {
  const projeId = kimlik(g.projeId, 'projeId');
  const ortamId = kimlik(g.ortamId, 'ortamId');
  const servisId = g.servisId === undefined || g.servisId === null || g.servisId === '' ? null : kimlik(g.servisId, 'servisId');
  const ortam = ortamGetir(vt, ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  /** @type {{ adres: string; cerez: string; oturum: OrtamDenetimi['oturum'] }} */
  let hedef;
  /** @type {boolean | undefined} */
  let tls;
  if (servisId) {
    const sv = servisGetir(vt, servisId);
    if (!sv || sv.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
    hedef = { adres: servisAdresi(sv.ayarlar, ortam), cerez: '', oturum: null };
    tls = sv.ayarlar.tlsDogrulama === false ? false : undefined;
  } else {
    hedef = ekranHedefi(vt, projeId, ortam);
  }
  let host = '?';
  try { host = new URL(hedef.adres).host; } catch { /* geçersiz adres: istek hata verir */ }
  const bas = Date.now();
  /** @type {OrtamDenetimi} */
  let sonuc;
  try {
    const y = await (s.istek ?? httpIstegi)({
      adres: hedef.adres, yontem: 'GET', zamanAsimiMs: ZAMAN_ASIMI_MS, yasakDesenleri: etkinYasakDesenleri(vt),
      basliklar: hedef.cerez ? { Cookie: hedef.cerez } : {}, ...(tls === false ? { tlsDogrulama: false } : {})
    });
    const kod = y.durumKodu;
    const oturum = hedef.oturum === 'gecerli' ? (kod >= 200 && kod < 300 ? 'gecerli' : kod >= 300 && kod < 500 ? 'gecersiz' : null) : hedef.oturum;
    sonuc = { ortamId, servisId, host, erisilebilir: true, durumKodu: kod, sureMs: y.sureMs ?? Date.now() - bas, oturum, mesaj: null, zaman: Date.now() };
  } catch (e) {
    sonuc = { ortamId, servisId, host, erisilebilir: false, durumKodu: null, sureMs: Date.now() - bas, oturum: null, mesaj: String(/** @type {Error} */ (e)?.message ?? e), zaman: Date.now() };
  }
  sonuclar.set(anahtar(projeId, ortamId, servisId), sonuc);
  return sonuc;
}
