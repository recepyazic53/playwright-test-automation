// EKRAN MODELİ: bir ekranın tek doğruluk kaynağı. Modeller platform veritabanında durur (Nöbetçi > Ekranlar).
//
// Bu dosya modelin TypeScript tiplerini ve modeli dosyadan/veritabanı kümesinden kuran yükleyicileri
// içerir. Yapısal DOĞRULAMA kuralları (bilinen anahtarlar/tipler, benzersiz alan id'leri, adım/koşul/
// alan/alt model başvurularının varlığı, bağlam profili görünürlüğü) platform sunucusuyla ORTAKTIR:
// scripts/dogrulama/ekran-modeli-dogrulayici.mjs. Senaryo verisinin modele uygunluğu koruma
// testlerinde (tests/birim/) kontrol edilir.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AKSIYON_TURLERI, ALAN_TIPLERI, BASARI_GOSTERGESI_TURLERI, DESTEKLENEN_SEMA_SURUMU, SEMA_SURUMLERI, DOLDURUCULAR, FORM_KONTROLLERI, KIRILGANLIK_DUZEYLERI, SECENEK_DURUMLARI,
  YAPILANDIRMA_TURLERI, altModeliDogrula as dogrulayiciAltModel, ekranModeliniDogrula as dogrulayiciEkranModeli
} from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';

/** Bu yükleyicinin anladığı en yeni şema sürümü ve kabul edilen sürümler (doğrulayıcıyla aynı). */
export { DESTEKLENEN_SEMA_SURUMU, SEMA_SURUMLERI, AKSIYON_TURLERI, BASARI_GOSTERGESI_TURLERI };
export { ALAN_TIPLERI, YAPILANDIRMA_TURLERI, DOLDURUCULAR, FORM_KONTROLLERI, SECENEK_DURUMLARI, KIRILGANLIK_DUZEYLERI };

// ---- Tipler ----

/** Modelde serbest JSON değerleri (varsayılan değer, doldurucu parametresi vb.). */
export type JsonDeger = string | number | boolean | null | JsonDeger[] | { [anahtar: string]: JsonDeger };

export type AlanTipi = (typeof ALAN_TIPLERI)[number];

export type Yapilandirma = (typeof YAPILANDIRMA_TURLERI)[number];

export type Doldurucu = (typeof DOLDURUCULAR)[number];

export type FormKontrolu = (typeof FORM_KONTROLLERI)[number];

export type SecenekDurumu = (typeof SECENEK_DURUMLARI)[number];

export type Kirilganlik = (typeof KIRILGANLIK_DUZEYLERI)[number];

export type Secenek = {
  deger: string;
  metin?: string | null;
  formMetni?: string;
  /** Senaryo JSON'unda tutulan değer ekrandaki value'dan farklıysa (ör. sorguTipi "tekli" → "1"). */
  senaryoDegeri?: string;
  /** Tek senaryo değerinin ekranda birden fazla kontrole dağıldığı durumlar (ör. ödeyen). */
  ekranDegerleri?: Record<string, string>;
  secici?: string;
  /** Seçeneğin geçerli olduğu adlandırılmış koşul (kosullar anahtarı). */
  kosul?: string;
};

/** Koşul dili (bkz. README > Koşul dili). */
export type KosulIfadesi =
  | { alan: string; esit: JsonDeger }
  | { alan: string; icinde: JsonDeger[] }
  | { senaryoAyari: string; esit: JsonDeger }
  | { ve: KosulIfadesi[] }
  | { veya: KosulIfadesi[] }
  | { degil: KosulIfadesi }
  /** Bağlam profiline göre alan seti. */
  | { baglam: { alanSeti: string } }
  | { calismaZamani: 'gorunurse' };

/** Alan/bölüm/adım görünürlüğü: adlandırılmış koşul (kosul) YA DA satır içi ifade. */
export type Gorunurluk = { kosul: string; not?: string } | { ifade: KosulIfadesi; not?: string };

