// scripts/platform/arayuz/secenek-tablo-notu.mjs için tip bildirimi.
export type SecenekTabloOnerisi = { tabloAd: string; sutun: string; islem: 'ekle' | 'cikar'; uygulanabilir: boolean; nedenKodu?: string; neden?: string };
export type SecenekTabloDurumu = {
  uygulandi?: boolean; karar?: string | null; secili?: boolean; sonuc?: { durum: string; satir?: number } | null; kayitli?: boolean; sayi?: number
};
export declare function secenekTabloNotu(o: SecenekTabloOnerisi, d?: SecenekTabloDurumu): string;
