// DOLDUR ÖNERİSİ — saf eşleme (ORTAK: sunucu testleri ve arayüz; /arayuz/doldur-onerisi.mjs olarak sunulur, Node modülü içe aktarmaz).
// Boş bir alanın değeri YALNIZ test verisi tablosundan seçilir; burada hiçbir değer ÜRETİLMEZ (sentetik veri yok — kullanıcı kararı).
// Aday sütunlar sırayla:
//   1) bagli : alanın tablo sütunu bağı (ekranın Test verisi sekmesi / servisin Parametreler sekmesi). Bağ varsa YALNIZ o kullanılır.
//   2) ad    : adı alanın etiketiyle ya da kimliğinin son parçasıyla aynı sütunlar (esnek başlık: büyük / küçük harf, Türkçe karakter,
//              boşluk ve noktalama fark etmez — tablo-benzerligi.mjs > baslikNormal; "Adı aynı sütunlara bağla" ile aynı fikir).
//   3) liste : seçim alanında, liste tablosunun (Ekran listeleri) değerleri alanın seçenekleriyle uyan sütunu (sütunun karşılıkları —
//              sayfa değeri — da sayılır).
//   4) benzer: adı birebir değil ama BENZER sütunlar — biri ötekinin kısaltması / başı (en az 4 harf; "TEL" ↔ "Telefon") ya da küçük
//              eş anlam sözlüğünde aynı kavram (doğum tarihi: "D.TARİHİ" ↔ "Doğum tarihi"; telefon: tel / gsm / cep; kimlik: T.C. / kimlik no;
//              vergi no; e-posta). YALNIZ ADAYDIR: tek aday olsa bile kendiliğinden doldurulmaz, kullanıcı seçer.
// Seçim alanına gizli sütun önerilmez (seçenekleri listelenir); kimlik / kart / CVV / parola gibi alanlar da yalnız tablodan dolar.
// Aday satırlar: ortamda geçerli, aynı gruptaki (tablo + etiket) satır seçimi ve bağlı diğer alanların düz değerleriyle uyan, sütunu
// dolu satırlar. Gizli sütunun değeri gösterilmez: sunucunun kısmi maskesi (satir.gizliMaskeleri) ya da "•••"; hassas alanda açık
// sütunun değeri de kısmi maskelenir.
// Seçilen değer tablo bağlantısı olarak yazılır (${Tablo.Sütun} / ${Tablo[etiket].Sütun}); satır seçilirse grubun satır seçimi
// (tabloSecimleri["<tabloId>|<etiket>"] = satırın açık sütun değerleri) — koşu ve saklama biçimi değişmez.
import { basvuru, degerBasvurusuYaz, grupAnahtari, kismiMaske, sayfaDegeri, sutunBul, tabloBul, uyanSatirlar } from './tablo-secimi.mjs';
import { baslikNormal, tabloTuru } from './tablo-benzerligi.mjs';

/**
 * @typedef {{ deger: string; metin?: string }} DoldurSecenegi
 * @typedef {{ id: string; etiket: string; tip?: string; hassas?: boolean; secenekler?: Array<string | DoldurSecenegi> | null }} DoldurAlani
 * @typedef {{ tablo: string; sutun: string; etiket?: string }} DoldurBagi  tablo: kimlik ya da ad
 * @typedef {{ id?: string; ad?: string; ortamId?: string | null; degerler: Record<string, string | null>; gizliMaskeleri?: Record<string, string>; doluGizli?: string[] }} DoldurSatiri
 * @typedef {{ ad: string; gizli?: boolean; karsiliklar?: Record<string, { sayfa?: string; servis?: string }> }} DoldurSutunu
 * @typedef {{ id: string; ad: string; sutunlar: DoldurSutunu[]; satirlar: DoldurSatiri[]; baglam?: boolean; kaynak?: { tur?: string; tabloTuru?: string } | null }} DoldurTablosu
 * @typedef {{ satirId: string; sira: number; ad: string; gosterim: string; kosul: Record<string, string> }} AdaySatiri
 * @typedef {{ anahtar: string; tabloId: string; tablo: string; sutun: string; etiket: string; neden: 'bagli' | 'ad' | 'liste' | 'benzer'; gizli: boolean;
 *   grup: string; deger: string; basvuru: string; coklu: boolean; satirlar: AdaySatiri[] }} DoldurAdayi
 * @typedef {{ aday: DoldurAdayi; deger: string; basvuru: string; satir: AdaySatiri | null; tabloSecimi: { anahtar: string; kosul: Record<string, string> } | null }} DoldurSecimi
 * @typedef {{ alan: DoldurAlani; tablolar: DoldurTablosu[]; bag?: DoldurBagi | null; ortamId?: string | null;
 *   tabloSecimleri?: Record<string, Record<string, string>>; cokluGruplar?: string[];
 *   digerDegerler?: Array<DoldurBagi & { deger: unknown }> }} DoldurGirdisi
 */

