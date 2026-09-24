// ŞİFRELİ MEDYA DEPOSU (genel) — koşu ekran görüntüleri, videoları ve izleri (trace) diskte
// YALNIZCA şifreli durur: <veritabanı klasörü>/medya/ (varsayılan veri/medya/, Git'e girmez).
//
// Tasarım:
// - Anahtar: kasadaki "medya ana anahtarı" (rastgele 32 bayt, kasa anahtarıyla sarılı; bkz.
//   kasa.mjs > medyaAnahtariniHazirla). Her dosyaya rastgele 16 baytlık tuz; dosya anahtarı =
//   HKDF-SHA256(ana anahtar, tuz, "platform-medya:v1:dosya").
// - Biçim (v1): başlık 32 bayt = "TAMEDYA" (7) + sürüm (1) + tuz (16) + IV öneki (8); ardından
//   64 KiB'lık düz metin PARÇALARI, her biri AES-256-GCM ile ayrı şifrelenir:
//   [şifreli parça][16 bayt etiket]. Parça IV'si = IV öneki (8) + parça sırası (4, big-endian).
//   AAD = başlık + parça sırası + "son parça mı" baytı → parçalar yer değiştiremez, dosya
//   kesilemez (son parça işareti doğrulanır). Parçalı yapı sayesinde videolar belleğe
//   sığmak zorunda değildir (akışla şifrelenir/çözülür) ve HTTP Range isteği yalnızca ilgili
//   parçaları çözer.
// - Dosya adları rastgeledir (<32 hex>.medya); içerik türü/ad/boyut veritabanındaki medya
//   satırındadır. Yazma: geçici dosya + fsync + rename. Düz metin HİÇBİR ZAMAN diske yazılmaz.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirerek yükler).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */

export const MEDYA_SIHIRLI = Buffer.from('TAMEDYA', 'ascii');
export const MEDYA_SURUMU = 1;
export const PARCA_BOYUTU = 64 * 1024;
const ETIKET = 16;
const BASLIK = MEDYA_SIHIRLI.length + 1 + 16 + 8;
const HKDF_BILGISI = Buffer.from('platform-medya:v1:dosya', 'utf8');
export const MEDYA_DOSYA_DESENI = /^[a-f0-9]{32}\.medya$/;
/** Yedekten içe aktarmanın medya hazırlık klasörü (medya klasörünün içinde, bkz. yedek.mjs). */
export const HAZIRLIK_KLASORU_DESENI = /^\.hazirlik-[a-f0-9]{16}$/;
const GUN_MS = 24 * 60 * 60 * 1000;

export class MedyaHatasi extends Error {
  /** @param {'BICIM' | 'BOZUK' | 'YOK' | 'ARALIK'} kod @param {string} mesaj */
  constructor(kod, mesaj) {
    super(mesaj);
    this.name = 'MedyaHatasi';
    this.kod = kod;
  }
}

/** Veritabanı dosyasının yanındaki medya klasörü. @param {string} veritabaniYolu */
export function medyaKlasoru(veritabaniYolu) {
  return join(dirname(veritabaniYolu), 'medya');
}

/** @param {Buffer} anaAnahtar @param {Buffer} tuz */
function dosyaAnahtari(anaAnahtar, tuz) {
  return Buffer.from(hkdfSync('sha256', anaAnahtar, tuz, HKDF_BILGISI, 32));
}

/** @param {Buffer} onEk @param {number} sira */
function parcaIv(onEk, sira) {
  const iv = Buffer.alloc(12);
  onEk.copy(iv, 0);
  iv.writeUInt32BE(sira, 8);
  return iv;
}

/** @param {Buffer} baslik @param {number} sira @param {boolean} son */
function parcaAad(baslik, sira, son) {
  const aad = Buffer.alloc(BASLIK + 5);
  baslik.copy(aad, 0);
  aad.writeUInt32BE(sira, BASLIK);
  aad[BASLIK + 4] = son ? 1 : 0;
  return aad;
}

/** Güvenli medya dosya adı mı? (yol ayırıcı/.. içeremez) @param {unknown} ad */
export function medyaDosyaAdiGecerliMi(ad) {
  return typeof ad === 'string' && MEDYA_DOSYA_DESENI.test(ad);
}

