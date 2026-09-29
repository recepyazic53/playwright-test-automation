// SERVİS SENARYO ÖNERİLERİ — sunucu tarafı bağlam (GET /platform/servis/oneriler). Yalnız OKUMA; hiçbir şey yazılmaz, hiçbir istek atılmaz.
//  · metotların alanları: SOAP'ta kayıtlı WSDL şeması (+ elle eklenen alanlar, kısıtlar), REST'te uç tanımı; sözleşmeyle gelen istek alanları
//    (OpenAPI / yüklenen WSDL; servis-sozlesmesi.mjs) kısıtları tamamlar. Etkin zorunluluk: Parametreler'deki seçim, yoksa şema; üst grup
//    isteğe bağlıysa alan zorunlu sayılmaz. Hassas: gizli ad (çekirdek + Ayarlar > Maskeleme), gizli sütuna bağlı ya da ucun gizli alanı.
//  · servisin tek istekli senaryoları (seçili ortamdaki son sonuç, veri güdümlü satırların çözülmüş GİZLİ OLMAYAN değerleri),
//  · test verisi tabloları (tablo listeleri ve satır seçimi için; gizli sütun değeri gelmez),
//  · geçmiş (servisOneriGecmisi): son HATA_GUNU gündeki başarısız sonuçlar ve son UYARI_GUNU günde görülen hata / Fault / iş kuralı mesajları,
//  · kullanıcının servis önerisi kararları.
import { DepoHatasi, ortamlariListele } from '../veritabani/depo.mjs';
import { servisGetir, servisKosulariniListele, servisKosusuGetir, servisSenaryolariniListele } from './servis-deposu.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { oneriKararlariniOku } from '../ayarlar/oneri-kararlari.mjs';
import { degerSatirlari } from '../senaryolar/oneri-baglami.mjs';
import { normalMetin } from '../senaryolar/senaryo-onerileri.mjs';
import { yakalananMetniMaskele } from '../sonuclar/yakalanan-mesajlar.mjs';
import { alanSatirlari, semaBirlestir } from './servis-govdesi.mjs';
import { restSemasi } from './rest-semasi.mjs';
import { metotErisimi, servisOnerileri } from './servis-onerileri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-onerileri.d.mts').ServisOneriAlani} ServisOneriAlani */
/** @typedef {import('./servis-govdesi.mjs').Alan} Alan */

/** Başarısız sonuçların bakıldığı gün sayısı. */
export const SERVIS_HATA_GUNU = 14;
/** Görülen mesajların bakıldığı gün sayısı. */
export const SERVIS_UYARI_GUNU = 90;
/** Mesaj taramasında en çok okunan koşu kaydı (şifreli sonuç tek tek çözülür). */
const EN_COK_KAYIT = 500;
/** REST JSON hata gövdelerinde mesajın arandığı yaygın anahtarlar (genel API alışkanlıkları). */
const MESAJ_ANAHTARLARI = ['message', 'error_description', 'detail', 'title', 'error', 'description', 'errorMessage', 'mesaj'];

/**
 * Alan ağacını yol → alan eşlemine çevirir (grup alanları dahil).
 * @param {Alan[]} alanlar @param {string} [on] @returns {Map<string, Alan>}
 */
function yolHaritasi(alanlar, on = '') {
  /** @type {Map<string, Alan>} */
  const m = new Map();
  for (const a of alanlar) {
    const yol = on ? `${on}/${a.ad}` : a.ad;
    m.set(yol, a);
    if (a.cocuklar?.length) for (const [y, x] of yolHaritasi(a.cocuklar, yol)) m.set(y, x);
  }
  return m;
}

/**
 * Servisin metotları öneri gözüyle (alanlar, şema / uç, varsayılanlar).
 * @param {import('./servis-deposu.mjs').Servis} servis @param {any[]} tablolar @param {ReadonlyArray<string>} ekAdlar
 * @returns {import('./servis-onerileri.d.mts').ServisOneriMetodu[]}
 */
