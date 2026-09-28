// PDF RAPORU UÇLARI (sunucu; kasa açık olmalı — gizli değer listesi kurulamazsa rapor üretilmez: maskeleme garantisi).
//   GET  /platform/rapor/secenekler?projeId=          diyalog listeleri: ekranlar, servisler, ortamlar (ad; gizli değer yok)
//   POST /platform/rapor/onizle { girdi }             → { html, onizlemeId, dosyaAdi, boyut } (HTML; saklanmaz; önizleme tek kullanımlık)
//   POST /platform/rapor/pdf { girdi, kaydet? }       → application/pdf (Content-Disposition); kaydet: true ise Raporlar'a yazılır
//   GET  /platform/raporlar?projeId=                  kaydedilmiş raporlar (Sonuçlar > Raporlar)
//   GET  /platform/rapor/indir?projeId=&id=           kaydedilmiş PDF'in aynısı (kasadan çözülür)
//   POST /platform/rapor/yeniden { projeId, id }      aynı seçimlerle, dönem bugüne kaydırılarak yeni rapor (yeni satır)
//   POST /platform/rapor/sil { projeId, id, onay }    onay: true olmadan silinmez
// girdi: { projeId, kapsam: 'ekran' | 'servis' | 'coklu-ekran' | 'coklu-servis' | 'karisik' | 'genel', id (tek öğe), ekranIdleri[] / servisIdleri[]
//   ve tumEkranlar / tumServisler (çoklu; "tümü" rapor anındaki tüm öğeler; genel: seçim yok, her zaman o anki tüm proje), donem: { tur: son7 | son14 | son30 | ozel, baslangic?, bitis? },
//   karsilastir, ortamId | null, secenekler: { hatalar, adres, goruntuler } }. İzin: mevcut HTML rapor indirmesiyle aynı (oturum token'ı + açık kasa;
//   dış istek yapılmaz, bu yüzden Ayarlar > İzinler'de ayrı izin yoktur). PDF yerel Chromium ile basılır; tüm ağ istekleri engellidir.
import { DepoHatasi, ekranModeliGetir, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { servisAkislariniListele, servisSenaryolariniListele, servisleriListele } from '../servisler/servis-deposu.mjs';
import { ekipleriListele, ogeAnahtari, raporIsaretleriniListele } from '../ayarlar/rapor-verileri.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { adMaskeleyici, bilinenGizliDegerler, dosyaAdiParcasi, goruntuleriCoz, onizlemeSakla, raporGoruntuSiniriBayt, raporMaskeleyici } from './html-rapor.mjs';
import { DONEM_TURLERI, DonemHatasi, donemiBuguneKaydir, gunAnahtari } from './donem.mjs';
import { EN_COK_OGE, donemRaporuVerisi, servisMetodu } from './donem-raporu.mjs';
import { pdfRaporHtml } from './pdf-rapor/sablon.mjs';
import { htmldenPdf, pdfSayfaSayisi } from './pdf-rapor/pdf.mjs';
import { eskiRaporlariSil, raporGetir, raporKaydet, raporPdfiniAl, raporSil, raporlariListele } from './rapor-arsivi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./donem-raporu.mjs').RaporGirdisi} RaporGirdisi */
/** @typedef {{ medyaKlasoru: string; simdi?: Date }} UcBaglami */

/** Desteklenen kapsamlar (A1: tek öğe; A2: çoklu ve karma; A3: genel). */
export const RAPOR_KAPSAMLARI = Object.freeze(['ekran', 'servis', 'coklu-ekran', 'coklu-servis', 'karisik', 'genel']);
/** Kapsamların görünen adı (hata mesajı, arşiv). */
export const KAPSAM_ADLARI = Object.freeze({
  ekran: 'Tek ekran', servis: 'Tek servis', 'coklu-ekran': 'Birden çok ekran', 'coklu-servis': 'Birden çok servis', karisik: 'Ekran + servis', genel: 'Genel'
});

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * Çoklu seçimin kimlik listesi (yinelenenler atılır; en çok EN_COK_OGE).
 * @param {unknown} d @param {string} alan @returns {string[]}
 */
function kimlikListesi(d, alan) {
  if (d === undefined || d === null) return [];
  if (!Array.isArray(d)) throw new DepoHatasi(`"${alan}" liste olmalı.`);
  const l = [...new Set(d.map((x) => kimlik(x, alan)))];
  if (l.length > EN_COK_OGE) throw new DepoHatasi(`Bir raporda en çok ${EN_COK_OGE} öğe olabilir.`);
  return l;
}

