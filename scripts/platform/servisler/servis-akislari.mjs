// SERVİS AKIŞLARI — birden çok kayıtlı servis senaryosunu sırayla koşar. Bir adımın yanıtından okunan değer (ör. token, sipariş
// no) sonraki adımlarda ${akis:Ad} ile gövdede, HTTP başlığında ve kontrollerde kullanılır.
// - Adım kayıtlı bir senaryoya başvurur (gövde / kontroller tek yerde); akış yalnız okumaları ve "hata olursa devam"ı tutar.
// - Kalan / hata veren adımdan sonraki adımlar atlanır (hataOlursaDevam yoksa). Durdurma bekleyen isteği keser.
// - Her adım servis koşularına da yazılır (servisin Raporlar sekmesi görür); akışın özeti servis_akis_kosulari'na.
// - Gizli okumalar (token, parola…) sonraki adımların istek / yanıt / başlıklarında ve kayıtlarda maskelenir; açık değerler
//   yalnız bu süreçte, bellekte.
// OTURUM AKIŞI (tur "oturum"): servise atanır (ayarlar.oturumAkisi). Senaryoda ${akis:Token} verilmemişse değer oturumdan gelir;
// oturum koşular arasında süresi (omurSaniye) dolana kadar bellekte paylaşılır (tokenYenileme "herIstekte" ise her senaryo
// çalıştırmasında yeniden alınır); 401 / 403 gelirse bir kez yenilenir.
// SQL ADIMI (tur "sql"; sql/sql-adimi.mjs): seçilen veritabanı bağlantısında (Ayarlar > Entegrasyonlar) sorgu çalışır, sonuç
// beklenenle karşılaştırılır (Geçti / Kaldı; Beklenen / Görülen). SQL'deki ${akis:Ad} sürücü parametresi olarak bağlanır; sorgudan
// okunan değerler (sql.okumalar) sonraki adımlara taşınır. Sonuç tablosu (en çok 20 satır, gizliler maskeli) adım sonucunda.
// OPERASYON ADIMI (tur "operasyon"; akis-senaryo-icerigi.mjs): servisin bir operasyonu. Akış yalnız sırayı ve taşınan değerleri
// (baglar: alan yolu → ${akis:Ad}) tutar; alan değerleri ve beklenen sonuç AKIŞ SENARYOSUNDADIR (adimIcerikleri; yoksa operasyonun
// varsayılan gövdesi). İstek = adım içeriği + bağlar, tek istekli senaryo gibi (taslak) koşar.
// Canlı ortam: akış yalnız kullanıcı başlatınca (arayüzdeki onayla) koşar; "yalnız test" operasyonu içeren akış canlıda hiç
// istek atmadan reddedilir.
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { ServisHatasi, kullanilanAkisDegerleri } from './soap-istemcisi.mjs';
import {
  akisIceriginiDogrula, servisAkisiGetir, servisAkisKosusuKaydet, servisGetir, servisSenaryosuGetir
} from './servis-deposu.mjs';
import { ortamTuru, oturumSaglayicisiAyarla, servisSenaryosuCalistir } from './servis-islemleri.mjs';
import { sqlAdiminiKos, sqlAkisDegerleri } from '../sql/sql-adimi.mjs';
import { sqlHedefi, sqlTanimDenetle, sqlTanimiylaSorgula } from '../sql/sorgu-bagdastirici.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { bagAdi, baglariUygula } from './akis-senaryo-icerigi.mjs';
import { baslangicDegerleri, govdeCoz, govdeUret, semaBirlestir } from './servis-govdesi.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { sqlSatirSiniriOku } from '../ayarlar/kosu-ayarlari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').ServisAkisIcerigi} ServisAkisIcerigi */

/**
 * Akışın anlamsal doğrulaması: servis / senaryo projede mi; ${akis:X} önceki adımlarda okunuyor ya da adımın servisinin oturum
 * akışından geliyor mu. Hata listesi döner (boşsa geçerli).
 * @param {Veritabani} vt @param {string} projeId @param {ServisAkisIcerigi} icerik
 * @param {Record<string, any>} [adimIcerikleri] akış senaryosunun adım içerikleri (operasyon adımlarında kullanılan değerler de denetlenir)
 * @returns {string[]}
 */