export function servisOneriMetotlari(servis, tablolar, ekAdlar) {
  const a = servis.ayarlar;
  const rest = servis.tur === 'rest';
  return (a.operasyonlar ?? []).map((op) => {
    const istek = a.sozlesmeler?.[op.ad]?.istek ?? [];
    const istekHaritasi = yolHaritasi(istek);
    const zorunluListesi = a.alanZorunluluklari?.[op.ad];
    const baglar = a.alanBaglari?.[op.ad] ?? {};
    const gizliYollar = new Set(Array.isArray(/** @type {any} */ (op).gizliAlanlar) ? /** @type {any} */ (op).gizliAlanlar : []);
    const kayitliSema = a.operasyonSemalari?.[op.ad];
    const sema = rest ? restSemasi(/** @type {any} */ (op)) : kayitliSema ? semaBirlestir(kayitliSema, a.ekAlanlar?.[op.ad] ?? []) : null;
    /** @type {Map<string, { alan: Alan; ustZorunlu: boolean }>} */
    const yapraklar = new Map();
    /** @param {Alan[]} liste @param {string} on @param {number} derinlik @param {boolean} ustZorunlu */
    const gez = (liste, on, derinlik, ustZorunlu) => {
      for (const x of liste) {
        const yol = on ? `${on}/${x.ad}` : x.ad;
        // En üst düzey sarmalayıcı (.asmx'te "Input" hep isteğe bağlı işaretlidir; REST'te yol / sorgu / govde grupları) kurala girmez.
        if (x.cocuklar?.length) { gez(x.cocuklar, yol, derinlik + 1, ustZorunlu && (derinlik === 0 || x.zorunlu === true)); continue; }
        yapraklar.set(yol, { alan: x, ustZorunlu });
      }
    };
    if (sema) gez(sema.alanlar, '', 0, true);
    // Sözleşmedeki istek alanlarından şemada olmayan yapraklar da (ör. OpenAPI gövdesinde örnekte olmayan alan) eklenir.
    for (const [yol, x] of istekHaritasi) if (!x.cocuklar?.length && !yapraklar.has(yol)) yapraklar.set(yol, { alan: { ...x }, ustZorunlu: true });
    /** @type {ServisOneriAlani[]} */
    const alanlar = [];
    for (const [yol, { alan: x, ustZorunlu }] of yapraklar) {
      const i = istekHaritasi.get(yol);
      const grup = rest ? /** @type {'yol' | 'sorgu' | 'govde'} */ (yol.split('/')[0]) : undefined;
      const b = baglar[yol];
      const t = b?.tablo ? tablolar.find((y) => y.id === b.tablo) : null;
      const sutun = t && b?.sutun ? t.sutunlar.find((/** @type {any} */ c) => c.ad === b.sutun) : null;
      const bag = t && sutun ? { tabloId: t.id, tablo: t.ad, sutun: sutun.ad, etiket: b?.etiket ?? '', gizli: sutun.gizli === true } : null;
      const semaZorunlu = rest ? (grup === 'yol' || i?.zorunlu === true) : x.zorunlu === true;
      const zorunlu = (Array.isArray(zorunluListesi) ? zorunluListesi.includes(yol) : semaZorunlu) && ustZorunlu;
      const kisit = { ...(x.kisit ?? {}), ...(i?.kisit ?? {}) };
      const secenekler = i?.secenekler?.length ? i.secenekler : x.secenekler;
      const varsayilan = i?.varsayilan ?? x.varsayilan;
      // Tip şemadan mı: SOAP'ta WSDL (elle eklenen alan hariç); REST'te yalnız sözleşmedeki istek şemasından (örnek gövde çıkarım sayılmaz).
      const tipSemadan = rest ? Boolean(i && i.tip) : !x.ek;
      alanlar.push({
        yol, ad: x.ad, ...(grup ? { grup } : {}), tip: (rest ? i?.tip ?? x.tip : x.tip) ?? 'metin', tipSemadan, zorunlu,
        ...(x.nillable || i?.nillable ? { nillable: true } : {}), ...(secenekler?.length ? { secenekler: [...secenekler] } : {}),
        ...(Object.keys(kisit).length ? { kisit } : {}), ...(varsayilan !== undefined ? { varsayilan } : {}),
        gizli: gizliAdMi(x.ad, ekAdlar) || gizliYollar.has(yol) || Boolean(bag?.gizli), bag, ...(b?.kural ? { kural: b.kural } : {})
      });
    }
    return {
      ad: op.ad, alanlar, sema: rest ? null : sema, uc: rest ? /** @type {any} */ (op) : null,
      ...(a.alanVarsayilanlari?.[op.ad] ? { varsayilanlar: a.alanVarsayilanlari[op.ad] } : {})
    };
  });
}

