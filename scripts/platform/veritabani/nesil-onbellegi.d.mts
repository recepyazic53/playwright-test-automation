// scripts/platform/veritabani/nesil-onbellegi.mjs için tip bildirimi.
export declare function onbellekte<T>(vt: { nesil: number }, anahtar: string, hesapla: () => T, secenekler?: { tablolar?: readonly string[] }): T;
export declare function kasaOnbellegi(vt: object, ad: string): Map<string, string>;
export declare function onbellegiBosalt(vt: object): void;
/** kasa.mjs: önbelleğin kullanılabileceği bağlantılar (arayüz kilitliyken kullanılmaz). */
export declare function onbellekIzniniAyarla(fn: (vt: object) => boolean): void;
/** Yalnız testler: bağlantının önbelleklerindeki kayıt sayısı. */
export declare function onbellekBoyutu(vt: object): number;
