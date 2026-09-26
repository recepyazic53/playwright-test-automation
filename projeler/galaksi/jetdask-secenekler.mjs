// JETDASK — TEST ekranından okunan açılır liste seçenekleri (2026-09-26, kullanıcının oturumuyla; yalnızca okundu, "Prim Hesapla"
// boş formla denendi). [değer, görünen metin]. Uyruk listesi (197 ülke) pakete alınmadı: pasaport profillerinde uyruk ülke adıyla
// durur, koşucu seçeneği görünen metniyle de seçer.
// NOT: import.meta KULLANILMAZ.

/** Sigorta ettiren sıfatı (#InsurerType); ekranın varsayılanı "1" (MAL SAHIBI). */
export const SIGORTA_ETTIREN_SIFATLARI = [['0', 'SIGORTA ETTIREN YOK'], ['1', 'MAL SAHIBI'], ['2', 'KIRACI'], ['3', 'INTIFA HAKKI SAHIBI'], ['4', 'YÖNETICI'], ['5', 'AKRABA'], ['6', 'DAIN-I MÜRTEHIN'], ['7', 'DIGER']];
/** Kullanım şekli (#UsageType); varsayılan "5". */
export const KULLANIM_SEKILLERI = [['5', 'MESKEN'], ['6', 'TICARETHANE'], ['7', 'DIGER']];
/** İnşa tarzı (#BuildType); varsayılan "4". */
export const INSA_TARZLARI = [['4', 'ÇELIK,BETONARME,KARKAS'], ['5', 'DIGER YAPILAR']];
/** İnşa yılı (#BuildYear); varsayılan "6". */
export const INSA_YILLARI = [['6', '1975 VE ÖNCESİ'], ['7', '1976-1999'], ['8', '2000-2006'], ['9', '2007-2019'], ['10', '2020 VE SONRASI']];
/** Toplam kat sayısı (#TotalFloor); varsayılan "5". */
export const TOPLAM_KATLAR = [['5', '01-03 ARASI KAT'], ['6', '04-07 ARASI KAT'], ['7', '08-18 ARASI KAT'], ['8', '19 VE ÜZERİ KATLAR']];
/** Önceki hasar (#AnteriorDamage); varsayılan "0". */
export const ONCEKI_HASARLAR = [['0', 'HASARSIZ'], ['1', 'AZ HASARLI'], ['2', 'ORTA HASARLI']];
/** Bulunduğu kat (#KT); varsayılan boş ("Seçiniz"). "3. KAT" artık listede (kodlu testin eksik seçenek çözümü gerekmez). */
export const BULUNDUGU_KATLAR = [
  ['-4', '-4 VE ALTI KATLAR'], ['-3', '-3. KAT'], ['-2', '-2. KAT'], ['-1', '-1. KAT'], ['0', 'ZEMIN KAT'], ['1', '1. KAT'], ['2', '2. KAT'],
  ['3', '3. KAT'], ['4', '4. KAT'], ['5', '5. KAT'], ['6', '6. KAT'], ['7', '7. KAT'], ['8', '8. KAT'], ['9', '9. KAT'], ['10', '10. KAT'],
  ['11', '11 VE UZERI KATLAR']
];
/** Uyarı penceresi (Hesapla doğrulamaları; ör. "Kimlik numarası girilmemiş ya da geçersiz biçimde."): #dialog > #dialogcontainer + "Tamam". */
export const UYARI_PENCERESI = '#dialogcontainer';
