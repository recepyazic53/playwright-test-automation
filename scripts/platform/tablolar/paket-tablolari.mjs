// EKRAN PAKETİNİN TEST VERİSİ BÖLÜMÜ (saf; vt yok) — paketin isteğe bağlı "testVerisi" bölümü, Test verisi TABLOLARININ
// (tablo-deposu.mjs: sütunlar + satırlar, satır = birlikte geçerli değerler) ve ekran alanı → sütun BAĞLANTILARININ
// (ekran-baglari.mjs: alanBaglari) paket biçimidir:
//   testVerisi: {
//     tablolar:    [{ ad, tur?: 'liste' | 'kayit' | 'servis', aciklama?, grup? (liste grubu, en çok 40), sutunlar: [{ ad, gizli?, karsiliklar?: { <hücre değeri>: { sayfa?, servis? } } }], satirlar: [[hücre, …]] }],
//     baglantilar: [{ alanId, tablo, sutun, etiket?, secimeGore?: { alan, degerler: { <değer>: { tablo, sutun, etiket? } } } }]
//   }
// Tablo türü (isteğe bağlı): 'liste' = ekran listesi (seçim alanının seçenekleri; adı "<Ekran adı> — <Alan>"), 'kayit' = kişi ve
// kayıt verisi (satır = kayıt; senaryo ${Tablo.Sütun} ile başvurur). Tabloda kaynak.tabloTuru olarak saklanır; Test verisi
// ekranı grubu buna göre seçer (yoksa ad / kaynak sezgisi).
// Seçim alanlarının seçenekleri tablo satırları olur; bağımlı listelerde (üst seçime göre alt seçenekler) satır = geçerli
// kombinasyon. Hücreye seçeneğin görünen metni yazılır; sayfadaki değeri (value) farklıysa sütunun karşılıklarına "sayfa"
// olarak girer (bağlı alanda modelin seçeneklerinden kendiliğinden de tamamlanır).
// GİZLİLİK: gizli sütuna değer yazılmaz (değeri kullanıcı Nöbetçi'de girer; diskte şifreli); adı gizli bilgi taşıyan
// (parola, şifre, token, PIN…) sütun gizli işaretli değilse uyarı, değer taşıyorsa hata. Hücrelerdeki kart / kimlik no gibi
// kalıplar ekran paketinin genel gizli değer taramasında reddedilir.
//   testVerisiniDogrula(tv, model)       biçim + bağlantı denetimi ({ hatalar, uyarilar }).
//   paketTablolari(tv, model)            yazılacak tablolar (satırlar nesne, tekrarlar atılmış) + bağlantılar.
//   paketListeleri(tv, model)            bağlantılardan koşullu değer listeleri (senaryo önerilerini tablolarla doğrulamak için).
//   secenekTablolariUret(girdi)          otomatik tarama / akış kaydı gözlemlerinden testVerisi bölümü.
// NOT: import.meta KULLANILMAZ (sayfa-paketi.mjs üzerinden birim testlerinde CommonJS'e çevrilir).

import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { AD_KALIBI, tabloDegerListeleri } from './tablo-secimi.mjs';
import { etiketMetni, olasiBaglar } from './secime-gore-bag.mjs';

export const PAKET_TABLO_EN_COK = 50;
export const PAKET_SATIR_EN_COK = 5000;
export const PAKET_SUTUN_EN_COK = 40;
export const PAKET_HUCRE_EN_UZUN = 500;
const TABLO_ADI = new RegExp(`^${AD_KALIBI}$`, 'u');
const ETIKET = /^[\p{L}\p{N} _-]{1,40}$/u;
const UST_ANAHTARLAR = new Set(['tablolar', 'baglantilar']);
const TABLO_ANAHTARLARI = new Set(['ad', 'tur', 'aciklama', 'grup', 'sutunlar', 'satirlar']);
/** Tablonun liste grubu (isteğe bağlı kullanıcı metni; tabloda kaynak.grup — tablo-deposu.mjs TABLO_GRUBU_EN_UZUN ile aynı). */
const PAKET_GRUP_EN_UZUN = 40;
/** @param {unknown} g @returns {string | null} */
const paketGrubu = (g) => {
  if (typeof g !== 'string') return null;
  const x = g.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return x && [...x].length <= PAKET_GRUP_EN_UZUN ? x : null;
};
/** Paket tablosunun türü: ekran listesi (seçenekler) ya da kişi / kayıt verisi. */
export const TABLO_TURLERI = Object.freeze(['liste', 'kayit', 'servis']);
const SUTUN_ANAHTARLARI = new Set(['ad', 'gizli', 'karsiliklar']);
const BAG_ANAHTARLARI = new Set(['alanId', 'tablo', 'sutun', 'etiket', 'secimeGore']);
/** Tabloya bağlanabilen alan tipleri (senaryoda değeri ayarlanan). */
const BAGLANABILIR = new Set(['secim', 'okluSecim', 'radyo', 'metin', 'sayi', 'tarih', 'telefon']);
const SECIM_TIPLERI = new Set(['secim', 'okluSecim', 'radyo']);

