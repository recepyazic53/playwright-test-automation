// NESİL ÖNBELLEĞİ — liste uçlarının pahalı okuma hesapları (şifresi çözülmüş ve ayrıştırılmış model bağlamı, tablo listeleri…) için
// istekler arası bellek. Geçersiz kılma kuralı veritabanının kendisindedir, uçlara dağılmaz:
//   - Veritabanı NESLİ (baglanti.mjs > Veritabani#nesil) satır değiştiren her işlemde artar; TABLO NESLİ yazma komutunun hedef
//     tablosunda (DELETE ve tanınmayan komut: tüm tablolar). Kaydet / sil / birleştir / yedekten dön / içe aktar… hepsi
//     Veritabani#islem'den geçer; ayrı bir "temizle" çağrısı unutulamaz.
//   - Kayıt, bağlı olduğu tabloların nesilleri (verilmezse genel nesil) değişmediyse geçerlidir; değiştiyse yeniden hesaplanır.
//   - Kasa kilitlenince, arayüz kilitlenince ya da kasa anahtarı değişince (kasa.mjs) önbellek BOŞALTILIR: çözülmüş veri bellekte kalmaz.
//   - Çalışma alanı değişince yeni bir Veritabani nesnesi açılır; önbellek bağlantıya (WeakMap) bağlı olduğundan eskisi düşer.
//   - Açık yazma işleminin içinde önbellek kullanılmaz; hesap sırasında nesil değişirse (hesap yazdıysa) ya da hata olursa saklanmaz.
// Önbellekteki nesneler PAYLAŞILIR: çağıranlar DEĞİŞTİRMEMELİDİR (gerekirse kopyalar).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirerek yükler). Bağımlılığı yoktur (kasa.mjs bunu içe aktarır).

/** @typedef {{ nesil: number; islemDerinligi?: number; tabloNesli?: (tablo: string) => number }} NesilliVeritabani */

/** En çok kayıt (aşılırsa hepsi bırakılır; anahtarlar ekran / akış / proje sayısıyla sınırlı olduğundan nadirdir). */
const EN_COK_KAYIT = 2000;

/** @type {WeakMap<object, Map<string, { imza: string; deger: unknown }>>} */
const depolar = new WeakMap();
/** Kasa açık kaldıkça (nesilden bağımsız) tutulan önbellekler: ör. şifreli hücre zarfı → düz metin. @type {WeakMap<object, Map<string, Map<string, string>>>} */
const kasaDepolari = new WeakMap();

/**
 * Önbellek bu bağlantı için kullanılabilir mi (kasa.mjs ayarlar: arayüz kilitliyken — arka plan kipinde planlı koşular anahtarla
 * çalışırken — çözülmüş veri önbelleğe GİRMEZ; her çağrı hesaplanır). @type {(vt: object) => boolean}
 */
let onbellekIzinli = () => true;
/** @param {(vt: object) => boolean} fn */
export function onbellekIzniniAyarla(fn) { onbellekIzinli = fn; }

/** @param {NesilliVeritabani} vt @param {readonly string[] | undefined} tablolar */
function imzaAl(vt, tablolar) {
  if (!tablolar || typeof vt.tabloNesli !== 'function') return `n${Number(vt.nesil ?? 0)}`;
  const tn = /** @type {(t: string) => number} */ (vt.tabloNesli).bind(vt);
  return tablolar.map((t) => tn(t)).join(',');
}

/**
 * Önbellekten okur; yoksa (ya da bağlı tablolar değiştiyse) hesaplar ve saklar.
 * @template T @param {NesilliVeritabani} vt @param {string} anahtar @param {() => T} hesapla
 * @param {{ tablolar?: readonly string[] }} [secenekler] tablolar: sonucun bağlı olduğu veritabanı tabloları (verilmezse her değişiklik geçersiz kılar)
 * @returns {T}
 */
export function onbellekte(vt, anahtar, hesapla, secenekler = {}) {
  // Açık bir yazma işleminin içinde önbellek kullanılmaz: işlem kendi yazdığını görmeli (nesil ancak işlem bitince artar).
  if (Number(vt.islemDerinligi ?? 0) > 0 || !onbellekIzinli(vt)) return hesapla();
  const imza = imzaAl(vt, secenekler.tablolar);
  let d = depolar.get(vt);
  if (!d) { d = new Map(); depolar.set(vt, d); }
  const k = d.get(anahtar);
  if (k && k.imza === imza) return /** @type {T} */ (k.deger);
  const nesil = Number(vt.nesil ?? 0);
  const deger = hesapla();
  if (Number(vt.nesil ?? 0) === nesil && depolar.get(vt) === d) {
    if (d.size >= EN_COK_KAYIT) d.clear();
    d.set(anahtar, { imza, deger });
  }
  return deger;
}

/**
 * Kasa açıkken yaşayan adlandırılmış önbellek (nesil değişse de kalır; anahtar içeriği belirlemelidir — ör. şifreli zarf). Kasa
 * kilitlenince onbellegiBosalt ile bırakılır. @param {object} vt @param {string} ad @returns {Map<string, string>}
 */
export function kasaOnbellegi(vt, ad) {
  // Arayüz kilitliyken saklanmayan, kullanılıp atılan bir harita (çağıran aynı kodla çalışır).
  if (!onbellekIzinli(vt)) return new Map();
  let d = kasaDepolari.get(vt);
  if (!d) { d = new Map(); kasaDepolari.set(vt, d); }
  let m = d.get(ad);
  if (!m) { m = new Map(); d.set(ad, m); }
  return m;
}

/** Bağlantının bütün önbelleklerini bırakır (kasa kilidi / anahtar değişimi). @param {object} vt */
export function onbellegiBosalt(vt) {
  depolar.get(vt)?.clear();
  depolar.delete(vt);
  const d = kasaDepolari.get(vt);
  if (d) for (const m of d.values()) m.clear();
  kasaDepolari.delete(vt);
}

/** Yalnız testler: bağlantının önbelleklerindeki kayıt sayısı (nesil + kasa önbellekleri). @param {object} vt */
export function onbellekBoyutu(vt) {
  let n = depolar.get(vt)?.size ?? 0;
  for (const m of kasaDepolari.get(vt)?.values() ?? []) n += m.size;
  return n;
}
