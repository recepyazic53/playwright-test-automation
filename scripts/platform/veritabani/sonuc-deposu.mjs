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
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { YAKALAMA_KAYNAKLARI, yakalananMesajlariAyristir, yakalananMetniMaskele } from '../sonuclar/yakalanan-mesajlar.mjs';
import { uygulamaSurumuTemizle } from '../ayarlar/rapor-verileri.mjs';
import { OLAY_DURUMLARI, kurtarmaSutunuYaz } from '../ayarlar/kurtarma-kurallari.mjs';

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

/** @param {unknown} d */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** Koşunun özetindeki "Tekrar: <önceki koşu>" bağı (ozet_json.tekrarKaynagi; şema göçü yok). @param {unknown} ozetJson @returns {string | null} */
const tekrarKaynagiOku = (ozetJson) => {
  try {
    const o = JSON.parse(String(ozetJson ?? '{}'));
    return nesneMi(o) && typeof o.tekrarKaynagi === 'string' && KIMLIK.test(o.tekrarKaynagi) ? o.tekrarKaynagi : null;
  } catch {
    return null;
  }
};
/**
 * Koşunun özetindeki uygulama sürümü etiketi (ozet_json.uygulamaSurumu; PDF rapor A4 — koşu başlatılırken girilen ya da ortam ayarındaki
 * sürüm; şema göçü yok). @param {unknown} ozetJson @returns {string | null}
 */
export const uygulamaSurumuOku = (ozetJson) => {
  try {
    const o = JSON.parse(String(ozetJson ?? '{}'));
    return nesneMi(o) ? uygulamaSurumuTemizle(o.uygulamaSurumu) : null;
  } catch {
    return null;
  }
};
/** Özet JSON'unun kalıcı ekleri (tekrar bağı, uygulama sürümü). @param {unknown} ozetJson */
const ozetEkleri = (ozetJson) => {
  const tekrarKaynagi = tekrarKaynagiOku(ozetJson);
  const uygulamaSurumu = uygulamaSurumuOku(ozetJson);
  return { ...(tekrarKaynagi ? { tekrarKaynagi } : {}), ...(uygulamaSurumu ? { uygulamaSurumu } : {}) };
};

/**
 * Sonucun veri koşusu bilgisi (raporlayıcı "veriKosusu" annotation'ı): hangi tablo satırlarıyla (açık sütunlar; gizli sütunun yalnız
 * adı) ve hangi model sürümüyle koştu; veri koşusunun anahtarı / adı. ekler_json'a yazılır (şema göçü yok). Geçersizse null.
 * @param {unknown} v
 */
export function veriKosusuTemizle(v) {
  if (!nesneMi(v)) return null;
  const o = /** @type {Record<string, unknown>} */ (v);
  const kisa = (/** @type {unknown} */ x, /** @type {number} */ n) => (typeof x === 'string' && x ? x.slice(0, n) : null);
  const satirlar = (Array.isArray(o.satirlar) ? o.satirlar : []).filter(nesneMi).slice(0, 50).map((s) => {
    const x = /** @type {Record<string, unknown>} */ (s);
    const degerler = nesneMi(x.degerler) ? Object.fromEntries(Object.entries(/** @type {Record<string, unknown>} */ (x.degerler)).slice(0, 40)
      .map(([a, d]) => [a.slice(0, 60), d === null || d === undefined ? null : String(d).slice(0, 500)])) : {};
    return {
      grup: kisa(x.grup, 150) ?? '', tablo: kisa(x.tablo, 60) ?? '', ...(kisa(x.etiket, 40) ? { etiket: kisa(x.etiket, 40) } : {}),
      satirId: typeof x.satirId === 'string' && KIMLIK.test(x.satirId) ? x.satirId : '', satirAdi: kisa(x.satirAdi, 120) ?? '',
      ...(kisa(x.guncellenme, 40) ? { guncellenme: kisa(x.guncellenme, 40) } : {}), degerler,
      gizliSutunlar: (Array.isArray(x.gizliSutunlar) ? x.gizliSutunlar : []).filter((g) => typeof g === 'string').slice(0, 40).map((g) => g.slice(0, 60))
    };
  }).filter((s) => s.satirId && s.grup);
  const surum = typeof o.modelSurumu === 'number' && Number.isInteger(o.modelSurumu) && o.modelSurumu > 0 ? o.modelSurumu : null;
  return { anahtar: kisa(o.anahtar, 2000), ad: kisa(o.ad, 500), modelSurumu: surum, satirlar };
}
/** @param {unknown} eklerJson */
/**
 * Ekran sonucunun kurtarma notları (model koşucusu; kural adı, adım, durum, deneme, not): doğrulanır ve kırpılır. Geçersiz olay atlanır.
 * @param {unknown} v @returns {Array<{ kuralId: string; kural: string; adim: string | null; durum: string; deneme: number; not: string }>}
 */
