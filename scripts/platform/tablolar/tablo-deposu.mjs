// TEST VERİSİ TABLOLARI — test verisi Excel sayfaları gibi tablolardır: sütunlar alan, her satır birlikte geçerli bir
// değer kombinasyonu. Saklama mevcut test verisi tablolarındadır (şema göçü yok):
//   test_verisi_turleri    = tablo (alanlar_json = sütunlar; hassas = diskte şifreli, gizli = ekranda hiç gösterilmez)
//   test_verisi_profilleri = satır (degerler_json; ortam_id NULL = tüm ortamlar). Satır sırası ekleme sırasıdır (rowid).
// Ekran input'ları ve servis parametreleri bir sütuna bağlanır; seçimler satırlardan süzülür (tablo-secimi.mjs).
// Gizli sütun değerleri hiçbir liste yanıtında dönmez; koşu (coz) dışında çözülmez.
// Satır adı: senaryolar bazı satırları adıyla seçer (kimlik kayıtları "tc1", Acente "varsayilan"); ızgarada düzenlenir.
// KARŞILIKLAR: sütundaki bir değerin sayfada ve serviste karşılığı farklı olabilir (ör. DÜNYA → sayfada seçenek değeri "1",
//   serviste "WORLD"). Sütun tanımında { [değer]: { sayfa?, servis? } } olarak tutulur; ekran koşusu seçeneği sayfa değeriyle
//   seçer, servis gövdesine servis değeri yazılır (tanımsızsa tablodaki değer). Anahtarlar değer olduğu için kasa zarfıdır.
// BAĞLAM TABLOLARI (baglamDahil): kullanıcı / acente değiştirme profilleri (baglam_profilleri; tür = tablo, profil = satır)
// Tablolar ekranında tablo olarak gösterilir ve düzenlenir; saklama ve koşucu değişmez. Kimlikleri "baglam_…" ile başlar,
// sütunlara bağlanmaz (senaryoda satır adıyla seçilir), gizli sütun desteklemez.
import {
  DepoHatasi, baglamProfiliKaydet, baglamProfiliSil, baglamProfilleriniListele, testVerisiProfiliKaydet, testVerisiProfiliSil, testVerisiTuruKaydet,
  testVerisiTuruSil, testVerisiTurleriniListele
} from '../veritabani/depo.mjs';
import { coz, sifrele, zarfMi } from '../kasa.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ sayfa?: string; servis?: string }} Karsilik */
/** @typedef {{ ad: string; gizli: boolean; tip: string; karsiliklar?: Record<string, Karsilik> }} TabloSutunu */
/** @typedef {{ id: string; ad: string; ortamId: string | null; degerler: Record<string, string | null>; doluGizli: string[] }} TabloSatiri */
/** @typedef {{ id: string; ad: string; sutunlar: TabloSutunu[]; satirlar: TabloSatiri[]; guncellenme: string; baglam?: boolean }} Tablo */

export const BAGLAM_ONEKI = 'baglam_';
/** @param {string} tur */
const baglamKimligi = (tur) => `${BAGLAM_ONEKI}${Buffer.from(tur, 'utf8').toString('base64url')}`;
/** @param {string} id */
const baglamTuru = (id) => Buffer.from(id.slice(BAGLAM_ONEKI.length), 'base64url').toString('utf8');
/** @param {unknown} v */
const degerMetni = (v) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' ? v : JSON.stringify(v));
/** Satır adı: denetim karakteri yok, en çok 120. @param {unknown} v */
const satirAdiOku = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) : '');

/**
 * Bağlam profilleri tablo görünümünde (tür = tablo; profilin alanları = sütunlar). Kasa açık olmalı.
 * @param {Veritabani} vt @param {string} projeId @returns {Tablo[]}
 */
function baglamTablolari(vt, projeId) {
  const profiller = baglamProfilleriniListele(vt, projeId);
  return [...new Set(profiller.map((p) => p.tur))].map((tur) => {
    const ps = profiller.filter((p) => p.tur === tur);
    const anahtarlar = [...new Set(ps.flatMap((p) => Object.keys(p.alanlar ?? {})))];
    return {
      id: baglamKimligi(tur), ad: tur, baglam: true, sutunlar: anahtarlar.map((a) => ({ ad: a, gizli: false, tip: 'metin' })),
      satirlar: ps.map((p) => ({ id: p.id, ad: p.ad, ortamId: p.ortamId, degerler: Object.fromEntries(anahtarlar.map((a) => [a, degerMetni(p.alanlar?.[a])])), doluGizli: [] })),
      guncellenme: ps.map((p) => p.guncellenme).sort().at(-1) ?? ''
    };
  });
}

