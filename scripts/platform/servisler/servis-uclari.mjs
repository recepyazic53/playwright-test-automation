// SERVİS TESTLERİ — HTTP uçları (sunucu-platform.mjs GET_UCLARI / POST_UCLARI'na eklenir). Belirteç denetimi, gövde
// ayrıştırma ve kasa kilidi sunucuda yapılır; burada yalnız girdi doğrulama ve proje sahipliği denetimi vardır.
// Giriş bilgisi DEĞERLERİ hiçbir yanıtta dönmez (yalnız alan adları).
import { DepoHatasi } from '../veritabani/depo.mjs';
import {
  servisGetir, servisKimligiKaydet, servisKimligiSil, servisKimlikOzeti, servisKosulariniListele, servisKosusuGetir, servisleriListele,
  servisSenaryolariniListele, servisSenaryosuGetir, servisSenaryosuKaydet, servisSenaryosuSil, servisSil
} from './servis-deposu.mjs';
import {
  erisimKontrolu, semaYenile, servisiKaydet, servisParametreleri, servisSenaryolariniKos, servisSenaryosuCalistir, soapuiAktar, soapuiOnizle
} from './servis-islemleri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Govde */

/** SoapUI dosyası büyük olabilir: bu uçlar büyük gövde sınırıyla okunur. */
export const SERVIS_BUYUK_GOVDE_UCLARI = Object.freeze(['/platform/servis/soapui/onizle', '/platform/servis/soapui/aktar']);

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

/** Liste görünümü: servis + senaryo sayısı + son koşu. @param {Veritabani} vt @param {import('./servis-deposu.mjs').Servis} s */
function servisOzeti(vt, s) {
  const senaryolar = servisSenaryolariniListele(vt, s.id);
  const [son] = servisKosulariniListele(vt, { servisId: s.id, sinir: 1 });
  return { ...s, senaryoSayisi: senaryolar.length, kosuyaDahilSayisi: senaryolar.filter((x) => x.kosuyaDahil).length, sonKosu: son ?? null };
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const SERVIS_GET_UCLARI = [
  ['/platform/servisler', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    return { servisler: servisleriListele(db, projeId).map((s) => servisOzeti(db, s)) };
  }],
  ['/platform/servis', (db, q) => {
    const projeId = kimlik(q.get('projeId'), 'projeId');
    const s = servisAl(db, projeId, q.get('id'));
    return { servis: servisOzeti(db, s), senaryolar: servisSenaryolariniListele(db, s.id) };
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
  ['/platform/servis-kimlikleri', (db, q) => ({ profiller: servisKimlikOzeti(db, kimlik(q.get('projeId'), 'projeId')) })]
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
      id: secimli(g.id), projeId, servisId: s.id, baslik: metin(g.baslik), icerik: g.icerik,
      ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {}),
      ...(typeof g.kosuyaDahil === 'boolean' ? { kosuyaDahil: g.kosuyaDahil } : {})
    });
    return { id };
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
  ['/platform/servis-kimligi/sil', (db, g) => ({ silindi: servisKimligiSil(db, kimlik(g.projeId, 'projeId'), metin(g.ad)) })],
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
  ['/platform/servis/soapui/aktar', (db, g) => {
    const projeId = kimlik(g.projeId, 'projeId');
    if (typeof g.xml !== 'string' || !g.xml) throw new DepoHatasi('SoapUI dosyası boş.');
    const profil = g.kimlikProfili && typeof g.kimlikProfili === 'object' ? { ad: metin(g.kimlikProfili.ad), kaydet: g.kimlikProfili.kaydet === true } : undefined;
    try {
      return soapuiAktar(db, projeId, {
        xml: g.xml, takim: metin(g.takim), durum: metin(g.durum), servis: metin(g.servis),
        erisimKimligi: typeof g.erisimKimligi === 'string' ? g.erisimKimligi : undefined,
        ...(g.kapsam === 'test' || g.kapsam === 'canli' || g.kapsam === 'ikisi' ? { kapsam: g.kapsam } : {}),
        ...(profil?.ad ? { kimlikProfili: profil } : {})
      });
    } catch (e) {
      if (e instanceof DepoHatasi) throw e;
      throw new DepoHatasi(/** @type {Error} */ (e).message);
    }
  }]
];
