// TABLO SEÇİMİ — saf yardımcılar (ORTAK: sunucu ve arayüz; /arayuz/tablo-secimi.mjs olarak sunulur, Node modülü içe aktarmaz).
// Bir alan tablo sütununa bağlıdır; gövdede ${Tablo.Sütun} ya da aynı tablo iki kez gerekiyorsa ${Tablo[etiket].Sütun}.
// Tarih değeri servise başka biçimde gidecekse sona biçim eklenir: ${Kişi.Doğum tarihi|yyyy-MM-dd'T'HH:mm:ss}.
// Aynı tablo + etiketteki alanlar bir seçim grubudur: senaryodaki seçimler (tabloSecimleri["<tabloId>|<etiket>"] =
// { Sütun: değer }) satırları süzer. Formda süzme YUKARIDAN AŞAĞIDIR: bir alanın seçenekleri, formda kendinden ÖNCEKİ alanların
// seçimleriyle uyuşan satırlardaki değerlerdir (üstteki seçim değişince alttaki uyumsuz seçim temizlenir). Koşuda tüm
// seçimlerle uyan ilk satır kullanılır (Ayarlar > Koşu > Gelişmiş'te "Rastgele" seçilirse uyanlardan biri; bir grubun tüm değerleri
// aynı satırdan gelir); satırın ortamı boşsa (Tümü) her ortamda geçerlidir.
// Karşılıklar: sütun değerinin sayfadaki (seçenek değeri) ve servisteki karşılığı; senaryoya tablodaki değer yazılır, ekran
// koşusu sayfa değeriyle seçer, servis gövdesine servis değeri gider (tanımsızsa tablodaki değer).
import { olasiBaglar, secimeGoreVar } from './secime-gore-bag.mjs';

/** Tablo / sütun adı karakterleri (tablo-deposu.mjs TABLO_ADI ile aynı): . [ ] { } $ < > & | ve denetim karakterleri yok. */
export const AD_KALIBI = '[^.\\[\\]{}$<>&|\\u0000-\\u001f]{1,60}';
/** Tarih biçimi (yyyy, MM, dd, HH, mm, ss; tek tırnak içi sabit): { } $ yok, en çok 60. */
export const BICIM_KALIBI = "[^{}$\\u0000-\\u001f]{1,60}";
/** Etiket (başvuran / kefil): harf, rakam, boşluk, "_", "-". */
export const ETIKET_KALIBI = '[\\p{L}\\p{N} _-]{1,40}';
const BASVURU = new RegExp(`^\\s*(${AD_KALIBI})(?:\\[(${ETIKET_KALIBI})\\])?\\.(${AD_KALIBI})\\s*(?:\\|(${BICIM_KALIBI}))?$`, 'u');

/**
 * @typedef {{ sayfa?: string; servis?: string }} Karsilik
 * @typedef {{ ad: string; gizli: boolean; tip?: string; karsiliklar?: Record<string, Karsilik> }} Sutun
 * @typedef {{ id?: string; ortamId: string | null; degerler: Record<string, string | null> }} Satir
 * @typedef {{ id: string; ad: string; sutunlar: Sutun[]; satirlar: Satir[] }} Tablo
 * @typedef {{ tablo: string; etiket: string; sutun: string; bicim: string }} Basvuru
 */

const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');

/** "Tablo.Sütun" / "Tablo[etiket].Sütun" (+ "|biçim") → { tablo, etiket, sutun, bicim } | null. @param {string} ad @returns {Basvuru | null} */
export function basvuruCoz(ad) {
  const m = BASVURU.exec(ad);
  return m ? { tablo: m[1].trim(), etiket: (m[2] || '').trim(), sutun: m[3].trim(), bicim: (m[4] || '').trim() } : null;
}

/**
 * Senaryo DEĞERİ olarak tablo başvurusu: değerin tamamı "${Tablo.Sütun}" / "${Tablo[etiket].Sütun|biçim}" ise başvuru, değilse null
 * (düz metin değer aynen kullanılır). Ekran senaryolarında alan değeri böyle verilebilir (koşuda seçilen satırdan çözülür).
 * @param {unknown} deger @returns {Basvuru | null}
 */
