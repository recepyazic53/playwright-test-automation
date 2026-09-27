// KOŞUDA YAKALANAN MESAJLAR (genel, saf — yan etki yok): model koşusu sırasında ekranda / tarayıcıda görülen mesajlar
// (test geçse de kalsa da). Kaynaklar:
//   diyalog         — sayfanın alert / confirm / prompt metni,
//   hata-gostergesi — modeldeki hata göstergesi ve kabul edilen uyarı öğelerinde görünen metin (iş kuralı pop-up'ları),
//   konsol          — sayfa konsolundaki 'error' iletileri,
//   sayfa-hatasi    — yakalanmamış sayfa hataları (pageerror),
//   ag              — aynı kökene giden isteklerde HTTP 4xx / 5xx (yöntem + yol + durum; sorgu dizesi ve gövde YOK).
// Toplayan: tests/support/mesaj-yakalayici.ts (koşu süreci). Taşıyan: raporlayıcı ("yakalananMesajlar" annotation'ı).
// Saklayan: sonuc-deposu.mjs (yakalanan_mesajlar tablosu). Gruplayan: sonuc-deposu.mjs > hataKaliplari.
//
// Maskeleme (kayıttan ÖNCE, koşu sürecinde; sunucu yazarken Ayarlar > Güvenlik > Maskeleme ek adlarıyla BİR KEZ DAHA):
//   - bilinen gizli değerler (giriş parolası, TOTP / sabit kod, gizli ek alanlar, kullanıcı adı, adı gizli sayılan ya da
//     parola tipindeki senaryo alanlarının değerleri) → •••,
//   - adı gizli sayılan "ad=değer", "ad: değer", "ad": "değer" ve <ad>değer</ad> değerleri → •••,
//   - 10 ve daha uzun rakam dizileri (kart, kimlik, telefon no; arada boşluk / tire olabilir) → •••,
//   - e-posta adresleri → •••@alan,
//   - adreslerdeki sorgu dizesi / parça (?…, #…) silinir.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';

export const YAKALAMA_KAYNAKLARI = Object.freeze(['diyalog', 'hata-gostergesi', 'konsol', 'sayfa-hatasi', 'ag']);
/** Kaynak → kısa Türkçe etiket (arayüz). */
export const YAKALAMA_KAYNAK_ETIKETLERI = Object.freeze({
  diyalog: 'Diyalog', 'hata-gostergesi': 'Hata göstergesi', konsol: 'Konsol', 'sayfa-hatasi': 'Sayfa hatası', ag: 'Ağ'
});
/** Test başına en çok farklı mesaj (fazlası sayılır, kaydedilmez). */
export const EN_COK_YAKALANAN_MESAJ = 50;
/** Mesaj metninin en çok uzunluğu (maskelemeden sonra). */
export const YAKALANAN_METIN_SINIRI = 500;
const MASKE = '•••';

/**
 * Yakalanan metni maskeler ve kısaltır.
 * @param {unknown} metin
 * @param {{ gizliDegerler?: ReadonlyArray<string>; ekAdlar?: ReadonlyArray<string> }} [s]
 * @returns {string}
 */
