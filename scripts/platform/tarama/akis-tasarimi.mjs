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
//            sinirlar: { [alan]: { enAz?, enCok?, artis?, enAzUzunluk?, enCokUzunluk?, desen? } | null } — alanın değer kuralları
//            (model alan.sinirlar; null: kaldır; verilmeyen alanın mevcut kuralı korunur). Ekranın akışını düzenlerken yazılır.
//            tuslar: { [alan]: 'Tab' | 'Enter' | null } — "Doldurduktan sonra" basılacak tuş (model alan.doldurucuParametreleri.tus;
//            null: kaldır; verilmeyen alanın mevcut ayarı korunur). Alandan çıkınca çıkan uyarılar için (ör. zorunlu alan uyarısı).
//   aksiyon  { dugme: sıra, istegeBagli, gorunurse? } düğmeye basılır (isteğe bağlıysa senaryoda "… dahil" ile seçilir;
//            gorunurse: "Yalnız görünürse bas" — ilerleme düğmesinden sonra, kısa sürede görünmezse atlanır; adımı kapatmaz)
//   mesaj    { mesaj: sıra | null, metin }          beklenen mesaj (aranacak metin; öğe seçildiyse onun içinde aranır). Bir
//            aksiyondan ya da bir ALAN GRUBUNDAN sonra gelir: alan grubundan sonraki mesaj, alanlar doldurulup (alanın
//            "Doldurduktan sonra" tuşuna basılıp) alandan çıkınca beklenir — adımın düğmesi yoktur, adım orada kapanır (ardından
//            gelen aksiyon yeni adımdır).
//   bekle    { saniye }                              süreli bekleme (1–120 sn): önceki düğmeden sonra (düğme yoksa alanlardan
//            sonra) bekler. Bekleme konmasa da koşucu sonraki alan / beklenen mesaj görünene kadar bekler.
//   sql      { ad, sql: SqlTanimi }                 SQL sorgusu adımı (sql/sql-adimi.mjs): kendi adımıdır; koşuda seçilen
//            veritabanı bağlantısında sorgu çalışır, sonuç beklenenle karşılaştırılır. Bir aksiyondan (ya da ortak akıştan)
//            sonra ya da akışın başında gelir; ardındaki beklenen mesaj / bekleme önceki ekran adımına aittir.
//   dosya    { ad, dugme: sıra, dosya: DosyaTanimi }  İndirilen dosyayı doğrula (dosyalar/dosya-icerigi.mjs): kendi adımıdır; koşuda
//            düğmeye basılır, indirilen dosya (CSV / XLSX / PDF / metin) beklentilerle doğrulanır. SQL adımıyla aynı yerde durur.
//   giris    { ad, profil }                         Yeniden giriş: oturum kapatılır (çerezler temizlenir), ortamın giriş tarifiyle
//            (profil: giriş profilinin adı; boşsa ortamın varsayılanı) yeniden girilir; kendi adımıdır, aksiyondan sonra gelir.
//   git      { yol }                                Şu adrese git: ekranın kendi ortamının adresine göre yol (ör. /liste) açılır; kendi adımıdır
//            (kayıtta adres çubuğuyla / bağlantıyla gidilen sayfa geçişleri taslakta bu bloktur; kullanıcı kaldırabilir). Ardından
//            gelen alan grubu / aksiyon gidilen sayfada uygulanır; beklenen mesaj gidilen sayfada aranır. Yol kuralı:
//            dogrulama/gezinme-yolu.mjs (tam adres / başka site / gizli sorgu reddedilir).
//   bitir    {}                                     akışın sonu (zorunlu, son blok)
//   korunan  { korunan: anahtar, ad, kapsam }       diyagramda DÜZENLENEMEYEN, modeldeki hâliyle AYNEN korunan parça (salt okunur;
//            taşınabilir / silinebilir): kapsam 'adim' → adımın tamamı (ör. alt model adımı, yalnız öğe beklemesi), 'aksiyonlar'
//            → adımın koşu aksiyonları (ör. metinle süzülen tıklama; düğmesi varsa adımın ilerlemesidir). Anahtar sunucudaki
//            korunan parçaya başvurur (s.korunanlar; akis-servisi.mjs). Alan grubu ve aksiyon da "korunan" anahtarı taşıyabilir:
//            adımın diyagramda gösterilemeyen özellikleri (görünürlük koşulu, kod yöntemi, başarı göstergesi, gösterilemeyen
//            alanlar…) kaydedilen adıma aynen geri yazılır (adım kimliği de korunur).
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
// aksiyondan sonraki mesaj o düğmeden sonra beklenir; alan grubundan sonraki (son olmayan) mesaj alanlar doldurulunca beklenir
// ve adımı kapatır; son mesaj akışın başarı göstergesidir.
// Alan DEĞERİ yoktur (yalnızca select/radyonun seçili SEÇENEĞİ, koşul çıkarımı için). NOT: import.meta KULLANILMAZ.
// Tipler: akis-tasarimi.d.mts.