export function degerBasvurusu(deger) {
  if (typeof deger !== 'string') return null;
  const m = /^\s*\$\{([^{}]+)\}\s*$/u.exec(deger);
  return m ? basvuruCoz(m[1]) : null;
}

/** Başvurunun senaryo değeri biçimi: "${Tablo.Sütun}". @param {string} tablo @param {string} sutun @param {string} [etiket] */
export const degerBasvurusuYaz = (tablo, sutun, etiket = '') => `\${${basvuru(tablo, sutun, etiket)}}`;

/** @param {string} tablo @param {string} sutun @param {string} [etiket] @param {string} [bicim] tarih biçimi */
export const basvuru = (tablo, sutun, etiket = '', bicim = '') => `${tablo}${etiket ? `[${etiket}]` : ''}.${sutun}${bicim ? `|${bicim}` : ''}`;

/**
 * Gizli sütun değerinin SATIR SEÇİMİ için kısmi maskesi: ilk ve son karakter açık, arası "•" (ör. "4•••••••••8"); 4 karakterden kısa
 * değer tam maske ("•••"). YALNIZ sunucu üretir (satır seçimi ucu); tam değer arayüze gitmez. Rapor, hata metni ve Tablolar ekranı
 * tam maskeyle kalır.
 * @param {unknown} deger @returns {string}
 */
export function kismiMaske(deger) {
  const k = Array.from(String(deger ?? ''));
  return k.length < 4 ? '•••' : `${k[0]}${'•'.repeat(k.length - 2)}${k[k.length - 1]}`;
}

/** Seçim grubunun anahtarı. @param {string} tabloId @param {string} [etiket] */
export const grupAnahtari = (tabloId, etiket = '') => `${tabloId}|${etiket}`;

/** @template {{ ad: string }} T @param {T[]} liste @param {string} ad @returns {T | undefined} */
const adla = (liste, ad) => liste.find((x) => kucuk(x.ad) === kucuk(ad));
/** @param {Tablo[]} tablolar @param {string} ad */
export const tabloBul = (tablolar, ad) => adla(tablolar, ad);
/** @param {Tablo} tablo @param {string} ad */
export const sutunBul = (tablo, ad) => adla(tablo.sutunlar, ad);

/**
 * SATIR KİMLİĞİYLE SABİTLEME: satır seçiminde ({ Sütun: değer }) bu ayrılmış anahtar satırın kimliğidir — değerlerden (açık ya da gizli)
 * bağımsız olarak o satır seçilir (ör. yalnız gizli sütunu dolu satır; hızlı test kaydında senaryonun kendi satırı). "$" sütun adında
 * kullanılamadığından (AD_KALIBI) bir sütunla çakışmaz.
 */
export const SATIR_KIMLIGI = '$satir';
/** Satır kimliğiyle sabitleme seçimi. @param {string} satirId @returns {Record<string, string>} */
export const satirSabitlemesi = (satirId) => ({ [SATIR_KIMLIGI]: String(satirId) });

/**
 * Seçimlerle (ve ortamla) uyuşan satırlar. haric: bu sütunun kendi seçimi yok sayılır (seçeneklerini hesaplarken). Seçimde satır
 * kimliği (SATIR_KIMLIGI) varsa yalnız o satır uyar.
 * @param {Tablo} tablo @param {Record<string, string>} [secim] @param {{ ortamId?: string | null; haric?: string }} [s]
 */
export function uyanSatirlar(tablo, secim = {}, s = {}) {
  const kosullar = Object.entries(secim).filter(([sutun, d]) => d !== '' && d !== undefined && d !== null && sutun !== SATIR_KIMLIGI && kucuk(sutun) !== kucuk(s.haric ?? '\u0000'));
  const kimlik = secim[SATIR_KIMLIGI];
  return tablo.satirlar.filter((r) => (!r.ortamId || !s.ortamId || r.ortamId === s.ortamId)
    && (!kimlik || String(r.id ?? '') === String(kimlik))
    && kosullar.every(([sutun, d]) => {
      const gercek = tablo.sutunlar.find((x) => kucuk(x.ad) === kucuk(sutun));
      return gercek ? String(r.degerler[gercek.ad] ?? '') === String(d) : true;
    }));
}

