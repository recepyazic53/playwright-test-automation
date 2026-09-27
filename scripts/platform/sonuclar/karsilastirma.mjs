// YAN YANA KOŞU KARŞILAŞTIRMASI (yalnız okuma; kasa açık olmalı — sunucu denetler): iki ekran koşusu (Sonuçlar) ya da iki servis /
// akış koşusu (Servis sonuçları) için özet (A | B | fark), senaryo eşlemesi ve değişim sınıfları (karsilastirma-hesabi.mjs),
// bir senaryonun adım adım farkı ve HTML karşılaştırma raporu.
//   - Ekran: senaryo = koşudaki test sonucu (anahtar: senaryo anahtarı, yoksa ürün + başlık); adım = adim_sonuclari; iki tarafın
//     ekran görüntüleri (şifreli medya; arayüz /platform/medya/<id> ile gösterir), hata farkı (Beklenen / Görülen), koşuda
//     yakalanan mesajlar farkı.
//   - Servis: servis koşusunda senaryo = servis senaryosu, adım = isteği (HTTP kodu, kontrol sonuçları); akış koşusunda senaryo =
//     akış senaryosu, adımlar = akışın istekleri. İstek / yanıt gövdesi, başlıklar ve okunan değerler HİÇ dönmez.
//   - Maskeleme her yerde: hata / kontrol / yakalanan mesaj metinleri html-rapor.mjs > raporMaskeleyici ile (bilinen gizli değerler,
//     adı gizli alanlar, uzun rakam dizileri, e-posta, sorgu dizesi); başlık ve adım adlarında bilinen gizli değerler.
// Uçlar (GET): /platform/sonuclar/karsilastir, /platform/sonuclar/karsilastir/senaryo, /platform/sonuclar/karsilastir/adaylar
// (tur=ekran|servis). HTML rapor: /platform/sonuclar/html-rapor?...&b=<koşu B> → karsilastirmaRaporuOlustur.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).
import { DepoHatasi, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { kosuDetayi, kosulariHesapIcinOku, sonucDetayi } from '../veritabani/sonuc-deposu.mjs';
import { servisAkisKosusuGetir, servisKosusuGetir } from '../servisler/servis-deposu.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { sayilariTopla } from './hesaplama.mjs';
import { beklenenGorulenCikar } from './siniflandirma.mjs';
import { servisSonucKosusu, servisSonucOzeti } from './servis-sonuclari.mjs';
import {
  adMaskeleyici, bilinenGizliDegerler, goruntuleriCoz, ilkSatirlar, karsilastirmaRaporuUret, raporDosyaAdi, raporGoruntuSiniriBayt, raporMaskeleyici
} from './html-rapor.mjs';
import { adimlariKarsilastir, kontrolleriKarsilastir, ozetFarki, senaryolariKarsilastir, yakalananlariKarsilastir } from './karsilastirma-hesabi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ basarili: number; kalan: number; atlanan: number; durduruldu: number }} Sayilar
 * @typedef {{ id: string; tur: 'ekran' | 'servis'; kosuTuru: string; kapsam: string; kapsamAnahtari: string; baslangic: string | null;
 *   bitis: string | null; sureMs: number | null; ortamId: string | null; ortam: string | null; durum: string | null; sayilar: Sayilar;
 *   toplam: number; oran: number | null }} KosuOzeti
 * @typedef {{ metin: (m: unknown) => string; ad: (m: unknown) => string }} Maske
 */

const EN_COK_ADAY = 300;
const ADRES_YERINE = '‹ortam adresi›';

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {URLSearchParams} q @returns {'ekran' | 'servis'} */
const turAl = (q) => (q.get('tur') === 'servis' ? 'servis' : 'ekran');
/** @param {number} basarili @param {number} payda */
const oranHesapla = (basarili, payda) => (payda ? Math.round((basarili / payda) * 100) : null);
/** @param {string | null | undefined} d */
const durumu = (d) => (d === 'atlandi' ? 'atlanan' : String(d ?? ''));

/** Maskeleyiciler (arayüz için; ortam adresi gizlenmez — koşu ayrıntısıyla aynı). @param {Veritabani} vt @param {string} projeId @returns {Maske} */
function maskeHazirla(vt, projeId) {
  const gizliDegerler = bilinenGizliDegerler(vt, projeId);
  const ekAdlar = ekGizliAdlar(vt);
  return { metin: raporMaskeleyici({ adres: true, gizliDegerler, ekAdlar }, null), ad: adMaskeleyici(gizliDegerler) };
}

/** @param {Veritabani} vt @param {string} projeId */
const ortamHaritasi = (vt, projeId) => new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o]));

