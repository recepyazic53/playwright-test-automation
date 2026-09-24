// TEK SENARYO DOĞRULAYICISI — ekran modeli (tests/ekran-modelleri/*.model.json) tabanlı.
//
// Aynı kod üç yerde çalışır (kurallar ve Türkçe mesajlar TEK kaynaktan gelir):
//  - Playwright spec'i (TS): tests/support/senaryo-dogrulama.ts + beklenen-sonuc.ts
//  - Test sunucusu: scripts/test-sunucu.mjs (/jetseyahat-senaryo/dene, /kaydet, /senaryo-guncelle)
//  - Dashboard formu (tarayıcı): scripts/rapor/dashboard-html.mjs bu dosyayı
//    scripts/dogrulama/tarayici-paketi.mjs ile sarıp sayfaya gömer (window.SenaryoDogrulayici).
//
// KURALLAR:
//  - Bu dosya HİÇBİR modül import etmez, Node'a/DOM'a özgü API kullanmaz (tarayıcıya olduğu
//    gibi gömülür). Dışa açılan her şey "export function" ya da "export const" ile başlar
//    (tarayıcı paketleyicisi yalnızca bu iki biçimi tanır).
//  - Kurallar mümkün olduğunca MODELDEN okunur: zorunluluk (zorunlu), seçenek listeleri
//    (secenekler / bagimlilik.secenekHaritasi), görünürlük koşulları (gorunurluk + kosullar,
//    acente bazında bilinenDurumlar), profil havuzları (eslesme.profilHavuzu), kart alanları
//    (alt model > eslesme.kart), beklenen sonuç varyantları ve adım koşulları, tarih biçimi (bicim).
//    Modelde ifade edilemeyen kural mantığı (TC kontrol hanesi, telefon/VKN biçimi, kartın
//    son kullanma tarihi, "ikisi birlikte" kuralları) aşağıda, YALNIZCA bu dosyada durur.
//  - Hata mesajları kart numarasını ve güvenlik kodunu (CVV) ASLA içermez.
//
// API: senaryoyuDogrula(senaryo, baglam) → { gecerli, hatalar: [{ alan, mesaj }], uyarilar: [...] }
// Tipler: senaryo-dogrulayici.d.mts.

/** Formdaki taksit seçeneklerinin üst sınırı (dashboard 1..N sunar). */
export const TAKSIT_UST_SINIRI = 12;

/** Artık desteklenmeyen eski beklenen sonuç alanları (beklenenSonuc'tan önceki biçim). */
export const ESKI_BEKLENEN_SONUC_ALANLARI = Object.freeze(['beklenenHataMesaji', 'beklenenHataAdimi']);

/**
 * Yalnızca dashboard girdisinde (baglam.kaynak === 'girdi') bulunan, kayda doğrudan
 * yazılmayan anahtarlar → modeldeki sahibi alan ve o alanın form kontrolleri içindeki sırası
 * ([form.id, ...yardimciKontroller]). Sunucu bu ikiliyi bir acente profili anahtarına çevirir.
 */
export const GIRDI_ALANLARI = Object.freeze({
  acenteKodu: Object.freeze({ modelAlani: 'acenteProfili', formSirasi: 0 }),
  acenteKullanicisi: Object.freeze({ modelAlani: 'acenteProfili', formSirasi: 1 })
});

/**
 * TEK Türkçe mesaj kümesi. Her kuralın kendi şablonu vardır (koruma testi şablonların
 * birbirinden farklı olduğunu ve hiçbirinin kart numarası/CVV içermediğini kontrol eder).
 */
export const MESAJLAR = Object.freeze({
  senaryoNesneDegil: () => 'Senaryo bir nesne olmalıdır.',
  zorunlu: (etiket) => `"${etiket}" zorunludur.`,
  metinOlmali: (etiket) => `"${etiket}" metin olmalıdır.`,
  nesneOlmali: (etiket) => `"${etiket}" bir nesne olmalıdır.`,
  booleanOlmali: (etiket) => `"${etiket}" true ya da false olmalıdır.`,
  pozitifTamSayi: (etiket) => `"${etiket}" pozitif bir tam sayı olmalıdır.`,
  dosyaUzantisi: (etiket, uzanti) => `"${etiket}" ${uzanti} uzantılı bir dosya olmalıdır.`,
  secenekDisi: (etiket, deger, izinliler) =>
    `"${etiket}" için "${deger}" geçerli değil. Geçerli değerler: ${izinliler.join(', ')}.`,
  bagimliSecenekDisi: (etiket, deger, bagliEtiket, bagliDeger, izinliler) =>
    `"${etiket}" için "${deger}", ${bagliEtiket} "${bagliDeger}" iken geçerli değil. Geçerli değerler: ${izinliler.join(', ')}.`,
  kosulluAlan: (etiket, kosulAciklamasi) => `"${etiket}" yalnızca şu durumda verilebilir: ${kosulAciklamasi}.`,
  kosulluSecenek: (etiket, deger, kosulAciklamasi) =>
    `"${etiket}" için "${deger}" yalnızca şu durumda seçilebilir: ${kosulAciklamasi}.`,
  gorunmeyenAlan: (etiket) => `"${etiket}" bu senaryoda ekranda görünmüyor; verilen değer kullanılmaz.`,
  birlikteZorunlu: (etiket, digerEtiket) => `"${etiket}" verildiyse "${digerEtiket}" de verilmelidir.`,
  profilYok: (etiket, anahtar) => `"${etiket}" için "${anahtar}" adlı hazır profil ortak veride (ortak.json) yok.`,
  profilVeKimlikBirlikte: (etiket) => `"${etiket}" için hazır profil ve yeni kimlik aynı anda verilemez; birini seçin.`,
  profilYaDaKimlikZorunlu: (etiket) => `"${etiket}" için hazır bir profil seçilmeli ya da yeni kimlik bilgileri girilmelidir.`,
  tcBicim: () => 'T.C. Kimlik No 11 haneli olmalı, yalnızca rakam içermeli ve 0 ile başlamamalıdır.',
  tcKontrolHanesi: () => 'T.C. Kimlik No geçersiz: kontrol haneleri tutmuyor.',
  vknBicim: () => 'Vergi Kimlik No 10 haneli olmalı ve yalnızca rakam içermelidir.',
  telefonBicim: () => 'Cep Telefonu 5XXXXXXXXX biçiminde 10 haneli olmalıdır (başında 0 ya da +90 olmadan, boşluksuz).',
  tarihBicim: (etiket, bicim) => `"${etiket}" ${bicim} biçiminde geçerli bir tarih olmalıdır.`,
  tarihGelecekte: (etiket) => `"${etiket}" bugünden ileri bir tarih olamaz.`,
  kartNoBicim: () => 'Kart numarası 16 haneli olmalıdır (yalnızca rakam; boşluk bırakılabilir).',
  cvvBicim: () => 'Güvenlik kodu (CVV) 3 ya da 4 haneli olmalıdır.',
  kartAyBicim: () => 'Son kullanma ayı 01-12 arasında olmalıdır.',
  kartYilBicim: () => 'Son kullanma yılı 4 haneli olmalıdır.',
  kartTaksitBicim: (ust) => `Taksit 1-${ust} arasında olmalıdır.`,
  kartSuresiGecmis: (aaYyyy) => `Kartın son kullanma tarihi (${aaYyyy}) geçmiş; bu ay ya da sonrası olmalıdır.`,
  ortakKartSuresiGecmis: (aaYyyy) =>
    `Ortak test kartının (ortak.json > odeme.krediKarti) son kullanma tarihi (${aaYyyy}) geçmiş; ödeme adımı bu kartla reddedilebilir. Ortak kartı güncelleyin ya da senaryoya özel kart girin.`,
  eskiBeklenenSonucAlanlari: (alanlar) =>
    `Eski ${alanlar.map((a) => `"${a}"`).join('/')} alanları artık desteklenmiyor; "beklenenSonuc": { "tip": "isKuraliHatasi", "adim": "...", "mesaj": "..." } kullanın.`
});

