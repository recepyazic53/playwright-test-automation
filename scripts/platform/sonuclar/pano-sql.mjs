// ÖZET PANOSU — SQL KARTI (sunucu). Kart, Nöbetçi'de tanımlı bir veritabanı bağlantısında (Ayarlar > Entegrasyonlar > Veritabanı
// bağlantısı; ya da mantıksal veritabanı + ortam: SQL adımıyla aynı çözüm — sql/sorgu-bagdastirici.mjs > sqlHedefi) kaydedilmiş
// sorgusunu YALNIZ kullanıcı "Yenile"ye basınca çalıştırır (POST /platform/pano/sql/yenile). Sayfa açılınca, aralıklı ya da
// arka planda çalışmaz; son sonuç ve alındığı saat kasada önbellekte durur (ozet-panosu.mjs).
// GÜVENLİK:
//   - Yalnız okuma: tek ifade, SELECT ya da WITH … SELECT (sürücü katmanının yalnizOkumaDenetle kuralı; DML / DDL / EXEC / çoklu ifade
//     reddedilir). Bağlantının "Yalnız okuma" seçimi KAPALI olsa da pano sorgusu salt okunur çalışır: oturum read-only açılır
//     (PostgreSQL / MySQL: SET SESSION … READ ONLY; Oracle: SET TRANSACTION READ ONLY + geri alma; SQL Server: kural denetimi).
//   - Sorgu metni istemciden ALINMAZ: yalnız kaydedilmiş kartın sorgusu çalışır.
//   - Zaman aşımı: kartın "Zaman aşımı (sn)" ayarı (1–120; ayarı olmayan kartta PANO_SQL_ZAMAN_ASIMI_MS = 15 sn) ve satır sınırı
//     (PANO_SQL_SATIR_SINIRI; aşılırsa "kesildi").
//   - İzinler: "Veritabanı okuma" (uç denetimi + burada yeniden); CANLI ortama ait bağlantıda istek canliOnay: true ister
//     (guvenlik/uc-denetimi.mjs; arayüz ilk Yenile'de standart CANLI penceresini açar).
//   - Maskeleme: adı gizli sayılan sütunlar (Ayarlar > Güvenlik > Maskeleme listesi + kişisel veri adları: T.C. kimlik, kart, IBAN,
//     vergi no, pasaport, parola…) tümüyle maskelenir; diğer hücrelerde bilinen gizli değerler, geçerli T.C. kimlik no ve IBAN
//     maskelenir. Önbelleğe yalnız maskeli sonuç yazılır.
//   - Hata iletisi anlaşılırdır ve bağlantı adresini, kullanıcı adını, parolayı içermez.
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { baglantiGetir } from '../entegrasyonlar/depo.mjs';
import { veritabaniAyari } from '../entegrasyonlar/katalog.mjs';
import { veritabaniSorgusu, yalnizOkumaDenetle } from '../entegrasyonlar/veritabani-suruculeri.mjs';
import { sqlHedefi } from '../sql/sorgu-bagdastirici.mjs';
import { tumVeritabanlari } from '../sql/veritabanlari.mjs';
import { izinGerekli } from '../guvenlik/izinler.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { baslikNormal } from '../tablolar/tablo-benzerligi.mjs';
import { adMaskeleyici, bilinenGizliDegerler } from './html-rapor.mjs';
import { tcKimlikNoGecerliMi } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { panoGetir, sqlSonucuYaz } from './ozet-panosu.mjs';
import { SQL_ZAMAN_ASIMI_SN, VARSAYILAN_DONEM, donemAraligi, donemTemizle, etkinHedef, kartParametreleri, sorguParametreAdlari, sqlDonemParametreleri, sqlZamanAsimiTemizle } from './pano-duzeni.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ zaman: string; sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean; gizliSutunlar: string[]; satirSiniri: number; parametreler?: Record<string, string> }} PanoSqlSonucu */

