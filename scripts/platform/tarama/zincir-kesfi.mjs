// BAĞLI ALAN ZİNCİRİ — SAF KURALLAR (genel; DOM yok, ürün / site / alan adı yok). Bir seçim yapılınca başka bir listenin seçenekleri
// değişiyor, liste etkinleşiyor ya da yeni bir liste beliriyorsa ikinci liste birinciye BAĞLIDIR (il → ilçe → mahalle, marka → model
// → paket, ülke → şehir…). Bağlantı alan adından değil, sayfanın DAVRANIŞINDAN çıkarılır; bu dosya o davranışın kurallarını tutar:
//  - degisenSecimler: iki sayfa okuması arasında seçenekleri değişen / etkinleşen / beliren açılır listeler (bağlı alan adayları).
//  - birinciDuzeyIliskiler: seçim keşfinin (tarama-motoru.ts > secimleriKesfet) sonuçlarından üst → alt ilişkileri ve zincirin kökleri.
//  - ornekDegerler: bir listede denenecek değerler (ilk, son ve aradan eşit aralıklı; her koşuda aynı → sonuç tekrarlanabilir).
//  - bulgular: üst değer seçilince alt listenin boş kalması, aynı seçeneğin iki kez listelenmesi, seçimin yapılamaması, seçim sonrası
//    hata mesajı ya da sayfanın başka adrese gitmesi; bulguMetni kullanıcıya gösterilen sade cümleyi kurar.
//  - zincirMetni: "İl → İlçe → Mahalle" biçiminde özet.
// Zinciri sayfada yürüten motor: zincir-motoru.ts. NOT: import.meta KULLANILMAZ. Tipler: zincir-kesfi.d.mts.
import { yerTutucuSecenekMi } from './yer-tutucu-secenek.mjs';

/** Zincirde en çok kaç kat inilir (Ayarlar > Koşu > Tarama ve akış kaydı). */
export const ZINCIR_DERINLIK_VARSAYILAN = 8;
/** Her katta kaç değer denenir (ilk, son ve aradan). */
export const ZINCIR_ORNEK_VARSAYILAN = 3;
/** Üst değer seçildikten sonra alt listenin seçeneklerinin gelmesi en çok bu kadar beklenir (ağ sakinleştikten sonra). */
export const ZINCIR_SECENEK_BEKLEME_MS = 8_000;
/** Bir zincir keşfinde sayfa en çok bu kadar kez yeniden açılır (süre sınırı; aşılırsa not düşülür). */
export const ZINCIR_EN_COK_ACILIS = 40;
/** En çok kaç kök (zincirin ilk listesi) incelenir. */
export const ZINCIR_EN_COK_KOK = 6;

/** @typedef {{ deger: string; metin: string }} Secenek */
/** @typedef {import('./zincir-kesfi.d.mts').ZincirAlani} ZincirAlani */
/** @typedef {import('./zincir-kesfi.d.mts').ZincirBulgusu} ZincirBulgusu */

/**
 * Listenin gerçek seçenekleri: boş değerli ve yer tutucu ("Seçiniz", "-- Lütfen seçin --") seçenekler atılır.
 * @param {ReadonlyArray<{ deger: string; metin?: string | null }> | null | undefined} liste @returns {Secenek[]}
 */
export function gercekSecenekler(liste) {
  return (liste ?? []).filter((s, i) => s && String(s.deger) !== '' && !yerTutucuSecenekMi(s.metin, s.deger, i === 0))
    .map((s) => ({ deger: String(s.deger), metin: String(s.metin ?? s.deger) }));
}

/** Alanın seçenekleri (açılır liste ya da radyo grubu). @param {ZincirAlani} a */
const secenekleri = (a) => a.secenekler ?? (a.radyolar ?? []).map((r) => ({ deger: r.deger, metin: r.metin ?? r.deger }));
/** Seçeneklerin imzası (yalnız gerçek seçeneklerin değerleri). @param {ZincirAlani} a */
const imza = (a) => JSON.stringify(gercekSecenekler(secenekleri(a)).map((s) => s.deger));
/** Bağlı liste olabilecek alan: tekli açılır liste. @param {ZincirAlani} a */
const listeMi = (a) => a.tur === 'select' && !a.coklu;