/** @param {Buffer | string | AsyncIterable<Buffer>} kaynak @returns {AsyncIterable<Buffer>} */
async function* kaynakParcalari(kaynak) {
  if (Buffer.isBuffer(kaynak)) {
    for (let i = 0; i < kaynak.length; i += PARCA_BOYUTU) yield kaynak.subarray(i, i + PARCA_BOYUTU);
    return;
  }
  if (typeof kaynak !== 'string') {
    // Akış (ör. yedekten içe aktarmada başka anahtarla çözülen medya): bellekte yalnızca parça tutulur.
    for await (const parca of kaynak) yield parca;
    return;
  }
  for await (const parca of createReadStream(kaynak, { highWaterMark: PARCA_BOYUTU })) yield /** @type {Buffer} */ (parca);
}

/**
 * Kaynağı (dosya yolu ya da bellekteki Buffer) şifreleyip medya klasörüne yeni, rastgele adlı bir
 * dosya olarak yazar. Kaynak dosyaya DOKUNMAZ (silmek çağıranın işidir).
 * @param {Buffer} anaAnahtar medya ana anahtarı (32 bayt)
 * @param {string} klasor medya klasörü
 * @param {Buffer | string | AsyncIterable<Buffer>} kaynak dosya yolu, Buffer ya da düz metin parça akışı
 * @returns {Promise<{ dosya: string; boyut: number }>} dosya: klasöre göre ad; boyut: düz metin bayt
 */
export async function medyaSifrele(anaAnahtar, klasor, kaynak) {
  await mkdir(klasor, { recursive: true });
  const dosya = `${randomBytes(16).toString('hex')}.medya`;
  const hedef = join(klasor, dosya);
  const gecici = `${hedef}.${process.pid}.gecici`;
  const tuz = randomBytes(16);
  const onEk = randomBytes(8);
  const baslik = Buffer.concat([MEDYA_SIHIRLI, Buffer.from([MEDYA_SURUMU]), tuz, onEk]);
  const anahtar = dosyaAnahtari(anaAnahtar, tuz);
  const fh = await open(gecici, 'wx', 0o600);
  let boyut = 0;
  let sira = 0;
  try {
    await fh.write(baslik);
    /** @param {Buffer} parca @param {boolean} son */
    const parcaYaz = async (parca, son) => {
      const sifreleyici = createCipheriv('aes-256-gcm', anahtar, parcaIv(onEk, sira));
      sifreleyici.setAAD(parcaAad(baslik, sira, son));
      const sifreli = Buffer.concat([sifreleyici.update(parca), sifreleyici.final(), sifreleyici.getAuthTag()]);
      await fh.write(sifreli);
      sira++;
    };
    /** @type {Buffer[]} */
    let bekleyen = [];
    let bekleyenBoyut = 0;
    for await (const veri of kaynakParcalari(kaynak)) {
      boyut += veri.length;
      bekleyen.push(veri);
      bekleyenBoyut += veri.length;
      // Son parça her zaman AYRI yazılır (işaretli): kalan > PARÇA iken tam parçalar boşaltılır.
      while (bekleyenBoyut > PARCA_BOYUTU) {
        const birlesik = Buffer.concat(bekleyen);
        await parcaYaz(birlesik.subarray(0, PARCA_BOYUTU), false);
        const kalan = birlesik.subarray(PARCA_BOYUTU);
        bekleyen = [kalan];
        bekleyenBoyut = kalan.length;
      }
    }
    await parcaYaz(Buffer.concat(bekleyen), true);
    await fh.sync();
    await fh.close();
  } catch (hata) {
    await fh.close().catch(() => {});
    await unlink(gecici).catch(() => {});
    throw hata;
  } finally {
    anahtar.fill(0);
  }
  await rename(gecici, hedef);
  return { dosya, boyut };
}

/**
 * Şifreli dosyanın düz metin boyutu (başlığı doğrular; anahtar gerekmez).
 * @param {string} yol
 */
export async function medyaBoyutu(yol) {
  const fh = await open(yol, 'r');
  try {
    const { size } = await fh.stat();
    const baslik = Buffer.alloc(BASLIK);
    await fh.read(baslik, 0, BASLIK, 0);
    return duzBoyutHesapla(baslik, size);
  } finally {
    await fh.close();
  }
}

