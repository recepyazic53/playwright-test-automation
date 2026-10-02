// ÖZET PANOSU DÜZENİ (saf; sunucu ve arayüz ORTAK — /arayuz/pano-duzeni.mjs olarak da sunulur, HİÇBİR modül içe aktarmaz).
// Sonuçlar > Genel > Özet bir panodur: kartların sırası, boyutu ve ayarı kullanıcının kararıdır ve PROJE BAŞINA tek düzen olarak
// kasada saklanır (sonuclar/ozet-panosu.mjs). Bu modül düzenin biçimini, varsayılanını, doğrulamasını ve düzenleme işlemlerini
// (kaldır / ekle / taşı / boyutlandır) tanımlar; kodda kullanıcıya ait seçim yoktur.
//
// Düzen: { surum: 1, kartlar: [{ id, tur, boyut, ayar? }] }
//   Yerleşik kartlar (tur = id; her biri en çok bir kez): baslarken, ozetKutulari, dikkat, bakim, kapsam, kosuTrendi.
//   Kullanıcı kartları (id "k-…"): sql (SQL sorgusu), veri (Nöbetçi verisi; hazır şablon), metin (kısa not + iç sayfa bağlantıları).
//   boyut: kucuk (1/3) | orta (1/2) | genis (2/3) | tam (tam satır) — 12 sütunlu ızgarada 4 / 6 / 8 / 12 sütun.
// Varsayılan düzen bugünkü Özet'tir: Başlarken, Özet kutuları, Dikkat, Bakım, Kapsam ve güvenlik.

export const PANO_SURUMU = 1;
export const EN_COK_KART = 40;
export const KIMLIK_DESENI = /^[A-Za-z0-9_-]{1,64}$/;
const DIS_KIMLIK = /^[A-Za-z0-9_-]{1,200}$/;
// eslint-disable-next-line no-control-regex
const KONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Kart boyutları (12 sütunlu ızgara). */
export const BOYUTLAR = Object.freeze([
  Object.freeze({ anahtar: 'kucuk', ad: 'Küçük (1/3)', sutun: 4 }),
  Object.freeze({ anahtar: 'orta', ad: 'Orta (1/2)', sutun: 6 }),
  Object.freeze({ anahtar: 'genis', ad: 'Geniş (2/3)', sutun: 8 }),
  Object.freeze({ anahtar: 'tam', ad: 'Tam satır', sutun: 12 })
]);
const BOYUT_ANAHTARLARI = BOYUTLAR.map((b) => b.anahtar);

/** Yerleşik kartlar (mevcut Özet bileşenleri). varsayilan: varsayılan panoda var mı. */
export const YERLESIK_KARTLAR = Object.freeze([
  Object.freeze({ tur: 'baslarken', ad: 'Başlarken', aciklama: 'İlk koşuya giden yedi adım; liste tamamlanınca ya da gizlenince kendiliğinden kaybolur.', boyut: 'tam', varsayilan: true }),
  Object.freeze({ tur: 'ozetKutulari', ad: 'Özet kutuları', aciklama: 'Ekranlar, Servisler ve Uçtan uca: dönemin başarı oranı ve önceki döneme göre fark.', boyut: 'tam', varsayilan: true }),
  Object.freeze({ tur: 'dikkat', ad: 'Dikkat', aciklama: 'Hemen bakılması gerekenler: kritik, P1 ya da uzun süredir kırmızı öğeler, yavaşlayan servisler, kaçan planlı koşular.', boyut: 'kucuk', varsayilan: true }),
  Object.freeze({ tur: 'bakim', ad: 'Bakım', aciklama: 'Eskiyen tarihler, koşmayan senaryolar, bekleyen bulgular, test verisi sağlığı.', boyut: 'kucuk', varsayilan: true }),
  Object.freeze({ tur: 'kapsam', ad: 'Kapsam ve güvenlik', aciklama: 'Senaryosuz metotlar, denenmemiş koşul dalları, yedek, riskli izinler, ortam türü.', boyut: 'kucuk', varsayilan: true }),
  Object.freeze({ tur: 'kosuTrendi', ad: 'Koşu trendi', aciklama: 'Genel kapsamlı tam koşuların seçili dönemdeki çubuk grafiği.', boyut: 'tam', varsayilan: false })
]);
const YERLESIK = new Map(YERLESIK_KARTLAR.map((k) => [k.tur, k]));