/** @typedef {Record<string, any>} Nesne */
/** @typedef {{ sayfa?: string; servis?: string }} Karsilik */
/** @typedef {{ ad: string; gizli: boolean; karsiliklar: Record<string, Karsilik> }} PaketSutunu */
/** @typedef {{ ad: string; tur: 'liste' | 'kayit' | 'servis' | null; aciklama: string | null; grup?: string; sutunlar: PaketSutunu[]; satirlar: Array<Record<string, string | null>>; tekrarSayisi: number }} PaketTablosu */
/** @typedef {{ alanId: string; tablo: string; sutun: string; etiket?: string; secimeGore?: { alan: string; degerler: Record<string, { tablo: string; sutun: string; etiket?: string }> } }} PaketBaglantisi */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
/** Hücre: metin / sayı / boş. @param {unknown} v @returns {string | null} */
const hucre = (v) => (v === null || v === undefined || v === '' ? null : typeof v === 'string' ? v.trim() || null : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null);

/**
 * Modelin alanları (adımlar, diğer akışların adımları, senaryo düzeyi; alt alanlar hariç) kimliğe göre.
 * @param {unknown} model @returns {Map<string, Nesne>}
 */
export function modelAlanlari(model) {
  /** @type {Map<string, Nesne>} */
  const sonuc = new Map();
  const topla = (/** @type {unknown} */ alanlar) => {
    for (const a of Array.isArray(alanlar) ? alanlar : []) if (nesneMi(a) && typeof a.id === 'string' && !sonuc.has(a.id)) sonuc.set(a.id, a);
  };
  const adimlar = (/** @type {unknown} */ liste) => {
    for (const adim of Array.isArray(liste) ? liste : []) for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) topla(nesneMi(b) ? b.alanlar : null);
  };
  if (!nesneMi(model)) return sonuc;
  const m = /** @type {Nesne} */ (model);
  adimlar(m.adimlar);
  for (const ak of Array.isArray(m.akislar) ? m.akislar : []) if (nesneMi(ak)) adimlar(ak.adimlar);
  if (nesneMi(m.senaryoDuzeyi)) topla(m.senaryoDuzeyi.alanlar);
  return sonuc;
}

/** Alanın ekrandaki / formdaki etiketi (ORTAK kural: ekran → form → not → kimlik; secime-gore-bag.mjs etiketMetni). @param {Nesne} a */
export const alanEtiketi = (a) => etiketMetni(a.etiket, a.id) || String(a.id ?? '');

/**
 * testVerisi bölümünü doğrular. yer öneki "testVerisi".
 * @param {unknown} tv @param {unknown} model
 * @returns {{ hatalar: Array<{ yer: string; mesaj: string }>; uyarilar: Array<{ yer: string; mesaj: string }> }}
 */
