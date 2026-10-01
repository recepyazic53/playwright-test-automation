// HIZLI TEST POLİGONU — yalnız POLIGON=1 ile koşar (normal `npm test`'i yavaşlatmaz). tests/poligon/ altındaki sahte uygulama (127.0.0.1)
// üzerinde Nöbetçi'nin hızlı testini her ekranda baştan sona sürer (sürücü: tests/poligon/surucu.ts): izin "Evet", veri durağı (elle /
// "Doldur" ile tablodan), zincir, bitiş etiketi, doğrulama koşusu, kaydet, ardından kaydedilen senaryonun normal koşusu. Sapmalar BULGU
// olarak POLIGON_RAPOR_KLASORU'na (sonuclar.json + ekran görüntüleri) yazılır; test bu aşamada bulgu yüzünden KIRMIZI olmaz (poligonun
// kendisi ve kurulum hariç). Ayrı Nöbetçi örneği, GEÇİCİ veri kökü (NOBETCI_VERI_KOKU) ve geçici veritabanı; kurulum sihirbazı arayüzden
// uydurma değerlerle geçilir. Kullanıcının veri/ klasörüne ve çalışan Nöbetçi'sine dokunulmaz; tarayıcılar yalnız 127.0.0.1'e çözümler.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { INSAN_YOLLARI } from '../poligon/insan-yollari';
import { PLANLAR, type EkranPlani } from '../poligon/planlar';
import {
  ekranKos, isBitsin as isBitsinO, kisilerTablosu, oturumBekle, oturumOku, planDegeri, poligonOrtami, secenekDegeri, type Nesne, type PoligonOrtami
} from '../poligon/surucu';
import { korumaliTarayici } from './giris-fikstur';
import { izinleriAcApi, type Nobetci, type Yanit } from './nobetci-sunucusu';

const ETKIN = process.env.POLIGON === '1';
test.skip(!ETKIN, 'Poligon koşusu yalnız POLIGON=1 ile (uzun sürer).');
test.describe.configure({ mode: 'serial' });

