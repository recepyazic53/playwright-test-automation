// SERVİS ANALİZİ — sunucu tarafı (kayıt ve görünüm). Saf çıkarım servis-analizi.mjs'dedir (arayüzle ortak); burada:
//  - servis ayarlarına eklenen alanların doğrulaması: ornekIstekler (metot başına adlı örnek istekler), alanKurallari (tip / biçim /
//    desen / uzunluk / izin verilen değerler / gizli), analizKararlari (uygulanan / yoksayılan öneriler), ornekFarklari (B aşaması
//    için örnekler arası fark), ornekKokleri (alan listesi olmayan metodun örnekten gelen kök öğesi);
//  - örneklerin GÖRÜNÜMÜ: adı gizli alanların değeri arayüze maskeli gider; kayıtta maske, saklanan asıl değerle geri yazılır
//    (saklama maskesizdir — gizli-adlar.mjs > adaGoreMaskele / maskeyiGeriKoy);
//  - içe aktarılan (SoapUI / Postman / cURL) örneklerin listeye eklenmesi (aynı gövde iki kez eklenmez);
//  - analizden gelen yeni tabloların yazılması (yeni / birleştir / yeni ad / atla) ve "yeni:<ad>" bağlarının gerçek tabloya çevrilmesi;
//  - ek kanıt: kayıtlı senaryoların gövdeleri ve son koşuların istekleri (maskeli; yalnız okuma).
// Hiçbir servise istek atılmaz.
import { randomUUID } from 'node:crypto';
import { DepoHatasi } from '../veritabani/depo.mjs';
import { adaGoreMaskele, maskeyiGeriKoy, servisIceriginiMaskele } from '../ayarlar/gizli-adlar.mjs';
import { GIZLI_SABIT_MASKESI } from './gizli-sabitler.mjs';
import { tabloKaydet, tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { baslikNormal } from '../tablolar/tablo-benzerligi.mjs';
import { servisKosulariniListele, servisKosusuGetir, servisSenaryolariniListele } from './servis-deposu.mjs';
import { EN_COK_ORNEK } from './servis-analizi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ id: string; ad: string; govde: string; kaynak: string }} OrnekIstek */

const ALAN_YOLU = /^[\p{L}_][\p{L}\p{N}_.-]*(\/[\p{L}_][\p{L}\p{N}_.-]*)*$/u;
const KIMLIK = /^[A-Za-z0-9_-]{1,64}$/;
const KAYNAKLAR = Object.freeze(['elle', 'soapui', 'postman', 'curl']);
const TIPLER = Object.freeze(['metin', 'tamsayi', 'ondalik', 'mantiksal', 'tarih', 'tarihSaat']);
const EN_COK_GOVDE = 256 * 1024;
const nesneMi = (/** @type {unknown} */ v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @param {string} ad */
function nesne(v, ad) {
  if (!nesneMi(v)) throw new DepoHatasi(`"${ad}" bir nesne olmalıdır.`);
  return /** @type {Record<string, unknown>} */ (v);
}

/**
 * Örnek istekler: { <metot>: [{ id, ad, govde, kaynak }] }. Arayüzden maskeli gelen gizli değerler (aynı kimlikli) saklanan örnekten
 * geri yazılır. Boş gövdeli örnek atılır; ad boşsa "Örnek N".
 * @param {unknown} v @param {Record<string, OrnekIstek[]> | undefined} mevcut @param {ReadonlyArray<string>} ekler
 * @returns {Record<string, OrnekIstek[]>}
 */
export function ornekIstekleriniDogrula(v, mevcut, ekler) {
  /** @type {Record<string, OrnekIstek[]>} */
  const s = {};
  for (const [op, l] of Object.entries(nesne(v, 'ornekIstekler'))) {
    if (!Array.isArray(l)) throw new DepoHatasi(`"${op}" örnek istekleri bir dizi olmalıdır.`);
    if (l.length > EN_COK_ORNEK) throw new DepoHatasi(`"${op}" için en çok ${EN_COK_ORNEK} örnek istek eklenebilir.`);
    const eskiler = new Map((mevcut?.[op] ?? []).map((x) => [x.id, x]));
    /** @type {OrnekIstek[]} */
    const liste = [];
    l.forEach((/** @type {any} */ x, i) => {
      if (!nesneMi(x) || typeof x.govde !== 'string') throw new DepoHatasi(`"${op}" ${i + 1}. örnek geçersiz.`);
      if (x.govde.length > EN_COK_GOVDE) throw new DepoHatasi(`"${op}" ${i + 1}. örnek en çok 256 KB olabilir.`);
      if (!x.govde.trim()) return;
      const id = typeof x.id === 'string' && KIMLIK.test(x.id) ? x.id : randomUUID();
      const ad = (typeof x.ad === 'string' ? x.ad.trim() : '').slice(0, 80) || `Örnek ${liste.length + 1}`;
      const eski = eskiler.get(id);
      const govde = eski ? maskeyiGeriKoy(x.govde, adaGoreMaskele(eski.govde, ekler, GIZLI_SABIT_MASKESI).asillar, ekler, GIZLI_SABIT_MASKESI) : x.govde;
      liste.push({ id, ad, govde, kaynak: KAYNAKLAR.includes(x.kaynak) ? x.kaynak : eski?.kaynak ?? 'elle' });
    });
    if (new Set(liste.map((x) => x.id)).size !== liste.length) throw new DepoHatasi(`"${op}" örnek kimlikleri tekil olmalıdır.`);
    if (liste.length) s[op] = liste;
  }
  return s;
}

/**
 * Alan kuralları (analiz önerilerinden; kullanıcı uygular): { <metot>: { <yol>: { tip?, bicim?, desen?, enAzUzunluk?, enCokUzunluk?,
 * degerler?, gizli? } } }. @param {unknown} v @returns {Record<string, Record<string, Record<string, unknown>>>}
 */
export function alanKurallariniDogrula(v) {
  /** @type {Record<string, Record<string, Record<string, unknown>>>} */
  const s = {};
  for (const [op, alanlar] of Object.entries(nesne(v, 'alanKurallari'))) {
    for (const [yol, k] of Object.entries(nesne(alanlar, `${op} alan kuralları`))) {
      if (!ALAN_YOLU.test(yol)) throw new DepoHatasi(`Geçersiz alan yolu: "${yol}".`);
      const o = nesne(k, `${yol} kuralı`);
      /** @type {Record<string, unknown>} */
      const r = {};
      if (o.tip !== undefined) { if (!TIPLER.includes(/** @type {string} */ (o.tip))) throw new DepoHatasi(`"${yol}" için geçersiz tip.`); r.tip = o.tip; }
      if (typeof o.bicim === 'string' && o.bicim.trim()) r.bicim = o.bicim.trim().slice(0, 60);
      if (typeof o.desen === 'string' && o.desen) {
        if (o.desen.length > 200) throw new DepoHatasi(`"${yol}" deseni en çok 200 karakter olabilir.`);
        try { new RegExp(o.desen, 'u'); } catch { throw new DepoHatasi(`"${yol}" deseni geçersiz.`); }
        r.desen = o.desen;
      }
      for (const a of ['enAzUzunluk', 'enCokUzunluk']) {
        if (o[a] === undefined) continue;
        if (!Number.isInteger(o[a]) || /** @type {number} */ (o[a]) < 0 || /** @type {number} */ (o[a]) > 100000) throw new DepoHatasi(`"${yol}" için ${a} geçersiz.`);
        r[a] = o[a];
      }
      if (o.degerler !== undefined) {
        if (!Array.isArray(o.degerler) || o.degerler.length > 50 || o.degerler.some((x) => typeof x !== 'string' || x.length > 200)) throw new DepoHatasi(`"${yol}" izin verilen değerleri geçersiz.`);
        r.degerler = [...new Set(o.degerler)];
      }
      if (o.gizli === true) r.gizli = true;
      if (Object.keys(r).length) (s[op] ??= {})[yol] = r;
    }
  }
  return s;
}

/** Öneri kararları: { <metot>: { <öneri anahtarı>: 'uygulandi' | 'yoksayildi' } }. @param {unknown} v @returns {Record<string, Record<string, 'uygulandi' | 'yoksayildi'>>} */
export function analizKararlariniDogrula(v) {
  /** @type {Record<string, Record<string, 'uygulandi' | 'yoksayildi'>>} */
  const s = {};
  for (const [op, k] of Object.entries(nesne(v, 'analizKararlari'))) {
    const girdiler = Object.entries(nesne(k, `${op} kararları`));
    if (girdiler.length > 5000) throw new DepoHatasi(`"${op}" için çok fazla öneri kararı.`);
    for (const [a, d] of girdiler) {
      if (a.length > 2000 || (d !== 'uygulandi' && d !== 'yoksayildi')) throw new DepoHatasi('Geçersiz öneri kararı.');
      (s[op] ??= {})[a] = d;
    }
  }
  return s;
}

/** Örnekler arası fark (B aşaması): { <metot>: [{ yol, dolu: [ad], bos: [ad] }] }. @param {unknown} v */
export function ornekFarklariniDogrula(v) {
  /** @type {Record<string, Array<{ yol: string; dolu: string[]; bos: string[] }>>} */
  const s = {};
  const adlar = (/** @type {unknown} */ l) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string').map((x) => x.slice(0, 80)).slice(0, EN_COK_ORNEK) : []);
  for (const [op, l] of Object.entries(nesne(v, 'ornekFarklari'))) {
    if (!Array.isArray(l) || l.length > 2000) throw new DepoHatasi(`"${op}" örnek farkları geçersiz.`);
    s[op] = l.filter((/** @type {any} */ x) => nesneMi(x) && typeof x.yol === 'string' && ALAN_YOLU.test(x.yol)).map((/** @type {any} */ x) => ({ yol: x.yol, dolu: adlar(x.dolu), bos: adlar(x.bos) }));
  }
  return s;
}

/** Alan listesi olmayan metodun örnekten gelen kökü: { <metot>: { kok, ns } }. @param {unknown} v @returns {Record<string, { kok: string; ns: string }>} */
export function ornekKokleriniDogrula(v) {
  /** @type {Record<string, { kok: string; ns: string }>} */
  const s = {};
  for (const [op, k] of Object.entries(nesne(v, 'ornekKokleri'))) {
    const o = nesne(k, `${op} kökü`);
    if (typeof o.kok !== 'string' || !/^[\p{L}_][\p{L}\p{N}_.-]{0,120}$/u.test(o.kok)) throw new DepoHatasi(`"${op}" kök öğesi geçersiz.`);
    s[op] = { kok: o.kok, ns: typeof o.ns === 'string' ? o.ns.slice(0, 500) : '' };
  }
  return s;
}

/**
 * Servis ayarlarının arayüz görünümü: örnek isteklerde adı gizli alanların değeri maskeli (saklanan değişmez).
 * @template {{ ornekIstekler?: Record<string, OrnekIstek[]> }} T @param {T} ayarlar @param {ReadonlyArray<string>} ekler @returns {T}
 */
export function ornekleriMaskele(ayarlar, ekler) {
  if (!ayarlar?.ornekIstekler) return ayarlar;
  return { ...ayarlar, ornekIstekler: Object.fromEntries(Object.entries(ayarlar.ornekIstekler).map(([op, l]) => [op,
    l.map((x) => ({ ...x, govde: adaGoreMaskele(x.govde, ekler, GIZLI_SABIT_MASKESI).metin }))])) };
}

/**
 * İçe aktarılan örnekleri metodun listesine ekler (aynı gövde ikinci kez eklenmez; en çok EN_COK_ORNEK). Listeyi döner (yeni nesne).
 * @param {Record<string, OrnekIstek[]> | undefined} mevcut @param {string} op @param {Array<{ ad: string; govde: string; kaynak: string }>} yeniler
 */
export function ornekleriEkle(mevcut, op, yeniler) {
  const s = { ...(mevcut ?? {}) };
  const l = [...(s[op] ?? [])];
  for (const y of yeniler) {
    if (!y.govde.trim() || l.length >= EN_COK_ORNEK || l.some((x) => x.govde.trim() === y.govde.trim())) continue;
    l.push({ id: randomUUID(), ad: y.ad.trim().slice(0, 80) || `Örnek ${l.length + 1}`, govde: y.govde, kaynak: y.kaynak });
  }
  if (l.length) s[op] = l;
  return s;
}

/**
 * Mevcut tabloyla birleştirme planı (paket-test-verisi.mjs > birlestirmePlani ile aynı kural): sütun eşleşmesi (ad; esnek başlık) ve
 * tabloda olmayan satırlar. @param {{ sutunlar: ReadonlyArray<{ ad: string }>; satirlar: ReadonlyArray<{ degerler: Record<string, string | null> }> }} mevcut
 * @param {Array<{ ad: string; gizli: boolean }>} sutunlar @param {Array<{ ad: string; degerler: Record<string, string | null> }>} satirlar
 */
function birlestirmePlani(mevcut, sutunlar, satirlar) {
  /** @type {Map<string, string>} */
  const eslesme = new Map();
  for (const s of sutunlar) {
    const m = mevcut.sutunlar.find((x) => x.ad.toLocaleLowerCase('tr') === s.ad.toLocaleLowerCase('tr')) ?? mevcut.sutunlar.find((x) => baslikNormal(x.ad) === baslikNormal(s.ad));
    if (m) eslesme.set(s.ad, m.ad);
  }
  const imza = (/** @type {(ad: string) => string | null} */ oku) => JSON.stringify(sutunlar.map((s) => oku(s.ad) ?? null));
  const var_ = new Set(mevcut.satirlar.map((r) => imza((ad) => { const m = eslesme.get(ad); return m ? r.degerler[m] ?? null : null; })));
  return { eslesme, yeniSutunlar: sutunlar.filter((s) => !eslesme.has(s.ad)), eklenecek: satirlar.filter((r) => !var_.has(imza((ad) => r.degerler[ad] ?? null))) };
}

/**
 * Analizden gelen yeni tablolar (kullanıcının özet adımındaki seçimiyle): 'yeni' / 'yeniAd' (aynı adlı tablo varsa reddedilir),
 * 'birlestir' (aynı adlı mevcut tabloya: eksik sütunlar ve tabloda olmayan satırlar eklenir; mevcutlar değişmez), 'atla'.
 * Gizli sütunun değeri yazılmaz (boş açılır). Çağıran işlemin içinde çalışır.
 * @param {Veritabani} vt @param {string} projeId @param {unknown} v
 * @returns {Map<string, { tabloId: string; sutunlar: Map<string, string> } | null>} plan kimliği ("yeni:<ad>") → yazılan tablo (atla: null)
 */
export function analizTablolariniYaz(vt, projeId, v) {
  /** @type {Map<string, { tabloId: string; sutunlar: Map<string, string> } | null>} */
  const eslem = new Map();
  if (v === undefined || v === null) return eslem;
  if (!Array.isArray(v) || v.length > 50) throw new DepoHatasi('"analizTablolari" en çok 50 tablo içeren bir dizi olmalıdır.');
  for (const ham of v) {
    const t = nesne(ham, 'analiz tablosu');
    if (typeof t.id !== 'string' || !t.id.startsWith('yeni:')) throw new DepoHatasi('Analiz tablosunun kimliği geçersiz.');
    const islem = t.islem === 'birlestir' || t.islem === 'yeniAd' || t.islem === 'atla' ? t.islem : 'yeni';
    if (islem === 'atla') { eslem.set(t.id, null); continue; }
    if (!Array.isArray(t.sutunlar) || !Array.isArray(t.satirlar)) throw new DepoHatasi('Analiz tablosunun sütunları / satırları geçersiz.');
    const sutunlar = t.sutunlar.map((/** @type {any} */ c) => ({ ad: String(c?.ad ?? '').trim(), gizli: c?.gizli === true }));
    const gizli = new Set(sutunlar.filter((c) => c.gizli).map((c) => c.ad));
    const satirlar = t.satirlar.map((/** @type {any} */ r) => ({
      ad: String(r?.ad ?? '').trim().slice(0, 60),
      degerler: Object.fromEntries(sutunlar.filter((c) => !gizli.has(c.ad)).map((c) => [c.ad, typeof r?.degerler?.[c.ad] === 'string' ? r.degerler[c.ad] : null]))
    }));
    const ad = String(islem === 'yeniAd' ? t.yeniAd ?? '' : t.ad ?? '').trim();
    const tur = t.tur === 'liste' ? 'liste' : 'kayit';
    const mevcut = tablolariListele(vt, projeId).find((x) => x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'));
    if (islem === 'birlestir') {
      if (!mevcut) throw new DepoHatasi(`"${ad}" adlı tablo bulunamadı (birleştirilemez).`);
      const plan = birlestirmePlani(mevcut, sutunlar, satirlar);
      const hedef = (/** @type {string} */ c) => plan.eslesme.get(c) ?? c;
      tabloKaydet(vt, {
        projeId, id: mevcut.id, ad: mevcut.ad,
        sutunlar: [...mevcut.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: c.gizli })), ...plan.yeniSutunlar.map((c) => ({ ad: c.ad, gizli: c.gizli }))],
        satirlar: plan.eklenecek.map((r) => ({ ad: r.ad, ortamId: null, degerler: Object.fromEntries(Object.entries(r.degerler).filter(([, d]) => d !== null).map(([k, d]) => [hedef(k), d])) }))
      });
      eslem.set(t.id, { tabloId: mevcut.id, sutunlar: new Map(sutunlar.map((c) => [c.ad, hedef(c.ad)])) });
      continue;
    }
    if (mevcut) throw new DepoHatasi(`"${ad}" adında bir tablo zaten var (birleştirin, yeni ad verin ya da atlayın).`);
    const tabloId = tabloKaydet(vt, {
      projeId, ad, tur, sutunlar,
      satirlar: satirlar.map((r) => ({ ad: r.ad, ortamId: null, degerler: Object.fromEntries(Object.entries(r.degerler).filter(([, d]) => d !== null)) }))
    });
    eslem.set(t.id, { tabloId, sutunlar: new Map(sutunlar.map((c) => [c.ad, c.ad])) });
  }
  return eslem;
}

