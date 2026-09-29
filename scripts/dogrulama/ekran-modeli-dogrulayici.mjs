// EKRAN MODELİ YAPISAL DOĞRULAYICISI (genel, TEK KAYNAK) — testler (tests/support/ekran-modeli.ts),
// platform sunucusu (ekran paketi, model sürümleri) ve birim testleri aynı kuralları buradan kullanır.
// Kurallar ekran modelinin KENDİSİNİ denetler: bilinen anahtarlar/tipler, benzersiz alan/bölüm/adım
// kimlikleri, koşul ifadelerinin biçimi, adım/koşul/alan/alt model başvurularının varlığı, bağlam
// profili görünürlüğü gözlemleri. Senaryo verisinin modele uygunluğu senaryo-dogrulayici.mjs'dedir.
//
//  - Bu dosya hiçbir modül import etmez; Node'a/DOM'a özgü API kullanmaz.
//  - Hata varsa TÜM sorunlar toplanır ve TEK bir Türkçe Error'da listelenir.
// Tipler: ekran-modeli-dogrulayici.d.mts (modelin TypeScript tipleri: tests/support/ekran-modeli.ts).

/**
 * Bu doğrulayıcının anladığı EN YENİ model şema sürümü. Sürüm 1 modeller aynen geçerlidir (geriye uyumlu).
 * Sürüm 2: adımların koşu tanımı ("kosu": aksiyonlar, başarı/hata göstergesi — model koşucusu kullanır) ve
 * okluSecim doldurucusunun ok düğmeleri (konum.yardimci.ileri/geri) zorunluluğu.
 */
export const DESTEKLENEN_SEMA_SURUMU = 2;
/** Kabul edilen şema sürümleri. */
export const SEMA_SURUMLERI = Object.freeze([1, 2]);
/**
 * Adım koşu tanımındaki aksiyon türleri: tikla (düğme/bağlantı), bekle (öğe görünür/gizli olana kadar), ekranaDon (ekranın adresi
 * yeniden açılır; ör. ortak akış başka sayfaya götürdükten sonra — seçicisiz, hangi ekrana eklenirse onun adresi).
 */
export const AKSIYON_TURLERI = Object.freeze(['tikla', 'bekle', 'ekranaDon']);
/**
 * Tıklama koşulları: gorunurse → öğe kısa bir süre (varsayılan GORUNURSE_BEKLEME_SN; aksiyonun zamanAsimiSn'i ile ayarlanır,
 * adımın süresinden bağımsız) beklenir; görünürse tıklanır, görünmezse atlanır (hata değil; raporda not). Ör. bazı ekranlarda
 * çıkan, bazılarında çıkmayan ara pencere düğmesi.
 */
export const AKSIYON_KOSULLARI = Object.freeze(['gorunurse']);
/** "gorunurse" tıklamasında öğenin görünmesi için varsayılan kısa bekleme (sn). */
export const GORUNURSE_BEKLEME_SN = 5;
/** Adımın başarı göstergesi türleri: metin (sayfada/öğede metin), eleman (öğe görünür), url (adres deseni), desen (öğenin/sayfanın metni düzenli ifadeye uyar). */
export const BASARI_GOSTERGESI_TURLERI = Object.freeze(['metin', 'eleman', 'url', 'desen']);
/** "veya" başarı göstergesinde en çok seçenek (herhangi biri görünürse adım başarılı). */
export const VEYA_EN_COK = 5;
/** Adımda kabul edilen iş kuralı uyarıları (kosu.uyarilar) en çok. */
export const UYARI_EN_COK = 10;

export const ALAN_TIPLERI = Object.freeze([
  'secim', 'okluSecim', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'radyo', 'dosya',
  'kimlikProfili', 'buton', 'baglanti', 'cikti', 'tablo', 'diyalog', 'birlesim', 'altModelGecersizKilma'
]);
export const YAPILANDIRMA_TURLERI = Object.freeze([
  'senaryo', 'urun', 'turetilmis', 'sabit', 'cikti', 'aksiyon', 'dokunulmuyor', 'harici'
]);
export const DOLDURUCULAR = Object.freeze([
  'secimGerekirse', 'secim', 'okluSecim', 'metinDoldur', 'tuslayarakYaz', 'tarihJs', 'telefonTuslama',
  'onayKutusuZorla', 'radyoZorla', 'dosyaYukle', 'tcSorgulu', 'musteriSorgula', 'degerJs', 'ozelSecim'
]);
/** Çerçeve (iframe) zincirinin en çok derinliği (konum / aksiyon / gösterge "cerceve"si). */
export const CERCEVE_EN_DERIN = 2;
export const FORM_KONTROLLERI = Object.freeze(['select', 'text', 'number', 'checkbox', 'radio', 'file', 'password', 'textarea']);
export const SECENEK_DURUMLARI = Object.freeze(['tam', 'kismi', 'bilinmiyor', 'dinamik']);
export const KIRILGANLIK_DUZEYLERI = Object.freeze(['dusuk', 'orta', 'yuksek']);

function nesneMi(d) {
  return typeof d === 'object' && d !== null && !Array.isArray(d);
}
function metinMi(d) {
  return typeof d === 'string' && d.length > 0;
}
function listedeMi(liste, d) {
  return typeof d === 'string' && liste.includes(d);
}

/** Alanın kayıt içindeki adı (eslesme.kayitAlani) ya da undefined. */
export function kayitAlaniAdi(alan) {
  return nesneMi(alan) && nesneMi(alan.eslesme) ? alan.eslesme.kayitAlani : undefined;
}

/** Modelin bağlam profili ekranı (baglam) ya da undefined. */
export function baglamEkrani(model) {
  return nesneMi(model) ? model.baglam : undefined;
}

const ALAN_ANAHTARLARI = new Set([
  'id', 'tip', 'etiket', 'secenekler', 'seceneklerDurumu', 'seceneklerKaynagi', 'bagimlilik', 'zorunlu',
  'benzersiz', 'varsayilan', 'yapilandirma', 'eslesme', 'konum', 'doldurucu', 'doldurucuParametreleri',
  'gorunurluk', 'form', 'dogrulama', 'altAlanlar', 'ekranAlanlari', 'altModel', 'varyantlar', 'akisPlani',
  'kimlikTuru', 'bicim', 'kabul', 'birim', 'hassas', 'ekrandaAlanDegil', 'sira', 'sonKontrol', 'kullanim',
  'excelSutunlari', 'durum', 'notlar', 'mutlakaGorunmeli', 'sabitDeger', 'sinirlar'
]);
/**
 * Alanın uygulamadaki değer kuralları (sınır değer önerileri yalnız bunlardan üretilir; senaryo verisini kısıtlamaz):
 * sayıda enAz / enCok (sayı) ve artis (sınırın bir yanındaki değer farkı, varsayılan 1); tarihte enAz / enCok ("bugun",
 * "bugun+7", "bugun-3" ya da alanın biçiminde / yyyy-aa-gg tarih); metinde enAzUzunluk / enCokUzunluk (tam sayı) ve desen
 * (düzenli ifade; değerin tamamı uymalı).
 */
const SINIR_ANAHTARLARI = new Set(['enAz', 'enCok', 'artis', 'enAzUzunluk', 'enCokUzunluk', 'desen', 'not']);
const GORELI_TARIH = /^bugun(\s*[+-]\s*\d{1,5})?$/;
const MUTLAK_TARIH = /^(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})$/;

/**
 * Alan tipine göre "sinirlar" sorunları (Türkçe; yer öneki yok). Akış tasarımcısı da alan düzenleyicide aynı mesajları gösterir.
 * @param {unknown} tip alan tipi @param {unknown} sinirlar @returns {string[]}
 */
export function sinirHatalari(tip, sinirlar) {
  const t = hataToplayici();
  sinirlarDogrula(t, '', { tip, sinirlar });
  return t.hatalar.map((m) => m.replace(/^: /, ''));
}

