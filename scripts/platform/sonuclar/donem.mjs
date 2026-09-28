// RAPOR DÖNEMİ (saf; yan etki yok): seçilen dönem (D), hemen önceki eşit uzunlukta dönem (D′), geriye bakış penceresi (G, D′
// öncesi GERIYE_BAKIS_GUN gün) ve kırılım kovaları. Gün sınırı YEREL saatle 00:00'dır (kayıtlar ISO UTC tutulur; karşılaştırma
// milisaniye ile yapılır). Aralıklar yarı açıktır: [bas, bit). Kırılım: ≤ 31 gün günlük, daha uzun haftalık (Pazartesi başlangıçlı).
// Kullanan: sonuclar/donem-raporu.mjs (PDF raporu verisi), sonuclar/sorun-modeli.mjs (dönem ayrımı).

export const GUN_MS = 86_400_000;
/** Dönem seçenekleri: son N gün (bugün dahil) ya da özel tarih aralığı (her iki gün dahil). */
export const DONEM_TURLERI = Object.freeze(['son7', 'son14', 'son30', 'ozel']);
export const VARSAYILAN_DONEM = 'son14';
/** Özel aralıkta en çok gün. */
export const EN_COK_GUN = 366;
/** Geriye bakış penceresi (D′ öncesi; "yeni" / "tekrar eden" ayrımı için). */
export const GERIYE_BAKIS_GUN = 90;
/** Bu kadar güne kadar günlük kırılım; daha uzunsa haftalık. */
export const GUNLUK_KIRILIM_SINIRI = 31;

/** Dönem girdisi geçersiz (uç katmanı DepoHatasi'na çevirir). */
export class DonemHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'DonemHatasi';
  }
}

/** @param {Date} d */
const yerelGun = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Takvim günü ekler (yaz saati geçişinde de yerel 00:00 kalır). @param {Date} d @param {number} n */
export const gunEkle = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** İki yerel gün başlangıcı arasındaki takvim günü. @param {Date} a @param {Date} b */
const gunFarki = (a, b) => Math.round((b.getTime() - a.getTime()) / GUN_MS);
const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** Yerel gün anahtarı (YYYY-AA-GG). @param {Date | number | string} t */
export function gunAnahtari(t) {
  const d = t instanceof Date ? t : new Date(t);
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
}
/** "GG.AA" @param {Date} d */
export const kisaGun = (d) => `${iki(d.getDate())}.${iki(d.getMonth() + 1)}`;
/** "GG.AA.YYYY" @param {Date} d */
export const tamGun = (d) => `${kisaGun(d)}.${d.getFullYear()}`;

/** "YYYY-AA-GG" → yerel gün başlangıcı. @param {unknown} m @param {string} alan */
function gunCoz(m, alan) {
  const e = typeof m === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(m) : null;
  if (!e) throw new DonemHatasi(`"${alan}" YYYY-AA-GG biçiminde bir tarih olmalıdır.`);
  const d = new Date(Number(e[1]), Number(e[2]) - 1, Number(e[3]));
  if (d.getFullYear() !== Number(e[1]) || d.getMonth() !== Number(e[2]) - 1 || d.getDate() !== Number(e[3])) throw new DonemHatasi(`"${alan}" geçerli bir tarih değil.`);
  return d;
}

/**
 * @typedef {{ bas: Date; bit: Date; etiket: string }} Kova
 * @typedef {{ tur: string; baslangic?: string; bitis?: string }} DonemSecimi
 * @typedef {{ tur: string; gun: number; bas: Date; bit: Date; onceki: { bas: Date; bit: Date }; geriBakisBas: Date;
 *   kirilim: 'gunluk' | 'haftalik'; kovalar: Kova[]; oncekiKovalar: Kova[]; etiket: string; oncekiEtiket: string }} Donem
 */

/**
 * Kovalar: günlük (her gün) ya da haftalık (Pazartesi başlangıçlı; ilk ve son kova kısmi olabilir).
 * @param {Date} bas @param {Date} bit @param {'gunluk' | 'haftalik'} kirilim @returns {Kova[]}
 */
