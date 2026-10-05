// Senaryo formunda DAL DÜZENİ (genel; ekrana / sektöre özgü sabit yok). Modelin görünürlük koşullarından çıkarılır:
//  - Kontrol alanı: aynı bölümde başka alanların görünürlüğünü belirleyen alan (koşulda { alan } / { senaryoAyari } olarak geçer).
//    Bölümün EN ÜSTÜNDE, kayıt gruplarından önce gösterilir; iç içe kontrollerde üstteki önce (ör. "Farklı" → "Alt tip").
//  - Kayıt grubunun dalı: grubun alanlarının hepsi ya da çoğu (yarıdan fazlası) aynı kontrolün belirli değer(ler)ine bağlıysa grup o
//    dala aittir; başlıkta "<kontrol>: <değer(ler)>" gösterilir. Grubun görünürlüğü koşuda / formda üyelerin görünürlüğünden çıkar.
// Görünürlüğün kendisi tek doğrulayıcıdadır (senaryo-dogrulayici.mjs > gorunurlukleriHesapla); burada yalnız yapı okunur.
// Saf modül (DOM yok): senaryo formu ve birim testleri kullanır.

const nesneMi = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Görünürlüğün ifadesi (adlandırılmış koşul çözülür). @param {any} model @param {any} gorunurluk
 * @returns {any}
 */
function ifadesi(model, gorunurluk) {
  if (!nesneMi(gorunurluk)) return null;
  if (typeof gorunurluk.kosul === 'string') {
    const k = nesneMi(model.kosullar) ? model.kosullar[gorunurluk.kosul] : null;
    return nesneMi(k) ? k.ifade ?? null : null;
  }
  return gorunurluk.ifade ?? null;
}

/**
 * Modeldeki alanların kendi görünürlük ifadeleri: alan kimliği → ifade (adımlardaki bölüm alanları ve senaryo düzeyi alanları).
 * @param {any} model @returns {Map<string, any>}
 */
export function kosulHaritasi(model) {
  /** @type {Map<string, any>} */
  const harita = new Map();
  if (!nesneMi(model)) return harita;
  const ekle = (/** @type {any} */ a) => {
    if (!nesneMi(a) || typeof a.id !== 'string' || harita.has(a.id)) return;
    const ifade = ifadesi(model, a.gorunurluk);
    if (ifade) harita.set(a.id, ifade);
  };
  for (const adim of Array.isArray(model.adimlar) ? model.adimlar : []) {
    for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) ekle(a);
    }
  }
  const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : [];
  for (const a of sd) ekle(a);
  return harita;
}

/**
 * İfadede geçen alanlar ve değerleri: alan kimliği → { pozitif: görünür kılan değerler, negatif: "değil" altında geçen değerler }.
 * @param {any} ifade @returns {Map<string, { pozitif: Set<unknown>; negatif: Set<unknown> }>}
 */
export function kosulBasvurulari(ifade) {
  /** @type {Map<string, { pozitif: Set<unknown>; negatif: Set<unknown> }>} */
  const sonuc = new Map();
  const topla = (/** @type {any} */ x, /** @type {boolean} */ olumsuz) => {
    if (!nesneMi(x)) return;
    for (const alt of Array.isArray(x.ve) ? x.ve : []) topla(alt, olumsuz);
    for (const alt of Array.isArray(x.veya) ? x.veya : []) topla(alt, olumsuz);
    if ('degil' in x) topla(x.degil, !olumsuz);
    const id = typeof x.alan === 'string' ? x.alan : typeof x.senaryoAyari === 'string' ? x.senaryoAyari : null;
    if (!id) return;
    const k = sonuc.get(id) ?? { pozitif: new Set(), negatif: new Set() };
    const degerler = Array.isArray(x.icinde) ? x.icinde : 'esit' in x ? [x.esit] : [];
    for (const d of degerler) (olumsuz ? k.negatif : k.pozitif).add(d);
    sonuc.set(id, k);
  };
  topla(ifade, false);
  return sonuc;
}

/**
 * Bölümün alan düzeni: kontrol alanları (bölümdeki başka alanların görünürlüğünü belirleyenler) önde; iç içe kontrollerde
 * kontrol eden, kontrol edilenden önce. Diğer alanlar özgün sırasıyla.
 * @template {{ id: string }} T
 * @param {T[]} alanlar @param {Map<string, any>} kosullar
 * @returns {{ kontroller: T[]; digerleri: T[] }}
 */
