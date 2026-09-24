// ESKİ ALLURE SONUÇLARININ TEK SEFERLİK İÇE AKTARIMI (genel) — Allure kaldırılmadan önce
// allure-playwright'ın yazdığı ham sonuç klasörlerini (<klasör>/*-result.json + ekler) platform
// veritabanına (kosular / kosu_sonuclari / adim_sonuclari) ve png/webm eklerini ŞİFRELİ medya
// deposuna aktarır. Hangi klasörlerin okunacağını proje adaptörü söyler (sonucKaynaklari).
//
// Kurallar (eski görünümle AYNI — scripts/rapor/veri-kosular.mjs'ten taşındı):
// - Koşu gruplama: "kosuKimligi" etiketi olan sonuçlar bu kimliğe göre; etiketsiz ESKİ sonuçlar
//   kendi aralarında 10 dakikalık boşluk kuralıyla. Koşudaki tek bir sonuç bile 'tam' ise koşu
//   tamdır; kapsam 'kosuKapsami' etiketi (yoksa 'Genel'). Aynı koşuda aynı test (historyId) birden
//   fazla varsa en yenisi alınır.
// - Durum: allureDurumuEsle (interrupted/mesajsız failed → durduruldu).
// - Kimlikler kararlıdır (koşu: etiket ya da "allure-<ortam>-<ilk zaman>"; sonuç: kararlı UUID):
//   aktarım TEKRARLANABİLİR — var olan sonuç atlanır, çift kayıt/çift medya oluşmaz.
// - Kaynak dosyalara DOKUNULMAZ (yalnızca okunur); medya kopyası şifrelenerek yazılır.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kararliKimlik } from './motor.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../veritabani/sonuc-deposu.mjs';
import { medyaDosyasiniSil, medyaSifrele } from '../medya.mjs';
import { adimGurultuMu, allureDurumuEsle } from '../sonuclar/siniflandirma.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} AllureSonucu */

const KOSU_BOSLUGU_MS = 10 * 60 * 1000;
const AKTARILAN_EK_TURLERI = new Map([['image/png', 'ekran_goruntusu'], ['video/webm', 'video']]);

/**
 * Klasördeki tüm *-result.json dosyaları, zamana göre (en eski önce). Bozuk/zamansız dosyalar atlanır.
 * @param {string} klasor @returns {Array<{ icerik: AllureSonucu; zaman: number }>}
 */
export function allureSonuclariniOku(klasor) {
  if (!existsSync(klasor)) return [];
  /** @type {Array<{ icerik: AllureSonucu; zaman: number }>} */
  const liste = [];
  for (const dosya of readdirSync(klasor).filter((d) => d.endsWith('-result.json'))) {
    let icerik;
    try {
      icerik = JSON.parse(readFileSync(join(klasor, dosya), 'utf-8'));
    } catch {
      continue;
    }
    const zaman = icerik?.stop ?? icerik?.start;
    if (!zaman) continue;
    liste.push({ icerik, zaman });
  }
  return liste.sort((a, b) => a.zaman - b.zaman);
}

/** @param {AllureSonucu} icerik @param {string} ad */
function etiket(icerik, ad) {
  return (icerik.labels ?? []).find((/** @type {{ name: string }} */ e) => e.name === ad)?.value ?? null;
}

/**
 * Sonuçları koşulara gruplar (eski görünümün kosulariGrupla'sı ile aynı kurallar).
 * @param {Array<{ icerik: AllureSonucu; zaman: number }>} tumIcerikler
 * @returns {Array<{ kimlik: string | null; tur: 'tam' | 'tekil'; kapsam: string; bitis: number; baslangic: number; testler: Map<string, AllureSonucu> }>}
 */
