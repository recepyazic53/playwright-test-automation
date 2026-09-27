// scripts/platform/sonuclar/yakalanan-mesajlar.mjs için tip bildirimi.
export type YakalamaKaynagi = 'diyalog' | 'hata-gostergesi' | 'konsol' | 'sayfa-hatasi' | 'ag';
export type YakalananMesaj = { kaynak: string; metin: string; adim: string | null; sayi: number; ilk: string; son: string; beklenen: boolean };
export declare const YAKALAMA_KAYNAKLARI: readonly YakalamaKaynagi[];
export declare const YAKALAMA_KAYNAK_ETIKETLERI: Readonly<Record<YakalamaKaynagi, string>>;
export declare const EN_COK_YAKALANAN_MESAJ: number;
export declare const YAKALANAN_METIN_SINIRI: number;
export declare function yakalananMetniMaskele(metin: unknown, s?: { gizliDegerler?: ReadonlyArray<string>; ekAdlar?: ReadonlyArray<string> }): string;
export declare function mesajToplayici(s?: { enCok?: number; simdi?: () => string }): {
  ekle(k: { kaynak: YakalamaKaynagi; metin: string; adim?: string | null; beklenen?: boolean }): boolean;
  liste(): YakalananMesaj[];
  readonly atlanan: number;
};
export declare function yakalananMesajlariAyristir(girdi: unknown): YakalananMesaj[];
export declare function agMesajiMetni(yontem: string, adres: string, durum: number): string;
