// KORUMA TESTLERİ — Ayarlar > Koşu: kullanıcının koşu kararları (video / ekran görüntüsü / iz, yeniden deneme, süre limiti,
// bekleme süreleri, servis zaman aşımı, varsayılan tarih biçimi) kasada saklanır, doğrulanır, alt sürece ortam değişkeni
// olarak geçer; Playwright yapılandırması ve servis koşusu bunları kullanır. Arayüzde formdan kaydedilir.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { eskiSonuclariSil, kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { kosuAyarlariniKaydet, kosuAyarlariniOku, kosuOrtamDegiskenleri, varsayilanKosuAyarlari } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { yerTutuculariDoldur } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { KATEGORI, kategoriBul } from '../../scripts/platform/sonuclar/siniflandirma.mjs';
import { siniflandirmaKurallariniKaydet } from '../../scripts/platform/ayarlar/siniflandirma-kurallari.mjs';
import { ekranGoruntusuAyari, izAyari, sureAyari, videoAyari, yenidenDenemeAyari } from '../support/kosu-ayarlari';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('varsayılanlar, doğrulama, kasada saklama ve alt sürece giden ortam değişkenleri', async () => {
  const klasor = geciciKlasor('kosu-ayarlari');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Kosu-Ayari-1', { kdf: HIZLI_KDF });
    expect(kosuAyarlariniOku(vt)).toEqual(varsayilanKosuAyarlari());
    expect(varsayilanKosuAyarlari()).toMatchObject({ video: 'her', ekranGoruntusu: 'yalnizHata', iz: 'yalnizHata', yenidenDeneme: 0, kosuSureLimitiDk: 10,
      alanBeklemeSn: 15, zorlaIsaretlemeSn: 15, servisZamanAsimiSn: 60, tarihBicimi: "yyyy-MM-dd'T'HH:mm:ss" });
    expect(() => kosuAyarlariniKaydet(vt, { yenidenDeneme: 9 })).toThrow('0–3');
    expect(() => kosuAyarlariniKaydet(vt, { video: 'bazen' })).toThrow('geçersiz seçim');
    expect(() => kosuAyarlariniKaydet(vt, { tarihBicimi: 'abc' })).toThrow('geçersiz');
    // Tarama / akış kaydı süreleri ve liste sayfa boyları da kullanıcı kararıdır.
    expect(varsayilanKosuAyarlari()).toMatchObject({ taramaZamanAsimiDk: 5, kayitZamanAsimiDk: 30, senaryoSayfaBoyu: 50, kosuGecmisiSayfaBoyu: 15 });
    expect(() => kosuAyarlariniKaydet(vt, { taramaZamanAsimiDk: 0 })).toThrow('1–60');
    expect(() => kosuAyarlariniKaydet(vt, { senaryoSayfaBoyu: 5 })).toThrow('10–500');
    expect(kosuAyarlariniKaydet(vt, { kayitZamanAsimiDk: 45, kosuGecmisiSayfaBoyu: 30 })).toMatchObject({ kayitZamanAsimiDk: 45, kosuGecmisiSayfaBoyu: 30 });
    const a = kosuAyarlariniKaydet(vt, { video: 'kapali', iz: 'her', yenidenDeneme: 2, alanBeklemeSn: 40, tarihBicimi: 'dd.MM.yyyy' });
    expect(a).toMatchObject({ video: 'kapali', iz: 'her', yenidenDeneme: 2, alanBeklemeSn: 40, zorlaIsaretlemeSn: 15, tarihBicimi: 'dd.MM.yyyy' });
    // Verilmeyen ayar korunur.
    expect(kosuAyarlariniKaydet(vt, { zorlaIsaretlemeSn: 5 })).toMatchObject({ video: 'kapali', zorlaIsaretlemeSn: 5 });
    // Diskte şifreli.
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'kosu'")?.deger_json)).toMatch(/^kasa:v1:/);
    // Gelişmiş koşu davranışı ayarları da (varsayılanlarıyla) geçer: gelismis-kosu-ayarlari.spec.ts.
    expect(kosuOrtamDegiskenleri(kosuAyarlariniOku(vt))).toMatchObject({
      NOBETCI_VIDEO: 'kapali', NOBETCI_EKRAN_GORUNTUSU: 'yalnizHata', NOBETCI_IZ: 'her', NOBETCI_YENIDEN_DENEME: '2', NOBETCI_ALAN_BEKLEME_MS: '40000', NOBETCI_ZORLA_BEKLEME_MS: '5000',
      NOBETCI_KOSU_SURE_LIMITI_MS: '600000'
    });
    // Servis: biçimsiz tarih ifadesi kullanıcının biçimini kullanır.
    expect(yerTutuculariDoldur('${tarih:bugun}', { degerler: {}, simdi: new Date(2026, 8, 27), varsayilanTarihBicimi: 'dd.MM.yyyy' })).toBe('27.09.2026');
    expect(yerTutuculariDoldur('${tarih:bugun}', { degerler: {}, simdi: new Date(2026, 8, 27, 1, 2, 3) })).toBe('2026-09-27T01:02:03');
  } finally { vt.kapat(); klasor.temizle(); }
});

