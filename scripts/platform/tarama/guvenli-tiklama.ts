// GÜVENLİ TIKLAMA (genel) — normal koşu (tests/support/model-kosucu.ts aksiyonları), hızlı test motoru (hizli-test-motoru.ts basış ve
// doğrulama koşusu) aynı kuralla basar; Playwright dışa aktarma çıktısı (senaryolar/playwright-disa-aktarma.mjs > guvenliTikla) aynı
// davranışın kopyasını yazar. Siteye özgü adres / seçici / sabit yoktur.
//
// Sorun: pencere (modal) açılış animasyonu / sayfanın olay bağlaması (ör. jQuery 'shown' sonrası işleyici) bitmeden yapılan tıklama
// sayfa tarafından yutulur; öğe Playwright için "görünür ve sabit" olsa da (saydamlık 0 → 1 geçişi görünürlüğü etkilemez) henüz hazır
// değildir.
//
// Kural:
//  1) Basmadan önce sayfa sakinleşsin (en çok SAKINLIK_EN_COK_MS): ağ sakin (AgIzleyici; varsa) + görünüm parmak izi (görünür metin
//     uzunluğu, görünür form alanı / düğme / bağlantı sayısı, açık pencerelerin metni ve saydamlığı, adres yolu) GORUNUM_SAKINLIK_MS
//     boyunca değişmesin + hedef öğenin (ve atalarının) sonlu CSS animasyonu / geçişi kalmasın ve etkin saydamlığı sabitlensin.
//     Ardından Playwright'ın kendi hazır olma denetimi (görünür, sabit, etkin) tıklamada yapılır.
//  2) Etkisiz tıklama: tıklamadan sonra ETKI_BEKLEME_MS içinde (a) hiçbir yeni istek (XHR / fetch / belge) başlamadıysa, yeni sekme /
//     tarayıcı uyarısı çıkmadıysa VE (b) görünüm parmak izi değişmediyse VE (c) başarı göstergesi görünmediyse aynı öğeye BİR kez daha
//     basılır. İlk tıklama bir istek başlattıysa ya da sayfada herhangi bir değişiklik olduysa ASLA ikinci kez basılmaz (çift gönderim /
//     ödeme riski). Başarı göstergesi tıklamadan önce zaten görünüyorsa da tekrar yoktur.
import type { BrowserContext, Dialog, Frame, Locator, Page, Request } from '@playwright/test';
import type { AgIzleyici } from './ag-sakinligi';
import { bosNokta } from './alan-cikisi';

/** Görünüm parmak izinin değişmeden kalması gereken süre (ms). */
export const GORUNUM_SAKINLIK_MS = 700;
/** Basmadan önceki sakinlik beklemesinin üst sınırı (ms); dolunca yine basılır. */
export const SAKINLIK_EN_COK_MS = 5_000;
/** Tıklamanın etkisi için bakılan süre (ms); etki görülünce hemen biter. */
export const ETKI_BEKLEME_MS = 3_000;
/** Ağ sakinliği için istek etkinliği olmayan süre (ms). */
const AG_SESSIZLIK_MS = 300;
const ORNEK_MS = 100;

/** Etkisiz tıklama tekrarlandığında adım ayrıntısına / farka düşen not. */
export const TEKRAR_NOTU = 'ilk tıklama etkisizdi, bir kez daha tıklandı';

/** Başarı göstergesi görünmeyip tıklama etkisiz kaldığında hata iletisine eklenen açıklama. */
export const etkisizTiklamaMetni = (ad: string, tekrar: boolean): string =>
  `“${ad}” tıklandı${tekrar ? ' (iki kez)' : ''} ama sayfada hiçbir şey değişmedi; öğe hazır olmadan tıklanmış olabilir`;

/**
 * Bir belgenin görünüm parmak izi (tarayıcıda çalışır; kendi içinde bağımsız olmalı). Adresin #parçası girmez: işleyicisi bağlanmamış
 * href="#" bağlantısı yalnız #'i değiştirir, bu bir etki sayılmaz.
 */
export function belgeParmakIzi(): string {
  const gorunur = (e: Element): boolean => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const saydamlik = (e: Element | null): number => {
    let o = 1;
    for (let x = e; x; x = x.parentElement) { const v = parseFloat(getComputedStyle(x).opacity); o *= Number.isNaN(v) ? 1 : v; }
    return o;
  };
  const govde = document.body;
  if (!govde) return `bos|${location.pathname}${location.search}`;
  const metin = govde.innerText.length;
  const ogeler = [...document.querySelectorAll('input,select,textarea,button,a[href],[role="button"],[role="link"]')].filter(gorunur).length;
  const pencereler = [...document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],.modal')]
    .filter(gorunur).map((p) => `${(p as HTMLElement).innerText.length}:${saydamlik(p).toFixed(2)}`);
  return `${metin}|${ogeler}|${pencereler.join(',')}|${location.pathname}${location.search}`;
}

