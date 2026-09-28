// EKRAN YÖNETİMİ (genel) — Ekranlar > ⋯ menüsü: yeniden adlandır, düzenle (URL yolu, liste sırası), devre dışı bırak /
// etkinleştir, kalıcı sil (+ isteğe bağlı: geçmiş sonuçlar) ve silinmiş ekranı geri yükle.
//
// Durum (ekranlar.durum, şema v8 — AÇIK sütunlar; koşu listesi filtresi kasa kilitliyken de okuyabilsin):
//   'etkin'      — normal.
//   'devre_disi' — geri alınabilir: sol listelerde varsayılan olarak gizli; senaryoları "Koşuyu başlat"a, seçilenlerin
//                  toplu koşusuna girmez. Tek senaryo (▷) ve Dene ise çalışır (kullanıcı kararı, 2026-09-25).
//                  Geçmiş sonuçlar Sonuçlar'da "devre dışı" rozetiyle görünür.
//   'silindi'    — MEZAR TAŞI: ekranın model sürümleri, senaryoları (değişiklik geçmişi KORUNUR), şifreli senaryo/kanıt
//                  dosyaları silinmiştir; satır yalnızca korunan geçmiş sonuçlar "silinmiş ekran" diye görünsün diye durur.
//                  Sonuçlar da silinmişse satır tamamen silinir.
//
// Tüm değişiklikler degisiklik_gecmisi'ne (varlik_turu 'ekran') yazılır. Kasa AÇIK olmalıdır.
// NOT: import.meta KULLANILMAZ. Tipler: ekran-yonetimi.d.mts.

import {
  DepoHatasi, ekranAyarlariniGetir, ekranKaydet, ekranModeliEkle, ekranModeliGetir, ekranlariListele, gecmisYaz, senaryoSil
} from '../veritabani/depo.mjs';
import { acikAnahtar } from '../kasa.mjs';
import { medyaDosyasiniGuvenliSil } from '../medya.mjs';
import { referanslariBul } from '../dosyalar/senaryo-dosyalari.mjs';
import { senaryoKaynagi } from '../senaryolar/senaryo-servisi.mjs';
import { modeliDogrula } from './ekran-servisi.mjs';
import { mezarTasiOku } from './mezar-tasi.mjs';

export { mezarTasiOku };

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Nesne */
/** @typedef {import('../veritabani/depo.mjs').Ekran} Ekran */
/** @typedef {{ zaman: string; sonuclarSilindi: boolean; onceki: Nesne }} MezarTasi */

export const AD_EN_UZUN = 120;
export const ACIKLAMA_EN_UZUN = 1000;
export const URL_YOLU_EN_UZUN = 500;

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
  if (!mevcut || !nesneMi(mevcut.model)) throw new DepoHatasi('Bu ekranın modeli yok; URL yolu modelle birlikte gelir (Ekran paketi yükleyin ya da ekranı tarayın).');
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
 * Silinmiş ekranı (mezar taşı) geri yükler: ekran boş (modelsiz, senaryosuz) olarak etkinleşir.
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
// Silme: önizleme + uygulama
// ---------------------------------------------------------------------------------------

/**
 * Silinecek her şeyin sayıları (hiçbir şey değişmez).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 */
