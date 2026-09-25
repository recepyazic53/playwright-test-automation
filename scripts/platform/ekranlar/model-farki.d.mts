// scripts/platform/ekranlar/model-farki.mjs için tip bildirimi.

export type BulguTuru =
  | 'yeniAlan' | 'kaldirilanAlan' | 'yeniSecenek' | 'kaldirilanSecenek' | 'etiketDegisikligi'
  | 'zorunlulukDegisikligi' | 'tipDegisikligi' | 'gorunurlukDegisikligi' | 'adimDegisikligi';
export type AdimAltTuru = 'yeniAdim' | 'kaldirilanAdim' | 'baslik' | 'gorunurluk' | 'sira' | 'yeniBolum' | 'kaldirilanBolum' | 'alanTasindi';

export interface Bulgu {
  /** İmzanın kısa özeti (kararlı). */
  id: string;
  /** tür + hedef + yeni değer (reddedilenler bununla hatırlanır). */
  imza: string;
  tur: BulguTuru;
  altTur?: AdimAltTuru;
  baslik: string;
  konum: string;
  alanId?: string;
  adimId?: string;
  bolumId?: string;
  /** gorunurlukDegisikligi: bağlam profili adı; null = görünürlük koşulu. */
  profil?: string | null;
  secenek?: { deger: string; metin: string };
  eski: unknown;
  yeni: unknown;
}

export interface EtkiKaydi {
  bulguId: string;
  tur: 'yok' | 'eksikDeger' | 'kullanilanSecenek' | 'kaldirilanAlanKullanimi' | 'tipKontrolu' | 'gorunmezProfil';
  mesaj: string;
  anahtar: string | null;
  atanabilir: boolean;
  alanTipi: string | null;
  secenekler: Array<{ deger: string; metin: string }> | null;
  kosullu: boolean;
  senaryolar: Array<{ id: string; baslik: string; deger?: string; mutlakaGorunmeli?: boolean }>;
}

export interface EtkiSenaryosu {
  id: string;
  baslik: string;
  veri: Record<string, unknown>;
  mutlakaGorunmeli?: string[];
  baglamProfili?: string | null;
}

type Model = Record<string, unknown>;

export declare const BULGU_TURLERI: readonly BulguTuru[];
export declare const BULGU_TUR_ETIKETLERI: Readonly<Record<BulguTuru, string>>;
export declare function kanonikJson(d: unknown): string;
export declare function gorunurlukMetni(g: unknown): string;
export declare function modelEnvanteri(model: unknown): {
  adimlar: Map<string, { adim: Model; sira: number }>;
  bolumler: Map<string, { bolum: Model; adimId: string; sira: number }>;
  alanlar: Map<string, { alan: Model; adimId: string; bolumId: string; ebeveynId: string | null; liste: string; sira: number }>;
};
export declare function modelFarki(eski: Model, yeni: Model): Bulgu[];
export declare function bulguOzeti(bulgular: ReadonlyArray<{ tur: string }>): { toplam: number; turler: Record<string, number> };
export declare function bulgulariUygula(eski: Model, yeni: Model, kabulIdleri: Iterable<string>): {
  model: Model; uygulananlar: string[]; atlananlar: Array<{ id: string; neden: string }>;
};
export declare function etkiHesapla(bulgular: ReadonlyArray<Bulgu>, eskiModel: Model, yeniModel: Model, senaryolar: ReadonlyArray<EtkiSenaryosu>): EtkiKaydi[];
