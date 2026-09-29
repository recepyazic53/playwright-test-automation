// EKRAN SERVİSİ (genel) — platform "Ekranlar" bölümünün veritabanı işlemleri:
//   liste · ayrıntı (güncel model ağacı, sürüm geçmişi, sürümler arası fark) · ekran paketi önizleme ·
//   "Ekran ekle" (ekran + model v1 + seçilen senaryo önerileri + şifreli kanıtlar) · tekrar analiz
//   (paket yükle → bulgular → kabul/red → yalnızca kabul edilenlerle yeni model sürümü; reddedilenler
//   imzasıyla hatırlanır) · etki paneli (bulgu → etkilenen senaryolar, toplu değer atama) ·
//   yapay zekâ aracı için analiz/istek dosyası (gizli değer içermez).
//
// Durum: ekranlar.ayarlar_json (ŞİFRELİ, 'ozel') içinde "analiz" anahtarı:
//   { bekleyen: Analiz | null, son: Analiz | null, reddedilenler: [{ imza, tur, baslik, zaman }],
//     sonBaglamProfilleri: [ad], kanitlar: [{ medyaId, ad, aciklama, zaman, kaynak }] }
// Model sürümleri değişmez kayıtlardır (ekran_modelleri); kanıt görüntüleri medya deposunda şifrelidir.
// Kasa AÇIK olmalıdır. NOT: import.meta KULLANILMAZ. Tipler: ekran-servisi.d.mts.

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  DepoHatasi, baglamProfilleriniListele, ekranAyarlariniGetir, ekranKaydet, ekranModeliEkle, ekranModeliGetir, ekranlariListele,
  girisProfilleriniListele, ortamlariListele, projeGetir, senaryoGetir, senaryoKaydet as depoSenaryoKaydet, testVerisiTurleriniListele
} from '../veritabani/depo.mjs';
import { acikAnahtar, adliAlanlariDonustur, medyaAnahtariniHazirla, sifrele, zarflariCoz } from '../kasa.mjs';
import { medyaSifrele } from '../medya.mjs';
import { akisListesi, akisModeli, beklenenSonucEtiketi, formSemasiOlustur, ortakAkislariAc, tumFormAlanlari, akislariEsitle } from '../senaryolar/model-formu.mjs';
import { modelBaglami, senaryoKaynagi, veriGudumluMu } from '../senaryolar/senaryo-servisi.mjs';
import { anlasilirDogrulamaIletisi, bagsizKosulUyarilari, ekranModeliniDogrula, dogrulamaMaddeleri, semaSurumunuYukselt } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';
import { kanitVerisiniCoz, kodAlanlariniTamamla, ortakAkisPaketineCevir, sayfaPaketiniDogrula } from './sayfa-paketi.mjs';
import { mezarTasiOku } from './mezar-tasi.mjs';
import { paketTestVerisiOnizle, paketTestVerisiniYaz } from '../tablolar/paket-test-verisi.mjs';
import { BICIM_ATFI, INCELEME_KURALLARI, MEVCUT_TABLO_KURALI } from './paket-istekleri.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet, etkinAlanBaglari } from '../tablolar/ekran-baglari.mjs';
import { modelAlanlari, alanEtiketi as paketAlanEtiketi } from '../tablolar/paket-tablolari.mjs';
import { BULGU_TUR_ETIKETLERI, bulguOzeti, bulgulariUygula, etkiHesapla, gorunurlukMetni, modelEnvanteri, modelFarki } from './model-farki.mjs';

/** Yapay zekâ aracının inceleme kuralları ve tekrar analiz ek kuralı: TEK kaynak paket-istekleri.mjs (arayüz de aynı dosyayı kullanır). */

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Nesne */

/** Paket bulgularını ve kararları tutan analiz kaydı en fazla bu kadar reddedilen imza hatırlar. */
const REDDEDILEN_EN_COK = 2000;

/** Doğrulama hataları listesiyle (paket/model) — HTTP 400 + hatalar. */
export class EkranDogrulamaHatasi extends DepoHatasi {
  /** @param {string} mesaj @param {Array<{ yer: string; mesaj: string }>} hatalar */
  constructor(mesaj, hatalar) {
    super(mesaj);
    this.name = 'EkranDogrulamaHatasi';
    this.hatalar = hatalar;
  }
}

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const kopya = (/** @type {unknown} */ d) => JSON.parse(JSON.stringify(d));
const simdi = () => new Date().toISOString();
const bosMu = (/** @type {unknown} */ d) => d === undefined || d === null || (typeof d === 'string' && d.trim() === '');

// ---------------------------------------------------------------------------------------
// Ortak yardımcılar
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
function ekranGetir(vt, projeId, ekranId) {
  const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
  if (!e) throw new DepoHatasi('Ekran bulunamadı.');
  return e;
}

/** Ekranın "analiz" durumu (ayarlar içinde). @param {Veritabani} vt @param {string} ekranId */
function analizDurumu(vt, ekranId) {
  const ayarlar = ekranAyarlariniGetir(vt, ekranId) ?? {};
  const a = nesneMi(ayarlar.analiz) ? /** @type {Nesne} */ (ayarlar.analiz) : {};
  return {
    ayarlar,
    analiz: {
      bekleyen: nesneMi(a.bekleyen) ? /** @type {Nesne} */ (a.bekleyen) : null,
      son: nesneMi(a.son) ? /** @type {Nesne} */ (a.son) : null,
      reddedilenler: Array.isArray(a.reddedilenler) ? /** @type {Nesne[]} */ (a.reddedilenler) : [],
      sonBaglamProfilleri: Array.isArray(a.sonBaglamProfilleri) ? a.sonBaglamProfilleri.filter((x) => typeof x === 'string') : [],
      kanitlar: Array.isArray(a.kanitlar) ? /** @type {Nesne[]} */ (a.kanitlar) : []
    }
  };
}

/** @param {Veritabani} vt @param {{ id: string; projeId: string; anahtar: string; ad: string; aciklama: string | null }} ekran @param {Nesne} ayarlar @param {Nesne} analiz */
function analizYaz(vt, ekran, ayarlar, analiz) {
  ekranKaydet(vt, { id: ekran.id, projeId: ekran.projeId, anahtar: ekran.anahtar, ad: ekran.ad, aciklama: ekran.aciklama, ayarlar: { ...ayarlar, analiz } });
}

/** Alt model kaynağı: projedeki ekranların (anahtar = dosya adı - ".model.json") son modelleri. */
function altModelKaynagi(/** @type {Veritabani} */ vt, /** @type {string} */ projeId) {
  return (/** @type {string} */ dosya) => {
    const anahtar = dosya.replace(/\.model\.json$/, '');
    const e = vt.tek('SELECT id FROM ekranlar WHERE proje_id = ? AND anahtar = ? AND durum <> ? ORDER BY rowid', [projeId, anahtar, 'silindi']);
    const m = e ? ekranModeliGetir(vt, String(e.id)) : undefined;
    return m && nesneMi(m.model) ? m.model : undefined;
  };
}

/**
 * Modelin ortak akış adımlarının başvurduğu ortak akış modelleri (dosya → model; projede bulunamayan atlanır — açılınca
 * yer tutucu adım kalır). @param {Nesne} model @param {(dosya: string) => unknown} kaynak
 * @returns {Record<string, Nesne>}
 */
function ortakAkisModelleri(model, kaynak) {
  /** @type {Record<string, Nesne>} */
  const sonuc = {};
  for (const a of Array.isArray(model.adimlar) ? /** @type {unknown[]} */ (model.adimlar) : []) {
    if (!nesneMi(a) || !nesneMi(a.ortakAkis) || typeof a.ortakAkis.dosya !== 'string' || a.ortakAkis.dosya in sonuc) continue;
    const m = kaynak(a.ortakAkis.dosya);
    if (nesneMi(m)) sonuc[a.ortakAkis.dosya] = /** @type {Nesne} */ (m);
  }
  return sonuc;
}

/** Modeli ortak doğrulayıcıdan geçirir; hatalıysa EkranDogrulamaHatasi. */
export function modeliDogrula(/** @type {Veritabani} */ vt, /** @type {string} */ projeId, /** @type {unknown} */ model, /** @type {string} */ ad) {
  // Varsayılan akışın kopyası model.adimlar ile eşitlenir (bulgular / adres değişikliği model.adimlar'ı değiştirir).
  akislariEsitle(model);
  // Kaydedilen modele koşu tanımı yazıldıysa (akış diyagramı / akış kaydı) sürüm 1 model kendiliğinden sürüm 2'ye çıkar (üst küme).
  semaSurumunuYukselt(model);
  const kaynak = altModelKaynagi(vt, projeId);
  try {
    return ekranModeliniDogrula(ad, model, (dosya) => {
      const alt = kaynak(dosya);
      if (alt === undefined) throw new Error(`"${dosya}" bu projede yok`);
      return alt;
    });
  } catch (e) {
    const maddeler = dogrulamaMaddeleri(e);
    // Kullanıcıya anlaşılır ileti; doğrulayıcının teknik iletisi "ayrinti"de (arayüzde "Ayrıntı" altında).
    throw new EkranDogrulamaHatasi(`Model geçersiz (${maddeler.length} sorun).`, maddeler.map((m) => ({ yer: 'model', mesaj: anlasilirDogrulamaIletisi(m, model), ayrinti: m })));
  }
}

/** Test verisi türlerinde hassas işaretli alan adları (senaryo servisiyle aynı kural). */
function hassasAdlar(/** @type {Veritabani} */ vt, /** @type {string} */ projeId) {
  return new Set(testVerisiTurleriniListele(vt, projeId).flatMap((t) => t.alanlar.filter((a) => a.hassas !== false).map((a) => a.ad)));
}

const alanEtiketi = (/** @type {Nesne} */ a) => (nesneMi(a.etiket) && (a.etiket.ekran || a.etiket.form)) || (nesneMi(a.form) && a.form.etiket) || a.id;
const senaryoAnahtari = (/** @type {Nesne} */ a) => {
  const s = nesneMi(a.eslesme) ? a.eslesme.senaryo : undefined;
  return typeof s === 'string' ? s : Array.isArray(s) && s.length === 1 && typeof s[0] === 'string' ? s[0] : null;
};

// ---------------------------------------------------------------------------------------
// Model ağacı (arayüz için; ham modelden sadeleştirilmiş görünüm)
// ---------------------------------------------------------------------------------------

/**
 * @param {Nesne} model @param {Record<string, Nesne>} [altModeller]
 */
