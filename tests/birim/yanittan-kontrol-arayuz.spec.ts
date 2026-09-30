// KORUMA TESTLERİ — servis yanıtından tek tıkla kontrol üretme arayüzü (senaryo düzenleyici > Kontroller > "Son yanıttan kontrol öner"):
// son Dene / koşu yanıtı alan listesi olarak açılır; önerilen işleç biçimden gelir (numara → desen, sayı → aralık, metin → eşittir); gizli
// adlı alanın değeri GÖSTERİLMEZ ve yazılmaz (yalnız var / desen); kullanıcı satırdan kontrol, altın yanıt (yok sayılan alanlarla) ve yanıt
// süresi ekler; hiçbir şey kendiliğinden eklenmez. Kaydedilen kontroller koşuda geçer; eski "XPath eşit" kontrolü aynen çalışır. Raporlar'daki
// koşudan ("Bu yanıttan kontrol öner") ve öneri panelinden eklenen senaryonun ilk koşusundan da kontrol eklenir. 1440 / 390 px'te taşma yok.
// Yalnız yerel Nöbetçi + 127.0.0.1 sahte SOAP servisi.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TOKEN, sahteSiparisServisi, siparisGovdesi, type SahteSiparisServisi } from './servis-onerileri-fikstur';

type Nesne = Record<string, any>;
const K = '/Envelope/Body/SiparisVerResponse/Sonuc';

