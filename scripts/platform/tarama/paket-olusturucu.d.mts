// scripts/platform/tarama/paket-olusturucu.mjs için tip bildirimi (tarama envanteri ve paket üretimi).

export type Kirilganlik = 'dusuk' | 'orta' | 'yuksek';
export type HamSecenek = { deger: string; metin: string };
export type HamRadyo = { deger: string; metin: string | null; secici: string | null };
/**
 * Bir seçim alanının bir anda gözlenen seçenekleri (yalnız seçenek etiketi / değeri; kullanıcının yazdığı metin değil) ve o
 * andaki DİĞER seçim alanlarının seçili değerleri. kaynak: 'liste' (select / radyo okuması) | 'acilir' (tıklanınca açılan
 * listbox / combobox öğeleri). Test verisi tablolarına (bağımlı listelerde kombinasyon satırları) çevrilir.
 */
export type SecenekGozlemi = { anahtar: string; secimler: Record<string, string>; secenekler: HamSecenek[]; kaynak?: 'liste' | 'acilir' };

/** Sayfadaki GÖRÜNÜR bir form alanının yapısı (değer İÇERMEZ). */
export type HamAlan = {
  /** Sayfa içi kararlı anahtar (#id, @name, ~etiket…); profiller ve keşif durumları arasında eşleştirme için. */
  anahtar: string;
  /** select | textarea | input türü (text, email, number, date, tel, checkbox, radio, file, password…) */
  tur: string;
  etiket: string | null;
  etiketKaynagi: 'label' | 'sarmalayan' | 'aria' | 'yakin' | 'legend' | 'yer-tutucu' | null;
  kimlik: string | null;
  ad: string | null;
  secici: string;
  kirilganlik: Kirilganlik;
  /** Mevcut modelle eşleştirmede kullanılan eşdeğer seçiciler (#id, [name=…] …). */
  adaySeciciler: string[];
  /** Diyagram paletinde gösterilen kısa not (ör. "sabit değer: bugun+7", "kimlik bloğu: …"). */
  not?: string;
  zorunlu: boolean;
  devreDisi: boolean;
  saltOkunur: boolean;
  coklu: boolean;
  secenekler?: HamSecenek[];
  radyolar?: HamRadyo[];
  kabul?: string | null;
  /** Aynı adı paylaşan onay kutusu grubu. */
  grup?: string | null;
  bolum: { anahtar: string; baslik: string };
};

export type SayfaEnvanteri = { alanlar: HamAlan[]; baslik: string; ozelBilesenSayisi: number; cerceveSayisi: number };

export type KesifDegeri = {
  deger: string;
  metin: string;
  /** Bu seçenekte beliren alanlar (temel envanterde olmayan; tam yapılarıyla). */
  gorunenler: HamAlan[];
  /** Bu seçenekte kaybolan alanların anahtarları. */
  kaybolanlar: string[];
  /** Seçim sayfayı başka adrese götürdüyse gidilen yol. */
  gezinme: string | null;
  hata?: string | null;
  /** Bu seçenekte seçenekleri DEĞİŞEN (bağımlı) diğer seçim alanları: anahtar → yeni seçenekler. */
  secenekler?: Record<string, HamSecenek[]>;
};
export type Kesif = { secim: string; ilkDeger: string | null; degerler: KesifDegeri[]; geriAlindi: boolean; atlandi?: string | null };

export type ProfilEnvanteri = {
  /** Bağlam profili adı (profil seçilmediyse null). */
  profil: string | null;
  /** Taranan sayfanın yolu (sorgu dahil). */
  yol: string;
  baslik: string;
  alanlar: HamAlan[];
  kesifler: Kesif[];
  /** base64 PNG (görünür alan). */
  ekranGoruntusu: string | null;
  notlar: string[];
};

export type EngellenenIstek = { yontem: string; adres: string; asama: string; neden: 'yazma' | 'yasakli' | 'izinsiz-koken' | 'websocket' };

export type TaramaEnvanteri = {
  profiller: ProfilEnvanteri[];
  /** Bağlam değiştirme adımı başarısız olan (taranamayan) profiller; görünürlük gözlemine girmez. */
  hataliProfiller: Array<{ profil: string | null; mesaj: string }>;
  engellenenler: EngellenenIstek[];
  kesifYapildi: boolean;
  /** Taramada kullanılan açılır liste keşif sınırı (Ayarlar > Koşu); yoksa KESIF_SECENEK_SINIRI. */
  kesifSecenekSiniri?: number;
};

/** Akış kaydında bir öğe: adımın ilerleme düğmesi ya da başarı göstergesi (seçici + ekrandaki metni; değer değil). */
export type KayitOgesi = { secici: string; metin: string | null };
/**
 * Başarı göstergesi: aranan metni kullanıcı belirler (undefined: öneri — metnin sabit kısmı; null: yalnızca öğe görünür).
 * secici null: öğe seçilmedi, metin sayfanın tamamında aranır (akış tasarımında elle yazılan beklenen mesaj).
 */