/**
 * İstek gövdesini doğrular.
 * @param {Record<string, any>} g @returns {RaporGirdisi}
 */
export function raporGirdisiDogrula(g) {
  if (!g || typeof g !== 'object') throw new DepoHatasi('Rapor seçimleri eksik.');
  const kapsam = g.kapsam;
  if (!RAPOR_KAPSAMLARI.includes(kapsam)) {
    throw new DepoHatasi(`Kapsam yalnız ${Object.values(KAPSAM_ADLARI).map((a) => `"${a}"`).join(', ')} olabilir.`);
  }
  const tek = kapsam === 'ekran' || kapsam === 'servis';
  // Genel: seçim yok (gövdedeki kimlikler yok sayılır); rapor her üretildiğinde o anki tüm öğeleri kapsar.
  const coklu = tek ? null : kapsam === 'genel' ? { ekranIdleri: [], servisIdleri: [], tumEkranlar: true, tumServisler: true } : {
    ekranIdleri: kapsam === 'coklu-servis' ? [] : kimlikListesi(g.ekranIdleri, 'ekran'), servisIdleri: kapsam === 'coklu-ekran' ? [] : kimlikListesi(g.servisIdleri, 'servis'),
    tumEkranlar: kapsam !== 'coklu-servis' && g.tumEkranlar === true, tumServisler: kapsam !== 'coklu-ekran' && g.tumServisler === true
  };
  if (coklu && kapsam !== 'genel') {
    const enAz = kapsam === 'karisik' ? 1 : 2;
    if ((kapsam === 'coklu-ekran' || kapsam === 'karisik') && !coklu.tumEkranlar && coklu.ekranIdleri.length < enAz) {
      throw new DepoHatasi(enAz === 1 ? 'En az bir ekran seçin ya da "Tüm ekranlar"ı işaretleyin.' : 'En az iki ekran seçin ya da "Tüm ekranlar"ı işaretleyin.');
    }
    if ((kapsam === 'coklu-servis' || kapsam === 'karisik') && !coklu.tumServisler && coklu.servisIdleri.length < enAz) {
      throw new DepoHatasi(enAz === 1 ? 'En az bir servis seçin ya da "Tüm servisler"i işaretleyin.' : 'En az iki servis seçin ya da "Tüm servisler"i işaretleyin.');
    }
  }
  const d = g.donem && typeof g.donem === 'object' ? g.donem : { tur: 'son14' };
  if (!DONEM_TURLERI.includes(d.tur)) throw new DepoHatasi(`Dönem yalnızca ${DONEM_TURLERI.join(', ')} olabilir.`);
  const donem = d.tur === 'ozel' ? { tur: 'ozel', baslangic: String(d.baslangic ?? ''), bitis: String(d.bitis ?? '') } : { tur: String(d.tur) };
  const s = g.secenekler && typeof g.secenekler === 'object' ? g.secenekler : {};
  const aksiyon = Number(g.aksiyonSayisi);
  return {
    projeId: kimlik(g.projeId, 'projeId'), kapsam, id: tek ? kimlik(g.id, kapsam === 'ekran' ? 'ekran' : 'servis') : '', ...(coklu ?? {}), donem,
    karsilastir: g.karsilastir !== false, ortamId: g.ortamId === null || g.ortamId === undefined || g.ortamId === '' ? null : kimlik(g.ortamId, 'ortamId'),
    secenekler: { hatalar: s.hatalar !== false, adres: s.adres === true, goruntuler: s.goruntuler === true },
    ...(Number.isInteger(aksiyon) && aksiyon >= 1 && aksiyon <= 20 ? { aksiyonSayisi: aksiyon } : {})
  };
}

/** "nobetci-rapor-<kapsam>-<ad>-<tarih>.pdf" @param {RaporGirdisi['kapsam']} kapsam @param {string} ad @param {Date} tarih */
export const pdfDosyaAdi = (kapsam, ad, tarih) => `nobetci-rapor-${kapsam}-${dosyaAdiParcasi(ad) || kapsam}-${gunAnahtari(tarih)}.pdf`;

/**
 * Rapor verisi + HTML (maskeli).
 * @param {Veritabani} vt @param {RaporGirdisi} girdi @param {UcBaglami} b
 */
