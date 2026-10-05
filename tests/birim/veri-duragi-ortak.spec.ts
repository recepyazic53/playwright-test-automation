// VERİ DURAĞI + YAZILAN DEĞERİN DOĞRULANMASI + AÇILAN PENCERE (hızlı test, doğrulama ve normal koşu). Ortak hızlı testte görülen sorunların
// korumaları (genel; siteye özgü sabit yok):
//  A) Yazılan değer sayfada tutmadı ama hata yoktu: varsayılan değerli (önceden dolu, maskeli, Ctrl+A engelli) tarih alanının üzerine yazılır;
//     sonradan başka bir alanın sorgusu tarihi ezerse tur sonunda bir kez yeniden yazılır (hızlı test ve normal koşu); yine ezilirse açık
//     alan hatası: “Doğum Tarihi” 13.04.1998 yazıldı; “Kimlik No” doldurulunca sayfa 02.10.2026 yaptı.
//  B–E) Veri durağı: sayfada hazır gelen değerler ana listede, sayfa sırasıyla, önyazılı ve "sayfada hazır" rozetli; değiştirilmezse
//     gönderilmez. Koşullu alanlar kontrol eden seçimin kutusunda gruplu; keşifte görülen ama şu an gizli alan "hazır" (dolu) sayılmaz.
//  F) "Veriyi düzenle" basıştan sonra (yeni alan yokken) önceki adımın verisini açar; değişen değer zincir yeniden yürütülerek uygulanır.
//  G) Açılan pencere (örtü + kutu): pencerenin içindeki tıklanabilir her öğe aday ve önce; arkadakiler sonda; pencere içindeki liste yeni
//     alan olarak sorulur; alan yanındaki simgeler etiket adıyla karışmaz ("Alan ikonları").
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfalar (veri-duragi-fikstur.ts); geçici veritabanı; veri/ klasörüne dokunulmaz. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { DegerIzleyici, alanaYaz, degerTuttu } from '../../scripts/platform/tarama/alan-cikisi';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

