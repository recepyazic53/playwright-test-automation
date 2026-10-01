// HIZLI TEST SİHİRBAZI — sunucu tarafı (genel; ürün / şirket adı yok). Arayüz: arayuz/hizli-test.js (#/hizli-test).
//
// TASARIM NOTU (v1.5):
//  - Altyapı: tarama iş yöneticisi (tarama/yonetici.mjs) kip 'hizliTest' ile GÖRÜNÜR tarayıcı açar (giriş tarifi / saklanan oturum,
//    yasaklı adres, izinli köken, izinler ve CANLI onayı AYNEN; uç denetimi guvenlik/uc-denetimi.mjs). Alt süreç (tarama/hizli-test-
//    motoru.ts) keşfeder (tarama envanteri + eylem keşfi; basmadan) ve bu dosyanın komutlarını uygular (doldur / bas / seç / doğrula).
//  - Oturum = durum makinesi (bellekte; sunucu yeniden başlarsa kaybolur). Durumlar: kesif → veri (veri durağı) → karar ("Şimdi ne
//    yapayım?") → [onay (Bana sor) | secim (sayfada seç)] → calisiyor (basış) → [hataSorusu] → veri / karar … → bitis (etiketler) →
//    kaydet (H3 doğrulama sorusu, farklar onayı) → kaydedildi. Hayır izninde: kesif → veri → hayirSecim (düğme + mesaj adaylardan) →
//    bitis → kaydet ("doğrulanmadı"). Akış tamamlanmadan bitmez: zorunlu boş alan varken ilerlenmez.
//  - Değer ÜRETİLMEZ: alan değerleri yalnız kullanıcının yazdığı ya da "Doldur" ile tablodan seçtiğidir (tablo başvurusu "${Tablo.Sütun}"
//    senaryoya aynen yazılır; tarayıcıya giden değer sunucuda tablodan çözülür, yalnız bellekte).
//  - Düğmeye yalnız kullanıcının izniyle basılır: evet → kullanıcının seçtiği / tek aday; sor → her basıştan önce onay; hayir → hiç.
//  - Kayıt: oturumun zinciri akış kaydı envanterine çevrilir (hizli-test/akis.mjs > kayitEnvanteriKur) ve "Akışı kaydet" ile AYNI
//    paket yolundan (kayitPaketiOlustur → sayfaEkle / modeliPaketleDegistir) ekran modeli olur; son adıma bitiş koşulu yazılır (Bitti →
//    kosu.basariGostergesi, Hata → kosu.uyarilar, Devam → kosu.bitisKosulu.devam). Senaryo senaryoKaydet ile (değerler, tablo seçimleri,
//    içerikte hizliTest: izin, bitiş, doğrulandı). Aynı ekran varsa yeni model sürümü; farklar önce onaya sunulur.
//
// Uçlar (oturum token'ı; kasa açık):
//   GET  /platform/hizli-test/secenekler?projeId=&ekranId=   ortamlar (canlı mı, giriş tarifi), düzenlenecek ekran, süren oturum
//   POST /platform/hizli-test/baslat { projeId, ortamId, hedef, ekranAdi | ekranId, cumle?, izin, girissiz?, canliOnay? } → { id }
//   GET  /platform/hizli-test/durum?id=                       oturumun görünümü (soru, zincir, görülen metinler; değer maskesiz yalnız kullanıcının yazdığı)
//   POST /platform/hizli-test/veri { id, degerler, zincir?, zinciriAtla? }   veri durağı: { anahtar: { deger, kaynak: 'elle' | 'tablo', tabloSecimi? } };
//        zincir: üst liste anahtarı → yalnız o seçim (ve sayfaya uygulanmamış üstleri) uygulanır, bağlı alt listeler gelince aynı durak
//        yeniden sorulur (eksik denetlenmez, düğmeye basılmaz); zinciriAtla: getirilmemiş bağlı listeler sorulmadan devam edilir.
//   POST /platform/hizli-test/karar { id, karar: 'bas' | 'baska' | 'bitir' | 'duzelt', secici?, metin?, dugme?, mesajlar? }
//   POST /platform/hizli-test/onay { id, cevap }               Bana sor: "X'e basayım mı?"
//   POST /platform/hizli-test/diyalog { id, cevap: 'kabul' | 'iptal' }   Bana sor: basışta açılan onay / soru penceresinin yanıtı
//   POST /platform/hizli-test/hata-cevabi { id, cevap: 'hata' | 'uyari' | 'onemsiz' }
//   POST /platform/hizli-test/bitis { id, etiketler, adres?, olumsuz? }
//   POST /platform/hizli-test/geri { id, hedef: 'karar' | 'bitis' }   bitiş / kaydet ekranından adım adım zincire ya da bitiş koşuluna dön
//   POST /platform/hizli-test/dogrula { id }                   H3: baştan sona doğrulama koşusu (yeni kayıt oluşabilir; adım adım ilerleme)
//   POST /platform/hizli-test/ozet { id, baslik?, kosuyaDahil?, tabloOlustur? }   kayıt özeti (hiçbir şey yazılmaz; seçimler oturumda saklanır,
//                                                              özet sekmesi #/hizli-test/ozet/<id> gövdesiz okur)
//   POST /platform/hizli-test/kaydet { id, baslik, kosuyaDahil?, onay?, uzerineYaz? }   düzenlemede aynı başlıklı senaryo varsa önce
//                                                              { senaryoVar } (onaysız); aynı ekran varsa farklar (onaysız), onayla yeni sürüm
//   POST /platform/hizli-test/iptal { id }
// NOT: import.meta KULLANILMAZ. Tipler: yonetici.d.mts.
import { randomBytes } from 'node:crypto';
import {
  DepoHatasi, ekranlariListele, ekranModeliGetir, ortamlariListele, projeGetir, senaryoGetir
} from '../veritabani/depo.mjs';
import { etkinGirisTarifi } from '../giris/tarif-deposu.mjs';
import { riskliOrtamMi } from '../guvenlik/ortam-riski.mjs';
import { ucDenetle } from '../guvenlik/uc-denetimi.mjs';
import { TaramaHatasi, taramaYoneticisiAl } from '../tarama/yonetici.mjs';
import { HedefHatasi, ekKokenleri, hedefCoz } from '../tarama/koruma.mjs';
import { ekranAnahtariOner, kayitPaketiOlustur } from '../tarama/paket-olusturucu.mjs';
import { katla } from '../tarama/eylem-kesfi.mjs';
import { yerTutucuSecenekMi } from '../tarama/yer-tutucu-secenek.mjs';
import { bulguMetni, gercekSecenekler, olaganYuklenme, zincirMetni } from '../tarama/zincir-kesfi.mjs';
import { modeliPaketleDegistir, paketOnizle, sayfaEkle } from '../ekranlar/ekran-servisi.mjs';
import { bulguOzeti, modelFarki } from '../ekranlar/model-farki.mjs';
import { senaryoKaydet } from '../senaryolar/senaryo-servisi.mjs';
import { senaryoHazirligi } from '../senaryolar/hazirlik-servisi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet } from '../tablolar/ekran-baglari.mjs';
import { karsiliklariEkrandanAl } from '../tablolar/karsiliklar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { basvuruYaz, pinAnahtari, planKur, planOnizle, planYaz, senaryoOnerileri, varsayilanSecim } from './kayit-plani.mjs';
import { ekranBasvurulariniCoz } from '../tablolar/ekran-basvurulari.mjs';
import { degerBasvurusu } from '../tablolar/tablo-secimi.mjs';
import {
  BITIS_BEKLEME_SN, IZINLER, IZIN_ADLARI, adayMesajlari, basmaKarari, beklemeMetniMi, bitisKosulu, bitisiUygula, bitisUyarilari, canliOnayMetni, cumleyiOku,
  eksikAlanlar, hizliSenaryoBasligi, kayitEnvanteriKur, sayfaUyarisi, senaryoAnahtarlari, senaryoVerisiKur, tekAday, varsayilanEtiketler
} from './akis.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */

/** Kullanılmayan oturum bu süre sonra silinir (son erişimden). */
export const OTURUM_SAKLAMA_MS = 2 * 60 * 60 * 1000;
const OTURUM_KIMLIGI = /^[a-f0-9]{24}$/;
/** Düzenlenebilir alan türleri (düğme türleri ve gizli alanlar veri durağına girmez). */
const DOLDURULMAZ = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

export class HizliTestHatasi extends Error {
  /** @param {string} kod @param {string} mesaj @param {number} [durum] @param {Nesne} [ek] */
  constructor(kod, mesaj, durum = 400, ek = {}) {
    super(mesaj);
    this.name = 'HizliTestHatasi';
    this.kod = kod;
    this.durum = durum;
    this.ek = ek;
  }
}

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const simdi = () => new Date().toISOString();
/** @param {unknown} d @param {number} n */
const metin = (d, n) => (typeof d === 'string' && d.trim() ? d.replace(/\s+/g, ' ').trim().slice(0, n) : null);
/** @param {unknown} d @param {string} ad */
function kimlikAl(d, ad) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${ad}" geçersiz.`);
  return d;
}
/** Alan doldurulabilir mi (veri durağına girer mi)? @param {Nesne} a */
const doldurulabilir = (a) => !DOLDURULMAZ.has(String(a.tur)) && !a.devreDisi && !a.saltOkunur;
/** Sayfada görünen adı bulunamayan alanın gösterim adı (teknik ad değil). @param {Nesne} a */
const adsizEtiket = (a) => {
  const tur = { select: 'Liste', textarea: 'Metin alanı', radio: 'Seçenek grubu', checkbox: 'Onay kutusu', date: 'Tarih alanı', number: 'Sayı alanı', tel: 'Telefon alanı', email: 'E-posta alanı' }[String(a.tur)] ?? 'Metin kutusu';
  return `Adı görünmeyen alan (${tur})`;
};
/** Parola türündeki alanın değeri görünümde maskelenir. @param {Nesne} a */
const gizliAlan = (a) => String(a.tur) === 'password';

/**
 * @param {{ projeKoku: string; yonetici?: import('../tarama/yonetici.d.mts').TaramaYoneticisi }} s
 */
