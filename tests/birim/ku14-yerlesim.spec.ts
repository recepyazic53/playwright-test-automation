// ARAYÜZ (yerel) — v1.4 kullanılabilirlik: görsel hatalar ve akış diyagramı tutarlılığı. Yerleşim ölçülür (bounding box):
//   akış diyagramında alan çipinin yazısı ile "gruptan çıkar" (×) çakışmaz; "Başarı / Uyarı" radyoları etiketlerine binmez; "Ekran
//   açılır" kartı giriş kartından geniş değildir ve üstüne / altına binmez. Senaryo önerilerinde CSP (inline style) konsol ihlali
//   yoktur; "—" (verisiz) ölçüde dolu çubuk çizilmez; anlamsız "puan N" gösterilmez. Koşul penceresi onay kutusu alanını listeler;
//   "+ > Aksiyon" düğmesi seçili gelir, elle eklenen düğme boş aksiyonu doldurur; "Yalnız görünürse bas" kuralı hatadan önce ipucu.
// Ayrı Nöbetçi (127.0.0.1), geçici veritabanı; dış istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kodAlanlariniTamamla, sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { siparisPaketi, tabanVerisi } from './senaryo-onerileri-fikstur';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const PAROLA = `Gecici-Yerlesim-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortamId = '';
let formEkrani = '';
let oneriEkrani = '';

const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
/** Üyelik formu (nötr fikstür): seçim + onay kutusu + metin alanları, Hesapla düğmesi ve başarı mesajı. */
function uyelikPaketi(): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'uyelik-formu', ad: 'Üyelik formu', aciklama: 'Yerleşim fikstürü (değerler sahte).', ekranUrl: '/uyelik/', girisGerekmez: true,
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' },
    kosullar: { kurumsalIse: { aciklama: 'Müşteri tipi Kurumsal', ifade: { alan: 'musteriTipi', esit: 'kurumsal' } } },
    adimlar: [{
      id: 'form', sira: 1, baslik: 'Üyelik bilgileri',
      bolumler: [
        { id: 'bilgiler', baslik: 'Bilgiler', alanlar: [
          alan('musteriTipi', 'secim', 'Müşteri tipi', { seceneklerDurumu: 'tam', secenekler: [{ deger: 'bireysel', metin: 'Bireysel' }, { deger: 'kurumsal', metin: 'Kurumsal' }] }),
          alan('vergiNo', 'metin', 'Vergi no', { gorunurluk: { kosul: 'kurumsalIse' } }),
          alan('ekHizmet', 'onayKutusu', 'Ek hizmet'),
          alan('hizmetTuru', 'metin', 'Hizmet türü')
        ] },
        { id: 'islemler', baslik: 'İşlemler', alanlar: [
          { id: 'hesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#hesapla', kirilganlik: 'orta' } },
          { id: 'sonuc', tip: 'cikti', etiket: { ekran: 'Kayıt tamam' }, yapilandirma: 'cikti', konum: { secici: '#sonuc', kirilganlik: 'orta' } }
        ] }
      ],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#hesapla', aciklama: 'Hesapla' }], basariGostergesi: { tur: 'metin', deger: 'Kayıt tamam', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: model.id, ad: model.ad, urlYolu: model.ekranUrl }, olusturan: 'test', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'ku14-yerlesim-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Yerleşim Projesi' })).proje.id);
  ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
  // specDosyasi / pageObject yazılmamış paket de geçerlidir (Nöbetçi üretir).
  formEkrani = String((await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: uyelikPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] })).ekranId);
  oneriEkrani = String((await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: siparisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] })).ekranId);
  const t = new Date(); t.setDate(t.getDate() + 5);
  const tarih = `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`;
  await basarili('/platform/senaryo/kaydet', { projeId, ekranId: oneriEkrani, baslik: 'Kitap siparişi', veri: tabanVerisi(tarih), ortamIdleri: [ortamId], kosuyaDahil: true });
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Sayfa + CSP / konsol hataları ve 127.0.0.1 dışına istek denetimi. */
async function sayfa(genislik = 1440): Promise<{ page: Page; konsol: string[]; disari: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1200 } });
  const page = await baglam.newPage();
  const konsol: string[] = [];
  const disari: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) konsol.push(m.text()); });
  page.on('pageerror', (e) => konsol.push(String(e)));
  baglam.on('request', (r) => { if (!r.url().startsWith(nobetci.adres) && !r.url().startsWith('data:')) disari.push(r.url()); });
  return { page, konsol, disari };
}
type Kutu = { x: number; y: number; width: number; height: number };
async function kutu(l: Locator): Promise<Kutu> {
  const b = await l.boundingBox();
  expect(b, 'öğe görünür olmalı').not.toBeNull();
  return b as Kutu;
}
/** İki kutu (1 px pay) üst üste biniyor mu? */
const cakisir = (a: Kutu, b: Kutu): boolean => a.x + a.width > b.x + 1 && b.x + b.width > a.x + 1 && a.y + a.height > b.y + 1 && b.y + b.height > a.y + 1;

