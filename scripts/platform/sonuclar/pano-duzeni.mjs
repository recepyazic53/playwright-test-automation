// ÖZET PANOSU DÜZENİ (saf; sunucu ve arayüz ORTAK — /arayuz/pano-duzeni.mjs olarak da sunulur, HİÇBİR modül içe aktarmaz).
// Sonuçlar > Genel > Özet bir panodur: kartların sırası, boyutu ve ayarı kullanıcının kararıdır ve PROJE BAŞINA tek düzen olarak
// kasada saklanır (sonuclar/ozet-panosu.mjs). Bu modül düzenin biçimini, varsayılanını, doğrulamasını ve düzenleme işlemlerini
// (kaldır / ekle / taşı / boyutlandır) tanımlar; kodda kullanıcıya ait seçim yoktur.
//
// Düzen: { surum: 2, kartlar: [{ id, tur, x, y, w, h, ayar?, donem? }] } — SERBEST IZGARA.
//   Yerleşik kartlar (tur = id; her biri en çok bir kez): baslarken, ozetKutulari, dikkat, bakim, kapsam, kosuTrendi.
//   Kullanıcı kartları (id "k-…"): sql (SQL sorgusu), veri (Nöbetçi verisi; hazır şablon), metin (kısa not + iç sayfa bağlantıları).
//   x / y: kartın sol üst hücresi (sütun 0–11, satır 0…); w / h: kapladığı sütun (1–12) ve satır (1–EN_COK_YUKSEKLIK) sayısı.
//   Izgara 12 sütundur; satır birimi SATIR_BIRIMI px (satırlar arası IZGARA_BOSLUK px). Kartlar ÜST ÜSTE BİNMEZ; üstte / yanda boşluk
//   kalabilir (otomatik yukarı sıkıştırma YOK). Bir kart başka kartın yerine konunca çakışanlar AŞAĞI itilir (kartYerlestir); komşu
//   kartların boyu değişmez. Kartın en küçük boyutu türüne / görünümüne göredir (enKucukBoyut); daha küçük kayıt o boyuta büyütülür.
//   Kartlar okuma sırasıyla (y, sonra x) saklanır: dar ekranda tek sütunda bu sırayla alt alta dizilir.
//   donem: döneme bağlı kartın dönem seçimi ({ hizli } ya da { baslangic, bitis }); bkz. "Kart dönemi". Panonun genel dönemi yoktur.
// Eski (sürüm 1) SIRALI düzen { kartlar: [{ id, tur, boyut, yukseklik? }], esitYukseklik } okunurken ızgara konumlarına çevrilir
// (eskiDuzenGocu: sıra ve genişlik / yükseklik seçimleri korunur, hiçbir kart kaybolmaz); arayüz göçü bir kez kaydeder.
// Varsayılan düzen bugünkü Özet'tir: Başlarken, Özet kutuları, Dikkat, Bakım, Kapsam ve güvenlik.

export const PANO_SURUMU = 2;
export const EN_COK_KART = 40;
export const KIMLIK_DESENI = /^[A-Za-z0-9_-]{1,64}$/;
const DIS_KIMLIK = /^[A-Za-z0-9_-]{1,200}$/;
// eslint-disable-next-line no-control-regex
const KONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Izgara: sütun sayısı, satır birimi (px) ve hücreler arası boşluk (px; stil-ozet-panosu.css ile aynı). */
export const IZGARA_SUTUN = 12;
export const SATIR_BIRIMI = 48;
export const IZGARA_BOSLUK = 14;
/** Kartın en çok yüksekliği (satır) ve kartın üst kenarının en alt satırı. */
export const EN_COK_YUKSEKLIK = 24;
export const EN_COK_SATIR = 2000;
/** h satırlık kartın piksel yüksekliği (aradaki boşluklar dahil). @param {number} h */
export const satirPikseli = (h) => h * SATIR_BIRIMI + (h - 1) * IZGARA_BOSLUK;

/**
 * Yerleşik kartlar (mevcut Özet bileşenleri). varsayilan: varsayılan panoda var mı. w / h: eklenince (ve varsayılan düzende) boyutu;
 * en: en küçük boyutu.
 */
export const YERLESIK_KARTLAR = Object.freeze([
  Object.freeze({ tur: 'baslarken', ad: 'Başlarken', aciklama: 'İlk koşuya giden yedi adım; liste tamamlanınca ya da gizlenince kendiliğinden kaybolur.', w: 12, h: 6, en: Object.freeze({ w: 4, h: 3 }), varsayilan: true, donemli: false }),
  Object.freeze({ tur: 'ozetKutulari', ad: 'Özet kutuları', aciklama: 'Ekranlar, Servisler ve Uçtan uca: dönemin başarı oranı ve önceki döneme göre fark.', w: 12, h: 5, en: Object.freeze({ w: 4, h: 3 }), varsayilan: true, donemli: true }),
  Object.freeze({ tur: 'dikkat', ad: 'Dikkat', aciklama: 'Hemen bakılması gerekenler: kritik, P1 ya da uzun süredir kırmızı öğeler, yavaşlayan servisler, kaçan planlı koşular.', w: 4, h: 7, en: Object.freeze({ w: 3, h: 3 }), varsayilan: true, donemli: false }),
  Object.freeze({ tur: 'bakim', ad: 'Bakım', aciklama: 'Eskiyen tarihler, koşmayan senaryolar, bekleyen bulgular, test verisi sağlığı.', w: 4, h: 7, en: Object.freeze({ w: 3, h: 3 }), varsayilan: true, donemli: false }),
  Object.freeze({ tur: 'kapsam', ad: 'Kapsam ve güvenlik', aciklama: 'Senaryosuz metotlar, denenmemiş koşul dalları, yedek, riskli izinler, ortam türü.', w: 4, h: 7, en: Object.freeze({ w: 3, h: 3 }), varsayilan: true, donemli: false }),
  Object.freeze({ tur: 'kosuTrendi', ad: 'Koşu trendi', aciklama: 'Genel kapsamlı tam koşuların seçili dönemdeki çubuk grafiği.', w: 12, h: 6, en: Object.freeze({ w: 4, h: 4 }), varsayilan: false, donemli: true })
]);

// ---------------------------------------------------------------------------------------------------------------------
// Kart dönemi: döneme bağlı her kartın kendi dönem seçimi (kart.donem; düzenle birlikte saklanır). Döneme bağlı kartlar: yerleşik
// kartlardan donemli olanlar, donemli Nöbetçi verisi şablonları ve sorgusunda :baslangic / :bitis geçen SQL kartları. Dönem seçimi
// olmayan (eski) kartın başlangıç değeri arayüzde eski genel seçimden gelir (göç); yeni eklenen kartın varsayılanı VARSAYILAN_DONEM.
// ---------------------------------------------------------------------------------------------------------------------