/** @param {Buffer} baslik @param {number} dosyaBoyutu */
function duzBoyutHesapla(baslik, dosyaBoyutu) {
  if (!baslik.subarray(0, MEDYA_SIHIRLI.length).equals(MEDYA_SIHIRLI)) throw new MedyaHatasi('BICIM', 'Dosya bir şifreli medya dosyası değil.');
  if (baslik[MEDYA_SIHIRLI.length] !== MEDYA_SURUMU) throw new MedyaHatasi('BICIM', 'Desteklenmeyen medya sürümü.');
  const govde = dosyaBoyutu - BASLIK;
  if (govde < ETIKET) throw new MedyaHatasi('BOZUK', 'Şifreli medya dosyası eksik.');
  const parcaSayisi = Math.ceil(govde / (PARCA_BOYUTU + ETIKET));
  const sonSifreli = govde - (parcaSayisi - 1) * (PARCA_BOYUTU + ETIKET);
  if (sonSifreli < ETIKET) throw new MedyaHatasi('BOZUK', 'Şifreli medya dosyası bozuk.');
  return { duzBoyut: (parcaSayisi - 1) * PARCA_BOYUTU + (sonSifreli - ETIKET), parcaSayisi };
}

/**
 * Şifreli dosyayı çözerek düz metni PARÇA PARÇA verir (bellekte; diske yazılmaz). Aralık
 * verilirse (Range) yalnızca ilgili parçalar okunup çözülür. Doğrulanamayan parça → MedyaHatasi.
 * @param {Buffer} anaAnahtar
 * @param {string} yol
 * @param {{ baslangic?: number; bitis?: number }} [aralik] bitis dahil
 * @returns {AsyncGenerator<Buffer>}
 */
export async function* medyaCoz(anaAnahtar, yol, aralik = {}) {
  const fh = await open(yol, 'r');
  let anahtar = null;
  try {
    const { size } = await fh.stat();
    const baslik = Buffer.alloc(BASLIK);
    await fh.read(baslik, 0, BASLIK, 0);
    const { duzBoyut, parcaSayisi } = duzBoyutHesapla(baslik, size);
    const baslangic = aralik.baslangic ?? 0;
    const bitis = aralik.bitis ?? duzBoyut - 1;
    if (duzBoyut === 0 && baslangic === 0 && bitis < 0) {
      // Boş dosya: son parçanın etiketi yine de doğrulanır.
    } else if (baslangic < 0 || bitis >= duzBoyut || baslangic > bitis) {
      throw new MedyaHatasi('ARALIK', 'İstenen bayt aralığı dosya boyutunun dışında.');
    }
    const tuz = baslik.subarray(MEDYA_SIHIRLI.length + 1, MEDYA_SIHIRLI.length + 17);
    const onEk = baslik.subarray(MEDYA_SIHIRLI.length + 17, BASLIK);
    anahtar = dosyaAnahtari(anaAnahtar, tuz);
    const ilk = duzBoyut === 0 ? 0 : Math.floor(baslangic / PARCA_BOYUTU);
    const son = duzBoyut === 0 ? 0 : Math.floor(bitis / PARCA_BOYUTU);
    for (let sira = ilk; sira <= son; sira++) {
      const sonParcaMi = sira === parcaSayisi - 1;
      const konum = BASLIK + sira * (PARCA_BOYUTU + ETIKET);
      const uzunluk = sonParcaMi ? size - konum : PARCA_BOYUTU + ETIKET;
      const sifreli = Buffer.alloc(uzunluk);
      const { bytesRead } = await fh.read(sifreli, 0, uzunluk, konum);
      if (bytesRead !== uzunluk) throw new MedyaHatasi('BOZUK', 'Şifreli medya dosyası okunamadı.');
      const cozucu = createDecipheriv('aes-256-gcm', anahtar, parcaIv(onEk, sira));
      cozucu.setAAD(parcaAad(baslik, sira, sonParcaMi));
      cozucu.setAuthTag(sifreli.subarray(uzunluk - ETIKET));
      let duz;
      try {
        duz = Buffer.concat([cozucu.update(sifreli.subarray(0, uzunluk - ETIKET)), cozucu.final()]);
      } catch {
        throw new MedyaHatasi('BOZUK', 'Medya dosyası doğrulanamadı (anahtar yanlış ya da dosya bozuk).');
      }
      if (duzBoyut === 0) return;
      const parcaBasi = sira * PARCA_BOYUTU;
      yield duz.subarray(Math.max(0, baslangic - parcaBasi), Math.min(duz.length, bitis - parcaBasi + 1));
    }
  } finally {
    if (anahtar) anahtar.fill(0);
    await fh.close();
  }
}