export function allureKosulariniGrupla(tumIcerikler) {
  /** @type {ReturnType<typeof allureKosulariniGrupla>} */
  const kosular = [];
  const kimlikliler = new Map();
  /** @type {ReturnType<typeof allureKosulariniGrupla>[number] | null} */
  let sonEtiketsiz = null;
  for (const { icerik, zaman } of tumIcerikler) {
    const kimlik = etiket(icerik, 'kosuKimligi');
    let kosu;
    if (kimlik) {
      kosu = kimlikliler.get(kimlik);
      if (!kosu) {
        kosu = { kimlik, tur: /** @type {'tam' | 'tekil'} */ ('tam'), kapsam: 'Genel', bitis: zaman, baslangic: icerik.start ?? zaman, testler: new Map() };
        kimlikliler.set(kimlik, kosu);
        kosular.push(kosu);
      }
      if (etiket(icerik, 'kosuTuru') === 'tekil' && kosu.testler.size === 0) kosu.tur = 'tekil';
      else if (etiket(icerik, 'kosuTuru') !== 'tekil') {
        kosu.tur = 'tam';
        kosu.kapsam = etiket(icerik, 'kosuKapsami') || kosu.kapsam || 'Genel';
      }
    } else {
      if (!sonEtiketsiz || zaman - sonEtiketsiz.bitis > KOSU_BOSLUGU_MS) {
        sonEtiketsiz = { kimlik: null, tur: 'tam', kapsam: 'Genel', bitis: zaman, baslangic: icerik.start ?? zaman, testler: new Map() };
        kosular.push(sonEtiketsiz);
      }
      kosu = sonEtiketsiz;
    }
    kosu.bitis = Math.max(kosu.bitis, zaman);
    kosu.baslangic = Math.min(kosu.baslangic, icerik.start ?? zaman);
    const anahtar = icerik.historyId ?? icerik.uuid;
    const mevcut = kosu.testler.get(anahtar);
    if (!mevcut || zaman >= (mevcut._zaman ?? 0)) {
      icerik._zaman = zaman;
      kosu.testler.set(anahtar, icerik);
    }
  }
  return kosular.sort((a, b) => a.bitis - b.bitis);
}

/** Sonuç ve adımlardaki (derinlemesine) ekler, sıralı. @param {AllureSonucu} icerik */
function tumEkler(icerik) {
  /** @type {Array<{ name?: string; source?: string; type?: string }>} */
  const ekler = [];
  const gez = (/** @type {AllureSonucu} */ d) => {
    ekler.push(...(d.attachments ?? []));
    for (const a of d.steps ?? []) gez(a);
  };
  gez(icerik);
  return ekler;
}

/** Varsayılan senaryo anahtarı: fullName "dosya › ... › başlık" → "dosya::başlık". @param {AllureSonucu} icerik */
export function varsayilanSonucAnahtari(icerik) {
  const tam = typeof icerik.fullName === 'string' ? icerik.fullName : '';
  const dosya = tam.split(' › ')[0]?.replace(/:\d+(?::\d+)?$/, '').replace(/\\/g, '/');
  return dosya && icerik.name ? `${dosya}::${icerik.name}` : null;
}

/**
 * Bir sonuç klasörünü içe aktarır. Kasa AÇIK olmalıdır (medya anahtarı çağırandan gelir).
 * @param {Veritabani} vt
 * @param {{ projeId: string; ortamAnahtari: string; ortamId?: string | null; klasor: string; medyaAnahtari: Buffer; medyaKlasoru: string;
 *   sonucAnahtari?: (icerik: AllureSonucu) => string | null }} s
 */
