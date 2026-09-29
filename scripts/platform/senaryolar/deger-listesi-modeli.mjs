// EKRAN MODELİ ↔ TABLO LİSTELERİ: ekran alanlarının tablo bağlantılarından üretilen koşullu listeler (tablo-secimi.mjs
// tabloDegerListeleri). modeleListeleriUygula: model yüklenirken (modelBaglami) bu listeler modelin seçim alanlarına uygulanır; form,
//    senaryo doğrulayıcı ve koşu aynı modeli görür. Öncelik test verisindedir; model yalnız yedektir:
//    - koşulsuz liste → alanın seçenekleri listenin değerleri olur;
//    - tek koşullu ve koşulu modeldeki bağımlılığa uyan liste → bağımlılık haritasının o değeri listenin değerleri olur;
//    - diğer koşullu listeler (birden çok koşul, başka alan) → değerleri geçerli seçeneklere eklenir (daraltmayı form yapar).
//    Liste değeri: { deger (senaryoya yazılan), aciklama (formda görünen), ekranDegeri?, ekranMetni? (sayfadaki value / metin;
//    yoksa modeldeki aynı değerli seçenekten, o da yoksa deger / aciklama) }.
//    SENARYO AYARI alanlarına (senaryoAyariAlanlari) liste uygulanmaz: seçenekleri modelin kodlarıdır.
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
      // Seçenek listesi olmayan (null / yok) alan da dahil: seçenekleri test verisi tablosundan gelir.
      if (Array.isArray(a.secenekler) || a.secenekler == null || (nesneMi(a.bagimlilik) && nesneMi(a.bagimlilik.secenekHaritasi))) sonuc.push(a);
    }
  };
  for (const adim of Array.isArray(model?.adimlar) ? model.adimlar : []) for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) topla(nesneMi(b) ? b.alanlar : null);
  if (nesneMi(model?.senaryoDuzeyi)) topla(model.senaryoDuzeyi.alanlar);
  return sonuc;
}

/**
 * SENARYO AYARI alanları: ekranda karşılığı olmayan, akışın dallanmasını seçen seçim alanları (ör. "Teslim şekli: kargo / mağaza";
 * adımların görünürlüğü { senaryoAyari: <alan>, esit: <seçenek kodu> } koşuluna bağlı). Senaryoda ayarlanan (yapilandirma
 * 'senaryo'), seçenek listesi dolu, hazır profil seçimi olmayan; ekrandaAlanDegil işaretli ya da bir senaryoAyari koşulunda
 * başvurulan seçim alanı. Değeri her zaman bir SEÇENEK KODUDUR (koşullar kodla karşılaştırır): test verisi tablosuna bağlansa da
 * seçenekleri tablodan değişmez; tablodaki okunur değer (ör. "Kargo ile") koşuda koda çevrilir (tablolar/ekran-basvurulari.mjs).
 * @param {unknown} model @returns {Map<string, Nesne>} alan kimliği → alan (nesneler yerinde)
 */
export function senaryoAyariAlanlari(model) {
  /** @type {Set<string>} */
  const basvurulan = new Set();
  const tara = (/** @type {unknown} */ d) => {
    if (Array.isArray(d)) { d.forEach(tara); return; }
    if (!nesneMi(d)) return;
    for (const [k, v] of Object.entries(/** @type {Nesne} */ (d))) {
      if (k === 'senaryoAyari' && typeof v === 'string') basvurulan.add(v);
      else if (v && typeof v === 'object') tara(v);
    }
  };
  tara(model);
  /** @type {Map<string, Nesne>} */
  const sonuc = new Map();
  for (const a of modelSecimAlanlari(model)) {
    if (!Array.isArray(a.secenekler) || !a.secenekler.some(nesneMi)) continue;
    if (a.ekrandaAlanDegil === true || basvurulan.has(a.id)) sonuc.set(a.id, a);
  }
  return sonuc;
}

const senaryoDegeri =(/** @type {Nesne} */ s) => String(s.senaryoDegeri !== undefined ? s.senaryoDegeri : s.deger);
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
  // Önce senaryo değeriyle; tabloda okunur ad + sayfa değeri (karşılık) varsa sayfa değeriyle (seçici vb. korunur).
  const m = havuz.find((s) => senaryoDegeri(s) === x.deger) ?? (x.ekranDegeri ? havuz.find((s) => String(s.deger) === x.ekranDegeri) : undefined);
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
  // Senaryo ayarının seçenekleri modelin kodlarıdır (koşullar onlarla karşılaştırır): tablo bağı seçenekleri değiştirmez.
  const ayarlar = senaryoAyariAlanlari(yeni);
  for (const alan of modelSecimAlanlari(yeni)) {
    if (ayarlar.has(alan.id)) continue;
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
    // Varsayılan modelde sayfa değeriyle yazılmışsa (ör. "H") ve listede o sayfa değerli bir değer varsa (ör. "Hayır"), o değer olur.
    const v = nesneMi(alan.varsayilan) ? alan.varsayilan.deger : undefined;
    if (typeof v === 'string') {
      const tum = bu.flatMap((l) => l.degerler || []);
      const k = !tum.some((x) => x.deger === v) ? tum.find((x) => x.ekranDegeri === v) : undefined;
      if (k) alan.varsayilan = { ...alan.varsayilan, deger: k.deger };
    }
  }
  return yeni;
}
