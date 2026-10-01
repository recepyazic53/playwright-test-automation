// TIKLAMA ZAMANLAMASI (bulgu 1.23): pencere (modal) açılış animasyonu / olay bağlama bitmeden yapılan tıklama sayfa tarafından yutulur.
// Koşucu (model-kosucu.ts) aksiyona basmadan önce sayfanın sakinleşmesini (ağ + görünüm + öğenin animasyonu) bekler; tıklama etkisiz
// kalırsa (istek yok, görünüm değişmedi, başarı göstergesi yok) aynı öğeye BİR kez daha basar — istek başlatan ya da sayfayı değiştiren
// tıklama ASLA tekrarlanmaz (çift gönderim / ödeme riski). Aynı kural hızlı test motorunda ve Playwright dışa aktarma çıktısında.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (tiklama-zamanlamasi-fikstur.ts); değerler sahte; dışarıya istek yok.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { playwrightKoduUret } from '../../scripts/platform/senaryolar/playwright-disa-aktarma.mjs';
import { TEKRAR_NOTU } from '../../scripts/platform/tarama/guvenli-tiklama';
import { hizliTestiYurut } from '../../scripts/platform/tarama/hizli-test-motoru';
import type { HizliFark, HizliKomut, HizliOlay, TaramaGirdisi } from '../../scripts/platform/tarama/protokol.mjs';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { kartUygulamasi, type KartSunucusu } from './tiklama-zamanlamasi-fikstur';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe kurulur (test verisi)
type Nesne = Record<string, any>;
const KOK = resolve(__dirname, '..', '..');

/** Tek aksiyonlu adım: secici'ye bas, basari öğesi görünsün. */
const adim = (id: string, sira: number, secici: string, etiket: string, basari: string, zamanAsimiSn: number): Nesne => ({
  id, sira, baslik: etiket,
  bolumler: [{ id: `${id}Islemleri`, baslik: 'İşlemler', alanlar: [
    { id: `${id}Dugmesi`, tip: 'buton', etiket: { ekran: etiket }, yapilandirma: 'aksiyon', konum: { secici, kirilganlik: 'orta' } }
  ] }],
  kosu: { aksiyonlar: [{ tur: 'tikla', secici, aciklama: etiket }], basariGostergesi: { tur: 'eleman', deger: basari }, zamanAsimiSn }
});
const model = (ekranUrl: string, adimlar: Nesne[]): Nesne => ({
  semaSurumu: 2, tur: 'ekran', id: 'odeme', ad: 'Ödeme', aciklama: 'Tıklama zamanlaması (nötr fikstür; değerler sahte).',
  ekranUrl, girisGerekmez: true, specDosyasi: 'tests/scenarios/odeme/odeme.spec.ts', pageObject: 'yok (model koşucusu)',
  veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (odeme)' }, kosullar: {}, adimlar,
  senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
});
/** Aç → (pencere) → KART İLE DEVAM → kart formu (#isim). */
const kartModeli = (ekranUrl: string): Nesne => model(ekranUrl, [
  adim('ac', 1, '#ac', 'Aç', '#kartla', 10),
  adim('kart', 2, '#kartla', 'Kart ile devam', '#isim', 10)
]);

