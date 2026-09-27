// Platform birim testlerinin ortak yardımcıları (spec DEĞİL — doğrudan koşmaz).
// - Her test kendi geçici klasöründe çalışır (repo içinde veritabanı/yedek BIRAKILMAZ).
// - Log yakalayıcı: test boyunca console.* ve process.stdout/stderr'e yazılan her şey
//   toplanır; afterEach'te hiçbir gizli değerin loglanmadığı doğrulanır.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from '@playwright/test';

/**
 * POSIX dosya izinleri (0600/0700) yalnız macOS/Linux'ta anlamlıdır; Windows mode bitlerini uygulamaz (her zaman
 * 0666/0777 döner) — orada dosyalar kullanıcı profilinin ACL'siyle korunur (bkz. gecici-dosyalar.mjs).
 */
export const POSIX_IZINLERI = process.platform !== 'win32';

/** Testleri hızlandırmak için düşük scrypt maliyeti (üretim: N=2^17). */
export const HIZLI_KDF = { N: 2 ** 14, r: 8, p: 1 } as const;

export function geciciKlasor(onEk: string): { yol: string; temizle: () => void } {
  const yol = mkdtempSync(join(tmpdir(), `platform-birim-${onEk}-`));
  return { yol, temizle: () => rmSync(yol, { recursive: true, force: true }) };
}

type YazmaFn = typeof process.stdout.write;

export interface LogYakalayici {
  metin(): string;
  birak(): void;
  gizliYokMu(gizliler: readonly string[]): void;
}

export function loglariYakala(): LogYakalayici {
  const parcalar: string[] = [];
  const konsolAdlari = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const eskiKonsol = konsolAdlari.map((ad) => [ad, console[ad]] as const);
  for (const ad of konsolAdlari) {
    console[ad] = (...argumanlar: unknown[]) => {
      parcalar.push(argumanlar.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  }
  const eskiStdout: YazmaFn = process.stdout.write.bind(process.stdout);
  const eskiStderr: YazmaFn = process.stderr.write.bind(process.stderr);
  const yakala = (eski: YazmaFn): YazmaFn =>
    ((parca: string | Uint8Array, ...geri: unknown[]) => {
      parcalar.push(typeof parca === 'string' ? parca : Buffer.from(parca).toString('utf8'));
      return (eski as (p: string | Uint8Array, ...g: unknown[]) => boolean)(parca, ...geri);
    }) as YazmaFn;
  process.stdout.write = yakala(eskiStdout);
  process.stderr.write = yakala(eskiStderr);
  return {
    metin: () => parcalar.join('\n'),
    birak: () => {
      for (const [ad, fn] of eskiKonsol) console[ad] = fn;
      process.stdout.write = eskiStdout;
      process.stderr.write = eskiStderr;
    },
    gizliYokMu(gizliler) {
      const tum = parcalar.join('\n');
      for (const gizli of gizliler) expect(tum.includes(gizli), `Gizli değer loglarda görünmemeli`).toBe(false);
    }
  };
}