/** Kullanıcı kartı türleri. */
export const OZEL_KART_TURLERI = Object.freeze([
  Object.freeze({ tur: 'sql', ad: 'SQL sorgusu', aciklama: 'Tanımlı bir veritabanı bağlantısında yalnız okuma sorgusu; "Yenile"ye basınca çalışır.', boyut: 'orta' }),
  Object.freeze({ tur: 'veri', ad: 'Nöbetçi verisi', aciklama: 'Hazır sorgu şablonları: başarı oranı, bugün başarısız olanlar, talep no\'su olmayanlar, en çok başarısız olanlar.', boyut: 'kucuk' }),
  Object.freeze({ tur: 'metin', ad: 'Metin ve bağlantılar', aciklama: 'Kısa not ve Nöbetçi içindeki sayfalara bağlantılar.', boyut: 'kucuk' })
]);
const OZEL = new Map(OZEL_KART_TURLERI.map((k) => [k.tur, k]));

/** SQL kartının görünümleri. */
export const SQL_GORUNUMLERI = Object.freeze([
  Object.freeze({ anahtar: 'sayi', ad: 'Tek sayı' }), Object.freeze({ anahtar: 'tablo', ad: 'Tablo' }),
  Object.freeze({ anahtar: 'cubuk', ad: 'Çubuk grafik' }), Object.freeze({ anahtar: 'cizgi', ad: 'Çizgi grafik' })
]);
/** Sayı eşiği işleçleri ve renkleri (ilk eşleşen eşik uygulanır). */
export const ESIK_ISLECLERI = Object.freeze(['>', '>=', '<', '<=', '=', '!=']);
export const ESIK_RENKLERI = Object.freeze([
  Object.freeze({ anahtar: 'kirmizi', ad: 'Kırmızı' }), Object.freeze({ anahtar: 'sari', ad: 'Sarı' }), Object.freeze({ anahtar: 'yesil', ad: 'Yeşil' })
]);
export const EN_COK_ESIK = 5;
export const EN_COK_SUTUN = 20;
export const SQL_EN_UZUN = 20_000;
export const NOT_EN_UZUN = 1000;
export const EN_COK_BAGLANTI = 8;

/**
 * Nöbetçi verisi şablonları. Parametre türleri: hedef ("ekran:<id>" | "servis:<id>"), sayi (en / enCok), secim (secenekler).
 * gorunum: sayi (tek değer) | liste (madde listesi).
 */
