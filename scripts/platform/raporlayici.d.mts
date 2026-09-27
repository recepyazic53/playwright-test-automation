// scripts/platform/raporlayici.mjs için tip bildirimi (yalnızca birim testlerinin kullandığı yardımcılar).
export declare function medyaTuru(ek: { name: string; contentType: string }): 'ekran_goruntusu' | 'video' | 'iz' | 'diger';
export declare function atlananAlanlariAyristir(metin: string): Array<{ alan: string; neden?: string }>;
export declare function videoSaklamaGunu(vt?: import('./veritabani/baglanti.mjs').Veritabani | null): number;
declare const PlatformRaporlayici: new (secenekler?: { projeId?: string; ortamId?: string; projeKoku?: string }) => object;
export default PlatformRaporlayici;
