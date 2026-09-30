// KORUMA TESTİ — Tüm ekranlar taşmasız: gerçekçi SAHTE veriyle (uzun ekran / servis / tablo adları, onlarca senaryo ve tablo,
// koşu sonuçları; arayuz-tarama-fikstur.ts) dolu geçici bir Nöbetçi'de ana rotalar 1440 ve 390 px genişlikte gezilir; her rotada
// ölçülür: (1) sayfa yatay taşmaz, (2) kaydırmasız bir kart / kutunun içinden dışarı taşan öğe yok, (3) etkileşimli öğeler (düğme,
// bağlantı, alan) birbirinin üstüne binmez. Üst çubuk ara genişliklerde de (1024–1360) taşmaz.
// Güvenlik: yalnız 127.0.0.1 (sahte SOAP sunucusu) ve geçici veritabanı; gerçek Nöbetçi'ye ve veri/ klasörüne dokunulmaz.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { zenginNobetciKur, type ZenginNobetci } from './arayuz-tarama-fikstur';

/** Sayfada çalışır: taşma ve binme bulguları (boşsa sorun yok). */
function olc(): string[] {
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  const ad = (e: Element) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).trim().split(/\s+/).slice(0, 2).join('.')} "${((e as HTMLElement).innerText || '').trim().slice(0, 40)}"`;
  const gorunur = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const kapali = e.closest('details:not([open])');
    if (kapali && !e.closest('summary')) return false;
    return !e.closest('[hidden], .gorunmez, [aria-hidden="true"]');
  };
  const kaydirmali = (e: Element, dur: Element | null) => {
    for (let p = e.parentElement; p && p !== dur && p !== document.body; p = p.parentElement) {
      if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  if (document.documentElement.scrollWidth > vw + 1) out.push(`sayfa yatay taşıyor: ${document.documentElement.scrollWidth} > ${vw}`);
  for (const k of document.querySelectorAll('main .kart, main section, main fieldset, main .not-kutusu')) {
    if (!gorunur(k) || ['auto', 'scroll'].includes(getComputedStyle(k).overflowX)) continue;
    const kr = k.getBoundingClientRect();
    for (const c of k.querySelectorAll('button, a, input, select, textarea, span, b, code, h2, h3, h4, p, table')) {
      if (!gorunur(c) || kaydirmali(c, k) || c.closest('.acilir-menu')) continue;
      const ps = getComputedStyle(c).position;
      if (ps === 'absolute' || ps === 'fixed') continue;
      const cr = c.getBoundingClientRect();
      if (cr.right > kr.right + 2 || cr.left < kr.left - 2) { out.push(`kutudan taşan: ${ad(c)} ⟶ ${ad(k)}`); break; }
    }
  }
  const katmanli = (e: Element) => { for (let p: Element | null = e; p; p = p.parentElement) if (['fixed', 'sticky', 'absolute'].includes(getComputedStyle(p).position)) return true; return false; };
  const etk = [...document.querySelectorAll('main button, main a[href], main input:not([type=hidden]), main select, main textarea')]
    .filter((e) => gorunur(e) && !katmanli(e) && !e.closest('.acilir-menu'));
  // Kaydırma kutusunun (ör. dar ekranda kendi içinde kayan tablo listesi) dışında kalan kısım görünmez: dikdörtgen kutuyla kırpılır.
  const kirp = (e: Element) => {
    const b = e.getBoundingClientRect();
    let [l, t, rr, bb] = [b.left, b.top, b.right, b.bottom];
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = p.getBoundingClientRect();
      l = Math.max(l, q.left); t = Math.max(t, q.top); rr = Math.min(rr, q.right); bb = Math.min(bb, q.bottom);
    }
    return { left: l, top: t, right: rr, bottom: bb };
  };
  const r = etk.map(kirp);
  for (let i = 0; i < etk.length; i++) {
    for (let j = i + 1; j < etk.length; j++) {
      const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left);
      const y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
      if (x > 3 && y > 3 && !etk[i].contains(etk[j]) && !etk[j].contains(etk[i]) && !(etk[i].closest('label') && etk[i].closest('label') === etk[j].closest('label'))) {
        out.push(`binen: ${ad(etk[i])} ∩ ${ad(etk[j])}`);
      }
    }
  }
  return out.slice(0, 10);
}

test.describe('tüm ekranlar taşmasız', () => {
  test.describe.configure({ mode: 'serial' });
  let z: ZenginNobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'arayuz-tasma-'));
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

  test('ana rotalar 1440 ve 390 px: yatay taşma, kutudan taşma ve binen öğe yok', async () => {
    test.setTimeout(90_000);
    const e = encodeURIComponent(z.ekranIdleri[1]);
    const rotalar = [
      '#/sonuclar', '#/sonuclar/ozet', '#/sonuclar/servisler', '#/sonuclar/uctan-uca', `#/sonuclar/kosu/${z.kosuIdleri[3]}`, `#/sonuclar/kosu/${z.kosuIdleri[2]}`,
      `#/sonuclar/karsilastir/${z.kosuIdleri[0]}/${z.kosuIdleri[1]}`, '#/senaryolar', `#/senaryolar/u/${e}`, `#/senaryolar/duzenle/${encodeURIComponent(z.senaryoIdleri[3])}`,
      '#/servisler', `#/servisler/s/${z.soapServisId}`, `#/servisler/s/${z.restServisId}`, '#/servisler/sonuclar', '#/akislar', `#/akislar/${z.uctanUcaId}`,
      '#/ekranlar', `#/ekranlar/e/${e}`, '#/ekranlar/yeni',
      '#/veri', '#/planli-kosular',
      ...['proje', 'giris', 'kosu', 'yedekleme', 'guvenlik', 'izinler', 'entegrasyonlar'].map((b) => `#/ayarlar/${b}`)
    ];
    const sorunlar: string[] = [];
    const hatalar: string[] = [];
    for (const genislik of [1440, 390]) {
      const baglam = await tarayici.newContext({ baseURL: z.nobetci.adres, viewport: { width: genislik, height: 900 }, reducedMotion: 'reduce' });
      const page = await baglam.newPage();
      page.on('pageerror', (h) => hatalar.push(`${genislik}px: ${String(h)}`));
      for (const rota of rotalar) {
        await page.goto(`/${rota}`);
        await bekle(page);
        for (const s of await page.evaluate(olc)) sorunlar.push(`${genislik}px ${rota}: ${s}`);
        // İsteğe bağlı görsel denetim: ARAYUZ_EKRAN_KLASORU verilirse her rota için tam sayfa görüntü (varsayılan yok).
        if (process.env.ARAYUZ_EKRAN_KLASORU) {
          mkdirSync(process.env.ARAYUZ_EKRAN_KLASORU, { recursive: true });
          await page.screenshot({ path: join(process.env.ARAYUZ_EKRAN_KLASORU, `${genislik}-${rota.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`), fullPage: true });
        }
      }
      // Sonuç ayrıntısı (uzun ekran adlı rozet) ve satır ⋯ menüsü pencere içinde.
      await page.goto(`/#/sonuclar/kosu/${z.kosuIdleri[3]}`);
      await bekle(page);
      await page.locator('a[href^="#/sonuclar/sonuc/"]').first().click();
      await bekle(page);
      for (const s of await page.evaluate(olc)) sorunlar.push(`${genislik}px sonuç ayrıntısı: ${s}`);
      await page.goto(`/#/ekranlar/e/${e}`);
      await bekle(page);
      await page.getByRole('button', { name: /^Ekran işlemleri:/ }).first().click();
      const menu = page.locator('.acilir-menu:not([hidden])').first();
      await expect(menu).toBeVisible();
      await expect.poll(async () => menu.evaluate((m) => { const b = m.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }), `${genislik}px ⋯ menüsü pencere içinde`).toBe(true);
      await page.keyboard.press('Escape');
      // "Modeli güncelle" menüsü (açıklamalı seçenekler) de pencere içinde.
      await page.getByRole('button', { name: /^Modeli güncelle/ }).click();
      const modelMenusu = page.locator('.model-menusu .acilir-menu:not([hidden])');
      await expect(modelMenusu).toBeVisible();
      await expect.poll(async () => modelMenusu.evaluate((m) => { const b = m.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }), `${genislik}px model menüsü pencere içinde`).toBe(true);
      if (process.env.ARAYUZ_EKRAN_KLASORU) await page.screenshot({ path: join(process.env.ARAYUZ_EKRAN_KLASORU, `${genislik}-model-menusu.png`) });
      await baglam.close();
    }
    expect(sorunlar).toEqual([]);
    expect(hatalar).toEqual([]);
  });

  test('Senaryolar: uzun "Beklenen" rozeti satır kaydırır, kutusundan taşmaz', async () => {
    const baglam = await tarayici.newContext({ baseURL: z.nobetci.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    await page.goto(`/#/senaryolar/u/${encodeURIComponent(z.ekranIdleri[1])}`);
    await bekle(page);
    const rozet = page.locator('.senaryo-tablosu td.beklenen-hucresi .rozet').first();
    await expect(rozet).toBeVisible();
    const olcum = await rozet.evaluate((r) => {
      r.textContent = 'Ödeme: Açık hesapla tamamlanır ve belge üretilir';
      return { yukseklik: r.getBoundingClientRect().height, tasmaY: r.scrollHeight - r.clientHeight, tasmaX: r.scrollWidth - r.clientWidth };
    });
    expect(olcum.yukseklik, 'uzun metin birden çok satıra kayar').toBeGreaterThan(24);
    expect(olcum.tasmaY).toBeLessThanOrEqual(1);
    expect(olcum.tasmaX).toBeLessThanOrEqual(1);
    // Tüm senaryolar (Ekran sütunu da görünür, sütunlar dar): sözcük ortasından kırılmaz ("Teslima / t / bilgile / ri" değil).
    await page.goto('/#/senaryolar');
    await bekle(page);
    const tumunde = page.locator('.senaryo-tablosu td.beklenen-hucresi .rozet').first();
    await expect(tumunde).toBeVisible();
    const bolunen = await tumunde.evaluate((r) => {
      r.textContent = 'Teslimat bilgileri';
      const metin = r.firstChild as Text;
      const sonuc: string[] = [];
      let i = 0;
      for (const s of 'Teslimat bilgileri'.split(' ')) {
        const aralik = document.createRange();
        aralik.setStart(metin, i);
        aralik.setEnd(metin, i + s.length);
        const satirlar = new Set([...aralik.getClientRects()].map((x) => Math.round(x.top)));
        if (satirlar.size > 1) sonuc.push(s);
        i += s.length + 1;
      }
      return sonuc;
    });
    expect(bolunen, 'sözcük satır ortasından bölünmemeli').toEqual([]);
    await baglam.close();
  });

  test('Ayarlar > Ortamlar: Düzenle / Geçmiş / Sil her satırda aynı boy ve biçimde; varsayılanın Sil düğmesi devre dışı + nedeni', async () => {
    const baglam = await tarayici.newContext({ baseURL: z.nobetci.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    await page.goto('/#/ayarlar/proje');
    await bekle(page);
    const olcu = async (ad: string) => page.getByRole('button', { name: ad }).evaluate((b) => {
      const r = b.getBoundingClientRect();
      return { g: Math.round(r.width), y: Math.round(r.height), sinif: b.className, ikon: Boolean(b.querySelector('svg, .ikon')) };
    });
    const testSil = page.getByRole('button', { name: 'Sil — TEST: sil', exact: true });
    await expect(testSil).toBeDisabled();
    await expect(testSil).toHaveAttribute('title', /Varsayılan ortam silinemez/);
    await expect(page.getByRole('button', { name: 'Sil — CANLI: sil', exact: true })).toBeEnabled();
    for (const tur of ['düzenle', 'sil']) expect(await olcu(`TEST: ${tur}`), tur).toEqual(await olcu(`CANLI: ${tur}`));
    expect(await olcu('TEST ortam türü: değişiklik geçmişi')).toEqual(await olcu('CANLI ortam türü: değişiklik geçmişi'));
    await baglam.close();
  });

  test('Sonuçlar rehberi ekrandaki her bölümü sırayla anlatır ve vurgular', async () => {
    const baglam = await tarayici.newContext({ baseURL: z.nobetci.adres, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await baglam.newPage();
    await page.goto('/#/sonuclar');
    await bekle(page);
    await expect(page.locator('section[aria-labelledby="basarisiz-basligi"]')).toBeVisible();
    await expect(page.locator('.test-paneli')).toBeVisible();
    await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
    const kart = page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') });
    await expect(kart).toBeVisible();
    // Ekrandaki bölüm → rehber adımı (her biri bu sayfada vurgulanır).
    const bolumler: Array<[string, string]> = [
      ['Ekran / servis seçimi', '.alt-nav'], ['Sağlık noktası', '.yan-panel .yan-not'], ['Rapor sekmeleri', '.sonuc-sekmeleri'],
      ['Başlık ve "Koşuyu başlat"', '.sonuc-icerik > .sayfa-basligi'], ['Tarih aralığı', '.sonuc-araligi'], ['Özet kartlar', '.sonuc-kartlari'],
      ['Koşu trendi', '.trend-kapsayici'], ['Başarısız testler', 'section[aria-labelledby="basarisiz-basligi"]'], ['Test paneli', '.test-paneli'],
      ['Koşu geçmişi', 'section[aria-labelledby="gecmis-basligi"]'], ['Hata kalıpları', 'section[aria-labelledby="kalip-basligi"]']
    ];
    for (const [baslik, secici] of bolumler) {
      await expect(page.locator(secici).first(), `${baslik}: bölüm sayfada`).toBeVisible();
      await kart.getByRole('button', { name: `Adım ${bolumler.findIndex(([b]) => b === baslik) + 2}: ${baslik}`, exact: true }).click();
      await expect(kart.getByRole('heading', { name: baslik, exact: true })).toBeVisible();
      // Vurgu bu bölümün üzerinde (önceki adımın vurgusu değil).
      await expect.poll(() => page.evaluate((s) => {
        const v = document.querySelector('.rehber-vurgu') as HTMLElement | null;
        const t = document.querySelector(s);
        if (!v || v.hidden || !t) return false;
        const a = v.getBoundingClientRect(); const b = t.getBoundingClientRect();
        return Math.abs(a.left + 6 - b.left) < 3 && Math.abs(a.top + 6 - b.top) < 3 && Math.abs(a.width - 12 - b.width) < 3;
      }, secici), `${baslik}: vurgu bölümün üzerinde`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await baglam.close();
  });

  test('üst çubuk ara genişliklerde taşmaz (uzun proje adı)', async () => {
    const baglam = await tarayici.newContext({ baseURL: z.nobetci.adres, viewport: { width: 1440, height: 800 } });
    const page = await baglam.newPage();
    await page.goto('/#/sonuclar');
    await bekle(page);
    for (const genislik of [1360, 1300, 1200, 1100, 1024]) {
      await page.setViewportSize({ width: genislik, height: 800 });
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${genislik}px`).toBeLessThanOrEqual(genislik);
    }
    await baglam.close();
  });
});
