// scripts/platform/tarama/paket-olusturucu.mjs için tip bildirimi (tarama envanteri ve paket üretimi).

export type Kirilganlik = 'dusuk' | 'orta' | 'yuksek';
export type HamSecenek = { deger: string; metin: string };
export type HamRadyo = { deger: string; metin: string | null; secici: string | null };

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
};

export type PaketMetasi = {
  ekranAnahtari: string;
  ekranAdi: string;
  urlYolu: string;
  proje?: string;
  olusturulma?: string;
  girisGerekli: boolean;
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
};
export type PaketSonucu = { paket: Record<string, unknown>; ozet: PaketOzeti };

export declare const TARAMA_OLUSTURANI: string;
export declare const AKSIYON_BILINMEYENI: string;
export declare const KESIF_SECENEK_SINIRI: number;
export declare function kimlikUret(metin: string, yedek?: string): string;
export declare function ekranAnahtariOner(metin: string): string;
export declare function modelTipi(a: HamAlan): { tip: string; not: string | null };
export declare function taramaPaketiOlustur(meta: PaketMetasi, envanter: TaramaEnvanteri): PaketSonucu;
