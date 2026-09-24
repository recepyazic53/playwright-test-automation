import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BeklenenSonucAlanlari } from './beklenen-sonuc';
import type { EnvironmentName } from './environments';
import { platformVerisi } from './platform-veri';

export type SelectData = {
  deger: string;
  metin: string;
};

export type OzelKimlikData = {
  tcKimlikNo: string;
  dogumTarihi: string;
  cepTelefonu: string;
};

export type TuzelKimlikData = {
  vergiKimlikNo: string;
  cepTelefonu: string;
};

export type PasaportKimlikData = {
  pasaportNo: string;
  dogumTarihi: string;
  uyruk: string;
  cepTelefonu: string;
  ad: string;
  soyad: string;
  babaAdi: string;
  dogumYeri: string;
  cinsiyet: 'erkek' | 'kadin';
};

export type YabanciKimlikData = {
  yabanciKimlikNo: string;
  dogumTarihi: string;
  uyruk: string;
  cepTelefonu: string;
};

export type OrtakAdresData = {
  il: SelectData;
  ilce: SelectData;
  belde: SelectData;
  cadde: string;
  sokak: string;
  adresTipi: SelectData;
  adresParcasi: string;
  mahalle: string;
  binaNo: string;
  blokKodu: string;
  siteAdi: string;
  daireNo: string;
  kat: string;
};

export type KrediKartiOdemeData = {
  isim: string;
  soyisim: string;
  kartNo: string;
  guvenlikKodu: string;
  sonKullanmaAyi: SelectData;
  sonKullanmaYili: SelectData;
  taksit: SelectData;
  beklenenHataMesaji: string;
};

// Senaryoya özel ödeme kartı (dashboard > "Senaryo Oluştur" > "Ödeme bilgileri"). Ortak
// karttan (ortak.json > odeme.krediKarti) farkı yalnızca beklenenHataMesaji'nin olmaması:
// o alan bazı ürünlerin (konut/ilk ateş) ödeme sonucu kontrolünde kullanılır, kartı forma
// girmek için gerekmez. kartBilgileriniGir bu tipi kabul eder — ortak kart da buna uyar.
export type SenaryoKrediKartiData = Omit<KrediKartiOdemeData, 'beklenenHataMesaji'>;

// Tek bir acente/kullanıcı profili (Acente Partajı + Acente Kullanıcısı).
// Ürün ekranları arasında ortak kullanılır; her acentede görünen alan seti farklı olabilir
// (örn. 30856 acentesinde COVID teminatı, kayak teminatı, plan kodu, seyahat iptal bedeli yok).
export type AcenteProfili = {
  acentePartaji: string;
  acentePartajiSecenegi: string;
  acenteKullanicisi: string;
  // Bazı acentelerde JetKasko YK ekranındaki "Yetkili İndirimi %" alanı açık geliyor.
  // Bu acenteyle test edilirken kullanılacak indirim yüzdesi (örn. "JetKaskoYetkiliİndirimli"
  // profili). Alan kapalıysa POM bu değeri zaten atlar.
  yetkiliIndirimi?: string;
};

export type OrtakTestData = {
  login: {
    basariliGirisSonrasiUrl: string;
    basariGostergeMetni: string;
  };
  // Anahtar = acente profil adı (örn. "varsayilan", "VarsayılanAcente").
  // testBaslangiciniHazirla varsayılan olarak "varsayilan" profilini kullanır;
  // farklı bir acenteyle test etmek için acenteProfili parametresi geçilir.
  kullaniciDegistir: Record<string, AcenteProfili>;
  kimlikBilgileri: {
    ozel: Record<string, OzelKimlikData>;
    tuzel: Record<string, TuzelKimlikData>;
    pasaport: Record<string, PasaportKimlikData>;
    yabanciKimlik: Record<string, YabanciKimlikData>;
  };
  adresBilgileri: Record<string, OrtakAdresData>;
  odeme: {
    krediKarti: KrediKartiOdemeData;
  };
};

export type Proposal2026Package1Data = {
  aktif: boolean;
  senaryoBasligi: string;
  sigortaliTipi: string;
  plakaIlKodu: string;
  plakaNo: string;
  sigortaEttiren: string;
  tescilBelgeSeriNo: string;
  markaKodu: string;
  aracMarkasi: SelectData;
  aracModeli: SelectData;
  yolcuSayisi: string;
  sinif: SelectData;
  kullanim: SelectData;
  baslangicTarihi: string;
  dainIMurtehin: string;
  lpg: string;
  digerAksesuarlar: string;
  immKademesi: SelectData;
  immManeviTazminat: string;
  ferdiKazaKoltuk: SelectData;
  tedaviMasraflari: string;
  hukuksalKoruma: SelectData;
  camMuafiyetiKaldirilsin: SelectData;
  meslek: SelectData;
  urun: SelectData;
  beklenenMesaj: string;
};