// ---- Küçük yardımcılar ----

function nesneMi(deger) {
  return typeof deger === 'object' && deger !== null && !Array.isArray(deger);
}

function bosMu(deger) {
  return deger === undefined || deger === null || (typeof deger === 'string' && deger.trim() === '');
}

function etiketi(alan) {
  return (alan.etiket && alan.etiket.form) || (alan.form && alan.form.etiket) || alan.id;
}

function senaryoAnahtarlari(alan) {
  const s = alan.eslesme && alan.eslesme.senaryo;
  if (s === undefined || s === null) return [];
  return Array.isArray(s) ? s : [s];
}

function secenekDegeri(secenek) {
  return secenek.senaryoDegeri !== undefined ? secenek.senaryoDegeri : secenek.deger;
}

/** Select değeri: { deger, metin } nesnesi ya da doğrudan değer olabilir. */
function secimDegeri(secim) {
  if (nesneMi(secim)) return secim.deger === undefined || secim.deger === null ? '' : String(secim.deger).trim();
  return secim === undefined || secim === null ? '' : String(secim).trim();
}

function aralikta(metin, alt, ust) {
  if (!/^\d{1,2}$/.test(metin)) return null;
  const sayi = Number(metin);
  return sayi >= alt && sayi <= ust ? sayi : null;
}

function ikiHane(sayi) {
  return sayi < 10 ? `0${sayi}` : String(sayi);
}

// ---- Biçim kuralları (modelde ifade edilemeyen kural mantığı) ----

/** Resmi T.C. kimlik numarası algoritması (11 hane, ilk hane 0 değil, 10. ve 11. kontrol haneleri). */
export function tcKimlikNoGecerliMi(no) {
  if (typeof no !== 'string' || !/^[1-9]\d{10}$/.test(no)) return false;
  const h = no.split('').map(Number);
  const tekler = h[0] + h[2] + h[4] + h[6] + h[8];
  const ciftler = h[1] + h[3] + h[5] + h[7];
  const onuncu = (((tekler * 7 - ciftler) % 10) + 10) % 10;
  const onBirinci = h.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return onuncu === h[9] && onBirinci === h[10];
}

/** Modelde "bicim" ile adlandırılan tarih biçimleri → { yil, ay, gun } ya da null. */
const TARIH_BICIMLERI = {
  'gg.aa.yyyy': (metin) => {
    const e = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(metin);
    if (!e) return null;
    const gun = Number(e[1]);
    const ay = Number(e[2]);
    const yil = Number(e[3]);
    if (yil < 1900) return null;
    const tarih = new Date(yil, ay - 1, gun);
    if (tarih.getFullYear() !== yil || tarih.getMonth() !== ay - 1 || tarih.getDate() !== gun) return null;
    return { yil, ay, gun };
  }
};

/**
 * Kimlik nesnesi alanlarının (modelde altAlanlar > eslesme.kimlikAlani) biçim kuralları.
 * dogrula(deger, { simdi, bicim, etiket }) → hata mesajı ya da null. Etiket, kimlik türüne
 * göre değişen alanlarda (TC ↔ VKN) mesajın doğru adı göstermesi için buradadır.
 */
const KIMLIK_ALANI_KURALLARI = {
  tcKimlikNo: {
    etiket: 'T.C. Kimlik No',
    dogrula: (d) => (!/^[1-9]\d{10}$/.test(d) ? MESAJLAR.tcBicim() : !tcKimlikNoGecerliMi(d) ? MESAJLAR.tcKontrolHanesi() : null)
  },
  vergiKimlikNo: {
    etiket: 'Vergi Kimlik No',
    dogrula: (d) => (/^\d{10}$/.test(d) ? null : MESAJLAR.vknBicim())
  },
  cepTelefonu: {
    etiket: 'Cep Telefonu',
    // Veride kullanılan biçim: 10 hane, 5 ile başlar, başında 0/+90 yok (ör. 5426502153).
    dogrula: (d) => (/^5\d{9}$/.test(d) ? null : MESAJLAR.telefonBicim())
  },
  dogumTarihi: {
    etiket: 'Doğum Tarihi',
    dogrula: (d, { simdi, bicim, etiket }) => {
      const bicimAdi = bicim || 'gg.aa.yyyy';
      const cozucu = TARIH_BICIMLERI[bicimAdi];
      if (!cozucu) return null;
      const t = cozucu(d);
      if (!t) return MESAJLAR.tarihBicim(etiket, bicimAdi);
      const bugun = [simdi.getFullYear(), simdi.getMonth() + 1, simdi.getDate()];
      const gelecekMi = t.yil !== bugun[0] ? t.yil > bugun[0] : t.ay !== bugun[1] ? t.ay > bugun[1] : t.gun > bugun[2];
      return gelecekMi ? MESAJLAR.tarihGelecekte(etiket) : null;
    }
  }
};

