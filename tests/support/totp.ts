import { createHmac } from 'node:crypto';

// RFC 6238 (TOTP) — Google Authenticator/authenticator uygulamalarıyla birebir aynı
// algoritma. Harici bir npm paketi eklemeye gerek kalmasın diye (bu ortamda npm
// registry'ye her zaman erişilemeyebiliyor) standart Node.js crypto modülüyle
// kendimiz uyguluyoruz. Varsayılanlar authenticator uygulamalarınınkiyle aynı:
// 30 saniyelik zaman penceresi, SHA-1, 6 haneli kod.
const BASE32_ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Coz(secret: string): Buffer {
  const temiz = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bitler = '';
  for (const karakter of temiz) {
    const deger = BASE32_ALFABE.indexOf(karakter);
    if (deger === -1) continue;
    bitler += deger.toString(2).padStart(5, '0');
  }
  const baytlar: number[] = [];
  for (let i = 0; i + 8 <= bitler.length; i += 8) {
    baytlar.push(parseInt(bitler.slice(i, i + 8), 2));
  }
  return Buffer.from(baytlar);
}

/**
 * Verilen base32 TOTP secret'ından (authenticator uygulamasına QR ile eklenen seed —
 * CANLI_AUTH_SECRET) o ANKİ 6 haneli kodu üretir. Kodun geçerlilik penceresi 30 saniye
 * olduğu için bu fonksiyon her zaman koda GERÇEKTEN ihtiyaç duyulduğu anda (login
 * formunu doldururken) çağrılmalı — önceden üretilip bir değişkende bekletilmemelidir.
 */
export function totpKoduUret(secret: string, zaman = Date.now()): string {
  const anahtar = base32Coz(secret);
  const sayac = Math.floor(zaman / 1000 / 30);

  const sayacBuffer = Buffer.alloc(8);
  sayacBuffer.writeBigUInt64BE(BigInt(sayac));

  const hmac = createHmac('sha1', anahtar).update(sayacBuffer).digest();
  const ofset = hmac[hmac.length - 1] & 0x0f;
  const kirpilmis =
    ((hmac[ofset] & 0x7f) << 24) |
    ((hmac[ofset + 1] & 0xff) << 16) |
    ((hmac[ofset + 2] & 0xff) << 8) |
    (hmac[ofset + 3] & 0xff);

  return String(kirpilmis % 1_000_000).padStart(6, '0');
}
