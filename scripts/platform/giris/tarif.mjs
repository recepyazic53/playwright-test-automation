// GİRİŞ TARİFİ (genel) — bir projenin/ortamın giriş sayfasının BİLDİRİMSEL tarifi. Motor
// (tests/support/giris-motoru.ts) bu tarifi Playwright ile uygular; hiçbir proje adı/kavramı burada
// yoktur. Tarif ortam ayarlarında saklanır (ortamlar.ayarlar_json > girisTarifi — sütun kasada ŞİFRELİ,
// 'ozel'); tarifte GİZLİ DEĞER YOKTUR: kullanıcı adı, parola, TOTP anahtarı ve sabit SMS kodu giriş
// profilinde (şifreli) durur. Kaydedilmiş tarif yoksa giriş yapılamaz (bkz. tarif-deposu.mjs).
//
// Alanlar:
//   girisAdresi          giriş sayfası (taban adrese göre yol ya da tam http(s) adresi; varsayılan "/")
//   oturumKontrolAdresi  kayıtlı oturumun hâlâ geçerli olup olmadığına bakılan sayfa (varsayılan girisAdresi)
//   kullaniciAlani, parolaAlani, gonderDugmesi   Playwright seçicileri (CSS, "text=…", "role=button[name=…]";
//                        birden fazla öğe eşleşirse İLKİ kullanılır)
//   basariGostergesi     { tur: metin | url | eleman, deger } — metin: sayfada TAM bu metin görünür;
//                        url: adres bu düzenli ifadeye uyar; eleman: seçici görünür
//   hataGostergeleri     [{ tur: metin | eleman, deger }] — görünürse "kullanıcı adı/parola hatalı" sayılır
//   ikinciAdim           { tur: yok | totp | sms, kodAlani, gonderDugmesi, smsKipi, hataGostergeleri, elleBeklemeSn }
//                        totp: kod giriş profilindeki anahtardan üretilir (anahtar yoksa sabit kod);
//                        sms: smsKipi "sabit" → giriş profilindeki sabit test kodu, "elle" → koşu sırasında
//                        sorulur (Nöbetçi koşu paneli ya da terminal), null → giriş profilindeki ayar.
//                        kodAlani boşsa kod alanı sayfadan otomatik bulunur (algilama.mjs).
//   zamanAsimiSn         giriş sonrası başarı/hata göstergesini bekleme süresi (varsayılan 45)
//   baglamDegistirme     null ya da { baglamTuru, adimlar: [...] } — giriş SONRASI bağlam (rol/şube…)
//                        seçimi; adımlardaki "{alan}" yer tutucuları seçilen bağlam profilinin alanlarıyla dolar.
//   girisAdimlari        İSTEĞE BAĞLI sıralı giriş formu adımları. Özel adımlar: kullaniciAdi (kullaniciAlani'na
//                        profildeki kullanıcı adı), parola (parolaAlani'na parola), gonder (gonderDugmesi'ne tıkla);
//                        bunların ÖNCESİNE, ARASINA ve SONRASINA bağlam adımlarıyla aynı genel adımlar (doldur, seç,
//                        tıkla, bekle…) konabilir (ör. ek kod alanı, seçim listesi, "Devam" ile iki sayfalı giriş, çerez
//                        onayı). Genel adımlardaki "{alan}" yer tutucuları GİRİŞ PROFİLİNİN EK ALANLARIYLA dolar (gizli
//                        işaretli ek alan kasada şifreli durur, loga/hataya yazılmaz). Her özel adım tam bir kez olur;
//                        kullaniciAdi ve parola gonder'den önce gelir. ALAN YOKSA (eski tarifler) adımlar
//                        [kullaniciAdi, parola, gonder] sayılır (girisAdimlariniCoz) — kayıtlı tarif yeniden yazılmaz.
// Bağlam adımları (islem): git {adres} · adresBekle {desen} · kosulBekle {ifade} · bekle {saniye: 1–300, sabit süre} · tikla {hedef, yanitBekle?,
//   adresBekle?} · doldur {hedef, deger} · sec {hedef, deger} · gorunurBekle {hedef} · degerBekle {hedef, deger}
//   · sayiBekle {hedef, sayi} · metinBekle {hedef, metin}
//   hedef = { secici, metin?, tamMetin? } (metin: öğe bu metni içermeli; tamMetin: metin birebir) ya da
//           { rol, ad } (erişilebilir rol + ad; ör. button / "Kaydet"). Birden çok öğe eşleşirse ilki.
//   yanitBekle = { yol } tıklamayla gelen ve adres yolu (pathname) birebir bu olan yanıt başarılı olmalı.
//   "{alan}" yer tutucuları: adres, desen (düzenli ifade olarak kaçışlanır), secici, metin, deger, yol.
//   kosulBekle.ifade sayfada çalışan bir JavaScript ifadesidir; YER TUTUCU İÇERMEZ (değer enjeksiyonu olmasın).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).

