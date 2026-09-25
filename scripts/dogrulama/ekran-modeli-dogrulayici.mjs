// EKRAN MODELİ YAPISAL DOĞRULAYICISI (genel, TEK KAYNAK) — testler (tests/support/ekran-modeli.ts),
// platform sunucusu (sayfa paketi, model sürümleri) ve birim testleri aynı kuralları buradan kullanır.
// Kurallar ekran modelinin KENDİSİNİ denetler: bilinen anahtarlar/tipler, benzersiz alan/bölüm/adım
// kimlikleri, koşul ifadelerinin biçimi, adım/koşul/alan/alt model başvurularının varlığı, bağlam
// profili görünürlüğü gözlemleri. Senaryo verisinin modele uygunluğu senaryo-dogrulayici.mjs'dedir.
//
//  - Bu dosya HİÇBİR modül import etmez; Node'a/DOM'a özgü API kullanmaz.
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
/** Adım koşu tanımındaki aksiyon türleri: tikla (düğme/bağlantı), bekle (öğe görünür/gizli olana kadar). */
export const AKSIYON_TURLERI = Object.freeze(['tikla', 'bekle']);
/** Adımın başarı göstergesi türleri: metin (sayfada/öğede metin), eleman (öğe görünür), url (adres deseni). */
export const BASARI_GOSTERGESI_TURLERI = Object.freeze(['metin', 'eleman', 'url']);

export const ALAN_TIPLERI = Object.freeze([
  'secim', 'okluSecim', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'radyo', 'dosya',
  'kimlikProfili', 'buton', 'baglanti', 'cikti', 'tablo', 'diyalog', 'birlesim', 'altModelGecersizKilma'
]);
export const YAPILANDIRMA_TURLERI = Object.freeze([
  'senaryo', 'urun', 'turetilmis', 'sabit', 'cikti', 'aksiyon', 'dokunulmuyor', 'harici'
]);
export const DOLDURUCULAR = Object.freeze([
  'secimGerekirse', 'secim', 'okluSecim', 'metinDoldur', 'tuslayarakYaz', 'tarihJs', 'telefonTuslama',
  'onayKutusuZorla', 'radyoZorla', 'dosyaYukle', 'tcSorgulu', 'musteriSorgula'
]);
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

const ALAN_ANAHTARLARI = new Set([
  'id', 'tip', 'etiket', 'secenekler', 'seceneklerDurumu', 'seceneklerKaynagi', 'bagimlilik', 'zorunlu',
  'benzersiz', 'varsayilan', 'yapilandirma', 'eslesme', 'konum', 'doldurucu', 'doldurucuParametreleri',
  'gorunurluk', 'form', 'dogrulama', 'altAlanlar', 'ekranAlanlari', 'altModel', 'varyantlar', 'akisPlani',
  'kimlikTuru', 'bicim', 'kabul', 'birim', 'hassas', 'ekrandaAlanDegil', 'sira', 'sonKontrol', 'kullanim',
  'excelSutunlari', 'durum', 'notlar'
]);
const ESLESME_ANAHTARLARI = new Set(['senaryo', 'urun', 'kart', 'kimlikAlani', 'profilHavuzu', 'harici', 'donusum', 'not']);
const FORM_ANAHTARLARI = new Set(['id', 'kontrol', 'etiket', 'secenekler', 'yardimciKontroller', 'not']);
const SECENEK_ANAHTARLARI = new Set(['deger', 'metin', 'formMetni', 'senaryoDegeri', 'ekranDegerleri', 'secici', 'kosul']);
const ADIM_ANAHTARLARI = new Set(['id', 'sira', 'baslik', 'pomMetodu', 'gorunurluk', 'bolumler', 'altModel', 'kosu']);
const KOSU_ANAHTARLARI = new Set(['aksiyonlar', 'basariGostergesi', 'hataGostergesi', 'zamanAsimiSn', 'not']);
const AKSIYON_ANAHTARLARI = new Set(['tur', 'secici', 'metin', 'durum', 'aciklama', 'zamanAsimiSn']);
const BOLUM_ANAHTARLARI = new Set(['id', 'baslik', 'pomMetodu', 'gorunurluk', 'alanlar']);
const EKRAN_ANAHTARLARI = new Set([
  'semaSurumu', 'tur', 'id', 'ad', 'aciklama', 'ekranUrl', 'specDosyasi', 'pageObject', 'veriKaynaklari',
  'kosullar', 'adimlar', 'senaryoDuzeyi', 'urunDuzeyi', 'acenteBaglami', 'isKurallari', 'bilinmeyenler',
  'baglamGorunurlugu'
]);
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
    case 'acente':
      if (!nesneMi(ifade.acente) || !metinMi(ifade.acente.alanSeti)) h.ekle(yer, '"acente.alanSeti" metin olmalı');
      return;
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
  if (alan.yapilandirma !== undefined && !listedeMi(YAPILANDIRMA_TURLERI, alan.yapilandirma)) {
    h.ekle(aYer, `bilinmeyen yapilandirma "${String(alan.yapilandirma)}"`);
  }
  if (alan.doldurucu !== undefined && !listedeMi(DOLDURUCULAR, alan.doldurucu)) {
    h.ekle(aYer, `bilinmeyen doldurucu "${String(alan.doldurucu)}"`);
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
  if (alan.yapilandirma === 'senaryo' && !(nesneMi(alan.eslesme) && (alan.eslesme.senaryo !== undefined || alan.eslesme.kart !== undefined))) {
    h.ekle(aYer, 'yapilandirma "senaryo" olan alanın "eslesme.senaryo" (ya da alt modelde "eslesme.kart") karşılığı olmalı');
  }
  if (alan.konum !== undefined) {
    if (!nesneMi(alan.konum) || !metinMi(alan.konum.secici) || !listedeMi(KIRILGANLIK_DUZEYLERI, alan.konum.kirilganlik)) {
      h.ekle(aYer, '"konum" { secici, kirilganlik: dusuk|orta|yuksek } içermeli');
    }
  }
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
  return { alanlar: [], senaryoAyarlari: [], kosullar: [], altModeller: [], semaSurumu: typeof semaSurumu === 'number' ? semaSurumu : 1 };
}

