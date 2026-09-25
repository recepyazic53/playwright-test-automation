// EKRAN YÖNETİMİ (genel) — Ekranlar > ⋯ menüsü: yeniden adlandır, düzenle (URL yolu, liste sırası), devre dışı bırak /
// etkinleştir, kalıcı sil (+ isteğe bağlı: geçmiş sonuçlar, projedeki test kodu) ve silinmiş ekranı geri yükle.
//
// Durum (ekranlar.durum, şema v8 — AÇIK sütunlar; koşu listesi filtresi kasa kilitliyken de okuyabilsin):
//   'etkin'      — normal.
//   'devre_disi' — geri alınabilir: sol listelerde varsayılan olarak gizli; senaryoları "Koşuyu başlat"a, ▷ / Dene'ye,
//                  model koşucusuna ve varsayılan Playwright listesine (playwright.config.ts > grepInvert) girmez.
//                  Geçmiş sonuçlar Sonuçlar'da "devre dışı" rozetiyle görünür.
//   'silindi'    — MEZAR TAŞI: ekranın model sürümleri, senaryoları (değişiklik geçmişi KORUNUR), şifreli senaryo/kanıt
//                  dosyaları silinmiştir; satır yalnızca (a) korunan geçmiş sonuçlar "silinmiş ekran" diye görünsün ve
//                  (b) test kodu KALDIRILMADIYSA koddaki testleri koşulardan hariç kalsın (kod kaldırılana ya da ekran
//                  geri yüklenene kadar) diye durur. Sonuçlar da silinmiş ve kod da kalmamışsa satır tamamen silinir.
//   Kaynak eşlemeleri (kaynak_eslemeleri) SİLİNMEZ: yeniden aktarım silinen ekranı/senaryoları geri getirmez.
//
// Test kodunun kaldırılması: YALNIZCA <kod kökü>/tests/scenarios/** altındaki dosyalar (gerçek yol denetimi; "..",
// mutlak yol, sembolik bağla dışarı çıkış reddedilir). Önce kuru çalıştırma (önizleme) tam dosya listesini gösterir;
// silme isteği aynı listeyi (beklenenDosyalar) taşımak zorundadır — liste değiştiyse hiçbir şey silinmez. Dosyalar diskten
// silinir (git "deleted" gösterir; git ile geri alınabilir). Kod kökü sunucuda enjekte edilir (testler geçici klasör verir).
//
// Tüm değişiklikler degisiklik_gecmisi'ne (varlik_turu 'ekran') yazılır. Kasa AÇIK olmalıdır (ekranHaricKapsami hariç).
// NOT: import.meta KULLANILMAZ. Tipler: ekran-yonetimi.d.mts.

import { existsSync, lstatSync, readdirSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  DepoHatasi, ekranAyarlariniGetir, ekranKaydet, ekranModeliEkle, ekranModeliGetir, ekranlariListele, gecmisYaz,
  kaynakEslemeleriniListele, senaryoSil
} from '../veritabani/depo.mjs';
import { acikAnahtar } from '../kasa.mjs';
import { medyaDosyasiniGuvenliSil } from '../medya.mjs';
import { referanslariBul } from '../dosyalar/senaryo-dosyalari.mjs';
import { MODEL_SPEC_DOSYASI } from '../senaryolar/model-kosusu.mjs';
import { senaryoKaynagi } from '../senaryolar/senaryo-servisi.mjs';
import { modeliDogrula } from './ekran-servisi.mjs';
import { mezarTasiOku } from './mezar-tasi.mjs';

export { mezarTasiOku };

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Nesne */
/** @typedef {import('../veritabani/depo.mjs').Ekran} Ekran */
/** @typedef {{ dosyalar: string[]; anahtarlar: string[] }} KodKapsami */
/** @typedef {{ zaman: string; kod: KodKapsami; kaldirilanDosyalar: string[]; sonuclarSilindi: boolean; onceki: Nesne }} MezarTasi */

export const AD_EN_UZUN = 120;
export const ACIKLAMA_EN_UZUN = 1000;
export const URL_YOLU_EN_UZUN = 500;
/** Kod kaldırmada tek seferde silinebilecek en fazla dosya (yanlışlıkla dev bir klasörün silinmesine karşı). */
export const KOD_DOSYASI_EN_COK = 200;
/** Test kodunun kaldırılabileceği TEK klasör (testDir'e — tests/ — göre). */
export const KOD_KLASORU = 'scenarios';

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const simdi = () => new Date().toISOString();
const kucuk = (/** @type {string} */ m) => m.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------------------
// Ortak
// ---------------------------------------------------------------------------------------

/**
 * Ekran (silinmiş olanlar dahil — silinenlerDahil false ise mezar taşı "bulunamadı" sayılır).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {{ silinenlerDahil?: boolean }} [s]
 */
function ekranBul(vt, projeId, ekranId, s = {}) {
  const e = ekranlariListele(vt, projeId, { silinenlerDahil: true }).find((x) => x.id === ekranId);
  if (!e || (e.durum === 'silindi' && !s.silinenlerDahil)) throw new DepoHatasi('Ekran bulunamadı.');
  return e;
}

/** @param {Veritabani} vt @param {string} ekranId */
function mezarTasiGetir(vt, ekranId) {
  return mezarTasiOku(vt.tek('SELECT silinme_json FROM ekranlar WHERE id = ?', [ekranId])?.silinme_json);
}

/** Geçmiş kaydı için ekranın açık alanları (ayarlar — şifreli — yazılmaz). @param {Ekran} e */
const ekranAnlik = (e) => ({ anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama, durum: e.durum, sira: e.sira });

/**
 * Senaryoların Playwright kaynağı (dosya + başlık): içerikteki kaynak ya da aktarım eşlemesindeki "<dosya>::<başlık>".
 * @param {Veritabani} vt @param {string} projeId
 */
