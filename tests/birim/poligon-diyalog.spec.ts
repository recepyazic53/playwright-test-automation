// POLİGON DÜZELTMESİ 1 + 7 — tarayıcı pencereleri (alert / confirm / prompt). Hızlı test pencereyi sayfa açılır açılmaz kurulan TEK
// işleyiciyle yanıtlar (Evet: kabul, Bana sor: kullanıcıya sorulur, Hayır: iptal); yanıt modele aksiyonun "diyalog"u olarak yazılır,
// doğrulama ve normal koşu aynı yanıtı verir; başarıyı bildiren alert normal koşuda hata sayılmaz (bitiş etiketleriyle değerlendirilir).
// Güvenli tıklamanın gözlemcisi tek dinleyiciyken pencereyi kapatır (hiçbir yerde takılı kalınmaz).
// Güvenlik: yalnız 127.0.0.1'deki poligon (tests/poligon), ayrı Nöbetçi + geçici veri kökü (veri/ klasörüne ve 5566'ya dokunulmaz).
import { expect, test } from '@playwright/test';
import { guvenliTikla } from '../../scripts/platform/tarama/guvenli-tiklama';
import { PLANLAR } from '../poligon/planlar';
import { ekranKos, poligonOrtami, type PoligonOrtami } from '../poligon/surucu';
import { korumaliTarayici } from './giris-fikstur';

test.describe.configure({ mode: 'serial' });
let po: PoligonOrtami;
const plan = (kok: string) => {
  const p = PLANLAR.find((x) => x.kok === kok);
  if (!p) throw new Error(kok);
  return p;
};

test.beforeAll(async () => { test.setTimeout(120_000); po = await poligonOrtami(); });
test.afterAll(async () => { await po?.kapat(); });

test('güvenli tıklama: başka dinleyici yokken gözlemci pencereyi kapatır (tıklama takılmaz); dinleyici varsa ona bırakır', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent('<button onclick="document.body.dataset.r = String(confirm(\'Emin misiniz?\'))">Onayla</button>');
    const bas = Date.now();
    const r = await guvenliTikla(page, page.locator('button'), { zamanMs: 5_000 });
    expect(Date.now() - bas).toBeLessThan(5_000);
    expect(r.etkisiz).toBe(false);
    await expect.poll(() => page.evaluate(() => document.body.dataset.r)).toBe('false');
    // Sayfanın kendi dinleyicisi varsa yanıt ona aittir (kabul).
    page.on('dialog', (d) => { void d.accept(); });
    await guvenliTikla(page, page.locator('button'), { zamanMs: 5_000 });
    await expect.poll(() => page.evaluate(() => document.body.dataset.r)).toBe('true');
  } finally { await tarayici.close(); }
});

test('Evet: havale onayındaki confirm kabul edilir, zincir kilitlenmez; modelde aksiyonun diyalog yanıtı; doğrulama ve normal koşu aynı yanıtla geçer', async () => {
  test.setTimeout(400_000);
  const r = await ekranKos(po, plan('/havale'));
  expect(r.bulgular.filter((m: string) => !/Etiketsiz alan/.test(m)), JSON.stringify(r.bulgular)).toEqual([]);
  expect(r.asamalar).toMatchObject({ eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
  const onayla = (r.adimlar as Array<Record<string, any>>).find((a) => a.bas === 'Onayla');
  expect(onayla?.diyalog).toBe('kabul');
  expect(onayla?.fark?.diyaloglar?.[0]).toMatchObject({ tur: 'confirm', yanit: 'kabul' });
  const aksiyonlar = (r.model.adimlar as Array<Record<string, any>>).flatMap((a) => a.aksiyonlar);
  expect(aksiyonlar.find((a) => a.tur === 'tikla' && a.diyalog)).toMatchObject({ diyalog: 'kabul' });
});

test('Bana sor: basışta açılan confirm metni sorulur ("Şimdi ne yapayım?"); kullanıcının yanıtı uygulanır ve doğrulama soruyu tekrarlamadan aynı yanıtı verir', async () => {
  test.setTimeout(400_000);
  const r = await ekranKos(po, plan('/havale'), { izin: 'sor', diyalogYaniti: 'kabul', kayitYok: true });
  expect(r.diyalogSorulari.length, JSON.stringify(r.bulgular)).toBe(1);
  expect(r.diyalogSorulari[0].mesaj).toMatch(/250 TL gönderilecek/);
  expect(r.asamalar).toMatchObject({ eylem: true, bitis: true, dogrulama: true });
  expect(r.sayac.dogrulama).toBe(1);
});

test('başarıyı bildiren alert (sepet): hızlı test, doğrulama ve normal koşu aynı kuralla geçer (alert hata sayılmaz)', async () => {
  test.setTimeout(400_000);
  const r = await ekranKos(po, plan('/sepet'));
  expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ dogrulama: true, kayit: true, normal: true, sayac: true });
});