function sinirlarDogrula(h, yer, alan) {
  const s = alan.sinirlar;
  if (!nesneMi(s)) { h.ekle(yer, '"sinirlar" nesne olmalı'); return; }
  h.bilinmeyenAnahtarlar(yer, s, SINIR_ANAHTARLARI);
  const sayiMi = (d) => typeof d === 'number' && Number.isFinite(d);
  const tamSayiMi = (d) => Number.isInteger(d) && d >= 0;
  for (const ad of ['enAz', 'enCok']) {
    const d = s[ad];
    if (d === undefined) continue;
    if (alan.tip === 'tarih') {
      if (typeof d !== 'string' || !(GORELI_TARIH.test(d.trim()) || MUTLAK_TARIH.test(d.trim()))) h.ekle(yer, `"${ad}" tarihte "bugun", "bugun+7" ya da gg.aa.yyyy / yyyy-aa-gg olmalı`);
    } else if (!sayiMi(d)) h.ekle(yer, `"${ad}" sayı olmalı`);
  }
  if (sayiMi(s.enAz) && sayiMi(s.enCok) && s.enAz > s.enCok) h.ekle(yer, '"enAz" "enCok"tan büyük olamaz');
  if (s.artis !== undefined && !(sayiMi(s.artis) && s.artis > 0)) h.ekle(yer, '"artis" pozitif sayı olmalı');
  for (const ad of ['enAzUzunluk', 'enCokUzunluk']) if (s[ad] !== undefined && !tamSayiMi(s[ad])) h.ekle(yer, `"${ad}" 0 ya da pozitif tam sayı olmalı`);
  if (tamSayiMi(s.enAzUzunluk) && tamSayiMi(s.enCokUzunluk) && s.enAzUzunluk > s.enCokUzunluk) h.ekle(yer, '"enAzUzunluk" "enCokUzunluk"tan büyük olamaz');
  if (s.desen !== undefined) {
    if (!metinMi(s.desen)) h.ekle(yer, '"desen" boş olmayan metin olmalı');
    else { try { new RegExp(s.desen, 'u'); } catch { h.ekle(yer, '"desen" geçerli bir düzenli ifade değil'); } }
  }
}
const ESLESME_ANAHTARLARI = new Set(['senaryo', 'urun', 'kayitAlani', 'kimlikAlani', 'profilHavuzu', 'harici', 'donusum', 'not']);
const FORM_ANAHTARLARI = new Set(['id', 'kontrol', 'etiket', 'secenekler', 'yardimciKontroller', 'not']);
const SECENEK_ANAHTARLARI = new Set(['deger', 'metin', 'formMetni', 'senaryoDegeri', 'ekranDegerleri', 'secici', 'kosul']);
const ADIM_ANAHTARLARI = new Set(['id', 'sira', 'baslik', 'pomMetodu', 'gorunurluk', 'bolumler', 'altModel', 'ortakAkis', 'sqlKontrolu', 'dosyaKontrolu', 'yenidenGiris', 'kosu']);
/** Dosya adımının beklenti türleri (platform/dosyalar/dosya-icerigi.mjs ile aynı; bu dosya modül içe aktarmaz). */
export const DOSYA_BEKLENTI_TURLERI = Object.freeze(['adDeseni', 'enAzBoyut', 'icerir', 'icermez', 'sutunVar', 'satirSayisi', 'hucre']);
/** SQL adımının beklenen sonuç türleri (platform/sql/sql-adimi.mjs ile aynı; bu dosya modül içe aktarmaz). */
export const SQL_BEKLENEN_TURLERI = Object.freeze(['satirSayisi', 'sutunDegeri', 'bosDegil', 'bos', 'tabloEsit']);
const KOSU_ANAHTARLARI = new Set(['aksiyonlar', 'basariGostergesi', 'hataGostergesi', 'uyarilar', 'zamanAsimiSn', 'ekranGoruntusu', 'tekrarDenenebilir', 'not']);
const AKSIYON_ANAHTARLARI = new Set(['tur', 'secici', 'metin', 'durum', 'kosul', 'aciklama', 'zamanAsimiSn', 'sureSn', 'cerceve']);

/**
 * "cerceve": öğe bir çerçevenin (iframe) içindeyse çerçeve seçicileri, dıştan içe — 1–CERCEVE_EN_DERIN boş olmayan metinden
 * oluşan dizi (koşucu page.frameLocator ile o çerçevede çalışır).
 */
function cerceveDogrula(h, yer, c) {
  if (c === undefined) return;
  if (!Array.isArray(c) || c.length < 1 || c.length > CERCEVE_EN_DERIN || !c.every(metinMi)) {
    h.ekle(yer, `"cerceve" 1–${CERCEVE_EN_DERIN} çerçeve seçicisinden (dıştan içe, ör. ["iframe#pencere"]) oluşan bir dizi olmalı`);
  }
}
const BOLUM_ANAHTARLARI = new Set(['id', 'baslik', 'pomMetodu', 'gorunurluk', 'alanlar']);
const EKRAN_ANAHTARLARI = new Set([
  'semaSurumu', 'tur', 'id', 'ad', 'aciklama', 'ekranUrl', 'specDosyasi', 'pageObject', 'veriKaynaklari',
  'kosullar', 'adimlar', 'senaryoDuzeyi', 'urunDuzeyi', 'baglam', 'isKurallari', 'bilinmeyenler',
  'baglamGorunurlugu', 'girisGerekmez', 'akislar', 'yalnizTestOrtami'
]);
const AKIS_ANAHTARLARI = new Set(['id', 'ad', 'varsayilan', 'adimlar']);
const ALT_MODEL_ANAHTARLARI = new Set([
  'semaSurumu', 'tur', 'id', 'ad', 'aciklama', 'pageObject', 'kullananlar', 'veriKaynaklari', 'bolumler',
  'ekranDisiAlanlar', 'bilinmeyenler'
]);
const BAGLAM_GORUNURLUGU_ANAHTARLARI = new Set(['profiller', 'alanlar', 'kaynak', 'not']);

/** Doğrulama sırasında toplanan hatalar; hepsi tek seferde raporlanır. */
function hataToplayici() {
  const hatalar = [];
  return {
    hatalar,
    ekle(yer, mesaj) { hatalar.push(`${yer}: ${mesaj}`); },
    bilinmeyenAnahtarlar(yer, nesne, izinliler) {
      for (const anahtar of Object.keys(nesne)) if (!izinliler.has(anahtar)) hatalar.push(`${yer}: bilinmeyen anahtar "${anahtar}"`);
    }
  };
}

function seceneklerDogrula(h, yer, secenekler) {
  if (!Array.isArray(secenekler)) {
    h.ekle(yer, 'secenekler bir dizi olmalı');
    return;
  }
  secenekler.forEach((secenek, i) => {
    const sYer = `${yer}[${i}]`;
    if (!nesneMi(secenek)) {
      h.ekle(sYer, 'seçenek bir nesne olmalı');
      return;
    }
    h.bilinmeyenAnahtarlar(sYer, secenek, SECENEK_ANAHTARLARI);
    if (!metinMi(secenek.deger)) h.ekle(sYer, '"deger" boş olmayan metin olmalı');
  });
}

function formDogrula(h, yer, form) {
  if (form === null || form === undefined) return;
  if (!nesneMi(form)) {
    h.ekle(yer, '"form" nesne ya da null olmalı');
    return;
  }
  h.bilinmeyenAnahtarlar(yer, form, FORM_ANAHTARLARI);
  if (!metinMi(form.id) || !form.id.startsWith('sof_')) h.ekle(yer, '"form.id" "sof_" ile başlamalı');
  if (!listedeMi(FORM_KONTROLLERI, form.kontrol)) h.ekle(yer, `bilinmeyen form kontrolü "${String(form.kontrol)}"`);
  if (form.secenekler !== undefined) seceneklerDogrula(h, `${yer}.secenekler`, form.secenekler);
  if (form.yardimciKontroller !== undefined) {
    if (!Array.isArray(form.yardimciKontroller)) {
      h.ekle(yer, '"yardimciKontroller" dizi olmalı');
    } else {
      form.yardimciKontroller.forEach((k, i) => {
        const kYer = `${yer}.yardimciKontroller[${i}]`;
        if (!nesneMi(k) || !metinMi(k.id) || !k.id.startsWith('sof_')) h.ekle(kYer, '"id" "sof_" ile başlamalı');
        else if (!listedeMi(FORM_KONTROLLERI, k.kontrol)) h.ekle(kYer, `bilinmeyen form kontrolü "${String(k.kontrol)}"`);
        else if (!metinMi(k.amac)) h.ekle(kYer, '"amac" zorunlu');
      });
    }
  }
}

/** Koşul ifadesinin biçimini doğrular; başvurduğu alan/koşul adlarını toplar. */
function kosulIfadesiDogrula(h, yer, ifade, basvurular) {
  if (!nesneMi(ifade)) {
    h.ekle(yer, 'koşul ifadesi bir nesne olmalı');
    return;
  }
  const anahtarlar = Object.keys(ifade).sort().join(',');
  switch (anahtarlar) {
    case 'alan,esit':
    case 'alan,icinde':
      if (!metinMi(ifade.alan)) h.ekle(yer, '"alan" metin olmalı');
      else basvurular.alanlar.push([yer, ifade.alan]);
      if ('icinde' in ifade && !Array.isArray(ifade.icinde)) h.ekle(yer, '"icinde" dizi olmalı');
      return;
    case 'esit,senaryoAyari':
      if (!metinMi(ifade.senaryoAyari)) h.ekle(yer, '"senaryoAyari" metin olmalı');
      else basvurular.senaryoAyarlari.push([yer, ifade.senaryoAyari]);
      return;
    case 've':
    case 'veya': {
      const liste = ifade[anahtarlar];
      if (!Array.isArray(liste) || liste.length === 0) h.ekle(yer, `"${anahtarlar}" boş olmayan dizi olmalı`);
      else liste.forEach((alt, i) => kosulIfadesiDogrula(h, `${yer}.${anahtarlar}[${i}]`, alt, basvurular));
      return;
    }
    case 'degil':
      kosulIfadesiDogrula(h, `${yer}.degil`, ifade.degil, basvurular);
      return;
    case 'baglam': {
      // { baglam: { alanSeti } }
      const deger = ifade.baglam;
      if (!nesneMi(deger) || !metinMi(deger.alanSeti)) h.ekle(yer, 'bağlam koşulunun "alanSeti" değeri metin olmalı');
      return;
    }
    case 'calismaZamani':
      if (ifade.calismaZamani !== 'gorunurse') h.ekle(yer, '"calismaZamani" yalnızca "gorunurse" olabilir');
      return;
    default:
      h.ekle(yer, `tanınmayan koşul ifadesi (anahtarlar: ${anahtarlar || 'yok'})`);
  }
}

