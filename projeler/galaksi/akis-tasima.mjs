// GALAKSİ — KODLU SENARYOLARI AKIŞA TAŞIMA: her "(akış)" ekranı için kodlu testin senaryo matrisini (tests/scenarios/<ürün>/)
// ürün verisinden (yenidenKur > dosyalar; testlerin okuduğu JSON'un aynısı) akış ekranının alanlarına çevirir. Genel taraf:
// scripts/platform/senaryolar/akis-tasima.mjs (önizleme = senaryo kaydıyla aynı doğrulama, onayla yazma).
// Kimlikler değerleriyle değil PROFİL ADIYLA yazılır (akış ekranının kimlik bloğu profil havuzundan çözer).
// Başlıklar kodlu testlerinkiyle aynıdır (yan yana karşılaştırma başlıktan eşleşir).
// NOT: import.meta KULLANILMAZ.

import { jetKaskoTasiyici } from './tasima-kasko.mjs';
import { jetIlkAtesKonutTasiyici, jetKonutTasiyici } from './tasima-konut.mjs';
import { jetKobiTasiyici, jetSaglikTasiyici } from './tasima-saglik-kobi.mjs';

/** @typedef {import('../index.d.mts').YenidenKurulanVeri} YenidenKurulanVeri */
/** @typedef {import('../index.d.mts').AkisSenaryoTaslagi} AkisSenaryoTaslagi */
/** @typedef {Record<string, any>} Nesne */
/** @typedef {(v: YenidenKurulanVeri) => { kaynakEkran: string; taslaklar: AkisSenaryoTaslagi[]; notlar: string[] }} Tasiyici */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** Seçim verisi ({ deger, metin }) → senaryodaki değer (sayfadaki "value"). */
const deger = (/** @type {unknown} */ s) => (nesneMi(s) ? String(/** @type {Nesne} */ (s).deger ?? '') : s === undefined || s === null ? '' : String(s));
/** Ürün verisi (dosya adı + kök anahtar); yoksa açık hata (önizlemede görünür). */
function urunVerisi(/** @type {YenidenKurulanVeri} */ v, /** @type {string} */ dosya, /** @type {string} */ kok) {
  const d = v.dosyalar[dosya];
  const u = nesneMi(d) ? /** @type {Nesne} */ (d)[kok] : undefined;
  if (!nesneMi(u)) throw new Error(`"${dosya}" ürün verisi bu ortamda yok (kodlu testin verisi aktarılmamış).`);
  return /** @type {Nesne} */ (u);
}

/**
 * Kodlu testin ürüne özgü kabul edilen ödeme sonuçları: ödeme ortak akışının başarı mesajlarında yoksa akıştaki ödeme adımı
 * bu sonuçlarda düşer (ortak akışa "veya" mesajı olarak eklenmeli).
 * @param {Nesne} u
 */
function odemeSonucuNotu(u) {
  const l = Array.isArray(u.kabulEdilenOdemeSonuclari) ? u.kabulEdilenOdemeSonuclari.filter((x) => typeof x === 'string' && x) : [];
  return l.length ? [`Kodlu testin kabul ettiği ödeme sonuçları: ${l.map((x) => `“${x}”`).join(', ')}. Ödeme ortak akışının başarı mesajları arasında yoksa ödeme adımı bu sonuçla düşer.`] : [];
}

