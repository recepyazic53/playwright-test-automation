// "JetİlkAteşKonut (akış)" sayfa paketini ve kullandığı "Ödeme (teklif kaydet + kredi kartı)" ortak akış paketini üretir,
// doğrular ve "Claude outputs/" altına yazar (git'e girmez). Ürün ödemeye "Teklif Kaydet" ile geçer: Nöbetçi'de ÖNCE
// odeme-teklif-kaydet-akis.paket.json (JetKonut ile yüklendiyse tekrar gerekmez), sonra jetilkateskonut-akis.paket.json
// yüklenir (Ekranlar > Sayfa ekle > Paket yükle). Veritabanına ve şirket sitesine dokunmaz.
// Kullanım: node scripts/jetilkateskonut-akis-paketi.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { jetIlkAtesKonutAkisPaketi } from '../projeler/galaksi/jetilkateskonut-akis.mjs';
import { teklifKaydetOdemeAkisPaketi } from '../projeler/galaksi/jetkonut-akis.mjs';
import { sayfaPaketiniDogrula } from './platform/ekranlar/sayfa-paketi.mjs';

const odemePaketi = teklifKaydetOdemeAkisPaketi();
const paket = jetIlkAtesKonutAkisPaketi({ odeme: true });
const odeme = odemePaketi.model;
const dogrulamalar = [
  ['odeme-teklif-kaydet-akis.paket.json', odemePaketi, sayfaPaketiniDogrula(odemePaketi, {})],
  // Ödeme ortak akışına başvuru: doğrulama, projedeki ortak akış yerine paket üreticisinin modeliyle yapılır.
  ['jetilkateskonut-akis.paket.json', paket, sayfaPaketiniDogrula(paket, { altModelKaynagi: (dosya) => (dosya === `${String(odeme.id)}.model.json` ? odeme : undefined) })]
];
for (const [ad, , d] of dogrulamalar) {
  if (!d.gecerli) {
    console.error(`${ad} doğrulanamadı:`, JSON.stringify(d.hatalar, null, 2));
    process.exit(1);
  }
}
const klasor = resolve(process.cwd(), 'Claude outputs');
mkdirSync(klasor, { recursive: true });
for (const [ad, p] of dogrulamalar) {
  const dosya = join(klasor, ad);
  writeFileSync(dosya, `${JSON.stringify(p, null, 2)}\n`);
  console.log(`Yazıldı: ${dosya}`);
}