export const PANO_SQL_UCU = '/platform/pano/sql/yenile';
export const PANO_INCELE_UCU = '/platform/pano/sql/incele';
export const PANO_SQL_ZAMAN_ASIMI_MS = SQL_ZAMAN_ASIMI_SN.varsayilan * 1000;
export const PANO_SQL_EN_COK_ZAMAN_ASIMI_MS = SQL_ZAMAN_ASIMI_SN.enCok * 1000;
export const PANO_SQL_SATIR_SINIRI = 500;
export const MASKE = '•••';

/** Kişisel / gizli veri taşıyan sütun adları (normal ad üzerinde; gizliAdMi listesine ek). */
const KISISEL_SUTUN = /(tckimlik|kimlikno|kimliknumara|tckn|^tcno|^tc$|^tc[_-]?no|nationalid|identityno|vergino|vergikimlik|^vkn|pasaport|passport|kartno|kartnumara|cardnumber|cardno|creditcard|^kart$|cvv|cvc|cv2|guvenlikkod|securitycode|iban|parola|sifre|password|passwd)/;

/** Sütun adı gizli mi (çekirdek + kullanıcının ek adları + kişisel veri adları)? @param {string} ad @param {ReadonlyArray<string>} ekler */
export function gizliSutunMu(ad, ekler) {
  return gizliAdMi(ad, ekler) || KISISEL_SUTUN.test(baslikNormal(ad));
}

/** Hücre değerinde kişisel veri kalıbı (geçerli T.C. kimlik no, IBAN) maskelenir. @param {string} m */
function kaliplariMaskele(m) {
  return m.replace(/(?<!\d)[1-9]\d{10}(?!\d)/g, (x) => (tcKimlikNoGecerliMi(x) ? MASKE : x))
    .replace(/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, MASKE);
}

/**
 * Sonucu maskeler: gizli sütunların tüm değerleri, diğer metin hücrelerinde bilinen gizli değerler ve kişisel veri kalıpları.
 * @param {{ sutunlar: string[]; satirlar: unknown[][] }} r @param {{ ekler: ReadonlyArray<string>; gizliDegerler: ReadonlyArray<string> }} m
 */
export function sonucuMaskele(r, m) {
  const gizli = r.sutunlar.map((s) => gizliSutunMu(String(s), m.ekler));
  const ad = adMaskeleyici([...m.gizliDegerler]);
  const satirlar = r.satirlar.map((satir) => satir.map((v, i) => {
    if (v === null || v === undefined) return null;
    if (gizli[i]) return MASKE;
    if (typeof v === 'string') return kaliplariMaskele(ad(v));
    if (typeof v === 'number' && Number.isInteger(v) && v > 9_999_999_999) return kaliplariMaskele(String(v)) === MASKE ? MASKE : v;
    return v;
  }));
  return { sutunlar: r.sutunlar.map(String), satirlar, gizliSutunlar: r.sutunlar.filter((_, i) => gizli[i]).map(String) };
}

/**
 * Hata iletisini kullanıcıya uygun hâle getirir: adres, kullanıcı adı, parola ve veritabanı adı çıkarılır; bağlantı / giriş /
 * zaman aşımı hataları sabit, anlaşılır cümleye çevrilir.
 * @param {unknown} hata @param {{ sunucu?: string; kullanici?: string; parola?: string; veritabani?: string; port?: number | null }} ayar
 * @param {number} zamanAsimiMs
 */