import { UYARI_EN_COK, VEYA_EN_COK } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';
import { sabitGostergeMetni, secimKosuluCikar } from './paket-olusturucu.mjs';
import { sqlTanimiDogrula } from '../sql/sql-adimi.mjs';
import { dosyaTanimiDogrula } from '../dosyalar/dosya-icerigi.mjs';
import { gitYoluHatasi } from '../../dogrulama/gezinme-yolu.mjs';
import { gezinmePlani } from './gezinme-plani.mjs';

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
 * Elle koşulun dayanabileceği alan: seçim (açılır liste / radyo) ya da onay kutusu. Onay kutusunun "seçenekleri" durumlarıdır:
 * "true" (işaretli) / "false" (işaretsiz); koşulda yalnız biri seçilir (modelde { alan, esit: true | false }).
 */
const kosulAlaniMi = (/** @type {import('./paket-olusturucu.d.mts').HamAlan | undefined} */ h) => secimMi(h) || h?.tur === 'checkbox';
const ONAY_DURUMLARI = Object.freeze([{ deger: 'true', metin: 'İşaretli' }, { deger: 'false', metin: 'İşaretsiz' }]);

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
  // Adres değişimleri (adres çubuğuyla gitmek dahil; gezinme-plani.mjs): olay sırasına göre araya girer. Adres değişince önceki
  // sayfanın alanları kapanır; sonraki sayfada dokunulan alanlar o adrese göre gelen adımın parçası olur. Aynı adrese dönüş /
  // yenileme, tıklamayla açılan ve otomatik yönlendirmeler blok üretmez.
  const gezinme = gezinmePlani(env).adimlar;
  let gezinSirasi = 0;
  const gezinmeleriIsle = (/** @type {number} */ sirasi) => {
    while (gezinSirasi < gezinme.length && gezinme[gezinSirasi].sira <= sirasi) {
      kapat();
      bloklar.push({ tur: 'git', yol: gezinme[gezinSirasi++].yol });
    }
  };
  for (const [olayNo, o] of env.olaylar.entries()) {
    gezinmeleriIsle(olayNo);
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
  gezinmeleriIsle(Number.POSITIVE_INFINITY);
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

/** Diyagramda elle tanımlanabilecek alan / düğme sayısı sınırı (her biri için). */
export const ELLE_OGE_EN_COK = 50;
/** Elle tanımlanan alanın türleri (sayfa envanteri türü; model tipi paket-olusturucu.mjs > modelTipi ile). */
export const ELLE_ALAN_TURLERI = Object.freeze(['text', 'number', 'date', 'tel', 'email', 'textarea', 'checkbox']);
/** Elle tanımlanan alanın anahtarı ("elle-" + küçük harf / rakam / "-"; kayıttaki anahtarlarla çakışmaz). */
export const ELLE_ALAN_ANAHTARI = /^elle-[a-z0-9-]{1,40}$/;
const SECICI_EN_COK = 300;

/**
 * Diyagramda ELLE tanımlanan alanlar ve düğmeler (kayıtta / modelde olmayan öğe; ör. boş başlayan bir ortak akışa sıfırdan adım
 * eklemek): { alanlar: [{ anahtar: "elle-…", etiket, tur, secici }], dugmeler: [{ metin, secici }] }. Envantere eklenir: alanlar
 * sağ listenin sonuna (anahtarlarıyla), düğmeler düğme listesinin SONUNA — sırası mevcut düğme sayısı + i (arayüz aynı sırayla
 * verir, aksiyon blokları bu sırayla başvurur). Seçici sayfadaki öğenin CSS / Playwright seçicisidir (tam adres değil); alan DEĞERİ
 * yoktur. Kaydedilince alanlar ve düğmeler kayıttan gelmiş gibi modele yazılır (kayitPaketiOlustur); sonra modelin parçasıdır.
 * @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env @param {unknown} ham
 * @returns {{ envanter: import('./akis-tasarimi.d.mts').AkisEnvanteri; hatalar: import('./akis-tasarimi.d.mts').AkisHatasi[] }}
 */
export function elleOgeleriEkle(env, ham) {
  /** @type {import('./akis-tasarimi.d.mts').AkisHatasi[]} */
  const hatalar = [];
  if (ham === undefined || ham === null) return { envanter: env, hatalar };
  if (!nesneMi(ham)) return { envanter: env, hatalar: [{ blok: null, mesaj: 'Elle eklenen alan ve düğmeler okunamadı.' }] };
  const alanlar = Array.isArray(ham.alanlar) ? ham.alanlar : [];
  const dugmeler = Array.isArray(ham.dugmeler) ? ham.dugmeler : [];
  if (alanlar.length > ELLE_OGE_EN_COK || dugmeler.length > ELLE_OGE_EN_COK) return { envanter: env, hatalar: [{ blok: null, mesaj: `Elle en fazla ${ELLE_OGE_EN_COK} alan ve ${ELLE_OGE_EN_COK} düğme eklenebilir.` }] };
  /** Seçici: boş olmayan, tek satır, sınırlı uzunlukta; tam adres değil. @param {unknown} s */
  const seciciHatasi = (s) => (typeof s !== 'string' || !s.trim() ? 'seçiciyi yazın (ör. #onayla ya da [name="not"])'
    : s.length > SECICI_EN_COK || /[\r\n]/.test(s) ? `seçici tek satır ve en fazla ${SECICI_EN_COK} karakter olmalı`
      : /^[a-z][a-z0-9+.-]*:\/\//i.test(s.trim()) ? 'seçici bir adres değil, sayfadaki öğenin seçicisi olmalı' : null);
  const anahtarlar = new Set(env.alanlar.map((a) => a.alan.anahtar));
  /** @type {import('./akis-tasarimi.d.mts').AkisAlani[]} */
  const yeniAlanlar = [];
  alanlar.forEach((a, i) => {
    const etiket = nesneMi(a) ? metin(a.etiket, AD_EN_COK) : '';
    const ad = `Elle eklenen ${etiket ? `“${etiket}”` : `${i + 1}.`} alan`;
    if (!nesneMi(a)) { hatalar.push({ blok: null, mesaj: `${ad} okunamadı.` }); return; }
    if (typeof a.anahtar !== 'string' || !ELLE_ALAN_ANAHTARI.test(a.anahtar) || anahtarlar.has(a.anahtar)) { hatalar.push({ blok: null, mesaj: `${ad}: anahtarı geçersiz ya da tekrarlı.` }); return; }
    if (!etiket) { hatalar.push({ blok: null, mesaj: `${ad}: etiketini yazın.` }); return; }
    if (typeof a.tur !== 'string' || !ELLE_ALAN_TURLERI.includes(a.tur)) { hatalar.push({ blok: null, mesaj: `${ad}: türü ${ELLE_ALAN_TURLERI.join(', ')} olmalı.` }); return; }
    const sh = seciciHatasi(a.secici);
    if (sh) { hatalar.push({ blok: null, mesaj: `${ad}: ${sh}.` }); return; }
    const secici = String(a.secici).trim();
    anahtarlar.add(a.anahtar);
    yeniAlanlar.push({
      alan: {
        anahtar: a.anahtar, tur: a.tur, etiket, etiketKaynagi: null, kimlik: null, ad: null, secici, kirilganlik: 'orta', adaySeciciler: [secici],
        zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, not: 'elle eklendi', bolum: { anahtar: 'elle', baslik: '' }
      },
      secili: true
    });
  });
  /** @type {import('./paket-olusturucu.d.mts').KayitOgesi[]} */
  const yeniDugmeler = [];
  dugmeler.forEach((d, i) => {
    const m = nesneMi(d) ? metin(d.metin, AD_EN_COK) : '';
    const ad = `Elle eklenen ${m ? `“${m}”` : `${i + 1}.`} düğme`;
    if (!nesneMi(d)) { hatalar.push({ blok: null, mesaj: `${ad} okunamadı.` }); return; }
    if (!m) { hatalar.push({ blok: null, mesaj: `${ad}: düğmenin yazısını girin.` }); return; }
    const sh = seciciHatasi(d.secici);
    if (sh) { hatalar.push({ blok: null, mesaj: `${ad}: ${sh}.` }); return; }
    yeniDugmeler.push({ secici: String(d.secici).trim(), metin: m });
  });
  // Bir hata varsa envanter değişmez (düğme sıraları arayüzdekiyle kaymasın).
  if (hatalar.length) return { envanter: env, hatalar };
  return { envanter: { ...env, alanlar: [...env.alanlar, ...yeniAlanlar], dugmeler: [...env.dugmeler, ...yeniDugmeler] }, hatalar };
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
        .filter((s) => s.deger !== '').map((s) => ({ deger: s.deger, metin: s.metin || s.deger }))
        : alan.tur === 'checkbox' ? ONAY_DURUMLARI.map((s) => ({ ...s })) : null
    })),
    dugmeler: env.dugmeler.map((d, i) => ({ sira: i, metin: d.metin || d.secici, blok: dugmede.get(i) ?? null })),
    mesajlar: env.mesajlar.map((m, i) => ({ sira: i, metin: m.metin || '(metinsiz öğe)', oneri: sabitGostergeMetni(m.metin), blok: mesajda.get(i) ?? null }))
  };
}

