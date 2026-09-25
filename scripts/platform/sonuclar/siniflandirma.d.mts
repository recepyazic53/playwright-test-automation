// scripts/platform/sonuclar/siniflandirma.mjs için tip bildirimi.
export declare const KATEGORI: Readonly<Record<'popup' | 'zamanAsimi' | 'secici' | 'dogrulama' | 'diger', string>>;
export declare const KATEGORILER: ReadonlyArray<{ ad: string }>;
export declare const DURUM_ETIKETLERI: Readonly<Record<string, string>>;
export declare function kategoriBul(mesaj: string | null | undefined): string;
export declare function kalipCikar(mesajTam: string | null | undefined): string;
export declare function allureDurumuEsle(icerik: Record<string, unknown>): 'basarili' | 'basarisiz' | 'atlanan' | 'durduruldu';
export declare function playwrightDurumuEsle(durum: string, hataMesaji: string | null | undefined, beklenenDurum?: string): 'basarili' | 'basarisiz' | 'atlanan' | 'durduruldu';
export declare function kosuEtiketi(zamanDamgasiMs: number): string;
export declare function kacHesapla(s: { basarili: number; basarisiz: number; atlanan: number }): number;
export declare function ansiTemizle(metin: string): string;
export declare function adimGurultuMu(ad: string): boolean;
export declare function beklenenGorulenCikar(mesaj: string | null | undefined): { beklenen: string; gorulen: string } | null;