test.describe('normal koşu (model-kosucu)', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  const durum: KartSunucusu = { odeme: 0 };
  test.beforeAll(async () => {
    sunucu = await yerelSunucu(kartUygulamasi(durum));
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });
  test.beforeEach(() => { durum.odeme = 0; });

  async function kos(testInfo: TestInfo, m: Nesne): Promise<{ page: Page; hata: string | null; adimlar: string[]; sureMs: number; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
      tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
    };
    const s: PlatformModelSenaryosu = { id: 's1', baslik: 'Ödeme', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'odeme', ad: 'Ödeme' }, model: m, modelSurumu: 1, altModeller: {}, veri: {}, mutlakaGorunmeli: [] };
    // Adım ayrıntısı: üst düzey test.step başlıkları (raporlayıcı yalnız bunları kaydeder).
    const adimlar: string[] = [];
    const asil = test.step.bind(test);
    const baslangic = Date.now();
    let hata: string | null = null;
    try {
      (test as unknown as { step: typeof test.step }).step = (async (ad: string, govde: () => Promise<unknown>) => { adimlar.push(ad); return asil(ad, govde); }) as typeof test.step;
      await modelSenaryosunuKos(page, testInfo, s, ortam);
    } catch (e) { hata = (e as Error).message; } finally { (test as unknown as { step: typeof test.step }).step = asil; }
    return { page, hata, adimlar, sureMs: Date.now() - baslangic, kapat: () => baglam.close() };
  }

  test('pencere animasyonu bitmeden yapılan tıklama yutulmaz: kart formu açılır', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, kartModeli('/kart'));
    try {
      expect(r.hata).toBeNull();
      await expect(r.page.locator('#isim')).toBeVisible();
      // Sakinlik beklemesi koşuyu belirgin uzatmaz (iki aksiyon, her biri en çok ~1-2 sn).
      expect(r.sureMs).toBeLessThan(15_000);
      expect(r.adimlar.some((a) => a.includes('bir kez daha tıklandı'))).toBe(false);
    } finally { await r.kapat(); }
  });

  test('ilk tıklamayı yutan (tembel) işleyici: ilk tıklama etkisiz → bir kez daha tıklanır, adım ayrıntısına not düşer', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, kartModeli('/kart-tembel'));
    try {
      expect(r.hata).toBeNull();
      await expect(r.page.locator('#isim')).toBeVisible();
      expect(r.adimlar).toContain('Kart ile devam — “Kart ile devam”: ilk tıklama etkisizdi, bir kez daha tıklandı');
    } finally { await r.kapat(); }
  });

  test('istek başlatan "Öde" düğmesi yeniden tıklanmaz (sunucu sayacı 1)', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/kart', [adim('ode', 1, '#ode', 'Öde', '#odendi', 6)]));
    try {
      expect(r.hata).toContain('başarı göstergesi görünmedi');
      expect(r.hata).not.toContain('hiçbir şey değişmedi');
      await r.page.waitForTimeout(500);
      expect(durum.odeme).toBe(1);
      expect(r.adimlar.some((a) => a.includes('bir kez daha tıklandı'))).toBe(false);
    } finally { await r.kapat(); }
  });

  test('tıklanınca sayfayı hemen değiştiren düğme yeniden tıklanmaz', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/kart', [adim('say', 1, '#say', 'Say', '#sayildi', 6)]));
    try {
      expect(r.hata).toContain('başarı göstergesi görünmedi');
      await expect(r.page.locator('#sayac')).toHaveText('Tıklama: 1 kez');
    } finally { await r.kapat(); }
  });

  test('hiç etkisi olmayan bağlantı: hata iletisi tıklamanın etkisiz kaldığını söyler', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/kart', [adim('olu', 1, '#olu', 'Ölü bağlantı', '#yok', 8)]));
    try {
      // İlk tıklama etkisiz → bir kez daha basıldı → yine etkisiz: ileti iki tıklamayı da söyler; not adım ayrıntısında.
      expect(r.hata).toContain('“Ölü bağlantı” tıklandı (iki kez) ama sayfada hiçbir şey değişmedi; öğe hazır olmadan tıklanmış olabilir');
      expect(r.adimlar).toContain('Ölü bağlantı — “Ölü bağlantı”: ilk tıklama etkisizdi, bir kez daha tıklandı');
    } finally { await r.kapat(); }
  });
});

// ---- Hızlı test motoru (aynı kural: basış öncesi sakinlik, etkisiz basışın bir kez tekrarı) ------------------------------------------

