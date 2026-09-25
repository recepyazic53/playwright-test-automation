// PROJE YÖNETİMİ (genel) — üst çubuktaki proje seçicinin ⋯ menüsü: varsayılan proje, proje silme (önce kuru çalıştırma).
// Bir çalışma alanında birden çok proje olabilir; tüm listeler/uçlar projeId ile kapsamlanır.
// Silme: projenin ortamları, profilleri, test verisi, ekranları (+ model sürümleri), senaryoları, kaynak eşlemeleri
// (FK CASCADE) ve KOŞULARI + sonuçları + şifreli medyası (koşular FK'de SET NULL olduğundan açıkça) silinir; şifreli
// medya dosyaları işlem bittikten sonra güvenle (ezilerek) silinir. Değişiklik geçmişi korunur. Yedeklere dokunulmaz
// (sunucu silmeden önce ayrıca yeni bir yedek alır).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirerek yükler).
import { ayarGetir, ayarYaz, DepoHatasi, ekranAyarlariniGetir, gecmisYaz, projeGetir } from './veritabani/depo.mjs';
import { medyaDosyasiniGuvenliSil } from './medya.mjs';
import { referanslariBul } from './dosyalar/senaryo-dosyalari.mjs';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */

const PROJE_AYAR_ANAHTARI = 'projeler';
/** @param {unknown[]} l */
const yer = (l) => l.map(() => '?').join(', ');

/**
 * Varsayılan proje (Ayarlar tablosunda, şifreli): proje seçimi hatırlanmadığında açılan proje. Yoksa / silinmişse null.
 * Kasa açık olmalıdır.
 * @param {Veritabani} vt
 */
export function varsayilanProjeKimligi(vt) {
  const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, PROJE_AYAR_ANAHTARI));
  const id = typeof ayar?.varsayilanId === 'string' ? ayar.varsayilanId : null;
  return id && projeGetir(vt, id) ? id : null;
}

/** @param {Veritabani} vt @param {string} id */
export function varsayilanProjeAyarla(vt, id) {
  if (!projeGetir(vt, id)) throw new DepoHatasi('Proje bulunamadı.');
  const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, PROJE_AYAR_ANAHTARI));
  ayarYaz(vt, PROJE_AYAR_ANAHTARI, { ...(ayar ?? {}), varsayilanId: id });
  return id;
}

/**
 * Projeye ait kayıtlar (silme önizlemesi ve silme aynı hesabı kullanır). Kasa açık olmalıdır (ekran ayarları şifreli).
 * @param {Veritabani} vt @param {string} projeId
 */
function projeKayitlari(vt, projeId) {
  const say = (/** @type {string} */ sql, /** @type {unknown[]} */ p = [projeId]) => Number(vt.tek(sql, p)?.n ?? 0);
  const ekranIdleri = vt.tumu('SELECT id FROM ekranlar WHERE proje_id = ?', [projeId]).map((x) => String(x.id));
  const senaryoIdleri = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ?', [projeId]).map((x) => String(x.id));
  const kosuIdleri = vt.tumu('SELECT id FROM kosular WHERE proje_id = ?', [projeId]).map((x) => String(x.id));
  /** @type {Map<string, string>} medya kimliği → dosya */
  const medya = new Map();
  let sonuc = 0;
  for (let i = 0; i < kosuIdleri.length; i += 500) {
    const parca = kosuIdleri.slice(i, i + 500);
    sonuc += Number(vt.tek(`SELECT COUNT(*) AS n FROM kosu_sonuclari WHERE kosu_id IN (${yer(parca)})`, parca)?.n ?? 0);
    for (const m of vt.tumu(`SELECT m.id, m.dosya FROM medya m JOIN kosu_sonuclari r ON r.id = m.sonuc_id WHERE r.kosu_id IN (${yer(parca)})`, parca)) {
      medya.set(String(m.id), String(m.dosya));
    }
  }
  const sahipli = (/** @type {string} */ tur, /** @type {string[]} */ idler) => {
    for (let i = 0; i < idler.length; i += 500) {
      const parca = idler.slice(i, i + 500);
      for (const m of vt.tumu(`SELECT id, dosya FROM medya WHERE sahip_turu = ? AND sahip_id IN (${yer(parca)})`, [tur, ...parca])) medya.set(String(m.id), String(m.dosya));
    }
  };
  sahipli('ekran', ekranIdleri);
  sahipli('senaryo', senaryoIdleri);
  // Ekran ayarlarındaki kanıt görüntüleri ve dosya referansları (başka projede kullanılmıyorsa).
  /** @type {Set<string>} */
  const referanslar = new Set();
  for (const id of ekranIdleri) {
    const ayarlar = /** @type {Record<string, unknown>} */ (ekranAyarlariniGetir(vt, id) ?? {});
    const analiz = ayarlar.analiz && typeof ayarlar.analiz === 'object' ? /** @type {Record<string, unknown>} */ (ayarlar.analiz) : {};
    for (const k of Array.isArray(analiz.kanitlar) ? analiz.kanitlar : []) {
      if (k && typeof k === 'object' && typeof k.medyaId === 'string') referanslar.add(k.medyaId);
    }
    for (const r of referanslariBul(ayarlar)) referanslar.add(r.id);
  }
  for (const id of referanslar) {
    const m = vt.tek('SELECT id, dosya, sonuc_id, sahip_turu, sahip_id FROM medya WHERE id = ?', [id]);
    if (m && m.sonuc_id == null && (m.sahip_id == null || ekranIdleri.includes(String(m.sahip_id)) || senaryoIdleri.includes(String(m.sahip_id)))) {
      medya.set(String(m.id), String(m.dosya));
    }
  }
  return {
    ekranIdleri, senaryoIdleri, kosuIdleri, medya,
    sayilar: {
      ortam: say('SELECT COUNT(*) AS n FROM ortamlar WHERE proje_id = ?'),
      ekran: say("SELECT COUNT(*) AS n FROM ekranlar WHERE proje_id = ? AND durum <> 'silindi'"),
      senaryo: senaryoIdleri.length,
      girisProfili: say('SELECT COUNT(*) AS n FROM giris_profilleri WHERE proje_id = ?'),
      baglamProfili: say('SELECT COUNT(*) AS n FROM baglam_profilleri WHERE proje_id = ?'),
      testVerisi: say('SELECT COUNT(*) AS n FROM test_verisi_profilleri WHERE proje_id = ?') + say('SELECT COUNT(*) AS n FROM test_verisi_turleri WHERE proje_id = ?'),
      kosu: kosuIdleri.length,
      sonuc,
      medya: medya.size
    }
  };
}

