import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { TARAMA_CIKTI_DEGISKENI, TARAMA_DNS_KAPALI_DEGISKENI, TARAMA_TEST_SURESI_DEGISKENI } from './protokol.mjs';

// OTOMATİK TARAMA İŞİNİN Playwright yapılandırması — YALNIZCA Nöbetçi sunucusu (tarama/yonetici.mjs) kullanır.
// Ana (playwright.config.ts) ve birim (playwright.birim.config.ts) yapılandırmalarından AYRIDIR: globalSetup (giriş),
// raporlayıcılar, video/iz yoktur; başsız tek tarayıcı, tek işçi, yeniden deneme yok. Çıktı klasörü geçicidir
// (proje klasörüne yazılmaz). Oturum/ekran görüntüsü diske yazılmaz: sonuç sunucuya HTTP ile gider.
export default defineConfig({
  testDir: __dirname,
  testMatch: /tarama\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: Number(process.env[TARAMA_TEST_SURESI_DEGISKENI]) || 330_000,
  outputDir: process.env[TARAMA_CIKTI_DEGISKENI] || join(tmpdir(), 'nobetci-tarama-cikti'),
  reporter: [['line']],
  use: {
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    // Yerel fikstürlü testlerde tarayıcı DNS çözümlemez (yalnızca 127.0.0.1/localhost).
    launchOptions: process.env[TARAMA_DNS_KAPALI_DEGISKENI] === '1'
      ? { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] }
      : {}
  }
});