const KORUNAN_ANAHTAR_EN_COK = 400;
/** Alan grubu / aksiyonun korunan parça anahtarı (varsa). @param {Record<string, any>} b */
const korunanEki = (b) => (typeof b.korunan === 'string' && b.korunan && b.korunan.length <= KORUNAN_ANAHTAR_EN_COK ? { korunan: b.korunan } : {});

/** Alan grubundaki değer kurallarının (sinirlar) bilinen anahtarları. */
const SINIR_ANAHTARLARI = ['enAz', 'enCok', 'artis', 'enAzUzunluk', 'enCokUzunluk', 'desen'];
/** Alan doldurulduktan sonra basılabilecek tuşlar (diyagramdaki "Doldurduktan sonra" seçimi). */
export const ALAN_TUSLARI = ['Tab', 'Enter'];

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
      // Alanın değer kuralları (model alan.sinirlar; null: kaldır). Yalnız bilinen anahtarlar, sayı / metin değerler; kurallar
      // kaydederken ekran modeli doğrulayıcısıyla denetlenir (akis-servisi.mjs > akisKaydet).
      /** @type {Record<string, Record<string, number | string> | null>} */
      const sinirlar = {};
      if (nesneMi(b.sinirlar)) {
        for (const a of liste) {
          if (!Object.prototype.hasOwnProperty.call(b.sinirlar, a)) continue;
          const s = b.sinirlar[a];
          if (!nesneMi(s)) { sinirlar[a] = null; continue; }
          /** @type {Record<string, number | string>} */
          const temiz = {};
          for (const k of SINIR_ANAHTARLARI) {
            const d = s[k];
            if (typeof d === 'number' && Number.isFinite(d)) temiz[k] = d;
            else if (typeof d === 'string' && d.trim()) temiz[k] = d.trim().slice(0, 200);
          }
          sinirlar[a] = Object.keys(temiz).length ? temiz : null;
        }
      }
      // "Doldurduktan sonra" tuşu (model alan.doldurucuParametreleri.tus; null: kaldır). Bilinmeyen tuş atılır (mevcut ayar korunur).
      /** @type {Record<string, string | null>} */
      const tuslar = {};
      if (nesneMi(b.tuslar)) {
        for (const a of liste) {
          if (!Object.prototype.hasOwnProperty.call(b.tuslar, a)) continue;
          const t = b.tuslar[a];
          if (t === null || t === '') tuslar[a] = null;
          else if (typeof t === 'string' && ALAN_TUSLARI.includes(t)) tuslar[a] = t;
        }
      }
      bloklar.push({ tur: 'alanlar', ad: metin(b.ad, AD_EN_COK), alanlar: liste, zorunlu: [...new Set(zorunlu)], kosullar, ...(Object.keys(sinirlar).length ? { sinirlar } : {}), ...(Object.keys(tuslar).length ? { tuslar } : {}), ...(b.ekranGoruntusu === true ? { ekranGoruntusu: true } : {}), ...(b.tekrarDenenebilir === true ? { tekrarDenenebilir: true } : {}), ...korunanEki(b) });
    } else if (b.tur === 'bekle') bloklar.push({ tur: 'bekle', saniye: sayi(b.saniye) });
    else if (b.tur === 'ortak') {
      // dahilVarsayilan (yalnız isteğe bağlıyken): yeni senaryolarda "“ad” dahil" işaretli başlar.
      bloklar.push({ tur: 'ortak', dosya: metin(b.dosya, 200), ad: metin(b.ad, AD_EN_COK), istegeBagli: b.istegeBagli === true, ...(b.istegeBagli === true && b.dahilVarsayilan === true ? { dahilVarsayilan: true } : {}) });
    }
    else if (b.tur === 'aksiyon') {
      bloklar.push({ tur: 'aksiyon', dugme: sayi(b.dugme), istegeBagli: b.istegeBagli === true, ...(b.gorunurse === true ? { gorunurse: true } : {}), ...(b.zamanAsimiSn !== undefined && b.zamanAsimiSn !== null && b.zamanAsimiSn !== '' ? { zamanAsimiSn: sayi(b.zamanAsimiSn) } : {}), ...(b.ekranGoruntusu === true ? { ekranGoruntusu: true } : {}), ...(b.tekrarDenenebilir === true ? { tekrarDenenebilir: true } : {}), ...korunanEki(b) });
    } else if (b.tur === 'korunan') {
      // Salt okunur korunan parça: yalnız anahtarı (ve gösterilen adı) alınır; içeriği sunucudaki modelden gelir.
      if (typeof b.korunan !== 'string' || !b.korunan || b.korunan.length > KORUNAN_ANAHTAR_EN_COK) { hatalar.push({ blok: i, mesaj: 'Korunan parça okunamadı; diyagramı yeniden açın.' }); return; }
      bloklar.push({ tur: 'korunan', korunan: b.korunan, ad: metin(b.ad, AD_EN_COK), kapsam: b.kapsam === 'aksiyonlar' ? 'aksiyonlar' : 'adim' });
    }
    else if (b.tur === 'mesaj') bloklar.push({ tur: 'mesaj', mesaj: b.mesaj === null || b.mesaj === undefined ? null : sayi(b.mesaj), metin: metin(b.metin, METIN_EN_COK), ...(b.uyari === true ? { uyari: true } : {}), ...(b.desen === true ? { desen: true } : {}) });
    else if (b.tur === 'bitir') bloklar.push({ tur: 'bitir' });
    else if (b.tur === 'sql') bloklar.push({ tur: 'sql', ad: metin(b.ad, AD_EN_COK), sql: nesneMi(b.sql) ? b.sql : {} });
    else if (b.tur === 'dosya') bloklar.push({ tur: 'dosya', ad: metin(b.ad, AD_EN_COK), dugme: sayi(b.dugme), dosya: nesneMi(b.dosya) ? b.dosya : {} });
    else if (b.tur === 'git') bloklar.push({ tur: 'git', yol: typeof b.yol === 'string' ? b.yol.trim().slice(0, 400) : '' });
    else if (b.tur === 'giris') bloklar.push({ tur: 'giris', ad: metin(b.ad, AD_EN_COK), profil: metin(b.profil, 120) || null });
    else hatalar.push({ blok: i, mesaj: 'Bilinmeyen blok türü.' });
  });
  return { bloklar, hatalar };
}

