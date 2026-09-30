// KORUMA TESTLERİ — KOŞU GRUPLARI: farklı ekranlardan seçilen senaryolara ad verilip kaydedilir (kasada şifreli), listelenir,
// düzenlenir, çalıştırılır (toplu koşu onay penceresi: "Toplu koşuya dahil" kapalı olan atlanır) ve silinir. Basit modda Testlerim'de
// "Koşu oluştur", Gelişmiş modda Senaryolar > "Koşu grupları". Sunucu tarafı: doğrulama, silinen senaryo, proje silinince temizlik.
// 390 px taşma yok.
// Güvenlik: yalnız 127.0.0.1'deki geçici Nöbetçi (geçici veritabanı); ortam adresleri 127.0.0.1:9. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, senaryoSil, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { senaryoKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { kosuGrubuKaydet, kosuGrubuSil, kosuGruplariniListele } from '../../scripts/platform/senaryolar/kosu-gruplari.mjs';
import { projeyiSil } from '../../scripts/platform/proje-yonetimi.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Json = Record<string, any>;

const alan = (id: string, etiket: string): Json => ({
  id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: true
});
function model(anahtar: string, ad: string): Json {
  return {
    semaSurumu: 2, tur: 'ekran', id: anahtar, ad, aciklama: 'Koşu grubu fikstürü (değerler sahte).', ekranUrl: `/${anahtar}`, girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{ id: 'bilgiler', sira: 1, baslik: 'Bilgiler', bolumler: [{ id: 'b1', baslik: 'Bilgiler', alanlar: [alan('ad', 'Ad')] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } } }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const tasma = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Koşu grupları (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Grup-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  const s: Record<string, string> = {};
  const api = (yol: string, govde?: Json) => nobetciApi(nobetci, yol, govde) as Promise<Json>;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosu-gruplari-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Grup Projesi' });
    testOrtami = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    const ekranA = ekranKaydet(vt, { projeId, anahtar: 'ekran-a', ad: 'Ekran A' });
    ekranModeliEkle(vt, { ekranId: ekranA, model: model('ekran-a', 'Ekran A') });
    const ekranB = ekranKaydet(vt, { projeId, anahtar: 'ekran-b', ad: 'Ekran B' });
    ekranModeliEkle(vt, { ekranId: ekranB, model: model('ekran-b', 'Ekran B') });
    const kaydet = (ekranId: string, baslik: string, kosuyaDahil = true) => senaryoKaydet(vt, { projeId, ekranId, baslik, veri: { baslik, ad: 'Deneme' }, ortamIdleri: [testOrtami], kosuyaDahil }).id;
    for (const b of ['A bir', 'A iki', 'A üç']) s[b] = kaydet(ekranA, b);
    s['A kapalı'] = kaydet(ekranA, 'A kapalı', false);
    for (const b of ['B bir', 'B iki']) s[b] = kaydet(ekranB, b);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
    expect((await api('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  const sayfaAc = async (adres: string, genislik = 1440) => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(nobetci.adres) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await page.goto(adres);
    return { baglam, page, hatalar, disari };
  };

  test('sunucu: kayıt, doğrulama, listeleme, düzenleme, silme', async () => {
    const liste = async () => (await api(`/platform/kosu-gruplari?projeId=${projeId}`)).gruplar as Json[];
    expect(await liste()).toEqual([]);
    const y = await api('/platform/kosu-gruplari/kaydet', { projeId, ad: '  Regresyon   testi ', senaryoIdleri: [s['A bir'], s['B iki'], s['A bir']] });
    expect(y.grup).toMatchObject({ projeId, ad: 'Regresyon testi', senaryoIdleri: [s['A bir'], s['B iki']] });
    // Doğrulama: boş ad, boş seçim, aynı ad (büyük/küçük harf duyarsız), bilinmeyen senaryo.
    expect((await api('/platform/kosu-gruplari/kaydet', { projeId, ad: ' ', senaryoIdleri: [s['A bir']] })).basarili).toBe(false);
    expect((await api('/platform/kosu-gruplari/kaydet', { projeId, ad: 'Boş', senaryoIdleri: [] })).basarili).toBe(false);
    expect((await api('/platform/kosu-gruplari/kaydet', { projeId, ad: 'REGRESYON TESTİ', senaryoIdleri: [s['A bir']] })).basarili).toBe(false);
    expect((await api('/platform/kosu-gruplari/kaydet', { projeId, ad: 'Yabancı', senaryoIdleri: ['yok-boyle-bir-senaryo'] })).basarili).toBe(false);
    // Düzenleme aynı kimlikle; ad aynı kalabilir.
    const d = await api('/platform/kosu-gruplari/kaydet', { projeId, id: y.grup.id, ad: 'Regresyon testi', senaryoIdleri: [s['A iki'], s['B bir']] });
    expect(d.grup.id).toBe(y.grup.id);
    const l = await liste();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ senaryoIdleri: [s['A iki'], s['B bir']], kayipSayisi: 0 });
    expect((await api('/platform/kosu-gruplari/sil', { projeId, id: y.grup.id })).basarili).toBe(true);
    expect((await api('/platform/kosu-gruplari/sil', { projeId, id: y.grup.id })).basarili).toBe(false);
    expect(await liste()).toEqual([]);
  });

  test('Basit mod: Testlerim > Koşu oluştur (karışık ekran seçimi) → kayıt → listele → Çalıştır → sil', async () => {
    test.setTimeout(90_000);
    expect((await api('/platform/kullanim-modu/kaydet', { mod: 'basit' })).basarili).toBe(true);
    const { baglam, page, hatalar, disari } = await sayfaAc('/#/testlerim');
    const bolum = page.getByRole('region', { name: 'Koşu grupları' });
    await expect(bolum).toContainText('Henüz koşu grubu yok');
    await bolum.getByRole('button', { name: 'Koşu oluştur' }).click();
    const p = page.getByRole('dialog', { name: 'Koşu oluştur' });
    // Ekran bazında gruplanmış liste: her ekranın kendi senaryoları.
    await expect(p.locator('.kosu-grubu-ekrani')).toHaveCount(2);
    await expect(p.locator('.kosu-grubu-ekrani').first()).toContainText('Ekran A');
    await expect(p.locator('.kosu-grubu-ekrani').first().getByRole('checkbox')).toHaveCount(5);
    await expect(p.getByText('Henüz senaryo seçilmedi.')).toBeVisible();
    // Doğrulama: ad ve seçim zorunlu.
    await p.getByRole('button', { name: 'Grubu kaydet' }).click();
    await expect(p.getByRole('alert')).toHaveText('Grup adını yazın.');
    await p.getByLabel('Grup adı').fill('Regresyon testi');
    await p.getByRole('button', { name: 'Grubu kaydet' }).click();
    await expect(p.getByRole('alert')).toHaveText('En az bir senaryo seçin.');
    // Ekran A'dan 3 (biri toplu koşuda kapalı), Ekran B'den 1 senaryo.
    for (const b of ['A bir', 'A üç', 'A kapalı', 'B iki']) await p.getByRole('checkbox', { name: b, exact: true }).check();
    await expect(p.getByText('4 senaryo seçili (2 ekran).')).toBeVisible();
    // Arama süzer.
    await p.getByRole('searchbox', { name: 'Senaryo ara' }).fill('B iki');
    await expect(p.locator('.kosu-grubu-ekrani').first()).toBeHidden();
    await p.getByRole('searchbox', { name: 'Senaryo ara' }).fill('');
    await expect(p.locator('.kosu-grubu-ekrani').first()).toBeVisible();
    await p.getByRole('button', { name: 'Grubu kaydet' }).click();
    await expect(p).toHaveCount(0);
    await expect(bolum.getByRole('listitem')).toHaveCount(1);
    await expect(bolum.getByRole('listitem')).toContainText('Regresyon testi');
    await expect(bolum.getByRole('listitem')).toContainText('4 senaryo · 2 ekran');
    // Kasada saklı: sunucudan yeniden okununca aynı.
    const kayit = ((await api(`/platform/kosu-gruplari?projeId=${projeId}`)).gruplar as Json[])[0];
    expect([...kayit.senaryoIdleri].sort()).toEqual([s['A bir'], s['A üç'], s['A kapalı'], s['B iki']].sort());
    // Düzenle: bir senaryo çıkar.
    await bolum.getByRole('button', { name: 'Düzenle: Regresyon testi' }).click();
    const d = page.getByRole('dialog', { name: 'Koşu grubunu düzenle' });
    await expect(d.getByRole('checkbox', { name: 'A üç', exact: true })).toBeChecked();
    await d.getByRole('checkbox', { name: 'A üç', exact: true }).uncheck();
    await d.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(bolum.getByRole('listitem')).toContainText('3 senaryo · 2 ekran');
    // Çalıştır: toplu koşu onayı; "Toplu koşuya dahil" kapalı olan atlanır, diğerleri koşar.
    await bolum.getByRole('button', { name: 'Çalıştır: Regresyon testi' }).click();
    const c = page.getByRole('dialog', { name: '"Regresyon testi" grubunu çalıştır?' });
    await expect(c.getByRole('list', { name: 'Çalıştırılacak senaryolar' }).getByRole('listitem')).toHaveText(['A bir', 'B iki']);
    await expect(c).toContainText('1 senaryo TEST ortamında koşu listesinde olmadığı (toplu koşuya dahil değil) için dahil edilmedi.');
    await c.getByRole('button', { name: '2 senaryoyu başlat' }).click();
    await expect(c).toHaveCount(0);
    // Web uygulaması izni kapalı olduğundan koşu bu pencerede durur (Ayarlar > İzinler); pencere kapatılır, panel satırları kalır.
    const izin = page.locator('dialog.izin-uyarisi');
    await expect(izin).toBeVisible();
    // Her senaryo için pencere bir kez açılır; hepsi kapanana kadar Kapat'a basılır.
    await expect(async () => {
      if (await izin.count()) await izin.first().getByRole('button', { name: 'Kapat' }).click();
      await page.waitForTimeout(400);
      expect(await izin.count()).toBe(0);
    }).toPass({ timeout: 15_000 });
    // Koşu paneli yalnız grubun koşacak senaryolarını gösterir.
    const panel = page.locator('.kosu-paneli');
    await expect(panel).toContainText('B iki');
    await expect(panel).toContainText('A bir');
    await expect(panel).not.toContainText('A kapalı');
    await expect(panel).not.toContainText('A iki');
    // Sil: onay sorulur; Vazgeç → kalır; onay → gider, senaryolar yerinde.
    await bolum.getByRole('button', { name: 'Sil: Regresyon testi' }).click();
    const o = page.getByRole('dialog', { name: 'Koşu grubu silinsin mi?' });
    await o.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(bolum.getByRole('listitem')).toHaveCount(1);
    await bolum.getByRole('button', { name: 'Sil: Regresyon testi' }).click();
    await o.getByRole('button', { name: 'Sil', exact: true }).click();
    await expect(bolum).toContainText('Henüz koşu grubu yok');
    expect(((await api(`/platform/kosu-gruplari?projeId=${projeId}`)).gruplar as Json[])).toEqual([]);
    expect(((await api(`/platform/senaryolar?projeId=${projeId}`)).senaryolar as Json[])).toHaveLength(6);
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await baglam.close();
  });

  test('Gelişmiş mod: Senaryolar > Koşu grupları penceresi (aynı bölüm)', async () => {
    expect((await api('/platform/kullanim-modu/kaydet', { mod: 'gelismis' })).basarili).toBe(true);
    const { baglam, page, hatalar } = await sayfaAc('/#/senaryolar');
    await page.getByRole('button', { name: 'Koşu grupları' }).click();
    const p = page.getByRole('dialog', { name: 'Koşu grupları' });
    await p.getByRole('button', { name: 'Koşu oluştur' }).click();
    const o = page.getByRole('dialog', { name: 'Koşu oluştur' });
    await o.getByLabel('Grup adı').fill('Gelişmiş grup');
    await o.getByRole('checkbox', { name: 'Ekran B: tüm senaryoları seç' }).check();
    await o.getByRole('checkbox', { name: 'A bir', exact: true }).check();
    await o.getByRole('button', { name: 'Grubu kaydet' }).click();
    await expect(p.getByRole('listitem')).toContainText('Gelişmiş grup');
    await expect(p.getByRole('listitem')).toContainText('3 senaryo · 2 ekran');
    const k = ((await api(`/platform/kosu-gruplari?projeId=${projeId}`)).gruplar as Json[])[0];
    expect([...k.senaryoIdleri].sort()).toEqual([s['A bir'], s['B bir'], s['B iki']].sort());
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('390 / 1440 px: Koşu grupları bölümü ve pencereler taşmaz', async () => {
    expect((await api('/platform/kullanim-modu/kaydet', { mod: 'basit' })).basarili).toBe(true);
    const { baglam, page, hatalar } = await sayfaAc('/#/testlerim');
    for (const genislik of [1440, 390]) {
      await page.setViewportSize({ width: genislik, height: 844 });
      await page.goto('/#/testlerim');
      const bolum = page.getByRole('region', { name: 'Koşu grupları' });
      await expect(bolum.getByRole('listitem')).toHaveCount(1);
      expect(await tasma(page), `${genislik}px sayfa`).toBeLessThanOrEqual(0);
      await bolum.getByRole('button', { name: 'Düzenle: Gelişmiş grup' }).click();
      const d = page.getByRole('dialog', { name: 'Koşu grubunu düzenle' });
      const kutu = await d.boundingBox();
      expect(kutu && kutu.x >= 0 && kutu.x + kutu.width <= genislik, `${genislik}px düzenleme penceresi`).toBe(true);
      expect(await tasma(page)).toBeLessThanOrEqual(0);
      await d.getByRole('button', { name: 'Vazgeç' }).click();
      await bolum.getByRole('button', { name: 'Çalıştır: Gelişmiş grup' }).click();
      const c = page.getByRole('dialog', { name: /grubunu çalıştır\?/ });
      const ck = await c.boundingBox();
      expect(ck && ck.x >= 0 && ck.x + ck.width <= genislik, `${genislik}px çalıştır penceresi`).toBe(true);
      expect(await tasma(page)).toBeLessThanOrEqual(0);
      await c.getByRole('button', { name: 'Vazgeç' }).click();
    }
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('silinen senaryo gruptan düşer (kayıp sayısı); proje silinince gruplar temizlenir', async () => {
    const ayrik = mkdtempSync(join(tmpdir(), 'kosu-gruplari-depo-'));
    try {
      const vt = await veritabaniniHazirla(join(ayrik, 'platform.db'));
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const p1 = projeKaydet(vt, { ad: 'Proje 1' });
      const p2 = projeKaydet(vt, { ad: 'Proje 2' });
      const o1 = ortamKaydet(vt, { projeId: p1, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true });
      const e1 = ekranKaydet(vt, { projeId: p1, anahtar: 'e1', ad: 'E1' });
      ekranModeliEkle(vt, { ekranId: e1, model: model('e1', 'E1') });
      const yeni = (baslik: string) => senaryoKaydet(vt, { projeId: p1, ekranId: e1, baslik, veri: { baslik, ad: 'Deneme' }, ortamIdleri: [o1] }).id;
      const x = yeni('X');
      const y = yeni('Y');
      const g = kosuGrubuKaydet(vt, { projeId: p1, ad: 'Grup', senaryoIdleri: [x, y] });
      // Başka projenin senaryosuyla grup kurulamaz.
      expect(() => kosuGrubuKaydet(vt, { projeId: p2, ad: 'Yabancı', senaryoIdleri: [x] })).toThrow(/bulunamadı/);
      // Silinen senaryo listeden düşer; kayıp sayısı gösterilir.
      senaryoSil(vt, y);
      expect(kosuGruplariniListele(vt, p1)[0]).toMatchObject({ id: g.id, senaryoIdleri: [x], kayipSayisi: 1 });
      expect(() => kosuGrubuSil(vt, p1, 'yok')).toThrow(/bulunamadı/);
      // Proje silinince gruplar da gider.
      projeyiSil(vt, p1, { medyaKlasoru: join(ayrik, 'medya') });
      expect(kosuGruplariniListele(vt, p1)).toEqual([]);
      vt.kapat();
    } finally {
      rmSync(ayrik, { recursive: true, force: true });
    }
  });
});
