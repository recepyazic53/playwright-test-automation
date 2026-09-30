// HIZLI TEST — SAF KURALLAR (DOM yok, veritabanı yok; sunucu ve birim testleri ortak). Genel: ürün / şirket adı, kurala özgü sabit yok.
//
//  - cumleyiOku: "Ne yapılsın?" cümlesi YZ OLMADAN kalıpla okunur: tırnak içindeki metin beklenen mesaj adayı, "…'e bas / …'a tıkla /
//    …'yı seç" düğme adayı. Anlaşılmayan kısım yok sayılır.
//  - basmaKarari: izin (evet / sor / hayir) + aday sayısı → bas / sor / basma.
//  - metinTuru / varsayilanEtiketler: bitiş etiketleri önerisi (H2): son basıştan sonra görülen metin Bitti, bekleme metinleri
//    ("…ıyor", "Lütfen bekleyin", eylem keşfinin bekleme adayları) Devam, uyarı / hata kutusu metinleri Hata. Kullanıcı değiştirir.
//  - kayitEnvanteriKur: oturumun zinciri (adımlar: alanlar → düğme) → akış kaydı envanteri (paket-olusturucu.mjs > kayitPaketiOlustur
//    ile AYNI ekran paketi yolu); bitisiUygula: son adıma bitiş koşulu (Bitti → basariGostergesi, Hata → uyarilar, Devam →
//    bitisKosulu.devam, adres → url göstergesi).
//  - senaryoVerisiKur: model alanlarının senaryo anahtarlarına değerler (tablo başvuruları "${Tablo.Sütun}" olduğu gibi).
// Hiçbir fonksiyon DEĞER ÜRETMEZ: değerler yalnız kullanıcının yazdığı ya da tablodan seçtiğidir.
// NOT: import.meta KULLANILMAZ. Tipler: akis.d.mts.
import { KALIPLAR, katla } from '../tarama/eylem-kesfi.mjs';

/** Basma izinleri. */
export const IZINLER = Object.freeze(['evet', 'sor', 'hayir']);
/** İzinlerin kullanıcıya görünen adları. */
export const IZIN_ADLARI = Object.freeze({ evet: 'Evet', sor: 'Bana sor', hayir: 'Hayır' });
/** Bitiş etiketleri. */
export const ETIKETLER = Object.freeze(['bitti', 'devam', 'hata']);
export const ETIKET_ADLARI = Object.freeze({ bitti: 'Bitti', devam: 'Devam', hata: 'Hata' });
/** Basıştan sonra ve koşuda sonucu en çok bekleme (sn). */
export const BITIS_BEKLEME_SN = 60;
/** Bitti / Hata / Devam metinlerinde en çok. */
export const ETIKET_EN_COK = 5;
const METIN_EN_UZUN = 200;

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @param {unknown} m */
const bosluk = (m) => (typeof m === 'string' ? m.replace(/\s+/g, ' ').trim() : '');

/**
 * CANLI ortamda bir kez sorulan onayın metni (kilit yok; kullanıcı onaylarsa sürer).
 * @param {string} izin
 */
export function canliOnayMetni(izin) {
  return izin === 'hayir'
    ? 'CANLI ortama bağlanılacak (giriş dahil). Hiçbir düğmeye basılmaz.'
    : 'CANLI ortamda düğmelere basılacak, kayıt oluşabilir.';
}

/**
 * "Ne yapılsın?" cümlesi (YZ YOK). Tırnak içindeki metinler ("…", “…”, '…', «…») beklenen mesaj adayı; "X'e bas", "X'a tıkla",
 * "X düğmesine bas" düğme adayı (X tırnaklıysa tırnak içi). Anlaşılmayan kısımlar yok sayılır.
 * @param {unknown} cumle
 * @returns {{ mesajlar: string[]; dugmeler: string[] }}
 */
