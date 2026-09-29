# Ekran paketi — kısa özet

Bu sayfa, ekran paketinin ne olduğunu kod bilmeden anlamanız için yazıldı. Ayrıntılı biçim (bütün alanlar ve kurallar)
`sayfa-paketi.md` belgesindedir; onu yalnız paketi elle ya da bir yapay zekâ aracıyla hazırlarken açmanız gerekir.

## Paket nedir?

Ekran paketi, test ettiğiniz uygulamadaki **bir sayfayı** anlatan tek bir dosyadır (`.json`). İçinde şunlar vardır:

- **Sayfanın alanları:** metin kutuları, açılır listeler, radyo düğmeleri, onay kutuları ve hangisinin ne zaman göründüğü
  (ör. "Vergi no yalnız Kurumsal seçilince görünür").
- **Adımlar ve düğmeler:** hangi alanlar doldurulup hangi düğmeye basılınca bir sonraki adıma geçildiği.
- **Beklenen sonuç:** işlem başarılı olunca sayfada görünen yazı (ör. "Kayıt tamamlandı") ve çıkabilecek uyarılar.
- **Önerilen senaryolar:** bu sayfa için denenmeye değer birkaç değer kombinasyonu (isteğe bağlı).
- **Test verisi tabloları:** seçim alanlarının seçenekleri ve kişi / kayıt verileri için boş ya da örnek tablolar (isteğe bağlı).
- **Kanıtlar:** incelemede alınan ekran görüntüleri (isteğe bağlı).

Paket **gizli ya da kişisel bilgi taşımaz**: parola, kart numarası, kimlik numarası gibi bir değer bulunan paket yüklenirken
reddedilir. Kişi bilgileri Nöbetçi'de şifreli tablolarda durur; paket onlara yalnızca adıyla başvurur.

## Paketi kim üretir?

Çoğu zaman **siz üretmezsiniz**. Nöbetçi'nin iki ana yolu aynı paketi arka planda kendisi hazırlar:

1. **Ekranı tara:** Nöbetçi sayfayı yalnızca okuyarak alanlarını çıkarır (hiçbir düğmeye basmaz).
2. **Akışı kaydet:** işlemi bir kez siz yaparsınız; Nöbetçi alanları, bastığınız düğmeleri ve sonucu toplar.

Paketi elle yüklemeniz yalnız şu durumda gerekir: sayfayı bir **yapay zekâ aracına** (tarayıcıyı kullanabilen bir asistan)
inceletmek istediğinizde. Bunun için Ekranlar > **Ekran ekle** > **İleri düzey** bölümünde:

1. **İstek metnini kopyala** ile metni alın. Metnin başı ne istendiğini sade bir dille anlatır; altı aracın uyacağı teknik
   kurallardır (onları okumanız gerekmez).
2. **Paket biçimini indir** ile biçim dosyasını alın.
3. İkisini sayfanın bağlantısıyla birlikte aracınıza verin. Araç sayfayı sizinle birlikte adım adım inceler; veri gereken
   yerde durup sizden girmenizi ister, kayıt oluşturan ya da ödeme yapan düğmelere basmaz.
4. Aracın ürettiği dosyayı **Dosya seç** ile yükleyin.

Nöbetçi hiçbir yapay zekâ servisine kendisi istek atmaz; aracı siz kullanırsınız.

## Yükleyince ne olur?

Paket **önce önizlenir**; siz onaylamadan hiçbir şey kaydedilmez. Önizlemede şunları görürsünüz:

- **Hatalar:** paket biçime uymuyorsa hangi alanda ne eksik olduğu yazar (ör. `meta.ekran.urlYolu: "/" ile başlayan bir yol
  olmalı`). Hata varsa paket yüklenmez; dosyayı düzeltip yeniden seçin.
- **Uyarılar:** yüklemeyi engellemez; gözden geçirmeniz önerilir.
- **Senaryo önerileri:** eklemek istediklerinizi işaretlersiniz. Eklenen senaryolar "Toplu koşuya dahil" **kapalı** gelir;
  siz gözden geçirip açana kadar "Koşuyu başlat" onları koşmaz.
- **Test verisine yazılacaklar:** tablolar ve **alan bağlantıları** (bir alanın değerini hangi tablo sütunundan alacağı).
  Aynı adlı ya da benzer tablo varsa ne yapılacağını siz seçersiniz.

Onaylayınca ekran oluşur (ya da mevcut ekranın modeli güncellenir). Aynı ekrana sonradan yeni paket yüklerseniz farklar
**bulgu** olarak gelir: her bulguyu (ör. "yeni alan eklendi") tek tek kabul ya da reddedersiniz; kabul ettikleriniz yeni
model sürümü olur, eski senaryolar korunur.

## Paketin iskeleti

Aşağıdaki iskelet yalnız fikir vermek içindir; her bölümün kuralları ayrıntılı belgededir.

```json
{
  "tur": "sayfa-paketi",
  "surum": 1,
  "meta": { "ekran": { "anahtar": "uyelik-formu", "ad": "Üyelik formu", "urlYolu": "/uyelik/" },
            "olusturan": "…", "olusturulma": "2026-09-29T10:00:00Z", "baglamProfilleri": [] },
  "model": { "…": "sayfanın alanları, adımları, beklenen sonuç" },
  "senaryoOnerileri": [],
  "gerekenAyarlar": { "girisGerekli": true, "ikiAsamaliDogrulama": "yok", "captchaGoruldu": false, "testVerisiTurleri": [] },
  "bilinmeyenler": []
}
```

- `urlYolu` tam adres değil **yoldur**; ortamın adresi (test / canlı) Ayarlar > Ortamlar'dan gelir. Böylece aynı paket her
  ortamda çalışır.
- Kod dosyası bilgileri (`specDosyasi`, `pageObject`) **isteğe bağlıdır**; yazılmazsa Nöbetçi kendisi doldurur.
- `bilinmeyenler`, incelemede netleşmeyen noktaların listesidir; boşsa "bilinmeyen yok" demektir.

## Sık sorulanlar

**Paketi yükledim ama "koşulamaz" diyor.** Modelde işlemi başlatan düğme ya da beklenen sonuç eksik olabilir. Ekranın
**Akışlar** sekmesinde **Düzenle** ile diyagramı açın; eksik düğmeyi "Sayfada seç" ile sayfada tıklayarak ekleyin.

**Test için gerçek kimlik numarası yazabilir miyim?** Hayır. Paket kişisel veri taşımaz; kişi bilgilerini Nöbetçi'de
Test verisi tablolarına girin, paket onlara adıyla başvursun.

**Dosyayı düzelttim; aynı adla yeniden seçebilir miyim?** Evet. Dosya seçimi her seferinde sıfırlanır; aynı adlı
düzeltilmiş dosya yeniden okunur ve önizleme yenilenir.

**Paket mi, tarama mı?** Önce **Ekranı tara**yı deneyin. Çok adımlı ya da kayıt oluşturan işlemlerde **Akışı kaydet**
daha iyi sonuç verir. Paket yolu, bu ikisinin yetmediği karmaşık sayfalar içindir.
