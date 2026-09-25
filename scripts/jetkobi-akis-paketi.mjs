// "JetKOBİ (akış)" sayfa paketini ve kullandığı "Ödeme (teklif kaydet + kredi kartı)" ortak akışını üretir, doğrular ve
// "Claude outputs/" altına yazar (git'e girmez). Nöbetçi'de ÖNCE ortak akış (odeme-teklif-kaydet-akis.paket.json), sonra
// ekran paketi yüklenir: Ekranlar > Sayfa ekle > Paket yükle. Veritabanına ve şirket sitesine dokunmaz.
// Kullanım: node scripts/jetkobi-akis-paketi.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { jetKobiAkisPaketi, teklifKaydetOdemeAkisPaketi } from '../projeler/galaksi/jetkobi-akis.mjs';
import { sayfaPaketiniDogrula } from './platform/ekranlar/sayfa-paketi.mjs';

const odemePaketi = teklifKaydetOdemeAkisPaketi();
const paket = jetKobiAkisPaketi({ odeme: true });
const odeme = odemePaketi.model;
const dogrulamalar = [
  ['odeme-teklif-kaydet-akis.paket.json', odemePaketi, sayfaPaketiniDogrula(odemePaketi, {})],
  // Ödeme ortak akışına başvuru: doğrulama, projedeki ortak akış yerine paket üreticisinin modeliyle yapılır.
  ['jetkobi-akis.paket.json', paket, sayfaPaketiniDogrula(paket, { altModelKaynagi: (dosya) => (dosya === `${String(odeme.id)}.model.json` ? odeme : undefined) })]
];
const klasor = resolve(process.cwd(), 'Claude outputs');
mkdirSync(klasor, { recursive: true });
for (const [ad, p, d] of dogrulamalar) {
  if (!d.gecerli) {
    console.error(`${ad} doğrulanamadı:`, JSON.stringify(d.hatalar, null, 2));
    process.exit(1);
  }
}
for (const [ad, p] of dogrulamalar) {
  const dosya = join(klasor, ad);
  writeFileSync(dosya, `${JSON.stringify(p, null, 2)}\n`);
  console.log(`Yazıldı: ${dosya}`);
}
