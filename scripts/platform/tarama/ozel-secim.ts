// ÖZEL AÇILIR LİSTEDEN (gizli <select>'e bağlı görünen aramalı liste: select2 / chosen / bootstrap-select benzeri) SEÇME — normal koşu
// (tests/support/model-kosucu.ts > ozelSecim) ve giriş motorunun "Seçenek seç" adımı (tests/support/giris-motoru.ts; bağlam değiştirme ve giriş
// adımları) aynı kuralı kullanır: bileşen genel kurallarla bulunur (sayfa-envanteri.ts > ozelBilesenIsaretle), görünen kutuya tıklanır,
// açılan arama kutusuna aranan metin yazılır ve görünen seçeneğe tıklanır. Böylece sayfanın kendi olayları (ör. seçime göre yüklenen
// bağlı liste) çalışır; gizli listeye doğrudan değer yazmak bunları her zaman tetiklemez. Motor genel kalır: siteye özgü sabit yoktur.
import { expect, type Locator } from '@playwright/test';
import { ozelBilesenIsaretle } from './sayfa-envanteri';
import type { ListeSecenegi } from './secenek-secimi';

/** Bileşenin arandığı yer: sayfa ya da çerçeve. */
export interface Kapsam { locator(secici: string): Locator }

/**
 * Açılan listede tıklanacak görünen seçenek (aynı belgede): role=option ya da liste öğesi. Öncelik: metni tam (senaryo metni ya da
 * gizli listedeki seçeneğin metni), değeri (data-value / id sonu), sonra metin senaryo metniyle başlar, en son içerir. Bulunan öğe
 * işaretlenir; bulunamazsa false.
 */
export function gorunenSecenegiIsaretle(e: Element, a: { isaret: string; metinler: string[]; deger: string; aranan: string }): boolean {
  const d = e.ownerDocument;
  const n = (t: string): string => t.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  const gorunur = (x: Element): boolean => {
    const r = x.getBoundingClientRect();
    const st = (d.defaultView ?? window).getComputedStyle(x);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const uygun = (x: Element): boolean => !x.closest('select') && gorunur(x) && x.getAttribute('aria-disabled') !== 'true';
  // Rollü seçenekler (role=option / listbox öğesi) önce; rolsüz bileşenlerde görünen liste öğeleri (li / data-value).
  const rollu = [...d.querySelectorAll('[role="option"], [role="listbox"] li, [role="tree"] li, [role="treeitem"]')].filter(uygun);
  const rolsuz = [...d.querySelectorAll('li, [data-value]')].filter((x) => !rollu.includes(x) && uygun(x));
  const metin = (x: Element): string => n((x as HTMLElement).innerText ?? x.textContent ?? '');
  const tamlar = a.metinler.map(n).filter(Boolean);
  const aranan = n(a.aranan);
  const degerMi = (x: Element): boolean => {
    const v = x.getAttribute('data-value') ?? x.getAttribute('data-id') ?? '';
    return Boolean(a.deger) && (v === a.deger || (x.id ?? '').endsWith(`-${a.deger}`));
  };
  const kismi = (liste: Element[]): Element | undefined => (aranan ? liste.find((x) => metin(x).startsWith(aranan)) ?? liste.find((x) => metin(x).includes(aranan)) : undefined);
  const bulunan = [...rollu, ...rolsuz].find((x) => tamlar.includes(metin(x))) ?? [...rollu, ...rolsuz].find(degerMi) ?? kismi(rollu) ?? kismi(rolsuz);
  if (!bulunan) return false;
  bulunan.setAttribute('data-nobetci-ozel-secenek', a.isaret);
  return true;
}

/**
 * Bileşenin açık kalan listesi (görünen arama kutusu ya da liste kutusu; ör. select2'nin gövdeye eklenen penceresi): önce kutuya
 * yeniden tıklanır (aç / kapa), kapanmazsa belgeye "dışarı tıklama" (mousedown / mouseup) gönderilir. Escape kullanılmaz (üstteki
 * pencereyi — ör. iframe'i taşıyan açılır pencere — kapatabilir).
 */
export async function acikListeyiKapat(k: Kapsam, l: Locator, isaret: string): Promise<void> {
  const acik = async (): Promise<boolean> => l.evaluate((e) => {
    const d = e.ownerDocument;
    const gorunur = (x: Element): boolean => {
      const r = x.getBoundingClientRect();
      const st = (d.defaultView ?? window).getComputedStyle(x);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    return [...d.querySelectorAll('[data-nobetci-ozel-ara], [role="listbox"]')].some((x) => !x.closest('select') && !x.hasAttribute('data-nobetci-onceden') && gorunur(x));
  }).catch(() => false);
  if (!(await acik())) return;
  if (await l.evaluate(ozelBilesenIsaretle, isaret).catch(() => false)) {
    const kutu = k.locator(`[data-nobetci-ozel="${isaret}"]`).first();
    await kutu.click({ timeout: 2_000 }).catch(() => undefined);
    await kutu.evaluate((e) => e.removeAttribute('data-nobetci-ozel'), undefined, { timeout: 1_000 }).catch(() => undefined);
  }
  if (await acik()) {
    await l.evaluate((e) => {
      const b = e.ownerDocument.body;
      for (const t of ['mousedown', 'mouseup', 'click']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: e.ownerDocument.defaultView }));
    }).catch(() => undefined);
  }
}

