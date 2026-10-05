// EKRAN SENARYOSUNDA TABLO BAŞVURULARI — ekran senaryosunun alan değeri düz metin yerine "${Tablo.Sütun}" ya da aynı tablo iki kez
// gerekiyorsa "${Tablo[etiket].Sütun}" olabilir. Koşuda (veri-oku.mjs; yalnız koşu belleğinde) senaryonun SEÇTİĞİ SATIRDAN çözülür;
// kural serviste ${…} ile aynıdır ve ortak yardımcıdadır (tablo-secimi.mjs > basvuruyuCoz):
//   · Seçimler: içerikteki tabloSecimleri (varsa) + tabloya BAĞLI alanların senaryodaki düz değerleri (aynı tablo + etiket grubunda
//     o sütunun seçimi; ör. İl = İstanbul seçiliyse ${İl - İlçe.İlçe} İstanbul satırından). Uyan İLK satır kullanılır.
//   · Ortam: satırın ortamı boşsa (Tümü) her ortamda geçerli; başka ortamın satırı kullanılmaz.
//   · Ekrana yazılan: alanın seçeneklerinde tablodaki değer senaryo değeri olarak varsa o (seçenek sayfa değeriyle seçilir), yoksa
//     değerin SAYFA karşılığı (tablonun karşılıkları; tanımsızsa tablodaki değer).
//   · Çözülemeyen başvuru (tablo / sütun yok, bu ortamda satır yok, seçilen satırda boş) koşuyu anlaşılır bir hatayla durdurur.
//   · Gizli sütunun değeri "gizliDegerler"e girer: koşucu yakalanan mesajlarda ve hata metinlerinde maskeler.
//   · SENARYO AYARI (ekranda karşılığı olmayan, akışı dallandıran seçim alanı; deger-listesi-modeli.mjs senaryoAyariAlanlari): değer
//     seçeneğin KODUNA çevrilir (koşullar kodla karşılaştırır): sütunun karşılığı ("sayfa" = kod), karşılık yoksa tablodaki değer; kod
//     ya da seçenek metniyle eşleşmezse anlaşılır hata (ayarKoduCoz).
//   · Onay kutusu: tablodaki değer (ya da sayfa karşılığı) evet/hayır olarak okunur (true/false, evet/hayır, 1/0, E/H …; mantiksalDeger);
//     tanınmazsa anlaşılır hata. Dosya: değer (sayfa karşılığı) dosya ADIDIR; alanın uzantı kuralı (kabul) ve verilirse dosyaDenetle
//     (izinli klasör / varlık; veri-oku.mjs) uygulanır; gizli sütundan dosya alınmaz.
// Düz metin değerler aynen kalır (geriye uyum; senaryolar göç ettirilmez). Saf modül (vt yok).
import { SATIR_KIMLIGI, basvuruCoz, basvuruyuCoz, degerBasvurusu, grupAnahtari, sayfaDegeri, sutunBul, tabloBul, uyanSatirlar } from './tablo-secimi.mjs';
import { modelAlanlari } from './paket-tablolari.mjs';
import { senaryoAyariAlanlari } from '../senaryolar/deger-listesi-modeli.mjs';
import { baglariCoz, etiketMetni } from './secime-gore-bag.mjs';

/** @typedef {import('./tablo-secimi.mjs').Tablo} Tablo */
/** @typedef {Record<string, import('./secime-gore-bag.mjs').AlanBagi>} EkranBaglari alan kimliği → { tablo KİMLİĞİ, sütun, etiket?, secimeGore? } */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** Senaryo verisinde bilerek boş bırakılan alanların listesi (senaryo-dogrulayici.mjs > BILEREK_BOS_ANAHTARI ile aynı ad). */
const BILEREK_BOS = 'bilerekBos';

/**
 * Modelin senaryo alanları: alan kimliği → senaryo anahtarı (tek anahtarlı alanlar) ve anahtar → seçeneklerin senaryo değerleri.
 * @param {unknown} model
 */
