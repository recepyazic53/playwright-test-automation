// SERVİS AKIŞLARI — birden çok kayıtlı servis senaryosunu sırayla koşar. Bir adımın yanıtından okunan değer (ör. token, teklif
// no) sonraki adımlarda ${akis:Ad} ile gövdede, HTTP başlığında ve kontrollerde kullanılır.
// - Adım kayıtlı bir senaryoya başvurur (gövde / kontroller tek yerde); akış yalnız okumaları ve "hata olursa devam"ı tutar.
// - Kalan / hata veren adımdan sonraki adımlar atlanır (hataOlursaDevam yoksa). Durdurma bekleyen isteği keser.
// - Her adım servis koşularına da yazılır (servisin Raporlar sekmesi görür); akışın özeti servis_akis_kosulari'na.
// - Gizli okumalar (token, parola…) sonraki adımların istek / yanıt / başlıklarında ve kayıtlarda maskelenir; açık değerler
//   yalnız bu süreçte, bellekte.
// OTURUM AKIŞI (tur "oturum"): servise atanır (ayarlar.oturumAkisi). Senaryoda ${akis:Token} verilmemişse değer oturumdan gelir;
// oturum koşular arasında süresi (omurSaniye) dolana kadar bellekte paylaşılır (tokenYenileme "herIstekte" ise her senaryo
// çalıştırmasında yeniden alınır); 401 / 403 gelirse bir kez yenilenir.
// Canlı ortam: akış yalnız kullanıcı başlatınca (arayüzdeki onayla) koşar; "yalnız test" operasyonu içeren akış canlıda hiç
// istek atmadan reddedilir.
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { ServisHatasi, kullanilanAkisDegerleri } from './soap-istemcisi.mjs';
import {
  akisIceriginiDogrula, servisAkisiGetir, servisAkisKosusuKaydet, servisGetir, servisSenaryosuGetir
} from './servis-deposu.mjs';
import { ortamTuru, oturumSaglayicisiAyarla, servisSenaryosuCalistir } from './servis-islemleri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').ServisAkisIcerigi} ServisAkisIcerigi */

/**
 * Akışın anlamsal doğrulaması: servis / senaryo projede mi; ${akis:X} önceki adımlarda okunuyor ya da adımın servisinin oturum
 * akışından geliyor mu. Hata listesi döner (boşsa geçerli).
 * @param {Veritabani} vt @param {string} projeId @param {ServisAkisIcerigi} icerik @returns {string[]}
 */
export function servisAkisiDenetle(vt, projeId, icerik) {
  /** @type {string[]} */
  const hatalar = [];
  /** @type {Set<string>} */
  const okunan = new Set();
  icerik.adimlar.forEach((a, n) => {
    const yer = `${n + 1}. adım (${a.ad})`;
    const servis = servisGetir(vt, a.servisId);
    const senaryo = servisSenaryosuGetir(vt, a.senaryoId);
    if (!servis || servis.projeId !== projeId) { hatalar.push(`${yer}: servis bulunamadı.`); return; }
    if (!senaryo || senaryo.servisId !== servis.id) { hatalar.push(`${yer}: senaryo bu serviste bulunamadı.`); return; }
    const oturum = servis.ayarlar.oturumAkisi ? servisAkisiGetir(vt, servis.ayarlar.oturumAkisi) : undefined;
    const oturumAdlari = new Set((oturum?.icerik.adimlar ?? []).flatMap((x) => x.okumalar.map((o) => o.ad)));
    const i = senaryo.icerik;
    const kullanilan = kullanilanAkisDegerleri([i.govde, ...Object.values(i.basliklar ?? {}), JSON.stringify(i.kontroller)].join('\n'));
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
 *   sureMs: number; kosuId?: string; okunanlar?: Record<string, string>; neden?: string }} AkisAdimSonucu
 */

/**
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ akis: { id?: string; baslik: string; tur: 'akis' | 'oturum'; kapsam?: 'test' | 'canli' | 'ikisi'; icerik: ServisAkisIcerigi }; ortamId: string;
 *   tur: 'dene' | 'kosu'; sinyal?: AbortSignal; oturumIcinde?: boolean; olay?: (adim: AkisAdimSonucu, durum: 'basladi' | 'bitti') => void }} g
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
    const servis = servisGetir(vt, a.servisId);
    const senaryo = servisSenaryosuGetir(vt, a.senaryoId);
    /** @type {AkisAdimSonucu} */
    const s = { no: n + 1, ad: a.ad, servis: servis?.ad ?? '?', senaryo: senaryo?.baslik ?? '?', durum: 'atlandi', sureMs: 0 };
    adimlar.push(s);
    if (dur) { s.neden = 'önceki adım başarısız'; continue; }
    if (g.sinyal?.aborted) { s.durum = 'durduruldu'; s.neden = 'kullanıcı durdurdu'; continue; }
    g.olay?.(s, 'basladi');
    /** @type {{ okunan: Record<string, string>; gizliler: string[] }} */
    let acik = { okunan: {}, gizliler: [] };
    try {
      if (!servis || !senaryo) throw new DepoHatasi('Adımın servisi ya da senaryosu bulunamadı.');
      const r = await servisSenaryosuCalistir(vt, projeId, {
        servisId: servis.id, ortamId: g.ortamId, tur: g.tur, senaryoId: senaryo.id, sinyal: g.sinyal,
        akisDegerleri: { ...degerler }, ekGizliler: [...gizliler], okumalar: a.okumalar,
        akis: { akisId: g.akis.id ?? null, akisBaslik: g.akis.baslik, adimNo: n + 1, adimAd: a.ad, ...(g.oturumIcinde ? { oturum: true } : {}) },
        acikDegerler: (d) => { acik = d; }
      });
      s.durum = r.durum; s.sureMs = r.sureMs; s.kosuId = r.kosuId;
      if (r.okunanlar) s.okunanlar = /** @type {Record<string, string>} */ (r.okunanlar);
      if (r.hata) s.neden = String(r.hata);
      else if (r.durum !== 'basarili') s.neden = (r.kontroller ?? []).filter((k) => !k.gecti).map((k) => k.ad).join('; ');
      if (r.durduruldu) s.durum = 'durduruldu';
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
 *   ortamId: string; tur: 'dene' | 'kosu'; sinyal?: AbortSignal; olay?: (adim: AkisAdimSonucu, durum: 'basladi' | 'bitti') => void }} girdi
 */