function gorunurlukDogrula(h, yer, gorunurluk, b) {
  if (gorunurluk === null || gorunurluk === undefined) return;
  if (!nesneMi(gorunurluk)) {
    h.ekle(yer, '"gorunurluk" nesne ya da null olmalı');
    return;
  }
  const { not, ...geri } = gorunurluk;
  if (not !== undefined && typeof not !== 'string') h.ekle(yer, '"not" metin olmalı');
  const anahtarlar = Object.keys(geri);
  if (anahtarlar.length !== 1 || (anahtarlar[0] !== 'kosul' && anahtarlar[0] !== 'ifade')) {
    h.ekle(yer, '"gorunurluk" tam olarak bir "kosul" (ad) ya da "ifade" içermeli');
    return;
  }
  if (anahtarlar[0] === 'kosul') {
    if (!metinMi(geri.kosul)) h.ekle(yer, '"kosul" metin olmalı');
    else b.kosullar.push([yer, geri.kosul]);
  } else {
    kosulIfadesiDogrula(h, `${yer}.ifade`, geri.ifade, b);
  }
}

function altModelBasvurusuDogrula(h, yer, deger, b) {
  if (!nesneMi(deger) || !metinMi(deger.dosya) || !metinMi(deger.bolum) || Object.keys(deger).length !== 2) {
    h.ekle(yer, '"altModel" { dosya, bolum } olmalı');
    return;
  }
  b.altModeller.push([yer, { dosya: deger.dosya, bolum: deger.bolum }]);
}

/** Alanı (ve alt/ekran alanlarını) doğrular; id'leri kimlikler listesine ekler. */
function alanDogrula(h, yer, alan, kimlikler, b) {
  if (!nesneMi(alan)) {
    h.ekle(yer, 'alan bir nesne olmalı');
    return;
  }
  const aYer = `${yer}(${String(alan.id)})`;
  h.bilinmeyenAnahtarlar(aYer, alan, ALAN_ANAHTARLARI);
  if (!metinMi(alan.id) || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(alan.id)) h.ekle(aYer, '"id" harf/rakamdan oluşan boş olmayan metin olmalı');
  else kimlikler.push([aYer, alan.id]);
  if (!listedeMi(ALAN_TIPLERI, alan.tip)) h.ekle(aYer, `bilinmeyen alan tipi "${String(alan.tip)}"`);
  // Sabit / türetilmiş değer (senaryodan bağımsız; tarihte "bugun", "bugun+7"): koşucu her koşuda bu değerle doldurur.
  if (alan.sabitDeger !== undefined) {
    if (!['string', 'number', 'boolean'].includes(typeof alan.sabitDeger)) h.ekle(aYer, '"sabitDeger" metin, sayı ya da true/false olmalı');
    if (alan.yapilandirma === 'senaryo') h.ekle(aYer, '"sabitDeger" senaryo alanında kullanılmaz (senaryo değeri yazar)');
    if (alan.tip === 'tarih' && typeof alan.sabitDeger === 'string' && /^bugun/.test(alan.sabitDeger) && !/^bugun(\s*[+-]\s*\d{1,4})?$/.test(alan.sabitDeger)) {
      h.ekle(aYer, '"sabitDeger" tarihte "bugun", "bugun+7" ya da "bugun-3" biçiminde olmalı');
    }
  }
  // Akışta "zorunlu": koşuda ekranda görünmezse test başarısız (koşullu alanda koşul sağlandığında).
  if (alan.mutlakaGorunmeli !== undefined && typeof alan.mutlakaGorunmeli !== 'boolean') h.ekle(aYer, '"mutlakaGorunmeli" true ya da false olmalı');
  if (alan.sinirlar !== undefined) sinirlarDogrula(h, `${aYer}.sinirlar`, alan);
  if (alan.yapilandirma !== undefined && !listedeMi(YAPILANDIRMA_TURLERI, alan.yapilandirma)) {
    h.ekle(aYer, `bilinmeyen yapilandirma "${String(alan.yapilandirma)}"`);
  }
  if (alan.doldurucu !== undefined && !listedeMi(DOLDURUCULAR, alan.doldurucu)) {
    h.ekle(aYer, `bilinmeyen doldurucu "${String(alan.doldurucu)}"`);
  }
  // Alan doldurulduktan sonra basılacak tuş (doldurucuParametreleri.tus; ör. "Tab" — alandan çıkınca çıkan uyarı için; akış
  // diyagramında "Doldurduktan sonra"). Koşucu Playwright tuş adıyla basar (locator.press).
  if (nesneMi(alan.doldurucuParametreleri) && alan.doldurucuParametreleri.tus !== undefined) {
    const t = alan.doldurucuParametreleri.tus;
    if (!metinMi(t) || t.length > 40 || !/^[A-Za-z0-9+]+$/.test(t)) h.ekle(`${aYer}.doldurucuParametreleri.tus`, '"tus" bir tuş adı olmalı (ör. "Tab", "Enter")');
  }
  if (alan.seceneklerDurumu !== undefined && !listedeMi(SECENEK_DURUMLARI, alan.seceneklerDurumu)) {
    h.ekle(aYer, `bilinmeyen seceneklerDurumu "${String(alan.seceneklerDurumu)}"`);
  }
  if (alan.secenekler !== undefined && alan.secenekler !== null) seceneklerDogrula(h, `${aYer}.secenekler`, alan.secenekler);
  if (alan.etiket !== undefined && (!nesneMi(alan.etiket) || !('ekran' in alan.etiket))) {
    h.ekle(aYer, '"etiket" nesnesinde "ekran" anahtarı (bilinmiyorsa null) zorunlu');
  }
  if (alan.eslesme !== undefined) {
    if (!nesneMi(alan.eslesme)) {
      h.ekle(aYer, '"eslesme" nesne olmalı');
    } else {
      h.bilinmeyenAnahtarlar(`${aYer}.eslesme`, alan.eslesme, ESLESME_ANAHTARLARI);
      const senaryo = alan.eslesme.senaryo;
      if (senaryo !== undefined && !metinMi(senaryo) && !(Array.isArray(senaryo) && senaryo.length > 0 && senaryo.every(metinMi))) {
        h.ekle(aYer, '"eslesme.senaryo" metin ya da boş olmayan metin dizisi olmalı');
      }
    }
  }
  if (alan.yapilandirma === 'senaryo' && !(nesneMi(alan.eslesme) && (alan.eslesme.senaryo !== undefined || kayitAlaniAdi(alan) !== undefined))) {
    h.ekle(aYer, 'yapilandirma "senaryo" olan alanın "eslesme.senaryo" (ya da alt modelde "eslesme.kayitAlani") karşılığı olmalı');
  }
  if (alan.konum !== undefined) {
    if (!nesneMi(alan.konum) || !metinMi(alan.konum.secici) || !listedeMi(KIRILGANLIK_DUZEYLERI, alan.konum.kirilganlik)) {
      h.ekle(aYer, '"konum" { secici, kirilganlik: dusuk|orta|yuksek } içermeli');
    } else cerceveDogrula(h, `${aYer}.konum`, alan.konum.cerceve);
  }
  // ozelSecim: gizli <select>'e bağlı görünür aramalı liste — yalnız seçim alanında (konum.secici gerçek <select>'in seçicisi).
  if (alan.doldurucu === 'ozelSecim' && alan.tip !== 'secim') h.ekle(aYer, 'ozelSecim doldurucusu yalnızca "secim" tipindeki alanda kullanılır');
  // Sürüm 2: okluSecim doldurucusu (ok düğmeleriyle değer değiştiren özel bileşen) değeri gösteren öğeyi
  // (konum.secici) ve ileri/geri düğmelerini (konum.yardimci.ileri|arttir ve geri|azalt) bildirmeli.
  if (b.semaSurumu >= 2 && alan.doldurucu === 'okluSecim' && alan.yapilandirma === 'senaryo') {
    const y = nesneMi(alan.konum) && nesneMi(alan.konum.yardimci) ? alan.konum.yardimci : {};
    if (!metinMi(y.ileri) && !metinMi(y.arttir)) h.ekle(aYer, 'okluSecim: "konum.yardimci.ileri" (ya da "arttir") seçicisi zorunlu');
    if (!metinMi(y.geri) && !metinMi(y.azalt)) h.ekle(aYer, 'okluSecim: "konum.yardimci.geri" (ya da "azalt") seçicisi zorunlu');
  }
  formDogrula(h, `${aYer}.form`, alan.form);
  gorunurlukDogrula(h, `${aYer}.gorunurluk`, alan.gorunurluk, b);
  if (alan.bagimlilik !== undefined) {
    if (!nesneMi(alan.bagimlilik)) {
      h.ekle(aYer, '"bagimlilik" nesne olmalı');
    } else {
      const hedefler = Array.isArray(alan.bagimlilik.alan) ? alan.bagimlilik.alan : [alan.bagimlilik.alan];
      for (const hedef of hedefler) {
        if (!metinMi(hedef)) h.ekle(aYer, '"bagimlilik.alan" metin ya da metin dizisi olmalı');
        else b.alanlar.push([`${aYer}.bagimlilik`, hedef]);
      }
      if (alan.bagimlilik.secenekHaritasi !== undefined) {
        if (!nesneMi(alan.bagimlilik.secenekHaritasi)) h.ekle(aYer, '"secenekHaritasi" nesne olmalı');
        else for (const [anahtar, liste] of Object.entries(alan.bagimlilik.secenekHaritasi)) {
          seceneklerDogrula(h, `${aYer}.bagimlilik.secenekHaritasi.${anahtar}`, liste);
        }
      }
    }
  }
  if (alan.altModel !== undefined) altModelBasvurusuDogrula(h, `${aYer}.altModel`, alan.altModel, b);
  if (Array.isArray(alan.varyantlar)) {
    for (const varyant of alan.varyantlar) {
      if (!nesneMi(varyant) || !nesneMi(varyant.alanlar)) continue;
      for (const [ad, altAlan] of Object.entries(varyant.alanlar)) {
        if (!nesneMi(altAlan) || !Array.isArray(altAlan.secenekler)) continue;
        seceneklerDogrula(h, `${aYer}.varyantlar.${ad}.secenekler`, altAlan.secenekler);
        for (const secenek of altAlan.secenekler) {
          if (nesneMi(secenek) && metinMi(secenek.kosul)) b.kosullar.push([`${aYer}.varyantlar.${ad}`, secenek.kosul]);
        }
      }
    }
  }
  for (const altListe of ['altAlanlar', 'ekranAlanlari']) {
    const liste = alan[altListe];
    if (liste === undefined) continue;
    if (!Array.isArray(liste)) h.ekle(aYer, `"${altListe}" dizi olmalı`);
    else liste.forEach((alt, i) => alanDogrula(h, `${aYer}.${altListe}[${i}]`, alt, kimlikler, b));
  }
}