/**
 * Denenecek değerler: n'den azsa hepsi; değilse ilk, son ve aradan eşit aralıklı olanlar (rastgele değil: her keşif aynı değerleri dener).
 * @param {ReadonlyArray<{ deger: string; metin?: string | null }> | null | undefined} liste @param {number} n @returns {Secenek[]}
 */
export function ornekDegerler(liste, n) {
  const l = gercekSecenekler(liste);
  const adet = Math.max(1, Math.floor(n));
  if (l.length <= adet) return l;
  if (adet === 1) return [l[0]];
  const siralar = [...new Set(Array.from({ length: adet }, (_, k) => Math.round((k * (l.length - 1)) / (adet - 1))))];
  return siralar.map((i) => l[i]);
}

/**
 * İki okuma arasında değişen açılır listeler (bağlı alan adayları): seçenekleri değişen ('secenek'), devre dışıyken etkinleşen
 * ('etkinlesti') ya da önceki okumada olmayıp gerçek seçenekle beliren ('belirdi'). haric: seçilen alanın kendisi ve zincirin üstleri.
 * @param {ReadonlyArray<ZincirAlani>} once @param {ReadonlyArray<ZincirAlani>} sonra @param {ReadonlySet<string>} haric
 * @returns {Array<{ anahtar: string; neden: 'secenek' | 'etkinlesti' | 'belirdi'; alan: ZincirAlani }>}
 */
export function degisenSecimler(once, sonra, haric) {
  const onceki = new Map(once.map((a) => [a.anahtar, a]));
  /** @type {Array<{ anahtar: string; neden: 'secenek' | 'etkinlesti' | 'belirdi'; alan: ZincirAlani }>} */
  const sonuc = [];
  for (const a of sonra) {
    if (haric.has(a.anahtar) || !listeMi(a)) continue;
    const o = onceki.get(a.anahtar);
    if (!o) { if (gercekSecenekler(secenekleri(a)).length) sonuc.push({ anahtar: a.anahtar, neden: 'belirdi', alan: a }); continue; }
    if (imza(o) !== imza(a)) sonuc.push({ anahtar: a.anahtar, neden: 'secenek', alan: a });
    else if (o.devreDisi && !a.devreDisi) sonuc.push({ anahtar: a.anahtar, neden: 'etkinlesti', alan: a });
  }
  return sonuc;
}

/**
 * Seçim keşfinin sonuçlarından (secimleriKesfet; hızlı testin sade biçimi de olur) birinci düzey üst → alt ilişkileri: bir AÇILIR LİSTENİN
 * değeri değişince seçenekleri değişen, etkinleşen ya da beliren açılır listeler. Radyo / onay kutusuna bağlı beliren alanlar görünürlük
 * koşuludur (zincir değil). Bir alt liste birden çok üste bağlı görünürse ilk üst alınır. Kökler: alt olmayan üstler (sayfa sırasıyla).
 * @param {ReadonlyArray<{ secim: string; tur?: string | null; degerler: ReadonlyArray<{ deger: string; gezinme?: string | null; hata?: string | null; gorunenler?: ReadonlyArray<ZincirAlani>; secenekler?: Record<string, unknown>; etkinlesenler?: ReadonlyArray<string> }> }>} kesifler
 * @param {ReadonlyArray<ZincirAlani>} alanlar sayfanın ilk okuması (alan türleri için)
 * @returns {{ iliskiler: Array<{ ust: string; alt: string }>; kokler: string[] }}
 */
