// scripts/platform/kurulum-kimligi.mjs için tip bildirimi.
export type SaglikYaniti = { nobetci: boolean; kurulum: string | null };
export type SunucuYeri = {
  /** mevcut: kendi sunucusu çalışıyor; yeni: bu boş portta başlatılmalı; yok: denenen portların hiçbiri uygun değil. */
  tur: 'mevcut' | 'yeni' | 'yok';
  port: number | null;
  /** Atlanan, başka kurulumun Nöbetçi'sinin çalıştığı portlar. */
  baskaKurulumlar: number[];
  /** Atlanan, Nöbetçi olmayan bir uygulamanın tuttuğu portlar. */
  baskaUygulamalar: number[];
  /** Portta kimlik bildirmeyen (eski sürüm) bir Nöbetçi var. */
  kurulumBilinmiyor: boolean;
};
export declare const EN_COK_PORT_DENEMESI: number;
export declare function kurulumKimligi(veriKokuYolu: string): string;
export declare function saglikOku(port: number, zamanAsimiMs?: number): Promise<SaglikYaniti | null>;
export declare function portBosMu(port: number): Promise<boolean>;
export declare function sunucuYeriniBul(s: {
  port: number; kimlik: string; enCok?: number;
  saglik?: (port: number) => Promise<SaglikYaniti | null>; bosMu?: (port: number) => Promise<boolean>;
}): Promise<SunucuYeri>;
export declare function sunucuYeriBildirimi(yer: SunucuYeri, istenenPort: number): string | null;