export function hataIletisi(hata, ayar, zamanAsimiMs) {
  const h = /** @type {{ message?: string; code?: string }} */ (hata ?? {});
  let m = String(h.message ?? hata ?? 'bilinmeyen hata').replace(/\s+/g, ' ').trim();
  if (h.code === 'PANO_ZAMAN_ASIMI' || /time ?out|zaman aşımı|timed out|canceling statement/i.test(m)) {
    return `Sorgu ${Math.round(zamanAsimiMs / 1000)} sn içinde bitmedi (zaman aşımı). Sorguyu daraltın (WHERE, TOP / LIMIT) ya da veritabanı yöneticinize danışın.`;
  }
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET|getaddrinfo|connect|bağlan/i.test(m) && !/yasak/i.test(m)) {
    return 'Veritabanına bağlanılamadı: sunucu kapalı ya da bu bilgisayardan erişilemiyor. Bağlantıyı Ayarlar > Entegrasyonlar\'da "Bağlantıyı dene" ile sınayın.';
  }
  if (/password|login failed|authentication|access denied|ORA-01017|28P01|ER_ACCESS_DENIED|parola/i.test(m)) {
    return 'Veritabanı girişi reddedildi (kullanıcı adı ya da parola). Bağlantının ayarlarını Ayarlar > Entegrasyonlar\'da denetleyin.';
  }
  m = m.replace(/^Veritabanı hatası \([^)]*\):\s*/, '');
  for (const g of [ayar.parola, ayar.sunucu, ayar.kullanici, ayar.veritabani, ayar.port ? String(ayar.port) : '']) {
    if (typeof g === 'string' && g.length >= 2) m = m.split(g).join(MASKE);
  }
  m = m.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)'"]+/gi, MASKE).replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, MASKE);
  return `Sorgu çalıştırılamadı: ${m.slice(0, 300)}`;
}

/** Kartın zaman aşımı (ms): ayarı yoksa ya da geçersizse varsayılan 15 sn; 1–120 sn. @param {unknown} sn */
export function kartZamanAsimiMs(sn) {
  let n;
  try { n = sqlZamanAsimiTemizle(sn); } catch { n = undefined; }
  return n === undefined ? PANO_SQL_ZAMAN_ASIMI_MS : n * 1000;
}

/** @param {unknown} v */
const metin = (v) => (typeof v === 'string' ? v : '');
/** @param {() => any} fn */
const guvenli = (fn) => { try { return fn(); } catch { return undefined; } };

/**
 * Kaydedilmiş SQL kartı (yoksa DepoHatasi). @param {Veritabani} vt @param {string} projeId @param {string} kartId
 */
export function sqlKarti(vt, projeId, kartId) {
  const duzen = panoGetir(vt, projeId).duzen;
  const bulunan = duzen.kartlar.find((x) => x.id === kartId && x.tur === 'sql');
  if (!bulunan || !bulunan.ayar) throw new DepoHatasi('SQL kartı bulunamadı. Panoyu kaydettikten sonra "Yenile"ye basın.');
  // Panonun ortamı seçiliyse mantıksal veritabanına bağlı kart o ortamla sorgulanır (uç denetimi de aynı hedefe bakar: CANLI onayı).
  const k = { ...bulunan, ayar: { ...bulunan.ayar, hedef: etkinHedef(bulunan, duzen) } };
  return /** @type {{ id: string; donem?: unknown; ayar: { baslik: string; hedef: { veritabaniId?: string; ortamId?: string; baglantiId?: string }; sorgu: string; zamanAsimiSn?: unknown } }} */ (k);
}

/**
 * Kartın hedefinin CANLI ortam adları (uç denetimi; boşsa CANLI değil). Mantıksal veritabanı + ortam: ortam CANLI ise. Doğrudan
 * bağlantı: bağlantının "Ortamlar" seçiminde ya da bir veritabanı eşlemesinde CANLI ortam varsa.
 * @param {Veritabani} vt @param {{ projeId?: unknown; kartId?: unknown }} g @returns {string[]}
 */
