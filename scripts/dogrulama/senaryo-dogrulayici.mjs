// TEK SENARYO DOĞRULAYICISI — ekran modeli tabanlı (modeller platform veritabanında; şema:
// docs/sayfa-paketi.md).
//
// Aynı kod üç yerde çalışır (kurallar ve Türkçe mesajlar TEK kaynaktan gelir):
//  - Playwright spec'i (TS): tests/support/senaryo-dogrulama.ts + beklenen-sonuc.ts
//  - Platform sunucusu: Senaryolar > kaydet/dene (scripts/platform/senaryolar/senaryo-servisi.mjs)
//  - Senaryolar formu (tarayıcı): sunucu bu dosyayı /arayuz/senaryo-dogrulayici.mjs olarak sunar (ESM).
//
// KURALLAR:
//  - Bu dosya hiçbir modül import etmez; Node'a/DOM'a özgü API kullanmaz (tarayıcıda olduğu gibi çalışır).
//  - Kurallar mümkün olduğunca MODELDEN okunur: zorunluluk (zorunlu), seçenek listeleri
//    (secenekler / bagimlilik.secenekHaritasi), görünürlük koşulları (gorunurluk + kosullar,
//    bağlam profili bazında bilinenDurumlar), profil havuzları (eslesme.profilHavuzu), kayıt alanları
//    (alt model > eslesme.kayitAlani), beklenen sonuç varyantları ve adım koşulları, tarih biçimi (bicim).
//    Modelde ifade edilemeyen kural mantığı (TC kontrol hanesi, telefon/VKN biçimi, kartın
//    son kullanma tarihi, "ikisi birlikte" kuralları) aşağıda, YALNIZCA bu dosyada durur.
//  - Mesajlar kullanıcıya dönüktür: alanın etiketi yoksa iç anahtar değil "Bu alan" yazılır.
//  - Hata mesajları kart numarasını ve güvenlik kodunu (CVV) ASLA içermez.
//
// API: senaryoyuDogrula(senaryo, baglam) → { gecerli, hatalar: [{ alan, mesaj }], uyarilar: [...] }
// Tipler: senaryo-dogrulayici.d.mts.

/** Artık desteklenmeyen eski beklenen sonuç alanları (beklenenSonuc'tan önceki biçim). */
export const ESKI_BEKLENEN_SONUC_ALANLARI = Object.freeze(['beklenenHataMesaji', 'beklenenHataAdimi']);

/**
 * Yalnızca dashboard girdisinde (baglam.kaynak === 'girdi') bulunan, kayda doğrudan
 * yazılmayan anahtarlar → modeldeki sahibi alan ve o alanın form kontrolleri içindeki sırası
 * ([form.id, ...yardimciKontroller]). Sunucu bu ikiliyi bir bağlam profili anahtarına çevirir.
 */
export const GIRDI_ALANLARI = Object.freeze({
  baglamKodu: Object.freeze({ modelAlani: 'baglamProfili', formSirasi: 0 }),
  baglamKullanicisi: Object.freeze({ modelAlani: 'baglamProfili', formSirasi: 1 })
});

/** Mesajdaki alan adı: etiket varsa tırnak içinde, yoksa "Bu alan" (iç anahtar gösterilmez). */
function adGoster(etiket) {
  return etiket ? `"${etiket}"` : 'Bu alan';
}

/**
 * TEK Türkçe mesaj kümesi. Her kuralın kendi şablonu vardır (koruma testi şablonların
 * birbirinden farklı olduğunu ve hiçbirinin kart numarası/CVV içermediğini kontrol eder).
 */