/** Hedef öğenin hazır olma durumu (tarayıcıda): sonlu animasyon sürüyorsa 'anim', yoksa etkin saydamlık. */
function ogeHareketi(e: Element): string {
  let o = 1;
  for (let x: Element | null = e; x; x = x.parentElement) {
    for (const a of x.getAnimations()) {
      if (a.playState !== 'running') continue;
      const son = a.effect?.getComputedTiming().endTime;
      if (typeof son === 'number' && Number.isFinite(son)) return 'anim';
    }
    const v = parseFloat(getComputedStyle(x).opacity);
    o *= Number.isNaN(v) ? 1 : v;
  }
  return o.toFixed(3);
}

/** Sayfanın (ana belge + çerçeveler; en çok 10) parmak izi. Okunamazsa (gezinme sürüyor) null. */
export async function sayfaParmakIzi(page: Page): Promise<string | null> {
  try {
    const cerceveler = page.frames().slice(0, 10);
    const izler = await Promise.all(cerceveler.map((f: Frame) => (f === page.mainFrame() ? f.evaluate(belgeParmakIzi) : f.evaluate(belgeParmakIzi).catch(() => '-'))));
    return `${cerceveler.length}#${izler.join('#')}`;
  } catch {
    return null;
  }
}

/**
 * Basmadan önce sayfanın sakinleşmesini bekler (en çok enCokMs): ağ (varsa) + görünüm + hedef öğenin animasyonu / saydamlığı.
 * Öğe görünür değilse beklemez (tıklamanın kendi zaman aşımı karar verir).
 */
export async function sakinlikBekle(page: Page, oge: Locator, s: { ag?: AgIzleyici | null; enCokMs?: number } = {}): Promise<void> {
  const bitis = Date.now() + (s.enCokMs ?? SAKINLIK_EN_COK_MS);
  let oncekiIz: string | null = null;
  let oncekiHareket: string | null = null;
  let sabitSince = Date.now();
  while (Date.now() < bitis) {
    if (page.isClosed()) return;
    const iz = await sayfaParmakIzi(page);
    const hareket = await oge.evaluate(ogeHareketi, undefined, { timeout: 1_000 }).catch(() => 'yok');
    const durgun = iz !== null && iz === oncekiIz && hareket !== 'anim' && hareket === oncekiHareket;
    if (!durgun) { oncekiIz = iz; oncekiHareket = hareket; sabitSince = Date.now(); }
    const agSakin = !s.ag || s.ag.sakinMi(0, { sessizlikMs: AG_SESSIZLIK_MS });
    if (durgun && agSakin && Date.now() - sabitSince >= GORUNUM_SAKINLIK_MS) return;
    await page.waitForTimeout(ORNEK_MS);
  }
}

/** Tıklamanın etkisini izler: yeni istek (XHR / fetch / belge), yeni sekme, tarayıcı uyarısı. */
function etkiIzle(page: Page): { etki: () => string | null; birak: () => void } {
  let etki: string | null = null;
  const istek = (r: Request): void => { const t = r.resourceType(); if (t === 'xhr' || t === 'fetch' || t === 'document') etki ??= 'istek'; };
  const sekme = (): void => { etki ??= 'sekme'; };
  const baglam: BrowserContext = page.context();
  // Gözlemci: uyarıyı sayfanın kendi dinleyicisi (koşucu / motor / dışa aktarma) yanıtlar. Playwright, sayfada ya da bağlamda HERHANGİ
  // bir 'dialog' dinleyicisi varsa pencereyi kendiliğinden kapatmaz; bu gözlemci tek dinleyiciyse pencere açık kalıp tıklama hiç
  // dönmezdi. Bu yüzden başka dinleyici yoksa Playwright'ın varsayılanı (kapat) burada uygulanır: sayfa hiçbir durumda takılı kalmaz.
  // Sayılamıyorsa (beklenmedik sürüm) başka dinleyici var sayılır: önceki davranış korunur.
  const dinleyiciSayisi = (o: unknown): number => {
    const f = (o as { listenerCount?: (ad: string) => number }).listenerCount;
    return typeof f === 'function' ? f.call(o, 'dialog') : 99;
  };
  const uyari = (d: Dialog): void => {
    etki ??= 'uyari';
    if (dinleyiciSayisi(page) <= 1 && dinleyiciSayisi(baglam) === 0) void d.dismiss().catch(() => undefined);
  };
  page.on('request', istek);
  page.on('dialog', uyari);
  baglam.on('page', sekme);
  return {
    etki: () => etki,
    birak: () => { page.off('request', istek); page.off('dialog', uyari); baglam.off('page', sekme); }
  };
}

/** etkiIzle + parmak izi + başarı göstergesi: ETKI_BEKLEME_MS içinde bir etki görülürse true (hemen döner). */
async function etkiBekle(page: Page, once: string | null, izle: { etki: () => string | null }, basariVarMi?: () => Promise<boolean>): Promise<boolean> {
  const bitis = Date.now() + ETKI_BEKLEME_MS;
  for (;;) {
    if (izle.etki() || page.isClosed()) return true;
    const iz = await sayfaParmakIzi(page);
    // Parmak izi okunamadı (gezinme) ya da değişti: etki var.
    if (iz === null || iz !== once) return true;
    if (basariVarMi && (await basariVarMi().catch(() => false))) return true;
    if (Date.now() >= bitis) return false;
    await page.waitForTimeout(ORNEK_MS * 1.5);
  }
}

