// TERİMLER SÖZLÜĞÜ (saf; tarayıcı ve testler kullanır) — Ayarlar > Arayüz > "Terimler" kartı ve Arayüz rehberi.
// Arayüzde her kavram tek adla anılır: "Planlı koşular" (zamanlanmış değil), "Test verisi" (menüde tek başına "Veri" değil),
// sonuç durumu "Başarısız" (kaldı / kalan değil), "CANLI" yalnız ortam türü için. Her terim tek cümleyle açıklanır.
// Metinler geneldir: ürün / şirket adı içermez.

/** @type {ReadonlyArray<{ terim: string; aciklama: string }>} */
export const TERIMLER = Object.freeze([
  { terim: 'Ekran', aciklama: 'Test ettiğiniz uygulamadaki bir sayfa; alanları, adımları ve kuralları ekranın modelinde durur.' },
  { terim: 'Model', aciklama: 'Ekranın alanlarını, adımlarını ve kurallarını (hangi alan ne zaman görünür, hangisi zorunlu) tutan sürümlü tanım; senaryo formu ve koşu bundan çalışır.' },
  { terim: 'Paket', aciklama: 'Bir ekranın modelini ve önerilen senaryolarını taşıyan dosya (.json); tarama, akış kaydı ya da bir yapay zekâ aracı üretir.' },
  { terim: 'Akış', aciklama: 'Adımların çalışma sırası: ekranda akış diyagramı, servislerde istek zinciri (servis akışı), uçtan uca akışta servis, ekran ve SQL adımları birlikte.' },
  { terim: 'Ortak akış', aciklama: 'Birden çok ekranın kullandığı adımlar (ör. ödeme); bir kez tanımlanır, ekranlara siz eklersiniz ve kendi senaryosu yoktur.' },
  { terim: 'Senaryo', aciklama: 'Bir ekranın ya da servisin hangi değerlerle ve hangi beklentiyle deneneceğini söyleyen kayıt; koşuda her senaryo bir testtir.' },
  { terim: 'Bulgu', aciklama: 'Yeni tarama ya da paketle mevcut model arasındaki fark (ör. eklenen alan, değişen seçenek); kabul ettikleriniz yeni model sürümü olur.' },
  { terim: 'Test verisi tablosu (kayıt / liste)', aciklama: 'Excel sayfası gibi sütunlu tablo: kayıt tablosunda her satır bir kişi ya da kayıttır ("Kişi ve kayıt verileri"), liste tablosu bir seçim alanının seçeneklerini tutar ("Ekran listeleri").' },
  { terim: 'Karşılık', aciklama: 'Tablodaki değerin sayfadaki seçenek değeri ve servise giden değeri (ör. EKSPRES → sayfa: 1, servis: EXP); boşsa tablodaki değer kullanılır.' },
  { terim: 'Ortam türü', aciklama: 'Ortamın Test mi Canlı mı olduğu; "CANLI" yalnız bu anlamda kullanılır ve Canlı ortamdaki her işlemden önce ayrıca onay sorulur.' },
  { terim: 'İzin', aciklama: 'Nöbetçi\'nin sizin adınıza yapabileceği bir işlem sınıfı (ör. servis isteği, arka plan çalışması); hepsi varsayılan olarak kapalıdır ve Ayarlar > İzinler\'den açılır.' },
  { terim: 'Planlı koşu', aciklama: 'Nöbetçi\'nin belirlediğiniz zamanlarda (her gün, seçili günler ya da her N saatte bir) kendiliğinden başlattığı koşu; üst menüde "Planlı koşular".' },
  { terim: 'Dene / Koşu', aciklama: 'Dene tek senaryoyu kaydetmeden seçili ortamda hemen dener (deneme olarak işaretlenir); Koşu kayıtlı senaryoları çalıştırır ve sonuçları Sonuçlar\'a yazar.' },
  { terim: 'Başarısız', aciklama: 'Testin sonuç durumu: beklenen görülmedi ya da bir adım tamamlanamadı; sonuçlarda, raporlarda ve süzgeçlerde hep bu adla geçer.' },
  { terim: 'Ekranlar ve servisler', aciklama: 'Sol menüdeki bölüm: ekranlar, ortak akışlar ve servisler burada ayrı gruplar hâlinde listelenir; sayaçlarda ortak akış ekran sayılmaz.' },
  { terim: 'Toplu koşuya dahil', aciklama: 'Senaryonun anahtarı: açıksa "Koşuyu başlat" ve planlı koşular senaryoyu koşar, kapalıysa senaryo yalnız tek başına (Dene ya da ▷) çalışır.' },
  { terim: 'Korunan parça', aciklama: 'Akış diyagramının gösteremediği ayar (ör. seçime bağlı düğme, kod yöntemi); siz değiştirmeseniz de kaydederken olduğu gibi korunur.' },
  { terim: 'Alan bağlantısı', aciklama: 'Ekrandaki bir alanın değerini hangi test verisi tablosunun hangi sütunundan alacağını söyleyen bağ (ör. İl → İller tablosu, Ad sütunu).' },
  { terim: 'Kanıt', aciklama: 'İncelemede sayfanın o anki hâlini gösteren ekran görüntüsü; paketle gelir, şifreli saklanır ve modelin neye göre çıkarıldığını gösterir.' },
  { terim: 'Basit mod', aciklama: 'Nöbetçi\'yi ilk kez kullananlar için sade görünüm: menüde yalnız Testlerim, Sonuçlar ve Ayarlar vardır, Gelişmiş moda üst çubuktaki anahtarla her an geçilir ve hiçbir veri değişmez.' },
  { terim: 'Testlerim', aciklama: 'Basit moddaki test listesi: her satır bir ekranın testidir, o ekranın senaryoları da testin değişkenleri olarak sayılır.' },
  { terim: 'Değişken', aciklama: 'Basit modda bir testin farklı değerlerle denenen hâli (ör. bireysel ve kurumsal başvuru); Gelişmiş modda aynı kayıt senaryo olarak görünür.' }
]);
