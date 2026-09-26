// KORUMA TESTLERİ — Ayarlar > Test verisi > Kayıtlar: test verisi türleri ("kayıt grupları") ve bağlam profilleri (ör. Acente)
// tek ekranda; grup seçilir, kayıtlar tablo (gizli değerler maskeli), kayıt formu, Excel / CSV'den kayıt yükleme (yeni + güncelleme).
// Eski "Bağlam profilleri" adresi Kayıtlar'a yönlenir. Yalnız yerel sunucu.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;

test.describe('test verisi kayıtları', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kayit-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let turId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kayitlar-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Kayıt Projesi' })).proje.id);
    await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true });
    turId = String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Özel kişi', alanlar: [
      { ad: 'tcKimlikNo', etiket: 'T.C. kimlik no', hassas: true }, { ad: 'dogumTarihi', etiket: 'Doğum tarihi', hassas: false }, { ad: 'cepTelefonu', etiket: 'Cep telefonu', hassas: false }] })).id);
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad: 'tc1', degerler: { tcKimlikNo: '10000000146', dogumTarihi: '1985-04-12', cepTelefonu: '5321112233' } });
    await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Acente', ad: 'varsayilan', alanlar: { acentePartaji: '90002' }, ortamId: null });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('gruplar (kayıt + bağlam) tek ekranda; gizli değer maskeli; formdan kayıt eklenir; Excel / CSV ile yeni + güncelleme', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    // Eski "Bağlam profilleri" adresi Test verisi > Kayıtlar'a yönlenir; menüde ayrı bölüm yok.
    await page.goto('/#/ayarlar/baglam');
    await expect(page.getByRole('heading', { name: 'Test verisi', level: 2 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Kayıtlar' })).toHaveAttribute('aria-selected', 'true');
    const gruplar = page.getByRole('tablist', { name: 'Kayıt grupları' });
    await expect(gruplar.getByRole('tab', { name: /^Özel kişi/ })).toBeVisible();
    await expect(gruplar.getByRole('tab', { name: /^Acente/ })).toBeVisible();
    // Kişi grubu: tc1 satırı, T.C. maskeli, doğum tarihi açık.
    await gruplar.getByRole('tab', { name: /^Özel kişi/ }).click();
    const tc1 = page.locator('tr[data-kayit="tc1"]');
    await expect(tc1).toContainText('••••');
    await expect(tc1).toContainText('1985-04-12');
    await expect(tc1).not.toContainText('10000000146');
    // Formdan yeni kayıt.
    await page.getByRole('button', { name: 'Kayıt ekle' }).click();
    await page.getByLabel('Kayıt adı').fill('tc2');
    await page.getByLabel('Doğum tarihi').fill('1990-09-01');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('tr[data-kayit="tc2"]')).toContainText('1990-09-01');
    // CSV: tc2 güncellenir (telefon), tc3 eklenir; tanınmayan sütun bildirilir.
    const csv = join(klasor, 'kisiler.csv');
    writeFileSync(csv, 'Ad;T.C. kimlik no;Doğum tarihi;Cep telefonu;Uydurma\ntc2;;1990-09-01;5334445566;x\ntc3;20000000046;1979-02-03;5327778899;y\n');
    await page.getByLabel('Excel dosyası').setInputFiles(csv);
    await expect(page.getByRole('status').filter({ hasText: 'kayıt okundu' })).toContainText('2 kayıt okundu · 1 yeni, 1 güncellenecek');
    await expect(page.getByRole('status').filter({ hasText: 'kayıt okundu' })).toContainText('Tanınmayan sütunlar (alınmaz): Uydurma');
    await page.getByRole('button', { name: 'Yükle (2)' }).click();
    await expect(page.locator('tr[data-kayit="tc3"]')).toContainText('1979-02-03');
    await expect(page.locator('tr[data-kayit="tc2"]')).toContainText('5334445566');
    const { profiller } = await basarili(`/platform/test-verisi-profilleri?projeId=${projeId}`);
    expect((profiller as Nesne[]).filter((p) => p.turId === turId).map((p) => p.ad).sort()).toEqual(['tc1', 'tc2', 'tc3']);
    const tc3 = (profiller as Nesne[]).find((p) => p.ad === 'tc3');
    expect(tc3?.degerler.tcKimlikNo).toMatchObject({ dolu: true });
    // Bağlam grubu (Acente): kayıt tablosu ve formu.
    await gruplar.getByRole('tab', { name: /^Acente/ }).click();
    await expect(page.locator('tr[data-kayit="varsayilan"]')).toContainText('90002');
    await page.getByRole('button', { name: 'Kayıt ekle' }).click();
    await page.getByLabel('Kayıt adı').fill('Acente2');
    await page.getByLabel('acentePartaji değeri').fill('90003');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('tr[data-kayit="Acente2"]')).toContainText('90003');
    const bp = await basarili(`/platform/baglam-profilleri?projeId=${projeId}`);
    expect((bp.profiller as Nesne[]).find((p) => p.ad === 'Acente2')).toMatchObject({ tur: 'Acente', alanlar: { acentePartaji: '90003' } });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
