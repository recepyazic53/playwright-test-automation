// EKRAN MODELİ: bir ürün ekranının tek doğruluk kaynağı (tests/ekran-modelleri/*.model.json).
// Şema açıklaması: tests/ekran-modelleri/README.md.
//
// Bu dosya modelin TypeScript tiplerini ve model dosyasının KENDİSİNİ doğrulayan yükleyiciyi
// içerir (yapısal kontroller: bilinen anahtarlar/tipler, benzersiz alan id'leri, adım/koşul/
// alan/alt model başvurularının varlığı). Senaryo verisinin modele uygunluğu burada değil,
// koruma testlerinde (tests/birim/) kontrol edilir.
//
// NOT: Yalnızca node:fs / node:path import eder — Playwright'sız (birim testlerde, Node
// betiklerinde) kullanılabilir.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const EKRAN_MODELLERI_KLASORU = resolve(__dirname, '..', 'ekran-modelleri');

/** Bu yükleyicinin anladığı şema sürümü. Şema değişirse artırılır, modeller güncellenir. */
export const DESTEKLENEN_SEMA_SURUMU = 1;

// ---- Tipler ----

/** Modelde serbest JSON değerleri (varsayılan değer, doldurucu parametresi vb.). */
export type JsonDeger = string | number | boolean | null | JsonDeger[] | { [anahtar: string]: JsonDeger };

export const ALAN_TIPLERI = [
  'secim', 'okluSecim', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu', 'radyo', 'dosya',
  'kimlikProfili', 'buton', 'baglanti', 'cikti', 'tablo', 'diyalog', 'birlesim', 'altModelGecersizKilma'
] as const;
export type AlanTipi = (typeof ALAN_TIPLERI)[number];

export const YAPILANDIRMA_TURLERI = [
  'senaryo', 'urun', 'turetilmis', 'sabit', 'cikti', 'aksiyon', 'dokunulmuyor', 'harici'
] as const;
export type Yapilandirma = (typeof YAPILANDIRMA_TURLERI)[number];

export const DOLDURUCULAR = [
  'secimGerekirse', 'secim', 'okluSecim', 'metinDoldur', 'tuslayarakYaz', 'tarihJs', 'telefonTuslama',
  'onayKutusuZorla', 'radyoZorla', 'dosyaYukle', 'tcSorgulu', 'musteriSorgula'
] as const;
export type Doldurucu = (typeof DOLDURUCULAR)[number];

export const FORM_KONTROLLERI = ['select', 'text', 'number', 'checkbox', 'radio', 'file', 'password', 'textarea'] as const;
export type FormKontrolu = (typeof FORM_KONTROLLERI)[number];

export const SECENEK_DURUMLARI = ['tam', 'kismi', 'bilinmiyor', 'dinamik'] as const;
export type SecenekDurumu = (typeof SECENEK_DURUMLARI)[number];

export const KIRILGANLIK_DUZEYLERI = ['dusuk', 'orta', 'yuksek'] as const;
export type Kirilganlik = (typeof KIRILGANLIK_DUZEYLERI)[number];

