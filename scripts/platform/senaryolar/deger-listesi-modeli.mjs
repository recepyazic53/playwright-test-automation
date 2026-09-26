// EKRAN MODELİ ↔ TABLO LİSTELERİ: ekran alanlarının tablo bağlantılarından üretilen koşullu listeler (tablo-secimi.mjs
// tabloDegerListeleri). modeleListeleriUygula: model yüklenirken (modelBaglami) bu listeler modelin seçim alanlarına uygulanır; form,
//    senaryo doğrulayıcı ve koşu aynı modeli görür. Öncelik test verisindedir; model yalnız yedektir:
//    - koşulsuz liste → alanın seçenekleri listenin değerleri olur;
//    - tek koşullu ve koşulu modeldeki bağımlılığa uyan liste → bağımlılık haritasının o değeri listenin değerleri olur;
//    - diğer koşullu listeler (birden çok koşul, başka alan) → değerleri geçerli seçeneklere eklenir (daraltmayı form yapar).
//    Liste değeri: { deger (senaryoya yazılan), aciklama (formda görünen), ekranDegeri?, ekranMetni? (sayfadaki value / metin;
//    yoksa modeldeki aynı değerli seçenekten, o da yoksa deger / aciklama) }.
// Saf modül (vt yok).

/** @typedef {Record<string, any>} Nesne */
/** @typedef {{ deger: string; aciklama?: string; ekranDegeri?: string; ekranMetni?: string }} ListeDegeri */

const nesneMi = (/** @type {unknown} */ d) => d !== null && typeof d === 'object' && !Array.isArray(d);
const SECIM_TIPLERI = new Set(['secim', 'okluSecim', 'radyo']);

/** Modelin (adımlar > bölümler > alanlar, senaryo düzeyi) senaryoda ayarlanan seçim alanları; nesneler yerinde (değiştirilebilir). */
export function modelSecimAlanlari(model) {
  /** @type {Nesne[]} */
  const sonuc = [];
  const topla = (/** @type {unknown} */ alanlar) => {
    for (const a of Array.isArray(alanlar) ? alanlar : []) {
      if (!nesneMi(a) || a.yapilandirma !== 'senaryo' || !SECIM_TIPLERI.has(a.tip) || typeof a.id !== 'string') continue;
      if (a.eslesme && a.eslesme.profilHavuzu !== undefined) continue;   // hazır profil seçimi: değer listesi değil
      if (Array.isArray(a.secenekler) || (nesneMi(a.bagimlilik) && nesneMi(a.bagimlilik.secenekHaritasi))) sonuc.push(a);
    }
  };
  for (const adim of Array.isArray(model?.adimlar) ? model.adimlar : []) for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) topla(nesneMi(b) ? b.alanlar : null);
  if (nesneMi(model?.senaryoDuzeyi)) topla(model.senaryoDuzeyi.alanlar);
  return sonuc;
}

const senaryoDegeri = (/** @type {Nesne} */ s) => String(s.senaryoDegeri !== undefined ? s.senaryoDegeri : s.deger);
const formMetni = (/** @type {Nesne} */ s) => String(s.formMetni || s.metin || senaryoDegeri(s));

/** Model seçeneği → liste değeri (sayfa değeri / metni farklıysa korunur). @param {Nesne} s @returns {ListeDegeri} */
export function listeDegeri(s) {
  const deger = senaryoDegeri(s);
  const aciklama = formMetni(s);
  return {
    deger, ...(aciklama !== deger ? { aciklama } : {}),
    ...(String(s.deger) !== deger ? { ekranDegeri: String(s.deger) } : {}),
    ...(s.metin && String(s.metin) !== aciklama ? { ekranMetni: String(s.metin) } : {})
  };
}

/**
 * Liste değeri → model seçeneği. Modelde aynı senaryo değerli seçenek varsa onun sayfa değeri / metni / seçicisi korunur.
 * @param {ListeDegeri} x @param {Nesne[]} havuz modeldeki tüm seçenekler
 */
