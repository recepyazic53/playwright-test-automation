// KORUMA TESTİ — TOTP/HOTP (tests/support/totp.ts): RFC 6238 Ek B ve RFC 4226 Ek D test vektörleri.
import { expect, test } from '@playwright/test';
import { base32Coz, hotpUret, totpKoduUret, totpUret, type TotpAlgoritmasi } from '../support/totp';

// RFC 6238 Ek B: anahtarlar ASCII; 8 hane, 30 sn adım.
const ANAHTARLAR: Record<TotpAlgoritmasi, Buffer> = {
  sha1: Buffer.from('12345678901234567890', 'ascii'),
  sha256: Buffer.from('12345678901234567890123456789012', 'ascii'),
  sha512: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii')
};
const RFC6238: ReadonlyArray<[number, string, string, string]> = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826']
];
// RFC 4226 Ek D: HOTP, SHA-1, 6 hane, sayaç 0..9.
const RFC4226 = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

test.describe('TOTP (RFC 6238) ve HOTP (RFC 4226)', () => {
  for (const [zamanSn, sha1, sha256, sha512] of RFC6238) {
    test(`RFC 6238 vektörü T=${zamanSn}`, () => {
      expect(totpUret(ANAHTARLAR.sha1, { zaman: zamanSn * 1000, hane: 8, algoritma: 'sha1' })).toBe(sha1);
      expect(totpUret(ANAHTARLAR.sha256, { zaman: zamanSn * 1000, hane: 8, algoritma: 'sha256' })).toBe(sha256);
      expect(totpUret(ANAHTARLAR.sha512, { zaman: zamanSn * 1000, hane: 8, algoritma: 'sha512' })).toBe(sha512);
    });
  }

  test('RFC 4226 HOTP vektörleri (sayaç 0–9)', () => {
    RFC4226.forEach((beklenen, sayac) => expect(hotpUret(ANAHTARLAR.sha1, sayac)).toBe(beklenen));
  });

  test('base32 anahtar (authenticator biçimi) → 6 haneli kod; varsayılanlar SHA-1/30 sn/6 hane', () => {
    // "12345678901234567890" base32 = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ; T=59 → 94287082 → son 6 hane.
    expect(base32Coz('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(ANAHTARLAR.sha1)).toBe(true);
    expect(totpKoduUret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000)).toBe('287082');
    // Küçük harf, boşluk, tire ve "=" dolgusu yok sayılır.
    expect(totpKoduUret('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq===', 59_000)).toBe('287082');
    // Aynı 30 sn penceresinde aynı kod, sonraki pencerede farklı.
    expect(totpKoduUret('JBSWY3DPEHPK3PXP', 30_000)).toBe(totpKoduUret('JBSWY3DPEHPK3PXP', 59_999));
    expect(totpKoduUret('JBSWY3DPEHPK3PXP', 60_000)).not.toBe(totpKoduUret('JBSWY3DPEHPK3PXP', 59_999));
  });

  test('geçersiz base32 ve hane sayısı açık hata verir (anahtar mesajda geçmez)', () => {
    expect(() => base32Coz('GIZLI-1-ANAHTAR!')).toThrow(/base32/);
    try { base32Coz('GIZLI1ANAHTAR'); } catch (hata) { expect(String(hata)).not.toContain('GIZLI1ANAHTAR'); }
    expect(() => hotpUret(ANAHTARLAR.sha1, 0, 5)).toThrow(/6–8/);
  });
});