export const MESAJLAR = Object.freeze({
  senaryoNesneDegil: () => 'Senaryo bir nesne olmalıdır.',
  zorunlu: (etiket) => `${adGoster(etiket)} zorunludur.`,
  metinOlmali: (etiket) => `${adGoster(etiket)} metin olmalıdır.`,
  nesneOlmali: (etiket) => `${adGoster(etiket)} bir nesne olmalıdır.`,
  booleanOlmali: (etiket) => `${adGoster(etiket)} true ya da false olmalıdır.`,
  pozitifTamSayi: (etiket) => `${adGoster(etiket)} pozitif bir tam sayı olmalıdır.`,
  dosyaUzantisi: (etiket, uzanti) => `${adGoster(etiket)} ${uzanti} uzantılı bir dosya olmalıdır.`,
  secenekDisi: (etiket, deger, izinliler) =>
    `${adGoster(etiket)} için "${deger}" geçerli değil. Geçerli değerler: ${izinliler.join(', ')}.`,
  bagimliSecenekDisi: (etiket, deger, bagliEtiket, bagliDeger, izinliler) =>
    `${adGoster(etiket)} için "${deger}", ${bagliEtiket || 'bağlı alan'} "${bagliDeger}" iken geçerli değil. Geçerli değerler: ${izinliler.join(', ')}.`,
  kosulluAlan: (etiket, kosulAciklamasi) => `${adGoster(etiket)} yalnızca şu durumda verilebilir: ${kosulAciklamasi}.`,
  kosulluSecenek: (etiket, deger, kosulAciklamasi) =>
    `${adGoster(etiket)} için "${deger}" yalnızca şu durumda seçilebilir: ${kosulAciklamasi}.`,
  gorunmeyenAlan: (etiket) => `${adGoster(etiket)} bu senaryoda ekranda görünmüyor; verilen değer kullanılmaz.`,
  birlikteZorunlu: (etiket, digerEtiket) => `${adGoster(etiket)} verildiyse ${digerEtiket ? `"${digerEtiket}"` : 'bağlı alan'} de verilmelidir.`,
  profilYok: (etiket, anahtar) => `${adGoster(etiket)} için "${anahtar}" adlı hazır profil bulunamadı.`,
  profilVeKimlikBirlikte: (etiket) => `${adGoster(etiket)} için hazır profil ve yeni kimlik aynı anda verilemez; birini seçin.`,
  profilYaDaKimlikZorunlu: (etiket) => `${adGoster(etiket)} için hazır bir profil seçilmeli ya da yeni kimlik bilgileri girilmelidir.`,
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
  kartSuresiGecmis: (aaYyyy) => `Kartın son kullanma tarihi (${aaYyyy}) geçmiş; bu ay ya da sonrası olmalıdır.`,
  varsayilanKayitSuresiGecmis: (etiket, aaYyyy) =>
    `${adGoster(etiket)} için kullanılacak varsayılan test verisi kaydının son kullanma tarihi (${aaYyyy}) geçmiş; adım bu kayıtla reddedilebilir. Test verisindeki kaydı güncelleyin ya da senaryoya özel değer girin.`,
  eskiBeklenenSonucAlanlari: (alanlar) =>
    `Eski ${alanlar.map((a) => `"${a}"`).join('/')} alanları artık desteklenmiyor; "beklenenSonuc": { "tip": "isKuraliHatasi", "adim": "...", "mesaj": "..." } kullanın.`,
  tabloBasvurusuAlamaz: (etiket) => `${adGoster(etiket)} test verisi tablosundan değer (\${Tablo.Sütun}) alamaz; değeri doğrudan seçin.`,
  tabloYok: (etiket, tablo) => `${adGoster(etiket)} için "${tablo}" adında test verisi tablosu yok (Ayarlar > Test verisi).`,
  tabloSutunuYok: (etiket, tablo, sutun) => `${adGoster(etiket)} için "${tablo}" tablosunda "${sutun}" sütunu yok.`,
  gizliSutunSecimde: (etiket, sutun) => `${adGoster(etiket)} bir seçim alanı; gizli "${sutun}" sütunundan değer alamaz.`,
  gizliSutunDosyada: (etiket, sutun) => `${adGoster(etiket)} bir dosya alanı; gizli "${sutun}" sütunundan dosya adı alamaz.`,
  bilerekBos: (etiket) => `${adGoster(etiket)} bu senaryoda bilerek boş bırakılıyor (olumsuz senaryo); koşucu bu alana değer yazmaz (varsayılanı da).`
});

/**
 * Senaryo verisinde bilerek boş bırakılan alanların senaryo anahtarları (olumsuz senaryo: "zorunlu alan boşken uyarı çıkmalı").
 * Listedeki zorunlu alan boşsa hata değil uyarı verilir; koşucu bu alanlara modelin varsayılanını da yazmaz.
 */
export const BILEREK_BOS_ANAHTARI = 'bilerekBos';

