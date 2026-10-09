// İÇ İÇE SEÇİM KEŞFİ, YERİNDE KEŞİF, ANINDA UYGULAMA VE KEŞİF BASIŞI (hızlı test). Gerçek ekranda görülen sorunun koruması (genel; siteye
// özgü sabit yok): "Farklı kişi" Evet olunca açılan ikinci kişi bölümünün kendi kişi tipi seçimi açılışta gizli olduğu için hiç denenmiyordu;
// bölümün alanlarının adı / en çok karakteri bu seçime göre değişse de veri durağında grubu oluşmuyor, Tüzel'de "sorulacaklar çıkmadı".
//  - Keşif: bir değer yeni seçim gösteriyorsa o değerdeyken alt seçim de aynı kurallarla denenir (görünen / kaybolan, etiketler, kurallar);
//    alt seçimin keşfi üst seçim + değerle (ust) tutulur; sonunda tüm seçimler ilk değerlerinde.
//  - Veri durağı: iç içe seçim üst seçimin değer grubunun İÇİNDE kendi "Önce bunu seçin" satırıyla; adı değişen alanlar seçime göre anında.
//    Seçim değişince getir düğmesi beklenmeden sayfaya uygulanır (kısa gecikmeyle; yalnız son durum), yerinde keşif yapılır, form anında
//    güncellenir (yazılan değerler korunur, odak kaybolmaz). 1440 / 390 px'te taşma yok.
//  - Yerinde keşif: keşifte kaçırılan / düğmeye basınca sayfanın en altında beliren seçimler de ilk keşfin kurallarıyla denenir.
//  - Kayıt: öneri başlıklarında alt dalın adları; Tüzel alt dalında kimlik kutusu "Vergi no (2)" sütunuyla; normal koşu alt dalı doğru doldurur.
//  - Keşif basışı (basma iznine bağlı): Bana sor'da sorulur; Evet'te sayfa içinde açtığı davranışından anlaşılan düğmeye sorulmadan basılır,
//    form gönderen düğmede sorulur; Hayır'da hiç basılmaz. Keşif basışı kaydedilen senaryoya girmez.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (veri-duragi-fikstur.ts); geçici veritabanı; veri/ klasörüne dokunulmaz. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { envanterOku, secimleriKesfet } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

/** Ekran görüntülerinin kopyalanacağı klasör (isteğe bağlı; GORUNTU_KLASORU). */
function goruntuKopyala(kaynak: string, ad: string): void {
  if (!process.env.GORUNTU_KLASORU) return;
  mkdirSync(process.env.GORUNTU_KLASORU, { recursive: true });
  copyFileSync(kaynak, join(process.env.GORUNTU_KLASORU, ad));
}

