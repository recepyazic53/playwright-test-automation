// PLAYWRIGHT KODUNA DIŞA AKTARMA — uçtan uca (yerel). Geçici kasa + ayrı Nöbetçi sunucusu + 127.0.0.1'deki sahte başvuru
// uygulaması (model-fikstur.ts; TOTP'li giriş, şube bağlamı, ok düğmeli seçim, radyo, onay kutusu, tarih, dosya, iş kuralı).
// Dışa aktarılan dosyalar tsc (strict) ile denetlenir ve Nöbetçi OLMADAN Playwright ile sahte uygulamaya karşı koşturulur:
// sonuçlar Nöbetçi'nin kendi koşusuyla aynı olmalı (başarı, beklenen iş kuralı hatası, atlanan alan, "mutlaka görünmeli" düşüşü).
// Gizli değerler (parola, TOTP anahtarı, ek gizli ad sayılan alan) dosyada yoktur; ortam değişkeniyle verilir. Arayüz: satır ⋯
// menüsü ve senaryo ayrıntısı düğmesiyle indirme (masaüstü + 390 px). Hiçbir istek 127.0.0.1 dışına gitmez; değerler SAHTEDİR.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi, type Hesaplama } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
const KOK = resolve(__dirname, '..', '..');
const PAROLA = `Gecici-Disa-${randomBytes(6).toString('hex')}`;
const BELGE = 'Sahte dışa aktarma belgesi.\n';
const AD_SOYAD = 'Deneme Kişi';
const BASLIKLAR = {
  mutlu: 'Yetkili / Ekspres / peşin / onaylı',
  isKurali: 'Merkez / Ekonomi taksitli → iş kuralı',
  atlanan: 'Merkez / indirim alanı atlanır',
  mutlaka: 'Merkez / indirim mutlaka görünmeli'
} as const;

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let yukleme = '';
let projeId = '';
let ortamId = '';
let ekranId = '';
const senaryolar = new Map<string, string>(); // başlık → id
const nobetciSonuclari = new Map<string, string>(); // başlık → durum
const nobetciHesaplamalari: Hesaplama[] = [];
const disaAktarilan = new Map<string, { dosyaAdi: string; icerik: string; ortamDegiskenleri: Array<{ ad: string }> }>();

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde?: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
  return y;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  klasor = mkdtempSync(join(tmpdir(), 'disa-aktarma-'));
  yukleme = join(klasor, 'yuklenecek');
  mkdirSync(yukleme);
  writeFileSync(join(yukleme, 'ornek-belge.txt'), BELGE);
  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_YUKLEME_KLASORU: yukleme });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Dışa Aktarma Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  await basarili('/platform/giris-profili/kaydet', {
    projeId, ortamId, ad: 'TEST kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
  });
  await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() });
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
  // Kullanıcının ek gizli adı (Ayarlar > Güvenlik > Maskeleme): "adSoyad" alanının değeri koda yazılmamalı.
  await basarili('/platform/maskeleme/kaydet', { ekAdlar: ['adSoyad'] });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [0, 1, 2, 3], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Array<{ id: string; baslik: string }>; ekranlar: Array<{ id: string; ad: string }> };
  for (const s of liste.senaryolar) senaryolar.set(s.baslik, s.id);
  ekranId = liste.ekranlar.find((e) => e.ad === 'Örnek Başvuru')?.id ?? '';
  expect(senaryolar.size).toBe(4);
  await basarili('/platform/senaryo/kaydet', { projeId, id: senaryolar.get(BASLIKLAR.mutlaka), baslik: BASLIKLAR.mutlaka, mutlakaGorunmeli: ['indirimOrani'] });
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('Nöbetçi koşusu (referans): dört senaryo sunucunun koşu ucuyla', async () => {
  test.setTimeout(420_000);
  const kosuKimligi = `disa-${Date.now()}`;
  for (const baslik of Object.values(BASLIKLAR)) {
    const y = await api('/platform/senaryolar/calistir', {
      projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: senaryolar.get(baslik), ortamId, kosuTuru: 'tekil', kosuKimligi, kosuKapsami: 'Genel'
    });
    expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
    const d = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    nobetciSonuclari.set(baslik, String(d.durum));
  }
  expect(Object.fromEntries(nobetciSonuclari)).toEqual({
    [BASLIKLAR.mutlu]: 'basarili', [BASLIKLAR.isKurali]: 'basarili', [BASLIKLAR.atlanan]: 'basarili', [BASLIKLAR.mutlaka]: 'basarisiz'
  });
  nobetciHesaplamalari.push(...uygulama.hesaplamalar);
});

