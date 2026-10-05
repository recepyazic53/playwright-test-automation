// SAYFA FARKI (hızlı test; saf, DOM yok, ürün / alan adı yok). Bir değer sayfaya uygulandıktan (metin yazılıp alandan çıkıldı, seçim
// yapıldı) ya da düğmeye basıldıktan sonra sayfanın iki okuması karşılaştırılır:
//   - beliren / kaybolan alanlar,
//   - seçenekleri yeni dolan, değişen ya da boşalan açılır listeler,
//   - etkinleşen / kilitlenen alanlar (devre dışı ya da sayfanın kilidi; #191 alanKilidi),
//   - sayfanın kendi doldurduğu değerler (yazılmayan alanın "hazır" değeri değişti ya da alan dolu belirdi).
// farkOzeti kullanıcıya gösterilen tek cümleyi kurar ("“Kod” girilince “Marka” listesi doldu; …"). tetikHedefleri bir METİN alanına değer
// girilince beliren / dolan alanları (tetik ilişkisi) seçer: bağlı liste zincirinin alt halkası (üstü de hedefse) tetiğin hedefi değildir —
// o alan üstüne bağlıdır. Değer okunmaz ve üretilmez: yalnız sayfanın okumasındaki "hazır" değer metni (mevcut) kullanılır.
// NOT: import.meta KULLANILMAZ. Tipler: sayfa-farki.d.mts.
import { gercekSecenekler } from '../tarama/zincir-kesfi.mjs';

/** Farka girmeyen öğe türleri (düğmeler ve gizli alanlar). */
const DISI = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
/** @param {any} a */
const listeMi = (a) => ['select', 'select-one'].includes(String(a?.tur)) && !a?.coklu;
/** @param {any} a */
const imza = (a) => JSON.stringify(gercekSecenekler(a?.secenekler).map((s) => s.deger));
/** @param {any} a */
const kapali = (a) => Boolean(a?.devreDisi) || Boolean(a?.kilit);
/** @param {any} a */
const hazirDeger = (a) => (a?.hazir === true && a?.mevcut !== undefined && a?.mevcut !== null && String(a.mevcut).trim() !== '' ? String(a.mevcut) : null);

/**
 * İki okumanın farkı. yazilanlar: bu uygulamada Nöbetçi'nin yazdığı alanlar (sayfanın doldurduğu sayılmaz).
 * @param {ReadonlyArray<any>} once @param {ReadonlyArray<any>} sonra @param {ReadonlyArray<string>} [yazilanlar]
 * @returns {import('./sayfa-farki.d.mts').SayfaFarki}
 */
export function sayfaFarki(once, sonra, yazilanlar = []) {
  const o = (once ?? []).filter((a) => a && typeof a.anahtar === 'string' && !DISI.has(String(a.tur)));
  const s = (sonra ?? []).filter((a) => a && typeof a.anahtar === 'string' && !DISI.has(String(a.tur)));
  const onceki = new Map(o.map((a) => [a.anahtar, a]));
  const simdiki = new Set(s.map((a) => a.anahtar));
  const yazilan = new Set(yazilanlar);
  /** @type {import('./sayfa-farki.d.mts').SayfaFarki} */
  const f = { belirenler: [], kaybolanlar: [], dolanListeler: [], degisenListeler: [], bosalanListeler: [], etkinlesenler: [], kilitlenenler: [], sayfaDoldurdu: [] };
  for (const a of s) {
    const x = onceki.get(a.anahtar);
    const v = hazirDeger(a);
    if (!x) {
      f.belirenler.push(a.anahtar);
      if (v !== null && !yazilan.has(a.anahtar)) f.sayfaDoldurdu.push({ anahtar: a.anahtar, deger: v });
      continue;
    }
    if (listeMi(a)) {
      const n0 = gercekSecenekler(x.secenekler).length;
      const n1 = gercekSecenekler(a.secenekler).length;
      if (!n0 && n1) f.dolanListeler.push(a.anahtar);
      else if (n0 && !n1) f.bosalanListeler.push(a.anahtar);
      else if (n0 && imza(x) !== imza(a)) f.degisenListeler.push(a.anahtar);
    }
    if (kapali(x) && !kapali(a)) f.etkinlesenler.push(a.anahtar);
    else if (!kapali(x) && kapali(a)) f.kilitlenenler.push(a.anahtar);
    if (v !== null && v !== hazirDeger(x) && !yazilan.has(a.anahtar)) f.sayfaDoldurdu.push({ anahtar: a.anahtar, deger: v });
  }
  for (const a of o) if (!simdiki.has(a.anahtar)) f.kaybolanlar.push(a.anahtar);
  return f;
}