/**
 * Kart alanlarının (alt model > kartFormu > eslesme.kart) biçim kuralları. secim: değer
 * { deger, metin } nesnesinden okunur. dogrula(metin) → hata mesajı ya da null.
 */
const KART_ALANI_KURALLARI = {
  isim: { secim: false, dogrula: () => null },
  soyisim: { secim: false, dogrula: () => null },
  kartNo: { secim: false, dogrula: (d) => (/^\d{16}$/.test(d.replace(/\s+/g, '')) ? null : MESAJLAR.kartNoBicim()) },
  guvenlikKodu: { secim: false, dogrula: (d) => (/^\d{3,4}$/.test(d.trim()) ? null : MESAJLAR.cvvBicim()) },
  sonKullanmaAyi: { secim: true, dogrula: (d) => (aralikta(d, 1, 12) === null ? MESAJLAR.kartAyBicim() : null) },
  sonKullanmaYili: { secim: true, dogrula: (d) => (/^\d{4}$/.test(d) ? null : MESAJLAR.kartYilBicim()) },
  taksit: { secim: true, dogrula: (d) => (aralikta(d, 1, TAKSIT_UST_SINIRI) === null ? MESAJLAR.kartTaksitBicim(TAKSIT_UST_SINIRI) : null) }
};

/**
 * Kartın son kullanma tarihi (ay + yıl) simdi'ye göre geçmiş mi? Bu ay hâlâ geçerlidir.
 * Ay/yıl okunamıyorsa null (biçim hatası ayrıca raporlanır).
 */
export function kartSuresiGectiMi(kart, simdi) {
  if (!nesneMi(kart)) return null;
  const ay = aralikta(secimDegeri(kart.sonKullanmaAyi), 1, 12);
  const yilMetni = secimDegeri(kart.sonKullanmaYili);
  if (ay === null || !/^\d{4}$/.test(yilMetni)) return null;
  const yil = Number(yilMetni);
  const buYil = simdi.getFullYear();
  const buAy = simdi.getMonth() + 1;
  return yil < buYil || (yil === buYil && ay < buAy);
}

function kartSonKullanmaMetni(kart) {
  const ay = aralikta(secimDegeri(kart.sonKullanmaAyi), 1, 12);
  return `${ay === null ? '??' : ikiHane(ay)}/${secimDegeri(kart.sonKullanmaYili)}`;
}

/** Taksit sayısının görünen metni (ortak karttaki "Tek Çekim" kalıbı). */
export function taksitMetni(sayi) {
  return sayi === 1 ? 'Tek Çekim' : `${sayi} Taksit`;
}

/**
 * Doğrulanmış kart girdisini ortak.json > odeme.krediKarti biçimine getirir: kart no
 * boşluksuz, ay { deger: "1", metin: "01" }, yıl { deger, metin }, taksit metni ortak
 * karttaki aynı değerin metni (ör. "Tek Çekim") ya da taksitMetni(). Önce doğrulayın.
 */
export function kartiNormallestir(ham, varsayilanKart) {
  const ay = aralikta(secimDegeri(ham.sonKullanmaAyi), 1, 12);
  const yil = secimDegeri(ham.sonKullanmaYili);
  const taksit = aralikta(secimDegeri(ham.taksit), 1, TAKSIT_UST_SINIRI);
  const varsayilanTaksit = varsayilanKart && nesneMi(varsayilanKart.taksit) ? varsayilanKart.taksit : null;
  return {
    isim: String(ham.isim).trim(),
    soyisim: String(ham.soyisim).trim(),
    kartNo: String(ham.kartNo).replace(/\s+/g, ''),
    guvenlikKodu: String(ham.guvenlikKodu).trim(),
    sonKullanmaAyi: { deger: String(ay), metin: ikiHane(ay) },
    sonKullanmaYili: { deger: yil, metin: yil },
    taksit: {
      deger: String(taksit),
      metin: varsayilanTaksit && secimDegeri(varsayilanTaksit) === String(taksit) && varsayilanTaksit.metin
        ? String(varsayilanTaksit.metin)
        : taksitMetni(taksit)
    }
  };
}

/** İki kart aynı mı? Yalnızca teste giden DEĞERLER karşılaştırılır (metinler görüntü amaçlı). */
export function krediKartlariAyniMi(a, b) {
  if (!nesneMi(a) || !nesneMi(b)) return false;
  const metin = (d) => (d === undefined || d === null ? '' : String(d));
  return metin(a.isim) === metin(b.isim) && metin(a.soyisim) === metin(b.soyisim) &&
    metin(a.kartNo).replace(/\s+/g, '') === metin(b.kartNo).replace(/\s+/g, '') &&
    metin(a.guvenlikKodu) === metin(b.guvenlikKodu) &&
    secimDegeri(a.sonKullanmaAyi) === secimDegeri(b.sonKullanmaAyi) &&
    secimDegeri(a.sonKullanmaYili) === secimDegeri(b.sonKullanmaYili) &&
    secimDegeri(a.taksit) === secimDegeri(b.taksit);
}

// ---- Bağlam ----

/**
 * ortak.json içeriğini doğrulayıcının ihtiyaç duyduğu dar biçime çevirir:
 * kimlikProfilleri (kimlikBilgileri.ozel/tuzel), acenteProfilleri (kullaniciDegistir →
 * { acentePartaji }), varsayilanKrediKarti (odeme.krediKarti).
 */
export function ortakBaglaminiOlustur(ortak) {
  if (!nesneMi(ortak)) return {};
  const kimlik = nesneMi(ortak.kimlikBilgileri) ? ortak.kimlikBilgileri : {};
  const acenteler = nesneMi(ortak.kullaniciDegistir) ? ortak.kullaniciDegistir : {};
  const acenteProfilleri = {};
  for (const anahtar of Object.keys(acenteler)) {
    const profil = acenteler[anahtar];
    acenteProfilleri[anahtar] = { acentePartaji: nesneMi(profil) && profil.acentePartaji !== undefined ? String(profil.acentePartaji) : '' };
  }
  const kart = nesneMi(ortak.odeme) && nesneMi(ortak.odeme.krediKarti) ? ortak.odeme.krediKarti : null;
  return {
    kimlikProfilleri: { ozel: nesneMi(kimlik.ozel) ? kimlik.ozel : {}, tuzel: nesneMi(kimlik.tuzel) ? kimlik.tuzel : {} },
    acenteProfilleri,
    varsayilanKrediKarti: kart
  };
}

