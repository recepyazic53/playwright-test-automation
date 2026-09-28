// scripts/platform/sonuclar/pdf-rapor/pdf.mjs için tip bildirimi.
export declare const PDF_ZAMAN_ASIMI_MS: number;
export declare function pdfTarayicisiniKapat(): Promise<void>;
export declare function htmldenPdf(html: string, s?: { altBilgi?: string; zamanAsimiMs?: number }): Promise<{ pdf: Buffer; engellenenIstek: number }>;
export declare function pdfSayfaSayisi(pdf: Buffer): number;
