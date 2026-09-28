// UÇTAN UCA AKIŞ — servis, ekran ve SQL adımlarını TEK akışta sırayla koşar; değerler tek sözlükte (${akis:Ad}) taşınır: servis
// yanıtından okunan sipariş numarası → ekranda arama alanına → SQL parametresine gibi.
//
// Kayıt: servis akışları tablosunda, içeriği "uctanUca: true" işaretli akış (tür "akis"; şema değişmez). Adımlar: servis
// (operasyon / kayıtlı senaryo), SQL (sql/sql-adimi.mjs) ve ekran (akislar/ekran-adimi.mjs). Uçtan uca akış yalnız bu modülün
// ucundan koşar (servis akışı uçları ve zamanlanmış koşular reddeder).
//
// MİMARİ: akışı SUNUCU yönetir (servis-akislari.mjs > akisiKos, mevcut motor). Servis ve SQL adımları sunucuda, bugünkü
// istemcilerle koşar (kasa, oturum akışı, maskeleme, servis koşu kaydı aynen). Ekran adımı, ekran senaryosunun MEVCUT koşu
// yolundan (test-sunucu.mjs koşucusu: model spec'i + senaryonun etiketi, ayrı Playwright süreci, platform raporlayıcısı, ekran
// görüntüleri) koşar; akış değerleri sürece NOBETCI_AKIS_ADIMI ile verilir, ekrandan okunan değerler koşuya özgü anahtarla
// şifreli geçici dosyayla döner (uctan-uca-cikti.mjs). Böylece Playwright süreci kasaya / servis istemcilerine erişmez, sunucuda
// ek bir iç uç açılmaz.
//
// Koşu öncesi (on-denetim): yapısal + anlamsal denetim, her adımın seçilen ortamda tanımlı olup olmadığı (servis taban adresi,
// ekran senaryosunun ortamı, veritabanı eşlemesi, yasak adres, canlıda çağrılmayan operasyon) ve gereken izinler (toplu).
// Eksik varsa koşu BAŞLAMAZ. Koşu sırasında izinler her adımdan önce yeniden denetlenir (kapalıysa adım "hata", istek atılmaz).
// Rapor: tek akış koşu kaydı (servis_akis_kosulari; sonuc.uctanUca) — adım başına süre, servis istek / yanıt bağlantısı, SQL
// sonuç tablosu, ekran koşusunun sonuç / ekran görüntüsü kimlikleri; taşınan değerler maskeli (gizliler "***").
// NOT: import.meta KULLANILMAZ.
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DepoHatasi, ekranlariListele, ortamGetir, ortamlariListele, senaryoGetir } from '../veritabani/depo.mjs';
import { calistirmaHedefiCoz, modelBaglami, senaryoAkisi } from '../senaryolar/senaryo-servisi.mjs';
import { GENEL_ORTAM_ETIKETI } from '../senaryolar/calistirma.mjs';
import { formSemasiOlustur, tumFormAlanlari } from '../senaryolar/model-formu.mjs';
import { adresYasakliMi, gizliDegerleriMaskele, modelSenaryosuMu } from '../senaryolar/model-kosusu.mjs';
import {
  akisIceriginiDogrula, servisAkisiGetir, servisAkisiKaydet, servisAkislariniListele, servisAkisKosulariniListele, servisAkisKosusuGetir,
  servisGetir, servisSenaryosuGetir
} from '../servisler/servis-deposu.mjs';
import { ekranAdimKancasiAyarla, servisAkisiCalistir, servisAkisiDenetle } from '../servisler/servis-akislari.mjs';
import { ortamdaTanimli } from '../servisler/servis-islemleri.mjs';
import { sqlHedefi } from '../sql/sorgu-bagdastirici.mjs';
import { sqlSatirSiniriOku } from '../ayarlar/kosu-ayarlari.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { izinleriOku } from '../guvenlik/izinler.mjs';
import { IZIN_TANIMLARI, izinMesaji } from '../guvenlik/izin-tanimlari.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';
import { adimIzinleri } from '../guvenlik/uc-denetimi.mjs';
import { ezmeleriCoz } from './ekran-adimi.mjs';
import {
  AKIS_ADIMI_DEGISKENI, AKIS_CIKTI_ANAHTARI_DEGISKENI, AKIS_CIKTI_DOSYASI_DEGISKENI, akisCiktisiOku, akisCiktisiniSil, ciktiAnahtariUret
} from './uctan-uca-cikti.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

