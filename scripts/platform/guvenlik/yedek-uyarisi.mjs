// YEDEK YÜKLEME UYARISI — yedekten yükleme izinleri (Ayarlar > İzinler) yedektekiyle değiştirdiyse, kullanıcı Nöbetçi'yi
// açtığında (ana sayfa: ilk açılış / yeniden yükleme) BİR KEZ uyarı penceresi gösterilir: hangi izinler açık, hangileri kapalı;
// ortamların riskli seçimleri. Yedekteki izinler ve riskli seçimleri OLDUĞU GİBİ geçerlidir (değiştirilmez); pencere yalnız
// bilgi verir.
// Bayrak veritabanının meta tablosundadır (sunucuda; yedeğe girmez, tarayıcı depolamasında değil): başka tarayıcıdan açan da
// görür; pencere "Tamam" / "İzinlere git" ile kapatılınca bayrak silinir ve kimse için bir daha çıkmaz.
// Tetikleyen yüklemeler (izinleri değiştiren): tam yükleme (yedek.mjs > yedekIceAktar; ice-aktarma.mjs > boş veritabanına
// "tümü" = tam yükleme) ve seçmeli içe aktarmada Ayarlar'daki "izinler" kaydının eklendiği / üzerine yazıldığı uygulama.
// Seçmeli içe aktarma "izinler" kaydını yazmıyorsa izinler değişmez; pencere tetiklenmez.
// NOT: import.meta KULLANILMAZ.
import { ortamlariListele, projeleriListele } from '../veritabani/depo.mjs';
import { izinleriOku } from './izinler.mjs';
import { IZIN_TANIMLARI } from './izin-tanimlari.mjs';
import { riskliSecimi } from './ortam-riski.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const YEDEK_UYARISI_META = 'yedek_izin_uyarisi';

/**
 * Bayrağı kurar (yükleme izinleri yedektekiyle değiştirdikten sonra). Önceki kapatılmamış bayrağın yerine geçer.
 * @param {Veritabani} vt @param {{ tur: 'tamYukleme' | 'secmeli'; simdi?: Date }} s
 */
export function yedekUyarisiniKur(vt, s) {
  vt.metaYaz(YEDEK_UYARISI_META, JSON.stringify({ zaman: (s.simdi ?? new Date()).toISOString(), tur: s.tur }));
}

/**
 * Gösterilecek uyarı (bayrak yoksa null). Kasa açık olmalıdır (izinler ve ortam adları kasada şifreli).
 * @param {Veritabani} vt
 * @returns {null | { zaman: string | null; tur: string | null; izinler: Array<{ anahtar: string; etiket: string; acik: boolean }>;
 *   ortamlar: Array<{ projeId: string; proje: string; id: string; ad: string; riskli: boolean | null }> }}
 */
export function yedekUyarisi(vt) {
  const ham = vt.metaOku(YEDEK_UYARISI_META);
  if (!ham) return null;
  /** @type {{ zaman?: unknown; tur?: unknown }} */
  let b = {};
  try { b = JSON.parse(ham) ?? {}; } catch { b = {}; }
  const durum = izinleriOku(vt);
  const projeler = projeleriListele(vt);
  return {
    zaman: typeof b.zaman === 'string' ? b.zaman : null,
    tur: typeof b.tur === 'string' ? b.tur : null,
    izinler: IZIN_TANIMLARI.map((t) => ({ anahtar: t.anahtar, etiket: t.etiket, acik: durum[t.anahtar] === true })),
    ortamlar: projeler.flatMap((p) => ortamlariListele(vt, p.id).map((o) => ({ projeId: p.id, proje: p.ad, id: o.id, ad: o.ad, riskli: riskliSecimi(o) })))
  };
}

/** Pencere kapatıldı: bayrak silinir (herkes için; bir daha gösterilmez). @param {Veritabani} vt @returns {boolean} bayrak vardı mı */
export function yedekUyarisiniKapat(vt) {
  const vardi = Boolean(vt.metaOku(YEDEK_UYARISI_META));
  if (vardi) vt.calistir('DELETE FROM meta WHERE anahtar = ?', [YEDEK_UYARISI_META]);
  return vardi;
}
