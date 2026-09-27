// SQL ADIMI (genel, saf; ORTAK: sunucu, model koşucusu ve arayüz — /arayuz/sql-adimi.mjs olarak da sunulur, HİÇBİR modül
// içe aktarmaz). Ekran ve servis akışlarındaki "+ > SQL sorgusu" adımı: adıma gelindiğinde seçilen veritabanı bağlantısında
// (Ayarlar > Entegrasyonlar > Veritabanı bağlantısı) sorgu çalışır, sonuç beklenen sonuçla karşılaştırılır: eşleşirse adım
// Geçti, değilse Kaldı ("Beklenen / Görülen" biçiminde mesaj).
//
// Tanım (SqlTanimi):
//   { veritabaniId | baglantiId, sql, beklenen, yenidenDeneme?: { sureSn, aralikSn }, zamanAsimiSn?, okumalar?: [{ ad, sutun, gizli? }] }
//   veritabaniId: mantıksal veritabanı (Ayarlar > Entegrasyonlar > Veritabanları; koşuda ortamın eşlemesiyle bağlantıya çözülür;
//   önerilen). baglantiId: doğrudan bağlantı (eski; her ortamda aynı bağlantı). İkisinden yalnız biri bulunur.
//   beklenen: { tur: 'satirSayisi', deger: N } | { tur: 'sutunDegeri', sutun, deger } (ilk satır) | { tur: 'bosDegil' } |
//             { tur: 'bos' } | { tur: 'tabloEsit', sutunlar: [...] ([]: sonucun tüm sütunları), satirlar: [[...], ...] }
// Yer tutucular: SQL'de ${akis:Ad} (önceki adımda okunan değer), ${alanAnahtari} (ekran senaryosunun değeri) gibi mevcut
//   desenler. SQL'e METİN olarak eklenmez: her biri sürücü PARAMETRESİ (":nb1", ":nb2" …) olur; tırnak / yorum içinde yazılırsa
//   doğrulama hatasıdır. Beklenen değerlerdeki yer tutucular metin olarak çözülür (karşılaştırma için).
// Yeniden deneme: sonuç beklenene uymazsa (veri geç yazılıyorsa) sureSn boyunca her aralikSn'de tekrar sorgulanır; sorgu
//   HATASI (bağlantı, söz dizimi) yeniden denenmez.
// Rapor: en çok 20 satır; adı gizli sayılan (parola, token …) ya da "gizli" işaretli okuma sütunlarının değerleri ve gizli
//   akış değerleri maskelenir. Bağlantı parolası bu modüle hiç gelmez (yürütücü içinde kalır).
// NOT: import.meta KULLANILMAZ.

export const SQL_BEKLENEN_TURLERI = Object.freeze(['satirSayisi', 'sutunDegeri', 'bosDegil', 'bos', 'tabloEsit']);
export const SQL_BEKLENEN_ETIKETLERI = Object.freeze({
  satirSayisi: 'Satır sayısı = N', sutunDegeri: 'İlk satırda sütun = değer', bosDegil: 'Sonuç boş değil', bos: 'Sonuç boş', tabloEsit: 'Tablo eşit (beklenen satırlar)'
});
/** Raporda gösterilen en çok satır. */
export const SQL_RAPOR_SATIR_SINIRI = 20;
/** Sorguda okunan en çok satır (tablo eşitliği / satır sayısı için). */
export const SQL_SORGU_SATIR_SINIRI = 1000;
export const SQL_EN_UZUN = 20_000;
export const SQL_MASKE = '••••••';
const AD = /^[A-Za-z_][A-Za-z0-9_-]{0,59}$/;
/** ${…} yer tutucusu (iç ifade: akis:Ad, alan anahtarı, Tür[etiket].alan …). */
const YER_TUTUCU = /\$\{\s*([^{}\s][^{}]{0,199}?)\s*\}/g;

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @param {unknown} v @param {number} alt @param {number} ust */
const tamSayi = (v, alt, ust) => (Number.isInteger(v) && /** @type {number} */ (v) >= alt && /** @type {number} */ (v) <= ust);

/**
 * SQL'i kod / dizgi / yorum parçalarına ayırır (yer tutucular yalnız KOD parçasında parametre olur).
 * @param {string} sql @returns {Array<{ t: 'k' | 'd' | 'y'; m: string }>}
 */
