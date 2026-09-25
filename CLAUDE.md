# Playwright & TypeScript Test Otomasyonu - Claude Yönergeleri

## 1. İletişim ve Davranış Kuralları
- **Tüm yanıtları, kod açıklamalarını ve rapor analizlerini Türkçe yap.**
- Yanıtları kısa, net ve çözüme odaklı tut. Giriş ve kapanış nezaket cümlelerini atla.
- Token tasarrufu için kod değişikliklerinde tüm dosyayı basmak yerine sadece ilgili fonksiyon veya satırları göster.
- Yanıt yazarken veya karar verirken projenin mevcut yapısına öncelik ver.

## 2. Proje Mimarisi ve Teknoloji Yığını
- **Test Framework:** Playwright (`@playwright/test`)
- **Dil:** TypeScript (Strict typing uygulanmalı, zorunlu kalmadıkça `any` kullanılmamalıdır)
- **Çevre Yönetimi:** `dotenv` ile `.env` dosyaları üzerinden ortam değişkenleri yönetilir. `TEST_ENV` değişkeni (`canli` veya `test`) kontrol edilmelidir.

## 3. Kullanılabilir Komutlar (NPM Scripts)
- Testleri çalıştırma: `npm run test`
- Arayüz modunda test çalıştırma: `npm run test:ui`
- Başlıklı (Headed) tarayıcıda çalıştırma: `npm run test:headed`
- Debug modunda çalıştırma: `npm run test:debug`
- **Canlı ortamda test çalıştırma:** `npm run test:canli`
- **Test ortamında çalıştırma:** `npm run test:test-ortami`
- TypeScript tip kontrolü: `npm run typecheck`

## 4. Test Yazım ve Kodlama Standartları
- **Asenkron Yapı:** Tüm Playwright aksiyonlarında ve bekleme adımlarında `await` yapısını eksiksiz kullan.
- **Locator Hiyerarşisi:** 
  1. Öncelikle esnek ve kullanıcı odaklı seçicileri tercih et (`page.getByRole`, `page.getByText`, `page.getByTestId`).
  2. Özel bir ID veya Role bulunmayan dinamik elemanlarda esnek CSS veya XPath seçicilerini yedek seçenek (fallback) olarak kullanabilirsin.
- **Modüler Yapı & POM:** Projenin Page Object Model (POM) mimarisine sadık kal. İhtiyaç halinde yeni Page veya Utility dosyaları oluşturabilirsin.
- **Dinamik İçerik:** Sayfa geçişleri ve iframe yüklemeleri için explicit wait/assertion kullan (`expect(locator).toBeVisible()`).
- **Tip Güvenliği:** Kod yazdıktan veya düzenledikten sonra kodun `npm run typecheck` komutundan hatasız geçtiğinden emin ol.

## 5. Tarama ve İstisna Sınırları
- Normal geliştirme sırasında `node_modules/`, `test-results/`, `playwright-report/` veya `.git/` klasörlerini tarama.
- **Hata Teşhis İstisnası:** Bir test hata verdiğinde (fail ettiğinde) veya kök nedeni bulman gerektiğinde; ilgili log, trace veya ekran görüntüsü çıktılarını inceleyebilirsin.