/**
 * Sütunun seçenekleri: diğer seçimlerle uyuşan satırlardaki farklı, boş olmayan değerler (tablo sırasıyla).
 * @param {Tablo} tablo @param {Record<string, string>} secim @param {string} sutun @param {string | null} [ortamId]
 */
export function sutunSecenekleri(tablo, secim, sutun, ortamId) {
  const s = sutunBul(tablo, sutun);
  if (!s || s.gizli) return [];
  /** @type {string[]} */
  const sonuc = [];
  for (const r of uyanSatirlar(tablo, secim, { ortamId, haric: s.ad })) {
    const d = r.degerler[s.ad];
    if (d !== null && d !== undefined && d !== '' && !sonuc.includes(d)) sonuc.push(d);
  }
  return sonuc;
}

/**
 * FORMDAKİ SEÇİMLE AYNI SÜTUN (senaryo formu, satır seçimi önizlemesi): formda düz bir değer seçilmiş alan (ör. Müşteri tipi =
 * Bireysel) bu tablonun bir sütununa bağlıysa ya da tabloda alanın adıyla aynı adlı açık sütun varsa, "koşullara uyan satırlar"
 * kullanıcının beklediği gibi o seçime göre süzülmez — satır seçiminin koşulları yalnız açıkça yazılanlardır. Bu işlev o sütunları ve
 * formdaki değerin TABLODAKİ yazımını (değerin kendisi, sayfa karşılığı ya da büyük / küçük harf farkıyla eşit olan) bulur; arayüz
 * kullanıcıya "koşula ekle" seçeneği sunar. Koşulda zaten olan sütun ve gizli sütun atlanır. tabloDegeri null: tabloda o değer yok.
 * @param {{ sutunlar: Sutun[]; satirlar: Satir[] }} tablo @param {Record<string, string>} secim satır seçiminin koşulları
 * @param {Array<{ etiket: string; deger: string; metin?: string; sutun?: string | null }>} alanlar formdaki düz seçimler (metin: seçeneğin
 *   görünen adı — tabloda kod yerine ad yazılmışsa onunla eşlenir; sutun: bu tabloya bağlıysa sütun adı)
 * @returns {Array<{ etiket: string; sutun: string; formDegeri: string; tabloDegeri: string | null }>}
 */
export function formSuzgecleri(tablo, secim, alanlar) {
  /** @type {Array<{ etiket: string; sutun: string; formDegeri: string; tabloDegeri: string | null }>} */
  const sonuc = [];
  const kosulda = new Set(Object.entries(secim || {}).filter(([, d]) => d !== '' && d !== null && d !== undefined).map(([k]) => kucuk(k)));
  for (const a of alanlar) {
    const formDegeri = String(a.deger ?? '').trim();
    if (!formDegeri) continue;
    const s = (a.sutun ? sutunBul(/** @type {Tablo} */ (tablo), a.sutun) : undefined) ?? sutunBul(/** @type {Tablo} */ (tablo), a.etiket);
    if (!s || s.gizli || kosulda.has(kucuk(s.ad)) || sonuc.some((x) => x.sutun === s.ad)) continue;
    const degerler = [...new Set(tablo.satirlar.map((r) => r.degerler[s.ad]).filter((v) => v !== null && v !== undefined && v !== '').map(String))];
    const adaylar = [formDegeri, ...(a.metin && a.metin.trim() ? [a.metin.trim()] : [])];
    const tabloDegeri = degerler.find((v) => adaylar.includes(v)) ?? degerler.find((v) => adaylar.includes(sayfaDegeri(s, v)))
      ?? degerler.find((v) => adaylar.some((x) => kucuk(v) === kucuk(x) || kucuk(sayfaDegeri(s, v)) === kucuk(x))) ?? null;
    // formDegeri: formda GÖRÜNEN değer (seçeneğin metni; yoksa değer) — kullanıcıya gösterilir.
    sonuc.push({ etiket: a.etiket, sutun: s.ad, formDegeri: adaylar[adaylar.length - 1], tabloDegeri });
  }
  return sonuc;
}

