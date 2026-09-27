// SERVİS TESTLERİ — HTTP uçları (sunucu-platform.mjs GET_UCLARI / POST_UCLARI'na eklenir). Belirteç denetimi, gövde
// ayrıştırma ve kasa kilidi sunucuda yapılır; burada yalnız girdi doğrulama ve proje sahipliği denetimi vardır.
// Giriş bilgisi DEĞERLERİ hiçbir yanıtta dönmez (yalnız alan adları).
import { DepoHatasi, ortamGetir, ortamlariListele } from '../veritabani/depo.mjs';
import {
  akisIceriginiDogrula, servisAkisiGetir, servisAkisiKaydet, servisAkisiSil, servisAkislariniListele, servisAkisKosulariniListele, servisAkisKosusuGetir,
  servisGetir, servisKimligiKaydet, servisKimligiSil, servisKimlikOzeti, servisKosulariniListele, servisKosusuGetir, servisleriListele,
  servisOrtamdaKosuyaDahil, servisSenaryolariniListele, servisSenaryosuGetir,
  servisSenaryosuKaydet, servisSenaryosuSil, servisSil
} from './servis-deposu.mjs';
import {
  erisimKontrolu, eskiParametreleriDonustur, girisProfiliniTestVerisineTasi, semaYenile, servisiKaydet, servisParametreleri, servisSenaryolariniKos, servisSenaryosuCalistir, soapuiAktar, soapuiOnizle, postmanAktar, postmanOnizle
} from './servis-islemleri.mjs';
import { servisIsiBaslat, servisIsiDurdur, servisIsiDurumu, servisSenaryoAtlamaNedeni } from './servis-isleri.mjs';
import { servisTekrarPlani } from '../senaryolar/veri-kosusu-plani.mjs';
import { veriKosulariniAyikla } from '../tablolar/veri-kosulari.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';

/**
 * Tek istekli servis senaryosunun çalıştırma biçimi (icerik.veriKosulari; tablolar/veri-kosulari.mjs): projenin tablolarına göre denetlenir;
 * boş / hepsi "Tek satır" ise içerikten kaldırılır (bugünkü davranış). @param {any} db @param {string} projeId @param {unknown} icerik
 */
function veriKosulariniDenetle(db, projeId, icerik) {
  if (!icerik || typeof icerik !== 'object' || Array.isArray(icerik) || !('veriKosulari' in icerik)) return icerik;
  const { veriKosulari, ...kalan } = /** @type {Record<string, unknown>} */ (icerik);
  const v = veriKosulariniAyikla(veriKosulari, tablolariListele(db, projeId));
  if (v.hatalar.length) throw new DepoHatasi(v.hatalar[0]);
  return v.ayar ? { ...kalan, veriKosulari: v.ayar } : kalan;
}
import { raporMetniniMaskele } from '../sonuclar/servis-sonuclari.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { tabanlariUygula, tabanTablosu } from './taban-adresleri.mjs';
import { restServisiKaydet, restUcuDene } from './rest-servisi.mjs';
import { oturumlariTemizle, servisAkisiCalistir, servisAkisiDenetle } from './servis-akislari.mjs';
import { servisSenaryoGorunumu } from './akis-senaryosu.mjs';
import { tabloKosuDenetimi } from '../tablolar/tablo-uclari.mjs';
import { sqlSatirSiniriOku } from '../ayarlar/kosu-ayarlari.mjs';

/**
 * Tablo değer değişikliği onayı (tablolar/tablo-etkisi.mjs): etki kipi ('onizle' = önizleme ekranı, yazmaz), güncellenecek senaryolar,
 * önizlemedeki etkinin imzası (farklıysa yazılmaz), mevcut değerleri koru. @param {Record<string, any>} g
 */
const etkiGirdisi = (g) => ({
  ...(g.etki === 'denetle' || g.etki === 'uygula' || g.etki === 'onizle' ? { etki: g.etki } : {}),
  ...(typeof g.beklenenImza === 'string' ? { beklenenImza: g.beklenenImza } : {}),
  ...(Array.isArray(g.guncellenecekler) ? { guncellenecekler: g.guncellenecekler.filter((/** @type {unknown} */ x) => typeof x === 'string') } : {}),
  ...(g.mevcutDegerleriKoru === true ? { mevcutDegerleriKoru: true } : {})
});

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Govde */

