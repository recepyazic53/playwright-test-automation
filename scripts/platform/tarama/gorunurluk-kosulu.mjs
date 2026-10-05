// GÖRÜNÜRLÜK KOŞULU (genel, saf; DOM yok) — akış diyagramındaki "ne zaman görünür?" koşulunun biçimleri ve model koşul ifadesine
// çevirisi. Sunucu (akis-servisi.mjs, tarama/akis-tasarimi.mjs, paket-olusturucu.mjs) ve arayüz (akis-tasarimi.js; /arayuz/gorunurluk-kosulu.mjs)
// aynı dosyayı kullanır. Ürüne / sektöre özgü hiçbir ad içermez.
//
// Diyagram koşulu (blok.kosullar[alan]):
//  - eski biçim  { secim, degerler }       tek seçim alanı (açılır liste / radyo / onay kutusu), "=" — geri uyum; aynen kalır.
//  - yeni biçim  { bag: 've' | 'veya', satirlar: [KosulSatiri] }  tek düzey VE ya da VEYA (karışık iç içe yok).
//    KosulSatiri { alan, islem, degerler, ortak?, onay?, etiket? }
//      alan     diyagram anahtarı (ekranın alanı) ya da ortak: true ise genel senaryo alanının MODEL kimliği
//      islem    'esit' (= şunlardan biri) | 'degil' (≠ hiçbiri) | 'dolu' | 'bos'
//      degerler esit / degil için en az bir değer (onay kutusunda tek değer: "true" / "false")
//      ortak    genel senaryo (ortak akış) alanı: senaryo verisinde ekranın alanlarıyla aynı düz nesnede durur; açılmış modelde
//               (model-formu.mjs > ortakAkislariAc) alan kimliği değişmez. Bu yüzden model koşulu ona kendi kimliğiyle başvurur.
//      onay     alan onay kutusu: değer mantıksal (true / false) yazılır
//      etiket   (yalnız genel senaryo alanında) koşulun açıklamasında kullanılan görünen ad
// Model ifadesi (satır başına): esit → { alan, esit } / { alan, icinde }; degil → { degil: { alan, esit | icinde } };
// dolu → { alan, dolu: true }; bos → { alan, dolu: false }. Birden çok satır: { ve: [...] } ya da { veya: [...] }.
// Tipler: gorunurluk-kosulu.d.mts.

export const KOSUL_ISLEMLERI = Object.freeze(['esit', 'degil', 'dolu', 'bos']);
/** Bir koşulda en çok satır ve satır başına en çok değer. */
export const KOSUL_SATIR_EN_COK = 10;
export const KOSUL_DEGER_EN_COK = 50;
/** Karşılaştırmaların okunuşu (düzenleyicideki seçenekler). */
export const ISLEM_ADLARI = Object.freeze({ esit: '= (şunlardan biri)', degil: '≠ (hiçbiri)', dolu: 'dolu', bos: 'boş' });

const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const degerliIslem = (islem) => islem === 'esit' || islem === 'degil';

/** Yeni biçimli diyagram koşulu mu? */
export function yeniBicimMi(k) {
  return nesneMi(k) && Array.isArray(k.satirlar);
}

/**
 * Diyagram koşulunun satırları (eski biçim tek "=" satırına çevrilir); okunamıyorsa null.
 * @returns {{ bag: 've' | 'veya'; satirlar: Array<{ alan: string; islem: string; degerler: string[]; ortak?: boolean; onay?: boolean; etiket?: string }> } | null}
 */
export function kosulSatirlari(k) {
  if (!nesneMi(k)) return null;
  if (yeniBicimMi(k)) return { bag: k.bag === 'veya' ? 'veya' : 've', satirlar: k.satirlar.filter(nesneMi).map((s) => ({ ...s, degerler: Array.isArray(s.degerler) ? [...s.degerler] : [] })) };
  if (typeof k.secim === 'string' && Array.isArray(k.degerler)) return { bag: 've', satirlar: [{ alan: k.secim, islem: 'esit', degerler: [...k.degerler] }] };
  return null;
}

/**
 * Arayüzden gelen koşulu tek biçime getirir: eski biçim aynen (değerler ayıklanır), yeni biçim ayıklanır; bozuksa undefined.
 * Satırların anlamı (alan akışta mı, değer var mı) burada değil, akistanKayitEnvanteri'nde denetlenir.
 */
export function kosulAyikla(ham) {
  if (!nesneMi(ham)) return undefined;
  const degerler = (/** @type {unknown} */ d) => (Array.isArray(d) ? [...new Set(d.filter((x) => typeof x === 'string').map((x) => x.slice(0, 200)))].slice(0, KOSUL_DEGER_EN_COK) : []);
  if (!yeniBicimMi(ham)) {
    if (typeof ham.secim !== 'string' || !Array.isArray(ham.degerler)) return undefined;
    return { secim: ham.secim, degerler: degerler(ham.degerler) };
  }
  const satirlar = ham.satirlar.filter(nesneMi).slice(0, KOSUL_SATIR_EN_COK).map((s) => ({
    alan: typeof s.alan === 'string' ? s.alan.slice(0, 300) : '',
    islem: KOSUL_ISLEMLERI.includes(s.islem) ? s.islem : '',
    degerler: degerliIslem(s.islem) ? degerler(s.degerler) : [],
    ...(s.ortak === true ? { ortak: true } : {}),
    ...(s.onay === true ? { onay: true } : {}),
    ...(s.ortak === true && typeof s.etiket === 'string' && s.etiket.trim() ? { etiket: s.etiket.replace(/\s+/g, ' ').trim().slice(0, 120) } : {})
  }));
  return { bag: ham.bag === 'veya' ? 'veya' : 've', satirlar };
}