export function panoSqlCanliOrtamlari(vt, g) {
  const projeId = metin(g.projeId);
  const kartId = metin(g.kartId);
  if (!projeId || !kartId) return [];
  const k = guvenli(() => sqlKarti(vt, projeId, kartId));
  if (!k) return [];
  const h = k.ayar.hedef;
  /** @param {string} id */
  const canliAd = (id) => { const o = guvenli(() => ortamGetir(vt, id)); return o && o.projeId === projeId && riskliOrtamMi(o) ? String(o.ad) : null; };
  if (h.veritabaniId) { const a = h.ortamId ? canliAd(h.ortamId) : null; return a ? [a] : []; }
  const b = guvenli(() => baglantiGetir(vt, String(h.baglantiId ?? ''), projeId));
  if (!b) return [];
  /** @type {Set<string>} */
  const ortamlar = new Set(Array.isArray(b.ortamIdleri) ? b.ortamIdleri : []);
  for (const v of guvenli(() => tumVeritabanlari(vt)) ?? []) {
    if (v.projeId !== projeId) continue;
    for (const [o, bid] of Object.entries(v.eslemeler ?? {})) if (bid === b.id) ortamlar.add(o);
  }
  return [...new Set([...ortamlar].map(canliAd).filter((x) => x !== null))];
}

/**
 * Pano sorgusunun yalnız okuma denetimi (SELECT / WITH … SELECT; tek ifade). Uymuyorsa DepoHatasi (bağlantı açılmaz).
 * @param {string} sql
 */
export function panoSorgusuDenetle(sql) {
  try { yalnizOkumaDenetle(sql); } catch (e) {
    throw new DepoHatasi(`${String(/** @type {Error} */ (e).message).replace(/^Yalnız okuma açıkken /, 'Panoda ')} Pano yalnız okuma sorgusu çalıştırır.`);
  }
}

/**
 * SQL kartını yeniler: kaydedilmiş sorgu bağlantıda yalnız okuma olarak çalışır, sonuç maskelenir ve önbelleğe yazılır.
 * @param {Veritabani} vt @param {string} projeId @param {string} kartId
 * Zaman aşımı: kartın ayarı (zamanAsimiSn; 1–120 sn), yoksa 15 sn; üst sınır 120 sn.
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number; simdi?: () => Date }} [s] (testler daha kısa süre / sınır verebilir)
 * @returns {Promise<PanoSqlSonucu>}
 */
export async function panoSqlYenile(vt, projeId, kartId, s = {}) {
  izinGerekli(vt, 'veritabani-okuma', 'panoSqlYenile');
  const kart = sqlKarti(vt, projeId, kartId);
  panoSorgusuDenetle(kart.ayar.sorgu);
  const h = kart.ayar.hedef;
  // Dönem: sorguda :baslangic / :bitis varsa kartın dönemi (yoksa varsayılan) Date olarak SÜRÜCÜ PARAMETRESİ bağlanır (Oracle :ad,
  // SQL Server @ad, PostgreSQL $n, MySQL ? — veritabani-suruculeri.mjs > parametreleriDonustur); SQL metnine hiçbir değer eklenmez.
  const p = sqlDonemParametreleri(kart.ayar.sorgu);
  const simdi = s.simdi ? s.simdi() : new Date();
  const aralik = p.baslangic || p.bitis ? donemAraligi(kart.donem, simdi) : null;
  /** @type {Record<string, Date | string>} */
  const parametreler = {};
  // Kart parametreleri (sorgudaki :ad; başlıktaki seçim): seçili değer (yoksa ilk seçenek) sürücü parametresi olarak bağlanır.
  const kartParam = kartParametreleri(kart);
  Object.assign(parametreler, kartParam);
  if (aralik && p.baslangic) parametreler.baslangic = aralik.baslangic;
  if (aralik && p.bitis) parametreler.bitis = aralik.bitis;
  const { maskeli, kesildi, satirSiniri } = await sorguyuCalistir(vt, projeId, kart, kart.ayar.sorgu, parametreler, s, PANO_SQL_SATIR_SINIRI);
  // "Sayı + değişim" için önceki YENİLEMENİN ilk satırı (önbellekteki maskeli sonuçtan; aynı sorgu ve hedef). İlk yenilemede null.
  const eski = panoGetir(vt, projeId).sqlSonuclari[kartId];
  const onceki = eski ? { zaman: eski.zaman, sutunlar: eski.sutunlar, ilkSatir: eski.satirlar[0] ?? null } : null;
  /** @type {PanoSqlSonucu} */
  const sonuc = { zaman: simdi.toISOString(), ...maskeli, kesildi, satirSiniri, onceki,
    ...(Object.keys(kartParam).length ? { parametreler: kartParam } : {}),
    ...(h.veritabaniId && h.ortamId ? { ortamId: h.ortamId } : {}),
    ...(aralik ? { donem: { secim: donemTemizle(kart.donem) ?? { ...VARSAYILAN_DONEM }, baslangic: aralik.baslangic.toISOString(), bitis: aralik.bitis.toISOString() } } : {}) };
  sqlSonucuYaz(vt, projeId, kartId, sonuc);
  return sonuc;
}