/** SoapUI dosyası büyük olabilir: bu uçlar büyük gövde sınırıyla okunur. */
export const SERVIS_BUYUK_GOVDE_UCLARI = Object.freeze(['/platform/servis/soapui/onizle', '/platform/servis/soapui/aktar', '/platform/servis/postman/onizle', '/platform/servis/postman/aktar']);

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {unknown} d */
const secimli = (d) => (d === undefined || d === null || d === '' ? undefined : kimlik(d));
/** @param {unknown} d */
const metin = (d) => (typeof d === 'string' ? d : '');

/** @param {Veritabani} vt @param {string} projeId @param {unknown} id */
function servisAl(vt, projeId, id) {
  const s = servisGetir(vt, kimlik(id, 'servisId'));
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  return s;
}

/** @param {Veritabani} vt @param {string} projeId @param {unknown} id */
function senaryoAl(vt, projeId, id) {
  const s = servisSenaryosuGetir(vt, kimlik(id, 'senaryoId'));
  if (!s || s.projeId !== projeId) throw new DepoHatasi('Servis senaryosu bulunamadı.');
  return s;
}

/** @param {unknown} d @returns {Record<string, string> | undefined} */
function metinNesnesi(d) {
  if (d === undefined) return undefined;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new DepoHatasi('Beklenen bir nesne.');
  return Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === 'string'));
}

/** @param {Veritabani} vt @param {string} projeId @param {unknown} id */
function akisAl(vt, projeId, id) {
  const a = servisAkisiGetir(vt, kimlik(id, 'akisId'));
  if (!a || a.projeId !== projeId) throw new DepoHatasi('Akış bulunamadı.');
  return a;
}

