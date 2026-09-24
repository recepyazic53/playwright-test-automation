import { platformVerisi } from './platform-veri';
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

// Taban adres: proje dosyaları platform veritabanına aktarıldıysa (ve kasa anahtarı varsa)
// ortamın kayıtlı adresi, aksi halde eskisi gibi .env (TEST_BASE_URL / CANLI_BASE_URL).
// Anahtar global-setup'ta sorulmadan önce (config değerlendirmesi) sessizce .env'e düşülür.
function tabanAdresi(ortam: EnvironmentName): string | undefined {
  const platform = platformVerisi(ortam, { sessizAnahtarYok: true });
  if (platform) return platform.tabanUrl;
  return ortam === 'canli' ? process.env.CANLI_BASE_URL : process.env.TEST_BASE_URL;
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
    throw new Error(`${environment.toUpperCase()}_BASE_URL .env dosyasında tanımlı olmalı.`);
  }

  return definition;
}

export function hasCredentials(environment: EnvironmentName): boolean {
  const platform = platformVerisi(environment, { sessizAnahtarYok: true });
  if (platform) {
    const giris = platform.giris;
    const ikiFaktor = environment !== 'canli' || Boolean(giris?.totpGizli || giris?.sabitKod);
    return Boolean(giris?.kullaniciAdi && giris.parola) && ikiFaktor;
  }
  const username = process.env.LOGIN_USERNAME ?? process.env.TEST_USERNAME;
  const password =
    environment === 'canli' ? process.env.CANLI_PASSWORD : process.env.TEST_PASSWORD;
  // CANLI'da 2FA zorunlu — TOTP secret'ı ya da (yedek olarak) sabit bir kod tanımlı
  // değilse, şifre doğru olsa bile login tamamlanamaz; bu yüzden burada da aranıyor.
  const ikiFaktorVarMi =
    environment !== 'canli' || Boolean(process.env.CANLI_AUTH_SECRET || process.env.CANLI_AUTH_CODE);

  return Boolean(username && password) && ikiFaktorVarMi;
}

export function credentialsFromEnvironment(environment: EnvironmentName): Credentials {
  const platform = platformVerisi(environment, { sessizAnahtarYok: true });
  if (platform) {
    const giris = platform.giris;
    if (!giris?.kullaniciAdi || !giris.parola) {
      throw new Error(`Platformdaki ${environment.toUpperCase()} giriş profilinde kullanıcı adı ve parola tanımlı olmalı (Ayarlar > Giriş profilleri).`);
    }
    return {
      username: giris.kullaniciAdi,
      password: giris.parola,
      // Eski davranışla aynı: 2FA kodu yalnızca CANLI için; TOTP anahtarı varsa anlık üretilir,
      // yoksa sabit kod (eski CANLI_AUTH_CODE) kullanılır.
      authenticatorCode: environment === 'canli'
        ? (giris.totpGizli ? totpKoduUret(giris.totpGizli) : giris.sabitKod ?? undefined)
        : undefined
    };
  }
  const username = process.env.LOGIN_USERNAME ?? process.env.TEST_USERNAME;
  const password =
    environment === 'canli' ? process.env.CANLI_PASSWORD : process.env.TEST_PASSWORD;

  if (!username || !password) {
    const passwordKey = environment === 'canli' ? 'CANLI_PASSWORD' : 'TEST_PASSWORD';
    throw new Error(`LOGIN_USERNAME ve ${passwordKey} .env dosyasında tanımlı olmalı.`);
  }

  return {
    username,
    password,
    authenticatorCode: environment === 'canli' ? canliAuthKoduUret() : undefined
  };
}

// CANLI'daki 2FA kodu tercihen CANLI_AUTH_SECRET'tan (authenticator uygulamasına QR ile
// eklenen aynı base32 seed) ANLIK olarak üretilir — böylece kod hiçbir zaman eskimez ve
// her koşu öncesi .env'e elle kod girmeye gerek kalmaz. CANLI_AUTH_SECRET tanımlı değilse
// (ör. seed henüz temin edilmediyse) CANLI_AUTH_CODE'daki sabit değer, tek seferlik/elle
// girilen bir yedek olarak kullanılır.
function canliAuthKoduUret(): string | undefined {
  const secret = process.env.CANLI_AUTH_SECRET;
  if (secret) {
    return totpKoduUret(secret);
  }
  return process.env.CANLI_AUTH_CODE;
}