/** Adaylarda görünen neden metinleri (arayüz). */
export const NEDEN_METINLERI = Object.freeze({ bagli: 'bağlı sütun', ad: 'adı uyan sütun', liste: 'liste tablosu', benzer: 'adı benzeyen sütun — kontrol edip seçin' });

/** Küçük eş anlam sözlüğü (normal ad üzerinde): aynı kavramdaki adlar benzer sayılır. Genel kavramlar; ürün / site adı yok. */
const KAVRAMLAR = /** @type {const} */ ([
  ['dogumTarihi', /(dogum|^dtarih|^dt$|^dogtar|birth|^dob$)/],
  ['telefon', /(telefon|^tel(no|num)?$|^tel[^a-z]|gsm|^cep|phone|mobile)/],
  ['kimlikNo', /(^tc$|^tc(no|kn|kimlik)|kimlik|identity|nationalid)/],
  ['vergiNo', /(vergi|^vkn)/],
  ['eposta', /(eposta|email|^mail)/],
  ['adSoyad', /(adsoyad|adisoyadi|fullname)/]
]);
/** @param {string} n normal ad @returns {string[]} */
const kavramlari = (n) => KAVRAMLAR.filter(([, d]) => d.test(n)).map(([k]) => k);
/**
 * İki ad benzer mi (birebir aynı değil): aynı kavram ya da biri ötekinin başı (kısa olanı en az 4 harf, kısaltma noktası yok sayılır).
 * @param {string} a normal ad @param {string} b normal ad
 */
export function benzerAdMi(a, b) {
  if (!a || !b || a === b) return false;
  const ka = kavramlari(a);
  if (ka.length && kavramlari(b).some((k) => ka.includes(k))) return true;
  const [kisa, uzun] = a.length <= b.length ? [a, b] : [b, a];
  return kisa.length >= 4 && uzun.startsWith(kisa);
}

const bos = (/** @type {unknown} */ v) => v === undefined || v === null || v === '';
/** @param {DoldurAlani} alan */
const secimMi = (alan) => alan.tip === 'secim' || alan.tip === 'okluSecim' || alan.tip === 'radyo';
/** @param {DoldurTablosu[]} tablolar @param {string} ad kimlik ya da ad */
const tabloyuBul = (tablolar, ad) => tablolar.find((t) => t.id === ad) ?? tabloBul(tablolar, ad);
/** @param {DoldurTablosu} t */
const baglamMi = (t) => t.baglam === true || String(t.id).startsWith('baglam_');

/** Seçenekler {deger, metin} biçiminde. @param {DoldurAlani} alan @returns {DoldurSecenegi[]} */
function secenekler(alan) {
  return (Array.isArray(alan.secenekler) ? alan.secenekler : [])
    .map((x) => (typeof x === 'string' ? { deger: x, metin: x } : { deger: String(x?.deger ?? ''), metin: String(x?.metin ?? x?.deger ?? '') }))
    .filter((x) => x.deger !== '');
}