export function modelAgaci(model, altModeller = {}) {
  const bg = nesneMi(model.baglamGorunurlugu) ? /** @type {Nesne} */ (model.baglamGorunurlugu) : null;
  const bgAlanlar = bg && nesneMi(bg.alanlar) ? /** @type {Record<string, Nesne>} */ (bg.alanlar) : {};
  const profiller = bg && Array.isArray(bg.profiller) ? bg.profiller : [];
  /** @type {Set<string>} */
  const istegeBagli = new Set();
  /** @type {Array<{ ayar: string; etiket: string; adimlar: string[] }>} */
  let adimKapsami = [];
  try {
    const sema = formSemasiOlustur(model, altModeller);
    adimKapsami = sema.adimKapsami.map((k) => ({ ayar: k.ayar, etiket: k.etiket, adimlar: k.adimlar }));
    for (const k of sema.adimKapsami) for (const a of k.adimlar) istegeBagli.add(a);
  } catch { /* şema kurulamazsa kapsam bilgisi yok */ }
  /** @returns {Nesne} */
  const alanCevir = (/** @type {Nesne} */ a) => ({
    id: a.id, etiket: alanEtiketi(a), tip: a.tip, zorunlu: a.zorunlu === true ? true : a.zorunlu === false ? false : null,
    yapilandirma: a.yapilandirma ?? null, senaryoAnahtari: senaryoAnahtari(a),
    secenekler: Array.isArray(a.secenekler) ? a.secenekler.filter(nesneMi).map((s) => ({ deger: String(s.senaryoDegeri ?? s.deger), metin: String(s.metin || s.formMetni || s.deger) })) : null,
    seceneklerDurumu: a.seceneklerDurumu ?? null,
    gorunurluk: a.gorunurluk ? gorunurlukMetni(/** @type {Nesne} */ (a.gorunurluk)) : null,
    baglam: nesneMi(bgAlanlar[String(a.id)]) ? bgAlanlar[String(a.id)] : null,
    hassas: a.hassas === true,
    altAlanlar: [...(Array.isArray(a.altAlanlar) ? a.altAlanlar : []), ...(Array.isArray(a.ekranAlanlari) ? a.ekranAlanlari : [])].filter(nesneMi).map(alanCevir)
  });
  const adimlar = (Array.isArray(model.adimlar) ? model.adimlar : []).filter(nesneMi).map((adim) => ({
    id: adim.id, sira: adim.sira, baslik: adim.baslik, gorunurluk: adim.gorunurluk ? gorunurlukMetni(/** @type {Nesne} */ (adim.gorunurluk)) : null,
    istegeBagli: istegeBagli.has(String(adim.id)),
    altModel: nesneMi(adim.altModel) ? { dosya: adim.altModel.dosya, bolum: adim.altModel.bolum } : null,
    bolumler: (Array.isArray(adim.bolumler) ? adim.bolumler : []).filter(nesneMi).map((b) => ({
      id: b.id, baslik: b.baslik, gorunurluk: b.gorunurluk ? gorunurlukMetni(/** @type {Nesne} */ (b.gorunurluk)) : null,
      alanlar: (Array.isArray(b.alanlar) ? b.alanlar : []).filter(nesneMi).map(alanCevir)
    }))
  }));
  const env = modelEnvanteri(model);
  const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar.filter(nesneMi) : [];
  return {
    id: model.id, ad: model.ad, aciklama: model.aciklama, ekranUrl: model.ekranUrl, tur: model.tur,
    adimlar, adimKapsami, profiller,
    senaryoAyarlari: sd.map((a) => ({ id: a.id, etiket: alanEtiketi(a), tip: a.tip, senaryoAnahtari: senaryoAnahtari(a) })),
    sayilar: {
      adim: adimlar.length, bolum: env.bolumler.size, alan: env.alanlar.size,
      senaryoAlani: [...env.alanlar.values()].filter((k) => k.alan.yapilandirma === 'senaryo').length,
      zorunlu: [...env.alanlar.values()].filter((k) => k.alan.zorunlu === true).length,
      kosullu: [...env.alanlar.values()].filter((k) => Boolean(k.alan.gorunurluk)).length
    },
    bilinmeyenler: Array.isArray(model.bilinmeyenler) ? model.bilinmeyenler.filter((x) => typeof x === 'string') : []
  };
}

// ---------------------------------------------------------------------------------------
// Liste ve ayrıntı
// ---------------------------------------------------------------------------------------

/** Projenin bağlam profilleri (tür + ad; alan DEĞERLERİ yok). @param {Veritabani} vt @param {string} projeId */
function baglamProfilAdlari(vt, projeId) {
  /** @type {Map<string, { tur: string; ad: string }>} */
  const harita = new Map();
  for (const p of baglamProfilleriniListele(vt, projeId)) harita.set(`${p.tur}\u0000${p.ad}`, { tur: p.tur, ad: p.ad });
  return [...harita.values()].sort((a, b) => a.tur.localeCompare(b.tur, 'tr') || a.ad.localeCompare(b.ad, 'tr'));
}

/** Ekran modelinin (tüm akışları) kullandığı ortak akış dosyaları ("<anahtar>.model.json"). @param {Nesne} model */
function kullanilanOrtakAkislar(model) {
  /** @type {Set<string>} */
  const dosyalar = new Set();
  const adimListeleri = [model.adimlar, ...(Array.isArray(model.akislar) ? model.akislar.map((/** @type {unknown} */ a) => nesneMi(a) ? a.adimlar : null) : [])];
  for (const adimlar of adimListeleri) {
    if (!Array.isArray(adimlar)) continue;
    for (const x of adimlar) if (nesneMi(x) && nesneMi(x.ortakAkis) && typeof x.ortakAkis.dosya === 'string') dosyalar.add(x.ortakAkis.dosya);
  }
  return dosyalar;
}

/**
 * Ortak akışın BAŞLANGIÇ EKRANI adayları ("Akışı kaydet" ve "Tekrar analiz et"; ortak akış kendi başına bir adreste açılmaz):
 * projenin adresi olan normal ekranları (ortak akış / alt model değil), ortak akışı kullananlar önde (sonra ada göre).
 * oncekiAdim: kullanan ekranın (varsayılan akış önce) ortak akış adımından hemen önceki adımın başlığı (ortak akış bu adımdan
 * sonra başlar; ilk adımsa null). Kullanmayan ekranda kullanir: false, oncekiAdim: null.
 * @param {Veritabani} vt @param {string} projeId @param {string} ortakEkranId
 * @returns {Array<{ id: string; ad: string; urlYolu: string; kullanir: boolean; oncekiAdim: string | null; girisGerekmez: boolean }>}
 */
export function ortakAkisBaslangicEkranlari(vt, projeId, ortakEkranId) {
  const ortak = ekranlariListele(vt, projeId).find((e) => e.id === ortakEkranId);
  if (!ortak) throw new DepoHatasi('Ekran bulunamadı.');
  const dosya = `${ortak.anahtar}.model.json`;
  /** @type {Array<{ id: string; ad: string; urlYolu: string; kullanir: boolean; oncekiAdim: string | null; girisGerekmez: boolean }>} */
  const liste = [];
  for (const e of ekranlariListele(vt, projeId)) {
    if (e.id === ortakEkranId || e.durum === 'silindi') continue;
    const m = ekranModeliGetir(vt, e.id);
    const model = m && nesneMi(m.model) ? /** @type {Nesne} */ (m.model) : null;
    if (!model || ['altModel', 'ortakAkis'].includes(String(model.tur)) || typeof model.ekranUrl !== 'string' || !model.ekranUrl) continue;
    let kullanir = false;
    /** @type {string | null} */
    let oncekiAdim = null;
    for (const a of akisListesi(model)) {
      const adimlar = /** @type {Nesne[]} */ (akisModeli(model, a.id)?.adimlar ?? []);
      const i = adimlar.findIndex((x) => nesneMi(x) && nesneMi(x.ortakAkis) && x.ortakAkis.dosya === dosya);
      if (i < 0) continue;
      kullanir = true;
      oncekiAdim = i > 0 ? String(adimlar[i - 1].baslik || adimlar[i - 1].id) : null;
      break;
    }
    liste.push({ id: e.id, ad: e.ad, urlYolu: model.ekranUrl, kullanir, oncekiAdim, girisGerekmez: model.girisGerekmez === true });
  }
  return liste.sort((a, b) => Number(b.kullanir) - Number(a.kullanir) || a.ad.localeCompare(b.ad, 'tr'));
}

/** Ortak akışın son seçilen başlangıç ekranı (ekran ayarları > tarama; yoksa null). @param {Veritabani} vt @param {string} ekranId */
export function sonBaslangicEkrani(vt, ekranId) {
  const t = (ekranAyarlariniGetir(vt, ekranId) ?? {}).tarama;
  return nesneMi(t) && typeof t.baslangicEkranId === 'string' ? t.baslangicEkranId : null;
}

/**
 * Ortak akışın istek dosyasındaki başlangıç ekranı: seçilen (adaylar içinde olmalı), yoksa son seçilen, yoksa ilk kullanan
 * ekran; hiçbiri yoksa null. @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {unknown} secilen
 */
function ortakAkisBaslangici(vt, projeId, ekranId, secilen) {
  const adaylar = ortakAkisBaslangicEkranlari(vt, projeId, ekranId);
  if (secilen !== undefined && secilen !== null && secilen !== '') {
    const b = adaylar.find((x) => x.id === secilen);
    if (!b) throw new DepoHatasi('Başlangıç ekranı bulunamadı (adresi olan bir ekran seçin).');
    return b;
  }
  const son = sonBaslangicEkrani(vt, ekranId);
  return adaylar.find((x) => x.id === son) ?? adaylar.find((x) => x.kullanir) ?? null;
}

/** @param {Veritabani} vt @param {string} projeId */
export function ekranListesi(vt, projeId) {
  acikAnahtar(vt);
  const sayilar = new Map(vt.tumu('SELECT ekran_id, COUNT(*) AS n FROM senaryolar WHERE proje_id = ? GROUP BY ekran_id', [projeId]).map((s) => [String(s.ekran_id), Number(s.n)]));
  // Ortak akışın kartındaki "K ekranda kullanılıyor": ekran modellerinin (tüm akışları) başvurduğu ortak akış dosyaları.
  /** @type {Map<string, number>} */
  const kullanim = new Map();
  const ekranlar = ekranlariListele(vt, projeId).map((e) => {
    const m = ekranModeliGetir(vt, e.id);
    const model = m && nesneMi(m.model) ? /** @type {Nesne} */ (m.model) : null;
    const env = model ? modelEnvanteri(model) : null;
    const { analiz } = analizDurumu(vt, e.id);
    const bekleyen = analiz.bekleyen;
    if (model && !['altModel', 'ortakAkis'].includes(String(model.tur))) for (const d of kullanilanOrtakAkislar(model)) kullanim.set(d, (kullanim.get(d) ?? 0) + 1);
    return {
      id: e.id, anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama,
      modelTuru: model ? (['altModel', 'ortakAkis'].includes(model.tur) ? model.tur : 'ekran') : null, modelSurumu: m ? m.surum : null,
      modelTarihi: m ? m.olusturulma : null, urlYolu: model && typeof model.ekranUrl === 'string' ? model.ekranUrl : null,
      adimSayisi: env ? env.adimlar.size : 0, alanSayisi: env ? env.alanlar.size : model && model.tur === 'altModel' ? modelEnvanteri({ adimlar: [{ id: 'x', bolumler: model.bolumler }] }).alanlar.size : 0,
      senaryoSayisi: sayilar.get(e.id) ?? 0,
      bekleyenAnaliz: bekleyen ? { id: bekleyen.id, bulguSayisi: Array.isArray(bekleyen.bulgular) ? bekleyen.bulgular.length : 0, zaman: bekleyen.zaman } : null,
      guncellenme: e.guncellenme, durum: e.durum, sira: e.sira
    };
  });
  for (const e of ekranlar) if (e.modelTuru === 'ortakAkis') Object.assign(e, { kullananSayisi: kullanim.get(`${e.anahtar}.model.json`) ?? 0 });
  // Silinmiş ekranlar (mezar taşı): geçmiş sonuçları için tutulur; geri yüklenebilir.
  const silinmisler = ekranlariListele(vt, projeId, { silinenlerDahil: true }).filter((e) => e.durum === 'silindi').map((e) => {
    const m = mezarTasiOku(vt.tek('SELECT silinme_json FROM ekranlar WHERE id = ?', [e.id])?.silinme_json);
    return {
      id: e.id, anahtar: e.anahtar, ad: e.ad, silinme: m?.zaman ?? e.guncellenme,
      sonucSayisi: Number(vt.tek('SELECT COUNT(*) AS n FROM kosu_sonuclari WHERE ekran_id = ?', [e.id])?.n ?? 0)
    };
  });
  return { ekranlar, silinmisEkranlar: silinmisler, baglamProfilleri: baglamProfilAdlari(vt, projeId) };
}

