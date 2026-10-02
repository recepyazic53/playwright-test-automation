export type DuzeltHedefi = 'bitis' | 'karar' | 'tablo';
/** Kullanıcıya gösterilen kayıt sorunu: anlaşılır ileti, teknik ayrıntı ("Ayrıntı" altında) ve "Düzelt" hedefi. */
export type KayitSorunu = { mesaj: string; ayrinti: string | null; duzelt: DuzeltHedefi | null };

/** Ekran paketi doğrulama hatalarını ({ yer, mesaj, ayrinti? }) kayıt sorunlarına çevirir (konum adları paketin modelinden). */
export declare function kayitSorunlari(
  hatalar: ReadonlyArray<{ yer?: unknown; mesaj?: unknown; ayrinti?: unknown }>,
  paket: unknown
): KayitSorunu[];