export const TARIF_SURUMU = 1;
export const IKINCI_ADIM_TURLERI = Object.freeze(['yok', 'totp', 'sms']);
export const SMS_KIPLERI = Object.freeze(['sabit', 'elle']);
export const BASARI_GOSTERGE_TURLERI = Object.freeze(['metin', 'url', 'eleman']);
export const HATA_GOSTERGE_TURLERI = Object.freeze(['metin', 'eleman']);
export const ADIM_ISLEMLERI = Object.freeze([
  'git', 'adresBekle', 'kosulBekle', 'bekle', 'tikla', 'doldur', 'sec', 'gorunurBekle', 'degerBekle', 'sayiBekle', 'metinBekle'
]);
/** Giriş adımlarına özel işlemler (tarifin kullaniciAlani / parolaAlani / gonderDugmesi seçicilerini kullanır). */
export const OZEL_GIRIS_ISLEMLERI = Object.freeze(['kullaniciAdi', 'parola', 'gonder']);
/** Giriş adımlarında kullanılabilen tüm işlemler. */
export const GIRIS_ADIM_ISLEMLERI = Object.freeze([...OZEL_GIRIS_ISLEMLERI, ...ADIM_ISLEMLERI]);
/** Eski (girisAdimlari olmayan) tariflerin denk sayıldığı sıra. */
export const VARSAYILAN_GIRIS_ADIMLARI = Object.freeze([
  Object.freeze({ islem: 'kullaniciAdi' }), Object.freeze({ islem: 'parola' }), Object.freeze({ islem: 'gonder' })
]);
/** Adım işlemlerinin arayüzdeki adları. */
export const ADIM_ETIKETLERI = Object.freeze({
  git: 'Sayfaya git', adresBekle: 'Adresi bekle', kosulBekle: 'Sayfa koşulunu bekle', bekle: 'Bekle (saniye)', tikla: 'Tıkla', doldur: 'Doldur',
  sec: 'Seçenek seç', gorunurBekle: 'Görünmesini bekle', degerBekle: 'Değerini doğrula', sayiBekle: 'Sayısını doğrula',
  metinBekle: 'Metni doğrula', kullaniciAdi: 'Kullanıcı adını yaz', parola: 'Parolayı yaz', gonder: 'Giriş düğmesine bas'
});
export const VARSAYILAN_ZAMAN_ASIMI_SN = 45;
export const VARSAYILAN_ELLE_BEKLEME_SN = 180;
const EN_UZUN_METIN = 2000;
const EN_FAZLA_ADIM = 60;

/** "{alan}" yer tutucusu (alan adı: harf/rakam/_ . -; boşluk içermez). */
const YER_TUTUCU = /\{([\p{L}\p{N}_.-]+)\}/gu;

/** @param {unknown} d @returns {d is Record<string, unknown>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** Metindeki yer tutucu adları (sırayla, tekrarsız). @param {string} metin */
export function yerTutuculari(metin) {
  const adlar = [];
  for (const e of String(metin).matchAll(YER_TUTUCU)) if (!adlar.includes(e[1])) adlar.push(e[1]);
  return adlar;
}

/** Düzenli ifade özel karakterlerini kaçışlar. @param {string} metin */
export const regexKacis = (metin) => String(metin).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Yer tutucuları değerlerle doldurur. Eksik alan → hata (hangi alanın eksik olduğunu söyler; değer yazmaz).
 * @param {string} metin @param {Record<string, unknown>} degerler @param {{ kacis?: (d: string) => string }} [secenekler]
 */
