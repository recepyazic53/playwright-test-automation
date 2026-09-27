// scripts/dogrulama/ekran-modeli-dogrulayici.mjs için tip bildirimi. Modelin ayrıntılı tipleri:
// tests/support/ekran-modeli.ts (EkranModeli, AltModel, Alan...).

export declare const DESTEKLENEN_SEMA_SURUMU: number;
export declare const SEMA_SURUMLERI: readonly number[];
export declare const AKSIYON_TURLERI: readonly ['tikla', 'bekle'];
export declare const SQL_BEKLENEN_TURLERI: readonly string[];
export declare const BASARI_GOSTERGESI_TURLERI: readonly ['metin', 'eleman', 'url'];
export declare const ALAN_TIPLERI: readonly [
  'secim', 'okluSecim', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'radyo', 'dosya',
  'kimlikProfili', 'buton', 'baglanti', 'cikti', 'tablo', 'diyalog', 'birlesim', 'altModelGecersizKilma'
];
export declare const YAPILANDIRMA_TURLERI: readonly ['senaryo', 'urun', 'turetilmis', 'sabit', 'cikti', 'aksiyon', 'dokunulmuyor', 'harici'];
export declare const DOLDURUCULAR: readonly [
  'secimGerekirse', 'secim', 'okluSecim', 'metinDoldur', 'tuslayarakYaz', 'tarihJs', 'telefonTuslama',
  'onayKutusuZorla', 'radyoZorla', 'dosyaYukle', 'tcSorgulu', 'musteriSorgula'
];
export declare const FORM_KONTROLLERI: readonly ['select', 'text', 'number', 'checkbox', 'radio', 'file', 'password', 'textarea'];
export declare const SECENEK_DURUMLARI: readonly ['tam', 'kismi', 'bilinmiyor', 'dinamik'];
export declare const KIRILGANLIK_DUZEYLERI: readonly ['dusuk', 'orta', 'yuksek'];

/** Alanın kayıt içindeki adı (eslesme.kayitAlani). */
export declare function kayitAlaniAdi(alan: unknown): unknown;
/** Modelin bağlam profili ekranı (baglam). */
export declare function baglamEkrani(model: unknown): unknown;

/** Ham alt modeli doğrular; hatalıysa tüm sorunları listeleyen Error fırlatır. Geçerliyse aynı nesneyi döner. */
export declare function altModeliDogrula(dosyaYolu: string, ham: unknown): Record<string, unknown>;

/** Ham ekran modelini doğrular; hatalıysa tüm sorunları listeleyen Error fırlatır. */
export declare function ekranModeliniDogrula(
  dosyaYolu: string,
  ham: unknown,
  altModelKaynagi: (dosyaAdi: string) => unknown
): { model: Record<string, unknown>; dosyaYolu: string; altModeller: Record<string, Record<string, unknown>> };

/** Doğrulama hatasının maddeleri (" - " satırları). */
export declare function dogrulamaMaddeleri(hata: unknown): string[];
