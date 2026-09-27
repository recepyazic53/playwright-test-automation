// TABLO SEÇİMİ — saf yardımcılar (ORTAK: sunucu ve arayüz; /arayuz/tablo-secimi.mjs olarak sunulur, Node modülü içe aktarmaz).
// Bir alan tablo sütununa bağlıdır; gövdede ${Tablo.Sütun} ya da aynı tablo iki kez gerekiyorsa ${Tablo[etiket].Sütun}.
// Tarih değeri servise başka biçimde gidecekse sona biçim eklenir: ${Kişi.Doğum tarihi|yyyy-MM-dd'T'HH:mm:ss}.
// Aynı tablo + etiketteki alanlar bir seçim grubudur: senaryodaki seçimler (tabloSecimleri["<tabloId>|<etiket>"] =
// { Sütun: değer }) satırları süzer. Formda süzme YUKARIDAN AŞAĞIDIR: bir alanın seçenekleri, formda kendinden ÖNCEKİ alanların
// seçimleriyle uyuşan satırlardaki değerlerdir (üstteki seçim değişince alttaki uyumsuz seçim temizlenir). Koşuda tüm
// seçimlerle uyan ilk satır kullanılır (Ayarlar > Koşu > Gelişmiş'te "Rastgele" seçilirse uyanlardan biri; bir grubun tüm değerleri
// aynı satırdan gelir); satırın ortamı boşsa (Tümü) her ortamda geçerlidir.
// Karşılıklar: sütun değerinin sayfadaki (seçenek değeri) ve servisteki karşılığı; senaryoya tablodaki değer yazılır, ekran
// koşusu sayfa değeriyle seçer, servis gövdesine servis değeri gider (tanımsızsa tablodaki değer).

/** Tablo / sütun adı karakterleri (tablo-deposu.mjs TABLO_ADI ile aynı): . [ ] { } $ < > & | ve denetim karakterleri yok. */
export const AD_KALIBI = '[^.\\[\\]{}$<>&|\\u0000-\\u001f]{1,60}';
/** Tarih biçimi (yyyy, MM, dd, HH, mm, ss; tek tırnak içi sabit): { } $ yok, en çok 60. */
export const BICIM_KALIBI = "[^{}$\\u0000-\\u001f]{1,60}";
/** Etiket (başvuran / kefil): harf, rakam, boşluk, "_", "-". */
export const ETIKET_KALIBI = '[\\p{L}\\p{N} _-]{1,40}';
const BASVURU = new RegExp(`^\\s*(${AD_KALIBI})(?:\\[(${ETIKET_KALIBI})\\])?\\.(${AD_KALIBI})\\s*(?:\\|(${BICIM_KALIBI}))?$`, 'u');

/**
 * @typedef {{ sayfa?: string; servis?: string }} Karsilik
 * @typedef {{ ad: string; gizli: boolean; tip?: string; karsiliklar?: Record<string, Karsilik> }} Sutun
 * @typedef {{ id?: string; ortamId: string | null; degerler: Record<string, string | null> }} Satir
 * @typedef {{ id: string; ad: string; sutunlar: Sutun[]; satirlar: Satir[] }} Tablo
 * @typedef {{ tablo: string; etiket: string; sutun: string; bicim: string }} Basvuru
 */

const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');

/** "Tablo.Sütun" / "Tablo[etiket].Sütun" (+ "|biçim") → { tablo, etiket, sutun, bicim } | null. @param {string} ad @returns {Basvuru | null} */
export function basvuruCoz(ad) {
  const m = BASVURU.exec(ad);
  return m ? { tablo: m[1].trim(), etiket: (m[2] || '').trim(), sutun: m[3].trim(), bicim: (m[4] || '').trim() } : null;
}

/**
 * Senaryo DEĞERİ olarak tablo başvurusu: değerin tamamı "${Tablo.Sütun}" / "${Tablo[etiket].Sütun|biçim}" ise başvuru, değilse null
 * (düz metin değer aynen kullanılır). Ekran senaryolarında alan değeri böyle verilebilir (koşuda seçilen satırdan çözülür).
 * @param {unknown} deger @returns {Basvuru | null}
 */