function senaryoKaynaklari(vt, projeId) {
  const eslemeler = new Map(kaynakEslemeleriniListele(vt, projeId, 'senaryo').map((e) => [e.varlikId, e.kaynakAnahtari]));
  return vt.tumu('SELECT id, ekran_id, icerik_json FROM senaryolar WHERE proje_id = ?', [projeId]).map((s) => {
    const k = senaryoKaynagi(JSON.parse(String(s.icerik_json)));
    const a = eslemeler.get(String(s.id));
    const i = a ? a.indexOf('::') : -1;
    const kaynak = k ?? (a && i > 0 ? { dosya: a.slice(0, i), ad: a.slice(i + 2) } : null);
    return { id: String(s.id), ekranId: s.ekran_id == null ? null : String(s.ekran_id), kaynak };
  });
}

// ---------------------------------------------------------------------------------------
// Koşu listesi kapsamı (kasa GEREKMEZ; veri-oku.mjs "durum" kipi kullanır)
// ---------------------------------------------------------------------------------------

/**
 * Devre dışı ve silinmiş (mezar taşı) ekranların koşulardan hariç tutulacak testleri:
 *  - dosyalar: TÜM testleri bu ekranlara ait spec dosyaları (testDir'e göre; kodla sonradan eklenen testler de hariç),
 *  - anahtarlar: etkin bir ekranla PAYLAŞILAN dosyalardaki bu ekranların senaryoları ("<dosya>::<başlık>").
 * Model koşucusunun ortak spec'i (her model senaryosu) dosya düzeyinde hariç tutulmaz (model spec'i kendisi süzer).
 * @param {Veritabani} vt @param {string} projeId @returns {KodKapsami}
 */
export function ekranHaricKapsami(vt, projeId) {
  const ekranlar = vt.tumu('SELECT id, durum, silinme_json FROM ekranlar WHERE proje_id = ?', [projeId]);
  const pasif = new Set(ekranlar.filter((e) => e.durum !== 'etkin').map((e) => String(e.id)));
  if (!pasif.size) return { dosyalar: [], anahtarlar: [] };
  /** @type {Map<string, Set<string>>} dosya → sahip ekranlar ('' = ekransız) */
  const sahipler = new Map();
  const senaryolar = senaryoKaynaklari(vt, projeId);
  for (const s of senaryolar) {
    if (!s.kaynak || s.kaynak.dosya === MODEL_SPEC_DOSYASI) continue;
    if (!sahipler.has(s.kaynak.dosya)) sahipler.set(s.kaynak.dosya, new Set());
    /** @type {Set<string>} */ (sahipler.get(s.kaynak.dosya)).add(s.ekranId ?? '');
  }
  const tamamenPasif = (/** @type {string} */ dosya) => [...(sahipler.get(dosya) ?? [])].every((x) => pasif.has(x));
  /** @type {Set<string>} */
  const dosyalar = new Set();
  /** @type {Set<string>} */
  const anahtarlar = new Set();
  for (const s of senaryolar) {
    if (!s.kaynak || !s.ekranId || !pasif.has(s.ekranId) || s.kaynak.dosya === MODEL_SPEC_DOSYASI) continue;
    if (tamamenPasif(s.kaynak.dosya)) dosyalar.add(s.kaynak.dosya);
    else anahtarlar.add(`${s.kaynak.dosya}::${s.kaynak.ad}`);
  }
  for (const e of ekranlar) {
    if (e.durum !== 'silindi') continue;
    const m = mezarTasiOku(e.silinme_json);
    if (!m) continue;
    for (const d of m.kod.dosyalar) if (d !== MODEL_SPEC_DOSYASI && tamamenPasif(d)) dosyalar.add(d);
    for (const a of m.kod.anahtarlar) anahtarlar.add(a);
  }
  return { dosyalar: [...dosyalar].sort(), anahtarlar: [...anahtarlar].sort() };
}

/**
 * "Kodu kaldırılmış" denetiminin yok sayacağı dosyalar: silinmiş ekranların (mezar taşı) kodu kaldırılan ya da hâlâ hariç
 * tutulan dosyaları (bu dosyalara bağlı eski satırlar — ör. yedekten gelenler — tekrar uyarı üretmesin).
 * @param {Veritabani} vt @param {string} projeId
 */
export function silinmisEkranDosyalari(vt, projeId) {
  /** @type {Set<string>} */
  const sonuc = new Set();
  for (const e of vt.tumu("SELECT silinme_json FROM ekranlar WHERE proje_id = ? AND durum = 'silindi'", [projeId])) {
    const m = mezarTasiOku(e.silinme_json);
    if (!m) continue;
    for (const d of [...m.kaldirilanDosyalar, ...m.kod.dosyalar]) sonuc.add(d);
  }
  return sonuc;
}

/** Ekran etkin mi? (senaryo çalıştırma / Dene denetimi). Ekran yoksa (ekransız senaryo) true. @param {Veritabani} vt @param {string | null} ekranId */
export function ekranEtkinMi(vt, ekranId) {
  if (!ekranId) return true;
  const s = vt.tek('SELECT durum FROM ekranlar WHERE id = ?', [ekranId]);
  return !s || s.durum === 'etkin';
}

// ---------------------------------------------------------------------------------------
// Yeniden adlandır · düzenle · sırala · devre dışı bırak / etkinleştir · geri yükle
// ---------------------------------------------------------------------------------------

/**
 * Görünen ad + açıklama (ekran ANAHTARI değişmez; senaryolar/sonuçlar kimlikle bağlı kalır).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {{ ad: unknown; aciklama?: unknown; yapan?: string }} girdi
 */