/** Liste görünümü: servis + senaryo sayısı + son koşu. @param {Veritabani} vt @param {import('./servis-deposu.mjs').Servis} s */
function servisOzeti(vt, s) {
  const senaryolar = servisSenaryolariniListele(vt, s.id);
  const [son] = servisKosulariniListele(vt, { servisId: s.id, sinir: 1 });
  return { ...s, senaryoSayisi: senaryolar.length, kosuyaDahilSayisi: senaryolar.filter((x) => x.kosuyaDahil).length, sonKosu: son ?? null };
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const SERVIS_GET_UCLARI = [
  // Servis koşusunda "Başarısızları tekrar çalıştır" önizlemesi (yalnız okuma): kalan çalıştırmalar ve o koşudan bu yana değişen satırlar.
  ['/platform/servis-sonuclari/tekrar-plani', (db, q) => {
    const p = servisTekrarPlani(db, kimlik(q.get('projeId'), 'projeId'), String(q.get('id') ?? ''));
    const ekler = ekGizliAdlar(db);
    return { plan: { ...p, testler: p.testler.map((t) => ({ satirId: t.satirId, senaryoId: t.senaryoId, baslik: raporMetniniMaskele(t.baslik, ekler) })) } };
  }],
  ['/platform/servisler', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    return { servisler: servisleriListele(db, projeId).map((s) => servisOzeti(db, s)) };
  }],
  ['/platform/servis', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const s = servisAl(db, projeId, q.get('id'));
    // Senaryo başına son sonuç (tabloda "Son sonuç"): koşular en yeniden eskiye gelir, ilk görülen alınır.
    // ORTAM BAŞINA son sonuç da (tabloda nokta + ortam adı + tarih); eski (ortamsız) koşular yalnız genel son sonuçta görünür.
    /** @type {Record<string, { durum: string; baslangic: string; kosuId: string; ortamId: string | null }>} */
    const sonSonuclar = {};
    /** @type {Record<string, Record<string, any>>} */
    const ortamSonuclari = {};
    for (const k of servisKosulariniListele(db, { servisId: s.id, sinir: 1000 })) {
      if (!k.senaryoId) continue;
      const kayit = { durum: k.durum, baslangic: k.baslangic, kosuId: k.id, ortamId: k.ortamId };
      if (!sonSonuclar[k.senaryoId]) sonSonuclar[k.senaryoId] = kayit;
      if (k.ortamId) {
        const o = (ortamSonuclari[k.senaryoId] ??= {});
        if (!o[k.ortamId]) o[k.ortamId] = kayit;
      }
    }
    // Akış senaryoları: akış adı, akışı bu servisten geçen başka servislerin akış senaryoları ve son sonuçları (akis-senaryosu.mjs).
    const g = servisSenaryoGorunumu(db, projeId, s.id, servisSenaryolariniListele(db, s.id), sonSonuclar, ortamSonuclari);
    // Satır başına ortam kayıtları (ekran senaryolarındaki gibi): { ortamId, tanimli, neden, kosuyaDahil, sonSonuc }.
    const ortamlar = ortamlariListele(db, projeId);
    for (const x of g.senaryolar) {
      x.ortamlar = ortamlar.map((o) => {
        const neden = servisSenaryoAtlamaNedeni(db, s, x, o);
        return { ortamId: o.id, tanimli: !neden, neden, kosuyaDahil: !neden && servisOrtamdaKosuyaDahil(x, o.id), sonSonuc: g.ortamSonuclari[x.id]?.[o.id] ?? null };
      });
    }
    return { servis: servisOzeti(db, s), senaryolar: g.senaryolar, sonSonuclar: g.sonSonuclar };
  }],
  ['/platform/servis/parametreler', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    return servisParametreleri(db, projeId, servisAl(db, projeId, q.get('id')).id);
  }],
  ['/platform/servis/kosular', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const s = servisAl(db, projeId, q.get('servisId'));
    return { kosular: servisKosulariniListele(db, { servisId: s.id, senaryoId: secimli(q.get('senaryoId')), sinir: Number(q.get('sinir')) || 200 }) };
  }],
  ['/platform/servis/kosu', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const k = servisKosusuGetir(db, kimlik(q.get('id')));
    if (!k || k.projeId !== projeId) throw new DepoHatasi('Koşu kaydı bulunamadı.');
    return { kosu: k };
  }],
  // Canlı panel: arka plandaki koşunun durumu (adımlar, maskeli istek / yanıt).
  ['/platform/servis/is', (db, q) => ({ is: servisIsiDurumu(kimlik(q.get('projeId'), 'projeId'), kimlik(q.get('id'))) })],
  // Ayarlar > Servis taban adresleri: servis × ortam tablosu (adlandırılmış taban adresler dahil).
  ['/platform/servis-tabanlari', (db, q) => tabanTablosu(db, kimlik(q.get('projeId'), 'projeId'))],
  ['/platform/servis-kimlikleri', (db, q) => ({ profiller: servisKimlikOzeti(db, kimlik(q.get('projeId'), 'projeId')) })],
  // Servis akışları (proje düzeyi): liste (adım sayısı, son koşu, kullanan servisler), ayrıntı (+ denetim hataları), koşular.
  ['/platform/servis-akislari', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const servisler = servisleriListele(db, projeId);
    return { akislar: servisAkislariniListele(db, projeId).map((a) => ({
      ...a, adimSayisi: a.icerik.adimlar.length, sonKosu: servisAkisKosulariniListele(db, { projeId, akisId: a.id, sinir: 1 })[0] ?? null,
      kullananServisler: servisler.filter((s) => s.ayarlar.oturumAkisi === a.id).map((s) => ({ id: s.id, ad: s.ad }))
    })) };
  }],
  ['/platform/servis-akisi', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const akis = akisAl(db, projeId, q.get('id'));
    return { akis, hatalar: servisAkisiDenetle(db, projeId, akis.icerik) };
  }],
  ['/platform/servis-akisi/kosular', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    return { kosular: servisAkisKosulariniListele(db, { projeId, akisId: secimli(q.get('akisId')), sinir: Number(q.get('sinir')) || 100 }) };
  }],
  ['/platform/servis-akisi/kosu', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const k = servisAkisKosusuGetir(db, kimlik(q.get('id')));
    if (!k || k.projeId !== projeId) throw new DepoHatasi('Akış koşusu bulunamadı.');
    return { kosu: k };
  }]
];

