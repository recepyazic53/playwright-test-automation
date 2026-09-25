// ÇALIŞMA ALANLARI (genel) — her çalışma alanı = ayrı bir veritabanı dosyası + şifreli medya klasörü +
// yedek klasörü + KENDİ kasa parolası. Sunucu aynı anda yalnızca BİR çalışma alanıyla çalışır.
//
// Kayıt defteri: <veri kökü>/calisma-alanlari.json (veri kökü: NOBETCI_VERI_KOKU ya da <proje kökü>/veri).
// GİZLİ DEĞER İÇERMEZ: kimlik, görünen ad, veri köküne göre göreli yollar, oluşturulma / son açılma zamanı ve
// (veritabanında zaten şifresiz duran) proje sayısı. Görünen adlar kilit açılmadan önce seçim ekranında görünür —
// arayüz bunu kullanıcıya söyler (nötr bir ad seçilebilsin).
//
// İlk çalıştırmada kayıt defteri yoksa ve <veri kökü>/platform.db varsa bu dosya YERİNDE ilk çalışma alanı olarak
// kaydedilir (yollar: platform.db, medya, yedekler) — hiçbir dosya taşınmaz/yeniden adlandırılmaz. Yeni çalışma
// alanları <veri kökü>/calisma-alanlari/<id>/{platform.db, medya/, yedekler/} altında durur. Medya ve yedek
// klasörleri her zaman veritabanı dosyasının yanındadır (medya.mjs > medyaKlasoru, yedek.mjs > varsayilanYedekKlasoru).
//
// Terminal koşuları (npm run test*): NOBETCI_CALISMA_ALANI (kimlik ya da ad) verilmişse o, yoksa son açılan çalışma
// alanı kullanılır (calismaAlaniniCoz). PLATFORM_VERITABANI verilmişse kayıt defterine hiç bakılmaz.
// NOT: import.meta KULLANILMAZ (birim testleri ve tests/support/*.ts bu dosyayı CommonJS'e çevirerek yükler).
import { randomBytes } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeSync
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const KAYIT_DEFTERI_DOSYASI = 'calisma-alanlari.json';
export const CALISMA_ALANLARI_KLASORU = 'calisma-alanlari';
export const VERITABANI_DOSYASI = 'platform.db';
export const CALISMA_ALANI_DEGISKENI = 'NOBETCI_CALISMA_ALANI';
export const VERI_KOKU_DEGISKENI = 'NOBETCI_VERI_KOKU';
export const AD_EN_COK = 60;
/** Kayıt defterinin yerinde kaydettiği ilk (mevcut) çalışma alanının varsayılan adı — kullanıcı değiştirebilir. */
export const ILK_ALAN_ADI = 'Çalışma alanı 1';
/** Güvenli silmede içeriği ezilecek en büyük dosya (daha büyükleri — şifreli video/yedek — yalnızca silinir). */
const EZME_SINIRI = 16 * 1024 * 1024;
const KIMLIK = /^[a-f0-9]{12}$|^ilk$/;

export class CalismaAlaniHatasi extends Error {
  /** @param {'GECERSIZ' | 'BULUNAMADI' | 'AYNI_AD' | 'BOZUK' | 'ACIK' | 'ONAY' | 'MESGUL' | 'SABIT' | 'KAPALI'} kod @param {string} mesaj */
  constructor(kod, mesaj) {
    super(mesaj);
    this.name = 'CalismaAlaniHatasi';
    this.kod = kod;
  }
}

/**
 * Veri kökü: NOBETCI_VERI_KOKU (testler geçici bir kök verir) ya da <proje kökü>/veri.
 * @param {string} [projeKoku] verilmezse çalışma klasörü
 */
export function veriKoku(projeKoku = process.cwd()) {
  const ortam = process.env[VERI_KOKU_DEGISKENI];
  return ortam && ortam.trim() ? resolve(ortam.trim()) : resolve(projeKoku, 'veri');
}

const simdi = () => new Date().toISOString();
/** @param {string} kok */
const defterYolu = (kok) => join(kok, KAYIT_DEFTERI_DOSYASI);

/**
 * Görünen ad: kırpılır; boş olamaz, 60 karakteri geçemez, denetim karakteri içeremez.
 * @param {unknown} ad
 */
