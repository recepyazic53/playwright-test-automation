// "JetDASK (akış)" sayfa paketini üretir, doğrular ve "Claude outputs/" altına yazar (git'e girmez). Paket "Ödeme (kredi
// kartı)" ortak akışını kullanır (kodlu testte her senaryo öder): Nöbetçi'de o ortak akış yüklü olmalı (JetSeyahat ile
// yüklendi). Ekranlar > Sayfa ekle > Paket yükle. Veritabanına ve şirket sitesine dokunmaz.
// Kullanım: node scripts/jetdask-akis-paketi.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { jetDaskAkisPaketi } from '../projeler/galaksi/jetdask-akis.mjs';
import { odemeAkisPaketi } from '../projeler/galaksi/odeme-akis.mjs';
import { sayfaPaketiniDogrula } from './platform/ekranlar/sayfa-paketi.mjs';

const paket = jetDaskAkisPaketi({ odeme: true });
// Ödeme ortak akışına başvuru: doğrulama, projedeki ortak akış yerine paket üreticisinin modeliyle yapılır.
const odeme = odemeAkisPaketi().model;
const d = sayfaPaketiniDogrula(paket, { altModelKaynagi: (dosya) => (dosya === `${String(odeme.id)}.model.json` ? odeme : undefined) });
if (!d.gecerli) {
  console.error('jetdask-akis.paket.json doğrulanamadı:', JSON.stringify(d.hatalar, null, 2));
  process.exit(1);
}
const klasor = resolve(process.cwd(), 'Claude outputs');
mkdirSync(klasor, { recursive: true });
const dosya = join(klasor, 'jetdask-akis.paket.json');
writeFileSync(dosya, `${JSON.stringify(paket, null, 2)}\n`);
console.log(`Yazıldı: ${dosya}`);
