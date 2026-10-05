// Özet panosunda KART BAŞINA dönem: genel dönem seçici kalktı; döneme bağlı kartın (Özet kutuları, Koşu trendi, sorgusunda
// :baslangic / :bitis olan SQL kartı, donemli Nöbetçi verisi şablonu) başlığında kısa dönem seçimi var, seçim düzenle birlikte saklanır.
// Eski düzende dönem yoksa eski genel seçim (oturumdaki) başlangıç değeri olur (göç). SQL kartında dönem SÜRÜCÜ PARAMETRESİ olarak
// bağlanır (metne gömülmez). Geçici veritabanı + ayrı Nöbetçi (127.0.0.1); SQL bağlantısı bellek içi SAHTE sürücüdür.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import {
  VARSAYILAN_DONEM, VERI_SABLONLARI, YERLESIK_KARTLAR, donemAraligi, donemTemizle, duzenTemizle, kartAyarla, kartDonemliMi, kartEkle, kartTemizle,
  sqlDonemParametreleri, varsayilanDuzen, varsayilanMi
} from '../../scripts/platform/sonuclar/pano-duzeni.mjs';
import { parametreleriDonustur } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const DONEMLI_SORGU = 'SELECT COUNT(*) AS n FROM servis_kayitlari WHERE ISLEMZAMANI >= :baslangic AND ISLEMZAMANI <= :bitis';
const DONEMSIZ_SORGU = "SELECT COUNT(*) AS n FROM servis_kayitlari WHERE EKBILGI <> ':baslangic' -- :bitis yorumda";

test.describe('kart dönemi: kurallar', () => {
  test('döneme bağlı kartlar açıkça işaretli; SQL parametresi kodda aranır (dizgi / yorum / :: sayılmaz)', () => {
    expect(Object.fromEntries(YERLESIK_KARTLAR.map((k) => [k.tur, k.donemli]))).toEqual({
      baslarken: false, ozetKutulari: true, dikkat: false, bakim: false, kapsam: false, kosuTrendi: true
    });
    for (const s of VERI_SABLONLARI) expect(typeof s.donemli, s.anahtar).toBe('boolean');
    expect(sqlDonemParametreleri(DONEMLI_SORGU)).toEqual({ baslangic: true, bitis: true });
    expect(sqlDonemParametreleri(DONEMSIZ_SORGU)).toEqual({ baslangic: false, bitis: false });
    expect(sqlDonemParametreleri('SELECT x::date FROM t /* :baslangic */ WHERE a > :bitis')).toEqual({ baslangic: false, bitis: true });
    expect(sqlDonemParametreleri('SELECT :baslangicx')).toEqual({ baslangic: false, bitis: false });
    const sql = (sorgu: string) => ({ id: 'k-1', tur: 'sql', boyut: 'orta', ayar: { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu } });
    expect(kartDonemliMi(sql(DONEMLI_SORGU))).toBe(true);
    expect(kartDonemliMi(sql(DONEMSIZ_SORGU))).toBe(false);
    expect(kartDonemliMi({ tur: 'dikkat' })).toBe(false);
    expect(kartDonemliMi({ tur: 'metin' })).toBe(false);
  });

  test('saklama: dönem yalnız döneme bağlı kartta; yeni kartta varsayılan Son 24 saat; düzenlemede eklenir / kalkar', () => {
    expect(kartTemizle({ tur: 'ozetKutulari', donem: { hizli: '7g' } })).toMatchObject({ donem: { hizli: '7g' } });
    expect(kartTemizle({ tur: 'dikkat', donem: { hizli: '7g' } })).not.toHaveProperty('donem');
    expect(kartTemizle({ tur: 'ozetKutulari' })).not.toHaveProperty('donem');
    expect(() => kartTemizle({ tur: 'ozetKutulari', donem: { hizli: 'yarin' } })).toThrow(/dönemi geçersiz/);
    expect(donemTemizle({ baslangic: '2026-10-01T10:00:00Z', bitis: '2026-10-01T09:00:00Z' })).toBeNull();
    expect(donemTemizle({ baslangic: '2026-10-01T10:00:00Z' })).toBeNull();
    const d = kartEkle(kartEkle(varsayilanDuzen(), { tur: 'kosuTrendi' }), { id: 'k-s', tur: 'sql', ayar: { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu: DONEMLI_SORGU } });
    expect(d.kartlar.find((k: Nesne) => k.id === 'kosuTrendi')).toMatchObject({ donem: VARSAYILAN_DONEM });
    expect(d.kartlar.find((k: Nesne) => k.id === 'k-s')).toMatchObject({ donem: { hizli: '24s' } });
    const duz = kartAyarla(d, 'k-s', { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu: 'SELECT 1' });
    expect(duz.kartlar.find((k: Nesne) => k.id === 'k-s')).not.toHaveProperty('donem');
    expect(kartAyarla(duz, 'k-s', { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu: DONEMLI_SORGU }).kartlar.find((k: Nesne) => k.id === 'k-s')).toMatchObject({ donem: { hizli: '24s' } });
    // Varsayılan düzen dönemsizdir (göç eski genel seçimi taşır); dönem varsayılan sayılmayı bozmaz.
    expect(varsayilanMi(duzenTemizle({ ...varsayilanDuzen(), kartlar: varsayilanDuzen().kartlar.map((k) => (k.tur === 'ozetKutulari' ? { ...k, donem: { hizli: 'tumu' } } : k)) }))).toBe(true);
    const simdi = new Date('2026-10-05T12:00:00Z');
    expect(donemAraligi({ hizli: '24s' }, simdi)).toEqual({ baslangic: new Date('2026-10-04T12:00:00Z'), bitis: simdi });
    expect(donemAraligi({ hizli: 'tumu' }, simdi).baslangic.getTime()).toBe(0);
  });

  test('sürücü bağlama söz dizimi: Oracle :ad, SQL Server @ad, PostgreSQL $n, MySQL ? — değer metne eklenmez', () => {
    const bas = new Date('2026-10-01T00:00:00Z');
    const bit = new Date('2026-10-02T00:00:00Z');
    const p = { baslangic: bas, bitis: bit };
    const sql = 'SELECT 1 FROM t WHERE z BETWEEN :baslangic AND :bitis';
    expect(parametreleriDonustur('oracle', sql, p)).toMatchObject({ sql, adlar: p });
    expect(parametreleriDonustur('mssql', sql, p)).toMatchObject({ sql: 'SELECT 1 FROM t WHERE z BETWEEN @baslangic AND @bitis', adlar: p });
    expect(parametreleriDonustur('postgres', sql, p)).toMatchObject({ sql: 'SELECT 1 FROM t WHERE z BETWEEN $1 AND $2', degerler: [bas, bit] });
    expect(parametreleriDonustur('mysql', sql, p)).toMatchObject({ sql: 'SELECT 1 FROM t WHERE z BETWEEN ? AND ?', degerler: [bas, bit] });
    for (const s of ['oracle', 'mssql', 'postgres', 'mysql'] as const) expect(parametreleriDonustur(s, sql, p).sql).not.toContain('2026');
  });
});