/** Servis satırının hata metni: istek hatası, yoksa kalan kontroller. @param {Record<string, any>} s */
function servisHataMetni(s) {
  if (s.hata) return String(s.hata);
  const kalan = Array.isArray(s.kontroller) ? s.kontroller.filter((k) => k && !k.gecti) : [];
  if (kalan.length) return kalan.map((k) => `${k.tur === 'veya' ? 'Şunlardan biri (VEYA)' : k.ad ?? ''}${k.aciklama ? ` — ${k.aciklama}` : ''}`).join('\n');
  return '';
}

/** Kontrol ağacını maskeler (ad, açıklama). @param {unknown} liste @param {Maske} m @returns {any[]} */
function kontrolleriMaskele(liste, m) {
  return (Array.isArray(liste) ? liste : []).filter((k) => k && typeof k === 'object').map((k) => ({
    ad: m.ad(k.ad ?? ''), tur: typeof k.tur === 'string' ? k.tur : '', gecti: k.gecti === true,
    aciklama: typeof k.aciklama === 'string' && k.aciklama ? m.metin(k.aciklama) : '',
    ...(Array.isArray(k.alt) && k.alt.length ? { alt: kontrolleriMaskele(k.alt, m) } : {})
  }));
}

// ---------------------------------------------------------------------------------------
// Koşu tarafları (normalleştirilmiş)
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} projeId @param {string} id @param {Map<string, { ad: string }>} ortamlar @param {Maske} m */
function ekranKosusu(vt, projeId, id, ortamlar, m) {
  const d = kosuDetayi(vt, kimlik(id));
  if (!d || d.kosu.projeId !== projeId) throw new DepoHatasi('Koşu bulunamadı.');
  const k = d.kosu;
  const sayilar = { basarili: k.basarili, kalan: k.basarisiz, atlanan: k.atlanan, durduruldu: k.durduruldu };
  const kapsam = k.tur === 'tam' ? `tam · ${k.kapsam ?? 'Genel'}` : 'tekil';
  /** @type {KosuOzeti} */
  const kosu = {
    id: k.id, tur: 'ekran', kosuTuru: k.tur, kapsam, kapsamAnahtari: kapsam, baslangic: k.baslangic, bitis: k.bitis,
    sureMs: k.bitis ? Math.max(0, Date.parse(k.bitis) - Date.parse(k.baslangic)) : null,
    ortamId: k.ortamId, ortam: k.ortamId ? ortamlar.get(k.ortamId)?.ad ?? null : null, durum: k.durum, sayilar,
    toplam: k.basarili + k.basarisiz + k.atlanan + k.durduruldu, oran: oranHesapla(k.basarili, k.basarili + k.basarisiz + k.atlanan)
  };
  const senaryolar = d.sonuclar.map((x) => ({
    anahtar: x.senaryoAnahtari || `${x.urunAnahtari}::${x.senaryoBaslik}`, baslik: m.ad(x.senaryoBaslik), grup: m.ad(x.urun),
    durum: x.durum, sureMs: x.sureMs, ref: x.id, hataKalibi: x.hataKalibi ? m.metin(x.hataKalibi) : null, gorsel: x.ekranGoruntusuSayisi
  }));
  return { kosu, senaryolar };
}