export function modelAlanBilgisi(model) {
  /** @type {Record<string, string>} */
  const alanAnahtarlari = {};
  /** @type {Record<string, string[]>} */
  const secenekDegerleri = {};
  /** @type {Record<string, string>} senaryo anahtarı → modeldeki alan tipi (onayKutusu / dosya çözümü için) */
  const alanTipleri = {};
  /** @type {Record<string, string>} senaryo anahtarı → dosya alanının kabul ettiği uzantı */
  const kabuller = {};
  /** @type {Record<string, AyarBilgisi>} senaryo anahtarı → senaryo ayarının etiketi ve seçenekleri (kod + metinler) */
  const ayarSecenekleri = {};
  /** @type {Record<string, boolean>} senaryo anahtarı → modelde zorunlu mu (zorunlu: true) */
  const zorunluAnahtarlar = {};
  /** @type {Record<string, string>} senaryo anahtarı → alanın etiketi (koşu notları) */
  const alanEtiketleri = {};
  const ayarlar = senaryoAyariAlanlari(model);
  for (const [id, a] of modelAlanlari(model)) {
    const s = nesneMi(a.eslesme) ? a.eslesme.senaryo : undefined;
    const anahtar = typeof s === 'string' ? s : Array.isArray(s) && s.length === 1 && typeof s[0] === 'string' ? s[0] : null;
    if (!anahtar) continue;
    alanAnahtarlari[id] = anahtar;
    zorunluAnahtarlar[anahtar] = a.zorunlu === true;
    const e = nesneMi(a.etiket) ? a.etiket : {};
    alanEtiketleri[anahtar] = [e.ekran, e.form, nesneMi(a.form) ? a.form.etiket : null].find((x) => typeof x === 'string' && x.trim()) ?? id;
    if (typeof a.tip === 'string') alanTipleri[anahtar] = a.tip;
    if (typeof a.kabul === 'string' && a.kabul) kabuller[anahtar] = a.kabul;
    const havuz = [...(Array.isArray(a.secenekler) ? a.secenekler : []),
      ...(nesneMi(a.bagimlilik) && nesneMi(a.bagimlilik.secenekHaritasi) ? Object.values(a.bagimlilik.secenekHaritasi).flat() : [])];
    const degerler = havuz.filter(nesneMi).map((x) => String(x.senaryoDegeri !== undefined ? x.senaryoDegeri : x.deger));
    if (degerler.length) secenekDegerleri[anahtar] = [...new Set(degerler)];
    if (ayarlar.has(id)) {
      const etiket = nesneMi(a.etiket) ? (typeof a.etiket.form === 'string' && a.etiket.form.trim()) || etiketMetni(a.etiket) : '';
      ayarSecenekleri[anahtar] = {
        etiket: etiket || (nesneMi(a.form) && typeof a.form.etiket === 'string' ? a.form.etiket : '') || id,
        secenekler: /** @type {Record<string, unknown>[]} */ (a.secenekler).filter(nesneMi).map((x) => {
          const kod = String(x.senaryoDegeri !== undefined ? x.senaryoDegeri : x.deger);
          const metinler = [x.formMetni, x.metin, x.deger].filter((m) => typeof m === 'string' && m.trim()).map(String);
          return { kod, metinler: [...new Set(metinler)] };
        })
      };
    }
  }
  return { alanAnahtarlari, secenekDegerleri, alanTipleri, kabuller, ayarSecenekleri, zorunluAnahtarlar, alanEtiketleri };
}

/**
 * Seçilen satırda boş hücreden gelen, ZORUNLU OLMAYAN alanın notu (koşu sonucunda "atlanan alanlar"; hazırlıkta uyarı):
 * "‹Alan›: ‹Tablo› › ‹Sütun› boş, doldurulmadı". @param {string} etiket @param {{ tablo: string; sutun: string }} bos
 */
export const bosHucreNotu = (etiket, bos) => `${etiket}: ${bos.tablo} › ${bos.sutun} boş, doldurulmadı`;

/** @typedef {{ etiket: string; secenekler: Array<{ kod: string; metinler: string[] }> }} AyarBilgisi */