export function birinciDuzeyIliskiler(kesifler, alanlar) {
  const tur = new Map(alanlar.map((a) => [a.anahtar, a]));
  /** @type {Map<string, string>} alt → üst */
  const ustu = new Map();
  for (const k of kesifler) {
    const ust = tur.get(k.secim);
    if (!ust || !listeMi(ust) || (k.tur && k.tur !== 'secim')) continue;
    for (const d of k.degerler) {
      if (d.gezinme || d.hata) continue;
      const altlar = new Set([...Object.keys(d.secenekler ?? {}), ...(d.etkinlesenler ?? []), ...(d.gorunenler ?? []).filter(listeMi).map((a) => a.anahtar)]);
      for (const alt of altlar) {
        if (alt === k.secim || ustu.has(alt)) continue;
        const a = tur.get(alt) ?? (d.gorunenler ?? []).find((x) => x.anahtar === alt);
        if (a && listeMi(a)) ustu.set(alt, k.secim);
      }
    }
  }
  // Döngü (A → B → A) olmasın: ikinci yön atılır.
  for (const [alt, ust] of [...ustu]) if (ustu.get(ust) === alt) ustu.delete(alt);
  const iliskiler = [...ustu].map(([alt, ust]) => ({ ust, alt }));
  const sira = new Map(alanlar.map((a, i) => [a.anahtar, i]));
  const kokler = [...new Set(iliskiler.map((i) => i.ust))].filter((u) => !ustu.has(u)).sort((x, y) => (sira.get(x) ?? 1e6) - (sira.get(y) ?? 1e6));
  return { iliskiler, kokler };
}

/**
 * Aynı görünen metinle birden çok kez listelenen seçenekler (katlanmış metinle karşılaştırılır).
 * @param {ReadonlyArray<{ deger: string; metin?: string | null }>} liste @returns {string[]}
 */
export function tekrarlayanSecenekler(liste) {
  const sayac = new Map();
  for (const s of gercekSecenekler(liste)) {
    const k = s.metin.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
    const v = sayac.get(k) ?? { metin: s.metin, adet: 0 };
    v.adet++;
    sayac.set(k, v);
  }
  return [...sayac.values()].filter((v) => v.adet > 1).map((v) => v.metin);
}

/**
 * Zincir özeti: kökten başlayarak "İl → İlçe → Mahalle" (dallanan zincirde her dal ayrı). etiket: anahtar → görünen ad.
 * @param {ReadonlyArray<{ ust: string; alt: string }>} iliskiler @param {(anahtar: string) => string} etiket @returns {string[]}
 */
export function zincirMetni(iliskiler, etiket) {
  const altlari = new Map();
  for (const i of iliskiler) altlari.set(i.ust, [...(altlari.get(i.ust) ?? []), i.alt]);
  const altlar = new Set(iliskiler.map((i) => i.alt));
  /** @type {string[]} */
  const sonuc = [];
  const yuru = (/** @type {string} */ a, /** @type {string[]} */ yol, /** @type {Set<string>} */ gorulen) => {
    const cocuklar = (altlari.get(a) ?? []).filter((c) => !gorulen.has(c));
    if (!cocuklar.length) { sonuc.push([...yol, a].map(etiket).join(' → ')); return; }
    for (const c of cocuklar) yuru(c, [...yol, a], new Set([...gorulen, c]));
  };
  for (const kok of [...altlari.keys()].filter((u) => !altlar.has(u))) yuru(kok, [], new Set([kok]));
  return sonuc;
}

/**
 * Bulgunun kullanıcıya gösterilen cümlesi. etiket: anahtar → alanın görünen adı.
 * @param {ZincirBulgusu} b @param {(anahtar: string) => string} etiket @returns {string}
 */
export function bulguMetni(b, etiket) {
  const yol = (b.secimler ?? []).map((s) => `${etiket(s.anahtar)} = “${s.metin}”`).join(', ');
  const onEk = yol ? `${yol} seçilince` : 'Sayfa açılınca';
  switch (b.tur) {
    case 'bosListe': return `${onEk} “${etiket(b.alan)}” listesi boş kaldı (${Math.round((b.beklenenMs ?? 0) / 1000)} sn beklendi; başka değerlerde seçenek geliyor).`;
    case 'tekrarlayan': return `${onEk} “${etiket(b.alan)}” listesinde aynı seçenek birden çok kez var: ${(b.metinler ?? []).slice(0, 5).map((m) => `“${m}”`).join(', ')}.`;
    case 'secilemedi': return `${yol ? `${yol} seçildikten sonra ` : ''}“${etiket(b.alan)}” listesinde “${b.metin ?? ''}” seçilemedi${b.ayrinti ? ` (${b.ayrinti})` : ''}.`;
    case 'hataMesaji': return `${onEk} sayfa hata gösterdi: “${b.metin ?? ''}”.`;
    case 'gezinme': return `${onEk} sayfa başka bir adrese gitti (${b.metin ?? '?'}); bu dalda zincir incelenmedi.`;
    default: return onEk;
  }
}