/** @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
export function ekranDetayi(vt, projeId, ekranId) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, projeId, ekranId);
  const surumler = vt.tumu('SELECT surum, model_json, aciklama, olusturulma FROM ekran_modelleri WHERE ekran_id = ? ORDER BY surum', [ekranId]);
  /** @type {Array<{ surum: number; aciklama: string | null; olusturulma: string; degisiklikSayisi: number | null; ozet: Nesne | null }>} */
  const gecmis = [];
  /** @type {Nesne | null} */
  let onceki = null;
  for (const s of surumler) {
    const model = /** @type {Nesne} */ (JSON.parse(String(s.model_json)));
    const bulgular = onceki && model.tur !== 'altModel' ? modelFarki(onceki, model) : null;
    gecmis.push({
      surum: Number(s.surum), aciklama: s.aciklama == null ? null : String(s.aciklama), olusturulma: String(s.olusturulma),
      degisiklikSayisi: bulgular ? bulgular.length : null, ozet: bulgular ? bulguOzeti(bulgular) : null
    });
    onceki = model;
  }
  const son = ekranModeliGetir(vt, ekranId);
  const mb = modelBaglami(vt, ekranId);
  const { analiz } = analizDurumu(vt, ekranId);
  const senaryoSayisi = Number(vt.tek('SELECT COUNT(*) AS n FROM senaryolar WHERE ekran_id = ?', [ekranId])?.n ?? 0);
  const model = son && nesneMi(son.model) ? /** @type {Nesne} */ (son.model) : null;
  return {
    ekran: { id: ekran.id, anahtar: ekran.anahtar, ad: ekran.ad, aciklama: ekran.aciklama, guncellenme: ekran.guncellenme, durum: ekran.durum, sira: ekran.sira },
    surum: son ? son.surum : null,
    modelTuru: model ? (['altModel', 'ortakAkis'].includes(model.tur) ? model.tur : 'ekran') : null,
    agac: model && model.tur !== 'altModel' ? modelAgaci(model, mb ? mb.altModeller : {}) : null,
    // Ekranın "Akış" sekmesi (akış diyagramı modelden çizilir; model değer içermez).
    model: model && model.tur !== 'altModel' ? model : null,
    // Model uyarıları (yalnız bilgi; model değişmez): ör. hiçbir yere bağlı olmayan koşullar (Model sekmesinde listelenir).
    uyarilar: model && model.tur !== 'altModel' ? bagsizKosulUyarilari(model) : [],
    altModel: model && model.tur === 'altModel' ? { ad: model.ad, aciklama: model.aciklama, kullananlar: model.kullananlar, agac: modelAgaci({ ...model, adimlar: [{ id: 'bolumler', sira: 1, baslik: String(model.ad), bolumler: model.bolumler }] }) } : null,
    // Ortak akış: başlangıç ekranı adayları ("Akışı kaydet" / "Tekrar analiz et"; kullananlar önde) ve son seçim.
    ortakAkis: model && model.tur === 'ortakAkis'
      ? { baslangicEkranlari: ortakAkisBaslangicEkranlari(vt, projeId, ekranId), sonBaslangicEkranId: sonBaslangicEkrani(vt, ekranId) } : null,
    gecmis: gecmis.reverse(),
    senaryoSayisi,
    analiz: {
      bekleyen: analiz.bekleyen ? { id: analiz.bekleyen.id, zaman: analiz.bekleyen.zaman, bulguSayisi: Array.isArray(analiz.bekleyen.bulgular) ? analiz.bekleyen.bulgular.length : 0 } : null,
      son: analiz.son ? { id: analiz.son.id, zaman: analiz.son.uygulanma ?? analiz.son.zaman, sonucSurum: analiz.son.sonucSurum ?? null } : null,
      reddedilenSayisi: analiz.reddedilenler.length,
      sonBaglamProfilleri: analiz.sonBaglamProfilleri,
      kanitlar: analiz.kanitlar.map((k) => ({ medyaId: k.medyaId, ad: k.ad, aciklama: k.aciklama ?? null, zaman: k.zaman, kaynak: k.kaynak ?? null }))
    },
    baglamProfilleri: baglamProfilAdlari(vt, projeId)
  };
}

/** Bir sürümün ağacı + bir önceki sürüme göre farkı. @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {number} surum */
export function surumAyrintisi(vt, projeId, ekranId, surum) {
  acikAnahtar(vt);
  ekranGetir(vt, projeId, ekranId);
  const k = ekranModeliGetir(vt, ekranId, surum);
  if (!k || !nesneMi(k.model)) throw new DepoHatasi('Model sürümü bulunamadı.');
  const onceki = surum > 1 ? ekranModeliGetir(vt, ekranId, surum - 1) : undefined;
  const model = /** @type {Nesne} */ (k.model);
  const bulgular = onceki && nesneMi(onceki.model) && model.tur !== 'altModel' ? modelFarki(/** @type {Nesne} */ (onceki.model), model) : [];
  return {
    surum: k.surum, aciklama: k.aciklama, olusturulma: k.olusturulma, oncekiSurum: onceki ? onceki.surum : null,
    bulgular: bulgular.map(bulguGorunumu), ozet: bulguOzeti(bulgular),
    agac: model.tur !== 'altModel' ? modelAgaci(model) : null
  };
}

/** Bulgunun arayüze giden hali (imza dahil; gizli değer yoktur — model yapısı ve seçenek adları). @param {Nesne} b */
function bulguGorunumu(b) {
  return {
    id: b.id, imza: b.imza, tur: b.tur, turEtiketi: /** @type {Record<string, string>} */ (BULGU_TUR_ETIKETLERI)[String(b.tur)] ?? b.tur,
    altTur: b.altTur ?? null, baslik: b.baslik, konum: b.konum ?? '', alanId: b.alanId ?? null, adimId: b.adimId ?? null,
    profil: b.profil ?? null, secenek: b.secenek ?? null, eski: b.eski ?? null, yeni: b.yeni ?? null
  };
}

// ---------------------------------------------------------------------------------------
// Ekran paketi: önizleme ve "Ekran ekle"
// ---------------------------------------------------------------------------------------

/**
 * Paketin önizlemesi (doğrulama + arayüz özeti). mod: 'yeni' (Ekran ekle; anahtar projede olmamalı,
 * ya da modeli olmayan mevcut ekran seçilmişse o) | 'analiz' (mevcut ekran için tekrar analiz) | 'degistir' (mevcut ekranın
 * modeli paketle değiştirilir: yeni sürüm; senaryolar korunur, etki olarak listelenir).
 * olusturulacak: "Ne oluşturulsun?" (yalnız mod 'yeni', ekran seçilmeden): 'ortakAkis' ise paket önce ortak akış paketine
 * çevrilir (sayfa-paketi.mjs > ortakAkisPaketineCevir); sonuç "Ortak akışlar" altına kaydedilir. Varsayılan 'ekran' (bugünkü davranış).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} ham
 * @param {{ ekranId?: string | null; mod?: 'yeni' | 'analiz' | 'degistir'; olusturulacak?: 'ekran' | 'ortakAkis' }} [secenekler]
 */
