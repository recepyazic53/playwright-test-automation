// JetSeyahat "Senaryo Oluştur/Düzenle" formunun yönettiği senaryo alanları — yan etkisiz
// modül (test-sunucu.mjs'i import etmek token dosyası/log yönlendirmesi gibi yan etkiler
// doğurduğu için liste buraya ayrıldı; koruma testleri tests/birim/ buradan okur).
//
// /senaryo-guncelle kayıttaki bu alanları formdan gelen yeni değerlerle DEĞİŞTİRİR (formda
// artık olmayanlar — ör. ettiren "ayni"ye çekildiyse ettirenProfili — silinir); listede
// OLMAYAN, elle eklenmiş başka alanlar olduğu gibi korunur.
//
// Tek doğruluk kaynağı ekran modelidir: tests/ekran-modelleri/jet-seyahat.model.json içinde
// yapilandirma "senaryo" olan alanların senaryo anahtarları bu listeyle AYNI olmalı —
// tests/birim/ekran-modeli.spec.ts farkı raporlar (npm run test:birim).
export const JET_SEYAHAT_FORM_ALANLARI = Object.freeze([
  'baslik', 'kapsam', 'alternatif', 'covidTeminati', 'sorguTipi', 'ettiren',
  'ettirenProfili', 'ettirenOzelKimligi', 'ettirenTuzelKimligi', 'sigortaliProfili', 'sigortaliKimligi',
  'kayakTeminati', 'acenteProfili', 'cokluSorguDosyasi', 'cokluSorguKisiSayisi',
  'odemeAdimiDahil', 'beklenenSonuc',
  // Senaryoya özel ödeme kartı: formda ortak karttan farklı bir kart yoksa (ya da ödeme
  // adımı kapatıldıysa) güncellemede kayıttan SİLİNİR.
  'krediKarti'
]);