export type AdlandirilmisKosul = {
  ifade: KosulIfadesi;
  aciklama?: string;
  hedefIfade?: KosulIfadesi;
  /** Bağlam profili bazında bilinen görünürlük; doğrulayıcı profilKodu'nu bağlam profilinin kod'uyla eşleştirir. */
  bilinenDurumlar?: Array<{ profil?: string; profilKodu?: string; gorunur: boolean | null; kaynak: string }>;
  not?: string;
};

export type Etiket = { ekran: string | null; form?: string | null; kaynak?: string; not?: string };

export type Eslesme = {
  /** Senaryo JSON anahtar(lar)ı (senaryo verisindeki <anahtar>). */
  senaryo?: string | string[];
  /** Ürün verisindeki yol (<yol>, noktalı). */
  urun?: string | null;
  /** Kart nesnesi içindeki anahtar (yalnızca odemeKrediKarti alt modelinde). */
  /** Alt model alanının kayıt (ör. test verisi kaydı) içindeki adı. */
  kayitAlani?: string;
  /** Eski adı (hâlâ okunur): kayitAlani. */
  kart?: string;
  /** Kimlik nesnesi içindeki anahtar (kimlikProfili alt alanları); türe göre farklıysa tür → anahtar. */
  kimlikAlani?: string | Record<string, string>;
  profilHavuzu?: string | Record<string, string>;
  harici?: string;
  donusum?: string | Record<string, string> | null;
  not?: string;
};

/**
 * Çerçeve (iframe) seçicileri, dıştan içe (1–2 öğe; ör. ["iframe#pencere"]). Verilirse öğenin seçicisi o çerçevenin belgesine
 * göredir ve model koşucusu page.frameLocator(...) ile o çerçevede çalışır. Yoksa öğe ana sayfadadır.
 */
export type Cerceve = string[];

export type Konum = {
  secici: string;
  yardimci?: Record<string, string>;
  kirilganlik: Kirilganlik;
  /** Alan bir çerçevenin (iframe) içindeyse çerçeve seçicileri (yardimci seçicileri de aynı çerçevededir). */
  cerceve?: Cerceve;
  not?: string;
};

export type FormKarsiligi = {
  /** Dashboard "Senaryo Oluştur/Düzenle" formundaki kontrolün id'si (radyo grubunda name). */
  id: string;
  kontrol: FormKontrolu;
  etiket?: string;
  secenekler?: Secenek[];
  /** Aynı model alanını besleyen ek form kontrolleri (mod seçici radyo, profil select vb.). */
  yardimciKontroller?: Array<{ id: string; kontrol: FormKontrolu; amac: string }>;
  not?: string;
};

export type AltModelBasvurusu = { dosya: string; bolum: string };

export type BeklenenSonucVaryanti = {
  tip: string;
  anlam: string;
  alanlar?: Record<string, { etiket?: string; secenekler?: Secenek[]; tip?: AlanTipi; zorunlu?: boolean; eslesmeKurali?: string }>;
};

export type Alan = {
  id: string;
  tip: AlanTipi;
  etiket?: Etiket;
  secenekler?: Secenek[] | null;
  seceneklerDurumu?: SecenekDurumu;
  seceneklerKaynagi?: string;
  bagimlilik?: { alan: string | string[]; secenekHaritasi?: Record<string, Secenek[]>; not?: string };
  /** Tetik: "alan" (metin) doldurulunca bu alan belirir ya da seçenekleri gelir; koşucu kaynağı doldurduktan sonra bekler. */
  tetik?: { alan: string; olay: 'belirdi' | 'doldu' };
  zorunlu?: boolean | null;
  benzersiz?: boolean;
  varsayilan?: { deger: JsonDeger; kaynak?: string; not?: string };
  yapilandirma?: Yapilandirma;
  eslesme?: Eslesme;
  konum?: Konum;
  doldurucu?: Doldurucu;
  doldurucuParametreleri?: Record<string, JsonDeger>;
  gorunurluk?: Gorunurluk | null;
  form?: FormKarsiligi | null;
  dogrulama?: { istemci?: string; sunucu?: string; ts?: string };
  altAlanlar?: Alan[];
  ekranAlanlari?: Alan[];
  altModel?: AltModelBasvurusu;
  varyantlar?: BeklenenSonucVaryanti[];
  akisPlani?: string;
  kimlikTuru?: string | Record<string, string>;
  bicim?: string;
  kabul?: string;
  birim?: string;
  hassas?: boolean;
  ekrandaAlanDegil?: boolean;
  sira?: number;
  sonKontrol?: string;
  kullanim?: string;
  excelSutunlari?: { deger: JsonDeger; not?: string };
  durum?: 'oneri';
  notlar?: string[];
  /** Uygulamadaki değer kuralları (senaryo tasarım yardımcısının sınır değer önerileri yalnız bunlardan üretilir). */
  sinirlar?: AlanSinirlari;
};

