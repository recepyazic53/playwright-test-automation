// KORUMA TESTİ (arayüz) — senaryonun "Akış diyagramı" sekmesinden SENARYO düzeyinde düzenleme (aşama 3b): kutuya tıklayınca
// formun kendi bileşenleri kutunun altındaki düzenleme alanında açılır (tek taslak: form ↔ diyagram eşzamanlı), isteğe bağlı
// adımın "Bu senaryoda dahil" anahtarı, "Burada hata beklenir" ile beklenen sonuç, giriş seçimi, kutuda doğrulama rozeti,
// kaydedilen içerik ve dar ekranda dikey düzen. Akış yapısı değişmez.
// Güvenlik: ayrı Nöbetçi + geçici veritabanı; örnek modelin sayfa paketi; senaryo KOŞULMAZ (ortam adresine istek gitmez).
// DIYAGRAM_EKRAN_KLASORU verilirse ekran görüntüleri oraya yazılır (tasarım incelemesi; üründe yok).
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { ornekBasvuruPaketi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;
const EKRAN_KLASORU = process.env.DIYAGRAM_EKRAN_KLASORU;
async function goruntu(page: Page, ad: string): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  await page.screenshot({ path: join(EKRAN_KLASORU, ad), fullPage: true });
}
const PAROLA = `Gecici-Diyagram-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortamId = '';
let senaryoId = '';

async function basarili(yol: string, govde?: Nesne): Promise<Nesne> {
  const y = await nobetciApi(nobetci, yol, govde) as Nesne;
  expect(y.basarili ?? true, `${yol}: ${y.mesaj ?? ''}`).not.toBe(false);
  return y;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'senaryo-diyagrami-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Diyagram Projesi' })).proje.id);
  // Adres hiç çağrılmaz (senaryo koşulmaz); yine de yalnızca yerel, kapalı bir port.
  ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
  // Öneri 4: "Yetkili / onay adımı hariç" (isteğe bağlı onay adımı kapalı, beklenen sonuç başarı).
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [4], ortamIdleri: [ortamId] });
  const liste = await basarili(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Array<{ id: string }> };
  senaryoId = liste.senaryolar[0].id;
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function sayfaAc(genislik: number, yukseklik: number): Promise<{ page: Page; hatalar: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(senaryoId)}`);
  await page.getByRole('tab', { name: 'Akış diyagramı' }).click();
  return { page, hatalar };
}

