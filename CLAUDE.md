# Nöbetçi (Playwright & TypeScript Test Platformu) - Claude Yönergeleri

## 1. İletişim ve Davranış Kuralları
- **Tüm yanıtları, kod açıklamalarını ve rapor analizlerini Türkçe yap.**
- Yanıtları kısa, net ve çözüme odaklı tut. Giriş ve kapanış nezaket cümlelerini atla.
- Token tasarrufu için kod değişikliklerinde tüm dosyayı basmak yerine sadece ilgili fonksiyon veya satırları göster.
- Yanıt yazarken veya karar verirken projenin mevcut yapısına öncelik ver.

## 2. Proje Mimarisi ve Teknoloji Yığını
- **Test Framework:** Playwright (`@playwright/test`)
- **Dil:** TypeScript (Strict typing uygulanmalı, zorunlu kalmadıkça `any` kullanılmamalıdır)
- **Veri:** Projeler, ortamlar, giriş bilgileri, test verisi, ekran modelleri ve senaryolar YALNIZCA Nöbetçi'nin şifreli veritabanındadır (`veri/`, Git'e girmez). Kodda kullanıcıya ait veri, kural ya da seçim bulunmaz; kullanıcı kararları Ayarlar'da ya da ilgili ekranda durur.
- **Koşu:** Senaryolar ekran modeliyle tek spec'te (`tests/model-kosucu/model-senaryolari.spec.ts`) koşar; koşuyu Nöbetçi proje + ortam kimliğiyle (`NOBETCI_PROJE_ID` / `NOBETCI_ORTAM_ID`) başlatır. İsteğe bağlı ortam değişkenleri `.env.example`'dadır.

## 3. Kullanılabilir Komutlar (NPM Scripts)
- Nöbetçi'yi başlatma (sunucu + tarayıcı): `npm run baslat` (yalnız sunucu: `npm run test-sunucu`)
- Koruma (birim) testleri: `npm test` (yalnızca 127.0.0.1'deki sahte uygulamalar; uçtan uca model koşusu için `MODEL_UCTAN_UCA=1`)
- TypeScript tip kontrolü: `npm run typecheck`

## 4. Test Yazım ve Kodlama Standartları
- **Asenkron Yapı:** Tüm Playwright aksiyonlarında ve bekleme adımlarında `await` yapısını eksiksiz kullan.
- **Locator Hiyerarşisi:** 
  1. Öncelikle esnek ve kullanıcı odaklı seçicileri tercih et (`page.getByRole`, `page.getByText`, `page.getByTestId`).
  2. Özel bir ID veya Role bulunmayan dinamik elemanlarda esnek CSS veya XPath seçicilerini yedek seçenek (fallback) olarak kullanabilirsin.
- **Modüler Yapı:** Motor genel kalmalı (ürün/şirket adı, kurala özgü sabit içermez); ekrana özgü davranış ekran modelinde, kullanıcı seçimleri Ayarlar'da durur.
- **Dinamik İçerik:** Sayfa geçişleri ve iframe yüklemeleri için explicit wait/assertion kullan (`expect(locator).toBeVisible()`).
- **Tip Güvenliği:** Kod yazdıktan veya düzenledikten sonra kodun `npm run typecheck` komutundan hatasız geçtiğinden emin ol.

## 5. Tarama ve İstisna Sınırları
- Normal geliştirme sırasında `node_modules/`, `test-results/`, `playwright-report/` veya `.git/` klasörlerini tarama.
- **Hata Teşhis İstisnası:** Bir test hata verdiğinde (fail ettiğinde) veya kök nedeni bulman gerektiğinde; ilgili log, trace veya ekran görüntüsü çıktılarını inceleyebilirsin.