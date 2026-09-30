// ENTEGRASYON (yerel) — Ortak akışın ekranla AYNI yollarla oluşturulması ve yönetilmesi:
//   "Ekran ekle"de "Ne oluşturulsun? ◉ Ekran ○ Ortak akış" (varsayılan Ekran: bugünkü davranış korunur); Ortak akış seçilince
//   paket yükle, "Ekranı tara" (sayfa ekle / analiz) ve "Akışı kaydet" sonucu "Ortak akışlar" altına ortak akış olarak kaydedilir
//   (ekran adresi yazılmaz, senaryo eklenmez, ekranlara otomatik eklenmez). "Boş başla": adımsız ortak akış; adımları diyagramdan
//   elle tanımlanan alan / düğmeyle eklenir. Ortak akışın Test verisi sekmesi (tablo bağı + satır etiketi).
// Uygulama 127.0.0.1'deki sahte örnek başvuru fikstürüdür (girişsiz /acik-siparis/ sayfası); geçici veritabanı ve AYRI Nöbetçi örneği.
// Kayıt tarayıcısına yerel uzaktan hata ayıklama portundan bağlanılır (kullanıcının yerini test alır). Dış siteye istek gitmez.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { ortakAkisPaketineCevir, sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { elleOgeleriEkle } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { OrnekBasvuruUygulamasi, ornekBasvuruPaketi } from './model-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const PAROLA = `Gecici-OrtakOlustur-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let tarayici: Browser;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ekranId = '';
let ortamId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
async function ekranlar(): Promise<Nesne[]> {
  return (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
}
async function ekran(id: string): Promise<Nesne> {
  return api(`/platform/ekran?projeId=${projeId}&id=${encodeURIComponent(id)}`);
}
/** Ekranın paketi, başka anahtar / adla (aynı model). */
function paket(anahtar: string, ad: string): Nesne {
  const p = ornekBasvuruPaketi() as Nesne;
  p.meta.ekran = { ...p.meta.ekran, anahtar, ad };
  p.model = { ...p.model, id: anahtar, ad };
  return p;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'ortak-akis-olustur-'));
  uygulama = new OrnekBasvuruUygulamasi({ totp: false });
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  cdpPortu = await bosPort();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_KAYIT_CDP_PORTU: String(cdpPortu), NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '240'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Ortak Akış Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function sayfa(genislik = 1440): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1100 }, colorScheme: 'dark' });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}
/** Nöbetçi arayüzü yalnız Nöbetçi'ye (ve data: adreslerine) istek atar. */
function agKontrol(istekler: string[]): void {
  expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
}
const yukle = (page: Page, p: Nesne, ad = 'paket.json') =>
  page.locator('#paket-dosyasi').setInputFiles({ name: ad, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });

test('saf: ekran paketi ortak akış paketine çevrilir (adres / spec / senaryo / beklenen sonuç yok) ve geçerlidir; elle alan / düğme envantere eklenir', () => {
  const p = ortakAkisPaketineCevir(paket('saf-ortak', 'Saf ortak')) as Nesne;
  expect(p.model).toMatchObject({ tur: 'ortakAkis', semaSurumu: 2, id: 'saf-ortak' });
  for (const k of ['ekranUrl', 'specDosyasi', 'pageObject']) expect(p.model[k], k).toBeUndefined();
  expect(p.meta.ekran.urlYolu).toBeUndefined();
  expect(p.senaryoOnerileri).toEqual([]);
  expect((p.model.senaryoDuzeyi.alanlar as Nesne[]).some((a) => a.tip === 'birlesim')).toBe(false);
  expect(sayfaPaketiniDogrula(p).hatalar).toEqual([]);
  // Zaten ortak akış olan paket aynen döner.
  expect(ortakAkisPaketineCevir(p)).toBe(p);
  const env = { kip: 'kayit' as const, bicim: 'akis' as const, profil: null, baslik: '', alanlar: [], dugmeler: [], mesajlar: [], olaylar: [], engellenenler: [], notlar: [] };
  const e = elleOgeleriEkle(env, { alanlar: [{ anahtar: 'elle-1', etiket: 'Not', tur: 'text', secici: '#not' }], dugmeler: [{ metin: 'Onayla', secici: '#onayla' }] });
  expect(e.hatalar).toEqual([]);
  expect(e.envanter.alanlar.map((a) => [a.alan.anahtar, a.alan.secici, a.secili])).toEqual([['elle-1', '#not', true]]);
  expect(e.envanter.dugmeler).toEqual([{ secici: '#onayla', metin: 'Onayla' }]);
  // Hatalı öğe (adres seçici, tekrarlı anahtar): envanter değişmez.
  const h = elleOgeleriEkle(env, { alanlar: [{ anahtar: 'elle-1', etiket: 'A', tur: 'text', secici: 'https://ornek.invalid/' }, { anahtar: 'elle-1', etiket: 'B', tur: 'text', secici: '#b' }] });
  expect(h.hatalar.length).toBeGreaterThan(0);
  expect(h.envanter).toBe(env);
});

