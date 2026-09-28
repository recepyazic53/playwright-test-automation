// scripts/platform/ayarlar/kosu-hizi.mjs için tip bildirimi.
export type KosuHiziAnahtari = 'servisEszamanli' | 'servisIstekBeklemeMs' | 'ekranEszamanli' | 'ekranBeklemeMs';
export declare const KOSU_HIZI_ALANLARI: ReadonlyArray<{ anahtar: KosuHiziAnahtari; enAz: number; enCok: number; varsayilan: number; etiket: string }>;
export declare function kosuHiziDogrula(girdi: unknown): Partial<Record<KosuHiziAnahtari, number>>;
export interface EtkinKosuHizi { degerler: Record<KosuHiziAnahtari, number>; kaynaklar: Record<KosuHiziAnahtari, 'ortam' | 'genel'>; ortamAd: string | null }
export declare function etkinKosuHizi(genel: Record<string, unknown> | null | undefined, ortam: { ad?: string; kosuHizi?: unknown; ayarlar?: { kosuHizi?: unknown } } | null | undefined): EtkinKosuHizi;
export declare function kosuHiziOzeti(e: EtkinKosuHizi, tur: 'servis' | 'ekran'): string;