test('Playwright yapılandırması ortam değişkenlerinden okur; yoksa önceki varsayılanlar', () => {
  const onceki = { ...process.env };
  try {
    for (const k of ['NOBETCI_VIDEO', 'NOBETCI_EKRAN_GORUNTUSU', 'NOBETCI_IZ', 'NOBETCI_YENIDEN_DENEME', 'TEST_SUNUCU_GORUNUR', 'CI', 'NOBETCI_ALAN_BEKLEME_MS']) delete process.env[k];
    expect([videoAyari(), ekranGoruntusuAyari(), izAyari(), yenidenDenemeAyari(), sureAyari('NOBETCI_ALAN_BEKLEME_MS', 15_000)]).toEqual(['retain-on-failure', 'only-on-failure', 'retain-on-failure', 0, 15_000]);
    process.env.TEST_SUNUCU_GORUNUR = '1';
    expect(videoAyari()).toBe('on');
    Object.assign(process.env, { NOBETCI_VIDEO: 'kapali', NOBETCI_EKRAN_GORUNTUSU: 'her', NOBETCI_IZ: 'kapali', NOBETCI_YENIDEN_DENEME: '2', NOBETCI_ALAN_BEKLEME_MS: '40000' });
    expect([videoAyari(), ekranGoruntusuAyari(), izAyari(), yenidenDenemeAyari(), sureAyari('NOBETCI_ALAN_BEKLEME_MS', 15_000)]).toEqual(['off', 'on', 'off', 2, 40_000]);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in onceki)) delete process.env[k];
    Object.assign(process.env, onceki);
  }
});