/**
 * REST hata gövdesinden mesaj (JSON'da yaygın anahtarlar; iç içe "error": { "message" } dahil). Yoksa null.
 * @param {string} govde @returns {string | null}
 */
function jsonMesaji(govde) {
  let v;
  try { v = JSON.parse(govde); } catch { return null; }
  /** @param {unknown} d @param {number} n @returns {string | null} */
  const ara = (d, n) => {
    if (!d || typeof d !== 'object' || n > 3) return null;
    const o = /** @type {Record<string, unknown>} */ (Array.isArray(d) ? d[0] : d);
    if (!o || typeof o !== 'object') return null;
    for (const k of MESAJ_ANAHTARLARI) {
      const x = o[k];
      if (typeof x === 'string' && x.trim()) return x.trim();
      if (x && typeof x === 'object') { const ic = ara(x, n + 1); if (ic) return ic; }
    }
    return Array.isArray(o.errors) ? ara(o.errors, n + 1) : null;
  };
  return ara(v, 0);
}

/**
 * Servis koşu kaydından görülen mesaj: SOAP Fault (faultstring), HTTP 4xx / 5xx (REST: JSON mesajı; SOAP: özet), ya da kontrolleri
 * kalan başarılı yanıttaki durum açıklaması (iş kuralı; özet). Yanıtı olmayan (bağlantı hatası) kayıt ve başarılı olağan yanıt sayılmaz.
 * @param {Record<string, any>} sonuc @param {string} durum @param {'soap' | 'rest'} tur
 * @returns {{ metin: string; hataTuru: 'fault' | 'http' | 'yanit' } | null}
 */
export function kayittanMesaj(sonuc, durum, tur) {
  if (!sonuc || sonuc.hata || typeof sonuc.durumKodu !== 'number') return null;
  const yanit = typeof sonuc.yanit === 'string' ? sonuc.yanit : '';
  const ozet = typeof sonuc.ozet === 'string' ? sonuc.ozet.trim() : '';
  const fault = tur === 'soap' && /<(?:[\w.-]+:)?Fault\b/.test(yanit);
  const kisa = (/** @type {string} */ m) => (m && m.length <= 300 && !/[\r\n]/.test(m) ? m : null);
  if (fault) { const m = kisa(ozet); return m ? { metin: m, hataTuru: 'fault' } : null; }
  if (sonuc.durumKodu >= 400) {
    const m = tur === 'rest' ? kisa(jsonMesaji(yanit) ?? '') : kisa(ozet);
    return m ? { metin: m, hataTuru: 'http' } : null;
  }
  if (durum === 'basarisiz' && tur === 'soap') { const m = kisa(ozet); return m ? { metin: m, hataTuru: 'yanit' } : null; }
  if (durum === 'basarisiz' && tur === 'rest') { const m = kisa(jsonMesaji(yanit) ?? ''); return m ? { metin: m, hataTuru: 'yanit' } : null; }
  return null;
}

