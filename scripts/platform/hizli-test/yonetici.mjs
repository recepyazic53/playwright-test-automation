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
//   POST /platform/hizli-test/veri { id, degerler }           veri durağı: { anahtar: { deger, kaynak: 'elle' | 'tablo', tabloSecimi? } }
//   POST /platform/hizli-test/karar { id, karar: 'bas' | 'baska' | 'bitir' | 'duzelt', secici?, metin?, dugme?, mesajlar? }
//   POST /platform/hizli-test/onay { id, cevap }               Bana sor: "X'e basayım mı?"
//   POST /platform/hizli-test/hata-cevabi { id, cevap: 'hata' | 'uyari' | 'onemsiz' }
//   POST /platform/hizli-test/bitis { id, etiketler, adres?, olumsuz? }
//   POST /platform/hizli-test/dogrula { id }                   H3: baştan sona doğrulama koşusu (yeni kayıt oluşabilir)
//   POST /platform/hizli-test/kaydet { id, baslik, kosuyaDahil?, onay? }   aynı ekran varsa önce farklar (onaysız), onayla yeni sürüm
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
import { ekranAnahtariOner, kayitPaketiOlustur } from '../tarama/paket-olusturucu.mjs';
import { katla } from '../tarama/eylem-kesfi.mjs';
import { modeliPaketleDegistir, paketOnizle, sayfaEkle } from '../ekranlar/ekran-servisi.mjs';
import { bulguOzeti, modelFarki } from '../ekranlar/model-farki.mjs';
import { senaryoKaydet } from '../senaryolar/senaryo-servisi.mjs';
import { senaryoHazirligi } from '../senaryolar/hazirlik-servisi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekranBasvurulariniCoz } from '../tablolar/ekran-basvurulari.mjs';
import { degerBasvurusu } from '../tablolar/tablo-secimi.mjs';
import {
  BITIS_BEKLEME_SN, IZINLER, IZIN_ADLARI, adayMesajlari, basmaKarari, beklemeMetniMi, bitisKosulu, bitisiUygula, canliOnayMetni, cumleyiOku,
  eksikAlanlar, kayitEnvanteriKur, senaryoAnahtarlari, senaryoVerisiKur, tekAday, varsayilanEtiketler
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
    o.alanlar.set(alan.anahtar, { alan, yeni });
    adim.alanlar.push(alan);
  };
  /** Zorunlu boş alan var mı / gösterilecek alan var mı → veri durağı. @param {Nesne} o @param {string | null} [not] */
  const veriDuragi = (o, not = null) => {
    o.durum = 'veri';
    o.soruNotu = not;
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
      o.sonAnlik = anlik;
      o.sonGoruntu = anlik.goruntu ?? null;
      o.baslik = anlik.baslik ?? '';
      o.calisiyor = null;
      const adim = { alanlar: [], bas: null, okumalar: [{ gorunen: anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar), secimler: {} }] };
      o.adimlar = [adim];
      for (const a of anlik.alanlar.filter(doldurulabilir)) alanEkle(o, a, adim, false);
      gunluk(o, `Keşif: ${adim.alanlar.length} alan, ${anlik.dugmeler.length} düğme adayı; hiçbir düğmeye basılmadı.`);
      if (adim.alanlar.length) veriDuragi(o); else verilerTamam(o);
      return;
    }
    if (!o.bekleyen || e.no !== o.bekleyen.no) return;
    const bekleyen = o.bekleyen;
    o.bekleyen = null;
    o.calisiyor = null;
    if (e.olay === 'hata') {
      o.sonHata = String(e.mesaj ?? '').slice(0, 500);
      gunluk(o, `Hata: ${o.sonHata}`);
      if (bekleyen.tur === 'doldur') veriDuragi(o);
      else if (bekleyen.tur === 'dogrula') { o.dogrulama = { durum: 'basarisiz', mesaj: o.sonHata, gorulen: [] }; o.durum = 'kaydet'; }
      else o.durum = o.izin === 'hayir' ? 'hayirSecim' : 'karar';
      return;
    }
    o.sonHata = null;
    if (e.olay === 'dolduruldu') {
      o.sonAnlik = e.anlik;
      o.alanHatalari = Object.fromEntries((e.hatalar ?? []).map((/** @type {Nesne} */ h) => [h.anahtar, h.mesaj]));
      const adim = guncelAdim(o);
      const gorunen = new Set(e.anlik.alanlar.map((/** @type {Nesne} */ a) => a.anahtar));
      // Koşullu alanlar: doldurunca beliren yeni alanlar aynı adıma; kaybolanlar adımdan çıkar (değerleri senaryoya yazılmaz).
      /** @type {string[]} */
      const yeniler = [];
      for (const a of e.anlik.alanlar.filter(doldurulabilir)) {
        if (!o.alanlar.has(a.anahtar)) { alanEkle(o, a, adim, true); yeniler.push(a.anahtar); }
      }
      const yeni = yeniler.length;
      adim.alanlar = adim.alanlar.filter((/** @type {Nesne} */ a) => gorunen.has(a.anahtar));
      const secimler = Object.fromEntries(adim.alanlar.filter((/** @type {Nesne} */ a) => ['select', 'radio'].includes(String(a.tur)) && typeof o.degerler[a.anahtar]?.deger === 'string'
        && !degerBasvurusu(o.degerler[a.anahtar].deger)).map((/** @type {Nesne} */ a) => [a.anahtar, o.degerler[a.anahtar].deger]));
      // Koşullu alan: doldurmada YALNIZ BİR seçim alanı değiştiyse, beliren alan o seçimin bu değerinde görünür sayılır (gözlem; tek
      // değişiklik yoksa koşul yazılmaz — akış kaydının okuma kuralı dener).
      const onceki = adim.okumalar.length ? adim.okumalar[adim.okumalar.length - 1].secimler : {};
      const degisen = Object.keys(secimler).filter((k) => onceki[k] !== secimler[k]);
      if (yeniler.length && degisen.length === 1) {
        adim.kosullar ??= {};
        for (const k of yeniler) adim.kosullar[k] = { secim: degisen[0], degerler: [secimler[degisen[0]]] };
      }
      adim.okumalar.push({ gorunen: [...gorunen], secimler });
      if (Object.keys(o.alanHatalari).length) { veriDuragi(o, 'Bazı alanlar doldurulamadı.'); return; }
      if (yeni) { veriDuragi(o, `${yeni} yeni alan belirdi; değerlerini girin.`); return; }
      const eksik = eksikAlanlar(adim.alanlar, Object.fromEntries(Object.entries(o.degerler).map(([k, v]) => [k, v.deger])));
      if (eksik.length) { veriDuragi(o, `${eksik.length} zorunlu alan boş.`); return; }
      verilerTamam(o);
      return;
    }
    if (e.olay === 'basildi') {
      const f = e.fark;
      o.basisNo++;
      const adim = guncelAdim(o);
      adim.bas = { ...o.basiliyor };
      adim.fark = { ...f, anlik: undefined };
      o.basiliyor = null;
      o.sonFark = f;
      o.sonAnlik = f.anlik;
      o.sonGoruntu = f.anlik.goruntu ?? null;
      for (const m of f.beklemeMetinleri ?? []) gorulenEkle(o, m, 'bekleme');
      for (const m of f.yeniMetinler ?? []) gorulenEkle(o, m.metin, m.tur);
      gunluk(o, `“${adim.bas.metin ?? adim.bas.secici}” basıldı (${Math.round(f.sureMs / 100) / 10} sn): ${f.yeniMetinler.length} yeni metin, ${f.yeniAlanlar.length} yeni alan${f.adres ? `, adres ${f.adres.sonra}` : ''}.`);
      const hatalar = f.yeniMetinler.filter((/** @type {Nesne} */ m) => m.tur === 'hata').map((/** @type {Nesne} */ m) => m.metin);
      if (hatalar.length) { o.hataSorusu = { metinler: hatalar }; o.durum = 'hataSorusu'; return; }
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
    if (e.olay === 'okundu') { o.sonAnlik = e.anlik; o.sonGoruntu = e.anlik.goruntu ?? o.sonGoruntu; o.durum = 'karar'; return; }
    if (e.olay === 'dogrulandi') {
      o.dogrulama = { durum: e.sonuc, mesaj: String(e.mesaj ?? ''), gorulen: Array.isArray(e.gorulen) ? e.gorulen.slice(0, 20) : [] };
      gunluk(o, `Doğrulama koşusu: ${e.sonuc === 'basarili' ? 'başarılı' : 'başarısız'} — ${o.dogrulama.mesaj}`);
      o.durum = 'kaydet';
    }
  }

  /** Görülen metin (bitiş çipleri). @param {Nesne} o @param {unknown} m @param {string} tur */
  function gorulenEkle(o, m, tur) {
    const t = metin(m, 200);
    if (!t) return;
    const var_ = o.gorulenler.find((/** @type {Nesne} */ g) => g.metin === t);
    if (var_) { var_.basis = o.basisNo; if (tur === 'hata' || tur === 'bekleme') var_.tur = tur; return; }
    if (o.gorulenler.length >= 60) return;
    o.gorulenler.push({ metin: t, tur: tur === 'bekleme' || beklemeMetniMi(t) ? 'bekleme' : tur, basis: o.basisNo });
  }

  // ---- Görünüm ----
  /** @param {Nesne} o */
  function gorunum(o) {
    const d = tarama().isler.get(o.isId);
    const is = d ? tarama().durum(o.isId) : null;
    const alanGorunumu = (/** @type {Nesne} */ a) => {
      const v = o.degerler[a.anahtar];
      return {
        anahtar: a.anahtar, etiket: a.etiket ?? a.ad ?? a.kimlik ?? a.anahtar, tur: a.tur, zorunlu: a.zorunlu === true,
        secenekler: a.tur === 'radio' ? (a.radyolar ?? []).map((/** @type {Nesne} */ r) => ({ deger: r.deger, metin: r.metin ?? r.deger })) : a.secenekler ?? null,
        yeni: o.alanlar.get(a.anahtar)?.yeni === true, hata: o.alanHatalari?.[a.anahtar] ?? null,
        deger: v ? (gizliAlan(a) && v.kaynak === 'elle' ? '••••••' : v.deger) : null, kaynak: v?.kaynak ?? null, gizli: gizliAlan(a)
      };
    };
    const adimlar = o.adimlar.map((/** @type {Nesne} */ a, i) => ({
      no: i + 1, alanlar: a.alanlar.map(alanGorunumu), bas: a.bas ?? null,
      fark: a.fark ? {
        sureMs: a.fark.sureMs, zamanAsimi: a.fark.zamanAsimi, beklemeMetinleri: a.fark.beklemeMetinleri, yeniMetinler: a.fark.yeniMetinler,
        yeniAlanlar: a.fark.yeniAlanlar.map((/** @type {Nesne} */ x) => x.etiket ?? x.anahtar), yeniDugmeler: a.fark.yeniDugmeler.map((/** @type {Nesne} */ x) => x.metin ?? x.secici),
        adres: a.fark.adres
      } : null
    }));
    const adim = o.adimlar.length ? guncelAdim(o) : null;
    const adaylar = (o.sonAnlik?.dugmeler ?? []).map((/** @type {Nesne} */ x) => ({ secici: x.secici, metin: x.metin, kayitOlusturabilir: x.kayitOlusturabilir, enOlasi: x.enOlasi, guven: x.guven }));
    /** @type {Nesne | null} */
    let soru = null;
    if (o.durum === 'veri' && adim) soru = { tur: 'veri', adim: o.adimlar.length, alanlar: adim.alanlar.map(alanGorunumu), not: o.soruNotu ?? null };
    else if (o.durum === 'karar') {
      // Öneri: son basışta beliren düğme (zincirin devamı), yoksa cümlenin adını verdiği / tek aday, yoksa en olası aday.
      const yeniDugme = (o.sonFark?.yeniDugmeler ?? []).find((/** @type {Nesne} */ d) => adaylar.some((/** @type {Nesne} */ x) => x.secici === d.secici));
      soru = {
        tur: 'karar', adaylar, bitirilebilir: o.basisNo > 0,
        oneri: yeniDugme?.secici ?? tekAday(adaylar, o.cumle.dugmeler)?.secici ?? adaylar.find((/** @type {Nesne} */ x) => x.enOlasi)?.secici ?? null
      };
    }
    else if (o.durum === 'onay') soru = { tur: 'onay', dugme: o.onayBekleyen };
    else if (o.durum === 'hataSorusu') soru = { tur: 'hata', metinler: o.hataSorusu?.metinler ?? [] };
    else if (o.durum === 'secim') soru = { tur: 'secim' };
    else if (o.durum === 'hayirSecim') {
      soru = { tur: 'hayirSecim', adaylar, mesajlar: adayMesajlari(o.sonAnlik?.eylem ?? null, o.cumle.mesajlar), oneri: tekAday(adaylar, o.cumle.dugmeler)?.secici ?? adaylar.find((/** @type {Nesne} */ x) => x.enOlasi)?.secici ?? null };
    } else if (o.durum === 'bitis') soru = { tur: 'bitis', gorulenler: o.gorulenler, etiketler: o.etiketler, adres: o.adresBitti, onerilenAdres: o.sonFark?.adres?.sonra ?? null, olumsuz: o.olumsuz };
    else if (o.durum === 'kaydet') soru = { tur: 'kaydet', ozet: ozet(o), dogrulama: o.dogrulama, dogrulanabilir: o.izin !== 'hayir', baslik: o.senaryoBasligi, farklar: o.farklar ?? null };
    else if (o.durum === 'kaydedildi') soru = { tur: 'kaydedildi', ...o.kayit };
    return {
      id: o.id, durum: o.durum, izin: o.izin, izinAdi: IZIN_ADLARI[/** @type {'evet' | 'sor' | 'hayir'} */ (o.izin)], projeId: o.projeId, ortam: o.ortam, hedef: o.hedefYol,
      ekran: o.ekran, cumle: o.cumle, duzenleme: Boolean(o.ekran.id), durak: durakNo(o), calisiyor: o.calisiyor, sonHata: o.sonHata, hata: o.hata,
      kesif: o.kesifAnlik ? {
        alanSayisi: o.kesifAnlik.alanlar.length, dugmeAdaylari: o.kesifAnlik.dugmeler.map((/** @type {Nesne} */ x) => x.metin ?? x.secici).slice(0, 8),
        mesajAdaylari: adayMesajlari(o.kesifAnlik.eylem, o.cumle.mesajlar).slice(0, 8), notlar: o.kesifAnlik.eylem?.notlar ?? []
      } : null,
      adimlar, soru, goruntu: o.sonGoruntu, gunluk: o.gunluk.slice(-20),
      is: is ? { durum: is.durum, adimlar: is.adimlar, hata: is.hata, kodIstegi: is.kodIstegi } : null
    };
  }
  /** Şeritteki durak (1 Başlat … 6 Kaydet). @param {Nesne} o */
  function durakNo(o) {
    if (o.durum === 'kesif') return 2;
    if (o.durum === 'veri') return 3;
    if (['karar', 'onay', 'hataSorusu', 'secim', 'calisiyor', 'hayirSecim'].includes(o.durum)) return 4;
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
    const hedef = metin(g.hedef, 2000);
    if (!hedef) throw new HizliTestHatasi('HEDEF', 'Sayfa adresini yazın (ör. /basvuru).');
    /** @type {{ id: string | null; ad: string; anahtar: string }} */
    let ekran;
    if (g.ekranId) {
      const e = ekranlariListele(vt, projeId).find((x) => x.id === kimlikAl(g.ekranId, 'ekranId'));
      if (!e) throw new DepoHatasi('Ekran bulunamadı.');
      const m = ekranModeliGetir(vt, e.id);
      if (m && nesneMi(m.model) && (m.model.tur === 'altModel' || m.model.tur === 'ortakAkis')) throw new HizliTestHatasi('EKRAN_TURU', 'Alt model ve ortak akış hızlı testle düzenlenmez.');
      ekran = { id: e.id, ad: e.ad, anahtar: e.anahtar };
    } else {
      const ad = metin(g.ekranAdi, 120);
      if (!ad) throw new HizliTestHatasi('EKRAN_ADI', 'Testin (ekranın) adını yazın.');
      const anahtar = ekranAnahtariOner(ad);
      const ayni = ekranlariListele(vt, projeId).find((x) => x.anahtar === anahtar);
      ekran = ayni ? { id: ekranModeliGetir(vt, ayni.id) ? ayni.id : null, ad: ayni.ad, anahtar } : { id: null, ad, anahtar };
    }
    // İzinler ve CANLI onayı: taramayla AYNI denetim (tarayıcı açılmadan). CANLI'da kilit yok; onay bir kez istenir.
    const govde = { kip: 'hizliTest', projeId, ortamId, hedef, izin, onay: true, girissiz: g.girissiz === true, baglamProfilleri: [], ...(g.canliOnay === true ? { canliOnay: true } : {}) };
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
      basisNo: 0, sonAnlik: null, kesifAnlik: null, sonFark: null, sonGoruntu: null, gunluk: [], dogrulama: null, bitis: null, hata: null, sonHata: null,
      senaryoBasligi: `${ekran.ad} — hızlı test`, baslik: ''
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
    for (const [k, v] of Object.entries(yeni)) { if (v) o.degerler[k] = v; else delete o.degerler[k]; }
    const eksik = eksikAlanlar(adim.alanlar, Object.fromEntries(Object.entries(o.degerler).map(([k, v]) => [k, v.deger])));
    if (eksik.length) {
      throw new HizliTestHatasi('EKSIK', `Zorunlu alanlar boş: ${eksik.slice(0, 5).map((a) => a.etiket ?? a.anahtar).join(', ')}. Değer yazın ya da “Doldur” ile tablodan seçin.`, 400,
        { eksikler: eksik.map((a) => a.anahtar) });
    }
    // Tarayıcıya gidecek değerler: tablo başvuruları bu ortamda çözülür (değer üretilmez; çözülemezse açık hata).
    const gidecek = adim.alanlar.filter((/** @type {Nesne} */ a) => o.degerler[a.anahtar]);
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
    o.durum = 'calisiyor';
    o.calisiyor = 'Alanlar dolduruluyor…';
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
      o.adresBitti = null;
      o.durum = 'bitis';
      return { tamam: true };
    }
    if (k === 'duzelt') { veriDuragi(o); return { tamam: true }; }
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

  /** "Bu bir hata mı, beklenen uyarı mı?" @param {Nesne} g */
  function hataCevabi(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['hataSorusu']);
    const c = String(g.cevap ?? '');
    const metinler = o.hataSorusu?.metinler ?? [];
    o.hataCevaplari ??= {};
    for (const m of metinler) o.hataCevaplari[m] = c;
    o.hataSorusu = null;
    if (c === 'hata') {
      // Verileri düzeltip yeniden denenir: aynı adımın veri durağı (basış zincire yazılmaz).
      const adim = guncelAdim(o);
      adim.bas = null;
      adim.fark = null;
      veriDuragi(o, 'Hata göründü: değerleri düzeltin, sonra düğmeye yeniden basın.');
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
    basistanSonra(o);
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

  /** H3: baştan sona doğrulama koşusu. @param {Nesne} g */
  function dogrula(g) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    if (o.izin === 'hayir') throw new HizliTestHatasi('IZIN', 'Hayır izninde doğrulama koşusu yapılmaz (düğmeye basılmaz).');
    const adimlar = o.adimlar.filter((/** @type {Nesne} */ a) => a.alanlar.length || a.bas).map((/** @type {Nesne} */ a) => ({
      alanlar: a.alanlar.filter((/** @type {Nesne} */ x) => o.degerler[x.anahtar]).map((/** @type {Nesne} */ x) => ({ anahtar: x.anahtar, alan: x, deger: o.cozulmus?.[x.anahtar] ?? o.degerler[x.anahtar].deger })),
      bas: a.bas ? { secici: a.bas.secici, metin: a.bas.metin } : null
    }));
    if (o.bitis.olumsuz) {
      // Olumsuz senaryo: beklenen hata mesajı "bitti" sayılır.
      const bitis = { bitti: [o.bitis.olumsuz.mesaj], devam: o.bitis.devam, hata: o.bitis.hata.filter((/** @type {string} */ h) => !katla(o.bitis.olumsuz.mesaj).includes(katla(h))), adres: null };
      o.durum = 'dogrulama';
      o.calisiyor = 'Doğrulama koşusu: sayfa yeniden açılıyor, zincir baştan uygulanıyor…';
      gonder(o, { tur: 'dogrula', plan: { adimlar, bitis, zamanAsimiSn: BITIS_BEKLEME_SN } });
      return { basladi: true };
    }
    o.durum = 'dogrulama';
    o.calisiyor = 'Doğrulama koşusu: sayfa yeniden açılıyor, zincir baştan uygulanıyor…';
    gonder(o, { tur: 'dogrula', plan: { adimlar, bitis: { bitti: o.bitis.bitti, devam: o.bitis.devam, hata: o.bitis.hata, adres: o.bitis.adres }, zamanAsimiSn: BITIS_BEKLEME_SN } });
    return { basladi: true };
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
    const degerler = Object.fromEntries(Object.entries(o.degerler).map(([k, v]) => [k, v.deger]));
    const envanter = kayitEnvanteriKur({ adimlar: o.adimlar, degerler, yol: meta.urlYolu, baslik: o.baslik, profil: null }, o.bitis);
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

  /** Kaydet: aynı ekran varsa önce farklar (onaysız); sonra ekran modeli + senaryo. @param {Veritabani} vt @param {Nesne} g @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; medyaKlasoru: string }} c */
  async function kaydet(vt, g, c) {
    const o = oturumGetir(String(g.id ?? ''));
    durumda(o, ['kaydet']);
    const baslik = metin(g.baslik, 200) ?? o.senaryoBasligi;
    o.senaryoBasligi = baslik;
    const { paket, veri, mevcut } = paketKur(vt, o);
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
    let ekranId = o.ekran.id;
    if (mevcut && ekranId) {
      await modeliPaketleDegistir(vt, o.projeId, ekranId, paket, { onay: true, senaryoIndeksleri: [], ortamIdleri: [o.ortam.id], medyaKlasoru: c.medyaKlasoru });
    } else {
      const r = await sayfaEkle(vt, o.projeId, paket, { senaryoIndeksleri: [], ortamIdleri: [o.ortam.id], medyaKlasoru: c.medyaKlasoru });
      ekranId = r.ekranId;
    }
    const ayni = vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? AND baslik = ?', [o.projeId, ekranId, baslik])[0];
    const hizli = { izin: o.izin, dogrulandi: o.dogrulama?.durum === 'basarili', bitis: { bitti: o.bitis.bitti, hata: o.bitis.hata, devam: o.bitis.devam, adres: o.bitis.adres }, olusturma: simdi() };
    const s2 = senaryoKaydet(vt, {
      ...(ayni ? { id: String(ayni.id) } : {}), projeId: o.projeId, ekranId, baslik, veri, ortamIdleri: [o.ortam.id], kosuyaDahil: g.kosuyaDahil !== false,
      tabloSecimleri: Object.keys(o.tabloSecimleri).length ? o.tabloSecimleri : undefined, hizliTest: hizli
    }, { kosuyorMu: c.kosuyorMu });
    let hazirlik = null;
    try { hazirlik = senaryoHazirligi(vt, o.projeId, s2.id, o.ortam.id); } catch { hazirlik = null; }
    const senaryo = senaryoGetir(vt, s2.id);
    o.kayit = { ekranId, senaryoId: s2.id, senaryoBasligi: senaryo?.baslik ?? baslik, dogrulandi: hizli.dogrulandi, hazirlik, uyarilar: s2.uyarilar };
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
    hataCevabi,
    bitis,
    dogrula,
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
      '/platform/hizli-test/hata-cevabi': () => y.hataCevabi(govde),
      '/platform/hizli-test/bitis': () => y.bitis(govde),
      '/platform/hizli-test/dogrula': () => y.dogrula(govde),
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
