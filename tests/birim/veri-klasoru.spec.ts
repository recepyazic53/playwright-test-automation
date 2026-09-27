// KORUMA + ENTEGRASYON (yerel) — Veri klasörü ve yedek klasörü seçimi (scripts/platform/ayarlar/klasor-secimi.mjs):
//   - seçim yoksa bugünkü davranış (NOBETCI_VERI_KOKU → <proje>/veri), seçim ayar dosyasında (kasa dışı) → yeniden başlatınca yeni kök;
//   - yol doğrulaması (göreli, sürücü kökü, sistem / program klasörü reddedilir; ağ ve eşitlenen klasör uyarısı);
//   - taşıma: kopyalar, her dosyayı doğrular, eski klasörü SİLMEZ; "var olan klasörü aç" yalnız Nöbetçi verisi olan klasörde;
//   - yedek klasörü (kasada): otomatik ve "Şimdi yedek al" oraya yazar, mevcut yedekler taşınmaz;
//   - başlatıcılar (Windows Nobetci.cs, macOS betiği) ayar dosyasını okur ve 75 çıkış koduyla yeniden başlatır;
//   - açılış tercihi: kayıtlı tercih yoksa varsayılan tarayıcı; kaydedilmiş "pencere" korunur;
//   - arayüz: karşılama ekranında ve Ayarlar > Yedekleme'de veri klasörü; masaüstü + 390 px taşmasız.
// AYRI Nöbetçi örnekleri geçici veri kökleriyle 127.0.0.1'de çalışır; gerçek veri/ klasörüne dokunulmaz.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { veriKoku } from '../../scripts/platform/calisma-alanlari.mjs';
import { klasorYoluDogrula, veriKlasoruDurumu, veriyiKopyalaVeDogrula, yazilabilirOlmali } from '../../scripts/platform/ayarlar/klasor-secimi.mjs';
import { acilisTercihiniKaydet, acilisTercihiniOku } from '../../scripts/platform/ayarlar/acilis-tercihi.mjs';
import { baslaticiBetigi } from '../../scripts/paket/mac-paketi.mjs';
import { bosPort } from './nobetci-sunucusu';
import { geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Gecici-Veri-Klasoru-1';
type Nesne = Record<string, any>;

/** Ortam değişkenlerini geçici olarak değiştirip geri alır. */
function ortamla<T>(degerler: Record<string, string | undefined>, fn: () => T): T {
  const eski: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(degerler)) { eski[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return fn(); } finally { for (const [k, v] of Object.entries(eski)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test('veri kökü: seçim yoksa bugünkü davranış; ayar dosyasındaki seçim; ortam değişkeni her zaman önce', () => {
  const k = geciciKlasor('veri-koku');
  try {
    const ayar = join(k.yol, 'ayar', 'ayar.json');
    const secili = join(k.yol, 'secili');
    mkdirSync(secili, { recursive: true });
    ortamla({ NOBETCI_VERI_KOKU: undefined, NOBETCI_AYAR_DOSYASI: undefined }, () => expect(veriKoku(k.yol)).toBe(resolve(k.yol, 'veri')));
    ortamla({ NOBETCI_VERI_KOKU: undefined, NOBETCI_AYAR_DOSYASI: ayar }, () => expect(veriKoku(k.yol)).toBe(resolve(k.yol, 'veri'))); // dosya yok
    mkdirSync(join(k.yol, 'ayar'), { recursive: true });
    writeFileSync(ayar, JSON.stringify({ veriKoku: secili }));
    ortamla({ NOBETCI_VERI_KOKU: undefined, NOBETCI_AYAR_DOSYASI: ayar }, () => expect(veriKoku(k.yol)).toBe(resolve(secili)));
    ortamla({ NOBETCI_VERI_KOKU: join(k.yol, 'ortam'), NOBETCI_AYAR_DOSYASI: ayar }, () => expect(veriKoku(k.yol)).toBe(resolve(k.yol, 'ortam')));
    writeFileSync(ayar, '{ bozuk');
    ortamla({ NOBETCI_VERI_KOKU: undefined, NOBETCI_AYAR_DOSYASI: ayar }, () => expect(veriKoku(k.yol)).toBe(resolve(k.yol, 'veri')));
  } finally { k.temizle(); }
});

test('yol doğrulaması: göreli / sürücü kökü / sistem / program klasörü reddedilir; ağ ve eşitlenen klasör uyarısı; yazılabilirlik', () => {
  const k = geciciKlasor('yol-dogrulama');
  try {
    expect(() => klasorYoluDogrula('')).toThrow(/boş/);
    expect(() => klasorYoluDogrula('goreli/klasor')).toThrow(/mutlak/);
    if (process.platform === 'win32') {
      expect(() => klasorYoluDogrula('C:\\')).toThrow(/Sürücü kökü/);
      expect(() => klasorYoluDogrula(`${process.env.SystemRoot || 'C:\\Windows'}\\Nobetci`)).toThrow(/Sistem klasörü/);
      expect(klasorYoluDogrula('\\\\sunucu\\paylasim\\nobetci').uyarilar.join(' ')).toMatch(/Ağ/);
      expect(klasorYoluDogrula('C:\\Users\\kullanici\\OneDrive\\Nobetci').uyarilar.join(' ')).toMatch(/Eşitlenen/);
    } else {
      expect(() => klasorYoluDogrula('/')).toThrow(/Sürücü kökü/);
      expect(() => klasorYoluDogrula('/usr/local/nobetci')).toThrow(/Sistem klasörü/);
      expect(klasorYoluDogrula('/Users/k/Library/Mobile Documents/com~apple~CloudDocs/Nobetci').uyarilar.join(' ')).toMatch(/Eşitlenen/);
    }
    expect(() => klasorYoluDogrula(join(KOK, 'veri-baska'), { yasakKokler: [KOK] })).toThrow(/program \/ paket klasörünün içi/);
    const iyi = klasorYoluDogrula(join(k.yol, 'yeni'), { yasakKokler: [KOK] });
    expect(iyi.uyarilar).toEqual([]);
    yazilabilirOlmali(iyi.yol);
    expect(veriKlasoruDurumu(iyi.yol)).toBe('bos');
    expect(veriKlasoruDurumu(join(k.yol, 'olmayan'))).toBe('yok');
  } finally { k.temizle(); }
});

test('taşıma: kopyalar ve her dosyayı doğrular, eski klasörü silmez; hedef boş olmalı; tarayıcı profili taşınmaz', () => {
  const k = geciciKlasor('tasima');
  try {
    const eski = join(k.yol, 'eski');
    mkdirSync(join(eski, 'calisma-alanlari', 'abc', 'medya'), { recursive: true });
    mkdirSync(join(eski, 'pencere-profili'), { recursive: true });
    writeFileSync(join(eski, 'calisma-alanlari.json'), '{"surum":1}');
    writeFileSync(join(eski, 'calisma-alanlari', 'abc', 'platform.db'), Buffer.alloc(40_000, 7));
    writeFileSync(join(eski, 'calisma-alanlari', 'abc', 'medya', 'x.bin'), 'medya');
    writeFileSync(join(eski, 'pencere-profili', 'Cookies'), 'profil');
    const yeni = join(k.yol, 'yeni');
    const sonuc = veriyiKopyalaVeDogrula(eski, yeni);
    expect(sonuc.dosya).toBe(3);
    expect(existsSync(join(eski, 'calisma-alanlari.json'))).toBe(true); // eski silinmedi
    expect(existsSync(join(yeni, 'pencere-profili'))).toBe(false);
    const ozet = (d: string) => createHash('sha256').update(readFileSync(d)).digest('hex');
    expect(ozet(join(yeni, 'calisma-alanlari', 'abc', 'platform.db'))).toBe(ozet(join(eski, 'calisma-alanlari', 'abc', 'platform.db')));
    expect(veriKlasoruDurumu(yeni)).toBe('nobetci');
    expect(() => veriyiKopyalaVeDogrula(eski, yeni)).toThrow(/boş olmalı/);
    expect(() => veriyiKopyalaVeDogrula(eski, join(eski, 'ic'))).toThrow(/içinde/);
  } finally { k.temizle(); }
});

test('açılış tercihi: kayıtlı tercih yoksa varsayılan tarayıcı; kaydedilmiş "pencere" korunur; ortam değişkeni önce', () => {
  const k = geciciKlasor('acilis');
  try {
    ortamla({ NOBETCI_ACILIS: undefined }, () => {
      expect(acilisTercihiniOku(k.yol)).toEqual({ bicim: 'tarayici', ortamdan: false });
      acilisTercihiniKaydet(k.yol, 'pencere');
      expect(acilisTercihiniOku(k.yol).bicim).toBe('pencere');
    });
    ortamla({ NOBETCI_ACILIS: 'tarayici' }, () => expect(acilisTercihiniOku(k.yol)).toEqual({ bicim: 'tarayici', ortamdan: true }));
    // Başlatıcı: varsayılan tarayıcı açılamazsa pencereye düşer (günlüğe yazar); dosya-ac çıkış kodunu iletir.
    const baslat = readFileSync(join(KOK, 'scripts', 'baslat.mjs'), 'utf8');
    expect(baslat).toContain('Varsayılan tarayıcı açılamadı');
    expect(baslat).toMatch(/varsayilanTarayicidaAc\(\(\) => \{ void pencereAc\(\)/);
    expect(readFileSync(join(KOK, 'scripts', 'dosya-ac.mjs'), 'utf8')).toContain("alt.on('exit', (kod) => process.exit(kod ?? 0));");
  } finally { k.temizle(); }
});

test('başlatıcılar ayar dosyasını okur ve 75 koduyla yeniden başlatır (Windows Nobetci.cs, macOS betiği)', () => {
  const cs = readFileSync(join(KOK, 'scripts', 'paket', 'Nobetci.cs'), 'utf8');
  for (const parca of ['SpecialFolder.LocalApplicationData', '"Nöbetçi", "ayar.json"', 'NOBETCI_AYAR_DOSYASI', 'NOBETCI_VERI_KOKU', 'NOBETCI_YENIDEN_BASLATILABILIR',
    'YenidenBaslatKodu = 75', 'BASLAT_TARAYICI_ACMA', 'Regex.Unescape']) expect(cs, parca).toContain(parca);
  expect(cs.match(/VeriOrtami\((gizli|bilgi)\)/g)).toHaveLength(2); // normal ve arka plan açılışı
  // .NET deseni (Nobetci.cs'deki ile aynı sözdizimi) JSON.stringify ile yazılan Windows yolunu okur.
  const desen = /"veriKoku"\s*:\s*"((?:[^"\\]|\\.)*)"/;
  const yol = 'D:\\Nöbetçi verisi\\"tırnak"';
  const m = desen.exec(JSON.stringify({ veriKoku: yol }, null, 2));
  expect(m && JSON.parse(`"${m[1]}"`)).toBe(yol);
  expect(cs).toContain(String.raw`"\"veriKoku\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\""`);

  const betik = baslaticiBetigi('arm64');
  for (const parca of ['export NOBETCI_AYAR_DOSYASI="$AYAR_KLASORU/ayar.json"', 'export NOBETCI_YENIDEN_BASLATILABILIR=1', '[ "$KOD" -eq 75 ] || return "$KOD"',
    'export NOBETCI_VERI_KOKU="$VERI"', 'veri_ortami']) expect(betik, parca).toContain(parca);
  // Betiğin sed komutu (bash varsa) örnek ayar dosyasından veri klasörünü okur.
  const sed = /\/usr\/bin\/sed -n ('[^']+')/.exec(betik);
  expect(sed).toBeTruthy();
  const k = geciciKlasor('mac-ayar');
  try {
    const ayar = join(k.yol, 'ayar.json');
    writeFileSync(ayar, `${JSON.stringify({ veriKoku: '/Users/deneme/Nobetci Verisi' }, null, 2)}\n`);
    const r = spawnSync('bash', ['-c', `sed -n ${sed?.[1]} "$1" | head -n 1`, 'bash', ayar.replace(/\\/g, '/')], { encoding: 'utf8' });
    if (!r.error && r.status === 0) expect(r.stdout.trim()).toBe('/Users/deneme/Nobetci Verisi');
    const soz = spawnSync('bash', ['-n', '-c', betik], { encoding: 'utf8' });
    if (!soz.error) expect(soz.status, soz.stderr).toBe(0);
  } finally { k.temizle(); }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Sunucu: başlatıcıyı taklit eden döngü (ayar dosyası → NOBETCI_VERI_KOKU; 75 → yeniden başlat)
// ---------------------------------------------------------------------------------------------------------------------------

type Sunucu = { adres: string; token: string; surec: ChildProcess; cikis: Promise<number | null> };

async function sunucuBaslat(ayar: string, logKlasoru: string, port: number): Promise<Sunucu> {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|NOBETCI_)/.test(k)) continue;
    env[k] = v;
  }
  // Başlatıcı gibi: ayar dosyasındaki seçim NOBETCI_VERI_KOKU olur.
  const secili = (JSON.parse(readFileSync(ayar, 'utf8')) as Nesne).veriKoku as string;
  const surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
    cwd: KOK,
    env: { ...env, TEST_SUNUCU_PORT: String(port), TEST_SUNUCU_KOSU_KAPALI: '1', TEST_SUNUCU_WINDOWS_GOREVI_KAPALI: '1', NOBETCI_YASAK_ADRESLER: '*yasak-ornek*',
      NOBETCI_VERI_KOKU: secili, NOBETCI_AYAR_DOSYASI: ayar, NOBETCI_YENIDEN_BASLATILABILIR: '1', TEST_SUNUCU_LOG_DOSYASI: join(logKlasoru, `sunucu-${Date.now()}.log`) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const cikis = new Promise<number | null>((c) => surec.once('exit', (kod) => c(kod)));
  const cikti: string[] = [];
  await new Promise<void>((coz, reddet) => {
    const zaman = setTimeout(() => reddet(new Error(`Nöbetçi başlamadı:\n${cikti.join('')}`)), 30_000);
    const dinle = (p: Buffer): void => { cikti.push(p.toString('utf8')); if (cikti.join('').includes('Nöbetçi hazır')) { clearTimeout(zaman); coz(); } };
    surec.stdout?.on('data', dinle);
    surec.stderr?.on('data', dinle);
  });
  const adres = `http://127.0.0.1:${port}`;
  const token = /name="oturum-tokeni" content="([^"]+)"/.exec(await (await fetch(`${adres}/`)).text())?.[1] ?? '';
  return { adres, token, surec, cikis };
}
async function istek(s: Sunucu, yol: string, govde?: Nesne): Promise<{ durum: number; y: Nesne }> {
  const r = await fetch(`${s.adres}${yol}`, govde
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Sunucu-Token': s.token }, body: JSON.stringify({ ...govde, token: s.token }) }
    : { headers: { 'X-Test-Sunucu-Token': s.token } });
  return { durum: r.status, y: (await r.json()) as Nesne };
}

test('sunucu: seçim → taşı (kopya + doğrulama, eski durur) → yeniden başlat (75) → yeni kökte aynı çalışma alanı; var olan klasörü aç; yedek klasörü; arayüz', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const k = geciciKlasor('veri-klasoru-sunucu');
  let s: Sunucu | null = null;
  const tarayici = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  try {
    const eski = join(k.yol, 'A');
    const yeni = join(k.yol, 'B');
    const ayar = join(k.yol, 'LocalAppData', 'Nöbetçi', 'ayar.json');
    mkdirSync(join(k.yol, 'LocalAppData', 'Nöbetçi'), { recursive: true });
    writeFileSync(ayar, JSON.stringify({ veriKoku: eski }));
    const port = await bosPort();
    s = await sunucuBaslat(ayar, k.yol, port);
    // İlk kurulum: çalışma alanı + kasa + proje.
    expect((await istek(s, '/platform/calisma-alani/olustur', { ad: 'Deneme alanı' })).durum).toBe(200);
    expect((await istek(s, '/platform/kasa/olustur', { parola: PAROLA })).durum).toBe(200);
    expect((await istek(s, '/platform/proje/kaydet', { ad: 'Taşınan proje' })).durum).toBe(200);
    let bilgi = (await istek(s, '/platform/veri-klasoru')).y.veriKlasoru as Nesne;
    expect(bilgi).toMatchObject({ etkin: resolve(eski), secili: eski, secilebilir: true, yenidenBaslatilabilir: true });

    // Yedek klasörü (kasada): seçilen klasöre yazılır; önceki yedekler taşınmaz.
    expect((await istek(s, '/platform/yedek/otomatik', {})).durum).toBe(200);
    const yedekKlasoru = join(k.yol, 'Yedekler');
    const kayit = await istek(s, '/platform/yedek/klasor/kaydet', { klasor: yedekKlasoru });
    expect(kayit.y).toMatchObject({ basarili: true, eskiYedekSayisi: 1, klasor: { etkin: resolve(yedekKlasoru), secili: resolve(yedekKlasoru) } });
    expect((await istek(s, '/platform/yedek/otomatik', {})).y.dosya).toContain(resolve(yedekKlasoru));
    expect(readdirSync(yedekKlasoru).filter((a) => a.endsWith('.tayedek'))).toHaveLength(1);
    expect((await istek(s, '/platform/yedek/klasor/kaydet', { klasor: join(KOK, 'yedek-deneme') })).y.kod).toBe('PAKET_ICI');
    expect((await istek(s, '/platform/yedek/klasor/kaydet', { klasor: '' })).y.klasor.secili).toBeNull();

    // Arayüz: Ayarlar > Yedekleme (veri klasörü kartı + yedek klasörü); masaüstü ve 390 px taşmasız.
    const baglam = await tarayici.newContext({ baseURL: s.adres, viewport: { width: 1400, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/'); // kasa API ile oluşturuldu: açık
    await expect(page.locator('#proje-rozeti')).toBeVisible();
    await page.evaluate(() => { location.hash = '#/ayarlar/yedekleme'; });
    const kart = page.getByRole('group', { name: 'Veri klasörü' });
    await expect(kart).toContainText(resolve(eski));
    await expect(page.getByLabel('Yedek klasörü (tam yol; boş = varsayılan)')).toBeVisible();
    for (const [g, ad] of [[1400, 'masaustu'], [390, '390']] as const) {
      await page.setViewportSize({ width: g, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${g}px taşma`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`yedekleme-veri-klasoru-${ad}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1400, height: 900 });
    // Değiştir: denetle → taşı (kopya + doğrulama) → sonuç + "yeniden başlat".
    await kart.getByRole('button', { name: 'Değiştir…' }).click();
    const d = page.locator('dialog.veri-klasoru-diyalogu');
    await expect(page.getByRole('dialog', { name: 'Veri klasörünü değiştir' })).toBeVisible();
    await d.getByLabel('Yeni veri klasörü (tam yol)').fill(join(KOK, 'veri-ici'));
    await d.getByRole('button', { name: 'Denetle' }).click();
    await expect(d).toContainText('program / paket klasörünün içi');
    await d.getByLabel('Yeni veri klasörü (tam yol)').fill(yeni);
    await d.getByRole('button', { name: 'Denetle' }).click();
    await expect(d).toContainText('Klasör yok: oluşturulacak');
    await expect(d.getByRole('radio', { name: /Yeni klasördeki mevcut veriyi aç/ })).toBeDisabled();
    await d.getByRole('radio', { name: /Mevcut veriyi yeni klasöre taşı/ }).check();
    await page.screenshot({ path: testInfo.outputPath('veri-klasoru-diyalog.png') });
    await d.getByRole('button', { name: 'Uygula' }).click();
    await expect(d).toContainText('Veri klasörü seçildi');
    await expect(d).toContainText('Eski veri klasörü silinmedi');
    await expect(d.getByRole('button', { name: 'Nöbetçi\'yi yeniden başlat' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('veri-klasoru-sonuc.png') });
    expect((JSON.parse(readFileSync(ayar, 'utf8')) as Nesne).veriKoku).toBe(resolve(yeni));
    expect(existsSync(join(eski, 'calisma-alanlari.json'))).toBe(true);
    expect(veriKlasoruDurumu(yeni)).toBe('nobetci');
    const alanlarEski = readdirSync(join(eski, 'calisma-alanlari'));
    for (const a of alanlarEski) {
      const dosya = join(eski, 'calisma-alanlari', a, 'platform.db');
      if (existsSync(dosya)) expect(statSync(join(yeni, 'calisma-alanlari', a, 'platform.db')).size).toBe(statSync(dosya).size);
    }
    // Yeniden başlat: sunucu 75 koduyla çıkar; "başlatıcı" seçimi yeniden okuyup başlatır.
    await d.getByRole('button', { name: 'Nöbetçi\'yi yeniden başlat' }).click();
    expect(await s.cikis).toBe(75);
    s = await sunucuBaslat(ayar, k.yol, port);
    bilgi = (await istek(s, '/platform/veri-klasoru')).y.veriKlasoru as Nesne;
    expect(bilgi.etkin).toBe(resolve(yeni));
    await page.waitForURL(`${s.adres}/`);
    await expect(page.getByRole('heading', { name: 'Kasa kilitli' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByRole('button', { name: 'Kilidi aç' }).click();
    await expect(page.locator('#proje-rozeti')).toHaveText('Taşınan proje');

    // Var olan klasörü aç: yalnız Nöbetçi verisi olan klasörde; boş klasörde reddedilir. Dolu klasörde "boş başla" reddedilir.
    const bos = join(k.yol, 'C');
    mkdirSync(bos, { recursive: true });
    expect((await istek(s, '/platform/veri-klasoru/degistir', { klasor: bos, kip: 'ac', onay: true })).y.kod).toBe('NOBETCI_DEGIL');
    expect((await istek(s, '/platform/veri-klasoru/incele', { klasor: eski })).y.inceleme).toMatchObject({ durum: 'nobetci', ayni: false });
    expect((await istek(s, '/platform/veri-klasoru/degistir', { klasor: eski, kip: 'bos', onay: true })).y.kod).toBe('DOLU');
    expect((await istek(s, '/platform/veri-klasoru/degistir', { klasor: eski, kip: 'ac' })).y.mesaj).toMatch(/onaylayın/);
    expect((await istek(s, '/platform/veri-klasoru/degistir', { klasor: eski, kip: 'ac', onay: true })).y).toMatchObject({ basarili: true, yenidenBaslatGerekli: true, kopya: null });
    expect((JSON.parse(readFileSync(ayar, 'utf8')) as Nesne).veriKoku).toBe(resolve(eski));

    // Karşılama ekranı (çalışma alanı kapalı): "Veri klasörü: … Değiştir… · Var olan veri klasörünü aç…".
    await istek(s, '/platform/calisma-alani/kapat', {});
    await page.goto('/');
    const satir = page.locator('.veri-klasoru-satiri');
    await expect(satir).toContainText(resolve(yeni));
    await expect(satir.getByRole('button', { name: 'Var olan veri klasörünü aç…' })).toBeVisible();
    for (const [g, ad] of [[1400, 'masaustu'], [390, '390']] as const) {
      await page.setViewportSize({ width: g, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${g}px taşma`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`karsilama-veri-klasoru-${ad}.png`), fullPage: true });
    }
    expect(hatalar).toEqual([]);
    await baglam.close();
  } finally {
    await tarayici.close();
    s?.surec.kill('SIGTERM');
    k.temizle();
  }
});