test.describe('keşif (127.0.0.1)', () => {
  test('iç içe: üst değerde beliren alt seçim o değerdeyken denenir (gizlenen, adı ve en çok karakteri değişen alanlar); ust ile tutulur; sonunda ilk değerler', async () => {
    const u = new VeriDuragiUygulamasi();
    const s = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const t = await korumaliTarayici();
    try {
      const page = await (await t.newContext()).newPage();
      const git = async (): Promise<void> => { await page.goto(`${s.adres}/ic-ice/`); };
      await git();
      const temel = await envanterOku(page);
      expect(temel.alanlar.map((a) => a.etiket)).toEqual(['Ad', 'Farklı kişi']);
      const sakin = async (p: Page, ms: number): Promise<void> => { await p.waitForTimeout(Math.min(ms, 200)); };
      // Derinlik 1 (eski davranış): alt seçim hiç denenmez.
      const tek = await secimleriKesfet(page, temel, [], git, sakin, 8);
      expect(tek.map((k) => k.ust ?? null)).toEqual([null]);
      const kesifler = await secimleriKesfet(page, temel, [], git, sakin, 8, { derinlik: 3 });
      const farkli = kesifler.find((k) => !k.ust);
      const evet = farkli?.degerler.find((d) => d.deger === 'E');
      expect(evet?.gorunenler.map((a) => a.etiket)).toEqual(['Kişi tipi (2)', 'Cep telefonu (2)', 'Doğum tarihi (2)', 'Kimlik no (2)']);
      const anahtar = (etiket: string): string => String(evet?.gorunenler.find((a) => a.etiket === etiket)?.anahtar);
      const tip2 = kesifler.find((k) => k.secim === anahtar('Kişi tipi (2)'));
      expect(tip2, JSON.stringify(kesifler)).toMatchObject({ ust: { secim: farkli?.secim, deger: 'E' }, ilkDeger: 'O', geriAlindi: true });
      // Alt seçim üst keşiften SONRA (tüketiciler üstün alanlarını önce görür).
      expect(kesifler.indexOf(tip2 as never)).toBeGreaterThan(kesifler.indexOf(farkli as never));
      const tuzel = tip2?.degerler.find((d) => d.deger === 'T');
      expect(tuzel?.gorunenler).toEqual([]);
      expect(tuzel?.kaybolanlar).toEqual([anahtar('Doğum tarihi (2)')]);
      expect(tuzel?.etiketler).toEqual({ [anahtar('Cep telefonu (2)')]: 'İş telefonu (2)', [anahtar('Kimlik no (2)')]: 'Vergi no (2)' });
      expect(tuzel?.kurallar).toEqual({ [anahtar('Kimlik no (2)')]: { enCok: 10, desen: null } });
      // Sonunda tüm seçimler ilk değerlerinde: ikinci bölüm gizli, alt seçim Özel.
      await expect(page.locator('#ikinci')).toBeHidden();
      await expect(page.locator('#tip2O')).toBeChecked();
      await expect(page.locator('#farkliH')).toBeChecked();
      expect(u.istekler.filter((x) => x.startsWith('POST'))).toEqual([]);
    } finally { await t.close(); await s.kapat(); }
  });
});