export const VERI_SABLONLARI = Object.freeze([
  Object.freeze({
    anahtar: 'basariOrani', ad: 'Başarı oranı', aciklama: 'Seçilen ekranın ya da servisin son N gündeki başarı oranı (Dene hariç).', gorunum: 'sayi',
    parametreler: Object.freeze([
      Object.freeze({ ad: 'hedef', etiket: 'Ekran ya da servis', tur: 'hedef' }),
      Object.freeze({ ad: 'gun', etiket: 'Son kaç gün', tur: 'sayi', en: 1, enCok: 90, varsayilan: 7 })
    ])
  }),
  Object.freeze({ anahtar: 'bugunBasarisiz', ad: 'Bugün başarısız olan senaryolar', aciklama: 'Bugünkü koşularda başarısız olan ekran ve servis senaryoları.', gorunum: 'liste', parametreler: Object.freeze([]) }),
  Object.freeze({
    anahtar: 'talepsiz', ad: 'Talep no\'su olmayan senaryolar', aciklama: 'Hiçbir talep numarasına bağlanmamış senaryolar.', gorunum: 'liste',
    parametreler: Object.freeze([
      Object.freeze({ ad: 'tur', etiket: 'Senaryo türü', tur: 'secim', secenekler: Object.freeze([['hepsi', 'Ekran ve servis'], ['ekran', 'Yalnız ekran'], ['servis', 'Yalnız servis']]), varsayilan: 'hepsi' })
    ])
  }),
  Object.freeze({
    anahtar: 'enCokBasarisiz', ad: 'En çok başarısız olan senaryolar', aciklama: 'Son N günde en çok başarısız olan senaryolar (Dene hariç).', gorunum: 'liste',
    parametreler: Object.freeze([
      Object.freeze({ ad: 'gun', etiket: 'Son kaç gün', tur: 'sayi', en: 1, enCok: 90, varsayilan: 30 }),
      Object.freeze({ ad: 'adet', etiket: 'Kaç senaryo', tur: 'sayi', en: 1, enCok: 20, varsayilan: 5 })
    ])
  })
]);
const SABLON = new Map(VERI_SABLONLARI.map((s) => [s.anahtar, s]));

/** Panoya bağlantı verilebilecek iç sayfalar (yalnız Nöbetçi içi adresler; seçim listesi). */
export const IC_SAYFALAR = Object.freeze([
  ['Sonuçlar › Ekranlar', '#/sonuclar/ekranlar'], ['Sonuçlar › Servisler', '#/sonuclar/servisler'], ['Sonuçlar › Uçtan uca akışlar', '#/sonuclar/uctan-uca'],
  ['Raporlar', '#/sonuclar/raporlar'], ['Senaryolar', '#/senaryolar'], ['Ekranlar', '#/ekranlar'], ['Servisler', '#/servisler'],
  ['Uçtan uca akışlar', '#/akislar'], ['Test verisi', '#/veri'], ['Planlı koşular', '#/planli-kosular'], ['Ayarlar › Entegrasyonlar', '#/ayarlar/entegrasyonlar'],
  ['Ayarlar › İzinler', '#/ayarlar/izinler']
]);

/** Panoya özgü hata (sunucu DepoHatasi'ne çevirir; arayüz iletiyi gösterir). */
export class PanoHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) { super(mesaj); this.name = 'PanoHatasi'; }
}

/** Nöbetçi içi adres mi (#/… ; dış adres, betik ya da boşluk yok). @param {unknown} adres */
export function iciAdresMi(adres) {
  return typeof adres === 'string' && adres.length <= 300 && /^#\/[A-Za-z0-9/_\-.%~]*$/.test(adres);
}

/** Boyutun ızgara sütunu (bilinmeyen: 12). @param {string} boyut */
export const boyutSutunu = (boyut) => BOYUTLAR.find((b) => b.anahtar === boyut)?.sutun ?? 12;

/** Kart türünün görünen adı. @param {string} tur */
export const turAdi = (tur) => YERLESIK.get(tur)?.ad ?? OZEL.get(tur)?.ad ?? tur;

/** Kartın panoda görünen adı (kullanıcı kartında başlık). @param {{ tur: string; ayar?: { baslik?: string } }} kart */
export const kartAdi = (kart) => (kart.ayar && typeof kart.ayar.baslik === 'string' && kart.ayar.baslik ? kart.ayar.baslik : turAdi(kart.tur));

/** Yerleşik kart mı? @param {string} tur */
export const yerlesikMi = (tur) => YERLESIK.has(tur);

/** Varsayılan düzen (bugünkü Özet). @returns {{ surum: number; kartlar: Array<{ id: string; tur: string; boyut: string }> }} */
export function varsayilanDuzen() {
  return { surum: PANO_SURUMU, kartlar: YERLESIK_KARTLAR.filter((k) => k.varsayilan).map((k) => ({ id: k.tur, tur: k.tur, boyut: k.boyut })) };
}

