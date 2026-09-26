// AÇIK (DÜZ METİN) DOSYALARI ŞİFRELİ DEPOYA TAŞIMA (genel) — eski proje düzeninde senaryoların kullandığı dosyalar
// (ör. tests/fixtures/**, yüklenecek Excel dosyaları) diskte düz metin durur. Hangi dosyaların bu türden
// olduğunu PROJE ADAPTÖRÜ bilir (adaptor.dosyaKaynaklari(kok)); bu modül genel işi yapar:
//   1) acikDosyalariBul   — adaptörün bildiği dosyalar (proje kökü + eski dosya yedekleri), boyut ve şifreli
//                           kopyanın olup olmadığıyla (ÖNİZLEME; hiçbir şey değişmez)
//   2) acikDosyalariAktar — dosyaları şifreli depoya alır (aynı göreli yol ikinci kez alınmaz) ve senaryo verisi +
//                           ekran ayarlarındaki eski yol değerlerini dosya referanslarına çevirir (aktarım bunu
//                           kullanır; düz metin dosyalar SİLİNMEZ)
//   3) acikDosyalariTasi  — 2) + her dosyanın şifreli kopyası çözülüp içerik özeti düz metinle karşılaştırılır;
//                           AYNIYSA düz metin dosya ezilip silinir (en iyi çaba: SSD/APFS kopya-yazma nedeniyle eski
//                           bloklar fiziksel olarak kalabilir). Kullanıcı Ayarlar > Güvenlik'ten bir kez başlatır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: acik-dosyalar.d.mts.
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { DOSYA_BOYUT_SINIRI, dosyaReferansi, kaynaktanDosyaBul, senaryoDosyasiEkle, yollariReferansaCevir } from './senaryo-dosyalari.mjs';
import { medyaAnahtariniHazirla } from '../kasa.mjs';
import { medyaTamamenCoz } from '../medya.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ kimlik: string; konum: string; kok: string; goreliYol: string; yol: string; boyut: number; sifreliKopyaVar: boolean }} AcikDosya */

/** @param {Buffer} b */
const ozet = (b) => createHash('sha256').update(b).digest('hex');

/**
 * Adaptörün bildiği düz metin dosyalar. kokler: taranacak klasörler (ör. proje kökü "proje", eski dosya yedekleri
 * "eski-dosyalar/<zaman>"). Aynı dosya iki kez listelenmez; sembolik bağlar ve sınırı aşan dosyalar atlanır.
 * @param {Veritabani | null} vt
 * @param {{ dosyaKaynaklari?: (kok: string) => Array<{ goreliYol: string; yol: string }> } | null} adaptor
 * @param {Array<{ kok: string; konum: string }>} kokler
 * @returns {AcikDosya[]}
 */
export function acikDosyalariBul(vt, adaptor, kokler) {
  if (!adaptor?.dosyaKaynaklari) return [];
  /** @type {AcikDosya[]} */
  const liste = [];
  const gorulen = new Set();
  for (const k of kokler) {
    for (const d of adaptor.dosyaKaynaklari(k.kok)) {
      const yol = resolve(d.yol);
      const g = relative(resolve(k.kok), yol);
      if (!g || g.startsWith('..') || isAbsolute(g) || gorulen.has(yol)) continue;
      let bilgi;
      try { bilgi = lstatSync(yol); } catch { continue; }
      if (!bilgi.isFile() || bilgi.size === 0 || bilgi.size > DOSYA_BOYUT_SINIRI) continue;
      gorulen.add(yol);
      const goreliYol = d.goreliYol.replace(/\\/g, '/');
      liste.push({
        kimlik: createHash('sha256').update(yol).digest('hex').slice(0, 24), konum: k.konum, kok: resolve(k.kok), goreliYol, yol, boyut: bilgi.size,
        sifreliKopyaVar: Boolean(vt && kaynaktanDosyaBul(vt, goreliYol))
      });
    }
  }
  return liste;
}

/**
 * Dosyaları şifreli depoya alır ve eski yol değerlerini referanslara çevirir (düz metinlere dokunmaz). Kasa açık olmalı.
 * @param {Veritabani} vt @param {string} projeId @param {AcikDosya[]} dosyalar
 * @param {{ medyaKlasoru: string; yapan?: string }} s
 */