export type JetKaskoTestData = {
  jetKasko: {
    proposal2026Package1SigortaliEttirenAyni: Proposal2026Package1Data;
  };
};

// JetKasko "YK" (Yeni Kayıt) akışı: Plaka alanına "YK" yazılınca ekran tescilsiz/yeni
// araç moduna geçiyor (sitenin isPlateYK() fonksiyonu Plaka İl Kodu veya Plaka No "YK"
// ile başlıyorsa true dönüyor) ve araç bilgileri tescil sorgusu yerine elle (marka kodu
// sorgusuyla) giriliyor.
export type JetKaskoYkAracData = {
  plakaIlKodu: string;
  plakaNo: string;
  modelYili: string;
  markaKodu: string;
  motorNo: string;
  sasiNo: string;
  aracTipi: SelectData;
  sinif: SelectData;
  kullanim: SelectData;
};

export type JetKaskoYkTestData = {
  jetKaskoYk: {
    aktif: boolean;
    kabulEdilenOdemeSonuclari: string[];
    araclar: {
      ozelOtomobil: JetKaskoYkAracData;
      kamyon: JetKaskoYkAracData;
    };
    senaryolar: Array<{
      baslik: string;
      arac: 'ozelOtomobil' | 'kamyon';
      sigortaliTipi: 'ozel' | 'tuzel';
      // sigortaliTipi "ozel" ise kimlikBilgileri.ozel, "tuzel" ise kimlikBilgileri.tuzel
      // altındaki profil anahtarı.
      sigortaliProfili: string;
      ettiren: 'ayni' | 'farkliOzel' | 'farkliTuzel';
      ettirenProfili?: string;
      // Belirtilmezse testBaslangiciniHazirla "varsayilan" profili kullanır. Acentenin
      // "Yetkili İndirimi %" alanına girilecek değer de (varsa) bu profilin
      // ortak.json > kullaniciDegistir altındaki yetkiliIndirimi alanından okunur.
      acenteProfili?: string;
      // KaskoTur radio grubundan seçilecek ürün. İki şekilde yazılabilir:
      //   - Kısa kod: "1" | "2" | "3" | "4" | "5" (jet-kasko.page.ts >
      //     JETKASKO_URUN_KODLARI eşlemesine bakın)
      //     1 = GENİŞLETİLMİŞ KASKO(İKAME+YOL YARD.)
      //     2 = MAVİ KASKO(Dar)
      //     3 = GÜLÜMSETEN KASKO(YOL YARD.)
      //     4 = GENİŞLETİLMİŞ KASKO(YOL YARD.)
      //     5 = GÜLÜMSETEN KASKO(İKAME+YOL YARD.)
      //   - Ürünün tam adı (örn. "GÜLÜMSETEN KASKO(YOL YARD.)")
      // "value" özelliği senaryoya göre değişebildiği için seçim ürün adına göre
      // yapılıyor, kod/ad DOM sırasına bağlı değil. Belirtilmezse JetKaskoPage.urunSecYk
      // varsayılan olarak "4" (GENİŞLETİLMİŞ KASKO(YOL YARD.))yı seçer.
      urunAdi?: string;
    }>;
  };
};

export type JetIlkAtesKonutTestData = {
  jetIlkAtesKonut: {
    aktif: boolean;
    adresKodu: string;
    binaInsaYili: string;
    alternatif: SelectData;
    esyaYanginBedeli: string;
    ekTeminatBedeli: string;
    yapiTarzi: SelectData;
    profiller: {
      sigortaliOzel: string;
      sigortaliTuzel: string;
      farkliOzel: string;
      farkliTuzel: string;
    };
  };
};

export type JetDaskTestData = {
  jetDask: {
    aktif: boolean;
    adresKodu: string;
    kabulEdilenOdemeSonuclari: string[];
    sigortaEttirenSifatlari: {
      malSahibi: SelectData;
      kiraci: SelectData;
    };
    tapu: {
      ada: string;
      sayfaNo: string;
      pafta: string;
      bagimsizBolum: string;
      parsel: string;
    };
    brutYuzolcum: string;
    kullanimSekli: SelectData;
    insaTarzi: SelectData;
    insaYili: SelectData;
    toplamKat: SelectData;
    oncekiHasar: SelectData;
    bulunduguKat: SelectData & { testOrtamSecenekWorkaround: boolean };
    dainiMurtehin: 'yok';
    profiller: {
      sigortaliOzel: string;
      sigortaliTuzel: string;
      sigortaliPasaport: string;
    };
  };
};

