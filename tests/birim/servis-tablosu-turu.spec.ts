// UÇTAN UCA (yerel) — üçüncü tablo türü "Servis tablosu" (kaynak.tabloTuru 'servis'): yalnız servis isteklerinde kullanılan, ekranda
// karşılığı olmayan değerler. Tür kaydı / okuma / doğrulama, Test verisi sayfasında ayrı "Servis verileri" grubu ve seçenek metni
// (otomatik öneri servisi seçmez), birleştirmede tür engeli (servis yalnız servisle), birleştirme önerileri, ekran alan bağlarında
// servis tablolarının listenin sonunda ayrı grupta durması, 1440 / 390 px taşma yok.
// Güvenlik: yalnız 127.0.0.1'deki ayrı Nöbetçi örneği ve geçici veritabanı; uygulama sayfası açılmaz.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloTuru } from '../../scripts/platform/tablolar/tablo-benzerligi.mjs';
import { tabloEslesmesi } from '../../scripts/platform/servisler/servis-analizi.mjs';import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Servis-Turu-${randomBytes(6).toString('hex')}`;
const SECENEK_METNI = 'Yalnız servis isteklerinde kullanılan, ekranda karşılığı olmayan değerler (ör. yazdırma türü, Channel, kanal / kullanıcı kodları). Listede “Servis verileri” altında.';
const SERVIS_GRUBU = 'Servis verileri (ekranda karşılığı olmayan)';

let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ekranId = '';
const id: Record<string, string> = {};

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde?: Nesne): Promise<Nesne> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
const tablolar = async (): Promise<Nesne[]> => (await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];

/** Tek adımlı nötr ekran: iki metin alanı. */
function ekranPaketi(): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'basvuru-ekrani', ad: 'Başvuru ekranı', aciklama: 'Nötr fikstür.', ekranUrl: '/basvuru/', girisGerekmez: true,
    specDosyasi: 'tests/scenarios/basvuru-ekrani/basvuru-ekrani.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (basvuru-ekrani)' },
    kosullar: {},
    adimlar: [{
      id: 'bilgi', sira: 1, baslik: 'Bilgi girilir',
      bolumler: [{ id: 'bilgiBolumu', baslik: 'Bilgi', alanlar: [
        { id: 'adSoyad', tip: 'metin', etiket: { ekran: 'Ad soyad' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'adSoyad' }, konum: { secici: '#ad', kirilganlik: 'dusuk' } },
        { id: 'telefon', tip: 'metin', etiket: { ekran: 'Telefon' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'telefon' }, konum: { secici: '#tel', kirilganlik: 'dusuk' } }
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'metin', deger: 'Tamam', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'basvuru-ekrani', ad: 'Başvuru ekranı', urlYolu: '/basvuru/' }, olusturan: 'test', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'servis-tablosu-turu-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Servis Türü Projesi' })).proje.id);
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ekranPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  ekranId = String(((await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[]).find((e) => e.anahtar === 'basvuru-ekrani')?.id);
  const sutunlar = [{ ad: 'BaskiTuru' }, { ad: 'Channel' }];
  const satirlar = [{ ad: 'pdf', degerler: { BaskiTuru: 'PDF', Channel: 'K1' } }, { ad: 'xml', degerler: { BaskiTuru: 'XML', Channel: 'K2' } }];
  id.servisA = String((await basarili('/platform/tablo/kaydet', { projeId, ad: 'Servis ayarları', tur: 'servis', sutunlar, satirlar })).tablo.id);
  id.servisB = String((await basarili('/platform/tablo/kaydet', { projeId, ad: 'Servis ayarları 2', tur: 'servis', sutunlar, satirlar })).tablo.id);
  // Başlıkları ve satırları servis tablolarıyla aynı kayıt tablosu: tür farklı olduğundan birleştirilmez, önerilmez.
  id.kayit = String((await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kayıt benzeri', tur: 'kayit', sutunlar, satirlar })).tablo.id);
  id.kisi = String((await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kişiler', tur: 'kayit', sutunlar: [{ ad: 'Ad soyad' }, { ad: 'Telefon' }],
    satirlar: [{ ad: 'bir', degerler: { 'Ad soyad': 'Deneme Kişi', Telefon: '5550000001' } }] })).tablo.id);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function sayfa(genislik: number): Promise<Page> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return page;
}

test('tür kaydı ve okuma: "servis" saklanır, tür verilmeden kaydedince korunur; geçersiz tür reddedilir; sezgi servisi önermez', async () => {
  const t = (await tablolar()).find((x) => x.id === id.servisA) as Nesne;
  expect(t.kaynak?.tabloTuru).toBe('servis');
  // Tür verilmeden (eski istemci) kaydedilir: tür değişmez.
  await basarili('/platform/tablo/kaydet', { projeId, id: id.servisA, ad: 'Servis ayarları', sutunlar: [{ ad: 'BaskiTuru', eskiAd: 'BaskiTuru' }, { ad: 'Channel', eskiAd: 'Channel' }] });
  expect(((await tablolar()).find((x) => x.id === id.servisA) as Nesne).kaynak?.tabloTuru).toBe('servis');
  // Geçersiz tür: reddedilir, hiçbir şey yazılmaz.
  for (const tur of ['ekran', 'SERVIS', 7]) {
    const red = await api('/platform/tablo/kaydet', { projeId, ad: 'Yanlış tür', tur, sutunlar: [{ ad: 'A' }] });
    expect(red.basarili, String(tur)).not.toBe(true);
    expect(red.mesaj).toContain('Tablo türü geçersiz');
  }
  expect((await tablolar()).some((x) => x.ad === 'Yanlış tür')).toBe(false);
  // Var olan tablonun türü değiştirilip geri alınır.
  await basarili('/platform/tablo/kaydet', { projeId, id: id.servisB, ad: 'Servis ayarları 2', tur: 'kayit', sutunlar: [{ ad: 'BaskiTuru', eskiAd: 'BaskiTuru' }, { ad: 'Channel', eskiAd: 'Channel' }] });
  expect(((await tablolar()).find((x) => x.id === id.servisB) as Nesne).kaynak?.tabloTuru).toBe('kayit');
  await basarili('/platform/tablo/kaydet', { projeId, id: id.servisB, ad: 'Servis ayarları 2', tur: 'servis', sutunlar: [{ ad: 'BaskiTuru', eskiAd: 'BaskiTuru' }, { ad: 'Channel', eskiAd: 'Channel' }] });
  expect(((await tablolar()).find((x) => x.id === id.servisB) as Nesne).kaynak?.tabloTuru).toBe('servis');
  // tabloTuru: kayıtlı tür okunur; tür yoksa sezgi yalnız liste / kayıt der (servis kendiliğinden önerilmez).
  expect(tabloTuru({ id: 'x', ad: 'Servis ayarları', sutunlar: [{ ad: 'BaskiTuru' }], kaynak: { tabloTuru: 'servis' } })).toBe('servis');
  expect(tabloTuru({ id: 'x', ad: 'Servis ayarları', sutunlar: [{ ad: 'BaskiTuru' }, { ad: 'Channel' }] })).toBe('kayit');
  expect(tabloTuru({ id: 'x', ad: 'Servis — Kanal', sutunlar: [{ ad: 'Channel' }] })).toBe('liste');
});

test('servis analizi tablo önerisi: eşit kanıtta servis tablosu önce gelir', () => {
  const satirlar = [{ degerler: { Channel: 'K1' } }, { degerler: { Channel: 'K2' } }];
  const kayit = { id: 'k', ad: 'Kanallar', sutunlar: [{ ad: 'Channel' }], satirlar, kaynak: { tabloTuru: 'kayit' } };
  const servis = { id: 's', ad: 'Servis kanalları', sutunlar: [{ ad: 'Channel' }], satirlar, kaynak: { tabloTuru: 'servis' } };
  expect(tabloEslesmesi('Channel', ['K1'], [kayit, servis])?.tabloId).toBe('s');
  expect(tabloEslesmesi('Channel', ['K1'], [servis, kayit])?.tabloId).toBe('s');});

test('birleştirme: servis tablosu yalnız servis tablosuyla birleşir; öneriler türe göre', async () => {
  const onizle = async (kalanId: string, kaynakIdler: string[]) => (await basarili('/platform/tablo/birlestir', { projeId, kalanId, kaynakIdler, kip: 'onizle' })).onizleme as Nesne;
  let o = await onizle(id.servisA, [id.kayit]);
  expect(o.engeller).toContain('"Kayıt benzeri" bir kişi / kayıt tablosu; yalnız aynı türdeki tablolar birleştirilir.');
  o = await onizle(id.kayit, [id.servisA]);
  expect(o.engeller).toContain('"Servis ayarları" bir servis tablosu; yalnız aynı türdeki tablolar birleştirilir.');
  o = await onizle(id.servisA, [id.servisB]);
  expect(o.engeller).toEqual([]);
  const s = await basarili(`/platform/tablolar/veri-sagligi?projeId=${projeId}`);
  const oneri = (s.benzer as Nesne[]).find((x) => x.tablolar.includes(id.servisA)) as Nesne;
  expect(oneri).toMatchObject({ tur: 'servis', grup: 'birebir' });
  expect([...oneri.tablolar].sort()).toEqual([id.servisA, id.servisB].sort());
  expect((s.benzer as Nesne[]).some((x) => x.tablolar.includes(id.kayit) && x.tablolar.includes(id.servisA))).toBe(false);
});

for (const genislik of [1440, 390]) {
  test(`Test verisi sayfası (${genislik} px): "Servis verileri" grubu, seçenek metni, yeni tablo servis olarak kaydedilir; taşma yok`, async () => {
    test.setTimeout(90_000);
    const page = await sayfa(genislik);
    await page.goto('/#/veri');
    const nav = page.getByRole('navigation', { name: 'Tablolar' });
    // Gruplar aynı düzende; servis tabloları yalnız kendi grubunda.
    const servisGrubu = nav.getByRole('group', { name: 'Servis verileri' });
    await expect(servisGrubu).toContainText('Servis ayarları');
    const servisSayisi = await servisGrubu.locator('.tablo-ogesi').count();
    expect(servisSayisi).toBeGreaterThanOrEqual(2);
    await expect(nav.getByRole('button', { name: /^Servis verileri/ }).locator('.adet')).toHaveText(String(servisSayisi));
    await expect(servisGrubu).toContainText('Servis ayarları 2');
    const kayitGrubu = nav.getByRole('group', { name: 'Kişi ve kayıt verileri' });
    await expect(kayitGrubu).toContainText('Kayıt benzeri');
    await expect(kayitGrubu).not.toContainText('Servis ayarları');
    const sira = await nav.locator('.tablo-grubu.ust-grup .tablo-grubu-adi').allTextContents();
    expect(sira.at(-1)).toBe('Servis verileri');
    // Var olan servis tablosunda tür seçili.
    await servisGrubu.getByRole('button', { name: /^Servis ayarları 2 2 sütun/ }).click();
    const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
    const tur = duz.locator('fieldset.tablo-turu-secimi');
    await expect(tur.getByRole('radio', { name: /Servis tablosu/ })).toBeChecked();
    // Yeni tablo: üç seçenek; öneri (sütun sayısı / ada göre) servisi seçmez.
    await nav.getByRole('button', { name: 'Tablo ekle' }).click();
    await expect(tur.locator('legend')).toHaveText('Tablo türü — bu tablo ne tutuyor?');
    await expect(tur.getByRole('radio')).toHaveCount(3);
    const servisSecenegi = tur.locator('label.tablo-turu-secenegi').filter({ hasText: 'Servis tablosu' });
    await expect(servisSecenegi.locator('small')).toHaveText(SECENEK_METNI);
    await expect(tur.getByRole('radio', { name: /Servis tablosu/ })).not.toBeChecked();
    // Her genişlikte farklı ad / sütun ("Benzer tablo var" sorusu çıkmasın).
    const [ad, sutun] = genislik === 1440 ? ['Kanal kodları', 'Kanal no'] : ['Yazdırma türleri', 'Baskı biçimi'];
    await duz.getByLabel('Tablo adı').fill(ad);
    await duz.getByLabel(/sütunun adı/).first().fill(sutun);
    await expect(tur.getByRole('radio', { name: /Servis tablosu/ })).not.toBeChecked();
    await tur.getByRole('radio', { name: /Servis tablosu/ }).check();
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect(servisGrubu.getByRole('button', { name: new RegExp(`^${ad}`) })).toBeVisible();
    await expect.poll(async () => ((await tablolar()).find((x) => x.ad === ad) as Nesne | undefined)?.kaynak?.tabloTuru, { timeout: 15_000 }).toBe('servis');
    const tasma = await page.evaluate(() => {
      const kok = document.documentElement;
      const panel = document.querySelector('.tablo-listesi') as HTMLElement;
      const p = panel.getBoundingClientRect();
      const tasan = [...panel.querySelectorAll('.tablo-ogesi, .tablo-grubu-baslik')].filter((e) => e.getBoundingClientRect().right > p.right + 1).length;
      const secim = document.querySelector('fieldset.tablo-turu-secimi') as HTMLElement;
      return { sayfa: kok.scrollWidth - kok.clientWidth, tasan, secim: secim.scrollWidth - secim.clientWidth };
    });
    expect(tasma.sayfa, 'sayfa yatay kaymaz').toBeLessThanOrEqual(1);
    expect(tasma.tasan).toBe(0);
    expect(tasma.secim).toBeLessThanOrEqual(1);
    await page.close();
  });
}

for (const genislik of [1440, 390]) {
  test(`ekran alan bağları (${genislik} px): servis tabloları listenin sonunda ayrı grupta, seçilebilir; taşma yok`, async () => {
    test.setTimeout(90_000);
    const page = await sayfa(genislik);
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
    const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
    const sec = kart.getByLabel('Ad soyad tablo sütunu');
    await expect(sec).toBeVisible({ timeout: 20_000 });
    const gruplar = await sec.locator('optgroup').evaluateAll((l) => l.map((g) => ({ ad: g.getAttribute('label'), secenek: [...g.querySelectorAll('option')].map((o) => o.textContent) })));
    const son = gruplar.at(-1) as { ad: string; secenek: string[] };
    expect(son.ad).toBe(SERVIS_GRUBU);
    expect(son.secenek).toEqual(expect.arrayContaining(['Servis ayarları → BaskiTuru', 'Servis ayarları → Channel', 'Servis ayarları 2 → BaskiTuru']));
    // Ekran tabloları kendi gruplarında, servis tabloları onlarla karışmaz.
    expect(gruplar.slice(0, -1).map((g) => g.ad)).toEqual(expect.arrayContaining(['Kayıt benzeri', 'Kişiler']));
    expect(gruplar.slice(0, -1).some((g) => /^Servis ayarları/.test(String(g.ad)))).toBe(false);
    // Seçilebilir: bağ kaydedilir.
    await sec.selectOption(`${id.servisA}\u0001Channel`);
    await expect.poll(async () => ((await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)) as Nesne).baglar?.adSoyad?.tablo).toBe(id.servisA);
    await kart.getByLabel('Ad soyad tablo sütunu').selectOption('');
    await expect.poll(async () => ((await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)) as Nesne).baglar?.adSoyad ?? null).toBeNull();
    const tasma = await page.evaluate(() => {
      const kok = document.documentElement;
      return { sayfa: kok.scrollWidth - kok.clientWidth, bolum: [...document.querySelectorAll<HTMLElement>('.ekran-baglari')].filter((b) => b.scrollWidth > b.clientWidth + 1).length };
    });
    expect(tasma).toEqual({ sayfa: 0, bolum: 0 });
    await page.close();
  });
}
