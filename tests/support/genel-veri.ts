// GENEL YOL VERİSİ — hiçbir aktarım adaptörüne bağlı OLMAYAN model koşusu: elle oluşturulan proje/ortamların test kodu
// olmayan senaryoları Nöbetçi'den playwright.config.ts ile koşar. Proje ve ortam KİMLİKLERİ sunucudan ortam
// değişkenleriyle gelir (NOBETCI_PROJE_ID, NOBETCI_ORTAM_ID); "test"/"canli" ortam adları ve aktarım eşlemesi
// kullanılmaz. Veri platform veritabanından veri-oku.mjs'nin "genel" kipiyle okunur (kasa anahtarı gerekir;
// Nöbetçi koşularında PLATFORM_KASA_ANAHTARI). Giriş bilgisi ve giriş tarifi ortamın kendi kayıtlarıdır.
import { dirname, join } from 'node:path';
import { OTURUM_UZANTISI, eskiOturumDosyalariniSil } from './oturum-kasasi';
import type { GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { izinMesaji } from '../../scripts/platform/guvenlik/izin-tanimlari.mjs';
import { tarifiHazirla, type GirisKimligi } from './giris-motoru';
import { kasaKosuAyarlariniYukle } from './kosu-ayarlari';
import {
  PlatformVeriHatasi, hataMi, platformOkuyucusunuCalistir, platformVeritabaniYolu, yasakAdresleriniBirlestir,
  type PlatformGirisBilgisi, type PlatformGirisTarifi, type PlatformModelVerisi, type PlatformYasakAdresleri
} from './platform-veri';

export const GENEL_PROJE_DEGISKENI = 'NOBETCI_PROJE_ID';
export const GENEL_ORTAM_DEGISKENI = 'NOBETCI_ORTAM_ID';

export type GenelVeri = {
  projeId: string;
  ortamId: string;
  model: PlatformModelVerisi | null;
  giris: PlatformGirisBilgisi | null;
  /** Senaryoların / "Yeniden giriş" adımlarının ADIYLA seçtiği giriş profilleri (yalnızca kullanılanlar). */
  girisProfilleri: Record<string, PlatformGirisBilgisi>;
  girisTarifi: PlatformGirisTarifi | null;
  /** Ayarlar > İzinler durumu (koşucu kasayı açmaz; veri-oku.mjs verir). Yoksa hepsi kapalı. */
  izinler: Record<string, boolean>;
};

/** Bu süreç genel yol koşusu mu (sunucu proje ve ortam kimliğini verdi mi)? */
export function genelKosuMu(): boolean {
  return Boolean(process.env[GENEL_PROJE_DEGISKENI] && process.env[GENEL_ORTAM_DEGISKENI]);
}

let onbellek: GenelVeri | undefined;

/** Genel koşunun verisi (süreç başına bir kez okunur). Eksik/okunamazsa açık hata. */
export function genelVeri(): GenelVeri {
  if (onbellek) return onbellek;
  const projeId = process.env[GENEL_PROJE_DEGISKENI];
  const ortamId = process.env[GENEL_ORTAM_DEGISKENI];
  if (!projeId || !ortamId) throw new PlatformVeriHatasi(`genel koşu için ${GENEL_PROJE_DEGISKENI} ve ${GENEL_ORTAM_DEGISKENI} gerekir (koşuyu Nöbetçi'den başlatın)`);
  const sonuc = platformOkuyucusunuCalistir(['genel', '--proje', projeId, '--ortam-id', ortamId]);
  if (hataMi(sonuc)) {
    if (sonuc.kod === 'PAROLA_YANLIS') throw new Error(`Platform kasası açılamadı: ${sonuc.hata}`);
    throw new PlatformVeriHatasi(`platform veritabanı okunamadı: ${sonuc.hata}`);
  }
  const cikti = sonuc as Partial<GenelVeri> & { durum?: string; yasakAdresler?: PlatformYasakAdresleri; kosuAyarlari?: Record<string, string> };
  if (cikti.durum !== 'hazir') throw new PlatformVeriHatasi('veritabanı bulunamadı');
  yasakAdresleriniBirlestir(cikti.yasakAdresler);
  // Kasadaki kayıtlı koşu ayarları: ortam değişkeni verilmemiş koşularda (terminal / CI) Ayarlar > Koşu değerleri kullanılır.
  kasaKosuAyarlariniYukle(cikti.kosuAyarlari);
  onbellek = { projeId, ortamId, model: cikti.model ?? null, giris: cikti.giris ?? null, girisProfilleri: cikti.girisProfilleri ?? {}, girisTarifi: cikti.girisTarifi ?? null, izinler: cikti.izinler ?? {} };
  return onbellek;
}

/** Ortamın giriş tarifi (doğrulanmış). Tanımlı değil ya da geçersizse açık hata. */
export function genelGirisTarifi(): GirisTarifi {
  return tarifiHazirla(genelVeri().girisTarifi?.tarif ?? null, 'Bu ortam');
}

/**
 * Giriş motoru için kimlik (şifreler yalnızca bellekte). profil: giriş profilinin ADI (senaryonun giriş seçimi ya da
 * "Yeniden giriş" adımı); verilmezse ortamın varsayılan profili. Eksikse açık hata.
 */
export function genelGirisKimligi(profil?: string | null): GirisKimligi {
  const v = genelVeri();
  // Giriş bilgisi kullanımı izni (Ayarlar > İzinler): kapalıysa parola / kod hiçbir forma yazılmaz (veri-oku.mjs gizlileri zaten vermez).
  if (v.izinler['giris-bilgisi'] !== true) throw new Error(izinMesaji('giris-bilgisi'));
  const giris = profil ? v.girisProfilleri[profil] ?? null : v.giris;
  if (profil && !giris) throw new Error(`"${profil}" giriş profili bu ortamda tanımlı değil (Nöbetçi > Ayarlar > Giriş profilleri).`);
  if (!giris?.kullaniciAdi || !giris.parola) {
    throw new Error(`${profil ? `"${profil}" giriş profilinde` : 'Bu ortamın giriş profilinde'} kullanıcı adı ve parola tanımlı olmalı (Nöbetçi > Ayarlar > Giriş profilleri).`);
  }
  return {
    kullaniciAdi: giris.kullaniciAdi, parola: giris.parola, totpGizli: giris.totpGizli, sabitKod: giris.sabitKod, smsKipi: giris.smsKipi ?? null,
    ekAlanlar: giris.ekAlanlar ?? {}, gizliEkAlanlar: giris.gizliEkAlanlar ?? []
  };
}

/**
 * Paylaşılan oturum dosyası: ortam + giriş profili başına, ÇALIŞMA ALANININ veri klasöründe (<veritabanı klasörü>/oturumlar/;
 * Git dışında, çalışma alanları birbirinin oturumunu görmez). Ada "genel-" öneki ve ortam KİMLİĞİ girer — ortamın adı şifreli
 * saklandığı için dosya adına yazılmaz.
 */
export function genelOturumDosyasi(): string {
  const v = genelVeri();
  const temiz = (d: string): string => d.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);
  const klasor = join(dirname(platformVeritabaniYolu()), 'oturumlar');
  // Eski düz metin oturum dosyaları (.json) silinir; oturum artık kasa anahtarıyla şifreli (.oturum) saklanır.
  eskiOturumDosyalariniSil(klasor);
  return join(klasor, `genel-${temiz(v.ortamId)}-${v.giris?.profilKimligi ? temiz(v.giris.profilKimligi) : 'profil-yok'}${OTURUM_UZANTISI}`);
}
