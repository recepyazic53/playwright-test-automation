// scripts/dogrulama/ekran-modeli-dogrulayici.mjs için tip bildirimi. Modelin ayrıntılı tipleri:
// tests/support/ekran-modeli.ts (EkranModeli, AltModel, Alan...).

export declare const DESTEKLENEN_SEMA_SURUMU: number;
export declare const SEMA_SURUMLERI: readonly number[];
export declare const AKSIYON_TURLERI: readonly ['tikla', 'bekle', 'ekranaDon', 'git'];
/** Tıklama koşulları (gorunurse: öğe kısa sürede görünmezse tıklama atlanır). */
export declare const AKSIYON_KOSULLARI: readonly ['gorunurse'];
/** "gorunurse" tıklamasında varsayılan kısa bekleme (sn). */
export declare const GORUNURSE_BEKLEME_SN: number;
/** Bitiş koşulunda (kosu.bitisKosulu.devam) en çok "Devam" metni. */
export declare const DEVAM_METNI_EN_COK: number;
export declare const SQL_BEKLENEN_TURLERI: readonly string[];
export declare const DOSYA_BEKLENTI_TURLERI: readonly string[];
export declare const BASARI_GOSTERGESI_TURLERI: readonly ['metin', 'eleman', 'url'];
export declare const ALAN_TIPLERI: readonly [
  'secim', 'okluSecim', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'radyo', 'dosya',
  'kimlikProfili', 'buton', 'baglanti', 'cikti', 'tablo', 'diyalog', 'birlesim', 'altModelGecersizKilma'
];
export declare const YAPILANDIRMA_TURLERI: readonly ['senaryo', 'urun', 'turetilmis', 'sabit', 'cikti', 'aksiyon', 'dokunulmuyor', 'harici'];
export declare const DOLDURUCULAR: readonly [
  'secimGerekirse', 'secim', 'okluSecim', 'metinDoldur', 'tuslayarakYaz', 'tarihJs', 'telefonTuslama',
  'onayKutusuZorla', 'radyoZorla', 'dosyaYukle', 'tcSorgulu', 'musteriSorgula', 'degerJs', 'ozelSecim'
];
/** Çerçeve (iframe) zincirinin en çok derinliği (konum / aksiyon / gösterge "cerceve"si). */
export declare const CERCEVE_EN_DERIN: number;
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

/** Alan tipine göre "sinirlar" (değer kuralları) sorunları; geçerliyse boş dizi. */
export declare function sinirHatalari(tip: unknown, sinirlar: unknown): string[];

/** Doğrulama hatasının maddeleri (" - " satırları). */
export declare function dogrulamaMaddeleri(hata: unknown): string[];

/** Sürüm 1 ekran modeline koşu tanımı yazıldıysa modeli yerinde sürüm 2'ye çıkarır; yükseltildiyse true. */
export declare function semaSurumunuYukselt(model: unknown): boolean;

/** Doğrulayıcının iç iletisini kullanıcının anlayacağı Türkçeye çevirir (yol → adım / akış / alan adı, anahtar → Türkçe ad). */
export declare function anlasilirDogrulamaIletisi(madde: string, model?: unknown): string;

/** "kosullar"da tanımlı olup hiçbir yerde adıyla kullanılmayan koşulların uyarıları (modeli değiştirmez). */
export declare function bagsizKosulUyarilari(model: unknown): Array<{ yer: string; mesaj: string }>;
/** Adrese git yolu kuralı (giriş / ekran akışı kaydı ve modeldeki "git" aksiyonu ortak): bkz. gezinme-yolu.mjs. */
export declare const GEZINME_YOLU_EN_COK: number;
export declare const GEZINME_SORGU_EN_COK: number;
export declare function gezinmeYolu(yol: unknown): string;
export declare function gitYoluHatasi(yol: unknown): string | null;
