// EKRAN SÜRÜMLERİ (Modeli güncelle > Nöbetçi taraması). Koşucu önce ekranı keşfeder (seçimler / düğmeler denenir), sonra seçilen
// senaryoyla doldurup adım adım okur (tests/support/model-kosucu.ts > NOBETCI_EKRAN_ANALIZI; "ekran-analizi" eki). Okunanlar bir
// "ekran sürümü"dür: Nöbetçi'nin gördüğü ekranın tam hâli (modelde olmayan alanlar dahil). Karşılaştırma MODELLE DEĞİL, bir önceki
// ekran sürümüyle yapılır; ilk tarama yalnız kaydeder. Kurallar:
//   - Gelen alan / düğme: önceki sürümde hiç olmayan.
//   - Kaybolan alan / düğme: yalnız aynı yer bu taramada da gezildiyse (keşifte görülen → bu taramada keşif yapıldı; senaryo adımında
//     görülen → bu taramada AYNI senaryoyla o adıma gelindi) ve hiç görülmediyse. Gezilmeyen yerdeki alanlar yeni sürüme aynen taşınır
//     (senaryonun doldurmadığı / ulaşamadığı alan kaybolan sayılmaz).
//   - Seçenekler: iki sürümde de seçenekleri sabit (bağlı liste değil) alanlarda gelen / kaldırılan seçenek.
// Sürümler ekranın ayarlarında (kasada, şifreli) "ekranSurumleri" altında: son sürümün tam hâli + geçmiş (en çok GECMIS_EN_COK).
// "Modele ekle": gelen bir alan modele eklenir; Değişiklikler sayfasında (analizYukle) kabul / ret beklenir.
// Motor genel kalır: siteye / ürüne özgü sabit yoktur. NOT: import.meta KULLANILMAZ.
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SAYFA_PAKETI_SURUMU, SAYFA_PAKETI_TURU } from './sayfa-paketi.mjs';
import { analizYukle } from './ekran-servisi.mjs';
import { DepoHatasi, ekranAyarlariniGetir, ekranKaydet, ekranModeliGetir, ekranlariListele, senaryoGetir } from '../veritabani/depo.mjs';
import { medyaGetir, sonucDetayi } from '../veritabani/sonuc-deposu.mjs';
import { medyaAnahtariniHazirla } from '../kasa.mjs';
import { medyaDosyaAdiGecerliMi, medyaTamamenCoz } from '../medya.mjs';

/** @typedef {Record<string, any>} Nesne */
/** @typedef {{ deger: string; metin: string }} Secenek */
/**
 * @typedef {{ etiket: string; tur: string; secici: string; cerceve?: string[]; secenekler?: Secenek[]; degisken?: true;
 *   nerede: string[]; senaryolar: string[]; ham: Nesne }} SurumAlani
 * @typedef {{ metin: string; nerede: string[]; senaryolar: string[] }} SurumDugmesi
 * @typedef {{ alanlar: Record<string, SurumAlani>; dugmeler: Record<string, SurumDugmesi>; adimlar: Record<string, string> }} EkranSurumu
 * @typedef {{ tur: 'gelenAlan' | 'kaybolanAlan' | 'yeniSecenek' | 'kaldirilanSecenek' | 'gelenDugme' | 'kaybolanDugme'; baslik: string;
 *   nerede: string; anahtar?: string }} Degisiklik
 */

