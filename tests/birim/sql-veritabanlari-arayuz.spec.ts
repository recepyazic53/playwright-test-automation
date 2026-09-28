// KORUMA TESTLERİ — Veritabanları arayüzü (Ayarlar > Entegrasyonlar > Veritabanları): tablo (satır = veritabanı, sütun = ortam,
// canlı sütun işaretli), ekle / düzenle / sil (kullanan SQL adımları onayda listelenir), bağlantı silmede "eşli veritabanları"
// uyarısı; servis akışı SQL adımında seçim (önce Veritabanları, sonra doğrudan bağlantı; "Veritabanına çevir…"); koşu diyaloğunda
// eşlemesi olmayan veritabanı uyarısı. Masaüstü + 390px ekran görüntüsü, sayfa yatay taşmaz. Yalnız yerel Nöbetçi; hiçbir
// veritabanına bağlanılmaz (Dene / koşu başlatılmaz), adresler belgeleme aralığında (192.0.2.x).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;

/** Tam sayfa ekran görüntüsü (test çıktı klasörüne; rapora eklenir). */
async function ekranGoruntusu(page: Page, yol: string): Promise<string> {
  await page.screenshot({ path: yol, fullPage: true });
  return yol;
}

/** Sayfa yatay taşmıyor mu (belge genişliği görünür alanı aşmaz). */
async function tasmaYok(page: Page): Promise<void> {
  const o = await page.evaluate(() => {
    const gorunen = document.documentElement.clientWidth;
    // Ana içerik (üst çubuk hariç): sağ kenarı görünen alanı aşan öğe olmamalı. Kendi kaydırma kutusundaki öğeler (tablo,
    // yatay kayan sekme çubuğu) sayılmaz: kutu kayar, sayfa kaymaz.
    const ana = document.querySelector('main');
    const kaydirmaIcinde = (e: Element) => {
      for (let p = e.parentElement; p && p !== ana; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const tasanlar = [...(ana?.querySelectorAll('*') ?? [])].filter((e) => !kaydirmaIcinde(e) && e.getBoundingClientRect().right > gorunen + 0.5)
      .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).replace(/\s+/g, '.')}`);
    return { tasanlar, gorunen };
  });
  expect(o.tasanlar, `görünen ${o.gorunen}px; taşan: ${o.tasanlar.join(', ')}`).toEqual([]);
}

test.describe('veritabanları arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-VtUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let TEST = '';
  let CANLI = '';
  let bTest = '';
  let bCanli = '';
  let servisId = '';
  let akisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'vt-arayuz-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Veritabanı Arayüz Projesi' })).proje.id);
    TEST = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
    CANLI = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9', canli: true })).ortam.id);
    // Bağlantılar yalnız kaydedilir (Dene yok → hiçbir istek gitmez).
    const bag = async (ad: string, sunucu: string, ortamIdleri: string[]) => String((await basarili('/platform/entegrasyon/kaydet', {
      projeId, tur: 'veritabani', ad, ortamIdleri, alanlar: { surucu: 'postgres', sunucu, veritabani: 'uyg', kullanici: 'okur', parola: 'gizli-parola-1' }
    })).baglanti.id);
    bTest = await bag('kayit-TEST', '192.0.2.10', [TEST]);
    bCanli = await bag('kayit-CANLI', '192.0.2.20', [CANLI]);
    const s = await basarili('/platform/servis/rest/kaydet', { projeId, anahtar: 'kayit', ad: 'Kayıt servisi', uclar: [{ ad: 'kayit', metot: 'GET', yol: '/kayit' }] });
    servisId = String(s.id ?? s.servis?.id);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('Ayarlar > Entegrasyonlar > Veritabanları: ekle (ortam başına bağlantı), tablo, canlı sütun; 390px taşma yok', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/entegrasyonlar');
    const bolum = page.getByRole('region', { name: /Veritabanları/ });
    await expect(bolum.getByText('Henüz veritabanı yok.')).toBeVisible();
    await bolum.getByRole('button', { name: 'Veritabanı ekle' }).click();
    const form = page.getByRole('group', { name: 'Yeni veritabanı' });
    await form.getByLabel('Ad').fill('Kayıt veritabanı');
    // Ortam kısıtı: kayit-TEST yalnız TEST'e açık → CANLI listesinde seçilemez.
    await expect(form.getByLabel('CANLI ortamında bağlantı').locator('option', { hasText: 'kayit-TEST' })).toBeDisabled();
    await form.getByLabel('TEST ortamında bağlantı').selectOption({ label: 'kayit-TEST (postgres)' });
    await form.getByLabel('CANLI ortamında bağlantı').selectOption({ label: 'kayit-CANLI (postgres)' });
    await testInfo.attach('veritabani-formu-masaustu', { path: await ekranGoruntusu(page, testInfo.outputPath('veritabani-formu-masaustu.png')), contentType: 'image/png' });
    await form.getByRole('button', { name: 'Kaydet' }).click();
    const tablo = page.getByRole('table', { name: 'Veritabanları ve ortam eşlemeleri' });
    await expect(tablo).toBeVisible();
    await expect(tablo.getByRole('columnheader', { name: /CANLI/ })).toContainText('Canlı');
    const satir = tablo.getByRole('row', { name: /Kayıt veritabanı/ });
    await expect(satir.locator('td[data-ortam="TEST"]')).toHaveText('kayit-TEST');
    await expect(satir.locator('td[data-ortam="CANLI"]')).toHaveText('kayit-CANLI');
    const { veritabanlari } = await basarili(`/platform/sql/veritabanlari?projeId=${projeId}`);
    expect(veritabanlari).toMatchObject([{ ad: 'Kayıt veritabanı', eslemeler: { [TEST]: bTest, [CANLI]: bCanli }, adimSayisi: 0 }]);
    await testInfo.attach('veritabanlari-masaustu', { path: await ekranGoruntusu(page, testInfo.outputPath('veritabanlari-masaustu.png')), contentType: 'image/png' });
    await tasmaYok(page);
    // 390px: tablo kendi içinde kayar, sayfa taşmaz; düzenleme formu da taşmaz.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(tablo).toBeVisible();
    await tasmaYok(page);
    await satir.getByRole('button', { name: 'Kayıt veritabanı: düzenle' }).click();
    await expect(page.getByRole('group', { name: 'Kayıt veritabanı: düzenle' })).toBeVisible();
    await tasmaYok(page);
    await testInfo.attach('veritabanlari-390', { path: await ekranGoruntusu(page, testInfo.outputPath('veritabanlari-390.png')), contentType: 'image/png' });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('SQL adımı (servis akışı): önce Veritabanları; eski adımda "Veritabanına çevir…" eşli veritabanını önerir; kaydedilen veritabaniId', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const { veritabanlari } = await basarili(`/platform/sql/veritabanlari?projeId=${projeId}`);
    const vtId = String(veritabanlari[0].id);
    // Eski (doğrudan bağlantılı) SQL adımıyla kayıtlı akış.
    akisId = String((await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Kayıt kontrolü', tur: 'akis', kapsam: 'ikisi', icerik: { adimlar: [
      { ad: 'Kayıt yazıldı', tur: 'sql', sql: { baglantiId: bTest, sql: 'SELECT durum FROM kayit', beklenen: { tur: 'bosDegil' } } }] } })).id);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}/akislar/${akisId}`);
    await page.locator('[data-adim="0"]').click();
    const secim = page.getByLabel('1. adım Veritabanı', { exact: true });
    await expect(secim).toBeVisible();
    // Seçenek sırası: önce Veritabanları (önerilen), sonra Doğrudan bağlantı (eski).
    const gruplar = await secim.locator('optgroup').evaluateAll((l) => l.map((g) => [(g as HTMLOptGroupElement).label, [...(g as HTMLOptGroupElement).children].map((o) => o.textContent)]));
    expect(gruplar).toEqual([
      ['Veritabanları (önerilen)', ['Kayıt veritabanı']],
      ['Doğrudan bağlantı (eski)', ['kayit-CANLI (PostgreSQL, yalnız okuma)', 'kayit-TEST (PostgreSQL, yalnız okuma)']]
    ]);
    await expect(secim).toHaveValue(`b:${bTest}`);
    await page.getByRole('button', { name: 'Veritabanına çevir…' }).click();
    await page.getByRole('button', { name: '→ Kayıt veritabanı (TEST)' }).click();
    await expect(secim).toHaveValue(`v:${vtId}`);
    await expect(page.getByRole('list', { name: '1. adım Ortam eşlemeleri' })).toContainText('TEST → kayit-TEST');
    await expect(page.getByRole('list', { name: '1. adım Ortam eşlemeleri' })).toContainText('CANLI → kayit-CANLI');
    await testInfo.attach('sql-adimi-veritabani', { path: await ekranGoruntusu(page, testInfo.outputPath('sql-adimi-veritabani.png')), contentType: 'image/png' });
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('✓ Kaydedildi')).toBeVisible();
    const { akislar } = await basarili(`/platform/servis-akislari?projeId=${projeId}`);
    const kayit = (akislar as Nesne[]).find((a) => a.id === akisId);
    const tam = kayit?.icerik ?? (await basarili(`/platform/servis-akisi?projeId=${projeId}&id=${akisId}`)).akis?.icerik;
    expect(tam.adimlar[0].sql).toEqual({ veritabaniId: vtId, sql: 'SELECT durum FROM kayit', beklenen: { tur: 'bosDegil' } });
    // 390px: SQL adımı formu taşmaz.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('[data-adim="0"]').click();
    await tasmaYok(page);
    await testInfo.attach('sql-adimi-390', { path: await ekranGoruntusu(page, testInfo.outputPath('sql-adimi-390.png')), contentType: 'image/png' });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('silme: veritabanını kullanan SQL adımı onayda listelenir; bağlantı silinirken eşli veritabanları gösterilir (vazgeçilir)', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    await page.goto('/#/ayarlar/entegrasyonlar');
    const satir = page.getByRole('table', { name: 'Veritabanları ve ortam eşlemeleri' }).getByRole('row', { name: /Kayıt veritabanı/ });
    await expect(satir).toContainText('1 SQL adımında');
    await satir.getByRole('button', { name: 'Kayıt veritabanı: sil' }).click();
    const onay = page.getByRole('dialog');
    await expect(onay).toContainText('1 SQL adımı kullanıyor');
    await expect(onay).toContainText('Kayıt kontrolü (servis akışı) › Kayıt yazıldı');
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    // Bağlantı silme: eşli olduğu veritabanı ve ortamı listelenir.
    await page.getByRole('button', { name: 'kayit-CANLI: sil' }).click();
    const onay2 = page.getByRole('dialog');
    await expect(onay2).toContainText('Veritabanı “Kayıt veritabanı”: CANLI ortamında eşli');
    await onay2.getByRole('button', { name: 'Vazgeç' }).click();
    // Onaysız sunucu çağrısı da reddedilir.
    const y = await api('/platform/sql/veritabani/sil', { projeId, id: String((await basarili(`/platform/sql/veritabanlari?projeId=${projeId}`)).veritabanlari[0].id) });
    expect(y.basarili).toBe(false);
    expect(String(y.mesaj)).toContain('şu SQL adımlarında kullanılıyor');
    await baglam.close();
  });

  test('koşu diyaloğu: seçilen ortamda eşlemesi olmayan veritabanını kullanan senaryo uyarı olarak listelenir (koşu başlatılmaz)', async () => {
    // TEST eşlemesini kaldır: veritabanı yalnız CANLI'da tanımlı.
    const { veritabanlari } = await basarili(`/platform/sql/veritabanlari?projeId=${projeId}`);
    await basarili('/platform/sql/veritabani/kaydet', { projeId, id: veritabanlari[0].id, ad: 'Kayıt veritabanı', eslemeler: { [TEST]: '', [CANLI]: bCanli } });
    // Akış senaryosu bir operasyon adımı ister: akışa (koşulmayacak) bir operasyon adımı eklenir, SQL adımı aynen kalır.
    const { akislar } = await basarili(`/platform/servis-akislari?projeId=${projeId}`);
    const sqlAdimi = (akislar as Nesne[]).find((a) => a.id === akisId)?.icerik?.adimlar?.[0];
    expect(sqlAdimi?.sql?.veritabaniId).toBe(veritabanlari[0].id);
    await basarili('/platform/servis-akisi/kaydet', { projeId, id: akisId, baslik: 'Kayıt kontrolü', tur: 'akis', kapsam: 'ikisi', icerik: { adimlar: [
      { id: 'op1', ad: 'Kayıt oku', tur: 'operasyon', servisId, operasyon: 'kayit' }, sqlAdimi] } });
    await basarili('/platform/servis/akis-senaryosu/kaydet', { projeId, servisId, baslik: 'Kayıt akış senaryosu', icerik: { tur: 'akis', akisId, adimlar: {} } });
    const denetim = await basarili(`/platform/sql/kosu-denetimi?projeId=${projeId}`);
    expect(Object.values(denetim.servisSenaryolari)).toEqual([[veritabanlari[0].id]]);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    await page.goto(`/#/servisler/s/${servisId}`);
    await page.getByRole('button', { name: 'Koşuyu başlat' }).click();
    const diyalog = page.getByRole('dialog');
    await diyalog.getByLabel('Ortam').selectOption({ label: 'TEST' });
    await expect(diyalog).toContainText('1 senaryoda SQL adımı TEST ortamında çalışmaz');
    await expect(diyalog).toContainText('“Kayıt veritabanı” için TEST ortamında bağlantı tanımlı değil');
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    await baglam.close();
  });
});