export function servisAkisiDenetle(vt, projeId, icerik, adimIcerikleri) {
  /** @type {string[]} */
  const hatalar = [];
  /** @type {Set<string>} */
  const okunan = new Set();
  icerik.adimlar.forEach((a, n) => {
    const yer = `${n + 1}. adım (${a.ad})`;
    if (a.tur === 'sql') {
      const b = sqlTanimDenetle(vt, projeId, a.sql);
      if (b) hatalar.push(`${yer}: ${b}`);
      const eksik = sqlAkisDegerleri(a.sql).filter((x) => !okunan.has(x));
      if (eksik.length) hatalar.push(`${yer}: ${eksik.map((x) => `\${akis:${x}}`).join(', ')} önceki adımlarda okunmuyor.`);
      for (const o of a.sql.okumalar ?? []) okunan.add(o.ad);
      return;
    }
    const servis = servisGetir(vt, a.servisId);
    if (!servis || servis.projeId !== projeId) { hatalar.push(`${yer}: servis bulunamadı.`); return; }
    const oturum = servis.ayarlar.oturumAkisi ? servisAkisiGetir(vt, servis.ayarlar.oturumAkisi) : undefined;
    const oturumAdlari = new Set((oturum?.icerik.adimlar ?? []).flatMap((x) => [...x.okumalar, ...(x.sql?.okumalar ?? [])].map((o) => o.ad)));
    /** @type {string[]} */
    let kullanilan;
    if (a.tur === 'operasyon') {
      if (!(servis.ayarlar.operasyonlar ?? []).some((o) => o.ad === a.operasyon)) { hatalar.push(`${yer}: "${a.operasyon}" operasyonu "${servis.ad}" servisinde yok.`); return; }
      // Operasyon adımı: bağların değerleri (+ akış senaryosunun bu adım içeriğinde geçenler).
      const ic = adimIcerikleri?.[a.id];
      kullanilan = [...new Set([...Object.values(a.baglar ?? {}).map(bagAdi).filter((x) => x !== null),
        ...(ic ? kullanilanAkisDegerleri([ic.govde ?? '', ...Object.values(ic.basliklar ?? {}), JSON.stringify(ic.kontroller ?? []), ic.http?.yol ?? ''].join('\n')) : [])])];
    } else {
      const senaryo = servisSenaryosuGetir(vt, a.senaryoId);
      if (!senaryo || senaryo.servisId !== servis.id) { hatalar.push(`${yer}: senaryo bu serviste bulunamadı.`); return; }
      const i = senaryo.icerik;
      kullanilan = kullanilanAkisDegerleri([i.govde, ...Object.values(i.basliklar ?? {}), JSON.stringify(i.kontroller)].join('\n'));
    }
    const eksik = kullanilan.filter((x) => !okunan.has(x) && !oturumAdlari.has(x));
    if (eksik.length) hatalar.push(`${yer}: ${eksik.map((x) => `\${akis:${x}}`).join(', ')} önceki adımlarda okunmuyor (servisin oturum akışında da yok).`);
    for (const o of a.okumalar) okunan.add(o.ad);
  });
  return hatalar;
}

/** Oturum değerleri: "<akisId>|<ortamId>" → { degerler, gizliler, gecerlilikSonu, baslik }. Yalnız bellekte (veritabanına yazılmaz). */
/** @type {Map<string, { degerler: Record<string, string>; gizliler: string[]; gecerlilikSonu: number; baslik: string }>} */
const oturumlar = new Map();
/** Aynı oturum için eş zamanlı istekler tek girişte buluşur. @type {Map<string, Promise<any>>} */
const bekleyenOturumlar = new Map();

/** Oturum önbelleğini boşaltır (akış silinince / değişince; testler). @param {string} [akisId] */
export function oturumlariTemizle(akisId) {
  for (const k of [...oturumlar.keys()]) if (!akisId || k.startsWith(`${akisId}|`)) oturumlar.delete(k);
}

