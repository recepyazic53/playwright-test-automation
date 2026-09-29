// FARKINDALIK (Sonuçlar > Genel > Özet): projenin tamamından "şimdi neye bakmalıyım?" sinyallerini üç kartta toplar — Dikkat,
// Bakım, Kapsam ve güvenlik — ve üstteki üç özet kutusunun (Ekranlar, Servisler, Uçtan uca) dönem oranlarını verir.
// Uç: GET /platform/sonuclar/farkindalik?projeId=&baslangic=&bitis= (sunucu-platform.mjs). Kasa açık olmalıdır.
//
// HESAPLAR YENİDEN KULLANILIR (kopya yok):
//   - Dönem, sorunlar (P1), kritik işaret, yavaşlayan metotlar, özet kutuları: genel dönem raporu (donem-raporu.mjs > donemRaporuVerisi,
//     kapsam 'genel' — sorun-modeli.mjs, oncelik.mjs, coklu.mjs, rapor-verileri.mjs'nin hesabı).
//   - Zamanlanmış koşular: genel.mjs > pencereGuvenilirligi (kaçan / atlanan / yarıda), neden tetikleme kaydının mesajından.
//   - Metot kapsamı: genel.mjs > metotKapsami. Test verisi sağlığı: tablo-birlestirme.mjs > veriSagligi.
//   - Sabit tarihi eskiyen senaryolar ve son sonuçlar: senaryo-servisi.mjs > senaryoListesi. Bekleyen bulgular: ekran-servisi.mjs >
//     ekranListesi. Denenmemiş koşul dalları: senaryo-onerileri.mjs'nin kapsam ölçüsü (öneri bağlamı sunucuda kurulur; ekran başına sayı).
//   - Kırmızı: sağlık noktası eşiği (ayarlar/saglik-esikleri.mjs, sarı eşiğin altı) — ekran: tam koşu, servis: gün, akış: koşu.
// EŞİKLER kullanıcı kararıdır (Ayarlar > Arayüz > Sonuçlar özeti; ayarlar/kosu-ayarlari.mjs): ozetKirmiziGun, ozetYavaslamaYuzde,
// ozetKosmayanGun, ozetYedekGun. Kodda kullanıcıya özgü değer yoktur.
// GİZLİLİK: maddelerde yalnız AD ve SAYI vardır (değer, hata metni, gövde yok). Adlar gösterim maskesinden geçer (bilinen gizli
// değerler; gosterim-maskesi.mjs), yol / metot adları ayrıca metin maskesinden (sorgu dizesi, uzun rakam, e-posta).
// ÖNBELLEK: sonuç proje + dönem + eşik + son yedek anahtarıyla ONBELLEK_MS boyunca bellekte tutulur (genel rapor ağırdır).
import { DepoHatasi, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { kosulariHesapIcinOku } from '../veritabani/sonuc-deposu.mjs';
import { saglikEsikleriniOku } from '../ayarlar/saglik-esikleri.mjs';
import { kosuAyarlariniOku, varsayilanKosuAyarlari } from '../ayarlar/kosu-ayarlari.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { izinleriOku } from '../guvenlik/izinler.mjs';
import { IZIN_TANIMLARI, izinAdresi } from '../guvenlik/izin-tanimlari.mjs';
import { riskBelirtilmemisMi } from '../guvenlik/ortam-riski.mjs';
import { GECMIS_SINIRI, kurallariListele } from '../zamanlama/kurallar.mjs';
import { ATLANDI_MESAJI } from '../zamanlama/zamanlayici.mjs';
import { servisAkislariniListele, servisSenaryolariniListele, servisleriListele } from '../servisler/servis-deposu.mjs';
import { veriSagligi } from '../tablolar/tablo-birlestirme.mjs';
import { degerBasvurusuYaz } from '../tablolar/tablo-secimi.mjs';
import { senaryoListesi } from '../senaryolar/senaryo-servisi.mjs';
import { oneriBaglami } from '../senaryolar/oneri-baglami.mjs';
import { senaryoOnerileri } from '../senaryolar/senaryo-onerileri.mjs';
import { formSemasiOlustur } from '../senaryolar/model-formu.mjs';
import { gorunurlukleriHesapla, senaryoyuDogrula } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { ekranListesi } from '../ekranlar/ekran-servisi.mjs';
import { basariYuzdesi } from './hesaplama.mjs';
import { EN_COK_GUN, GERIYE_BAKIS_GUN, GUN_MS, DonemHatasi, donemHesapla, gunAnahtari, gunEkle } from './donem.mjs';
import { metotKapsami, pencereGuvenilirligi } from './genel.mjs';
import { YAVASLAMA_EN_AZ } from './yuzdelik.mjs';
import { akisAdimSatirlari } from './servis-sonuclari.mjs';
import { donemRaporuVerisi, servisMetodu } from './donem-raporu.mjs';
import { gosterimMaskesi } from './gosterim-maskesi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * Kartın bir maddesi: ad (maskeli öğe adı), ayrıntı (yalnız sayı ve sabit metin), adres (tıklayınca açılan ekran).
 * @typedef {{ tur: string; ad: string; ayrinti: string; adres: string }} Madde
 * @typedef {{ basari: number | null; oncekiBasari: number | null; adet: number; oncekiAdet: number | null; basarili: number; kalan: number; birim: string }} OzetKutusu
 */

/** Kartta ilk bakışta gösterilen madde (gerisi "tümü (N)" ile açılır; arayüz kuralı, burada yalnız belge). */
export const KART_ILK_MADDE = 5;
/** Bir kartta en çok madde (aşırı büyük projelerde yanıt sınırı; toplam ayrıca verilir). */
export const KART_EN_COK_MADDE = 200;
/** Önbellek süresi. */
export const ONBELLEK_MS = 60_000;
/** Kırmızı serisinde geriye bakılan en çok gün. */
export const KIRMIZI_GERIYE_BAKIS_GUN = GERIYE_BAKIS_GUN;

/** Eşik ayarlarının anahtarları (Ayarlar > Arayüz > Sonuçlar özeti). */
export const ESIK_ANAHTARLARI = Object.freeze(['ozetKirmiziGun', 'ozetYavaslamaYuzde', 'ozetKosmayanGun', 'ozetYedekGun']);

/** @param {unknown} z */
const ms = (z) => { const t = Date.parse(String(z ?? '')); return Number.isNaN(t) ? null : t; };
/** @param {number} a @param {number} b */
const oranYuzde = (a, b) => (b ? (a / b) * 100 : null);

/**
 * Sonuçlar ekranının tarih aralığından (ISO; null = sınırsız) dönem seçimi: başlangıç ve bitiş günleri dahil özel aralık. Başlangıç
 * yoksa ("Tümü") son 30 gün kullanılır (önceki eşit dönemle karşılaştırılabilsin diye; tumu: true). En çok EN_COK_GUN gün.
 * @param {{ baslangic: string | null; bitis: string | null }} aralik @param {Date} simdi
 * @returns {{ secim: import('./donem.mjs').DonemSecimi; tumu: boolean }}
 */
export function aralikDonemi(aralik, simdi) {
  const bas = aralik.baslangic ? ms(aralik.baslangic) : null;
  if (bas === null) return { secim: { tur: 'son30' }, tumu: true };
  const bitMs = aralik.bitis ? ms(aralik.bitis) ?? simdi.getTime() : simdi.getTime();
  const son = new Date(Math.max(bas, Math.min(bitMs, simdi.getTime())));
  const sonGun = new Date(son.getFullYear(), son.getMonth(), son.getDate());
  const b = new Date(bas);
  let basGun = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  const enErken = gunEkle(sonGun, -(EN_COK_GUN - 1));
  if (basGun < enErken) basGun = enErken;
  return { secim: { tur: 'ozel', baslangic: gunAnahtari(basGun), bitis: gunAnahtari(sonGun) }, tumu: false };
}

/**
 * Şu anki kırmızı serinin başladığı an: en son birim kırmızı değilse null; değilse son yeşil birimden sonraki ilk kırmızı birimin
 * zamanı (hiç yeşil yoksa ilk birimin). Saf.
 * @param {ReadonlyArray<{ zaman: number; kirmizi: boolean }>} birimler zamana göre sırasız olabilir
 * @returns {number | null}
 */
export function kirmiziSeriBaslangici(birimler) {
  const s = birimler.slice().sort((a, b) => a.zaman - b.zaman);
  if (!s.length || !s[s.length - 1].kirmizi) return null;
  let i = s.length - 1;
  while (i > 0 && s[i - 1].kirmizi) i--;
  return s[i].zaman;
}

/**
 * Yavaşlayan metotlar: p95 ≥ önceki p95 × (1 + yüzde / 100) ve bu dönemde en az YAVASLAMA_EN_AZ ölçüm (yuzdelik.mjs ile aynı
 * örnek kuralı; eşik kullanıcının). Saf.
 * @template {{ p95: number | null; oncekiP95: number | null; n: number }} T
 * @param {ReadonlyArray<T>} metotlar @param {number} yuzde
 * @returns {Array<T & { artis: number }>}
 */
export function yavaslayanMetotlar(metotlar, yuzde) {
  return metotlar.filter((m) => m.p95 !== null && m.oncekiP95 !== null && m.oncekiP95 > 0 && m.n >= YAVASLAMA_EN_AZ
    && m.p95 >= m.oncekiP95 * (1 + yuzde / 100))
    .map((m) => ({ ...m, artis: Math.round(((Number(m.p95) - Number(m.oncekiP95)) / Number(m.oncekiP95)) * 100) }))
    .sort((a, b) => b.artis - a.artis);
}

/**
 * Zamanlanmış koşu tetiklemesinin kaçma / atlanma nedeni (kaydın mesajından; metin gösterilmez, yalnız sınıf).
 * @param {{ durum: string; mesaj?: string }} t
 */
export function tetiklemeNedeni(t) {
  const m = String(t.mesaj ?? '');
  if (t.durum === 'yarida') return 'yarıda kaldı (kasa kilitlendi ya da çalışma alanı değişti)';
  if (t.durum === 'hata') return 'başlatılamadı (hata)';
  if (m === ATLANDI_MESAJI) return 'atlandı: başka koşu sürüyordu';
  if (m.includes('izin kapalı')) return 'atlandı: izin kapalı';
  return 'atlandı';
}

/** @type {Map<string, { zaman: number; veri: Awaited<ReturnType<typeof hesapla>> }>} */
const onbellek = new Map();
/** Önbelleği boşaltır (testler; kasa kilitlenince / veri değişince gerekmez: süre kısadır). */
export function farkindalikOnbelleginiTemizle() { onbellek.clear(); }

/**
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ aralik: { baslangic: string | null; bitis: string | null }; simdi?: Date; sonYedek?: string | null; onbellek?: boolean }} s
 *   sonYedek: en son yedeğin zamanı (ISO; yoksa null) — sunucu yedek klasöründen ve son dışa aktarmadan verir.
 */
export async function farkindalikVerisi(vt, projeId, s) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const simdi = s.simdi ?? new Date();
  let ayar = varsayilanKosuAyarlari();
  try { ayar = kosuAyarlariniOku(vt); } catch { /* varsayılanlar */ }
  const esikler = { kirmiziGun: ayar.ozetKirmiziGun, yavaslamaYuzde: ayar.ozetYavaslamaYuzde, kosmayanGun: ayar.ozetKosmayanGun, yedekGun: ayar.ozetYedekGun };
  const donem = aralikDonemi(s.aralik, simdi);
  const anahtar = JSON.stringify([projeId, donem.secim, esikler, s.sonYedek ?? null, gunAnahtari(simdi)]);
  const kayit = onbellek.get(anahtar);
  if (s.onbellek !== false && kayit && simdi.getTime() - kayit.zaman < ONBELLEK_MS && simdi.getTime() >= kayit.zaman) return kayit.veri;
  const veri = await hesapla(vt, projeId, { simdi, esikler, donem, sonYedek: s.sonYedek ?? null });
  if (s.onbellek !== false) {
    for (const [a, v] of onbellek) if (simdi.getTime() - v.zaman >= ONBELLEK_MS) onbellek.delete(a);
    onbellek.set(anahtar, { zaman: simdi.getTime(), veri });
  }
  return veri;
}

