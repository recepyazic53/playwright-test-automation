// senaryo-dogrulayici.mjs'i dashboard sayfasına GÖMÜLEBİLİR düz betiğe çevirir: modül import
// içermez; "export function|const" satırlarındaki "export " atılır ve kod bir IIFE içinde
// çalışıp dışa açılan adları tek bir global nesnede (var SenaryoDogrulayici) toplar.
// Böylece tarayıcı, sunucu ve spec AYNI dosyayı çalıştırır (kopya yok).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const buKlasor = dirname(fileURLToPath(import.meta.url));
export const DOGRULAYICI_DOSYASI = join(buKlasor, 'senaryo-dogrulayici.mjs');

/** Modül kaynağını "var <globalAd> = (function () { ... })();" biçimine sarar. */
export function tarayiciIcinSar(kaynak, globalAd = 'SenaryoDogrulayici') {
  if (/^\s*import\b/m.test(kaynak)) throw new Error('senaryo-dogrulayici.mjs import içeremez (tarayıcıya gömülüyor).');
  const adlar = [...kaynak.matchAll(/^export (?:function|const) (\w+)/gm)].map((e) => e[1]);
  const govde = kaynak.replace(/^export (function|const) /gm, '$1 ');
  if (/^\s*export\b/m.test(govde)) throw new Error('senaryo-dogrulayici.mjs: yalnızca "export function" / "export const" desteklenir.');
  if (!adlar.length) throw new Error('senaryo-dogrulayici.mjs içinde dışa açılan ad bulunamadı.');
  return `var ${globalAd} = (function () {\n'use strict';\n${govde}\nreturn Object.freeze({ ${adlar.join(', ')} });\n})();\n`;
}

/** Dashboard'a gömülecek betik (dosya her üretimde yeniden okunur). */
export function tarayiciBetiginiOlustur() {
  return tarayiciIcinSar(readFileSync(DOGRULAYICI_DOSYASI, 'utf-8'));
}
