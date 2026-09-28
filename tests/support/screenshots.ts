import type { Page, TestInfo } from '@playwright/test';
import { GORUNTU_ALINAMADI_EKI, KALAN_ADIM_EKI } from '../../scripts/platform/ayarlar/kayit-kurallari.mjs';

// EKRAN GÖRÜNTÜLERİ — adım görüntüleri (attachStepScreenshot) ve canlı izleme (fixtures.ts > canliIzlemeYayini) aynı sayfada
// SIRAYLA alınır: üst üste binen yakalamalar (özellikle tam sayfa yakalama görünüm alanını geçici değiştirirken) Chromium'da
// takılabiliyordu ve süre sınırı olmadığı için koşu sonsuza dek bekliyordu. Her yakalamanın süre sınırı var; tam sayfa
// alınamazsa görünür alan denenir, o da olmazsa koşu takılmaz (görüntü yerine raporda açıklama kalır).

/** Adım görüntüsü süre sınırı (tam sayfa; görünür alan denemesi ayrıca aynı süre). */
export const ADIM_GORUNTUSU_SURESI_MS = 15_000;

/** Sayfa başına sıra: bir yakalama bitmeden diğeri başlamaz. */
const siralar = new WeakMap<Page, Promise<unknown>>();

function sirayla<T>(page: Page, is: () => Promise<T>): Promise<T> {
  const onceki = siralar.get(page) ?? Promise.resolve();
  const simdiki = onceki.catch(() => undefined).then(is);
  siralar.set(page, simdiki.catch(() => undefined));
  return simdiki;
}

/** Süre sınırlı yakalama: Playwright'ın süre sınırına ek olarak kendi zamanlayıcımız (yakalama hiç dönmezse de biter). */
async function sinirliYakala(page: Page, fullPage: boolean, sureMs: number): Promise<Buffer | null> {
  let zamanlayici: ReturnType<typeof setTimeout> | undefined;
  const sure = new Promise<null>((coz) => { zamanlayici = setTimeout(() => coz(null), sureMs + 1_000); });
  try {
    return await Promise.race([page.screenshot({ fullPage, timeout: sureMs }).catch(() => null), sure]);
  } finally {
    clearTimeout(zamanlayici);
  }
}

/**
 * Sayfanın ekran görüntüsü (sırayla, süre sınırlı). fullPage alınamazsa görünür alan denenir; o da olmazsa null.
 * @param s.sureMs yakalama başına süre sınırı
 */
export function ekranGoruntusuAl(page: Page, s: { fullPage: boolean; sureMs: number }): Promise<Buffer | null> {
  return sirayla(page, async () => {
    if (page.isClosed()) return null;
    const tam = await sinirliYakala(page, s.fullPage, s.sureMs);
    if (tam || !s.fullPage || page.isClosed()) return tam;
    return sinirliYakala(page, false, s.sureMs);
  });
}

/**
 * Adımın ekran görüntüsünü ekler (ad: "NN - <adım>"; kalan adımda alınan görüntü "… (kalan adım)" — saklama inceltmesi onu tanır).
 * Alınamazsa koşu takılmaz: görüntü yerine adında nedeni yazan bir not eklenir ("… (ekran görüntüsü alınamadı: <neden>)"); Sonuçlar
 * ekranı bunu "görüntü alınamadı: <neden>" olarak gösterir.
 */
export async function attachStepScreenshot(
  page: Page,
  testInfo: TestInfo,
  stepName: string,
  secenek: { kalanAdim?: boolean } = {}
): Promise<void> {
  const ad = secenek.kalanAdim ? `${stepName}${KALAN_ADIM_EKI}` : stepName;
  const kapali = page.isClosed();
  const screenshot = kapali ? null : await ekranGoruntusuAl(page, { fullPage: true, sureMs: ADIM_GORUNTUSU_SURESI_MS });
  if (!screenshot) {
    const neden = kapali ? 'sayfa kapanmıştı' : `${Math.round(ADIM_GORUNTUSU_SURESI_MS / 1000)} sn süre sınırı doldu`;
    // Görüntü alınamadı: koşu takılmaz; raporda adımın görüntüsü yerine açıklama kalır.
    await testInfo.attach(`${ad}${GORUNTU_ALINAMADI_EKI}: ${neden})`, {
      body: `Ekran görüntüsü alınamadı (${neden}); koşu devam etti.`,
      contentType: 'text/plain'
    });
    return;
  }

  await testInfo.attach(ad, {
    body: screenshot,
    contentType: 'image/png'
  });
}
