// scripts/platform/akislar/uctan-uca-cikti.mjs için tip bildirimi.
export declare const AKIS_ADIMI_DEGISKENI: 'NOBETCI_AKIS_ADIMI';
export declare const AKIS_CIKTI_DOSYASI_DEGISKENI: 'NOBETCI_AKIS_CIKTI_DOSYASI';
export declare const AKIS_CIKTI_ANAHTARI_DEGISKENI: 'NOBETCI_AKIS_CIKTI_ANAHTARI';
export declare const AKIS_ORTAM_ONEKI: 'NOBETCI_AKIS_';
export type AkisCiktisi = { okunanlar: Record<string, string>; gizliOkunanlar: string[] };
export declare function ciktiAnahtariUret(): string;
export declare function akisCiktisiYaz(yol: string, anahtar: string, veri: AkisCiktisi): void;
export declare function akisCiktisiOku(yol: string, anahtar: string): AkisCiktisi | null;
export declare function akisCiktisiniSil(yol: string): void;
export declare function akisOrtamDegiskenleri(ek: unknown): Record<string, string>;
