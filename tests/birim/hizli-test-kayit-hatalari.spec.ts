// HIZLI TEST — KAYIT HATALARI: paket doğrulaması geçmeyen kayıtta kullanıcı yalnız "Paket geçersiz (1 sorun)." görmez; sorunlar anlaşılır
// maddelerle (adım / alan / tablo / bitiş koşulu adıyla), "Düzelt" yönlendirmesiyle ve teknik ayrıntı "Ayrıntı" altında gösterilir. Aynı
// doğrulama özet yanıtında ÖN DENETİM olarak çalışır (sorunlar); sorun varken "Onayla" pasif ve kaydet hiçbir şey yazmaz.
//
// Güvenlik: ortamın adresi 127.0.0.1'deki sahte form (hizli-test-fikstur.ts); tarayıcı yalnız bu kökene bağlanır. Geçici veritabanı ve ayrı
// Nöbetçi örneği; veri/ klasörüne dokunulmaz. Hayır izni: siteye hiçbir düğme isteği gitmez. Değerler uydurmadır (değer ÜRETİLMEZ).
// Geçersiz durum: bitiş metni gizli bilgi kalıbı ("Bearer …" yetkilendirme başlığı) taşıyor → paketin gizli değer taraması kaydı engeller.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kayitSorunlari } from '../../scripts/platform/hizli-test/kayit-sorunlari.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { HizliTestUygulamasi } from './hizli-test-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Kayit-${randomBytes(6).toString('hex')}`;
/** Gizli bilgi kalıbı taşıyan (uydurma) bitiş metni: rakamsızdır, sabit kısmı olduğu gibi bitiş koşuluna yazılır. */
const GIZLI_METIN = 'Oturum Bearer abcdefghijklmnopqrstuv';

let nobetci: Nobetci;
let uygulama: HizliTestUygulamasi;
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
const oturum = async (id: string): Promise<Nesne> => (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
async function bekle(id: string, durumlar: string[], sn = 90): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const o = await oturum(id);
    if (durumlar.includes(o.durum)) return o;
    if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}
const tasma = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'hizli-kayit-hatalari-'));
  uygulama = new HizliTestUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_KAYIT_CDP_PORTU: String(await bosPort()), NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0' });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Kayıt Hataları Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('kayıt sorunları: teknik yol → adım / alan / tablo adı, Düzelt hedefi (bitiş / adım adım / tablo), teknik ileti ayrıntıda', () => {
  const paket = {
    model: {
      id: 'form', adimlar: [{ id: 'form', baslik: 'Başvuru', bolumler: [{ id: 'b', alanlar: [{ id: 'adSoyad', etiket: { form: 'Ad soyad', ekran: 'Ad soyad' } }] }],
        kosu: { basariGostergesi: { tur: 'metin', deger: 'x' } } }]
    },
    testVerisi: { tablolar: [{ ad: 'Müşteri tipi listesi' }] }
  };
  const s = kayitSorunlari([
    { yer: 'model', mesaj: 'adimlar[0](form).bolumler[0](b).alanlar[0](adSoyad): bilinmeyen anahtar "xyz"' },
    { yer: 'model.adimlar[0].kosu.basariGostergesi.deger', mesaj: 'yetkilendirme başlığı (Bearer) biçiminde bir değer içeriyor.' },
    { yer: 'testVerisi.tablolar[0].satirlar[2]', mesaj: 'satır geçersiz.' },
    { yer: 'meta.ekran.anahtar', mesaj: '"X" ekranı bu anahtarla zaten var.' }
  ], paket);
  expect(s[0]).toMatchObject({ duzelt: 'karar', mesaj: '“Başvuru” adımı › “Ad soyad” alanı: tanınmayan özellik “xyz”' });
  expect(s[0].ayrinti).toContain('alanlar[0](adSoyad)');
  expect(s[1]).toMatchObject({ duzelt: 'bitis', mesaj: '“Başvuru” adımı › bitiş koşulu: yetkilendirme başlığı (Bearer) biçiminde bir değer içeriyor.' });
  expect(s[1].ayrinti).toBe('model.adimlar[0].kosu.basariGostergesi.deger: yetkilendirme başlığı (Bearer) biçiminde bir değer içeriyor.');
  expect(s[2]).toMatchObject({ duzelt: 'tablo', mesaj: '“Müşteri tipi listesi” tablosu: satır geçersiz.' });
  expect(s[3]).toMatchObject({ duzelt: null, mesaj: 'Ekran: "X" ekranı bu anahtarla zaten var.' });
});