/** Tablo ve sütun adı: gövdede ${Tablo.Sütun} / ${Tablo[etiket].Sütun} olarak yazılır; bu yüzden . [ ] { } $ < > & yok. */
export const TABLO_ADI = /^[^.[\]{}$<>&\u0000-\u001f]{1,60}$/u;
export const EN_COK_SATIR = 5000;
export const EN_COK_SUTUN = 40;
export const EN_COK_KARSILIK = 5000;

/**
 * Karşılıklar girdisi → { [değer]: { sayfa?, servis? } } (boşlar atılır). null / {} → boş.
 * @param {unknown} v @param {string} sutun @returns {Record<string, Karsilik>}
 */
function karsiliklarDogrula(v, sutun) {
  if (v === null || v === undefined) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new DepoHatasi(`"${sutun}" sütununun karşılıkları geçersiz.`);
  /** @type {Record<string, Karsilik>} */
  const sonuc = {};
  const metin = (/** @type {unknown} */ x, /** @type {string} */ ne) => {
    if (x === undefined || x === null || x === '') return '';
    if (typeof x !== 'string' && typeof x !== 'number') throw new DepoHatasi(`"${sutun}" sütununda ${ne} geçersiz.`);
    const s = String(x).trim();
    if (s.length > 500) throw new DepoHatasi(`"${sutun}" sütununda ${ne} en çok 500 karakter olabilir.`);
    return s;
  };
  for (const [deger, k] of Object.entries(v)) {
    const d = deger.trim();
    if (!d || d.length > 500) continue;
    const o = /** @type {Record<string, unknown>} */ (k && typeof k === 'object' ? k : {});
    const sayfa = metin(o.sayfa, `"${d}" değerinin sayfa değeri`);
    const servis = metin(o.servis, `"${d}" değerinin servis değeri`);
    if (sayfa || servis) sonuc[d] = { ...(sayfa ? { sayfa } : {}), ...(servis ? { servis } : {}) };
  }
  if (Object.keys(sonuc).length > EN_COK_KARSILIK) throw new DepoHatasi(`"${sutun}" sütununda en çok ${EN_COK_KARSILIK} karşılık olabilir.`);
  return sonuc;
}

/** Saklanan karşılıklar (zarf) → nesne. @param {Veritabani} vt @param {unknown} z @returns {Record<string, Karsilik> | undefined} */
function karsiliklarOku(vt, z) {
  if (!zarfMi(z)) return undefined;
  const o = JSON.parse(String(coz(vt, z)));
  return o && typeof o === 'object' && Object.keys(o).length ? o : undefined;
}

/** @param {unknown} ad @param {string} ne */
function adDogrula(ad, ne) {
  const a = typeof ad === 'string' ? ad.trim() : '';
  if (!a) throw new DepoHatasi(`${ne} boş olamaz.`);
  if (!TABLO_ADI.test(a)) throw new DepoHatasi(`${ne} geçersiz: "${a}" (en çok 60 karakter; . [ ] { } $ < > & kullanılamaz).`);
  return a;
}

/**
 * Satır adı verilmezse sıra numarasıyla üretilir. Değerlerden üretilmez: ad sütunu şifrelenmez, değerler (kimlik, kullanıcı
 * adı…) diskte düz metin kalmasın.
 * @param {number} no
 */
const satirAdi = (no) => `Satır ${no}`;

/**
 * @param {Veritabani} vt @param {unknown} v @param {boolean} gizli @param {boolean} cozulsun
 * @returns {string | null}
 */
function degerOku(vt, v, gizli, cozulsun) {
  if (v === undefined || v === null || v === '') return null;
  if (gizli && !cozulsun) return null;
  if (zarfMi(v)) return String(coz(vt, v));
  return String(v);
}

/**
 * Projenin tabloları. Gizli sütunların değeri null döner (doluGizli: değeri kayıtlı gizli sütunlar); cozulsun yalnız koşu
 * içindir. Diğer sütunlar diskte şifreli olsa da çözülür (kasa açık olmalı).
 * baglamDahil: bağlam profilleri de tablo olarak (yalnız Tablolar ekranı için).
 * @param {Veritabani} vt @param {string} projeId @param {{ cozulsun?: boolean; tabloId?: string; baglamDahil?: boolean }} [secenekler]
 * @returns {Tablo[]}
 */
