// DOSYA İÇERİĞİ DOĞRULAMA (genel, saf; bağımlılıksız) — ekran akışında indirilen dosya (Playwright download) ve servis
// yanıtının gövdesi (REST / SOAP) aynı kurallarla doğrulanır. Ürün / şirket bilgisi yoktur; beklentiler senaryo / akış
// tanımındadır (kullanıcının kararı).
//
// Biçimler (bicim "otomatik" ise addan, içerik türünden ve ilk baytlardan bulunur):
//   csv   : ayraç (otomatik ya da , ; sekme |), tırnaklı hücreler (RFC 4180), başlık satırı; kodlama UTF-8 / UTF-8-BOM / Windows-1254
//   xlsx  : ZIP + çalışma kitabı XML'i (arsiv.mjs zip okuyucusu); ortak metinler, satır içi metin, sayı, mantıksal.
//           Tarih hücreleri Excel seri sayısı olarak okunur (biçimlenmez). Şifreli XLSX ve eski .xls okunmaz (açık hata).
//   pdf   : sıkıştırılmamış ve FlateDecode içerik akışlarındaki Tj / TJ / ' / " metinleri (sayfa sırasıyla; yazı tipinin ToUnicode
//           eşlemesi varsa o kullanılır). Şifreli PDF ve metni olmayan (taranmış görüntü) PDF → "metin çıkarılamadı" açık hatası.
//   metin : düz metin (kodlama csv ile aynı).
//
// Beklentiler: adDeseni (dosya adı; * ve ? joker) · enAzBoyut (bayt) · icerir / icermez (metin) · sutunVar · satirSayisi (= / ≥;
// başlık hariç, boş satırlar sayılmaz) · hucre (sütun adı + satır koşulu: N. satır ya da "şu sütunu şu olan satır"; koşulsuz ise
// herhangi bir satır). Sütun, başlıktaki adıyla ya da harfiyle (A, B, …) verilir. Karşılaştırmalar büyük / küçük harf ve Türkçe
// karakter toleranslıdır (metniNormallestir; koşucunun beklenen sonuç eşleştirmesiyle AYNI kural).
// Metinlerdeki ${…} başvuruları çağıranın coz() geri çağırmasıyla çözülür (ekran: ${Tablo.Sütun}, ${akis:Ad}, ${alan};
// servis: parametreler, ${Tablo.Sütun}, ${akis:Ad}); çözülemeyen başvuru o beklentiyi "kaldı" yapar.
// Rapor: her beklenti için geçti / başarısız; "Görülen" dosyadan kısa bir kesittir. Bilinen gizli değerler ve adı gizli sayılan
// sütunların (gizli-adlar.mjs) hücreleri maskelenir (•••).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: dosya-icerigi.d.mts.
import { inflateSync, constants as zlibSabitleri } from 'node:zlib';
import { zipGirdileri } from './arsiv.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';

export const DOSYA_BICIMLERI = Object.freeze(['otomatik', 'csv', 'xlsx', 'pdf', 'metin']);
export const KODLAMALAR = Object.freeze(['otomatik', 'utf8', 'utf8bom', 'windows1254']);
export const AYRACLAR = Object.freeze(['otomatik', ',', ';', '\t', '|']);
export const BEKLENTI_TURLERI = Object.freeze(['adDeseni', 'enAzBoyut', 'icerir', 'icermez', 'sutunVar', 'satirSayisi', 'hucre']);
/** Tablo (CSV / XLSX) gerektiren beklentiler. */
export const TABLO_BEKLENTILERI = Object.freeze(['sutunVar', 'satirSayisi', 'hucre']);
export const BEKLENTI_EN_COK = 50;
export const METIN_EN_UZUN = 500;
/** Okunacak en büyük dosya (bayt); daha büyüğü okunmadan açık hatayla kalır. */
export const DOSYA_EN_BUYUK = 50 * 1024 * 1024;
/** Raporda "Görülen" kesitinin en çok uzunluğu. */
export const KESIT_UZUNLUGU = 160;
export const MASKE = '•••';

export class DosyaIcerikHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'DosyaIcerikHatasi';
  }
}

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

// ---------------------------------------------------------------------------------------
// Karşılaştırma
// ---------------------------------------------------------------------------------------

/**
 * Karşılaştırma için metni sadeleştirir: kıvrık / açılı tırnaklar → düz tırnak, tüm boşluklar (satır sonu, NBSP dahil) tek boşluk,
 * baş / son boşluk kırpılır, Türkçe'ye uygun küçük harf (İ→i, I→ı), ardından ı→i. Koşucunun beklenen sonuç eşleştirmesi
 * (tests/support/beklenen-sonuc.ts > mesajiNormallestir) bu işlevi kullanır — kural tek yerdedir.
 * @param {unknown} metin
 */