/** Modeldeki profil havuzu yolu → bağlamdaki kayıtlar (bağlamda yoksa undefined: kontrol atlanır). */
function profilHavuzu(yol, ortak) {
  if (!ortak) return undefined;
  switch (yol) {
    case 'ortak.kullaniciDegistir': return ortak.acenteProfilleri;
    case 'ortak.kimlikBilgileri.ozel': return ortak.kimlikProfilleri ? ortak.kimlikProfilleri.ozel : undefined;
    case 'ortak.kimlikBilgileri.tuzel': return ortak.kimlikProfilleri ? ortak.kimlikProfilleri.tuzel : undefined;
    default: return undefined;
  }
}

/** Senaryoda ayarlanabilen tüm model alanları + her birinin (adım/bölüm/alan) görünürlükleri. */
function modelAlanlari(model) {
  const liste = [];
  for (const adim of model.adimlar || []) {
    for (const bolum of adim.bolumler || []) {
      for (const alan of bolum.alanlar || []) {
        liste.push({ alan, gorunurlukler: [adim.gorunurluk, bolum.gorunurluk, alan.gorunurluk].filter(Boolean) });
      }
    }
  }
  for (const alan of (model.senaryoDuzeyi && model.senaryoDuzeyi.alanlar) || []) {
    liste.push({ alan, gorunurlukler: alan.gorunurluk ? [alan.gorunurluk] : [] });
  }
  return liste;
}

function ic(baglam, senaryo) {
  const model = baglam.model;
  const alanlar = modelAlanlari(model);
  const idAnahtar = {};
  const idAlan = {};
  for (const { alan } of alanlar) {
    idAlan[alan.id] = alan;
    const s = alan.eslesme && alan.eslesme.senaryo;
    if (typeof s === 'string') idAnahtar[alan.id] = s;
  }
  const ortak = baglam.ortak && nesneMi(baglam.ortak) ? baglam.ortak : null;
  const kaynak = baglam.kaynak === 'girdi' ? 'girdi' : 'kayit';
  const icBaglam = {
    model,
    altModeller: baglam.altModeller || {},
    ortak,
    kaynak,
    simdi: baglam.simdi instanceof Date ? baglam.simdi : new Date(),
    senaryo,
    alanlar,
    idAlan,
    alanDegeri: (id) => (idAnahtar[id] !== undefined ? senaryo[idAnahtar[id]] : undefined),
    acenteKodu: undefined
  };
  icBaglam.acenteKodu = acenteKodunuBul(icBaglam);
  return icBaglam;
}

/**
 * Senaryonun çalışacağı acentenin kodu: girdide elle yazılan acenteKodu; yoksa
 * acenteProfili (yoksa modeldeki varsayılan profil anahtarı) → ortak acente profilinin
 * acentePartaji. Bulunamazsa undefined (acenteye bağlı görünürlük "bilinmiyor" olur).
 */
function acenteKodunuBul(b) {
  const s = b.senaryo;
  if (b.kaynak === 'girdi' && typeof s.acenteKodu === 'string' && s.acenteKodu.trim()) return s.acenteKodu.trim();
  const acenteAlani = b.idAlan.acenteProfili;
  const anahtar = acenteAlani ? senaryoAnahtarlari(acenteAlani)[0] : 'acenteProfili';
  const varsayilan = acenteAlani && acenteAlani.varsayilan ? acenteAlani.varsayilan.deger : undefined;
  const profilAnahtari = typeof s[anahtar] === 'string' && s[anahtar] ? s[anahtar] : varsayilan;
  if (typeof profilAnahtari !== 'string' || !b.ortak || !b.ortak.acenteProfilleri) return undefined;
  const profil = b.ortak.acenteProfilleri[profilAnahtari];
  return profil && profil.acentePartaji ? String(profil.acentePartaji) : undefined;
}

// ---- Koşul değerlendirme (üç değerli: true / false / null = bilinmiyor) ----

function kosulIfadesiniDegerlendir(ifade, b, bilinenDurumlar) {
  if (!nesneMi(ifade)) return null;
  if (Array.isArray(ifade.ve)) {
    const sonuclar = ifade.ve.map((alt) => kosulIfadesiniDegerlendir(alt, b, bilinenDurumlar));
    if (sonuclar.includes(false)) return false;
    return sonuclar.every((s) => s === true) ? true : null;
  }
  if (Array.isArray(ifade.veya)) {
    const sonuclar = ifade.veya.map((alt) => kosulIfadesiniDegerlendir(alt, b, bilinenDurumlar));
    if (sonuclar.includes(true)) return true;
    return sonuclar.every((s) => s === false) ? false : null;
  }
  if ('degil' in ifade) {
    const s = kosulIfadesiniDegerlendir(ifade.degil, b, bilinenDurumlar);
    return s === null ? null : !s;
  }
  if (typeof ifade.alan === 'string') {
    const deger = b.alanDegeri(ifade.alan);
    if (Array.isArray(ifade.icinde)) return ifade.icinde.includes(deger);
    return deger === ifade.esit;
  }
  if (typeof ifade.senaryoAyari === 'string') return b.alanDegeri(ifade.senaryoAyari) === ifade.esit;
  if (ifade.calismaZamani === 'gorunurse') {
    // POM alanın ekranda görünüp görünmediğine çalışma anında bakıyor; doğrulayıcı, koşulun
    // acente bazında bilinen durumlarından (bilinenDurumlar > acentePartaji) karar verir.
    if (!Array.isArray(bilinenDurumlar) || !b.acenteKodu) return null;
    const durum = bilinenDurumlar.find((d) => d && d.acentePartaji === b.acenteKodu);
    return durum && typeof durum.gorunur === 'boolean' ? durum.gorunur : null;
  }
  return null; // { acente: { alanSeti } } — hedef ifade, veride henüz yok.
}

function gorunurlukDegerlendir(gorunurluk, b) {
  if (!gorunurluk) return true;
  if (typeof gorunurluk.kosul === 'string') {
    const kosul = b.model.kosullar && b.model.kosullar[gorunurluk.kosul];
    return kosul ? kosulIfadesiniDegerlendir(kosul.ifade, b, kosul.bilinenDurumlar) : null;
  }
  return kosulIfadesiniDegerlendir(gorunurluk.ifade, b, undefined);
}