export function ekranYenidenAdlandir(vt, projeId, ekranId, girdi) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId);
  const ad = typeof girdi.ad === 'string' ? girdi.ad.replace(/\s+/g, ' ').trim() : '';
  if (!ad) throw new DepoHatasi('Ekran adı boş olamaz.');
  if (ad.length > AD_EN_UZUN) throw new DepoHatasi(`Ekran adı en fazla ${AD_EN_UZUN} karakter olabilir.`);
  if (/[\u0000-\u001f\u007f]/.test(ad)) throw new DepoHatasi('Ekran adı kontrol karakteri içeremez.');
  if (girdi.aciklama !== undefined && girdi.aciklama !== null && typeof girdi.aciklama !== 'string') throw new DepoHatasi('"aciklama" metin olmalıdır.');
  const aciklamaHam = typeof girdi.aciklama === 'string' ? girdi.aciklama.trim() : girdi.aciklama === undefined ? e.aciklama ?? '' : '';
  if (aciklamaHam.length > ACIKLAMA_EN_UZUN) throw new DepoHatasi(`Açıklama en fazla ${ACIKLAMA_EN_UZUN} karakter olabilir.`);
  const aciklama = aciklamaHam || null;
  const cakisan = ekranlariListele(vt, projeId).find((x) => x.id !== e.id && kucuk(x.ad) === kucuk(ad));
  if (cakisan) throw new DepoHatasi(`"${cakisan.ad}" adında başka bir ekran var; farklı bir ad seçin.`);
  if (ad === e.ad && aciklama === e.aciklama) return { degisti: false, ad, aciklama };
  return vt.islem(() => {
    vt.calistir('UPDATE ekranlar SET ad = ?, aciklama = ?, guncellenme = ? WHERE id = ?', [ad, aciklama, simdi(), e.id]);
    gecmisYaz(vt, {
      varlikTuru: 'ekran', varlikId: e.id, islem: 'guncelle', yapan: girdi.yapan, onceki: ekranAnlik(e), sonraki: { ...ekranAnlik(e), ad, aciklama },
      aciklama: ad !== e.ad ? `Yeniden adlandırıldı: "${e.ad}" → "${ad}"` : 'Açıklama değişti'
    });
    return { degisti: true, ad, aciklama };
  });
}

/**
 * URL yolu (ortamın taban adresine göre; ör. "/satis/odeme/"). Model sürümleri değişmez olduğundan yeni bir model
 * sürümü eklenir (yalnızca ekranUrl farklı; ortak doğrulayıcıdan geçer). Modeli olmayan ekranda / alt modelde yol yoktur.
 * @param {unknown} ham
 */
export function urlYoluDogrula(ham) {
  const yol = typeof ham === 'string' ? ham.trim() : '';
  if (!yol) throw new DepoHatasi('URL yolu boş olamaz.');
  if (yol.length > URL_YOLU_EN_UZUN) throw new DepoHatasi(`URL yolu en fazla ${URL_YOLU_EN_UZUN} karakter olabilir.`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(yol) || yol.startsWith('//')) throw new DepoHatasi('Tam adres değil, ortama göre YOL girin (ör. "/satis/odeme/"); ortam adresi Ayarlar\'dan gelir.');
  if (!yol.startsWith('/')) throw new DepoHatasi('URL yolu "/" ile başlamalıdır.');
  if (/[\s\u0000-\u001f\u007f\\]/.test(yol)) throw new DepoHatasi('URL yolu boşluk, ters bölü ya da kontrol karakteri içeremez.');
  return yol;
}

/**
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {{ urlYolu: unknown; yapan?: string }} girdi
 */
export function ekranDuzenle(vt, projeId, ekranId, girdi) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId);
  const mevcut = ekranModeliGetir(vt, e.id);
  if (!mevcut || !nesneMi(mevcut.model)) throw new DepoHatasi('Bu ekranın modeli yok; URL yolu modelle birlikte gelir (Sayfa paketi yükleyin ya da ekranı tarayın).');
  const model = /** @type {Nesne} */ (mevcut.model);
  if (model.tur === 'altModel') throw new DepoHatasi('Alt modellerin URL yolu yoktur.');
  if (model.tur === 'ortakAkis') throw new DepoHatasi('Ortak akışların URL yolu yoktur (eklendikleri ekranın sayfasında koşarlar).');
  const yol = urlYoluDogrula(girdi.urlYolu);
  if (model.ekranUrl === yol) return { degisti: false, surum: mevcut.surum, urlYolu: yol };
  const yeni = { ...model, ekranUrl: yol };
  modeliDogrula(vt, projeId, yeni, `${e.anahtar}.model.json`);
  return vt.islem(() => {
    const { surum } = ekranModeliEkle(vt, { ekranId: e.id, model: yeni, aciklama: `URL yolu değişti: ${String(model.ekranUrl ?? '—')} → ${yol}` });
    gecmisYaz(vt, {
      varlikTuru: 'ekran', varlikId: e.id, islem: 'guncelle', yapan: girdi.yapan,
      onceki: { ...ekranAnlik(e), urlYolu: model.ekranUrl ?? null, modelSurumu: mevcut.surum }, sonraki: { ...ekranAnlik(e), urlYolu: yol, modelSurumu: surum },
      aciklama: `URL yolu değişti (model v${surum})`
    });
    vt.calistir('UPDATE ekranlar SET guncellenme = ? WHERE id = ?', [simdi(), e.id]);
    return { degisti: true, surum, urlYolu: yol };
  });
}

/**
 * Sol listelerdeki sıra: idler projedeki (silinmemiş) ekranların TAMAMI, istenen sırada.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} idler @param {string} [yapan]
 */
export function ekranlariSirala(vt, projeId, idler, yapan) {
  acikAnahtar(vt);
  const ekranlar = ekranlariListele(vt, projeId);
  if (!Array.isArray(idler) || idler.length !== ekranlar.length || new Set(idler).size !== idler.length) {
    throw new DepoHatasi('Sıralama için projedeki tüm ekranların kimlikleri (birer kez) gönderilmelidir.');
  }
  const bilinen = new Map(ekranlar.map((e) => [e.id, e]));
  for (const id of idler) if (typeof id !== 'string' || !bilinen.has(id)) throw new DepoHatasi('Sıralamada bilinmeyen bir ekran var (liste değişmiş olabilir; sayfayı yenileyin).');
  const onceki = ekranlar.map((e) => e.id);
  if (onceki.every((id, i) => id === idler[i]) && ekranlar.every((e) => e.sira !== null)) return { degisti: false };
  return vt.islem(() => {
    /** @type {string[]} */ (idler).forEach((id, i) => vt.calistir('UPDATE ekranlar SET sira = ? WHERE id = ?', [i + 1, id]));
    gecmisYaz(vt, {
      varlikTuru: 'ekran_sirasi', varlikId: projeId, islem: 'guncelle', yapan, onceki: { idler: onceki }, sonraki: { idler },
      aciklama: 'Ekran sırası değişti'
    });
    return { degisti: true };
  });
}