/** Sayıda enAz / enCok (+ artis), tarihte enAz / enCok ("bugun±N" ya da tarih), metinde uzunluk ve desen. */
export type AlanSinirlari = {
  enAz?: number | string;
  enCok?: number | string;
  artis?: number;
  enAzUzunluk?: number;
  enCokUzunluk?: number;
  desen?: string;
  not?: string;
};

export type Bolum = {
  id: string;
  baslik: string;
  pomMetodu?: string;
  gorunurluk?: Gorunurluk | null;
  alanlar: Alan[];
};

/** Adım koşu tanımındaki aksiyon (sürüm 2). */
export type AdimAksiyonu = {
  tur: (typeof AKSIYON_TURLERI)[number];
  /** Playwright seçicisi (CSS, "text=…", "role=button[name=…]"); tikla / bekle'de zorunlu, ekranaDon'da yok. */
  secici?: string;
  /** Yalnızca "git": ortamın adresine göre yol (ör. /liste; tam adres / başka site olmaz). */
  yol?: string;
  /** Birden çok öğe eşleşirse bu metni içeren öğe. */
  metin?: string;
  /** Yalnızca "bekle": öğe görünür (varsayılan) ya da gizli olana kadar. */
  durum?: 'gorunur' | 'gizli' | 'dolu';
  /**
   * Yalnızca "tikla": gorunurse → öğe kısa bir süre (varsayılan 5 sn; zamanAsimiSn ile ayarlanır, adımın süresinden bağımsız)
   * beklenir; görünürse tıklanır, görünmezse atlanır (raporda "atlandı (görünmedi)" notu). Ör. bazı ekranlarda çıkan ara pencere.
   */
  kosul?: 'gorunurse';
  aciklama?: string;
  zamanAsimiSn?: number;
  /** Öğe bir çerçevenin (iframe) içindeyse çerçeve seçicileri. */
  cerceve?: Cerceve;
  /** Yalnızca "tikla": bu tıklamada açılan tarayıcı onay / soru penceresine yanıt (kabul: Tamam, iptal: İptal); açılan pencereler beklenen sayılır. */
  diyalog?: 'kabul' | 'iptal';
};

/** Adımın başarı göstergesi (sürüm 2): metin (secici verilirse o öğede), eleman (görünür), url (desen). */
/** cerceve: gösterge öğesi (eleman / secici) bir çerçevenin (iframe) içindeyse çerçeve seçicileri. */
export type TekBasariGostergesi = { tur: (typeof BASARI_GOSTERGESI_TURLERI)[number]; deger: string; secici?: string; cerceve?: Cerceve };
/** "veya": seçeneklerden herhangi biri görünürse adım başarılı (2–5 seçenek). */
export type BasariGostergesi = TekBasariGostergesi | { tur: 'veya'; secenekler: TekBasariGostergesi[] };

