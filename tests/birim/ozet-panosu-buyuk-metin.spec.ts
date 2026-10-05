// UÇTAN UCA (yerel) — Özet panosu SQL kartında büyük metin sütunları (Oracle CLOB benzeri) ve kaydırma konumu. Geçici veritabanı + ayrı
// Nöbetçi (127.0.0.1); SQL bağlantısı bellek içi SAHTE sürücüdür (TEST_SUNUCU_SAHTE_SQL_SURUCUSU; hiçbir adrese bağlanılmaz). Servis
// yalnız kasada kayıtlıdır; servise HİÇ istek atılmaz (örnek yalnız kaydedilir). Denetlenenler:
//   - sürücü katmanı: Lob (getData) nesnesi metne çevrilir, 100 KB kesme, ikili veri iletisi; SQL adımı aynı kuralla metin üzerinden;
//   - kartta hücre metin olarak ("[object Object]" yok), tek satır önizleme + "Görüntüle"; liste görünümü kısaltır;
//   - pencere: XML / JSON girintili, kesik metin ham, arama, kopyala, Esc ile kapanır ve odak geri döner;
//   - "Bu isteği servis analizine örnek olarak ekle": SOAP işlemine göre önerilen metot (Approve), ad, ISSUCCESS'e göre önerilen durum,
//     örnek doğru metoda eklenir ve "Servisi analiz et" sayfasında görünür;
//   - kaydırma: sayfa aşağıdayken tablo yatay kaydırılınca (scrollLeft, tekerlek deltaX, klavye, çubuk), köşe tutamağıyla kart
//     büyütülüp küçültülünce ve sütun genişliği değişince window.scrollY değişmez; kart DOM'u yeniden oluşmaz;
//   - 1440 / 390 px'te yatay taşma yok.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { servisKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { surucuYukleyiciAyarla, veritabaniSorgusu } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import { sqlAdiminiKos, sqlTanimiDogrula } from '../../scripts/platform/sql/sql-adimi.mjs';
import {
  HUCRE_METIN_SINIRI, KESILDI_EKI, durumOner, govdeGibiMi, govdeKokAdi, hucreyiDuzenle, metinKisalt, metinSinirla, metniBicimle, metotOner, satirZamani
} from '../../scripts/platform/sql/buyuk-metin.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_IKILI, SAHTE_JSON_ISTEGI, SAHTE_SOAP_ISTEGI, SAHTE_UZUN_ISTEK, sahteLob, yukleyici } from './sahte-sql-surucusu.mjs';

type Nesne = Record<string, any>;
const LOB_SORGUSU = 'SELECT /* lob */ id, ISLEMZAMANI, ISSUCCESS, INPUTCONTENT, OUTPUTCONTENT, EKDOSYA, EKBILGI FROM servis_kayitlari ORDER BY id';
const PG = { surucu: 'postgres' as const, sunucu: '127.0.0.1', port: 5433, veritabani: 'uyg', kullanici: 'okur', parola: 'buyuk-metin-gizli' };

