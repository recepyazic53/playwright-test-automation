// TABLO BENZERLİĞİ (saf; vt yok). "Birleştirilebilecek tablolar" önerisi, sütun eşleme önerisi, tablo türü sezgisi ve yeni tablo
// oluşturulurken "Benzer tablo var" uyarısı bu kuralları kullanır (tablo-birlestirme.mjs, tablo-uclari.mjs).
//   · Esnek başlık: büyük / küçük harf, Türkçe karakter (ı→i, ş→s …), boşluk ve noktalama, sütun sırası fark etmez
//     ("tcKimlikNo" ≈ "T.C. kimlik no"). Birebir normal ad eşleşmesi kesindir; yalnız benzeyen (biri ötekini içeriyor ya da yazım
//     farkı küçük) eşleşme ÖNERİDİR — kullanıcı sütun eşleme ekranında onaylar.
//   · Tür: ekran listesi ↔ ekran listesi, kişi / kayıt ↔ kişi / kayıt (kaynak.tabloTuru; yoksa Tablolar ekranındaki sezgiyle aynı:
//     kaynaklı tablo ya da "<Ekran> — <…>" adlı tek sütunlu / bir ekranın alan bağlarında kullanılan / ekran adıyla başlayan tablo
//     ekran listesidir). Bağlam tabloları önerilmez.
//   · Gruplar: "birebir" (başlıklar ve satırlar aynı), "cogu" (başlıklar aynı ve satırların çoğu ortak ya da başlıkların çoğu aynı),
//     "veriFarkli" (başlıklar aynı, veriler farklı). Puan 0–100; öneriler puana göre sıralanır. Satır karşılaştırması imzayla yapılır
//     (gizli değerler dahil; imza çağıran tarafından hesaplanır, değer DÖNMEZ).
//   · Genel sütun adları ("kod", "açıklama", "ad", "değer", "id" …) az ayırt edicidir: başlık benzerliğinde düşük ağırlık alır
//     (GENEL_AGIRLIK); yalnız bu adlarda ortak olan tablolar düşük puan alır. Eşik altı öneriler arayüzde varsayılan gizlidir
//     (Veri > "Birleştirme önerisi eşiği").

/** @typedef {{ ad: string; gizli?: boolean }} BSutun */
/** @typedef {{ id: string; ad: string; sutunlar: BSutun[]; baglam?: boolean; kaynak?: { tur?: string; ekran?: string; tabloTuru?: string } | null; satirImzalari?: string[]; satirlar?: Array<{ degerler: Record<string, unknown> }> }} BTablo */

const HARFLER = /** @type {Record<string, string>} */ ({ ı: 'i', i: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' });

/** Başlığın karşılaştırma biçimi: küçük harf, Türkçe karakterler Latin, yalnız harf / rakam. @param {unknown} ad */
export function baslikNormal(ad) {
  return String(ad ?? '').toLocaleLowerCase('tr').replace(/[ıişğüöçâîû]/g, (c) => HARFLER[c] ?? c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/** İki normal ad arasındaki düzenleme uzaklığı (kısa adlar için). @param {string} a @param {string} b */
export function uzaklik(a, b) {
  if (a === b) return 0;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let onceki = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, onceki + (a[i - 1] === b[j - 1] ? 0 : 1));
      onceki = t;
    }
  }
  return d[b.length];
}

/** İki başlık benziyor mu (kesin değil; öneri): biri ötekini içeriyor (en az 3 harf) ya da yazım farkı küçük. @param {string} a @param {string} b */
export function basliklarBenzer(a, b) {
  const x = baslikNormal(a);
  const y = baslikNormal(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))) return true;
  return Math.max(x.length, y.length) >= 5 && uzaklik(x, y) <= Math.floor(Math.max(x.length, y.length) / 5);
}

/**
 * Kaynak sütunların hedef sütunlara eşleme önerisi: birebir normal ad → kesin; benzeyen → öneri (kesin: false); yoksa null (yeni
 * sütun olarak eklenir; kesin: false). Her hedef sütun en çok bir kaynak sütuna eşlenir.
 * @param {BSutun[]} kaynak @param {BSutun[]} hedef
 * @returns {Array<{ kaynak: string; hedef: string | null; kesin: boolean }>}
 */
