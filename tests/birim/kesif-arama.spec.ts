// KORUMA TESTLERİ — Keşif ve arama (v1.4): hızlı arama (Ctrl+K) servisleri, metotları, servis akışlarını, uçtan uca akışları,
// genel senaryoları ve eylemleri ("Yedek al", "Yedek yükle", "Playwright koduna dışa aktar", "Kurtarma kuralı ekle", "Rapor al")
// Türkçe büyük/küçük harf ve aksan duyarsız bulur; Playwright'a dışa aktarma aramadan senaryo seçilip açıklamalı onayla indirilir;
// Koşu > Gelişmiş > "Oturum kontrolü (sn)" ile giriş tarifindeki "Oturum kontrol adresi" birbirine bağlantı verir.
// Yalnız 127.0.0.1'deki geçici Nöbetçi; ortam adresi kullanılmayan yerel bir porttur (hiçbir koşu / istek başlatılmaz).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, ornekBasvuruPaketi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
const PAROLA = `Gecici-Kesif-${randomBytes(6).toString('hex')}`;

test.describe('Keşif ve arama', () => {
  test.describe.configure({ mode: 'serial' });
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let ortamId = '';
  let senaryoBasligi = '';

  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde?: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true);
    return y;
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kesif-arama-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Keşif Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam as Nesne).id);
    await basarili('/platform/giris-profili/kaydet', {
      projeId, ortamId, ad: 'TEST kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
    });
    await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() });
    for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [0], ortamIdleri: [ortamId] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as unknown as { senaryolar: Array<{ baslik: string }> };
    senaryoBasligi = liste.senaryolar[0].baslik;
    // Servis (REST; hiçbir istek atılmaz), metotları, senaryosu, servis akışı ve uçtan uca akış.
    const s = await basarili('/platform/servis/rest/kaydet', { projeId, anahtar: 'stok', ad: 'Stok Servisi', uclar: [
      { ad: 'fiyat-hesapla', metot: 'POST', yol: '/api/fiyat' }, { ad: 'durum', metot: 'GET', yol: '/api/durum' }] });
    const servisId = String(s.id ?? (s.servis as Nesne | undefined)?.id);
    const sn = await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Durum 200 döner',
      icerik: { operasyon: 'durum', govde: '', http: { metot: 'GET', yol: '/api/durum' }, kontroller: [{ tur: 'durumKodu', deger: '200' }] } });
    await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Fiyat zinciri', tur: 'akis', icerik: { adimlar: [
      { id: 'a1', ad: 'Fiyat', tur: 'operasyon', servisId, operasyon: 'fiyat-hesapla' }] } });
    await basarili('/platform/uctan-uca/kaydet', { projeId, baslik: 'Uçtan uca sipariş', icerik: { adimlar: [
      { id: 's1', ad: 'Durum', servisId, senaryoId: sn.id, okumalar: [] }] } });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  async function sayfaAc(genislik = 1440): Promise<{ page: Page; hatalar: string[]; istekler: string[]; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 }, acceptDownloads: true });
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/sonuclar');
    await expect(page.locator('#proje-rozeti')).toBeVisible();
    return { page, hatalar, istekler, kapat: () => baglam.close() };
  }
  const aramaAc = async (page: Page) => {
    const d = page.getByRole('dialog', { name: 'Hızlı arama' });
    // Sayfa geçişi sürerken açılan pencereyi yeni sayfanın çizimi kapatabilir (açık pencereler sayfa değişince kapanır): açık kalana dek.
    await expect(async () => {
      if (!(await d.isVisible())) await page.keyboard.press('Control+k');
      await expect(d.locator('.hizli-arama-durum')).toBeVisible({ timeout: 1_000 });
      await expect(d.locator('.hizli-arama-durum')).not.toHaveText('Yükleniyor…', { timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
    return d;
  };
  const ara = async (page: Page, metin: string) => {
    const d = page.getByRole('dialog', { name: 'Hızlı arama' });
    await d.getByRole('combobox', { name: 'Hızlı arama' }).fill(metin);
    return d.getByRole('listbox', { name: 'Sonuçlar' });
  };

  test('servis, metot, servis akışı, uçtan uca akış ve eylemler bulunur; Türkçe harf / aksan duyarsız', async () => {
    const { page, hatalar, istekler, kapat } = await sayfaAc();
    await aramaAc(page);
    // Boş aramada eylemler ve Ayarlar bölümleri (Kurtarma kuralları dahil).
    const bos = page.getByRole('listbox', { name: 'Sonuçlar' });
    for (const ad of ['Yedek al', 'Yedek yükle', 'Playwright koduna dışa aktar', 'Kurtarma kuralı ekle', 'Rapor al (PDF)', 'Kurtarma kuralları']) {
      await expect(bos.getByRole('option').filter({ hasText: ad }).first()).toBeVisible();
    }
    const beklenen: Array<[string, string]> = [
      ['STOK SERVISI', 'Stok Servisi'], ['stok servisi', 'Stok Servisi'], ['fiyat', 'fiyat-hesapla'], ['FİYAT ZİNCİRİ', 'Fiyat zinciri'],
      ['uctan uca siparis', 'Uçtan uca sipariş'], ["playwright'a aktar", 'Playwright koduna dışa aktar'], ['dışa aktar', 'Playwright koduna dışa aktar'],
      ['yedek al', 'Yedek al'], ['YEDEK YUKLE', 'Yedek yükle'], ['kurtarma', 'Kurtarma kuralı ekle'], ['rapor al', 'Rapor al (PDF)'], ['oturum kontrol', 'Oturum kontrolü (sn)']
    ];
    for (const [metin, ad] of beklenen) {
      const liste = await ara(page, metin);
      await expect(liste.getByRole('option').filter({ hasText: ad }).first(), metin).toBeVisible();
    }
    // Grup başlıkları: metot ve akışlar kendi gruplarında.
    await expect((await ara(page, 'fiyat')).getByText('Metotlar', { exact: true })).toBeVisible();
    await expect((await ara(page, 'zinciri')).getByText('Servis akışları', { exact: true })).toBeVisible();
    await expect((await ara(page, 'sipariş')).getByText('Uçtan uca akışlar', { exact: true })).toBeVisible();
    // Metot → servis sözleşmesi; servis akışı → akış tasarımı.
    await ara(page, 'fiyat hesapla');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/servisler\/s\/[^/]+\/sozlesme\/fiyat-hesapla$/);
    await aramaAc(page);
    await ara(page, 'fiyat zinciri');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/servisler\/s\/[^/]+\/akislar\/[^/]+$/);
    expect(hatalar).toEqual([]);
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    await kapat();
  });

  test('eylemler: Yedek al / Yedek yükle ilgili karta, Kurtarma kuralı ekle pencereye, Rapor al PDF penceresine götürür', async () => {
    const { page, hatalar, kapat } = await sayfaAc();
    await aramaAc(page);
    await ara(page, 'yedek al');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/ayarlar\/yedekleme\/disa$/);
    await expect(page.getByRole('textbox', { name: /Kasa parolası/ })).toBeFocused();
    await aramaAc(page);
    await ara(page, 'yedek yükle');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/ayarlar\/yedekleme\/ice$/);
    await expect(page.getByRole('button', { name: 'Yedek dosyası seç…' })).toBeFocused();
    await aramaAc(page);
    await ara(page, 'kurtarma kuralı ekle');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Yeni kurtarma kuralı' })).toBeVisible();
    await page.keyboard.press('Escape');
    await aramaAc(page);
    await ara(page, 'rapor al');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Rapor al (PDF)' })).toBeVisible();
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('Playwright koduna dışa aktar: aramadan senaryo seçilir, açıklamalı onayla indirilir; Vazgeç indirmez (masaüstü + 390 px)', async () => {
    for (const genislik of [1440, 390]) {
      const { page, hatalar, istekler, kapat } = await sayfaAc(genislik);
      await aramaAc(page);
      await ara(page, "playwright'a aktar");
      await page.keyboard.press('Enter');
      const d = page.getByRole('dialog', { name: 'Hızlı arama' });
      await expect(d.locator('.hizli-arama-alt-baslik')).toContainText('Dışa aktarılacak senaryoyu seçin');
      const secenek = d.getByRole('option').filter({ hasText: senaryoBasligi });
      await expect(secenek).toBeVisible();
      await expect(secenek).toContainText('TEST');
      // Geri (boş kutuda Backspace) ana listeye döner.
      await page.keyboard.press('Backspace');
      await expect(d.locator('.hizli-arama-alt-baslik')).toBeHidden();
      await ara(page, 'dışa aktar');
      await page.keyboard.press('Enter');
      await d.getByRole('option').filter({ hasText: senaryoBasligi }).click();
      const onay = page.getByRole('dialog', { name: `Playwright koduna dışa aktar: ${senaryoBasligi}` });
      await expect(onay).toBeVisible();
      await expect(onay).toContainText('gizli değerler dosyaya yazılmaz');
      if (genislik === 390) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await onay.getByRole('button', { name: 'Vazgeç' }).click();
        await expect(onay).toBeHidden();
      } else {
        const [indirme] = await Promise.all([page.waitForEvent('download'), onay.getByRole('button', { name: /TEST için indir/ }).click()]);
        expect(indirme.suggestedFilename()).toMatch(/\.spec\.ts$/);
        const metin = readFileSync(await indirme.path(), 'utf8');
        expect(metin).toContain("from '@playwright/test'");
        for (const gizli of [ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI]) expect(metin).not.toContain(gizli);
      }
      expect(hatalar).toEqual([]);
      expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
      await kapat();
    }
  });

  test('Oturum kontrolü (sn) ↔ Oturum kontrol adresi: iki yerde bir cümle ve birbirine bağlantı', async () => {
    const { page, hatalar, kapat } = await sayfaAc();
    await page.goto('/#/ayarlar/kosu/oturumKontrolSn');
    const alan = page.locator('[data-ayar="oturumKontrolSn"]');
    await expect(alan).toBeVisible();
    await expect(page.getByLabel('Oturum kontrolü (sn)', { exact: true })).toBeFocused();
    const baglanti = alan.getByRole('link', { name: /Oturum kontrol adresi/ });
    await expect(baglanti).toBeVisible();
    await baglanti.click();
    await expect(page).toHaveURL(/#\/ayarlar\/giris$/);
    // Giriş tarifi formu: yardım metni Koşu ayarını anlatır ve oraya götürür.
    await page.goto(`/#/ayarlar/giris/tarif/${encodeURIComponent(ortamId)}`);
    const yardim = page.locator('form.tarif-formu').getByRole('link', { name: 'Koşu › Gelişmiş › Oturum kontrolü (sn)' });
    await expect(yardim).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('form.tarif-formu')).toContainText('adres yanlışsa her test bu süre kadar bekler');
    await yardim.click();
    await expect(page).toHaveURL(/#\/ayarlar\/kosu\/oturumKontrolSn$/);
    await expect(page.getByLabel('Oturum kontrolü (sn)', { exact: true })).toBeFocused();
    expect(hatalar).toEqual([]);
    await kapat();
  });
});