/** Düzen varsayılanla aynı mı (sıra, boyut, kart). @param {{ kartlar: Array<{ id: string; tur: string; boyut: string; ayar?: unknown }> }} duzen */
export function varsayilanMi(duzen) {
  const v = varsayilanDuzen().kartlar;
  return duzen.kartlar.length === v.length && duzen.kartlar.every((k, i) => k.id === v[i].id && k.boyut === v[i].boyut && k.ayar === undefined);
}

// ---------------------------------------------------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------------------------------------------------

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const nesneMi = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @param {string} alan @param {number} enCok @param {{ bos?: boolean; cokSatir?: boolean }} [s] */
function metin(v, alan, enCok, s = {}) {
  const m = typeof v === 'string' ? (s.cokSatir ? v.replace(/\r\n/g, '\n') : v.trim()) : '';
  if (!m.trim() && !s.bos) throw new PanoHatasi(`${alan} boş olamaz.`);
  if (m.length > enCok) throw new PanoHatasi(`${alan} en çok ${enCok.toLocaleString('tr-TR')} karakter olabilir.`);
  if (s.cokSatir ? KONTROL.test(m) : /[\u0000-\u001f\u007f]/.test(m)) throw new PanoHatasi(`${alan} denetim karakteri içeremez.`);
  return m;
}

/** @param {unknown} v @param {string} alan */
function disKimlik(v, alan) {
  if (typeof v !== 'string' || !DIS_KIMLIK.test(v)) throw new PanoHatasi(`${alan} geçersiz.`);
  return v;
}

/** SQL kartı ayarı. @param {unknown} ham */
function sqlAyari(ham) {
  if (!nesneMi(ham)) throw new PanoHatasi('SQL kartının ayarı eksik.');
  const baslik = metin(ham.baslik, 'Kart başlığı', 80);
  const h = ham.hedef;
  if (!nesneMi(h)) throw new PanoHatasi('SQL kartı için bir veritabanı bağlantısı seçin.');
  const hedef = h.veritabaniId !== undefined && h.veritabaniId !== ''
    ? { veritabaniId: disKimlik(h.veritabaniId, 'Veritabanı'), ortamId: disKimlik(h.ortamId, 'Ortam') }
    : { baglantiId: disKimlik(h.baglantiId, 'Veritabanı bağlantısı') };
  const sorgu = metin(ham.sorgu, 'Sorgu', SQL_EN_UZUN, { cokSatir: true });
  const gorunum = SQL_GORUNUMLERI.some((g) => g.anahtar === ham.gorunum) ? /** @type {string} */ (ham.gorunum) : 'sayi';
  const esikHam = ham.esikler === undefined ? [] : ham.esikler;
  if (!Array.isArray(esikHam) || esikHam.length > EN_COK_ESIK) throw new PanoHatasi(`En çok ${EN_COK_ESIK} renk eşiği olabilir.`);
  const esikler = esikHam.map((e) => {
    if (!nesneMi(e) || !ESIK_ISLECLERI.includes(/** @type {string} */ (e.islec))) throw new PanoHatasi('Eşiğin işleci geçersiz.');
    const deger = typeof e.deger === 'number' ? e.deger : Number(String(e.deger ?? '').replace(',', '.'));
    if (!Number.isFinite(deger) || String(e.deger ?? '').trim() === '') throw new PanoHatasi('Eşik değeri bir sayı olmalıdır.');
    if (!ESIK_RENKLERI.some((r) => r.anahtar === e.renk)) throw new PanoHatasi('Eşiğin rengi geçersiz.');
    return { islec: /** @type {string} */ (e.islec), deger, renk: /** @type {string} */ (e.renk) };
  });
  const sutunHam = ham.sutunlar === undefined ? [] : ham.sutunlar;
  if (!Array.isArray(sutunHam) || sutunHam.length > EN_COK_SUTUN) throw new PanoHatasi(`En çok ${EN_COK_SUTUN} sütun seçilebilir.`);
  const sutunlar = [...new Set(sutunHam.map((s) => metin(s, 'Sütun adı', 120)))];
  return { baslik, hedef, sorgu, gorunum, esikler, sutunlar };
}

