// scripts/platform/arayuz/oturum-kontrolu.mjs için tip bildirimi.
type TarifAdresleri = { girisAdresi?: string; oturumKontrolAdresi?: string } | null | undefined;
export declare function ayniAdresMi(a: string, b: string, tabanUrl?: string): boolean;
export declare function yalinYol(yol: string | null | undefined): string;
export declare function oturumAdresiGirisleAyniMi(tarif: TarifAdresleri, tabanUrl?: string): boolean;
export declare function oturumAdresiOnerisi(tarif: TarifAdresleri, girisSonrasiYol: string | null | undefined, tabanUrl?: string): string | null;
export declare function basariAdresindenYol(g: { tur?: string; deger?: string } | null | undefined): string | null;
export declare function girisSonrasiSayfasiniHatirla(ortamId: string, yol: string | null | undefined): void;
export declare function hatirlananGirisSonrasiSayfasi(ortamId: string): string | null;
export declare const AYNI_ADRES_UYARISI: string;