const MASKE = '***';
/** Ezilebilen senaryo alanı tipleri (değer metindir). */
const EZILEBILIR_TIPLER = new Set(['metin', 'sayi', 'tarih', 'secim', 'profil']);

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {unknown} d */
const metin = (d) => (typeof d === 'string' ? d : '');

// ---------------------------------------------------------------------------------------
// Ekran adımının koşucusu (sunucu-platform.mjs verir: test-sunucu.mjs koşucusu + yasak adres desenleri)
// ---------------------------------------------------------------------------------------

/**
 * @typedef {{ kosucu: () => (import('../senaryolar/calistirma.d.mts').Kosucu | null); secenekler: (vt: Veritabani) => import('../senaryolar/calistirma.d.mts').CalistirmaSecenekleri }} UctanUcaCalistirici
 */
/** @type {UctanUcaCalistirici | null} */
let calistirici = null;
/** @param {UctanUcaCalistirici | null} c */
export function uctanUcaKosucusuAyarla(c) { calistirici = c; }

/** Senaryonun ekran modeli (akışıyla) — yoksa null. @param {Veritabani} vt @param {any} s */
function senaryoModeli(vt, s) {
  if (!s || !s.ekranId) return null;
  try { return modelBaglami(vt, s.ekranId, senaryoAkisi(s.icerik)); } catch { return null; }
}

/** Senaryonun ezilebilir alanları (anahtar, etiket, tip). @param {any} mb */
function ezilebilirAlanlar(mb) {
  try {
    const sema = formSemasiOlustur(mb.model, mb.altModeller);
    return tumFormAlanlari(sema).filter((a) => EZILEBILIR_TIPLER.has(a.tip) && typeof a.anahtar === 'string' && a.anahtar !== sema.baslik)
      .map((a) => ({ anahtar: String(a.anahtar), etiket: String(a.etiket ?? a.anahtar), tip: String(a.tip) }));
  } catch {
    return [];
  }
}

/** @param {any} icerik @returns {string[]} */
const senaryoOrtamlari = (icerik) => (icerik && typeof icerik.ortamlar === 'object' && icerik.ortamlar ? Object.keys(icerik.ortamlar) : []);

/**
 * Ekran adımının anlamsal denetimi: senaryo projede, model koşucusuyla koşar, ekranı silinmemiş, ezilen alanlar modelde.
 * @param {Veritabani} vt @param {string} projeId @param {any} a @returns {string | null}
 */
export function ekranAdimiDenetle(vt, projeId, a) {
  const s = senaryoGetir(vt, String(a?.senaryoId ?? ''));
  if (!s || s.projeId !== projeId) return 'ekran senaryosu bulunamadı.';
  if (!modelSenaryosuMu(s.icerik)) return `"${s.baslik}" model koşucusuyla koşmayan (kodlu) bir senaryo; ekran adımında kullanılamaz.`;
  const ekran = s.ekranId ? ekranlariListele(vt, projeId, { silinenlerDahil: true }).find((e) => e.id === s.ekranId) : undefined;
  if (!ekran || ekran.durum === 'silindi') return `"${s.baslik}" senaryosunun ekranı silinmiş.`;
  const mb = senaryoModeli(vt, s);
  if (!mb) return `"${s.baslik}" senaryosunun ekran modeli yok.`;
  const anahtarlar = new Set(ezilebilirAlanlar(mb).map((x) => x.anahtar));
  const yabanci = Object.keys(a.ezmeler ?? {}).filter((k) => !anahtarlar.has(k));
  if (yabanci.length) return `${yabanci.map((k) => `"${k}"`).join(', ')} alanı "${ekran.ad}" ekranının akıştan doldurulabilen senaryo alanlarında yok.`;
  return null;
}

/**
 * Ekran adımını koşar (servis-akislari.mjs kancası). Hata / eksik okuma adımı "hata" ya da "basarisiz" yapar; açık okunan değerler
 * yalnız bellekte (acik) döner, kayda maskeli yazılır.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ortamId: string; adim: any; degerler: Record<string, string>; gizliler: string[]; akisBaslik: string; adimNo: number }} g
 */