test('diyagramdan düzenleme: form ile aynı taslak, dahil anahtarı, beklenen hata, giriş, doğrulama rozeti ve kayıt', async () => {
  test.setTimeout(90_000);
  const { page, hatalar } = await sayfaAc(1440, 1400);
  const d = page.locator('.akis-diyagrami');
  const dugum = (baslik: string) => d.locator('.diyagram-dugumu').filter({ has: page.getByRole('heading', { name: baslik, exact: true }) });
  const panel = d.locator('.diyagram-paneli');
  const bilgiler = dugum('Başvuru bilgileri girilir');

  // Başlangıç: değerler kutuda okunur; isteğe bağlı onay adımı soluk ve nedeni yazılı; düzenleme alanı kapalı.
  await expect(bilgiler.locator('.diyagram-alani', { hasText: 'Ad Soyad' })).toContainText('Deneme Kişi');
  await expect(bilgiler.locator('.diyagram-alani', { hasText: 'Ürün' })).toContainText('Temel');
  await expect(dugum('Başvuru onaylanır')).toHaveClass(/disarida/);
  await expect(dugum('Başvuru onaylanır')).toContainText('“Onay adımını dahil et” bu senaryoda işaretli değil.');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('link', { name: 'Akışı düzenle' })).toHaveAttribute('href', /#\/ekranlar\/e\/.+\/akis/);

  // Kutuya tıklayınca düzenleme alanı açılır; odak alanın başlığında; alanlar formun kendi bileşenleri.
  await bilgiler.getByRole('heading', { name: 'Başvuru bilgileri girilir' }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: '1. Başvuru bilgileri girilir' })).toBeFocused();
  await expect(bilgiler.getByRole('button', { name: /düzenleme alanını kapat/ })).toHaveAttribute('aria-expanded', 'true');
  const panelBoyu = await panel.boundingBox();
  const kutuBoyu = await bilgiler.boundingBox();
  expect(panelBoyu!.y).toBeGreaterThan(kutuBoyu!.y);   // kutunun hemen altında
  await panel.getByLabel('Ad Soyad').fill('Diyagram Kişi');
  await expect(bilgiler.locator('.diyagram-alani', { hasText: 'Ad Soyad' })).toContainText('Diyagram Kişi');
  await expect(panel.getByLabel('Ad Soyad')).toBeFocused();   // yeniden çizimde odak/yazım korunur

  // Form ↔ diyagram: formda aynı değer; formda değişen diyagramda görünür.
  await page.getByRole('tab', { name: 'Form' }).click();
  await expect(page.getByLabel('Ad Soyad')).toHaveValue('Diyagram Kişi');
  await page.getByLabel('Ad Soyad').fill('Form Kişi');
  await page.getByRole('tab', { name: 'Akış diyagramı' }).click();
  await expect(panel).toBeVisible();                               // seçim korunur
  await expect(panel.getByLabel('Ad Soyad')).toHaveValue('Form Kişi');
  await expect(bilgiler.locator('.diyagram-alani', { hasText: 'Ad Soyad' })).toContainText('Form Kişi');

  // Doğrulama: zorunlu alan boşalınca hem alanın altında hem kutuda kırmızı rozet.
  await panel.getByLabel('Ad Soyad').fill('');
  await panel.getByLabel('Ad Soyad').blur();
  await expect(bilgiler.locator('.dugum-hata-rozeti')).toContainText('1 hata');
  await expect(bilgiler).toHaveClass(/dogrulama-hatali/);
  await goruntu(page, '01-genis-panel-hata.png');
  await expect(panel.locator('.alan-hatasi').filter({ hasText: /\S/ }).first()).toBeVisible();
  await panel.getByLabel('Ad Soyad').fill('Form Kişi');
  await expect(bilgiler.locator('.dugum-hata-rozeti')).toHaveCount(0);

  // Escape kapatır; odak kutunun "Düzenle" düğmesine döner.
  await panel.getByLabel('Ad Soyad').press('Escape');
  await expect(panel).toBeHidden();
  await expect(bilgiler.getByRole('button', { name: '1. Başvuru bilgileri girilir: senaryoda düzenle' })).toBeFocused();

  // İsteğe bağlı adım: kutudaki anahtar formdaki "dahil" seçimiyle aynı değeri yazar.
  const dahil = page.getByRole('switch', { name: 'Başvuru onaylanır: bu senaryoda dahil' });
  await expect(dahil).not.toBeChecked();
  await dahil.check();
  await expect(dugum('Başvuru onaylanır')).not.toHaveClass(/disarida/);
  await expect(dahil).toBeFocused();
  await page.getByRole('tab', { name: 'Form' }).click();
  await expect(page.getByRole('switch', { name: 'Onay adımını dahil et' })).toBeChecked();
  await page.getByRole('tab', { name: 'Akış diyagramı' }).click();

  // "Burada hata beklenir" (klavyeyle açılan kutudan): beklenen sonuç alanı açılır, adım seçili, mesaj yazılır.
  const prim = dugum('Prim hesaplanır');
  await prim.getByRole('button', { name: '2. Prim hesaplanır: senaryoda düzenle' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('heading', { name: '2. Prim hesaplanır' })).toBeFocused();
  await panel.getByRole('button', { name: 'Burada hata beklenir' }).click();
  await expect(panel.getByRole('heading', { name: 'Beklenen sonuç' })).toBeVisible();
  await expect(panel.getByRole('radio', { name: 'İş kuralı hatası beklenir' })).toBeChecked();
  await expect(panel.getByLabel('Hatanın Beklendiği Adım')).toHaveValue('hesaplama');
  await expect(panel.getByLabel('Beklenen Mesaj')).toBeFocused();
  const bitis = d.locator('.diyagram-dugumu.bitis');
  await expect(bitis.locator('.dugum-hata-rozeti')).toContainText('1 hata');   // mesaj zorunlu
  await panel.getByLabel('Beklenen Mesaj').fill('Taksitli ödeme seçilemez');
  await expect(bitis.getByRole('heading', { name: 'Beklenen sonuç: hata' })).toBeVisible();
  await expect(bitis).toContainText('İş kuralı hatası beklenir: “Taksitli ödeme seçilemez”');
  await expect(bitis.locator('.dugum-hata-rozeti')).toHaveCount(0);
  await goruntu(page, '02-genis-beklenen-sonuc.png');
  await expect(prim).toContainText('hata beklenir');
  await expect(dugum('Başvuru onaylanır')).toHaveClass(/disarida/);
  await expect(dugum('Başvuru onaylanır')).toContainText('Beklenen hata daha önceki bir adımda');
  // Form da aynı beklenen sonucu gösterir.
  await page.getByRole('tab', { name: 'Form' }).click();
  await expect(page.getByLabel('Beklenen Mesaj')).toHaveValue('Taksitli ödeme seçilemez');
  await page.getByRole('tab', { name: 'Akış diyagramı' }).click();

  // Giriş seçimi: başlangıç kutusundan.
  await dugum('Giriş (ortam tarifi)').getByRole('button', { name: /senaryoda düzenle/ }).click();
  await expect(panel.getByRole('heading', { name: 'Giriş ve senaryo ayarları' })).toBeFocused();
  await panel.getByLabel('Giriş', { exact: true }).selectOption('girissiz');
  await expect(dugum('Girişsiz')).toContainText('Girişsiz: ekran açılır (senaryo girişsiz)');

  // Kaydet (hatalı): diyagram açıkken hatalı kutunun alanı açılır ve hatalı alana gidilir.
  await dugum('Başvuru bilgileri girilir').getByRole('button', { name: /senaryoda düzenle/ }).click();
  await panel.getByLabel('Ad Soyad').fill('');
  await panel.getByRole('button', { name: 'Kapat' }).click();
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect(panel.getByLabel('Ad Soyad')).toBeFocused();
  await panel.getByLabel('Ad Soyad').fill('Diyagram Kişi');

  // Kaydet: içerikte değerler, dahil seçimi, beklenen sonuç ve giriş.
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect(page).not.toHaveURL(/duzenle/);
  const { senaryo } = await basarili(`/platform/senaryo?id=${encodeURIComponent(senaryoId)}&ortamId=${encodeURIComponent(ortamId)}`);
  expect(senaryo.veri).toMatchObject({
    adSoyad: 'Diyagram Kişi', onayAdimiDahil: true,
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'hesaplama', mesaj: 'Taksitli ödeme seçilemez' }
  });
  expect(senaryo.giris).toEqual({ kip: 'girissiz', profil: null });
  expect(hatalar).toEqual([]);
});