export function sutunEslemesiOner(kaynak, hedef) {
  /** @type {Set<string>} */
  const kullanilan = new Set();
  /** @type {Map<string, { hedef: string | null; kesin: boolean }>} */
  const sonuc = new Map();
  for (const s of kaynak) {
    const h = hedef.find((x) => !kullanilan.has(x.ad) && baslikNormal(x.ad) === baslikNormal(s.ad));
    if (h) { kullanilan.add(h.ad); sonuc.set(s.ad, { hedef: h.ad, kesin: true }); }
  }
  for (const s of kaynak) {
    if (sonuc.has(s.ad)) continue;
    const h = hedef.find((x) => !kullanilan.has(x.ad) && basliklarBenzer(x.ad, s.ad));
    if (h) kullanilan.add(h.ad);
    sonuc.set(s.ad, { hedef: h ? h.ad : null, kesin: false });
  }
  return kaynak.map((s) => ({ kaynak: s.ad, .../** @type {{ hedef: string | null; kesin: boolean }} */ (sonuc.get(s.ad)) }));
}

const AD_DESENI = /^(.+?)\s+—\s+(.+)$/;
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');

/**
 * Tablo türü: kaynak.tabloTuru; yoksa sezgi (Tablolar ekranındaki liste gruplamasıyla aynı kural).
 * @param {BTablo} t @param {{ ekranAdlari?: string[]; ekranKullanimi?: Record<string, string[]> }} [ek]
 * @returns {'liste' | 'kayit' | 'servis'}
 */
export function tabloTuru(t, ek = {}) {
  const tur = t.kaynak?.tabloTuru;
  if (tur === 'liste' || tur === 'kayit' || tur === 'servis') return tur;
  const desen = AD_DESENI.exec(String(t.ad || ''));
  const ekranlar = new Set((ek.ekranAdlari ?? []).map(kucuk));
  const ekranAdiMi = (/** @type {string} */ onEk) => ekranlar.has(kucuk(onEk)) || ekranlar.has(kucuk(onEk.replace(/\s*\([^)]*\)\s*$/, '')));
  const bagli = Boolean(ek.ekranKullanimi?.[t.id]?.length);
  return t.kaynak?.tur || (desen && (t.sutunlar.length === 1 || bagli || ekranAdiMi(desen[1].trim()))) ? 'liste' : 'kayit';
}

/** Az ayırt edici genel sütun adları (normal biçim): benzerlik puanında düşük ağırlık. */
export const GENEL_SUTUNLAR = Object.freeze(['kod', 'kodu', 'aciklama', 'ad', 'adi', 'isim', 'deger', 'id', 'no', 'tip', 'tur', 'turu', 'durum', 'not', 'sira', 'etiket', 'metin']);
/** Genel sütun adının ağırlığı (diğerleri 1). */
export const GENEL_AGIRLIK = 0.3;
/** @param {string} n normal ad */
const agirlik = (n) => (GENEL_SUTUNLAR.includes(n) ? GENEL_AGIRLIK : 1);

/** Başlık kümesi benzerliği (normal adlarla; Jaccard). "Başlıkların çoğu aynı mı" kararında kullanılır. @param {BSutun[]} a @param {BSutun[]} b */
export function baslikBenzerligi(a, b) {
  const x = new Set(a.map((s) => baslikNormal(s.ad)).filter(Boolean));
  const y = new Set(b.map((s) => baslikNormal(s.ad)).filter(Boolean));
  const ortak = [...x].filter((k) => y.has(k)).length;
  const birlesim = new Set([...x, ...y]).size;
  return birlesim ? ortak / birlesim : 0;
}

/** Puan için ağırlıklı başlık benzerliği (Jaccard; genel adlar GENEL_AGIRLIK). @param {BSutun[]} a @param {BSutun[]} b */
export function agirlikliBaslikBenzerligi(a, b) {
  const x = new Set(a.map((s) => baslikNormal(s.ad)).filter(Boolean));
  const y = new Set(b.map((s) => baslikNormal(s.ad)).filter(Boolean));
  const topla = (/** @type {Iterable<string>} */ l) => [...l].reduce((t, k) => t + agirlik(k), 0);
  const birlesim = topla(new Set([...x, ...y]));
  return birlesim ? topla([...x].filter((k) => y.has(k))) / birlesim : 0;
}

/** Başlık kümesinin ayırt ediciliği (GENEL_AGIRLIK–1): yalnız genel adlardan oluşan başlıklar düşük. @param {BSutun[]} sutunlar */
export function baslikAyirtEdiciligi(sutunlar) {
  const x = [...new Set(sutunlar.map((s) => baslikNormal(s.ad)).filter(Boolean))];
  return x.length ? x.reduce((t, k) => t + agirlik(k), 0) / x.length : 0;
}