async function ekranAdiminiKos(vt, projeId, g) {
  const a = g.adim;
  const k = calistirici?.kosucu() ?? null;
  if (!k) throw new DepoHatasi('Ekran adımları bu sunucuda koşamaz (test çalıştırıcısı etkin değil).');
  // Hedef: senaryonun MEVCUT koşu hedefi (model spec'i + etiket; ortamda tanımlı mı, yasak adres) — tarayıcı açılmadan denetlenir.
  const hedef = calistirmaHedefiCoz(vt, projeId, a.senaryoId, g.ortamId, calistirici?.secenekler(vt) ?? {});
  const ez = ezmeleriCoz(a.ezmeler ?? {}, g.degerler);
  if (ez.eksik.length) throw new DepoHatasi(`${ez.eksik.map((x) => `\${akis:${x}}`).join(', ')} değeri yok (önceki adım okuyamadı).`);
  const ekler = ekGizliAdlar(vt);
  /** @param {unknown} m */
  const maskele = (m) => gizliDegerleriMaskele(String(m ?? ''), g.gizliler);
  const okumalar = (a.okumalar ?? []).map((/** @type {any} */ o) => ({ ad: String(o.ad), yol: String(o.yol), gizli: typeof o.gizli === 'boolean' ? o.gizli : gizliAdMi(o.ad, ekler) }));
  // Adı gizli sayılan alana yazılan değer de maskelenir (koşucu yakalanan mesajlarda / hatalarda).
  const gizliEzmeler = Object.entries(ez.degerler).filter(([anahtar]) => gizliAdMi(anahtar, ekler)).map(([, d]) => d);
  const adimVerisi = { senaryoId: hedef.senaryoId, ezmeler: ez.degerler, gizliDegerler: [...g.gizliler, ...gizliEzmeler], okumalar };
  const anahtar = ciktiAnahtariUret();
  const yol = join(tmpdir(), `nobetci-akis-${randomBytes(8).toString('hex')}.cikti`);
  const bas = Date.now();
  try {
    /** @type {Record<string, any>} */
    let govde;
    try {
      const y = await k.calistir({
        ortam: GENEL_ORTAM_ETIKETI, dosya: hedef.dosya, ad: hedef.ad, kosuId: `akis-${randomUUID()}`, kosuTuru: null, kosuKimligi: null, kosuKapsami: null,
        senaryoId: hedef.senaryoId, etiket: hedef.etiket, grepDeseni: hedef.grepDeseni, genel: hedef.genel,
        ekOrtam: { [AKIS_ADIMI_DEGISKENI]: JSON.stringify(adimVerisi), [AKIS_CIKTI_DOSYASI_DEGISKENI]: yol, [AKIS_CIKTI_ANAHTARI_DEGISKENI]: anahtar }
      });
      govde = y.govde ?? {};
    } catch (e) {
      throw new DepoHatasi(`Ekran koşusu başlatılamadı: ${maskele(/** @type {Error} */ (e)?.message ?? e)}`);
    }
    const cikti = akisCiktisiOku(yol, anahtar) ?? { okunanlar: {}, gizliOkunanlar: [] };
    /** @type {'basarili' | 'basarisiz' | 'hata' | 'durduruldu'} */
    let durum;
    let neden = '';
    if (govde.basarili === false) { durum = 'hata'; neden = maskele(govde.mesaj ?? 'Ekran koşusu başlatılamadı.'); }
    else if (govde.durum === 'passed') durum = 'basarili';
    else if (govde.durum === 'iptal') { durum = 'durduruldu'; neden = 'kullanıcı durdurdu'; }
    else { durum = 'basarisiz'; neden = maskele(govde.hataMesaji ?? govde.mesaj ?? `ekran senaryosu: ${govde.durum ?? 'sonuç yok'}`); }
    if (durum === 'basarili') {
      const eksik = okumalar.filter((/** @type {{ ad: string }} */ o) => typeof cikti.okunanlar[o.ad] !== 'string');
      if (eksik.length) { durum = 'basarisiz'; neden = `${eksik.map((/** @type {{ ad: string }} */ o) => o.ad).join(', ')} ekrandan okunamadı.`; }
    }
    const okunan = durum === 'basarili' ? cikti.okunanlar : {};
    const gizliAdlar = new Set([...cikti.gizliOkunanlar, ...okumalar.filter((/** @type {{ gizli: boolean }} */ o) => o.gizli).map((/** @type {{ ad: string }} */ o) => o.ad)]);
    const sonuc = {
      durum, sureMs: typeof govde.sureMs === 'number' ? govde.sureMs : Date.now() - bas, ...(neden ? { neden } : {}),
      ekran: {
        senaryoId: hedef.senaryoId, senaryo: hedef.baslik, sonucId: govde.sonucId ?? null, ekranGoruntusuId: govde.ekranGoruntusuId ?? null,
        videoId: govde.videoId ?? null, ...(govde.basarisizAdim ? { basarisizAdim: maskele(govde.basarisizAdim) } : {})
      },
      ...(Object.keys(ez.degerler).length
        ? { ezmeler: Object.fromEntries(Object.entries(ez.degerler).map(([k2, v]) => [k2, gizliAdMi(k2, ekler) ? MASKE : maskele(v)])) } : {}),
      ...(Object.keys(okunan).length ? { okunanlar: Object.fromEntries(Object.entries(okunan).map(([k2, v]) => [k2, gizliAdlar.has(k2) ? MASKE : v])) } : {})
    };
    const acikGizliler = [...gizliAdlar].map((ad) => okunan[ad]).filter((x) => typeof x === 'string' && x.length > 0);
    return { sonuc, acik: { okunan, gizliler: acikGizliler } };
  } finally {
    akisCiktisiniSil(yol);
  }
}

