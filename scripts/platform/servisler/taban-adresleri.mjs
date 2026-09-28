// SERVİS TESTLERİ — taban adreslerin toplu düzenlenmesi (Ayarlar > Proje ve ortamlar > Servis taban adresleri).
// - Tablo: satır = servis, sütun = ortam. Hücre: servise özel taban (ayarlar.tabanlar[ortamId]), "yok" ('' = servis o ortamda
//   tanımlı değil), ortamın asıl adresi (tanım yok) ya da eski tam adres ayarı (ayarlar.adresler[ortamId]; düzenlenince kalkar).
// - Adlandırılmış taban adres (grup): aynı sunucuyu paylaşan servisler bir ada bağlanır (ayarlar.tabanGrubu). Gruptaki
//   servislerin taban adresleri (tanımlı oldukları ortamlarda; "yok" grubu bozmaz) hep aynıdır; grup bir yerde değişince bağlı
//   tüm servisler birlikte güncellenir. Arayüzün "adrese göre" görünümü de yalnız görünümdür (veri servis başına). Ayrı tablo yok:
//   adresler servisin ŞİFRELİ ayarlarında kalır (koşu değişmeden servis.ayarlar.tabanlar'ı okur; geriye uyumlu, göç gerekmez).
// - Adlandırılmış taban adres kendi başına da vardır (henüz servisi olmasa da): ortam başına adresi ortamın ŞİFRELİ ayarında
//   (ortam.ayarlar.tabanAdlari = { <ad>: adres | '' }; '' = bu ortamda adresi yok). Kaydı olmayan eski adlar (yalnız servislerde
//   tabanGrubu) bağlı servislerin adresinden türetilir; ilk değişiklikte kayda geçer. Taban adresi değişince / silinince bağlı
//   servislerin servis.ayarlar.tabanlar'ı birlikte yazılır (koşu yine yalnız servisin adreslerini okur). tabanAdresiIslemi.
// - Önce etki önizlemesi (hangi servisler, kaç senaryo / akış, eski → yeni adres); YALNIZ onay: true ile yazılır.
// - Adres http(s) olmalı ve yasak adres kalıplarına (Ayarlar > Güvenlik) uymamalı. Ağ isteği YOK (SOAP'ta da erişim kontrolü
//   yapılmaz; kullanıcı isterse servis sayfasından kendisi kontrol eder). Adresi değişen ortamın eski erişim kaydı silinir.
import { DepoHatasi, ortamGetir, ortamKaydet, ortamlariListele } from '../veritabani/depo.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { riskliOrtamMi, riskliSecimi } from '../guvenlik/ortam-riski.mjs';
import { adresYasakliMi } from '../senaryolar/model-kosusu.mjs';
import { servisAkislariniListele, servisKaydet, servisleriListele, servisSenaryolariniListele } from './servis-deposu.mjs';
import { tabanlariDogrula, tabanlariOrtamlaraKaydet } from './servis-islemleri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').Servis} Servis */
/** @typedef {{ deger: string; kaynak: 'servis' | 'ortam' | 'yok' | 'eski' }} TabanHucresi */

const GRUP_ADI = /^[^\u0000-\u001f]{1,60}$/u;
const temiz = (/** @type {string} */ a) => a.trim().replace(/\/+$/, '');

/**
 * Bir servisin bir ortamdaki taban hücresi.
 * @param {{ tabanlar?: Record<string, string>; adresler?: Record<string, string> }} ayarlar @param {{ id: string; tabanUrl: string }} ortam
 * @returns {TabanHucresi}
 */
export function tabanHucresi(ayarlar, ortam) {
  const eski = ayarlar.adresler?.[ortam.id];
  if (eski) return { deger: eski, kaynak: 'eski' };
  const t = ayarlar.tabanlar?.[ortam.id];
  if (t === '') return { deger: '', kaynak: 'yok' };
  if (t) return { deger: temiz(t), kaynak: 'servis' };
  return { deger: temiz(ortam.tabanUrl), kaynak: 'ortam' };
}

/** @param {Veritabani} vt @param {string} projeId */
function baglam(vt, projeId) {
  const ortamlar = ortamlariListele(vt, projeId);
  const akislar = servisAkislariniListele(vt, projeId);
  /** @param {string} servisId */
  const akislari = (servisId) => akislar.filter((a) => a.icerik.adimlar.some((x) => x.servisId === servisId)).map((a) => a.baslik);
  return { ortamlar, akislari };
}

