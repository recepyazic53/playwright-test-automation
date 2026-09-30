// HIZLI TEST — SAF KURALLAR (DOM yok, veritabanı yok; sunucu ve birim testleri ortak). Genel: ürün / şirket adı, kurala özgü sabit yok.
//
//  - cumleyiOku: "Ne yapılsın?" cümlesi YZ OLMADAN, kalıp gerektirmeden okunur (normal Türkçe: "Hesapla butonuna basıyorum", "Başvurunuz
//    alındı yazısını görünce bitir"; tırnak içi metin de beklenen mesaj adayı). Anlaşılmayan kısım yok sayılır.
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

// --- "Ne yapılsın?" cümle çözümleyicisi (kural tabanlı, YZ YOK) ---------------------------------------------------------------
// Kalıp gerekmez: normal Türkçe yazılır. Cümle ayraçlarla (. ; ! ? satır , "sonra" "ardından" "ve") parçalanır; her parçada
//  - düğme: "<ad> düğmesine / butonuna / tuşuna tıkla | bas | tıklıyorum | basacağım | basınca …", "Hesapla'ya bas", "Hesaplaya bas",
//    "Toplam Hesapla düğmesi" (büyük harfle başlayan ardışık sözcükler ad olur; tırnaklıysa tırnak içi),
//  - beklenen mesaj: tırnak içi metin; tırnaksız "<metin> yazısını / mesajını / metnini … görünce | görürsem | çıkınca | gelince bitir",
//    "<metin> yazısı gelmeli | çıkmalı | görünmeli", "<metin> mesajını doğrula", "<metin> görünce bitir".
// Anlaşılmayan parça yok sayılır (uydurma yok).
const FIIL = /^(?:bas(?:ıyor(?:um|uz)?|acağ(?:ım|ız)|ar(?:ım|ız|sam)|ay(?:ım)|al(?:ım)|ın|ınca|sın|mal[ıi](?:y[ıi]m)?|t[ıi]ktan|t[ıi][ğg][ıi]mda|t[ıi]m)?|t[ıi]kl[ıi]yor(?:um|uz)?|t[ıi]kla(?:yor(?:um|uz)?|yacağ(?:ım|ız)|r(?:ım|ız|sam)|yay(?:ım)|yal(?:ım)|y[ıi]n|y[ıi]nca|s[ıi]n|mal[ıi](?:y[ıi]m)?|d[ıi]ktan|d[ıi][ğg][ıi]mda|d[ıi]m)?)$/u;
const BUTON_SOZCUGU = /^(?:buton|düğme|tuş|link|bağlantı)\p{L}*$/u;
/** Ad olamayacak sözcükler (zamirler, dolgu). */
const AD_DEGIL = new Set(['bu', 'şu', 'o', 'her', 'ilk', 'son', 'buna', 'şuna', 'ona', 'bunu', 'şunu', 'onu', 'ilgili', 'tekrar', 'yine', 'bir', 'sonra', 'önce', 'artık', 'sadece', 'yalnız', 'hemen', 'gerekirse']);
/** Mesaj öbeğinin başından atılan dolgu sözcükleri. */
const MESAJ_DOLGU = new Set(['ekranda', 'sayfada', 'şu', 'şöyle', 'bir', 'eğer', 've', 'sonra', 'ardından', 'en', 'sonunda', 'artık', 'ayrıca', 'olan', 'denen', 'yazan', 'adlı', 'ile', 'da', 'de', 'ki', 'önce', 'ama', 'sonuç', 'olarak', 'yani', 'mesela', 'örneğin']);
const MESAJ_ISIM = /^(?:yaz[ıi]s[ıi]|mesaj[ıi]|metni|ifades[ıi]|bildirimi|uyar[ıi]s[ıi]|ba[şs]l[ıi][ğg][ıi])\p{L}*$/u;
const MESAJ_TETIK = /^(?:gör[üu]n(?:ce|ür(?:se)?|sün|meli|d[üu][ğg][üu]nde)|gör(?:ürsem|d[üu][ğg][üu]mde|meliyim|d[üu]kten)|görül(?:ünce|ürse|meli|d[üu][ğg][üu]nde)|çık(?:ınca|arsa|sın|malı|t[ıi][ğg][ıi]nda)|gel(?:ince|irse|sin|meli|di[ğg]inde)|belir(?:ince|irse|sin|meli|di[ğg]inde)|ol(?:unca|ursa|sun|malı)|yaz(?:ınca|arsa|ılsın|ılmalı)|doğrula\p{L}*|kontrol|bekle(?:r(?:im)?|nir|nmeli|yor(?:um)?)|beklenen)$/u;
const MESAJ_BITIRICI = /^(?:bitir\p{L}*|dur\p{L}*|bitmiş|tamam|başarılı|test\p{L}*|geç\p{L}*|say\p{L}*|kabul|kaydet\p{L}*)$/u;
/** Tetiğin kendisi "olsun / gelsin" gibi bir beklentiyse bitirici gerekmez. */
const MESAJ_BEKLENTI = /^(?:gel|çık|görün|belir|ol|yaz|doğrula|kontrol|bekle)\p{L}*$/u;