export function yakalananMetniMaskele(metin, s = {}) {
  let m = String(metin ?? '').replace(/\r\n?/g, '\n').trim();
  if (!m) return '';
  const ekler = s.ekAdlar ?? [];
  // 1) Bilinen gizli değerler (uzundan kısaya; 3 karakterden kısa değerler metni bozmasın diye atlanır).
  for (const g of [...new Set((s.gizliDegerler ?? []).map((x) => String(x ?? '')))].filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) {
    m = m.split(g).join(MASKE);
  }
  m = m
    // 2) Adreslerde sorgu dizesi ve parça.
    .replace(/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1')
    // 3) Adı gizli değerler: <ns:Ad>değer</ns:Ad>, "ad": "değer", ad=değer / ad: değer.
    .replace(/<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)(\s[^<>]*)?>([^<]+)<\/\1?\2>/g,
      (tam, on = '', ad, oz = '', deger) => (gizliAdMi(ad, ekler) && deger.trim() ? `<${on}${ad}${oz}>${MASKE}</${on}${ad}>` : tam))
    .replace(/"([^"\\]{1,80})"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g, (tam, ad, ara, deger) => (gizliAdMi(ad, ekler) && deger ? `"${ad}"${ara}"${MASKE}"` : tam));
  // ad=değer / ad: değer. Eşleşen ad gizli değilse arama DEĞERİN başından sürer; böylece "Giriş: parola=x" gibi iç içe
  // çiftlerde değer ("parola") bir sonraki çiftin adı olarak da denetlenir.
  {
    const desen = /([\p{L}\p{N}_-]{2,40})(\s*[=:]\s*)([^\s,;&"'<>=]+)/gu;
    let sonuc = '';
    let konum = 0;
    for (let e = desen.exec(m); e; e = desen.exec(m)) {
      const [, ad, ara, deger] = e;
      if (gizliAdMi(ad, ekler) && deger !== MASKE) {
        sonuc += m.slice(konum, e.index) + ad + ara + MASKE;
        konum = e.index + e[0].length;
      } else {
        desen.lastIndex = e.index + ad.length + ara.length;
      }
    }
    m = sonuc + m.slice(konum);
  }
  m = m
    // 4) Uzun rakam dizileri (kart / kimlik / telefon no) ve e-posta adresleri.
    .replace(/\d(?:[ -]?\d){9,}/g, MASKE)
    .replace(/[\p{L}\p{N}._%+-]+@([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)/gu, `${MASKE}@$1`);
  return m.length > YAKALANAN_METIN_SINIRI ? `${m.slice(0, YAKALANAN_METIN_SINIRI - 1)}…` : m;
}

/**
 * @typedef {{ kaynak: string; metin: string; adim: string | null; sayi: number; ilk: string; son: string; beklenen: boolean }} YakalananMesaj
 */

/**
 * Test başına toplayıcı: aynı kaynak + metin tek kayıt (sayı artar); en çok EN_COK_YAKALANAN_MESAJ farklı mesaj.
 * @param {{ enCok?: number; simdi?: () => string }} [s]
 */
export function mesajToplayici(s = {}) {
  const enCok = s.enCok ?? EN_COK_YAKALANAN_MESAJ;
  const simdi = s.simdi ?? (() => new Date().toISOString());
  /** @type {Map<string, YakalananMesaj>} */
  const kayitlar = new Map();
  let atlanan = 0;
  return {
    /**
     * @param {{ kaynak: string; metin: string; adim?: string | null; beklenen?: boolean }} k metin ZATEN maskeli olmalı
     * @returns {boolean} yeni kayıt mı
     */
    ekle(k) {
      if (!YAKALAMA_KAYNAKLARI.includes(k.kaynak)) return false;
      const metin = String(k.metin ?? '').trim().slice(0, YAKALANAN_METIN_SINIRI);
      if (!metin) return false;
      const anahtar = `${k.kaynak}\u0000${metin}`;
      const z = simdi();
      const mevcut = kayitlar.get(anahtar);
      if (mevcut) {
        mevcut.sayi++;
        mevcut.son = z;
        if (k.beklenen) mevcut.beklenen = true;
        return false;
      }
      if (kayitlar.size >= enCok) { atlanan++; return false; }
      kayitlar.set(anahtar, { kaynak: k.kaynak, metin, adim: k.adim ? String(k.adim).slice(0, 300) : null, sayi: 1, ilk: z, son: z, beklenen: Boolean(k.beklenen) });
      return true;
    },
    /** @returns {YakalananMesaj[]} */
    liste() {
      return [...kayitlar.values()].map((x) => ({ ...x }));
    },
    /** Sınır aşıldığı için kaydedilmeyen mesaj sayısı. */
    get atlanan() {
      return atlanan;
    }
  };
}

/**
 * Raporlayıcı / depo: annotation JSON'unu (ya da diziyi) doğrulanmış kayıtlara çevirir (bozuk girdiler atlanır).
 * @param {unknown} girdi JSON metni ya da dizi
 * @returns {YakalananMesaj[]}
 */
export function yakalananMesajlariAyristir(girdi) {
  let veri = girdi;
  if (typeof girdi === 'string') {
    try { veri = JSON.parse(girdi); } catch { return []; }
  }
  if (!Array.isArray(veri)) return [];
  /** @param {unknown} d */
  const zaman = (d) => {
    const t = typeof d === 'string' ? new Date(d) : null;
    return t && !Number.isNaN(t.getTime()) ? t.toISOString() : null;
  };
  /** @type {YakalananMesaj[]} */
  const sonuc = [];
  for (const x of veri) {
    if (!x || typeof x !== 'object') continue;
    const k = /** @type {Record<string, unknown>} */ (x);
    if (typeof k.kaynak !== 'string' || !YAKALAMA_KAYNAKLARI.includes(k.kaynak) || typeof k.metin !== 'string' || !k.metin.trim()) continue;
    const ilk = zaman(k.ilk) ?? new Date().toISOString();
    sonuc.push({
      kaynak: k.kaynak, metin: k.metin.trim().slice(0, YAKALANAN_METIN_SINIRI), adim: typeof k.adim === 'string' && k.adim ? k.adim.slice(0, 300) : null,
      sayi: typeof k.sayi === 'number' && Number.isFinite(k.sayi) && k.sayi >= 1 ? Math.min(Math.round(k.sayi), 1_000_000) : 1,
      ilk, son: zaman(k.son) ?? ilk, beklenen: k.beklenen === true
    });
    if (sonuc.length >= EN_COK_YAKALANAN_MESAJ) break;
  }
  return sonuc;
}

/** Ağ kaydının metni: "GET /yol → HTTP 500" (sorgu dizesi yok). @param {string} yontem @param {string} adres @param {number} durum */
export function agMesajiMetni(yontem, adres, durum) {
  let yol = adres;
  try { yol = new URL(adres).pathname; } catch { yol = String(adres).split(/[?#]/)[0]; }
  return `${String(yontem).toUpperCase()} ${yol} → HTTP ${durum}`;
}
