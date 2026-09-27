// scripts/paket/mac-paketi.mjs için tip bildirimi.
import type { TarKaydi } from './arsiv.mjs';

export type MacMimarisi = 'arm64' | 'x64';
export declare const UYGULAMA_ADI: string;
export declare const APP_KLASORU: string;
export declare const BASLATICI_ADI: string;
export declare const MAC_VERI_KLASORU: string;
export declare const EN_ESKI_MACOS: string;
export declare const MIMARILER: Readonly<Record<MacMimarisi, { node: string; playwright: string; uname: string; ad: string }>>;
export declare function paketAdi(mimari: MacMimarisi): string;
export declare function baslaticiBetigi(mimari: MacMimarisi): string;
export declare function infoPlist(g: { mimari: MacMimarisi; surum: string }): string;
export declare function okubeni(g: { mimari: MacMimarisi; nodeSurumu: string }): string;
export interface MacPaketiOzeti {
  dosyaSayisi: number;
  klasorSayisi: number;
  baglantiSayisi: number;
  yurutulebilirSayisi: number;
  tarBayti: number;
  kayitlar: Map<string, TarKaydi>;
}
export declare function macPaketiYaz(g: {
  kok: string;
  hedef: string;
  mimari: MacMimarisi;
  nodeArsivi: Buffer;
  nodeSurumu: string;
  tarayicilar: Array<{ klasor: string; zip: Buffer; yurutulebilir?: string }>;
  zaman?: number;
  seviye?: number;
}): Promise<MacPaketiOzeti>;
