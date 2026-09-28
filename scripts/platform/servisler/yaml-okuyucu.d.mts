// scripts/platform/servisler/yaml-okuyucu.mjs için tip bildirimi.
export declare class YamlHatasi extends Error { constructor(mesaj: string, satir?: number); }
export declare function yamlOku(metin: string): unknown;