/**
 * Tablo görünümü: ortamlar (sütunlar) ve servisler (satırlar; grup, hücreler, senaryo / akış sayısı).
 * @param {Veritabani} vt @param {string} projeId
 */
export function tabanTablosu(vt, projeId) {
  const { ortamlar, akislari } = baglam(vt, projeId);
  const servisler = servisleriListele(vt, projeId);
  return {
    tabanAdlari: tabanAdlari(ortamlar, servisler),
    ortamlar: ortamlar.map((o) => ({
      id: o.id, ad: o.ad, riskli: riskliSecimi(o), canli: riskliOrtamMi(o), tabanUrl: o.tabanUrl,
      tabanAdresleri: Array.isArray(o.ayarlar.tabanAdresleri) ? /** @type {string[]} */ (o.ayarlar.tabanAdresleri) : []
    })),
    satirlar: servisler.map((s) => ({
      servisId: s.id, ad: s.ad, anahtar: s.anahtar, tur: s.tur, yol: s.ayarlar.yol ?? '', grup: s.ayarlar.tabanGrubu ?? null,
      tabanlar: Object.fromEntries(ortamlar.map((o) => [o.id, tabanHucresi(s.ayarlar, o)])),
      senaryoSayisi: servisSenaryolariniListele(vt, s.id).length, akislar: akislari(s.id)
    }))
  };
}

/**
 * Toplu değişiklik: önizleme (onay yok) ya da uygulama (onay: true).
 * degisiklikler: { <servisId>: { tabanlar?: { <ortamId>: adres | '' (bu ortamda yok) | null (ortamın asıl adresi) }, grup?: ad | null } }
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ degisiklikler: Record<string, { tabanlar?: Record<string, string | null>; grup?: string | null }>; onay?: boolean; yapan?: string }} girdi
 */
