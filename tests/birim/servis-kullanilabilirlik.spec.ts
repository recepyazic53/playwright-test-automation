// KORUMA TESTİ — Servis sayfalarının kullanılabilirlik düzeltmeleri (v1.4):
//   1. REST isteğinin HTTP metodu değişince (ör. POST → GET) eski metot hiçbir yerde kalmaz: İşlemler'deki istek başlığı anında,
//      kaydedince o isteğin metodunu izleyen senaryolar (listede, senaryo formunda, Dene'de) yeni metotla. Kök neden: başlıktaki
//      rozet ilk çizimde bir kez yazılıyordu; senaryonun istek tanımı (icerik.http.metot) uç değişince güncellenmiyordu.
//   2. Senaryo listesinde tam istek adresi (ortamın taban adresi + yol); gizli adlı sorgu parametresinin değeri maskeli.
//   3. Servis senaryo formunda "N alan düzeltilmeli" özeti yazdıkça / seçtikçe güncellenir (ekran senaryo formu zaten anlık).
//   4. Servis ekle sihirbazı WSDL'in "Yol + Denetle" ile kendiliğinden istendiğini yazar.
//   5. Servis akışı: akışın senaryolarının yeri üstte (sayaç + bağlantı), Dene onayı varsayılan değerleri anlatır, "eski tür" yok.
//   6. Servis sayfasında üst menü "Senaryolar › Servisler", başlık izinde Senaryolar bağlantısı.
//   7. "Son yanıttan kontrol öner" açılınca sağ alttaki koşu paneli küçülür; "Ekle" düğmelerinin üstüne binmez.
// Güvenlik: geçici veritabanı, yalnız 127.0.0.1 (sahte REST ve SOAP sunucuları); tarayıcının Nöbetçi dışındaki her isteği
// engellenir ve raporlanır.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { sahteSoapSunucusu } from './servis-fikstur';

type Nesne = Record<string, any>;