/**
 * Devre dışı bırak (etkin=false) / etkinleştir (etkin=true). Geri alınabilir; hiçbir şey silinmez.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {boolean} etkin @param {string} [yapan]
 */
export function ekranDurumunuAyarla(vt, projeId, ekranId, etkin, yapan) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId);
  const yeni = etkin ? 'etkin' : 'devre_disi';
  if (e.durum === yeni) return { durum: yeni, degisti: false };
  return vt.islem(() => {
    vt.calistir('UPDATE ekranlar SET durum = ?, guncellenme = ? WHERE id = ?', [yeni, simdi(), e.id]);
    gecmisYaz(vt, {
      varlikTuru: 'ekran', varlikId: e.id, islem: 'guncelle', yapan, onceki: ekranAnlik(e), sonraki: { ...ekranAnlik(e), durum: yeni },
      aciklama: etkin ? 'Etkinleştirildi' : 'Devre dışı bırakıldı (senaryoları koşulara girmez)'
    });
    return { durum: yeni, degisti: true };
  });
}

/**
 * Silinmiş ekranı (mezar taşı) geri yükler: ekran boş (modelsiz, senaryosuz) olarak etkinleşir; kodu duran testler bir
 * sonraki aktarımda/listede yeniden görünür ve koşulara girer.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} [yapan]
 */
export function ekranGeriYukle(vt, projeId, ekranId, yapan) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId, { silinenlerDahil: true });
  if (e.durum !== 'silindi') throw new DepoHatasi('Ekran silinmiş değil.');
  const cakisan = ekranlariListele(vt, projeId).find((x) => kucuk(x.ad) === kucuk(e.ad));
  if (cakisan) throw new DepoHatasi(`"${cakisan.ad}" adında etkin bir ekran var; önce onu yeniden adlandırın.`);
  return vt.islem(() => {
    vt.calistir("UPDATE ekranlar SET durum = 'etkin', silinme_json = NULL, guncellenme = ? WHERE id = ?", [simdi(), e.id]);
    gecmisYaz(vt, { varlikTuru: 'ekran', varlikId: e.id, islem: 'guncelle', yapan, onceki: ekranAnlik(e), sonraki: { ...ekranAnlik(e), durum: 'etkin' }, aciklama: 'Silinmiş ekran geri yüklendi' });
    return { durum: 'etkin' };
  });
}

// ---------------------------------------------------------------------------------------
// Kod dosyaları (yol güvenliği + kuru çalıştırma)
// ---------------------------------------------------------------------------------------

/**
 * testDir'e (tests/) göre spec yolunu GÜVENLE çözer: yalnızca <kök>/tests/scenarios/** altı. Mutlak yol, "..", ".",
 * boş parça, ters bölü ve (varsa) gerçek yolu tests/scenarios dışına çıkan sembolik bağlar reddedilir.
 * @param {string} kok proje (kod) kökü @param {unknown} goreli ör. "scenarios/urun/x.spec.ts"
 * @returns {{ tam: string; goreli: string } | { neden: string }}
 */
export function kodYolunuDenetle(kok, goreli) {
  if (typeof goreli !== 'string' || !goreli || goreli.length > 500 || /[\u0000-\u001f]/.test(goreli)) return { neden: 'geçersiz yol' };
  if (goreli.includes('\\')) return { neden: 'ters bölü içeren yol' };
  if (isAbsolute(goreli) || /^[A-Za-z]:/.test(goreli)) return { neden: 'mutlak yol' };
  const parcalar = goreli.split('/');
  if (parcalar.some((p) => p === '' || p === '.' || p === '..')) return { neden: 'geçersiz yol parçası ("..", "." ya da boş)' };
  if (parcalar[0] !== KOD_KLASORU || parcalar.length < 2) return { neden: 'tests/scenarios dışında' };
  const taban = resolve(kok, 'tests', KOD_KLASORU);
  const tam = resolve(kok, 'tests', ...parcalar);
  if (!tam.startsWith(taban + sep)) return { neden: 'tests/scenarios dışında' };
  if (existsSync(taban)) {
    const gercekTaban = realpathSync(taban);
    let klasor = dirname(tam);
    while (!existsSync(klasor) && klasor.startsWith(taban + sep)) klasor = dirname(klasor);
    const gercekKlasor = realpathSync(klasor);
    if (gercekKlasor !== gercekTaban && !gercekKlasor.startsWith(gercekTaban + sep)) return { neden: 'sembolik bağ tests/scenarios dışına çıkıyor' };
  }
  return { tam, goreli };
}

/**
 * Klasördeki dosyalar (özyinelemeli; sembolik bağlar izlenmez — bağın kendisi listelenir). @param {string} klasor
 * @returns {string[]} tam yollar
 */
function klasorDosyalari(klasor) {
  /** @type {string[]} */
  const sonuc = [];
  const gez = (/** @type {string} */ k) => {
    for (const ad of readdirSync(k).sort()) {
      const tam = join(k, ad);
      const b = lstatSync(tam);
      if (b.isDirectory()) gez(tam);
      else sonuc.push(tam);
      if (sonuc.length > KOD_DOSYASI_EN_COK) throw new DepoHatasi(`Klasörde ${KOD_DOSYASI_EN_COK}'den fazla dosya var; kod kaldırma güvenlik nedeniyle yapılmaz.`);
    }
  };
  gez(klasor);
  return sonuc;
}

