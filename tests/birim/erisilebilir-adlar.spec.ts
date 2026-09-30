// KORUMA TESTİ — Erişilebilir adlar görünen metinle uyumlu (WCAG 2.5.3 "Label in Name"): gerçekçi SAHTE veriyle dolu geçici
// Nöbetçi'de (arayuz-tarama-fikstur.ts) ana rotalar gezilir; her rotada ölçülür:
//   (1) görünür metni olan düğme / bağlantı / sekme / menü öğesinin aria-label'ı görünen metinle BAŞLAR (sesli komut kullanıcısı
//       ekranda gördüğünü söyleyince öğe bulunur; ör. "Elle tanımla" → "Elle tanımla — TEST giriş tarifi"),
//   (2) görünür her form alanının bir erişilebilir adı vardır (label / aria-label / aria-labelledby; yalnız yer tutucu yetmez).
// Güvenlik: yalnız 127.0.0.1 (sahte SOAP sunucusu) ve geçici veritabanı; gerçek Nöbetçi'ye ve veri/ klasörüne dokunulmaz.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { zenginNobetciKur, type ZenginNobetci } from './arayuz-tarama-fikstur';

/** Sayfada çalışır: ad uyumsuzlukları ve etiketsiz alanlar (boşsa sorun yok). */
function adlariDenetle(): string[] {
  const out: string[] = [];
  const duz = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
  const gorunur = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const kapali = e.closest('details:not([open])');
    if (kapali && !e.closest('summary')) return false;
    return !e.closest('[hidden], [aria-hidden="true"]');
  };
  /** Görünen metin: aria-hidden ve görsel olarak gizli (.gorunmez) parçalar hariç. */
  const gorunenMetin = (e: Element): string => {
    let m = '';
    for (const c of e.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) m += c.textContent ?? '';
      else if (c instanceof Element && c.getAttribute('aria-hidden') !== 'true' && !c.classList.contains('gorunmez') && getComputedStyle(c).display !== 'none') m += ` ${gorunenMetin(c)} `;
    }
    return m;
  };
  const ad = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${String((e as HTMLElement).className).trim().split(/\s+/).slice(0, 2).join('.')}`;
  const secici = 'main button[aria-label], main a[aria-label], main [role="tab"][aria-label], main [role="menuitem"][aria-label], main summary[aria-label], main [role="button"][aria-label]';
  for (const e of document.querySelectorAll(secici)) {
    if (!gorunur(e)) continue;
    const metin = duz(gorunenMetin(e));
    // Yalnız simgeden / sayıdan / tek işaretten oluşan metin (×, ⋯, 3) görünen ad sayılmaz.
    if (!metin || !/\p{L}{2}/u.test(metin)) continue;
    const etiket = duz(e.getAttribute('aria-label') ?? '');
    if (!etiket.startsWith(metin)) out.push(`ad uyumsuz: ${ad(e)} görünen "${metin}" ≠ aria-label "${etiket}"`);
  }
  for (const e of document.querySelectorAll('main input:not([type="hidden"]):not([type="submit"]):not([type="button"]), main select, main textarea')) {
    if (!gorunur(e)) continue;
    const g = e as HTMLInputElement;
    const etiketli = Boolean(g.getAttribute('aria-label')?.trim()) || Boolean(g.getAttribute('aria-labelledby')) || (g.labels && g.labels.length > 0) || Boolean(g.getAttribute('title')?.trim());
    if (!etiketli) out.push(`etiketsiz alan: ${ad(e)} (yer tutucu: "${g.getAttribute('placeholder') ?? ''}")`);
  }
  return [...new Set(out)];
}

test.describe('erişilebilir adlar görünen metinle uyumlu', () => {
  test.describe.configure({ mode: 'serial' });
  let z: ZenginNobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'erisilebilir-adlar-'));
    z = await zenginNobetciKur(klasor);
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    await z?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  const bekle = async (page: Page) => {
    await page.waitForTimeout(200);
    await page.waitForFunction(() => !document.querySelector('.iskelet, [aria-busy="true"]'), undefined, { timeout: 6000 }).catch(() => undefined);
    await page.waitForTimeout(150);
  };

  test('ana rotalarda aria-label görünen metinle başlar; görünür her alanın adı var', async () => {
    test.setTimeout(120_000);
    const e = encodeURIComponent(z.ekranIdleri[1]);
    const rotalar = [
      '#/sonuclar', '#/sonuclar/ozet', '#/sonuclar/servisler', '#/sonuclar/uctan-uca', `#/sonuclar/kosu/${z.kosuIdleri[3]}`,
      `#/sonuclar/karsilastir/${z.kosuIdleri[0]}/${z.kosuIdleri[1]}`, '#/senaryolar', `#/senaryolar/u/${e}`, `#/senaryolar/duzenle/${encodeURIComponent(z.senaryoIdleri[3])}`,
      '#/servisler', `#/servisler/s/${z.soapServisId}`, `#/servisler/s/${z.restServisId}`, '#/servisler/sonuclar', '#/akislar', `#/akislar/${z.uctanUcaId}`,
      '#/ekranlar', `#/ekranlar/e/${e}`, '#/ekranlar/yeni', '#/veri', '#/planli-kosular',
      ...['proje', 'giris', 'kosu', 'yedekleme', 'guvenlik', 'izinler', 'entegrasyonlar', 'arayuz'].map((b) => `#/ayarlar/${b}`)
    ];
    const sorunlar: string[] = [];
    const baglam = await tarayici.newContext({ baseURL: z.nobetci.adres, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await baglam.newPage();
    for (const rota of rotalar) {
      await page.goto(`/${rota}`);
      await bekle(page);
      for (const s of await page.evaluate(adlariDenetle)) sorunlar.push(`${rota}: ${s}`);
    }
    // Akış diyagramı düzenleyicisi: "Listede olmayan alanı / düğmeyi elle ekle" kutularının etiketleri alanlara bağlı.
    await page.goto(`/#/ekranlar/e/${e}/akis`);
    await bekle(page);
    await page.getByRole('button', { name: /^Düzenle/ }).first().click();
    const palet = page.locator('aside[aria-label="Kayıtta yakalananlar"]');
    await palet.getByText('Listede olmayan alanı elle ekle').click();
    await expect(palet.getByRole('textbox', { name: /^Etiket/ })).toBeVisible();
    for (const s of await page.evaluate(adlariDenetle)) sorunlar.push(`akış diyagramı (alan): ${s}`);
    await palet.getByRole('tab', { name: /Düğmeler/ }).click();
    await palet.getByText('Listede olmayan düğmeyi elle ekle').click();
    await expect(palet.getByRole('textbox', { name: /^Düğmenin yazısı/ })).toBeVisible();
    for (const s of await page.evaluate(adlariDenetle)) sorunlar.push(`akış diyagramı (düğme): ${s}`);
    // Giriş tarifi formu (Elle tanımla / Düzenle) açıkken de.
    await page.goto('/#/ayarlar/giris');
    await bekle(page);
    await page.getByRole('button', { name: /^Elle tanımla — CANLI giriş tarifi$/ }).click();
    await bekle(page);
    for (const s of await page.evaluate(adlariDenetle)) sorunlar.push(`giriş tarifi formu: ${s}`);
    await baglam.close();
    expect(sorunlar).toEqual([]);
  });
});
