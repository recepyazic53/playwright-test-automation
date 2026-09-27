// GERİYE UYUM TABLOSU (TEK DOSYA) — şemanın eski anahtar adları → genel karşılıkları.
//
// Kasada daha önce kaydedilmiş modeller / senaryolar / doğrulama bağlamları bu eski adları taşıyor olabilir;
// doğrulayıcılar (ekran-modeli-dogrulayici.mjs, senaryo-dogrulayici.mjs) eski adı OKURKEN eşdeğer yeni anahtar
// gibi yorumlar, yeni kayıtlar her zaman yeni adla yazılır. Kaydedilmiş veri kendiliğinden yeniden yazılmaz.
//
// Eski adlar kodda YALNIZCA bu dosyada durur (koruma testi: tests/birim/yasak-sozcukler.ts bu dosyayı bilerek
// kapsam dışında tutar). Kasadaki veri yeni adlara göç edildikten sonra bu tablo ve okuma desteği kaldırılabilir.
//
//  - Bu dosya HİÇBİR modül import etmez; Node'a/DOM'a özgü API kullanmaz (tarayıcıya da sunulur:
//    /arayuz/eski-anahtarlar.mjs).

/** Ekran modeli (ekran-modeli-dogrulayici.mjs). */
export const ESKI_MODEL_ANAHTARLARI = Object.freeze({
  /** Modelin bağlam profili ekranı (yeni adı: baglam). */
  baglam: 'acenteBaglami',
  /** Koşul ifadesi { baglam: { alanSeti } } (yeni adı: baglam). */
  baglamIfadesi: 'acente',
  /** kosullar.<ad>.bilinenDurumlar[] öğesinde profil adı (yeni adı: profil). */
  durumProfili: 'acente',
  /** kosullar.<ad>.bilinenDurumlar[] öğesinde eşleşme kodu (yeni adı: profilKodu). */
  durumKodu: 'acentePartaji',
  /** Alt model alanının kayıt içindeki adı (yeni adı: eslesme.kayitAlani). */
  kayitAlani: 'kart'
});

/** Senaryo verisi ve doğrulama bağlamı (senaryo-dogrulayici.mjs). */
export const ESKI_SENARYO_ANAHTARLARI = Object.freeze({
  /** Model: eslesme.kayitAlani'nın eski adı. */
  kayitAlani: ESKI_MODEL_ANAHTARLARI.kayitAlani,
  /** Model: bilinenDurumlar[].profilKodu'nun (bağlam profillerinde kod'un) eski adı. */
  durumKodu: ESKI_MODEL_ANAHTARLARI.durumKodu,
  /** Model: bağlam profili seçen alanın (id: baglamProfili) eski kimliği. */
  baglamProfiliAlani: 'acenteProfili',
  /** Girdi: baglamKodu / baglamKullanicisi'nin eski adları. */
  baglamKodu: 'acenteKodu',
  baglamKullanicisi: 'acenteKullanicisi',
  /** Doğrulama bağlamı: "profiller"in eski adı ve eski biçimdeki parçaları. */
  profiller: 'ortak',
  baglamProfilleri: 'acenteProfilleri',
  varsayilanKayit: 'varsayilanKrediKarti',
  /** Modelde eslesme.profilHavuzu'nun eski yolları → yeni havuz adı. */
  havuzYollari: Object.freeze({
    'ortak.kullaniciDegistir': 'baglam',
    'ortak.kimlikBilgileri.ozel': 'ozel',
    'ortak.kimlikBilgileri.tuzel': 'tuzel'
  })
});
