// UÇTAN UCA (yerel) — HIZLI TESTTE BAĞLAM PROFİLİ (teste göre seçilir): başlat formunda tür başına bir seçim ("Şube: [profil]");
// sunucu seçimi doğrular (tarifte adım yok / başka tür / girişsiz → başlatmadan açık hata) ve taramanın yoluyla motora verir; motor
// girişten sonra normal koşunun bağlam değiştirme işleviyle (giris-motoru.ts > baglamiDegistir) şubeyi değiştirir. Doğrulama koşusu da
// aynı bağlamla açılır; kaydedilen senaryo bağlam profilini senaryonun profil alanında taşır ve normal koşu aynı bağlamla koşar.
//
// Güvenlik: HİÇBİR gerçek siteye istek gitmez — ortamın adresi 127.0.0.1'deki sahte girişli başvuru uygulamasıdır (model-fikstur.ts;
// "Yetkili" şubede İndirim oranı alanı görünür, hesaplama isteği şubeyi kaydeder). Tarayıcı yalnız bu kökene bağlanabilir
// (NOBETCI_TARAMA_IZINLI_KOKENLER). Geçici veritabanı ve ayrı Nöbetçi örneği; değerler uydurmadır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Baglam-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
let bagsizOrtamId = '';
let profiller: Record<string, string> = {};
let kayitli: { ekranId: string; senaryoId: string } | null = null;

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
/** Oturum durumu (keşif toplu sorusu bu testin konusu değil: "Hiçbirine basma"). */
const oturum = async (id: string): Promise<Nesne> => {
  for (;;) {
    const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
    if (o?.durum !== 'kesifOnay') return o;
    await api('/platform/hizli-test/onay', { id, cevap: false });
  }
};
async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
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
const sayi = (olay: string): number => uygulama.olaylar.filter((x) => x === olay).length;
const tasma = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'hizli-baglam-'));
  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Bağlamlı Hızlı Test' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Şubeli', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  bagsizOrtamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Bağlamsız', tabanUrl: fikstur.adres, riskli: false })).ortam as Nesne).id);
  const bagsizTarif = ornekGirisTarifi();
  delete bagsizTarif.baglamDegistirme;
  for (const [oId, tarif] of [[ortamId, ornekGirisTarifi()], [bagsizOrtamId, bagsizTarif]] as const) {
    await basarili('/platform/giris-profili/kaydet', { projeId, ortamId: oId, ad: 'Deneme', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI });
    await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId: oId, tarif });
  }
  // Şube profilleri yalnız "Şubeli" ortamında (Bağlamsız ortamda profil yok → bilgi notu).
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) {
    profiller[ad] = String((await basarili('/platform/baglam-profili/kaydet', { projeId, ortamId, tur: 'Şube', ad, alanlar: { subeKodu } })).id);
  }
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('seçenekler: ortamın bağlam türü ve profiller (yalnız tür / ad; değerler gelmez)', async () => {
  const s = await basarili(`/platform/hizli-test/secenekler?projeId=${projeId}`, undefined as unknown as Nesne);
  expect((s.ortamlar as Nesne[]).map((o) => [o.ad, o.baglamTuru])).toEqual(expect.arrayContaining([['Şubeli', 'Şube'], ['Bağlamsız', null]]));
  expect(s.baglamProfilleri).toEqual(expect.arrayContaining([{ id: profiller.Yetkili, tur: 'Şube', ad: 'Yetkili', ortamId }]));
  expect(JSON.stringify(s)).not.toContain('S02');
});