export function paketOnizle(vt, projeId, ham, secenekler = {}) {
  acikAnahtar(vt);
  if (secenekler.olusturulacak === 'ortakAkis' && ((secenekler.mod ?? 'yeni') !== 'yeni' || secenekler.ekranId)) {
    throw new DepoHatasi('Ortak akış yalnız yeni oluştururken seçilir (Ekranlar > Ekran ekle).');
  }
  const paket = secenekler.olusturulacak === 'ortakAkis' ? ortakAkisPaketineCevir(ham) : ham;
  // Projenin tabloları (ad + sütun; değer yok): öneri değerlerindeki ${Tablo.Sütun} başvuruları ve "Gereken tablo" durumu için.
  const projeTablolari = tablolariListele(vt, projeId).map((t) => ({ ad: t.ad, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli })) }));
  const d = sayfaPaketiniDogrula(paket, { altModelKaynagi: altModelKaynagi(vt, projeId), tablolar: projeTablolari });
  const hatalar = [...d.hatalar];
  const p = /** @type {Nesne} */ (nesneMi(paket) ? paket : {});
  const meta = /** @type {Nesne} */ (nesneMi(p.meta) ? p.meta : {});
  const ekranMeta = /** @type {Nesne} */ (nesneMi(meta.ekran) ? meta.ekran : {});
  const mod = secenekler.mod ?? 'yeni';
  const ekranlar = ekranlariListele(vt, projeId);
  const ayniAnahtar = ekranlar.find((e) => e.anahtar === ekranMeta.anahtar);
  /** @type {{ id: string; ad: string; anahtar: string; modelVar: boolean } | null} */
  let hedef = null;
  if (secenekler.ekranId) {
    const e = ekranGetir(vt, projeId, secenekler.ekranId);
    hedef = { id: e.id, ad: e.ad, anahtar: e.anahtar, modelVar: Boolean(ekranModeliGetir(vt, e.id)) };
    if (typeof ekranMeta.anahtar === 'string' && ekranMeta.anahtar !== e.anahtar) {
      hatalar.push({ yer: 'meta.ekran.anahtar', mesaj: `Paket başka bir ekrana ait ("${ekranMeta.anahtar}"); bu ekranın anahtarı "${e.anahtar}".` });
    }
    if (mod === 'yeni' && hedef.modelVar) hatalar.push({ yer: 'meta.ekran.anahtar', mesaj: `"${e.ad}" ekranının zaten modeli var; değişiklikler için "Tekrar analiz et / Paket yükle" kullanın.` });
    if ((mod === 'analiz' || mod === 'degistir') && !hedef.modelVar) hatalar.push({ yer: 'model', mesaj: `"${e.ad}" ekranının henüz modeli yok; paketi "Ekran ekle" ile yükleyin.` });
  } else if (mod === 'degistir') {
    hatalar.push({ yer: 'ekranId', mesaj: 'Modeli değiştirilecek ekran seçilmedi.' });
  } else if (mod === 'yeni' && ayniAnahtar) {
    const modelVar = Boolean(ekranModeliGetir(vt, ayniAnahtar.id));
    if (modelVar) {
      hatalar.push({ yer: 'meta.ekran.anahtar', mesaj: `"${ayniAnahtar.ad}" ekranı bu anahtarla ("${ayniAnahtar.anahtar}") zaten var. Mevcut ekranı güncellemek için Ekranlar > ${ayniAnahtar.ad} > "Paket yükle" kullanın.` });
    } else {
      // Modeli olmayan mevcut ekran: paket o ekrana ilk model olarak eklenir.
      hedef = { id: ayniAnahtar.id, ad: ayniAnahtar.ad, anahtar: ayniAnahtar.anahtar, modelVar: false };
    }
  }
  if (mod === 'yeni' && !hedef && typeof ekranMeta.anahtar === 'string'
    && ekranlariListele(vt, projeId, { silinenlerDahil: true }).some((e) => e.durum === 'silindi' && e.anahtar === ekranMeta.anahtar)) {
    d.uyarilar.push({ yer: 'meta.ekran.anahtar', mesaj: `Bu anahtarla ("${ekranMeta.anahtar}") silinmiş bir ekran var; paket YENİ bir ekran olarak eklenir (silinmiş ekranın geçmiş sonuçları ayrı kalır). Eski ekranı geri getirmek için Ekranlar > Silinmiş ekranlar > Geri yükle.` });
  }
  if (hatalar.length || !nesneMi(p.model)) {
    return { gecerli: false, hatalar, uyarilar: d.uyarilar, onizleme: null, hedef };
  }
  const model = /** @type {Nesne} */ (p.model);
  const agac = modelAgaci(model, d.altModeller);
  /** @type {ReturnType<typeof formSemasiOlustur> | null} */
  let sema = null;
  // "Beklenen" rozeti Senaryolar listesiyle aynı kuralla (senaryo-servisi.mjs > modelBaglami): varsayılan akış, ortak akış
  // adımları projedeki ortak akış modelleriyle AÇILMIŞ halde (ortak akışın son adımı / koşulu sağlanmayan adım sayılmaz).
  try {
    const akisModel = /** @type {Nesne} */ (akisModeli(model, null));
    const ortakAkislar = ortakAkisModelleri(akisModel, altModelKaynagi(vt, projeId));
    sema = formSemasiOlustur(ortakAkislariAc(akisModel, ortakAkislar).model, { ...d.altModeller, ...ortakAkislar });
  } catch { sema = null; }
  // Ortak akışın senaryosu yoktur (onu kullanan ekranların senaryoları koşar): önerileri listelenmez, eklenmez.
  const ortakAkis = model.tur === 'ortakAkis';
  const oneriler = /** @type {Nesne[]} */ (!ortakAkis && Array.isArray(p.senaryoOnerileri) ? p.senaryoOnerileri : []);
  const mevcutBasliklar = new Set(vt.tumu('SELECT baslik FROM senaryolar WHERE proje_id = ? AND ekran_id = ?', [projeId, hedef ? hedef.id : '']).map((s) => String(s.baslik)));
  const senaryolar = oneriler.map((o, i) => {
    const sorunlar = d.senaryoSorunlari[i] ?? [];
    const veri = nesneMi(o.veri) ? /** @type {Nesne} */ (o.veri) : {};
    const bs = /** @type {Nesne} */ (nesneMi(o.beklenenSonuc) ? o.beklenenSonuc : {});
    const cakisiyor = mevcutBasliklar.has(String(o.baslik));
    return {
      indeks: i, baslik: String(o.baslik), gerekce: String(o.gerekce ?? ''),
      beklenenSonuc: { tur: bs.tur === 'hata' ? 'hata' : 'basari', aciklama: String(bs.aciklama ?? '') },
      rozet: sema ? beklenenSonucEtiketi(sema, veri) : null,
      adimKapsami: Array.isArray(o.adimKapsami) ? o.adimKapsami : [],
      alanSayisi: Object.keys(veri).filter((k) => k !== 'baslik').length,
      sorunlar: [...sorunlar, ...(cakisiyor ? [{ alan: 'baslik', mesaj: 'Bu ekranda aynı başlıkta senaryo zaten var.' }] : [])],
      varsayilanSecili: !sorunlar.length && !cakisiyor
    };
  });
  const ayar = /** @type {Nesne} */ (nesneMi(p.gerekenAyarlar) ? p.gerekenAyarlar : {});
  const girisler = girisProfilleriniListele(vt, projeId);
  const tabloAdlari = new Set(projeTablolari.map((t) => t.ad.toLocaleLowerCase('tr')));
  const paketTabloAdlari = new Set((nesneMi(p.testVerisi) && Array.isArray(p.testVerisi.tablolar) ? p.testVerisi.tablolar : [])
    .filter(nesneMi).map((t) => String(t.ad ?? '').trim().toLocaleLowerCase('tr')));
  const baglamAdlari = new Set(baglamProfilAdlari(vt, projeId).map((b) => b.ad));
  /** @type {Array<{ anahtar: string; etiket: string; deger: string; durum: 'tamam' | 'eksik' | 'bilgi' | 'uyari'; aciklama: string; baglanti: string | null }>} */
  const gerekenAyarlar = [];
  if (ayar.girisGerekli === true) {
    gerekenAyarlar.push({
      anahtar: 'giris', etiket: 'Giriş gerekli', deger: 'Evet', durum: girisler.length ? 'tamam' : 'eksik',
      aciklama: girisler.length ? `${girisler.length} giriş profili tanımlı.` : 'Projede giriş profili yok.', baglanti: '#/ayarlar/giris'
    });
    const tur = String(ayar.ikiAsamaliDogrulama);
    if (tur !== 'yok') {
      const uyan = girisler.some((g) => g.ikiAsamaliTur === tur);
      gerekenAyarlar.push({
        anahtar: 'ikiAsamali', etiket: 'İki aşamalı doğrulama', deger: tur === 'totp' ? 'TOTP (uygulama kodu)' : tur === 'sms' ? 'SMS kodu' : 'Bilinmiyor',
        durum: tur === 'bilinmiyor' ? 'uyari' : uyan ? 'tamam' : 'eksik',
        aciklama: tur === 'bilinmiyor' ? 'İncelemede netleşmedi; giriş profilini kontrol edin.' : uyan ? 'Uygun giriş profili var.' : 'Bu türde 2FA ayarlı giriş profili yok.',
        baglanti: '#/ayarlar/giris'
      });
    }
  } else {
    gerekenAyarlar.push({ anahtar: 'giris', etiket: 'Giriş gerekli', deger: 'Hayır', durum: 'bilgi', aciklama: 'Sayfa girişsiz açılıyor.', baglanti: null });
  }
  if (ayar.captchaGoruldu === true) {
    gerekenAyarlar.push({ anahtar: 'captcha', etiket: 'CAPTCHA', deger: 'Görüldü', durum: 'uyari', aciklama: 'Otomasyon CAPTCHA\'yı geçmez: test ortamında kapatılmalı ya da muaf kullanıcı tanımlanmalı.', baglanti: '#/ayarlar/giris' });
  }
  // gerekenAyarlar.testVerisiTurleri (adı geriye uyum için korunur) = senaryoların gerektirdiği test verisi TABLOLARININ adları.
  for (const t of /** @type {string[]} */ (Array.isArray(ayar.testVerisiTurleri) ? ayar.testVerisiTurleri : [])) {
    const k = String(t).trim().toLocaleLowerCase('tr');
    const var_ = tabloAdlari.has(k);
    const paketle = !var_ && paketTabloAdlari.has(k);
    gerekenAyarlar.push({
      anahtar: `tur:${t}`, etiket: 'Gereken tablo', deger: t, durum: var_ ? 'tamam' : paketle ? 'bilgi' : 'eksik',
      aciklama: var_ ? 'Projede bu adla tablo var.' : paketle ? 'Paketin test verisi bölümünde; onaylarsanız yazılır.' : 'Projede bu adla test verisi tablosu yok.',
      baglanti: '#/veri'
    });
  }
  const baglamTurleri = new Set(baglamProfilAdlari(vt, projeId).map((b) => b.tur));
  for (const t of /** @type {string[]} */ (Array.isArray(ayar.baglamTurleri) ? ayar.baglamTurleri : [])) {
    const var_ = baglamTurleri.has(t);
    gerekenAyarlar.push({ anahtar: `baglam:${t}`, etiket: 'Bağlam türü', deger: t, durum: var_ ? 'tamam' : 'eksik', aciklama: var_ ? 'Projede bu türde bağlam profili var.' : 'Projede bu türde bağlam profili yok.', baglanti: '#/veri' });
  }
  const incelenen = /** @type {string[]} */ (Array.isArray(meta.baglamProfilleri) ? meta.baglamProfilleri : []);
  const ortamlar = ortamlariListele(vt, projeId).map((o) => ({ id: o.id, ad: o.ad, varsayilan: o.varsayilan }));
  // Modeli değiştir: ekranın senaryoları (korunur; yeni modele uymayan değerleri formda / koşuda hata olarak görünür) ve
  // korunacak diğer akışlar (yeni modelle birlikte doğrulanır).
  const degistirmeEtkisi = mod === 'degistir' && hedef ? degistirmeEtkisiHesapla(vt, projeId, hedef.id, model) : null;
  if (degistirmeEtkisi && degistirmeEtkisi.hatalar.length) {
    return { gecerli: false, hatalar: degistirmeEtkisi.hatalar, uyarilar: d.uyarilar, onizleme: null, hedef };
  }
  return {
    gecerli: true, hatalar: [], uyarilar: d.uyarilar, hedef,
    ...(degistirmeEtkisi ? { etki: { senaryolar: degistirmeEtkisi.senaryolar, korunanAkislar: degistirmeEtkisi.korunanAkislar, mevcutSurum: degistirmeEtkisi.mevcutSurum } } : {}),
    onizleme: {
      // Oluşacak kaydın türü: 'ortakAkis' ise arayüz senaryo / ortam seçimini göstermez, düğme "Ortak akışı oluştur" olur.
      modelTuru: ortakAkis ? 'ortakAkis' : model.tur === 'altModel' ? 'altModel' : 'ekran',
      meta: {
        ekran: { anahtar: ekranMeta.anahtar, ad: ekranMeta.ad, urlYolu: ekranMeta.urlYolu ?? null }, proje: meta.proje ?? null,
        olusturan: meta.olusturan, olusturulma: meta.olusturulma, not: meta.not ?? null,
        baglamProfilleri: incelenen.map((ad) => ({ ad, projedeVar: baglamAdlari.has(ad) }))
      },
      agac, senaryolar, gerekenAyarlar, bilinmeyenler: Array.isArray(p.bilinmeyenler) ? p.bilinmeyenler : [],
      kanitSayisi: Array.isArray(p.kanitlar) ? p.kanitlar.length : 0, ortamlar,
      // Paketin test verisi bölümü: yazılacak tablolar ve alan bağlantıları (kullanıcı seçer; onaysız yazılmaz).
      testVerisi: paketTestVerisiOnizle(vt, projeId, p, hedef ? hedef.id : null)
    }
  };
}

/**
 * Paketle değiştirilecek modelin son hâli: paketin modeli varsayılan akış olur; mevcut modelin DİĞER akışları korunur.
 * @param {Nesne} mevcut @param {Nesne} paketModeli @returns {Nesne}
 */
function degistirilenModel(mevcut, paketModeli) {
  // specDosyasi / pageObject paket yazmadıysa mevcut modelden korunur (yoksa Nöbetçi üretir).
  const yeni = kopya(kodAlanlariniTamamla(paketModeli, String(paketModeli.id ?? ''), mevcut));
  // Varsayılan akışın "baştaki ortak akışlar" ayarı (diyagramda seçilir) paket yazmadıysa korunur.
  if (yeni.bastakiOrtakAkislar === undefined && mevcut.bastakiOrtakAkislar !== undefined && yeni.tur !== 'ortakAkis') yeni.bastakiOrtakAkislar = mevcut.bastakiOrtakAkislar;
  const digerleri = Array.isArray(mevcut.akislar) ? mevcut.akislar.filter((a) => nesneMi(a) && a.varsayilan !== true) : [];
  if (digerleri.length) {
    const eskiVarsayilan = mevcut.akislar.find((a) => nesneMi(a) && a.varsayilan === true);
    yeni.akislar = [{ id: eskiVarsayilan ? eskiVarsayilan.id : 'ana', ad: eskiVarsayilan ? eskiVarsayilan.ad : 'Ana akış', varsayilan: true, adimlar: yeni.adimlar,
      ...(yeni.bastakiOrtakAkislar !== undefined ? { bastakiOrtakAkislar: yeni.bastakiOrtakAkislar } : {}) }, ...kopya(digerleri)];
    // Korunan akışların kullandığı koşullar ve senaryo ayarları (ör. "“Ek adım” dahil") pakette yoksa eski modelden taşınır.
    const eskiKosullar = nesneMi(mevcut.kosullar) ? mevcut.kosullar : {};
    yeni.kosullar = nesneMi(yeni.kosullar) ? yeni.kosullar : {};
    /** @type {Set<string>} */
    const ayarlar = new Set();
    const tara = (/** @type {unknown} */ d) => {
      if (Array.isArray(d)) { d.forEach(tara); return; }
      if (!nesneMi(d)) return;
      for (const [k, v] of Object.entries(d)) {
        if (k === 'kosul' && typeof v === 'string' && !(v in yeni.kosullar) && v in eskiKosullar) {
          yeni.kosullar[v] = kopya(eskiKosullar[v]);
          tara(yeni.kosullar[v]);
        } else if (k === 'senaryoAyari' && typeof v === 'string') ayarlar.add(v);
        else tara(v);
      }
    };
    tara(digerleri);
    const sd = nesneMi(yeni.senaryoDuzeyi) && Array.isArray(yeni.senaryoDuzeyi.alanlar) ? yeni.senaryoDuzeyi.alanlar : [];
    const eskiSd = nesneMi(mevcut.senaryoDuzeyi) && Array.isArray(mevcut.senaryoDuzeyi.alanlar) ? mevcut.senaryoDuzeyi.alanlar : [];
    for (const a of eskiSd) if (nesneMi(a) && ayarlar.has(a.id) && !sd.some((x) => nesneMi(x) && x.id === a.id)) sd.push(kopya(a));
    yeni.senaryoDuzeyi = { ...(nesneMi(yeni.senaryoDuzeyi) ? yeni.senaryoDuzeyi : {}), alanlar: sd };
  }
  return yeni;
}

/**
 * Modeli değiştir etkisi: senaryolar, korunan akışlar; yeni model (korunan akışlarla) doğrulanamazsa hatalar.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {Nesne} paketModeli
 */