/** JetDASK: kimlik tipi (özel / tüzel / pasaport) × sigorta ettiren sıfatı (mal sahibi / kiracı); hepsi öder (tests/scenarios/jet-dask/yeni-is-matrisi.spec.ts). */
/** @type {Tasiyici} */
function jetDask(v) {
  const u = urunVerisi(v, 'jet-dask', 'jetDask');
  const profiller = nesneMi(u.profiller) ? u.profiller : {};
  const tipler = /** @type {const} */ ([['ozel', 'Özel', 'sigortaliOzel'], ['tuzel', 'Tüzel', 'sigortaliTuzel'], ['pasaport', 'Pasaport', 'sigortaliPasaport']]);
  const sifatlar = /** @type {const} */ ([['malSahibi', 'Mal Sahibi'], ['kiraci', 'Kiracı']]);
  const tapu = nesneMi(u.tapu) ? u.tapu : {};
  const ortak = {
    adresKodu: String(u.adresKodu ?? ''), ada: String(tapu.ada ?? ''), sayfaNo: String(tapu.sayfaNo ?? ''), pafta: String(tapu.pafta ?? ''),
    bagimsizBolum: String(tapu.bagimsizBolum ?? ''), parsel: String(tapu.parsel ?? ''), brutYuzolcum: String(u.brutYuzolcum ?? ''),
    kullanimSekli: deger(u.kullanimSekli), insaTarzi: deger(u.insaTarzi), insaYili: deger(u.insaYili), toplamKat: deger(u.toplamKat),
    oncekiHasar: deger(u.oncekiHasar), bulunduguKat: deger(u.bulunduguKat), odemeAdimiDahil: true
  };
  const taslaklar = [];
  for (const [tip, tipMetni, profilAnahtari] of tipler) {
    for (const [sifat, sifatMetni] of sifatlar) {
      taslaklar.push({
        baslik: `Sigortalı ${tipMetni} / Sigorta Ettiren Sıfatı ${sifatMetni} / Yeni İş Testi`,
        veri: { sigortaliTipi: tip, sigortaliProfili: String(profiller[profilAnahtari] ?? ''), sigortaEttirenSifati: deger(nesneMi(u.sigortaEttirenSifatlari) ? u.sigortaEttirenSifatlari[sifat] : undefined), ...ortak }
      });
    }
  }
  const notlar = ['Kodlu testteki gibi her senaryoda ödeme dahil ("Ödeme (kredi kartı)" ortak akışı; yalnızca test ortamında koşar).'];
  if (nesneMi(u.bulunduguKat) && u.bulunduguKat.testOrtamSecenekWorkaround) {
    notlar.push('"Bulunduğu kat": kodlu test TEST ekranında eksik olan seçeneği sayfaya kendisi ekliyordu; akış koşucusu eklemez — seçenek hâlâ yoksa adım düşer.');
  }
  if (u.aktif === false) notlar.push('Ürün verisinde "aktif: false": kodlu testler bu ortamda atlanıyordu.');
  notlar.push(...odemeSonucuNotu(u));
  return { kaynakEkran: 'JetDASK', taslaklar, notlar };
}

/** Akış ekranı anahtarı → taşıyıcı. */
/** @type {Record<string, Tasiyici>} */
export const AKIS_TASIYICILARI = {
  'jet-dask-akis': jetDask,
  'jet-saglik-akis': jetSaglikTasiyici,
  'jet-kobi-akis': jetKobiTasiyici,
  'jet-konut-akis': jetKonutTasiyici,
  'jet-ilk-ates-konut-akis': jetIlkAtesKonutTasiyici,
  'jet-kasko-akis': jetKaskoTasiyici
};

/** Taşıması tanımlı akış ekranları (galaksiAdaptoru.akisTasimaEkranlari). */
export const akisTasimaEkranlari = () => Object.keys(AKIS_TASIYICILARI);

/**
 * Adaptör kancası (galaksiAdaptoru.akisSenaryoTaslaklari): ürün verisi sunucu içinde okunur.
 * @param {(vt: any, projeId: string, ortamAnahtari: string) => YenidenKurulanVeri | null} yenidenKur
 */
export function akisSenaryoTaslaklariniKur(yenidenKur) {
  return (/** @type {any} */ vt, /** @type {string} */ projeId, /** @type {string} */ ortamAnahtari, /** @type {string} */ ekranAnahtari) => {
    const t = AKIS_TASIYICILARI[ekranAnahtari];
    if (!t) return null;
    const v = yenidenKur(vt, projeId, ortamAnahtari);
    return v ? t(v) : null;
  };
}