export function adiDogrula(ad) {
  if (typeof ad !== 'string') throw new CalismaAlaniHatasi('GECERSIZ', 'Çalışma alanı adı gerekli.');
  const temiz = ad.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!temiz) throw new CalismaAlaniHatasi('GECERSIZ', 'Çalışma alanı adı boş olamaz.');
  if ([...temiz].length > AD_EN_COK) throw new CalismaAlaniHatasi('GECERSIZ', `Çalışma alanı adı en fazla ${AD_EN_COK} karakter olabilir.`);
  if (/[\u0000-\u001f\u007f]/.test(temiz)) throw new CalismaAlaniHatasi('GECERSIZ', 'Çalışma alanı adında denetim karakteri olamaz.');
  return temiz;
}

/** Göreli yol veri kökünün İÇİNDE mi (kök'ün kendisi değil)? @param {string} kok @param {string} goreli */
function icYol(kok, goreli) {
  if (typeof goreli !== 'string' || !goreli || isAbsolute(goreli) || goreli.includes('\0')) return null;
  const tam = resolve(kok, goreli);
  const r = relative(kok, tam);
  if (!r || r.startsWith('..') || isAbsolute(r)) return null;
  return tam;
}

/**
 * @typedef {{ id: string; ad: string; veritabani: string; medya: string; yedekler: string; olusturulma: string;
 *   sonAcilma: string | null; projeSayisi: number | null }} CalismaAlani
 * @typedef {{ surum: 1; sonAcilan: string | null; alanlar: CalismaAlani[] }} KayitDefteri
 */

/** @param {unknown} d @param {string} kok @returns {CalismaAlani | null} */
function alanNormallestir(d, kok) {
  if (!d || typeof d !== 'object') return null;
  const a = /** @type {Record<string, unknown>} */ (d);
  if (typeof a.id !== 'string' || !KIMLIK.test(a.id) || typeof a.ad !== 'string' || !a.ad.trim()) return null;
  if (typeof a.veritabani !== 'string' || !icYol(kok, a.veritabani)) return null;
  const vtKlasoru = a.veritabani.includes('/') ? a.veritabani.slice(0, a.veritabani.lastIndexOf('/') + 1) : '';
  return {
    id: a.id, ad: a.ad.slice(0, AD_EN_COK * 2), veritabani: a.veritabani,
    // Medya ve yedekler her zaman veritabanının yanındadır (tek kural); kayıt defteri yalnızca gösterir.
    medya: `${vtKlasoru}medya`, yedekler: `${vtKlasoru}yedekler`,
    olusturulma: typeof a.olusturulma === 'string' ? a.olusturulma : simdi(),
    sonAcilma: typeof a.sonAcilma === 'string' ? a.sonAcilma : null,
    projeSayisi: Number.isInteger(a.projeSayisi) && Number(a.projeSayisi) >= 0 ? Number(a.projeSayisi) : null
  };
}

/**
 * Kayıt defterini okur (yoksa null). Bozuksa CalismaAlaniHatasi('BOZUK').
 * @param {string} kok veri kökü
 * @returns {KayitDefteri | null}
 */
export function kayitDefteriniOku(kok) {
  const yol = defterYolu(kok);
  if (!existsSync(yol)) return null;
  let ham;
  try {
    ham = JSON.parse(readFileSync(yol, 'utf8'));
  } catch {
    throw new CalismaAlaniHatasi('BOZUK', `Çalışma alanı kayıt defteri okunamadı (${yol}). Dosyayı düzeltin ya da yedeğinden geri alın.`);
  }
  if (!ham || typeof ham !== 'object' || !Array.isArray(ham.alanlar)) {
    throw new CalismaAlaniHatasi('BOZUK', `Çalışma alanı kayıt defteri geçersiz (${yol}).`);
  }
  /** @type {CalismaAlani[]} */
  const alanlar = [];
  for (const d of ham.alanlar) {
    const a = alanNormallestir(d, kok);
    if (a && !alanlar.some((x) => x.id === a.id)) alanlar.push(a);
  }
  const sonAcilan = typeof ham.sonAcilan === 'string' && alanlar.some((a) => a.id === ham.sonAcilan) ? ham.sonAcilan : null;
  return { surum: 1, sonAcilan, alanlar };
}

