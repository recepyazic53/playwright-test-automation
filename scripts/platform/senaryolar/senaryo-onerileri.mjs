// SENARYO TASARIM YARDIMCISI (genel, saf fonksiyon; YAPAY ZEKÂ YOK — tamamen kural tabanlı) — ekran modeli + mevcut senaryolar
// (tüm akışlar, veri güdümlü satırlar dahil) + koşu geçmişi + kullanıcının öneri kararlarından AZ SAYIDA, GEREKÇELİ senaryo
// ÖNERİSİ üretir. Hiçbir şey kaydetmez ve tarayıcıya girmez: kullanıcı "Senaryo olarak ekle" demeden (kayıt yine tek
// doğrulayıcıdan geçer) senaryo oluşmaz.
//
// İlkeler:
//  1) Her önerinin GEREKÇESİ (kısa Türkçe cümle), NEDENİ (risk / kapsam / pairwise / sinir / zorunlu) ve PUANI vardır; gerekçesi
//     olmayan öneri üretilmez.
//  2) Yeni bir şey kapsamayan öneri ELENİR: mevcut senaryoların zaten denediği boş alan, sınır değeri, koşul dalı, ikili ve
//     beklenen uyarı yeniden önerilmez; aynı denklik sınıfından (aynı dal + aynı etki) birden çok öneri varsa biri kalır.
//  3) Kombinasyon = PAIRWISE (tüm ikililer): seçili alanlarda mevcut senaryoların kapsamadığı ikilileri kapatan en az ek satır
//     (açgözlü, AETG benzeri, deterministik). Görünürlük koşuluyla gizlenen alan o satırda yok sayılır; bağımlı listelerde yalnız
//     geçerli değerler; tabloya bağlı listelerde tablo değerleri (model yüklenirken listeye uygulanmış hâli).
//  4) Risk / geçmiş (YZ'siz): son dönemde başarısız koşan senaryoların değerleri içeren eksik ikililer öne çıkar; koşularda görülen
//     iş kuralı uyarısını beklenen sonuç olarak taşıyan senaryo yoksa hata senaryosu önerilir (beklenen mesaj o uyarı); kullanıcının
//     kabul / red kararları tür ve alan ağırlığını değiştirir (basit çarpan).
//  5) Kapsam ölçüleri: alanlar, koşul dalları, ikililer, görülen uyarılar (x / y + eksikler).
//  6) Sıra: risk > hiç denenmemiş koşul dalı > pairwise eksikleri > sınır değerleri (yalnız modelde kural varsa) > zorunlu alan boş.
//  7) Beklenen sonuç TAHMİN EDİLMEZ (bilinmiyorsa "siz seçin"); uyarıdan gelen öneride beklenen mesaj o uyarıdır.
//  8) Kişisel / gizli alanlarda DEĞER ÜRETİLMEZ (tabandaki değer ya da tablo başvurusu); kayıt tablosuna bağlı alanlar (Hazır /
//     Yeni kayıt grubu) değiştirilmez, tabandaki satır seçimi korunur.
//
// Import YOK, DOM YOK: arayüz bu dosyayı /arayuz/senaryo-onerileri.mjs olarak yükler; bağımlılıklar (form şeması, görünürlük,
// doğrulama, gizli ad denetimi) parametreyle verilir. Saat (simdi) enjekte edilir. Tipler: senaryo-onerileri.d.mts.

/** Pairwise'a en çok kaç alan girer (varsayılan seçim de bununla sınırlı). */
export const KOMBINASYON_ALAN_SINIRI = 10;
/** Pairwise'da bir alanın en çok kaç değeri kullanılır. */
export const KOMBINASYON_DEGER_SINIRI = 20;
/** Pairwise'ın en çok üreteceği ek satır (hesap sınırı; kalan ikililer bildirilir). */
export const PAIRWISE_SATIR_SINIRI = 60;
/** Bir ikiliyi görünür kılacak tamamlama aramasında denenen en çok değer birleşimi. */
export const TAMAMLAMA_SINIRI = 256;
/** Tek seferde gösterilen öneri sayısı (varsayılan; "Daha fazla göster" artırır). */
export const ONERI_UST_SINIRI = 10;
/** Koşulu yöneten bir alanın en çok kaç dalı değerlendirilir. */
export const KOSUL_DAL_SINIRI = 20;
/** "Sonra" diye reddedilen öneri kaç gün gizlenir. */
export const ERTELEME_GUNU = 7;
/** Senaryo verisinde bilerek boş bırakılan alanların listesi (senaryo-dogrulayici.mjs > BILEREK_BOS_ANAHTARI ile aynı). */
export const BILEREK_BOS = 'bilerekBos';
export const ONERI_TURLERI = Object.freeze(['zorunlu', 'sinir', 'kosullu', 'kombinasyon', 'uyari']);
export const NEDEN_TURLERI = Object.freeze(['risk', 'kapsam', 'pairwise', 'sinir', 'zorunlu']);
/** Nedenin taban puanı (sıralamanın ana ölçütü). */
export const NEDEN_PUANLARI = Object.freeze({ risk: 500, kapsam: 400, pairwise: 300, sinir: 200, zorunlu: 100 });
export const RED_NEDENLERI = Object.freeze(['gereksiz', 'yanlis', 'sonra']);
export const MASKE = '••••••';

/** Pairwise'da her yeni satır için kurulan aday satır sayısı (AETG). */
const ADAY_SATIR = 30;
const BASIT_TIPLER = ['secim', 'metin', 'sayi', 'tarih', 'onayKutusu', 'dosya'];
const IKILI_AYRACI = '\u0001';

