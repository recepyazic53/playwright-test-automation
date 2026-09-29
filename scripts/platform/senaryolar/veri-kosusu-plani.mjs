// VERİ KOŞUSU PLANI (sunucu) — tablodan çoklu satırla koşunun başlamadan önceki hesapları ve "Başarısızları tekrar çalıştır":
//  · veriKosusuTahminleri: koşu diyaloğunda senaryo başına tahmini test sayısı (koşu anı ezmesiyle) ve üst sınır (Ayarlar > Koşu >
//    Tek senaryoda en çok veri koşusu). Sınırı aşan senaryo koşuya başlatılmaz (calistirma.mjs aynı hesabı yeniden yapar).
//  · tekrarPlani: bir ekran koşusunun kalan (başarısız) testleri — senaryo + veri koşusu (hangi satırlarla) + model sürümü; o
//    koşudan bu yana satırı / modeli değişenler bildirilir. Satırın o koşudaki değerleri yalnız açık sütunlar için saklandığından
//    "o koşudaki veriyle" yalnız gizli sütunu olmayan tablolarda sunulur; aksi hâlde yalnız güncel veriyle (açıkça belirtilir).
//  · tekrarSenaryoPlani: koşu sürecine verilen plan (tablolar/veri-kosulari.mjs > TEKRAR_PLANI_DEGISKENI) — sunucu kendi kaydından
//    kurar; istemciden yalnız kaynak koşu ve seçimler gelir.
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ekranModeliGetir, senaryoGetir } from '../veritabani/depo.mjs';
import { senaryoOrtamVerisi } from './senaryo-servisi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { tabloBasvurusuVarMi } from '../tablolar/ekran-basvurulari.mjs';
import { VARSAYILAN_VERI_KOSUSU_SINIRI, basvuruGruplari, veriKosusuSayisi } from '../tablolar/veri-kosulari.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { veriKosusuTemizle } from '../veritabani/sonuc-deposu.mjs';
import { servisKosusuGetir, servisSenaryosuGetir } from '../servisler/servis-deposu.mjs';
import { servisSonucKosusu } from '../sonuclar/servis-sonuclari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('../tablolar/tablo-deposu.mjs').Tablo} Tablo */

const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !KIMLIK.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** Tek senaryoda en çok veri koşusu (Ayarlar > Koşu). @param {Veritabani} vt */
export function veriKosusuSiniri(vt) {
  try { return kosuAyarlariniOku(vt).enCokVeriKosusu; } catch { return VARSAYILAN_VERI_KOSUSU_SINIRI; }
}

/**
 * Senaryonun bu ortamdaki tahmini test sayısı. gruplu: tablo başvurusu var (koşu diyaloğunda çalıştırma biçimi seçilebilir).
 * @param {Veritabani} vt @param {string} projeId @param {string} senaryoId @param {string} ortamId @param {string | null | undefined} kip
 * @param {{ tablolar?: Tablo[] }} [onbellek]
 */
export function senaryoVeriKosusuTahmini(vt, projeId, senaryoId, ortamId, kip, onbellek = {}) {
  const s = senaryoGetir(vt, senaryoId);
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  const veri = senaryoOrtamVerisi(vt, s.icerik, ortamId);
  if (!veri || !tabloBasvurusuVarMi(veri)) return { id: s.id, baslik: s.baslik, sayi: 1, coklu: false, gruplu: false, hatalar: /** @type {string[]} */ ([]) };
  onbellek.tablolar ??= tablolariListele(vt, projeId);
  const gruplar = basvuruGruplari(veri, onbellek.tablolar);
  const r = veriKosusuSayisi(/** @type {any} */ (s.icerik.veriKosulari), {
    tablolar: onbellek.tablolar, gruplar, ortamId, kip,
    tabloSecimleri: nesneMi(s.icerik.tabloSecimleri) ? /** @type {Record<string, Record<string, string>>} */ (s.icerik.tabloSecimleri) : null
  });
  return { id: s.id, baslik: s.baslik, sayi: r.sayi, coklu: r.coklu, gruplu: gruplar.length > 0, hatalar: r.hatalar };
}

/**
 * Koşu diyaloğunun tahmini: senaryo başına test sayısı, toplam ve sınırı aşanlar. Ortamda tanımlı olmayan senaryo atlanır.
 * @param {Veritabani} vt @param {string} projeId @param {{ ortamId: unknown; senaryoIdleri: unknown; kip?: unknown }} g
 */