export function yerTutuculariDoldur(metin, degerler, secenekler = {}) {
  return String(metin).replace(YER_TUTUCU, (_, ad) => {
    const deger = degerler[ad];
    if (deger === undefined || deger === null) throw new TarifHatasi([`Bağlam profilinde "${ad}" alanı yok (yer tutucu {${ad}}).`]);
    const metinDeger = typeof deger === 'string' ? deger : String(deger);
    return secenekler.kacis ? secenekler.kacis(metinDeger) : metinDeger;
  });
}

export class TarifHatasi extends Error {
  /** @param {string[]} hatalar */
  constructor(hatalar) {
    super(`Giriş tarifi geçersiz: ${hatalar.join(' ')}`);
    this.name = 'TarifHatasi';
    this.hatalar = hatalar;
  }
}

/**
 * Tarif doğrulama + normalleştirme (boşluk kırpma, varsayılanlar). Hiçbir zaman fırlatmaz.
 * @param {unknown} ham
 * @returns {{ gecerli: boolean; tarif: import('./tarif.d.mts').GirisTarifi | null; hatalar: string[] }}
 */
export function girisTarifiniDogrula(ham) {
  /** @type {string[]} */
  const hatalar = [];
  if (!nesneMi(ham)) return { gecerli: false, tarif: null, hatalar: ['Tarif bir nesne olmalıdır.'] };

  /** @param {unknown} d @param {string} ad @param {{ zorunlu?: boolean; varsayilan?: string }} [s] */
  const metin = (d, ad, s = {}) => {
    if (d === undefined || d === null || (typeof d === 'string' && !d.trim())) {
      if (s.zorunlu) hatalar.push(`${ad} boş olamaz.`);
      return s.varsayilan ?? '';
    }
    if (typeof d !== 'string') { hatalar.push(`${ad} metin olmalıdır.`); return s.varsayilan ?? ''; }
    if (d.length > EN_UZUN_METIN) { hatalar.push(`${ad} çok uzun (en fazla ${EN_UZUN_METIN} karakter).`); return d.slice(0, EN_UZUN_METIN); }
    return d.trim();
  };
  /** @param {string} deger @param {string} ad */
  const regexKontrol = (deger, ad) => {
    try { new RegExp(deger); } catch { hatalar.push(`${ad} geçerli bir düzenli ifade değil.`); }
  };
  /** @param {string} deger @param {string} ad */
  const adresKontrol = (deger, ad) => {
    if (!deger) return;
    if (deger.startsWith('/')) return;
    try {
      const u = new URL(deger);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protokol');
    } catch {
      hatalar.push(`${ad} "/" ile başlayan bir yol ya da http(s) adresi olmalıdır.`);
    }
  };
  /** @param {unknown} d @param {string} ad @param {readonly string[]} turler */
  const gosterge = (d, ad, turler) => {
    if (!nesneMi(d)) { hatalar.push(`${ad} tanımlı olmalıdır.`); return { tur: turler[0], deger: '' }; }
    const tur = typeof d.tur === 'string' && turler.includes(d.tur) ? d.tur : null;
    if (!tur) hatalar.push(`${ad}.tur yalnızca ${turler.join(', ')} olabilir.`);
    const deger = metin(d.deger, `${ad}.deger`, { zorunlu: true });
    if (tur === 'url' && deger) regexKontrol(deger, `${ad}.deger`);
    return { tur: tur ?? turler[0], deger };
  };
  /** @param {unknown} d @param {string} ad */
  const hataListesi = (d, ad) => {
    if (d === undefined || d === null) return [];
    if (!Array.isArray(d)) { hatalar.push(`${ad} bir liste olmalıdır.`); return []; }
    return d.map((g, i) => gosterge(g, `${ad}[${i + 1}]`, HATA_GOSTERGE_TURLERI));
  };
  /** @param {unknown} d */
  const sure = (d, ad, varsayilan, enAz, enCok) => {
    if (d === undefined || d === null || d === '') return varsayilan;
    const n = Number(d);
    if (!Number.isInteger(n) || n < enAz || n > enCok) { hatalar.push(`${ad} ${enAz}–${enCok} arasında bir tam sayı olmalıdır.`); return varsayilan; }
    return n;
  };

  const girisAdresi = metin(ham.girisAdresi, 'Giriş adresi', { varsayilan: '/' }) || '/';
  adresKontrol(girisAdresi, 'Giriş adresi');
  const oturumKontrolAdresi = metin(ham.oturumKontrolAdresi, 'Oturum kontrol adresi') || girisAdresi;
  adresKontrol(oturumKontrolAdresi, 'Oturum kontrol adresi');

  const ikinciHam = nesneMi(ham.ikinciAdim) ? ham.ikinciAdim : {};
  const ikinciTur = typeof ikinciHam.tur === 'string' && IKINCI_ADIM_TURLERI.includes(ikinciHam.tur) ? ikinciHam.tur : null;
  if (ikinciHam.tur !== undefined && !ikinciTur) hatalar.push(`İkinci adım türü yalnızca ${IKINCI_ADIM_TURLERI.join(', ')} olabilir.`);
  const smsKipi = ikinciHam.smsKipi === undefined || ikinciHam.smsKipi === null || ikinciHam.smsKipi === ''
    ? null
    : typeof ikinciHam.smsKipi === 'string' && SMS_KIPLERI.includes(ikinciHam.smsKipi) ? ikinciHam.smsKipi : (hatalar.push('SMS kipi yalnızca sabit ya da elle olabilir.'), null);
  const tur = /** @type {'yok' | 'totp' | 'sms'} */ (ikinciTur ?? 'yok');
  const ikinciAdim = tur === 'yok'
    ? { tur }
    : {
      tur,
      kodAlani: metin(ikinciHam.kodAlani, 'Kod alanı'),
      gonderDugmesi: metin(ikinciHam.gonderDugmesi, 'Kod gönder düğmesi'),
      smsKipi: tur === 'sms' ? smsKipi : null,
      hataGostergeleri: hataListesi(ikinciHam.hataGostergeleri, 'İkinci adım hata göstergeleri'),
      elleBeklemeSn: sure(ikinciHam.elleBeklemeSn, 'Elle kod bekleme süresi (sn)', VARSAYILAN_ELLE_BEKLEME_SN, 15, 1800)
    };

  let baglamDegistirme = null;
  if (ham.baglamDegistirme !== undefined && ham.baglamDegistirme !== null) {
    const b = ham.baglamDegistirme;
    if (!nesneMi(b)) hatalar.push('Bağlam değiştirme bir nesne olmalıdır.');
    else {
      const baglamTuru = metin(b.baglamTuru, 'Bağlam türü', { zorunlu: true });
      const adimlar = Array.isArray(b.adimlar) ? b.adimlar : (hatalar.push('Bağlam adımları bir liste olmalıdır.'), []);
      if (adimlar.length > EN_FAZLA_ADIM) hatalar.push(`En fazla ${EN_FAZLA_ADIM} bağlam adımı olabilir.`);
      if (!adimlar.length) hatalar.push('Bağlam değiştirme için en az bir adım gerekir (ya da bölümü kaldırın).');
      baglamDegistirme = { baglamTuru, adimlar: adimlar.slice(0, EN_FAZLA_ADIM).map((a, i) => adimiDogrula(a, i + 1, hatalar)) };
    }
  }

  // Giriş adımları (isteğe bağlı; yoksa varsayılan sıra — normalleştirilmiş tarife EKLENMEZ).
  let girisAdimlari = null;
  if (ham.girisAdimlari !== undefined && ham.girisAdimlari !== null) {
    if (!Array.isArray(ham.girisAdimlari)) hatalar.push('Giriş adımları bir liste olmalıdır.');
    else {
      if (ham.girisAdimlari.length > EN_FAZLA_ADIM) hatalar.push(`En fazla ${EN_FAZLA_ADIM} giriş adımı olabilir.`);
      girisAdimlari = ham.girisAdimlari.slice(0, EN_FAZLA_ADIM).map((a, i) => girisAdiminiDogrula(a, i + 1, hatalar));
      girisAdimSirasiniDenetle(girisAdimlari, hatalar);
    }
  }

  const tarif = {
    surum: TARIF_SURUMU,
    girisAdresi,
    oturumKontrolAdresi,
    kullaniciAlani: metin(ham.kullaniciAlani, 'Kullanıcı adı alanı', { zorunlu: true }),
    parolaAlani: metin(ham.parolaAlani, 'Parola alanı', { zorunlu: true }),
    gonderDugmesi: metin(ham.gonderDugmesi, 'Giriş düğmesi', { zorunlu: true }),
    basariGostergesi: gosterge(ham.basariGostergesi, 'Başarı göstergesi', BASARI_GOSTERGE_TURLERI),
    hataGostergeleri: hataListesi(ham.hataGostergeleri, 'Hata göstergeleri'),
    ikinciAdim,
    zamanAsimiSn: sure(ham.zamanAsimiSn, 'Giriş bekleme süresi (sn)', VARSAYILAN_ZAMAN_ASIMI_SN, 5, 600),
    baglamDegistirme,
    ...(girisAdimlari ? { girisAdimlari } : {})
  };
  return { gecerli: hatalar.length === 0, tarif: /** @type {any} */ (tarif), hatalar };
}

