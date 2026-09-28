// YEDEK İÇE AKTARMA — HEDEF PROJE VE ORTAM EŞLEMESİ (bkz. ice-aktarma.mjs).
//
// Yedekteki her proje için kullanıcı hedefi seçer:
//   'yeni'            — yedekteki adıyla yeni proje (yerelde aynı kimlik yoksa bugünkü davranış; varsa yeni kimlik üretilir)
//   <yerel proje id>  — mevcut projeye aktar: projenin tüm kayıtları (proje_id taşıyan her tablo + ekran modelleri) hedef
//                       projeye yazılır; yedekteki proje kaydı eklenmez.
// Mevcut projeye aktarılırken yedekteki projenin her ortamı hedef projede bir ortama eşlenir ya da 'yeni' (yeni ortam) olur.
// Eşlenen ortam kaydı eklenmez (yereldeki ortamın adresi / ayarları / giriş tarifi korunur); o ortamın kimliğine başvuran
// HER YER yerel ortamın kimliğiyle yazılır.
//
// KİMLİK YENİDEN EŞLEME (genel): eski kimlik → yeni kimlik haritası kurulur ve yedekteki TÜM satırların TÜM metin sütunlarına
// uygulanır — yabancı anahtar sütunları (proje_id, ortam_id, ekran_id …), JSON içindeki değerler ve nesne anahtarları
// (ör. servis ayarlarındaki tabanlar[ortamId], ekran ayarlarındaki ortamlar[ortamId], senaryo ortam seçimleri, Ayarlar'daki
// zamanlanmış kurallar / SQL veritabanı eşlemeleri / entegrasyonlar) ve şifreli değerlerin içi (zarf çözülür, eşlenir, yerel
// anahtarla yeniden şifrelenir). UUID biçimli kimlikler metin içinde her yerde; diğer kimlikler yalnız sütun değerinin tamamı ya
// da JSON içinde tırnaklı tam değer olarak eşlenir.
//
// ÇAKIŞMA KURALLARI (hedef proje içinde, tablo sırasıyla — üst kayıtlar önce):
//   1) Aynı kimlik hedef projede var → aynı kayıt (önizlemede "değişen"/"aynı"; kullanıcı seçer).
//   2) Hedef projede aynı ADLI kayıt tek ise (ör. aynı anahtarlı servis/ekran, aynı adlı tablo) → o kayda eşlenir (değişen/aynı).
//   3) Aynı kimlik yerelde BAŞKA projede var → kararlı yeni kimlik üretilir (hedef proje + tablo + eski kimlikten; aynı yedek
//      yeniden aktarılınca aynı kimlik çıkar) ve ona başvuran her yer eşlenir.
//   4) Hiçbiri değilse kimlik korunur (yeni kayıt).
// Eşleme verilmezse (null) hiçbir şey değişmez: bugünkü davranış.
// Bu modül import.meta KULLANMAZ (birim testleri CommonJS'e çevirerek yükler).

import { createHash } from 'node:crypto';
import { TABLOLAR } from './veritabani/gocler.mjs';
import { zarfCoz, zarfSifrele } from './kasa.mjs';
import { YedekHatasi } from './yedek.mjs';
import { riskliSecimi } from './guvenlik/ortam-riski.mjs';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Satir */
/** @typedef {{ hedef: string; ortamlar?: Record<string, string> }} ProjeEslemesi  hedef: 'yeni' | yerel proje kimliği; ortamlar: kaynak ortam → 'yeni' | yerel ortam */
/** @typedef {{ projeler: Record<string, ProjeEslemesi> }} Esleme */
/** @typedef {{ id: string; ad: string; tur: 'test' | 'canli' | null }} OrtamOzeti */

export const YENI = 'yeni';

/**
 * proje_id taşıyan kayıt tabloları (TABLOLAR sırasıyla) ve hedef projede "aynı kayıt" sayılacak doğal anahtar sütunları.
 * ekran_modelleri projesini ekranından alır. Yeni bir proje tablosu eklenirse burada da tanımlanmalıdır (aşağıdaki denetim).
 * @type {Readonly<Record<string, readonly string[] | null>>}
 */