/**
 * Kartın hedefinde sorguyu yalnız okuma olarak çalıştırır ve sonucu maskeler (Yenile ve İncele ortak yolu).
 * @param {Veritabani} vt @param {string} projeId @param {ReturnType<typeof sqlKarti>} kart @param {string} sorgu
 * @param {Record<string, unknown>} parametreler @param {{ zamanAsimiMs?: number; satirSiniri?: number }} s @param {number} enCokSatir
 */
async function sorguyuCalistir(vt, projeId, kart, sorgu, parametreler, s, enCokSatir) {
  const h = kart.ayar.hedef;
  const { baglanti } = sqlHedefi(vt, h.veritabaniId ? { veritabaniId: h.veritabaniId } : { baglantiId: h.baglantiId },
    { projeId, ...(h.ortamId ? { ortamId: h.ortamId } : {}) });
  // Bağlantının "Yalnız okuma" seçimi ne olursa olsun pano sorgusu salt okunur oturumda çalışır.
  const ayar = { ...veritabaniAyari(baglanti.alanlar), yalnizOkuma: true };
  const zamanAsimiMs = Math.max(200, Math.min(PANO_SQL_EN_COK_ZAMAN_ASIMI_MS, Number(s.zamanAsimiMs) || kartZamanAsimiMs(kart.ayar.zamanAsimiSn)));
  const satirSiniri = Math.max(1, Math.min(enCokSatir, Math.floor(Number(s.satirSiniri) || enCokSatir)));
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let zamanlayici;
  let ham;
  try {
    ham = await Promise.race([
      veritabaniSorgusu(ayar, sorgu, parametreler, { zamanAsimiMs: Math.max(1000, zamanAsimiMs), satirSiniri, yasakDesenleri: etkinYasakDesenleri(vt) }),
      new Promise((_, reddet) => { zamanlayici = setTimeout(() => reddet(Object.assign(new Error('zaman aşımı'), { code: 'PANO_ZAMAN_ASIMI' })), zamanAsimiMs); })
    ]);
  } catch (e) {
    throw new DepoHatasi(hataIletisi(e, ayar, zamanAsimiMs));
  } finally {
    clearTimeout(zamanlayici);
  }
  const r = /** @type {{ sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean }} */ (ham);
  /** @type {string[]} */
  let gizliDegerler = [];
  try { gizliDegerler = bilinenGizliDegerler(vt, projeId).map(String); } catch { gizliDegerler = []; }
  const maskeli = sonucuMaskele({ sutunlar: r.sutunlar, satirlar: r.satirlar.slice(0, satirSiniri) }, { ekler: ekGizliAdlar(vt), gizliDegerler });
  return { maskeli, kesildi: Boolean(r.kesildi) || r.satirlar.length > satirSiniri, satirSiniri };
}