function bolumDogrula(h, yer, bolum, bolumKimlikleri, kimlikler, b) {
  if (!nesneMi(bolum)) {
    h.ekle(yer, 'bölüm bir nesne olmalı');
    return;
  }
  const bYer = `${yer}(${String(bolum.id)})`;
  h.bilinmeyenAnahtarlar(bYer, bolum, BOLUM_ANAHTARLARI);
  if (!metinMi(bolum.id)) h.ekle(bYer, '"id" zorunlu');
  else bolumKimlikleri.push([bYer, bolum.id]);
  if (!metinMi(bolum.baslik)) h.ekle(bYer, '"baslik" zorunlu');
  gorunurlukDogrula(h, `${bYer}.gorunurluk`, bolum.gorunurluk, b);
  if (!Array.isArray(bolum.alanlar) || bolum.alanlar.length === 0) h.ekle(bYer, '"alanlar" boş olmayan dizi olmalı');
  else bolum.alanlar.forEach((alan, i) => alanDogrula(h, `${bYer}.alanlar[${i}]`, alan, kimlikler, b));
}

function tekrarlananlar(kimlikler) {
  const gruplar = new Map();
  for (const [yer, id] of kimlikler) gruplar.set(id, [...(gruplar.get(id) || []), yer]);
  return [...gruplar.entries()].filter(([, yerler]) => yerler.length > 1);
}

function yeniBasvurular(semaSurumu = 1) {
  return { alanlar: [], senaryoAyarlari: [], kosullar: [], altModeller: [], ortakAkislar: [], semaSurumu: typeof semaSurumu === 'number' ? semaSurumu : 1 };
}

/**
 * Adımın koşu tanımı (sürüm 2) — model koşucusu (tests/support/model-kosucu.ts) adımın alanlarını
 * doldurduktan sonra aksiyonları sırayla uygular, sonra başarı göstergesini bekler; hata göstergesi
 * iş kuralı uyarısının göründüğü öğedir (beklenen/beklenmeyen hata mesajı buradan okunur).
 *   { aksiyonlar?: [{ tur: tikla|bekle|ekranaDon, secici, metin?, durum?: gorunur|gizli|dolu, kosul?: gorunurse (yalnız tikla), aciklama?, zamanAsimiSn? }],
 *     basariGostergesi?: { tur: metin|eleman|url|desen, deger, secici? } | { tur: veya, secenekler: [...] }, hataGostergesi?: { secici }, zamanAsimiSn?, not? }
 */
function kosuTanimiDogrula(h, yer, kosu) {
  if (!nesneMi(kosu)) {
    h.ekle(yer, '"kosu" nesne olmalı');
    return;
  }
  h.bilinmeyenAnahtarlar(yer, kosu, KOSU_ANAHTARLARI);
  const sure = (d, sYer) => {
    if (d !== undefined && !(Number.isInteger(d) && d >= 1 && d <= 600)) h.ekle(sYer, '"zamanAsimiSn" 1–600 arasında tam sayı olmalı');
  };
  sure(kosu.zamanAsimiSn, yer);
  // "Ekran görüntüsü al" işareti (adım görüntüleri "Seçili adımlarda" iken bu adımın görüntüsü alınır).
  if (kosu.ekranGoruntusu !== undefined && typeof kosu.ekranGoruntusu !== 'boolean') h.ekle(yer, '"ekranGoruntusu" true ya da false olmalı');
  // "Tekrar denenebilir" işareti (kurtarma kuralı bu adımı tekrar deneyebilir; varsayılan işaretsiz).
  if (kosu.tekrarDenenebilir !== undefined && typeof kosu.tekrarDenenebilir !== 'boolean') h.ekle(yer, '"tekrarDenenebilir" true ya da false olmalı');
  if (kosu.aksiyonlar !== undefined) {
    if (!Array.isArray(kosu.aksiyonlar)) h.ekle(yer, '"aksiyonlar" dizi olmalı');
    else kosu.aksiyonlar.forEach((a, i) => {
      const aYer = `${yer}.aksiyonlar[${i}]`;
      if (!nesneMi(a)) { h.ekle(aYer, 'aksiyon bir nesne olmalı'); return; }
      h.bilinmeyenAnahtarlar(aYer, a, AKSIYON_ANAHTARLARI);
      if (!listedeMi(AKSIYON_TURLERI, a.tur)) h.ekle(aYer, `"tur" ${AKSIYON_TURLERI.join(' | ')} olmalı`);
      // Süreli bekleme: { tur: 'bekle', sureSn } (seçicisiz; koşucu o kadar bekler). Diğerlerinde seçici zorunlu.
      if (a.sureSn !== undefined) {
        if (a.tur !== 'bekle' || !(Number.isInteger(a.sureSn) && a.sureSn >= 1 && a.sureSn <= 120)) h.ekle(aYer, '"sureSn" yalnızca "bekle" aksiyonunda, 1–120 arasında tam sayı olabilir');
        if (a.secici !== undefined) h.ekle(aYer, 'süreli beklemede "secici" olmaz');
      } else if (a.tur === 'ekranaDon') {
        if (a.secici !== undefined || a.metin !== undefined || a.durum !== undefined || a.kosul !== undefined) h.ekle(aYer, '"ekranaDon" aksiyonunda "secici", "metin", "durum" ve "kosul" olmaz');
      } else if (!metinMi(a.secici)) h.ekle(aYer, '"secici" zorunlu');
      if (a.metin !== undefined && !metinMi(a.metin)) h.ekle(aYer, '"metin" boş olmayan metin olmalı');
      // Koşullu tıklama (yalnız "tikla"): öğe kısa sürede görünmezse atlanır. ekranaDon'da yukarıda ayrıca reddedilir.
      if (a.kosul !== undefined && a.tur !== 'ekranaDon' && (a.tur !== 'tikla' || !listedeMi(AKSIYON_KOSULLARI, a.kosul))) h.ekle(aYer, `"kosul" yalnızca "tikla" aksiyonunda ${AKSIYON_KOSULLARI.join(' | ')} olabilir`);
      if (a.durum !== undefined && (a.tur !== 'bekle' || !['gorunur', 'gizli', 'dolu'].includes(a.durum))) h.ekle(aYer, '"durum" yalnızca "bekle" aksiyonunda gorunur | gizli | dolu olabilir');
      if (a.aciklama !== undefined && typeof a.aciklama !== 'string') h.ekle(aYer, '"aciklama" metin olmalı');
      if (a.cerceve !== undefined && a.secici === undefined) h.ekle(aYer, '"cerceve" yalnızca seçicili aksiyonda olur');
      cerceveDogrula(h, aYer, a.cerceve);
      sure(a.zamanAsimiSn, aYer);
    });
  }
  if (kosu.basariGostergesi !== undefined) basariGostergesiDogrula(h, `${yer}.basariGostergesi`, kosu.basariGostergesi, true);
  // Kabul edilen iş kuralı uyarıları (akışta "Uyarı" işaretli beklenen mesajlar): senaryo "iş kuralı uyarısı" beklerken
  // bunlardan seçer; başarı bekleyen senaryoda biri görünürse test hemen başarısız olur.
  if (kosu.uyarilar !== undefined) {
    if (!Array.isArray(kosu.uyarilar) || kosu.uyarilar.length > UYARI_EN_COK) h.ekle(`${yer}.uyarilar`, `"uyarilar" en çok ${UYARI_EN_COK} öğeli bir dizi olmalı`);
    else kosu.uyarilar.forEach((u, i) => {
      const uYer = `${yer}.uyarilar[${i}]`;
      if (!nesneMi(u) || !metinMi(u.metin)) { h.ekle(uYer, '{ metin, secici?, cerceve? } olmalı'); return; }
      h.bilinmeyenAnahtarlar(uYer, u, new Set(['metin', 'secici', 'cerceve']));
      if (u.secici !== undefined && !metinMi(u.secici)) h.ekle(uYer, '"secici" boş olmayan metin olmalı');
      if (u.cerceve !== undefined && u.secici === undefined) h.ekle(uYer, '"cerceve" yalnızca seçicili uyarıda olur');
      cerceveDogrula(h, uYer, u.cerceve);
    });
  }
  if (kosu.hataGostergesi !== undefined) {
    const g = kosu.hataGostergesi;
    if (!nesneMi(g) || !metinMi(g.secici) || Object.keys(g).some((k) => k !== 'secici' && k !== 'cerceve')) h.ekle(`${yer}.hataGostergesi`, '{ secici } olmalı (isteğe bağlı: cerceve)');
    else cerceveDogrula(h, `${yer}.hataGostergesi`, g.cerceve);
  }
  if (kosu.not !== undefined && typeof kosu.not !== 'string') h.ekle(yer, '"not" metin olmalı');
}

