// KORUMA TESTİ — yedekten içe aktarma önizlemesinde açılır-kapanır varlık türü / grup başlıkları (scripts/platform/arayuz/ice-aktarma.js).
// Varsayılan her şey kapalı (sayfa kısa), başlıkta sayılar ve üç durumlu seçim; kapalı grup kutusuyla tümden bırakma alt çubuğa
// yansır; satırlar grup açılınca (200'lük parçalarla) çizilir; uygulamada yalnız seçilenler yazılır; 390 px taşma yok.
// Dış istek yok: geçici veritabanları ve 127.0.0.1'deki Nöbetçi sunucusu.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, testVerisiProfiliKaydet, testVerisiTuruKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';

const PAROLA_A = 'Acilir-Onizleme-Kaynak-1';
const PAROLA_B = 'Acilir-Onizleme-Yerel-2';
const YENI_SAYISI = 250;

test('arayüz: önizlemede türler ve gruplar kapalı; başlıkta sayılar + üç durumlu seçim; yalnız seçilenler uygulanır (390 px taşma yok)', async () => {
  test.setTimeout(180_000);
  const klasor = geciciKlasor('ice-aktarma-acilir');
  const vtYolu = join(klasor.yol, 'platform.db');

  // Kaynak: 3 satırlık tablo → yerel bilgisayara olduğu gibi aktarılır; sonra kaynakta 250 yeni satır, yerelde 1 değişen + 1 yalnız yerel.
  const a = await veritabaniniHazirla(null);
  await kasaOlustur(a, PAROLA_A, { kdf: HIZLI_KDF });
  const proje = projeKaydet(a, { ad: 'Önizleme projesi' });
  const ortam = ortamKaydet(a, { projeId: proje, ad: 'TEST', tabanUrl: 'https://onizleme-test.ornek.test', varsayilan: true, ayarlar: { riskli: false } });
  const tur = testVerisiTuruKaydet(a, { projeId: proje, ad: 'Kartlar', alanlar: [{ ad: 'no' }] });
  const ilkSatir = testVerisiProfiliKaydet(a, { projeId: proje, turId: tur, ortamId: ortam, ad: 'Satır 1', degerler: { no: '1' } });
  testVerisiProfiliKaydet(a, { projeId: proje, turId: tur, ortamId: ortam, ad: 'Satır 2', degerler: { no: '2' } });
  testVerisiProfiliKaydet(a, { projeId: proje, turId: tur, ortamId: ortam, ad: 'Satır 3', degerler: { no: '3' } });
  const b = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(b, PAROLA_B, { kdf: HIZLI_KDF });
  iceAktarmaUygula(b, await iceAktarmaHazirla(b, yedekOlustur(a).veri, PAROLA_A), { tumu: true }, { yapan: 'birim-test' });
  testVerisiProfiliKaydet(b, { id: ilkSatir, projeId: proje, turId: tur, ortamId: ortam, ad: 'Satır 1', degerler: { no: '99' } });
  testVerisiProfiliKaydet(b, { projeId: proje, turId: tur, ortamId: ortam, ad: 'Yalnız yerel satır', degerler: { no: '7' } });
  b.kapat();
  for (let i = 1; i <= YENI_SAYISI; i++) testVerisiProfiliKaydet(a, { projeId: proje, turId: tur, ortamId: ortam, ad: `Yeni satır ${String(i).padStart(3, '0')}`, degerler: { no: String(100 + i) } });
  const yedek = yedekOlustur(a).veri;
  a.kapat();

  const nobetci = await nobetciBaslat(klasor.yol, vtYolu);
  const tarayici = await korumaliTarayici();
  const hatalar: string[] = [];
  const istekler: string[] = [];
  try {
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA_B })).basarili).toBe(true);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 390, height: 844 } });
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const p = await baglam.newPage();
    p.on('pageerror', (e) => hatalar.push(String(e)));
    const tasmaYok = async (sayfa: Page): Promise<void> => {
      expect(await sayfa.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    };
    const kismi = async (kutu: Locator): Promise<void> => {
      await expect(kutu).toHaveAttribute('aria-checked', 'mixed');
      expect(await kutu.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
    };
    const tam = async (kutu: Locator, secili: boolean): Promise<void> => {
      await expect(kutu).not.toHaveAttribute('aria-checked', 'mixed');
      if (secili) await expect(kutu).toBeChecked(); else await expect(kutu).not.toBeChecked();
    };

    await p.goto('/#/ayarlar/yedekleme');
    await p.getByRole('button', { name: 'Yedek dosyası seç…' }).click();
    await p.getByLabel('Yedek dosyası').setInputFiles({ name: 'onizleme.tayedek', mimeType: 'application/octet-stream', buffer: yedek });
    await p.getByRole('textbox', { name: 'Yedeğin parolası (zorunlu)' }).fill(PAROLA_A);
    await p.getByRole('button', { name: 'Yükle ve önizle' }).click();
    await expect(p.getByRole('heading', { name: 'Yedek önizlemesi' })).toBeVisible({ timeout: 60_000 });

    // Varsayılan: hedef proje ve özet açık; tüm türler/gruplar kapalı, hiçbir satır çizilmemiş, sayfa kısa.
    await expect(p.getByRole('region', { name: 'Hedef proje' }).getByLabel('Yedekteki proje: Önizleme projesi')).toBeVisible();
    await expect(p.locator('.sayac-cipleri')).toBeVisible();
    const dugmeler = p.locator('.acilir-dugme');
    expect(await dugmeler.count()).toBeGreaterThan(0);
    for (const d of await dugmeler.all()) await expect(d).toHaveAttribute('aria-expanded', 'false');
    await expect(p.locator('.varlik-bolumu li')).toHaveCount(0);
    // Önizleme akışının yüksekliği (sayfanın altındaki diğer Ayarlar bölümleri hariç): 250 satır çizilmediği için kısa.
    const akisYuksekligi = await p.locator('.adimlar').evaluate((el) => (el.parentElement as HTMLElement).getBoundingClientRect().height);
    expect(akisYuksekligi).toBeLessThan(2000);
    await tasmaYok(p);

    const bolum = p.locator('[data-tablo="test_verisi_profilleri"]');
    const turDugmesi = bolum.locator(':scope > .acilir-baslik .acilir-dugme');
    const turKutusu = bolum.locator(':scope > .acilir-baslik > input[type="checkbox"]');
    await expect(turDugmesi).toContainText(`— ${YENI_SAYISI} yeni, 1 değişen, 1 yalnızca bu bilgisayarda`);
    await expect(turDugmesi).toContainText(`· ${YENI_SAYISI + 1} seçili`);
    await tam(turKutusu, true);
    await expect(turKutusu).toHaveAccessibleName(/^Tümünü seç \(.+\)$/);

    const sayac = p.locator('.sabit-alt .secim-sayaci');
    const ilk = /Seçili: (\d+) \/ (\d+) kayıt/.exec((await sayac.textContent()) ?? '');
    expect(ilk).not.toBeNull();
    const toplam = Number(ilk?.[2]);
    expect(Number(ilk?.[1])).toBe(toplam);
    expect(toplam).toBeGreaterThanOrEqual(YENI_SAYISI + 1);

    // Tür kapalıyken tür kutusuyla hepsini bırak / geri seç.
    await turKutusu.uncheck();
    await expect(sayac).toHaveText(`Seçili: ${toplam - YENI_SAYISI - 1} / ${toplam} kayıt`);
    await tam(turKutusu, false);
    await turKutusu.check();
    await expect(sayac).toHaveText(`Seçili: ${toplam} / ${toplam} kayıt`);

    // Türü klavyeyle aç: gruplar görünür ama kapalı.
    await turDugmesi.focus();
    await p.keyboard.press('Enter');
    await expect(turDugmesi).toHaveAttribute('aria-expanded', 'true');
    const yeni = bolum.locator('.grup.yeni');
    const yeniDugmesi = yeni.locator('.acilir-dugme');
    const yeniKutusu = yeni.getByRole('checkbox', { name: /^Tümünü seç \(.+, yeni\)$/ });
    await expect(yeniDugmesi).toHaveAttribute('aria-expanded', 'false');
    await expect(yeniDugmesi).toHaveText(`Yeni · ${YENI_SAYISI} kayıt · ${YENI_SAYISI} seçili`);
    await expect(bolum.locator('.grup.degisen .acilir-dugme')).toContainText('Değişen · 1 kayıt · 1 seçili');
    await expect(bolum.locator('.grup.yalniz-burada .acilir-dugme')).toContainText('Yalnızca bu bilgisayarda · 1 kayıt');
    await expect(bolum.locator('.grup.yalniz-burada input[type="checkbox"]')).toHaveCount(0);
    await tasmaYok(p);

    // Kapalı Yeni grubunu tümden bırak: alt çubuk düşer, tür kutusu "kısmi".
    await yeniKutusu.uncheck();
    await expect(sayac).toHaveText(`Seçili: ${toplam - YENI_SAYISI} / ${toplam} kayıt`);
    await expect(yeniDugmesi).toContainText('· 0 seçili');
    await tam(yeniKutusu, false);
    await kismi(turKutusu);

    // Açınca satırlar işaretsiz; ilk 200 çizilir, "Daha fazla göster" kalanı getirir.
    await yeniDugmesi.click();
    await expect(yeniDugmesi).toHaveAttribute('aria-expanded', 'true');
    const satirKutulari = yeni.locator('li input[type="checkbox"]');
    await expect(satirKutulari).toHaveCount(200);
    for (const k of (await satirKutulari.all()).slice(0, 5)) await expect(k).not.toBeChecked();
    const dahaFazla = yeni.getByRole('button', { name: /^Daha fazla göster/ });
    await expect(dahaFazla).toHaveText(`Daha fazla göster (${YENI_SAYISI - 200} kayıt daha, kalan ${YENI_SAYISI - 200})`);
    await dahaFazla.click();
    await expect(satirKutulari).toHaveCount(YENI_SAYISI);
    await expect(dahaFazla).toBeHidden();
    await expect(satirKutulari.nth(200)).toBeFocused();
    await expect(satirKutulari.nth(YENI_SAYISI - 1)).not.toBeChecked();
    await tasmaYok(p);

    // Bir satırı işaretle: grup "kısmi", sayılar güncel.
    await yeni.getByRole('checkbox', { name: 'Yeni satır 007 (yeni)' }).check();
    await kismi(yeniKutusu);
    await expect(yeniDugmesi).toContainText('· 1 seçili');
    await expect(turDugmesi).toContainText('· 2 seçili');
    await expect(sayac).toHaveText(`Seçili: ${toplam - YENI_SAYISI + 1} / ${toplam} kayıt`);

    // Değişen grubunda alan farkı aynen.
    const degisen = bolum.locator('.grup.degisen');
    await degisen.locator('.acilir-dugme').click();
    await expect(degisen.getByRole('checkbox', { name: 'Satır 1 (değişen)' })).toBeChecked();
    await degisen.getByText('Farkları göster').click();
    await expect(degisen.locator('.fark-tablosu tr.degisti')).not.toHaveCount(0);

    // Alt çubuk: Hiçbirini seçme / Tümünü seç açık satırlara ve başlıklara yansır.
    await p.getByRole('button', { name: 'Hiçbirini seçme' }).click();
    await expect(sayac).toHaveText(`Seçili: 0 / ${toplam} kayıt`);
    await tam(turKutusu, false);
    await expect(satirKutulari.nth(6)).not.toBeChecked();
    await p.getByRole('button', { name: 'Tümünü seç', exact: true }).click();
    await expect(sayac).toHaveText(`Seçili: ${toplam} / ${toplam} kayıt`);
    await tam(yeniKutusu, true);
    await expect(satirKutulari.nth(100)).toBeChecked();

    // Yeniden: yalnız 1 yeni + 1 değişen seçili → uygulanınca yalnız onlar yazılır.
    await yeniKutusu.uncheck();
    await yeni.getByRole('checkbox', { name: 'Yeni satır 007 (yeni)' }).check();
    await expect(sayac).toHaveText(`Seçili: ${toplam - YENI_SAYISI + 1} / ${toplam} kayıt`);
    await tasmaYok(p);
    await p.getByRole('button', { name: 'Seçilenleri uygula' }).click();
    await expect(p.getByRole('heading', { name: 'İçe aktarma tamamlandı' })).toBeVisible({ timeout: 60_000 });
    const ozetSatiri = p.locator('.ozet-tablosu tbody tr').filter({ has: p.getByRole('rowheader', { name: 'Test verisi profilleri' }) });
    await expect(ozetSatiri.locator('td')).toHaveText(['1', '1', '0']);
    await tasmaYok(p);
    await baglam.close();
    expect(hatalar, 'sayfa hataları').toEqual([]);
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    klasor.temizle();
  }
});