export function hizliTestYoneticisiOlustur(s) {
  const tarama = () => s.yonetici ?? taramaYoneticisiAl(s.projeKoku);
  /** @type {Map<string, Nesne>} */
  const oturumlar = new Map();

  const temizle = () => {
    const sinir = Date.now() - OTURUM_SAKLAMA_MS;
    for (const [id, o] of oturumlar) if (Date.parse(o.sonErisim) < sinir) oturumlar.delete(id);
  };
  /** @param {string} id */
  const oturumGetir = (id) => {
    temizle();
    const o = typeof id === 'string' && OTURUM_KIMLIGI.test(id) ? oturumlar.get(id) : undefined;
    if (!o) throw new HizliTestHatasi('BULUNAMADI', 'Hızlı test bulunamadı (süresi dolmuş ya da sunucu yeniden başlamış olabilir).', 404);
    o.sonErisim = simdi();
    return o;
  };
  /** @param {Nesne} o @param {string} m */
  const gunluk = (o, m) => {
    o.gunluk.push({ zaman: simdi(), metin: m.slice(0, 300) });
    if (o.gunluk.length > 60) o.gunluk.splice(0, o.gunluk.length - 60);
  };
  /** @param {Nesne} o @param {Nesne} komut */
  const gonder = (o, komut) => {
    const no = ++o.komutNo;
    o.bekleyen = { no, tur: komut.tur };
    tarama().komutGonder(o.isId, /** @type {any} */ ({ no, ...komut }));
    return no;
  };
  /** Oturum düzenlenebilir durumda mı (süren komut / bitmiş oturum yok)? @param {Nesne} o @param {string[]} durumlar */
  const durumda = (o, durumlar) => {
    if (o.durum === 'hata' || o.durum === 'iptal') throw new HizliTestHatasi('BITTI', o.hata?.mesaj ?? 'Hızlı test bitti.', 409);
    if (!durumlar.includes(o.durum)) throw new HizliTestHatasi('DURUM', 'Hızlı test şu anda bu işlemi beklemiyor; sayfayı yenileyin.', 409, { durum: o.durum });
  };

  // ---- Zincir yardımcıları ----
  /** @param {Nesne} o */
  const guncelAdim = (o) => o.adimlar[o.adimlar.length - 1];
  /** Alanı oturumun haritasına ve adıma ekler. @param {Nesne} o @param {Nesne} alan @param {Nesne} adim @param {boolean} yeni */
  const alanEkle = (o, alan, adim, yeni) => {
    if (o.alanlar.has(alan.anahtar)) return;
    // Bağlı liste (zincir keşfi ya da doldururken gözlenen): alanın seçenekleri üst listenin seçimine göre gelir.
    const ust = o.bagliUst?.get(alan.anahtar);
    if (ust && !alan.bagli) alan.bagli = { ust };
    o.alanlar.set(alan.anahtar, { alan, yeni });
    adim.alanlar.push(alan);
  };
  // ---- Koşullu alanlar (seçim keşfi): bir seçimin belirli değerinde beliren alanlar ----
  /**
   * Koşullu alan şu an geçerli mi? Alanın koşulu: "<secim> alanı şu değerlerden biri olunca görünür". Seçimin değeri: kullanıcının yazdığı,
   * yoksa sayfanın ilk değeri (keşif). Seçimin kendisi de koşulluysa ve geçerli değilse alan geçerli değildir. Değer tablo başvurusuysa
   * (çözülmemiş) bilinmez: geçerli sayılır. @param {Nesne} o @param {Nesne} alan @param {Set<string>} [gorulen]
   * @returns {boolean}
   */
  const kosulAktif = (o, alan, gorulen = new Set()) => {
    const kz = alan.kosul;
    if (!kz || gorulen.has(alan.anahtar)) return true;
    gorulen.add(alan.anahtar);
    const kontrol = o.alanlar.get(kz.secim)?.alan;
    if (kontrol && !kosulAktif(o, kontrol, gorulen)) return false;
    const v = o.degerler[kz.secim];
    if (v && degerBasvurusu(v.deger)) return true;
    const simdi = v ? v.deger : o.kesifIlk?.[kz.secim] ?? null;
    if (simdi === null || simdi === undefined) return true;
    return kz.degerler.includes(String(simdi));
  };
  /** Geçerli olmayan koşullu alanların değerleri kaydedilmez / gönderilmez. @param {Nesne} o */
  const aktifDegerler = (o) => Object.fromEntries(Object.entries(o.degerler).filter(([k]) => { const a = o.alanlar.get(k)?.alan; return !a || kosulAktif(o, a); }));
  /** Doldurma sırası: kullanıcının sırası korunur; koşullu alan her zaman kendi seçiminden SONRA doldurulur. @param {Nesne[]} liste @returns {Nesne[]} */
  const bagimliSirala = (liste) => {
    const s = [...liste];
    for (let tur = 0; tur < s.length; tur++) {
      let degisti = false;
      for (let i = 0; i < s.length; i++) {
        // Koşullu alan kendi seçiminden, bağlı liste üst listesinden SONRA.
        const ust = s[i].kosul?.secim ?? s[i].bagli?.ust;
        if (!ust) continue;
        const j = s.findIndex((x) => x.anahtar === ust);
        if (j > i) { const [x] = s.splice(i, 1); s.splice(j, 0, x); degisti = true; break; }
      }
      if (!degisti) break;
    }
    return s;
  };
  /**
   * Seçim keşfinin sonuçlarını ilk adıma işler: her değerde beliren alan koşullu alan olarak eklenir (kontrol alanının hemen sonrasına);
   * koşul "seçim şu değerlerden biri" biçiminde adımın koşullarına yazılır (modelde görünürlük koşulu olur).
   * @param {Nesne} o @param {Nesne} adim @param {Nesne[]} kesifler
   */
  const kosulluAlanlariEkle = (o, adim, kesifler) => {
    o.kesifIlk ??= {};
    for (const k of kesifler) if (typeof k.secim === 'string' && !(k.secim in o.kesifIlk)) o.kesifIlk[k.secim] = k.ilkDeger ?? null;
    adim.kosullar ??= {};
    for (const k of kesifler) {
      for (const d of Array.isArray(k.degerler) ? k.degerler : []) {
        for (const g of Array.isArray(d.gorunenler) ? d.gorunenler : []) {
          if (!nesneMi(g) || typeof g.anahtar !== 'string' || !doldurulabilir(g)) continue;
          const var_ = o.alanlar.get(g.anahtar)?.alan;
          if (var_) {
            if (var_.kosul && var_.kosul.secim === k.secim && !var_.kosul.degerler.includes(String(d.deger))) var_.kosul.degerler.push(String(d.deger));
            continue;
          }
          const alan = { ...g, kosul: { secim: String(k.secim), degerler: [String(d.deger)] } };
          o.alanlar.set(alan.anahtar, { alan, yeni: false });
          // Kontrol alanının (ve onun önceki koşullu alanlarının) hemen sonrasına.
          let konum = adim.alanlar.findIndex((/** @type {Nesne} */ x) => x.anahtar === k.secim);
          if (konum >= 0) { while (konum + 1 < adim.alanlar.length && adim.alanlar[konum + 1].kosul?.secim === k.secim) konum++; adim.alanlar.splice(konum + 1, 0, alan); }
          else adim.alanlar.push(alan);
        }
      }
    }
    // Bir seçimin belirli değerinde KAYBOLAN alanlar (ör. varsayılan seçenekte görünen alanlar): alan seçimin denenen diğer değerlerinde görünür.
    for (const k of kesifler) {
      const denenen = (Array.isArray(k.degerler) ? k.degerler : []).map((/** @type {Nesne} */ d) => String(d.deger));
      const tumu = [...new Set([...(k.ilkDeger === null || k.ilkDeger === undefined ? [] : [String(k.ilkDeger)]), ...denenen])];
      /** @type {Map<string, Set<string>>} */
      const gizli = new Map();
      for (const d of Array.isArray(k.degerler) ? k.degerler : []) for (const x of Array.isArray(d.kaybolanlar) ? d.kaybolanlar : []) {
        if (typeof x !== 'string' || x === k.secim) continue;
        (gizli.get(x) ?? gizli.set(x, new Set()).get(x))?.add(String(d.deger));
      }
      for (const [anahtar, gizliDegerler] of gizli) {
        const alan = o.alanlar.get(anahtar)?.alan;
        if (!alan || alan.kosul) continue;
        const gorunur = tumu.filter((x) => !gizliDegerler.has(x));
        if (!gorunur.length || gorunur.length >= tumu.length) continue;
        alan.kosul = { secim: String(k.secim), degerler: gorunur };
      }
    }
    for (const a of adim.alanlar) if (a.kosul) adim.kosullar[a.anahtar] = a.kosul;
  };
  /** Zorunlu boş alan var mı / gösterilecek alan var mı → veri durağı. @param {Nesne} o @param {string | null} [not] */
  const veriDuragi = (o, not = null) => {
    o.durum = 'veri';
    o.soruNotu = not;
  };
  // ---- Bağlı listeler (il → ilçe, marka → model…; zincir-kesfi.mjs) ----
  /** Alanın görünen adı. @param {Nesne} o @param {string} anahtar */
  const alanAdi = (o, anahtar) => o.alanlar.get(anahtar)?.alan.etiket ?? o.kesifAdlari?.get(anahtar) ?? anahtar;
  /** Bağlı liste henüz seçeneksiz mi (üst seçilince dolacak)? @param {Nesne} a */
  const bagliBekliyor = (a) => Boolean(a.bagli) && !gercekSecenekler(a.secenekler).length;
  /**
   * Bağlı listenin seçenekleri üstün şu anki değerine göre mi geldi? Üstün değeri girilmişse sayfaya uygulanan değerle aynı olmalı;
   * üst sayfada hazır geliyorsa (değer girilmemiş) seçeneklerin varlığı yeter. @param {Nesne} o @param {Nesne} a
   */
  const bagliGetirildi = (o, a) => {
    if (!a.bagli || bagliBekliyor(a)) return false;
    const u = o.degerler[a.bagli.ust];
    return !u || o.uygulanan[a.bagli.ust] === u.deger;
  };
  /** Üst → alt ilişkisini kaydeder (paketin bagliListeler'i, alanın bagli'si). @param {Nesne} o @param {string} ust @param {string} alt */
  const bagliEkle = (o, ust, alt) => {
    if (ust === alt || o.bagliUst.has(alt)) return;
    o.bagliUst.set(alt, ust);
    const a = o.alanlar.get(alt)?.alan;
    if (a && !a.bagli) a.bagli = { ust };
  };
  /** Bir alanın (doğrudan ya da dolaylı) üstleri. @param {Nesne} o @param {string} anahtar */
  const ustleri = (o, anahtar) => {
    const l = [];
    for (let u = o.bagliUst.get(anahtar); u && !l.includes(u) && l.length < 10; u = o.bagliUst.get(u)) l.push(u);
    return l;
  };
  /**
   * Doldurma / okumadan sonra: bilinen açılır listelerin seçenekleri sayfanın güncel okumasıyla tazelenir (bağlı liste üst seçilince dolar).
   * Seçenekleri değişen listeler döner. secimler: o anki seçim değerleri; degisen: bu doldurmada değeri değişen seçim alanları — tek
   * bir seçim değiştiyse ve seçenekleri değişen bir liste bağlı bilinmiyorsa, ona bağlı sayılır (genel gözlem; ad bilinmez).
   * @param {Nesne} o @param {Nesne} anlik @param {Record<string, string>} secimler @param {string[]} degisen @returns {string[]}
   */
  const secenekleriTazele = (o, anlik, secimler = {}, degisen = []) => {
    /** @type {string[]} */
    const degisenler = [];
    for (const yeni of anlik.alanlar) {
      if (yeni.tur !== 'select') continue;
      const kayit = o.alanlar.get(yeni.anahtar)?.alan;
      if (!kayit) continue;
      const imza = (/** @type {Nesne} */ a) => JSON.stringify(gercekSecenekler(a.secenekler).map((x) => x.deger));
      const once = imza(kayit);
      kayit.secenekler = yeni.secenekler;
      kayit.devreDisi = yeni.devreDisi;
      kayit.hazir = yeni.hazir;
      kayit.mevcut = yeni.mevcut;
      if (imza(kayit) === once) continue;
      degisenler.push(yeni.anahtar);
      if (!kayit.bagli && degisen.length === 1 && degisen[0] !== yeni.anahtar) bagliEkle(o, degisen[0], yeni.anahtar);
      // Tablolar için gözlem: bu listenin seçenekleri, üstlerinin o anki değerleriyle (çok düzeyli test verisi).
      const ustler = ustleri(o, yeni.anahtar);
      const l = gercekSecenekler(yeni.secenekler);
      if (l.length && ustler.every((u) => typeof secimler[u] === 'string')) {
        o.gozlemler.push({ anahtar: yeni.anahtar, secimler: Object.fromEntries(ustler.map((u) => [u, secimler[u]])), secenekler: l });
      }
      // Seçilmiş değer yeni listede yoksa (üst değişti) değer bırakılır: eski üstün alt seçeneği gönderilmez.
      const v = o.degerler[yeni.anahtar];
      if (v && typeof v.deger === 'string' && !degerBasvurusu(v.deger) && !l.some((x) => x.deger === v.deger || x.metin === v.deger)) {
        delete o.degerler[yeni.anahtar];
        gunluk(o, `“${alanAdi(o, yeni.anahtar)}” listesinin seçenekleri değişti; önceki değer artık listede yok, yeniden seçin.`);
      }
    }
    return degisenler;
  };
  /** Veri durağından sonra: Hayır → düğme / mesaj seçimi; Evet + ilk adım + tek aday → basılır; diğerleri → "Şimdi ne yapayım?". @param {Nesne} o */
  const verilerTamam = (o) => {
    if (o.izin === 'hayir') { o.durum = 'hayirSecim'; return; }
    const adaylar = o.sonAnlik?.dugmeler ?? [];
    if (o.izin === 'evet' && o.basisNo === 0) {
      const a = tekAday(adaylar, o.cumle.dugmeler);
      if (a && basmaKarari({ izin: o.izin, adaySayisi: 1 }) === 'bas') {
        gunluk(o, `Evet izni: tek aday “${a.metin ?? a.secici}”; basılıyor.`);
        basmayaBasla(o, { secici: a.secici, metin: a.metin });
        return;
      }
    }
    o.durum = 'karar';
  };
  /** @param {Nesne} o @param {{ secici: string; metin: string | null }} d */
  const basmayaBasla = (o, d) => {
    // Basıştan önce ekranda olan metinler: bitiş adımında "Sayfayı yeniden tara" yalnız bunlardan SONRA beliren metinleri ekler.
    o.basOncesiMetinler = new Set((o.sonAnlik?.metinler ?? []).map((/** @type {Nesne} */ m) => m.metin));
    o.basiliyor = d;
    o.durum = 'calisiyor';
    o.calisiyor = `“${d.metin ?? d.secici}” düğmesine basıldı; sayfa izleniyor…`;
    gonder(o, { tur: 'bas', secici: d.secici, metin: d.metin });
  };
  /** Basıştan sonra (hata sorusu yanıtlandıysa): yeni alanlar → yeni adım + veri durağı; yoksa yeni (alansız) adım + karar. @param {Nesne} o */
  const basistanSonra = (o) => {
    const f = o.sonFark;
    const adim = { alanlar: [], bas: null, okumalar: [] };
    o.adimlar.push(adim);
    for (const a of f.yeniAlanlar.filter(doldurulabilir)) alanEkle(o, a, adim, true);
    // Basıştan sonra beliren seçim alanlarının keşfi: içlerindeki koşullu alanlar bu adıma eklenir.
    if (Array.isArray(o.sonKesif) && o.sonKesif.length) { kosulluAlanlariEkle(o, adim, o.sonKesif); o.sonKesif = []; }
    adim.okumalar.push({ gorunen: f.anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar), secimler: {} });
    if (adim.alanlar.length) veriDuragi(o, `${adim.alanlar.length} yeni alan belirdi; değerlerini girin.`);
    else o.durum = 'karar';
  };

  // ---- Alt sürecin olayları ----
  /** @param {Nesne} o @param {Nesne} e */
  function olayIsle(o, e) {
    o.sonErisim = simdi();
    if (e.olay === 'isBitti') {
      o.isBitti = true;
      if (!['kaydedildi', 'iptal', 'hata'].includes(o.durum)) {
        const h = nesneMi(e.hata) ? e.hata : null;
        o.durum = 'hata';
        o.hata = { kod: h?.kod ?? 'SUREC', mesaj: h?.mesaj ?? 'Hızlı test tarayıcısı kapandı.' };
      }
      return;
    }
    if (e.olay === 'kesif') {
      const anlik = e.anlik;
      o.kesifAnlik = { ...anlik, goruntu: null };
      for (const m of anlik.metinler ?? []) o.onceGorunenler.add(m.metin);
      o.sonAnlik = anlik;
      o.sonGoruntu = anlik.goruntu ?? null;
      o.baslik = anlik.baslik ?? '';
      o.calisiyor = null;
      // İstenen sayfa açılmadıysa (site başka sayfaya yönlendirdi) sessizce devam edilmez: kullanıcıya uyarı gösterilir.
      o.sayfaUyarisi = sayfaUyarisi(o.hedefYol, anlik.yol);
      if (o.sayfaUyarisi) gunluk(o, `Uyarı: istenen sayfa açılmadı; ${anlik.yol} açık.`);
      const adim = { alanlar: [], bas: null, okumalar: [{ gorunen: anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar), secimler: {} }] };
      o.adimlar = [adim];
      // Bağlı liste zinciri (zincir-motoru.ts): ilişkiler alanlara "bagli" olarak, gözlemler tablolara, bulgular kullanıcıya.
      const z = nesneMi(e.zincir) ? e.zincir : null;
      o.kesifAdlari = new Map(anlik.alanlar.map((/** @type {Nesne} */ a) => [a.anahtar, a.etiket ?? a.anahtar]));
      for (const i of Array.isArray(z?.iliskiler) ? z.iliskiler : []) if (typeof i.ust === 'string' && typeof i.alt === 'string') bagliEkle(o, i.ust, i.alt);
      for (const g of Array.isArray(z?.gozlemler) ? z.gozlemler : []) if (nesneMi(g) && typeof g.anahtar === 'string') o.gozlemler.push(g);
      for (const [k, l] of Object.entries(nesneMi(z?.sureler) ? z.sureler : {})) if (Array.isArray(l)) (o.yuklenme[k] ??= []).push(...l.filter((x) => Number.isFinite(x)));
      for (const a of anlik.alanlar.filter(doldurulabilir)) alanEkle(o, a, adim, false);
      for (const b of Array.isArray(z?.bulgular) ? z.bulgular : []) o.bulgular.push(bulguMetni(b, (k) => alanAdi(o, k)));
      const tabanSayisi = adim.alanlar.length;
      kosulluAlanlariEkle(o, adim, Array.isArray(e.kesifler) ? e.kesifler : []);
      // Seçimle beliren (koşullu) alan da bağlı liste olabilir (ör. marka seçilince beliren model listesi).
      for (const [alt, ust] of o.bagliUst) { const a = o.alanlar.get(alt)?.alan; if (a && !a.bagli) a.bagli = { ust }; }
      const kosullu = adim.alanlar.length - tabanSayisi;
      gunluk(o, `Keşif: ${tabanSayisi} alan${kosullu ? ` + seçimlere bağlı ${kosullu} alan` : ''}, ${anlik.dugmeler.length} düğme adayı; hiçbir düğmeye basılmadı.`);
      if (o.bagliUst.size) {
        const zincir = zincirMetni([...o.bagliUst].map(([alt, ust]) => ({ ust, alt })), (k) => alanAdi(o, k));
        gunluk(o, `Bağlı listeler: ${zincir.join('; ')}${z ? ` (${z.acilis} kez açılıp ${z.secim} seçim denendi)` : ''}. Veri durağında üstten alta sırayla sorulur.`);
      }
      if (o.bulgular.length) gunluk(o, `Bağlı liste bulguları: ${o.bulgular.length} (aşağıda “Bulgular”).`);
      // Kesin olmayan durumlar (seçilemeyen değer, bütçe sınırı…): bulgu değil, not.
      for (const n of (Array.isArray(z?.notlar) ? z.notlar : []).slice(0, 8)) gunluk(o, `Bağlı liste notu: ${String(n)}`);
      if (adim.alanlar.length) veriDuragi(o); else verilerTamam(o);
      return;
    }
    // Süren komutun ilerlemesi (doldurma / doğrulama koşusu): komut bitmez, yalnız "şu an ne yapılıyor" ve doğrulamanın adım durumu güncellenir.
    if (e.olay === 'ilerleme') {
      if (!o.bekleyen || e.no !== o.bekleyen.no) return;
      const m = metin(e.mesaj, 300);
      if (o.bekleyen.tur === 'dogrula') {
        if (m) o.calisiyor = `Doğrulama koşusu — ${m}`;
        const adim = Number(e.adim);
        if (Array.isArray(o.dogrulamaAdimlari) && Number.isInteger(adim)) {
          // adim 0: sayfa açılıyor; 1..n: planın adımı; n+1: bitiş koşulu (listenin son satırı). Öncekiler tamam, bu sürüyor.
          o.dogrulamaAdimlari.forEach((/** @type {Nesne} */ x, /** @type {number} */ i) => { x.durum = i + 1 < adim ? 'tamam' : i + 1 === adim ? 'suruyor' : 'bekliyor'; });
          const suren = o.dogrulamaAdimlari[adim - 1];
          if (suren && m) suren.ayrinti = m;
        }
      } else if (m) o.calisiyor = m;
      return;
    }
    // Bana sor: basış sırasında sayfa onay / soru penceresi açtı (komut sürer; yanıt /diyalog ucuyla gider).
    if (e.olay === 'diyalog') {
      if (!o.bekleyen || e.no !== o.bekleyen.no) return;
      const tur = ['alert', 'confirm', 'prompt', 'beforeunload'].includes(String(e.tur)) ? String(e.tur) : 'confirm';
      o.diyalogSorusu = { tur, mesaj: metin(e.mesaj, 300) ?? '', dugme: o.basiliyor ?? null };
      o.durum = 'diyalog';
      o.calisiyor = null;
      gunluk(o, `Sayfa ${tur === 'prompt' ? 'soru' : 'onay'} penceresi açtı: “${o.diyalogSorusu.mesaj}”; yanıtınız bekleniyor.`);
      return;
    }
    if (!o.bekleyen || e.no !== o.bekleyen.no) return;
    const bekleyen = o.bekleyen;
    o.bekleyen = null;
    o.calisiyor = null;
    o.diyalogSorusu = null;
    if (e.olay === 'hata') {
      o.sonHata = String(e.mesaj ?? '').slice(0, 500);
      gunluk(o, `Hata: ${o.sonHata}`);
      if (bekleyen.tur === 'doldur') { o.zincirIstegi = null; o.zincirAtla = false; o.sonGonderilen = {}; veriDuragi(o); }
      else if (bekleyen.tur === 'dogrula') { o.dogrulama = { durum: 'basarisiz', mesaj: o.sonHata, gorulen: [] }; dogrulamaAdimlariniKapat(o, false); o.durum = 'kaydet'; }
      else o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar';
      return;
    }
    o.sonHata = null;
    if (e.olay === 'dolduruldu') {
      o.sonAnlik = e.anlik;
      // Yerinde zincir isteği ("↓ … seçeneklerini getir") ya da "Bağlı alanları atla": bu doldurmanın amacı (bir kez kullanılır).
      const zincirIstegi = o.zincirIstegi ?? null;
      const atla = o.zincirAtla === true;
      o.zincirIstegi = null;
      o.zincirAtla = false;
      for (const [k, ms] of Object.entries(nesneMi(e.beklemeler) ? e.beklemeler : {})) if (Number.isFinite(ms)) (o.yuklenme[k] ??= []).push(Number(ms));
      o.alanHatalari = Object.fromEntries((e.hatalar ?? []).map((/** @type {Nesne} */ h) => [h.anahtar, h.mesaj]));
      // Sayfaya uygulanan değerler: bağlı listenin gösterilen seçenekleri hangi üst değere göre geldi (yerinde düğmenin "geldi" durumu).
      // Üst sayfada yeniden seçilince altları sayfada boşalır: bu doldurmada gönderilmeyen altların uygulanan değeri düşer.
      const gonderilen = o.sonGonderilen ?? {};
      o.sonGonderilen = {};
      for (const [k, v] of Object.entries(gonderilen)) {
        if (o.alanHatalari[k]) { delete o.uygulanan[k]; continue; }
        o.uygulanan[k] = v;
        for (const [alt] of o.bagliUst) if (!(alt in gonderilen) && ustleri(o, alt).includes(k)) delete o.uygulanan[alt];
      }
      const adim = guncelAdim(o);
      const gorunen = new Set(e.anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar));
      // Koşullu alanlar: doldurunca beliren yeni alanlar aynı adıma; kaybolanlar adımdan çıkar (değerleri senaryoya yazılmaz).
      /** @type {string[]} */
      const yeniler = [];
      for (const a of e.anlik.alanlar.filter(doldurulabilir)) {
        if (!o.alanlar.has(a.anahtar)) { alanEkle(o, a, adim, true); yeniler.push(a.anahtar); }
      }
      const yeni = yeniler.length;
      adim.alanlar = adim.alanlar.filter((/** @type {Nesne} */ a) => a.kosul || gorunen.has(a.anahtar));
      const secimler = Object.fromEntries(adim.alanlar.filter((/** @type {Nesne} */ a) => ['select', 'radio'].includes(String(a.tur)) && typeof o.degerler[a.anahtar]?.deger === 'string'
        && !degerBasvurusu(o.degerler[a.anahtar].deger) && (!zincirIstegi || o.uygulanan[a.anahtar] === o.degerler[a.anahtar].deger))
        .map((/** @type {Nesne} */ a) => [a.anahtar, o.degerler[a.anahtar].deger]));
      // (Yerinde zincir isteğinde yalnız sayfaya uygulanmış seçimler okunur; girilip henüz gönderilmeyenler sayfada yoktur.)
      // Koşullu alan: doldurmada YALNIZ BİR seçim alanı değiştiyse, beliren alan o seçimin bu değerinde görünür sayılır (gözlem; tek
      // değişiklik yoksa koşul yazılmaz — akış kaydının okuma kuralı dener).
      const onceki = adim.okumalar.length ? adim.okumalar[adim.okumalar.length - 1].secimler : {};
      const degisen = Object.keys(secimler).filter((k) => onceki[k] !== secimler[k]);
      // Bağlı listeler: üst seçilince alt listenin seçenekleri geldi mi? (Değeri henüz girilmemiş, sayfada hazır gelmeyen listeler sorulur.)
      // Üstü bu turda doldurulan, değeri boş bağlı listeler de (seçenekleri değişmemiş olsa bile: aynı seçenekler yeniden gelmiş olabilir) sorulur.
      const yuklenen = [...new Set([...secenekleriTazele(o, e.anlik, secimler, degisen), ...(o.sorulacakBagli ?? [])])]
        .filter((k) => !atla && !o.degerler[k] && adim.alanlar.some((/** @type {Nesne} */ a) => a.anahtar === k && kosulAktif(o, a) && !a.hazir && !a.devreDisi && gercekSecenekler(a.secenekler).length));
      o.sorulacakBagli = [];
      if (yeniler.length && degisen.length === 1) {
        adim.kosullar ??= {};
        for (const k of yeniler) adim.kosullar[k] = { secim: degisen[0], degerler: [secimler[degisen[0]]] };
      }
      adim.okumalar.push({ gorunen: [...gorunen], secimler });
      if (Object.keys(o.alanHatalari).length) { veriDuragi(o, 'Bazı alanlar doldurulamadı.'); return; }
      for (const m of e.yeniMetinler ?? []) gorulenEkle(o, m.metin, m.tur);
      // Doldururken sayfa hata gösterdiyse (ör. alandan çıkınca gelen doğrulama uyarısı) sessizce ilerlenmez: kullanıcıya sorulur.
      const sayfaHatalari = (e.yeniMetinler ?? []).filter((/** @type {Nesne} */ m) => m.tur === 'hata').map((/** @type {Nesne} */ m) => m.metin);
      // Yerinde zincir isteği: her durumda aynı veri durağına dönülür (düğmeye basılmaz, eksik sorulmaz); sayfa uyarısı not olur.
      if (zincirIstegi) {
        const ustAd = `“${alanAdi(o, zincirIstegi)}”`;
        const altlar = [...o.bagliUst].filter(([, u]) => u === zincirIstegi).map(([alt]) => alt)
          .filter((k) => adim.alanlar.some((/** @type {Nesne} */ a) => a.anahtar === k && kosulAktif(o, a)));
        const gelen = altlar.filter((k) => gercekSecenekler(o.alanlar.get(k)?.alan.secenekler).length);
        const bos = altlar.filter((k) => !gelen.includes(k));
        const parcalar = [
          gelen.length ? `${ustAd} seçimine göre ${gelen.map((k) => `“${alanAdi(o, k)}”`).join(', ')} seçenekleri geldi; seçin.` : '',
          bos.length ? `${ustAd} seçimine göre ${bos.map((k) => `“${alanAdi(o, k)}”`).join(', ')} için seçenek gelmedi.` : '',
          yeni ? `${yeni} yeni alan belirdi.` : '',
          sayfaHatalari.length ? `Sayfa uyarı gösterdi: ${sayfaHatalari.slice(0, 3).join(' · ')}` : ''
        ].filter(Boolean).join(' ');
        gunluk(o, parcalar || `${ustAd} sayfaya uygulandı.`);
        veriDuragi(o, parcalar || null);
        return;
      }
      if (sayfaHatalari.length) { o.hataSorusu = { metinler: sayfaHatalari, kaynak: 'doldur' }; o.durum = 'hataSorusu'; return; }
      if (yeni) { veriDuragi(o, `${yeni} yeni alan belirdi; değerlerini girin.`); return; }
      if (yuklenen.length) {
        const ustAdlari = [...new Set(yuklenen.map((k) => o.bagliUst.get(k)).filter(Boolean).map((u) => `“${alanAdi(o, /** @type {string} */ (u))}”`))];
        veriDuragi(o, `${ustAdlari.length ? `${ustAdlari.join(', ')} seçimine göre ` : ''}${yuklenen.map((k) => `“${alanAdi(o, k)}”`).join(', ')} seçenekleri geldi; seçin.`);
        return;
      }
      // "Bağlı alanları atla": değeri boş bağlı listeler eksik sayılmaz (kullanıcının kararı; sayfa uyarırsa basıştan sonra görülür).
      const eksik = eksikAlanlar(adim.alanlar.filter((/** @type {Nesne} */ x) => kosulAktif(o, x) && !bagliBekliyor(x) && !(atla && x.bagli)), Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger])));
      if (eksik.length) { veriDuragi(o, `${eksik.length} zorunlu alan boş.`); return; }
      verilerTamam(o);
      return;
    }
    if (e.olay === 'basildi') {
      const f = e.fark;
      o.sonKesif = Array.isArray(e.kesifler) ? e.kesifler : [];
      o.basisNo++;
      const adim = guncelAdim(o);
      // Basıştan ÖNCE görünen metinler (sahte başarıyı önler: basıştan önce de görünen metin "Bitti" önerilmez).
      for (const m of o.sonAnlik?.metinler ?? []) o.onceGorunenler.add(m.metin);
      adim.bas = { ...o.basiliyor };
      // Basışta açılan tarayıcı penceresi: verilen yanıt (onay / soru penceresinin son yanıtı; yalnız bilgi penceresi açıldıysa "kabul")
      // modele aksiyonun "diyalog"u olarak yazılır; doğrulama ve normal koşu aynı yanıtı verir.
      const pencereler = Array.isArray(f.diyaloglar) ? f.diyaloglar : [];
      if (pencereler.length) {
        const soru = [...pencereler].reverse().find((/** @type {Nesne} */ x) => x.tur === 'confirm' || x.tur === 'prompt');
        adim.bas.diyalog = soru ? soru.yanit : 'kabul';
        for (const x of pencereler) gunluk(o, `Sayfa ${x.tur === 'alert' ? 'bilgi' : x.tur === 'prompt' ? 'soru' : 'onay'} penceresi açtı: “${x.mesaj}” → ${x.tur === 'alert' ? 'Tamam' : x.yanit === 'kabul' ? 'Tamam (onaylandı)' : 'İptal'}.`);
      }
      if (f.gonderim) o.gonderimVar = true;
      adim.fark = { ...f, anlik: undefined };
      o.basiliyor = null;
      o.sonFark = f;
      o.sonAnlik = f.anlik;
      o.sonGoruntu = f.anlik.goruntu ?? null;
      for (const m of f.beklemeMetinleri ?? []) gorulenEkle(o, m, 'bekleme');
      // Yeni beliren alanların etiketleri (ör. "D.TARİHİ") sonuç metni değildir: bitiş çiplerine girmez.
      for (const m of f.yeniMetinler ?? []) if (!alanEtiketiMi(o, m.metin, f.anlik?.alanlar)) gorulenEkle(o, m.metin, m.tur, m.sonuc === true);
      gunluk(o, `“${adim.bas.metin ?? adim.bas.secici}” basıldı (${Math.round(f.sureMs / 100) / 10} sn): ${f.yeniMetinler.length} yeni metin, ${f.yeniAlanlar.length} yeni alan${f.adres ? `, adres ${f.adres.sonra}` : ''}${f.tiklamaNotu ? ` (${f.tiklamaNotu})` : ''}.`);
      const hatalar = f.yeniMetinler.filter((/** @type {Nesne} */ m) => m.tur === 'hata').map((/** @type {Nesne} */ m) => m.metin);
      if (hatalar.length) { o.hataSorusu = { metinler: hatalar, kaynak: 'bas' }; o.durum = 'hataSorusu'; return; }
      basistanSonra(o);
      return;
    }
    if (e.olay === 'secildi') {
      const d = { secici: String(e.oge.secici), metin: metin(e.oge.metin, 120) };
      gunluk(o, `Sayfada seçildi: “${d.metin ?? d.secici}”.`);
      o.secilenDugme = d;
      if (basmaKarari({ izin: o.izin, adaySayisi: 1, kullaniciSecti: true }) === 'sor') { o.onayBekleyen = d; o.durum = 'onay'; }
      else basmayaBasla(o, d);
      return;
    }
    if (e.olay === 'secimIptal') { o.durum = 'karar'; return; }
    // Sayfayı yeniden okuma (seçimden vazgeçince de gönderilir): adaylar tazelenir.
    if (e.olay === 'okundu') {
      o.sonAnlik = e.anlik; o.sonGoruntu = e.anlik.goruntu ?? o.sonGoruntu;
      secenekleriTazele(o, e.anlik);
      if (o.okumaAmaci === 'bitis') {
        // Bitiş koşulu adımı: ekranda o an görünen yeni metinler (mesajlar) görülenlere eklenir.
        const onceki = new Set(o.gorulenler.map((/** @type {Nesne} */ x) => x.metin));
        // Yalnız son basıştan SONRA beliren, alan etiketi olmayan metinler (menü / başlık / altbilgi / alan etiketleri basıştan önce de vardı).
        const bilinen = new Set([...(o.basOncesiMetinler ?? []), ...(o.kesifAnlik?.metinler ?? []).map((/** @type {Nesne} */ m) => m.metin)]);
        for (const m of e.anlik.metinler) if (!bilinen.has(m.metin) && !alanEtiketiMi(o, m.metin, e.anlik.alanlar)) gorulenEkle(o, m.metin, m.tur, m.sonuc === true);
        const yeni = o.gorulenler.filter((/** @type {Nesne} */ x) => !onceki.has(x.metin));
        for (const x of yeni) if (x.tur === 'hata' && !(x.metin in o.etiketler)) o.etiketler[x.metin] = 'hata';
        gunluk(o, `Sayfa yeniden tarandı: ${yeni.length} yeni metin.`);
        o.okumaAmaci = null;
        o.durum = 'bitis';
        return;
      }
      // Sayfada henüz sorulmamış (sonradan beliren) doldurulabilir alan varsa veri durağı açılır: "Veriyi düzenle" gerekmez.
      const adim = o.adimlar.length ? guncelAdim(o) : null;
      const yeniler = adim ? e.anlik.alanlar.filter((/** @type {Nesne} */ a) => doldurulabilir(a) && !o.alanlar.has(a.anahtar)) : [];
      for (const a of yeniler) alanEkle(o, a, adim, true);
      if (yeniler.length) veriDuragi(o, `${yeniler.length} yeni alan belirdi; değerlerini girin.`);
      else if (o.okumaAmaci === 'duzelt' && adim?.alanlar.length) veriDuragi(o);
      else o.durum = 'karar';
      o.okumaAmaci = null;
      return;
    }
    if (e.olay === 'dogrulandi') {
      o.dogrulama = { durum: e.sonuc, mesaj: String(e.mesaj ?? ''), gorulen: Array.isArray(e.gorulen) ? e.gorulen.slice(0, 20) : [] };
      dogrulamaAdimlariniKapat(o, e.sonuc === 'basarili');
      gunluk(o, `Doğrulama koşusu: ${e.sonuc === 'basarili' ? 'başarılı' : 'başarısız'} — ${o.dogrulama.mesaj}`);
      o.durum = 'kaydet';
    }
  }

  /** Metin bir alanın etiketi mi (bilinen ya da o an sayfadaki alanlar)? @param {Nesne} o @param {unknown} m @param {Nesne[]} [sayfadakiler] */
  function alanEtiketiMi(o, m, sayfadakiler = []) {
    const k = katla(String(m ?? '').replace(/[\s*:：]+$/u, ''));
    if (!k) return false;
    const esit = (/** @type {unknown} */ e) => typeof e === 'string' && katla(e.replace(/[\s*:：]+$/u, '')) === k;
    return [...o.alanlar.values()].some((x) => esit(x.alan.etiket)) || sayfadakiler.some((a) => esit(a.etiket));
  }

  /**
   * Görülen metin (bitiş çipleri). sonuc: basıştan sonra beliren sonuç nitelikli metin (başarı kalıbı / kutusu, durum bölgesi, bildirim,
   * başlık, bilgi penceresi); onceGorundu: metin bir basıştan ÖNCE de sayfada görünüyordu (keşif ya da önceki okumalar) — "Bitti" önerilmez.
   * @param {Nesne} o @param {unknown} m @param {string} tur @param {boolean} [sonuc]
   */
  function gorulenEkle(o, m, tur, sonuc = false) {
    const t = metin(m, 200);
    if (!t) return;
    const onceGorundu = o.onceGorunenler?.has(t) === true;
    const var_ = o.gorulenler.find((/** @type {Nesne} */ g) => g.metin === t);
    if (var_) {
      var_.basis = o.basisNo;
      if (tur === 'hata' || tur === 'bekleme') var_.tur = tur;
      var_.sonuc = sonuc;
      var_.onceGorundu = var_.onceGorundu === true || onceGorundu;
      return;
    }
    if (o.gorulenler.length >= 60) return;
    o.gorulenler.push({ metin: t, tur: tur === 'bekleme' || beklemeMetniMi(t) ? 'bekleme' : tur, basis: o.basisNo, sonuc, onceGorundu });
  }

  // ---- Görünüm ----
  /** @param {Nesne} o */
  function gorunum(o) {
    const d = tarama().isler.get(o.isId);
    const is = d ? tarama().durum(o.isId) : null;
    /** "Müşteri tipi: Kurumsal" biçiminde koşul metni (seçim alanının görünen etiketi + değerlerin görünen metni). */
    const kosulMetni = (/** @type {Nesne} */ o2, /** @type {{ secim: string; degerler: string[] }} */ kz) => {
      const kontrol = o2.alanlar.get(kz.secim)?.alan;
      const liste = kontrol ? (kontrol.tur === 'radio' ? (kontrol.radyolar ?? []) : (kontrol.secenekler ?? [])) : [];
      const ad = (/** @type {string} */ d) => (kontrol?.tur === 'checkbox' ? (d === 'true' ? 'işaretli' : 'işaretsiz') : (liste.find((/** @type {Nesne} */ x) => String(x.deger) === d)?.metin ?? d));
      return `${kontrol?.etiket ?? kz.secim}: ${kz.degerler.map(ad).join(' / ')}`;
    };
    const alanGorunumu = (/** @type {Nesne} */ a) => {
      const v = o.degerler[a.anahtar];
      return {
        // Etiket yalnız sayfada GÖRÜNEN addır; teknik ad (name / id) etiket olmaz (yalnız ipucu olarak teknikAd).
        anahtar: a.anahtar, etiket: a.etiket ?? adsizEtiket(a), etiketBulundu: Boolean(a.etiket), teknikAd: a.ad ?? a.kimlik ?? null, tur: a.tur, zorunlu: a.zorunlu === true,
        hazir: a.hazir === true, mevcut: gizliAlan(a) ? null : a.mevcut ?? null,
        // Açılır listede yer tutucu ("SEÇİNİZ", ilk seçenek ""/"0"/"-1") seçilebilir bir değer değildir: veri durağında listelenmez.
        secenekler: a.tur === 'radio' ? (a.radyolar ?? []).map((/** @type {Nesne} */ r) => ({ deger: r.deger, metin: r.metin ?? r.deger }))
          : Array.isArray(a.secenekler) ? a.secenekler.filter((/** @type {Nesne} */ x, /** @type {number} */ i) => !yerTutucuSecenekMi(x.metin, x.deger, i === 0)) : null,
        yeni: o.alanlar.get(a.anahtar)?.yeni === true, hata: o.alanHatalari?.[a.anahtar] ?? null,
        // Seçim keşfi: alan bir seçimin belirli değerinde görünüyorsa koşul (görünen metinle) ve seçim alanlarının ilk değeri.
        kosul: a.kosul ? { secim: a.kosul.secim, degerler: a.kosul.degerler, metin: kosulMetni(o, a.kosul), ilk: o.kesifIlk?.[a.kosul.secim] ?? null } : null, ilk: o.kesifIlk?.[a.anahtar] ?? null,
        // Bağlı liste: seçenekleri üst listenin seçimine göre gelir; bekliyor: henüz seçenek yok (üst seçilip "Devam et" denince gelir).
        // getirildi: gösterilen seçenekler üstün şu anki değerine göre sayfadan geldi (yerinde "↓ … seçeneklerini getir" gerekmez);
        // bos: üstün şu anki değeri sayfaya uygulandı ama liste seçeneksiz kaldı.
        bagli: a.bagli ? {
          ust: a.bagli.ust, ustEtiket: alanAdi(o, a.bagli.ust), bekliyor: bagliBekliyor(a), getirildi: bagliGetirildi(o, a),
          bos: bagliBekliyor(a) && Boolean(o.degerler[a.bagli.ust]) && o.uygulanan[a.bagli.ust] === o.degerler[a.bagli.ust]?.deger
        } : null,
        deger: v ? (gizliAlan(a) && v.kaynak === 'elle' ? '••••••' : v.deger) : null, kaynak: v?.kaynak ?? null, gizli: gizliAlan(a)
      };
    };
    const adimlar = o.adimlar.map((/** @type {Nesne} */ a, i) => ({
      no: i + 1, alanlar: a.alanlar.map(alanGorunumu), bas: a.bas ?? null,
      fark: a.fark ? {
        sureMs: a.fark.sureMs, zamanAsimi: a.fark.zamanAsimi, beklemeMetinleri: a.fark.beklemeMetinleri, yeniMetinler: a.fark.yeniMetinler,
        yeniAlanlar: a.fark.yeniAlanlar.map((/** @type {Nesne} */ x) => x.etiket ?? x.anahtar), yeniDugmeler: a.fark.yeniDugmeler.map((/** @type {Nesne} */ x) => x.metin ?? x.secici),
        adres: a.fark.adres, tiklamaNotu: a.fark.tiklamaNotu ?? null, diyaloglar: Array.isArray(a.fark.diyaloglar) ? a.fark.diyaloglar : []
      } : null
    }));
    const adim = o.adimlar.length ? guncelAdim(o) : null;
    // Yazısız düğmeler (simge / görsel: ok, takvim simgesi…) listeyi doldurur; yazılı düğme varsa yalnız onlar gösterilir.
    const yazili = (o.sonAnlik?.dugmeler ?? []).filter((/** @type {Nesne} */ x) => x.metin);
    const adaylar = (yazili.length ? yazili : (o.sonAnlik?.dugmeler ?? [])).map((/** @type {Nesne} */ x) => ({ secici: x.secici, metin: x.metin, kayitOlusturabilir: x.kayitOlusturabilir, enOlasi: x.enOlasi, guven: x.guven }));
    /** @type {Nesne | null} */
    let soru = null;
    if (o.durum === 'veri' && adim) soru = { tur: 'veri', adim: o.adimlar.length, alanlar: adim.alanlar.map(alanGorunumu), not: o.soruNotu ?? null, getiriliyor: null };
    // Yerinde zincir isteği sürerken aynı veri durağı gösterilir (kart yerinde kalır; düğme "getiriliyor" durumunda).
    else if (o.durum === 'zincir' && adim) soru = { tur: 'veri', adim: o.adimlar.length, alanlar: adim.alanlar.map(alanGorunumu), not: null, getiriliyor: o.zincirIstegi ?? null };
    else if (o.durum === 'karar') {
      // Öneri: son basışta beliren düğme (zincirin devamı), yoksa cümlenin adını verdiği / tek aday, yoksa en olası aday.
      const yeniDugme = (o.sonFark?.yeniDugmeler ?? []).find((/** @type {Nesne} */ d) => adaylar.some((/** @type {Nesne} */ x) => x.secici === d.secici));
      soru = {
        tur: 'karar', adaylar, bitirilebilir: o.basisNo > 0,
        oneri: yeniDugme?.secici ?? tekAday(adaylar, o.cumle.dugmeler)?.secici ?? adaylar.find((/** @type {Nesne} */ x) => x.enOlasi)?.secici ?? null
      };
    }
    else if (o.durum === 'onay') soru = { tur: 'onay', dugme: o.onayBekleyen };
    else if (o.durum === 'diyalog') soru = { tur: 'diyalog', diyalogTuru: o.diyalogSorusu?.tur ?? 'confirm', mesaj: o.diyalogSorusu?.mesaj ?? '', dugme: o.diyalogSorusu?.dugme ?? null };
    else if (o.durum === 'hataSorusu') soru = { tur: 'hata', metinler: o.hataSorusu?.metinler ?? [] };
    else if (o.durum === 'secim') soru = { tur: 'secim' };
    else if (o.durum === 'hayirSecim') {
      soru = { tur: 'hayirSecim', adaylar, mesajlar: adayMesajlari(o.sonAnlik?.eylem ?? null, o.cumle.mesajlar), oneri: tekAday(adaylar, o.cumle.dugmeler)?.secici ?? adaylar.find((/** @type {Nesne} */ x) => x.enOlasi)?.secici ?? null };
    } else if (o.durum === 'bitis') {
      // gonderimVar: herhangi bir basışta yazma isteği / sayfa değişimi oldu mu (yoksa "Bitti" için uyarı; arayüz etiket değişince yeniden hesaplar).
      soru = {
        tur: 'bitis', gorulenler: o.gorulenler, etiketler: o.etiketler, adres: o.adresBitti, onerilenAdres: o.sonFark?.adres?.sonra ?? null, olumsuz: o.olumsuz,
        gonderimVar: o.izin === 'hayir' || o.gonderimVar === true, uyarilar: bitisUyarilari({ izin: o.izin, gonderimVar: o.gonderimVar === true, gorulenler: o.gorulenler, etiketler: o.etiketler })
      };
    } else if (o.durum === 'kaydet') {
      soru = {
        tur: 'kaydet', ozet: ozet(o), dogrulama: o.dogrulama, dogrulanabilir: o.izin !== 'hayir', baslik: o.senaryoBasligi, farklar: o.farklar ?? null,
        uyarilar: o.olumsuz ? [] : bitisUyarilari({ izin: o.izin, gonderimVar: o.gonderimVar === true, gorulenler: o.gorulenler, etiketler: o.etiketler }),
        // Düzenleme kipi: mevcut ekranın test verisi tablolarıyla birleştirme kararı özet sekmesinde istenir (önceden haber verilir).
        tabloKarariGerekebilir: Boolean(o.ekran.id)
      };
    }
    else if (o.durum === 'kaydedildi') soru = { tur: 'kaydedildi', ...o.kayit };
    return {
      uyari: o.sayfaUyarisi ?? null, id: o.id, durum: o.durum, izin: o.izin, izinAdi: IZIN_ADLARI[/** @type {'evet' | 'sor' | 'hayir'} */ (o.izin)], projeId: o.projeId, ortam: o.ortam, hedef: o.hedefYol,
      ekran: o.ekran, cumle: o.cumle, duzenleme: Boolean(o.ekran.id), durak: durakNo(o), calisiyor: o.calisiyor, sonHata: o.sonHata, hata: o.hata,
      kesif: o.kesifAnlik ? {
        alanSayisi: o.kesifAnlik.alanlar.length, dugmeAdaylari: o.kesifAnlik.dugmeler.map((/** @type {Nesne} */ x) => x.metin ?? x.secici).slice(0, 8),
        mesajAdaylari: adayMesajlari(o.kesifAnlik.eylem, o.cumle.mesajlar).slice(0, 8), notlar: o.kesifAnlik.eylem?.notlar ?? []
      } : null,
      adimlar, soru, goruntu: o.sonGoruntu, gunluk: o.gunluk.slice(-20), dogrulamaAdimlari: o.dogrulamaAdimlari ?? null,
      bulgular: o.bulgular, zincir: o.bagliUst.size ? zincirMetni([...o.bagliUst].map(([alt, ust]) => ({ ust, alt })), (k) => alanAdi(o, k)) : [],
      is: is ? { durum: is.durum, adimlar: is.adimlar, hata: is.hata, kodIstegi: is.kodIstegi } : null
    };
  }
  /** Şeritteki durak (1 Başlat … 6 Kaydet). @param {Nesne} o */
  function durakNo(o) {
    if (o.durum === 'kesif') return 2;
    if (o.durum === 'veri' || o.durum === 'zincir') return 3;
    if (['karar', 'onay', 'diyalog', 'hataSorusu', 'secim', 'calisiyor', 'hayirSecim'].includes(o.durum)) return 4;
    if (o.durum === 'bitis') return 5;
    return ['kaydet', 'dogrulama', 'kaydedildi'].includes(o.durum) ? 6 : 1;
  }
  /** Kaydedilecekler (özet). @param {Nesne} o */
  function ozet(o) {
    return {
      adimlar: o.adimlar.map((/** @type {Nesne} */ a) => ({ alanSayisi: a.alanlar.filter((/** @type {Nesne} */ x) => o.degerler[x.anahtar]).length, bas: a.bas?.metin ?? a.bas?.secici ?? null })),
      bitis: o.bitis ? { bitti: o.bitis.bitti, hata: o.bitis.hata, devam: o.bitis.devam, adres: o.bitis.adres } : null,
      olumsuz: o.bitis?.olumsuz ?? null, izin: IZIN_ADLARI[/** @type {'evet' | 'sor' | 'hayir'} */ (o.izin)], ekranAdi: o.ekran.ad
    };
  }

  // ---- Uçların işleri ----
  /** @param {Veritabani} vt @param {string} projeId @param {string | null} ekranId */
  function secenekler(vt, projeId, ekranId) {
    temizle();
    const ortamlar = ortamlariListele(vt, projeId).map((x) => ({
      id: x.id, ad: x.ad, varsayilan: x.varsayilan, canli: riskliOrtamMi(x), tarif: Boolean(etkinGirisTarifi(vt, projeId, x.id).tarif)
    }));
    /** @type {Nesne | null} */
    let ekran = null;
    if (ekranId) {
      const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
      if (!e) throw new DepoHatasi('Ekran bulunamadı.');
      const m = ekranModeliGetir(vt, e.id);
      ekran = { id: e.id, ad: e.ad, urlYolu: m && nesneMi(m.model) && typeof m.model.ekranUrl === 'string' ? m.model.ekranUrl : null };
    }
    const suren = [...oturumlar.values()].find((x) => x.projeId === projeId && !['kaydedildi', 'iptal', 'hata'].includes(x.durum));
    return {
      ortamlar, ekran, surenOturum: suren ? { id: suren.id, ekranAdi: suren.ekran.ad } : null,
      // CANLI ortamda bir kez sorulan onayın metni (izne göre; tek kaynak: akis.mjs).
      canliOnayMetinleri: Object.fromEntries(IZINLER.map((i) => [i, canliOnayMetni(i)]))
    };
  }

  /** @param {Veritabani} vt @param {Nesne} g @param {{ sunucuAdresi: string }} baglam */
  function baslat(vt, g, baglam) {
    temizle();
    const projeId = kimlikAl(g.projeId, 'projeId');
    const proje = projeGetir(vt, projeId);
    if (!proje) throw new DepoHatasi('Proje bulunamadı.');
    const ortamId = kimlikAl(g.ortamId, 'ortamId');
    const ortam = ortamlariListele(vt, projeId).find((x) => x.id === ortamId);
    if (!ortam) throw new DepoHatasi('Ortam bulunamadı.');
    const izin = String(g.izin);
    if (!IZINLER.includes(izin)) throw new HizliTestHatasi('IZIN', 'Nöbetçi’nin düğmelere basıp basamayacağını seçin (Evet / Bana sor / Hayır).');
    const hedefHam = metin(g.hedef, 2000);
    if (!hedefHam) throw new HizliTestHatasi('HEDEF', 'Sayfa adresini yazın (ör. /basvuru).');
    // Tam adres yazıldıysa taban ve yol ayrılır; kayıtsız başka site sorulmadan (onaysız) hiçbir istek atılmaz.
    // Diğer adres hataları taramanın kendi denetiminde (aynı mesajla) verilir.
    let hedef = hedefHam;
    /** @type {string | null} */
    let hedefKoken = null;
    try {
      const c = hedefCoz(ortam.tabanUrl, hedefHam, ekKokenleri(ortam));
      hedefKoken = c.koken ?? null;
      if (/^[a-z][a-z0-9+.-]*:/i.test(hedefHam) || hedefKoken) hedef = c.yol;
    } catch (e) {
      if (e instanceof HedefHatasi && e.bilinmeyenKoken) throw new HizliTestHatasi('TABAN_KAYITLI_DEGIL', e.message, 409, { koken: e.bilinmeyenKoken });
      if (!(e instanceof HedefHatasi)) throw e;
    }
    /** @type {{ id: string | null; ad: string; anahtar: string }} */
    let ekran;
    if (g.ekranId) {
      const e = ekranlariListele(vt, projeId).find((x) => x.id === kimlikAl(g.ekranId, 'ekranId'));
      if (!e) throw new DepoHatasi('Ekran bulunamadı.');
      const m = ekranModeliGetir(vt, e.id);
      if (m && nesneMi(m.model) && (m.model.tur === 'altModel' || m.model.tur === 'ortakAkis')) throw new HizliTestHatasi('EKRAN_TURU', 'Alt model ve genel senaryo hızlı testle düzenlenmez.');
      ekran = { id: e.id, ad: e.ad, anahtar: e.anahtar };
    } else {
      const ad = metin(g.ekranAdi, 120);
      if (!ad) throw new HizliTestHatasi('EKRAN_ADI', 'Testin (ekranın) adını yazın.');
      const anahtar = ekranAnahtariOner(ad);
      const ayni = ekranlariListele(vt, projeId).find((x) => x.anahtar === anahtar);
      ekran = ayni ? { id: ekranModeliGetir(vt, ayni.id) ? ayni.id : null, ad: ayni.ad, anahtar } : { id: null, ad, anahtar };
    }
    // İzinler ve CANLI onayı: taramayla AYNI denetim (tarayıcı açılmadan). CANLI'da kilit yok; onay bir kez istenir.
    const govde = { kip: 'hizliTest', projeId, ortamId, hedef: hedefKoken ? `${hedefKoken}${hedef}` : hedef, izin, onay: true, girissiz: g.girissiz === true, baglamProfilleri: [], ...(g.canliOnay === true ? { canliOnay: true } : {}) };
    if (riskliOrtamMi(ortam) && g.canliOnay !== true) {
      throw new HizliTestHatasi('CANLI_ONAY_GEREKLI', canliOnayMetni(izin), 409, { ortamAdi: ortam.ad });
    }
    ucDenetle(vt, '/platform/tarama/baslat', govde);
    const { isId } = tarama().baslat(vt, { ...govde, ...(ekran.id ? { ekranId: ekran.id } : { ekranAdi: ekran.ad }) }, baglam);
    const id = randomBytes(12).toString('hex');
    /** @type {Nesne} */
    const o = {
      id, isId, projeId, projeAdi: proje.ad, ortam: { id: ortam.id, ad: ortam.ad, canli: riskliOrtamMi(ortam) }, hedefYol: hedef, ekran, izin,
      girissiz: g.girissiz === true, cumle: cumleyiOku(g.cumle), cumleMetni: metin(g.cumle, 1000),
      durum: 'kesif', baslangic: simdi(), sonErisim: simdi(), komutNo: 0, bekleyen: null, calisiyor: 'Sayfa açılıyor ve keşfediliyor… (hiçbir düğmeye basılmaz)',
      adimlar: [], alanlar: new Map(), degerler: {}, tabloSecimleri: {}, alanHatalari: {}, gorulenler: [], etiketler: {}, adresBitti: null, olumsuz: null,
      // Bağlı listeler: alt → üst; tablolar için seçenek gözlemleri; zincir keşfinin bulguları (kullanıcıya gösterilen cümleler).
      bagliUst: new Map(), gozlemler: [], bulgular: [],
      // Sayfaya uygulanan değerler (anahtar → değer), son doldurmada gönderilenler; yerinde zincir isteği (üst anahtarı) ve atlama.
      uygulanan: {}, sonGonderilen: {}, zincirIstegi: null, zincirAtla: false,
      // Bağlı listelerin dolma süreleri (ms; keşif ve doldurma ölçümleri): anahtar → ölçümler. Modele "olağan yüklenme süresi" olur.
      yuklenme: {},
      basisNo: 0, onceGorunenler: new Set(), gonderimVar: false, diyalogSorusu: null, sonAnlik: null, kesifAnlik: null, sonFark: null, sonGoruntu: null, gunluk: [], dogrulama: null, bitis: null, hata: null, sonHata: null,
      senaryoBasligi: hizliSenaryoBasligi(String(ekran.ad)), baslik: ''
    };
    oturumlar.set(id, o);
    tarama().hizliDinle(isId, (e) => olayIsle(o, e));
    gunluk(o, `Başlatıldı: ${ortam.ad} ortamı, izin “${IZIN_ADLARI[/** @type {'evet' | 'sor' | 'hayir'} */ (izin)]}”${o.cumle.dugmeler.length || o.cumle.mesajlar.length ? `; cümleden: ${[...o.cumle.dugmeler.map((x) => `düğme “${x}”`), ...o.cumle.mesajlar.map((x) => `mesaj “${x}”`)].join(', ')}` : ''}.`);
    return { id };
  }

  /**
   * Veri durağı: kullanıcının girdiği değerler (elle ya da tablodan). Tablo başvuruları tarayıcıya gitmeden önce çözülür (yalnız bellekte).
   * @param {Veritabani} vt @param {Nesne} g
   */
  function veri(vt, g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['veri']);
    const girilen = nesneMi(g.degerler) ? g.degerler : {};
    const adim = guncelAdim(o);
    // Doldurma sırası: kullanıcının verdiği sıra (yukarı / aşağı taşıma); verilmeyenler sonda, sayfa sırasıyla kalır (kararlı sıralama).
    if (Array.isArray(g.sira)) {
      const sira = new Map(g.sira.filter((/** @type {unknown} */ k) => typeof k === 'string').map((/** @type {string} */ k, /** @type {number} */ i) => [k, i]));
      adim.alanlar.sort((/** @type {Nesne} */ x, /** @type {Nesne} */ y) => (sira.get(x.anahtar) ?? 1e6) - (sira.get(y.anahtar) ?? 1e6));
    }
    /** @type {Record<string, Nesne>} */
    const yeni = {};
    for (const a of adim.alanlar) {
      const v = girilen[a.anahtar];
      if (v === undefined) continue;
      if (!nesneMi(v) || v.deger === null || v.deger === '') { yeni[a.anahtar] = null; continue; }
      const kaynak = v.kaynak === 'tablo' ? 'tablo' : 'elle';
      const deger = typeof v.deger === 'boolean' ? v.deger : String(v.deger).slice(0, 2000);
      if (kaynak === 'tablo' && !degerBasvurusu(deger)) throw new HizliTestHatasi('DEGER', `“${a.etiket ?? a.anahtar}”: tablodan gelen değer bir tablo başvurusu olmalı.`);
      // Parolalı alanda "••••••" (maske) gelirse mevcut değer korunur.
      if (gizliAlan(a) && deger === '••••••' && o.degerler[a.anahtar]) { yeni[a.anahtar] = o.degerler[a.anahtar]; continue; }
      yeni[a.anahtar] = { deger, kaynak };
      if (kaynak === 'tablo' && nesneMi(v.tabloSecimi) && typeof v.tabloSecimi.anahtar === 'string' && nesneMi(v.tabloSecimi.kosul)) {
        o.tabloSecimleri[v.tabloSecimi.anahtar] = Object.fromEntries(Object.entries(v.tabloSecimi.kosul).filter(([, x]) => typeof x === 'string').map(([k, x]) => [String(k).slice(0, 100), String(x).slice(0, 200)]));
      }
    }
    // Bağlı liste: üst listenin değeri değiştiyse alt listelerin (ve onların altlarının) eski değerleri gönderilmez — alt seçenekler
    // yeni üst seçilince gelir ve yeniden sorulur.
    const ustDegisti = Object.keys(yeni).filter((k) => (yeni[k]?.deger ?? null) !== (o.degerler[k]?.deger ?? null));
    for (const [k, v] of Object.entries(yeni)) { if (v) o.degerler[k] = v; else delete o.degerler[k]; }
    for (const a of adim.alanlar) {
      if (a.bagli && ustleri(o, a.anahtar).some((u) => ustDegisti.includes(u)) && o.degerler[a.anahtar] && !ustDegisti.includes(a.anahtar)) delete o.degerler[a.anahtar];
    }
    // Bu turda üstü doldurulan / seçenekleri henüz gelmemiş, değeri boş bağlı listeler: doldurmadan sonra (yeni seçeneklerle) sorulur.
    o.sorulacakBagli = adim.alanlar.filter((/** @type {Nesne} */ a) => a.bagli && !o.degerler[a.anahtar]
      && (bagliBekliyor(a) || ustleri(o, a.anahtar).some((u) => ustDegisti.includes(u)))).map((/** @type {Nesne} */ a) => a.anahtar);
    // Yerinde zincir isteği: üst liste bu adımda olmalı, bağlı altı bulunmalı ve değeri girilmiş olmalı.
    /** @type {{ anahtar: string; altlar: string[] } | null} */
    let zincir = null;
    if (typeof g.zincir === 'string' && g.zincir) {
      const ust = adim.alanlar.find((/** @type {Nesne} */ a) => a.anahtar === g.zincir);
      const altlar = [...o.bagliUst].filter(([alt, u]) => u === g.zincir && adim.alanlar.some((/** @type {Nesne} */ a) => a.anahtar === alt)).map(([alt]) => alt);
      if (!ust || !altlar.length) throw new HizliTestHatasi('ZINCIR', 'Bu alanın bağlı alanı yok.');
      if (!o.degerler[ust.anahtar]) throw new HizliTestHatasi('ZINCIR', `Önce “${alanAdi(o, ust.anahtar)}” seçin.`);
      zincir = { anahtar: ust.anahtar, altlar };
    }
    // Seçenekleri henüz gelmemiş bağlı liste (üstü bu turda seçilecek) eksik sayılmaz: üst doldurulunca sorulur. "Bağlı alanları atla"da
    // değeri boş bağlı listeler de eksik sayılmaz ve yeniden sorulmaz (kullanıcının kararı). Yerinde zincir isteğinde eksik denetlenmez.
    const atla = g.zinciriAtla === true;
    if (atla) o.sorulacakBagli = [];
    if (!zincir) {
      const eksik = eksikAlanlar(adim.alanlar.filter((/** @type {Nesne} */ x) => kosulAktif(o, x) && !bagliBekliyor(x) && !(atla && x.bagli)), Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger])));
      if (eksik.length) {
        throw new HizliTestHatasi('EKSIK', `Zorunlu alanlar boş: ${eksik.slice(0, 5).map((a) => a.etiket ?? a.anahtar).join(', ')}. Değer yazın ya da “Doldur” ile tablodan seçin.`, 400,
          { eksikler: eksik.map((a) => a.anahtar) });
      }
    }
    // Tarayıcıya gidecek değerler: tablo başvuruları bu ortamda çözülür (değer üretilmez; çözülemezse açık hata). Yerinde zincir isteğinde
    // yalnız o üst liste ve sayfaya henüz uygulanmamış üstleri gider (diğer girilen değerler oturumda saklanır, "Devam et"te gider).
    const zincirKumesi = zincir ? new Set([zincir.anahtar, ...ustleri(o, zincir.anahtar)]) : null;
    const gidecek = bagimliSirala(adim.alanlar.filter((/** @type {Nesne} */ a) => o.degerler[a.anahtar] && kosulAktif(o, a)
      && (!zincirKumesi || (zincirKumesi.has(a.anahtar) && (a.anahtar === zincir?.anahtar || o.uygulanan[a.anahtar] !== o.degerler[a.anahtar].deger)))));
    const cozulecek = Object.fromEntries(gidecek.filter((/** @type {Nesne} */ a) => o.degerler[a.anahtar].kaynak === 'tablo').map((/** @type {Nesne} */ a) => [a.anahtar, o.degerler[a.anahtar].deger]));
    /** @type {Record<string, unknown>} */
    let cozulmus = {};
    if (Object.keys(cozulecek).length) {
      const r = ekranBasvurulariniCoz(cozulecek, {
        tablolar: tablolariListele(vt, o.projeId, { cozulsun: true }), ortamId: o.ortam.id, tabloSecimleri: o.tabloSecimleri,
        secenekDegerleri: Object.fromEntries(gidecek.map((/** @type {Nesne} */ a) => [a.anahtar, (a.tur === 'radio' ? (a.radyolar ?? []) : (a.secenekler ?? [])).map((/** @type {Nesne} */ x) => String(x.deger))]))
      });
      if (r.hatalar.length) throw new HizliTestHatasi('TABLO', r.hatalar[0].mesaj.replace(/"([^"]+)" alanının/, (_, k) => `“${o.alanlar.get(k)?.alan.etiket ?? k}” alanının`));
      cozulmus = r.veri;
    }
    // Doğrulama koşusu aynı çözülmüş değerleri kullanır (yalnız bellekte).
    o.cozulmus = { ...(o.cozulmus ?? {}), ...Object.fromEntries(Object.keys(cozulecek).map((k) => [k, String(cozulmus[k] ?? '')])) };
    const alanlar = gidecek.map((/** @type {Nesne} */ a) => ({
      anahtar: a.anahtar, alan: a, deger: o.degerler[a.anahtar].kaynak === 'tablo' ? /** @type {string} */ (String(cozulmus[a.anahtar] ?? '')) : o.degerler[a.anahtar].deger
    }));
    o.alanHatalari = {};
    o.sonGonderilen = Object.fromEntries(gidecek.map((/** @type {Nesne} */ a) => [a.anahtar, o.degerler[a.anahtar].deger]));
    o.zincirAtla = atla;
    if (zincir) {
      o.zincirIstegi = zincir.anahtar;
      o.durum = 'zincir';
      o.calisiyor = `${zincir.altlar.map((k) => `“${alanAdi(o, k)}”`).join(', ')} seçenekleri getiriliyor…`;
    } else {
      o.zincirIstegi = null;
      o.durum = 'calisiyor';
      o.calisiyor = 'Alanlar dolduruluyor…';
    }
    gonder(o, { tur: 'doldur', alanlar });
    return { gonderildi: true };
  }

  /** "Şimdi ne yapayım?" ve Hayır izninin seçimi. @param {Nesne} g */
  function karar(g) {
    const o = oturumGetir(String(g.id ?? ''));
    const k = String(g.karar ?? '');
    if (o.izin === 'hayir') {
      durumda(o, ['hayirSecim']);
      if (k === 'duzelt') { veriDuragi(o); return { tamam: true }; }
      if (k !== 'bitir') throw new HizliTestHatasi('KARAR', 'Hayır izninde düğmeye basılmaz: düğmeyi ve mesajı seçip “Burada bitir” deyin.');
      const adaylar = o.sonAnlik?.dugmeler ?? [];
      const dugme = adaylar.find((/** @type {Nesne} */ x) => x.secici === g.dugme);
      if (!dugme) throw new HizliTestHatasi('DUGME', 'Formu gönderen düğmeyi adaylardan seçin.');
      const mesajlar = (Array.isArray(g.mesajlar) ? g.mesajlar : []).map((x) => metin(x, 200)).filter(Boolean);
      const adayMetinleri = adayMesajlari(o.sonAnlik?.eylem ?? null, o.cumle.mesajlar);
      // Mesajlar adaylardan seçilir (uydurulmaz): adaylar + cümledeki tırnaklı mesajlar.
      const secilen = adayMetinleri.filter((x) => mesajlar.includes(x.metin));
      if (!secilen.length) throw new HizliTestHatasi('MESAJ', 'Başarıyı gösteren mesajı adaylardan seçin.');
      guncelAdim(o).bas = { secici: dugme.secici, metin: dugme.metin };
      for (const x of adayMetinleri) o.gorulenler.push({ metin: x.metin, tur: x.tur === 'basari' ? 'basari' : x.tur, basis: secilen.includes(x) ? 1 : 0 });
      o.basisNo = 1;
      o.etiketler = Object.fromEntries(adayMetinleri.map((x) => [x.metin, secilen.includes(x) ? 'bitti' : x.tur === 'hata' ? 'hata' : x.tur === 'bekleme' ? 'devam' : null]));
      o.durum = 'bitis';
      return { tamam: true };
    }
    // Sayfada seçmekten vazgeç: şerit kapanır, sayfa yeniden okunur (motor seçimi iptal edip okur).
    if (k === 'vazgec') {
      durumda(o, ['secim']);
      o.durum = 'calisiyor';
      o.calisiyor = 'Seçim kapatılıyor…';
      gonder(o, { tur: 'oku' });
      return { tamam: true };
    }
    durumda(o, ['karar']);
    if (k === 'bitir') {
      if (o.basisNo === 0) throw new HizliTestHatasi('KARAR', 'Önce bir düğmeye basın: test en az bir basış içermeli.');
      o.etiketler = varsayilanEtiketler(o.gorulenler, o.basisNo);
      for (const m of o.cumle.mesajlar) for (const g2 of o.gorulenler) if (katla(g2.metin).includes(katla(m))) o.etiketler[g2.metin] = 'bitti';
      for (const [m, c] of Object.entries(o.hataCevaplari ?? {})) if (c === 'hata' && m in o.etiketler) o.etiketler[m] = 'hata';
      // Geri dönülüp zincire devam edildiyse daha önce verilen etiketler korunur (görülen metinlerde).
      for (const [m, e] of Object.entries(o.saklananEtiketler ?? {})) if (m in o.etiketler) o.etiketler[m] = e;
      o.adresBitti = null;
      o.durum = 'bitis';
      return { tamam: true };
    }
    if (k === 'duzelt') {
      // Önce sayfa yeniden okunur: sonradan beliren alanlar da veri durağında görünür.
      o.okumaAmaci = 'duzelt';
      o.durum = 'calisiyor';
      o.calisiyor = 'Sayfa okunuyor…';
      gonder(o, { tur: 'oku' });
      return { tamam: true };
    }
    if (k === 'baska') {
      o.durum = 'secim';
      gonder(o, { tur: 'secimAc' });
      return { tamam: true };
    }
    if (k === 'bas') {
      const aday = (o.sonAnlik?.dugmeler ?? []).find((/** @type {Nesne} */ x) => x.secici === g.secici);
      if (!aday) throw new HizliTestHatasi('DUGME', 'Basılacak düğmeyi adaylardan seçin (listede yoksa “Başka bir düğmeye bas…”).');
      const d = { secici: aday.secici, metin: aday.metin };
      if (basmaKarari({ izin: o.izin, adaySayisi: 1, kullaniciSecti: true }) === 'sor') { o.onayBekleyen = { ...d, kayitOlusturabilir: aday.kayitOlusturabilir }; o.durum = 'onay'; }
      else basmayaBasla(o, d);
      return { tamam: true };
    }
    throw new HizliTestHatasi('KARAR', 'Bilinmeyen seçim.');
  }

  /**
   * Bana sor: basış sırasında açılan onay / soru penceresine yanıt (kabul: Tamam, iptal: İptal). Basış komutu sürer; yanıt alt sürece ayrı
   * komutla gider (bekleyen basış değişmez). @param {Nesne} g
   */
  function diyalogCevabi(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['diyalog']);
    const yanit = g.cevap === 'kabul' ? 'kabul' : g.cevap === 'iptal' ? 'iptal' : null;
    if (!yanit) throw new HizliTestHatasi('DIYALOG', 'Pencereye yanıt seçin (Tamam / İptal).');
    const soru = o.diyalogSorusu;
    o.diyalogSorusu = null;
    o.durum = 'calisiyor';
    o.calisiyor = `Pencereye “${yanit === 'kabul' ? 'Tamam' : 'İptal'}” denildi; sayfa izleniyor…`;
    tarama().komutGonder(o.isId, /** @type {any} */ ({ no: ++o.komutNo, tur: 'diyalogYaniti', yanit }));
    gunluk(o, `Pencere (“${soru?.mesaj ?? ''}”): ${yanit === 'kabul' ? 'Tamam' : 'İptal'} seçildi.`);
    return { tamam: true };
  }

  /** Bana sor: "X'e basayım mı?" @param {Nesne} g */
  function onay(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['onay']);
    const d = o.onayBekleyen;
    o.onayBekleyen = null;
    if (g.cevap !== true) { gunluk(o, `“${d.metin ?? d.secici}” basılmadı (onay verilmedi).`); o.durum = 'karar'; return { basildi: false }; }
    basmayaBasla(o, { secici: d.secici, metin: d.metin });
    return { basildi: true };
  }

  /**
   * Bitiş koşulu adımında sayfayı yeniden tarar: o an ekranda görünen (ör. sonradan çıkan hata / başarı) mesajlar görülen
   * metinlere eklenir; verilmiş etiketler korunur. @param {Nesne} g
   */
  function yenidenTara(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['bitis']);
    const gecerli = new Set(o.gorulenler.map((/** @type {Nesne} */ x) => x.metin));
    for (const [m, e] of Object.entries(nesneMi(g.etiketler) ? g.etiketler : {})) {
      if (gecerli.has(m)) o.etiketler[m] = ['bitti', 'devam', 'hata'].includes(String(e)) ? String(e) : null;
    }
    o.okumaAmaci = 'bitis';
    o.durum = 'calisiyor';
    o.calisiyor = 'Sayfa yeniden taranıyor…';
    gonder(o, { tur: 'oku' });
    return { tamam: true };
  }

  /** "Bu bir hata mı, beklenen uyarı mı?" @param {Nesne} g */
  function hataCevabi(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['hataSorusu']);
    const c = String(g.cevap ?? '');
    const metinler = o.hataSorusu?.metinler ?? [];
    const dolduranKaynak = o.hataSorusu?.kaynak === 'doldur';
    o.hataCevaplari ??= {};
    for (const m of metinler) o.hataCevaplari[m] = c;
    o.hataSorusu = null;
    if (c === 'hata') {
      // Verileri düzeltip yeniden denenir: aynı adımın veri durağı (basış zincire yazılmaz).
      const adim = guncelAdim(o);
      adim.bas = null;
      adim.fark = null;
      veriDuragi(o, dolduranKaynak ? 'Sayfa hata gösterdi: değerleri düzeltip yeniden doldurun.' : 'Hata göründü: değerleri düzeltin, sonra düğmeye yeniden basın.');
      return { tamam: true };
    }
    if (c === 'uyari') {
      // Olumsuz senaryo: beklenen sonuç bu uyarı. Zincir burada biter.
      o.olumsuz = { mesaj: metinler[0] ?? '' };
      o.etiketler = varsayilanEtiketler(o.gorulenler, o.basisNo);
      for (const m of metinler) o.etiketler[m] = 'hata';
      o.durum = 'bitis';
      return { tamam: true };
    }
    // Doldururken çıkan uyarı önemsiz: veri durağının devamı (henüz basış yok).
    if (dolduranKaynak) {
      const adim = guncelAdim(o);
      const eksik = eksikAlanlar(adim.alanlar.filter((/** @type {Nesne} */ x) => kosulAktif(o, x) && !bagliBekliyor(x)), Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger])));
      if (eksik.length) veriDuragi(o, `${eksik.length} zorunlu alan boş.`); else verilerTamam(o);
      return { tamam: true };
    }
    basistanSonra(o);
    return { tamam: true };
  }

  /**
   * Geri dönüş: "Bitiş koşulu" ↔ "Kaydet" ↔ "Adım adım" arasında. hedef 'karar': zincire devam (bitiş seçimleri saklanır, yeniden
   * "Burada bitir" denince korunur; Hayır izninde düğme / mesaj seçimine dönülür); hedef 'bitis': kaydet ekranından bitiş koşulunu
   * düzenle (etiketler, adres, olumsuz senaryo korunur). Doğrulama sonucu geçersiz olur (bitiş / zincir değişebilir). @param {Nesne} g
   */
  function geri(g) {
    const o = oturumGetir(String(g.id ?? ''));
    const hedef = String(g.hedef ?? '');
    if (hedef === 'bitis') {
      durumda(o, ['kaydet']);
      o.dogrulama = null;
      o.dogrulamaAdimlari = null;
      o.farklar = null;
      o.durum = 'bitis';
      gunluk(o, 'Bitiş koşulu yeniden düzenleniyor.');
      return { tamam: true };
    }
    if (hedef !== 'karar') throw new HizliTestHatasi('GERI', 'Bilinmeyen geri dönüş.');
    durumda(o, ['bitis', 'kaydet']);
    // Verilmiş etiketler saklanır: zincir sürüp yeniden "Burada bitir" denince aynı metinlere aynı etiket verilir.
    o.saklananEtiketler = { ...(o.saklananEtiketler ?? {}), ...o.etiketler };
    o.bitis = null;
    o.dogrulama = null;
    o.dogrulamaAdimlari = null;
    o.farklar = null;
    if (o.izin === 'hayir') {
      // Hayır izninde "bitir" düğme ve mesajı zincire yazmıştı: geri alınır, seçim yeniden yapılır.
      guncelAdim(o).bas = null;
      o.basisNo = 0;
      o.gorulenler = [];
      o.etiketler = {};
      o.durum = 'hayirSecim';
    } else o.durum = 'karar';
    gunluk(o, 'Adım adım zincire dönüldü: kaldığı yerden devam edilebilir.');
    return { tamam: true };
  }

  /** Bitiş koşulu (etiketler). @param {Nesne} g */
  function bitis(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['bitis']);
    const gecerli = new Set(o.gorulenler.map((/** @type {Nesne} */ x) => x.metin));
    /** @type {Record<string, string | null>} */
    const etiketler = {};
    for (const [m, e] of Object.entries(nesneMi(g.etiketler) ? g.etiketler : {})) {
      if (!gecerli.has(m)) continue; // Etiket yalnız görülen metne verilir (uydurulmaz).
      etiketler[m] = ['bitti', 'devam', 'hata'].includes(String(e)) ? String(e) : null;
    }
    const olumsuz = nesneMi(g.olumsuz) && metin(g.olumsuz.mesaj, 200) ? { mesaj: /** @type {string} */ (metin(g.olumsuz.mesaj, 200)) } : null;
    if (olumsuz && !gecerli.has(olumsuz.mesaj)) throw new HizliTestHatasi('BITIS', 'Olumsuz senaryonun beklenen mesajı görülen metinlerden seçilmeli.');
    const b = bitisKosulu({ etiketler, adres: g.adres, olumsuz });
    // Geçersizse oturum değişmez (arayüz kullanıcının seçimlerini korur).
    if (b.hatalar.length) throw new HizliTestHatasi('BITIS', b.hatalar.join(' '));
    o.etiketler = etiketler;
    o.adresBitti = b.adres;
    o.olumsuz = olumsuz;
    o.bitis = b;
    o.dogrulama = o.izin === 'hayir' ? { durum: 'yapilmadi', mesaj: 'Hayır izninde düğmeye basılmadı; test “doğrulanmadı” olarak kaydedilir ve ilk koşuda doğrulanır.', gorulen: [] } : null;
    o.farklar = null;
    o.durum = 'kaydet';
    return { tamam: true };
  }

  /**
   * H3: baştan sona doğrulama koşusu. Plan yalnız DEĞERLİ alanı ya da basışı olan adımlardır (kaydet özetindeki zincirle aynı sayım:
   * "2. adımda …" iletisi kullanıcının gördüğü zincirin 2. satırıdır). Adımların durumu ilerleme olaylarıyla güncellenir.
   * @param {Nesne} g
   */
  function dogrula(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    if (o.izin === 'hayir') throw new HizliTestHatasi('IZIN', 'Hayır izninde doğrulama koşusu yapılmaz (düğmeye basılmaz).');
    const adimlar = o.adimlar.map((/** @type {Nesne} */ a) => ({
      alanlar: bagimliSirala(a.alanlar.filter((/** @type {Nesne} */ x) => o.degerler[x.anahtar] && kosulAktif(o, x))).map((/** @type {Nesne} */ x) => ({ anahtar: x.anahtar, alan: x, deger: o.cozulmus?.[x.anahtar] ?? o.degerler[x.anahtar].deger })),
      bas: a.bas ? { secici: a.bas.secici, metin: a.bas.metin, ...(a.bas.diyalog ? { diyalog: a.bas.diyalog } : {}) } : null
    })).filter((/** @type {Nesne} */ a) => a.alanlar.length || a.bas);
    const bitis = o.bitis.olumsuz
      // Olumsuz senaryo: beklenen hata mesajı "bitti" sayılır.
      ? { bitti: [o.bitis.olumsuz.mesaj], devam: o.bitis.devam, hata: o.bitis.hata.filter((/** @type {string} */ h) => !katla(o.bitis.olumsuz.mesaj).includes(katla(h))), adres: null }
      : { bitti: o.bitis.bitti, devam: o.bitis.devam, hata: o.bitis.hata, adres: o.bitis.adres };
    o.dogrulamaAdimlari = [
      ...adimlar.map((/** @type {Nesne} */ a, /** @type {number} */ i) => ({
        metin: `${i + 1}. ${[a.alanlar.length ? `${a.alanlar.length} alan doldur` : null, a.bas ? `“${a.bas.metin ?? a.bas.secici}” bas` : null].filter(Boolean).join(', sonra ')}`,
        durum: 'bekliyor', ayrinti: null
      })),
      { metin: o.bitis.olumsuz ? `Beklenen uyarı: “${o.bitis.olumsuz.mesaj}”` : 'Bitiş koşulu', durum: 'bekliyor', ayrinti: null }
    ];
    o.dogrulama = null;
    o.durum = 'dogrulama';
    o.calisiyor = 'Doğrulama koşusu: sayfa yeniden açılıyor, zincir baştan uygulanıyor…';
    gonder(o, { tur: 'dogrula', plan: { adimlar, bitis, zamanAsimiSn: BITIS_BEKLEME_SN } });
    return { basladi: true };
  }

  /** Doğrulama bitti: başarılıysa tüm adımlar tamam; değilse süren adım hata (sonrakiler bekliyor kalır). @param {Nesne} o @param {boolean} basarili */
  function dogrulamaAdimlariniKapat(o, basarili) {
    if (!Array.isArray(o.dogrulamaAdimlari)) return;
    if (basarili) { for (const x of o.dogrulamaAdimlari) x.durum = 'tamam'; return; }
    const suren = o.dogrulamaAdimlari.find((/** @type {Nesne} */ x) => x.durum === 'suruyor') ?? o.dogrulamaAdimlari.find((/** @type {Nesne} */ x) => x.durum === 'bekliyor');
    if (suren) suren.durum = 'hata';
  }

  /**
   * Paket (ekran modeli) + senaryo verisi. @param {Veritabani} vt @param {Nesne} o
   */
  function paketKur(vt, o) {
    const tarif = o.girissiz ? null : etkinGirisTarifi(vt, o.projeId, o.ortam.id).tarif;
    const mevcut = o.ekran.id ? ekranModeliGetir(vt, o.ekran.id) : undefined;
    const meta = {
      ekranAnahtari: o.ekran.anahtar, ekranAdi: o.ekran.ad, urlYolu: o.hedefYol.startsWith('/') ? o.hedefYol : `/${o.hedefYol}`, proje: o.projeAdi,
      girisGerekli: Boolean(tarif), girissiz: !tarif, ikiAsamali: tarif ? tarif.ikinciAdim.tur : 'yok', baglamTuru: tarif?.baglamDegistirme?.baglamTuru ?? null,
      mevcutModel: mevcut && nesneMi(mevcut.model) ? mevcut.model : null
    };
    const degerler = Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, v.deger]));
    // Koşullu alanları belirleyen seçim (radyo / liste / onay kutusu) için değer verilmediyse sayfanın İLK değeri (keşifte okunan; değer
    // üretilmez) senaryoya yazılır: hızlı test koşulları bu değerle değerlendirdi, normal koşu da aynı değerle değerlendirir.
    const kontroller = new Set(o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar).map((/** @type {Nesne} */ a) => a.kosul?.secim).filter(Boolean));
    for (const k of kontroller) {
      const ilk = o.kesifIlk?.[k];
      if (degerler[k] === undefined && ilk !== null && ilk !== undefined && ilk !== '') degerler[k] = ilk;
    }
    const envanter = kayitEnvanteriKur({ adimlar: o.adimlar.map((/** @type {Nesne} */ x) => ({ ...x, alanlar: bagimliSirala(x.alanlar) })), degerler, yol: o.hedefYol.startsWith('/') ? o.hedefYol : `/${o.hedefYol}`, baslik: o.baslik, profil: null }, o.bitis);
    // Bağlı listeler: modelde bagimlilik + çok düzeyli test verisi tablosu (kökün seçenekleri + zincirin gözlemleri) + bulgular.
    const tumAlanlar = new Map(o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar).map((/** @type {Nesne} */ a) => [a.anahtar, a]));
    const bagliListeler = [...o.bagliUst].filter(([alt, ust]) => tumAlanlar.has(alt) && tumAlanlar.has(ust))
      .map(([alt, ust]) => ({ ust, alt, ...(olaganYuklenme(o.yuklenme[alt]) ? { yuklenmeMs: olaganYuklenme(o.yuklenme[alt]) } : {}) }));
    if (bagliListeler.length) {
      const kokler = [...new Set(bagliListeler.map((b) => b.ust))].filter((u) => !o.bagliUst.has(u));
      /** @type {any} */ (envanter).bagliListeler = bagliListeler;
      /** @type {any} */ (envanter).secenekGozlemleri = [
        ...kokler.map((k) => ({ anahtar: k, secimler: {}, secenekler: gercekSecenekler(tumAlanlar.get(k)?.secenekler) })),
        ...o.gozlemler.filter((/** @type {Nesne} */ g) => tumAlanlar.has(g.anahtar))
      ];
    }
    if (o.bulgular.length) /** @type {any} */ (envanter).zincirBulgulari = [...o.bulgular];
    const { paket } = kayitPaketiOlustur(/** @type {any} */ (meta), /** @type {any} */ (envanter));
    const model = bitisiUygula(/** @type {Nesne} */ (paket).model, o.bitis);
    /** @type {Nesne} */ (paket).meta.olusturan = 'Nöbetçi hızlı test';
    const alanlar = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
    const anahtarlar = senaryoAnahtarlari(model, alanlar);
    // Olumsuz senaryo: hatanın göründüğü adım (son basışın adımı).
    const adimIdleri = (Array.isArray(model.adimlar) ? model.adimlar : []).map((/** @type {Nesne} */ a) => String(a.id));
    const olumsuz = o.bitis.olumsuz ? { mesaj: o.bitis.olumsuz.mesaj, adimId: adimIdleri[adimIdleri.length - 1] } : null;
    const veri = senaryoVerisiKur(model, anahtarlar, degerler, { olumsuz, alanTurleri: Object.fromEntries(alanlar.map((/** @type {Nesne} */ a) => [a.anahtar, String(a.tur)])) });
    return { paket, model, veri, mevcut: mevcut && nesneMi(mevcut.model) ? mevcut.model : null };
  }

  /**
   * Kayıt planı: analiz + elle yazılan değerler → tablo planı (kayit-plani.mjs). Hassas sütunlar Ayarlar > Güvenlik > Maskeleme
   * adlarıyla da (kullanıcının ekleri) gizli olur. @param {Veritabani} vt @param {Nesne} o @param {string} baslik
   */
  function planKurOturum(vt, o, baslik) {
    return planKur({ baslik, alanlar: planAlanlari(o), degerler: aktifDegerler(o), ekGizliAdlar: ekGizliAdlar(vt) });
  }

  /**
   * Plan / öneri için alanlar: bağlı listelerin seçeneklerine keşifte ve doldururken gözlenen (başka üst değerlerdeki) seçenekler de eklenir;
   * böylece liste tablosu geçerli bir başka yolun değerlerini de taşır ve öneri o satırı seçebilir. Alanın kendisi değişmez (kopya).
   * @param {Nesne} o
   */
  function planAlanlari(o) {
    return o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar).map((/** @type {Nesne} */ a) => {
      if (!o.bagliUst.has(a.anahtar) || a.tur !== 'select') return a;
      const ek = new Map((Array.isArray(a.secenekler) ? a.secenekler : []).map((/** @type {Nesne} */ x) => [String(x.deger), x]));
      for (const g of o.gozlemler) if (g.anahtar === a.anahtar) for (const x of g.secenekler ?? []) if (!ek.has(String(x.deger))) ek.set(String(x.deger), { deger: String(x.deger), metin: String(x.metin ?? x.deger) });
      return { ...a, secenekler: [...ek.values()] };
    });
  }

  /** Senaryo önerileri (kayit-plani.mjs > senaryoOnerileri): bağlı liste yolları, seçim alanları, Ayarlar'daki öneri sayısı. @param {Veritabani} vt @param {Nesne} o @param {Nesne} plan @param {string} baslik */
  function onerileriKur(vt, o, plan, baslik) {
    let enCok;
    try { enCok = Number(kosuAyarlariniOku(vt).hizliOneriSayisi); } catch { enCok = undefined; }
    const degerler = Object.fromEntries(Object.entries(aktifDegerler(o)).map(([k, v]) => [k, /** @type {Nesne} */ (v).deger]));
    return senaryoOnerileri(plan, baslik, {
      enCok, alanlar: planAlanlari(o), iliskiler: [...o.bagliUst].map(([alt, ust]) => ({ ust, alt })), gozlemler: o.gozlemler, degerler
    });
  }

  /**
   * ÖZET: "Testimi kaydet"ten sonra kullanıcıya gösterilen ekran (yapay zekâ paketinin önizlemesiyle aynı sistem). Hiçbir şey yazılmaz:
   * hangi tablolar yazılacak / aynı adlı ya da benzer tablo varsa birleştirme seçenekleri, hangi alan hangi sütuna bağlanacak,
   * senaryo önerileri, (mevcut ekransa) model farkları.
   * @param {Veritabani} vt @param {Nesne} g
   */
  function kayitOzeti(vt, g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    const baslik = metin(g.baslik, 200) ?? o.senaryoBasligi;
    // Özet kendi sekmesinde (#/hizli-test/ozet/<id>) açılır: kaydet sekmesindeki seçimler oturumda (bellekte) saklanır, özet sekmesi
    // onları gövdesiz istekle okur. Veritabanına hiçbir şey yazılmaz.
    o.senaryoBasligi = baslik;
    o.kayitTercihi = {
      kosuyaDahil: typeof g.kosuyaDahil === 'boolean' ? g.kosuyaDahil : o.kayitTercihi?.kosuyaDahil ?? true,
      tabloOlustur: typeof g.tabloOlustur === 'boolean' ? g.tabloOlustur : o.kayitTercihi?.tabloOlustur ?? true
    };
    const { paket, mevcut } = paketKur(vt, o);
    const alanlar = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
    const anahtarlar = senaryoAnahtarlari(/** @type {Nesne} */ (paket).model, alanlar);
    const plan = planKurOturum(vt, o, baslik);
    const onizleme = planOnizle(vt, o.projeId, plan, o.ekran.id ?? null, anahtarlar);
    /** @type {Nesne | null} */
    let farklar = null;
    if (mevcut && o.ekran.id) {
      const bulgular = modelFarki(mevcut, /** @type {Nesne} */ (paket).model);
      farklar = { ozet: bulguOzeti(bulgular), maddeler: bulgular.slice(0, 30).map((/** @type {Nesne} */ b) => String(b.baslik ?? b.tur)) };
    }
    return {
      ozet: {
        baslik, ekran: { ad: o.ekran.ad, mevcut: Boolean(mevcut && o.ekran.id) }, ortam: { id: o.ortam.id, ad: o.ortam.ad },
        dogrulandi: o.dogrulama?.durum === 'basarili', onizleme, secim: varsayilanSecim(onizleme), senaryolar: onerileriKur(vt, o, plan, baslik), farklar,
        tercih: o.kayitTercihi, senaryoVar: ayniAdliSenaryo(vt, o, baslik) !== null
      }
    };
  }

  /** Düzenleme kipinde ekranın aynı başlıklı senaryosu (kimliği) ya da null. @param {Veritabani} vt @param {Nesne} o @param {string} baslik */
  function ayniAdliSenaryo(vt, o, baslik) {
    if (!o.ekran.id) return null;
    const r = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? AND baslik = ?', [o.projeId, o.ekran.id, baslik])[0];
    return r ? String(r.id) : null;
  }

  /**
   * Seçimle test verisini yazar (kayit-plani.mjs planYaz), senaryo alanlarını tablo başvurusuna çevirir ("${Tablo.Sütun}"), senaryoyu kendi
   * satırına sabitler (tabloSecimleri). 'atla' denen tablonun alanları düz değerle kalır. Hata olursa oturum değerleri eski haline döner.
   * @param {Veritabani} vt @param {Nesne} o @param {string} baslik @param {Nesne} secim
   */
  function planiUygula(vt, o, baslik, secim) {
    const plan = planKurOturum(vt, o, baslik);
    if (!plan.tablolar.length) return null;
    const yedekDegerler = structuredClone(o.degerler);
    const yedekSecimler = structuredClone(o.tabloSecimleri);
    try {
      const yazilan = planYaz(vt, o.projeId, plan, secim, { ekranAdi: o.ekran.ad });
      for (const y of yazilan) {
        if (y.pin && Object.keys(y.pin).length) o.tabloSecimleri[pinAnahtari(y.id)] = Object.fromEntries(Object.entries(y.pin).map(([k, v]) => [k, String(v).slice(0, 200)]));
        for (const a of y.plan.alanlar) if (a.degerli) o.degerler[a.oturumAnahtar] = { deger: basvuruYaz(y.ad, y.hedef(a.sutun)), kaynak: 'tablo' };
      }
      return { plan, yazilan };
    } catch (h) {
      o.degerler = yedekDegerler;
      o.tabloSecimleri = yedekSecimler;
      throw new HizliTestHatasi('TABLO', h instanceof Error ? h.message : String(h));
    }
  }

  /**
   * Ekranın test verisi bölümü: seçilen bağlantılarda alan → yazılan tablonun sütunu (Ekran > Test verisi). Seçim alanına gizli sütun
   * bağlanmaz (ekran-baglari kuralı). @returns {number} bağlanan alan sayısı
   * @param {Veritabani} vt @param {Nesne} o @param {string} ekranId @param {Nesne} paket @param {NonNullable<ReturnType<typeof planiUygula>>} sonuc @param {string[] | null} secilenAlanlar
   */
  function alanlariTabloyaBagla(vt, o, ekranId, paket, sonuc, secilenAlanlar) {
    const alanlar = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
    const anahtarlar = senaryoAnahtarlari(paket.model, alanlar);
    /** @type {Record<string, { tablo: string; sutun: string }>} */
    const yeni = {};
    for (const y of sonuc.yazilan) {
      for (const a of y.plan.alanlar) {
        const senaryoAnahtari = anahtarlar[a.oturumAnahtar];
        if (!senaryoAnahtari || (secilenAlanlar && !secilenAlanlar.includes(senaryoAnahtari))) continue;
        const gizli = y.plan.sutunlar.find((x) => x.ad === a.sutun)?.gizli === true;
        const tur = String(alanlar.find((x) => x.anahtar === a.oturumAnahtar)?.tur ?? '');
        if (gizli && ['select', 'radio'].includes(tur)) continue;
        yeni[senaryoAnahtari] = { tablo: y.id, sutun: y.hedef(a.sutun) };
      }
    }
    if (!Object.keys(yeni).length) return 0;
    ekranAlanBaglariniKaydet(vt, o.projeId, ekranId, { ...ekranAlanBaglari(vt, ekranId), ...yeni });
    // Seçim alanlarının sayfa değeri karşılıkları (tablo değeri ↔ sayfadaki seçenek) eksikse eklenir.
    try { karsiliklariEkrandanAl(vt, o.projeId, ekranId); } catch { /* karşılık eklenemedi: bağ yine geçerli */ }
    return Object.keys(yeni).length;
  }

  /** Kaydet: aynı ekran varsa önce farklar (onaysız); sonra ekran modeli + senaryo. @param {Veritabani} vt @param {Nesne} g @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; medyaKlasoru: string }} c */
  async function kaydet(vt, g, c) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    const baslik = metin(g.baslik, 200) ?? o.senaryoBasligi;
    // Düzenleme kipi: ekranda aynı başlıklı senaryo varsa üzerine yazmadan önce sorulur (hiçbir şey yazılmadan döner); arayüz "Üzerine
    // yaz" (uzerineYaz: true) / "Yeni adla kaydet" (başka başlık) / "Vazgeç" seçtirir.
    if (g.uzerineYaz !== true && ayniAdliSenaryo(vt, o, baslik)) return { senaryoVar: true, baslik };
    o.senaryoBasligi = baslik;
    let { paket, veri, mevcut } = paketKur(vt, o);
    if (mevcut && o.ekran.id && g.onay !== true) {
      const bulgular = modelFarki(mevcut, /** @type {Nesne} */ (paket).model);
      const onizleme = paketOnizle(vt, o.projeId, paket, { ekranId: o.ekran.id, mod: 'degistir' });
      if (!onizleme.gecerli) throw new HizliTestHatasi('PAKET', `Model kaydedilemedi: ${onizleme.hatalar.slice(0, 3).map((h) => `${h.yer}: ${h.mesaj}`).join(' · ')}`);
      o.farklar = {
        ozet: bulguOzeti(bulgular), maddeler: bulgular.slice(0, 30).map((/** @type {Nesne} */ b) => String(b.baslik ?? b.tur)),
        senaryolar: /** @type {Nesne} */ (onizleme.etki ?? {}).senaryolar?.map?.((/** @type {Nesne} */ s2) => s2.baslik) ?? []
      };
      return { onayGerekli: true, farklar: o.farklar };
    }
    // Test verisi: özetteki seçimle (yoksa varsayılan: aynı adlı tablo varsa birleştir, yoksa yeni) yazılır; senaryo alanları tabloya bağlanır.
    let tablo = null;
    /** @type {Nesne | null} */
    let uygulanan = null;
    if (g.tabloOlustur !== false) {
      let secim = nesneMi(g.secim) ? /** @type {Nesne} */ (g.secim) : null;
      if (!secim) {
        const alanlar0 = o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar);
        secim = varsayilanSecim(planOnizle(vt, o.projeId, planKurOturum(vt, o, baslik), o.ekran.id ?? null, senaryoAnahtarlari(/** @type {Nesne} */ (paket).model, alanlar0)));
      }
      uygulanan = planiUygula(vt, o, baslik, secim);
      if (uygulanan) ({ paket, veri, mevcut } = paketKur(vt, o));
    }
    let ekranId = o.ekran.id;
    if (mevcut && ekranId) {
      await modeliPaketleDegistir(vt, o.projeId, ekranId, paket, { onay: true, senaryoIndeksleri: [], ortamIdleri: [o.ortam.id], medyaKlasoru: c.medyaKlasoru });
    } else {
      const r = await sayfaEkle(vt, o.projeId, paket, { senaryoIndeksleri: [], ortamIdleri: [o.ortam.id], medyaKlasoru: c.medyaKlasoru });
      ekranId = r.ekranId;
    }
    const ayni = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? AND baslik = ?', [o.projeId, ekranId, baslik])[0];
    if (uygulanan) {
      const secilen = Array.isArray(/** @type {Nesne} */ (g.secim)?.baglantilar) ? /** @type {string[]} */ (/** @type {Nesne} */ (g.secim).baglantilar).map(String) : null;
      let baglanan = 0;
      try { baglanan = alanlariTabloyaBagla(vt, o, ekranId, paket, uygulanan, secilen); } catch (h) { gunluk(o, `Alanlar tabloya bağlanamadı: ${h instanceof Error ? h.message : String(h)}`); }
      tablo = {
        baglanan,
        tablolar: uygulanan.yazilan.map((/** @type {Nesne} */ y) => ({
          tablo: y.ad, tabloId: y.id, sutunSayisi: y.plan.sutunlar.length, yeni: y.islem !== 'birlestir', islem: y.islem, eklenenSatir: y.eklenenSatir, eklenenSutun: y.eklenenSutun,
          secenekSayisi: y.tur === 'liste' ? y.plan.satirlar.length : 0
        })),
        atlanan: uygulanan.plan.tablolar.map((/** @type {Nesne} */ t) => t.ad).filter((/** @type {string} */ ad) => !uygulanan?.yazilan.some((/** @type {Nesne} */ y) => y.planAdi === ad))
      };
    }
    const hizli = { izin: o.izin, dogrulandi: o.dogrulama?.durum === 'basarili', bitis: { bitti: o.bitis.bitti, hata: o.bitis.hata, devam: o.bitis.devam, adres: o.bitis.adres }, olusturma: simdi() };
    const s2 = senaryoKaydet(vt, {
      ...(ayni ? { id: String(ayni.id) } : {}), projeId: o.projeId, ekranId, baslik, veri, ortamIdleri: [o.ortam.id], kosuyaDahil: g.kosuyaDahil !== false,
      tabloSecimleri: Object.keys(o.tabloSecimleri).length ? o.tabloSecimleri : undefined, hizliTest: hizli
    }, { kosuyorMu: c.kosuyorMu });
    // Senaryo önerilerinden seçilenler: her değişiklik ilgili liste tablosunun satırını seçer (bağlı listeler birlikte). Senaryoda değeri olmayan
    // alan (sayfada hazır gelen radyo / liste) tablo başvurusuyla senaryoya eklenir; satır seçimi o değere sabitlenir.
    /** @type {Array<{ id: string; baslik: string }>} */
    const ek = [];
    const istenen = Array.isArray(g.senaryoIndeksleri) ? g.senaryoIndeksleri.map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
    if (uygulanan && istenen.length) {
      const oneriler = onerileriKur(vt, o, uygulanan.plan, baslik);
      const anahtarlar = senaryoAnahtarlari(/** @type {Nesne} */ (paket).model, o.adimlar.flatMap((/** @type {Nesne} */ a) => a.alanlar));
      for (const i of istenen) {
        const oneri = oneriler.find((x) => x.indeks === i);
        if (!oneri?.alt) continue;
        const pinler = structuredClone(o.tabloSecimleri);
        const veri2 = structuredClone(veri);
        let tamam = true;
        for (const d of oneri.alt.degisiklikler) {
          const y = uygulanan.yazilan.find((/** @type {Nesne} */ k) => k.planAdi === d.planAdi);
          if (!y) { tamam = false; break; }
          pinler[pinAnahtari(y.id)] = { [y.hedef(d.sutun)]: d.deger.slice(0, 200) };
          const anahtar = anahtarlar[d.oturumAnahtar];
          if (anahtar && veri2[anahtar] === undefined) veri2[anahtar] = basvuruYaz(y.ad, y.hedef(d.sutun));
        }
        if (!tamam) { gunluk(o, `“${oneri.baslik}” önerisi kaydedilmedi: tablosu yazılmadı (atlandı).`); continue; }
        const varMi = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? AND baslik = ?', [o.projeId, ekranId, oneri.baslik])[0];
        const e = senaryoKaydet(vt, { ...(varMi ? { id: String(varMi.id) } : {}), projeId: o.projeId, ekranId, baslik: oneri.baslik, veri: veri2, ortamIdleri: [o.ortam.id], kosuyaDahil: g.kosuyaDahil !== false, tabloSecimleri: pinler }, { kosuyorMu: c.kosuyorMu });
        ek.push({ id: e.id, baslik: oneri.baslik });
      }
    }
    let hazirlik = null;
    try { hazirlik = senaryoHazirligi(vt, o.projeId, s2.id, o.ortam.id); } catch { hazirlik = null; }
    const senaryo = senaryoGetir(vt, s2.id);
    o.kayit = { ekranId, senaryoId: s2.id, senaryoBasligi: senaryo?.baslik ?? baslik, dogrulandi: hizli.dogrulandi, hazirlik, uyarilar: s2.uyarilar, tablo, ekSenaryolar: ek };
    o.ekran = { ...o.ekran, id: ekranId };
    o.durum = 'kaydedildi';
    o.calisiyor = null;
    gunluk(o, `Kaydedildi: ekran “${o.ekran.ad}”, senaryo “${baslik}”${hizli.dogrulandi ? '' : ' (doğrulanmadı)'}.`);
    // Tarayıcı kapatılır (iş biter).
    try { gonder(o, { tur: 'bitir' }); } catch { /* iş zaten bitti */ }
    o.bekleyen = null;
    return { kaydedildi: true, ...o.kayit };
  }

  /** @param {Nesne} g */
  function iptal(g) {
    const o = oturumGetir(String(g.id ?? ''));
    if (['kaydedildi', 'iptal'].includes(o.durum)) return { iptal: true };
    o.durum = 'iptal';
    o.hata = { kod: 'IPTAL', mesaj: 'Hızlı test iptal edildi; hiçbir şey kaydedilmedi.' };
    try { tarama().iptal(o.isId); } catch { /* iş zaten bitti */ }
    return { iptal: true };
  }

  return {
    oturumlar,
    secenekler,
    baslat,
    durum: (/** @type {string} */ id) => gorunum(oturumGetir(id)),
    veri,
    karar,
    onay,
    diyalogCevabi,
    hataCevabi,
    yenidenTara,
    geri,
    bitis,
    dogrula,
    ozet: kayitOzeti,
    kaydet,
    iptal
  };
}