export type JetSaglikTestData = {
  jetSaglik: {
    aktif: boolean;
    policeSuresi: SelectData;
    hastalik: SelectData;
    kvkkOnayi: SelectData;
    yenileme: SelectData;
    indirimOrani: string;
    kabulEdilenOdemeSonuclari: string[];
    profiller: {
      sigortaliYabanciKimlik: string;
      sigortaliPasaport: string;
      sigortaliPasaportAdresi: string;
      farkliOzel: string;
      farkliTuzel: string;
      farkliPasaport: string;
    };
  };
};

export type JetKonutTestData = {
  jetKonut: {
    aktif: boolean;
    adresKodu: string;
    binaTipi: SelectData;
    brutYuzolcum: string;
    daskaBagli: 'evet' | 'hayir';
    dainiMurtehin: 'var' | 'yok';
    alternatifPlus: SelectData;
    alternatif: SelectData;
    yapiTarzi: SelectData;
    toplamKat: SelectData;
    rizikonunBulunduguKat: SelectData;
    catiTipi: SelectData;
    altmisGundenFazlaBos: 'evet' | 'hayir';
    binaInsaYili: string;
    teminatlar: {
      binaYangin: string;
      esyaYangin: string;
      dahiliDekorasyonYangin: string;
      camKirilmasi: string;
      esyaDeprem: boolean;
      dahiliDekorasyonDeprem: boolean;
      hirsizlik: boolean;
      binaSabitKiymetHirsizlik: boolean;
      ferdiKazaTekLimit: SelectData;
      hukuksalKoruma: SelectData;
      enflasyonOrani: SelectData;
    };
    profiller: {
      sigortaliOzel: string;
      sigortaliTuzel: string;
      farkliOzel: string;
      farkliTuzel: string;
    };
  };
};

export type JetKobiTestData = {
  jetKobi: {
    aktif: boolean;
    adresKodu: string;
    binaTipi: SelectData;
    brutYuzolcum: string;
    daskaBagli: 'evet' | 'hayir';
    dainiMurtehin: 'var' | 'yok';
    isciSayisi: string;
    isverenMaliMesuliyeti: SelectData;
    ucuncuSahisMaliMesuliyeti: SelectData;
    yapiTarzi: SelectData;
    istigalTipi: SelectData;
    istigalCinsi: SelectData;
    toplamKat: SelectData;
    rizikonunBulunduguKat: SelectData;
    catiTipi: SelectData;
    binaInsaYili: string;
    ferdiKazaTeminati: SelectData;
    kabulEdilenOdemeSonuclari: string[];
    teminatlar: {
      binaYangin: string;
      sigortaliyaAitEmtea: string;
      ucuncuSahsaAitEmtea: string;
      demirbas: string;
      makine: string;
      kasa: string;
      dahiliDekorasyon: string;
      urunSorumluluk: string;
      isDurmasi: string;
      dekorasyonHirsizlik: string;
      camKirilmasi: string;
      yanginVeGuvenlikOnlemleri: string;
    };
    profiller: {
      sigortaliOzel: string;
      sigortaliTuzel: string;
      farkliOzel: string;
      farkliTuzel: string;
    };
  };
};

