// KORUMA TESTİ — Veritabanı sürücüleri GERÇEK paketlerle yüklenir ve bağlantı hatası süreci çökertmeden, parolayı sızdırmadan,
// anlaşılır bir hata olarak döner. Yalnızca bu bilgisayarda kapalı bir porta (127.0.0.1) bağlanmayı dener; dışarıya istek yok.
// Sürücü kurulu değilse (npm install mssql oracledb pg mysql2 yapılmamışsa) o sürücünün testi atlanır.
import { createServer } from 'node:net';
import { expect, test } from '@playwright/test';
import { SURUCULER, veritabaniSorgusu } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';

/** Boş (kapalı) bir port: dinlemeye açılıp hemen kapatılır. */
async function kapaliPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((coz) => s.listen(0, '127.0.0.1', coz));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((coz) => s.close(() => coz()));
  return port;
}

async function kuruluMu(paket: string): Promise<boolean> {
  try { await import(paket); return true; } catch { return false; }
}

for (const [surucu, t] of Object.entries(SURUCULER) as Array<[keyof typeof SURUCULER, (typeof SURUCULER)[keyof typeof SURUCULER]]>) {
  test(`${t.etiket}: bağlantı hatası anlaşılır döner, parola sızmaz, süreç çökmez`, async () => {
    test.skip(!(await kuruluMu(t.paket)), `${t.paket} kurulu değil`);
    const parola = 'Gizli-Surucu-Parolasi-7';
    const port = await kapaliPort();
    let hata: Error | null = null;
    try {
      await veritabaniSorgusu({ surucu, sunucu: '127.0.0.1', port, veritabani: 'deneme', kullanici: 'deneme', parola, tls: 'kapali', zamanAsimiSn: 5, yalnizOkuma: true },
        'SELECT 1', {}, { zamanAsimiMs: 5000 });
    } catch (e) { hata = e as Error; }
    expect(hata, 'kapalı porta bağlanma hata vermeli').not.toBeNull();
    expect(hata!.message).toContain(t.etiket);
    expect(hata!.message).not.toContain('kurulu değil');
    expect(hata!.message).not.toContain(parola);
    // Sürücünün geç yaydığı "error" olayları süreci düşürmemeli.
    await new Promise((coz) => setTimeout(coz, 500));
  });
}
