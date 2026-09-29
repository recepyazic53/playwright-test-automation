// TABLO BİRLEŞTİRME (Veri > Veri sağlığı > Birleştirilebilecek tablolar). Adları farklı, başlıkları aynı (esnek
// karşılaştırma; tablo-benzerligi.mjs) tablolar kullanıcının seçtiği KALACAK tabloda toplanır; birleştirilen tabloları kullanan her şey
// kalan tabloya yeniden eşlenir. Karar kullanıcınındır: önizleme gösterilir, onay olmadan hiçbir şey yazılmaz.
//   · Satırlar: kalan tablonun satırları başta, kaynakların FARKLI satırları sona eklenir (aynı ortam + aynı değerler = aynı satır,
//     eklenmez). Aynı adlı (aynı ortamdaki) satırın değerleri farklıysa satır satır seçim: 'kalan' | 'kaynak' | 'ikisi' (varsayılan:
//     ikisi — kaynaktaki satır "<ad> (<tablo>)" adıyla eklenir). Gizli sütunlar değer gösterilmeden "aynı / farklı" diye karşılaştırılır.
//     Satırın ortamı korunur (ortama özel satır kendi ortamında kalır).
//   · Sütunlar: kaynak sütun → kalan sütun eşlemesi (birebir normal ad kesin; benzeyen öneri — kullanıcı onaylar; eşleşmeyen yeni sütun
//     olarak eklenir). Gizlilik ayarı farklı iki sütun eşlenemez (engel).
//   · Karşılıklar (değer → sayfa / servis): çakışmada seçim ('kalan' varsayılan | 'kaynak').
//   · Yeniden eşleme: ekran alan bağları, servis alan bağları, ekran senaryosu değerleri (${Tablo.Sütun}), servis gövdesi / yol /
//     başlıkları ve akış senaryosu adımları, satır seçimleri (tabloSecimleri), servis hesaplama kuralları ve alan varsayılanları,
//     servis akışları. Sütun adları da çevrilir. Kaynak tablodaki satırla çözülen başvurunun birleşik tabloda BAŞKA satıra düşmemesi
//     için gerekirse satır seçimi eklenir (o satırın açık sütun değerleri; gizli değer yazılmaz).
//   · KURU DOĞRULAMA: etkilenen her ekran senaryosu ve servis isteği, hiçbir şey çalıştırılmadan koşucunun / servisin kendi
//     çözümleyicileriyle (ekranBasvurulariniCoz, servisIstegiKuruCoz) eski ve yeni hâlde, HER ORTAMDA çözülür; bir değer farklıysa ya
//     da çözülemez hâle geliyorsa birleştirme YAPILMAZ, fark listesi döner (değer gösterilmez).
//   · Onay → tek işlem (vt.islem); değişiklik geçmişine kayıt; önce otomatik yedek (uç). BİRLEŞTİRME GEÇMİŞİ: her birleştirme
//     şifreli ayarda (tabloBirlestirme.gecmis:<projeId>) bir kayıt olarak saklanır: dokunduğu kayıtların önceki ham hâli (kasa
//     zarfları olduğu gibi), özet sayılar, yedek adı, durum (etkin / geri alındı). Eski tek kayıt (tabloBirlestirme.son:) ilk okumada
//     geçmişe taşınır. Herhangi bir kayıt geri alınabilir; ancak ondan SONRA yapılmış, hâlâ etkin ve aynı tabloları (kalan / kaynak)
//     ya da aynı kayıtları etkilemiş bir birleştirme varsa önce o geri alınmalıdır. Kayıtlar birleştirmeden sonra elle değiştiyse
//     geri alınmaz (yedekten dönüş önerilir).
//   · Kaynak tablolar birleştirmede SİLİNMEZ; ayrı onayla (kaynaklariSil) silinir — yalnız artık hiçbir yerde kullanılmıyorlarsa.
import { createHash, randomUUID } from 'node:crypto';
import { DepoHatasi, ayarGetir, ayarYaz, ekranlariListele, gecmisYaz, ortamGetir, ortamlariListele } from '../veritabani/depo.mjs';
import { acikAnahtar, zarflariCoz } from '../kasa.mjs';
import { modelBaglami, senaryoAkisi, senaryoOrtamVerileriniYaz, veriGudumluMu } from '../senaryolar/senaryo-servisi.mjs';
import { modelSenaryosuMu } from '../senaryolar/model-kosusu.mjs';
import {
  servisAkislariniListele, servisAkisiKaydet, servisKaydet, servisleriListele, servisSenaryolariniListele, servisSenaryosuKaydet
} from '../servisler/servis-deposu.mjs';
import { servisIstegiKuruCoz } from '../servisler/servis-islemleri.mjs';
import { BAGLAM_ONEKI, EN_COK_SATIR, EN_COK_SUTUN, TABLO_ADI, tabloKaydet, tabloSil, tablolariListele } from './tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet, etkinAlanBaglari, tabloEkranKullanimi } from './ekran-baglari.mjs';
import { ekranBasvurulariniCoz, modelAlanBilgisi } from './ekran-basvurulari.mjs';
import { basvuru, basvuruCoz, degerBasvurusu, grupAnahtari, secilenSatir, sutunBul } from './tablo-secimi.mjs';
import { baslikNormal, birlestirmeOnerileri, sutunEslemesiOner, tabloTuru } from './tablo-benzerligi.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./tablo-deposu.mjs').Tablo} Tablo */
/** @typedef {Record<string, any>} Nesne */
/** @typedef {{ ad: string; gizli: boolean; tip?: string; karsiliklar?: Record<string, { sayfa?: string; servis?: string }> }} BSutun */
/** @typedef {{ id?: string; ad: string; ortamId: string | null; degerler: Record<string, string | null>; kaynakTablo?: string }} BSatir */
/** @typedef {{ id: string; ad: string; sutunlar: BSutun[]; satirlar: BSatir[] }} BTablo */
/** @typedef {{ yeniAd: string; sutunlar: Map<string, string> }} AdEslemi eski sütun (küçük harf) → yeni sütun adı */
/** @typedef {{ tur: 'ekran' | 'servis'; kaynakId: string; kaynakAdi: string; senaryoId: string; baslik: string; ortam: string; alanlar: string[]; neden: string }} Fark */

export const MASKE = '•••';
const GERI_AL = Symbol('geri-al');
/** Eski (tek kayıt) anahtar: ilk okumada geçmişe taşınır. */
const ESKI_AYAR_ONEKI = 'tabloBirlestirme.son:';
const GECMIS_ONEKI = 'tabloBirlestirme.gecmis:';
/** Geçmişte en çok bu kadar kayıt tutulur (önce geri alınmış, sonra en eski kayıtlar düşer). */
const EN_COK_GECMIS = 50;
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const dolu = (/** @type {unknown} */ v) => v !== null && v !== undefined && v !== '';
/** @template T @param {T} d @returns {T} */
const kopya = (d) => JSON.parse(JSON.stringify(d));
const ozet = (/** @type {unknown} */ x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 32);
/** Eski servis parametresi adı (${USER.NAME} gibi): tablo yoksa kırık sayılmaz. */
const ESKI_PARAMETRE = /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/;

// ---------------------------------------------------------------------------------------------------------------------------
// Başvuru yazımı (saf)
// ---------------------------------------------------------------------------------------------------------------------------

/** Metindeki ${…} başvuruları (akis: / hesap: hariç; hesap bloklarının içindekiler dahil). @param {string} metin */
export function metindekiBasvurular(metin) {
  /** @type {import('./tablo-secimi.mjs').Basvuru[]} */
  const sonuc = [];
  for (const m of String(metin).matchAll(/\$\{([^{}]+)\}/g)) {
    const ic = m[1].trim();
    if (/^(akis|hesap)\s*:/.test(ic)) continue;
    const b = basvuruCoz(ic);
    if (b) sonuc.push(b);
  }
  return sonuc;
}

/**
 * Metindeki tablo başvurularını eşleme göre yeniden yazar (${Eski.Sütun} → ${Yeni.Sütun'}; etiket ve biçim korunur).
 * @param {string} metin @param {Map<string, AdEslemi>} eslem eski tablo adı (küçük harf) → yeni ad + sütun eşlemi
 */
export function metniYenidenYaz(metin, eslem) {
  return String(metin).replace(/\$\{([^{}]+)\}/g, (tum, ham) => {
    const ic = String(ham).trim();
    if (/^(akis|hesap)\s*:/.test(ic)) return tum;
    const b = basvuruCoz(ic);
    const e = b ? eslem.get(kucuk(b.tablo)) : undefined;
    if (!b || !e) return tum;
    return `\${${basvuru(e.yeniAd, e.sutunlar.get(kucuk(b.sutun)) ?? b.sutun, b.etiket, b.bicim)}}`;
  });
}

/** Değerdeki (iç içe) tüm metinlerde başvuruları yeniden yazar. @param {unknown} v @param {Map<string, AdEslemi>} eslem @returns {unknown} */
export function derinYenidenYaz(v, eslem) {
  if (typeof v === 'string') return v.includes('${') ? metniYenidenYaz(v, eslem) : v;
  if (Array.isArray(v)) return v.map((x) => derinYenidenYaz(x, eslem));
  if (nesneMi(v)) return Object.fromEntries(Object.entries(/** @type {Nesne} */ (v)).map(([k, x]) => [k, derinYenidenYaz(x, eslem)]));
  return v;
}

/** Değerdeki (iç içe) tüm metinlerin başvuruları. @param {unknown} v @param {import('./tablo-secimi.mjs').Basvuru[]} [sonuc] */
function derinBasvurular(v, sonuc = []) {
  if (typeof v === 'string') { if (v.includes('${')) sonuc.push(...metindekiBasvurular(v)); }
  else if (Array.isArray(v)) for (const x of v) derinBasvurular(x, sonuc);
  else if (nesneMi(v)) for (const x of Object.values(/** @type {Nesne} */ (v))) derinBasvurular(x, sonuc);
  return sonuc;
}

/**
 * Satır seçimlerini (tabloSecimleri: "<tabloId>|<etiket>" → { Sütun: değer }) eşlemeyle yeniden yazar. Aynı gruba düşen iki seçim
 * çelişirse cakisma döner.
 * @param {Record<string, Record<string, string>>} secimler @param {Map<string, { hedefId: string; sutunlar: Map<string, string> }>} idEslem
 */
