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
  for (const [id, a] of modelAlanlari(model)) {
    const s = nesneMi(a.eslesme) ? a.eslesme.senaryo : undefined;
    const anahtar = typeof s === 'string' ? s : Array.isArray(s) && s.length === 1 && typeof s[0] === 'string' ? s[0] : null;
    if (!anahtar) continue;
    alanAnahtarlari[id] = anahtar;
    const havuz = [...(Array.isArray(a.secenekler) ? a.secenekler : []),
      ...(nesneMi(a.bagimlilik) && nesneMi(a.bagimlilik.secenekHaritasi) ? Object.values(a.bagimlilik.secenekHaritasi).flat() : [])];
    const degerler = havuz.filter(nesneMi).map((x) => String(x.senaryoDegeri !== undefined ? x.senaryoDegeri : x.deger));
    if (degerler.length) secenekDegerleri[anahtar] = [...new Set(degerler)];
  }
  return { alanAnahtarlari, secenekDegerleri };
}

/**
 * Senaryo verisindeki tablo başvurularını çözer (yeni veri döner; girdi değişmez).
 * @param {Record<string, unknown>} veri senaryonun bu ortamdaki verisi (çözülmüş)
 * @param {{ tablolar: Tablo[]; baglar?: EkranBaglari; alanAnahtarlari?: Record<string, string>; secenekDegerleri?: Record<string, string[]>;
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
    const yazilacak = s.secenekDegerleri?.[anahtar]?.includes(c.deger) ? c.deger : sayfaDegeri(c.sutun, c.deger);
    sonuc[anahtar] = yazilacak;
    cozulen++;
    if (c.sutun.gizli) gizliDegerler.push(...new Set([c.deger, yazilacak]));
  }
  return { veri: sonuc, gizliDegerler, hatalar, cozulen };
}

/** Senaryo verisinde tablo başvurusu var mı? @param {unknown} veri */
export const tabloBasvurusuVarMi = (veri) => nesneMi(veri) && Object.values(/** @type {Record<string, unknown>} */ (veri)).some((v) => degerBasvurusu(v));
