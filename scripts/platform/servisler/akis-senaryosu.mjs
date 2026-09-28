// AKIŞ SENARYOSU (servis senaryosu türü "Akış") — senaryo bir servis akışını (proje düzeyi; servisler arası) seçer ve akışın HER
// OPERASYON ADIMI için alan değerlerini + beklenen sonucu (kontroller) tutar. Akış yalnız sırayı ve taşınan değerleri
// (bağlar: alan ← ${akis:Ad}) tanımlar; ekran senaryolarındaki "akış = ekranın adımları, senaryo = veriler" mantığıyla aynı.
//   İçerik (servis senaryosu içeriği, şifreli): { tur: 'akis', akisId, adimlar: { "<adımId>": tek istekli senaryo içeriği } }
//   (yapı: akis-senaryo-icerigi.mjs). Senaryo, oluşturulduğu serviste kayıtlıdır; akışın geçtiği HER serviste listelenir ve
//   o servisin toplu koşusuna ("Koşuyu başlat") girer.
// Koşu: akış motoru (servis-akislari.mjs > servisAkisiCalistir) senaryonun adım içerikleriyle koşar; koşu kaydı akış koşuları
//   tablosuna senaryonun başlığıyla yazılır (Servis sonuçları ekranı); adımların istekleri servis koşularında görünür.
// servis-islemleri.mjs'e kanca olarak kaydolur (servisSenaryosuCalistir / toplu koşu / canlı panel içerik türüne göre buraya
// yönlendirir). Uçlar: AKIS_SENARYO_GET_UCLARI / AKIS_SENARYO_POST_UCLARI (sunucu-platform.mjs kaydeder).
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import {
  senaryoIceriginiDogrula, servisAkisiGetir, servisAkislariniListele, servisAkisKosulariniListele, servisAkisKosusuGetir, servisGetir,
  servisSenaryosuGetir, servisSenaryosuKaydet
} from './servis-deposu.mjs';
import { akisSenaryoKancasiAyarla, ortamTuru, ortamdaTanimli } from './servis-islemleri.mjs';
import { operasyonVarsayilanIcerigi, servisAkisiCalistir, servisAkisiDenetle } from './servis-akislari.mjs';
import { akisSenaryosuMu, operasyonAdimlari } from './akis-senaryo-icerigi.mjs';
import { semaBirlestir } from './servis-govdesi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').ServisAkisi} ServisAkisi */

const KAPSAMLAR = ['test', 'canli', 'ikisi'];

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/** Projedeki akış senaryoları (içerik çözülmüş). @param {Veritabani} vt @param {string} projeId */
export function projeAkisSenaryolari(vt, projeId) {
  return vt.tumu('SELECT id FROM servis_senaryolari WHERE proje_id = ? ORDER BY IFNULL(sira, 1e9), olusturulma', [projeId])
    .map((x) => servisSenaryosuGetir(vt, String(x.id))).filter((s) => s && akisSenaryosuMu(s.icerik));
}

/** Akışın adımlarının servisleri (operasyon ve senaryo adımları). @param {ServisAkisi} akis */
const akisServisleri = (akis) => new Set(akis.icerik.adimlar.filter((a) => a.tur !== 'sql').map((a) => a.servisId));

/** Akışı bu servisten geçen, BAŞKA serviste kayıtlı akış senaryoları. @param {Veritabani} vt @param {string} projeId @param {string} servisId */
export function gecenAkisSenaryolari(vt, projeId, servisId) {
  /** @type {Map<string, ServisAkisi | undefined>} */
  const akislar = new Map();
  return projeAkisSenaryolari(vt, projeId).filter((s) => {
    if (!s || s.servisId === servisId) return false;
    const id = /** @type {any} */ (s.icerik).akisId;
    if (!akislar.has(id)) akislar.set(id, servisAkisiGetir(vt, id));
    const a = akislar.get(id);
    return Boolean(a && akisServisleri(a).has(servisId));
  });
}

/**
 * Senaryo bu ortamda neden koşmaz ('' = koşar): kapsam, akış yok, adımın servisi ortamda tanımlı değil, CANLI'da çağrılmayan operasyon.
 * @param {Veritabani} vt @param {any} s senaryo @param {{ id: string; ad: string; ayarlar: Record<string, unknown> }} ortam
 */