/**
 * Başarı göstergesi: { tur, deger, secici? } ya da "veya" grubu { tur: 'veya', secenekler: [2–VEYA_EN_COK gösterge] }
 * (seçeneklerden herhangi biri görünürse adım başarılı; iç içe "veya" olmaz).
 */
function basariGostergesiDogrula(h, gYer, g, veyaOlabilir) {
  if (veyaOlabilir && nesneMi(g) && g.tur === 'veya') {
    h.bilinmeyenAnahtarlar(gYer, g, new Set(['tur', 'secenekler']));
    if (!Array.isArray(g.secenekler) || g.secenekler.length < 2 || g.secenekler.length > VEYA_EN_COK) {
      h.ekle(gYer, `"veya" göstergesinde "secenekler" 2–${VEYA_EN_COK} göstergeden oluşan bir dizi olmalı`);
    } else g.secenekler.forEach((s, i) => basariGostergesiDogrula(h, `${gYer}.secenekler[${i}]`, s, false));
    return;
  }
  if (!nesneMi(g) || !listedeMi(BASARI_GOSTERGESI_TURLERI, g.tur) || !metinMi(g.deger)) {
    h.ekle(gYer, `{ tur: ${BASARI_GOSTERGESI_TURLERI.join(' | ')}, deger, secici? }${veyaOlabilir ? ' ya da { tur: veya, secenekler }' : ''} olmalı`);
    return;
  }
  h.bilinmeyenAnahtarlar(gYer, g, new Set(['tur', 'deger', 'secici', 'cerceve']));
  if (g.secici !== undefined && (!metinMi(g.secici) || (g.tur !== 'metin' && g.tur !== 'desen'))) h.ekle(gYer, '"secici" yalnızca "metin" ve "desen" türünde (metnin arandığı öğe) kullanılır');
  // cerceve: öğe (eleman göstergesinde deger, metin / desen göstergesinde secici) bir çerçevede.
  if (g.cerceve !== undefined && g.tur !== 'eleman' && g.secici === undefined) h.ekle(gYer, '"cerceve" yalnızca "eleman" göstergesinde ya da seçicili metin / desen göstergesinde olur');
  cerceveDogrula(h, gYer, g.cerceve);
  if (g.tur === 'url' || g.tur === 'desen') {
    try { new RegExp(g.deger); } catch { h.ekle(gYer, '"deger" geçerli bir düzenli ifade değil'); }
  }
}

function semaSurumunuDogrula(h, yer, ham, beklenenTur) {
  if (!SEMA_SURUMLERI.includes(ham.semaSurumu)) {
    h.ekle(yer, `"semaSurumu" ${SEMA_SURUMLERI.join(' ya da ')} olmalı (bulunan: ${String(ham.semaSurumu)})`);
  }
  if (ham.tur !== beklenenTur) h.ekle(yer, `"tur" "${beklenenTur}" olmalı`);
  if (!metinMi(ham.id)) h.ekle(yer, '"id" zorunlu');
}

/**
 * Bağlam profili görünürlüğü (gözlem): { profiller: [ad], alanlar: { alanId: { profilAdı: true | false | null } } }.
 * true = o profille ekranda görüldü, false = görülmedi, null = bilinmiyor (incelenemedi).
 */
function baglamGorunurluguDogrula(h, bg, alanKumesi) {
  const yer = 'baglamGorunurlugu';
  if (!nesneMi(bg) || !Array.isArray(bg.profiller) || !nesneMi(bg.alanlar)) {
    h.ekle(yer, '{ profiller: [bağlam profili adı], alanlar: { alanId: { profil: true | false | null } } } olmalı');
    return;
  }
  h.bilinmeyenAnahtarlar(yer, bg, BAGLAM_GORUNURLUGU_ANAHTARLARI);
  const profiller = new Set();
  bg.profiller.forEach((p, i) => {
    if (!metinMi(p)) h.ekle(`${yer}.profiller[${i}]`, 'boş olmayan metin olmalı');
    else if (profiller.has(p)) h.ekle(`${yer}.profiller[${i}]`, `"${p}" birden fazla kez yazılmış`);
    else profiller.add(p);
  });
  for (const [alanId, harita] of Object.entries(bg.alanlar)) {
    const aYer = `${yer}.alanlar.${alanId}`;
    if (!alanKumesi.has(alanId)) h.ekle(aYer, `başvurulan alan "${alanId}" modelde yok`);
    if (!nesneMi(harita)) {
      h.ekle(aYer, '{ profil: true | false | null } nesnesi olmalı');
      continue;
    }
    for (const [profil, deger] of Object.entries(harita)) {
      if (!profiller.has(profil)) h.ekle(`${aYer}.${profil}`, `profil "${profil}" "profiller" listesinde yok`);
      if (deger !== true && deger !== false && deger !== null) h.ekle(`${aYer}.${profil}`, 'true, false ya da null olmalı');
    }
  }
  if (bg.kaynak !== undefined && typeof bg.kaynak !== 'string') h.ekle(yer, '"kaynak" metin olmalı');
  if (bg.not !== undefined && typeof bg.not !== 'string') h.ekle(yer, '"not" metin olmalı');
}

// ---- Alt model ----

/** Ham alt modeli doğrular; hatalıysa tüm sorunları listeleyen bir Error fırlatır. */
export function altModeliDogrula(dosyaYolu, ham) {
  const h = hataToplayici();
  const yer = String(dosyaYolu).split(/[\\/]/).pop() || String(dosyaYolu);
  if (!nesneMi(ham)) throw new Error(`${yer}: model bir JSON nesnesi olmalı.`);
  h.bilinmeyenAnahtarlar(yer, ham, ALT_MODEL_ANAHTARLARI);
  semaSurumunuDogrula(h, yer, ham, 'altModel');
  const b = yeniBasvurular(ham.semaSurumu);
  const kimlikler = [];
  const bolumKimlikleri = [];
  if (!Array.isArray(ham.bolumler) || ham.bolumler.length === 0) h.ekle(yer, '"bolumler" boş olmayan dizi olmalı');
  else ham.bolumler.forEach((bolum, i) => bolumDogrula(h, `${yer} bolumler[${i}]`, bolum, bolumKimlikleri, kimlikler, b));
  for (const [id, yerler] of [...tekrarlananlar(kimlikler), ...tekrarlananlar(bolumKimlikleri)]) {
    h.ekle(yer, `"${id}" id'si birden fazla kez kullanılmış: ${yerler.join(' | ')}`);
  }
  // Alt model kendi içinde koşul/alan başvurusu yapamaz (bağlamı kullanan ekran belirler).
  for (const [bYer, ad] of [...b.kosullar, ...b.alanlar, ...b.senaryoAyarlari]) {
    h.ekle(bYer, `alt model dış başvuru içeremez ("${ad}")`);
  }
  for (const [bYer] of b.altModeller) h.ekle(bYer, 'alt model başka bir alt modele başvuramaz');
  if (h.hatalar.length) throw new Error(`Alt model geçersiz (${h.hatalar.length} sorun):\n - ${h.hatalar.join('\n - ')}`);
  return ham;
}

