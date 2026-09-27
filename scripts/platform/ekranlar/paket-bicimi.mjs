// SAYFA PAKETİ BİÇİM DOSYASI (sunucu) — arayüzdeki "Paket biçimini indir" ile verilen TEK dosya (BICIM_DOSYASI_ADI).
// Kullanıcı istek metnini ve bu dosyayı yapay zekâ aracına (tarayıcıyı kullanabilen bir kodlama asistanı) verir; araç depo
// dosyalarını göremese de paketi bu dosyadaki biçimde üretir. İçerik depodaki kaynaklardan HER İSTEKTE birleştirilir (kopya yok):
//   docs/sayfa-paketi.md (kurallar ve alanlar) + docs/sayfa-paketi.schema.json (paket zarfı) + tests/support/ekran-modeli.ts
//   (ekran modelinin tip tanımı; paketlenen sürümde de bulunur). Gizli değer içermez (yalnız belgeler). NOT: import.meta KULLANILMAZ
//   (testler CommonJS olarak yükler): depo kökü çağırandan gelir.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BICIM_DOSYASI_ADI } from './paket-istekleri.mjs';

/** Biçim dosyasının kaynakları (depo köküne göre). */
export const BICIM_KAYNAKLARI = Object.freeze(['docs/sayfa-paketi.md', 'docs/sayfa-paketi.schema.json', 'tests/support/ekran-modeli.ts']);

/** Biçim dosyasının içeriği (Markdown). @param {string} kok depo kökü (docs/ ve tests/support/ burada) */
export function paketBicimiBelgesi(kok) {
  const [belge, sema, model] = BICIM_KAYNAKLARI.map((y) => readFileSync(join(kok, y), 'utf8').replace(/\r\n/g, '\n').trimEnd());
  return [
    `<!-- ${BICIM_DOSYASI_ADI} — Nöbetçi sayfa paketi biçimi (sürüm 1). Bu dosyayı istek metniyle birlikte yapay zekâ aracınıza verin. -->`,
    '',
    belge,
    '',
    '## Ek A — Paket zarfının JSON şeması',
    '',
    '```json',
    sema,
    '```',
    '',
    '## Ek B — Ekran modelinin tip tanımı (model alanı bu yapıdadır)',
    '',
    '```ts',
    model,
    '```',
    ''
  ].join('\n');
}
