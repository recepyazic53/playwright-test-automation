// PLATFORM VERİ ERİŞİM KATMANI (spec'ler için) — test verisini, taban adresleri ve giriş
// bilgisini platform veritabanından (mevcut proje dosyaları "aktarıldıysa") ya da eskisi gibi
// dosyalardan (tests/data, .env) sağlar. Döndürülen şekiller dosya yükleyicileriyle BİREBİR
// aynıdır (npm run test:birim > platform-esdegerlik kontrol eder); testlerin davranışı değişmez.
//
// Kaynak seçimi (süreç başına bir kez, stderr'e — gizli değer YAZILMAZ — loglanır):
//   PLATFORM_VERI_KAYNAGI=dosya        → her zaman dosyalar (kaçış yolu).
//   veritabanı yok / aktarım yapılmamış → dosyalar.
//   aktarım yapılmış + kasa anahtarı var → VERİTABANI. Anahtar:
//       - dashboard koşularında sunucu türetilmiş anahtarı PLATFORM_KASA_ANAHTARI ile verir
//         (yalnızca alt sürecin belleğinde; diske yazılmaz),
//       - terminal koşularında global-setup.ts kasa parolasını GİZLİ girişle sorar
//         (TTY yoksa PLATFORM_KASA_PAROLASI gerekir) ve anahtarı bu koşunun worker'larına verir.
//   aktarım yapılmış ama anahtar yok (ör. "--list" veya kasası kilitli dashboard) → dosyalar.
//   Dosyalar/.env aktarımdan SONRA değiştiyse (eski dashboard düzenleyicileri hâlâ dosyaya yazar)
//   → dosyalar + uyarı ("Proje dosyalarından yeniden aktar" önerilir).
//   PLATFORM_VERI_KAYNAGI=veritabani   → veritabanı zorunlu; kullanılamıyorsa hata.
//
// Veritabanı, spec'ler veriyi modül yüklenirken EŞZAMANLI istediği için ayrı bir Node sürecinde
// (scripts/platform/aktarim/veri-oku.mjs) salt okunur açılır; sonuç yalnızca boru üzerinden
// (bellekte) gelir ve süreç başına önbelleğe alınır.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EnvironmentName } from './environments';

export const VERI_KAYNAGI_DEGISKENI = 'PLATFORM_VERI_KAYNAGI';
export const KASA_ANAHTARI_DEGISKENI = 'PLATFORM_KASA_ANAHTARI';
export const KASA_PAROLASI_DEGISKENI = 'PLATFORM_KASA_PAROLASI';
/** Bu projenin aktarım adaptörü (projeler/galaksi/aktarim.mjs). */
const ADAPTOR = 'galaksi';
const PROJE_KOKU = resolve(__dirname, '..', '..');
const OKUYUCU = join(PROJE_KOKU, 'scripts', 'platform', 'aktarim', 'veri-oku.mjs');

export type PlatformGirisBilgisi = {
  kullaniciAdi: string;
  parola: string | null;
  totpGizli: string | null;
  sabitKod: string | null;
};

export type PlatformVeriSeti = {
  ortam: string;
  tabanUrl: string;
  giris: PlatformGirisBilgisi | null;
  ortak: unknown;
  dosyalar: Record<string, unknown>;
  /** Eski senaryo anahtarı ("<dosya>::<başlık>") → senaryo UUID. */
  senaryoKimlikleri: Record<string, string>;
};

type DurumCiktisi =
  | { durum: 'veritabani-yok' }
  | { durum: 'aktarilmamis' }
  | { durum: 'aktarildi'; sonAktarim: string | null; haricTutulanlar: string[]; kosuListesiGuncel: boolean };

type VeriCiktisi = Extract<DurumCiktisi, { durum: 'aktarildi' }> & {
  anahtarYok?: boolean;
  guncel?: { dosyalar: boolean; degisenOrtamDegiskenleri: string[] };
  veri?: PlatformVeriSeti | null;
};

type HataCiktisi = { hata: string; kod: string };