test('uyumsuz seçim başlatmadan açık hatayla reddedilir (tarayıcı açılmaz, siteye istek gitmez)', async () => {
  const once = uygulama.olaylar.length;
  const govde = { projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Başvuru', izin: 'evet' };
  const tarifsiz = await api('/platform/hizli-test/baslat', { ...govde, ortamId: bagsizOrtamId, baglamProfilleri: [{ tur: 'Şube', profilId: profiller.Yetkili }] });
  expect(tarifsiz).toMatchObject({ basarili: false, kod: 'BAGLAM' });
  expect(tarifsiz.mesaj).toContain('giriş tarifinde bağlam değiştirme adımı yok');
  const tur = await api('/platform/hizli-test/baslat', { ...govde, baglamProfilleri: [{ tur: 'Kullanıcı', profilId: profiller.Yetkili }] });
  expect(tur).toMatchObject({ basarili: false, kod: 'BAGLAM' });
  expect(tur.mesaj).toContain('yalnız “Şube” bağlamını değiştiriyor');
  expect(await api('/platform/hizli-test/baslat', { ...govde, girissiz: true, baglamProfilleri: [{ tur: 'Şube', profilId: profiller.Yetkili }] })).toMatchObject({ basarili: false, kod: 'BAGLAM' });
  expect(await api('/platform/hizli-test/baslat', { ...govde, baglamProfilleri: [{ tur: 'Şube', profilId: 'yok123' }] })).toMatchObject({ basarili: false, kod: 'BAGLAM' });
  expect(await api('/platform/hizli-test/baslat', { ...govde, baglamProfilleri: [{ tur: 'Şube', profilId: profiller.Yetkili }, { tur: 'Şube', profilId: profiller.Merkez }] })).toMatchObject({ basarili: false, kod: 'BAGLAM' });
  expect(uygulama.olaylar.length).toBe(once);
});

test('profil seçilmeden: eskisi gibi (şube değiştirilmez, varsayılan şubenin sayfası)', async () => {
  test.setTimeout(180_000);
  const sube = sayi('POST /sube');
  const b = await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Başvuru bağlamsız', izin: 'evet', baglamProfilleri: [{ tur: 'Şube', profilId: '' }] });
  const id = String(b.id);
  const o = await bekle(id, ['veri']);
  expect(o.baglam).toBeNull();
  expect(sayi('POST /sube')).toBe(sube);
  expect((o.soru.alanlar as Nesne[]).some((a) => String(a.etiket).startsWith('İndirim oranı'))).toBe(false);
  expect((o.gunluk as Nesne[]).some((g) => String(g.metin).startsWith('Bağlam:'))).toBe(false);
  await basarili('/platform/hizli-test/iptal', { id });
  await isBitsin();
});

test('"Şube: Yetkili": girişten sonra şube değişir; doğrulama koşusu ve kaydedilen senaryo aynı bağlamla', async () => {
  test.setTimeout(360_000);
  const sube = sayi('POST /sube');
  const b = await basarili('/platform/hizli-test/baslat', {
    projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Başvuru yetkili', izin: 'evet', cumle: 'Hesapla\'ya bas', baglamProfilleri: [{ tur: 'Şube', profilId: profiller.Yetkili }]
  });
  const id = String(b.id);
  let o = await bekle(id, ['veri']);
  // Bağlam değiştirme adımları (git /sube → seç → Uygula → "Şube: S02" bekle) girişten sonra, sayfa açılmadan çalıştı.
  expect(sayi('POST /sube')).toBe(sube + 1);
  expect(uygulama.olaylar.lastIndexOf('POST /sube')).toBeGreaterThan(uygulama.olaylar.lastIndexOf('POST /dogrulama'));
  expect(o.baglam).toEqual({ tur: 'Şube', ad: 'Yetkili', uygulandi: true });
  expect((o.gunluk as Nesne[]).map((g) => g.metin)).toContain('Bağlam: Şube = Yetkili uygulandı.');
  const alan = (bas: string): string => String((o.soru.alanlar as Nesne[]).find((a) => String(a.etiket).startsWith(bas))?.anahtar);
  // Yetkili şubede görünen alan keşfedildi.
  expect(alan('İndirim oranı')).not.toBe('undefined');
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ürün')]: { deger: 'A', kaynak: 'elle' }, [alan('Ad Soyad')]: { deger: 'Deneme Kişi', kaynak: 'elle' }, [alan('İndirim oranı')]: { deger: '10', kaynak: 'elle' } } });
  o = await bekle(id, ['karar', 'veri']);
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ sube: 'S02', indirim: '10' });
  if (o.durum === 'veri') { await basarili('/platform/hizli-test/veri', { id, degerler: {} }); o = await bekle(id, ['karar']); }
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  const toplam = (o.soru.gorulenler as Nesne[]).map((g) => String(g.metin)).find((m) => m.startsWith('Toplam:'));
  expect(toplam).toBeTruthy();
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [String(toplam)]: 'bitti' } });
  o = await bekle(id, ['kaydet']);
  // Doğrulama koşusu kendi tarayıcısını açar: aynı bağlam yeniden uygulanır.
  const hesap = uygulama.hesaplamalar.length;
  await basarili('/platform/hizli-test/dogrula', { id });
  o = await bekle(id, ['kaydet'], 180);
  expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili' });
  expect(sayi('POST /sube')).toBe(sube + 2);
  expect(uygulama.hesaplamalar.length).toBe(hesap + 1);
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ sube: 'S02', indirim: '10' });
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru — Yetkili şube', tabloOlustur: false });
  kayitli = { ekranId: String(k.ekranId), senaryoId: String(k.senaryoId) };
  await isBitsin();
  // Senaryonun bağlam modeli: profil havuzlu senaryo alanı (tür = tarifin bağlam türü) ve senaryoda seçilen profil.
  const ekran = (await api(`/platform/ekran?projeId=${projeId}&id=${kayitli.ekranId}`)) as Nesne;
  const pa = (ekran.model.senaryoDuzeyi.alanlar as Nesne[]).find((a) => a.eslesme?.profilHavuzu === 'Şube');
  expect(pa).toMatchObject({ varsayilan: { deger: 'Yetkili' } });
  const s = (await api(`/platform/senaryo?id=${kayitli.senaryoId}&ortamId=${ortamId}`)) as Nesne;
  expect(JSON.stringify(s)).toContain(`"${String(pa?.eslesme.senaryo)}":"Yetkili"`);
});