export async function raporHazirla(vt, girdi, b) {
  const simdi = b.simdi ?? new Date();
  const gizliDegerler = bilinenGizliDegerler(vt, girdi.projeId);
  const ekAdlar = ekGizliAdlar(vt);
  // Ortam adresi (adres seçeneği kapalıyken metinlerde yer tutucuya dönecek adres) veriden önce gerekir.
  const ortam = girdi.ortamId ? ortamlariListele(vt, girdi.projeId).find((o) => o.id === girdi.ortamId) : null;
  const temelMaske = raporMaskeleyici({ ...girdi.secenekler, gizliDegerler, ekAdlar }, ortam?.tabanUrl ?? null);
  // Tüm ortamlar seçiliyse (tek ortam adresi yok) her ortamın adresi maskelenir — kalıba çevrilmeden ÖNCE (kalıp sayıları "#" yapar).
  const maskele = girdi.ortamId || girdi.secenekler.adres ? temelMaske : ortamAdresleriniMaskele(vt, girdi.projeId, temelMaske);
  const adMaskele = adMaskeleyici(gizliDegerler);
  let veri;
  try {
    veri = await donemRaporuVerisi(vt, girdi, {
      maskele, simdi,
      goruntuCoz: async (medya) => (await goruntuleriCoz(vt, [medya], b.medyaKlasoru, true, raporGoruntuSiniriBayt(vt))).gruplar[0]
    });
  } catch (hata) {
    if (hata instanceof DonemHatasi) throw new DepoHatasi(hata.message);
    throw hata;
  }
  const { html, baslik } = pdfRaporHtml(veri, { maskele, adMaskele });
  return { veri, html, baslik, dosyaAdi: pdfDosyaAdi(girdi.kapsam, veri.oge.ad, simdi) };
}

/**
 * @param {Veritabani} vt @param {string} projeId @param {(m: unknown) => string} maskele
 * @returns {(m: unknown) => string}
 */
