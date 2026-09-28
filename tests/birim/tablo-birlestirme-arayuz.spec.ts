// UÇTAN UCA (yerel) — Ayarlar > Test verisi > Veri sağlığı ve tablo birleştirme arayüzü: özet (benzer / kullanılmayan / boş sütun),
// birleştirme penceresi (kalacak tablo kullanım sayılarıyla, satır çakışması maskeli, kuru doğrulama), onaylı birleştirme, geri alma;
// yeni tablo kaydında "Benzer tablo var" önlemesi; masaüstü ve 390px'te yatay taşma yok. Ayrı Nöbetçi (127.0.0.1), geçici DB.
// Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { servisKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Saglik-${randomBytes(6).toString('hex')}`;
const GIZLI = 'gizli-sifre-77';
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
const tablo: Record<string, string> = {};
let projeId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'tablo-saglik-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  projeId = projeKaydet(vt, { ad: 'Mağaza' });
  tablo.A = tabloKaydet(vt, { projeId, ad: 'Kargo firmaları', sutunlar: [{ ad: 'Firma' }, { ad: 'Takip kodu' }, { ad: 'Anahtar', gizli: true }], satirlar: [
    { ad: 'k1', degerler: { Firma: 'Hızlı Kargo', 'Takip kodu': 'HK', Anahtar: GIZLI } },
    { ad: 'k2', degerler: { Firma: 'Yavaş Kargo', 'Takip kodu': 'YK' } }
  ] });
  tablo.B = tabloKaydet(vt, { projeId, ad: 'Kargo şirketleri (eski)', sutunlar: [{ ad: 'FİRMA' }, { ad: 'takip_kodu' }, { ad: 'Anahtar', gizli: true }], satirlar: [
    { ad: 'k1', degerler: { FİRMA: 'Hızlı Kargo', takip_kodu: 'HK-2', Anahtar: 'gizli-sifre-88' } },
    { ad: 'k3', degerler: { FİRMA: 'Deniz Kargo', takip_kodu: 'DK' } }
  ] });
  tablo.C = tabloKaydet(vt, { projeId, ad: 'Ödeme türleri', sutunlar: [{ ad: 'Tür' }, { ad: 'Açıklama' }] });
  servisKaydet(vt, { projeId, anahtar: 'kargo', ad: 'Kargo servisi', tur: 'rest', ayarlar: { yol: '/api', alanBaglari: { Gonder: { firma: { tablo: tablo.A, sutun: 'Firma' } } } } });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
  expect(y.basarili, y.mesaj).not.toBe(false);
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

const tasma = (page: Page) => page.evaluate(() => {
  const d = document.querySelector('dialog[open]') as HTMLElement | null;
  return { sayfa: document.documentElement.scrollWidth - innerWidth, diyalog: d ? d.scrollWidth - d.clientWidth : 0 };
});