test.describe('Ayarlar > Koşu arayüzü', () => {
  const PAROLA = `Gecici-KosuUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosu-ayar-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Koşu Ayarı Projesi' });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('menüde "Koşu"; form varsayılanlarla gelir, geçersiz değer reddedilir, kaydedilince kasaya yazılır', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/proje');
    await page.getByRole('link', { name: 'Koşu' }).click();
    const form = page.getByRole('form', { name: 'Koşu ayarları' });
    // Kayıt ve servis ayarları "Gelişmiş" altında (sayfada profiller + yeniden deneme / süre limiti).
    await form.locator('details.gelismis-ayarlar > summary').click();
    await expect(form.getByLabel('Video', { exact: true })).toHaveValue('her');
    await expect(form.getByLabel('Koşu süre limiti (dk)')).toHaveValue('10');
    await form.getByLabel('Yeniden deneme').fill('7');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('0 ile 3 arasında bir tam sayı girin.')).toBeVisible();
    await form.getByLabel('Yeniden deneme').fill('1');
    await form.getByLabel('Video', { exact: true }).selectOption('yalnizHata');
    await form.getByLabel('Servis isteği zaman aşımı (sn)').fill('90');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    const y = await nobetciApi(nobetci, '/platform/kosu-ayarlari') as { ayarlar: Record<string, unknown> };
    expect(y.ayarlar).toMatchObject({ yenidenDeneme: 1, video: 'yalnizHata', servisZamanAsimiSn: 90 });
    // Hata sınıflandırma kuralları kartı.
    const kurallar = page.getByRole('form', { name: 'Hata sınıflandırma kuralları' });
    await kurallar.getByRole('button', { name: 'Kural ekle' }).click();
    await kurallar.getByLabel('1. kural: hata mesajında geçen metin').fill('beklenmeyen bir hata');
    await kurallar.getByLabel('1. kural: kategori').selectOption({ index: 0 });
    await kurallar.getByRole('button', { name: 'Kaydet' }).click();
    await expect(kurallar.getByText('1 kural kaydedildi.')).toBeVisible();
    // Yedekleme > Geçmiş sonuçları sil: önce sayım, silinecek yoksa silme düğmesi kapalı kalır.
    await page.goto('/#/ayarlar/yedekleme');
    const temizle = page.getByRole('group', { name: 'Geçmiş sonuçları sil' });
    await temizle.getByRole('button', { name: 'Neler silinecek?' }).click();
    await expect(temizle.getByText('Silinecek sonuç yok.')).toBeVisible();
    await expect(temizle.getByRole('button', { name: 'Kalıcı olarak sil' })).toBeDisabled();
    expect(((await nobetciApi(nobetci, '/platform/sonuclar/temizle', { gun: 0 })) as { mesaj?: string }).mesaj).toContain('1–3650');
    expect(await nobetciApi(nobetci, '/platform/sonuclar/temizle', { tumu: true, onay: true })).toMatchObject({ silinen: { kosu: 0, sonuc: 0 } });
    const red = await nobetciApi(nobetci, '/platform/kosu-ayarlari/kaydet', { ayarlar: { kosuSureLimitiDk: 0 } }) as { mesaj?: string };
    expect(String(red.mesaj)).toContain('1–120');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('Gelişmiş koşu davranışı (açılır), zamanlanmış koşu davranışı, rapor sınırı ve sağlık noktası; masaüstü ve 390 px taşmasız', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const tasma = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto('/#/ayarlar/kosu');
    const form = page.getByRole('form', { name: 'Koşu ayarları' });
    // Gelişmiş bölüm kapalı gelir; açılınca varsayılanlar bugünkü davranış.
    const gelismis = form.locator('details.gelismis-ayarlar');
    await expect(gelismis).not.toHaveAttribute('open', '');
    await gelismis.locator('summary').click();
    await expect(form.getByLabel('Alan görünmezse')).toHaveValue('atla');
    await expect(form.getByLabel('Tarayıcı onay pencereleri')).toHaveValue('iptal');
    await expect(form.getByLabel('Alanın görünmesi için bekleme (sn)')).toHaveValue('2');
    await expect(form.getByLabel('Tablodan satır seçimi')).toHaveValue('ilk');
    await expect(form.getByLabel('Koşu ekran genişliği (px)')).toHaveValue('1280');
    await expect(form.getByLabel('Açılır liste keşif sınırı (seçenek)')).toHaveValue('8');
    await form.getByLabel('Tarayıcı onay pencereleri').selectOption('onayla');
    await form.getByLabel('Alanın görünmesi için bekleme (sn)').fill('90');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('1 ile 60 arasında bir tam sayı girin.')).toBeVisible();
    await form.getByLabel('Alanın görünmesi için bekleme (sn)').fill('4');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    // Zamanlanmış koşu davranışı: Zamanlanmış koşular kartının içinde.
    const zamanli = page.getByRole('form', { name: 'Zamanlanmış koşu davranışı' });
    await expect(page.locator('.zamanlanmis-kosular').getByRole('form', { name: 'Zamanlanmış koşu davranışı' })).toBeVisible();
    // Tek başlık (dış h4; iç fieldset legend'i yok), çerçevesiz gömülü form; Kaydet kartın içinde; alt bölüm ayrı çizgiyle başlar.
    await expect(page.locator('.zamanlama-davranisi').getByText('Zamanlanmış koşu davranışı', { exact: true })).toHaveCount(1);
    await expect(zamanli.locator('legend')).toHaveCount(0);
    await expect(zamanli).not.toHaveClass(/form-paneli/);
    const kartKutusu = await page.locator('.zamanlanmis-kosular').boundingBox();
    const kaydetKutusu = await zamanli.getByRole('button', { name: 'Kaydet' }).boundingBox();
    expect(kartKutusu && kaydetKutusu && kaydetKutusu.x >= kartKutusu.x && kaydetKutusu.x + kaydetKutusu.width <= kartKutusu.x + kartKutusu.width).toBe(true);
    const tercihUst = await page.locator('.zamanlama-tercihleri').evaluate((e) => parseFloat(getComputedStyle(e).paddingTop) + parseFloat(getComputedStyle(e).marginTop));
    expect(tercihUst).toBeGreaterThanOrEqual(16);
    await expect(zamanli.getByLabel('Kaçan zaman')).toHaveValue('atla');
    await zamanli.getByLabel('Kaçan zaman').selectOption('sonraKos');
    await zamanli.getByLabel('Koşu sürerken gelen zaman').selectOption('bitinceKos');
    await zamanli.getByRole('button', { name: 'Kaydet' }).click();
    await expect(zamanli.getByText('Zamanlanmış koşu davranışı kaydedildi.')).toBeVisible();
    const y = await nobetciApi(nobetci, '/platform/kosu-ayarlari') as { ayarlar: Record<string, unknown> };
    expect(y.ayarlar).toMatchObject({ onayPenceresi: 'onayla', gorunmeyenAlanBeklemeSn: 4, zamanliKacan: 'sonraKos', zamanliCakisma: 'bitinceKos', gorunmeyenAlan: 'atla' });
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('kosu-gelismis-masaustu.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('kosu-gelismis-390.png'), fullPage: true });

    // Ayarlar > Arayüz: rapor görüntü sınırı ve sağlık noktası (proje başına).
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/#/ayarlar/arayuz');
    const arayuz = page.getByRole('form', { name: 'Arayüz ayarları' });
    await expect(arayuz.getByLabel('HTML rapora gömülen görüntü sınırı (MB)')).toHaveValue('25');
    const saglik = page.getByRole('form', { name: 'Sağlık noktası' });
    await expect(saglik.getByLabel('Yeşil: başarı oranı en az (%)')).toHaveValue('90');
    await expect(saglik.getByLabel('Sarı: başarı oranı en az (%)')).toHaveValue('75');
    await saglik.getByLabel('Sarı: başarı oranı en az (%)').fill('95');
    await saglik.getByRole('button', { name: 'Kaydet' }).click();
    await expect(saglik.getByText('1 ile 89 arasında bir tam sayı girin.')).toBeVisible();
    await saglik.getByLabel('Yeşil: başarı oranı en az (%)').fill('80');
    await saglik.getByLabel('Sarı: başarı oranı en az (%)').fill('60');
    await saglik.getByRole('button', { name: 'Kaydet' }).click();
    await expect(saglik.getByText('Sağlık noktası eşikleri kaydedildi.')).toBeVisible();
    const { projeler } = await nobetciApi(nobetci, '/platform/projeler') as { projeler: Array<{ id: string }> };
    expect(await nobetciApi(nobetci, `/platform/saglik-esikleri?projeId=${projeler[0].id}`)).toMatchObject({ esikler: { yesil: 80, sari: 60 } });
    // Sonuçlar ekranındaki not eşikleri gösterir.
    await page.goto('/#/sonuclar');
    await expect(page.locator('.yan-not')).toContainText('yeşil ≥ %80, sarı ≥ %60');
    await page.goto('/#/ayarlar/arayuz');
    await expect(saglik).toBeVisible();
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('arayuz-masaustu.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('arayuz-390.png'), fullPage: true });
    for (const ad of ['kosu-gelismis-masaustu', 'kosu-gelismis-390', 'arayuz-masaustu', 'arayuz-390']) {
      await testInfo.attach(ad, { path: testInfo.outputPath(`${ad}.png`), contentType: 'image/png' });
    }
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});

test('sonuç saklama: süresiz varsayılan hiçbir şey silmez; süre verilince eski koşular (sonuç, adım, medya satırı) ve servis koşuları silinir', async () => {
  const klasor = geciciKlasor('sonuc-saklama');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Saklama-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Saklama' });
    const gunOnce = (g: number) => new Date(Date.now() - g * 86_400_000).toISOString();
    for (const [id, g] of [['eski', 40], ['yeni', 2]] as const) {
      kosuKaydet(vt, { id, projeId, tur: 'tekil', baslangic: gunOnce(g) });
      sonucKaydet(vt, { kosuId: id, projeId, senaryoBaslik: id, durum: 'basarili', testKimligi: id, bitis: gunOnce(g), adimlar: [{ ad: 'a', durum: 'basarili', sureMs: 1 }] });
      kosuyuBitir(vt, id, { durum: 'tamamlandi', bitis: gunOnce(g) });
    }
    expect(eskiSonuclariSil(vt, 0)).toEqual({ kosu: 0, sonuc: 0, servisKosusu: 0, akisKosusu: 0, medyaDosyalari: [] });
    expect(varsayilanKosuAyarlari().sonucSaklamaGun).toBe(0);
    expect(eskiSonuclariSil(vt, 30)).toMatchObject({ kosu: 1, sonuc: 1 });
    expect(vt.tumu('SELECT id FROM kosular').map((r) => r.id)).toEqual(['yeni']);
    expect(Number(vt.tek('SELECT COUNT(*) AS n FROM adim_sonuclari')?.n)).toBe(1);
    expect(kosuAyarlariniKaydet(vt, { sonucSaklamaGun: 90, otomatikYedekSayisi: 7 })).toMatchObject({ sonucSaklamaGun: 90, otomatikYedekSayisi: 7 });
    expect(() => kosuAyarlariniKaydet(vt, { otomatikYedekSayisi: 0 })).toThrow('1–365');
    // Tümü: gün yok sayılır, kalan yeni koşu da silinir.
    expect(eskiSonuclariSil(vt, 0, { tumu: true })).toMatchObject({ kosu: 1, sonuc: 1 });
    expect(vt.tumu('SELECT id FROM kosular')).toEqual([]);
  } finally { vt.kapat(); klasor.temizle(); }
});

test('hata sınıflandırma kuralları: kullanıcı kuralı genel kurallardan önce; kayıtta kategori kurala göre; doğrulama', async () => {
  expect(kategoriBul('Error: expect(locator).toBeVisible() failed\nUygulama: Beklenmeyen Bir Hata oluştu')).toBe(KATEGORI.dogrulama);
  expect(kategoriBul('Error: expect(locator).toBeVisible() failed\nUygulama: Beklenmeyen Bir Hata oluştu', [{ icerir: 'beklenmeyen bir hata', kategori: KATEGORI.popup }])).toBe(KATEGORI.popup);
  const klasor = geciciKlasor('siniflandirma');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Sinif-1', { kdf: HIZLI_KDF });
    expect(() => siniflandirmaKurallariniKaydet(vt, [{ icerir: 'ab', kategori: KATEGORI.popup }])).toThrow('3–200');
    expect(() => siniflandirmaKurallariniKaydet(vt, [{ icerir: 'uygun metin', kategori: 'Uydurma' }])).toThrow('kategori geçersiz');
    siniflandirmaKurallariniKaydet(vt, [{ icerir: 'Beklenmeyen bir hata', kategori: KATEGORI.popup }]);
    const projeId = projeKaydet(vt, { ad: 'Sınıflandırma' });
    kosuKaydet(vt, { id: 'k1', projeId, tur: 'tekil' });
    sonucKaydet(vt, { kosuId: 'k1', projeId, senaryoBaslik: 'S', durum: 'basarisiz', testKimligi: 't1', hataMesaji: 'Hesapla: beklenmeyen bir hata penceresi açıldı' });
    expect(vt.tek('SELECT hata_kategorisi FROM kosu_sonuclari')?.hata_kategorisi).toBe(KATEGORI.popup);
  } finally { vt.kapat(); klasor.temizle(); }
});