/**
 * Servisin koşu geçmişi (bu ortam ya da ortamı bilinmeyen kayıtlar; Dene dahil): son SERVIS_HATA_GUNU gündeki başarısız sonuçlar (senaryo
 * başına) ve son SERVIS_UYARI_GUNU günde görülen mesajlar (sayılar "#"a indirgenmiş kalıba göre gruplu; metin Ayarlar > Maskeleme ek
 * adlarıyla yeniden maskelenir).
 * @param {Veritabani} vt @param {string} projeId @param {string} servisId @param {string} ortamId @param {Date} simdi
 * @returns {Required<import('./servis-onerileri.d.mts').ServisOneriGecmisi>}
 */
export function servisOneriGecmisi(vt, projeId, servisId, ortamId, simdi) {
  const servis = servisGetir(vt, servisId);
  const tur = servis?.tur === 'rest' ? 'rest' : 'soap';
  const once = (/** @type {number} */ gun) => new Date(simdi.getTime() - gun * 86_400_000).toISOString();
  const hatalar = vt.tumu(
    `SELECT senaryo_id, COUNT(*) AS sayi FROM servis_kosulari
      WHERE proje_id = ? AND servis_id = ? AND durum = 'basarisiz' AND senaryo_id IS NOT NULL AND (ortam_id = ? OR ortam_id IS NULL) AND baslangic >= ?
      GROUP BY senaryo_id`, [projeId, servisId, ortamId, once(SERVIS_HATA_GUNU)]
  ).map((h) => ({ senaryoId: String(h.senaryo_id), sayi: Number(h.sayi) || 0 }));
  const satirlar = vt.tumu(
    `SELECT id, durum FROM servis_kosulari
      WHERE proje_id = ? AND servis_id = ? AND (ortam_id = ? OR ortam_id IS NULL) AND baslangic >= ?
      ORDER BY baslangic DESC LIMIT ${EN_COK_KAYIT}`, [projeId, servisId, ortamId, once(SERVIS_UYARI_GUNU)]
  );
  const ekAdlar = satirlar.length ? ekGizliAdlar(vt) : [];
  /** @type {Map<string, { metin: string; operasyon: string | null; sayi: number; senaryoIdleri: string[]; hataTuru: 'fault' | 'http' | 'yanit' }>} */
  const gruplar = new Map();
  for (const s of satirlar) {
    const k = servisKosusuGetir(vt, String(s.id));
    if (!k) continue;
    const m = kayittanMesaj(k.sonuc, String(s.durum), tur);
    if (!m) continue;
    const metin = yakalananMetniMaskele(m.metin, { ekAdlar });
    if (!metin) continue;
    const operasyon = typeof k.sonuc.operasyon === 'string' ? k.sonuc.operasyon : null;
    const kalip = `${operasyon ?? ''}\u0001${normalMetin(metin).replace(/\d+/g, '#')}`;
    const g = gruplar.get(kalip) ?? { metin, operasyon, sayi: 0, senaryoIdleri: [], hataTuru: m.hataTuru };
    gruplar.set(kalip, g);
    g.sayi++;
    if (k.senaryoId && !g.senaryoIdleri.includes(k.senaryoId)) g.senaryoIdleri.push(k.senaryoId);
  }
  const mesajlar = [...gruplar.values()].sort((a, b) => b.sayi - a.sayi).slice(0, 50);
  return { hataGunu: SERVIS_HATA_GUNU, uyariGunu: SERVIS_UYARI_GUNU, hatalar, mesajlar };
}

/** @param {Veritabani} vt @param {string} projeId @param {unknown} d */
function ortamBul(vt, projeId, d) {
  const ortamlar = ortamlariListele(vt, projeId);
  if (typeof d === 'string' && d) {
    if (!ortamlar.some((o) => o.id === d)) throw new DepoHatasi('Ortam bulunamadı.');
    return d;
  }
  const o = ortamlar.find((x) => x.varsayilan) ?? ortamlar[0];
  if (!o) throw new DepoHatasi('Projede ortam yok.');
  return o.id;
}