/** Senaryonun bilerek boş bıraktığı alan anahtarları. @param {unknown} senaryo @returns {string[]} */
export function bilerekBosAnahtarlari(senaryo) {
  const liste = nesneMi(senaryo) ? senaryo[BILEREK_BOS_ANAHTARI] : undefined;
  return Array.isArray(liste) ? liste.filter((x) => typeof x === 'string' && x) : [];
}

// ---- Tablo başvurusu (ekran senaryosunda değer: ${Tablo.Sütun} / ${Tablo[etiket].Sütun|biçim}) ----
// Biçim scripts/platform/tablolar/tablo-secimi.mjs > degerBasvurusu ile AYNIDIR (bu dosya modül içe aktarmaz; birim testi iki
// ayrıştırıcının aynı sonucu verdiğini denetler). Değer koşuda senaryonun seçtiği satırdan çözülür (tablolar/ekran-basvurulari.mjs).
const TABLO_ADI_KALIBI = '[^.\\[\\]{}$<>&|\\u0000-\\u001f]{1,60}';
const TABLO_BASVURUSU = new RegExp(`^\\s*\\$\\{\\s*(${TABLO_ADI_KALIBI})(?:\\[([\\p{L}\\p{N} _-]{1,40})\\])?\\.(${TABLO_ADI_KALIBI})\\s*(?:\\|([^{}$\\u0000-\\u001f]{1,60}))?\\}\\s*$`, 'u');
/**
 * Tablo başvurusu alabilen alan tipleri. Onay kutusunda tablodaki değer evet / hayır olarak okunur (true/false, evet/hayır, 1/0,
 * E/H); dosya alanında değer izinli klasördeki dosyanın adıdır (ikisi de koşuda denetlenir; ekran-basvurulari.mjs ekrandakiDeger).
 */
const TABLODAN_ALABILIR = ['secim', 'okluSecim', 'radyo', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'dosya'];

/** Değerin tamamı "${Tablo.Sütun}" ise { tablo, etiket, sutun, bicim }, değilse null. */
export function tabloBasvurusuCoz(deger) {
  if (typeof deger !== 'string') return null;
  const m = TABLO_BASVURUSU.exec(deger);
  return m ? { tablo: m[1].trim(), etiket: (m[2] || '').trim(), sutun: m[3].trim(), bicim: (m[4] || '').trim() } : null;
}

/**
 * Başvuruyu alan tipine ve (verildiyse) projenin tablolarına göre denetler. tablolar: [{ ad, sutunlar: [{ ad, gizli }] }]; verilmezse
 * tablo / sütun varlığı denetlenmez (ör. tarayıcıda; sunucu kaydederken denetler).
 */
function tabloBasvurusunuDogrula(alan, anahtar, b, tablolar, rapor) {
  const etiket = etiketi(alan);
  if (!TABLODAN_ALABILIR.includes(alan.tip)) { rapor.hata(anahtar, MESAJLAR.tabloBasvurusuAlamaz(etiket)); return; }
  if (!Array.isArray(tablolar)) return;
  const kucuk = (x) => String(x || '').trim().toLocaleLowerCase('tr');
  const t = tablolar.find((x) => x && kucuk(x.ad) === kucuk(b.tablo));
  if (!t) { rapor.hata(anahtar, MESAJLAR.tabloYok(etiket, b.tablo)); return; }
  const s = (Array.isArray(t.sutunlar) ? t.sutunlar : []).find((x) => x && kucuk(x.ad) === kucuk(b.sutun));
  if (!s) { rapor.hata(anahtar, MESAJLAR.tabloSutunuYok(etiket, t.ad, b.sutun)); return; }
  if (s.gizli === true && ['secim', 'okluSecim', 'radyo'].includes(alan.tip)) rapor.hata(anahtar, MESAJLAR.gizliSutunSecimde(etiket, s.ad));
  if (s.gizli === true && alan.tip === 'dosya') rapor.hata(anahtar, MESAJLAR.gizliSutunDosyada(etiket, s.ad));
}

// ---- Küçük yardımcılar ----

function nesneMi(deger) {
  return typeof deger === 'object' && deger !== null && !Array.isArray(deger);
}

function bosMu(deger) {
  return deger === undefined || deger === null || (typeof deger === 'string' && deger.trim() === '');
}

/** Alanın kullanıcıya görünen etiketi; yoksa '' (mesajlar "Bu alan" yazar; iç anahtar gösterilmez). */
function etiketi(alan) {
  return (alan && alan.etiket && (alan.etiket.form || alan.etiket.ekran)) || (alan && alan.form && alan.form.etiket) || '';
}