/** @param {Veritabani} vt @param {string} projeId @param {string} id @param {Maske} m */
function servisKosusu(vt, projeId, id, m) {
  const r = servisSonucKosusu(vt, new URLSearchParams({ projeId, id: kimlik(id) }));
  const k = /** @type {Record<string, any>} */ (r.kosu);
  const sayilar = { basarili: Number(k.basarili) || 0, kalan: (Number(k.basarisiz) || 0) + (Number(k.hata) || 0), atlanan: Number(k.atlanan) || 0, durduruldu: Number(k.durduruldu) || 0 };
  const akis = k.tur === 'akis';
  /** @type {KosuOzeti} */
  const kosu = {
    id: String(k.id), tur: 'servis', kosuTuru: akis ? 'akis' : 'servis', kapsam: m.ad(k.baslik), kapsamAnahtari: `${k.tur}:${k.kaynakId ?? k.baslik}`,
    baslangic: k.baslangic ?? null, bitis: k.bitis ?? null, sureMs: typeof k.sureMs === 'number' ? k.sureMs : null, ortamId: k.ortamId ?? null,
    ortam: k.ortam && k.ortam !== '—' ? String(k.ortam) : null, durum: null, sayilar, toplam: Number(k.toplam) || 0,
    oran: oranHesapla(sayilar.basarili, sayilar.basarili + sayilar.kalan)
  };
  if (akis) {
    const a = servisAkisKosusuGetir(vt, String(id).slice(2));
    const baslik = String(a?.baslik || k.baslik || 'Akış');
    return {
      kosu,
      senaryolar: [{
        anahtar: `akis:${baslik}`, baslik: m.ad(baslik), grup: m.ad(k.baslik), durum: a?.sonuc?.durduruldu ? 'durduruldu' : String(a?.durum ?? (sayilar.kalan ? 'basarisiz' : 'basarili')),
        sureMs: kosu.sureMs, ref: kosu.id, httpKodu: null
      }]
    };
  }
  const senaryolar = r.senaryolar.map((x) => ({
    anahtar: x.senaryoId ? `id:${x.senaryoId}` : `baslik:${x.baslik}`, baslik: m.ad(x.baslik), grup: m.ad(k.baslik),
    durum: x.durduruldu ? 'durduruldu' : durumu(x.durum), sureMs: x.sureMs, ref: x.satirId, httpKodu: x.durumKodu
  }));
  return { kosu, senaryolar };
}

// ---------------------------------------------------------------------------------------
// GET /platform/sonuclar/karsilastir?projeId=&tur=ekran|servis&a=&b=
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {URLSearchParams} q @param {Maske} [maske] */
export function karsilastirmaVerisi(vt, q, maske) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const tur = turAl(q);
  const aId = kimlik(q.get('a'), 'a');
  const bId = kimlik(q.get('b'), 'b');
  if (aId === bId) throw new DepoHatasi('Bir koşu kendisiyle karşılaştırılamaz; başka bir koşu seçin.');
  const m = maske ?? maskeHazirla(vt, projeId);
  const ortamlar = tur === 'ekran' ? ortamHaritasi(vt, projeId) : new Map();
  const A = tur === 'servis' ? servisKosusu(vt, projeId, aId, m) : ekranKosusu(vt, projeId, aId, ortamlar, m);
  const B = tur === 'servis' ? servisKosusu(vt, projeId, bId, m) : ekranKosusu(vt, projeId, bId, ortamlar, m);
  if (tur === 'servis' && A.kosu.kosuTuru !== B.kosu.kosuTuru) {
    throw new DepoHatasi('Servis koşusu yalnız bir servis koşusuyla, akış koşusu yalnız bir akış koşusuyla karşılaştırılabilir.');
  }
  const k = senaryolariKarsilastir(A.senaryolar, B.senaryolar);
  return {
    tur, a: A.kosu, b: B.kosu, fark: ozetFarki(A.kosu, B.kosu),
    senaryolar: k.senaryolar.map((s) => ({ ...s, anahtar: m.ad(s.anahtar) })), sayim: k.sayim, degisen: k.degisen
  };
}