/**
 * Oturum akışının değerleri: önbellekte geçerliyse onlar (durum "onbellek"); yoksa (ya da yenile) akış koşulur (durum "alindi").
 * @type {import('./servis-islemleri.mjs').OturumSaglayici}
 */
export async function oturumDegerleriniAl(vt, projeId, akisId, ortamId, s = {}) {
  const anahtar = `${akisId}|${ortamId}`;
  const o = oturumlar.get(anahtar);
  const herIstekte = servisAkisiGetir(vt, akisId)?.icerik.tokenYenileme === 'herIstekte';
  if (o && !s.yenile && !herIstekte && o.gecerlilikSonu > Date.now()) return { degerler: o.degerler, gizliler: o.gizliler, baslik: o.baslik, durum: 'onbellek' };
  const bekleyen = bekleyenOturumlar.get(anahtar);
  if (bekleyen) return bekleyen;
  const is = (async () => {
    const akis = servisAkisiGetir(vt, akisId);
    if (!akis || akis.projeId !== projeId || akis.tur !== 'oturum') throw new ServisHatasi('Servisin oturum akışı bulunamadı.');
    const ortam = ortamGetir(vt, ortamId);
    if (!ortam) throw new ServisHatasi('Ortam bulunamadı.');
    const r = await akisiKos(vt, projeId, { akis, ortamId, tur: ortamTuru(ortam) === 'canli' ? 'kosu' : 'dene', sinyal: s.sinyal, oturumIcinde: true });
    if (r.durum !== 'basarili') throw new ServisHatasi(`Oturum akışı "${akis.baslik}" başarısız: ${r.ozet}`);
    const kayit = { degerler: r.acik.degerler, gizliler: r.acik.gizliler, baslik: akis.baslik, gecerlilikSonu: Date.now() + (akis.icerik.omurSaniye ?? 3600) * 1000 };
    oturumlar.set(anahtar, kayit);
    return { degerler: kayit.degerler, gizliler: kayit.gizliler, baslik: kayit.baslik, durum: /** @type {const} */ ('alindi') };
  })();
  bekleyenOturumlar.set(anahtar, is);
  try { return await is; } finally { bekleyenOturumlar.delete(anahtar); }
}
oturumSaglayicisiAyarla(oturumDegerleriniAl);

/**
 * @typedef {{ no: number; ad: string; servis: string; senaryo: string; durum: 'basarili' | 'basarisiz' | 'hata' | 'atlandi' | 'durduruldu';
 *   sureMs: number; kosuId?: string; okunanlar?: Record<string, string>; neden?: string; tur?: 'sql'; sqlHedefi?: { baglanti: string; veritabani?: string };
 *   sql?: { sutunlar: string[]; satirlar: string[][]; toplamSatir: number; kesildi: boolean; beklenen?: string; gorulen?: string; deneme: number } }} AkisAdimSonucu
 */

/**
 * SQL adımı: yer tutucular (${akis:Ad}) sürücü parametresi; sonuç maskeli özet; açık okunan değerler yalnız bellekte (acik).
 * Bağlantı / sorgu hatası adımı 'hata' yapar (DepoHatasi fırlatmaz).
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamId @param {any} a adım @param {Record<string, string>} degerler
 * @param {string[]} gizliler önceki gizli DEĞERLER @param {AbortSignal | undefined} sinyal
 */