/**
 * Tek giriş adımı: özel adım (kullaniciAdi / parola / gonder; yalnızca açıklama ve bekleme süresi alır) ya da genel adım.
 * @param {unknown} a @param {number} sira @param {string[]} hatalar
 * @returns {import('./tarif.d.mts').GirisAdimi}
 */
function girisAdiminiDogrula(a, sira, hatalar) {
  if (nesneMi(a) && typeof a.islem === 'string' && OZEL_GIRIS_ISLEMLERI.includes(a.islem)) {
    /** @type {Record<string, unknown>} */
    const sonuc = { islem: a.islem };
    if (typeof a.aciklama === 'string' && a.aciklama.trim()) sonuc.aciklama = a.aciklama.trim().slice(0, 200);
    if (a.zamanAsimiSn !== undefined && a.zamanAsimiSn !== null && a.zamanAsimiSn !== '') {
      const n = Number(a.zamanAsimiSn);
      if (!Number.isInteger(n) || n < 1 || n > 600) hatalar.push(`Giriş adımı ${sira}: bekleme süresi 1–600 sn olmalıdır.`);
      else sonuc.zamanAsimiSn = n;
    }
    return /** @type {any} */ (sonuc);
  }
  const once = hatalar.length;
  const adim = adimiDogrula(a, sira, hatalar);
  // Hata metinleri "Adım n" der; giriş adımında "Giriş adımı n" olsun (bağlam adımlarıyla karışmasın).
  for (let i = once; i < hatalar.length; i++) hatalar[i] = hatalar[i].replace(/^Adım (\d+)/, 'Giriş adımı $1');
  return adim;
}