export function secimleriYenidenYaz(secimler, idEslem) {
  /** @type {Record<string, Record<string, string>>} */
  const yeni = {};
  let cakisma = '';
  let degisti = false;
  const girdiler = Object.entries(secimler).sort(([a], [b]) => Number(idEslem.has(a.split('|')[0])) - Number(idEslem.has(b.split('|')[0])));
  for (const [anahtar, secim] of girdiler) {
    const i = anahtar.indexOf('|');
    const id = i < 0 ? anahtar : anahtar.slice(0, i);
    const etiket = i < 0 ? '' : anahtar.slice(i + 1);
    const e = idEslem.get(id);
    const hedef = e ? grupAnahtari(e.hedefId, etiket) : anahtar;
    if (e) degisti = true;
    const g = (yeni[hedef] ??= {});
    for (const [s, d] of Object.entries(secim ?? {})) {
      const ad = e ? e.sutunlar.get(kucuk(s)) ?? s : s;
      if (g[ad] !== undefined && g[ad] !== d) cakisma = `aynı satır seçiminde "${ad}" için iki farklı değer`;
      g[ad] = d;
    }
  }
  return { secimler: yeni, degisti, cakisma };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Kullanım (hangi tablo nerede) ve kırık başvurular
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ ekranBaglari: number; servisBaglari: number; senaryoBasvurulari: number; satirSecimleri: number; hesapKurallari: number; toplam: number }} Kullanim
 * @typedef {{ tur: 'ekran-bagi' | 'servis-bagi' | 'ekran-senaryosu' | 'servis-senaryosu' | 'satir-secimi' | 'hesap-kurali' | 'servis-akisi';
 *   yer: string; basvuru: string; neden: string; git: string }} KirikBasvuru
 */

/**
 * Projedeki her tablonun kullanımı ve kırık başvurular (silinmiş tabloyu / sütunu gösteren bağ, senaryo, seçim, kural). Kasa açık olmalı.
 * @param {Veritabani} vt @param {string} projeId
 * @returns {{ kullanim: Record<string, Kullanim>; kirik: KirikBasvuru[] }}
 */
export function tabloKullanimlari(vt, projeId) {
  const tablolar = tablolariListele(vt, projeId);
  const adla = new Map(tablolar.map((t) => [kucuk(t.ad), t]));
  const idle = new Map(tablolar.map((t) => [t.id, t]));
  /** @type {Record<string, Kullanim>} */
  const kullanim = Object.fromEntries(tablolar.map((t) => [t.id, { ekranBaglari: 0, servisBaglari: 0, senaryoBasvurulari: 0, satirSecimleri: 0, hesapKurallari: 0, toplam: 0 }]));
  /** @type {KirikBasvuru[]} */
  const kirik = [];
  const say = (/** @type {string} */ id, /** @type {keyof Omit<Kullanim, 'toplam'>} */ k) => { const u = kullanim[id]; if (u) { u[k]++; u.toplam++; } };
  const q = encodeURIComponent;
  /** Başvuru (ad ile): tablo / sütun var mı. @param {import('./tablo-secimi.mjs').Basvuru} b @param {boolean} servisMi */
  const basvuruDenetle = (b, servisMi) => {
    const t = adla.get(kucuk(b.tablo));
    if (!t) return servisMi && ESKI_PARAMETRE.test(`${b.tablo}.${b.sutun}`) && !b.etiket ? null : { neden: `"${b.tablo}" adında tablo yok` };
    if (!sutunBul(t, b.sutun)) return { t, neden: `"${t.ad}" tablosunda "${b.sutun}" sütunu yok` };
    return { t, neden: '' };
  };
  /** @param {Record<string, Record<string, string>> | undefined} secimler @param {string} yer @param {string} git */
  const secimleriDenetle = (secimler, yer, git) => {
    for (const [anahtar, secim] of Object.entries(nesneMi(secimler) ? /** @type {Record<string, Record<string, string>>} */ (secimler) : {})) {
      const t = idle.get(anahtar.split('|')[0]);
      if (!t) { kirik.push({ tur: 'satir-secimi', yer, basvuru: anahtar.split('|')[1] ? `[${anahtar.split('|')[1]}]` : 'satır seçimi', neden: 'seçimdeki tablo silinmiş', git }); continue; }
      say(t.id, 'satirSecimleri');
      for (const s of Object.keys(secim ?? {})) if (!sutunBul(t, s)) kirik.push({ tur: 'satir-secimi', yer, basvuru: `${t.ad}.${s}`, neden: `"${t.ad}" tablosunda "${s}" sütunu yok`, git });
    }
  };
  for (const ekran of ekranlariListele(vt, projeId)) {
    const git = `#/ekranlar/e/${q(ekran.id)}`;
    for (const [alan, b] of Object.entries(ekranAlanBaglari(vt, ekran.id))) {
      const t = idle.get(b.tablo);
      if (!t) { kirik.push({ tur: 'ekran-bagi', yer: `Ekran: ${ekran.ad}`, basvuru: alan, neden: 'bağlı tablo silinmiş', git }); continue; }
      say(t.id, 'ekranBaglari');
      if (!sutunBul(t, b.sutun)) kirik.push({ tur: 'ekran-bagi', yer: `Ekran: ${ekran.ad}`, basvuru: `${alan} → ${t.ad}.${b.sutun}`, neden: `"${t.ad}" tablosunda "${b.sutun}" sütunu yok`, git });
    }
  }
  for (const s of vt.tumu('SELECT id, ekran_id, baslik, icerik_json FROM senaryolar WHERE proje_id = ?', [projeId])) {
    const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
    const git = `#/senaryolar/duzenle/${q(String(s.id))}`;
    const yer = `Ekran senaryosu: ${String(s.baslik)}`;
    /** @type {Set<string>} */
    const gorulen = new Set();
    for (const o of Object.values(nesneMi(icerik.ortamlar) ? icerik.ortamlar : {})) {
      if (!nesneMi(o) || !nesneMi(o.veri)) continue;
      for (const v of Object.values(/** @type {Nesne} */ (o.veri))) {
        const b = degerBasvurusu(v);
        if (!b) continue;
        const d = basvuruDenetle(b, false);
        const k = `${b.tablo}.${b.sutun}`;
        if (gorulen.has(k)) continue;
        gorulen.add(k);
        if (d?.t) say(d.t.id, 'senaryoBasvurulari');
        if (d?.neden) kirik.push({ tur: 'ekran-senaryosu', yer, basvuru: `\${${basvuru(b.tablo, b.sutun, b.etiket)}}`, neden: d.neden, git });
      }
    }
    secimleriDenetle(icerik.tabloSecimleri, yer, git);
  }
  for (const servis of servisleriListele(vt, projeId)) {
    const git = `#/servisler/s/${q(servis.id)}`;
    for (const [op, alanlar] of Object.entries(servis.ayarlar.alanBaglari ?? {})) {
      for (const [yol, b] of Object.entries(alanlar ?? {})) {
        if (!b?.tablo) continue;
        const t = idle.get(b.tablo);
        if (!t) { kirik.push({ tur: 'servis-bagi', yer: `Servis: ${servis.ad} · ${op}`, basvuru: yol, neden: 'bağlı tablo silinmiş', git }); continue; }
        say(t.id, 'servisBaglari');
        if (b.sutun && !sutunBul(t, b.sutun)) kirik.push({ tur: 'servis-bagi', yer: `Servis: ${servis.ad} · ${op}`, basvuru: `${yol} → ${t.ad}.${b.sutun}`, neden: `"${t.ad}" tablosunda "${b.sutun}" sütunu yok`, git });
      }
    }
    for (const [ad, ifade] of Object.entries(servis.ayarlar.tarihKurallari ?? {})) {
      for (const b of metindekiBasvurular(String(ifade))) {
        const d = basvuruDenetle(b, false);
        if (d?.t) say(d.t.id, 'hesapKurallari');
        if (d?.neden) kirik.push({ tur: 'hesap-kurali', yer: `Servis: ${servis.ad} · kural ${ad}`, basvuru: `\${${basvuru(b.tablo, b.sutun, b.etiket)}}`, neden: d.neden, git });
      }
    }
    for (const x of servisSenaryolariniListele(vt, servis.id)) {
      const yer = `Servis senaryosu: ${servis.ad} · ${x.baslik}`;
      const sgit = `#/servisler/s/${q(servis.id)}/senaryo/${q(x.id)}`;
      /** @type {Set<string>} */
      const gorulen = new Set();
      for (const b of derinBasvurular(x.icerik)) {
        const d = basvuruDenetle(b, true);
        const k = `${b.tablo}.${b.sutun}`;
        if (!d || gorulen.has(k)) continue;
        gorulen.add(k);
        if (d.t) say(d.t.id, 'senaryoBasvurulari');
        if (d.neden) kirik.push({ tur: 'servis-senaryosu', yer, basvuru: `\${${basvuru(b.tablo, b.sutun, b.etiket)}}`, neden: d.neden, git: sgit });
      }
      const ic = /** @type {Nesne} */ (x.icerik);
      secimleriDenetle(ic.tabloSecimleri, yer, sgit);
      for (const a of Object.values(nesneMi(ic.adimlar) ? ic.adimlar : {})) if (nesneMi(a)) secimleriDenetle(/** @type {Nesne} */ (a).tabloSecimleri, yer, sgit);
    }
  }
  for (const a of servisAkislariniListele(vt, projeId)) {
    for (const b of derinBasvurular(a.icerik)) {
      const d = basvuruDenetle(b, true);
      if (d?.t) say(d.t.id, 'senaryoBasvurulari');
      if (d?.neden) kirik.push({ tur: 'servis-akisi', yer: `Servis akışı: ${a.baslik}`, basvuru: `\${${basvuru(b.tablo, b.sutun, b.etiket)}}`, neden: d.neden, git: '#/servisler' });
    }
  }
  return { kullanim, kirik };
}