export function veriKosusuTahminleri(vt, projeId, g) {
  const ortamId = kimlik(g.ortamId, 'ortamId');
  const idler = Array.isArray(g.senaryoIdleri) ? [...new Set(g.senaryoIdleri.filter((x) => typeof x === 'string' && KIMLIK.test(x)))].slice(0, 5000) : [];
  const kip = g.kip === 'tek' || g.kip === 'tumu' ? g.kip : 'senaryo';
  const sinir = veriKosusuSiniri(vt);
  /** @type {{ tablolar?: Tablo[] }} */
  const onbellek = {};
  const senaryolar = [];
  for (const id of idler) {
    try { senaryolar.push(senaryoVeriKosusuTahmini(vt, projeId, id, ortamId, kip, onbellek)); } catch { /* silinmiş / başka projenin: atlanır */ }
  }
  return {
    sinir, kip,
    toplam: senaryolar.reduce((t, s) => t + s.sayi, 0),
    gruplu: senaryolar.some((s) => s.gruplu),
    coklu: senaryolar.filter((s) => s.coklu).length,
    senaryolar: senaryolar.map((s) => ({ ...s, asiyor: s.sayi > sinir })),
    asanlar: senaryolar.filter((s) => s.sayi > sinir).map((s) => ({ id: s.id, baslik: s.baslik, sayi: s.sayi }))
  };
}

// ---------------------------------------------------------------------------------------
// Başarısızları tekrar çalıştır
// ---------------------------------------------------------------------------------------

/**
 * Koşunun kalan (başarısız) testleri senaryo başına + değişiklik denetimi.
 * @param {Veritabani} vt @param {string} kosuId
 */
function kalanlar(vt, kosuId) {
  const k = vt.tek('SELECT id, proje_id, ortam_id FROM kosular WHERE id = ?', [kimlik(kosuId, 'kosuId')]);
  if (!k) throw new DepoHatasi('Koşu bulunamadı.');
  const satirlar = vt.tumu("SELECT id, senaryo_id, senaryo_baslik, ekler_json FROM kosu_sonuclari WHERE kosu_id = ? AND durum = 'basarisiz' ORDER BY rowid", [kosuId]);
  /** @type {Map<string, { baslik: string; sonuclar: Array<{ sonucId: string; baslik: string; vk: ReturnType<typeof veriKosusuTemizle> }> }>} */
  const gruplar = new Map();
  let bagsiz = 0;
  for (const r of satirlar) {
    if (r.senaryo_id == null) { bagsiz++; continue; }
    let vk = null;
    try { const e = JSON.parse(String(r.ekler_json ?? '{}')); vk = nesneMi(e) ? veriKosusuTemizle(e.veriKosusu) : null; } catch { vk = null; }
    const id = String(r.senaryo_id);
    if (!gruplar.has(id)) gruplar.set(id, { baslik: String(r.senaryo_baslik), sonuclar: [] });
    /** @type {NonNullable<ReturnType<typeof gruplar.get>>} */ (gruplar.get(id)).sonuclar.push({ sonucId: String(r.id), baslik: String(r.senaryo_baslik), vk });
  }
  return { kosu: { id: String(k.id), projeId: String(k.proje_id), ortamId: k.ortam_id == null ? null : String(k.ortam_id) }, gruplar, bagsiz };
}

/**
 * Satırın o koşudan bu yana değişip değişmediği (açık sütun değerleri ve son güncellenme zamanı) ve o koşudaki verinin
 * kullanılıp kullanılamayacağı (tablonun gizli sütunu yoksa: açık sütunların hepsi saklanmıştır).
 * @param {NonNullable<ReturnType<typeof veriKosusuTemizle>>['satirlar'][number]} s @param {Tablo[]} tablolar
 */
function satirDurumu(s, tablolar) {
  const t = tablolar.find((x) => x.id === s.grup.split('|')[0]);
  const r = t?.satirlar.find((x) => x.id === s.satirId);
  const kosudakiVeri = Boolean(t) && !t?.sutunlar.some((c) => c.gizli) && !s.gizliSutunlar.length;
  if (!t || !r) return { durum: /** @type {'silindi'} */ ('silindi'), kosudakiVeri: kosudakiVeri && Boolean(t) };
  const acik = t.sutunlar.filter((c) => !c.gizli).map((c) => c.ad);
  const adlar = new Set([...acik, ...Object.keys(s.degerler)]);
  const degerDegisti = [...adlar].some((a) => (s.degerler[a] ?? null) !== (acik.includes(a) ? r.degerler[a] ?? null : null));
  const zamanDegisti = Boolean(s.guncellenme && r.guncellenme && s.guncellenme !== r.guncellenme);
  return { durum: degerDegisti || zamanDegisti ? /** @type {'degisti'} */ ('degisti') : /** @type {'ayni'} */ ('ayni'), kosudakiVeri };
}

/** Ekranın en son model sürümü (yoksa null). @param {Veritabani} vt @param {string | null} ekranId */
const sonModelSurumu = (vt, ekranId) => (ekranId ? ekranModeliGetir(vt, ekranId)?.surum ?? null : null);