export async function allureSonuclariniAktar(vt, s) {
  const sayim = { kosu: 0, sonuc: 0, medya: 0, zatenVar: 0, eksikEk: 0 };
  const kosular = allureKosulariniGrupla(allureSonuclariniOku(s.klasor));
  for (const kosu of kosular) {
    const kosuId = kosu.kimlik && /^[A-Za-z0-9_-]{1,100}$/.test(kosu.kimlik) ? kosu.kimlik : `allure-${s.ortamAnahtari}-${kosu.baslangic}`;
    const yeniKosu = !vt.tek('SELECT 1 AS v FROM kosular WHERE id = ?', [kosuId]);
    let degisti = false;
    for (const icerik of kosu.testler.values()) {
      const sonucId = kararliKimlik('allure-sonuc', kosuId, String(icerik.historyId ?? icerik.uuid));
      if (vt.tek('SELECT 1 AS v FROM kosu_sonuclari WHERE id = ?', [sonucId])) { sayim.zatenVar++; continue; }
      if (!degisti) {
        kosuKaydet(vt, {
          id: kosuId, projeId: s.projeId, ortamId: s.ortamId ?? null, tur: kosu.tur, kapsam: kosu.kapsam,
          baslangic: new Date(kosu.baslangic).toISOString(), kaynak: 'allure-aktarimi'
        });
        degisti = true;
      }
      const durum = allureDurumuEsle(icerik);
      const adimlar = (icerik.steps ?? [])
        .filter((/** @type {AllureSonucu} */ a) => !adimGurultuMu(a.name ?? '') && ['passed', 'failed', 'broken'].includes(a.status))
        .filter((/** @type {AllureSonucu} */ a) => durum !== 'durduruldu' || a.status === 'passed')
        .map((/** @type {AllureSonucu} */ a) => ({
          ad: String(a.name ?? 'İsimsiz adım'),
          durum: a.status === 'passed' ? 'basarili' : 'basarisiz',
          sureMs: a.stop && a.start ? a.stop - a.start : null,
          hataMesaji: a.status === 'passed' ? null : a.statusDetails?.message ?? null
        }));
      /** @type {NonNullable<import('../veritabani/sonuc-deposu.mjs').SonucGirdisi['medya']>} */
      const medya = [];
      try {
        for (const ek of tumEkler(icerik)) {
          const tur = AKTARILAN_EK_TURLERI.get(String(ek.type));
          if (!tur || !ek.source || /[\\/]/.test(ek.source)) continue;
          const yol = join(s.klasor, ek.source);
          if (!existsSync(yol)) { sayim.eksikEk++; continue; }
          const { dosya, boyut } = await medyaSifrele(s.medyaAnahtari, s.medyaKlasoru, yol);
          medya.push({ id: kararliKimlik('allure-medya', sonucId, ek.source), tur, ad: String(ek.name ?? tur), icerikTuru: String(ek.type), boyut, dosya,
            olusturulma: new Date(icerik.stop ?? icerik.start ?? Date.now()).toISOString() });
        }
        sonucKaydet(vt, {
          id: sonucId, kosuId, projeId: s.projeId, testKimligi: String(icerik.historyId ?? icerik.uuid),
          senaryoAnahtari: (s.sonucAnahtari ?? varsayilanSonucAnahtari)(icerik), senaryoBaslik: String(icerik.name ?? icerik.fullName ?? 'İsimsiz test'),
          urunAdi: etiket(icerik, 'epic'), durum, hamDurum: String(icerik.status ?? ''), sureMs: icerik.stop && icerik.start ? icerik.stop - icerik.start : null,
          hataMesaji: icerik.statusDetails?.message ?? null, baslangic: icerik.start ? new Date(icerik.start).toISOString() : null,
          bitis: new Date(icerik.stop ?? icerik.start).toISOString(), adimlar, medya
        });
      } catch (hata) {
        for (const m of medya) medyaDosyasiniSil(s.medyaKlasoru, m.dosya);
        throw hata;
      }
      sayim.sonuc++;
      sayim.medya += medya.length;
    }
    if (degisti) {
      kosuyuBitir(vt, kosuId, { durum: 'tamamlandi', bitis: new Date(kosu.bitis).toISOString() });
      if (yeniKosu) sayim.kosu++;
    }
  }
  return sayim;
}
