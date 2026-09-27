export declare const ACILIS_BICIMLERI: readonly ['pencere', 'tarayici'];
export declare const VARSAYILAN_ACILIS: 'tarayici';
export declare function acilisTercihiniOku(veriKoku: string): { bicim: 'pencere' | 'tarayici'; ortamdan: boolean };
export declare function acilisTercihiniKaydet(veriKoku: string, bicim: unknown): { bicim: 'pencere' | 'tarayici'; ortamdan: boolean };