/**
 * Alan bağlarındaki "yeni:<ad>" tablo kimliklerini yazılan tabloya çevirir; atlanan tablonun bağı kaldırılır.
 * @param {unknown} baglar @param {ReturnType<typeof analizTablolariniYaz>} eslem
 */
export function baglariCoz(baglar, eslem) {
  if (!nesneMi(baglar)) return baglar;
  return Object.fromEntries(Object.entries(/** @type {Record<string, any>} */ (baglar)).map(([op, alanlar]) => [op, !nesneMi(alanlar) ? alanlar
    : Object.fromEntries(Object.entries(alanlar).flatMap(([yol, b]) => {
      if (!b || typeof b.tablo !== 'string' || !b.tablo.startsWith('yeni:')) return [[yol, b]];
      const e = eslem.get(b.tablo);
      return e ? [[yol, { ...b, tablo: e.tabloId, sutun: e.sutunlar.get(b.sutun) ?? b.sutun }]] : [];
    }))]));
}

/**
 * Ek kanıt (yalnız okuma): kayıtlı tek istekli senaryoların gövdeleri ve son koşuların istekleri, metot adıyla. Gizli adlı alanların
 * değeri maskelidir (değer çıkarımına girmez, yalnız "dolu" sayılır). @param {Veritabani} vt @param {import('./servis-deposu.mjs').Servis} servis
 * @param {ReadonlyArray<string>} ekler @param {number} [sinir] son koşu sayısı
 */