/**
 * Ekranın test kodu: sahip olduğu spec dosyaları (başka etkin/devre dışı bir ekranın senaryosu da kullanıyorsa
 * "paylaşılan"), paylaşılan dosyalardaki kendi senaryo anahtarları. Mezar taşında kayıtlı liste kullanılır.
 * @param {Veritabani} vt @param {string} projeId @param {Ekran} e
 */
function ekranKodu(vt, projeId, e) {
  const senaryolar = senaryoKaynaklari(vt, projeId);
  /** @type {Map<string, Set<string>>} */
  const digerSahipler = new Map();
  for (const s of senaryolar) {
    if (!s.kaynak || s.ekranId === e.id) continue;
    if (!digerSahipler.has(s.kaynak.dosya)) digerSahipler.set(s.kaynak.dosya, new Set());
    /** @type {Set<string>} */ (digerSahipler.get(s.kaynak.dosya)).add(s.ekranId ?? '');
  }
  const mezar = e.durum === 'silindi' ? mezarTasiGetir(vt, e.id) : null;
  /** @type {Set<string>} */
  const dosyalar = new Set(mezar ? mezar.kod.dosyalar : []);
  /** @type {Set<string>} */
  const anahtarlar = new Set(mezar ? mezar.kod.anahtarlar : []);
  for (const s of senaryolar) {
    if (s.ekranId !== e.id || !s.kaynak || s.kaynak.dosya === MODEL_SPEC_DOSYASI) continue;
    if (digerSahipler.has(s.kaynak.dosya)) anahtarlar.add(`${s.kaynak.dosya}::${s.kaynak.ad}`);
    else dosyalar.add(s.kaynak.dosya);
  }
  // Mezar taşındaki dosya sonradan başka bir ekrana geçtiyse (ör. geri yüklenen senaryo) artık paylaşılandır.
  for (const d of [...dosyalar]) if (digerSahipler.has(d)) dosyalar.delete(d);
  return { dosyalar: [...dosyalar].sort(), anahtarlar: [...anahtarlar].sort(), paylasilan: [...new Set([...anahtarlar].map((a) => a.slice(0, a.indexOf('::'))))].sort() };
}

/**
 * Kod kaldırma planı (KURU ÇALIŞTIRMA — hiçbir şey silinmez). Klasör kipi: ekranın dosyaları tests/scenarios/<ekran
 * anahtarı>/ altındaysa ve o klasörde başka bir ekranın senaryosu yoksa klasörün TAMAMI (içindeki her dosya listelenir).
 * Aksi halde yalnızca ekranın spec dosyaları.
 * @param {Veritabani} vt @param {string} projeId @param {Ekran} e @param {string} kok
 */
function kodPlani(vt, projeId, e, kok) {
  const kod = ekranKodu(vt, projeId, e);
  /** @type {Array<{ yol: string; neden: string }>} */
  const reddedilenler = [];
  /** @type {Array<{ goreli: string; tam: string }>} */
  const mevcut = [];
  for (const d of kod.dosyalar) {
    const r = kodYolunuDenetle(kok, d);
    if ('neden' in r) { reddedilenler.push({ yol: `tests/${d}`, neden: r.neden }); continue; }
    if (existsSync(r.tam) || lstatVarMi(r.tam)) mevcut.push({ goreli: d, tam: r.tam });
  }
  const taban = resolve(kok, 'tests', KOD_KLASORU);
  // Klasör kipi
  /** @type {string | null} */
  let klasor = null;
  /** @type {string[]} */
  let silinecekler = mevcut.map((m) => m.tam);
  const ekranKlasoru = join(taban, e.anahtar);
  const baskaEkranDosyasi = (/** @type {string} */ tam) => {
    const goreli = relative(resolve(kok, 'tests'), tam).split(sep).join('/');
    return senaryoKaynaklari(vt, projeId).some((s) => s.ekranId !== e.id && s.kaynak && s.kaynak.dosya === goreli);
  };
  if (mevcut.length && /^[A-Za-z0-9._-]+$/.test(e.anahtar) && !e.anahtar.startsWith('.') && mevcut.every((m) => m.tam.startsWith(ekranKlasoru + sep))
    && existsSync(ekranKlasoru) && lstatSync(ekranKlasoru).isDirectory()) {
    const hepsi = klasorDosyalari(ekranKlasoru);
    if (!hepsi.some(baskaEkranDosyasi)) {
      klasor = ekranKlasoru;
      silinecekler = hepsi;
    }
  }
  if (silinecekler.length > KOD_DOSYASI_EN_COK) throw new DepoHatasi(`${silinecekler.length} dosya silinecekti; güvenlik sınırı ${KOD_DOSYASI_EN_COK}. Kodu elle kaldırın.`);
  const projeGoreli = (/** @type {string} */ tam) => relative(kok, tam).split(sep).join('/');
  return {
    testVar: mevcut.length > 0 || kod.anahtarlar.length > 0,
    klasor: klasor ? projeGoreli(klasor) : null,
    dosyalar: silinecekler.map(projeGoreli).sort(),
    tamYollar: silinecekler,
    /** Ekranın (tests/'e göre) sahip olduğu spec dosyaları — mezar taşına yazılır. */
    sahipDosyalar: kod.dosyalar,
    anahtarlar: kod.anahtarlar,
    paylasilanlar: kod.paylasilan.map((d) => `tests/${d}`),
    reddedilenler
  };
}