ekranAdimKancasiAyarla({
  denetle: ekranAdimiDenetle,
  etiket: (vt, a) => senaryoGetir(vt, String(/** @type {any} */ (a)?.senaryoId ?? ''))?.baslik ?? 'Ekran senaryosu',
  kos: (vt, projeId, g) => ekranAdiminiKos(vt, projeId, g)
});

// ---------------------------------------------------------------------------------------
// Akış çözümü, ön denetim, koşu
// ---------------------------------------------------------------------------------------

/**
 * Kayıtlı ya da taslak uçtan uca akış. @param {Veritabani} vt @param {string} projeId
 * @param {{ akisId?: unknown; icerik?: unknown; baslik?: unknown; kapsam?: unknown }} g
 */
function akisCoz(vt, projeId, g) {
  const kayitli = g.akisId ? servisAkisiGetir(vt, kimlik(g.akisId, 'akisId')) : undefined;
  if (g.akisId && (!kayitli || kayitli.projeId !== projeId || !kayitli.icerik.uctanUca)) throw new DepoHatasi('Uçtan uca akış bulunamadı.');
  if (g.icerik !== undefined) {
    const ham = g.icerik && typeof g.icerik === 'object' && !Array.isArray(g.icerik) ? { ...g.icerik, uctanUca: true } : g.icerik;
    const icerik = akisIceriginiDogrula(ham, 'akis', { satirSiniri: sqlSatirSiniriOku(vt) });
    const kapsam = g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? g.kapsam : kayitli?.kapsam ?? 'test';
    return { id: kayitli?.id, baslik: metin(g.baslik).trim() || kayitli?.baslik || 'Taslak uçtan uca akış', kapsam, icerik, taslak: true };
  }
  if (!kayitli) throw new DepoHatasi('"akisId" ya da "icerik" gerekli.');
  return { id: kayitli.id, baslik: kayitli.baslik, kapsam: kayitli.kapsam, icerik: kayitli.icerik, taslak: false };
}

/** Adımın türü (izin / rapor dili). @param {any} a */
const adimTuru = (a) => (a.tur === 'sql' ? 'SQL' : a.tur === 'ekran' ? 'ekran' : 'servis');

/**
 * Koşu öncesi denetim (hiçbir istek atılmaz): yapısal / anlamsal hatalar, seçilen ortamda eksik adımlar ve gereken izinler.
 * @param {Veritabani} vt @param {string} projeId @param {{ akisId?: unknown; icerik?: unknown; baslik?: unknown; kapsam?: unknown; ortamId: unknown }} g
 */
