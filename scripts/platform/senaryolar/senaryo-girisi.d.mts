// scripts/platform/senaryolar/senaryo-girisi.mjs için tip bildirimi.
export type SenaryoGirisKipi = 'ortam' | 'girissiz' | 'temiz';
export type SenaryoGirisi = { kip: SenaryoGirisKipi; profil: string | null };

export declare const GIRIS_KIPLERI: readonly SenaryoGirisKipi[];
export declare const GIRIS_KIP_ETIKETLERI: Readonly<Record<SenaryoGirisKipi, string>>;
export declare function senaryoGirisiniAyikla(ham: unknown): { giris: SenaryoGirisi | null; hatalar: string[] };
export declare function senaryoGirisi(icerik: unknown): SenaryoGirisi | null;
export declare function etkinSenaryoGirisi(giris: SenaryoGirisi | null | undefined, model: unknown): SenaryoGirisi;