export function akisSenaryoAtlamaNedeni(vt, s, ortam) {
  const tur = ortamTuru(/** @type {any} */ (ortam));
  if (s.kapsam !== 'ikisi' && s.kapsam !== tur) return `Senaryo yalnız ${s.kapsam === 'test' ? 'TEST' : 'CANLI'} ortamda koşar.`;
  const akis = servisAkisiGetir(vt, s.icerik.akisId);
  if (!akis) return 'Senaryonun akışı bulunamadı.';
  for (const a of akis.icerik.adimlar) {
    if (a.tur === 'sql') continue;
    const sv = servisGetir(vt, a.servisId);
    if (!sv) return `"${a.ad}" adımının servisi bulunamadı.`;
    if (!ortamdaTanimli(sv.ayarlar, ortam.id)) return `"${sv.ad}" servisi "${ortam.ad}" ortamında tanımlı değil.`;
    const op = a.tur === 'operasyon' ? a.operasyon : servisSenaryosuGetir(vt, a.senaryoId)?.icerik.operasyon;
    if (tur === 'canli' && op && (sv.ayarlar.yalnizTestOperasyonlari ?? []).includes(op)) return `"${sv.ad} · ${op}" CANLI'da çağrılmaz.`;
  }
  return '';
}

/**
 * Anlamsal denetim: akış var (oturum akışı değil), senaryodaki adımlar akışın operasyon adımları, operasyon adları uyuşuyor,
 * akıştaki değerler önce okunuyor. @param {Veritabani} vt @param {string} projeId @param {any} icerik @returns {string[]}
 */
export function akisSenaryosuDenetle(vt, projeId, icerik) {
  const akis = servisAkisiGetir(vt, icerik.akisId);
  if (!akis || akis.projeId !== projeId) return ['Senaryonun akışı bulunamadı.'];
  if (akis.tur !== 'akis') return ['Oturum akışı senaryoda kullanılmaz; bir akış seçin.'];
  if (akis.icerik.uctanUca) return ['Uçtan uca akış servis senaryosunda kullanılmaz; bir servis akışı seçin.'];
  /** @type {string[]} */
  const hatalar = [];
  const oplar = new Map(operasyonAdimlari(akis.icerik).map((a) => [a.id, a]));
  if (!oplar.size) hatalar.push(`"${akis.baslik}" akışında operasyon adımı yok (akış tasarımında "+ > Operasyon").`);
  for (const [id, ic] of Object.entries(icerik.adimlar ?? {})) {
    const a = oplar.get(id);
    if (!a) hatalar.push(`"${id}" adımı akışta yok (akış değişmiş olabilir; senaryoyu yeniden kaydedin).`);
    else if (/** @type {any} */ (ic).operasyon !== a.operasyon) hatalar.push(`${a.no}. adım (${a.ad}): senaryodaki operasyon "${/** @type {any} */ (ic).operasyon}", akışta "${a.operasyon}".`);
  }
  hatalar.push(...servisAkisiDenetle(vt, projeId, akis.icerik, icerik.adimlar));
  return hatalar;
}

/**
 * Akış senaryosunu koşar (servisSenaryosuCalistir'in kancası). Dönüş tek istekli senaryonunkiyle uyumludur: adımlar
 * "kontroller" gibi listelenir (canlı panel), akışın koşu kaydı akisKosuId.
 * @param {Veritabani} vt @param {string} projeId @param {any} girdi
 */