export async function servisAkisiCalistir(vt, projeId, girdi) {
  const kayitli = girdi.akisId ? servisAkisiGetir(vt, girdi.akisId) : undefined;
  if (girdi.akisId && (!kayitli || kayitli.projeId !== projeId)) throw new DepoHatasi('Akış bulunamadı.');
  if (!kayitli && !girdi.taslak) throw new DepoHatasi('"akisId" ya da "taslak" gerekli.');
  // Taslak verilirse (düzenleyicide kaydedilmemiş hâl) o koşulur; akisId de verildiyse koşu kaydı o akışa bağlanır.
  const akisTuru = girdi.taslak?.tur ?? kayitli?.tur ?? 'akis';
  const akis = kayitli && !girdi.taslak ? kayitli : { id: kayitli?.id, baslik: girdi.taslak?.baslik || kayitli?.baslik || 'Taslak akış', tur: akisTuru, kapsam: girdi.taslak?.kapsam ?? kayitli?.kapsam ?? 'test', icerik: akisIceriginiDogrula(girdi.taslak?.icerik, akisTuru) };
  const ortam = ortamGetir(vt, girdi.ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const tur = ortamTuru(ortam);
  if (girdi.tur === 'dene' && tur !== 'test') throw new DepoHatasi('"Dene" yalnızca test ortamında yapılır.');
  const kapsam = akis.kapsam ?? 'test';
  if (girdi.tur === 'kosu' && kapsam !== 'ikisi' && kapsam !== tur) throw new DepoHatasi(`Bu akış yalnızca ${kapsam === 'test' ? 'test' : 'canlı'} ortamda koşar.`);
  const hatalar = servisAkisiDenetle(vt, projeId, akis.icerik);
  if (hatalar.length) throw new DepoHatasi(hatalar.join(' '));
  if (tur === 'canli') {
    for (const a of akis.icerik.adimlar) {
      const s = servisGetir(vt, a.servisId);
      const op = servisSenaryosuGetir(vt, a.senaryoId)?.icerik.operasyon;
      if (s && op && (s.ayarlar.yalnizTestOperasyonlari ?? []).includes(op)) throw new DepoHatasi(`"${a.ad}" adımının "${op}" operasyonu yalnız test ortamında koşar; akış canlıda koşulamaz.`);
    }
  }
  const baslangic = new Date();
  const bas = Date.now();
  const r = await akisiKos(vt, projeId, { akis, ortamId: ortam.id, tur: girdi.tur, sinyal: girdi.sinyal, olay: girdi.olay });
  const sureMs = Date.now() - bas;
  const sonuc = { ortam: ortam.ad, ortamTuru: tur, adimlar: r.adimlar, ozet: r.ozet, ...(girdi.sinyal?.aborted ? { durduruldu: true } : {}) };
  const kosuId = servisAkisKosusuKaydet(vt, {
    projeId, akisId: kayitli?.id ?? null, ortamId: ortam.id, tur: girdi.tur, durum: r.durum, baslangic: baslangic.toISOString(), sureMs, baslik: akis.baslik, sonuc
  });
  // Başarılı oturum akışı denemesi önbelleği tazeler (sonraki senaryolar yeni değerleri kullanır).
  if (akis.tur === 'oturum' && kayitli && r.durum === 'basarili') oturumlariTemizle(kayitli.id);
  return { kosuId, durum: r.durum, sureMs, baslik: akis.baslik, ...sonuc };
}
