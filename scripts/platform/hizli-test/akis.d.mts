// scripts/platform/hizli-test/akis.mjs için tip bildirimi (hızlı test saf kuralları).
export type HizliIzin = 'evet' | 'sor' | 'hayir';
export type BitisEtiketi = 'bitti' | 'devam' | 'hata';
export declare const IZINLER: readonly HizliIzin[];
export declare const IZIN_ADLARI: Readonly<Record<HizliIzin, string>>;
export declare const ETIKETLER: readonly BitisEtiketi[];
export declare const ETIKET_ADLARI: Readonly<Record<BitisEtiketi, string>>;
export declare const BITIS_BEKLEME_SN: number;
export declare const ETIKET_EN_COK: number;
export declare function canliOnayMetni(izin: string): string;
export declare function cumleyiOku(cumle: unknown): { mesajlar: string[]; dugmeler: string[] };
export declare function tekAday<T extends { secici: string; metin: string | null }>(adaylar: T[], cumleDugmeleri?: string[]): T | null;
export declare function basmaKarari(g: { izin: string; adaySayisi: number; kullaniciSecti?: boolean; sormadanBasma?: boolean }): 'bas' | 'sor' | 'basma';
export declare function beklemeMetniMi(metin: unknown): boolean;
export declare function degiskenMetinMi(metin: unknown): boolean;
export declare function varsayilanEtiketler(gorulenler: Array<{ metin: string; tur: string; basis: number; sonuc?: boolean; onceGorundu?: boolean }>, sonBasis: number): Record<string, BitisEtiketi | null>;
export declare function bitisUyarilari(g: { izin: string; gonderimVar: boolean; gorulenler: Array<{ metin: string; onceGorundu?: boolean }>; etiketler: Record<string, string | null> }): string[];
export declare function sabitKisim(m: string): string;
/** Bitti öğesi: seçicisi görünür olunca bitti (açılan pencere / kutu / düğme; modelde başarı göstergesi tur 'eleman'). */
export type BitisOgesi = { secici: string; metin: string | null; cerceve?: string[] };
export declare function bitisKosulu(g: {
  etiketler: Record<string, string | null>; adres?: string | null; olumsuz?: { mesaj: string } | null;
  ogeler?: Array<{ secici: string; metin?: string | null; cerceve?: string[] }>;
}): {
  bitti: string[]; hata: string[]; devam: string[]; adres: string | null; olumsuz: { mesaj: string } | null; ogeler: BitisOgesi[]; hatalar: string[];
};
export declare function kayitEnvanteriKur(
  o: { adimlar: Array<{ alanlar: any[]; bas: { secici: string; metin: string | null; diyalog?: 'kabul' | 'iptal'; cerceve?: string[] } | null; okumalar?: Array<{ gorunen: string[]; secimler: Record<string, string> }>; kosullar?: Record<string, { secim: string; degerler: string[] }> }>;
    degerler: Record<string, unknown>; yol: string; baslik: string; profil: string | null },
  bitis: { bitti: string[]; hata: string[] }
): import('../tarama/paket-olusturucu.mjs').KayitEnvanteri;
export declare function bitisiUygula<T extends Record<string, any>>(model: T, bitis: { bitti: string[]; devam: string[]; adres: string | null; ogeler?: Array<{ secici: string; cerceve?: string[] }> }): T;
export declare function ornekDegeri(model: Record<string, any>, alan: { anahtar: string; secici: string; cerceve?: string[]; adaySeciciler?: string[]; radyolar?: Array<{ deger: unknown; metin?: unknown }>; secenekler?: Array<{ deger: unknown; metin?: unknown }> }, veri: Record<string, unknown>): { deger: string | boolean; kaynak: 'elle' | 'tablo' } | null;
export declare function senaryoAnahtarlari(model: Record<string, any>, alanlar: Array<{ anahtar: string; secici: string; cerceve?: string[] }>): Record<string, string>;
export declare function senaryoVerisiKur(
  model: Record<string, any>, anahtarlar: Record<string, string>, degerler: Record<string, unknown>,
  s?: { olumsuz?: { mesaj: string; adimId: string } | null; alanTurleri?: Record<string, string> }
): Record<string, unknown>;
export declare function secimDegerleriniUydur(model: Record<string, any> | null | undefined, veri: Record<string, unknown>): Record<string, unknown>;
export declare function adayMesajlari(
  eylem: { basari?: Array<{ metin: string | null }>; hata?: Array<{ metin: string | null }>; bekleme?: Array<{ metin: string | null }> } | null, cumleMesajlari?: string[]
): Array<{ metin: string; tur: 'basari' | 'hata' | 'bekleme'; kaynak: 'aday' | 'cumle' }>;
export declare function eksikAlanlar<T extends { anahtar: string; zorunlu: boolean; devreDisi?: boolean; saltOkunur?: boolean }>(alanlar: T[], degerler: Record<string, unknown>): T[];
export declare function sayfaUyarisi(hedefYol: string, anlikYol: string): string | null;
/** Hızlı testin önerdiği senaryo başlığı: ekran adı zaten "hızlı test" içeriyorsa ek konmaz. */
export declare function hizliSenaryoBasligi(ekranAdi: string): string;
