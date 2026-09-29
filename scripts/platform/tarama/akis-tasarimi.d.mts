// scripts/platform/tarama/akis-tasarimi.mjs için tip bildirimi.
import type { EngellenenIstek, HamAlan, KayitEnvanteri, KayitOgesi, KorunanParca, SecenekGozlemi } from './paket-olusturucu.mjs';

/**
 * Kayıtta ekranın bir okunuşu: görünen alanların anahtarları, o ana kadar DOKUNULAN alanlar (son düğme basışından beri),
 * seçim alanlarının (select/radyo) seçili SEÇENEĞİ (yalnızca kayıtlı seçeneklerden biriyse; metin değerleri okunmaz).
 */
export type AkisOkumasi = { yol: string; gorunen: string[]; dokunulan: string[]; secimler: Record<string, string> };
export type AkisOlayi =
  | { tur: 'okuma'; okuma: AkisOkumasi; elle: boolean }
  /** Düğmeye basıldı; oncesi: basılmadan hemen önceki ekran. */
  | { tur: 'tik'; dugme: number; oncesi: AkisOkumasi }
  | { tur: 'mesaj'; mesaj: number };
/** Görülen alan; secili: kullanıcı panelde listeye aldı (varsayılan: dokunduğu alanlar). */
export type AkisAlani = { alan: HamAlan; secili: boolean };
/** "Akışı kaydet" (topla) sonucu — ekran görüntüsü ve alan değeri YOKTUR. */
export type AkisEnvanteri = {
  kip: 'kayit';
  bicim: 'akis';
  profil: string | null;
  /** İlk ekranın sayfa başlığı. */
  baslik: string;
  alanlar: AkisAlani[];
  /** Basılan düğmeler (seçiciye göre tekil, ilk basılış sırasıyla). */
  dugmeler: KayitOgesi[];
  /** Panelde "Mesaj seç" ile seçilen öğeler. */
  mesajlar: KayitOgesi[];
  olaylar: AkisOlayi[];
  engellenenler: EngellenenIstek[];
  notlar: string[];
  /** Seçim alanlarının gözlenen seçenekleri (okumalar + tıklanınca açılan listeler; yalnız seçenek etiketi / değeri). */
  secenekGozlemleri?: SecenekGozlemi[];
  /** "Bitir"e basıldığı andaki sayfa: yol ve görünen çıkış bağlantısının yazısı (giriş kaydında başarı göstergesi önerisi). */
  sonSayfa?: SonSayfa;
};
export type SonSayfa = { yol: string; cikisMetni: string | null };
export type AkisBlogu =
  /** zorunlu: alanlar'ın alt kümesi (senaryoda değer şart, koşuda görünmezse başarısız); diğerleri "görünürse doldur". */
  /** tekrarDenenebilir: "Tekrar denenebilir" işareti (kurtarma kuralı adımı tekrar deneyebilir; adımın kosu.tekrarDenenebilir). */
  /** ekranGoruntusu: "Ekran görüntüsü al" işareti (alan grubu / aksiyon; adımın kosu.ekranGoruntusu — "Seçili adımlarda" kaydında). sinirlar: alanın değer kuralları. */
  /** korunan: adımın diyagramda gösterilemeyen, aynen korunan parçalarının anahtarı; korunanOzet / korunanKosullar yalnız gösterim (sunucu verir). */
  /** tuslar: alan doldurulduktan sonra basılacak tuş ("Tab" / "Enter"; null = yok) — model alan.doldurucuParametreleri.tus. */
  | { tur: 'alanlar'; ad: string; alanlar: string[]; zorunlu: string[]; kosullar?: Record<string, AkisKosulu | null>; sinirlar?: Record<string, AkisSinirlari | null>; tuslar?: Record<string, string | null>; ekranGoruntusu?: boolean; tekrarDenenebilir?: boolean; korunan?: string; korunanOzet?: string[]; korunanKosullar?: Record<string, string> }
  /** Süreli bekleme (saniye). */
  | { tur: 'bekle'; saniye: number }
  /** zamanAsimiSn: düğmeden sonra sonucu (mesaj / sonraki alan) en çok bekleme süresi (1–600 sn; yoksa koşucunun varsayılanı). */
  /** gorunurse: "Yalnız görünürse bas" — ilerleme düğmesinden sonra, kısa sürede görünmezse atlanır (zamanAsimiSn: o kısa bekleme). */
  | { tur: 'aksiyon'; dugme: number; istegeBagli: boolean; gorunurse?: boolean; zamanAsimiSn?: number; ekranGoruntusu?: boolean; tekrarDenenebilir?: boolean; korunan?: string; korunanOzet?: string[] }
  /** uyari: kabul edilen iş kuralı uyarısı (başarı değil; senaryo "uyarı bekleniyor" derken seçer). */
  /** desen: metin bir düzenli ifadedir (ör. "[1-9]" — sıfırdan farklı toplam); öğesi seçildiyse onun metninde aranır. */
  | { tur: 'mesaj'; mesaj: number | null; metin: string; uyari?: boolean; desen?: boolean }
  /** Ortak akış (ör. ödeme): dosya = "<ortak akış anahtarı>.model.json"; ad adımın başlığı; istegeBagli: senaryoda "“ad” dahil". */
  | { tur: 'ortak'; dosya: string; ad: string; istegeBagli: boolean }
  /** SQL sorgusu adımı (sql/sql-adimi.mjs SqlTanimi; kaydederken doğrulanır). */
  | { tur: 'sql'; ad: string; sql: Record<string, unknown> }
  /** İndirilen dosyayı doğrula: dugme (sağ listedeki düğmenin sırası) indirmeyi başlatır; dosya: DosyaTanimi (kaydederken doğrulanır). */
  | { tur: 'dosya'; ad: string; dugme: number; dosya: Record<string, unknown> }
  /** Yeniden giriş: oturum kapatılıp ortamın tarifiyle yeniden girilir (profil: giriş profili adı; null = varsayılan). */
  | { tur: 'giris'; ad: string; profil: string | null }
  /** Diyagramda düzenlenemeyen, modeldeki hâliyle aynen korunan parça (salt okunur): adımın tamamı ya da adımın koşu aksiyonları. ozet yalnız gösterim. */
  | { tur: 'korunan'; korunan: string; ad: string; kapsam: 'adim' | 'aksiyonlar'; ozet?: string[] }
  | { tur: 'bitir' };
