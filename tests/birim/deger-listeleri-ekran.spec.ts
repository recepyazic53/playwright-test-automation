// KORUMA TESTLERİ — ekran için koşullu değer listeleri (Ayarlar > Test verisi > Değer listeleri): hedef ekran input'u,
// "ve" koşulları (Kapsam = … ve Alternatif = …), ekranın kendi listesinden değer seçimi; senaryo formunda koşullar tutunca
// input'un seçenekleri listeden gelir, tutmayınca ekranın kendi listesi. Excel (.xlsx) okuyucu. Yalnız yerel sunucu.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { birlesikDegerler, eslesenListeler, type ParametreTanimi } from '../../scripts/platform/servisler/parametre-tanimlari.mjs';
import { jetSeyahatAkisPaketi } from '../../projeler/galaksi/jetseyahat-akis.mjs';
import { modeldenListeTaslaklari, modeleListeleriUygula } from '../../scripts/platform/senaryolar/deger-listesi-modeli.mjs';
import { secenekBul } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;

test('koşullu liste çözümü: en çok koşulu tutan liste; tutan yoksa koşulsuz; değerler birleşir', () => {
  const l = (id: string, kosullar: Array<{ alan: string; deger: string }>, degerler: string[]): ParametreTanimi =>
    ({ id, ad: id, tur: 'liste', kullanim: 'ekran', hedef: { ekranId: 'e', alan: 'ulke' }, kosullar, degerler: degerler.map((deger) => ({ deger })) });
  const listeler = [l('genel', [], ['1', '2', '3']), l('dunya', [{ alan: 'kapsam', deger: 'D' }], ['1', '2']),
    l('dunyaVize', [{ alan: 'kapsam', deger: 'D' }, { alan: 'alternatif', deger: 'V' }], ['2']), l('dunyaVize2', [{ alan: 'kapsam', deger: 'D' }, { alan: 'alternatif', deger: 'V' }], ['4'])];
  const cozum = (d: Record<string, string>) => eslesenListeler(listeler, (t) => t.hedef?.alan === 'ulke', (a) => d[a]).map((t) => t.id);
  expect(cozum({})).toEqual(['genel']);
  expect(cozum({ kapsam: 'D' })).toEqual(['dunya']);
  expect(cozum({ kapsam: 'D', alternatif: 'V' })).toEqual(['dunyaVize', 'dunyaVize2']);
  expect(birlesikDegerler(eslesenListeler(listeler, () => true, (a) => ({ kapsam: 'D', alternatif: 'V' } as Record<string, string>)[a])).map((x) => x.deger)).toEqual(['2', '4']);
});

test('model ↔ değer listeleri: koşulsuz liste seçenekleri değiştirir, tek koşullu bağımlılık haritasını, diğerleri ekler; koşu sayfa değerini bulur', () => {
  const alan = (id: string, ek: Record<string, unknown>) => ({ id, tip: 'secim', yapilandirma: 'senaryo', etiket: { form: id.toUpperCase() }, ...ek });
  const model = { adimlar: [{ id: 'a', bolumler: [{ id: 'b', alanlar: [
    alan('kapsam', { secenekler: [{ deger: '1', metin: 'DÜNYA', senaryoDegeri: 'D' }, { deger: '2', metin: 'AVRUPA', senaryoDegeri: 'A' }] }),
    alan('plan', { secenekler: [{ deger: '1', metin: 'Plan 1' }, { deger: '2', metin: 'Plan 2' }] }),
    alan('ulke', { secenekler: null, bagimlilik: { alan: 'kapsam', secenekHaritasi: { D: [{ deger: '10', metin: 'ABD' }, { deger: '15', metin: 'ALMANYA' }], A: [{ deger: '15', metin: 'ALMANYA' }] } } })
  ] }] }] };
  // Taslaklar: kapsam, plan (koşulsuz) + ülke (kapsam = D, kapsam = A).
  const taslak = modeldenListeTaslaklari(model, { id: 'e', ad: 'Ekran' });
  expect(taslak.map((x) => x.ad)).toEqual(['Ekran › KAPSAM', 'Ekran › PLAN', 'Ekran › ULKE (KAPSAM = DÜNYA)', 'Ekran › ULKE (KAPSAM = AVRUPA)']);
  expect(taslak[0].degerler[0]).toEqual({ deger: 'D', aciklama: 'DÜNYA', ekranDegeri: '1' });
  const liste = (alanId: string, kosullar: Array<{ alan: string; deger: string }>, degerler: Array<Record<string, string>>) => ({ hedef: { ekranId: 'e', alan: alanId }, kosullar, degerler: degerler as Array<{ deger: string }> });
  const yeni = modeleListeleriUygula(model, [
    liste('plan', [], [{ deger: '1' }, { deger: '9', aciklama: 'Plan 9', ekranDegeri: '09', ekranMetni: 'PLAN 9' }]),
    liste('ulke', [{ alan: 'kapsam', deger: 'A' }], [{ deger: '20', aciklama: 'FRANSA' }]),
    liste('ulke', [{ alan: 'kapsam', deger: 'D' }, { alan: 'alternatif', deger: 'V' }], [{ deger: '30', aciklama: 'JAPONYA' }])
  ]) as typeof model;
  const [, plan, ulke] = yeni.adimlar[0].bolumler[0].alanlar as Array<Record<string, any>>;
  expect(plan.secenekler).toEqual([{ deger: '1', metin: 'Plan 1' }, { deger: '09', senaryoDegeri: '9', metin: 'PLAN 9', formMetni: 'Plan 9' }]);
  expect(secenekBul(plan.secenekler, '9')).toMatchObject({ deger: '09', metin: 'PLAN 9' });
  expect(ulke.bagimlilik.secenekHaritasi.A).toEqual([{ deger: '20', metin: 'FRANSA', formMetni: 'FRANSA' }]);
  expect(ulke.bagimlilik.secenekHaritasi.D.map((x: Record<string, string>) => x.deger)).toEqual(['10', '15', '30']);
  expect((model.adimlar[0].bolumler[0].alanlar[1] as Record<string, any>).secenekler).toHaveLength(2);
});