export function tabanlariUygula(vt, projeId, girdi) {
  if (!girdi.degisiklikler || typeof girdi.degisiklikler !== 'object' || Array.isArray(girdi.degisiklikler)) throw new DepoHatasi('"degisiklikler" bir nesne olmalıdır.');
  const { ortamlar, akislari } = baglam(vt, projeId);
  const servisler = servisleriListele(vt, projeId);
  const desenler = etkinYasakDesenleri(vt);
  /** Yeni ayarlar (yalnız değişenler). @type {Map<string, { s: Servis; ayarlar: Servis['ayarlar']; degisenOrtamlar: string[] }>} */
  const yeniler = new Map();
  for (const [servisId, d] of Object.entries(girdi.degisiklikler)) {
    const s = servisler.find((x) => x.id === servisId);
    if (!s) throw new DepoHatasi('Servis bulunamadı.');
    if (!d || typeof d !== 'object') throw new DepoHatasi(`"${s.ad}" için değişiklik geçersiz.`);
    const tabanlar = { ...(s.ayarlar.tabanlar ?? {}) };
    const adresler = { ...(s.ayarlar.adresler ?? {}) };
    for (const [ortamId, v] of Object.entries(d.tabanlar ?? {})) {
      if (!ortamlar.some((o) => o.id === ortamId)) throw new DepoHatasi('Ortam bulunamadı.');
      if (v === null) delete tabanlar[ortamId];
      else if (typeof v === 'string') tabanlar[ortamId] = temiz(v);
      else throw new DepoHatasi(`"${s.ad}" taban adresi metin olmalıdır.`);
      delete adresler[ortamId]; // düzenlenen hücrede eski tam adres ayarı kalkar
    }
    const dogru = tabanlariDogrula(tabanlar);
    for (const [ortamId, a] of Object.entries(dogru)) {
      const kalip = a ? adresYasakliMi(a, desenler) : null;
      if (kalip) throw new DepoHatasi(`"${s.ad}" (${ortamlar.find((o) => o.id === ortamId)?.ad}) adresi yasak adres kalıbına uyuyor: ${kalip}`);
    }
    let grup = s.ayarlar.tabanGrubu;
    if (d.grup !== undefined) {
      if (d.grup === null || d.grup === '') grup = undefined;
      else if (typeof d.grup !== 'string' || !GRUP_ADI.test(d.grup.trim())) throw new DepoHatasi('Taban adres adı 1–60 karakter olmalıdır.');
      else grup = d.grup.trim();
    }
    const { tabanGrubu: _g, ...kalan } = s.ayarlar;
    const ayarlar = { ...kalan, tabanlar: dogru, adresler, ...(grup ? { tabanGrubu: grup } : {}) };
    const degisenOrtamlar = ortamlar.filter((o) => {
      const e = tabanHucresi(s.ayarlar, o);
      const y = tabanHucresi(ayarlar, o);
      return e.deger !== y.deger || e.kaynak !== y.kaynak;
    }).map((o) => o.id);
    if (degisenOrtamlar.length || grup !== s.ayarlar.tabanGrubu) yeniler.set(s.id, { s, ayarlar, degisenOrtamlar });
  }
  // Gruptaki servislerin (değişmeyen üyeler dahil) her ortamdaki geçerli taban adresi aynı olmalı. "Bu ortamda yok" olan servis
  // grubu bozmaz (o ortamda karşılaştırmaya girmez): gruptaki diğer servislerle yalnız tanımlı olduğu ortamlarda aynı olmalıdır.
  /** @type {Map<string, { adlar: string[]; ortamlar: Map<string, Set<string>> }>} */
  const gruplar = new Map();
  for (const s of servisler) {
    const a = yeniler.get(s.id)?.ayarlar ?? s.ayarlar;
    if (!a.tabanGrubu) continue;
    const g = gruplar.get(a.tabanGrubu) ?? { adlar: [], ortamlar: new Map() };
    g.adlar.push(s.ad);
    for (const o of ortamlar) {
      const h = tabanHucresi(a, o);
      if (h.kaynak === 'yok') continue;
      const d = g.ortamlar.get(o.id) ?? new Set();
      d.add(h.deger);
      g.ortamlar.set(o.id, d);
    }
    gruplar.set(a.tabanGrubu, g);
  }
  for (const [ad, g] of gruplar) {
    if ([...g.ortamlar.values()].some((d) => d.size > 1)) throw new DepoHatasi(`"${ad}" adlı taban adresine bağlı servislerin adresleri aynı olmalı (${g.adlar.join(', ')}).`);
  }
  const onizleme = [...yeniler.values()].map(({ s, ayarlar, degisenOrtamlar }) => ({
    servisId: s.id, ad: s.ad, tur: s.tur, grup: { eski: s.ayarlar.tabanGrubu ?? null, yeni: ayarlar.tabanGrubu ?? null },
    adresler: degisenOrtamlar.map((id) => {
      const o = /** @type {typeof ortamlar[number]} */ (ortamlar.find((x) => x.id === id));
      return { ortamId: id, ortam: o.ad, eski: tabanHucresi(s.ayarlar, o), yeni: tabanHucresi(ayarlar, o) };
    }),
    senaryoSayisi: servisSenaryolariniListele(vt, s.id).length, akislar: akislari(s.id)
  }));
  const ozet = {
    servisler: onizleme,
    toplam: { servis: onizleme.length, senaryo: onizleme.reduce((n, x) => n + x.senaryoSayisi, 0), akis: new Set(onizleme.flatMap((x) => x.akislar)).size }
  };
  if (girdi.onay !== true) return { onizleme: ozet };
  vt.islem(() => {
    for (const { s, ayarlar, degisenOrtamlar } of yeniler.values()) {
      tabanlariOrtamlaraKaydet(vt, projeId, ayarlar.tabanlar ?? {});
      const { erisim, ...digerleri } = ayarlar;
      const erisimKalir = erisim && !degisenOrtamlar.includes(erisim.ortamId);
      servisKaydet(vt, { id: s.id, projeId, anahtar: s.anahtar, ad: s.ad, ayarlar: { ...digerleri, ...(erisimKalir ? { erisim } : {}) }, yapan: girdi.yapan });
    }
    // Kayıtlı taban adresi, bağlı servisleri servis bazında düzenlenince kayıtta da güncellenir (bağlı servislerin ortak adresi).
    const son = servisleriListele(vt, projeId);
    for (const ad of new Set([...yeniler.values()].map((x) => x.ayarlar.tabanGrubu).filter((x) => typeof x === 'string'))) {
      kayitliAdlariGuncelle(vt, projeId, (ta, o) => {
        if (!(ad in ta)) return ta;
        const degerler = new Set(son.filter((s) => s.ayarlar.tabanGrubu === ad).map((s) => tabanHucresi(s.ayarlar, o))
          .filter((h) => h.kaynak !== 'yok' && h.kaynak !== 'eski').map((h) => h.deger));
        return degerler.size === 1 ? { ...ta, [ad]: [...degerler][0] } : ta;
      });
    }
  });
  return { uygulandi: true, onizleme: ozet };
}

