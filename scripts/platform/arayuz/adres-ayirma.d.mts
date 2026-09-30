// scripts/platform/arayuz/adres-ayirma.mjs için tip bildirimi.
export type AdresAyirma = { tur: 'yol' | 'ayni' | 'baska' | 'hata'; yol: string; koken: string | null; adres: string; mesaj?: string };
export declare function adresiAyir(girdi: unknown, tabanUrl: string | null | undefined): AdresAyirma;
export declare function kokenKayitliMi(koken: string, tabanAdresleri: string[] | null | undefined): boolean;