function parcala(sql) {
  /** @type {Array<{ t: 'k' | 'd' | 'y'; m: string }>} */
  const p = [];
  let i = 0;
  let kod = '';
  const bitir = () => { if (kod) { p.push({ t: 'k', m: kod }); kod = ''; } };
  while (i < sql.length) {
    const c = sql[i];
    const s = sql[i + 1];
    if (c === '-' && s === '-') {
      const son = sql.indexOf('\n', i);
      bitir(); p.push({ t: 'y', m: sql.slice(i, son < 0 ? sql.length : son) }); i = son < 0 ? sql.length : son;
    } else if (c === '/' && s === '*') {
      const son = sql.indexOf('*/', i + 2);
      bitir(); p.push({ t: 'y', m: sql.slice(i, son < 0 ? sql.length : son + 2) }); i = son < 0 ? sql.length : son + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      bitir(); p.push({ t: 'd', m: sql.slice(i, j + 1) }); i = j + 1;
    } else { kod += c; i++; }
  }
  bitir();
  return p;
}

/**
 * SQL'deki yer tutucular: kodda olanlar (parametre olur) ve dizgi / yorum içinde kalanlar (hata).
 * @param {string} sql @returns {{ kodda: string[]; metinde: string[] }}
 */
export function sqlYerTutuculari(sql) {
  /** @type {string[]} */
  const kodda = [];
  /** @type {string[]} */
  const metinde = [];
  for (const p of parcala(String(sql ?? ''))) {
    for (const m of p.m.matchAll(YER_TUTUCU)) (p.t === 'k' ? kodda : metinde).push(m[1].trim());
  }
  return { kodda, metinde };
}

/** Metindeki ${akis:Ad} adları. @param {string} metin */
const akisAdlari = (metin) => [...String(metin ?? '').matchAll(YER_TUTUCU)].map((m) => m[1].trim()).filter((x) => x.startsWith('akis:')).map((x) => x.slice(5).trim());

/**
 * Tanımın kullandığı akış değeri adları (SQL + beklenen değerler).
 * @param {any} tanim @returns {string[]}
 */
export function sqlAkisDegerleri(tanim) {
  if (!nesneMi(tanim)) return [];
  const b = nesneMi(tanim.beklenen) ? tanim.beklenen : {};
  const metinler = [tanim.sql, b.deger, ...(Array.isArray(b.satirlar) ? b.satirlar.flat() : [])].map((x) => (x === undefined || x === null ? '' : String(x)));
  return [...new Set(metinler.flatMap(akisAdlari))];
}

/**
 * Tanımın yapısal doğrulaması (bağlantının varlığı ayrıca). Hata fırlatmaz: { tanim (temiz), hatalar }.
 * @param {unknown} ham @returns {{ tanim: any; hatalar: string[] }}
 */