test('veri sağlığı özeti, birleştirme penceresi, onaylı birleştirme ve geri alma; 390px taşma yok', async () => {
  test.setTimeout(90_000);
  for (const [genislik, yukseklik] of [[1280, 900], [390, 844]] as const) {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/test-verisi');
    const kart = page.getByRole('region', { name: 'Veri sağlığı' });
    await expect(kart.getByText('Birleştirilebilecek tablolar')).toBeVisible();
    await expect(kart).toContainText('“Kargo firmaları” + “Kargo şirketleri (eski)”');
    // Geçmiş boş (ilk tur, henüz birleştirme yok): düğme kapalı.
    if (genislik === 1280) await expect(kart.getByRole('button', { name: 'Birleştirme geçmişi' })).toBeDisabled();
    await kart.getByText('Hiç kullanılmayan tablolar').click();
    await expect(kart.getByRole('button', { name: 'Ödeme türleri' })).toBeVisible();
    await kart.getByRole('button', { name: 'Birleştir…' }).click();
    const d = page.getByRole('dialog', { name: 'Tabloları birleştir' });
    await expect(d).toContainText('1 servis bağı');
    await expect(d.getByText('en çok kullanılan (önerilen)')).toBeVisible();
    await expect(d).toContainText('farklı (gizli •••)');
    await expect(d).toContainText('Takip kodu: HK → HK-2');
    await expect(d).toContainText('aynı değerleri üretiyorlar');
    expect(await d.innerText()).not.toContain(GIZLI);
    const o = await tasma(page);
    expect(o.sayfa, `${genislik}px sayfa`).toBeLessThanOrEqual(2);
    expect(o.diyalog, `${genislik}px diyalog`).toBeLessThanOrEqual(2);
    if (genislik === 390) { await d.getByRole('button', { name: 'Kapat' }).click(); await baglam.close(); continue; }
    // Ad kutusu: yazarken önizleme yeniden hesaplanır ama kutu yeniden çizilmez; harfler kaybolmaz, odak kalır.
    const adKutusu = d.getByRole('textbox', { name: 'Kalan tablonun adı' });
    await adKutusu.click();
    await adKutusu.pressSequentially('Kargo ana', { delay: 150 });
    await expect(d.getByText('Önizleme hesaplanıyor…')).toHaveCount(0);
    await expect(adKutusu).toHaveValue('Kargo ana');
    await expect(adKutusu).toBeFocused();
    await adKutusu.fill('');
    await expect(d.getByText('Önizleme hesaplanıyor…')).toHaveCount(0);
    await d.getByRole('combobox', { name: 'k1 satırı için seçim' }).selectOption('kalan');
    await expect(d).toContainText('2 satır kalır, 1 satır eklenir');
    await expect(d.getByRole('button', { name: 'Birleştir', exact: true })).toBeEnabled();
    await d.getByRole('button', { name: 'Birleştir', exact: true }).click();
    await page.getByRole('dialog', { name: 'Tablolar birleştirilsin mi?' }).getByRole('button', { name: 'Birleştir' }).click();
    await expect(page.getByText('Tablolar birleştirildi')).toBeVisible();
    // Eski uzun "Son birleştirme" satırı yok; başlıktaki geçmiş düğmesi açılır.
    await expect(kart).not.toContainText('Son birleştirme');
    const gecmisDugmesi = kart.getByRole('button', { name: 'Birleştirme geçmişi' });
    await expect(gecmisDugmesi).toBeEnabled();
    const r = await nobetciApi(nobetci, `/platform/tablolar?projeId=${projeId}`);
    const a = (r.tablolar as Array<{ id: string; satirlar: Array<{ ad: string }> }>).find((t) => t.id === tablo.A);
    expect(a?.satirlar.map((x) => x.ad)).toEqual(['k1', 'k2', 'k3']);
    // Geçmiş diyaloğu: satırdan geri al (onaylı); satır "geri alındı" olur.
    await gecmisDugmesi.click();
    const g = page.getByRole('dialog', { name: 'Birleştirme geçmişi' });
    const satir = g.getByRole('listitem').first();
    await expect(satir).toContainText('“Kargo şirketleri (eski)” → “Kargo firmaları”');
    await expect(satir).toContainText('1 satır eklendi');
    await expect(satir).toContainText('önce alınan yedek: otomatik-');
    await satir.getByRole('button', { name: 'Geri al…' }).click();
    await page.getByRole('dialog', { name: 'Birleştirme geri alınsın mı?' }).getByRole('button', { name: 'Geri al' }).click();
    await expect(page.getByText('Birleştirme geri alındı.')).toBeVisible();
    await expect(g.getByRole('listitem').first()).toContainText('geri alındı');
    await expect(g.getByRole('listitem').first().getByRole('button', { name: 'Geri al…' })).toHaveCount(0);
    await g.getByRole('button', { name: 'Kapat' }).click();
    await expect(g).toHaveCount(0);
    expect(hatalar).toEqual([]);
    await baglam.close();
  }
});