function gorunurlukleriBirlestir(gorunurlukler, b) {
  const sonuclar = gorunurlukler.map((g) => gorunurlukDegerlendir(g, b));
  if (sonuclar.includes(false)) return false;
  return sonuclar.every((s) => s === true) ? true : null;
}

function kosulAciklamasi(kosulAdi, b) {
  const kosul = b.model.kosullar && b.model.kosullar[kosulAdi];
  return (kosul && kosul.aciklama) || kosulAdi;
}

// ---- Alan doğrulayıcıları ----

function secenekListesi(alan, b) {
  if (Array.isArray(alan.secenekler)) return { liste: alan.secenekler.map(secenekDegeri) };
  const bag = alan.bagimlilik;
  if (bag && nesneMi(bag.secenekHaritasi) && typeof bag.alan === 'string') {
    const bagliDeger = b.alanDegeri(bag.alan);
    const liste = typeof bagliDeger === 'string' ? bag.secenekHaritasi[bagliDeger] : undefined;
    const bagliAlan = b.idAlan[bag.alan];
    return {
      liste: Array.isArray(liste) ? liste.map(secenekDegeri) : null,
      bagli: { etiket: bagliAlan ? etiketi(bagliAlan) : bag.alan, deger: bagliDeger },
      bagimliMi: true
    };
  }
  return null;
}

function basitAlaniDogrula(alan, anahtar, deger, b, rapor) {
  const etiket = etiketi(alan);
  switch (alan.tip) {
    case 'secim':
    case 'okluSecim':
    case 'radyo': {
      const secenek = secenekListesi(alan, b);
      if (secenek) {
        // Bağlı alanın kendisi geçersizse (liste yok) onun hatası yeterli.
        if (!secenek.liste) return;
        if (!secenek.liste.includes(deger)) {
          rapor.hata(anahtar, secenek.bagimliMi
            ? MESAJLAR.bagimliSecenekDisi(etiket, String(deger), secenek.bagli.etiket, String(secenek.bagli.deger), secenek.liste)
            : MESAJLAR.secenekDisi(etiket, String(deger), secenek.liste));
        }
        return;
      }
      if (typeof deger !== 'string') rapor.hata(anahtar, MESAJLAR.metinOlmali(etiket));
      return;
    }
    case 'metin':
      if (typeof deger !== 'string') rapor.hata(anahtar, MESAJLAR.metinOlmali(etiket));
      return;
    case 'onayKutusu':
      if (typeof deger !== 'boolean') rapor.hata(anahtar, MESAJLAR.booleanOlmali(etiket));
      return;
    case 'sayi': {
      const sayi = typeof deger === 'number' ? deger : typeof deger === 'string' && /^\d+$/.test(deger.trim()) ? Number(deger) : NaN;
      if (!Number.isInteger(sayi) || sayi <= 0) rapor.hata(anahtar, MESAJLAR.pozitifTamSayi(etiket));
      return;
    }
    case 'dosya':
      if (typeof deger !== 'string') rapor.hata(anahtar, MESAJLAR.metinOlmali(etiket));
      else if (alan.kabul && !deger.toLowerCase().endsWith(alan.kabul.toLowerCase())) rapor.hata(anahtar, MESAJLAR.dosyaUzantisi(etiket, alan.kabul));
      return;
    default:
  }
}

function havuzuDogrula(alan, anahtar, deger, havuzYolu, b, rapor) {
  if (typeof deger !== 'string') return;
  const havuz = profilHavuzu(havuzYolu, b.ortak);
  if (havuz && !Object.prototype.hasOwnProperty.call(havuz, deger)) rapor.hata(anahtar, MESAJLAR.profilYok(etiketi(alan), deger));
}

function kimlikTuruBul(alan, b) {
  if (typeof alan.kimlikTuru === 'string') return alan.kimlikTuru;
  if (nesneMi(alan.kimlikTuru) && alan.bagimlilik && typeof alan.bagimlilik.alan === 'string') {
    const tur = alan.kimlikTuru[b.alanDegeri(alan.bagimlilik.alan)];
    return typeof tur === 'string' ? tur : null;
  }
  return null;
}

/**
 * kimlikProfili alanı: senaryo anahtarlarından "...Profili" ile biten hazır profil anahtarı,
 * diğerleri serbest kimlik nesneleri (birden fazlaysa adında kimlik türü geçen seçilir:
 * ettirenOzelKimligi ↔ ozel, ettirenTuzelKimligi ↔ tuzel).
 */
function kimlikAlaniniDogrula(alan, gorunur, b, rapor) {
  const s = b.senaryo;
  const etiket = etiketi(alan);
  const anahtarlar = senaryoAnahtarlari(alan);
  const profilAnahtari = anahtarlar.find((a) => /Profili$/.test(a));
  const kimlikAnahtarlari = anahtarlar.filter((a) => a !== profilAnahtari);
  const verilenler = anahtarlar.filter((a) => !bosMu(s[a]));
  if (gorunur === false) {
    for (const a of verilenler) rapor.uyari(a, MESAJLAR.gorunmeyenAlan(etiket));
    return;
  }
  const tur = kimlikTuruBul(alan, b);
  if (!tur) return; // bağlı alan (ettiren) geçersiz; hatası orada.
  const kimlikAnahtari = kimlikAnahtarlari.length === 1
    ? kimlikAnahtarlari[0]
    : kimlikAnahtarlari.find((a) => a.toLowerCase().includes(tur.toLowerCase()));
  const profil = profilAnahtari ? s[profilAnahtari] : undefined;
  const kimlik = kimlikAnahtari ? s[kimlikAnahtari] : undefined;
  const hataAlani = profilAnahtari || kimlikAnahtari || alan.id;

  if (!bosMu(profil) && !bosMu(kimlik)) {
    rapor.hata(hataAlani, MESAJLAR.profilVeKimlikBirlikte(etiket));
    return;
  }
  if (bosMu(profil) && bosMu(kimlik)) {
    if (alan.zorunlu === true) rapor.hata(hataAlani, MESAJLAR.profilYaDaKimlikZorunlu(etiket));
    return;
  }
  if (!bosMu(profil)) {
    if (typeof profil !== 'string') {
      rapor.hata(profilAnahtari, MESAJLAR.metinOlmali(etiket));
      return;
    }
    const havuzTanimi = alan.eslesme && alan.eslesme.profilHavuzu;
    const havuzYolu = typeof havuzTanimi === 'string'
      ? havuzTanimi
      : nesneMi(havuzTanimi) && alan.bagimlilik && typeof alan.bagimlilik.alan === 'string'
        ? havuzTanimi[b.alanDegeri(alan.bagimlilik.alan)]
        : undefined;
    if (typeof havuzYolu === 'string') havuzuDogrula(alan, profilAnahtari, profil, havuzYolu, b, rapor);
    return;
  }
  if (!nesneMi(kimlik)) {
    rapor.hata(kimlikAnahtari, MESAJLAR.nesneOlmali(etiket));
    return;
  }
  for (const alt of alan.altAlanlar || []) {
    const k = alt.eslesme && alt.eslesme.kimlikAlani;
    const kimlikAlani = typeof k === 'string' ? k : nesneMi(k) ? k[tur] : undefined;
    if (typeof kimlikAlani !== 'string') continue;
    if (alt.gorunurluk && gorunurlukDegerlendir(alt.gorunurluk, b) === false) continue;
    const yol = `${kimlikAnahtari}.${kimlikAlani}`;
    const kural = KIMLIK_ALANI_KURALLARI[kimlikAlani];
    const altEtiket = kural ? kural.etiket : etiketi(alt);
    const deger = kimlik[kimlikAlani];
    if (bosMu(deger)) {
      rapor.hata(yol, MESAJLAR.zorunlu(altEtiket));
      continue;
    }
    if (typeof deger !== 'string') {
      rapor.hata(yol, MESAJLAR.metinOlmali(altEtiket));
      continue;
    }
    const mesaj = kural ? kural.dogrula(deger, { simdi: b.simdi, bicim: alt.bicim, etiket: altEtiket }) : null;
    if (mesaj) rapor.hata(yol, mesaj);
  }
}