async function sqlAdimiKos(vt, projeId, ortamId, a, degerler, gizliler, sinyal) {
  const ekler = ekGizliAdlar(vt);
  // Hedef önce çözülür (veritabanı → bu ortamın eşlemesi → bağlantı): eşleme yoksa / bağlantı kullanılamıyorsa sorgu atılmaz,
  // adım anlaşılır hatayla kalır (DepoHatasi akisiKos'ta 'hata' olur). Raporda kullanılan bağlantının ADI görünür.
  const hedef = sqlHedefi(vt, a.sql, { projeId, ortamId });
  const kullanilan = { baglanti: hedef.baglanti.ad, ...(hedef.veritabani ? { veritabani: hedef.veritabani.ad } : {}) };
  const r = await sqlAdiminiKos(a.sql, {
    adimAdi: a.ad, sinyal, gizliDegerler: gizliler, gizliSutunMu: (ad) => gizliAdMi(ad, ekler),
    // Sorguda okunan en çok satır: Ayarlar > Koşu > Gelişmiş.
    satirSiniri: sqlSatirSiniriOku(vt),
    coz: (ifade) => (ifade.startsWith('akis:') ? degerler[ifade.slice(5).trim()] : undefined),
    yurutucu: (sql, parametreler, o) => sqlTanimiylaSorgula(vt, { baglantiId: hedef.baglanti.id }, sql, parametreler, { ...o, projeId, ortamId })
  });
  const acikGizliler = r.gizliOkunanlar.map((ad) => r.okunanlar[ad]).filter((x) => typeof x === 'string' && x.length > 0);
  /** @type {Partial<AkisAdimSonucu>} */
  const sonuc = { durum: r.durum, sureMs: r.sureMs, sqlHedefi: kullanilan, ...(r.mesaj ? { neden: r.mesaj } : {}) };
  if (r.ozet) sonuc.sql = { ...r.ozet, beklenen: r.beklenen, gorulen: r.gorulen, deneme: r.deneme };
  if (Object.keys(r.okunanlar).length) sonuc.okunanlar = Object.fromEntries(Object.entries(r.okunanlar).map(([k, v]) => [k, r.gizliOkunanlar.includes(k) ? '***' : v]));
  return { sonuc, acik: { okunan: r.okunanlar, gizliler: acikGizliler } };
}


/**
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ akis: { id?: string; baslik: string; tur: 'akis' | 'oturum'; kapsam?: 'test' | 'canli' | 'ikisi'; icerik: ServisAkisIcerigi }; ortamId: string;
 *   tur: 'dene' | 'kosu'; sinyal?: AbortSignal; oturumIcinde?: boolean; olay?: (adim: AkisAdimSonucu, durum: 'basladi' | 'bitti') => void;
 *   adimIcerikleri?: Record<string, any> }} g  adimIcerikleri: akış senaryosunun operasyon adımı içerikleri (adım kimliği → içerik)
 */
