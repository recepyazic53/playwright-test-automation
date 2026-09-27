// SERVİS TESTLERİ — taban adreslerin toplu düzenlenmesi (Ayarlar > Proje ve ortamlar > Servis taban adresleri).
// - Tablo: satır = servis, sütun = ortam. Hücre: servise özel taban (ayarlar.tabanlar[ortamId]), "yok" ('' = servis o ortamda
//   tanımlı değil), ortamın asıl adresi (tanım yok) ya da eski tam adres ayarı (ayarlar.adresler[ortamId]; düzenlenince kalkar).
// - Adlandırılmış taban adres (grup): aynı sunucuyu paylaşan servisler bir ada bağlanır (ayarlar.tabanGrubu). Gruptaki
//   servislerin taban adresleri hep aynıdır; grup bir yerde değişince bağlı tüm servisler birlikte güncellenir. Ayrı tablo yok:
//   adresler servisin ŞİFRELİ ayarlarında kalır (koşu değişmeden servis.ayarlar.tabanlar'ı okur; geriye uyumlu, göç gerekmez).
// - Önce etki önizlemesi (hangi servisler, kaç senaryo / akış, eski → yeni adres); YALNIZ onay: true ile yazılır.
// - Adres http(s) olmalı ve yasak adres kalıplarına (Ayarlar > Güvenlik) uymamalı. Ağ isteği YOK (SOAP'ta da erişim kontrolü
//   yapılmaz; kullanıcı isterse servis sayfasından kendisi kontrol eder). Adresi değişen ortamın eski erişim kaydı silinir.
import { DepoHatasi, ortamlariListele } from '../veritabani/depo.mjs';
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
  return {
    ortamlar: ortamlar.map((o) => ({
      id: o.id, ad: o.ad, riskli: riskliSecimi(o), canli: riskliOrtamMi(o), tabanUrl: o.tabanUrl,
      tabanAdresleri: Array.isArray(o.ayarlar.tabanAdresleri) ? /** @type {string[]} */ (o.ayarlar.tabanAdresleri) : []
    })),
    satirlar: servisleriListele(vt, projeId).map((s) => ({
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
  // Gruptaki servislerin (değişmeyen üyeler dahil) her ortamdaki geçerli taban adresi aynı olmalı.
  /** @type {Map<string, Array<{ ad: string; imza: string }>>} */
  const gruplar = new Map();
  for (const s of servisler) {
    const a = yeniler.get(s.id)?.ayarlar ?? s.ayarlar;
    if (!a.tabanGrubu) continue;
    const l = gruplar.get(a.tabanGrubu) ?? [];
    l.push({ ad: s.ad, imza: JSON.stringify(ortamlar.map((o) => tabanHucresi(a, o).deger)) });
    gruplar.set(a.tabanGrubu, l);
  }
  for (const [ad, l] of gruplar) {
    if (new Set(l.map((x) => x.imza)).size > 1) throw new DepoHatasi(`"${ad}" adlı taban adresine bağlı servislerin adresleri aynı olmalı (${l.map((x) => x.ad).join(', ')}).`);
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
  });
  return { uygulandi: true, onizleme: ozet };
}