/**
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ simdi: Date; esikler: { kirmiziGun: number; yavaslamaYuzde: number; kosmayanGun: number; yedekGun: number };
 *   donem: ReturnType<typeof aralikDonemi>; sonYedek: string | null }} x
 */
async function hesapla(vt, projeId, x) {
  const { simdi, esikler } = x;
  const maske = gosterimMaskesi(vt, projeId);
  /** Öğe adı (yalnız bilinen gizli değerler). @param {unknown} m */
  const ad = (m) => maske.ad(String(m ?? ''));
  /** Yol / metot adı (bilinen gizli değerler + metin kuralları). @param {unknown} m */
  const yolAdi = (m) => maske.metin(maske.ad(String(m ?? '')));
  /** @type {Array<{ sinyal: string; neden: string }>} */
  const hesaplanamayan = [];
  /** Sinyal hesabı başarısız olursa kart boş kalmaz, "hesaplanamadı" notu düşer. @template T @param {string} sinyal @param {() => T} f @param {T} bos @returns {T} */
  const dene = (sinyal, f, bos) => {
    try { return f(); } catch (e) { hesaplanamayan.push({ sinyal, neden: e instanceof DepoHatasi ? e.message : 'Hesaplanırken hata oluştu.' }); return bos; }
  };

  // ---- Genel dönem raporu (P1, kritik, yavaşlama, özet kutuları) ----
  let donemBilgisi = null;
  /** @type {import('./donem-raporu.mjs').DonemRaporuVerisi | null} */
  let rapor = null;
  try {
    donemBilgisi = donemHesapla(x.donem.secim, simdi);
    rapor = await donemRaporuVerisi(vt, {
      projeId, kapsam: 'genel', id: '', tumEkranlar: true, tumServisler: true, donem: x.donem.secim, karsilastir: true, ortamId: null,
      secenekler: { hatalar: false, adres: false, goruntuler: false }
    }, { maskele: maske.metin, simdi });
  } catch (e) {
    // Ekranı ve servisi olmayan proje: rapor yok, "sorun yok" (hesaplanamadı sayılmaz).
    if (!(e instanceof DepoHatasi && /ekran ya da servis yok/.test(e.message))) {
      hesaplanamayan.push({ sinyal: 'Dönem özeti', neden: e instanceof DepoHatasi || e instanceof DonemHatasi ? e.message : 'Genel rapor hesaplanamadı.' });
    }
  }
  const coklu = rapor?.coklu ?? null;
  const akislar = coklu?.akislar ?? [];
  const akisAdresi = (/** @type {{ id: string; tur: string }} */ a) => (a.tur === 'Uçtan uca akış' ? '#/sonuclar/uctan-uca' : `#/sonuclar/servisler/a/${encodeURIComponent(a.id)}`);

  // Özet kutuları: seçili dönemin başarı oranı ve önceki eşit döneme göre fark.
  const et = coklu?.ekranTarafi?.ozet ?? null;
  const st = coklu?.servisTarafi?.ozet ?? null;
  const uu = akislar.filter((a) => a.tur === 'Uçtan uca akış');
  const uuKosu = uu.reduce((t, a) => t + a.kosu, 0);
  const uuBasarili = uu.reduce((t, a) => t + a.basarili, 0);
  const uuOnceki = uu.reduce((t, a) => t + a.oncekiKosu, 0);
  /** @type {{ ekran: OzetKutusu | null; servis: OzetKutusu | null; uctanUca: OzetKutusu | null }} */
  const ozet = {
    ekran: et ? { basari: et.basari, oncekiBasari: et.oncekiBasari, adet: et.test, oncekiAdet: et.oncekiTest, basarili: Math.max(0, et.test - et.basarisiz - et.atlanan), kalan: et.basarisiz, birim: 'test' } : null,
    servis: st ? { basari: st.basari, oncekiBasari: st.oncekiBasari, adet: st.cagri, oncekiAdet: st.oncekiCagri, basarili: Math.max(0, st.cagri - st.kalan), kalan: st.kalan, birim: 'çağrı' } : null,
    uctanUca: uu.length ? {
      basari: oranYuzde(uuBasarili, uuKosu), oncekiBasari: oranYuzde(uu.reduce((t, a) => t + a.oncekiBasarili, 0), uuOnceki), adet: uuKosu,
      oncekiAdet: uuOnceki || null, basarili: uuBasarili, kalan: uuKosu - uuBasarili, birim: 'koşu'
    } : null
  };

  // ================================ DİKKAT ================================
  /** @type {Madde[]} */
  const dikkat = [];
  // Öğe başına TEK madde (ekran / servis / akış): kritik işaretli ve son koşusunda kaldı, P1 sorun sayısı, N gündür kırmızı.
  /** @type {Map<string, { tur: 'ekran' | 'servis' | 'akis'; etiket: string; ad: string; adres: string; kritik: boolean; p1: number; gun: number | null }>} */
  const ogeler = new Map();
  /** @param {string} k @param {{ tur: 'ekran' | 'servis' | 'akis'; etiket: string; ad: string; adres: string }} o */
  const oge = (k, o) => ogeler.get(k) ?? ogeler.set(k, { ...o, kritik: false, p1: 0, gun: null }).get(k);
  // 1) Kritik işaretli öğe son koşusunda kaldı (rapor-verileri.mjs işareti; genel raporun hesabı).
  for (const o of coklu?.ekranTarafi?.ogeler ?? []) {
    const x = o.kritikKaldi ? oge(`ekran:${o.id}`, { tur: 'ekran', etiket: 'Ekran', ad: o.ad, adres: `#/sonuclar/u/${encodeURIComponent(o.id)}` }) : null;
    if (x) x.kritik = true;
  }
  for (const o of coklu?.servisTarafi?.ogeler ?? []) {
    const x = o.kritikKaldi ? oge(`servis:${o.id}`, { tur: 'servis', etiket: 'Servis', ad: o.ad, adres: `#/sonuclar/s/${encodeURIComponent(o.id)}` }) : null;
    if (x) x.kritik = true;
  }
  for (const a of akislar) {
    const x = a.kritik && a.son === 'K' ? oge(`akis:${a.id}`, { tur: 'akis', etiket: a.tur, ad: a.ad, adres: akisAdresi(a) }) : null;
    if (x) x.kritik = true;
  }
  // 2) P1 sorunu olan ya da N gündür kırmızı olan öğeler.
  for (const so of rapor?.sorunlar ?? []) {
    if (so.bant !== 'P1' || so.durum === 'cozulen' || so.durum === 'dogrulanamadi') continue;
    const o = oge(`${so.tur}:${so.ogeId}`, so.tur === 'ekran'
      ? { tur: 'ekran', etiket: 'Ekran', ad: so.ogeAd, adres: `#/sonuclar/u/${encodeURIComponent(so.ogeId)}` }
      : { tur: 'servis', etiket: 'Servis', ad: so.ogeAd, adres: `#/sonuclar/s/${encodeURIComponent(so.ogeId)}` });
    if (o) o.p1++;
  }
  dene('Uzun süredir kırmızı', () => {
    const sari = saglikEsikleriniOku(vt, projeId).sari;
    const altSinir = simdi.getTime() - KIRMIZI_GERIYE_BAKIS_GUN * GUN_MS;
    const gunSayisi = (/** @type {number | null} */ bas) => (bas === null ? null : Math.floor((simdi.getTime() - bas) / GUN_MS));
    const yeterli = (/** @type {number | null} */ g) => g !== null && g >= esikler.kirmiziGun;
    // Ekran: tam koşuların ekran başına başarısı (Sonuçlar ekranının sağlık noktasıyla aynı kural).
    const ekranlar = vt.tumu("SELECT id, ad FROM ekranlar WHERE proje_id = ? AND durum = 'etkin'", [projeId]);
    const kosular = kosulariHesapIcinOku(vt, projeId).filter((k) => k.tur === 'tam' && k.z >= altSinir && k.z <= simdi.getTime());
    for (const e of ekranlar) {
      const id = String(e.id);
      const birimler = kosular.filter((k) => k.urunler[id]).flatMap((k) => {
        const b = basariYuzdesi(k.urunler[id]);
        return b === null ? [] : [{ zaman: k.z, kirmizi: b < sari }];
      });
      const g = gunSayisi(kirmiziSeriBaslangici(birimler));
      if (yeterli(g)) { const o = oge(`ekran:${id}`, { tur: 'ekran', etiket: 'Ekran', ad: String(e.ad), adres: `#/sonuclar/u/${encodeURIComponent(id)}` }); if (o) o.gun = g; }
    }
    // Servis: günlük çağrı başarısı ("koşu" türü; akış adımı satırları hariç — Sonuçlar ekranıyla aynı).
    const adimSatirlari = akisAdimSatirlari(vt, projeId);
    /** @type {Map<string, Map<string, { zaman: number; s: { basarili: number; basarisiz: number; hata: number } }>>} */
    const gunler = new Map();
    for (const r of vt.tumu("SELECT id, servis_id, durum, baslangic FROM servis_kosulari WHERE proje_id = ? AND tur = 'kosu' AND baslangic >= ?", [projeId, new Date(altSinir).toISOString()])) {
      if (adimSatirlari.has(String(r.id))) continue;
      const z = ms(r.baslangic);
      if (z === null || z > simdi.getTime()) continue;
      const sg = gunler.get(String(r.servis_id)) ?? gunler.set(String(r.servis_id), new Map()).get(String(r.servis_id));
      const gun = gunAnahtari(z);
      const k = sg?.get(gun) ?? { zaman: z, s: { basarili: 0, basarisiz: 0, hata: 0 } };
      sg?.set(gun, k);
      k.zaman = Math.min(k.zaman, z);
      const d = String(r.durum);
      if (d === 'basarili' || d === 'basarisiz' || d === 'hata') k.s[d]++;
    }
    for (const sv of servisleriListele(vt, projeId)) {
      if (sv.durum !== 'etkin') continue;
      const birimler = [...(gunler.get(sv.id)?.values() ?? [])].map((k) => ({ zaman: k.zaman, kirmizi: (basariYuzdesi(k.s) ?? 100) < sari }));
      const g = gunSayisi(kirmiziSeriBaslangici(birimler));
      if (yeterli(g)) { const o = oge(`servis:${sv.id}`, { tur: 'servis', etiket: 'Servis', ad: sv.ad, adres: `#/sonuclar/s/${encodeURIComponent(sv.id)}` }); if (o) o.gun = g; }
    }
    // Akış (servis akışı / uçtan uca): koşu başına (başarılı değilse kırmızı).
    /** @type {Map<string, Array<{ zaman: number; kirmizi: boolean }>>} */
    const akisKosulari = new Map();
    for (const r of vt.tumu("SELECT akis_id, durum, baslangic FROM servis_akis_kosulari WHERE proje_id = ? AND tur = 'kosu' AND akis_id IS NOT NULL AND baslangic >= ?", [projeId, new Date(altSinir).toISOString()])) {
      const z = ms(r.baslangic);
      if (z === null || z > simdi.getTime()) continue;
      (akisKosulari.get(String(r.akis_id)) ?? akisKosulari.set(String(r.akis_id), []).get(String(r.akis_id)))?.push({ zaman: z, kirmizi: r.durum !== 'basarili' });
    }
    for (const a of servisAkislariniListele(vt, projeId)) {
      if (a.tur !== 'akis') continue;
      const g = gunSayisi(kirmiziSeriBaslangici(akisKosulari.get(a.id) ?? []));
      const uctanUca = /** @type {Record<string, unknown>} */ (a.icerik ?? {}).uctanUca === true;
      if (yeterli(g)) {
        const o = oge(`akis:${a.id}`, { tur: 'akis', etiket: uctanUca ? 'Uçtan uca akış' : 'Servis akışı', ad: a.baslik, adres: akisAdresi({ id: a.id, tur: uctanUca ? 'Uçtan uca akış' : 'Servis akışı' }) });
        if (o) o.gun = g;
      }
    }
  }, undefined);
  for (const o of [...ogeler.values()].sort((a, b) => Number(b.kritik) - Number(a.kritik) || b.p1 - a.p1 || (b.gun ?? -1) - (a.gun ?? -1) || a.ad.localeCompare(b.ad, 'tr'))) {
    const parca = [o.etiket];
    if (o.kritik) parca.push(o.tur === 'servis' ? 'kritik · son çağrısı kaldı' : 'kritik · son koşusunda kaldı');
    if (o.p1) parca.push(`${o.p1} P1 sorun`);
    if (o.gun !== null) parca.push(`${o.gun} gündür kırmızı`);
    dikkat.push({ tur: o.kritik ? 'kritik' : o.p1 ? 'p1' : 'kirmizi', ad: ad(o.ad), ayrinti: parca.join(' · '), adres: o.adres });
  }

  // 3) Yavaşlayan servis metotları (p95, önceki eşit döneme göre; eşik kullanıcının).
  for (const m of yavaslayanMetotlar(coklu?.servisTarafi?.metotlar ?? [], esikler.yavaslamaYuzde)) {
    dikkat.push({ tur: 'yavas', ad: `${ad(m.servis)} › ${yolAdi(m.ad)}`, ayrinti: `Yavaşladı · p95 %${m.artis} arttı (${m.n} ölçüm)`, adres: `#/sonuclar/s/${encodeURIComponent(m.servisId)}` });
  }

  // 4) Kaçan / atlanan / yarıda kalan zamanlanmış koşular (seçili dönem; neden tetikleme kaydından).
  dene('Zamanlanmış koşular', () => {
    if (!donemBilgisi) return;
    for (const k of kurallariListele(vt, projeId, { simdi })) {
      if (!k.etkin) continue;
      const p = pencereGuvenilirligi(k, k.gecmis, { bas: donemBilgisi.bas.getTime(), bit: donemBilgisi.bit.getTime(), simdi: simdi.getTime(), gecmisSiniri: GECMIS_SINIRI });
      /** @type {Map<string, number>} */
      const nedenler = new Map();
      if (p.kacan) nedenler.set('kaçtı (Nöbetçi kapalı ya da kasa kilitliydi)', p.kacan);
      for (const t of k.gecmis) {
        const z = ms(t.zaman);
        if (z === null || z < p.bas || z >= p.bit || !['atlandi', 'yarida', 'hata'].includes(t.durum)) continue;
        const n = tetiklemeNedeni(t);
        nedenler.set(n, (nedenler.get(n) ?? 0) + 1);
      }
      if (!nedenler.size) continue;
      dikkat.push({
        tur: 'zamanlanmis', ad: ad(k.ad),
        ayrinti: `Zamanlanmış koşu · ${[...nedenler.entries()].sort((a, b) => b[1] - a[1]).map(([n, s]) => `${s} ${n}`).join(', ')}`,
        adres: '#/ayarlar/kosu'
      });
    }
  }, undefined);

  // ================================ BAKIM ================================
  /** @type {Madde[]} */
  const bakim = [];
  const liste = dene('Senaryolar', () => senaryoListesi(vt, projeId, null), null);
  const senaryoAdresi = (/** @type {string} */ id) => `#/senaryolar/duzenle/${encodeURIComponent(id)}`;
  // 1) Sabit tarihi geçmişte kalan senaryolar.
  for (const sen of liste?.senaryolar ?? []) {
    if (!sen.eskiyenTarihler.length) continue;
    bakim.push({ tur: 'tarih', ad: `${sen.ekranAdi ? `${ad(sen.ekranAdi)} › ` : ''}${ad(sen.baslik)}`,
      ayrinti: `Sabit tarih geçmişte · ${sen.eskiyenTarihler.length} alan`, adres: senaryoAdresi(sen.id) });
  }
  // 2) Koşuya dahil olup N gündür hiç koşmayan senaryolar (ekran + servis; en az N gün önce oluşturulmuş).
  const kosmayanSinir = simdi.getTime() - esikler.kosmayanGun * GUN_MS;
  dene('Koşmayan senaryolar', () => {
    const olusturulma = new Map(vt.tumu('SELECT id, olusturulma FROM senaryolar WHERE proje_id = ?', [projeId]).map((r) => [String(r.id), ms(r.olusturulma)]));
    for (const sen of liste?.senaryolar ?? []) {
      if (!sen.kosuyaDahil || !sen.ekranEtkin) continue;
      const olus = olusturulma.get(sen.id) ?? null;
      if (olus === null || olus > kosmayanSinir) continue;
      const son = [sen.sonSonuc, ...(sen.ortamlar ?? []).map((o) => o.sonSonuc)].map((y) => (y ? ms(y.zaman) : null)).filter((z) => z !== null)
        .reduce((a, b) => Math.max(Number(a), Number(b)), -Infinity);
      if (Number.isFinite(son) && Number(son) > kosmayanSinir) continue;
      bakim.push({ tur: 'kosmayan', ad: `${sen.ekranAdi ? `${ad(sen.ekranAdi)} › ` : ''}${ad(sen.baslik)}`,
        ayrinti: Number.isFinite(son) ? `${Math.floor((simdi.getTime() - Number(son)) / GUN_MS)} gündür koşmadı` : 'Hiç koşmadı', adres: senaryoAdresi(sen.id) });
    }
    const sonCagri = new Map(vt.tumu("SELECT senaryo_id, MAX(baslangic) AS son FROM servis_kosulari WHERE proje_id = ? AND tur = 'kosu' AND senaryo_id IS NOT NULL GROUP BY senaryo_id", [projeId])
      .map((r) => [String(r.senaryo_id), ms(r.son)]));
    for (const sv of servisleriListele(vt, projeId)) {
      if (sv.durum !== 'etkin') continue;
      for (const sen of servisSenaryolariniListele(vt, sv.id)) {
        const olus = ms(sen.olusturulma);
        if (!sen.kosuyaDahil || olus === null || olus > kosmayanSinir) continue;
        const son = sonCagri.get(sen.id) ?? null;
        if (son !== null && son > kosmayanSinir) continue;
        bakim.push({ tur: 'kosmayan', ad: `${ad(sv.ad)} › ${ad(sen.baslik)}`,
          ayrinti: son !== null ? `${Math.floor((simdi.getTime() - son) / GUN_MS)} gündür koşmadı` : 'Hiç koşmadı',
          adres: `#/servisler/s/${encodeURIComponent(sv.id)}/senaryo/${encodeURIComponent(sen.id)}` });
      }
    }
  }, undefined);
  // 3) Bekleyen bulgular (ekran analizi; karar bekleyen model farkları).
  const ekranBilgisi = dene('Bekleyen bulgular', () => ekranListesi(vt, projeId), null);
  for (const e of ekranBilgisi?.ekranlar ?? []) {
    if (!e.bekleyenAnaliz || !e.bekleyenAnaliz.bulguSayisi) continue;
    bakim.push({ tur: 'bulgu', ad: ad(e.ad), ayrinti: `${e.bekleyenAnaliz.bulguSayisi} bekleyen bulgu`, adres: `#/ekranlar/e/${encodeURIComponent(e.id)}/bulgular` });
  }
  // 4) Test verisi sağlığı (Test verisi ekranındaki denetimler; yalnız sayı).
  dene('Test verisi sağlığı', () => {
    const v = veriSagligi(vt, projeId);
    const satirlar = /** @type {Array<[string, number]>} */ ([
      ['Kırık tablo başvurusu', v.kirikBasvurular.length], ['Kullanılmayan tablo', v.kullanilmayan.length],
      ['Birleştirilebilecek tablolar', v.benzer.filter((o) => o.puan >= v.benzerlikEsigi).length], ['Boş sütun', v.bosSutunlar.length]
    ]);
    for (const [baslik, n] of satirlar) if (n) bakim.push({ tur: 'veri', ad: baslik, ayrinti: `Test verisi sağlığı · ${n}`, adres: '#/veri' });
  }, undefined);

  // ================================ KAPSAM VE GÜVENLİK ================================
  /** @type {Madde[]} */
  const kapsam = [];
  // 1) Senaryosu olmayan servis metotları (sözleşmedeki operasyonlar; genel.mjs > metotKapsami).
  dene('Metot kapsamı', () => {
    for (const sv of servisleriListele(vt, projeId)) {
      const k = metotKapsami(sv.ayarlar?.operasyonlar, servisSenaryolariniListele(vt, sv.id).map((y) => ({
        operasyon: /** @type {Record<string, unknown>} */ (y.icerik ?? {}).operasyon, metot: servisMetodu(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (y.icerik)))
      })));
      if (!k || !k.eksik.length) continue;
      kapsam.push({ tur: 'metot', ad: ad(sv.ad), ayrinti: `${k.eksik.length} / ${k.toplam} metodun senaryosu yok`, adres: `#/servisler/s/${encodeURIComponent(sv.id)}/sozlesme` });
    }
  }, undefined);
  // 2) Denenmemiş koşul dalları (senaryo önerilerinin kapsam ölçüsü; ekran başına sayı, varsayılan ortam ve akış).
  dene('Koşul dalları', () => {
    const ortamlar = ortamlariListele(vt, projeId);
    const ortam = ortamlar.find((o) => o.varsayilan) ?? ortamlar[0];
    if (!ortam) return;
    let ekAdlar = /** @type {string[]} */ ([]);
    try { ekAdlar = ekGizliAdlar(vt); } catch { ekAdlar = []; }
    for (const e of ekranBilgisi?.ekranlar ?? []) {
      if (e.modelTuru !== 'ekran' || e.durum !== 'etkin') continue;
      let k;
      try { k = dalKapsami(vt, projeId, e.id, ortam.id, ekAdlar, simdi); } catch { k = null; }
      if (k === null) { hesaplanamayan.push({ sinyal: 'Koşul dalları', neden: `${ad(e.ad)}: öneri bağlamı kurulamadı.` }); continue; }
      const eksik = k.toplam - k.kapsanan;
      if (eksik > 0) kapsam.push({ tur: 'dal', ad: ad(e.ad), ayrinti: `${eksik} / ${k.toplam} koşul dalı denenmedi`, adres: `#/senaryolar/oneriler/${encodeURIComponent(e.id)}` });
    }
  }, undefined);
  // 3) Son yedeğin yaşı.
  const yedekMs = x.sonYedek ? ms(x.sonYedek) : null;
  const yedekGun = yedekMs === null ? null : Math.max(0, Math.floor((simdi.getTime() - yedekMs) / GUN_MS));
  if (yedekGun === null) kapsam.push({ tur: 'yedek', ad: 'Yedek', ayrinti: 'Hiç yedek alınmamış', adres: '#/ayarlar/yedekleme' });
  else if (yedekGun >= esikler.yedekGun) kapsam.push({ tur: 'yedek', ad: 'Son yedek', ayrinti: `${yedekGun} gün önce alındı`, adres: '#/ayarlar/yedekleme' });
  // 4) Açık yüksek riskli izinler (izin-tanimlari.mjs > yuksekRisk).
  dene('İzinler', () => {
    const acik = izinleriOku(vt);
    for (const t of IZIN_TANIMLARI) if (t.yuksekRisk && acik[t.anahtar]) kapsam.push({ tur: 'izin', ad: t.etiket, ayrinti: 'Riskli izin açık', adres: izinAdresi(t.anahtar) });
  }, undefined);
  // 5) Türü (Test / Canlı) seçilmemiş ortamlar.
  dene('Ortam türü', () => {
    for (const o of ortamlariListele(vt, projeId)) if (riskBelirtilmemisMi(o)) kapsam.push({ tur: 'ortam', ad: ad(o.ad), ayrinti: 'Ortam türü seçilmemiş (Canlı sayılır)', adres: '#/ayarlar/proje' });
  }, undefined);

  const kart = (/** @type {Madde[]} */ l) => ({ toplam: l.length, maddeler: l.slice(0, KART_EN_COK_MADDE) });
  return {
    olusturma: simdi.toISOString(),
    donem: donemBilgisi ? { etiket: donemBilgisi.etiket, oncekiEtiket: donemBilgisi.oncekiEtiket, gun: donemBilgisi.gun, tumu: x.donem.tumu } : null,
    esikler, ozet,
    kartlar: { dikkat: kart(dikkat), bakim: kart(bakim), kapsam: kart(kapsam) },
    hesaplanamayan
  };
}