function ortamAdresleriniMaskele(vt, projeId, maskele) {
  const adresler = ortamlariListele(vt, projeId).flatMap((o) => {
    const a = typeof o.tabanUrl === 'string' ? o.tabanUrl : '';
    try { return a ? [a, new URL(a).origin] : []; } catch { return a ? [a] : []; }
  }).filter((a) => a.length >= 4).sort((x, y) => y.length - x.length);
  // Sıra raporMaskeleyici ile aynı: önce sorgu dizesi silinir, sonra adresler yer tutucuya döner, sonra diğer kurallar.
  return (m) => maskele(adresler.reduce((t, a) => t.split(a).join('‹ortam adresi›'),
    String(m ?? '').replace(/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1')));
}

/** Arşiv meta verisi (gizli değer yok). @param {RaporGirdisi} girdi @param {any} veri */
function arsivMetasi(girdi, veri) {
  const tek = girdi.kapsam === 'ekran' || girdi.kapsam === 'servis';
  // Çoklu seçim: kimlikler ve "tümü" işaretleri ("aynı seçimlerle yeniden oluştur" için) + o günkü öğe adları (listede gösterim).
  // Genel: seçim saklanmaz (yeniden oluşturma o anki tüm öğelerle çalışır); listede öğe sayıları gösterilir.
  const secim = tek ? { id: girdi.id, ad: veri.oge.ad } : girdi.kapsam === 'genel' ? {
    id: '', ad: veri.oge.ad, genel: true, ekranSayisi: veri.secilenler?.ekranlar.length ?? 0, servisSayisi: veri.secilenler?.servisler.length ?? 0
  } : {
    id: '', ad: veri.oge.ad, ekranIdleri: girdi.ekranIdleri ?? [], servisIdleri: girdi.servisIdleri ?? [], tumEkranlar: girdi.tumEkranlar === true,
    tumServisler: girdi.tumServisler === true, ogeler: [...(veri.secilenler?.ekranlar ?? []), ...(veri.secilenler?.servisler ?? [])].map((/** @type {{ ad: string }} */ o) => o.ad)
  };
  const test = girdi.kapsam === 'ekran' || girdi.kapsam === 'coklu-ekran' ? veri.ozet.test
    : girdi.kapsam === 'karisik' || girdi.kapsam === 'genel' ? (veri.ozet.ekran?.test ?? 0) + (veri.ozet.servis?.cagri ?? 0) : veri.ozet.cagri;
  return {
    kapsam: girdi.kapsam, secim,
    donem: { ...girdi.donem, gun: veri.donem.gun, etiket: veri.donem.etiket }, karsilastir: girdi.karsilastir,
    ortam: veri.ortam ? { id: veri.ortam.id, ad: veri.ortam.ad } : null, secenekler: girdi.secenekler,
    rozet: veri.rozet.durum, ozet: {
      basari: veri.ozet.basari, test, bantlar: veri.bantSayim, durumlar: veri.durumSayim, acikSorun: veri.ozet.acikSorun
    }
  };
}

/** POST /platform/rapor/onizle @param {Veritabani} vt @param {Record<string, any>} g @param {UcBaglami} b */
export async function raporOnizle(vt, g, b) {
  const r = await raporHazirla(vt, raporGirdisiDogrula(g), b);
  return { html: r.html, onizlemeId: onizlemeSakla(r.html), dosyaAdi: r.dosyaAdi, boyut: Buffer.byteLength(r.html, 'utf8'), rozet: r.veri.rozet };
}

/**
 * POST /platform/rapor/pdf: PDF + (kaydet: true ise) arşiv kaydı.
 * @param {Veritabani} vt @param {Record<string, any>} g @param {UcBaglami} b
 * @returns {Promise<{ pdf: Buffer; dosyaAdi: string; raporId: string | null; sayfa: number; engellenenIstek: number }>}
 */
export async function raporPdf(vt, g, b) {
  const girdi = raporGirdisiDogrula(g);
  const r = await raporHazirla(vt, girdi, b);
  const { pdf, engellenenIstek } = await htmldenPdf(r.html, { altBilgi: `Nöbetçi · ${r.baslik}` });
  const raporId = g.kaydet === true
    ? await raporKaydet(vt, { projeId: girdi.projeId, kapsam: girdi.kapsam, pdf, dosyaAdi: r.dosyaAdi, meta: arsivMetasi(girdi, r.veri), medyaKlasoru: b.medyaKlasoru,
      olusturulma: (b.simdi ?? new Date()).toISOString() })
    : null;
  return { pdf, dosyaAdi: r.dosyaAdi, raporId, sayfa: pdfSayfaSayisi(pdf), engellenenIstek };
}

/** GET /platform/raporlar @param {Veritabani} vt @param {URLSearchParams} q */
export function raporListesi(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  return { raporlar: raporlariListele(vt, projeId) };
}

/** GET /platform/rapor/indir @param {Veritabani} vt @param {URLSearchParams} q @param {UcBaglami} b */
export function raporIndir(vt, q, b) {
  return raporPdfiniAl(vt, kimlik(q.get('projeId'), 'projeId'), kimlik(q.get('id'), 'id'), b.medyaKlasoru);
}

/**
 * POST /platform/rapor/yeniden: aynı kapsam / seçim / ortam / seçenekler, dönem aynı uzunlukta bugüne kaydırılmış; yeni satır.
 * @param {Veritabani} vt @param {Record<string, any>} g @param {UcBaglami} b
 */
export async function raporYenidenOlustur(vt, g, b) {
  const projeId = kimlik(g.projeId, 'projeId');
  const eski = raporGetir(vt, projeId, kimlik(g.id, 'id'));
  if (!eski) throw new DepoHatasi('Rapor bulunamadı.');
  const m = eski.meta;
  const donemSecimi = m.donem && typeof m.donem === 'object' ? m.donem : { tur: 'son14' };
  const donem = donemiBuguneKaydir(donemSecimi.tur === 'ozel' ? { tur: 'ozel', baslangic: donemSecimi.baslangic, bitis: donemSecimi.bitis } : { tur: donemSecimi.tur }, b.simdi ?? new Date());
  const s = m.secim && typeof m.secim === 'object' ? m.secim : {};
  const r = await raporPdf(vt, {
    projeId, kapsam: m.kapsam, id: s.id, ekranIdleri: s.ekranIdleri, servisIdleri: s.servisIdleri, tumEkranlar: s.tumEkranlar, tumServisler: s.tumServisler,
    donem, karsilastir: m.karsilastir !== false, ortamId: m.ortam?.id ?? null, secenekler: m.secenekler ?? {}, kaydet: true
  }, b);
  return { raporId: r.raporId, dosyaAdi: r.dosyaAdi, sayfa: r.sayfa };
}

/** POST /platform/rapor/sil @param {Veritabani} vt @param {Record<string, any>} g @param {UcBaglami} b */
export function raporSilUc(vt, g, b) {
  if (g.onay !== true) throw new DepoHatasi('Raporu silmek için onaylayın.');
  return raporSil(vt, kimlik(g.projeId, 'projeId'), kimlik(g.id, 'id'), b.medyaKlasoru);
}

/** GET /platform/rapor/secenekler @param {Veritabani} vt @param {URLSearchParams} q */
export function raporSecenekleri(vt, q) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const ekranlar = vt.tumu("SELECT id, ad, durum FROM ekranlar WHERE proje_id = ? AND durum <> 'silindi' ORDER BY (sira IS NULL), sira, ad", [projeId])
    .map((e) => ({ id: String(e.id), ad: String(e.ad), devreDisi: e.durum === 'devre_disi' }));
  return {
    ekranlar, servisler: servisleriListele(vt, projeId).map((s) => ({ id: s.id, ad: s.ad, tur: s.tur })),
    ortamlar: ortamlariListele(vt, projeId).map((o) => ({ id: o.id, ad: o.ad })), kapsamlar: RAPOR_KAPSAMLARI
  };
}

/**
 * GET /platform/rapor-verileri (Ayarlar > Raporlar; PDF rapor A4): ekip listesi, öğe listeleri (ekranlar — ortak akışlar işaretli —,
 * servisler ve metotları, servis / oturum / uçtan uca akışlar) ve her öğenin işareti (kritik, ekip, süre eşiği, metot eşikleri).
 * Metot adları rapordakiyle aynı kuraldan (servisMetodu) gelir; kasa açık olmalıdır.
 * @param {Veritabani} vt @param {string} projeId
 */
export function raporVerileriEkrani(vt, projeId) {
  kimlik(projeId, 'projeId');
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const isaretler = new Map(raporIsaretleriniListele(vt, projeId).map((x) => [ogeAnahtari(x.ogeTuru, x.ogeId), x]));
  const isaret = (/** @type {'ekran' | 'servis' | 'akis'} */ tur, /** @type {string} */ id) => {
    const x = isaretler.get(ogeAnahtari(tur, id));
    return { kritik: x?.kritik ?? false, ekipId: x?.ekipId ?? null, sureEsigiMs: x?.sureEsigiMs ?? null, metotEsikleri: x?.metotEsikleri ?? {} };
  };
  const ekranlar = vt.tumu("SELECT id, ad, durum FROM ekranlar WHERE proje_id = ? AND durum <> 'silindi' ORDER BY (sira IS NULL), sira, ad", [projeId]).map((e) => {
    let ortakAkis = false;
    try { ortakAkis = ekranModeliGetir(vt, String(e.id))?.model?.tur === 'ortakAkis'; } catch { ortakAkis = false; }
    const x = isaret('ekran', String(e.id));
    return { id: String(e.id), ad: String(e.ad), ortakAkis, devreDisi: e.durum === 'devre_disi', kritik: x.kritik, ekipId: x.ekipId, sureEsigiMs: x.sureEsigiMs };
  });
  const servisler = servisleriListele(vt, projeId).map((s) => {
    const metotlar = [...new Set(servisSenaryolariniListele(vt, s.id).map((y) => servisMetodu(/** @type {any} */ (y.icerik))).filter((m) => !m.startsWith('(')))]
      .sort((a, b) => a.localeCompare(b, 'tr'));
    const x = isaret('servis', s.id);
    return { id: s.id, ad: s.ad, tur: s.tur, metotlar, kritik: x.kritik, ekipId: x.ekipId, sureEsigiMs: x.sureEsigiMs, metotEsikleri: x.metotEsikleri };
  });
  const akislar = servisAkislariniListele(vt, projeId).map((a) => ({
    id: a.id, ad: a.baslik, tur: /** @type {any} */ (a.icerik)?.uctanUca === true ? 'Uçtan uca akış' : a.tur === 'oturum' ? 'Oturum akışı' : 'Servis akışı',
    kritik: isaret('akis', a.id).kritik
  }));
  return { ekipler: ekipleriListele(vt, projeId), ekranlar, servisler, akislar };
}

/** Günlük temizlik: Ayarlar > Yedekleme > Rapor saklama süresi. @param {Veritabani} vt @param {{ medyaKlasoru: string; simdi?: number }} s */
export function raporSaklamaTemizligi(vt, s) {
  let gun = 90;
  try { gun = Number(kosuAyarlariniOku(vt).raporSaklamaGun); } catch { gun = 90; }
  return eskiRaporlariSil(vt, gun, s);
}
