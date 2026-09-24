// Platform birim testlerinin ortak yardımcıları (spec DEĞİL — doğrudan koşmaz).
// - Her test kendi geçici klasöründe çalışır (repo içinde veritabanı/yedek BIRAKILMAZ).
// - Log yakalayıcı: test boyunca console.* ve process.stdout/stderr'e yazılan her şey
//   toplanır; afterEach'te hiçbir gizli değerin loglanmadığı doğrulanır.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect } from '@playwright/test';

/**
 * Birim testlerinin SAHTE değerli eski-dosya örneği (eski tests/data + tests/ekran-modelleri düzeni).
 * Gerçek kimlik/kart/acente/adres/kullanıcı bilgisi İÇERMEZ; gerçek proje verisi yalnızca platform
 * veritabanındadır.
 */
export const ORNEK_ESKI_DOSYALAR = resolve(__dirname, 'fixtures', 'ornek-eski-dosyalar');
/** Örnek JetSeyahat ekran modeli (alt modeli aynı klasörde). */
export const ORNEK_MODEL_DOSYASI = join(ORNEK_ESKI_DOSYALAR, 'tests', 'ekran-modelleri', 'jet-seyahat.model.json');
/** Örnek aktarım için SAHTE ortam değişkenleri (gerçek adres/kullanıcı/parola değildir). */
export const SAHTE_ORTAM_DEGISKENLERI: Readonly<Record<string, string>> = Object.freeze({
  TEST_BASE_URL: 'https://test.ornek.invalid',
  CANLI_BASE_URL: 'https://canli.ornek.invalid',
  LOGIN_USERNAME: 'ornek.kullanici',
  TEST_PASSWORD: 'Ornek-Test-Parolasi-1',
  CANLI_PASSWORD: 'Ornek-Canli-Parolasi-2',
  CANLI_AUTH_SECRET: 'JBSWY3DPEHPK3PXP'
});

/** Örnek eski veri dosyası (ör. ornekVeri('test', 'ortak')). */
export function ornekVeri<T>(ortam: 'test' | 'canli', dosya: string): T {
  return JSON.parse(readFileSync(join(ORNEK_ESKI_DOSYALAR, 'tests', 'data', ortam, `${dosya}.json`), 'utf-8')) as T;
}

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
