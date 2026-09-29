// KORUMA TESTLERİ — servis senaryo önerileri arayüzü (Servisler > servis > Senaryolar > "Senaryo önerileri"): panel açılır, kapsam ve
// gerekçeli liste görünür; "Ekle" senaryoyu "Koşuda" kapalı kaydeder (beklenen: SOAP Fault, mesaj yok) ve servise HİÇBİR istek gitmez;
// "Reddet" (neden seçilerek) öneriyi gizler ve kararı servis + metot kimliğiyle kaydeder; "Önizle" düzenleyiciyi taslakla açar (kaydetmez);
// 1440 px ve 390 px'te yatay taşma yok. Yalnız yerel Nöbetçi + 127.0.0.1 sahte SOAP servisi.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { sahteSiparisServisi, siparisGovdesi, type SahteSiparisServisi } from './servis-onerileri-fikstur';

type Nesne = Record<string, any>;

async function tasmaYok(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test.describe('servis senaryo önerileri arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-OneriUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let servis: SahteSiparisServisi;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let servisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const sayfa = async (genislik = 1440) => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    return { page, hatalar, kapat: () => baglam.close() };
  };
  const senaryolar = async () => (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar as Nesne[];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-oneri-arayuz-'));
    servis = await sahteSiparisServisi();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Öneri Arayüz Projesi' })).proje.id);
    const ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: servis.adres, varsayilan: true, riskli: false })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Ornek/servis.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Ornek/servis.asmx', erisimKimligi: e.erisimKimligi })).id);
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Sipariş A', kosuyaDahil: true,
      icerik: { operasyon: 'SiparisVer', govde: siparisGovdesi({ Tutar: '500', Kod: 'ABC', Tip: 'O', Kanal: 'A', Hediye: 'true' }), kontroller: [{ tur: 'soapYaniti' }] } });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await servis?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('panel: kapsam + gerekçeli liste; Ekle (Koşuda kapalı, Hata beklenir) istek atmaz; Reddet kararı kaydeder; Önizle taslakla açar', async () => {
    test.setTimeout(90_000);
    const istekOnce = servis.istekler.length;
    const { page, hatalar, kapat } = await sayfa();
    await page.goto(`/#/servisler/s/${servisId}`);
    const panel = page.getByRole('region', { name: 'Senaryo önerileri' });
    await panel.getByRole('button', { name: 'Önerileri göster' }).click();
    await expect(panel.getByRole('group', { name: 'Kapsam' })).toContainText('Metotlar');
    await expect(panel.locator('[data-olcu="metotlar"]')).toContainText('1 / 2');
    // Tüm metotlar: senaryosu olmayan metoda başarılı akış önerisi.
    await expect(panel.getByRole('list', { name: 'Öneriler' })).toContainText('Başarılı akış: DurumSor');
    await panel.getByLabel('Metot').selectOption('SiparisVer');
    const liste = panel.getByRole('list', { name: 'Öneriler' });
    await expect(liste.locator('li.oneri')).toHaveCount(10);
    const negatif = liste.locator('li.oneri', { hasText: 'Negatif: Tutar = 1001 (üst sınır + 1)' });
    await expect(negatif).toContainText('şemada kural var (en az 1, en çok 1000, tip: tam sayı)');
    await expect(negatif).toContainText('Hata beklenir (SOAP Fault) — mesajı siz yazın');
    await negatif.getByRole('button', { name: /: ekle$/ }).click();
    await expect(page.getByText(/senaryo olarak eklendi/)).toBeVisible();
    const eklenen = (await senaryolar()).find((x) => x.baslik === 'Negatif: Tutar = 1001 (üst sınır + 1)');
    expect(eklenen).toMatchObject({ kosuyaDahil: false, kapsam: 'test' });
    expect(eklenen!.icerik.kontroller).toEqual([{ tur: 'soapHatasi' }]);
    expect(eklenen!.icerik.govde).toContain('<Tutar>1001</Tutar>');
    // Panel yenilemeden sonra açık kalır; eklenen öneri artık kapsanmış (çıkmaz).
    await expect(panel.getByRole('list', { name: 'Öneriler' })).toBeVisible();
    await expect(panel.locator('li.oneri', { hasText: 'Negatif: Tutar = 1001' })).toHaveCount(0);
    // Reddet (neden: Gereksiz): öneri gizlenir, karar servis + metotla yazılır.
    const hedef = panel.locator('li.oneri', { hasText: 'Negatif: Kod' });
    const baslik = String(await hedef.locator('.oneri-basligi').textContent());
    await hedef.getByRole('button', { name: /: reddet$/ }).click();
    await hedef.getByRole('group', { name: /red nedeni/ }).getByRole('button', { name: 'Gereksiz' }).click();
    await expect(page.getByText('Öneri reddedildi; benzerleri daha geride sıralanır.')).toBeVisible();
    await expect(panel.locator('li.oneri', { hasText: baslik })).toHaveCount(0);
    await expect(panel).toContainText('1 öneri reddedildi');
    const r = await basarili(`/platform/servis/oneriler?projeId=${projeId}&servisId=${servisId}&operasyon=SiparisVer&reddedilenler=1&ustSinir=100`);
    expect(r.oneriler.find((o: Nesne) => o.baslik === baslik)?.reddedildi).toBe(true);
    await tasmaYok(page);
    // Önizle: düzenleyici taslakla açılır, kaydedilmez.
    const sayi = (await senaryolar()).length;
    const ilk = panel.locator('li.oneri').first();
    const ilkBaslik = String(await ilk.locator('.oneri-basligi').textContent());
    await ilk.getByRole('button', { name: /: önizle$/ }).click();
    await expect(page).toHaveURL(/\/senaryo\/yeni$/);
    await expect(page.getByText('Öneriden açıldı (kaydedilmedi).')).toBeVisible();
    await expect(page.locator('input[type="text"]').first()).toHaveValue(ilkBaslik);
    await expect(page.getByLabel('Koşuya dahil')).not.toBeChecked();
    expect((await senaryolar()).length).toBe(sayi);
    await tasmaYok(page);
    // Panel ve önizleme servise hiçbir istek atmadı.
    expect(servis.istekler.length).toBe(istekOnce);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('390 px: öneri paneli (liste, kapsam eksikleri, kombinasyon alanları) ve önizleme yatay taşmaz', async () => {
    test.setTimeout(60_000);
    const { page, hatalar, kapat } = await sayfa(390);
    await page.goto(`/#/servisler/s/${servisId}`);
    const panel = page.getByRole('region', { name: 'Senaryo önerileri' });
    // Panel önceki testte açık bırakıldı (oturum durumu yalnız bu sekmede): yeni sayfada kapalı açılır.
    await panel.getByRole('button', { name: 'Önerileri göster' }).click();
    await panel.getByLabel('Metot').selectOption('SiparisVer');
    await expect(panel.getByRole('list', { name: 'Öneriler' })).toBeVisible();
    await panel.locator('[data-olcu="alanlar"]').click();
    await expect(panel.getByRole('list', { name: 'Alanlar: eksikler' })).toBeVisible();
    await expect(panel.getByRole('group', { name: 'İkili kombinasyon alanları' })).toContainText('Kanal');
    await tasmaYok(page);
    await panel.locator('li.oneri').first().getByRole('button', { name: /: önizle$/ }).click();
    await expect(page.getByText('Öneriden açıldı (kaydedilmedi).')).toBeVisible();
    await tasmaYok(page);
    expect(hatalar).toEqual([]);
    await kapat();
  });
});