/** Satır imzası (sütun normal adıyla, sıradan bağımsız; ortam dahil; gizli değerler dahil — yalnız özet, değer dönmez). */
const satirImzasi = (/** @type {{ ortamId: string | null; degerler: Record<string, string | null> }} */ r, /** @type {Array<{ ad: string }>} */ sutunlar) =>
  ozet([r.ortamId ?? '', sutunlar.map((s) => [baslikNormal(s.ad), String(r.degerler[s.ad] ?? '')]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]);

/**
 * Veri sağlığı özeti (Test verisi ekranının üstü): birleştirilebilecek tablolar, hiç kullanılmayan tablolar, boş sütunlar, kırık
 * başvurular ve geri alınabilir son birleştirme. Değer dönmez.
 * @param {Veritabani} vt @param {string} projeId
 */
export function veriSagligi(vt, projeId) {
  acikAnahtar(vt);
  const tablolar = tablolariListele(vt, projeId, { cozulsun: true });
  const ek = tabloEkranKullanimi(vt, projeId);
  const { kullanim, kirik } = tabloKullanimlari(vt, projeId);
  const oneriler = birlestirmeOnerileri(tablolar.map((t) => ({ id: t.id, ad: t.ad, sutunlar: t.sutunlar, kaynak: t.kaynak ?? null, satirImzalari: t.satirlar.map((r) => satirImzasi(r, t.sutunlar)) })), ek);
  const ad = new Map(tablolar.map((t) => [t.id, t.ad]));
  const gecmis = gecmisOku(vt, projeId);
  // Eşik altı öneriler arayüzde varsayılan gizli ("Düşük benzerlikleri de göster"); karar Veri'de.
  let benzerlikEsigi = 50;
  try { benzerlikEsigi = kosuAyarlariniOku(vt).benzerlikEsigi; } catch { /* varsayılan */ }
  return {
    benzerlikEsigi,
    benzer: oneriler.map((o) => ({ ...o, adlar: o.tablolar.map((id) => ad.get(id) ?? id) })),
    kullanilmayan: tablolar.filter((t) => !kullanim[t.id]?.toplam).map((t) => ({ id: t.id, ad: t.ad, tur: tabloTuru(t, ek) })),
    bosSutunlar: tablolar.filter((t) => t.satirlar.length).flatMap((t) => t.sutunlar.filter((s) => t.satirlar.every((r) => !dolu(r.degerler[s.ad])))
      .map((s) => ({ tabloId: t.id, tablo: t.ad, sutun: s.ad }))),
    kirikBasvurular: kirik,
    kullanim,
    birlestirmeGecmisi: { toplam: gecmis.length, etkin: gecmis.filter((k) => k.durum !== 'geriAlindi').length }
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Birleştirme planı
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ kalanId: string; kaynakIdler: string[]; yeniAd?: string; sutunEslemeleri?: Record<string, Record<string, string>>;
 *   satirSecimleri?: Record<string, 'kalan' | 'kaynak' | 'ikisi'>; karsilikSecimleri?: Record<string, 'kalan' | 'kaynak'> }} BirlestirmeGirdisi
 *   sutunEslemeleri: kaynakId → { kaynakSütun: kalanSütun | '' (yeni sütun) }
 */

/** @param {unknown} v */
function idListesi(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x)))];
}

/**
 * Bellekte plan: birleşik tablo, eşlemeler, çakışmalar, engeller. Hiçbir şey yazılmaz.
 * @param {Veritabani} vt @param {string} projeId @param {BirlestirmeGirdisi} girdi
 */
function planla(vt, projeId, girdi) {
  const tumu = tablolariListele(vt, projeId, { cozulsun: true });
  const kalan = tumu.find((t) => t.id === girdi.kalanId);
  if (!kalan || kalan.id.startsWith(BAGLAM_ONEKI)) throw new DepoHatasi('Kalacak tablo bulunamadı.');
  const kaynakIdler = idListesi(girdi.kaynakIdler).filter((id) => id !== kalan.id);
  if (!kaynakIdler.length) throw new DepoHatasi('Birleştirilecek en az bir tablo seçin.');
  const kaynaklar = kaynakIdler.map((id) => {
    const t = tumu.find((x) => x.id === id);
    if (!t) throw new DepoHatasi('Birleştirilecek tablo bulunamadı.');
    return t;
  });
  const ek = tabloEkranKullanimi(vt, projeId);
  /** @type {string[]} */
  const engeller = [];
  const kalanTuru = tabloTuru(kalan, ek);
  for (const k of kaynaklar) if (tabloTuru(k, ek) !== kalanTuru) engeller.push(`"${k.ad}" ${kalanTuru === 'liste' ? 'bir kişi / kayıt tablosu' : 'bir ekran listesi'}; yalnız aynı türdeki tablolar birleştirilir.`);
  const yeniAd = typeof girdi.yeniAd === 'string' && girdi.yeniAd.trim() ? girdi.yeniAd.trim() : kalan.ad;
  if (!TABLO_ADI.test(yeniAd)) throw new DepoHatasi(`Tablo adı geçersiz: "${yeniAd}" (en çok 60 karakter; . [ ] { } $ < > & | kullanılamaz).`);
  const cakisanAd = tumu.find((t) => t.id !== kalan.id && kucuk(t.ad) === kucuk(yeniAd));
  if (cakisanAd) engeller.push(`"${yeniAd}" adında başka bir tablo var${kaynakIdler.includes(cakisanAd.id) ? ' (birleştirilen tablo; önce silinmeden bu ad verilemez)' : ''}.`);

  // --- Sütunlar ---
  /** @type {BSutun[]} */
  const sutunlar = kalan.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli, tip: s.tip, karsiliklar: { ...(s.karsiliklar ?? {}) } }));
  /** @type {Array<{ kaynakId: string; kaynakTablo: string; kaynak: string; hedef: string | null; kesin: boolean; onerilen: string | null; gizli: boolean }>} */
  const eslemeler = [];
  /** @type {Map<string, Map<string, string>>} kaynakId → kaynak sütun (küçük) → birleşik sütun adı */
  const sutunEslemi = new Map();
  // Biri gizli biri açık iki sütun eşleşirse birleşik sütun GİZLİ olur (engel değil); önizlemede not. Değerler şifreli yazılır,
  // satır çakışmalarında ve önizlemede maskelenir; kuru doğrulama yeni (gizli) hâle göre çözer.
  /** @type {Map<string, string>} birleşik sütun adı → not */
  const gizliNotlari = new Map();
  /** @param {BSutun} b */
  const gizliYap = (b) => { b.gizli = true; b.karsiliklar = {}; gizliNotlari.set(b.ad, 'Bu sütun gizli olacak (kaynakta gizliydi)'); };
  for (const k of kaynaklar) {
    const oneri = sutunEslemesiOner(k.sutunlar, kalan.sutunlar);
    const secim = nesneMi(girdi.sutunEslemeleri?.[k.id]) ? /** @type {Record<string, string>} */ (girdi.sutunEslemeleri?.[k.id]) : {};
    /** @type {Map<string, string>} */
    const m = new Map();
    /** @type {Set<string>} */
    const kullanilan = new Set();
    for (const o of oneri) {
      const s = /** @type {import('./tablo-deposu.mjs').TabloSutunu} */ (k.sutunlar.find((x) => x.ad === o.kaynak));
      const verilen = Object.hasOwn(secim, o.kaynak) ? secim[o.kaynak] : undefined;
      const hedefAd = verilen === undefined ? o.hedef : verilen === '' ? null : verilen;
      const hedef = hedefAd === null ? undefined : kalan.sutunlar.find((x) => x.ad === hedefAd);
      if (hedefAd !== null && !hedef) throw new DepoHatasi(`"${k.ad}" tablosunun "${o.kaynak}" sütunu için seçilen "${hedefAd}" sütunu kalan tabloda yok.`);
      if (hedef && kullanilan.has(hedef.ad)) engeller.push(`"${k.ad}" tablosunun iki sütunu aynı "${hedef.ad}" sütununa eşlenmiş.`);
      if (hedef) kullanilan.add(hedef.ad);
      if (hedef && hedef.gizli !== s.gizli) gizliYap(/** @type {BSutun} */ (sutunlar.find((x) => x.ad === hedef.ad)));
      /** @type {string} */
      let son;
      if (hedef) son = hedef.ad;
      else {
        const var_ = sutunlar.find((x) => kucuk(x.ad) === kucuk(s.ad));
        if (var_ && kalan.sutunlar.some((x) => x.ad === var_.ad)) engeller.push(`"${k.ad}.${s.ad}" yeni sütun olarak eklenemez: kalan tabloda aynı adda sütun var (eşleyin).`);
        if (!var_) sutunlar.push({ ad: s.ad, gizli: s.gizli, tip: s.tip, karsiliklar: {} });
        else if (var_.gizli !== s.gizli) gizliYap(var_);
        son = var_ ? var_.ad : s.ad;
      }
      m.set(kucuk(s.ad), son);
      eslemeler.push({ kaynakId: k.id, kaynakTablo: k.ad, kaynak: s.ad, hedef: hedef ? hedef.ad : null, kesin: o.kesin, onerilen: o.hedef, gizli: s.gizli });
    }
    sutunEslemi.set(k.id, m);
  }
  if (sutunlar.length > EN_COK_SUTUN) engeller.push(`Birleşik tabloda en çok ${EN_COK_SUTUN} sütun olabilir (${sutunlar.length}).`);
  const onayBekleyen = eslemeler.filter((e) => !e.kesin && girdi.sutunEslemeleri?.[e.kaynakId]?.[e.kaynak] === undefined);

  // --- Karşılıklar ---
  /** @type {Array<{ anahtar: string; sutun: string; deger: string; kaynakTablo: string; kalan: { sayfa?: string; servis?: string }; kaynak: { sayfa?: string; servis?: string }; secim: 'kalan' | 'kaynak' }>} */
  const karsilikCakismalari = [];
  for (const k of kaynaklar) {
    const m = /** @type {Map<string, string>} */ (sutunEslemi.get(k.id));
    for (const s of k.sutunlar) {
      if (s.gizli || !s.karsiliklar) continue;
      const hedef = /** @type {BSutun} */ (sutunlar.find((x) => x.ad === m.get(kucuk(s.ad))));
      hedef.karsiliklar ??= {};
      for (const [deger, kr] of Object.entries(s.karsiliklar)) {
        const var_ = hedef.karsiliklar[deger];
        if (!var_) { hedef.karsiliklar[deger] = { ...kr }; continue; }
        if (JSON.stringify(var_) === JSON.stringify(kr)) continue;
        const anahtar = `${hedef.ad}|${deger}`;
        const secim = girdi.karsilikSecimleri?.[anahtar] === 'kaynak' ? 'kaynak' : 'kalan';
        karsilikCakismalari.push({ anahtar, sutun: hedef.ad, deger, kaynakTablo: k.ad, kalan: { ...var_ }, kaynak: { ...kr }, secim });
        if (secim === 'kaynak') hedef.karsiliklar[deger] = { ...kr };
      }
    }
  }

  // --- Satırlar ---
  const gizliSutunlar = new Set(sutunlar.filter((s) => s.gizli).map((s) => s.ad));
  const imza = (/** @type {{ ortamId: string | null; degerler: Record<string, string | null> }} */ r) => ozet([r.ortamId ?? '', sutunlar.map((s) => String(r.degerler[s.ad] ?? ''))]);
  /** @type {BSatir[]} */
  const satirlar = kalan.satirlar.map((r) => ({ id: r.id, ad: r.ad, ortamId: r.ortamId, degerler: { ...r.degerler } }));
  const imzalar = new Set(satirlar.map(imza));
  /** @type {Map<string, BSatir>} kaynak satır kimliği → birleşik tablodaki karşılığı */
  const satirKarsiligi = new Map();
  /** @type {Array<{ anahtar: string; kaynakTablo: string; satir: string; ortam: string | null; sutunlar: Array<{ sutun: string; gizli: boolean; ayni: boolean; kalan: string; kaynak: string }>; secim: 'kalan' | 'kaynak' | 'ikisi' }>} */
  const satirCakismalari = [];
  /** @type {Map<string, { id: string; degerler: Record<string, string | null> }>} kalan satırı → güncellenecek değerler ('kaynak' seçimi) */
  const guncellenecek = new Map();
  let ayniSatir = 0;
  let eklenecek = 0;
  const ortamAdi = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o.ad]));
  const adlar = new Set(satirlar.map((r) => kucuk(r.ad)));
  for (const k of kaynaklar) {
    const m = /** @type {Map<string, string>} */ (sutunEslemi.get(k.id));
    for (const r of k.satirlar) {
      /** @type {Record<string, string | null>} */
      const degerler = Object.fromEntries(sutunlar.map((s) => [s.ad, null]));
      for (const s of k.sutunlar) degerler[/** @type {string} */ (m.get(kucuk(s.ad)))] = r.degerler[s.ad] ?? null;
      const yeni = { ad: r.ad, ortamId: r.ortamId, degerler, kaynakTablo: k.ad };
      const i = imza(yeni);
      if (imzalar.has(i)) {
        ayniSatir++;
        satirKarsiligi.set(r.id, /** @type {BSatir} */ (satirlar.find((x) => imza(x) === i)));
        continue;
      }
      const ayniAdli = satirlar.find((x) => x.id && kucuk(x.ad) === kucuk(r.ad) && (x.ortamId ?? null) === (r.ortamId ?? null));
      if (ayniAdli) {
        const anahtar = `${k.id}|${r.id}`;
        const sec = girdi.satirSecimleri?.[anahtar];
        const secim = sec === 'kalan' || sec === 'kaynak' ? sec : 'ikisi';
        satirCakismalari.push({
          anahtar, kaynakTablo: k.ad, satir: r.ad, ortam: r.ortamId ? ortamAdi.get(r.ortamId) ?? r.ortamId : null, secim,
          sutunlar: sutunlar.map((s) => {
            const a = String(ayniAdli.degerler[s.ad] ?? '');
            const b = String(degerler[s.ad] ?? '');
            return { sutun: s.ad, gizli: s.gizli, ayni: a === b, kalan: s.gizli ? (a ? MASKE : '') : a, kaynak: s.gizli ? (b ? MASKE : '') : b };
          })
        });
        if (secim === 'kalan') { satirKarsiligi.set(r.id, ayniAdli); continue; }
        if (secim === 'kaynak') {
          // Kaynaktaki boş hücre kalanın değerini silmez (yalnız dolu değerler üzerine yazılır).
          for (const [s, v] of Object.entries(degerler)) if (dolu(v)) ayniAdli.degerler[s] = v;
          guncellenecek.set(/** @type {string} */ (ayniAdli.id), { id: /** @type {string} */ (ayniAdli.id), degerler: ayniAdli.degerler });
          imzalar.add(imza(ayniAdli));
          satirKarsiligi.set(r.id, ayniAdli);
          continue;
        }
        let ad = `${r.ad} (${k.ad})`.slice(0, 120);
        for (let n = 2; adlar.has(kucuk(ad)); n++) ad = `${r.ad} (${k.ad} ${n})`.slice(0, 120);
        yeni.ad = ad;
      }
      adlar.add(kucuk(yeni.ad));
      imzalar.add(i);
      satirlar.push(yeni);
      satirKarsiligi.set(r.id, yeni);
      eklenecek++;
    }
  }
  if (satirlar.length > EN_COK_SATIR) engeller.push(`Birleşik tabloda en çok ${EN_COK_SATIR} satır olabilir (${satirlar.length}).`);
  // Kalan tablonun açık sütunu gizli olduysa: o sütunda değeri olan kalan satırlar yeniden yazılır (değer şifreli saklansın).
  const gizlilesen = kalan.sutunlar.filter((s) => !s.gizli && gizliNotlari.has(s.ad)).map((s) => s.ad);
  for (const r of satirlar) {
    if (!r.id || guncellenecek.has(r.id) || !gizlilesen.some((a) => dolu(r.degerler[a]))) continue;
    guncellenecek.set(r.id, { id: r.id, degerler: r.degerler });
  }
  /** @type {BTablo} */
  const birlesik = { id: kalan.id, ad: yeniAd, sutunlar, satirlar };

  // --- Ad ve kimlik eşlemleri ---
  /** @type {Map<string, AdEslemi>} */
  const adEslem = new Map();
  /** @type {Map<string, { hedefId: string; sutunlar: Map<string, string> }>} */
  const idEslem = new Map();
  if (kalan.ad !== yeniAd) adEslem.set(kucuk(kalan.ad), { yeniAd, sutunlar: new Map(kalan.sutunlar.map((s) => [kucuk(s.ad), s.ad])) });
  for (const k of kaynaklar) {
    const m = /** @type {Map<string, string>} */ (sutunEslemi.get(k.id));
    adEslem.set(kucuk(k.ad), { yeniAd, sutunlar: m });
    idEslem.set(k.id, { hedefId: kalan.id, sutunlar: m });
  }
  return {
    tumu, kalan, kaynaklar, yeniAd, birlesik, eslemeler, onayBekleyen, engeller, karsilikCakismalari, satirCakismalari, guncellenecek,
    satirKarsiligi, adEslem, idEslem, gizliSutunlar, ayniSatir, eklenecek, ek, gizliNotlari
  };
}

