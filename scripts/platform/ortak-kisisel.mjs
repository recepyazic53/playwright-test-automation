// ORTAK YEDEKTE KİŞİYE ÖZEL BİLGİ — ekip, ortak klasörden paylaşılan yedekle çalışır (ortak-paylasim.mjs). Yedeğin içeriği herkese gelir;
// ama GİRİŞ BİLGİLERİ (kullanıcı adı, parola, TOTP) ve ENTEGRASYON gizlileri (token, parola, kullanıcı, webhook adresi, veritabanı
// kullanıcı / parolası) KİŞİYE ÖZELDİR: yayınlanan yedekten ayıklanır, içe aktarırken de kişinin KENDİ yerel değeri korunur (boş gelen
// değer yerelin üzerine yazılmaz). Test verisi (gizli sütunlar dahil), ekranlar, senaryolar, akışlar, SQL sorguları ortaktır.
//
//   ortakIcinTemizle(tablolar, anahtar)     yayın: kişiye özel sütunlar boşaltılır; entegrasyon bağlantılarının gizli alanları ayıklanır.
//   yerelKisiseliKoru(vt, tablolar, anahtar) içe aktarma: gelen satırlarda aynı kimlikli yerel satırın kişisel değerleri geri konur;
//                                            entegrasyonlar kimlik bazında birleşir (yalnız yerelde olanlar korunur).
//   ORTAK_KISISEL_SUTUNLAR                  hangi sütunlar kişiye özel (tek bildirim noktası).
// NOT: import.meta KULLANILMAZ (birim testleri CommonJS'e çevirerek yükler).

import { zarfCoz, zarfMi, zarfSifrele } from './kasa.mjs';
import { ENTEGRASYON_AYAR_ANAHTARI } from './entegrasyonlar/depo.mjs';
import { turBul } from './entegrasyonlar/katalog.mjs';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Satir */

/**
 * Kişiye özel sütunlar: tablo → { sütun: yayında yazılacak boş değer }. 'JSON_BOS' = şifreli boş JSON nesnesi ('{}' zarfı).
 * @type {Readonly<Record<string, Readonly<Record<string, string | null>>>>}
 */
export const ORTAK_KISISEL_SUTUNLAR = Object.freeze({
  giris_profilleri: Object.freeze({ kullanici_adi: '', parola: null, totp_gizli: null, ek_gizli_json: null }),
  servis_kimlikleri: Object.freeze({ degerler_json: 'JSON_BOS' })
});

/** Yayından hiç yazılmayan tablolar (koşu geçmişi kişiseldir, yedeği şişirir). */
export const ORTAK_DISI_TABLOLAR = Object.freeze(['kosular', 'kosu_sonuclari', 'adim_sonuclari', 'yakalanan_mesajlar', 'servis_kosulari', 'servis_akis_kosulari', 'raporlar']);
/** Ortak yedeğe giren tek medya türü (senaryo dosyaları); ekran görüntüsü / video / iz kişiseldir. */
export const ORTAK_MEDYA_TURU = 'senaryo-dosyasi';
/** Kişiye özel sayılan entegrasyon alanı adları (gizli işaretli alanlara ek olarak). */
const KISISEL_ALAN_ADLARI = Object.freeze(['kullanici']);

/**
 * Bir entegrasyon türünde kişiye özel alanlar: gizli işaretliler (token, parola, webhook adresi…) ve kullanıcı adı alanları.
 * Bilinmeyen tür: hiçbir alan tanınmaz (boş dizi) — ama gizliler de ayıklanmadığı için tür kataloğunda olmayan bağlantı olduğu gibi gider.
 * @param {string} tur @returns {string[]}
 */
export function kisiselEntegrasyonAlanlari(tur) {
  const t = turBul(tur);
  if (!t) return [];
  return t.alanlar.filter((a) => a.gizli === true || KISISEL_ALAN_ADLARI.includes(a.ad)).map((a) => a.ad);
}

/** @param {unknown} d */
const nesne = (d) => (typeof d === 'object' && d !== null && !Array.isArray(d) ? /** @type {Record<string, unknown>} */ (d) : null);

/** Zarfı çözüp entegrasyon kaydını döner (çözülemezse null). @param {Buffer} anahtar @param {unknown} ham */
function entegrasyonOku(anahtar, ham) {
  if (!zarfMi(ham)) return null;
  try {
    const o = nesne(JSON.parse(zarfCoz(anahtar, ham)));
    return o && Array.isArray(o.baglantilar) ? /** @type {{ baglantilar: Record<string, unknown>[] }} */ (o) : null;
  } catch {
    return null;
  }
}

/**
 * Yayın için: kişiye özel sütunları boşaltır, entegrasyon bağlantılarının kişisel alanlarını ayıklar. Girdi değiştirilmez.
 * @param {Record<string, Satir[]>} tablolar yedek içeriğindeki tablolar (zarflar `anahtar` ile şifreli)
 * @param {Buffer} anahtar yedeği alan kasanın anahtarı
 * @returns {Record<string, Satir[]>}
 */
