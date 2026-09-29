// scripts/platform/sonuclar/donem-raporu.mjs için tip bildirimi (testlerde kullanılan kısım).
import type { Veritabani } from '../veritabani/baglanti.mjs';
import type { DonemSecimi } from './donem.mjs';

export type RaporKapsami = 'ekran' | 'servis' | 'coklu-ekran' | 'coklu-servis' | 'karisik' | 'genel';
export type RaporGirdisi = {
  projeId: string; kapsam: RaporKapsami; id: string; ekranIdleri?: string[]; servisIdleri?: string[]; tumEkranlar?: boolean; tumServisler?: boolean;
  donem: DonemSecimi; karsilastir: boolean; ortamId: string | null;
  secenekler: { hatalar: boolean; adres: boolean; goruntuler: boolean }; aksiyonSayisi?: number;
};
export type RaporBaglami = {
  maskele: (m: unknown) => string; simdi?: Date;
  goruntuCoz?: (medya: Array<{ id: string; ad: string; icerikTuru: string; boyut: number }>) => Promise<Array<{ ad: string; icerikTuru: string; base64: string }>>;
};
export type RaporSorunu = {
  imza: string; tur: 'ekran' | 'servis'; ogeId: string; ogeAd: string; baglanti?: string; baslik: string; nerede: string; kalip: string; kategori: string | null; hataTuru: string | null;
  sinif: string; dayanak: string; durum: string; n: number; nOnceki: number; maruz: number; maruzOnceki: number; oran: number; oranOnceki: number;
  senaryo: number; seri: number[]; oncekiSeri: number[]; ilk: string | null; son: string | null; acikGun: number; tekrarRozeti: boolean;
  puan: number; bant: 'P1' | 'P2' | 'P3'; aksiyon: string; sahip: string; neden: string;
};
export type AksiyonSatiri = {
  baslik: string; nerede: string; sinif: string; durum: string; puan: number; bant: string; aksiyon: string; sahip: string; neden: string; tur?: string;
  imza?: string; baglanti?: string;
};
export type EgilimKovasi = { etiket: string; adet: number; kalan: number; oran: number | null };
export type Rozet = { durum: 'saglikli' | 'dikkat' | 'kritik'; gerekce: string };
export type SorunKisa = { imza: string; baslik: string; nerede: string; durum: string; n: number; puan: number; bant: string };
export type SirayaGirenOge = { rozet: Rozet; sira: number; basari: number | null; oncekiBasari: number | null; acikSorun: number; kotulesen: number; p1: number;
  oranSeri: Array<number | null>; son: string | null };
export type EkranKiyasi = SirayaGirenOge & {
  /** Genel raporda: modeli ortak akış olan ekran. */
  ortakAkis?: boolean;
  id: string; ad: string; senaryo: number; test: number; oncekiTest: number | null; basarisiz: number; oncekiBasarisiz: number | null; atlanan: number; tamKosu: number;
  kapsam: { senaryo: number; kosuyaDahil: number; hicKosmayan: number; hepAtlanan: number; modelSurumu: { surum: number; tarih: string } | null };
};
export type ServisKiyasi = SirayaGirenOge & {
  id: string; ad: string; tur: string; metot: number; senaryo: number; cagri: number; oncekiCagri: number | null; kalan: number; oncekiKalan: number | null;
  p95: number | null; oncekiP95: number | null; yavaslayan: number;
};
export type EkranTarafiOzeti = {
  basari: number | null; oncekiBasari: number | null; test: number; oncekiTest: number | null; basarisiz: number; oncekiBasarisiz: number | null; atlanan: number;
  tamKosu: number; oncekiTamKosu: number; ortSure: number | null; oncekiOrtSure: number | null; kararsizSenaryo: number; oncekiKararsizSenaryo: number | null;
  acikSorun: number; ogeSayisi: number; senaryoSayisi: number; hatasizOge: number; oncekiHatasizOge: number | null; tumSonuc: number; tekilSonuc: number;
};
export type ServisTarafiOzeti = {
  basari: number | null; oncekiBasari: number | null; cagri: number; oncekiCagri: number | null; kalan: number; oncekiKalan: number | null;
  enYavas: { metot: string; p95: number | null; oncekiP95: number | null } | null; yavaslayan: number; acikSorun: number; kararsizSenaryo: number;
  ogeSayisi: number; metotSayisi: number; senaryoSayisi: number; hatasizOge: number; akisKosu: number; akisBasari: number | null;
};
export type AkisSatiri = { id: string; ad: string; tur: string; adim: number; kosu: number; basarili: number; oncekiKosu: number; oncekiBasarili: number; basari: number | null; oncekiBasari: number | null; ortSure: number | null; son: string | null };
export type MetotSatiri = { ad: string; senaryo: number; cagri: number; basari: number | null; oncekiBasari: number | null; p50: number | null; p95: number | null;
  p99: number | null; n: number; oncekiP95: number | null; yavas: boolean; son: string | null; kalan: number };