/** Tablodaki değer alanın bir seçeneğine denk mi (değer, sayfa karşılığı ya da metin). */
function secenekteMi(/** @type {DoldurSecenegi[]} */ liste, /** @type {DoldurSutunu} */ sutun, /** @type {string} */ v) {
  if (!liste.length) return true;
  const sayfa = sayfaDegeri(/** @type {import('./tablo-secimi.mjs').Sutun} */ ({ gizli: false, ...sutun }), v);
  const k = baslikNormal(v);
  return liste.some((x) => x.deger === v || x.deger === sayfa || (k !== '' && baslikNormal(x.metin) === k));
}

/** Satırın açık sütun değerleri (satır seçiminin koşulu; gizli sütun koşula girmez). @param {DoldurTablosu} t @param {DoldurSatiri} r */
function satirKosulu(t, r) {
  /** @type {Record<string, string>} */
  const k = {};
  for (const c of t.sutunlar) if (!c.gizli && !bos(r.degerler[c.ad])) k[c.ad] = String(r.degerler[c.ad]);
  return k;
}

/** Satırda sütun dolu mu (gizli sütunda maske ya da doluGizli). @param {DoldurSutunu} c @param {DoldurSatiri} r */
const doluMu = (c, r) => (c.gizli ? Boolean(r.gizliMaskeleri?.[c.ad]) || Boolean(r.doluGizli?.includes(c.ad)) || !bos(r.degerler[c.ad]) : !bos(r.degerler[c.ad]));

/**
 * Bağlı diğer alanların düz değerleri → grup süzgeçleri ("<tabloId>|<etiket>" → { Sütun: değer }). Tablo başvurusu (${…}) süzgeç değildir.
 * @param {DoldurTablosu[]} tablolar @param {Array<DoldurBagi & { deger: unknown }>} liste
 */
