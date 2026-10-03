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
    await expect(satir('"77" eklensin')).toHaveAttribute('data-guc', 'guclu');
    await expect(satir('"77" eklensin')).toContainText('2 başarılı koşuda görüldü: Senaryo A');
    await expect(satir('"88" eklensin')).toHaveAttribute('data-guc', 'zayif');
    await expect(satir('Hataya yol açmış olabilir')).toContainText('IdentityNumber');
    await expect(satir('Hataya yol açmış olabilir')).toContainText('hata metni bu alanı anıyor');
    await expect(satir('İsteğe bağlı').filter({ hasText: 'IsGiftWrap' })).toContainText('servis bu alan olmadan kabul ediyor');
    // Tablodan gelen değer (Username) önerilmez.
    await expect(kart).not.toContainText('tablo-kullanici');
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await satir('"88" eklensin').getByRole('button', { name: /^Yoksay/ }).click();
    await expect(page.locator('.kayit-durumu')).toHaveText('✓ Kaydedildi');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Koşulardan gelenler' }).locator('.analiz-onerisi').filter({ hasText: '"88"' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Koşulardan gelenler' }).locator('.analiz-onerisi').filter({ hasText: '"77"' })).toHaveCount(1);
    expect(Object.entries((await servis()).ayarlar.analizKararlari.Siparis).filter(([k, v]) => k.includes('"88"') && v === 'yoksayildi')).toHaveLength(1);
    expect(hatalar).toEqual([]);
    await baglam.close();
    tablo = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === girisId);
    expect(tablo.satirlar.map((r: Nesne) => r.degerler.Kanal)).toEqual(['66']);
  });

  test('kendiliğinden ekleme açıkken yalnız güçlü "değer ekle" uygulanır ve geçmişe yazılır; zorunluluk değişmez', async () => {
    test.setTimeout(60_000);
    const ayar = await basarili('/platform/kosu-ayarlari');
    expect(ayar.ayarlar.ogrenmeOtomatikEkle).toBe(false);
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ogrenmeOtomatikEkle: true } });
    expect((await dene(senaryoA)).sonuc.durum).toBe('basarili');
    await expect.poll(async () => (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === girisId).satirlar.map((r: Nesne) => r.degerler.Kanal).sort())
      .toEqual(['66', '77']);
    const s = await servis();
    expect(s.ayarlar.kosuOgrenmesiGecmisi.map((x: Nesne) => x.metin).join(' ')).toContain('Kendiliğinden eklendi');
    // Zorunluluk önerisi kendiliğinden uygulanmaz; zayıf / yoksayılan 88 eklenmez.
    expect(s.ayarlar.alanZorunluluklari.Siparis).toContain('Input/IsGiftWrap');
    const kanallar = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar.find((t: Nesne) => t.id === girisId).satirlar.map((r: Nesne) => r.degerler.Kanal);
    expect(kanallar).not.toContain('88');
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ogrenmeOtomatikEkle: false } });
  });
});
