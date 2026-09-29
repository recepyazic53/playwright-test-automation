// scripts/platform/servisler/servis-oneri-baglami.mjs için tip bildirimi (birim testleri import eder).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { Servis } from './servis-deposu.mjs';
import type { ServisOneriGecmisi, ServisOneriMetodu, ServisOneriSonucu } from './servis-onerileri.mjs';

export declare const SERVIS_HATA_GUNU: number;
export declare const SERVIS_UYARI_GUNU: number;

export declare function servisOneriMetotlari(servis: Servis, tablolar: unknown[], ekAdlar: ReadonlyArray<string>): ServisOneriMetodu[];
export declare function kayittanMesaj(sonuc: Record<string, any>, durum: string, tur: 'soap' | 'rest'): { metin: string; hataTuru: 'fault' | 'http' | 'yanit' } | null;
export declare function servisOneriGecmisi(vt: Veritabani, projeId: string, servisId: string, ortamId: string, simdi: Date): Required<ServisOneriGecmisi>;
export declare function servisOnerileriniUret(
  vt: Veritabani, projeId: string,
  g: { servisId: string; ortamId?: string | null; operasyon?: string | null; kombinasyonAlanlari?: string[] | null; reddedilenleriGoster?: boolean; ustSinir?: number },
  simdi?: Date
): ServisOneriSonucu & { ortamId: string; metotlar: Array<{ ad: string; senaryoSayisi: number; alanSayisi: number }>; semaNotu?: boolean };