/**
 * Ekranın koşul dalı kapsamı: senaryo önerilerindeki ölçünün aynısı (öneri üretimi ve pairwise çalıştırılmaz: kombinasyon alanı yok,
 * tek öneri). Model yoksa null.
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {string[]} ekAdlar @param {Date} simdi
 * @returns {{ kapsanan: number; toplam: number } | null}
 */
export function dalKapsami(vt, projeId, ekranId, ortamId, ekAdlar, simdi) {
  const b = /** @type {Record<string, any>} */ (oneriBaglami(vt, projeId, ekranId, ortamId, null, simdi));
  if (!b.model) return null;
  const sema = formSemasiOlustur(b.model, b.altModeller);
  const dogrulamaBaglami = { model: b.model, altModeller: b.altModeller, kaynak: 'kayit' };
  /** @type {Record<string, string>} */
  const tabloBasvurulari = {};
  for (const l of Array.isArray(b.degerListeleri) ? b.degerListeleri : []) {
    if (l && l.baglanti && l.hedef && l.hedef.alan && !tabloBasvurulari[l.hedef.alan]) tabloBasvurulari[l.hedef.alan] = degerBasvurusuYaz(l.baglanti.tablo, l.baglanti.sutun, l.baglanti.etiket || '');
  }
  const sonuc = senaryoOnerileri({
    model: b.model, sema, senaryolar: b.senaryolar, kapsamSenaryolari: b.kapsamSenaryolari || [], tabloBasvurulari, haricAlanlar: Object.keys(b.kayitBaglari || {}),
    kombinasyonAlanlari: [], gecmis: b.gecmis, kararlar: b.kararlar || [], ekranId, ustSinir: 1, simdi,
    gorunurlukHesapla: (veri) => gorunurlukleriHesapla(veri, /** @type {any} */ (dogrulamaBaglami)),
    dogrula: (veri) => senaryoyuDogrula(veri, /** @type {any} */ (dogrulamaBaglami)),
    gizliAdMi: (a) => gizliAdMi(a, ekAdlar)
  });
  return { kapsanan: sonuc.kapsam.dallar.kapsanan, toplam: sonuc.kapsam.dallar.toplam };
}
