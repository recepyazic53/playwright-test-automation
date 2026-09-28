// KOŞU HIZI (sunucu) — eşzamanlılık ve bekleme. Genel değerler Ayarlar > Koşu'da, ortam bazında ezilebilir (ayarlar/kosu-hizi.mjs).
// Servis: "Aynı anda en çok N servis senaryosu" — basit havuz: en çok N iş aynı anda; biten işin yerine sıradaki başlar (N = 1:
// sırayla). Bir senaryonun kendi adımları (akış adımları, oturum / token → istek) senaryonun içinde sırayla kalır; paralellik yalnız
// bağımsız senaryolar (ve veri koşusu satırları) arasındadır. "İstekler arası bekleme": servise giden her istekten sonra o
// eşzamanlılık yuvasında bu kadar beklenir (durdurulunca hemen kesilir).
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { etkinKosuHizi } from '../ayarlar/kosu-hizi.mjs';
import { ortamGetir } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/**
 * Etkin koşu hızı (genel ayar + ortamın "Koşu hızı" ezmesi). Okunamazsa varsayılanlar (1, 0 ms).
 * @param {Veritabani} vt @param {string | null} [ortamId] @returns {import('../ayarlar/kosu-hizi.mjs').EtkinKosuHizi}
 */
export function etkinKosuHiziOku(vt, ortamId) {
  /** @type {Record<string, unknown> | null} */
  let genel = null;
  try { genel = /** @type {any} */ (kosuAyarlariniOku(vt)); } catch { genel = null; }
  /** @type {any} */
  let ortam = null;
  try { ortam = ortamId ? ortamGetir(vt, ortamId) ?? null : null; } catch { ortam = null; }
  return etkinKosuHizi(genel, ortam);
}

/** "Aynı anda en çok N servis senaryosu" (ortamda ezildiyse o). @param {Veritabani} vt @param {string | null} [ortamId] */
export const servisEszamanliOku = (vt, ortamId) => etkinKosuHiziOku(vt, ortamId).degerler.servisEszamanli;

/** "İstekler arası bekleme (ms)" (ortamda ezildiyse o). @param {Veritabani} vt @param {string | null} [ortamId] */
export const servisIstekBeklemeOku = (vt, ortamId) => etkinKosuHiziOku(vt, ortamId).degerler.servisIstekBeklemeMs;

/**
 * ms kadar bekler; sinyal kesilirse hemen döner (hata vermez). ms <= 0 ise beklemez.
 * @param {number} ms @param {AbortSignal} [sinyal] @returns {Promise<void>}
 */
export function kesilebilirBekle(ms, sinyal) {
  if (!(ms > 0) || sinyal?.aborted) return Promise.resolve();
  return new Promise((coz) => {
    const bitir = () => { clearTimeout(z); sinyal?.removeEventListener('abort', bitir); coz(); };
    const z = setTimeout(bitir, ms);
    sinyal?.addEventListener('abort', bitir, { once: true });
  });
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