export function degerBasvurusu(deger) {
  if (typeof deger !== 'string') return null;
  const m = /^\s*\$\{([^{}]+)\}\s*$/u.exec(deger);
  return m ? basvuruCoz(m[1]) : null;
}

/** Başvurunun senaryo değeri biçimi: "${Tablo.Sütun}". @param {string} tablo @param {string} sutun @param {string} [etiket] */
export const degerBasvurusuYaz = (tablo, sutun, etiket = '') => `\${${basvuru(tablo, sutun, etiket)}}`;

/** @param {string} tablo @param {string} sutun @param {string} [etiket] @param {string} [bicim] tarih biçimi */
export const basvuru = (tablo, sutun, etiket = '', bicim = '') => `${tablo}${etiket ? `[${etiket}]` : ''}.${sutun}${bicim ? `|${bicim}` : ''}`;

/** Seçim grubunun anahtarı. @param {string} tabloId @param {string} [etiket] */
export const grupAnahtari = (tabloId, etiket = '') => `${tabloId}|${etiket}`;

/** @template {{ ad: string }} T @param {T[]} liste @param {string} ad @returns {T | undefined} */
const adla = (liste, ad) => liste.find((x) => kucuk(x.ad) === kucuk(ad));
/** @param {Tablo[]} tablolar @param {string} ad */
export const tabloBul = (tablolar, ad) => adla(tablolar, ad);
/** @param {Tablo} tablo @param {string} ad */
export const sutunBul = (tablo, ad) => adla(tablo.sutunlar, ad);

/**
 * Seçimlerle (ve ortamla) uyuşan satırlar. haric: bu sütunun kendi seçimi yok sayılır (seçeneklerini hesaplarken).
 * @param {Tablo} tablo @param {Record<string, string>} [secim] @param {{ ortamId?: string | null; haric?: string }} [s]
 */
export function uyanSatirlar(tablo, secim = {}, s = {}) {
  const kosullar = Object.entries(secim).filter(([sutun, d]) => d !== '' && d !== undefined && d !== null && kucuk(sutun) !== kucuk(s.haric ?? '\u0000'));
  return tablo.satirlar.filter((r) => (!r.ortamId || !s.ortamId || r.ortamId === s.ortamId)
    && kosullar.every(([sutun, d]) => {
      const gercek = tablo.sutunlar.find((x) => kucuk(x.ad) === kucuk(sutun));
      return gercek ? String(r.degerler[gercek.ad] ?? '') === String(d) : true;
    }));
}

/**
 * Sütunun seçenekleri: diğer seçimlerle uyuşan satırlardaki farklı, boş olmayan değerler (tablo sırasıyla).
 * @param {Tablo} tablo @param {Record<string, string>} secim @param {string} sutun @param {string | null} [ortamId]
 */
export function sutunSecenekleri(tablo, secim, sutun, ortamId) {
  const s = sutunBul(tablo, sutun);
  if (!s || s.gizli) return [];
  /** @type {string[]} */
  const sonuc = [];
  for (const r of uyanSatirlar(tablo, secim, { ortamId, haric: s.ad })) {
    const d = r.degerler[s.ad];
    if (d !== null && d !== undefined && d !== '' && !sonuc.includes(d)) sonuc.push(d);
  }
  return sonuc;
}

/** Değerin servis gövdesine yazılacak karşılığı (tanımsızsa değerin kendisi). @param {Sutun} sutun @param {string} deger */
export const servisDegeri = (sutun, deger) => sutun.karsiliklar?.[deger]?.servis || deger;

/**
 * Satır seçimi (Ayarlar > Koşu > Gelişmiş > Tablodan satır seçimi): 'ilk' (varsayılan) uyan ilk satır; 'rastgele' uyanlardan biri.
 * onbellek: aynı koşuda aynı grup + seçim + ortam için seçilen satır — grubun tüm değerleri AYNI satırdan gelir. rastgele: [0, 1)
 * üreteci (testlerde tohumlu; verilmezse Math.random).
 * @typedef {{ kip?: string; rastgele?: () => number; onbellek?: Map<string, Satir | undefined> }} SatirSecimi
 */

/** Satır seçimi (ayar değerinden; tanınmayan değer 'ilk'). @param {unknown} kip @param {() => number} [rastgele] @returns {SatirSecimi} */
export const satirSecimiOlustur = (kip, rastgele = Math.random) => ({ kip: kip === 'rastgele' ? 'rastgele' : 'ilk', rastgele, onbellek: new Map() });

