// İZİNLER — MERKEZ DENETİM (sunucu). Nöbetçi'nin kişi adına yaptığı her işlem bir izne bağlıdır (tanımlar: izin-tanimlari.mjs).
// Durum kasada şifreli ayar olarak saklanır ('izinler': { <anahtar>: true }); kayıt yoksa izin KAPALIDIR (yeni ve mevcut
// kurulumlar — göç gerekmez, yokluk kapalı demektir). Kasa kilitliyken tüm izinler kapalı sayılır.
//   izinleriOku(vt)                 { <anahtar>: boolean } (tüm anahtarlar)
//   izinGerekli(vt, anahtar, baglam) kapalıysa IzinHatasi (kod IZIN_KAPALI; sunucu 403 + { kod, izin, etiket, mesaj } döner)
//   izinDegistir(vt, anahtar, acik, { onay }) açmak onay ister (kapatmak serbest); her değişiklik degisiklik_gecmisi'ne
//                                   (varlık türü 'izin') yazılır: kim / ne zaman / hangi izin açıldı-kapandı
//   izinDegisiklikleri(vt)          son değişiklikler (Ayarlar > İzinler)
// Koşucu süreci (tests/support) kasayı AÇMAZ: izin durumu veri-oku.mjs çıktısıyla gelir (izinDurumundanDenetle).
// NOT: import.meta KULLANILMAZ.
import { kasaAcikMi } from '../kasa.mjs';
import { DepoHatasi, ayarGetir, ayarYaz, gecmisYaz } from '../veritabani/depo.mjs';
import { IZIN_ANAHTARLARI, izinMesaji, izinTanimi } from './izin-tanimlari.mjs';
import { CANLI_IZNI, IZIN_PAKETLERI, paketIzinleri } from './izin-paketleri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const IZIN_AYAR_ANAHTARI = 'izinler';
export const IZIN_GECMIS_TURU = 'izin';
export { IZIN_ANAHTARLARI, izinMesaji } from './izin-tanimlari.mjs';

/** Kapalı izne tabi işlem denendi. */
export class IzinHatasi extends Error {
  /** @param {string} anahtar @param {string} [baglam] denetim yeri (loglar / testler için; kullanıcıya gösterilmez) */
  constructor(anahtar, baglam) {
    super(izinMesaji(anahtar));
    this.name = 'IzinHatasi';
    this.kod = /** @type {const} */ ('IZIN_KAPALI');
    this.izin = anahtar;
    this.etiket = izinTanimi(anahtar)?.etiket ?? anahtar;
    this.baglam = baglam ?? null;
  }
}

/** @param {unknown} anahtar @returns {string} */
function anahtarDogrula(anahtar) {
  if (typeof anahtar !== 'string' || !IZIN_ANAHTARLARI.includes(anahtar)) throw new DepoHatasi('Bilinmeyen izin.');
  return anahtar;
}

/**
 * İzin durumu (tüm anahtarlar). Kasa kilitliyse / okunamazsa hepsi kapalı.
 * @param {Veritabani | null | undefined} vt @returns {Record<string, boolean>}
 */
export function izinleriOku(vt) {
  /** @type {Record<string, boolean>} */
  const sonuc = Object.fromEntries(IZIN_ANAHTARLARI.map((a) => [a, false]));
  if (!vt || !kasaAcikMi(vt)) return sonuc;
  try {
    const kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, IZIN_AYAR_ANAHTARI));
    for (const a of IZIN_ANAHTARLARI) sonuc[a] = kayit?.[a] === true;
  } catch { /* okunamadı: hepsi kapalı */ }
  return sonuc;
}

/** @param {Veritabani | null | undefined} vt @param {string} anahtar */
export function izinAcikMi(vt, anahtar) {
  return izinleriOku(vt)[anahtarDogrula(anahtar)] === true;
}

/**
 * İzin kapalıysa IzinHatasi fırlatır (işlem YAPILMAZ).
 * @param {Veritabani | null | undefined} vt @param {string} anahtar @param {string} [baglam]
 */
export function izinGerekli(vt, anahtar, baglam) {
  if (!izinAcikMi(vt, anahtar)) throw new IzinHatasi(anahtar, baglam);
}

/**
 * Kasası olmayan süreçler (koşucu) için: veri-oku.mjs'nin verdiği izin durumuyla denetim.
 * @param {Record<string, unknown> | null | undefined} durum @param {string} anahtar @param {string} [baglam]
 */
export function izinDurumundanDenetle(durum, anahtar, baglam) {
  if (!durum || durum[anahtarDogrula(anahtar)] !== true) throw new IzinHatasi(anahtar, baglam);
}

/**
 * İzni açar / kapatır (kasa açık olmalı). Açmak onay ister (arayüz "ne yapar / riski" penceresini gösterip onay: true gönderir);
 * kapatmak serbesttir. Değişiklik geçmişe yazılır.
 * @param {Veritabani} vt @param {unknown} anahtar @param {unknown} acik @param {{ onay?: unknown; yapan?: string; kaynak?: 'izin-penceresi' }} [s]
 * @returns {{ izinler: Record<string, boolean>; degisti: boolean }}
 */
