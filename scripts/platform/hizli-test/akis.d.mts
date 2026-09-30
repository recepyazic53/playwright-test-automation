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
export declare function basmaKarari(g: { izin: string; adaySayisi: number; kullaniciSecti?: boolean }): 'bas' | 'sor' | 'basma';
export declare function beklemeMetniMi(metin: unknown): boolean;
export declare function varsayilanEtiketler(gorulenler: Array<{ metin: string; tur: string; basis: number }>, sonBasis: number): Record<string, BitisEtiketi | null>;
export declare function sabitKisim(m: string): string;
export declare function bitisKosulu(g: { etiketler: Record<string, string | null>; adres?: string | null; olumsuz?: { mesaj: string } | null }): {
  bitti: string[]; hata: string[]; devam: string[]; adres: string | null; olumsuz: { mesaj: string } | null; hatalar: string[];
};
export declare function kayitEnvanteriKur(
  o: { adimlar: Array<{ alanlar: any[]; bas: { secici: string; metin: string | null } | null; okumalar?: Array<{ gorunen: string[]; secimler: Record<string, string> }> }>;
    degerler: Record<string, unknown>; yol: string; baslik: string; profil: string | null },
  bitis: { bitti: string[]; hata: string[] }
): import('../tarama/paket-olusturucu.mjs').KayitEnvanteri;
export declare function bitisiUygula<T extends Record<string, any>>(model: T, bitis: { bitti: string[]; devam: string[]; adres: string | null }): T;
export declare function senaryoAnahtarlari(model: Record<string, any>, alanlar: Array<{ anahtar: string; secici: string; cerceve?: string[] }>): Record<string, string>;
export declare function senaryoVerisiKur(
  model: Record<string, any>, anahtarlar: Record<string, string>, degerler: Record<string, unknown>,
  s?: { olumsuz?: { mesaj: string; adimId: string } | null; alanTurleri?: Record<string, string> }
): Record<string, unknown>;
export declare function adayMesajlari(
  eylem: { basari?: Array<{ metin: string | null }>; hata?: Array<{ metin: string | null }>; bekleme?: Array<{ metin: string | null }> } | null, cumleMesajlari?: string[]
): Array<{ metin: string; tur: 'basari' | 'hata' | 'bekleme'; kaynak: 'aday' | 'cumle' }>;
export declare function eksikAlanlar<T extends { anahtar: string; zorunlu: boolean; devreDisi?: boolean; saltOkunur?: boolean }>(alanlar: T[], degerler: Record<string, unknown>): T[];
