// SERVİS ANALİZİ — SÜREKLİ ÖĞRENME (sunucu). Servis koşusu bittikten ve servis senaryosu kaydedildikten SONRA, arka planda
// (setImmediate) çevrimdışı gözlem kaydedilir (kosu-ogrenmesi.mjs). Koşuyu yavaşlatmaz; hatası koşuyu etkilemez (yakalanır).
// Hiçbir servise istek atılmaz. Gözlemler servis ayarlarında (kosuOgrenmesi; metot başına en çok EN_COK_GOZLEM) iç güncellemeyle
// saklanır (değişiklik geçmişine yazılmaz). Ayarlar > Koşu > "Başarılı koşulardaki yeni değerleri tablolara kendiliğinden ekle"
// açıksa yalnız GÜÇLÜ "değer ekle" önerileri uygulanır ve servisin öğrenme geçmişine "kendiliğinden eklendi" yazılır; zorunluluk ve
// bağ önerileri hiçbir zaman kendiliğinden uygulanmaz.
import { servisAyarlariniIcGuncelle, servisGetir, servisSenaryosuGetir } from './servis-deposu.mjs';
import { gozlemEkle, gozlemOlustur, kosuOnerileri } from './kosu-ogrenmesi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { tabloDegerleriniYaz } from './servis-ornekleri.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { alanSatirlari } from './servis-govdesi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').Servis} Servis */

const EN_COK_GECMIS = 100;

/**
 * İşi koşudan sonra, arka planda çalıştırır; hata yutulur (koşuyu etkilemez). Test için senkron hali: ogrenmeyiCalistir.
 * @param {() => void} is
 */
export function ogrenmeyiZamanla(is) {
  setImmediate(() => { ogrenmeyiCalistir(is); });
}
/** @param {() => void} is @returns {boolean} başarılı mı */
export function ogrenmeyiCalistir(is) {
  try { is(); return true; } catch (e) {
    if (process.env.NOBETCI_OGRENME_GUNLUK === '1') console.warn('Koşu öğrenmesi atlandı:', /** @type {Error} */ (e).message);
    return false;
  }
}

/** Metodun şeması (kök / üst alanlar ornekCoz için). @param {Servis} s @param {string} op */
const semaBilgisi = (s, op) => {
  const sm = s.ayarlar.operasyonSemalari?.[op];
  return sm ? { kok: sm.kok, ustAlanlar: sm.alanlar.map((a) => a.ad) } : {};
};

/**
 * Bir metodun öğrenme önerileri (mevcut ayarlarla süzülmüş).
 * @param {Servis} s @param {string} op @param {ReturnType<typeof tablolariListele>} tablolar
 */
export function metotOgrenmeOnerileri(s, op, tablolar) {
  const a = s.ayarlar;
  const sm = a.operasyonSemalari?.[op] ?? null;
  const liste = a.alanZorunluluklari?.[op];
  const zorunlu = Array.isArray(liste) ? liste : sm ? alanSatirlari(sm.alanlar).filter((x) => !x.grup && x.alan.zorunlu).map((x) => x.yol) : [];
  return kosuOnerileri({
    metot: op, sema: sm, ekler: a.ekAlanlar?.[op] ?? [], gozlemler: a.kosuOgrenmesi?.[op] ?? [], tablolar,
    mevcut: { zorunlu, baglar: a.alanBaglari?.[op] ?? {}, varsayilanlar: a.alanVarsayilanlari?.[op] ?? {}, kararlar: a.analizKararlari?.[op] ?? {} }
  });
}

/** Servisin uygulanabilir (not olmayan) öğrenme önerisi sayısı (servis sayfası rozeti). @param {Veritabani} vt @param {Servis} s @param {ReturnType<typeof tablolariListele>} [tablolar] */
export function ogrenmeOneriSayisi(vt, s, tablolar) {
  const ops = Object.keys(s.ayarlar.kosuOgrenmesi ?? {});
  if (!ops.length) return 0;
  const t = tablolar ?? tablolariListele(vt, s.projeId);
  return ops.reduce((n, op) => n + metotOgrenmeOnerileri(s, op, t).filter((o) => o.guc !== 'not').length, 0);
}

/**
 * Gözlemi kaydeder; kendiliğinden ekleme açıksa güçlü "değer ekle" önerilerini uygular.
 * @param {Veritabani} vt @param {string} servisId @param {string} op @param {import('./kosu-ogrenmesi.d.mts').Gozlem} gozlem
 */