// ---------------------------------------------------------------------------------------------------------------------------------
// Saf kurallar ve sürücü katmanı (tarayıcısız)
// ---------------------------------------------------------------------------------------------------------------------------------
test.describe('büyük metin: kurallar ve sürücü katmanı', () => {
  test.afterAll(() => surucuYukleyiciAyarla(null));

  test('hücre: Lob okunur, 100 KB kesilir (çok baytlı karakter bölünmez), ikili veri iletisi, metin Buffer metne çevrilir', async () => {
    expect(await hucreyiDuzenle(sahteLob('<a>merhaba</a>'))).toBe('<a>merhaba</a>');
    expect(hucreyiDuzenle(SAHTE_IKILI)).toBe('(ikili veri, 16 bayt)');
    expect(hucreyiDuzenle(Buffer.from('düz metin', 'utf8'))).toBe('düz metin');
    expect(hucreyiDuzenle(Buffer.from('düz metin', 'utf8'), { ikili: true })).toBe('(ikili veri, 10 bayt)');
    expect(hucreyiDuzenle(Buffer.from([0, 65]), { ikili: false })).toBe('\u0000A');
    expect(hucreyiDuzenle({ a: 1 })).toBe('{"a":1}');
    expect(hucreyiDuzenle(42)).toBe(42);
    const uzun = metinSinirla('ğ'.repeat(80_000));
    expect(uzun.endsWith(KESILDI_EKI)).toBe(true);
    expect(Buffer.byteLength(uzun.slice(0, -KESILDI_EKI.length))).toBeLessThanOrEqual(HUCRE_METIN_SINIRI);
    expect(uzun.slice(0, -KESILDI_EKI.length)).toMatch(/^ğ+$/);
    expect(metinSinirla('kısa')).toBe('kısa');
  });

  test('biçim, gövde, kök / metot, durum ve zaman önerileri', () => {
    const x = metniBicimle(SAHTE_SOAP_ISTEGI);
    expect(x.tur).toBe('xml');
    expect(x.metin).toContain('\n    <ns:Approve>\n      <ns:BasvuruNo>B-2026-0042</ns:BasvuruNo>');
    expect(metniBicimle(SAHTE_JSON_ISTEGI).metin).toContain('\n  "islem": "Odeme",');
    expect(metniBicimle('<a><b></a>')).toEqual({ metin: '<a><b></a>', tur: 'duz', bicimlendi: false });
    expect(metniBicimle(`${SAHTE_UZUN_ISTEK.slice(0, 500)}${KESILDI_EKI}`).bicimlendi).toBe(false);
    expect(govdeGibiMi(SAHTE_SOAP_ISTEGI)).toBe(true);
    expect(govdeGibiMi(SAHTE_JSON_ISTEGI)).toBe(true);
    expect(govdeGibiMi('düz bir açıklama metni')).toBe(false);
    expect(govdeKokAdi(SAHTE_SOAP_ISTEGI)).toBe('Approve');
    expect(govdeKokAdi('<x:ApproveRequest xmlns:x="u"><a>1</a></x:ApproveRequest>')).toBe('ApproveRequest');
    expect(metotOner('ApproveRequest', ['Reject', 'Approve'])).toBe('Approve');
    expect(metotOner('Bilinmeyen', ['Reject', 'Approve'])).toBeNull();
    expect(durumOner(['ID', 'IS_SUCCESS'], [1, 'Y'])).toEqual({ durum: 'basarili', sutun: 'IS_SUCCESS', deger: 'Y' });
    expect(durumOner(['ISSUCCESS'], [0])?.durum).toBe('hata');
    expect(durumOner(['DURUM'], ['x'])).toBeNull();
    expect(satirZamani(['ISLEMZAMANI'], ['2026-10-01T09:15:00'])).toBe('01.10.2026 09:15');
    expect(metinKisalt(`a\n${'b'.repeat(200)}`).length).toBe(120);
  });

  test('sürücü: CLOB benzeri sütunlar metin, 3. satır 100 KB\'ta kesik, ikili sütun iletisi; SQL adımı metin üzerinden karşılaştırır', async () => {
    surucuYukleyiciAyarla(yukleyici);
    const r = await veritabaniSorgusu(PG, LOB_SORGUSU, {});
    const i = r.sutunlar.indexOf('INPUTCONTENT');
    expect(r.satirlar[0][i]).toBe(SAHTE_SOAP_ISTEGI);
    expect(r.satirlar[1][i]).toBe(SAHTE_JSON_ISTEGI);
    const kesik = String(r.satirlar[2][i]);
    expect(kesik.endsWith(KESILDI_EKI)).toBe(true);
    expect(Buffer.byteLength(kesik.slice(0, -KESILDI_EKI.length))).toBe(HUCRE_METIN_SINIRI);
    expect(r.satirlar[0][r.sutunlar.indexOf('EKDOSYA')]).toBe('(ikili veri, 16 bayt)');
    expect(r.satirlar.flat().some((v) => v !== null && typeof v === 'object')).toBe(false);
    // SQL adımı: aynı sürücü katmanı; beklenen değer metinle karşılaştırılır.
    const { tanim, hatalar } = sqlTanimiDogrula({ baglantiId: 'b1', sql: LOB_SORGUSU, beklenen: { tur: 'sutunDegeri', sutun: 'OUTPUTCONTENT', deger: '{"hata":"Yetersiz bakiye","kod":51}' } });
    expect(hatalar).toEqual([]);
    const ikinci = { ...tanim, sql: `${LOB_SORGUSU.replace('ORDER BY id', 'WHERE id = 2')}` };
    const yurutucu = (sql: string, p: Record<string, string>, s: { zamanAsimiMs: number | undefined; satirSiniri: number }) => veritabaniSorgusu(PG, sql, p, s);
    const sonuc = await sqlAdiminiKos(ikinci, { adimAdi: 'SQL', yurutucu, coz: () => undefined });
    expect(sonuc.durum, sonuc.mesaj).toBe('basarili');
    const ilk = await sqlAdiminiKos({ ...tanim, beklenen: { tur: 'sutunDegeri', sutun: 'EKDOSYA', deger: '(ikili veri, 16 bayt)' } }, { adimAdi: 'SQL', yurutucu, coz: () => undefined });
    expect(ilk.durum, ilk.mesaj).toBe('basarili');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Arayüz
// ---------------------------------------------------------------------------------------------------------------------------------
test.describe('büyük metin: özet panosu arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Buyuk-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let baglantiId = '';
  let servisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).not.toBe(false); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ozet-buyuk-metin-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Büyük metin projesi' });
    const TEST = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    baglantiId = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'gunluk-db', ortamIdleri: [TEST], alanlar: PG }).id;
    // Servis yalnız kasada (WSDL / istek yok): iki SOAP metodu.
    servisId = servisKaydet(vt, { projeId, anahtar: 'onay-servisi', ad: 'Onay servisi', tur: 'soap',
      ayarlar: { yol: '/OnayServisi.svc', adresler: {}, operasyonlar: [{ ad: 'Reject' }, { ad: 'Approve' }] } });
    vt.kapat();
    mkdirSync(join(klasor, 'yedekler'), { recursive: true });
    writeFileSync(join(klasor, 'yedekler', 'otomatik-20261001-000000-000.tayedek'), 'sahte');
    nobetci = await nobetciBaslat(klasor, vtYolu, { TEST_SUNUCU_SAHTE_SQL_SURUCUSU: join(__dirname, 'sahte-sql-surucusu.mjs') });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    await basarili('/platform/proje/varsayilan', { id: projeId });
    // Pano: metin kartları (sayfa uzasın), ortada geniş tablo kartı, altında liste ve yine metin kartları.
    const metin = (id: string) => ({ id, tur: 'metin', boyut: 'tam', yukseklik: 4, ayar: { baslik: `Not ${id}`, not: 'Dolgu kartı.', baglantilar: [] } });
    const kartlar = [metin('m1'), metin('m2'), metin('m3'),
      { id: 't-lob', tur: 'sql', boyut: 'tam', ayar: { baslik: 'Servis günlüğü', hedef: { baglantiId }, sorgu: LOB_SORGUSU, gorunum: 'tablo',
        sutunGenislikleri: { ISLEMZAMANI: 260, EKDOSYA: 260, EKBILGI: 420 } } },
      { id: 'l-lob', tur: 'sql', boyut: 'orta', ayar: { baslik: 'İstek listesi', hedef: { baglantiId }, sorgu: LOB_SORGUSU, gorunum: 'liste', sutunlar: ['INPUTCONTENT'] } },
      metin('m4'), metin('m5'), metin('m6'), metin('m7')];
    await basarili('/platform/pano/kaydet', { projeId, duzen: { kartlar } });
    for (const kartId of ['t-lob', 'l-lob']) await basarili('/platform/pano/sql/yenile', { projeId, kartId });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  async function sayfaAc(genislik: number, yukseklik = 900): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik }, reducedMotion: 'reduce' });
    await baglam.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: nobetci.adres });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(`pageerror: ${String(e)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::|409|Failed to load resource/.test(m.text())) hatalar.push(`console: ${m.text()}`); });
    // Servise istek gitmez: Nöbetçi dışındaki her adres sayılır.
    page.on('request', (r) => { if (!r.url().startsWith(nobetci.adres) && !r.url().startsWith('data:')) hatalar.push(`dış istek: ${r.url()}`); });
    await page.goto('/#/sonuclar/ozet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main .iskelet, main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
    return { page, hatalar, kapat: () => baglam.close() };
  }

  /** Yatay taşma yok (sayfa ve açık pencere; kendi kaydırma kutusundakiler hariç). */
  async function tasmaYok(page: Page): Promise<void> {
    const sorunlar = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > window.innerWidth) out.push(`sayfa ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
      const kaydirmaIcinde = (e: Element) => {
        for (let p = e.parentElement; p; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
        return false;
      };
      for (const el of Array.from(document.querySelectorAll('main *, dialog[open] *'))) {
        if (kaydirmaIcinde(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > window.innerWidth + 1 || r.left < -1)) out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)}: ${Math.round(r.left)}–${Math.round(r.right)}`);
      }
      return out.slice(0, 8);
    });
    expect(sorunlar).toEqual([]);
  }

  const tabloKarti = (page: Page) => page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Servis günlüğü' }) });
  const hucre = (kart: Locator, satir: number, sutun: string) => kart.locator('tbody tr').nth(satir).locator('td').nth(['id', 'ISLEMZAMANI', 'ISSUCCESS', 'INPUTCONTENT', 'OUTPUTCONTENT', 'EKDOSYA', 'EKBILGI'].indexOf(sutun));

  test('kartta hücre metin olarak; tek satır önizleme + Görüntüle; ikili veri; liste kısaltır; 1440 / 390 taşma yok', async () => {
    for (const genislik of [1440, 390]) {
      const { page, hatalar, kapat } = await sayfaAc(genislik);
      const kart = tabloKarti(page);
      await expect(kart.locator('tbody tr')).toHaveCount(3);
      await expect(page.locator('main')).not.toContainText('[object Object]');
      const giris = hucre(kart, 0, 'INPUTCONTENT');
      await expect(giris.locator('.pano-hucre-onizleme')).toHaveText(/^<soapenv:Envelope .*…$/);
      expect((await giris.locator('.pano-hucre-onizleme').textContent())!.length).toBeLessThanOrEqual(120);
      const yukseklik = await giris.locator('.pano-hucre-onizleme').evaluate((e) => e.getBoundingClientRect().height);
      expect(yukseklik).toBeLessThan(24);
      await expect(giris.getByRole('button', { name: 'Görüntüle: INPUTCONTENT, 1. satır' })).toBeVisible();
      await expect(hucre(kart, 0, 'EKDOSYA')).toHaveText('(ikili veri, 16 bayt)');
      await expect(hucre(kart, 1, 'OUTPUTCONTENT')).toHaveText('{"hata":"Yetersiz bakiye","kod":51}');
      const liste = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'İstek listesi' }) }).locator('.pano-liste li');
      await expect(liste).toHaveCount(3);
      for (const m of await liste.allTextContents()) expect(m.length).toBeLessThanOrEqual(120);
      await tasmaYok(page);
      expect(hatalar).toEqual([]);
      await kapat();
    }
  });

  test('pencere: XML girintili, arama, kopyala, Esc ile kapanır; JSON girintili; kesik metin ham; 390 px taşma yok', async () => {
    const { page, hatalar, kapat } = await sayfaAc(1440);
    const kart = tabloKarti(page);
    const ac = hucre(kart, 0, 'INPUTCONTENT').getByRole('button', { name: 'Görüntüle: INPUTCONTENT, 1. satır' });
    await ac.click();
    const pencere = page.getByRole('dialog', { name: 'INPUTCONTENT · 1. satır' });
    await expect(pencere).toBeVisible();
    const icerik = pencere.locator('pre.pano-metin-icerik');
    expect(await icerik.textContent()).toContain('\n    <ns:Approve>\n      <ns:BasvuruNo>B-2026-0042</ns:BasvuruNo>');
    await expect(pencere.getByRole('searchbox', { name: 'Metinde ara' })).toBeFocused();
    await page.keyboard.type('basvuru');
    await expect(icerik.locator('mark')).toHaveCount(2);
    await expect(pencere.locator('.pano-metin-sayac')).toHaveText('1 / 2');
    await page.keyboard.press('Enter');
    await expect(pencere.locator('.pano-metin-sayac')).toHaveText('2 / 2');
    await expect(icerik.locator('mark.etkin')).toHaveText('Basvuru');
    // Girintili gösterim kapatılınca ham metin.
    await pencere.getByLabel('Girintili göster (XML)').uncheck();
    expect(await icerik.textContent()).toBe(SAHTE_SOAP_ISTEGI);
    await pencere.getByRole('button', { name: 'Kopyala' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SAHTE_SOAP_ISTEGI);
    await page.keyboard.press('Escape');
    await expect(pencere).toHaveCount(0);
    await expect(ac).toBeFocused();
    // JSON (2. satır): hücreye tıklamak da açar.
    await hucre(kart, 1, 'INPUTCONTENT').locator('.pano-hucre-onizleme').click();
    const json = page.getByRole('dialog', { name: 'INPUTCONTENT · 2. satır' });
    expect(await json.locator('pre').textContent()).toContain('\n  "islem": "Odeme",\n  "basvuruNo": "B-2026-0043",');
    await json.getByRole('button', { name: 'Kapat' }).click();
    // Kesik (3. satır): biçimlenmez, "kesildi" notu; gövde sayılmadığı için örnek ekleme düğmesi yok.
    await hucre(kart, 2, 'INPUTCONTENT').getByRole('button', { name: /Görüntüle/ }).click();
    const kesik = page.getByRole('dialog', { name: 'INPUTCONTENT · 3. satır' });
    await expect(kesik.locator('.pano-metin-bilgi')).toContainText('100 KB\'ta kesildi');
    expect((await kesik.locator('pre').textContent())!.endsWith(KESILDI_EKI)).toBe(true);
    await expect(kesik.getByRole('button', { name: /servis analizine/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // 390 px: pencere ve araçlar taşmaz.
    await page.setViewportSize({ width: 390, height: 800 });
    await hucre(kart, 0, 'OUTPUTCONTENT').getByRole('button', { name: /Görüntüle/ }).click();
    await expect(page.getByRole('dialog', { name: 'OUTPUTCONTENT · 1. satır' })).toBeVisible();
    await page.getByRole('button', { name: 'Bu isteği servis analizine örnek olarak ekle' }).click();
    await expect(page.getByLabel('Servis ve metot')).toBeVisible();
    await tasmaYok(page);
    await page.keyboard.press('Escape');
    expect(hatalar).toEqual([]);
    await kapat();
  });

  test('"Servis analizine ekle": Approve önerilir, durum ISSUCCESS\'ten, örnek metoda eklenir ve analiz sayfasında görünür', async () => {
    const { page, hatalar, kapat } = await sayfaAc(1440);
    const kart = tabloKarti(page);
    await hucre(kart, 0, 'INPUTCONTENT').getByRole('button', { name: /Görüntüle/ }).click();
    const pencere = page.getByRole('dialog', { name: 'INPUTCONTENT · 1. satır' });
    const ekle = pencere.getByRole('button', { name: 'Bu isteği servis analizine örnek olarak ekle' });
    await ekle.click();
    await expect(ekle).toHaveAttribute('aria-expanded', 'true');
    const metot = pencere.getByLabel('Servis ve metot');
    await expect(metot).toHaveValue(`${servisId}|Approve`);
    await expect(pencere.getByLabel('Örneğin adı')).toHaveValue('Servis günlüğü · 01.10.2026 09:15');
    await expect(pencere.getByRole('radio', { name: 'Başarılı' })).toBeChecked();
    await expect(pencere.locator('.pano-ornek-durum')).toContainText('ISSUCCESS = 1');
    await pencere.getByLabel('Örneğin adı').fill('Onay örneği');
    await pencere.getByRole('button', { name: 'Örneği ekle' }).click();
    await expect(pencere.locator('.pano-ornek-sonuc')).toContainText('"Onay örneği" Onay servisi › Approve örneklerine eklendi.');
    const s = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    expect(s.ayarlar.ornekIstekler.Approve).toHaveLength(1);
    expect(s.ayarlar.ornekIstekler.Approve[0]).toMatchObject({ ad: 'Onay örneği', govde: SAHTE_SOAP_ISTEGI, durum: 'basarili' });
    expect(s.ayarlar.ornekIstekler.Reject).toBeUndefined();
    // Aynı gövde ikinci kez eklenmez.
    await page.keyboard.press('Escape');
    await hucre(kart, 0, 'INPUTCONTENT').getByRole('button', { name: /Görüntüle/ }).click();
    const ikinci = page.getByRole('dialog', { name: 'INPUTCONTENT · 1. satır' });
    await ikinci.getByRole('button', { name: 'Bu isteği servis analizine örnek olarak ekle' }).click();
    await ikinci.getByRole('button', { name: 'Örneği ekle' }).click();
    await expect(ikinci.locator('.pano-ornek-sonuc')).toContainText('zaten örnek olarak var');
    // JSON isteği (2. satır, ISSUCCESS = 0): metot önerilmez, durum "Hata verdi" önerilir; kullanıcı Reject seçer.
    await page.keyboard.press('Escape');
    await hucre(kart, 1, 'INPUTCONTENT').getByRole('button', { name: /Görüntüle/ }).click();
    const json = page.getByRole('dialog', { name: 'INPUTCONTENT · 2. satır' });
    await json.getByRole('button', { name: 'Bu isteği servis analizine örnek olarak ekle' }).click();
    await expect(json.getByLabel('Servis ve metot')).toHaveValue('');
    await expect(json.getByRole('radio', { name: 'Hata verdi' })).toBeChecked();
    await json.getByLabel('Servis ve metot').selectOption(`${servisId}|Reject`);
    await json.getByRole('button', { name: 'Örneği ekle' }).click();
    const git = json.getByRole('link', { name: 'Servisi analiz et' });
    await expect(git).toHaveAttribute('href', `#/servisler/s/${servisId}/analiz`);
    const s2 = (await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`)).servis;
    expect(s2.ayarlar.ornekIstekler.Reject[0]).toMatchObject({ govde: SAHTE_JSON_ISTEGI, durum: 'hata' });
    expect(s2.ayarlar.ornekIstekler.Approve).toHaveLength(1);
    await git.click();
    await expect(page).toHaveURL(new RegExp(`#/servisler/s/${servisId}/analiz$`));
    await expect(page.getByRole('heading', { name: 'Servisi analiz et' })).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Approve metodu' }).click();
    await expect(page.locator('main .ornek-listesi')).toContainText('Onay örneği');
    expect(hatalar).toEqual([]);
    await kapat();
  });

  /** Sayfa aşağıdayken: kartın DOM öğesi işaretlenir; işlemden sonra window.scrollY aynı ve kart aynı öğe olmalı. */
  async function konumKorunur(page: Page, ad: string, islem: () => Promise<void>): Promise<void> {
    const once = await page.evaluate(() => {
      const k = document.querySelector('.pano-ogesi[data-kart-id="t-lob"]') as HTMLElement & { __isaret?: number };
      k.__isaret = 1;
      return window.scrollY;
    });
    expect(once, `${ad}: sayfa aşağıda olmalı`).toBeGreaterThan(200);
    await islem();
    // Ölçüm / yeniden çizim çerçeveleri bitsin.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
    const sonra = await page.evaluate(() => ({ y: window.scrollY, ayni: Boolean((document.querySelector('.pano-ogesi[data-kart-id="t-lob"]') as HTMLElement & { __isaret?: number }).__isaret) }));
    expect(Math.abs(sonra.y - once), `${ad}: scrollY ${once} → ${sonra.y}`).toBeLessThanOrEqual(1);
    expect(sonra.ayni, `${ad}: kart DOM'u yeniden oluştu`).toBe(true);
  }

  test('kaydırma: yatay kaydırma (scrollLeft, tekerlek, klavye, çubuk), köşe tutamağı, sütun genişliği sayfayı yukarı atmaz (1440 / 390)', async () => {
    test.setTimeout(120_000);
    for (const genislik of [1440, 390]) {
      const { page, hatalar, kapat } = await sayfaAc(genislik, 800);
      const kart = tabloKarti(page);
      const kutu = kart.locator('.pano-tablo');
      await expect(kart.locator('tbody tr')).toHaveCount(3);
      // Kartı görünür alanın ortasına getir (sayfa aşağıda).
      await kart.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 200));
      expect(await kutu.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeGreaterThan(100);
      const scrollLeft = () => kutu.evaluate((e) => e.scrollLeft);
      await konumKorunur(page, `${genislik} scrollLeft`, async () => {
        await kutu.evaluate(async (e) => {
          const bekle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          for (const x of [200, 400, e.scrollWidth, 300, 100, 0]) { e.scrollLeft = x; await bekle(); }
        });
      });
      await konumKorunur(page, `${genislik} tekerlek`, async () => {
        const r = (await kutu.boundingBox())!;
        await page.mouse.move(r.x + r.width / 2, r.y + Math.min(60, r.height / 2));
        await page.mouse.wheel(400, 0);
        await expect.poll(scrollLeft).toBeGreaterThan(0);
        await page.mouse.wheel(-800, 0);
        await expect.poll(scrollLeft).toBe(0);
      });
      await konumKorunur(page, `${genislik} klavye`, async () => {
        await kutu.evaluate((e) => (e as HTMLElement).focus({ preventScroll: true }));
        await page.keyboard.press('End');
        await expect.poll(scrollLeft).toBeGreaterThan(100);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Home');
        await expect.poll(scrollLeft).toBe(0);
      });
      await konumKorunur(page, `${genislik} çubuk`, async () => {
        const r = (await kutu.boundingBox())!;
        const altKenar = await kutu.evaluate((e) => e.getBoundingClientRect().height - e.clientHeight);
        const y = r.y + r.height - Math.max(2, altKenar / 2);
        await page.mouse.move(r.x + 20, y);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width / 2, y, { steps: 6 });
        await page.mouse.move(r.x + 10, y, { steps: 6 });
        await page.mouse.up();
      });
      // Sütun genişliği (kenar tutamağı): tablo yeniden kurulur, kart ve sayfa konumu yerinde; tablonun yatay kaydırması korunur.
      await kutu.evaluate((e) => { e.scrollLeft = 0; });
      await konumKorunur(page, `${genislik} sütun genişliği`, async () => {
        const t = (await kart.getByRole('separator', { name: 'Sütun genişliği: id' }).boundingBox())!;
        await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
        await page.mouse.down();
        await page.mouse.move(t.x + t.width / 2 + 60, t.y + t.height / 2, { steps: 5 });
        await page.mouse.up();
        await expect.poll(async () => Number(await kart.locator('col[data-sutun="id"]').getAttribute('width'))).toBeGreaterThan(60);
      });
      await tasmaYok(page);
      expect(hatalar).toEqual([]);
      await kapat();
    }
  });

  test('kaydırma: düzenleme kipinde köşe tutamağıyla kart büyütülüp küçültülürken scrollY değişmez', async () => {
    test.setTimeout(120_000);
    for (const genislik of [1440, 390]) {
      const { page, hatalar, kapat } = await sayfaAc(genislik, 800);
      await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
      const kart = page.locator('.pano-ogesi[data-kart-id="t-lob"]');
      await kart.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 150));
      const kose = kart.getByRole('button', { name: /^Boyutlandır: / });
      // Köşe tutamağı görünür alanın ortasında (sayfa aşağıda); konum ölçümden ÖNCE ayarlanır.
      const konumla = () => kose.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 400));
      const surukle = async (dy: number) => {
        const r = (await kose.boundingBox())!;
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + dy / 2, { steps: 5 });
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + dy, { steps: 5 });
        await page.mouse.up();
      };
      await konumla();
      await konumKorunur(page, `${genislik} büyüt`, () => surukle(200));
      await expect(kart).toHaveAttribute('data-yukseklik', /\d+/);
      const buyuk = Number(await kart.getAttribute('data-yukseklik'));
      await konumla();
      await konumKorunur(page, `${genislik} küçült`, () => surukle(-120));
      expect(Number(await kart.getAttribute('data-yukseklik'))).toBeLessThan(buyuk);
      await page.getByRole('button', { name: 'Vazgeç' }).click();
      await tasmaYok(page);
      expect(hatalar).toEqual([]);
      await kapat();
    }
  });
});
