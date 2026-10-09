// DAL BİRLEŞTİRME (genel, saf) — "Nöbetçi taramasıyla güncelle" yalnız o turda görünen alanlarla model kurar. Ekranın başka bir dalı (ör. bir
// seçime / girilen değere göre açılan alanlar) önceki turda kaydedildiyse o dalın alanları yeni modelde yoktur: senaryolar bozulur, kalan
// alanların bağları (tetik / bağımlılık) boşa düşer. Bu modül yeni modeli eskisiyle birleştirir:
//  - Eski modelde olup bu turda görünmeyen senaryo alanları (seçicili) silinmez: eski adımlarına (yoksa komşu alanlarının adımına, o da
//    yoksa son adıma) "ekranda görünürse" koşuluyla geri konur. Kimlikleri ve senaryo anahtarları aynı kalır (senaryolar değer korur).
//  - Bu turda yeni çıkan alanlar (eski modelde aynı seçici yok) da "ekranda görünürse" olur: öteki dalda görünmezler.
//  - Birleştirmeden sonra modelde olmayan alana başvuran tetik / bağımlılık kaldırılır.
// Koşul: model.kosullar[EKRANDA_GORUNURSE] = { ifade: { calismaZamani: 'gorunurse' } } (koşu alanı çalışma anında görünürse yazar).

/** @typedef {Record<string, any>} Nesne */

export const EKRANDA_GORUNURSE = 'ekrandaGorunurse';
/** "veya" başarı göstergesinde en çok seçenek (ekran-modeli-dogrulayici.mjs > VEYA_EN_COK ile aynı). */
const VEYA_EN_COK = 5;

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @param {Nesne} a */
const seciciliSenaryoAlani = (a) => nesneMi(a) && a.yapilandirma === 'senaryo' && nesneMi(a.konum) && typeof a.konum.secici === 'string' && a.konum.secici;
/** @param {Nesne} m @returns {Array<{ adim: Nesne; bolum: Nesne; alan: Nesne }>} */
const alanlar = (m) => (Array.isArray(m?.adimlar) ? m.adimlar : []).filter(nesneMi).flatMap((adim) => (Array.isArray(adim.bolumler) ? adim.bolumler : [])
  .filter(nesneMi).flatMap((bolum) => (Array.isArray(bolum.alanlar) ? bolum.alanlar : []).filter(nesneMi).map((alan) => ({ adim, bolum, alan }))));
/** @param {Nesne} a */
const seciciAnahtari = (a) => `${String(a.konum.secici)}|${JSON.stringify(a.konum.cerceve ?? [])}`;
/** @param {Nesne} a */
const etiket = (a) => String((nesneMi(a.etiket) ? a.etiket.form || a.etiket.ekran : a.etiket) || a.id);

/**
 * Yeni modeli (yerinde) eski modelle birleştirir. Eski model yoksa ya da alanı yoksa hiçbir şey yapmaz.
 * @param {Nesne} yeni bu turdan kurulan model @param {Nesne | null | undefined} eski kayıtlı model
 * @returns {{ korunan: string[]; kosullanan: string[] }} korunan: geri konan eski alanların adları; kosullanan: koşul verilen yeni alanlar
 */