/** Satır örtüşmesi: küçük tablonun satırlarından kaçı ötekinde de var (imzalarla; 0–1). @param {string[]} a @param {string[]} b */
export function satirOrtusmesi(a, b) {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const [kucukListe, buyuk] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return kucukListe.filter((x) => buyuk.has(x)).length / kucukListe.length;
}

/** @typedef {'birebir' | 'cogu' | 'veriFarkli'} BenzerlikGrubu */
/** @typedef {{ tablolar: string[]; grup: BenzerlikGrubu; puan: number; tur: 'liste' | 'kayit' | 'servis'; eslemeGerekli: boolean }} BirlestirmeOnerisi */

/**
 * Birleştirilebilecek tablolar: adları farklı, başlıkları aynı (esnek) ya da çoğu aynı, türü aynı tablolar. Aynı başlık kümesindekiler
 * tek öneride toplanır; başlıkların çoğu aynı olanlar ikili öneridir (sütun eşleme gerekir).
 * @param {BTablo[]} tablolar satirImzalari: satır imzaları (sütun normal adıyla, sıradan bağımsız) — çağıran hesaplar
 * @param {{ ekranAdlari?: string[]; ekranKullanimi?: Record<string, string[]> }} [ek]
 * @returns {BirlestirmeOnerisi[]}
 */
export function birlestirmeOnerileri(tablolar, ek = {}) {
  const adaylar = tablolar.filter((t) => !t.baglam && t.sutunlar.length);
  const tur = new Map(adaylar.map((t) => [t.id, tabloTuru(t, ek)]));
  const anahtar = (/** @type {BTablo} */ t) => [...new Set(t.sutunlar.map((s) => baslikNormal(s.ad)))].sort().join('|');
  /** @type {Map<string, BTablo[]>} */
  const kumeler = new Map();
  for (const t of adaylar) {
    const k = `${tur.get(t.id)}#${anahtar(t)}`;
    if (!kumeler.has(k)) kumeler.set(k, []);
    /** @type {BTablo[]} */ (kumeler.get(k)).push(t);
  }
  /** @type {BirlestirmeOnerisi[]} */
  const sonuc = [];
  // Tek sütunlu (ör. "Değer") ekran listeleri başlıkça hep aynıdır: yalnız satırlarının çoğu ortak olanlar birlikte önerilir.
  /** @type {BTablo[][]} */
  const gruplar = [];
  for (const ts of kumeler.values()) {
    if (ts.length < 2) continue;
    if (ts[0].sutunlar.length > 1) { gruplar.push(ts); continue; }
    const kok = ts.map((_, i) => i);
    const bul = (/** @type {number} */ i) => { while (kok[i] !== i) i = kok[i] = kok[kok[i]]; return i; };
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      if (satirOrtusmesi(ts[i].satirImzalari ?? [], ts[j].satirImzalari ?? []) >= 0.5) kok[bul(i)] = bul(j);
    }
    /** @type {Map<number, BTablo[]>} */
    const bilesenler = new Map();
    ts.forEach((t, i) => { const k = bul(i); if (!bilesenler.has(k)) bilesenler.set(k, []); /** @type {BTablo[]} */ (bilesenler.get(k)).push(t); });
    for (const b of bilesenler.values()) if (b.length > 1) gruplar.push(b);
  }
  for (const ts of gruplar) {
    /** @type {number[]} */
    const ortusmeler = [];
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) ortusmeler.push(satirOrtusmesi(ts[i].satirImzalari ?? [], ts[j].satirImzalari ?? []));
    const enAz = Math.min(...ortusmeler);
    const ort = ortusmeler.reduce((a, b) => a + b, 0) / ortusmeler.length;
    const imzaKumesi = (/** @type {BTablo} */ t) => JSON.stringify([...new Set(t.satirImzalari ?? [])].sort());
    const ayni = ts.every((t) => imzaKumesi(t) === imzaKumesi(ts[0]));
    /** @type {BenzerlikGrubu} */
    const grup = ayni ? 'birebir' : ort >= 0.5 ? 'cogu' : 'veriFarkli';
    // Başlıklar aynı: başlık payı başlıkların ayırt ediciliğiyle (genel adlar düşük); satırlar da aynıysa 100.
    const baslikPayi = ayni ? 1 : baslikAyirtEdiciligi(ts[0].sutunlar);
    sonuc.push({ tablolar: ts.map((t) => t.id), grup, puan: Math.round(100 * (0.6 * baslikPayi + 0.4 * (ayni ? 1 : Math.max(enAz, ort)))), tur: /** @type {'liste' | 'kayit' | 'servis'} */ (tur.get(ts[0].id)), eslemeGerekli: false });
  }
  // Başlıkların çoğu aynı (ama tamamı değil): ikili öneri, sütun eşleme gerekir.
  for (let i = 0; i < adaylar.length; i++) {
    for (let j = i + 1; j < adaylar.length; j++) {
      const a = adaylar[i];
      const b = adaylar[j];
      if (tur.get(a.id) !== tur.get(b.id) || anahtar(a) === anahtar(b) || a.sutunlar.length < 2 || b.sutunlar.length < 2) continue;
      const j2 = baslikBenzerligi(a.sutunlar, b.sutunlar);
      if (j2 < 0.6) continue;
      const o = satirOrtusmesi(a.satirImzalari ?? [], b.satirImzalari ?? []);
      sonuc.push({ tablolar: [a.id, b.id], grup: 'cogu', puan: Math.round(100 * (0.6 * agirlikliBaslikBenzerligi(a.sutunlar, b.sutunlar) + 0.4 * o)), tur: /** @type {'liste' | 'kayit' | 'servis'} */ (tur.get(a.id)), eslemeGerekli: true });
    }
  }
  const sira = { birebir: 0, cogu: 1, veriFarkli: 2 };
  return sonuc.sort((x, y) => y.puan - x.puan || sira[x.grup] - sira[y.grup]);
}