/** @type {ReturnType<typeof hizliTestYoneticisiOlustur> | null} */
let varsayilan = null;

/**
 * /platform/hizli-test/* isteklerini işler (sunucu-platform.mjs'den). Eşleşmezse false. Depo / kasa / izin hataları çağırana fırlatılır.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 * @param {{ token: string; disTokenGecerli: boolean; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void;
 *   jsonGovde: (sinir?: number) => Promise<Record<string, unknown> | null>; acikVeritabani: () => Promise<Veritabani>; projeKoku: string;
 *   medyaKlasoru: () => string; kosuyorMu?: (dosya: string, ad: string) => boolean }} b
 */
export async function hizliTestIsteginiIsle(req, res, b) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const yol = url.pathname;
  if (!yol.startsWith('/platform/hizli-test/')) return false;
  varsayilan ??= hizliTestYoneticisiOlustur({ projeKoku: b.projeKoku });
  const y = varsayilan;
  const gonder = (/** @type {number} */ durum, /** @type {Nesne} */ govde) => {
    res.setHeader('Cache-Control', 'no-store');
    b.jsonGonder(res, durum, govde);
  };
  try {
    if (req.method === 'GET') {
      if (!b.disTokenGecerli) { gonder(401, { basarili: false, mesaj: 'Geçersiz token.' }); return true; }
      const q = url.searchParams;
      if (yol === '/platform/hizli-test/secenekler') {
        const db = await b.acikVeritabani();
        const ekranId = q.get('ekranId');
        gonder(200, { basarili: true, ...y.secenekler(db, kimlikAl(q.get('projeId'), 'projeId'), ekranId ? kimlikAl(ekranId, 'ekranId') : null) });
        return true;
      }
      if (yol === '/platform/hizli-test/durum') { gonder(200, { basarili: true, oturum: y.durum(String(q.get('id') ?? '')) }); return true; }
      gonder(404, { basarili: false, mesaj: 'Bilinmeyen hızlı test uç noktası.' });
      return true;
    }
    if (req.method !== 'POST') { gonder(405, { basarili: false, mesaj: 'Yöntem desteklenmiyor.' }); return true; }
    const govde = await b.jsonGovde();
    if (!govde) return true;
    if (govde.token !== b.token && !b.disTokenGecerli) { gonder(401, { basarili: false, mesaj: 'Geçersiz token.' }); return true; }
    const db = await b.acikVeritabani();
    /** @type {Record<string, () => Nesne | Promise<Nesne>>} */
    const islemler = {
      '/platform/hizli-test/baslat': () => {
        const sonuc = y.baslat(db, govde, { sunucuAdresi: `http://127.0.0.1:${req.socket.localPort}` });
        console.log(`[platform] Hızlı test başlatıldı (${sonuc.id}).`);
        return sonuc;
      },
      '/platform/hizli-test/veri': () => y.veri(db, govde),
      '/platform/hizli-test/karar': () => y.karar(govde),
      '/platform/hizli-test/onay': () => y.onay(govde),
      '/platform/hizli-test/diyalog': () => y.diyalogCevabi(govde),
      '/platform/hizli-test/hata-cevabi': () => y.hataCevabi(govde),
      '/platform/hizli-test/yeniden-tara': () => y.yenidenTara(govde),
      '/platform/hizli-test/bitis': () => y.bitis(govde),
      '/platform/hizli-test/geri': () => y.geri(govde),
      '/platform/hizli-test/dogrula': () => y.dogrula(govde),
      '/platform/hizli-test/ozet': () => y.ozet(db, govde),
      '/platform/hizli-test/kaydet': () => y.kaydet(db, govde, { kosuyorMu: b.kosuyorMu, medyaKlasoru: b.medyaKlasoru() }),
      '/platform/hizli-test/iptal': () => y.iptal(govde)
    };
    const islem = islemler[yol];
    if (!islem) { gonder(404, { basarili: false, mesaj: 'Bilinmeyen hızlı test uç noktası.' }); return true; }
    gonder(200, { basarili: true, ...(await islem()) });
    return true;
  } catch (hata) {
    if (hata instanceof HizliTestHatasi || hata instanceof TaramaHatasi) {
      if (!res.headersSent) gonder(hata.durum, { basarili: false, kod: hata.kod, mesaj: hata.message, ...hata.ek });
      return true;
    }
    throw hata;
  }
}

/** Testler / kapanış: bellekteki oturumlar. */
export function hizliTestOturumlariniTemizle() {
  varsayilan?.oturumlar.clear();
}