export type JetSeyahatTestData = {
  jetSeyahat: {
    aktif: boolean;
    urunKodu: string;
    seyahatSuresiGun: number;
    ulke: SelectData;
    seyahatIptalBedeli: SelectData;
    plan: SelectData;
    sigortaliSayisi: string;
    sigortaliProfili: string;
    cokluSorguDosyasi: string;
    cokluSorguKisiSayisi: number;
    kabulEdilenOdemeSonuclari: string[];
    senaryolar: Array<BeklenenSonucAlanlari & {
      baslik: string;
      kapsam: string;
      alternatif: string;
      // Acentenin ekranında görünmüyorsa (ör. 30856) zorunlu değildir — bkz. ekran modeli
      // kosullar.acenteAlanSetiTam ve scripts/dogrulama/senaryo-dogrulayici.mjs.
      covidTeminati?: 'E' | 'H';
      sorguTipi: 'tekli' | 'coklu';
      ettiren: 'ayni' | 'farkliOzel' | 'farkliTuzel';
      // Hazır bir profil (ortak.json > kimlikBilgileri.ozel/tuzel altındaki anahtar,
      // ör. "tc1", "vkn1") kullanmak için doldurulur.
      ettirenProfili?: string;
      // YENİ (dashboard > "Senaryo Oluştur"): hazır bir profil seçmek yerine, bu SENARYOYA
      // ÖZEL yeni bir kimlik doğrudan burada da verilebilir — ettirenProfili ile AYNI ANDA
      // dolu olamaz, biri diğerini dışlar (bkz. prim-hesaplama.spec.ts > ettirenKimliginiCoz).
      // ettiren "farkliOzel" ise ettirenOzelKimligi, "farkliTuzel" ise ettirenTuzelKimligi
      // kullanılır.
      ettirenOzelKimligi?: OzelKimlikData;
      ettirenTuzelKimligi?: TuzelKimlikData;
      kayakTeminati?: boolean;
      // Bu senaryonun hangi acente profiliyle (ortak.json > kullaniciDegistir) çalışacağı.
      // Belirtilmezse testBaslangiciniHazirla "varsayilan" profili kullanır.
      acenteProfili?: string;
      // Beklenen sonuç alanları (odemeAdimiDahil — ZORUNLU, beklenenSonuc) — bkz.
      // tests/support/beklenen-sonuc.ts > BeklenenSonucAlanlari. Spec, bu alanları
      // beklenenSonucuCoz ile TEK biçime çevirip adimPlaniniOlustur ile akışı belirler.
      // Alanların tamamı tests/ekran-modelleri/jet-seyahat.model.json ile eşleşmeli
      // (npm run test:birim kontrol eder).
      // YENİ (dashboard > "Senaryo Oluştur"): sigortalı (poliçe sahibi) normalde ürün
      // seviyesinde SABİT tek bir TC kullanır (jetSeyahat.sigortaliProfili, tüm senaryolar
      // paylaşır). Bu alan doluysa SADECE bu senaryoda, o ortak sigortalı yerine burada
      // verilen kimlik kullanılır — dashboard'daki popup'ta "sigortalı TC" serbest girilmek
      // istendiğinde diye eklendi.
      sigortaliKimligi?: OzelKimlikData;
      // YENİ (dashboard > "Senaryo Oluştur"): sigortaliKimligi gibi serbest bir kimlik
      // yerine, ettirenProfili ile AYNI mantıkla hazır bir profil anahtarı (ortak.json >
      // kimlikBilgileri.ozel altındaki, ör. "tc2") verilebilir; sigortaliKimligi ile AYNI
      // ANDA dolu olursa sigortaliKimligi öncelenir (bkz. prim-hesaplama.spec.ts).
      sigortaliProfili?: string;
      // YENİ (dashboard > "Senaryo Oluştur"): sorguTipi "coklu" olduğunda normalde ürün
      // genelindeki SABİT Excel dosyası (jetSeyahat.cokluSorguDosyasi/cokluSorguKisiSayisi)
      // kullanılır. Popup'ta bu senaryo için ayrı bir Excel yüklenirse, ikisi de buraya
      // yazılır ve ürün varsayılanının yerini alır (bkz. jet-seyahat.page.ts >
      // sorguTipiniHazirla). İkisi birlikte dolu ya da birlikte boş olmalıdır.
      cokluSorguDosyasi?: string;
      cokluSorguKisiSayisi?: number;
      // YENİ (dashboard > "Senaryo Oluştur" > "Ödeme bilgileri"): bu senaryoya özel ödeme
      // kartı. Yalnızca kullanıcı ortak test kartından (ortak.json > odeme.krediKarti) FARKLI
      // bir kart girdiyse yazılır; yoksa senaryo ortak kartı kullanır (ve ortak kart
      // değişirse onu izler). Ödeme adımı dahil değilken (odemeAdimiDahil: false) dolu
      // olamaz — kurallar: scripts/dogrulama/senaryo-dogrulayici.mjs (kart alanları + son kullanma ay/yıl).
      krediKarti?: SenaryoKrediKartiData;
    }>;
  };
};