async function diyagramiAc(page: Page): Promise<void> {
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(formEkrani)}/akis`);
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
}

test('saf: specDosyasi / pageObject isteğe bağlı; yazılmazsa Nöbetçi üretir, yazılırsa boş olamaz; eski paket geçerli', async () => {
  const p = uyelikPaketi();
  expect(sayfaPaketiniDogrula(p).hatalar).toEqual([]);
  const bos = uyelikPaketi();
  bos.model.specDosyasi = '';
  expect(sayfaPaketiniDogrula(bos).hatalar.map((x) => x.mesaj).join(' ')).toContain('"specDosyasi" verilirse boş olmayan metin olmalı');
  // Eski biçim (alanları yazan) aynen geçerli ve değerleri korunur.
  const eski = uyelikPaketi();
  Object.assign(eski.model, { specDosyasi: 'tests/scenarios/x/x.spec.ts', pageObject: 'yok' });
  expect(sayfaPaketiniDogrula(eski).hatalar).toEqual([]);
  expect(kodAlanlariniTamamla(eski.model, 'uyelik-formu')).toBe(eski.model);
  expect(kodAlanlariniTamamla(p.model, 'uyelik-formu')).toMatchObject({ specDosyasi: 'tests/scenarios/uyelik-formu/uyelik-formu.spec.ts', pageObject: 'yok (model koşucusu)' });
  expect(kodAlanlariniTamamla(p.model, 'uyelik-formu', { specDosyasi: 'onceki.spec.ts', pageObject: 'OncekiSayfa' })).toMatchObject({ specDosyasi: 'onceki.spec.ts', pageObject: 'OncekiSayfa' });
  const ortak = { tur: 'ortakAkis', ad: 'x' };
  expect(kodAlanlariniTamamla(ortak, 'x')).toBe(ortak);
  // Yüklenen (alanları yazmayan) paketin modeli Nöbetçi'nin değerleriyle kaydedildi.
  const d = await api(`/platform/ekran?projeId=${projeId}&id=${encodeURIComponent(formEkrani)}`);
  expect(d.model).toMatchObject({ specDosyasi: 'tests/scenarios/uyelik-formu/uyelik-formu.spec.ts', pageObject: 'yok (model koşucusu)' });
});

test('akış diyagramı yerleşimi: çip yazısı ile × ve tuş seçimi çakışmaz, "Başarı / Uyarı" radyoları etiketine binmez, "Ekran açılır" giriş kartından geniş değil ve binmez', async () => {
  test.setTimeout(60_000);
  for (const genislik of [1440, 390]) {
    const { page, konsol, disari } = await sayfa(genislik);
    await diyagramiAc(page);
    const cipler = page.locator('.tasarim-alani');
    await expect(cipler).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const cip = cipler.nth(i);
      // Çipin doğrudan çocukları (ad, tür, sıra, koşul, "Doldurduktan sonra", zorunluluk, ×) birbirine binmez.
      const kutular = await cip.evaluate((e) => [...e.children].filter((c) => !c.classList.contains('alan-sirasi'))
        .map((c) => { const r = c.getBoundingClientRect(); return { ad: c.className || c.tagName, x: r.x, y: r.y, width: r.width, height: r.height }; }));
      for (let a = 0; a < kutular.length; a++) {
        for (let b = a + 1; b < kutular.length; b++) expect(cakisir(kutular[a], kutular[b]), `${genislik}px çip ${i}: ${kutular[a].ad} × ${kutular[b].ad}`).toBe(false);
      }
      // "Doldurduktan sonra" seçiminin yazısı açılır okuna binmez: metin, dolgular çıkınca kalan genişliğe sığar.
      const sigiyor = await cip.locator('.tus-secimi select').evaluate((s) => {
        const sel = s as HTMLSelectElement;
        const st = getComputedStyle(sel);
        const c = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
        c.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
        const metin = c.measureText(sel.options[sel.selectedIndex].text).width;
        return { metin, alan: sel.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight), sagDolgu: parseFloat(st.paddingRight) };
      });
      expect(sigiyor.metin, `${genislik}px çip ${i} tuş seçimi`).toBeLessThanOrEqual(sigiyor.alan + 0.5);
      expect(sigiyor.sagDolgu).toBeGreaterThanOrEqual(16);
    }
    // Başarı / Uyarı: radyonun kutusu etiket yazısının solunda biter.
    const binmeler = await page.locator('.mesaj-turu label').evaluateAll((etiketler) => etiketler.map((l) => {
      const girdi = (l.querySelector('input') as HTMLInputElement).getBoundingClientRect();
      const metin = [...l.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) as Text;
      const aralik = document.createRange();
      aralik.selectNodeContents(metin);
      const r = aralik.getBoundingClientRect();
      return { etiket: metin.textContent, bosluk: r.left - girdi.right, dikey: Math.abs((r.top + r.bottom) / 2 - (girdi.top + girdi.bottom) / 2) };
    }));
    expect(binmeler.map((x) => x.etiket)).toEqual(['Başarı', 'Uyarı']);
    for (const x of binmeler) {
      expect(x.bosluk, `${genislik}px ${x.etiket}`).toBeGreaterThanOrEqual(2);
      expect(x.dikey, `${genislik}px ${x.etiket} dikey hiza`).toBeLessThanOrEqual(4);
    }
    // "Ekran açılır" kartı giriş kartından geniş değil; giriş kartının altına binmez.
    const giris = await kutu(page.locator('.tasarim-akisi > .baslangic'));
    const acilis = await kutu(page.getByRole('listitem', { name: 'Ekran açılır' }));
    expect(acilis.width, `${genislik}px genişlik`).toBeLessThanOrEqual(giris.width + 1);
    expect(cakisir(giris, acilis), `${genislik}px çakışma`).toBe(false);
    expect(acilis.y).toBeGreaterThanOrEqual(giris.y + giris.height);
    expect(konsol).toEqual([]);
    expect(disari).toEqual([]);
    await page.close();
  }
});

test('koşul penceresi onay kutusu alanını listeler; "Ek hizmet işaretliyken" koşulu kaydedilir ve diyagramda düzenlenebilir kalır', async () => {
  test.setTimeout(60_000);
  const { page, konsol, disari } = await sayfa();
  await diyagramiAc(page);
  await page.getByRole('button', { name: 'Hizmet türü: koşul' }).click();
  const secim = page.getByRole('combobox', { name: 'Koşulun seçim alanı' });
  await expect(secim.locator('option')).toHaveText(['Koşulsuz (her zaman görünür)', 'Müşteri tipi', 'Ek hizmet']);
  await secim.selectOption({ label: 'Ek hizmet' });
  const degerler = page.getByRole('group', { name: 'Görünür olduğu seçenekler' });
  await expect(degerler.getByRole('radio')).toHaveCount(2);
  await degerler.getByLabel('İşaretli').check();
  await page.getByRole('button', { name: 'Koşulu kaydet' }).click();
  await expect(page.getByRole('button', { name: 'Hizmet türü: koşul' })).toHaveText('Ek hizmet = İşaretli ise');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/Akış kaydedildi/)).toBeVisible();
  const m = (await api(`/platform/ekran?projeId=${projeId}&id=${encodeURIComponent(formEkrani)}`)).model as Nesne;
  const hizmet = (m.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[])).find((a) => a.id === 'hizmetTuru') as Nesne;
  expect(m.kosullar[hizmet.gorunurluk.kosul].ifade).toEqual({ alan: 'ekHizmet', esit: true });
  // Yeniden açınca koşul kilitli (korunan) değil, düzenlenebilir.
  await diyagramiAc(page);
  await expect(page.getByRole('button', { name: 'Hizmet türü: koşul' })).toHaveText('Ek hizmet = İşaretli ise');
  expect(konsol).toEqual([]);
  expect(disari).toEqual([]);
  await page.close();
});

test('aksiyon tutarlılığı: "+ > Aksiyon" boş düğmeyle gelir; eklenen düğme boş aksiyona yerleşir; "Yalnız görünürse bas" kuralı kaydetmeden önce ipucu', async () => {
  test.setTimeout(60_000);
  const { page, konsol, disari } = await sayfa();
  await diyagramiAc(page);
  const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
  const aksiyonlar = diyagram.getByRole('listitem', { name: /blok: Aksiyon$/ });
  // Mevcut aksiyonu sil; "+ > Aksiyon" kullanılmayan düğmeyi ("Hesapla") seçili getirir.
  await aksiyonlar.first().getByRole('button', { name: 'Bloğu sil' }).click();
  await expect(aksiyonlar).toHaveCount(0);
  await diyagram.getByRole('button', { name: 'Buraya blok ekle' }).nth(1).click();
  await page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'Aksiyon' }).click();
  await expect(aksiyonlar.first().getByRole('combobox', { name: 'Basılacak düğme' })).toHaveValue('0');
  await expect(aksiyonlar.first().getByRole('note')).toHaveCount(0);
  // Kullanılmayan düğme kalmadı: yeni aksiyon düğmesiz gelir ve hata değil yol gösteren ipucu gösterir.
  await diyagram.getByRole('button', { name: 'Buraya blok ekle' }).nth(2).click();
  await page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'Aksiyon' }).click();
  await expect(aksiyonlar).toHaveCount(2);
  const ikinci = aksiyonlar.nth(1);
  await expect(ikinci.getByRole('combobox', { name: 'Basılacak düğme' })).toHaveValue('-1');
  await expect(ikinci.getByRole('note')).toContainText('eklenen düğme bu bloğa yerleşir');
  // Elle eklenen düğme yeni blok açmaz, düğmesiz aksiyona yerleşir (ortak akışta ve ekranda aynı kural).
  const palet = page.locator('aside[aria-label="Kayıtta yakalananlar"]');
  await palet.getByRole('tab', { name: /Düğmeler/ }).click();
  await palet.getByText('Listede olmayan düğmeyi elle ekle').click();
  await palet.getByLabel('Elle düğme yazısı').fill('Onayla');
  await palet.getByLabel('Elle düğme seçicisi').fill('#onayla');
  await palet.getByRole('button', { name: 'Düğmeyi ekle' }).click();
  await expect(aksiyonlar).toHaveCount(2);
  await expect(ikinci.getByRole('combobox', { name: 'Basılacak düğme' })).toHaveValue('1');
  await expect(diyagram.locator('select[aria-label="Basılacak düğme"]').evaluateAll((l) => l.map((s) => (s as HTMLSelectElement).value))).resolves.toEqual(['0', '1']);
  // "Yalnız görünürse bas": kural onay kutusunun yanında yazar; ilerleme düğmesinden sonra gelmeyen blokta işaretlenince uyarı ipucu.
  const ilk = aksiyonlar.first();
  await expect(ilk.getByText('Yalnız her senaryoda basılan bir düğmenin hemen ardından gelir', { exact: false })).toBeVisible();
  await ilk.getByRole('checkbox', { name: /Yalnız görünürse bas/ }).check();
  await expect(ilk.getByRole('note', { name: 'Yalnız görünürse bas kuralı' })).toBeVisible();
  await ilk.getByRole('checkbox', { name: /Yalnız görünürse bas/ }).uncheck();
  // İkinci aksiyon ilerleme düğmesinin hemen ardında: işaretlenince uyarı yok.
  await ikinci.getByRole('checkbox', { name: /Yalnız görünürse bas/ }).check();
  await expect(ikinci.getByRole('note', { name: 'Yalnız görünürse bas kuralı' })).toHaveCount(0);
  expect(konsol).toEqual([]);
  expect(disari).toEqual([]);
  await page.close();
});

test('senaryo önerileri: CSP konsol ihlali yok; kapsam çubuğu CSS değişkeniyle, verisiz ("—") ölçüde boş; "puan N" gösterilmez', async () => {
  test.setTimeout(60_000);
  const { page, konsol, disari } = await sayfa();
  await page.goto(`/#/senaryolar/u/${oneriEkrani}`);
  await page.getByRole('link', { name: 'Senaryo önerileri' }).click();
  await expect(page.getByRole('heading', { name: 'Senaryo önerileri', level: 2 })).toBeVisible();
  await expect(page.locator('li.oneri').first()).toBeVisible();
  const olculer = await page.locator('.kapsam-olcusu').evaluateAll((l) => l.map((b) => {
    const cubuk = b.querySelector('.kapsam-cubugu') as HTMLElement;
    const dolgu = cubuk.firstElementChild as HTMLElement;
    return {
      deger: (b.querySelector('.kapsam-degeri') as HTMLElement).textContent, bos: cubuk.classList.contains('bos'),
      oran: dolgu.getBoundingClientRect().width / cubuk.getBoundingClientRect().width, stil: dolgu.getAttribute('style') ?? ''
    };
  }));
  expect(olculer.length).toBeGreaterThan(0);
  for (const o of olculer) {
    // Satır içi style özniteliği CSP'ye takılmasın diye yalnız CSS değişkeni taşır (CSSOM ile yazılır).
    expect(o.stil).toMatch(/^--oran: \d+%;?$/);
    if (o.deger === '—') { expect(o.bos).toBe(true); expect(o.oran).toBe(0); continue; }
    const [a, b] = String(o.deger).split(' / ').map(Number);
    expect(Math.abs(o.oran - a / b), String(o.deger)).toBeLessThan(0.03);
  }
  await expect(page.locator('li.oneri').filter({ hasText: /puan \d+/ })).toHaveCount(0);
  expect(konsol).toEqual([]);
  expect(disari).toEqual([]);
  await page.close();
});

