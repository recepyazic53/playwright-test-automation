// KORUMA TESTLERİ — Sonuçlar > Hata kalıpları: kalıba tıklanınca hatanın alındığı testler listelenir (senaryo, hatanın alındığı
// adım, zaman); "Ayrıntı" test panelini açar, "Koşu" koşu detayına gider, "Tekrar çalıştır" aynı ortamda koşu onayını açar
// (bu testte vazgeçilir; koşu başlatılmaz). Yalnız yerel sunucu.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { hataKaliplari, kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

test.describe('hata kalıbından testlere', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kalip-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let s1 = '';
  let s2 = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'hata-kalip-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    const proje = projeKaydet(vt, { ad: 'Kalıp Projesi' });
    const ortam = ortamKaydet(vt, { projeId: proje, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'rota', ad: 'Rota' });
    s1 = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Standart paket', icerik: {} });
    s2 = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Ekspres teslimat', icerik: {} });
    const zaman = (dk: number) => new Date(Date.UTC(2026, 8, 26, 10, dk)).toISOString();
    const kaldi = (kosuId: string, senaryoId: string, baslik: string, dk: number) => sonucKaydet(vt, {
      kosuId, projeId: proje, senaryoId, senaryoBaslik: baslik, durum: 'basarisiz', testKimligi: `${kosuId}-${baslik}`, bitis: zaman(dk),
      hataMesaji: 'Error: Toplam hesaplanır adımında beklenen sonuç doğrulanamadı.',
      adimlar: [{ ad: 'Ekran açılır', durum: 'basarili', sureMs: 280 }, { ad: 'Toplam hesaplanır', durum: 'basarisiz', sureMs: 1100 }]
    });
    kosuKaydet(vt, { id: 'kosu-1', projeId: proje, ortamId: ortam, tur: 'tekil', baslangic: zaman(0) });
    kaldi('kosu-1', s1, 'Standart paket', 1);
    kosuyuBitir(vt, 'kosu-1', { durum: 'tamamlandi', bitis: zaman(2) });
    kosuKaydet(vt, { id: 'kosu-2', projeId: proje, ortamId: ortam, tur: 'tekil', baslangic: zaman(10) });
    kaldi('kosu-2', s2, 'Ekspres teslimat', 11);
    kaldi('kosu-2', s1, 'Standart paket', 12);
    kosuyuBitir(vt, 'kosu-2', { durum: 'tamamlandi', bitis: zaman(13) });
    // Depo: kalıbın testleri en yeniden eskiye; hatanın alındığı adım.
    const k = hataKaliplari(vt, proje).kaliplar[0];
    expect(k.sayi).toBe(3);
    expect(k.sonuclar.map((x) => [x.senaryoBaslik, x.kosuId, x.adim, x.ortamId])).toEqual([
      ['Standart paket', 'kosu-2', 'Toplam hesaplanır', ortam], ['Ekspres teslimat', 'kosu-2', 'Toplam hesaplanır', ortam], ['Standart paket', 'kosu-1', 'Toplam hesaplanır', ortam]]);
    expect(k.sonuclar[0].senaryoId).toBe(s1);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('arayüz: kalıba tıklanınca testler; Ayrıntı, Koşu bağlantısı, Tekrar çalıştır onayı, Hepsini tekrar çalıştır', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/sonuclar');
    const liste = page.getByRole('list', { name: 'Hata kalıpları' });
    const satir = liste.locator('.kalip-satiri').first();
    await expect(satir).toContainText('3 adet');
    const testler = satir.getByRole('list', { name: 'Hatanın alındığı testler' });
    await expect(testler).toBeHidden();
    // Satırın kendisine tıklamak açar / kapatır.
    await satir.locator('.kalip-baslik').click();
    await expect(testler.locator('li')).toHaveCount(3);
    await expect(testler.locator('li').first()).toContainText('Standart paket');
    await expect(testler.locator('li').first()).toContainText('"Toplam hesaplanır" adımında');
    await expect(satir.getByRole('button', { name: /^Hatanın alındığı testler/ })).toHaveAttribute('aria-expanded', 'true');
    // Koşu bağlantısı ve ayrıntı paneli.
    await expect(testler.getByRole('link', { name: 'Koşu: Ekspres teslimat' })).toHaveAttribute('href', '#/sonuclar/kosu/kosu-2');
    await testler.getByRole('button', { name: 'Ayrıntı: Ekspres teslimat' }).click();
    await expect(page.getByText('Ekspres teslimat').last()).toBeVisible();
    // Tekrar çalıştır: aynı ortamda koşu onayı (vazgeç; koşu başlamaz).
    await testler.getByRole('button', { name: 'Tekrar çalıştır: Standart paket' }).first().click();
    const onay = page.locator('dialog[open]');
    await expect(onay).toContainText('Tekrar çalıştırılsın mı?');
    await expect(onay).toContainText('Standart paket');
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(satir.getByRole('button', { name: 'Hepsini tekrar çalıştır (2 senaryo)' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Canlı koşu paneli' })).toHaveCount(0);
    expect(hatalar).toEqual([]);
    expect([s1, s2].every(Boolean)).toBe(true);
    await baglam.close();
  });
});