export function dallariBirlestir(yeni, eski) {
  const sonuc = { korunan: /** @type {string[]} */ ([]), kosullanan: /** @type {string[]} */ ([]) };
  if (!nesneMi(yeni) || !nesneMi(eski) || !Array.isArray(yeni.adimlar) || !yeni.adimlar.length) return sonuc;
  const eskiler = alanlar(eski).filter((x) => seciciliSenaryoAlani(x.alan));
  if (!eskiler.length) return sonuc;
  const yeniler = alanlar(yeni);
  const yeniIdler = new Set([...yeniler.map((x) => String(x.alan.id)),
    ...(Array.isArray(yeni.senaryoDuzeyi?.alanlar) ? yeni.senaryoDuzeyi.alanlar : []).filter(nesneMi).map((a) => String(a.id))]);
  const yeniSeciciler = new Set(yeniler.filter((x) => seciciliSenaryoAlani(x.alan)).map((x) => seciciAnahtari(x.alan)));
  const eskiSeciciler = new Set(eskiler.map((x) => seciciAnahtari(x.alan)));
  const kosulAc = () => {
    yeni.kosullar = nesneMi(yeni.kosullar) ? yeni.kosullar : {};
    if (!yeni.kosullar[EKRANDA_GORUNURSE]) {
      yeni.kosullar[EKRANDA_GORUNURSE] = { aciklama: 'Ekranda görünürse (ekranın başka bir dalında görünmeyebilir; Nöbetçi taramasıyla güncellemede birleştirildi).', ifade: { calismaZamani: 'gorunurse' } };
    }
  };
  // 1) Bu turda görünmeyen eski alanlar geri konur.
  for (let i = 0; i < eskiler.length; i++) {
    const { adim: eskiAdim, alan } = eskiler[i];
    if (yeniIdler.has(String(alan.id)) || yeniSeciciler.has(seciciAnahtari(alan))) continue;
    // Hedef: aynı kimlikli adım; yoksa eski modelde kendinden önceki (ya da sonraki) alanın yeni modeldeki adımı; o da yoksa son adım.
    /** @type {{ adim: Nesne; bolum: Nesne; sonra: number } | null} */
    let hedef = null;
    const ayniAdim = yeni.adimlar.find((/** @type {Nesne} */ a) => nesneMi(a) && a.id === eskiAdim.id && Array.isArray(a.bolumler) && a.bolumler.length);
    const komsuBul = (/** @type {number} */ yon) => {
      for (let j = i + yon; j >= 0 && j < eskiler.length; j += yon) {
        const k = yeniler.find((x) => x.alan.id === eskiler[j].alan.id);
        if (k) return k;
      }
      return null;
    };
    const onceki = komsuBul(-1);
    const sonraki = onceki ? null : komsuBul(1);
    if (ayniAdim) {
      // Aynı adımdaki komşu (eski sırada önce, yoksa sonra gelen) yeni modelde aynı adımdaysa onun yanına.
      const adimdaKomsu = (/** @type {number} */ yon) => {
        for (let j = i + yon; j >= 0 && j < eskiler.length && eskiler[j].adim === eskiAdim; j += yon) {
          const k = yeniler.find((x) => x.alan.id === eskiler[j].alan.id && x.adim === ayniAdim);
          if (k) return k;
        }
        return null;
      };
      const ondeki = adimdaKomsu(-1);
      const arkadaki = ondeki ? null : adimdaKomsu(1);
      const komsu = ondeki ?? arkadaki;
      const bolum = komsu ? komsu.bolum : ayniAdim.bolumler.find(nesneMi);
      hedef = { adim: ayniAdim, bolum, sonra: komsu ? bolum.alanlar.indexOf(komsu.alan) + (komsu === ondeki ? 1 : 0) : bolum.alanlar.length };
    } else if (onceki || sonraki) {
      const k = /** @type {{ adim: Nesne; bolum: Nesne; alan: Nesne }} */ (onceki ?? sonraki);
      hedef = { adim: k.adim, bolum: k.bolum, sonra: k.bolum.alanlar.indexOf(k.alan) + (onceki ? 1 : 0) };
    } else {
      const son = [...yeni.adimlar].reverse().find((/** @type {Nesne} */ a) => nesneMi(a) && Array.isArray(a.bolumler) && a.bolumler.some(nesneMi));
      if (son) { const bolum = son.bolumler.find(nesneMi); hedef = { adim: son, bolum, sonra: bolum.alanlar.length }; }
    }
    if (!hedef) continue;
    kosulAc();
    const kopya = structuredClone(alan);
    kopya.gorunurluk = { kosul: EKRANDA_GORUNURSE };
    if (!Array.isArray(hedef.bolum.alanlar)) hedef.bolum.alanlar = [];
    hedef.bolum.alanlar.splice(Math.max(0, hedef.sonra), 0, kopya);
    yeniIdler.add(String(kopya.id));
    yeniler.push({ adim: hedef.adim, bolum: hedef.bolum, alan: kopya });
    sonuc.korunan.push(etiket(kopya));
  }
  // 2) Bu turda yeni çıkan (eski modelde aynı seçici olmayan) koşulsuz alanlar da "ekranda görünürse".
  for (const { alan } of yeniler) {
    if (!seciciliSenaryoAlani(alan) || alan.gorunurluk || eskiSeciciler.has(seciciAnahtari(alan)) || sonuc.korunan.includes(etiket(alan))) continue;
    kosulAc();
    alan.gorunurluk = { kosul: EKRANDA_GORUNURSE };
    sonuc.kosullanan.push(etiket(alan));
  }
  // 3) Adımın başarı göstergesi iki dalda farklıysa (ör. düğmeden sonra bir dalda "Yıl", ötekinde "Belge no" belirir) ikisi "veya" olur:
  //    hangisi görünürse adım başarılı (en çok VEYA_EN_COK seçenek).
  const duz = (/** @type {Nesne} */ g) => (g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler.filter(nesneMi) : [g]);
  for (const adim of yeni.adimlar.filter(nesneMi)) {
    const eskiAdim = (Array.isArray(eski.adimlar) ? eski.adimlar : []).find((/** @type {Nesne} */ a) => nesneMi(a) && a.id === adim.id);
    const g = nesneMi(adim.kosu) ? adim.kosu.basariGostergesi : null;
    const e = eskiAdim && nesneMi(eskiAdim.kosu) ? eskiAdim.kosu.basariGostergesi : null;
    if (!nesneMi(g) || !nesneMi(e)) continue;
    const secenekler = [];
    const gorulen = new Set();
    for (const x of [...duz(g), ...duz(e)]) {
      const k = JSON.stringify(x);
      if (!gorulen.has(k)) { gorulen.add(k); secenekler.push(structuredClone(x)); }
    }
    if (secenekler.length > 1) adim.kosu.basariGostergesi = { tur: 'veya', secenekler: secenekler.slice(0, VEYA_EN_COK) };
  }
  // 4) Modelde olmayan alana başvuran tetik / bağımlılık kaldırılır.
  for (const { alan } of alanlar(yeni)) {
    if (nesneMi(alan.tetik) && typeof alan.tetik.alan === 'string' && !yeniIdler.has(alan.tetik.alan)) delete alan.tetik;
    if (nesneMi(alan.bagimlilik)) {
      const b = alan.bagimlilik.alan;
      if (typeof b === 'string' && !yeniIdler.has(b)) delete alan.bagimlilik;
      else if (Array.isArray(b)) {
        const kalan = b.filter((x) => yeniIdler.has(String(x)));
        if (!kalan.length) delete alan.bagimlilik; else if (kalan.length !== b.length) alan.bagimlilik.alan = kalan.length === 1 ? kalan[0] : kalan;
      }
    }
  }
  return sonuc;
}

