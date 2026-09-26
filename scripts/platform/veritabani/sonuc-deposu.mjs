// KOŞU SONUÇLARI DEPOSU (genel) — koşular, test sonuçları, adımlar ve şifreli medya üst bilgisi
// (şema v5). Yazan: Playwright raporlayıcısı (scripts/platform/raporlayici.mjs; doğrudan ya da
// sunucu üzerinden) ve eski Allure sonuçlarının içe aktarımı. Okuyan: platform "Sonuçlar" ekranı.
//
// - Sonuç satırlarındaki metinler (senaryo başlığı, hata mesajı, adım adları) DÜZ METİNDİR
//   (kullanıcı kararı); ekran görüntüsü/video/iz dosyaları ŞİFRELİDİR (medya.mjs). Bu yüzden
//   yazma işlemleri kasa GEREKTİRMEZ; medyanın kendisini okumak kasa gerektirir.
// - Aynı koşuda aynı test (test kimliği) yeniden koşarsa (retry) son deneme öncekinin yerini alır;
//   eski denemenin medya dosyaları çağırana "silinecekler" olarak döner.
// - Ürün: sonucun senaryosunun ekranı (senaryolar.ekran_id); senaryo eşleşmezse raporlayıcının
//   verdiği ürün adı ekran adıyla eşleştirilir; o da yoksa urun_adi düz metin olarak kalır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { randomUUID } from 'node:crypto';
import { DepoHatasi, yerelMakine } from './depo.mjs';
import { beklenenGorulenCikar, kalipCikar, kategoriBul } from '../sonuclar/siniflandirma.mjs';
import { kartlariHesapla, sayilariTopla, trendHesapla } from '../sonuclar/hesaplama.mjs';
import { siniflandirmaKurallari } from '../ayarlar/siniflandirma-kurallari.mjs';

/** @typedef {import('./baglanti.mjs').Veritabani} Veritabani */