/** @typedef {ReturnType<typeof planla>} Plan */

/**
 * Bir birimin (senaryo verisi / servis içeriği) kaynak tabloya düşen gruplarında, birleşik tabloda aynı satırın seçileceğini
 * garanti eden satır seçimi (gerekirse). Her ortamda eski satır bulunur; birleşik tabloda farklı satıra düşüyorsa seçime o satırın
 * açık sütun değerleri eklenir (gizli değer yazılmaz). Değişen seçimleri döner.
 * @param {Plan} p @param {{ basvurular: import('./tablo-secimi.mjs').Basvuru[]; secimlerOnce: Record<string, Record<string, string>>;
 *   secimlerSonra: Record<string, Record<string, string>>; baglanmisOnce: (tabloId: string, etiket: string, ortamId: string | null) => Record<string, string>;
 *   baglanmisSonra: (etiket: string, ortamId: string | null) => Record<string, string>; ortamlar: Array<string | null> }} c
 */
function satirSabitle(p, c) {
  let eklenen = 0;
  /** @type {Set<string>} */
  const islenen = new Set();
  for (const b of c.basvurular) {
    const k = p.kaynaklar.find((x) => kucuk(x.ad) === kucuk(b.tablo));
    if (!k || islenen.has(`${k.id}|${b.etiket}`)) continue;
    islenen.add(`${k.id}|${b.etiket}`);
    const m = /** @type {Map<string, string>} */ (p.idEslem.get(k.id)?.sutunlar);
    const hedefGrup = grupAnahtari(p.kalan.id, b.etiket);
    /** @type {Map<string | null, BSatir | undefined>} */
    const eskiler = new Map();
    const dene = () => {
      let uymayan = false;
      for (const o of c.ortamlar) {
        const secB = { ...c.baglanmisOnce(k.id, b.etiket, o), ...(c.secimlerOnce[grupAnahtari(k.id, b.etiket)] ?? {}) };
        const rB = secilenSatir(k, secB, o);
        if (!rB) continue;
        const beklenen = p.satirKarsiligi.get(rB.id);
        eskiler.set(o, beklenen);
        const secA = { ...c.baglanmisSonra(b.etiket, o), ...(c.secimlerSonra[hedefGrup] ?? {}) };
        const rA = secilenSatir(p.birlesik, secA, o);
        if (!rA || !beklenen || !ayniDegerler(rA, beklenen, [...m.values()])) uymayan = true;
      }
      return uymayan;
    };
    if (!dene()) continue;
    const hedefler = [...new Set([...eskiler.values()].filter(Boolean))];
    if (hedefler.length !== 1) continue; // ortama göre farklı satır: kuru doğrulama raporlar
    const satir = /** @type {BSatir} */ (hedefler[0]);
    const secim = { ...(c.secimlerSonra[hedefGrup] ?? {}) };
    for (const s of p.birlesik.sutunlar) if (!s.gizli && dolu(satir.degerler[s.ad]) && secim[s.ad] === undefined) secim[s.ad] = String(satir.degerler[s.ad]).slice(0, 500);
    c.secimlerSonra[hedefGrup] = secim;
    eklenen++;
  }
  return eklenen;
}

/** İki satır verilen sütunlarda aynı değerde mi. @param {BSatir} a @param {BSatir} b @param {string[]} sutunlar */
const ayniDegerler = (a, b, sutunlar) => a === b || sutunlar.every((s) => String(a.degerler[s] ?? '') === String(b.degerler[s] ?? ''));

/**
 * Yeniden eşleme: yazılacak her şey (bellekte; hiçbir şey yazılmaz).
 * @param {Veritabani} vt @param {string} projeId @param {Plan} p
 */