/**
 * Modeli güncellerken taramanın ULAŞMADIĞI adımlar (yerinde): eski modelde, bu turda da olan son adımdan SONRAKİ ve bu turda olmayan adımlar
 * (kullanıcı o düğmeye basmadı / basılmadı) eski hâliyle sona eklenir; ulaşılan son adımın koşu tanımı (düğme, başarı göstergesi) eskisi gibi
 * kalır. Böylece karşılaştırmada "kaldırılan adım", "alan taşındı" gibi sahte farklar çıkmaz. Arada atlanan (sonrası ulaşılmış) adım gerçekten
 * kaldırılmış sayılır. Eski adımların kullandığı ve yeni modelde olmayan koşullar da taşınır. dallariBirlestir'den ÖNCE çağrılır.
 * @param {Nesne} yeni @param {Nesne | null | undefined} eski @returns {{ adimlar: string[] }} karşılaştırılmayan adımların adları
 */
export function ulasilamayanAdimlariKoru(yeni, eski) {
  const sonuc = { adimlar: /** @type {string[]} */ ([]) };
  if (!nesneMi(yeni) || !nesneMi(eski) || !Array.isArray(yeni.adimlar) || !Array.isArray(eski.adimlar)) return sonuc;
  const yeniIdler = new Set(yeni.adimlar.filter(nesneMi).map((a) => String(a.id)));
  const eskiAdimlar = eski.adimlar.filter(nesneMi);
  let son = -1;
  eskiAdimlar.forEach((a, i) => { if (yeniIdler.has(String(a.id))) son = i; });
  if (son < 0) return sonuc;
  const kuyruk = eskiAdimlar.slice(son + 1).filter((a) => !yeniIdler.has(String(a.id)));
  if (!kuyruk.length) return sonuc;
  const kopya = (/** @type {unknown} */ d) => JSON.parse(JSON.stringify(d));
  const sonEski = eskiAdimlar[son];
  const sonYeni = yeni.adimlar.find((/** @type {Nesne} */ a) => nesneMi(a) && String(a.id) === String(sonEski.id));
  if (sonYeni) { if (nesneMi(sonEski.kosu)) sonYeni.kosu = kopya(sonEski.kosu); else delete sonYeni.kosu; }
  for (const a of kuyruk) yeni.adimlar.push(kopya(a));
  if (nesneMi(eski.kosullar)) {
    yeni.kosullar = nesneMi(yeni.kosullar) ? yeni.kosullar : {};
    for (const [k, v] of Object.entries(eski.kosullar)) if (!(k in yeni.kosullar)) yeni.kosullar[k] = kopya(v);
  }
  sonuc.adimlar = kuyruk.map((a) => String(a.baslik || a.id));
  return sonuc;
}

