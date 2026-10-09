// scripts/platform/tablolar/secenek-tablosu.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
export type TabloOnerisi = { bulguId: string; tabloId: string; tabloAd: string; sutun: string; islem: 'ekle' | 'cikar'; deger: string; metin: string; uygulanabilir: boolean; neden?: string };
export declare function tabloOnerisi(baglar: Record<string, any>, tablolar: any[], bulgu: any): TabloOnerisi | null;
export declare function secenekleriTabloyaYaz(vt: Veritabani, projeId: string, tablolar: any[], oneriler: TabloOnerisi[]): { eklenen: number; silinen: number };