/**
 * Tablodaki değerin senaryo ayarı KODU: sütunun karşılığı ("sayfa" değeri; tanımsızsa tablodaki değer) seçeneğin koduyla (önce tam,
 * sonra büyük / küçük harf duyarsız) ya da metniyle eşleşirse o seçeneğin kodu. Eşleşmezse okunur hata (doğrulama ve koşu aynı
 * kuralı kullanır). @param {import('./tablo-secimi.mjs').Sutun} sutun @param {string} deger @param {AyarBilgisi} ayar
 * @returns {{ deger: string } | { hata: string }}
 */
export function ayarKoduCoz(sutun, deger, ayar) {
  const karsilik = sutun.karsiliklar?.[deger]?.sayfa;
  const aday = karsilik || deger;
  const k = kucuk(aday);
  const s = ayar.secenekler.find((x) => x.kod === aday) ?? ayar.secenekler.find((x) => kucuk(x.kod) === k)
    ?? ayar.secenekler.find((x) => x.metinler.some((m) => kucuk(m) === k));
  if (s) return { deger: s.kod };
  const liste = ayar.secenekler.map((x) => (x.metinler[0] && x.metinler[0] !== x.kod ? `${x.metinler[0]} (${x.kod})` : x.kod)).join(', ');
  return {
    hata: `tablodaki "${deger}" değeri${karsilik ? ` (karşılığı "${karsilik}")` : ''} "${ayar.etiket}" seçeneklerinden hiçbirine karşılık gelmiyor`
      + ` (seçenekler: ${liste}; sütunun karşılıklarında "sayfa değeri" olarak seçeneğin kodunu yazın)`
  };
}

const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');
/** Onay kutusu için tanınan evet / hayır yazımları (küçük harfle). */
const EVET = ['true', 'evet', '1', 'e', 'yes', 'y', 'on', 'var', 'açık', 'işaretli', 'seçili'];
const HAYIR = ['false', 'hayır', 'hayir', '0', 'h', 'no', 'n', 'off', 'yok', 'kapalı', 'işaretsiz'];

/**
 * Tablo değerinin evet / hayır karşılığı (true/false, evet/hayır, 1/0, E/H, yes/no, on/off, var/yok…; büyük-küçük harf fark
 * etmez). Tanınmazsa null. @param {unknown} d @returns {boolean | null}
 */
export function mantiksalDeger(d) {
  if (typeof d === 'boolean') return d;
  const k = kucuk(d);
  if (EVET.includes(k)) return true;
  if (HAYIR.includes(k)) return false;
  return null;
}

/**
 * Tablodan çözülen değerin EKRANA gidecek biçimi (koşu ve dönüşüm planı aynı kuralı kullanır):
 *  · onayKutusu → true / false (değer ya da sayfa karşılığı evet/hayır olarak okunur; tanınmazsa hata)
 *  · dosya → dosya adı (sayfa karşılığı; tanımsızsa değer); gizli sütun, uzantı (kabul) ve dosyaDenetle kuralları
 *  · diğerleri → seçenekler tablodaki değeri senaryo değeri olarak tanıyorsa o, yoksa sayfa karşılığı
 * @param {{ sutun: import('./tablo-secimi.mjs').Sutun; deger: string }} c
 * @param {{ tip?: string; secenekler?: string[]; kabul?: string; dosyaDenetle?: (ad: string) => string | null }} [s]
 * @returns {{ deger: string | boolean } | { hata: string }}
 */