/** Değerin modele yazılan hâli: onay kutusunda mantıksal, diğerlerinde metin. */
const modelDegeri = (d, onay) => (onay ? d === 'true' : d);

/**
 * Tek satırın model ifadesi. alanId: koşulun başvurduğu MODEL alan kimliği. onay: alan onay kutusu.
 * @param {{ islem: string; degerler: string[] }} satir @param {string} alanId @param {boolean} onay
 */
export function satirIfadesi(satir, alanId, onay) {
  if (satir.islem === 'dolu' || satir.islem === 'bos') return { alan: alanId, dolu: satir.islem === 'dolu' };
  const d = satir.degerler.map((x) => modelDegeri(x, onay));
  const esit = d.length === 1 ? { alan: alanId, esit: d[0] } : { alan: alanId, icinde: d };
  return satir.islem === 'degil' ? { degil: esit } : esit;
}

/**
 * Satırlardan model ifadesi (tek satır: kendisi; birden çok: { ve | veya: [...] }).
 * @param {'ve' | 'veya'} bag @param {unknown[]} ifadeler
 */
export function ifadeBirlestir(bag, ifadeler) {
  return ifadeler.length === 1 ? ifadeler[0] : { [bag]: ifadeler };
}

/** Model ifadesinin tek satırı (okunamıyorsa null). alan: MODEL kimliği. */
function satirOku(x) {
  if (!nesneMi(x)) return null;
  const anahtarlar = Object.keys(x).sort().join(',');
  const deger = (/** @type {unknown} */ d) => (typeof d === 'string' || typeof d === 'boolean' ? d : undefined);
  const esitOku = (/** @type {any} */ y) => {
    const k = nesneMi(y) ? Object.keys(y).sort().join(',') : '';
    if (k === 'alan,esit' && typeof y.alan === 'string' && deger(y.esit) !== undefined) return { alan: y.alan, degerler: [y.esit] };
    if (k === 'alan,icinde' && typeof y.alan === 'string' && Array.isArray(y.icinde) && y.icinde.length && y.icinde.every((d) => deger(d) !== undefined)) {
      // Onay kutusu değeri tek olur; karışık türler okunmaz.
      if (y.icinde.some((d) => typeof d === 'boolean') && y.icinde.length !== 1) return null;
      return { alan: y.alan, degerler: [...y.icinde] };
    }
    return null;
  };
  /** @param {{ alan: string; degerler: Array<string | boolean> }} e @param {string} islem */
  const satir = (e, islem) => {
    const onay = e.degerler.some((d) => typeof d === 'boolean');
    return { alan: e.alan, islem, degerler: e.degerler.map(String), ...(onay ? { onay: true } : {}) };
  };
  if (anahtarlar === 'alan,dolu' && typeof x.alan === 'string' && typeof x.dolu === 'boolean') return { alan: x.alan, islem: x.dolu ? 'dolu' : 'bos', degerler: [] };
  if (anahtarlar === 'degil') { const e = esitOku(x.degil); return e ? satir(e, 'degil') : null; }
  const e = esitOku(x);
  return e ? satir(e, 'esit') : null;
}

/**
 * Model ifadesinden diyagram satırları (alanlar MODEL kimliğiyle): tek satır ya da tek düzey ve / veya. Okunamıyorsa null
 * (ör. iç içe, karışık, senaryo ayarı, çalışma anında görünürse): düzenleyicide salt okunur gösterilir, modeldeki hâliyle korunur.
 * @returns {{ bag: 've' | 'veya'; satirlar: Array<{ alan: string; islem: string; degerler: string[]; onay?: boolean }> } | null}
 */
export function ifadedenSatirlar(ifade) {
  if (!nesneMi(ifade)) return null;
  for (const bag of /** @type {const} */ (['ve', 'veya'])) {
    if (Object.keys(ifade).length === 1 && Array.isArray(ifade[bag])) {
      if (!ifade[bag].length || ifade[bag].length > KOSUL_SATIR_EN_COK) return null;
      const satirlar = ifade[bag].map(satirOku);
      return satirlar.every(Boolean) ? { bag, satirlar: /** @type {any[]} */ (satirlar) } : null;
    }
  }
  const s = satirOku(ifade);
  return s ? { bag: 've', satirlar: [s] } : null;
}

/**
 * Koşulun okunur özeti: "Tip = A ve Bayi = X ise" (koşul yoksa null).
 * @param {unknown} k diyagram koşulu (eski / yeni biçim)
 * @param {(satir: { alan: string; ortak?: boolean; etiket?: string }) => string} etiketBul alanın görünen adı
 * @param {(satir: { alan: string; ortak?: boolean }, deger: string) => string} [degerMetni] değerin görünen metni
 */
export function kosulOzeti(k, etiketBul, degerMetni = (_s, d) => d) {
  const ks = kosulSatirlari(k);
  if (!ks || !ks.satirlar.length) return null;
  const parca = (/** @type {any} */ s) => {
    const ad = etiketBul(s);
    if (s.islem === 'dolu') return `${ad} dolu`;
    if (s.islem === 'bos') return `${ad} boş`;
    const metinler = s.degerler.map((/** @type {string} */ d) => degerMetni(s, d));
    return s.islem === 'degil' ? `${ad} ≠ ${metinler.join(', ')}` : `${ad} = ${metinler.join(' ya da ')}`;
  };
  return `${ks.satirlar.map(parca).join(ks.bag === 'veya' ? ' veya ' : ' ve ')} ise`;
}
