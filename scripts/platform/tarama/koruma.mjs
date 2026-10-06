// OTOMATİK TARAMA KORUMASI (genel, saf fonksiyonlar) — tarama işinin güvenlik kararları:
//   hedefCoz              hedef yol/adres → ortamın kökeninde (ya da ortamın KAYITLI taban adreslerinin kökeninde) bir yol; kayıtsız başka
//                         köken HedefHatasi.bilinmeyenKoken ile reddedilir (arayüz "kaydedeyim mi?" diye sorar); kullanıcı:parola@, javascript: reddedilir
//   ekKokenleri           ortamın kayıtlı taban adreslerinin (ayarlar.tabanAdlari) kökenleri (ortamın kendi kökeni hariç)
//   taramaAdresleri       tarama başlamadan yasaklı adres denetimine giren TAM adresler (ortam, hedef, giriş tarifi,
//                         bağlam adımlarının "git" adresleri — yer tutucular her profilin değerleriyle doldurulur)
//   yasakliAdresBul       bu adreslerden yasaklı kalıba uyan ilki (tarama tarayıcı açılmadan REDDEDİLİR)
//   istekKarari           tarayıcıdaki her isteğin kararı: yasaklı host → her zaman iptal; izinli köken listesi
//                         verilmişse (testler) dışındaki köken → iptal; TARAMA aşamasında GET/HEAD dışı her istek
//                         (form gönderimi, XHR POST, sendBeacon…) → iptal. Giriş ve bağlam değiştirme aşamaları
//                         tarif güdümlüdür (izinli). KAYIT aşamasında ("Akışı kaydet") akışı kullanıcı yürütür:
//                         yazma istekleri izinlidir (kullanıcı bunu başlatırken onaylar); yasaklı host ve izinli köken
//                         engeli bu aşamada da geçerlidir. SEÇME aşamasında ("Sayfada seç"; öğe seçme) tarama gibi
//                         yalnız GET/HEAD geçer: kullanıcının açtığı pencereden de kayıt oluşturan / gönderen istek gitmez.
//   kesifGuvenligi        GÜVENLİ DÜĞME KURALININ keşif için genişletilmiş hâli: keşif YALNIZ seçim değiştirir (açılır liste,
//                         radyo, onay kutusu); düğmeye / bağlantıya hiç dokunmaz. Etiketi, adı ya da seçenekleri kayıt
//                         oluşturmayı / göndermeyi / onaylamayı / silmeyi / ödemeyi çağrıştıran seçim de DENENMEZ (ör. "Kaydı
//                         onaylıyorum", "Otomatik gönder"). Sayfanın kendi betiği keşif sırasında bir düğmeye basmaya çalışırsa
//                         tıklama sayfa içinde yutulur (sayfa-envanteri.ts > formGonderimKorumasi) ve yazma istekleri ağ
//                         katmanında iptal edilir.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: koruma.d.mts.

import { adresYasakliMi } from '../senaryolar/model-kosusu.mjs';
import { yerTutuculariDoldur } from '../giris/tarif.mjs';

/** Tarama aşamasında izin verilen HTTP yöntemleri (yalnızca okuma). */
export const OKUMA_YONTEMLERI = Object.freeze(['GET', 'HEAD']);

export class HedefHatasi extends Error {
  /** @param {string} mesaj @param {string | null} [bilinmeyenKoken] kayıtlı olmayan başka sitenin kökeni (yoksa null) */
  constructor(mesaj, bilinmeyenKoken = null) {
    super(mesaj);
    this.name = 'HedefHatasi';
    this.bilinmeyenKoken = bilinmeyenKoken;
  }
}

/**
 * Ortamın kayıtlı taban adreslerinin kökenleri (ortam.ayarlar.tabanAdlari; ortamın kendi kökeni ve geçersiz adresler hariç).
 * @param {{ tabanUrl?: string; ayarlar?: Record<string, unknown> } | null | undefined} ortam @returns {string[]}
 */
export function ekKokenleri(ortam) {
  const x = ortam?.ayarlar?.tabanAdlari;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return [];
  /** @type {string | null} */
  let kendi = null;
  try { kendi = new URL(String(ortam?.tabanUrl ?? '')).origin; } catch { /* geçersiz: ek kökenler yine de döner */ }
  /** @type {Set<string>} */
  const kokenler = new Set();
  for (const v of Object.values(x)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    try {
      const u = new URL(v.trim());
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== kendi) kokenler.add(u.origin);
    } catch { /* geçersiz adres yok sayılır */ }
  }
  return [...kokenler];
}