test('yeni tablo kaydı: "Benzer tablo var" — onu kullan satırları o tabloya taşır (kaydetmeden)', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  const liste = page.getByRole('navigation', { name: 'Tablolar' });
  await liste.getByRole('button', { name: 'Tablo ekle' }).click();
  const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
  await duz.getByRole('textbox', { name: 'Tablo adı' }).fill('Ödeme yöntemleri');
  await duz.getByText('Excel\'den yapıştır').click();
  await duz.getByRole('textbox', { name: 'Yapıştırılacak satırlar' }).fill('TÜR\taçıklama\nKapıda\tNakit');
  await duz.getByRole('button', { name: 'Yapıştırılanları ekle' }).click();
  await duz.getByRole('button', { name: 'Kaydet' }).click();
  const soru = page.getByRole('dialog', { name: 'Benzer tablo var' });
  await expect(soru).toContainText('“Ödeme türleri”');
  await soru.getByRole('button', { name: /Onu kullan: “Ödeme türleri”/ }).click();
  await expect(duz.getByRole('textbox', { name: 'Tablo adı' })).toHaveValue('Ödeme türleri');
  await expect(duz.getByLabel('1. satır Tür', { exact: true })).toHaveValue('Kapıda');
  await expect(duz.getByText('kaydedilmemiş değişiklik')).toBeVisible();
  await baglam.close();
});

test('veri sağlığı: öneriler puana göre; eşik altı (genel sütun adları) varsayılan gizli, "Düşük benzerlikleri de göster"; eşik Ayarlar > Test verisi', async () => {
  test.setTimeout(60_000);
  for (const [ad, deger] of [['Durum kodları', 'Açık'], ['Hata kodları', 'Zaman aşımı']] as const) {
    const y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { projeId, ad, sutunlar: [{ ad: 'Kod' }, { ad: 'Açıklama' }], satirlar: [{ degerler: { Kod: '1', Açıklama: deger } }] });
    expect(y.basarili, String(y.mesaj ?? '')).not.toBe(false);
  }
  const s = await nobetciApi(nobetci, `/platform/tablolar/veri-sagligi?projeId=${projeId}`) as { benzerlikEsigi: number; benzer: Array<{ adlar: string[]; puan: number }> };
  expect(s.benzerlikEsigi).toBe(50);
  expect(s.benzer.map((b) => b.puan)).toEqual([...s.benzer.map((b) => b.puan)].sort((a, b) => b - a));
  const dusuk = s.benzer.find((b) => b.adlar.includes('Durum kodları'));
  expect(dusuk?.puan).toBeLessThan(50);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  const kart = page.getByRole('region', { name: 'Veri sağlığı' });
  await expect(kart).toContainText('“Kargo firmaları” + “Kargo şirketleri (eski)”');
  await expect(kart).not.toContainText('“Durum kodları”');
  await kart.getByRole('button', { name: 'Düşük benzerlikleri de göster (1)' }).click();
  await expect(kart).toContainText('“Durum kodları” + “Hata kodları”');
  // Eşik: Veri sağlığı başlığındaki ayarlar (dişli) düğmesi → "Test verisi ayarları" diyaloğu; sayfada ayrı ayar kartı yok.
  await expect(page.getByRole('form', { name: 'Test verisi ayarları' })).toHaveCount(0);
  await kart.getByRole('button', { name: 'Test verisi ayarları' }).click();
  const d = page.getByRole('dialog', { name: 'Test verisi ayarları' });
  const form = d.getByRole('form', { name: 'Test verisi ayarları' });
  // Açıklama (kısa; uzunsa ayrıntı "?" ipucunda) ve varsayılan diyalogda korunur.
  await expect(form).toContainText('Benzerlik puanı bunun altındaki');
  await expect(form).toContainText('Varsayılan: 50');
  await form.getByLabel(/Birleştirme önerisi eşiği/).fill('10');
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d.getByText('Test verisi ayarları kaydedildi.')).toBeVisible();
  await d.getByRole('button', { name: 'Kapat' }).click();
  // Kapatınca Veri sağlığı yeni eşikle yeniden okunur (sayfa yenilenmeden).
  await expect(kart).toContainText('“Durum kodları” + “Hata kodları”');
  await expect(kart.getByRole('button', { name: /Düşük benzerlikleri de göster/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Veri sağlığı' })).toContainText('“Durum kodları” + “Hata kodları”');
  await nobetciApi(nobetci, '/platform/kosu-ayarlari/kaydet', { ayarlar: { benzerlikEsigi: 50 } });
  await baglam.close();
});

test('Test verisi ayarları diyaloğu 390px: dişli düğmesi görünür, diyalog taşmaz; "Eşiği değiştir" de diyaloğu açar', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 390, height: 844 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  const kart = page.getByRole('region', { name: 'Veri sağlığı' });
  await expect(kart.getByRole('button', { name: 'Test verisi ayarları' })).toBeVisible();
  await expect(kart.getByRole('button', { name: 'Birleştirme geçmişi' })).toBeVisible();
  await kart.getByRole('button', { name: 'Eşiği değiştir' }).click();
  const d = page.getByRole('dialog', { name: 'Test verisi ayarları' });
  await expect(d.getByLabel(/Birleştirme önerisi eşiği/)).toHaveValue('50');
  const o = await tasma(page);
  expect(o.sayfa, '390px sayfa').toBeLessThanOrEqual(2);
  expect(o.diyalog, '390px diyalog').toBeLessThanOrEqual(2);
  await d.getByRole('button', { name: 'Kapat' }).click();
  await expect(d).toHaveCount(0);
  await baglam.close();
});

