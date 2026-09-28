// scripts/platform/servisler/eszamanli.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';

export declare const EN_COK_ESZAMANLI: number;
/** Ayarlar > Koşu > "Aynı anda en çok N servis senaryosu" (1–10; okunamazsa 1). */
export declare function servisEszamanliOku(vt: Veritabani): number;
/** En çok n eşzamanlı işle yürütür; öğeler sırayla başlatılır, sonuçlar öğe sırasıyla döner. */
export declare function sinirliKos<T, S>(ogeler: ReadonlyArray<T>, n: number, is: (oge: T, sira: number) => Promise<S>, devam?: () => boolean): Promise<Array<S | undefined>>;