/**
 * Adımın koşu tanımı (sürüm 2) — model koşucusu (tests/support/model-kosucu.ts) adımın alanlarını
 * doldurduktan sonra aksiyonları sırayla uygular, sonra başarı göstergesini bekler; hata göstergesi
 * iş kuralı uyarısının göründüğü öğedir (beklenen/beklenmeyen hata mesajı buradan okunur).
 *   { aksiyonlar?: [{ tur: tikla|bekle, secici, metin?, durum?: gorunur|gizli, aciklama?, zamanAsimiSn? }],
 *     basariGostergesi?: { tur: metin|eleman|url, deger, secici? }, hataGostergesi?: { secici }, zamanAsimiSn?, not? }
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
  if (kosu.aksiyonlar !== undefined) {
    if (!Array.isArray(kosu.aksiyonlar)) h.ekle(yer, '"aksiyonlar" dizi olmalı');
    else kosu.aksiyonlar.forEach((a, i) => {
      const aYer = `${yer}.aksiyonlar[${i}]`;
      if (!nesneMi(a)) { h.ekle(aYer, 'aksiyon bir nesne olmalı'); return; }
      h.bilinmeyenAnahtarlar(aYer, a, AKSIYON_ANAHTARLARI);
      if (!listedeMi(AKSIYON_TURLERI, a.tur)) h.ekle(aYer, `"tur" ${AKSIYON_TURLERI.join(' | ')} olmalı`);
      if (!metinMi(a.secici)) h.ekle(aYer, '"secici" zorunlu');
      if (a.metin !== undefined && !metinMi(a.metin)) h.ekle(aYer, '"metin" boş olmayan metin olmalı');
      if (a.durum !== undefined && (a.tur !== 'bekle' || !['gorunur', 'gizli'].includes(a.durum))) h.ekle(aYer, '"durum" yalnızca "bekle" aksiyonunda gorunur | gizli olabilir');
      if (a.aciklama !== undefined && typeof a.aciklama !== 'string') h.ekle(aYer, '"aciklama" metin olmalı');
      sure(a.zamanAsimiSn, aYer);
    });
  }
  if (kosu.basariGostergesi !== undefined) {
    const g = kosu.basariGostergesi;
    const gYer = `${yer}.basariGostergesi`;
    if (!nesneMi(g) || !listedeMi(BASARI_GOSTERGESI_TURLERI, g.tur) || !metinMi(g.deger)) {
      h.ekle(gYer, `{ tur: ${BASARI_GOSTERGESI_TURLERI.join(' | ')}, deger, secici? } olmalı`);
    } else {
      h.bilinmeyenAnahtarlar(gYer, g, new Set(['tur', 'deger', 'secici']));
      if (g.secici !== undefined && (!metinMi(g.secici) || g.tur !== 'metin')) h.ekle(gYer, '"secici" yalnızca "metin" türünde (metnin arandığı öğe) kullanılır');
      if (g.tur === 'url') {
        try { new RegExp(g.deger); } catch { h.ekle(gYer, '"deger" geçerli bir düzenli ifade değil'); }
      }
    }
  }
  if (kosu.hataGostergesi !== undefined) {
    const g = kosu.hataGostergesi;
    if (!nesneMi(g) || !metinMi(g.secici) || Object.keys(g).some((k) => k !== 'secici')) h.ekle(`${yer}.hataGostergesi`, '{ secici } olmalı');
  }
  if (kosu.not !== undefined && typeof kosu.not !== 'string') h.ekle(yer, '"not" metin olmalı');
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
  semaSurumunuDogrula(h, yer, ham, 'ekran');
  for (const anahtar of ['ad', 'aciklama', 'ekranUrl', 'specDosyasi', 'pageObject']) {
    if (!metinMi(ham[anahtar])) h.ekle(yer, `"${anahtar}" zorunlu`);
  }

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

  // Adımlar
  if (!Array.isArray(ham.adimlar) || ham.adimlar.length === 0) {
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
      if (bolumVar === altModelVar) h.ekle(adYer, 'adımda "bolumler" YA DA "altModel" olmalı (ikisi birden/hiçbiri değil)');
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
  if (ham.acenteBaglami !== undefined) {
    if (!nesneMi(ham.acenteBaglami) || !Array.isArray(ham.acenteBaglami.alanlar)) {
      h.ekle(yer, '"acenteBaglami.alanlar" dizi olmalı');
    } else {
      const baglamKimlikleri = [];
      ham.acenteBaglami.alanlar.forEach((alan, i) => alanDogrula(h, `acenteBaglami.alanlar[${i}]`, alan, baglamKimlikleri, b));
      for (const [id, yerler] of tekrarlananlar(baglamKimlikleri)) h.ekle('acenteBaglami', `"${id}" birden fazla kez: ${yerler.join(' | ')}`);
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

  if (h.hatalar.length) {
    throw new Error(`Ekran modeli geçersiz: ${dosyaYolu} (${h.hatalar.length} sorun):\n - ${h.hatalar.join('\n - ')}`);
  }
  return { model: ham, dosyaYolu, altModeller };
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
