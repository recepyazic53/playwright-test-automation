import { platformVerisi, platformVerisiVarsa } from './platform-veri';
import { totpKoduUret } from './totp';

export type EnvironmentName = 'canli' | 'test';

type LoginDefinition = {
  authenticatorRequired: boolean;
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

// Ortama göre değişen URL, alan seçicileri ve oturum dosyası sadece burada tutulur.
// Test case'lerde kullanıcı adı/şifre alanının seçicisini tekrar yazmayın.
export const environments: Record<EnvironmentName, EnvironmentDefinition> = {
  canli: {
    get baseURL() {
      return tabanAdresi('canli');
    },
    login: {
      authenticatorRequired: true,
      storageState: 'playwright/.auth/canli-acente.json'
    }
  },
  test: {
    get baseURL() {
      return tabanAdresi('test');
    },
    login: {
      authenticatorRequired: false,
      storageState: 'playwright/.auth/test-acente.json'
    }
  }
};

export type Credentials = {
  username: string;
  password: string;
  authenticatorCode?: string;
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

export function hasCredentials(environment: EnvironmentName): boolean {
  const giris = platformVerisi(environment).giris;
  // CANLI'da 2FA zorunlu — TOTP anahtarı ya da (yedek olarak) sabit bir kod tanımlı değilse, parola
  // doğru olsa bile giriş tamamlanamaz.
  const ikiFaktor = environment !== 'canli' || Boolean(giris?.totpGizli || giris?.sabitKod);
  return Boolean(giris?.kullaniciAdi && giris.parola) && ikiFaktor;
}

export function credentialsFromEnvironment(environment: EnvironmentName): Credentials {
  const giris = platformVerisi(environment).giris;
  if (!giris?.kullaniciAdi || !giris.parola) {
    throw new Error(`Platformdaki ${environment.toUpperCase()} giriş profilinde kullanıcı adı ve parola tanımlı olmalı (Ayarlar > Giriş profilleri).`);
  }
  return {
    username: giris.kullaniciAdi,
    password: giris.parola,
    // 2FA kodu yalnızca CANLI için: TOTP anahtarı varsa anlık üretilir, yoksa sabit kod kullanılır.
    authenticatorCode: environment === 'canli'
      ? (giris.totpGizli ? totpKoduUret(giris.totpGizli) : giris.sabitKod ?? undefined)
      : undefined
  };
}