function yenidenEslemePlani(vt, projeId, p) {
  const ilgiliAdlar = new Set([kucuk(p.kalan.ad), ...p.kaynaklar.map((k) => kucuk(k.ad))]);
  const ilgiliIdler = new Set([p.kalan.id, ...p.kaynaklar.map((k) => k.id)]);
  const ortamIdleri = ortamlariListele(vt, projeId).map((o) => o.id);
  const ozetSayilari = { ekranBaglari: 0, servisBaglari: 0, ekranSenaryolari: 0, servisSenaryolari: 0, satirSecimleri: 0, hesapKurallari: 0, varsayilanlar: 0, akislar: 0, sabitlenen: 0 };
  /** @type {string[]} */
  const engeller = [];
  const baglariEsle = (/** @type {Record<string, { tablo: string; sutun: string; etiket?: string }>} */ baglar) => {
    let n = 0;
    const yeni = Object.fromEntries(Object.entries(baglar).map(([alan, b]) => {
      const e = p.idEslem.get(b.tablo);
      if (!e) return [alan, b];
      n++;
      return [alan, { ...b, tablo: e.hedefId, sutun: e.sutunlar.get(kucuk(b.sutun)) ?? b.sutun }];
    }));
    return { yeni, n };
  };

  // --- Ekranlar: bağlar ve senaryolar ---
  /** @type {Array<{ ekranId: string; ad: string; baglar: Record<string, any> }>} */
  const ekranYazimlari = [];
  /** @type {Array<{ senaryoId: string; baslik: string; ekranId: string; ekranAdi: string; ortamVerileri: Record<string, Nesne>; tabloSecimleri?: Record<string, Record<string, string>> | null; alanlar: string[] }>} */
  const ekranSenaryolari = [];
  /** @type {Array<{ senaryoId: string; baslik: string; ekranId: string; ekranAdi: string }>} kuru doğrulamada çözülecek ekran senaryoları */
  const ekranDenetim = [];
  for (const ekran of ekranlariListele(vt, projeId)) {
    const baglarOnce = ekranAlanBaglari(vt, ekran.id);
    const { yeni: baglarSonra, n } = baglariEsle(baglarOnce);
    if (n) { ekranYazimlari.push({ ekranId: ekran.id, ad: ekran.ad, baglar: baglarSonra }); ozetSayilari.ekranBaglari += n; }
    const ekranIlgili = Object.values(etkinAlanBaglari(vt, ekran.id)).some((b) => ilgiliIdler.has(b.tablo));
    /** @type {Map<string, ReturnType<typeof modelAlanBilgisi> | null>} */
    const bilgiler = new Map();
    for (const s of vt.tumu('SELECT id, baslik, icerik_json FROM senaryolar WHERE proje_id = ? AND ekran_id = ?', [projeId, ekran.id])) {
      const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
      if (!modelSenaryosuMu(icerik) || !veriGudumluMu(icerik) || !nesneMi(icerik.ortamlar)) continue;
      const ortamlar = /** @type {Record<string, Nesne>} */ (icerik.ortamlar);
      const oIdleri = Object.keys(ortamlar).filter((o) => nesneMi(ortamlar[o]) && nesneMi(ortamlar[o].veri));
      /** @type {Record<string, Nesne>} */
      const veriler = Object.fromEntries(oIdleri.map((o) => [o, /** @type {Nesne} */ (zarflariCoz(vt, ortamlar[o].veri))]));
      const secimlerOnce = /** @type {Record<string, Record<string, string>>} */ (nesneMi(icerik.tabloSecimleri) ? icerik.tabloSecimleri : {});
      const basvurular = oIdleri.flatMap((o) => Object.values(veriler[o]).map((v) => degerBasvurusu(v)).filter((b) => b !== null));
      const basvuruIlgili = basvurular.some((b) => ilgiliAdlar.has(kucuk(/** @type {any} */ (b).tablo)));
      const secimIlgili = Object.keys(secimlerOnce).some((k) => ilgiliIdler.has(k.split('|')[0]));
      if (!basvuruIlgili && !secimIlgili && !ekranIlgili) continue;
      ekranDenetim.push({ senaryoId: String(s.id), baslik: String(s.baslik), ekranId: ekran.id, ekranAdi: ekran.ad });
      if (!basvuruIlgili && !secimIlgili) continue;
      /** @type {Record<string, Nesne>} */
      const yeniVeriler = {};
      /** @type {Set<string>} */
      const alanlar = new Set();
      for (const o of oIdleri) {
        const yeni = { ...veriler[o] };
        let degisti = false;
        for (const [k, v] of Object.entries(veriler[o])) {
          if (!degerBasvurusu(v)) continue;
          const y = metniYenidenYaz(String(v), p.adEslem);
          if (y !== v) { yeni[k] = y; degisti = true; alanlar.add(k); }
        }
        if (degisti) yeniVeriler[o] = yeni;
      }
      const r = secimleriYenidenYaz(secimlerOnce, p.idEslem);
      if (r.cakisma) engeller.push(`Ekran senaryosu "${String(s.baslik)}": ${r.cakisma}; birleştirmeden önce senaryodaki satır seçimini düzenleyin.`);
      const secimlerSonra = r.secimler;
      // Bağlı düz değerler (çözümleyici bunları da seçim sayar).
      const akis = senaryoAkisi(icerik) ?? '';
      if (!bilgiler.has(akis)) { const mb = modelBaglami(vt, ekran.id, akis || null); bilgiler.set(akis, mb ? modelAlanBilgisi(mb.model) : null); }
      const bilgi = bilgiler.get(akis);
      if (!bilgi) { engeller.push(`Ekran senaryosu "${String(s.baslik)}": ekranın modeli yok; senaryo güncellenemez.`); continue; }
      /** Bağlı düz değerlerden seçim (tablo + etiket grubu). @param {Record<string, any>} baglar @param {(b: any) => string | undefined} sutunAdi @param {(o: string) => Nesne} veri */
      const bagli = (baglar, sutunAdi, veri) => /** @param {string} tabloId @param {string} etiket @param {string | null} o */ (tabloId, etiket, o) => {
        /** @type {Record<string, string>} */
        const secim = {};
        for (const [alanId, b] of Object.entries(baglar)) {
          if (b.tablo !== tabloId || (b.etiket || '') !== etiket) continue;
          const anahtar = bilgi.alanAnahtarlari[alanId];
          const v = anahtar ? veri(String(o))[anahtar] : undefined;
          const ad = sutunAdi(b);
          if (typeof v === 'string' && v.trim() && !degerBasvurusu(v) && ad) secim[ad] = v;
        }
        return secim;
      };
      const once = bagli(baglarOnce, (b) => { const t = p.tumu.find((x) => x.id === b.tablo); const x = t ? sutunBul(t, b.sutun) : undefined; return x && !x.gizli ? x.ad : undefined; }, (o) => veriler[o] ?? {});
      const sonra = bagli(baglarSonra, (b) => { const x = b.tablo === p.kalan.id ? sutunBul(/** @type {any} */ (p.birlesik), b.sutun) : undefined; return x && !x.gizli ? x.ad : undefined; }, (o) => yeniVeriler[o] ?? veriler[o] ?? {});
      const sabit = satirSabitle(p, {
        basvurular: basvurular.map((b) => /** @type {import('./tablo-secimi.mjs').Basvuru} */ (b)),
        secimlerOnce, secimlerSonra, baglanmisOnce: once, baglanmisSonra: (etiket, o) => sonra(p.kalan.id, etiket, o), ortamlar: oIdleri
      });
      ozetSayilari.sabitlenen += sabit;
      const secimDegisti = JSON.stringify(secimlerSonra) !== JSON.stringify(secimlerOnce);
      if (!Object.keys(yeniVeriler).length && !secimDegisti) continue;
      if (secimDegisti) ozetSayilari.satirSecimleri++;
      ozetSayilari.ekranSenaryolari++;
      ekranSenaryolari.push({
        senaryoId: String(s.id), baslik: String(s.baslik), ekranId: ekran.id, ekranAdi: ekran.ad, ortamVerileri: yeniVeriler, alanlar: [...alanlar],
        ...(secimDegisti ? { tabloSecimleri: Object.keys(secimlerSonra).length ? secimlerSonra : null } : {})
      });
    }
  }

  // --- Servisler: ayarlar, senaryolar ---
  /** @type {Array<{ servis: import('../servisler/servis-deposu.mjs').Servis; ayarlar: Nesne }>} */
  const servisYazimlari = [];
  /** @type {Array<{ servis: import('../servisler/servis-deposu.mjs').Servis; senaryo: import('../servisler/servis-deposu.mjs').ServisSenaryosu; icerik: Nesne }>} */
  const servisSenaryolari = [];
  /** @type {Array<{ servisId: string; senaryoId: string }>} */
  const servisDenetim = [];
  const servisler = servisleriListele(vt, projeId);
  for (const servis of servisler) {
    const a = kopya(servis.ayarlar ?? {});
    let degisti = false;
    for (const [op, alanlar] of Object.entries(/** @type {Record<string, Record<string, any>>} */ (a.alanBaglari ?? {}))) {
      for (const [yol, b] of Object.entries(alanlar ?? {})) {
        const e = b?.tablo ? p.idEslem.get(b.tablo) : undefined;
        if (!e) continue;
        a.alanBaglari[op][yol] = { ...b, tablo: e.hedefId, sutun: e.sutunlar.get(kucuk(b.sutun)) ?? b.sutun };
        ozetSayilari.servisBaglari++;
        degisti = true;
      }
    }
    for (const alanlar of Object.values(/** @type {Record<string, Record<string, any>>} */ (a.alanVarsayilanlari ?? {}))) {
      for (const [yol, d] of Object.entries(alanlar ?? {})) {
        if (d?.kaynak !== 'tablo' || typeof d.deger !== 'string') continue;
        const y = metniYenidenYaz(`\${${d.deger}}`, p.adEslem).slice(2, -1);
        if (y !== d.deger) { alanlar[yol] = { ...d, deger: y }; ozetSayilari.varsayilanlar++; degisti = true; }
      }
    }
    for (const [ad, ifade] of Object.entries(/** @type {Record<string, string>} */ (a.tarihKurallari ?? {}))) {
      const y = metniYenidenYaz(String(ifade), p.adEslem);
      if (y !== ifade) { a.tarihKurallari[ad] = y; ozetSayilari.hesapKurallari++; degisti = true; }
    }
    if (degisti) servisYazimlari.push({ servis, ayarlar: a });
    const servisIlgili = degisti;
    for (const x of servisSenaryolariniListele(vt, servis.id)) {
      const ic = /** @type {Nesne} */ (x.icerik);
      const bas = derinBasvurular(ic);
      const birimler = [ic, ...Object.values(nesneMi(ic.adimlar) ? ic.adimlar : {}).filter(nesneMi)];
      const secimIlgili = birimler.some((u) => Object.keys(nesneMi(u.tabloSecimleri) ? u.tabloSecimleri : {}).some((k) => ilgiliIdler.has(k.split('|')[0])));
      const basvuruIlgili = bas.some((b) => ilgiliAdlar.has(kucuk(b.tablo)));
      if (!basvuruIlgili && !secimIlgili && !servisIlgili) continue;
      servisDenetim.push({ servisId: servis.id, senaryoId: x.id });
      if (!basvuruIlgili && !secimIlgili) continue;
      const yeni = /** @type {Nesne} */ (derinYenidenYaz(ic, p.adEslem));
      const yeniBirimler = [yeni, ...Object.values(nesneMi(yeni.adimlar) ? yeni.adimlar : {}).filter(nesneMi)];
      birimler.forEach((u, i) => {
        const once = /** @type {Record<string, Record<string, string>>} */ (nesneMi(u.tabloSecimleri) ? u.tabloSecimleri : {});
        const r = secimleriYenidenYaz(once, p.idEslem);
        if (r.cakisma) engeller.push(`Servis senaryosu "${x.baslik}": ${r.cakisma}; birleştirmeden önce satır seçimini düzenleyin.`);
        const sonra = r.secimler;
        const basvurular = derinBasvurular({ ...u, adimlar: undefined });
        ozetSayilari.sabitlenen += satirSabitle(p, { basvurular, secimlerOnce: once, secimlerSonra: sonra, baglanmisOnce: () => ({}), baglanmisSonra: () => ({}), ortamlar: ortamIdleri });
        const hedef = yeniBirimler[i];
        if (Object.keys(sonra).length) hedef.tabloSecimleri = sonra; else delete hedef.tabloSecimleri;
        if (JSON.stringify(sonra) !== JSON.stringify(once)) ozetSayilari.satirSecimleri++;
      });
      if (JSON.stringify(yeni) === JSON.stringify(ic)) continue;
      ozetSayilari.servisSenaryolari++;
      servisSenaryolari.push({ servis, senaryo: x, icerik: yeni });
    }
  }
  /** @type {Array<{ akis: import('../servisler/servis-deposu.mjs').ServisAkisi; icerik: Nesne }>} */
  const akisYazimlari = [];
  for (const akis of servisAkislariniListele(vt, projeId)) {
    const yeni = /** @type {Nesne} */ (derinYenidenYaz(akis.icerik, p.adEslem));
    if (JSON.stringify(yeni) !== JSON.stringify(akis.icerik)) { akisYazimlari.push({ akis, icerik: yeni }); ozetSayilari.akislar++; }
  }
  return { ekranYazimlari, ekranSenaryolari, ekranDenetim, servisYazimlari, servisSenaryolari, servisDenetim, akisYazimlari, ozet: ozetSayilari, engeller, ortamIdleri, servisler };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Kuru doğrulama
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Etkilenen senaryoların her ortamdaki çözümü (koşucunun / servisin çözümleyicileriyle; hiçbir şey çalıştırılmaz). Değerler YALNIZ
 * bellekte; sonuç özetleri karşılaştırılır.
 * @param {Veritabani} vt @param {string} projeId @param {ReturnType<typeof yenidenEslemePlani>} r @param {Date} simdi
 * @returns {Map<string, { tur: 'ekran' | 'servis'; kaynakId: string; kaynakAdi: string; senaryoId: string; baslik: string; ortam: string; alanlar: Record<string, string>; hata: string[] }>}
 */
function cozumler(vt, projeId, r, simdi) {
  const tablolar = tablolariListele(vt, projeId, { cozulsun: true });
  const ortamAdi = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o.ad]));
  /** @type {ReturnType<typeof cozumler>} */
  const sonuc = new Map();
  for (const d of r.ekranDenetim) {
    const s = vt.tek('SELECT icerik_json FROM senaryolar WHERE id = ?', [d.senaryoId]);
    if (!s) continue;
    const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
    const mb = modelBaglami(vt, d.ekranId, senaryoAkisi(icerik));
    const bilgi = mb ? modelAlanBilgisi(mb.model) : {};
    const baglar = etkinAlanBaglari(vt, d.ekranId);
    for (const [o, x] of Object.entries(/** @type {Record<string, Nesne>} */ (icerik.ortamlar ?? {}))) {
      if (!nesneMi(x) || !nesneMi(x.veri)) continue;
      const c = ekranBasvurulariniCoz(/** @type {Nesne} */ (zarflariCoz(vt, x.veri)), {
        tablolar, baglar, ...bilgi, ortamId: o, ...(nesneMi(icerik.tabloSecimleri) ? { tabloSecimleri: icerik.tabloSecimleri } : {})
      });
      sonuc.set(`ekran|${d.senaryoId}|${o}`, {
        tur: 'ekran', kaynakId: d.ekranId, kaynakAdi: d.ekranAdi, senaryoId: d.senaryoId, baslik: d.baslik, ortam: ortamAdi.get(o) ?? o,
        alanlar: Object.fromEntries(Object.entries(c.veri).map(([k, v]) => [k, ozet(v)])), hata: [...new Set(c.hatalar.map((h) => h.alan))].sort()
      });
    }
  }
  const servisler = new Map(servisleriListele(vt, projeId).map((s) => [s.id, s]));
  const akislar = new Map(servisAkislariniListele(vt, projeId).map((a) => [a.id, a]));
  for (const d of r.servisDenetim) {
    const x = servisSenaryolariniListele(vt, d.servisId).find((y) => y.id === d.senaryoId);
    const servis = servisler.get(d.servisId);
    if (!x || !servis) continue;
    const ic = /** @type {Nesne} */ (x.icerik);
    /** @type {Array<[string, any, import('../servisler/servis-deposu.mjs').Servis | undefined]>} */
    const birimler = [];
    if (ic.tur === 'akis') {
      const akis = akislar.get(ic.akisId);
      for (const [adimId, adim] of Object.entries(nesneMi(ic.adimlar) ? ic.adimlar : {})) {
        const tanim = /** @type {any} */ (akis?.icerik)?.adimlar?.find((/** @type {any} */ a) => a.id === adimId);
        birimler.push([adimId, adim, tanim ? servisler.get(tanim.servisId) : undefined]);
      }
    } else birimler.push(['', ic, servis]);
    for (const o of r.ortamIdleri) {
      /** @type {Record<string, string>} */
      const alanlar = {};
      /** @type {string[]} */
      const hata = [];
      for (const [ad, u, sv] of birimler) {
        if (!sv) continue;
        const c = servisIstegiKuruCoz(vt, projeId, sv, u, o, { simdi, tablolar });
        if ('metin' in c) alanlar[ad || 'istek'] = ozet(c.metin); else hata.push(ad || 'istek');
      }
      sonuc.set(`servis|${d.senaryoId}|${o}`, { tur: 'servis', kaynakId: servis.id, kaynakAdi: servis.ad, senaryoId: x.id, baslik: x.baslik, ortam: ortamAdi.get(o) ?? o, alanlar, hata });
    }
  }
  return sonuc;
}