function veriKaynagiTercihi(): 'dosya' | 'veritabani' | 'otomatik' {
  const deger = (process.env[VERI_KAYNAGI_DEGISKENI] ?? '').trim().toLocaleLowerCase('tr-TR');
  if (deger === 'dosya' || deger === 'veritabani') return deger;
  return 'otomatik';
}

/** scripts/platform/veritabani/baglanti.mjs > veritabaniYolu ile aynı kural. */
export function platformVeritabaniYolu(): string {
  const ortam = process.env.PLATFORM_VERITABANI;
  return ortam && ortam.trim() ? resolve(ortam.trim()) : resolve(PROJE_KOKU, 'veri', 'platform.db');
}

function hataMi(d: unknown): d is HataCiktisi {
  return typeof d === 'object' && d !== null && typeof (d as { hata?: unknown }).hata === 'string';
}

/** veri-oku.mjs'yi eşzamanlı çalıştırır. ekOrtam yalnızca alt sürece verilir. */
export function platformOkuyucusunuCalistir(argumanlar: string[], ekOrtam: Record<string, string> = {}): unknown {
  try {
    const cikti = execFileSync(process.execPath, [OKUYUCU, ...argumanlar, '--adaptor', ADAPTOR], {
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
  if (hataMi(sonuc)) {
    if (veriKaynagiTercihi() === 'veritabani') throw new Error(`Platform veritabanı okunamadı: ${sonuc.hata}`);
    birKezLogla(`Platform veritabanı okunamadı (${sonuc.hata}); dosyalar kullanılıyor.`);
    return (durumOnbellegi = { durum: 'aktarilmamis' });
  }
  return (durumOnbellegi = sonuc as DurumCiktisi);
}

/**
 * Koşu sonuçları platform veritabanına mı yazılacak? (Proje aktarılmışsa EVET — veri kaynağı tercihi
 * PLATFORM_VERI_KAYNAGI=dosya olsa bile; sonuçlar ve şifreli medya için kasa anahtarı gerekir.)
 */
export function platformSonucKaydiVarMi(): boolean {
  return platformDurumu().durum === 'aktarildi';
}

/** Aktarım yapılmış mı (kasa anahtarı istemeden)? global-setup parola sorup sormamaya buna göre karar verir. */
export function platformAktarimiVarMi(): boolean {
  if (veriKaynagiTercihi() === 'dosya') return false;
  return platformDurumu().durum === 'aktarildi';
}

const veriOnbellegi = new Map<EnvironmentName, PlatformVeriSeti | null>();

/** Önbellekleri boşaltır (global-setup anahtarı yerleştirdikten sonra çağırır). */
export function platformOnbelleginiSifirla(): void {
  durumOnbellegi = undefined;
  veriOnbellegi.clear();
}

/**
 * Bu ortam için veritabanından kurulmuş veri seti; dosyalar kullanılacaksa null.
 * sessizAnahtarYok: anahtar yokken "dosyalar kullanılıyor" logu yazılmaz (playwright.config.ts,
 * global-setup parolayı sormadan ÖNCE taban adresi için çağırır).
 */
export function platformVerisi(ortam: EnvironmentName, secenekler: { sessizAnahtarYok?: boolean } = {}): PlatformVeriSeti | null {
  const tercih = veriKaynagiTercihi();
  if (tercih === 'dosya') {
    birKezLogla('Veri kaynağı: dosyalar (PLATFORM_VERI_KAYNAGI=dosya).');
    return null;
  }
  if (veriOnbellegi.has(ortam)) return veriOnbellegi.get(ortam) ?? null;
  const zorunlu = tercih === 'veritabani';
  const durum = platformDurumu();
  if (durum.durum !== 'aktarildi') {
    if (zorunlu) throw new Error('PLATFORM_VERI_KAYNAGI=veritabani ama proje dosyaları platform veritabanına aktarılmamış.');
    birKezLogla(`Veri kaynağı: dosyalar (${durum.durum === 'veritabani-yok' ? 'platform veritabanı yok' : 'proje dosyaları henüz aktarılmamış'}).`);
    veriOnbellegi.set(ortam, null);
    return null;
  }
  if (!process.env[KASA_ANAHTARI_DEGISKENI] && !process.env[KASA_PAROLASI_DEGISKENI]) {
    if (zorunlu && !secenekler.sessizAnahtarYok) {
      throw new Error(`PLATFORM_VERI_KAYNAGI=veritabani ama kasa anahtarı yok (${KASA_PAROLASI_DEGISKENI} verin).`);
    }
    // Anahtar sonradan (global-setup) gelebilir: sonuç önbelleğe ALINMAZ.
    if (!secenekler.sessizAnahtarYok) birKezLogla('Veri kaynağı: dosyalar (platform veritabanı aktarılmış ama kasa anahtarı bu süreçte yok).');
    return null;
  }
  const sonuc = platformOkuyucusunuCalistir(['veri', '--ortam', ortam]);
  if (hataMi(sonuc)) {
    if (sonuc.kod === 'PAROLA_YANLIS') throw new Error(`Platform kasası açılamadı: ${sonuc.hata}`);
    if (zorunlu) throw new Error(`Platform veritabanı okunamadı: ${sonuc.hata}`);
    birKezLogla(`Platform veritabanı okunamadı (${sonuc.hata}); dosyalar kullanılıyor.`);
    veriOnbellegi.set(ortam, null);
    return null;
  }
  const cikti = sonuc as VeriCiktisi;
  let veri: PlatformVeriSeti | null = cikti.veri ?? null;
  if (!veri) {
    if (zorunlu) throw new Error(`Platform veritabanında "${ortam}" ortamı yok.`);
    birKezLogla(`Platform veritabanında "${ortam}" ortamı yok; dosyalar kullanılıyor.`);
  } else if (cikti.guncel && (!cikti.guncel.dosyalar || cikti.guncel.degisenOrtamDegiskenleri.length)) {
    const neler = [
      ...(cikti.guncel.dosyalar ? [] : ['tests/data dosyaları']),
      ...(cikti.guncel.degisenOrtamDegiskenleri.length ? [`.env (${cikti.guncel.degisenOrtamDegiskenleri.join(', ')})`] : [])
    ].join(' ve ');
    if (zorunlu) {
      birKezLogla(`UYARI: ${neler} son aktarımdan sonra değişmiş; PLATFORM_VERI_KAYNAGI=veritabani olduğu için veritabanı kullanılıyor.`);
    } else {
      birKezLogla(`UYARI: ${neler} son aktarımdan sonra değişmiş — davranış değişmesin diye DOSYALAR kullanılıyor. ` +
        'Platformda Ayarlar > Yedekleme > "Proje dosyalarından yeniden aktar" ile veritabanını güncelleyin.');
      veri = null;
    }
  }
  if (veri) birKezLogla(`Veri kaynağı: platform veritabanı (${ortam}; son aktarım ${cikti.sonAktarim ?? 'bilinmiyor'}).`);
  veriOnbellegi.set(ortam, veri);
  return veri;
}

/**
 * Koşudan hariç tutulan senaryo anahtarları ("<dosya>::<ad>") — aktarım yapılmışsa ve
 * kosu-listesi.json aktarımdan sonra değişmediyse VERİTABANINDAN (kosuya_dahil), aksi halde null
 * (çağıran dosyayı okur). Kasa gerektirmez (bu bilgiler gizli değildir).
 */
export function platformHaricTutulanAnahtarlar(): string[] | null {
  if (veriKaynagiTercihi() === 'dosya') return null;
  const durum = platformDurumu();
  if (durum.durum !== 'aktarildi') return null;
  if (!durum.kosuListesiGuncel) {
    birKezLogla('kosu-listesi.json son aktarımdan sonra değişmiş; koşu listesi dosyadan okunuyor.');
    return null;
  }
  return durum.haricTutulanlar;
}

/** Senaryonun platform kimliği (UUID) — yalnızca veri veritabanından geliyorsa. */
export function platformSenaryoKimligi(ortam: EnvironmentName, anahtar: string): string | undefined {
  return veriOnbellegi.has(ortam) || process.env[KASA_ANAHTARI_DEGISKENI] || process.env[KASA_PAROLASI_DEGISKENI]
    ? platformVerisi(ortam, { sessizAnahtarYok: true })?.senaryoKimlikleri[anahtar]
    : undefined;
}