/**
 * Satır neden uyuyor (satır seçimi önizlemesi): koşulların her biri ("Sütun = değer") ya da koşul yoksa "koşul yok"; formdaki seçimle
 * çelişen sütunlar (formSuzgecleri) ayrıca döner — satır yine koşulur ama kullanıcı beklemiyor olabilir.
 * @param {{ sutunlar: Sutun[] }} tablo @param {Satir} satir @param {Record<string, string>} secim
 * @param {ReturnType<typeof formSuzgecleri>} [suzgecler]
 * @returns {{ nedenler: string[]; celisenler: Array<{ etiket: string; sutun: string; formDegeri: string; satirDegeri: string }> }}
 */
export function satirUyumu(tablo, satir, secim, suzgecler = []) {
  const nedenler = Object.entries(secim || {}).filter(([, d]) => d !== '' && d !== null && d !== undefined).map(([k, d]) => {
    if (k === SATIR_KIMLIGI) return `satır: ${/** @type {{ ad?: string }} */ (satir).ad || d}`;
    const s = tablo.sutunlar.find((x) => kucuk(x.ad) === kucuk(k));
    return `${s ? s.ad : k} = ${d}`;
  });
  const celisenler = suzgecler.filter((f) => String(satir.degerler[f.sutun] ?? '') !== String(f.tabloDegeri ?? '\u0000'))
    .map((f) => ({ etiket: f.etiket, sutun: f.sutun, formDegeri: f.formDegeri, satirDegeri: String(satir.degerler[f.sutun] ?? '') }));
  return { nedenler, celisenler };
}

/** Değerin servis gövdesine yazılacak karşılığı (tanımsızsa değerin kendisi). @param {Sutun} sutun @param {string} deger */
export const servisDegeri = (sutun, deger) => sutun.karsiliklar?.[deger]?.servis || deger;

/**
 * Satır seçimi (Ayarlar > Koşu > Gelişmiş > Tablodan satır seçimi): 'ilk' (varsayılan) uyan ilk satır; 'rastgele' uyanlardan biri.
 * onbellek: aynı koşuda aynı grup + seçim + ortam için seçilen satır — grubun tüm değerleri AYNI satırdan gelir. rastgele: [0, 1)
 * üreteci (testlerde tohumlu; verilmezse Math.random).
 * sabit: VERİ KOŞUSU / TEKRAR — grup anahtarı ("<tabloId>|<etiket>") → satır kimliği: o grubun değerleri seçimlere bakılmadan bu satırdan
 * gelir (satır yoksa ya da başka ortamınsa açık hata). veriler: "o koşudaki veriyle" tekrar — grup → satırın o koşudaki değerleri
 * (yalnız gizli sütunu olmayan tabloda; satır silinmiş olsa da bu değerler kullanılır). kullanilan: koşuda kullanılan satırlar
 * (grup → satır; rapor "hangi satırla koştu" ve tekrar koşusu için doldurulur).
 * @typedef {{ kip?: string; rastgele?: () => number; onbellek?: Map<string, Satir | undefined>; sabit?: Record<string, string>;
 *   veriler?: Record<string, Record<string, string | null>>; kullanilan?: Map<string, Satir> }} SatirSecimi
 */

/** Satır seçimi (ayar değerinden; tanınmayan değer 'ilk'). @param {unknown} kip @param {() => number} [rastgele] @returns {SatirSecimi} */
export const satirSecimiOlustur = (kip, rastgele = Math.random) => ({ kip: kip === 'rastgele' ? 'rastgele' : 'ilk', rastgele, onbellek: new Map() });

/**
 * Koşuda kullanılacak satır: uyan ilk satır (satirSecimi 'rastgele' ise uyanlardan biri); yoksa undefined.
 * @param {Tablo} tablo @param {Record<string, string>} secim @param {string | null} [ortamId] @param {SatirSecimi} [satirSecimi]
 * @param {string} [grup] önbellek anahtarı eki (başvurunun etiketi)
 */
export function secilenSatir(tablo, secim, ortamId, satirSecimi, grup = '') {
  const uyan = uyanSatirlar(tablo, secim, { ortamId });
  if (!satirSecimi || satirSecimi.kip !== 'rastgele' || uyan.length < 2) return uyan[0];
  const kosullar = Object.entries(secim).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const anahtar = JSON.stringify([tablo.id, grup, ortamId ?? null, kosullar]);
  if (satirSecimi.onbellek?.has(anahtar)) return satirSecimi.onbellek.get(anahtar);
  const r = (satirSecimi.rastgele ?? Math.random)();
  const satir = uyan[Math.min(uyan.length - 1, Math.max(0, Math.floor(r * uyan.length)))];
  satirSecimi.onbellek?.set(anahtar, satir);
  return satir;
}

