// KOŞU HIZI — eşzamanlılık ve bekleme (TEK TANIM; sunucu ve arayüz aynı modülü kullanır, arayüze /arayuz/kosu-hizi.mjs olarak
// sunulur). Genel değerler Ayarlar > Koşu'da (kosu-ayarlari.mjs bu sınırları kullanır); ortam formundaki "Koşu hızı" bölümü aynı
// dört değeri ORTAM BAZINDA ezebilir (ortam.ayarlar.kosuHizi; boş = genel ayar). Koşuda etkin değer: ortamdaki varsa o, yoksa genel.
// Bağımlılığı yoktur (tarayıcıda da çalışır).

/** @typedef {'servisEszamanli' | 'servisIstekBeklemeMs' | 'ekranEszamanli' | 'ekranBeklemeMs'} KosuHiziAnahtari */
/** @type {ReadonlyArray<{ anahtar: KosuHiziAnahtari; enAz: number; enCok: number; varsayilan: number; etiket: string }>} */
export const KOSU_HIZI_ALANLARI = Object.freeze([
  { anahtar: 'servisEszamanli', enAz: 1, enCok: 10, varsayilan: 1, etiket: 'Aynı anda en çok servis senaryosu' },
  { anahtar: 'servisIstekBeklemeMs', enAz: 0, enCok: 60_000, varsayilan: 0, etiket: 'İstekler arası bekleme' },
  { anahtar: 'ekranEszamanli', enAz: 1, enCok: 5, varsayilan: 1, etiket: 'Aynı anda en çok ekran senaryosu' },
  { anahtar: 'ekranBeklemeMs', enAz: 0, enCok: 60_000, varsayilan: 0, etiket: 'Senaryolar arası bekleme' }
]);

/** @param {KosuHiziAnahtari} a */
const tanim = (a) => /** @type {(typeof KOSU_HIZI_ALANLARI)[number]} */ (KOSU_HIZI_ALANLARI.find((t) => t.anahtar === a));

/** Değer sınırlar içinde tam sayı mı. @param {KosuHiziAnahtari} a @param {unknown} v */
const gecerliMi = (a, v) => typeof v === 'number' && Number.isInteger(v) && v >= tanim(a).enAz && v <= tanim(a).enCok;

/**
 * Ortam formundan gelen "Koşu hızı" değerlerini doğrular: boş / null / verilmemiş alan yazılmaz (genel ayar kullanılır); sayı
 * metni de kabul edilir. Geçersizse hata (mesajıyla).
 * @param {unknown} girdi @returns {Partial<Record<KosuHiziAnahtari, number>>}
 */
export function kosuHiziDogrula(girdi) {
  if (girdi === undefined || girdi === null) return {};
  if (typeof girdi !== 'object' || Array.isArray(girdi)) throw new Error('"Koşu hızı" bir nesne olmalıdır.');
  /** @type {Partial<Record<KosuHiziAnahtari, number>>} */
  const sonuc = {};
  for (const t of KOSU_HIZI_ALANLARI) {
    const ham = /** @type {Record<string, unknown>} */ (girdi)[t.anahtar];
    if (ham === undefined || ham === null || ham === '') continue;
    const v = typeof ham === 'string' ? Number(ham.trim()) : ham;
    if (!gecerliMi(t.anahtar, v)) throw new Error(`"${t.etiket}" ${t.enAz}–${t.enCok} arasında bir tam sayı olmalıdır (boş: genel ayar).`);
    sonuc[t.anahtar] = /** @type {number} */ (v);
  }
  return sonuc;
}

/**
 * Etkin değerler: ortamdaki (ortam.ayarlar.kosuHizi ya da arayüzdeki ortam.kosuHizi) varsa o, yoksa genel ayar, o da yoksa varsayılan.
 * @param {Record<string, unknown> | null | undefined} genel kullanıcının koşu ayarları
 * @param {{ ad?: string; kosuHizi?: unknown; ayarlar?: { kosuHizi?: unknown } } | null | undefined} ortam
 * @returns {{ degerler: Record<KosuHiziAnahtari, number>; kaynaklar: Record<KosuHiziAnahtari, 'ortam' | 'genel'>; ortamAd: string | null }}
 */
export function etkinKosuHizi(genel, ortam) {
  const ham = /** @type {Record<string, unknown>} */ ((ortam && (ortam.kosuHizi ?? ortam.ayarlar?.kosuHizi)) || {});
  /** @type {any} */
  const degerler = {};
  /** @type {any} */
  const kaynaklar = {};
  for (const t of KOSU_HIZI_ALANLARI) {
    const o = ham[t.anahtar];
    const g = genel?.[t.anahtar];
    if (gecerliMi(t.anahtar, o)) { degerler[t.anahtar] = o; kaynaklar[t.anahtar] = 'ortam'; }
    else { degerler[t.anahtar] = gecerliMi(t.anahtar, g) ? g : t.varsayilan; kaynaklar[t.anahtar] = 'genel'; }
  }
  return { degerler, kaynaklar, ortamAd: ortam?.ad ?? null };
}

/**
 * Koşu penceresi / paneli için kısa özet: "TEST ortamı: en çok 3 senaryo aynı anda, 500 ms bekleme (ortam ayarı)".
 * @param {ReturnType<typeof etkinKosuHizi>} e @param {'servis' | 'ekran'} tur
 */
export function kosuHiziOzeti(e, tur) {
  const n = tur === 'servis' ? e.degerler.servisEszamanli : e.degerler.ekranEszamanli;
  const ms = tur === 'servis' ? e.degerler.servisIstekBeklemeMs : e.degerler.ekranBeklemeMs;
  const ortamdan = tur === 'servis' ? e.kaynaklar.servisEszamanli === 'ortam' || e.kaynaklar.servisIstekBeklemeMs === 'ortam'
    : e.kaynaklar.ekranEszamanli === 'ortam' || e.kaynaklar.ekranBeklemeMs === 'ortam';
  const parcalar = [n > 1 ? `en çok ${n} senaryo aynı anda` : 'senaryolar sırayla (1 senaryo aynı anda)',
    ms > 0 ? `${ms} ms ${tur === 'servis' ? 'istekler arası' : 'senaryolar arası'} bekleme` : 'bekleme yok'];
  return `${e.ortamAd ? `${e.ortamAd} ortamı: ` : ''}${parcalar.join(', ')} (${ortamdan ? 'ortam ayarı' : 'genel ayar'})`;
}
