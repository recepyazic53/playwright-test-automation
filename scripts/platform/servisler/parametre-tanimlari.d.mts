export type TanimTuru = 'liste' | 'mantiksal' | 'test_verisi' | 'serbest';
export type TanimDegeri = { deger: string; aciklama?: string };
export type ParametreTanimi = {
  id: string; projeId?: string; ad: string; aciklama?: string; tur: TanimTuru; degerler?: TanimDegeri[];
  kaynak?: { turId: string; alan: string } | null; varsayilan?: string; elleYazilabilir?: boolean;
};
export const TANIM_TURLERI: readonly ['liste', 'mantiksal', 'test_verisi', 'serbest'];
export const TANIM_TURU_ETIKETI: Record<TanimTuru, string>;
export function adlaBul(tanimlar: ParametreTanimi[], alanAdi: string): ParametreTanimi | null;
export function alanListesi(tanimlar: ParametreTanimi[], baglantilar: Record<string, string> | undefined, yol: string, alanAdi: string, parametreVar?: boolean): ParametreTanimi | null;
export function tanimDegerleri(tanim: ParametreTanimi, profiller?: Array<{ turId: string; ad: string; degerler: Record<string, unknown> }>): TanimDegeri[];
export function listedeMi(liste: TanimDegeri[], deger: string): boolean;
export function wsdlOnerisi(alan: { tip?: string; secenekler?: string[] }): { tur: TanimTuru; degerler: TanimDegeri[] } | null;
export function degerEtiketi(x: TanimDegeri): string;