/** Sözcüğün başındaki / sonundaki noktalamayı atar. @param {string} t */
const noktalamaAt = (t) => t.replace(/^[^\p{L}\p{N}\u0001]+|[^\p{L}\p{N}\u0001]+$/gu, '');
/** @param {string} t */
const kucuk = (t) => t.toLocaleLowerCase('tr');
/** @param {string} t */
const buyukBasli = (t) => /^\p{Lu}/u.test(t);

/**
 * Düğme adı: fiilden önceki sözcüklerden. @param {string[]} parca fiilden önceki sözcükler @param {string[]} tirnaklar
 * @param {boolean} cumleBasiMi parçanın ilk sözcüğü cümle başı mı (büyük harf ayırt etmez)
 * @returns {string | null}
 */
function dugmeAdi(parca, tirnaklar, cumleBasiMi) {
  const s = [...parca];
  let butonVar = false;
  // "X butonuna", "X butonunu görünce" gibi: son düğme sözcüğünden sonrası (durum eki, tetik) adın parçası değildir.
  const butonSirasi = s.map((x) => BUTON_SOZCUGU.test(kucuk(noktalamaAt(x)))).lastIndexOf(true);
  if (butonSirasi >= 0) { s.length = butonSirasi; butonVar = true; }
  if (!s.length) return null;
  const son = s[s.length - 1];
  const tirnakli = /^\u0001(\d+)\u0001/.exec(son);
  if (tirnakli) return bosluk(tirnaklar[Number(tirnakli[1])]) || null;
  const apostrof = /['’]/.test(son);
  let ad = noktalamaAt(son.split(/['’]/)[0]);
  if (!butonVar && !apostrof && /(?:ya|ye)$/iu.test(ad) && ad.length > 4) ad = ad.slice(0, -2);
  if (!ad || AD_DEGIL.has(kucuk(ad)) || BUTON_SOZCUGU.test(kucuk(ad))) return null;
  // Büyük harfle başlayan ardışık sözcükler tek ad ("Toplam Hesapla"); cümle başındaki ilk sözcük sayılmaz (büyük harf cümle başından olabilir).
  if (buyukBasli(son)) {
    const adlar = [ad];
    for (let i = s.length - 2; i >= 0 && adlar.length < 3; i--) {
      const t = noktalamaAt(s[i]);
      if (!t || !buyukBasli(t) || t.startsWith('\u0001') || (cumleBasiMi && i === 0) || AD_DEGIL.has(kucuk(t))) break;
      adlar.unshift(t);
    }
    ad = adlar.join(' ');
  }
  return ad.length >= 2 && ad.length <= 60 ? ad : null;
}

/**
 * Beklenen mesaj (tırnaksız): parçanın (fiil varsa fiilden sonraki) sözcüklerinden. @param {string[]} sozcukler
 * @returns {string | null}
 */
function mesajObegi(sozcukler) {
  const t = sozcukler.map(noktalamaAt).filter(Boolean);
  if (!t.length || t.some((x) => x.startsWith('\u0001'))) return null;
  const l = t.map(kucuk);
  let bitis = -1;
  const isim = l.findIndex((x) => MESAJ_ISIM.test(x));
  if (isim > 0 && (l.slice(isim + 1).some((x) => MESAJ_TETIK.test(x)) || isim === l.length - 1)) bitis = isim;
  if (bitis < 0) {
    // İsimsiz: "<metin> görünce bitir" / "<metin> gelmeli" (tetik sözcüğü + bitirici ya da beklenti fiili).
    const i = l.findIndex((x, k) => k > 0 && MESAJ_TETIK.test(x));
    if (i < 0) return null;
    if (!l.slice(i + 1).some((x) => MESAJ_BITIRICI.test(x)) && !MESAJ_BEKLENTI.test(l[i])) return null;
    bitis = i;
  }
  let onu = t.slice(0, bitis);
  // Son dolgu sözcüğünden sonrası ("Ekranda Başvurunuz alındı" → "Başvurunuz alındı").
  let ilk = 0;
  onu.forEach((x, k) => { if (MESAJ_DOLGU.has(kucuk(x))) ilk = k + 1; });
  onu = onu.slice(ilk);
  if (!onu.length || onu.length > 12 || onu.some((x) => BUTON_SOZCUGU.test(kucuk(x)))) return null;
  const m = bosluk(onu.join(' '));
  return m.length >= 2 && m.length <= 120 ? m : null;
}

/**
 * "Ne yapılsın?" cümlesi (YZ YOK; kalıp gerekmez). Tırnak içindeki metinler ("…", “…”, '…', «…») beklenen mesaj adayı; tırnaksız
 * "X yazısını görünce bitir", "X mesajı gelmeli" de mesaj; "X'e bas", "X düğmesine tıkla", "Hesapla butonuna basıyorum" düğme adayı
 * (X tırnaklıysa tırnak içi). Anlaşılmayan kısımlar yok sayılır.
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
  // Tırnaklı metinler yer tutucuyla maskelenir (ayraç / fiil aramasına girmez).
  const maskeli = m.replace(TIRNAK, (_t, a, b) => { tirnaklar.push(bosluk(a ?? b)); return ` \u0001${tirnaklar.length - 1}\u0001 `; });
  /** @type {string[]} */
  const tirnaksizMesajlar = [];
  const parcalar = maskeli.split(/[.;!?\n]+|,|(?<![\p{L}\p{N}])(?:sonra(?:sında)?|ardından|akabinde|ve)(?![\p{L}\p{N}])/iu);
  for (const parca of parcalar) {
    const ham = parca.trim().split(/\s+/).filter(Boolean);
    if (!ham.length) continue;
    let onceki = 0;
    let sonFiil = -1;
    for (let i = 0; i < ham.length; i++) {
      if (!FIIL.test(kucuk(noktalamaAt(ham[i])))) continue;
      const ad = dugmeAdi(ham.slice(onceki, i), tirnaklar, onceki === 0);
      if (ad && !dugmeler.some((d) => katla(d) === katla(ad))) dugmeler.push(ad);
      onceki = i + 1;
      sonFiil = i;
    }
    const mesaj = mesajObegi(sonFiil >= 0 ? ham.slice(sonFiil + 1) : ham);
    if (mesaj) tirnaksizMesajlar.push(mesaj);
  }
  // Düğme adı olarak geçen tırnak içi mesaj adayı sayılmaz.
  const mesajlar = [...new Map([...tirnaklar, ...tirnaksizMesajlar].filter((t) => t && !dugmeler.some((d) => katla(d) === katla(t))).map((t) => [katla(t), t])).values()];
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
  // Tam eşleşme yoksa: yazılan ad aday metninin parçası (ya da tersi) ve tek aday ("Hesapla" → "Toplam Hesapla"; "Devama" → "Devam").
  for (const ad of cumleDugmeleri) {
    const k = katla(ad);
    if (k.length < 3) continue;
    const uyan = adaylar.filter((x) => x.metin && katla(x.metin).length >= 3 && (katla(x.metin).includes(k) || k.includes(katla(x.metin))));
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
  // İlerleme göstergesi: yalnız yüzde ("40%") ya da "…iyor n / m" ("Onaylanıyor 0 / 1", "İşleniyor 3/10").
  if (/^\d{1,3} ?%$/.test(t)) return true;
  // Kısa metinde "…ıyor / …iyor / …uyor / …üyor" ile biten bir sözcük (sonda sayaç olabilir: "Onaylanıyor 0 / 1").
  return t.length <= 60 && t.split(' ').some((w) => /(iyor|uyor)$/.test(w.replace(/[^a-z]/g, '')));
}

/**
 * Metin yalnız DEĞİŞKEN değerlerden mi oluşuyor (her koşuda değişen tutar, tarih, numara, maskeli ad): rakamlı ve maskeli (***)
 * sözcükler ile para birimleri atılınca 3 harften az kalıyorsa evet ("6.78 EUR", "377.56 TL", "01.10.2026", "D*** K***"). Böyle bir
 * metin bitiş ("Bitti") olarak önerilmez.
 * @param {unknown} metin
 */
export function degiskenMetinMi(metin) {
  const t = bosluk(metin);
  if (!t) return false;
  const sabit = t.replace(/\S*(?:\d|\*{2,})\S*/g, ' ').replace(/(?:^|\s)(?:tl|try|eur|euro|usd|gbp|chf|€|\$|₺|£)(?=\s|$)/giu, ' ').replace(/[^\p{L}]+/gu, '');
  return sabit.length < 3;
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
    // Değişken değer (tutar, tarih, maskeli ad) bitiş olarak önerilmez: her koşuda başka olur.
    else if (g.basis === sonBasis && sonBasis > 0 && !degiskenMetinMi(g.metin)) e[g.metin] = 'bitti';
    else e[g.metin] ??= null;
  }
  return e;
}

/**
 * Metnin sabit kısmı (bitiş koşulunda aranan desen): rakamlı kısımdan önceki önek ("Tutar: 1.250 TL" → "Tutar:"); önek yoksa değişken
 * (rakamlı / maskeli) sözcükler atılır ve kalan en uzun sabit parça (en az 3 harf) alınır ("6.78 EUR" → "EUR"); hiç sabit parça yoksa
 * '' ("377.56 TL", "D*** K***": bitiş olarak kullanılamaz). Rakamsız, maskesiz metin olduğu gibi. @param {string} m
 */
export function sabitKisim(m) {
  const t = bosluk(m);
  const maskeli = /\*{2,}/.test(t);
  const i = t.search(/\d/);
  if (i < 0 && !maskeli) return t;
  const bas = i > 0 ? t.slice(0, i).trim() : '';
  if (bas.length >= 3 && !/\*{2,}/.test(bas)) return bas;
  const parcalar = t.split(/\s*\S*(?:\d|\*{2,})\S*\s*/).map((x) => x.trim()).filter((x) => x.replace(/[^\p{L}]/gu, '').length >= 3);
  return parcalar.sort((a, b) => b.length - a.length)[0] ?? '';
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
  // Yalnız değişken değerden oluşan metin (tutar, tarih, maskeli ad) Bitti / Hata olamaz: aranacak sabit kısmı yok.
  for (const [k, v] of Object.entries(g.etiketler ?? {})) {
    if ((v === 'bitti' || v === 'hata') && !sabitKisim(k)) hatalar.push(`“${bosluk(k).slice(0, 60)}” yalnız değişken değer (tutar / tarih / numara / maskeli ad) içeriyor; her koşuda değişir. ${v === 'bitti' ? 'Bitiş' : 'Hata'} için sabit bir metin seçin.`);
  }
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
 * Alanlar: keşfedilen bütün doldurulabilir alanlar (değer DEĞİL, yapı; boş bırakılanlar senaryoda değersiz kalır). Boş kalan son adım (düğmesiz, alansız) atılır.
 * @param {{ adimlar: Array<{ alanlar: any[]; bas: { secici: string; metin: string | null } | null; okumalar?: Array<{ gorunen: string[]; secimler: Record<string, string> }>; kosullar?: Record<string, { secim: string; degerler: string[] }> }>;
 *   degerler: Record<string, unknown>; yol: string; baslik: string; profil: string | null }} o
 * @param {{ bitti: string[]; hata: string[] }} bitis
 */
export function kayitEnvanteriKur(o, bitis) {
  // Modele keşfedilen BÜTÜN doldurulabilir alanlar (koşullu alanlar ve koşullarıyla) girer: değeri olanlar senaryoya değerleriyle,
  // boş bırakılanlar / sayfada hazır gelenler değersiz (koşu dokunmaz; sayfanın değeri kalır). Böylece sonradan bu alanlar için senaryo
  // yazılabilir ve liste tabloları alanlara bağlanabilir (yetim tablo kalmaz).
  const dolu = (/** @type {any} */ a) => (o.degerler[a.anahtar] !== undefined && o.degerler[a.anahtar] !== '') || (!a.devreDisi && !a.saltOkunur);
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

/**
 * İstenen sayfa (hedefYol) yerine site başka bir sayfa açtıysa (giriş sonrası ana sayfaya yönlendirme, kullanıcı ya da bağlam seçimi ya da yetki
 * gerekmesi) kullanıcıya gösterilecek uyarı; aynı yolsa null. Yol karşılaştırılır (sondaki "/" ve sorgu dizisi yok sayılır).
 * @param {string} hedefYol @param {string} anlikYol
 * @returns {string | null}
 */
export function sayfaUyarisi(hedefYol, anlikYol) {
  const yol = (/** @type {string} */ m) => {
    try { return new URL(String(m || '/'), 'http://x.invalid').pathname.replace(/\/+$/, '') || '/'; } catch { return String(m || '/'); }
  };
  if (!hedefYol || !anlikYol || yol(hedefYol) === yol(anlikYol)) return null;
  return `İstediğiniz sayfa (${yol(hedefYol)}) açılmadı: site ${yol(anlikYol)} sayfasına yönlendirdi. Giriş, kullanıcı ya da bağlam seçimi ya da yetki gerekiyor olabilir. Bu sayfada devam ederseniz alanlar ve düğmeler bu sayfadan seçilir; yanlış sayfaysa "Hızlı testi iptal et" deyip önce girişi / seçimi tamamlayın.`;
}