test('geçersiz kayıt: özette ön denetim sorunları + Onayla pasif; kaydet maddeli hata döner ve hiçbir şey yazmaz; Düzelt bitiş koşuluna götürür; düzeltilince kayıt başarılı (1440 px)', async () => {
  test.setTimeout(240_000);
  const once = uygulama.istekler.filter((x) => x.includes('/api/')).length;
  const id = String((await basarili('/platform/hizli-test/baslat', {
    projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Kayıt hataları', izin: 'hayir', cumle: `Hesapla'ya bas, "${GIZLI_METIN}" görünsün`
  })).id);
  let o = await bekle(id, ['veri']);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: { deger: 'Deneme Kişi', kaynak: 'elle' }, [alan('Müşteri tipi')]: { deger: 'bireysel', kaynak: 'elle' } } });
  o = await bekle(id, ['hayirSecim']);
  const hesapla = o.soru.adaylar.find((a: Nesne) => a.metin === 'Hesapla');
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir', dugme: hesapla.secici, mesajlar: [GIZLI_METIN] });
  o = await bekle(id, ['bitis']);
  expect(o.soru.etiketler).toMatchObject({ [GIZLI_METIN]: 'bitti' });
  await basarili('/platform/hizli-test/bitis', { id, etiketler: o.soru.etiketler });
  await bekle(id, ['kaydet']);

  // Ön denetim: özet yanıtında anlaşılır sorunlar (bitiş koşulu → "Düzelt: bitiş"); teknik yol ayrıntıda.
  const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Gizli bitiş' })).ozet as Nesne;
  const sorunlar = oz.sorunlar as Nesne[];
  expect(sorunlar.length, JSON.stringify(sorunlar)).toBeGreaterThan(0);
  const bitisSorunu = sorunlar.find((s) => s.duzelt === 'bitis');
  expect(bitisSorunu, JSON.stringify(sorunlar)).toBeTruthy();
  expect(bitisSorunu?.mesaj).toContain('bitiş koşulu');
  expect(bitisSorunu?.mesaj).toContain('Bearer');
  expect(bitisSorunu?.ayrinti).toContain('basariGostergesi');

  // Kaydet: aynı sorunlar maddeli döner (yalnız "Paket geçersiz" değil); ekran / tablo yazılmaz.
  const tabloSayisi = async (): Promise<number> => ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as unknown[]).length;
  const tablolarOnce = await tabloSayisi();
  const k = await api('/platform/hizli-test/kaydet', { id, baslik: 'Gizli bitiş' });
  expect(k).toMatchObject({ basarili: false, kod: 'PAKET' });
  expect(k.mesaj).toBe(`Test kaydedilemedi: ${sorunlar.length} sorun var.`);
  expect(k.hatalar).toEqual(sorunlar);
  expect(JSON.stringify(await api(`/platform/ekranlar?projeId=${projeId}`))).not.toContain('Kayıt hataları');
  expect(await tabloSayisi()).toBe(tablolarOnce);
  expect((await oturum(id)).durum).toBe('kaydet');

  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } });
    const hatalar: string[] = [];
    // Kaydet ekranı: "Kaydet — özeti göster" sorun varken özeti açmaz; maddeler + Düzelt + Ayrıntı yerinde görünür.
    const page = await baglam.newPage();
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/hizli-test/o/${encodeURIComponent(id)}`);
    const soru = page.locator('.hizli-soru');
    await expect(soru.getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible({ timeout: 30_000 });
    await soru.getByRole('button', { name: 'Kaydet — özeti göster' }).click();
    const kutu = soru.locator('.hizli-sorunlar');
    await expect(kutu).toBeVisible();
    await expect(kutu).toContainText('Kaydetmeden önce düzeltilmesi gereken');
    await expect(kutu.getByRole('list', { name: 'Kayıt sorunları' })).toContainText('bitiş koşulu');
    await expect(kutu.getByRole('button', { name: 'Düzelt: Bitiş koşulunu düzenle' })).toBeVisible();
    await expect(kutu.locator('details summary')).toHaveText('Ayrıntı');
    await expect(kutu.locator('details')).not.toHaveAttribute('open', /.*/);
    await page.waitForTimeout(300);
    expect(baglam.pages().length).toBe(1);
    expect(await tasma(page)).toBeLessThanOrEqual(0);

    // Özet sekmesi: sorunlar en üstte, "Onayla" pasif + gerekçe; Düzelt → bitiş koşulu ekranı.
    const ozetSekmesi = await baglam.newPage();
    ozetSekmesi.on('pageerror', (e) => hatalar.push(String(e)));
    await ozetSekmesi.goto(`/#/hizli-test/ozet/${encodeURIComponent(id)}`);
    const ozet = ozetSekmesi.locator('.hizli-ozet-karti');
    await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible({ timeout: 30_000 });
    const ozetKutusu = ozet.locator('.hizli-sorunlar');
    await expect(ozetKutusu).toBeVisible();
    await expect(ozetKutusu).toContainText('Bearer');
    await expect(ozet.getByRole('button', { name: 'Onayla ve kaydet' })).toBeDisabled();
    await expect(ozet).toContainText('Kayıt onaylanamaz: önce yukarıdaki sorunları düzeltin.');
    await ozetKutusu.locator('details summary').click();
    await expect(ozetKutusu.locator('details code').first()).toContainText('basariGostergesi');
    for (const genislik of [1440, 390]) {
      await ozetSekmesi.setViewportSize({ width: genislik, height: 900 });
      await ozetSekmesi.waitForTimeout(150);
      expect(await tasma(ozetSekmesi), `Özet ${genislik}px`).toBeLessThanOrEqual(0);
    }
    await ozetSekmesi.setViewportSize({ width: 1440, height: 900 });
    await ozetKutusu.getByRole('button', { name: 'Düzelt: Bitiş koşulunu düzenle' }).click();
    await expect(ozetSekmesi).toHaveURL(new RegExp(`#/hizli-test/o/${id}$`));
    await expect(ozetSekmesi.locator('.hizli-soru').getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible({ timeout: 30_000 });
    expect((await oturum(id)).durum).toBe('bitis');

    // Düzelt: gizli metnin etiketi kaldırılır, bitiş adresle belirlenir → ön denetim temiz, kayıt başarılı.
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { [GIZLI_METIN]: null }, adres: '/basvuru/' });
    await bekle(id, ['kaydet']);
    const oz2 = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Gizli bitiş' })).ozet as Nesne;
    expect(oz2.sorunlar).toEqual([]);
    await ozetSekmesi.goto(`/#/hizli-test/ozet/${encodeURIComponent(id)}`);
    await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible({ timeout: 30_000 });
    await expect(ozet.locator('.hizli-sorunlar')).toHaveCount(0);
    const onayla = ozet.getByRole('button', { name: 'Onayla ve kaydet' });
    await expect(onayla).toBeEnabled();
    await onayla.click();
    await expect(ozetSekmesi.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
    expect(hatalar).toEqual([]);
  } finally {
    await tarayici.close();
  }
  expect((await oturum(id)).durum).toBe('kaydedildi');
  expect(JSON.stringify(await api(`/platform/ekranlar?projeId=${projeId}`))).toContain('Kayıt hataları');
  // Hayır izni: siteye tek bir düğme isteği gitmedi.
  expect(uygulama.istekler.filter((x) => x.includes('/api/')).length).toBe(once);
});