/** Özel adımlar tam bir kez; kullanıcı adı ve parola gönderden önce. @param {import('./tarif.d.mts').GirisAdimi[]} adimlar @param {string[]} hatalar */
function girisAdimSirasiniDenetle(adimlar, hatalar) {
  const sira = (/** @type {string} */ islem) => adimlar.findIndex((a) => a.islem === islem);
  for (const islem of OZEL_GIRIS_ISLEMLERI) {
    const adet = adimlar.filter((a) => a.islem === islem).length;
    if (adet !== 1) hatalar.push(`Giriş adımlarında "${ADIM_ETIKETLERI[/** @type {'kullaniciAdi'} */ (islem)]}" adımı tam bir kez olmalıdır (şu an ${adet}).`);
  }
  const g = sira('gonder');
  if (g >= 0) {
    if (sira('kullaniciAdi') > g) hatalar.push('Giriş adımlarında kullanıcı adı, giriş düğmesinden önce yazılmalıdır.');
    if (sira('parola') > g) hatalar.push('Giriş adımlarında parola, giriş düğmesinden önce yazılmalıdır.');
  }
}

/**
 * Tarifin etkin giriş adımları: tarifte girisAdimlari yoksa (eski tarifler) varsayılan sıra [kullaniciAdi, parola, gonder].
 * Tarifi DEĞİŞTİRMEZ. @param {import('./tarif.d.mts').GirisTarifi} tarif @returns {import('./tarif.d.mts').GirisAdimi[]}
 */
export function girisAdimlariniCoz(tarif) {
  return tarif.girisAdimlari && tarif.girisAdimlari.length ? tarif.girisAdimlari : /** @type {any} */ (VARSAYILAN_GIRIS_ADIMLARI);
}

/** Giriş adımları varsayılan sırayla (açıklamasız, süresiz) aynı mı? (Aynıysa tarife yazılmasına gerek yok.) @param {unknown} adimlar */
export function varsayilanGirisAdimlariMi(adimlar) {
  return Array.isArray(adimlar) && adimlar.length === 3
    && adimlar.every((a, i) => nesneMi(a) && Object.keys(a).length === 1 && a.islem === VARSAYILAN_GIRIS_ADIMLARI[i].islem);
}