export type Secenek = {
  deger: string;
  metin?: string | null;
  formMetni?: string;
  /** Senaryo JSON'unda tutulan değer ekrandaki value'dan farklıysa (ör. sorguTipi "tekli" → "1"). */
  senaryoDegeri?: string;
  /** Tek senaryo değerinin ekranda birden fazla kontrole dağıldığı durumlar (ör. ettiren). */
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
  | { acente: { alanSeti: string } }
  | { calismaZamani: 'gorunurse' };

/** Alan/bölüm/adım görünürlüğü: adlandırılmış koşul (kosul) YA DA satır içi ifade. */
export type Gorunurluk = { kosul: string; not?: string } | { ifade: KosulIfadesi; not?: string };

export type AdlandirilmisKosul = {
  ifade: KosulIfadesi;
  aciklama?: string;
  hedefIfade?: KosulIfadesi;
  /** Acente bazında bilinen görünürlük; doğrulayıcı acentePartaji ile eşleştirir. */
  bilinenDurumlar?: Array<{ acente: string; acentePartaji?: string; gorunur: boolean | null; kaynak: string }>;
  not?: string;
};

export type Etiket = { ekran: string | null; form?: string | null; kaynak?: string; not?: string };

export type Eslesme = {
  /** Senaryo JSON anahtar(lar)ı (jetSeyahat.senaryolar[i].<anahtar>). */
  senaryo?: string | string[];
  /** Ürün verisindeki yol (jetSeyahat.<yol>, noktalı). */
  urun?: string | null;
  /** Kart nesnesi içindeki anahtar (yalnızca odemeKrediKarti alt modelinde). */
  kart?: string;
  /** Kimlik nesnesi içindeki anahtar (kimlikProfili alt alanları); türe göre farklıysa tür → anahtar. */
  kimlikAlani?: string | Record<string, string>;
  profilHavuzu?: string | Record<string, string>;
  harici?: string;
  donusum?: string | Record<string, string> | null;
  not?: string;
};

export type Konum = {
  secici: string;
  yardimci?: Record<string, string>;
  kirilganlik: Kirilganlik;
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
};

export type Bolum = {
  id: string;
  baslik: string;
  pomMetodu?: string;
  gorunurluk?: Gorunurluk | null;
  alanlar: Alan[];
};

export type Adim = {
  id: string;
  sira: number;
  baslik: string;
  pomMetodu?: string;
  gorunurluk?: Gorunurluk | null;
  bolumler?: Bolum[];
  altModel?: AltModelBasvurusu;
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
  specDosyasi: string;
  pageObject: string;
  veriKaynaklari: Record<string, string>;
  kosullar: Record<string, AdlandirilmisKosul>;
  adimlar: Adim[];
  senaryoDuzeyi: { aciklama: string; alanlar: Alan[] };
  urunDuzeyi: Record<string, UrunDuzeyiAlani>;
  acenteBaglami?: {
    aciklama: string;
    pageObject?: string;
    veriKaynagi: string;
    alanlar: Alan[];
    bilinenProfiller: string[];
  };
  isKurallari: IsKurali[];
  bilinmeyenler: string[];
};

/** Yüklenmiş ve doğrulanmış model + başvurduğu alt modeller (dosya adı → alt model). */
export type YuklenmisEkranModeli = {
  model: EkranModeli;
  dosyaYolu: string;
  altModeller: Record<string, AltModel>;
};

// ---- Doğrulama yardımcıları ----

type Nesne = Record<string, unknown>;

function nesneMi(deger: unknown): deger is Nesne {
  return typeof deger === 'object' && deger !== null && !Array.isArray(deger);
}

function metinMi(deger: unknown): deger is string {
  return typeof deger === 'string' && deger.length > 0;
}

function listedeMi<T extends string>(liste: readonly T[], deger: unknown): deger is T {
  return typeof deger === 'string' && (liste as readonly string[]).includes(deger);
}

const ALAN_ANAHTARLARI = new Set<string>([
  'id', 'tip', 'etiket', 'secenekler', 'seceneklerDurumu', 'seceneklerKaynagi', 'bagimlilik', 'zorunlu',
  'benzersiz', 'varsayilan', 'yapilandirma', 'eslesme', 'konum', 'doldurucu', 'doldurucuParametreleri',
  'gorunurluk', 'form', 'dogrulama', 'altAlanlar', 'ekranAlanlari', 'altModel', 'varyantlar', 'akisPlani',
  'kimlikTuru', 'bicim', 'kabul', 'birim', 'hassas', 'ekrandaAlanDegil', 'sira', 'sonKontrol', 'kullanim',
  'excelSutunlari', 'durum', 'notlar'
]);
const ESLESME_ANAHTARLARI = new Set<string>(['senaryo', 'urun', 'kart', 'kimlikAlani', 'profilHavuzu', 'harici', 'donusum', 'not']);
const FORM_ANAHTARLARI = new Set<string>(['id', 'kontrol', 'etiket', 'secenekler', 'yardimciKontroller', 'not']);
const SECENEK_ANAHTARLARI = new Set<string>(['deger', 'metin', 'formMetni', 'senaryoDegeri', 'ekranDegerleri', 'secici', 'kosul']);
const ADIM_ANAHTARLARI = new Set<string>(['id', 'sira', 'baslik', 'pomMetodu', 'gorunurluk', 'bolumler', 'altModel']);
const BOLUM_ANAHTARLARI = new Set<string>(['id', 'baslik', 'pomMetodu', 'gorunurluk', 'alanlar']);
const EKRAN_ANAHTARLARI = new Set<string>([
  'semaSurumu', 'tur', 'id', 'ad', 'aciklama', 'ekranUrl', 'specDosyasi', 'pageObject', 'veriKaynaklari',
  'kosullar', 'adimlar', 'senaryoDuzeyi', 'urunDuzeyi', 'acenteBaglami', 'isKurallari', 'bilinmeyenler'
]);
const ALT_MODEL_ANAHTARLARI = new Set<string>([
  'semaSurumu', 'tur', 'id', 'ad', 'aciklama', 'pageObject', 'kullananlar', 'veriKaynaklari', 'bolumler',
  'ekranDisiAlanlar', 'bilinmeyenler'
]);

/** Doğrulama sırasında toplanan hatalar; hepsi tek seferde raporlanır. */
class HataToplayici {
  readonly hatalar: string[] = [];
  ekle(yer: string, mesaj: string): void {
    this.hatalar.push(`${yer}: ${mesaj}`);
  }
  bilinmeyenAnahtarlar(yer: string, nesne: Nesne, izinliler: Set<string>): void {
    for (const anahtar of Object.keys(nesne)) {
      if (!izinliler.has(anahtar)) this.ekle(yer, `bilinmeyen anahtar "${anahtar}"`);
    }
  }
}

function seceneklerDogrula(h: HataToplayici, yer: string, secenekler: unknown): void {
  if (!Array.isArray(secenekler)) {
    h.ekle(yer, 'secenekler bir dizi olmalı');
    return;
  }
  secenekler.forEach((secenek, i) => {
    const sYer = `${yer}[${i}]`;
    if (!nesneMi(secenek)) {
      h.ekle(sYer, 'seçenek bir nesne olmalı');
      return;
    }
    h.bilinmeyenAnahtarlar(sYer, secenek, SECENEK_ANAHTARLARI);
    if (!metinMi(secenek.deger)) h.ekle(sYer, '"deger" boş olmayan metin olmalı');
  });
}

function formDogrula(h: HataToplayici, yer: string, form: unknown): void {
  if (form === null || form === undefined) return;
  if (!nesneMi(form)) {
    h.ekle(yer, '"form" nesne ya da null olmalı');
    return;
  }
  h.bilinmeyenAnahtarlar(yer, form, FORM_ANAHTARLARI);
  if (!metinMi(form.id) || !form.id.startsWith('sof_')) h.ekle(yer, '"form.id" "sof_" ile başlamalı');
  if (!listedeMi(FORM_KONTROLLERI, form.kontrol)) h.ekle(yer, `bilinmeyen form kontrolü "${String(form.kontrol)}"`);
  if (form.secenekler !== undefined) seceneklerDogrula(h, `${yer}.secenekler`, form.secenekler);
  if (form.yardimciKontroller !== undefined) {
    if (!Array.isArray(form.yardimciKontroller)) {
      h.ekle(yer, '"yardimciKontroller" dizi olmalı');
    } else {
      form.yardimciKontroller.forEach((k: unknown, i) => {
        const kYer = `${yer}.yardimciKontroller[${i}]`;
        if (!nesneMi(k) || !metinMi(k.id) || !k.id.startsWith('sof_')) h.ekle(kYer, '"id" "sof_" ile başlamalı');
        else if (!listedeMi(FORM_KONTROLLERI, k.kontrol)) h.ekle(kYer, `bilinmeyen form kontrolü "${String(k.kontrol)}"`);
        else if (!metinMi(k.amac)) h.ekle(kYer, '"amac" zorunlu');
      });
    }
  }
}

/** Koşul ifadesinin biçimini doğrular; başvurduğu alan/koşul adlarını toplar. */
function kosulIfadesiDogrula(
  h: HataToplayici,
  yer: string,
  ifade: unknown,
  basvurular: { alanlar: Array<[string, string]>; senaryoAyarlari: Array<[string, string]> }
): void {
  if (!nesneMi(ifade)) {
    h.ekle(yer, 'koşul ifadesi bir nesne olmalı');
    return;
  }
  const anahtarlar = Object.keys(ifade).sort().join(',');
  switch (anahtarlar) {
    case 'alan,esit':
    case 'alan,icinde':
      if (!metinMi(ifade.alan)) h.ekle(yer, '"alan" metin olmalı');
      else basvurular.alanlar.push([yer, ifade.alan]);
      if ('icinde' in ifade && !Array.isArray(ifade.icinde)) h.ekle(yer, '"icinde" dizi olmalı');
      return;
    case 'esit,senaryoAyari':
      if (!metinMi(ifade.senaryoAyari)) h.ekle(yer, '"senaryoAyari" metin olmalı');
      else basvurular.senaryoAyarlari.push([yer, ifade.senaryoAyari]);
      return;
    case 've':
    case 'veya': {
      const liste = ifade[anahtarlar];
      if (!Array.isArray(liste) || liste.length === 0) h.ekle(yer, `"${anahtarlar}" boş olmayan dizi olmalı`);
      else liste.forEach((alt, i) => kosulIfadesiDogrula(h, `${yer}.${anahtarlar}[${i}]`, alt, basvurular));
      return;
    }
    case 'degil':
      kosulIfadesiDogrula(h, `${yer}.degil`, ifade.degil, basvurular);
      return;
    case 'acente':
      if (!nesneMi(ifade.acente) || !metinMi(ifade.acente.alanSeti)) h.ekle(yer, '"acente.alanSeti" metin olmalı');
      return;
    case 'calismaZamani':
      if (ifade.calismaZamani !== 'gorunurse') h.ekle(yer, '"calismaZamani" yalnızca "gorunurse" olabilir');
      return;
    default:
      h.ekle(yer, `tanınmayan koşul ifadesi (anahtarlar: ${anahtarlar || 'yok'})`);
  }
}

type Basvurular = {
  alanlar: Array<[string, string]>;
  senaryoAyarlari: Array<[string, string]>;
  kosullar: Array<[string, string]>;
  altModeller: Array<[string, AltModelBasvurusu]>;
};

function gorunurlukDogrula(h: HataToplayici, yer: string, gorunurluk: unknown, b: Basvurular): void {
  if (gorunurluk === null || gorunurluk === undefined) return;
  if (!nesneMi(gorunurluk)) {
    h.ekle(yer, '"gorunurluk" nesne ya da null olmalı');
    return;
  }
  const { not, ...geri } = gorunurluk;
  if (not !== undefined && typeof not !== 'string') h.ekle(yer, '"not" metin olmalı');
  const anahtarlar = Object.keys(geri);
  if (anahtarlar.length !== 1 || (anahtarlar[0] !== 'kosul' && anahtarlar[0] !== 'ifade')) {
    h.ekle(yer, '"gorunurluk" tam olarak bir "kosul" (ad) ya da "ifade" içermeli');
    return;
  }
  if (anahtarlar[0] === 'kosul') {
    if (!metinMi(geri.kosul)) h.ekle(yer, '"kosul" metin olmalı');
    else b.kosullar.push([yer, geri.kosul]);
  } else {
    kosulIfadesiDogrula(h, `${yer}.ifade`, geri.ifade, b);
  }
}

function altModelBasvurusuDogrula(h: HataToplayici, yer: string, deger: unknown, b: Basvurular): void {
  if (!nesneMi(deger) || !metinMi(deger.dosya) || !metinMi(deger.bolum) || Object.keys(deger).length !== 2) {
    h.ekle(yer, '"altModel" { dosya, bolum } olmalı');
    return;
  }
  b.altModeller.push([yer, { dosya: deger.dosya, bolum: deger.bolum }]);
}

/** Alanı (ve alt/ekran alanlarını) doğrular; id'leri kimlikler listesine ekler. */
function alanDogrula(h: HataToplayici, yer: string, alan: unknown, kimlikler: Array<[string, string]>, b: Basvurular): void {
  if (!nesneMi(alan)) {
    h.ekle(yer, 'alan bir nesne olmalı');
    return;
  }
  const aYer = `${yer}(${String(alan.id)})`;
  h.bilinmeyenAnahtarlar(aYer, alan, ALAN_ANAHTARLARI);
  if (!metinMi(alan.id) || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(alan.id)) h.ekle(aYer, '"id" harf/rakamdan oluşan boş olmayan metin olmalı');
  else kimlikler.push([aYer, alan.id]);
  if (!listedeMi(ALAN_TIPLERI, alan.tip)) h.ekle(aYer, `bilinmeyen alan tipi "${String(alan.tip)}"`);
  if (alan.yapilandirma !== undefined && !listedeMi(YAPILANDIRMA_TURLERI, alan.yapilandirma)) {
    h.ekle(aYer, `bilinmeyen yapilandirma "${String(alan.yapilandirma)}"`);
  }
  if (alan.doldurucu !== undefined && !listedeMi(DOLDURUCULAR, alan.doldurucu)) {
    h.ekle(aYer, `bilinmeyen doldurucu "${String(alan.doldurucu)}"`);
  }
  if (alan.seceneklerDurumu !== undefined && !listedeMi(SECENEK_DURUMLARI, alan.seceneklerDurumu)) {
    h.ekle(aYer, `bilinmeyen seceneklerDurumu "${String(alan.seceneklerDurumu)}"`);
  }
  if (alan.secenekler !== undefined && alan.secenekler !== null) seceneklerDogrula(h, `${aYer}.secenekler`, alan.secenekler);
  if (alan.etiket !== undefined && (!nesneMi(alan.etiket) || !('ekran' in alan.etiket))) {
    h.ekle(aYer, '"etiket" nesnesinde "ekran" anahtarı (bilinmiyorsa null) zorunlu');
  }
  if (alan.eslesme !== undefined) {
    if (!nesneMi(alan.eslesme)) {
      h.ekle(aYer, '"eslesme" nesne olmalı');
    } else {
      h.bilinmeyenAnahtarlar(`${aYer}.eslesme`, alan.eslesme, ESLESME_ANAHTARLARI);
      const senaryo = alan.eslesme.senaryo;
      if (senaryo !== undefined && !metinMi(senaryo) && !(Array.isArray(senaryo) && senaryo.length > 0 && senaryo.every(metinMi))) {
        h.ekle(aYer, '"eslesme.senaryo" metin ya da boş olmayan metin dizisi olmalı');
      }
    }
  }
  if (alan.yapilandirma === 'senaryo' && !(nesneMi(alan.eslesme) && (alan.eslesme.senaryo !== undefined || alan.eslesme.kart !== undefined))) {
    h.ekle(aYer, 'yapilandirma "senaryo" olan alanın "eslesme.senaryo" (ya da alt modelde "eslesme.kart") karşılığı olmalı');
  }
  if (alan.konum !== undefined) {
    if (!nesneMi(alan.konum) || !metinMi(alan.konum.secici) || !listedeMi(KIRILGANLIK_DUZEYLERI, alan.konum.kirilganlik)) {
      h.ekle(aYer, '"konum" { secici, kirilganlik: dusuk|orta|yuksek } içermeli');
    }
  }
  formDogrula(h, `${aYer}.form`, alan.form);
  gorunurlukDogrula(h, `${aYer}.gorunurluk`, alan.gorunurluk, b);
  if (alan.bagimlilik !== undefined) {
    if (!nesneMi(alan.bagimlilik)) {
      h.ekle(aYer, '"bagimlilik" nesne olmalı');
    } else {
      const hedefler = Array.isArray(alan.bagimlilik.alan) ? alan.bagimlilik.alan : [alan.bagimlilik.alan];
      for (const hedef of hedefler) {
        if (!metinMi(hedef)) h.ekle(aYer, '"bagimlilik.alan" metin ya da metin dizisi olmalı');
        else b.alanlar.push([`${aYer}.bagimlilik`, hedef]);
      }
      if (alan.bagimlilik.secenekHaritasi !== undefined) {
        if (!nesneMi(alan.bagimlilik.secenekHaritasi)) h.ekle(aYer, '"secenekHaritasi" nesne olmalı');
        else for (const [anahtar, liste] of Object.entries(alan.bagimlilik.secenekHaritasi)) {
          seceneklerDogrula(h, `${aYer}.bagimlilik.secenekHaritasi.${anahtar}`, liste);
        }
      }
    }
  }
  if (alan.altModel !== undefined) altModelBasvurusuDogrula(h, `${aYer}.altModel`, alan.altModel, b);
  if (Array.isArray(alan.varyantlar)) {
    for (const varyant of alan.varyantlar) {
      if (!nesneMi(varyant) || !nesneMi(varyant.alanlar)) continue;
      for (const [ad, altAlan] of Object.entries(varyant.alanlar)) {
        if (!nesneMi(altAlan) || !Array.isArray(altAlan.secenekler)) continue;
        seceneklerDogrula(h, `${aYer}.varyantlar.${ad}.secenekler`, altAlan.secenekler);
        for (const secenek of altAlan.secenekler) {
          if (nesneMi(secenek) && metinMi(secenek.kosul)) b.kosullar.push([`${aYer}.varyantlar.${ad}`, secenek.kosul]);
        }
      }
    }
  }
  for (const altListe of ['altAlanlar', 'ekranAlanlari'] as const) {
    const liste = alan[altListe];
    if (liste === undefined) continue;
    if (!Array.isArray(liste)) h.ekle(aYer, `"${altListe}" dizi olmalı`);
    else liste.forEach((alt, i) => alanDogrula(h, `${aYer}.${altListe}[${i}]`, alt, kimlikler, b));
  }
}

function bolumDogrula(h: HataToplayici, yer: string, bolum: unknown, bolumKimlikleri: Array<[string, string]>, kimlikler: Array<[string, string]>, b: Basvurular): void {
  if (!nesneMi(bolum)) {
    h.ekle(yer, 'bölüm bir nesne olmalı');
    return;
  }
  const bYer = `${yer}(${String(bolum.id)})`;
  h.bilinmeyenAnahtarlar(bYer, bolum, BOLUM_ANAHTARLARI);
  if (!metinMi(bolum.id)) h.ekle(bYer, '"id" zorunlu');
  else bolumKimlikleri.push([bYer, bolum.id]);
  if (!metinMi(bolum.baslik)) h.ekle(bYer, '"baslik" zorunlu');
  gorunurlukDogrula(h, `${bYer}.gorunurluk`, bolum.gorunurluk, b);
  if (!Array.isArray(bolum.alanlar) || bolum.alanlar.length === 0) h.ekle(bYer, '"alanlar" boş olmayan dizi olmalı');
  else bolum.alanlar.forEach((alan, i) => alanDogrula(h, `${bYer}.alanlar[${i}]`, alan, kimlikler, b));
}

function tekrarlananlar(kimlikler: Array<[string, string]>): Array<[string, string[]]> {
  const gruplar = new Map<string, string[]>();
  for (const [yer, id] of kimlikler) gruplar.set(id, [...(gruplar.get(id) ?? []), yer]);
  return [...gruplar.entries()].filter(([, yerler]) => yerler.length > 1);
}

function yeniBasvurular(): Basvurular {
  return { alanlar: [], senaryoAyarlari: [], kosullar: [], altModeller: [] };
}

function semaSurumunuDogrula(h: HataToplayici, yer: string, ham: Nesne, beklenenTur: string): void {
  if (ham.semaSurumu !== DESTEKLENEN_SEMA_SURUMU) {
    h.ekle(yer, `"semaSurumu" ${DESTEKLENEN_SEMA_SURUMU} olmalı (bulunan: ${String(ham.semaSurumu)})`);
  }
  if (ham.tur !== beklenenTur) h.ekle(yer, `"tur" "${beklenenTur}" olmalı`);
  if (!metinMi(ham.id)) h.ekle(yer, '"id" zorunlu');
}

// ---- Alt model ----

/** Alt model dosyasını okuyup doğrular; hatalıysa tüm sorunları listeleyen bir Error fırlatır. */
export function altModeliYukle(dosyaYolu: string): AltModel {
  const ham: unknown = JSON.parse(readFileSync(dosyaYolu, 'utf-8'));
  const h = new HataToplayici();
  const yer = dosyaYolu.split(/[\\/]/).pop() ?? dosyaYolu;
  if (!nesneMi(ham)) throw new Error(`${yer}: model bir JSON nesnesi olmalı.`);
  h.bilinmeyenAnahtarlar(yer, ham, ALT_MODEL_ANAHTARLARI);
  semaSurumunuDogrula(h, yer, ham, 'altModel');
  const b = yeniBasvurular();
  const kimlikler: Array<[string, string]> = [];
  const bolumKimlikleri: Array<[string, string]> = [];
  if (!Array.isArray(ham.bolumler) || ham.bolumler.length === 0) h.ekle(yer, '"bolumler" boş olmayan dizi olmalı');
  else ham.bolumler.forEach((bolum, i) => bolumDogrula(h, `${yer} bolumler[${i}]`, bolum, bolumKimlikleri, kimlikler, b));
  for (const [id, yerler] of [...tekrarlananlar(kimlikler), ...tekrarlananlar(bolumKimlikleri)]) {
    h.ekle(yer, `"${id}" id'si birden fazla kez kullanılmış: ${yerler.join(' | ')}`);
  }
  // Alt model kendi içinde koşul/alan başvurusu yapamaz (bağlamı kullanan ekran belirler).
  for (const [bYer, ad] of [...b.kosullar, ...b.alanlar, ...b.senaryoAyarlari]) {
    h.ekle(bYer, `alt model dış başvuru içeremez ("${ad}")`);
  }
  for (const [bYer] of b.altModeller) h.ekle(bYer, 'alt model başka bir alt modele başvuramaz');
  if (h.hatalar.length) throw new Error(`Alt model geçersiz (${h.hatalar.length} sorun):\n - ${h.hatalar.join('\n - ')}`);
  return ham as unknown as AltModel;
}

// ---- Ekran modeli ----

/**
 * Ekran modeli dosyasını (ve başvurduğu alt model dosyalarını) okuyup doğrular. Kurala
 * uymayan her şey toplanır ve TEK bir Türkçe Error'da listelenir.
 * Kontroller: şema sürümü/tür, bilinen anahtarlar, alan tipleri/yapılandırma/doldurucu/form
 * kontrol adları, alan-bölüm-adım id'lerinin benzersizliği, koşul ifadelerinin biçimi ve
 * başvurdukları alan/koşul/senaryo ayarlarının varlığı, alt model dosya+bölüm başvuruları,
 * iş kurallarının adımları, ürün düzeyi "kullanan" başvuruları, adım sıralarının 1..n olması.
 */
export function ekranModeliniYukle(dosyaYolu: string): YuklenmisEkranModeli {
  const ham: unknown = JSON.parse(readFileSync(dosyaYolu, 'utf-8'));
  const h = new HataToplayici();
  const yer = dosyaYolu.split(/[\\/]/).pop() ?? dosyaYolu;
  if (!nesneMi(ham)) throw new Error(`${yer}: model bir JSON nesnesi olmalı.`);
  h.bilinmeyenAnahtarlar(yer, ham, EKRAN_ANAHTARLARI);
  semaSurumunuDogrula(h, yer, ham, 'ekran');
  for (const anahtar of ['ad', 'aciklama', 'ekranUrl', 'specDosyasi', 'pageObject'] as const) {
    if (!metinMi(ham[anahtar])) h.ekle(yer, `"${anahtar}" zorunlu`);
  }

  const b = yeniBasvurular();
  const kimlikler: Array<[string, string]> = [];
  const bolumKimlikleri: Array<[string, string]> = [];
  const adimKimlikleri: Array<[string, string]> = [];

  // Koşullar
  const kosulAdlari = new Set<string>();
  if (!nesneMi(ham.kosullar)) {
    h.ekle(yer, '"kosullar" nesne olmalı');
  } else {
    for (const [ad, kosul] of Object.entries(ham.kosullar)) {
      kosulAdlari.add(ad);
      const kYer = `kosullar.${ad}`;
      if (!nesneMi(kosul)) {
        h.ekle(kYer, 'nesne olmalı');
        continue;
      }
      kosulIfadesiDogrula(h, `${kYer}.ifade`, kosul.ifade, b);
      if (kosul.hedefIfade !== undefined) kosulIfadesiDogrula(h, `${kYer}.hedefIfade`, kosul.hedefIfade, b);
    }
  }

  // Adımlar
  if (!Array.isArray(ham.adimlar) || ham.adimlar.length === 0) {
    h.ekle(yer, '"adimlar" boş olmayan dizi olmalı');
  } else {
    ham.adimlar.forEach((adim: unknown, i) => {
      const aYer = `adimlar[${i}]`;
      if (!nesneMi(adim)) {
        h.ekle(aYer, 'adım bir nesne olmalı');
        return;
      }
      const adYer = `${aYer}(${String(adim.id)})`;
      h.bilinmeyenAnahtarlar(adYer, adim, ADIM_ANAHTARLARI);
      if (!metinMi(adim.id)) h.ekle(adYer, '"id" zorunlu');
      else adimKimlikleri.push([adYer, adim.id]);
      if (adim.sira !== i + 1) h.ekle(adYer, `"sira" ${i + 1} olmalı (adımlar akış sırasıyla yazılır)`);
      if (!metinMi(adim.baslik)) h.ekle(adYer, '"baslik" zorunlu');
      gorunurlukDogrula(h, `${adYer}.gorunurluk`, adim.gorunurluk, b);
      const bolumVar = adim.bolumler !== undefined;
      const altModelVar = adim.altModel !== undefined;
      if (bolumVar === altModelVar) h.ekle(adYer, 'adımda "bolumler" YA DA "altModel" olmalı (ikisi birden/hiçbiri değil)');
      if (bolumVar) {
        if (!Array.isArray(adim.bolumler) || adim.bolumler.length === 0) h.ekle(adYer, '"bolumler" boş olmayan dizi olmalı');
        else adim.bolumler.forEach((bolum, j) => bolumDogrula(h, `${adYer}.bolumler[${j}]`, bolum, bolumKimlikleri, kimlikler, b));
      }
      if (altModelVar) altModelBasvurusuDogrula(h, `${adYer}.altModel`, adim.altModel, b);
    });
  }

  // Senaryo düzeyi
  const senaryoAyarAdlari = new Set<string>();
  if (!nesneMi(ham.senaryoDuzeyi) || !Array.isArray(ham.senaryoDuzeyi.alanlar)) {
    h.ekle(yer, '"senaryoDuzeyi.alanlar" dizi olmalı');
  } else {
    ham.senaryoDuzeyi.alanlar.forEach((alan: unknown, i) => {
      if (nesneMi(alan) && metinMi(alan.id)) senaryoAyarAdlari.add(alan.id);
      alanDogrula(h, `senaryoDuzeyi.alanlar[${i}]`, alan, kimlikler, b);
    });
  }

  // Acente bağlamı (ayrı ekran; id'leri ayrı ad alanında tutulur)
  if (ham.acenteBaglami !== undefined) {
    if (!nesneMi(ham.acenteBaglami) || !Array.isArray(ham.acenteBaglami.alanlar)) {
      h.ekle(yer, '"acenteBaglami.alanlar" dizi olmalı');
    } else {
      const acenteKimlikleri: Array<[string, string]> = [];
      ham.acenteBaglami.alanlar.forEach((alan: unknown, i) => alanDogrula(h, `acenteBaglami.alanlar[${i}]`, alan, acenteKimlikleri, b));
      for (const [id, yerler] of tekrarlananlar(acenteKimlikleri)) h.ekle('acenteBaglami', `"${id}" birden fazla kez: ${yerler.join(' | ')}`);
    }
  }

  // Alt modeller (dosya başvuruları)
  const altModeller: Record<string, AltModel> = {};
  for (const [bYer, basvuru] of b.altModeller) {
    if (!(basvuru.dosya in altModeller)) {
      try {
        altModeller[basvuru.dosya] = altModeliYukle(join(dirname(dosyaYolu), basvuru.dosya));
      } catch (hata) {
        h.ekle(bYer, `alt model "${basvuru.dosya}" yüklenemedi: ${hata instanceof Error ? hata.message : String(hata)}`);
        continue;
      }
    }
    const altModel = altModeller[basvuru.dosya];
    if (altModel && !altModel.bolumler.some((bolum) => bolum.id === basvuru.bolum)) {
      h.ekle(bYer, `alt model "${basvuru.dosya}" içinde "${basvuru.bolum}" bölümü yok`);
    }
    if (altModel && !altModel.kullananlar.includes(String(ham.id))) {
      h.ekle(bYer, `alt model "${basvuru.dosya}" > kullananlar listesinde "${String(ham.id)}" yok`);
    }
  }

  // Benzersizlik
  for (const [id, yerler] of tekrarlananlar(kimlikler)) h.ekle(yer, `alan id'si "${id}" birden fazla kez kullanılmış: ${yerler.join(' | ')}`);
  for (const [id, yerler] of tekrarlananlar(bolumKimlikleri)) h.ekle(yer, `bölüm id'si "${id}" birden fazla kez: ${yerler.join(' | ')}`);
  for (const [id, yerler] of tekrarlananlar(adimKimlikleri)) h.ekle(yer, `adım id'si "${id}" birden fazla kez: ${yerler.join(' | ')}`);

  // Başvurular
  const alanKumesi = new Set(kimlikler.map(([, id]) => id));
  const adimKumesi = new Set(adimKimlikleri.map(([, id]) => id));
  for (const [bYer, ad] of b.alanlar) if (!alanKumesi.has(ad)) h.ekle(bYer, `başvurulan alan "${ad}" modelde yok`);
  for (const [bYer, ad] of b.kosullar) if (!kosulAdlari.has(ad)) h.ekle(bYer, `başvurulan koşul "${ad}" kosullar içinde yok`);
  for (const [bYer, ad] of b.senaryoAyarlari) if (!senaryoAyarAdlari.has(ad)) h.ekle(bYer, `başvurulan senaryo ayarı "${ad}" senaryoDuzeyi içinde yok`);

  // İş kuralları
  if (!Array.isArray(ham.isKurallari)) {
    h.ekle(yer, '"isKurallari" dizi olmalı');
  } else {
    const kuralB = yeniBasvurular();
    ham.isKurallari.forEach((kural: unknown, i) => {
      const kYer = `isKurallari[${i}]`;
      if (!nesneMi(kural) || !metinMi(kural.id) || !metinMi(kural.mesaj) || !metinMi(kural.adim)) {
        h.ekle(kYer, '{ id, adim, kosul, mesaj } zorunlu');
        return;
      }
      if (!adimKumesi.has(kural.adim)) h.ekle(kYer, `adım "${kural.adim}" adimlar içinde yok`);
      kosulIfadesiDogrula(h, `${kYer}.kosul`, kural.kosul, kuralB);
      if (kural.gecerlilik !== undefined) gorunurlukDogrula(h, `${kYer}.gecerlilik`, kural.gecerlilik, kuralB);
    });
    for (const [bYer, ad] of kuralB.alanlar) if (!alanKumesi.has(ad)) h.ekle(bYer, `başvurulan alan "${ad}" modelde yok`);
    for (const [bYer, ad] of kuralB.kosullar) if (!kosulAdlari.has(ad)) h.ekle(bYer, `başvurulan koşul "${ad}" yok`);
    for (const [bYer, ad] of kuralB.senaryoAyarlari) if (!senaryoAyarAdlari.has(ad)) h.ekle(bYer, `senaryo ayarı "${ad}" yok`);
  }

  // Ürün düzeyi
  if (!nesneMi(ham.urunDuzeyi)) {
    h.ekle(yer, '"urunDuzeyi" nesne olmalı');
  } else {
    for (const [ad, deger] of Object.entries(ham.urunDuzeyi)) {
      if (!nesneMi(deger) || !metinMi(deger.tip)) {
        h.ekle(`urunDuzeyi.${ad}`, '{ tip } zorunlu');
        continue;
      }
      if (deger.kullanan !== undefined && (!metinMi(deger.kullanan) || !alanKumesi.has(deger.kullanan))) {
        h.ekle(`urunDuzeyi.${ad}`, `"kullanan" ("${String(deger.kullanan)}") modelde bir alan olmalı`);
      }
    }
  }

  if (!Array.isArray(ham.bilinmeyenler)) h.ekle(yer, '"bilinmeyenler" dizi olmalı');

  if (h.hatalar.length) {
    throw new Error(`Ekran modeli geçersiz: ${dosyaYolu} (${h.hatalar.length} sorun):\n - ${h.hatalar.join('\n - ')}`);
  }
  return { model: ham as unknown as EkranModeli, dosyaYolu, altModeller };
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
 * Senaryo JSON'unda (jetSeyahat.senaryolar[i]) BİLİNEN üst düzey anahtarlar → modeldeki alan.
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

// ---- JetSeyahat modeli (önbellekli) ----

let jetSeyahatOnbellegi: YuklenmisEkranModeli | undefined;

/** tests/ekran-modelleri/jet-seyahat.model.json — bir kez yüklenip doğrulanır, sonra önbellekten. */
export function jetSeyahatModeliniYukle(): YuklenmisEkranModeli {
  jetSeyahatOnbellegi ??= ekranModeliniYukle(join(EKRAN_MODELLERI_KLASORU, 'jet-seyahat.model.json'));
  return jetSeyahatOnbellegi;
}
