// POLİGON — her ekranın "insan yolu": bir kullanıcının ekranı baştan sona nasıl tamamladığı (Playwright ile). Poligonun kendisinin
// doğru çalıştığının kanıtı (hızlı testin başarısızlığı poligondan değil Nöbetçi'den kaynaklanmalı). Değerler UYDURMADIR.
import { expect, type Page } from '@playwright/test';

export type InsanYolu = (page: Page) => Promise<void>;

export const INSAN_YOLLARI: Record<string, InsanYolu> = {
  '/sepet': async (page) => {
    await page.getByLabel('Kupon kodu').fill('INDIRIM10');
    await page.getByRole('button', { name: 'Uygula' }).click();
    await expect(page.getByText('%10 indirim uygulandı')).toBeVisible();
    await page.getByRole('radio', { name: /Hızlı kargo/ }).click();
    await page.getByRole('button', { name: 'Ödemeye geç' }).click();
    await expect(page).toHaveURL(/\/sepet\/odeme$/);
    await page.getByLabel('Ad soyad').fill('Deneme Kişi');
    await page.getByLabel('Cep telefonu').fill('05001112233');
    await page.getByLabel('İl').selectOption('Ortakent');
    await page.getByLabel('Açık adres').fill('Deneme sokak 1');
    await page.getByRole('link', { name: 'Daha fazla seçenek' }).click();
    await page.getByLabel('Teslimat saati').selectOption('18:00-22:00');
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Siparişi onayla' }).click();
    await expect(page.getByText(/Sipariş numaranız: SP-\d+/)).toBeVisible();
  },
  '/otel': async (page) => {
    await page.getByLabel('Giriş tarihi').click();
    await page.locator('.takvim button', { hasText: /^10$/ }).click();
    await page.getByLabel('Çıkış tarihi').click();
    await page.locator('.takvim button', { hasText: /^13$/ }).click();
    await page.getByRole('button', { name: 'Çocuk artır' }).click();
    await page.getByLabel('Çocuk yaşı').selectOption('3-6');
    await page.getByRole('button', { name: 'Müsaitlik sorgula' }).click();
    await page.getByRole('button', { name: 'Bu odayı seç' }).nth(1).click();
    await page.getByLabel('Ad', { exact: true }).fill('Deneme');
    await page.getByLabel('Soyad').fill('Kişi');
    await page.getByLabel('E-posta').fill('deneme@ornek.test');
    await page.getByLabel('Telefon').fill('05001112233');
    await page.getByRole('button', { name: 'Rezervasyonu tamamla' }).click();
    await expect(page.getByText('Rezervasyonunuz onaylandı')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/otel\/onay\?no=OT-/);
  },
  '/ucak': async (page) => {
    await page.getByLabel('Nereden').pressSequentially('Kuzey', { delay: 30 });
    await page.getByRole('option', { name: 'Kuzeykent (KZK)' }).click();
    await page.getByLabel('Nereye').pressSequentially('Batı', { delay: 30 });
    await page.getByRole('option', { name: 'Batıkent (BTK)' }).click();
    await page.getByLabel('Gidiş tarihi').fill('2026-11-20');
    await page.getByRole('button', { name: 'Uçuşları ara' }).click();
    await page.getByRole('button', { name: 'Seç', exact: true }).nth(2).click();
    await page.getByRole('gridcell', { name: 'Koltuk 4B' }).click();
    await page.getByRole('button', { name: 'Yolcu bilgilerini gir' }).click();
    await page.getByLabel('Yolcu adı').fill('Deneme');
    await page.getByLabel('Yolcu soyadı').fill('Kişi');
    await page.getByLabel(/Doğum tarihi/).fill('01.02.1990');
    await page.getByRole('button', { name: 'Rezervasyonu tamamla' }).click();
    await expect(page.getByText(/PNR: UC\d+/)).toBeVisible();
    await expect(page).toHaveURL(/\/ucak\/onay$/);
  },
  '/havale': async (page) => {
    await page.getByLabel('Alıcı IBAN').pressSequentially('TR120006200000000123456789', { delay: 5 });
    await page.getByRole('button', { name: 'Alıcıyı sorgula' }).click();
    await page.getByLabel('Tutar (TL)').fill('250');
    await page.getByLabel('Açıklama').fill('Kira');
    await page.getByRole('button', { name: 'Devam' }).click();
    await page.getByLabel('Onay kodu').fill('246810');
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.getByText(/Dekont no: HV-\d+/)).toBeVisible();
  },
  '/basvuru': async (page) => {
    await page.getByLabel('Ad', { exact: true }).fill('Deneme');
    await page.getByLabel('Soyad').fill('Kişi');
    await page.getByLabel('E-posta').fill('deneme@ornek.test');
    await page.getByRole('button', { name: 'İleri' }).first().click();
    await page.getByLabel('Pozisyon').selectOption('yazilim');
    await page.getByLabel('Kod deposu adresi').fill('https://depo.ornek.test/deneme');
    await page.getByLabel('Deneyim (yıl)').fill('4');
    await page.getByLabel(/Beceriler/).fill('TypeScript');
    await page.getByLabel(/Beceriler/).press('Enter');
    await page.getByLabel(/Özgeçmiş/).setInputFiles({ name: 'ozgecmis.txt', mimeType: 'text/plain', buffer: Buffer.from('Deneme özgeçmiş') });
    await page.locator('section[data-adim="2"]').getByRole('button', { name: 'İleri' }).click();
    await page.getByLabel('Bilgilerimin doğruluğunu onaylıyorum').check();
    await page.getByRole('button', { name: 'Başvuruyu gönder' }).click();
    await expect(page.getByText(/Başvuru no: IB-\d+/)).toBeVisible();
  },
  '/anket': async (page) => {
    await page.locator('#yildizlar svg').nth(1).click();
    await page.getByLabel('Neden memnun kalmadınız?').fill('Teslimat gecikti');
    await page.locator('#sira li', { hasText: 'Destek' }).dragTo(page.locator('#sira li', { hasText: 'Fiyat' }));
    for (const ad of ['teslimat', 'paketleme', 'iletisim']) await page.locator(`input[name=${ad}][value="İyi"]`).check();
    await page.getByText('Anketi gönder').click();
    await expect(page.getByText('Teşekkürler, yanıtınız kaydedildi')).toBeVisible();
  },
  '/destek': async (page) => {
    const f = page.frameLocator('iframe');
    await f.getByLabel('Kategori', { exact: true }).selectOption('teknik');
    await expect(f.getByLabel('Alt kategori')).toBeEnabled();
    await f.getByLabel('Alt kategori').selectOption('Yavaşlık');
    await f.getByLabel('Konu').fill('Sayfa yavaş açılıyor');
    await f.getByRole('textbox', { name: 'Açıklama' }).fill('Akşam saatlerinde sayfalar çok yavaş yükleniyor.');
    await f.getByLabel('Ek dosya eklemek istiyorum').check();
    await f.getByLabel('Ek dosya', { exact: true }).setInputFiles({ name: 'ekran.txt', mimeType: 'text/plain', buffer: Buffer.from('ek') });
    await f.getByRole('button', { name: 'Bileti oluştur' }).click();
    await expect(f.getByText(/Bilet no: DB-\d+/)).toBeVisible();
  },
  '/restoran': async (page) => {
    await page.getByRole('button', { name: 'Izgara köfte ekle' }).click();
    await page.getByRole('button', { name: 'Ayran ekle' }).click();
    await page.getByLabel('Sipariş notu').fill('Zil çalışmıyor');
    await page.getByRole('button', { name: 'Adres ekle' }).click();
    await page.waitForTimeout(800);
    await page.getByLabel('Adres başlığı').fill('Ev');
    await page.getByLabel('Mahalle').selectOption('Yeşiltepe');
    await page.getByLabel('Açık adres').fill('Deneme sokak 5');
    await page.getByRole('button', { name: 'Adresi kaydet' }).click();
    await page.getByLabel('Kartla öde').check();
    await page.getByLabel('Kart numarası').fill('4111111111111111');
    await page.getByLabel(/Son kullanma/).fill('1230');
    await page.getByLabel('CVV').fill('123');
    await page.getByText('Siparişi ver').click();
    await expect(page.getByText(/Tahmini teslimat: 35 dk/)).toBeVisible();
  },
  '/etkinlik': async (page) => {
    await page.getByLabel('Ad soyad').fill('Deneme Kişi');
    await page.getByLabel('E-posta').fill('deneme@ornek.test');
    await page.getByLabel('Oturum').selectOption('atolyeA');
    await page.getByLabel('Fatura istiyorum').check();
    await page.getByLabel('Vergi no').fill('1234567890');
    await page.getByRole('button', { name: 'Kaydol' }).click();
    await expect(page.getByText(/Yaka kartı no: ET-\d+/)).toBeVisible();
  },
  '/ayarlar': async (page) => {
    await page.getByLabel('Hakkımda').fill('Deneme biyografi');
    await page.getByRole('tab', { name: 'Bildirimler' }).click();
    await page.getByRole('switch', { name: 'SMS bildirimleri' }).click();
    await page.getByLabel('Cep telefonu').fill('05001112233');
    await page.getByRole('tab', { name: 'Gizlilik' }).click();
    await page.getByLabel('Yalnız bağlantılarım').check();
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(page.getByText('Ayarlar kaydedildi')).toBeVisible();
  },
  '/arama': async (page) => {
    await page.getByLabel('Konum').fill('Çınarlı');
    await page.getByRole('button', { name: 'Ara', exact: true }).click();
    await page.getByRole('button', { name: 'İncele' }).nth(1).click();
    await expect(page).toHaveURL(/#\/ilan\/44$/);
    await page.getByRole('button', { name: 'Randevu talep et' }).click();
    await page.getByLabel('Ad soyad').fill('Deneme Kişi');
    await page.getByLabel('Telefon').fill('05001112233');
    await page.getByLabel('Telefon').blur();
    await page.getByLabel('Doğrulama kodu').fill('1234');
    await page.getByLabel('Tercih edilen gün').selectOption('Cumartesi');
    await page.getByRole('button', { name: 'Talebi gönder' }).click();
    await expect(page.getByText(/Talep no: KE-\d+/)).toBeVisible();
  },
  '/not': async (page) => {
    await page.getByLabel('Başlık').fill('Alışveriş');
    await page.getByLabel('Not', { exact: true }).fill('Süt, ekmek');
    await page.getByRole('combobox', { name: 'Etiket' }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.getByLabel('Hatırlatma tarihi').fill('05.11.2026');
    await page.getByLabel('Hatırlatma saati').selectOption('18:00');
    await page.getByRole('button', { name: 'Notu kaydet' }).click();
    await expect(page.getByText(/Not kaydedildi \(#\d+\)/)).toBeVisible();
  },
  '/abonelik': async (page) => {
    await page.getByLabel('T.C. kimlik no').fill('10000000146');
    await expect(page.getByLabel('Ad soyad')).toHaveValue('A*** Y***');
    await page.getByLabel(/Doğum tarihi/).fill('01.02.1990');
    await expect(page.getByLabel('Bölge')).toBeVisible();
    await page.getByLabel('Bölge').selectOption('kuzey');
    await expect(page.getByLabel('İlçe')).toBeEnabled();
    await page.getByLabel('İlçe').selectOption('Sahil');
    await expect(page.getByLabel('Mahalle')).toBeEnabled();
    await page.getByLabel('Mahalle').selectOption('Fener');
    await page.getByLabel('Açık adres').fill('Deneme sokak 9');
    await page.getByRole('button', { name: 'Başvur' }).click();
    await expect(page.getByText(/Başvuru no: AB-\d+/)).toBeVisible();
  },
  '/uyelik': async (page) => {
    await page.getByLabel('Koşulları okudum ve kabul ediyorum').check();
    await page.getByRole('button', { name: 'Devam' }).click();
    await page.getByLabel('Kullanıcı adı').fill('deneme');
    await page.getByLabel('E-posta').click();
    await expect(page.getByText('Bu kullanıcı adı alınmış')).toBeVisible();
    await page.getByLabel('Kullanıcı adı').fill('yeni_uye_42');
    await page.getByLabel('E-posta').click();
    await expect(page.getByText('Bu kullanıcı adı alınmış')).toBeHidden();
    await page.getByLabel('E-posta').fill('uye@ornek.test');
    await page.getByLabel('Parola', { exact: true }).fill('Gizli-Parola-1');
    await page.getByLabel('Parola (tekrar)').fill('Gizli-Parola-1');
    await page.getByLabel('Doğum yılı').fill('1995');
    await page.getByRole('button', { name: 'Hesabı oluştur' }).click();
    await expect(page.getByText(/Hesabınız hazır/)).toBeVisible();
    await expect(page).toHaveURL(/\/uyelik\/hosgeldin\?no=\d+/);
  },
  '/rapor': async (page) => {
    await page.getByLabel('Rapor türü').selectOption('ayrintili');
    await page.getByLabel('Tarih aralığı').selectOption('ozel');
    await page.getByLabel(/Başlangıç/).fill('01.09.2026');
    await page.getByLabel(/Bitiş/).fill('30.09.2026');
    await page.getByRole('button', { name: 'Raporu oluştur' }).click();
    await expect(page.getByText('Sunucu hatası: rapor oluşturulamadı (500)')).toBeVisible({ timeout: 15_000 });
  },
  '/gider': async (page) => {
    await page.getByLabel('Sicil no').fill('S-1024');
    await page.getByLabel('Departman').selectOption('Satış');
    await page.getByRole('button', { name: '2 · Harcama kalemleri' }).click();
    await page.getByRole('button', { name: 'Satır ekle' }).click();
    await page.getByLabel('Tarih 1').fill('03.10.2026');
    await page.getByLabel('Açıklama 1').fill('Müşteri ziyareti');
    await page.getByLabel('Kategori 1').selectOption('Yol');
    await page.getByLabel('Tutar 1').fill('1250');
    await page.getByLabel('Onaylayan yönetici 1').fill('Deneme Yönetici');
    await page.getByRole('button', { name: '3 · Onay' }).click();
    await page.getByLabel(/Beyanın doğru/).check();
    await page.getByRole('button', { name: 'Devam' }).click();
    await page.getByText('Beyanı gönder').click();
    await expect(page.getByText(/Beyanınız iletildi\. Toplam: 1\.?250,00 TL/)).toBeVisible();
  }
};