/**
 * Şablon parametreleri (eksikler varsayılanla dolar). @param {string} anahtar @param {unknown} ham
 * @returns {Record<string, string | number>}
 */
export function sablonParametreleri(anahtar, ham) {
  const s = SABLON.get(anahtar);
  if (!s) throw new PanoHatasi('Nöbetçi verisi şablonu geçersiz.');
  const g = nesneMi(ham) ? ham : {};
  /** @type {Record<string, string | number>} */
  const p = {};
  for (const t of s.parametreler) {
    const v = g[t.ad];
    if (t.tur === 'hedef') {
      if (typeof v !== 'string' || !/^(ekran|servis):[A-Za-z0-9_-]{1,200}$/.test(v)) throw new PanoHatasi(`${t.etiket} seçin.`);
      p[t.ad] = v;
    } else if (t.tur === 'sayi') {
      const n = v === undefined || v === '' || v === null ? Number(t.varsayilan) : Number(v);
      if (!Number.isInteger(n) || n < Number(t.en) || n > Number(t.enCok)) throw new PanoHatasi(`${t.etiket} ${t.en}–${t.enCok} arasında bir tam sayı olmalıdır.`);
      p[t.ad] = n;
    } else {
      const secenekler = /** @type {ReadonlyArray<readonly [string, string]>} */ (t.secenekler ?? []);
      const d = v === undefined || v === '' ? String(t.varsayilan) : String(v);
      if (!secenekler.some(([a]) => a === d)) throw new PanoHatasi(`${t.etiket} geçersiz.`);
      p[t.ad] = d;
    }
  }
  return p;
}

/** Nöbetçi verisi kartı ayarı. @param {unknown} ham */
function veriAyari(ham) {
  if (!nesneMi(ham)) throw new PanoHatasi('Nöbetçi verisi kartının ayarı eksik.');
  const sablon = typeof ham.sablon === 'string' ? ham.sablon : '';
  const s = SABLON.get(sablon);
  if (!s) throw new PanoHatasi('Nöbetçi verisi şablonu geçersiz.');
  const baslik = ham.baslik === undefined || ham.baslik === '' ? s.ad : metin(ham.baslik, 'Kart başlığı', 80);
  return { baslik, sablon, parametreler: sablonParametreleri(sablon, ham.parametreler) };
}

/** Metin / bağlantı kartı ayarı. @param {unknown} ham */
function metinAyari(ham) {
  if (!nesneMi(ham)) throw new PanoHatasi('Metin kartının ayarı eksik.');
  const baslik = metin(ham.baslik, 'Kart başlığı', 80);
  const not = metin(ham.not ?? '', 'Not', NOT_EN_UZUN, { bos: true, cokSatir: true });
  const bHam = ham.baglantilar === undefined ? [] : ham.baglantilar;
  if (!Array.isArray(bHam) || bHam.length > EN_COK_BAGLANTI) throw new PanoHatasi(`En çok ${EN_COK_BAGLANTI} bağlantı eklenebilir.`);
  const baglantilar = bHam.map((b) => {
    if (!nesneMi(b) || !iciAdresMi(b.adres)) throw new PanoHatasi('Bağlantı yalnız Nöbetçi içindeki bir sayfaya ("#/" ile başlayan) gidebilir.');
    return { etiket: metin(b.etiket, 'Bağlantı metni', 60), adres: /** @type {string} */ (b.adres) };
  });
  if (!not.trim() && !baglantilar.length) throw new PanoHatasi('Metin kartına bir not ya da bağlantı yazın.');
  return { baslik, not, baglantilar };
}