test('varsayılan Ekran: onay kutusu / ortak akış seçimi yok; önde tara / kaydet, yapay zekâ görünür bölümde; paket yeni EKRAN olur (senaryo önerileri ve ortamlar — bugünkü davranış)', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await sayfa();
  await page.goto('/#/ekranlar/yeni');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Ekran ekle');
  // En üstte paket yükleme; altında tek satırda tara / hızlı test, kaydet ve yapay zekâ kutusu.
  await expect(page.locator('section.ekleme-secenekleri .ekleme-kutusu h3')).toHaveText(['Ekranı tara / hızlı test', 'Akışı kaydet', 'Yapay zekâ ile oluştur']);
  await expect(page.locator('section.ileri-duzey-bolumu')).toBeVisible();
  // Sunucu varsayılanı da ekran: seçim gönderilmezse paket ekran olarak önizlenir.
  const o = await basarili('/platform/sayfa-paketi/onizle', { projeId, paket: paket('ornek-basvuru', 'Örnek Başvuru') });
  expect((o.onizleme as Nesne).modelTuru).toBe('ekran');
  await yukle(page, paket('ornek-basvuru', 'Örnek Başvuru'));
  await expect(page.getByRole('heading', { name: /Senaryo önerileri/ })).toBeVisible();
  await expect(page.getByText('Senaryoların ortamları')).toBeVisible();
  await page.getByRole('button', { name: 'Ekranı oluştur' }).click();
  await expect(page).toHaveURL(/\/ekranlar\/e\/[^/]+$/);
  const e = (await ekranlar()).find((x) => x.anahtar === 'ornek-basvuru') as Nesne;
  expect(e.modelTuru).toBe('ekran');
  ekranId = String(e.id);
  expect((await ekran(ekranId)).model.ekranUrl).toBe('/basvuru/');
  agKontrol(istekler);
  await page.close();
});