/** Sahte REST sunucusu (127.0.0.1): her isteğe aynı JSON yanıtı; gelen yöntemler kaydedilir. ayar.gecikmeMs: yanıt gecikmesi. */
async function sahteRestSunucusu(): Promise<{ adres: string; yontemler: string[]; ayar: { gecikmeMs: number }; kapat: () => Promise<void> }> {
  const yontemler: string[] = [];
  const ayar = { gecikmeMs: 0 };
  const sunucu: Server = createServer((q, y) => {
    yontemler.push(String(q.method));
    q.resume();
    q.on('end', () => setTimeout(() => {
      y.writeHead(200, { 'Content-Type': 'application/json' });
      y.end(JSON.stringify({ siparis: { no: 42, durum: 'ACIK', tutar: 125.5, musteri: 'Deneme', kalem: 3 }, toplam: 3, sayfa: 1, sonraki: false }));
    }, ayar.gecikmeMs));
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', () => coz()));
  return { adres: `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`, yontemler, ayar, kapat: () => new Promise((coz) => sunucu.close(() => coz())) };
}

test.describe('servis sayfaları: kullanılabilirlik', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Servis-KU-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let rest: Awaited<ReturnType<typeof sahteRestSunucusu>>;
  let soap: Awaited<ReturnType<typeof sahteSoapSunucusu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let soapId = '';
  let taban = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-ku-'));
    rest = await sahteRestSunucusu();
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Servis KU Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    taban = `${rest.adres}/api/v2`;
    // Uç POST ile açılır (sihirbazın varsayılanı); başlangıç senaryosu metodu uçtan alır.
    const r = await basarili('/platform/servis/rest/kaydet', {
      projeId, anahtar: 'siparis', ad: 'Sipariş', tabanlar: { [ortamId]: taban },
      uclar: [
        { ad: 'siparisSorgula', metot: 'POST', yol: '/siparis', sorgu: [{ ad: 'no', deger: '42' }, { ad: 'token', deger: 'ornek-gizli' }] },
        { ad: 'siparisSil', metot: 'DELETE', yol: '/siparis' }
      ],
      senaryolar: ['siparisSorgula', 'siparisSil']
    });
    servisId = String(r.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId, yol: '/Servis/ornek.asmx' });
    soapId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await rest?.kapat();
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  /** Sayfa: Nöbetçi dışındaki her istek engellenir ve kaydedilir; sayfa hataları toplanır. */
  async function sayfaAc(genislik = 1440, yukseklik = 900): Promise<{ page: Page; hatalar: string[]; disari: string[]; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik }, reducedMotion: 'reduce' });
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

  test('POST → GET: istek başlığı anında; kaydedince metodu izleyen senaryo listede ve formda GET; tam adres maskeli', async () => {
    test.setTimeout(90_000);
    const { page, hatalar, disari, kapat } = await sayfaAc();
    await page.goto(`/#/servisler/s/${servisId}/islemler`);
    const uc = page.locator('fieldset.rest-ucu').filter({ hasText: 'siparisSorgula' });
    await expect(uc.locator('legend')).toContainText('POST');
    await uc.getByLabel('HTTP işlemi').selectOption('GET');
    // Başlıktaki metot rozeti seçimle aynı (eskiden ilk çizimdeki POST kalıyordu).
    await expect(uc.locator('legend')).toContainText('GET');
    await expect(uc.locator('legend')).not.toContainText('POST');
    await page.getByRole('button', { name: 'İstekleri kaydet' }).click();
    await expect(page.getByText('İstekler kaydedildi.')).toBeVisible();

    // Sunucu: metodu izleyen senaryo GET'e geçti; bilerek başka metotlu senaryo (DELETE) dokunulmadı.
    const d = await api(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const sn = (baslik: string) => d.senaryolar.find((x: Nesne) => x.baslik === baslik);
    expect(sn('siparisSorgula').icerik.http.metot).toBe('GET');
    expect(sn('siparisSil').icerik.http.metot).toBe('DELETE');

    // Liste: istek hücresinde GET ve tam adres (taban + yol); token maskeli, düz değer hiçbir yerde yok.
    await page.goto(`/#/servisler/s/${servisId}`);
    const satir = page.locator('tr[data-senaryo]').filter({ hasText: 'siparisSorgula' }).first();
    const hucre = satir.locator('.istek-hucresi');
    await expect(hucre.locator('.http-metodu')).toHaveText('GET');
    await expect(hucre).not.toContainText('POST');
    const adres = hucre.locator('.istek-adresi');
    await expect(adres).toContainText(rest.adres);
    const ipucu = String(await adres.getAttribute('title'));
    expect(ipucu).toContain(`TEST: GET ${taban}/siparis?no=42&token=`);
    expect(ipucu).not.toContain('ornek-gizli');
    expect(await page.locator('main').innerText()).not.toContain('ornek-gizli');

    // Senaryo formu: HTTP metodu GET.
    await satir.getByRole('link', { name: 'siparisSorgula', exact: true }).click();
    await expect(page.getByLabel('HTTP metodu')).toHaveValue('GET');
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });

  test('servis senaryo formu: "N alan düzeltilmeli" yazdıkça ve seçtikçe güncellenir; eski hata mesajı düzeltilince kalkar', async () => {
    test.setTimeout(60_000);
    const { page, hatalar, disari, kapat } = await sayfaAc();
    await page.goto(`/#/servisler/s/${soapId}/senaryo/yeni`);
    const ozet = page.locator('.servis-dogrulama-ozeti');
    // Başlık boş: 1 sorun (başka hiçbir girdi yokken).
    await expect(ozet).toContainText('1 alan düzeltilmeli');
    // Kaydet: başlık hatası yazılır; başlık yazılınca (kaydetmeden) özet ve alan hatası güncellenir.
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Başlık boş olamaz.')).toBeVisible();
    await page.getByLabel('Başlık').fill('Anlık doğrulama');
    await expect(ozet).toContainText('Tüm kurallar sağlanıyor');
    await expect(page.getByText('Başlık boş olamaz.')).toHaveCount(0);
    // Alanın kaynağı "Tablodan" (sütun seçilmedi): sayı hemen artar; "Gönderme"ye dönünce azalır.
    const kaynak = page.getByLabel('IdentityNumber değer kaynağı');
    await kaynak.selectOption('tablo');
    await expect(ozet).toContainText('1 alan düzeltilmeli');
    // Kaydet'in yazdığı mesaj sorun giderilince (kaydetmeden) kalkar.
    await page.getByRole('button', { name: 'Kaydet' }).click();
    const mesaj = page.getByRole('alert').filter({ hasText: 'tablo sütunu seçilmedi' });
    await expect(mesaj).toBeVisible();
    await page.getByLabel('IdentityNumber değer kaynağı').selectOption('gonderme');
    await expect(ozet).toContainText('Tüm kurallar sağlanıyor');
    await expect(mesaj).toHaveCount(0);
    // Anlaşılmayan header satırı da sayılır; düzeltilince kalkar.
    await page.getByLabel('HTTP header').fill('bozuk satır');
    await expect(ozet).toContainText('1 alan düzeltilmeli');
    await page.getByLabel('HTTP header').fill('X-Deneme: 1');
    await expect(ozet).toContainText('Tüm kurallar sağlanıyor');
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });

  test('Dene → "Son yanıttan kontrol öner": koşu bittiyse panel kapanır, sürüyorsa küçülür; "Ekle" düğmeleri panelin altında kalmaz', async () => {
    test.setTimeout(120_000);
    const { page, hatalar, disari, kapat } = await sayfaAc(1280, 800);
    const d = await api(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const sn = d.senaryolar.find((x: Nesne) => x.baslik === 'siparisSorgula');
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${sn.id}`);
    const deneOnayla = async () => {
      await page.getByRole('button', { name: 'Dene', exact: true }).click();
      await page.getByRole('dialog', { name: 'TEST ortamına istek atılsın mı?' }).getByRole('button', { name: 'Dene' }).click();
    };
    const once = rest.yontemler.length;
    await deneOnayla();
    const panel = page.locator('.servis-kosu-paneli');
    await expect(panel).toContainText('Servis koşusu bitti');
    // İstek GET ile gitti (uç GET'e çevrilmişti).
    expect(rest.yontemler.slice(once)).toEqual(['GET']);
    const oner = page.getByRole('button', { name: 'Son yanıttan kontrol öner' });
    const liste = page.locator('.yanit-kontrol-paneli');
    const ekleler = liste.getByRole('button', { name: /: kontrol ekle$/ });
    /** Klavyeyle sırayla gezilen (ve kaydırılarak getirilen) her "Ekle"nin üstünde başka öğe yok (scroll-padding). */
    const ekleDugmeleriAcik = async () => {
      const n = await ekleler.count();
      expect(n).toBeGreaterThan(2);
      await page.evaluate(() => window.scrollTo(0, 0));
      for (let k = 0; k < n; k++) {
        const ustte = await ekleler.nth(k).evaluate((el) => {
          el.scrollIntoView({ block: 'nearest' });
          const r = el.getBoundingClientRect();
          const x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return Boolean(x && (x === el || el.contains(x))) || `${x?.tagName}.${x?.className} ${Math.round(r.top)}/${innerHeight}`;
        });
        expect(ustte, `${k + 1}. "Ekle" düğmesinin üstünde başka öğe var`).toBe(true);
      }
      return n;
    };

    // 1) Koşu bitmişken liste açılınca panel tamamen kapanır.
    await oner.click();
    await expect(ekleler.first()).toBeVisible();
    await expect(panel).toHaveCount(0);
    await ekleDugmeleriAcik();

    // 2) Koşu sürerken: panel kapanmaz, küçülür; düğmeler yine altında kalmaz, sayfanın sonu panelin üstüne kaydırılabilir.
    await liste.getByRole('button', { name: 'Paneli kapat' }).click();
    rest.ayar.gecikmeMs = 15_000;
    try {
      await deneOnayla();
      await expect(panel).toContainText('Servis koşusu sürüyor');
      await oner.click();
      await expect(ekleler.first()).toBeVisible();
      await expect(panel).toHaveClass(/kucuk/);
      await expect(panel).toContainText('Servis koşusu sürüyor');
      const n = await ekleDugmeleriAcik();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const [sonKutu, panelKutu] = await Promise.all([ekleler.nth(n - 1).boundingBox(), panel.boundingBox()]);
      expect(sonKutu && panelKutu && sonKutu.y + sonKutu.height <= panelKutu.y + 1).toBe(true);
    } finally { rest.ayar.gecikmeMs = 0; }
    // Koşu, liste açıkken bitince panel kapanır.
    await expect(panel).toHaveCount(0, { timeout: 40_000 });
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });

  test('servis akışı: senaryoların yeri üstte, Dene onayı varsayılan değerleri anlatır; "eski tür" ifadesi yok', async () => {
    test.setTimeout(60_000);
    const akis = await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Sorgu akışı', tur: 'akis', icerik: { adimlar: [
      { id: 'a1', ad: 'Sorgula', tur: 'operasyon', servisId, operasyon: 'siparisSorgula', okumalar: [] }
    ] } });
    const { page, hatalar, disari, kapat } = await sayfaAc();
    await page.goto(`/#/servisler/s/${servisId}/akislar/${String(akis.id)}`);
    const ust = page.locator('.akis-senaryo-baglantisi');
    await expect(ust).toContainText('Bu akışın henüz senaryosu yok.');
    await expect(ust.getByRole('link', { name: 'Senaryo ekle' })).toHaveAttribute('href', new RegExp(`/senaryo/yeni\\?akis=${String(akis.id)}$`));
    await ust.getByRole('button', { name: 'Senaryolar bölümüne git' }).click();
    await expect(page.getByRole('heading', { name: 'Bu akışın senaryoları' })).toBeFocused();
    // Dene onayı: hangi değerlerle koştuğu ve kendi değerlerle nasıl deneneceği (istek atmadan vazgeçilir).
    await page.getByRole('button', { name: 'Dene', exact: true }).click();
    const onay = page.getByRole('dialog', { name: 'TEST ortamına istek atılsın mı?' });
    await expect(onay).toContainText('(varsayılan değerlerle)');
    await expect(onay).toContainText('servisin alan varsayılanları');
    await expect(onay).toContainText('"Bu akışın senaryoları"');
    await expect(onay).toContainText('REST isteğinde gövde boş gider');
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    // Adım türü: "Kayıtlı tek istek senaryosu"; ürünün iç tarihi ("eski tür") yazmaz.
    await expect(page.getByLabel('1. adım türü').locator('option[value="senaryo"]')).toHaveText('Kayıtlı tek istek senaryosu');
    expect(await page.locator('main').innerText()).not.toContain('eski tür');
    // Akış senaryosu eklenince sayaç görünür.
    await basarili('/platform/servis/akis-senaryosu/kaydet', { projeId, servisId, baslik: 'Sorgu değerleri', kapsam: 'test', kosuyaDahil: true,
      icerik: { tur: 'akis', akisId: akis.id, adimlar: {} } });
    await page.reload();
    await expect(page.locator('.akis-senaryo-baglantisi')).toContainText('Bu akışın 1 senaryosu var.');
    await expect(page.getByRole('button', { name: 'Senaryolara git (1)' })).toBeVisible();
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });

  test('konum: üst menüde "Senaryolar › Servisler", başlık izinde Senaryolar bağlantısı; bağlantının adı değişmez', async () => {
    const { page, hatalar, kapat } = await sayfaAc();
    await page.goto(`/#/servisler/s/${servisId}`);
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    const senaryolar = menu.getByRole('link', { name: 'Senaryolar', exact: true });
    await expect(senaryolar).toHaveAttribute('aria-current', 'page');
    await expect(senaryolar.locator('.nav-alt-bolum')).toHaveText('› Servisler');
    await expect(page.locator('main .kirinti').getByRole('link', { name: 'Senaryolar' })).toHaveAttribute('href', '#/senaryolar');
    await expect(page.locator('main .kirinti')).toContainText('Servisler');
    // Senaryolar sayfasında ek görünmez.
    await page.goto('/#/senaryolar');
    await expect(senaryolar.locator('.nav-alt-bolum')).toBeHidden();
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('servis ekle: WSDL notu (Yol + Denetle ile kendiliğinden istenir); Oluştur menüsüyle tutarlı; istek atılmaz', async () => {
    const { page, hatalar, disari, kapat } = await sayfaAc();
    await page.goto('/#/servisler/yeni');
    await expect(page.locator('.wsdl-notu')).toContainText('"Denetle"ye basınca WSDL');
    await page.getByLabel('Servis adı').fill('Wsdl Notu');
    await page.getByRole('button', { name: 'İleri' }).click();
    const not = page.getByRole('note').filter({ hasText: 'WSDL nereden gelir?' });
    await expect(not).toContainText('"?wsdl"');
    await expect(page.getByRole('button', { name: 'Denetle' })).toHaveAttribute('title', /WSDL/);
    await page.getByRole('button', { name: /Oluştur/ }).first().click();
    await expect(page.getByText('WSDL (adresinden kendiliğinden okunur)')).toBeVisible();
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });

  test('sözleşme alan tablosu: yol girintisi CSS değişkeniyle; satır içi style özniteliği ve CSP ihlali yok', async () => {
    const sema = { type: 'object', properties: { siparis: { type: 'object', properties: { no: { type: 'integer' }, kalemler: { type: 'array', items: { type: 'object', properties: { ad: { type: 'string' } } } } } }, toplam: { type: 'integer' } } };
    const o = await basarili('/platform/servis/sozlesme/onizle', { projeId, servisId, operasyon: 'siparisSorgula', kaynak: 'jsonSchema', metin: JSON.stringify(sema) });
    await basarili('/platform/servis/sozlesme/kaydet', { projeId, servisId, operasyon: 'siparisSorgula', sozlesme: o.taslak, onay: true });
    const { page, hatalar, kapat } = await sayfaAc();
    const csp: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) csp.push(m.text()); });
    await page.goto(`/#/servisler/s/${servisId}/sozlesme/siparisSorgula`);
    const yollar = page.locator('code.sozlesme-girinti');
    await expect(yollar.first()).toBeVisible();
    expect(await page.locator('code.sozlesme-girinti[style*="padding"]').count()).toBe(0);
    const dolgular = await yollar.evaluateAll((l) => l.map((e) => parseFloat(getComputedStyle(e).paddingInlineStart)));
    expect(Math.max(...dolgular)).toBeGreaterThan(Math.min(...dolgular));
    expect(csp).toEqual([]);
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('ekran senaryo formu (karşılaştırma): "N alan düzeltilmeli" yazarken ve seçerken, kaydetmeden güncellenir', async () => {
    test.setTimeout(60_000);
    const alanTanimi = (id: string, tip: string, ek: Nesne = {}) => ({ id, tip, etiket: { ekran: id }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'dusuk' }, ...ek });
    const model = { semaSurumu: 2, tur: 'ekran', id: 'dogrulama-ekrani', ad: 'Doğrulama Ekranı', aciklama: 'Nötr fikstür.', ekranUrl: '/form/', girisGerekmez: true,
      specDosyasi: 'tests/scenarios/dogrulama-ekrani/dogrulama-ekrani.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi' }, kosullar: {},
      adimlar: [{ id: 'bilgi', sira: 1, baslik: 'Bilgi girilir', bolumler: [{ id: 'b1', baslik: 'Bilgi', alanlar: [alanTanimi('AdSoyad', 'metin'), alanTanimi('Tutar', 'sayi'),
        alanTanimi('Sehir', 'secim', { secenekler: [{ deger: 'a', metin: 'A' }, { deger: 'b', metin: 'B' }], seceneklerDurumu: 'tam' })] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }], basariGostergesi: { tur: 'metin', deger: 'Tamam', secici: '#sonuc' } } }],
      senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: [] };
    await basarili('/platform/sayfa-paketi/ekle', { projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId], paket: {
      tur: 'sayfa-paketi', surum: 1, meta: { ekran: { anahtar: 'dogrulama-ekrani', ad: 'Doğrulama Ekranı', urlYolu: '/form/' }, olusturan: 'test', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
      model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: [] } });
    const ekranId = String(((await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[]).find((e) => e.anahtar === 'dogrulama-ekrani')?.id);
    const { page, hatalar, disari, kapat } = await sayfaAc(1360, 1000);
    await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`);
    const ozet = page.locator('.dogrulama-ozeti');
    await expect(ozet).toContainText('4 alan düzeltilmeli');
    await page.getByRole('textbox', { name: 'Başlık' }).fill('Anlık sayı');
    await expect(ozet).toContainText('3 alan düzeltilmeli');
    await page.getByRole('textbox', { name: 'AdSoyad' }).fill('Ayşe');
    await expect(ozet).toContainText('2 alan düzeltilmeli');
    await page.getByLabel('Tutar').fill('5');
    await expect(ozet).toContainText('1 alan düzeltilmeli');
    await page.getByLabel('Sehir').first().selectOption('a');
    await expect(ozet).toContainText('Tüm kurallar sağlanıyor');
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await kapat();
  });

  test('uç yolu değişince ucu izleyen senaryoların yolu güncellenir (sorgu ve yer tutucu değeri korunur); farklı yazılmış yol korunur', async () => {
    // Bilerek farklı yollu senaryo (aynı uç) ve yer tutucusu senaryoda doldurulmuş senaryo.
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Farklı yol', kapsam: 'test', kosuyaDahil: false,
      icerik: { operasyon: 'siparisSil', govde: '', kontroller: [{ tur: 'durumKodu', deger: '200-299' }], http: { metot: 'DELETE', yol: '/baska/yol' } } });
    const s0 = (await api(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    const uclar: Nesne[] = (s0.ayarlar.operasyonlar as Nesne[]).map((o) => ({ ...o, eskiAd: o.ad }));
    const sil = uclar.find((u) => u.ad === 'siparisSil') as Nesne;
    const sorgula = uclar.find((u) => u.ad === 'siparisSorgula') as Nesne;
    sil.yol = '/siparis/{no}';
    await basarili('/platform/servis/rest/kaydet', { projeId, id: servisId, anahtar: s0.anahtar, ad: s0.ad, uclar });
    await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Numaralı silme', kapsam: 'test', kosuyaDahil: false,
      icerik: { operasyon: 'siparisSil', govde: '', kontroller: [{ tur: 'durumKodu', deger: '200-299' }], http: { metot: 'DELETE', yol: '/siparis/${Siparis.no}?onay=1' } } });
    // İkinci değişiklik: yer tutucunun yeri değişir; sorgula ucunun yolu da değişir.
    sil.yol = '/v2/siparis/{no}/iptal';
    sorgula.yol = '/v2/siparis';
    await basarili('/platform/servis/rest/kaydet', { projeId, id: servisId, anahtar: s0.anahtar, ad: s0.ad, uclar });
    const d = await api(`/platform/servis?projeId=${projeId}&id=${servisId}`);
    const yol = (baslik: string) => d.senaryolar.find((x: Nesne) => x.baslik === baslik).icerik.http;
    expect(yol('siparisSil')).toMatchObject({ metot: 'DELETE', yol: '/v2/siparis/${no}/iptal' });
    expect(yol('Numaralı silme').yol).toBe('/v2/siparis/${Siparis.no}/iptal?onay=1');
    expect(yol('Farklı yol').yol).toBe('/baska/yol');
    expect(yol('siparisSorgula')).toMatchObject({ metot: 'GET' });
    expect(yol('siparisSorgula').yol).toMatch(/^\/v2\/siparis\?no=42&token=/);
  });
});