/** Atomik yazma (geçici dosya + fsync + rename), yalnızca sahibi okuyabilir. @param {string} kok @param {KayitDefteri} defter */
export function kayitDefteriniYaz(kok, defter) {
  mkdirSync(kok, { recursive: true });
  const hedef = defterYolu(kok);
  const gecici = `${hedef}.${process.pid}.${Date.now()}.gecici`;
  const veri = Buffer.from(`${JSON.stringify({ surum: 1, sonAcilan: defter.sonAcilan, alanlar: defter.alanlar }, null, 2)}\n`, 'utf8');
  const fd = openSync(gecici, 'w', 0o600);
  try {
    writeSync(fd, veri, 0, veri.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(gecici, hedef);
  } catch (hata) {
    try { unlinkSync(gecici); } catch { /* yok sayılır */ }
    throw hata;
  }
}

/**
 * Kayıt defterini hazırlar: yoksa oluşturur. <kök>/platform.db varsa (eski tek-veritabanı düzeni) YERİNDE ilk
 * çalışma alanı olarak kaydedilir ve son açılan yapılır; hiçbir dosya taşınmaz.
 * @param {string} kok
 * @returns {{ defter: KayitDefteri; yerindeKaydedildi: boolean }}
 */
export function kayitDefteriniHazirla(kok) {
  const mevcut = kayitDefteriniOku(kok);
  if (mevcut) return { defter: mevcut, yerindeKaydedildi: false };
  /** @type {KayitDefteri} */
  const defter = { surum: 1, sonAcilan: null, alanlar: [] };
  let yerindeKaydedildi = false;
  if (existsSync(join(kok, VERITABANI_DOSYASI))) {
    defter.alanlar.push({
      id: 'ilk', ad: ILK_ALAN_ADI, veritabani: VERITABANI_DOSYASI, medya: 'medya', yedekler: 'yedekler',
      olusturulma: simdi(), sonAcilma: null, projeSayisi: null
    });
    defter.sonAcilan = 'ilk';
    yerindeKaydedildi = true;
  }
  kayitDefteriniYaz(kok, defter);
  return { defter, yerindeKaydedildi };
}

/**
 * Çalışma alanının mutlak yolları. Yol veri kökünün dışına çıkıyorsa CalismaAlaniHatasi.
 * @param {string} kok @param {CalismaAlani} alan
 */
export function alanYollari(kok, alan) {
  const veritabani = icYol(kok, alan.veritabani);
  const medya = icYol(kok, alan.medya);
  const yedekler = icYol(kok, alan.yedekler);
  if (!veritabani || !medya || !yedekler) throw new CalismaAlaniHatasi('GECERSIZ', 'Çalışma alanının yolları veri klasörünün dışında.');
  return { veritabani, medya, yedekler };
}

/** @param {KayitDefteri} defter @param {string} id */
function alanAl(defter, id) {
  const a = defter.alanlar.find((x) => x.id === id);
  if (!a) throw new CalismaAlaniHatasi('BULUNAMADI', 'Çalışma alanı bulunamadı.');
  return a;
}

/** @param {KayitDefteri} defter @param {string} ad @param {string} [haricId] */
function adBenzersizOlmali(defter, ad, haricId) {
  const k = ad.toLocaleLowerCase('tr');
  if (defter.alanlar.some((a) => a.id !== haricId && a.ad.toLocaleLowerCase('tr') === k)) {
    throw new CalismaAlaniHatasi('AYNI_AD', 'Bu adla bir çalışma alanı zaten var.');
  }
}

/**
 * Yeni (boş) çalışma alanı: <kök>/calisma-alanlari/<id>/ klasörü (0700) + kayıt. Veritabanı dosyası kasa
 * oluşturulunca / yedek yüklenince yazılır.
 * @param {string} kok @param {unknown} ad
 */
export function alanOlustur(kok, ad) {
  const temiz = adiDogrula(ad);
  const { defter } = kayitDefteriniHazirla(kok);
  adBenzersizOlmali(defter, temiz);
  let id = randomBytes(6).toString('hex');
  while (defter.alanlar.some((a) => a.id === id)) id = randomBytes(6).toString('hex');
  const klasor = `${CALISMA_ALANLARI_KLASORU}/${id}`;
  mkdirSync(join(kok, CALISMA_ALANLARI_KLASORU, id), { recursive: true, mode: 0o700 });
  /** @type {CalismaAlani} */
  const alan = {
    id, ad: temiz, veritabani: `${klasor}/${VERITABANI_DOSYASI}`, medya: `${klasor}/medya`, yedekler: `${klasor}/yedekler`,
    olusturulma: simdi(), sonAcilma: null, projeSayisi: 0
  };
  defter.alanlar.push(alan);
  kayitDefteriniYaz(kok, defter);
  return alan;
}

/** @param {string} kok @param {string} id @param {unknown} ad */
export function alanYenidenAdlandir(kok, id, ad) {
  const temiz = adiDogrula(ad);
  const { defter } = kayitDefteriniHazirla(kok);
  const alan = alanAl(defter, id);
  adBenzersizOlmali(defter, temiz, id);
  alan.ad = temiz;
  kayitDefteriniYaz(kok, defter);
  return alan;
}

/**
 * Açıldı olarak işaretler (son açılan + zaman) ve isteğe bağlı proje sayısını günceller.
 * @param {string} kok @param {string} id @param {{ projeSayisi?: number | null }} [bilgi]
 */
export function alanAcildi(kok, id, bilgi = {}) {
  const { defter } = kayitDefteriniHazirla(kok);
  const alan = alanAl(defter, id);
  alan.sonAcilma = simdi();
  if (bilgi.projeSayisi !== undefined) alan.projeSayisi = bilgi.projeSayisi;
  defter.sonAcilan = id;
  kayitDefteriniYaz(kok, defter);
  return alan;
}

/** Proje sayısı (veritabanında şifresiz duran bilgi) güncellenir. @param {string} kok @param {string} id @param {number | null} projeSayisi */
export function alanProjeSayisiniYaz(kok, id, projeSayisi) {
  const defter = kayitDefteriniOku(kok);
  const alan = defter?.alanlar.find((a) => a.id === id);
  if (!defter || !alan || alan.projeSayisi === projeSayisi) return;
  alan.projeSayisi = projeSayisi;
  kayitDefteriniYaz(kok, defter);
}

/** "Son açılan" işaretini kaldırır (çalışma alanı kapatıldı; açılışta seçim ekranı gelir). @param {string} kok */
export function sonAcilaniTemizle(kok) {
  const defter = kayitDefteriniOku(kok);
  if (!defter || defter.sonAcilan === null) return;
  defter.sonAcilan = null;
  kayitDefteriniYaz(kok, defter);
}

/**
 * Dosyayı (en iyi çaba) sıfırlarla ezip siler. Büyük dosyalar (şifreli video/yedek) yalnızca silinir.
 * Not: SSD/kopyala-yaz dosya sistemlerinde ezme fiziksel silmeyi garanti etmez.
 * @param {string} yol
 */
function dosyayiEzipSil(yol) {
  try {
    const s = lstatSync(yol);
    if (s.isFile() && s.size > 0 && s.size <= EZME_SINIRI) {
      const fd = openSync(yol, 'r+');
      try {
        const sifir = Buffer.alloc(Math.min(s.size, 1024 * 1024));
        let yazilan = 0;
        while (yazilan < s.size) yazilan += writeSync(fd, sifir, 0, Math.min(sifir.length, s.size - yazilan), yazilan);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
  } catch { /* ezilemedi: yine de silinir */ }
  unlinkSync(yol);
}

/** Klasörü içeriğiyle (sembolik bağları izlemeden) güvenli siler. @param {string} yol @returns {number} silinen dosya */
function klasoruGuvenliSil(yol) {
  let sayi = 0;
  let s;
  try { s = lstatSync(yol); } catch { return 0; }
  if (!s.isDirectory()) { dosyayiEzipSil(yol); return 1; }
  for (const ad of readdirSync(yol)) sayi += klasoruGuvenliSil(join(yol, ad));
  rmdirSync(yol);
  return sayi;
}

/**
 * Çalışma alanını BU BİLGİSAYARDAN kaldırır: veritabanı, şifreli medya ve yedek klasörü (en iyi çabayla ezilerek)
 * silinir, kayıt defterinden çıkarılır. Onay: görünen ad birebir yazılmalı. Açık çalışma alanı kaldırılamaz
 * (çağıran denetler). Yerinde kaydedilmiş ilk alanda YALNIZCA platform.db, medya/ ve yedekler/ silinir (veri
 * kökündeki diğer dosyalara dokunulmaz); yeni alanlarda kendi klasörü tümüyle silinir.
 * @param {string} kok @param {string} id @param {unknown} onayAdi
 */
export function alanKaldir(kok, id, onayAdi) {
  const { defter } = kayitDefteriniHazirla(kok);
  const alan = alanAl(defter, id);
  if (typeof onayAdi !== 'string' || onayAdi.trim() !== alan.ad) {
    throw new CalismaAlaniHatasi('ONAY', 'Onay için çalışma alanının adını birebir yazın.');
  }
  const yollar = alanYollari(kok, alan);
  let silinenDosya = 0;
  const kendiKlasoru = icYol(kok, `${CALISMA_ALANLARI_KLASORU}/${alan.id}`);
  const ayriKlasorde = kendiKlasoru !== null && resolve(yollar.veritabani).startsWith(`${kendiKlasoru}${sep}`);
  if (ayriKlasorde && kendiKlasoru) {
    silinenDosya += klasoruGuvenliSil(kendiKlasoru);
  } else {
    for (const y of [yollar.veritabani, yollar.medya, yollar.yedekler]) silinenDosya += klasoruGuvenliSil(y);
  }
  defter.alanlar = defter.alanlar.filter((a) => a.id !== id);
  if (defter.sonAcilan === id) defter.sonAcilan = null;
  kayitDefteriniYaz(kok, defter);
  return { silinenDosya };
}

/**
 * Kimlik ya da ada (büyük/küçük harf duyarsız) göre bulur.
 * @param {KayitDefteri} defter @param {string} secim
 */
export function alanBul(defter, secim) {
  const s = secim.trim();
  return defter.alanlar.find((a) => a.id === s) ?? defter.alanlar.find((a) => a.ad.toLocaleLowerCase('tr') === s.toLocaleLowerCase('tr'));
}

/**
 * Terminal/alt süreçlerin çalışma alanı: NOBETCI_CALISMA_ALANI (kimlik ya da ad) → son açılan → tek alan.
 * Kayıt defteri yoksa null (çağıran eski <kök>/platform.db yoluna düşer). Kayıt defterini DEĞİŞTİRMEZ.
 * Değişken verilmiş ama bulunamazsa CalismaAlaniHatasi (mevcut adlar listelenir; gizli bilgi yok).
 * @param {string} kok
 * @returns {{ alan: CalismaAlani; yollar: { veritabani: string; medya: string; yedekler: string }; kaynak: 'degisken' | 'son-acilan' | 'tek' } | null}
 */
export function calismaAlaniniCoz(kok) {
  const defter = kayitDefteriniOku(kok);
  if (!defter) return null;
  const secim = process.env[CALISMA_ALANI_DEGISKENI];
  if (secim && secim.trim()) {
    const alan = alanBul(defter, secim);
    if (!alan) {
      const adlar = defter.alanlar.map((a) => `"${a.ad}"`).join(', ') || '(kayıtlı çalışma alanı yok)';
      throw new CalismaAlaniHatasi('BULUNAMADI', `${CALISMA_ALANI_DEGISKENI}="${secim.trim()}" bulunamadı. Kayıtlı çalışma alanları: ${adlar}.`);
    }
    return { alan, yollar: alanYollari(kok, alan), kaynak: 'degisken' };
  }
  const son = defter.sonAcilan ? defter.alanlar.find((a) => a.id === defter.sonAcilan) : undefined;
  if (son) return { alan: son, yollar: alanYollari(kok, son), kaynak: 'son-acilan' };
  // Kapatılmış (son açılan yok): en son açılmış olan; hiç açılmamışsa ilk kayıt.
  const sirali = [...defter.alanlar].sort((a, b) => String(b.sonAcilma ?? '').localeCompare(String(a.sonAcilma ?? '')));
  const alan = sirali[0];
  return alan ? { alan, yollar: alanYollari(kok, alan), kaynak: defter.alanlar.length === 1 ? 'tek' : 'son-acilan' } : null;
}
