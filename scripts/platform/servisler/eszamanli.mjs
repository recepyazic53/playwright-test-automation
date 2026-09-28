// SERVİS KOŞULARINDA EŞZAMANLILIK — "Aynı anda en çok N servis senaryosu" (Ayarlar > Koşu > Servisler). Basit havuz: en çok N iş
// aynı anda; biten işin yerine sıradaki başlar. N = 1: bugünkü gibi sırayla. Bir senaryonun kendi adımları (akış adımları, oturum /
// token → istek) senaryonun içinde sırayla kalır; paralellik yalnız bağımsız senaryolar (ve veri koşusu satırları) arasındadır.
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';

export const EN_COK_ESZAMANLI = 10;

/** Ayarlar > Koşu > "Aynı anda en çok N servis senaryosu" (1–10; okunamazsa 1 = sırayla). @param {import('../veritabani/baglanti.mjs').Veritabani} vt */
export function servisEszamanliOku(vt) {
  let n = 1;
  try { n = Number(kosuAyarlariniOku(vt).servisEszamanli); } catch { n = 1; }
  return Number.isInteger(n) ? Math.min(EN_COK_ESZAMANLI, Math.max(1, n)) : 1;
}

/**
 * Öğeleri en çok n eşzamanlı işle yürütür; her öğe için is(oge, sira) bir kez çağrılır, öğeler SIRAYLA başlatılır (n = 1: tam
 * sırayla). devam() false dönerse yeni öğe başlatılmaz (çalışanlar biter). Sonuçlar öğe sırasıyla döner (başlatılmayan: undefined).
 * @template T, S
 * @param {ReadonlyArray<T>} ogeler @param {number} n @param {(oge: T, sira: number) => Promise<S>} is @param {() => boolean} [devam]
 * @returns {Promise<Array<S | undefined>>}
 */
export async function sinirliKos(ogeler, n, is, devam = () => true) {
  /** @type {Array<S | undefined>} */
  const sonuclar = new Array(ogeler.length).fill(undefined);
  let siradaki = 0;
  const isci = async () => {
    while (siradaki < ogeler.length) {
      if (!devam()) return;
      const i = siradaki++;
      sonuclar[i] = await is(ogeler[i], i);
    }
  };
  const adet = Math.max(1, Math.min(Math.floor(n) || 1, ogeler.length));
  await Promise.all(Array.from({ length: adet }, isci));
  return sonuclar;
}
