// projeler/galaksi/giris-tarifi.mjs için tip bildirimi.
import type { BaglamAdimi } from '../../scripts/platform/giris/tarif.mjs';

export declare const GALAKSI_BASARI_METNI_VARSAYILAN: string;
export declare const GALAKSI_HATALI_GIRIS_METNI: string;
export declare const GALAKSI_BAGLAM_ADIMLARI: readonly BaglamAdimi[];
/** Ham tarif (girisTarifiniDogrula ile normalleştirilir). */
export declare function galaksiGirisTarifi(g: {
  ortamAnahtari: string; basariMetni?: string | null; ikiAsamaliTur?: 'yok' | 'totp' | 'sms' | null;
}): Record<string, unknown>;