function nesneMi(d) {
  return typeof d === 'object' && d !== null && !Array.isArray(d);
}
function bosMu(d) {
  return d === undefined || d === null || (typeof d === 'string' && d.trim() === '');
}
function kopya(d) {
  return d === undefined ? undefined : JSON.parse(JSON.stringify(d));
}
function tabloBasvurusuMu(d) {
  return typeof d === 'string' && /^\s*\$\{[^{}]+\.[^{}]+\}\s*$/u.test(d);
}
/** Karşılaştırma için tek biçim: { deger } nesnesi → deger; diğerleri metin. */
function duz(d) {
  if (nesneMi(d)) return d.deger === undefined || d.deger === null ? '' : String(d.deger).trim();
  return d === undefined || d === null ? '' : String(d).trim();
}
const benzersiz = (liste) => [...new Set(liste)];
const sinirla = (n, alt, ust) => Math.min(ust, Math.max(alt, n));
/** Mesaj karşılaştırması: Türkçe küçük harf, ı→i, tırnaklar düz, boşluklar tek (servis önerileriyle ORTAK). */
export function normalMetin(m) {
  return String(m ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[“”«»„″]/g, '"').replace(/[‘’‹›′]/g, "'").replace(/\s+/g, ' ').trim();
}
/** Kısa gösterim (tek satır, en çok n karakter). */
export const kisalt = (m, n = 60) => { const t = String(m ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/**
 * Önerinin sıralama puanı (ekran ve servis önerileri ORTAK): (neden tabanı + önem) × karar çarpanı.
 * @param {string} neden @param {number} ic @param {number} carpan
 */
export const oneriPuani = (neden, ic, carpan) => Math.round(((NEDEN_PUANLARI[neden] ?? 0) + ic) * carpan);

/**
 * Önerinin son kararına göre durumu (ekran ve servis önerileri ORTAK): son karar red ise "reddedilen"; red nedeni "sonra" ise
 * ERTELEME_GUNU boyunca "ertelenen", sonra yeniden görünür (null). Kabul ya da karar yoksa null.
 * @param {ReadonlyArray<import('./senaryo-onerileri.d.mts').OneriKarari>} kararlar @param {string} kimlik @param {number} simdiMs
 * @returns {'reddedilen' | 'ertelenen' | null}
 */
export function oneriRedDurumu(kararlar, kimlik, simdiMs) {
  const son = kararlar.filter((k) => k.kimlik === kimlik).sort((a, b) => String(b.zaman).localeCompare(String(a.zaman)))[0];
  if (!son || son.karar !== 'red') return null;
  if (son.redNedeni === 'sonra') return simdiMs - Date.parse(son.zaman) < ERTELEME_GUNU * 86_400_000 ? 'ertelenen' : null;
  return 'reddedilen';
}

// ---- Tarih yardımcıları (yalnız gün; yerel takvim) ------------------------------------------------

const iki = (n) => String(n).padStart(2, '0');
function gunEkle(t, gun) {
  const y = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  y.setDate(y.getDate() + gun);
  return y;
}
function tarihYaz(t, bicim) {
  return bicim === 'yyyy-aa-gg' ? `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}` : `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()}`;
}
/** "bugun", "bugun+7", gg.aa.yyyy ya da yyyy-aa-gg → { tarih, goreli } | null. */
function tarihCoz(d, simdi) {
  if (typeof d !== 'string') return null;
  const m = d.trim();
  const g = /^bug[uü]n(?:\s*([+-])\s*(\d{1,5}))?$/iu.exec(m);
  if (g) return { tarih: gunEkle(simdi, g[1] ? (g[1] === '-' ? -1 : 1) * Number(g[2]) : 0), goreli: true };
  const tr = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(m);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m);
  const [yil, ay, gun] = tr ? [Number(tr[3]), Number(tr[2]), Number(tr[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0];
  if (!yil) return null;
  const t = new Date(yil, ay - 1, gun);
  return t.getFullYear() === yil && t.getMonth() === ay - 1 && t.getDate() === gun ? { tarih: t, goreli: false } : null;
}
const gunSayisi = (t) => Math.round(new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() / 86_400_000);

// ---- Koşul ifadeleri ------------------------------------------------------------------------------

/** İfadenin başvurduğu alan kimlikleri ve senaryo ayarları. */
function ifadeBasvurulari(ifade, alanlar, ayarlar) {
  if (!nesneMi(ifade)) return;
  if (typeof ifade.alan === 'string') alanlar.add(ifade.alan);
  if (typeof ifade.senaryoAyari === 'string') ayarlar.add(ifade.senaryoAyari);
  for (const ad of ['ve', 'veya']) if (Array.isArray(ifade[ad])) ifade[ad].forEach((x) => ifadeBasvurulari(x, alanlar, ayarlar));
  if (ifade.degil) ifadeBasvurulari(ifade.degil, alanlar, ayarlar);
}

// ---- PAIRWISE (tüm ikililer) motoru — genel, saf -----------------------------------------------------

/** İkili anahtarı: "a=1<ayraç>b=2" (alanlar verilen sırayla). */
export function ikiliAnahtari(a, av, b, bv) {
  return `${a}=${av}${IKILI_AYRACI}${b}=${bv}`;
}
/** İkili anahtarını çözer: [[alan, değer], [alan, değer]]. */
export function ikiliCoz(anahtar) {
  return String(anahtar).split(IKILI_AYRACI).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; });
}

/**
 * Açgözlü pairwise (AETG benzeri; deterministik — aynı girdide aynı çıktı).
 *  1) Evren: her alan çifti × değer çifti; ikiyi birlikte içeren ve ikisini de GÖRÜNÜR kılan bir satır kurulabiliyorsa (tamamlama:
 *     tabandan başlanır, gerekirse o alanları yöneten alanların değerleri sırayla denenir) evrene girer; kurulamıyorsa "gecersiz".
 *  2) Kapsanan: verilen (mevcut senaryoların) ikilileri. Eksik = evren − kapsanan.
 *  3) Her yeni satır: en ağır (risk), eşitse ilk eksik ikiliyle başlanır (tohum); diğer alanlar sırayla, tohumu bozmadan en çok
 *     eksik ikiliyi kapatan değere çekilir (eşitlikte mevcut değer — tabana yakın kalır — sonra ilk değer). Doğrulamadan geçmeyen
 *     satırın tohumu "gecersiz" sayılır.
 * @param {import('./senaryo-onerileri.d.mts').PairwiseGirdisi} g
 * @returns {import('./senaryo-onerileri.d.mts').PairwiseSonucu}
 */
export function pairwiseUret(g) {
  const alanlar = g.alanlar.map((a) => a.anahtar);
  const sira = new Map(alanlar.map((a, i) => [a, i]));
  const taban = { ...(g.taban || {}) };
  const secenekler = g.secenekler || ((_s, a) => g.alanlar[sira.get(a)].degerler);
  const ata = g.ata || ((s, a, v) => (secenekler(s, a).includes(v) ? { ...s, [a]: v } : null));
  const gorunurOnbellek = new Map();
  const gorunurler = g.gorunurler
    ? (s) => { const k = JSON.stringify(alanlar.map((a) => s[a] ?? '')); let r = gorunurOnbellek.get(k); if (!r) { r = g.gorunurler(s); gorunurOnbellek.set(k, r); } return r; }
    : () => new Set(alanlar);
  const kontrolculer = g.kontrolculer || (() => []);
  const agirlik = g.agirlik || (() => 0);
  const satirSiniri = g.satirSiniri ?? PAIRWISE_SATIR_SINIRI;
  const tamamlamaSiniri = g.tamamlamaSiniri ?? TAMAMLAMA_SINIRI;

  /** Satırın kapsadığı ikililer (iki alan da görünür ve değerli). */
  function satirIkilileri(s) {
    const gor = gorunurler(s);
    const liste = [];
    for (let i = 0; i < alanlar.length; i++) {
      const a = alanlar[i];
      if (!gor.has(a) || bosMu(s[a])) continue;
      for (let j = i + 1; j < alanlar.length; j++) {
        const b = alanlar[j];
        if (gor.has(b) && !bosMu(s[b])) liste.push(ikiliAnahtari(a, s[a], b, s[b]));
      }
    }
    return liste;
  }
  /** Sabit değerleri içeren, onları görünür kılan satır (yoksa null). */
  function tamamla(sabit) {
    const sabitler = new Set(Object.keys(sabit));
    const kontrol = benzersiz(Object.keys(sabit).flatMap((a) => kontrolculer(a))).filter((a) => sira.has(a) && !sabitler.has(a))
      .sort((x, y) => sira.get(x) - sira.get(y));
    const dene = (s) => {
      // Sabitler önce yazılır, sonra alan sırasıyla (üst alan önce) atanır: bağımlı listenin geçerliliği atamada denetlenir.
      let r = { ...s, ...sabit };
      for (const a of [...sabitler].sort((x, y) => sira.get(x) - sira.get(y))) {
        r = ata(r, a, sabit[a], sabitler);
        if (!r) return null;
      }
      if (Object.keys(sabit).some((a) => r[a] !== sabit[a])) return null;
      const gor = gorunurler(r);
      return [...sabitler].every((a) => gor.has(a)) ? r : null;
    };
    const ilk = dene({ ...taban });
    if (ilk || !kontrol.length) return ilk;
    let deneme = 0;
    const ara = (i, s) => {
      if (deneme >= tamamlamaSiniri) return null;
      if (i === kontrol.length) { deneme++; return dene(s); }
      const a = kontrol[i];
      const mevcut = s[a];
      const degerler = [mevcut, ...secenekler(s, a).filter((v) => v !== mevcut)].filter((v) => !bosMu(v));
      for (const v of degerler) {
        const r = v === mevcut ? s : ata(s, a, v, new Set(kontrol.slice(0, i)));
        if (!r) continue;
        const bulunan = ara(i + 1, r);
        if (bulunan) return bulunan;
      }
      return null;
    };
    return ara(0, { ...taban });
  }

  const evren = [];
  const gecersiz = [];
  /** @type {Map<string, Record<string, string>>} */
  const tamamlamalar = new Map();
  const tumDegerler = (a) => g.alanlar[sira.get(a)].degerler;
  for (let i = 0; i < alanlar.length; i++) {
    for (let j = i + 1; j < alanlar.length; j++) {
      for (const av of tumDegerler(alanlar[i])) {
        for (const bv of tumDegerler(alanlar[j])) {
          const k = ikiliAnahtari(alanlar[i], av, alanlar[j], bv);
          const s = tamamla({ [alanlar[i]]: av, [alanlar[j]]: bv });
          if (s && satirIkilileri(s).includes(k)) { evren.push(k); tamamlamalar.set(k, s); } else gecersiz.push(k);
        }
      }
    }
  }
  const evrenKumesi = new Set(evren);
  const kapsanan = benzersiz([...(g.kapsanan || [])]).filter((k) => evrenKumesi.has(k));
  const kapsananKumesi = new Set(kapsanan);
  const eksik = new Set(evren.filter((k) => !kapsananKumesi.has(k)));
  const satirlar = [];
  // Sabit tohumlu sözde rastgele (mulberry32): AETG'nin aday satır çeşitliliği; aynı girdide aynı çıktı.
  let rs = 0x2545f491;
  const rastgele = () => {
    rs = (rs + 0x6d2b79f5) >>> 0;
    let t = rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const karistir = (liste) => {
    const l = [...liste];
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rastgele() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
    return l;
  };
  /** Satırın kapattığı eksik ikililerin ağırlıklı sayısı (yalnız "dahil" alanlar arasında); tohum kapanmıyorsa −1. */
  const kazanc = (s, tohum, dahil) => {
    const liste = satirIkilileri(s);
    if (!liste.includes(tohum)) return -1;
    let t = 0;
    for (const k of liste) {
      if (!eksik.has(k)) continue;
      const [[a], [b]] = ikiliCoz(k);
      if (!dahil || (dahil.has(a) && dahil.has(b))) t += 1 + agirlik(k);
    }
    return t;
  };
  /**
   * AETG aday satırı: tohum ikiliden başlanır; diğer alanlar karışık sırayla, o ana dek atananlarla en çok eksik ikiliyi kapatan
   * değere çekilir. Eşitlikte dolu mevcut değer (tabana yakınlık) kalır; boşsa eşitlerden biri seçilir.
   */
  function satirKur(tohum) {
    const [[ta], [tb]] = ikiliCoz(tohum);
    const sabit = new Set([ta, tb]);
    const atanan = new Set(sabit);
    let satir = /** @type {Record<string, string>} */ (tamamlamalar.get(tohum));
    for (const a of karistir(alanlar.filter((x) => !sabit.has(x)))) {
      atanan.add(a);
      let enIyi = [satir];
      let enIyiKazanc = kazanc(satir, tohum, atanan);
      for (const v of secenekler(satir, a)) {
        if (v === satir[a]) continue;
        const r = ata(satir, a, v, sabit);
        if (!r) continue;
        const k = kazanc(r, tohum, atanan);
        if (k > enIyiKazanc) { enIyi = [r]; enIyiKazanc = k; } else if (k === enIyiKazanc && k >= 0) enIyi.push(r);
      }
      if (enIyi[0] === satir && !bosMu(satir[a])) continue;
      const adaylar = enIyi.filter((r) => r !== satir);
      if (adaylar.length) satir = adaylar[Math.floor(rastgele() * adaylar.length)];
    }
    return { satir, kazanc: kazanc(satir, tohum, null) };
  }
  while (eksik.size && satirlar.length < satirSiniri) {
    // Aday tohumlar: en ağır (risk) eksik ikililer; ilki eksik ikilisi en çok olan değerleri içeren ikili, diğerleri karışık.
    let enAgir = -Infinity;
    const sayac = new Map();
    for (const k of eksik) {
      enAgir = Math.max(enAgir, agirlik(k));
      for (const [a, v] of ikiliCoz(k)) sayac.set(`${a}=${v}`, (sayac.get(`${a}=${v}`) ?? 0) + 1);
    }
    const agirlar = [...eksik].filter((k) => agirlik(k) === enAgir);
    const yogunluk = (k) => ikiliCoz(k).reduce((t, [a, v]) => t + (sayac.get(`${a}=${v}`) ?? 0), 0);
    const ilk = agirlar.reduce((x, y) => (yogunluk(y) > yogunluk(x) ? y : x));
    let secilen = null;
    for (let i = 0; i < ADAY_SATIR; i++) {
      const t = i === 0 ? ilk : agirlar[Math.floor(rastgele() * agirlar.length)];
      const aday = satirKur(t);
      if (!secilen || aday.kazanc > secilen.kazanc) secilen = { ...aday, tohum: t };
    }
    const tohum = /** @type {{ tohum: string }} */ (secilen).tohum;
    const satir = /** @type {{ satir: Record<string, string> }} */ (secilen).satir;
    if (g.gecerliMi && !g.gecerliMi(satir)) {
      eksik.delete(tohum);
      gecersiz.push(tohum);
      continue;
    }
    const yeni = satirIkilileri(satir).filter((k) => eksik.has(k));
    if (!yeni.length) { eksik.delete(tohum); gecersiz.push(tohum); continue; }
    for (const k of yeni) eksik.delete(k);
    satirlar.push({ satir, yeniIkililer: yeni });
  }
  const gecersizler = benzersiz(gecersiz);
  return { evren: evren.filter((k) => !gecersizler.includes(k)), kapsanan, gecersiz: gecersizler, satirlar, kalan: [...eksik] };
}

// ---- Öneri kararlarından ağırlık (YZ'siz öğrenme) -------------------------------------------------------

/**
 * Kabul / red olaylarından tür ve alan çarpanı: her kabul +0,1, her red (neden "sonra" değilse) −0,15; tür çarpanı projenin tüm
 * ekranlarından, alan çarpanı bu ekranın olaylarından; öneri çarpanı = tür × alanların ortalaması, [0,5; 1,5] aralığında.
 * alanKapsami verilirse (servis önerileri: aynı servis + metot) alan çarpanına yalnız onu sağlayan olaylar girer (ekranId yok sayılır).
 * @param {ReadonlyArray<import('./senaryo-onerileri.d.mts').OneriKarari>} kararlar @param {string | null} ekranId
 * @param {(k: import('./senaryo-onerileri.d.mts').OneriKarari) => boolean} [alanKapsami]
 */
export function kararAgirliklari(kararlar, ekranId, alanKapsami) {
  const tur = new Map();
  const alan = new Map();
  const ekle = (m, k, d) => m.set(k, (m.get(k) ?? 0) + d);
  for (const k of Array.isArray(kararlar) ? kararlar : []) {
    if (!nesneMi(k) || (k.karar !== 'kabul' && k.karar !== 'red')) continue;
    if (k.karar === 'red' && k.redNedeni === 'sonra') continue;
    const d = k.karar === 'kabul' ? 0.1 : -0.15;
    if (typeof k.tur === 'string') ekle(tur, k.tur, d);
    const kapsamda = alanKapsami ? alanKapsami(k) : (!ekranId || !k.ekranId || k.ekranId === ekranId);
    if (kapsamda) for (const a of Array.isArray(k.alanlar) ? k.alanlar : []) if (typeof a === 'string') ekle(alan, a, d);
  }
  return {
    /** @param {string} t @param {string[]} alanlar */
    carpan(t, alanlar) {
      const wt = 1 + (tur.get(t) ?? 0);
      const liste = (alanlar || []).map((a) => 1 + (alan.get(a) ?? 0));
      const wa = liste.length ? liste.reduce((x, y) => x + y, 0) / liste.length : 1;
      return sinirla(wt * wa, 0.5, 1.5);
    }
  };
}

/**
 * Senaryo önerileri.
 * @param {import('./senaryo-onerileri.d.mts').OneriGirdisi} g
 * @returns {import('./senaryo-onerileri.d.mts').OneriSonucu}
 */
export function senaryoOnerileri(g) {
  const model = g.model;
  const sema = g.sema;
  const simdi = g.simdi instanceof Date ? g.simdi : new Date();
  const senaryolar = (Array.isArray(g.senaryolar) ? g.senaryolar : []).filter((s) => s && nesneMi(s.veri));
  // Kapsam: bu akışın senaryoları + ekranın diğer akışlarındaki senaryolar (yalnız "zaten denendi mi" için; taban olmaz).
  const tumSenaryolar = [...senaryolar, ...(Array.isArray(g.kapsamSenaryolari) ? g.kapsamSenaryolari : []).filter((s) => s && nesneMi(s.veri))];
  const tabloBasvurulari = nesneMi(g.tabloBasvurulari) ? g.tabloBasvurulari : {};
  const haricAlanlar = new Set(Array.isArray(g.haricAlanlar) ? g.haricAlanlar : []);
  const ustSinir = typeof g.ustSinir === 'number' && g.ustSinir > 0 ? g.ustSinir : ONERI_UST_SINIRI;
  const gecmis = nesneMi(g.gecmis) ? g.gecmis : {};
  const hataGunu = typeof gecmis.hataGunu === 'number' ? gecmis.hataGunu : 14;
  const uyariGunu = typeof gecmis.uyariGunu === 'number' ? gecmis.uyariGunu : hataGunu;
  const bs = sema.beklenenSonuc;
  /** @type {Array<{ tur: string; mesaj: string }>} */
  const notlar = [];
  const not = (tur, mesaj) => notlar.push({ tur, mesaj });

  // Form alanları (akış sırasıyla) ve modeldeki ham karşılıkları.
  const formAlanlari = [...sema.adimlar.flatMap((a) => a.bolumler.flatMap((b) => b.alanlar)), ...sema.senaryoAlanlari];
  const ekranAlanlari = sema.adimlar.flatMap((a) => a.bolumler.flatMap((b) => b.alanlar));
  /** @type {Map<string, any>} */
  const ham = new Map();
  const adimlar = (Array.isArray(model.adimlar) ? model.adimlar : []).filter(nesneMi);
  for (const adim of adimlar) for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) ham.set(a.id, a);
  for (const a of nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : []) if (nesneMi(a) && !ham.has(a.id)) ham.set(a.id, a);
  const hamAlan = (fa) => ham.get(fa.id) || {};
  const adimBasligi = (id) => (bs && bs.adimlar.find((s) => s.deger === id)?.metin) || sema.adimlar.find((a) => a.id === id)?.baslik || String(id || '');
  const alanById = (id) => formAlanlari.find((x) => x.id === id) || formAlanlari.find((x) => x.anahtar === id);

  const gizliMi = (fa) => {
    const h = hamAlan(fa);
    return fa.hassas === true || h.hassas === true || h.tip === 'telefon' || h.tip === 'kimlikProfili' || fa.tip === 'kimlik'
      || Boolean(g.gizliAdMi && (g.gizliAdMi(String(fa.anahtar)) || g.gizliAdMi(String(fa.id))));
  };
  /** Değeri öneride değiştirilemeyen alan: kişisel / gizli ya da kayıt tablosuna bağlı (Hazır / Yeni kayıt grubu). */
  const dokunulmazMi = (fa) => gizliMi(fa) || haricAlanlar.has(fa.id) || haricAlanlar.has(fa.anahtar);
  const secenekMetni = (fa, v) => {
    const liste = [...(fa.secenekler || []), ...Object.values((fa.bagimlilik && fa.bagimlilik.harita) || {}).flat()];
    return liste.find((x) => x.deger === duz(v))?.metin ?? duz(v);
  };
  /** Kullanıcıya gösterilen değer (gizli alan maskeli; tablo başvurusu kaynağıyla). */
  const gosterim = (fa, v) => {
    if (fa.tip === 'onayKutusu' && typeof v === 'boolean') return v ? 'işaretli' : 'işaretsiz';
    if (bosMu(v)) return '(boş)';
    if (tabloBasvurusuMu(v)) return `Tablodan: ${String(v).trim().slice(2, -1)}`;
    if (gizliMi(fa)) return MASKE;
    return fa.tip === 'secim' ? secenekMetni(fa, v) : duz(v);
  };
  /** Pairwise / kapsam için alan değerinin tek biçimi (onay kutusu "true"/"false"; tablo başvurusu değersiz). */
  const normal = (fa, v) => (fa.tip === 'onayKutusu' ? (v === true ? 'true' : 'false') : tabloBasvurusuMu(v) ? '' : duz(v));
  const degerMetni = (fa, n) => (fa.tip === 'onayKutusu' ? (n === 'true' ? 'işaretli' : 'işaretsiz') : secenekMetni(fa, n));
  const gorunurlukOnbellegi = new Map();
  const gorunurluk = (veri) => {
    const k = JSON.stringify(veri);
    let r = gorunurlukOnbellegi.get(k);
    if (!r) { r = g.gorunurlukHesapla(veri); gorunurlukOnbellegi.set(k, r); }
    return r;
  };
  const gorunurMu = (gr, fa) => !(gr.alanlar[fa.id] === false || (fa.adimId && gr.adimlar[fa.adimId] === false));
  const basariMi = (veri) => !bs || !nesneMi(veri[bs.anahtar]) || !veri[bs.anahtar].tip || veri[bs.anahtar].tip === bs.basariTipi;
  const bilerekBos = (veri) => (Array.isArray(veri[BILEREK_BOS]) ? veri[BILEREK_BOS] : []);
  const temizle = (veri) => {
    const v = kopya(veri);
    delete v[sema.baslik];
    if (bs) delete v[bs.anahtar];
    delete v[BILEREK_BOS];
    return v;
  };
  const bagimlilar = (fa) => formAlanlari.filter((x) => x.tip === 'secim' && x.bagimlilik && x.bagimlilik.alan === fa.id);
  /** Üst alanın değeri değişince bağımlı seçimler: değer yeni listede yoksa listenin ilk seçeneği (kişisel olmayan listeler). */
  function bagimlilariAyarla(veri, fa, dokunma = new Set()) {
    for (const d of bagimlilar(fa)) {
      if (dokunma.has(d.id)) continue;
      const liste = d.bagimlilik.harita[duz(veri[fa.anahtar])] || [];
      if (!liste.some((x) => x.deger === duz(veri[d.anahtar])) && !tabloBasvurusuMu(veri[d.anahtar])) {
        if (liste.length && !gizliMi(d)) veri[d.anahtar] = liste[0].deger; else delete veri[d.anahtar];
      }
      bagimlilariAyarla(veri, d, dokunma);
    }
  }
  /** Görünmeyen alanların değerleri atılır (form da yazmaz); zorunlu boş alanlar tablo başvurusu / varsayılanla dolar, yoksa eksik. */
  function sonlandir(veri, haric = []) {
    const gr = gorunurluk(veri);
    for (const fa of formAlanlari) if (!gorunurMu(gr, fa) && fa.anahtar !== sema.baslik && fa.anahtar in veri) delete veri[fa.anahtar];
    const eksikler = [];
    for (const fa of formAlanlari) {
      if (fa.zorunlu !== true || fa.anahtar === sema.baslik || haric.includes(fa.anahtar) || !BASIT_TIPLER.includes(fa.tip) || fa.tip === 'onayKutusu') continue;
      if (!gorunurMu(gr, fa) || !bosMu(veri[fa.anahtar])) continue;
      const h = hamAlan(fa);
      if (tabloBasvurulari[fa.id]) veri[fa.anahtar] = tabloBasvurulari[fa.id];
      else if (nesneMi(h.varsayilan) && !bosMu(h.varsayilan.deger) && fa.tip !== 'dosya') veri[fa.anahtar] = kopya(h.varsayilan.deger);
      else eksikler.push(fa.etiket);
    }
    return { gr, eksikler };
  }

  // ---- Taban ----------------------------------------------------------------------------------------
  const siraliAdaylar = senaryolar.map((s, i) => ({ s, i }))
    .filter(({ s }) => basariMi(s.veri) && !bilerekBos(s.veri).length)
    .sort((a, b) => Number(b.s.sonDurum === 'basarili') - Number(a.s.sonDurum === 'basarili') || a.i - b.i)
    .map(({ s }) => s);
  const tabanSenaryo = siraliAdaylar.find((s) => !g.dogrula || !g.dogrula(s.veri).hatalar.length) || null;
  /** @type {Record<string, unknown>} */
  let tabanVeri;
  if (tabanSenaryo) {
    tabanVeri = temizle(tabanSenaryo.veri);
  } else {
    tabanVeri = {};
    for (const fa of formAlanlari) {
      const h = hamAlan(fa);
      if (BASIT_TIPLER.includes(fa.tip) && fa.tip !== 'dosya' && nesneMi(h.varsayilan) && !bosMu(h.varsayilan.deger)) tabanVeri[fa.anahtar] = kopya(h.varsayilan.deger);
    }
  }
  const tabanSonu = sonlandir(tabanVeri);
  const taban = {
    kaynak: tabanSenaryo ? 'senaryo' : 'varsayilan', senaryoId: tabanSenaryo ? tabanSenaryo.id : null, baslik: tabanSenaryo ? tabanSenaryo.baslik : null,
    eksikler: tabanSonu.eksikler
  };
  const tabanMetni = tabanSenaryo ? `"${tabanSenaryo.baslik}" senaryosundaki gibi` : 'modelin varsayılanlarıyla';
  // Kayıt grubu (Hazır / Yeni) ve tablo satır seçimleri tabandan aynen taşınır.
  const tabloSecimleri = tabanSenaryo && nesneMi(tabanSenaryo.tabloSecimleri) && Object.keys(tabanSenaryo.tabloSecimleri).length ? kopya(tabanSenaryo.tabloSecimleri) : null;
  if (!tabanSenaryo) {
    not('taban', senaryolar.length
      ? 'Başarı bekleyen ve kurallardan geçen bir senaryo bulunamadı; öneriler modelin varsayılanlarıyla kuruldu.'
      : 'Bu ekranda henüz senaryo yok; öneriler modelin varsayılanlarıyla kuruldu.');
  }
  if (taban.eksikler.length) not('taban', `Değeri olmayan zorunlu alanlar (değer üretilmez; önizlemede doldurun): ${taban.eksikler.join(', ')}.`);

  // ---- Mevcut senaryoların denedikleri (kapsam) ---------------------------------------------------------------
  /** Senaryonun koşudaki veri biçimleri: veri güdümlü satırlar (çözülmüş değerler) varsa her biri, yoksa verinin kendisi. */
  const varyantlar = (s) => (Array.isArray(s.degerSatirlari) && s.degerSatirlari.length
    ? s.degerSatirlari.filter(nesneMi).map((r) => ({ ...s.veri, ...r }))
    : [s.veri]);
  const denenenler = tumSenaryolar.flatMap((s) => varyantlar(s).map((veri) => ({ s, veri })));
  const denendiMi = (kosul) => denenenler.some(({ veri }) => kosul(veri));

  // ---- Geçmiş: başarısız koşular ve görülen uyarılar ---------------------------------------------------------
  const hatalar = (Array.isArray(gecmis.hatalar) ? gecmis.hatalar : []).filter((h) => nesneMi(h) && typeof h.sayi === 'number' && h.sayi > 0);
  const adimBul = (ad) => {
    if (bosMu(ad)) return null;
    const n = normalMetin(ad);
    return sema.adimlar.find((a) => a.id === ad || normalMetin(a.baslik) === n) || null;
  };
  /** Adım kimliği → son dönemdeki başarısız sonuç sayısı. */
  const adimRiski = new Map();
  for (const h of hatalar) { const a = adimBul(h.adim); if (a) adimRiski.set(a.id, (adimRiski.get(a.id) ?? 0) + h.sayi); }
  /** "alan=değer" → o değeri taşıyan başarısız senaryoların sonuç sayısı. */
  const degerRiski = new Map();
  const senaryoHatasi = new Map();
  for (const h of hatalar) if (h.senaryoId) senaryoHatasi.set(h.senaryoId, (senaryoHatasi.get(h.senaryoId) ?? 0) + h.sayi);
  for (const s of tumSenaryolar) {
    const n = senaryoHatasi.get(s.id);
    if (!n) continue;
    for (const fa of ekranAlanlari) {
      if (!['secim', 'onayKutusu'].includes(fa.tip) || !(fa.anahtar in s.veri)) continue;
      const v = normal(fa, s.veri[fa.anahtar]);
      if (v) degerRiski.set(`${fa.anahtar}=${v}`, (degerRiski.get(`${fa.anahtar}=${v}`) ?? 0) + n);
    }
  }
  const adimEki = (fa) => {
    const n = fa.adimId ? adimRiski.get(fa.adimId) : 0;
    return n ? `; “${adimBasligi(fa.adimId)}” adımı son ${hataGunu} günde ${n} kez hata verdi` : '';
  };
  const adimPuani = (fa) => Math.min(30, 5 * ((fa.adimId && adimRiski.get(fa.adimId)) || 0));

  // ---- Ortak: beklenen sonuç ve öneri kurma -------------------------------------------------------------
  const kosuldaAlanVar = (ifade, id) => { const a = new Set(); ifadeBasvurulari(ifade, a, new Set()); return a.has(id); };
  /**
   * İş kuralı hatası beklentisi (tahmin yok): zorunlu alan önerisinde (bosAlan) modelde bu alanın iş kuralı ya da adımın hata göstergesi
   * şart ve mesaj alanın iş kuralından gelir; sınır önerisinde adım alanın adımıdır, mesajı kullanıcı yazar.
   */
  function hataBeklentisi(fa, bosAlan) {
    if (!bs || !bs.hataTipi) return { tur: 'belirsiz', neden: 'Modelin beklenen sonucunda iş kuralı hatası seçeneği yok; beklenen sonucu siz seçin.' };
    const adimId = fa.adimId;
    if (!adimId) return { tur: 'belirsiz', neden: 'Alan bir adıma bağlı değil; beklenen sonucu siz seçin.' };
    const adim = adimlar.find((a) => a.id === adimId);
    const kural = bosAlan && (Array.isArray(model.isKurallari) ? model.isKurallari : []).find((k) => nesneMi(k) && k.adim === adimId && kosuldaAlanVar(k.kosul, fa.id) && typeof k.mesaj === 'string' && k.mesaj.trim());
    const gosterge = adim && nesneMi(adim.kosu) && nesneMi(adim.kosu.hataGostergesi);
    if (bosAlan && !kural && !gosterge) return { tur: 'belirsiz', neden: 'Modelde bu alan ya da adımı için hata / uyarı göstergesi tanımlı değil; beklenen sonucu siz seçin.' };
    if (bs.adimAnahtari && !bs.adimlar.some((s) => s.deger === adimId)) return { tur: 'belirsiz', neden: 'Alanın adımı beklenen sonuç adımları arasında yok; beklenen sonucu siz seçin.' };
    return { tur: 'hata', adim: adimId, adimBasligi: adimBasligi(adimId), mesaj: kural ? kural.mesaj.trim() : '', mesajEksik: !kural };
  }
  const beklenenMetni = (b) => (b.tur === 'basari' ? 'Başarılı akış'
    : b.tur === 'hata' ? `İş kuralı hatası beklenir (${b.adimBasligi})${b.mesajEksik ? ' — mesajı siz yazın' : ''}` : 'Beklenen sonucu siz seçin');
  /** Tabana göre değişen, görünen alanlar (gizli alanlar maskeli). */
  const farklar = (veri) => formAlanlari.filter((fa) => fa.anahtar !== sema.baslik && (!bs || fa.anahtar !== bs.anahtar)
    && JSON.stringify(veri[fa.anahtar] ?? null) !== JSON.stringify(tabanVeri[fa.anahtar] ?? null) && fa.anahtar in veri)
    .map((fa) => ({ etiket: fa.etiket, deger: gosterim(fa, veri[fa.anahtar]) }));

  /** @type {any[]} */
  const adaylar = [];
  const elenen = { kapsanan: 0, denklik: 0, reddedilen: 0, ertelenen: 0 };
  function adayEkle(o) {
    if (!o.gerekce) return; // gerekçesi olmayan öneri üretilmez
    if (adaylar.some((x) => x.kimlik === o.kimlik)) return;
    adaylar.push({ ...o, sira: adaylar.length });
  }

  // ---- 1) Zorunlu alanlar -------------------------------------------------------------------------------
  const bilesikZorunlu = [];
  for (const fa of formAlanlari) {
    if (fa.zorunlu !== true || fa.anahtar === sema.baslik) continue;
    if (!BASIT_TIPLER.includes(fa.tip)) { bilesikZorunlu.push(fa.etiket); continue; }
    if (!gorunurMu(tabanSonu.gr, fa)) continue;
    if (denendiMi((v) => bilerekBos(v).includes(fa.anahtar))) { elenen.kapsanan++; continue; }
    const veri = kopya(tabanVeri);
    if (fa.tip === 'onayKutusu') veri[fa.anahtar] = false; else delete veri[fa.anahtar];
    veri[BILEREK_BOS] = [fa.anahtar];
    const { eksikler } = sonlandir(veri, [fa.anahtar]);
    const beklenen = hataBeklentisi(fa, true);
    const bos = fa.tip === 'onayKutusu' ? 'işaretsiz' : 'boş';
    adayEkle({
      tur: 'zorunlu', neden: 'zorunlu', kimlik: `zorunlu:${fa.anahtar}`, baslik: `Zorunlu alan boş: ${fa.etiket}`, alanlar: [fa.id],
      gerekce: `“${fa.etiket}” ${bos} bırakıldığında ne olduğu hiç denenmedi${beklenen.tur === 'hata' && !beklenen.mesajEksik ? ` (modeldeki kural: “${kisalt(beklenen.mesaj)}”)` : ''}${adimEki(fa)}`,
      ic: (beklenen.tur === 'hata' ? 60 : 30) + adimPuani(fa),
      ozet: `"${fa.etiket}" ${bos} bırakılır; diğer alanlar ${tabanMetni}.`,
      degisiklikler: [{ etiket: fa.etiket, deger: fa.tip === 'onayKutusu' ? 'işaretsiz' : '(boş)' }],
      beklenen, veri, eksikler
    });
  }
  if (bilesikZorunlu.length) not('zorunlu', `Bileşik zorunlu alanlar için (${benzersiz(bilesikZorunlu).join(', ')}) boş alan önerisi üretilmez; gerekirse senaryoyu elle yazın.`);

  // ---- 2) Sınır değerleri (yalnız modeldeki kurallardan) ------------------------------------------------
  // Denklik: sınırın hemen içi (alt + 1, üst − 1) sınırın kendisiyle aynı sınıftır (geçerli, aynı taraf) — yalnız sınır ve sınırın
  // hemen dışı önerilir: alt − 1 (geçersiz), alt (geçerli), üst (geçerli), üst + 1 (geçersiz).
  const kuralsiz = [];
  for (const fa of formAlanlari) {
    const h = hamAlan(fa);
    if (!['sayi', 'tarih', 'metin', 'telefon'].includes(h.tip) || fa.anahtar === sema.baslik || !BASIT_TIPLER.includes(fa.tip)) continue;
    const s = nesneMi(h.sinirlar) ? h.sinirlar : null;
    const kuralVar = s && ['enAz', 'enCok', 'enAzUzunluk', 'enCokUzunluk', 'desen'].some((k) => s[k] !== undefined);
    if (!kuralVar) { if (h.tip !== 'telefon') kuralsiz.push(fa.etiket); continue; }
    if (gizliMi(fa)) { not('sinir', `"${fa.etiket}" kişisel / gizli bir alan: sınır değeri üretilmez (tablodan ya da mevcut senaryodaki değeri kullanın).`); continue; }
    if (dokunulmazMi(fa)) continue;
    if (!gorunurMu(tabanSonu.gr, fa)) { not('sinir', `"${fa.etiket}" tabanda ekranda görünmüyor; sınır önerisi için önce koşulunu sağlayan bir senaryo gerekir.`); continue; }
    for (const a of sinirAdaylari(fa, h, s, tabanVeri[fa.anahtar])) {
      if (a.ic) { elenen.denklik++; continue; }
      if (denendiMi((v) => !bosMu(v[fa.anahtar]) && duz(v[fa.anahtar]) === duz(a.deger))) { elenen.kapsanan++; continue; }
      const veri = kopya(tabanVeri);
      veri[fa.anahtar] = a.deger;
      const { eksikler } = sonlandir(veri);
      const gosterilen = gosterim(fa, a.deger);
      adayEkle({
        tur: 'sinir', neden: 'sinir', kimlik: `sinir:${fa.anahtar}:${duz(a.deger)}`, alanlar: [fa.id],
        baslik: `Sınır: ${fa.etiket} = ${gosterilen.length > 40 ? `${gosterilen.length} karakter` : gosterilen} (${a.etiket})`,
        gerekce: `“${fa.etiket}” için modelde kural var (${a.kural}); ${a.etiket} (${a.gecerli ? 'geçerli' : 'geçersiz'}) hiç denenmedi${adimEki(fa)}`,
        ic: (a.gecerli ? 40 : 60) + adimPuani(fa),
        ozet: `"${fa.etiket}" ${a.aciklama}; kural: ${a.kural}.${a.goreli ? ` Tarih bugüne göre yazıldı (${a.deger}); her koşuda o günün tarihiyle hesaplanır, eskimez.` : ''}`,
        degisiklikler: [{ etiket: fa.etiket, deger: gosterilen }],
        beklenen: a.gecerli ? { tur: 'basari' } : hataBeklentisi(fa, false), veri, eksikler
      });
    }
  }
  if (kuralsiz.length) {
    not('sinir', `Sınır kuralı tanımlı olmayan alanlar: ${benzersiz(kuralsiz).join(', ')}. Modelde alana kural ("sinirlar": en az / en çok, uzunluk, tarih aralığı, desen) eklenirse sınır değer önerileri üretilir; kural olmadan değer tahmin edilmez.`);
  }

  /** Sınır adayları: { deger, etiket, aciklama, kural, gecerli, goreli?, ic? } — ic: sınırın hemen içi (denklik gereği elenir). */
  function sinirAdaylari(fa, h, s, tabanDeger) {
    /** @type {any[]} */
    const liste = [];
    const ekle = (x) => { if (!liste.some((y) => duz(y.deger) === duz(x.deger))) liste.push(x); };
    if (h.tip === 'sayi') {
      const alt = typeof s.enAz === 'number' ? s.enAz : null;
      const ust = typeof s.enCok === 'number' ? s.enCok : null;
      if (alt === null && ust === null) return liste;
      const artis = typeof s.artis === 'number' && s.artis > 0 ? s.artis : 1;
      const ondalik = Math.max(...[artis, alt ?? 0, ust ?? 0].map((n) => (String(n).split('.')[1] || '').length));
      const yuvarla = (n) => Number(n.toFixed(ondalik));
      const kural = [alt !== null ? `en az ${alt}` : null, ust !== null ? `en çok ${ust}` : null].filter(Boolean).join(', ');
      const gecerli = (n) => (alt === null || n >= alt) && (ust === null || n <= ust);
      const noktalar = [
        ...(alt !== null ? [[alt - artis, 'alt sınır − 1'], [alt, 'alt sınır'], [alt + artis, 'alt sınır + 1', true]] : []),
        ...(ust !== null ? [[ust - artis, 'üst sınır − 1', true], [ust, 'üst sınır'], [ust + artis, 'üst sınır + 1']] : [])
      ];
      for (const [n, etiket, ic] of noktalar) {
        const d = yuvarla(n);
        ekle({ deger: d, etiket, aciklama: `= ${d} (${etiket}; ${gecerli(d) ? 'geçerli' : 'geçersiz'})`, kural, gecerli: gecerli(d), ic: Boolean(ic) });
      }
      return liste;
    }
    if (h.tip === 'tarih') {
      const alt = s.enAz !== undefined ? tarihCoz(s.enAz, simdi) : null;
      const ust = s.enCok !== undefined ? tarihCoz(s.enCok, simdi) : null;
      if (!alt && !ust) return liste;
      const kural = [alt ? `en erken ${s.enAz}` : null, ust ? `en geç ${s.enCok}` : null].filter(Boolean).join(', ');
      const gecerli = (t) => (!alt || gunSayisi(t) >= gunSayisi(alt.tarih)) && (!ust || gunSayisi(t) <= gunSayisi(ust.tarih));
      const noktalar = [
        ...(alt ? [[gunEkle(alt.tarih, -1), 'en erken − 1 gün', alt.goreli], [alt.tarih, 'en erken', alt.goreli], [gunEkle(alt.tarih, 1), 'en erken + 1 gün', alt.goreli, true]] : []),
        ...(ust ? [[gunEkle(ust.tarih, -1), 'en geç − 1 gün', ust.goreli, true], [ust.tarih, 'en geç', ust.goreli], [gunEkle(ust.tarih, 1), 'en geç + 1 gün', ust.goreli]] : [])
      ];
      for (const [t, etiket, goreli, ic] of noktalar) {
        // Sınır bugüne göreyse öneri de bugüne göre yazılır ("bugün+1"): tarih geçince senaryo kırılmaz.
        const fark = gunSayisi(t) - gunSayisi(simdi);
        const d = goreli ? (fark === 0 ? 'bugün' : `bugün${fark > 0 ? '+' : '-'}${Math.abs(fark)}`) : tarihYaz(t, fa.bicim);
        const durum = `${etiket}; ${gecerli(t) ? 'geçerli' : 'geçersiz'}`;
        ekle({ deger: d, etiket, aciklama: goreli ? `= ${d} → ${tarihYaz(t, fa.bicim)} (${durum})` : `= ${d} (${durum})`, kural, gecerli: gecerli(t), goreli, ic: Boolean(ic) });
      }
      return liste;
    }
    // metin: uzunluk (+ desen)
    const n = Number.isInteger(s.enAzUzunluk) ? s.enAzUzunluk : null;
    const m = Number.isInteger(s.enCokUzunluk) ? s.enCokUzunluk : null;
    let desen = null;
    if (typeof s.desen === 'string' && s.desen) { try { desen = new RegExp(`^(?:${s.desen})$`, 'u'); } catch { desen = null; } }
    if (n === null && m === null) {
      if (desen) not('sinir', `"${fa.etiket}" için yalnız desen kuralı var: desene uyan / uymayan değer üretilmez; örnekleri siz yazın.`);
      return liste;
    }
    const kural = [n !== null ? `en az ${n} karakter` : null, m !== null ? `en çok ${m} karakter` : null, desen ? `desen /${s.desen}/` : null].filter(Boolean).join(', ');
    const tohum = typeof tabanDeger === 'string' && tabanDeger.trim() && !tabloBasvurusuMu(tabanDeger) ? tabanDeger.trim() : 'a';
    const dolgu = (uzunluk) => tohum.repeat(Math.ceil(uzunluk / tohum.length)).slice(0, uzunluk);
    const uzunlukGecerli = (u) => (n === null || u >= n) && (m === null || u <= m);
    const noktalar = [
      ...(n !== null ? [[n - 1, 'en kısa − 1'], [n, 'en kısa'], [n + 1, 'en kısa + 1', true]] : []),
      ...(m !== null ? [[m - 1, 'en uzun − 1', true], [m, 'en uzun'], [m + 1, 'en uzun + 1']] : [])
    ];
    let desenSorunu = false;
    for (const [u, etiket, ic] of noktalar) {
      if (u < 1) continue; // 0 karakter = boş: zorunlu alan önerisinin konusu
      const d = dolgu(u);
      const uzunlukOk = uzunlukGecerli(u);
      if (uzunlukOk && desen && !desen.test(d)) { desenSorunu = true; continue; }
      ekle({ deger: d, etiket, aciklama: `${u} karakter (${etiket}; ${uzunlukOk ? 'geçerli' : 'geçersiz'})`, kural, gecerli: uzunlukOk, ic: Boolean(ic) });
    }
    if (desenSorunu) not('sinir', `"${fa.etiket}": geçerli uzunlukta desene uyan örnek üretilemedi; o değerleri siz yazın.`);
    return liste;
  }

  // ---- 3) Koşullu alanlar ve bağımlı listeler -------------------------------------------------------------
  const yonetenAlanlar = new Set();
  const yonetenAyarlar = new Set();
  /** Alan kimliği → görünürlüğünü yöneten alan kimlikleri (adım, bölüm, alan koşulları + bağımlı listenin üst alanı). */
  const kontrolcu = new Map();
  const gorunurlukIfadesi = (gr) => (!nesneMi(gr) ? null : typeof gr.kosul === 'string' ? model.kosullar && model.kosullar[gr.kosul] && model.kosullar[gr.kosul].ifade : gr.ifade);
  for (const adim of adimlar) {
    const adimKont = new Set();
    ifadeBasvurulari(gorunurlukIfadesi(adim.gorunurluk), adimKont, yonetenAyarlar);
    for (const x of adimKont) yonetenAlanlar.add(x);
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      if (!nesneMi(b)) continue;
      const bolumKont = new Set(adimKont);
      ifadeBasvurulari(gorunurlukIfadesi(b.gorunurluk), bolumKont, yonetenAyarlar);
      for (const x of bolumKont) yonetenAlanlar.add(x);
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) {
        if (!nesneMi(a)) continue;
        const k = new Set(bolumKont);
        ifadeBasvurulari(gorunurlukIfadesi(a.gorunurluk), k, yonetenAyarlar);
        kontrolcu.set(a.id, k);
        for (const x of k) yonetenAlanlar.add(x);
      }
    }
  }
  for (const a of nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : []) {
    if (nesneMi(a)) ifadeBasvurulari(gorunurlukIfadesi(a.gorunurluk), yonetenAlanlar, yonetenAyarlar);
  }
  for (const fa of formAlanlari) {
    if (fa.tip === 'secim' && fa.bagimlilik) {
      yonetenAlanlar.add(fa.bagimlilik.alan);
      if (!kontrolcu.has(fa.id)) kontrolcu.set(fa.id, new Set());
      kontrolcu.get(fa.id).add(fa.bagimlilik.alan);
    }
  }
  /** Yöneten: { fa (form alanı ya da adım kapsamı ayarı), degerler }. */
  const yonetenler = [];
  for (const id of yonetenAlanlar) {
    const fa = alanById(id);
    if (!fa || dokunulmazMi(fa)) continue;
    if (fa.tip === 'onayKutusu') yonetenler.push({ fa, degerler: [true, false] });
    else if (fa.tip === 'secim') {
      const ust = fa.bagimlilik ? formAlanlari.find((x) => x.id === fa.bagimlilik.alan) : null;
      const liste = fa.bagimlilik ? (ust && fa.bagimlilik.harita[duz(tabanVeri[ust.anahtar])]) || [] : fa.secenekler || [];
      if (liste.length > KOSUL_DAL_SINIRI) not('kosullu', `"${fa.etiket}" alanının ${liste.length} seçeneği var; ilk ${KOSUL_DAL_SINIRI} dal değerlendirildi.`);
      if (liste.length) yonetenler.push({ fa, degerler: liste.slice(0, KOSUL_DAL_SINIRI).map((x) => x.deger) });
    }
  }
  for (const id of yonetenAyarlar) {
    const k = sema.adimKapsami.find((x) => x.alanId === id || x.ayar === id);
    if (k && !yonetenler.some((y) => y.fa.anahtar === k.ayar)) yonetenler.push({ fa: { id: k.alanId, anahtar: k.ayar, etiket: k.etiket, tip: 'onayKutusu', zorunlu: false, adimId: null }, degerler: [true, false] });
  }
  /** Kapsam ölçüsü için dal sınıfları: { etiket, kapsandi }. */
  const dalSiniflari = [];
  /** Birleştirme için denenmemiş dallar: anahtar=normal değer → kosullu aday kimliği. */
  const denenmemisDallar = [];
  for (const { fa, degerler } of yonetenler) {
    const dallar = degerler.map((v) => {
      const veri = kopya(tabanVeri);
      veri[fa.anahtar] = v;
      bagimlilariAyarla(veri, fa);
      return { v, veri, gr: gorunurluk(veri) };
    });
    const digerleri = formAlanlari.filter((x) => x.id !== fa.id);
    const etkilenen = digerleri.filter((x) => new Set(dallar.map((d) => gorunurMu(d.gr, x))).size > 1);
    const etkilenenAdimlar = sema.adimlar.filter((a) => new Set(dallar.map((d) => d.gr.adimlar[a.id] !== false)).size > 1);
    const bagliListeler = bagimlilar(fa);
    if (!etkilenen.length && !etkilenenAdimlar.length && !bagliListeler.length) continue;
    const metin = (v) => (fa.tip === 'onayKutusu' ? (v ? 'işaretli' : 'işaretsiz') : secenekMetni(fa, v));
    const dalDenendi = (v) => denendiMi((x) => (fa.tip === 'onayKutusu' ? (x[fa.anahtar] === true) === (v === true) : !bosMu(x[fa.anahtar]) && duz(x[fa.anahtar]) === duz(v)));
    // Denklik: aynı etki (görünen alanlar, adımlar, bağlı listelerin seçenekleri) = aynı sınıf.
    const siniflar = new Map();
    for (const d of dallar) {
      const imza = JSON.stringify([
        etkilenen.filter((x) => gorunurMu(d.gr, x)).map((x) => x.id),
        etkilenenAdimlar.map((a) => d.gr.adimlar[a.id] !== false),
        bagliListeler.map((b) => (b.bagimlilik.harita[duz(d.v)] || []).map((x) => x.deger))
      ]);
      if (!siniflar.has(imza)) siniflar.set(imza, []);
      siniflar.get(imza).push(d);
    }
    for (const uyeler of siniflar.values()) {
      const kapsandi = uyeler.some((d) => dalDenendi(d.v));
      const d = uyeler[0];
      dalSiniflari.push({ etiket: `${fa.etiket} = ${metin(d.v)}`, kapsandi });
      if (kapsandi) { elenen.kapsanan += uyeler.length; continue; }
      elenen.denklik += uyeler.length - 1;
      const gorunen = etkilenen.filter((x) => gorunurMu(d.gr, x));
      const gorunmeyen = etkilenen.filter((x) => !gorunurMu(d.gr, x));
      const zorunlular = gorunen.filter((x) => x.zorunlu === true);
      const { eksikler } = sonlandir(d.veri);
      const parcalar = [
        gorunen.length ? `görünür: ${gorunen.map((x) => x.etiket).join(', ')}` : null,
        gorunmeyen.length ? `görünmez: ${gorunmeyen.map((x) => x.etiket).join(', ')}` : null,
        ...etkilenenAdimlar.map((a) => `"${a.baslik}" adımı ${d.gr.adimlar[a.id] === false ? 'koşulmaz' : 'koşulur'}`),
        zorunlular.length ? `bu dalda zorunlu: ${zorunlular.map((x) => x.etiket).join(', ')}` : null,
        ...bagliListeler.map((b) => {
          const liste = b.bagimlilik.harita[duz(d.v)] || [];
          return `${b.etiket} seçenekleri: ${liste.length ? liste.slice(0, 6).map((x) => x.metin).join(', ') + (liste.length > 6 ? ` (+${liste.length - 6})` : '') : 'yok'}`;
        })
      ].filter(Boolean);
      const etki = gorunen.length ? `${gorunen.map((x) => x.etiket).join(', ')} görünür` : gorunmeyen.length ? `${gorunmeyen.map((x) => x.etiket).join(', ')} görünmez` : parcalar[0] || '';
      const kimlik = `kosullu:${fa.anahtar}=${duz(d.v)}`;
      denenmemisDallar.push({ anahtar: fa.anahtar, deger: normal(fa, d.v), kimlik, etiket: `${fa.etiket} = ${metin(d.v)}` });
      adayEkle({
        tur: 'kosullu', neden: 'kapsam', kimlik, baslik: `Koşul: ${fa.etiket} = ${metin(d.v)}`, alanlar: [fa.id],
        gerekce: `“${fa.etiket} = ${metin(d.v)}” dalı hiç denenmedi${etki ? ` (${etki})` : ''}`,
        ic: Math.min(99, 10 * (etkilenen.length + etkilenenAdimlar.length + bagliListeler.length)),
        ozet: `"${fa.etiket}" ${metin(d.v)} seçilince ${parcalar.join('; ')}.`,
        degisiklikler: [{ etiket: fa.etiket, deger: metin(d.v) }, ...bagliListeler.filter((b) => !bosMu(d.veri[b.anahtar])).map((b) => ({ etiket: b.etiket, deger: gosterim(b, d.veri[b.anahtar]) }))],
        beklenen: { tur: 'basari' }, veri: d.veri, eksikler
      });
    }
  }

  // ---- 4) Pairwise (ikili kombinasyonlar) ------------------------------------------------------------------
  const tumSecenekler = (fa) => {
    if (fa.tip === 'onayKutusu') return ['true', 'false'];
    const liste = fa.bagimlilik ? Object.values(fa.bagimlilik.harita).flat() : fa.secenekler || [];
    return benzersiz(liste.map((x) => duz(x.deger)).filter(Boolean));
  };
  const secilebilir = ekranAlanlari
    .filter((fa) => !dokunulmazMi(fa) && ((fa.tip === 'secim' && tumSecenekler(fa).length > 1) || (fa.tip === 'onayKutusu' && yonetenAlanlar.has(fa.id))))
    .map((fa) => ({ id: fa.id, etiket: fa.etiket, secenekSayisi: tumSecenekler(fa).length, yoneten: yonetenAlanlar.has(fa.id) }));
  const varsayilanSecim = [...secilebilir.filter((x) => x.yoneten), ...secilebilir.filter((x) => !x.yoneten)].slice(0, KOMBINASYON_ALAN_SINIRI).map((x) => x.id);
  const istenen = Array.isArray(g.kombinasyonAlanlari)
    ? benzersiz(g.kombinasyonAlanlari).filter((id) => secilebilir.some((x) => x.id === id))
    : varsayilanSecim;
  if (istenen.length > KOMBINASYON_ALAN_SINIRI) not('kombinasyon', `İkili kombinasyonda en çok ${KOMBINASYON_ALAN_SINIRI} alan kullanılır; ilk ${KOMBINASYON_ALAN_SINIRI} alan alındı.`);
  const seciliAlanlar = ekranAlanlari.filter((fa) => istenen.slice(0, KOMBINASYON_ALAN_SINIRI).includes(fa.id));
  const seciliAnahtarlar = new Set(seciliAlanlar.map((x) => x.anahtar));
  const alanByAnahtar = (a) => formAlanlari.find((x) => x.anahtar === a);
  const kombinasyon = {
    secilebilir: secilebilir.map(({ id, etiket, secenekSayisi }) => ({ id, etiket, secenekSayisi, varsayilan: varsayilanSecim.includes(id) })),
    secili: seciliAlanlar.map((x) => x.id), alanSiniri: KOMBINASYON_ALAN_SINIRI,
    evren: 0, kapsanan: 0, eksik: 0, gecersiz: 0, satir: 0, kalan: 0
  };
  /** Pairwise satırı (seçili alanların normal değerleri) → senaryo verisi. */
  const veriye = (satir) => {
    const v = kopya(tabanVeri);
    for (const fa of seciliAlanlar) {
      const d = satir[fa.anahtar];
      if (fa.tip === 'onayKutusu') v[fa.anahtar] = d === 'true';
      else if (bosMu(d)) { if (!tabloBasvurusuMu(v[fa.anahtar])) delete v[fa.anahtar]; }
      else v[fa.anahtar] = d;
    }
    for (const fa of seciliAlanlar) bagimlilariAyarla(v, fa, new Set(seciliAlanlar.map((x) => x.id)));
    return v;
  };
  const ikiliEtiketi = (k) => ikiliCoz(k).map(([a, v]) => { const fa = alanByAnahtar(a); return `${fa.etiket}: ${degerMetni(fa, v)}`; });
  let pairwise = null;
  if (seciliAlanlar.length >= 2) {
    const secenekleri = (satir, a) => {
      const fa = alanByAnahtar(a);
      if (fa.tip === 'onayKutusu') return ['true', 'false'];
      if (!fa.bagimlilik) return tumSecenekler(fa).slice(0, KOMBINASYON_DEGER_SINIRI);
      const ust = formAlanlari.find((x) => x.id === fa.bagimlilik.alan);
      const ustDeger = ust ? (seciliAnahtarlar.has(ust.anahtar) ? satir[ust.anahtar] : duz(tabanVeri[ust.anahtar])) : '';
      return (fa.bagimlilik.harita[ustDeger] || []).map((x) => duz(x.deger)).filter(Boolean).slice(0, KOMBINASYON_DEGER_SINIRI);
    };
    for (const fa of seciliAlanlar) if (tumSecenekler(fa).length > KOMBINASYON_DEGER_SINIRI) not('kombinasyon', `"${fa.etiket}" alanının ilk ${KOMBINASYON_DEGER_SINIRI} değeri kullanıldı.`);
    /** Değeri yazar; seçili bağımlıları (sabit değilse) yeni listeye uydurur; geçersizse null. */
    const ata = (satir, a, v, sabit) => {
      if (!secenekleri(satir, a).includes(v)) return null;
      const r = { ...satir, [a]: v };
      const duzelt = (ustAnahtar) => {
        const ust = alanByAnahtar(ustAnahtar);
        for (const d of bagimlilar(ust)) {
          if (!seciliAnahtarlar.has(d.anahtar)) continue;
          const liste = secenekleri(r, d.anahtar);
          if (!liste.includes(r[d.anahtar])) {
            if (sabit.has(d.anahtar)) return false;
            r[d.anahtar] = liste[0] ?? '';
          }
          if (!duzelt(d.anahtar)) return false;
        }
        return true;
      };
      return duzelt(a) ? r : null;
    };
    const tabanSatiri = {};
    for (const fa of seciliAlanlar) tabanSatiri[fa.anahtar] = normal(fa, tabanVeri[fa.anahtar]);
    const veridenIkililer = (veri) => {
      const gr = gorunurluk(veri);
      const liste = [];
      for (let i = 0; i < seciliAlanlar.length; i++) {
        const a = seciliAlanlar[i];
        const av = normal(a, veri[a.anahtar]);
        if (!gorunurMu(gr, a) || !av || (a.tip !== 'onayKutusu' && !(a.anahtar in veri))) continue;
        for (let j = i + 1; j < seciliAlanlar.length; j++) {
          const b = seciliAlanlar[j];
          const bv = normal(b, veri[b.anahtar]);
          if (gorunurMu(gr, b) && bv && (b.tip === 'onayKutusu' || b.anahtar in veri)) liste.push(ikiliAnahtari(a.anahtar, av, b.anahtar, bv));
        }
      }
      return liste;
    };
    const kapsananIkililer = denenenler.flatMap(({ veri }) => veridenIkililer(veri));
    const degerAgirligi = (a, v) => degerRiski.get(`${a}=${v}`) ?? 0;
    pairwise = pairwiseUret({
      alanlar: seciliAlanlar.map((fa) => ({ anahtar: fa.anahtar, degerler: tumSecenekler(fa).slice(0, KOMBINASYON_DEGER_SINIRI) })),
      taban: tabanSatiri,
      secenekler: secenekleri,
      ata,
      gorunurler: (satir) => {
        const gr = gorunurluk(veriye(satir));
        return new Set(seciliAlanlar.filter((fa) => gorunurMu(gr, fa)).map((fa) => fa.anahtar));
      },
      kontrolculer: (a) => {
        const fa = alanByAnahtar(a);
        const sonuc = new Set();
        const gez = (id) => {
          for (const k of kontrolcu.get(id) || []) {
            const x = alanById(k);
            if (x && !sonuc.has(x.anahtar)) { sonuc.add(x.anahtar); gez(x.id); }
          }
        };
        gez(fa.id);
        return [...sonuc];
      },
      gecerliMi: g.dogrula
        ? (satir) => !g.dogrula({ [sema.baslik]: 'x', ...veriye(satir) }).hatalar.some((h) => seciliAnahtarlar.has(String(h.alan).split('.')[0]))
        : undefined,
      agirlik: (k) => { const [[a, av], [b, bv]] = ikiliCoz(k); return degerAgirligi(a, av) + degerAgirligi(b, bv); },
      kapsanan: kapsananIkililer
    });
    Object.assign(kombinasyon, {
      evren: pairwise.evren.length, kapsanan: pairwise.kapsanan.length, eksik: pairwise.evren.length - pairwise.kapsanan.length,
      gecersiz: pairwise.gecersiz.length, satir: pairwise.satirlar.length, kalan: pairwise.kalan.length
    });
    if (pairwise.kalan.length) not('kombinasyon', `${pairwise.kalan.length} eksik ikili hesap sınırı (${PAIRWISE_SATIR_SINIRI} satır) nedeniyle önerilmedi; daha az alan seçin.`);
    for (const { satir, yeniIkililer } of pairwise.satirlar) {
      const veri = veriye(satir);
      const { eksikler } = sonlandir(veri);
      const degisiklikler = farklar(veri);
      const riskli = yeniIkililer.map((k) => ({ k, w: ikiliCoz(k).reduce((t, [a, v]) => t + degerAgirligi(a, v), 0) })).filter((x) => x.w > 0);
      const ilk = yeniIkililer.slice(0, 2).map((k) => { const [x, y] = ikiliEtiketi(k); return `“${x}” ile “${y}”`; });
      const ek = yeniIkililer.length > 2 ? ` (+${yeniIkililer.length - 2} ikili daha)` : '';
      let gerekce = `${ilk.join('; ')} hiç birlikte denenmedi${ek}`;
      let neden = 'pairwise';
      let ic = Math.min(99, 3 * yeniIkililer.length);
      if (riskli.length) {
        const enRiskli = [...riskli].sort((x, y) => y.w - x.w)[0];
        const [[ra, rv], [rb, rbv]] = ikiliCoz(enRiskli.k);
        const [ad, v] = degerAgirligi(ra, rv) >= degerAgirligi(rb, rbv) ? [ra, rv] : [rb, rbv];
        const fa = alanByAnahtar(ad);
        const [x, y] = ikiliEtiketi(enRiskli.k);
        gerekce = `“${fa.etiket}: ${degerMetni(fa, v)}” son ${hataGunu} günde ${degerAgirligi(ad, v)} başarısız koşuda yer aldı; “${x}” ile “${y}” hiç birlikte denenmedi${yeniIkililer.length > 1 ? ` (+${yeniIkililer.length - 1} ikili daha)` : ''}`;
        neden = 'risk';
        ic = Math.min(99, 10 * enRiskli.w);
      }
      const parcalar = degisiklikler.map((d) => `${d.etiket} = ${d.deger}`);
      adayEkle({
        // Kimlik yalnız satırda kalan (görünen) seçili alanlardan: gizli kalan alanın değeri önemsizdir.
        tur: 'kombinasyon', neden, kimlik: `kombinasyon:${seciliAlanlar.filter((fa) => fa.anahtar in veri).map((fa) => `${fa.anahtar}=${normal(fa, veri[fa.anahtar])}`).join('|')}`,
        baslik: `Kombinasyon: ${parcalar.join(', ') || 'taban değerleri'}`, alanlar: benzersiz(yeniIkililer.flatMap((k) => ikiliCoz(k).map(([a]) => alanByAnahtar(a).id))),
        gerekce, ic, ikililer: yeniIkililer,
        ozet: `${yeniIkililer.length} eksik ikiliyi kapatır; diğer alanlar ${tabanMetni}.`,
        degisiklikler, beklenen: { tur: 'basari' }, veri, eksikler,
        satir
      });
    }
  }

  // Denenmemiş koşul dalı bir pairwise satırında zaten varsa ayrı öneri kalmaz: satır dalı da kapsar (gerekçesine eklenir, önceliği dal).
  for (const dal of denenmemisDallar) {
    const satirOnerisi = adaylar.find((o) => o.tur === 'kombinasyon' && o.satir && o.satir[dal.anahtar] === dal.deger && seciliAnahtarlar.has(dal.anahtar));
    const i = adaylar.findIndex((o) => o.kimlik === dal.kimlik);
    if (!satirOnerisi || i < 0) continue;
    const kosullu = adaylar[i];
    adaylar.splice(i, 1);
    elenen.denklik++;
    if (satirOnerisi.neden !== 'risk') { satirOnerisi.neden = 'kapsam'; satirOnerisi.ic = Math.max(satirOnerisi.ic, kosullu.ic); }
    satirOnerisi.alanlar = benzersiz([...satirOnerisi.alanlar, ...kosullu.alanlar]);
    satirOnerisi.dallar = [...(satirOnerisi.dallar || []), dal.etiket];
  }
  for (const o of adaylar) {
    if (!o.dallar) continue;
    const liste = o.dallar.map((d) => `“${d}”`).join(' ve ');
    o.gerekce = `${liste} ${o.dallar.length > 1 ? 'dalları' : 'dalı'} hiç denenmedi; ${o.gerekce}`;
  }

  // ---- 5) Görülen iş kuralı uyarıları --------------------------------------------------------------------
  const beklenenMesajlar = tumSenaryolar
    .map((s) => (bs && nesneMi(s.veri[bs.anahtar]) && s.veri[bs.anahtar].tip === bs.hataTipi && bs.mesajAnahtari ? normalMetin(s.veri[bs.anahtar][bs.mesajAnahtari]) : ''))
    .filter(Boolean);
  const uyarilar = (Array.isArray(gecmis.uyarilar) ? gecmis.uyarilar : []).filter((u) => nesneMi(u) && !bosMu(u.metin));
  const uyariOlcusu = [];
  for (const u of uyarilar) {
    const n = normalMetin(u.metin);
    const test = u.beklenen === true || beklenenMesajlar.some((m) => n.includes(m) || m.includes(n));
    uyariOlcusu.push({ etiket: kisalt(u.metin, 80), kapsandi: test });
    if (test) { elenen.kapsanan++; continue; }
    const tetikleyen = (Array.isArray(u.senaryoIdleri) ? u.senaryoIdleri : []).map((id) => senaryolar.find((s) => s.id === id)).find(Boolean) || null;
    const veri = tetikleyen ? { ...temizle(tetikleyen.veri), ...(bilerekBos(tetikleyen.veri).length ? { [BILEREK_BOS]: [...bilerekBos(tetikleyen.veri)] } : {}) } : kopya(tabanVeri);
    const { eksikler } = sonlandir(veri, bilerekBos(veri));
    const adim = adimBul(u.adim);
    const maskeli = /•{3,}/.test(String(u.metin));
    /** @type {any} */
    let beklenen;
    if (!bs || !bs.hataTipi || !bs.mesajAnahtari) beklenen = { tur: 'belirsiz', neden: 'Modelin beklenen sonucunda iş kuralı hatası / mesaj seçeneği yok; beklenen sonucu siz seçin.' };
    else if (bs.adimAnahtari && (!adim || !bs.adimlar.some((s) => s.deger === adim.id))) beklenen = { tur: 'belirsiz', neden: `Uyarının görüldüğü adım ("${u.adim ?? '—'}") modelin beklenen sonuç adımlarında yok; beklenen sonucu siz seçin.` };
    else beklenen = { tur: 'hata', adim: adim ? adim.id : '', adimBasligi: adim ? adimBasligi(adim.id) : '', mesaj: String(u.metin).trim(), mesajEksik: false };
    const engel = maskeli ? 'Uyarı metninde maskelenmiş bir parça var; önizlemede beklenen mesajı düzeltin.'
      : !tetikleyen ? 'Uyarıyı tetikleyen senaryo bu akışta yok; değerleri önizlemede uyarıyı tetikleyecek şekilde girin.' : null;
    adayEkle({
      tur: 'uyari', neden: 'risk', kimlik: `uyari:${n.slice(0, 120)}`, baslik: `Uyarı beklenir: ${kisalt(u.metin, 50)}`, alanlar: [],
      gerekce: `“${kisalt(u.metin)}” uyarısını beklenen sonuç olarak taşıyan senaryo yok (son ${uyariGunu} günde ${u.sayi ?? 1} kez görüldü)`,
      ic: Math.min(99, 10 * (Number(u.sayi) || 1)),
      ozet: tetikleyen ? `"${tetikleyen.baslik}" senaryosunun değerleriyle; bu uyarı hata olarak beklenir.` : `Taban değerleriyle; bu uyarı hata olarak beklenir.`,
      degisiklikler: tetikleyen ? farklar(veri) : [], beklenen, veri, eksikler, engel
    });
  }

  // ---- Puan, kararlar, tekilleştirme, sıralama ----------------------------------------------------------
  const agirliklar = kararAgirliklari(g.kararlar || [], g.ekranId || null);
  const kararlar = (Array.isArray(g.kararlar) ? g.kararlar : []).filter((k) => nesneMi(k) && (!g.ekranId || !k.ekranId || k.ekranId === g.ekranId));
  const simdiMs = simdi.getTime();
  /** @type {any[]} */
  let tumu = [];
  const icerikler = new Map();
  for (const o of adaylar) {
    const puan = oneriPuani(o.neden, o.ic, agirliklar.carpan(o.tur, o.alanlar));
    const red = oneriRedDurumu(kararlar, o.kimlik, simdiMs);
    if (red && !g.reddedilenleriGoster) { elenen[red]++; continue; }
    const veri = { [sema.baslik]: o.baslik, ...o.veri };
    if (o.beklenen.tur === 'hata' && bs) {
      veri[bs.anahtar] = {
        tip: bs.hataTipi, ...(bs.adimAnahtari ? { [bs.adimAnahtari]: o.beklenen.adim } : {}), ...(bs.mesajAnahtari ? { [bs.mesajAnahtari]: o.beklenen.mesaj } : {})
      };
    }
    const eksikler = benzersiz(o.eksikler || []);
    const oneri = {
      kimlik: o.kimlik, tur: o.tur, neden: o.neden, gerekce: o.gerekce, puan, baslik: o.baslik, ozet: o.ozet, degisiklikler: o.degisiklikler,
      beklenen: o.beklenen, beklenenMetni: beklenenMetni(o.beklenen), veri, tabloSecimleri: kopya(tabloSecimleri), eksikler, engel: o.engel || null,
      alanlar: o.alanlar, ...(o.ikililer ? { ikililer: o.ikililer.map((k) => ikiliEtiketi(k).join(' + ')) } : {}), ...(o.dallar ? { dallar: o.dallar } : {}),
      eklenebilir: o.beklenen.tur !== 'belirsiz' && !eksikler.length && !o.engel, reddedildi: Boolean(red), sira: o.sira
    };
    // Aynı içerik (başlık hariç veri + beklenen) birden çok türden geldiyse yüksek puanlı kalır.
    const { [sema.baslik]: _b, ...icerik } = veri;
    const imza = JSON.stringify(icerik);
    const onceki = icerikler.get(imza);
    if (onceki) {
      elenen.denklik++;
      if (onceki.puan >= oneri.puan) continue;
      tumu = tumu.filter((x) => x !== onceki);
    }
    icerikler.set(imza, oneri);
    tumu.push(oneri);
  }
  tumu.sort((a, b) => b.puan - a.puan || a.sira - b.sira);
  const oneriler = tumu.slice(0, ustSinir).map(({ sira: _s, ...o }) => o);

  // ---- Kapsam ölçüleri ----------------------------------------------------------------------------------
  const alanOlcusu = ekranAlanlari.filter((fa) => BASIT_TIPLER.includes(fa.tip) || ['profil', 'kimlik'].includes(fa.tip))
    .map((fa) => ({ etiket: fa.etiket, kapsandi: denendiMi((v) => (fa.tip === 'onayKutusu' ? fa.anahtar in v : !bosMu(v[fa.anahtar])) || bilerekBos(v).includes(fa.anahtar)) }));
  const olcu = (liste, eksikSiniri = 50) => ({
    kapsanan: liste.filter((x) => x.kapsandi).length, toplam: liste.length, eksikler: liste.filter((x) => !x.kapsandi).slice(0, eksikSiniri).map((x) => x.etiket)
  });
  const ikiliOlcusu = pairwise ? {
    kapsanan: pairwise.kapsanan.length, toplam: pairwise.evren.length,
    eksikler: pairwise.evren.filter((k) => !pairwise.kapsanan.includes(k)).slice(0, 50).map((k) => ikiliEtiketi(k).join(' + '))
  } : { kapsanan: 0, toplam: 0, eksikler: [] };
  const kapsam = { alanlar: olcu(alanOlcusu), dallar: olcu(dalSiniflari), ikililer: ikiliOlcusu, uyarilar: olcu(uyariOlcusu) };

  if (elenen.kapsanan) not('elenen', `${elenen.kapsanan} öneri mevcut senaryolarca zaten denendiği için gösterilmedi.`);
  return { taban, oneriler, toplam: tumu.length, kalan: Math.max(0, tumu.length - oneriler.length), ustSinir, notlar, kombinasyon, kapsam, elenen };
}