/**
 * Modeli güncellerken bağlı listelerin GÖRÜLMEYEN seçenekleri (yerinde): taramada üst listenin yalnız gezilen değerlerinin alt seçenekleri
 * görülür. Eski modelin bağımlılık haritasında olup bu turda gözlenmeyen üst değerlerin seçenekleri yeni modele eski hâliyle konur; böylece
 * "kaldırılan seçenek" diye sahte fark çıkmaz. Gözlenen üst değerin seçenekleri bu turdakidir (gerçek fark görünür).
 * @param {Nesne} yeni @param {Nesne | null | undefined} eski @returns {{ alanlar: string[] }} haritası tamamlanan alanların adları
 */
export function gorulmeyenBagliSecenekleriKoru(yeni, eski) {
  const sonuc = { alanlar: /** @type {string[]} */ ([]) };
  if (!nesneMi(yeni) || !nesneMi(eski)) return sonuc;
  const eskiHaritalar = new Map(alanlar(eski).filter((x) => nesneMi(x.alan.bagimlilik) && nesneMi(x.alan.bagimlilik.secenekHaritasi))
    .map((x) => [String(x.alan.id), x.alan.bagimlilik.secenekHaritasi]));
  for (const { alan } of alanlar(yeni)) {
    const eh = eskiHaritalar.get(String(alan.id));
    if (!eh || !nesneMi(alan.bagimlilik) || !nesneMi(alan.bagimlilik.secenekHaritasi)) continue;
    let eklendi = false;
    for (const [ust, liste] of Object.entries(eh)) {
      if (ust in alan.bagimlilik.secenekHaritasi) continue;
      alan.bagimlilik.secenekHaritasi[ust] = JSON.parse(JSON.stringify(liste));
      eklendi = true;
    }
    if (eklendi) sonuc.alanlar.push(etiket(alan));
  }
  return sonuc;
}
