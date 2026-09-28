// KORUMA TESTLERİ — SERVİS senaryolarında tablodan çoklu veri koşusu ve başarısızları tekrar çalıştırma (ekran senaryolarıyla aynı
// altyapı: tablolar/veri-kosulari.mjs). Yalnız 127.0.0.1'deki sahte SOAP sunucusu; ayrı Nöbetçi, geçici veritabanı. Değerler SAHTEDİR.
//  · "Uyan tüm satırlar": her satır ayrı çalıştırma ("Senaryo [satır]"), aynı servis koşusunda; gizli sütun değeri kayıtta yok.
//  · Üst sınır aşılırsa iş başlatılmaz; geçersiz çalıştırma biçimi kaydedilmez.
//  · Başarısızları tekrar çalıştır: yalnız kalan satır, o koşudaki satırla; "Tekrar:" bağı; arayüzde düğme ve biçim seçimi (390 px taşma yok).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test.describe('servis senaryosu: tablodan çoklu veri koşusu ve başarısızları tekrar çalıştırma', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-SVeri-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let kisiId = '';
  let senaryoId = '';
  let ilkKosu = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;
  /** İşi başlatır ve bitene kadar bekler. */
  const isKos = async (govde: Nesne) => {
    const { is } = await basarili('/platform/servis/is/baslat', { projeId, servisId, ortamId, ...govde });
    let son = is as Nesne;
    await expect.poll(async () => { son = (await api(`/platform/servis/is?projeId=${projeId}&id=${String(is.id)}`)).is as Nesne; return son.bitti; }, { timeout: 30_000 }).toBe(true);
    return son;
  };
  const sonKosu = async () => {
    const ozet = await api(`/platform/servis-sonuclari?projeId=${projeId}&servisId=${servisId}`);
    const kosular = (ozet.kosular ?? ozet.kosuGecmisi ?? []) as Nesne[];
    return kosular.slice().sort((a, b) => String(b.baslangic).localeCompare(String(a.baslangic)))[0];
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-veri-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Servis Veri Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    // "Kişi": kisi-a geçerli kimlik (OK), kisi-b geçersiz (HATA); gizli "Parola" sütunu kayıtta görünmemeli.
    kisiId = String((await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kişi', sutunlar: [{ ad: 'TC' }, { ad: 'Parola', gizli: true }], satirlar: [
      { ad: 'kisi-a', degerler: { TC: SAHTE_TC, Parola: 'gizli-p1' } }, { ad: 'kisi-b', degerler: { TC: '00000000000', Parola: 'gizli-p2' } }] })).tablo.id);
    senaryoId = String((await basarili('/platform/servis/senaryo/kaydet', {
      projeId, servisId, baslik: 'Sipariş', kapsam: 'test',
      icerik: { operasyon: 'Siparis', govde: zarf('<IdentityNumber>${Kişi.TC}</IdentityNumber><Password>${Kişi.Parola}</Password>'), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }],
        veriKosulari: { gruplar: { [`${kisiId}|`]: { kip: 'tumu' } } } }
    })).id);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('uyan tüm satırlar: her satır ayrı çalıştırma, aynı koşuda; gizli sütun kayıtta yok; geçersiz biçim kaydedilmez; üst sınır', async () => {
    test.setTimeout(120_000);
    const once = soap.istekler.length;
    const is = await isKos({ senaryoIdleri: [senaryoId] });
    expect((is.satirlar as Nesne[]).map((x) => [x.baslik, x.durum])).toEqual([['Sipariş [kisi-a]', 'basarili'], ['Sipariş [kisi-b]', 'basarisiz']]);
    expect(soap.istekler.slice(once).map((x) => /<IdentityNumber>(\d+)</.exec(x.govde)?.[1])).toEqual([SAHTE_TC, '00000000000']);
    const k = await sonKosu();
    ilkKosu = String(k.id);
    const detay = await api(`/platform/servis-sonuclari/kosu?projeId=${projeId}&id=${ilkKosu}`);
    const senaryolar = detay.senaryolar as Nesne[];
    expect(senaryolar.map((x) => [x.baslik, x.veriKosusu]).sort()).toEqual([['Sipariş [kisi-a]', 'kisi-a'], ['Sipariş [kisi-b]', 'kisi-b']]);
    const satir = await api(`/platform/servis-sonuclari/senaryo?projeId=${projeId}&id=${String(senaryolar[0].satirId)}`);
    expect(JSON.stringify([detay, satir])).not.toContain('gizli-p');
    // Geçersiz: seçili ama satır işaretlenmemiş.
    const kotu = await api('/platform/servis/senaryo/kaydet', { projeId, servisId, id: senaryoId, baslik: 'Sipariş', kapsam: 'test',
      icerik: { operasyon: 'Siparis', govde: zarf('<IdentityNumber>${Kişi.TC}</IdentityNumber>'), kontroller: [], veriKosulari: { gruplar: { [`${kisiId}|`]: { kip: 'secili', satirlar: [] } } } } });
    expect(kotu.basarili).toBe(false);
    expect(String(kotu.mesaj)).toContain('en az bir satır');
    // Üst sınır: 1 → iş başlatılmaz.
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { enCokVeriKosusu: 1 } });
    const red = await api('/platform/servis/is/baslat', { projeId, servisId, ortamId, senaryoIdleri: [senaryoId] });
    expect(red.basarili).toBe(false);
    expect(String(red.mesaj)).toContain('en çok 1');
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { enCokVeriKosusu: 50 } });
  });

  test('başarısızları tekrar çalıştır: yalnız kalan satır, o koşudaki satırla; "Tekrar:" bağı', async () => {
    test.setTimeout(120_000);
    const plan = (await api(`/platform/servis-sonuclari/tekrar-plani?projeId=${projeId}&id=${ilkKosu}`)).plan as Nesne;
    expect(plan.sayi).toBe(1);
    expect((plan.testler as Nesne[]).map((t) => t.baslik)).toEqual(['Sipariş [kisi-b]']);
    const once = soap.istekler.length;
    const is = await isKos({ tekrar: { kaynakKosuId: ilkKosu } });
    expect((is.satirlar as Nesne[]).map((x) => [x.baslik, x.durum])).toEqual([['Sipariş [kisi-b]', 'basarisiz']]);
    expect(soap.istekler.slice(once).map((x) => /<IdentityNumber>(\d+)</.exec(x.govde)?.[1])).toEqual(['00000000000']);
    const yeni = await sonKosu();
    expect(String(yeni.id)).not.toBe(ilkKosu);
    const detay = await api(`/platform/servis-sonuclari/kosu?projeId=${projeId}&id=${String(yeni.id)}`);
    expect((detay.kosu as Nesne).tekrarKaynagi).toBe(ilkKosu);
    // Karşılaştırma: aynı senaryonun satırları ayrı eşlenir.
    const kars = await api(`/platform/sonuclar/karsilastir?projeId=${projeId}&tur=servis&a=${ilkKosu}&b=${String(yeni.id)}`);
    const anahtarlar = ((kars.senaryolar ?? kars.satirlar ?? []) as Nesne[]).map((x) => String(x.anahtar));
    expect(anahtarlar.filter((a) => a.startsWith(`id:${senaryoId}#`))).toHaveLength(2);
  });

  test('arayüz: servis koşusunda "Başarısızları tekrar çalıştır (1)" ve senaryo formunda çalıştırma biçimi (masaüstü + 390 px)', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page: Page = await baglam.newPage();
    await page.route((u) => !u.href.startsWith(nobetci.adres), (r) => r.abort());
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const tasmaYok = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await page.goto(`/#/servisler/sonuclar/kosu/${ilkKosu}`);
    const dugme = page.getByRole('button', { name: 'Başarısızları tekrar çalıştır (1)' });
    await expect(dugme).toBeVisible({ timeout: 15_000 });
    await dugme.click();
    const plan = page.locator('dialog[open]');
    await expect(plan.getByRole('list', { name: 'Tekrar çalıştırılacak senaryolar' })).toContainText('Sipariş [kisi-b]');
    await page.screenshot({ path: test.info().outputPath('servis-tekrar.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await plan.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
    await tasmaYok();
    await plan.getByRole('button', { name: 'Vazgeç' }).click();
    await page.setViewportSize({ width: 1400, height: 1000 });
    // Senaryo formu: "Veri koşusu" bölümünde Kişi grubu "Uyan tüm satırlar".
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${senaryoId}`);
    const bicim = page.locator(`select[data-calistirma-bicimi="${kisiId}|"]`);
    await expect(bicim).toBeVisible({ timeout: 15_000 });
    await expect(bicim).toHaveValue('tumu');
    await expect(page.locator('[data-tahmini-test]')).toHaveAttribute('data-tahmini-test', '2');
    await page.screenshot({ path: test.info().outputPath('servis-formu-veri-kosusu.png'), animations: 'disabled', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await tasmaYok();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
