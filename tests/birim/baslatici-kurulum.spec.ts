// BAŞLATICI — kurulum denetimi (scripts/baslat.mjs + scripts/platform/kurulum-kimligi.mjs): istenen portta çalışan Nöbetçi
// BU kurulumunsa yalnız arayüz açılır; BAŞKA bir kurulumunsa ona dokunulmaz, bu kurulumun sunucusu sıradaki boş portta
// başlatılır ve kullanıcıya bildirilir.
//
// Güvenlik: yalnızca 127.0.0.1'deki iki sahte sunucu ve geçici veri klasörü; tarayıcı açılmaz (BASLAT_TARAYICI_ACMA=1),
// veri/ klasörüne dokunulmaz, dışarıya istek atılmaz.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { kurulumKimligi, portBosMu, saglikOku, sunucuYeriBildirimi, sunucuYeriniBul } from '../../scripts/platform/kurulum-kimligi.mjs';
import { bosPort } from './nobetci-sunucusu';

const KOK = resolve(__dirname, '..', '..');

type SahteSunucu = { port: number; istekler: string[]; kapat: () => Promise<void> };

/** /saglik'a Nöbetçi gibi yanıt veren sahte sunucu (kurulum: null → kimlik bildirmeyen eski sürüm). */
async function sahteNobetci(port: number, kurulum: string | null): Promise<SahteSunucu> {
  const istekler: string[] = [];
  const s: Server = createServer((req, res) => {
    istekler.push(`${req.method} ${req.url}`);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    const govde: Record<string, unknown> = { basarili: true, mesaj: 'Test sunucusu çalışıyor.' };
    if (kurulum) Object.assign(govde, { uygulama: 'nobetci', kurulum });
    res.end(JSON.stringify(req.url === '/saglik' ? govde : { basarili: false }));
  });
  await new Promise<void>((coz, reddet) => { s.once('error', reddet); s.listen(port, '127.0.0.1', () => coz()); });
  return { port, istekler, kapat: () => new Promise<void>((coz) => { s.closeAllConnections(); s.close(() => coz()); }) };
}

/** Ardışık `adet` boş port (ilki). */
async function ardisikBosPortlar(adet: number): Promise<number> {
  for (let deneme = 0; deneme < 50; deneme++) {
    const p = await bosPort();
    if (p + adet > 65535) continue;
    let hepsi = true;
    for (let i = 1; i < adet && hepsi; i++) hepsi = await portBosMu(p + i);
    if (hepsi) return p;
  }
  throw new Error('ardışık boş port bulunamadı');
}

test.describe('kurulum kimliği ve port seçimi', () => {
  test('kimlik veri klasörünün özetidir; yol yanıtta görünmez', () => {
    const a = kurulumKimligi(join(tmpdir(), 'kurulum-a', 'veri'));
    expect(a).toMatch(/^[a-f0-9]{16}$/);
    expect(kurulumKimligi(join(tmpdir(), 'kurulum-a', 'veri') + '/')).toBe(a);
    expect(kurulumKimligi(join(tmpdir(), 'kurulum-b', 'veri'))).not.toBe(a);
  });

  test('iki sahte sunucu: aynı kurulum → mevcut sunucu; farklı kurulum → sıradaki boş port ve bildirim', async () => {
    const kimlik = kurulumKimligi(join(tmpdir(), 'bu-kurulum', 'veri'));
    const p = await ardisikBosPortlar(3);
    const baska = await sahteNobetci(p, kurulumKimligi(join(tmpdir(), 'baska-kurulum', 'veri')));
    try {
      // Farklı kurulum istenen portta: ona dokunulmaz (yalnız /saglik okunur), sıradaki boş port seçilir.
      const yeni = await sunucuYeriniBul({ port: p, kimlik });
      expect(yeni).toEqual({ tur: 'yeni', port: p + 1, baskaKurulumlar: [p], baskaUygulamalar: [], kurulumBilinmiyor: false });
      expect(sunucuYeriBildirimi(yeni, p)).toBe(`Bu bilgisayarda başka bir Nöbetçi ${p} portunda çalışıyor; bu kurulum ${p + 1} portunda açıldı.`);
      expect(baska.istekler.every((x) => x === 'GET /saglik')).toBe(true);

      // Bu kurulumun sunucusu sıradaki portta çalışıyorsa o açılır (ikinci kez başlatılmaz).
      const bu = await sahteNobetci(p + 1, kimlik);
      try {
        const mevcut = await sunucuYeriniBul({ port: p, kimlik });
        expect(mevcut).toMatchObject({ tur: 'mevcut', port: p + 1, baskaKurulumlar: [p] });
        expect(sunucuYeriBildirimi(mevcut, p)).toContain(`bu kurulumun Nöbetçi'si ${p + 1} portunda çalışıyor`);
        // Aynı kurulum istenen portta: bildirim yok.
        const ayni = await sunucuYeriniBul({ port: p + 1, kimlik });
        expect(ayni).toMatchObject({ tur: 'mevcut', port: p + 1, baskaKurulumlar: [] });
        expect(sunucuYeriBildirimi(ayni, p + 1)).toBeNull();
      } finally {
        await bu.kapat();
      }
    } finally {
      await baska.kapat();
    }
  });

  test('kimlik bildirmeyen eski sürüm: iki sunucu açılmasın diye mevcut sayılır ve uyarılır; Nöbetçi olmayan uygulama atlanır', async () => {
    const kimlik = kurulumKimligi(join(tmpdir(), 'bu-kurulum', 'veri'));
    const p = await ardisikBosPortlar(2);
    const eski = await sahteNobetci(p, null);
    try {
      const yer = await sunucuYeriniBul({ port: p, kimlik });
      expect(yer).toMatchObject({ tur: 'mevcut', port: p, kurulumBilinmiyor: true });
      expect(sunucuYeriBildirimi(yer, p)).toMatch(/eski bir Nöbetçi sürümü/);
    } finally {
      await eski.kapat();
    }
    // Nöbetçi olmayan bir uygulama (ör. yanıtı JSON olmayan) portu tutuyorsa atlanır.
    const yabanci = createServer((_q, r) => r.end('merhaba'));
    await new Promise<void>((coz) => yabanci.listen(p, '127.0.0.1', () => coz()));
    try {
      expect(await saglikOku(p)).toEqual({ nobetci: false, kurulum: null });
      const yer = await sunucuYeriniBul({ port: p, kimlik });
      expect(yer).toMatchObject({ tur: 'yeni', port: p + 1, baskaUygulamalar: [p] });
    } finally {
      yabanci.closeAllConnections();
      await new Promise<void>((coz) => yabanci.close(() => coz()));
    }
  });
});