async function akisSenaryosunuKos(vt, projeId, girdi) {
  const olay = girdi.olay ?? (() => undefined);
  const kayitli = girdi.kayitli;
  const icerik = kayitli ? kayitli.icerik : senaryoIceriginiDogrula(girdi.taslak?.icerik);
  const baslik = kayitli?.baslik ?? girdi.taslak?.baslik ?? 'Taslak';
  const kapsam = kayitli?.kapsam ?? girdi.taslak?.kapsam ?? 'test';
  const ortam = ortamGetir(vt, girdi.ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const hatalar = akisSenaryosuDenetle(vt, projeId, icerik);
  if (hatalar.length) throw new DepoHatasi(hatalar.join(' '));
  if (girdi.tur === 'kosu') {
    const neden = akisSenaryoAtlamaNedeni(vt, { kapsam, icerik }, ortam);
    if (neden) throw new DepoHatasi(neden);
  }
  olay('hazirlik', 'tamam');
  olay('gonderim', 'basladi');
  const r = await servisAkisiCalistir(vt, projeId, {
    akisId: icerik.akisId, ortamId: ortam.id, tur: girdi.tur, sinyal: girdi.sinyal, adimIcerikleri: icerik.adimlar,
    senaryo: { id: kayitli?.id ?? null, baslik, kapsam }
  });
  olay('gonderim', 'tamam');
  const kontroller = r.adimlar.map((a) => ({
    tur: 'akisAdimi', ad: `${a.no}. ${a.ad} (${a.servis} › ${a.senaryo})`, gecti: a.durum === 'basarili',
    aciklama: a.durum === 'basarili' ? `${a.sureMs} ms` : a.neden ?? a.durum
  }));
  olay('kontroller', r.durum === 'basarili' ? 'tamam' : 'hata', { gecen: kontroller.filter((k) => k.gecti).length, toplam: kontroller.length });
  return {
    durum: r.durum, sureMs: r.sureMs, baslik, ortam: r.ortam, ortamTuru: r.ortamTuru, ozet: r.ozet, kontroller, adimlar: r.adimlar,
    akisKosuId: r.kosuId, akisId: icerik.akisId, ...(r.durduruldu ? { durduruldu: true } : {})
  };
}

akisSenaryoKancasiAyarla({ kos: akisSenaryosunuKos, gecenler: gecenAkisSenaryolari, atlamaNedeni: akisSenaryoAtlamaNedeni });

/**
 * Servis sayfasının senaryo listesi: akış senaryolarına akış adı; akışı bu servisten geçen başka servislerin akış senaryoları
 * (gecen: true, sahip servis); akış senaryolarının son sonucu (akış koşularından).
 * @param {Veritabani} vt @param {string} projeId @param {string} servisId @param {any[]} senaryolar @param {Record<string, any>} sonSonuclar
 * @param {Record<string, Record<string, any>>} [ortamSonuclari] senaryo → ortam → son sonuç (akış koşularından eklenir)
 */
export function servisSenaryoGorunumu(vt, projeId, servisId, senaryolar, sonSonuclar, ortamSonuclari = {}) {
  const gecen = gecenAkisSenaryolari(vt, projeId, servisId);
  const tumu = [...senaryolar, ...gecen.map((s) => ({ ...s, gecen: true }))];
  const akislar = new Map(servisAkislariniListele(vt, projeId).map((a) => [a.id, a]));
  const servisAdlari = new Map();
  /** @type {Record<string, any>} */
  const son = { ...sonSonuclar };
  /** @type {Map<string, any[]>} */
  const kosular = new Map();
  for (const s of tumu) {
    if (!akisSenaryosuMu(s.icerik)) continue;
    const a = akislar.get(s.icerik.akisId);
    s.akisAdi = a?.baslik ?? '(silinmiş akış)';
    if (s.gecen) {
      if (!servisAdlari.has(s.servisId)) servisAdlari.set(s.servisId, servisGetir(vt, s.servisId)?.ad ?? '?');
      s.sahipServisAd = servisAdlari.get(s.servisId);
    }
    if (!a) continue;
    if (!kosular.has(a.id)) kosular.set(a.id, servisAkisKosulariniListele(vt, { projeId, akisId: a.id, sinir: 50 }));
    // Koşular en yeniden eskiye: senaryonun en son sonucu ve ORTAM BAŞINA en son sonucu.
    let ilk = true;
    for (const k of kosular.get(a.id) ?? []) {
      if (k.tur !== 'kosu' || k.baslik !== s.baslik) continue;
      const tam = servisAkisKosusuGetir(vt, k.id);
      if (/** @type {any} */ (tam?.sonuc)?.senaryo?.id !== s.id) continue;
      const kayit = { durum: k.durum, baslangic: k.baslangic, kosuId: null, akisKosuId: k.id, akisId: a.id, ortamId: k.ortamId ?? null };
      if (ilk) { son[s.id] = kayit; ilk = false; }
      if (k.ortamId) {
        const o = (ortamSonuclari[s.id] ??= {});
        if (!o[k.ortamId]) o[k.ortamId] = kayit;
      }
    }
  }
  return { senaryolar: tumu, sonSonuclar: son, ortamSonuclari };
}

/**
 * Senaryo formunun verisi: akışın operasyon adımları, her adımın servisi / operasyonu / şeması, zorunlu ve bağlı alanları,
 * akıştan gelen (kilitli) alanlar, varsayılan içerik; CANLI'da çağrılmayan adımlar.
 * @param {Veritabani} vt @param {string} projeId @param {string} akisId
 */
export function akisSenaryoFormVerisi(vt, projeId, akisId) {
  const akis = servisAkisiGetir(vt, akisId);
  if (!akis || akis.projeId !== projeId) throw new DepoHatasi('Akış bulunamadı.');
  const adimlar = operasyonAdimlari(akis.icerik).map((a) => {
    const sv = servisGetir(vt, a.servisId);
    if (!sv) return { ...a, servis: null, hata: 'servis bulunamadı' };
    const s0 = sv.ayarlar.operasyonSemalari?.[a.operasyon];
    /** @type {any} */
    let varsayilanIcerik = null;
    try { varsayilanIcerik = operasyonVarsayilanIcerigi(sv, a.operasyon); } catch { /* alan listesi yok */ }
    return {
      ...a,
      servis: { id: sv.id, ad: sv.ad, tur: sv.tur, soapSurumu: sv.ayarlar.soapSurumu ?? '1.1', tarihKurallari: Object.keys(sv.ayarlar.tarihKurallari ?? {}) },
      sema: sv.tur !== 'rest' && s0 ? semaBirlestir(s0, sv.ayarlar.ekAlanlar?.[a.operasyon] ?? []) : null,
      zorunlular: sv.ayarlar.alanZorunluluklari?.[a.operasyon] ?? null,
      alanBaglari: sv.ayarlar.alanBaglari?.[a.operasyon] ?? {},
      alanVarsayilanlari: sv.ayarlar.alanVarsayilanlari?.[a.operasyon] ?? {},
      varsayilanIcerik,
      yalnizTest: (sv.ayarlar.yalnizTestOperasyonlari ?? []).includes(a.operasyon)
    };
  });
  return {
    akis: { id: akis.id, baslik: akis.baslik, tur: akis.tur, adimSayisi: akis.icerik.adimlar.length },
    adimlar,
    canliEngeli: adimlar.filter((a) => /** @type {any} */ (a).yalnizTest).map((a) => `${a.no}. ${/** @type {any} */ (a).servis?.ad ?? '?'} · ${a.operasyon} CANLI'da çağrılmaz`)
  };
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const AKIS_SENARYO_GET_UCLARI = [
  ['/platform/servis/akis-senaryo-formu', (db, q) => akisSenaryoFormVerisi(db, kimlik(q.get('projeId'), 'projeId'), kimlik(q.get('akisId'), 'akisId'))],
  // Akış sayfasındaki "Bu akışın senaryoları".
  ['/platform/servis-akisi/senaryolar', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const akisId = kimlik(q.get('akisId'), 'akisId');
    return {
      senaryolar: projeAkisSenaryolari(db, projeId).filter((s) => s && /** @type {any} */ (s.icerik).akisId === akisId)
        .map((s) => ({ id: s?.id, servisId: s?.servisId, baslik: s?.baslik, kapsam: s?.kapsam, kosuyaDahil: s?.kosuyaDahil }))
    };
  }]
];

/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>} */
export const AKIS_SENARYO_POST_UCLARI = [
  // Akış senaryosu kaydı: yapısal (servis-deposu) + anlamsal denetim (akış, adımlar, taşınan değerler).
  ['/platform/servis/akis-senaryosu/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const servisId = kimlik(g.servisId, 'servisId');
    const icerik = senaryoIceriginiDogrula(g.icerik);
    if (!akisSenaryosuMu(icerik)) throw new DepoHatasi('İçerik bir akış senaryosu değil.');
    const hatalar = akisSenaryosuDenetle(db, projeId, icerik);
    if (hatalar.length) throw new DepoHatasi(hatalar.join(' '));
    if (g.kapsam !== undefined && !KAPSAMLAR.includes(g.kapsam)) throw new DepoHatasi('"kapsam" geçersiz.');
    if (g.kapsam && g.kapsam !== 'test') {
      const engel = akisSenaryoFormVerisi(db, projeId, /** @type {any} */ (icerik).akisId).canliEngeli;
      if (engel.length) throw new DepoHatasi(`CANLI seçilemez: ${engel.join('; ')}.`);
    }
    const id = servisSenaryosuKaydet(db, {
      projeId, servisId, id: typeof g.id === 'string' && g.id ? kimlik(g.id, 'id') : undefined, baslik: g.baslik, kapsam: g.kapsam,
      ...(typeof g.kosuyaDahil === 'boolean' ? { kosuyaDahil: g.kosuyaDahil } : {}), icerik
    });
    return { id };
  }]
];
