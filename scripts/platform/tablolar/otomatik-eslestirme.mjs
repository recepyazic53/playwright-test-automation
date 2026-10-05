// OTOMATİK EŞLEŞTİRME (Ekran > Test verisi > "Otomatik eşleştir…"). Ekranın tabloya bağlı OLMAYAN alanları için, projedeki test verisi
// tablolarının sütunları arasından uygun olanı önerir; önizleme gösterilir, kullanıcı tek onayla uygular, uygulama geri alınabilir.
// Öneri ölçütleri (tahmin değil öneri; her satırın nedeni ve güveni yazılır):
//   · alan adı sütun adıyla aynı (harf / Türkçe karakter / boşluk farkı yok sayılır) ya da alan kimliği sütun adıyla aynı → yüksek güven;
//   · kişi / kimlik türü aynı (kimlik no, doğum tarihi, telefon, e-posta, ad, soyad… kisi-baglama.mjs > kisiKategorisi) → yüksek güven;
//   · seçim alanının ekran modelindeki seçeneklerinin çoğu bir sütunun değerlerinde varsa (en az %60) → orta güven;
//   · aynı tabloya düşen alanlar birbirini güçlendirir (bir ekranın alanları aynı tablodan gelsin); aynı sütun iki alana önerilmez.
// Seçim alanına gizli sütun önerilmez (seçenekleri tablodan listelenir; ekran-baglari.mjs kuralı). Yalnız bağ yazılır: senaryolardaki
// değerlerin tabloya çevrilmesi ayrı, önizlemeli adımlardır (ekran-donusumu.mjs, kisi-baglama.mjs). Değer DÖNMEZ.
// Uygulama: bağlar + eksik sayfa değeri karşılıkları tek işlemde; önceki bağlar yanıtta döner (geri alma bunlarla yapılır).
import { DepoHatasi, gecmisYaz } from '../veritabani/depo.mjs';
import { ekranGirdileri } from '../senaryolar/senaryo-servisi.mjs';
import { BAGLAM_ONEKI, tablolariListele } from './tablo-deposu.mjs';
import { baglamakGerekmez, ekranAlanBaglari, ekranAlanBaglariniKaydet, etkinAlanBaglari } from './ekran-baglari.mjs';
import { baslikNormal, benzerTablolar } from './tablo-benzerligi.mjs';
import { kisiKategorisi } from './kisi-baglama.mjs';
import { karsiliklariEkrandanAl } from './karsiliklar.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, { tablo: string; sutun: string; etiket?: string }>} Baglar */

/** Öneri verilen alan tipleri (onay kutusu ve dosya alanı tablo sütunuyla eşleşmez). */
const TIPLER = new Set(['metin', 'sayi', 'tarih', 'telefon', 'secim']);
const SECIM_TIPLERI = new Set(['secim', 'okluSecim', 'radyo']);
/** Bu puanın altındaki adaylar önerilmez; YUKSEK ve üstü "yüksek güven". */
const EN_AZ = 60;
const YUKSEK = 85;
const OLCUTLER = Object.freeze({ ad: 100, kimlik: 92, tur: 85 });

const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');

/**
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ekranId: string; onay?: boolean; secimler?: unknown; yapan?: string }} girdi
 * @returns {{ onizleme: object; uygulandi?: true; baglanan?: number; onceki?: Baglar; karsiliklar?: { eklenen: number; tablolar: string[] } }}
 */
