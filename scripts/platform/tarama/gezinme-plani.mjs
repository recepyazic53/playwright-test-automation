// GEZİNME PLANI (genel, saf) — kayıtta görülen adres değişimlerinden ("Akışı kaydet" ve "Girişi kaydet" ortak) hangilerinin
// oynatılacak "adrese git" adımı olacağını ve hangilerinin NEDEN alınmadığını belirler. Kayıt motoru (kayit-motoru.ts) her adres
// değişimini nedeniyle işaretler; sessiz kayıp olmaz: her değişim ya adım olur ya da özette nedeniyle görünür.
//
//   gezinmePlani(env)      { adimlar: [{ sira, yol }], ozet } — adım olanlar olay sırasına (sira) göre; ozet: sayılar + nedenler.
//   gezinmeOzetMetni(ozet) onay ekranının HER ZAMAN gösterdiği tek satır: "Kayıtta N adres değişimi görüldü: M tanesi adım oldu…"
//   gezinmeUyarilari(ozet) başka siteye gidildiyse okunur uyarı satırları.
//
// Adım olanlar: adres çubuğuyla gidilenler (yazarak, öneriden, yer imiyle, geri / ileri), kayıt motorunun kaydetmediği bir öğeye
// (ör. betikle yönlenen menü) tıklanınca açılanlar. Adım OLMAYANLAR: aynı sayfaya (yol + sorgu + yol gibi parça) yenileme /
// dönüş, kayıtlı düğmenin / bağlantının tıklamasıyla açılanlar (oynatmada tıklama zaten oraya götürür), otomatik yönlendirmeler
// (giriş sonrası ana sayfaya yönlendirme gibi; site kendisi yapar), başka siteye (ortamın adresi dışı) gidişler, yeni pencereler.
// Sayfa takibi her değişimde yenilenir: sonraki değişim "aynı sayfa" mı, ona göre karar verilir.
// NOT: import.meta KULLANILMAZ. Tipler: gezinme-plani.d.mts.

import { gezinmeYolu } from '../../dogrulama/gezinme-yolu.mjs';

const EN_COK = 200;
/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** Adım sayılan kaynaklar (yeni kayıtlarda "kaynak"; eski kayıtlarda yalnız "elle"). */
const ADIM_KAYNAKLARI = ['adresCubugu', 'geriIleri', 'etkilesim'];

/**
 * Kayıttaki ilk sayfanın yolu (ilk okuma / tıklama anındaki adres): kayıt başladığı sayfa yeni sayfa sayılmaz.
 * @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env
 */
export function ilkSayfaYolu(env) {
  for (const o of Array.isArray(env.olaylar) ? env.olaylar : []) {
    const yol = o.tur === 'okuma' ? o.okuma?.yol : o.tur === 'tik' ? o.oncesi?.yol : '';
    if (typeof yol === 'string' && yol) return gezinmeYolu(yol) || null;
  }
  return null;
}

/**
 * @param {import('./akis-tasarimi.d.mts').AkisEnvanteri} env
 * @param {{ ilkYol?: string | null }} [s] ilkYol: verilmezse kaydın başladığı sayfa (env.baslangicYolu; yoksa ilk okumadaki adres)
 * @returns {import('./gezinme-plani.d.mts').GezinmePlani}
 */