export function testVerisiniDogrula(tv, model) {
  /** @type {Array<{ yer: string; mesaj: string }>} */
  const hatalar = [];
  /** @type {Array<{ yer: string; mesaj: string }>} */
  const uyarilar = [];
  const hata = (/** @type {string} */ yer, /** @type {string} */ mesaj) => hatalar.push({ yer, mesaj });
  const uyari = (/** @type {string} */ yer, /** @type {string} */ mesaj) => uyarilar.push({ yer, mesaj });
  if (!nesneMi(tv)) { hata('testVerisi', '{ tablolar, baglantilar? } nesnesi olmalı.'); return { hatalar, uyarilar }; }
  const t = /** @type {Nesne} */ (tv);
  for (const k of Object.keys(t)) if (!UST_ANAHTARLAR.has(k)) hata(`testVerisi.${k}`, `bilinmeyen anahtar "${k}"`);
  if (!Array.isArray(t.tablolar)) { hata('testVerisi.tablolar', 'dizi olmalı (tablo yoksa bölümü yazmayın).'); return { hatalar, uyarilar }; }
  if (t.tablolar.length > PAKET_TABLO_EN_COK) hata('testVerisi.tablolar', `en çok ${PAKET_TABLO_EN_COK} tablo olabilir.`);
  /** @type {Map<string, Nesne>} küçük ad → tablo */
  const tablolar = new Map();
  t.tablolar.forEach((/** @type {unknown} */ ham, /** @type {number} */ i) => {
    const yer = `testVerisi.tablolar[${i}]`;
    if (!nesneMi(ham)) { hata(yer, 'nesne olmalı.'); return; }
    const tb = /** @type {Nesne} */ (ham);
    for (const k of Object.keys(tb)) if (!TABLO_ANAHTARLARI.has(k)) hata(`${yer}.${k}`, `bilinmeyen anahtar "${k}"`);
    const ad = typeof tb.ad === 'string' ? tb.ad.trim() : '';
    if (!ad || !TABLO_ADI.test(ad)) hata(`${yer}.ad`, 'boş olmayan, en çok 60 karakterlik tablo adı olmalı (. [ ] { } $ < > & | kullanılamaz).');
    else if (tablolar.has(kucuk(ad))) hata(`${yer}.ad`, `"${ad}" tablosu pakette birden fazla kez var.`);
    else tablolar.set(kucuk(ad), tb);
    if (tb.aciklama !== undefined && typeof tb.aciklama !== 'string') hata(`${yer}.aciklama`, 'metin olmalı.');
    if (tb.grup !== undefined && tb.grup !== null && (typeof tb.grup !== 'string' || [...tb.grup.trim()].length > PAKET_GRUP_EN_UZUN)) hata(`${yer}.grup`, `en çok ${PAKET_GRUP_EN_UZUN} karakterlik metin olmalı.`);
    if (tb.tur !== undefined && !TABLO_TURLERI.includes(tb.tur)) hata(`${yer}.tur`, '"liste" (ekran listesi: seçim alanının seçenekleri), "kayit" (kişi / kayıt verisi) ya da "servis" (yalnız servis isteklerinde kullanılan değerler) olmalı.');
    if (!Array.isArray(tb.sutunlar) || !tb.sutunlar.length) { hata(`${yer}.sutunlar`, 'en az bir sütun olmalı.'); return; }
    if (tb.sutunlar.length > PAKET_SUTUN_EN_COK) hata(`${yer}.sutunlar`, `en çok ${PAKET_SUTUN_EN_COK} sütun olabilir.`);
    const adlar = new Set();
    /** @type {boolean[]} */
    const gizliler = [];
    tb.sutunlar.forEach((/** @type {unknown} */ s, /** @type {number} */ j) => {
      const sy = `${yer}.sutunlar[${j}]`;
      if (!nesneMi(s)) { hata(sy, '{ ad, gizli?, karsiliklar? } olmalı.'); gizliler.push(false); return; }
      const su = /** @type {Nesne} */ (s);
      for (const k of Object.keys(su)) if (!SUTUN_ANAHTARLARI.has(k)) hata(`${sy}.${k}`, `bilinmeyen anahtar "${k}"`);
      const sad = typeof su.ad === 'string' ? su.ad.trim() : '';
      if (!sad || !TABLO_ADI.test(sad)) hata(`${sy}.ad`, 'boş olmayan, en çok 60 karakterlik sütun adı olmalı (. [ ] { } $ < > & | kullanılamaz).');
      else if (adlar.has(kucuk(sad))) hata(`${sy}.ad`, `"${sad}" sütunu tabloda birden fazla kez var.`);
      else adlar.add(kucuk(sad));
      if (su.gizli !== undefined && typeof su.gizli !== 'boolean') hata(`${sy}.gizli`, 'true/false olmalı.');
      const gizli = su.gizli === true;
      gizliler.push(gizli || gizliAdMi(sad));
      if (!gizli && sad && gizliAdMi(sad)) uyari(`${sy}.ad`, `"${sad}" sütunu gizli bilgi taşıyor görünüyor: "gizli": true işaretlenmeli ve değeri pakete yazılmamalı (Nöbetçi'de şifreli girilir).`);
      if (su.karsiliklar !== undefined) {
        if (gizli) hata(`${sy}.karsiliklar`, 'gizli sütunun karşılığı olmaz.');
        else if (!nesneMi(su.karsiliklar)) hata(`${sy}.karsiliklar`, '{ "<hücre değeri>": { sayfa?, servis? } } olmalı.');
        else {
          for (const [d, k] of Object.entries(su.karsiliklar)) {
            if (!nesneMi(k) || Object.keys(k).some((x) => x !== 'sayfa' && x !== 'servis') || Object.values(k).some((x) => typeof x !== 'string' || x.length > PAKET_HUCRE_EN_UZUN)) {
              hata(`${sy}.karsiliklar`, `"${d.slice(0, 40)}" karşılığı { sayfa?: metin, servis?: metin } olmalı.`);
            }
          }
        }
      }
    });
    if (!Array.isArray(tb.satirlar)) { hata(`${yer}.satirlar`, 'dizi olmalı (her satır sütun sırasıyla hücre dizisi).'); return; }
    if (tb.satirlar.length > PAKET_SATIR_EN_COK) hata(`${yer}.satirlar`, `en çok ${PAKET_SATIR_EN_COK} satır olabilir.`);
    const imzalar = new Set();
    let tekrar = 0;
    tb.satirlar.slice(0, PAKET_SATIR_EN_COK).forEach((/** @type {unknown} */ r, /** @type {number} */ k) => {
      const ry = `${yer}.satirlar[${k}]`;
      if (!Array.isArray(r) || r.length > tb.sutunlar.length) { hata(ry, `en çok ${tb.sutunlar.length} hücreli dizi olmalı (sütun sırasıyla).`); return; }
      r.forEach((v, j) => {
        if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') hata(`${ry}[${j}]`, 'metin, sayı ya da null olmalı.');
        else if (typeof v === 'string' && v.length > PAKET_HUCRE_EN_UZUN) hata(`${ry}[${j}]`, `en çok ${PAKET_HUCRE_EN_UZUN} karakter olabilir.`);
        else if (gizliler[j] && hucre(v) !== null) {
          hata(`${ry}[${j}]`, 'gizli (ya da gizli bilgi taşıyan adlı) sütuna değer yazılmaz: sütunu boş bırakın, değer Nöbetçi\'de şifreli girilir.');
        }
      });
      const imza = JSON.stringify(r.map(hucre));
      if (imzalar.has(imza)) tekrar++;
      imzalar.add(imza);
    });
    if (tekrar) uyari(`${yer}.satirlar`, `${tekrar} satır tekrar ediyor (bir kez yazılır).`);
  });

  if (t.baglantilar !== undefined) {
    if (!Array.isArray(t.baglantilar)) hata('testVerisi.baglantilar', 'dizi olmalı.');
    else {
      const alanlar = modelAlanlari(model);
      const gorulen = new Set();
      t.baglantilar.forEach((/** @type {unknown} */ ham, /** @type {number} */ i) => {
        const yer = `testVerisi.baglantilar[${i}]`;
        if (!nesneMi(ham)) { hata(yer, '{ alanId, tablo, sutun, etiket? } olmalı.'); return; }
        const b = /** @type {Nesne} */ (ham);
        for (const k of Object.keys(b)) if (!BAG_ANAHTARLARI.has(k)) hata(`${yer}.${k}`, `bilinmeyen anahtar "${k}"`);
        const alan = typeof b.alanId === 'string' ? alanlar.get(b.alanId) : undefined;
        if (!alan) hata(`${yer}.alanId`, `modelde "${String(b.alanId)}" kimlikli alan yok.`);
        else if (alan.yapilandirma !== 'senaryo' || !BAGLANABILIR.has(alan.tip)) hata(`${yer}.alanId`, `"${alanEtiketi(alan)}" senaryoda değeri ayarlanan bir seçim / metin alanı değil; tabloya bağlanamaz.`);
        else if (alan.hassas === true || gizliAdMi(String(alan.id)) || gizliAdMi(alanEtiketi(alan))) hata(`${yer}.alanId`, `"${alanEtiketi(alan)}" gizli bilgi alanı; tabloya bağlanmaz (değer giriş bilgisinden ya da gizli tablo sütunundan gelir).`);
        if (typeof b.alanId === 'string') {
          if (gorulen.has(b.alanId)) hata(`${yer}.alanId`, `"${b.alanId}" alanı birden fazla kez bağlanmış.`);
          gorulen.add(b.alanId);
        }
        /** Tek bağ (varsayılan ya da seçime göre bağın bir seçeneği). @param {Nesne} x @param {string} y */
        const tekDenetle = (x, y) => {
          const tb = typeof x.tablo === 'string' ? tablolar.get(kucuk(x.tablo)) : undefined;
          if (!tb) { hata(`${y}.tablo`, `pakette "${String(x.tablo)}" tablosu yok.`); return; }
          const su = Array.isArray(tb.sutunlar) ? tb.sutunlar.find((/** @type {Nesne} */ s) => nesneMi(s) && kucuk(s.ad) === kucuk(x.sutun)) : undefined;
          if (!su) hata(`${y}.sutun`, `"${String(tb.ad)}" tablosunda "${String(x.sutun)}" sütunu yok.`);
          else if (su.gizli === true) hata(`${y}.sutun`, 'gizli sütuna alan bağlanmaz.');
          if (x.etiket !== undefined && (typeof x.etiket !== 'string' || !ETIKET.test(x.etiket.trim()))) hata(`${y}.etiket`, 'harf, rakam, boşluk, "_", "-" (en çok 40) olmalı.');
        };
        tekDenetle(b, yer);
        // Seçime göre değişen bağ (secime-gore-bag.mjs): { alan: kontrol alanı kimliği, degerler: { değer: { tablo, sutun, etiket? } } }.
        if (b.secimeGore !== undefined) {
          const sg = b.secimeGore;
          if (!nesneMi(sg) || typeof sg.alan !== 'string' || !nesneMi(sg.degerler) || !Object.keys(sg.degerler).length) { hata(`${yer}.secimeGore`, '{ alan, degerler: { "<değer>": { tablo, sutun, etiket? } } } olmalı.'); return; }
          if (!alanlar.has(sg.alan) || sg.alan === b.alanId) hata(`${yer}.secimeGore.alan`, `modelde "${String(sg.alan)}" kimlikli (başka) bir kontrol alanı yok.`);
          for (const [d, x] of Object.entries(sg.degerler)) {
            if (!nesneMi(x)) { hata(`${yer}.secimeGore.degerler.${d}`, '{ tablo, sutun, etiket? } olmalı.'); continue; }
            tekDenetle(/** @type {Nesne} */ (x), `${yer}.secimeGore.degerler.${d}`);
          }
        }
      });
    }
  }
  return { hatalar, uyarilar };
}