export const EKRAN_ANALIZI_EKI = 'ekran-analizi';
export const KESIF = 'kesif';
const GECMIS_EN_COK = 30;
const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const yazi = (/** @type {unknown} */ m) => String(m ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
const alanAnahtari = (/** @type {Nesne} */ a) => `${a.secici}|${JSON.stringify(Array.isArray(a.cerceve) ? a.cerceve : [])}`;
/** Yer tutucu seçenek ("Seçiniz…", boş değer ya da boş metin). @param {Nesne} s */
const yerTutucuMu = (s) => String(s?.deger ?? '') === '' || String(s?.metin ?? '').trim() === '' || /^(seçiniz|seciniz|seçin|lütfen seçiniz|-+)\W*$/i.test(String(s?.metin ?? '').trim());
const birlesim = (/** @type {string[]} */ a, /** @type {string[]} */ b) => [...new Set([...a, ...b])];

/** Okunan alanın seçenekleri (radyoda radyolar; yer tutucusuz). @param {Nesne} ham @returns {Secenek[] | undefined} */
function secenekleri(ham) {
  const kaynak = ham.tur === 'radio' ? ham.radyolar : ham.secenekler;
  if (!Array.isArray(kaynak)) return undefined;
  return kaynak.filter((s) => nesneMi(s) && !yerTutucuMu(s)).map((s) => ({ deger: String(s.deger), metin: String(s.metin ?? s.deger) }));
}

/**
 * Koşunun okumasından ekran sürümü. @param {Nesne} okuma "ekran-analizi" eki ({ surum: 2, kesif, gozlemler }) @param {string} senaryoId
 * @returns {{ surum: EkranSurumu; kesifYapildi: boolean; gecilenAdimlar: string[] }}
 */
export function okumadanSurum(okuma, senaryoId) {
  /** @type {EkranSurumu} */
  const surum = { alanlar: {}, dugmeler: {}, adimlar: {} };
  const ekle = (/** @type {Nesne} */ ham, /** @type {string} */ yer) => {
    if (!nesneMi(ham) || typeof ham.secici !== 'string' || ham.tur === 'file') return;
    const k = alanAnahtari(ham);
    const s = secenekleri(ham);
    const eski = surum.alanlar[k];
    if (eski) {
      eski.nerede = birlesim(eski.nerede, [yer]);
      // Aynı alan farklı okumalarda farklı seçeneklerle görüldüyse bağlı listedir: seçenekleri karşılaştırılmaz.
      if (s && eski.secenekler && JSON.stringify(s.map((x) => x.deger).sort()) !== JSON.stringify(eski.secenekler.map((x) => x.deger).sort())) eski.degisken = true;
      return;
    }
    surum.alanlar[k] = {
      etiket: String(ham.etiket ?? '').trim() || String(ham.ad ?? ham.secici), tur: String(ham.tur), secici: ham.secici,
      ...(Array.isArray(ham.cerceve) && ham.cerceve.length ? { cerceve: ham.cerceve } : {}),
      ...(s ? { secenekler: s } : {}), ...(ham.degisken ? { degisken: true } : {}),
      nerede: [yer], senaryolar: yer === KESIF ? [] : [senaryoId],
      ham: { tur: ham.tur, secici: ham.secici, etiket: ham.etiket ?? null, ad: ham.ad ?? null, zorunlu: ham.zorunlu === true, kirilganlik: ham.kirilganlik ?? 'orta',
        adaySeciciler: Array.isArray(ham.adaySeciciler) ? ham.adaySeciciler : [], ...(Array.isArray(ham.cerceve) && ham.cerceve.length ? { cerceve: ham.cerceve } : {}) }
    };
  };
  const dugme = (/** @type {Nesne} */ d, /** @type {string} */ yer) => {
    if (!nesneMi(d) || d.baglanti || !String(d.metin ?? '').trim()) return;
    const k = yazi(d.metin);
    const eski = surum.dugmeler[k];
    if (eski) { eski.nerede = birlesim(eski.nerede, [yer]); return; }
    surum.dugmeler[k] = { metin: String(d.metin).trim(), nerede: [yer], senaryolar: yer === KESIF ? [] : [senaryoId] };
  };
  const kesif = nesneMi(okuma.kesif) ? okuma.kesif : null;
  for (const a of Array.isArray(kesif?.alanlar) ? kesif.alanlar : []) ekle(a, KESIF);
  for (const d of Array.isArray(kesif?.dugmeler) ? kesif.dugmeler : []) dugme(d, KESIF);
  const gozlemler = Array.isArray(okuma.gozlemler) ? okuma.gozlemler.filter(nesneMi) : [];
  for (const g of gozlemler) {
    surum.adimlar[String(g.adimId)] = String(g.baslik ?? g.adimId);
    for (const a of Array.isArray(g.alanlar) ? g.alanlar : []) ekle(a, String(g.adimId));
    for (const d of Array.isArray(g.dugmeler) ? g.dugmeler : []) dugme(d, String(g.adimId));
  }
  return { surum, kesifYapildi: Boolean(kesif), gecilenAdimlar: gozlemler.map((g) => String(g.adimId)) };
}

/**
 * Önceki sürümle karşılaştırır; yeni (birleşik) sürümü ve değişiklikleri döndürür.
 * @param {EkranSurumu} onceki @param {ReturnType<typeof okumadanSurum>} yeni @param {string} senaryoId
 * @returns {{ surum: EkranSurumu; degisiklikler: Degisiklik[] }}
 */
export function surumFarki(onceki, yeni, senaryoId) {
  const gecilen = new Set(yeni.gecilenAdimlar);
  // Önceki sürümde bu yerde görülen şey bu taramada da gezildi mi (keşif ya da aynı senaryoyla aynı adım).
  const gezildi = (/** @type {{ nerede: string[]; senaryolar: string[] }} */ x) =>
    x.nerede.some((y) => (y === KESIF ? yeni.kesifYapildi : gecilen.has(y) && x.senaryolar.includes(senaryoId)));
  const yerAdi = (/** @type {string[]} */ nerede) => {
    const y = nerede.find((n) => n !== KESIF);
    return y ? (yeni.surum.adimlar[y] ?? onceki.adimlar?.[y] ?? y) : 'Keşif';
  };
  /** @type {Degisiklik[]} */
  const degisiklikler = [];
  /** @type {EkranSurumu} */
  const surum = { alanlar: { ...yeni.surum.alanlar }, dugmeler: { ...yeni.surum.dugmeler }, adimlar: { ...(onceki.adimlar ?? {}), ...yeni.surum.adimlar } };
  for (const [k, a] of Object.entries(yeni.surum.alanlar)) {
    const o = onceki.alanlar[k];
    if (!o) { degisiklikler.push({ tur: 'gelenAlan', baslik: a.etiket, nerede: yerAdi(a.nerede), anahtar: k }); continue; }
    surum.alanlar[k] = { ...a, nerede: birlesim(o.nerede, a.nerede), senaryolar: birlesim(o.senaryolar, a.senaryolar) };
    if (!a.secenekler || !o.secenekler || a.degisken || o.degisken || !a.secenekler.length || !o.secenekler.length) continue;
    const eskiler = new Set(o.secenekler.map((s) => s.deger));
    const yeniler = new Set(a.secenekler.map((s) => s.deger));
    for (const s of a.secenekler) if (!eskiler.has(s.deger)) degisiklikler.push({ tur: 'yeniSecenek', baslik: `${a.etiket}: ${s.metin}`, nerede: yerAdi(a.nerede) });
    for (const s of o.secenekler) if (!yeniler.has(s.deger)) degisiklikler.push({ tur: 'kaldirilanSecenek', baslik: `${a.etiket}: ${s.metin}`, nerede: yerAdi(o.nerede) });
  }
  for (const [k, o] of Object.entries(onceki.alanlar)) {
    if (yeni.surum.alanlar[k]) continue;
    if (gezildi(o)) degisiklikler.push({ tur: 'kaybolanAlan', baslik: o.etiket, nerede: yerAdi(o.nerede) });
    else surum.alanlar[k] = o;
  }
  for (const [k, d] of Object.entries(yeni.surum.dugmeler)) {
    const o = onceki.dugmeler[k];
    if (!o) degisiklikler.push({ tur: 'gelenDugme', baslik: d.metin, nerede: yerAdi(d.nerede) });
    else surum.dugmeler[k] = { ...d, nerede: birlesim(o.nerede, d.nerede), senaryolar: birlesim(o.senaryolar, d.senaryolar) };
  }
  for (const [k, o] of Object.entries(onceki.dugmeler)) {
    if (yeni.surum.dugmeler[k]) continue;
    if (gezildi(o)) degisiklikler.push({ tur: 'kaybolanDugme', baslik: o.metin, nerede: yerAdi(o.nerede) });
    else surum.dugmeler[k] = o;
  }
  return { surum, degisiklikler };
}

/** Ekranın sürüm kaydı (ayarlarda). @param {Nesne} ayarlar */
function kayitOku(ayarlar) {
  const k = nesneMi(ayarlar.ekranSurumleri) ? ayarlar.ekranSurumleri : {};
  return { son: nesneMi(k.son) ? /** @type {EkranSurumu} */ (k.son) : null, gecmis: Array.isArray(k.gecmis) ? k.gecmis : [] };
}

/** @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ekranId */
function ekranBul(vt, projeId, ekranId) {
  const e = ekranlariListele(vt, projeId).find((x) => x.id === ekranId);
  if (!e) throw new DepoHatasi('Ekran bulunamadı.');
  return e;
}

/** Ekranın sürüm geçmişi (yeniden eskiye). @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ekranId */
export function ekranSurumleri(vt, projeId, ekranId) {
  ekranBul(vt, projeId, ekranId);
  const { son, gecmis } = kayitOku(ekranAyarlariniGetir(vt, ekranId) ?? {});
  return {
    gecmis: [...gecmis].reverse(),
    alanSayisi: son ? Object.keys(son.alanlar).length : 0, dugmeSayisi: son ? Object.keys(son.dugmeler).length : 0
  };
}

/**
 * Koşu bitince: "ekran-analizi" ekini okur, ekran sürümünü kurar, öncekiyle karşılaştırır ve kaydeder. Ek yoksa null.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {{ sonucId: string; senaryoId: string }} k @param {{ medyaKlasoru: string }} s
 */
export async function kosuEkranSurumu(vt, k, s) {
  const senaryo = senaryoGetir(vt, k.senaryoId);
  if (!senaryo?.ekranId) return null;
  const ekran = ekranBul(vt, senaryo.projeId, senaryo.ekranId);
  const ek = sonucDetayi(vt, k.sonucId)?.medya.find((m) => m.ad === EKRAN_ANALIZI_EKI && !m.silinme);
  const m = ek ? medyaGetir(vt, ek.id) : null;
  if (!m || !medyaDosyaAdiGecerliMi(m.dosya)) return null;
  const okuma = JSON.parse((await medyaTamamenCoz(medyaAnahtariniHazirla(vt), join(s.medyaKlasoru, m.dosya))).toString('utf8'));
  const yeni = okumadanSurum(nesneMi(okuma) ? okuma : {}, senaryo.id);
  if (!yeni.kesifYapildi && !yeni.gecilenAdimlar.length) return null;
  const ayarlar = ekranAyarlariniGetir(vt, ekran.id) ?? {};
  const { son, gecmis } = kayitOku(ayarlar);
  const fark = son ? surumFarki(son, yeni, senaryo.id) : { surum: yeni.surum, degisiklikler: [] };
  const no = (gecmis.length ? Number(gecmis[gecmis.length - 1].surum) || gecmis.length : 0) + 1;
  const notlar = Array.isArray(okuma?.kesif?.notlar) ? okuma.kesif.notlar.map(String) : [];
  const kayit = {
    id: randomUUID(), surum: no, zaman: new Date().toISOString(), senaryoId: senaryo.id, senaryoBaslik: senaryo.baslik, ilk: !son,
    kesif: yeni.kesifYapildi, gecilenAdimlar: yeni.gecilenAdimlar.map((a) => yeni.surum.adimlar[a] ?? a),
    alanSayisi: Object.keys(fark.surum.alanlar).length, dugmeSayisi: Object.keys(fark.surum.dugmeler).length,
    degisiklikler: fark.degisiklikler, notlar
  };
  ekranKaydet(vt, { id: ekran.id, projeId: ekran.projeId, anahtar: ekran.anahtar, ad: ekran.ad, aciklama: ekran.aciklama,
    ayarlar: { ...ayarlar, ekranSurumleri: { son: fark.surum, gecmis: [...gecmis, kayit].slice(-GECMIS_EN_COK) } } });
  return { ekranId: ekran.id, ...kayit };
}

// ---------------------------------------------------------------------------------------
// Modele ekle (gelen alan → Değişiklikler)
// ---------------------------------------------------------------------------------------

const TIPLER = /** @type {Record<string, string>} */ ({
  text: 'metin', search: 'metin', email: 'metin', textarea: 'metin', password: 'metin', url: 'metin', tel: 'telefon', number: 'sayi',
  date: 'tarih', 'datetime-local': 'tarih', select: 'secim', 'select-one': 'secim', 'select-multiple': 'okluSecim', radio: 'radyo',
  checkbox: 'onayKutusu'
});

/** Yeni alanın kimliği: etiketten (ASCII, camelCase), modelde olmayan. @param {string} metin @param {Set<string>} kullanilan */
function yeniKimlik(metin, kullanilan) {
  const tr = /** @type {Record<string, string>} */ ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' });
  const sozcukler = String(metin).replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => tr[c] ?? c).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  let taban = sozcukler.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('').slice(0, 40) || 'alan';
  if (!/^[a-z]/.test(taban)) taban = `alan${taban}`;
  let id = taban;
  for (let i = 2; kullanilan.has(id); i++) id = `${taban}${i}`;
  return id;
}