export type TiklamaSonucu = {
  /** İlk tıklama etkisiz kaldı ve öğeye bir kez daha basıldı. */
  tekrarlandi: boolean;
  /** Son tıklamadan sonra da hiçbir etki görülmedi (istek yok, görünüm aynı, başarı göstergesi yok). */
  etkisiz: boolean;
};

/**
 * Güvenli tıklama: sakinlik → tıkla → etki yoksa bir kez daha tıkla. tikla: öğeye basan işlev (koşucunun çerçeve sarmalayıcısı gibi);
 * verilmezse oge.click({ timeout: zamanMs }). basariVarMi: adımın başarı göstergesi (yoksa yalnız istek / görünüm değişimine bakılır).
 */
export async function guvenliTikla(page: Page, oge: Locator, s: {
  zamanMs: number; ag?: AgIzleyici | null; basariVarMi?: () => Promise<boolean>; tikla?: (oge: Locator, zamanMs: number) => Promise<void>;
  /** false: sakinlik çağıran tarafından zaten beklendi (ör. hızlı testte yazma izni açılmadan önce). */
  sakinlik?: boolean;
}): Promise<TiklamaSonucu> {
  const tikla = s.tikla ?? ((l: Locator, ms: number) => l.click({ timeout: ms }));
  if (s.sakinlik !== false) {
    // Öğe henüz yoksa önce görünmesi beklenir (tıklamanın zaman aşımıyla); görünmezse tıklama kendi hatasını verir.
    await oge.waitFor({ state: 'visible', timeout: s.zamanMs }).catch(() => undefined);
    await sakinlikBekle(page, oge, { ag: s.ag });
  }
  // Başarı göstergesi zaten görünüyorsa tekrar kararı verilemez: düz tıklama.
  const basariOnce = s.basariVarMi ? await s.basariVarMi().catch(() => false) : false;
  const once = await sayfaParmakIzi(page);
  const izle = etkiIzle(page);
  try {
    await tikla(oge, s.zamanMs);
    if (basariOnce || once === null) return { tekrarlandi: false, etkisiz: false };
    if (await etkiBekle(page, once, izle, s.basariVarMi)) return { tekrarlandi: false, etkisiz: false };
    // Etkisiz: aynı öğeye bir kez daha (öğe artık yoksa / basılamıyorsa sessizce geçilir; adımın sonucu karar verir).
    const basildi = await tikla(oge, Math.min(s.zamanMs, 5_000)).then(() => true, () => false);
    if (!basildi) return { tekrarlandi: false, etkisiz: true };
    return { tekrarlandi: true, etkisiz: !(await etkiBekle(page, once, izle, s.basariVarMi)) };
  } finally {
    izle.birak();
  }
}

/**
 * Düğmenin ortasında başka bir öğe varsa (örten: açık kalan öneri listesi, açılır menü, pencere) kısa tanımı; yoksa null. Gölge kökteki
 * düğmede kendi kökü sorulur (kabuk öğe örten sayılmaz).
 */
export async function ortuBul(hedef: Locator): Promise<string | null> {
  await hedef.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
  return hedef.evaluate((e) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const kok = e.getRootNode() as Document | ShadowRoot;
    const ust = (typeof kok.elementFromPoint === 'function' ? kok : e.ownerDocument).elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!ust || ust === e || e.contains(ust) || ust.contains(e)) return null;
    const kap = ust.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="tooltip"], ul, ol, dialog') ?? ust;
    const ad = kap.getAttribute('role') ?? kap.tagName.toLowerCase();
    const yazi = ((ust as HTMLElement).innerText || ust.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return `${ad}${yazi ? `: “${yazi}”` : ''}`;
  }).catch(() => null);
}

/**
 * Düğmeyi örten öğeyi kapatmayı dener (Escape → sayfanın boş bir yerine tıklama); kapanmazsa örten öğeyi söyleyen açık hata fırlatır
 * (ham "locator.click: Timeout" yerine). Örten yoksa hiçbir şey yapmaz.
 */
export async function ortuyuKaldir(page: Page, hedef: Locator, ad: string): Promise<void> {
  let ortu = await ortuBul(hedef);
  if (!ortu) return;
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(250);
  if (!(ortu = await ortuBul(hedef))) return;
  const nokta = await bosNokta(page);
  if (nokta) await page.mouse.click(nokta.x, nokta.y).catch(() => undefined);
  await page.waitForTimeout(250);
  if (!(ortu = await ortuBul(hedef))) return;
  throw new Error(`“${ad}” düğmesine basılamadı: başka bir öğe düğmeyi örtüyor (${ortu}). Escape ve sayfanın boş bir yerine tıklama denendi, kapanmadı; önce o öğede seçim yapın ya da pencereyi kapatan düğmeye basın.`);
}
