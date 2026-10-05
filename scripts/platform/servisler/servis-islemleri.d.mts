// scripts/platform/servisler/servis-islemleri.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { ServisKapsami } from './servis-deposu.mjs';
import type { KontrolSonucu } from './soap-istemcisi.mjs';
import type { ServisTaslagi } from './soapui-ice-aktarma.mjs';
import type { EtkiGuncellemesi, TabloEtkisi } from '../tablolar/tablo-etkisi.mjs';

export declare const ERISIM_GECERLILIK_MS: number;
export declare function ortamTuru(ortam: { ayarlar: Record<string, unknown> }): 'test' | 'canli';
export declare function adresBirlestir(taban: string, yol: string): string;
export declare function servisAdresi(ayarlar: { yol?: string; adresler?: Record<string, string>; tabanlar?: Record<string, string>; tabanGrubu?: string }, ortam: { id: string; ad?: string; tabanUrl: string }): string;
export declare function tanimsizNedeni(ayarlar: { tabanGrubu?: string }, ortamAd?: string): string;
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
  /** Kurtarma kuralının tekrar gönderebileceği (tekrar denenebilir işaretli) operasyonlar. */
  tekrarDenenebilirOperasyonlar?: string[];
  alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>>;
  alanZorunluluklari?: Record<string, string[]>;
  ekAlanlar?: Record<string, Array<{ yol: string; tip?: string }>>;
  alanListeleri?: Record<string, Record<string, string>>; oturumAkisi?: string | null; tabanGrubu?: string | null;
  alanBaglari?: Record<string, Record<string, { tablo: string; sutun: string; etiket?: string }>>;
  tabanKararlari?: Record<string, import('./taban-adresleri.mjs').TabanKarari>;
}): string;
/** Yeni tablo / kural bağı kaydedilince aynı alanın eski varsayılanını siler (ayarlar değiştirilir); silinenleri döner. */
export declare function bagaGecenVarsayilanlariSil(
  onceki: { alanBaglari?: Record<string, Record<string, unknown>>; alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>> } | undefined,
  ayarlar: { alanBaglari?: Record<string, Record<string, unknown>>; alanVarsayilanlari?: Record<string, Record<string, import('./servis-govdesi.mjs').AlanDegeri>> }
): Array<{ operasyon: string; yol: string }>;
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
export declare function girisProfiliniTestVerisineTasi(vt: Veritabani, projeId: string, girdi: { ad: string; onay?: boolean; guncellenecekler?: unknown; beklenenImza?: string },
  secenekler?: { kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean }):
  { onizleme: GirisTasimaPlani & { etki: TabloEtkisi } } | { onayGerekli: true; farkli?: true; etki: TabloEtkisi }
  | (GirisTasimaPlani & { tasindi: true; turId: string; profilId: string; etki: TabloEtkisi; guncelleme?: EtkiGuncellemesi });
export { eskiParametreleriDonustur, soapuiAktar, soapuiOnizle } from './soapui-aktarimi.mjs';
export declare function postmanOnizle(vt: Veritabani, projeId: string, girdi: { koleksiyon: string; ortam?: string }):
  ReturnType<typeof import('./postman-ice-aktarma.mjs').postmanOzeti> & {
    klasorler: Array<ReturnType<typeof import('./postman-ice-aktarma.mjs').postmanOzeti>['klasorler'][number] & { mevcutServis: { id: string; ad: string; tur: 'soap' | 'rest' } | null }>;
    varsayilanTabloAdi: string; tablolar: string[];
  };
export interface PostmanAktarimGirdisi {
  koleksiyon: string; ortam?: string; klasorler: string[]; tabloAdi?: string; gizliler?: string[]; sifreliKaydet?: string[];
  akisDegiskenleri?: string[]; degerOrtami?: string | null; tabanOrtami?: string | null; kapsam?: ServisKapsami;
  mevcutDegerleriKoru?: boolean; guncellenecekler?: unknown; beklenenImza?: string; yapan?: string;
  tabanKararlari?: Record<string, import('./taban-adresleri.mjs').TabanKarari>;
}
export interface PostmanAktarimSonucu {
  etki: TabloEtkisi; guncelleme?: EtkiGuncellemesi;
  servisler: Array<{ servisId: string; anahtar: string; ad: string; yeniServis: boolean; yol: string; eklenen: number; atlanan: string[] }>;
  tablo: { ad: string; yeni: boolean; sutunSayisi: number; sifreliYazilan: string[]; bosBirakilan: string[] } | null;
  akisDegerleri: string[];
}
type KosuDenetimi = { kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean };
/** etki verilmezse eski davranış (yalnız aktarım); 'denetle' etkilenen varsa onay ister, 'uygula' seçili senaryoları da yazar. */
export declare function postmanAktar(vt: Veritabani, projeId: string, girdi: PostmanAktarimGirdisi & { etki?: undefined }, secenekler?: KosuDenetimi): PostmanAktarimSonucu;
/** Önizleme: aktarım denenir ve geri alınır, yalnız tablo değişikliği etkisi döner. */
export declare function postmanAktar(vt: Veritabani, projeId: string, girdi: PostmanAktarimGirdisi & { etki: 'onizle' }, secenekler?: KosuDenetimi): { onizleme: true; etki: TabloEtkisi };
export declare function postmanAktar(vt: Veritabani, projeId: string, girdi: PostmanAktarimGirdisi & { etki: unknown }, secenekler?: KosuDenetimi):
  { onayGerekli: true; farkli?: true; etki: TabloEtkisi } | (PostmanAktarimSonucu & { onayGerekli?: undefined });

