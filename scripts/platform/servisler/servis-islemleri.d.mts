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
  kimlikProfili?: { ad: string; kaydet?: boolean }; yapan?: string;
}): { servisId: string; yeniServis: boolean; eklenen: number; atlanan: string[]; kimlikKaydedildi: boolean; eslenmemisParametreler: string[] };

export interface CalistirmaSonucu {
  kosuId: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; baslik: string;
  operasyon: string; ortam: string; ortamTuru: 'test' | 'canli'; adres?: string; kimlikProfili?: string; istek?: string;
  durumKodu?: number; yanitSureMs?: number; kontroller?: KontrolSonucu[]; ozet?: string; yanit?: string; hata?: string;
}
export declare function servisSenaryosuCalistir(vt: Veritabani, projeId: string, girdi: {
  servisId: string; ortamId: string; tur: 'dene' | 'kosu'; senaryoId?: string;
  taslak?: { baslik?: string; kapsam?: ServisKapsami; icerik: unknown }; zamanAsimiMs?: number; simdi?: Date;
}): Promise<CalistirmaSonucu>;
export declare function servisSenaryolariniKos(vt: Veritabani, projeId: string, girdi: {
  servisId: string; ortamId: string; senaryoIdleri?: string[]; zamanAsimiMs?: number;
}): Promise<{
  ortam: string; ortamTuru: 'test' | 'canli'; atlanan: number; atlamaNedeni?: string;
  sonuclar: { senaryoId: string; baslik: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; kosuId: string; ozet: string }[];
  ozet: { basarili: number; basarisiz: number; hata: number };
}>;
