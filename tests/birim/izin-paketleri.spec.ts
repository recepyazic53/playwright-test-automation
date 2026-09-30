// KORUMA TESTLERİ — İzin paketi (S4): "Nöbetçi sizin adınıza neleri yapabilsin?" (ilk kurulum sihirbazı ve Ayarlar > İzinler).
//   - paketlerin açtığı izinler; "Canlı ortamda da çalıştırmaya izin ver" kutusu (işaretsiz / işaretli)
//   - veritabanına yazma, sistem değişikliği ve güvenlik gevşetme hiçbir pakete, "Özel"e ya da kutuya girmez
//   - tek onay: açılan her izin izin geçmişine yazılır; paket hiçbir izni kapatmaz; onaysız hiçbir şey açılmaz
//   - canlı kutusu CANLI ortam onayını kaldırmaz (istekte canliOnay yoksa 409 CANLI_ONAY_GEREKLI)
//   - arayüz: Ayarlar > İzinler kartı ve sihirbazın İzinler adımı
// Güvenlik: yalnız geçici veritabanı ve 127.0.0.1'deki geçici Nöbetçi; hiçbir koşu başlatılmaz, dışarıya istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { IZIN_ANAHTARLARI } from '../../scripts/platform/guvenlik/izin-tanimlari.mjs';
import { CANLI_IZNI, IZIN_PAKETLERI, OZEL_SECILEBILIR, PAKET_DISI_IZINLER, paketIzinleri } from '../../scripts/platform/guvenlik/izin-paketleri.mjs';
import { izinDegisiklikleri, izinDegistir, izinleriOku, izinPaketiUygula } from '../../scripts/platform/guvenlik/izinler.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const acikOlanlar = (izinler: Record<string, boolean>) => Object.keys(izinler).filter((a) => izinler[a]).sort();

test('paketlerin açtığı izinler; canlı kutusu yalnız "Canlı ortamda çalıştırma"yı ekler; riskli izinler hiçbir seçime girmez', () => {
  expect(IZIN_PAKETLERI.map((p) => p.ad)).toEqual(['hicbiri', 'test', 'test-veritabani', 'ozel']);
  expect(paketIzinleri({ paket: 'hicbiri' })).toEqual([]);
  expect(paketIzinleri({ paket: 'test' })).toEqual(['web-erisimi', 'servis-istekleri', 'giris-bilgisi']);
  expect(paketIzinleri({ paket: 'test-veritabani' })).toEqual(['web-erisimi', 'servis-istekleri', 'giris-bilgisi', 'veritabani-okuma']);
  expect(paketIzinleri({ paket: 'test', canli: false })).not.toContain(CANLI_IZNI);
  expect(paketIzinleri({ paket: 'test', canli: true })).toEqual(['web-erisimi', 'servis-istekleri', 'giris-bilgisi', 'canli-ortam']);
  expect(paketIzinleri({ paket: 'hicbiri', canli: true })).toEqual(['canli-ortam']);
  expect(paketIzinleri({ paket: 'ozel', ozel: ['dis-gonderim', 'web-erisimi'] })).toEqual(['web-erisimi', 'dis-gonderim']);
  // Sınıflandırma tüm izinleri kapsar: paket dışı + Özel'de seçilebilir + canlı kutusu.
  expect([...PAKET_DISI_IZINLER, ...OZEL_SECILEBILIR, CANLI_IZNI].sort()).toEqual([...IZIN_ANAHTARLARI].sort());
  expect([...PAKET_DISI_IZINLER].sort()).toEqual(['guvenlik-gevsetme', 'sistem-degisikligi', 'veritabani-yazma']);
  // Hiçbir paket / kutu birleşimi riskli izin açmaz.
  for (const p of IZIN_PAKETLERI) {
    for (const canli of [false, true]) {
      const izinler = paketIzinleri({ paket: p.ad, canli, ozel: [...OZEL_SECILEBILIR] });
      for (const r of PAKET_DISI_IZINLER) expect(izinler, `${p.ad}/${canli}`).not.toContain(r);
      expect(izinler.includes(CANLI_IZNI), `${p.ad}/${canli}`).toBe(canli);
    }
  }
  for (const r of [...PAKET_DISI_IZINLER, CANLI_IZNI]) expect(() => paketIzinleri({ paket: 'ozel', ozel: [r] })).toThrow('pakete girmez');
  expect(() => paketIzinleri({ paket: 'yok' })).toThrow('Bilinmeyen izin paketi');
  expect(() => paketIzinleri({ paket: 'ozel', ozel: ['bilinmeyen'] })).toThrow('Bilinmeyen izin');
  expect(() => paketIzinleri({ paket: 'test', canli: 'evet' })).toThrow('true ya da false');
});