/** Eski ve yeni çözüm farkları (değer içermez). @param {ReturnType<typeof cozumler>} once @param {ReturnType<typeof cozumler>} sonra @returns {Fark[]} */
function farklar(once, sonra) {
  /** @type {Fark[]} */
  const liste = [];
  for (const [k, a] of once) {
    const b = sonra.get(k);
    const ortak = { tur: a.tur, kaynakId: a.kaynakId, kaynakAdi: a.kaynakAdi, senaryoId: a.senaryoId, baslik: a.baslik, ortam: a.ortam };
    if (!b) { liste.push({ ...ortak, alanlar: [], neden: 'senaryo yeni hâlde çözülemedi' }); continue; }
    const yeniHata = b.hata.filter((x) => !a.hata.includes(x));
    const degisen = Object.keys({ ...a.alanlar, ...b.alanlar }).filter((x) => !a.hata.includes(x) && !b.hata.includes(x) && a.alanlar[x] !== b.alanlar[x]);
    if (yeniHata.length) liste.push({ ...ortak, alanlar: yeniHata, neden: 'değer tablodan alınamaz hâle gelir' });
    if (degisen.length) liste.push({ ...ortak, alanlar: degisen, neden: 'koşuda giden değer değişir' });
  }
  return liste;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Geri alma kaydı (ham satırlar)
// ---------------------------------------------------------------------------------------------------------------------------

const HAM_TABLOLAR = /** @type {const} */ (['test_verisi_turleri', 'test_verisi_profilleri', 'ekranlar', 'senaryolar', 'servisler', 'servis_senaryolari', 'servis_akislari']);
/** @typedef {typeof HAM_TABLOLAR[number]} HamTablo */
/** @typedef {{ tablo: HamTablo; id: string; onceki: Nesne | null; sonraOzeti: string | null }} HamKayit */
/**
 * @typedef {{ id: string; zaman: string; projeId: string; kalanId: string; kalanAd: string; kaynaklar: Array<{ id: string; ad: string }>;
 *   kayitlar: HamKayit[]; kaynaklarSilindi: boolean; yedek?: string | null; eskiAd?: string; durum?: 'etkin' | 'geriAlindi';
 *   geriAlinmaZamani?: string | null; ozet?: { eklenenSatir: number; bag: number; senaryo: number } }} BirlestirmeKaydi
 */

/** @param {Veritabani} vt @param {HamTablo} tablo @param {string} id @returns {Nesne | null} */
const hamOku = (vt, tablo, id) => vt.tek(`SELECT * FROM ${tablo} WHERE id = ?`, [id]) ?? null;

/** @param {Veritabani} vt @param {HamTablo} tablo @param {string} id @param {Nesne | null} satir */
function hamYaz(vt, tablo, id, satir) {
  const mevcut = hamOku(vt, tablo, id);
  if (!satir) { if (mevcut) vt.calistir(`DELETE FROM ${tablo} WHERE id = ?`, [id]); return; }
  const sutunlar = Object.keys(satir).filter((s) => /^[a-z_]+$/.test(s));
  if (mevcut) {
    const x = sutunlar.filter((s) => s !== 'id');
    vt.calistir(`UPDATE ${tablo} SET ${x.map((s) => `${s} = ?`).join(', ')} WHERE id = ?`, [...x.map((s) => satir[s]), id]);
  } else vt.calistir(`INSERT INTO ${tablo} (${sutunlar.join(', ')}) VALUES (${sutunlar.map(() => '?').join(', ')})`, sutunlar.map((s) => satir[s]));
}

/** @param {unknown} k @returns {k is BirlestirmeKaydi} */
const kayitMi = (k) => nesneMi(k) && typeof /** @type {Nesne} */ (k).id === 'string' && Array.isArray(/** @type {Nesne} */ (k).kayitlar);

/**
 * Birleştirme geçmişi (eskiden yeniye). Eski tek kayıt (tabloBirlestirme.son:) varsa geçmişe taşınır ve eski anahtar boşaltılır.
 * @param {Veritabani} vt @param {string} projeId @returns {BirlestirmeKaydi[]}
 */
function gecmisOku(vt, projeId) {
  const ham = /** @type {Nesne | null | undefined} */ (ayarGetir(vt, `${GECMIS_ONEKI}${projeId}`));
  const liste = (Array.isArray(ham?.kayitlar) ? ham.kayitlar : []).filter(kayitMi);
  const eski = ayarGetir(vt, `${ESKI_AYAR_ONEKI}${projeId}`);
  if (kayitMi(eski)) {
    if (!liste.some((k) => k.id === eski.id)) liste.push({ ...eski, durum: 'etkin', geriAlinmaZamani: null });
    liste.sort((a, b) => (a.zaman < b.zaman ? -1 : a.zaman > b.zaman ? 1 : 0));
    vt.islem(() => {
      gecmisiKaydet(vt, projeId, liste);
      ayarYaz(vt, `${ESKI_AYAR_ONEKI}${projeId}`, null);
    });
  }
  return liste;
}

/** @param {Veritabani} vt @param {string} projeId @param {BirlestirmeKaydi[]} liste */
function gecmisiKaydet(vt, projeId, liste) {
  const l = [...liste];
  while (l.length > EN_COK_GECMIS) {
    const i = l.findIndex((k) => k.durum === 'geriAlindi');
    l.splice(i >= 0 ? i : 0, 1);
  }
  ayarYaz(vt, `${GECMIS_ONEKI}${projeId}`, { kayitlar: l });
}

/** Kaydın dokunduğu satırlar birleştirmeden (ya da kaynak silmeden) sonra değişti mi. @param {Veritabani} vt @param {BirlestirmeKaydi} k */
function degisenKayitlar(vt, k) {
  return k.kayitlar.filter((x) => { const s = hamOku(vt, x.tablo, x.id); return (s ? ozet(s) : null) !== x.sonraOzeti; });
}

const HAM_ADLARI = { test_verisi_turleri: 'tablo', test_verisi_profilleri: 'tablo satırı', ekranlar: 'ekran', senaryolar: 'ekran senaryosu', servisler: 'servis', servis_senaryolari: 'servis senaryosu', servis_akislari: 'servis akışı' };

/** "28.09.2026 14:05" (sunucunun yerel saati). @param {string} iso */
function tarihMetni(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/** Birleştirmenin tabloları (kalan + kaynaklar). @param {BirlestirmeKaydi} k */
const kayitTablolari = (k) => new Set([k.kalanId, ...k.kaynaklar.map((x) => x.id)]);

/**
 * Kaydı (liste[i]) geri almayı engelleyen SONRAKİ etkin birleştirme: aynı tabloyu (kalan / kaynak) ya da aynı kaydı (senaryo, bağ …)
 * değiştirmişse. Engel varsa anlaşılır neden döner.
 * @param {BirlestirmeKaydi[]} liste @param {number} i @param {'geriAl' | 'kaynakSil'} [amac]
 */
function sonrakiEngel(liste, i, amac = 'geriAl') {
  const k = liste[i];
  const tablolar = amac === 'kaynakSil' ? new Set(k.kaynaklar.map((x) => x.id)) : kayitTablolari(k);
  const hamlar = new Set(k.kayitlar.map((x) => `${x.tablo}|${x.id}`));
  for (let j = liste.length - 1; j > i; j--) {
    const s = liste[j];
    if (s.durum === 'geriAlindi') continue;
    const ortakTablo = [...kayitTablolari(s)].some((id) => tablolar.has(id));
    const ortakKayit = amac === 'geriAl' && s.kayitlar.some((x) => hamlar.has(`${x.tablo}|${x.id}`));
    if (ortakTablo || ortakKayit) {
      return { id: s.id, neden: `Sonraki birleştirme (${tarihMetni(s.zaman)}, “${s.kalanAd}”) aynı ${ortakTablo ? 'tabloyu' : 'kayıtları'} değiştirdi; önce onu geri alın.` };
    }
  }
  return null;
}

/** Geçmiş satırı (değer ve ham kayıt içermez). @param {Veritabani} vt @param {BirlestirmeKaydi[]} liste @param {number} i */
function gecmisSatiri(vt, liste, i) {
  const k = liste[i];
  const etkin = k.durum !== 'geriAlindi';
  const engel = etkin ? sonrakiEngel(liste, i) : null;
  const degisen = etkin && !engel ? degisenKayitlar(vt, k) : [];
  const kaynakEngeli = etkin && !k.kaynaklarSilindi ? sonrakiEngel(liste, i, 'kaynakSil') : null;
  return {
    id: k.id, zaman: k.zaman, kalan: k.kalanAd, eskiAd: k.eskiAd && k.eskiAd !== k.kalanAd ? k.eskiAd : null, kaynaklar: k.kaynaklar.map((x) => x.ad),
    eklenenSatir: k.ozet?.eklenenSatir ?? null, bag: k.ozet?.bag ?? null, senaryo: k.ozet?.senaryo ?? null,
    kaynaklarSilindi: Boolean(k.kaynaklarSilindi), yedek: k.yedek ?? null, durum: etkin ? 'etkin' : 'geriAlindi', geriAlinmaZamani: k.geriAlinmaZamani ?? null,
    geriAlinabilir: etkin && !engel && !degisen.length,
    neden: engel ? engel.neden : degisen.length ? 'Birleştirmeden sonra bu kayıtlar değişti; ters işlem onları ezerdi. Yedekten dönebilirsiniz.' : '',
    engelleyen: engel ? engel.id : null,
    degisenler: [...new Set(degisen.map((x) => HAM_ADLARI[x.tablo]))],
    kaynaklariSilinebilir: etkin && !k.kaynaklarSilindi && !kaynakEngeli,
    kaynakNedeni: kaynakEngeli ? kaynakEngeli.neden : ''
  };
}

/**
 * Birleştirme geçmişi (yeniden eskiye): her satırda özet, durum, geri alınabilir mi (değilse neden), kaynaklar silinebilir mi.
 * @param {Veritabani} vt @param {string} projeId
 */
export function birlestirmeGecmisi(vt, projeId) {
  acikAnahtar(vt);
  const liste = gecmisOku(vt, projeId);
  return { kayitlar: liste.map((_, i) => gecmisSatiri(vt, liste, i)).reverse() };
}

/** İstenen kayıt (id yoksa en yeni etkin kayıt). @param {BirlestirmeKaydi[]} liste @param {unknown} id */
function kayitBul(liste, id) {
  if (typeof id === 'string' && id) return liste.findIndex((k) => k.id === id);
  for (let i = liste.length - 1; i >= 0; i--) if (liste[i].durum !== 'geriAlindi') return i;
  return -1;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Önizleme / uygulama
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Birleştirme. kip 'onizle': her şey tek işlemde DENENİR, kuru doğrulama yapılır ve GERİ ALINIR; plan döner. kip 'uygula': onay +
 * önizlemenin imzası (beklenenImza) gerekir; plan değiştiyse, engel ya da kuru doğrulama farkı varsa HİÇBİR ŞEY yazılmaz.
 * @param {Veritabani} vt @param {string} projeId @param {BirlestirmeGirdisi & { kip?: unknown; beklenenImza?: unknown; yapan?: string; yedek?: string | null }} girdi
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; simdi?: Date; yedekAl?: () => string | null }} [secenekler]
 */
export function tablolariBirlestir(vt, projeId, girdi, secenekler = {}) {
  acikAnahtar(vt);
  const kip = girdi.kip === 'uygula' ? 'uygula' : 'onizle';
  const simdi = secenekler.simdi ?? new Date();
  /** @type {any} */
  let cikti = null;
  try {
    vt.islem(() => {
      const p = planla(vt, projeId, girdi);
      const r = yenidenEslemePlani(vt, projeId, p);
      const kullanim = tabloKullanimlari(vt, projeId).kullanim;
      const onizleme = onizlemeOzeti(p, r, kullanim);
      const engeller = [...p.engeller, ...r.engeller];
      if (engeller.length || p.onayBekleyen.length) {
        cikti = { onizleme: { ...onizleme, engeller, farklar: [], dogrulandi: false } };
        throw GERI_AL;
      }
      // Kuru doğrulama: önce → yaz → sonra.
      const once = cozumler(vt, projeId, r, simdi);
      /** @type {HamKayit[]} */
      const kayitlar = [];
      /** @type {Map<string, Nesne | null>} */
      const oncekiler = new Map();
      const izle = (/** @type {HamTablo} */ tablo, /** @type {string} */ id) => { const k = `${tablo}|${id}`; if (!oncekiler.has(k)) oncekiler.set(k, hamOku(vt, tablo, id)); };
      izle('test_verisi_turleri', p.kalan.id);
      for (const x of p.kalan.satirlar) izle('test_verisi_profilleri', x.id);
      for (const x of r.ekranYazimlari) izle('ekranlar', x.ekranId);
      for (const x of r.ekranSenaryolari) izle('senaryolar', x.senaryoId);
      for (const x of r.servisYazimlari) izle('servisler', x.servis.id);
      for (const x of r.servisSenaryolari) izle('servis_senaryolari', x.senaryo.id);
      for (const x of r.akisYazimlari) izle('servis_akislari', x.akis.id);
      yaz(vt, projeId, p, r, { ...secenekler, yapan: girdi.yapan });
      for (const s of vt.tumu('SELECT id FROM test_verisi_profilleri WHERE tur_id = ?', [p.kalan.id])) {
        const k = `test_verisi_profilleri|${String(s.id)}`;
        if (!oncekiler.has(k)) oncekiler.set(k, null); // birleştirmeyle eklenen satır: geri alınca silinir
      }
      const sonra = cozumler(vt, projeId, r, simdi);
      const fark = farklar(once, sonra);
      const imza = ozet({ o: onizleme, f: fark });
      if (kip === 'onizle' || fark.length) {
        cikti = { onizleme: { ...onizleme, engeller: [], farklar: fark, dogrulandi: !fark.length, imza }, ...(kip === 'uygula' ? { yapilmadi: true } : {}) };
        throw GERI_AL;
      }
      if (girdi.beklenenImza !== imza) { cikti = { onayGerekli: true, farkli: true, onizleme: { ...onizleme, engeller: [], farklar: [], dogrulandi: true, imza } }; throw GERI_AL; }
      for (const [k, onceki] of oncekiler) {
        const [tablo, id] = /** @type {[HamTablo, string]} */ (k.split('|'));
        const simdiki = hamOku(vt, tablo, id);
        kayitlar.push({ tablo, id, onceki, sonraOzeti: simdiki ? ozet(simdiki) : null });
      }
      /** @type {BirlestirmeKaydi} */
      const kayit = {
        id: randomUUID(), zaman: simdi.toISOString(), projeId, kalanId: p.kalan.id, kalanAd: p.yeniAd, kaynaklar: p.kaynaklar.map((k) => ({ id: k.id, ad: k.ad })),
        kayitlar, kaynaklarSilindi: false, yedek: girdi.yedek ?? null, eskiAd: p.kalan.ad, durum: 'etkin', geriAlinmaZamani: null,
        ozet: { eklenenSatir: p.eklenecek, bag: r.ozet.ekranBaglari + r.ozet.servisBaglari, senaryo: r.ozet.ekranSenaryolari + r.ozet.servisSenaryolari }
      };
      gecmisiKaydet(vt, projeId, [...gecmisOku(vt, projeId), kayit]);
      gecmisYaz(vt, {
        varlikTuru: 'tablo_birlestirme', varlikId: p.kalan.id, islem: 'guncelle', yapan: girdi.yapan,
        aciklama: `Tablolar birleştirildi: ${p.kaynaklar.map((k) => `"${k.ad}"`).join(', ')} → "${p.yeniAd}" (${p.eklenecek} satır eklendi; ${r.ozet.ekranSenaryolari + r.ozet.servisSenaryolari} senaryo, ${r.ozet.ekranBaglari + r.ozet.servisBaglari} bağ yeniden eşlendi).`,
        sonraki: { kalan: p.kalan.id, kaynaklar: p.kaynaklar.map((k) => k.id), ozet: r.ozet, eklenenSatir: p.eklenecek }
      });
      cikti = { uygulandi: true, birlestirmeId: kayit.id, onizleme: { ...onizleme, engeller: [], farklar: [], dogrulandi: true, imza } };
    });
  } catch (e) {
    if (e !== GERI_AL) throw e;
  }
  return cikti;
}

/** Yazımlar (çağıranın işleminde). @param {Veritabani} vt @param {string} projeId @param {Plan} p @param {ReturnType<typeof yenidenEslemePlani>} r
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; yapan?: string }} s */
function yaz(vt, projeId, p, r, s) {
  const kalanAdlari = new Set(p.kalan.sutunlar.map((x) => x.ad));
  tabloKaydet(vt, {
    projeId, id: p.kalan.id, ad: p.yeniAd,
    sutunlar: p.birlesik.sutunlar.map((x) => ({ ad: x.ad, ...(kalanAdlari.has(x.ad) ? { eskiAd: x.ad } : {}), gizli: x.gizli, ...(x.gizli ? {} : { karsiliklar: x.karsiliklar ?? {} }) })),
    satirlar: [
      ...[...p.guncellenecek.values()].map((g) => ({ id: g.id, degerler: g.degerler })),
      ...p.birlesik.satirlar.filter((x) => !x.id).map((x) => ({ ad: x.ad, ortamId: x.ortamId, degerler: x.degerler }))
    ],
    ortamVar: (id) => Boolean(ortamGetir(vt, id))
  });
  for (const x of r.ekranYazimlari) ekranAlanBaglariniKaydet(vt, projeId, x.ekranId, x.baglar);
  for (const x of r.servisYazimlari) servisKaydet(vt, { id: x.servis.id, projeId, anahtar: x.servis.anahtar, ad: x.servis.ad, ayarlar: /** @type {any} */ (x.ayarlar), yapan: s.yapan });
  for (const x of r.ekranSenaryolari) {
    senaryoOrtamVerileriniYaz(vt, {
      projeId, id: x.senaryoId, ortamVerileri: x.ortamVerileri, ...(x.tabloSecimleri !== undefined ? { tabloSecimleri: x.tabloSecimleri } : {}),
      denetlenecekAlanlar: x.alanlar, yapan: s.yapan
    }, { kosuyorMu: s.kosuyorMu });
  }
  for (const x of r.servisSenaryolari) {
    servisSenaryosuKaydet(vt, { id: x.senaryo.id, projeId, servisId: x.senaryo.servisId, baslik: x.senaryo.baslik, kapsam: x.senaryo.kapsam, icerik: x.icerik, yapan: s.yapan });
  }
  for (const x of r.akisYazimlari) servisAkisiKaydet(vt, { id: x.akis.id, projeId, baslik: x.akis.baslik, tur: x.akis.tur, kapsam: x.akis.kapsam, icerik: x.icerik, yapan: s.yapan });
}

/** Önizleme özeti (değerler: gizli sütunlar maskeli). @param {Plan} p @param {ReturnType<typeof yenidenEslemePlani>} r @param {Record<string, Kullanim>} kullanim */
function onizlemeOzeti(p, r, kullanim) {
  const tablolar = [p.kalan, ...p.kaynaklar];
  const enCok = [...tablolar].sort((a, b) => (kullanim[b.id]?.toplam ?? 0) - (kullanim[a.id]?.toplam ?? 0))[0];
  return {
    kalan: { id: p.kalan.id, ad: p.kalan.ad, yeniAd: p.yeniAd },
    tablolar: tablolar.map((t) => ({ id: t.id, ad: t.ad, sutunSayisi: t.sutunlar.length, satirSayisi: t.satirlar.length, kullanim: kullanim[t.id] ?? null })),
    onerilenKalan: enCok.id,
    sutunlar: p.birlesik.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli, yeni: !p.kalan.sutunlar.some((x) => x.ad === s.ad),
      ...(p.gizliNotlari.has(s.ad) ? { not: p.gizliNotlari.get(s.ad) } : {}) })),
    eslemeler: p.eslemeler,
    onayBekleyenEslemeler: p.onayBekleyen.map((e) => ({ kaynakId: e.kaynakId, kaynak: e.kaynak })),
    satirlar: { kalan: p.kalan.satirlar.length, eklenecek: p.eklenecek, ayni: p.ayniSatir, cakisan: p.satirCakismalari.length, toplam: p.birlesik.satirlar.length,
      ortamaOzel: p.birlesik.satirlar.filter((x) => x.ortamId).length },
    satirCakismalari: p.satirCakismalari,
    karsilikCakismalari: p.karsilikCakismalari,
    yenidenEsleme: r.ozet,
    ekranlar: r.ekranYazimlari.map((x) => x.ad),
    senaryolar: [...r.ekranSenaryolari.map((x) => ({ tur: 'ekran', ad: `${x.ekranAdi} · ${x.baslik}` })), ...r.servisSenaryolari.map((x) => ({ tur: 'servis', ad: `${x.servis.ad} · ${x.senaryo.baslik}` }))],
    servisler: r.servisYazimlari.map((x) => x.servis.ad),
    kaynaklarSilinmez: p.kaynaklar.map((k) => k.ad)
  };
}

