// scripts/platform/senaryolar/akis-diyagrami.mjs için tip bildirimi (birim testleri import eder).

export declare const BASLANGIC_ADIMLARI: readonly string[];
export declare const BAGLAM_ADIMI_ONEKI: string;

export interface DiyagramAdimSonucu { durum: string; sureMs: number | null; hataMesaji: string | null }
/** zorunlu: akışta zorunlu (model: mutlakaGorunmeli) — koşuda görünmezse test başarısız. */
export interface DiyagramAlani { id: string; etiket: string; kosul: string | null; buSenaryoda: boolean | null; zorunlu: boolean }
export interface DiyagramAdimi {
  id: string;
  no: number;
  baslik: string;
  istegeBagli: boolean;
  kapsamEtiketi: string | null;
  kosulur: boolean | null;
  altAkis: string | null;
  alanlar: DiyagramAlani[];
  ilerleme: string[];
  aksiyonMetinleri: string[];
  gosterge: string | null;
  hedef: 'basari' | 'hata' | null;
  sonuc: DiyagramAdimSonucu | null;
}
export interface AkisDiyagrami {
  baslangic: { girisVar: boolean; metin: string; sonuc: DiyagramAdimSonucu | null };
  adimlar: DiyagramAdimi[];
  bitis: { tur: 'basari' | 'hata'; metin: string; durum: string | null };
  eslesmeyenler: string[];
}
export interface DiyagramSecenekleri {
  gorunurluk?: { adimlar?: Record<string, boolean | null>; alanlar?: Record<string, boolean | null> } | null;
  beklenen?: { hataAdimi?: string | null; mesaj?: string | null } | null;
  sonuc?: { durum: string; adimlar?: Array<{ ad: string; durum: string; sureMs?: number | null; hataMesaji?: string | null }> } | null;
}

export declare function ifadeMetni(ifade: unknown, model: object): string;
export declare function gorunurlukMetni(gorunurluk: unknown, model: object): string | null;
export declare function akisDiyagrami(model: object, s?: DiyagramSecenekleri): AkisDiyagrami;