test.describe('motor (127.0.0.1)', () => {
  test('değer karşılaştırması biçimden bağımsız (maske / tarih biçimi); farklı değer tutmaz', () => {
    expect(degerTuttu('(542) 650-2153', '5426502153')).toBe(true);
    expect(degerTuttu('13.04.1998', '1998-04-13')).toBe(true);
    expect(degerTuttu('02.10.2026', '13.04.1998')).toBe(false);
    expect(degerTuttu('', '13.04.1998')).toBe(false);
    expect(degerTuttu(null, 'x')).toBe(false);
    // Tutar: sayı değeri karşılaştırılır (eski değer kalıp yenisi eklenince "içeriyor" yanlış pozitif vermez).
    expect(degerTuttu('5.000', '5000')).toBe(true);
    expect(degerTuttu('1.000,00 TL', '1000')).toBe(true);
    expect(degerTuttu('1.000.000', '1000000')).toBe(true);
    expect(degerTuttu('5.000.000', '5000')).toBe(false);
    expect(degerTuttu('000', '5000')).toBe(false);
    expect(degerTuttu('12,5', '12.5')).toBe(true);
    expect(degerTuttu('ne olursa', '')).toBe(true);
  });

  test('önceden dolu, maskeli, Ctrl+A engelli alana yazılır; başka alanın sorgusu ezerse izleyici bozanı söyler; yeniden yazılınca tutar', async () => {
    const u = new VeriDuragiUygulamasi();
    const s = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const t = await korumaliTarayici();
    try {
      const page = await (await t.newContext()).newPage();
      await page.goto(`${s.adres}/tarihli/`);
      const dogum = page.locator('#dogum');
      await expect(dogum).toHaveValue('02.10.2026');
      expect(await alanaYaz(dogum, '13.04.1998', { zamanAsimiMs: 10_000 })).toBe('tamam');
      await expect(dogum).toHaveValue('13.04.1998');
      const iz = new DegerIzleyici<string>();
      await iz.yazildi('dogum', 'Doğum Tarihi', '13.04.1998', dogum);
      expect(await alanaYaz(page.locator('#kimlik'), '12345678901', { zamanAsimiMs: 10_000, sonra: async () => { await page.waitForTimeout(600); } })).toBe('tamam');
      await iz.yazildi('kimlik', 'Kimlik No', '12345678901', page.locator('#kimlik'));
      expect((await iz.degisenler()).map((x) => [x.oge, x.mevcut])).toEqual([['dogum', '02.10.2026']]);
      expect(iz.bozani('dogum')).toBe('Kimlik No');
      expect(await alanaYaz(dogum, '13.04.1998', { zamanAsimiMs: 10_000 })).toBe('tamam');
      expect(await iz.sonDurum('dogum')).toBeNull();
    } finally { await t.close(); await s.kapat(); }
  });

  test('açılan pencere: içindeki tıklanabilir her öğe (href\'siz a, onclick\'li span) aday ve önce; arkadakiler sonda; alan simgeleri etiket adıyla karışmaz', async () => {
    const u = new VeriDuragiUygulamasi();
    const s = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const t = await korumaliTarayici();
    try {
      const page = await (await t.newContext()).newPage();
      await page.goto(`${s.adres}/pencere/`);
      const once = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
      const adlar = once.gonderim.map((a) => a.metin);
      // Alan etiketi / radyo seçeneği düğme sayılmaz; simgeler "“X” yanındaki simge" adıyla en sonda.
      for (const m of ['Kişi tipi', 'Özel', 'Tüzel', 'Numara']) expect(adlar, m).not.toContain(m);
      const ikonlar = once.gonderim.filter((a) => a.alanIkonu);
      expect(ikonlar.map((a) => a.metin)).toEqual(expect.arrayContaining(['“Kişi tipi” yanındaki simge', '“Numara” yanındaki simge']));
      expect(once.gonderim.slice(-ikonlar.length).every((a) => a.alanIkonu)).toBe(true);
      expect(once.gonderim.some((a) => a.pencerede || a.arkada)).toBe(false);
      await page.getByRole('button', { name: 'Pencereyi aç' }).click();
      const sonra = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
      const pencere = sonra.gonderim.filter((a) => a.pencerede);
      expect(pencere.map((a) => a.metin).sort()).toEqual(['Dış sistemden devam et', 'Kartla tamamla', 'Tamamla'].sort());
      // Pencere içindekiler önce (en olası onlardan); arkadakiler "pencerenin arkasında" ve sonra; 70 arka düğme sınırı pencereyi itmez.
      expect(sonra.gonderim.slice(0, 3).every((a) => a.pencerede)).toBe(true);
      expect(sonra.gonderim[0].enOlasi).toBe(true);
      expect(sonra.gonderim.filter((a) => a.arkada).length).toBeGreaterThan(10);
      expect(sonra.gonderim.find((a) => a.metin === 'Pencereyi aç')?.arkada).toBe(true);
      // Seçiciler tıklanabilir: href'siz bağlantı ve onclick'li span sayfada tek öğe.
      for (const a of pencere) expect(await page.locator(a.secici).count(), a.metin ?? '').toBe(1);
    } finally { await t.close(); await s.kapat(); }
  });
});