/**
 * Geçmişteki bir birleştirmeyi geri alır (kayıtlı ters işlem; birlestirmeId yoksa en yeni etkin kayıt): birleştirmenin (ve varsa
 * kaynak silmenin) dokunduğu kayıtların önceki ham hâli geri yazılır. Sonraki etkin bir birleştirme aynı tabloyu / kaydı
 * değiştirdiyse ya da kayıtlardan biri sonradan elle değiştiyse geri alınmaz (neden + yedek önerisi). onay yoksa yalnız ne
 * yapılacağı döner.
 * @param {Veritabani} vt @param {string} projeId @param {{ birlestirmeId?: unknown; onay?: boolean; yapan?: string }} girdi
 */
export function birlestirmeyiGeriAl(vt, projeId, girdi) {
  acikAnahtar(vt);
  const liste = gecmisOku(vt, projeId);
  const i = kayitBul(liste, girdi.birlestirmeId);
  if (i < 0) throw new DepoHatasi(typeof girdi.birlestirmeId === 'string' && girdi.birlestirmeId ? 'Birleştirme geçmişte bulunamadı.' : 'Geri alınacak birleştirme yok.');
  const k = liste[i];
  if (k.durum === 'geriAlindi') throw new DepoHatasi('Bu birleştirme zaten geri alındı.');
  const bilgi = { id: k.id, kalan: k.kalanAd, kaynaklar: k.kaynaklar.map((x) => x.ad), zaman: k.zaman, kayit: k.kayitlar.length, yedek: k.yedek ?? null };
  const engel = sonrakiEngel(liste, i);
  if (engel) return { geriAlinamaz: true, ...bilgi, engelleyen: engel.id, degisenler: [], neden: engel.neden };
  const degisen = degisenKayitlar(vt, k);
  if (degisen.length) {
    return { geriAlinamaz: true, ...bilgi, degisenler: [...new Set(degisen.map((x) => HAM_ADLARI[x.tablo]))], neden: 'Birleştirmeden sonra bu kayıtlar değişti; ters işlem onları ezerdi. Yedekten dönebilirsiniz.' };
  }
  if (!girdi.onay) return { onizleme: bilgi };
  vt.islem(() => {
    const sira = (/** @type {HamKayit} */ x) => (x.tablo === 'test_verisi_turleri' ? 0 : x.tablo === 'test_verisi_profilleri' ? 1 : 2);
    for (const x of [...k.kayitlar].sort((a, b) => sira(a) - sira(b))) if (x.onceki) hamYaz(vt, x.tablo, x.id, x.onceki);
    for (const x of k.kayitlar) if (!x.onceki) hamYaz(vt, x.tablo, x.id, null);
    // Geri alınan kaydın ham verisi artık gerekmez; satır geçmişte "geri alındı" olarak kalır.
    liste[i] = { ...k, kayitlar: [], durum: 'geriAlindi', geriAlinmaZamani: new Date().toISOString() };
    gecmisiKaydet(vt, projeId, liste);
    gecmisYaz(vt, { varlikTuru: 'tablo_birlestirme', varlikId: k.kalanId, islem: 'guncelle', yapan: girdi.yapan,
      aciklama: `Birleştirme geri alındı: "${k.kalanAd}" ← ${k.kaynaklar.map((x) => `"${x.ad}"`).join(', ')}.` });
  });
  return { geriAlindi: true, ...bilgi };
}