function kartBolumu(alan, b) {
  const basvuru = alan.altModel;
  const altModel = basvuru ? b.altModeller[basvuru.dosya] : undefined;
  return altModel ? (altModel.bolumler || []).find((bolum) => bolum.id === basvuru.bolum) : undefined;
}

/** altModelGecersizKilma (krediKarti): senaryoya özel kart ya da ortak kart uyarısı. */
function kartAlaniniDogrula(alan, gorunur, b, rapor) {
  const anahtar = senaryoAnahtarlari(alan)[0];
  const etiket = etiketi(alan);
  const kart = b.senaryo[anahtar];
  if (bosMu(kart)) {
    const ortakKart = b.ortak && b.ortak.varsayilanKrediKarti;
    if (gorunur === true && nesneMi(ortakKart) && kartSuresiGectiMi(ortakKart, b.simdi) === true) {
      rapor.uyari(anahtar, MESAJLAR.ortakKartSuresiGecmis(kartSonKullanmaMetni(ortakKart)));
    }
    return;
  }
  if (gorunur === false) {
    const kosul = alan.gorunurluk && typeof alan.gorunurluk.kosul === 'string' ? kosulAciklamasi(alan.gorunurluk.kosul, b) : 'koşul sağlanmıyor';
    rapor.hata(anahtar, MESAJLAR.kosulluAlan(etiket, kosul));
    return;
  }
  if (!nesneMi(kart)) {
    rapor.hata(anahtar, MESAJLAR.nesneOlmali(etiket));
    return;
  }
  const bolum = kartBolumu(alan, b);
  if (!bolum) return;
  let hataVar = false;
  for (const kartAlani of bolum.alanlar || []) {
    const k = kartAlani.eslesme && kartAlani.eslesme.kart;
    if (typeof k !== 'string') continue;
    const yol = `${anahtar}.${k}`;
    const kural = KART_ALANI_KURALLARI[k];
    const ham = kart[k];
    const metin = kural && kural.secim ? secimDegeri(ham) : typeof ham === 'string' ? ham : bosMu(ham) ? '' : null;
    if (metin === null) {
      rapor.hata(yol, MESAJLAR.metinOlmali(etiketi(kartAlani)));
      hataVar = true;
      continue;
    }
    if (metin.trim() === '') {
      if (kartAlani.zorunlu === true) {
        rapor.hata(yol, MESAJLAR.zorunlu(etiketi(kartAlani)));
        hataVar = true;
      }
      continue;
    }
    const mesaj = kural ? kural.dogrula(metin) : null;
    if (mesaj) {
      rapor.hata(yol, mesaj);
      hataVar = true;
    }
  }
  if (!hataVar && kartSuresiGectiMi(kart, b.simdi) === true) {
    rapor.hata(`${anahtar}.sonKullanmaYili`, MESAJLAR.kartSuresiGecmis(kartSonKullanmaMetni(kart)));
  }
}

/** birlesim (beklenenSonuc): tip ve varyant alanları modelin varyantlarından. */
function beklenenSonucAlaniniDogrula(alan, b, rapor) {
  const anahtar = senaryoAnahtarlari(alan)[0];
  const deger = b.senaryo[anahtar];
  if (bosMu(deger)) return; // yoksa "basarili" (model: varsayılan)
  if (!nesneMi(deger)) {
    rapor.hata(anahtar, MESAJLAR.nesneOlmali(etiketi(alan)));
    return;
  }
  const varyantlar = alan.varyantlar || [];
  const tipler = varyantlar.map((v) => v.tip);
  const varyant = varyantlar.find((v) => v.tip === deger.tip);
  if (!varyant) {
    rapor.hata(`${anahtar}.tip`, MESAJLAR.secenekDisi('Beklenen Sonuç tipi', String(deger.tip), tipler));
    return;
  }
  for (const ad of Object.keys(varyant.alanlar || {})) {
    const tanim = varyant.alanlar[ad];
    const yol = `${anahtar}.${ad}`;
    const altEtiket = tanim.etiket || ad;
    const d = deger[ad];
    if (Array.isArray(tanim.secenekler)) {
      if (bosMu(d)) {
        rapor.hata(yol, MESAJLAR.zorunlu(altEtiket));
        continue;
      }
      const secenek = tanim.secenekler.find((s) => secenekDegeri(s) === d);
      if (!secenek) {
        rapor.hata(yol, MESAJLAR.secenekDisi(altEtiket, String(d), tanim.secenekler.map(secenekDegeri)));
        continue;
      }
      if (typeof secenek.kosul === 'string' && gorunurlukDegerlendir({ kosul: secenek.kosul }, b) === false) {
        rapor.hata(yol, MESAJLAR.kosulluSecenek(altEtiket, secenek.metin || String(d), kosulAciklamasi(secenek.kosul, b)));
      }
      continue;
    }
    if (tanim.zorunlu === true && (typeof d !== 'string' || !d.trim())) rapor.hata(yol, MESAJLAR.zorunlu(altEtiket));
  }
}