/**
 * "Başarısızları tekrar çalıştır" önizlemesi: başarısız testler senaryo başına, satır / model değişiklikleri ve atlananlar. Hiçbir şey
 * başlatmaz. projeId verilirse koşu o projede olmalı.
 * @param {Veritabani} vt @param {string} kosuId @param {string | null} [projeId]
 */
export function tekrarPlani(vt, kosuId, projeId = null) {
  const { kosu, gruplar, bagsiz } = kalanlar(vt, kosuId);
  if (projeId && kosu.projeId !== projeId) throw new DepoHatasi('Koşu bulunamadı.');
  /** @type {Tablo[] | null} */
  let tablolar = null;
  /** @type {Array<{ baslik: string; neden: string }>} */
  const atlananlar = [];
  const senaryolar = [];
  for (const [id, g] of gruplar) {
    const s = senaryoGetir(vt, id);
    if (!s || s.projeId !== kosu.projeId) { atlananlar.push({ baslik: g.baslik, neden: 'senaryo silinmiş' }); continue; }
    if (!kosu.ortamId || !nesneMi(s.icerik.ortamlar) || !nesneMi(/** @type {Record<string, unknown>} */ (s.icerik.ortamlar)[kosu.ortamId])) {
      atlananlar.push({ baslik: s.baslik, neden: 'senaryo koşunun ortamında artık tanımlı değil' });
      continue;
    }
    const kullanilan = g.sonuclar.map((x) => x.vk?.modelSurumu).find((x) => typeof x === 'number') ?? null;
    const guncel = sonModelSurumu(vt, s.ekranId);
    const kullanilanVar = kullanilan !== null && s.ekranId ? Boolean(ekranModeliGetir(vt, s.ekranId, kullanilan)) : false;
    /** @type {Array<{ tablo: string; satirAdi: string; durum: 'degisti' | 'silindi'; kosudakiVeri: boolean }>} */
    const satirDegisiklikleri = [];
    const gorulen = new Set();
    for (const x of g.sonuclar) {
      for (const sat of x.vk?.satirlar ?? []) {
        const imza = `${sat.grup}\u0000${sat.satirId}`;
        if (gorulen.has(imza)) continue;
        gorulen.add(imza);
        tablolar ??= tablolariListele(vt, kosu.projeId);
        const d = satirDurumu(sat, tablolar);
        if (d.durum !== 'ayni') satirDegisiklikleri.push({ tablo: sat.tablo, satirAdi: sat.satirAdi, durum: d.durum, kosudakiVeri: d.kosudakiVeri });
      }
    }
    senaryolar.push({
      id: s.id, baslik: s.baslik, testSayisi: g.sonuclar.length,
      testler: g.sonuclar.map((x) => ({ sonucId: x.sonucId, baslik: x.baslik, veriKosusu: x.vk?.ad ?? null })),
      modelSurumu: kullanilan, guncelModelSurumu: guncel, modelDegisti: kullanilan !== null && guncel !== null && kullanilan !== guncel,
      eskiModelVar: kullanilanVar, satirDegisiklikleri
    });
  }
  return {
    kosu, sayi: senaryolar.reduce((t, s) => t + s.testSayisi, 0), senaryolar, atlananlar,
    // Senaryoya bağlı olmayan (ör. Dene) kalan sonuçlar tekrar çalıştırılamaz.
    bagsiz
  };
}

/**
 * SERVİS koşusunda "Başarısızları tekrar çalıştır": koşunun kalan (başarısız / hata) çalıştırmaları, her birinin o koşudaki satırları
 * ve o koşudan bu yana değişen satırlar. Akış koşusu ve senaryosu silinmiş / akışa dönmüş çalıştırmalar atlanır. veri 'kosudaki' ise
 * gizli sütunsuz tablolarda o koşudaki değerler plana eklenir (servis-isleri.mjs kullanır).
 * @param {Veritabani} vt @param {string} projeId @param {string} kosuId "s-<satır>" @param {{ veri?: unknown }} [s]
 */
