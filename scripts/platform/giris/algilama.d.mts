// scripts/platform/giris/algilama.mjs için tip bildirimi.
import type { LaunchOptions, Page } from '@playwright/test';

export interface GirisFormuOnerisi {
  bulundu: boolean;
  neden?: string;
  kullaniciAlani?: string;
  parolaAlani?: string;
  gonderDugmesi?: string;
  formVar?: boolean;
  notlar: string[];
}
export declare const CAPTCHA_MESAJI: string;
export declare function girisFormunuAlgila(page: Page, secenekler?: { beklemeSn?: number }): Promise<GirisFormuOnerisi>;
export declare function kodAlaniniAlgila(page: Page, haric?: string[]): Promise<string | null>;
export declare function captchaAlgila(page: Page): Promise<string[]>;
export declare function girisSayfasiniOner(adres: string, secenekler?: { zamanAsimiSn?: number; tarayiciSecenekleri?: LaunchOptions; yasakDesenleri?: ReadonlyArray<{ kalip: string; desen: RegExp }> }): Promise<GirisFormuOnerisi & { captcha: string[]; sonAdres: string | null }>;
