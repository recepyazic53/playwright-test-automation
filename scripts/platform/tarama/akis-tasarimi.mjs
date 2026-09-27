// AKIŞ TASARIMI (genel, saf) — "Akışı kaydet"in TOPLA → TASARLA biçimi.
// Kayıtta kullanıcı akışı sayfada yürütür; panel yalnızca TOPLAR: görülen alanlar (kullanıcı listede işaretler), basılan
// düğmeler, seçilen mesajlar ve olay sırası (ekran okumaları, düğme basışları). "Bitir"den sonra Nöbetçi'de akış diyagramı
// kurulur: blok türleri
//   alanlar  { ad, alanlar: [alan anahtarı], zorunlu: [alan anahtarı] }  bu adımda doldurulacak alanlar; "zorunlu" olanlar
//            senaryoda değer ister ve koşuda ekranda görünmezse test başarısız olur (koşullu alanda koşul sağlanınca);
//            diğerleri "görünürse doldur" (boş bırakılabilir; görünmüyorsa atlanır). Taslakta sayfanın zorunlu işaretledikleri.
//            kosullar: { [alan]: { secim, degerler } | null } — alanın görünürlük koşulu ("<seçim> şu değerlerdeyken görünür";
//            null: koşulsuz). Taslakta kayıt okumalarından otomatik bulunur (secimKosuluCikar); kullanıcı düzeltir. Listede
//            olmayan alan için koşul otomatik çıkarılır. Koşuldaki seçim alanı akışta (bir alan grubunda) olmalı.
//   aksiyon  { dugme: sıra, istegeBagli }           düğmeye basılır (isteğe bağlıysa senaryoda "… dahil" ile seçilir)
//   mesaj    { mesaj: sıra | null, metin }          beklenen mesaj (aranacak metin; öğe seçildiyse onun içinde aranır)
//   bekle    { saniye }                              süreli bekleme (1–120 sn): önceki düğmeden sonra (düğme yoksa alanlardan
//            sonra) bekler. Bekleme konmasa da koşucu sonraki alan / beklenen mesaj görünene kadar bekler.
//   sql      { ad, sql: SqlTanimi }                 SQL sorgusu adımı (sql/sql-adimi.mjs): kendi adımıdır; koşuda seçilen
//            veritabanı bağlantısında sorgu çalışır, sonuç beklenenle karşılaştırılır. Bir aksiyondan (ya da ortak akıştan)
//            sonra ya da akışın başında gelir; ardındaki beklenen mesaj / bekleme önceki ekran adımına aittir.
//   dosya    { ad, dugme: sıra, dosya: DosyaTanimi }  İndirilen dosyayı doğrula (dosyalar/dosya-icerigi.mjs): kendi adımıdır; koşuda
//            düğmeye basılır, indirilen dosya (CSV / XLSX / PDF / metin) beklentilerle doğrulanır. SQL adımıyla aynı yerde durur.
//   giris    { ad, profil }                         Yeniden giriş: oturum kapatılır (çerezler temizlenir), ortamın giriş tarifiyle
//            (profil: giriş profilinin adı; boşsa ortamın varsayılanı) yeniden girilir; kendi adımıdır, aksiyondan sonra gelir.
//   bitir    {}                                     akışın sonu (zorunlu, son blok)
//
//   akisTaslagi(envanter)                    kayıttaki olay sırasından HAZIR taslak: her düğme basışı bir aksiyon, aradaki
//                                            dokunulan (ve listede işaretli) alanlar bir alan grubu, seçilen mesajlar mesaj.
//   akisPaleti(envanter, bloklar)            tasarım sayfasının sağ listesi (etiket/tür; hangi blokta kullanıldığı).
//   akistanKayitEnvanteri(envanter, bloklar) blokları doğrular ve adım biçimindeki kayıt envanterine çevirir →
//                                            kayitPaketiOlustur (alt adımlar, isteğe bağlı adımlar, seçime göre görünürlük
//                                            koşulları, mevcut modelle birleştirme) aynen kullanılır.
// Kurallar: alan bir alan grubunda en fazla bir kez; boş alan grubu yalnızca ardından aksiyon gelirse olur (alansız adımı
// adlandırmak için, ör. "Onay"); isteğe bağlı aksiyondan HEMEN sonraki alan grubu o aksiyonun
// parçasıdır (düğme basılınca açılan alanlar; aynı koşula bağlı); zorunlu aksiyon önceki grubun ilerleme düğmesidir;
// aksiyondan sonraki mesaj o düğmeden sonra beklenir, son mesaj akışın başarı göstergesidir.
// Alan DEĞERİ yoktur (yalnızca select/radyonun seçili SEÇENEĞİ, koşul çıkarımı için). NOT: import.meta KULLANILMAZ.
// Tipler: akis-tasarimi.d.mts.

import { UYARI_EN_COK, VEYA_EN_COK } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';
import { sabitGostergeMetni, secimKosuluCikar } from './paket-olusturucu.mjs';
import { sqlTanimiDogrula } from '../sql/sql-adimi.mjs';
import { dosyaTanimiDogrula } from '../dosyalar/dosya-icerigi.mjs';

