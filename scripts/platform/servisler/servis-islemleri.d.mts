// scripts/platform/servisler/servis-islemleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { ServisKapsami } from './servis-deposu.mjs';
import type { KontrolSonucu } from './soap-istemcisi.mjs';
import type { ServisTaslagi } from './soapui-ice-aktarma.mjs';

export declare const ERISIM_GECERLILIK_MS: number;
export declare function ortamTuru(ortam: { ayarlar: Record<string, unknown> }): 'test' | 'canli';
export declare function adresBirlestir(taban: string, yol: string): string;
export declare function servisAdresi(ayarlar: { yol?: string; adresler?: Record<string, string>; tabanlar?: Record<string, string> }, ortam: { id: string; ad?: string; tabanUrl: string }): string;
export declare function ortamdaTanimli(ayarlar: { tabanlar?: Record<string, string> }, ortamId: string): boolean;
export declare function tarihKurallariniDogrula(kurallar: unknown): Record<string, string>;

export type ErisimSonucu =
  | { erisilebilir: true; erisimKimligi: string; adres: string; ortam: string; durumKodu: number; sureMs: number; operasyonlar: { ad: string; eylem?: string }[];
      semalar: Record<string, import('./servis-govdesi.mjs').OperasyonSemasi> }
  | { erisilebilir: false; adres: string; ortam: string; mesaj: string };
export declare function erisimKontrolu(vt: Veritabani, projeId: string, girdi: {
  ortamId: string; yol: string; adresler?: Record<string, string>; tabanlar?: Record<string, string>; tlsDogrulama?: boolean;
}): Promise<ErisimSonucu>;

export declare function servisiKaydet(vt: Veritabani, projeId: string, girdi: {
  id?: string; anahtar: string; ad: string; yol: string; soapSurumu?: '1.1' | '1.2'; adresler?: Record<string, string>; tabanlar?: Record<string, string>;
  secilenOperasyonlar?: string[];
  kimlikProfili?: string; tarihKurallari?: Record<string, string>; veriProfilleri?: Record<string, string>;
  yalnizTestOperasyonlari?: string[]; tlsDogrulama?: boolean; durum?: 'etkin' | 'devre_disi'; erisimKimligi?: string; yapan?: string;
  alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>;
  alanZorunluluklari?: Record<string, string[]>;
  ekAlanlar?: Record<string, Array<{ yol: string; tip?: string }>>;
  alanListeleri?: Record<string, Record<string, string>>; oturumAkisi?: string | null;
  alanBaglari?: Record<string, Record<string, { tablo: string; sutun: string; etiket?: string }>>;
}): string;
export declare function semaYenile(vt: Veritabani, projeId: string, girdi: { servisId: string; ortamId: string }): Promise<{
  adres: string; durumKodu: number; operasyonSayisi: number; alanliOperasyonlar: string[];
}>;

export interface ParametreEslemesi { turId: string; turAd: string; alan: string; alanEtiketi: string; rol: string; hassas: boolean }
export declare function parametreEslemeleri(vt: Veritabani, projeId: string): Map<string, ParametreEslemesi>;
export type ParametreKaynagi =
  | { tur: 'tarih'; kural: string }
  | { tur: 'kimlik'; profil?: string }
  | { tur: 'veri'; turId: string; turAd: string; alan: string; alanEtiketi: string; rol: string }
  | { tur: 'eslenmemis' };
export declare function servisParametreleri(vt: Veritabani, projeId: string, servisId: string): {
  parametreler: { ad: string; senaryoSayisi: number; kaynak: ParametreKaynagi }[];
  roller: { anahtar: string; turId: string; turAd: string; rol: string; profilId: string | null }[];
  kimlikProfili: string | null;
};

export declare const SERVIS_GIRISI_TURU: string;
export interface GirisTasimaPlani {
  tur: string; yeniTur: boolean; rol: string;
  eklenecekAlanlar: { alan: string; parametre: string; hassas: boolean }[];
  profiller: { ad: string; ortam: string | null; alanlar: string[] }[];
  servisler: string[];
}
export declare function girisProfiliniTestVerisineTasi(vt: Veritabani, projeId: string, girdi: { ad: string; onay?: boolean }):
  { onizleme: GirisTasimaPlani } | (GirisTasimaPlani & { tasindi: true; turId: string; profilId: string });