export function uctanUcaOnDenetim(vt, projeId, g) {
  const akis = akisCoz(vt, projeId, g);
  const ortam = ortamGetir(vt, kimlik(g.ortamId, 'ortamId'));
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const riskli = riskliOrtamMi(ortam);
  const hatalar = servisAkisiDenetle(vt, projeId, akis.icerik);
  /** @type {string[]} */
  const uyarilar = [];
  if (!akis.taslak && akis.kapsam !== 'ikisi' && akis.kapsam !== (riskli ? 'canli' : 'test')) {
    uyarilar.push(`Akış yalnız ${akis.kapsam === 'test' ? 'TEST' : 'CANLI'} ortamda koşar (Kapsam).`);
  }
  if (akis.taslak && riskli) uyarilar.push('Kaydedilmemiş akış yalnız TEST ortamında denenir; önce kaydedin.');
  const desenler = calistirici?.secenekler(vt).yasakDesenleri ?? [];
  akis.icerik.adimlar.forEach((a, n) => {
    const yer = `${n + 1}. adım (${a.ad})`;
    if (a.tur === 'sql') {
      try { sqlHedefi(vt, a.sql, { projeId, ortamId: ortam.id }); } catch (e) { uyarilar.push(`${yer}: ${/** @type {Error} */ (e).message}`); }
      return;
    }
    if (a.tur === 'ekran') {
      const s = senaryoGetir(vt, a.senaryoId);
      if (!s || s.projeId !== projeId) return;
      if (!senaryoOrtamlari(s.icerik).includes(ortam.id)) uyarilar.push(`${yer}: "${s.baslik}" senaryosu "${ortam.ad}" ortamında tanımlı değil.`);
      const kalip = adresYasakliMi(ortam.tabanUrl, desenler);
      if (kalip) uyarilar.push(`${yer}: ortamın adresi yasaklı adres kalıbına ("${kalip}") uyuyor.`);
      return;
    }
    const sv = servisGetir(vt, a.servisId);
    if (!sv) return;
    if (!ortamdaTanimli(sv.ayarlar, ortam.id)) { uyarilar.push(`${yer}: "${sv.ad}" servisi "${ortam.ad}" ortamında tanımlı değil (taban adres yok).`); return; }
    const op = a.tur === 'operasyon' ? a.operasyon : servisSenaryosuGetir(vt, a.senaryoId)?.icerik.operasyon;
    if (riskli && op && (sv.ayarlar.yalnizTestOperasyonlari ?? []).includes(op)) uyarilar.push(`${yer}: "${sv.ad} · ${op}" CANLI'da çağrılmaz.`);
  });
  // Gereken izinler (toplu): adım türlerine göre; riskli ortamda canlı ortam izni (+ her koşuda ayrıca onay).
  const durum = izinleriOku(vt);
  /** @type {Map<string, Set<string>>} */
  const gereken = new Map();
  akis.icerik.adimlar.forEach((a, n) => {
    for (const x of [...adimIzinleri(vt, projeId, ortam.id, a), ...(riskli ? ['canli-ortam'] : [])]) {
      if (!gereken.has(x)) gereken.set(x, new Set());
      /** @type {Set<string>} */ (gereken.get(x)).add(`${n + 1}. ${adimTuru(a)}`);
    }
  });
  const sira = IZIN_TANIMLARI.map((t) => t.anahtar);
  const izinler = [...gereken.entries()].sort(([a], [b]) => sira.indexOf(a) - sira.indexOf(b)).map(([anahtar, adimlar]) => ({
    anahtar, etiket: IZIN_TANIMLARI.find((t) => t.anahtar === anahtar)?.etiket ?? anahtar, acik: durum[anahtar] === true, adimlar: [...adimlar]
  }));
  return {
    akis: { id: akis.id ?? null, baslik: akis.baslik, adimSayisi: akis.icerik.adimlar.length, taslak: akis.taslak },
    ortam: { id: ortam.id, ad: ortam.ad, riskli },
    hatalar, uyarilar, izinler, canliOnayGerekli: riskli, kosulabilir: !hatalar.length && !uyarilar.length
  };
}

/**
 * Uçtan uca akışı koşar ve kaydeder (tek koşu kaydı). Ön denetimde sorun varsa hiçbir adım koşmaz. Kayıtlı akış "koşu", taslak
 * (kaydedilmemiş hâl) "Dene" (yalnız TEST) olarak yazılır.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ akisId?: unknown; icerik?: unknown; baslik?: unknown; kapsam?: unknown; ortamId: unknown; sinyal?: AbortSignal }} g
 */