/** Modelde ifade edilemeyen "ikisi birlikte" kuralları: [a, b] → a verildiyse b de (ve tersi). */
const BIRLIKTE_VERILENLER = [['cokluSorguDosyasi', 'cokluSorguKisiSayisi']];

// ---- Ana giriş ----

/**
 * Senaryoyu modele göre doğrular.
 *  - baglam.model / altModeller: ekran modeli ve alt modelleri (dosya adı → alt model).
 *  - baglam.ortak: ortakBaglaminiOlustur(ortak.json) çıktısı; parçası eksikse o kontrol atlanır
 *    (ör. tarayıcıda profiller henüz yüklenmediyse profil varlığı kontrol edilmez).
 *  - baglam.kaynak: 'kayit' (jet-seyahat.json'daki kayıt; varsayılan) | 'girdi' (dashboard
 *    formunun gönderdiği gövde: başlık sonradan verilebilir, acenteKodu/acenteKullanicisi olabilir).
 *  - baglam.simdi: tarih kontrolleri için "şimdi" (testlerde sabitlenir).
 * hatalar: kaydı/koşuyu engeller. uyarilar: engellemez (ör. ortak kartın süresi geçmiş,
 * ekranda görünmeyen alana değer verilmiş).
 */
export function senaryoyuDogrula(senaryo, baglam) {
  const hatalar = [];
  const uyarilar = [];
  const rapor = {
    hata: (alan, mesaj) => hatalar.push({ alan, mesaj }),
    uyari: (alan, mesaj) => uyarilar.push({ alan, mesaj })
  };
  if (!nesneMi(senaryo)) {
    rapor.hata('', MESAJLAR.senaryoNesneDegil());
    return { gecerli: false, hatalar, uyarilar };
  }
  if (!baglam || !nesneMi(baglam.model)) throw new Error('senaryoyuDogrula: baglam.model (ekran modeli) zorunludur.');
  const b = ic(baglam, senaryo);

  const eskiler = ESKI_BEKLENEN_SONUC_ALANLARI.filter((a) => a in senaryo);
  if (eskiler.length) rapor.hata('beklenenSonuc', MESAJLAR.eskiBeklenenSonucAlanlari(eskiler));

  for (const { alan, gorunurlukler } of b.alanlar) {
    if (alan.yapilandirma !== 'senaryo') continue;
    const gorunur = gorunurlukleriBirlestir(gorunurlukler, b);
    if (alan.tip === 'kimlikProfili') {
      kimlikAlaniniDogrula(alan, gorunur, b, rapor);
      continue;
    }
    if (alan.tip === 'altModelGecersizKilma') {
      kartAlaniniDogrula(alan, gorunur, b, rapor);
      continue;
    }
    if (alan.tip === 'birlesim') {
      beklenenSonucAlaniniDogrula(alan, b, rapor);
      continue;
    }
    const anahtarlar = senaryoAnahtarlari(alan);
    if (anahtarlar.length !== 1) continue;
    const anahtar = anahtarlar[0];
    const deger = senaryo[anahtar];
    if (bosMu(deger)) {
      // Girdide başlık HİÇ yoksa ("Senaryoyu Koş": başlık kaydederken sorulur) atlanır; boş
      // gönderildiyse (Düzenle formu) zorunluluk hatası verilir.
      const sonradanVerilir = b.kaynak === 'girdi' && alan.id === 'baslik' && !(anahtar in senaryo);
      // Görünmeyen alan zorunlu değildir; görünürlüğü bilinmiyorsa (null) zorunlu kalır.
      if (alan.zorunlu === true && gorunur !== false && !sonradanVerilir) rapor.hata(anahtar, MESAJLAR.zorunlu(etiketi(alan)));
      continue;
    }
    // Girdide acente elle yazıldıysa (acenteKodu) profil anahtarı kullanılmaz.
    basitAlaniDogrula(alan, anahtar, deger, b, rapor);
    const havuzYolu = alan.eslesme && alan.eslesme.profilHavuzu;
    if (typeof havuzYolu === 'string') havuzuDogrula(alan, anahtar, deger, havuzYolu, b, rapor);
    if (gorunur === false && (alan.tip !== 'onayKutusu' || deger === true)) rapor.uyari(anahtar, MESAJLAR.gorunmeyenAlan(etiketi(alan)));
  }

  const alanEtiketi = (anahtar) => {
    const kayit = b.alanlar.find(({ alan }) => senaryoAnahtarlari(alan).includes(anahtar));
    return kayit ? etiketi(kayit.alan) : anahtar;
  };
  for (const [a, c] of BIRLIKTE_VERILENLER) {
    if (!bosMu(senaryo[a]) && bosMu(senaryo[c])) rapor.hata(c, MESAJLAR.birlikteZorunlu(alanEtiketi(a), alanEtiketi(c)));
    if (!bosMu(senaryo[c]) && bosMu(senaryo[a])) rapor.hata(a, MESAJLAR.birlikteZorunlu(alanEtiketi(c), alanEtiketi(a)));
  }

  if (b.kaynak === 'girdi') {
    const acenteAlani = b.idAlan.acenteProfili;
    const kontroller = acenteAlani && acenteAlani.form
      ? [acenteAlani.form.etiket, ...(acenteAlani.form.yardimciKontroller || []).map((k) => k.amac)]
      : [];
    const kodEtiketi = kontroller[GIRDI_ALANLARI.acenteKodu.formSirasi] || 'acenteKodu';
    const kullaniciEtiketi = kontroller[GIRDI_ALANLARI.acenteKullanicisi.formSirasi] || 'acenteKullanicisi';
    if (!bosMu(senaryo.acenteKodu) && bosMu(senaryo.acenteKullanicisi)) rapor.hata('acenteKullanicisi', MESAJLAR.birlikteZorunlu(kodEtiketi, kullaniciEtiketi));
    if (!bosMu(senaryo.acenteKullanicisi) && bosMu(senaryo.acenteKodu)) rapor.hata('acenteKodu', MESAJLAR.birlikteZorunlu(kullaniciEtiketi, kodEtiketi));
  }

  return { gecerli: hatalar.length === 0, hatalar, uyarilar };
}

