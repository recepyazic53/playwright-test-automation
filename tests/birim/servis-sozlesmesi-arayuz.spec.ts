// KORUMA TESTLERİ — servis sözleşmesi arayüzü: servis sayfasında "Sözleşme" sekmesi; kayıtlı WSDL şemasından önizleme → onayla kaydet;
// başarılı yanıttan TASLAK (tek örnek uyarısı) → alan alan düzenleme → değiştirme onayı (fark listesi) → kayıt; senaryo düzenleyicide
// "Yanıt sözleşmeye uymalı" (varsayılan kapalı); raporda "Sözleşme: Kaldı — N uyumsuzluk" ve yollar; akış düzenleyicide "Yetki
// hatasında (401 / 403)"; masaüstü ve 390 px'te yatay taşma yok. Yalnız yerel Nöbetçi + 127.0.0.1 sahte servis.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { GIZLI_DEGER, sahteMagaza, soapIstegi, type SahteMagaza } from './sozlesme-fikstur';

type Nesne = Record<string, any>;

async function tasmaYok(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test.describe('servis sözleşmesi arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-SozlesmeUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let magaza: SahteMagaza;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let iyiId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const sayfa = async (genislik = 1400) => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    return { page, hatalar, kapat: () => baglam.close() };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'sozlesme-arayuz-'));
    magaza = await sahteMagaza();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Sözleşme Arayüz Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: magaza.adres, varsayilan: true, riskli: false })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Magaza/servis.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'magaza', ad: 'Magaza', yol: '/Magaza/servis.asmx', erisimKimligi: e.erisimKimligi })).id);
    iyiId = String((await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'İyi yanıt', icerik: { operasyon: 'SiparisGetir', govde: soapIstegi('iyi'), kontroller: [{ tur: 'soapYaniti' }] } })).id);
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Kötü yanıt', icerik: { operasyon: 'SiparisGetir', govde: soapIstegi('kotu'), kontroller: [{ tur: 'soapYaniti' }] } });
    // Taslak için bir başarılı yanıt (Dene).
    expect((await basarili('/platform/servis/senaryo/dene', { projeId, servisId, ortamId, senaryoId: iyiId })).sonuc.durum).toBe('basarili');
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await magaza?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('Sözleşme sekmesi: WSDL önizleme → onayla kaydet; taslak düzenle → değiştirme onayı → kaydedilir', async () => {
    test.setTimeout(60_000);
    const { page, hatalar, kapat } = await sayfa();
    await page.goto(`/#/servisler/s/${servisId}`);
    await page.getByRole('tab', { name: 'Sözleşme' }).click();
    await expect(page).toHaveURL(/\/sozlesme$/);
    await expect(page.getByRole('region', { name: 'Mevcut sözleşme' })).toContainText('"SiparisGetir" için sözleşme yok');
    await expect(page.getByRole('region', { name: 'Mevcut sözleşme' })).toContainText('kapalı (varsayılan)');
    const istekSayisi = magaza.istekler.length;
    await page.getByRole('button', { name: 'Kayıtlı WSDL şemasından al' }).click();
    const onizleme = page.getByRole('region', { name: 'Sözleşme önizlemesi' });
    await expect(onizleme.getByRole('table', { name: 'Sözleşme alanları (düzenlenebilir)' })).toContainText('/SiparisGetirResponse/Kalemler/Kalem[]/Adet');
    await expect(onizleme.getByLabel('/SiparisGetirResponse/SiparisNo türü')).toHaveValue('integer');
    await expect(onizleme.getByLabel('/SiparisGetirResponse/Tutar null izinli')).toBeChecked();
    await onizleme.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(page.getByRole('region', { name: 'Mevcut sözleşme' })).toContainText('WSDL / XSD');
    await expect(page.getByRole('region', { name: 'Mevcut sözleşme' })).toContainText('Kayıtlı WSDL');
    // Taslak: başarılı yanıttan (tek örnek uyarısı), alan alan düzenlenir.
    await page.getByRole('tab', { name: 'Başarılı yanıttan taslak' }).click();
    await expect(page.getByRole('checkbox', { name: /İyi yanıt/ })).toBeChecked();
    await page.getByRole('button', { name: 'Taslak oluştur' }).click();
    const taslak = page.getByRole('region', { name: 'Sözleşme taslağı' });
    await expect(taslak).toContainText('TASLAK');
    await expect(taslak).toContainText('Tek örnekten zorunluluk kesin değildir');
    await taslak.getByLabel('/SiparisGetirResponse/SiparisNo türü').selectOption('string');
    await taslak.getByLabel('/SiparisGetirResponse/Kalemler zorunlu').uncheck();
    await taslak.getByRole('button', { name: '/SiparisGetirResponse/Tutar alanını kaldır' }).click();
    await expect(taslak.getByLabel('/SiparisGetirResponse/Tutar türü')).toHaveCount(0);
    await taslak.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    const onay = page.getByRole('dialog', { name: '"SiparisGetir" sözleşmesi değiştirilsin mi?' });
    await expect(onay).toContainText('Kaldırılan: Tutar');
    await expect(onay).toContainText('Değişen: SiparisNo');
    await onay.getByRole('button', { name: 'Değiştir' }).click();
    await expect(page.getByRole('region', { name: 'Mevcut sözleşme' })).toContainText('Başarılı yanıttan taslak');
    await page.getByText(/^Geçmiş \(2\)/).click();
    await expect(page.locator('.sozlesme-gecmisi')).toContainText('değiştirildi');
    const b = await basarili(`/platform/servis/sozlesme?projeId=${projeId}&servisId=${servisId}&operasyon=SiparisGetir`);
    expect(b.sozlesme.kaynak).toBe('taslak');
    expect(b.sozlesme.sema.properties.SiparisNo).toEqual({ type: 'string' });
    expect(b.sozlesme.sema.properties.Tutar).toBeUndefined();
    expect(b.sozlesme.sema.required).toEqual(['SiparisNo']);
    // Sekmede hiçbir servis isteği atılmadı (dosya / kayıt / taslak ağ kullanmaz).
    expect(magaza.istekler.length).toBe(istekSayisi);
    await tasmaYok(page);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('senaryo düzenleyici: "Yanıt sözleşmeye uymalı" varsayılan kapalı; açılıp kaydedilir; raporda uyumsuzluk yolları, değer yok', async () => {
    test.setTimeout(60_000);
    // Sözleşmeyi WSDL'den geri al (taslak testten sonra).
    const o = await basarili('/platform/servis/sozlesme/onizle', { projeId, servisId, operasyon: 'SiparisGetir', kaynak: 'wsdl' });
    await basarili('/platform/servis/sozlesme/kaydet', { projeId, servisId, operasyon: 'SiparisGetir', sozlesme: o.taslak, onay: true });
    const { senaryolar } = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const kotuId = senaryolar.find((x: Nesne) => x.baslik === 'Kötü yanıt').id;
    const { page, hatalar, kapat } = await sayfa();
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${kotuId}`);
    const kutu = page.getByRole('checkbox', { name: 'Yanıt sözleşmeye uymalı' });
    await expect(kutu).not.toBeChecked();
    await expect(page.locator('.sozlesme-notu')).toContainText('Sözleşmeyi gör');
    await kutu.check();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Senaryo kaydedildi.')).toBeVisible();
    const g = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    expect(g.senaryolar.find((x: Nesne) => x.id === kotuId).icerik.sozlesmeDogrula).toBe(true);
    expect(g.senaryolar.find((x: Nesne) => x.id === iyiId).icerik.sozlesmeDogrula).toBeUndefined();
    const r = await basarili('/platform/servis/senaryo/dene', { projeId, servisId, ortamId, senaryoId: kotuId });
    expect(r.sonuc.durum).toBe('basarisiz');
    await page.goto(`/#/servisler/s/${servisId}/raporlar/${r.sonuc.kosuId}`);
    const kontroller = page.locator('.kontrol-listesi').first();
    await expect(kontroller).toContainText('Sözleşme: Kaldı — 3 uyumsuzluk');
    await expect(kontroller).toContainText('/SiparisGetirResponse/SiparisNo');
    await expect(kontroller).toContainText('tam sayı bekleniyordu, metin geldi');
    await page.goto(`/#/servisler/sonuclar/senaryo/${r.sonuc.kosuId}`);
    await expect(page.locator('.servis-sonuc-kontroller').first()).toContainText('/SiparisGetirResponse/Kalemler/Kalem[2]/Adet');
    await expect(page.locator('.servis-sonuc-kontroller').first()).not.toContainText(GIZLI_DEGER);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('akış düzenleyici: oturum akışında "Yetki hatasında (401 / 403)" varsayılan "Genel ayarı kullan"; Ayarlar > Koşu seçeneği', async () => {
    test.setTimeout(60_000);
    const { page, hatalar, kapat } = await sayfa();
    await page.goto(`/#/servisler/s/${servisId}/akislar/yeni`);
    const yetki = page.getByLabel('Yetki hatasında (401 / 403)');
    await expect(yetki).toBeHidden();
    await page.getByLabel('Tür', { exact: true }).selectOption('oturum');
    await expect(yetki).toBeVisible();
    await expect(yetki).toHaveValue('genel');
    await expect(yetki.locator('option')).toHaveText(['Genel ayarı kullan (Ayarlar > Koşu)', 'Tekrar deneme', 'Token\'ı yenile, bir kez tekrar dene']);
    await page.goto('/#/ayarlar/kosu');
    const genel = page.getByLabel('Yetki hatasında (401 / 403)');
    await expect(genel).toHaveValue('tekrarYok');
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('390 px: Sözleşme sekmesi (önizleme tablosu açıkken) ve senaryo düzenleyici yatay taşmaz', async () => {
    test.setTimeout(60_000);
    const { page, hatalar, kapat } = await sayfa(390);
    await page.goto(`/#/servisler/s/${servisId}/sozlesme/SiparisGetir`);
    await expect(page.getByRole('region', { name: 'Mevcut sözleşme' })).toContainText('WSDL / XSD');
    await tasmaYok(page);
    await page.getByRole('button', { name: 'Kayıtlı WSDL şemasından al' }).click();
    await expect(page.getByRole('region', { name: 'Sözleşme önizlemesi' })).toBeVisible();
    await tasmaYok(page);
    await page.getByRole('tab', { name: 'Başarılı yanıttan taslak' }).click();
    await tasmaYok(page);
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${iyiId}`);
    await expect(page.getByRole('checkbox', { name: 'Yanıt sözleşmeye uymalı' })).toBeVisible();
    await tasmaYok(page);
    expect(hatalar).toEqual([]);
    await kapat();
  });
});