// ---------------------------------------------------------------------------------------
// GET /platform/sonuclar/karsilastir/senaryo?projeId=&tur=&a=<sonuç / satır>&b=  (biri boş olabilir)
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} projeId @param {string} ref @param {Maske} m */
function ekranSonucTarafi(vt, projeId, ref, m) {
  const t = sonucDetayi(vt, kimlik(ref));
  if (!t || t.projeId !== projeId) throw new DepoHatasi('Sonuç bulunamadı.');
  const hata = t.hataMesaji ? m.metin(t.hataMesaji) : '';
  return {
    id: t.id, kosuId: t.kosuId, durum: t.durum, sureMs: t.sureMs, hataKategorisi: t.hataKategorisi,
    hata: hata ? ilkSatirlar(hata) : null, beklenenGorulen: hata ? beklenenGorulenCikar(hata) : null,
    beklenenSonuc: t.beklenenSonuc ? m.metin(t.beklenenSonuc) : null,
    kalinanAdim: m.ad(t.adimlar.find((a) => a.durum === 'basarisiz')?.ad ?? '') || null,
    // Görüntüler kasada şifreli; arayüz /platform/medya/<id> ile (kasa açıkken) gösterir. Son görüntü hata anıdır.
    gorseller: t.medya.filter((x) => x.tur === 'ekran_goruntusu' && !x.yedekDisi && !x.silinme).map((x) => ({ id: x.id, ad: m.ad(x.ad) })),
    adimlar: t.adimlar.map((a) => ({ ad: m.ad(a.ad), durum: a.durum, sureMs: a.sureMs, hata: a.hataMesaji ? ilkSatirlar(m.metin(a.hataMesaji)) : null })),
    yakalanan: (t.yakalananMesajlar ?? []).map((y) => ({ kaynak: y.kaynak, kalip: m.metin(y.kalip), metin: m.metin(y.metin), sayi: y.sayi, beklenen: y.beklenen }))
  };
}

/** Servis isteği (tek satır) adımı. @param {Record<string, any>} r @param {string} ad @param {Maske} m */
function istekAdimi(r, ad, m) {
  const s = /** @type {Record<string, any>} */ (r.sonuc ?? {});
  const hata = r.durum === 'basarili' ? '' : servisHataMetni(s);
  return {
    ad: m.ad(ad), durum: s.durduruldu ? 'durduruldu' : durumu(r.durum), sureMs: Number(r.sureMs) || 0,
    httpKodu: typeof s.durumKodu === 'number' ? s.durumKodu : null, hata: hata ? ilkSatirlar(m.metin(hata)) : null,
    kontroller: kontrolleriMaskele(s.kontroller, m)
  };
}

/** @param {Veritabani} vt @param {string} projeId @param {string} ref @param {Maske} m */
function servisSonucTarafi(vt, projeId, ref, m) {
  if (/^a-/.test(ref)) {
    const r = servisSonucKosusu(vt, new URLSearchParams({ projeId, id: kimlik(ref) }));
    const k = /** @type {Record<string, any>} */ (r.kosu);
    const adimlar = r.adimlar.map((a) => {
      const satir = a.satirId ? servisKosusuGetir(vt, a.satirId) : undefined;
      const adimAdi = a.ad || a.senaryo || `${a.no}. adım`;
      if (satir && satir.projeId === projeId) return { ...istekAdimi(satir, adimAdi, m), durum: durumu(a.durum), no: a.no };
      return { ad: m.ad(adimAdi), no: a.no, durum: durumu(a.durum), sureMs: a.sureMs, httpKodu: null, hata: a.hata ? ilkSatirlar(m.metin(a.hata)) : null, kontroller: [] };
    });
    const kalan = adimlar.filter((a) => a.durum === 'basarisiz' || a.durum === 'hata');
    return {
      id: ref, durum: k.durduruldu ? 'durduruldu' : kalan.length ? 'basarisiz' : 'basarili', sureMs: typeof k.sureMs === 'number' ? k.sureMs : null, httpKodu: null,
      hata: kalan.length ? kalan.map((a) => `${a.ad}: ${a.hata ?? 'kaldı'}`).join('\n') : null, adimlar
    };
  }
  const r = servisKosusuGetir(vt, kimlik(ref));
  if (!r || r.projeId !== projeId) throw new DepoHatasi('Senaryo sonucu bulunamadı.');
  const adim = istekAdimi(r, r.baslik, m);
  return { id: r.id, durum: adim.durum, sureMs: adim.sureMs, httpKodu: adim.httpKodu, hata: adim.hata, adimlar: [adim] };
}