/** Adımın koşu tanımı (sürüm 2) — model koşucusu kullanır (tests/support/model-kosucu.ts). */
export type AdimKosuTanimi = {
  aksiyonlar?: AdimAksiyonu[];
  basariGostergesi?: BasariGostergesi;
  /** İş kuralı uyarısının göründüğü öğe. */
  hataGostergesi?: { secici: string; cerceve?: Cerceve };
  /** Adımda kabul edilen iş kuralı uyarıları (secici verilirse o öğede; cerceve: öğe bir çerçevedeyse). */
  uyarilar?: Array<{ metin: string; secici?: string; cerceve?: Cerceve }>;
  zamanAsimiSn?: number;
  /** "Ekran görüntüsü al" işareti: adım görüntüleri "Seçili adımlarda" iken yalnız bu adımların görüntüsü alınır. */
  ekranGoruntusu?: boolean;
  /**
   * "Tekrar denenebilir" işareti (akış tasarımı): kurtarma kuralı bu adımı tekrar deneyebilir, sayfayı yenileyebilir ya da senaryoyu
   * baştan başlatabilir. Varsayılan işaretsiz (çift kayıt koruması: kayıt oluşturan adım tekrar edilmez).
   */
  tekrarDenenebilir?: boolean;
  not?: string;
  /**
   * Bitiş koşulu (hızlı test; isteğe bağlı): "Devam" metinleri görünürken sonuç beklenmeye devam edilir (en çok zamanAsimiSn); başarı
   * göstergesi (Bitti) ya da uyarı (Hata) görünmezse adım "Bitiş mesajı görülmedi" ile düşer.
   */
  bitisKosulu?: { devam: string[] };
};

export type Adim = {
  id: string;
  sira: number;
  baslik: string;
  pomMetodu?: string;
  gorunurluk?: Gorunurluk | null;
  bolumler?: Bolum[];
  altModel?: AltModelBasvurusu;
  /** SQL adımı (platform/sql/sql-adimi.mjs SqlTanimi): koşuda veritabanı sorgusu beklenenle karşılaştırılır. */
  sqlKontrolu?: Record<string, unknown>;
  /** İndirilen dosyayı doğrulama adımı (platform/dosyalar/dosya-icerigi.mjs DosyaTanimi + tetikleyici düğme). */
  dosyaKontrolu?: Record<string, unknown>;
  /** Sürüm 2: aksiyonlar ve başarı/hata göstergesi. */
  kosu?: AdimKosuTanimi;
};

export type IsKurali = {
  id: string;
  adim: string;
  kosul: KosulIfadesi;
  gecerlilik?: Gorunurluk;
  mesaj: string;
  kaynak: string;
};

export type UrunDuzeyiAlani = {
  tip: string;
  degerler?: { test?: JsonDeger; canli?: JsonDeger };
  kullanan?: string;
  not?: string;
};

export type AltModel = {
  semaSurumu: number;
  tur: 'altModel';
  id: string;
  ad: string;
  aciklama: string;
  pageObject?: string;
  kullananlar: string[];
  veriKaynaklari: Record<string, string>;
  bolumler: Bolum[];
  ekranDisiAlanlar?: Array<{ id: string; kaynak: string; not: string }>;
  bilinmeyenler: string[];
};

export type EkranModeli = {
  semaSurumu: number;
  tur: 'ekran';
  id: string;
  ad: string;
  aciklama: string;
  ekranUrl: string;
  /** İsteğe bağlı (model koşucusu kullanmaz); pakette yazılmazsa Nöbetçi üretir. */
  specDosyasi?: string;
  /** İsteğe bağlı (model koşucusu kullanmaz); pakette yazılmazsa Nöbetçi "yok (model koşucusu)" yazar. */
  pageObject?: string;
  veriKaynaklari: Record<string, string>;
  kosullar: Record<string, AdlandirilmisKosul>;
  adimlar: Adim[];
  senaryoDuzeyi: { aciklama: string; alanlar: Alan[] };
  urunDuzeyi: Record<string, UrunDuzeyiAlani>;
  /** Bağlam profili ekranı (ayrı ekran; alan kimlikleri ayrı ad alanında). */
  baglam?: BaglamEkrani;
  isKurallari: IsKurali[];
  bilinmeyenler: string[];
  /** Bağlam profiline göre alan görünürlüğü (gözlem; ekran paketinden gelir). */
  baglamGorunurlugu?: BaglamGorunurlugu;
};

/** Modelin bağlam profili ekranı (model.baglam). */
export type BaglamEkrani = {
  aciklama: string;
  pageObject?: string;
  veriKaynagi: string;
  alanlar: Alan[];
  bilinenProfiller: string[];
};

