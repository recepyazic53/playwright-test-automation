// PAKET AÇILIŞ DENEMESİ — "npm run paketle" sonunda üretilen paketin gerçekten açıldığını doğrular (paketleyici aracı; pakete girmez):
//   · Paketin kendi runtime\node.exe'siyle uygulama\scripts\test-sunucu.mjs başlatılır: GEÇİCİ veri kökü (NOBETCI_VERI_KOKU; kullanıcı
//     verisine dokunulmaz, sonunda silinir) ve boş bir port (TEST_SUNUCU_PORT). Tarayıcı açılmaz (baslat.mjs değil, yalnız sunucu).
//   · Ana sayfa ve sunucunun ARAYUZ_DOSYALARI listesindeki TÜM arayüz dosyaları (liste paketin test-sunucu.mjs'inden okunur)
//     200 dönmeli. İstekler yalnız 127.0.0.1'e gider.
//   · Süreç her durumda kapatılır. Başarısızsa ayrıntılı hata döner (paketleyici "Paket hazır" demez, çıkış kodu ≠ 0).
// iceAktarmaCozumlemesi (paket-ortak.mjs) platformdan bağımsız hafif denetimdir; bu deneme Windows paketinin gerçek açılışıdır.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Boş bir TCP portu (127.0.0.1). @returns {Promise<number>} */
export function bosPort() {
  return new Promise((coz, reddet) => {
    const s = createServer();
    s.once('error', reddet);
    s.listen(0, '127.0.0.1', () => {
      const adres = s.address();
      const port = typeof adres === 'object' && adres ? adres.port : 0;
      s.close(() => (port ? coz(port) : reddet(new Error('Boş port bulunamadı.'))));
    });
  });
}

/**
 * Sunucunun sunduğu arayüz dosyalarının adresleri (test-sunucu.mjs > ARAYUZ_DOSYALARI anahtarları; metinden okunur, çalıştırılmaz).
 * @param {string} sunucuMetni @returns {string[]}
 */
export function arayuzAdresleri(sunucuMetni) {
  const bas = sunucuMetni.indexOf('const ARAYUZ_DOSYALARI');
  if (bas < 0) return [];
  const son = sunucuMetni.indexOf(']);', bas);
  const govde = sunucuMetni.slice(bas, son < 0 ? undefined : son);
  return [...new Set([...govde.matchAll(/\[\s*'(\/arayuz\/[^']+)'/g)].map((m) => m[1]))];
}

const bekle = (/** @type {number} */ ms) => new Promise((c) => setTimeout(c, ms));

/**
 * Açılış denemesi. hedef: paket klasörü (runtime\node.exe, uygulama\scripts\test-sunucu.mjs).
 * @param {{ hedef: string; zamanAsimiMs?: number; log?: (m: string) => void }} g
 * @returns {Promise<{ basarili: boolean; port: number; dosyaSayisi: number; hatalar: string[] }>}
 */
export async function acilisDenemesi(g) {
  const node = join(g.hedef, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
  const sunucu = join(g.hedef, 'uygulama', 'scripts', 'test-sunucu.mjs');
  /** @type {string[]} */
  const hatalar = [];
  if (!existsSync(node)) hatalar.push(`Paketin Node'u yok: ${node}`);
  if (!existsSync(sunucu)) hatalar.push(`Paketin sunucusu yok: ${sunucu}`);
  if (hatalar.length) return { basarili: false, port: 0, dosyaSayisi: 0, hatalar };
  const adresler = arayuzAdresleri(readFileSync(sunucu, 'utf8'));
  if (!adresler.length) return { basarili: false, port: 0, dosyaSayisi: 0, hatalar: ['Sunucunun arayüz dosyası listesi (ARAYUZ_DOSYALARI) okunamadı.'] };
  const port = await bosPort();
  const veriKoku = mkdtempSync(join(tmpdir(), 'nobetci-acilis-'));
  let cikti = '';
  const surec = spawn(node, [sunucu], {
    cwd: join(g.hedef, 'uygulama'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NOBETCI_VERI_KOKU: veriKoku, TEST_SUNUCU_PORT: String(port), PLAYWRIGHT_BROWSERS_PATH: join(g.hedef, 'tarayicilar') }
  });
  let bitti = false;
  surec.on('exit', () => { bitti = true; });
  const topla = (/** @type {Buffer} */ b) => { cikti = (cikti + b.toString('utf8')).slice(-4000); };
  surec.stdout?.on('data', topla);
  surec.stderr?.on('data', topla);
  const kok = `http://127.0.0.1:${port}`;
  const sinir = Date.now() + (g.zamanAsimiMs ?? 60_000);
  try {
    let ana = 0;
    while (Date.now() < sinir && !bitti) {
      try {
        const y = await fetch(`${kok}/`, { signal: AbortSignal.timeout(3000) });
        ana = y.status;
        await y.arrayBuffer();
        if (ana === 200) break;
      } catch { /* sunucu henüz dinlemiyor */ }
      await bekle(300);
    }
    if (ana !== 200) {
      hatalar.push(bitti ? 'Sunucu açılışta kapandı.' : `Ana sayfa ${ana || 'yanıt vermedi'} (${Math.round((g.zamanAsimiMs ?? 60_000) / 1000)} sn).`);
    } else {
      g.log?.(`Ana sayfa 200 (port ${port}); ${adresler.length} arayüz dosyası deneniyor…`);
      for (const a of adresler) {
        try {
          const y = await fetch(`${kok}${a}`, { signal: AbortSignal.timeout(10_000) });
          await y.arrayBuffer();
          if (y.status !== 200) hatalar.push(`${a}: HTTP ${y.status}`);
        } catch (e) { hatalar.push(`${a}: ${/** @type {Error} */ (e).message}`); }
      }
    }
  } finally {
    if (!bitti) {
      surec.kill();
      for (let i = 0; i < 50 && !bitti; i++) await bekle(100);
    }
    try { rmSync(veriKoku, { recursive: true, force: true }); } catch { /* geçici klasör sonra temizlenir */ }
  }
  if (hatalar.length && cikti.trim()) hatalar.push(`Sunucu çıktısı (son satırlar):\n${cikti.trim().split(/\r?\n/).slice(-15).join('\n')}`);
  return { basarili: !hatalar.length, port, dosyaSayisi: adresler.length, hatalar };
}