test.describe('hızlı test motoru', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  const durum: KartSunucusu = { odeme: 0 };
  test.beforeAll(async () => {
    sunucu = await yerelSunucu(kartUygulamasi(durum));
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });
  test.beforeEach(() => { durum.odeme = 0; });

  /** Motoru 127.0.0.1'deki sayfada başlatır; komutlar sırayla verilir, olaylar toplanır. */
  function baslat(yol: string): { komut: (k: HizliKomut) => void; olayBekle: (no: number) => Promise<HizliOlay>; is: Promise<unknown> } {
    const komutlar: HizliKomut[] = [];
    const olaylar: HizliOlay[] = [];
    const g: TaramaGirdisi = {
      kip: 'hizliTest', hizliTest: { izin: 'evet' }, tabanUrl: sunucu.adres, hedefAdres: `${sunucu.adres}${yol}`, hedefYol: yol, tarif: null, kimlik: null,
      profiller: [{ ad: null, degerler: null }], kesif: true, yasakKaliplari: [], izinliKokenler: [sunucu.adres], zamanAsimiMs: 60_000
    };
    const komutAl = async (): Promise<HizliKomut | null> => {
      for (let i = 0; i < 20 && !komutlar.length; i++) await new Promise((c) => setTimeout(c, 50));
      return komutlar.shift() ?? null;
    };
    const is = hizliTestiYurut(tarayici, g, async () => undefined, komutAl, async (o) => { olaylar.push(o); });
    const olayBekle = async (no: number): Promise<HizliOlay> => {
      for (const son = Date.now() + 45_000; Date.now() < son;) {
        const o = olaylar.find((x) => (no === 0 ? x.olay === 'kesif' : 'no' in x && x.no === no && x.olay !== 'ilerleme'));
        if (o) return o;
        await new Promise((c) => setTimeout(c, 100));
      }
      throw new Error(`olay gelmedi (${no})`);
    };
    return { komut: (k) => { komutlar.push(k); }, olayBekle, is };
  }
  const fark = (o: HizliOlay): HizliFark => {
    if (o.olay !== 'basildi') throw new Error(`basildi bekleniyordu: ${JSON.stringify(o).slice(0, 300)}`);
    return o.fark;
  };
  const kartFormuVar = (f: HizliFark): boolean => f.anlik.alanlar.some((a) => a.secici.includes('isim'));

  test('pencere animasyonu: Aç → KART İLE DEVAM basışı yutulmaz, kart formu açılır (tekrar gerekmez)', async () => {
    test.setTimeout(90_000);
    const m = baslat('/kart');
    await m.olayBekle(0);
    m.komut({ no: 1, tur: 'bas', secici: '#ac', metin: null });
    fark(await m.olayBekle(1));
    m.komut({ no: 2, tur: 'bas', secici: '#kartla', metin: null });
    const f = fark(await m.olayBekle(2));
    expect(kartFormuVar(f)).toBe(true);
    expect(f.tiklamaNotu ?? null).toBeNull();
    m.komut({ no: 3, tur: 'bitir' });
    await m.is;
  });

  test('ilk tıklamayı yutan işleyici: ilk basış etkisiz → bir kez daha basılır (not); "Öde" (istek) ve "Say" (sayfa değişir) tekrarlanmaz', async () => {
    test.setTimeout(120_000);
    const m = baslat('/kart-tembel');
    await m.olayBekle(0);
    m.komut({ no: 1, tur: 'bas', secici: '#ac', metin: null });
    fark(await m.olayBekle(1));
    m.komut({ no: 2, tur: 'bas', secici: '#kartla', metin: null });
    const f = fark(await m.olayBekle(2));
    expect(kartFormuVar(f)).toBe(true);
    expect(f.tiklamaNotu).toBe(TEKRAR_NOTU);
    m.komut({ no: 3, tur: 'bas', secici: '#ode', metin: null });
    const f3 = fark(await m.olayBekle(3));
    expect(f3.tiklamaNotu ?? null).toBeNull();
    expect(durum.odeme).toBe(1);
    m.komut({ no: 4, tur: 'bas', secici: '#say', metin: null });
    const f4 = fark(await m.olayBekle(4));
    expect(f4.tiklamaNotu ?? null).toBeNull();
    expect(f4.yeniMetinler.map((x) => x.metin).join(' | ')).toContain('Tıklama: 1 kez');
    m.komut({ no: 5, tur: 'bitir' });
    await m.is;
    expect(durum.odeme).toBe(1);
  });
});

// ---- Playwright dışa aktarma (üretilen dosya Nöbetçi olmadan aynı kuralla koşar) ----------------------------------------------------