// ---- Ekran modeli ----

/**
 * Ham ekran modelini (ve kaynaktan alınan alt modelleri) doğrular (dosya okumaz).
 * Kontroller: şema sürümü/tür, bilinen anahtarlar, alan tipleri/yapılandırma/doldurucu/form kontrol
 * adları, alan-bölüm-adım id'lerinin benzersizliği, koşul ifadelerinin biçimi ve başvurdukları
 * alan/koşul/senaryo ayarlarının varlığı, alt model dosya+bölüm başvuruları, iş kurallarının adımları,
 * ürün düzeyi "kullanan" başvuruları, adım sıralarının 1..n olması, bağlam profili görünürlüğü.
 * @param {string} dosyaYolu hata mesajlarında gösterilecek ad
 * @param {unknown} ham
 * @param {(dosyaAdi: string) => unknown} altModelKaynagi alt model dosya adı → ham JSON (yoksa hata fırlatır)
 * @returns {{ model: object; dosyaYolu: string; altModeller: Record<string, object> }}
 */
export function ekranModeliniDogrula(dosyaYolu, ham, altModelKaynagi) {
  const h = hataToplayici();
  const yer = String(dosyaYolu).split(/[\\/]/).pop() || String(dosyaYolu);
  if (!nesneMi(ham)) throw new Error(`${yer}: model bir JSON nesnesi olmalı.`);
  h.bilinmeyenAnahtarlar(yer, ham, EKRAN_ANAHTARLARI);
  // ORTAK AKIŞ (tur "ortakAkis"): ekran akışlarına adım olarak eklenen, tek yerde tanımlı akış (ör. ödeme). Ekran modeliyle
  // aynı adım biçimi; ekran adresi / spec / page object yok; içinde alt model ya da başka ortak akış olmaz.
  const ortakMi = ham.tur === 'ortakAkis';
  semaSurumunuDogrula(h, yer, ham, ortakMi ? 'ortakAkis' : 'ekran');
  if (ortakMi && ham.semaSurumu !== 2) h.ekle(yer, 'ortak akış "semaSurumu": 2 olmalı');
  for (const anahtar of ortakMi ? ['ad', 'aciklama'] : ['ad', 'aciklama', 'ekranUrl', 'specDosyasi', 'pageObject']) {
    if (!metinMi(ham[anahtar])) h.ekle(yer, `"${anahtar}" zorunlu`);
  }
  if (ham.yalnizTestOrtami !== undefined && (typeof ham.yalnizTestOrtami !== 'boolean' || !ortakMi)) h.ekle(yer, '"yalnizTestOrtami" yalnızca ortak akışta true/false olabilir');
  if (ortakMi && ham.akislar !== undefined) h.ekle(yer, 'ortak akışın kendi akışları olmaz ("akislar")');
  // Ekran giriş yapılmadan açılır (model koşucusu giriş ve bağlam değiştirme adımlarını atlar).
  if (ham.girisGerekmez !== undefined && typeof ham.girisGerekmez !== 'boolean') h.ekle(yer, '"girisGerekmez" true/false olmalı');

  const b = yeniBasvurular(ham.semaSurumu);
  const kimlikler = [];
  const bolumKimlikleri = [];
  const adimKimlikleri = [];

  // Koşullar
  const kosulAdlari = new Set();
  if (!nesneMi(ham.kosullar)) {
    h.ekle(yer, '"kosullar" nesne olmalı');
  } else {
    for (const [ad, kosul] of Object.entries(ham.kosullar)) {
      kosulAdlari.add(ad);
      const kYer = `kosullar.${ad}`;
      if (!nesneMi(kosul)) {
        h.ekle(kYer, 'nesne olmalı');
        continue;
      }
      kosulIfadesiDogrula(h, `${kYer}.ifade`, kosul.ifade, b);
      if (kosul.hedefIfade !== undefined) kosulIfadesiDogrula(h, `${kYer}.hedefIfade`, kosul.hedefIfade, b);
    }
  }

  // Adımlar. Ortak akış boş olabilir (Ekranlar > Ortak akış > "Boş başla": adımları sonra akış diyagramında eklenir; boşken
  // ekranlara eklenmez — akis-servisi.mjs > ortakAkisEkranlaraEkle).
  if (!Array.isArray(ham.adimlar) || (ham.adimlar.length === 0 && !ortakMi)) {
    h.ekle(yer, '"adimlar" boş olmayan dizi olmalı');
  } else {
    ham.adimlar.forEach((adim, i) => {
      const aYer = `adimlar[${i}]`;
      if (!nesneMi(adim)) {
        h.ekle(aYer, 'adım bir nesne olmalı');
        return;
      }
      const adYer = `${aYer}(${String(adim.id)})`;
      h.bilinmeyenAnahtarlar(adYer, adim, ADIM_ANAHTARLARI);
      if (!metinMi(adim.id)) h.ekle(adYer, '"id" zorunlu');
      else adimKimlikleri.push([adYer, adim.id]);
      if (adim.sira !== i + 1) h.ekle(adYer, `"sira" ${i + 1} olmalı (adımlar akış sırasıyla yazılır)`);
      if (!metinMi(adim.baslik)) h.ekle(adYer, '"baslik" zorunlu');
      gorunurlukDogrula(h, `${adYer}.gorunurluk`, adim.gorunurluk, b);
      const bolumVar = adim.bolumler !== undefined;
      const altModelVar = adim.altModel !== undefined;
      const ortakVar = adim.ortakAkis !== undefined;
      const sqlVar = adim.sqlKontrolu !== undefined;
      const girisVar = adim.yenidenGiris !== undefined;
      const dosyaVar = adim.dosyaKontrolu !== undefined;
      if ([bolumVar, altModelVar, ortakVar, sqlVar, girisVar, dosyaVar].filter(Boolean).length !== 1) {
        h.ekle(adYer, ortakVar || sqlVar || girisVar || dosyaVar ? 'adımda "bolumler", "altModel", "ortakAkis", "sqlKontrolu", "dosyaKontrolu" ve "yenidenGiris"ten yalnızca biri olmalı' : 'adımda "bolumler" YA DA "altModel" olmalı (ikisi birden/hiçbiri değil)');
      }
      // YENİDEN GİRİŞ ADIMI: { profil? } — koşuda oturum kapatılır (çerezler temizlenir) ve ortamın giriş tarifiyle yeniden
      // girilir; profil = giriş profilinin adı (yoksa ortamın varsayılan profili). Girişsiz modelde olmaz.
      if (girisVar) {
        const g = adim.yenidenGiris;
        const gYer = `${adYer}.yenidenGiris`;
        if (!nesneMi(g) || Object.keys(g).some((k) => k !== 'profil')) h.ekle(gYer, '"yenidenGiris" { profil? } olmalı');
        else if (g.profil !== undefined && g.profil !== null && !metinMi(g.profil)) h.ekle(gYer, '"profil" metin olmalı');
        if (adim.kosu !== undefined) h.ekle(adYer, 'yeniden giriş adımının koşu tanımı ("kosu") olmaz');
        if (ham.girisGerekmez === true) h.ekle(gYer, 'girişsiz modelde ("girisGerekmez": true) yeniden giriş adımı olmaz');
      }
      if (ortakMi && (altModelVar || ortakVar)) h.ekle(adYer, 'ortak akışın adımında alt model ya da başka ortak akış olmaz');
      if (ortakVar) {
        if (!nesneMi(adim.ortakAkis) || !metinMi(adim.ortakAkis.dosya) || Object.keys(adim.ortakAkis).length !== 1) h.ekle(`${adYer}.ortakAkis`, '"ortakAkis" { dosya } olmalı');
        else b.ortakAkislar.push([`${adYer}.ortakAkis`, adim.ortakAkis.dosya]);
        if (adim.kosu !== undefined) h.ekle(adYer, 'ortak akış adımının kendi koşu tanımı olmaz (adımları ortak akıştadır)');
      }
      // SQL ADIMI: { veritabaniId | baglantiId, sql, beklenen: { tur, … }, yenidenDeneme?, zamanAsimiSn?, okumalar? } — koşuda veritabanında sorgu
      // çalışır, sonuç beklenenle karşılaştırılır (ayrıntılı kurallar platform/sql/sql-adimi.mjs; burada yapı).
      if (sqlVar) {
        const q = adim.sqlKontrolu;
        const qYer = `${adYer}.sqlKontrolu`;
        if (!nesneMi(q)) h.ekle(qYer, '"sqlKontrolu" bir nesne olmalı');
        else {
          // Hedef: "veritabaniId" (mantıksal veritabanı; ortama göre bağlantı) ya da "baglantiId" (doğrudan bağlantı, eski) — yalnız biri.
          if (metinMi(q.veritabaniId) && metinMi(q.baglantiId)) h.ekle(qYer, '"veritabaniId" ve "baglantiId"den yalnız biri olmalı');
          else if (!metinMi(q.veritabaniId) && !metinMi(q.baglantiId)) h.ekle(qYer, '"veritabaniId" ya da "baglantiId" zorunlu');
          if (!metinMi(q.sql)) h.ekle(qYer, '"sql" zorunlu');
          if (!nesneMi(q.beklenen) || !SQL_BEKLENEN_TURLERI.includes(q.beklenen.tur)) h.ekle(qYer, `"beklenen.tur" şunlardan biri olmalı: ${SQL_BEKLENEN_TURLERI.join(', ')}`);
          if (q.okumalar !== undefined && !Array.isArray(q.okumalar)) h.ekle(qYer, '"okumalar" dizi olmalı');
        }
        if (adim.kosu !== undefined) h.ekle(adYer, 'SQL adımının koşu tanımı ("kosu") olmaz');
      }
      // DOSYA ADIMI: { tetikleyici: { secici, metin? }, bicim?, beklentiler: [{ tur, … }], … } — koşuda düğmeye basılır, indirilen
      // dosya beklentilerle doğrulanır (ayrıntılı kurallar platform/dosyalar/dosya-icerigi.mjs; burada yapı).
      if (dosyaVar) {
        const d = adim.dosyaKontrolu;
        const dYer = `${adYer}.dosyaKontrolu`;
        if (!nesneMi(d)) h.ekle(dYer, '"dosyaKontrolu" bir nesne olmalı');
        else {
          if (!nesneMi(d.tetikleyici) || !metinMi(d.tetikleyici.secici)) h.ekle(dYer, '"tetikleyici.secici" (indirmeyi başlatan düğme) zorunlu');
          if (!Array.isArray(d.beklentiler) || !d.beklentiler.length || !d.beklentiler.every((x) => nesneMi(x) && DOSYA_BEKLENTI_TURLERI.includes(x.tur))) {
            h.ekle(dYer, `"beklentiler" boş olmayan dizi olmalı; türler: ${DOSYA_BEKLENTI_TURLERI.join(', ')}`);
          }
        }
        if (adim.kosu !== undefined) h.ekle(adYer, 'dosya adımının koşu tanımı ("kosu") olmaz');
      }
      if (bolumVar) {
        if (!Array.isArray(adim.bolumler) || adim.bolumler.length === 0) h.ekle(adYer, '"bolumler" boş olmayan dizi olmalı');
        else adim.bolumler.forEach((bolum, j) => bolumDogrula(h, `${adYer}.bolumler[${j}]`, bolum, bolumKimlikleri, kimlikler, b));
      }
      if (altModelVar) altModelBasvurusuDogrula(h, `${adYer}.altModel`, adim.altModel, b);
      if (adim.kosu !== undefined) {
        if (b.semaSurumu < 2) h.ekle(adYer, 'adımın koşu tanımı ("kosu") "semaSurumu": 2 gerektirir');
        kosuTanimiDogrula(h, `${adYer}.kosu`, adim.kosu);
      }
    });
  }

  // Senaryo düzeyi
  const senaryoAyarAdlari = new Set();
  if (!nesneMi(ham.senaryoDuzeyi) || !Array.isArray(ham.senaryoDuzeyi.alanlar)) {
    h.ekle(yer, '"senaryoDuzeyi.alanlar" dizi olmalı');
  } else {
    ham.senaryoDuzeyi.alanlar.forEach((alan, i) => {
      if (nesneMi(alan) && metinMi(alan.id)) senaryoAyarAdlari.add(alan.id);
      alanDogrula(h, `senaryoDuzeyi.alanlar[${i}]`, alan, kimlikler, b);
    });
  }

  // Proje bağlamı ekranı (ayrı ekran; id'leri ayrı ad alanında tutulur)
  const baglamAdi = 'baglam';
  const baglam = baglamEkrani(ham);
  if (baglam !== undefined) {
    if (!nesneMi(baglam) || !Array.isArray(baglam.alanlar)) {
      h.ekle(yer, `"${baglamAdi}.alanlar" dizi olmalı`);
    } else {
      const baglamKimlikleri = [];
      baglam.alanlar.forEach((alan, i) => alanDogrula(h, `${baglamAdi}.alanlar[${i}]`, alan, baglamKimlikleri, b));
      for (const [id, yerler] of tekrarlananlar(baglamKimlikleri)) h.ekle(baglamAdi, `"${id}" birden fazla kez: ${yerler.join(' | ')}`);
    }
  }

  // Alt modeller (dosya başvuruları)
  const altModeller = {};
  for (const [bYer, basvuru] of b.altModeller) {
    if (!(basvuru.dosya in altModeller)) {
      try {
        altModeller[basvuru.dosya] = altModeliDogrula(basvuru.dosya, altModelKaynagi(basvuru.dosya));
      } catch (hata) {
        h.ekle(bYer, `alt model "${basvuru.dosya}" yüklenemedi: ${hata instanceof Error ? hata.message : String(hata)}`);
        continue;
      }
    }
    const altModel = altModeller[basvuru.dosya];
    if (altModel && !altModel.bolumler.some((bolum) => bolum.id === basvuru.bolum)) {
      h.ekle(bYer, `alt model "${basvuru.dosya}" içinde "${basvuru.bolum}" bölümü yok`);
    }
    if (altModel && !(Array.isArray(altModel.kullananlar) && altModel.kullananlar.includes(String(ham.id)))) {
      h.ekle(bYer, `alt model "${basvuru.dosya}" > kullananlar listesinde "${String(ham.id)}" yok`);
    }
  }

  // Ortak akış başvuruları: aynı projede "tur": "ortakAkis" modeli olmalı.
  for (const [bYer, dosya] of b.ortakAkislar) {
    let ortak;
    try {
      ortak = altModelKaynagi(dosya);
    } catch (hata) {
      h.ekle(bYer, `ortak akış "${dosya}" yüklenemedi: ${hata instanceof Error ? hata.message : String(hata)}`);
      continue;
    }
    if (!nesneMi(ortak) || ortak.tur !== 'ortakAkis') h.ekle(bYer, `"${dosya}" bir ortak akış değil`);
  }

  // Benzersizlik
  for (const [id, yerler] of tekrarlananlar(kimlikler)) h.ekle(yer, `alan id'si "${id}" birden fazla kez kullanılmış: ${yerler.join(' | ')}`);
  for (const [id, yerler] of tekrarlananlar(bolumKimlikleri)) h.ekle(yer, `bölüm id'si "${id}" birden fazla kez: ${yerler.join(' | ')}`);
  for (const [id, yerler] of tekrarlananlar(adimKimlikleri)) h.ekle(yer, `adım id'si "${id}" birden fazla kez: ${yerler.join(' | ')}`);

  // Başvurular
  const alanKumesi = new Set(kimlikler.map(([, id]) => id));
  const adimKumesi = new Set(adimKimlikleri.map(([, id]) => id));
  for (const [bYer, ad] of b.alanlar) if (!alanKumesi.has(ad)) h.ekle(bYer, `başvurulan alan "${ad}" modelde yok`);
  for (const [bYer, ad] of b.kosullar) if (!kosulAdlari.has(ad)) h.ekle(bYer, `başvurulan koşul "${ad}" kosullar içinde yok`);
  for (const [bYer, ad] of b.senaryoAyarlari) if (!senaryoAyarAdlari.has(ad)) h.ekle(bYer, `başvurulan senaryo ayarı "${ad}" senaryoDuzeyi içinde yok`);

  // İş kuralları
  if (!Array.isArray(ham.isKurallari)) {
    h.ekle(yer, '"isKurallari" dizi olmalı');
  } else {
    const kuralB = yeniBasvurular();
    ham.isKurallari.forEach((kural, i) => {
      const kYer = `isKurallari[${i}]`;
      if (!nesneMi(kural) || !metinMi(kural.id) || !metinMi(kural.mesaj) || !metinMi(kural.adim)) {
        h.ekle(kYer, '{ id, adim, kosul, mesaj } zorunlu');
        return;
      }
      if (!adimKumesi.has(kural.adim)) h.ekle(kYer, `adım "${kural.adim}" adimlar içinde yok`);
      kosulIfadesiDogrula(h, `${kYer}.kosul`, kural.kosul, kuralB);
      if (kural.gecerlilik !== undefined) gorunurlukDogrula(h, `${kYer}.gecerlilik`, kural.gecerlilik, kuralB);
    });
    for (const [bYer, ad] of kuralB.alanlar) if (!alanKumesi.has(ad)) h.ekle(bYer, `başvurulan alan "${ad}" modelde yok`);
    for (const [bYer, ad] of kuralB.kosullar) if (!kosulAdlari.has(ad)) h.ekle(bYer, `başvurulan koşul "${ad}" yok`);
    for (const [bYer, ad] of kuralB.senaryoAyarlari) if (!senaryoAyarAdlari.has(ad)) h.ekle(bYer, `senaryo ayarı "${ad}" yok`);
  }

  // Ürün düzeyi
  if (!nesneMi(ham.urunDuzeyi)) {
    h.ekle(yer, '"urunDuzeyi" nesne olmalı');
  } else {
    for (const [ad, deger] of Object.entries(ham.urunDuzeyi)) {
      if (!nesneMi(deger) || !metinMi(deger.tip)) {
        h.ekle(`urunDuzeyi.${ad}`, '{ tip } zorunlu');
        continue;
      }
      if (deger.kullanan !== undefined && (!metinMi(deger.kullanan) || !alanKumesi.has(deger.kullanan))) {
        h.ekle(`urunDuzeyi.${ad}`, `"kullanan" ("${String(deger.kullanan)}") modelde bir alan olmalı`);
      }
    }
  }

  if (!Array.isArray(ham.bilinmeyenler)) h.ekle(yer, '"bilinmeyenler" dizi olmalı');
  if (ham.baglamGorunurlugu !== undefined) baglamGorunurluguDogrula(h, ham.baglamGorunurlugu, alanKumesi);

  // Akışlar: varsayılanın adımları model.adimlar; diğer her akış kendi modeli (akisModeli) olarak aynı kurallarla doğrulanır.
  if (ham.akislar !== undefined) akislariDogrula(h, ham, dosyaYolu, altModelKaynagi);

  if (h.hatalar.length) {
    throw new Error(`Ekran modeli geçersiz: ${dosyaYolu} (${h.hatalar.length} sorun):\n - ${h.hatalar.join('\n - ')}`);
  }
  return { model: ham, dosyaYolu, altModeller };
}