export function tablolariListele(vt, projeId, secenekler = {}) {
  if (secenekler.tabloId?.startsWith(BAGLAM_ONEKI)) return baglamTablolari(vt, projeId).filter((t) => t.id === secenekler.tabloId);
  const turler = testVerisiTurleriniListele(vt, projeId).filter((t) => !secenekler.tabloId || t.id === secenekler.tabloId);
  /** @type {Map<string, TabloSatiri[]>} */
  const satirlar = new Map(turler.map((t) => [t.id, []]));
  const sutunlari = new Map(turler.map((t) => [t.id, sutunlarOku(vt, t.alanlar)]));
  const ham = secenekler.tabloId
    ? vt.tumu('SELECT id, tur_id, ortam_id, ad, degerler_json FROM test_verisi_profilleri WHERE proje_id = ? AND tur_id = ? ORDER BY rowid', [projeId, secenekler.tabloId])
    : vt.tumu('SELECT id, tur_id, ortam_id, ad, degerler_json FROM test_verisi_profilleri WHERE proje_id = ? ORDER BY rowid', [projeId]);
  for (const s of ham) {
    const liste = satirlar.get(String(s.tur_id));
    const sutunlar = sutunlari.get(String(s.tur_id));
    if (!liste || !sutunlar) continue;
    const d = /** @type {Record<string, unknown>} */ (JSON.parse(String(s.degerler_json || '{}')));
    /** @type {Record<string, string | null>} */
    const degerler = {};
    for (const sutun of sutunlar) degerler[sutun.ad] = degerOku(vt, d[sutun.ad], sutun.gizli, Boolean(secenekler.cozulsun));
    liste.push({
      id: String(s.id), ad: String(s.ad ?? ''), ortamId: s.ortam_id == null ? null : String(s.ortam_id), degerler,
      doluGizli: sutunlar.filter((x) => x.gizli && d[x.ad] !== undefined && d[x.ad] !== null && d[x.ad] !== '').map((x) => x.ad)
    });
  }
  const tablolar = turler.map((t) => ({ id: t.id, ad: t.ad, sutunlar: sutunlari.get(t.id) ?? [], satirlar: satirlar.get(t.id) ?? [], guncellenme: t.guncellenme }));
  return secenekler.baglamDahil && !secenekler.tabloId ? [...tablolar, ...baglamTablolari(vt, projeId)] : tablolar;
}

/**
 * tip: metin | secim (değer + metin, JSON) | json ... (arayüz gösterimi için). Gizli sütunun karşılığı olmaz.
 * @param {Veritabani} vt @param {ReadonlyArray<{ ad: string; gizli?: boolean; tip?: string; karsiliklar?: unknown }>} alanlar @returns {TabloSutunu[]}
 */
const sutunlarOku = (vt, alanlar) => alanlar.map((a) => {
  const gizli = a.gizli === true || (a.gizli === undefined && GIZLI_AD.test(a.ad));
  const karsiliklar = gizli ? undefined : karsiliklarOku(vt, a.karsiliklar);
  return { ad: a.ad, gizli, tip: a.tip || 'metin', ...(karsiliklar ? { karsiliklar } : {}) };
});
/** Gizli işareti olmayan eski alanlarda (tablolardan önceki kayıtlar) sır niteliğindeki adlar gizli sayılır. */
const GIZLI_AD = /parola|password|passwd|şifre|sifre|secret|token|cvv|cvc|guvenlik|güvenlik|totp/i;

/**
 * Tabloyu (sütunlar + değişen satırlar) tek işlemde kaydeder.
 * - sutunlar: [{ ad, eskiAd?, gizli, karsiliklar? }] — eskiAd verilen sütunun mevcut satırlardaki değerleri yeni ada taşınır;
 *   listede olmayan sütunun değerleri silinir. karsiliklar verilmezse (undefined) mevcutlar korunur; null / {} siler.
 * - satirlar: yalnız yeni / değişen satırlar [{ id?, ad?, ortamId, degerler }]. Gizli sütunda değer verilmezse (undefined / null)
 *   kayıtlı değer korunur; '' siler. ad boşsa mevcut ad korunur (yeni satırda değerlerden üretilir).
 * - silinenSatirlar: satır kimlikleri.
 * @param {Veritabani} vt
 * @param {{ projeId: string; id?: string; ad: string; sutunlar: unknown; satirlar?: unknown; silinenSatirlar?: unknown; ortamVar?: (id: string) => boolean }} girdi
 * @returns {string} tablo kimliği
 */