test('Ayarlar açıklamaları kısa (1–2 cümle), ayrıntı "?" ipucunda; Test verisi bilgisi bir kez (açıklama + bilgi kutusu yinelenmez)', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 390, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  const aciklama = page.locator('.bolum-aciklamasi');
  await expect(aciklama).toContainText('Her tablo bir Excel sayfası gibidir');
  await expect(page.getByText(/Her tablo bir Excel sayfası gibidir/)).toHaveCount(1);
  const ayrinti = aciklama.locator('.ayrinti-ipucu');
  await expect(ayrinti).toBeHidden();
  await aciklama.getByRole('button', { name: 'Ayrıntıyı göster' }).click();
  await expect(ayrinti).toBeVisible();
  await expect(ayrinti).toContainText('Bağlam tabloları (ör. şube)');
  await page.keyboard.press('Escape');
  await expect(ayrinti).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  // Uzun alan açıklamaları da kısalır; varsayılan değer her zaman görünür.
  await page.goto('/#/ayarlar/kosu');
  const form = page.getByRole('form', { name: 'Koşu ayarları' });
  await expect(form.getByText(/Varsayılan: Token'ı yenile, bir kez tekrar dene\./)).toBeVisible();
  await expect(form.getByRole('button', { name: 'Ayrıntıyı göster' }).first()).toBeVisible();
  await baglam.close();
});

test('yeni tek sütunlu tablo: ayırt edici başlık + örtüşen satırlar → "Benzer tablo var"; satırsız yeni tabloda sorulmaz', async () => {
  const y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { projeId, ad: 'İade formu — Müşteri tipi', sutunlar: [{ ad: 'Müşteri tipi' }],
    satirlar: [{ degerler: { 'Müşteri tipi': 'Bireysel' } }, { degerler: { 'Müşteri tipi': 'Kurumsal' } }] });
  expect(y.basarili, String(y.mesaj ?? '')).not.toBe(false);
  // Satırsız yeni tek sütunlu tablo: başlık aynı olsa da öneri yok.
  expect((await nobetciApi(nobetci, '/platform/tablo/benzer', { projeId, sutunlar: ['MÜŞTERİ TİPİ'], satirlar: [] })).benzerler).toEqual([]);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/test-verisi');
  await page.getByRole('navigation', { name: 'Tablolar' }).getByRole('button', { name: 'Tablo ekle' }).click();
  const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
  await duz.getByRole('textbox', { name: 'Tablo adı' }).fill('Fatura formu — Müşteri tipi');
  await duz.getByText('Excel\'den yapıştır').click();
  await duz.getByRole('textbox', { name: 'Yapıştırılacak satırlar' }).fill('Müşteri tipi\nBireysel\nKurumsal\nYabancı');
  await duz.getByRole('button', { name: 'Yapıştırılanları ekle' }).click();
  await duz.getByRole('button', { name: 'Kaydet' }).click();
  const soru = page.getByRole('dialog', { name: 'Benzer tablo var' });
  await expect(soru).toContainText('“İade formu — Müşteri tipi”');
  await soru.getByRole('button', { name: /Onu kullan: “İade formu — Müşteri tipi”/ }).click();
  await expect(duz.getByRole('textbox', { name: 'Tablo adı' })).toHaveValue('İade formu — Müşteri tipi');
  await expect(duz.getByText('kaydedilmemiş değişiklik')).toBeVisible();
  await baglam.close();
});