test('paket uygulama: tek onayla açar, her izin geçmişe yazılır; onaysız / riskli seçimde hiçbir şey açılmaz; açık izinleri kapatmaz', async () => {
  const klasor = geciciKlasor('izin-paketi');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Izin-Paketi-1', { kdf: HIZLI_KDF });
    expect(acikOlanlar(izinleriOku(vt))).toEqual([]);
    // Onaysız: hiçbir izin açılmaz, geçmiş boş.
    expect(() => izinPaketiUygula(vt, { paket: 'test' })).toThrow('onaylamalısınız');
    expect(() => izinPaketiUygula(vt, { paket: 'ozel', ozel: ['veritabani-yazma'], onay: true })).toThrow('pakete girmez');
    expect(acikOlanlar(izinleriOku(vt))).toEqual([]);
    expect(izinDegisiklikleri(vt)).toEqual([]);
    // Hiçbiri: değişiklik yok.
    expect(izinPaketiUygula(vt, { paket: 'hicbiri', onay: true })).toMatchObject({ acilanlar: [], degisti: false });
    // Önceden tek tek açılmış bir izin (paket dışı olsa bile) kapanmaz.
    izinDegistir(vt, 'dis-gonderim', true, { onay: true });
    const r = izinPaketiUygula(vt, { paket: 'test', canli: false, onay: true });
    expect(r.acilanlar).toEqual(['web-erisimi', 'servis-istekleri', 'giris-bilgisi']);
    expect(acikOlanlar(r.izinler)).toEqual(['dis-gonderim', 'giris-bilgisi', 'servis-istekleri', 'web-erisimi']);
    expect(r.izinler[CANLI_IZNI]).toBe(false);
    const gecmis = izinDegisiklikleri(vt);
    expect(gecmis.filter((g) => g.acik).map((g) => g.izin).sort()).toEqual(['dis-gonderim', 'giris-bilgisi', 'servis-istekleri', 'web-erisimi']);
    const aciklamalar = vt.tumu("SELECT varlik_id, aciklama FROM degisiklik_gecmisi WHERE varlik_turu = 'izin' ORDER BY rowid").map((x) => [String(x.varlik_id), String(x.aciklama)]);
    expect(aciklamalar.filter(([, a]) => a.includes('izin paketinden: Ekran ve servis testleri'))).toHaveLength(3);
    // Zaten açık izinler yeniden yazılmaz; canlı kutusu yalnız "Canlı ortamda çalıştırma"yı ekler.
    const r2 = izinPaketiUygula(vt, { paket: 'test-veritabani', canli: true, onay: true });
    expect(r2.acilanlar).toEqual(['veritabani-okuma', 'canli-ortam']);
    for (const riskli of PAKET_DISI_IZINLER) expect(r2.izinler[riskli], riskli).toBe(false);
    const canliSatiri = vt.tumu("SELECT aciklama FROM degisiklik_gecmisi WHERE varlik_turu = 'izin' AND varlik_id = 'canli-ortam'").map((x) => String(x.aciklama));
    expect(canliSatiri).toEqual(['açıldı (izin paketinden: Ekran ve servis testleri + veritabanı okuma; "Canlı ortamda da çalıştırmaya izin ver" işaretli)']);
    expect(izinDegisiklikleri(vt)).toHaveLength(6);
  } finally { vt.kapat(); klasor.temizle(); }
});

