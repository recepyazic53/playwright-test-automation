// KORUMA TESTLERİ — ARANABİLİR SEÇİM (arayuz/aranabilir-secim.js): seçenek sayısı eşiğin (Ayarlar > Arayüz; varsayılan 15) üstündeki
// açılır listeler tıklanınca / odaktayken yazılınca arama penceresi açar. 2500 seçenekli alanda yazınca süzülür (Türkçe harf
// duyarsız), klavyeyle seçilir, değer alttaki gerçek <select>'e ve senaryoya geçer, yeniden açılınca seçili görünür; 14 seçenekli
// alan olağan select kalır; bağımlı liste güncellenir; yazma → çizim süresi kısa; 1440 / 390 px'te taşma yok, pencere ekran dışına
// taşmaz (yer yoksa yukarı açılır); erişilebilirlik rolleri (combobox / listbox / option) doğru. Ayrı Nöbetçi, geçici veritabanı;
// yalnız 127.0.0.1, dış istek yok. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const EKRAN = 'Uzun liste formu';
const SEHIRLER = ['İSTANBUL', 'IĞDIR', 'Şanlıurfa', 'ÇORUM', 'izmir', 'Ağrı', 'MUŞ', 'Ordu', 'Düzce', 'Kırşehir'];
const kodNo = (i: number) => `K${String(i).padStart(4, '0')}`;
/** 2500 seçenek; K2345 tek "İSTİKLAL" seçeneği. */
const KODLAR = Array.from({ length: 2500 }, (_, j) => {
  const i = j + 1;
  return { deger: kodNo(i), metin: i === 2345 ? `${kodNo(i)} — İSTİKLAL ŞUBESİ ÖZEL` : `${kodNo(i)} — ${SEHIRLER[j % SEHIRLER.length]} şubesi` };
});
const liste = (onEk: string, n: number) => Array.from({ length: n }, (_, j) => ({ deger: `${onEk}-${String(j + 1).padStart(2, '0')}`, metin: `${onEk}-${String(j + 1).padStart(2, '0')} şube` }));

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});