export function ortakIcinTemizle(tablolar, anahtar) {
  /** @type {Record<string, Satir[]>} */
  const cikti = { ...tablolar };
  for (const [tablo, sutunlar] of Object.entries(ORTAK_KISISEL_SUTUNLAR)) {
    cikti[tablo] = (tablolar[tablo] ?? []).map((s) => {
      const y = { ...s };
      for (const [sutun, bos] of Object.entries(sutunlar)) {
        if (!(sutun in y)) continue;
        y[sutun] = bos === 'JSON_BOS' ? zarfSifrele(anahtar, '{}') : bos;
      }
      return y;
    });
  }
  for (const t of ORTAK_DISI_TABLOLAR) if (t in cikti) cikti[t] = [];
  if (cikti.medya) cikti.medya = cikti.medya.filter((m) => String(m.tur) === ORTAK_MEDYA_TURU);
  cikti.ayarlar = (tablolar.ayarlar ?? []).map((s) => {
    if (s.anahtar !== ENTEGRASYON_AYAR_ANAHTARI) return s;
    const k = entegrasyonOku(anahtar, s.deger_json);
    if (!k) return s;
    const baglantilar = k.baglantilar.map((b) => {
      const alanlar = nesne(b.alanlar) ?? {};
      const temiz = { ...alanlar };
      for (const ad of kisiselEntegrasyonAlanlari(String(b.tur))) if (ad in temiz) temiz[ad] = '';
      return { ...b, alanlar: temiz };
    });
    return { ...s, deger_json: zarfSifrele(anahtar, JSON.stringify({ ...k, baglantilar })) };
  });
  return cikti;
}

/**
 * İçe aktarma için: gelen (ortak) satırlarda kişisel değerler yerelden geri konur. `tablolar` YERİNDE değiştirilir.
 * @param {Veritabani} vt yerel veritabanı (kasa açık)
 * @param {Record<string, Satir[]>} tablolar hazırlık alanındaki tablolar (zarflar `anahtar` ile şifreli)
 * @param {Buffer} anahtar yerel kasa anahtarı
 */
export function yerelKisiseliKoru(vt, tablolar, anahtar) {
  for (const [tablo, sutunlar] of Object.entries(ORTAK_KISISEL_SUTUNLAR)) {
    const sutunAdlari = Object.keys(sutunlar);
    /** @type {Map<string, Satir>} */
    const yerel = new Map();
    try {
      for (const s of vt.tumu(`SELECT id, ${sutunAdlari.join(', ')} FROM ${tablo}`)) yerel.set(String(s.id), s);
    } catch { /* tablo yok (eski şema): korunacak yerel değer de yok */ }
    tablolar[tablo] = (tablolar[tablo] ?? []).map((gelen) => {
      const y = yerel.get(String(gelen.id));
      if (!y) return gelen;
      const yeni = { ...gelen };
      for (const sutun of sutunAdlari) if (sutun in yeni) yeni[sutun] = y[sutun] ?? null;
      return yeni;
    });
  }
  const gelenSatir = (tablolar.ayarlar ?? []).find((s) => s.anahtar === ENTEGRASYON_AYAR_ANAHTARI);
  if (!gelenSatir) return;
  const gelen = entegrasyonOku(anahtar, gelenSatir.deger_json);
  if (!gelen) return;
  const yerelSatir = vt.tek('SELECT deger_json FROM ayarlar WHERE anahtar = ?', [ENTEGRASYON_AYAR_ANAHTARI]);
  const yerel = yerelSatir ? entegrasyonOku(anahtar, yerelSatir.deger_json) : null;
  const yerelBaglantilar = yerel?.baglantilar ?? [];
  const birlesik = gelen.baglantilar.map((b) => {
    const y = yerelBaglantilar.find((x) => x.id === b.id);
    if (!y) return b;
    const yerelAlanlar = nesne(y.alanlar) ?? {};
    const alanlar = { ...(nesne(b.alanlar) ?? {}) };
    for (const ad of kisiselEntegrasyonAlanlari(String(b.tur))) if (ad in yerelAlanlar) alanlar[ad] = yerelAlanlar[ad];
    // Bağlantı durumu ("son deneme") kişiseldir: yereldeki korunur.
    return { ...b, alanlar, durum: y.durum ?? b.durum ?? null };
  });
  // Yalnız yerelde olan bağlantılar silinmez (kişinin kendi test bağlantısı gibi).
  for (const y of yerelBaglantilar) if (!gelen.baglantilar.some((b) => b.id === y.id)) birlesik.push(y);
  const idx = tablolar.ayarlar.indexOf(gelenSatir);
  tablolar.ayarlar[idx] = { ...gelenSatir, deger_json: zarfSifrele(anahtar, JSON.stringify({ ...gelen, baglantilar: birlesik })) };
}