export const PROJE_TABLOLARI = Object.freeze({
  ortamlar: null, // kullanıcı eşler
  giris_profilleri: ['ad', 'ortam_id'],
  baglam_profilleri: ['tur', 'ad', 'ortam_id'],
  test_verisi_turleri: ['ad'],
  test_verisi_profilleri: ['tur_id', 'ad', 'ortam_id'],
  ekranlar: ['anahtar'],
  ekran_modelleri: ['ekran_id', 'surum'],
  senaryolar: ['ekran_id', 'baslik'],
  servisler: ['anahtar'],
  servis_senaryolari: ['servis_id', 'baslik'],
  servis_kimlikleri: ['ad', 'ortam_id'],
  servis_parametre_tanimlari: ['ad'],
  servis_akislari: ['tur', 'baslik']
});
/** Proje kaydı olmayan (genel) ve geçmiş/koşu tabloları (ice-aktarma.mjs > EKLEME_TABLOLARI): yalnızca içerikleri eşlenir. */
const GENEL_TABLOLAR = new Set(['makineler', 'ayarlar', 'projeler', 'degisiklik_gecmisi', 'kosular', 'kosu_sonuclari', 'adim_sonuclari',
  'yakalanan_mesajlar', 'medya', 'servis_kosulari', 'servis_akis_kosulari', 'raporlar']);
for (const t of TABLOLAR) {
  if (!(t.ad in PROJE_TABLOLARI) && !GENEL_TABLOLAR.has(t.ad)) {
    throw new Error(`İçe aktarma eşlemesi: "${t.ad}" tablosu için davranış tanımlı değil (PROJE_TABLOLARI).`);
  }
}