test.describe('baslat.mjs uçtan uca (sahte sunucularla)', () => {
  test.describe.configure({ mode: 'serial' });
  let klasor = '';
  test.beforeAll(() => { klasor = mkdtempSync(join(tmpdir(), 'baslatici-')); });
  test.afterAll(() => { if (klasor) rmSync(klasor, { recursive: true, force: true }); });

  /** baslat.mjs'yi geçici veri klasörüyle, tarayıcı açmadan çalıştırır. */
  function baslat(port: number, ek: string[] = []): { surec: ChildProcess; cikti: () => string } {
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|TEST_ENV$|KOSU_KIMLIGI|NOBETCI_|BASLAT_)/.test(k)) continue;
      env[k] = v;
    }
    const surec = spawn(process.execPath, [join(KOK, 'scripts', 'baslat.mjs'), ...ek], {
      cwd: KOK, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...env, TEST_SUNUCU_PORT: String(port), BASLAT_TARAYICI_ACMA: '1', NOBETCI_VERI_KOKU: join(klasor, 'veri'),
        PLATFORM_VERITABANI: join(klasor, 'platform.db'), PLATFORM_YEDEK_KLASORU: join(klasor, 'yedekler'),
        TEST_SUNUCU_LOG_DOSYASI: join(klasor, 'sunucu.log'), TEST_SUNUCU_WINDOWS_GOREVI_KAPALI: '1'
      }
    });
    const parcalar: string[] = [];
    surec.stdout?.on('data', (b: Buffer) => parcalar.push(b.toString('utf8')));
    surec.stderr?.on('data', (b: Buffer) => parcalar.push(b.toString('utf8')));
    return { surec, cikti: () => parcalar.join('') };
  }

  /** Süreci ve alt süreçlerini (başlatılan sunucu) kapatır. */
  function agaciKapat(s: ChildProcess): void {
    if (s.exitCode !== null || !s.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/T', '/F'], { stdio: 'ignore' });
    else s.kill('SIGTERM');
  }

  test('aynı kurulum → yeni sunucu başlatılmaz, yalnız mevcut sunucunun arayüzü açılır', async () => {
    const p = await ardisikBosPortlar(2);
    const bu = await sahteNobetci(p, kurulumKimligi(join(klasor, 'veri')));
    try {
      const { surec, cikti } = baslat(p);
      const kod = await new Promise<number | null>((coz) => surec.once('exit', coz));
      expect(kod, cikti()).toBe(0);
      expect(cikti()).toContain(`Sunucu ${p} portunda zaten çalışıyor; arayüz açılıyor.`);
      expect(cikti()).toContain(`Nöbetçi arayüzü: http://127.0.0.1:${p}/`);
      expect(cikti()).not.toContain('başka bir Nöbetçi');
      expect(await portBosMu(p + 1)).toBe(true);
      // --arka-plan: bu kurulum çalışıyorsa hiçbir şey yapılmaz.
      const arka = baslat(p, ['--arka-plan']);
      expect(await new Promise<number | null>((coz) => arka.surec.once('exit', coz)), arka.cikti()).toBe(0);
      expect(await portBosMu(p + 1)).toBe(true);
    } finally {
      await bu.kapat();
    }
  });

  test('farklı kurulum → karşı sunucuya dokunulmaz; bu kurulum sıradaki boş portta açılır ve bildirilir', async () => {
    test.setTimeout(90_000);
    const p = await ardisikBosPortlar(2);
    const baska = await sahteNobetci(p, kurulumKimligi(join(klasor, 'baska-kurulum', 'veri')));
    const { surec, cikti } = baslat(p);
    try {
      await expect.poll(cikti, { timeout: 60_000 }).toContain(`Nöbetçi arayüzü: http://127.0.0.1:${p + 1}/`);
      expect(cikti()).toContain(`Bu bilgisayarda başka bir Nöbetçi ${p} portunda çalışıyor; bu kurulum ${p + 1} portunda açıldı.`);
      // Yeni sunucu bu kurulumun kimliğini bildirir; karşı sunucuya yalnız sağlık sorusu gitti.
      expect(await saglikOku(p + 1)).toEqual({ nobetci: true, kurulum: kurulumKimligi(join(klasor, 'veri')) });
      expect(baska.istekler.length).toBeGreaterThan(0);
      expect(baska.istekler.every((x) => x === 'GET /saglik')).toBe(true);
    } finally {
      agaciKapat(surec);
      await baska.kapat();
    }
  });
});