/**
 * Tek kartın doğrulaması. @param {unknown} ham
 * @returns {{ id: string; tur: string; boyut: string; ayar?: Record<string, unknown> }}
 */
export function kartTemizle(ham) {
  if (!nesneMi(ham)) throw new PanoHatasi('Kart bir nesne olmalıdır.');
  const tur = typeof ham.tur === 'string' ? ham.tur : '';
  const boyut = BOYUT_ANAHTARLARI.includes(/** @type {string} */ (ham.boyut)) ? /** @type {string} */ (ham.boyut)
    : YERLESIK.get(tur)?.boyut ?? OZEL.get(tur)?.boyut ?? 'orta';
  if (YERLESIK.has(tur)) return { id: tur, tur, boyut };
  if (!OZEL.has(tur)) throw new PanoHatasi(`Bilinmeyen kart türü: "${String(tur).slice(0, 40)}".`);
  const id = typeof ham.id === 'string' && KIMLIK_DESENI.test(ham.id) && !YERLESIK.has(ham.id) ? ham.id : '';
  if (!id) throw new PanoHatasi('Kart kimliği geçersiz.');
  const ayar = tur === 'sql' ? sqlAyari(ham.ayar) : tur === 'veri' ? veriAyari(ham.ayar) : metinAyari(ham.ayar);
  return { id, tur, boyut, ayar };
}

/**
 * Düzenin doğrulaması (biçim, sınırlar, tekil kimlik; yerleşik kart en çok bir kez). Bozuksa PanoHatasi.
 * @param {unknown} ham @returns {{ surum: number; kartlar: Array<{ id: string; tur: string; boyut: string; ayar?: Record<string, unknown> }> }}
 */
export function duzenTemizle(ham) {
  if (!nesneMi(ham) || !Array.isArray(ham.kartlar)) throw new PanoHatasi('Pano düzeni geçersiz.');
  if (ham.kartlar.length > EN_COK_KART) throw new PanoHatasi(`Panoda en çok ${EN_COK_KART} kart olabilir.`);
  const kartlar = ham.kartlar.map(kartTemizle);
  const gorulen = new Set();
  for (const k of kartlar) {
    if (gorulen.has(k.id)) throw new PanoHatasi(`"${kartAdi(k)}" panoda birden çok kez var.`);
    gorulen.add(k.id);
  }
  return { surum: PANO_SURUMU, kartlar };
}

// ---------------------------------------------------------------------------------------------------------------------
// Düzenleme işlemleri (saf; yeni düzen döner)
// ---------------------------------------------------------------------------------------------------------------------

/** @template {{ kartlar: any[] }} D @param {D} d @param {any[]} kartlar @returns {D} */
const yeni = (d, kartlar) => ({ ...d, kartlar });

/** Kartı kaldırır. @template {{ kartlar: Array<{ id: string }> }} D @param {D} duzen @param {string} id @returns {D} */
export function kartKaldir(duzen, id) {
  return yeni(duzen, duzen.kartlar.filter((k) => k.id !== id));
}

/**
 * Kart ekler (yerleşik kart zaten varsa düzen değişmez). konum verilmezse sona.
 * @template {{ kartlar: Array<{ id: string; tur: string; boyut: string }> }} D @param {D} duzen
 * @param {{ id?: string; tur: string; boyut?: string; ayar?: unknown }} kart @param {number} [konum]
 * @returns {D}
 */
