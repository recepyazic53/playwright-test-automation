// ENTEGRASYON (yerel) — Genel senaryonun ekranla AYNI yollarla oluşturulması ve yönetilmesi:
//   "Ekran ekle"de "Ne oluşturulsun? ◉ Ekran ○ Genel senaryo" (varsayılan Ekran: bugünkü davranış korunur); Genel senaryo seçilince
//   paket yükle, "Ekranı tara" (sayfa ekle / analiz) ve "Akışı kaydet" sonucu "Genel senaryolar" altına genel senaryo olarak kaydedilir
//   (ekran adresi yazılmaz, senaryo eklenmez, ekranlara otomatik eklenmez). "Boş başla": adımsız genel senaryo; adımları diyagramdan
//   elle tanımlanan alan / düğmeyle eklenir. Genel senaryonun Test verisi sekmesi (tablo bağı + satır etiketi).
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
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Genel Senaryo Projesi' })).proje as Nesne).id);
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

test('saf: ekran paketi genel senaryo paketine çevrilir (adres / spec / senaryo / beklenen sonuç yok) ve geçerlidir; elle alan / düğme envantere eklenir', () => {
  const p = ortakAkisPaketineCevir(paket('saf-ortak', 'Saf ortak')) as Nesne;
  expect(p.model).toMatchObject({ tur: 'ortakAkis', semaSurumu: 2, id: 'saf-ortak' });
  for (const k of ['ekranUrl', 'specDosyasi', 'pageObject']) expect(p.model[k], k).toBeUndefined();
  expect(p.meta.ekran.urlYolu).toBeUndefined();
  expect(p.senaryoOnerileri).toEqual([]);
  expect((p.model.senaryoDuzeyi.alanlar as Nesne[]).some((a) => a.tip === 'birlesim')).toBe(false);
  expect(sayfaPaketiniDogrula(p).hatalar).toEqual([]);
  // Zaten genel senaryo olan paket aynen döner.
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

test('varsayılan Ekran: onay kutusu / genel senaryo seçimi yok; önde tara / kaydet, yapay zekâ görünür bölümde; paket yeni EKRAN olur (senaryo önerileri ve ortamlar — bugünkü davranış)', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await sayfa();
  await page.goto('/#/ekranlar/yeni');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Ekran ekle');
  // En üstte paket yükleme; altında tek satırda tara / hızlı test, kaydet ve yapay zekâ kutusu.
  await expect(page.locator('section.ekleme-secenekleri .ekleme-kutusu h3')).toHaveText(['Nöbetçi taraması', 'Akışı kaydet', 'Yapay zekâ ile oluştur', 'Boş başla']);
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

test('Boş başla → diyagramdan sıfırdan adım (elle alan + elle düğme + beklenen mesaj) → kaydet; Ekranlara ekle açılır; Test verisi sekmesinde bağ ve satır etiketi', async () => {
  test.setTimeout(120_000);
  const { page, istekler } = await sayfa();
  await page.goto('/#/ekranlar/yeni');
  const kutu = page.locator('.bos-basla-kutusu');
  await kutu.getByRole('button', { name: 'Boş genel senaryo oluştur' }).click();
  await expect(kutu.getByText('Genel senaryonun adını yazın.')).toBeVisible();
  await kutu.getByLabel('Genel senaryonun adı').fill('Onay adımları');
  await kutu.getByRole('button', { name: 'Boş genel senaryo oluştur' }).click();
  await expect(page).toHaveURL(/\/ekranlar\/e\/[^/]+\/akis$/);
  const ortakId = decodeURIComponent(page.url().split('/e/')[1].split('/')[0]);
  expect((await ekranlar()).find((x) => x.id === ortakId)).toMatchObject({ modelTuru: 'ortakAkis', modelSurumu: 1, adimSayisi: 0 });
  await expect(page.getByText('Bu genel senaryonun henüz adımı yok.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekranlara ekle…' })).toBeDisabled();
  // Boş genel senaryo ekranlara eklenmez (sunucu da reddeder).
  expect(await api('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [ekranId] })).toMatchObject({ basarili: false });

  await page.getByRole('button', { name: 'Diyagramdan adım ekle' }).click();
  await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
  await expect(page.getByText(/Bu diyagram genel senaryonun akışıdır/)).toBeVisible();
  // Genel senaryonun içine genel senaryo eklenmez.
  await page.getByRole('button', { name: 'Buraya blok ekle' }).first().click();
  const menu = page.getByRole('group', { name: 'Eklenecek blok' });
  await expect(menu.getByRole('button', { name: 'Genel senaryo' })).toHaveCount(0);
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
  await expect(onay).toContainText('Bu genel senaryoyu kullanan ekran yok.');
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

test('eski #/ekranlar/yeni/ortak-akis adresi ayrı sayfa değildir: Ekran ekle\'ye yönlenir; genel senaryo "Boş başla" kutusundadır', async () => {
  const { page } = await sayfa();
  await page.goto('/#/ekranlar/yeni/ortak-akis');
  await expect(page).toHaveURL(/#\/ekranlar\/yeni$/);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Ekran ekle');
  await expect(page.locator('section.ekleme-secenekleri .ekleme-kutusu h3').last()).toHaveText('Boş başla');
  await page.close();
});
