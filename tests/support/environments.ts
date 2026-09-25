import type { GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { girisHazirMi, tarifiHazirla, type GirisKimligi } from './giris-motoru';
import { platformVerisi, platformVerisiVarsa } from './platform-veri';

export type EnvironmentName = 'canli' | 'test';

type LoginDefinition = {
  /** Paylaşılan oturum dosyası: ortam + giriş profili başına (bkz. oturumDosyasi). */
  storageState: string;
};

type EnvironmentDefinition = {
  baseURL: string | undefined;
  login: LoginDefinition;
};

// Taban adres YALNIZCA platform veritabanından (ortamın kayıtlı adresi). Kasa anahtarı henüz yokken
// (playwright.config.ts, global-setup parolayı sormadan önce değerlendirilir) undefined döner; worker'lar
// yapılandırmayı anahtarla yeniden yükler.
function tabanAdresi(ortam: EnvironmentName): string | undefined {
  return platformVerisiVarsa(ortam)?.tabanUrl;
}

/**
 * Paylaşılan oturum dosyası (storageState): ortam + giriş profili başına — profil değişince eski
 * profilin oturumu kullanılmaz. Anahtar henüz yokken (yapılandırmanın ilk değerlendirmesi) profil
 * bilinemez; worker'lar anahtarla doğru yolu görür.
 */
function oturumDosyasi(ortam: EnvironmentName): string {
  const profil = platformVerisiVarsa(ortam)?.giris?.profilKimligi;
  return `playwright/.auth/${ortam}-${profil ? profil.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36) : 'profil-yok'}.json`;
}

// Ortama göre değişen tek şey veritabanındaki taban adres ve oturum dosyasıdır; giriş sayfasının
// seçicileri, başarı/hata göstergeleri, iki aşamalı doğrulama ve bağlam (acente) değiştirme adımları
// ortamın GİRİŞ TARİFİNDEDİR (Nöbetçi > Ayarlar > Giriş profilleri > Giriş tarifi; bkz. giris-motoru.ts).
export const environments: Record<EnvironmentName, EnvironmentDefinition> = {
  canli: {
    get baseURL() {
      return tabanAdresi('canli');
    },
    login: {
      get storageState() {
        return oturumDosyasi('canli');
      }
    }
  },
  test: {
    get baseURL() {
      return tabanAdresi('test');
    },
    login: {
      get storageState() {
        return oturumDosyasi('test');
      }
    }
  }
};

export function getEnvironmentName(value = process.env.TEST_ENV): EnvironmentName {
  const normalized = (value ?? 'test').toLocaleLowerCase('tr-TR');

  if (normalized !== 'test' && normalized !== 'canli') {
    throw new Error('TEST_ENV yalnızca "test" veya "canli" olabilir.');
  }

  return normalized;
}

export function getEnvironment(environment = getEnvironmentName()): EnvironmentDefinition {
  const definition = environments[environment];

  if (!definition.baseURL) {
    throw new Error(`${environment.toUpperCase()} ortamının taban adresi platform veritabanında yok (Nöbetçi > Ayarlar > Ortamlar).`);
  }

  return definition;
}

/** Ortamın etkin giriş tarifi (doğrulanmış). Tanımlı değil ya da geçersizse açık hata (GirisHatasi). */
export function girisTarifi(environment: EnvironmentName): GirisTarifi {
  const t = platformVerisi(environment).girisTarifi;
  return tarifiHazirla(t?.tarif ?? null, `${environment.toUpperCase()} ortamı`);
}

/**
 * Giriş yapılabilir mi? Kullanıcı adı + parola ve tarifin ikinci adımının istediği kod kaynağı (TOTP
 * anahtarı / sabit kod / elle) hazırsa true. Spec'ler test.skip kararında kullanır.
 */
export function hasCredentials(environment: EnvironmentName): boolean {
  const veri = platformVerisi(environment);
  const tarif = veri.girisTarifi?.tarif ?? null;
  const giris = veri.giris;
  return girisHazirMi(tarif as GirisTarifi | null, giris ? { ...giris, parola: giris.parola ?? '' } : null).hazir;
}

/** Giriş motoru için kimlik (şifreler yalnızca bellekte). Eksikse açık hata. */
export function girisKimligi(environment: EnvironmentName): GirisKimligi {
  const giris = platformVerisi(environment).giris;
  if (!giris?.kullaniciAdi || !giris.parola) {
    throw new Error(`Platformdaki ${environment.toUpperCase()} giriş profilinde kullanıcı adı ve parola tanımlı olmalı (Ayarlar > Giriş profilleri).`);
  }
  return {
    kullaniciAdi: giris.kullaniciAdi,
    parola: giris.parola,
    totpGizli: giris.totpGizli,
    sabitKod: giris.sabitKod,
    smsKipi: giris.smsKipi ?? null
  };
}