/** Farkta bir şey var mı? @param {import('./sayfa-farki.d.mts').SayfaFarki} f */
export const farkVar = (f) => Object.values(f).some((l) => Array.isArray(l) && l.length > 0);

/**
 * Kullanıcıya gösterilen özet: "“Kod” girilince “Marka” listesi doldu; “Model” belirdi; sayfa “Marka” = “BMW” doldurdu." Fark yoksa ''.
 * neden: cümlenin başı ("“Kod” girilince"; yoksa "Sayfada"). ad: anahtar → görünen ad.
 * @param {import('./sayfa-farki.d.mts').SayfaFarki} f @param {{ neden?: string | null; ad: (anahtar: string) => string }} s @returns {string}
 */
export function farkOzeti(f, s) {
  const adlar = (/** @type {string[]} */ l) => l.map((k) => `“${s.ad(k)}”`).join(', ');
  const cok = (/** @type {string[]} */ l, /** @type {string} */ tekil, /** @type {string} */ cogul) => (l.length > 1 ? cogul : tekil);
  const parcalar = [
    f.dolanListeler.length ? `${adlar(f.dolanListeler)} ${cok(f.dolanListeler, 'listesi', 'listeleri')} doldu` : '',
    f.degisenListeler.length ? `${adlar(f.degisenListeler)} ${cok(f.degisenListeler, 'listesinin', 'listelerinin')} seçenekleri değişti` : '',
    f.bosalanListeler.length ? `${adlar(f.bosalanListeler)} ${cok(f.bosalanListeler, 'listesi', 'listeleri')} boşaldı` : '',
    f.belirenler.length ? `${adlar(f.belirenler)} ${cok(f.belirenler, 'belirdi', 'alanları belirdi')}` : '',
    f.kaybolanlar.length ? `${adlar(f.kaybolanlar)} ${cok(f.kaybolanlar, 'gizlendi', 'alanları gizlendi')}` : '',
    f.etkinlesenler.length ? `${adlar(f.etkinlesenler)} ${cok(f.etkinlesenler, 'düzenlenebilir oldu', 'düzenlenebilir oldu')}` : '',
    f.kilitlenenler.length ? `${adlar(f.kilitlenenler)} kilitlendi` : '',
    f.sayfaDoldurdu.length ? `sayfa ${f.sayfaDoldurdu.slice(0, 6).map((x) => `“${s.ad(x.anahtar)}” = “${x.deger.slice(0, 60)}”`).join(', ')} doldurdu` : ''
  ].filter(Boolean);
  if (!parcalar.length) return '';
  return `${s.neden ?? 'Sayfada'} ${parcalar.join('; ')}.`;
}

/**
 * Metin alanına değer girilince sayfada beliren / dolan alanlar (tetik hedefleri; kaynak alanın kendisi hariç). Bağlı liste zincirinin
 * alt halkası, üstü de hedefse hedef değildir (üstüne bağlıdır). olay: 'belirdi' (alan yeni göründü) | 'doldu' (listenin seçenekleri geldi
 * ya da değişti).
 * @param {import('./sayfa-farki.d.mts').SayfaFarki} f @param {string} kaynak @param {ReadonlyMap<string, string>} [bagliUst] alt → üst
 * @returns {Array<{ hedef: string; olay: 'belirdi' | 'doldu' }>}
 */
export function tetikHedefleri(f, kaynak, bagliUst = new Map()) {
  const adaylar = [...new Set([...f.belirenler, ...f.dolanListeler, ...f.degisenListeler])].filter((k) => k !== kaynak);
  const kume = new Set(adaylar);
  /** Üstlerinden biri de hedef mi (zincirin alt halkası)? @param {string} k */
  const ustuHedef = (k) => { for (let u = bagliUst.get(k), n = 0; u && n < 10; u = bagliUst.get(u), n++) if (kume.has(u)) return true; return false; };
  return adaylar.filter((k) => !ustuHedef(k)).map((k) => ({ hedef: k, olay: f.belirenler.includes(k) ? 'belirdi' : 'doldu' }));
}