export function metniNormallestir(metin) {
  return String(metin ?? '')
    .replace(/[“”„«»″]/g, '"')
    .replace(/[‘’‚‹›′`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i');
}

/** @param {unknown} a @param {unknown} b */
const esitMi = (a, b) => metniNormallestir(a) === metniNormallestir(b);

/**
 * Dosya adı deseni: * (herhangi bir dizi) ve ? (tek karakter); tüm ada uygulanır, toleranslı karşılaştırma.
 * @param {string} ad @param {string} desen
 */
export function adDesenineUyar(ad, desen) {
  const kac = (/** @type {string} */ m) => m.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const d = metniNormallestir(desen);
  if (!d) return false;
  const re = new RegExp(`^${d.split('*').map((p) => p.split('?').map(kac).join('.')).join('.*')}$`, 's');
  return re.test(metniNormallestir(ad));
}

// ---------------------------------------------------------------------------------------
// Tanım doğrulama
// ---------------------------------------------------------------------------------------

/** @param {unknown} d @param {number} [n] */
const metin = (d, n = METIN_EN_UZUN) => (typeof d === 'string' ? d.trim().slice(0, n) : '');
/** @param {unknown} d */
const tamSayi = (d) => (typeof d === 'number' ? d : typeof d === 'string' && /^\s*\d+\s*$/.test(d) ? Number(d) : NaN);

/**
 * Dosya doğrulama tanımını tek biçime getirir ve doğrular (bilinmeyen alanlar atılır). tetikleyici (ekran adımının indirmeyi
 * başlatan düğmesi) çağıran tarafından eklenir; burada korunur.
 * @param {unknown} ham
 * @returns {{ tanim: import('./dosya-icerigi.d.mts').DosyaTanimi; hatalar: string[] }}
 */
export function dosyaTanimiDogrula(ham) {
  /** @type {string[]} */
  const hatalar = [];
  const h = nesneMi(ham) ? ham : {};
  if (!nesneMi(ham)) hatalar.push('Dosya doğrulama tanımı okunamadı.');
  const bicim = DOSYA_BICIMLERI.includes(h.bicim) ? h.bicim : 'otomatik';
  if (h.bicim !== undefined && !DOSYA_BICIMLERI.includes(h.bicim)) hatalar.push(`Dosya biçimi şunlardan biri olmalı: ${DOSYA_BICIMLERI.join(', ')}.`);
  /** @type {import('./dosya-icerigi.d.mts').DosyaTanimi} */
  const tanim = { bicim, beklentiler: [] };
  if (h.ayrac !== undefined) {
    if (AYRACLAR.includes(h.ayrac)) tanim.ayrac = h.ayrac;
    else hatalar.push('CSV ayracı otomatik, virgül, noktalı virgül, sekme ya da dikey çizgi olmalı.');
  }
  if (h.kodlama !== undefined) {
    if (KODLAMALAR.includes(h.kodlama)) tanim.kodlama = h.kodlama;
    else hatalar.push('Kodlama otomatik, UTF-8, UTF-8-BOM ya da Windows-1254 olmalı.');
  }
  if (h.baslikSatiri !== undefined) tanim.baslikSatiri = h.baslikSatiri !== false;
  if (h.sayfa !== undefined && h.sayfa !== null && h.sayfa !== '') {
    const s = metin(h.sayfa, 100);
    if (s) tanim.sayfa = s;
  }
  if (h.zamanAsimiSn !== undefined && h.zamanAsimiSn !== null && h.zamanAsimiSn !== '') {
    const n = tamSayi(h.zamanAsimiSn);
    if (Number.isInteger(n) && n >= 1 && n <= 600) tanim.zamanAsimiSn = n;
    else hatalar.push('İndirmeyi bekleme süresi 1–600 saniye arasında tam sayı olmalı.');
  }
  if (nesneMi(h.tetikleyici) && typeof h.tetikleyici.secici === 'string' && h.tetikleyici.secici) {
    tanim.tetikleyici = { secici: h.tetikleyici.secici, ...(typeof h.tetikleyici.aciklama === 'string' && h.tetikleyici.aciklama ? { aciklama: h.tetikleyici.aciklama.slice(0, 120) } : {}) };
  }
  const liste = Array.isArray(h.beklentiler) ? h.beklentiler : [];
  if (!liste.length) hatalar.push('Dosya için en az bir beklenti ekleyin (ör. metin içeriyor).');
  if (liste.length > BEKLENTI_EN_COK) hatalar.push(`Bir dosyada en fazla ${BEKLENTI_EN_COK} beklenti olabilir.`);
  liste.slice(0, BEKLENTI_EN_COK).forEach((b, i) => {
    const yer = `${i + 1}. beklenti`;
    if (!nesneMi(b) || !BEKLENTI_TURLERI.includes(b.tur)) { hatalar.push(`${yer}: türü tanınmadı.`); return; }
    if (TABLO_BEKLENTILERI.includes(b.tur) && (bicim === 'pdf' || bicim === 'metin')) {
      hatalar.push(`${yer}: sütun / satır beklentileri yalnız CSV ve XLSX dosyalarında kullanılır.`);
      return;
    }
    switch (b.tur) {
      case 'adDeseni': case 'icerir': case 'icermez': case 'sutunVar': {
        const d = metin(b.deger);
        if (!d) { hatalar.push(`${yer}: ${b.tur === 'adDeseni' ? 'dosya adı desenini' : b.tur === 'sutunVar' ? 'sütun adını' : 'aranacak metni'} yazın.`); return; }
        tanim.beklentiler.push({ tur: b.tur, deger: d });
        return;
      }
      case 'enAzBoyut': {
        const n = tamSayi(b.deger);
        if (!Number.isInteger(n) || n < 1 || n > DOSYA_EN_BUYUK) { hatalar.push(`${yer}: en az boyut 1 – ${DOSYA_EN_BUYUK} bayt arasında tam sayı olmalı.`); return; }
        tanim.beklentiler.push({ tur: 'enAzBoyut', deger: n });
        return;
      }
      case 'satirSayisi': {
        const n = tamSayi(b.deger);
        if (!Number.isInteger(n) || n < 0 || n > 10_000_000) { hatalar.push(`${yer}: satır sayısı 0 ya da pozitif tam sayı olmalı.`); return; }
        tanim.beklentiler.push({ tur: 'satirSayisi', islem: b.islem === 'enAz' ? 'enAz' : 'esit', deger: n });
        return;
      }
      default: {
        // hucre
        const sutun = metin(b.sutun, 200);
        if (!sutun) { hatalar.push(`${yer}: hücrenin sütununu yazın.`); return; }
        if (typeof b.deger !== 'string') { hatalar.push(`${yer}: hücrede beklenen değeri yazın.`); return; }
        /** @type {import('./dosya-icerigi.d.mts').HucreBeklentisi} */
        const y = { tur: 'hucre', sutun, deger: metin(b.deger) };
        const s = b.satir;
        if (nesneMi(s) && s.tur === 'no') {
          const n = tamSayi(s.no);
          if (!Number.isInteger(n) || n < 1) { hatalar.push(`${yer}: satır numarası 1 ya da büyük olmalı.`); return; }
          y.satir = { tur: 'no', no: n };
        } else if (nesneMi(s) && s.tur === 'kosul') {
          const ks = metin(s.sutun, 200);
          if (!ks) { hatalar.push(`${yer}: satır koşulunun sütununu yazın.`); return; }
          if (typeof s.deger !== 'string' || !s.deger.trim()) { hatalar.push(`${yer}: satır koşulunun değerini yazın.`); return; }
          y.satir = { tur: 'kosul', sutun: ks, deger: metin(s.deger) };
        }
        tanim.beklentiler.push(y);
      }
    }
  });
  return { tanim, hatalar };
}

/** Beklentinin okunur adı (rapor ve arayüz). @param {import('./dosya-icerigi.d.mts').DosyaBeklentisi} b */
export function beklentiAdi(b) {
  switch (b.tur) {
    case 'adDeseni': return `Dosya adı "${b.deger}" desenine uyar`;
    case 'enAzBoyut': return `Boyut en az ${boyutMetni(b.deger)}`;
    case 'icerir': return `Metin içerir: "${b.deger}"`;
    case 'icermez': return `Metin içermez: "${b.deger}"`;
    case 'sutunVar': return `"${b.deger}" sütunu var`;
    case 'satirSayisi': return `Satır sayısı ${b.islem === 'enAz' ? '≥' : '='} ${b.deger}`;
    default: {
      const s = b.satir;
      const yer = !s ? ' (herhangi bir satırda)' : s.tur === 'no' ? ` (${s.no}. satırda)` : ` ("${s.sutun}" = "${s.deger}" olan satırda)`;
      return `"${b.sutun}" = "${b.deger}"${yer}`;
    }
  }
}

/** Tanımdaki tüm metinler (başvuru çözümü ve akış değeri denetimi için). @param {unknown} tanim @returns {string[]} */
export function tanimMetinleri(tanim) {
  if (!nesneMi(tanim) || !Array.isArray(tanim.beklentiler)) return [];
  return tanim.beklentiler.flatMap((/** @type {any} */ b) => (nesneMi(b)
    ? [b.deger, b.sutun, nesneMi(b.satir) ? b.satir.sutun : undefined, nesneMi(b.satir) ? b.satir.deger : undefined].filter((x) => typeof x === 'string')
    : []));
}

/** Metindeki ${…} başvurularının içleri (sırayla, tekrarsız). @param {string} m */
export function basvurular(m) {
  return [...new Set([...String(m).matchAll(/\$\{\s*([^{}]+?)\s*\}/g)].map((x) => x[1]))];
}

/** @param {number} n */
export function boyutMetni(n) {
  if (n < 1024) return `${n} bayt`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// ---------------------------------------------------------------------------------------
// Biçim ve kodlama
// ---------------------------------------------------------------------------------------

/** @param {Buffer} v @param {number[]} imza */
const basliyor = (v, imza) => v.length >= imza.length && imza.every((b, i) => v[i] === b);

/**
 * Dosyanın biçimi. istenen "otomatik" değilse o; değilse: %PDF → pdf; ZIP (PK) → xlsx; eski Office / şifreli OOXML (D0 CF 11 E0) →
 * hata; ad .csv / .tsv ya da içerik türü text/csv → csv; diğerleri metin.
 * @param {{ ad?: string; icerikTuru?: string | null; veri: Buffer }} d @param {string} [istenen]
 * @returns {'csv' | 'xlsx' | 'pdf' | 'metin'}
 */
export function bicimBul(d, istenen = 'otomatik') {
  if (istenen && istenen !== 'otomatik' && DOSYA_BICIMLERI.includes(istenen)) return /** @type {any} */ (istenen);
  const ad = String(d.ad ?? '').toLowerCase();
  const tur = String(d.icerikTuru ?? '').toLowerCase();
  if (basliyor(d.veri, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new DosyaIcerikHatasi('Dosya şifreli (parolalı) ya da eski Excel / Office (.xls, .doc) biçiminde; okunamadı. Parolasız XLSX, CSV, PDF ya da düz metin desteklenir.');
  }
  if (basliyor(d.veri, [0x25, 0x50, 0x44, 0x46]) || /\.pdf$/.test(ad) || tur.includes('application/pdf')) return 'pdf';
  if (basliyor(d.veri, [0x50, 0x4b, 0x03, 0x04]) || /\.xlsx$/.test(ad) || tur.includes('spreadsheetml')) return 'xlsx';
  if (/\.(csv|tsv)$/.test(ad) || /text\/(csv|tab-separated-values)/.test(tur)) return 'csv';
  return 'metin';
}

/** Windows-1254 (Türkçe) 0x80–0xFF → Unicode (tanımsız baytlar U+FFFD). */
const W1254_UST = (() => {
  const ozel = '€�‚ƒ„…†‡ˆ‰Š‹Œ����‘’“”•–—˜™š›œ��Ÿ';
  let s = ozel;
  for (let b = 0xa0; b <= 0xff; b++) s += String.fromCharCode(b);
  const t = s.split('');
  t[0xd0 - 0x80] = 'Ğ'; t[0xdd - 0x80] = 'İ'; t[0xde - 0x80] = 'Ş'; t[0xf0 - 0x80] = 'ğ'; t[0xfd - 0x80] = 'ı'; t[0xfe - 0x80] = 'ş';
  return t;
})();

/** @param {Buffer} v */
function windows1254Coz(v) {
  let s = '';
  for (const b of v) s += b < 0x80 ? String.fromCharCode(b) : W1254_UST[b - 0x80];
  return s;
}

/**
 * Metin kodlaması: otomatik → BOM varsa UTF-8-BOM, geçerli UTF-8 ise UTF-8, değilse Windows-1254.
 * @param {Buffer} v @param {string} [kodlama] @returns {{ metin: string; kodlama: 'utf8' | 'utf8bom' | 'windows1254' }}
 */
export function metinCoz(v, kodlama = 'otomatik') {
  const bom = basliyor(v, [0xef, 0xbb, 0xbf]);
  if (kodlama === 'windows1254') return { metin: windows1254Coz(v), kodlama: 'windows1254' };
  if (kodlama === 'utf8' || kodlama === 'utf8bom') return { metin: new TextDecoder('utf-8').decode(bom ? v.subarray(3) : v), kodlama: bom ? 'utf8bom' : 'utf8' };
  if (bom) return { metin: new TextDecoder('utf-8').decode(v.subarray(3)), kodlama: 'utf8bom' };
  try {
    return { metin: new TextDecoder('utf-8', { fatal: true }).decode(v), kodlama: 'utf8' };
  } catch {
    return { metin: windows1254Coz(v), kodlama: 'windows1254' };
  }
}

// ---------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------

/**
 * Ayraç: ilk dolu satırda (tırnak dışında) en çok geçen aday; hiçbiri yoksa virgül.
 * @param {string} m
 */
export function ayracBul(m) {
  const satir = m.split(/\r\n|\n|\r/).find((x) => x.trim()) ?? '';
  /** @type {Record<string, number>} */
  const say = { ';': 0, ',': 0, '\t': 0, '|': 0 };
  let tirnak = false;
  for (const c of satir) {
    if (c === '"') tirnak = !tirnak;
    else if (!tirnak && c in say) say[c]++;
  }
  const [en, n] = Object.entries(say).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? en : ',';
}

/** CSV → satırlar (tırnaklı hücre, "" kaçışı, hücre içinde satır sonu). @param {string} m @param {string} ayrac @returns {string[][]} */
export function csvAyristir(m, ayrac) {
  /** @type {string[][]} */
  const satirlar = [];
  /** @type {string[]} */
  let satir = [];
  let hucre = '';
  let tirnak = false;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (tirnak) {
      if (c === '"') {
        if (m[i + 1] === '"') { hucre += '"'; i++; } else tirnak = false;
      } else hucre += c;
      continue;
    }
    if (c === '"' && hucre === '') tirnak = true;
    else if (c === ayrac) { satir.push(hucre); hucre = ''; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && m[i + 1] === '\n') i++;
      satir.push(hucre); satirlar.push(satir); satir = []; hucre = '';
    } else hucre += c;
  }
  if (hucre !== '' || satir.length) { satir.push(hucre); satirlar.push(satir); }
  return satirlar;
}

// ---------------------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------------------

/** XML varlıklarını çözer. @param {string} s */
function xmlCoz(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_m, v) => {
    const k = String(v).toLowerCase();
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'amp') return '&';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const n = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}

/** Öğedeki tüm <t> metinleri (fonetik <rPh> hariç). @param {string} xml */
const tMetinleri = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => xmlCoz(m[1] ?? '')).join('');

/** @param {string} attr @param {string} ad */
const oznitelik = (attr, ad) => {
  const m = new RegExp(`(?:^|\\s)${ad}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attr);
  return m ? xmlCoz(m[2] ?? m[3] ?? '') : null;
};

/** "AB12" → 27 (0 tabanlı sütun); harf yoksa -1. @param {string} ref */
export function sutunIndeksi(ref) {
  const m = /^([A-Z]{1,3})/i.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const c of m[1].toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** 0 → "A", 27 → "AB". @param {number} i */
export function sutunHarfi(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * XLSX'in bir sayfası → satırlar (hücre metinleri). sayfa verilmezse ilk sayfa.
 * @param {Buffer} v @param {string} [sayfa] @returns {{ sayfa: string; satirlar: string[][] }}
 */
export function xlsxOku(v, sayfa) {
  /** @type {import('./arsiv.d.mts').ZipGirdisi[]} */
  let girdiler;
  try { girdiler = zipGirdileri(v); } catch (e) { throw new DosyaIcerikHatasi(`XLSX okunamadı: ${/** @type {Error} */ (e).message}`); }
  const bul = (/** @type {string} */ ad) => girdiler.find((g) => g.tur === 'dosya' && g.ad.replace(/^\/+/, '').toLowerCase() === ad.toLowerCase());
  const oku = (/** @type {string} */ ad) => {
    const g = bul(ad);
    if (!g) return null;
    try { return g.veri().toString('utf8'); } catch (e) { throw new DosyaIcerikHatasi(`XLSX okunamadı: ${/** @type {Error} */ (e).message}`); }
  };
  const kitap = oku('xl/workbook.xml');
  if (kitap === null) throw new DosyaIcerikHatasi('XLSX okunamadı: çalışma kitabı (xl/workbook.xml) yok; dosya bir Excel çalışma kitabı değil.');
  const sayfalar = [...kitap.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)].map((m) => ({ ad: oznitelik(m[1], 'name') ?? '', rid: oznitelik(m[1], 'r:id') ?? oznitelik(m[1], 'id') }));
  if (!sayfalar.length) throw new DosyaIcerikHatasi('XLSX okunamadı: çalışma kitabında sayfa yok.');
  const secilen = sayfa ? sayfalar.find((s) => esitMi(s.ad, sayfa)) : sayfalar[0];
  if (!secilen) throw new DosyaIcerikHatasi(`XLSX'te "${sayfa}" adında sayfa yok (sayfalar: ${sayfalar.map((s) => s.ad).join(', ')}).`);
  const iliskiler = oku('xl/_rels/workbook.xml.rels') ?? '';
  const iliski = [...iliskiler.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => ({ id: oznitelik(m[1], 'Id'), hedef: oznitelik(m[1], 'Target') ?? '' }))
    .find((r) => r.id === secilen.rid);
  const hedef = iliski ? (iliski.hedef.startsWith('/') ? iliski.hedef.slice(1) : `xl/${iliski.hedef.replace(/^\.\//, '')}`) : `xl/worksheets/sheet${sayfalar.indexOf(secilen) + 1}.xml`;
  const xml = oku(hedef);
  if (xml === null) throw new DosyaIcerikHatasi(`XLSX okunamadı: "${secilen.ad}" sayfasının içeriği yok.`);
  const ortak = [...(oku('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => tMetinleri(m[1] ?? ''));
  /** @type {string[][]} */
  const satirlar = [];
  for (const r of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    /** @type {string[]} */
    const satir = [];
    let sira = 0;
    for (const c of (r[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = oznitelik(c[1], 'r');
      const i = ref ? sutunIndeksi(ref) : sira;
      sira = (i >= 0 ? i : sira) + 1;
      const t = oznitelik(c[1], 't');
      const ic = c[2] ?? '';
      const vm = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(ic);
      const v = vm ? xmlCoz(vm[1]) : '';
      let deger;
      if (t === 's') deger = ortak[Number(v)] ?? '';
      else if (t === 'inlineStr') deger = tMetinleri(ic);
      else if (t === 'b') deger = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : v;
      else deger = v;
      while (satir.length < (i >= 0 ? i : sira - 1)) satir.push('');
      satir[i >= 0 ? i : sira - 1] = deger;
    }
    satirlar.push(satir);
  }
  return { sayfa: secilen.ad, satirlar };
}

// ---------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------

/** @typedef {{ sozluk: string; akis: Buffer | null }} PdfNesnesi */

/** Konumdaki "<< … >>" sözlüğü (iç içe); yoksa null. @param {string} s @param {number} bas */
function sozlukAl(s, bas) {
  const i = s.indexOf('<<', bas);
  if (i < 0) return null;
  let derinlik = 0;
  for (let j = i; j < s.length - 1; j++) {
    if (s[j] === '<' && s[j + 1] === '<') { derinlik++; j++; } else if (s[j] === '>' && s[j + 1] === '>') {
      derinlik--; j++;
      if (derinlik === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

/** Sözlükteki bir anahtarın değerinin başı (ör. "/Contents 5 0 R" → " 5 0 R …"). @param {string} sozluk @param {string} ad */
function anahtarDegeri(sozluk, ad) {
  const m = new RegExp(`/${ad}(?![A-Za-z0-9])`).exec(sozluk);
  return m ? sozluk.slice(m.index + m[0].length) : null;
}

/** "N 0 R" başvuruları (değerin başından, dizi ise dizinin içinden). @param {string | null} deger @returns {number[]} */
function basvuruListesi(deger) {
  if (deger === null) return [];
  const d = deger.trimStart();
  if (d.startsWith('[')) return [...d.slice(1, d.indexOf(']')).matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
  const m = /^(\d+)\s+\d+\s+R/.exec(d);
  return m ? [Number(m[1])] : [];
}

/** Akışı filtresine göre açar (Flate ya da filtresiz); başka filtre / bozuk akış → null. @param {PdfNesnesi} n */
function akisAc(n) {
  if (!n.akis) return null;
  const filtre = anahtarDegeri(n.sozluk, 'Filter');
  const adlar = filtre === null ? [] : [...(filtre.trimStart().startsWith('[') ? filtre.slice(0, filtre.indexOf(']')) : (/^\s*\/\w+/.exec(filtre)?.[0] ?? '')).matchAll(/\/(\w+)/g)].map((m) => m[1]);
  let v = n.akis;
  for (const f of adlar) {
    if (f !== 'FlateDecode' && f !== 'Fl') return null;
    try { v = inflateSync(v); } catch {
      try { v = inflateSync(v, { finishFlush: zlibSabitleri.Z_SYNC_FLUSH }); } catch { return null; }
    }
  }
  return v;
}

/** PDF nesneleri (düz ve nesne akışlarındaki). @param {Buffer} veri @returns {Map<number, PdfNesnesi>} */
function pdfNesneleri(veri) {
  const s = veri.toString('latin1');
  /** @type {Map<number, PdfNesnesi>} */
  const nesneler = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const bas = m.index + m[0].length;
    const son = s.indexOf('endobj', bas);
    const akisRe = /\bstream(\r\n|\n|\r)/g;
    akisRe.lastIndex = bas;
    const a = akisRe.exec(s);
    if (a && (son < 0 || a.index < son)) {
      const sozluk = s.slice(bas, a.index);
      const veriBas = a.index + a[0].length;
      const uz = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(sozluk);
      let veriSon = uz ? veriBas + Number(uz[1]) : -1;
      if (veriSon < 0 || !/^\s*endstream/.test(s.slice(veriSon, veriSon + 20))) {
        veriSon = s.indexOf('endstream', veriBas);
        if (veriSon < 0) break;
        while (veriSon > veriBas && (s[veriSon - 1] === '\n' || s[veriSon - 1] === '\r')) veriSon--;
      }
      nesneler.set(Number(m[1]), { sozluk, akis: veri.subarray(veriBas, veriSon) });
      re.lastIndex = Math.max(veriSon, re.lastIndex);
    } else {
      nesneler.set(Number(m[1]), { sozluk: s.slice(bas, son < 0 ? s.length : son), akis: null });
      if (son >= 0) re.lastIndex = son;
    }
  }
  // Nesne akışları (PDF 1.5+): yazı tipi ve sayfa sözlükleri çoğu zaman buradadır.
  for (const n of [...nesneler.values()]) {
    if (!/\/Type\s*\/ObjStm\b/.test(n.sozluk)) continue;
    const ac = akisAc(n);
    const ilk = Number(/\/First\s+(\d+)/.exec(n.sozluk)?.[1]);
    const adet = Number(/\/N\s+(\d+)/.exec(n.sozluk)?.[1]);
    if (!ac || !Number.isInteger(ilk) || !Number.isInteger(adet)) continue;
    const t = ac.toString('latin1');
    const sayilar = t.slice(0, ilk).trim().split(/\s+/).map(Number);
    for (let i = 0; i < adet && 2 * i + 1 < sayilar.length; i++) {
      const no = sayilar[2 * i];
      const bas = ilk + sayilar[2 * i + 1];
      const son = 2 * i + 3 < sayilar.length ? ilk + sayilar[2 * i + 3] : t.length;
      if (!nesneler.has(no)) nesneler.set(no, { sozluk: t.slice(bas, son), akis: null });
    }
  }
  return nesneler;
}

/** ToUnicode CMap → { genislik, harita }. @param {string} cmap */
function cmapAyristir(cmap) {
  /** @type {Map<number, string>} */
  const harita = new Map();
  const utf16 = (/** @type {string} */ hex) => {
    const b = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex');
    let s = '';
    for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i));
    return s;
  };
  const alan = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(cmap);
  const genislik = alan ? Math.max(1, Math.round(alan[1].length / 2)) : 2;
  for (const blok of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const x of blok[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) harita.set(parseInt(x[1], 16), utf16(x[2]));
  }
  for (const blok of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const x of blok[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g)) {
      const alt = parseInt(x[1], 16);
      const ust = Math.min(parseInt(x[2], 16), alt + 65535);
      if (x[4] !== undefined) {
        const temel = x[4];
        const bas = parseInt(temel.slice(-4) || '0', 16);
        for (let k = alt; k <= ust; k++) harita.set(k, utf16(temel.slice(0, -4) + (bas + k - alt).toString(16).padStart(4, '0')));
      } else {
        [...(x[5] ?? '').matchAll(/<([0-9a-fA-F]*)>/g)].forEach((d, i) => { if (alt + i <= ust) harita.set(alt + i, utf16(d[1])); });
      }
    }
  }
  return { genislik, harita };
}

/** PDFDocEncoding / WinAnsi yaklaşımı (0x80–0x9F Windows-1252 özel karakterleri). @param {Buffer} b */
function pdfBaytMetni(b) {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i));
    return s;
  }
  let s = '';
  for (const x of b) s += x >= 0x80 && x <= 0x9f ? W1254_UST[x - 0x80].replace('�', '') : String.fromCharCode(x);
  return s;
}

/**
 * İçerik akışındaki metin işleçleri → metin. Satır: T*, ', ", Td / TD (dikey), Tm, ET; TJ'de büyük boşluk → boşluk.
 * @param {string} icerik latin1 @param {(ad: string) => { genislik: number; harita: Map<number, string> } | null} cmapBul
 */
function icerikMetni(icerik, cmapBul) {
  let cikti = '';
  /** @type {Array<{ tur: string; deger: any }>} */
  let yigin = [];
  let yazi = null;
  const coz = (/** @type {Buffer} */ b) => {
    const c = yazi ? cmapBul(yazi) : null;
    if (!c) return pdfBaytMetni(b);
    let s = '';
    for (let i = 0; i + c.genislik <= b.length; i += c.genislik) {
      const kod = c.genislik === 1 ? b[i] : b.readUIntBE(i, Math.min(c.genislik, 4));
      s += c.harita.get(kod) ?? '';
    }
    return s;
  };
  const satirSonu = () => { if (cikti && !cikti.endsWith('\n')) cikti += '\n'; };
  const n = icerik.length;
  let i = 0;
  const bosluk = (/** @type {string} */ c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';
  const ayirici = (/** @type {string} */ c) => bosluk(c) || '()<>[]{}/%'.includes(c);
  const literal = () => {
    /** @type {number[]} */
    const b = [];
    let d = 1;
    i++;
    while (i < n && d > 0) {
      const c = icerik[i];
      if (c === '\\') {
        const x = icerik[i + 1];
        const kacis = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
        if (x in kacis) { b.push(/** @type {any} */ (kacis)[x]); i += 2; continue; }
        if (x === '\r' || x === '\n') { i += x === '\r' && icerik[i + 2] === '\n' ? 3 : 2; continue; }
        const o = /^[0-7]{1,3}/.exec(icerik.slice(i + 1, i + 4));
        if (o) { b.push(parseInt(o[0], 8) & 0xff); i += 1 + o[0].length; continue; }
        i++;
        continue;
      }
      if (c === '(') d++;
      else if (c === ')') { d--; if (d === 0) { i++; break; } }
      b.push(c.charCodeAt(0) & 0xff);
      i++;
    }
    return Buffer.from(b);
  };
  const hex = () => {
    const son = icerik.indexOf('>', i);
    const h = icerik.slice(i + 1, son < 0 ? n : son).replace(/[^0-9a-fA-F]/g, '');
    i = son < 0 ? n : son + 1;
    return Buffer.from(h.length % 2 ? `${h}0` : h, 'hex');
  };
  /** @returns {any} */
  const oge = () => {
    const c = icerik[i];
    if (c === '(') return { tur: 'metin', deger: literal() };
    if (c === '<' && icerik[i + 1] !== '<') return { tur: 'metin', deger: hex() };
    if (c === '/') {
      let j = i + 1;
      while (j < n && !ayirici(icerik[j])) j++;
      const ad = icerik.slice(i + 1, j);
      i = j;
      return { tur: 'ad', deger: ad };
    }
    if (c === '[') {
      i++;
      const liste = [];
      while (i < n) {
        while (i < n && bosluk(icerik[i])) i++;
        if (icerik[i] === ']') { i++; break; }
        const x = oge();
        if (x) liste.push(x);
      }
      return { tur: 'dizi', deger: liste };
    }
    if (c === '<' && icerik[i + 1] === '<') {
      const s = sozlukAl(icerik, i);
      i += s ? s.length : 2;
      return { tur: 'sozluk', deger: null };
    }
    if (c === '%') { while (i < n && icerik[i] !== '\n' && icerik[i] !== '\r') i++; return null; }
    if (c === ']' || c === '>' || c === '{' || c === '}' || c === ')') { i++; return null; }
    let j = i;
    while (j < n && !ayirici(icerik[j])) j++;
    if (j === i) j++;
    const k = icerik.slice(i, j);
    i = j;
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(k) ? { tur: 'sayi', deger: Number(k) } : { tur: 'islec', deger: k };
  };
  while (i < n) {
    while (i < n && bosluk(icerik[i])) i++;
    if (i >= n) break;
    const x = oge();
    if (!x) continue;
    if (x.tur !== 'islec') { yigin.push(x); continue; }
    const op = x.deger;
    if (op === 'BI') {
      // Satır içi görüntü: ikili veri EI'ye kadar atlanır.
      const son = icerik.indexOf('EI', icerik.indexOf('ID', i));
      i = son < 0 ? n : son + 2;
    } else if (op === 'Tf') {
      const ad = yigin.find((y) => y.tur === 'ad');
      yazi = ad ? ad.deger : null;
    } else if (op === 'Tj') {
      const m = yigin.findLast((y) => y.tur === 'metin');
      if (m) cikti += coz(m.deger);
    } else if (op === "'" || op === '"') {
      satirSonu();
      const m = yigin.findLast((y) => y.tur === 'metin');
      if (m) cikti += coz(m.deger);
    } else if (op === 'TJ') {
      const d = yigin.findLast((y) => y.tur === 'dizi');
      for (const y of d ? d.deger : []) {
        if (y.tur === 'metin') cikti += coz(y.deger);
        else if (y.tur === 'sayi' && y.deger < -250 && !cikti.endsWith(' ')) cikti += ' ';
      }
    } else if (op === 'T*' || op === 'ET') satirSonu();
    else if (op === 'Td' || op === 'TD') {
      const sayilar = yigin.filter((y) => y.tur === 'sayi');
      const ty = sayilar.length >= 2 ? sayilar[sayilar.length - 1].deger : 0;
      if (ty !== 0) satirSonu(); else if (cikti && !/\s$/.test(cikti)) cikti += ' ';
    } else if (op === 'Tm') satirSonu();
    yigin = [];
  }
  return cikti;
}

/**
 * PDF'in metni (sayfa sırasıyla). Şifreli PDF ya da metin çıkmazsa (taranmış görüntü) DosyaIcerikHatasi.
 * @param {Buffer} veri
 */
export function pdfMetni(veri) {
  if (!basliyor(veri, [0x25, 0x50, 0x44, 0x46])) throw new DosyaIcerikHatasi('Dosya bir PDF değil (%PDF imzası yok); metin çıkarılamadı.');
  const nesneler = pdfNesneleri(veri);
  const hamMetin = veri.toString('latin1');
  if (/\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(hamMetin)) throw new DosyaIcerikHatasi('PDF şifreli (parola korumalı); metin çıkarılamadı.');
  // Yazı tipi adı (sayfa kaynaklarındaki /F1 …) → ToUnicode CMap (tüm kaynak sözlüklerinden; aynı ad farklı sayfada farklı
  // yazı tipiyse ilk bulunan kullanılır).
  /** @type {Map<string, number>} */
  const yaziTipleri = new Map();
  for (const n of nesneler.values()) {
    const d = anahtarDegeri(n.sozluk, 'Font');
    if (d === null) continue;
    const ic = d.trimStart();
    const sozluk = ic.startsWith('<<') ? sozlukAl(ic, 0) : (() => { const r = basvuruListesi(d)[0]; return r !== undefined ? nesneler.get(r)?.sozluk ?? null : null; })();
    for (const m of (sozluk ?? '').matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) if (!yaziTipleri.has(m[1])) yaziTipleri.set(m[1], Number(m[2]));
  }
  /** @type {Map<string, { genislik: number; harita: Map<number, string> } | null>} */
  const cmaplar = new Map();
  const cmapBul = (/** @type {string} */ ad) => {
    if (cmaplar.has(ad)) return cmaplar.get(ad) ?? null;
    let c = null;
    const f = yaziTipleri.get(ad);
    const yt = f !== undefined ? nesneler.get(f) : undefined;
    const r = yt ? basvuruListesi(anahtarDegeri(yt.sozluk, 'ToUnicode'))[0] : undefined;
    const akis = r !== undefined ? nesneler.get(r) : undefined;
    const ac = akis ? akisAc(akis) : null;
    if (ac) c = cmapAyristir(ac.toString('latin1'));
    cmaplar.set(ad, c);
    return c;
  };
  // Sayfa sırası: /Pages ağacının kökünden (ebeveyni olmayan) çocuklara; bulunamazsa nesne sırası.
  /** @type {number[]} */
  const sayfalar = [];
  const koklar = [...nesneler.entries()].filter(([, n]) => /\/Type\s*\/Pages\b/.test(n.sozluk) && !/\/Parent\s+\d+/.test(n.sozluk)).map(([no]) => no);
  const gezilen = new Set();
  const gez = (/** @type {number} */ no, /** @type {number} */ derinlik) => {
    if (gezilen.has(no) || derinlik > 50) return;
    gezilen.add(no);
    const n = nesneler.get(no);
    if (!n) return;
    if (/\/Type\s*\/Page\b(?!s)/.test(n.sozluk)) { sayfalar.push(no); return; }
    for (const k of basvuruListesi(anahtarDegeri(n.sozluk, 'Kids'))) gez(k, derinlik + 1);
  };
  for (const k of koklar) gez(k, 0);
  if (!sayfalar.length) for (const [no, n] of nesneler) if (/\/Type\s*\/Page\b(?!s)/.test(n.sozluk)) sayfalar.push(no);
  /** @type {number[]} */
  const icerikler = sayfalar.flatMap((p) => basvuruListesi(anahtarDegeri(/** @type {PdfNesnesi} */ (nesneler.get(p)).sozluk, 'Contents')));
  // Form XObject'ler (tekrarlanan başlık / altlık metinleri) sayfalardan sonra.
  for (const [no, n] of nesneler) if (n.akis && /\/Subtype\s*\/Form\b/.test(n.sozluk) && !icerikler.includes(no)) icerikler.push(no);
  // Sayfa bulunamadıysa metin işleci içeren tüm akışlar.
  if (!sayfalar.length) for (const [no, n] of nesneler) if (n.akis && !icerikler.includes(no)) icerikler.push(no);
  let metinler = '';
  for (const no of icerikler) {
    const n = nesneler.get(no);
    if (!n || /\/(Subtype\s*\/Image|Type\s*\/(XRef|ObjStm|Metadata))\b/.test(n.sozluk)) continue;
    const ac = akisAc(n);
    if (!ac) continue;
    const t = ac.toString('latin1');
    if (!/\bBT\b/.test(t) || /begincmap/.test(t)) continue;
    metinler += `${icerikMetni(t, cmapBul)}\n`;
  }
  const temiz = metinler.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
  if (!temiz) throw new DosyaIcerikHatasi('PDF\'ten metin çıkarılamadı: sayfalarda okunabilir metin yok (taranmış görüntü ya da desteklenmeyen sıkıştırma olabilir).');
  return temiz;
}

// ---------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------

/**
 * Dosyanın içeriği: metin (tümü) ve CSV / XLSX'te tablo (başlık + satırlar). Okunamazsa DosyaIcerikHatasi.
 * @param {Buffer} veri @param {'csv' | 'xlsx' | 'pdf' | 'metin'} bicim
 * @param {{ ayrac?: string; kodlama?: string; baslikSatiri?: boolean; sayfa?: string }} [a]
 * @returns {import('./dosya-icerigi.d.mts').DosyaIcerigi}
 */
export function dosyaIceriginiOku(veri, bicim, a = {}) {
  if (veri.length > DOSYA_EN_BUYUK) throw new DosyaIcerikHatasi(`Dosya çok büyük (${boyutMetni(veri.length)}); en çok ${boyutMetni(DOSYA_EN_BUYUK)} okunur.`);
  if (bicim === 'pdf') return { metin: pdfMetni(veri), tablo: null, bilgi: {} };
  if (bicim === 'metin') {
    const c = metinCoz(veri, a.kodlama);
    return { metin: c.metin, tablo: null, bilgi: { kodlama: c.kodlama } };
  }
  const baslikli = a.baslikSatiri !== false;
  /** @type {string[][]} */
  let satirlar;
  /** @type {Record<string, string>} */
  const bilgi = {};
  /** CSV'nin ham metni (ayraçlarıyla; aramada hücre metniyle birlikte kullanılır). */
  let ham = '';
  if (bicim === 'xlsx') {
    const x = xlsxOku(veri, a.sayfa);
    satirlar = x.satirlar;
    bilgi.sayfa = x.sayfa;
  } else {
    const c = metinCoz(veri, a.kodlama);
    const ayrac = !a.ayrac || a.ayrac === 'otomatik' ? ayracBul(c.metin) : a.ayrac;
    satirlar = csvAyristir(c.metin, ayrac);
    ham = c.metin;
    bilgi.kodlama = c.kodlama;
    bilgi.ayrac = ayrac === '\t' ? 'sekme' : ayrac;
  }
  const dolu = (/** @type {string[]} */ r) => r.some((h) => String(h ?? '').trim() !== '');
  const ilk = satirlar.findIndex(dolu);
  const baslik = baslikli && ilk >= 0 ? satirlar[ilk].map((h) => String(h ?? '').trim()) : [];
  const veriSatirlari = (baslikli && ilk >= 0 ? satirlar.slice(ilk + 1) : satirlar).filter(dolu);
  const hucreler = satirlar.filter(dolu).map((r) => r.join(' ')).join('\n');
  return {
    metin: ham || hucreler,
    ...(ham ? { hucreMetni: hucreler } : {}),
    tablo: { baslik, satirlar: veriSatirlari },
    bilgi
  };
}

// ---------------------------------------------------------------------------------------
// Değerlendirme
// ---------------------------------------------------------------------------------------

/** @param {string} m @param {ReadonlyArray<string>} gizliler */
export function maskele(m, gizliler) {
  let s = String(m ?? '');
  for (const g of [...new Set(gizliler.map((x) => String(x ?? '')))].filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) s = s.split(g).join(MASKE);
  return s;
}

/** Tek satıra indirilmiş kısa kesit. @param {string} m @param {number} [bas] */
function kesit(m, bas = 0) {
  const d = m.replace(/\s+/g, ' ').trim();
  const b = Math.max(0, bas);
  const parca = d.slice(b, b + KESIT_UZUNLUGU);
  return `${b > 0 ? '…' : ''}${parca}${d.length > b + KESIT_UZUNLUGU ? '…' : ''}`;
}

/**
 * Sütunun indeksi: başlıktaki adıyla (toleranslı) ya da harfiyle (A, B, …); yoksa -1.
 * @param {string[]} baslik @param {string} sutun
 */
function sutunBul(baslik, sutun) {
  const i = baslik.findIndex((h) => esitMi(h, sutun));
  if (i >= 0) return i;
  return /^[A-Za-z]{1,3}$/.test(sutun.trim()) ? sutunIndeksi(sutun.trim()) : -1;
}

/**
 * Dosyayı okur ve beklentileri değerlendirir. İçerik yalnız bir beklenti gerektirirse okunur; okunamazsa içerik beklentileri
 * okuma hatasıyla kalır, ad / boyut beklentileri yine değerlendirilir.
 * @param {{ ad: string; icerikTuru?: string | null; veri: Buffer }} dosya
 * @param {import('./dosya-icerigi.d.mts').DosyaTanimi} tanim
 * @param {{ coz?: (ifade: string) => string | undefined; gizliler?: ReadonlyArray<string>; ekGizliAdlar?: ReadonlyArray<string> }} [s]
 * @returns {import('./dosya-icerigi.d.mts').DosyaKontrolSonucu}
 */
export function dosyayiDogrula(dosya, tanim, s = {}) {
  const gizliler = [...(s.gizliler ?? [])].map(String);
  /** @type {string | null} */
  let bicim = null;
  /** @type {string | null} */
  let okumaHatasi = null;
  /** @type {import('./dosya-icerigi.d.mts').DosyaIcerigi | null} */
  let icerik = null;
  const icerikGerekli = tanim.beklentiler.some((b) => b.tur !== 'adDeseni' && b.tur !== 'enAzBoyut');
  try {
    bicim = bicimBul(dosya, tanim.bicim);
    if (icerikGerekli) icerik = dosyaIceriginiOku(dosya.veri, /** @type {any} */ (bicim), tanim);
  } catch (e) {
    if (!(e instanceof DosyaIcerikHatasi)) throw e;
    okumaHatasi = e.message;
  }
  // Adı gizli sayılan sütunların hücreleri maskelenir.
  if (icerik?.tablo) {
    const t = icerik.tablo;
    t.baslik.forEach((h, i) => {
      if (h && gizliAdMi(h, s.ekGizliAdlar ?? [])) for (const r of t.satirlar) if (r[i]) gizliler.push(String(r[i]));
    });
  }
  const m = (/** @type {string} */ x) => maskele(x, gizliler);
  /** ${…} başvurularını çözer; çözülemeyen varsa null + adı. @param {string} x */
  const cozumle = (x) => {
    /** @type {string | null} */
    let eksik = null;
    const sonuc = x.replace(/\$\{\s*([^{}]+?)\s*\}/g, (tam, ic) => {
      const v = s.coz ? s.coz(ic) : undefined;
      if (v === undefined) { eksik ??= ic; return tam; }
      return v;
    });
    return eksik === null ? { deger: sonuc, eksik: null } : { deger: sonuc, eksik };
  };
  /** @type {import('./dosya-icerigi.d.mts').BeklentiSonucu[]} */
  const sonuclar = [];
  const ekle = (/** @type {import('./dosya-icerigi.d.mts').DosyaBeklentisi} */ b, /** @type {boolean} */ gecti, /** @type {string} */ beklenen, /** @type {string} */ gorulen) => {
    sonuclar.push({ tur: b.tur, ad: m(beklentiAdi(b)), gecti, beklenen: m(beklenen), gorulen: m(gorulen) });
  };
  for (const b of tanim.beklentiler) {
    // Başvuruların çözümü (beklentideki tüm metinler).
    const alanlar = /** @type {Record<string, any>} */ ({ ...b, ...(b.tur === 'hucre' && b.satir ? { satir: { ...b.satir } } : {}) });
    /** @type {string | null} */
    let eksik = null;
    for (const k of ['deger', 'sutun']) {
      if (typeof alanlar[k] !== 'string') continue;
      const c = cozumle(alanlar[k]);
      alanlar[k] = c.deger;
      eksik ??= c.eksik;
    }
    if (nesneMi(alanlar.satir)) {
      for (const k of ['sutun', 'deger']) {
        if (typeof alanlar.satir[k] !== 'string') continue;
        const c = cozumle(alanlar.satir[k]);
        alanlar.satir[k] = c.deger;
        eksik ??= c.eksik;
      }
    }
    const y = /** @type {import('./dosya-icerigi.d.mts').DosyaBeklentisi} */ (alanlar);
    if (eksik !== null) { ekle(b, false, beklentiAdi(y), `"\${${eksik}}" başvurusu çözülemedi (değer bu koşuda yok)`); continue; }
    if (y.tur === 'adDeseni') { ekle(y, adDesenineUyar(dosya.ad, y.deger), `ad: ${y.deger}`, `ad: ${dosya.ad}`); continue; }
    if (y.tur === 'enAzBoyut') { ekle(y, dosya.veri.length >= y.deger, `en az ${boyutMetni(y.deger)}`, boyutMetni(dosya.veri.length)); continue; }
    if (okumaHatasi !== null || !icerik) { ekle(y, false, beklentiAdi(y), okumaHatasi ?? 'dosya okunamadı'); continue; }
    if (y.tur === 'icerir' || y.tur === 'icermez') {
      // CSV'de ham metin (ayraçlarıyla) ya da hücreler (boşlukla) aranır.
      const adaylar = [icerik.metin, ...(icerik.hucreMetni ? [icerik.hucreMetni] : [])].map((x) => x.replace(/\s+/g, ' ').trim());
      const aranan = metniNormallestir(y.deger);
      const duz = adaylar.find((x) => aranan !== '' && metniNormallestir(x).includes(aranan)) ?? adaylar[0];
      const yer = metniNormallestir(duz).indexOf(aranan);
      const var_ = aranan !== '' && yer >= 0;
      if (y.tur === 'icerir') ekle(y, var_, `içerir: "${y.deger}"`, var_ ? `bulundu: ${kesit(duz, yer - 40)}` : `bulunamadı; dosyanın başı: ${kesit(duz)}`);
      else ekle(y, !var_, `içermez: "${y.deger}"`, var_ ? `geçiyor: ${kesit(duz, yer - 40)}` : 'geçmiyor');
      continue;
    }
    const t = icerik.tablo;
    if (!t) { ekle(y, false, beklentiAdi(y), `dosya bir tablo değil (${bicim === 'pdf' ? 'PDF' : 'düz metin'}); sütun / satır beklentileri CSV ve XLSX'te kullanılır`); continue; }
    const baslikMetni = t.baslik.length ? t.baslik.join(', ') : '(başlık satırı yok)';
    if (y.tur === 'sutunVar') {
      const i = t.baslik.findIndex((h) => esitMi(h, y.deger));
      ekle(y, i >= 0, `"${y.deger}" sütunu`, `sütunlar: ${kesit(baslikMetni)}`);
      continue;
    }
    if (y.tur === 'satirSayisi') {
      const n = t.satirlar.length;
      ekle(y, y.islem === 'enAz' ? n >= y.deger : n === y.deger, `${y.islem === 'enAz' ? 'en az ' : ''}${y.deger} satır`, `${n} satır${t.baslik.length ? ' (başlık hariç)' : ''}`);
      continue;
    }
    // hucre
    const si = sutunBul(t.baslik, y.sutun);
    if (si < 0) { ekle(y, false, beklentiAdi(y), `"${y.sutun}" sütunu yok; sütunlar: ${kesit(baslikMetni)}`); continue; }
    /** @type {string[][]} */
    let adaylar;
    if (y.satir?.tur === 'no') {
      const r = t.satirlar[y.satir.no - 1];
      if (!r) { ekle(y, false, beklentiAdi(y), `dosyada ${t.satirlar.length} satır var; ${y.satir.no}. satır yok`); continue; }
      adaylar = [r];
    } else if (y.satir?.tur === 'kosul') {
      const kosul = y.satir;
      const ki = sutunBul(t.baslik, kosul.sutun);
      if (ki < 0) { ekle(y, false, beklentiAdi(y), `satır koşulundaki "${kosul.sutun}" sütunu yok; sütunlar: ${kesit(baslikMetni)}`); continue; }
      adaylar = t.satirlar.filter((r) => esitMi(r[ki] ?? '', kosul.deger));
      if (!adaylar.length) { ekle(y, false, beklentiAdi(y), `"${kosul.sutun}" = "${kosul.deger}" olan satır yok`); continue; }
    } else adaylar = t.satirlar;
    const gecti = adaylar.some((r) => esitMi(r[si] ?? '', y.deger));
    const gorulenler = [...new Set(adaylar.map((r) => String(r[si] ?? '').trim()))];
    const liste = gorulenler.slice(0, 5).map((d) => `"${d}"`).join(', ') + (gorulenler.length > 5 ? ` (+${gorulenler.length - 5})` : '');
    ekle(y, gecti, `"${y.sutun}" = "${y.deger}"`, gecti ? `"${y.deger}"` : `"${y.sutun}": ${liste || '(boş)'}`);
  }
  return {
    gecti: sonuclar.every((x) => x.gecti),
    dosya: { ad: m(dosya.ad), boyut: dosya.veri.length, bicim: bicim ?? 'bilinmiyor', ...(icerik ? icerik.bilgi : {}), ...(icerik?.tablo ? { satirSayisi: icerik.tablo.satirlar.length, sutunlar: icerik.tablo.baslik.slice(0, 50) } : {}) },
    beklentiler: sonuclar,
    ...(okumaHatasi ? { okumaHatasi } : {})
  };
}

/** Kısa özet: "rapor.csv (CSV, 1,2 KB) · 3/4 beklenti geçti". @param {import('./dosya-icerigi.d.mts').DosyaKontrolSonucu} r */
export function sonucOzeti(r) {
  const gecen = r.beklentiler.filter((b) => b.gecti).length;
  return `${r.dosya.ad} (${String(r.dosya.bicim).toUpperCase()}, ${boyutMetni(r.dosya.boyut)}) · ${gecen}/${r.beklentiler.length} beklenti geçti`;
}

/**
 * Kalan beklentilerin "Beklenen / Görülen" hata metni (koşucu). İlk satır koşucunun ortak biçimidir (Nöbetçi "Görülen:" kısmını
 * ayrıştırır); diğer kalanlar alt satırlarda.
 * @param {string} adim @param {import('./dosya-icerigi.d.mts').DosyaKontrolSonucu} r
 */
export function kalanlarMetni(adim, r) {
  const kalan = r.beklentiler.filter((b) => !b.gecti);
  if (!kalan.length) return '';
  const satir = (/** @type {import('./dosya-icerigi.d.mts').BeklentiSonucu} */ b) => `Beklenen: "${b.beklenen}" — Görülen: "${b.gorulen.replace(/\s+/g, ' ').trim()}"`;
  return [`${adim} adımında beklenen sonuç doğrulanamadı.`, satir(kalan[0]), ...kalan.slice(1).map((b) => `Ayrıca — ${satir(b)}`), `Dosya: ${sonucOzeti(r)}`].join('\n');
}

/**
 * Dosyanın adı: Content-Disposition (filename* / filename) ya da adresin son parçası; yoksa "yanit".
 * @param {Record<string, string> | undefined} basliklar @param {string} [adres]
 */
export function yanitDosyaAdi(basliklar, adres) {
  const cd = Object.entries(basliklar ?? {}).find(([a]) => a.toLowerCase() === 'content-disposition')?.[1] ?? '';
  const yildiz = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/.exec(cd);
  if (yildiz) { try { return decodeURIComponent(yildiz[1].trim().replace(/^"|"$/g, '')); } catch { /* düz ad denenir */ } }
  const duz = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(cd);
  if (duz) return (duz[2] ?? duz[1]).trim();
  try {
    const son = new URL(String(adres)).pathname.split('/').filter(Boolean).pop();
    if (son) return decodeURIComponent(son);
  } catch { /* adres yok */ }
  return 'yanit';
}
