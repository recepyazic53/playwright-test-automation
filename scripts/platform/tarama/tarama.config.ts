import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import {
  KAYIT_CDP_PORTU_DEGISKENI, TARAMA_CIKTI_DEGISKENI, TARAMA_DNS_KAPALI_DEGISKENI, TARAMA_GORUNUR_DEGISKENI, TARAMA_TEST_SURESI_DEGISKENI
} from './protokol.mjs';

// OTOMATİK TARAMA / AKIŞ KAYDI İŞİNİN Playwright yapılandırması — YALNIZCA Nöbetçi sunucusu (tarama/yonetici.mjs)
// kullanır. Ana (playwright.config.ts) ve birim (playwright.birim.config.ts) yapılandırmalarından AYRIDIR: globalSetup
// (giriş), raporlayıcılar, video/iz yoktur; tek tarayıcı, tek işçi, yeniden deneme yok. Tarama başsızdır; akış kaydı
// (NOBETCI_TARAMA_GORUNUR=1) görünür tarayıcıda çalışır. Çıktı klasörü geçicidir (proje klasörüne yazılmaz).
// Oturum/ekran görüntüsü diske yazılmaz: sonuç sunucuya HTTP ile gider.
const cdpPortu = Number(process.env[KAYIT_CDP_PORTU_DEGISKENI]) || 0;
const argumanlar = [
  // Yerel fikstürlü testlerde tarayıcı DNS çözümlemez (yalnızca 127.0.0.1/localhost).
  ...(process.env[TARAMA_DNS_KAPALI_DEGISKENI] === '1' ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] : []),
  // YALNIZCA testler: kayıt panelini test sürecinin sürebilmesi için yerel uzaktan hata ayıklama portu.
  ...(cdpPortu ? [`--remote-debugging-port=${cdpPortu}`, '--remote-debugging-address=127.0.0.1'] : [])
];

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
    headless: process.env[TARAMA_GORUNUR_DEGISKENI] !== '1',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    launchOptions: { args: argumanlar }
  }
});