test('birleştirme geçmişi: aynı tabloyu etkileyen sonraki birleştirme varsa eskinin "Geri al"ı kapalı ve nedeni yazar; yenisi geri alınınca açılır; 390px taşma yok', async () => {
  test.setTimeout(90_000);
  const y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { projeId, ad: 'Kargo arşivi', sutunlar: [{ ad: 'Firma' }, { ad: 'Takip kodu' }, { ad: 'Anahtar', gizli: true }],
    satirlar: [{ ad: 'k9', degerler: { Firma: 'Uzak Kargo', 'Takip kodu': 'UK' } }] });
  expect(y.basarili, String(y.mesaj ?? '')).not.toBe(false);
  const arsiv = String((y.tablo as { id: string }).id);
  const birlestir = async (kaynakId: string) => {
    const g = { projeId, kalanId: tablo.A, kaynakIdler: [kaynakId] };
    const o = (await nobetciApi(nobetci, '/platform/tablo/birlestir', g)).onizleme as { imza?: string; engeller: string[]; dogrulandi: boolean };
    expect(o.engeller).toEqual([]);
    expect(o.dogrulandi).toBe(true);
    expect((await nobetciApi(nobetci, '/platform/tablo/birlestir', { ...g, kip: 'uygula', beklenenImza: o.imza })).uygulandi).toBe(true);
  };
  await birlestir(tablo.B);
  await birlestir(arsiv);
  // Önce 390px (yalnız görünüm + taşma), sonra masaüstünde yenisini geri alma.
  for (const [genislik, yukseklik] of [[390, 844], [1280, 900]] as const) {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    const page = await baglam.newPage();
    await page.goto('/#/ayarlar/test-verisi');
    await page.getByRole('region', { name: 'Veri sağlığı' }).getByRole('button', { name: 'Birleştirme geçmişi' }).click();
    const g = page.getByRole('dialog', { name: 'Birleştirme geçmişi' });
    const satirlar = g.getByRole('listitem');
    await expect(satirlar).toHaveCount(3);
    await expect(satirlar.nth(0)).toContainText('“Kargo arşivi” → “Kargo firmaları”');
    await expect(satirlar.nth(0).getByRole('button', { name: 'Geri al…' })).toBeEnabled();
    const eski = satirlar.nth(1);
    await expect(eski).toContainText('“Kargo şirketleri (eski)” → “Kargo firmaları”');
    await expect(eski.getByRole('button', { name: 'Geri al…' })).toBeDisabled();
    await expect(eski).toContainText('aynı tabloyu değiştirdi; önce onu geri alın');
    await expect(satirlar.nth(2)).toContainText('geri alındı');
    const o = await tasma(page);
    expect(o.sayfa, `${genislik}px sayfa`).toBeLessThanOrEqual(2);
    expect(o.diyalog, `${genislik}px diyalog`).toBeLessThanOrEqual(2);
    if (genislik === 390) { await baglam.close(); continue; }
    await satirlar.nth(0).getByRole('button', { name: 'Geri al…' }).click();
    await page.getByRole('dialog', { name: 'Birleştirme geri alınsın mı?' }).getByRole('button', { name: 'Geri al' }).click();
    await expect(page.getByText('Birleştirme geri alındı.')).toBeVisible();
    await expect(satirlar.nth(0)).toContainText('geri alındı');
    await expect(satirlar.nth(1).getByRole('button', { name: 'Geri al…' })).toBeEnabled();
    await expect(satirlar.nth(1)).not.toContainText('önce onu geri alın');
    await g.getByRole('button', { name: 'Kapat' }).click();
    await baglam.close();
  }
  // Durumu temizle: kalan etkin birleştirme (en yeni etkin; kimliksiz istek).
  for (let i = 0; i < 1; i++) expect((await nobetciApi(nobetci, '/platform/tablo/birlestirme/geri-al', { projeId, onay: true })).geriAlindi).toBe(true);
});