function degistirmeEtkisiHesapla(vt, projeId, ekranId, paketModeli) {
  const kayit = ekranModeliGetir(vt, ekranId);
  const mevcut = kayit && nesneMi(kayit.model) ? /** @type {Nesne} */ (kayit.model) : {};
  const yeni = degistirilenModel(mevcut, paketModeli);
  /** @type {Array<{ yer: string; mesaj: string }>} */
  const hatalar = [];
  try {
    modeliDogrula(vt, projeId, yeni, 'model');
  } catch (h) {
    const maddeler = h instanceof EkranDogrulamaHatasi && Array.isArray(h.hatalar) ? h.hatalar : [{ yer: 'model', mesaj: h instanceof Error ? h.message : String(h) }];
    for (const m of maddeler) hatalar.push({ yer: 'korunanAkislar', mesaj: `Ekranın diğer akışları yeni modelle birlikte doğrulanamadı: ${typeof m === 'string' ? m : `${m.yer ?? ''} ${m.mesaj ?? ''}`.trim()}` });
  }
  const senaryolar = vt.tumu('SELECT id, baslik FROM senaryolar WHERE proje_id = ? AND ekran_id = ? ORDER BY baslik', [projeId, ekranId])
    .map((s) => ({ id: String(s.id), baslik: String(s.baslik) }));
  const korunanAkislar = Array.isArray(yeni.akislar) ? yeni.akislar.filter((a) => a.varsayilan !== true).map((a) => String(a.ad)) : [];
  return { hatalar, senaryolar, korunanAkislar, mevcutSurum: kayit ? kayit.surum : null };
}

/**
 * "Modeli değiştir": mevcut ekranın modeli paketle yeni sürüm olarak değiştirilir (tekrar analizin taşıyamadığı seçici,
 * bağlı liste, koşu değişiklikleri için). Senaryolar korunur; diğer akışlar korunur; isteğe bağlı olarak paketin senaryo
 * önerileri eklenir. onay yoksa yalnızca etki döner.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {unknown} paket
 * testVerisi: önizlemede onaylanan test verisi seçimi (paket-test-verisi.mjs); verilmezse test verisine yazılmaz.
 * @param {{ onay?: boolean; senaryoIndeksleri?: unknown; ortamIdleri?: unknown; medyaKlasoru: string; yapan?: string; testVerisi?: unknown }} secenekler
 */
export async function modeliPaketleDegistir(vt, projeId, ekranId, paket, secenekler) {
  const o = paketOnizle(vt, projeId, paket, { ekranId, mod: 'degistir' });
  if (!o.gecerli || !o.onizleme) throw new EkranDogrulamaHatasi(`Paket geçersiz (${o.hatalar.length} sorun).`, o.hatalar);
  if (secenekler.onay !== true) return { etki: o.etki ?? null };
  const p = /** @type {Nesne} */ (paket);
  const meta = /** @type {Nesne} */ (p.meta);
  const kayit = ekranModeliGetir(vt, ekranId);
  const yeni = degistirilenModel(kayit && nesneMi(kayit.model) ? /** @type {Nesne} */ (kayit.model) : {}, /** @type {Nesne} */ (p.model));
  modeliDogrula(vt, projeId, yeni, 'model');
  const ortamlar = ortamlariListele(vt, projeId);
  const ortamIdleri = Array.isArray(secenekler.ortamIdleri) ? [...new Set(secenekler.ortamIdleri.filter((x) => typeof x === 'string'))] : [];
  for (const id of ortamIdleri) if (!ortamlar.some((x) => x.id === id)) throw new DepoHatasi('Seçilen ortam bu projede yok.');
  const indeksler = Array.isArray(secenekler.senaryoIndeksleri)
    ? [...new Set(secenekler.senaryoIndeksleri.filter((x) => Number.isInteger(x) && x >= 0 && x < o.onizleme.senaryolar.length))] : [];
  if (indeksler.length && !ortamIdleri.length) throw new DepoHatasi('Senaryolar için en az bir ortam seçin.');
  for (const i of indeksler) {
    const s = o.onizleme.senaryolar[/** @type {number} */ (i)];
    if (s.sorunlar.length) throw new DepoHatasi(`"${s.baslik}" önerisi modele uymuyor; seçimden çıkarın ya da paketi düzeltin.`);
  }
  const kanitlar = Array.isArray(p.kanitlar) ? /** @type {Nesne[]} */ (p.kanitlar) : [];
  const kaynak = paketKaynagi(meta);
  const kanitDosyalari = await kanitDosyalariniYaz(vt, kanitlar, secenekler.medyaKlasoru);
  return vt.islem(() => {
    const kanitKayitlari = kanitSatirlariniEkle(vt, kanitDosyalari, `Ekran paketi (${kaynak})`);
    const ekran = ekranGetir(vt, projeId, ekranId);
    const { surum } = ekranModeliEkle(vt, { ekranId, model: yeni, aciklama: `Model paketle değiştirildi (${kaynak})` });
    const { ayarlar, analiz } = analizDurumu(vt, ekranId);
    analizYaz(vt, ekran, ayarlar, {
      ...analiz, sonBaglamProfilleri: Array.isArray(meta.baglamProfilleri) ? meta.baglamProfilleri : analiz.sonBaglamProfilleri,
      kanitlar: [...analiz.kanitlar, ...kanitKayitlari]
    });
    const senaryoIdleri = senaryoOnerileriniEkle(vt, projeId, ekranId, yeni, /** @type {Nesne[]} */ (p.senaryoOnerileri ?? []), /** @type {number[]} */ (indeksler), ortamIdleri, meta, secenekler.yapan);
    const { tablolar, baglanan } = paketTestVerisiniYaz(vt, projeId, ekranId, p, secenekler.testVerisi);
    return { ekranId, surum, senaryoIdleri, kanitSayisi: kanitKayitlari.length, testVerisi: { tablolar, baglanan } };
  });
}

/**
 * Kanıt görüntülerini medya deposuna ŞİFRELİ yazar (yalnızca dosyalar; satırlar kanitSatirlariniEkle ile
 * veritabanı işleminin içinde eklenir — işlem başarısız olursa dosyalar sahipsiz kalır ve medya
 * temizliği onları siler).
 * @param {Veritabani} vt @param {Nesne[]} kanitlar @param {string} medyaKlasoru
 */
async function kanitDosyalariniYaz(vt, kanitlar, medyaKlasoru) {
  if (!kanitlar.length) return [];
  const anahtar = medyaAnahtariniHazirla(vt);
  /** @type {Array<{ dosya: string; boyut: number; ad: string; aciklama: string | null }>} */
  const dosyalar = [];
  try {
    for (const k of kanitlar) {
      const tampon = kanitVerisiniCoz(k.veri);
      if (!tampon) continue;
      const { dosya, boyut } = await medyaSifrele(anahtar, medyaKlasoru, tampon);
      dosyalar.push({ dosya, boyut, ad: String(k.ad).slice(0, 120), aciklama: typeof k.aciklama === 'string' ? k.aciklama.slice(0, 500) : null });
    }
  } finally {
    anahtar.fill(0);
  }
  return dosyalar;
}

/** Medya satırları (sonuc_id yok, tur 'ekran_goruntusu'). @param {Veritabani} vt @param {Awaited<ReturnType<typeof kanitDosyalariniYaz>>} dosyalar @param {string} kaynak */
function kanitSatirlariniEkle(vt, dosyalar, kaynak) {
  return dosyalar.map((d, sira) => {
    const id = randomUUID();
    const zaman = simdi();
    vt.calistir('INSERT INTO medya (id, sonuc_id, sira, tur, ad, icerik_turu, boyut, dosya, olusturulma) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)',
      [id, sira, 'ekran_goruntusu', d.ad, 'image/png', d.boyut, d.dosya, zaman]);
    return { medyaId: id, ad: d.ad, aciklama: d.aciklama, zaman, kaynak };
  });
}

const paketKaynagi = (/** @type {Nesne} */ meta) => `${String(meta.olusturan ?? 'bilinmeyen')}, ${String(meta.olusturulma ?? '').slice(0, 10)}`;

/**
 * "Ekran ekle": ekran (yoksa) + model v1 + seçilen senaryo önerileri + şifreli kanıtlar. Senaryolar
 * Koşuda KAPALI başlar (test kodu henüz yok; öneriler gözden geçirilmeden koşuya girmez).
 * @param {Veritabani} vt @param {string} projeId @param {unknown} paket
 * testVerisi: önizlemede onaylanan test verisi seçimi (paket-test-verisi.mjs); verilmezse test verisine yazılmaz.
 * olusturulacak: 'ortakAkis' → paket ortak akış paketine çevrilip "Ortak akışlar" altına kaydedilir (senaryo önerisi eklenmez;
 * ekranlara ekleme otomatik yapılmaz — "Ekranlara ekle…" ya da diyagramdaki "+ > Ortak akış").
 * @param {{ senaryoIndeksleri?: unknown; ortamIdleri?: unknown; medyaKlasoru: string; yapan?: string; testVerisi?: unknown; olusturulacak?: 'ekran' | 'ortakAkis' }} secenekler
 */
export async function sayfaEkle(vt, projeId, ham, secenekler) {
  const paket = secenekler.olusturulacak === 'ortakAkis' ? ortakAkisPaketineCevir(ham) : ham;
  const o = paketOnizle(vt, projeId, paket, { mod: 'yeni' });
  if (!o.gecerli || !o.onizleme) throw new EkranDogrulamaHatasi(`Paket geçersiz (${o.hatalar.length} sorun).`, o.hatalar);
  const p = /** @type {Nesne} */ (paket);
  const meta = /** @type {Nesne} */ (p.meta);
  const ekranMeta = /** @type {Nesne} */ (meta.ekran);
  // specDosyasi / pageObject pakette isteğe bağlı: yazılmadıysa Nöbetçi üretir.
  const model = /** @type {Nesne} */ (kodAlanlariniTamamla(/** @type {Nesne} */ (p.model), String(ekranMeta.anahtar)));
  const ortamlar = ortamlariListele(vt, projeId);
  const ortamIdleri = Array.isArray(secenekler.ortamIdleri) ? [...new Set(secenekler.ortamIdleri.filter((x) => typeof x === 'string'))] : [];
  for (const id of ortamIdleri) if (!ortamlar.some((x) => x.id === id)) throw new DepoHatasi('Seçilen ortam bu projede yok.');
  const indeksler = Array.isArray(secenekler.senaryoIndeksleri)
    ? [...new Set(secenekler.senaryoIndeksleri.filter((x) => Number.isInteger(x) && x >= 0 && x < o.onizleme.senaryolar.length))] : [];
  if (indeksler.length && !ortamIdleri.length) throw new DepoHatasi('Senaryolar için en az bir ortam seçin.');
  for (const i of indeksler) {
    const s = o.onizleme.senaryolar[/** @type {number} */ (i)];
    if (s.sorunlar.length) throw new DepoHatasi(`"${s.baslik}" önerisi modele uymuyor; seçimden çıkarın ya da paketi düzeltin.`);
  }
  const kanitlar = Array.isArray(p.kanitlar) ? /** @type {Nesne[]} */ (p.kanitlar) : [];
  const kaynak = paketKaynagi(meta);
  // Önce şifreli kanıt dosyaları (veritabanı işleminin dışında, async); sonra tek işlemde kayıtlar.
  const kanitDosyalari = await kanitDosyalariniYaz(vt, kanitlar, secenekler.medyaKlasoru);
  return vt.islem(() => {
    const kanitKayitlari = kanitSatirlariniEkle(vt, kanitDosyalari, `Ekran paketi (${kaynak})`);
    const ekranId = o.hedef ? o.hedef.id : ekranKaydet(vt, {
      projeId, anahtar: String(ekranMeta.anahtar), ad: String(ekranMeta.ad), aciklama: typeof model.aciklama === 'string' ? model.aciklama : null
    });
    const ekran = ekranGetir(vt, projeId, ekranId);
    const { surum } = ekranModeliEkle(vt, { ekranId, model, aciklama: `${model.tur === 'ortakAkis' ? 'Ortak akış olarak' : 'Ekran paketiyle'} oluşturuldu (${kaynak})` });
    const { ayarlar, analiz } = analizDurumu(vt, ekranId);
    analizYaz(vt, ekran, ayarlar, {
      ...analiz, sonBaglamProfilleri: Array.isArray(meta.baglamProfilleri) ? meta.baglamProfilleri : [],
      kanitlar: [...analiz.kanitlar, ...kanitKayitlari]
    });
    const senaryoIdleri = senaryoOnerileriniEkle(vt, projeId, ekranId, model, /** @type {Nesne[]} */ (p.senaryoOnerileri), /** @type {number[]} */ (indeksler), ortamIdleri, meta, secenekler.yapan);
    const { tablolar, baglanan } = paketTestVerisiniYaz(vt, projeId, ekranId, p, secenekler.testVerisi);
    return { ekranId, surum, senaryoIdleri, kanitSayisi: kanitKayitlari.length, testVerisi: { tablolar, baglanan } };
  });
}

