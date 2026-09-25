// "JetSeyahat (akış)" ve "Ödeme (kredi kartı)" ortak akışı sayfa paketlerini üretir, doğrular ve "Claude outputs/" altına
// yazar (git'e girmez). Nöbetçi'de: önce ödeme ortak akışı, sonra ekran — Ekranlar > Sayfa ekle > Paket yükle.
// Veritabanına ve şirket sitesine dokunmaz. Kullanım: node scripts/jetseyahat-akis-paketi.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { jetSeyahatAkisPaketi } from '../projeler/galaksi/jetseyahat-akis.mjs';
import { odemeAkisPaketi } from '../projeler/galaksi/odeme-akis.mjs';
import { sayfaPaketiniDogrula } from './platform/ekranlar/sayfa-paketi.mjs';

const odeme = odemeAkisPaketi();
const paketler = [['odeme-kredi-karti-akis.paket.json', odeme, {}], ['jetseyahat-akis.paket.json', jetSeyahatAkisPaketi(), {}]];
const klasor = resolve(process.cwd(), 'Claude outputs');
mkdirSync(klasor, { recursive: true });
for (const [ad, paket, secenekler] of paketler) {
  const d = sayfaPaketiniDogrula(paket, secenekler);
  if (!d.gecerli) {
    console.error(`${ad} doğrulanamadı:`, JSON.stringify(d.hatalar, null, 2));
    process.exit(1);
  }
  const dosya = join(klasor, ad);
  writeFileSync(dosya, `${JSON.stringify(paket, null, 2)}\n`);
  console.log(`Yazıldı: ${dosya}`);
}
