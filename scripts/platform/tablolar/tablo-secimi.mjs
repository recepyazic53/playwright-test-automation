// TABLO SEÇİMİ — saf yardımcılar (ORTAK: sunucu ve arayüz; /arayuz/tablo-secimi.mjs olarak sunulur, Node modülü içe aktarmaz).
// Bir alan tablo sütununa bağlıdır; gövdede ${Tablo.Sütun} ya da aynı tablo iki kez gerekiyorsa ${Tablo[etiket].Sütun}.
// Aynı tablo + etiketteki alanlar bir seçim grubudur: senaryodaki seçimler (tabloSecimleri["<tabloId>|<etiket>"] =
// { Sütun: değer }) satırları süzer. Formda süzme YUKARIDAN AŞAĞIDIR: bir alanın seçenekleri, formda kendinden ÖNCEKİ alanların
// seçimleriyle uyuşan satırlardaki değerlerdir (üstteki seçim değişince alttaki uyumsuz seçim temizlenir). Koşuda tüm
// seçimlerle uyan ilk satır kullanılır; satırın ortamı boşsa (Tümü) her ortamda geçerlidir.

/** Tablo / sütun adı karakterleri (tablo-deposu.mjs TABLO_ADI ile aynı): . [ ] { } $ < > & ve denetim karakterleri yok. */
export const AD_KALIBI = '[^.\\[\\]{}$<>&\\u0000-\\u001f]{1,60}';
/** Etiket (sigortalı / ettiren): harf, rakam, boşluk, "_", "-". */
export const ETIKET_KALIBI = '[\\p{L}\\p{N} _-]{1,40}';
const BASVURU = new RegExp(`^\\s*(${AD_KALIBI})(?:\\[(${ETIKET_KALIBI})\\])?\\.(${AD_KALIBI})\\s*$`, 'u');

/**
 * @typedef {{ ad: string; gizli: boolean; tip?: string }} Sutun
 * @typedef {{ id?: string; ortamId: string | null; degerler: Record<string, string | null> }} Satir
 * @typedef {{ id: string; ad: string; sutunlar: Sutun[]; satirlar: Satir[] }} Tablo
 * @typedef {{ tablo: string; etiket: string; sutun: string }} Basvuru
 */

const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');

/** "Tablo.Sütun" / "Tablo[etiket].Sütun" → { tablo, etiket, sutun } | null. @param {string} ad @returns {Basvuru | null} */
export function basvuruCoz(ad) {
  const m = BASVURU.exec(ad);
  return m ? { tablo: m[1].trim(), etiket: (m[2] || '').trim(), sutun: m[3].trim() } : null;
}

/** @param {string} tablo @param {string} sutun @param {string} [etiket] */
export const basvuru = (tablo, sutun, etiket = '') => `${tablo}${etiket ? `[${etiket}]` : ''}.${sutun}`;

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

/** Koşuda kullanılacak satır: uyan ilk satır (yoksa undefined). @param {Tablo} tablo @param {Record<string, string>} secim @param {string | null} [ortamId] */
export function secilenSatir(tablo, secim, ortamId) {
  return uyanSatirlar(tablo, secim, { ortamId })[0];
}

const dolu = (/** @type {unknown} */ v) => v !== null && v !== undefined && v !== '';

/**
 * Ekran alanı → tablo sütunu bağlantılarından koşullu değer listeleri (Test verisi değer listeleriyle aynı biçim; senaryo formu,
 * doğrulayıcı ve koşu bunları kullanır): her bağlı alan için koşulsuz liste (sütunun tüm değerleri) ve aynı grupta formda
 * kendinden ÖNCE gelen bağlı alanların (en çok 3) değer birleşimleri için koşullu listeler. Form, koşulları tutan en çok koşullu
 * listeyi seçer; böylece seçtikçe alttaki alanlar satırlardan süzülür. Gizli sütun listeye girmez.
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
  /** @type {Array<{ id: string; ad: string; tur: 'liste'; kullanim: 'ekran'; hedef: { ekranId: string; alan: string }; kosullar: Array<{ alan: string; deger: string }>; degerler: Array<{ deger: string }> }>} */
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
      for (const { kosullar, degerler } of harita.values()) {
        sonuc.push({ id: `tablo:${u.alan}:${n++}`, ad: `${u.t.ad} → ${u.s.ad}`, tur: 'liste', kullanim: 'ekran', hedef: { ekranId, alan: u.alan }, kosullar, degerler: degerler.map((deger) => ({ deger })) });
      }
    }
  }
  return sonuc;
}
