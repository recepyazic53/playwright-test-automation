// "JetSağlık (akış)" ve "Ödeme (doğrudan kart formu)" ortak akışı sayfa paketlerini üretir, doğrular ve "Claude outputs/" altına
// yazar (git'e girmez). JetSağlık'ta kart formu Poliçeleştir'den sonra doğrudan açılır; Nöbetçi'de önce bu ortak akış, sonra
// ekran yüklenir: Ekranlar > Sayfa ekle > Paket yükle. Veritabanına ve şirket sitesine dokunmaz.
// Kullanım: node scripts/jetsaglik-akis-paketi.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { jetSaglikAkisPaketi } from '../projeler/galaksi/jetsaglik-akis.mjs';
import { dogrudanKartOdemeAkisPaketi } from '../projeler/galaksi/odeme-akis.mjs';
import { sayfaPaketiniDogrula } from './platform/ekranlar/sayfa-paketi.mjs';

const paket = jetSaglikAkisPaketi({ odeme: true });
// Ödeme ortak akışına başvuru: doğrulama, projedeki ortak akış yerine paket üreticisinin modeliyle yapılır.
const odeme = dogrudanKartOdemeAkisPaketi().model;
const d = sayfaPaketiniDogrula(paket, { altModelKaynagi: (dosya) => (dosya === `${String(odeme.id)}.model.json` ? odeme : undefined) });
if (!d.gecerli) {
  console.error('jetsaglik-akis.paket.json doğrulanamadı:', JSON.stringify(d.hatalar, null, 2));
  process.exit(1);
}
const klasor = resolve(process.cwd(), 'Claude outputs');
mkdirSync(klasor, { recursive: true });
const dosya = join(klasor, 'jetsaglik-akis.paket.json');
writeFileSync(dosya, `${JSON.stringify(paket, null, 2)}\n`);
console.log(`Yazıldı: ${dosya}`);
const odemeDosyasi = join(klasor, 'odeme-dogrudan-kart-akis.paket.json');
writeFileSync(odemeDosyasi, `${JSON.stringify(dogrudanKartOdemeAkisPaketi(), null, 2)}\n`);
console.log(`Yazıldı: ${odemeDosyasi}`);