/**
 * Bağlam profiline göre alan görünürlüğü — GÖZLEM verisidir (hangi profille incelendiğinde alan ekranda
 * görüldü). true = görüldü, false = görülmedi, null = bilinmiyor. Koşu davranışını belirlemez (koşuda
 * "görünüyorsa doldur, görünmüyorsa atla"; "mutlaka görünmeli" senaryo kuralıdır).
 */
export type BaglamGorunurlugu = {
  /** İncelemede kullanılan bağlam profillerinin ADLARI. */
  profiller: string[];
  /** alanId → profil adı → görünür mü */
  alanlar: Record<string, Record<string, boolean | null>>;
  kaynak?: string;
  not?: string;
};

/** Yüklenmiş ve doğrulanmış model + başvurduğu alt modeller (dosya adı → alt model). */
export type YuklenmisEkranModeli = {
  model: EkranModeli;
  /** Modelin adı (ör. "<ekran anahtarı>.model.json") ya da fixture dosyasının yolu. */
  dosyaYolu: string;
  altModeller: Record<string, AltModel>;
};

/** Alt model kaynağı: alt model dosya adı → ham JSON (yoksa undefined). */
type AltModelKaynagi = (dosyaAdi: string) => unknown;
// ---- Doğrulama (TEK KAYNAK: scripts/dogrulama/ekran-modeli-dogrulayici.mjs) ----
// Kurallar sunucuyla (ekran paketi, model sürümleri) ORTAKTIR; burada yalnızca dosya okuma ve tipler var.

// ---- Alt model ----

/** Alt model dosyasını okuyup doğrular; hatalıysa tüm sorunları listeleyen bir Error fırlatır. */
export function altModeliYukle(dosyaYolu: string): AltModel {
  return altModeliDogrula(dosyaYolu, JSON.parse(readFileSync(dosyaYolu, 'utf-8')));
}

/** Ham alt modeli doğrular (dosya okumaz). */
export function altModeliDogrula(dosyaYolu: string, ham: unknown): AltModel {
  return dogrulayiciAltModel(dosyaYolu, ham) as unknown as AltModel;
}

// ---- Ekran modeli ----

/**
 * Ekran modeli dosyasını (ve başvurduğu alt model dosyalarını) okuyup doğrular. Kurala
 * uymayan her şey toplanır ve TEK bir Türkçe Error'da listelenir (kurallar:
 * scripts/dogrulama/ekran-modeli-dogrulayici.mjs > ekranModeliniDogrula).
 */
export function ekranModeliniYukle(dosyaYolu: string): YuklenmisEkranModeli {
  return ekranModeliniDogrula(dosyaYolu, JSON.parse(readFileSync(dosyaYolu, 'utf-8')),
    (dosyaAdi) => JSON.parse(readFileSync(join(dirname(dosyaYolu), dosyaAdi), 'utf-8')));
}

/**
 * Bellekteki modeller kümesinden (eski dosya adı → ham model; ör. platform veritabanından) modeli ve
 * alt modellerini doğrulayarak kurar.
 */
export function ekranModeliniKur(dosyaAdi: string, modeller: Readonly<Record<string, unknown>>): YuklenmisEkranModeli {
  if (!(dosyaAdi in modeller)) throw new Error(`Ekran modeli "${dosyaAdi}" platform veritabanında yok.`);
  return ekranModeliniDogrula(dosyaAdi, modeller[dosyaAdi], (alt) => {
    if (!(alt in modeller)) throw new Error(`"${alt}" platform veritabanında yok`);
    return modeller[alt];
  });
}

/** Ham ekran modelini (ve kaynaktan alınan alt modelleri) doğrular (dosya okumaz). */
function ekranModeliniDogrula(dosyaYolu: string, ham: unknown, altModelKaynagi: AltModelKaynagi): YuklenmisEkranModeli {
  const sonuc = dogrulayiciEkranModeli(dosyaYolu, ham, altModelKaynagi);
  return {
    model: sonuc.model as unknown as EkranModeli,
    dosyaYolu,
    altModeller: sonuc.altModeller as unknown as Record<string, AltModel>
  };
}