export function gezinmePlani(env, s = {}) {
  /** @type {Array<{ sira: number; yol: string; kaynak: string; elle: boolean }>} */
  const gorulenler = (Array.isArray(env.gezinmeler) ? env.gezinmeler : [])
    .filter((g) => nesneMi(g) && Number.isFinite(g.sira) && typeof g.yol === 'string')
    .map((g) => ({ sira: Number(g.sira), yol: g.yol, elle: g.elle === true, kaynak: typeof g.kaynak === 'string' ? g.kaynak : g.elle === true ? 'adresCubugu' : 'yonlendirme' }))
    .sort((a, b) => a.sira - b.sira).slice(0, EN_COK);
  const baskaSite = (Array.isArray(env.atlananGezinmeler) ? env.atlananGezinmeler : []).filter((a) => nesneMi(a) && typeof a.koken === 'string').slice(0, EN_COK);
  const pencereler = (Array.isArray(env.pencereler) ? env.pencereler : []).filter((p) => nesneMi(p) && (p.olay === 'acildi' || p.olay === 'kapandi')).slice(0, EN_COK);
  /** @type {import('./gezinme-plani.d.mts').GezinmeOzeti} */
  const ozet = {
    toplam: gorulenler.length + baskaSite.length + pencereler.filter((p) => p.olay === 'acildi').length, adim: 0,
    atlanan: { ayniSayfa: 0, baskaSite: baskaSite.length, otomatik: 0, tiklama: 0, yeniPencere: pencereler.filter((p) => p.olay === 'acildi').length },
    baskaSiteler: [...new Map(baskaSite.map((a) => [a.koken, { koken: String(a.koken).slice(0, 200), kayitli: a.kayitli === true }])).values()],
    pencereler: pencereler.map((p) => ({ sira: Number(p.sira) || 0, olay: p.olay, yol: typeof p.yol === 'string' ? gezinmeYolu(p.yol) : '' }))
  };
  /** @type {Array<{ sira: number; yol: string }>} */
  const adimlar = [];
  /** Sayfanın DEĞİŞTİĞİ her geçiş (adım olsun ya da olmasın; otomatik yönlendirmeler dahil): giriş kaydı sayfa bölümlerini bundan sayar. @type {Array<{ sira: number; yol: string; adim: boolean }>} */
  const gecisler = [];
  let sayfa = s.ilkYol !== undefined ? s.ilkYol : typeof env.baslangicYolu === 'string' && env.baslangicYolu ? gezinmeYolu(env.baslangicYolu) || null : ilkSayfaYolu(env);
  for (const g of gorulenler) {
    const yol = gezinmeYolu(g.yol);
    if (!yol) { ozet.atlanan.otomatik++; continue; }
    const aday = g.elle || ADIM_KAYNAKLARI.includes(g.kaynak);
    const onceki = sayfa;
    sayfa = yol;
    const ayni = onceki !== null && onceki === yol;
    if (!aday) {
      if (g.kaynak === 'tik' && !ayni) ozet.atlanan.tiklama++;
      else if (g.kaynak === 'yenileme' || ayni) ozet.atlanan.ayniSayfa++;
      else ozet.atlanan.otomatik++;
      if (!ayni) gecisler.push({ sira: g.sira, yol, adim: false });
      continue;
    }
    if (ayni) { ozet.atlanan.ayniSayfa++; continue; }
    adimlar.push({ sira: g.sira, yol });
    gecisler.push({ sira: g.sira, yol, adim: true });
    ozet.adim++;
  }
  return { adimlar, gecisler, ozet };
}

/** Onay ekranının her zaman gösterdiği özet satırı. @param {import('./gezinme-plani.d.mts').GezinmeOzeti} o */
export function gezinmeOzetMetni(o) {
  if (!o.toplam) return 'Kayıtta adres değişimi görülmedi.';
  const a = o.atlanan;
  const nedenler = [
    a.ayniSayfa ? `aynı sayfa: ${a.ayniSayfa}` : '', a.baskaSite ? `başka site: ${a.baskaSite}` : '', a.otomatik ? `otomatik yönlendirme: ${a.otomatik}` : '',
    a.tiklama ? `tıklamayla açıldı, oynatmada tıklama zaten gider: ${a.tiklama}` : '', a.yeniPencere ? `yeni pencere: ${a.yeniPencere}` : ''
  ].filter(Boolean);
  const alinmayan = o.toplam - o.adim;
  return `Kayıtta ${o.toplam} adres değişimi görüldü: ${o.adim} tanesi adım oldu${alinmayan ? `, ${alinmayan} tanesi alınmadı (nedeni — ${nedenler.join('; ')})` : ''}.`;
}

/** Başka siteye gidildiyse uyarı satırları (sessiz kayıp olmaz). @param {import('./gezinme-plani.d.mts').GezinmeOzeti} o */
export function gezinmeUyarilari(o) {
  return o.baskaSiteler.map((b) => `Şu siteye gidildi: ${b.koken}; ortamın adresi dışında olduğu için alınmadı.`);
}
