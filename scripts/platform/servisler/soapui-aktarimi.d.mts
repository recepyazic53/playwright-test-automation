// scripts/platform/servisler/soapui-aktarimi.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { ServisKapsami } from './servis-deposu.mjs';
import type { ServisTaslagi } from './soapui-ice-aktarma.mjs';
import type { EtkiGuncellemesi, TabloEtkisi } from '../tablolar/tablo-etkisi.mjs';
import type { EtkiGuncellemesi, TabloEtkisi } from '../tablolar/tablo-etkisi.mjs';

export type OzellikHedefi = 'tablo' | 'bag' | 'kural' | 'birak';
export declare const OZELLIK_HEDEFLERI: readonly OzellikHedefi[];
export interface BagOnerisi { tablo: string; tabloAd: string; sutun: string; etiket?: string; bicim?: string; gizli: boolean; kaynak: 'servis' | 'baska-servis' | 'sutun' }
export interface OzellikPlani {
  ad: string; kaynak: string | null; gizli: boolean; tanimli: boolean; deger: string | null; tarih: string | null; mevcutKural: string | null;
  bag: BagOnerisi | null; eskiEsleme: { turAd: string; alan: string; rol: string } | null; senaryoSayisi: number; varsayilan: OzellikHedefi;
}
export interface AlanPlani { operasyon: string; yol: string; ozellik: string; mevcut: string | null }
export interface AktarimPlani { ozellikler: OzellikPlani[]; alanlar: AlanPlani[]; tabloAdi: string }

export declare function soapuiOnizle(vt: Veritabani, projeId: string, xml: string, secim?: { takim?: string; durum?: string }): {
  proje: string;
  durumlar?: { takim: string; durum: string; istekSayisi: number; arayuzler: string[]; kimlikParametreleri: string[]; veriParametreleri: string[]; uyariSayisi: number }[];
  durum?: { takim: string; ad: string; uyarilar: string[] };
  kimlikParametreleri?: string[]; tarihKurallari?: Record<string, string>;
  veriParametreleri?: { ad: string; esleme: { turAd: string; alan: string; rol: string } | null }[];
  tablolar?: string[];
  servisler?: (Omit<ServisTaslagi, 'senaryolar'> & {
    mevcutServis: { id: string; ad: string; tur: 'soap' | 'rest' } | null; plan: AktarimPlani;
    senaryolar: (Omit<ServisTaslagi['senaryolar'][number], 'govde'> & { govdeUzunlugu: number })[];
  })[];
};
export interface SoapuiAktarimGirdisi {
  xml: string; takim: string; durum: string; servis: string; erisimKimligi?: string; kapsam?: ServisKapsami;
  ozellikler?: Record<string, string>; tabloAdi?: string; degerOrtami?: string | null; gizliler?: string[]; sifreliKaydet?: string[]; baglar?: string[];
  girisEkle?: boolean; mevcutDegerleriKoru?: boolean; guncellenecekler?: unknown; beklenenImza?: string; yapan?: string;
}
export interface SoapuiAktarimSonucu {
  etki: TabloEtkisi; guncelleme?: EtkiGuncellemesi;
  servisId: string; yeniServis: boolean; eklenen: number; atlanan: string[]; baglananAlan: number; kurulanBaglar: string[]; eklenenKurallar: string[];
  tablo: { ad: string; yeni: boolean; sutunSayisi: number; sifreliYazilan: string[]; bosBirakilan: string[] } | null;
  girisSatiriEklendi: boolean; eksikSatirlar: string[]; eslenmemisParametreler: string[];
}
type KosuDenetimi = { kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean };
/** etki verilmezse eski davranış (yalnız aktarım); 'denetle' etkilenen varsa onay ister, 'uygula' seçili senaryoları da yazar. */
export declare function soapuiAktar(vt: Veritabani, projeId: string, girdi: SoapuiAktarimGirdisi & { etki?: undefined }, secenekler?: KosuDenetimi): SoapuiAktarimSonucu;
/** Önizleme: aktarım denenir ve geri alınır, yalnız tablo değişikliği etkisi döner. */
export declare function soapuiAktar(vt: Veritabani, projeId: string, girdi: SoapuiAktarimGirdisi & { etki: 'onizle' }, secenekler?: KosuDenetimi): { onizleme: true; etki: TabloEtkisi };
export declare function soapuiAktar(vt: Veritabani, projeId: string, girdi: SoapuiAktarimGirdisi & { etki: unknown }, secenekler?: KosuDenetimi):
  { onayGerekli: true; farkli?: true; etki: TabloEtkisi } | (SoapuiAktarimSonucu & { onayGerekli?: undefined });
export interface EskiDonusumPlani {
  parametreler: { ad: string; hedef: string; tablo: string; sutun: string; etiket: string; rol: string; satir: string | null; senaryoSayisi: number }[];
  senaryolar: { id: string; baslik: string; parametreler: string[] }[];
  baglar: { operasyon: string; yol: string; hedef: string }[];
  uyarilar: string[];
}
export declare function eskiParametreleriDonustur(vt: Veritabani, projeId: string, girdi: { servisId: string; onay?: boolean; yapan?: string }):
  { onizleme: EskiDonusumPlani } | (EskiDonusumPlani & { donusturuldu: true });