/** Özet metnindeki sayı etiketleri (Türkçe'de sayıdan sonra tekil). */
export const SAYI_ETIKETLERI = Object.freeze({
  servisler: 'servis', ekranlar: 'ekran', senaryolar: 'senaryo', servis_senaryolari: 'servis senaryosu', servis_akislari: 'servis akışı',
  ortamlar: 'ortam', giris_profilleri: 'giriş profili', baglam_profilleri: 'bağlam profili', test_verisi_turleri: 'test verisi tablosu',
  test_verisi_profilleri: 'test verisi satırı', ekran_modelleri: 'ekran modeli sürümü', servis_kimlikleri: 'servis giriş bilgisi',
  servis_parametre_tanimlari: 'servis parametre tanımı'
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZARF = 'kasa:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]*';
/** @param {string} s */
const kacis = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** @param {string} tablo */
const pkBul = (tablo) => /** @type {string} */ (TABLOLAR.find((t) => t.ad === tablo)?.birincilAnahtar);

/**
 * Kararlı yeni kimlik (UUID biçimi): aynı hedef + tablo + eski kimlik her zaman aynı sonucu verir.
 * @param {string} hedefProje @param {string} tablo @param {string} id
 */
export function turetilmisKimlik(hedefProje, tablo, id) {
  const h = createHash('sha256').update(`ice-aktarma|${hedefProje}|${tablo}|${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** @param {Buffer} anahtar @param {unknown} deger */
function acikMetin(anahtar, deger) {
  if (typeof deger !== 'string') return deger == null ? '' : String(deger);
  if (!deger.startsWith('kasa:v1:')) return deger;
  try { return zarfCoz(anahtar, deger); } catch { return ''; }
}
/** @param {Buffer} anahtar @param {unknown} deger @returns {Satir} */
function acikJson(anahtar, deger) {
  try {
    const d = JSON.parse(acikMetin(anahtar, deger) || '{}');
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch { return {}; }
}
/** @param {Buffer} anahtar @param {Satir} ortam @returns {OrtamOzeti} */
function ortamOzeti(anahtar, ortam) {
  const secim = riskliSecimi({ ayarlar: /** @type {{ riskli?: unknown; canli?: unknown }} */ (acikJson(anahtar, ortam.ayarlar_json)) });
  return { id: String(ortam.id), ad: acikMetin(anahtar, ortam.ad), tur: secim === true ? 'canli' : secim === false ? 'test' : null };
}
/** @param {string} a */
const adNormal = (a) => a.trim().toLocaleLowerCase('tr');

/**
 * Yerel projeler ve ortamları (önizleme ve doğrulama).
 * @param {Veritabani | null} vt @param {Buffer} anahtar
 * @returns {Array<{ id: string; ad: string; ortamlar: OrtamOzeti[] }>}
 */
function yerelProjeler(vt, anahtar) {
  if (!vt) return [];
  const ortamlar = vt.tumu('SELECT id, proje_id, ad, ayarlar_json FROM ortamlar ORDER BY rowid');
  return vt.tumu('SELECT id, ad FROM projeler ORDER BY ad, id').map((p) => ({
    id: String(p.id), ad: String(p.ad),
    ortamlar: ortamlar.filter((o) => o.proje_id === p.id).map((o) => ortamOzeti(anahtar, o))
  }));
}

/**
 * Kaynak ortam için öneri: hedef projede aynı ad; yoksa aynı tür (Test/Canlı); yoksa yeni ortam. Kullanılmış hedef atlanır.
 * @param {OrtamOzeti} kaynak @param {OrtamOzeti[]} hedefler @param {Set<string>} kullanilan
 */
function ortamOnerisi(kaynak, hedefler, kullanilan) {
  const bos = hedefler.filter((h) => !kullanilan.has(h.id));
  const ayniAd = bos.find((h) => adNormal(h.ad) === adNormal(kaynak.ad));
  if (ayniAd) return ayniAd.id;
  const ayniTur = kaynak.tur ? bos.find((h) => h.tur === kaynak.tur) : undefined;
  return ayniTur ? ayniTur.id : YENI;
}

/**
 * Yedekteki projeler, yerel projeler ve önerilen eşleme (önizleme bilgisi; hiçbir şey yazmaz).
 * Öneri: yerelde aynı kimlikli proje varsa ona; yoksa yeni proje. onerilenMevcut: "Mevcut projeye aktar" seçilirse
 * önerilecek proje (aynı kimlik, yoksa yerelde tek proje varsa o).
 * @param {Veritabani | null} vt @param {Record<string, Satir[]>} tablolar @param {Buffer} anahtar
 */
export function projeEslemesiBilgisi(vt, tablolar, anahtar) {
  const yerel = yerelProjeler(vt, anahtar);
  const yerelHarita = new Map(yerel.map((p) => [p.id, p]));
  /** @type {Esleme} */
  const oneri = { projeler: {} };
  const yedekProjeleri = (tablolar.projeler ?? []).map((p) => {
    const id = String(p.id);
    const ortamlar = (tablolar.ortamlar ?? []).filter((o) => o.proje_id === id).map((o) => ortamOzeti(anahtar, o));
    /** @type {Record<string, number>} */
    const sayilar = {};
    for (const [t, n] of Object.entries(projeSatirSayilari(tablolar, id))) if (n) sayilar[t] = n;
    const ayni = yerelHarita.get(id);
    const onerilenMevcut = ayni ? ayni.id : yerel.length === 1 ? yerel[0].id : null;
    oneri.projeler[id] = ayni ? { hedef: ayni.id, ortamlar: ortamOnerileri(ortamlar, ayni.ortamlar) } : { hedef: YENI };
    return { id, ad: String(p.ad ?? id), yerelde: Boolean(ayni), onerilenMevcut, ortamlar, sayilar };
  });
  return { yedekProjeleri, yerelProjeler: yerel, oneri };
}

/** @param {OrtamOzeti[]} kaynaklar @param {OrtamOzeti[]} hedefler @returns {Record<string, string>} */
function ortamOnerileri(kaynaklar, hedefler) {
  /** @type {Set<string>} */
  const kullanilan = new Set();
  /** @type {Record<string, string>} */
  const sonuc = {};
  // Önce aynı kimlik (aynı ortam), sonra ad/tür önerisi.
  for (const k of kaynaklar) if (hedefler.some((h) => h.id === k.id)) { sonuc[k.id] = k.id; kullanilan.add(k.id); }
  for (const k of kaynaklar) {
    if (sonuc[k.id]) continue;
    const o = ortamOnerisi(k, hedefler, kullanilan);
    sonuc[k.id] = o;
    if (o !== YENI) kullanilan.add(o);
  }
  return sonuc;
}

/**
 * Yedekteki bir projenin tablo başına kayıt sayıları (ekran modelleri ekranından).
 * @param {Record<string, Satir[]>} tablolar @param {string} projeId
 */
function projeSatirSayilari(tablolar, projeId) {
  const ekranlar = new Set((tablolar.ekranlar ?? []).filter((e) => e.proje_id === projeId).map((e) => String(e.id)));
  /** @type {Record<string, number>} */
  const sayilar = {};
  for (const t of Object.keys(PROJE_TABLOLARI)) {
    sayilar[t] = (tablolar[t] ?? []).filter((s) => (t === 'ekran_modelleri' ? ekranlar.has(String(s.ekran_id)) : s.proje_id === projeId)).length;
  }
  return sayilar;
}

/**
 * Eşlemeyi doğrular ve eksikleri öneriyle tamamlar. Hatalı eşleme → YedekHatasi('VERI') (hiçbir şey yazılmaz).
 * @param {Veritabani | null} vt @param {Record<string, Satir[]>} tablolar @param {Buffer} anahtar @param {unknown} ham
 * @returns {Esleme}
 */
export function eslemeyiDogrula(vt, tablolar, anahtar, ham) {
  if (typeof ham !== 'object' || ham === null || typeof /** @type {Satir} */ (ham).projeler !== 'object' || /** @type {Satir} */ (ham).projeler === null) {
    throw new YedekHatasi('VERI', 'Eşleme geçersiz: { projeler: { <yedekteki proje>: { hedef, ortamlar } } } bekleniyor.');
  }
  const bilgi = projeEslemesiBilgisi(vt, tablolar, anahtar);
  const yedek = new Map(bilgi.yedekProjeleri.map((p) => [p.id, p]));
  const yerel = new Map(bilgi.yerelProjeler.map((p) => [p.id, p]));
  /** @type {Esleme} */
  const sonuc = { projeler: {} };
  /** @type {Map<string, string>} yerel proje → onu hedefleyen yedek projesi */
  const hedefler = new Map();
  for (const [kaynakId, e] of Object.entries(/** @type {Record<string, unknown>} */ (/** @type {Satir} */ (ham).projeler))) {
    const kaynak = yedek.get(kaynakId);
    if (!kaynak) throw new YedekHatasi('VERI', 'Eşlemede yedekte olmayan bir proje var.');
    if (typeof e !== 'object' || e === null) throw new YedekHatasi('VERI', `"${kaynak.ad}" için hedef seçilmedi.`);
    const hedef = /** @type {Satir} */ (e).hedef;
    if (hedef === YENI) {
      sonuc.projeler[kaynakId] = { hedef: YENI };
      continue;
    }
    const hedefProje = typeof hedef === 'string' ? yerel.get(hedef) : undefined;
    if (!hedefProje) throw new YedekHatasi('VERI', `"${kaynak.ad}" için seçilen hedef proje bu bilgisayarda yok.`);
    const onceki = hedefler.get(hedefProje.id);
    if (onceki && onceki !== kaynakId) {
      throw new YedekHatasi('VERI', `Yedekteki iki proje aynı projeye ("${hedefProje.ad}") aktarılamaz; birini yeni proje olarak ekleyin.`);
    }
    hedefler.set(hedefProje.id, kaynakId);
    const hamOrtamlar = /** @type {Satir} */ (e).ortamlar;
    const verilen = typeof hamOrtamlar === 'object' && hamOrtamlar !== null ? /** @type {Record<string, unknown>} */ (hamOrtamlar) : {};
    const oneri = ortamOnerileri(kaynak.ortamlar, hedefProje.ortamlar);
    /** @type {Record<string, string>} */
    const ortamlar = {};
    /** @type {Map<string, string>} */
    const kullanilan = new Map();
    const hedefOrtamlar = new Map(hedefProje.ortamlar.map((o) => [o.id, o]));
    for (const ko of kaynak.ortamlar) {
      const v = ko.id in verilen ? verilen[ko.id] : oneri[ko.id];
      if (v === YENI) { ortamlar[ko.id] = YENI; continue; }
      const ho = typeof v === 'string' ? hedefOrtamlar.get(v) : undefined;
      if (!ho) throw new YedekHatasi('VERI', `"${ko.ad}" ortamı için seçilen ortam "${hedefProje.ad}" projesinde yok.`);
      const baska = kullanilan.get(ho.id);
      if (baska) throw new YedekHatasi('VERI', `"${baska}" ve "${ko.ad}" aynı ortama ("${ho.ad}") eşlenemez; birini yeni ortam olarak ekleyin.`);
      kullanilan.set(ho.id, ko.ad);
      ortamlar[ko.id] = ho.id;
    }
    for (const k of Object.keys(verilen)) {
      if (!kaynak.ortamlar.some((o) => o.id === k)) throw new YedekHatasi('VERI', `"${kaynak.ad}" eşlemesinde yedekte olmayan bir ortam var.`);
    }
    sonuc.projeler[kaynakId] = { hedef: hedefProje.id, ortamlar };
  }
  return sonuc;
}

/**
 * Eşlemeyi yedek tablolarına uygular: YENİ tablo kopyası döner (girdi değişmez). Özet ve kimlik değişimleri raporlanır.
 * @param {Veritabani | null} vt @param {Record<string, Satir[]>} tablolar @param {Buffer} anahtar @param {unknown} hamEsleme
 */
export function eslemeyiUygula(vt, tablolar, anahtar, hamEsleme) {
  const esleme = eslemeyiDogrula(vt, tablolar, anahtar, hamEsleme);
  const bilgi = projeEslemesiBilgisi(vt, tablolar, anahtar);
  /** @type {Map<string, string>} eski kimlik → yeni kimlik */
  const harita = new Map();
  /** @type {Map<string, Set<string>>} eklenmeyecek satırlar (eşlenen proje / ortam kayıtları) */
  const atla = new Map([['projeler', new Set()], ['ortamlar', new Set()]]);
  /** @type {Array<{ tablo: string; eski: string; yeni: string; neden: 'kimlik_cakismasi' | 'ayni_ad' | 'ortam_eslemesi' | 'proje_eslemesi' }>} */
  const degisimler = [];
  /** @type {Map<string, string>} yedek projesi → hedef proje */
  const hedefProjesi = new Map();
  /** @type {Set<string>} hedefi mevcut olan yedek projeleri */
  const mevcutHedefli = new Set();
  const yerelProjeVar = (/** @type {string} */ id) => Boolean(vt?.tek('SELECT 1 AS var FROM projeler WHERE id = ?', [id]));

  for (const [p, e] of Object.entries(esleme.projeler)) {
    let hedef = e.hedef;
    if (hedef === YENI) {
      hedef = yerelProjeVar(p) ? turetilmisKimlik(YENI, 'projeler', p) : p;
    } else {
      mevcutHedefli.add(p);
      if (hedef !== p) atla.get('projeler')?.add(p);
    }
    hedefProjesi.set(p, hedef);
    if (hedef !== p) {
      harita.set(p, hedef);
      degisimler.push({ tablo: 'projeler', eski: p, yeni: hedef, neden: e.hedef === YENI ? 'kimlik_cakismasi' : 'proje_eslemesi' });
    }
  }

  // Ortamlar: eşlenen → yerel ortamın kimliği (satır eklenmez); yeni → kimlik korunur (yerelde varsa türetilir).
  /** @type {Set<string>} mevcut projeye yeni eklenen ortamlar: "varsayılan" işareti taşımaz (projenin varsayılanı değişmez) */
  const mevcutProjeyeYeniOrtam = new Set();
  for (const o of tablolar.ortamlar ?? []) {
    const p = String(o.proje_id);
    const e = esleme.projeler[p];
    if (!e) continue;
    const id = String(o.id);
    const hedef = hedefProjesi.get(p) ?? p;
    const secim = e.hedef === YENI ? YENI : e.ortamlar?.[id] ?? YENI;
    if (secim !== YENI) {
      if (secim !== id) {
        atla.get('ortamlar')?.add(id);
        harita.set(id, secim);
        degisimler.push({ tablo: 'ortamlar', eski: id, yeni: secim, neden: 'ortam_eslemesi' });
      }
      continue;
    }
    let sonId = id;
    if (vt?.tek('SELECT 1 AS var FROM ortamlar WHERE id = ?', [id])) {
      sonId = turetilmisKimlik(hedef, 'ortamlar', id);
      harita.set(id, sonId);
      degisimler.push({ tablo: 'ortamlar', eski: id, yeni: sonId, neden: 'kimlik_cakismasi' });
    }
    if (e.hedef !== YENI) mevcutProjeyeYeniOrtam.add(sonId);
  }

  // Diğer proje kayıtları (üst kayıtlar önce): aynı kimlik / aynı ad / kimlik çakışması.
  const esle = (/** @type {unknown} */ d) => (typeof d === 'string' ? harita.get(d) ?? d : d);
  /** @type {Map<string, string>} yedekteki ekran → yedek projesi */
  const ekranProjesi = new Map((tablolar.ekranlar ?? []).map((e) => [String(e.id), String(e.proje_id)]));
  for (const [tablo, dogal] of Object.entries(PROJE_TABLOLARI)) {
    if (tablo === 'ortamlar' || !dogal) continue;
    const pk = pkBul(tablo);
    /** @type {Map<string, Map<string, string[]>>} hedef proje → doğal anahtar → yerel kimlikler */
    const dogalOnbellek = new Map();
    /** @type {Set<string>} bu turda sahiplenilen yerel kayıtlar */
    const sahiplenilen = new Set();
    const yerelDogal = (/** @type {string} */ hedef) => {
      let m = dogalOnbellek.get(hedef);
      if (!m) {
        m = new Map();
        const satirlar = vt ? (tablo === 'ekran_modelleri'
          ? vt.tumu('SELECT m.* FROM ekran_modelleri m JOIN ekranlar e ON e.id = m.ekran_id WHERE e.proje_id = ?', [hedef])
          : vt.tumu(`SELECT * FROM ${tablo} WHERE proje_id = ?`, [hedef])) : [];
        for (const s of satirlar) {
          const k = JSON.stringify(dogal.map((c) => s[c] ?? null));
          m.set(k, [...(m.get(k) ?? []), String(s[pk])]);
        }
        dogalOnbellek.set(hedef, m);
      }
      return m;
    };
    for (const s of tablolar[tablo] ?? []) {
      const p = tablo === 'ekran_modelleri' ? ekranProjesi.get(String(s.ekran_id)) : String(s.proje_id);
      if (!p || !esleme.projeler[p]) continue;
      const hedef = hedefProjesi.get(p) ?? p;
      const id = String(s[pk]);
      const yerel = vt?.tek(tablo === 'ekran_modelleri'
        ? 'SELECT e.proje_id AS proje_id FROM ekran_modelleri m JOIN ekranlar e ON e.id = m.ekran_id WHERE m.id = ?'
        : `SELECT proje_id FROM ${tablo} WHERE ${pk} = ?`, [id]);
      if (yerel && String(yerel.proje_id) === hedef) { sahiplenilen.add(id); continue; }
      if (mevcutHedefli.has(p)) {
        const adaylar = (yerelDogal(hedef).get(JSON.stringify(dogal.map((c) => esle(s[c]) ?? null))) ?? []).filter((x) => !sahiplenilen.has(x));
        if (adaylar.length === 1) {
          sahiplenilen.add(adaylar[0]);
          if (adaylar[0] !== id) {
            harita.set(id, adaylar[0]);
            degisimler.push({ tablo, eski: id, yeni: adaylar[0], neden: 'ayni_ad' });
          }
          continue;
        }
      }
      if (yerel) {
        const yeni = turetilmisKimlik(hedef, tablo, id);
        harita.set(id, yeni);
        degisimler.push({ tablo, eski: id, yeni, neden: 'kimlik_cakismasi' });
      }
    }
  }

  // İçerik yeniden eşleme (tüm tablolar, tüm metin sütunları).
  const donustur = metinEsleyici(harita, anahtar);
  /** @type {Record<string, Satir[]>} */
  const yeniTablolar = {};
  for (const [tablo, satirlar] of Object.entries(tablolar)) {
    const pk = pkBul(tablo);
    const atlanan = atla.get(tablo);
    yeniTablolar[tablo] = satirlar
      .filter((s) => !atlanan?.has(String(s[pk])))
      .map((s) => Object.fromEntries(Object.entries(s).map(([k, d]) => [k, typeof d === 'string' ? donustur(d) : d])))
      .map((s) => (tablo === 'ortamlar' && mevcutProjeyeYeniOrtam.has(String(s.id)) ? { ...s, varsayilan: 0 } : s));
  }
  // Ayarlar: mevcut projeye aktarılırken yerel Ayarlar kaydıyla birleştirilir (yereldeki başka projelerin kayıtları korunur).
  if (vt && mevcutHedefli.size) {
    yeniTablolar.ayarlar = (yeniTablolar.ayarlar ?? []).map((s) => ayarBirlestir(vt, anahtar, s));
  }

  const yerel = new Map(bilgi.yerelProjeler.map((p) => [p.id, p]));
  const ozet = Object.entries(esleme.projeler).map(([p, e]) => {
    const kaynak = /** @type {(typeof bilgi.yedekProjeleri)[number]} */ (bilgi.yedekProjeleri.find((x) => x.id === p));
    const hedef = hedefProjesi.get(p) ?? p;
    const hedefProje = e.hedef === YENI ? null : yerel.get(e.hedef) ?? null;
    const hedefOrtamlar = new Map((hedefProje?.ortamlar ?? []).map((o) => [o.id, o]));
    return {
      kaynak: { id: p, ad: kaynak.ad },
      hedef: { id: hedef, ad: hedefProje ? hedefProje.ad : kaynak.ad, yeni: !hedefProje },
      sayilar: kaynak.sayilar,
      metin: ozetMetni(kaynak.ad, hedefProje ? hedefProje.ad : `${kaynak.ad} (yeni proje)`, kaynak.sayilar),
      ortamlar: kaynak.ortamlar.map((o) => {
        const s = e.hedef === YENI ? YENI : e.ortamlar?.[o.id] ?? YENI;
        const h = s === YENI ? null : hedefOrtamlar.get(s) ?? null;
        return { kaynak: o, hedef: h, yeni: !h };
      })
    };
  });
  return { esleme, tablolar: yeniTablolar, ozet, kimlikDegisimleri: degisimler };
}

/**
 * @param {string} kaynak @param {string} hedef @param {Record<string, number>} sayilar
 */
export function ozetMetni(kaynak, hedef, sayilar) {
  const parcalar = Object.entries(SAYI_ETIKETLERI)
    .filter(([t]) => (sayilar[t] ?? 0) > 0)
    .map(([t, etiket]) => `${sayilar[t]} ${etiket}`);
  return `${kaynak} → ${hedef}: ${parcalar.length ? parcalar.join(', ') : 'kayıt yok'}`;
}

/**
 * Metin (sütun değeri, JSON, şifreli zarf) içindeki kimlikleri eşleyen fonksiyon.
 * @param {Map<string, string>} harita @param {Buffer} anahtar
 * @returns {(metin: string) => string}
 */
function metinEsleyici(harita, anahtar) {
  if (!harita.size) return (m) => m;
  const uuidler = [...harita.keys()].filter((k) => UUID.test(k));
  const kisalar = [...harita.keys()].filter((k) => !UUID.test(k) && k.length > 0);
  const desen = new RegExp(`(${ZARF})|(${uuidler.length ? uuidler.map(kacis).join('|') : '(?!)'})|"(${kisalar.length ? kisalar.map(kacis).join('|') : '(?!)'})"`, 'g');
  /** @param {string} metin @returns {string} */
  const donustur = (metin) => {
    const tam = harita.get(metin);
    if (tam !== undefined) return tam;
    return metin.replace(desen, (m, zarf, uuid, kisa) => {
      if (zarf) {
        let acik;
        try { acik = zarfCoz(anahtar, zarf); } catch { return zarf; }
        const yeni = donustur(acik);
        return yeni === acik ? zarf : zarfSifrele(anahtar, yeni);
      }
      if (uuid) return harita.get(uuid) ?? uuid;
      if (kisa) return `"${harita.get(kisa) ?? kisa}"`;
      return m;
    });
  };
  return donustur;
}

/**
 * Ayarlar kaydını yereldekiyle birleştirir: { ...yerel, ...yedek }; { id, projeId } nesnelerinden oluşan diziler kimliğe göre
 * birleşir (yerelde olup yedekte olmayanlar korunur, ikisinde olan yedektekiyle değişir).
 * @param {Veritabani} vt @param {Buffer} anahtar @param {Satir} satir
 */
function ayarBirlestir(vt, anahtar, satir) {
  const yerel = vt.tek('SELECT deger_json FROM ayarlar WHERE anahtar = ?', [satir.anahtar]);
  if (!yerel) return satir;
  /** @param {unknown} d */
  const oku = (d) => { try { return JSON.parse(acikMetin(anahtar, d)); } catch { return undefined; } };
  const y = oku(yerel.deger_json);
  const g = oku(satir.deger_json);
  const nesne = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
  if (!nesne(y) || !nesne(g)) return satir;
  const kayitDizisi = (/** @type {unknown} */ d) => Array.isArray(d) && d.length > 0 && d.every((x) => nesne(x) && typeof x.id === 'string' && 'projeId' in x);
  /** @type {Satir} */
  const birlesik = { ...y, ...g };
  for (const [k, gd] of Object.entries(g)) {
    const yd = y[k];
    if (!kayitDizisi(gd) || !(kayitDizisi(yd) || (Array.isArray(yd) && !yd.length))) continue;
    const yerelKayitlar = /** @type {Satir[]} */ (yd);
    const yerelProjesi = new Map(yerelKayitlar.map((x) => [x.id, x.projeId]));
    // Aynı kimlik yerelde BAŞKA projenin kaydıysa (kimlik çakışması) gelen kayıt kararlı yeni kimlikle eklenir; yereldeki korunur.
    const gelenler = /** @type {Satir[]} */ (gd).map((x) => (yerelProjesi.has(x.id) && yerelProjesi.get(x.id) !== x.projeId
      ? { ...x, id: turetilmisKimlik(String(x.projeId), `ayarlar:${String(satir.anahtar)}`, String(x.id)) }
      : x));
    const gelen = new Map(gelenler.map((x) => [x.id, x]));
    const sonuc = yerelKayitlar.map((x) => gelen.get(x.id) ?? x);
    const var_ = new Set(sonuc.map((x) => x.id));
    for (const x of gelenler) if (!var_.has(x.id)) sonuc.push(x);
    birlesik[k] = sonuc;
  }
  const metin = JSON.stringify(birlesik);
  const sifreli = typeof satir.deger_json === 'string' && satir.deger_json.startsWith('kasa:v1:');
  return { ...satir, deger_json: sifreli ? zarfSifrele(anahtar, metin) : metin };
}