// --- Adlandırılmış taban adresleri (ana liste) -----------------------------------------------------------------------------

/** @typedef {{ ad: string; adresler: Record<string, string>; kayitli: boolean; kullanan: string[] }} TabanAdi  adresler: '' = bu ortamda yok */

/** Ortamın kayıtlı adlandırılmış taban adresleri. @param {{ ayarlar: Record<string, unknown> }} ortam @returns {Record<string, string>} */
function kayitliAdlar(ortam) {
  const x = ortam.ayarlar.tabanAdlari;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
  return Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === 'string'));
}

/**
 * Her ortamın kayıtlı adlarını günceller (yalnız değişen ortam yazılır).
 * @param {Veritabani} vt @param {string} projeId
 * @param {(ta: Record<string, string>, ortam: { id: string; tabanUrl: string }) => Record<string, string>} fn
 */
function kayitliAdlariGuncelle(vt, projeId, fn) {
  for (const { id } of ortamlariListele(vt, projeId)) {
    const o = /** @type {NonNullable<ReturnType<typeof ortamGetir>>} */ (ortamGetir(vt, id));
    const eski = kayitliAdlar(o);
    const yeni = fn({ ...eski }, o);
    if (JSON.stringify(yeni) === JSON.stringify(eski)) continue;
    ortamKaydet(vt, { id: o.id, projeId, ad: o.ad, tabanUrl: o.tabanUrl, varsayilan: o.varsayilan, ayarlar: { ...o.ayarlar, tabanAdlari: yeni } });
  }
}

/**
 * Projenin adlandırılmış taban adresleri (ada göre): kayıtlılar (ortam ayarlarında) + yalnız servislerde geçen eski adlar
 * (adresleri bağlı servislerin — "bu ortamda yok" olmayan — adresinden türetilir). kullanan: bağlı servislerin kimlikleri.
 * @param {Array<{ id: string; tabanUrl: string; ayarlar: Record<string, unknown> }>} ortamlar @param {Servis[]} servisler
 * @returns {TabanAdi[]}
 */