/**
 * Seçilen önerileri senaryo olarak ekler (veri güdümlü biçim; hassas adlı alanlar şifreli; Koşuda kapalı).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {Nesne} model @param {Nesne[]} oneriler
 * @param {number[]} indeksler @param {string[]} ortamIdleri @param {Nesne} meta @param {string} [yapan]
 */
function senaryoOnerileriniEkle(vt, projeId, ekranId, model, oneriler, indeksler, ortamIdleri, meta, yapan) {
  if (!indeksler.length) return [];
  const mb = modelBaglami(vt, ekranId);
  const sema = mb ? formSemasiOlustur(mb.model, mb.altModeller) : null;
  const adlar = hassasAdlar(vt, projeId);
  const spec = String(model.specDosyasi ?? '').replace(/^tests\//, '');
  const ekran = ekranGetir(vt, projeId, ekranId);
  const veriKaynagi = { dosya: ekran.anahtar, yol: 'senaryolar' };
  const mevcut = vt.tumu('SELECT icerik_json FROM senaryolar WHERE proje_id = ?', [projeId]).map((s) => senaryoKaynagi(JSON.parse(String(s.icerik_json))));
  /** @type {string[]} */
  const idler = [];
  indeksler.forEach((i, sira) => {
    const o = oneriler[i];
    const baslik = String(o.baslik).trim();
    if (mevcut.some((k) => k && k.dosya === spec && k.ad === baslik)) throw new DepoHatasi(`"${baslik}" başlıklı senaryo zaten var.`);
    /** @type {Nesne} */
    const veri = { ...kopya(o.veri), baslik };
    if (sema && Array.isArray(o.adimKapsami)) {
      for (const k of sema.adimKapsami) veri[k.ayar] = k.adimlar.some((a) => /** @type {string[]} */ (o.adimKapsami).includes(a));
    }
    const sifreli = adliAlanlariDonustur(veri, adlar, (m) => sifrele(vt, m));
    /** @type {Record<string, Nesne>} */
    const ortamlar = {};
    for (const ortamId of ortamIdleri) ortamlar[ortamId] = { sira, veri: sifreli };
    const bs = /** @type {Nesne} */ (nesneMi(o.beklenenSonuc) ? o.beklenenSonuc : {});
    idler.push(depoSenaryoKaydet(vt, {
      projeId, ekranId, baslik, kosuyaDahil: false, yapan,
      icerik: {
        kaynak: { dosya: spec, ad: baslik }, veri: veriKaynagi, ortamlar,
        paket: { kaynak: 'sayfa-paketi', olusturan: String(meta.olusturan ?? ''), olusturulma: String(meta.olusturulma ?? ''), gerekce: String(o.gerekce ?? ''), beklenenSonuc: { tur: bs.tur, aciklama: bs.aciklama } }
      }
    }));
  });
  return idler;
}

// ---------------------------------------------------------------------------------------
// Tekrar analiz: paket yükle → bulgular → kararlar
// ---------------------------------------------------------------------------------------

/**
 * Mevcut ekran için yeni paketi yükler: bulgular hesaplanır, daha önce REDDEDİLEN (aynı imzalı)
 * bulgular gizlenir, analiz "bekleyen" olarak saklanır (öncekinin yerine geçer).
 * testVerisi: önizlemede onaylanan test verisi seçimi. Tablolar hemen yazılır (kullanıcı test verisi bölümünde onayladı); alan
 * BAĞLANTILARI bulgu kararına tabidir: bu analizde bulgusu olan ya da henüz modelde olmayan alanın bağlantısı bekleyen analizle
 * saklanır (baglantilar) ve analizUygula'da yalnız o alanın bir bulgusu KABUL edilirse yazılır (reddedilen alanın bağı yazılmaz).
 * Bulgusu olmayan, modelde zaten var olan alanın bağlantısı hemen yazılır.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {unknown} paket @param {{ medyaKlasoru: string; testVerisi?: unknown }} secenekler
 */
export async function analizYukle(vt, projeId, ekranId, paket, secenekler) {
  const o = paketOnizle(vt, projeId, paket, { mod: 'analiz', ekranId });
  if (!o.gecerli) throw new EkranDogrulamaHatasi(`Paket geçersiz (${o.hatalar.length} sorun).`, o.hatalar);
  const p = /** @type {Nesne} */ (paket);
  const meta = /** @type {Nesne} */ (p.meta);
  const mevcut = ekranModeliGetir(vt, ekranId);
  if (!mevcut || !nesneMi(mevcut.model)) throw new DepoHatasi('Ekranın modeli yok.');
  const tum = modelFarki(/** @type {Nesne} */ (mevcut.model), /** @type {Nesne} */ (p.model));
  const { analiz } = analizDurumu(vt, ekranId);
  const reddedilen = new Set(analiz.reddedilenler.map((r) => String(r.imza)));
  const gizlenen = tum.filter((b) => reddedilen.has(b.imza));
  const bulgular = tum.filter((b) => !reddedilen.has(b.imza));
  const kanitDosyalari = await kanitDosyalariniYaz(vt, Array.isArray(p.kanitlar) ? /** @type {Nesne[]} */ (p.kanitlar) : [], secenekler.medyaKlasoru);
  const ekran = ekranGetir(vt, projeId, ekranId);
  // Bulgusu olan ya da güncel modelde olmayan alanların bağlantıları bulgu kararını bekler.
  const bulguluAlanlar = new Set(bulgular.map((b) => b.alanId).filter((x) => typeof x === 'string'));
  const mevcutAlanlar = modelAlanlari(mevcut.model);
  const ertele = (/** @type {string} */ alanId) => bulguluAlanlar.has(alanId) || !mevcutAlanlar.has(alanId);
  return vt.islem(() => {
    const kanitKayitlari = kanitSatirlariniEkle(vt, kanitDosyalari, `Tekrar analiz (${paketKaynagi(meta)})`);
    const testVerisi = paketTestVerisiniYaz(vt, projeId, ekranId, p, secenekler.testVerisi, { ertele });
    const { ayarlar, analiz: guncel } = analizDurumu(vt, ekranId);
    const kayit = {
      id: randomUUID(), zaman: simdi(), tabanSurum: mevcut.surum, durum: 'bekliyor',
      meta: { olusturan: meta.olusturan, olusturulma: meta.olusturulma, baglamProfilleri: meta.baglamProfilleri, not: meta.not ?? null, urlYolu: nesneMi(meta.ekran) ? meta.ekran.urlYolu : null },
      model: p.model, bulgular: bulgular.map(bulguGorunumu), gizlenenSayisi: gizlenen.length,
      gizlenenler: gizlenen.map((b) => ({ id: b.id, baslik: b.baslik, tur: b.tur })),
      gerekenAyarlar: o.onizleme ? o.onizleme.gerekenAyarlar : [], bilinmeyenler: Array.isArray(p.bilinmeyenler) ? p.bilinmeyenler : [],
      senaryoOneriSayisi: Array.isArray(p.senaryoOnerileri) ? p.senaryoOnerileri.length : 0,
      kanitlar: kanitKayitlari.map((k) => k.medyaId),
      // Bulgu kararını bekleyen alan → tablo sütunu bağlantıları (tablo kimliğiyle; analizUygula yazar).
      baglantilar: testVerisi.ertelenen
    };
    // Bulgu yoksa bekleyen analiz oluşmaz (model güncel; önceki bekleyen de geçersiz olur; bekleyen bağlantılar da düşer);
    // kanıtlar ve profil seçimi yine saklanır.
    analizYaz(vt, ekran, ayarlar, {
      ...guncel, bekleyen: bulgular.length ? kayit : null, sonBaglamProfilleri: Array.isArray(meta.baglamProfilleri) ? meta.baglamProfilleri : guncel.sonBaglamProfilleri,
      kanitlar: [...guncel.kanitlar, ...kanitKayitlari]
    });
    const bekleyenBag = bulgular.length ? Object.keys(testVerisi.ertelenen).length : 0;
    return {
      analizId: bulgular.length ? kayit.id : null, bulguSayisi: bulgular.length, gizlenenSayisi: gizlenen.length, uyarilar: o.uyarilar,
      testVerisi: { tablolar: testVerisi.tablolar, baglanan: testVerisi.baglanan, bekleyenBaglanti: bekleyenBag }
    };
  });
}

/**
 * Senaryoların etki hesabı için çözülmüş özetleri (kasa açık). Veri, senaryonun ilk verili ortamından.
 * @param {Veritabani} vt @param {string} ekranId @param {Nesne | null} model
 */
function senaryoOzetleri(vt, ekranId, model) {
  /** @type {ReturnType<typeof formSemasiOlustur> | null} */
  let sema = null;
  // "Beklenen" etiketi Senaryolar listesi ve paket önizlemesiyle aynı kuralla: varsayılan akış, ortak akış adımları açılmış
  // (alt / ortak akış modelleri modelBaglami'ndan; ortak akışın son adımı / koşulu sağlanmayan adım sayılmaz).
  try {
    const altModeller = modelBaglami(vt, ekranId)?.altModeller ?? {};
    sema = model ? formSemasiOlustur(ortakAkislariAc(/** @type {Nesne} */ (akisModeli(model, null)), altModeller).model, altModeller) : null;
  } catch { sema = null; }
  const profilAlani = sema ? tumFormAlanlari(sema).find((a) => a.tip === 'profil') ?? null : null;
  return vt.tumu('SELECT id, baslik, icerik_json, kosuya_dahil FROM senaryolar WHERE ekran_id = ? ORDER BY baslik', [ekranId]).map((s) => {
    const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
    const ortamlar = nesneMi(icerik.ortamlar) ? /** @type {Record<string, Nesne>} */ (icerik.ortamlar) : {};
    const ilk = Object.values(ortamlar).find((x) => nesneMi(x) && nesneMi(x.veri));
    const veri = ilk ? /** @type {Nesne} */ (zarflariCoz(vt, ilk.veri)) : {};
    const kurallar = nesneMi(icerik.alanKurallari) && Array.isArray(icerik.alanKurallari.mutlakaGorunmeli) ? icerik.alanKurallari.mutlakaGorunmeli.filter((x) => typeof x === 'string') : [];
    const profil = profilAlani && profilAlani.tip === 'profil'
      ? (typeof veri[profilAlani.anahtar] === 'string' && veri[profilAlani.anahtar] ? String(veri[profilAlani.anahtar]) : profilAlani.varsayilanProfil)
      : null;
    return {
      id: String(s.id), baslik: String(s.baslik), kosuyaDahil: s.kosuya_dahil === 1, veriGudumlu: veriGudumluMu(icerik),
      veri, mutlakaGorunmeli: kurallar, baglamProfili: profil ?? null, sema, paketten: nesneMi(icerik.paket)
    };
  });
}

/**
 * Bekleyen (yoksa son uygulanan) analiz + bulgular + etki paneli.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 */
export function analizGetir(vt, projeId, ekranId) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, projeId, ekranId);
  const { analiz } = analizDurumu(vt, ekranId);
  const a = analiz.bekleyen ?? analiz.son;
  const mevcut = ekranModeliGetir(vt, ekranId);
  const temel = { ekran: { id: ekran.id, ad: ekran.ad, anahtar: ekran.anahtar }, guncelSurum: mevcut ? mevcut.surum : null, reddedilenSayisi: analiz.reddedilenler.length };
  if (!a || !mevcut || !nesneMi(mevcut.model)) return { ...temel, analiz: null };
  const bulgular = /** @type {Nesne[]} */ (Array.isArray(a.bulgular) ? a.bulgular : []);
  const paketModeli = /** @type {Nesne} */ (a.model);
  // Etki: bekleyen analizde güncel modele göre; uygulanmışta taban sürümden yeni modele göre.
  const taban = a.durum === 'uygulandi' && typeof a.tabanSurum === 'number' ? ekranModeliGetir(vt, ekranId, a.tabanSurum) : mevcut;
  const senaryolar = senaryoOzetleri(vt, ekranId, /** @type {Nesne} */ (mevcut.model));
  const etki = etkiHesapla(bulgular, /** @type {Nesne} */ (taban && nesneMi(taban.model) ? taban.model : mevcut.model), paketModeli, senaryolar);
  const kararlar = nesneMi(a.kararlar) ? /** @type {Record<string, string>} */ (a.kararlar) : {};
  // Bağlam profiline göre görünürlük (bilgi): paketteki gözlem.
  const pbg = nesneMi(paketModeli.baglamGorunurlugu) ? /** @type {Nesne} */ (paketModeli.baglamGorunurlugu) : {};
  const pbgAlanlar = nesneMi(pbg.alanlar) ? /** @type {Record<string, unknown>} */ (pbg.alanlar) : {};
  // Uygulanmış analizde "eksik değer" listesi GÜNCEL senaryolara göre yeniden hesaplanır (toplu atamadan sonra azalır).
  return {
    ...temel,
    analiz: {
      id: a.id, durum: a.durum, zaman: a.zaman, uygulanma: a.uygulanma ?? null, tabanSurum: a.tabanSurum ?? null, sonucSurum: a.sonucSurum ?? null,
      meta: a.meta, gizlenenSayisi: a.gizlenenSayisi ?? 0, gizlenenler: a.gizlenenler ?? [], gerekenAyarlar: a.gerekenAyarlar ?? [],
      bilinmeyenler: a.bilinmeyenler ?? [], senaryoOneriSayisi: a.senaryoOneriSayisi ?? 0, kanitlar: a.kanitlar ?? [],
      profiller: Array.isArray(pbg.profiller) ? pbg.profiller : [],
      bulgular: bulgular.map((b) => ({ ...b, karar: kararlar[String(b.id)] ?? null, baglam: b.alanId && nesneMi(pbgAlanlar[String(b.alanId)]) ? pbgAlanlar[String(b.alanId)] : null })),
      ozet: bulguOzeti(bulgular), etki, senaryoSayisi: senaryolar.length,
      atlananlar: a.atlananlar ?? []
    }
  };
}