export function cumleyiOku(cumle) {
  const m = typeof cumle === 'string' ? cumle.slice(0, 1000) : '';
  /** @type {string[]} */
  const dugmeler = [];
  /** @type {string[]} */
  const tirnaklar = [];
  const TIRNAK = /["“”«»]([^"“”«»]{1,120})["“”«»]|'([^']{1,120})'(?![a-zçğıöşü])/giu;
  for (const x of m.matchAll(TIRNAK)) tirnaklar.push(bosluk(x[1] ?? x[2]));
  // Düğme: "<ad>['’](y)?(a|e|ya|ye|na|ne) bas/tıkla" ya da "<ad> düğmesine bas". Ad tırnaklıysa tırnak içi, değilse tek sözcük.
  const EYLEM = /(?:["“”«»]([^"“”«»]{1,60})["“”«»]|'([^']{1,60})'|([\p{L}\p{N}]+))\s*(?:['’]?\s*(?:y|n)?[ae]\s+|\s+düğmesine\s+|\s+butonuna\s+)(?:bas|tıkla|tikla|basın|tıklayın|basin|tiklayin)\b/giu;
  for (const x of m.matchAll(EYLEM)) {
    const ad = bosluk(x[1] ?? x[2] ?? x[3]);
    if (ad && !dugmeler.includes(ad)) dugmeler.push(ad);
  }
  // Düğme adı olarak geçen tırnak içi mesaj adayı sayılmaz.
  const mesajlar = [...new Set(tirnaklar.filter((t) => t && !dugmeler.some((d) => katla(d) === katla(t))))];
  return { mesajlar: mesajlar.slice(0, 10), dugmeler: dugmeler.slice(0, 5) };
}

/**
 * Aday düğmelerden cümlenin adını verdiği (yoksa tek aday). Birden çok aday varsa ve cümle ayırmıyorsa null (kullanıcıya sorulur).
 * @param {Array<{ secici: string; metin: string | null }>} adaylar @param {string[]} cumleDugmeleri
 */
export function tekAday(adaylar, cumleDugmeleri = []) {
  for (const ad of cumleDugmeleri) {
    const uyan = adaylar.filter((a) => a.metin && katla(a.metin) === katla(ad));
    if (uyan.length === 1) return uyan[0];
  }
  return adaylar.length === 1 ? adaylar[0] : null;
}

/**
 * Basma kararı. evet: tek aday belliyse basılır, birden çok aday varsa sorulur; sor: her basıştan önce onay; hayir: hiç basılmaz.
 * @param {{ izin: string; adaySayisi: number; kullaniciSecti?: boolean }} g kullaniciSecti: kullanıcı düğmeyi kendisi seçti ("Devam et: X")
 * @returns {'bas' | 'sor' | 'basma'}
 */
export function basmaKarari(g) {
  if (g.izin === 'hayir') return 'basma';
  if (g.izin === 'sor') return 'sor';
  return g.kullaniciSecti || g.adaySayisi === 1 ? 'bas' : 'sor';
}

/**
 * Bekleme metni mi? Eylem keşfinin bekleme kalıbı ya da "…ıyor / …iyor / …uyor / …üyor" ile biten kısa metin, "lütfen bekleyin".
 * @param {unknown} metin
 */
export function beklemeMetniMi(metin) {
  const k = katla(metin);
  if (!k) return false;
  if (new RegExp(KALIPLAR.beklemeMetni, 'i').test(k) || /lutfen bekle/.test(k)) return true;
  const t = k.replace(/[.…\s]+$/, '');
  return t.length <= 60 && /(iyor|uyor)$/.test(t.split(' ').pop() ?? '');
}

/**
 * Görülen metinlerin varsayılan etiketleri (H2 kararı: öner, kullanıcı değiştirir).
 * @param {Array<{ metin: string; tur: string; basis: number }>} gorulenler basis: kaçıncı basıştan sonra görüldü (0 = keşif)
 * @param {number} sonBasis son basışın numarası
 * @returns {Record<string, 'bitti' | 'devam' | 'hata' | null>}
 */
export function varsayilanEtiketler(gorulenler, sonBasis) {
  /** @type {Record<string, 'bitti' | 'devam' | 'hata' | null>} */
  const e = {};
  for (const g of gorulenler) {
    if (g.tur === 'hata' || (g.tur !== 'basari' && new RegExp(KALIPLAR.hataMetni, 'i').test(katla(g.metin)))) e[g.metin] = 'hata';
    else if (g.tur === 'bekleme' || beklemeMetniMi(g.metin)) e[g.metin] = 'devam';
    else if (g.basis === sonBasis && sonBasis > 0) e[g.metin] = 'bitti';
    else e[g.metin] ??= null;
  }
  return e;
}

/** Metnin değişken (rakamlı) kısmı atılmış sabit öneki: "Tutar: 1.250 TL" → "Tutar:" (en az 3 karakter; yoksa metnin kendisi). @param {string} m */
export function sabitKisim(m) {
  const t = bosluk(m);
  const i = t.search(/\d/);
  const bas = i > 0 ? t.slice(0, i).trim() : '';
  return bas.length >= 3 ? bas : t;
}

/**
 * Oturumun seçimlerinden bitiş koşulu: Bitti / Hata / Devam metinleri (sabit kısımlarıyla), adres. Doğrulama hataları döner.
 * @param {{ etiketler: Record<string, string | null>; adres?: string | null; olumsuz?: { mesaj: string } | null }} g
 */
export function bitisKosulu(g) {
  const ayir = (/** @type {string} */ e) => [...new Set(Object.entries(g.etiketler ?? {}).filter(([, v]) => v === e).map(([k]) => sabitKisim(k)).filter(Boolean))];
  const bitti = ayir('bitti').slice(0, ETIKET_EN_COK);
  const hata = ayir('hata').slice(0, ETIKET_EN_COK);
  const devam = ayir('devam').slice(0, ETIKET_EN_COK);
  const adres = typeof g.adres === 'string' && g.adres.trim() ? g.adres.trim().slice(0, 300) : null;
  /** @type {string[]} */
  const hatalar = [];
  if (adres && !adres.startsWith('/')) hatalar.push('“Adres şu olursa bitti” bir yol olmalı (/ ile başlar).');
  const olumsuz = g.olumsuz && bosluk(g.olumsuz.mesaj) ? { mesaj: bosluk(g.olumsuz.mesaj).slice(0, METIN_EN_UZUN) } : null;
  if (olumsuz && !hata.some((h) => katla(olumsuz.mesaj).includes(katla(h)) || katla(h).includes(katla(olumsuz.mesaj)))) hatalar.push('Olumsuz senaryoda beklenen mesaj “Hata” etiketli olmalı.');
  if (!olumsuz && !bitti.length && !adres) hatalar.push('En az bir metni “Bitti” etiketleyin (ya da “Adres şu olursa bitti”yi yazın).');
  return { bitti, hata, devam, adres, olumsuz, hatalar };
}

/** Düzenli ifade kaçışı. @param {string} m */
const kacis = (m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Oturumun zinciri → akış kaydı envanteri (KayitEnvanteri). Son adımın göstergesi Bitti metinleri, tüm adımların uyarıları Hata metinleri.
 * Alanlar: değeri olan alanlar (değer DEĞİL, yapı). Boş kalan son adım (düğmesiz, alansız) atılır.
 * @param {{ adimlar: Array<{ alanlar: any[]; bas: { secici: string; metin: string | null } | null; okumalar?: Array<{ gorunen: string[]; secimler: Record<string, string> }>; kosullar?: Record<string, { secim: string; degerler: string[] }> }>;
 *   degerler: Record<string, unknown>; yol: string; baslik: string; profil: string | null }} o
 * @param {{ bitti: string[]; hata: string[] }} bitis
 */
export function kayitEnvanteriKur(o, bitis) {
  const dolu = (/** @type {any} */ a) => o.degerler[a.anahtar] !== undefined && o.degerler[a.anahtar] !== '';
  const adimlar = o.adimlar.map((a) => ({ ...a, alanlar: a.alanlar.filter(dolu) }));
  while (adimlar.length > 1 && !adimlar[adimlar.length - 1].alanlar.length && !adimlar[adimlar.length - 1].bas) adimlar.pop();
  const gosterge = (/** @type {string[]} */ l) => (!l.length ? null : l.length === 1
    ? { secici: null, metin: l[0], aranan: l[0] }
    : { secici: null, metin: l[0], aranan: l[0], veya: l.slice(1).map((m) => ({ secici: null, metin: m, aranan: m })) });
  const uyarilar = bitis.hata.map((m) => ({ secici: null, metin: m, aranan: m }));
  const son = adimlar.length - 1;
  return {
    kip: 'kayit', profil: o.profil, engellenenler: [], notlar: [], basariGostergesi: gosterge(bitis.bitti),
    adimlar: adimlar.map((a, i) => ({
      ad: i === 0 ? 'Form' : `${bosluk(adimlar[i - 1].bas?.metin) || 'Önceki düğme'} sonrası`.slice(0, 80),
      yol: o.yol, baslik: o.baslik, alanlar: a.alanlar, ilerleme: a.bas ? { secici: a.bas.secici, metin: a.bas.metin } : null,
      ...(a.okumalar?.length ? { okumalar: a.okumalar } : {}),
      // Veri durağında gözlenen koşullar (beliren alan → seçim + değer); yalnız bu adımdaki alanlar için.
      ...(a.kosullar && Object.keys(a.kosullar).some((k) => a.alanlar.some((x) => x.anahtar === k))
        ? { kosullar: Object.fromEntries(Object.entries(a.kosullar).filter(([k, v]) => a.alanlar.some((x) => x.anahtar === k) && a.alanlar.some((x) => x.anahtar === v.secim))) } : {}),
      gosterge: i === son ? gosterge(bitis.bitti) : null,
      ...(uyarilar.length ? { uyarilar } : {}), zamanAsimiSn: BITIS_BEKLEME_SN
    }))
  };
}

/**
 * Paketin modeline bitiş koşulunu uygular (son adım): Bitti (+ adres) → basariGostergesi, Devam → bitisKosulu.devam. Modeli
 * YERİNDE değiştirir ve döner. Adres göstergesi "url" düzenli ifadesi olarak yazılır (yol kaçışlı).
 * @param {Record<string, any>} model @param {{ bitti: string[]; devam: string[]; adres: string | null }} bitis
 */
export function bitisiUygula(model, bitis) {
  const adimlar = Array.isArray(model.adimlar) ? model.adimlar : [];
  const son = adimlar[adimlar.length - 1];
  if (!son) return model;
  son.kosu = nesneMi(son.kosu) ? son.kosu : {};
  /** @type {Array<Record<string, string>>} */
  const secenekler = [...bitis.bitti.map((m) => ({ tur: 'metin', deger: m })), ...(bitis.adres ? [{ tur: 'url', deger: kacis(bitis.adres) }] : [])].slice(0, 5);
  if (secenekler.length === 1) son.kosu.basariGostergesi = secenekler[0];
  else if (secenekler.length > 1) son.kosu.basariGostergesi = { tur: 'veya', secenekler };
  if (son.kosu.basariGostergesi) son.kosu.bitisKosulu = { devam: bitis.devam.slice(0, 10) };
  son.kosu.zamanAsimiSn = BITIS_BEKLEME_SN;
  // Bitiş koşulu ayrıca yazıldı: paket üreticisinin "başarı göstergesi seçilmedi" bilinmeyeni geçersizdir.
  if (Array.isArray(model.bilinmeyenler) && son.kosu.basariGostergesi) model.bilinmeyenler = model.bilinmeyenler.filter((b) => !/Başarı göstergesi seçilmedi/.test(String(b)));
  return model;
}

/**
 * Model alanı ↔ oturum alanı eşlemesi (seçiciyle; çerçeve dahil): oturum alanının anahtarı → modeldeki senaryo anahtarı.
 * @param {Record<string, any>} model @param {Array<{ anahtar: string; secici: string; cerceve?: string[]; radyolar?: Array<{ secici: string | null }> }>} alanlar
 */
export function senaryoAnahtarlari(model, alanlar) {
  /** @type {Record<string, string>} */
  const sonuc = {};
  const modelAlanlari = (Array.isArray(model.adimlar) ? model.adimlar : []).flatMap((a) => (Array.isArray(a.bolumler) ? a.bolumler : []))
    .flatMap((b) => (Array.isArray(b.alanlar) ? b.alanlar : [])).filter((x) => nesneMi(x) && x.yapilandirma === 'senaryo');
  for (const a of alanlar) {
    const cer = JSON.stringify(a.cerceve ?? []);
    const m = modelAlanlari.find((x) => nesneMi(x.konum) && (x.konum.secici === a.secici) && JSON.stringify(x.konum.cerceve ?? []) === cer);
    const anahtar = m && nesneMi(m.eslesme) && typeof m.eslesme.senaryo === 'string' ? m.eslesme.senaryo : null;
    if (anahtar) sonuc[a.anahtar] = anahtar;
  }
  return sonuc;
}

/**
 * Senaryo verisi: modelin senaryo anahtarlarına oturumun değerleri (tablo başvurusu "${Tablo.Sütun}" olduğu gibi; seçimde seçeneğin
 * değeri; onay kutusunda true / false). Olumsuz senaryoda beklenen sonuç (iş kuralı hatası + adım + mesaj).
 * @param {Record<string, any>} model @param {Record<string, string>} anahtarlar @param {Record<string, unknown>} degerler
 * @param {{ olumsuz?: { mesaj: string; adimId: string } | null; alanTurleri?: Record<string, string> }} [s]
 */
export function senaryoVerisiKur(model, anahtarlar, degerler, s = {}) {
  /** @type {Record<string, unknown>} */
  const veri = {};
  for (const [oturumAnahtari, senaryoAnahtari] of Object.entries(anahtarlar)) {
    const d = degerler[oturumAnahtari];
    if (d === undefined || d === '') continue;
    const tur = s.alanTurleri?.[oturumAnahtari];
    veri[senaryoAnahtari] = tur === 'checkbox' && typeof d !== 'string' ? d === true : tur === 'checkbox' && !/^\$\{/.test(String(d)) ? ['true', 'evet', '1'].includes(String(d).toLocaleLowerCase('tr')) : d;
  }
  if (s.olumsuz) {
    const bs = (nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : [])
      .find((a) => nesneMi(a) && a.tip === 'birlesim');
    const hataVaryanti = bs && Array.isArray(bs.varyantlar) ? bs.varyantlar.find((v) => nesneMi(v.alanlar) && Object.keys(v.alanlar).length) : null;
    if (bs && hataVaryanti) {
      const girdiler = Object.entries(hataVaryanti.alanlar);
      const adimAnahtari = girdiler.find(([, t]) => Array.isArray(/** @type {any} */ (t).secenekler))?.[0] ?? 'adim';
      const mesajAnahtari = girdiler.find(([, t]) => !Array.isArray(/** @type {any} */ (t).secenekler))?.[0] ?? 'mesaj';
      const anahtar = nesneMi(bs.eslesme) && typeof bs.eslesme.senaryo === 'string' ? bs.eslesme.senaryo : bs.id;
      veri[anahtar] = { tip: hataVaryanti.tip, [adimAnahtari]: s.olumsuz.adimId, [mesajAnahtari]: s.olumsuz.mesaj };
    }
  }
  return veri;
}

/**
 * Hayır izninde (basılmadan) bitiş seçenekleri: eylem keşfinin başarı adayları (Bitti), hata adayları (Hata), bekleme adayları (Devam)
 * ve cümledeki tırnaklı mesajlar (Bitti). Metni olmayan aday atlanır.
 * @param {{ basari?: Array<{ metin: string | null }>; hata?: Array<{ metin: string | null }>; bekleme?: Array<{ metin: string | null }> } | null} eylem
 * @param {string[]} cumleMesajlari
 * @returns {Array<{ metin: string; tur: 'basari' | 'hata' | 'bekleme'; kaynak: 'aday' | 'cumle' }>}
 */
export function adayMesajlari(eylem, cumleMesajlari = []) {
  /** @type {Array<{ metin: string; tur: 'basari' | 'hata' | 'bekleme'; kaynak: 'aday' | 'cumle' }>} */
  const l = [];
  const ekle = (/** @type {unknown} */ m, /** @type {'basari' | 'hata' | 'bekleme'} */ tur, /** @type {'aday' | 'cumle'} */ kaynak) => {
    const t = bosluk(m).slice(0, METIN_EN_UZUN);
    if (t && !l.some((x) => x.metin === t)) l.push({ metin: t, tur, kaynak });
  };
  for (const m of cumleMesajlari) ekle(m, 'basari', 'cumle');
  for (const a of eylem?.basari ?? []) ekle(a.metin, 'basari', 'aday');
  for (const a of eylem?.hata ?? []) ekle(a.metin, 'hata', 'aday');
  for (const a of eylem?.bekleme ?? []) ekle(a.metin, 'bekleme', 'aday');
  return l;
}

/**
 * Zorunlu ve boş alanlar (veri durağı akışı DURDURUR). Onay kutusu zorunluysa "işaretli" beklenir; devre dışı / salt okunur alan sayılmaz.
 * Sayfada zaten HAZIR (dolu) gelen alan, kullanıcı değer vermese de eksik sayılmaz: sayfanın kendi değeri kullanılır.
 * @param {Array<{ anahtar: string; zorunlu: boolean; devreDisi?: boolean; saltOkunur?: boolean; hazir?: boolean }>} alanlar @param {Record<string, unknown>} degerler
 */
export function eksikAlanlar(alanlar, degerler) {
  return alanlar.filter((a) => a.zorunlu && !a.hazir && !a.devreDisi && !a.saltOkunur && (degerler[a.anahtar] === undefined || degerler[a.anahtar] === '' || degerler[a.anahtar] === null));
}
