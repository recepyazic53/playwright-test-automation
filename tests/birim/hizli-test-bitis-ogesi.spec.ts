// UÇTAN UCA (yerel) — HIZLI TEST BİTİŞ KOŞULU: basıştan sonra açılan sayfa içi pencere (modal / dialog).
//  1) Pencere içindeki bağlantı / düğme / başlık yazıları bitiş çipidir; alan etiketleri ("Ödeme planı", tablo düzeninde "Açık Hesap
//     Ödeme Planı") ve seçili liste değeri ("PEŞİN") çip değildir, Bitti önerilmez.
//  2) "Sayfada seç…" (secimAc amac 'bitis'; tıklama sayfaya iletilmez) ile sayfadaki herhangi bir yazı Bitti eklenir; "Metin yaz…" ile elle.
//  3) "Açılan pencere görününce bitti": son basışta yeni beliren pencerenin seçicisi Bitti öğesi (modelde başarı göstergesi tur 'eleman');
//     doğrulama koşusu ve normal koşu öğe görününce başarılı, pencere açılmazsa "Bitiş mesajı görülmedi" ile başarısız.
//  Arayüz (1440 px): bitiş adımında yeni düğmeler görünür; "Metin yaz…" ile eklenen metin listeye gelir.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (hizli-test-bitis-fikstur.ts; NOBETCI_TARAMA_IZINLI_KOKENLER), geçici veritabanı, ayrı Nöbetçi
// örneği; veri/ klasörüne dokunulmaz. Değerler uydurmadır.
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { bitisKosulu, bitisiUygula } from '../../scripts/platform/hizli-test/akis.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { TalepUygulamasi } from './hizli-test-bitis-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Bitis-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let uygulama: TalepUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ortamId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
/** Oturum durumu. Keşif toplu sorusu (sayfadaki emin olunmayan düğmeler) bu testin konusu değil: "Hiçbirine basma" ile geçilir. */
const oturum = async (id: string): Promise<Nesne> => {
  for (;;) {
    const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
    if (o?.durum !== 'kesifOnay') return o;
    await api('/platform/hizli-test/onay', { id, cevap: false });
  }
};
async function bekle(id: string, durumlar: string[], sn = 90): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const o = await oturum(id);
    if (durumlar.includes(o.durum)) return o;
    if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.is)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}
