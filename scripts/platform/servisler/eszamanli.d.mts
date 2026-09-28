// scripts/platform/servisler/eszamanli.mjs için tip bildirimi.
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { EtkinKosuHizi } from '../ayarlar/kosu-hizi.mjs';

/** Etkin koşu hızı (genel ayar + ortamın "Koşu hızı" ezmesi). */
export declare function etkinKosuHiziOku(vt: Veritabani, ortamId?: string | null): EtkinKosuHizi;
/** "Aynı anda en çok N servis senaryosu" (1–10; ortamda ezildiyse o). */
export declare function servisEszamanliOku(vt: Veritabani, ortamId?: string | null): number;
/** "İstekler arası bekleme (ms)" (ortamda ezildiyse o). */
export declare function servisIstekBeklemeOku(vt: Veritabani, ortamId?: string | null): number;
/** ms kadar bekler; sinyal kesilirse hemen döner. */
export declare function kesilebilirBekle(ms: number, sinyal?: AbortSignal): Promise<void>;
/** En çok n eşzamanlı işle yürütür; öğeler sırayla başlatılır, sonuçlar öğe sırasıyla döner. */
export declare function sinirliKos<T, S>(ogeler: ReadonlyArray<T>, n: number, is: (oge: T, sira: number) => Promise<S>, devam?: () => boolean): Promise<Array<S | undefined>>;