test('dar ekran: diyagram ve düzenleme alanı dikey, yatay taşma yok; kaydedilen senaryo diyagramda doğru okunur', async () => {
  const { page, hatalar } = await sayfaAc(390, 900);
  const d = page.locator('.akis-diyagrami');
  const dugum = (baslik: string) => d.locator('.diyagram-dugumu').filter({ has: page.getByRole('heading', { name: baslik, exact: true }) });
  await expect(dugum('Girişsiz')).toBeVisible();
  await expect(dugum('Prim hesaplanır')).toContainText('hata beklenir');
  await expect(page.getByRole('switch', { name: 'Başvuru onaylanır: bu senaryoda dahil' })).toBeChecked();
  const bilgiler = dugum('Başvuru bilgileri girilir');
  await bilgiler.getByRole('button', { name: /senaryoda düzenle/ }).click();
  const panel = d.locator('.diyagram-paneli');
  await expect(panel.getByLabel('Ad Soyad')).toHaveValue('Diyagram Kişi');
  const [p, k] = [await panel.boundingBox(), await bilgiler.boundingBox()];
  expect(p!.y).toBeGreaterThanOrEqual(k!.y + k!.height);
  expect(p!.x + p!.width).toBeLessThanOrEqual(390);
  await goruntu(page, '03-dar-panel.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(hatalar).toEqual([]);
});