test.describe('hızlı test ve normal koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Veri-${randomBytes(6).toString('hex')}`;
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
      // Keşif toplu sorusu bu testin konusu değil: "Hiçbirine basma".
      if (o.durum === 'kesifOnay' && !durumlar.includes('kesifOnay')) { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (durumlar.includes(o.durum)) return o;
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const isBitsin = async (): Promise<void> => {
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
  };
  const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
  const alanBul = (o: Nesne, etiket: string): Nesne => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return a;
  };
  const arayuz = async (id: string, genislik = 1440): Promise<{ page: Page; kapat: () => Promise<void>; hatalar: string[] }> => {
    const tarayici = await korumaliTarayici();
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/hizli-test/o/${id}`);
    return { page, hatalar, kapat: () => tarayici.close() };
  };
  const tasmaYok = async (page: Page): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'veri-duragi-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Veri Durağı Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('A: varsayılan tarihli alana yazılan değer, sonradan başka alanın sorgusu ezse de sayfada kalır (hızlı test → kayıt → normal koşu)', async () => {
    test.setTimeout(600_000);
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/tarihli/', ekranAdi: 'Kayıt formu', izin: 'evet', cumle: 'Gönder düğmesine bas, "Kayıt tamam" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    // Sayfada hazır gelen tarih: değeriyle (dolu değil, gerçek değer) ve ana listede.
    expect(alanBul(o, 'Doğum Tarihi')).toMatchObject({ hazir: true, mevcut: '02.10.2026' });
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Doğum Tarihi').anahtar]: deger('13.04.1998'), [alanBul(o, 'Kimlik No').anahtar]: deger('12345678901') } });
    o = await bekle(id, ['karar'], 300);
    expect(u.tarihliKayitlar.at(-1), JSON.stringify(o.gunluk?.slice(-8))).toMatchObject({ dogum: '13.04.1998', kimlik: '12345678901' });
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt tamam')) as string;
    expect(bitti, JSON.stringify(o.soru.etiketler)).toBeTruthy();
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    await basarili('/platform/hizli-test/ozet', { id, baslik: 'Kayıt — tarih' });
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Kayıt — tarih', senaryoIndeksleri: [] });
    // Normal koşu: aynı kural (alan-cikisi.ts > DegerIzleyici): ezilen tarih bir kez yeniden yazılır, gönderilen değer doğru.
    const once = u.tarihliKayitlar.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId: String(k.senaryoId), ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(u.tarihliKayitlar.slice(once)).toEqual([{ dogum: '13.04.1998', kimlik: '12345678901' }]);
  });

  test('A: yeniden yazılan değer de ezilirse açık alan hatası (hangi alan doldurulunca ne olduğu)', async () => {
    test.setTimeout(300_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/tarihli/?kilit=1', ekranAdi: 'Kayıt formu kilitli', izin: 'hayir' })).id);
    let o = await bekle(id, ['veri'], 300);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Doğum Tarihi').anahtar]: deger('13.04.1998'), [alanBul(o, 'Kimlik No').anahtar]: deger('12345678901') } });
    o = await bekle(id, ['veri'], 300);
    expect(o.soru.not).toBe('Bazı alanlar doldurulamadı.');
    expect(alanBul(o, 'Doğum Tarihi').hata).toContain('“Doğum Tarihi” 13.04.1998 yazıldı; “Kimlik No” doldurulunca sayfa 02.10.2026 yaptı');
    await api('/platform/hizli-test/iptal', { id });
  });

  test('B–E: hazır değerler ana listede sayfa sırasıyla, önyazılı ve rozetli (değişmezse gönderilmez); koşullu alanlar seçimin kutusunda gruplu; gizli koşullu alan "hazır" değil; 1440 / 390 taşma yok', async () => {
    test.setTimeout(400_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/kosullu-hazir/', ekranAdi: 'Başvuru', izin: 'hayir' })).id);
    const o = await bekle(id, ['veri'], 300);
    // D: keşifte (Evet denenirken) önceden doldurulan ama şu an gizli koşullu alanlar "hazır" sayılmaz; değeri okunmayan alan "dolu" değildir.
    expect(alanBul(o, 'Ödeyen tipi')).toMatchObject({ hazir: false, mevcut: null });
    expect(alanBul(o, 'Ödeyen doğum tarihi')).toMatchObject({ hazir: false, mevcut: null });
    expect(alanBul(o, 'Kanal')).toMatchObject({ hazir: true, mevcut: 'Web' });
    const { page, kapat, hatalar } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      // B + C: ayrı "hazır" bölümü yok; ana liste sayfa sırasıyla, hazır değerler önyazılı ve rozetli.
      await expect(soru.locator('.hizli-hazir')).toHaveCount(0);
      const ana = soru.locator(':scope > .hizli-alanlar');
      await expect(ana.locator(':scope > .hizli-alan .hizli-alan-baslik label')).toHaveText(['Ad', 'Başlangıç tarihi', 'Kanal']);
      await expect(soru.getByLabel('Başlangıç tarihi', { exact: true })).toHaveValue('02.10.2026');
      await expect(soru.getByLabel('Kanal', { exact: true })).toHaveValue('web');
      const satir = (e: string) => soru.locator('.hizli-alan').filter({ has: page.locator('.hizli-alan-baslik label', { hasText: new RegExp(`^${e}$`) }) });
      await expect(satir('Başlangıç tarihi').locator('.hizli-hazir-rozet')).toHaveText('sayfada hazır');
      await expect(satir('Kanal').locator('.hizli-hazir-rozet')).toHaveText('sayfada hazır');
      await expect(satir('Ad').locator('.hizli-hazir-rozet')).toHaveCount(0);
      // E: koşullu alanlar seçimin kutusunda, altında gruplu; seçim değişince grup değişir; tek tek "olunca görünür" notu yok.
      const tip = soru.locator('.hizli-onsecim-alani[data-anahtar]').filter({ hasText: 'Kişi tipi' });
      await expect(tip.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Kişi tipi: Özel” seçimine göre:');
      await expect(tip.getByLabel('Kimlik no', { exact: true })).toBeVisible();
      await expect(soru.locator('.hizli-kosul')).toHaveCount(0);
      await tip.getByRole('radio', { name: 'Tüzel' }).check();
      await expect(tip.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Kişi tipi: Tüzel” seçimine göre:');
      await expect(tip.getByLabel('Vergi no', { exact: true })).toBeVisible();
      await expect(soru.getByLabel('Kimlik no', { exact: true })).toHaveCount(0);
      const farkli = soru.locator('.hizli-onsecim-alani[data-anahtar]').filter({ hasText: 'Ödeyen farklı' });
      // Hayır'da açılan alan yok: grup boş görünmez, bu seçimde sorulmayanları söyler.
      await expect(farkli.locator('.hizli-kosul-grubu-notu')).toHaveText(/^Bu seçimde “Ödeyen .+” sorulmaz\.$/);
      await expect(farkli.locator('.hizli-kosul-grubu .hizli-alan')).toHaveCount(0);
      await farkli.getByRole('radio', { name: 'Evet' }).check();
      await expect(farkli.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Ödeyen farklı: Evet” seçimine göre:');
      // D (arayüz): gizli koşullu alanlar "dolu" / "sayfada hazır" gösterilmez; boş sorulur.
      await expect(farkli.getByLabel('Ödeyen doğum tarihi', { exact: true })).toHaveValue('');
      await expect(farkli.locator('.hizli-hazir-rozet')).toHaveCount(0);
      await expect(soru).not.toContainText('dolu');
      await tasmaYok(page);
      const goruntu = test.info().outputPath('veri-duragi-1440.png');
      await page.screenshot({ path: goruntu, fullPage: true });
      if (process.env.GORUNTU_KLASORU) { mkdirSync(process.env.GORUNTU_KLASORU, { recursive: true }); copyFileSync(goruntu, join(process.env.GORUNTU_KLASORU, 'veri-duragi-1440.png')); }
      await page.setViewportSize({ width: 390, height: 900 });
      await tasmaYok(page);
      if (process.env.GORUNTU_KLASORU) await page.screenshot({ path: join(process.env.GORUNTU_KLASORU, 'veri-duragi-390.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await farkli.getByRole('radio', { name: 'Hayır' }).check();
      await tip.getByRole('radio', { name: 'Özel' }).check();
      // B: değiştirilmeyen hazır değer gönderilmez (sayfadaki kullanılır); değiştirilen gönderilir.
      await soru.getByLabel('Ad', { exact: true }).fill('Deneme');
      await soru.getByLabel('Başlangıç tarihi', { exact: true }).fill('05.10.2026');
      const istek = page.waitForRequest((r) => r.url().includes('/platform/hizli-test/veri'));
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      const govde = JSON.parse((await istek).postData() ?? '{}') as Nesne;
      const anahtar = (e: string) => String(alanBul(o, e).anahtar);
      expect(govde.degerler[anahtar('Başlangıç tarihi')]).toMatchObject({ deger: '05.10.2026' });
      expect(govde.degerler[anahtar('Kanal')] ?? null).toBeNull();
      expect(govde.degerler[anahtar('Ad')]).toMatchObject({ deger: 'Deneme' });
      expect(hatalar).toEqual([]);
    } finally { await kapat(); await api('/platform/hizli-test/iptal', { id }); }
  });

  test('F: basış yalnız metin gösterince "Veriyi düzenle" önceki adımın verisini açar; değişen değer zincir yeniden yürütülerek sayfaya uygulanır', async () => {
    test.setTimeout(400_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basit/', ekranAdi: 'Selam', izin: 'evet', cumle: 'Gönder düğmesine bas' })).id);
    let o = await bekle(id, ['veri'], 300);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Ad').anahtar]: deger('Ayşe') } });
    o = await bekle(id, ['karar'], 300);
    expect(u.selamlar.at(-1)).toBe('Ayşe');
    // Değiştirmeden devam: kaldığı yere dönülür (yeniden basılmaz).
    const sayi = u.selamlar.length;
    await basarili('/platform/hizli-test/karar', { id, karar: 'duzelt' });
    o = await bekle(id, ['veri']);
    expect(o.soru).toMatchObject({ adim: 1, gecmis: true });
    expect(alanBul(o, 'Ad').deger).toBe('Ayşe');
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Ad').anahtar]: deger('Ayşe') } });
    await bekle(id, ['karar']);
    expect(u.selamlar.length).toBe(sayi);
    const { page, kapat, hatalar } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 30_000 });
      await soru.getByRole('button', { name: 'Veriyi düzenle', exact: true }).click();
      await expect(soru.getByRole('heading', { name: 'Adım 1: veriyi düzenle' })).toBeVisible({ timeout: 60_000 });
      await expect(soru.locator('.not-kutusu.bilgi')).toContainText('yeni alan çıkmadı');
      await expect(soru.getByLabel('Ad', { exact: true })).toHaveValue('Ayşe');
      await soru.getByLabel('Ad', { exact: true }).fill('Fatma');
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      // Önceki düğmeye yeniden basılacak: adlarıyla onay sorulur.
      const onay = page.locator('dialog[open]');
      await expect(onay).toContainText('“Gönder”');
      await onay.getByRole('button', { name: 'Evet, yeniden yürüt' }).click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 120_000 });
      expect(u.selamlar.at(-1)).toBe('Fatma');
      expect(hatalar).toEqual([]);
    } finally { await kapat(); }
    o = await bekle(id, ['karar']);
    expect(JSON.stringify(o.gunluk)).toContain('zincir tekrar yürütüldü');
    await api('/platform/hizli-test/iptal', { id });
  });

  test('H: senaryo önerileri — görünürlük dallarının (iç içe dahil) tüm birleşimleri, görünürlüğü değiştirmeyen seçim her değeriyle, adres farklı il ile zengin öneride', async () => {
    test.setTimeout(900_000);
    await isBitsin();
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { hizliOneriSayisi: 10 } });
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/dal-agaci/', ekranAdi: 'Dal ağacı', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 600);
    const degerler: Nesne = { [alanBul(o, 'Kimlik no').anahtar]: deger('10000000146') };
    for (const [etiket, d] of [['İl', '06'], ['İlçe', '0602']]) {
      degerler[alanBul(o, etiket).anahtar] = deger(d);
      await basarili('/platform/hizli-test/veri', { id, degerler, zincir: alanBul(o, etiket).anahtar });
      o = await bekle(id, ['veri']);
    }
    degerler[alanBul(o, 'Bina').anahtar] = deger('b1');
    await basarili('/platform/hizli-test/veri', { id, degerler });
    o = await bekle(id, ['karar'], 300);
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    const ozet = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Başvuru' })).ozet as Nesne;
    const oneriler = ozet.senaryolar as Nesne[];
    expect(oneriler.map((x) => x.baslik), JSON.stringify(oneriler.map((x) => [x.baslik, x.gerekce, x.veriGerekli]))).toEqual([
      'Başvuru',
      'Başvuru — Kişi tipi: Özel · Ödeyen farklı: Evet · Ödeyen tipi: Özel · Konut durumu: Ev sahibi · İl: İstanbul / Kadıköy / Bina 3',
      'Başvuru — Kişi tipi: Özel · Ödeyen farklı: Evet · Ödeyen tipi: Tüzel · Konut durumu: Ev sahibi · İl: Adana / Seyhan / Bina 4',
      'Başvuru — Kişi tipi: Tüzel · Ödeyen farklı: Hayır',
      'Başvuru — Kişi tipi: Tüzel · Ödeyen farklı: Evet · Ödeyen tipi: Özel',
      'Başvuru — Kişi tipi: Tüzel · Ödeyen farklı: Evet · Ödeyen tipi: Tüzel',
      'Başvuru — Kişi tipi: Özel · Ödeyen farklı: Hayır · Konut durumu: Ev sahibi'
    ]);
    expect(oneriler.map((x) => x.veriGerekli)).toEqual([[], ['Ödeyen kimlik no'], ['Ödeyen vergi no'], ['Vergi no'], ['Vergi no', 'Ödeyen kimlik no'], ['Vergi no', 'Ödeyen vergi no'], []]);
    expect(oneriler[1].gerekce).toContain('görünürlük dalları: tüm birleşimler');
    expect(oneriler[1].gerekce).toContain('adres: farklı il');
    expect(oneriler[6].gerekce).toContain('“Konut durumu”: her değer');
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { hizliOneriSayisi: 5 } });
    await api('/platform/hizli-test/iptal', { id });
  });

  test('G: açılan penceredeki liste yeni alan olarak sorulur; adaylarda pencere içindekiler önce, arkadakiler ve alan simgeleri sonda', async () => {
    test.setTimeout(400_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/pencere/', ekranAdi: 'Pencere', izin: 'evet' })).id);
    let o = await bekle(id, ['veri', 'karar'], 300);
    if (o.durum === 'veri') {
      await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Numara').anahtar]: deger('5') } });
      o = await bekle(id, ['karar'], 300);
    }
    const adaylar = o.soru.adaylar as Nesne[];
    expect(adaylar.map((a) => a.metin)).not.toContain('Kişi tipi');
    expect(adaylar.filter((a) => a.alanIkonu).map((a) => a.metin)).toEqual(expect.arrayContaining(['“Kişi tipi” yanındaki simge']));
    const ac = adaylar.find((a) => a.metin === 'Pencereyi aç');
    await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: ac?.secici });
    o = await bekle(id, ['veri', 'karar'], 300);
    // G2: penceredeki liste yeni alan (veri durağı).
    expect(o.durum, JSON.stringify(o.gunluk?.slice(-4))).toBe('veri');
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Taksit planı').anahtar]: deger('3') } });
    o = await bekle(id, ['karar'], 300);
    const sonra = o.soru.adaylar as Nesne[];
    const pencere = sonra.filter((a) => a.pencerede).map((a) => a.metin);
    expect(pencere.sort()).toEqual(['Dış sistemden devam et', 'Kartla tamamla', 'Tamamla'].sort());
    expect(sonra.slice(0, 3).every((a) => a.pencerede)).toBe(true);
    expect(sonra.find((a) => a.metin === 'İşlem 1')?.arkada).toBe(true);
    expect(sonra.find((a) => a.secici === o.soru.oneri)?.pencerede).toBe(true);
    // Arayüz: "Açılan pencerede" grubu ilk; "Pencerenin arkasında" ve "Alan ikonları" sonda.
    const { page, kapat } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 30_000 });
      const gruplar = await soru.getByLabel('Basılacak düğme').locator('optgroup').evaluateAll((l) => l.map((x) => (x as HTMLOptGroupElement).label));
      expect(gruplar[0]).toMatch(/^Açılan pencerede \(3\)$/);
      expect(gruplar.at(-1)).toMatch(/^Alan ikonları/);
      expect(gruplar.some((g) => /^Pencerenin arkasında/.test(g))).toBe(true);
    } finally { await kapat(); await api('/platform/hizli-test/iptal', { id }); }
  });
});