/**
 * Akışın modeli (import yok: model-formu.mjs > akisModeli ile AYNI kural): adımlar akışın adımları, akışta olmayan
 * adımlara bağlı iş kuralları ve olmayan alanlara bağlı bağlam görünürlüğü / ürün düzeyi başvuruları çıkarılır.
 */
function akisAltModeli(ham, akis) {
  const sonuc = { ...ham, adimlar: akis.adimlar };
  delete sonuc.akislar;
  const adimIdleri = new Set(akis.adimlar.map((a) => (nesneMi(a) ? a.id : null)));
  const alanIdleri = new Set();
  const topla = (liste) => { for (const a of Array.isArray(liste) ? liste : []) if (nesneMi(a) && typeof a.id === 'string') alanIdleri.add(a.id); };
  for (const adim of akis.adimlar) for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) topla(nesneMi(b) ? b.alanlar : null);
  topla(nesneMi(ham.senaryoDuzeyi) ? ham.senaryoDuzeyi.alanlar : null);
  if (Array.isArray(ham.isKurallari)) sonuc.isKurallari = ham.isKurallari.filter((k) => !nesneMi(k) || typeof k.adim !== 'string' || adimIdleri.has(k.adim));
  if (nesneMi(ham.baglamGorunurlugu) && nesneMi(ham.baglamGorunurlugu.alanlar)) {
    sonuc.baglamGorunurlugu = { ...ham.baglamGorunurlugu, alanlar: Object.fromEntries(Object.entries(ham.baglamGorunurlugu.alanlar).filter(([id]) => alanIdleri.has(id))) };
  }
  if (nesneMi(ham.urunDuzeyi)) {
    sonuc.urunDuzeyi = Object.fromEntries(Object.entries(ham.urunDuzeyi).map(([ad, d]) => (
      nesneMi(d) && typeof d.kullanan === 'string' && !alanIdleri.has(d.kullanan) ? [ad, Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'kullanan'))] : [ad, d]
    )));
  }
  // Başka akışların adım kapsamı ayarları (senaryoAyari) bu akışın senaryo düzeyinde görünmez.
  const kosulIfadesi = (g) => (nesneMi(g) ? (typeof g.kosul === 'string' ? (nesneMi(ham.kosullar) && nesneMi(ham.kosullar[g.kosul]) ? ham.kosullar[g.kosul].ifade : null) : g.ifade) : null);
  const ayarlar = (ifade, kume) => {
    if (!nesneMi(ifade)) return kume;
    if (typeof ifade.senaryoAyari === 'string') kume.add(ifade.senaryoAyari);
    for (const alt of [...(Array.isArray(ifade.ve) ? ifade.ve : []), ...(Array.isArray(ifade.veya) ? ifade.veya : []), ...(ifade.degil ? [ifade.degil] : [])]) ayarlar(alt, kume);
    return kume;
  };
  const tumAyarlar = new Set();
  for (const k of nesneMi(ham.kosullar) ? Object.values(ham.kosullar) : []) ayarlar(nesneMi(k) ? k.ifade : null, tumAyarlar);
  const buAkis = new Set();
  for (const adim of akis.adimlar) {
    if (!nesneMi(adim)) continue;
    ayarlar(kosulIfadesi(adim.gorunurluk), buAkis);
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      if (!nesneMi(b)) continue;
      ayarlar(kosulIfadesi(b.gorunurluk), buAkis);
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) ayarlar(kosulIfadesi(a.gorunurluk), buAkis);
    }
  }
  if (nesneMi(ham.senaryoDuzeyi) && Array.isArray(ham.senaryoDuzeyi.alanlar)) {
    sonuc.senaryoDuzeyi = { ...ham.senaryoDuzeyi, alanlar: ham.senaryoDuzeyi.alanlar.filter((a) => !nesneMi(a) || !tumAyarlar.has(a.id) || buAkis.has(a.id)) };
  }
  // Bu akışta olmayan ayarlara bağlı koşullar (başka akışın isteğe bağlı adımları) da çıkarılır.
  if (nesneMi(ham.kosullar)) {
    sonuc.kosullar = Object.fromEntries(Object.entries(ham.kosullar).filter(([, k]) => ![...ayarlar(nesneMi(k) ? k.ifade : null, new Set())].some((a) => !buAkis.has(a))));
  }
  return sonuc;
}

