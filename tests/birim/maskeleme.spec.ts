// KORUMA TESTLERİ — Ayarlar > Güvenlik > Maskeleme: çekirdek gizli ad listesi (değiştirilemez) + kullanıcının ek adları
// (kasada şifreli). Tek eşleşme kuralı: servis okumaları / başlıkları, eski tablo sütunları ve ekran paketi taraması aynı
// listeyi kullanır. Arayüzde Güvenlik bölümünde kaydedilir.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { gizliAdMi } from '../../scripts/platform/ayarlar/gizli-adlar.mjs';
import { adGizliMi, ekGizliAdlar, ekGizliAdlariKaydet, kisiselVeriMaskelenir, kisiselVeriMaskesiKaydet } from '../../scripts/platform/ayarlar/maskeleme.mjs';
import { kisiselMaskeVarsayilani, yakalananMetniMaskele } from '../../scripts/platform/sonuclar/yakalanan-mesajlar.mjs';
import { MASKE as PANO_MASKE, sonucuMaskele } from '../../scripts/platform/sonuclar/pano-sql.mjs';
import { okumaGizliMi } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('eşleşme kuralı: uzun parçalar ad içinde, kısa parçalar tam sözcük; büyük/küçük harf ve -, _ yok sayılır', () => {
  for (const ad of ['Password', 'musteri_parola', 'ŞifreTekrar', 'Authorization', 'X-Api-Key', 'accessKey', 'session_id', 'Cookie', 'PinKodu', 'pin', 'totpGizli', 'guvenlikKodu', 'CVV'])
    expect(gizliAdMi(ad), ad).toBe(true);
  for (const ad of ['Shipping', 'Username', 'Channel', 'SiparisNo', 'Opinion', 'Kanal', 'otopark'])
    expect(gizliAdMi(ad), ad).toBe(false);
  expect(gizliAdMi('MusteriAnahtari')).toBe(false);
  expect(gizliAdMi('Musteri_Anahtari', ['musteriAnahtari'])).toBe(true);
  expect(okumaGizliMi({ ad: 'MusteriAnahtari', yol: '//x' }, ['musterianahtari'])).toBe(true);
  expect(okumaGizliMi({ ad: 'Token', yol: '//x', gizli: false })).toBe(false);   // açık işaret önceliklidir
});

test('ek adlar kasada şifreli saklanır; doğrulanır; kasa kilitliyken boş liste', async () => {
  const klasor = geciciKlasor('maskeleme');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    expect(ekGizliAdlar(vt)).toEqual([]);   // kasa yok → boş
    await kasaOlustur(vt, 'Gecici-Maskeleme-1', { kdf: HIZLI_KDF });
    expect(() => ekGizliAdlariKaydet(vt, ['a'])).toThrow('Geçersiz ad');
    expect(() => ekGizliAdlariKaydet(vt, 'x')).toThrow('dizi');
    expect(ekGizliAdlariKaydet(vt, [' musteriAnahtari ', 'musteriAnahtari', 'kurumKodu'])).toEqual(['musteriAnahtari', 'kurumKodu']);
    expect(adGizliMi(vt, 'KURUM_KODU')).toBe(true);
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'maskeleme'")?.deger_json)).toMatch(/^kasa:v1:/);
    // "Kişisel verileri maskele": varsayılan açık; kapatılınca ek adlar korunur, ek adlar kaydedilince ayar korunur.
    expect(kisiselVeriMaskelenir(vt)).toBe(true);
    expect(() => kisiselVeriMaskesiKaydet(vt, 'hayır')).toThrow('true ya da false');
    expect(kisiselVeriMaskesiKaydet(vt, false)).toBe(false);
    expect(kisiselVeriMaskelenir(vt)).toBe(false);
    expect(ekGizliAdlar(vt)).toEqual(['musteriAnahtari', 'kurumKodu']);
    ekGizliAdlariKaydet(vt, ['kurumKodu']);
    expect(kisiselVeriMaskelenir(vt)).toBe(false);
  } finally { vt.kapat(); klasor.temizle(); }
});

test('kişisel veri maskesi kapalı: uzun sayı / e-posta ve pano kişisel sütun kalıpları açık, sırlar maskeli', () => {
  const metin = 'TC 12345678950 tel 0532 123 45 67 mail ali@ornek.com parola=Gizli123';
  const acik = yakalananMetniMaskele(metin, { kisisel: true });
  expect(acik).not.toContain('12345678950');
  expect(acik).not.toContain('ali@');
  const kapali = yakalananMetniMaskele(metin, { kisisel: false });
  expect(kapali).toContain('12345678950');
  expect(kapali).toContain('ali@ornek.com');
  expect(kapali).not.toContain('Gizli123');
  // Süreç geneli varsayılan (sunucu / koşucu ayarlar).
  kisiselMaskeVarsayilani(false);
  try { expect(yakalananMetniMaskele(metin)).toContain('0532 123 45 67'); } finally { kisiselMaskeVarsayilani(true); }
  expect(yakalananMetniMaskele(metin)).not.toContain('0532 123 45 67');
  // Pano: kişisel adlı sütun ve T.C. kalıbı yalnız ayar açıkken maskelenir; parola sütunu her zaman.
  const r = { sutunlar: ['TCKN', 'PAROLA', 'ACIKLAMA'], satirlar: [['10000000146', 'x1', 'kimlik 10000000146']] };
  expect(sonucuMaskele(r, { ekler: [], gizliDegerler: [] }).satirlar[0]).toEqual([PANO_MASKE, PANO_MASKE, `kimlik ${PANO_MASKE}`]);
  expect(sonucuMaskele(r, { ekler: [], gizliDegerler: [], kisisel: false }).satirlar[0]).toEqual(['10000000146', PANO_MASKE, 'kimlik 10000000146']);
});

test.describe('Güvenlik > Maskeleme arayüzü', () => {
  const PAROLA = `Gecici-MaskeUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'maskeleme-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Maskeleme Projesi' });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('çekirdek liste görünür; ek adlar kaydedilir; geçersiz ad reddedilir', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/guvenlik');
    const form = page.getByRole('form', { name: 'Maskeleme' });
    await expect(form).toContainText('parola');
    const liste = form.getByLabel('Ek gizli adlar (her satıra bir ad)');
    await liste.fill('x');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByRole('alert')).toContainText('Geçersiz ad');
    await liste.fill('musteriAnahtari\nkurumKodu');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('2 ek ad kaydedildi.')).toBeVisible();
    expect((await nobetciApi(nobetci, '/platform/maskeleme') as { ekAdlar: string[] }).ekAdlar).toEqual(['musteriAnahtari', 'kurumKodu']);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
