// KORUMA TESTLERİ — paket hedefi korunması (scripts/paket/hedef-korumasi.mjs, scripts/paketle.mjs): AĞ YOK; SAHTE hedef
// klasörlerle. Hedeften çalışan bir Nöbetçi (sahte süreç listesi ve Windows'ta hedefe kopyalanmış gerçek node.exe) varsa silme
// reddedilir (--zorla da aşmaz); hedefte kullanıcı verisi (uygulama\veri) varsa --zorla olmadan durulur. Komut satırı da
// denenir: çıkış kodu 2, anlaşılır mesaj, hedef klasör yerinde kalır (tam paketleme ÇALIŞMAZ; ret, kopyalamadan önce gelir).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { hedefDenetimi, kilitliMi, paketArgumanlari } from '../../scripts/paket/hedef-korumasi.mjs';
import { geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');

test('var olmayan ya da boş hedef silinebilir; argümanlar: hedef + --zorla, bilinmeyen bayrak ayrılır', () => {
  const g = geciciKlasor('paket-hedef');
  try {
    expect(hedefDenetimi(join(g.yol, 'yok'), { surecler: [] })).toEqual({ silinebilir: true });
    expect(hedefDenetimi(g.yol, { surecler: [] })).toEqual({ silinebilir: true });
    expect(paketArgumanlari(['C:\\x', '--zorla'])).toEqual({ hedef: 'C:\\x', zorla: true, bilinmeyen: [] });
    expect(paketArgumanlari([])).toEqual({ hedef: null, zorla: false, bilinmeyen: [] });
    expect(paketArgumanlari(['--sil', 'd'])).toEqual({ hedef: 'd', zorla: false, bilinmeyen: ['--sil'] });
  } finally { g.temizle(); }
});

test('hedeften çalışan süreç (sahte liste): reddedilir, --zorla da aşmaz; benzer adlı komşu klasör karışmaz', () => {
  const g = geciciKlasor('paket-hedef');
  try {
    const hedef = join(g.yol, 'Nöbetçi');
    mkdirSync(join(hedef, 'runtime'), { recursive: true });
    const d = hedefDenetimi(hedef, { surecler: [{ pid: 4321, yol: join(hedef, 'runtime', 'node.exe') }], kilitDenemesi: false });
    expect(d.silinebilir).toBe(false);
    if (d.silinebilir) return;
    expect(d.neden).toBe('calisiyor');
    expect(d.mesaj).toContain('Nöbetçi bu klasörden çalışıyor; önce kapatın');
    expect(d.mesaj).toContain('süreç 4321');
    expect(hedefDenetimi(hedef, { zorla: true, surecler: [{ pid: 1, yol: join(hedef, 'Nöbetçi.exe') }], kilitDenemesi: false }).silinebilir).toBe(false);
    if (process.platform === 'win32') {
      // Windows yolları büyük / küçük harf duyarsız.
      expect(hedefDenetimi(hedef, { surecler: [{ pid: 2, yol: join(hedef, 'RUNTIME', 'NODE.EXE').toUpperCase() }], kilitDenemesi: false }).silinebilir).toBe(false);
    }
    expect(hedefDenetimi(hedef, { surecler: [{ pid: 3, yol: join(`${hedef}-eski`, 'runtime', 'node.exe') }], kilitDenemesi: false })).toEqual({ silinebilir: true });
  } finally { g.temizle(); }
});

test('hedefte kullanıcı verisi (uygulama\\veri): --zorla olmadan durur; boş veri klasörü ya da --zorla ile silinebilir', () => {
  const g = geciciKlasor('paket-hedef');
  try {
    const hedef = join(g.yol, 'Nöbetçi');
    const veri = join(hedef, 'uygulama', 'veri');
    mkdirSync(veri, { recursive: true });
    expect(hedefDenetimi(hedef, { surecler: [] })).toEqual({ silinebilir: true });
    writeFileSync(join(veri, 'platform.db'), 'sahte');
    const d = hedefDenetimi(hedef, { surecler: [] });
    expect(d.silinebilir).toBe(false);
    if (d.silinebilir) return;
    expect(d.neden).toBe('veri');
    expect(d.mesaj).toContain('kullanıcı verisi');
    expect(d.mesaj).toContain('--zorla');
    expect(hedefDenetimi(hedef, { zorla: true, surecler: [] })).toEqual({ silinebilir: true });
  } finally { g.temizle(); }
});

test('Windows: hedefe kopyalanmış node.exe çalışırken gerçek süreç listesi ve kilit denemesi reddeder; komut satırı hedefi silmez', async () => {
  test.skip(process.platform !== 'win32', 'Taşınabilir paket yalnız Windows için üretilir.');
  test.setTimeout(120_000);
  const g = geciciKlasor('paket-hedef');
  const hedef = join(g.yol, 'Nöbetçi');
  const node = join(hedef, 'runtime', 'node.exe');
  mkdirSync(join(hedef, 'runtime'), { recursive: true });
  copyFileSync(process.execPath, node);
  const surec = spawn(node, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  try {
    await expect.poll(() => kilitliMi(node), { timeout: 15_000 }).toBe(true);
    const d = hedefDenetimi(hedef);
    expect(d.silinebilir).toBe(false);
    if (!d.silinebilir) expect(d.mesaj).toContain('önce kapatın');
    // Komut satırı: --zorla ile bile reddeder, çıkış kodu 2, hedef yerinde.
    const cli = spawnSync(process.execPath, [join(KOK, 'scripts', 'paketle.mjs'), hedef, '--zorla'], { encoding: 'utf8', timeout: 60_000 });
    expect(cli.status).toBe(2);
    expect(cli.stderr).toContain('Nöbetçi bu klasörden çalışıyor; önce kapatın');
    expect(existsSync(node)).toBe(true);
  } finally {
    surec.kill();
    await new Promise((r) => { if (surec.exitCode !== null) r(null); else surec.once('exit', r); });
  }
  try {
    // Süreç kapandı: kilit kalkar; bu kez içindeki kullanıcı verisi nedeniyle durur (--zorla yok).
    await expect.poll(() => kilitliMi(node), { timeout: 15_000 }).toBe(false);
    mkdirSync(join(hedef, 'uygulama', 'veri'), { recursive: true });
    writeFileSync(join(hedef, 'uygulama', 'veri', 'platform.db'), 'sahte');
    const cli = spawnSync(process.execPath, [join(KOK, 'scripts', 'paketle.mjs'), hedef], { encoding: 'utf8', timeout: 60_000 });
    expect(cli.status).toBe(2);
    expect(cli.stderr).toContain('Hedefte kullanıcı verisi var');
    expect(existsSync(join(hedef, 'uygulama', 'veri', 'platform.db'))).toBe(true);
    const bilinmeyen = spawnSync(process.execPath, [join(KOK, 'scripts', 'paketle.mjs'), hedef, '--sil'], { encoding: 'utf8', timeout: 60_000 });
    expect(bilinmeyen.status).toBe(1);
    expect(existsSync(node)).toBe(true);
  } finally { g.temizle(); }
});