test('kaydedilen senaryonun normal koşusu aynı bağlamla koşar (şube değişir, hesaplama Yetkili şubede)', async () => {
  test.setTimeout(240_000);
  expect(kayitli).not.toBeNull();
  const sube = sayi('POST /sube');
  const hesap = uygulama.hesaplamalar.length;
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: kayitli?.senaryoId, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(sayi('POST /sube')).toBeGreaterThan(sube);
  expect(uygulama.hesaplamalar.length).toBe(hesap + 1);
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ sube: 'S02', indirim: '10' });
});

test('arayüz: başlat formunda bağlam seçimi; profil yokken bilgi; oturumda seçilen bağlam; 1440 / 390 taşma yok', async () => {
  test.setTimeout(240_000);
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/hizli-test');
    await expect(page.getByRole('heading', { name: 'Yeni hızlı test' })).toBeVisible({ timeout: 30_000 });
    const grup = page.getByRole('group', { name: /Bağlam/ });
    const secim = grup.getByLabel('Şube:');
    await expect(secim).toBeVisible();
    await expect(secim.locator('option')).toHaveText(['Bağlam yok (giriş kullanıcısıyla)', 'Merkez', 'Yetkili']);
    await expect(secim).toHaveValue('');
    for (const genislik of [1440, 390]) {
      await page.setViewportSize({ width: genislik, height: 844 });
      expect(await tasma(page), `${genislik}px başlat`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    // Profil olmayan ortam: seçim gizli, bilgi + tanımlama bağlantısı; tarifte adım olmadığı söylenir.
    await page.getByLabel('Ortam', { exact: true }).selectOption({ label: 'Bağlamsız' });
    await expect(grup).toHaveCount(0);
    const bilgi = page.locator('.hizli-baglam .not-kutusu');
    await expect(bilgi).toContainText('giriş tarifinde bağlam değiştirme adımı yok');
    await expect(bilgi.getByRole('link', { name: /bağlam profili tanımla/ })).toBeVisible();
    // Girişsiz açılışta bölüm gizlenir.
    await page.getByLabel('Ortam', { exact: true }).selectOption({ label: 'Şubeli' });
    await page.getByLabel(/Giriş yapmadan aç/).check();
    await expect(page.locator('.hizli-baglam')).toBeHidden();
    await page.getByLabel(/Giriş yapmadan aç/).uncheck();
    // Seçip başlat: gövdede { tur, profilId }; oturum görünümünde "Tarayıcıda şu an" kartında ve günlükte bağlam.
    await page.getByLabel('Şube:').selectOption({ label: 'Yetkili' });
    await page.getByLabel('Testin adı').fill('Başvuru arayüz');
    await page.getByLabel('Sayfa adresi').fill('/basvuru/');
    await page.getByText('Evet', { exact: true }).click();
    const istek = page.waitForRequest((r) => r.url().includes('/platform/hizli-test/baslat'));
    await page.getByRole('button', { name: 'Başlat' }).click();
    expect((await istek).postDataJSON().baglamProfilleri).toEqual([{ tur: 'Şube', profilId: profiller.Yetkili }]);
    await expect(page).toHaveURL(/#\/hizli-test\/o\//, { timeout: 30_000 });
    const id = decodeURIComponent(page.url().split('/o/')[1]);
    await bekle(id, ['veri']);
    const yan = page.getByRole('complementary', { name: 'Tarayıcıda şu an' });
    await expect(yan.locator('.hizli-baglam-durumu')).toHaveText('Bağlam: Şube = Yetkili (uygulandı)', { timeout: 30_000 });
    await yan.locator('.hizli-gunluk summary').click();
    await expect(yan.locator('.hizli-gunluk')).toContainText('Bağlam: Şube = Yetkili uygulandı.');
    for (const genislik of [1440, 390]) {
      await page.setViewportSize({ width: genislik, height: 844 });
      expect(await tasma(page), `${genislik}px oturum`).toBeLessThanOrEqual(0);
    }
    await basarili('/platform/hizli-test/iptal', { id });
    await isBitsin();
    expect(hatalar).toEqual([]);
  } finally {
    await tarayici.close();
  }
});