/** Değerin sayfadaki (seçenek value) karşılığı (tanımsızsa değerin kendisi). @param {Sutun} sutun @param {string} deger */
export const sayfaDegeri = (sutun, deger) => sutun.karsiliklar?.[deger]?.sayfa || deger;

/**
 * Başvurunun (Tablo.Sütun / Tablo[etiket].Sütun) koşudaki değeri: senaryonun seçimleriyle (tabloSecimleri["<tabloId>|<etiket>"])
 * ve ortamla uyan İLK satırdan (satırın ortamı boşsa her ortamda geçerli). SERVİS gövdesi ve EKRAN senaryosu koşusu bu tek
 * kuralı kullanır (servis-islemleri.mjs, ekran-basvurulari.mjs). Çözülemezse kullanıcıya dönük hata metni (tabloYok: tablo yok).
 * @param {Tablo[]} tablolar değerleri çözülmüş tablolar @param {Basvuru} b @param {Record<string, Record<string, string>> | undefined} tabloSecimleri
 * @param {string | null} [ortamId] @param {SatirSecimi} [satirSecimi] birden çok satır uyduğunda seçim (verilmezse ilk uyan)
 * @returns {{ tablo: Tablo; sutun: Sutun; satir: Satir; deger: string } | { hata: string; tabloYok?: boolean }}
 */
export function basvuruyuCoz(tablolar, b, tabloSecimleri, ortamId, satirSecimi) {
  const t = tabloBul(tablolar, b.tablo);
  if (!t) return { hata: `"${b.tablo}" adında tablo yok`, tabloYok: true };
  const sutun = sutunBul(t, b.sutun);
  if (!sutun) return { hata: `"${t.ad}" tablosunda "${b.sutun}" sütunu yok` };
  const gk = grupAnahtari(t.id, b.etiket);
  const secim = tabloSecimleri?.[gk] ?? {};
  const grup = `"${t.ad}${b.etiket ? ` (${b.etiket})` : ''}"`;
  const sabitId = satirSecimi?.sabit?.[gk];
  /** @type {Satir | undefined} */
  let satir;
  if (sabitId) {
    // Veri koşusu / tekrar: grubun satırı sabit (seçimlere bakılmaz). Ortama özel satır yalnız kendi ortamında.
    const bulunan = t.satirlar.find((r) => r.id === sabitId && (!r.ortamId || !ortamId || r.ortamId === ortamId));
    const eski = satirSecimi?.veriler?.[gk];
    satir = eski && !t.sutunlar.some((x) => x.gizli)
      ? { ...(bulunan ?? { id: sabitId, ortamId: null }), degerler: { ...(bulunan?.degerler ?? {}), ...eski } }
      : bulunan;
    if (!satir) return { hata: `${grup} tablosunda koşunun satırı artık yok ya da bu ortamda geçerli değil` };
  } else {
    satir = secilenSatir(t, secim, ortamId, satirSecimi, b.etiket);
  }
  if (!satir) return { hata: Object.keys(secim).length ? `${grup} tablosunda seçimlerle uyan satır yok` : `${grup} tablosunda bu ortamda satır yok` };
  if (satirSecimi?.kullanilan && !satirSecimi.kullanilan.has(gk)) satirSecimi.kullanilan.set(gk, satir);
  const d = satir.degerler[sutun.ad];
  if (d === null || d === undefined || d === '') return { hata: `${grup} tablosunun seçilen satırında "${sutun.ad}" boş` };
  return { tablo: t, sutun, satir, deger: String(d) };
}

