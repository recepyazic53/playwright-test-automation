// scripts/platform/sonuclar/html-rapor.mjs için tip bildirimi.
export type RaporGoruntusu = { ad: string; icerikTuru: string; base64: string };
export type RaporKontrolu = { ad: string; gecti: boolean; aciklama?: string };
export type RaporSenaryosu = {
  baslik: string; grup: string; durum: string; sureMs: number | null; kalinanAdim: string | null; hata: string | null;
  kontroller?: RaporKontrolu[]; goruntuler?: RaporGoruntusu[];
};
export type RaporVerisi = {
  tur: 'ekran' | 'servis' | 'akis'; baslik: string; proje: string; ortam: string | null; ortamAdresi: string | null;
  baslangic: string | null; bitis: string | null; sureMs: number | null; kosuDurumu: string | null;
  sayilar: { basarili: number; basarisiz: number; atlanan: number; durduruldu: number };
  senaryolar: RaporSenaryosu[]; atlananGoruntu?: number; olusturma?: string;
};
export type RaporSecenekleri = {
  goruntuler?: boolean; hatalar?: boolean; adres?: boolean; gizliDegerler?: ReadonlyArray<string>; ekAdlar?: ReadonlyArray<string>;
};
export declare const EN_COK_GORUNTU_BAYT: number;
export declare function kacis(v: unknown): string;
export declare function raporDosyaAdi(proje: string, ortam: string | null, tarih?: Date): string;
export declare function htmlRaporuUret(v: RaporVerisi, secenekler?: RaporSecenekleri): string;
export declare function htmlRaporuOlustur(vt: unknown, q: URLSearchParams, ortamlar: { medyaKlasoru: string }): Promise<{
  html: string; dosyaAdi: string; boyut: number; goruntu: { eklenen: number; atlanan: number; bayt: number };
}>;
export declare function onizlemeSakla(html: string): string;
export declare function onizlemeAl(id: string): string | null;
export declare function onizlemeleriTemizle(): void;
export declare const ONIZLEME_BASLIKLARI: Readonly<Record<string, string>>;