/** @param {Veritabani} vt @param {URLSearchParams} q */
export function karsilastirmaSenaryosu(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const tur = turAl(q);
  const aRef = q.get('a') || null;
  const bRef = q.get('b') || null;
  if (!aRef && !bRef) throw new DepoHatasi('En az bir taraf (a / b) verilmelidir.');
  const m = maskeHazirla(vt, projeId);
  if (tur === 'servis') {
    const A = aRef ? servisSonucTarafi(vt, projeId, aRef, m) : null;
    const B = bRef ? servisSonucTarafi(vt, projeId, bRef, m) : null;
    const adimlar = adimlariKarsilastir(A?.adimlar ?? [], B?.adimlar ?? []).map((s) => ({
      ...s, kontroller: kontrolleriKarsilastir(s.a?.kontroller ?? [], s.b?.kontroller ?? []),
      a: s.a && { ...s.a, kontroller: undefined }, b: s.b && { ...s.b, kontroller: undefined }
    }));
    const taraf = (/** @type {typeof A} */ t) => (t ? { id: t.id, durum: t.durum, sureMs: t.sureMs, httpKodu: t.httpKodu, hata: t.hata } : null);
    return { tur, a: taraf(A), b: taraf(B), adimlar };
  }
  const A = aRef ? ekranSonucTarafi(vt, projeId, aRef, m) : null;
  const B = bRef ? ekranSonucTarafi(vt, projeId, bRef, m) : null;
  const taraf = (/** @type {typeof A} */ t) => {
    if (!t) return null;
    const { adimlar, yakalanan, ...geri } = t;
    return { ...geri, adimSayisi: adimlar.length, yakalananSayisi: yakalanan.length };
  };
  return {
    tur, a: taraf(A), b: taraf(B),
    adimlar: adimlariKarsilastir(A?.adimlar ?? [], B?.adimlar ?? []),
    yakalanan: yakalananlariKarsilastir(A?.yakalanan ?? [], B?.yakalanan ?? [])
  };
}

// ---------------------------------------------------------------------------------------
// GET /platform/sonuclar/karsilastir/adaylar?projeId=&tur=&kosu=<referans>  — seçim diyaloğu (aynı proje; en yeniler önce)
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {URLSearchParams} q */
export function karsilastirmaAdaylari(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const tur = turAl(q);
  const kosuId = kimlik(q.get('kosu'), 'kosu');
  /** @type {Array<Omit<KosuOzeti, 'toplam'>>} */
  let kosular;
  if (tur === 'ekran') {
    const ortamlar = ortamHaritasi(vt, projeId);
    kosular = kosulariHesapIcinOku(vt, projeId).reverse().map((k) => {
      const s = sayilariTopla(Object.values(k.urunler));
      const kapsam = k.tur === 'tam' ? `tam · ${k.kapsam ?? 'Genel'}` : 'tekil';
      return {
        id: k.id, tur: /** @type {const} */ ('ekran'), kosuTuru: k.tur, kapsam, kapsamAnahtari: kapsam, baslangic: k.baslangic, bitis: k.bitis,
        sureMs: k.bitis ? Math.max(0, Date.parse(k.bitis) - Date.parse(k.baslangic)) : null, ortamId: k.ortamId,
        ortam: k.ortamId ? ortamlar.get(k.ortamId)?.ad ?? null : null, durum: k.durum,
        sayilar: { basarili: s.basarili, kalan: s.basarisiz, atlanan: s.atlanan, durduruldu: s.durduruldu },
        oran: oranHesapla(s.basarili, s.basarili + s.basarisiz + s.atlanan)
      };
    });
  } else {
    const m = { ad: adMaskeleyici(bilinenGizliDegerler(vt, projeId)), metin: (/** @type {unknown} */ x) => String(x ?? '') };
    const oz = servisSonucOzeti(vt, new URLSearchParams({ projeId }));
    kosular = /** @type {Array<Record<string, any>>} */ (oz.kosular).map((k) => {
      const sayilar = { basarili: Number(k.basarili) || 0, kalan: (Number(k.basarisiz) || 0) + (Number(k.hata) || 0), atlanan: Number(k.atlanan) || 0, durduruldu: Number(k.durduruldu) || 0 };
      return {
        id: String(k.id), tur: /** @type {const} */ ('servis'), kosuTuru: k.tur === 'akis' ? 'akis' : 'servis', kapsam: m.ad(k.baslik),
        kapsamAnahtari: `${k.tur}:${k.kaynakId ?? k.baslik}`, baslangic: k.baslangic, bitis: k.bitis, sureMs: k.sureMs, ortamId: k.ortamId ?? null,
        ortam: k.ortam && k.ortam !== '—' ? String(k.ortam) : null, durum: null, sayilar, oran: oranHesapla(sayilar.basarili, sayilar.basarili + sayilar.kalan)
      };
    });
    // Referans koşu servis sonuçlarının kendi eşlemesiyle bulunur (koşu kimliği ilk satırdır; listede de, "dene" koşusu da olsa).
    const { kosu } = servisKosusu(vt, projeId, kosuId, m);
    const { toplam, ...referans } = kosu;
    const ayni = (/** @type {typeof referans} */ k) => k.id === referans.id
      || (k.kapsamAnahtari === referans.kapsamAnahtari && k.baslangic === referans.baslangic && k.ortamId === referans.ortamId);
    return { referans, kosular: kosular.filter((k) => !ayni(k) && k.kosuTuru === referans.kosuTuru).slice(0, EN_COK_ADAY) };
  }
  const referans = kosular.find((k) => k.id === kosuId);
  if (!referans) throw new DepoHatasi('Koşu bulunamadı.');
  return { referans, kosular: kosular.filter((k) => k.id !== kosuId).slice(0, EN_COK_ADAY) };
}