/**
 * KOŞUL DEĞERLENDİRMESİ İÇİN başvurunun TEK değeri (senaryo doğrulayıcısının baglam.tabloDegeri'si; form ve sunucu aynı kuralı
 * kullanır): senaryonun satır seçimiyle (tabloSecimleri; çalıştırma biçimi 'secili' ise işaretli satırlar, 'tumu' ise uyan tüm
 * satırlar) ve ortam(lar)la uyan satırların bu sütundaki değerleri TEK ise { deger (tablodaki), sayfa (sayfa karşılığı) }. Değer satıra
 * göre değişiyorsa (birden çok farklı değer), satır yoksa, satırda boşsa, sütun gizliyse ya da tablo / sütun yoksa null (bilinmiyor).
 * ortamIdler: senaryonun ortamları (birden çoksa hepsinde aynı olmalı); verilmezse tüm satırlar.
 * @param {ReadonlyArray<Tablo>} tablolar @param {Basvuru} b
 * @param {{ tabloSecimleri?: Record<string, Record<string, string>> | null; veriKosulari?: { gruplar?: Record<string, { kip: string; satirlar?: string[] }> } | null;
 *   ortamIdler?: ReadonlyArray<string | null> }} [s]
 * @returns {{ deger: string; sayfa: string } | null}
 */
export function basvurununTekDegeri(tablolar, b, s = {}) {
  const t = tabloBul([...tablolar], b.tablo);
  const sutun = t ? sutunBul(t, b.sutun) : undefined;
  if (!t || !sutun || sutun.gizli) return null;
  const gk = grupAnahtari(t.id, b.etiket);
  const ham = s.tabloSecimleri?.[gk];
  const secim = ham && typeof ham === 'object' && !Array.isArray(ham) ? ham : {};
  const ayar = s.veriKosulari?.gruplar?.[gk];
  const isaretli = ayar && Array.isArray(ayar.satirlar) ? ayar.satirlar.map(String) : [];
  const ortamlar = s.ortamIdler && s.ortamIdler.length ? s.ortamIdler : [null];
  /** @type {Set<Satir>} */
  const satirlar = new Set();
  for (const o of ortamlar) {
    const uyan = ayar && ayar.kip === 'secili'
      ? t.satirlar.filter((r) => isaretli.includes(String(r.id)) && (!r.ortamId || !o || r.ortamId === o))
      : uyanSatirlar(t, secim, { ortamId: o });
    for (const r of uyan) satirlar.add(r);
  }
  const degerler = new Set([...satirlar].map((r) => r.degerler[sutun.ad] ?? ''));
  if (degerler.size !== 1) return null;
  const deger = String([...degerler][0]);
  return deger ? { deger, sayfa: sayfaDegeri(sutun, deger) } : null;
}

const dolu = (/** @type {unknown} */ v) => v !== null && v !== undefined && v !== '';

/**
 * Ekran alanı → tablo sütunu bağlantılarından koşullu değer listeleri (Test verisi değer listeleriyle aynı biçim; senaryo formu,
 * doğrulayıcı ve koşu bunları kullanır): her bağlı alan için koşulsuz liste (sütunun tüm değerleri) ve aynı grupta formda
 * kendinden ÖNCE gelen bağlı alanların (en çok 3) değer birleşimleri için koşullu listeler. Form, koşulları tutan en çok koşullu
 * listeyi seçer; böylece seçtikçe alttaki alanlar satırlardan süzülür. Gizli sütun listeye girmez. Sayfa değeri tanımlı
 * değerde ekranDegeri (koşu seçeneği bununla seçer).
 * @param {Record<string, import('./secime-gore-bag.mjs').AlanBagi>} baglar @param {Tablo[]} tablolar @param {string} ekranId
 * @param {string[]} [sira] formdaki alan sırası (verilmezse bağlantıların sırası)
 */
