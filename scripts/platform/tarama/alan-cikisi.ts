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

/** Bu uzunluğa kadar (tek satırlı) değerler varsayılan olarak GERÇEK TUŞLARLA yazılır; daha uzunları doğrudan (fill). */
export const TUSLAMA_EN_COK_KARAKTER = 40;
/** Varsayılan tuşlama aralığı (ms): maske / sorgu betikleri her tuşu işleyebilsin, uzun sürmesin. */
export const TUSLAMA_ARALIGI_MS = 10;
/** Tuşlanabilen girdi türleri (tarih / saat / renk / aralık gibi tarayıcı denetimleri doğrudan yazılır). */
const TUSLANAN_TURLER = new Set(['', 'text', 'tel', 'search', 'number', 'email', 'url', 'password']);

/**
 * Yazma kipi: 'tus' (gerçek tuş olayları: keydown / keypress / input / keyup) ya da 'dogrudan' (fill: tek input olayı).
 * Kural (ürün geneli, siteye özgü değil): tek satırlı kısa metin (≤ TUSLAMA_EN_COK_KARAKTER) tuşlanır — maske eklentileri (telefon,
 * kimlik no, tarih) tuş olaylarını bekler ve "11 hane olunca ara" gibi sorgular keyup'a bağlıdır; fill ile yazılan değeri maske alandan
 * çıkınca siler ve sorgu tetiklenmez. Uzun metin, çok satırlı değer, textarea / contenteditable ve tarayıcı denetimli türler
 * (date, time…) doğrudan yazılır. Maske ipucu olan alan (data-*mask*, inputmask, placeholder'da "_") uzunluktan bağımsız tuşlanır.
 */
export async function yazmaKipiSec(alan: Locator, deger: string, istek: 'otomatik' | 'tus' | 'dogrudan' = 'otomatik'): Promise<'tus' | 'dogrudan'> {
  if (istek !== 'otomatik') return istek;
  if (!deger || /[\r\n]/.test(deger)) return 'dogrudan';
  const bilgi = await alan.evaluate((e) => {
    const el = e as HTMLInputElement;
    const etiket = el.tagName;
    const nitelikler = [...el.attributes].map((a) => `${a.name}=${a.value}`).join(' ');
    return {
      girdi: etiket === 'INPUT', tur: etiket === 'INPUT' ? (el.getAttribute('type') ?? '').toLowerCase() : '',
      maske: /mask/i.test(nitelikler) || /_/.test(el.getAttribute('placeholder') ?? '')
    };
  }, undefined, { timeout: 2_000 }).catch(() => null);
  if (!bilgi || !bilgi.girdi || !TUSLANAN_TURLER.has(bilgi.tur)) return 'dogrudan';
  return bilgi.maske || deger.length <= TUSLAMA_EN_COK_KARAKTER ? 'tus' : 'dogrudan';
}

/**
 * Alanı gerçek tuşlarla yazar. Alanda değer varsa önce klavyeyle (tümünü seç + sil) temizlenir — tuş dinleyen maske de boşaldığını
 * görür; klavye temizleyemezse fill('') yedeği. Sonra değer tuşlanır (her karakter için keydown / keypress / input / keyup).
 */
async function tuslayarakYaz(alan: Locator, deger: string, aralikMs: number, zamanAsimiMs: number): Promise<void> {
  const mevcut = await alan.inputValue({ timeout: 1_000 }).catch(() => '');
  if (mevcut) {
    await alan.click({ timeout: 3_000 }).catch(() => undefined);
    await alan.press('ControlOrMeta+a', { timeout: 2_000 }).catch(() => undefined);
    await alan.press('Backspace', { timeout: 2_000 }).catch(() => undefined);
    if (await alan.inputValue({ timeout: 1_000 }).catch(() => '')) await alan.fill('', { timeout: 2_000 }).catch(() => undefined);
  }
  await alan.pressSequentially(deger, { delay: aralikMs, timeout: zamanAsimiMs });
}

/**
 * Metin alanına değer yazar ve alandan çıkar — hızlı test, doğrulama koşusu ve normal koşunun (model-kosucu.ts) ORTAK yazma yolu
 * (kural tek yerde). Sıra: (1) kipe göre yaz (yazmaKipiSec: kısa metin gerçek tuşlarla, "yaz-sil-yaz" olmaz); doğrudan yazılan değer
 * hemen boş kaldıysa tuşlayarak, (2) alandan çık (+ sonra: sayfanın sakinleşmesi), (3) sayfa değeri alandan çıkınca sildiyse (ör. sonraki
 * sorgu satırı yeniden çizdi) bir kez tuşlayarak yeniden yaz ve yeniden çık. Değer sayfada biçimlenebilir (maske "(542) 650-2153"):
 * doğrulama biçimden bağımsızdır (alanZatenDolu); yalnız BOŞ kalan alan yeniden yazılır.
 * @returns 'tamam' ya da 'silindi' (tuşlanarak yazılan değer de alandan çıkınca silindi)
 */
export async function alanaYaz(
  alan: Locator, deger: string,
  secenek: { tuslayarak?: boolean; kip?: 'otomatik' | 'tus' | 'dogrudan'; aralikMs?: number; zamanAsimiMs: number; sonra?: () => Promise<void> }
): Promise<'tamam' | 'silindi'> {
  const bos = async (): Promise<boolean> => !(await alan.inputValue({ timeout: 1_000 }).catch(() => 'x')).trim();
  const aralik = secenek.aralikMs ?? TUSLAMA_ARALIGI_MS;
  const tusla = (): Promise<void> => tuslayarakYaz(alan, deger, aralik, secenek.zamanAsimiMs);
  // Alan henüz çizilmediyse (önceki basışın sonucu gecikmeli) görünmesi beklenir: kip, alanın kendisine bakılarak seçilir.
  await alan.waitFor({ state: 'visible', timeout: secenek.zamanAsimiMs });
  const kip =await yazmaKipiSec(alan, deger, secenek.tuslayarak ? 'tus' : secenek.kip ?? 'otomatik');
  if (kip === 'tus') await tusla();
  else {
    await alan.fill(deger, { timeout: secenek.zamanAsimiMs });
    if (await bos()) await tusla();
  }
  await alandanCik(alan);
  await secenek.sonra?.();
  if (deger.trim() && (await bos())) {
    await alan.click({ timeout: 3_000 }).catch(() => undefined);
    await tusla();
    await alandanCik(alan);
    await secenek.sonra?.();
    if (await bos()) return 'silindi';
  }
  return 'tamam';
}
