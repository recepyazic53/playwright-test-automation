export declare const AYAR_DOSYASI_DEGISKENI: 'NOBETCI_AYAR_DOSYASI';
export declare const YENIDEN_BASLATMA_DEGISKENI: 'NOBETCI_YENIDEN_BASLATILABILIR';
export declare const YENIDEN_BASLAT_KODU: 75;
export declare class KlasorHatasi extends Error {
  kod: 'GECERSIZ' | 'SISTEM' | 'PAKET_ICI' | 'YAZILAMAZ' | 'DOLU' | 'NOBETCI_DEGIL' | 'AYNI' | 'DOGRULAMA' | 'SECIM_YOK';
  constructor(kod: KlasorHatasi['kod'], mesaj: string);
}
export declare function klasorYoluDogrula(yol: unknown, s?: { yasakKokler?: string[] }): { yol: string; uyarilar: string[] };
export declare function yazilabilirOlmali(klasor: string): void;
export declare function veriKlasoruDurumu(klasor: string): 'yok' | 'bos' | 'nobetci' | 'dolu';
export declare function ayarDosyasiYolu(): string | null;
export declare function veriAyariniOku(): { veriKoku?: string };
export declare function veriAyariniYaz(veriKoku: string | null): void;
export declare function veriyiKopyalaVeDogrula(eski: string, yeni: string): { dosya: number; bayt: number };
