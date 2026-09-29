// DOSYA SEÇİMİ SIFIRLANIR — Paket yükle (ve diğer dosya seçme girişleri) her seçimden sonra girdiyi sıfırlar (value = ''):
// aynı adlı (düzeltilmiş) dosya yeniden seçilince tarayıcı "change" olayını yeniden verir, dosya yeniden okunur ve eski hatalar
// ekranda kalmaz. Girdinin yanında son seçilen dosyanın adı ve saati görünür. Geçici veritabanı + ayrı Nöbetçi örneği
// (TEST_SUNUCU_KOSU_KAPALI=1); tüm istekler 127.0.0.1'dedir.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { ornekBasvuruModeli } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

let tarayici: Browser;
let nobetci: Nobetci;
let klasor: ReturnType<typeof geciciKlasor>;
let projeId = '';
let ekranId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = geciciKlasor('dosya-secimi');
  const vtYolu = join(klasor.yol, 'platform.db');
  const parola = randomBytes(18).toString('base64url');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
  ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
  ekranId = ekranKaydet(vt, { projeId, anahtar: 'musteri-kaydi', ad: 'Müşteri Kaydı' });
  ekranModeliEkle(vt, { ekranId, model: { ...ornekBasvuruModeli(), id: 'musteri-kaydi', ad: 'Müşteri Kaydı', ekranUrl: '/musteri/' } });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor.yol, vtYolu, { TEST_SUNUCU_KOSU_KAPALI: '1' });
  expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola })).basarili).toBe(true);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  klasor?.temizle();
});

async function sayfa(): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 1000 } });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}

function paket(bozuk: boolean): Record<string, unknown> {
  const model = { ...ornekBasvuruModeli(), id: 'musteri-kaydi', ad: 'Müşteri Kaydı', ekranUrl: '/musteri/' } as unknown as Record<string, unknown> & { adimlar: Array<Record<string, unknown>> };
  model.adimlar = bozuk ? [] : model.adimlar.map((a, i) => (i === 0 ? { ...a, baslik: `${String(a.baslik)} (yeni başlık)` } : a));
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'musteri-kaydi', ad: 'Müşteri Kaydı', urlYolu: '/musteri/' }, olusturan: 'test', olusturulma: new Date().toISOString(), baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: true, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
}
const dosya = (p: Record<string, unknown>) => ({ name: 'paket.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });

test('Paket yükle: seçimden sonra girdi sıfırlanır; aynı adlı düzeltilmiş dosya yeniden okunur, eski hatalar kalkar', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await sayfa();
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/yukle`);
  const girdi = page.locator('#paket-dosyasi');
  await girdi.setInputFiles(dosya(paket(true)));
  await expect(page.getByText(/Paket geçersiz — \d+ sorun/)).toBeVisible();
  // Girdi sıfırlandı: aynı dosya adı yeniden seçilince tarayıcı "change" olayını yeniden verir.
  expect(await girdi.evaluate((el) => (el as HTMLInputElement).value)).toBe('');
  expect(await girdi.evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)).toBe(0);
  await expect(page.locator('.dosya-secimi-notu')).toContainText(/Seçilen: paket\.json · \d{2}:\d{2}:\d{2}/);

  await girdi.setInputFiles(dosya(paket(false)));
  await expect(page.getByRole('button', { name: 'Bulguları hesapla' })).toBeVisible();
  await expect(page.getByText(/Paket geçersiz/)).toHaveCount(0);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
  await page.close();
});
