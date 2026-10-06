// scripts/platform/senaryolar/akis-diyagrami.mjs için tip bildirimi (birim testleri import eder).

export declare const BASLANGIC_ADIMLARI: readonly string[];
export declare const BAGLAM_ADIMI_ONEKI: string;

export interface DiyagramAdimSonucu { durum: string; sureMs: number | null; hataMesaji: string | null }
/** zorunlu: akışta zorunlu (model: mutlakaGorunmeli) — koşuda görünmezse test başarısız. */
/** deger: senaryodaki değerin kısa okunuşu (yalnız seçeneklerde degerler verilince; hassas değer maskeli gelir). */
export interface DiyagramAlani { id: string; etiket: string; kosul: string | null; buSenaryoda: boolean | null; zorunlu: boolean; deger?: string | null }
export interface DiyagramAdimi {
  id: string;
  no: number;
  baslik: string;
  istegeBagli: boolean;
  kapsamEtiketi: string | null;
  /** Ortak akış adımıysa ortak akışın adı; değilse null. */
  ortakAkis: string | null;
  kosulur: boolean | null;
  /** Koşulmuyorsa (kosulur false) nedeni; değilse null. */
  neden: string | null;
  altAkis: string | null;
  /** SQL sorgusu adımının kısa açıklaması (yoksa null). */
  sqlOzeti: string | null;
  servisOzeti: string | null;
  /** İndirilen dosyayı doğrulama adımının özeti (yoksa null). */
  dosyaOzeti: string | null;
  /** Yeniden giriş adımı (profil: giriş profilinin adı; null = ortamın varsayılanı); değilse null. */
  yenidenGiris: { profil: string | null } | null;
  alanlar: DiyagramAlani[];
  ilerleme: string[];
  aksiyonMetinleri: string[];
  gosterge: string | null;
  /** Düğmeden sonra ne beklenir: "Sonra bekler: … · zaman aşımı N sn" (adımda ilerleme düğmesi yoksa null). */
  sonraBekler: string | null;
  hedef: 'basari' | 'hata' | null;
  sonuc: DiyagramAdimSonucu | null;
  /** Akışın başındaki ortak akış adımı: ekran açılmadan önce koşar (yalnız öyleyse true). */
  ekranAcilmadan?: true;
}
export interface AkisDiyagrami {
  /** kip: etkin giriş (ortam | girissiz | temiz); profil: senaryonun seçtiği giriş profili. */
  baslangic: { girisVar: boolean; kip: 'ortam' | 'girissiz' | 'temiz'; profil: string | null; metin: string; sonuc: DiyagramAdimSonucu | null };
  /** Baştaki ortak akışlar bu senaryoda koşuyorsa, onlardan sonra ekranın açılışı (düğüm); değilse null (ekran girişle açılır). */
  ekranAcilisi: { metin: string; sonuc: DiyagramAdimSonucu | null } | null;
  adimlar: DiyagramAdimi[];
  bitis: { tur: 'basari' | 'hata'; metin: string; durum: string | null };
  eslesmeyenler: string[];
}
export interface DiyagramSecenekleri {
  gorunurluk?: { adimlar?: Record<string, boolean | null>; alanlar?: Record<string, boolean | null> } | null;
  beklenen?: { hataAdimi?: string | null; mesaj?: string | null } | null;
  sonuc?: { durum: string; adimlar?: Array<{ ad: string; durum: string; sureMs?: number | null; hataMesaji?: string | null }> } | null;
  /** Senaryonun giriş seçimi (senaryo-girisi.mjs); yoksa ortamın girişiyle. */
  giris?: { kip: string; profil?: string | null } | null;
  /** Alan kimliği → senaryodaki değerin kısa okunuşu (senaryo formu verir; diyagram kutusunda gösterilir). */
  degerler?: Record<string, string | null> | null;
}

export declare function ifadeMetni(ifade: unknown, model: object): string;
export declare function gorunurlukMetni(gorunurluk: unknown, model: object): string | null;
export declare function akisDiyagrami(model: object, s?: DiyagramSecenekleri): AkisDiyagrami;
export declare const ZAMAN_ASIMI_SINIRI: Readonly<{ enAz: number; enCok: number }>;
export declare const GOSTERGESIZ_METNI: string;
export declare function seciciAdlari(model: unknown): Map<string, { ad: string; tur: 'alan' | 'dugme' }>;
export declare function gostergeOkunusu(g: unknown, adlar?: Map<string, { ad: string; tur: 'alan' | 'dugme' }>): string | null;
export declare function sonraBeklerMetni(okunus: string | null, zamanAsimiSn: unknown): string;
export declare function gostergeSabitMetni(m: unknown): string | null;
export declare function sayfadanGosterge(o: { secici: string; metin?: string | null; cerceve?: string[] }): { tur: 'metin' | 'eleman'; deger: string; secici?: string; cerceve?: string[] };
export declare const GIRIS_DUGUMU: 'giris';
export declare const SONUC_DUGUMU: 'sonuc';
export declare function adimDugumu(adimId: string): string;
/** Form kontrol anahtarının diyagram düğümleri (sema: formSemasiOlustur sonucu). */
export declare function kontrolDugumleri(anahtar: string, sema: object): string[];
export declare function hataDugumleri(alanHatalari: Record<string, string[]>, sema: object): Record<string, string[]>;