export function sqlTanimiDogrula(ham) {
  /** @type {string[]} */
  const hatalar = [];
  const h = nesneMi(ham) ? ham : {};
  const baglantiId = typeof h.baglantiId === 'string' ? h.baglantiId.trim() : '';
  const veritabaniId = typeof h.veritabaniId === 'string' ? h.veritabaniId.trim() : '';
  const kimlikMi = (/** @type {string} */ x) => /^[A-Za-z0-9_-]{1,200}$/.test(x);
  if (veritabaniId && baglantiId) hatalar.push('Veritabanı ya da doğrudan bağlantıdan yalnız birini seçin.');
  else if (!kimlikMi(veritabaniId || baglantiId)) hatalar.push('Veritabanı bağlantısını seçin.');
  const sql = typeof h.sql === 'string' ? h.sql.trim() : '';
  if (!sql) hatalar.push('SQL sorgusunu yazın.');
  else if (sql.length > SQL_EN_UZUN) hatalar.push(`SQL en çok ${SQL_EN_UZUN} karakter olabilir.`);
  else {
    const y = sqlYerTutuculari(sql);
    if (y.metinde.length) hatalar.push(`Yer tutucu tırnak ya da yorum içinde: ${y.metinde.map((x) => `\${${x}}`).join(', ')}. Tırnaksız yazın (ör. WHERE no = \${akis:No}); değer parametre olarak bağlanır.`);
  }
  const b = nesneMi(h.beklenen) ? h.beklenen : {};
  /** @type {Record<string, unknown>} */
  let beklenen = { tur: 'bosDegil' };
  if (!SQL_BEKLENEN_TURLERI.includes(b.tur)) hatalar.push('Beklenen sonucu seçin.');
  else if (b.tur === 'satirSayisi') {
    const n = typeof b.deger === 'string' && b.deger.trim() !== '' ? Number(b.deger) : b.deger;
    if (!tamSayi(n, 0, SQL_SORGU_SATIR_SINIRI)) hatalar.push(`Beklenen satır sayısı 0–${SQL_SORGU_SATIR_SINIRI} arasında tam sayı olmalı.`);
    beklenen = { tur: 'satirSayisi', deger: Number(n) };
  } else if (b.tur === 'sutunDegeri') {
    const sutun = typeof b.sutun === 'string' ? b.sutun.trim().slice(0, 128) : '';
    if (!sutun) hatalar.push('Beklenen sonuçtaki sütun adını yazın.');
    beklenen = { tur: 'sutunDegeri', sutun, deger: b.deger === null || b.deger === undefined ? '' : String(b.deger).slice(0, 2000) };
  } else if (b.tur === 'tabloEsit') {
    const sutunlar = Array.isArray(b.sutunlar) ? b.sutunlar.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 128)).slice(0, 50) : [];
    const satirlar = Array.isArray(b.satirlar) ? b.satirlar.filter(Array.isArray).slice(0, SQL_RAPOR_SATIR_SINIRI * 5)
      .map((r) => r.slice(0, 50).map((x) => (x === null || x === undefined ? '' : String(x).slice(0, 2000)))) : [];
    if (sutunlar.length && satirlar.some((r) => r.length !== sutunlar.length)) hatalar.push('Beklenen tablodaki her satırda sütun sayısı kadar değer olmalı.');
    beklenen = { tur: 'tabloEsit', sutunlar, satirlar };
  } else beklenen = { tur: b.tur };
  /** @type {Record<string, unknown>} */
  const tanim = { ...(veritabaniId ? { veritabaniId } : { baglantiId }), sql, beklenen };
  const yd = nesneMi(h.yenidenDeneme) ? h.yenidenDeneme : null;
  if (yd && (yd.sureSn !== undefined && yd.sureSn !== null && yd.sureSn !== '')) {
    const sure = Number(yd.sureSn);
    const aralik = Number(yd.aralikSn ?? 2);
    if (!tamSayi(sure, 1, 600) || !tamSayi(aralik, 1, 60) || aralik > sure) hatalar.push('Yeniden deneme: süre 1–600 sn, aralık 1–60 sn (süreden büyük değil) tam sayı olmalı.');
    else tanim.yenidenDeneme = { sureSn: sure, aralikSn: aralik };
  }
  if (h.zamanAsimiSn !== undefined && h.zamanAsimiSn !== null && h.zamanAsimiSn !== '') {
    const z = Number(h.zamanAsimiSn);
    if (!tamSayi(z, 1, 300)) hatalar.push('Sorgu zaman aşımı 1–300 saniye arasında tam sayı olmalı.');
    else tanim.zamanAsimiSn = z;
  }
  const okumalar = Array.isArray(h.okumalar) ? h.okumalar : [];
  if (okumalar.length > 20) hatalar.push('En çok 20 değer okunabilir.');
  /** @type {Array<Record<string, unknown>>} */
  const temizOkumalar = [];
  for (const [k, o] of okumalar.slice(0, 20).entries()) {
    const x = nesneMi(o) ? o : {};
    const ad = typeof x.ad === 'string' ? x.ad.trim() : '';
    const sutun = typeof x.sutun === 'string' ? x.sutun.trim().slice(0, 128) : '';
    if (!ad && !sutun) continue;
    if (!AD.test(ad)) { hatalar.push(`${k + 1}. okuma: ad geçersiz (harf ya da "_" ile başlar; harf, rakam, "_", "-").`); continue; }
    if (!sutun) { hatalar.push(`"${ad}" okuması: sütun adını yazın.`); continue; }
    temizOkumalar.push({ ad, sutun, ...(typeof x.gizli === 'boolean' ? { gizli: x.gizli } : {}) });
  }
  if (temizOkumalar.length) tanim.okumalar = temizOkumalar;
  return { tanim, hatalar };
}

/**
 * Yer tutucuları sürücü parametresine çevirir (":nb1" …). coz(ifade) değeri döner; bulunamayanlar "eksikler"de.
 * @param {string} sql @param {(ifade: string) => string | undefined} coz
 * @returns {{ sql: string; parametreler: Record<string, string>; eksikler: string[] }}
 */
