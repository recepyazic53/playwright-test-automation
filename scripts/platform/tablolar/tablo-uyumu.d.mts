export interface UyumSecenegi { deger: string; metin?: string; ekranDegeri?: string; ekranMetni?: string }
export interface TabloUyumu { duzey: 'guclu' | 'zayif'; eslesmeyen: string[]; eslesen: number; toplam: number; sayfadakiler: string[]; metin: string }
export declare function uyumNormal(x: unknown): string;
export declare function tabloSecenekUyumu(
  alan: { etiket: string; secenekler?: UyumSecenegi[] | null; seceneklerDurumu?: string | null },
  sutun: { gizli?: boolean; karsiliklar?: Record<string, { sayfa?: string }> | null } | null | undefined,
  degerler: unknown[]
): TabloUyumu | null;