async function akisiKos(vt, projeId, g) {
  /** @type {Record<string, string>} */
  const degerler = {};
  /** @type {string[]} */
  const gizliler = [];
  /** @type {AkisAdimSonucu[]} */
  const adimlar = [];
  let dur = false;
  for (const [n, a] of g.akis.icerik.adimlar.entries()) {
    const sqlMi = a.tur === 'sql';
    const opMi = a.tur === 'operasyon';
    const servis = sqlMi ? undefined : servisGetir(vt, a.servisId);
    const senaryo = sqlMi || opMi ? undefined : servisSenaryosuGetir(vt, a.senaryoId);
    /** @type {AkisAdimSonucu} */
    const s = { no: n + 1, ad: a.ad, servis: sqlMi ? 'SQL' : servis?.ad ?? '?', senaryo: sqlMi ? 'SQL sorgusu' : opMi ? String(a.operasyon) : senaryo?.baslik ?? '?', durum: 'atlandi', sureMs: 0,
      ...(sqlMi ? { tur: /** @type {const} */ ('sql') } : opMi ? { tur: /** @type {const} */ ('operasyon') } : {}) };
    adimlar.push(s);
    if (dur) { s.neden = 'önceki adım başarısız'; continue; }
    if (g.sinyal?.aborted) { s.durum = 'durduruldu'; s.neden = 'kullanıcı durdurdu'; continue; }
    g.olay?.(s, 'basladi');
    /** @type {{ okunan: Record<string, string>; gizliler: string[] }} */
    let acik = { okunan: {}, gizliler: [] };
    try {
      if (sqlMi) {
        const r = await sqlAdimiKos(vt, projeId, g.ortamId, a, degerler, gizliler, g.sinyal);
        Object.assign(s, r.sonuc);
        // Raporda / sonuç kartında kullanılan bağlantı ("SQL sorgusu · Veritabanı → bağlantı"; parola yok).
        if (r.sonuc.sqlHedefi) s.senaryo = `SQL sorgusu · ${r.sonuc.sqlHedefi.veritabani ? `${r.sonuc.sqlHedefi.veritabani} → ` : ''}${r.sonuc.sqlHedefi.baglanti}`;
        acik = r.acik;
      } else {
      if (!servis || (!opMi && !senaryo)) throw new DepoHatasi('Adımın servisi ya da senaryosu bulunamadı.');
      /** @type {any} */
      let taslak;
      if (opMi) {
        try { taslak = { baslik: `${g.akis.baslik} · ${a.ad}`, kapsam: 'ikisi', icerik: operasyonIcerigi(servis, a, g.adimIcerikleri?.[a.id]) }; } catch (e) { throw new DepoHatasi(/** @type {Error} */ (e).message); }
      }
      const r = await servisSenaryosuCalistir(vt, projeId, {
        servisId: servis.id, ortamId: g.ortamId, tur: g.tur, ...(opMi ? { taslak } : { senaryoId: /** @type {any} */ (senaryo).id }), sinyal: g.sinyal,
        akisDegerleri: { ...degerler }, ekGizliler: [...gizliler], okumalar: a.okumalar,
        akis: { akisId: g.akis.id ?? null, akisBaslik: g.akis.baslik, adimNo: n + 1, adimAd: a.ad, ...(g.oturumIcinde ? { oturum: true } : {}) },
        acikDegerler: (d) => { acik = d; }
      });
      s.durum = r.durum; s.sureMs = r.sureMs; s.kosuId = r.kosuId;
      if (r.okunanlar) s.okunanlar = /** @type {Record<string, string>} */ (r.okunanlar);
      if (r.hata) s.neden = String(r.hata);
      else if (r.durum !== 'basarili') s.neden = (r.kontroller ?? []).filter((k) => !k.gecti).map((k) => k.ad).join('; ');
      if (r.durduruldu) s.durum = 'durduruldu';
      }
    } catch (e) {
      if (!(e instanceof DepoHatasi) && !(e instanceof ServisHatasi)) throw e;
      s.durum = 'hata'; s.neden = e.message;
    }
    Object.assign(degerler, acik.okunan);
    for (const x of acik.gizliler) if (!gizliler.includes(x)) gizliler.push(x);
    g.olay?.(s, 'bitti');
    if (s.durum !== 'basarili' && !a.hataOlursaDevam) dur = true;
  }
  const kotu = adimlar.find((x) => x.durum === 'hata') ? 'hata' : adimlar.some((x) => x.durum !== 'basarili') ? 'basarisiz' : 'basarili';
  const ilkSorun = adimlar.find((x) => x.durum !== 'basarili' && x.durum !== 'atlandi');
  return {
    durum: /** @type {'basarili' | 'basarisiz' | 'hata'} */ (kotu), adimlar,
    ozet: ilkSorun ? `${ilkSorun.no}. adım (${ilkSorun.ad}): ${ilkSorun.neden ?? ilkSorun.durum}` : `${adimlar.length} adım başarılı`,
    acik: { degerler, gizliler }
  };
}

/**
 * Akışı (kayıtlı ya da taslak; ikisi birlikte verilirse taslak koşulur, kayıt akışa bağlanır) bir ortamda koşar ve sonucu kaydeder. tur 'dene': yalnız test ortamı. tur 'kosu': kapsam ortam
 * türüne uymalı. Canlıda "yalnız test" operasyonu içeren akış hiç istek atmadan reddedilir.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ akisId?: string; taslak?: { baslik?: string; tur?: 'akis' | 'oturum'; kapsam?: 'test' | 'canli' | 'ikisi'; icerik: unknown };
 *   ortamId: string; tur: 'dene' | 'kosu'; sinyal?: AbortSignal; olay?: (adim: AkisAdimSonucu, durum: 'basladi' | 'bitti') => void;
 *   adimIcerikleri?: Record<string, any>; senaryo?: { id: string | null; baslik: string; kapsam: 'test' | 'canli' | 'ikisi' } }} girdi
 *   senaryo: akış senaryosu koşusu (akis-senaryosu.mjs) — kapsam senaryonunkidir, koşu kaydı senaryonun başlığıyla yazılır.
 */
