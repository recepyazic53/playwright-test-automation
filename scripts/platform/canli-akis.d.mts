import type { IncomingMessage, ServerResponse } from 'node:http';

export const CANLI_DUYURU_DEGISKENI: 'NOBETCI_YAYIN_DUYURU';
export const GORUNUR_KOSU_DEGISKENI: 'NOBETCI_GORUNUR';
export const GORUNMEZ_KOSU_METNI: string;
export function duyuruOku(yol: string | null | undefined): { port: number; anahtar: string } | null;
export function canliAkisiVekille(req: IncomingMessage, res: ServerResponse, s: { duyuruYolu: () => string | null; suruyorMu: () => boolean; en?: number | null }): void;
export function canliKanalaIstek(duyuruYolu: string | null | undefined, yol: string): Promise<{ durum: number; govde: Record<string, unknown> } | null>;