export function kurtarmaNotlariTemizle(v) {
  return (Array.isArray(v) ? v : []).filter(nesneMi).slice(0, 50).map((x) => /** @type {Record<string, unknown>} */ (x))
    .filter((x) => typeof x.kuralId === 'string' && KIMLIK.test(x.kuralId) && OLAY_DURUMLARI.includes(/** @type {any} */ (x.durum)))
    .map((x) => ({
      kuralId: String(x.kuralId), kural: String(x.kural ?? '').slice(0, 120), adim: typeof x.adim === 'string' && x.adim ? x.adim.slice(0, 300) : null,
      durum: String(x.durum), deneme: Math.max(1, Math.min(100, Math.round(Number(x.deneme) || 1))), not: String(x.not ?? '').slice(0, 1000)
    }));
}

/** ekler_json'daki kurtarma notları (yoksa boş). @param {unknown} eklerJson */
const kurtarmaNotlariOku = (eklerJson) => {
  try {
    const e = JSON.parse(String(eklerJson ?? '{}'));
    return nesneMi(e) ? kurtarmaNotlariTemizle(e.kurtarma) : [];
  } catch {
    return [];
  }
};

const veriKosusuOku = (eklerJson) => {
  try {
    const e = JSON.parse(String(eklerJson ?? '{}'));
    return nesneMi(e) ? veriKosusuTemizle(e.veriKosusu) : null;
  } catch {
    return null;
  }
};

/**
 * Koşuyu oluşturur ya da (aynı kimlikle; ör. platformun her senaryoyu ayrı süreçte koştuğu tam
 * koşu) günceller: tür 'tam' baskındır, başlangıç en erken, kapsam ilk verilen.
 * tekrarKaynagi: başarısızları tekrar çalıştırmada önceki koşunun kimliği ("Tekrar: <önceki koşu>" bağı; özet JSON'unda saklanır).
 * uygulamaSurumu: test edilen uygulamanın sürümü (koşu başlatılırken girilen ya da ortam ayarındaki; özet JSON'unda saklanır; ilk
 * verilen kalır).
 * @param {Veritabani} vt
 * @param {{ id: string; projeId: string; ortamId?: string | null; tur: 'tam' | 'tekil'; kapsam?: string | null; baslangic?: string; kaynak?: string; tekrarKaynagi?: string | null;
 *   uygulamaSurumu?: string | null }} girdi
 */