export async function servisAkisiCalistir(vt, projeId, girdi) {
  const kayitli = girdi.akisId ? servisAkisiGetir(vt, girdi.akisId) : undefined;
  if (girdi.akisId && (!kayitli || kayitli.projeId !== projeId)) throw new DepoHatasi('Akış bulunamadı.');
  if (!kayitli && !girdi.taslak) throw new DepoHatasi('"akisId" ya da "taslak" gerekli.');
  // Taslak verilirse (düzenleyicide kaydedilmemiş hâl) o koşulur; akisId de verildiyse koşu kaydı o akışa bağlanır.
  const akisTuru = girdi.taslak?.tur ?? kayitli?.tur ?? 'akis';
  const akis = kayitli && !girdi.taslak ? kayitli : { id: kayitli?.id, baslik: girdi.taslak?.baslik || kayitli?.baslik || 'Taslak akış', tur: akisTuru, kapsam: girdi.taslak?.kapsam ?? kayitli?.kapsam ?? 'test', icerik: akisIceriginiDogrula(girdi.taslak?.icerik, akisTuru, { satirSiniri: sqlSatirSiniriOku(vt) }) };
  const ortam = ortamGetir(vt, girdi.ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const tur = ortamTuru(ortam);
  if (girdi.tur === 'dene' && tur !== 'test') throw new DepoHatasi('"Dene" yalnızca test ortamında yapılır.');
  const kapsam = girdi.senaryo?.kapsam ?? akis.kapsam ?? 'test';
  if (girdi.tur === 'kosu' && kapsam !== 'ikisi' && kapsam !== tur) throw new DepoHatasi(`Bu ${girdi.senaryo ? 'senaryo' : 'akış'} yalnızca ${kapsam === 'test' ? 'test' : 'canlı'} ortamda koşar.`);
  const hatalar = servisAkisiDenetle(vt, projeId, akis.icerik, girdi.adimIcerikleri);
  if (hatalar.length) throw new DepoHatasi(hatalar.join(' '));
  if (tur === 'canli') {
    for (const a of akis.icerik.adimlar) {
      if (a.tur === 'sql') continue;
      const s = servisGetir(vt, a.servisId);
      const op = a.tur === 'operasyon' ? a.operasyon : servisSenaryosuGetir(vt, a.senaryoId)?.icerik.operasyon;
      if (s && op && (s.ayarlar.yalnizTestOperasyonlari ?? []).includes(op)) throw new DepoHatasi(`"${a.ad}" adımının "${op}" operasyonu yalnız test ortamında koşar; akış canlıda koşulamaz.`);
    }
  }
  const baslangic = new Date();
  const bas = Date.now();
  const r = await akisiKos(vt, projeId, { akis, ortamId: ortam.id, tur: girdi.tur, sinyal: girdi.sinyal, olay: girdi.olay, adimIcerikleri: girdi.adimIcerikleri });
  const sureMs = Date.now() - bas;
  const sonuc = { ortam: ortam.ad, ortamTuru: tur, adimlar: r.adimlar, ozet: r.ozet, ...(girdi.sinyal?.aborted ? { durduruldu: true } : {}),
    ...(girdi.senaryo ? { senaryo: { id: girdi.senaryo.id, baslik: girdi.senaryo.baslik }, akisBaslik: akis.baslik } : {}) };
  // Akış senaryosu koşusu senaryonun başlığıyla kaydedilir (Servis sonuçları ekranında senaryo adıyla görünür).
  const kosuId = servisAkisKosusuKaydet(vt, {
    projeId, akisId: kayitli?.id ?? null, ortamId: ortam.id, tur: girdi.tur, durum: r.durum, baslangic: baslangic.toISOString(), sureMs, baslik: girdi.senaryo?.baslik ?? akis.baslik, sonuc
  });
  // Başarılı oturum akışı denemesi önbelleği tazeler (sonraki senaryolar yeni değerleri kullanır).
  if (akis.tur === 'oturum' && kayitli && r.durum === 'basarili') oturumlariTemizle(kayitli.id);
  return { kosuId, durum: r.durum, sureMs, baslik: akis.baslik, ...sonuc };
}

/** REST operasyonunun senaryo yolu: {id} → ${id}, sorgu parametreleri eklenir (arayüzdeki restOpYolu ile aynı). @param {any} op */
function restYolu(op) {
  const sorgu = (op?.sorgu ?? []).filter((/** @type {any} */ x) => x.ad).map((/** @type {any} */ x) => `${encodeURIComponent(x.ad)}=${encodeURIComponent(x.deger || '')}`).join('&');
  return `${String(op?.yol ?? '').replace(/{([^}]+)}/g, '${$1}')}${sorgu ? `?${sorgu}` : ''}`;
}

/**
 * Operasyonun varsayılan içeriği (akış senaryosu adım içeriği vermezse): SOAP'ta şemadan başlangıç değerleri (servis alan
 * varsayılanları, hesaplama kuralı bağları) + "Yanıt geçerli SOAP zarfı"; REST'te operasyonun metodu / yolu + 2xx.
 * @param {import('./servis-deposu.mjs').Servis} servis @param {string} operasyon
 */
export function operasyonVarsayilanIcerigi(servis, operasyon) {
  const op = (servis.ayarlar.operasyonlar ?? []).find((o) => o.ad === operasyon);
  if (servis.tur === 'rest') {
    return { operasyon, govde: '', kontroller: [{ tur: 'durumKodu', deger: '200-299' }], http: { metot: op?.metot || 'GET', yol: restYolu(op), .../** @type {any} */ (op)?.icerikTuru ? { icerikTuru: /** @type {any} */ (op).icerikTuru } : {} } };
  }
  const sema0 = servis.ayarlar.operasyonSemalari?.[operasyon];
  if (!sema0) throw new DepoHatasi(`"${operasyon}" operasyonunun alan listesi yok (servisin İşlemler sekmesinden WSDL alınmalı).`);
  const sema = semaBirlestir(sema0, servis.ayarlar.ekAlanlar?.[operasyon] ?? []);
  const varsayilan = servis.ayarlar.alanVarsayilanlari?.[operasyon] ?? {};
  const degerler = baslangicDegerleri(sema, varsayilan);
  for (const [yol, b] of Object.entries(servis.ayarlar.alanBaglari?.[operasyon] ?? {})) if (b.kural && !varsayilan[yol] && yol in degerler) degerler[yol] = { kaynak: 'parametre', deger: b.kural };
  return { operasyon, govde: govdeUret(sema, degerler, { soapSurumu: servis.ayarlar.soapSurumu }), kontroller: [{ tur: 'soapYaniti' }] };
}

/**
 * Operasyon adımının isteği: akış senaryosunun adım içeriği (yoksa varsayılan) + akışın bağları (alan ← ${akis:Ad}).
 * @param {import('./servis-deposu.mjs').Servis} servis @param {any} adim @param {any} [icerik]
 */
export function operasyonIcerigi(servis, adim, icerik) {
  const temel = icerik ? { ...icerik, operasyon: adim.operasyon } : operasyonVarsayilanIcerigi(servis, adim.operasyon);
  const rest = servis.tur === 'rest';
  const sema0 = servis.ayarlar.operasyonSemalari?.[adim.operasyon];
  const sema = !rest && sema0 ? semaBirlestir(sema0, servis.ayarlar.ekAlanlar?.[adim.operasyon] ?? []) : undefined;
  return baglariUygula(temel, adim.baglar ?? {}, { rest, sema, soapSurumu: servis.ayarlar.soapSurumu, govdeCoz, govdeUret });
}