/**
 * Alanın modeldeki seçenekleri (seçenekler + bağımlılık haritası): görünen metin → sayfa değeri (tekil eşleşenler).
 * @param {Nesne | undefined} alan @returns {Map<string, string>}
 */
function metinDegerHaritasi(alan) {
  /** @type {Map<string, Set<string>>} */
  const h = new Map();
  if (!alan) return new Map();
  const havuz = [...(Array.isArray(alan.secenekler) ? alan.secenekler : []),
    ...(nesneMi(alan.bagimlilik) && nesneMi(alan.bagimlilik.secenekHaritasi) ? Object.values(alan.bagimlilik.secenekHaritasi).flat() : [])];
  for (const s of havuz) {
    if (!nesneMi(s) || s.deger === undefined || s.deger === null) continue;
    const deger = String(s.deger);
    const senaryo = s.senaryoDegeri !== undefined ? String(s.senaryoDegeri) : deger;
    const metin = typeof s.metin === 'string' ? s.metin.trim() : '';
    if (!metin || metin === deger || senaryo !== deger) continue;
    (h.get(metin) ?? h.set(metin, new Set()).get(metin))?.add(deger);
  }
  return new Map([...h].filter(([, v]) => v.size === 1).map(([k, v]) => [k, [...v][0]]));
}

