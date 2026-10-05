// tests/birim/buyuk-proje-fikstur.mjs için tip bildirimi.
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';

export interface BuyukProje { projeId: string; testId: string; canliId: string; senaryoIdleri: string[] }
export declare function buyukProjeUret(vt: Veritabani, secenekler?: { tohum?: number; olcek?: number }): Promise<BuyukProje>;
export declare function buyukProjeDosyasiOlustur(yol: string, parola: string, secenekler?: { kdf?: { N: number; r: number; p: number }; tohum?: number; olcek?: number }): Promise<BuyukProje>;