/**
 * Hedefi ortamın taban adresine göre çözer. Kabul: "/" ile başlayan yol, göreli yol (taban adrese göre) ya da
 * ortamla AYNI kökende (ya da ekKokenler: ortamın kayıtlı taban adreslerinin kökenlerinde) tam http(s) adresi. Kayıtsız başka
 * köken reddedilir (HedefHatasi.bilinmeyenKoken doludur; hiçbir istek atılmaz).
 * @param {string} tabanUrl @param {unknown} hedef @param {string[]} [ekKokenler]
 * @returns {{ adres: string; yol: string; koken?: string }} adres: tam adres; yol: pathname + search (paketin urlYolu); koken: yalnız ortamdan
 *   farklı (kayıtlı) sitede
 */
export function hedefCoz(tabanUrl, hedef, ekKokenler = []) {
  let taban;
  try { taban = new URL(tabanUrl); } catch { throw new HedefHatasi('Ortamın adresi geçerli bir http(s) adresi değil (Ayarlar > Ortamlar).'); }
  if (taban.protocol !== 'http:' && taban.protocol !== 'https:') throw new HedefHatasi('Ortamın adresi http(s) olmalı (Ayarlar > Ortamlar).');
  if (typeof hedef !== 'string' || !hedef.trim()) throw new HedefHatasi('Taranacak sayfanın yolunu yazın (ör. /satis/odeme/).');
  const metin = hedef.trim();
  if (metin.length > 2000) throw new HedefHatasi('Hedef adres çok uzun.');
  let u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(metin)) {
    try { u = new URL(metin); } catch { throw new HedefHatasi('Hedef adres geçersiz.'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HedefHatasi('Hedef yalnızca http(s) adresi ya da yol olabilir.');
  } else {
    try { u = new URL(metin, taban); } catch { throw new HedefHatasi('Hedef yol geçersiz.'); }
  }
  if (u.username || u.password) throw new HedefHatasi('Adreste kullanıcı adı/parola yazılamaz.');
  const baska = u.origin !== taban.origin;
  if (baska && !ekKokenler.includes(u.origin)) {
    throw new HedefHatasi(`Bu site adresi kayıtlı değil (${u.origin}). Taban adres olarak kaydedeyim mi? (kaydedilirse yolu ayırırım)`, u.origin);
  }
  const yol = `${u.pathname}${u.search}`;
  if (!yol.startsWith('/') || yol.startsWith('//')) throw new HedefHatasi('Hedef yol "/" ile başlamalı.');
  return baska ? { adres: `${u.origin}${yol}`, yol, koken: u.origin } : { adres: `${u.origin}${yol}`, yol };
}

/**
 * Yasaklı adres denetimine giren TAM adresler.
 * @param {string} tabanUrl @param {string} hedefAdres
 * @param {import('../giris/tarif.d.mts').GirisTarifi | null} tarif
 * @param {Array<Record<string, unknown> | null>} profilDegerleri
 */
export function taramaAdresleri(tabanUrl, hedefAdres, tarif, profilDegerleri) {
  const adresler = [tabanUrl, hedefAdres];
  if (tarif) {
    adresler.push(tarif.girisAdresi, tarif.oturumKontrolAdresi);
    // Giriş adımlarındaki "Sayfaya git" (yer tutucusuz hâli; ek alan değerleri burada yok) da denetlenir.
    for (const a of tarif.girisAdimlari ?? []) if (a.islem === 'git') adresler.push(a.adres);
    for (const a of tarif.baglamDegistirme?.adimlar ?? []) {
      if (a.islem !== 'git') continue;
      adresler.push(a.adres);
      for (const d of profilDegerleri) {
        if (!d) continue;
        try { adresler.push(yerTutuculariDoldur(a.adres, d)); } catch { /* eksik alan: bağlam adımı zaten hata verir */ }
      }
    }
  }
  return [...new Set(adresler.filter((a) => typeof a === 'string' && /^https?:\/\//i.test(a)))];
}

/**
 * Yasaklı kalıba uyan ilk adres (yoksa null).
 * @param {string[]} adresler @param {Array<{ kalip: string; desen: RegExp }>} desenler
 * @returns {{ adres: string; host: string; kalip: string } | null}
 */
export function yasakliAdresBul(adresler, desenler) {
  for (const adres of adresler) {
    const kalip = adresYasakliMi(adres, desenler);
    if (kalip) {
      let host = '?';
      try { host = new URL(adres).hostname; } catch { /* yok */ }
      return { adres, host, kalip };
    }
  }
  return null;
}

/** Yasaklı adres nedeniyle reddedilen taramanın mesajı (host yazılır; yol/sorgu yazılmaz). @param {{ host: string; kalip: string }} b */
export function yasakliTaramaMesaji(b) {
  return `Tarama reddedildi: ${b.host} adresi yasaklı adres kalıbına ("${b.kalip}") uyuyor (Ayarlar > Güvenlik > Yasak adresler ya da NOBETCI_YASAK_ADRESLER). Tarayıcı açılmadı; siteye hiçbir istek gönderilmedi.`;
}

/** Günlük/kayıt için adresin kökeni + yolu (sorgu ve parça yazılmaz — değer taşıyabilir). @param {string} adres */
export function adresOzeti(adres) {
  try {
    const u = new URL(adres);
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return String(adres).split(/[?#]/)[0].slice(0, 300);
  }
}

/**
 * Tarayıcıdaki bir isteğin kararı.
 * @param {{ yontem: string; adres: string; asama: 'hazirlik' | 'giris' | 'baglam' | 'tarama' | 'kayit';
 *   yasakDesenleri: Array<{ kalip: string; desen: RegExp }>; izinliKokenler?: string[] | null }} i
 * @returns {{ izin: true } | { izin: false; neden: 'yazma' | 'yasakli' | 'izinsiz-koken'; kalip?: string }}
 */
export function istekKarari(i) {
  const adres = String(i.adres);
  if (/^(data|blob|about):/i.test(adres)) return { izin: true };
  const kalip = adresYasakliMi(adres, i.yasakDesenleri);
  if (kalip) return { izin: false, neden: 'yasakli', kalip };
  if (i.izinliKokenler && i.izinliKokenler.length) {
    let koken = '';
    try { koken = new URL(adres).origin; } catch { koken = ''; }
    if (!i.izinliKokenler.includes(koken)) return { izin: false, neden: 'izinsiz-koken' };
  }
  // (Öğe seçme — 'secme' — kullanıcının yürüttüğü sayfadır: ilgili sayfaya gidebilmek için alan doldurup istek atabilir; yazma serbest.)
  if (i.asama === 'tarama' && !OKUMA_YONTEMLERI.includes(String(i.yontem).toUpperCase())) return { izin: false, neden: 'yazma' };
  return { izin: true };
}

/** Keşfin dokunabileceği alan türleri (seçimler). Düğmeler, bağlantılar ve metin alanları hiçbir zaman değiştirilmez. */
export const KESIF_TURLERI = Object.freeze(['select', 'radio', 'checkbox']);
/**
 * Kayıt oluşturmayı / göndermeyi / onaylamayı / silmeyi / ödemeyi çağrıştıran sözcükler (etiket, ad, kimlik, seçenek metni).
 * Böyle bir seçim keşifte denenmez (değiştirilmesi sayfanın bir işlemi başlatmasına yol açabilir).
 */
export const KESIF_RISKLI_DESENI = /(kaydet|kayd[ıi] ?(oluştur|tamamla)|gönder|onay|kabul|sil\b|silin|iptal|öde\b|ödemeyi (yap|tamamla)|satın|imzala|tamamla|bitir|sipariş ver|submit|save|send|delete|remove|confirm|accept|agree|approve|pay\b|purchase|checkout)/iu;

/**
 * Keşif bu alanı değiştirebilir mi? (güvenli düğme kuralının keşif hâli). Yalnız etkin, salt okunur olmayan seçimler; kayıt /
 * gönderim çağrıştıran etiketli olanlar atlanır (neden raporda görünür).
 * @param {{ tur: string; etiket?: string | null; ad?: string | null; kimlik?: string | null; devreDisi?: boolean; saltOkunur?: boolean;
 *   radyolar?: Array<{ metin?: string | null; deger?: string }> }} a
 * @returns {{ guvenli: true } | { guvenli: false; neden: string }}
 */
export function kesifGuvenligi(a) {
  if (!KESIF_TURLERI.includes(String(a.tur))) return { guvenli: false, neden: 'yalnız açılır liste, radyo ve onay kutusu denenir' };
  if (a.devreDisi || a.saltOkunur) return { guvenli: false, neden: 'devre dışı ya da salt okunur' };
  const metinler = [a.etiket, a.ad, a.kimlik, ...(a.radyolar ?? []).map((r) => r.metin)].filter((m) => typeof m === 'string' && m);
  const riskli = metinler.find((m) => KESIF_RISKLI_DESENI.test(String(m)));
  if (riskli) return { guvenli: false, neden: `güvenlik: "${String(riskli).slice(0, 60)}" kayıt / gönderim çağrıştırıyor, denenmedi` };
  return { guvenli: true };
}