export function ekranSilmeOnizlemesi(vt, projeId, ekranId) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId, { silinenlerDahil: true });
  const k = sayimlar(vt, e);
  return {
    ekran: { id: e.id, ad: e.ad, anahtar: e.anahtar, durum: e.durum },
    sayilar: { modelSurumu: k.modelSurumu, senaryo: k.senaryoIdleri.length, sonuc: k.sonucIdleri.length, medya: k.sonucMedyasi.length + k.ekranMedyasi.length, sonucMedyasi: k.sonucMedyasi.length, ekranMedyasi: k.ekranMedyasi.length }
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
 * KALICI SİL. onayAdi ekranın adıyla aynı olmalı. sonuclariSil (varsayılan KAPALI): ekranın/senaryolarının koşu sonuçları +
 * adımları + şifreli medyaları (güvenli silme). Kapalıysa sonuçlar kalır, ekran mezar taşı olur ve sonuçlar "silinmiş ekran"
 * diye görünür. Senaryolar senaryoSil ile silinir (değişiklik geçmişi korunur).
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId
 * @param {{ onayAdi: unknown; sonuclariSil?: unknown; medyaKlasoru: string; yapan?: string; kosuyorMu?: (dosya: string, ad: string) => boolean }} s
 */
export function ekranSil(vt, projeId, ekranId, s) {
  acikAnahtar(vt);
  const e = ekranBul(vt, projeId, ekranId, { silinenlerDahil: true });
  if (typeof s.onayAdi !== 'string' || s.onayAdi.replace(/\s+/g, ' ').trim() !== e.ad) throw new DepoHatasi('Onay için ekranın adını aynen yazın.');
  const sonuclariSil = s.sonuclariSil === true;
  const k = sayimlar(vt, e);
  if (s.kosuyorMu) {
    for (const x of vt.tumu(`SELECT baslik, icerik_json FROM senaryolar WHERE ekran_id = ?`, [e.id])) {
      const kaynak = senaryoKaynagi(JSON.parse(String(x.icerik_json)));
      if (kaynak && s.kosuyorMu(kaynak.dosya, kaynak.ad)) throw new DepoHatasi(`"${x.baslik}" şu anda koşuyor; bitmesini bekleyin veya durdurun.`);
    }
  }
  const oncekiMezar = e.durum === 'silindi' ? mezarTasiGetir(vt, e.id) : null;
  const sonuclarKaliyor = !sonuclariSil && (k.sonucIdleri.length > 0 || (oncekiMezar ? !oncekiMezar.sonuclarSilindi : false));
  const tamamenSil = !sonuclarKaliyor;
  /** @type {string[]} */
  const silinecekMedyaDosyalari = [...k.ekranMedyasi.map((m) => m.dosya), ...(sonuclariSil ? k.sonucMedyasi.map((m) => m.dosya) : [])];

  const yer = (/** @type {unknown[]} */ l) => l.map(() => '?').join(', ');
  const ozet = vt.islem(() => {
    // Senaryolar (geçmiş korunur).
    for (const id of k.senaryoIdleri) senaryoSil(vt, id, s.yapan);
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
      `Ekran silindi ("${e.ad}"): ${k.modelSurumu} model sürümü, ${k.senaryoIdleri.length} senaryo, ${k.ekranMedyasi.length} ekran dosyası`,
      sonuclariSil ? `${k.sonucIdleri.length} sonuç ve ${k.sonucMedyasi.length} sonuç medyası silindi` : k.sonucIdleri.length ? `${k.sonucIdleri.length} geçmiş sonuç korundu` : null
    ].filter(Boolean).join('; ');
    if (tamamenSil) {
      vt.calistir('DELETE FROM ekranlar WHERE id = ?', [e.id]);
    } else {
      // Mezar taşı: şifreli ayarlar boşaltılır, durum 'silindi'.
      ekranKaydet(vt, { id: e.id, projeId, anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama, ayarlar: {} });
      /** @type {MezarTasi} */
      const mezar = {
        zaman: oncekiMezar?.zaman || simdi(), sonuclarSilindi: !sonuclarKaliyor, onceki: oncekiMezar?.onceki ?? { modelSurumu: k.modelSurumu, senaryo: k.senaryoIdleri.length, durum: e.durum }
      };
      vt.calistir("UPDATE ekranlar SET durum = 'silindi', sira = NULL, silinme_json = ?, guncellenme = ? WHERE id = ?", [JSON.stringify(mezar), simdi(), e.id]);
    }
    gecmisYaz(vt, {
      varlikTuru: 'ekran', varlikId: e.id, islem: 'sil', yapan: s.yapan, onceki: ekranAnlik(e),
      sonraki: tamamenSil ? null : { ...ekranAnlik(e), durum: 'silindi' }, aciklama
    });
    return { senaryo: k.senaryoIdleri.length, silinenKosu };
  });

  // İşlem tamamlandı: şifreli medya dosyaları güvenle silinir.
  let silinenMedyaDosyasi = 0;
  for (const d of silinecekMedyaDosyalari) if (medyaDosyasiniGuvenliSil(s.medyaKlasoru, d)) silinenMedyaDosyasi++;
  const satirKaldi = Boolean(vt.tek('SELECT 1 AS v FROM ekranlar WHERE id = ?', [e.id]));
  return {
    tamamenSilindi: !satirKaldi, mezarTasi: satirKaldi,
    silinen: {
      modelSurumu: k.modelSurumu, senaryo: ozet.senaryo, sonuc: sonuclariSil ? k.sonucIdleri.length : 0, kosu: ozet.silinenKosu,
      medya: k.ekranMedyasi.length + (sonuclariSil ? k.sonucMedyasi.length : 0), medyaDosyasi: silinenMedyaDosyasi
    },
    korunanSonuc: sonuclariSil ? 0 : k.sonucIdleri.length
  };
}