const RAPOR = process.env.POLIGON_RAPOR_KLASORU ?? join(tmpdir(), 'hizli-test-poligon');
/** Yalnız bu ekranlar (virgülle kökler; ör. POLIGON_EKRAN=/sepet,/otel). */
const SECILI = (process.env.POLIGON_EKRAN ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const PAROLA = `Gecici-Poligon-${randomBytes(6).toString('hex')}`;

let po: PoligonOrtami;
let nobetci: Nobetci;
let projeId = '';
let ortamId = '';
const sonuclar: Nesne[] = [];

const api = (yol: string, govde?: Nesne): Promise<Yanit> => po.api(yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
const oturum = (id: string): Promise<Nesne> => oturumOku(po, id);
const bekle = (id: string, durumlar?: string[], sn?: number): Promise<Nesne> => oturumBekle(po, id, durumlar, sn);
const isBitsin = (): Promise<void> => isBitsinO(po);
const sayac = (kok: string): Nesne => po.sayac(kok);

test.beforeAll(async () => {
  test.setTimeout(240_000);
  mkdirSync(RAPOR, { recursive: true });
  po = await poligonOrtami({ kasaArayuzu: true, geciciKok: process.env.POLIGON_GECICI_KOK });
  nobetci = po.nobetci;
  // Kurulum sihirbazı (arayüz; uydurma değerler).
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' })).newPage();
    await page.goto('/');
    await page.locator('.secim-karti').filter({ hasText: 'Yeni proje başlat' }).click();
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByRole('textbox', { name: 'Kasa parolası (tekrar) (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByText('Parolayı unutursam').click();
    await page.getByRole('button', { name: 'Kasayı oluştur ve devam et' }).click();
    await page.getByLabel('Proje adı').fill('Poligon');
    await page.getByRole('button', { name: 'Devam' }).click();
    await expect(page.getByRole('button', { name: 'Atla' })).toBeVisible();
    const { projeler } = (await api('/platform/projeler')) as unknown as { projeler: Array<{ id: string }> };
    projeId = projeler[0].id;
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Poligon', tabanUrl: po.poligon.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    po.projeId = projeId;
    po.ortamId = ortamId;
    await page.getByRole('button', { name: 'Atla' }).click();
    await page.getByRole('radio', { name: /^Gelişmiş — tüm özellikler/ }).check();
    await page.getByRole('button', { name: 'Devam' }).click();
    await page.getByRole('button', { name: 'Devam' }).click();
    await expect(page.getByRole('heading', { name: 'Proje hazır' })).toBeVisible();
    await page.screenshot({ path: join(RAPOR, '00-kurulum-proje-hazir.png') });
  } finally { await tarayici.close(); }
  await izinleriAcApi(nobetci);
  // "Doldur" için test verisi (uydurma).
  await kisilerTablosu(po);
});

test.afterAll(async () => {
  if (sonuclar.length) writeFileSync(join(RAPOR, 'sonuclar.json'), JSON.stringify(sonuclar, null, 2));
  await po?.kapat();
});

test('poligon: her ekran insan yoluyla baştan sona tamamlanır (sayaç: tam bir gönderim)', async () => {
  test.setTimeout(240_000);
  const tarayici = await korumaliTarayici();
  try {
    for (const [kok, yol] of Object.entries(INSAN_YOLLARI)) {
      const once = sayac(kok).gonderim;
      const page = await (await tarayici.newContext({ baseURL: po.poligon.adres })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`${kok}/`);
      await test.step(kok, async () => { await yol(page); });
      expect(hatalar, kok).toEqual([]);
      expect(sayac(kok).gonderim - once, `${kok} gönderim sayısı`).toBe(1);
      await page.context().close();
    }
  } finally { await tarayici.close(); }
});

for (const p of PLANLAR) {
  test(`hızlı test: ${p.kok}`, async () => {
    test.skip(SECILI.length > 0 && !SECILI.includes(p.kok), 'seçili değil');
    test.setTimeout(600_000);
    const r = await ekranKos(po, p, { rapor: RAPOR });
    delete r.modelHam;
    sonuclar.push(r);
    writeFileSync(join(RAPOR, 'sonuclar.json'), JSON.stringify(sonuclar, null, 2));
    console.log(`[${p.kok}] ${JSON.stringify(r.asamalar)} — ${r.bulgular.length} bulgu`);
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// HIZLI TEST ARAYÜZÜ — Nöbetçi'nin hızlı test ekranı kullanıcı gibi sürülür; her kontrol ✓ / ✗ + not olarak arayuz.json'a yazılır.
// ---------------------------------------------------------------------------------------------------------------------------------
const arayuzSonuclari: Nesne[] = [];
async function kontrol(bolum: string, ad: string, is: () => Promise<string | void>): Promise<boolean> {
  try {
    const not = await is();
    arayuzSonuclari.push({ bolum, ad, sonuc: true, not: not ?? '' });
    return true;
  } catch (e) {
    arayuzSonuclari.push({ bolum, ad, sonuc: false, not: String(e instanceof Error ? e.message : e).split('\n').slice(0, 4).join(' ').slice(0, 500) });
    return false;
  } finally {
    writeFileSync(join(RAPOR, 'arayuz.json'), JSON.stringify(arayuzSonuclari, null, 2));
  }
}
const UZUN = { timeout: 150_000 };
const soruKarti = (page: Page) => page.locator('.hizli-soru');
/**
 * "Doldur" panelinde uydurma "Kişiler" tablosunun satırı (önceki ekranların yazdığı tablolar da listelenir; aynı tablonun farklı
 * satırlarından değer seçilmesin), yoksa ilk aday.
 */
const kisilerSatiri = (panel: ReturnType<Page['locator']>): { click: () => Promise<void> } => ({
  click: async () => {
    // Kişiler tablosunun satır adı "Birinci" (kurulum); düğme yazısı "Birinci — <değer>" ya da tablo adını içerir.
    const k = panel.getByRole('button').filter({ hasText: /Kişiler ›|Birinci/ });
    await ((await k.count()) ? k.first() : panel.getByRole('button').first()).click();
  }
});
async function baslatArayuz(page: Page, ad: string, adres: string, izin: 'Evet' | 'Bana sor' | 'Hayır', ekranId?: string): Promise<void> {
  // Önceki (yarıda kalan) oturum yeni başlatmayı engeller: kapatılır.
  const s = (await api(`/platform/hizli-test/secenekler?projeId=${projeId}`)) as Nesne;
  if (s.surenOturum?.id) { await api('/platform/hizli-test/iptal', { id: s.surenOturum.id }); await isBitsin(); }
  await page.goto(ekranId ? `/#/hizli-test/duzenle/${ekranId}` : '/#/hizli-test');
  if (!ekranId) await page.getByLabel('Testin adı').fill(ad);
  await page.getByLabel('Sayfa adresi').fill(adres);
  await page.locator('.hizli-izin-secenegi').filter({ hasText: new RegExp(`^${izin}`) }).click();
  await page.getByRole('button', { name: 'Başlat' }).click();
  await expect(page).toHaveURL(/#\/hizli-test\/o\/[a-f0-9]{24}$/, { timeout: 30_000 });
}
const oturumKimligi = (page: Page): string => /#\/hizli-test\/o\/([a-f0-9]{24})/.exec(page.url())?.[1] ?? '';
async function veriSatirlari(page: Page): Promise<string[]> {
  return page.locator('.hizli-alanlar .hizli-alan .hizli-alan-baslik label').evaluateAll((l) => l.map((x) => (x.childNodes[0]?.textContent ?? '').trim()));
}
const satirBul = (page: Page, etiket: string) => page.locator('.hizli-alanlar .hizli-alan').filter({ has: page.locator('.hizli-alan-baslik label', { hasText: new RegExp(`^${etiket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }) }).first();

test('hızlı test arayüzü: kullanıcı gibi (iş başvurusu, Evet) — sıra, Doldur, karar, bitiş, kaydet, özet sekmesi, düzenleme', async () => {
  test.skip(SECILI.length > 0 && !SECILI.includes('arayuz'), 'seçili değil');
  test.setTimeout(900_000);
  const tarayici = await korumaliTarayici();
  const B = 'Evet / iş başvurusu';
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    baglam.setDefaultTimeout(30_000);
    const sayfaHatalari: string[] = [];
    page.on('pageerror', (e) => sayfaHatalari.push(String(e)));
    const d0 = sayac('/basvuru').doldurma.length;
    await kontrol(B, 'Başlat: ad boşken uyarı', async () => {
      await page.goto('/#/hizli-test');
      await expect(page.locator('.hizli-duraklar li')).toHaveCount(6);
      await page.getByRole('button', { name: 'Başlat' }).click();
      await expect(page.getByText('Testin adını yazın.')).toBeVisible();
    });
    await kontrol(B, 'Başlat: Evet izniyle oturum açılır, keşif kartı', async () => {
      await baslatArayuz(page, 'Poligon arayüz başvuru', '/basvuru/', 'Evet');
    });
    await kontrol(B, 'Veri durağı: alanlar sayfa sırasıyla (Ad, Soyad, E-posta); ilk ↑ ve son ↓ pasif', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-01-veri-duragi.png'), fullPage: true });
      const s = await veriSatirlari(page);
      expect(s.slice(0, 3)).toEqual(['Ad', 'Soyad', 'E-posta']);
      await expect(satirBul(page, 'Ad').getByRole('button', { name: 'Yukarı taşı' })).toBeDisabled();
      await expect(page.locator('.hizli-alanlar .hizli-alan').last().getByRole('button', { name: 'Aşağı taşı' })).toBeDisabled();
      return `sorulan: ${s.join(', ')}`;
    });
    await kontrol(B, '↓ ile sıra değişir (Ad en sona)', async () => {
      await satirBul(page, 'Ad').getByRole('button', { name: 'Aşağı taşı' }).click();
      await satirBul(page, 'Ad').getByRole('button', { name: 'Aşağı taşı' }).click();
      const s = await veriSatirlari(page);
      expect(s.slice(0, 3)).toEqual(['Soyad', 'E-posta', 'Ad']);
      return s.join(', ');
    });
    await kontrol(B, '“Doldur”: E-posta için tablo adayları (Kişiler › E-posta seçilir), rozet “tablodan”, “Elle yaz” geri döner', async () => {
      const satir = satirBul(page, 'E-posta');
      await satir.getByRole('button', { name: 'Doldur', exact: true }).click();
      const deger = satir.locator('.hizli-tablo-degeri');
      const panel = satir.locator('.doldur-paneli');
      // Tablolar istekle gelir: ya değer doğrudan seçilir (tek anlamlı) ya da aday paneli açılır.
      const sec = async (): Promise<string> => {
        await expect(deger.or(panel.getByRole('button').first())).toBeVisible();
        if (await deger.isVisible()) return '(tek anlamlı: doğrudan seçildi)';
        const m = (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 250);
        await kisilerSatiri(panel).click();
        return m;
      };
      const paneldekiler = await sec();
      await expect(deger).toHaveText(/\$\{.+\.E-posta\}/);
      await expect(satir.getByText('tablodan')).toBeVisible();
      await satir.getByRole('button', { name: 'Elle yaz' }).click();
      await expect(satir.locator('input')).toBeVisible();
      await satir.getByRole('button', { name: 'Doldur', exact: true }).click();
      await sec();
      return `seçilen: ${await deger.innerText()}; panel: ${paneldekiler}`;
    });
    await kontrol(B, '“Doldur”: benzer ad — “Soyad” için aday listesi', async () => {
      const satir = satirBul(page, 'Soyad');
      await satir.getByRole('button', { name: 'Doldur', exact: true }).click();
      const panel = satir.locator('.doldur-paneli');
      const metin = (await panel.isVisible().catch(() => false)) ? await panel.innerText() : `doğrudan seçildi: ${await satir.locator('.hizli-tablo-degeri').innerText().catch(() => '?')}`;
      if (await panel.isVisible().catch(() => false)) await kisilerSatiri(panel).click();
      return metin.replace(/\s+/g, ' ').slice(0, 200);
    });
    await kontrol(B, 'Elle yazma + “Devam et”: sayfada yeni sıra ile doldurulur (Soyad → E-posta → Ad)', async () => {
      await satirBul(page, 'Ad').locator('input').fill('Deneme');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Adım 2: veri gerekli|Şimdi ne yapayım/ })).toBeVisible(UZUN);
      await expect.poll(() => new Set(sayac('/basvuru').doldurma.slice(d0).map((x: Nesne) => x.alan)).size, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
      const sira = sayac('/basvuru').doldurma.slice(d0).map((x: Nesne) => x.alan);
      const ilk3 = [...new Set(sira)].slice(0, 3);
      expect(ilk3).toEqual(['Soyad', 'E-posta', 'Ad']);
      return `sayfadaki doldurma sırası: ${sira.join(' → ')}`;
    });
    await kontrol(B, 'Adım 2 veri durağı: “yeni alan” rozetleri, Pozisyon listesinde yer tutucu yok', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: /Adım 2: veri gerekli/ })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-02-adim2.png'), fullPage: true });
      const s = await veriSatirlari(page);
      const poz = satirBul(page, 'Pozisyon').locator('select');
      const secenekler = await poz.locator('option').allInnerTexts();
      expect(secenekler.some((x) => /Pozisyon seçin/.test(x))).toBe(false);
      return `alanlar: ${s.join(', ')}; Pozisyon seçenekleri: ${secenekler.join(' | ')}`;
    });
    await kontrol(B, 'Pozisyon = Yazılım geliştirici seçilince “Kod deposu adresi” koşullu satır olarak görünür', async () => {
      await satirBul(page, 'Pozisyon').locator('select').selectOption({ label: 'Yazılım geliştirici' });
      await expect(satirBul(page, 'Kod deposu adresi')).toBeVisible({ timeout: 3000 });
      const kosul = await satirBul(page, 'Kod deposu adresi').locator('.hizli-kosul').innerText().catch(() => '(koşul yazısı yok)');
      return kosul;
    });
    await kontrol(B, 'Özgeçmiş (dosya) alanı veri durağında nasıl görünüyor', async () => {
      const satir = satirBul(page, 'Özgeçmiş');
      if (!(await satir.count())) return 'dosya alanı veri durağında YOK';
      return (await satir.innerText()).replace(/\s+/g, ' ').slice(0, 200);
    });
    await kontrol(B, 'Adım 2 doldur → “Devam et”', async () => {
      const yaz = async (e: string, v: string): Promise<void> => { const s = satirBul(page, e); if (await s.count()) await s.locator('input').fill(v); };
      await yaz('Kod deposu adresi', 'https://depo.ornek.test/deneme');
      await yaz('Deneyim', '4');
      await yaz('Beceriler', 'TypeScript');
      await yaz('Tercih edilen bölge', 'Kuzey');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli|Şimdi ne yapayım|hata mı/ })).toBeVisible(UZUN);
      return await soruKarti(page).getByRole('heading').first().innerText();
    });
    // Karar ekranı
    await kontrol(B, '“Şimdi ne yapayım?”: üç seçenek, aday listesi, öneri seçili', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-03-karar.png'), fullPage: true });
      const secenekler = await soruKarti(page).locator('.hizli-karar-secenegi').allInnerTexts();
      expect(secenekler.length).toBe(3);
      const adaylar = await page.locator('#hizli-aday option').allInnerTexts();
      const secili = await page.locator('#hizli-aday').evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
      return `adaylar: ${adaylar.join(' | ')}; seçili: ${secili}; seçenekler: ${secenekler.map((x) => x.replace(/\s+/g, ' ').slice(0, 40)).join(' / ')}`;
    });
    await kontrol(B, '“Veriyi düzenle” veri durağına döner, girilen değerler korunur', async () => {
      await soruKarti(page).getByRole('button', { name: 'Veriyi düzenle' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      const v = await satirBul(page, 'Deneyim').locator('input').inputValue().catch(() => '(yok)');
      expect(v).toBe('4');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Şimdi ne yapayım|veri gerekli/ })).toBeVisible(UZUN);
      return `Deneyim: ${v}`;
    });
    await kontrol(B, '“Başka bir düğmeye bas…” → “Tarayıcıda düğmeyi seçin” + Vazgeç', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Başka bir düğmeye bas' }).click();
      await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Tarayıcıda düğmeyi seçin' })).toBeVisible(UZUN);
      await soruKarti(page).getByRole('button', { name: 'Vazgeç' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      return 'sayfada seçim başsız tarayıcıda tıklanamaz (yalnız açılış / vazgeç denendi)';
    });
    // İş başvurusu beceri etiketi (yaz + Enter) yüzünden ilerleyemez (bkz. ekran koşusu): arayüzden iptal edilir, akışın geri kalanı
    // üyelik ekranında (önce onay → form → yönlendirme) denenir.
    await kontrol(B, '“Hızlı testi iptal et” onay penceresi → iptal; “Yeni hızlı test başlat” bağlantısı', async () => {
      await soruKarti(page).getByRole('button', { name: 'Hızlı testi iptal et' }).click();
      const d = page.locator('dialog[open]');
      await expect(d).toBeVisible();
      await d.getByRole('button', { name: 'İptal et' }).click();
      await expect(page.getByRole('link', { name: 'Yeni hızlı test başlat' })).toBeVisible(UZUN);
    });
    await isBitsin();
    const U = 'Evet / üyelik';
    await kontrol(U, 'Üyelik: onay kutusu durağı → Evet + tek aday “Devam” kendiliğinden basılır → 6 yeni alan', async () => {
      await baslatArayuz(page, 'Poligon arayüz üyelik', '/uyelik/', 'Evet');
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      await satirBul(page, 'Koşulları okudum').locator('input[type=checkbox]').check();
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Adım 2: veri gerekli/ })).toBeVisible(UZUN);
      return (await veriSatirlari(page)).join(', ');
    });
    const du = sayac('/uyelik').doldurma.length;
    await kontrol(U, '↑ ile “Doğum yılı” en üste: sayfada önce doğum yılı doldurulur', async () => {
      for (let i = 0; i < 6; i++) {
        const b = satirBul(page, 'Doğum yılı').getByRole('button', { name: 'Yukarı taşı' });
        if (await b.isDisabled()) break;
        await b.click();
      }
      expect((await veriSatirlari(page))[0]).toBe('Doğum yılı');
      const yaz = async (e: string, v: string): Promise<void> => { await satirBul(page, e).locator('input').fill(v); };
      await yaz('Doğum yılı', '1995');
      await yaz('Kullanıcı adı', 'arayuz_uye_7');
      await yaz('E-posta', 'uye@ornek.test');
      await satirBul(page, 'Parola').first().locator('input').fill('Gizli-Parola-1');
      await yaz('Parola (tekrar)', 'Gizli-Parola-1');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      await expect.poll(() => sayac('/uyelik').doldurma.length - du, { timeout: 10_000 }).toBeGreaterThanOrEqual(5);
      const sira = [...new Set(sayac('/uyelik').doldurma.slice(du).map((x: Nesne) => x.alan))];
      expect(sira[0]).toBe('Doğum yılı');
      return `sayfadaki sıra: ${sira.join(' → ')}`;
    });
    await kontrol(U, '“Devam et: Hesabı oluştur” → yönlendirme sonrası karar ekranı', async () => {
      const adaylar = await page.locator('#hizli-aday option').allInnerTexts();
      await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Devam et:' }).click();
      await page.locator('#hizli-aday').selectOption({ label: adaylar.find((x) => /Hesabı oluştur/.test(x)) ?? '' });
      await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      await expect(soruKarti(page).getByText(/Adres değişti/)).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-03b-fark.png'), fullPage: true });
      return `adaylar: ${adaylar.join(' | ')}`;
    });
    await kontrol(U, 'Zincir kartı (sağ sütun) gerçeği yansıtır', async () => {
      const z = await page.locator('.hizli-zincir li').allInnerTexts();
      expect(z.some((x) => /Hesabı oluştur/.test(x))).toBe(true);
      return z.join(' / ');
    });
    await kontrol(U, '“Burada bitir” → bitiş koşulu: başarı metni Bitti önerili', async () => {
      await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Burada bitir' }).click();
      await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-04-bitis.png'), fullPage: true });
      const satir = page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' });
      await expect(satir.getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true');
      return (await page.locator('.hizli-bitis-satiri .hizli-cip').allInnerTexts()).join(' | ');
    });
    await kontrol(U, 'Seçili etikete yeniden tıklamak etiketi kaldırır; Bitti yokken “Devam et” pasif + gerekçe; adres yazılınca etkin', async () => {
      const satir = page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' });
      await satir.getByRole('radio', { name: 'Bitti' }).click();
      await expect(satir.getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'false');
      for (const r of await page.locator('.hizli-bitis-satiri').all()) {
        if ((await r.getByRole('radio', { name: 'Bitti' }).getAttribute('aria-checked')) === 'true') await r.getByRole('radio', { name: 'Etiketsiz' }).click();
      }
      await expect(soruKarti(page).getByRole('button', { name: 'Devam et', exact: true })).toBeDisabled();
      await expect(page.locator('#hizli-bitis-eksik')).toContainText('Bitti');
      await page.getByLabel(/Adres şu olursa bitti/).fill('/uyelik/hosgeldin');
      await expect(soruKarti(page).getByRole('button', { name: 'Devam et', exact: true })).toBeEnabled();
      await page.getByLabel(/Adres şu olursa bitti/).fill('');
      await satir.getByRole('radio', { name: 'Bitti' }).click();
      await expect(soruKarti(page).getByRole('button', { name: 'Devam et', exact: true })).toBeEnabled();
    });
    await kontrol(U, '“Sayfayı yeniden tara” etiketleri korur', async () => {
      await soruKarti(page).getByRole('button', { name: 'Sayfayı yeniden tara' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible(UZUN);
      await expect(page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' }).getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    });
    await kontrol(U, 'Bitiş → Kaydet; “Bitiş koşulunu düzenle” geri döner, etiket korunur', async () => {
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible(UZUN);
      await soruKarti(page).getByRole('button', { name: 'Bitiş koşulunu düzenle' }).click();
      await expect(page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' }).getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true', UZUN);
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible(UZUN);
    });
    await kontrol(U, 'Kaydet ekranı: ad, toplu koşuya dahil (işaretli), tablo seçeneği (işaretli), H3 “Evet, doğrula / Hayır, kaydet”', async () => {
      await page.screenshot({ path: join(RAPOR, 'ui-05-kaydet.png'), fullPage: true });
      await expect(page.getByLabel('Senaryonun adı')).toHaveValue(/Poligon arayüz üyelik/);
      await expect(page.getByLabel('Toplu koşuya dahil')).toBeChecked();
      await expect(page.getByLabel(/test verisi tablosu olarak kaydet/)).toBeChecked();
      await expect(soruKarti(page).getByRole('button', { name: 'Evet, doğrula' })).toBeVisible();
      await expect(soruKarti(page).getByRole('button', { name: 'Hayır, kaydet' })).toBeVisible();
      return `zincir: ${(await page.locator('.hizli-zincir.buyuk li').allInnerTexts()).join(' / ')}`;
    });
    const sd = sayac('/uyelik').gonderim;
    await kontrol(U, '“Evet, doğrula”: adım listesi ilerler, sonuç başarılı', async () => {
      await soruKarti(page).getByRole('button', { name: 'Evet, doğrula' }).click();
      await expect(page.getByText(/Doğrulama koşusu (başarılı|başarısız)/)).toBeVisible({ timeout: 240_000 });
      await page.screenshot({ path: join(RAPOR, 'ui-06-dogrulama.png'), fullPage: true });
      await expect(page.getByText(/Doğrulama koşusu başarılı/)).toBeVisible();
      return `doğrulamada gönderim: ${sayac('/uyelik').gonderim - sd}`;
    });
    let ekranId = '';
    await kontrol(U, '“Kaydet — özeti göster” özeti YENİ SEKMEDE açar; “Onayla ve kaydet” → Test kaydedildi; “Hızlı teste dön” bağlantısı', async () => {
      await page.getByLabel('Senaryonun adı').fill('Poligon arayüz senaryosu');
      const yeniSekme = baglam.waitForEvent('page', { timeout: 30_000 });
      await soruKarti(page).getByRole('button', { name: 'Kaydet — özeti göster' }).click();
      const ozet = await yeniSekme;
      await ozet.waitForLoadState();
      await expect(ozet).toHaveURL(/#\/hizli-test\/ozet\//);
      await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible(UZUN);
      await ozet.screenshot({ path: join(RAPOR, 'ui-07-ozet-sekmesi.png'), fullPage: true });
      await ozet.getByRole('button', { name: /Onayla ve kaydet/ }).click();
      await expect(ozet.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible(UZUN);
      await expect(ozet.getByRole('link', { name: 'Hızlı teste dön' })).toBeVisible();
      const akis = await ozet.getByRole('link', { name: 'Akış diyagramında aç' }).getAttribute('href');
      ekranId = decodeURIComponent(/#\/ekranlar\/e\/([^/]+)\/akis/.exec(akis ?? '')?.[1] ?? '');
      await ozet.close();
      return `ekran ${ekranId}`;
    });
    await isBitsin();
    await kontrol(U, 'Kaydedilen senaryonun normal koşusu ↑ ile verilen sırayı korur (önce Doğum yılı)', async () => {
      const o = await oturum(oturumKimligi(page));
      const senaryoId = String(o.soru?.senaryoId ?? '');
      expect(senaryoId).not.toBe('');
      const dn = sayac('/uyelik').doldurma.length;
      const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId, ortamId });
      const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
      const sira = [...new Set(sayac('/uyelik').doldurma.slice(dn).map((x: Nesne) => x.alan))];
      expect(sonuc.durum, String(sonuc.hataMesaji ?? '')).toBe('basarili');
      expect(sira.filter((x) => x !== 'Koşulları okudum ve kabul ediyorum')[0]).toBe('Doğum yılı');
      return `normal koşu sırası: ${sira.join(' → ')}`;
    });
    await kontrol(U, 'Düzenleme kipi: aynı senaryo adıyla kaydet → “Üzerine yaz / Yeni adla kaydet / Vazgeç” sorusu', async () => {
      expect(ekranId).not.toBe('');
      await baslatArayuz(page, '', '/uyelik/', 'Evet', ekranId);
      const id = oturumKimligi(page);
      // Zincir API ile hızla yürütülür (arayüzün kendisi yukarıda denendi).
      let o = await bekle(id);
      for (let i = 0; i < 20 && !['bitis', 'kaydet'].includes(o.durum); i++) {
        if (o.durum === 'veri') {
          const dg: Nesne = {};
          for (const a of o.soru.alanlar as Nesne[]) {
            const pd = planDegeri(PLANLAR.find((x) => x.kok === '/uyelik') as EkranPlani, String(a.etiket), false);
            if (pd?.deger !== undefined && !a.hazir) dg[a.anahtar] = { deger: secenekDegeri(a, pd.deger), kaynak: 'elle' };
            else if (pd?.tablo) dg[a.anahtar] = { deger: { Ad: 'Deneme', Soyad: 'Kişi', 'E-posta': 'deneme@ornek.test' }[pd.tablo] ?? 'x', kaynak: 'elle' };
          }
          await api('/platform/hizli-test/veri', { id, degerler: dg });
        } else if (o.durum === 'karar') {
          const ad = (o.soru.adaylar as Nesne[]).find((x) => /Hesabı oluştur/.test(x.metin)) ?? (o.soru.adaylar as Nesne[]).find((x) => /^İleri$/.test(x.metin));
          const gonderildi = (o.adimlar as Nesne[]).some((x) => /Hesabı oluştur/.test(x.bas?.metin ?? ''));
          if (gonderildi || !ad) await api('/platform/hizli-test/karar', { id, karar: 'bitir' });
          else await api('/platform/hizli-test/karar', { id, karar: 'bas', secici: ad.secici });
        } else if (o.durum === 'hataSorusu') await api('/platform/hizli-test/hata-cevabi', { id, cevap: 'onemsiz' });
        o = await bekle(id);
      }
      expect(o.durum).toBe('bitis');
      const et = { ...(o.soru.etiketler as Nesne) };
      for (const m of Object.keys(et)) if (/Hesabınız hazır/.test(m)) et[m] = 'bitti';
      await basarili('/platform/hizli-test/bitis', { id, etiketler: et });
      await expect(soruKarti(page).getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible(UZUN);
      await page.getByLabel('Senaryonun adı').fill('Poligon arayüz senaryosu');
      await soruKarti(page).getByRole('button', { name: 'Hayır, kaydet' }).click();
      let ozet = await baglam.waitForEvent('page', { timeout: 30_000 });
      await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible(UZUN);
      const uyari = await ozet.locator('.not-kutusu.uyari').allInnerTexts();
      const onay = ozet.getByRole('button', { name: /Onayla ve kaydet|Farkları onayla/ });
      let pasifNedeni = '';
      if (await onay.isDisabled()) {
        // Düzenlemede mevcut tablolarla birleştirme kararı bekleniyor olabilir: neden kaydedilir, tablo yazımı kapatılıp yeniden denenir.
        pasifNedeni = (await ozet.locator('.hizli-ozet-karti [role=status]').last().innerText().catch(() => '')).slice(0, 300);
        await ozet.screenshot({ path: join(RAPOR, 'ui-08a-ozet-onay-pasif.png'), fullPage: true });
        await ozet.close();
        await page.getByLabel(/test verisi tablosu olarak kaydet/).uncheck();
        arayuzSonuclari.push({ bolum: U, ad: 'Düzenleme kipi: özet sekmesinde “Onayla” pasif', sonuc: false, not: pasifNedeni || '(gerekçe yazısı yok)' });
        const yeni = baglam.waitForEvent('page', { timeout: 30_000 });
        yeni.catch(() => undefined);
        await soruKarti(page).getByRole('button', { name: 'Hayır, kaydet' }).click();
        ozet = await yeni;
        await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible(UZUN);
      }
      await ozet.getByRole('button', { name: /Onayla ve kaydet|Farkları onayla/ }).click();
      const diyalog = ozet.locator('dialog[open]');
      await expect(diyalog).toBeVisible({ timeout: 30_000 });
      await ozet.screenshot({ path: join(RAPOR, 'ui-08-senaryo-var.png') });
      await expect(diyalog.getByRole('button', { name: 'Üzerine yaz' })).toBeVisible();
      await expect(diyalog.getByRole('button', { name: 'Vazgeç' })).toBeVisible();
      await diyalog.getByRole('button', { name: 'Yeni adla kaydet' }).click();
      await expect(ozet.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible(UZUN);
      const metin = await ozet.locator('.hizli-soru p').first().innerText();
      await ozet.close();
      return `${pasifNedeni ? `İLK DENEMEDE “Onayla” PASİF (neden: ${pasifNedeni}); tablo yazımı kapatılınca: ` : ''}${uyari.join(' / ').slice(0, 200)} → ${metin}`;
    });
    await isBitsin();
    await kontrol(U, 'Arayüzde sayfa hatası (pageerror) yok', async () => { expect(sayfaHatalari).toEqual([]); });
  } finally { await tarayici.close(); }
});

test('hızlı test arayüzü: izin kipleri (Bana sor / Hayır), iptal, 390 px yerleşim', async () => {
  test.skip(SECILI.length > 0 && !SECILI.includes('arayuz'), 'seçili değil');
  test.setTimeout(600_000);
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    baglam.setDefaultTimeout(30_000);
    const S = 'Bana sor / havale';
    const s0 = sayac('/havale').olaylar.aliciSorgu ?? 0;
    await kontrol(S, 'Bana sor: ilk düğmeden önce “… basayım mı?” sorusu; “Hayır, basma” → basılmaz, karara döner', async () => {
      await baslatArayuz(page, 'Poligon havale sor', '/havale/', 'Bana sor');
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      await satirBul(page, 'Alıcı IBAN').locator('input').fill('TR120006200000000123456789');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Şimdi ne yapayım|basayım mı/ })).toBeVisible(UZUN);
      if (await soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' }).isVisible()) {
        await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Devam et:' }).click();
        await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      }
      await expect(soruKarti(page).getByRole('heading', { name: /basayım mı/ })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-09-bana-sor.png') });
      await soruKarti(page).getByRole('button', { name: 'Hayır, basma' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      expect((sayac('/havale').olaylar.aliciSorgu ?? 0) - s0).toBe(0);
    });
    await kontrol(S, '390 px: yatay kaydırma yok, karar kartı sığar', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(RAPOR, 'ui-10-390px-karar.png'), fullPage: true });
      const tasma = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(tasma).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1440, height: 1000 });
      return `taşma ${tasma}px`;
    });
    await kontrol(S, '“Hızlı testi iptal et” onay ister; iptal sonrası “Yeni hızlı test başlat”', async () => {
      await soruKarti(page).getByRole('button', { name: 'Hızlı testi iptal et' }).click();
      const d = page.locator('dialog[open]');
      await expect(d).toBeVisible();
      await d.getByRole('button', { name: 'İptal et' }).click();
      await expect(page.getByRole('link', { name: 'Yeni hızlı test başlat' })).toBeVisible(UZUN);
    });
    await isBitsin();
    const H = 'Hayır / etkinlik';
    const e0 = sayac('/etkinlik').gonderim;
    await kontrol(H, 'Hayır: veri durağı → “Düğmeyi ve mesajı seçin”; düğme adayları ve mesaj adayları', async () => {
      await baslatArayuz(page, 'Poligon etkinlik hayır', '/etkinlik/', 'Hayır');
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli|Düğmeyi ve mesajı seçin/ })).toBeVisible(UZUN);
      if (await soruKarti(page).getByRole('heading', { name: /veri gerekli/ }).isVisible()) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(RAPOR, 'ui-11-390px-veri.png'), fullPage: true });
        const tasma = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await page.setViewportSize({ width: 1440, height: 1000 });
        arayuzSonuclari.push({ bolum: H, ad: '390 px veri durağı yatay taşma', sonuc: tasma <= 0, not: `taşma ${tasma}px` });
        for (const s of await page.locator('.hizli-alanlar .hizli-alan').all()) {
          const g = s.locator('input[type=text], input:not([type])').first();
          if (await g.count()) await g.fill('Deneme');
        }
        await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      }
      await expect(soruKarti(page).getByRole('heading', { name: 'Düğmeyi ve mesajı seçin' })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-12-hayir-secim.png'), fullPage: true });
      const dugmeler = await page.locator('#hizli-hayir-dugme option').allInnerTexts();
      const mesajlar = await page.locator('.hizli-mesajlar label').allInnerTexts();
      return `düğme adayları: ${dugmeler.join(' | ') || 'YOK'}; mesaj adayları: ${mesajlar.join(' | ') || 'YOK'}`;
    });
    await kontrol(H, 'Hayır: hiçbir gönderim yapılmadı (sunucu sayacı)', async () => {
      expect(sayac('/etkinlik').gonderim - e0).toBe(0);
    });
    await api('/platform/hizli-test/iptal', { id: oturumKimligi(page) }).catch(() => undefined);
    await isBitsin();
  } finally { await tarayici.close(); }
});