export const BLOK_EN_COK = 200;
export const BEKLEME_EN_COK_SN = 120;
/** Art arda beklenen mesajlar bir "veya" grubudur (herhangi biri görünürse başarılı); en çok bu kadar. */
export const MESAJ_GRUBU_EN_COK = VEYA_EN_COK;
const AD_EN_COK = 80;
const METIN_EN_COK = 200;

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @param {unknown} d @param {number} n */
const metin = (d, n) => (typeof d === 'string' && d.trim() ? d.replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** @param {import('./paket-olusturucu.d.mts').HamAlan} a */
const alanEtiketi = (a) => a.etiket || a.ad || a.anahtar;

/** Gözlem başına en çok seçenek ve toplam gözlem (kayıt motoru da aynı sınırları uygular). */
const GOZLEM_EN_COK = 2000;
const GOZLEM_SECENEK_EN_COK = 300;

/**
 * Alt süreçten gelen seçenek gözlemlerini süzer (biçimsiz olanlar atılır; metinler kısaltılır).
 * @param {unknown} ham @returns {import('./paket-olusturucu.d.mts').SecenekGozlemi[]}
 */
export function secenekGozlemleriniAyikla(ham) {
  if (!Array.isArray(ham)) return [];
  /** @type {import('./paket-olusturucu.d.mts').SecenekGozlemi[]} */
  const sonuc = [];
  for (const g of ham.slice(0, GOZLEM_EN_COK)) {
    if (!nesneMi(g) || typeof g.anahtar !== 'string' || !g.anahtar || !Array.isArray(g.secenekler)) continue;
    /** @type {Record<string, string>} */
    const secimler = {};
    for (const [k, v] of Object.entries(nesneMi(g.secimler) ? g.secimler : {})) if (typeof v === 'string' && k.length <= 300) secimler[k] = v.slice(0, 200);
    const secenekler = g.secenekler.slice(0, GOZLEM_SECENEK_EN_COK).filter((x) => nesneMi(x) && typeof x.deger === 'string')
      .map((x) => ({ deger: String(x.deger).slice(0, 200), metin: typeof x.metin === 'string' ? x.metin.slice(0, 200) : String(x.deger).slice(0, 200) }));
    if (secenekler.length) sonuc.push({ anahtar: g.anahtar.slice(0, 300), secimler, secenekler, ...(g.kaynak === 'acilir' ? { kaynak: 'acilir' } : { kaynak: 'liste' }) });
  }
  return sonuc;
}

/** Alt süreçten gelen akış envanterinin biçimi geçerli mi? (içerik ayrıca süzülür) @param {unknown} e */
export function akisEnvanteriMi(e) {
  return nesneMi(e) && e.kip === 'kayit' && e.bicim === 'akis' && Array.isArray(e.alanlar) && Array.isArray(e.dugmeler)
    && Array.isArray(e.mesajlar) && Array.isArray(e.olaylar) && Array.isArray(e.engellenenler) && Array.isArray(e.notlar);
}

/** Seçim alanının geçerli (boş olmayan) seçenek değerleri. @param {import('./paket-olusturucu.d.mts').HamAlan | undefined} h */
const secenekKumesi = (h) => new Set([...(h?.secenekler ?? []).map((s) => s.deger), ...(h?.radyolar ?? []).map((r) => r.deger)].filter((x) => x !== ''));
const secimMi = (/** @type {import('./paket-olusturucu.d.mts').HamAlan | undefined} */ h) => h?.tur === 'select' || h?.tur === 'radio';

/**
 * Bir alan grubunun (adımın) okumaları: alanlarının en az yarısının göründüğü okumalar (başka ekrandaki okumalar koşul
 * çıkarımını bozmasın). @param {import('./akis-tasarimi.d.mts').AkisOkumasi[]} tum @param {string[]} anahtarlar
 */
function grupOkumalari(tum, anahtarlar) {
  const k = new Set(anahtarlar);
  if (!k.size) return [];
  return tum.filter((o) => {
    const n = o.gorunen.filter((x) => k.has(x)).length;
    return n > 0 && n * 2 >= k.size;
  });
}

/** Kayıttaki tüm ekran okumaları (elle/otomatik okuma + düğmeye basılmadan hemen önceki an), sırayla. @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env */
function okumalar(env) {
  return env.olaylar.flatMap((o) => (o.tur === 'okuma' ? [o.okuma] : o.tur === 'tik' ? [o.oncesi] : []));
}

/**
 * Taslak diyagram: olay sırasıyla; alan, listede işaretliyse ve dokunulduğu (dokunulmadıysa ilk görüldüğü) andaki gruba
 * düşer. Grup adı alanların bölüm başlığından (yoksa sayfa başlığı / "N. adım") önerilir.
 * @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env
 * @returns {import('./akis-tasarimi.d.mts').AkisBlogu[]}
 */
export function akisTaslagi(env) {
  const sira = new Map(env.alanlar.map((a, i) => [a.alan.anahtar, i]));
  const secili = new Set(env.alanlar.filter((a) => a.secili).map((a) => a.alan.anahtar));
  const hicDokunulmayan = new Set(secili);
  for (const o of okumalar(env)) for (const a of o.dokunulan) hicDokunulmayan.delete(a);
  /** @type {import('./akis-tasarimi.d.mts').AkisBlogu[]} */
  const bloklar = [];
  const kullanildi = new Set();
  /** @type {string[]} */
  let grup = [];
  const adlar = new Set();
  /** @param {string[]} anahtarlar */
  const adOner = (anahtarlar) => {
    const ilk = env.alanlar[sira.get(anahtarlar[0]) ?? -1]?.alan;
    const bolum = ilk ? metin(ilk.bolum?.baslik, AD_EN_COK) : '';
    let ad = bolum && bolum !== 'Genel' ? bolum : metin(env.baslik, AD_EN_COK) || `${bloklar.filter((b) => b.tur === 'alanlar').length + 1}. adım`;
    for (let n = 2; adlar.has(ad); n++) ad = `${bolum && bolum !== 'Genel' ? bolum : metin(env.baslik, 60) || 'Adım'} (${n})`;
    adlar.add(ad);
    return ad;
  };
  /** @param {import('./akis-tasarimi.d.mts').AkisOkumasi} o */
  const topla = (o) => {
    for (const a of [...o.dokunulan, ...o.gorunen.filter((x) => hicDokunulmayan.has(x))]) {
      if (secili.has(a) && !kullanildi.has(a)) { kullanildi.add(a); grup.push(a); }
    }
  };
  /** Sayfanın zorunlu işaretlediği alanlar taslakta "zorunlu" gelir. @param {string[]} liste */
  const zorunlular = (liste) => liste.filter((a) => env.alanlar[sira.get(a) ?? -1]?.alan.zorunlu === true);
  const kapat = () => {
    if (!grup.length) return;
    grup.sort((a, b) => (sira.get(a) ?? 0) - (sira.get(b) ?? 0));
    bloklar.push({ tur: 'alanlar', ad: adOner(grup), alanlar: grup, zorunlu: zorunlular(grup) });
    grup = [];
  };
  for (const o of env.olaylar) {
    if (o.tur === 'okuma') topla(o.okuma);
    else if (o.tur === 'tik') {
      topla(o.oncesi);
      kapat();
      bloklar.push({ tur: 'aksiyon', dugme: o.dugme, istegeBagli: false });
    } else if (o.tur === 'mesaj') {
      kapat();
      const m = env.mesajlar[o.mesaj];
      bloklar.push({ tur: 'mesaj', mesaj: o.mesaj, metin: (m && sabitGostergeMetni(metin(m.metin, METIN_EN_COK))) || '' });
    }
  }
  kapat();
  // İşaretli ama hiçbir okumada görülmemiş alan (olmamalı) son gruba.
  const kalan = [...secili].filter((a) => !kullanildi.has(a));
  if (kalan.length) bloklar.push({ tur: 'alanlar', ad: adOner(kalan), alanlar: kalan, zorunlu: zorunlular(kalan) });
  bloklar.push({ tur: 'bitir' });
  // Görünürlük koşulları: grubun okumalarında seçime göre görünüp kaybolan alanlar (listede işaretli seçim alanlarına göre).
  const hamlar = new Map(env.alanlar.map((a) => [a.alan.anahtar, a.alan]));
  const adaylar = [...secili].filter((a) => secimMi(hamlar.get(a)));
  const tum = okumalar(env);
  for (const b of bloklar) {
    if (b.tur !== 'alanlar') continue;
    const grupOku = grupOkumalari(tum, b.alanlar);
    /** @type {Record<string, { secim: string; degerler: string[] } | null>} */
    const kosullar = {};
    for (const a of b.alanlar) {
      const r = secimKosuluCikar(grupOku, a, adaylar, (c) => secenekKumesi(hamlar.get(c)));
      kosullar[a] = r && r !== 'coklu' ? r : null;
    }
    b.kosullar = kosullar;
  }
  return bloklar.slice(-BLOK_EN_COK);
}

/**
 * Tasarım sayfasının sağ listesi: alanlar (işaretli olanlar önce değil — kayıt sırasıyla), düğmeler ve mesajlar; her
 * birinin kullanıldığı blok sırası (yoksa null). Seçici gönderilmez (arayüzün ihtiyacı yok).
 * @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env @param {import('./akis-tasarimi.d.mts').AkisBlogu[]} bloklar
 */
export function akisPaleti(env, bloklar) {
  /** @type {Map<string, number>} */
  const alanda = new Map();
  /** @type {Map<number, number>} */
  const dugmede = new Map();
  /** @type {Map<number, number>} */
  const mesajda = new Map();
  bloklar.forEach((b, i) => {
    if (b.tur === 'alanlar') for (const a of b.alanlar) if (!alanda.has(a)) alanda.set(a, i);
    if ((b.tur === 'aksiyon' || b.tur === 'dosya') && !dugmede.has(b.dugme)) dugmede.set(b.dugme, i);
    if (b.tur === 'mesaj' && b.mesaj !== null && !mesajda.has(b.mesaj)) mesajda.set(b.mesaj, i);
  });
  return {
    alanlar: env.alanlar.map(({ alan, secili }) => ({
      anahtar: alan.anahtar, etiket: alanEtiketi(alan), tur: alan.tur, bolum: alan.bolum?.baslik || null, secili, zorunlu: alan.zorunlu === true,
      not: alan.not ?? null,
      secenekSayisi: (alan.secenekler?.length ?? 0) + (alan.radyolar?.length ?? 0), blok: alanda.get(alan.anahtar) ?? null,
      // Seçim alanlarının seçenekleri (koşul düzenleyicisi için; sayfanın seçenek metinleri, kullanıcı değeri değil).
      secenekler: secimMi(alan) ? [...(alan.secenekler ?? []), ...(alan.radyolar ?? []).map((r) => ({ deger: r.deger, metin: r.metin ?? r.deger }))]
        .filter((s) => s.deger !== '').map((s) => ({ deger: s.deger, metin: s.metin || s.deger })) : null
    })),
    dugmeler: env.dugmeler.map((d, i) => ({ sira: i, metin: d.metin || d.secici, blok: dugmede.get(i) ?? null })),
    mesajlar: env.mesajlar.map((m, i) => ({ sira: i, metin: m.metin || '(metinsiz öğe)', oneri: sabitGostergeMetni(m.metin), blok: mesajda.get(i) ?? null }))
  };
}

/**
 * Arayüzden gelen blokları tek biçime getirir (bilinmeyen alanlar atılır; uzunluklar sınırlanır). Biçimi bozuk blok
 * hatadır. @param {unknown} ham
 * @returns {{ bloklar: import('./akis-tasarimi.d.mts').AkisBlogu[]; hatalar: import('./akis-tasarimi.d.mts').AkisHatasi[] }}
 */
export function bloklariAyikla(ham) {
  /** @type {import('./akis-tasarimi.d.mts').AkisHatasi[]} */
  const hatalar = [];
  if (!Array.isArray(ham)) return { bloklar: [], hatalar: [{ blok: null, mesaj: 'Akış blokları okunamadı.' }] };
  if (ham.length > BLOK_EN_COK) return { bloklar: [], hatalar: [{ blok: null, mesaj: `Akışta en fazla ${BLOK_EN_COK} blok olabilir.` }] };
  /** @type {import('./akis-tasarimi.d.mts').AkisBlogu[]} */
  const bloklar = [];
  ham.forEach((b, i) => {
    if (!nesneMi(b)) { hatalar.push({ blok: i, mesaj: 'Blok okunamadı.' }); return; }
    const sayi = (/** @type {unknown} */ d) => (Number.isInteger(d) && /** @type {number} */ (d) >= 0 ? /** @type {number} */ (d) : -1);
    if (b.tur === 'alanlar') {
      const liste = Array.isArray(b.alanlar) ? b.alanlar.filter((x) => typeof x === 'string').slice(0, 500) : [];
      const zorunlu = Array.isArray(b.zorunlu) ? b.zorunlu.filter((x) => typeof x === 'string' && liste.includes(x)) : [];
      /** @type {Record<string, { secim: string; degerler: string[] } | null>} */
      const kosullar = {};
      if (nesneMi(b.kosullar)) {
        for (const a of liste) {
          if (!Object.prototype.hasOwnProperty.call(b.kosullar, a)) continue;
          const k = b.kosullar[a];
          if (k === null) kosullar[a] = null;
          else if (nesneMi(k) && typeof k.secim === 'string' && Array.isArray(k.degerler)) {
            kosullar[a] = { secim: k.secim, degerler: [...new Set(k.degerler.filter((x) => typeof x === 'string'))].slice(0, 50) };
          }
        }
      }
      bloklar.push({ tur: 'alanlar', ad: metin(b.ad, AD_EN_COK), alanlar: liste, zorunlu: [...new Set(zorunlu)], kosullar });
    } else if (b.tur === 'bekle') bloklar.push({ tur: 'bekle', saniye: sayi(b.saniye) });
    else if (b.tur === 'ortak') bloklar.push({ tur: 'ortak', dosya: metin(b.dosya, 200), ad: metin(b.ad, AD_EN_COK), istegeBagli: b.istegeBagli === true });
    else if (b.tur === 'aksiyon') {
      bloklar.push({ tur: 'aksiyon', dugme: sayi(b.dugme), istegeBagli: b.istegeBagli === true, ...(b.zamanAsimiSn !== undefined && b.zamanAsimiSn !== null && b.zamanAsimiSn !== '' ? { zamanAsimiSn: sayi(b.zamanAsimiSn) } : {}) });
    }
    else if (b.tur === 'mesaj') bloklar.push({ tur: 'mesaj', mesaj: b.mesaj === null || b.mesaj === undefined ? null : sayi(b.mesaj), metin: metin(b.metin, METIN_EN_COK), ...(b.uyari === true ? { uyari: true } : {}), ...(b.desen === true ? { desen: true } : {}) });
    else if (b.tur === 'bitir') bloklar.push({ tur: 'bitir' });
    else if (b.tur === 'sql') bloklar.push({ tur: 'sql', ad: metin(b.ad, AD_EN_COK), sql: nesneMi(b.sql) ? b.sql : {} });
    else if (b.tur === 'dosya') bloklar.push({ tur: 'dosya', ad: metin(b.ad, AD_EN_COK), dugme: sayi(b.dugme), dosya: nesneMi(b.dosya) ? b.dosya : {} });
    else if (b.tur === 'giris') bloklar.push({ tur: 'giris', ad: metin(b.ad, AD_EN_COK), profil: metin(b.profil, 120) || null });
    else hatalar.push({ blok: i, mesaj: 'Bilinmeyen blok türü.' });
  });
  return { bloklar, hatalar };
}

/**
 * Blokları doğrular ve kayıt envanterine (adım biçimi) çevirir. Hata varsa envanter null.
 * @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env @param {import('./akis-tasarimi.d.mts').AkisBlogu[]} bloklar
 * s.satirSiniri: SQL bloklarının beklenen satır sayısı için kullanıcının satır sınırı (Ayarlar > Koşu > Gelişmiş; verilmezse varsayılan).
 * @param {{ satirSiniri?: number }} [s]
 * @returns {{ envanter: import('./paket-olusturucu.d.mts').KayitEnvanteri | null; hatalar: import('./akis-tasarimi.d.mts').AkisHatasi[] }}
 */
export function akistanKayitEnvanteri(env, bloklar, s = {}) {
  /** @type {import('./akis-tasarimi.d.mts').AkisHatasi[]} */
  const hatalar = [];
  const hata = (/** @type {number | null} */ blok, /** @type {string} */ mesaj) => { hatalar.push({ blok, mesaj }); };
  const alanlar = new Map(env.alanlar.map((a) => [a.alan.anahtar, a.alan]));
  const bitir = bloklar.findIndex((b) => b.tur === 'bitir');
  if (bitir < 0) hata(null, 'Akış “Bitir” bloğuyla bitmeli.');
  else if (bitir !== bloklar.length - 1) hata(bitir, '“Bitir”den sonra blok olamaz.');
  const etkin = bitir < 0 ? bloklar : bloklar.slice(0, bitir);
  if (!etkin.some((b) => b.tur === 'alanlar' || b.tur === 'aksiyon')) hata(null, 'Akışta en az bir alan grubu ya da aksiyon olmalı.');

  /** @type {Array<import('./paket-olusturucu.d.mts').KayitAdimi & { parcalar: number[]; acicilar: import('./paket-olusturucu.d.mts').KayitAcicisi[] }>} */
  const adimlar = [];
  /** @type {import('./paket-olusturucu.d.mts').KayitGostergesi | null} */
  let basariGostergesi = null;
  /** @type {(typeof adimlar)[number] | null} */
  let cur = null;
  let kapali = false; // son adımın ilerleme düğmesi var (sonraki alan grubu yeni adım)
  let bekleyen = false; // isteğe bağlı aksiyon: sonraki alan grubu onun parçası
  let sure = 0; // düğmeden önce (alanlardan sonra) bekleme: sonraki düğmeye bağlanır, düğme yoksa adımın sonuna
  /** Son blok(lar) SQL sorgusu ya da dosya doğrulama (yan adım): ardından bekleme / ara mesaj konmaz. @type {false | 'sql' | 'dosya'} */
  let sqlSonrasi = false;
  /** @type {Map<string, number>} */
  const kullanilan = new Map();
  /** @type {Array<{ blok: number; alan: string; kosul: { secim: string; degerler: string[] } | null }>} */
  const elleKosullar = [];
  const adlar = new Set();
  /** Açık "veya" grubunun ilk göstergesi (art arda gelen mesajlar ona eklenir). @type {import('./paket-olusturucu.d.mts').KayitGostergesi | null} */
  let grup = null;
  const sureyiBirak = () => {
    if (cur && sure) cur.onceBekle = (cur.onceBekle ?? 0) + sure;
    sure = 0;
  };
  const yeniAdim = (/** @type {string} */ ad, /** @type {import('./paket-olusturucu.d.mts').HamAlan[]} */ hamlar) => {
    sureyiBirak();
    cur = { ad, yol: '', baslik: metin(env.baslik, 200), alanlar: hamlar, ilerleme: null, acicilar: [], parcalar: hamlar.map(() => 0) };
    adimlar.push(cur);
    kapali = false;
    bekleyen = false;
    return cur;
  };
  etkin.forEach((b, i) => {
    if (b.tur !== 'mesaj') grup = null;
    if (b.tur === 'alanlar') {
      if (!b.ad) hata(i, 'Alan grubunun adını yazın.');
      else if (adlar.has(b.ad)) hata(i, `“${b.ad}” adı başka bir alan grubunda da var; adlar tekil olmalı.`);
      adlar.add(b.ad);
      // Alansız grup bir aksiyonun adıdır (aradaki bekleme süreleri o aksiyondan öncedir).
      if (!b.alanlar.length && etkin.slice(i + 1).find((x) => x.tur !== 'bekle')?.tur !== 'aksiyon') hata(i, 'Alan grubu boş: alan ekleyin (alansız bir adımı adlandırmak için ardından bir aksiyon gelmeli).');
      /** @type {import('./paket-olusturucu.d.mts').HamAlan[]} */
      const hamlar = [];
      for (const a of b.alanlar) {
        const h = alanlar.get(a);
        if (!h) { hata(i, 'Kayıtta olmayan bir alan seçilmiş.'); continue; }
        if (kullanilan.has(a)) { hata(i, `“${alanEtiketi(h)}” alanı birden çok grupta; bir alan yalnızca bir grupta olabilir.`); continue; }
        kullanilan.set(a, i);
        hamlar.push({ ...h, zorunlu: b.zorunlu.includes(a) });
        if (b.kosullar && Object.prototype.hasOwnProperty.call(b.kosullar, a)) elleKosullar.push({ blok: i, alan: a, kosul: b.kosullar[a] });
      }
      if (cur && bekleyen) {
        // İsteğe bağlı aksiyonun açtığı alanlar: aynı adımın o düğmeden sonraki parçası.
        const k = cur.acicilar.length;
        cur.alanlar.push(...hamlar);
        cur.parcalar.push(...hamlar.map(() => k));
        bekleyen = false;
      } else yeniAdim(b.ad || `${adimlar.length + 1}. adım`, hamlar);
      return;
    }
    if (b.tur === 'aksiyon') {
      const d = env.dugmeler[b.dugme];
      if (!d) { hata(i, 'Aksiyonun düğmesini seçin.'); return; }
      if (b.zamanAsimiSn !== undefined && !(Number.isInteger(b.zamanAsimiSn) && b.zamanAsimiSn >= 1 && b.zamanAsimiSn <= 600)) { hata(i, 'Sonucu bekleme süresi 1–600 saniye arasında tam sayı olmalı.'); return; }
      const og = { secici: d.secici, metin: d.metin };
      if (!cur || kapali) yeniAdim(metin(d.metin, AD_EN_COK) || `${adimlar.length + 1}. adım`, []);
      const c = /** @type {(typeof adimlar)[number]} */ (cur);
      if (b.istegeBagli) {
        c.acicilar.push({ ...og, secimli: true, ...(sure ? { onceBekle: sure } : {}) });
        bekleyen = true;
      } else {
        c.ilerleme = og;
        if (b.zamanAsimiSn !== undefined) c.zamanAsimiSn = b.zamanAsimiSn;
        if (sure) c.onceBekle = (c.onceBekle ?? 0) + sure;
        kapali = true;
        bekleyen = false;
      }
      sure = 0;
      return;
    }
    if (b.tur === 'ortak') {
      if (!/^[a-z0-9][a-z0-9-]*\.model\.json$/.test(b.dosya)) { hata(i, 'Eklenecek ortak akışı seçin.'); return; }
      if (bekleyen) { hata(i, 'Ortak akış, isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
      const ad = b.ad || b.dosya.replace(/\.model\.json$/, '');
      if (adlar.has(ad)) { hata(i, `“${ad}” adı başka bir blokta da var; adlar tekil olmalı.`); return; }
      adlar.add(ad);
      sureyiBirak();
      // Ortak akış kendi adımıdır: önceki adım kapanır, sonraki alan grubu / aksiyon yeni adım başlatır.
      adimlar.push({ ad, yol: '', baslik: metin(env.baslik, 200), alanlar: [], ilerleme: null, acicilar: [], parcalar: [], ortakAkis: { dosya: b.dosya, istegeBagli: b.istegeBagli } });
      cur = null;
      kapali = false;
      bekleyen = false;
      return;
    }
    if (b.tur === 'sql') {
      const d = sqlTanimiDogrula(b.sql, { satirSiniri: s.satirSiniri });
      if (d.hatalar.length) { for (const m of d.hatalar) hata(i, m); return; }
      if (bekleyen) { hata(i, 'SQL sorgusu isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
      if (cur && !kapali) { hata(i, 'SQL sorgusu bir aksiyondan (düğmeye basma) sonra gelmeli: önce alan grubunun ilerleme düğmesini koyun.'); return; }
      const ad = b.ad || 'SQL sorgusu';
      if (adlar.has(ad)) { hata(i, `“${ad}” adı başka bir blokta da var; adlar tekil olmalı.`); return; }
      adlar.add(ad);
      sureyiBirak();
      // Kendi adımıdır; önceki ekran adımı (cur) açık kalır: ardındaki son beklenen mesaj ona bağlanır.
      adimlar.push({ ad, yol: '', baslik: metin(env.baslik, 200), alanlar: [], ilerleme: null, acicilar: [], parcalar: [], sqlKontrolu: d.tanim });
      sqlSonrasi = 'sql';
      return;
    }
    if (b.tur === 'dosya') {
      // İndirilen dosyayı doğrula: kendi adımıdır (düğmeye basılır, indirilen dosya beklentilerle doğrulanır); SQL adımı gibi önceki
      // ekran adımı açık kalır (ardındaki son beklenen mesaj ona bağlanır).
      const d = dosyaTanimiDogrula(b.dosya);
      const dg = env.dugmeler[b.dugme];
      if (!dg) hata(i, 'İndirmeyi başlatan düğmeyi seçin.');
      if (d.hatalar.length) for (const m of d.hatalar) hata(i, m);
      if (!dg || d.hatalar.length) return;
      if (bekleyen) { hata(i, 'Dosya doğrulama isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
      if (cur && !kapali) { hata(i, 'Dosya doğrulama bir aksiyondan (düğmeye basma) sonra gelmeli: önce alan grubunun ilerleme düğmesini koyun.'); return; }
      const ad = b.ad || 'Dosya doğrulama';
      if (adlar.has(ad)) { hata(i, `“${ad}” adı başka bir blokta da var; adlar tekil olmalı.`); return; }
      adlar.add(ad);
      sureyiBirak();
      const tetikleyici = { secici: dg.secici, ...(dg.metin ? { aciklama: metin(dg.metin, 120) } : {}) };
      adimlar.push({ ad, yol: '', baslik: metin(env.baslik, 200), alanlar: [], ilerleme: null, acicilar: [], parcalar: [], dosyaKontrolu: { ...d.tanim, tetikleyici } });
      sqlSonrasi = 'dosya';
      return;
    }
    if (b.tur === 'giris') {
      // Yeniden giriş: kendi adımıdır (oturum kapatılır, ortamın tarifiyle yeniden girilir); önceki adım kapanır.
      if (bekleyen) { hata(i, 'Yeniden giriş isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
      if (cur && !kapali) { hata(i, 'Yeniden giriş bir aksiyondan (düğmeye basma) sonra gelmeli: önce alan grubunun ilerleme düğmesini koyun.'); return; }
      const ad = b.ad || 'Yeniden giriş';
      if (adlar.has(ad)) { hata(i, `“${ad}” adı başka bir blokta da var; adlar tekil olmalı.`); return; }
      adlar.add(ad);
      sureyiBirak();
      adimlar.push({ ad, yol: '', baslik: metin(env.baslik, 200), alanlar: [], ilerleme: null, acicilar: [], parcalar: [], yenidenGiris: b.profil ? { profil: b.profil } : {} });
      cur = null;
      kapali = false;
      bekleyen = false;
      sqlSonrasi = false;
      return;
    }
    if (b.tur === 'bekle' && sqlSonrasi) {
      hata(i, sqlSonrasi === 'sql' ? 'SQL sorgusundan sonra bekleme konmaz; veri geç yazılıyorsa SQL adımındaki “yeniden dene” süresini kullanın.'
        : 'Dosya doğrulamadan sonra bekleme konmaz; indirme geç başlıyorsa adımdaki “indirmeyi bekleme” süresini kullanın.');
      return;
    }
    if (b.tur === 'mesaj' && sqlSonrasi && !etkin.slice(i).every((x) => x.tur === 'mesaj' || x.tur === 'sql' || x.tur === 'dosya')) {
      hata(i, `Beklenen mesaj ${sqlSonrasi === 'sql' ? 'SQL sorgusundan' : 'dosya doğrulamadan'} önce gelmeli (mesaj ekran adımının sonucudur).`);
      return;
    }
    if (b.tur !== 'mesaj') sqlSonrasi = false;
    if (b.tur === 'bekle') {
      if (!(Number.isInteger(b.saniye) && b.saniye >= 1 && b.saniye <= BEKLEME_EN_COK_SN)) { hata(i, `Bekleme süresi 1–${BEKLEME_EN_COK_SN} saniye arasında tam sayı olmalı.`); return; }
      if (!cur) { hata(i, 'Bekleme bir alan grubundan ya da aksiyondan sonra gelmeli.'); return; }
      const c = /** @type {(typeof adimlar)[number]} */ (cur);
      // İsteğe bağlı düğmeden hemen sonra: o düğmeye basıldıktan sonra (yalnızca düğme basılırsa) beklenir.
      if (bekleyen) { const a = c.acicilar[c.acicilar.length - 1]; a.sonraBekle = (a.sonraBekle ?? 0) + b.saniye; return; }
      if (kapali) { c.sonraBekle = (c.sonraBekle ?? 0) + b.saniye; return; }
      sure += b.saniye;
      return;
    }
    if (b.tur === 'mesaj') {
      const m = b.mesaj === null ? null : env.mesajlar[b.mesaj];
      if (b.mesaj !== null && !m) { hata(i, 'Seçilen mesaj kayıtta yok.'); return; }
      if (!b.metin && !(m && sabitGostergeMetni(m.metin))) { hata(i, 'Beklenen mesajın aranacak metnini yazın.'); return; }
      if (b.desen) {
        if (b.uyari) { hata(i, 'Uyarı mesajı kalıp (düzenli ifade) olamaz; aranacak metni yazın.'); return; }
        if (!b.metin) { hata(i, 'Kalıbı (düzenli ifade) yazın; ör. [1-9].'); return; }
        try { new RegExp(b.metin); } catch { hata(i, 'Kalıp geçerli bir düzenli ifade değil.'); return; }
      }
      /** @type {import('./paket-olusturucu.d.mts').KayitGostergesi} */
      const g = { secici: m ? m.secici : null, metin: m ? m.metin : b.metin, ...(b.metin ? { aranan: b.metin } : {}), ...(b.desen ? { desen: true } : {}) };
      const sonMu = etkin.slice(i).every((x) => x.tur === 'mesaj' || x.tur === 'sql' || x.tur === 'dosya');
      if (!cur) { hata(i, 'Beklenen mesajdan önce bir alan grubu ya da aksiyon olmalı.'); return; }
      if (bekleyen) { hata(i, 'Beklenen mesaj isteğe bağlı bir aksiyondan hemen sonra gelemez (her senaryoda görünmez).'); return; }
      if (!sonMu && !kapali) { hata(i, 'Beklenen mesaj bir aksiyondan (düğmeye basma) sonra gelmeli.'); return; }
      const c = /** @type {(typeof adimlar)[number]} */ (cur);
      // Uyarı: o adımda kabul edilen iş kuralı uyarısı (başarı grubuna girmez; grubu da bölmez).
      if (b.uyari) {
        const liste = (c.uyarilar ??= []);
        if (liste.length >= UYARI_EN_COK) { hata(i, `Bir adımda en fazla ${UYARI_EN_COK} uyarı olabilir.`); return; }
        liste.push(g);
        return;
      }
      // Art arda gelen başarı mesajları "veya" grubudur: grubun ilk mesajının yerine bağlanır.
      if (grup) {
        if (1 + (grup.veya?.length ?? 0) >= MESAJ_GRUBU_EN_COK) { hata(i, `Art arda en fazla ${MESAJ_GRUBU_EN_COK} başarı mesajı (VEYA) olabilir.`); return; }
        (grup.veya ??= []).push(g);
        return;
      }
      if (sonMu) { basariGostergesi = g; grup = g; return; }
      if (c.gosterge) { hata(i, 'Aynı aksiyondan sonra birden çok beklenen mesaj için mesajları art arda koyun (VEYA).'); return; }
      c.gosterge = g;
      grup = g;
    }
  });
  sureyiBirak();
  // Elle koşullar: seçim alanı akışta olmalı, seçim (select/radyo) olmalı, değerler seçeneklerinden olmalı.
  for (const { blok, alan, kosul } of elleKosullar) {
    if (!kosul) continue;
    const h = alanlar.get(alan);
    const s = alanlar.get(kosul.secim);
    const ad = h ? alanEtiketi(h) : alan;
    if (!s || !kullanilan.has(kosul.secim)) hata(blok, `“${ad}” alanının koşulundaki seçim alanı akışta yok; seçim alanını bir gruba ekleyin ya da koşulu kaldırın.`);
    else if (!secimMi(s) || kosul.secim === alan) hata(blok, `“${ad}” alanının koşulu bir seçim alanına (açılır liste / radyo) bağlanmalı.`);
    else if (!kosul.degerler.length || kosul.degerler.some((d) => !secenekKumesi(s).has(d))) hata(blok, `“${ad}” alanının koşulunda “${alanEtiketi(s)}” için en az bir geçerli seçenek seçin.`);
  }
  if (hatalar.length) return { envanter: null, hatalar };
  // Koşullar, alanın düştüğü adıma (isteğe bağlı parça dahil) taşınır.
  for (const { alan, kosul } of elleKosullar) {
    const a = adimlar.find((x) => x.alanlar.some((h) => h.anahtar === alan));
    if (a) a.kosullar = { ...(a.kosullar ?? {}), [alan]: kosul };
  }

  // Adımın ekran okumaları (elle koşulu olmayan alanların otomatik koşulu için). Adımın yolu: alanlarının ilk göründüğü okuma.
  const tum = okumalar(env);
  for (const a of adimlar) {
    const ilgili = grupOkumalari(tum, a.alanlar.map((h) => h.anahtar));
    a.yol = ilgili[0]?.yol || tum[0]?.yol || '';
    a.okumalar = ilgili.map((o) => ({ gorunen: o.gorunen, secimler: o.secimler }));
    if (!a.acicilar.length) { delete (/** @type {Partial<typeof a>} */ (a)).acicilar; delete (/** @type {Partial<typeof a>} */ (a)).parcalar; }
  }
  return {
    envanter: {
      kip: 'kayit', profil: env.profil, adimlar, basariGostergesi, engellenenler: env.engellenenler, notlar: env.notlar,
      secenekGozlemleri: secenekGozlemleriniAyikla(env.secenekGozlemleri)
    },
    hatalar
  };
}