test('dışa aktarma ucu: gizli değer yok (env), giriş adımları, oklu seçim yardımcısı; sunucu dosya yazmaz', async () => {
  for (const baslik of Object.values(BASLIKLAR)) {
    const y = await basarili(`/platform/senaryo/playwright-kodu?projeId=${projeId}&id=${senaryolar.get(baslik)}&ortamId=${ortamId}`);
    disaAktarilan.set(baslik, y as unknown as { dosyaAdi: string; icerik: string; ortamDegiskenleri: Array<{ ad: string }> });
  }
  const mutlu = disaAktarilan.get(BASLIKLAR.mutlu);
  if (!mutlu) throw new Error('dışa aktarılmadı');
  expect(mutlu.dosyaAdi).toBe('yetkili-ekspres-pesin-onayli.spec.ts');
  for (const d of disaAktarilan.values()) {
    for (const gizli of [ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, ORNEK_KULLANICI, AD_SOYAD]) expect(d.icerik).not.toContain(gizli);
    expect(d.ortamDegiskenleri.map((x) => x.ad)).toEqual(expect.arrayContaining(['NOBETCI_KULLANICI_ADI', 'NOBETCI_PAROLA', 'NOBETCI_TOTP_ANAHTARI', 'NOBETCI_AD_SOYAD']));
    expect(d.icerik).toContain('await girisYap(page);');
    expect(d.icerik).toContain('await kodAlani.fill(totpKodu(ortamDegeri(`${on}TOTP_ANAHTARI`)));');
    expect(d.icerik).toContain('function okluSec(');
    expect(d.icerik).toContain('await okluSec(page, l, ["#kapsam-ileri", "#kapsam-geri"]');
    expect(d.icerik).toContain('await l.fill(ortamDegeri("NOBETCI_AD_SOYAD"));');
    expect(d.icerik).toContain(`const TABAN_ADRES = process.env.NOBETCI_TABAN_ADRES || ${JSON.stringify(fikstur.adres)};`);
    expect(d.icerik).toContain('//   Ekran: Örnek Başvuru');
    expect(d.icerik).toMatch(/\/\/ {3}Model sürümü: \d+/);
  }
  expect(mutlu.icerik).toContain('await test.step("Bağlam değiştirilir (Yetkili)"');
  expect(mutlu.icerik).toContain('selectOption(`S02`)');
  expect(mutlu.icerik).toContain('await l.setInputFiles(join(YUKLEME_KLASORU, "ornek-belge.txt"));');
  expect(mutlu.icerik).toContain('await test.step("Başvuru onaylanır"');
  expect(disaAktarilan.get(BASLIKLAR.isKurali)?.icerik).toContain('await beklenenUyariyiBekle(page, { adim: "Toplam hesaplanır", beklenenler: ["ekonomi kapsamında \\"taksitli\\" ödeme seçilemez"], hataSecici: "#uyari"');
  expect(disaAktarilan.get(BASLIKLAR.mutlaka)?.icerik).toContain('await alan(page, "#indirim", "İndirim oranı", async (l) => {');
  expect(disaAktarilan.get(BASLIKLAR.mutlaka)?.icerik).toContain('}, { zorunlu: true });');
  // Sunucu dosya yazmadı: geçici veri kökünde üretilen dosya yok.
  expect((readdirSync(klasor, { recursive: true }) as string[]).filter((ad) => String(ad).endsWith('.spec.ts'))).toEqual([]);
  // Hatalı istek: bilinmeyen senaryo açık hata.
  const yok = await api(`/platform/senaryo/playwright-kodu?projeId=${projeId}&id=${randomUUID()}&ortamId=${ortamId}`);
  expect(yok.basarili).toBe(false);
  expect(yok.mesaj).toContain('Senaryo bulunamadı');
});

