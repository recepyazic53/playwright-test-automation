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
export async function bosNokta(sayfa: Page): Promise<{ x: number; y: number } | null> {
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

/** Değerin karşılaştırma biçimi: yalnız harf / rakam dizisi (boşluk, nokta, tire, parantez, maske karakterleri ve büyük / küçük harf yok sayılır). */
export const degerSade = (m: string): string => m.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Sayfadaki değer yazılan değeri TUTUYOR mu: harf / rakam dizisi aynı ya da sayfanın biçimlediği değer yazılanı içeriyor (maske önek /
 * sonek ekleyebilir: "+90 (542) 650-2153", "1.000,00 TL"). Boş istenen her zaman tutar; okunamayan (null) değer tutmaz.
 */
export function degerTuttu(mevcut: string | null, deger: string): boolean {
  const istenen = degerSade(deger);
  if (!istenen) return true;
  if (mevcut === null) return false;
  // Tarih başka biçimde gösterilebilir (13.04.1998 ↔ 1998-04-13): gün / ay / yıl karşılaştırılır.
  const a = tarihParcalari(deger);
  const b = tarihParcalari(mevcut);
  if (a && b) return a.gun === b.gun && a.ay === b.ay && a.yil === b.yil;
  return degerSade(mevcut).includes(istenen);
}

/** Alanın sayfadaki değeri (okunamazsa null). */
export async function alanDegeriOku(alan: Locator): Promise<string | null> {
  // Beklemeden okunur: sayfadan kalkmış alan (koşullu bölüm kapandı) her denetimde süre doldurmasın.
  return alan.evaluateAll((l) => {
    const e = l[0] as HTMLInputElement | undefined;
    return e && typeof e.value === 'string' ? e.value : null;
  }).catch(() => null);
}

/** Alanın sayfadaki değeri istenen değerle aynı mı (biçim farkları yok sayılır: boşluk, tire, parantez, büyük/küçük harf). */
export async function alanZatenDolu(alan: Locator, deger: string): Promise<boolean> {
  const istenen = degerSade(deger);
  if (!istenen) return false;
  const mevcut = await alanDegeriOku(alan);
  return mevcut !== null && degerSade(mevcut) === istenen;
}

/**
 * Bir turda yazılan metin alanlarının sonradan değişip değişmediğini izler (hızlı test, doğrulama koşusu ve normal koşunun ORTAK kuralı):
 * her alan yazıldıktan sonra önceki alanlar yeniden okunur; değeri değişen alanın "bozanı" (o an yazılan alan) kaydedilir. Tur sonunda
 * değişenler bir kez yeniden yazılır; yine değişirse açık ileti (ör. “Doğum Tarihi” 13.04.1998 yazıldı; “Kimlik No” doldurulunca sayfa
 * 02.10.2026 yaptı). Motor genel kalır: alan adı / değer kuralı yoktur, yalnız sayfadaki değer yazılanla karşılaştırılır.
 */
export class DegerIzleyici<T> {
  private readonly yazilanlar: Array<{ oge: T; etiket: string; deger: string; alan: Locator }> = [];
  private readonly bozanlar = new Map<T, string>();

  /** Alan yazıldı: önce önceki alanlar denetlenir (bu alan onları değiştirdi mi), sonra bu alan izlenmeye alınır. */
  async yazildi(oge: T, etiket: string, deger: string, alan: Locator): Promise<void> {
    await this.denetle(etiket);
    if (!degerSade(deger)) return;
    const i = this.yazilanlar.findIndex((x) => x.oge === oge);
    if (i >= 0) this.yazilanlar.splice(i, 1);
    this.yazilanlar.push({ oge, etiket, deger, alan });
  }

  /** Bir alanın (ya da seçimin) doldurulmasından sonra: izlenen alanlardan değeri değişenlerin bozanı (ilk görülen) kaydedilir. */
  async denetle(bozanEtiket: string): Promise<void> {
    for (const x of this.yazilanlar) {
      if (this.bozanlar.has(x.oge)) continue;
      const m = await alanDegeriOku(x.alan);
      if (m !== null && !degerTuttu(m, x.deger)) this.bozanlar.set(x.oge, bozanEtiket);
    }
  }

  /** Tur sonu: değeri şu an yazılandan farklı olan izlenen alanlar (sayfadaki değerle). */
  async degisenler(): Promise<Array<{ oge: T; etiket: string; deger: string; mevcut: string }>> {
    const l: Array<{ oge: T; etiket: string; deger: string; mevcut: string }> = [];
    for (const x of this.yazilanlar) {
      const m = await alanDegeriOku(x.alan);
      if (m !== null && !degerTuttu(m, x.deger)) l.push({ oge: x.oge, etiket: x.etiket, deger: x.deger, mevcut: m });
    }
    return l;
  }

  /** Yeniden yazıldıktan sonra değer hâlâ tutmuyorsa açık ileti; tutuyorsa (ya da okunamıyorsa) null. */
  async sonDurum(oge: T): Promise<string | null> {
    const x = this.yazilanlar.find((y) => y.oge === oge);
    if (!x) return null;
    const m = await alanDegeriOku(x.alan);
    if (m === null || degerTuttu(m, x.deger)) return null;
    return degisimMesaji(x.etiket, x.deger, m, this.bozanlar.get(oge) ?? null);
  }

  /** Alanın bozanı (değerini değiştiren sonraki alanın etiketi); bilinmiyorsa null. */
  bozani(oge: T): string | null { return this.bozanlar.get(oge) ?? null; }
}

/** Değeri sayfa tarafından değiştirilen alanın iletisi (yeniden yazıldı, yine değişti). */
export function degisimMesaji(etiket: string, deger: string, mevcut: string, bozan: string | null): string {
  const sonra = mevcut.trim() ? `sayfa ${mevcut.trim()} yaptı` : 'sayfa alanı boşalttı';
  return `“${etiket}” ${deger} yazıldı; ${bozan ? `“${bozan}” doldurulunca ${sonra}` : `sonradan ${sonra}`} (yeniden yazıldı, yine değişti). Alanların sırasını ya da değerleri kontrol edin.`;
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
  await alanTemizle(alan);
  await alan.pressSequentially(deger, { delay: aralikMs, timeout: zamanAsimiMs });
}

/**
 * Alanda değer varsa klavyeyle temizler: odak + tümünü seç (Ctrl/Cmd+A; sayfa engellerse betikle seçim) + sil. Hâlâ doluysa (maske
 * seçimi bozdu / silmeyi engelledi) fill('') yedeği. Önceden dolu (varsayılan değerli) alanın üzerine yazmanın ilk adımı.
 */
async function alanTemizle(alan: Locator): Promise<void> {
  const dolu = async (): Promise<boolean> => Boolean(await alan.inputValue({ timeout: 1_000 }).catch(() => ''));
  if (!(await dolu())) return;
  await alan.click({ timeout: 3_000 }).catch(() => undefined);
  await alan.press('ControlOrMeta+a', { timeout: 2_000 }).catch(() => undefined);
  await alan.press('Backspace', { timeout: 2_000 }).catch(() => undefined);
  if (!(await dolu())) return;
  // Kısayol engellenmiş olabilir: seçim betikle yapılır, sonra yine tuşla silinir (tuş dinleyen maske boşaldığını görür).
  await alan.evaluate((e) => { (e as HTMLInputElement).focus(); (e as HTMLInputElement).select?.(); }, undefined, { timeout: 2_000 }).catch(() => undefined);
  await alan.press('Delete', { timeout: 2_000 }).catch(() => undefined);
  if (await dolu()) await alan.fill('', { timeout: 2_000 }).catch(() => undefined);
}

/**
 * Metin alanına değer yazar ve alandan çıkar — hızlı test, doğrulama koşusu ve normal koşunun (model-kosucu.ts) ORTAK yazma yolu
 * (kural tek yerde). Sıra: (1) kipe göre yaz (yazmaKipiSec: kısa metin gerçek tuşlarla, "yaz-sil-yaz" olmaz); doğrudan yazılan değer
 * hemen boş kaldıysa tuşlayarak, (2) alandan çık (+ sonra: sayfanın sakinleşmesi), (3) sayfa değeri alandan çıkınca sildiyse (ör. sonraki
 * sorgu satırı yeniden çizdi) ya da değer yazılanı TUTMUYORSA (önceden dolu alanda tuşlama eski değerin üstüne eklenmedi / maske eski
 * değeri geri koydu) bir kez temizleyip (tümünü seç + sil) tuşlayarak yeniden yaz ve yeniden çık. Değer sayfada biçimlenebilir (maske
 * "(542) 650-2153"): karşılaştırma biçimden bağımsızdır (degerTuttu: harf / rakam dizisi).
 * @returns 'tamam', 'silindi' (yeniden yazılan değer de alandan çıkınca silindi), 'kilitli' (değer tutmadı ve alanda yazmadan ÖNCEKİ dolu
 * değer duruyor: sayfa alanı kendisi dolduruyor / eski değeri geri yazıyor — düzenlenemez kanıtı, hata değildir) ya da 'tutmadi' (alanda
 * yazılandan farklı bir değer kaldı; sayfadaki değer: alanDegeriOku)
 */
export async function alanaYaz(
  alan: Locator, deger: string,
  secenek: { tuslayarak?: boolean; kip?: 'otomatik' | 'tus' | 'dogrudan'; aralikMs?: number; zamanAsimiMs: number; sonra?: () => Promise<void> }
): Promise<'tamam' | 'silindi' | 'tutmadi' | 'kilitli'> {
  const bos = async (): Promise<boolean> => !(await alan.inputValue({ timeout: 1_000 }).catch(() => 'x')).trim();
  const tuttu = async (): Promise<boolean> => { const m = await alanDegeriOku(alan); return m === null || degerTuttu(m, deger); };
  const aralik = secenek.aralikMs ?? TUSLAMA_ARALIGI_MS;
  const tusla = (): Promise<void> => tuslayarakYaz(alan, deger, aralik, secenek.zamanAsimiMs);
  // Alan henüz çizilmediyse (önceki basışın sonucu gecikmeli) görünmesi beklenir: kip, alanın kendisine bakılarak seçilir.
  await alan.waitFor({ state: 'visible', timeout: secenek.zamanAsimiMs });
  // Yazmadan önceki değer (yalnız okunur): değer tutmazsa sayfanın bu değeri geri yazıp yazmadığına bakılır (düzenlenemez kanıtı).
  const onceki = await alanDegeriOku(alan);
  const kip = await yazmaKipiSec(alan, deger, secenek.tuslayarak ? 'tus' : secenek.kip ?? 'otomatik');
  if (kip === 'tus') await tusla();
  else {
    await alan.fill(deger, { timeout: secenek.zamanAsimiMs });
    if (await bos()) await tusla();
  }
  await alandanCik(alan);
  await secenek.sonra?.();
  if (!deger.trim() || (await tuttu())) return 'tamam';
  // Tutmadı: tümünü seç + sil + tuşlayarak yeniden yaz (önceden dolu / maskeli alan). Tuşlama da tutmazsa (ör. her tuşta öneki yeniden
  // ekleyen maske) değer doğrudan (tek input olayıyla) yazılır.
  await alan.click({ timeout: 3_000 }).catch(() => undefined);
  await tusla().catch(() => undefined);
  if (!(await tuttu())) await alan.fill(deger, { timeout: secenek.zamanAsimiMs }).catch(() => undefined);
  await alandanCik(alan);
  await secenek.sonra?.();
  if (await tuttu()) return 'tamam';
  if (await bos()) return 'silindi';
  // Sayfa yazılanı kabul etmeyip ÖNCEKİ (dolu) değeri geri koydu: alan bu durumda sayfa tarafından dolduruluyor (düzenlenemez).
  const son = await alanDegeriOku(alan);
  if (onceki !== null && onceki.trim() && son === onceki && !degerTuttu(onceki, deger)) return 'kilitli';
  return 'tutmadi';
}

/** Düzenlenemeyen alanın (sayfa dolduruyor) adım notu: yazılmadı, hata değildir. */
export const KILITLI_ALAN_NOTU = 'alan sayfa tarafından dolduruluyor, yazılmadı';

/** alanaYaz sonucunun açık iletisi (başarılıysa ya da alan düzenlenemiyorsa null): 'silindi' ve 'tutmadi' (sayfadaki değerle). */
export async function yazmaHatasi(alan: Locator, deger: string, sonuc: 'tamam' | 'silindi' | 'tutmadi' | 'kilitli', etiket: string): Promise<string | null> {
  if (sonuc === 'tamam' || sonuc === 'kilitli') return null;
  if (sonuc === 'silindi') return 'Değer yazıldı ama alandan çıkınca sayfa sildi (maske / doğrulama); alanın nasıl doldurulduğunu kontrol edin.';
  const m = ((await alanDegeriOku(alan)) ?? '').trim();
  return `“${etiket}” ${deger} yazıldı ama alanda ${m || '(boş)'} kaldı (tümü seçilip silindi ve yeniden yazıldı; tutmadı). Alanın biçimini (maske) ya da değeri kontrol edin.`;
}

// ---- Takvimden seçilen (salt okunur) tarih alanı ve otomatik tamamlamalı alan (hızlı test, doğrulama ve normal koşu ORTAK) ----

/** Tarih değerini gün / ay / yıl'a ayırır: gg.aa.yyyy, gg/aa/yyyy, gg-aa-yyyy ya da yyyy-aa-gg. */
export function tarihParcalari(deger: string): { gun: number; ay: number; yil: number } | null {
  const t = deger.trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (m) return { gun: Number(m[1]), ay: Number(m[2]), yil: Number(m[3]) };
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return { gun: Number(m[3]), ay: Number(m[2]), yil: Number(m[1]) };
  return null;
}

/**
 * Takvimden seçilen (salt okunur) tarih alanına değer verir; hata iletisi döner (başarılıysa null). Sıra: (1) değer + input / change
 * olayları (çoğu bileşen değeri alandan okur); alan değeri tutuyorsa biter. (2) Tutmazsa takvim açılır (alana tıklanır), yeni beliren
 * takvimde (gün hücreleri 1..28+ olan kap) hedef ay başlıkta görünene kadar "sonraki / önceki" denetimine basılır ve gün tıklanır.
 * (3) Olmazsa açık ileti. Genel kalıplar; siteye özgü sabit yok.
 */
export async function takvimdenYaz(alan: Locator, deger: string, zamanAsimiMs: number): Promise<string | null> {
  const sayfa = alan.page();
  const tutuyor = async (): Promise<boolean> => Boolean((await alan.inputValue({ timeout: 1_000 }).catch(() => '')).trim());
  await alan.waitFor({ state: 'visible', timeout: zamanAsimiMs });
  await alan.evaluate((e, v) => {
    const i = e as HTMLInputElement;
    const yaz = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (yaz) yaz.call(i, v); else i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, deger, { timeout: zamanAsimiMs });
  await sayfa.waitForTimeout(150);
  if (await tutuyor()) return null;
  const p = tarihParcalari(deger);
  if (!p) return `“${deger}” bir tarih olarak okunamadı (gg.aa.yyyy ya da yyyy-aa-gg bekleniyor); takvimden seçilemedi.`;
  await alan.click({ timeout: 5_000 }).catch(() => undefined);
  for (let deneme = 0; deneme < 24; deneme++) {
    await sayfa.waitForTimeout(deneme ? 150 : 400);
    const durum = await alan.evaluate((e, h) => {
      const AYLAR = [['ocak', 'jan'], ['şubat', 'feb'], ['mart', 'mar'], ['nisan', 'apr'], ['mayıs', 'may'], ['haziran', 'jun'], ['temmuz', 'jul'], ['ağustos', 'aug'],
        ['eylül', 'sep'], ['ekim', 'oct'], ['kasım', 'nov'], ['aralık', 'dec']];
      const gorunur = (x: Element): boolean => { const r = x.getBoundingClientRect(); const s = getComputedStyle(x); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const gunMu = (x: Element): boolean => /^\d{1,2}$/.test((x.textContent ?? '').trim()) && x.children.length === 0;
      // Takvim kabı: içinde en az 28 görünür gün hücresi olan en küçük kap (alanın kendisi değil).
      const doc = e.ownerDocument;
      let takvim: Element | null = null;
      for (const k of [...doc.querySelectorAll('[role="grid"], [role="dialog"], table, div, section')]) {
        if (!gorunur(k) || k.contains(e)) continue;
        const gunler = [...k.querySelectorAll('button, td, a, [role="gridcell"], span, div')].filter((x) => gunMu(x) && gorunur(x));
        if (gunler.length < 28) continue;
        if (!takvim || takvim.contains(k)) takvim = k;
      }
      if (!takvim) return { durum: 'yok' as const };
      // Ay adı sözcük başında aranır ("cumartesi" Mart sayılmaz). Gün hücrelerinin kabı başlığı içermeyebilir: ay adı görünene kadar
      // (en çok 4 düzey) üst kaba çıkılır; başlık ve ay geçiş denetimleri orada aranır.
      const ayAdiVar = (m: string): boolean => AYLAR.some((l) => l.some((a) => new RegExp(`(^|[^\\p{L}])${a}`, 'u').test(m)));
      for (let i = 0; i < 4 && takvim.parentElement && !ayAdiVar((takvim.textContent ?? '').toLocaleLowerCase('tr')); i++) takvim = takvim.parentElement;
      const baslik = (takvim.textContent ?? '').toLocaleLowerCase('tr');
      const sozcukVar = (a: string): boolean => new RegExp(`(^|[^\\p{L}])${a}`, 'u').test(baslik);
      const ayVar = AYLAR[h.ay - 1].some(sozcukVar) && baslik.includes(String(h.yil));
      const herhangiAy = AYLAR.findIndex((l) => l.some(sozcukVar));
      if (herhangiAy >= 0 && !ayVar) {
        const yil = Number(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(baslik)?.[1] ?? h.yil);
        const ileri = yil < h.yil || (yil === h.yil && herhangiAy + 1 < h.ay);
        const denetimler = [...takvim.querySelectorAll('button, a, [role="button"], span')].filter(gorunur);
        const kalip = ileri ? /^(›|»|>|→|▶|next|sonraki|ileri)$/i : /^(‹|«|<|←|◀|prev|previous|önceki|geri)$/i;
        const d = denetimler.find((x) => kalip.test((x.textContent ?? '').trim()) || kalip.test((x.getAttribute('aria-label') ?? x.getAttribute('title') ?? '').trim()));
        if (!d) return { durum: 'ay-yok' as const };
        (d as HTMLElement).click();
        return { durum: 'gezindi' as const };
      }
      const gun = [...takvim.querySelectorAll('button, td, a, [role="gridcell"], span, div')]
        .find((x) => gunMu(x) && gorunur(x) && Number((x.textContent ?? '').trim()) === h.gun && !(x as HTMLButtonElement).disabled && x.getAttribute('aria-disabled') !== 'true');
      if (!gun) return { durum: 'gun-yok' as const };
      gun.setAttribute('data-nobetci-takvim-gunu', '1');
      return { durum: 'gun' as const };
    }, p).catch(() => ({ durum: 'yok' as const }));
    if (durum.durum === 'gezindi') continue;
    if (durum.durum === 'gun') {
      const g = sayfa.locator('[data-nobetci-takvim-gunu="1"]').first();
      await g.click({ timeout: 5_000 }).catch(() => undefined);
      await sayfa.evaluate(() => { for (const x of document.querySelectorAll('[data-nobetci-takvim-gunu]')) x.removeAttribute('data-nobetci-takvim-gunu'); }).catch(() => undefined);
      await sayfa.waitForTimeout(150);
      if (await tutuyor()) return null;
      return `Takvimde ${p.gun} günü seçildi ama alan boş kaldı.`;
    }
    const neden = durum.durum === 'yok' ? 'alana tıklayınca takvim açılmadı' : durum.durum === 'ay-yok' ? 'takvimde istenen aya geçilemedi' : `takvimde ${p.gun} günü bulunamadı (ya da seçilemiyor)`;
    return `Takvimden seçilen bir alan: değer yazılamadı ve ${neden}. Değeri ve tarih biçimini kontrol edin.`;
  }
  return 'Takvimde istenen aya geçilemedi (24 deneme).';
}

/**
 * Otomatik tamamlamalı alan: değer gerçek tuşlarla yazılır (alandan çıkılmaz), yazınca açılan öneri listesi (role=listbox / option,
 * aria-controls / aria-owns ile bağlı liste ya da alanın yanında beliren liste) beklenir ve değeri eşleşen öneri tıklanır (tam eşleşme,
 * yoksa ile başlayan, yoksa tek içeren). Dönüş: 'secildi' | 'liste-yok' (liste açılmadı: alan sıradan metin alanı gibi doldurulur) |
 * hata iletisi (liste açıldı ama eşleşen öneri yok).
 */
export async function oneridenYaz(alan: Locator, deger: string, zamanAsimiMs: number, bekleMs = 2_000): Promise<'secildi' | 'liste-yok' | string> {
  const sayfa = alan.page();
  await alan.waitFor({ state: 'visible', timeout: zamanAsimiMs });
  await alan.click({ timeout: 5_000 }).catch(() => undefined);
  await alan.fill('', { timeout: 3_000 }).catch(() => undefined);
  await alan.pressSequentially(deger, { delay: 20, timeout: zamanAsimiMs });
  const bitis = Date.now() + bekleMs;
  for (;;) {
    const r = await alan.evaluate((e, v) => {
      const katla = (m: string): string => m.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
      const doc = e.ownerDocument;
      const gorunur = (x: Element): boolean => { const b = x.getBoundingClientRect(); const s = getComputedStyle(x); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const ids = [e.getAttribute('aria-controls'), e.getAttribute('aria-owns'), e.getAttribute('list')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
      const bagli = ids.map((id) => doc.getElementById(id)).filter((x): x is HTMLElement => Boolean(x));
      // Aday liste: alana bağlı liste, alanın kabındaki görünür liste ya da sayfadaki görünür role=listbox.
      const kap = e.parentElement?.parentElement ?? e.parentElement ?? doc.body;
      const listeler = [...new Set([...bagli, ...kap.querySelectorAll('[role="listbox"], ul, ol'), ...doc.querySelectorAll('[role="listbox"]')])].filter(gorunur);
      const secenekler = [...new Set(listeler.flatMap((l) => [...l.querySelectorAll('[role="option"], li')]))].filter(gorunur);
      if (!secenekler.length) return { durum: 'yok' as const, oneriler: [] as string[] };
      const metin = (x: Element): string => (x.textContent ?? '').replace(/\s+/g, ' ').trim();
      const h = katla(v);
      const tam = secenekler.find((x) => katla(metin(x)) === h);
      const bas = secenekler.filter((x) => katla(metin(x)).startsWith(h));
      const icer = secenekler.filter((x) => katla(metin(x)).includes(h));
      const sec = tam ?? (bas.length === 1 ? bas[0] : null) ?? (icer.length === 1 ? icer[0] : null);
      if (!sec) return { durum: 'eslesmedi' as const, oneriler: secenekler.slice(0, 8).map(metin) };
      sec.setAttribute('data-nobetci-oneri', '1');
      return { durum: 'var' as const, oneriler: [] as string[] };
    }, deger).catch(() => ({ durum: 'yok' as const, oneriler: [] as string[] }));
    if (r.durum === 'var') {
      await sayfa.locator('[data-nobetci-oneri="1"]').first().click({ timeout: 5_000 });
      await sayfa.evaluate(() => { for (const x of document.querySelectorAll('[data-nobetci-oneri]')) x.removeAttribute('data-nobetci-oneri'); }).catch(() => undefined);
      await sayfa.waitForTimeout(200);
      return 'secildi';
    }
    if (Date.now() >= bitis) {
      if (r.durum === 'eslesmedi') return `Öneri listesinde “${deger}” yok (öneriler: ${r.oneriler.join(', ') || '—'}).`;
      return 'liste-yok';
    }
    await sayfa.waitForTimeout(150);
  }
}