/** veya: art arda seçilen diğer beklenen mesajlar (herhangi biri görünürse başarılı). */
/** desen: aranan bir düzenli ifadedir (öğenin / sayfanın metni ona uymalı). */
export type KayitGostergesi = { secici: string | null; metin: string | null; aranan?: string | null; veya?: KayitGostergesi[]; desen?: boolean };
/** Kullanıcının adlandırıp aldığı adım: seçtiği alanların YAPISI (değer yok) + ilerleme düğmesi. */
/** Adımın içinde yeni alanlar açan düğme ("Ek adres ekle"); secimli: her senaryoda basılmaz, senaryoda seçilir. */
export type KayitAcicisi = KayitOgesi & { secimli: boolean; onceBekle?: number; sonraBekle?: number };
export type KayitAdimi = {
  ad: string; yol: string; baslik: string; alanlar: HamAlan[]; ilerleme: KayitOgesi | null;
  /** Alan açan düğmeler (basılış sırasıyla). */
  acicilar?: KayitAcicisi[];
  /** alanlar ile aynı sırada: alanın göründüğü parça (0: ilk düğmeden önce, k: k. alan açan düğmeden sonra). */
  parcalar?: number[];
  /**
   * Adıma ait ekran okumaları (akış kaydında panelin okumaları; akis-tasarimi.mjs seçer): görünen alanların
   * anahtarları ve seçim alanlarının (select/radyo) o anki SEÇENEK değeri (yalnızca alanın kayıtlı seçeneklerinden biriyse;
   * serbest metin değeri okunmaz). Seçime göre görünen alanların koşulu bunlardan çıkarılır.
   */
  okumalar?: Array<{ gorunen: string[]; secimler: Record<string, string> }>;
  /** Süreli beklemeler (akış tasarımı, saniye): ilerleme düğmesinden önce (düğme yoksa alanlardan sonra) / sonra. */
  onceBekle?: number;
  sonraBekle?: number;
  /** Akış tasarımında elle belirlenen görünürlük koşulları (alan anahtarı → seçim + değerler; null: koşulsuz). */
  kosullar?: Record<string, { secim: string; degerler: string[] } | null>;
  /** Adımın ilerleme düğmesine basıldıktan sonra beklenen mesaj (akış tasarımı; yoksa sonraki adımın ilk alanı görünür). */
  gosterge?: KayitGostergesi | null;
  /** Adımda kabul edilen iş kuralı uyarıları (akış tasarımında "Uyarı" işaretli mesajlar). */
  uyarilar?: KayitGostergesi[];
  /** İlerleme düğmesinden sonra sonucu en çok bekleme süresi (sn; kosu.zamanAsimiSn). */
  zamanAsimiSn?: number;
  /** Ortak akış adımı (akış tasarımında "+ > Ortak akış"): alanı yoktur; istegeBagli ise senaryoda "“ad” dahil" ile seçilir. */
  ortakAkis?: { dosya: string; istegeBagli: boolean };
  /** SQL sorgusu adımı (akış tasarımında "+ > SQL sorgusu"): alanı yoktur; modelde adımın sqlKontrolu olur. */
  sqlKontrolu?: import('../sql/sql-adimi.mjs').SqlTanimi;
  /** İndirilen dosyayı doğrulama adımı (akış tasarımında "+ > Dosya doğrula"): alanı yoktur; modelde adımın dosyaKontrolu olur. */
  dosyaKontrolu?: import('../dosyalar/dosya-icerigi.mjs').DosyaTanimi;
  /** Yeniden giriş adımı (akış tasarımında "+ > Yeniden giriş"): alanı yoktur; modelde adımın yenidenGiris'i olur. */
  yenidenGiris?: { profil?: string };
};
/** "Akışı kaydet" sonucu (ekran görüntüsü YOKTUR: kullanıcının girdiği bilgileri içerirdi). */
export type KayitEnvanteri = {
  kip: 'kayit';
  profil: string | null;
  adimlar: KayitAdimi[];
  basariGostergesi: KayitGostergesi | null;
  engellenenler: EngellenenIstek[];
  notlar: string[];
  /** Kayıtta gözlenen seçim listeleri (test verisi tablolarına çevrilir). */
  secenekGozlemleri?: SecenekGozlemi[];
};

export type PaketMetasi = {
  ekranAnahtari: string;
  ekranAdi: string;
  urlYolu: string;
  proje?: string;
  olusturulma?: string;
  girisGerekli: boolean;
  /** "Giriş yapmadan aç" ile tarandı/kaydedildi: model "girisGerekmez" olur (koşucu giriş/bağlam adımlarını atlar). */
  girissiz?: boolean;
  ikiAsamali: 'yok' | 'totp' | 'sms' | 'bilinmiyor';
  baglamTuru: string | null;
  /** Tekrar analizde ekranın güncel modeli (taban alınır). */
  mevcutModel?: Record<string, unknown> | null;
};

export type PaketOzeti = {
  alanSayisi: number;
  kosulSayisi: number;
  yeniAlanSayisi: number;
  eslesenSayisi: number;
  eslesmeyenSayisi: number;
  engellenenYazma: number;
  kanitSayisi: number;
  /** Yalnızca akış kaydında: adım sayısı. */
  adimSayisi?: number;
};
export type PaketSonucu = { paket: Record<string, unknown>; ozet: PaketOzeti };

export declare const TARAMA_OLUSTURANI: string;
export declare const KAYIT_OLUSTURANI: string;
/** Başarı göstergesinin sabit kısmı (ilk rakamdan öncesi; değişken numara/tarih atılır). */
export declare function sabitGostergeMetni(m: string | null): string | null;
export declare function secimKosuluCikar(
  okumalar: Array<{ gorunen: string[]; secimler: Record<string, string> }>, hedef: string, adaylar: string[], gecerliDegerler: (anahtar: string) => Set<string>
): { secim: string; degerler: string[] } | 'coklu' | null;
export declare function kayitPaketiOlustur(meta: PaketMetasi, envanter: KayitEnvanteri): PaketSonucu;
export declare const AKSIYON_BILINMEYENI: string;
export declare const KESIF_SECENEK_SINIRI: number;
export declare function kimlikUret(metin: string, yedek?: string): string;
export declare function ekranAnahtariOner(metin: string): string;
export declare function modelTipi(a: HamAlan): { tip: string; not: string | null };
export declare function taramaPaketiOlustur(meta: PaketMetasi, envanter: TaramaEnvanteri): PaketSonucu;