export function kartEkle(duzen, kart, konum) {
  if (duzen.kartlar.length >= EN_COK_KART) throw new PanoHatasi(`Panoda en çok ${EN_COK_KART} kart olabilir.`);
  const yerlesik = YERLESIK.get(kart.tur);
  if (yerlesik && duzen.kartlar.some((k) => k.id === kart.tur)) return duzen;
  const eklenen = yerlesik ? { id: kart.tur, tur: kart.tur, boyut: kart.boyut ?? yerlesik.boyut }
    : { id: String(kart.id ?? ''), tur: kart.tur, boyut: kart.boyut ?? OZEL.get(kart.tur)?.boyut ?? 'orta', ayar: kart.ayar };
  const liste = duzen.kartlar.slice();
  const i = konum === undefined ? liste.length : Math.max(0, Math.min(liste.length, Math.floor(konum)));
  liste.splice(i, 0, /** @type {any} */ (eklenen));
  return yeni(duzen, liste);
}

/** Kartın ayarını değiştirir. @template {{ kartlar: Array<{ id: string; ayar?: unknown }> }} D @param {D} duzen @param {string} id @param {unknown} ayar @returns {D} */
export function kartAyarla(duzen, id, ayar) {
  return yeni(duzen, duzen.kartlar.map((k) => (k.id === id ? { ...k, ayar } : k)));
}

/**
 * Kartı taşır: hedef sayıysa o sıraya, 'yukari' / 'asagi' ise bir adım. Sınırda düzen değişmez.
 * @template {{ kartlar: Array<{ id: string }> }} D @param {D} duzen @param {string} id @param {number | 'yukari' | 'asagi'} hedef @returns {D}
 */
export function kartTasi(duzen, id, hedef) {
  const i = duzen.kartlar.findIndex((k) => k.id === id);
  if (i < 0) return duzen;
  const j = hedef === 'yukari' ? i - 1 : hedef === 'asagi' ? i + 1 : Math.floor(Number(hedef));
  if (!Number.isFinite(j) || j < 0 || j >= duzen.kartlar.length || j === i) return duzen;
  const liste = duzen.kartlar.slice();
  const [k] = liste.splice(i, 1);
  liste.splice(j, 0, k);
  return yeni(duzen, liste);
}

/** Kartın boyutunu değiştirir. @template {{ kartlar: Array<{ id: string; boyut: string }> }} D @param {D} duzen @param {string} id @param {string} boyut @returns {D} */
export function kartBoyutla(duzen, id, boyut) {
  if (!BOYUT_ANAHTARLARI.includes(boyut)) throw new PanoHatasi('Kart boyutu geçersiz.');
  return yeni(duzen, duzen.kartlar.map((k) => (k.id === id ? { ...k, boyut } : k)));
}

/** Panoda olmayan yerleşik kartlar ("Kart ekle" listesi). @param {{ kartlar: Array<{ id: string }> }} duzen */
export function eksikYerlesikler(duzen) {
  const var_ = new Set(duzen.kartlar.map((k) => k.id));
  return YERLESIK_KARTLAR.filter((k) => !var_.has(k.tur));
}

/**
 * Sayının rengi: ilk eşleşen eşiğin rengi (yoksa null). @param {number} deger
 * @param {ReadonlyArray<{ islec: string; deger: number; renk: string }>} esikler @returns {string | null}
 */
export function esikRengi(deger, esikler) {
  if (typeof deger !== 'number' || !Number.isFinite(deger)) return null;
  for (const e of esikler ?? []) {
    const d = e.deger;
    const tutar = e.islec === '>' ? deger > d : e.islec === '>=' ? deger >= d : e.islec === '<' ? deger < d : e.islec === '<=' ? deger <= d
      : e.islec === '=' ? deger === d : e.islec === '!=' ? deger !== d : false;
    if (tutar) return e.renk;
  }
  return null;
}

/** Hücre değerinden sayı (metin "1.234,5" / "12,5" de). Sayı değilse null. @param {unknown} v */
export function sayiyaCevir(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v !== 'string' || !v.trim()) return null;
  const m = v.trim();
  const n = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(m) ? Number(m.replace(/\./g, '').replace(',', '.')) : Number(m.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