export function tabanAdlari(ortamlar, servisler) {
  /** @type {Map<string, TabanAdi>} */
  const harita = new Map();
  for (const o of ortamlar) {
    for (const [ad, a] of Object.entries(kayitliAdlar(o))) {
      const t = harita.get(ad) ?? { ad, adresler: {}, kayitli: true, kullanan: [] };
      t.adresler[o.id] = a ? temiz(a) : '';
      harita.set(ad, t);
    }
  }
  for (const s of servisler) {
    const ad = s.ayarlar.tabanGrubu;
    if (!ad) continue;
    const t = harita.get(ad) ?? { ad, adresler: {}, kayitli: false, kullanan: [] };
    t.kullanan.push(s.id);
    harita.set(ad, t);
  }
  for (const t of harita.values()) {
    for (const o of ortamlar) {
      if (t.adresler[o.id] !== undefined) continue;
      if (t.kayitli) { t.adresler[o.id] = ''; continue; }
      const h = t.kullanan.map((id) => tabanHucresi(/** @type {Servis} */ (servisler.find((s) => s.id === id)).ayarlar, o))
        .find((x) => x.kaynak !== 'yok' && x.kaynak !== 'eski');
      t.adresler[o.id] = h ? h.deger : '';
    }
  }
  return [...harita.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/**
 * Servis bir taban adresine bağlanınca alacağı adresler: tabanın adresi; tabanın adresi olmayan ortamda "bu ortamda yok".
 * Zaten bağlı servisin kendine özel "bu ortamda yok"u korunur.
 * @param {Array<{ id: string; tabanUrl: string }>} ortamlar @param {TabanAdi} taban @param {Servis | undefined} servis
 * @returns {Record<string, string>}
 */
function baglanincaAdresler(ortamlar, taban, servis) {
  return Object.fromEntries(ortamlar.map((o) => {
    const a = taban.adresler[o.id] ?? '';
    const ozelYok = servis?.ayarlar.tabanGrubu === taban.ad && tabanHucresi(servis.ayarlar, o).kaynak === 'yok';
    return [o.id, a && !ozelYok ? a : ''];
  }));
}

/**
 * Servis sayfasında taban adresi seçilince servisin adresleri (seçilen adlandırılmış tabandan).
 * @param {Veritabani} vt @param {string} projeId @param {string | undefined} servisId @param {string} ad
 */
export function servisTabanBaglantisi(vt, projeId, servisId, ad) {
  const ortamlar = ortamlariListele(vt, projeId);
  const servisler = servisleriListele(vt, projeId);
  const taban = tabanAdlari(ortamlar, servisler).find((t) => t.ad === ad);
  if (!taban) throw new DepoHatasi(`"${ad}" adlı taban adresi bulunamadı (Ayarlar > Proje ve ortamlar > Servis taban adresleri).`);
  return { tabanlar: baglanincaAdresler(ortamlar, taban, servisId ? servisler.find((s) => s.id === servisId) : undefined) };
}

/** @param {unknown} ad */
function adDogrula(ad) {
  if (typeof ad !== 'string' || !GRUP_ADI.test(ad.trim())) throw new DepoHatasi('Taban adres adı 1–60 karakter olmalıdır.');
  return ad.trim();
}

/**
 * Adlandırılmış taban adresi: ekle / değiştir (adresler, ad) / sil. Önce etki önizlemesi (onay yok), YALNIZ onay: true ile yazılır.
 * - ekle: baglanacaklar (servis kimlikleri) bu tabana bağlanır; adresleri tabanın adresi olur (tabanın adresi olmayan ortamda "yok").
 * - degistir: bağlı servislerin değişen ortamlardaki adresi birlikte değişir (servise özel "bu ortamda yok" korunur); ortamın
 *   adresi silinirse (boş) bağlı servisler o ortamda BOŞ kalır (koşuda "taban adresi tanımlı değil").
 * - sil: bağlı servislerin tüm ortamlardaki adresi boş kalır, bağları kalkar.
 * Önizleme: tabanlariUygula'nın etkisi + bosKalacaklar (adresi boş kalacak servisler ve ortamları).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ islem: 'ekle' | 'degistir' | 'sil'; ad: string; yeniAd?: string; adresler?: Record<string, string>; baglanacaklar?: string[]; onay?: boolean; yapan?: string }} girdi
 */
export function tabanAdresiIslemi(vt, projeId, girdi) {
  const islem = girdi.islem;
  if (islem !== 'ekle' && islem !== 'degistir' && islem !== 'sil') throw new DepoHatasi('İşlem ekle, degistir ya da sil olmalıdır.');
  const ortamlar = ortamlariListele(vt, projeId);
  const servisler = servisleriListele(vt, projeId);
  const liste = tabanAdlari(ortamlar, servisler);
  const ad = adDogrula(girdi.ad);
  const ayniAd = (/** @type {string} */ x) => liste.find((t) => t.ad.toLocaleLowerCase('tr') === x.toLocaleLowerCase('tr'));
  const mevcut = islem === 'ekle' ? undefined : liste.find((t) => t.ad === ad);
  if (islem === 'ekle' && ayniAd(ad)) throw new DepoHatasi(`"${ayniAd(ad)?.ad}" adlı taban adresi zaten var.`);
  if (islem !== 'ekle' && !mevcut) throw new DepoHatasi(`"${ad}" adlı taban adresi bulunamadı.`);
  let yeniAd = ad;
  if (islem === 'degistir' && girdi.yeniAd !== undefined && girdi.yeniAd.trim() !== ad) {
    yeniAd = adDogrula(girdi.yeniAd);
    const cakisan = ayniAd(yeniAd);
    if (cakisan && cakisan.ad !== ad) throw new DepoHatasi(`"${cakisan.ad}" adlı taban adresi zaten var.`);
  }
  const eski = mevcut?.adresler ?? {};
  /** @type {Record<string, string> | null} */
  let yeni = null;
  if (islem !== 'sil') {
    const g = girdi.adresler ?? {};
    if (typeof g !== 'object' || Array.isArray(g)) throw new DepoHatasi('"adresler" bir nesne olmalıdır.');
    for (const id of Object.keys(g)) if (!ortamlar.some((o) => o.id === id)) throw new DepoHatasi('Ortam bulunamadı.');
    /** @type {Record<string, string>} */
    const ham = {};
    for (const o of ortamlar) {
      const v = g[o.id];
      if (v !== undefined && typeof v !== 'string') throw new DepoHatasi('Taban adres metin olmalıdır.');
      ham[o.id] = v ?? eski[o.id] ?? '';
    }
    yeni = Object.fromEntries(Object.entries(tabanlariDogrula(ham)).map(([k, v]) => [k, v ? temiz(v) : '']));
    const desenler = etkinYasakDesenleri(vt);
    for (const o of ortamlar) {
      const a = yeni[o.id];
      const kalip = a ? adresYasakliMi(a, desenler) : null;
      if (kalip) throw new DepoHatasi(`${o.ad} adresi yasak adres kalıbına uyuyor: ${kalip}`);
    }
    if (islem === 'ekle' && !Object.values(yeni).some(Boolean)) throw new DepoHatasi('En az bir ortam için taban adres yazın.');
  }
  /** @type {Record<string, { tabanlar?: Record<string, string | null>; grup?: string | null }>} */
  const d = {};
  const uyeler = servisler.filter((s) => s.ayarlar.tabanGrubu === ad);
  if (islem === 'ekle') {
    const ids = Array.isArray(girdi.baglanacaklar) ? [...new Set(girdi.baglanacaklar)] : [];
    const taban = { ad, adresler: /** @type {Record<string, string>} */ (yeni), kayitli: true, kullanan: [] };
    for (const id of ids) {
      if (!servisler.some((s) => s.id === id)) throw new DepoHatasi('Servis bulunamadı.');
      d[id] = { grup: ad, tabanlar: baglanincaAdresler(ortamlar, taban, undefined) };
    }
  } else if (islem === 'degistir' && yeni) {
    for (const s of uyeler) {
      /** @type {Record<string, string>} */
      const tabanlar = {};
      for (const o of ortamlar) {
        const e = eski[o.id] ?? '';
        const y = yeni[o.id];
        if (e === y) continue;
        if (y && e && tabanHucresi(s.ayarlar, o).kaynak === 'yok') continue; // servise özel "bu ortamda yok" korunur
        tabanlar[o.id] = y;
      }
      /** @type {{ tabanlar?: Record<string, string>; grup?: string }} */
      const x = {};
      if (Object.keys(tabanlar).length) x.tabanlar = tabanlar;
      if (yeniAd !== ad) x.grup = yeniAd;
      if (Object.keys(x).length) d[s.id] = x;
    }
  } else {
    for (const s of uyeler) d[s.id] = { grup: null, tabanlar: Object.fromEntries(ortamlar.map((o) => [o.id, ''])) };
  }
  const { onizleme } = tabanlariUygula(vt, projeId, { degisiklikler: d });
  const bosKalacaklar = onizleme.servisler.map((s) => ({
    servisId: s.servisId, ad: s.ad,
    ortamlar: s.adresler.filter((a) => a.yeni.kaynak === 'yok' && a.eski.kaynak !== 'yok').map((a) => a.ortam)
  })).filter((x) => x.ortamlar.length);
  const ozet = { ...onizleme, bosKalacaklar, taban: { islem, ad, yeniAd, eski: mevcut ? eski : null, yeni } };
  if (girdi.onay !== true) return { onizleme: ozet };
  vt.islem(() => {
    tabanlariUygula(vt, projeId, { degisiklikler: d, onay: true, yapan: girdi.yapan });
    if (yeni) tabanlariOrtamlaraKaydet(vt, projeId, yeni);
    kayitliAdlariGuncelle(vt, projeId, (ta, o) => {
      delete ta[ad];
      if (yeni) ta[yeniAd] = yeni[o.id] ?? '';
      return ta;
    });
  });
  return { uygulandi: true, onizleme: ozet };
}