/** Sembolik bağ (hedefi olmasa da) var mı? @param {string} yol */
function lstatVarMi(yol) {
  try { lstatSync(yol); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------------------
// Silme: önizleme + uygulama
// ---------------------------------------------------------------------------------------

/**
 * Silinecek her şeyin sayıları ve kod planı (hiçbir şey değişmez).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {{ kodKoku: string }} s
 */
export function ekranSilmeOnizlemesi(vt, projeId, ekranId, s) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId, { silinenlerDahil: true });
  const k = sayimlar(vt, e);
  const kod = kodPlani(vt, projeId, e, s.kodKoku);
  return {
    ekran: { id: e.id, ad: e.ad, anahtar: e.anahtar, durum: e.durum },
    sayilar: { modelSurumu: k.modelSurumu, senaryo: k.senaryoIdleri.length, sonuc: k.sonucIdleri.length, medya: k.sonucMedyasi.length + k.ekranMedyasi.length, sonucMedyasi: k.sonucMedyasi.length, ekranMedyasi: k.ekranMedyasi.length },
    kod: { testVar: kod.testVar, klasor: kod.klasor, dosyalar: kod.dosyalar, paylasilanlar: kod.paylasilanlar, reddedilenler: kod.reddedilenler }
  };
}

/**
 * Ekranın kayıtları: model sürümleri, senaryolar, sonuçlar (ekranın ya da senaryolarının) + sonuç medyası, ekranın kendi
 * şifreli dosyaları (kanıt görüntüleri, senaryo/ekran dosyaları — başka bir canlı kayıt kullanmıyorsa).
 * @param {Veritabani} vt @param {Ekran} e
 */
function sayimlar(vt, e) {
  const modelSurumu = Number(vt.tek('SELECT COUNT(*) AS n FROM ekran_modelleri WHERE ekran_id = ?', [e.id])?.n ?? 0);
  const senaryoIdleri = vt.tumu('SELECT id FROM senaryolar WHERE ekran_id = ?', [e.id]).map((x) => String(x.id));
  const yer = (/** @type {unknown[]} */ l) => l.map(() => '?').join(', ');
  const sonucIdleri = vt.tumu(
    `SELECT id FROM kosu_sonuclari WHERE ekran_id = ?${senaryoIdleri.length ? ` OR senaryo_id IN (${yer(senaryoIdleri)})` : ''}`, [e.id, ...senaryoIdleri]
  ).map((x) => String(x.id));
  /** @type {Array<{ id: string; dosya: string }>} */
  const sonucMedyasi = [];
  for (let i = 0; i < sonucIdleri.length; i += 500) {
    const parca = sonucIdleri.slice(i, i + 500);
    for (const m of vt.tumu(`SELECT id, dosya, silinme FROM medya WHERE sonuc_id IN (${yer(parca)})`, parca)) sonucMedyasi.push({ id: String(m.id), dosya: String(m.dosya) });
  }
  // Ekranın kendi dosyaları: kanıt görüntüleri (analiz.kanitlar) + sahibi bu ekran/senaryoları olan senaryo dosyaları.
  /** @type {Set<string>} */
  const adaylar = new Set();
  if (e.durum !== 'silindi') {
    const ayarlar = ekranAyarlariniGetir(vt, e.id) ?? {};
    const analiz = nesneMi(ayarlar.analiz) ? /** @type {Nesne} */ (ayarlar.analiz) : {};
    for (const k of Array.isArray(analiz.kanitlar) ? analiz.kanitlar : []) if (nesneMi(k) && typeof k.medyaId === 'string') adaylar.add(k.medyaId);
    for (const r of referanslariBul(ayarlar)) adaylar.add(r.id);
  }
  for (const m of vt.tumu("SELECT id FROM medya WHERE sahip_turu = 'ekran' AND sahip_id = ?", [e.id])) adaylar.add(String(m.id));
  for (let i = 0; i < senaryoIdleri.length; i += 500) {
    const parca = senaryoIdleri.slice(i, i + 500);
    for (const m of vt.tumu(`SELECT id FROM medya WHERE sahip_turu = 'senaryo' AND sahip_id IN (${yer(parca)})`, parca)) adaylar.add(String(m.id));
  }
  // Başka bir CANLI kayıt (bu ekranın dışındaki senaryo / ekran ayarı) kullanıyorsa dosya silinmez.
  if (adaylar.size) {
    const silinecekSenaryo = new Set(senaryoIdleri);
    for (const s of vt.tumu('SELECT id, icerik_json FROM senaryolar WHERE proje_id = ?', [e.projeId])) {
      if (silinecekSenaryo.has(String(s.id))) continue;
      for (const r of referanslariBul(JSON.parse(String(s.icerik_json)))) adaylar.delete(r.id);
    }
    for (const x of ekranlariListele(vt, e.projeId)) {
      if (x.id === e.id) continue;
      for (const r of referanslariBul(ekranAyarlariniGetir(vt, x.id) ?? {})) adaylar.delete(r.id);
    }
  }
  /** @type {Array<{ id: string; dosya: string }>} */
  const ekranMedyasi = [];
  const adayListesi = [...adaylar];
  for (let i = 0; i < adayListesi.length; i += 500) {
    const parca = adayListesi.slice(i, i + 500);
    for (const m of vt.tumu(`SELECT id, dosya FROM medya WHERE sonuc_id IS NULL AND id IN (${yer(parca)})`, parca)) ekranMedyasi.push({ id: String(m.id), dosya: String(m.dosya) });
  }
  return { modelSurumu, senaryoIdleri, sonucIdleri, sonucMedyasi, ekranMedyasi };
}

/**
 * KALICI SİL. onayAdi ekranın adıyla aynı olmalı. Seçenekler:
 *  - sonuclariSil (varsayılan KAPALI): ekranın/senaryolarının koşu sonuçları + adımları + şifreli medyaları (güvenli silme).
 *    Kapalıysa sonuçlar kalır, ekran mezar taşı olur ve sonuçlar "silinmiş ekran" diye görünür.
 *  - koduKaldir: önizlemedeki dosyalar (beklenenDosyalar ile AYNI olmalı) <kodKoku>/tests/scenarios altından silinir.
 * Senaryolar senaryoSil ile silinir (değişiklik geçmişi korunur). Kaynak eşlemeleri korunur (yeniden aktarım geri getirmez).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 * @param {{ onayAdi: unknown; sonuclariSil?: unknown; koduKaldir?: unknown; beklenenDosyalar?: unknown; kodKoku: string; medyaKlasoru: string; yapan?: string; kosuyorMu?: (dosya: string, ad: string) => boolean }} s
 */