function modelSecenegi(x, havuz) {
  const m = havuz.find((s) => senaryoDegeri(s) === x.deger);
  if (m) return { ...m, ...(x.aciklama ? { formMetni: x.aciklama } : {}), ...(x.ekranDegeri ? { deger: x.ekranDegeri, senaryoDegeri: x.deger } : {}), ...(x.ekranMetni ? { metin: x.ekranMetni } : {}) };
  const ekranDegeri = x.ekranDegeri || x.deger;
  return {
    deger: ekranDegeri, ...(ekranDegeri !== x.deger ? { senaryoDegeri: x.deger } : {}),
    metin: x.ekranMetni || x.aciklama || x.deger, ...(x.aciklama ? { formMetni: x.aciklama } : {})
  };
}

/**
 * Ekranın değer listelerini modele uygular (yeni model döner; girdi değişmez).
 * @param {Nesne} model @param {Array<{ hedef?: Nesne | null; kosullar?: Array<{ alan: string; deger: string }>; degerler?: ListeDegeri[] }>} listeler
 */
export function modeleListeleriUygula(model, listeler) {
  if (!listeler.length) return model;
  const yeni = JSON.parse(JSON.stringify(model));
  for (const alan of modelSecimAlanlari(yeni)) {
    const bu = listeler.filter((l) => l.hedef?.alan === alan.id && Array.isArray(l.degerler) && l.degerler.length);
    if (!bu.length) continue;
    const bag = nesneMi(alan.bagimlilik) && nesneMi(alan.bagimlilik.secenekHaritasi) ? alan.bagimlilik : null;
    const havuz = [...(Array.isArray(alan.secenekler) ? alan.secenekler : []), ...(bag ? Object.values(bag.secenekHaritasi).flat() : [])].filter(nesneMi);
    const cevir = (/** @type {ListeDegeri[]} */ d) => d.map((x) => modelSecenegi(x, havuz));
    const birlestir = (/** @type {Nesne[]} */ a, /** @type {Nesne[]} */ b) => [...a, ...b.filter((s) => !a.some((y) => senaryoDegeri(y) === senaryoDegeri(s)))];
    // 1) Koşulsuz liste: alanın seçenekleri.
    const kosulsuz = bu.filter((l) => !(l.kosullar || []).length);
    if (kosulsuz.length) {
      const d = kosulsuz.reduce((acc, l) => birlestir(acc, cevir(l.degerler || [])), /** @type {Nesne[]} */ ([]));
      if (bag) for (const k of Object.keys(bag.secenekHaritasi)) bag.secenekHaritasi[k] = birlestir(bag.secenekHaritasi[k] || [], d);
      else alan.secenekler = d;
    }
    // 2) Tek koşullu, koşulu bağımlılığa uyan: haritanın o anahtarı.
    const haritaListeleri = bag ? bu.filter((l) => (l.kosullar || []).length === 1 && l.kosullar?.[0].alan === bag.alan) : [];
    /** @type {Map<string, Nesne[]>} */
    const yeniHarita = new Map();
    for (const l of haritaListeleri) {
      const k = /** @type {any} */ (l.kosullar)[0].deger;
      yeniHarita.set(k, birlestir(yeniHarita.get(k) || [], cevir(l.degerler || [])));
    }
    for (const [k, d] of yeniHarita) bag.secenekHaritasi[k] = d;
    // 3) Diğer koşullu listeler: değerleri geçerli seçeneklere eklenir.
    for (const l of bu.filter((x) => (x.kosullar || []).length && !haritaListeleri.includes(x))) {
      const d = cevir(l.degerler || []);
      const k = bag ? (l.kosullar || []).find((x) => x.alan === bag.alan)?.deger : undefined;
      if (bag) for (const anahtar of k !== undefined ? [k] : Object.keys(bag.secenekHaritasi)) bag.secenekHaritasi[anahtar] = birlestir(bag.secenekHaritasi[anahtar] || [], d);
      else alan.secenekler = birlestir(Array.isArray(alan.secenekler) ? alan.secenekler : [], d);
    }
  }
  return yeni;
}