/** Şifreli dosyanın TAMAMINI çözüp tek Buffer döner (küçük dosyalar ve testler için). @param {Buffer} anaAnahtar @param {string} yol */
export async function medyaTamamenCoz(anaAnahtar, yol) {
  /** @type {Buffer[]} */
  const parcalar = [];
  for await (const p of medyaCoz(anaAnahtar, yol)) parcalar.push(p);
  return Buffer.concat(parcalar);
}

/** @param {string} klasor @param {string} dosya */
export function medyaDosyasiniSil(klasor, dosya) {
  if (!medyaDosyaAdiGecerliMi(dosya)) return false;
  try {
    unlinkSync(join(klasor, dosya));
    return true;
  } catch {
    return false;
  }
}

/**
 * SAKLAMA TEMİZLİĞİ: videoGun günden eski VİDEOLARIN şifreli dosyaları silinir (medya satırı
 * "silinme" zamanıyla kalır — arayüz "saklama süresi doldu" der). Ekran görüntüleri, izler ve
 * sonuçlar SİLİNMEZ. Ayrıca veritabanında karşılığı olmayan, 1 günden eski medya dosyaları ve
 * yarım kalmış geçici dosyalar (ör. çöken bir yazma) temizlenir. Yalnızca medya klasöründeki,
 * bu deponun adlandırma desenine uyan dosyalara dokunulur.
 * @param {Veritabani} vt
 * @param {string} klasor
 * @param {{ videoGun: number; simdi?: number }} secenekler
 */
export function medyaSaklamaTemizligi(vt, klasor, secenekler) {
  const simdi = secenekler.simdi ?? Date.now();
  const esik = new Date(simdi - secenekler.videoGun * GUN_MS).toISOString();
  const eskiVideolar = vt.tumu(
    "SELECT id, dosya FROM medya WHERE tur = 'video' AND silinme IS NULL AND olusturulma < ?", [esik]
  );
  let silinenVideo = 0;
  if (eskiVideolar.length) {
    const zaman = new Date(simdi).toISOString();
    vt.islem(() => {
      for (const v of eskiVideolar) {
        medyaDosyasiniSil(klasor, String(v.dosya));
        vt.calistir('UPDATE medya SET silinme = ? WHERE id = ?', [zaman, v.id]);
        silinenVideo++;
      }
    });
  }
  let silinenSahipsiz = 0;
  if (existsSync(klasor)) {
    const bilinen = new Set(vt.tumu('SELECT dosya FROM medya WHERE silinme IS NULL').map((s) => String(s.dosya)));
    for (const ad of readdirSync(klasor)) {
      // Yarım kalmış içe aktarma hazırlık klasörleri (yalnızca şifreli dosyalar içerir; bkz. yedek.mjs).
      if (HAZIRLIK_KLASORU_DESENI.test(ad)) {
        try {
          if (simdi - statSync(join(klasor, ad)).mtimeMs >= GUN_MS) rmSync(join(klasor, ad), { recursive: true, force: true });
        } catch { /* yok sayılır */ }
        continue;
      }
      const geciciMi = /^[a-f0-9]{32}\.medya\.\d+\.gecici$/.test(ad);
      if (!geciciMi && (!MEDYA_DOSYA_DESENI.test(ad) || bilinen.has(ad))) continue;
      try {
        if (simdi - statSync(join(klasor, ad)).mtimeMs < GUN_MS) continue;
        unlinkSync(join(klasor, ad));
        silinenSahipsiz++;
      } catch { /* yok sayılır */ }
    }
  }
  return { silinenVideo, silinenSahipsiz };
}