async function isBitsin(): Promise<void> {
  for (const son = Date.now() + 30_000; Date.now() < son; await new Promise((c) => setTimeout(c, 250))) {
    if (!(await api('/platform/tarama/aktif')).is) return;
  }
  throw new Error('tarayıcı işi bitmedi');
}
/** Hızlı test tarayıcısına (başsız, alt süreç; yerel uzaktan hata ayıklama portu) bağlanıp talep sayfasını bulur. */
async function hizliSayfa(): Promise<{ tarayici: Browser; sayfa: Page }> {
  const son = Date.now() + 60_000;
  let tarayici: Browser | null = null;
  while (!tarayici) {
    try { tarayici = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error('hızlı test tarayıcısına bağlanılamadı');
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const sayfa = tarayici.contexts().flatMap((b) => b.pages()).find((p) => p.url().includes('/talep/'));
    if (sayfa) return { tarayici, sayfa };
    if (Date.now() > son) throw new Error('talep sayfası bulunamadı');
    await new Promise((c) => setTimeout(c, 250));
  }
}

/** Talep al'a basılıp pencere açılana kadar sürer; bitiş adımındaki oturumu döner. */
async function bitiseKadar(ekranAdi: string): Promise<{ id: string; o: Nesne }> {
  await isBitsin();
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/talep/', ekranAdi, izin: 'evet', cumle: 'Talep al\'a bas' })).id);
  let o = await bekle(id, ['veri']);
  const plaka = String(o.soru.alanlar.find((a: Nesne) => a.etiket === 'Plaka').anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [plaka]: { deger: '34 ABC 123', kaynak: 'elle' } } });
  // Evet + tek aday: "Talep al" basılır; pencere açılınca içindeki liste yeni alan olarak sorulur (boş bırakılır).
  o = await bekle(id, ['veri', 'karar']);
  if (o.durum === 'veri') { await basarili('/platform/hizli-test/veri', { id, degerler: {} }); o = await bekle(id, ['karar']); }
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  return { id, o };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'hizli-bitis-'));
  uygulama = new TalepUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  cdpPortu = await bosPort();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_KAYIT_CDP_PORTU: String(cdpPortu), NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Bitiş Öğesi Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('saf kurallar: bitiş öğesi tek başına yeterli; modele "eleman" göstergesi (metin / adresle "veya") yazılır', () => {
  const yalniz = bitisKosulu({ etiketler: { 'Tutar 300,00 TL': null }, ogeler: [{ secici: 'role=dialog[name="Talep özeti"]', metin: 'Talep özeti' }] });
  expect(yalniz.hatalar).toEqual([]);
  expect(yalniz.ogeler).toEqual([{ secici: 'role=dialog[name="Talep özeti"]', metin: 'Talep özeti' }]);
  expect(bitisKosulu({ etiketler: {} }).hatalar.join(' ')).toMatch(/En az bir metni “Bitti” etiketleyin/);
  const model = { adimlar: [{ id: 'a', kosu: {} }] };
  bitisiUygula(model, { bitti: [], devam: [], adres: null, ogeler: [{ secici: '#pencere' }] });
  expect(model.adimlar[0].kosu).toMatchObject({ basariGostergesi: { tur: 'eleman', deger: '#pencere' }, bitisKosulu: { devam: [] } });
  const ikili = { adimlar: [{ id: 'a', kosu: {} }] };
  bitisiUygula(ikili, { bitti: ['Talep'], devam: [], adres: null, ogeler: [{ secici: '#pencere', cerceve: ['iframe#c'] }] });
  expect(ikili.adimlar[0].kosu).toMatchObject({ basariGostergesi: { tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Talep' }, { tur: 'eleman', deger: '#pencere', cerceve: ['iframe#c'] }] } });
});

test('pencere içi metinler: bağlantı / düğme / başlık çipte; alan etiketi ve seçili değer yok; "Açılan pencere görününce bitti" → doğrulama ve normal koşu başarılı', async () => {
  test.setTimeout(300_000);
  const { id, o: bitisOturumu } = await bitiseKadar('Talep penceresi');
  let o = bitisOturumu;
  expect(uygulama.talepler.length).toBeGreaterThanOrEqual(1);
  const metinler = (o.soru.gorulenler as Nesne[]).map((g) => g.metin);
  for (const m of ['KREDİ KARTI İLE TAMAMLA', 'TAMAMLA', 'Talep özeti', 'Tutar 300,00 TL']) expect(metinler, JSON.stringify(metinler)).toContain(m);
  for (const m of ['Ödeme planı', 'PEŞİN', 'Açık Hesap Ödeme Planı', 'Seçiniz']) expect(metinler, JSON.stringify(metinler)).not.toContain(m);
  // Ayraçlı paragraf bağlantıları birleştirmez; alan etiketi varsayılan Bitti önerilmez (hiç çip değil).
  expect(metinler.some((m) => m.includes('·'))).toBe(false);
  expect(Object.entries(o.soru.etiketler as Record<string, string | null>).filter(([, e]) => e === 'bitti').map(([m]) => m)).not.toContain('Açık Hesap Ödeme Planı');
  // Bağlantılar yalnız çip: hiçbirine tıklanmadı.
  expect(uygulama.baglantilar).toEqual([]);
  // Açılan pencere önerisi (son basışta yeni beliren dialog; tek başına bulunan seçici).
  expect(o.soru.pencereOnerisi).toMatchObject({ metin: 'Talep özeti' });
  const secici = String(o.soru.pencereOnerisi.secici);
  // Elle metin: listede olmayan metin Bitti eklenir (kaynak elle); sonra kullanıcı etiketi kaldırır.
  await basarili('/platform/hizli-test/bitis-ekle', { id, metin: 'Sözleşme hazır', etiket: 'bitti' });
  o = await bekle(id, ['bitis']);
  expect((o.soru.gorulenler as Nesne[]).find((g) => g.metin === 'Sözleşme hazır')).toMatchObject({ kaynak: 'elle' });
  expect(o.soru.etiketler['Sözleşme hazır']).toBe('bitti');
  expect(await api('/platform/hizli-test/bitis-ekle', { id, metin: '   ' })).toMatchObject({ basarili: false, kod: 'BITIS' });
  // "Açılan pencere görününce bitti": öğe eklenir, öneri kalkar.
  await basarili('/platform/hizli-test/bitis-ekle', { id, pencere: true });
  o = await bekle(id, ['bitis']);
  expect(o.soru.ogeler).toEqual([{ secici, metin: 'Talep özeti', kaynak: 'pencere', secili: true }]);
  expect(o.soru.pencereOnerisi).toBeNull();
  // Metin seçmeden bitiş: tüm metin etiketleri kaldırılır, yalnız öğe Bitti.
  const etiketsiz = Object.fromEntries(Object.keys(o.soru.etiketler).map((m) => [m, null]));
  // Öğe seçili değilse ve Bitti metni yoksa kaydedilmez.
  expect(await api('/platform/hizli-test/bitis', { id, etiketler: etiketsiz, ogeler: [] })).toMatchObject({ basarili: false, kod: 'BITIS' });
  o = await bekle(id, ['bitis']);
  await basarili('/platform/hizli-test/bitis', { id, etiketler: etiketsiz, ogeler: [secici] });
  o = await bekle(id, ['kaydet']);
  expect(o.soru.ozet.bitis).toMatchObject({ bitti: [], ogeler: [{ secici, metin: 'Talep özeti' }] });
  // Doğrulama koşusu: sayfa yeniden açılır, Talep al basılır, pencere görününce başarılı.
  const once = uygulama.talepler.length;
  await basarili('/platform/hizli-test/dogrula', { id });
  o = await bekle(id, ['kaydet'], 120);
  expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili', mesaj: expect.stringContaining('Bitiş öğesi göründü') });
  expect(uygulama.talepler.length).toBe(once + 1);
  const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Talep penceresi açılır' })).ozet as Nesne;
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Talep penceresi açılır', secim: oz.secim });
  expect(k).toMatchObject({ kaydedildi: true, dogrulandi: true });
  await isBitsin();
  // Model: son adımın başarı göstergesi "eleman" (seçici görünür olunca bitti).
  const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
  const son = model.adimlar[model.adimlar.length - 1];
  expect(son.kosu.basariGostergesi).toEqual({ tur: 'eleman', deger: secici });
  // Normal koşu: pencere görününce başarılı; pencere açılmazsa (sessiz) "Bitiş mesajı görülmedi" ile başarısız.
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: k.senaryoId, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  try {
    uygulama.kip = 'sessiz';
    const z = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: k.senaryoId, ortamId });
    const zs = (await api(`/platform/sonuclar/sonuc?id=${String(z.sonucId)}`)).sonuc as Nesne;
    expect(zs.durum).toBe('basarisiz');
  } finally {
    uygulama.kip = 'normal';
  }
  expect(uygulama.baglantilar).toEqual([]);
});

test('"Sayfada seç…": tarayıcıda tıklanan yazı Bitti eklenir (tıklama sayfaya iletilmez); "Şu öğe görününce bitti…" seçiciyi öğe yapar; Vazgeç bitişe döner', async () => {
  test.setTimeout(300_000);
  const { id } = await bitiseKadar('Talep seçim');
  // Metin seçimi: listede olmayan (basıştan önce de görünen) açıklama yazısı.
  await basarili('/platform/hizli-test/bitis-sec', { id, tur: 'metin', etiketler: {} });
  let o = await bekle(id, ['bitisSecim']);
  expect(o.soru).toEqual({ tur: 'bitisSecim', secimTuru: 'metin' });
  let { tarayici, sayfa } = await hizliSayfa();
  try {
    await expect(sayfa.locator('#nobetci-hizli-secim')).toBeAttached();
    await sayfa.click('#aciklama');
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  o = await bekle(id, ['bitis']);
  const secilen = (o.soru.gorulenler as Nesne[]).find((g) => g.metin === 'Plaka bilgisini yazıp talep alın.');
  expect(secilen).toMatchObject({ kaynak: 'secim', onceGorundu: true });
  expect(o.soru.etiketler['Plaka bilgisini yazıp talep alın.']).toBe('bitti');
  // Öğe seçimi: bağlantıya tıklanır — tıklama sayfaya gitmez (sayaç 0), bağlantının seçicisi Bitti öğesi olur.
  await basarili('/platform/hizli-test/bitis-sec', { id, tur: 'oge', etiketler: o.soru.etiketler });
  o = await bekle(id, ['bitisSecim']);
  ({ tarayici, sayfa } = await hizliSayfa());
  try {
    await expect(sayfa.locator('#nobetci-hizli-secim')).toBeAttached();
    await sayfa.click('#tamamla');
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  o = await bekle(id, ['bitis']);
  expect(uygulama.baglantilar).toEqual([]);
  expect(o.soru.ogeler).toHaveLength(1);
  expect(o.soru.ogeler[0]).toMatchObject({ metin: 'TAMAMLA', kaynak: 'secim', secili: true });
  // Etiketler seçim boyunca korunur.
  expect(o.soru.etiketler['Plaka bilgisini yazıp talep alın.']).toBe('bitti');
  // Vazgeç: şerit kapanır, bitiş adımına dönülür.
  await basarili('/platform/hizli-test/bitis-sec', { id, tur: 'metin' });
  await bekle(id, ['bitisSecim']);
  await basarili('/platform/hizli-test/bitis-sec', { id, vazgec: true });
  o = await bekle(id, ['bitis']);
  expect(o.soru.ogeler).toHaveLength(1);
  // Öğe çıkarılır.
  await basarili('/platform/hizli-test/bitis-ekle', { id, oge: o.soru.ogeler[0].secici, sil: true });
  o = await bekle(id, ['bitis']);
  expect(o.soru.ogeler).toEqual([]);
  await basarili('/platform/hizli-test/iptal', { id });
});

test('arayüz (1440 px): bitiş adımında "Açılan pencere görününce bitti", "Sayfada seç…", "Şu öğe görününce bitti…", "Metin yaz…"; elle metin listeye eklenir', async () => {
  test.setTimeout(300_000);
  const { id } = await bitiseKadar('Talep arayüz');
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/hizli-test/o/${id}`);
    const soru = page.locator('.hizli-soru');
    await expect(soru.getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible({ timeout: 30_000 });
    await expect(soru.locator('.hizli-cip', { hasText: 'KREDİ KARTI İLE TAMAMLA' })).toBeVisible();
    await expect(soru.locator('.hizli-cip', { hasText: /^PEŞİN$/ })).toHaveCount(0);
    await expect(soru.getByRole('button', { name: /Açılan pencere görününce bitti: “Talep özeti”/ })).toBeVisible();
    await expect(soru.getByRole('button', { name: 'Sayfada seç…' })).toBeVisible();
    await expect(soru.getByRole('button', { name: 'Şu öğe görününce bitti…' })).toBeVisible();
    await soru.getByRole('button', { name: 'Metin yaz…' }).click();
    await soru.getByLabel(/Metin yaz/).fill('Sözleşme hazır');
    await soru.getByRole('button', { name: 'Ekle', exact: true }).click();
    const satir = soru.locator('.hizli-bitis-satiri', { hasText: 'Sözleşme hazır' });
    await expect(satir).toBeVisible();
    await expect(satir).toContainText('elle yazıldı');
    await expect(satir.getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true');
    // Açılan pencere: öğe listesine gelir (işaretli); Devam et ile kaydet adımına geçilir.
    await soru.getByRole('button', { name: /Açılan pencere görününce bitti/ }).click();
    await expect(soru.locator('.hizli-bitis-oge')).toContainText('Talep özeti');
    await expect(soru.locator('.hizli-bitis-oge input[type="checkbox"]')).toBeChecked();
    // Taşma yok.
    const tasma = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(tasma).toBeLessThanOrEqual(0);
    const goruntu = test.info().outputPath('bitis-sayfada-sec-oge-1440.png');
    await page.screenshot({ path: goruntu, fullPage: true });
    if (process.env.GORUNTU_KLASORU) { mkdirSync(process.env.GORUNTU_KLASORU, { recursive: true }); copyFileSync(goruntu, join(process.env.GORUNTU_KLASORU, 'bitis-sayfada-sec-oge-1440.png')); }
    await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
    await expect(page.locator('.hizli-soru').getByText(/öğesi görünür/)).toBeVisible({ timeout: 30_000 });
    expect(hatalar).toEqual([]);
    await baglam.close();
  } finally {
    await tarayici.close();
    await api('/platform/hizli-test/iptal', { id });
  }
});