async function tasmaYok(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test.describe('son yanıttan kontrol önerme arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-YanitUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let servis: SahteSiparisServisi;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let senaryoId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const sayfa = async (genislik = 1440) => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    return { page, hatalar, kapat: () => baglam.close() };
  };
  const senaryo = async (id: string) => ((await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).senaryolar as Nesne[]).find((x) => x.id === id)!;
  const dene = async (id: string) => (await basarili('/platform/servis/senaryo/dene', { projeId, servisId, ortamId, senaryoId: id })).sonuc as Nesne;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'yanittan-kontrol-'));
    servis = await sahteSiparisServisi();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Yanıttan Kontrol Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: servis.adres, varsayilan: true, riskli: false })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Ornek/servis.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Ornek/servis.asmx', erisimKimligi: e.erisimKimligi })).id);
    // Eski tür kontrol (XPath eşit) korunur ve aynen çalışır.
    senaryoId = String((await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Sipariş A',
      icerik: { operasyon: 'SiparisVer', govde: siparisGovdesi({ Tutar: '500', Kod: 'ABC', Tip: 'O' }), kontroller: [{ tur: 'soapYaniti' }, { tur: 'xpathEsit', xpath: `${K}/Durum`, deger: 'BASARILI' }] } })).id);
    expect((await dene(senaryoId)).durum).toBe('basarili');
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await servis?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('alan listesi: önerilen işleçler, gizli alan değeri yok; satırdan kontrol + altın yanıt + süre eklenir, kaydedilir ve koşuda geçer', async () => {
    test.setTimeout(90_000);
    const { page, hatalar, kapat } = await sayfa();
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${senaryoId}`);
    const kontrolSayisi = 2;
    await expect(page.locator('.kontrol-satiri')).toHaveCount(kontrolSayisi);
    const postOnce = servis.postSayisi();
    await page.getByRole('button', { name: 'Son yanıttan kontrol öner' }).click();
    const panel = page.getByRole('region', { name: 'Son yanıttan kontrol öner' });
    const alanlar = panel.getByRole('list', { name: 'Yanıt alanları' });
    await expect(alanlar.locator('li')).toHaveCount(8);
    await expect(panel).toContainText('Dene ·');
    // Önerilen işleçler (değer biçiminden).
    await expect(panel.getByLabel(`${K}/Durum kontrol işleci`)).toHaveValue('esit');
    await expect(panel.getByLabel(`${K}/Durum kontrol değeri`)).toHaveValue('BASARILI');
    await expect(panel.getByLabel(`${K}/SiparisNo kontrol işleci`)).toHaveValue('desen');
    await expect(panel.getByLabel(`${K}/SiparisNo kontrol değeri`)).toHaveValue('\\d{8}');
    await expect(panel.getByLabel(`${K}/Tutar kontrol işleci`)).toHaveValue('aralik');
    await expect(panel.getByLabel(`${K}/Tarih altın yanıtta`)).toHaveValue('yoksay');
    // Gizli adlı alan: değer gösterilmez, işleç yalnız var / desen.
    const token = alanlar.locator(`li[data-yol="${K}/Token"]`);
    await expect(token).toContainText('gizli: değer yok');
    await expect(panel.getByLabel(`${K}/Token kontrol işleci`).locator('option')).toHaveText(['var (boş değil)', 'desen']);
    expect(await page.content()).not.toContain(SAHTE_TOKEN);
    // Hiçbir kontrol kendiliğinden eklenmedi.
    await expect(page.locator('.kontrol-satiri')).toHaveCount(kontrolSayisi);
    // Kullanıcı ekler: Durum eşittir, SiparisNo desen, Tutar aralık, Token var, altın yanıt (IslemNo yok say), süre.
    await panel.getByRole('button', { name: `${K}/Durum: kontrol ekle` }).click();
    await panel.getByRole('button', { name: `${K}/SiparisNo: kontrol ekle` }).click();
    await panel.getByLabel(`${K}/Tutar en az`).fill('0');
    await panel.getByLabel(`${K}/Tutar en çok`).fill('100000');
    await panel.getByRole('button', { name: `${K}/Tutar: kontrol ekle` }).click();
    await panel.getByRole('button', { name: `${K}/Token: kontrol ekle` }).click();
    await panel.getByLabel(`${K}/IslemNo altın yanıtta`).selectOption('yoksay');
    await panel.getByRole('button', { name: 'Altın yanıt olarak ekle' }).click();
    await panel.getByLabel('Yanıt en çok (ms)').fill('5000');
    await panel.getByRole('button', { name: 'Süre kontrolü ekle' }).click();
    await expect(page.locator('.kontrol-satiri')).toHaveCount(kontrolSayisi + 6);
    await expect(page.locator('.altin-yanit-ozeti')).toContainText('sabit alan');    await tasmaYok(page);
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Senaryo kaydedildi.')).toBeVisible();
    const kayit = await senaryo(senaryoId);
    const k = kayit.icerik.kontroller as Nesne[];
    expect(k.map((x) => x.tur)).toEqual(['soapYaniti', 'xpathEsit', 'yanitAlani', 'yanitAlani', 'yanitAlani', 'yanitAlani', 'altinYanit', 'yanitSuresi']);
    expect(k[2]).toEqual({ tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Durum`, islec: 'esit', deger: 'BASARILI' });
    expect(k[3]).toEqual({ tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/SiparisNo`, islec: 'desen', deger: '\\d{8}' });
    expect(k[4]).toEqual({ tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Tutar`, islec: 'aralik', enAz: 0, enCok: 100000 });
    expect(k[5]).toEqual({ tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Token`, islec: 'var', gizli: true });
    expect(k[6].yokSay).toEqual(expect.arrayContaining([`${K}/IslemNo`, `${K}/Tarih`]));
    expect(k[7]).toEqual({ tur: 'yanitSuresi', deger: '5000' });
    expect(JSON.stringify(kayit.icerik)).not.toContain(SAHTE_TOKEN);
    // Panel istek atmadı; kaydedilen kontroller koşuda geçer (IslemNo her istekte değişir ama yok sayılır).
    expect(servis.postSayisi()).toBe(postOnce);
    const r = await dene(senaryoId);
    expect(r.durum).toBe('basarili');
    expect((r.kontroller as Nesne[]).map((x) => x.gecti)).toEqual([true, true, true, true, true, true, true, true]);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('Raporlar: koşudan "Bu yanıttan kontrol öner" düzenleyiciyi o yanıtla açar', async () => {
    test.setTimeout(60_000);
    const r = await dene(senaryoId);
    const { page, hatalar, kapat } = await sayfa();
    await page.goto(`/#/servisler/s/${servisId}/raporlar/${r.kosuId}`);
    await page.getByRole('button', { name: 'Bu yanıttan kontrol öner' }).click();
    await expect(page).toHaveURL(new RegExp(`/senaryo/${senaryoId}$`));
    await expect(page.getByRole('region', { name: 'Son yanıttan kontrol öner' }).getByRole('list', { name: 'Yanıt alanları' })).toBeVisible();
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('düzenleyicide "Dene" (onayla): biten denemenin yanıtı "Son yanıttan kontrol öner"de açılır', async () => {
    test.setTimeout(60_000);
    const { page, hatalar, kapat } = await sayfa();
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${senaryoId}`);
    const once = servis.postSayisi();
    await page.getByRole('button', { name: 'Dene', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Dene' }).click();
    await expect(page.getByRole('region', { name: 'Servis koşu paneli' })).toContainText('Deneme bitti');
    // Dene yanıt aldı: Hazırlık'taki "Ortam bağlantısı" artık "Denetlenmedi" demez.
    await expect(page.locator('.servis-hazirligi [data-madde="ortam"]')).toContainText('Erişildi (');
    expect(servis.postSayisi()).toBe(once + 1);
    await page.getByRole('button', { name: 'Son yanıttan kontrol öner' }).click();
    const panel = page.getByRole('region', { name: 'Son yanıttan kontrol öner' });
    await expect(panel).toContainText('Dene ·');
    await expect(panel.getByRole('list', { name: 'Yanıt alanları' }).locator('li')).toHaveCount(8);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('öneriden eklenen negatif senaryo: ilk koşudan sonra hata mesajı yanıttan kontrol olarak eklenir; 390 px taşma yok', async () => {
    test.setTimeout(90_000);
    const o = (await basarili(`/platform/servis/oneriler?projeId=${projeId}&servisId=${servisId}&operasyon=SiparisVer&ustSinir=100`)).oneriler.find((x: Nesne) => x.baslik === 'Negatif: Tutar = 1001 (üst sınır + 1)');
    expect(o.beklenen).toEqual({ tur: 'hata', mesaj: '', mesajEksik: true });
    const id = String((await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: o.baslik, kapsam: 'test', kosuyaDahil: false, icerik: o.icerik })).id);
    expect((await dene(id)).durum).toBe('basarili'); // Fault döndü: "Hata beklenir" geçti
    const { page, hatalar, kapat } = await sayfa(390);
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${id}`);
    await page.getByRole('button', { name: 'Son yanıttan kontrol öner' }).click();
    const panel = page.getByRole('region', { name: 'Son yanıttan kontrol öner' });
    const yol = '/Envelope/Body/Fault/faultstring';
    await expect(panel.getByLabel(`${yol} kontrol değeri`)).toHaveValue('Tutar limiti aşıldı');
    await tasmaYok(page);
    await panel.getByRole('button', { name: `${yol}: kontrol ekle` }).click();
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Senaryo kaydedildi.')).toBeVisible();
    expect((await senaryo(id)).icerik.kontroller).toEqual([{ tur: 'soapHatasi' }, { tur: 'yanitAlani', kaynak: 'xml', yol, islec: 'esit', deger: 'Tutar limiti aşıldı' }]);
    expect((await dene(id)).durum).toBe('basarili');
    await tasmaYok(page);
    expect(hatalar).toEqual([]);
    await kapat();
  });
});
