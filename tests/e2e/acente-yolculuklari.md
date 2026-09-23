# Acente yolculukları

Bu dosya, uygulama içinde birlikte gezilen iş akışlarının test senaryosu taslağıdır. Kimlik bilgileri, doğrulama kodları ve müşteri verileri bu dosyaya yazılmaz.

## 1. Acente girişi

1. `/acente-giris` sayfasını aç.
2. Kullanıcı adı alanını doldur.
3. Şifre alanını doldur.
4. **Gönder** ile giriş isteğini başlat.
5. Google Authenticator doğrulama kodunu gir.
6. **Gönder** ile doğrulamayı tamamla.
7. Ana portalın açıldığını; profil alanında oturum açan kullanıcının göründüğünü doğrula.

Durum: Gözlemlendi — otomasyonda iki aşamalı doğrulama için test-ortamına uygun bir çözüm gerekecek.

## Kaydedilecek sonraki adım

Kullanıcı uygulamada ilerledikçe burada aşağıdaki bilgiler kaydedilir:

- ekranın/menünün adı,
- seçilen işlem,
- beklenen sonuç,
- varsa gerekli ama hassas olmayan test verisi.

## 2. Jet Kasko / SFS erişim yetkisi

1. Jet Kasko akışına git.
2. Sistem, SFS erişimi için kullanılan IP adresinin tanımlı olmadığını bildirir.
3. Sayfada **Bu Adresi Tanımla** bağlantısı sunulur.

Beklenen sonuç: Yetkisiz IP ile SFS ekranı açılmamalı; kullanıcıya erişim nedenini açıklayan bir hata mesajı ve IP tanımlama seçeneği gösterilmelidir.

Durum: Otomatik test `tests/canli/jet-kasko.spec.ts` içindedir. IP tanımlama bağlantısına tıklanmaz; bu adım yetki durumunu değiştirebilir.