export function analizKanitlari(vt, servis, ekler, sinir = 20) {
  const senaryolar = servisSenaryolariniListele(vt, servis.id).filter((x) => x.icerik?.tur !== 'akis' && typeof x.icerik?.govde === 'string' && x.icerik.govde.trim());
  const opu = new Map(senaryolar.map((x) => [x.id, String(x.icerik.operasyon ?? '')]));
  const kosular = servisKosulariniListele(vt, { servisId: servis.id, sinir: sinir * 3 }).filter((k) => k.senaryoId && opu.has(k.senaryoId)).slice(0, sinir);
  return {
    senaryolar: senaryolar.map((x) => ({ ad: x.baslik, operasyon: String(x.icerik.operasyon ?? ''),
      govde: String(/** @type {any} */ (servisIceriginiMaskele(x.icerik, ekler, GIZLI_SABIT_MASKESI)).govde ?? '') })),
    kosular: kosular.flatMap((k) => {
      const tam = servisKosusuGetir(vt, k.id);
      const istek = /** @type {any} */ (tam?.sonuc)?.istek;
      return typeof istek === 'string' && istek.trim()
        ? [{ ad: `${k.baslik} (${String(k.baslangic).slice(0, 16).replace('T', ' ')})`, operasyon: /** @type {string} */ (opu.get(/** @type {string} */ (k.senaryoId))), govde: adaGoreMaskele(istek, ekler, GIZLI_SABIT_MASKESI).metin }]
        : [];
    })
  };
}