/** Listenin (l) yanında görünen aramalı bileşen var mı (ozelBilesenIsaretle; bırakılan işaret silinir). Normal görünen listede false. */
export async function ozelBilesenVar(l: Locator): Promise<boolean> {
  const isaret = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const varMi = await l.evaluate(ozelBilesenIsaretle, isaret, { timeout: 2_000 }).catch(() => false);
  if (varMi) {
    await l.evaluate((e, i) => { for (const x of e.ownerDocument.querySelectorAll(`[data-nobetci-ozel="${i}"]`)) x.removeAttribute('data-nobetci-ozel'); }, isaret)
      .catch(() => undefined);
  }
  return varMi;
}

/**
 * Gizli listenin (l) görünen bileşeninden hedef seçeneği seçer: kutuya tıklar, arama kutusu açılırsa "aranan"ı yazar, görünen seçeneğe
 * tıklar; açık kalan liste kapatılır, işaretler temizlenir. Değer zaten hedefse dokunmaz. Bileşen yoksa ya da değer tutmadıysa false
 * (çağıran yedek yolu — gizli listeye yazma — dener).
 * @param hedef gizli listedeki seçenek (değer + metin) @param aranan arama kutusuna yazılacak metin (senaryo değeri / kod)
 */
export async function ozelBilesendenSec(k: Kapsam, l: Locator, hedef: ListeSecenegi, aranan: string): Promise<boolean> {
  const deger = async (): Promise<string | null> => l.inputValue({ timeout: 2_000 }).catch(() => null);
  if ((await deger()) === hedef.deger) return true;
  const isaret = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  if (!(await l.evaluate(ozelBilesenIsaretle, isaret).catch(() => false))) return false;
  {
    const kutu = k.locator(`[data-nobetci-ozel="${isaret}"]`).first();
    let aramaKutusu: Locator | null = null;
    // Tıklamadan önce zaten görünen liste kutuları (sayfanın sabit listeleri) açık kalan pencere sayılmaz.
    await l.evaluate((e) => { for (const x of e.ownerDocument.querySelectorAll('[role="listbox"]')) if ((x as HTMLElement).offsetParent) x.setAttribute('data-nobetci-onceden', ''); }).catch(() => undefined);
    try {
      await kutu.click({ timeout: 5_000 });
      // Açılan arama kutusu: bileşenin odakladığı metin kutusu ya da görünen bir arama kutusu (aynı belgede).
      const ara = await l.evaluate((e, i) => {
        const d = e.ownerDocument;
        const gorunur = (x: Element | null): boolean => {
          if (!x) return false;
          const r = x.getBoundingClientRect();
          const st = (d.defaultView ?? window).getComputedStyle(x);
          return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
        };
        const metinKutusu = (x: Element | null): x is HTMLInputElement => !!x && x.tagName === 'INPUT' && ['text', 'search', ''].includes((x as HTMLInputElement).type) && gorunur(x);
        const a = d.activeElement;
        const bulunan = metinKutusu(a) ? a : [...d.querySelectorAll('input[type="search"],input[role="searchbox"],input[role="combobox"],input[aria-autocomplete]')].find(metinKutusu);
        if (!bulunan) return false;
        bulunan.setAttribute('data-nobetci-ozel-ara', i);
        return true;
      }, isaret).catch(() => false);
      if (ara) {
        aramaKutusu = k.locator(`[data-nobetci-ozel-ara="${isaret}"]`).first();
        await aramaKutusu.fill('', { timeout: 3_000 });
        await aramaKutusu.pressSequentially(aranan, { delay: 20, timeout: 10_000 });
      }
      // Görünen seçenek ("kod - ad" metinli listelerde senaryo kodu metnin tamamı değildir): metin tam → değer → başlar → içerir.
      // Liste arama sonucunu geç çizebilir: kısa aralıklarla aranır.
      const secenekIsareti = `${isaret}s`;
      const bilgi = { isaret: secenekIsareti, metinler: [aranan, hedef.metin], deger: hedef.deger, aranan };
      let bulundu = false;
      for (const bitis = Date.now() + 3_000; !bulundu && Date.now() < bitis;) {
        bulundu = await l.evaluate(gorunenSecenegiIsaretle, bilgi).catch(() => false);
        if (!bulundu) await new Promise((c) => setTimeout(c, 100));
      }
      if (bulundu) {
        const secenek = k.locator(`[data-nobetci-ozel-secenek="${secenekIsareti}"]`).first();
        await secenek.click({ timeout: 3_000 }).catch(() => undefined);
      }
      await expect.poll(deger, { timeout: 2_000 }).toBe(hedef.deger).catch(() => undefined);
    } catch { /* görünen bileşenden seçilemedi: yedek yol */ } finally {
      await kutu.evaluate((e) => e.removeAttribute('data-nobetci-ozel'), undefined, { timeout: 1_000 }).catch(() => undefined);
    }
    // Liste açık kaldıysa (seçilemedi ya da bileşen seçimden sonra kapanmadı) kapatılır: açık pencere sonraki alanın kutusunu ve
    // düğmeleri örter. İşaret kontrolden SONRA kaldırılır (önce kaldırılırsa açık liste görülmez).
    await acikListeyiKapat(k, l, isaret);
    // İşaretler belgeden temizlenir (seçimden sonra bileşenin penceresi belgeden kaldırılmış olabilir: öğeye bağlı temizlik beklerdi).
    await l.evaluate((e) => { for (const x of e.ownerDocument.querySelectorAll('[data-nobetci-onceden], [data-nobetci-ozel-ara], [data-nobetci-ozel-secenek], [data-nobetci-ozel]')) for (const a of ['data-nobetci-onceden', 'data-nobetci-ozel-ara', 'data-nobetci-ozel-secenek', 'data-nobetci-ozel']) x.removeAttribute(a); }).catch(() => undefined);
  }
  return (await deger()) === hedef.deger;
}
