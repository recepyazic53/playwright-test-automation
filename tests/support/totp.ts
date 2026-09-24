import { createHmac } from 'node:crypto';

// RFC 6238 (TOTP) / RFC 4226 (HOTP) — authenticator uygulamalarıyla birebir aynı algoritma. Harici npm
// paketi yerine standart Node.js crypto modülüyle uygulanır. Varsayılanlar authenticator
// uygulamalarınınkiyle aynı: 30 sn pencere, SHA-1, 6 hane. RFC 6238 Ek B test vektörleriyle birim
// testlidir (tests/birim/giris-totp.spec.ts). Anahtar ve kod HİÇBİR ZAMAN loglanmaz.
const BASE32_ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type TotpAlgoritmasi = 'sha1' | 'sha256' | 'sha512';

export type TotpSecenekleri = {
  /** Unix zamanı (ms). Varsayılan: şimdi. */
  zaman?: number;
  /** Zaman penceresi (sn). Varsayılan 30. */
  adimSn?: number;
  /** Kod hane sayısı (6–8). Varsayılan 6. */
  hane?: number;
  algoritma?: TotpAlgoritmasi;
};

/** Base32 (RFC 4648) çözer; boşluk/tire ve "=" dolgusu yok sayılır. Geçersiz karakter → hata. */
export function base32Coz(metin: string): Buffer {
  const temiz = metin.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bitler = '';
  for (const karakter of temiz) {
    const deger = BASE32_ALFABE.indexOf(karakter);
    if (deger === -1) throw new Error('TOTP anahtarı geçerli bir base32 metni değil (A–Z ve 2–7 kullanılabilir).');
    bitler += deger.toString(2).padStart(5, '0');
  }
  const baytlar: number[] = [];
  for (let i = 0; i + 8 <= bitler.length; i += 8) baytlar.push(parseInt(bitler.slice(i, i + 8), 2));
  return Buffer.from(baytlar);
}

/** RFC 4226 HOTP: verilen sayaç için kod. */
export function hotpUret(anahtar: Buffer, sayac: bigint | number, hane = 6, algoritma: TotpAlgoritmasi = 'sha1'): string {
  if (!Number.isInteger(hane) || hane < 6 || hane > 8) throw new Error('TOTP hane sayısı 6–8 olmalıdır.');
  const sayacBuffer = Buffer.alloc(8);
  sayacBuffer.writeBigUInt64BE(BigInt(sayac));
  const hmac = createHmac(algoritma, anahtar).update(sayacBuffer).digest();
  const ofset = hmac[hmac.length - 1] & 0x0f;
  const kirpilmis =
    ((hmac[ofset] & 0x7f) << 24) |
    ((hmac[ofset + 1] & 0xff) << 16) |
    ((hmac[ofset + 2] & 0xff) << 8) |
    (hmac[ofset + 3] & 0xff);
  return String(kirpilmis % 10 ** hane).padStart(hane, '0');
}

/** RFC 6238 TOTP: ham anahtar (bayt) ile. */
export function totpUret(anahtar: Buffer, secenekler: TotpSecenekleri = {}): string {
  const adim = secenekler.adimSn ?? 30;
  const sayac = BigInt(Math.floor((secenekler.zaman ?? Date.now()) / 1000 / adim));
  return hotpUret(anahtar, sayac, secenekler.hane ?? 6, secenekler.algoritma ?? 'sha1');
}

/**
 * Base32 TOTP anahtarından (authenticator kurulumundaki gizli anahtar) o ANKİ kodu üretir. Kodun
 * geçerlilik penceresi 30 sn olduğu için koda GERÇEKTEN ihtiyaç duyulduğu anda (kod alanını
 * doldururken) çağrılmalıdır.
 */
export function totpKoduUret(base32Anahtar: string, zaman = Date.now()): string {
  return totpUret(base32Coz(base32Anahtar), { zaman });
}
