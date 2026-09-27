// KORUMA TESTİ — akış senaryosu arayüzü: "Senaryo ekle"de tür seçimi (Tek istek / Akış); akış seçili açılınca her operasyon
// adımı ayrı bölüm, akıştan gelen alan kilitli ("1. adımdan gelir") ve sorulmaz; kayıt; senaryo akışın geçtiği öteki serviste
// "akış: <ad>" rozetiyle listelenir. Yalnız yerel Nöbetçi + 127.0.0.1 sahte SOAP sunucusu (WSDL alınır; senaryo koşulmaz).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { sahteSoapSunucusu } from './servis-fikstur';

type Nesne = Record<string, any>;

test('akış senaryosu formu: adım bölümleri, kilitli bağ, kayıt ve öteki serviste listelenme', async () => {
  test.setTimeout(120_000);
  const PAROLA = 'Gecici-AkisSenaryo-UI-1';
  const klasor = mkdtempSync(join(tmpdir(), 'akis-sen-ui-'));
  const soap = await sahteSoapSunucusu();
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  const nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const tarayici = await chromium.launch();
  try {
    await api('/platform/kasa/ac', { parola: PAROLA });
    const projeId = String((await api('/platform/proje/kaydet', { ad: 'Akış senaryosu arayüzü' })).proje.id);
    const ortamId = String((await api('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true })).ortam.id);
    const servis = async (anahtar: string, ad: string) => {
      const e = await api('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
      const id = String((await api('/platform/servis/kaydet', { projeId, anahtar, ad, yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
      await api('/platform/servis/sema/yenile', { projeId, servisId: id, ortamId });
      return id;
    };
    const A = await servis('teklif', 'TeklifServisi');
    const B = await servis('onay', 'OnayServisi');
    const akis = await api('/platform/servis-akisi/kaydet', { projeId, baslik: 'Teklif → Onay', tur: 'akis', icerik: { adimlar: [
      { id: 'teklif', ad: 'Teklif', tur: 'operasyon', servisId: A, operasyon: 'Teklif', okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] },
      { id: 'onay', ad: 'Onay', tur: 'operasyon', servisId: B, operasyon: 'Onayla', baglar: { TeklifNo: '${akis:Token}' } }
    ] } });
    expect(akis.basarili).toBe(true);
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${A}/senaryo/yeni?akis=${akis.id}`);
    await expect(page.getByRole('radio', { name: 'Akış' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('1. TeklifServisi · Teklif')).toBeVisible();
    await expect(page.getByText('2. OnayServisi · Onayla')).toBeVisible();
    await expect(page.getByText('1. adımdan gelir (${akis:Token})')).toBeVisible();
    await expect(page.getByLabel('2. adım TeklifNo değer kaynağı')).toHaveCount(0);   // kilitli: sorulmaz
    await page.getByLabel('Başlık').fill('Teklif ve onay');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/\/senaryo\/[A-Za-z0-9-]+$/);
    await page.goto(`/#/servisler/s/${B}`);
    await expect(page.getByRole('row', { name: /Teklif ve onay/ })).toContainText('akış: Teklif → Onay');
    // Tür seçimi: "Tek istek" mevcut düzenleyiciyi açar.
    await page.goto(`/#/servisler/s/${A}/senaryo/yeni`);
    await expect(page.getByRole('radio', { name: 'Tek istek (operasyon)' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Operasyon')).toBeVisible();
    expect(hatalar).toEqual([]);
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    await soap.kapat();
    rmSync(klasor, { recursive: true, force: true });
  }
});