/**
 * Bulguların tekilleştirilmesi (aynı tür + alan + seçim yolu bir kez).
 * @param {ReadonlyArray<ZincirBulgusu>} liste @returns {ZincirBulgusu[]}
 */
export function bulgulariTekillestir(liste) {
  const gorulen = new Set();
  return liste.filter((b) => {
    const k = JSON.stringify([b.tur, b.alan, (b.secimler ?? []).map((s) => [s.anahtar, s.deger]), b.metin ?? null]);
    if (gorulen.has(k)) return false;
    gorulen.add(k);
    return true;
  });
}

/**
 * Ölçülen dolma sürelerinden modele yazılacak "olağan yüklenme süresi" (ms): ölçümlerin en büyüğü, 100 ms'ye yuvarlanmış (en az 100).
 * Ölçüm yoksa null. Koşucu bekleme sınırını ve yavaşlama eşiğini buna göre kurar (yuklenmeBeklemesi).
 * @param {ReadonlyArray<number> | null | undefined} olcumler @returns {number | null}
 */
export function olaganYuklenme(olcumler) {
  const l = (olcumler ?? []).filter((x) => Number.isFinite(x) && x >= 0);
  if (!l.length) return null;
  return Math.max(100, Math.round(Math.max(...l) / 100) * 100);
}

/**
 * Bağlı listenin seçeneklerini beklemenin sınırı ve yavaşlama eşiği (ms). Olağan süre biliniyorsa sınır onun 5 katı (en az +5 sn, en çok
 * 60 sn) — hızlı listede boşuna uzun beklenmez, yavaş listede erken vazgeçilmez; bilinmiyorsa varsayılan (Ayarlar > Alan işlemi). Yavaşlama:
 * olağanın 3 katını ve +2 sn'yi aşan bekleme (raporda not olur).
 * @param {number | null | undefined} olaganMs @param {number} varsayilanMs @returns {{ sinirMs: number; yavasMs: number | null }}
 */
export function yuklenmeBeklemesi(olaganMs, varsayilanMs) {
  if (!olaganMs || !Number.isFinite(olaganMs) || olaganMs <= 0) return { sinirMs: varsayilanMs, yavasMs: null };
  return { sinirMs: Math.min(60_000, Math.max(olaganMs * 5, olaganMs + 5_000)), yavasMs: Math.max(olaganMs * 3, olaganMs + 2_000) };
}

/**
 * Zincir gözlemlerinden alt listelerin üst değere göre seçenek haritası (modelin bagimlilik.secenekHaritasi): alt → { ust, harita }.
 * Harita en az iki üst değerde gerçek seçenek görüldüyse kurulur.
 * @param {ReadonlyArray<{ ust: string; alt: string }>} iliskiler
 * @param {ReadonlyArray<{ anahtar: string; secimler: Record<string, string>; secenekler: ReadonlyArray<{ deger: string; metin?: string | null }> }>} gozlemler
 * @returns {Map<string, { ust: string; harita: Map<string, Secenek[]> }>}
 */
export function zincirBagimliliklari(iliskiler, gozlemler) {
  /** @type {Map<string, { ust: string; harita: Map<string, Secenek[]> }>} */
  const sonuc = new Map();
  for (const { ust, alt } of iliskiler) {
    /** @type {Map<string, Secenek[]>} */
    const harita = new Map();
    for (const g of gozlemler) {
      if (g.anahtar !== alt || typeof g.secimler[ust] !== 'string') continue;
      const l = gercekSecenekler(g.secenekler);
      if (l.length && !harita.has(g.secimler[ust])) harita.set(g.secimler[ust], l);
    }
    if (harita.size >= 2) sonuc.set(alt, { ust, harita });
  }
  return sonuc;
}
