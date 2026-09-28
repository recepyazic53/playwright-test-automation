// scripts/paket/acilis-denemesi.mjs için tip bildirimi.
export declare function bosPort(): Promise<number>;
export declare function arayuzAdresleri(sunucuMetni: string): string[];
export declare function acilisDenemesi(g: { hedef: string; zamanAsimiMs?: number; log?: (m: string) => void }):
  Promise<{ basarili: boolean; port: number; dosyaSayisi: number; hatalar: string[] }>;
