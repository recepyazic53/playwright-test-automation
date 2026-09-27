// scripts/platform/tablolar/ekran-donusumu.mjs için tip bildirimi (ekran senaryolarında düz değer → ${Tablo.Sütun}).
import type { Veritabani } from '../veritabani/baglanti.mjs';

export interface DonusumSatiri {
  /** "<senaryoId>|<alan anahtarı>" (onaylı çağrıda secimler bununla verilir). */
  anahtar: string;
  ekranId: string; ekranAdi: string; senaryoId: string; senaryo: string;
  /** Senaryo verisindeki alan anahtarı. */
  alan: string; alanEtiketi: string; tip: string;
  /** Eski değer (gizli sütun / hassas alanda "•••"; ortamlarda farklıysa "Ortam: değer · …"). */
  eskiDeger: string;
  /** Yazılacak başvuru (${Tablo.Sütun} / ${Tablo[etiket].Sütun}); tablo / sütun yoksa null. */
  yeniDeger: string | null;
  gizli: boolean;
  durum: 'cevrilecek' | 'atlandi' | 'secilmedi';
  neden?: string;
  /** Yazılacak satır seçimi (gerekiyorsa): "Tablo [etiket]: Sütun = değer, …". */
  satirSecimi?: string;
  ortamlar: string[];
}
export interface DonusumPlani {
  satirlar: DonusumSatiri[];
  ozet: { senaryo: number; alan: number; cevrilecek: number; atlanan: number; secilmeyen: number; yazilacakSenaryo: number; nedenler: Record<string, number> };
  geriAlma: string;
}
export declare const NEDENLER: Readonly<Record<'tablodaYok' | 'ortamaGore' | 'ayniSatir' | 'mevcutBozulur' | 'tipUygunDegil' | 'tabloYok' | 'sutunYok' | 'gizliSecim' | 'karisik' | 'kosuyor' | 'dogrulama', string>>;
export declare function ekranTabloDonusumu(
  vt: Veritabani, projeId: string,
  girdi: { ekranId?: string | null; onay?: boolean; secimler?: unknown; yapan?: string },
  secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean }
): { onizleme: DonusumPlani } | (DonusumPlani & { uygulandi: true; guncellenenSenaryo: number; cevrilenAlan: number });