/**
 * Bir birleştirmenin kaynak tablolarını siler (ayrı onay; birlestirmeId yoksa en yeni etkin kayıt). Artık hiçbir yerde
 * kullanılmıyor olmalılar ve sonraki etkin bir birleştirme bu tabloları kullanmamış olmalı. Silinen satırlar o birleştirmenin geri
 * alma kaydına eklenir (geri al kaynakları da geri getirir). onay yoksa yalnız ne silineceği döner.
 * @param {Veritabani} vt @param {string} projeId @param {{ birlestirmeId?: unknown; onay?: boolean; yapan?: string }} girdi
 */
export function kaynaklariSil(vt, projeId, girdi) {
  acikAnahtar(vt);
  const liste = gecmisOku(vt, projeId);
  const i = kayitBul(liste, girdi.birlestirmeId);
  const k = i < 0 ? null : liste[i];
  if (!k || k.durum === 'geriAlindi' || k.kaynaklarSilindi) throw new DepoHatasi('Silinecek kaynak tablo yok (birleştirmenin kaynakları zaten silinmiş, birleştirme geri alınmış ya da birleştirme yok).');
  const tablolar = tablolariListele(vt, projeId);
  const kaynaklar = k.kaynaklar.map((x) => tablolar.find((t) => t.id === x.id)).filter((t) => t !== undefined);
  const bilgi = { id: k.id, tablolar: kaynaklar.map((t) => ({ ad: t.ad, satir: t.satirlar.length })) };
  const engel = sonrakiEngel(liste, i, 'kaynakSil');
  if (engel) return { silinemez: true, ...bilgi, neden: engel.neden };
  const { kullanim } = tabloKullanimlari(vt, projeId);
  const kullanilan = kaynaklar.filter((t) => kullanim[t.id]?.toplam);
  if (kullanilan.length) return { silinemez: true, ...bilgi, neden: `${kullanilan.map((t) => `"${t.ad}"`).join(', ')} hâlâ kullanılıyor (Veri sağlığı > kullanım); önce başvuruları kaldırın.` };
  if (!girdi.onay) return { onizleme: bilgi };
  vt.islem(() => {
    /** @type {HamKayit[]} */
    const ek = [];
    for (const t of kaynaklar) {
      for (const r of t.satirlar) ek.push({ tablo: 'test_verisi_profilleri', id: r.id, onceki: hamOku(vt, 'test_verisi_profilleri', r.id), sonraOzeti: null });
      ek.push({ tablo: 'test_verisi_turleri', id: t.id, onceki: hamOku(vt, 'test_verisi_turleri', t.id), sonraOzeti: null });
      tabloSil(vt, projeId, t.id);
    }
    const eslesen = new Set(ek.map((x) => `${x.tablo}|${x.id}`));
    liste[i] = { ...k, kaynaklarSilindi: true, kayitlar: [...k.kayitlar.filter((x) => !eslesen.has(`${x.tablo}|${x.id}`)), ...ek] };
    gecmisiKaydet(vt, projeId, liste);
    gecmisYaz(vt, { varlikTuru: 'tablo_birlestirme', varlikId: k.kalanId, islem: 'sil', yapan: girdi.yapan, aciklama: `Birleştirilen kaynak tablolar silindi: ${kaynaklar.map((t) => `"${t.ad}"`).join(', ')}.` });
  });
  return { silindi: true, ...bilgi };
}