export function tabloKaydet(vt, girdi) {
  if (girdi.id?.startsWith(BAGLAM_ONEKI)) return baglamTablosuKaydet(vt, girdi);
  const ad = adDogrula(girdi.ad, 'Tablo adı');
  if (!Array.isArray(girdi.sutunlar) || !girdi.sutunlar.length) throw new DepoHatasi('Tabloda en az bir sütun olmalıdır.');
  if (girdi.sutunlar.length > EN_COK_SUTUN) throw new DepoHatasi(`Bir tabloda en çok ${EN_COK_SUTUN} sütun olabilir.`);
  const sutunlar = girdi.sutunlar.map((x, i) => {
    const o = /** @type {Record<string, unknown>} */ (x && typeof x === 'object' ? x : {});
    return {
      ad: adDogrula(o.ad, `${i + 1}. sütunun adı`),
      eskiAd: typeof o.eskiAd === 'string' && o.eskiAd ? o.eskiAd : null,
      gizli: o.gizli === true,
      karsiliklar: o.karsiliklar === undefined ? undefined : karsiliklarDogrula(o.karsiliklar, String(o.ad ?? ''))
    };
  });
  const adlar = new Set();
  for (const s of sutunlar) {
    const k = s.ad.toLocaleLowerCase('tr');
    if (adlar.has(k)) throw new DepoHatasi(`Sütun adı tekrar ediyor: "${s.ad}".`);
    adlar.add(k);
  }
  const satirlar = girdi.satirlar === undefined ? [] : girdi.satirlar;
  if (!Array.isArray(satirlar)) throw new DepoHatasi('"satirlar" bir dizi olmalıdır.');
  const silinenler = girdi.silinenSatirlar === undefined ? [] : girdi.silinenSatirlar;
  if (!Array.isArray(silinenler)) throw new DepoHatasi('"silinenSatirlar" bir dizi olmalıdır.');

  return vt.islem(() => {
    const turler = testVerisiTurleriniListele(vt, girdi.projeId);
    const mevcut = girdi.id ? turler.find((t) => t.id === girdi.id) : undefined;
    if (girdi.id && !mevcut) throw new DepoHatasi('Tablo bulunamadı.');
    const ayniAd = turler.find((t) => t.id !== girdi.id && t.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'));
    if (ayniAd) throw new DepoHatasi(`"${ad}" adında bir tablo zaten var.`);
    const eskiAlanlar = new Map((mevcut?.alanlar ?? []).map((a) => [a.ad, a]));
    for (const s of sutunlar) if (s.eskiAd && !eskiAlanlar.has(s.eskiAd)) throw new DepoHatasi(`"${s.eskiAd}" sütunu tabloda yok.`);
    // Sütunlar: mevcut alanın hassaslığı ve (eski) servis eşlemesi korunur; yeni sütun diskte şifreli saklanır.
    const alanlar = sutunlar.map((s) => {
      const eski = /** @type {Record<string, any> | undefined} */ (eskiAlanlar.get(s.eskiAd ?? s.ad));
      const karsiliklar = s.gizli ? undefined
        : s.karsiliklar === undefined ? (zarfMi(eski?.karsiliklar) ? eski?.karsiliklar : undefined)
          : Object.keys(s.karsiliklar).length ? sifrele(vt, JSON.stringify(s.karsiliklar)) : undefined;
      return {
        ad: s.ad, etiket: s.ad, tip: eski?.tip ?? 'metin', hassas: s.gizli ? true : eski ? eski.hassas : true, gizli: s.gizli,
        ...(eski?.servisParametreleri ? { servisParametreleri: eski.servisParametreleri } : {}),
        ...(karsiliklar ? { karsiliklar } : {})
      };
    });
    // Ad değişen / kaldırılan sütunlar: mevcut satırlardaki anahtarlar önce düzenlenir (değerler zarf olarak taşınır).
    if (mevcut) {
      const tasima = new Map(sutunlar.map((s) => [s.eskiAd ?? s.ad, s.ad]));
      const degisti = [...eskiAlanlar.keys()].some((a) => tasima.get(a) !== a);
      if (degisti) {
        for (const p of vt.tumu('SELECT id, degerler_json FROM test_verisi_profilleri WHERE tur_id = ?', [mevcut.id])) {
          const d = /** @type {Record<string, unknown>} */ (JSON.parse(String(p.degerler_json || '{}')));
          /** @type {Record<string, unknown>} */
          const yeni = {};
          for (const [k, v] of Object.entries(d)) { const hedef = tasima.get(k); if (hedef) yeni[hedef] = v; }
          vt.calistir('UPDATE test_verisi_profilleri SET degerler_json = ? WHERE id = ?', [JSON.stringify(yeni), p.id]);
        }
      }
    }
    const tabloId = testVerisiTuruKaydet(vt, { id: mevcut?.id, projeId: girdi.projeId, ad, alanlar });
    // Mevcut satırın adı korunur: ekran senaryoları eski kayıtları adıyla (ör. tc1) seçiyor olabilir.
    const satirAdlari = new Map(vt.tumu('SELECT id, ad FROM test_verisi_profilleri WHERE tur_id = ?', [tabloId]).map((x) => [String(x.id), String(x.ad)]));
    const mevcutSatirlar = new Set(satirAdlari.keys());
    for (const id of silinenler) {
      if (typeof id !== 'string' || !mevcutSatirlar.has(id)) throw new DepoHatasi('Silinecek satır bu tabloda yok.');
      testVerisiProfiliSil(vt, id);
      mevcutSatirlar.delete(id);
    }
    const toplam = mevcutSatirlar.size + satirlar.filter((x) => !(x && typeof x === 'object' && typeof x.id === 'string')).length;
    if (toplam > EN_COK_SATIR) throw new DepoHatasi(`Bir tabloda en çok ${EN_COK_SATIR} satır olabilir.`);
    const gizliler = new Set(sutunlar.filter((s) => s.gizli).map((s) => s.ad));
    satirlar.forEach((x, i) => {
      const o = /** @type {Record<string, unknown>} */ (x && typeof x === 'object' ? x : {});
      const id = typeof o.id === 'string' && o.id ? o.id : undefined;
      if (id && !mevcutSatirlar.has(id)) throw new DepoHatasi(`${i + 1}. satır bu tabloda yok.`);
      const ham = /** @type {Record<string, unknown>} */ (o.degerler && typeof o.degerler === 'object' ? o.degerler : {});
      /** @type {Record<string, string | null>} */
      const degerler = {};
      for (const s of sutunlar) {
        const v = ham[s.ad];
        if (v === undefined || (v === null && gizliler.has(s.ad))) continue; // gizli: verilmeyen değer korunur
        if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new DepoHatasi(`${i + 1}. satırda "${s.ad}" değeri geçersiz.`);
        degerler[s.ad] = v === null ? null : String(v).trim();
      }
      const ortamId = typeof o.ortamId === 'string' && o.ortamId ? o.ortamId : null;
      if (ortamId && girdi.ortamVar && !girdi.ortamVar(ortamId)) throw new DepoHatasi(`${i + 1}. satırın ortamı bulunamadı.`);
      testVerisiProfiliKaydet(vt, { id, projeId: girdi.projeId, turId: tabloId, ortamId, ad: satirAdiOku(o.ad) || (id && satirAdlari.get(id)) || satirAdi(mevcutSatirlar.size + i + 1), degerler });
    });
    return tabloId;
  });
}

/**
 * Bağlam tablosu (bağlam profilleri) kaydı: tablo adı = tür, satır = profil (satır adı zorunlu, tabloda tekil), sütunlar = alanlar.
 * Ad / sütun adı değişince tüm profiller güncellenir.
 * @param {Veritabani} vt @param {Parameters<typeof tabloKaydet>[1]} girdi
 */
function baglamTablosuKaydet(vt, girdi) {
  const eskiTur = baglamTuru(String(girdi.id));
  const tur = adDogrula(girdi.ad, 'Tablo adı');
  if (!Array.isArray(girdi.sutunlar) || !girdi.sutunlar.length) throw new DepoHatasi('Tabloda en az bir sütun olmalıdır.');
  const sutunlar = girdi.sutunlar.map((x, i) => {
    const o = /** @type {Record<string, unknown>} */ (x && typeof x === 'object' ? x : {});
    if (o.gizli === true) throw new DepoHatasi('Bağlam tablosunda gizli sütun olamaz.');
    return { ad: adDogrula(o.ad, `${i + 1}. sütunun adı`), eskiAd: typeof o.eskiAd === 'string' && o.eskiAd ? o.eskiAd : null };
  });
  const satirlar = Array.isArray(girdi.satirlar) ? girdi.satirlar : [];
  const silinenler = Array.isArray(girdi.silinenSatirlar) ? girdi.silinenSatirlar : [];
  return vt.islem(() => {
    const mevcut = baglamProfilleriniListele(vt, girdi.projeId, eskiTur);
    if (!mevcut.length) throw new DepoHatasi('Tablo bulunamadı.');
    if (tur !== eskiTur && baglamProfilleriniListele(vt, girdi.projeId, tur).length) throw new DepoHatasi(`"${tur}" adında bir tablo zaten var.`);
    const tasima = new Map(sutunlar.map((s) => [s.eskiAd ?? s.ad, s.ad]));
    const tasi = (/** @type {Record<string, unknown>} */ alanlar) => Object.fromEntries(Object.entries(alanlar).filter(([k]) => tasima.has(k)).map(([k, v]) => [tasima.get(k), v]));
    const kimlikler = new Set(mevcut.map((p) => p.id));
    for (const id of silinenler) {
      if (typeof id !== 'string' || !kimlikler.has(id)) throw new DepoHatasi('Silinecek satır bu tabloda yok.');
      baglamProfiliSil(vt, id);
      kimlikler.delete(id);
    }
    /** @type {Map<string, { id?: string; ad: string; ortamId?: string | null; alanlar: Record<string, unknown> }>} */
    const yazilacak = new Map();
    // Değişmeyen satırlar: yalnız ad / sütun / tür değişince yeniden yazılır.
    for (const p of mevcut.filter((x) => kimlikler.has(x.id))) yazilacak.set(p.id, { id: p.id, ad: p.ad, alanlar: tasi(p.alanlar ?? {}) });
    satirlar.forEach((x, i) => {
      const o = /** @type {Record<string, unknown>} */ (x && typeof x === 'object' ? x : {});
      const id = typeof o.id === 'string' && o.id ? o.id : undefined;
      if (id && !kimlikler.has(id)) throw new DepoHatasi(`${i + 1}. satır bu tabloda yok.`);
      const ad = satirAdiOku(o.ad) || (id ? yazilacak.get(id)?.ad ?? '' : '');
      if (!ad) throw new DepoHatasi(`${i + 1}. satırın adı boş (bağlam tablosunda satır adıyla seçilir).`);
      const ham = /** @type {Record<string, unknown>} */ (o.degerler && typeof o.degerler === 'object' ? o.degerler : {});
      const alanlar = Object.fromEntries(sutunlar.map((s) => [s.ad, ham[s.ad]]).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v).trim()]));
      yazilacak.set(id ?? `yeni:${i}`, { id, ad, ortamId: typeof o.ortamId === 'string' && o.ortamId ? o.ortamId : null, alanlar });
    });
    const adlar = new Set();
    for (const s of yazilacak.values()) {
      const k = s.ad.toLocaleLowerCase('tr');
      if (adlar.has(k)) throw new DepoHatasi(`Satır adı tekrar ediyor: "${s.ad}".`);
      adlar.add(k);
    }
    for (const s of yazilacak.values()) baglamProfiliKaydet(vt, { id: s.id, projeId: girdi.projeId, tur, ad: s.ad, alanlar: s.alanlar, ...(s.ortamId !== undefined ? { ortamId: s.ortamId } : {}) });
    return baglamKimligi(tur);
  });
}

/** Tabloyu ve tüm satırlarını siler. @param {Veritabani} vt @param {string} projeId @param {string} id */
export function tabloSil(vt, projeId, id) {
  if (id.startsWith(BAGLAM_ONEKI)) {
    const profiller = baglamProfilleriniListele(vt, projeId, baglamTuru(id));
    if (!profiller.length) throw new DepoHatasi('Tablo bulunamadı.');
    return vt.islem(() => { for (const p of profiller) baglamProfiliSil(vt, p.id); return true; });
  }
  const t = testVerisiTurleriniListele(vt, projeId).find((x) => x.id === id);
  if (!t) throw new DepoHatasi('Tablo bulunamadı.');
  return testVerisiTuruSil(vt, id);
}