function gozlemiKaydet(vt, servisId, op, gozlem) {
  vt.islem(() => {
    servisAyarlariniIcGuncelle(vt, servisId, (a) => ({ ...a, kosuOgrenmesi: { ...(a.kosuOgrenmesi ?? {}), [op]: gozlemEkle([...(a.kosuOgrenmesi?.[op] ?? [])], gozlem) } }));
    if (gozlem.durum !== 'basarili' || kosuAyarlariniOku(vt).ogrenmeOtomatikEkle !== true) return;
    const s = /** @type {Servis} */ (servisGetir(vt, servisId));
    const uygulanacak = metotOgrenmeOnerileri(s, op, tablolariListele(vt, s.projeId)).filter((o) => o.tur === 'tabloyaDeger' && o.guc === 'guclu');
    if (!uygulanacak.length) return;
    tabloDegerleriniYaz(vt, s.projeId, uygulanacak.map((o) => o.deger));
    const zaman = new Date().toISOString();
    servisAyarlariniIcGuncelle(vt, servisId, (a) => ({
      ...a,
      analizKararlari: { ...(a.analizKararlari ?? {}), [op]: { ...(a.analizKararlari?.[op] ?? {}), ...Object.fromEntries(uygulanacak.map((o) => [o.anahtar, /** @type {'uygulandi'} */ ('uygulandi')])) } },
      kosuOgrenmesiGecmisi: [...(a.kosuOgrenmesiGecmisi ?? []), ...uygulanacak.map((o) => ({ zaman, operasyon: op, metin: `Kendiliğinden eklendi: ${o.baslik.replace(/ eklensin mi\?$/, '')} (${o.kanit})` }))].slice(-EN_COK_GECMIS)
    }));
  });
}

/**
 * Koşudan öğren (servisSenaryosuCalistir kaydettikten sonra çağırır). İstek gövdesi yoksa (istek gönderilemedi) ya da durdurulduysa
 * gözlem yok. @param {Veritabani} vt
 * @param {{ servisId: string; senaryoId: string | null; baslik: string; icerik: { operasyon?: string; govde?: string }; kosuId: string; durum: string;
 *   sonuc: { istek?: unknown; hata?: unknown; yanit?: unknown; durduruldu?: unknown } }} g
 */
export function kosudanOgren(vt, g) {
  if (typeof g.sonuc.istek !== 'string' || !g.sonuc.istek.trim() || g.sonuc.durduruldu || !g.icerik.operasyon || typeof g.icerik.govde !== 'string') return;
  const s = servisGetir(vt, g.servisId);
  if (!s) return;
  const op = g.icerik.operasyon;
  const gozlem = gozlemOlustur({
    istek: g.sonuc.istek, sablon: g.icerik.govde, tur: s.tur === 'rest' ? 'rest' : 'soap', ...semaBilgisi(s, op),
    kosuDurumu: g.durum === 'basarili' ? 'basarili' : 'basarisiz', sonuc: g.sonuc, senaryo: g.baslik, senaryoId: g.senaryoId, kosuId: g.kosuId,
    zaman: new Date().toISOString(), kaynak: 'kosu', oncekiler: s.ayarlar.kosuOgrenmesi?.[op] ?? []
  });
  if (gozlem) gozlemiKaydet(vt, s.id, op, gozlem);
}

/** Kaydedilen senaryodan öğren (elle yazılmış değerler; sonucu bilinmiyor → yalnız tablo eşleşmesine kanıt değil, gözlem olarak durur). @param {Veritabani} vt @param {string} senaryoId */
export function senaryodanOgren(vt, senaryoId) {
  const x = servisSenaryosuGetir(vt, senaryoId);
  if (!x || x.icerik?.tur === 'akis' || typeof x.icerik?.govde !== 'string' || !x.icerik.operasyon) return;
  const s = servisGetir(vt, x.servisId);
  if (!s) return;
  const op = String(x.icerik.operasyon);
  const gozlem = gozlemOlustur({ istek: x.icerik.govde, sablon: x.icerik.govde, tur: s.tur === 'rest' ? 'rest' : 'soap', ...semaBilgisi(s, op),
    kosuDurumu: 'bilinmiyor', senaryo: x.baslik, senaryoId: x.id, zaman: new Date().toISOString(), kaynak: 'senaryo' });
  if (gozlem) gozlemiKaydet(vt, s.id, op, gozlem);
}