export function tabloDegerListeleri(baglar, tablolar, ekranId, sira) {
  const yer = (/** @type {string} */ alan) => { const i = sira ? sira.indexOf(alan) : -1; return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  /** @type {Map<string, Array<{ alan: string; t: Tablo; s: Sutun }>>} */
  const gruplar = new Map();
  /** Seçime göre değişen bağlar (secime-gore-bag.mjs): grupta süzülmez; varsayılan + seçenek başına koşullu liste. @type {Array<[string, any]>} */
  const kosullular = [];
  for (const [alan, b] of Object.entries(baglar)) {
    if (secimeGoreVar(b)) { kosullular.push([alan, b]); continue; }
    const t = tablolar.find((x) => x.id === b.tablo);
    const s = t ? sutunBul(t, b.sutun) : undefined;
    if (!t || !s || s.gizli) continue;
    const k = grupAnahtari(t.id, b.etiket || '');
    if (!gruplar.has(k)) gruplar.set(k, []);
    /** @type {Array<{ alan: string; t: Tablo; s: Sutun }>} */ (gruplar.get(k)).push({ alan, t, s });
  }
  /** @type {Array<{ id: string; ad: string; tur: 'liste'; kullanim: 'ekran'; hedef: { ekranId: string; alan: string }; baglanti: { tablo: string; sutun: string; etiket?: string }; kosullar: Array<{ alan: string; deger: string }>; degerler: Array<{ deger: string; ekranDegeri?: string }> }>} */
  const sonuc = [];
  for (const uyeler of gruplar.values()) {
    for (const u of uyeler) {
      const onceki = sira ? uyeler.filter((x) => x !== u && yer(x.alan) < yer(u.alan)) : uyeler.slice(0, uyeler.indexOf(u));
      const digerleri = onceki.slice(-3);
      /** @type {Map<string, { kosullar: Array<{ alan: string; deger: string }>; degerler: string[] }>} */
      const harita = new Map();
      const ekle = (/** @type {Array<{ alan: string; deger: string }>} */ kosullar, /** @type {string} */ v) => {
        const imza = JSON.stringify(kosullar);
        let e = harita.get(imza);
        if (!e) { e = { kosullar, degerler: [] }; harita.set(imza, e); }
        if (!e.degerler.includes(v)) e.degerler.push(v);
      };
      for (const r of u.t.satirlar) {
        const v = r.degerler[u.s.ad];
        if (!dolu(v)) continue;
        ekle([], String(v));
        for (let m = 1; m < (1 << digerleri.length); m++) {
          /** @type {Array<{ alan: string; deger: string }>} */
          const kosullar = [];
          let tamam = true;
          digerleri.forEach((x, i) => {
            if (!(m & (1 << i)) || !tamam) return;
            const xv = r.degerler[x.s.ad];
            if (!dolu(xv)) { tamam = false; return; }
            kosullar.push({ alan: x.alan, deger: String(xv) });
          });
          if (tamam) ekle(kosullar, String(v));
        }
      }
      let n = 0;
      const k = u.s.karsiliklar || {};
      for (const { kosullar, degerler } of harita.values()) {
        sonuc.push({
          id: `tablo:${u.alan}:${n++}`, ad: `${u.t.ad} → ${u.s.ad}`, tur: 'liste', kullanim: 'ekran', hedef: { ekranId, alan: u.alan },
          // Senaryo formunun "Tablodan" seçeneği bununla ${Tablo.Sütun} başvurusu üretir.
          baglanti: { tablo: u.t.ad, sutun: u.s.ad, ...(baglar[u.alan]?.etiket ? { etiket: String(baglar[u.alan].etiket) } : {}) }, kosullar,
          degerler: degerler.map((deger) => ({ deger, ...(k[deger]?.sayfa ? { ekranDegeri: k[deger].sayfa } : {}) }))
        });
      }
    }
  }
  // Seçime göre değişen bağ: varsayılan bağın koşulsuz listesi + her seçeneğin bağı için { kontrol = değer } koşullu liste (form
  // koşulları tutan en çok koşullu listeyi seçer: kontrol o değerdeyse o seçeneğin tablosu).
  for (const [alan, b] of kosullular) {
    let n = 0;
    for (const x of olasiBaglar(b)) {
      const t = tablolar.find((y) => y.id === x.tablo);
      const s = t ? sutunBul(t, x.sutun) : undefined;
      if (!t || !s || s.gizli) continue;
      const k = s.karsiliklar || {};
      const degerler = [...new Set(t.satirlar.map((r) => r.degerler[s.ad]).filter(dolu).map(String))];
      sonuc.push({
        id: `tablo:${alan}:s${n++}`, ad: `${t.ad} → ${s.ad}`, tur: 'liste', kullanim: 'ekran', hedef: { ekranId, alan },
        baglanti: { tablo: t.ad, sutun: s.ad, ...(x.etiket ? { etiket: String(x.etiket) } : {}) },
        kosullar: x.deger === null ? [] : [{ alan: b.secimeGore.alan, deger: x.deger }],
        degerler: degerler.map((deger) => ({ deger, ...(k[deger]?.sayfa ? { ekranDegeri: k[deger].sayfa } : {}) }))
      });
    }
  }
  return sonuc;
}