test('Sonuçlar sol menüsü: "Ekranlar ve servisler"; ortak akış EKRANLAR altında değil, ayrı "Ortak akışlar" grubunda (ekran sayısına girmez)', async () => {
  const ortak = String((await basarili('/platform/ortak-akis/olustur', { projeId, ad: 'Çıkış adımları' })).ekranId);
  const ozet = await api(`/platform/sonuclar/ozet?projeId=${projeId}`);
  expect((ozet.ekranlar as Nesne[]).map((e) => [e.ad, e.ortakAkis])).toEqual(expect.arrayContaining([['Çıkış adımları', true], ['Üyelik formu', false]]));
  const { page, konsol, disari } = await sayfa();
  await page.goto('/#/sonuclar/ozet');
  const nav = page.getByRole('navigation', { name: 'Ekranlar ve servisler' });
  await expect(nav.getByText('Ekranlar ve servisler', { exact: true })).toBeVisible();
  const ekranlarGrubu = nav.getByRole('group', { name: 'Ekranlar' });
  await expect(ekranlarGrubu.getByRole('link')).toHaveCount(2);
  await expect(ekranlarGrubu).not.toContainText('Çıkış adımları');
  await expect(nav.locator('[data-grup="ekranlar"] .nav-grup-baslik .adet')).toHaveText('2');
  await expect(nav.getByRole('group', { name: 'Ortak akışlar' }).getByRole('link', { name: /Çıkış adımları/ })).toHaveAttribute('href', `#/sonuclar/u/${encodeURIComponent(ortak)}`);
  expect(konsol).toEqual([]);
  expect(disari).toEqual([]);
  await page.close();
});

