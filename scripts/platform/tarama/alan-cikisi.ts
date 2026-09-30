// Alan doldurulduktan sonra kullanıcı gibi alandan çıkma: (1) açık takvim / açılır pencere kapatılır (Escape),
// (2) Tab ile change / blur (ve buna bağlı sorgu) tetiklenir, (3) pencere hâlâ açıksa sayfanın boş bir yerine tıklanır.
// Motor genel kalır: yalnız yaygın takvim bileşenlerinin sınıfları aranır; ürüne / siteye özgü sabit yoktur.
import type { Locator, Page } from '@playwright/test';

/** Görünür bir takvim / tarih seçici penceresi var mı (jQuery UI, Bootstrap, flatpickr, pikaday vb.). */
export async function acikTakvimVar(sayfa: Page): Promise<boolean> {
  return sayfa.evaluate(() => {
    const secici = '.ui-datepicker, .datepicker-dropdown, .datepicker.dropdown-menu, .bootstrap-datetimepicker-widget, .flatpickr-calendar.open, .pika-single:not(.is-hidden), .react-datepicker-popper, .daterangepicker, .air-datepicker.-active-, [role="dialog"][class*="datepicker" i], [class*="calendar" i][class*="popup" i]';
    return [...document.querySelectorAll(secici)].some((e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0;
    });
  }).catch(() => false);
}

export async function alandanCik(alan: Locator): Promise<void> {
  const sayfa = alan.page();
  if (await acikTakvimVar(sayfa)) await alan.press('Escape', { timeout: 2_000 }).catch(() => undefined);
  await alan.press('Tab', { timeout: 3_000 }).catch(() => alan.blur({ timeout: 2_000 }).catch(() => undefined));
  if (await acikTakvimVar(sayfa)) {
    const nokta = await bosNokta(sayfa);
    if (nokta) await sayfa.mouse.click(nokta.x, nokta.y).catch(() => undefined);
    await sayfa.waitForTimeout(100);
  }
}

/** Tıklanınca hiçbir şey başlatmayacak boş bir nokta (bağlantı / düğme / alan / takvim üstü değil); yoksa null. */
async function bosNokta(sayfa: Page): Promise<{ x: number; y: number } | null> {
  return sayfa.evaluate(() => {
    const engel = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [onclick], [tabindex], iframe, video, canvas, .ui-datepicker, [class*="datepicker" i], [class*="calendar" i]';
    const g = window.innerWidth, y = window.innerHeight;
    for (const fy of [0.97, 0.9, 0.75, 0.5, 0.25, 0.05]) {
      for (const fx of [0.97, 0.9, 0.75, 0.5, 0.25, 0.05]) {
        const px = Math.round(g * fx), py = Math.round(y * fy);
        const e = document.elementFromPoint(px, py);
        if (e && !e.closest(engel)) return { x: px, y: py };
      }
    }
    return null;
  }).catch(() => null);
}

/** Alanın sayfadaki değeri istenen değerle aynı mı (biçim farkları yok sayılır: boşluk, tire, parantez, büyük/küçük harf). */
export async function alanZatenDolu(alan: Locator, deger: string): Promise<boolean> {
  const sade = (m: string): string => m.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const istenen = sade(deger);
  if (!istenen) return false;
  const mevcut = await alan.inputValue({ timeout: 1_000 }).catch(() => null);
  return mevcut !== null && sade(mevcut) === istenen;
}