export function kosuKaydet(vt, girdi) {
  const id = kimlik(girdi.id, 'kosuId');
  const tur = girdi.tur === 'tam' ? 'tam' : 'tekil';
  const baslangic = isoZaman(girdi.baslangic) ?? new Date().toISOString();
  const tekrarKaynagi = typeof girdi.tekrarKaynagi === 'string' && KIMLIK.test(girdi.tekrarKaynagi) && girdi.tekrarKaynagi !== id ? girdi.tekrarKaynagi : null;
  const uygulamaSurumu = uygulamaSurumuTemizle(girdi.uygulamaSurumu);
  return vt.islem(() => {
    const mevcut = vt.tek('SELECT id, tur, baslangic, kapsam, ozet_json FROM kosular WHERE id = ?', [id]);
    if (!mevcut) {
      const makine = yerelMakine(vt);
      const ek = { ...(tekrarKaynagi ? { tekrarKaynagi } : {}), ...(uygulamaSurumu ? { uygulamaSurumu } : {}) };
      vt.calistir(
        `INSERT INTO kosular (id, proje_id, ortam_id, makine_id, tur, durum, baslangic, ozet_json, kapsam, kaynak)
         VALUES (?, ?, ?, ?, ?, 'calisiyor', ?, ?, ?, ?)`,
        [id, kimlik(girdi.projeId, 'projeId'), girdi.ortamId ?? null, makine.id, tur, baslangic, Object.keys(ek).length ? JSON.stringify(ek) : '{}',
          tur === 'tam' ? metin(girdi.kapsam, 200) ?? 'Genel' : null, girdi.kaynak ?? 'raporlayici']
      );
      return id;
    }
    const yeniTur = mevcut.tur === 'tam' || tur === 'tam' ? 'tam' : 'tekil';
    vt.calistir('UPDATE kosular SET tur = ?, baslangic = ?, kapsam = ?, durum = ? WHERE id = ?', [
      yeniTur, String(mevcut.baslangic) < baslangic ? mevcut.baslangic : baslangic,
      yeniTur === 'tam' ? (mevcut.kapsam ?? metin(girdi.kapsam, 200) ?? 'Genel') : null, 'calisiyor', id
    ]);
    // Aynı kimlikle sonradan gelen parça (her senaryo ayrı süreçte): sürüm yalnız henüz yoksa eklenir.
    if (uygulamaSurumu && !uygulamaSurumuOku(mevcut.ozet_json)) {
      let o = {};
      try { const x = JSON.parse(String(mevcut.ozet_json ?? '{}')); o = nesneMi(x) ? x : {}; } catch { o = {}; }
      vt.calistir('UPDATE kosular SET ozet_json = ? WHERE id = ?', [JSON.stringify({ ...o, uygulamaSurumu }), id]);
    }
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
    const mevcut = vt.tek('SELECT bitis, ozet_json FROM kosular WHERE id = ?', [id]);
    if (!mevcut) return;
    const yeniBitis = mevcut.bitis && String(mevcut.bitis) > bitis ? mevcut.bitis : bitis;
    vt.calistir('UPDATE kosular SET durum = ?, bitis = ?, ozet_json = ? WHERE id = ?', [
      girdi.durum, yeniBitis, JSON.stringify({ ...kosuOzetiHesapla(vt, id), ...ozetEkleri(mevcut.ozet_json) }), id
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
 *   yakalananMesajlar?: Array<{ kaynak: string; metin: string; adim?: string | null; sayi?: number; ilk?: string; son?: string; beklenen?: boolean }>;
 *   veriKosusu?: unknown; kurtarma?: unknown;
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
    const senaryoId = g.senaryoId && KIMLIK.test(g.senaryoId) && vt.tek('SELECT 1 AS v FROM senaryolar WHERE id = ?', [g.senaryoId]) ? g.senaryoId : null;
    let ekranId = senaryoId ? /** @type {string | null} */ (vt.tek('SELECT ekran_id FROM senaryolar WHERE id = ?', [senaryoId])?.ekran_id ?? null) : null;
    const urunAdi = metin(g.urunAdi, 200);
    if (!ekranId && urunAdi) {
      ekranId = /** @type {string | null} */ (vt.tek("SELECT id FROM ekranlar WHERE proje_id = ? AND ad = ? ORDER BY (durum = 'silindi'), rowid", [projeId, urunAdi])?.id ?? null);
    }
    const hata = metin(g.hataMesaji);
    const basarisiz = g.durum === 'basarisiz';
    const veriKosusu = veriKosusuTemizle(g.veriKosusu);
    // Çalışan kurtarma kuralları: notlar ekler_json'da, sayaç kaydı (yalnız kimlik / durum / deneme) kurtarma_json'da.
    const kurtarma = kurtarmaNotlariTemizle(g.kurtarma);
    const ekler = { ...(veriKosusu ? { veriKosusu } : {}), ...(kurtarma.length ? { kurtarma } : {}) };
    const atlanan = Array.isArray(g.atlananAlanlar)
      ? g.atlananAlanlar.filter((a) => a && typeof a.alan === 'string' && a.alan).slice(0, 500)
        .map((a) => ({ alan: a.alan.slice(0, 300), ...(typeof a.neden === 'string' && a.neden ? { neden: a.neden.slice(0, 1000) } : {}) }))
      : [];
    vt.calistir(
      `INSERT INTO kosu_sonuclari (id, kosu_id, senaryo_id, senaryo_baslik, durum, sure_ms, hata_mesaji, ekler_json, baslangic, bitis,
         test_kimligi, senaryo_anahtari, ekran_id, urun_adi, ham_durum, hata_kategorisi, hata_kalibi, beklenen_sonuc, atlanan_alanlar_json, deneme, kurtarma_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, kosuId, senaryoId, baslik, g.durum, tamSayi(g.sureMs), hata, Object.keys(ekler).length ? JSON.stringify(ekler) : '{}',
        isoZaman(g.baslangic), isoZaman(g.bitis) ?? new Date().toISOString(),
        testKimligi, anahtar, ekranId, urunAdi, metin(g.hamDurum, 40), basarisiz ? kategoriBul(hata ?? '', siniflandirmaKurallari(vt)) : null,
        basarisiz ? kalipCikar(hata ?? '') : null, metin(g.beklenenSonuc, 2000), JSON.stringify(atlanan), tamSayi(g.deneme) ?? 0, kurtarmaSutunuYaz(kurtarma)]
    );
    (g.adimlar ?? []).slice(0, 1000).forEach((a, sira) => {
      const ad = metin(a?.ad, 1000);
      if (!ad || !SONUC_DURUMLARI.includes(a.durum)) return;
      vt.calistir('INSERT INTO adim_sonuclari (id, sonuc_id, sira, ad, durum, sure_ms, hata_mesaji) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        randomUUID(), id, sira, ad, a.durum, tamSayi(a.sureMs), metin(a.hataMesaji)
      ]);
    });
    // Koşuda yakalanan mesajlar (koşu sürecinde maskelenmiş); Ayarlar > Güvenlik > Maskeleme ek adlarıyla bir kez daha.
    const yakalanan = yakalananMesajlariAyristir(Array.isArray(g.yakalananMesajlar) ? g.yakalananMesajlar : []);
    if (yakalanan.length) {
      const ekAdlar = ekGizliAdlar(vt);
      yakalanan.forEach((m, sira) => {
        const metinM = yakalananMetniMaskele(m.metin, { ekAdlar });
        if (!metinM) return;
        vt.calistir(
          'INSERT INTO yakalanan_mesajlar (id, sonuc_id, sira, kaynak, metin, kalip, adim, sayi, beklenen, ilk, son) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [randomUUID(), id, sira, m.kaynak, metinM, kalipCikar(metinM), m.adim, m.sayi, m.beklenen ? 1 : 0, m.ilk, m.son]
        );
      });
    }
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
 * Tarih aralığı (baslangic / bitis, ISO) verilirse kartlar, trend ve koşu geçmişi yalnız aralıktaki koşulardan (bitiş zamanı;
 * sürüyorsa başlangıç) hesaplanır; sol listedeki sağlık noktası her zaman ürünün en son tam koşusundandır.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ urun?: string | null; baslangic?: string | null; bitis?: string | null }} [secim] urun: ekran kimliği ya da "ad:<ad>"
 */
export function sonucOzeti(vt, projeId, secim = {}) {
  const urun = secim.urun || null;
  const tumKosular = kosulariHesapIcinOku(vt, projeId);
  const tumKartlar = kartlariHesapla(tumKosular);
  const bas = secim.baslangic ? new Date(secim.baslangic).getTime() : null;
  const bit = secim.bitis ? new Date(secim.bitis).getTime() : null;
  const kosular = bas === null && bit === null ? tumKosular : tumKosular.filter((k) => (bas === null || k.z >= bas) && (bit === null || k.z <= bit));
  const kartlar = kosular === tumKosular ? tumKartlar : kartlariHesapla(kosular);
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
  for (const k of tumKosular) {
    for (const a of Object.keys(k.urunler)) {
      if (!bilinen.has(a)) { bilinen.add(a); ekranlar.push({ anahtar: a, ad: a.slice(3), senaryoSayisi: 0, ekranDurumu: null, son: null }); }
    }
  }
  // Sol listedeki sağlık noktası için: her ürünün son tam koşusundaki sayılar (yoksa null).
  for (const e of ekranlar) {
    const k = tumKartlar.urunler[e.anahtar];
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
    ekranlar: ekranlar.filter((e) => e.ekranDurumu !== 'silindi' || tumKosular.some((k) => k.urunler[e.anahtar])),
    kart: urun ? kartlar.urunler[urun] ?? null : kartlar.genel,
    trend: trendHesapla(kosular, urun),
    kosuGecmisi: gecmis
  };
}

/** @param {Veritabani} vt @param {string} kosuId */
export function kosuDetayi(vt, kosuId) {
  const k = vt.tek('SELECT id, proje_id, ortam_id, tur, kapsam, durum, baslangic, bitis, kaynak, ozet_json FROM kosular WHERE id = ?', [kosuId]);
  if (!k) return null;
  const sonuclar = vt.tumu(
    `SELECT r.id, r.senaryo_id, r.senaryo_baslik, r.senaryo_anahtari, r.durum, r.ham_durum, r.sure_ms, r.hata_kategorisi, r.hata_kalibi,
            r.ekran_id, r.urun_adi, e.ad AS ekran_adi, e.durum AS ekran_durumu, r.baslangic, r.bitis, r.deneme, r.ekler_json,
            (SELECT COUNT(*) FROM medya m WHERE m.sonuc_id = r.id AND m.tur = 'ekran_goruntusu' AND m.silinme IS NULL) AS ekran_goruntusu_sayisi,
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
    ekranGoruntusuSayisi: Number(s.ekran_goruntusu_sayisi), videoSayisi: Number(s.video_sayisi),
    // Çalışan kurtarma kurallarının notları (kurtarılan test başarılı sayılır; not görünür kalır).
    kurtarma: kurtarmaNotlariOku(s.ekler_json),
    // Veri koşusu (tablodan çoklu satır): anahtar / ad ve kullanılan satırlar; tek satırlı koşuda anahtar null.
    veriKosusu: veriKosusuOku(s.ekler_json)
  }));
  const sira = { basarisiz: 0, durduruldu: 1, atlanan: 2, basarili: 3 };
  sonuclar.sort((a, b) => (sira[/** @type {keyof typeof sira} */ (a.durum)] ?? 9) - (sira[/** @type {keyof typeof sira} */ (b.durum)] ?? 9)
    || a.urun.localeCompare(b.urun, 'tr') || a.senaryoBaslik.localeCompare(b.senaryoBaslik, 'tr'));
  const tekrarKaynagi = tekrarKaynagiOku(k.ozet_json);
  const kaynak = tekrarKaynagi ? vt.tek('SELECT id, baslangic, bitis FROM kosular WHERE id = ?', [tekrarKaynagi]) : null;
  // Bu koşunun tekrarları (başarısızları tekrar çalıştırmayla başlatılan koşular; en yeni önce).
  const tekrarlar = vt.tumu('SELECT id, baslangic, bitis, durum, ozet_json FROM kosular WHERE proje_id = ? AND ozet_json LIKE ? ORDER BY baslangic DESC', [k.proje_id, `%"tekrarKaynagi":"${kosuId}"%`])
    .filter((x) => tekrarKaynagiOku(x.ozet_json) === kosuId)
    .map((x) => ({ id: String(x.id), baslangic: String(x.baslangic), bitis: x.bitis == null ? null : String(x.bitis), durum: String(x.durum) }));
  return {
    kosu: {
      id: String(k.id), projeId: k.proje_id == null ? null : String(k.proje_id), ortamId: k.ortam_id == null ? null : String(k.ortam_id),
      tur: String(k.tur), kapsam: k.kapsam == null ? null : String(k.kapsam), durum: String(k.durum), baslangic: String(k.baslangic),
      bitis: k.bitis == null ? null : String(k.bitis), kaynak: String(k.kaynak ?? 'raporlayici'),
      ...sayilariTopla([kosuOzetiHesapla(vt, kosuId)]),
      // "Tekrar: <önceki koşu>" (kaynak koşu silinmişse yalnız kimlik) ve bu koşunun tekrarları.
      tekrarKaynagi: tekrarKaynagi ? { id: tekrarKaynagi, baslangic: kaynak ? String(kaynak.baslangic) : null, bitis: kaynak?.bitis == null ? null : String(kaynak.bitis), var: Boolean(kaynak) } : null,
      tekrarlar
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
    medya: vt.tumu('SELECT * FROM medya WHERE sonuc_id = ? ORDER BY sira, rowid', [sonucId]).map(medyaGorunumu),
    yakalananMesajlar: yakalananMesajlariOku(vt, sonucId),
    // Hangi tablo satırıyla koştu (açık sütunlar; gizli sütunun yalnız adı — değeri hiç saklanmaz).
    veriKosusu: veriKosusuOku(s.ekler_json),
    kurtarma: kurtarmaNotlariOku(s.ekler_json)
  };
}

/**
 * Sonucun koşuda yakalanan mesajları (beklenmeyenler önce, sonra ilk görülme sırası). Okurken de güncel ek gizli adlarla maskelenir.
 * @param {Veritabani} vt @param {string} sonucId
 */
function yakalananMesajlariOku(vt, sonucId) {
  const ekAdlar = ekGizliAdlar(vt);
  return vt.tumu('SELECT kaynak, metin, kalip, adim, sayi, beklenen, ilk, son FROM yakalanan_mesajlar WHERE sonuc_id = ? ORDER BY beklenen, sira', [sonucId]).map((m) => ({
    kaynak: String(m.kaynak), metin: yakalananMetniMaskele(String(m.metin), { ekAdlar }), kalip: String(m.kalip), adim: m.adim == null ? null : String(m.adim),
    sayi: Number(m.sayi), beklenen: Number(m.beklenen) === 1, ilk: String(m.ilk), son: String(m.son)
  }));
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
            (SELECT COUNT(*) FROM medya m WHERE m.sonuc_id = r.id AND m.tur = 'ekran_goruntusu' AND m.silinme IS NULL) AS gorsel
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
  return {
    toplam: satirlar.length, kategoriler, kaliplar: kaliplar.slice(0, Math.max(1, Math.min(filtre.limit ?? 200, 1000))),
    // İkinci küme: koşuda yakalanan mesajlar (geçen testler dahil).
    yakalanan: yakalananMesajKaliplari(vt, projeId, filtre)
  };
}

/**
 * "Koşuda yakalanan mesajlar": tarih aralığındaki TÜM sonuçların (geçen ve kalan) yakalanan mesajları kaynak + kalıp ile
 * gruplanır. Senaryonun beklediği mesajla eşleşen kayıtlar "beklenen"dir; grup yalnız beklenen kayıtlardan oluşuyorsa
 * beklenen sayılır. Sıra: önce beklenmeyen, sonra sayı, sonra son görülme. Her grubun testleri (en yeniden eskiye, en çok 100).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ urun?: string | null; baslangic?: string | null; bitis?: string | null; limit?: number }} [filtre]
 */
export function yakalananMesajKaliplari(vt, projeId, filtre = {}) {
  const kosullar = ['k.proje_id = ?'];
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
    `SELECT m.kaynak, m.metin, m.kalip, m.adim, m.sayi, m.beklenen, m.ilk, m.son,
            r.id AS sonuc_id, r.durum, r.senaryo_baslik, r.senaryo_id, r.kosu_id, r.ekran_id, r.urun_adi, e.ad AS ekran_adi, k.ortam_id,
            COALESCE(r.bitis, k.bitis, k.baslangic) AS zaman
       FROM yakalanan_mesajlar m JOIN kosu_sonuclari r ON r.id = m.sonuc_id JOIN kosular k ON k.id = r.kosu_id
       LEFT JOIN ekranlar e ON e.id = r.ekran_id
      WHERE ${kosullar.join(' AND ')} ORDER BY zaman, m.sira`, p
  );
  const ekAdlar = satirlar.length ? ekGizliAdlar(vt) : [];
  /**
   * @typedef {{ sonucId: string; kosuId: string; senaryoId: string | null; senaryoBaslik: string; ortamId: string | null; adim: string | null;
   *   zaman: string; durum: string; sayi: number; beklenen: boolean }} YakalananSonuc
   */
  /** @type {Map<string, { kaynak: string; kalip: string; ornekMetin: string; sayi: number; beklenenSayisi: number; beklenmeyenSayisi: number;
   *   senaryolar: Set<string>; gecen: Set<string>; kalan: Set<string>; urunler: Set<string>; ilk: string; son: string; sonuclar: YakalananSonuc[] }>} */
  const gruplar = new Map();
  /** @type {Record<string, number>} */
  const kaynaklar = Object.fromEntries(YAKALAMA_KAYNAKLARI.map((k) => [k, 0]));
  for (const s of satirlar) {
    const kaynak = String(s.kaynak);
    const kalip = String(s.kalip);
    const anahtar = `${kaynak}\u0000${kalip}`;
    const ilk = String(s.ilk);
    const son = String(s.son);
    const g = gruplar.get(anahtar) ?? { kaynak, kalip, ornekMetin: '', sayi: 0, beklenenSayisi: 0, beklenmeyenSayisi: 0, senaryolar: new Set(),
      gecen: new Set(), kalan: new Set(), urunler: new Set(), ilk, son, sonuclar: [] };
    gruplar.set(anahtar, g);
    const sayi = Math.max(1, Number(s.sayi) || 1);
    const beklenen = Number(s.beklenen) === 1;
    g.sayi += sayi;
    kaynaklar[kaynak] = (kaynaklar[kaynak] ?? 0) + sayi;
    if (beklenen) g.beklenenSayisi += sayi; else g.beklenmeyenSayisi += sayi;
    g.senaryolar.add(String(s.senaryo_baslik));
    const sonucId = String(s.sonuc_id);
    if (s.durum === 'basarisiz') g.kalan.add(sonucId); else if (s.durum === 'basarili') g.gecen.add(sonucId);
    g.urunler.add(s.ekran_adi != null ? String(s.ekran_adi) : s.urun_adi != null ? String(s.urun_adi) : 'Diğer');
    if (ilk < g.ilk) g.ilk = ilk;
    if (son > g.son) g.son = son;
    g.ornekMetin = String(s.metin);
    g.sonuclar.push({
      sonucId, kosuId: String(s.kosu_id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id), senaryoBaslik: String(s.senaryo_baslik),
      ortamId: s.ortam_id == null ? null : String(s.ortam_id), adim: s.adim == null ? null : String(s.adim), zaman: String(s.zaman),
      durum: String(s.durum), sayi, beklenen
    });
  }
  const kaliplar = [...gruplar.values()]
    .map((g) => ({
      kaynak: g.kaynak, kalip: g.kalip, ornekMetin: yakalananMetniMaskele(g.ornekMetin, { ekAdlar }), sayi: g.sayi,
      beklenen: g.beklenmeyenSayisi === 0, beklenenSayisi: g.beklenenSayisi, beklenmeyenSayisi: g.beklenmeyenSayisi,
      senaryoSayisi: g.senaryolar.size, gecenTestSayisi: g.gecen.size, kalanTestSayisi: g.kalan.size, urunler: [...g.urunler].sort((a, b) => a.localeCompare(b, 'tr')),
      ilk: g.ilk, son: g.son, sonuclar: g.sonuclar.slice(-100).reverse()
    }))
    .sort((a, b) => Number(a.beklenen) - Number(b.beklenen) || b.sayi - a.sayi || b.son.localeCompare(a.son));
  return {
    toplam: satirlar.reduce((t, s) => t + Math.max(1, Number(s.sayi) || 1), 0),
    beklenmeyen: kaliplar.reduce((t, k) => t + k.beklenmeyenSayisi, 0),
    kaynaklar,
    kaliplar: kaliplar.slice(0, Math.max(1, Math.min(filtre.limit ?? 200, 1000)))
  };
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
  const gorseller = detay.medya.filter((m) => m.tur === 'ekran_goruntusu' && !m.silinme);
  const video = detay.medya.find((m) => m.tur === 'video' && !m.silinme);
  const basarisizAdim = detay.adimlar.find((a) => a.durum === 'basarisiz')?.ad ?? null;
  return { detay, sonEkranGoruntusuId: gorseller.length ? gorseller[gorseller.length - 1].id : null, videoId: video?.id ?? null, basarisizAdim };
}

/**
 * Sonuç saklama (Ayarlar > Yedekleme > Sonuç saklama): başlangıcı gun günden eski, bitmiş ekran koşularını (sonuçları, adımları,
 * medya satırları) ve servis / servis akışı koşularını siler. Medya DOSYALARI satırları silinince sahipsiz kalır; günlük medya
 * temizliği (medyaSaklamaTemizligi) onları siler; hemen silmek için dönen medyaDosyalari kullanılır. gun <= 0: hiçbir şey
 * silinmez; tumu: gün yok sayılır, bitmiş TÜM koşular silinir (Sonuçlar > Geçmiş sonuçları sil).
 * @param {Veritabani} vt @param {number} gun @param {{ simdi?: number; tumu?: boolean }} [s]
 * @returns {{ kosu: number; sonuc: number; servisKosusu: number; akisKosusu: number; medyaDosyalari: string[] }}
 */
export function eskiSonuclariSil(vt, gun, s = {}) {
  const bos = { kosu: 0, sonuc: 0, servisKosusu: 0, akisKosusu: 0, medyaDosyalari: /** @type {string[]} */ ([]) };
  if (!s.tumu && (!Number.isFinite(gun) || gun <= 0)) return bos;
  const simdi = s.simdi ?? Date.now();
  const esik = new Date(s.tumu ? simdi + 24 * 60 * 60 * 1000 : simdi - gun * 24 * 60 * 60 * 1000).toISOString();
  /** @type {string[]} */
  const medyaDosyalari = [];
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
        for (const r of vt.tumu(`SELECT dosya FROM medya WHERE sonuc_id IN (${y2})`, sp)) medyaDosyalari.push(String(r.dosya));
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
    return { kosu: kosular.length, sonuc, servisKosusu, akisKosusu, medyaDosyalari };
  });
}