export interface CalistirmaSonucu {
  kosuId: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; baslik: string;
  operasyon: string; ortam: string; ortamTuru: 'test' | 'canli'; adres?: string; metot?: string; kimlikProfili?: string; istek?: string;
  durumKodu?: number; yanitSureMs?: number; kontroller?: KontrolSonucu[]; ozet?: string; yanit?: string; hata?: string; durduruldu?: boolean;
  istekBasliklari?: Record<string, string>; okunanlar?: Record<string, string>; akis?: Record<string, unknown>;
  oturum?: { akis: string; durum: 'alindi' | 'onbellek' | 'yenilendi' };
  /** 401 / 403 sonrası token yenilenip bir kez tekrar denendiyse (ilk deneme ayrı kaydedilmez). */
  yetkiTekrari?: { ilkDurumKodu: number; not: string; ikinciDurumKodu?: number };
  /** "Yanıt sözleşmeye uymalı" açıkken doğrulama özeti. */
  sozlesme?: { durum: 'gecti' | 'kaldi' | 'yok'; toplam: number; uyumsuzluklar: Array<{ yol: string; mesaj: string }> };
  /** Çalışan kurtarma kuralının notu (kurtarıldı / yine başarısız oldu / tekrar denenmedi / denendi). */
  kurtarma?: { kuralId: string; kural: string; durum: 'kurtarildi' | 'kaldi' | 'tekrarlanmadi' | 'denendi'; deneme: number; not: string };
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
  /** İç kullanım: yenilemede isteğin kullandığı oturum sürümü. */ oturumSurumu?: number;
  /** İç kullanım: 401 / 403 sonrası tekrar. */
  yetkiTekrari?: { ilkDurumKodu: number; not: string };
  /** Akış motoru: token adımını yeniden çalıştırıp yeni değerleri verir (yalnız ayar açıksa). */
  yetkiYenile?: () => Promise<{ akisDegerleri: Record<string, string>; gizliler: string[] } | null>;
  /** Veri koşusu (tablodan çoklu satır): bu çalıştırmanın satırları; başlık "Senaryo [ad]". */
  veriKosusu?: { anahtar: string | null; ad: string | null; sabit?: Record<string, string>; veriler?: Record<string, Record<string, string | null>> };
  /** Başarısızları tekrar çalıştırmada önceki koşu ("Tekrar:" bağı). */
  tekrarKaynagi?: string;
  /** Koşu başlatılırken girilen uygulama sürümü (boşsa ortam ayarındaki; PDF rapor A4). */
  uygulamaSurumu?: string | null;
  /** İç kullanım: kurtarma kuralının tekrar denemesi. */
  kurtarma?: { kuralId: string; kural: string; neden: string; deneme: number };
  /** Akış motoru: kuralın "token'ı yenile" seçimi için token adımlarını yeniden çalıştırır. */
  tokenYenile?: () => Promise<{ akisDegerleri: Record<string, string>; gizliler: string[] } | null>;
}): Promise<CalistirmaSonucu>;
export declare function servisVeriKosulari(vt: Veritabani, projeId: string, s: { icerik: unknown }, ortamId: string, kip?: string | null): {
  kosular: Array<{ anahtar: string; ad: string; satirlar: Record<string, string> }>; hatalar: string[]; cokluGruplar: string[];
};
export declare function servisCalistirmalari(vt: Veritabani, projeId: string, s: { baslik: string; icerik: unknown }, ortamId: string): {
  hata: string | null; sinirAsildi: boolean;
  calistirmalar: Array<{ baslik: string; veriKosusu: { anahtar: string; ad: string; sabit: Record<string, string> } | null }>;
};
export type OturumSaglayici = (vt: Veritabani, projeId: string, akisId: string, ortamId: string, s: { yenile?: boolean; sinyal?: AbortSignal; gorulenSurum?: number }) =>
  Promise<{ degerler: Record<string, string>; gizliler: string[]; baslik: string; durum: 'alindi' | 'onbellek'; surum?: number }>;
export declare function oturumSaglayicisiAyarla(fn: OturumSaglayici | null): void;
export type AkisSenaryoKancasi = { kos: (vt: Veritabani, projeId: string, girdi: unknown) => Promise<unknown>; gecenler: (vt: Veritabani, projeId: string, servisId: string) => unknown[];
  atlamaNedeni: (vt: Veritabani, senaryo: unknown, ortam: unknown) => string };
export declare function akisSenaryoKancasiAyarla(k: AkisSenaryoKancasi | null): void;
export declare function akisSenaryoKancasiAl(): AkisSenaryoKancasi | null;
export declare function servisSenaryolariniKos(vt: Veritabani, projeId: string, girdi: {
  servisId: string; ortamId: string; senaryoIdleri?: string[]; zamanAsimiMs?: number;
}): Promise<{
  ortam: string; ortamTuru: 'test' | 'canli'; atlanan: number; atlamaNedeni?: string;
  sonuclar: { senaryoId: string; baslik: string; durum: 'basarili' | 'basarisiz' | 'hata'; sureMs: number; kosuId: string | null; ozet: string }[];
  ozet: { basarili: number; basarisiz: number; hata: number };
}>;

