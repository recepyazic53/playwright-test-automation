// Platform raporlayıcısının (scripts/platform/raporlayici.mjs) Playwright'a verilen GİRİŞ NOKTASI.
// Neden doğrudan .mjs değil: playwright.config.ts (TypeScript → CommonJS) platform-veri.ts üzerinden
// scripts/platform/calisma-alanlari.mjs gibi modülleri CommonJS'e çevirerek önceden yükler. Raporlayıcı
// .mjs olarak verilirse Playwright onu ES modülü olarak içe aktarır; Node 24 + Playwright 1.63'te aynı
// dosyanın önbellekteki CommonJS kopyasından adlı dışa aktarımlar görünmez ve koşu açılışta
// "does not provide an export named ..." hatasıyla düşer. Bu dosya raporlayıcıyı da aynı (CommonJS)
// yoldan yükletir. Koruma testi: tests/birim/raporlayici-yukleme.spec.ts
export { default } from '../../scripts/platform/raporlayici.mjs';