export function otomatikEslestir(vt, projeId, girdi) {
  const { girdiler } = ekranGirdileri(vt, projeId, girdi.ekranId, { tumTipler: true });
  const baglar = etkinAlanBaglari(vt, girdi.ekranId);
  const tablolar = tablolariListele(vt, projeId).filter((t) => !t.id.startsWith(BAGLAM_ONEKI));
  const bagsiz = girdiler.filter((g) => !baglar[g.id] && TIPLER.has(g.tip));

  /** @typedef {{ tablo: typeof tablolar[number]; sutun: typeof tablolar[number]['sutunlar'][number]; puan: number; neden: string }} Aday */
  /** @param {typeof girdiler[number]} g @returns {Aday[]} */
  const adaylar = (g) => {
    /** @type {Aday[]} */
    const sonuc = [];
    const kg = kisiKategorisi({ id: g.id, etiket: g.etiket, tip: g.tip });
    const secenekler = Array.isArray(g.secenekler) ? g.secenekler : [];
    for (const t of tablolar) for (const s of t.sutunlar) {
      if (s.gizli && SECIM_TIPLERI.has(g.tip)) continue;
      let puan = 0;
      let neden = '';
      if (baslikNormal(g.etiket) === baslikNormal(s.ad)) { puan = OLCUTLER.ad; neden = 'alan adı sütun adıyla aynı'; }
      else if (baslikNormal(g.id) === baslikNormal(s.ad)) { puan = OLCUTLER.kimlik; neden = 'alanın kimliği sütun adıyla aynı'; }
      else {
        const ks = kg ? kisiKategorisi({ etiket: s.ad }) : null;
        if (kg && ks && kg.kategori === ks.kategori) { puan = OLCUTLER.tur; neden = `aynı tür: ${kg.ad}`; }
      }
      // Seçim: modeldeki seçeneklerin çoğu sütunun değerlerinde varsa.
      if (g.tip === 'secim' && secenekler.length >= 2 && !s.gizli) {
        const degerler = new Set(t.satirlar.map((r) => kucuk(r.degerler[s.ad])).filter(Boolean));
        const var_ = secenekler.filter((x) => degerler.has(kucuk(x.metin)) || degerler.has(kucuk(x.deger))).length;
        const oran = var_ / secenekler.length;
        if (oran >= 0.6 && puan < 75) { puan = Math.round(60 + oran * 15); neden = `seçeneklerin ${var_} / ${secenekler.length} tanesi sütunda var`; }
        else if (oran >= 0.6) puan += 3;
      }
      if (puan >= EN_AZ) sonuc.push({ tablo: t, sutun: s, puan, neden });
    }
    return sonuc.sort((a, b) => b.puan - a.puan);
  };

  // 1. tur: her alanın en iyi adayı; 2. tur: aynı tabloya düşen alanlar birbirini güçlendirir.
  const tumAdaylar = new Map(bagsiz.map((g) => [g.id, adaylar(g)]));
  /** @type {Map<string, number>} */
  const tabloSayisi = new Map();
  for (const l of tumAdaylar.values()) if (l[0]) tabloSayisi.set(l[0].tablo.id, (tabloSayisi.get(l[0].tablo.id) ?? 0) + 1);
  const guclendir = (/** @type {Aday} */ a) => a.puan + Math.min(10, 3 * ((tabloSayisi.get(a.tablo.id) ?? 1) - 1));
  /** @type {Array<{ g: typeof girdiler[number]; a: Aday; puan: number; belirsiz: boolean }>} */
  const secilen = [];
  for (const g of bagsiz) {
    const l = [...(tumAdaylar.get(g.id) ?? [])].sort((x, y) => guclendir(y) - guclendir(x));
    if (!l.length) continue;
    const belirsiz = l.length > 1 && l[1].tablo.id !== l[0].tablo.id && guclendir(l[1]) === guclendir(l[0]);
    secilen.push({ g, a: l[0], puan: guclendir(l[0]), belirsiz });
  }
  // Aynı sütun iki alana önerilmez: yüksek puanlı kalır.
  const kullanilan = new Set();
  const oneriler = secilen.sort((x, y) => y.puan - x.puan).filter((x) => {
    const k = `${x.a.tablo.id}\u0001${x.a.sutun.ad}`;
    if (kullanilan.has(k)) return false;
    kullanilan.add(k);
    return true;
  }).map((x) => {
    const yuksek = x.a.puan >= YUKSEK && !x.belirsiz;
    return {
      alanId: x.g.id, etiket: x.g.etiket, tip: x.g.tip, tablo: { id: x.a.tablo.id, ad: x.a.tablo.ad }, sutun: x.a.sutun.ad, gizli: x.a.sutun.gizli,
      guven: /** @type {'yuksek' | 'orta'} */ (yuksek ? 'yuksek' : 'orta'), neden: x.belirsiz ? `${x.a.neden}; başka bir tabloda da aynı derecede uyan sütun var` : x.a.neden,
      // Varsayılan seçim: yüksek güven işaretli, orta güven kullanıcıya bırakılır.
      onerilenSecim: yuksek
    };
  });
  // Öneri sırası ekrandaki alan sırasıdır (görünüm tutarlılığı).
  const sira = new Map(girdiler.map((g, i) => [g.id, i]));
  oneriler.sort((a, b) => (sira.get(a.alanId) ?? 0) - (sira.get(b.alanId) ?? 0));

  // Birleştirilebilecek tablolar: önerilerin düştüğü tablolar arasında başlıkları benzeyenler (birleştirme ayrı, önizlemeli ve geri alınabilir).
  const kullanilanTablolar = [...new Map(oneriler.map((o) => [o.tablo.id, tablolar.find((t) => t.id === o.tablo.id)])).values()].filter((t) => t !== undefined);
  /** @type {Array<{ a: string; b: string }>} */
  const birlestirilebilir = [];
  for (const t of kullanilanTablolar) {
    for (const b of benzerTablolar(t.sutunlar, kullanilanTablolar.filter((x) => x.id !== t.id), { ad: t.ad, haricId: t.id })) {
      if (!birlestirilebilir.some((x) => (x.a === b.ad && x.b === t.ad))) birlestirilebilir.push({ a: t.ad, b: b.ad });
    }
  }
  const onizleme = {
    oneriler, birlestirilebilir,
    ozet: { oneri: oneriler.length, yuksek: oneriler.filter((o) => o.guven === 'yuksek').length, zatenBagli: girdiler.filter((g) => baglar[g.id]).length, eslesmeyen: bagsiz.filter((g) => !oneriler.some((o) => o.alanId === g.id) && !baglamakGerekmez(g)).length, tablo: tablolar.length }
  };
  if (!girdi.onay) return { onizleme };

  // --- Uygulama: seçilen alanların bağları + eksik karşılıklar, tek işlemde ---
  const istenen = new Set(Array.isArray(girdi.secimler) ? girdi.secimler.filter((x) => typeof x === 'string') : []);
  const yazilacak = oneriler.filter((o) => istenen.has(o.alanId));
  if (!yazilacak.length) throw new DepoHatasi('Uygulanacak eşleşme seçilmedi.');
  const onceki = ekranAlanBaglari(vt, girdi.ekranId);
  /** @type {{ baglanan: number; karsiliklar: { eklenen: number; tablolar: string[] } }} */
  let sonuc = { baglanan: 0, karsiliklar: { eklenen: 0, tablolar: [] } };
  vt.islem(() => {
    /** @type {Baglar} */
    const yeni = { ...onceki };
    for (const o of yazilacak) yeni[o.alanId] = { tablo: o.tablo.id, sutun: o.sutun };
    ekranAlanBaglariniKaydet(vt, projeId, girdi.ekranId, yeni);
    const karsiliklar = karsiliklariEkrandanAl(vt, projeId, girdi.ekranId);
    gecmisYaz(vt, { varlikTuru: 'otomatik_eslestirme', varlikId: girdi.ekranId, islem: 'guncelle', yapan: girdi.yapan,
      aciklama: `${yazilacak.length} alan tablo sütunlarıyla otomatik eşleştirildi.`, onceki: { alanlar: yazilacak.map((o) => o.alanId) }, sonraki: { alanlar: yazilacak.map((o) => o.alanId) } });
    sonuc = { baglanan: yazilacak.length, karsiliklar };
  });
  return { onizleme, uygulandi: true, baglanan: sonuc.baglanan, onceki, karsiliklar: sonuc.karsiliklar };
}

