// Uçtan uca birim testlerinin ortak yardımcısı (spec DEĞİL): GEÇİCİ veritabanıyla, boş bir portta AYRI bir Nöbetçi
// sunucusu başlatır (gerçek Nöbetçi'ye ve veri/ klasörüne dokunulmaz). Yasaklı adres koruması açıktır: "*yasak-ornek*".
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { expect } from '@playwright/test';

const KOK = resolve(__dirname, '..', '..');

export type Nobetci = { adres: string; token: string; surec: ChildProcess };
export type Yanit = Record<string, unknown> & { basarili?: boolean; mesaj?: string; kod?: string };

/** Yasaklı adres kalıbı: "*yasak-ornek*". */
export function yasakliKaliplar(): string {
  return '*yasak-ornek*';
}

export function bosPort(): Promise<number> {
  return new Promise((coz, reddet) => {
    const s = createServer();
    s.once('error', reddet);
    s.listen(0, '127.0.0.1', () => {
      const adres = s.address();
      const port = typeof adres === 'object' && adres ? adres.port : 0;
      s.close(() => coz(port));
    });
  });
}

/** Ayrı Nöbetçi örneği (geçici veritabanı + log klasörü). ekOrtam: sunucuya verilecek ek ortam değişkenleri. */
export async function nobetciBaslat(klasor: string, vtYolu: string, ekOrtam: Record<string, string> = {}): Promise<Nobetci> {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|TEST_ENV$|KOSU_KIMLIGI|NOBETCI_)/.test(k)) continue;
    env[k] = v;
  }
  const port = await bosPort();
  const surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
    cwd: KOK,
    env: {
      ...env, TEST_SUNUCU_PORT: String(port), PLATFORM_VERITABANI: vtYolu, PLATFORM_YEDEK_KLASORU: join(klasor, 'yedekler'),
      TEST_SUNUCU_LOG_DOSYASI: join(klasor, 'sunucu.log'), NOBETCI_YASAK_ADRESLER: yasakliKaliplar(), ...ekOrtam
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const cikti: string[] = [];
  await new Promise<void>((coz, reddet) => {
    const zaman = setTimeout(() => reddet(new Error(`Nöbetçi başlamadı:\n${cikti.join('')}`)), 30_000);
    const dinle = (p: Buffer): void => {
      cikti.push(p.toString('utf8'));
      if (cikti.join('').includes('Nöbetçi hazır')) { clearTimeout(zaman); coz(); }
    };
    surec.stdout?.on('data', dinle);
    surec.stderr?.on('data', dinle);
    surec.once('exit', (kod) => { clearTimeout(zaman); reddet(new Error(`Nöbetçi kapandı (${kod}):\n${cikti.join('')}`)); });
  });
  const adres = `http://127.0.0.1:${port}`;
  const html = await (await fetch(`${adres}/`)).text();
  const token = /name="oturum-tokeni" content="([^"]+)"/.exec(html)?.[1] ?? '';
  expect(token, 'oturum token').not.toBe('');
  return { adres, token, surec };
}

/** Nöbetçi uç noktası çağrısı (POST: gövde + token; GET: başlıkta token). */
export async function nobetciApi(n: Nobetci, yol: string, govde?: Record<string, unknown>): Promise<Yanit> {
  const r = await fetch(`${n.adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: n.token }) }
    : { headers: { 'x-test-sunucu-token': n.token } });
  return (await r.json()) as Yanit;
}