test('dışa aktarılan dosyalar tsc (strict) ile derlenir ve Nöbetçi OLMADAN Nöbetçi koşusuyla aynı sonucu verir', async () => {
  test.setTimeout(300_000);
  const hedef = join(KOK, 'test-results', `disa-aktarma-${randomBytes(4).toString('hex')}`);
  mkdirSync(hedef, { recursive: true });
  try {
    const dosyalar: string[] = [];
    for (const d of disaAktarilan.values()) { writeFileSync(join(hedef, d.dosyaAdi), d.icerik); dosyalar.push(d.dosyaAdi); }
    writeFileSync(join(hedef, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true, types: ['node'], typeRoots: [join(KOK, 'node_modules', '@types')] },
      files: dosyalar
    }));
    let tsc = '';
    try {
      execFileSync(process.execPath, [join(KOK, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(hedef, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      tsc = `${String((e as { stdout?: string }).stdout ?? '')}${String((e as { stderr?: string }).stderr ?? '')}` || String(e);
    }
    expect(tsc).toBe('');
    // Kullanıcının kendi Playwright yapılandırması gibi: yalnızca 127.0.0.1 çözülür (dış DNS yok), tek işçi, JSON rapor.
    writeFileSync(join(hedef, 'playwright.config.ts'), `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', outputDir: './cikti', workers: 1, retries: 0, reporter: [['json', { outputFile: 'sonuc.json' }]],
  use: { launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] } }
});
`);
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) if (!/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|KOSU_KIMLIGI|NOBETCI_)/.test(k)) env[k] = v;
    const onceki = uygulama.hesaplamalar.length;
    const kod = await new Promise<number | null>((coz) => {
      const alt = spawn(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', join(hedef, 'playwright.config.ts')], {
        cwd: hedef,
        env: {
          ...env, NOBETCI_KULLANICI_ADI: ORNEK_KULLANICI, NOBETCI_PAROLA: ORNEK_PAROLA, NOBETCI_TOTP_ANAHTARI: ORNEK_TOTP_ANAHTARI,
          NOBETCI_AD_SOYAD: AD_SOYAD, NOBETCI_YUKLEME_KLASORU: yukleme
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      alt.stdout?.resume();
      alt.stderr?.resume();
      alt.on('close', coz);
    });
    const rapor = JSON.parse(readFileSync(join(hedef, 'sonuc.json'), 'utf8')) as { suites: Array<{ specs: Array<{ title: string; tests: Array<{ results: Array<{ status: string; error?: { message?: string } }> }> }> }> };
    const durumlar: Record<string, string> = {};
    const hatalar: Record<string, string> = {};
    for (const suite of rapor.suites) {
      for (const spec of suite.specs) {
        const r = spec.tests[0].results.at(-1);
        durumlar[spec.title] = r?.status === 'passed' ? 'basarili' : 'basarisiz';
        if (r?.error?.message) hatalar[spec.title] = r.error.message;
      }
    }
    expect(kod).toBe(1); // "mutlaka görünmeli" senaryosu (Nöbetçi'de de) başarısız
    expect(durumlar).toEqual(Object.fromEntries(nobetciSonuclari));
    expect(hatalar[BASLIKLAR.mutlaka]).toContain('İndirim oranı alanı ekranda görünmüyor (mutlaka görünmeli).');
    // Uygulamaya giden istekler Nöbetçi koşusundakilerle aynı (koşu sırası farklı olabilir): alanlar gerçekten aynı değerlerle dolduruldu.
    const sirali = (l: Hesaplama[]): string[] => l.map((h) => JSON.stringify(h, Object.keys(h).sort())).sort();
    expect(sirali(uygulama.hesaplamalar.slice(onceki))).toEqual(sirali(nobetciHesaplamalari));
    expect(uygulama.hesaplamalar.slice(onceki).find((h) => h.sube === 'S02')).toMatchObject({
      urun: 'A', adSoyad: AD_SOYAD, baslangic: '2026-10-01', kapsam: 'EKSPRES', odeme: 'pesin', kampanya: true, indirim: '10', belge: `ornek-belge.txt:${Buffer.byteLength(BELGE)}`
    });
    // Onay: yalnızca mutlu yolda (Nöbetçi'de bir, dışa aktarılan koşuda bir).
    expect(uygulama.onaylar).toHaveLength(2);
  } finally {
    rmSync(hedef, { recursive: true, force: true });
  }
});

/** İndirmeden önceki açıklamalı onay: ne indirileceği ve gizli değerlerin dosyaya yazılmadığı yazar; ortam seçilince indirilir. */
async function onaylaVeIndir(page: Page, baslik: string): Promise<void> {
  const d = page.getByRole('dialog', { name: `Playwright koduna dışa aktar: ${baslik}` });
  await expect(d).toBeVisible();
  await expect(d).toContainText('gizli değerler dosyaya yazılmaz');
  await d.getByRole('button', { name: /TEST için indir/ }).click();
}

/** Satır ⋯ menüsünden indirir; indirilen dosyanın adı ve metni. */
async function menudenIndir(page: Page, baslik: string): Promise<{ ad: string; metin: string }> {
  await page.getByRole('button', { name: `Diğer işlemler: ${baslik}` }).click();
  const oge = page.getByRole('menuitem', { name: 'Playwright koduna dışa aktar' });
  await expect(oge).toBeVisible();
  await oge.click();
  const [indirme] = await Promise.all([page.waitForEvent('download'), onaylaVeIndir(page, baslik)]);
  const yol = await indirme.path();
  return { ad: indirme.suggestedFilename(), metin: readFileSync(yol, 'utf8') };
}

test('arayüz: satır ⋯ menüsü (masaüstü + 390 px) ve senaryo ayrıntısı düğmesiyle indirme; istekler yalnız Nöbetçi\'ye', async () => {
  test.setTimeout(180_000);
  const tarayici: Browser = await korumaliTarayici();
  try {
    for (const genislik of [1440, 390]) {
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 }, acceptDownloads: true });
      const istekler: string[] = [];
      baglam.on('request', (r) => { istekler.push(r.url()); });
      const page = await baglam.newPage();
      await page.goto(`/#/senaryolar/u/${encodeURIComponent(ekranId)}`);
      await expect(page.locator('.senaryo-karti tbody tr')).toHaveCount(4, { timeout: 15_000 });
      const d = await menudenIndir(page, BASLIKLAR.mutlu);
      expect(d.ad).toBe('yetkili-ekspres-pesin-onayli.spec.ts');
      expect(d.metin).toContain("import { test, expect, type FrameLocator, type Locator, type Page, type Request } from '@playwright/test';");
      expect(d.metin).toContain('test("Yetkili / Ekspres / peşin / onaylı"');
      for (const gizli of [ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, AD_SOYAD]) expect(d.metin).not.toContain(gizli);
      await expect(page.locator('.bildirim').filter({ hasText: 'indirildi' }).first()).toBeVisible();
      if (genislik === 1440) {
        // Senaryo ayrıntısı: başlıktaki düğme.
        await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(senaryolar.get(BASLIKLAR.isKurali) ?? '')}`);
        const dugme = page.getByRole('button', { name: 'Playwright koduna dışa aktar' });
        await expect(dugme).toBeVisible({ timeout: 15_000 });
        await dugme.click();
        const [indirme] = await Promise.all([page.waitForEvent('download'), onaylaVeIndir(page, BASLIKLAR.isKurali)]);
        expect(indirme.suggestedFilename()).toBe('merkez-ekonomi-taksitli-is-kurali.spec.ts');
        expect(readFileSync(await indirme.path(), 'utf8')).toContain('await beklenenUyariyiBekle(page');
      }
      expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
      await baglam.close();
    }
  } finally {
    await tarayici.close();
  }
});
