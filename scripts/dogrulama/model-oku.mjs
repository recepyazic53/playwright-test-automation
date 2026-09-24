// Ekran modelini (ve başvurduğu alt modelleri) Node tarafında okur — test sunucusu ve
// dashboard üretimi senaryo-dogrulayici.mjs'e bu nesneyi baglam olarak verir. Modelin
// ŞEMA doğrulaması burada değil, koruma testlerinde (tests/support/ekran-modeli.ts >
// ekranModeliniYukle, npm run test:birim) yapılır.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** { model, altModeller: { "<dosya>": altModel } } — her çağrıda diskten taze okunur. */
export function ekranModeliniOku(projeKoku, dosyaAdi = 'jet-seyahat.model.json') {
  const klasor = join(projeKoku, 'tests', 'ekran-modelleri');
  const model = JSON.parse(readFileSync(join(klasor, dosyaAdi), 'utf-8'));
  const dosyalar = new Set();
  for (const adim of model.adimlar || []) if (adim.altModel) dosyalar.add(adim.altModel.dosya);
  for (const alan of model.senaryoDuzeyi?.alanlar || []) if (alan.altModel) dosyalar.add(alan.altModel.dosya);
  const altModeller = {};
  for (const dosya of dosyalar) altModeller[dosya] = JSON.parse(readFileSync(join(klasor, dosya), 'utf-8'));
  return { model, altModeller };
}