/**
 * Otomatik eşleştirmeyi geri alır: yalnız eşleştirilen alanların bağı öncekine döner (önceden bağı yoksa silinir); ekranın diğer
 * bağlarına dokunulmaz.
 * @param {Veritabani} vt @param {string} projeId @param {{ ekranId: string; alanlar: unknown; onceki: unknown; yapan?: string }} girdi
 * @returns {{ geriAlinan: number }}
 */
export function otomatikEslestirmeyiGeriAl(vt, projeId, girdi) {
  const alanlar = Array.isArray(girdi.alanlar) ? girdi.alanlar.filter((x) => typeof x === 'string') : [];
  if (!alanlar.length) throw new DepoHatasi('Geri alınacak alan yok.');
  const onceki = girdi.onceki !== null && typeof girdi.onceki === 'object' && !Array.isArray(girdi.onceki) ? /** @type {Baglar} */ (girdi.onceki) : {};
  const simdiki = { ...ekranAlanBaglari(vt, girdi.ekranId) };
  for (const a of alanlar) { if (Object.hasOwn(onceki, a)) simdiki[a] = onceki[a]; else delete simdiki[a]; }
  vt.islem(() => {
    ekranAlanBaglariniKaydet(vt, projeId, girdi.ekranId, simdiki);
    gecmisYaz(vt, { varlikTuru: 'otomatik_eslestirme', varlikId: girdi.ekranId, islem: 'guncelle', yapan: girdi.yapan, aciklama: `${alanlar.length} alanın otomatik eşleştirmesi geri alındı.` });
  });
  return { geriAlinan: alanlar.length };
}