export const SONUC_DURUMLARI = Object.freeze(['basarili', 'basarisiz', 'atlanan', 'durduruldu']);
export const KOSU_DURUMLARI = Object.freeze(['calisiyor', 'tamamlandi', 'durduruldu', 'zaman_asimi', 'hata']);
export const MEDYA_TURLERI = Object.freeze(['ekran_goruntusu', 'video', 'iz', 'diger']);
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const METIN_SINIRI = 64 * 1024;

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !KIMLIK.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {unknown} d @param {number} [sinir] */
const metin = (d, sinir = METIN_SINIRI) => (typeof d === 'string' && d !== '' ? d.slice(0, sinir) : null);
/** @param {unknown} d */
const tamSayi = (d) => (typeof d === 'number' && Number.isFinite(d) ? Math.max(0, Math.round(d)) : null);
/** @param {unknown} d */
const isoZaman = (d) => {
  if (typeof d !== 'string' && typeof d !== 'number') return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

/**
 * Koşuyu oluşturur ya da (aynı kimlikle; ör. platformun her senaryoyu ayrı süreçte koştuğu tam
 * koşu) günceller: tür 'tam' baskındır, başlangıç en erken, kapsam ilk verilen.
 * @param {Veritabani} vt
 * @param {{ id: string; projeId: string; ortamId?: string | null; tur: 'tam' | 'tekil'; kapsam?: string | null; baslangic?: string; kaynak?: string }} girdi
 */
export function kosuKaydet(vt, girdi) {
  const id = kimlik(girdi.id, 'kosuId');
  const tur = girdi.tur === 'tam' ? 'tam' : 'tekil';
  const baslangic = isoZaman(girdi.baslangic) ?? new Date().toISOString();
  return vt.islem(() => {
    const mevcut = vt.tek('SELECT id, tur, baslangic, kapsam FROM kosular WHERE id = ?', [id]);
    if (!mevcut) {
      const makine = yerelMakine(vt);
      vt.calistir(
        `INSERT INTO kosular (id, proje_id, ortam_id, makine_id, tur, durum, baslangic, ozet_json, kapsam, kaynak)
         VALUES (?, ?, ?, ?, ?, 'calisiyor', ?, '{}', ?, ?)`,
        [id, kimlik(girdi.projeId, 'projeId'), girdi.ortamId ?? null, makine.id, tur, baslangic,
          tur === 'tam' ? metin(girdi.kapsam, 200) ?? 'Genel' : null, girdi.kaynak ?? 'raporlayici']
      );
      return id;
    }
    const yeniTur = mevcut.tur === 'tam' || tur === 'tam' ? 'tam' : 'tekil';
    vt.calistir('UPDATE kosular SET tur = ?, baslangic = ?, kapsam = ?, durum = ? WHERE id = ?', [
      yeniTur, String(mevcut.baslangic) < baslangic ? mevcut.baslangic : baslangic,
      yeniTur === 'tam' ? (mevcut.kapsam ?? metin(girdi.kapsam, 200) ?? 'Genel') : null, 'calisiyor', id
    ]);
    return id;
  });
}

/**
 * Koşuyu bitirir: bitiş (varsa sonrakiyle en geç olanı), durum ve sonuçlardan hesaplanan özet.
 * @param {Veritabani} vt @param {string} id @param {{ durum: string; bitis?: string }} girdi
 */
export function kosuyuBitir(vt, id, girdi) {
  if (!KOSU_DURUMLARI.includes(girdi.durum)) throw new DepoHatasi('Geçersiz koşu durumu.');
  const bitis = isoZaman(girdi.bitis) ?? new Date().toISOString();
  vt.islem(() => {
    const mevcut = vt.tek('SELECT bitis FROM kosular WHERE id = ?', [id]);
    if (!mevcut) return;
    const yeniBitis = mevcut.bitis && String(mevcut.bitis) > bitis ? mevcut.bitis : bitis;
    vt.calistir('UPDATE kosular SET durum = ?, bitis = ?, ozet_json = ? WHERE id = ?', [
      girdi.durum, yeniBitis, JSON.stringify(kosuOzetiHesapla(vt, id)), id
    ]);
  });
}

/** @param {Veritabani} vt @param {string} kosuId */
function kosuOzetiHesapla(vt, kosuId) {
  const ozet = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
  for (const s of vt.tumu('SELECT durum, COUNT(*) AS n FROM kosu_sonuclari WHERE kosu_id = ? GROUP BY durum', [kosuId])) {
    if (String(s.durum) in ozet) ozet[/** @type {keyof typeof ozet} */ (String(s.durum))] = Number(s.n);
  }
  return ozet;
}

/**
 * @typedef {{
 *   id?: string; kosuId: string; projeId: string; testKimligi?: string | null; senaryoAnahtari?: string | null;
 *   senaryoId?: string | null; senaryoBaslik: string; urunAdi?: string | null; durum: string; hamDurum?: string | null;
 *   sureMs?: number | null; hataMesaji?: string | null; beklenenSonuc?: string | null;
 *   atlananAlanlar?: Array<{ alan: string; neden?: string | null }>; deneme?: number; baslangic?: string | null; bitis?: string | null;
 *   adimlar?: Array<{ ad: string; durum: string; sureMs?: number | null; hataMesaji?: string | null }>;
 *   medya?: Array<{ id?: string; tur: string; ad: string; icerikTuru: string; boyut: number; dosya: string; olusturulma?: string }>;
 * }} SonucGirdisi
 */

/**
 * Test sonucunu (adımları ve medya üst bilgisiyle) TEK işlemde yazar. Aynı koşu + test kimliği
 * zaten varsa (retry) eski satır ve bağlı adım/medya satırları silinir.
 * @param {Veritabani} vt @param {SonucGirdisi} g
 * @returns {{ id: string; silinecekMedyaDosyalari: string[] }}
 */
export function sonucKaydet(vt, g) {
  const kosuId = kimlik(g.kosuId, 'kosuId');
  const projeId = kimlik(g.projeId, 'projeId');
  if (!SONUC_DURUMLARI.includes(g.durum)) throw new DepoHatasi('Geçersiz sonuç durumu.');
  const baslik = metin(g.senaryoBaslik, 1000);
  if (!baslik) throw new DepoHatasi('"senaryoBaslik" boş olamaz.');
  return vt.islem(() => {
    if (!vt.tek('SELECT 1 AS v FROM kosular WHERE id = ?', [kosuId])) throw new DepoHatasi('Koşu bulunamadı.');
    /** @type {string[]} */
    const silinecekMedyaDosyalari = [];
    const testKimligi = metin(g.testKimligi, 300);
    const oncekiler = testKimligi
      ? vt.tumu('SELECT id FROM kosu_sonuclari WHERE kosu_id = ? AND test_kimligi = ?', [kosuId, testKimligi])
      : [];
    const id = g.id ? kimlik(g.id, 'id') : randomUUID();
    for (const o of [...oncekiler, ...(g.id ? [{ id }] : [])]) {
      for (const m of vt.tumu('SELECT dosya FROM medya WHERE sonuc_id = ?', [o.id])) silinecekMedyaDosyalari.push(String(m.dosya));
      vt.calistir('DELETE FROM kosu_sonuclari WHERE id = ?', [o.id]);
    }
    const anahtar = metin(g.senaryoAnahtari, 2000);
    let senaryoId = g.senaryoId && KIMLIK.test(g.senaryoId) && vt.tek('SELECT 1 AS v FROM senaryolar WHERE id = ?', [g.senaryoId]) ? g.senaryoId : null;
    if (!senaryoId && anahtar) {
      const esleme = vt.tek(
        "SELECT varlik_id FROM kaynak_eslemeleri WHERE proje_id = ? AND varlik_turu = 'senaryo' AND kaynak_anahtari = ?", [projeId, anahtar]
      );
      if (esleme && vt.tek('SELECT 1 AS v FROM senaryolar WHERE id = ?', [esleme.varlik_id])) senaryoId = String(esleme.varlik_id);
    }
    let ekranId = senaryoId ? /** @type {string | null} */ (vt.tek('SELECT ekran_id FROM senaryolar WHERE id = ?', [senaryoId])?.ekran_id ?? null) : null;
    const urunAdi = metin(g.urunAdi, 200);
    if (!ekranId && urunAdi) {
      ekranId = /** @type {string | null} */ (vt.tek("SELECT id FROM ekranlar WHERE proje_id = ? AND ad = ? ORDER BY (durum = 'silindi'), rowid", [projeId, urunAdi])?.id ?? null);
    }
    const hata = metin(g.hataMesaji);
    const basarisiz = g.durum === 'basarisiz';
    const atlanan = Array.isArray(g.atlananAlanlar)
      ? g.atlananAlanlar.filter((a) => a && typeof a.alan === 'string' && a.alan).slice(0, 500)
        .map((a) => ({ alan: a.alan.slice(0, 300), ...(typeof a.neden === 'string' && a.neden ? { neden: a.neden.slice(0, 1000) } : {}) }))
      : [];
    vt.calistir(
      `INSERT INTO kosu_sonuclari (id, kosu_id, senaryo_id, senaryo_baslik, durum, sure_ms, hata_mesaji, ekler_json, baslangic, bitis,
         test_kimligi, senaryo_anahtari, ekran_id, urun_adi, ham_durum, hata_kategorisi, hata_kalibi, beklenen_sonuc, atlanan_alanlar_json, deneme)
       VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, kosuId, senaryoId, baslik, g.durum, tamSayi(g.sureMs), hata, isoZaman(g.baslangic), isoZaman(g.bitis) ?? new Date().toISOString(),
        testKimligi, anahtar, ekranId, urunAdi, metin(g.hamDurum, 40), basarisiz ? kategoriBul(hata ?? '', siniflandirmaKurallari(vt)) : null,
        basarisiz ? kalipCikar(hata ?? '') : null, metin(g.beklenenSonuc, 2000), JSON.stringify(atlanan), tamSayi(g.deneme) ?? 0]
    );
    (g.adimlar ?? []).slice(0, 1000).forEach((a, sira) => {
      const ad = metin(a?.ad, 1000);
      if (!ad || !SONUC_DURUMLARI.includes(a.durum)) return;
      vt.calistir('INSERT INTO adim_sonuclari (id, sonuc_id, sira, ad, durum, sure_ms, hata_mesaji) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        randomUUID(), id, sira, ad, a.durum, tamSayi(a.sureMs), metin(a.hataMesaji)
      ]);
    });
    (g.medya ?? []).slice(0, 500).forEach((m, sira) => {
      if (!MEDYA_TURLERI.includes(m?.tur) || !/^[a-f0-9]{32}\.medya$/.test(String(m.dosya))) throw new DepoHatasi('Geçersiz medya kaydı.');
      vt.calistir(
        'INSERT INTO medya (id, sonuc_id, sira, tur, ad, icerik_turu, boyut, dosya, olusturulma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [m.id && KIMLIK.test(m.id) ? m.id : randomUUID(), id, sira, m.tur, metin(m.ad, 300) ?? m.tur,
          metin(m.icerikTuru, 100) ?? 'application/octet-stream', tamSayi(m.boyut) ?? 0, m.dosya, isoZaman(m.olusturulma) ?? new Date().toISOString()]
      );
    });
    return { id, silinecekMedyaDosyalari };
  });
}

// ---------------------------------------------------------------------------------------
// Okuma (Sonuçlar ekranı)
// ---------------------------------------------------------------------------------------

/** Ürün anahtarı: ekran kimliği; ekranı olmayan sonuçlarda "ad:<ürün adı>". @param {Record<string, unknown>} s */
const urunAnahtari = (s) => (s.ekran_id ? String(s.ekran_id) : `ad:${s.urun_adi ? String(s.urun_adi) : 'Diğer'}`);

/**
 * Projenin koşuları (kronolojik, en eski önce) + ürün bazında sayılar.
 * @param {Veritabani} vt @param {string} projeId
 */
export function kosulariHesapIcinOku(vt, projeId) {
  const kosular = vt.tumu(
    'SELECT id, tur, kapsam, durum, baslangic, bitis, kaynak, ortam_id FROM kosular WHERE proje_id = ? ORDER BY COALESCE(bitis, baslangic), baslangic',
    [projeId]
  );
  /** @type {Map<string, Record<string, Record<string, number>>>} */
  const sayilar = new Map();
  for (const s of vt.tumu(
    `SELECT r.kosu_id, r.ekran_id, r.urun_adi, r.durum, COUNT(*) AS n FROM kosu_sonuclari r
       JOIN kosular k ON k.id = r.kosu_id WHERE k.proje_id = ? GROUP BY r.kosu_id, r.ekran_id, r.urun_adi, r.durum`, [projeId]
  )) {
    const kosu = sayilar.get(String(s.kosu_id)) ?? {};
    sayilar.set(String(s.kosu_id), kosu);
    const u = (kosu[urunAnahtari(s)] ??= { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 });
    u[String(s.durum)] = (u[String(s.durum)] ?? 0) + Number(s.n);
  }
  return kosular.map((k) => ({
    id: String(k.id), tur: String(k.tur), kapsam: k.kapsam == null ? null : String(k.kapsam), durum: String(k.durum),
    baslangic: String(k.baslangic), bitis: k.bitis == null ? null : String(k.bitis), kaynak: String(k.kaynak ?? 'raporlayici'),
    ortamId: k.ortam_id == null ? null : String(k.ortam_id),
    z: new Date(String(k.bitis ?? k.baslangic)).getTime(),
    urunler: /** @type {Record<string, import('../sonuclar/hesaplama.mjs').Sayilar>} */ (sayilar.get(String(k.id)) ?? {})
  }));
}

/**
 * Sonuçlar ekranının üst bölümü: ürün listesi, kartlar (Genel ya da ürün), trend, koşu geçmişi.
 * @param {Veritabani} vt @param {string} projeId @param {{ urun?: string | null }} [secim] urun: ekran kimliği ya da "ad:<ad>"
 */
export function sonucOzeti(vt, projeId, secim = {}) {
  const urun = secim.urun || null;
  const kosular = kosulariHesapIcinOku(vt, projeId);
  const kartlar = kartlariHesapla(kosular);
  const ekranlar = vt.tumu(
    `SELECT e.id, e.ad, e.durum, (SELECT COUNT(*) FROM senaryolar s WHERE s.ekran_id = e.id) AS senaryo_sayisi
       FROM ekranlar e WHERE e.proje_id = ? ORDER BY (e.sira IS NULL), e.sira, e.ad`, [projeId]
  ).map((e) => ({
    anahtar: String(e.id), ad: String(e.ad), senaryoSayisi: Number(e.senaryo_sayisi),
    // 'devre_disi' / 'silindi' (mezar taşı): sonuçlar görünür kalır, arayüz rozet gösterir.
    ekranDurumu: /** @type {string | null} */ (e.durum == null ? null : String(e.durum)),
    son: /** @type {import('../sonuclar/hesaplama.mjs').Sayilar | null} */ (null)
  }));
  // Ekranı olmayan sonuç ürünleri (ör. eşleşmeyen eski sonuçlar) de listede görünür.
  const bilinen = new Set(ekranlar.map((e) => e.anahtar));
  for (const k of kosular) {
    for (const a of Object.keys(k.urunler)) {
      if (!bilinen.has(a)) { bilinen.add(a); ekranlar.push({ anahtar: a, ad: a.slice(3), senaryoSayisi: 0, ekranDurumu: null, son: null }); }
    }
  }
  // Sol listedeki sağlık noktası için: her ürünün son tam koşusundaki sayılar (yoksa null).
  for (const e of ekranlar) {
    const k = kartlar.urunler[e.anahtar];
    e.son = k ? sayilariTopla([k.son]) : null;
  }
  const secilenKosular = urun ? kosular.filter((k) => k.urunler[urun]) : kosular;
  const gecmis = secilenKosular.slice().reverse().map((k) => ({
    id: k.id, tur: k.tur, kapsam: k.tur === 'tam' ? k.kapsam ?? 'Genel' : null, durum: k.durum, baslangic: k.baslangic, bitis: k.bitis,
    kaynak: k.kaynak, ...sayilariTopla(urun ? [k.urunler[urun]] : Object.values(k.urunler)),
    urunSayisi: Object.keys(k.urunler).length
  }));
  return {
    // Silinmiş ekran (mezar taşı) yalnızca sonucu varsa listelenir.
    ekranlar: ekranlar.filter((e) => e.ekranDurumu !== 'silindi' || kosular.some((k) => k.urunler[e.anahtar])),
    kart: urun ? kartlar.urunler[urun] ?? null : kartlar.genel,
    trend: trendHesapla(kosular, urun),
    kosuGecmisi: gecmis
  };
}

/** @param {Veritabani} vt @param {string} kosuId */
export function kosuDetayi(vt, kosuId) {
  const k = vt.tek('SELECT id, proje_id, ortam_id, tur, kapsam, durum, baslangic, bitis, kaynak FROM kosular WHERE id = ?', [kosuId]);
  if (!k) return null;
  const sonuclar = vt.tumu(
    `SELECT r.id, r.senaryo_id, r.senaryo_baslik, r.senaryo_anahtari, r.durum, r.ham_durum, r.sure_ms, r.hata_kategorisi, r.hata_kalibi,
            r.ekran_id, r.urun_adi, e.ad AS ekran_adi, e.durum AS ekran_durumu, r.baslangic, r.bitis, r.deneme,
            (SELECT COUNT(*) FROM medya m WHERE m.sonuc_id = r.id AND m.tur = 'ekran_goruntusu') AS ekran_goruntusu_sayisi,
            (SELECT COUNT(*) FROM medya m WHERE m.sonuc_id = r.id AND m.tur = 'video' AND m.silinme IS NULL) AS video_sayisi
       FROM kosu_sonuclari r LEFT JOIN ekranlar e ON e.id = r.ekran_id WHERE r.kosu_id = ? ORDER BY r.rowid`, [kosuId]
  ).map((s) => ({
    id: String(s.id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id),
    senaryoBaslik: String(s.senaryo_baslik), senaryoAnahtari: s.senaryo_anahtari == null ? null : String(s.senaryo_anahtari),
    durum: String(s.durum), hamDurum: s.ham_durum == null ? null : String(s.ham_durum), sureMs: s.sure_ms == null ? null : Number(s.sure_ms),
    hataKategorisi: s.hata_kategorisi == null ? null : String(s.hata_kategorisi), hataKalibi: s.hata_kalibi == null ? null : String(s.hata_kalibi),
    urun: s.ekran_adi != null ? String(s.ekran_adi) : s.urun_adi != null ? String(s.urun_adi) : 'Diğer', urunAnahtari: urunAnahtari(s),
    ekranDurumu: s.ekran_durumu == null ? null : String(s.ekran_durumu),
    baslangic: s.baslangic == null ? null : String(s.baslangic), bitis: s.bitis == null ? null : String(s.bitis), deneme: Number(s.deneme ?? 0),
    ekranGoruntusuSayisi: Number(s.ekran_goruntusu_sayisi), videoSayisi: Number(s.video_sayisi)
  }));
  const sira = { basarisiz: 0, durduruldu: 1, atlanan: 2, basarili: 3 };
  sonuclar.sort((a, b) => (sira[/** @type {keyof typeof sira} */ (a.durum)] ?? 9) - (sira[/** @type {keyof typeof sira} */ (b.durum)] ?? 9)
    || a.urun.localeCompare(b.urun, 'tr') || a.senaryoBaslik.localeCompare(b.senaryoBaslik, 'tr'));
  return {
    kosu: {
      id: String(k.id), projeId: k.proje_id == null ? null : String(k.proje_id), ortamId: k.ortam_id == null ? null : String(k.ortam_id),
      tur: String(k.tur), kapsam: k.kapsam == null ? null : String(k.kapsam), durum: String(k.durum), baslangic: String(k.baslangic),
      bitis: k.bitis == null ? null : String(k.bitis), kaynak: String(k.kaynak ?? 'raporlayici'),
      ...sayilariTopla([kosuOzetiHesapla(vt, kosuId)])
    },
    sonuclar
  };
}

/** @param {Record<string, unknown>} m */
const medyaGorunumu = (m) => ({
  id: String(m.id), tur: String(m.tur), ad: String(m.ad), icerikTuru: String(m.icerik_turu), boyut: Number(m.boyut),
  olusturulma: String(m.olusturulma), silinme: m.silinme == null ? null : String(m.silinme),
  // Başka makineden yedekle gelen ve dosyası yedeğe dahil edilmemiş medya (şema v6).
  yedekDisi: Number(m.yedek_disi ?? 0) === 1
});

/** @param {Veritabani} vt @param {string} sonucId */
export function sonucDetayi(vt, sonucId) {
  const s = vt.tek(
    `SELECT r.*, e.ad AS ekran_adi, e.durum AS ekran_durumu, k.tur AS kosu_turu, k.kapsam AS kosu_kapsami, k.proje_id AS proje_id
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id LEFT JOIN ekranlar e ON e.id = r.ekran_id WHERE r.id = ?`, [sonucId]
  );
  if (!s) return null;
  /** @type {Array<{ alan: string; neden?: string }>} */
  let atlanan = [];
  try { atlanan = JSON.parse(String(s.atlanan_alanlar_json ?? '[]')); } catch { atlanan = []; }
  return {
    id: String(s.id), kosuId: String(s.kosu_id), projeId: String(s.proje_id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id),
    senaryoBaslik: String(s.senaryo_baslik), senaryoAnahtari: s.senaryo_anahtari == null ? null : String(s.senaryo_anahtari),
    urun: s.ekran_adi != null ? String(s.ekran_adi) : s.urun_adi != null ? String(s.urun_adi) : 'Diğer',
    ekranDurumu: s.ekran_durumu == null ? null : String(s.ekran_durumu),
    durum: String(s.durum), hamDurum: s.ham_durum == null ? null : String(s.ham_durum), sureMs: s.sure_ms == null ? null : Number(s.sure_ms),
    hataMesaji: s.hata_mesaji == null ? null : String(s.hata_mesaji), hataKategorisi: s.hata_kategorisi == null ? null : String(s.hata_kategorisi),
    hataKalibi: s.hata_kalibi == null ? null : String(s.hata_kalibi), beklenenSonuc: s.beklenen_sonuc == null ? null : String(s.beklenen_sonuc),
    beklenenGorulen: beklenenGorulenCikar(s.hata_mesaji == null ? null : String(s.hata_mesaji)),
    atlananAlanlar: Array.isArray(atlanan) ? atlanan : [], deneme: Number(s.deneme ?? 0),
    baslangic: s.baslangic == null ? null : String(s.baslangic), bitis: s.bitis == null ? null : String(s.bitis),
    kosuTuru: String(s.kosu_turu), kosuKapsami: s.kosu_kapsami == null ? null : String(s.kosu_kapsami),
    adimlar: vt.tumu('SELECT ad, durum, sure_ms, hata_mesaji FROM adim_sonuclari WHERE sonuc_id = ? ORDER BY sira', [sonucId]).map((a) => ({
      ad: String(a.ad), durum: String(a.durum), sureMs: a.sure_ms == null ? null : Number(a.sure_ms), hataMesaji: a.hata_mesaji == null ? null : String(a.hata_mesaji)
    })),
    medya: vt.tumu('SELECT * FROM medya WHERE sonuc_id = ? ORDER BY sira, rowid', [sonucId]).map(medyaGorunumu)
  };
}

/**
 * Hata kalıpları: tarih aralığındaki BAŞARISIZ sonuçlar (ürün, kategori, kalıp) üçlüsüne göre
 * sayılır; her kalıp için en yeni örnek (ekran görüntüsü olan tercih edilir) ve hatanın alındığı testler (en yeniden eskiye,
 * en çok 100: sonuç, koşu, senaryo, ortam, hatanın alındığı adım, zaman) döner.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ urun?: string | null; baslangic?: string | null; bitis?: string | null; limit?: number }} [filtre]
 */
export function hataKaliplari(vt, projeId, filtre = {}) {
  const kosullar = ["k.proje_id = ?", "r.durum = 'basarisiz'"];
  /** @type {unknown[]} */
  const p = [projeId];
  const bas = isoZaman(filtre.baslangic);
  const bit = isoZaman(filtre.bitis);
  if (bas) { kosullar.push('COALESCE(r.bitis, k.bitis, k.baslangic) >= ?'); p.push(bas); }
  if (bit) { kosullar.push('COALESCE(r.bitis, k.bitis, k.baslangic) <= ?'); p.push(bit); }
  if (filtre.urun) {
    if (filtre.urun.startsWith('ad:')) { kosullar.push('r.ekran_id IS NULL AND COALESCE(r.urun_adi, \'Diğer\') = ?'); p.push(filtre.urun.slice(3)); }
    else { kosullar.push('r.ekran_id = ?'); p.push(filtre.urun); }
  }
  const satirlar = vt.tumu(
    `SELECT r.id, r.ekran_id, r.urun_adi, e.ad AS ekran_adi, r.hata_kategorisi, r.hata_kalibi, r.senaryo_baslik,
            r.kosu_id, r.senaryo_id, k.ortam_id, COALESCE(r.bitis, k.bitis, k.baslangic) AS zaman,
            (SELECT a.ad FROM adim_sonuclari a WHERE a.sonuc_id = r.id AND a.durum = 'basarisiz' ORDER BY a.sira LIMIT 1) AS basarisiz_adim,
            (SELECT COUNT(*) FROM medya m WHERE m.sonuc_id = r.id AND m.tur = 'ekran_goruntusu') AS gorsel
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id LEFT JOIN ekranlar e ON e.id = r.ekran_id
      WHERE ${kosullar.join(' AND ')} ORDER BY zaman`, p
  );
  /** @typedef {{ sonucId: string; kosuId: string; senaryoId: string | null; senaryoBaslik: string; ortamId: string | null; adim: string | null; zaman: string }} KalipSonucu */
  /** @type {Map<string, { urun: string; kategori: string; kalip: string; sayi: number; senaryolar: Set<string>; ilk: string; son: string; ornekId: string; ornekGorselli: boolean; sonuclar: KalipSonucu[] }>} */
  const gruplar = new Map();
  for (const s of satirlar) {
    const urun = s.ekran_adi != null ? String(s.ekran_adi) : s.urun_adi != null ? String(s.urun_adi) : 'Diğer';
    const kategori = String(s.hata_kategorisi ?? 'Diğer / Sınıflandırılamadı');
    const kalip = String(s.hata_kalibi ?? 'Mesaj yok / boş hata');
    const anahtar = `${urun}\u0000${kategori}\u0000${kalip}`;
    const g = gruplar.get(anahtar) ?? { urun, kategori, kalip, sayi: 0, senaryolar: new Set(), ilk: String(s.zaman), son: String(s.zaman), ornekId: String(s.id), ornekGorselli: false, sonuclar: [] };
    gruplar.set(anahtar, g);
    g.sayi++;
    g.senaryolar.add(String(s.senaryo_baslik));
    g.sonuclar.push({
      sonucId: String(s.id), kosuId: String(s.kosu_id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id), senaryoBaslik: String(s.senaryo_baslik),
      ortamId: s.ortam_id == null ? null : String(s.ortam_id), adim: s.basarisiz_adim == null ? null : String(s.basarisiz_adim), zaman: String(s.zaman)
    });
    g.son = String(s.zaman);
    const gorselli = Number(s.gorsel) > 0;
    if (gorselli || !g.ornekGorselli) { g.ornekId = String(s.id); g.ornekGorselli = gorselli; }
  }
  const kaliplar = [...gruplar.values()]
    .map((g) => ({ urun: g.urun, kategori: g.kategori, kalip: g.kalip, sayi: g.sayi, senaryoSayisi: g.senaryolar.size, ilk: g.ilk, son: g.son, ornekSonucId: g.ornekId,
      sonuclar: g.sonuclar.slice(-100).reverse() }))
    .sort((a, b) => b.sayi - a.sayi || b.son.localeCompare(a.son));
  /** @type {Record<string, number>} */
  const kategoriler = {};
  for (const k of kaliplar) kategoriler[k.kategori] = (kategoriler[k.kategori] ?? 0) + k.sayi;
  return { toplam: satirlar.length, kategoriler, kaliplar: kaliplar.slice(0, Math.max(1, Math.min(filtre.limit ?? 200, 1000))) };
}

/** Medya satırı (+ indirme adı için senaryo başlığı ve zaman). @param {Veritabani} vt @param {string} id */
export function medyaGetir(vt, id) {
  const m = vt.tek(
    `SELECT m.*, r.senaryo_baslik, COALESCE(r.bitis, k.bitis, k.baslangic) AS sonuc_zamani
       FROM medya m LEFT JOIN kosu_sonuclari r ON r.id = m.sonuc_id LEFT JOIN kosular k ON k.id = r.kosu_id WHERE m.id = ?`, [id]
  );
  if (!m) return null;
  return {
    ...medyaGorunumu(m), dosya: String(m.dosya),
    senaryoBaslik: m.senaryo_baslik == null ? null : String(m.senaryo_baslik), sonucZamani: m.sonuc_zamani == null ? null : String(m.sonuc_zamani)
  };
}

/**
 * Bir koşudaki (senaryo anahtarı/başlığına göre) en son sonucun özeti — test sunucusunun canlı
 * paneli koşu bitince bunu kullanır (son ekran görüntüsü + video medya kimlikleri).
 * @param {Veritabani} vt @param {string} kosuId @param {{ senaryoAnahtari?: string; senaryoBaslik?: string }} arama
 */
export function kosudakiSonucuBul(vt, kosuId, arama) {
  const s = arama.senaryoAnahtari
    ? vt.tek('SELECT id FROM kosu_sonuclari WHERE kosu_id = ? AND senaryo_anahtari = ? ORDER BY rowid DESC LIMIT 1', [kosuId, arama.senaryoAnahtari])
    : vt.tek('SELECT id FROM kosu_sonuclari WHERE kosu_id = ? AND senaryo_baslik = ? ORDER BY rowid DESC LIMIT 1', [kosuId, arama.senaryoBaslik ?? '']);
  if (!s) return null;
  const detay = sonucDetayi(vt, String(s.id));
  if (!detay) return null;
  const gorseller = detay.medya.filter((m) => m.tur === 'ekran_goruntusu');
  const video = detay.medya.find((m) => m.tur === 'video' && !m.silinme);
  const basarisizAdim = detay.adimlar.find((a) => a.durum === 'basarisiz')?.ad ?? null;
  return { detay, sonEkranGoruntusuId: gorseller.length ? gorseller[gorseller.length - 1].id : null, videoId: video?.id ?? null, basarisizAdim };
}

/**
 * Sonuç saklama (Ayarlar > Yedekleme > Sonuç saklama): başlangıcı gun günden eski, bitmiş ekran koşularını (sonuçları, adımları,
 * medya satırları) ve servis / servis akışı koşularını siler. Medya DOSYALARI satırları silinince sahipsiz kalır; günlük medya
 * temizliği (medyaSaklamaTemizligi) onları siler. gun <= 0: hiçbir şey silinmez.
 * @param {Veritabani} vt @param {number} gun @param {{ simdi?: number }} [s]
 * @returns {{ kosu: number; sonuc: number; servisKosusu: number; akisKosusu: number }}
 */
export function eskiSonuclariSil(vt, gun, s = {}) {
  const bos = { kosu: 0, sonuc: 0, servisKosusu: 0, akisKosusu: 0 };
  if (!Number.isFinite(gun) || gun <= 0) return bos;
  const esik = new Date((s.simdi ?? Date.now()) - gun * 24 * 60 * 60 * 1000).toISOString();
  return vt.islem(() => {
    const kosular = vt.tumu("SELECT id FROM kosular WHERE baslangic < ? AND durum != 'calisiyor'", [esik]).map((r) => String(r.id));
    let sonuc = 0;
    for (let i = 0; i < kosular.length; i += 200) {
      const parca = kosular.slice(i, i + 200);
      const yer = parca.map(() => '?').join(', ');
      const sonuclar = vt.tumu(`SELECT id FROM kosu_sonuclari WHERE kosu_id IN (${yer})`, parca).map((r) => String(r.id));
      for (let j = 0; j < sonuclar.length; j += 200) {
        const sp = sonuclar.slice(j, j + 200);
        const y2 = sp.map(() => '?').join(', ');
        vt.calistir(`DELETE FROM medya WHERE sonuc_id IN (${y2})`, sp);
        vt.calistir(`DELETE FROM adim_sonuclari WHERE sonuc_id IN (${y2})`, sp);
        vt.calistir(`DELETE FROM kosu_sonuclari WHERE id IN (${y2})`, sp);
      }
      sonuc += sonuclar.length;
      vt.calistir(`DELETE FROM kosular WHERE id IN (${yer})`, parca);
    }
    const servisKosusu = Number(vt.tek('SELECT COUNT(*) AS n FROM servis_kosulari WHERE baslangic < ?', [esik])?.n ?? 0);
    vt.calistir('DELETE FROM servis_kosulari WHERE baslangic < ?', [esik]);
    const akisKosusu = Number(vt.tek('SELECT COUNT(*) AS n FROM servis_akis_kosulari WHERE baslangic < ?', [esik])?.n ?? 0);
    vt.calistir('DELETE FROM servis_akis_kosulari WHERE baslangic < ?', [esik]);
    return { kosu: kosular.length, sonuc, servisKosusu, akisKosusu };
  });
}