/**
 * Öneri bağlamı (okuma) ve öneriler. Hiçbir şey yazılmaz, istek atılmaz.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId: string; ortamId?: string | null; operasyon?: string | null; kombinasyonAlanlari?: string[] | null; reddedilenleriGoster?: boolean; ustSinir?: number }} g
 * @param {Date} [simdi]
 */
export function servisOnerileriniUret(vt, projeId, g, simdi = new Date()) {
  const servis = servisGetir(vt, g.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const ortamId = ortamBul(vt, projeId, g.ortamId);
  const tablolar = tablolariListele(vt, projeId);
  const ortamTablolari = tablolar.map((t) => ({ ...t, satirlar: t.satirlar.filter((r) => !r.ortamId || r.ortamId === ortamId) }));
  const metotlar = servisOneriMetotlari(servis, tablolar, ekGizliAdlar(vt));
  if (g.operasyon && !metotlar.some((m) => m.ad === g.operasyon)) throw new DepoHatasi(`"${g.operasyon}" metodu bu serviste yok.`);
  const kosular = servisKosulariniListele(vt, { servisId: servis.id, sinir: 1000 });
  const tur = servis.tur === 'rest' ? 'rest' : 'soap';
  const senaryolar = servisSenaryolariniListele(vt, servis.id).filter((s) => /** @type {any} */ (s.icerik).tur !== 'akis').map((s) => {
    const son = kosular.find((k) => k.senaryoId === s.id && (!k.ortamId || k.ortamId === ortamId));
    const m = metotlar.find((x) => x.ad === s.icerik.operasyon);
    /** @type {Array<Record<string, unknown>> | null} */
    let satirlar = null;
    if (m) {
      // Tabloya bağlı alanların koşuda çözülen (gizli olmayan) değerleri: seçili satır / veri koşusunun her satırı.
      const oku = metotErisimi(tur, m, servis.ayarlar.soapSurumu).oku(/** @type {any} */ (s.icerik));
      const veri = Object.fromEntries(Object.entries(oku.degerler).filter(([, v]) => v.kaynak === 'tablo' && v.deger).map(([yol, v]) => [yol, `\${${v.deger}}`]));
      if (Object.keys(veri).length) {
        try { satirlar = degerSatirlari(veri, /** @type {any} */ (s.icerik).veriKosulari ?? null, s.icerik.tabloSecimleri ?? null, tablolar, ortamId); } catch { satirlar = null; }
      }
    }
    return { id: s.id, baslik: s.baslik, icerik: /** @type {any} */ (s.icerik), sonDurum: son ? son.durum : null, ...(satirlar ? { degerSatirlari: satirlar } : {}) };
  });
  const sonuc = servisOnerileri({
    servis: { id: servis.id, tur, ...(servis.ayarlar.soapSurumu ? { soapSurumu: servis.ayarlar.soapSurumu } : {}) }, metotlar, senaryolar,
    tablolar: /** @type {any} */ (ortamTablolari), ortamId, operasyon: g.operasyon ?? null, kombinasyonAlanlari: g.kombinasyonAlanlari ?? null,
    gecmis: servisOneriGecmisi(vt, projeId, servis.id, ortamId, simdi), kararlar: oneriKararlariniOku(vt, projeId, 'servis'),
    reddedilenleriGoster: g.reddedilenleriGoster === true, ...(g.ustSinir ? { ustSinir: g.ustSinir } : {}), simdi
  });
  return {
    ...sonuc, ortamId, metotlar: metotlar.map((m) => ({ ad: m.ad, senaryoSayisi: senaryolar.filter((s) => s.icerik.operasyon === m.ad).length, alanSayisi: m.alanlar.length })),
    // WSDL şeması kısıtlardan önce alınmışsa (kayıtlı şemada "kisit" yok) kullanıcı bilgilendirilir; yeniden alma onun kararıdır (istek atar).
    ...(tur === 'soap' && metotlar.some((m) => m.sema) && !metotlar.some((m) => m.alanlar.some((x) => x.kisit)) ? { semaNotu: true } : {})
  };
}