export function sqlBagla(sql, coz) {
  /** @type {Record<string, string>} */
  const parametreler = {};
  /** @type {Map<string, string>} */
  const adlar = new Map();
  /** @type {string[]} */
  const eksikler = [];
  const cikti = parcala(String(sql ?? '')).map((p) => (p.t !== 'k' ? p.m : p.m.replace(YER_TUTUCU, (_, ic) => {
    const ifade = String(ic).trim();
    const deger = coz(ifade);
    if (deger === undefined) { if (!eksikler.includes(ifade)) eksikler.push(ifade); return ':nb0'; }
    if (!adlar.has(ifade)) { const ad = `nb${adlar.size + 1}`; adlar.set(ifade, ad); parametreler[ad] = deger; }
    return `:${adlar.get(ifade)}`;
  }))).join('');
  return { sql: cikti, parametreler, eksikler };
}

/** Metindeki yer tutucuları metin olarak çözer (beklenen değerler). @param {string} m @param {(ifade: string) => string | undefined} coz */
const metniCoz = (m, coz) => String(m ?? '').replace(YER_TUTUCU, (tum, ic) => coz(String(ic).trim()) ?? tum);

/** Hücre → karşılaştırma / rapor metni. @param {unknown} v */
export function hucreMetni(v) {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'NULL' : v.toISOString();
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}
/** İki değer eşit mi (sayısal eşdeğerlik: "1.0" = "1"; NULL ↔ boş beklenen de eşit değil). @param {string} gorulen @param {string} beklenen */
function esitMi(gorulen, beklenen) {
  const g = gorulen.trim();
  const b = beklenen.trim();
  if (g === b) return true;
  if (g !== '' && b !== '' && Number.isFinite(Number(g)) && Number.isFinite(Number(b))) return Number(g) === Number(b);
  return false;
}
const sutunBul = (/** @type {string[]} */ sutunlar, /** @type {string} */ ad) => {
  const i = sutunlar.indexOf(ad);
  return i >= 0 ? i : sutunlar.findIndex((s) => String(s).toLocaleLowerCase('en') === ad.toLocaleLowerCase('en'));
};

/**
 * Rapor görünümü: en çok 20 satır; gizli sütunlar ve gizli değerler maskeli.
 * @param {{ sutunlar: string[]; satirlar: unknown[][]; kesildi?: boolean }} sonuc
 * @param {{ gizliSutunMu?: (ad: string) => boolean; gizliDegerler?: string[] }} [s]
 * @returns {{ sutunlar: string[]; satirlar: string[][]; toplamSatir: number; kesildi: boolean }}
 */
export function sonucOzeti(sonuc, s = {}) {
  const gizliSutun = sonuc.sutunlar.map((c) => Boolean(s.gizliSutunMu?.(String(c))));
  const gizliler = [...new Set((s.gizliDegerler ?? []).filter((x) => typeof x === 'string' && x.length >= 2))].sort((a, b) => b.length - a.length);
  const maskele = (/** @type {string} */ m) => gizliler.reduce((t, d) => t.split(d).join(SQL_MASKE), m);
  return {
    sutunlar: sonuc.sutunlar.map(String),
    satirlar: sonuc.satirlar.slice(0, SQL_RAPOR_SATIR_SINIRI).map((r) => r.map((v, i) => (gizliSutun[i] ? SQL_MASKE : maskele(hucreMetni(v))))),
    toplamSatir: sonuc.satirlar.length,
    kesildi: Boolean(sonuc.kesildi) || sonuc.satirlar.length > SQL_RAPOR_SATIR_SINIRI
  };
}

/** Kısa tablo metni ("a | b; c | d"). @param {string[][]} satirlar */
const tabloMetni = (satirlar) => (satirlar.length ? satirlar.slice(0, 5).map((r) => r.join(' | ')).join('; ') + (satirlar.length > 5 ? `; … (+${satirlar.length - 5} satır)` : '') : '(boş)');

/**
 * Sonucu beklenenle karşılaştırır. Görülen metin rapor görünümünden (maskeli) kurulur.
 * @param {any} beklenen @param {{ sutunlar: string[]; satirlar: unknown[][]; kesildi?: boolean }} sonuc
 * @param {(ifade: string) => string | undefined} coz @param {ReturnType<typeof sonucOzeti>} ozet
 * @returns {{ gecti: boolean; beklenen: string; gorulen: string }}
 */