export async function acikDosyalariAktar(vt, projeId, dosyalar, s) {
  /** @type {Map<string, string>} göreli yol → referans */
  const eslesme = new Map();
  let aktarilan = 0;
  let zatenVardi = 0;
  /** @type {Array<{ goreliYol: string; konum: string; neden: string }>} */
  const hatalar = [];
  for (const d of dosyalar) {
    if (eslesme.has(d.goreliYol)) continue;
    const mevcut = kaynaktanDosyaBul(vt, d.goreliYol);
    if (mevcut) {
      eslesme.set(d.goreliYol, dosyaReferansi(mevcut.id, mevcut.ad));
      zatenVardi++;
      continue;
    }
    let icerik = null;
    try {
      icerik = readFileSync(d.yol);
      const e = await senaryoDosyasiEkle(vt, { klasor: s.medyaKlasoru, icerik, ad: d.goreliYol.split('/').pop(), kabul: '.' + (d.goreliYol.split('.').pop() ?? ''), kaynak: d.goreliYol });
      eslesme.set(d.goreliYol, e.referans);
      aktarilan++;
    } catch (hata) {
      hatalar.push({ goreliYol: d.goreliYol, konum: d.konum, neden: /** @type {Error} */ (hata)?.message ?? String(hata) });
    } finally {
      icerik?.fill(0);
    }
  }
  // Eski kayıtlarda aynı dosya "./tests/..." ya da mutlak yol olarak da yazılmış olabilir: yalnızca göreli biçim eşlenir.
  const referans = yollariReferansaCevir(vt, projeId, eslesme, { yapan: s.yapan });
  return { aktarilan, zatenVardi, referans, eslesme, hatalar };
}

/**
 * Düz metin dosyayı (en iyi çabayla) rastgele baytlarla ezip siler.
 * @param {string} yol
 */
export function guvenliSil(yol) {
  const boyut = statSync(yol).size;
  const fd = openSync(yol, 'r+');
  try {
    const parca = 1024 * 1024;
    for (let konum = 0; konum < boyut; konum += parca) {
      const rastgele = randomBytes(Math.min(parca, boyut - konum));
      writeSync(fd, rastgele, 0, rastgele.length, konum);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  unlinkSync(yol);
}

/** Dosyanın klasöründen köke kadar boşalan klasörleri kaldırır (kök hariç). @param {string} yol @param {string} kok */
function bosKlasorleriKaldir(yol, kok) {
  let klasor = dirname(yol);
  const kokYol = resolve(kok);
  while (klasor.startsWith(kokYol + sep) && klasor !== kokYol) {
    try {
      if (readdirSync(klasor).length) break;
      rmdirSync(klasor);
    } catch { break; }
    klasor = dirname(klasor);
  }
}

/**
 * Seçilen düz metin dosyaları şifreli depoya TAŞIR: aktarır, şifreli kopyayı doğrular, sonra düz metni güvenli siler.
 * Doğrulanamayan (şifreli kopya farklı/okunamıyor) dosya SİLİNMEZ; atlananlar nedeniyle döner. Kasa açık olmalı.
 * @param {Veritabani} vt @param {string} projeId @param {AcikDosya[]} dosyalar
 * @param {{ medyaKlasoru: string; yapan?: string; bosKlasorKoku?: (d: AcikDosya) => string | null }} s
 */
export async function acikDosyalariTasi(vt, projeId, dosyalar, s) {
  const aktarim = await acikDosyalariAktar(vt, projeId, dosyalar, s);
  /** @type {Array<{ goreliYol: string; konum: string; neden: string }>} */
  const atlanan = [...aktarim.hatalar];
  let silinen = 0;
  const anahtar = medyaAnahtariniHazirla(vt);
  try {
    for (const d of dosyalar) {
      if (aktarim.hatalar.some((x) => x.goreliYol === d.goreliYol && x.konum === d.konum)) continue;
      const kayit = kaynaktanDosyaBul(vt, d.goreliYol);
      if (!kayit) { atlanan.push({ goreliYol: d.goreliYol, konum: d.konum, neden: 'şifreli kopya oluşturulamadı' }); continue; }
      let ayni = false;
      try {
        const duz = readFileSync(d.yol);
        const sifreli = await medyaTamamenCoz(anahtar, join(s.medyaKlasoru, kayit.dosya));
        ayni = duz.length === sifreli.length && ozet(duz) === ozet(sifreli);
        duz.fill(0);
        sifreli.fill(0);
      } catch {
        atlanan.push({ goreliYol: d.goreliYol, konum: d.konum, neden: 'şifreli kopya doğrulanamadı' });
        continue;
      }
      if (!ayni) { atlanan.push({ goreliYol: d.goreliYol, konum: d.konum, neden: 'içerik şifreli depodaki aynı yollu dosyadan farklı (silinmedi; kontrol edin)' }); continue; }
      try {
        guvenliSil(d.yol);
        silinen++;
        const kok = s.bosKlasorKoku ? s.bosKlasorKoku(d) : null;
        if (kok) bosKlasorleriKaldir(d.yol, kok);
      } catch (hata) {
        atlanan.push({ goreliYol: d.goreliYol, konum: d.konum, neden: `silinemedi (${/** @type {Error} */ (hata)?.message ?? hata})` });
      }
    }
  } finally {
    anahtar.fill(0);
  }
  return { aktarilan: aktarim.aktarilan, zatenVardi: aktarim.zatenVardi, referans: aktarim.referans, silinen, atlanan };
}