test.describe('İzin paketi: sunucu ve arayüz', () => {
  const PAROLA = `Gecici-IzinPaketi-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'izin-paketi-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeKaydet(vt, { ad: 'İzin Projesi' });
    vt.kapat();
    // Koşu kapalı: hiçbir test koşusu başlatılamaz (CANLI onayı denetimi koşudan önce yapılır).
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0', TEST_SUNUCU_KOSU_KAPALI: '1' });
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('Ayarlar > İzinler: paket seçimi, riskli liste, canlı kutusu uyarısı, tek onayla açma ve geçmiş; CANLI onayı kalır', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/izinler');
    const kart = page.getByRole('region', { name: 'İzin paketi' });
    await expect(kart.getByRole('heading', { name: 'Nöbetçi sizin adınıza neleri yapabilsin?' })).toBeVisible();
    await expect(kart.getByRole('radio', { name: /^Hiçbir izin açma/ })).toBeChecked();
    // Ortam başına ayrı bölüm: test ortamları (her seçeneğin altında tek cümle) ve ayrı, uyarılı canlı ortam bölümü.
    const testBolumu = kart.getByRole('group', { name: 'Test ortamlarında neler yapılabilsin?' });
    await expect(testBolumu.getByRole('radio')).toHaveCount(4);
    await expect(testBolumu.locator('.profil-secenegi small')).toHaveCount(4);
    await expect(testBolumu.getByRole('checkbox')).toHaveCount(0);
    const canliBolumu = kart.getByRole('group', { name: 'Canlı ortamda neler yapılabilsin?' });
    await expect(canliBolumu).toContainText('gerçek kullanıcıların verisini etkileyebilir');
    await expect(canliBolumu.getByRole('checkbox', { name: 'Canlı ortamda da çalıştırmaya izin ver' })).toBeVisible();
    // Aşağıdaki izin listesi de ortam başına bölümlü; her izin tek bir bölümde.
    await expect(page.locator('.izin-bolumu > h4')).toHaveText(['Test ortamlarında', 'Canlı ortamda', 'Kalıcı değişiklik ve güvenlik', 'Bildirim ve arka plan']);
    await expect(page.locator('.izin-bolumu.canli [data-izin]')).toHaveCount(1);
    await expect(page.locator('.izin-bolumu.canli [data-izin="canli-ortam"]')).toBeVisible();
    await expect(page.locator('.izin-satiri')).toHaveCount(10);
    const liste = kart.getByRole('list', { name: 'Açılacak izinler' });
    await expect(kart.getByRole('button', { name: 'Açılacak izin yok' })).toBeDisabled();

    await kart.getByRole('radio', { name: /^Ekran ve servis testleri \+ veritabanı okuma/ }).check();
    await expect(liste.locator('li[data-izin]')).toHaveCount(4);
    await expect(liste.locator('li[data-izin="veritabani-okuma"]')).toContainText('risk:');
    await expect(liste).not.toContainText('null');
    await expect(liste).toContainText('Pakete girmez, her zaman tek tek açılır: Veritabanına yazma, Sistem değişikliği, Güvenlik gevşetme.');
    const canli = kart.getByRole('checkbox', { name: 'Canlı ortamda da çalıştırmaya izin ver' });
    await expect(canli).not.toBeChecked();
    await expect(kart.locator('.izin-paketi-canli-uyarisi')).toBeHidden();
    await canli.check();
    await expect(kart.locator('.izin-paketi-canli-uyarisi')).toBeVisible();
    await expect(kart.locator('.izin-paketi-canli-uyarisi')).toContainText('"CANLI ortam — emin misiniz?" onayı aynen kalır');
    await expect(liste.locator('li[data-izin="canli-ortam"]')).toContainText('Canlı ortamda çalıştırma');
    await canli.uncheck();
    await expect(liste.locator('li[data-izin="canli-ortam"]')).toHaveCount(0);
    await canli.check();
    await kart.getByRole('button', { name: 'Bu 5 izni aç' }).click();
    await expect(page.locator('[data-izin="canli-ortam"] .izin-anahtari')).toBeChecked();
    await expect(page.locator('[data-izin="veritabani-okuma"] .izin-anahtari')).toBeChecked();
    await expect(page.locator('[data-izin="veritabani-yazma"] .izin-anahtari')).not.toBeChecked();
    await expect(page.locator('.izin-gecmisi li')).toHaveCount(5);
    await expect(kart.getByRole('button', { name: 'Açılacak izin yok' })).toBeDisabled();
    const durum = (await nobetciApi(nobetci, '/platform/izinler')).izinler as Record<string, boolean>;
    expect(acikOlanlar(durum)).toEqual(['canli-ortam', 'giris-bilgisi', 'servis-istekleri', 'veritabani-okuma', 'web-erisimi']);

    // Riskli seçim sunucuda da reddedilir.
    const red = await nobetciApi(nobetci, '/platform/izin/paket-uygula', { paket: 'ozel', ozel: ['guvenlik-gevsetme'], onay: true });
    expect(red.basarili).toBe(false);
    expect(String(red.mesaj)).toContain('pakete girmez');

    // Canlı izni paketle açık olsa da CANLI ortamdaki işlem onaysız başlamaz (409 CANLI_ONAY_GEREKLI; hiçbir şey yapılmaz).
    const { projeler } = (await nobetciApi(nobetci, '/platform/projeler')) as unknown as { projeler: Array<{ id: string }> };
    const projeId = projeler[0].id;
    const canliOrtam = (await nobetciApi(nobetci, '/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9/canli/', riskli: true })) as unknown as { ortam: { id: string } };
    const kosu = await nobetciApi(nobetci, '/platform/senaryolar/calistir', { projeId, ortamId: canliOrtam.ortam.id });
    expect(kosu).toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI' });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('ilk kurulum sihirbazı: İşleriniz adımı (Ekran / Servis testleri; seçim yokken Devam kapalı); seçilen işin izinleri açılır, canlı kapalı kalır; 390 px taşmasız', async () => {
    test.setTimeout(120_000);
    const k2 = mkdtempSync(join(tmpdir(), 'izin-paketi-sihirbaz-'));
    const n = await nobetciBaslat(k2, join(k2, 'platform.db'), { NOBETCI_REHBER_OTOMATIK: '0', TEST_SUNUCU_KOSU_KAPALI: '1' });
    try {
      const baglam = await tarayici.newContext({ baseURL: n.adres, viewport: { width: 390, height: 844 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto('/');
      await page.locator('.secim-karti').filter({ hasText: 'Yeni proje başlat' }).click();
      const parola = `Gecici-Sihirbaz-${randomBytes(6).toString('hex')}`;
      await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(parola);
      await page.getByRole('textbox', { name: 'Kasa parolası (tekrar) (zorunlu)', exact: true }).fill(parola);
      await page.getByText('Parolayı unutursam').click();
      await page.getByRole('button', { name: 'Kasayı oluştur ve devam et' }).click();
      await page.getByLabel('Proje adı').fill('Sihirbaz projesi');
      await page.getByRole('button', { name: 'Devam' }).click();
      await expect(page.locator('.adimlar li[aria-current="step"]')).toHaveText('İşleriniz');
      await expect(page.getByRole('heading', { name: 'Nöbetçi\'yi hangi işleriniz için kullanacaksınız?' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Devam' })).toBeDisabled();
      await page.getByRole('checkbox', { name: /^Ekran testleri/ }).check();
      await page.getByRole('checkbox', { name: /^Servis testleri/ }).check();
      await expect(page.getByRole('button', { name: 'Devam' })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: 'Devam' }).click();
      // Kullanım (Basit / Gelişmiş) adımı: varsayılanla devam.
      await expect(page.locator('.adimlar li[aria-current="step"]')).toHaveText('Kullanım');
      await page.getByRole('button', { name: 'Devam' }).click();
      await expect(page.locator('.adimlar li[aria-current="step"]')).toHaveText('Giriş');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: 'Devam' }).click();
      await expect(page.getByRole('heading', { name: 'Proje hazır' })).toBeVisible();
      const durum = (await nobetciApi(n, '/platform/izinler')) as { izinler?: Record<string, boolean>; degisiklikler?: unknown[] };
      expect(acikOlanlar(durum.izinler ?? {})).toEqual(['giris-bilgisi', 'servis-istekleri', 'web-erisimi']);
      expect(durum.degisiklikler).toHaveLength(3);
      expect(hatalar).toEqual([]);
      await baglam.close();
    } finally {
      n.surec.kill('SIGTERM');
      rmSync(k2, { recursive: true, force: true });
    }
  });
});