// Veri, proje dosyaları platform veritabanına aktarıldıysa (ve kasa anahtarı varsa) oradan,
// aksi halde eskisi gibi tests/data/<ortam>/<dosya>.json'dan gelir — şekil birebir aynıdır
// (bkz. platform-veri.ts; eşdeğerlik npm run test:birim ile korunur).
function loadData<T>(environment: EnvironmentName, fileName: string): T {
  const platform = platformVerisi(environment);
  if (platform) {
    const veri = fileName === 'ortak' ? platform.ortak : platform.dosyalar[fileName];
    if (veri === undefined) {
      throw new Error(`Platform veritabanında "${environment}/${fileName}" verisi yok. Proje dosyalarını yeniden aktarın ` +
        'ya da PLATFORM_VERI_KAYNAGI=dosya ile dosyalardan çalıştırın.');
    }
    return structuredClone(veri) as T;
  }
  const filePath = resolve(process.cwd(), 'tests', 'data', environment, `${fileName}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

// Dashboard > "Senaryo Oluştur" > "Dene" akışı (bkz. scripts/test-sunucu.mjs >
// /jetseyahat-senaryo/dene) denenen senaryoyu KALICI json dosyalarına YAZMAZ; onun yerine
// geçici bir "ek senaryo" (overlay) dosyası oluşturup yolunu bu ortam değişkeniyle
// Playwright alt sürecine verir. Değişken yoksa (normal koşular, CI, --list) hiçbir şey
// değişmez — yükleyiciler yalnızca kalıcı dosyaları okur.
export const EK_SENARYO_DOSYASI_ORTAM_DEGISKENI = 'TEST_SUNUCU_EK_SENARYO_DOSYASI';

type JetSeyahatSenaryosu = JetSeyahatTestData['jetSeyahat']['senaryolar'][number];

type EkSenaryoDosyasi = {
  ortam: EnvironmentName;
  jetSeyahatSenaryolari?: JetSeyahatSenaryosu[];
  kullaniciDegistir?: Record<string, AcenteProfili>;
};

// Ek senaryo dosyası tanımlıysa ve BU ortama aitse okunur; aksi halde undefined döner.
// Dosya tanımlı ama okunamıyorsa sessizce yok sayılmaz — deneme koşusu yanlış veriyle
// (ör. geçici senaryo hiç görünmeden) devam etmesin diye hata fırlatılır.
function ekSenaryoDosyasiniOku(environment: EnvironmentName): EkSenaryoDosyasi | undefined {
  const dosyaYolu = process.env[EK_SENARYO_DOSYASI_ORTAM_DEGISKENI];
  if (!dosyaYolu) return undefined;
  const veri = JSON.parse(readFileSync(dosyaYolu, 'utf-8')) as EkSenaryoDosyasi;
  return veri.ortam === environment ? veri : undefined;
}

export function loadOrtakData(environment: EnvironmentName): OrtakTestData {
  const veri = loadData<OrtakTestData>(environment, 'ortak');
  // "Dene" sırasında girilen ve ortak.json'da HENÜZ olmayan acente profili, kalıcı
  // dosyaya yazılmadan yalnızca bu koşu için eklenir (mevcut anahtarlar ezilmez).
  const ek = ekSenaryoDosyasiniOku(environment);
  if (ek?.kullaniciDegistir) {
    veri.kullaniciDegistir = { ...ek.kullaniciDegistir, ...veri.kullaniciDegistir };
  }
  return veri;
}

export function loadJetKaskoData(environment: EnvironmentName): JetKaskoTestData {
  return loadData<JetKaskoTestData>(environment, 'jet-kasko');
}

export function loadJetKaskoYkData(environment: EnvironmentName): JetKaskoYkTestData {
  return loadData<JetKaskoYkTestData>(environment, 'jet-kasko-yk');
}

export function loadJetIlkAtesKonutData(
  environment: EnvironmentName
): JetIlkAtesKonutTestData {
  return loadData<JetIlkAtesKonutTestData>(environment, 'jet-ilk-ates-konut');
}

export function loadJetDaskData(environment: EnvironmentName): JetDaskTestData {
  return loadData<JetDaskTestData>(environment, 'jet-dask');
}

export function loadJetSaglikData(environment: EnvironmentName): JetSaglikTestData {
  return loadData<JetSaglikTestData>(environment, 'jet-saglik');
}

export function loadJetKonutData(environment: EnvironmentName): JetKonutTestData {
  return loadData<JetKonutTestData>(environment, 'jet-konut');
}

export function loadJetKobiData(environment: EnvironmentName): JetKobiTestData {
  return loadData<JetKobiTestData>(environment, 'jet-kobi');
}

export function loadJetSeyahatData(environment: EnvironmentName): JetSeyahatTestData {
  const veri = loadData<JetSeyahatTestData>(environment, 'jet-seyahat');
  // "Dene" ile gelen geçici senaryo(lar) listenin sonuna eklenir (bkz.
  // ekSenaryoDosyasiniOku) — kalıcı jet-seyahat.json'a hiç dokunulmaz.
  const ek = ekSenaryoDosyasiniOku(environment);
  if (ek?.jetSeyahatSenaryolari?.length) {
    veri.jetSeyahat.senaryolar = [...veri.jetSeyahat.senaryolar, ...ek.jetSeyahatSenaryolari];
  }
  return veri;
}