/** @type {Array<[string, (db: Veritabani, g: Govde) => Record<string, unknown> | Promise<Record<string, unknown>>]>} */
export const SERVIS_POST_UCLARI = [
  // Erişim kontrolü: TEST ortamına WSDL isteği atar (arayüz kullanıcıya sorarak çağırır).
  ['/platform/servis/erisim', async (db, g) => erisimKontrolu(db, kimlik(g.projeId, 'projeId'), {
    ortamId: kimlik(g.ortamId, 'ortamId'), yol: metin(g.yol), adresler: metinNesnesi(g.adresler), tabanlar: metinNesnesi(g.tabanlar),
    ...(typeof g.tlsDogrulama === 'boolean' ? { tlsDogrulama: g.tlsDogrulama } : {})
  })],
  ['/platform/servis/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const id = servisiKaydet(db, projeId, {
      id: secimli(g.id), anahtar: metin(g.anahtar), ad: metin(g.ad), yol: metin(g.yol),
      ...(g.soapSurumu === '1.2' || g.soapSurumu === '1.1' ? { soapSurumu: g.soapSurumu } : {}),
      ...(g.adresler !== undefined ? { adresler: metinNesnesi(g.adresler) } : {}),
      ...(g.tabanlar !== undefined ? { tabanlar: metinNesnesi(g.tabanlar) } : {}),
      ...(Array.isArray(g.secilenOperasyonlar) ? { secilenOperasyonlar: g.secilenOperasyonlar.filter((/** @type {unknown} */ x) => typeof x === 'string') } : {}),
      ...(typeof g.kimlikProfili === 'string' ? { kimlikProfili: g.kimlikProfili } : {}),
      ...(g.tarihKurallari !== undefined ? { tarihKurallari: metinNesnesi(g.tarihKurallari) } : {}),
      ...(g.veriProfilleri !== undefined ? { veriProfilleri: metinNesnesi(g.veriProfilleri) } : {}),
      ...(Array.isArray(g.yalnizTestOperasyonlari) ? { yalnizTestOperasyonlari: g.yalnizTestOperasyonlari } : {}),
      ...(typeof g.tlsDogrulama === 'boolean' ? { tlsDogrulama: g.tlsDogrulama } : {}),
      ...(g.durum === 'etkin' || g.durum === 'devre_disi' ? { durum: g.durum } : {}),
      ...(g.alanVarsayilanlari !== undefined ? { alanVarsayilanlari: g.alanVarsayilanlari } : {}),
      ...(g.alanZorunluluklari !== undefined ? { alanZorunluluklari: g.alanZorunluluklari } : {}),
      ...(g.ekAlanlar !== undefined ? { ekAlanlar: g.ekAlanlar } : {}),
      ...(g.alanListeleri !== undefined ? { alanListeleri: g.alanListeleri } : {}),
      ...(g.alanBaglari !== undefined ? { alanBaglari: g.alanBaglari } : {}),
      ...(g.oturumAkisi !== undefined ? { oturumAkisi: g.oturumAkisi === null || g.oturumAkisi === '' ? null : kimlik(g.oturumAkisi, 'oturumAkisi') } : {}),
      erisimKimligi: typeof g.erisimKimligi === 'string' ? g.erisimKimligi : undefined
    });
    return { id };
  }],
  // WSDL şemasını yeniden al (TEST'e istek; arayüz kullanıcıya sorarak çağırır).
  ['/platform/servis/sema/yenile', async (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    return semaYenile(db, projeId, { servisId: servisAl(db, projeId, g.servisId).id, ortamId: kimlik(g.ortamId, 'ortamId') });
  }],
  ['/platform/servis/sil', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const s = servisAl(db, projeId, g.id);
    if (g.onay !== true) return { onayGerekli: true, senaryoSayisi: servisSenaryolariniListele(db, s.id).length, kosuSayisi: servisKosulariniListele(db, { servisId: s.id, sinir: 1000 }).length };
    return { silindi: servisSil(db, s.id) };
  }],
  ['/platform/servis/senaryo/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const s = servisAl(db, projeId, g.servisId);
    if (g.id) senaryoAl(db, projeId, g.id);
    const id = servisSenaryosuKaydet(db, {
      id: secimli(g.id), projeId, servisId: s.id, baslik: metin(g.baslik), icerik: veriKosulariniDenetle(db, projeId, g.icerik),
      ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {}),
      ...(typeof g.kosuyaDahil === 'boolean' ? { kosuyaDahil: g.kosuyaDahil } : {})
    });
    return { id };
  }],
  // Koşuya dahil / hariç (toplu): senaryoların yalnız bu işareti değişir. ortamId verilirse YALNIZ o ortamda (ekran
  // senaryolarındaki gibi ortam başına; diğer ortamların o anki değeri ezme olarak yazılır, genel değer "en az bir ortamda koşuda"
  // olur); verilmezse tüm ortamlarda (ortam ezmeleri silinir). Senaryonun o ortamda koşmadığı (kapsam / tanım) durumda atlanır.
  ['/platform/servis/senaryo/kosuya-dahil', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (!Array.isArray(g.idler) || !g.idler.length) throw new DepoHatasi('"idler" boş olamaz.');
    if (typeof g.dahil !== 'boolean') throw new DepoHatasi('"dahil" true ya da false olmalıdır.');
    const ortam = secimli(g.ortamId) ? ortamGetir(db, kimlik(g.ortamId, 'ortamId')) : null;
    if (g.ortamId && (!ortam || ortam.projeId !== projeId)) throw new DepoHatasi('Ortam bulunamadı.');
    const senaryolar = g.idler.map((/** @type {unknown} */ id) => senaryoAl(db, projeId, id));
    const ortamlar = ortam ? ortamlariListele(db, projeId) : [];
    let guncellenen = 0;
    db.islem(() => {
      for (const x of senaryolar) {
        const { kosuOrtamlari: _eski, ...icerik } = /** @type {Record<string, unknown>} */ (x.icerik);
        if (!ortam) {
          servisSenaryosuKaydet(db, { id: x.id, projeId, servisId: x.servisId, baslik: x.baslik, kapsam: x.kapsam, kosuyaDahil: g.dahil, icerik: { ...icerik, kosuOrtamlari: null } });
          guncellenen++;
          continue;
        }
        const servis = servisGetir(db, x.servisId);
        if (!servis) continue;
        const tanimlilar = ortamlar.filter((o) => !servisSenaryoAtlamaNedeni(db, servis, x, o));
        if (!tanimlilar.some((o) => o.id === ortam.id) || servisOrtamdaKosuyaDahil(x, ortam.id) === g.dahil) continue;
        /** @type {Record<string, boolean>} */
        const yeni = {};
        for (const o of tanimlilar) yeni[o.id] = o.id === ortam.id ? g.dahil : servisOrtamdaKosuyaDahil(x, o.id);
        const genel = Object.values(yeni).some(Boolean);
        servisSenaryosuKaydet(db, { id: x.id, projeId, servisId: x.servisId, baslik: x.baslik, kapsam: x.kapsam, kosuyaDahil: genel, icerik: { ...icerik, kosuOrtamlari: yeni } });
        guncellenen++;
      }
    });
    return { guncellenen };
  }],
  ['/platform/servis/senaryo/sil', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    return { silindi: servisSenaryosuSil(db, senaryoAl(db, projeId, g.id).id) };
  }],
  // Dene: kayıtlı senaryo ya da kaydedilmemiş taslak; YALNIZ test ortamında (servis-islemleri denetler).
  ['/platform/servis/senaryo/dene', async (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const s = servisAl(db, projeId, g.servisId);
    return { sonuc: await servisSenaryosuCalistir(db, projeId, {
      servisId: s.id, ortamId: kimlik(g.ortamId, 'ortamId'), tur: 'dene',
      ...(g.senaryoId ? { senaryoId: senaryoAl(db, projeId, g.senaryoId).id } : { taslak: { baslik: metin(g.baslik) || 'Taslak', icerik: g.icerik } })
    }) };
  }],
  // Canlı panel: seçilen senaryoları arka planda koşar (hemen döner); durum /platform/servis/is ile sorulur.
  ['/platform/servis/is/baslat', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const s = servisAl(db, projeId, g.servisId);
    if (g.taslak && typeof g.taslak === 'object') {
      return { is: servisIsiBaslat(db, projeId, { servisId: s.id, ortamId: kimlik(g.ortamId, 'ortamId'), taslak: { baslik: metin(g.taslak.baslik) || 'Taslak', icerik: g.taslak.icerik } }) };
    }
    // Başarısızları tekrar çalıştır: { kaynakKosuId: "s-…", veri?: 'guncel' | 'kosudaki' } — kalan çalıştırmalar sunucunun kaydından kurulur.
    if (g.tekrar !== undefined && g.tekrar !== null) {
      const t = /** @type {Record<string, unknown>} */ (g.tekrar && typeof g.tekrar === 'object' ? g.tekrar : {});
      if (typeof t.kaynakKosuId !== 'string' || !/^s-[A-Za-z0-9_-]{1,100}$/.test(t.kaynakKosuId)) throw new DepoHatasi('"tekrar.kaynakKosuId" geçersiz.');
      if (t.veri !== undefined && t.veri !== 'guncel' && t.veri !== 'kosudaki') throw new DepoHatasi('"tekrar.veri" "guncel" ya da "kosudaki" olmalıdır.');
      return { is: servisIsiBaslat(db, projeId, { servisId: s.id, ortamId: kimlik(g.ortamId, 'ortamId'), tekrar: { kaynakKosuId: t.kaynakKosuId, ...(t.veri ? { veri: String(t.veri) } : {}) } }) };
    }
    if (!Array.isArray(g.senaryoIdleri)) throw new DepoHatasi('"senaryoIdleri" bir dizi olmalıdır.');
    return { is: servisIsiBaslat(db, projeId, { servisId: s.id, ortamId: kimlik(g.ortamId, 'ortamId'), senaryoIdleri: g.senaryoIdleri.map((/** @type {unknown} */ x) => kimlik(x, 'senaryoId')) }) };
  }],
  ['/platform/servis/is/durdur', (db, g) => servisIsiDurdur(kimlik(g.projeId, 'projeId'), kimlik(g.id), g.senaryoId ? kimlik(g.senaryoId, 'senaryoId') : undefined)],
  ['/platform/servis/kos', async (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const s = servisAl(db, projeId, g.servisId);
    const idler = Array.isArray(g.senaryoIdleri) ? g.senaryoIdleri.map((/** @type {unknown} */ x) => senaryoAl(db, projeId, x).id) : undefined;
    return { kosu: await servisSenaryolariniKos(db, projeId, { servisId: s.id, ortamId: kimlik(g.ortamId, 'ortamId'), ...(idler ? { senaryoIdleri: idler } : {}) }) };
  }],
  ['/platform/servis-kimligi/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const degerler = metinNesnesi(g.degerler) ?? {};
    return { id: servisKimligiKaydet(db, { projeId, ad: metin(g.ad), ortamId: secimli(g.ortamId) ?? null, degerler }) };
  }],
  // Eski servis giriş profilini test verisine taşı (onay: false → yalnız önizleme).
  ['/platform/servis-kimligi/test-verisine-tasi', (db, g) => girisProfiliniTestVerisineTasi(db, kimlik(g.projeId, 'projeId'), {
    ad: metin(g.ad), onay: g.onay === true, ...(Array.isArray(g.guncellenecekler) ? { guncellenecekler: g.guncellenecekler.filter((/** @type {unknown} */ x) => typeof x === 'string') } : {}),
    ...(typeof g.beklenenImza === 'string' ? { beklenenImza: g.beklenenImza } : {})
  }, tabloKosuDenetimi())],
  ['/platform/servis-kimligi/sil', (db, g) => ({ silindi: servisKimligiSil(db, kimlik(g.projeId, 'projeId'), metin(g.ad)) })],
  // Akış kaydı: yapısal + anlamsal denetim (servis / senaryo projede; ${akis:X} önceki adımda okunuyor) geçmeden kaydedilmez.
  ['/platform/servis-akisi/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const id = secimli(g.id);
    const mevcut = id ? akisAl(db, projeId, id) : undefined;
    const tur = g.tur === 'oturum' || g.tur === 'akis' ? g.tur : (mevcut?.tur ?? 'akis');
    const hatalar = servisAkisiDenetle(db, projeId, akisIceriginiDogrula(g.icerik, tur, { satirSiniri: sqlSatirSiniriOku(db) }));
    if (hatalar.length) throw new DepoHatasi(hatalar.join(' '));
    const yeniId = servisAkisiKaydet(db, {
      id, projeId, baslik: metin(g.baslik), tur,
      ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {}),
      ...(typeof g.kosuyaDahil === 'boolean' ? { kosuyaDahil: g.kosuyaDahil } : {}), icerik: g.icerik
    });
    oturumlariTemizle(yeniId);
    return { id: yeniId };
  }],
  // Oturum akışı bir servise atanmışsa silinmez (önce servisten kaldırılmalı).
  ['/platform/servis-akisi/sil', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    const a = akisAl(db, projeId, g.id);
    const kullanan = servisleriListele(db, projeId).filter((s) => s.ayarlar.oturumAkisi === a.id).map((s) => s.ad);
    if (kullanan.length) throw new DepoHatasi(`"${a.baslik}" şu servislerin oturum akışı: ${kullanan.join(', ')}. Önce servislerden kaldırın.`);
    oturumlariTemizle(a.id);
    return { silindi: servisAkisiSil(db, a.id) };
  }],
  // Dene: kayıtlı ya da taslak akış; YALNIZ test ortamında. Koş: kapsam ortama uymalı (canlıyı yalnız kullanıcı, onayla başlatır).
  ['/platform/servis-akisi/dene', async (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    return { sonuc: await servisAkisiCalistir(db, projeId, {
      ortamId: kimlik(g.ortamId, 'ortamId'), tur: 'dene',
      ...(g.akisId ? { akisId: akisAl(db, projeId, g.akisId).id } : {}),
      ...(g.icerik !== undefined ? { taslak: { baslik: metin(g.baslik) || 'Taslak akış', tur: g.tur === 'oturum' ? 'oturum' : 'akis', icerik: g.icerik } } : {})
    }) };
  }],
  ['/platform/servis-akisi/kos', async (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    return { sonuc: await servisAkisiCalistir(db, projeId, { akisId: akisAl(db, projeId, g.akisId).id, ortamId: kimlik(g.ortamId, 'ortamId'), tur: 'kosu' }) };
  }],
  ['/platform/servis/soapui/onizle', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (typeof g.xml !== 'string' || !g.xml) throw new DepoHatasi('SoapUI dosyası boş.');
    try {
      return { onizleme: soapuiOnizle(db, projeId, g.xml, { takim: metin(g.takim) || undefined, durum: metin(g.durum) || undefined }) };
    } catch (e) {
      if (e instanceof DepoHatasi) throw e;
      throw new DepoHatasi(/** @type {Error} */ (e).message);
    }
  }],
  // REST servisi (Adım adım > REST ve İşlemler): uçlarla kayıt (ağ isteği yok) ve isteğe bağlı "Dene" (yalnız TEST, kullanıcı onayıyla).
  ['/platform/servis/rest/kaydet', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    return restServisiKaydet(db, projeId, {
      id: secimli(g.id), anahtar: metin(g.anahtar), ad: metin(g.ad), uclar: Array.isArray(g.uclar) ? g.uclar : [],
      ...(g.tabanlar !== undefined ? { tabanlar: metinNesnesi(g.tabanlar) } : {}),
      ...(typeof g.tlsDogrulama === 'boolean' ? { tlsDogrulama: g.tlsDogrulama } : {}),
      ...(g.alanBaglari !== undefined ? { alanBaglari: g.alanBaglari } : {}),
      ...(g.alanZorunluluklari !== undefined ? { alanZorunluluklari: g.alanZorunluluklari } : {}),
      ...(g.tarihKurallari !== undefined ? { tarihKurallari: metinNesnesi(g.tarihKurallari) } : {}),
      senaryolar: Array.isArray(g.senaryolar) ? g.senaryolar.filter((/** @type {unknown} */ x) => typeof x === 'string') : [],
      ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {})
    });
  }],
  ['/platform/servis/rest/dene', async (db, g) => restUcuDene(db, kimlik(g.projeId, 'projeId'), {
    ortamId: kimlik(g.ortamId, 'ortamId'), ...(typeof g.taban === 'string' ? { taban: g.taban } : {}), uc: g.uc,
    ...(typeof g.tlsDogrulama === 'boolean' ? { tlsDogrulama: g.tlsDogrulama } : {})
  })],
  // Taban adresleri toplu düzenle: onay yoksa yalnız etki önizlemesi; onay: true ile yazılır. Ağ isteği yok.
  ['/platform/servis-tabanlari/uygula', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (!g.degisiklikler || typeof g.degisiklikler !== 'object' || Array.isArray(g.degisiklikler)) throw new DepoHatasi('"degisiklikler" bir nesne olmalıdır.');
    return tabanlariUygula(db, projeId, { degisiklikler: g.degisiklikler, onay: g.onay === true });
  }],
  // Postman koleksiyonu (REST): önizleme (gizli değişken DEĞERLERİ dönmez) ve kullanıcı seçimleriyle aktarım. Ağ isteği yok.
  ['/platform/servis/postman/onizle', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (typeof g.koleksiyon !== 'string' || !g.koleksiyon) throw new DepoHatasi('Postman koleksiyon dosyası boş.');
    try {
      return { onizleme: postmanOnizle(db, projeId, { koleksiyon: g.koleksiyon, ...(typeof g.ortam === 'string' && g.ortam ? { ortam: g.ortam } : {}) }) };
    } catch (e) {
      if (e instanceof DepoHatasi) throw e;
      throw new DepoHatasi(/** @type {Error} */ (e).message);
    }
  }],
  ['/platform/servis/postman/aktar', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (typeof g.koleksiyon !== 'string' || !g.koleksiyon) throw new DepoHatasi('Postman koleksiyon dosyası boş.');
    const metinler = (/** @type {unknown} */ d) => (Array.isArray(d) ? d.filter((x) => typeof x === 'string') : undefined);
    try {
      return postmanAktar(db, projeId, {
        koleksiyon: g.koleksiyon, ...(typeof g.ortam === 'string' && g.ortam ? { ortam: g.ortam } : {}),
        klasorler: metinler(g.klasorler) ?? [], tabloAdi: metin(g.tabloAdi),
        gizliler: metinler(g.gizliler), sifreliKaydet: metinler(g.sifreliKaydet) ?? [], akisDegiskenleri: metinler(g.akisDegiskenleri) ?? [],
        degerOrtami: secimli(g.degerOrtami) ?? null, tabanOrtami: secimli(g.tabanOrtami) ?? null,
        ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {}), ...etkiGirdisi(g)
      }, tabloKosuDenetimi());
    } catch (e) {
      if (e instanceof DepoHatasi) throw e;
      throw new DepoHatasi(/** @type {Error} */ (e).message);
    }
  }],
  ['/platform/servis/soapui/aktar', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (typeof g.xml !== 'string' || !g.xml) throw new DepoHatasi('SoapUI dosyası boş.');
    try {
      return soapuiAktar(db, projeId, {
        xml: g.xml, takim: metin(g.takim), durum: metin(g.durum), servis: metin(g.servis),
        erisimKimligi: typeof g.erisimKimligi === 'string' ? g.erisimKimligi : undefined,
        ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {}),
        girisEkle: g.girisEkle === true,
        // Kullanıcının önizlemedeki seçimleri (yeni bağlama modeli; soapui-aktarimi.mjs).
        ...(g.ozellikler !== undefined ? { ozellikler: metinNesnesi(g.ozellikler) } : {}),
        ...(typeof g.tabloAdi === 'string' ? { tabloAdi: g.tabloAdi } : {}),
        ...(g.degerOrtami ? { degerOrtami: kimlik(g.degerOrtami, 'degerOrtami') } : {}),
        ...(Array.isArray(g.gizliler) ? { gizliler: g.gizliler.filter((/** @type {unknown} */ x) => typeof x === 'string') } : {}),
        ...(Array.isArray(g.sifreliKaydet) ? { sifreliKaydet: g.sifreliKaydet.filter((/** @type {unknown} */ x) => typeof x === 'string') } : {}),
        ...(Array.isArray(g.baglar) ? { baglar: g.baglar.filter((/** @type {unknown} */ x) => typeof x === 'string') } : {}), ...etkiGirdisi(g)
      }, tabloKosuDenetimi());
    } catch (e) {
      if (e instanceof DepoHatasi) throw e;
      throw new DepoHatasi(/** @type {Error} */ (e).message);
    }
  }],
  // Eski parametre eşlemesi (veriProfilleri) → yeni bağlama modeli: onay yoksa yalnız plan; onayla dönüştürür.
  ['/platform/servis/eski-parametreler/donustur', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    return eskiParametreleriDonustur(db, projeId, { servisId: servisAl(db, projeId, g.servisId).id, onay: g.onay === true });
  }]
];