export function bolumDuzeni(alanlar, kosullar) {
  const idler = new Set(alanlar.map((a) => a.id));
  /** alan kimliği → bu bölümde onu kontrol eden alanlar @type {Map<string, Set<string>>} */
  const kontrolEden = new Map();
  for (const a of alanlar) {
    const refs = [...kosulBasvurulari(kosullar.get(a.id)).keys()].filter((r) => r !== a.id && idler.has(r));
    if (refs.length) kontrolEden.set(a.id, new Set(refs));
  }
  const kontrolIdler = new Set([...kontrolEden.values()].flatMap((s) => [...s]));
  const kalan = alanlar.filter((a) => kontrolIdler.has(a.id));
  /** @type {T[]} */
  const kontroller = [];
  while (kalan.length) {
    const hazir = kalan.findIndex((a) => [...(kontrolEden.get(a.id) ?? [])].every((k) => !kontrolIdler.has(k) || kontroller.some((x) => x.id === k)));
    kontroller.push(kalan.splice(hazir < 0 ? 0 : hazir, 1)[0]);
  }
  return { kontroller, digerleri: alanlar.filter((a) => !kontrolIdler.has(a.id)) };
}

/**
 * Kayıt grubunun dalı: üyelerin yarıdan fazlası aynı kontrol alanına (grubun dışındaki) bağlıysa o kontrol ve grubu görünür kılan
 * değerler. Eşitlikte iç içe olan (koşulu diğer adayı içeren, yani daha derindeki) kontrol seçilir. Dal yoksa null.
 * @param {string[]} uyeIdler @param {Map<string, any>} kosullar
 * @returns {{ kontrolId: string; pozitif: unknown[]; negatif: unknown[] } | null}
 */
export function grupDali(uyeIdler, kosullar) {
  const uyeler = new Set(uyeIdler);
  /** @type {Map<string, { sayi: number; pozitif: Set<unknown>; negatif: Set<unknown> | null }>} */
  const adaylar = new Map();
  for (const id of uyeIdler) {
    for (const [k, v] of kosulBasvurulari(kosullar.get(id))) {
      if (uyeler.has(k)) continue;
      const a = adaylar.get(k) ?? { sayi: 0, pozitif: new Set(), negatif: null };
      a.sayi += 1;
      for (const d of v.pozitif) a.pozitif.add(d);
      // Negatif: yalnız tüm bağlı üyelerde "değil" olan değerler grubu gizler.
      a.negatif = a.negatif === null ? new Set(v.negatif) : new Set([...a.negatif].filter((d) => v.negatif.has(d)));
      adaylar.set(k, a);
    }
  }
  const enCok = Math.max(0, ...[...adaylar.values()].map((a) => a.sayi));
  if (!enCok || enCok * 2 <= uyeIdler.length) return null;
  const esitler = [...adaylar.entries()].filter(([, a]) => a.sayi === enCok).map(([k]) => k);
  const derin = esitler.find((k) => esitler.some((d) => d !== k && kosulBasvurulari(kosullar.get(k)).has(d)));
  const kontrolId = derin ?? esitler[0];
  const a = /** @type {{ pozitif: Set<unknown>; negatif: Set<unknown> | null }} */ (adaylar.get(kontrolId));
  if (!a.pozitif.size && !(a.negatif && a.negatif.size)) return null;
  return { kontrolId, pozitif: [...a.pozitif], negatif: [...(a.negatif ?? [])] };
}

/**
 * Grup görünürlüğü (üyelerin görünürlüğünden): üyelerin yarıdan fazlası gizliyse (false) grup gizli; görünür ve en az bir üyenin
 * durumu bilinmiyorsa (null; ör. kontrol tablodan, satıra göre değişiyor) "seçime göre değişir".
 * @param {Array<boolean | null | undefined>} durumlar
 * @returns {{ gizli: boolean; belirsiz: boolean }}
 */
export function grupGorunurlugu(durumlar) {
  const gizli = durumlar.filter((d) => d === false).length;
  const gizliMi = durumlar.length > 0 && gizli * 2 > durumlar.length;
  return { gizli: gizliMi, belirsiz: !gizliMi && durumlar.some((d) => d === null) };
}
