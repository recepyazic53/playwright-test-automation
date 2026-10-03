// KORUMA TESTİ — akış senaryosunda adım başına "Alanlar | Gövde (XML)" (REST'te "Gövde (JSON)") sekmeleri:
//   - 2 adımlı akış: 1. adım yanıttan değer okur; 2. adım gövde sekmesinde yazılır ve ${akis:Ad} içerir.
//   - Sekmeler arası dönüşüm (alanlardan gövde üretilir; çözülemeyen gövdede uyarı, veri kaybolmaz), kilitli başvuru silinince
//     kayıtta açık hata, kayıt → yeniden aç (sekme korunur), gizli adlı alan gövdede maskeli.
//   - Dene ve normal koşu doğru istek gövdesini gönderir (${akis:…}, ${Tablo.Sütun} çözülür); 1440 ve 390 px'te taşma yok.
// Güvenlik: geçici veritabanı; yalnız 127.0.0.1'deki sahte SOAP / REST sunucuları; tarayıcının Nöbetçi dışındaki her isteği engellenir.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu } from './servis-fikstur';

type Nesne = Record<string, any>;

const GIZLI = 'Sahte-Gizli-7';
const zarf = (kok: string, ic: string) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${kok} xmlns="Ornek">${ic}</${kok}></soap:Body></soap:Envelope>`;
const ILK_GOVDE = zarf('Siparis', `<Input><Giris/><Password>${GIZLI}</Password><IdentityNumber>${SAHTE_TC}</IdentityNumber></Input>`);
/** Ekran görüntüleri: NOBETCI_GORUNTU_KLASORU verilirse oraya, yoksa test çıktısına. */
const GORUNTU = process.env.NOBETCI_GORUNTU_KLASORU || join('test-results', 'akis-senaryo-govde');

/** Sahte REST sunucusu (127.0.0.1): gelen gövdeler kaydedilir; her isteğe 200 JSON. */
async function sahteRestSunucusu(): Promise<{ adres: string; govdeler: string[]; kapat: () => Promise<void> }> {
  const govdeler: string[] = [];
  const sunucu: Server = createServer((q, y) => {
    let g = '';
    q.setEncoding('utf8');
    q.on('data', (p) => { g += p; });
    q.on('end', () => { govdeler.push(g); y.writeHead(200, { 'Content-Type': 'application/json' }); y.end('{"durum":"tamam"}'); });
  });
  await new Promise<void>((r) => sunucu.listen(0, '127.0.0.1', () => r()));
  return { adres: `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`, govdeler, kapat: () => new Promise((r) => { sunucu.closeAllConnections?.(); sunucu.close(() => r()); }) };
}

test.describe('akış senaryosu: adım gövdesi sekmesi', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = 'Gecici-AkisGovde-UI-1';
  let klasor = '';
  let nobetci: Nobetci;
  let tarayici: Browser;
  let soap: Awaited<ReturnType<typeof sahteSoapSunucusu>>;
  let rest: Awaited<ReturnType<typeof sahteRestSunucusu>>;
  let projeId = '';
  let ortamId = '';
  let A = '';
  let B = '';
  let R = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    mkdirSync(GORUNTU, { recursive: true });
    klasor = mkdtempSync(join(tmpdir(), 'akis-govde-'));
    soap = await sahteSoapSunucusu();
    rest = await sahteRestSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Akış gövdesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    const servis = async (anahtar: string, ad: string) => {
      const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
      const id = String((await basarili('/platform/servis/kaydet', { projeId, anahtar, ad, yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
      await basarili('/platform/servis/sema/yenile', { projeId, servisId: id, ortamId });
      return id;
    };
    A = await servis('birinci', 'BirinciServis');
    B = await servis('ikinci', 'IkinciServis');
    R = String((await basarili('/platform/servis/rest/kaydet', { projeId, anahtar: 'kayit', ad: 'KayitServisi', tabanlar: { [ortamId]: `${rest.adres}/api` },
      uclar: [{ ad: 'kayitYaz', metot: 'POST', yol: '/kayit' }], senaryolar: [] })).id);
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Veri', sutunlar: [{ ad: 'Kod' }], satirlar: [{ ad: 'ilk', degerler: { Kod: 'KOD-77' } }] });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    await rest?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  async function sayfaAc(genislik = 1440): Promise<{ page: Page; hatalar: string[]; disari: string[]; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 }, reducedMotion: 'reduce' });
    const disari: string[] = [];
    await baglam.route('**/*', async (r) => {
      if (r.request().url().startsWith(nobetci.adres)) await r.continue();
      else { disari.push(r.request().url()); await r.abort(); }
    });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    return { page, hatalar, disari, kapat: () => baglam.close() };
  }
  const adim = (page: Page, no: number) => page.locator('fieldset.akis-senaryo-adimi').nth(no - 1);
  const sekme = (page: Page, no: number, ad: string) => adim(page, no).getByRole('tablist', { name: `${no}. adım gövde görünümü` }).getByRole('tab', { name: ad });
  const govde = (page: Page, no: number) => page.getByLabel(`${no}. adım istek gövdesi`);
  /** Dene: onayla ve sahte sunucuya beklenen sayıda istek gelene dek bekle. */
  async function dene(page: Page, sayac: () => number, artis: number) {
    const once = sayac();
    await page.getByRole('button', { name: 'Dene', exact: true }).click();
    await page.getByRole('dialog', { name: 'TEST ortamına istek atılsın mı?' }).getByRole('button', { name: 'Dene' }).click();
    await expect.poll(sayac, { timeout: 30_000 }).toBeGreaterThanOrEqual(once + artis);
  }

  test('SOAP: gövde sekmesi, dönüşüm, kilitli başvuru hatası, yeniden açılış, Dene ve koşu, taşma', async () => {
    test.setTimeout(150_000);
    const akis = await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Birinci → İkinci', tur: 'akis', icerik: { adimlar: [
      { id: 'bir', ad: 'Bir', tur: 'operasyon', servisId: A, operasyon: 'Siparis', okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] },
      { id: 'iki', ad: 'Iki', tur: 'operasyon', servisId: B, operasyon: 'Onayla', baglar: { SiparisNo: '${akis:Token}' } }
    ] } });
    const { page, hatalar, disari, kapat } = await sayfaAc();
    await page.goto(`/#/servisler/s/${A}/senaryo/yeni?akis=${String(akis.id)}`);
    // Her adımda tek istek formundaki sekmeler; varsayılan Alanlar.
    await expect(sekme(page, 1, 'Alanlar')).toHaveAttribute('aria-selected', 'true');
    await expect(sekme(page, 2, 'Gövde (XML)')).toHaveAttribute('aria-selected', 'false');
    // 1. adım: Gövde sekmesinde şemada olmayan öğe (<Giris/>) ve gizli adlı alan yazılır.
    await sekme(page, 1, 'Gövde (XML)').click();
    await expect(govde(page, 1)).toHaveValue(/<Siparis/);
    await govde(page, 1).fill(ILK_GOVDE);
    // Gövde → Alanlar: çözülemeyen kısım var → uyarı, sekme değişmez, gövde aynen.
    await sekme(page, 1, 'Alanlar').click();
    await expect(adim(page, 1).getByRole('status')).toContainText('Bu gövde alan formunda tam gösterilemiyor');
    await expect(sekme(page, 1, 'Gövde (XML)')).toHaveAttribute('aria-selected', 'true');
    await expect(govde(page, 1)).toHaveValue(ILK_GOVDE);
    // 2. adım: Alanlar → Gövde: gövde alanlardan üretilir; akıştan gelen alan ${akis:Token}; kilitli alanlar notta.
    await sekme(page, 2, 'Gövde (XML)').click();
    await expect(govde(page, 2)).toHaveValue(/<SiparisNo>\$\{akis:Token\}<\/SiparisNo>/);
    await expect(adim(page, 2).locator('.akis-kilit-notu')).toContainText('SiparisNo ← ${akis:Token}');
    // Gövde → Alanlar (çözülür): kilitli satır; yeniden Gövde.
    await sekme(page, 2, 'Alanlar').click();
    await expect(adim(page, 2).locator('.alan-satiri.kilitli')).toContainText('1. adımdan gelir (${akis:Token})');
    await sekme(page, 2, 'Gövde (XML)').click();
    // Kilitli başvuru silinince kayıt açık hatayla durur.
    await govde(page, 2).fill(zarf('Onayla', '<SiparisNo>5</SiparisNo>'));
    await page.getByLabel('Başlık').fill('Gövdeli akış');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('2. adım: “SiparisNo” alanı akıştan gelir (${akis:Token}); gövdede bu başvuru kalmalı.')).toBeVisible();
    await expect(page).toHaveURL(/senaryo\/yeni/);
    const ikinci = zarf('Onayla', '<SiparisNo>${akis:Token}</SiparisNo>');
    await govde(page, 2).fill(ikinci);
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/\/senaryo\/[A-Za-z0-9-]+$/);
    const senaryoId = decodeURIComponent(page.url().split('/').pop() || '');
    // Yeniden aç: iki adım da Gövde sekmesinde; gizli değer maskeli, başvuru yerinde.
    await page.reload();
    await expect(sekme(page, 1, 'Gövde (XML)')).toHaveAttribute('aria-selected', 'true');
    await expect(sekme(page, 2, 'Gövde (XML)')).toHaveAttribute('aria-selected', 'true');
    await expect(govde(page, 1)).toHaveValue(/<Giris\/>/);
    await expect(govde(page, 1)).toHaveValue(/<Password>•+<\/Password>/);
    expect(await govde(page, 1).inputValue()).not.toContain(GIZLI);
    await expect(govde(page, 2)).toHaveValue(ikinci);
    // Taşma yok: 1440 ve 390 px.
    for (const g of [1440, 390]) {
      await page.setViewportSize({ width: g, height: 900 });
      await expect(sekme(page, 2, 'Gövde (XML)')).toBeVisible();
      const tasma = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(tasma, `${g} px yatay taşma`).toBeLessThanOrEqual(0);
      await page.locator('.akis-senaryo-adimlari').screenshot({ path: join(GORUNTU, `akis-adim-govde-${g}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    // Dene (kaydedilmemiş hâl; maskeli gizli değer asılla gider): ikinci istekte 1. yanıttan okunan değer.
    const n0 = soap.istekler.length;
    await dene(page, () => soap.istekler.filter((x) => x.yontem === 'POST').length, 2);
    const [d1, d2] = soap.istekler.slice(n0).filter((x) => x.yontem === 'POST');
    expect(d1.govde).toContain('<Giris/>');
    expect(d1.govde).toContain(`<Password>${GIZLI}</Password>`);
    expect(d2.govde).toMatch(/<SiparisNo>tok-\d+<\/SiparisNo>/);
    // Normal koşu (kayıtlı senaryo).
    const n1 = soap.istekler.length;
    const k = await basarili('/platform/servis/kos', { projeId, servisId: A, ortamId, senaryoIdleri: [senaryoId] });
    expect(k.kosu.sonuclar.map((x: Nesne) => x.durum)).toEqual(['basarili']);
    const [k1, k2] = soap.istekler.slice(n1).filter((x) => x.yontem === 'POST');
    expect(k1.govde).toContain(`<Password>${GIZLI}</Password>`);
    expect(k2.govde).toMatch(/<SiparisNo>tok-\d+<\/SiparisNo>/);
    expect(k2.govde).not.toContain('${akis:');
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });

  test('REST: "Gövde (JSON)" sekmesi, ${akis:…} ve ${Tablo.Sütun} çözülür; yeniden açılış; Dene ve koşu', async () => {
    test.setTimeout(120_000);
    const akis = await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Birinci → Kayıt', tur: 'akis', icerik: { adimlar: [
      { id: 'bir', ad: 'Bir', tur: 'operasyon', servisId: A, operasyon: 'Siparis', okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] },
      { id: 'yaz', ad: 'Yaz', tur: 'operasyon', servisId: R, operasyon: 'kayitYaz', baglar: { 'kayit/no': '${akis:Token}' } }
    ] } });
    const { page, hatalar, disari, kapat } = await sayfaAc();
    await page.goto(`/#/servisler/s/${R}/senaryo/yeni?akis=${String(akis.id)}`);
    await sekme(page, 1, 'Gövde (XML)').click();
    await govde(page, 1).fill(ILK_GOVDE);
    // REST adımı: Alanlar kapalı (alan listesi yok), "Gövde (JSON)" seçili; akıştan gelen alan gövdede yazılı.
    await expect(sekme(page, 2, 'Alanlar')).toBeDisabled();
    await expect(sekme(page, 2, 'Gövde (JSON)')).toHaveAttribute('aria-selected', 'true');
    expect(JSON.parse(await govde(page, 2).inputValue())).toEqual({ kayit: { no: '${akis:Token}' } });
    // Başvuru değiştirilince hata.
    await govde(page, 2).fill('{"kayit":{"no":"${akis:Baska}"}}');
    await page.getByLabel('Başlık').fill('Gövdeli REST akışı');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('2. adım: “no” alanı akıştan gelir (${akis:Token}); gövdede bu başvuru kalmalı.')).toBeVisible();
    const yazilan = '{"kayit":{"no":"${akis:Token}","kod":"${Veri.Kod}"}}';
    await govde(page, 2).fill(yazilan);
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/\/senaryo\/[A-Za-z0-9-]+$/);
    const senaryoId = decodeURIComponent(page.url().split('/').pop() || '');
    await page.reload();
    await expect(sekme(page, 1, 'Gövde (XML)')).toHaveAttribute('aria-selected', 'true');
    await expect(sekme(page, 2, 'Gövde (JSON)')).toHaveAttribute('aria-selected', 'true');
    await expect(govde(page, 2)).toHaveValue(yazilan);
    // Dene ve normal koşu: REST gövdesinde okunan değer ve tablo değeri.
    await dene(page, () => rest.govdeler.length, 1);
    const kontrol = (g: string) => { const j = JSON.parse(g); expect(j.kayit.no).toMatch(/^tok-\d+$/); expect(j.kayit.kod).toBe('KOD-77'); };
    kontrol(rest.govdeler[rest.govdeler.length - 1]);
    const n = rest.govdeler.length;
    const k = await basarili('/platform/servis/kos', { projeId, servisId: R, ortamId, senaryoIdleri: [senaryoId] });
    expect(k.kosu.sonuclar.map((x: Nesne) => x.durum)).toEqual(['basarili']);
    expect(rest.govdeler.length).toBe(n + 1);
    kontrol(rest.govdeler[n]);
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });
});