export function sonucuDegerlendir(beklenen, sonuc, coz, ozet) {
  const n = sonuc.satirlar.length;
  const sayiMetni = sonuc.kesildi ? `${n}'den çok satır` : `${n} satır`;
  if (beklenen.tur === 'bos') return { gecti: n === 0, beklenen: 'sonuç boş (0 satır)', gorulen: n === 0 ? 'sonuç boş' : `${sayiMetni}: ${tabloMetni(ozet.satirlar)}` };
  if (beklenen.tur === 'bosDegil') return { gecti: n > 0, beklenen: 'sonuç boş değil (en az 1 satır)', gorulen: n ? sayiMetni : 'sonuç boş (0 satır)' };
  if (beklenen.tur === 'satirSayisi') return { gecti: !sonuc.kesildi && n === beklenen.deger, beklenen: `satır sayısı = ${beklenen.deger}`, gorulen: `satır sayısı = ${sonuc.kesildi ? `${n}'den çok` : n}` };
  if (beklenen.tur === 'sutunDegeri') {
    const b = metniCoz(beklenen.deger, coz);
    const i = sutunBul(sonuc.sutunlar, beklenen.sutun);
    const bMetni = `ilk satırda ${beklenen.sutun} = "${b}"`;
    if (i < 0) return { gecti: false, beklenen: bMetni, gorulen: `"${beklenen.sutun}" sütunu yok (sütunlar: ${sonuc.sutunlar.join(', ') || '—'})` };
    if (!n) return { gecti: false, beklenen: bMetni, gorulen: 'sonuç boş (0 satır)' };
    return { gecti: esitMi(hucreMetni(sonuc.satirlar[0][i]), b), beklenen: bMetni, gorulen: `ilk satırda ${beklenen.sutun} = "${ozet.satirlar[0]?.[i] ?? ''}"` };
  }
  // Tablo eşit: seçilen sütunlar (yoksa tümü), satırlar sırasıyla.
  const secili = beklenen.sutunlar.length ? beklenen.sutunlar : sonuc.sutunlar;
  const idx = secili.map((/** @type {string} */ s) => sutunBul(sonuc.sutunlar, s));
  const beklenenSatirlar = beklenen.satirlar.map((/** @type {string[]} */ r) => r.map((x) => metniCoz(x, coz)));
  const bMetni = `${beklenenSatirlar.length} satır: ${tabloMetni(beklenenSatirlar)}`;
  const eksik = secili.filter((_, k) => idx[k] < 0);
  if (eksik.length) return { gecti: false, beklenen: bMetni, gorulen: `sütun yok: ${eksik.join(', ')} (sütunlar: ${sonuc.sutunlar.join(', ') || '—'})` };
  const gorulenSatirlar = ozet.satirlar.map((r) => idx.map((/** @type {number} */ k) => r[k]));
  const gecti = !sonuc.kesildi && n === beklenenSatirlar.length
    && sonuc.satirlar.every((r, j) => idx.every((/** @type {number} */ k, c) => esitMi(hucreMetni(r[k]), beklenenSatirlar[j][c] ?? '')));
  return { gecti, beklenen: bMetni, gorulen: `${sayiMetni}: ${tabloMetni(gorulenSatirlar)}` };
}

/** Model koşucusunun (tests/support/beklenen-sonuc.ts) biçimi: raporlar "Beklenen / Görülen"i buradan ayırır. */
export function beklenenGorulenMetni(/** @type {string} */ adim, /** @type {string} */ beklenen, /** @type {string} */ gorulen) {
  return `${adim} adımında beklenen sonuç doğrulanamadı.\nBeklenen: "${beklenen}" — Görülen: "${gorulen.replace(/\s+/g, ' ').trim()}"`;
}

/**
 * @typedef {{ sutunlar: string[]; satirlar: unknown[][]; kesildi?: boolean }} SqlSonucu
 * @typedef {(sql: string, parametreler: Record<string, string>, s: { zamanAsimiMs: number; satirSiniri: number }) => Promise<SqlSonucu>} SqlYurutucu
 */

/**
 * SQL adımını koşar (yeniden deneme dahil). Sorgu hatası → durum 'hata'; beklenene uymazsa 'basarisiz'.
 * @param {any} tanim sqlTanimiDogrula'dan geçmiş tanım
 * @param {{ adimAdi: string; yurutucu: SqlYurutucu; coz: (ifade: string) => string | undefined; gizliSutunMu?: (ad: string) => boolean;
 *   gizliDegerler?: string[]; bekle?: (ms: number) => Promise<void>; simdi?: () => number; sinyal?: AbortSignal }} g
 * @returns {Promise<{ durum: 'basarili' | 'basarisiz' | 'hata'; mesaj?: string; beklenen?: string; gorulen?: string; ozet?: ReturnType<typeof sonucOzeti>;
 *   okunanlar: Record<string, string>; gizliOkunanlar: string[]; deneme: number; sureMs: number }>}
 */
export async function sqlAdiminiKos(tanim, g) {
  const simdi = g.simdi ?? Date.now;
  const bekle = g.bekle ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const bas = simdi();
  const okumalar = Array.isArray(tanim.okumalar) ? tanim.okumalar : [];
  const gizliOkumaSutunlari = new Set(okumalar.filter((/** @type {any} */ o) => o.gizli === true || (o.gizli === undefined && g.gizliSutunMu?.(o.ad))).map((/** @type {any} */ o) => String(o.sutun).toLocaleLowerCase('en')));
  const gizliSutunMu = (/** @type {string} */ ad) => gizliOkumaSutunlari.has(ad.toLocaleLowerCase('en')) || Boolean(g.gizliSutunMu?.(ad));
  const bag = sqlBagla(tanim.sql, g.coz);
  const bos = { okunanlar: {}, gizliOkunanlar: [] };
  if (bag.eksikler.length) {
    return { durum: 'hata', mesaj: `${g.adimAdi}: yer tutucunun değeri yok: ${bag.eksikler.map((x) => `\${${x}}`).join(', ')}.`, ...bos, deneme: 0, sureMs: simdi() - bas };
  }
  const zamanAsimiMs = (tanim.zamanAsimiSn ?? 30) * 1000;
  const bitis = bas + (tanim.yenidenDeneme ? tanim.yenidenDeneme.sureSn * 1000 : 0);
  let deneme = 0;
  for (;;) {
    deneme++;
    /** @type {SqlSonucu} */
    let sonuc;
    try {
      sonuc = await g.yurutucu(bag.sql, bag.parametreler, { zamanAsimiMs, satirSiniri: SQL_SORGU_SATIR_SINIRI });
    } catch (e) {
      const m = String(/** @type {any} */ (e)?.message ?? e).replace(/\s+/g, ' ').slice(0, 500);
      const gizli = g.gizliDegerler ?? [];
      return { durum: 'hata', mesaj: `${g.adimAdi}: SQL sorgusu çalışmadı: ${gizli.reduce((t, d) => (d && d.length >= 2 ? t.split(d).join(SQL_MASKE) : t), m)}`, ...bos, deneme, sureMs: simdi() - bas };
    }
    const ozet = sonucOzeti(sonuc, { gizliSutunMu, gizliDegerler: g.gizliDegerler });
    const d = sonucuDegerlendir(tanim.beklenen, sonuc, g.coz, ozet);
    if (d.gecti) {
      /** @type {Record<string, string>} */
      const okunanlar = {};
      /** @type {string[]} */
      const gizliOkunanlar = [];
      for (const o of okumalar) {
        const i = sutunBul(sonuc.sutunlar, o.sutun);
        if (i < 0 || !sonuc.satirlar.length) {
          return { durum: 'basarisiz', mesaj: beklenenGorulenMetni(g.adimAdi, `"${o.sutun}" sütunundan ${o.ad} okunur`, i < 0 ? `"${o.sutun}" sütunu yok (sütunlar: ${sonuc.sutunlar.join(', ') || '—'})` : 'sonuç boş (0 satır)'),
            beklenen: d.beklenen, gorulen: d.gorulen, ozet, ...bos, deneme, sureMs: simdi() - bas };
        }
        okunanlar[o.ad] = hucreMetni(sonuc.satirlar[0][i]);
        if (gizliSutunMu(o.sutun) || o.gizli === true) gizliOkunanlar.push(o.ad);
      }
      return { durum: 'basarili', beklenen: d.beklenen, gorulen: d.gorulen, ozet, okunanlar, gizliOkunanlar, deneme, sureMs: simdi() - bas };
    }
    const kalan = bitis - simdi();
    if (kalan <= 0 || g.sinyal?.aborted) {
      const ek = deneme > 1 ? ` (${deneme} deneme)` : '';
      return { durum: 'basarisiz', mesaj: beklenenGorulenMetni(g.adimAdi, d.beklenen, `${d.gorulen}${ek}`), beklenen: d.beklenen, gorulen: d.gorulen, ozet, ...bos, deneme, sureMs: simdi() - bas };
    }
    await bekle(Math.min(kalan, tanim.yenidenDeneme.aralikSn * 1000));
  }
}