test('paket yükle → eski ortak akış bağlantısı (geriye uyum; arayüzde bağlantısı yok): adres başlığı belirler, önde ilk kutu "Boş başla" (ad kutusunun görünür etiketi var); önizlemede senaryo / ortam yok, "Ortak akışı oluştur" Ortak akışlar altına yazar', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await sayfa();
  await page.goto('/#/ekranlar/yeni/ortak-akis');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Ortak akış ekle');
  await expect(page.locator('section.ekleme-secenekleri .ekleme-kutusu h3')).toHaveText(['Boş başla', 'Ekranı tara', 'Akışı kaydet', 'Yapay zekâ ile oluştur']);
  // Aynı adres yeniden açılınca yine ortak akış eklenir (sol menüde artık "Ortak akış ekle" bağlantısı yoktur).
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Ortak akış ekle');
  await yukle(page, paket('paket-ortak', 'Paketten ortak'));
  const olustur = page.getByRole('button', { name: 'Ortak akışı oluştur' });
  await expect(olustur).toBeVisible();
  await expect(page.getByRole('heading', { name: /Senaryo önerileri/ })).toHaveCount(0);
  await expect(page.getByText('Senaryoların ortamları')).toHaveCount(0);
  await expect(page.getByText(/paketteki senaryo önerileri eklenmez/)).toBeVisible();
  await olustur.click();
  await expect(page).toHaveURL(/\/ekranlar\/e\/[^/]+\/akis$/);
  // Bildirim ekranlara ekleme yolunu söyler; ekleme otomatik yapılmaz.
  await expect(page.getByText(/“Paketten ortak” ortak akışı oluşturuldu.*Ekranlara ekle…/)).toBeVisible();
  const e = (await ekranlar()).find((x) => x.anahtar === 'paket-ortak') as Nesne;
  expect(e).toMatchObject({ modelTuru: 'ortakAkis', senaryoSayisi: 0, kullananSayisi: 0 });
  const d = await ekran(String(e.id));
  expect(d.model.tur).toBe('ortakAkis');
  expect(d.model.ekranUrl).toBeUndefined();
  // Ortak akışın sayfası: Kullanan ekranlar + Ekranlara ekle… (ekran sayfasıyla aynı sekmeler).
  await expect(page.getByRole('tab')).toHaveText([/^Model/, /^Model geçmişi/, /^Kanıtlar/, /^Akışlar/, /^Test verisi/]);
  await expect(page.getByText('Henüz hiçbir ekranın akışında yok.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekranlara ekle…' })).toBeEnabled();
  await expect(page.locator('.sayfa-basligi .meta')).toContainText('henüz hiçbir ekranda kullanılmıyor');
  // Yönetim: ortak akış kartında ekran kartındaki gibi ⋯ menüsü (URL yolu yok).
  await page.goto('/#/ekranlar');
  const kart = page.locator('article.ortak-akis-karti').filter({ hasText: 'Paketten ortak' });
  await kart.getByRole('button', { name: 'Ekran işlemleri: Paketten ortak' }).click();
  await expect(kart.getByRole('menuitem', { name: 'Yeniden adlandır' })).toBeVisible();
  await expect(kart.getByRole('menuitem', { name: 'Düzenle (URL yolu)' })).toBeDisabled();
  await page.keyboard.press('Escape');
  agKontrol(istekler);
  await page.close();
});