function grupSuzgecleri(tablolar, liste) {
  /** @type {Record<string, Record<string, string>>} */
  const s = {};
  for (const d of liste) {
    if (bos(d.deger) || typeof d.deger === 'object' || (typeof d.deger === 'string' && /^\s*\$\{/.test(d.deger))) continue;
    const t = tabloyuBul(tablolar, d.tablo);
    const c = t ? sutunBul(/** @type {import('./tablo-secimi.mjs').Tablo} */ (/** @type {unknown} */ (t)), d.sutun) : undefined;
    if (!t || !c || c.gizli) continue;
    (s[grupAnahtari(t.id, d.etiket ?? '')] ??= {})[c.ad] = String(d.deger);
  }
  return s;
}

/**
 * Bir sütunun adayı (satırlarıyla). @param {DoldurGirdisi} g @param {DoldurTablosu} t @param {DoldurSutunu} c @param {string} etiket
 * @param {'bagli' | 'ad' | 'liste' | 'benzer'} neden @param {Record<string, Record<string, string>>} suzgecler @returns {DoldurAdayi}
 */
function adayKur(g, t, c, etiket, neden, suzgecler) {
  const grup = grupAnahtari(t.id, etiket);
  const coklu = (g.cokluGruplar ?? []).includes(grup);
  const secim = { ...(suzgecler[grup] ?? {}), ...(coklu ? {} : g.tabloSecimleri?.[grup] ?? {}) };
  const liste = secimMi(g.alan) ? secenekler(g.alan) : [];
  const uyan = uyanSatirlar(/** @type {import('./tablo-secimi.mjs').Tablo} */ (/** @type {unknown} */ (t)), secim, { ortamId: g.ortamId ?? null, haric: c.ad });
  /** @type {AdaySatiri[]} */
  const satirlar = [];
  for (const r of /** @type {DoldurSatiri[]} */ (/** @type {unknown} */ (uyan))) {
    if (!doluMu(c, r)) continue;
    const v = r.degerler[c.ad];
    if (!c.gizli && !secenekteMi(liste, c, String(v))) continue;
    const gosterim = c.gizli ? r.gizliMaskeleri?.[c.ad] || '•••' : g.alan.hassas ? kismiMaske(v) : String(v);
    satirlar.push({ satirId: String(r.id ?? ''), sira: t.satirlar.indexOf(r) + 1, ad: String(r.ad ?? ''), gosterim, kosul: satirKosulu(t, r) });
  }
  const b = basvuru(t.ad, c.ad, etiket);
  return {
    anahtar: `${t.id}\u0001${c.ad}\u0001${etiket}`, tabloId: t.id, tablo: t.ad, sutun: c.ad, etiket, neden, gizli: Boolean(c.gizli), grup,
    deger: degerBasvurusuYaz(t.ad, c.ad, etiket), basvuru: b, coklu, satirlar
  };
}

/**
 * Alan için aday tablo sütunları ve satırları. Bağ varsa yalnız bağlı sütun (satırı olmasa da: "sütunda değer yok"); yoksa adı uyan
 * sütunlar, seçim alanında ayrıca liste tabloları (satırı olmayan aday düşer). Değer üretmez.
 * @param {DoldurGirdisi} g @returns {DoldurAdayi[]}
 */
export function doldurAdaylari(g) {
  const tablolar = (g.tablolar ?? []).filter((t) => !baglamMi(t));
  const suzgecler = grupSuzgecleri(tablolar, g.digerDegerler ?? []);
  const secimAlani = secimMi(g.alan);
  if (g.bag && g.bag.tablo && g.bag.sutun) {
    const t = tabloyuBul(tablolar, g.bag.tablo);
    const c = t ? sutunBul(/** @type {import('./tablo-secimi.mjs').Tablo} */ (/** @type {unknown} */ (t)), g.bag.sutun) : undefined;
    if (t && c) return [adayKur(g, t, c, String(g.bag.etiket ?? ''), 'bagli', suzgecler)];
  }
  const adlar = new Set([g.alan.etiket, String(g.alan.id ?? '').split(/[/.]/).pop()].map(baslikNormal).filter(Boolean));
  const liste = secimAlani ? secenekler(g.alan) : [];
  /** @type {DoldurAdayi[]} */
  const adaylar = [];
  const eklendi = new Set();
  for (const t of tablolar) {
    for (const c of t.sutunlar) {
      if (secimAlani && c.gizli) continue;
      if (!adlar.has(baslikNormal(c.ad))) continue;
      const a = adayKur(g, t, c, '', 'ad', suzgecler);
      if (a.satirlar.length && !eklendi.has(a.anahtar)) { adaylar.push(a); eklendi.add(a.anahtar); }
    }
  }
  // Benzer adlı sütunlar (yalnız aday; kendiliğinden doldurulmaz).
  for (const t of tablolar) {
    for (const c of t.sutunlar) {
      if (secimAlani && c.gizli) continue;
      const n = baslikNormal(c.ad);
      if (adlar.has(n) || ![...adlar].some((x) => benzerAdMi(x, n))) continue;
      const a = adayKur(g, t, c, '', 'benzer', suzgecler);
      if (a.satirlar.length && !eklendi.has(a.anahtar)) { adaylar.push(a); eklendi.add(a.anahtar); }
    }
  }
  if (secimAlani && liste.length) {
    for (const t of tablolar) {
      if (tabloTuru(t) !== 'liste') continue;
      for (const c of t.sutunlar) {
        if (c.gizli) continue;
        const degerler = t.satirlar.map((r) => r.degerler[c.ad]).filter((v) => !bos(v)).map(String);
        if (!degerler.length || !degerler.every((v) => secenekteMi(liste, c, v))) continue;
        const a = adayKur(g, t, c, '', 'liste', suzgecler);
        if (a.satirlar.length && !eklendi.has(a.anahtar)) { adaylar.push(a); eklendi.add(a.anahtar); }
      }
    }
  }
  return adaylar;
}

/**
 * Adaydan seçim: değer = tablo bağlantısı; satır verilirse (çoklu satır grubunda değilse) grubun satır seçimi o satırın koşulu olur.
 * @param {DoldurAdayi} aday @param {string | null} [satirId] @returns {DoldurSecimi}
 */
export function adaySecimi(aday, satirId = null) {
  const satir = satirId === null ? null : aday.satirlar.find((r) => r.satirId === satirId) ?? null;
  return {
    aday, deger: aday.deger, basvuru: aday.basvuru, satir,
    tabloSecimi: satir && !aday.coklu && Object.keys(satir.kosul).length ? { anahtar: aday.grup, kosul: { ...satir.kosul } } : null
  };
}

/**
 * Tek anlamlı eşleşme: tek aday ve (çoklu satır grubunda ya da) tek satır. Yoksa null (kullanıcı seçer ya da elle yazar).
 * @param {DoldurAdayi[]} adaylar @returns {DoldurSecimi | null}
 */
export function tekAnlamliSecim(adaylar) {
  if (adaylar.length !== 1) return null;
  const a = adaylar[0];
  // Benzer ad yalnız öneridir: kullanıcı seçmeden doldurulmaz.
  if (a.neden === 'benzer') return null;
  if (!a.satirlar.length) return null;
  if (a.coklu) return adaySecimi(a, null);
  return a.satirlar.length === 1 ? adaySecimi(a, a.satirlar[0].satirId) : null;
}

/**
 * "Tümünü doldur (tablodan)": yalnız tek anlamlı eşleşmesi olan alanları doldurur; bir alanın satır seçimi aynı gruptaki diğer
 * alanları tek anlamlı yapabildiği için değişiklik kalmayana dek tekrarlanır. Kalanlar nedenleriyle döner (yok / bos / coklu).
 * Değer üretmez: tablo yoksa alan boş kalır.
 * @param {Omit<DoldurGirdisi, 'alan' | 'bag'> & { alanlar: Array<{ alan: DoldurAlani; bag?: DoldurBagi | null }> }} g
 * @returns {{ dolanlar: Array<{ alanId: string; etiket: string; secim: DoldurSecimi }>; kalanlar: Array<{ alanId: string; etiket: string; neden: 'yok' | 'bos' | 'coklu'; adaySayisi: number }>;
 *   tabloSecimleri: Record<string, Record<string, string>> }}
 */
export function tumunuDoldur(g) {
  /** @type {Record<string, Record<string, string>>} */
  const tabloSecimleri = JSON.parse(JSON.stringify(g.tabloSecimleri ?? {}));
  let bekleyen = [...g.alanlar];
  /** @type {Array<{ alanId: string; etiket: string; secim: DoldurSecimi }>} */
  const dolanlar = [];
  for (let tur = 0; tur < 20 && bekleyen.length; tur++) {
    const kalan = [];
    let degisti = false;
    for (const x of bekleyen) {
      const secim = tekAnlamliSecim(doldurAdaylari({ ...g, alan: x.alan, bag: x.bag ?? null, tabloSecimleri }));
      if (!secim) { kalan.push(x); continue; }
      if (secim.tabloSecimi) tabloSecimleri[secim.tabloSecimi.anahtar] = { ...secim.tabloSecimi.kosul };
      dolanlar.push({ alanId: x.alan.id, etiket: x.alan.etiket, secim });
      degisti = true;
    }
    bekleyen = kalan;
    if (!degisti) break;
  }
  const kalanlar = bekleyen.map((x) => {
    const adaylar = doldurAdaylari({ ...g, alan: x.alan, bag: x.bag ?? null, tabloSecimleri });
    /** @type {'yok' | 'bos' | 'coklu'} */
    const neden = !adaylar.length ? 'yok' : adaylar.length === 1 && !adaylar[0].satirlar.length ? 'bos' : 'coklu';
    return { alanId: x.alan.id, etiket: x.alan.etiket, neden, adaySayisi: adaylar.length };
  });
  return { dolanlar, kalanlar, tabloSecimleri };
}
