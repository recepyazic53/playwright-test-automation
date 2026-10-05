// KORUMA TESTİ — "Servis ekle > cURL yapıştır" arayüzü: yapıştır → önizleme (gizli değerler maskeli, tanınmayan seçenek uyarısı,
// adlandırılmış taban adres eşleşmesi) → yalnız işaretli gizli değerler onaylı → Devam → adım adım sihirbaz → kaydet → servis ve
// uçlar oluşur. Onaysız gizli değer hiçbir isteğe / kayda girmez. Ağ denetimi: tarayıcının TÜM istekleri yalnız yerel Nöbetçi'ye
// gider (örnek adres example.com'a hiç istek yok); 1440 ve 390 px'te taşma yok.
// Güvenlik: geçici veritabanı, yalnız 127.0.0.1; gerçek kasa (veri/) ve dış adreslere dokunulmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

/** Onaylanacak (1, 2) ve onaylanmayacak (3, 4, 5) gizli değerler; hiçbiri önizlemede görünmemeli. */
const KOMUTLAR = [
  "curl -X POST 'https://example.com/api/v1/giris?token=gizli-deger-1&dil=tr' \\",
  "  -H 'Content-Type: application/json' \\",
  "  -H 'Authorization: Bearer gizli-deger-2' \\",
  "  -b 'oturum=gizli-deger-3' \\",
  "  --data-raw '{\"kullaniciAdi\":\"ornek\",\"parola\":\"gizli-deger-4\"}' --compressed --bilinmeyen-secenek",
  "curl -u 'kul:gizli-deger-5' https://example.com/api/v1/liste"
].join('\n');

