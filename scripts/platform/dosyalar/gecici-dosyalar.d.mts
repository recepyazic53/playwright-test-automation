// scripts/platform/dosyalar/gecici-dosyalar.mjs için tip bildirimi.
export declare const DOSYA_KLASORU_DEGISKENI: 'NOBETCI_DOSYA_KLASORU';
export declare function geciciDosyaKoku(veritabaniYolu: string, taban?: string): string;
export declare function kosuKlasoruOlustur(kok: string, onEk: string, sahipPid?: number): string;
export declare function sahipYaz(klasor: string, pid: number): void;
export declare function kosuKlasoruGecerliMi(klasor: string, kok: string): boolean;
export declare function kosuKlasoruDogrula(klasor: string, veritabaniYolu: string): boolean;
export declare function kosuKlasorunuSil(klasor: string, kok: string): boolean;
export declare function artikKlasorleriTemizle(kok: string): number;
