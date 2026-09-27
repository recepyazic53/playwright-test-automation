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
//   · Onay kutusu: tablodaki değer (ya da sayfa karşılığı) evet/hayır olarak okunur (true/false, evet/hayır, 1/0, E/H …; mantiksalDeger);
//     tanınmazsa anlaşılır hata. Dosya: değer (sayfa karşılığı) dosya ADIDIR; alanın uzantı kuralı (kabul) ve verilirse dosyaDenetle
//     (izinli klasör / varlık; veri-oku.mjs) uygulanır; gizli sütundan dosya alınmaz.
// Düz metin değerler aynen kalır (geriye uyum; senaryolar göç ettirilmez). Saf modül (vt yok).
import { basvuruyuCoz, degerBasvurusu, grupAnahtari, sayfaDegeri, sutunBul } from './tablo-secimi.mjs';
import { modelAlanlari } from './paket-tablolari.mjs';

/** @typedef {import('./tablo-secimi.mjs').Tablo} Tablo */
/** @typedef {Record<string, { tablo: string; sutun: string; etiket?: string }>} EkranBaglari alan kimliği → { tablo KİMLİĞİ, sütun, etiket? } */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);

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
  for (const [id, a] of modelAlanlari(model)) {
    const s = nesneMi(a.eslesme) ? a.eslesme.senaryo : undefined;
    const anahtar = typeof s === 'string' ? s : Array.isArray(s) && s.length === 1 && typeof s[0] === 'string' ? s[0] : null;
    if (!anahtar) continue;
    alanAnahtarlari[id] = anahtar;
    if (typeof a.tip === 'string') alanTipleri[anahtar] = a.tip;
    if (typeof a.kabul === 'string' && a.kabul) kabuller[anahtar] = a.kabul;
    const havuz = [...(Array.isArray(a.secenekler) ? a.secenekler : []),
      ...(nesneMi(a.bagimlilik) && nesneMi(a.bagimlilik.secenekHaritasi) ? Object.values(a.bagimlilik.secenekHaritasi).flat() : [])];
    const degerler = havuz.filter(nesneMi).map((x) => String(x.senaryoDegeri !== undefined ? x.senaryoDegeri : x.deger));
    if (degerler.length) secenekDegerleri[anahtar] = [...new Set(degerler)];
  }
  return { alanAnahtarlari, secenekDegerleri, alanTipleri, kabuller };
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
 *   alanTipleri?: Record<string, string>; kabuller?: Record<string, string>; dosyaDenetle?: (ad: string) => string | null;
 *   ortamId: string | null; tabloSecimleri?: Record<string, Record<string, string>> }} s
 * @returns {{ veri: Record<string, unknown>; gizliDegerler: string[]; hatalar: Array<{ alan: string; mesaj: string }>; cozulen: number }}
 */
export function ekranBasvurulariniCoz(veri, s) {
  const sonuc = { ...veri };
  /** @type {string[]} */
  const gizliDegerler = [];
  /** @type {Array<{ alan: string; mesaj: string }>} */
  const hatalar = [];
  let cozulen = 0;
  const basvurulu = Object.entries(veri).filter(([, v]) => degerBasvurusu(v));
  if (!basvurulu.length) return { veri: sonuc, gizliDegerler, hatalar, cozulen };
  // Seçimler: içerikteki açık seçimler + bağlı alanların düz değerleri.
  /** @type {Record<string, Record<string, string>>} */
  const secimler = {};
  for (const [k, v] of Object.entries(nesneMi(s.tabloSecimleri) ? /** @type {Record<string, Record<string, string>>} */ (s.tabloSecimleri) : {})) {
    if (nesneMi(v)) secimler[k] = { ...v };
  }
  for (const [alanId, b] of Object.entries(s.baglar ?? {})) {
    const anahtar = s.alanAnahtarlari?.[alanId];
    const v = anahtar ? veri[anahtar] : undefined;
    if (typeof v !== 'string' || !v.trim() || degerBasvurusu(v)) continue;
    const t = s.tablolar.find((x) => x.id === b.tablo);
    const sutun = t ? sutunBul(t, b.sutun) : undefined;
    if (!t || !sutun || sutun.gizli) continue;
    const g = (secimler[grupAnahtari(t.id, b.etiket || '')] ??= {});
    if (g[sutun.ad] === undefined) g[sutun.ad] = v;
  }
  for (const [anahtar, ham] of basvurulu) {
    const b = /** @type {import('./tablo-secimi.mjs').Basvuru} */ (degerBasvurusu(ham));
    const c = basvuruyuCoz(s.tablolar, b, secimler, s.ortamId);
    if (!('deger' in c)) {
      hatalar.push({ alan: anahtar, mesaj: `"${anahtar}" alanının değeri (${String(ham).trim()}) test verisinden alınamadı: ${c.hata}.` });
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
  return { veri: sonuc, gizliDegerler, hatalar, cozulen };
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
