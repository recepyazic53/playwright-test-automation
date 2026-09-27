// KORUMA TESTLERİ — arayüz: SoapUI önizlemesi (yeni bağlama modeli: Özellikler, "Test verisine yazılacaklar", "Hesaplama kuralı
// önerileri", "Kurulacak bağlar"; kullanıcı seçer) ve Parametreler sekmesindeki "Yeni bağlama modeline geçir" (önizleme + onay).
// Yalnız 127.0.0.1'deki SAHTE SOAP sunucusu ve geçici veritabanı; SoapUI dosyası SENTETİKTİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { SAHTE_PAROLA, SAHTE_TC, SOAPUI, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test.describe('SoapUI önizlemesi ve eski parametre dönüşümü (arayüz)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-SoapUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'soapui-arayuz-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'SoapUI Projesi' })).proje.id);
    await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true });
    // Eski eşleme (geriye uyum): MUSTERI_TC → Kişi.tcKimlikNo (rol musteri).
    await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Kişi', alanlar: [{ ad: 'tcKimlikNo', hassas: false, servisParametreleri: [{ ad: 'MUSTERI_TC', rol: 'musteri' }] }] });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('önizleme bölümleri, seçimler ve aktarım; ardından eski parametre kartı ile yeni modele geçiş', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/servisler/yeni');
    await page.getByRole('tab', { name: 'SoapUI dosyasından' }).click();
    await page.getByLabel('SoapUI proje dosyası').setInputFiles({ name: 'proje.xml', mimeType: 'text/xml', buffer: Buffer.from(SOAPUI) });
    await page.getByRole('button', { name: 'Seç' }).click();

    const ozellikler = page.getByRole('table', { name: 'Özellikler' });
    await expect(ozellikler).toBeVisible();
    await expect(page.locator('body')).not.toContainText(SAHTE_PAROLA);
    // Varsayılan öneriler: parola gizli (değeri gösterilmez), tarih hesaplama kuralı, diğerleri tabloya.
    await expect(page.getByLabel('PASSWORD nereden dolsun')).toHaveValue('tablo');
    await expect(page.getByLabel('PASSWORD gizli')).toBeChecked();
    await expect(page.getByLabel('BEGIN_DATE nereden dolsun')).toHaveValue('kural');
    await expect(ozellikler.getByRole('row').filter({ hasText: 'MUSTERI_TC' })).toContainText('eski eşleme: Kişi.tcKimlikNo (musteri)');
    const yazilacak = page.getByRole('region', { name: 'Test verisine yazılacaklar' });
    await expect(yazilacak).toContainText('PASSWORD (gizli sütun): değer yazılmaz (boş kalır)');
    await expect(page.getByRole('region', { name: 'Hesaplama kuralı önerileri' })).toContainText('BEGIN_DATE');
    const baglar = page.getByRole('region', { name: 'Kurulacak bağlar' });
    await expect(baglar.getByLabel('Bağ kur: Teklif Input/Channel')).toBeChecked();
    // Kullanıcı seçer: şifreli kaydet → özet değişir; MUSTERI_TC gövdede kalsın → bağı kurulmaz.
    await page.getByLabel('PASSWORD değerini şifreli kaydet').check();
    await expect(yazilacak).toContainText('PASSWORD (gizli sütun): değer şifreli yazılır');
    await page.getByLabel('MUSTERI_TC nereden dolsun').selectOption('birak');
    await expect(baglar.getByLabel('Bağ kur: Teklif Input/CitizenshipNumber')).toBeDisabled();
    await expect(yazilacak).not.toContainText('MUSTERI_TC');
    await baglar.getByLabel('Bağ kur: Teklif Input/Username').uncheck();

    // Yeni servis: erişim kontrolü (onaylı; yalnız sahte sunucu) → Aktar.
    await page.getByRole('button', { name: 'Erişimi kontrol et' }).click();
    await page.getByRole('dialog', { name: 'TEST ortamına istek atılsın mı?' }).getByRole('button', { name: 'İstek at' }).click();
    await expect(page.getByText(/Erişildi \(200/)).toBeVisible();
    await page.getByRole('button', { name: 'Aktar' }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[^/]+\/(senaryolar|parametreler)$/);
    const servisId = decodeURIComponent(page.url().split('/servisler/s/')[1].split('/')[0]);
    const d = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    expect(Object.keys(d.servis.ayarlar.alanBaglari.Teklif).sort()).toEqual(['Input/BeginDate', 'Input/Channel', 'Input/EndDate', 'Input/Password']);
    expect(d.servis.ayarlar.tarihKurallari).toMatchObject({ BEGIN_DATE: "bugun|yyyy-MM-dd'T'HH:mm:ss" });
    const gecerli = (d.senaryolar as Nesne[]).find((x) => x.baslik === 'Geçerli kimlik') as Nesne;
    expect(gecerli.icerik.govde).toContain('<Password>${SoapUI Takim.PASSWORD}</Password><CitizenshipNumber>${MUSTERI_TC}</CitizenshipNumber>');

    // Eski eşleme için servis profil (satır) seçimi → Parametreler'de "Yeni bağlama modeline geçir" kartı.
    const turler = await basarili(`/platform/test-verisi-turleri?projeId=${projeId}`);
    const turId = String(turler.turler.find((x: Nesne) => x.ad === 'Kişi').id);
    const profil = await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad: 'k1', degerler: { tcKimlikNo: SAHTE_TC } });
    await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: d.servis.anahtar, ad: d.servis.ad, yol: d.servis.ayarlar.yol, veriProfilleri: { [`${turId}:musteri`]: profil.profil.id } });
    await page.goto(`/#/servisler/s/${encodeURIComponent(servisId)}/parametreler`);
    const kart = page.locator('.eski-parametre-karti');
    await expect(kart).toContainText('MUSTERI_TC');
    await kart.getByText('Ne değişecek?').click();
    await expect(kart).toContainText('${MUSTERI_TC} → ${Kişi[musteri].tcKimlikNo} · satır: k1');
    await kart.getByRole('button', { name: 'Yeni bağlama modeline geçir…' }).click();
    const onay = page.getByRole('dialog', { name: 'Yeni bağlama modeline geçirilsin mi?' });
    // Vazgeç: hiçbir şey değişmez.
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    expect(((await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar as Nesne[]).find((x) => x.baslik === 'Geçerli kimlik')?.icerik.govde).toContain('${MUSTERI_TC}');
    await kart.getByRole('button', { name: 'Yeni bağlama modeline geçir…' }).click();
    await page.getByRole('dialog', { name: 'Yeni bağlama modeline geçirilsin mi?' }).getByRole('button', { name: 'Geçir' }).click();
    await expect(page.locator('.eski-parametre-karti')).toHaveCount(0);
    const sonra = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar as Nesne[];
    expect(sonra.find((x) => x.baslik === 'Geçerli kimlik')?.icerik.govde).toContain('<CitizenshipNumber>${Kişi[musteri].tcKimlikNo}</CitizenshipNumber>');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