test('paket: "Paket nedir?" 2 sayfalık özete bağlanır (yerel); ortak akışta "Boş başla" önde ve ad kutusunun görünür etiketi var', async () => {
  const { page, konsol, disari } = await sayfa();
  await page.goto('/#/ekranlar/yeni');
  const baglanti = page.locator('.paket-nedir').getByRole('link', { name: 'Paket özetini oku (2 sayfa)' });
  await expect(baglanti).toHaveAttribute('href', '/arayuz/sayfa-paketi-ozet.md');
  const y = await page.request.get('/arayuz/sayfa-paketi-ozet.md');
  expect(y.status()).toBe(200);
  expect(y.headers()['content-type']).toContain('text/plain');
  const metin = await y.text();
  expect(metin).toContain('# Ekran paketi — kısa özet');
  expect(metin).toContain('isteğe bağlıdır');
  expect(metin.split('\n').length).toBeLessThan(140);
  await page.goto('/#/ekranlar/yeni/ortak-akis');
  await expect(page.locator('section.ekleme-secenekleri .ekleme-kutusu h3').first()).toHaveText('Boş başla');
  const kutuBos = page.locator('.bos-basla-kutusu');
  await expect(kutuBos.locator('label', { hasText: 'Ortak akışın adı' })).toBeVisible();
  await expect(kutuBos.getByLabel('Ortak akışın adı')).toBeEditable();
  expect(konsol).toEqual([]);
  expect(disari).toEqual([]);
  await page.close();
});