/**
 * @param {unknown} a @param {number} sira @param {string[]} hatalar
 * @returns {import('./tarif.d.mts').BaglamAdimi}
 */
function adimiDogrula(a, sira, hatalar) {
  const ad = `Adım ${sira}`;
  if (!nesneMi(a)) { hatalar.push(`${ad} bir nesne olmalıdır.`); return { islem: 'git', adres: '/' }; }
  const islem = typeof a.islem === 'string' && ADIM_ISLEMLERI.includes(a.islem) ? a.islem : null;
  if (!islem) { hatalar.push(`${ad}: işlem yalnızca ${ADIM_ISLEMLERI.join(', ')} olabilir.`); return { islem: 'git', adres: '/' }; }
  /** @param {unknown} d @param {string} alan @param {boolean} [zorunlu] */
  const metin = (d, alan, zorunlu = true) => {
    if (typeof d === 'number') return String(d);
    if (typeof d !== 'string' || !d.trim()) { if (zorunlu) hatalar.push(`${ad}: ${alan} boş olamaz.`); return ''; }
    if (d.length > EN_UZUN_METIN) { hatalar.push(`${ad}: ${alan} çok uzun.`); return d.slice(0, EN_UZUN_METIN); }
    return d;
  };
  /** @param {unknown} h */
  const hedef = (h) => {
    if (!nesneMi(h)) { hatalar.push(`${ad}: hedef tanımlı olmalıdır.`); return { secici: '' }; }
    if (typeof h.rol === 'string' && h.rol.trim()) {
      if (h.secici) hatalar.push(`${ad}: hedefte seçici ile rol birlikte kullanılamaz.`);
      return { rol: h.rol.trim(), ad: metin(h.ad, 'hedef adı') };
    }
    const secici = metin(h.secici, 'hedef seçicisi').trim();
    /** @type {{ secici: string; metin?: string; tamMetin?: boolean }} */
    const sonuc = { secici };
    if (h.metin !== undefined && h.metin !== null && h.metin !== '') sonuc.metin = metin(h.metin, 'hedef metni');
    if (h.tamMetin === true) sonuc.tamMetin = true;
    return sonuc;
  };
  const aciklama = typeof a.aciklama === 'string' && a.aciklama.trim() ? { aciklama: a.aciklama.trim().slice(0, 200) } : {};
  const zaman = a.zamanAsimiSn === undefined || a.zamanAsimiSn === null || a.zamanAsimiSn === '' ? {} : (() => {
    const n = Number(a.zamanAsimiSn);
    if (!Number.isInteger(n) || n < 1 || n > 600) { hatalar.push(`${ad}: bekleme süresi 1–600 sn olmalıdır.`); return {}; }
    return { zamanAsimiSn: n };
  })();
  switch (islem) {
    case 'git': {
      const adres = metin(a.adres, 'adres').trim();
      if (adres && !adres.startsWith('/') && !/^https?:\/\//i.test(adres) && !adres.startsWith('{')) hatalar.push(`${ad}: adres "/" ile başlamalı ya da http(s) adresi olmalıdır.`);
      return { islem, adres, ...aciklama, ...zaman };
    }
    case 'adresBekle': {
      const desen = metin(a.desen, 'adres deseni');
      try { new RegExp(desen.replace(YER_TUTUCU, 'x')); } catch { hatalar.push(`${ad}: adres deseni geçerli bir düzenli ifade değil.`); }
      return { islem, desen, ...aciklama, ...zaman };
    }
    case 'kosulBekle': {
      const ifade = metin(a.ifade, 'koşul ifadesi');
      if (yerTutuculari(ifade).length) {
        // JS ifadesine değer enjekte edilmez; "{x}" yazılmışsa büyük olasılıkla yer tutucu sanılmıştır.
        hatalar.push(`${ad}: koşul ifadesi yer tutucu ({alan}) içeremez.`);
      }
      return { islem, ifade, ...aciklama, ...zaman };
    }
    case 'bekle': {
      // Sabit süre (sayfa bir şey göstermeden önce beklemek için); olay bekleyen adımlar (adres / koşul / görünme) tercih edilir.
      const saniye = Number(a.saniye);
      if (!Number.isInteger(saniye) || saniye < 1 || saniye > 300) hatalar.push(`${ad}: bekleme süresi 1 ile 300 saniye arasında tam sayı olmalıdır.`);
      return { islem, saniye: Number.isInteger(saniye) && saniye >= 1 && saniye <= 300 ? saniye : 1, ...aciklama };
    }
    case 'tikla': {
      /** @type {Record<string, unknown>} */
      const sonuc = { islem, hedef: hedef(a.hedef), ...aciklama, ...zaman };
      if (nesneMi(a.yanitBekle)) sonuc.yanitBekle = { yol: metin(a.yanitBekle.yol, 'beklenen yanıt yolu') };
      if (a.adresBekle !== undefined && a.adresBekle !== null && a.adresBekle !== '') {
        const desen = metin(a.adresBekle, 'tıklama sonrası adres deseni');
        try { new RegExp(desen.replace(YER_TUTUCU, 'x')); } catch { hatalar.push(`${ad}: tıklama sonrası adres deseni geçerli değil.`); }
        sonuc.adresBekle = desen;
      }
      return /** @type {any} */ (sonuc);
    }
    case 'doldur':
    case 'sec':
    case 'degerBekle':
      return { islem, hedef: hedef(a.hedef), deger: metin(a.deger, 'değer', islem !== 'doldur'), ...aciklama, ...zaman };
    case 'gorunurBekle':
      return { islem, hedef: hedef(a.hedef), ...aciklama, ...zaman };
    case 'sayiBekle': {
      const sayi = Number(a.sayi);
      if (!Number.isInteger(sayi) || sayi < 0) hatalar.push(`${ad}: sayı 0 ya da pozitif tam sayı olmalıdır.`);
      return { islem, hedef: hedef(a.hedef), sayi: Number.isInteger(sayi) && sayi >= 0 ? sayi : 0, ...aciklama, ...zaman };
    }
    case 'metinBekle':
      return { islem, hedef: hedef(a.hedef), metin: metin(a.metin, 'beklenen metin'), ...aciklama, ...zaman };
    default:
      return { islem: 'git', adres: '/' };
  }
}

/** Tarif geçerli değilse TarifHatasi fırlatır; geçerliyse normalleştirilmiş tarifi döner. @param {unknown} ham */
export function girisTarifiOlmali(ham) {
  const { gecerli, tarif, hatalar } = girisTarifiniDogrula(ham);
  if (!gecerli || !tarif) throw new TarifHatasi(hatalar);
  return tarif;
}

/** Adımın kısa, gizli değer İÇERMEYEN açıklaması (hata mesajları için; yer tutucular doldurulmamış hâliyle). @param {import('./tarif.d.mts').GirisAdimi} a @param {number} sira */
export function adimOzeti(a, sira) {
  if (a.aciklama) return `Adım ${sira} (${a.aciklama})`;
  if (a.islem === 'kullaniciAdi' || a.islem === 'parola' || a.islem === 'gonder') return `Adım ${sira} (${ADIM_ETIKETLERI[a.islem]})`;
  const h = 'hedef' in a && a.hedef ? ('rol' in a.hedef ? `${a.hedef.rol} "${a.hedef.ad}"` : a.hedef.secici) : '';
  const ek = a.islem === 'git' ? a.adres : a.islem === 'adresBekle' ? a.desen : a.islem === 'kosulBekle' ? a.ifade : a.islem === 'bekle' ? `${a.saniye} sn` : h;
  return `Adım ${sira} (${ADIM_ETIKETLERI[a.islem]}: ${ek})`;
}

/** Tarifin bağlam adımlarının kullandığı bağlam profili alan adları. @param {import('./tarif.d.mts').GirisTarifi} tarif */
export function baglamAlanlari(tarif) {
  return adimAlanlari(tarif.baglamDegistirme?.adimlar ?? []);
}

/** Tarifin giriş adımlarının kullandığı GİRİŞ PROFİLİ ek alan adları. @param {import('./tarif.d.mts').GirisTarifi} tarif */
export function girisAlanlari(tarif) {
  return adimAlanlari(tarif.girisAdimlari ?? []);
}

/** Adımlardaki yer tutucu adları (sırayla, tekrarsız). @param {ReadonlyArray<import('./tarif.d.mts').GirisAdimi>} liste */
function adimAlanlari(liste) {
  /** @type {string[]} */
  const adlar = [];
  for (const a of liste) {
    const metinler = [
      'adres' in a ? a.adres : '', 'desen' in a ? a.desen : '', 'deger' in a ? a.deger : '', 'metin' in a ? a.metin : '',
      'adresBekle' in a && a.adresBekle ? a.adresBekle : '', 'yanitBekle' in a && a.yanitBekle ? a.yanitBekle.yol : '',
      'hedef' in a && a.hedef && 'secici' in a.hedef ? a.hedef.secici : '', 'hedef' in a && a.hedef && 'metin' in a.hedef ? a.hedef.metin ?? '' : '',
      'hedef' in a && a.hedef && 'ad' in a.hedef ? a.hedef.ad : ''
    ];
    for (const m of metinler) for (const ad of yerTutuculari(m)) if (!adlar.includes(ad)) adlar.push(ad);
  }
  return adlar;
}

// ---------------------------------------------------------------------------------------
// Hata sınıflandırma (saf; motor ve testler kullanır)
// ---------------------------------------------------------------------------------------

/** Giriş hata kodları ve kullanıcıya gösterilecek başlıkları. */
export const GIRIS_HATA_KODLARI = Object.freeze({
  SITE_ERISILEMEDI: 'Site erişilemedi',
  KIMLIK_HATALI: 'Kullanıcı adı veya parola hatalı',
  IKI_ASAMALI_HATALI: 'İki aşamalı doğrulama başarısız',
  KOD_GEREKLI: 'Doğrulama kodu alınamadı',
  CAPTCHA: 'CAPTCHA algılandı',
  ALAN_BULUNAMADI: 'Giriş sayfasında alan bulunamadı',
  ZAMAN_ASIMI: 'Giriş zaman aşımına uğradı',
  BAGLAM_ADIMI: 'Bağlam değiştirme adımı başarısız',
  GIRIS_ADIMI: 'Giriş adımı başarısız',
  TARIF_GECERSIZ: 'Giriş tarifi geçersiz',
  KOKEN_UYUSMAZ: 'Giriş bilgisi farklı bir siteye yazılmadı'
});

/**
 * Giriş bilgisinin (parola, kod) YAZILABİLECEĞİ kökenler: ortamın taban adresinin kökeni ve giriş tarifinde açıkça tanımlı
 * giriş adresinin kökeni (tam adres verilmişse). Sayfa başka bir kökene yönlenmişse giriş motoru alan doldurmaz.
 * @param {string | null | undefined} tabanUrl @param {{ girisAdresi?: string } | null | undefined} tarif @returns {string[]}
 */
export function girisKokenleri(tabanUrl, tarif) {
  /** @type {string[]} */
  const kokenler = [];
  const ekle = (/** @type {string} */ adres, /** @type {string | undefined} */ taban) => {
    try { const o = new URL(adres, taban).origin; if (o && o !== 'null' && !kokenler.includes(o)) kokenler.push(o); } catch { /* geçersiz: eklenmez */ }
  };
  if (tabanUrl) ekle(tabanUrl, undefined);
  if (tarif?.girisAdresi) ekle(tarif.girisAdresi, tabanUrl ?? undefined);
  return kokenler;
}

/** Tarayıcı/ağ hata metni "site erişilemedi" türünden mi? @param {string} mesaj */
export function agHatasiMi(mesaj) {
  return /net::ERR_|NS_ERROR_|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_TIMED_OUT|Navigation timeout|page\.goto: Timeout/i.test(String(mesaj));
}

/**
 * Giriş sonrası gözlenen durumdan hata sınıfı. gozlem: poll döngüsünün gördüğü ilk gösterge.
 * @param {{ asama: 'ilk' | 'ikinci'; gozlem: 'basari' | 'hata' | 'ikinciAdim' | 'captcha' | null; ikinciAdimBekleniyor: boolean }} d
 * @returns {keyof typeof GIRIS_HATA_KODLARI | null}
 */
export function girisSonucunuSiniflandir(d) {
  if (d.gozlem === 'basari') return null;
  if (d.gozlem === 'captcha') return 'CAPTCHA';
  if (d.gozlem === 'hata') return d.asama === 'ikinci' ? 'IKI_ASAMALI_HATALI' : 'KIMLIK_HATALI';
  if (d.gozlem === 'ikinciAdim') return d.asama === 'ilk' && d.ikinciAdimBekleniyor ? null : 'IKI_ASAMALI_HATALI';
  return 'ZAMAN_ASIMI';
}
