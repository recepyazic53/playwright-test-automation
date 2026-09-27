// KORUMA TESTLERİ — servis sayfasında ortam seçimi: başlıkta ortam segmenti yok; ortam yalnız koşu diyaloğunda (Koşuyu başlat,
// ▷, Seçilenleri çalıştır) sorulur; kapsamına uymayan senaryolar o ortamda nedeniyle atlanır. "Koşuda" ve "Son sonuç" ORTAM
// BAŞINA (ekran senaryolarındaki gibi); eski kayıtlar (ortam ezmesi yok) genel değerle çalışır.
// Yalnız 127.0.0.1'deki SAHTE SOAP sunucusu ve geçici veritabanı; CANLI etiketli ortamda istek atılmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test.describe('servis sayfası: ortam diyalogda, Koşuda ve Son sonuç ortam başına', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Ortam-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let canli = '';
  let servisId = '';
  const senaryolar: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const servis = () => basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
  const ortamKaydi = (x: Nesne, ortamId: string) => (x.ortamlar as Nesne[]).find((o) => o.ortamId === ortamId) as Nesne;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-ortam-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Ortam Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true })).ortam.id);
    canli = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: soap.adres, canli: true })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    const kaydet = async (baslik: string, kapsam: string) => {
      senaryolar[baslik] = String((await basarili('/platform/servis/senaryo/kaydet', {
        projeId, servisId, baslik, kapsam, icerik: { operasyon: 'Teklif', govde: '<a/>', kontroller: [{ tur: 'soapYaniti' }] }
      })).id);
    };
    await kaydet('İkisinde', 'ikisi');
    await kaydet('Yalnız test', 'test');
    await kaydet('Yalnız canlı', 'canli');
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sunucu: satır başına ortam kaydı; Koşuda ortam başına yazılır, genel değer "en az bir ortamda"; düzenleme ezmeleri korur', async () => {
    let d = await servis();
    const ikisi = () => (d.senaryolar as Nesne[]).find((x) => x.baslik === 'İkisinde') as Nesne;
    const test1 = (d.senaryolar as Nesne[]).find((x) => x.baslik === 'Yalnız test') as Nesne;
    // Eski kayıt gibi (ezme yok): tanımlı ortamlarda genel değer.
    expect(ortamKaydi(ikisi(), testOrtami)).toMatchObject({ tanimli: true, neden: '', kosuyaDahil: true, sonSonuc: null });
    expect(ortamKaydi(ikisi(), canli)).toMatchObject({ tanimli: true, kosuyaDahil: true });
    expect(ortamKaydi(test1, canli)).toMatchObject({ tanimli: false, neden: 'Senaryo yalnız TEST ortamda koşar.', kosuyaDahil: false });
    // Yalnız CANLI'da koşudan çıkar: TEST açık kalır, genel değer açık.
    await basarili('/platform/servis/senaryo/kosuya-dahil', { projeId, idler: [senaryolar['İkisinde']], dahil: false, ortamId: canli });
    d = await servis();
    expect(ikisi().kosuyaDahil).toBe(true);
    expect(ortamKaydi(ikisi(), canli).kosuyaDahil).toBe(false);
    expect(ortamKaydi(ikisi(), testOrtami).kosuyaDahil).toBe(true);
    // Senaryo düzenleyicisi (genel değer değişmeden) kaydederse ezme korunur.
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, id: senaryolar['İkisinde'], baslik: 'İkisinde', kapsam: 'ikisi', kosuyaDahil: true,
      icerik: { operasyon: 'Teklif', govde: '<a/>', kontroller: [{ tur: 'soapYaniti' }] } });
    d = await servis();
    expect(ortamKaydi(ikisi(), canli).kosuyaDahil).toBe(false);
    // Kapsamı uymayan ortamda istek atlanır (değişmez).
    expect((await basarili('/platform/servis/senaryo/kosuya-dahil', { projeId, idler: [senaryolar['Yalnız test']], dahil: false, ortamId: canli })).guncellenen).toBe(0);
    // TEST'te de çıkarılınca hiçbir ortamda koşuda değil → genel kapalı; "tüm ortamlar" ile eklenince ezmeler silinir.
    await basarili('/platform/servis/senaryo/kosuya-dahil', { projeId, idler: [senaryolar['İkisinde']], dahil: false, ortamId: testOrtami });
    d = await servis();
    expect(ikisi().kosuyaDahil).toBe(false);
    await basarili('/platform/servis/senaryo/kosuya-dahil', { projeId, idler: [senaryolar['İkisinde']], dahil: true });
    d = await servis();
    expect(ikisi().icerik.kosuOrtamlari).toBeUndefined();
    expect([ortamKaydi(ikisi(), testOrtami).kosuyaDahil, ortamKaydi(ikisi(), canli).kosuyaDahil]).toEqual([true, true]);
    // Başka ortam hatası.
    expect((await api('/platform/servis/senaryo/kosuya-dahil', { projeId, idler: [senaryolar['İkisinde']], dahil: true, ortamId: 'yok' })).basarili).toBe(false);
  });

  test('arayüz: segment yok; Koşuyu başlat ortamı diyalogda sorar, atlananları nedeniyle yazar; Son sonuç ve Koşuda ortam başına', async () => {
    test.setTimeout(60_000);
    // CANLI'da "İkisinde" koşudan çıkarılır (diyalogda sayılmamalı).
    await basarili('/platform/servis/senaryo/kosuya-dahil', { projeId, idler: [senaryolar['İkisinde']], dahil: false, ortamId: canli });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}`);
    const satir = (baslik: string) => page.locator('.servis-senaryo-tablosu tbody tr').filter({ has: page.getByRole('link', { name: baslik, exact: true }) });
    await expect(satir('İkisinde')).toBeVisible();
    // Başlıkta ortam segmenti yok.
    await expect(page.getByRole('group', { name: 'Çalıştırma ortamı' })).toHaveCount(0);
    // Kapsam ve ortam başına Koşuda anahtarları (yalnız koştuğu ortamlarda).
    await expect(satir('İkisinde').locator('td.kapsam-hucresi')).toHaveText('CANLI + TEST');
    await expect(page.getByRole('switch', { name: 'Koşuda (TEST): İkisinde' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Koşuda (CANLI): İkisinde' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Koşuda (CANLI): Yalnız test' })).toHaveCount(0);
    // Son sonuç: her koştuğu ortam için "koşulmadı".
    await expect(satir('İkisinde').locator('.son-sonuc')).toHaveCount(2);
    await expect(satir('İkisinde').getByLabel('TEST: koşulmadı')).toBeVisible();

    // Koşuyu başlat → ortam diyalogda; CANLI seçilince sayılar değişir, atlananlar nedenleriyle, riskli uyarısı.
    await page.getByRole('button', { name: 'Koşuyu başlat' }).click();
    const diyalog = page.getByRole('dialog', { name: 'Ornek — koşuyu başlat?' });
    await expect(diyalog.getByLabel('Ortam')).toHaveValue(testOrtami);
    await expect(diyalog.getByRole('list', { name: 'Çalıştırılacak senaryolar' }).getByRole('listitem')).toHaveText(['İkisinde', 'Yalnız test']);
    await expect(diyalog.locator('.atlananlar-listesi summary')).toHaveText('1 senaryo TEST ortamında atlanır');
    await diyalog.locator('.atlananlar-listesi summary').click();
    await expect(diyalog.locator('.atlananlar-listesi li')).toContainText('Yalnız canlı');
    await expect(diyalog.locator('.atlananlar-listesi li')).toContainText('Senaryo yalnız CANLI ortamda koşar.');
    await diyalog.getByLabel('Ortam').selectOption(canli);
    await expect(diyalog.getByRole('list', { name: 'Çalıştırılacak senaryolar' }).getByRole('listitem')).toHaveText(['Yalnız canlı']);
    await expect(diyalog).toContainText('1 senaryo CANLI ortamında koşu listesinde olmadığı');
    await expect(diyalog.getByRole('alert')).toContainText('Dikkat: CANLI ortamı.');
    await diyalog.getByLabel('Ortam').selectOption(testOrtami);
    const istekOnce = soap.istekler.length;
    await diyalog.getByRole('button', { name: '2 senaryoyu başlat' }).click();
    const panel = page.getByRole('region', { name: 'Servis koşu paneli' });
    await expect(panel).toContainText('Servis koşusu bitti', { timeout: 15_000 });
    await expect(panel).toContainText('TEST · 2 senaryo');
    expect(soap.istekler.length - istekOnce).toBe(2);
    await panel.getByRole('button', { name: 'Paneli kapat' }).click();
    // Son sonuç ortam başına: TEST başarılı, CANLI koşulmadı.
    await expect(satir('İkisinde').locator('.son-sonuc.basari')).toHaveAttribute('aria-label', /^TEST: Başarılı · /);
    await expect(satir('İkisinde').getByLabel('CANLI: koşulmadı')).toBeVisible();
    const d = await servis();
    const ikisi = (d.senaryolar as Nesne[]).find((x) => x.baslik === 'İkisinde') as Nesne;
    expect(ortamKaydi(ikisi, testOrtami).sonSonuc).toMatchObject({ durum: 'basarili', ortamId: testOrtami });
    expect(ortamKaydi(ikisi, canli).sonSonuc).toBeNull();

    // ▷: iki ortamda koşan senaryoda ortam sorulur (Vazgeç → istek yok).
    await satir('İkisinde').getByRole('button', { name: 'Çalıştır: İkisinde' }).click();
    const tek = page.getByRole('dialog', { name: 'Senaryoyu çalıştır?' });
    await expect(tek.getByLabel('Ortam').locator('option')).toHaveCount(2);
    await tek.getByRole('button', { name: 'Vazgeç' }).click();
    // Seçilenleri çalıştır: yalnız CANLI'da koşan senaryo TEST seçilince atlanır ve nedeni yazılır.
    await satir('Yalnız test').getByLabel('Seç: Yalnız test').check();
    await satir('Yalnız canlı').getByLabel('Seç: Yalnız canlı').check();
    await page.getByRole('button', { name: 'Seçilenleri çalıştır (2)' }).click();
    const secili = page.getByRole('dialog', { name: 'Seçilenleri çalıştır?' });
    await expect(secili.getByLabel('Ortam')).toHaveValue(testOrtami);
    await expect(secili.getByRole('list', { name: 'Çalıştırılacak senaryolar' }).getByRole('listitem')).toHaveText(['Yalnız test']);
    await expect(secili.locator('.atlananlar-listesi summary')).toHaveText('1 senaryo TEST ortamında atlanır');
    await secili.getByRole('button', { name: 'Vazgeç' }).click();
    expect(soap.istekler.length - istekOnce).toBe(2);
    // Satırdaki ortam anahtarı yalnız o ortamı değiştirir.
    await page.getByRole('switch', { name: 'Koşuda (CANLI): İkisinde' }).click();
    await expect.poll(async () => ortamKaydi(((await servis()).senaryolar as Nesne[]).find((x) => x.baslik === 'İkisinde') as Nesne, canli).kosuyaDahil).toBe(true);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