/** Alanın kayıt içindeki adı (eslesme.kayitAlani) ya da undefined. */
function kayitAlaniAdi(alan) {
  return alan && nesneMi(alan.eslesme) ? alan.eslesme.kayitAlani : undefined;
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
    // Veride kullanılan biçim: 10 hane, 5 ile başlar, başında 0/+90 yok (ör. 5XXXXXXXXX).
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
 * Kayıt alanlarının (alt model > bölüm > eslesme.kayitAlani) adına bağlı biçim kuralları (kart biçimi:
 * numara, güvenlik kodu, son kullanma). Kuralı olmayan kayıt alanında zorunluluk ve — modeldeki alan
 * tanımında seçenekler varsa — değerin seçeneklerden biri olması denetlenir (ör. taksit sayısı: izinli
 * değerler modelden gelir, kodda sabit üst sınır yoktur). secim: değer { deger, metin } nesnesinden okunur
 * (kuralı olmayan alanda: tip "secim" ya da değer { deger } nesnesiyse). dogrula(metin) → hata mesajı ya da null.
 */
const KAYIT_ALANI_KURALLARI = {
  isim: { secim: false, dogrula: () => null },
  soyisim: { secim: false, dogrula: () => null },
  kartNo: { secim: false, dogrula: (d) => (/^\d{16}$/.test(d.replace(/\s+/g, '')) ? null : MESAJLAR.kartNoBicim()) },
  guvenlikKodu: { secim: false, dogrula: (d) => (/^\d{3,4}$/.test(d.trim()) ? null : MESAJLAR.cvvBicim()) },
  sonKullanmaAyi: { secim: true, dogrula: (d) => (aralikta(d, 1, 12) === null ? MESAJLAR.kartAyBicim() : null) },
  sonKullanmaYili: { secim: true, dogrula: (d) => (/^\d{4}$/.test(d) ? null : MESAJLAR.kartYilBicim()) }
};

/** Kuralı olmayan kayıt alanı: modelde seçenekler tanımlıysa izinli değerler (yoksa null — yalnız zorunluluk). */
function kayitAlaniSecenekleri(kayitAlani) {
  const liste = Array.isArray(kayitAlani.secenekler) ? kayitAlani.secenekler : [];
  const degerler = liste.map((x) => secimDegeri(x)).filter((d) => d !== '');
  return degerler.length ? degerler : null;
}

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

/** Taksit sayısının görünen metni ("Tek Çekim" kalıbı). */
export function taksitMetni(sayi) {
  return sayi === 1 ? 'Tek Çekim' : `${sayi} Taksit`;
}

/**
 * Doğrulanmış kart kaydını varsayılan kayıtla aynı biçime getirir: kart no boşluksuz,
 * ay { deger: "1", metin: "01" }, yıl { deger, metin }, taksit metni varsayılan kayıttaki
 * aynı değerin metni (ör. "Tek Çekim") ya da taksitMetni(). Önce doğrulayın.
 */
export function kartiNormallestir(ham, varsayilanKart) {
  const ay = aralikta(secimDegeri(ham.sonKullanmaAyi), 1, 12);
  const yil = secimDegeri(ham.sonKullanmaYili);
  const taksit = secimDegeri(ham.taksit);
  const taksitSayisi = /^\d{1,3}$/.test(taksit) ? Number(taksit) : null;
  const varsayilanTaksit = varsayilanKart && nesneMi(varsayilanKart.taksit) ? varsayilanKart.taksit : null;
  return {
    isim: String(ham.isim).trim(),
    soyisim: String(ham.soyisim).trim(),
    kartNo: String(ham.kartNo).replace(/\s+/g, ''),
    guvenlikKodu: String(ham.guvenlikKodu).trim(),
    sonKullanmaAyi: { deger: String(ay), metin: ikiHane(ay) },
    sonKullanmaYili: { deger: yil, metin: yil },
    taksit: {
      deger: taksit,
      metin: varsayilanTaksit && secimDegeri(varsayilanTaksit) === taksit && varsayilanTaksit.metin
        ? String(varsayilanTaksit.metin)
        : nesneMi(ham.taksit) && ham.taksit.metin ? String(ham.taksit.metin)
          : taksitSayisi !== null && taksitSayisi > 0 ? taksitMetni(taksitSayisi) : taksit
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
 * Doğrulama bağlamının profil parçası (baglam.profiller) →
 * { havuzlar, baglamProfilleri, varsayilanKayit } ya da null (verilmediyse profil kontrolleri atlanır).
 *  - havuzlar: profil havuzu adı (modelde eslesme.profilHavuzu) → { profilAdı: kayıt }.
 *  - baglamProfilleri: bağlam profili adı → { kod } (bilinenDurumlar[].profilKodu ile eşleşir).
 *  - varsayilanKayit: alt model ezme alanında senaryo değer vermezse kullanılacak kayıt.
 */
function profilBaglami(baglam) {
  const p = nesneMi(baglam.profiller) ? baglam.profiller : null;
  if (!p) return null;
  const havuzlar = { ...(nesneMi(p.havuzlar) ? p.havuzlar : {}) };
  const baglamProfilleri = nesneMi(p.baglamProfilleri) ? p.baglamProfilleri : undefined;
  if (baglamProfilleri && !('baglam' in havuzlar)) havuzlar.baglam = baglamProfilleri;
  return { havuzlar, baglamProfilleri, varsayilanKayit: nesneMi(p.varsayilanKayit) ? p.varsayilanKayit : null };
}

/** Modeldeki profil havuzu (ad) → bağlamdaki kayıtlar (bağlamda yoksa undefined: kontrol atlanır). */
function profilHavuzu(ad, profiller) {
  if (!profiller || typeof ad !== 'string') return undefined;
  const havuz = profiller.havuzlar[ad];
  return nesneMi(havuz) ? havuz : undefined;
}

/** Eşleşme kodu: bilinenDurumlar[].profilKodu ya da bağlam profilinin kod'u. */
function durumKodu(durum) {
  if (!nesneMi(durum)) return undefined;
  return durum.profilKodu !== undefined ? durum.profilKodu : durum.kod;
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
  const kaynak = baglam.kaynak === 'girdi' ? 'girdi' : 'kayit';
  const icBaglam = {
    model,
    altModeller: baglam.altModeller || {},
    profiller: profilBaglami(baglam),
    kaynak,
    simdi: baglam.simdi instanceof Date ? baglam.simdi : new Date(),
    senaryo,
    alanlar,
    idAlan,
    alanDegeri: (id) => (idAnahtar[id] !== undefined ? senaryo[idAnahtar[id]] : undefined),
    baglamKodu: undefined
  };
  icBaglam.baglamKodu = baglamKodunuBul(icBaglam);
  return icBaglam;
}

/** Bağlam profilini seçen model alanı (id "baglamProfili"). */
function baglamProfiliAlani(alanlar) {
  const id = GIRDI_ALANLARI.baglamKodu.modelAlani;
  return Array.isArray(alanlar) ? alanlar.find((a) => a && a.id === id) : alanlar[id];
}

/**
 * Senaryonun çalışacağı bağlam profilinin kodu: girdide elle yazılan baglamKodu; yoksa bağlam profili
 * alanının değeri (yoksa modeldeki varsayılan profil adı) → bağlam profilinin kodu. Bulunamazsa undefined
 * (bağlam profiline bağlı görünürlük "bilinmiyor" olur).
 */
function baglamKodunuBul(b) {
  const s = b.senaryo;
  const girdiKodu = s.baglamKodu;
  if (b.kaynak === 'girdi' && typeof girdiKodu === 'string' && girdiKodu.trim()) return girdiKodu.trim();
  const alan = baglamProfiliAlani(b.idAlan);
  const anahtar = alan ? senaryoAnahtarlari(alan)[0] : GIRDI_ALANLARI.baglamKodu.modelAlani;
  const varsayilan = alan && alan.varsayilan ? alan.varsayilan.deger : undefined;
  const profilAnahtari = typeof s[anahtar] === 'string' && s[anahtar] ? s[anahtar] : varsayilan;
  const profiller = b.profiller && b.profiller.baglamProfilleri;
  if (typeof profilAnahtari !== 'string' || !nesneMi(profiller)) return undefined;
  const kod = durumKodu(profiller[profilAnahtari]);
  return kod !== undefined && kod !== null && kod !== '' ? String(kod) : undefined;
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
    // Değeri tablodan (${Tablo.Sütun}) gelen alan: değer koşuda belli olur, koşul bilinmiyor.
    if (tabloBasvurusuCoz(deger)) return null;
    if (Array.isArray(ifade.icinde)) return ifade.icinde.includes(deger);
    return deger === ifade.esit;
  }
  if (typeof ifade.senaryoAyari === 'string') return b.alanDegeri(ifade.senaryoAyari) === ifade.esit;
  if (ifade.calismaZamani === 'gorunurse') {
    // POM alanın ekranda görünüp görünmediğine çalışma anında bakıyor; doğrulayıcı, koşulun
    // bağlam profili bazında bilinen durumlarından (bilinenDurumlar > profilKodu) karar verir.
    if (!Array.isArray(bilinenDurumlar) || !b.baglamKodu) return null;
    const durum = bilinenDurumlar.find((d) => d && durumKodu(d) === b.baglamKodu);
    return durum && typeof durum.gorunur === 'boolean' ? durum.gorunur : null;
  }
  return null; // { baglam: { alanSeti } } — hedef ifade, veride henüz yok.
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
  // Açıklaması olmayan koşulun iç adı gösterilmez.
  return (kosul && kosul.aciklama) || 'ilgili koşul sağlandığında';
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
      bagli: { etiket: bagliAlan ? etiketi(bagliAlan) : '', deger: bagliDeger },
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
  const havuz = profilHavuzu(havuzYolu, b.profiller);
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
 * odeyenOzelKimligi ↔ ozel, odeyenTuzelKimligi ↔ tuzel).
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
  if (!tur) return; // bağlı alan (ödeyen) geçersiz; hatası orada.
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
    // "ad" | { ad, dilim } | { <tür>: "ad" | { ad, dilim } } (dilimli alanda profilin tüm değeri denetlenir).
    const ref = typeof k === 'string' || (nesneMi(k) && typeof k.ad === 'string') ? k : nesneMi(k) ? k[tur] : undefined;
    const kimlikAlani = typeof ref === 'string' ? ref : nesneMi(ref) && typeof ref.ad === 'string' ? ref.ad : undefined;
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

function kayitBolumu(alan, b) {
  const basvuru = alan.altModel;
  const altModel = basvuru ? b.altModeller[basvuru.dosya] : undefined;
  return altModel ? (altModel.bolumler || []).find((bolum) => bolum.id === basvuru.bolum) : undefined;
}

/**
 * altModelGecersizKilma: senaryoya özel kayıt (alt model bölümünün eslesme.kayitAlani alanları) ya da —
 * senaryo değer vermediyse — varsayılan test verisi kaydının süresi geçmiş uyarısı.
 */
function kayitAlaniniDogrula(alan, gorunur, b, rapor) {
  const anahtar = senaryoAnahtarlari(alan)[0];
  const etiket = etiketi(alan);
  const kayit = b.senaryo[anahtar];
  if (bosMu(kayit)) {
    const varsayilan = b.profiller && b.profiller.varsayilanKayit;
    if (gorunur === true && nesneMi(varsayilan) && kartSuresiGectiMi(varsayilan, b.simdi) === true) {
      rapor.uyari(anahtar, MESAJLAR.varsayilanKayitSuresiGecmis(etiket, kartSonKullanmaMetni(varsayilan)));
    }
    return;
  }
  if (gorunur === false) {
    const kosul = alan.gorunurluk && typeof alan.gorunurluk.kosul === 'string' ? kosulAciklamasi(alan.gorunurluk.kosul, b) : 'ilgili koşul sağlandığında';
    rapor.hata(anahtar, MESAJLAR.kosulluAlan(etiket, kosul));
    return;
  }
  if (!nesneMi(kayit)) {
    rapor.hata(anahtar, MESAJLAR.nesneOlmali(etiket));
    return;
  }
  const bolum = kayitBolumu(alan, b);
  if (!bolum) return;
  let hataVar = false;
  for (const kayitAlani of bolum.alanlar || []) {
    const k = kayitAlaniAdi(kayitAlani);
    if (typeof k !== 'string') continue;
    const yol = `${anahtar}.${k}`;
    const kural = Object.prototype.hasOwnProperty.call(KAYIT_ALANI_KURALLARI, k) ? KAYIT_ALANI_KURALLARI[k] : undefined;
    const ham = kayit[k];
    const secim = kural ? kural.secim : kayitAlani.tip === 'secim' || (nesneMi(ham) && 'deger' in ham);
    const metin = secim ? secimDegeri(ham) : typeof ham === 'string' ? ham : bosMu(ham) ? '' : null;
    if (metin === null) {
      rapor.hata(yol, MESAJLAR.metinOlmali(etiketi(kayitAlani)));
      hataVar = true;
      continue;
    }
    if (metin.trim() === '') {
      if (kayitAlani.zorunlu === true) {
        rapor.hata(yol, MESAJLAR.zorunlu(etiketi(kayitAlani)));
        hataVar = true;
      }
      continue;
    }
    const izinliler = kural ? null : kayitAlaniSecenekleri(kayitAlani);
    const mesaj = kural ? kural.dogrula(metin)
      : izinliler && !izinliler.includes(metin.trim()) ? MESAJLAR.secenekDisi(etiketi(kayitAlani), metin.trim(), izinliler) : null;
    if (mesaj) {
      rapor.hata(yol, mesaj);
      hataVar = true;
    }
  }
  if (!hataVar && kartSuresiGectiMi(kayit, b.simdi) === true) {
    rapor.hata(`${anahtar}.sonKullanmaYili`, MESAJLAR.kartSuresiGecmis(kartSonKullanmaMetni(kayit)));
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
    const altEtiket = tanim.etiket || '';
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

/** Modelde ifade edilemeyen "ikisi birlikte" kuralları: [a, b] → a verildiyse b de (ve tersi); model iki alanı da taşıyorsa. */
const BIRLIKTE_VERILENLER = [['cokluSorguDosyasi', 'cokluSorguKisiSayisi']];

// ---- Ana giriş ----

/**
 * Senaryoyu modele göre doğrular.
 *  - baglam.model / altModeller: ekran modeli ve alt modelleri (dosya adı → alt model).
 *  - baglam.profiller: { havuzlar, baglamProfilleri, varsayilanKayit }; parçası eksikse o kontrol atlanır (ör. profiller yüklenmediyse profil varlığı kontrol edilmez).
 *  - baglam.kaynak: 'kayit' (kayıtlı senaryo; varsayılan) | 'girdi' (dashboard
 *    formunun gönderdiği gövde: başlık sonradan verilebilir, baglamKodu/baglamKullanicisi olabilir).
 *  - baglam.simdi: tarih kontrolleri için "şimdi" (testlerde sabitlenir).
 *  - baglam.tablolar: [{ ad, sutunlar: [{ ad, gizli }] }] — değeri ${Tablo.Sütun} olan alanlarda tablo / sütun varlığı buna göre
 *    denetlenir (verilmezse yalnız alan tipi denetlenir).
 * hatalar: kaydı/koşuyu engeller. uyarilar: engellemez (ör. varsayılan kaydın süresi geçmiş,
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
  const bilerekBos = bilerekBosAnahtarlari(senaryo);

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
      kayitAlaniniDogrula(alan, gorunur, b, rapor);
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
      // Görünmeyen alan zorunlu değildir; görünürlüğü bilinmiyorsa (null) zorunlu kalır. Bilerek boş bırakılan (olumsuz senaryo)
      // alan hata değil uyarıdır (başlık hariç).
      const zorunluBos = alan.zorunlu === true && gorunur !== false && !sonradanVerilir;
      if (zorunluBos && anahtar !== 'baslik' && bilerekBos.includes(anahtar)) rapor.uyari(anahtar, MESAJLAR.bilerekBos(etiketi(alan)));
      else if (zorunluBos) rapor.hata(anahtar, MESAJLAR.zorunlu(etiketi(alan)));
      continue;
    }
    // Değer tablodan: ${Tablo.Sütun} (seçenek / biçim denetimi koşuda çözülen değere kalır).
    const tb = tabloBasvurusuCoz(deger);
    if (tb) {
      tabloBasvurusunuDogrula(alan, anahtar, tb, baglam.tablolar, rapor);
      if (gorunur === false) rapor.uyari(anahtar, MESAJLAR.gorunmeyenAlan(etiketi(alan)));
      continue;
    }
    // Girdide bağlam kodu elle yazıldıysa (baglamKodu) profil anahtarı kullanılmaz.
    basitAlaniDogrula(alan, anahtar, deger, b, rapor);
    const havuzYolu = alan.eslesme && alan.eslesme.profilHavuzu;
    if (typeof havuzYolu === 'string') havuzuDogrula(alan, anahtar, deger, havuzYolu, b, rapor);
    if (gorunur === false && (alan.tip !== 'onayKutusu' || deger === true)) rapor.uyari(anahtar, MESAJLAR.gorunmeyenAlan(etiketi(alan)));
  }

  const alanKaydi = (anahtar) => b.alanlar.find(({ alan }) => senaryoAnahtarlari(alan).includes(anahtar));
  const alanEtiketi = (anahtar) => {
    const kayit = alanKaydi(anahtar);
    return kayit ? etiketi(kayit.alan) : '';
  };
  for (const [a, c] of BIRLIKTE_VERILENLER) {
    // Yalnızca iki alanı da taşıyan modellerde (ör. kişi sayısı alanı olmayan bir akışta kural uygulanmaz).
    if (!alanKaydi(a) || !alanKaydi(c)) continue;
    if (!bosMu(senaryo[a]) && bosMu(senaryo[c])) rapor.hata(c, MESAJLAR.birlikteZorunlu(alanEtiketi(a), alanEtiketi(c)));
    if (!bosMu(senaryo[c]) && bosMu(senaryo[a])) rapor.hata(a, MESAJLAR.birlikteZorunlu(alanEtiketi(c), alanEtiketi(a)));
  }

  if (b.kaynak === 'girdi') {
    const baglamAlani = baglamProfiliAlani(b.idAlan);
    const kontroller = baglamAlani && baglamAlani.form
      ? [baglamAlani.form.etiket, ...(baglamAlani.form.yardimciKontroller || []).map((k) => k.amac)]
      : [];
    const kodEtiketi = kontroller[GIRDI_ALANLARI.baglamKodu.formSirasi] || 'Bağlam kodu';
    const kullaniciEtiketi = kontroller[GIRDI_ALANLARI.baglamKullanicisi.formSirasi] || 'Bağlam kullanıcısı';
    const kod = senaryo.baglamKodu;
    const kullanici = senaryo.baglamKullanicisi;
    if (!bosMu(kod) && bosMu(kullanici)) rapor.hata('baglamKullanicisi', MESAJLAR.birlikteZorunlu(kodEtiketi, kullaniciEtiketi));
    if (!bosMu(kullanici) && bosMu(kod)) rapor.hata('baglamKodu', MESAJLAR.birlikteZorunlu(kullaniciEtiketi, kodEtiketi));
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
 * Hata alanı yolunun (ör. "odeyenTuzelKimligi.vergiKimlikNo") dashboard formundaki aday
 * kontrol id'leri — modelin form karşılıklarından türetilir. Tarayıcı sayfada VAR olan
 * ilk adayı kullanır (ör. tüzel ödeyende sof_odeyenTc yerine sof_odeyenVkn çizilir).
 */
export function alanFormKimlikleri(alanYolu, baglam) {
  const model = baglam.model;
  const [anahtar, ...geri] = String(alanYolu).split('.');
  const alt = geri.join('.');
  const kontroller = (alan) => (alan && alan.form ? [alan.form.id, ...(alan.form.yardimciKontroller || []).map((k) => k.id)] : []);
  const alanlar = modelAlanlari(model).map(({ alan }) => alan);

  if (Object.prototype.hasOwnProperty.call(GIRDI_ALANLARI, anahtar)) {
    const tanim = GIRDI_ALANLARI[anahtar];
    const id = kontroller(baglamProfiliAlani(alanlar))[tanim.formSirasi];
    return id ? [id] : [];
  }
  const sahip = alanlar.find((a) => senaryoAnahtarlari(a).includes(anahtar));
  if (!sahip) return [];
  if (sahip.tip === 'altModelGecersizKilma') {
    // Kaydın tamamına ait bulgu (ör. varsayılan kayıt uyarısı) kayıt bloğunun alanlarına gösterilir.
    const bolum = kayitBolumu(sahip, { altModeller: baglam.altModeller || {} });
    const kayitAlanlari = ((bolum && bolum.alanlar) || []).filter((a) => kayitAlaniAdi(a) && (!alt || kayitAlaniAdi(a) === alt));
    return kayitAlanlari.flatMap(kontroller);
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
