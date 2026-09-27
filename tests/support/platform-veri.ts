// PLATFORM VERİ ERİŞİM KATMANI (spec'ler için) — model senaryoları, giriş bilgisi ve giriş tarifi YALNIZCA platform
// veritabanından gelir (bkz. genel-veri.ts). Veritabanı yoksa ya da kasa anahtarı yoksa açık bir Türkçe hata verilir
// (VERITABANI_HAZIR_DEGIL). Kasa anahtarını Nöbetçi koşularında sunucu PLATFORM_KASA_ANAHTARI ile verir (yalnızca alt
// sürecin belleğinde; diske yazılmaz).
//
// Veritabanı, spec'ler veriyi modül yüklenirken EŞZAMANLI istediği için ayrı bir Node sürecinde
// (scripts/platform/veri-oku.mjs) salt okunur açılır; sonuç yalnızca boru üzerinden (bellekte) gelir.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { YASAK_ADRES_DEGISKENI } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { calismaAlaniniCoz, veriKoku } from '../../scripts/platform/calisma-alanlari.mjs';

/** Veritabanı kullanılamadığında her hata mesajının başı. */
export const VERITABANI_HAZIR_DEGIL = "Veritabanı hazır değil — Nöbetçi'yi açıp kasayı açın";
const PROJE_KOKU = resolve(__dirname, '..', '..');
const OKUYUCU = join(PROJE_KOKU, 'scripts', 'platform', 'veri-oku.mjs');

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

/** Ortamın kayıtlı giriş tarifi (bkz. scripts/platform/giris/tarif-deposu.mjs). */
export type PlatformGirisTarifi = {
  tarif: GirisTarifi;
  kaynak: 'kayitli';
  /** Doğrulama hataları (boş değilse giriş motoru açık hata verir). */
  hatalar: string[];
};

/** Ayarlar > Güvenlik > "Yasak adresler" (host kalıpları; NOBETCI_YASAK_ADRESLER ortam değişkeniyle birleşir). */
export type PlatformYasakAdresleri = string[];

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

/**
 * ÇALIŞMA ALANI SABİTLEME (ana süreçte, modül ilk yüklenirken): PLATFORM_VERITABANI verilmemişse kayıt defterinden
 * (NOBETCI_CALISMA_ALANI → son açılan) çözülür ve PLATFORM_VERITABANI'ye yazılır — worker'lar, veri okuyucu ve
 * raporlayıcı AYNI veritabanını kullanır. Nöbetçi koşularında sunucu açık çalışma alanının yolunu zaten verir.
 */
function calismaAlaniniSabitle(): void {
  if (process.env.PLATFORM_VERITABANI && process.env.PLATFORM_VERITABANI.trim()) return;
  const secim = calismaAlaniniCoz(veriKoku(PROJE_KOKU));
  if (secim) process.env.PLATFORM_VERITABANI = secim.yollar.veritabani;
}
calismaAlaniniSabitle();

/** scripts/platform/veritabani/baglanti.mjs > veritabaniYolu ile aynı kural (çalışma alanı yukarıda sabitlenir). */
export function platformVeritabaniYolu(): string {
  const ortam = process.env.PLATFORM_VERITABANI;
  return ortam && ortam.trim() ? resolve(ortam.trim()) : resolve(veriKoku(PROJE_KOKU), 'platform.db');
}

export function hataMi(d: unknown): d is HataCiktisi {
  return typeof d === 'object' && d !== null && typeof (d as { hata?: unknown }).hata === 'string';
}

/** veri-oku.mjs'yi eşzamanlı çalıştırır. ekOrtam yalnızca alt sürece verilir. */
export function platformOkuyucusunuCalistir(argumanlar: string[], ekOrtam: Record<string, string> = {}): unknown {
  try {
    const cikti = execFileSync(process.execPath, [OKUYUCU, ...argumanlar], {
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

/**
 * Ayarlardaki yasak adresleri bu sürecin NOBETCI_YASAK_ADRESLER değişkenine EKLER (varsa ortamdakilerle birlikte);
 * model koşucusunun koşu koruması bu değişkeni okur.
 */
export function yasakAdresleriniBirlestir(liste: PlatformYasakAdresleri | undefined): void {
  if (!Array.isArray(liste) || !liste.length) return;
  const mevcut = (process.env[YASAK_ADRES_DEGISKENI] ?? '').split(/[\s,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const birlesik = [...new Set([...mevcut, ...liste.map((k) => k.trim().toLowerCase()).filter(Boolean)])];
  process.env[YASAK_ADRES_DEGISKENI] = birlesik.join(',');
}

// ---- Model senaryoları (model koşucusu) ----

/** Model koşucusunun senaryosu (veri-oku.mjs). */
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
  /** Nöbetçi "Dene" taslağı (veritabanında yok; sonucu senaryosuz kaydedilir). */
  deneme?: boolean;
};

export type PlatformModelVerisi = {
  ortam: string;
  ortamId: string;
  tabanUrl: string;
  senaryolar: PlatformModelSenaryosu[];
  /** Bağlam profilleri: tür → profil adı → alanlar (giriş tarifinin bağlam adımları bu alanlarla dolar). */
  baglamProfilleri: Record<string, Record<string, Record<string, unknown>>>;
  /** Canlı ortam: ortak akışların "yalnızca test ortamı" adımları atlanır. */
  canli?: boolean;
  /** Kimlik alanlarının hazır profilleri: profil havuzu → profil adı → değerler (çözülmüş; yalnızca koşu belleğinde). */
  kimlikProfilleri?: Record<string, Record<string, Record<string, unknown>>>;
};
