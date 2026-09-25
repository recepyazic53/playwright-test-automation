// PLATFORM VERİ ERİŞİM KATMANI (spec'ler için) — test verisi, ekran modelleri, taban adresler ve
// giriş bilgisi YALNIZCA platform veritabanından gelir (Nöbetçi: veri/platform.db). Dosyaya
// (tests/data, .env) geri düşülmez; veritabanı yoksa, proje aktarılmamışsa ya da kasa anahtarı
// yoksa açık bir Türkçe hata verilir (VERITABANI_HAZIR_DEGIL).
//
// Kasa anahtarı:
//   - Nöbetçi koşularında sunucu türetilmiş anahtarı PLATFORM_KASA_ANAHTARI ile verir (yalnızca alt
//     sürecin belleğinde; diske yazılmaz),
//   - terminal koşularında global-setup.ts kasa parolasını GİZLİ girişle sorar (TTY yoksa
//     PLATFORM_KASA_PAROLASI gerekir) ve anahtarı bu koşunun worker'larına verir,
//   - "--list" global-setup çalıştırmaz: PLATFORM_KASA_ANAHTARI ya da PLATFORM_KASA_PAROLASI gerekir.
// Playwright yapılandırması (playwright.config.ts) parola sorulmadan ÖNCE değerlendirilir; orada
// taban adres anahtarsız okunamaz (platformVerisiVarsa → null) ve worker'lar yapılandırmayı anahtarla
// yeniden yükler.
//
// Veritabanı, spec'ler veriyi modül yüklenirken EŞZAMANLI istediği için ayrı bir Node sürecinde
// (scripts/platform/aktarim/veri-oku.mjs) salt okunur açılır; sonuç yalnızca boru üzerinden
// (bellekte) gelir ve süreç başına önbelleğe alınır.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EnvironmentName } from './environments';
import type { GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { YASAK_ADRES_DEGISKENI } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { CALISMA_ALANI_DEGISKENI, calismaAlaniniCoz, veriKoku } from '../../scripts/platform/calisma-alanlari.mjs';

export const KASA_ANAHTARI_DEGISKENI = 'PLATFORM_KASA_ANAHTARI';
export const KASA_PAROLASI_DEGISKENI = 'PLATFORM_KASA_PAROLASI';
/** Veritabanı kullanılamadığında her hata mesajının başı. */
export const VERITABANI_HAZIR_DEGIL = "Veritabanı hazır değil — Nöbetçi'yi açıp projeyi aktarın/yedek yükleyin";
/** Bu projenin aktarım adaptörü (projeler/galaksi/aktarim.mjs). */
const ADAPTOR = 'galaksi';
const PROJE_KOKU = resolve(__dirname, '..', '..');
const OKUYUCU = join(PROJE_KOKU, 'scripts', 'platform', 'aktarim', 'veri-oku.mjs');

export type PlatformGirisBilgisi = {
  /** Giriş profilinin kimliği (oturum dosyası ortam + giriş profili başınadır). */
  profilKimligi: string;
  kullaniciAdi: string;
  parola: string | null;
  totpGizli: string | null;
  sabitKod: string | null;
  /** SMS 2FA'da kodun kaynağı (giriş profilindeki ayar); SMS değilse null. */
  smsKipi: 'sabit' | 'elle' | null;
};

/** Etkin giriş tarifi: kaydedilmiş ya da projenin varsayılanı (bkz. scripts/platform/giris/tarif-deposu.mjs). */
export type PlatformGirisTarifi = {
  tarif: GirisTarifi;
  kaynak: 'kayitli' | 'proje-varsayilani';
  /** Doğrulama hataları (boş değilse giriş motoru açık hata verir). */
  hatalar: string[];
};

export type PlatformVeriSeti = {
  ortam: string;
  tabanUrl: string;
  giris: PlatformGirisBilgisi | null;
  ortak: unknown;
  dosyalar: Record<string, unknown>;
  /** Ekran modelleri, eski dosya adıyla ("<ekran anahtarı>.model.json"). */
  ekranModelleri: Record<string, unknown>;
  /** Senaryo anahtarı ("<dosya>::<başlık>") → senaryo UUID. */
  senaryoKimlikleri: Record<string, string>;
  /** Giriş tarifi (yoksa null: ortam için Ayarlar > Giriş profilleri > Giriş tarifi tanımlanmalı). */
  girisTarifi?: PlatformGirisTarifi | null;
  /** "Dene" ek verisindeki şifreli dosya referansları → bu koşu için çözülmüş geçici dosya yolları. */
  ekDosyaYollari?: Record<string, string>;
};

/** Ayarlar > Güvenlik > "Yasak adresler" (host kalıpları; NOBETCI_YASAK_ADRESLER ortam değişkeniyle birleşir). */
export type PlatformYasakAdresleri = string[];

type DurumCiktisi =
  | { durum: 'veritabani-yok' }
  | { durum: 'aktarilmamis' }
  | { durum: 'aktarildi'; sonAktarim: string | null; haricTutulanlar: string[]; haricTutulanDosyalar?: string[] };

type VeriCiktisi = Extract<DurumCiktisi, { durum: 'aktarildi' }> & {
  anahtarYok?: boolean;
  veri?: PlatformVeriSeti | null;
  yasakAdresler?: PlatformYasakAdresleri;
};

type HataCiktisi = { hata: string; kod: string };

/** Veritabanı kullanılamadığında fırlatılan hata (mesaj her zaman VERITABANI_HAZIR_DEGIL ile başlar). */
export class PlatformVeriHatasi extends Error {
  constructor(neden: string) {
    super(`${VERITABANI_HAZIR_DEGIL} (${neden}).`);
    this.name = 'PlatformVeriHatasi';
    // Kullanıcıya yalnızca açıklama gösterilsin (yığın izi/kod alıntısı gürültü yapmasın).
    this.stack = `${this.name}: ${this.message}`;
  }
}

/** Bu koşunun çalışma alanı (terminal koşusu; gizli bilgi değildir — ad seçim ekranında da görünür). */
export type KosuCalismaAlani = { ad: string; kaynak: 'degisken' | 'son-acilan' | 'tek' } | null;
let kosuCalismaAlani: KosuCalismaAlani = null;

/**
 * ÇALIŞMA ALANI SABİTLEME (ana süreçte, modül ilk yüklenirken): PLATFORM_VERITABANI verilmemişse kayıt defterinden
 * (NOBETCI_CALISMA_ALANI → son açılan) çözülür ve PLATFORM_VERITABANI'ye yazılır — worker'lar, veri okuyucu ve
 * raporlayıcı AYNI veritabanını kullanır (koşu ortasında çalışma alanı değişse de). Nöbetçi koşularında sunucu
 * açık çalışma alanının yolunu zaten verir.
 */
function calismaAlaniniSabitle(): void {
  if (process.env.PLATFORM_VERITABANI && process.env.PLATFORM_VERITABANI.trim()) return;
  const secim = calismaAlaniniCoz(veriKoku(PROJE_KOKU));
  if (!secim) return;
  process.env.PLATFORM_VERITABANI = secim.yollar.veritabani;
  kosuCalismaAlani = { ad: secim.alan.ad, kaynak: secim.kaynak };
}
calismaAlaniniSabitle();

/** Terminal koşusunun kayıt defterinden seçilen çalışma alanı (Nöbetçi koşularında ve PLATFORM_VERITABANI ile null). */
export function kosununCalismaAlani(): KosuCalismaAlani {
  return kosuCalismaAlani;
}
export { CALISMA_ALANI_DEGISKENI };

/** scripts/platform/veritabani/baglanti.mjs > veritabaniYolu ile aynı kural (çalışma alanı yukarıda sabitlenir). */
export function platformVeritabaniYolu(): string {
  const ortam = process.env.PLATFORM_VERITABANI;
  return ortam && ortam.trim() ? resolve(ortam.trim()) : resolve(veriKoku(PROJE_KOKU), 'platform.db');
}

export function hataMi(d: unknown): d is HataCiktisi {
  return typeof d === 'object' && d !== null && typeof (d as { hata?: unknown }).hata === 'string';
}

/**
 * veri-oku.mjs'yi eşzamanlı çalıştırır. ekOrtam yalnızca alt sürece verilir. adaptorlu: false → "--adaptor" verilmez
 * (genel kip; bkz. genel-veri.ts).
 */
export function platformOkuyucusunuCalistir(argumanlar: string[], ekOrtam: Record<string, string> = {}, adaptorlu = true): unknown {
  try {
    const cikti = execFileSync(process.execPath, [OKUYUCU, ...argumanlar, ...(adaptorlu ? ['--adaptor', ADAPTOR] : [])], {
      cwd: PROJE_KOKU,
      env: { ...process.env, ...ekOrtam },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true
    });
    const satirlar = cikti.trim().split('\n');
    return JSON.parse(satirlar[satirlar.length - 1]);
  } catch (hata) {
    // Okuyucu gizli değeri yalnızca stdout'a (başarılı çıktı) yazar; hata metni kısaltılarak döner.
    const mesaj = hata instanceof Error ? hata.message.split('\n')[0].slice(0, 200) : String(hata);
    return { hata: `veri okuyucu çalıştırılamadı (${mesaj})`, kod: 'SUREC' } satisfies HataCiktisi;
  }
}

const loglananlar = new Set<string>();
/** Ana süreçte (worker'da değil) bir kez stderr'e yazar — "--list --reporter=json" stdout'u bozulmaz. */
function birKezLogla(mesaj: string): void {
  if (process.env.TEST_WORKER_INDEX !== undefined || loglananlar.has(mesaj)) return;
  loglananlar.add(mesaj);
  process.stderr.write(`[platform-veri] ${mesaj}\n`);
}

let durumOnbellegi: DurumCiktisi | undefined;

/** Aktarım durumu (kasa GEREKMEZ). Veritabanı dosyası yoksa alt süreç başlatılmaz. */
export function platformDurumu(): DurumCiktisi {
  if (durumOnbellegi) return durumOnbellegi;
  if (!existsSync(platformVeritabaniYolu())) return (durumOnbellegi = { durum: 'veritabani-yok' });
  const sonuc = platformOkuyucusunuCalistir(['durum']);
  if (hataMi(sonuc)) throw new PlatformVeriHatasi(`platform veritabanı okunamadı: ${sonuc.hata}`);
  return (durumOnbellegi = sonuc as DurumCiktisi);
}

/** Proje platform veritabanına aktarılmış (ya da yedekten yüklenmiş) mı? Kasa gerektirmez. */
export function platformHazirMi(): boolean {
  return platformDurumu().durum === 'aktarildi';
}

/** Veritabanı hazır değilse açık bir hata fırlatır (playwright.config.ts ilk iş olarak çağırır). */
export function platformHazirOlmali(): Extract<DurumCiktisi, { durum: 'aktarildi' }> {
  const durum = platformDurumu();
  if (durum.durum === 'veritabani-yok') throw new PlatformVeriHatasi(`veritabanı bulunamadı: ${platformVeritabaniYolu()}`);
  if (durum.durum !== 'aktarildi') throw new PlatformVeriHatasi('proje henüz aktarılmamış ya da kasa oluşturulmamış');
  return durum;
}

const veriOnbellegi = new Map<EnvironmentName, PlatformVeriSeti>();

/** Önbellekleri boşaltır (global-setup anahtarı yerleştirdikten sonra çağırır). */
export function platformOnbelleginiSifirla(): void {
  durumOnbellegi = undefined;
  veriOnbellegi.clear();
}

function anahtarVarMi(): boolean {
  return Boolean(process.env[KASA_ANAHTARI_DEGISKENI] || process.env[KASA_PAROLASI_DEGISKENI]);
}

/**
 * Bu ortamın veritabanından kurulmuş veri seti. Veritabanı hazır değilse, kasa anahtarı yoksa ya da
 * ortam veritabanında yoksa açık bir hata fırlatır (dosyaya geri düşülmez).
 */
export function platformVerisi(ortam: EnvironmentName): PlatformVeriSeti {
  const onbellekte = veriOnbellegi.get(ortam);
  if (onbellekte) return onbellekte;
  platformHazirOlmali();
  if (!anahtarVarMi()) {
    throw new PlatformVeriHatasi(
      'kasa anahtarı yok: testleri terminalden çalıştırın (kasa parolası gizli olarak sorulur) ya da ' +
        `etkileşimsiz ortamda ${KASA_PAROLASI_DEGISKENI} verin; "--list" için de ${KASA_PAROLASI_DEGISKENI} gerekir`
    );
  }
  const sonuc = platformOkuyucusunuCalistir(['veri', '--ortam', ortam]);
  if (hataMi(sonuc)) {
    if (sonuc.kod === 'PAROLA_YANLIS') throw new Error(`Platform kasası açılamadı: ${sonuc.hata}`);
    throw new PlatformVeriHatasi(`platform veritabanı okunamadı: ${sonuc.hata}`);
  }
  const cikti = sonuc as VeriCiktisi;
  if (!cikti.veri) throw new PlatformVeriHatasi(`"${ortam}" ortamı platform veritabanında yok`);
  birKezLogla(`Veri kaynağı: platform veritabanı (${ortam}; son aktarım ${cikti.sonAktarim ?? 'bilinmiyor'}).`);
  yasakAdresleriniBirlestir(cikti.yasakAdresler);
  veriOnbellegi.set(ortam, cikti.veri);
  return cikti.veri;
}

/**
 * Ayarlardaki yasak adresleri bu sürecin NOBETCI_YASAK_ADRESLER değişkenine EKLER (varsa ortamdakilerle birlikte).
 * global-setup ana süreçte çağrıldığında worker'lar birleşik listeyi miras alır; koşu koruması (global-setup,
 * model koşucusu) bu değişkeni okur.
 */
export function yasakAdresleriniBirlestir(liste: PlatformYasakAdresleri | undefined): void {
  if (!Array.isArray(liste) || !liste.length) return;
  const mevcut = (process.env[YASAK_ADRES_DEGISKENI] ?? '').split(/[\s,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const birlesik = [...new Set([...mevcut, ...liste.map((k) => k.trim().toLowerCase()).filter(Boolean)])];
  process.env[YASAK_ADRES_DEGISKENI] = birlesik.join(',');
}

/**
 * platformVerisi ile aynı; yalnızca kasa anahtarı HENÜZ yoksa null döner (hata yerine). Yalnızca
 * playwright.config.ts değerlendirilirken (global-setup parolayı sormadan önce) kullanılır.
 */
export function platformVerisiVarsa(ortam: EnvironmentName): PlatformVeriSeti | null {
  if (!veriOnbellegi.has(ortam) && !anahtarVarMi()) {
    platformHazirOlmali();
    return null;
  }
  return platformVerisi(ortam);
}

/** Koşudan hariç tutulan senaryo anahtarları ("<dosya>::<ad>") — veritabanından (kasa gerektirmez). */
export function platformHaricTutulanAnahtarlar(): string[] {
  return platformHazirOlmali().haricTutulanlar;
}

/**
 * Devre dışı / silinmiş ekranların TÜM testleri koşudan hariç tutulan spec dosyaları (testDir'e göre, "/" ayraçlı) —
 * veritabanından (kasa gerektirmez; bkz. scripts/platform/ekranlar/ekran-yonetimi.mjs > ekranHaricKapsami).
 */
export function platformHaricTutulanDosyalar(): string[] {
  return platformHazirOlmali().haricTutulanDosyalar ?? [];
}

/** Senaryonun platform kimliği (UUID) — kasa anahtarı bu süreçte varsa. */
export function platformSenaryoKimligi(ortam: EnvironmentName, anahtar: string): string | undefined {
  return platformVerisiVarsa(ortam)?.senaryoKimlikleri[anahtar];
}

// ---- Model senaryoları (test kodu olmayan; model koşucusu) ----

/** Model koşucusunun senaryosu (veri-oku.mjs > model kipi). */
export type PlatformModelSenaryosu = {
  id: string;
  baslik: string;
  kosuyaDahil: boolean;
  /** Ekran devre dışıysa false (senaryo koşuya girmez; Nöbetçi'nin tam listesi yine görür). */
  ekranEtkin?: boolean;
  ekran: { id: string; anahtar: string; ad: string };
  /** Ekranın en son model sürümü (yoksa null — test açık bir hatayla başarısız olur). */
  model: Record<string, unknown> | null;
  modelSurumu: number | null;
  altModeller: Record<string, Record<string, unknown>>;
  /** Senaryonun bu ortamdaki verisi (hassas alanlar çözülmüş; yalnızca bellekte). */
  veri: Record<string, unknown>;
  mutlakaGorunmeli: string[];
};

export type PlatformModelVerisi = {
  ortam: string;
  ortamId: string;
  tabanUrl: string;
  senaryolar: PlatformModelSenaryosu[];
  /** Bağlam profilleri: tür → profil adı → alanlar (giriş tarifinin bağlam adımları bu alanlarla dolar). */
  baglamProfilleri: Record<string, Record<string, Record<string, unknown>>>;
};

const modelOnbellegi = new Map<EnvironmentName, PlatformModelVerisi | null>();

/**
 * Bu ortamın model senaryoları (platform veritabanından). Ortam veritabanında yoksa null. Veritabanı/kasa
 * hazır değilse platformVerisi ile aynı açık hatalar.
 */
export function platformModelVerisi(ortam: EnvironmentName): PlatformModelVerisi | null {
  if (modelOnbellegi.has(ortam)) return modelOnbellegi.get(ortam) ?? null;
  platformHazirOlmali();
  if (!anahtarVarMi()) {
    throw new PlatformVeriHatasi(`kasa anahtarı yok: model senaryoları okunamadı (${KASA_PAROLASI_DEGISKENI} ya da ${KASA_ANAHTARI_DEGISKENI} gerekir)`);
  }
  const sonuc = platformOkuyucusunuCalistir(['model', '--ortam', ortam]);
  if (hataMi(sonuc)) {
    if (sonuc.kod === 'PAROLA_YANLIS') throw new Error(`Platform kasası açılamadı: ${sonuc.hata}`);
    throw new PlatformVeriHatasi(`platform veritabanı okunamadı: ${sonuc.hata}`);
  }
  const veri = (sonuc as { model?: PlatformModelVerisi | null }).model ?? null;
  yasakAdresleriniBirlestir((sonuc as { yasakAdresler?: PlatformYasakAdresleri }).yasakAdresler);
  modelOnbellegi.set(ortam, veri);
  return veri;
}