/**
 * Yazılacak tablolar (geçerli paket varsayılır): satırlar sütun adıyla nesne, tekrarlar atılmış; bağlı seçim alanlarında modeldeki
 * seçenekten (metin ≠ değer) eksik sayfa karşılıkları tamamlanır.
 * @param {unknown} tv @param {unknown} model @returns {{ tablolar: PaketTablosu[]; baglantilar: PaketBaglantisi[] }}
 */
export function paketTablolari(tv, model) {
  if (!nesneMi(tv) || !Array.isArray(/** @type {Nesne} */ (tv).tablolar)) return { tablolar: [], baglantilar: [] };
  const t = /** @type {Nesne} */ (tv);
  const alanlar = modelAlanlari(model);
  /** @type {PaketBaglantisi[]} */
  const tek = (/** @type {Nesne} */ b) => ({ tablo: String(b.tablo).trim(), sutun: String(b.sutun).trim(), ...(typeof b.etiket === 'string' && b.etiket.trim() ? { etiket: b.etiket.trim() } : {}) });
  const baglantilar = (Array.isArray(t.baglantilar) ? t.baglantilar : []).filter(nesneMi).map((/** @type {Nesne} */ b) => ({
    alanId: String(b.alanId), ...tek(b),
    ...(nesneMi(b.secimeGore) && typeof b.secimeGore.alan === 'string' && nesneMi(b.secimeGore.degerler)
      ? { secimeGore: { alan: b.secimeGore.alan, degerler: Object.fromEntries(Object.entries(b.secimeGore.degerler).filter(([, x]) => nesneMi(x)).map(([d, x]) => [d, tek(x)])) } } : {})
  }));
  /** @type {PaketTablosu[]} */
  const tablolar = t.tablolar.filter(nesneMi).map((/** @type {Nesne} */ tb) => {
    /** @type {PaketSutunu[]} */
    const sutunlar = tb.sutunlar.map((/** @type {Nesne} */ s) => {
      /** @type {Record<string, Karsilik>} */
      const karsiliklar = {};
      for (const [d, k] of Object.entries(nesneMi(s.karsiliklar) ? s.karsiliklar : {})) {
        const sayfa = typeof k.sayfa === 'string' && k.sayfa.trim() ? k.sayfa.trim() : '';
        const servis = typeof k.servis === 'string' && k.servis.trim() ? k.servis.trim() : '';
        if (d.trim() && (sayfa || servis)) karsiliklar[d.trim()] = { ...(sayfa ? { sayfa } : {}), ...(servis ? { servis } : {}) };
      }
      return { ad: String(s.ad).trim(), gizli: s.gizli === true || gizliAdMi(String(s.ad)), karsiliklar };
    });
    const imzalar = new Set();
    let tekrarSayisi = 0;
    /** @type {Array<Record<string, string | null>>} */
    const satirlar = [];
    for (const r of Array.isArray(tb.satirlar) ? tb.satirlar.slice(0, PAKET_SATIR_EN_COK) : []) {
      if (!Array.isArray(r)) continue;
      const degerler = Object.fromEntries(sutunlar.map((s, j) => [s.ad, s.gizli ? null : hucre(r[j])]));
      if (Object.values(degerler).every((v) => v === null)) continue;
      const imza = JSON.stringify(sutunlar.map((s) => degerler[s.ad]));
      if (imzalar.has(imza)) { tekrarSayisi++; continue; }
      imzalar.add(imza);
      satirlar.push(degerler);
    }
    const grup = paketGrubu(tb.grup);
    return { ad: String(tb.ad).trim(), tur: TABLO_TURLERI.includes(tb.tur) ? tb.tur : null, aciklama: typeof tb.aciklama === 'string' && tb.aciklama.trim() ? tb.aciklama.trim().slice(0, 300) : null, ...(grup ? { grup } : {}), sutunlar, satirlar, tekrarSayisi };
  });
  // Bağlı seçim alanı: tablodaki görünen metnin sayfa değeri modelden (yalnız eksik olanlar).
  for (const b of baglantilar.flatMap((x) => olasiBaglar(x).map((o) => ({ ...o, alanId: x.alanId })))) {
    const alan = alanlar.get(b.alanId);
    const tb = tablolar.find((x) => kucuk(x.ad) === kucuk(b.tablo));
    const su = tb?.sutunlar.find((s) => kucuk(s.ad) === kucuk(b.sutun));
    if (!alan || !tb || !su || su.gizli || !SECIM_TIPLERI.has(alan.tip)) continue;
    const harita = metinDegerHaritasi(alan);
    for (const r of tb.satirlar) {
      const v = r[su.ad];
      const sayfa = v !== null ? harita.get(v) : undefined;
      if (v !== null && sayfa && !su.karsiliklar[v]?.sayfa) su.karsiliklar[v] = { ...su.karsiliklar[v], sayfa };
    }
  }
  return { tablolar, baglantilar };
}