export function izinDegistir(vt, anahtar, acik, s = {}) {
  const a = anahtarDogrula(anahtar);
  if (typeof acik !== 'boolean') throw new DepoHatasi('"acik" true ya da false olmalıdır.');
  if (acik && s.onay !== true) throw new DepoHatasi('İzni açmak için ne yaptığını ve riskini onaylamalısınız.');
  const kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, IZIN_AYAR_ANAHTARI));
  const onceki = kayit?.[a] === true;
  if (onceki === acik) return { izinler: izinleriOku(vt), degisti: false };
  /** @type {Record<string, boolean>} */
  const yeni = {};
  for (const x of IZIN_ANAHTARLARI) if (x === a ? acik : kayit?.[x] === true) yeni[x] = true;
  vt.islem(() => {
    ayarYaz(vt, IZIN_AYAR_ANAHTARI, yeni);
    gecmisYaz(vt, {
      varlikTuru: IZIN_GECMIS_TURU, varlikId: a, islem: 'guncelle', ...(s.yapan ? { yapan: s.yapan } : {}),
      onceki: { acik: onceki }, sonraki: { acik }, aciklama: `${acik ? 'açıldı' : 'kapatıldı'}${s.kaynak === 'izin-penceresi' ? ' (izin penceresinden)' : ''}`
    });
  });
  return { izinler: izinleriOku(vt), degisti: true };
}

/**
 * İzin paketi ("Nöbetçi sizin adınıza neleri yapabilsin?"; izin-paketleri.mjs): seçimin açacağı izinlerden KAPALI olanları tek
 * işlemde açar (hiçbir izni kapatmaz). Açılacak izin varsa onay ister (arayüz izinleri riskleriyle tek listede gösterip onay: true
 * gönderir). Her açılan izin izin geçmişine ayrı satır olarak yazılır ("açıldı (izin paketinden: …)"). Veritabanına yazma, sistem
 * değişikliği ve güvenlik gevşetme paketle açılamaz (paketIzinleri hata verir).
 * @param {Veritabani} vt @param {{ paket?: unknown; canli?: unknown; ozel?: unknown; onay?: unknown; yapan?: string }} s
 * @returns {{ izinler: Record<string, boolean>; acilanlar: string[]; degisti: boolean }}
 */
export function izinPaketiUygula(vt, s) {
  let istenen;
  try { istenen = paketIzinleri({ paket: s?.paket, canli: s?.canli, ozel: s?.ozel }); } catch (hata) { throw new DepoHatasi(/** @type {Error} */ (hata).message); }
  const kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(vt, IZIN_AYAR_ANAHTARI));
  const acilanlar = istenen.filter((a) => kayit?.[a] !== true);
  if (!acilanlar.length) return { izinler: izinleriOku(vt), acilanlar: [], degisti: false };
  if (s.onay !== true) throw new DepoHatasi('İzinleri açmak için ne yaptıklarını ve risklerini onaylamalısınız.');
  const paketEtiketi = IZIN_PAKETLERI.find((p) => p.ad === s.paket)?.etiket ?? String(s.paket);
  /** @type {Record<string, boolean>} */
  const yeni = {};
  for (const x of IZIN_ANAHTARLARI) if (kayit?.[x] === true || acilanlar.includes(x)) yeni[x] = true;
  vt.islem(() => {
    ayarYaz(vt, IZIN_AYAR_ANAHTARI, yeni);
    for (const a of acilanlar) {
      gecmisYaz(vt, {
        varlikTuru: IZIN_GECMIS_TURU, varlikId: a, islem: 'guncelle', ...(s.yapan ? { yapan: s.yapan } : {}),
        onceki: { acik: false }, sonraki: { acik: true },
        aciklama: `açıldı (izin paketinden: ${paketEtiketi}${a === CANLI_IZNI ? '; "Canlı ortamda da çalıştırabilsin" işaretli' : ''})`
      });
    }
  });
  return { izinler: izinleriOku(vt), acilanlar, degisti: true };
}

/**
 * Son izin değişiklikleri (en yeni önce).
 * @param {Veritabani} vt @param {number} [sinir]
 * @returns {Array<{ id: string; zaman: string; izin: string; etiket: string; acik: boolean; yapan: string; makineId: string | null }>}
 */
export function izinDegisiklikleri(vt, sinir = 20) {
  return vt.tumu(
    'SELECT id, varlik_id, yapan, makine_id, zaman, sonraki_json FROM degisiklik_gecmisi WHERE varlik_turu = ? ORDER BY zaman DESC, rowid DESC LIMIT ?',
    [IZIN_GECMIS_TURU, Math.max(1, Math.min(200, Math.floor(sinir)))]
  ).map((r) => {
    let acik = false;
    try { acik = JSON.parse(String(r.sonraki_json ?? '{}'))?.acik === true; } catch { acik = false; }
    const izin = String(r.varlik_id);
    return {
      id: String(r.id), zaman: String(r.zaman), izin, etiket: izinTanimi(izin)?.etiket ?? izin, acik,
      yapan: String(r.yapan), makineId: r.makine_id == null ? null : String(r.makine_id)
    };
  });
}