/**
 * Görünürlükler (üç değerli: true / false / null = bilinmiyor) — senaryoyuDogrula ile AYNI koşul
 * değerlendirmesi. Model tabanlı form (platform arayüzü) alanları buna göre gösterir/gizler:
 *  - adimlar[adimId], bolumler[bolumId]: adımın (ve bölümün) kendi görünürlüğü,
 *  - alanlar[alanId]: adım + bölüm + alan görünürlüklerinin birleşimi (senaryo düzeyi alanlar dahil),
 *  - altAlanlar["<alanId>.<altAlanId>"]: bileşik alanın (kimlik) parçalarının kendi görünürlüğü.
 */
export function gorunurlukleriHesapla(senaryo, baglam) {
  if (!baglam || !nesneMi(baglam.model)) throw new Error('gorunurlukleriHesapla: baglam.model (ekran modeli) zorunludur.');
  const b = ic(baglam, nesneMi(senaryo) ? senaryo : {});
  const sonuc = { adimlar: {}, bolumler: {}, alanlar: {}, altAlanlar: {} };
  for (const adim of b.model.adimlar || []) {
    sonuc.adimlar[adim.id] = gorunurlukDegerlendir(adim.gorunurluk, b);
    for (const bolum of adim.bolumler || []) {
      sonuc.bolumler[bolum.id] = gorunurlukleriBirlestir([adim.gorunurluk, bolum.gorunurluk].filter(Boolean), b);
    }
  }
  for (const { alan, gorunurlukler } of b.alanlar) {
    sonuc.alanlar[alan.id] = gorunurlukleriBirlestir(gorunurlukler, b);
    for (const alt of alan.altAlanlar || []) {
      if (alt.gorunurluk) sonuc.altAlanlar[`${alan.id}.${alt.id}`] = gorunurlukDegerlendir(alt.gorunurluk, b);
    }
  }
  return sonuc;
}

/**
 * Yalnızca beklenen sonuç kuralları (odemeAdimiDahil, beklenenSonuc, eski alanlar): hatalar
 * ve — hata yoksa — tek biçime çevrilmiş sonuç. senaryoyuDogrula ile AYNI kuralları kullanır.
 */
export function beklenenSonucuCozumle(senaryo, baglam) {
  const { hatalar } = senaryoyuDogrula(senaryo, baglam);
  const ilgili = hatalar.filter((h) => h.alan === 'odemeAdimiDahil' || h.alan === 'beklenenSonuc' || h.alan.indexOf('beklenenSonuc.') === 0);
  return { hatalar: ilgili, cozulmus: ilgili.length ? null : beklenenSonucuNormallestir(senaryo) };
}

/** Doğrulanmış senaryonun beklenen sonuç alanlarını tek biçime getirir (yoksa basarili). */
export function beklenenSonucuNormallestir(senaryo) {
  const bs = senaryo.beklenenSonuc;
  if (nesneMi(bs) && bs.tip === 'isKuraliHatasi') {
    return { odemeAdimiDahil: senaryo.odemeAdimiDahil, beklenenSonuc: { tip: 'isKuraliHatasi', adim: bs.adim, mesaj: String(bs.mesaj).trim() } };
  }
  return { odemeAdimiDahil: senaryo.odemeAdimiDahil, beklenenSonuc: { tip: 'basarili' } };
}

/** Hata/uyarı listesini tek metne çevirir (sunucu "mesaj"ı, spec hatası). */
export function hatalariMetneCevir(hatalar) {
  const satir = (h) => (h.alan ? `${h.alan}: ${h.mesaj}` : h.mesaj);
  if (hatalar.length === 1) return satir(hatalar[0]);
  return `${hatalar.length} sorun:\n - ${hatalar.map(satir).join('\n - ')}`;
}

/**
 * Hata alanı yolunun (ör. "ettirenTuzelKimligi.vergiKimlikNo") dashboard formundaki aday
 * kontrol id'leri — modelin form karşılıklarından türetilir. Tarayıcı sayfada VAR olan
 * ilk adayı kullanır (ör. tüzel ettirende sof_ettirenTc yerine sof_ettirenVkn çizilir).
 */
export function alanFormKimlikleri(alanYolu, baglam) {
  const model = baglam.model;
  const [anahtar, ...geri] = String(alanYolu).split('.');
  const alt = geri.join('.');
  const kontroller = (alan) => (alan && alan.form ? [alan.form.id, ...(alan.form.yardimciKontroller || []).map((k) => k.id)] : []);
  const alanlar = modelAlanlari(model).map(({ alan }) => alan);

  if (Object.prototype.hasOwnProperty.call(GIRDI_ALANLARI, anahtar)) {
    const tanim = GIRDI_ALANLARI[anahtar];
    const id = kontroller(alanlar.find((a) => a.id === tanim.modelAlani))[tanim.formSirasi];
    return id ? [id] : [];
  }
  const sahip = alanlar.find((a) => senaryoAnahtarlari(a).includes(anahtar));
  if (!sahip) return [];
  if (sahip.tip === 'altModelGecersizKilma') {
    // Kartın tamamına ait bulgu (ör. ortak kart uyarısı) kart bloğunun ilk alanına gösterilir.
    const bolum = kartBolumu(sahip, { altModeller: baglam.altModeller || {} });
    const kartAlanlari = ((bolum && bolum.alanlar) || []).filter((a) => a.eslesme && a.eslesme.kart && (!alt || a.eslesme.kart === alt));
    return kartAlanlari.flatMap(kontroller);
  }
  if (!alt) return kontroller(sahip);
  if (sahip.tip === 'kimlikProfili') {
    const altAlan = (sahip.altAlanlar || []).find((a) => {
      const k = a.eslesme && a.eslesme.kimlikAlani;
      return k === alt || (nesneMi(k) && Object.values(k).includes(alt));
    });
    return kontroller(altAlan);
  }
  if (sahip.tip === 'birlesim') {
    // Varyant alanları (adim/mesaj) formda yardımcı kontrollerdir; "amac" "<tip>.<ad>" ile biter.
    const yardimci = ((sahip.form && sahip.form.yardimciKontroller) || []).filter((k) => k.amac.split('.').pop() === alt);
    return yardimci.length ? yardimci.map((k) => k.id) : kontroller(sahip);
  }
  return kontroller(sahip);
}