/**
 * Kararları uygular: YALNIZCA kabul edilen bulgularla yeni model sürümü (hiç kabul yoksa sürüm
 * oluşmaz); reddedilenler imzasıyla hatırlanır (aynı değişiklik bir dahaki pakette gösterilmez);
 * karar verilmeyenler hatırlanmaz. Yeni model ortak doğrulayıcıdan geçmezse hiçbir şey yazılmaz.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 * @param {{ analizId: unknown; kabul: unknown; red: unknown; yapan?: string }} girdi
 */
export function analizUygula(vt, projeId, ekranId, girdi) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, projeId, ekranId);
  const { ayarlar, analiz } = analizDurumu(vt, ekranId);
  const a = analiz.bekleyen;
  if (!a || a.id !== girdi.analizId) throw new DepoHatasi('Bekleyen analiz bulunamadı (başka bir pencerede uygulanmış ya da iptal edilmiş olabilir).');
  const mevcut = ekranModeliGetir(vt, ekranId);
  if (!mevcut || !nesneMi(mevcut.model)) throw new DepoHatasi('Ekranın modeli yok.');
  if (mevcut.surum !== a.tabanSurum) throw new DepoHatasi(`Model bu analizden sonra değişmiş (sürüm ${a.tabanSurum} → ${mevcut.surum}); paketi yeniden yükleyin.`);
  const bulgular = /** @type {Nesne[]} */ (a.bulgular);
  const idler = new Set(bulgular.map((b) => String(b.id)));
  const liste = (/** @type {unknown} */ d) => (Array.isArray(d) ? [...new Set(d.filter((x) => typeof x === 'string' && idler.has(x)))] : []);
  const kabul = liste(girdi.kabul);
  const red = liste(girdi.red).filter((x) => !kabul.includes(x));
  if (!kabul.length && !red.length) throw new DepoHatasi('En az bir bulgu için karar verin (Kabul et / Reddet).');
  const uygulama = kabul.length ? bulgulariUygula(/** @type {Nesne} */ (mevcut.model), /** @type {Nesne} */ (a.model), kabul) : null;
  if (uygulama && uygulama.atlananlar.length) {
    throw new EkranDogrulamaHatasi(`${uygulama.atlananlar.length} kabul edilen bulgu uygulanamadı.`, uygulama.atlananlar.map((x) => ({
      yer: String(bulgular.find((b) => b.id === x.id)?.baslik ?? x.id), mesaj: x.neden
    })));
  }
  if (uygulama) modeliDogrula(vt, projeId, uygulama.model, `${ekran.anahtar}.model.json`);
  return vt.islem(() => {
    const meta = /** @type {Nesne} */ (nesneMi(a.meta) ? a.meta : {});
    const sonuc = uygulama
      ? ekranModeliEkle(vt, { ekranId, model: uygulama.model, aciklama: `Tekrar analiz (${paketKaynagi(meta)}): ${kabul.length} bulgu kabul, ${red.length} red` })
      : null;
    const zaman = simdi();
    const eskiRed = analiz.reddedilenler.filter((r) => !red.some((id) => bulgular.find((b) => b.id === id)?.imza === r.imza));
    const yeniRed = red.map((id) => {
      const b = /** @type {Nesne} */ (bulgular.find((x) => x.id === id));
      return { imza: b.imza, tur: b.tur, baslik: b.baslik, zaman };
    });
    /** @type {Record<string, string>} */
    const kararlar = {};
    for (const id of kabul) kararlar[id] = 'kabul';
    for (const id of red) kararlar[id] = 'red';
    const { baglantilar: bekleyenBaglar, ...kalan } = a;
    const son = { ...kalan, durum: 'uygulandi', uygulanma: zaman, sonucSurum: sonuc ? sonuc.surum : null, kararlar };
    analizYaz(vt, ekran, ayarlar, { ...analiz, bekleyen: null, son, reddedilenler: [...eskiRed, ...yeniRed].slice(-REDDEDILEN_EN_COK) });
    // Bulgu kararını bekleyen alan bağlantıları: yalnız alanının bir bulgusu KABUL edilen ve yeni modelde bulunan alanlar yazılır
    // (reddedilen / karar verilmeyen alanın bağı yazılmaz). analizYaz'dan SONRA: ayarlar ekran ayarlarını yeniden yazar.
    const kabulAlanlari = new Set(kabul.map((id) => bulgular.find((b) => b.id === id)?.alanId).filter((x) => typeof x === 'string'));
    const sonAlanlar = modelAlanlari(uygulama ? uygulama.model : mevcut.model);
    const yazilacak = Object.fromEntries(Object.entries(nesneMi(bekleyenBaglar) ? /** @type {Record<string, Nesne>} */ (bekleyenBaglar) : {})
      .filter(([alanId]) => kabulAlanlari.has(alanId) && sonAlanlar.has(alanId)));
    if (Object.keys(yazilacak).length) ekranAlanBaglariniKaydet(vt, projeId, ekranId, { ...ekranAlanBaglari(vt, ekranId), ...yazilacak });
    return {
      surum: sonuc ? sonuc.surum : mevcut.surum, yeniSurum: Boolean(sonuc), kabul: kabul.length, red: red.length, kararsiz: bulgular.length - kabul.length - red.length,
      baglanan: Object.keys(yazilacak).length
    };
  });
}

/** Bekleyen analizi iptal eder (kararlar hatırlanmaz). @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {unknown} analizId */
export function analizIptal(vt, projeId, ekranId, analizId) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, projeId, ekranId);
  const { ayarlar, analiz } = analizDurumu(vt, ekranId);
  if (!analiz.bekleyen || analiz.bekleyen.id !== analizId) throw new DepoHatasi('Bekleyen analiz bulunamadı.');
  analizYaz(vt, ekran, ayarlar, { ...analiz, bekleyen: null });
  return { iptal: true };
}

/** Reddedilen bulguların hafızasını temizler. @param {Veritabani} vt @param {string} projeId @param {string} ekranId */
export function reddedilenleriUnut(vt, projeId, ekranId) {
  acikAnahtar(vt);
  const ekran = ekranGetir(vt, projeId, ekranId);
  const { ayarlar, analiz } = analizDurumu(vt, ekranId);
  const sayi = analiz.reddedilenler.length;
  analizYaz(vt, ekran, ayarlar, { ...analiz, reddedilenler: [] });
  return { unutulan: sayi };
}

// ---------------------------------------------------------------------------------------
// Etki paneli: toplu değer atama
// ---------------------------------------------------------------------------------------

/**
 * Seçilen senaryolarda bir senaryo anahtarına değer atar (tüm ortam verilerinde). Anahtar GÜNCEL
 * modelde senaryoda ayarlanabilir bir alan olmalı; seçenekli alanda değer seçeneklerden biri olmalı.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 * @param {{ anahtar: unknown; deger: unknown; senaryoIdler: unknown; yapan?: string }} girdi
 */
export function topluDegerAta(vt, projeId, ekranId, girdi) {
  acikAnahtar(vt);
  ekranGetir(vt, projeId, ekranId);
  const mevcut = ekranModeliGetir(vt, ekranId);
  if (!mevcut || !nesneMi(mevcut.model)) throw new DepoHatasi('Ekranın modeli yok.');
  if (typeof girdi.anahtar !== 'string' || !girdi.anahtar) throw new DepoHatasi('"anahtar" zorunlu.');
  const alan = [...modelEnvanteri(/** @type {Nesne} */ (mevcut.model)).alanlar.values()].map((k) => k.alan)
    .find((a) => a.yapilandirma === 'senaryo' && senaryoAnahtari(a) === girdi.anahtar);
  if (!alan) throw new DepoHatasi(`"${girdi.anahtar}" güncel modelde senaryoda ayarlanabilen bir alan değil (önce ilgili bulguyu kabul edin).`);
  let deger = girdi.deger;
  if (alan.tip === 'onayKutusu') {
    if (typeof deger !== 'boolean') throw new DepoHatasi('Onay kutusu için değer true/false olmalı.');
  } else if (alan.tip === 'sayi') {
    if (typeof deger === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(deger.trim())) deger = Number(deger.trim().replace(',', '.'));
    if (typeof deger !== 'number' || !Number.isFinite(deger)) throw new DepoHatasi('Sayı alanı için geçerli bir sayı girin.');
  } else {
    if (typeof deger !== 'string' || !deger.trim()) throw new DepoHatasi('Değer boş olamaz.');
    deger = deger.trim();
    const secenekler = Array.isArray(alan.secenekler) ? alan.secenekler.filter(nesneMi).map((s) => String(s.senaryoDegeri ?? s.deger)) : null;
    if (secenekler && secenekler.length && !secenekler.includes(/** @type {string} */ (deger))) throw new DepoHatasi(`Değer seçeneklerden biri olmalı: ${secenekler.join(', ')}.`);
  }
  if (!Array.isArray(girdi.senaryoIdler) || !girdi.senaryoIdler.length || girdi.senaryoIdler.length > 5000) throw new DepoHatasi('En az bir senaryo seçin.');
  const idler = [...new Set(girdi.senaryoIdler.filter((x) => typeof x === 'string'))];
  const adlar = hassasAdlar(vt, projeId);
  let guncellenen = 0;
  vt.islem(() => {
    for (const id of idler) {
      const s = senaryoGetir(vt, id);
      if (!s || s.projeId !== projeId || s.ekranId !== ekranId) throw new DepoHatasi('Senaryo bu ekrana ait değil.');
      if (!veriGudumluMu(s.icerik)) throw new DepoHatasi(`"${s.baslik}" senaryosunun biçimi desteklenmiyor (kodlu testlerden kalma).`);
      const icerik = kopya(s.icerik);
      let degisti = false;
      for (const o of Object.values(/** @type {Record<string, Nesne>} */ (icerik.ortamlar ?? {}))) {
        if (!nesneMi(o) || !nesneMi(o.veri)) continue;
        const veri = /** @type {Nesne} */ (zarflariCoz(vt, o.veri));
        if (JSON.stringify(veri[/** @type {string} */ (girdi.anahtar)]) === JSON.stringify(deger)) continue;
        veri[/** @type {string} */ (girdi.anahtar)] = deger;
        o.veri = adliAlanlariDonustur(veri, adlar, (m) => sifrele(vt, m));
        degisti = true;
      }
      if (!degisti) continue;
      depoSenaryoKaydet(vt, { ...s, icerik, yapan: girdi.yapan });
      guncellenen++;
    }
  });
  return { guncellenen };
}