/**
 * Paket tablolarının bağlantılarından koşullu değer listeleri (tablo kimliği = tablo adı). Senaryo önerileri bu listeler modele
 * uygulanarak doğrulanır (tabloya bağlı alanda senaryo değeri tablodaki değerdir).
 * @param {unknown} tv @param {unknown} model
 */
export function paketListeleri(tv, model) {
  const { tablolar, baglantilar } = paketTablolari(tv, model);
  if (!baglantilar.length) return [];
  const tablo = (/** @type {string} */ ad) => tablolar.find((x) => kucuk(x.ad) === kucuk(ad));
  /** @type {Record<string, import('./secime-gore-bag.mjs').AlanBagi>} */
  const baglar = {};
  for (const b of baglantilar) {
    const tb = tablo(b.tablo);
    if (!tb) continue;
    /** @type {Record<string, { tablo: string; sutun: string; etiket?: string }>} */
    const degerler = {};
    for (const [d, x] of Object.entries(b.secimeGore?.degerler ?? {})) { const xt = tablo(x.tablo); if (xt) degerler[d] = { tablo: xt.ad, sutun: x.sutun, ...(x.etiket ? { etiket: x.etiket } : {}) }; }
    baglar[b.alanId] = { tablo: tb.ad, sutun: b.sutun, ...(b.etiket ? { etiket: b.etiket } : {}), ...(b.secimeGore && Object.keys(degerler).length ? { secimeGore: { alan: b.secimeGore.alan, degerler } } : {}) };
  }
  const sira = [...modelAlanlari(model).keys()];
  return tabloDegerListeleri(baglar, tablolar.map((tb) => ({
    id: tb.ad, ad: tb.ad, sutunlar: tb.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli, karsiliklar: s.karsiliklar })),
    satirlar: tb.satirlar.map((degerler) => ({ ortamId: null, degerler }))
  })), 'paket', sira);
}

// ---------------------------------------------------------------------------------------
// Otomatik tarama / akış kaydı: seçenek gözlemlerinden tablolar
// ---------------------------------------------------------------------------------------

/**
 * @typedef {{ deger: string; metin: string }} Secenek
 * @typedef {{ anahtar: string; id: string; etiket: string; secenekler: Secenek[] }} UretimAlani
 * @typedef {{ anahtar: string; secimler: Record<string, string>; secenekler: Secenek[] }} SecenekGozlemi
 */