/** Hücre değerinin karşılaştırma biçimi (paket birleştirmesiyle aynı: birebir değer; boş / null yok sayılır). @param {unknown} v */
const hucre = (v) => (v === null || v === undefined || v === '' ? null : String(v));

/**
 * Yeni oluşturulacak tabloya benzeyen mevcut tablolar (önleme: "Benzer tablo var: X — onu kullan / yine de yeni oluştur"):
 * başlıkları aynı (esnek, sıradan bağımsız) ya da çoğu aynı (≥ %80) tablolar; ad aynıysa zaten aynı tablo sayılır, listelenmez.
 * Tek sütunlu tablo: başlık tek başına az ayırt edicidir. Yalnız başlığın normal adı eşit VE genel ad değilse (GENEL_SUTUNLAR;
 * "Değer" listeleri önerilmez) VE satırlar örtüşüyorsa (küçük tablonun değerlerinin en az %50'si ötekinde; satirOrtusmesi) tek
 * sütunlu mevcut tablo önerilir. Değerler birebir karşılaştırılır (paket birleştirmesindeki satır eşlemesiyle aynı); yeni tablonun
 * dolu satırı yoksa öneri çıkmaz. Sonuçta değer dönmez (gizli sütun değerleri dahil).
 * @param {BSutun[] | string[]} sutunlar @param {BTablo[]} tablolar
 * @param {{ ad?: string; haricId?: string; satirlar?: Array<Record<string, unknown>> }} [s] satirlar: yeni tablonun satırları (sütun adı → değer)
 * @returns {Array<{ id: string; ad: string; puan: number; ayni: boolean }>}
 */
export function benzerTablolar(sutunlar, tablolar, s = {}) {
  const yeni = sutunlar.map((x) => (typeof x === 'string' ? { ad: x } : x)).filter((x) => baslikNormal(x.ad));
  const adaylar = tablolar.filter((t) => !t.baglam && t.id !== s.haricId && (!s.ad || kucuk(t.ad) !== kucuk(s.ad)));
  if (yeni.length === 1) {
    const n = baslikNormal(yeni[0].ad);
    if (GENEL_SUTUNLAR.includes(n)) return [];
    const kume = (/** @type {unknown[]} */ l) => [...new Set(l.map(hucre).filter((v) => v !== null))].map(String);
    const degerler = kume((s.satirlar ?? []).map((d) => d?.[yeni[0].ad]));
    if (!degerler.length) return [];
    return adaylar.filter((t) => t.sutunlar.length === 1 && baslikNormal(t.sutunlar[0].ad) === n)
      .map((t) => ({ t, o: satirOrtusmesi(degerler, kume((t.satirlar ?? []).map((r) => r.degerler?.[t.sutunlar[0].ad]))) }))
      .filter((x) => x.o >= 0.5)
      .map((x) => ({ id: x.t.id, ad: x.t.ad, puan: Math.round(100 * (0.6 + 0.4 * x.o)), ayni: true }))
      .sort((a, b) => b.puan - a.puan);
  }
  if (yeni.length < 2) return [];
  return adaylar
    .map((t) => ({ id: t.id, ad: t.ad, puan: Math.round(100 * baslikBenzerligi(yeni, t.sutunlar)) }))
    .filter((x) => x.puan >= 80).map((x) => ({ ...x, ayni: x.puan === 100 })).sort((a, b) => b.puan - a.puan);
}
