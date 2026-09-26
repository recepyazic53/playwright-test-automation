export type TanimTuru = 'liste' | 'mantiksal' | 'test_verisi' | 'serbest';
export type TanimDegeri = { deger: string; aciklama?: string; ekranDegeri?: string; ekranMetni?: string };
export type ParametreTanimi = {
  id: string; projeId?: string; ad: string; aciklama?: string; tur: TanimTuru; degerler?: TanimDegeri[];
  kaynak?: { turId: string; alan: string } | null; varsayilan?: string; elleYazilabilir?: boolean;
  kullanim?: 'servis' | 'ekran'; hedef?: { servisId?: string; parametre?: string; ekranId?: string; alan?: string; alanEtiketi?: string } | null; kosullar?: Array<{ alan: string; deger: string; etiket?: string }>;
};
export const TANIM_TURLERI: readonly ['liste', 'mantiksal', 'test_verisi', 'serbest'];
export const TANIM_TURU_ETIKETI: Record<TanimTuru, string>;
export function adlaBul(tanimlar: ParametreTanimi[], alanAdi: string): ParametreTanimi | null;
export function alanListesi(tanimlar: ParametreTanimi[], baglantilar: Record<string, string> | undefined, yol: string, alanAdi: string, parametreVar?: boolean): ParametreTanimi | null;
export function tanimDegerleri(tanim: ParametreTanimi, profiller?: Array<{ turId: string; ad: string; degerler: Record<string, unknown> }>): TanimDegeri[];
export function listedeMi(liste: TanimDegeri[], deger: string): boolean;
export function wsdlOnerisi(alan: { tip?: string; secenekler?: string[] }): { tur: TanimTuru; degerler: TanimDegeri[] } | null;
export function degerEtiketi(x: TanimDegeri): string;
export function ekranHedefiMi(t: ParametreTanimi, ekranId: string, alanId: string): boolean;
export function servisHedefiMi(t: ParametreTanimi, servisId: string | null, alanAdi: string): boolean;
export function eslesenListeler(listeler: ParametreTanimi[], hedefMi: (t: ParametreTanimi) => boolean, degerOku: (alan: string) => string | undefined): ParametreTanimi[];
export function birlesikDegerler(eslesen: ParametreTanimi[], profiller?: Array<{ turId: string; ad: string; degerler: Record<string, unknown> }>): TanimDegeri[];