/**
 * Koşuda kullanılacak satır: uyan ilk satır (satirSecimi 'rastgele' ise uyanlardan biri); yoksa undefined.
 * @param {Tablo} tablo @param {Record<string, string>} secim @param {string | null} [ortamId] @param {SatirSecimi} [satirSecimi]
 * @param {string} [grup] önbellek anahtarı eki (başvurunun etiketi)
 */
export function secilenSatir(tablo, secim, ortamId, satirSecimi, grup = '') {
  const uyan = uyanSatirlar(tablo, secim, { ortamId });
  if (!satirSecimi || satirSecimi.kip !== 'rastgele' || uyan.length < 2) return uyan[0];
  const kosullar = Object.entries(secim).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const anahtar = JSON.stringify([tablo.id, grup, ortamId ?? null, kosullar]);
  if (satirSecimi.onbellek?.has(anahtar)) return satirSecimi.onbellek.get(anahtar);
  const r = (satirSecimi.rastgele ?? Math.random)();
  const satir = uyan[Math.min(uyan.length - 1, Math.max(0, Math.floor(r * uyan.length)))];
  satirSecimi.onbellek?.set(anahtar, satir);
  return satir;
}

/** Değerin sayfadaki (seçenek value) karşılığı (tanımsızsa değerin kendisi). @param {Sutun} sutun @param {string} deger */
export const sayfaDegeri = (sutun, deger) => sutun.karsiliklar?.[deger]?.sayfa || deger;

/**
 * Başvurunun (Tablo.Sütun / Tablo[etiket].Sütun) koşudaki değeri: senaryonun seçimleriyle (tabloSecimleri["<tabloId>|<etiket>"])
 * ve ortamla uyan İLK satırdan (satırın ortamı boşsa her ortamda geçerli). SERVİS gövdesi ve EKRAN senaryosu koşusu bu tek
 * kuralı kullanır (servis-islemleri.mjs, ekran-basvurulari.mjs). Çözülemezse kullanıcıya dönük hata metni (tabloYok: tablo yok).
 * @param {Tablo[]} tablolar değerleri çözülmüş tablolar @param {Basvuru} b @param {Record<string, Record<string, string>> | undefined} tabloSecimleri
 * @param {string | null} [ortamId] @param {SatirSecimi} [satirSecimi] birden çok satır uyduğunda seçim (verilmezse ilk uyan)
 * @returns {{ tablo: Tablo; sutun: Sutun; satir: Satir; deger: string } | { hata: string; tabloYok?: boolean }}
 */
export function basvuruyuCoz(tablolar, b, tabloSecimleri, ortamId, satirSecimi) {
  const t = tabloBul(tablolar, b.tablo);
  if (!t) return { hata: `"${b.tablo}" adında tablo yok`, tabloYok: true };
  const sutun = sutunBul(t, b.sutun);
  if (!sutun) return { hata: `"${t.ad}" tablosunda "${b.sutun}" sütunu yok` };
  const secim = tabloSecimleri?.[grupAnahtari(t.id, b.etiket)] ?? {};
  const satir = secilenSatir(t, secim, ortamId, satirSecimi, b.etiket);
  const grup = `"${t.ad}${b.etiket ? ` (${b.etiket})` : ''}"`;
  if (!satir) return { hata: Object.keys(secim).length ? `${grup} tablosunda seçimlerle uyan satır yok` : `${grup} tablosunda bu ortamda satır yok` };
  const d = satir.degerler[sutun.ad];
  if (d === null || d === undefined || d === '') return { hata: `${grup} tablosunun seçilen satırında "${sutun.ad}" boş` };
  return { tablo: t, sutun, satir, deger: String(d) };
}

const dolu = (/** @type {unknown} */ v) => v !== null && v !== undefined && v !== '';