/** Modelin bütün alan kimlikleri ve seçicileri (iç içe dahil). @param {unknown} d @param {Set<string>} idler @param {Set<string>} seciciler */
function modeliTara(d, idler, seciciler) {
  if (Array.isArray(d)) { for (const x of d) modeliTara(x, idler, seciciler); return; }
  if (!nesneMi(d)) return;
  const n = /** @type {Nesne} */ (d);
  if (typeof n.id === 'string' && typeof n.tip === 'string') idler.add(n.id);
  if (nesneMi(n.konum) && typeof n.konum.secici === 'string') seciciler.add(`${n.konum.secici}|${JSON.stringify(Array.isArray(n.konum.cerceve) ? n.konum.cerceve : [])}`);
  for (const v of Object.values(n)) modeliTara(v, idler, seciciler);
}

/**
 * Sürümdeki gelen alanı modele ekler ve Değişiklikler'e yükler (kabul / ret orada). Alan görüldüğü adıma (keşifte görüldüyse ekranın
 * ilk kendi adımına) eklenir; akışlar (adımların kopyaları) eşitlenir.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} anahtar
 * @param {{ medyaKlasoru: string }} s
 */
export async function alaniModeleEkle(vt, projeId, ekranId, anahtar, s) {
  const ekran = ekranBul(vt, projeId, ekranId);
  const { son } = kayitOku(ekranAyarlariniGetir(vt, ekranId) ?? {});
  const a = son?.alanlar[anahtar];
  if (!a) throw new DepoHatasi('Alan son ekran sürümünde bulunamadı.');
  const mevcut = ekranModeliGetir(vt, ekranId);
  if (!mevcut || !nesneMi(mevcut.model)) throw new DepoHatasi('Ekranın modeli yok.');
  const model = JSON.parse(JSON.stringify(mevcut.model));
  const idler = new Set(); const seciciler = new Set();
  modeliTara(model, idler, seciciler);
  if ([a.secici, ...(a.ham.adaySeciciler ?? [])].some((x) => seciciler.has(`${x}|${JSON.stringify(a.cerceve ?? [])}`))) throw new DepoHatasi(`“${a.etiket}” zaten modelde.`);
  const tip = TIPLER[a.tur] ?? (a.tur.startsWith('select') ? 'secim' : null);
  if (!tip) throw new DepoHatasi(`“${a.etiket}” türündeki alan modele eklenemez.`);
  if ((tip === 'secim' || tip === 'radyo') && !a.secenekler?.length) throw new DepoHatasi(`“${a.etiket}” listesinin seçeneği yok; modele eklenemez.`);
  const id = yeniKimlik(a.etiket, idler);
  const alan = {
    id, tip, etiket: { ekran: a.etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, ...(a.ham.zorunlu ? { zorunlu: true } : {}),
    konum: { secici: a.secici, kirilganlik: String(a.ham.kirilganlik ?? 'orta'), ...(a.cerceve ? { cerceve: a.cerceve } : {}) },
    ...(a.secenekler?.length ? { secenekler: a.secenekler, seceneklerDurumu: a.degisken ? 'kismi' : 'tam' } : {})
  };
  const kendi = (Array.isArray(model.adimlar) ? model.adimlar : []).filter((/** @type {Nesne} */ x) => nesneMi(x) && !nesneMi(x.ortakAkis));
  const adim = kendi.find((/** @type {Nesne} */ x) => a.nerede.includes(x.id)) ?? kendi[0];
  if (!adim) throw new DepoHatasi('Modelde ekranın kendi adımı yok.');
  if (!Array.isArray(adim.bolumler) || !adim.bolumler.length) adim.bolumler = [{ id: `${adim.id}Alanlari`, baslik: String(adim.baslik || adim.id), alanlar: [] }];
  const bolum = adim.bolumler[adim.bolumler.length - 1];
  bolum.alanlar = [...(Array.isArray(bolum.alanlar) ? bolum.alanlar : []), alan];
  // Akışlar adımların tam kopyalarını taşır: aynı adım güncellenen hâliyle değiştirilir.
  for (const akis of Array.isArray(model.akislar) ? model.akislar : []) {
    if (!nesneMi(akis) || !Array.isArray(akis.adimlar)) continue;
    akis.adimlar = akis.adimlar.map((/** @type {unknown} */ x) => (nesneMi(x) && /** @type {Nesne} */ (x).id === adim.id ? JSON.parse(JSON.stringify(adim)) : x));
  }
  const paket = {
    tur: SAYFA_PAKETI_TURU, surum: SAYFA_PAKETI_SURUMU,
    meta: { ekran: { anahtar: ekran.anahtar, ad: ekran.ad, ...(typeof model.ekranUrl === 'string' ? { urlYolu: model.ekranUrl } : {}) },
      olusturan: 'Nöbetçi taraması (ekran sürümü)', olusturulma: new Date().toISOString(), baglamProfilleri: [], not: `“${a.etiket}” ekran sürümünden modele eklendi.` },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
  const y = await analizYukle(vt, projeId, ekranId, paket, { medyaKlasoru: s.medyaKlasoru });
  return { ekranId, bulguSayisi: y.bulguSayisi };
}