export type CokluBolumler = {
  ekranTarafi: { ozet: EkranTarafiOzeti; egilim: { kovalar: EgilimKovasi[]; oncekiOrt: number | null }; ogeler: EkranKiyasi[] } | null;
  servisTarafi: {
    ozet: ServisTarafiOzeti; egilim: { kovalar: EgilimKovasi[]; oncekiOrt: number | null }; ogeler: ServisKiyasi[];
    metotlar: Array<MetotSatiri & { servis: string; servisId: string }>;
    yavaslayanlar: Array<{ servis: string; metot: string; oncekiP95: number | null; p95: number | null; n: number }>;
    hataMatrisi: Array<{ servis: string; metot: string; sayilar: Record<string, number>; toplam: number; onceki: number }>;
    sureEgilimi: { p50: Array<number | null>; p95: Array<number | null>; oncekiP95: number | null };
  } | null;
  akislar: AkisSatiri[];
  sinifDagilimi: Array<{ id: string; ad: string; tur: 'ekran' | 'servis'; sayilar: Record<string, number>; toplam: number }>;
  enCokAdim: SorunKisa[];
  baglantili: Array<{ ekran: SorunKisa; servis: SorunKisa; ortak: number; birlesim: number; jaccard: number; birlesti: boolean }>;
};
export type ZamanlanmisKural = {
  ad: string; zaman: string; ortam: string | null; riskli: boolean; etkin: boolean; kapsam: string;
  beklenen: number | null; kayit: number; tamamlandi: number; basarisizSonuclu: number; atlandi: number; yarida: number; hata: number;
  kacan: number | null; guvenilirlik: number | null; kisitli: boolean; bas: number; bit: number;
  oncekiGuvenilirlik: number | null; oncekiBeklenen: number | null; oncekiTamamlandi: number;
};
/** Genel rapora (A3) özgü bölümler. */
export type GenelBolumler = {
  ozet: { ekranSayisi: number; ortakAkisSayisi: number; servisSayisi: number; akisSayisi: number; uctanUcaSayisi: number; kuralSayisi: number };
  akis: { sayi: number; uctanUca: number; kosu: number; basari: number | null; oncekiKosu: number; oncekiBasari: number | null };
  zamanlanmis: {
    kurallar: ZamanlanmisKural[]; beklenen: number; tamamlandi: number; guvenilirlik: number | null; oncekiGuvenilirlik: number | null;
    kisitli: boolean; atlandi: number; yarida: number;
  };
  kararsiz: { liste: Array<{ tur: 'ekran' | 'servis'; ad: string; oge: string; kosu: number; degisim: number; oran: number; durum: string }>; kararsiz: number; izlenir: number };
  testVerisi: {
    hesaplandi: boolean; kirik: number; kirikOrnekler: Array<{ yer: string; basvuru: string; neden: string }>; kullanilmayan: number; benzer: number;
    bosSutun: number; kaynakliSonuc: number; oncekiKaynakliSonuc: number; bulgu: number;
  };
  kapsam: {
    kosuyaDahil: number; donemdeKosan: number; hepAtlanan: number; metot: { toplam: number; senaryolu: number; servis: number } | null; olculmeyenServis: number;
    kuralliEkran: number; kosulanEkran: number; kuralliAkis: number; akis: number; aciklar: Array<{ tur: string; yer: string; oneri: string }>; acikSayisi: number;
  };
  ortamlar: Array<{ id: string; ad: string; riskli: boolean; test: number; ekranBasari: number | null; cagri: number; servisBasari: number | null }> | null;
};
export type DonemRaporuVerisi = {
  tur: RaporKapsami; olusturma: string; proje: { id: string; ad: string }; ortam: { id: string; ad: string; adres: string | null } | null;
  karsilastir: boolean; secenekler: { hatalar: boolean; adres: boolean; goruntuler: boolean }; esikler: { yesil: number; sari: number };
  donem: { tur: string; gun: number; etiket: string; oncekiEtiket: string; kirilim: 'gunluk' | 'haftalik'; bas: string; bit: string; kovaEtiketleri: string[]; oncekiKovaEtiketleri: string[] };
  oge: { id: string; ad: string; senaryoSayisi: number; servisTuru?: string; metotSayisi?: number };
  kosuVar: boolean; ozet: Record<string, any>; sorunlar: RaporSorunu[]; aksiyonlar: AksiyonSatiri[];
  bantSayim: { P1: number; P2: number; P3: number }; durumSayim: Record<string, number>; rozet: Rozet;
  maddeler: Array<['iyi' | 'kotu' | 'oneri', string]>; egilim: { kovalar: EgilimKovasi[]; oncekiOrt: number | null };
  secilenler?: { ekranlar: Array<{ id: string; ad: string }>; servisler: Array<{ id: string; ad: string; tur: string }>; tumEkranlar: boolean; tumServisler: boolean; eksik: number };
  coklu?: CokluBolumler;
  genel?: GenelBolumler;
  ekran?: {
    senaryolar: Array<{ anahtar: string; ad: string; kosu: number; basari: number | null; oncekiBasari: number | null; hepAtlandi: boolean; hicKosmadi: boolean;
      ortSure: number | null; p95: number | null; kararlilik: { durum: string; oran: number; kosu: number; degisim: number } | null }>;
    matris: { etiketler: string[]; satirlar: Array<{ ad: string; dizi: string; not: string }> };
    isiHaritasi: Array<{ ad: string; seri: number[] }>;
    sonHata: { senaryo: string; adim: string; zaman: string | null; ortam: string | null; beklenen: string | null; gorulen: string | null; metin: string;
      goruntuler: Array<{ ad: string; icerikTuru: string; base64: string }> } | null;
    yakalanan: Array<{ kaynak: string; kalip: string; sayi: number; test: number; kalanTest: number }>;
    kapsam: { senaryo: number; kosuyaDahil: number; hicKosmayan: number; hepAtlanan: number; modelSurumu: { surum: number; tarih: string } | null };
  };
  servis?: {
    metotlar: Array<{ ad: string; senaryo: number; cagri: number; basari: number | null; oncekiBasari: number | null; p50: number | null; p95: number | null;
      p99: number | null; n: number; oncekiP95: number | null; yavas: boolean; son: string | null; kalan: number }>;
    hataMatrisi: Array<{ metot: string; sayilar: Record<string, number>; toplam: number; onceki: number }>;
    sureEgilimi: { p50: Array<number | null>; p95: Array<number | null>; oncekiP95: number | null };
    kontrolTurleri: Array<{ tur: string; etiket: string; toplam: number; gecen: number }>;
    kalanKontroller: Array<{ etiket: string; sayi: number }>;
    akislar: AkisSatiri[];
  };
};
export declare const EN_COK_OGE: number;
export declare const EN_COK_GENEL_OGE: number;
export declare const KONTROL_ETIKETLERI: Readonly<Record<string, string>>;
export declare function kontrolEtiketi(k: { tur?: unknown; ad?: unknown }): string;
export declare function servisMetodu(icerik: Record<string, unknown> | undefined): string;
export declare function servisHatasi(durum: string, sonuc: Record<string, unknown>, maskele: (m: unknown) => string): { hataTuru: string; kalip: string };
export declare function donemRaporuVerisi(vt: Veritabani, g: RaporGirdisi, b: RaporBaglami): Promise<DonemRaporuVerisi>;