const imzaOf = (/** @type {Secenek[]} */ l) => JSON.stringify(l.map((s) => s.deger));
/** Tablo adı karakterleri dışındakiler atılır (kısaltmadan). @param {string} m */
const temizle = (m) => String(m ?? '').replace(/[.[\]{}$<>&|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
/** Tablo adı karakterleri dışındakiler atılır, en çok 60. @param {string} m */
const adTemizle = (m) => temizle(m).slice(0, 60).trim();
const AD_EN_UZUN = 60;
const EKRAN_AYRACI = ' — ';

/**
 * Ekran listesi tablosunun adı: "<Ekran adı> — <Alan>" (bağımlı listede "<Ekran adı> — <Üst alan> - <Alt alan>"), en çok 60
 * karakter. Sığmazsa önce ekran adı kısaltılır (en az 20 karakteri kalır), sonra tamamı 60'ta kesilir. Ekran adı yoksa yalnız alan.
 * @param {string | null | undefined} ekranAdi @param {string[]} alanEtiketleri
 */
export function ekranListesiTabloAdi(ekranAdi, alanEtiketleri) {
  const alan = temizle(alanEtiketleri.join(' - '));
  const ekran = temizle(ekranAdi ?? '');
  if (!ekran) return alan.slice(0, AD_EN_UZUN).trim();
  if (!alan) return ekran.slice(0, AD_EN_UZUN).trim();
  const yer = Math.max(Math.min(ekran.length, AD_EN_UZUN - EKRAN_AYRACI.length - alan.length), Math.min(ekran.length, 20));
  return `${ekran.slice(0, yer).trim()}${EKRAN_AYRACI}${alan}`.slice(0, AD_EN_UZUN).trim();
}

/**
 * Seçim alanlarının seçenek gözlemlerinden (tarama keşfi / kayıt okumaları / açılan listeler) testVerisi bölümü: her bağımsız
 * seçim alanı tek sütunlu bir tablo; seçenekleri başka bir seçimin değerine göre değişen alanlar üst alanlarıyla aynı
 * tabloda (satır = geçerli kombinasyon). Hücre görünen metindir; sayfa değeri farklıysa karşılık olarak yazılır (aynı metin
 * farklı değerlere karşılık geliyorsa sütun değerle yazılır). Adı gizli bilgi taşıyan alanlar alınmaz.
 * Tablo adı "<Ekran adı> — <Alan>" (ekranListesiTabloAdi); tablo türü "liste" (Test verisi > Ekran listeleri).
 * @param {{ alanlar: UretimAlani[]; gozlemler: SecenekGozlemi[]; ekranAdi?: string | null }} girdi
 * @returns {{ testVerisi: { tablolar: Nesne[]; baglantilar: PaketBaglantisi[] } | null; notlar: string[] }}
 */
export function secenekTablolariUret(girdi) {
  /** @type {string[]} */
  const notlar = [];
  const alanlar = girdi.alanlar.filter((a) => {
    if (gizliAdMi(a.etiket) || gizliAdMi(a.id)) { notlar.push(`"${a.etiket}" gizli bilgi alanı: seçenekleri test verisine alınmadı.`); return false; }
    return true;
  });
  const anahtarlar = new Set(alanlar.map((a) => a.anahtar));
  /** @type {Map<string, SecenekGozlemi[]>} */
  const gozlem = new Map();
  for (const g of girdi.gozlemler) {
    if (!anahtarlar.has(g.anahtar) || !g.secenekler.length) continue;
    (gozlem.get(g.anahtar) ?? gozlem.set(g.anahtar, []).get(g.anahtar))?.push(g);
  }
  /** Alanın bilinen seçenekleri (model + gözlemlerin birleşimi, sırayla). @param {UretimAlani} a */
  const tumSecenekler = (a) => {
    /** @type {Map<string, Secenek>} */
    const m = new Map();
    for (const s of [...a.secenekler, ...(gozlem.get(a.anahtar) ?? []).flatMap((g) => g.secenekler)]) if (s.deger !== '' && !m.has(s.deger)) m.set(s.deger, s);
    return [...m.values()];
  };
  // 1) Üst alan: seçenek listesi yalnız ONUN değerine göre değişiyorsa (her değerde tek liste, en az iki farklı liste). Çok düzeyli
  // zincirlerde (il → ilçe → belde → köy) üst değerin kendisi değil ÜST ZİNCİRİYLE birlikte yolu anahtardır (iki ilde de "Merkez"
  // ilçesi olabilir); üst alan önce formda kendinden ÖNCEKİ alanlar arasında aranır (en yakın önce), ancak yoksa sonrakilerde.
  /** @type {Map<string, { ust: string; basit: boolean; harita: Map<string, Secenek[]> }>} */
  const bagimli = new Map();
  /** Alanın değerinin üst zincirle birlikte yolu (biri eksikse null). @param {string} k @param {(k: string) => string | undefined} deger @param {boolean} basit */
  const yolAnahtari = (k, deger, basit) => {
    /** @type {string[]} */
    const parcalar = [];
    const gorulen = new Set();
    /** @type {string | undefined} */
    let u = k;
    while (u && !gorulen.has(u)) {
      gorulen.add(u);
      const v = deger(u);
      if (v === undefined || v === '') return null;
      parcalar.unshift(v);
      if (basit) break;
      u = bagimli.get(u)?.basit ? undefined : bagimli.get(u)?.ust;
    }
    return JSON.stringify(parcalar);
  };
  alanlar.forEach((a, sira) => {
    const liste = gozlem.get(a.anahtar) ?? [];
    if (new Set(liste.map((g) => imzaOf(g.secenekler))).size < 2) return;
    /** @type {{ ust: string; basit: boolean; harita: Map<string, Secenek[]>; puan: number } | null} */
    let en = null;
    // Önceki alanlarda uygun üst varsa sonrakiler hiç denenmez (alt alanın değeri üst alanın listesini "açıklıyormuş" gibi görünebilir).
    const oncekiler = alanlar.slice(0, sira).reverse();
    const sonrakiler = alanlar.slice(sira + 1);
    for (const p of [...oncekiler, ...sonrakiler]) {
      if (en && sonrakiler.includes(p)) break;
      if (bagimli.get(p.anahtar)?.ust === a.anahtar) continue;
      const basit = sonrakiler.includes(p);
      /** @type {Map<string, Secenek[]>} */
      const harita = new Map();
      let tutarli = true;
      for (const g of liste) {
        const v = yolAnahtari(p.anahtar, (k) => g.secimler[k], basit);
        if (v === null) continue;
        const onceki = harita.get(v);
        if (onceki && imzaOf(onceki) !== imzaOf(g.secenekler)) { tutarli = false; break; }
        harita.set(v, g.secenekler);
      }
      if (!tutarli || new Set([...harita.values()].map(imzaOf)).size < 2) continue;
      if (!en || harita.size > en.puan) en = { ust: p.anahtar, basit, harita, puan: harita.size };
    }
    if (en) bagimli.set(a.anahtar, { ust: en.ust, basit: en.basit, harita: en.harita });
    else notlar.push(`"${a.etiket}" alanının seçenekleri değişiyor ama bağlı olduğu seçim bulunamadı: test verisi tablosuna gözlenen tüm seçenekler yazıldı.`);
  });
  // Döngü koruması: üst zinciri kendine dönen alan bağımsız sayılır.
  for (const a of [...bagimli.keys()]) {
    const gorulen = new Set([a]);
    let u = bagimli.get(a)?.ust;
    while (u && bagimli.has(u)) {
      if (gorulen.has(u)) { bagimli.delete(a); break; }
      gorulen.add(u);
      u = bagimli.get(u)?.ust;
    }
  }
  const alanBul = (/** @type {string} */ k) => /** @type {UretimAlani} */ (alanlar.find((x) => x.anahtar === k));
  const cocuklar = (/** @type {string} */ k) => alanlar.filter((x) => bagimli.get(x.anahtar)?.ust === k);
  /** @type {Nesne[]} */
  const tablolar = [];
  /** @type {PaketBaglantisi[]} */
  const baglantilar = [];
  const tabloAdlari = new Set();
  for (const kok of alanlar.filter((x) => !bagimli.has(x.anahtar))) {
    // Grup: kök + alt alanlar (derinlik öncelikli sıra).
    /** @type {UretimAlani[]} */
    const grup = [];
    const gez = (/** @type {UretimAlani} */ a) => { grup.push(a); for (const c of cocuklar(a.anahtar)) gez(c); };
    gez(kok);
    const kokSecenekleri = tumSecenekler(kok);
    if (!kokSecenekleri.length) continue;
    /** @type {Array<Record<string, Secenek | null>>} */
    let satirlar = kokSecenekleri.map((s) => ({ [kok.anahtar]: s }));
    let kesildi = false;
    for (const c of grup.slice(1)) {
      const b = /** @type {{ ust: string; basit: boolean; harita: Map<string, Secenek[]> }} */ (bagimli.get(c.anahtar));
      /** @type {Array<Record<string, Secenek | null>>} */
      const yeni = [];
      for (const r of satirlar) {
        const yol = r[b.ust] ? yolAnahtari(b.ust, (k) => r[k]?.deger, b.basit) : null;
        const alt = yol ? b.harita.get(yol)?.filter((s) => s.deger !== '') : undefined;
        if (!alt || !alt.length) yeni.push({ ...r, [c.anahtar]: null });
        else for (const s of alt) yeni.push({ ...r, [c.anahtar]: s });
        if (yeni.length >= PAKET_SATIR_EN_COK) { kesildi = true; break; }
      }
      satirlar = yeni.slice(0, PAKET_SATIR_EN_COK);
    }
    if (kesildi) notlar.push(`"${kok.etiket}" tablosu ${PAKET_SATIR_EN_COK} satırda kesildi.`);
    // Sütunlar: görünen metin (aynı metin farklı değerlere karşılık geliyorsa değer) + karşılıklar.
    const sutunAdlari = new Set();
    const sutunlar = grup.map((a) => {
      let ad = adTemizle(a.etiket) || a.id;
      for (let i = 2; sutunAdlari.has(kucuk(ad)); i++) ad = `${adTemizle(a.etiket).slice(0, 55) || a.id} ${i}`;
      sutunAdlari.add(kucuk(ad));
      /** @type {Map<string, Set<string>>} */
      const m = new Map();
      for (const r of satirlar) { const s = r[a.anahtar]; if (s) (m.get(s.metin) ?? m.set(s.metin, new Set()).get(s.metin))?.add(s.deger); }
      const degerle = [...m.values()].some((v) => v.size > 1);
      /** @type {Record<string, Karsilik>} */
      const karsiliklar = {};
      if (!degerle) for (const [metin, v] of m) { const d = [...v][0]; if (d !== metin) karsiliklar[metin] = { sayfa: d }; }
      return { a, ad, degerle, karsiliklar };
    });
    const temel = ekranListesiTabloAdi(girdi.ekranAdi, grup.map((a) => a.etiket)) || adTemizle(kok.id);
    let tabloAdi = temel;
    for (let i = 2; tabloAdlari.has(kucuk(tabloAdi)); i++) tabloAdi = `${temel.slice(0, 55).trim()} ${i}`;
    tabloAdlari.add(kucuk(tabloAdi));
    tablolar.push({
      ad: tabloAdi, tur: 'liste',
      sutunlar: sutunlar.map((s) => ({ ad: s.ad, ...(Object.keys(s.karsiliklar).length ? { karsiliklar: s.karsiliklar } : {}) })),
      satirlar: satirlar.map((r) => sutunlar.map((s) => { const x = r[s.a.anahtar]; return x ? (s.degerle ? x.deger : x.metin).slice(0, PAKET_HUCRE_EN_UZUN) : null; }))
    });
    for (const s of sutunlar) baglantilar.push({ alanId: s.a.id, tablo: tabloAdi, sutun: s.ad });
    if (tablolar.length >= PAKET_TABLO_EN_COK) { notlar.push(`Test verisine en çok ${PAKET_TABLO_EN_COK} tablo önerilir; kalan seçim alanları alınmadı.`); break; }
  }
  return { testVerisi: tablolar.length ? { tablolar, baglantilar } : null, notlar };
}