/** Tek sayfalık, ortak metinli sahte .xlsx (ZIP, deflate). */
function sahteXlsx(satirlar: string[][]): Buffer {
  const metinler: string[] = [];
  const si = (m: string) => { let i = metinler.indexOf(m); if (i < 0) { metinler.push(m); i = metinler.length - 1; } return i; };
  const sutun = (i: number) => String.fromCharCode(65 + i);
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    satirlar.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => `<c r="${sutun(x)}${y + 1}" t="s"><v>${si(v)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const dosyalar: Record<string, string> = {
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sayfa1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${metinler.map((m) => `<si><t>${m.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`
  };
  const yereller: Buffer[] = []; const merkezi: Buffer[] = []; let ofset = 0;
  for (const [ad, icerik] of Object.entries(dosyalar)) {
    const ham = Buffer.from(icerik, 'utf8'); const sik = deflateRawSync(ham); const adB = Buffer.from(ad, 'utf8');
    const y = Buffer.alloc(30); y.writeUInt32LE(0x04034b50, 0); y.writeUInt16LE(20, 4); y.writeUInt16LE(8, 8); y.writeUInt32LE(sik.length, 18); y.writeUInt32LE(ham.length, 22); y.writeUInt16LE(adB.length, 26);
    yereller.push(y, adB, sik);
    const m = Buffer.alloc(46); m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(8, 10); m.writeUInt32LE(sik.length, 20); m.writeUInt32LE(ham.length, 24); m.writeUInt16LE(adB.length, 28); m.writeUInt32LE(ofset, 42);
    merkezi.push(m, adB);
    ofset += 30 + adB.length + sik.length;
  }
  const md = Buffer.concat(merkezi);
  const son = Buffer.alloc(22); son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(Object.keys(dosyalar).length, 8); son.writeUInt16LE(Object.keys(dosyalar).length, 10); son.writeUInt32LE(md.length, 12); son.writeUInt32LE(ofset, 16);
  return Buffer.concat([...yereller, md, son]);
}

test.describe('ekran değer listeleri uçtan uca', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Liste-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let girdiler: Nesne[] = [];
  let listeId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const girdi = (id: string) => girdiler.find((g) => g.id === id) as Nesne;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'deger-listeleri-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Liste Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', {
      projeId, paket: jetSeyahatAkisPaketi({ havuzlar: { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', acente: 'Acente' }, girissiz: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
    });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'JetSeyahat (akış)')?.id);
    girdiler = (await basarili(`/platform/ekran/girdiler?projeId=${projeId}&ekranId=${ekranId}`)).girdiler;
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('ekranın inputları seçenekleriyle listelenir; ekran listesi hedef ve koşulla doğrulanır', async () => {
    expect(girdi('ulke').secenekler.length).toBeGreaterThan(100);
    expect(girdi('kapsam').secenekler.length).toBeGreaterThanOrEqual(2);
    expect(girdi('alternatif').secenekler.length).toBeGreaterThanOrEqual(2);
    await api('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'Eksik', tur: 'liste', degerler: [{ deger: '1' }], kullanim: 'ekran', hedef: { ekranId } })
      .then((y) => { expect(y.basarili).toBe(false); expect(String(y.mesaj)).toMatch(/input/); });
    await api('/platform/servis-parametre-tanimi/kaydet', { projeId, ad: 'Kendi', tur: 'liste', degerler: [{ deger: '1' }], kullanim: 'ekran', hedef: { ekranId, alan: 'ulke' }, kosullar: [{ alan: 'ulke', deger: '1' }] })
      .then((y) => { expect(y.basarili).toBe(false); expect(String(y.mesaj)).toMatch(/kendi/); });
    const kapsam = girdi('kapsam').secenekler[0].deger;
    const uc = girdi('ulke').secenekler.slice(1, 4);
    listeId = String((await basarili('/platform/servis-parametre-tanimi/kaydet', {
      projeId, ad: 'ALTERNATİF ÜLKELER', tur: 'liste', degerler: uc.map((x: Nesne) => ({ deger: x.deger, aciklama: x.metin })),
      kullanim: 'ekran', hedef: { ekranId, alan: 'ulke', alanEtiketi: girdi('ulke').etiket },
      kosullar: [{ alan: 'kapsam', deger: kapsam, etiket: 'Kapsam' }]
    })).id);
    const { tanimlar } = await basarili(`/platform/servis-parametre-tanimlari?projeId=${projeId}`);
    expect(tanimlar[0]).toMatchObject({ kullanim: 'ekran', hedef: { ekranId, alan: 'ulke' }, kosullar: [{ alan: 'kapsam', deger: kapsam }] });
  });

  test('arayüz: senaryo formunda koşullar tutunca input seçenekleri listeden gelir, tutmayınca ekranın kendi listesi', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/senaryolar/yeni/${ekranId}`);
    const ulke = page.locator('[data-alan="ulke"] select');
    const kapsamSec = page.locator('[data-alan="kapsam"] select');
    const alternatifSec = page.locator('[data-alan="alternatif"] select');
    await expect(ulke).toBeVisible();
    // Tek koşul (Kapsam): tutunca Ülke'de yalnız listedeki 3 ülke (+ "Seçin…").
    await kapsamSec.selectOption(girdi('kapsam').secenekler[0].deger);
    await expect(ulke.locator('option')).toHaveCount(4);
    await expect(ulke.locator('option').nth(1)).toHaveText(girdi('ulke').secenekler[1].metin);
    // Koşul bozulunca ekranın kendi listesi döner.
    await kapsamSec.selectOption(girdi('kapsam').secenekler[1].deger);
    await expect.poll(async () => ulke.locator('option').count()).toBeGreaterThan(4);
    // İki koşul ("ve"): Kapsam = ilk ve Alternatif = o kapsamın ilk alternatifi.
    await kapsamSec.selectOption(girdi('kapsam').secenekler[0].deger);
    const alternatif = (await alternatifSec.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).find((v) => v);
    expect(alternatif).toBeTruthy();
    const kapsam = girdi('kapsam').secenekler[0].deger;
    await basarili('/platform/servis-parametre-tanimi/kaydet', {
      id: listeId, projeId, ad: 'ALTERNATİF ÜLKELER', tur: 'liste', degerler: girdi('ulke').secenekler.slice(1, 4).map((x: Nesne) => ({ deger: x.deger, aciklama: x.metin })),
      kullanim: 'ekran', hedef: { ekranId, alan: 'ulke', alanEtiketi: girdi('ulke').etiket }, kosullar: [{ alan: 'kapsam', deger: kapsam, etiket: 'Kapsam' }, { alan: 'alternatif', deger: alternatif, etiket: 'Alternatif' }]
    });
    await page.reload();
    await kapsamSec.selectOption(kapsam);
    await expect.poll(async () => ulke.locator('option').count(), 'yalnız Kapsam tutuyor: ekranın listesi').toBeGreaterThan(4);
    await alternatifSec.selectOption(String(alternatif));
    await expect(ulke.locator('option')).toHaveCount(4);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: formda Ekran → Input → koşul → ekranın listesinden seçim; Excel\'den (.xlsx) kod sütunu ile seçilir', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/test-verisi');
    await page.getByRole('tab', { name: 'Değer listeleri' }).click();
    await expect(page.locator('.tanim-tablosu')).toContainText('Kapsam = ');
    await page.getByRole('button', { name: '+ Değer listesi ekle' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Ad', { exact: true }).fill('SCHENGEN ÜLKELERİ');
    await d.getByRole('radio', { name: 'Ekran' }).click();
    await d.getByLabel('Ürün (ekran)').selectOption({ label: 'JetSeyahat (akış)' });
    await d.getByLabel('Input', { exact: true }).selectOption('ulke');
    await d.getByRole('button', { name: 'Koşul ekle' }).click();
    await d.getByLabel('1. bağlı olduğu input').selectOption('kapsam');
    await d.getByLabel('1. bağlı olduğu değer').selectOption(girdi('kapsam').secenekler[1].deger);
    await expect(d.getByText(`0 / ${girdi('ulke').secenekler.length} seçili`)).toBeVisible();
    // Excel: iki ülke kodu + ekranda olmayan bir kod.
    const s = girdi('ulke').secenekler;
    const yol = join(klasor, 'ulkeler.xlsx');
    writeFileSync(yol, sahteXlsx([['Kod', 'Ülke'], [s[5].deger, s[5].metin], [s[6].deger, s[6].metin], ['ZZZ', 'Olmayan']]));
    await d.getByLabel('Excel dosyası').setInputFiles(yol);
    await d.getByRole('button', { name: 'Değerleri al' }).click();
    await expect(d).toContainText('1 tanesi ekranın listesinde yok');
    await expect(d.getByText(`2 / ${s.length} seçili`)).toBeVisible();
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d).toBeHidden();
    const { tanimlar } = await basarili(`/platform/servis-parametre-tanimlari?projeId=${projeId}`);
    const t = tanimlar.find((x: Nesne) => x.ad === 'SCHENGEN ÜLKELERİ');
    expect(t).toMatchObject({ kullanim: 'ekran', hedef: { ekranId, alan: 'ulke' }, kosullar: [{ alan: 'kapsam', deger: girdi('kapsam').secenekler[1].deger }] });
    expect(t.degerler.map((x: Nesne) => x.deger)).toEqual([s[5].deger, s[6].deger]);
    await expect(page.locator('.tanim-tablosu tr').filter({ hasText: 'SCHENGEN ÜLKELERİ' })).toContainText('Ekran · JetSeyahat (akış)');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
  test('ekranlardan içe al: önizleme → onay; tekrar içe almada var olanlar atlanır; liste modelin önüne geçer (form modeli)', async () => {
    const o = (await basarili('/platform/deger-listeleri/modellerden', { projeId })).onizleme;
    expect(o.toplam).toBeGreaterThan(5);
    expect(o.kosullu).toBeGreaterThan(0);
    expect(o.ekranlar.map((x: Nesne) => x.ekran)).toContain('JetSeyahat (akış)');
    const once = (await basarili(`/platform/servis-parametre-tanimlari?projeId=${projeId}`)).tanimlar.length;
    expect((await basarili('/platform/deger-listeleri/modellerden', { projeId, onay: true })).eklendi.toplam).toBe(o.toplam);
    const sonra = (await basarili(`/platform/servis-parametre-tanimlari?projeId=${projeId}`)).tanimlar as Nesne[];
    expect(sonra.length).toBe(once + o.toplam);
    expect((await basarili('/platform/deger-listeleri/modellerden', { projeId })).onizleme.toplam).toBe(0);
    // Plan listesine yeni değer: form modeli (doğrulama ve koşu da aynı modeli kullanır) bu değeri tanır.
    const plan = sonra.find((x) => x.hedef?.alan === 'plan' && !(x.kosullar || []).length) as Nesne;
    expect(plan).toBeTruthy();
    await basarili('/platform/servis-parametre-tanimi/kaydet', { ...plan, projeId, degerler: [...plan.degerler, { deger: '9', aciklama: 'Plan 9' }] });
    const form = await basarili(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`);
    expect(JSON.stringify(form.model)).toContain('"formMetni":"Plan 9"');
    const g = (await basarili(`/platform/ekran/girdiler?projeId=${projeId}&ekranId=${ekranId}`)).girdiler as Nesne[];
    expect(g.find((x) => x.id === 'plan')?.secenekler.map((x: Nesne) => x.deger)).toContain('9');
  });
});