/** Sayfada: yatay taşma ve kart / alan kümesinden taşan öğeler (boşsa sorun yok). */
function tasmalar(): string[] {
  const out: string[] = [];
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push(`sayfa yatay taşıyor: ${document.documentElement.scrollWidth}`);
  const kaydirmali = (e: Element, dur: Element) => {
    for (let p = e.parentElement; p && p !== dur; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
    return false;
  };
  for (const k of document.querySelectorAll('main .kart, main fieldset, main .not-kutusu')) {
    const kr = k.getBoundingClientRect();
    if (kr.width < 2) continue;
    for (const c of k.querySelectorAll('button, input, select, textarea, span, b, code, p, table, dd, pre')) {
      const cr = c.getBoundingClientRect();
      if (cr.width < 2 || kaydirmali(c, k) || c.closest('[hidden]')) continue;
      if (cr.right > kr.right + 2 || cr.left < kr.left - 2) { out.push(`kutudan taşan: ${c.tagName} "${(c.textContent || '').slice(0, 30)}"`); break; }
    }
  }
  return out;
}

test.describe('cURL yapıştır arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Curl-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let canli = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'curl-servis-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'cURL Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, riskli: false })).ortam.id);
    canli = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid/', canli: true })).ortam.id);
    // Adlandırılmış taban adres: yapıştırılan adres bununla başlıyor → bağlanma önerilir (CANLI'da adresi yok).
    await basarili('/platform/servis-tabanlari/taban', { projeId, islem: 'ekle', ad: 'Ornek API', adresler: { [testOrtami]: 'https://example.com/api', [canli]: '' }, onay: true });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  /** Sayfa: hatalar ve tüm istekler (adres + gövde) kaydedilir; yerel Nöbetçi dışına giden istek engellenir ve raporlanır. */
  async function sayfaAc(genislik: number): Promise<{ page: Page; hatalar: string[]; istekler: Array<{ url: string; govde: string }>; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 }, reducedMotion: 'reduce' });
    const istekler: Array<{ url: string; govde: string }> = [];
    await baglam.route('**/*', async (r) => {
      if (r.request().url().startsWith(nobetci.adres)) await r.continue();
      else await r.abort();
    });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    page.on('request', (q) => istekler.push({ url: q.url(), govde: q.postData() ?? '' }));
    return { page, hatalar, istekler, kapat: () => baglam.close() };
  }

  const onizle = async (page: Page) => {
    await page.goto('/#/servisler/yeni');
    await page.getByRole('tab', { name: 'cURL yapıştır' }).click();
    await page.getByLabel('cURL komutları').fill(KOMUTLAR);
    await page.getByRole('button', { name: 'Önizle' }).click();
    await expect(page.locator('.curl-onizleme')).toBeVisible();
  };

  test('yapıştır → önizleme (maskeli) → onayla → sihirbaz → kaydet: servis ve uçlar oluşur; onaysız gizli değer kaydedilmez; dışarı istek yok', async () => {
    test.setTimeout(90_000);
    const { page, hatalar, istekler, kapat } = await sayfaAc(1440);
    await onizle(page);
    const onizleme = page.locator('.curl-onizleme');
    await expect(onizleme.locator('h3')).toContainText('2 istek');
    await expect(onizleme).toContainText('Bu adres "Ornek API" taban adresiyle eşleşiyor (TEST)');
    await expect(page.getByLabel(/"Ornek API" taban adresine bağlansın/)).toBeChecked();
    const ilk = onizleme.locator('.curl-istegi').first();
    await expect(ilk.locator('.curl-ozeti')).toContainText('/v1/giris');
    await expect(ilk.locator('.curl-ozeti')).toContainText('https://example.com/api');
    await expect(ilk.locator('.curl-ozeti')).toContainText('Bearer •••');
    await expect(ilk.locator('.curl-ozeti')).toContainText('kullaniciAdi');
    await expect(ilk).toContainText('Tanınmayan seçenekler (yok sayıldı): --bilinmeyen-secenek');
    await expect(ilk).toContainText('--compressed');
    // Hiçbir gizli değer ekranda yok (yalnız yapıştırılan metin kutusunda durur).
    expect(await page.locator('main').evaluate((m) => (m as HTMLElement).innerText)).not.toContain('gizli-deger');
    await expect(page.getByRole('table', { name: 'Gizli değerler' }).locator('tbody tr')).toHaveCount(5);
    expect(await page.evaluate(tasmalar)).toEqual([]);

    // Yalnız Authorization (1. istek) ve token onaylanır; Cookie, parola ve 2. isteğin -u değeri onaysız.
    await page.getByLabel('1. istek Authorization değerini şifreli kaydet').check();
    await page.getByLabel('1. istek token değerini şifreli kaydet').check();
    await page.getByRole('button', { name: 'Devam: servisi tanımla' }).click();

    // Sihirbaz: REST, isteklerle dolu; taban adresi bağlı.
    const ileri = page.getByRole('button', { name: 'İleri' });
    await expect(page.locator('.sihirbaz-adimlari li.simdiki')).toContainText('Adresler');
    await expect(page.getByText('cURL komutlarından 2 istek hazır')).toBeVisible();
    await expect(page.getByText('"Ornek API" taban adresine bağlı')).toBeVisible();
    await expect(page.getByLabel('Servis adı')).toHaveValue('Example');
    await expect(page.getByLabel('Anahtar')).toHaveValue('example');
    await ileri.click();
    await expect(page.locator('.sihirbaz-adimlari li.simdiki')).toContainText('İstekler');
    await expect(page.locator('.rest-ucu')).toHaveCount(2);
    await expect(page.locator('.rest-ucu').first().locator('.adres-onizleme')).toContainText('POST https://example.com/api/v1/giris?token=&dil=tr');
    expect(hatalar).toEqual([]);
    await ileri.click();
    await expect(page.locator('.sihirbaz-adimlari li.simdiki')).toContainText('Alanlar');
    // Servis analizi: cURL'deki gövde örneği ucun örnek isteklerinde hazır (JSON; gizli değer önizlemede yok).
    const ornekler = page.getByRole('region', { name: 'giris örnek istekleri' });
    await expect(ornekler).toContainText('Örnek istekler (gövde JSON)');
    await expect(ornekler.locator('.ornek-listesi li')).toHaveCount(1);
    await expect(ornekler.locator('.ornek-listesi')).toContainText('cURL');
    await expect(ornekler.locator('.ornek-listesi')).not.toContainText('gizli-deger');
    await ileri.click();
    await expect(page.locator('.ozet-listesi')).toContainText('2 değer şifreli kaydedilecek; 3 değer kaydedilmeyecek');
    await expect(page.locator('.ozet-listesi')).toContainText('"Ornek API" (bağlı)');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[0-9a-f-]{36}$/);
    expect(hatalar).toEqual([]);

    // Servis ve uçlar; adresler adlandırılmış tabandan.
    const { servisler } = await basarili(`/platform/servisler?projeId=${projeId}`);
    expect(servisler.find((x: Nesne) => x.anahtar === 'example').ayarlar.ornekIstekler).toBeUndefined();
    // Liste yalnız küçük ayarları taşır; örnek istekler tekil uçtan (GET /platform/servis).
    const s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisler.find((x: Nesne) => x.anahtar === 'example').id}`)).servis;
    expect(s).toMatchObject({ tur: 'rest', ad: 'Example' });
    expect(s.ayarlar.tabanGrubu).toBe('Ornek API');
    expect(s.ayarlar.tabanlar).toEqual({ [testOrtami]: 'https://example.com/api', [canli]: '' });
    expect(s.ayarlar.operasyonlar.map((o: Nesne) => `${o.ad} ${o.metot} ${o.yol}`)).toEqual(['giris POST /v1/giris', 'liste GET /v1/liste']);
    expect(s.ayarlar.operasyonlar[0].basliklar).toEqual([
      { ad: 'Authorization', deger: 'Bearer ${Example başlıkları.Authorization}' }, { ad: 'Cookie', deger: '${Example başlıkları.Cookie}' }
    ]);
    expect(s.ayarlar.operasyonlar[1].basliklar).toEqual([{ ad: 'Authorization', deger: 'Basic ${Example başlıkları.Authorization_2}' }]);
    // Gizli değerler: onaylılar şifreli sütunda dolu, onaysızların sütunu boş.
    const { tablolar } = await basarili(`/platform/tablolar?projeId=${projeId}`);
    const baslik = tablolar.find((t: Nesne) => t.ad === 'Example başlıkları');
    expect(baslik.sutunlar.map((c: Nesne) => [c.ad, c.gizli])).toEqual([['Authorization', true], ['Cookie', true], ['Authorization_2', true]]);
    expect(baslik.satirlar[0].doluGizli).toEqual(['Authorization']);
    const alanlar = tablolar.find((t: Nesne) => t.ad === 'Example gizli değerleri');
    expect(alanlar.sutunlar.map((c: Nesne) => [c.ad, c.gizli])).toEqual([['token', true], ['parola', true]]);
    expect(alanlar.satirlar[0].doluGizli).toEqual(['token']);
    expect(s.ayarlar.alanBaglari.giris).toMatchObject({ 'sorgu/token': { tablo: alanlar.id, sutun: 'token' }, 'govde/parola': { tablo: alanlar.id, sutun: 'parola' } });
    expect(JSON.stringify(s)).not.toContain('gizli-deger');
    expect(s.ayarlar.ornekIstekler.giris.map((x: Nesne) => [x.ad, x.kaynak])).toEqual([['giris', 'curl']]);

    // Ağ: tüm istekler yerel Nöbetçi'ye; onaysız değerler ve yapıştırılan metin hiçbir isteğe girmedi.
    expect(istekler.filter((q) => !q.url.startsWith(nobetci.adres)).map((q) => q.url)).toEqual([]);
    const govdeler = istekler.map((q) => q.govde).join('\n');
    for (const d of ['gizli-deger-3', 'gizli-deger-4', 'gizli-deger-5', '--compressed', 'curl ']) expect(govdeler).not.toContain(d);
    await kapat();
  });

  test('390 px: önizleme ve sihirbazın ilk adımı taşmaz; önizleme hiçbir istek atmaz', async () => {
    test.setTimeout(60_000);
    const { page, hatalar, istekler, kapat } = await sayfaAc(390);
    await onizle(page);
    expect(await page.evaluate(tasmalar)).toEqual([]);
    // Önizlemede yalnız Nöbetçi'nin kendi okuma uçları (maskeli ad listesi, taban adresleri); POST yok.
    expect(istekler.filter((q) => !q.url.startsWith(nobetci.adres))).toEqual([]);
    expect(istekler.filter((q) => q.govde).map((q) => new URL(q.url).pathname)).toEqual([]);
    await page.getByRole('button', { name: 'Devam: servisi tanımla' }).click();
    await expect(page.locator('.sihirbaz-adimlari li.simdiki')).toContainText('Adresler');
    expect(await page.evaluate(tasmalar)).toEqual([]);
    // Önceki testte "example" anahtarlı servis eklendi: aynı anahtar ileri geçirmez, ad değişince geçer.
    await expect(page.getByText('"example" anahtarlı servis zaten var.')).toBeVisible();
    await page.getByLabel('Servis adı').fill('Example Dar');
    await page.getByRole('button', { name: 'İleri' }).click();
    await expect(page.locator('.rest-ucu')).toHaveCount(2);
    expect(await page.evaluate(tasmalar)).toEqual([]);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('bozuk tırnak anlaşılır hata verir; hata metni yapıştırılanı içermez', async () => {
    const { page, kapat } = await sayfaAc(1440);
    await page.goto('/#/servisler/yeni');
    await page.getByRole('tab', { name: 'cURL yapıştır' }).click();
    await page.getByLabel('cURL komutları').fill("curl 'https://example.com/api/gizli-deger-9");
    await page.getByRole('button', { name: 'Önizle' }).click();
    const hata = page.getByRole('alert').filter({ hasText: 'tek tırnak' });
    await expect(hata).toContainText("1. satırda açılan tek tırnak (') kapanmamış");
    await expect(hata).not.toContainText('gizli-deger');
    await expect(page.locator('.curl-onizleme')).toHaveCount(0);
    await kapat();
  });
});