/** Hızlı dönem seçimleri (tarih-araligi.js ile aynı anahtarlar). */
export const DONEM_SECIMLERI = Object.freeze([
  Object.freeze(['1s', 'Son 1 saat']), Object.freeze(['24s', 'Son 24 saat']), Object.freeze(['bugun', 'Bugün']), Object.freeze(['7g', 'Son 7 gün']),
  Object.freeze(['15g', 'Son 15 gün']), Object.freeze(['30g', 'Son 30 gün']), Object.freeze(['tumu', 'Tümü'])
]);
export const VARSAYILAN_DONEM = Object.freeze({ hizli: '24s' });
const SAAT = 3_600_000;
const DONEM_MS = Object.freeze({ '1s': SAAT, '24s': 24 * SAAT, '7g': 7 * 24 * SAAT, '15g': 15 * 24 * SAAT, '30g': 30 * 24 * SAAT });

/**
 * Dönem seçimi: { hizli } ya da özel aralık { baslangic, bitis } (ISO; ikisi de zorunlu, bitiş başlangıçtan önce olamaz). Geçersizse null.
 * @param {unknown} v @returns {{ hizli: string } | { baslangic: string; bitis: string } | null}
 */
export function donemTemizle(v) {
  if (!nesneMi(v)) return null;
  if (typeof v.hizli === 'string') return DONEM_SECIMLERI.some(([a]) => a === v.hizli) ? { hizli: v.hizli } : null;
  const bas = typeof v.baslangic === 'string' && v.baslangic.length <= 40 ? Date.parse(v.baslangic) : NaN;
  const bit = typeof v.bitis === 'string' && v.bitis.length <= 40 ? Date.parse(v.bitis) : NaN;
  if (!Number.isFinite(bas) || !Number.isFinite(bit) || bit < bas) return null;
  return { baslangic: new Date(bas).toISOString(), bitis: new Date(bit).toISOString() };
}

/**
 * Dönemin somut aralığı (SQL parametreleri): hızlı seçimlerde bitiş "şimdi"; "Bugün" yerel gün başı; "Tümü" 1970'ten bugüne.
 * @param {unknown} donem @param {Date} [simdi] @returns {{ baslangic: Date; bitis: Date }}
 */
export function donemAraligi(donem, simdi = new Date()) {
  const d = donemTemizle(donem) ?? VARSAYILAN_DONEM;
  if ('baslangic' in d) return { baslangic: new Date(d.baslangic), bitis: new Date(d.bitis) };
  if (d.hizli === 'tumu') return { baslangic: new Date(0), bitis: new Date(simdi) };
  if (d.hizli === 'bugun') { const g = new Date(simdi); g.setHours(0, 0, 0, 0); return { baslangic: g, bitis: new Date(simdi) }; }
  return { baslangic: new Date(simdi.getTime() - (DONEM_MS[/** @type {keyof typeof DONEM_MS} */ (d.hizli)] ?? 24 * SAAT)), bitis: new Date(simdi) };
}