export function ekranSil(vt, projeId, ekranId, s) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId, { silinenlerDahil: true });
  if (typeof s.onayAdi !== 'string' || s.onayAdi.replace(/\s+/g, ' ').trim() !== e.ad) throw new DepoHatasi('Onay için ekranın adını aynen yazın.');
  const sonuclariSil = s.sonuclariSil === true;
  const koduKaldir = s.koduKaldir === true;
  const plan = kodPlani(vt, projeId, e, s.kodKoku);
  if (koduKaldir) {
    if (!plan.dosyalar.length) throw new DepoHatasi('Bu ekranın kaldırılabilecek test kodu yok.');
    const beklenen = Array.isArray(s.beklenenDosyalar) ? [...s.beklenenDosyalar].filter((x) => typeof x === 'string').sort() : null;
    if (!beklenen || beklenen.length !== plan.dosyalar.length || beklenen.some((d, i) => d !== plan.dosyalar[i])) {
      throw new DepoHatasi('Kaldırılacak dosya listesi önizlemeden sonra değişti; hiçbir şey silinmedi. Önizlemeyi yenileyip tekrar deneyin.');
    }
    // Her dosya yeniden denetlenir (önizlemeden sonra sembolik bağ vb. eklenmiş olabilir).
    const taban = resolve(s.kodKoku, 'tests');
    for (const tam of plan.tamYollar) {
      const r = kodYolunuDenetle(s.kodKoku, relative(taban, tam).split(sep).join('/'));
      if ('neden' in r) throw new DepoHatasi(`"${relative(s.kodKoku, tam)}" kaldırılamaz (${r.neden}); hiçbir şey silinmedi.`);
    }
  }
  const k = sayimlar(vt, e);
  if (s.kosuyorMu) {
    for (const x of vt.tumu(`SELECT baslik, icerik_json FROM senaryolar WHERE ekran_id = ?`, [e.id])) {
      const kaynak = senaryoKaynagi(JSON.parse(String(x.icerik_json)));
      if (kaynak && s.kosuyorMu(kaynak.dosya, kaynak.ad)) throw new DepoHatasi(`"${x.baslik}" şu anda koşuyor; bitmesini bekleyin veya durdurun.`);
    }
  }
  // Kaldırılacak spec dosyaları: yalnızca yol denetiminden geçenler (tests/scenarios altı). Diğerleri (ör. tests/canli)
  // ve paylaşılan dosyalardaki anahtarlar mezar taşında kalır ve koşulardan hariç tutulmaya devam eder.
  const kaldirilacak = koduKaldir ? plan.sahipDosyalar.filter((d) => !('neden' in kodYolunuDenetle(s.kodKoku, d))) : [];
  const kalanKodDosyalari = plan.sahipDosyalar.filter((d) => !kaldirilacak.includes(d));
  const kalanAnahtarlar = plan.anahtarlar;
  const oncekiMezar = e.durum === 'silindi' ? mezarTasiGetir(vt, e.id) : null;
  const kaldirilanDosyalar = [...new Set([...(oncekiMezar?.kaldirilanDosyalar ?? []), ...kaldirilacak])].sort();
  const sonuclarKaliyor = !sonuclariSil && (k.sonucIdleri.length > 0 || (oncekiMezar ? !oncekiMezar.sonuclarSilindi : false));
  // Diskte hâlâ duran kod (ya da paylaşılan dosyadaki test) varsa mezar taşı kalır: o testler koşulara girmesin.
  const kodDuruyor = kalanKodDosyalari.some((d) => existsSync(resolve(s.kodKoku, 'tests', d))) || kalanAnahtarlar.length > 0;
  const tamamenSil = !sonuclarKaliyor && !kodDuruyor;
  /** @type {string[]} */
  const silinecekMedyaDosyalari = [...k.ekranMedyasi.map((m) => m.dosya), ...(sonuclariSil ? k.sonucMedyasi.map((m) => m.dosya) : [])];

  const yer = (/** @type {unknown[]} */ l) => l.map(() => '?').join(', ');
  const ozet = vt.islem(() => {
    // Senaryolar (geçmiş korunur) + kodu kaldırılan dosyalara bağlı ekransız senaryolar.
    for (const id of k.senaryoIdleri) senaryoSil(vt, id, s.yapan);
    let ekSenaryo = 0;
    if (koduKaldir) {
      const dosyaKumesi = new Set(kaldirilacak);
      for (const x of senaryoKaynaklari(vt, projeId)) {
        if (x.ekranId === null && x.kaynak && dosyaKumesi.has(x.kaynak.dosya)) { senaryoSil(vt, x.id, s.yapan); ekSenaryo++; }
      }
    }
    // Ekranın şifreli dosyaları (medya satırları; dosyalar işlemden sonra güvenle silinir).
    for (let i = 0; i < k.ekranMedyasi.length; i += 500) {
      const parca = k.ekranMedyasi.slice(i, i + 500).map((m) => m.id);
      vt.calistir(`DELETE FROM medya WHERE id IN (${yer(parca)})`, parca);
    }
    // Sonuçlar (isteğe bağlı): medya + adımlar + sonuçlar; boşalan koşular da silinir.
    let silinenKosu = 0;
    if (sonuclariSil && k.sonucIdleri.length) {
      /** @type {Set<string>} */
      const kosular = new Set();
      for (let i = 0; i < k.sonucIdleri.length; i += 500) {
        const parca = k.sonucIdleri.slice(i, i + 500);
        for (const r of vt.tumu(`SELECT DISTINCT kosu_id FROM kosu_sonuclari WHERE id IN (${yer(parca)})`, parca)) kosular.add(String(r.kosu_id));
        vt.calistir(`DELETE FROM medya WHERE sonuc_id IN (${yer(parca)})`, parca);
        vt.calistir(`DELETE FROM adim_sonuclari WHERE sonuc_id IN (${yer(parca)})`, parca);
        vt.calistir(`DELETE FROM kosu_sonuclari WHERE id IN (${yer(parca)})`, parca);
      }
      for (const kosuId of kosular) {
        if (!vt.tek('SELECT 1 AS v FROM kosu_sonuclari WHERE kosu_id = ? LIMIT 1', [kosuId])) {
          vt.calistir('DELETE FROM kosular WHERE id = ?', [kosuId]);
          silinenKosu++;
        }
      }
    }
    vt.calistir('DELETE FROM ekran_modelleri WHERE ekran_id = ?', [e.id]);
    const aciklama = [
      `Ekran silindi ("${e.ad}"): ${k.modelSurumu} model sürümü, ${k.senaryoIdleri.length + ekSenaryo} senaryo, ${k.ekranMedyasi.length} ekran dosyası`,
      sonuclariSil ? `${k.sonucIdleri.length} sonuç ve ${k.sonucMedyasi.length} sonuç medyası silindi` : k.sonucIdleri.length ? `${k.sonucIdleri.length} geçmiş sonuç korundu` : null,
      koduKaldir ? `test kodu kaldırıldı (${plan.dosyalar.length} dosya${plan.klasor ? `, ${plan.klasor}` : ''})` : kalanKodDosyalari.length || kalanAnahtarlar.length ? 'test kodu duruyor: koşulardan hariç (mezar taşı)' : null
    ].filter(Boolean).join('; ');
    // Kod kaldırılacaksa satır, dosyalar gerçekten silinene kadar mezar taşı olarak kalır (silinemeyen dosya hariç kalsın).
    if (tamamenSil && !koduKaldir) {
      vt.calistir('DELETE FROM ekranlar WHERE id = ?', [e.id]);
    } else {
      // Mezar taşı: şifreli ayarlar boşaltılır, durum 'silindi'.
      ekranKaydet(vt, { id: e.id, projeId, anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama, ayarlar: {} });
      /** @type {MezarTasi} */
      const mezar = {
        zaman: oncekiMezar?.zaman || simdi(), kod: { dosyalar: kalanKodDosyalari, anahtarlar: kalanAnahtarlar }, kaldirilanDosyalar,
        sonuclarSilindi: !sonuclarKaliyor, onceki: oncekiMezar?.onceki ?? { modelSurumu: k.modelSurumu, senaryo: k.senaryoIdleri.length, durum: e.durum }
      };
      vt.calistir("UPDATE ekranlar SET durum = 'silindi', sira = NULL, silinme_json = ?, guncellenme = ? WHERE id = ?", [JSON.stringify(mezar), simdi(), e.id]);
    }
    gecmisYaz(vt, {
      varlikTuru: 'ekran', varlikId: e.id, islem: 'sil', yapan: s.yapan, onceki: ekranAnlik(e),
      sonraki: tamamenSil ? null : { ...ekranAnlik(e), durum: 'silindi' }, aciklama
    });
    return { senaryo: k.senaryoIdleri.length + ekSenaryo, silinenKosu };
  });

  // İşlem tamamlandı: şifreli medya dosyaları güvenle silinir; sonra test kodu.
  let silinenMedyaDosyasi = 0;
  for (const d of silinecekMedyaDosyalari) if (medyaDosyasiniGuvenliSil(s.medyaKlasoru, d)) silinenMedyaDosyasi++;
  /** @type {string[]} */
  const kaldirilanlar = [];
  /** @type {Array<{ yol: string; neden: string }>} */
  const kodHatalari = [];
  if (koduKaldir) {
    for (const tam of plan.tamYollar) {
      try { unlinkSync(tam); kaldirilanlar.push(relative(s.kodKoku, tam).split(sep).join('/')); } catch (h) { kodHatalari.push({ yol: relative(s.kodKoku, tam).split(sep).join('/'), neden: /** @type {Error} */ (h).message.split('\n')[0] }); }
    }
    // Boşalan klasörler (tests/scenarios'un kendisi hariç).
    const taban = resolve(s.kodKoku, 'tests', KOD_KLASORU);
    const klasorler = [...new Set(plan.tamYollar.map((t) => dirname(t)))].sort((a, b) => b.length - a.length);
    for (const baslangic of klasorler) {
      let klasor = baslangic;
      while (klasor.startsWith(taban + sep)) {
        try { if (readdirSync(klasor).length) break; rmdirSync(klasor); } catch { break; }
        klasor = dirname(klasor);
      }
    }
    if (tamamenSil && !kodHatalari.length) {
      vt.islem(() => vt.calistir('DELETE FROM ekranlar WHERE id = ?', [e.id]));
    } else if (kodHatalari.length) {
      // Silinemeyen dosyalar hariç tutulmaya devam etsin.
      const kalan = plan.sahipDosyalar.filter((d) => existsSync(resolve(s.kodKoku, 'tests', d)));
      const m = mezarTasiGetir(vt, e.id);
      if (m && kalan.length) {
        vt.islem(() => vt.calistir('UPDATE ekranlar SET silinme_json = ? WHERE id = ?', [JSON.stringify({ ...m, kod: { ...m.kod, dosyalar: kalan } }), e.id]));
      }
    }
  }
  const satirKaldi = Boolean(vt.tek('SELECT 1 AS v FROM ekranlar WHERE id = ?', [e.id]));
  return {
    tamamenSilindi: !satirKaldi, mezarTasi: satirKaldi,
    silinen: {
      modelSurumu: k.modelSurumu, senaryo: ozet.senaryo, sonuc: sonuclariSil ? k.sonucIdleri.length : 0, kosu: ozet.silinenKosu,
      medya: k.ekranMedyasi.length + (sonuclariSil ? k.sonucMedyasi.length : 0), medyaDosyasi: silinenMedyaDosyasi
    },
    korunanSonuc: sonuclariSil ? 0 : k.sonucIdleri.length,
    kod: { kaldirilanlar, hatalar: kodHatalari, haricKalan: kalanKodDosyalari.length + kalanAnahtarlar.length }
  };
}