test.describe('Nöbetçi taraması, kayıt ve normal koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-IcIce-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  const u = new VeriDuragiUygulamasi();
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
    return y;
  }
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      if (durumlar.includes(o.durum)) return o;
      // Keşif toplu sorusu beklenmiyorsa (testin konusu değil): hiçbirine basılmaz.
      if (o.durum === 'kesifOnay') { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  /** Önceki hızlı testin tarayıcısı kapanana kadar (tek tarama işi). */
  async function isBitsin(): Promise<void> {
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
  }
  const alanBul = (o: Nesne, etiket: string): Nesne => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return a;
  };
  const tasmaYok = async (page: Page): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };
  const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
  /** Bitiş ("Kayıt alındı" = bitti) → kaydet aşaması. */
  async function bitir(id: string): Promise<void> {
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    const o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    expect(bitti, JSON.stringify(o.soru.etiketler)).toBeTruthy();
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
  }
  async function kos(senaryoId: string): Promise<void> {
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
  }
  async function arayuz(id: string): Promise<{ page: Page; hatalar: string[]; kapat: () => Promise<void> }> {
    const tarayici = await korumaliTarayici();
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/hizli-test/o/${id}`);
    return { page, hatalar, kapat: () => tarayici.close() };
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ic-ice-secim-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'İç İçe Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('iç içe kontrol üst seçimin grubunda; seçimler getir beklenmeden anında uygulanır (yazılan değer ve odak korunur, ardışık değişiklikte son durum); kayıt sütunu ve öneri başlığı alt dalın adıyla; normal koşu Evet → Tüzel (2) dalını doldurur', async () => {
    test.setTimeout(600_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/ic-ice/', ekranAdi: 'İç içe', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    // Keşif: iç içe seçim kontrol; bölümün alanları onun dallarında (gizlenen / adı ve en çok karakteri değişen).
    const farkli = alanBul(o, 'Farklı kişi');
    const tip2 = alanBul(o, 'Kişi tipi (2)');
    expect(farkli).toMatchObject({ tur: 'radio', kontrol: true, sayfadaki: 'H' });
    expect(tip2).toMatchObject({ kontrol: true, kosul: { secim: farkli.anahtar, degerler: ['E'] } });
    expect(alanBul(o, 'Kimlik no (2)')).toMatchObject({ kosul: { secim: farkli.anahtar }, etiketKosulu: { secim: tip2.anahtar, etiketler: { O: 'Kimlik no (2)', T: 'Vergi no (2)' }, enCoklar: { O: 11, T: 10 } } });
    expect(alanBul(o, 'Cep telefonu (2)').etiketKosulu).toMatchObject({ secim: tip2.anahtar, etiketler: { O: 'Cep telefonu (2)', T: 'İş telefonu (2)' } });
    expect(alanBul(o, 'Doğum tarihi (2)').kosul).toMatchObject({ secim: tip2.anahtar, degerler: ['O'] });
    expect(u.icIceKayitlar).toEqual([]);

    const { page, hatalar, kapat } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      const onsecim = soru.locator('.hizli-onsecim');
      const farkliKutusu = onsecim.locator(`.hizli-onsecim-alani[data-anahtar="${farkli.anahtar}"]`);
      await expect(farkliKutusu.getByRole('radio', { name: 'Hayır' })).toBeChecked();
      // Hayır: ikinci bölüm (iç içe kontrol dahil) sorulmaz.
      await expect(soru.locator(`[data-anahtar="${tip2.anahtar}"]`)).toHaveCount(0);
      // Evet → anında: Evet grubunda iç içe "Önce bunu seçin" satırı ve onun Özel grubu; getir düğmesi beklenmez.
      await farkliKutusu.getByRole('radio', { name: 'Evet' }).check();
      const icKutu = farkliKutusu.locator(`.hizli-onsecim-ic[data-anahtar="${tip2.anahtar}"]`);
      await expect(icKutu).toBeVisible();
      await expect(icKutu.locator('.hizli-onsecim-ic-baslik')).toHaveText('Önce bunu seçin');
      await expect(icKutu.getByRole('radio', { name: 'Özel' })).toBeChecked();
      const icGrup = icKutu.locator('.hizli-kosul-grubu');
      await expect(icGrup.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Kişi tipi (2): Özel” seçimine göre:');
      await expect(icGrup.getByLabel('Doğum tarihi (2)', { exact: true })).toBeVisible();
      await expect(icGrup.getByLabel('Kimlik no (2)', { exact: true })).toBeVisible();
      await expect(icGrup.getByLabel('Cep telefonu (2)', { exact: true })).toBeVisible();
      // Uygulama sürerken yazılan değer ve odak korunur.
      const ad = soru.getByLabel('Ad', { exact: true });
      await ad.click();
      await ad.pressSequentially('Deneme Kişi');
      await expect(farkliKutusu.locator('.hizli-onsecim-durum').first()).toContainText('Sayfada “Evet” seçili', { timeout: 60_000 });
      await expect(soru.getByLabel('Ad', { exact: true })).toHaveValue('Deneme Kişi');
      await expect(soru.getByLabel('Ad', { exact: true })).toBeFocused();
      await expect(icKutu.locator('.hizli-onsecim-durum').first()).toContainText('Sayfada “Özel” seçili');
      // Tüzel (2) → anında: doğum tarihi sorulmaz, adı değişen alanlar yeni adlarıyla; sayfaya uygulanır, özet notu.
      await icKutu.getByRole('radio', { name: 'Tüzel' }).check();
      await expect(icGrup.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Kişi tipi (2): Tüzel” seçimine göre:');
      await expect(icGrup.locator('.hizli-kosul-grubu-notu')).toHaveText('Bu seçimde “Doğum tarihi (2)” sorulmaz.');
      await expect(icGrup.getByLabel('Vergi no (2)', { exact: true })).toBeVisible();
      await expect(icGrup.getByLabel('İş telefonu (2)', { exact: true })).toBeVisible();
      await expect(soru.getByLabel('Kimlik no (2)', { exact: true })).toHaveCount(0);
      await expect(icGrup.locator('.hizli-alan', { has: page.getByLabel('Vergi no (2)', { exact: true }) }).locator('.hizli-uzunluk')).toHaveText('En çok 10 karakter.');
      await expect(icKutu.locator('.hizli-onsecim-durum').first()).toContainText('Sayfada “Tüzel” seçili', { timeout: 60_000 });
      await expect(soru.locator('.not-kutusu')).toContainText('“Kişi tipi (2)” = “Tüzel” sayfaya uygulandı');
      // Hızlı ardışık değişiklik: yalnız son durum (Tüzel) sayfada.
      await icKutu.getByRole('radio', { name: 'Özel' }).check();
      await icKutu.getByRole('radio', { name: 'Tüzel' }).check();
      await expect(icKutu.locator('.hizli-onsecim-durum').first()).toContainText('Sayfada “Tüzel” seçili', { timeout: 60_000 });
      await expect.poll(async () => alanBul(await bekle(id, ['veri']), 'Kişi tipi (2)').sayfadaki, { timeout: 30_000 }).toBe('T');
      await tasmaYok(page);
      const goruntu = test.info().outputPath('ic-ice-secim-1440.png');
      await page.screenshot({ path: goruntu, fullPage: true });
      goruntuKopyala(goruntu, 'ic-ice-secim-1440.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(icGrup.getByLabel('Vergi no (2)', { exact: true })).toBeVisible();
      await tasmaYok(page);
      const goruntu390 = test.info().outputPath('ic-ice-secim-390.png');
      await page.screenshot({ path: goruntu390, fullPage: true });
      goruntuKopyala(goruntu390, 'ic-ice-secim-390.png');
      await page.setViewportSize({ width: 1440, height: 900 });
      await icGrup.getByLabel('Vergi no (2)', { exact: true }).fill('1234567890');
      await icGrup.getByLabel('İş telefonu (2)', { exact: true }).fill('2125550000');
      expect(u.icIceKayitlar).toEqual([]);
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 120_000 });
      expect(hatalar).toEqual([]);
    } finally { await kapat(); }

    o = await bekle(id, ['karar']);
    if (!u.icIceKayitlar.length) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    const beklenen = { ad: 'Deneme Kişi', farkli: 'E', tip2: 'T', telefon2: '2125550000', kimlik2: '1234567890' };
    expect(u.icIceKayitlar.at(-1)).toEqual(beklenen);
    await bitir(id);
    const baslik = 'İç içe — Tüzel';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    const metin = JSON.stringify(oz.onizleme);
    const bag = (alanId: string): Nesne | undefined => (oz.onizleme.baglantilar as Nesne[]).find((b) => b.alanId === alanId);
    // Tablo: Tüzel (2) dalında kimlik kutusu vergi no sütunuyla (#169 kuralı alt dalda da; sütun adı kavramın adı: "(2)" eki atılır).
    expect(bag('kimlik2'), metin).toMatchObject({ alanEtiketi: 'Vergi no (2)', sutun: 'Vergi no' });
    expect(metin).not.toContain('"Kimlik no"');
    expect(bag('telefon2'), metin).toMatchObject({ alanEtiketi: 'İş telefonu (2)' });
    expect(metin).not.toContain('"Kimlik no (2)"');
    // Öneri başlıkları: alt dalın adlarıyla (Özel (2) dalında Kimlik no (2), Cep telefonu (2)).
    const basliklar = (oz.senaryolar as Nesne[]).map((x) => String(x.baslik));
    const ozelDal = basliklar.find((b) => b.includes('Kişi tipi (2): Özel'));
    expect(ozelDal, JSON.stringify(basliklar)).toContain('Kimlik no (2)');
    expect(ozelDal).toContain('Farklı kişi: Evet');
    expect(basliklar.some((b) => b.includes('Farklı kişi: Hayır')), JSON.stringify(basliklar)).toBe(true);
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, senaryoIndeksleri: [] });
    // Normal koşu: Evet → Tüzel (2) dalı doğru alanlar ve değerlerle.
    const once = u.icIceKayitlar.length;
    await kos(String(k.senaryoId));
    expect(u.icIceKayitlar.slice(once)).toEqual([beklenen]);
  });

  test('yerinde keşif: ilk keşfin kaçırdığı (gecikmeli açılan) iç içe seçim, üst seçim anında uygulanınca denenir; grubu ve adı değişen alanları hemen oluşur', async () => {
    test.setTimeout(400_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/ic-ice/?gec=1', ekranAdi: 'İç içe gecikmeli', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    // İlk keşif bölümü görmedi (sorgu bekleme süresinden uzun): alt seçim bilinmiyor.
    expect((o.soru.alanlar as Nesne[]).map((a) => a.etiket)).toEqual(['Ad', 'Farklı kişi']);
    const farkli = alanBul(o, 'Farklı kişi');
    const { page, hatalar, kapat } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      // Keşif bu seçimi kontrol bilmiyor: ana listede liste olarak sorulur; seçilince anında uygulanır.
      await soru.getByLabel('Farklı kişi', { exact: true }).selectOption('E');
      await expect(soru.locator('.hizli-oto-durum').filter({ hasText: 'Sayfaya uygulanıyor' }).first()).toBeVisible();
      await expect.poll(async () => {
        o = await bekle(id, ['veri'], 120);
        return (o.soru.alanlar as Nesne[]).some((a) => a.etiket === 'Kişi tipi (2)');
      }, { timeout: 120_000 }).toBe(true);
      const tip2 = alanBul(o, 'Kişi tipi (2)');
      expect(tip2).toMatchObject({ kontrol: true, kosul: { secim: farkli.anahtar, degerler: ['E'] } });
      expect(alanBul(o, 'Kimlik no (2)').etiketKosulu).toMatchObject({ secim: tip2.anahtar, etiketler: { O: 'Kimlik no (2)', T: 'Vergi no (2)' } });
      expect(alanBul(o, 'Doğum tarihi (2)').kosul).toMatchObject({ secim: tip2.anahtar, degerler: ['O'] });
      expect(JSON.stringify(o.gunluk)).toContain('Yerinde keşif: “Kişi tipi (2)”');
      // Arayüz: iç içe kontrol satırı ve grubu hemen; Tüzel seçilince adlar anında değişir.
      const icKutu = soru.locator(`.hizli-onsecim-ic[data-anahtar="${tip2.anahtar}"]`);
      await expect(icKutu).toBeVisible({ timeout: 30_000 });
      await icKutu.getByRole('radio', { name: 'Tüzel' }).check();
      // (Yerinde keşifle gelen alanlar "yeni alan" rozetlidir.)
      const icGrup = icKutu.locator('.hizli-kosul-grubu');
      await expect(icGrup.getByLabel(/^Vergi no \(2\)/)).toBeVisible();
      await expect(icGrup.getByLabel(/^Doğum tarihi \(2\)/)).toHaveCount(0);
      await expect(icKutu.locator('.hizli-onsecim-durum').first()).toContainText('Sayfada “Tüzel” seçili', { timeout: 60_000 });
      // Yanıttan sonra yeniden çizimde de Tüzel grubu (doğum tarihi yok).
      await expect(icGrup.getByLabel(/^Vergi no \(2\)/)).toBeVisible();
      await expect(icGrup.getByLabel(/^Doğum tarihi \(2\)/)).toHaveCount(0);
      await tasmaYok(page);
      expect(hatalar).toEqual([]);
    } finally { await kapat(); await api('/platform/hizli-test/iptal', { id }); }
  });

  test('bağlı liste: üst seçilince alt seçenekler getir düğmesine basmadan gelir; hızlı ardışık değişiklikte son seçimin seçenekleri', async () => {
    test.setTimeout(400_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/dal-agaci/', ekranAdi: 'Dal ağacı', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    await bekle(id, ['veri'], 600);
    const { page, hatalar, kapat } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      const il = soru.getByLabel('İl', { exact: true });
      const ilce = soru.getByLabel('İlçe', { exact: true });
      await il.selectOption('06');
      await expect(ilce).toBeEnabled({ timeout: 60_000 });
      await expect(ilce.locator('option')).toContainText(['Keçiören']);
      // Hızlı ardışık: İstanbul → Adana; yalnız son durum (Adana) uygulanır.
      await il.selectOption('34');
      await il.selectOption('01');
      await expect(ilce.locator('option', { hasText: 'Seyhan' })).toHaveCount(1, { timeout: 60_000 });
      await expect(ilce.locator('option', { hasText: 'Kadıköy' })).toHaveCount(0);
      // İlçe için getir düğmesine gerek kalmadı (seçenekler geldi: "✓ … seçenekleri geldi").
      await expect(soru.getByRole('button', { name: '“İlçe” seçeneklerini getir', exact: true })).toHaveCount(0);
      await expect(soru.locator('.hizli-zincir-tamam').filter({ hasText: '“İlçe” seçenekleri geldi' })).toBeVisible();
      await expect.poll(async () => alanBul(await bekle(id, ['veri']), 'İlçe').secenekler.map((x: Nesne) => x.metin), { timeout: 30_000 }).toEqual(['Seyhan']);
      expect(hatalar).toEqual([]);
    } finally { await kapat(); await api('/platform/hizli-test/iptal', { id }); }
  });

  test('düğmeye basınca sayfanın en altında beliren (açılışta olmayan) kişi tipi seçimi ilk keşfin kurallarıyla denenir; ikinci adımda Tüzel doğru doldurulur', async () => {
    test.setTimeout(400_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/adimli/', ekranAdi: 'Adımlı', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Ad').anahtar]: deger('Deneme') } });
    // (Evet izni ve tek aday: "İleri" kendiliğinden basılır; değilse seçilir.)
    o = await bekle(id, ['karar', 'veri'], 120);
    if (o.durum === 'karar') {
      const ileri = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'İleri');
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: ileri?.secici });
      o = await bekle(id, ['veri'], 120);
    }
    expect(JSON.stringify(o.gunluk)).toContain('“İleri” basıldı');
    const tip = alanBul(o, 'Kişi tipi');
    expect(tip).toMatchObject({ kontrol: true });
    expect(alanBul(o, 'Kimlik no').etiketKosulu).toMatchObject({ secim: tip.anahtar, etiketler: { O: 'Kimlik no', T: 'Vergi no' }, enCoklar: { O: 11, T: 10 } });
    expect(alanBul(o, 'Doğum tarihi').kosul).toMatchObject({ secim: tip.anahtar, degerler: ['O'] });
    const { page, hatalar, kapat } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      const tipKutusu = soru.locator(`.hizli-onsecim-alani[data-anahtar="${tip.anahtar}"]`);
      await tipKutusu.getByRole('radio', { name: 'Tüzel' }).check();
      // (Basıştan sonra beliren alanlar "yeni alan" rozetlidir.)
      await expect(tipKutusu.getByLabel(/^Vergi no/)).toBeVisible();
      await expect(soru.getByLabel(/^Doğum tarihi/)).toHaveCount(0);
      await expect(tipKutusu.locator('.hizli-onsecim-durum').first()).toContainText('Sayfada “Tüzel” seçili', { timeout: 60_000 });
      await tasmaYok(page);
      await tipKutusu.getByLabel(/^Vergi no/).fill('1234567890');
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 120_000 });
      expect(hatalar).toEqual([]);
    } finally { await kapat(); }
    o = await bekle(id, ['karar']);
    if (!u.adimliKayitlar.length) {
      const kaydet = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: kaydet?.secici });
      o = await bekle(id, ['karar']);
    }
    expect(u.adimliKayitlar.at(-1)).toEqual({ ad: 'Deneme', tip: 'T', kimlik: '1234567890' });
    await api('/platform/hizli-test/iptal', { id });
  });

  /** Keşif basışı oturumu (cümle düğme adı vermez: sayfadaki tüm düğmeler keşfin adayıdır). */
  const kesifBaslat = async (izin: string): Promise<string> => {
    await isBitsin();
    return String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/kesif-dugmeli/', ekranAdi: `Keşif ${izin}`, izin, cumle: '"Kayıt alındı" görünce bitir'
    })).id);
  };
  const adlar = (o: Nesne): string[] => (o.soru.dugmeler as Nesne[]).map((d) => String(d.metin));
  const secici = (o: Nesne, metin: string): string => String((o.soru.dugmeler as Nesne[]).find((d) => d.metin === metin)?.secici);

  test('keşif basışı — Bana sor: tüm düğmeler (betikli dahil) tek toplu kartta sorulur; seçilenlere basılır, açılan alanlar veri durağında bilgi olarak; form gönderilmez', async () => {
    test.setTimeout(400_000);
    const id = await kesifBaslat('sor');
    let o = await bekle(id, ['kesifOnay'], 300);
    expect(o.soru.tur).toBe('kesifOnay');
    expect(adlar(o).sort()).toEqual(['Ek bölüm', 'Gönder', 'Önizle'].sort());
    expect((o.soru.dugmeler as Nesne[]).find((d) => d.metin === 'Önizle')).toMatchObject({ emin: false, neden: expect.stringContaining('betikle') });
    expect(o.durak).toBe(2);
    const { page, hatalar, kapat } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: 'Keşif için şu düğmelere basılabilir' })).toBeVisible({ timeout: 30_000 });
      const liste = soru.getByRole('list', { name: 'Keşif için basılabilecek düğmeler' });
      await expect(liste.getByRole('checkbox')).toHaveCount(3);
      await expect(soru.getByRole('button', { name: 'Hiçbirine basma', exact: true })).toBeVisible();
      await expect(soru.getByRole('button', { name: 'Kalanları atla', exact: true })).toBeVisible();
      await tasmaYok(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await tasmaYok(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await liste.getByRole('checkbox', { name: 'Ek bölüm' }).check();
      await liste.getByRole('checkbox', { name: 'Önizle' }).check();
      await soru.getByRole('button', { name: 'Seçilenlere bas', exact: true }).click();
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 120_000 });
      // Veri durağında bilgi bölümü: basınca açılan alanlar (sorulmaz; akışta o düğmeye basılırsa sorulur).
      const ek = soru.locator('section', { has: page.getByRole('heading', { name: '“Ek bölüm”e basınca açılan alanlar (akışta bu düğmeye basarsanız sorulur)' }) });
      await expect(ek.locator('li')).toHaveText(['Ek alan 1', 'Ek alan 2']);
      const onizle = soru.locator('section', { has: page.getByRole('heading', { name: '“Önizle”ye basınca açılan alanlar (akışta bu düğmeye basarsanız sorulur)' }) });
      await expect(onizle.locator('li')).toHaveText(['Ek alan 3']);
      await expect(soru.getByLabel('Ek alan 1', { exact: true })).toHaveCount(0);
      await tasmaYok(page);
      expect(hatalar).toEqual([]);
    } finally { await kapat(); }
    o = await bekle(id, ['veri']);
    // Keşif basışı akışa girmez: veri durağında yalnız açılıştaki alanlar; sayfa ilk durumuna döndü.
    expect((o.soru.alanlar as Nesne[]).map((a) => a.etiket)).toEqual(['Ad']);
    const gunluk = JSON.stringify(o.gunluk);
    expect(gunluk).toContain('Keşif: “Ek bölüm” düğmesine basınca 2 yeni alan açıldı');
    expect(gunluk).toContain('Keşif: “Önizle” düğmesine basınca 1 yeni alan açıldı');
    expect(gunluk).toContain('Keşif: “Gönder” düğmesine basılmadı.');
    expect(gunluk).not.toContain('döndürülemedi');
    expect(u.kesifDugmeliKayitlar).toEqual([]);
    expect(o.adimlar.every((a: Nesne) => !a.bas)).toBe(true);
    await api('/platform/hizli-test/iptal', { id });

    // Kalanları atla → hiçbirine basılmaz, bilgi bölümü yok.
    const id2 = await kesifBaslat('sor');
    o = await bekle(id2, ['kesifOnay'], 300);
    await basarili('/platform/hizli-test/onay', { id: id2, cevap: 'atla' });
    o = await bekle(id2, ['veri']);
    expect(o.soru.kesifAlanlari).toEqual([]);
    expect(JSON.stringify(o.gunluk)).toContain('Keşif: kalan 3 düğmeye basılmadı (kalanları atla).');
    expect(u.kesifDugmeliKayitlar).toEqual([]);
    await api('/platform/hizli-test/iptal', { id: id2 });
  });

  test('keşif basışı — Hayır: hiç sorulmaz, hiçbir düğmeye basılmaz', async () => {
    test.setTimeout(300_000);
    const id = await kesifBaslat('hayir');
    const o = await bekle(id, ['veri'], 300);
    expect(JSON.stringify(o.gunluk)).not.toContain('Keşif: “');
    expect(o.soru.kesifAlanlari).toEqual([]);
    expect(u.kesifDugmeliKayitlar).toEqual([]);
    await api('/platform/hizli-test/iptal', { id });
  });

  test('keşif basışı — Evet: sayfa içinde açan düğmeye sorulmadan basılır; betikli ve form gönderen düğmeler toplu kartta sorulur; kaydedilen senaryoda keşif basışı yok', async () => {
    test.setTimeout(600_000);
    const id = await kesifBaslat('evet');
    let o = await bekle(id, ['kesifOnay', 'veri'], 300);
    expect(o.durum).toBe('kesifOnay');
    expect(adlar(o).sort()).toEqual(['Gönder', 'Önizle'].sort());
    expect(JSON.stringify(o.gunluk)).toContain('Keşif: “Ek bölüm” düğmesine basılıyor (sayfa içinde bir bölümü açar / kapatır; sorulmadan).');
    expect(JSON.stringify(o.gunluk)).toContain('Keşif: “Ek bölüm” düğmesine basınca 2 yeni alan açıldı (Ek alan 1, Ek alan 2)');
    // Yalnız betikli düğmeye onay; form gönderen basılmaz.
    await basarili('/platform/hizli-test/onay', { id, cevap: true, secilenler: [secici(o, 'Önizle')] });
    o = await bekle(id, ['veri'], 120);
    expect(JSON.stringify(o.gunluk)).toContain('Keşif: “Önizle” düğmesine basılıyor (onay verildi).');
    expect(JSON.stringify(o.gunluk)).toContain('Keşif: “Gönder” düğmesine basılmadı.');
    expect((o.soru.kesifAlanlari as Nesne[]).map((x) => x.dugme)).toEqual(['Ek bölüm', 'Önizle']);
    expect(u.kesifDugmeliKayitlar).toEqual([]);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Ad').anahtar]: deger('Deneme') } });
    o = await bekle(id, ['karar'], 120);
    const gonder = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Gönder');
    await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: gonder?.secici });
    o = await bekle(id, ['karar']);
    expect(u.kesifDugmeliKayitlar).toEqual([{ ad: 'Deneme' }]);
    await bitir(id);
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Keşif basışı', senaryoIndeksleri: [] });
    // Kaydedilen ekran / senaryo: yalnız akıştaki basış (Gönder); keşif basışları (Ek bölüm, Önizle) yok.
    const ekran = JSON.stringify((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne);
    expect(ekran).toContain('gonder');
    expect(ekran).not.toContain('ekAc');
    expect(ekran).not.toContain('onizle');
    const once = u.kesifDugmeliKayitlar.length;
    await kos(String(k.senaryoId));
    expect(u.kesifDugmeliKayitlar.slice(once)).toEqual([{ ad: 'Deneme' }]);
  });
});
