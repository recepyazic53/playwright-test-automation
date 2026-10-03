// KORUMA TESTLERİ — sürekli öğrenme uçtan uca (sahte SOAP, yalnız 127.0.0.1): "Dene" koşuları bittikten sonra arka planda gözlem;
// başarılı koşuda elle yazılmış yeni değer → "tabloya eklensin mi" (tablodan gelen değer atlanır); hata metni alanı anıyorsa o alan
// şüpheli, diğer yeni değer zayıf; başarılı koşuda gönderilmeyen zorunlu alan → isteğe bağlı; servis sayfasında rozet, analiz
// sayfasında "Koşulardan gelenler"; Yoksay hatırlanır; kendiliğinden ekleme kapalıyken tablo değişmez, açıkken güçlü değer eklenir;
// öğrenme servise ek istek atmaz; 1440 / 390 px taşma yok. Veriler sentetik.
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
const zarf = (ic: string) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></soap:Body></soap:Envelope>`;

async function tasmaYok(page: Page) {
  const r = await page.evaluate(() => ({ belge: document.documentElement.scrollWidth, pencere: window.innerWidth }));
  expect(r.belge, `belge ${r.belge} px, pencere ${r.pencere} px`).toBeLessThanOrEqual(r.pencere);
}

test.describe('sürekli öğrenme', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Ogrenme-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let girisId = '';
  let senaryoA = '';
  let senaryoB = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const servis = async () => (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
  const gozlemSayisi = async () => ((await servis()).ayarlar.kosuOgrenmesi?.Siparis ?? []).filter((x: Nesne) => x.kaynak === 'kosu').length;
  const dene = async (senaryoId: string) => basarili('/platform/servis/senaryo/dene', { projeId, servisId, senaryoId, ortamId });
  const postSayisi = () => soap.istekler.filter((x) => x.yontem === 'POST').length;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosu-ogrenmesi-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Öğrenme Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    girisId = (await basarili('/platform/tablo/kaydet', { projeId, ad: 'Giriş', sutunlar: [{ ad: 'Kanal' }, { ad: 'Username' }],
      satirlar: [{ ad: 'g1', degerler: { Kanal: '66', Username: 'tablo-kullanici' } }] })).tablo.id;
    const erisim = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ogrenen', ad: 'Ogrenen', yol: '/Servis/ornek.asmx', erisimKimligi: erisim.erisimKimligi,
      alanBaglari: { Siparis: { 'Input/Channel': { tablo: girisId, sutun: 'Kanal' } } }, alanZorunluluklari: { Siparis: ['Input/Channel', 'Input/IsGiftWrap'] } })).id);
    // A: Channel elle (tabloda yok), Username tablodan; IsGiftWrap gönderilmez. Başarılı (kimlik doğru).
    senaryoA = String((await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Senaryo A', kapsam: 'test', icerik: {
      operasyon: 'Siparis', govde: zarf(`<Channel>77</Channel><Username>\${Giriş.Username}</Username><IdentityNumber>${SAHTE_TC}</IdentityNumber>`),
      kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] } })).id);
    // B: kimlik yanlış → yanıt "Kimlik geçersiz" (IdentityNumber şüpheli); Channel 88 zayıf.
    senaryoB = String((await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Senaryo B', kapsam: 'test', icerik: {
      operasyon: 'Siparis', govde: zarf('<Channel>88</Channel><IdentityNumber>00000000000</IdentityNumber>'),
      kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] } })).id);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('koşulardan gözlem → öneriler (değer ekle, şüpheli, isteğe bağlı); rozet, "Koşulardan gelenler", Yoksay hatırlanır; ek istek yok', async () => {
    test.setTimeout(120_000);
    const once = postSayisi();
    expect((await dene(senaryoA)).sonuc.durum).toBe('basarili');
    expect((await dene(senaryoA)).sonuc.durum).toBe('basarili');
    expect((await dene(senaryoB)).sonuc.durum).toBe('basarisiz');
    await expect.poll(gozlemSayisi).toBe(3);
    // Öğrenme servise istek atmaz: yalnız üç Dene isteği.
    expect(postSayisi() - once).toBe(3);
    const s = await servis();
    const [a1, , b] = s.ayarlar.kosuOgrenmesi.Siparis.filter((x: Nesne) => x.kaynak === 'kosu');
    expect(a1.alanlar['Input/Channel']).toEqual({ d: 'dolu', v: '77' });
    expect(a1.alanlar['Input/Username']).toEqual({ d: 'dolu' });
    expect(b).toMatchObject({ durum: 'hata', supheli: ['Input/IdentityNumber'], zayif: true });
    expect(s.ogrenmeOneriSayisi).toBeGreaterThan(0);
    // Kendiliğinden ekleme kapalı (varsayılan): tablo değişmedi.
    let tablo = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === girisId);
    expect(tablo.satirlar.map((r: Nesne) => r.degerler.Kanal)).toEqual(['66']);

    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/servisler/s/${servisId}`);
    await expect(page.locator('.ogrenme-rozeti')).toContainText(`${s.ogrenmeOneriSayisi} yeni öneri`);
    await page.getByRole('link', { name: /Servisi analiz et/ }).click();
    const kart = page.getByRole('region', { name: 'Koşulardan gelenler' });
    await expect(kart).toContainText('3 koşu gözlemi');
    const satir = (metin: string) => kart.locator('.analiz-onerisi').filter({ hasText: metin });
    // Tablo başına tek kart; koşu başına satır (yalnız tabloya bağlı Channel; diğer parametreler yok).
    const satirKarti = kart.locator('.satir-onerisi').filter({ hasText: 'Giriş tablosuna' });
    await expect(satirKarti).toHaveCount(1);
    await expect(satirKarti).toContainText('Giriş tablosuna 2 satır eklensin mi');
    await expect(satirKarti).toHaveAttribute('data-guc', 'zayif');
    const onizleme = satirKarti.getByRole('table', { name: 'Giriş satır önizlemesi' });
    await expect(onizleme.locator('tbody tr')).toHaveCount(2);
    await expect(onizleme.locator('tbody tr').nth(0)).toContainText('Senaryo A');
    await expect(onizleme.locator('tbody tr').nth(0)).toContainText('77');
    await expect(onizleme.locator('tbody tr').nth(0)).toContainText('2 başarılı koşuda görüldü: Senaryo A');
    await expect(onizleme.locator('tbody tr').nth(0)).toHaveAttribute('data-guclu', 'true');
    await expect(onizleme.locator('tbody tr').nth(1)).toContainText('88');
    await expect(onizleme.locator('tbody tr').nth(1)).toHaveAttribute('data-guclu', 'false');
    await expect(onizleme).not.toContainText(SAHTE_TC);
    await expect(kart.locator('.analiz-onerisi[data-tur="tabloyaDeger"]')).toHaveCount(0);
    await expect(satir('Hataya yol açmış olabilir')).toContainText('IdentityNumber');
    await expect(satir('Hataya yol açmış olabilir')).toContainText('hata metni bu alanı anıyor');
    await expect(satir('İsteğe bağlı').filter({ hasText: 'IsGiftWrap' })).toContainText('servis bu alan olmadan kabul ediyor');
    // Tablodan gelen değer (Username) önerilmez.
    await expect(kart).not.toContainText('tablo-kullanici');
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await satirKarti.getByRole('button', { name: /^Yoksay/ }).click();
    await expect(page.locator('.kayit-durumu')).toHaveText('✓ Kaydedildi');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Koşulardan gelenler' }).locator('.satir-onerisi')).toHaveCount(0);
    // Satır kararları ayrı hatırlanır.
    expect(Object.entries((await servis()).ayarlar.analizKararlari.Siparis).filter(([k, v]) => k.startsWith('tabloyaSatir|') && v === 'yoksayildi').length).toBeGreaterThanOrEqual(3);
    expect(hatalar).toEqual([]);
    await baglam.close();
    tablo = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === girisId);
    expect(tablo.satirlar.map((r: Nesne) => r.degerler.Kanal)).toEqual(['66']);
  });

  test('kendiliğinden ekleme açıkken yalnız güçlü satırlar (≥ 2 başarılı koşu) yazılır ve geçmişe girer; eski biçimli bekleyen veri de yazılır', async () => {
    test.setTimeout(60_000);
    const ayar = await basarili('/platform/kosu-ayarlari');
    expect(ayar.ayarlar.ogrenmeOtomatikEkle).toBe(false);
    const senaryoC = String((await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Senaryo C', kapsam: 'test', icerik: {
      operasyon: 'Siparis', govde: zarf(`<Channel>99</Channel><IdentityNumber>${SAHTE_TC}</IdentityNumber>`), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] } })).id);
    const kanallar = async () => (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === girisId).satirlar.map((r: Nesne) => r.degerler.Kanal).sort();
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ogrenmeOtomatikEkle: true } });
    // Bir başarılı koşu: satır zayıf, yazılmaz.
    const g0 = await gozlemSayisi();
    expect((await dene(senaryoC)).sonuc.durum).toBe('basarili');
    await expect.poll(gozlemSayisi).toBe(g0 + 1);
    expect(await kanallar()).toEqual(['66']);
    // İkinci başarılı koşu: satır güçlü → kendiliğinden yazılır (satır adı senaryo adı); yoksayılan 88 yazılmaz.
    expect((await dene(senaryoC)).sonuc.durum).toBe('basarili');
    await expect.poll(kanallar).toEqual(['66', '99']);
    const tablo = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === girisId);
    expect(tablo.satirlar.find((r: Nesne) => r.degerler.Kanal === '99').ad).toBe('Senaryo C');
    const s = await servis();
    expect(s.ayarlar.kosuOgrenmesiGecmisi.map((x: Nesne) => x.metin).join(' ')).toContain('Kendiliğinden eklendi: Giriş tablosuna satır "Senaryo C"');
    expect(s.ayarlar.alanZorunluluklari.Siparis).toContain('Input/IsGiftWrap');
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ogrenmeOtomatikEkle: false } });
    // Eski biçimde (sütun + değerler) bekleyen öğrenme verisi kayıtta yine yazılır.
    await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ogrenen', ad: 'Ogrenen', yol: s.ayarlar.yol ?? '/Servis/ornek.asmx',
      tabloDegerleri: [{ tablo: girisId, sutun: 'Kanal', degerler: ['55'] }] });
    expect(await kanallar()).toEqual(['55', '66', '99']);
  });
});