/** Kayıt tarayıcısına bağlanır ve panelin açıldığı hedef sayfayı bulur. */
async function kayitSayfasi(isId: string, yolParcasi: string): Promise<{ kayitTarayicisi: Browser; hedef: Page }> {
  const son = Date.now() + 60_000;
  let kayitTarayicisi: Browser | null = null;
  while (!kayitTarayicisi) {
    try { kayitTarayicisi = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error('kayıt tarayıcısına bağlanılamadı');
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const d = (await api(`/platform/tarama/durum?id=${isId}`)).is as Nesne;
    const hedef = kayitTarayicisi.contexts().flatMap((b) => b.pages()).find((p) => p.url().includes(yolParcasi));
    if (hedef && d.adimlar.find((a: Nesne) => a.anahtar === 'kayit')?.mesaj?.startsWith('Tarayıcıda akışı yürütün')) return { kayitTarayicisi, hedef };
    if (d.durum !== 'suruyor' || Date.now() > son) throw new Error(`kayıt sayfası açılmadı: ${JSON.stringify(d)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}

test('Akışı kaydet → Ortak akış (sahte uygulamada): diyalog yeni ortak akışı sorar; kayıt diyagramı "yeni ortak akış", önizleme ortak akış paketi, sonuç Ortak akışlar altında', async () => {
  test.setTimeout(240_000);
  const { page, istekler } = await sayfa();
  await page.goto('/#/ekranlar/yeni/ortak-akis');
  await page.locator('.kaydet-kutusu').getByRole('button', { name: 'Akışı kaydet' }).click();
  const d = page.locator('dialog[open]');
  await expect(d.getByRole('heading', { name: 'Yeni ortak akış: akışı kaydet' })).toBeVisible();
  await d.getByLabel('Yeni ortak akışın adı').fill('Kayıtlı ortak');
  await d.getByLabel('Başlangıç sayfası').fill('/acik-siparis/');
  await d.getByText('Giriş yapmadan aç', { exact: true }).click();
  await d.getByText('Anladım; bastığım düğmeler siteye gerçek istek gönderecek.').click();
  await d.getByRole('button', { name: 'Kaydı başlat' }).click();
  await expect(page).toHaveURL(/#\/ekranlar\/tarama\//);
  const isId = decodeURIComponent(page.url().split('/tarama/')[1]);
  expect((await api(`/platform/tarama/durum?id=${isId}`)).is).toMatchObject({ kip: 'kayit', mod: 'yeni', olusturulacak: 'ortakAkis' });
  const { kayitTarayicisi, hedef } = await kayitSayfasi(isId, '/acik-siparis/');
  try {
    const panel = hedef.locator('#nobetci-kayit-paneli');
    await expect(panel.getByRole('group', { name: 'Görülen alanlar' })).toContainText('Ad Soyad');
    await hedef.fill('#musteriAd', 'Kayit Deneme');
    await hedef.check('input[name="tip"][value="kurumsal"]');
    await hedef.fill('#vergiNo', 'VKN-Deneme');
    await hedef.click('#devam');
    await hedef.selectOption('#teslimat', 'dar');
    await hedef.click('#kaydet');
    await expect(hedef.locator('#siparis-sonuc')).toContainText('Siparis oluşturuldu');
    await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
    await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
  } finally {
    await kayitTarayicisi.close().catch(() => undefined);
  }
  // Diyagram: kayıttan taslak (alan gruplarına ad ver, son mesajı ekle) — taslak olarak saklanır, arayüz onu açar.
  let durum = (await api(`/platform/tarama/durum?id=${isId}`)).is as Nesne;
  for (const son = Date.now() + 30_000; durum.durum === 'suruyor' && Date.now() < son; durum = (await api(`/platform/tarama/durum?id=${isId}`)).is as Nesne) await new Promise((c) => setTimeout(c, 250));
  expect(durum).toMatchObject({ durum: 'tamam', tasarim: true, olusturulacak: 'ortakAkis' });
  const akis = await api(`/platform/tarama/akis?id=${isId}`);
  expect(akis.olusturulacak).toBe('ortakAkis');
  const b = akis.bloklar as Nesne[];
  let n = 0;
  const tasarim = [...b.slice(0, -1).map((x) => (x.tur === 'alanlar' && !x.ad ? { ...x, ad: `Adım ${++n}` } : x)), { tur: 'mesaj', mesaj: null, metin: 'Siparis oluşturuldu' }, b[b.length - 1]];
  await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim, taslak: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Akış diyagramı: Kayıtlı ortak' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.sayfa-basligi').getByText('yeni ortak akış')).toBeVisible();
  await page.getByRole('button', { name: 'Kaydet ve önizle' }).click();
  const olustur = page.getByRole('button', { name: 'Ortak akışı oluştur' });
  await expect(olustur).toBeVisible({ timeout: 20_000 });
  await olustur.click();
  await expect(page).toHaveURL(/\/ekranlar\/e\/[^/]+\/akis$/);
  const e = (await ekranlar()).find((x) => x.ad === 'Kayıtlı ortak') as Nesne;
  expect(e).toMatchObject({ modelTuru: 'ortakAkis', senaryoSayisi: 0 });
  const m = (await ekran(String(e.id))).model as Nesne;
  expect(m.tur).toBe('ortakAkis');
  for (const k of ['ekranUrl', 'specDosyasi', 'pageObject', 'akislar']) expect(m[k], k).toBeUndefined();
  const seciciler = (m.adimlar as Nesne[]).flatMap((a) => (a.bolumler ?? []).flatMap((x: Nesne) => x.alanlar.map((y: Nesne) => y.konum?.secici)));
  expect(seciciler).toEqual(expect.arrayContaining(['#musteriAd', '#teslimat']));
  // Kayıt kullanıcının yürüttüğü tek siparişi gönderdi; ekranlara eklenmedi.
  expect(uygulama.acikSiparisler).toHaveLength(1);
  expect((await ekranlar()).find((x) => x.id === ekranId)?.adimSayisi).toBe(3);
  agKontrol(istekler);
  await page.close();
});

test('Ekranı tara (sayfa ekle / analiz) → Ortak akış (sahte uygulamada): tarama diyaloğu yeni ortak akışı sorar; sonuç ortak akış (ekran adresi yok)', async () => {
  test.setTimeout(180_000);
  const { page, istekler } = await sayfa();
  await page.goto('/#/ekranlar/yeni/ortak-akis');
  await page.locator('.tara-kutusu').getByRole('button', { name: 'Ekranı tara' }).click();
  const d = page.locator('dialog[open]');
  await expect(d.getByRole('heading', { name: 'Yeni ortak akış: sayfayı otomatik tara' })).toBeVisible();
  await d.getByLabel('Yeni ortak akışın adı').fill('Taranan ortak');
  await d.getByLabel('Taranacak sayfa').fill('/acik-siparis/');
  await d.getByText('Giriş yapmadan aç', { exact: true }).click();
  await d.getByRole('checkbox', { name: /Açılır listeleri keşfet/ }).uncheck();
  await d.getByText('Anladım; seçilen ortama bağlanılsın.').click();
  await d.getByRole('button', { name: 'Taramayı başlat' }).click();
  await expect(page).toHaveURL(/#\/ekranlar\/tarama\//);
  const olustur = page.getByRole('button', { name: 'Ortak akışı oluştur' });
  await expect(olustur).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('heading', { name: /Senaryo önerileri/ })).toHaveCount(0);
  await olustur.click();
  await expect(page).toHaveURL(/\/ekranlar\/e\/[^/]+\/akis$/);
  const e = (await ekranlar()).find((x) => x.ad === 'Taranan ortak') as Nesne;
  expect(e.modelTuru).toBe('ortakAkis');
  const m = (await ekran(String(e.id))).model as Nesne;
  expect(m.ekranUrl).toBeUndefined();
  expect((m.adimlar as Nesne[]).length).toBeGreaterThan(0);
  // Mevcut ekrana "Ortak akış" seçimi uygulanmaz (tarayıcı açılmadan red).
  expect(await api('/platform/tarama/baslat', { projeId, ekranId, ortamId, hedef: '/basvuru/', girissiz: true, olusturulacak: 'ortakAkis', onay: true }))
    .toMatchObject({ basarili: false, kod: 'OLUSTURMA' });
  agKontrol(istekler);
  await page.close();
});

test('Boş başla → diyagramdan sıfırdan adım (elle alan + elle düğme + beklenen mesaj) → kaydet; Ekranlara ekle açılır; Test verisi sekmesinde bağ ve satır etiketi', async () => {
  test.setTimeout(120_000);
  const { page, istekler } = await sayfa();
  await page.goto('/#/ekranlar/yeni/ortak-akis');
  const kutu = page.locator('.bos-basla-kutusu');
  await kutu.getByRole('button', { name: 'Boş ortak akış oluştur' }).click();
  await expect(kutu.getByText('Ortak akışın adını yazın.')).toBeVisible();
  await kutu.getByLabel('Ortak akışın adı').fill('Onay adımları');
  await kutu.getByRole('button', { name: 'Boş ortak akış oluştur' }).click();
  await expect(page).toHaveURL(/\/ekranlar\/e\/[^/]+\/akis$/);
  const ortakId = decodeURIComponent(page.url().split('/e/')[1].split('/')[0]);
  expect((await ekranlar()).find((x) => x.id === ortakId)).toMatchObject({ modelTuru: 'ortakAkis', modelSurumu: 1, adimSayisi: 0 });
  await expect(page.getByText('Bu ortak akışın henüz adımı yok.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekranlara ekle…' })).toBeDisabled();
  // Boş ortak akış ekranlara eklenmez (sunucu da reddeder).
  expect(await api('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [ekranId] })).toMatchObject({ basarili: false });

  await page.getByRole('button', { name: 'Diyagramdan adım ekle' }).click();
  await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
  await expect(page.getByText(/Bu diyagram ortak akışın akışıdır/)).toBeVisible();
  // Ortak akışın içine ortak akış eklenmez.
  await page.getByRole('button', { name: 'Buraya blok ekle' }).first().click();
  const menu = page.getByRole('group', { name: 'Eklenecek blok' });
  await expect(menu.getByRole('button', { name: 'Ortak akış' })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Alan grubu' }).click();
  await page.getByLabel('Adım adı').fill('Onay');
  // Sağ listede olmayan alan: elle (etkin gruba eklenir).
  const palet = page.locator('aside[aria-label="Kayıtta yakalananlar"]');
  await palet.getByText('Listede olmayan alanı elle ekle').click();
  await palet.getByLabel('Elle alan etiketi').fill('Onay notu');
  await palet.getByLabel('Elle alan seçicisi').fill('#onay-notu');
  await palet.getByRole('button', { name: 'Alanı ekle' }).click();
  await expect(page.getByRole('list', { name: 'Doldurulacak alanlar' })).toContainText('Onay notu');
  // Elle düğme: aksiyon bloğu olarak eklenir.
  await palet.getByRole('tab', { name: /Düğmeler/ }).click();
  await palet.getByText('Listede olmayan düğmeyi elle ekle').click();
  await palet.getByLabel('Elle düğme yazısı').fill('Onayla');
  await palet.getByLabel('Elle düğme seçicisi').fill('https://ornek.invalid/');
  await palet.getByRole('button', { name: 'Düğmeyi ekle' }).click();
  await expect(palet.getByText('Adres değil, sayfadaki öğenin seçicisini yazın.')).toBeVisible();
  await palet.getByLabel('Elle düğme seçicisi').fill('#onayla');
  await palet.getByRole('button', { name: 'Düğmeyi ekle' }).click();
  await expect(page.getByRole('combobox', { name: 'Basılacak düğme' })).toHaveValue('0');
  // Beklenen mesaj: Bitir'den hemen önce.
  const ekle = page.getByRole('button', { name: 'Buraya blok ekle' });
  await ekle.nth(await ekle.count() - 1).click();
  await page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'Beklenen mesaj' }).click();
  await page.getByLabel('Aranacak metin').fill('Onay tamam');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  const onay = page.locator('dialog[open]');
  await expect(onay).toContainText('Bu ortak akışı kullanan ekran yok.');
  await onay.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page).toHaveURL(/\/akis\/ana$/);
  const m = (await ekran(ortakId)).model as Nesne;
  expect(m.tur).toBe('ortakAkis');
  const adim = (m.adimlar as Nesne[])[0];
  expect(adim.baslik).toBe('Onay');
  const alanlar = (adim.bolumler as Nesne[]).flatMap((x) => x.alanlar) as Nesne[];
  expect(alanlar.find((a) => a.konum?.secici === '#onay-notu')).toMatchObject({ yapilandirma: 'senaryo' });
  expect(adim.kosu.aksiyonlar).toEqual([expect.objectContaining({ tur: 'tikla', secici: '#onayla' })]);
  expect(adim.kosu.basariGostergesi).toMatchObject({ tur: 'metin', deger: 'Onay tamam' });
  await expect(page.getByRole('button', { name: 'Ekranlara ekle…' })).toBeEnabled();
  // Yeniden açınca elle eklenen alan artık modelin alanıdır (sağ listede).
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await expect(page.locator('.tasarim-paleti')).toContainText('Onay notu');
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  // Test verisi sekmesi: alan tablo sütununa bağlanır; etiket (aynı etiketli alanlar aynı satırdan) yazılır.
  await basarili('/platform/tablo/kaydet', { projeId, ad: 'Onay verisi', sutunlar: [{ ad: 'Not' }], satirlar: [{ ad: 'r1', degerler: { Not: 'birinci' } }, { ad: 'r2', degerler: { Not: 'ikinci' } }] });
  const tabloId = String(((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.ad === 'Onay verisi')?.id);
  await page.getByRole('tab', { name: 'Test verisi' }).click();
  const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
  await expect(kart.getByText(/bağlar onu kullanan tüm ekranlara varsayılan olarak geçer/)).toBeVisible();
  await kart.getByRole('combobox', { name: 'Onay notu tablo sütunu' }).selectOption({ label: 'Onay verisi → Not' });
  await expect(kart.getByText('✓ Kaydedildi')).toBeVisible();
  await kart.getByRole('textbox', { name: 'Onay notu etiketi' }).fill('onayci');
  await kart.getByRole('textbox', { name: 'Onay notu etiketi' }).press('Tab');
  const alanId = String(alanlar.find((a) => a.konum?.secici === '#onay-notu')?.id);
  await expect.poll(async () => ((await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ortakId}`)).baglar as Nesne)[alanId])
    .toEqual({ tablo: tabloId, sutun: 'Not', etiket: 'onayci' });
  agKontrol(istekler);
  await page.close();
});