function paket(): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'uzun-liste', ad: EKRAN, aciklama: 'Aranabilir seçim fikstürü (değerler sahte).', ekranUrl: '/form', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'Bilgiler',
      bolumler: [{ id: 'temel', baslik: 'Temel', alanlar: [
        alan('kod', 'secim', 'Kod', { seceneklerDurumu: 'tam', secenekler: KODLAR }),
        alan('kisa', 'secim', 'Kısa liste', { seceneklerDurumu: 'tam', secenekler: liste('S', 14) }),
        alan('bolge', 'secim', 'Bölge', { seceneklerDurumu: 'tam', secenekler: [{ deger: 'A', metin: 'A bölgesi' }, { deger: 'B', metin: 'B bölgesi' }, { deger: 'C', metin: 'C bölgesi' }] }),
        alan('sube', 'secim', 'Şube', { bagimlilik: { alan: 'bolge', secenekHaritasi: { A: liste('A', 30), B: liste('B', 5), C: liste('C', 40) } } })
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Tamam', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'uzun-liste', ad: EKRAN, urlYolu: '/form' }, olusturan: 'birim testi', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
    bilinmeyenler: []
  };
}

test.describe('aranabilir seçim: uzun açılır listelerde yazarak arama (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Aranabilir-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const senaryoIdBul = async (baslik: string) => {
    const l = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    return String(l.find((x) => x.baslik === baslik)?.id ?? '');
  };
  const senaryoAl = async (id: string) => (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;

  async function sayfaAc(adres: string, genislik = 1440, yukseklik = 1000): Promise<{ page: Page; hatalar: string[] }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik }, reducedMotion: 'reduce' });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(adres);
    await expect(secim(page, 'kod')).toBeVisible({ timeout: 20_000 });
    return { page, hatalar };
  }
  const secim = (page: Page, id: string): Locator => page.locator(`[data-alan="${id}"] select`);
  const pencere = (page: Page): Locator => page.locator('.aranabilir-pencere');
  const arama = (page: Page): Locator => pencere(page).getByRole('combobox');
  const secenekler = (page: Page): Locator => pencere(page).getByRole('listbox').getByRole('option');
  const durum = (page: Page): Locator => pencere(page).getByRole('status');
  const tasmaYok = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  /** Pencere görünür alanın içinde mi (8 px pay dahil değil; yalnız taşma). */
  const penceredeMi = (page: Page) => pencere(page).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= document.documentElement.clientWidth && r.bottom <= window.innerHeight;
  });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'aranabilir-secim-'));
    fikstur = await yerelSunucu((): FiksturYaniti => ({ durum: 404, tur: 'text/plain', govde: 'yok' }));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Liste Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === EKRAN)?.id);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('2500 seçenek: tıklayınca arama penceresi (roller doğru), yazınca süzülür, Türkçe harf duyarsız, klavyeyle seçilir; 14 seçenek olağan select', async () => {
    test.setTimeout(120_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const kod = secim(page, 'kod');
    // Select erişilebilirlik ağacında aynen kalır (etiketiyle bulunur, rolü combobox).
    await expect(page.getByRole('combobox', { name: 'Kod', exact: true })).toHaveCount(1);
    await expect(kod).toHaveValue('');
    // Tıklama → pencere; arama kutusu odakta, combobox + listbox + option rolleri.
    await kod.click();
    await expect(pencere(page)).toBeVisible();
    await expect(arama(page)).toBeFocused();
    await expect(arama(page)).toHaveAccessibleName('Kod: yazarak arayın');
    await expect(arama(page)).toHaveAttribute('aria-expanded', 'true');
    const listeId = await pencere(page).getByRole('listbox').getAttribute('id');
    await expect(arama(page)).toHaveAttribute('aria-controls', String(listeId));
    await expect(pencere(page).getByRole('listbox')).toHaveAccessibleName('Kod');
    await expect(kod).toHaveAttribute('aria-expanded', 'true');
    await expect(durum(page)).toHaveText('2500 seçenek');
    await expect(secenekler(page)).toHaveCount(200);
    await expect(pencere(page).locator('.aranabilir-not')).toContainText('daha fazlası için yazmaya devam edin');
    expect(await penceredeMi(page)).toBe(true);

    // Yazınca süzülür (içerir), eşleşen kısım vurgulanır; ↓ ile gezilir, Enter seçer.
    await arama(page).pressSequentially('k000');
    await expect(durum(page)).toHaveText('9 sonuç');
    await expect(secenekler(page)).toHaveCount(9);
    await expect(pencere(page).locator('.aranabilir-not')).toBeHidden();
    await expect(secenekler(page).first().locator('mark')).toHaveText('K000');
    // İlk eşleşme etkin; ↓ ↓ → üçüncü.
    await expect(secenekler(page).nth(0)).toHaveAttribute('aria-selected', 'true');
    await arama(page).press('ArrowDown');
    await arama(page).press('ArrowDown');
    const ucuncu = secenekler(page).nth(2);
    await expect(ucuncu).toHaveAttribute('aria-selected', 'true');
    await expect(arama(page)).toHaveAttribute('aria-activedescendant', String(await ucuncu.getAttribute('id')));
    await arama(page).press('ArrowUp');
    await expect(secenekler(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await arama(page).press('ArrowDown');
    await arama(page).press('Enter');
    await expect(pencere(page)).toHaveCount(0);
    await expect(kod).toHaveValue('K0003');
    await expect(kod).toBeFocused();
    await expect(kod).not.toHaveAttribute('aria-expanded', /.*/);

    // Odaktayken yazmak pencereyi açar (harf aramaya yazılır). Türkçe: "ığdır" = "IĞDIR"; noktasız I ile "ISTIKLAL" = "İSTİKLAL".
    await page.keyboard.type('IĞDIR');
    await expect(pencere(page)).toBeVisible();
    await expect(arama(page)).toHaveValue('IĞDIR');
    await expect(durum(page)).toHaveText('250 sonuç');
    await expect(secenekler(page)).toHaveCount(200);
    await expect(pencere(page).locator('.aranabilir-not')).toContainText('250 sonuçtan 200 tanesi gösteriliyor');
    await expect(secenekler(page).first().locator('mark')).toHaveText('IĞDIR');
    await arama(page).fill('ığdır');
    await expect(durum(page)).toHaveText('250 sonuç');
    await arama(page).fill('şANLIURFA');
    await expect(durum(page)).toHaveText('250 sonuç');
    await expect(secenekler(page).first().locator('mark')).toHaveText('Şanlıurfa');
    await arama(page).fill('bulunmayan-metin');
    await expect(durum(page)).toHaveText('Sonuç yok');
    await expect(secenekler(page)).toHaveCount(0);
    // Esc: kapanır, değer değişmez, odak select'e döner.
    await arama(page).press('Escape');
    await expect(pencere(page)).toHaveCount(0);
    await expect(kod).toHaveValue('K0003');
    await expect(kod).toBeFocused();
    await page.keyboard.type('ISTIKLAL');
    await expect(durum(page)).toHaveText('1 sonuç');
    await expect(secenekler(page).first().locator('mark')).toHaveText('İSTİKLAL');
    await arama(page).fill('şubesi özel');
    await expect(durum(page)).toHaveText('1 sonuç');
    // Fareyle seçim.
    await secenekler(page).first().click();
    await expect(pencere(page)).toHaveCount(0);
    await expect(kod).toHaveValue('K2345');
    await expect(kod.locator('option:checked')).toHaveText('K2345 — İSTİKLAL ŞUBESİ ÖZEL');

    // Tab: pencere kapanır, odak select'ten sonraki öğeye geçer (değer değişmez).
    await kod.focus();
    await page.keyboard.press('ArrowDown');
    await expect(pencere(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(pencere(page)).toHaveCount(0);
    await expect(kod).not.toBeFocused();
    await expect(kod).toHaveValue('K2345');
    // Dışarı tıklayınca kapanır.
    await kod.click();
    await expect(pencere(page)).toBeVisible();
    await page.locator('[data-alan="kisa"] label').first().click();
    await expect(pencere(page)).toHaveCount(0);

    // 14 seçenekli alan olağan select kalır (yazınca pencere açılmaz; selectOption aynen çalışır).
    const kisa = secim(page, 'kisa');
    await expect(kisa.locator('option:not([value=""])')).toHaveCount(14);
    await kisa.focus();
    await page.keyboard.press('s');
    await expect(pencere(page)).toHaveCount(0);
    await kisa.selectOption('S-07');
    await expect(kisa).toHaveValue('S-07');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('performans: 2500 seçenekte açılış ve yazma → çizim kısa sürer', async () => {
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const olcum = await secim(page, 'kod').evaluate((sel) => {
      const t0 = performance.now();
      sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      const acilis = performance.now() - t0;
      const girdi = document.querySelector('.aranabilir-pencere input') as HTMLInputElement;
      const sureler: number[] = [];
      for (const metin of ['ş', 'şu', 'şub', 'şube', 'şubes', 'ı', 'ığ', 'k1', 'k12', '']) {
        const t = performance.now();
        girdi.value = metin;
        girdi.dispatchEvent(new Event('input', { bubbles: true }));
        sureler.push(performance.now() - t);
      }
      return { acilis, enCok: Math.max(...sureler) };
    });
    expect(olcum.acilis, `açılış ${olcum.acilis.toFixed(1)} ms`).toBeLessThan(150);
    expect(olcum.enCok, `yazma → çizim ${olcum.enCok.toFixed(1)} ms`).toBeLessThan(150);
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('bağımlı liste: üst seçim değişince seçenekler güncellenir (uzun → aranabilir, kısa → olağan); açıkken select yeniden çizilirse pencere kapanır', async () => {
    test.setTimeout(90_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const bolge = secim(page, 'bolge');
    await bolge.selectOption('A');
    await expect(secim(page, 'sube').locator('option:not([value=""])')).toHaveCount(30);
    await secim(page, 'sube').click();
    await expect(durum(page)).toHaveText('30 seçenek');
    await arama(page).pressSequentially('a-17');
    await expect(durum(page)).toHaveText('1 sonuç');
    // Açıkken üst seçim değişir → şube select'i yeniden çizilir → pencere kapanır (eski listeden seçim yapılamaz).
    await bolge.selectOption('C');
    await expect(pencere(page)).toHaveCount(0);
    await expect(secim(page, 'sube').locator('option:not([value=""])')).toHaveCount(40);
    await secim(page, 'sube').click();
    await expect(durum(page)).toHaveText('40 seçenek');
    await arama(page).pressSequentially('C-33');
    await expect(durum(page)).toHaveText('1 sonuç');
    await arama(page).press('Enter');
    await expect(secim(page, 'sube')).toHaveValue('C-33');
    // B: 5 seçenek → olağan select.
    await bolge.selectOption('B');
    await expect(secim(page, 'sube').locator('option:not([value=""])')).toHaveCount(5);
    await secim(page, 'sube').focus();
    await page.keyboard.press('b');
    await expect(pencere(page)).toHaveCount(0);
    // Açıkken seçenekler yerinde değişirse liste yenilenir.
    await bolge.selectOption('A');
    await secim(page, 'sube').click();
    await expect(durum(page)).toHaveText('30 seçenek');
    await secim(page, 'sube').evaluate((sel) => { for (let i = 0; i < 3; i += 1) sel.append(new Option(`Yeni ${i}`, `Y${i}`)); });
    await expect(durum(page)).toHaveText('33 seçenek');
    await arama(page).press('Escape');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('senaryoya kaydedilir, yeniden açılınca seçili görünür; 390 px taşma yok, pencere ekranda kalır ve yer yoksa yukarı açılır', async () => {
    test.setTimeout(120_000);
    let { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const kod = secim(page, 'kod');
    await kod.click();
    await arama(page).pressSequentially('istiklal');
    await arama(page).press('Enter');
    await expect(kod).toHaveValue('K2345');
    await secim(page, 'bolge').selectOption('C');
    await secim(page, 'sube').click();
    await arama(page).pressSequentially('c-21');
    await arama(page).press('Enter');
    await expect(secim(page, 'sube')).toHaveValue('C-21');
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Uzun liste seçimi');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(() => senaryoIdBul('Uzun liste seçimi'), { timeout: 15_000 }).not.toBe('');
    const id = await senaryoIdBul('Uzun liste seçimi');
    expect((await senaryoAl(id)).veri).toMatchObject({ kod: 'K2345', bolge: 'C', sube: 'C-21' });
    expect(hatalar).toEqual([]);
    await page.context().close();

    // Yeniden aç: select değeri ve seçili satır (listenin 200'ünün dışında olsa da) görünür ve etkin.
    ({ page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${id}`));
    await expect(secim(page, 'kod')).toHaveValue('K2345');
    await expect(secim(page, 'kod').locator('option:checked')).toHaveText('K2345 — İSTİKLAL ŞUBESİ ÖZEL');
    await expect(secim(page, 'sube')).toHaveValue('C-21');
    await secim(page, 'kod').click();
    const secili = pencere(page).locator('.aranabilir-secenek.secili');
    await expect(secili).toHaveText('K2345 — İSTİKLAL ŞUBESİ ÖZEL');
    await expect(secili).toHaveAttribute('aria-selected', 'true');
    await expect(secili).toBeInViewport();
    await arama(page).press('Escape');
    await tasmaYok(page);
    await page.context().close();

    // 390 px: sayfa ve pencere taşmaz; alt kenara yakın select'te pencere yukarı açılır.
    ({ page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${id}`, 390, 800));
    await tasmaYok(page);
    await secim(page, 'kod').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await secim(page, 'kod').click();
    await expect(pencere(page)).toBeVisible();
    expect(await penceredeMi(page)).toBe(true);
    await tasmaYok(page);
    await arama(page).press('Escape');
    await secim(page, 'kod').evaluate((e) => e.scrollIntoView({ block: 'end' }));
    const altBosluk = await secim(page, 'kod').evaluate((e) => window.innerHeight - e.getBoundingClientRect().bottom);
    expect(altBosluk, 'select alt kenara yakın').toBeLessThan(200);
    await secim(page, 'kod').click();
    await expect(pencere(page)).toBeVisible();
    await expect(pencere(page)).toHaveClass(/yukari/);
    expect(await pencere(page).evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(await secim(page, 'kod').evaluate((e) => e.getBoundingClientRect().top));
    expect(await penceredeMi(page)).toBe(true);
    await tasmaYok(page);
    await arama(page).press('Escape');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('eşik Ayarlar > Arayüz\'dedir: eşik 3000 → 2500 seçenekli alan olağan select; varsayılan 15', async () => {
    test.setTimeout(90_000);
    const tanim = ((await api('/platform/kosu-ayarlari')).tanimlar as Nesne[]).find((t) => t.anahtar === 'aranabilirSecimEsigi');
    expect(tanim).toMatchObject({ bolum: 'arayuz', tur: 'sayi', varsayilan: 15 });
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { aranabilirSecimEsigi: 3000 } });
    let { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    await secim(page, 'kod').focus();
    await page.keyboard.press('k');
    await expect(pencere(page)).toHaveCount(0);
    await page.context().close();
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { aranabilirSecimEsigi: 15 } });
    ({ page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`));
    await secim(page, 'kod').focus();
    await page.keyboard.press('k');
    await expect(pencere(page)).toBeVisible();
    expect(hatalar).toEqual([]);
    await page.context().close();
    // Ayarlar > Arayüz'de alan görünür.
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const ayar = await baglam.newPage();
    await ayar.goto('/#/ayarlar/arayuz');
    await expect(ayar.getByLabel(/Aranabilir liste eşiği/)).toHaveValue('15', { timeout: 20_000 });
    await baglam.close();
  });

  test('ekran görüntüsü: açık liste ve yazılmış arama (koyu ve açık tema)', async () => {
    const { page } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`, 1440, 900);
    for (const tema of ['koyu', 'acik']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-tema', t), tema);
      await secim(page, 'kod').evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await secim(page, 'kod').click();
      await arama(page).pressSequentially('ığdır');
      await expect(durum(page)).toHaveText('250 sonuç');
      await page.screenshot({ path: test.info().outputPath(`aranabilir-secim-${tema}.png`) });
      await arama(page).press('Escape');
    }
    await page.context().close();
  });
});