// ---------------------------------------------------------------------------------------
// Yapay zekâ aracı için analiz / istek dosyası (gizli değer YOK)
// ---------------------------------------------------------------------------------------

const DOSYA_TURLERI = Object.freeze({
  yorumla: 'Bulguları ve modeli yorumla',
  'tekrar-analiz': 'Sayfayı yeniden incele ve yeni ekran paketi üret',
  'eksik-kombinasyon': 'Eksik kombinasyonlar için senaryo öner'
});

/**
 * Senaryo özeti (gizli değer yok): yalnızca seçenek / onay kutusu / bağlam profili alanlarının
 * değerleri; diğer alanlar için "dolu" bilgisi.
 * @param {ReturnType<typeof senaryoOzetleri>[number]} s
 */
function senaryoGizliDegersizOzet(s) {
  /** @type {Record<string, unknown>} */
  const alanlar = {};
  const sema = s.sema;
  const tanimlar = sema ? tumFormAlanlari(sema) : [];
  for (const [k, v] of Object.entries(s.veri)) {
    if (k === 'baslik' || bosMu(v)) continue;
    const t = tanimlar.find((a) => a.anahtar === k);
    const acik = t && ((t.tip === 'secim' && !t.hassas) || t.tip === 'onayKutusu' || t.tip === 'profil');
    const kapsam = sema && sema.adimKapsami.some((x) => x.ayar === k);
    alanlar[k] = acik || kapsam || typeof v === 'boolean' ? v : '(dolu)';
  }
  return {
    baslik: s.baslik, kosuyaDahil: s.kosuyaDahil, baglamProfili: s.baglamProfili,
    beklenenSonuc: sema ? beklenenSonucEtiketi(sema, s.veri)?.metin ?? null : null,
    mutlakaGorunmeli: s.mutlakaGorunmeli, alanlar, paketten: s.paketten
  };
}

/**
 * Yapay zekâ aracına verilecek analiz/istek dosyasını yazar: <klasor>/<ekran anahtarı>-<YYYYMMDD-HHMMSS>[-tur].json.
 * İçerik: ekran bilgisi, güncel model, (varsa) bekleyen/son analizin bulguları ve etki özeti, senaryo
 * özetleri (gizli değer yok), seçilen bağlam profillerinin ADLARI ve istek açıklaması.
 * tur 'tekrar-analiz' ise seçilen profiller ekran için "son seçim" olarak saklanır.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 * @param {{ tur: unknown; baglamProfilleri?: unknown; klasor: string; projeKoku: string; bulguId?: unknown; baslangicEkranId?: unknown }} girdi ortak akışta baslangicEkranId: araç bu ekranın adresinden başlar
 */
export function claudeDosyasiYaz(vt, projeId, ekranId, girdi) {
  acikAnahtar(vt);
  const tur = typeof girdi.tur === 'string' && girdi.tur in DOSYA_TURLERI ? /** @type {keyof typeof DOSYA_TURLERI} */ (girdi.tur) : null;
  if (!tur) throw new DepoHatasi('Geçersiz dosya türü.');
  const ekran = ekranGetir(vt, projeId, ekranId);
  const mevcut = ekranModeliGetir(vt, ekranId);
  const model = mevcut && nesneMi(mevcut.model) ? /** @type {Nesne} */ (mevcut.model) : null;
  const projeAdlari = new Set(baglamProfilAdlari(vt, projeId).map((b) => b.ad));
  const secilen = Array.isArray(girdi.baglamProfilleri) ? [...new Set(girdi.baglamProfilleri.filter((x) => typeof x === 'string' && projeAdlari.has(x)))] : null;
  if (tur === 'tekrar-analiz' && projeAdlari.size && (!secilen || !secilen.length)) throw new DepoHatasi('En az bir bağlam profili seçin.');
  const { ayarlar, analiz } = analizDurumu(vt, ekranId);
  const a = analiz.bekleyen ?? analiz.son;
  const senaryolar = senaryoOzetleri(vt, ekranId, model);
  const etki = a && model && Array.isArray(a.bulgular) ? etkiHesapla(/** @type {Nesne[]} */ (a.bulgular), model, /** @type {Nesne} */ (a.model), senaryolar) : [];
  const proje = projeGetir(vt, projeId);
  // Ortak akış kendi başına bir adreste açılmaz: araç BAŞLANGIÇ EKRANININ adresinden başlar (seçilen / son seçilen / ilk kullanan).
  const ortakAkis = Boolean(model && model.tur === 'ortakAkis');
  const baslangic = ortakAkis ? ortakAkisBaslangici(vt, projeId, ekranId, girdi.baslangicEkranId) : null;
  const baslangicYeri = baslangic
    ? (baslangic.oncekiAdim ? `“${baslangic.oncekiAdim}” adımından sonra başlar` : baslangic.kullanir ? 'ekran açılınca başlar' : 'ekranın gerekli adımları (ör. hesaplama) yapıldıktan sonra başlar')
    : '';
  const baslangicMetni = !ortakAkis ? ''
    : baslangic
      ? `"${ekran.ad}" bir ORTAK AKIŞTIR (kendi adresi yok): "${baslangic.ad}" ekranının adresini (${baslangic.urlYolu}) aç; ortak akış bu ekranda ${baslangicYeri}. Oraya kadar ilerle, yalnızca ortak akışın adımlarını incele. `
      : `"${ekran.ad}" bir ORTAK AKIŞTIR (kendi adresi yok) ve henüz hiçbir ekranda kullanılmıyor: ortak akışın açıldığı ekranı bana sor. `;
  const ortakPaketKurali = ortakAkis
    ? 'Üreteceğin paketin model.tur değeri "ortakAkis" olmalı (semaSurumu 2; ekranUrl, specDosyasi, pageObject yazma; içine alt model ya da başka ortak akış koyma); meta.ekran.urlYolu verilmeyebilir, meta.ekran.anahtar ortak akışın anahtarıdır. '
    : '';
  // Ekranın mevcut alan bağlantıları ve bağlı tabloların adları / sütunları (DEĞER YOK; gizli sütunun yalnız adı ve işareti):
  // Araç yeni pakette aynı tablo ve sütun adlarını kullansın.
  const baglar = etkinAlanBaglari(vt, ekranId);
  const tumTablolar = Object.keys(baglar).length ? tablolariListele(vt, projeId) : [];
  const alanHaritasi = model ? modelAlanlari(model) : new Map();
  const bagliTablolar = tumTablolar.filter((t) => Object.values(baglar).some((b) => b.tablo === t.id));
  const testVerisi = {
    alanBaglari: Object.entries(baglar).map(([alanId, b]) => {
      const t = tumTablolar.find((x) => x.id === b.tablo);
      const a = alanHaritasi.get(alanId);
      return { alanId, alanEtiketi: a ? paketAlanEtiketi(a) : alanId, tablo: t ? t.ad : '(silinmiş tablo)', sutun: b.sutun, ...(b.etiket ? { etiket: b.etiket } : {}) };
    }),
    tablolar: bagliTablolar.map((t) => ({
      ad: t.ad, ...(t.kaynak?.tabloTuru ? { tur: t.kaynak.tabloTuru } : {}),
      sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, ...(s.gizli ? { gizli: true } : {}) })), satirSayisi: t.satirlar.length
    }))
  };
  const zaman = new Date();
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const damga = `${zaman.getFullYear()}${iki(zaman.getMonth() + 1)}${iki(zaman.getDate())}-${iki(zaman.getHours())}${iki(zaman.getMinutes())}${iki(zaman.getSeconds())}`;
  const icerik = {
    tur: 'nobetci-analiz-dosyasi', surum: 1, olusturulma: zaman.toISOString(),
    istek: { tur, aciklama: DOSYA_TURLERI[tur], baglamProfilleri: secilen ?? analiz.sonBaglamProfilleri },
    talimat: tur === 'tekrar-analiz'
      ? `${baslangicMetni}Sayfayı listelenen bağlam profilleriyle yeniden incele ve ${BICIM_ATFI} yeni bir ekran paketi üret. ${ortakPaketKurali}${INCELEME_KURALLARI} ${MEVCUT_TABLO_KURALI} Paket gizli/kişisel veri içermemeli.`
      : tur === 'eksik-kombinasyon'
        ? `Modeldeki seçenek/koşul kombinasyonlarını mevcut senaryolarla karşılaştır; kapsanmayan anlamlı kombinasyonlar için ${BICIM_ATFI} (senaryoOnerileri bölümü) öneriler üret (yalnızca öneri; gizli değer yok).`
        : 'Bulguları ve etkilerini değerlendir: hangileri gerçek ekran değişikliği, hangileri inceleme hatası olabilir; kabul/red ve senaryo güncellemesi için öneri yaz.',
    proje: proje ? proje.ad : null,
    ekran: { anahtar: ekran.anahtar, ad: ekran.ad, urlYolu: model && typeof model.ekranUrl === 'string' ? model.ekranUrl : null, modelSurumu: mevcut ? mevcut.surum : null },
    // Ortak akış: başlangıç ekranı (adres + ortak akışın hangi adımdan sonra başladığı) ve paket kuralı.
    ...(ortakAkis ? {
      ortakAkis: {
        baslangicEkrani: baslangic ? { ad: baslangic.ad, urlYolu: baslangic.urlYolu, kullanir: baslangic.kullanir, oncekiAdim: baslangic.oncekiAdim } : null,
        paketKurali: ortakPaketKurali.trim()
      }
    } : {}),
    model,
    analiz: a ? {
      durum: a.durum, zaman: a.zaman, paket: a.meta, bulgular: a.bulgular,
      kararlar: nesneMi(a.kararlar) ? a.kararlar : {},
      etki: etki.map((x) => ({ bulguId: x.bulguId, tur: x.tur, mesaj: x.mesaj, senaryoSayisi: x.senaryolar.length, senaryolar: x.senaryolar.map((s) => s.baslik) }))
    } : null,
    senaryolar: senaryolar.map(senaryoGizliDegersizOzet),
    testVerisi,
    ...(girdi.bulguId ? { odakBulgu: String(girdi.bulguId) } : {})
  };
  mkdirSync(girdi.klasor, { recursive: true });
  const ad = `${ekran.anahtar}-${damga}${tur === 'yorumla' ? '' : `-${tur}`}.json`;
  const yol = join(girdi.klasor, ad);
  writeFileSync(yol, `${JSON.stringify(icerik, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (tur === 'tekrar-analiz' && secilen) analizYaz(vt, ekran, ayarlar, { ...analiz, sonBaglamProfilleri: secilen });
  const goreli = relative(girdi.projeKoku, yol);
  const gosterilen = goreli.startsWith('..') ? yol : goreli.split(sep).join('/');
  const cumle = tur === 'tekrar-analiz' && ortakAkis
    ? `${gosterilen} dosyasını oku; ${baslangicMetni}Şu bağlam profilleriyle yeniden incele: ${(secilen ?? []).join(', ') || '—'}. ${BICIM_ATFI} yeni bir ekran paketi JSON dosyası üret. ${ortakPaketKurali}${INCELEME_KURALLARI} ${MEVCUT_TABLO_KURALI}`
    : tur === 'tekrar-analiz'
    ? `${gosterilen} dosyasını oku; "${ekran.ad}" sayfasını (${model && typeof model.ekranUrl === 'string' ? model.ekranUrl : 'yol dosyada'}) şu bağlam profilleriyle yeniden incele: ${(secilen ?? []).join(', ')}. ${BICIM_ATFI} yeni bir ekran paketi JSON dosyası üret. ${INCELEME_KURALLARI} ${MEVCUT_TABLO_KURALI}`
    : tur === 'eksik-kombinasyon'
      ? `${gosterilen} dosyasını oku; "${ekran.ad}" ekranının modelini ve mevcut senaryolarını karşılaştırıp eksik kombinasyonlar için ${BICIM_ATFI} senaryo önerileri üret.`
      : `${gosterilen} dosyasını oku; "${ekran.ad}" ekranının bulgularını, etkilerini ve senaryo özetlerini yorumla; kabul/red ve senaryo güncellemesi için önerilerini yaz.${ortakAkis ? ` ${baslangicMetni.trim()}` : ''}`;
  return { yol: gosterilen, tamYol: yol, cumle };
}
