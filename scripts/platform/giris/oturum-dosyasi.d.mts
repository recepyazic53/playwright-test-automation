// scripts/platform/giris/oturum-dosyasi.mjs için tip bildirimi.

/** Playwright storageState (çerezler + kökenlerin yerel depolaması). */
export type OturumDurumu = { cookies: Array<Record<string, unknown>>; origins: Array<Record<string, unknown>> };

export declare const OTURUM_UZANTISI: string;
export declare function oturumKlasoru(veritabaniYolu: string): string;
export declare function oturumDosyaAdi(ortamId: string, profilKimligi: string | null | undefined): string;
export declare function oturumDosyaYolu(veritabaniYolu: string, ortamId: string, profilKimligi: string | null | undefined): string;
export declare function oturumAnahtariTuret(kasaAnahtari: Buffer | null | undefined): Buffer | null;
export declare function oturumDurumuMu(d: unknown): boolean;
export declare function oturumDosyasiniOku(dosya: string, anahtar: Buffer | null): OturumDurumu | undefined;
export declare function oturumDosyasinaYaz(dosya: string, anahtar: Buffer | null, durum: unknown): boolean;
export declare function oturumuKokenlereSinirla(durum: unknown, kokenler: readonly string[]): OturumDurumu | null;