// ---------------------------------------------------------------------------------------
// HTML karşılaştırma raporu: GET /platform/sonuclar/html-rapor?projeId=&tur=ekran|servis&id=<A>&b=<B>&goruntuler=1&hatalar=0|1&adres=1
// ---------------------------------------------------------------------------------------

/**
 * @param {Veritabani} vt @param {URLSearchParams} q @param {{ medyaKlasoru: string }} ortamlar
 * @returns {Promise<{ html: string; dosyaAdi: string; boyut: number; goruntu: { eklenen: number; atlanan: number; bayt: number } }>}
 */
export async function karsilastirmaRaporuOlustur(vt, q, ortamlar) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const tur = turAl(q);
  const secenekler = { goruntuler: q.get('goruntuler') === '1', hatalar: q.get('hatalar') !== '0', adres: q.get('adres') === '1' };
  const gizliDegerler = bilinenGizliDegerler(vt, projeId);
  const ekAdlar = ekGizliAdlar(vt);
  // Ham metin (rapor kendi maskeleyicisiyle, seçeneklere göre maskeler); adlar bilinen gizli değerlerle.
  /** @type {Maske} */
  const ham = { metin: (x) => String(x ?? ''), ad: adMaskeleyici(gizliDegerler) };
  const v = karsilastirmaVerisi(vt, new URLSearchParams({ projeId, tur, a: String(q.get('id') ?? ''), b: String(q.get('b') ?? '') }), ham);
  const ortamBilgisi = ortamHaritasi(vt, projeId);
  const adresler = [v.a.ortamId, v.b.ortamId].map((id) => (id ? ortamBilgisi.get(id)?.tabanUrl ?? null : null));
  /** Adres kapalıysa iki tarafın ortam adresi (ve kökeni) yer tutucuya döner. @param {string | null} m */
  const adresGizle = (m) => {
    if (!m || secenekler.adres) return m;
    let t = m;
    for (const a of adresler) {
      if (!a) continue;
      let koken = null;
      try { koken = new URL(a).origin; } catch { koken = null; }
      for (const x of [a, koken]) if (x && x.length >= 4) t = t.split(x).join(ADRES_YERINE);
    }
    return t;
  };
  // Ayrıntı yalnız değişen ve bir tarafı kalan senaryolar için (hata, kalınan adım, son ekran görüntüsü).
  /** @type {Array<Array<{ id: string; ad: string; icerikTuru: string; boyut: number }>>} */
  const medyaGruplari = [];
  /** @type {Array<[number, 'a' | 'b']>} */
  const grupYeri = [];
  const kalan = (/** @type {{ durum: string } | null} */ t) => Boolean(t && (t.durum === 'basarisiz' || t.durum === 'hata'));
  const senaryolar = v.senaryolar.map((s, i) => {
    const ayrinti = s.degisti && (kalan(s.a) || kalan(s.b));
    const taraf = (/** @type {'a' | 'b'} */ yan) => {
      const t = /** @type {Record<string, any> | null} */ (s[yan]);
      if (!t) return null;
      /** @type {{ durum: string; sureMs: number | null; hata?: string | null; kalinanAdim?: string | null; httpKodu?: number | null }} */
      const cikti = { durum: t.durum, sureMs: t.sureMs ?? null, ...(typeof t.httpKodu === 'number' ? { httpKodu: t.httpKodu } : {}) };
      if (!ayrinti || t.durum === 'basarili') return cikti;
      if (tur === 'ekran') {
        const d = sonucDetayi(vt, String(t.ref));
        if (d) {
          cikti.hata = adresGizle(d.hataMesaji);
          cikti.kalinanAdim = adresGizle(d.adimlar.find((a) => a.durum === 'basarisiz')?.ad ?? null);
          const gorseller = d.medya.filter((x) => x.tur === 'ekran_goruntusu' && !x.silinme && !x.yedekDisi);
          if (gorseller.length) {
            const son = gorseller[gorseller.length - 1];
            medyaGruplari.push([{ id: son.id, ad: son.ad, icerikTuru: son.icerikTuru, boyut: son.boyut }]);
            grupYeri.push([i, yan]);
          }
        }
      } else {
        const d = servisSonucTarafi(vt, projeId, String(t.ref), ham);
        cikti.hata = adresGizle(d.hata);
      }
      return cikti;
    };
    return { baslik: s.baslik, grup: s.grup, degisim: s.degisim, degisti: s.degisti, sureFarkiMs: s.sureFarkiMs, a: taraf('a'), b: taraf('b') };
  });
  const cozulen = await goruntuleriCoz(vt, medyaGruplari, ortamlar.medyaKlasoru, secenekler.goruntuler);
  cozulen.gruplar.forEach((g, j) => {
    const [i, yan] = grupYeri[j];
    const t = senaryolar[i][yan];
    if (t && g.length) Object.assign(t, { goruntuler: g });
  });
  const proje = projeGetir(vt, projeId)?.ad ?? '';
  const kosu = (/** @type {KosuOzeti} */ k) => ({
    etiket: [k.kapsam, k.ortam].filter(Boolean).join(' · '), baslangic: k.baslangic, bitis: k.bitis, sureMs: k.sureMs, ortam: k.ortam, kapsam: k.kapsam,
    sayilar: k.sayilar, oran: k.oran
  });
  const html = karsilastirmaRaporuUret({
    tur: tur === 'ekran' ? 'ekran' : v.a.kosuTuru === 'akis' ? 'akis' : 'servis', proje, ortamAdresi: adresler[1] ?? adresler[0],
    a: kosu(v.a), b: kosu(v.b), sayim: v.sayim, senaryolar, atlananGoruntu: cozulen.atlanan, goruntuSiniriBayt: raporGoruntuSiniriBayt(vt)
  }, { ...secenekler, ekAdlar, gizliDegerler });
  const tarih = v.b.baslangic ? new Date(v.b.baslangic) : new Date();
  return {
    html, dosyaAdi: raporDosyaAdi(proje, v.b.ortam, tarih).replace(/^nobetci-rapor-/, 'nobetci-karsilastirma-'),
    boyut: Buffer.byteLength(html, 'utf8'), goruntu: { eklenen: cozulen.eklenen, atlanan: cozulen.atlanan, bayt: cozulen.bayt }
  };
}

/** sunucu-platform.mjs GET_UCLARI'na eklenir (yalnız okuma; kasa açık olmalı — sunucu denetler). */
/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const KARSILASTIRMA_UCLARI = [
  ['/platform/sonuclar/karsilastir', (db, q) => karsilastirmaVerisi(db, q)],
  ['/platform/sonuclar/karsilastir/senaryo', karsilastirmaSenaryosu],
  ['/platform/sonuclar/karsilastir/adaylar', karsilastirmaAdaylari]
];