test('dışa aktarma: aksiyonlar guvenliTikla ile; üretilen dosya tsc (strict) geçer, ilk tıklamayı yutan işleyicide kart formu açılır, "Öde" bir kez gider', async () => {
  test.setTimeout(240_000);
  const durum: KartSunucusu = { odeme: 0 };
  const sunucu = await yerelSunucu(kartUygulamasi(durum));
  const hedef = join(KOK, 'test-results', `tiklama-disa-${randomBytes(4).toString('hex')}`);
  mkdirSync(hedef, { recursive: true });
  try {
    const uret = (m: Nesne, senaryo: string): { dosyaAdi: string; icerik: string } => {
      const plan = modelKosuPlani(m, {});
      expect(plan.hatalar).toEqual([]);
      return playwrightKoduUret({
        plan, kaynak: { ekran: 'Ödeme', senaryo, modelSurumu: 1, ortam: 'TEST', uretim: '2026-10-01T10:00:00.000Z' },
        tabanUrl: sunucu.adres, girisGerekli: false, girisProfili: null, tarif: null, baglam: null,
        gizlilik: { hassasAnahtarlar: [], gizliDegerler: [], kisiselAlanIdleri: [], ekGizliAdlar: [] }
      });
    };
    const kart = uret(kartModeli('/kart-tembel'), 'Kart formu');
    const ode = uret(model('/kart', [adim('ode', 1, '#ode', 'Öde', '#odendi', 6)]), 'Öde');
    expect(kart.icerik).toContain('await guvenliTikla(page, page.locator("#kartla").filter({ visible: true }).first(), 10000, async () => (await page.locator("#isim").filter({ visible: true }).count()) > 0);');
    for (const d of [kart, ode]) writeFileSync(join(hedef, d.dosyaAdi), d.icerik);
    writeFileSync(join(hedef, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true, types: ['node'], typeRoots: [join(KOK, 'node_modules', '@types')] },
      files: [kart.dosyaAdi, ode.dosyaAdi]
    }));
    let tsc = '';
    try {
      execFileSync(process.execPath, [join(KOK, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(hedef, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      tsc = `${String((e as { stdout?: string }).stdout ?? '')}${String((e as { stderr?: string }).stderr ?? '')}` || String(e);
    }
    expect(tsc).toBe('');
    writeFileSync(join(hedef, 'playwright.config.ts'), `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', outputDir: './cikti', workers: 1, retries: 0, reporter: [['json', { outputFile: 'sonuc.json' }]],
  use: { launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] } }
});
`);
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) if (!/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|KOSU_KIMLIGI|NOBETCI_)/.test(k)) env[k] = v;
    await new Promise<number | null>((coz) => {
      const alt = spawn(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', join(hedef, 'playwright.config.ts')], { cwd: hedef, env, stdio: ['ignore', 'pipe', 'pipe'] });
      alt.stdout?.resume();
      alt.stderr?.resume();
      alt.on('close', coz);
    });
    type Sonuc = { status: string; stdout?: Array<{ text?: string }>; error?: { message?: string } };
    const rapor = JSON.parse(readFileSync(join(hedef, 'sonuc.json'), 'utf8')) as { suites: Array<{ specs: Array<{ title: string; tests: Array<{ results: Sonuc[] }> }> }> };
    const sonuc: Record<string, { durum: string; cikti: string; hata: string }> = {};
    for (const suite of rapor.suites) for (const spec of suite.specs) {
      const r = spec.tests[0].results.at(-1);
      sonuc[spec.title] = { durum: r?.status ?? '', cikti: (r?.stdout ?? []).map((x) => x.text ?? '').join(''), hata: r?.error?.message ?? '' };
    }
    expect(sonuc['Kart formu']?.durum, sonuc['Kart formu']?.hata).toBe('passed');
    expect(sonuc['Kart formu'].cikti).toContain('ilk tıklama etkisizdi, bir kez daha tıklandı');
    // "Öde": başarı göstergesi hiç görünmez (test düşer) ama istek BİR kez gider; tekrar notu yok.
    expect(sonuc['Öde']?.durum).toBe('failed');
    expect(sonuc['Öde'].cikti).not.toContain('bir kez daha tıklandı');
    expect(durum.odeme).toBe(1);
  } finally {
    rmSync(hedef, { recursive: true, force: true });
    await sunucu.kapat();
  }
});