/**
 * Ekran alanı → tablo sütunu bağlantılarından koşullu değer listeleri (Test verisi değer listeleriyle aynı biçim; senaryo formu,
 * doğrulayıcı ve koşu bunları kullanır): her bağlı alan için koşulsuz liste (sütunun tüm değerleri) ve aynı grupta formda
 * kendinden ÖNCE gelen bağlı alanların (en çok 3) değer birleşimleri için koşullu listeler. Form, koşulları tutan en çok koşullu
 * listeyi seçer; böylece seçtikçe alttaki alanlar satırlardan süzülür. Gizli sütun listeye girmez. Sayfa değeri tanımlı
 * değerde ekranDegeri (koşu seçeneği bununla seçer).
 * @param {Record<string, { tablo: string; sutun: string; etiket?: string }>} baglar @param {Tablo[]} tablolar @param {string} ekranId
 * @param {string[]} [sira] formdaki alan sırası (verilmezse bağlantıların sırası)
 */
export function tabloDegerListeleri(baglar, tablolar, ekranId, sira) {
  const yer = (/** @type {string} */ alan) => { const i = sira ? sira.indexOf(alan) : -1; return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  /** @type {Map<string, Array<{ alan: string; t: Tablo; s: Sutun }>>} */
  const gruplar = new Map();
  for (const [alan, b] of Object.entries(baglar)) {
    const t = tablolar.find((x) => x.id === b.tablo);
    const s = t ? sutunBul(t, b.sutun) : undefined;
    if (!t || !s || s.gizli) continue;
    const k = grupAnahtari(t.id, b.etiket || '');
    if (!gruplar.has(k)) gruplar.set(k, []);
    /** @type {Array<{ alan: string; t: Tablo; s: Sutun }>} */ (gruplar.get(k)).push({ alan, t, s });
  }
  /** @type {Array<{ id: string; ad: string; tur: 'liste'; kullanim: 'ekran'; hedef: { ekranId: string; alan: string }; baglanti: { tablo: string; sutun: string; etiket?: string }; kosullar: Array<{ alan: string; deger: string }>; degerler: Array<{ deger: string; ekranDegeri?: string }> }>} */
  const sonuc = [];
  for (const uyeler of gruplar.values()) {
    for (const u of uyeler) {
      const onceki = sira ? uyeler.filter((x) => x !== u && yer(x.alan) < yer(u.alan)) : uyeler.slice(0, uyeler.indexOf(u));
      const digerleri = onceki.slice(-3);
      /** @type {Map<string, { kosullar: Array<{ alan: string; deger: string }>; degerler: string[] }>} */
      const harita = new Map();
      const ekle = (/** @type {Array<{ alan: string; deger: string }>} */ kosullar, /** @type {string} */ v) => {
        const imza = JSON.stringify(kosullar);
        let e = harita.get(imza);
        if (!e) { e = { kosullar, degerler: [] }; harita.set(imza, e); }
        if (!e.degerler.includes(v)) e.degerler.push(v);
      };
      for (const r of u.t.satirlar) {
        const v = r.degerler[u.s.ad];
        if (!dolu(v)) continue;
        ekle([], String(v));
        for (let m = 1; m < (1 << digerleri.length); m++) {
          /** @type {Array<{ alan: string; deger: string }>} */
          const kosullar = [];
          let tamam = true;
          digerleri.forEach((x, i) => {
            if (!(m & (1 << i)) || !tamam) return;
            const xv = r.degerler[x.s.ad];
            if (!dolu(xv)) { tamam = false; return; }
            kosullar.push({ alan: x.alan, deger: String(xv) });
          });
          if (tamam) ekle(kosullar, String(v));
        }
      }
      let n = 0;
      const k = u.s.karsiliklar || {};
      for (const { kosullar, degerler } of harita.values()) {
        sonuc.push({
          id: `tablo:${u.alan}:${n++}`, ad: `${u.t.ad} → ${u.s.ad}`, tur: 'liste', kullanim: 'ekran', hedef: { ekranId, alan: u.alan },
          // Senaryo formunun "Tablodan" seçeneği bununla ${Tablo.Sütun} başvurusu üretir.
          baglanti: { tablo: u.t.ad, sutun: u.s.ad, ...(baglar[u.alan]?.etiket ? { etiket: String(baglar[u.alan].etiket) } : {}) }, kosullar,
          degerler: degerler.map((deger) => ({ deger, ...(k[deger]?.sayfa ? { ekranDegeri: k[deger].sayfa } : {}) }))
        });
      }
    }
  }
  return sonuc;
}