// ---- Modelden türetilen listeler (koruma testleri ve ileride form/doldurucu üretimi için) ----

/** Ekranın tüm alanları (bölüm alanları + alt/ekran alanları) derinlik öncelikli. */
export function tumAlanlar(alanlar: readonly Alan[]): Alan[] {
  return alanlar.flatMap((alan) => [alan, ...tumAlanlar(alan.altAlanlar ?? []), ...tumAlanlar(alan.ekranAlanlari ?? [])]);
}

/** Ekran adımlarındaki (alt modeller hariç) tüm alanlar. */
export function ekranAlanlari(model: EkranModeli): Alan[] {
  return tumAlanlar(model.adimlar.flatMap((adim) => (adim.bolumler ?? []).flatMap((bolum) => bolum.alanlar)));
}

/** Alt modelin tüm alanları. */
export function altModelAlanlari(altModel: AltModel): Alan[] {
  return tumAlanlar(altModel.bolumler.flatMap((bolum) => bolum.alanlar));
}

function senaryoAnahtarlari(alan: Alan): string[] {
  const senaryo = alan.eslesme?.senaryo;
  if (senaryo === undefined) return [];
  return Array.isArray(senaryo) ? senaryo : [senaryo];
}

/**
 * Senaryo verisinde BİLİNEN üst düzey anahtarlar → modeldeki alan.
 * Ekran alanları + senaryo düzeyi ayarları; yapilandirma "harici" olanlar (JSON'da yok) hariç.
 */
export function senaryoAnahtarHaritasi(model: EkranModeli): Map<string, Alan> {
  const harita = new Map<string, Alan>();
  for (const alan of [...ekranAlanlari(model), ...tumAlanlar(model.senaryoDuzeyi.alanlar)]) {
    if (alan.yapilandirma === 'harici') continue;
    for (const anahtar of senaryoAnahtarlari(alan)) harita.set(anahtar, alan);
  }
  return harita;
}

/** Senaryoda ayarlanabilen (yapilandirma: "senaryo") alanların senaryo anahtarları, sıralı. */
export function senaryodaAyarlanabilirAnahtarlar(model: EkranModeli): string[] {
  const anahtarlar = new Set<string>();
  for (const alan of [...ekranAlanlari(model), ...tumAlanlar(model.senaryoDuzeyi.alanlar)]) {
    if (alan.yapilandirma === 'senaryo') for (const anahtar of senaryoAnahtarlari(alan)) anahtarlar.add(anahtar);
  }
  return [...anahtarlar].sort();
}

/** Modelde kayıtlı tüm dashboard form kontrol id'leri → kontrol türü ve sahibi alan. */
export function modelFormKontrolleri(yuklenmis: YuklenmisEkranModeli): Map<string, { kontrol: FormKontrolu; alan: string }> {
  const { model, altModeller } = yuklenmis;
  const harita = new Map<string, { kontrol: FormKontrolu; alan: string }>();
  const ekle = (alanlar: Alan[], onEk: string): void => {
    for (const alan of alanlar) {
      if (!alan.form) continue;
      harita.set(alan.form.id, { kontrol: alan.form.kontrol, alan: onEk + alan.id });
      for (const yardimci of alan.form.yardimciKontroller ?? []) {
        harita.set(yardimci.id, { kontrol: yardimci.kontrol, alan: onEk + alan.id });
      }
    }
  };
  ekle(ekranAlanlari(model), '');
  ekle(tumAlanlar(model.senaryoDuzeyi.alanlar), '');
  // Alt model alanlarının form karşılığı yalnızca ekran bir senaryo alanıyla (ör. krediKarti)
  // o alt modeli senaryoda geçersiz kılabiliyorsa dashboard formunda bulunur.
  for (const alan of tumAlanlar(model.senaryoDuzeyi.alanlar)) {
    const basvuru = alan.altModel;
    const altModel = basvuru ? altModeller[basvuru.dosya] : undefined;
    const bolum = altModel?.bolumler.find((b) => b.id === basvuru?.bolum);
    if (bolum) ekle(tumAlanlar(bolum.alanlar), `${altModel?.id}.`);
  }
  return harita;
}