/** İncele sorgusunun en çok satırı (ayrıntı penceresi; sorgu kendisi de sınırlamalıdır, ör. FETCH FIRST 10 ROWS ONLY). */
export const PANO_INCELE_SATIR_SINIRI = 100;

/**
 * Tablo satırının "İncele"si: kartın ayrıntı sorgusu (ayar.inceleSorgusu) kartın hedefinde yalnız okuma olarak çalışır; sonuç
 * maskelenir, önbelleğe YAZILMAZ. Satır istemciden alınmaz: önbellekteki son sonucun satirIndeksi'ndeki satırı kullanılır (zaman
 * aynı olmalı; arada yenilendiyse yeniden İncele istenir). Bağlanan değerler (SQL metnine eklenmez, sürücü parametresi):
 *   :baslangic / :bitis  sonucun alındığı dönem; kart parametresi :ad  sonucun alındığı seçim; diğer :AD  satırın aynı adlı sütunu
 *   (büyük / küçük harf duyarsız). Maskeli sütun bağlanamaz.
 * @param {Veritabani} vt @param {string} projeId @param {string} kartId @param {{ satirIndeksi: unknown; zaman: unknown }} g
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number }} [s]
 */
export async function panoSqlIncele(vt, projeId, kartId, g, s = {}) {
  izinGerekli(vt, 'veritabani-okuma', 'panoSqlIncele');
  const kart = sqlKarti(vt, projeId, kartId);
  const sorgu = /** @type {{ inceleSorgusu?: string }} */ (kart.ayar).inceleSorgusu;
  if (!sorgu) throw new DepoHatasi('Bu kartın İncele sorgusu yok.');
  panoSorgusuDenetle(sorgu);
  const sonuc = panoGetir(vt, projeId).sqlSonuclari[kartId];
  const i = Number(g.satirIndeksi);
  if (!sonuc || sonuc.zaman !== g.zaman || !Number.isInteger(i) || i < 0 || i >= sonuc.satirlar.length) {
    throw new DepoHatasi('Kartın sonucu değişti. İncele\'ye yeniden basın.');
  }
  if (sonuc.ortamId && kart.ayar.hedef.ortamId !== sonuc.ortamId) throw new DepoHatasi('Tablodaki sonuç başka bir ortamın. Önce kartı yenileyin.');
  const satir = sonuc.satirlar[i];
  const sutunlar = sonuc.sutunlar.map(String);
  const gizli = new Set((sonuc.gizliSutunlar ?? []).map(String));
  const kartParam = kartParametreleri(kart);
  /** @type {Record<string, unknown>} */
  const parametreler = {};
  for (const ad of sorguParametreAdlari(sorgu)) {
    if (ad === 'baslangic' || ad === 'bitis') {
      parametreler[ad] = sonuc.donem ? new Date(sonuc.donem[ad]) : donemAraligi(kart.donem, new Date())[ad];
      continue;
    }
    const kp = sonuc.parametreler?.[ad] ?? kartParam[ad];
    if (kp !== undefined) { parametreler[ad] = kp; continue; }
    let j = sutunlar.indexOf(ad);
    if (j < 0) j = sutunlar.findIndex((x) => x.toUpperCase() === ad.toUpperCase());
    if (j < 0) throw new DepoHatasi(`İncele sorgusundaki ":${ad}" için tabloda "${ad}" sütunu yok. Tablonun sütunları: ${sutunlar.join(', ')}.`);
    if (gizli.has(sutunlar[j]) || satir[j] === MASKE) throw new DepoHatasi(`"${sutunlar[j]}" maskeli olduğu için İncele sorgusunda kullanılamaz.`);
    parametreler[ad] = satir[j] ?? null;
  }
  const { maskeli, kesildi, satirSiniri } = await sorguyuCalistir(vt, projeId, kart, sorgu, parametreler, s, PANO_INCELE_SATIR_SINIRI);
  return { zaman: new Date().toISOString(), ...maskeli, kesildi, satirSiniri };
}