/**
 * KURU ÇALIŞTIRMA: silinecek kayıt sayıları (hiçbir şey değişmez).
 * @param {Veritabani} vt @param {string} projeId
 */
export function projeSilmeOnizlemesi(vt, projeId) {
  const proje = projeGetir(vt, projeId);
  if (!proje) throw new DepoHatasi('Proje bulunamadı.');
  const k = projeKayitlari(vt, projeId);
  const toplamProje = Number(vt.tek('SELECT COUNT(*) AS n FROM projeler')?.n ?? 0);
  return { proje: { id: proje.id, ad: proje.ad }, sayilar: k.sayilar, sonProje: toplamProje <= 1 };
}

/**
 * Projeyi KALICI siler (onay denetimi çağırandadır). Şifreli medya dosyaları işlemden sonra güvenle silinir.
 * @param {Veritabani} vt @param {string} projeId @param {{ medyaKlasoru: string; yapan?: string }} secenekler
 */
export function projeyiSil(vt, projeId, secenekler) {
  const proje = projeGetir(vt, projeId);
  if (!proje) throw new DepoHatasi('Proje bulunamadı.');
  const k = projeKayitlari(vt, projeId);
  vt.islem(() => {
    const medyaIdleri = [...k.medya.keys()];
    for (let i = 0; i < medyaIdleri.length; i += 500) {
      const parca = medyaIdleri.slice(i, i + 500);
      vt.calistir(`DELETE FROM medya WHERE id IN (${yer(parca)})`, parca);
    }
    // Koşular (FK: SET NULL) açıkça silinir → sonuçlar, adımlar ve sonuç medyası CASCADE.
    vt.calistir('DELETE FROM kosular WHERE proje_id = ?', [projeId]);
    // Proje → ortamlar, profiller, test verisi, ekranlar (+ modeller), senaryolar, kaynak eşlemeleri (CASCADE).
    vt.calistir('DELETE FROM projeler WHERE id = ?', [projeId]);
    const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, PROJE_AYAR_ANAHTARI));
    if (ayar?.varsayilanId === projeId) ayarYaz(vt, PROJE_AYAR_ANAHTARI, { ...ayar, varsayilanId: null });
    gecmisYaz(vt, {
      varlikTuru: 'proje', varlikId: projeId, islem: 'sil', yapan: secenekler.yapan,
      onceki: { id: proje.id, ad: proje.ad }, aciklama: `Proje silindi: ${k.sayilar.senaryo} senaryo, ${k.sayilar.ekran} ekran, ${k.sayilar.kosu} koşu, ${k.sayilar.medya} medya`
    });
  });
  let medyaDosyasi = 0;
  for (const dosya of k.medya.values()) if (medyaDosyasiniGuvenliSil(secenekler.medyaKlasoru, dosya)) medyaDosyasi++;
  return { silinen: { ...k.sayilar, medyaDosyasi } };
}