/** Kısa dönem metni ("Son 24 saat", "01.10.2026 → 05.10.2026"). @param {unknown} donem */
export function donemMetni(donem) {
  const d = donemTemizle(donem) ?? VARSAYILAN_DONEM;
  if ('hizli' in d) return DONEM_SECIMLERI.find(([a]) => a === d.hizli)?.[1] ?? '';
  const g = (/** @type {string} */ iso) => { const t = new Date(iso); return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`; };
  return `${g(d.baslangic)} → ${g(d.bitis)}`;
}

/**
 * SQL sorgusunun dönem parametreleri: kodda (dizgi / yorum dışında) ":baslangic" ve ":bitis" geçiyor mu. "::" (tür dönüşümü) sayılmaz.
 * @param {unknown} sorgu @returns {{ baslangic: boolean; bitis: boolean }}
 */
export function sqlDonemParametreleri(sorgu) {
  const kod = String(sorgu ?? '').replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g, ' ');
  const var_ = (/** @type {string} */ ad) => new RegExp(`(^|[^:\\w]):${ad}(?![\\w])`).test(kod);
  return { baslangic: var_('baslangic'), bitis: var_('bitis') };
}

/** Kart döneme bağlı mı (dönem seçimi gösterilir ve saklanır)? @param {{ tur: string; ayar?: any }} kart */
export function kartDonemliMi(kart) {
  if (YERLESIK.has(kart.tur)) return Boolean(YERLESIK.get(kart.tur)?.donemli);
  if (kart.tur === 'sql') { const p = sqlDonemParametreleri(kart.ayar?.sorgu); return p.baslangic || p.bitis; }
  if (kart.tur === 'veri') return Boolean(SABLON_DONEMLI.get(String(kart.ayar?.sablon ?? '')));
  return false;
}
const YERLESIK = new Map(YERLESIK_KARTLAR.map((k) => [k.tur, k]));

/** Kullanıcı kartı türleri. */
export const OZEL_KART_TURLERI = Object.freeze([
  Object.freeze({ tur: 'sql', ad: 'SQL sorgusu', aciklama: 'Tanımlı bir veritabanı bağlantısında yalnız okuma sorgusu; "Yenile"ye basınca çalışır.' }),
  Object.freeze({ tur: 'veri', ad: 'Nöbetçi verisi', aciklama: 'Hazır sorgu şablonları: başarı oranı, bugün başarısız olanlar, talep no\'su olmayanlar, en çok başarısız olanlar.' }),
  Object.freeze({ tur: 'metin', ad: 'Metin ve bağlantılar', aciklama: 'Kısa not ve Nöbetçi içindeki sayfalara bağlantılar.' })
]);
const OZEL = new Map(OZEL_KART_TURLERI.map((k) => [k.tur, k]));

/** SQL kartının görünümleri. */
export const SQL_GORUNUMLERI = Object.freeze([
  Object.freeze({ anahtar: 'sayi', ad: 'Tek sayı' }), Object.freeze({ anahtar: 'tablo', ad: 'Tablo' }),
  Object.freeze({ anahtar: 'cubuk', ad: 'Çubuk grafik' }), Object.freeze({ anahtar: 'cizgi', ad: 'Çizgi grafik' }),
  Object.freeze({ anahtar: 'yuzde', ad: 'Yüzde / oran' }), Object.freeze({ anahtar: 'pasta', ad: 'Pasta / halka grafik' }),
  Object.freeze({ anahtar: 'degisim', ad: 'Sayı + değişim' }), Object.freeze({ anahtar: 'liste', ad: 'Liste' }),
  Object.freeze({ anahtar: 'kutucuk', ad: 'Durum kutucukları' })
]);
/** Sayı eşiği işleçleri ve renkleri (ilk eşleşen eşik uygulanır). */
export const ESIK_ISLECLERI = Object.freeze(['>', '>=', '<', '<=', '=', '!=']);
export const ESIK_RENKLERI = Object.freeze([
  Object.freeze({ anahtar: 'kirmizi', ad: 'Kırmızı' }), Object.freeze({ anahtar: 'sari', ad: 'Sarı' }), Object.freeze({ anahtar: 'yesil', ad: 'Yeşil' })
]);
export const EN_COK_ESIK = 5;
export const EN_COK_SUTUN = 100;
/** Tablo sütun genişliği sınırları (px; kenar tutamağıyla ayarlanır, kartın ayarında saklanır). */
export const SUTUN_GENISLIGI = Object.freeze({ en: 40, enCok: 1200 });
export const SQL_EN_UZUN = 20_000;
export const NOT_EN_UZUN = 1000;
export const EN_COK_BAGLANTI = 8;

/**
 * Nöbetçi verisi şablonları. Parametre türleri: hedef ("ekran:<id>" | "servis:<id>"), sayi (en / enCok), secim (secenekler).
 * gorunum: sayi (tek değer) | liste (madde listesi). donemli: kartta dönem seçimi olur mu (açıkça işaretlenir). Bugünkü şablonların
 * zaman penceresi kendi parametresinde ("Son kaç gün") ya da adındadır ("Bugün"): kart dönemine bağlı değildirler.
 */
export const VERI_SABLONLARI = Object.freeze([
  Object.freeze({
    anahtar: 'basariOrani', ad: 'Başarı oranı', aciklama: 'Seçilen ekranın ya da servisin son N gündeki başarı oranı (Dene hariç).', gorunum: 'sayi', donemli: false,
    parametreler: Object.freeze([
      Object.freeze({ ad: 'hedef', etiket: 'Ekran ya da servis', tur: 'hedef' }),
      Object.freeze({ ad: 'gun', etiket: 'Son kaç gün', tur: 'sayi', en: 1, enCok: 90, varsayilan: 7 })
    ])
  }),
  Object.freeze({ anahtar: 'bugunBasarisiz', ad: 'Bugün başarısız olan senaryolar', aciklama: 'Bugünkü koşularda başarısız olan ekran ve servis senaryoları.', gorunum: 'liste', donemli: false, parametreler: Object.freeze([]) }),
  Object.freeze({
    anahtar: 'talepsiz', ad: 'Talep no\'su olmayan senaryolar', aciklama: 'Hiçbir talep numarasına bağlanmamış senaryolar.', gorunum: 'liste', donemli: false,
    parametreler: Object.freeze([
      Object.freeze({ ad: 'tur', etiket: 'Senaryo türü', tur: 'secim', secenekler: Object.freeze([['hepsi', 'Ekran ve servis'], ['ekran', 'Yalnız ekran'], ['servis', 'Yalnız servis']]), varsayilan: 'hepsi' })
    ])
  }),
  Object.freeze({
    anahtar: 'enCokBasarisiz', ad: 'En çok başarısız olan senaryolar', aciklama: 'Son N günde en çok başarısız olan senaryolar (Dene hariç).', gorunum: 'liste', donemli: false,
    parametreler: Object.freeze([
      Object.freeze({ ad: 'gun', etiket: 'Son kaç gün', tur: 'sayi', en: 1, enCok: 90, varsayilan: 30 }),
      Object.freeze({ ad: 'adet', etiket: 'Kaç senaryo', tur: 'sayi', en: 1, enCok: 20, varsayilan: 5 })
    ])
  })
]);
const SABLON = new Map(VERI_SABLONLARI.map((s) => [s.anahtar, s]));
const SABLON_DONEMLI = new Map(VERI_SABLONLARI.map((s) => [s.anahtar, /** @type {{ donemli?: boolean }} */ (s).donemli === true]));

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

/** Kart türünün görünen adı. @param {string} tur */
export const turAdi = (tur) => YERLESIK.get(tur)?.ad ?? OZEL.get(tur)?.ad ?? tur;

/** Kartın panoda görünen adı (kullanıcı kartında başlık). @param {{ tur: string; ayar?: { baslik?: string } }} kart */
export const kartAdi = (kart) => (kart.ayar && typeof kart.ayar.baslik === 'string' && kart.ayar.baslik ? kart.ayar.baslik : turAdi(kart.tur));

/** Yerleşik kart mı? @param {string} tur */
export const yerlesikMi = (tur) => YERLESIK.has(tur);

// ---------------------------------------------------------------------------------------------------------------------
// Izgara boyutları
// ---------------------------------------------------------------------------------------------------------------------

/** SQL kartı görünümlerinin en küçük ve eklenince aldığı boyutu: tek sayı küçük, tablo büyük. */
const SQL_BOYUTLARI = Object.freeze({
  sayi: [{ w: 2, h: 3 }, { w: 3, h: 3 }], yuzde: [{ w: 2, h: 3 }, { w: 3, h: 3 }], degisim: [{ w: 2, h: 3 }, { w: 3, h: 3 }],
  tablo: [{ w: 4, h: 4 }, { w: 6, h: 6 }], cubuk: [{ w: 3, h: 4 }, { w: 6, h: 5 }], cizgi: [{ w: 3, h: 4 }, { w: 6, h: 5 }],
  pasta: [{ w: 3, h: 4 }, { w: 4, h: 5 }], liste: [{ w: 3, h: 3 }, { w: 4, h: 5 }], kutucuk: [{ w: 3, h: 3 }, { w: 4, h: 4 }]
});

/** @param {{ tur: string; ayar?: any }} kart @returns {[{ w: number; h: number }, { w: number; h: number }]} [en küçük, eklenince] */
function turBoyutlari(kart) {
  const y = YERLESIK.get(kart.tur);
  if (y) return [y.en, { w: y.w, h: y.h }];
  if (kart.tur === 'sql') return /** @type {any} */ (SQL_BOYUTLARI)[String(kart.ayar?.gorunum ?? 'sayi')] ?? SQL_BOYUTLARI.sayi;
  if (kart.tur === 'veri') return SABLON.get(String(kart.ayar?.sablon ?? ''))?.gorunum === 'liste' ? [{ w: 3, h: 3 }, { w: 4, h: 5 }] : [{ w: 2, h: 3 }, { w: 3, h: 3 }];
  return [{ w: 2, h: 2 }, { w: 4, h: 3 }];
}
/** Kartın en küçük boyutu (türüne / görünümüne göre). @param {{ tur: string; ayar?: any }} kart */
export const enKucukBoyut = (kart) => ({ ...turBoyutlari(kart)[0] });
/** Yeni eklenen kartın boyutu. @param {{ tur: string; ayar?: any }} kart */
export const varsayilanBoyut = (kart) => ({ ...turBoyutlari(kart)[1] });

/** İki dikdörtgen üst üste biniyor mu? @param {{ x: number; y: number; w: number; h: number }} a @param {{ x: number; y: number; w: number; h: number }} b */
export const cakisiyorMu = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Okuma sırası (y, sonra x; eşitse kimlik). @param {{ x: number; y: number; id: string }} a @param {{ x: number; y: number; id: string }} b */
const okumaSirasi = (a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Kartları okuma sırasına dizer (yeni dizi). @template {{ x: number; y: number; id: string }} K @param {ReadonlyArray<K>} kartlar @returns {K[]} */
export const okumaSirasinaDiz = (kartlar) => kartlar.slice().sort(okumaSirasi);

/** Kartların kapladığı en alt satır (boş panoda 0). @param {ReadonlyArray<{ y: number; h: number }>} kartlar */
export const altSinir = (kartlar) => kartlar.reduce((m, k) => Math.max(m, k.y + k.h), 0);

/** Sayıyı [en, enCok] aralığına tam sayı olarak sıkıştırır. @param {unknown} v @param {number} en @param {number} enCok @param {number} yedek */
const sikistir = (v, en, enCok, yedek) => { const n = Math.round(Number(v)); return Math.max(en, Math.min(enCok, Number.isFinite(n) ? n : yedek)); };

/**
 * İstenen konumu / boyutu kartın sınırlarına oturtur: genişlik en küçük–12, yükseklik en küçük–EN_COK_YUKSEKLIK, x ızgarada kalır.
 * @param {{ tur: string; ayar?: any; x: number; y: number; w: number; h: number }} kart @param {{ x?: number; y?: number; w?: number; h?: number }} istek
 */
function sinirla(kart, istek) {
  const en = enKucukBoyut(kart);
  const w = sikistir(istek.w ?? kart.w, en.w, IZGARA_SUTUN, kart.w);
  const h = sikistir(istek.h ?? kart.h, en.h, EN_COK_YUKSEKLIK, kart.h);
  return { x: sikistir(istek.x ?? kart.x, 0, IZGARA_SUTUN - w, kart.x), y: sikistir(istek.y ?? kart.y, 0, EN_COK_SATIR, kart.y), w, h };
}

/**
 * Çakışma çözümü: sabit kartlar yerinde kalır; diğerleri (özgün okuma sırasıyla) bir sabit karta ya da önceden yerleşmiş bir karta
 * değiyorsa onun hemen altına İTİLİR (yalnız aşağı; boyutları değişmez, yukarı sıkıştırma yok).
 * @template {{ id: string; x: number; y: number; w: number; h: number }} K @param {K[]} sabitler @param {ReadonlyArray<K>} digerleri @returns {K[]}
 */
function cakismalariCoz(sabitler, digerleri) {
  /** @type {K[]} */
  const yerlesen = [...sabitler];
  for (const d of okumaSirasinaDiz(digerleri)) {
    let y = d.y;
    for (;;) {
      const engel = yerlesen.find((s) => cakisiyorMu({ ...d, y }, s));
      if (!engel) break;
      y = engel.y + engel.h;
    }
    yerlesen.push(y === d.y ? d : { ...d, y });
  }
  return okumaSirasinaDiz(yerlesen);
}

/** Varsayılan düzen (bugünkü Özet; ızgara konumlarıyla). @returns {PanoDuzeniT} */
export function varsayilanDuzen() {
  /** @type {PanoKartiT[]} */
  const kartlar = [];
  let x = 0; let y = 0; let satirH = 0;
  for (const k of YERLESIK_KARTLAR.filter((v) => v.varsayilan)) {
    if (x + k.w > IZGARA_SUTUN) { y += satirH; x = 0; satirH = 0; }
    kartlar.push({ id: k.tur, tur: k.tur, x, y, w: k.w, h: k.h });
    x += k.w; satirH = Math.max(satirH, k.h);
  }
  return { surum: PANO_SURUMU, kartlar };
}

/** Düzen varsayılanla aynı mı (kartlar, konum ve boyut; dönem sayılmaz). @param {{ kartlar: ReadonlyArray<PanoKartiT> }} duzen */
export function varsayilanMi(duzen) {
  const v = varsayilanDuzen().kartlar;
  const d = okumaSirasinaDiz(duzen.kartlar);
  return d.length === v.length && d.every((k, i) => k.id === v[i].id && k.x === v[i].x && k.y === v[i].y && k.w === v[i].w && k.h === v[i].h
    && k.ayar === undefined);
}

/**
 * @typedef {{ id: string; tur: string; x: number; y: number; w: number; h: number; ayar?: Record<string, any>; donem?: object }} PanoKartiT
 * @typedef {{ surum: number; kartlar: PanoKartiT[] }} PanoDuzeniT
 */

// ---------------------------------------------------------------------------------------------------------------------
// Göç: eski sıralı düzen → ızgara
// ---------------------------------------------------------------------------------------------------------------------
// Eski düzende kartlar sırayla 12 sütuna akardı: boyut kucuk 4 / orta 6 / genis 8 / tam 12 sütun; yükseklik 'oto' (içerik) ya da N satır
// (88 px + 14 px boşluk). Çeviri aynı akışı izler: kart satıra sığmazsa alt satıra iner; satırın üstü bir önceki satırın en uzun
// kartının altıdır. N satır → yeni birimde aynı piksel boyu (yuvarlanır); 'oto' → türün varsayılan yüksekliği. "Aynı satırdaki kartlar
// aynı yükseklikte" açıksa (eski varsayılan) satırdaki kartlar satırın en uzununa eşitlenir. Sonuç en küçük boyutlardan küçük olmaz.
const ESKI_SUTUN = Object.freeze({ kucuk: 4, orta: 6, genis: 8, tam: 12 });
const ESKI_SATIR_PX = 88 + 14;

/**
 * Konumsuz kartları eski sıralı akışla ızgaraya yerleştirir (ustY satırından başlayarak).
 * @template {{ id: string; tur: string; ayar?: any }} K
 * @param {ReadonlyArray<{ kart: K; boyut?: unknown; yukseklik?: unknown }>} liste @param {boolean} esit @param {number} [ustY]
 * @returns {Array<K & { x: number; y: number; w: number; h: number }>}
 */
export function eskiDuzenGocu(liste, esit, ustY = 0) {
  /** @type {Array<Array<K & { x: number; y: number; w: number; h: number }>>} */
  const satirlar = [[]];
  let x = 0;
  for (const { kart, boyut, yukseklik } of liste) {
    const en = enKucukBoyut(kart);
    const v = varsayilanBoyut(kart);
    // Boyutu yoksa eski varsayılan: yerleşikte bugünkü genişlik, SQL Orta (6), Nöbetçi verisi ve metin Küçük (4).
    const w = Math.max(en.w, /** @type {Record<string, number>} */ (ESKI_SUTUN)[String(boyut)] ?? (YERLESIK.has(kart.tur) ? v.w : kart.tur === 'sql' ? 6 : 4));
    const n = Number(yukseklik);
    const h = Math.min(EN_COK_YUKSEKLIK, Math.max(en.h, Number.isInteger(n) && n > 0 ? Math.round((n * ESKI_SATIR_PX) / (SATIR_BIRIMI + IZGARA_BOSLUK)) : v.h));
    if (x + w > IZGARA_SUTUN) { satirlar.push([]); x = 0; }
    satirlar[satirlar.length - 1].push({ ...kart, x, y: 0, w, h });
    x += w;
  }
  let y = ustY;
  /** @type {Array<K & { x: number; y: number; w: number; h: number }>} */
  const sonuc = [];
  for (const s of satirlar) {
    if (!s.length) continue;
    const enUzun = Math.max(...s.map((k) => k.h));
    for (const k of s) sonuc.push({ ...k, y, h: esit ? enUzun : k.h });
    y += enUzun;
  }
  return sonuc;
}

/** Ham düzen eski (sıralı) biçimde mi: sürüm 2 değil ya da bir kartın konumu yok. @param {unknown} ham */
export function eskiBicimMi(ham) {
  if (!nesneMi(ham) || !Array.isArray(ham.kartlar)) return false;
  return ham.surum !== PANO_SURUMU || ham.kartlar.some((k) => !nesneMi(k) || !['x', 'y', 'w', 'h'].every((a) => a in k));
}

/**
 * Görünür yerleşim (yalnız ekranda; kaydedilmez): gizlenen kartların (ör. tamamlanan Başlarken) kapladığı ve görünen hiçbir kartın
 * kullanmadığı satırlar daralır; kullanıcının bıraktığı boşluklar korunur.
 * @template {{ id: string; y: number; h: number }} K @param {ReadonlyArray<K>} kartlar @param {ReadonlySet<string>} gizli @returns {K[]}
 */
export function gorunurYerlesim(kartlar, gizli) {
  const gorunen = kartlar.filter((k) => !gizli.has(k.id));
  if (gorunen.length === kartlar.length) return [...kartlar];
  const dolu = new Set();
  for (const k of gorunen) for (let r = k.y; r < k.y + k.h; r++) dolu.add(r);
  const bos = new Set();
  for (const k of kartlar) if (gizli.has(k.id)) for (let r = k.y; r < k.y + k.h; r++) if (!dolu.has(r)) bos.add(r);
  const kayma = (/** @type {number} */ y) => { let n = 0; for (const r of bos) if (r < y) n++; return n; };
  return gorunen.map((k) => ({ ...k, y: k.y - kayma(k.y) }));
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
  const gHam = ham.sutunGenislikleri === undefined || ham.sutunGenislikleri === null ? {} : ham.sutunGenislikleri;
  if (!nesneMi(gHam) || Object.keys(gHam).length > EN_COK_SUTUN) throw new PanoHatasi('Sütun genişlikleri geçersiz.');
  /** @type {Record<string, number>} */
  const sutunGenislikleri = {};
  for (const [ad, g] of Object.entries(gHam)) {
    const n = Math.round(Number(g));
    if (!Number.isFinite(n) || n < SUTUN_GENISLIGI.en || n > SUTUN_GENISLIGI.enCok) throw new PanoHatasi(`Sütun genişliği ${SUTUN_GENISLIGI.en}–${SUTUN_GENISLIGI.enCok} px olmalıdır.`);
    sutunGenislikleri[metin(ad, 'Sütun adı', 120)] = n;
  }
  return { baslik, hedef, sorgu, gorunum, esikler, sutunlar, sutunGenislikleri, bicim: bicimTemizle(ham.bicim) };
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
 * Kartın ızgara konumu: x / y / w / h dördü birlikte verilir (hiçbiri yoksa {} — konumu düzen belirler). Sınır dışı ya da tam sayı
 * olmayan değer PanoHatasi. En küçük boyuttan küçükse burada hata verilmez (duzenTemizle büyütür).
 * @param {Record<string, unknown>} ham @returns {{ x: number; y: number; w: number; h: number } | {}}
 */
function konumTemizle(ham) {
  const alanlar = /** @type {const} */ (['x', 'y', 'w', 'h']);
  const var_ = alanlar.filter((a) => ham[a] !== undefined && ham[a] !== null);
  if (!var_.length) return {};
  if (var_.length < 4) throw new PanoHatasi('Kartın konumu eksik (x, y, w, h birlikte verilmelidir).');
  const [x, y, w, h] = alanlar.map((a) => Number(ham[a]));
  if (![x, y, w, h].every(Number.isInteger)) throw new PanoHatasi('Kartın konumu tam sayı olmalıdır.');
  if (w < 1 || w > IZGARA_SUTUN || x < 0 || x + w > IZGARA_SUTUN) throw new PanoHatasi(`Kart ızgaranın ${IZGARA_SUTUN} sütununa sığmalıdır.`);
  if (h < 1 || h > EN_COK_YUKSEKLIK) throw new PanoHatasi(`Kart yüksekliği 1–${EN_COK_YUKSEKLIK} satır olmalıdır.`);
  if (y < 0 || y > EN_COK_SATIR) throw new PanoHatasi('Kartın satırı geçersiz.');
  return { x, y, w, h };
}

/**
 * Tek kartın doğrulaması (konum varsa dahil). @param {unknown} ham
 * @returns {{ id: string; tur: string; x?: number; y?: number; w?: number; h?: number; ayar?: Record<string, unknown>; donem?: object }}
 */
export function kartTemizle(ham) {
  if (!nesneMi(ham)) throw new PanoHatasi('Kart bir nesne olmalıdır.');
  const tur = typeof ham.tur === 'string' ? ham.tur : '';
  const yk = konumTemizle(ham);
  // Dönem yalnız döneme bağlı kartta saklanır; yoksa (eski kayıt) yazılmaz — arayüz göçle doldurur.
  const donemi = (/** @type {{ tur: string; ayar?: any }} */ k) => {
    if (ham.donem === undefined || !kartDonemliMi(k)) return {};
    const d = donemTemizle(ham.donem);
    if (!d) throw new PanoHatasi('Kartın dönemi geçersiz.');
    return { donem: d };
  };
  if (YERLESIK.has(tur)) return { id: tur, tur, ...yk, ...donemi({ tur }) };
  if (!OZEL.has(tur)) throw new PanoHatasi(`Bilinmeyen kart türü: "${String(tur).slice(0, 40)}".`);
  const id = typeof ham.id === 'string' && KIMLIK_DESENI.test(ham.id) && !YERLESIK.has(ham.id) ? ham.id : '';
  if (!id) throw new PanoHatasi('Kart kimliği geçersiz.');
  const ayar = tur === 'sql' ? sqlAyari(ham.ayar) : tur === 'veri' ? veriAyari(ham.ayar) : metinAyari(ham.ayar);
  return { id, tur, ...yk, ayar, ...donemi({ tur, ayar }) };
}

/**
 * Düzenin doğrulaması (biçim, tekil kimlik, yerleşik kart en çok bir kez; ızgara sınırları ve ÇAKIŞMASIZLIK). Bozuksa PanoHatasi.
 * Konumu olmayan kartlar (eski sıralı düzen ya da konumsuz eklenen kart) konumlu kartların altına eski akışla yerleştirilir (göç).
 * En küçük boyuttan küçük kart o boyuta büyütülür; büyümenin yol açtığı çakışma aşağı itilerek çözülür. Kartlar okuma sırasıyla döner.
 * @param {unknown} ham @returns {PanoDuzeniT}
 */
export function duzenTemizle(ham) {
  if (!nesneMi(ham) || !Array.isArray(ham.kartlar)) throw new PanoHatasi('Pano düzeni geçersiz.');
  if (ham.kartlar.length > EN_COK_KART) throw new PanoHatasi(`Panoda en çok ${EN_COK_KART} kart olabilir.`);
  const temiz = ham.kartlar.map(kartTemizle);
  const gorulen = new Set();
  for (const k of temiz) {
    if (gorulen.has(k.id)) throw new PanoHatasi(`"${kartAdi(k)}" panoda birden çok kez var.`);
    gorulen.add(k.id);
  }
  const konumlu = /** @type {PanoKartiT[]} */ (temiz.filter((k) => k.x !== undefined));
  for (let i = 0; i < konumlu.length; i++) {
    for (let j = i + 1; j < konumlu.length; j++) {
      if (cakisiyorMu(konumlu[i], konumlu[j])) throw new PanoHatasi(`"${kartAdi(konumlu[i])}" ile "${kartAdi(konumlu[j])}" üst üste biniyor.`);
    }
  }
  const hamKartlar = /** @type {Array<Record<string, unknown>>} */ (ham.kartlar);
  const konumsuz = temiz.map((kart, i) => ({ kart, boyut: hamKartlar[i].boyut, yukseklik: hamKartlar[i].yukseklik })).filter((g) => g.kart.x === undefined);
  /** @type {PanoKartiT[]} */
  let kartlar = [...konumlu, ...eskiDuzenGocu(konumsuz, ham.esitYukseklik !== false, altSinir(konumlu))];
  // En küçük boyut: küçük kart büyütülür (x gerekirse sola kayar), büyüyen kart yerinde kalır ve değdiği kartlar aşağı itilir.
  for (const k of okumaSirasinaDiz(kartlar)) {
    const en = enKucukBoyut(k);
    if (k.w >= en.w && k.h >= en.h) continue;
    const guncel = /** @type {PanoKartiT} */ (kartlar.find((x) => x.id === k.id));
    const b = sinirla(guncel, {});
    kartlar = cakismalariCoz([{ ...guncel, ...b }], kartlar.filter((x) => x.id !== k.id));
  }
  return { surum: PANO_SURUMU, kartlar: okumaSirasinaDiz(kartlar) };
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
 * Kart ekler (yerleşik kart zaten varsa düzen değişmez). Boyut türün varsayılanı (kart.w / kart.h verilirse o; en küçükten küçük
 * olmaz). konum { x, y } verilmezse panonun en altına, sola; verilirse oraya konur ve çakışanlar aşağı itilir.
 * @template {{ kartlar: any[] }} D @param {D} duzen
 * @param {{ id?: string; tur: string; ayar?: unknown; donem?: unknown; w?: number; h?: number }} kart @param {{ x: number; y: number }} [konum]
 * @returns {D}
 */
export function kartEkle(duzen, kart, konum) {
  if (duzen.kartlar.length >= EN_COK_KART) throw new PanoHatasi(`Panoda en çok ${EN_COK_KART} kart olabilir.`);
  const yerlesik = YERLESIK.get(kart.tur);
  if (yerlesik && duzen.kartlar.some((k) => k.id === kart.tur)) return duzen;
  /** @type {Record<string, any>} */
  const eklenen = yerlesik ? { id: kart.tur, tur: kart.tur } : { id: String(kart.id ?? ''), tur: kart.tur, ayar: kart.ayar };
  const v = varsayilanBoyut(/** @type {any} */ (eklenen));
  const b = sinirla(/** @type {any} */ ({ ...eklenen, x: 0, y: 0, ...v }), { w: kart.w ?? v.w, h: kart.h ?? v.h, x: konum?.x ?? 0, y: konum?.y ?? altSinir(duzen.kartlar) });
  Object.assign(eklenen, b);
  // Yeni eklenen döneme bağlı kartın varsayılan dönemi.
  if (kartDonemliMi(/** @type {any} */ (eklenen))) eklenen.donem = donemTemizle(kart.donem) ?? { ...VARSAYILAN_DONEM };
  return yeni(duzen, cakismalariCoz([/** @type {any} */ (eklenen)], duzen.kartlar));
}

/**
 * Kartın ayarını değiştirir. Görünüm değişip en küçük boyut büyüdüyse kart büyütülür (çakışanlar aşağı itilir).
 * @template {{ kartlar: any[] }} D @param {D} duzen @param {string} id @param {unknown} ayar @returns {D}
 */
export function kartAyarla(duzen, id, ayar) {
  const d = yeni(duzen, duzen.kartlar.map((k) => {
    if (k.id !== id) return k;
    const { donem, ...kalan } = /** @type {any} */ ({ ...k, ayar });
    // Sorgu döneme bağlı hâle geldiyse varsayılan dönem; döneme bağlı değilse dönem kaldırılır.
    return kartDonemliMi(kalan) ? { ...kalan, donem: donemTemizle(donem) ?? { ...VARSAYILAN_DONEM } } : kalan;
  }));
  const k = d.kartlar.find((x) => x.id === id);
  return k && typeof k.x === 'number' ? kartYerlestir(d, id, {}) : d;
}

/** Kartın dönemini değiştirir (yalnız döneme bağlı kart). @template {{ kartlar: Array<{ id: string }> }} D @param {D} duzen @param {string} id @param {unknown} donem @returns {D} */
export function kartDonemle(duzen, id, donem) {
  const d = donemTemizle(donem);
  if (!d) throw new PanoHatasi('Dönem geçersiz.');
  return yeni(duzen, duzen.kartlar.map((k) => (k.id === id && kartDonemliMi(/** @type {any} */ (k)) ? { ...k, donem: d } : k)));
}

/**
 * Kartı istenen konuma / boyuta koyar (taşıma, boyutlandırma; sürükle-bırak, köşe tutamağı ve klavye). İstek ızgara sınırlarına ve
 * kartın en küçük boyutuna oturtulur. Kart tam o hücreye konur (üstünde / yanında boşluk kalabilir); değdiği kartlar AŞAĞI itilir,
 * hiçbir kartın boyu değişmez ve kartlar yukarı sıkıştırılmaz. Değişiklik yoksa aynı düzen döner.
 * @template {{ kartlar: any[] }} D @param {D} duzen @param {string} id @param {{ x?: number; y?: number; w?: number; h?: number }} istek @returns {D}
 */
export function kartYerlestir(duzen, id, istek) {
  const k = duzen.kartlar.find((x) => x.id === id);
  if (!k) return duzen;
  const b = sinirla(k, istek);
  if (b.x === k.x && b.y === k.y && b.w === k.w && b.h === k.h) return duzen;
  return yeni(duzen, cakismalariCoz([{ ...k, ...b }], duzen.kartlar.filter((x) => x.id !== id)));
}

/**
 * Okuma sırasında (y, sonra x) bir öne / bir sonraya taşır (dar ekran ve ↑ ↓ düğmeleri): kart komşusunun yerini alır, komşu kartın
 * eski yerine (gerekirse hemen altına) geçer; değdikleri aşağı itilir. Sınırda düzen değişmez.
 * @template {{ kartlar: any[] }} D @param {D} duzen @param {string} id @param {'yukari' | 'asagi'} yon @returns {D}
 */
export function kartSiraTasi(duzen, id, yon) {
  const sirali = okumaSirasinaDiz(duzen.kartlar);
  const i = sirali.findIndex((k) => k.id === id);
  if (i < 0) return duzen;
  if (yon === 'asagi') return i + 1 < sirali.length ? kartSiraTasi(duzen, sirali[i + 1].id, 'yukari') : duzen;
  if (i === 0) return duzen;
  const k = sirali[i]; const o = sirali[i - 1];
  const d = kartYerlestir(duzen, k.id, { x: Math.min(o.x, IZGARA_SUTUN - k.w), y: o.y });
  const kYeni = d.kartlar.find((x) => x.id === k.id);
  const oSimdi = d.kartlar.find((x) => x.id === o.id);
  const hedef = { x: Math.min(k.x, IZGARA_SUTUN - o.w), y: k.y };
  // Komşu tümüyle üstteyse (alt alta kartlar) ya da yeni yerine değiyorsa kartın hemen altına iner (arada boşluk açılmaz).
  if (o.y + o.h <= k.y || cakisiyorMu({ ...oSimdi, ...hedef }, kYeni)) hedef.y = kYeni.y + kYeni.h;
  return kartYerlestir(d, o.id, hedef);
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

// ---------------------------------------------------------------------------------------------------------------------
// Biçim (sayı içeren görünümler; saf, arayüzle ORTAK)
// ---------------------------------------------------------------------------------------------------------------------
// Ondalık: 'oto' (tam sayıysa 0, değilse en çok 2 hane) ya da 0–3. Binlik ayırıcı tr-TR (1.245; ondalık virgül). Ön / son ek
// değere eklenir ("₺", " sn", " adet"). Tarih: 'yok' (olduğu gibi), 'gun' (gg.aa.yyyy), 'dakika' (gg.aa.yyyy ss:dd).
// Yüzde: oran 'oto' (|değer| ≤ 1 ise 0–1 oran sayılır, ×100), 'oran' (her zaman ×100), 'yuzde' (değer zaten yüzde). Gösterim "%83,4".
// EŞİK KURALI: renk eşikleri biçimden ÖNCEKİ ham sayıya uygulanır (ondalık, ön / son ek eşiği etkilemez); "Yüzde / oran"
// görünümünde yüzde değerine (0,834 → 83,4: "> 80" eşiği tutar), "Sayı + değişim"de güncel değere, "Durum kutucukları"nda her
// kutunun değerine uygulanır.

/** Varsayılan biçim. */
export const VARSAYILAN_BICIM = Object.freeze({ ondalik: 'oto', onEk: '', sonEk: '', tarih: 'yok', oran: 'oto', hedef: null, gosterge: 'cubuk' });
export const ONDALIK_SECENEKLERI = Object.freeze(['oto', 0, 1, 2, 3]);
export const TARIH_BICIMLERI = Object.freeze([['yok', 'Olduğu gibi'], ['gun', 'gg.aa.yyyy'], ['dakika', 'gg.aa.yyyy ss:dd']]);
export const ORAN_SECENEKLERI = Object.freeze([['oto', 'Otomatik (0–1 ise oran)'], ['oran', 'Değer 0–1 oran'], ['yuzde', 'Değer zaten yüzde']]);
export const GOSTERGE_SECENEKLERI = Object.freeze([['cubuk', 'İlerleme çubuğu'], ['ibre', 'Gösterge (ibre)']]);
/** Pasta / halka grafikte en çok dilim (kalanı "Diğer"). */
export const EN_COK_DILIM = 8;
/** Liste görünümünde en çok madde. */
export const LISTE_EN_COK = 50;

/**
 * Biçim ayarının doğrulaması (eksikler varsayılan). @param {unknown} ham
 * @returns {{ ondalik: 'oto' | number; onEk: string; sonEk: string; tarih: string; oran: string; hedef: number | null; gosterge: string }}
 */
export function bicimTemizle(ham) {
  const g = nesneMi(ham) ? ham : {};
  const o = g.ondalik === undefined || g.ondalik === null || g.ondalik === '' || g.ondalik === 'oto' ? 'oto' : Number(g.ondalik);
  if (o !== 'oto' && !(Number.isInteger(o) && o >= 0 && o <= 3)) throw new PanoHatasi('Ondalık hane 0–3 olmalıdır.');
  const ek = (/** @type {unknown} */ v, /** @type {string} */ ad, /** @type {number} */ n) => {
    const m = typeof v === 'string' ? v : '';
    if (m.length > n || /[\u0000-\u001f\u007f]/.test(m)) throw new PanoHatasi(`${ad} en çok ${n} karakter olabilir.`);
    return m;
  };
  const sec = (/** @type {unknown} */ v, /** @type {ReadonlyArray<readonly [string, string]>} */ l, /** @type {string} */ v0) => (l.some(([a]) => a === v) ? /** @type {string} */ (v) : v0);
  /** @type {number | null} */
  let hedef = null;
  if (g.hedef !== undefined && g.hedef !== null && String(g.hedef).trim() !== '') {
    hedef = typeof g.hedef === 'number' ? g.hedef : Number(String(g.hedef).replace(',', '.'));
    if (!Number.isFinite(hedef) || hedef <= 0) throw new PanoHatasi('Hedef sıfırdan büyük bir sayı olmalıdır.');
  }
  return {
    ondalik: /** @type {'oto' | number} */ (o), onEk: ek(g.onEk, 'Ön ek', 8), sonEk: ek(g.sonEk, 'Son ek', 12), tarih: sec(g.tarih, TARIH_BICIMLERI, 'yok'),
    oran: sec(g.oran, ORAN_SECENEKLERI, 'oto'), hedef, gosterge: sec(g.gosterge, GOSTERGE_SECENEKLERI, 'cubuk')
  };
}

/** @param {number} n @param {'oto' | number} ondalik @param {number} [otoEnCok] */
function haneler(n, ondalik, otoEnCok = 2) {
  if (ondalik !== 'oto') return { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik };
  return { minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : otoEnCok };
}

/** Sayı (ön / son ekli, tr-TR binlik ayırıcı): 1245 → "1.245", 3,14159 → "3,14". @param {number} n @param {unknown} [bicim] */
export function sayiBicimle(n, bicim) {
  const b = bicimTemizle(bicim);
  return `${b.onEk}${n.toLocaleString('tr-TR', { ...haneler(n, b.ondalik), useGrouping: true })}${b.sonEk}`;
}

/** Ham değerin yüzde karşılığı (oran ayarına göre). @param {number} n @param {unknown} [bicim] */
export function yuzdeDegeri(n, bicim) {
  const o = bicimTemizle(bicim).oran;
  const p = o === 'yuzde' ? n : o === 'oran' ? n * 100 : Math.abs(n) <= 1 ? n * 100 : n;
  return Math.round(p * 1e9) / 1e9;
}

/** Yüzde gösterimi: 0,834 → "%83,4", 83,4 → "%83,4" (otomatik: tam sayıysa 0, değilse en çok 1 hane). @param {number} n @param {unknown} [bicim] */
export function yuzdeBicimle(n, bicim) {
  const b = bicimTemizle(bicim);
  const p = yuzdeDegeri(n, b);
  return `${b.onEk}%${p.toLocaleString('tr-TR', haneler(p, b.ondalik, 1))}${b.sonEk}`;
}

/** Tarih gibi görünen değeri biçimler; tarih değilse ya da biçim 'yok'sa null. @param {unknown} v @param {string} tarih */
export function tarihBicimle(v, tarih) {
  if (tarih === 'yok' || typeof v !== 'string') return null;
  const m = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(m)) return null;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(m) ? new Date(`${m}T00:00:00`) : new Date(m.replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) return null;
  const iki = (/** @type {number} */ x) => String(x).padStart(2, '0');
  const gun = `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()}`;
  return tarih === 'dakika' ? `${gun} ${iki(t.getHours())}:${iki(t.getMinutes())}` : gun;
}

/** Hücre metni: sayı → sayiBicimle; tarih biçimi seçiliyse tarih; diğerleri olduğu gibi. @param {unknown} v @param {unknown} [bicim] */
export function hucreBicimle(v, bicim) {
  if (v === null || v === undefined) return '';
  const b = bicimTemizle(bicim);
  if (typeof v === 'number' && Number.isFinite(v)) return sayiBicimle(v, b);
  return tarihBicimle(v, b.tarih) ?? String(v);
}

/**
 * Önceki yenilemeye göre değişim (önceki yoksa null). @param {number} simdi @param {number | null | undefined} onceki
 * @returns {{ fark: number; yuzde: number | null; yon: 'artis' | 'azalis' | 'ayni' } | null}
 */
export function degisimHesapla(simdi, onceki) {
  if (onceki === null || onceki === undefined || !Number.isFinite(onceki)) return null;
  const fark = Math.round((simdi - onceki) * 1e9) / 1e9;
  return { fark, yuzde: onceki === 0 ? null : (fark / Math.abs(onceki)) * 100, yon: fark > 0 ? 'artis' : fark < 0 ? 'azalis' : 'ayni' };
}

/**
 * Pasta dilimleri: büyükten küçüğe, en çok EN_COK_DILIM dilim; fazlası tek "Diğer" diliminde toplanır. Sıfır / negatif atlanır.
 * @param {ReadonlyArray<{ etiket: string; deger: number }>} noktalar @param {number} [enCok]
 * @returns {Array<{ etiket: string; deger: number; yuzde: number; diger: boolean }>}
 */
export function pastaDilimleri(noktalar, enCok = EN_COK_DILIM) {
  const pozitif = noktalar.filter((n) => Number.isFinite(n.deger) && n.deger > 0).slice().sort((a, b) => b.deger - a.deger);
  const tasar = pozitif.length > enCok;
  const ust = tasar ? pozitif.slice(0, enCok - 1) : pozitif;
  const kalan = tasar ? pozitif.slice(enCok - 1).reduce((t, n) => t + n.deger, 0) : 0;
  const dilimler = [...ust.map((n) => ({ etiket: n.etiket, deger: n.deger, diger: false })), ...(tasar ? [{ etiket: 'Diğer', deger: kalan, diger: true }] : [])];
  const toplam = dilimler.reduce((t, n) => t + n.deger, 0) || 1;
  return dilimler.map((d) => ({ ...d, yuzde: (d.deger / toplam) * 100 }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Tablo görünümü (saf, arayüzle ORTAK): sütun sırası / gizleme kartın "sutunlar" ayarındadır (görünen sütunlar, sırasıyla; boşsa
// sonucun tüm sütunları), genişlikler "sutunGenislikleri"nde. Sıralama yalnız ekrandadır (kaydedilmez, sorgu yeniden çalışmaz).
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Görünen sütunlar (sırasıyla): ayardaki adlar sonuçta varsa o sırayla; ayar boşsa ya da hiçbiri yoksa tümü.
 * @param {ReadonlyArray<string>} ayar @param {ReadonlyArray<string>} sutunlar @returns {string[]}
 */
export function gorunenSutunlar(ayar, sutunlar) {
  const k = (/** @type {string} */ x) => x.toLocaleLowerCase('tr');
  const secili = (ayar ?? []).map((a) => sutunlar.find((s) => k(s) === k(a))).filter((x) => x !== undefined);
  return secili.length ? [...new Set(secili)] : [...sutunlar];
}

/**
 * Görünen sütunlarda bir sütunu sola / sağa ya da hedef sıraya taşır (sınırda değişmez). @param {ReadonlyArray<string>} gorunen
 * @param {string} ad @param {'sol' | 'sag' | number} hedef @returns {string[]}
 */
export function sutunTasi(gorunen, ad, hedef) {
  const i = gorunen.indexOf(ad);
  if (i < 0) return [...gorunen];
  const j = hedef === 'sol' ? i - 1 : hedef === 'sag' ? i + 1 : Math.floor(Number(hedef));
  if (!Number.isFinite(j) || j < 0 || j >= gorunen.length || j === i) return [...gorunen];
  const l = [...gorunen];
  l.splice(i, 1);
  l.splice(j, 0, ad);
  return l;
}

/**
 * Sütunu gizler (en az bir sütun görünür kalır) ya da gösterir (sona eklenir; sonra taşınabilir). @param {ReadonlyArray<string>} gorunen
 * @param {ReadonlyArray<string>} tum sonucun sütunları @param {string} ad @param {boolean} goster @returns {string[]}
 */
export function sutunGorunurlugu(gorunen, tum, ad, goster) {
  if (!goster) return gorunen.length > 1 ? gorunen.filter((x) => x !== ad) : [...gorunen];
  return gorunen.includes(ad) || !tum.includes(ad) ? [...gorunen] : [...gorunen, ad];

}

const TARIH_DESENI = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Sütunun sıralama türü: boş olmayan bütün değerler sayıysa 'sayi', ISO tarihse 'tarih', değilse 'metin' (maskeli değer metindir).
 * @param {ReadonlyArray<ReadonlyArray<unknown>>} satirlar @param {number} i @returns {'sayi' | 'tarih' | 'metin'}
 */
export function sutunTuru(satirlar, i) {
  const d = satirlar.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== '');
  if (!d.length) return 'metin';
  if (d.every((v) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim())))) return 'sayi';
  if (d.every((v) => typeof v === 'string' && TARIH_DESENI.test(v.trim()) && !Number.isNaN(Date.parse(v.trim().replace(' ', 'T'))))) return 'tarih';
  return 'metin';
}

/**
 * Satırları sütuna göre sıralar (yeni dizi; boş değerler hep sonda): sayı sayısal, tarih zamana göre, metin tr-TR. yon: 'artan' |
 * 'azalan' | null (sıralama yok: özgün sıra). @param {ReadonlyArray<ReadonlyArray<unknown>>} satirlar @param {number} i
 * @param {'artan' | 'azalan' | null} yon @returns {unknown[][]}
 */
export function satirlariSirala(satirlar, i, yon) {
  const l = satirlar.map((r) => [...r]);
  if (!yon) return l;
  const tur = sutunTuru(satirlar, i);
  const anahtar = (/** @type {unknown} */ v) => (tur === 'sayi' ? Number(String(v).replace(',', '.')) : tur === 'tarih' ? Date.parse(String(v).trim().replace(' ', 'T')) : String(v));
  const carpan = yon === 'azalan' ? -1 : 1;
  return l.map((r, s) => ({ r, s })).sort((x, y) => {
    const a = x.r[i]; const b = y.r[i];
    const aBos = a === null || a === undefined || a === ''; const bBos = b === null || b === undefined || b === '';
    if (aBos || bBos) return aBos && bBos ? x.s - y.s : aBos ? 1 : -1;
    const ka = anahtar(a); const kb = anahtar(b);
    const f = tur === 'metin' ? String(ka).localeCompare(String(kb), 'tr', { numeric: true, sensitivity: 'base' }) : Number(ka) - Number(kb);
    return f ? f * carpan : x.s - y.s;
  }).map((x) => x.r);
}