export async function uctanUcaCalistir(vt, projeId, g) {
  const on = uctanUcaOnDenetim(vt, projeId, g);
  if (on.hatalar.length) throw new DepoHatasi(on.hatalar.join(' '));
  if (on.uyarilar.length) throw new DepoHatasi(`Koşu başlamadı: ${on.uyarilar.join(' ')}`);
  const akis = akisCoz(vt, projeId, g);
  const ortam = /** @type {NonNullable<ReturnType<typeof ortamGetir>>} */ (ortamGetir(vt, on.ortam.id));
  const riskli = on.ortam.riskli;
  const ekler = ekGizliAdlar(vt);
  // Adım başına izin denetimi (koşu sürerken izin kapatılırsa sonraki adım istek atmadan "hata" olur).
  /** @param {any} a */
  const adimDenetimi = (a) => {
    const durum = izinleriOku(vt);
    const kapali = [...adimIzinleri(vt, projeId, ortam.id, a), ...(riskli ? ['canli-ortam'] : [])].find((x) => durum[x] !== true);
    return kapali ? izinMesaji(kapali) : '';
  };
  // Taşınan değerlerin özeti (maskeli): adım adım okunanlar; adı gizli sayılanlar maskelenir.
  /** @param {Array<{ no: number; okunanlar?: Record<string, string> }>} adimlar */
  const sonucEki = (adimlar) => {
    /** @type {Array<{ ad: string; deger: string; adim: number }>} */
    const tasinan = [];
    for (const x of adimlar) for (const [ad, d] of Object.entries(x.okunanlar ?? {})) tasinan.push({ ad, deger: gizliAdMi(ad, ekler) ? MASKE : String(d), adim: x.no });
    return { tasinanDegerler: tasinan };
  };
  return servisAkisiCalistir(vt, projeId, {
    ...(akis.id ? { akisId: akis.id } : {}),
    ...(akis.taslak ? { taslak: { baslik: akis.baslik, tur: 'akis', kapsam: akis.kapsam, icerik: akis.icerik } } : {}),
    ortamId: ortam.id, tur: akis.taslak ? 'dene' : 'kosu', sinyal: g.sinyal, uctanUca: true, adimDenetimi, sonucEki
  });
}

// ---------------------------------------------------------------------------------------
// Uçlar (sunucu-platform.mjs kaydeder)
// ---------------------------------------------------------------------------------------

