// scripts/platform/ekranlar/sayfa-paketi.mjs için tip bildirimi (biçim: docs/sayfa-paketi.md).

export declare const SAYFA_PAKETI_TURU: 'sayfa-paketi';
export declare const SAYFA_PAKETI_SURUMU: 1;
export declare const PAKET_BOYUT_SINIRI: number;
export declare const KANIT_EN_COK: number;
export declare const KANIT_BOYUT_SINIRI: number;
export declare const IKI_ASAMALI_TURLER: readonly ['yok', 'totp', 'sms', 'bilinmiyor'];
export declare const EKRAN_ANAHTARI_DESENI: RegExp;

export type PaketSorunu = { yer: string; mesaj: string };

/** Anahtar adı gizli bilgi taşıdığını söylüyor mu (parola, apiKey, totpGizli, guvenlikKodu...)? */
export declare function gizliAdMi(ad: string): boolean;
/** Metindeki gizli/kişisel veri kalıbının adı (kart numarası, T.C. kimlik numarası, IBAN, JWT...) ya da null. */
export declare function gizliKalipBul(metin: string): string | null;
/** Değerin içindeki gizli görünen değerler (yol + mesaj). */
export declare function gizliDegerleriBul(deger: unknown, yol?: string, atla?: (yol: string) => boolean): PaketSorunu[];
/** Kanıtın base64 verisini çözer (geçersizse null). */
export declare function kanitVerisiniCoz(veri: unknown): Buffer | null;

export declare function sayfaPaketiniDogrula(ham: unknown, secenekler?: {
  altModelKaynagi?: (dosyaAdi: string) => unknown;
  /** Projenin tabloları (ad + sütunlar): öneri değerlerindeki ${Tablo.Sütun} başvuruları bunlara (ve paketin tablolarına) göre denetlenir. */
  tablolar?: Array<{ ad: string; sutunlar: Array<{ ad: string; gizli?: boolean }> }>;
  /** Önerilerdeki geçmiş sabit tarih uyarısının "bugün"ü (verilmezse şimdi). */
  simdi?: Date;
}): {
  gecerli: boolean;
  hatalar: PaketSorunu[];
  uyarilar: PaketSorunu[];
  /** i. senaryo önerisinin tek doğrulayıcıdaki hataları. */
  senaryoSorunlari: Array<Array<{ alan: string; mesaj: string }>>;
  altModeller: Record<string, Record<string, unknown>>;
};
