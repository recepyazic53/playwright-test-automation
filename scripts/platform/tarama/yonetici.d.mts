// scripts/platform/tarama/yonetici.mjs için tip bildirimi.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const IS_SAKLAMA_MS: number;
export declare const TASARIM_SAKLAMA_KATI: number;
export declare class TaramaHatasi extends Error {
  readonly kod: string;
  readonly durum: number;
  readonly ek: Record<string, unknown>;
  constructor(kod: string, mesaj: string, durum?: number, ek?: Record<string, unknown>);
}

export type IsDurumu = 'suruyor' | 'tamam' | 'hata' | 'iptal';
export type IsGorunumu = {
  id: string;
  durum: IsDurumu;
  mod: 'yeni' | 'analiz';
  /** "Ne oluşturulsun?" (yalnız yeni): 'ortakAkis' ise paket ortak akış paketine çevrilir. */
  olusturulacak: 'ekran' | 'ortakAkis';
  projeId: string;
  ekran: { id: string | null; ad: string; anahtar: string };
  ortam: { id: string; ad: string };
  hedefYol: string;
  kesif: boolean;
  adimlar: Array<{ anahtar: string; etiket: string; durum: string; mesaj: string | null }>;
  profiller: Array<{ ad: string; durum: string; adim: string | null; alanSayisi: number | null; mesaj: string | null }>;
  engellenenSayisi: number;
  engellenenler: Array<{ yontem: string | null; adres: string | null; asama: string | null; neden: string | null; zaman: string }>;
  olaylar: Array<{ zaman: string; mesaj: string }>;
  hata: { kod: string; mesaj: string } | null;
  kodIstegi: { mesaj: string; kalanSn: number } | null;
  baslangic: string;
  bitis: string | null;
  paketHazir: boolean;
  ozet: import('./paket-olusturucu.mjs').PaketOzeti | null;
  uyarilar: Array<{ yer: string; mesaj: string }>;
  /** Akış kaydı: diyagramı kurulacak (topla → tasarla). */
  tasarim: boolean;
  /** Giriş kaydı: taslak işaretlenip tarif önizlenecek. */
  girisTaslagi: boolean;
  /** Ortak akışın kaydı: başlangıç ekranı (kayıt bu ekranın adresinde başladı; sonuç ortak akışın tek akışına yazılır). */
  ortakAkis: OrtakAkisKaydi | null;
  /** Giriş denemesi sonucu ("Girişi dene"; ekran görüntüsü JPEG base64, yalnız bellekte). */
  deneme: { basarili: boolean; yol: string; hata: { kod: string; mesaj: string } | null; goruntu: string | null; gunluk: string[] } | null;
  /**
   * Giriş (tarif yoksa / girişsiz işte null): kip (Ayarlar > Koşu > Tarama ve akış kaydı), gerçekleşen yöntem (giriş bitince),
   * saklanan oturum bulundu mu (yalnız saklananOturum kipinde), oturum dosyası güncellendi mi.
   */
  giris: { kip: 'bastan' | 'saklananOturum'; yontem: 'saklananOturum' | 'bastanGiris' | null; oturumSaklandi: boolean | null; oturumGuncellendi: boolean } | null;
  /** Öğe seçme ("Sayfada seç"): seçilen öğeler (sürerken canlı, bitince doğrulanmış) ve seçilebilecek türler. */
  ogeler?: Array<Partial<import('./oge-isaretleri.mjs').SecilenOge>>;
  ogeTurleri?: import('./oge-isaretleri.mjs').SecilenOgeTuru[];
  /** Tarama: "Düğmeyi ve sonucu işaretle" uygulandıysa özeti. */
  isaretOzeti?: import('./oge-isaretleri.mjs').IsaretOzeti;
};

/** Hızlı test süre durumu: kalanMs = önce dolacak sınıra (boşta kalma ya da üst sınır); uyari: "Süreyi uzat" gösterilir. */
export type HizliSureGorunumu = {
  suruyor: boolean; bostaMs: number; ustMs: number; kalanMs: number; ustKalanMs: number; sebep: 'bosta' | 'ust'; uyari: boolean; uzatilabilir: boolean;
};

export type OrtakAkisKaydi ={ baslangicEkrani: { id: string; ad: string; urlYolu: string } };