/** Projenin uçtan uca akışları. @param {Veritabani} vt @param {string} projeId */
function uctanUcaAkislari(vt, projeId) {
  return servisAkislariniListele(vt, projeId).filter((a) => a.tur === 'akis' && a.icerik.uctanUca === true);
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const UCTAN_UCA_GET_UCLARI = [
  ['/platform/uctan-uca/akislar', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    return {
      akislar: uctanUcaAkislari(db, projeId).map((a) => ({
        id: a.id, baslik: a.baslik, kapsam: a.kapsam, adimSayisi: a.icerik.adimlar.length,
        adimTurleri: a.icerik.adimlar.map(adimTuru), sonKosu: servisAkisKosulariniListele(db, { projeId, akisId: a.id, sinir: 1 })[0] ?? null
      }))
    };
  }],
  // Tasarımda ekran adımının seçenekleri: model senaryoları, ekranı, tanımlı olduğu ortamlar ve akıştan doldurulabilen alanları.
  ['/platform/uctan-uca/ekran-senaryolari', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const ekranlar = new Map(ekranlariListele(db, projeId).map((e) => [e.id, e]));
    /** @type {Map<string, ReturnType<typeof ezilebilirAlanlar>>} */
    const alanOnbellegi = new Map();
    const senaryolar = db.tumu('SELECT id FROM senaryolar WHERE proje_id = ? ORDER BY baslik', [projeId])
      .map((x) => senaryoGetir(db, String(x.id)))
      .filter((s) => s && s.ekranId && ekranlar.has(s.ekranId) && modelSenaryosuMu(s.icerik))
      .map((s0) => {
        const s = /** @type {NonNullable<ReturnType<typeof senaryoGetir>>} */ (s0);
        const anahtar = `${s.ekranId}\u0000${senaryoAkisi(s.icerik) ?? ''}`;
        if (!alanOnbellegi.has(anahtar)) { const mb = senaryoModeli(db, s); alanOnbellegi.set(anahtar, mb ? ezilebilirAlanlar(mb) : []); }
        const e = ekranlar.get(String(s.ekranId));
        return { id: s.id, baslik: s.baslik, ekranId: s.ekranId, ekranAd: e?.ad ?? '', ekranEtkin: e?.durum === 'etkin', ortamIdleri: senaryoOrtamlari(s.icerik), alanlar: alanOnbellegi.get(anahtar) };
      });
    return { senaryolar };
  }],
  ['/platform/uctan-uca/kosular', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const akisId = q.get('akisId');
    const akislar = uctanUcaAkislari(db, projeId);
    const ortamlar = new Map(ortamlariListele(db, projeId).map((o) => [o.id, o.ad]));
    const sinir = Math.min(Math.max(Number(q.get('sinir')) || 100, 1), 500);
    const kosular = akislar.filter((a) => !akisId || a.id === akisId)
      .flatMap((a) => servisAkisKosulariniListele(db, { projeId, akisId: a.id, sinir }).map((k) => ({ ...k, akisBaslik: a.baslik, ortam: k.ortamId ? ortamlar.get(k.ortamId) ?? '—' : '—' })))
      .sort((x, y) => (x.baslangic < y.baslangic ? 1 : x.baslangic > y.baslangic ? -1 : 0)).slice(0, sinir);
    return { kosular, akislar: akislar.map((a) => ({ id: a.id, baslik: a.baslik })) };
  }],
  ['/platform/uctan-uca/kosu', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const k = servisAkisKosusuGetir(db, kimlik(q.get('id'), 'id'));
    if (!k || k.projeId !== projeId || !k.sonuc?.uctanUca) throw new DepoHatasi('Uçtan uca akış koşusu bulunamadı.');
    // Kayıt zaten maskeli yazılır; adı sonradan gizli sayılan okumalar da gösterimde maskelenir.
    const ekler = ekGizliAdlar(db);
    /** @param {unknown} o */
    const maske = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([ad, d]) => [ad, gizliAdMi(ad, ekler) ? MASKE : String(d)])) : o);
    const sonuc = {
      ...k.sonuc,
      adimlar: (Array.isArray(k.sonuc.adimlar) ? k.sonuc.adimlar : []).map((/** @type {any} */ x) => ({ ...x, ...(x.okunanlar ? { okunanlar: maske(x.okunanlar) } : {}) })),
      tasinanDegerler: (Array.isArray(k.sonuc.tasinanDegerler) ? k.sonuc.tasinanDegerler : []).map((/** @type {any} */ x) => ({ ...x, deger: gizliAdMi(String(x.ad), ekler) ? MASKE : String(x.deger) }))
    };
    return { kosu: { ...k, sonuc } };
  }]
];

/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>} */
export const UCTAN_UCA_POST_UCLARI = [
  // Kayıt: yapısal + anlamsal denetim (servis / senaryo / ekran senaryosu projede; ${akis:X} önceki adımda okunuyor).
  ['/platform/uctan-uca/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const id = typeof g.id === 'string' && g.id ? kimlik(g.id, 'id') : undefined;
    if (id) {
      const mevcut = servisAkisiGetir(db, id);
      if (!mevcut || mevcut.projeId !== projeId || !mevcut.icerik.uctanUca) throw new DepoHatasi('Uçtan uca akış bulunamadı.');
    }
    const ham = g.icerik && typeof g.icerik === 'object' && !Array.isArray(g.icerik) ? { ...g.icerik, uctanUca: true } : g.icerik;
    const icerik = akisIceriginiDogrula(ham, 'akis', { satirSiniri: sqlSatirSiniriOku(db) });
    const hatalar = servisAkisiDenetle(db, projeId, icerik);
    if (hatalar.length) throw new DepoHatasi(hatalar.join(' '));
    const yeniId = servisAkisiKaydet(db, {
      id, projeId, baslik: metin(g.baslik), tur: 'akis', ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {}), icerik
    });
    return { id: yeniId };
  }],
  // Koşu öncesi denetim (istek atmaz): koşu penceresi eksik adımları ve gereken izinleri gösterir.
  ['/platform/uctan-uca/on-denetim', (db, g) => ({ denetim: uctanUcaOnDenetim(db, kimlik(g.projeId, 'projeId'), g) })],
  // Koşu (izinler uçta toplu denetlenir: guvenlik/uc-denetimi.mjs; riskli ortamda canliOnay gerekir). Koşu bitene kadar bekletilir.
  ['/platform/uctan-uca/kos', async (db, g) => ({ sonuc: await uctanUcaCalistir(db, kimlik(g.projeId, 'projeId'), g) })]
];