/**
 * Blokları doğrular ve kayıt envanterine (adım biçimi) çevirir. Hata varsa envanter null.
 * @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env @param {import('./akis-tasarimi.d.mts').AkisBlogu[]} bloklar
 * s.satirSiniri: SQL bloklarının beklenen satır sayısı için kullanıcının satır sınırı (Ayarlar > Koşu > Gelişmiş; verilmezse varsayılan).
 * s.korunanlar: blokların "korunan" anahtarlarının karşılığı (diyagramda düzenlenemeyen, aynen korunan parçalar; yalnız ekranın
 * akışı düzenlenirken sunucu verir). Karşılığı olmayan anahtar hatadır; bir parça yalnız bir blokta kullanılabilir.
 * @param {{ satirSiniri?: number; korunanlar?: Record<string, import('./paket-olusturucu.d.mts').KorunanParca> }} [s]
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
  if (!etkin.some((b) => b.tur === 'alanlar' || b.tur === 'aksiyon' || b.tur === 'korunan')) hata(null, 'Akışta en az bir alan grubu ya da aksiyon olmalı.');
  /** Kullanılan korunan parça anahtarları. @type {Set<string>} */
  const kullanilanKorunan = new Set();
  /** Korunan adımların (aynen) alanları → bloğun sırası ve adımın adı (bir alan iki adımda olamaz). @type {Map<string, { blok: number; ad: string }>} */
  const korunanAdimAlanlari = new Map();
  /**
   * Bloğun korunan parçası (yoksa null; anahtar geçersiz / tekrarlıysa hata). @param {{ korunan?: string }} b @param {number} i
   * @returns {import('./paket-olusturucu.d.mts').KorunanParca | null}
   */
  const korunanAl = (b, i) => {
    if (typeof b.korunan !== 'string' || !b.korunan) return null;
    const k = s.korunanlar && Object.prototype.hasOwnProperty.call(s.korunanlar, b.korunan) ? s.korunanlar[b.korunan] : null;
    if (!k) { hata(i, 'Bu bloğun korunan parçası modelde bulunamadı (model değişmiş olabilir); diyagramı yeniden açın.'); return null; }
    if (kullanilanKorunan.has(b.korunan)) { hata(i, 'Aynı korunan parça birden çok blokta; fazlasını silin.'); return null; }
    kullanilanKorunan.add(b.korunan);
    return k;
  };
  /** Adımın (herhangi bir parçasının) başarı göstergesi aynen korunuyor mu? @param {(typeof adimlar)[number]} a */
  const gostergesiKorunan = (a) => (a.korunanlar ?? []).some((x) => x && x.tur === 'ek' && x.kosuEk && Object.prototype.hasOwnProperty.call(x.kosuEk, 'basariGostergesi'));

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
      // Korunan parçalı grup (adımın diyagramda gösterilemeyen özellikleri) alansız da olabilir.
      const korunan = korunanAl(b, i);
      if (korunan && korunan.tur !== 'ek') hata(i, 'Bu korunan parça alan grubunda kullanılamaz.');
      const ek = korunan && korunan.tur === 'ek' ? korunan : null;
      // Alansız grup bir aksiyonun adıdır (aradaki bekleme süreleri o aksiyondan öncedir).
      const sonraki = etkin.slice(i + 1).find((x) => x.tur !== 'bekle');
      if (!b.alanlar.length && !ek && sonraki?.tur !== 'aksiyon' && !(sonraki?.tur === 'korunan' && sonraki.kapsam === 'aksiyonlar')) hata(i, 'Alan grubu boş: alan ekleyin (alansız bir adımı adlandırmak için ardından bir aksiyon gelmeli).');
      /** @type {import('./paket-olusturucu.d.mts').HamAlan[]} */
      const hamlar = [];
      for (const a of b.alanlar) {
        const h = alanlar.get(a);
        if (!h) { hata(i, 'Kayıtta olmayan bir alan seçilmiş.'); continue; }
        if (kullanilan.has(a)) { hata(i, `“${alanEtiketi(h)}” alanı birden çok grupta; bir alan yalnızca bir grupta olabilir.`); continue; }
        kullanilan.set(a, i);
        const tus = b.tuslar && Object.prototype.hasOwnProperty.call(b.tuslar, a) ? { tus: b.tuslar[a] } : {};
        hamlar.push({ ...h, zorunlu: b.zorunlu.includes(a), ...tus });
        if (b.kosullar && Object.prototype.hasOwnProperty.call(b.kosullar, a)) elleKosullar.push({ blok: i, alan: a, kosul: b.kosullar[a] });
      }
      // Korunan görünürlük koşulu olan adım (ör. seçime bağlı düğmeli adım) her zaman kendi adımıdır.
      if (cur && bekleyen && !(ek && ek.adimEk && Object.prototype.hasOwnProperty.call(ek.adimEk, 'gorunurluk'))) {
        // İsteğe bağlı aksiyonun açtığı alanlar: aynı adımın o düğmeden sonraki parçası.
        const k = cur.acicilar.length;
        cur.alanlar.push(...hamlar);
        cur.parcalar.push(...hamlar.map(() => k));
        if (ek) (cur.korunanlar ??= [])[k] = ek;
        bekleyen = false;
      } else {
        yeniAdim(b.ad || `${adimlar.length + 1}. adım`, hamlar);
        if (ek) /** @type {(typeof adimlar)[number]} */ (cur).korunanlar = [ek];
      }
      // "Ekran görüntüsü al": grubun ait olduğu adım (isteğe bağlı düğmenin açtığı grupta da aynı adım).
      if (b.ekranGoruntusu && cur) /** @type {(typeof adimlar)[number]} */ (cur).ekranGoruntusu = true;
      // "Tekrar denenebilir" (kurtarma kuralı): grubun ait olduğu adım.
      if (b.tekrarDenenebilir && cur) /** @type {(typeof adimlar)[number]} */ (cur).tekrarDenenebilir = true;
      return;
    }
    if (b.tur === 'aksiyon') {
      const d = env.dugmeler[b.dugme];
      if (!d) { hata(i, 'Aksiyonun düğmesini seçin.'); return; }
      if (b.zamanAsimiSn !== undefined && !(Number.isInteger(b.zamanAsimiSn) && b.zamanAsimiSn >= 1 && b.zamanAsimiSn <= 600)) { hata(i, 'Sonucu bekleme süresi 1–600 saniye arasında tam sayı olmalı.'); return; }
      // Düğme bir çerçevedeyse (iframe) çerçeve zinciri de taşınır: koşucu o çerçevede tıklar.
      const og = { secici: d.secici, metin: d.metin, ...(Array.isArray(d.cerceve) && d.cerceve.length ? { cerceve: d.cerceve } : {}) };
      if (b.gorunurse) {
        // "Yalnız görünürse bas" (ör. bazı ekranlarda çıkan ara pencere düğmesi): adımın ilerleme düğmesinden sonra; kısa sürede
        // görünmezse atlanır. Adım kapanmaz (ardından gelen beklemeler / mesajlar aynı adımın).
        if (b.istegeBagli) { hata(i, '“Yalnız görünürse bas” ile “Her senaryoda basılmaz” birlikte seçilemez.'); return; }
        const c0 = /** @type {(typeof adimlar)[number] | null} */ (cur);
        if (!c0 || !kapali || !c0.ilerleme || c0.aksiyonlarAynen || bekleyen) { hata(i, '“Yalnız görünürse bas” düğmesi adımın ilerleme düğmesinden (her senaryoda basılan aksiyon) hemen sonra gelir; ör. onaydan sonra bazen açılan ara penceredeki düğme.'); return; }
        if (b.korunan) { hata(i, 'Bu aksiyonun korunan parçaları “Yalnız görünürse bas” düğmesinde tutulamaz.'); return; }
        if (b.ekranGoruntusu) c0.ekranGoruntusu = true;
        if (b.tekrarDenenebilir) c0.tekrarDenenebilir = true;
        (c0.gorunurseTiklar ??= []).push({ ...og, ...(b.zamanAsimiSn !== undefined ? { zamanAsimiSn: b.zamanAsimiSn } : {}) });
        return;
      }
      if (!cur || kapali) yeniAdim(metin(d.metin, AD_EN_COK) || `${adimlar.length + 1}. adım`, []);
      const c = /** @type {(typeof adimlar)[number]} */ (cur);
      if (b.ekranGoruntusu) c.ekranGoruntusu = true;
      if (b.tekrarDenenebilir) c.tekrarDenenebilir = true;
      const korunan = korunanAl(b, i);
      if (korunan && korunan.tur !== 'ek') { hata(i, 'Bu korunan parça aksiyonda kullanılamaz.'); return; }
      if (b.istegeBagli) {
        c.acicilar.push({ ...og, secimli: true, ...(sure ? { onceBekle: sure } : {}), ...(korunan ? { korunan } : {}) });
        bekleyen = true;
      } else {
        if (korunan) {
          // Korunan parçalı zorunlu aksiyon: adımın ilk parçasına yazılır (o parçada başka korunan parça olmamalı).
          if (c.korunanlar?.[0] || c.acicilar.length) { hata(i, 'Bu aksiyonun korunan parçaları için önce kendi alan grubunu (adım adını) koyun.'); return; }
          c.korunanlar = [korunan];
        }
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
      if (!/^[a-z0-9][a-z0-9-]*\.model\.json$/.test(b.dosya)) { hata(i, 'Eklenecek genel senaryoyu seçin.'); return; }
      if (bekleyen) { hata(i, 'Genel senaryo, isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
      const ad = b.ad || b.dosya.replace(/\.model\.json$/, '');
      if (adlar.has(ad)) { hata(i, `“${ad}” adı başka bir blokta da var; adlar tekil olmalı.`); return; }
      adlar.add(ad);
      sureyiBirak();
      // Ortak akış kendi adımıdır: önceki adım kapanır, sonraki alan grubu / aksiyon yeni adım başlatır.
      adimlar.push({ ad, yol: '', baslik: metin(env.baslik, 200), alanlar: [], ilerleme: null, acicilar: [], parcalar: [], ortakAkis: { dosya: b.dosya, istegeBagli: b.istegeBagli, ...(b.dahilVarsayilan === true ? { dahilVarsayilan: true } : {}) } });
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
    if (b.tur === 'git') {
      // Şu adrese git: kendi adımıdır (oynatmada ekranın kendi adresine göre yol açılır); ardından gelen alan / aksiyon yeni adım
      // olur, beklenen mesaj ise gidilen sayfada aranır. Önceki alan grubu ilerleme düğmesiz olabilir (adres çubuğuyla gidildi).
      const gh = gitYoluHatasi(b.yol);
      if (gh) { hata(i, `Şu adrese git: ${gh}.`); return; }
      if (bekleyen) { hata(i, 'Şu adrese git, isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
      sureyiBirak();
      let ad = `Adrese git: ${b.yol}`.slice(0, AD_EN_COK);
      for (let n = 2; adlar.has(ad); n++) ad = `${`Adrese git: ${b.yol}`.slice(0, AD_EN_COK - 6)} (${n})`;
      adlar.add(ad);
      const c = yeniAdim(ad, []);
      c.aksiyonlarAynen = [{ tur: 'git', yol: b.yol }];
      c.adreseGit = { yol: b.yol };
      kapali = true;
      sqlSonrasi = false;
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
    if (b.tur === 'korunan') {
      const k = korunanAl(b, i);
      if (!k) { if (!b.korunan) hata(i, 'Korunan parça okunamadı; diyagramı yeniden açın.'); return; }
      if (k.tur === 'adim') {
        // Adımın tamamı aynen (ör. alt model adımı): kendi adımıdır; önceki adım kapanır.
        if (bekleyen) { hata(i, 'Korunan adım isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
        const ad = metin(k.adim.baslik, AD_EN_COK) || String(k.adim.id);
        if (adlar.has(ad)) { hata(i, `“${ad}” adı başka bir blokta da var; adlar tekil olmalı.`); return; }
        adlar.add(ad);
        sureyiBirak();
        adimlar.push({ ad, yol: '', baslik: metin(env.baslik, 200), alanlar: [], ilerleme: null, acicilar: [], parcalar: [], korunanAdim: k.adim });
        for (const x of k.alanAnahtarlari ?? []) if (!korunanAdimAlanlari.has(x)) korunanAdimAlanlari.set(x, { blok: i, ad });
        cur = null;
        kapali = false;
        bekleyen = false;
        sqlSonrasi = false;
        return;
      }
      if (k.tur === 'aksiyonlar') {
        // Adımın koşu aksiyonları aynen: düğmesi varsa adımın ilerlemesidir (adımı kapatır), yoksa adım açık kalır.
        if (bekleyen) { hata(i, 'Korunan aksiyonlar isteğe bağlı bir aksiyondan hemen sonra gelemez.'); return; }
        sqlSonrasi = false;
        if (!cur || kapali) yeniAdim(b.ad || `${adimlar.length + 1}. adım`, []);
        const c = /** @type {(typeof adimlar)[number]} */ (cur);
        if (c.aksiyonlarAynen) { hata(i, 'Bir adımda yalnız bir korunan aksiyon bloğu olabilir.'); return; }
        c.aksiyonlarAynen = JSON.parse(JSON.stringify(k.aksiyonlar));
        const t = k.aksiyonlar.find((x) => nesneMi(x) && x.tur === 'tikla' && x.kosul !== 'gorunurse' && typeof x.secici === 'string' && x.secici);
        if (t) {
          c.ilerleme = { secici: String(t.secici), metin: typeof t.aciklama === 'string' ? t.aciklama : null, ...(Array.isArray(t.cerceve) && t.cerceve.length ? { cerceve: t.cerceve.map(String) } : {}) };
          if (sure) c.onceBekle = (c.onceBekle ?? 0) + sure;
          sure = 0;
          kapali = true;
        }
        return;
      }
      hata(i, 'Bu korunan parça ayrı blok olarak kullanılamaz.');
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
      // Alan grubundan sonraki mesajla kapanan (düğmesiz) adım: bekleme alanlar doldurulduktan sonradır.
      if (kapali && !c.ilerleme && !c.aksiyonlarAynen) { c.onceBekle = (c.onceBekle ?? 0) + b.saniye; return; }
      // "Yalnız görünürse bas" düğmesinden sonra: o düğmeden (basılsın ya da atlansın) sonra beklenir.
      const gt = c.gorunurseTiklar?.[c.gorunurseTiklar.length - 1];
      if (kapali && gt) { gt.sonraBekle = (gt.sonraBekle ?? 0) + b.saniye; return; }
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
      const g = {
        secici: m ? m.secici : null, metin: m ? m.metin : b.metin, ...(b.metin ? { aranan: b.metin } : {}), ...(b.desen ? { desen: true } : {}),
        ...(m && Array.isArray(m.cerceve) && m.cerceve.length ? { cerceve: m.cerceve } : {})
      };
      const sonMu = etkin.slice(i).every((x) => x.tur === 'mesaj' || x.tur === 'sql' || x.tur === 'dosya');
      if (!cur) {
        hata(i, adimlar[adimlar.length - 1]?.korunanAdim ? 'Korunan adımın başarı göstergesi diyagramda değiştirilemez; beklenen mesajı bir alan grubu ya da aksiyondan sonra koyun.'
          : 'Beklenen mesajdan önce bir alan grubu ya da aksiyon olmalı.');
        return;
      }
      if (bekleyen) { hata(i, 'Beklenen mesaj isteğe bağlı bir aksiyondan hemen sonra gelemez (her senaryoda görünmez).'); return; }
      const c = /** @type {(typeof adimlar)[number]} */ (cur);
      // Alan grubundan sonra (düğmesiz) gelen, son olmayan mesaj: alanlar doldurulup alandan çıkınca beklenir (ör. zorunlu alan
      // uyarısı Tab'la çıkar). Adım burada kapanır: ardından gelen aksiyon / alan grubu yeni adımdır. Mesajdan önceki bekleme
      // süresi alanlardan sonradır.
      if (!sonMu && !kapali) {
        sureyiBirak();
        kapali = true;
      }
      // Başarı göstergesi aynen korunan adıma (ör. adres göstergesi) başarı mesajı eklenemez: biri diğerini ezerdi.
      if (!b.uyari && gostergesiKorunan(c)) { hata(i, `“${c.ad}” adımının başarı göstergesi diyagramda düzenlenemez (aynen korunur); bu adıma beklenen mesaj eklenemez.`); return; }
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
  // Korunan (aynen) adımın alanı başka bir grupta olamaz (modelde aynı alan iki adımda olurdu).
  for (const [a, k] of korunanAdimAlanlari) {
    const blok = kullanilan.get(a);
    const h = alanlar.get(a);
    if (blok !== undefined) hata(blok, `“${h ? alanEtiketi(h) : a}” alanı korunan “${k.ad}” adımında da var; bir alan yalnızca bir adımda olabilir (alanı gruptan çıkarın ya da korunan adımı silin).`);
  }
  // Elle koşullar: seçim alanı akışta olmalı, seçim (select/radyo) olmalı, değerler seçeneklerinden olmalı.
  for (const { blok, alan, kosul } of elleKosullar) {
    if (!kosul) continue;
    const h = alanlar.get(alan);
    const s = alanlar.get(kosul.secim);
    const ad = h ? alanEtiketi(h) : alan;
    if (!s || !kullanilan.has(kosul.secim)) hata(blok, `“${ad}” alanının koşulundaki seçim alanı akışta yok; seçim alanını bir gruba ekleyin ya da koşulu kaldırın.`);
    else if (!kosulAlaniMi(s) || kosul.secim === alan) hata(blok, `“${ad}” alanının koşulu bir seçim alanına (açılır liste / radyo) ya da onay kutusuna bağlanmalı.`);
    else if (s.tur === 'checkbox' ? kosul.degerler.length !== 1 || !['true', 'false'].includes(kosul.degerler[0])
      : !kosul.degerler.length || kosul.degerler.some((d) => !secenekKumesi(s).has(d))) {
      hata(blok, s.tur === 'checkbox' ? `“${ad}” alanının koşulunda “${alanEtiketi(s)}” için işaretli ya da işaretsiz durumlarından birini seçin.`
        : `“${ad}” alanının koşulunda “${alanEtiketi(s)}” için en az bir geçerli seçenek seçin.`);
    }
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