/** model.akislar: tekil kimlik, tek varsayılan (adımları model.adimlar ile aynı), her akış geçerli bir akış modeli. */
function akislariDogrula(h, ham, dosyaYolu, altModelKaynagi) {
  if (!Array.isArray(ham.akislar) || !ham.akislar.length) { h.ekle('akislar', 'boş olmayan dizi olmalı'); return; }
  const idler = new Set();
  let varsayilan = 0;
  ham.akislar.forEach((akis, i) => {
    const yer = `akislar[${i}]`;
    if (!nesneMi(akis)) { h.ekle(yer, 'akış bir nesne olmalı'); return; }
    h.bilinmeyenAnahtarlar(yer, akis, AKIS_ANAHTARLARI);
    if (!metinMi(akis.id) || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(akis.id)) h.ekle(yer, '"id" harf/rakamdan oluşan metin olmalı');
    else if (idler.has(akis.id)) h.ekle(yer, `akış id'si "${akis.id}" birden fazla kez`);
    else idler.add(akis.id);
    if (!metinMi(akis.ad)) h.ekle(yer, '"ad" zorunlu');
    if (akis.varsayilan !== undefined && akis.varsayilan !== true) h.ekle(yer, '"varsayilan" yalnızca true olabilir');
    if (akis.varsayilan === true) {
      varsayilan++;
      if (JSON.stringify(akis.adimlar) !== JSON.stringify(ham.adimlar)) h.ekle(yer, 'varsayılan akışın "adimlar"ı modelin "adimlar"ıyla aynı olmalı');
      return;
    }
    if (!Array.isArray(akis.adimlar) || !akis.adimlar.length) { h.ekle(yer, '"adimlar" boş olmayan dizi olmalı'); return; }
    try {
      ekranModeliniDogrula(`${dosyaYolu} > ${String(akis.ad || akis.id)}`, akisAltModeli(ham, akis), altModelKaynagi);
    } catch (hata) {
      for (const m of dogrulamaMaddeleri(hata)) h.ekle(`${yer}(${String(akis.id)})`, m);
    }
  });
  if (varsayilan !== 1) h.ekle('akislar', 'tam olarak bir akış "varsayilan": true olmalı');
}

/**
 * Doğrulama hatasının maddeleri (Error mesajındaki " - " satırları); madde yoksa mesajın kendisi.
 * @param {unknown} hata @returns {string[]}
 */
export function dogrulamaMaddeleri(hata) {
  const mesaj = hata instanceof Error ? hata.message : String(hata);
  const maddeler = mesaj.split('\n').filter((s) => s.startsWith(' - ')).map((s) => s.slice(3));
  return maddeler.length ? maddeler : [mesaj];
}