export function kovalariUret(bas, bit, kirilim) {
  /** @type {Kova[]} */
  const kovalar = [];
  let k = bas;
  while (k < bit) {
    let sonraki;
    if (kirilim === 'gunluk') sonraki = gunEkle(k, 1);
    else {
      const haftaGunu = (k.getDay() + 6) % 7; // Pazartesi = 0
      sonraki = gunEkle(k, 7 - haftaGunu);
    }
    if (sonraki > bit) sonraki = bit;
    kovalar.push({ bas: k, bit: sonraki, etiket: kisaGun(k) });
    k = sonraki;
  }
  return kovalar;
}

/** Zamanın düştüğü kova (yoksa -1). @param {Kova[]} kovalar @param {number} zamanMs */
export function kovaIndeksi(kovalar, zamanMs) {
  let a = 0;
  let b = kovalar.length - 1;
  while (a <= b) {
    const o = (a + b) >> 1;
    if (zamanMs < kovalar[o].bas.getTime()) b = o - 1;
    else if (zamanMs >= kovalar[o].bit.getTime()) a = o + 1;
    else return o;
  }
  return -1;
}

/** "GG.AA.YYYY – GG.AA.YYYY" (bitiş günü dahil gösterilir). @param {Date} bas @param {Date} bit yarı açık üst sınır */
export const aralikEtiketi = (bas, bit) => `${tamGun(bas)} – ${tamGun(gunEkle(bit, -1))}`;

/**
 * Dönemi hesaplar. Son N gün: bugün dahil N takvim günü. Özel: baslangic ve bitis günleri dahil.
 * @param {DonemSecimi} secim @param {Date} [simdi]
 * @returns {Donem}
 */
export function donemHesapla(secim, simdi = new Date()) {
  const tur = secim && typeof secim.tur === 'string' ? secim.tur : VARSAYILAN_DONEM;
  if (!DONEM_TURLERI.includes(tur)) throw new DonemHatasi(`Dönem yalnızca ${DONEM_TURLERI.join(', ')} olabilir.`);
  let bas;
  let bit;
  if (tur === 'ozel') {
    bas = gunCoz(secim.baslangic, 'baslangic');
    const son = gunCoz(secim.bitis, 'bitis');
    if (son < bas) throw new DonemHatasi('Bitiş, başlangıçtan önce olamaz.');
    bit = gunEkle(son, 1);
  } else {
    bit = gunEkle(yerelGun(simdi), 1);
    bas = gunEkle(bit, -Number(tur.slice(3)));
  }
  const gun = gunFarki(bas, bit);
  if (gun > EN_COK_GUN) throw new DonemHatasi(`Dönem en çok ${EN_COK_GUN} gün olabilir.`);
  const onceki = { bas: gunEkle(bas, -gun), bit: bas };
  const kirilim = gun <= GUNLUK_KIRILIM_SINIRI ? 'gunluk' : 'haftalik';
  return {
    tur, gun, bas, bit, onceki, geriBakisBas: gunEkle(onceki.bas, -GERIYE_BAKIS_GUN), kirilim,
    kovalar: kovalariUret(bas, bit, kirilim), oncekiKovalar: kovalariUret(onceki.bas, onceki.bit, kirilim),
    etiket: aralikEtiketi(bas, bit), oncekiEtiket: aralikEtiketi(onceki.bas, onceki.bit)
  };
}

/**
 * "Aynı seçimlerle yeniden oluştur": aynı uzunlukta, bugüne kaydırılmış dönem seçimi (son N gün aynen kalır; özel aralık bugün
 * biten aynı uzunlukta aralık olur).
 * @param {DonemSecimi} secim @param {Date} [simdi] @returns {DonemSecimi}
 */
export function donemiBuguneKaydir(secim, simdi = new Date()) {
  if (secim.tur !== 'ozel') return { tur: secim.tur };
  const d = donemHesapla(secim, simdi);
  const bugun = yerelGun(simdi);
  return { tur: 'ozel', baslangic: gunAnahtari(gunEkle(bugun, -(d.gun - 1))), bitis: gunAnahtari(bugun) };
}

/** Zaman hangi dönemde: 'D' | 'O' (önceki) | 'G' (geriye bakış) | null. @param {Donem} d @param {number} zamanMs */
export function donemParcasi(d, zamanMs) {
  if (zamanMs >= d.bas.getTime() && zamanMs < d.bit.getTime()) return 'D';
  if (zamanMs >= d.onceki.bas.getTime() && zamanMs < d.onceki.bit.getTime()) return 'O';
  if (zamanMs >= d.geriBakisBas.getTime() && zamanMs < d.onceki.bas.getTime()) return 'G';
  return null;
}