export function servisTekrarPlani(vt, projeId, kosuId, s = {}) {
  const k = servisSonucKosusu(vt, new URLSearchParams({ projeId, id: kosuId }));
  if (k.kosu.tur !== 'servis') throw new DepoHatasi('Akış koşusunda başarısızları tekrar çalıştırma yok; akışı yeniden çalıştırın.');
  /** @type {Tablo[] | null} */
  let tablolar = null;
  /** @type {Array<{ baslik: string; neden: string }>} */
  const atlananlar = [];
  const testler = [];
  /** @type {Array<{ tablo: string; satirAdi: string; durum: 'degisti' | 'silindi'; kosudakiVeri: boolean }>} */
  const satirDegisiklikleri = [];
  const gorulen = new Set();
  for (const x of k.senaryolar.filter((y) => y.durum === 'basarisiz' || y.durum === 'hata')) {
    const sen = x.senaryoId ? servisSenaryosuGetir(vt, x.senaryoId) : undefined;
    if (!sen) { atlananlar.push({ baslik: x.baslik, neden: x.senaryoId ? 'senaryo silinmiş' : 'kayıtlı senaryo değil (Dene)' }); continue; }
    if (/** @type {any} */ (sen.icerik).tur === 'akis') { atlananlar.push({ baslik: x.baslik, neden: 'senaryo artık akış senaryosu' }); continue; }
    const r = servisKosusuGetir(vt, x.satirId);
    const vk = veriKosusuTemizle(r?.sonuc?.veriKosusu);
    /** @type {Record<string, Record<string, string | null>>} */
    const veriler = {};
    for (const sat of vk?.satirlar ?? []) {
      tablolar ??= tablolariListele(vt, projeId);
      const d = satirDurumu(sat, tablolar);
      if (s.veri === 'kosudaki' && d.kosudakiVeri) veriler[sat.grup] = sat.degerler;
      const imza = `${sat.grup}\u0000${sat.satirId}`;
      if (d.durum !== 'ayni' && !gorulen.has(imza)) { gorulen.add(imza); satirDegisiklikleri.push({ tablo: sat.tablo, satirAdi: sat.satirAdi, durum: d.durum, kosudakiVeri: d.kosudakiVeri }); }
    }
    testler.push({
      satirId: x.satirId, senaryoId: sen.id, baslik: x.baslik, senaryoBaslik: sen.baslik,
      veriKosusu: { anahtar: vk?.anahtar ?? null, ad: vk?.ad ?? null, sabit: Object.fromEntries((vk?.satirlar ?? []).map((sat) => [sat.grup, sat.satirId])), ...(Object.keys(veriler).length ? { veriler } : {}) }
    });
  }
  return { kosu: { id: String(k.kosu.id), servisId: String(k.kosu.kaynakId ?? ''), ortamId: k.kosu.ortamId ?? null }, sayi: testler.length, testler, satirDegisiklikleri, atlananlar };
}

/**
 * Koşu sürecine verilecek tekrar planı (tek senaryo): o koşudaki satırlar (+ istenirse o koşudaki açık sütun değerleri) ve model
 * sürümü. model 'kosudaki' (varsayılan: aynı sürüm) | 'guncel'; veri 'guncel' (varsayılan) | 'kosudaki' (yalnız gizli sütunsuz
 * tablolarda uygulanır). ortamId koşunun ortamı olmalı.
 * @param {Veritabani} vt @param {{ kaynakKosuId: unknown; senaryoId: string; ortamId: string; model?: unknown; veri?: unknown }} g
 * @returns {{ modelSurumu: number | null; kosular: Array<{ anahtar: string | null; ad: string | null; satirlar: Record<string, string>; veriler?: Record<string, Record<string, string | null>> }>; testSayisi: number }}
 */
export function tekrarSenaryoPlani(vt, g) {
  const { kosu, gruplar } = kalanlar(vt, kimlik(g.kaynakKosuId, 'tekrar.kaynakKosuId'));
  if (kosu.ortamId !== g.ortamId) throw new DepoHatasi('Başarısızlar yalnız o koşunun ortamında tekrar çalıştırılabilir.');
  const grup = gruplar.get(g.senaryoId);
  if (!grup) throw new DepoHatasi('Bu senaryonun o koşuda başarısız testi yok.');
  const s = senaryoGetir(vt, g.senaryoId);
  if (!s || s.projeId !== kosu.projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  const kullanilan = grup.sonuclar.map((x) => x.vk?.modelSurumu).find((x) => typeof x === 'number') ?? null;
  const modelSurumu = g.model !== 'guncel' && kullanilan !== null && s.ekranId && ekranModeliGetir(vt, s.ekranId, kullanilan) ? kullanilan : null;
  /** @type {Tablo[] | null} */
  let tablolar = null;
  const kosular = grup.sonuclar.map((x) => {
    const satirlar = Object.fromEntries((x.vk?.satirlar ?? []).map((sat) => [sat.grup, sat.satirId]));
    /** @type {Record<string, Record<string, string | null>>} */
    const veriler = {};
    if (g.veri === 'kosudaki') {
      for (const sat of x.vk?.satirlar ?? []) {
        tablolar ??= tablolariListele(vt, kosu.projeId);
        if (satirDurumu(sat, tablolar).kosudakiVeri) veriler[sat.grup] = sat.degerler;
      }
    }
    return { anahtar: x.vk?.anahtar ?? null, ad: x.vk?.ad ?? null, satirlar, ...(Object.keys(veriler).length ? { veriler } : {}) };
  });
  return { modelSurumu, kosular, testSayisi: kosular.length };
}