/** Alanın görünürlük koşulu: seçim alanı (anahtar) bu değerlerden birindeyken görünür. */
export type AkisKosulu = { secim: string; degerler: string[] };
export type AkisHatasi = { blok: number | null; mesaj: string };
export type AkisPaleti = {
  /** zorunlu: sayfanın zorunlu işaretlediği alan (gruba eklenince varsayılan "zorunlu"). */
  alanlar: Array<{ anahtar: string; etiket: string; tur: string; bolum: string | null; secili: boolean; zorunlu: boolean; not: string | null; secenekSayisi: number; blok: number | null; secenekler: Array<{ deger: string; metin: string }> | null }>;
  dugmeler: Array<{ sira: number; metin: string; blok: number | null }>;
  mesajlar: Array<{ sira: number; metin: string; oneri: string | null; blok: number | null }>;
};

export declare const BLOK_EN_COK: number;
export declare const ALAN_TUSLARI: string[];
export declare const BEKLEME_EN_COK_SN: number;
export declare const MESAJ_GRUBU_EN_COK: number;
export declare function akisEnvanteriMi(e: unknown): e is AkisEnvanteri;
export declare function akisTaslagi(env: AkisEnvanteri): AkisBlogu[];
export declare function akisPaleti(env: AkisEnvanteri, bloklar: AkisBlogu[]): AkisPaleti;
export declare function bloklariAyikla(ham: unknown): { bloklar: AkisBlogu[]; hatalar: AkisHatasi[] };
export declare function secenekGozlemleriniAyikla(ham: unknown): SecenekGozlemi[];
export declare function akistanKayitEnvanteri(env: AkisEnvanteri, bloklar: AkisBlogu[], s?: { satirSiniri?: number; korunanlar?: Record<string, KorunanParca> }): { envanter: KayitEnvanteri | null; hatalar: AkisHatasi[] };
/** Alanın değer kuralları (model alan.sinirlar; null = kaldır). */
export type AkisSinirlari = { enAz?: number | string; enCok?: number | string; artis?: number; enAzUzunluk?: number; enCokUzunluk?: number; desen?: string };

/** Diyagramda elle tanımlanan alan (kayıtta / modelde olmayan): anahtar "elle-…", tür sayfa envanteri türü, seçici sayfadaki öğenin seçicisi. */
export type ElleAlan = { anahtar: string; etiket: string; tur: string; secici: string };
/** Diyagramda elle tanımlanan düğme: yazısı ve seçicisi (düğme listesinin sonuna eklenir). */
export type ElleDugme = { metin: string; secici: string };
export type ElleOgeler = { alanlar?: ElleAlan[]; dugmeler?: ElleDugme[] };
export declare const ELLE_OGE_EN_COK: number;
export declare const ELLE_ALAN_TURLERI: readonly string[];
export declare const ELLE_ALAN_ANAHTARI: RegExp;
/** Elle tanımlanan alan / düğmeleri envantere ekler (hata varsa envanter değişmez). */
export declare function elleOgeleriEkle(env: AkisEnvanteri, ham: unknown): { envanter: AkisEnvanteri; hatalar: AkisHatasi[] };