export function ekrandakiDeger(c, s = {}) {
  const goster = (/** @type {string} */ d) => (c.sutun.gizli ? '•••' : `"${d}"`);
  if (s.tip === 'onayKutusu') {
    const b = mantiksalDeger(c.deger) ?? mantiksalDeger(sayfaDegeri(c.sutun, c.deger));
    return b === null ? { hata: `tablodaki ${goster(c.deger)} değeri onay kutusu için evet / hayır olarak anlaşılamadı (true/false, evet/hayır, 1/0, E/H yazın)` } : { deger: b };
  }
  if (s.tip === 'dosya') {
    if (c.sutun.gizli) return { hata: `gizli "${c.sutun.ad}" sütunundan dosya alınamaz` };
    const ad = sayfaDegeri(c.sutun, c.deger).trim();
    const uzantilar = (s.kabul || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
    if (uzantilar.length && !uzantilar.some((u) => ad.toLowerCase().endsWith(u))) return { hata: `tablodaki "${ad}" dosyası kabul edilen türde değil (${s.kabul})` };
    const sorun = s.dosyaDenetle ? s.dosyaDenetle(ad) : null;
    return sorun ? { hata: sorun } : { deger: ad };
  }
  return { deger: s.secenekler?.includes(c.deger) ? c.deger : sayfaDegeri(c.sutun, c.deger) };
}

/**
 * Senaryo verisindeki tablo başvurularını çözer (yeni veri döner; girdi değişmez).
 * @param {Record<string, unknown>} veri senaryonun bu ortamdaki verisi (çözülmüş)
 * @param {{ tablolar: Tablo[]; baglar?: EkranBaglari; alanAnahtarlari?: Record<string, string>; secenekDegerleri?: Record<string, string[]>;
 *   alanTipleri?: Record<string, string>; kabuller?: Record<string, string>; ayarSecenekleri?: Record<string, AyarBilgisi>; dosyaDenetle?: (ad: string) => string | null;
 *   ortamId: string | null; tabloSecimleri?: Record<string, Record<string, string>>; satirSecimi?: import('./tablo-secimi.mjs').SatirSecimi }} s
 *   satirSecimi: birden çok satır uyduğunda seçim (Ayarlar > Koşu > Gelişmiş; verilmezse ilk uyan satır)
 *   zorunluAnahtarlar (modelAlanBilgisi): verilirse seçilen satırda BOŞ hücre yalnız zorunlu alanda hatadır; zorunlu olmayan alana
 *   dokunulmaz (veriden çıkar, bilerekBos'a eklenir: varsayılan da yazılmaz) ve bosBirakilanlar'a not düşülür. Verilmezse (model
 *   bilgisi yok) boş hücre her alanda hatadır (eski davranış).
 * @returns {{ veri: Record<string, unknown>; gizliDegerler: string[]; hatalar: Array<{ alan: string; mesaj: string }>; cozulen: number;
 *   bosBirakilanlar: Array<{ alan: string; etiket: string; tablo: string; sutun: string; not: string }> }}
 */
export function ekranBasvurulariniCoz(veri, s) {
  const sonuc = { ...veri };
  /** @type {string[]} */
  const gizliDegerler = [];
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const hatalar = [];
  /** @type {Array<{ alan: string; etiket: string; tablo: string; sutun: string; not: string }>} */
  const bosBirakilanlar = [];
  let cozulen = 0;
  const basvurulu = Object.entries(veri).filter(([, v]) => degerBasvurusu(v));
  // Tabloya bağlı alanın DÜZ değeri (satır seçimi; ör. "İstanbul"): başvuruyla aynı kural — seçenekler değeri senaryo değeri olarak
  // tanımıyorsa ekrana sütunun SAYFA karşılığı gider (ör. "34"). Satır seçimi tablodaki değerle yapılır (senaryoSecimleri veri'yi okur).
  const duzKarsiliklar = bagliDuzKarsiliklar(veri, s);
  for (const [anahtar, sayfa] of duzKarsiliklar) sonuc[anahtar] = sayfa;
  if (!basvurulu.length) return { veri: sonuc, gizliDegerler, hatalar, cozulen, bosBirakilanlar };
  const secimler = senaryoSecimleri(veri, s);
  for (const [anahtar, ham] of basvurulu) {
    const b = /** @type {import('./tablo-secimi.mjs').Basvuru} */ (degerBasvurusu(ham));
    const c = basvuruyuCoz(s.tablolar, b, secimler, s.ortamId, s.satirSecimi);
    if (!('deger' in c) && c.bos && s.zorunluAnahtarlar && s.zorunluAnahtarlar[anahtar] !== true) {
      // Zorunlu olmayan alan, seçilen satırda boş hücre: alana dokunulmaz (bilerek boş gibi), koşu durmaz; sonuçta not.
      delete sonuc[anahtar];
      const bilerekBos = Array.isArray(sonuc[BILEREK_BOS]) ? /** @type {unknown[]} */ (sonuc[BILEREK_BOS]) : [];
      if (!bilerekBos.includes(anahtar)) sonuc[BILEREK_BOS] = [...bilerekBos, anahtar];
      const etiket = s.alanEtiketleri?.[anahtar] || anahtar;
      bosBirakilanlar.push({ alan: anahtar, etiket, tablo: c.bos.tablo, sutun: c.bos.sutun, not: bosHucreNotu(etiket, c.bos) });
      continue;
    }
    if (!('deger' in c)) {
      hatalar.push({ alan: anahtar, mesaj: `"${anahtar}" alanının değeri (${String(ham).trim()}) test verisinden alınamadı: ${c.hata}.` });
      continue;
    }
    // Senaryo ayarı: seçeneğin koduna çevrilir (koşullar kodla karşılaştırır).
    const ayar = s.ayarSecenekleri?.[anahtar];
    if (ayar) {
      const k = ayarKoduCoz(c.sutun, c.deger, ayar);
      if (!('deger' in k)) {
        hatalar.push({ alan: anahtar, mesaj: `"${anahtar}" alanının değeri (${String(ham).trim()}) test verisinden alınamadı: ${k.hata}.` });
        continue;
      }
      sonuc[anahtar] = k.deger;
      cozulen++;
      continue;
    }
    // Seçim alanı tablodaki değeri senaryo değeri olarak tanıyorsa o yazılır (seçenek sayfa değeriyle seçilir); yoksa sayfa karşılığı.
    // Onay kutusu evet / hayır, dosya alanı dosya adı olur (ekrandakiDeger).
    const e = ekrandakiDeger(c, {
      tip: s.alanTipleri?.[anahtar], secenekler: s.secenekDegerleri?.[anahtar], kabul: s.kabuller?.[anahtar], dosyaDenetle: s.dosyaDenetle
    });
    if (!('deger' in e)) {
      hatalar.push({ alan: anahtar, mesaj: `"${anahtar}" alanının değeri (${String(ham).trim()}) test verisinden alınamadı: ${e.hata}.` });
      continue;
    }
    sonuc[anahtar] = e.deger;
    cozulen++;
    if (c.sutun.gizli) gizliDegerler.push(...new Set([c.deger, ...(typeof e.deger === 'string' ? [e.deger] : [])]));
  }
  return { veri: sonuc, gizliDegerler, hatalar, cozulen, bosBirakilanlar };
}

/**
 * Senaryo KAYDINDA denetim: tablodan (${Tablo.Sütun}) gelen senaryo ayarlarında koşuya girebilecek HER satırın değeri seçenek koduna
 * çevrilebilmeli (ayarKoduCoz). Satırlar: satirSecimi.sabit verilirse (veri koşusu) o satır; yoksa senaryonun seçimleriyle ve ortamla
 * uyan tüm satırlar (satır seçimi "rastgele" olabilir). Tablo / sütun / satır bulunamaması burada denetlenmez (koşuda anlaşılır
 * hatayla durur). Alan başına ilk eşleşmeyen değer hata olur.
 * @param {Record<string, unknown>} veri @param {Parameters<typeof ekranBasvurulariniCoz>[1]} s
 * @returns {Array<{ alan: string; mesaj: string }>}
 */
export function ayarBasvurulariniDenetle(veri, s) {
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const hatalar = [];
  const ayarlar = Object.entries(s.ayarSecenekleri ?? {}).filter(([k]) => degerBasvurusu(veri[k]));
  if (!ayarlar.length) return hatalar;
  const secimler = senaryoSecimleri(veri, s);
  for (const [anahtar, ayar] of ayarlar) {
    const b = /** @type {import('./tablo-secimi.mjs').Basvuru} */ (degerBasvurusu(veri[anahtar]));
    const t = tabloBul(s.tablolar, b.tablo);
    const sutun = t ? sutunBul(t, b.sutun) : undefined;
    if (!t || !sutun) continue;
    const gk = grupAnahtari(t.id, b.etiket);
    const sabitId = s.satirSecimi?.sabit?.[gk];
    const satirlar = sabitId ? t.satirlar.filter((r) => r.id === sabitId) : uyanSatirlar(t, secimler[gk] ?? {}, { ortamId: s.ortamId });
    for (const r of satirlar) {
      const d = r.degerler[sutun.ad];
      if (d === null || d === undefined || d === '') continue;
      const k = ayarKoduCoz(sutun, String(d), ayar);
      if ('hata' in k) { hatalar.push({ alan: anahtar, mesaj: `${ayar.etiket} (${t.ad} › ${sutun.ad}): ${k.hata}.` }); break; }
    }
  }
  return hatalar;
}

/**
 * Metinlerin İÇİNDEKİ ${Tablo.Sütun} / ${Tablo[etiket].Sütun} başvuruları (ör. indirilen dosyanın "metin içeriyor" beklentisi): senaryonun
 * seçimleriyle ve ortamla uyan satırdan, TABLODAKİ değer (sayfa karşılığı değil). ${akis:…} ve tablo başvurusu olmayan ${…} atlanır
 * (koşucu çözer). Döner: başvurunun içi → değer; gizli sütunun değerleri; çözülemeyenler (koşu tarayıcı açılmadan durur).
 * @param {ReadonlyArray<string>} metinler @param {Record<string, unknown>} veri senaryonun bu ortamdaki verisi (seçimler için)
 * @param {Parameters<typeof ekranBasvurulariniCoz>[1]} s
 * @returns {{ degerler: Record<string, string>; gizliDegerler: string[]; hatalar: Array<{ alan: string; mesaj: string }> }}
 */
export function metinBasvurulariniCoz(metinler, veri, s) {
  /** @type {Record<string, string>} */
  const degerler = {};
  /** @type {string[]} */
  const gizliDegerler = [];
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const hatalar = [];
  const icler = [...new Set(metinler.flatMap((m) => [...String(m).matchAll(/\$\{\s*([^{}]+?)\s*\}/g)].map((x) => x[1])))]
    .filter((ic) => !ic.startsWith('akis:') && basvuruCoz(ic));
  if (!icler.length) return { degerler, gizliDegerler, hatalar };
  const secimler = senaryoSecimleri(veri, s);
  for (const ic of icler) {
    const c = basvuruyuCoz(s.tablolar, /** @type {import('./tablo-secimi.mjs').Basvuru} */ (basvuruCoz(ic)), secimler, s.ortamId, s.satirSecimi);
    if (!('deger' in c)) { hatalar.push({ alan: ic, mesaj: `İndirilen dosyanın beklentisindeki \${${ic}} test verisinden alınamadı: ${c.hata}.` }); continue; }
    degerler[ic] = c.deger;
    if (c.sutun.gizli) gizliDegerler.push(c.deger);
  }
  return { degerler, gizliDegerler, hatalar };
}

/**
 * Tabloya bağlı alanların düz değerlerinden sayfa karşılığı olanlar: [senaryo anahtarı, sayfa değeri]. Atlananlar: başvuru, senaryo ayarı
 * (koduna ayrıca çevrilir), onay kutusu / dosya, gizli sütun, seçeneklerin senaryo değeri olarak tanıdığı değer, karşılığı olmayan değer.
 * @param {Record<string, unknown>} veri @param {Parameters<typeof ekranBasvurulariniCoz>[1]} s @returns {Array<[string, string]>}
 */
function bagliDuzKarsiliklar(veri, s) {
  if (!s.baglar || !s.alanAnahtarlari || !s.tablolar?.length) return [];
  /** @type {Array<[string, string]>} */
  const sonuc = [];
  const cozulmus = baglariCoz(s.baglar, (kontrolId) => { const k = s.alanAnahtarlari?.[kontrolId]; return k ? veri[k] : undefined; });
  for (const [alanId, b] of Object.entries(cozulmus)) {
    const anahtar = s.alanAnahtarlari[alanId];
    const v = anahtar ? veri[anahtar] : undefined;
    if (!anahtar || typeof v !== 'string' || !v.trim() || degerBasvurusu(v) || s.ayarSecenekleri?.[anahtar]) continue;
    const tip = s.alanTipleri?.[anahtar];
    if (tip === 'onayKutusu' || tip === 'dosya' || s.secenekDegerleri?.[anahtar]?.includes(v)) continue;
    const t = s.tablolar.find((x) => x.id === b.tablo);
    const sutun = t ? sutunBul(t, b.sutun) : undefined;
    if (!sutun || sutun.gizli) continue;
    const sayfa = sayfaDegeri(sutun, v);
    if (sayfa !== v && !sonuc.some(([k]) => k === anahtar)) sonuc.push([anahtar, sayfa]);
  }
  return sonuc;
}

/**
 * Senaryo verisinde tabloya bağlı alanın düz değeri var mı (koşu, karşılık çözümü için tabloları yalnız gerekirse okur).
 * @param {unknown} veri @param {EkranBaglari | undefined} baglar @param {Record<string, string> | undefined} alanAnahtarlari
 */
export function bagliDuzDegerVarMi(veri, baglar, alanAnahtarlari) {
  if (!nesneMi(veri) || !baglar || !alanAnahtarlari) return false;
  const v = /** @type {Record<string, unknown>} */ (veri);
  return Object.keys(baglar).some((id) => { const k = alanAnahtarlari[id]; const d = k ? v[k] : undefined; return typeof d === 'string' && d.trim() !== '' && !degerBasvurusu(d); });
}

/**
 * Senaryonun tablo seçimleri: içerikteki açık seçimler + tabloya bağlı alanların düz değerleri.
 * @param {Record<string, unknown>} veri @param {Parameters<typeof ekranBasvurulariniCoz>[1]} s
 */
function senaryoSecimleri(veri, s) {
  /** @type {Record<string, Record<string, string>>} */
  const secimler = {};
  for (const [k, v] of Object.entries(nesneMi(s.tabloSecimleri) ? /** @type {Record<string, Record<string, string>>} */ (s.tabloSecimleri) : {})) {
    if (nesneMi(v)) secimler[k] = { ...v };
  }
  // Seçime göre değişen bağ senaryodaki kontrol değerine göre çözülür (secime-gore-bag.mjs).
  const cozulmus = baglariCoz(s.baglar ?? {}, (kontrolId) => { const k = s.alanAnahtarlari?.[kontrolId]; return k ? veri[k] : undefined; });
  for (const [alanId, b] of Object.entries(cozulmus)) {
    const anahtar = s.alanAnahtarlari?.[alanId];
    const v = anahtar ? veri[anahtar] : undefined;
    if (typeof v !== 'string' || !v.trim() || degerBasvurusu(v)) continue;
    const t = s.tablolar.find((x) => x.id === b.tablo);
    const sutun = t ? sutunBul(t, b.sutun) : undefined;
    if (!t || !sutun || sutun.gizli) continue;
    // Senaryo ayarının düz değeri seçenek KODUDUR (ör. "kargo"); tabloda okunur değeri ("Kargo ile") durur: koda çevrilen TEK tablo
    // değeri varsa satır onunla süzülür, yoksa (belirsiz / hiç) süzülmez.
    const ayar = anahtar ? s.ayarSecenekleri?.[anahtar] : undefined;
    let secim = v;
    if (ayar) {
      const adaylar = [...new Set(t.satirlar.map((r) => r.degerler[sutun.ad]).filter((x) => x !== null && x !== undefined && x !== '').map(String))]
        .filter((x) => { const k = ayarKoduCoz(sutun, x, ayar); return 'deger' in k && k.deger === v; });
      if (adaylar.length !== 1) continue;
      secim = adaylar[0];
    }
    const g = (secimler[grupAnahtari(t.id, b.etiket || '')] ??= {});
    if (g[sutun.ad] === undefined) g[sutun.ad] = secim;
  }
  return secimler;
}

/**
 * Ekran senaryosunun satır seçimleri (icerik.tabloSecimleri = { "<tabloId>|<etiket>": { Sütun: değer } }; servis senaryosundakiyle
 * aynı biçim, çözümleyici bunu okur). Tablo projede, sütun tabloda olmalı; gizli sütun seçimde kullanılamaz (değeri senaryoya
 * yazılırdı). Boş değerler ve boş gruplar atılır. undefined / null → undefined (seçim yok).
 * @param {unknown} v @param {ReadonlyArray<{ id: string; ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }> }>} tablolar
 * @returns {{ secimler: Record<string, Record<string, string>> | undefined; hatalar: string[] }}
 */
export function tabloSecimleriniAyikla(v, tablolar) {
  if (v === undefined || v === null) return { secimler: undefined, hatalar: [] };
  if (!nesneMi(v)) return { secimler: undefined, hatalar: ['"tabloSecimleri" bir nesne olmalıdır.'] };
  /** @type {string[]} */
  const hatalar = [];
  /** @type {Record<string, Record<string, string>>} */
  const secimler = {};
  const gruplar = Object.entries(/** @type {Record<string, unknown>} */ (v));
  if (gruplar.length > 50) return { secimler: undefined, hatalar: ['Bir senaryoda en çok 50 satır seçimi olabilir.'] };
  for (const [anahtar, secim] of gruplar) {
    const m = /^([A-Za-z0-9_-]{1,100})\|([\p{L}\p{N} _-]{0,40})$/u.exec(anahtar);
    if (!m) { hatalar.push(`Geçersiz satır seçimi: "${anahtar}".`); continue; }
    const t = tablolar.find((x) => x.id === m[1]);
    if (!t) { hatalar.push('Satır seçimindeki tablo bu projede yok (silinmiş olabilir).'); continue; }
    if (!nesneMi(secim)) { hatalar.push(`"${t.ad}" satır seçimi bir nesne olmalıdır.`); continue; }
    /** @type {Record<string, string>} */
    const temiz = {};
    for (const [sutun, d] of Object.entries(/** @type {Record<string, unknown>} */ (secim))) {
      if (d === '' || d === null || d === undefined) continue;
      if (sutun === SATIR_KIMLIGI) {
        // Satır kimliğiyle sabitleme: satır tabloda olmalı (satırlar verilmişse denetlenir).
        const satirlar = /** @type {{ satirlar?: ReadonlyArray<{ id?: string }> }} */ (t).satirlar;
        if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d) || (satirlar && !satirlar.some((r) => r.id === d))) {
          hatalar.push(`"${t.ad}" tablosunda satır seçimindeki satır yok (silinmiş olabilir).`);
          continue;
        }
        temiz[SATIR_KIMLIGI] = d;
        continue;
      }
      const c = t.sutunlar.find((x) => kucuk(x.ad) === kucuk(sutun));
      if (!c) { hatalar.push(`"${t.ad}" tablosunda "${sutun}" sütunu yok (satır seçimi).`); continue; }
      if (c.gizli === true) { hatalar.push(`"${t.ad}" tablosunun gizli "${c.ad}" sütunu satır seçiminde kullanılamaz.`); continue; }
      if (typeof d !== 'string' || d.length > 500) { hatalar.push(`"${t.ad}" satır seçiminde "${c.ad}" değeri geçersiz.`); continue; }
      temiz[c.ad] = d;
    }
    if (Object.keys(temiz).length) secimler[anahtar] = temiz;
  }
  return { secimler: Object.keys(secimler).length ? secimler : undefined, hatalar };
}

/** Senaryo verisinde tablo başvurusu var mı? @param {unknown} veri */
export const tabloBasvurusuVarMi = (veri) => nesneMi(veri) && Object.values(/** @type {Record<string, unknown>} */ (veri)).some((v) => degerBasvurusu(v));