test.describe('kart dönemi: arayüz', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Donem-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let gunluk = '';
  let degerGunlugu = '';
  let projeId = '';
  let baglantiId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).not.toBe(false); return y; };
  const kartlar = () => [
    { id: 'ozetKutulari', tur: 'ozetKutulari', boyut: 'tam' }, { id: 'dikkat', tur: 'dikkat', boyut: 'kucuk' },
    { id: 'm-not', tur: 'metin', boyut: 'kucuk', ayar: { baslik: 'Not', not: 'Dönemsiz kart.', baglantilar: [] } },
    { id: 's-donem', tur: 'sql', boyut: 'orta', ayar: { baslik: 'Dönemli sayım', hedef: { baglantiId }, sorgu: DONEMLI_SORGU, gorunum: 'sayi' } },
    { id: 's-yok', tur: 'sql', boyut: 'orta', ayar: { baslik: 'Dönemsiz sayım', hedef: { baglantiId }, sorgu: DONEMSIZ_SORGU, gorunum: 'sayi' } }
  ];
  const donemler = async () => Object.fromEntries(((await basarili(`/platform/pano?projeId=${projeId}`)).duzen.kartlar as Nesne[]).map((k) => [k.id, k.donem ?? null]));

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ozet-donem-'));
    gunluk = join(klasor, 'sql-gunlugu.txt');
    degerGunlugu = join(klasor, 'sql-degerleri.txt');
    writeFileSync(gunluk, '');
    writeFileSync(degerGunlugu, '');
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Dönem projesi' });
    const TEST = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    baglantiId = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'donem-db', ortamIdleri: [TEST],
      alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', port: 5433, veritabani: 'uyg', kullanici: 'okur', parola: 'donem-gizli' } }).id;
    vt.kapat();
    mkdirSync(join(klasor, 'yedekler'), { recursive: true });
    writeFileSync(join(klasor, 'yedekler', 'otomatik-20261001-000000-000.tayedek'), 'sahte');
    nobetci = await nobetciBaslat(klasor, vtYolu, {
      TEST_SUNUCU_SAHTE_SQL_SURUCUSU: join(__dirname, 'sahte-sql-surucusu.mjs'), SAHTE_SQL_GUNLUK: gunluk, SAHTE_SQL_DEGER_GUNLUGU: degerGunlugu
    });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    await basarili('/platform/proje/varsayilan', { id: projeId });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  /** oturumAraligi: eski GENEL seçim (sessionStorage; göç testi). */
  async function sayfaAc(genislik = 1440, oturumAraligi?: Nesne): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 }, reducedMotion: 'reduce' });
    if (oturumAraligi) await baglam.addInitScript((d) => { sessionStorage.setItem('platform.sonucAraligi', JSON.stringify(d)); }, oturumAraligi);
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(`pageerror: ${String(e)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::|409|Failed to load resource/.test(m.text())) hatalar.push(`console: ${m.text()}`); });
    await page.goto('/#/sonuclar/ozet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main .iskelet, main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
    return { page, hatalar, kapat: () => baglam.close() };
  }

  async function tasmaYok(page: Page): Promise<void> {
    const sorunlar = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > window.innerWidth) out.push(`sayfa ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
      for (const el of Array.from(document.querySelectorAll('.pano-ogesi, .pano-donem, .tarih-paneli:not([hidden]), .pano-donem-satiri, .kart-basligi'))) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > window.innerWidth + 1 || r.left < -1)) out.push(`${(el as HTMLElement).className}: ${Math.round(r.left)}–${Math.round(r.right)}`);
      }
      return out.slice(0, 8);
    });
    expect(sorunlar).toEqual([]);
  }

  const secici = (page: Page, kart: string) => page.getByRole('group', { name: `Dönem: ${kart}` });

  test('genel seçici yok; eski düzen göçü (oturumdaki genel seçim, yoksa Tümü); dönemsiz kartlarda seçim yok', async () => {
    await basarili('/platform/pano/kaydet', { projeId, duzen: { kartlar: kartlar() } });
    expect(await donemler()).toEqual({ ozetKutulari: null, dikkat: null, 'm-not': null, 's-donem': null, 's-yok': null });
    const { page, hatalar, kapat } = await sayfaAc(1440, { hizli: '7g' });
    await expect(page.locator('.sonuc-araligi')).toHaveCount(0);
    await expect(page.locator('.sayfa-basligi .meta')).toHaveCount(0);
    await expect(secici(page, 'Özet kutuları').locator('.tarih-tetik')).toHaveText('Son 7 gün');
    await expect(secici(page, 'Dönemli sayım').locator('.tarih-tetik')).toHaveText('Son 7 gün');
    for (const id of ['dikkat', 'm-not', 's-yok']) await expect(page.locator(`.pano-ogesi[data-kart-id="${id}"] .pano-donem`), id).toHaveCount(0);
    await expect.poll(donemler).toEqual({ ozetKutulari: { hizli: '7g' }, dikkat: null, 'm-not': null, 's-donem': { hizli: '7g' }, 's-yok': null });
    expect(hatalar).toEqual([]);
    await kapat();
    // Oturumda genel seçim yoksa eski varsayılan "Tümü".
    await basarili('/platform/pano/kaydet', { projeId, duzen: { kartlar: kartlar() } });
    const ikinci = await sayfaAc(1440);
    await expect(secici(ikinci.page, 'Özet kutuları').locator('.tarih-tetik')).toHaveText('Özet: son 30 gün');
    await expect.poll(donemler).toMatchObject({ ozetKutulari: { hizli: 'tumu' }, 's-donem': { hizli: 'tumu' } });
    await ikinci.kapat();
  });

  test('kart başına seçim saklanır ve yeniden yüklenir; özel aralık; SQL dönemi parametre olarak bağlanır, dönemsiz sorguda bağlanmaz', async () => {
    test.setTimeout(90_000);
    const { page, hatalar, kapat } = await sayfaAc(1440);
    // Özet kutuları: Son 24 saat.
    await secici(page, 'Özet kutuları').locator('.tarih-tetik').click();
    await secici(page, 'Özet kutuları').getByRole('button', { name: 'Son 24 saat' }).click();
    await expect(secici(page, 'Özet kutuları').locator('.tarih-tetik')).toHaveText('Son 24 saat');
    await expect.poll(async () => (await donemler()).ozetKutulari).toEqual({ hizli: '24s' });
    // SQL kartı: özel aralık (yerel saat) → Uygula.
    const s = secici(page, 'Dönemli sayım');
    await s.locator('.tarih-tetik').click();
    await s.getByLabel('Başlangıç').fill('2026-10-01T10:00');
    await s.getByLabel('Bitiş').fill('2026-10-01T12:00');
    await s.getByRole('button', { name: 'Uygula' }).click();
    const bas = new Date('2026-10-01T10:00').toISOString();
    const bit = new Date('2026-10-01T12:00').toISOString();
    await expect.poll(async () => (await donemler())['s-donem']).toEqual({ baslangic: bas, bitis: bit });
    // Sorgu dönem seçilince çalışmaz; Yenile ile parametreler bağlanır.
    expect(readFileSync(gunluk, 'utf8')).not.toContain('servis_kayitlari');
    const kart = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Dönemli sayım' }) });
    await kart.getByRole('button', { name: 'Yenile: Dönemli sayım' }).click();
    // Beklenen sayı sahte tablodaki zamanlardan (metin karşılaştırması; makinenin saat dilimine göre değişir).
    const beklenen = ['2026-10-01T09:15:00', '2026-10-01T10:30:00', '2026-10-01T11:45:00'].filter((z) => z >= bas && z <= bit).length;
    await expect(kart.locator('.pano-sayi-deger')).toHaveText(String(beklenen));
    await expect(kart.locator('.pano-son-veri')).toContainText('01.10.2026 → 01.10.2026');
    const satirlar = readFileSync(gunluk, 'utf8').split('\n').filter((x) => x.includes('servis_kayitlari'));
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toContain('ISLEMZAMANI >= $1 AND ISLEMZAMANI <= $2');
    expect(satirlar[0]).not.toContain('2026');
    expect(readFileSync(degerGunlugu, 'utf8').trim().split('\n').map((x) => JSON.parse(x))).toEqual([[{ tur: 'Date', deger: bas }, { tur: 'Date', deger: bit }]]);
    // Dönemsiz sorgu: parametre bağlanmaz, sorgu aynen çalışır.
    const yok = page.locator('section.pano-sql-karti').filter({ has: page.getByRole('heading', { name: 'Dönemsiz sayım' }) });
    await yok.getByRole('button', { name: 'Yenile: Dönemsiz sayım' }).click();
    await expect(yok.locator('.pano-sayi-deger')).toHaveText('3');
    expect(readFileSync(degerGunlugu, 'utf8').trim().split('\n')).toHaveLength(1);
    await kapat();
    // Yeniden yükle: seçimler kartlarda; dönem değişince eski sonuç için uyarı.
    const ikinci = await sayfaAc(1440);
    await expect(secici(ikinci.page, 'Özet kutuları').locator('.tarih-tetik')).toHaveText('Son 24 saat');
    await expect(secici(ikinci.page, 'Dönemli sayım').locator('.tarih-tetik')).toHaveText('01.10.2026 10:00 → 01.10.2026 12:00');
    await secici(ikinci.page, 'Dönemli sayım').locator('.tarih-tetik').click();
    await secici(ikinci.page, 'Dönemli sayım').getByRole('button', { name: 'Son 7 gün' }).click();
    await expect(ikinci.page.locator('.pano-ogesi[data-kart-id="s-donem"] .pano-donem-farki')).toContainText("Seçili dönem (Son 7 gün) için Yenile'ye basın.");
    expect([...hatalar, ...ikinci.hatalar]).toEqual([]);
    await ikinci.kapat();
  });

  test('SQL kartı formunda dönem yardımı; 1440 / 390 px taşma yok (panel açıkken de)', async () => {
    for (const genislik of [1440, 390]) {
      const { page, hatalar, kapat } = await sayfaAc(genislik);
      await tasmaYok(page);
      for (const kart of ['Özet kutuları', 'Dönemli sayım']) {
        await secici(page, kart).locator('.tarih-tetik').click();
        await expect(secici(page, kart).getByRole('dialog', { name: 'Tarih aralığı seç' })).toBeVisible();
        await tasmaYok(page);
        await page.keyboard.press('Escape');
      }
      if (genislik === 1440) {
        await page.getByRole('button', { name: 'Panoyu düzenle' }).click();
        await page.getByRole('button', { name: 'Düzenle: Dönemli sayım' }).click();
        await expect(page.locator('dialog[open] .pano-donem-yardimi')).toHaveText(/Sorguda :baslangic ve :bitis kullanırsanız kartta dönem seçebilirsiniz/);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Vazgeç' }).click();
      }
      expect(hatalar).toEqual([]);
      await kapat();
    }
  });
});