export type TaramaYoneticisi = {
  isler: Map<string, Record<string, unknown>>;
  secenekler(vt: Veritabani, projeId: string, ekranId: string | null): Record<string, unknown>;
  baslat(vt: Veritabani, govde: Record<string, unknown>, s: { sunucuAdresi: string }): { isId: string };
  durum(id: string): IsGorunumu;
  paket(id: string): {
    paket: Record<string, unknown>; mod: 'yeni' | 'analiz'; olusturulacak: 'ekran' | 'ortakAkis'; ekran: IsGorunumu['ekran']; ozet: IsGorunumu['ozet'];
    /** Eylem ve doğrulama keşfi (basmadan; öneri). Tarama dışı işlerde / eski sonuçta null. */
    eylemAdaylari: import('./eylem-kesfi.mjs').EylemAdaylari | null;
  };
  akis(id: string): {
    bloklar: import('./akis-tasarimi.mjs').AkisBlogu[]; palet: import('./akis-tasarimi.mjs').AkisPaleti; ekran: IsGorunumu['ekran']; mod: 'yeni' | 'analiz'; olusturulacak: 'ekran' | 'ortakAkis'; paketHazir: boolean;
    projeId: string; akisaYazildi: { akisId: string; surum: number } | null; girissiz: boolean; ortakAkis: OrtakAkisKaydi | null;
  };
  akisaYaz(vt: Veritabani, id: string, govde: Record<string, unknown>): { etki: { yeni: boolean; senaryolar: Array<{ id: string; baslik: string }>; ekranlar?: Array<Record<string, unknown>> }; akisId: string } | { akisId: string; surum: number };
  akisKaydet(id: string, govde: Record<string, unknown>): { kaydedildi: boolean; palet: import('./akis-tasarimi.mjs').AkisPaleti } | { ozet: IsGorunumu['ozet'] };
  girisTaslagi(id: string): {
    taslak: import('../giris/giris-kaydi.mjs').GirisTaslagi; ortam: IsGorunumu['ortam']; projeId: string; hedefYol: string; oneriler: Array<string | null>;
  };
  girisTarifiOnizle(vt: Veritabani, id: string, isaretler: unknown, secimler?: unknown): import('../giris/giris-kaydi.mjs').KayittanTarifSonucu & {
    dogrulamaHatalari: string[]; ortam: IsGorunumu['ortam'];
  };
  /** "Düğmeyi ve sonucu işaretle": keşif bulguları, işaretlenenler, öğe seçme için ortam / sayfa. */
  isaretler(id: string): {
    bulgular: import('./oge-isaretleri.mjs').KesifBulgusu[]; kosuVar: boolean; ogeler: import('./oge-isaretleri.mjs').SecilenOge[]; reddedilenler: string[];
    ortam: IsGorunumu['ortam'] & { canli?: boolean }; hedefYol: string; girissiz: boolean; ekran: IsGorunumu['ekran']; projeId: string; mod: 'yeni' | 'analiz';
    baglamProfili: string | null; ozet: IsGorunumu['ozet'];
    /** Eylem ve doğrulama keşfi (seçenek olarak sunulur); isaretlendi: işaretler daha önce uygulandı (geri dönüş). */
    eylemAdaylari: import('./eylem-kesfi.mjs').EylemAdaylari | null; isaretlendi: boolean;
    /** Geri dönüş: "Sayfada seç" listesi ve adayların seçimi (tür → aday anahtarı; '' = Hiçbiri); işaretlenmediyse null. */
    sayfadaSecilenler: import('./oge-isaretleri.mjs').SecilenOge[] | null; eylemSecimi: Record<'gonderim' | 'basari' | 'hata', string> | null;
  };
  /** İşaretlenenleri ve reddedilen bulguları taramanın paketine uygular (paket doğrulanır). */
  isaretle(id: string, govde: Record<string, unknown>): { isaretOzeti: import('./oge-isaretleri.mjs').IsaretOzeti; ozet: IsGorunumu['ozet'] };
  aktif(): { id: string; ekran: IsGorunumu['ekran']; projeId: string } | null;
  iptal(id: string): { iptal: true };
  kodGonder(id: string, kod: unknown): { iletildi: true };
  /** Hızlı test (kip 'hizliTest'): alt sürece komut, alt sürecin uzun yoklaması, komut sonucu, sonuç dinleyicisi. */
  komutGonder(id: string, komut: import('./protokol.mjs').HizliKomut): { gonderildi: true };
  komutAl(id: string, token: string): Promise<{ komut: Record<string, unknown> | null }>;
  hizliOlayAl(id: string, token: string, olay: Record<string, unknown>): Record<string, unknown>;
  /** Dinleyici alt sürecin olaylarını (HizliOlay) ve iş bitince { olay: 'isBitti', durum, hata } alır. */
  hizliDinle(id: string, fn: (olay: Record<string, any>) => void, mesgulMu?: () => boolean): void;
  /** Kullanıcı işlemi / "Süreyi uzat": boşta kalma sayacı sıfırlanır (üst sınır değişmez). */
  hizliUzat(id: string): HizliSureGorunumu | null;
  /** Hızlı test işinin süre durumu (iş yoksa / hızlı test değilse null). */
  hizliSure(id: string): HizliSureGorunumu | null;
  girdiVer(id: string, token: string): unknown;
  olayAl(id: string, token: string, olay: Record<string, unknown>): Record<string, unknown>;
  oturumAl(id: string, token: string, durum: unknown): { kaydedildi: boolean };
  sonucAl(id: string, token: string, sonuc: Record<string, unknown>): Record<string, unknown>;
  kapat(): void;
};

export declare function taramaYoneticisiOlustur(secenekler: {
  projeKoku: string; playwrightCli?: string; zamanAsimiMs?: number; saklamaMs?: number; ortamDegiskenleri?: NodeJS.ProcessEnv; hataAyiklama?: boolean;
}): TaramaYoneticisi;

export type TaramaIstekBaglami = {
  /** Oturum token'ı (POST gövdesindeki "token" ile karşılaştırılır). */
  token: string;
  /** Başlık/sorgu token'ı geçerli mi (GET uçları). */
  disTokenGecerli: boolean;
  jsonGonder: (res: ServerResponse, durum: number, govde: unknown) => void;
  jsonGovde: (sinir?: number) => Promise<Record<string, unknown> | null>;
  acikVeritabani: () => Promise<Veritabani>;
  projeKoku: string;
  /** Testler için: varsayılan yerine bu yönetici kullanılır. */
  yonetici?: TaramaYoneticisi;
};

export declare function taramaIsteginiIsle(req: IncomingMessage, res: ServerResponse, b: TaramaIstekBaglami): Promise<boolean>;
export declare function taramalariKapat(): void;
/** Varsayılan (sunucudaki tek) tarama yöneticisi; hızlı test uçları da bunu kullanır. */
export declare function taramaYoneticisiAl(projeKoku: string): TaramaYoneticisi;
export declare function taramaSuruyorMu(): boolean;