export declare function soapuiOnizle(vt: Veritabani, projeId: string, xml: string, secim?: { takim?: string; durum?: string }): {
  proje: string;
  durumlar?: { takim: string; durum: string; istekSayisi: number; arayuzler: string[]; kimlikParametreleri: string[]; veriParametreleri: string[]; uyariSayisi: number }[];
  durum?: { takim: string; ad: string; uyarilar: string[] };
  kimlikParametreleri?: string[]; tarihKurallari?: Record<string, string>;
  veriParametreleri?: { ad: string; esleme: { turAd: string; alan: string; rol: string } | null }[];
  servisler?: (Omit<ServisTaslagi, 'senaryolar'> & { senaryolar: (Omit<ServisTaslagi['senaryolar'][number], 'govde'> & { govdeUzunlugu: number })[] })[];
};
export declare function soapuiAktar(vt: Veritabani, projeId: string, girdi: {
  xml: string; takim: string; durum: string; servis: string; erisimKimligi?: string; kapsam?: ServisKapsami;
  girisEkle?: boolean; yapan?: string;
}): { servisId: string; yeniServis: boolean; eklenen: number; atlanan: string[]; baglananAlan: number; girisSatiriEklendi: boolean; eksikSatirlar: string[]; eslenmemisParametreler: string[] };
export declare function postmanOnizle(vt: Veritabani, projeId: string, girdi: { koleksiyon: string; ortam?: string }):
  ReturnType<typeof import('./postman-ice-aktarma.mjs').postmanOzeti> & {
    klasorler: Array<ReturnType<typeof import('./postman-ice-aktarma.mjs').postmanOzeti>['klasorler'][number] & { mevcutServis: { id: string; ad: string; tur: 'soap' | 'rest' } | null }>;
    varsayilanTabloAdi: string; tablolar: string[];
  };
export declare function postmanAktar(vt: Veritabani, projeId: string, girdi: {
  koleksiyon: string; ortam?: string; klasorler: string[]; tabloAdi?: string; gizliler?: string[]; sifreliKaydet?: string[];
  akisDegiskenleri?: string[]; degerOrtami?: string | null; tabanOrtami?: string | null; kapsam?: ServisKapsami; yapan?: string;
}): {
  servisler: Array<{ servisId: string; anahtar: string; ad: string; yeniServis: boolean; yol: string; eklenen: number; atlanan: string[] }>;
  tablo: { ad: string; yeni: boolean; sutunSayisi: number; sifreliYazilan: string[]; bosBirakilan: string[] } | null;
  akisDegerleri: string[];
};

export interface CalistirmaSonucu {
  kosuId: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; baslik: string;
  operasyon: string; ortam: string; ortamTuru: 'test' | 'canli'; adres?: string; metot?: string; kimlikProfili?: string; istek?: string;
  durumKodu?: number; yanitSureMs?: number; kontroller?: KontrolSonucu[]; ozet?: string; yanit?: string; hata?: string; durduruldu?: boolean;
  istekBasliklari?: Record<string, string>; okunanlar?: Record<string, string>; akis?: Record<string, unknown>;
  oturum?: { akis: string; durum: 'alindi' | 'onbellek' | 'yenilendi' };
}
export interface AkisOkumasi { ad: string; kaynak?: 'xml' | 'json' | 'baslik'; yol: string; gizli?: boolean }
export declare function okumaGizliMi(o: AkisOkumasi, ekler?: ReadonlyArray<string>): boolean;
export declare function servisSenaryosuCalistir(vt: Veritabani, projeId: string, girdi: {
  servisId: string; ortamId: string; tur: 'dene' | 'kosu'; senaryoId?: string;
  taslak?: { baslik?: string; kapsam?: ServisKapsami; icerik: unknown }; zamanAsimiMs?: number; simdi?: Date; sinyal?: AbortSignal;
  olay?: (adim: 'hazirlik' | 'gonderim' | 'yanit' | 'kontroller', durum: 'basladi' | 'tamam' | 'hata', bilgi?: Record<string, unknown>) => void;
  akisDegerleri?: Record<string, string>; ekGizliler?: string[]; okumalar?: AkisOkumasi[]; akis?: Record<string, unknown>;
  /** Yanıttan okunan AÇIK değerler ve maskelenen değerler: yalnız bellekte (akış motoru); kayda / dönüşe yazılmaz. */
  acikDegerler?: (d: { okunan: Record<string, string>; gizliler: string[] }) => void; oturumYenile?: boolean;
}): Promise<CalistirmaSonucu>;
export type OturumSaglayici = (vt: Veritabani, projeId: string, akisId: string, ortamId: string, s: { yenile?: boolean; sinyal?: AbortSignal }) =>
  Promise<{ degerler: Record<string, string>; gizliler: string[]; baslik: string; durum: 'alindi' | 'onbellek' }>;
export declare function oturumSaglayicisiAyarla(fn: OturumSaglayici | null): void;
export type AkisSenaryoKancasi = { kos: (vt: Veritabani, projeId: string, girdi: unknown) => Promise<unknown>; gecenler: (vt: Veritabani, projeId: string, servisId: string) => unknown[];
  atlamaNedeni: (vt: Veritabani, senaryo: unknown, ortam: unknown) => string };
export declare function akisSenaryoKancasiAyarla(k: AkisSenaryoKancasi | null): void;
export declare function akisSenaryoKancasiAl(): AkisSenaryoKancasi | null;
export declare function servisSenaryolariniKos(vt: Veritabani, projeId: string, girdi: {
  servisId: string; ortamId: string; senaryoIdleri?: string[]; zamanAsimiMs?: number;
}): Promise<{
  ortam: string; ortamTuru: 'test' | 'canli'; atlanan: number; atlamaNedeni?: string;
  sonuclar: { senaryoId: string; baslik: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; kosuId: string; ozet: string }[];
  ozet: { basarili: number; basarisiz: number; hata: number };
}>;

