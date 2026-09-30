// ARAYÜZ — Talep no ve kapsam matrisi: senaryo formlarında "Talep no" alanı (çip, otomatik tamamlama, benzer yazım uyarısı, kalan
// yazının kaydı), ekran / servis / uçtan uca listelerinde "Talep" süzgeci, "Bu talebin senaryolarını koş" (mevcut koşu diyaloğu; CANLI
// ortamda onay penceresi, vazgeçilince hiçbir istek yok; TEST'te ekran + servis + uçtan uca GERÇEK koşu — sahte uygulama ve sahte SOAP
// sunucusunda) ve Sonuçlar > Raporlar > Kapsam matrisi (süzgeç, CSV ve PDF indirme). 1440 ve 390 px'te yatay taşma yok.
// Güvenlik: yalnız 127.0.0.1 — örnek başvuru fikstürü ve sahte SOAP sunucusu; ayrı Nöbetçi örneği geçici veritabanıyla (gerçek
// Nöbetçi'ye ve veri/ klasörüne dokunulmaz); yasaklı adres koruması açık.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-TalepUI-${randomBytes(6).toString('hex')}`;
const zarf = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input><IdentityNumber>${SAHTE_TC}</IdentityNumber></Input></Siparis></s:Body></s:Envelope>`;

test.describe('talep no ve kapsam matrisi arayüzü', () => {
  test.describe.configure({ mode: 'serial' });
  let nobetci: Nobetci;
  let uygulama: OrnekBasvuruUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let TEST = '';
  let servisId = '';
  let ekranSenaryosu = '';
  let s1 = '';
  let s2 = '';
  let akisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    klasor = mkdtempSync(join(tmpdir(), 'talep-no-arayuz-'));
    // Örnek başvurunun dosya alanı: izinli yükleme klasöründe sahte belge.
    const yukleme = join(klasor, 'yuklenecek');
    mkdirSync(yukleme);
    writeFileSync(join(yukleme, 'ornek-belge.txt'), 'Sahte belge içeriği.\n');
    uygulama = new OrnekBasvuruUygulamasi({ totp: true });
    fikstur = await yerelSunucu(uygulama.isle);
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_YUKLEME_KLASORU: yukleme });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Talep Arayüz Projesi' })).proje.id);
    TEST = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    const CANLI = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: fikstur.adres, riskli: true })).ortam.id);
    await basarili('/platform/giris-profili/kaydet', {
      projeId, ortamId: TEST, ad: 'Deneme kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
    });
    await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId: TEST, tarif: ornekGirisTarifi() });
    for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [0], ortamIdleri: [TEST] });
    ekranSenaryosu = String((await basarili(`/platform/senaryolar?projeId=${projeId}`)).senaryolar[0].id);
    // Servis: TEST ve CANLI'da sahte SOAP sunucusunda.
    const tabanlar = { [TEST]: soap.adres, [CANLI]: soap.adres };
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: TEST, yol: '/Servis/ornek.asmx', tabanlar });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', tabanlar, erisimKimligi: e.erisimKimligi })).id);
    const senaryo = async (baslik: string, ek: Nesne) => String((await basarili('/platform/servis/senaryo/kaydet', {
      projeId, servisId, baslik, kapsam: 'ikisi', icerik: { operasyon: 'Siparis', govde: zarf, kontroller: [{ tur: 'soapYaniti' }], ...ek }
    })).id);
    s1 = await senaryo('Sipariş sorgu', { talepler: ['TALEP-101'] });
    s2 = await senaryo('Sipariş iptal', {});
    akisId = String((await basarili('/platform/uctan-uca/kaydet', {
      projeId, baslik: 'Sipariş uçtan uca', kapsam: 'test', icerik: { adimlar: [{ ad: 'Sorgu', servisId, senaryoId: s1, okumalar: [] }], talepler: ['TALEP-101'] }
    })).id);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  /** Yatay taşma yok. */
  const tasmaYok = async (page: Page, ne: string) => {
    const t = await page.evaluate(() => ({ genislik: document.documentElement.scrollWidth, gorunen: document.documentElement.clientWidth }));
    expect(t.genislik, `${ne}: yatay taşma`).toBeLessThanOrEqual(t.gorunen + 1);
  };
  /** 1440 ve 390 px'te taşma yok (görünüm boyutu değişir; ekranın durumu — süzgeç vb. — korunur). */
  const ikiGenislikte = async (page: Page, ne: string, hazir: () => Promise<void>) => {
    for (const genislik of [1440, 390]) {
      await page.setViewportSize({ width: genislik, height: 900 });
      await page.waitForTimeout(150);
      await hazir();
      await tasmaYok(page, `${ne} (${genislik} px)`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  };
  const talepleri = async () => {
    const [ekran, servis, akis] = await Promise.all([
      basarili(`/platform/senaryo?id=${ekranSenaryosu}`), basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`), basarili(`/platform/servis-akisi?projeId=${projeId}&id=${akisId}`)
    ]);
    return {
      ekran: ekran.senaryo.talepler as string[],
      s2: (servis.senaryolar as Nesne[]).find((x) => x.id === s2)?.icerik.talepler as string[] | undefined,
      akis: akis.akis.icerik.talepler as string[]
    };
  };

  test('formlarda "Talep no": öneri, çip, benzer yazım, kaldırma, kalan yazı kaydedilir (ekran, servis, uçtan uca)', async () => {
    test.setTimeout(120_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));

    // Ekran senaryosu formu.
    await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(ekranSenaryosu)}`);
    const girdi = page.getByRole('combobox', { name: 'Talep no' });
    await expect(girdi).toBeVisible();
    const cipler = page.getByRole('list', { name: 'Eklenen talepler' });
    // Otomatik tamamlama: projedeki talep önerilir; seçilince çip olur.
    await girdi.click();
    await girdi.fill('tal');
    await page.getByRole('option', { name: 'TALEP-101' }).click();
    await expect(cipler.getByRole('listitem')).toHaveText(['TALEP-101']);
    // Aynı talep (harf farkı) ikinci kez eklenmez; işaret farkında benzer yazım uyarısı ve tek tıkla projedeki yazım.
    await girdi.fill('talep-101');
    await girdi.press('Enter');
    await expect(page.locator('.talep-notu')).toContainText('zaten ekli');
    await girdi.fill('Talep 101');
    await girdi.press('Enter');
    await expect(cipler.getByRole('listitem')).toHaveText(['TALEP-101', 'Talep 101']);
    await expect(page.locator('.talep-notu')).toContainText('Benzer talep var: "TALEP-101"');
    await page.getByRole('button', { name: '"TALEP-101" kullan' }).click();
    await expect(cipler.getByRole('listitem')).toHaveText(['TALEP-101']);
    // Virgül ekler; × kaldırır.
    await girdi.fill('TALEP-202,');
    await expect(cipler.getByRole('listitem')).toHaveText(['TALEP-101', 'TALEP-202']);
    await page.getByRole('button', { name: 'Talebi kaldır: TALEP-202' }).click();
    await expect(cipler.getByRole('listitem')).toHaveText(['TALEP-101']);
    // Enter'a basılmamış yazı da kaydedilir (baştaki / sondaki boşluk kırpılır).
    await girdi.fill('  TALEP-303  ');
    await tasmaYok(page, 'senaryo formu');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(page).toHaveURL(/#\/senaryolar\/u\//);
    expect((await talepleri()).ekran).toEqual(['TALEP-101', 'TALEP-303']);
    await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(ekranSenaryosu)}`);
    await ikiGenislikte(page, 'senaryo formu', async () => { await expect(page.getByRole('list', { name: 'Eklenen talepler' }).getByRole('listitem')).toHaveCount(2); });

    // Servis senaryosu düzenleyicisi.
    await page.goto(`/#/servisler/s/${servisId}/senaryo/${s2}`);
    await expect(page.getByRole('heading', { name: 'Senaryoyu düzenle' })).toBeVisible();
    const servisGirdisi = page.getByRole('combobox', { name: 'Talep no' });
    await expect(servisGirdisi).toBeVisible();
    await servisGirdisi.fill('TALEP-101');
    await servisGirdisi.press('Enter');
    await expect(page.getByRole('list', { name: 'Eklenen talepler' }).getByRole('listitem')).toHaveText(['TALEP-101']);
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Senaryo kaydedildi.')).toBeVisible();
    expect((await talepleri()).s2).toEqual(['TALEP-101']);
    await ikiGenislikte(page, 'servis senaryosu', async () => { await expect(page.getByRole('combobox', { name: 'Talep no' })).toBeVisible(); });

    // Uçtan uca akış tasarımı: kayıtlı talep çip olarak gelir; eklenen kaydedilir.
    await page.goto(`/#/akislar/${akisId}`);
    await expect(page.getByRole('heading', { name: 'Uçtan uca akışı düzenle' })).toBeVisible();
    const akisGirdisi = page.getByRole('combobox', { name: 'Talep no' });
    await expect(page.getByRole('list', { name: 'Eklenen talepler' }).getByRole('listitem')).toHaveText(['TALEP-101']);
    await akisGirdisi.fill('TALEP-404');
    await akisGirdisi.press('Enter');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Akış kaydedildi.')).toBeVisible();
    expect((await talepleri()).akis).toEqual(['TALEP-101', 'TALEP-404']);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('listelerde "Talep" süzgeci (ekran, servis, uçtan uca) ve "Bu talebin senaryolarını koş" görünürlüğü', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/senaryolar');
    const talep = page.getByRole('combobox', { name: 'Talep', exact: true });
    await expect(talep).toBeVisible();
    // Senaryo tablosunda "Talep no" ilk veri sütunudur (seçim kutusundan hemen sonra); "Bağlam profili" (senaryoda profil seçimi varsa
    // görünür) başlığı tek cümleyle açıklanır.
    await expect(page.locator('.senaryo-tablosu thead th').nth(1)).toHaveText('Talep no');
    await expect(page.getByRole('columnheader', { name: 'Bağlam profili' })).toHaveAttribute('title', /acente ya da şube/);
    await expect(page.locator('.senaryo-tablosu tbody td.talep-hucresi', { hasText: 'TALEP-101' })).not.toHaveCount(0);
    const kos = page.getByRole('button', { name: 'Bu talebin senaryolarını koş' });
    await expect(kos).toBeHidden();
    await talep.selectOption('TALEP-303');
    await expect(page.locator('.senaryo-tablosu tbody tr')).toHaveCount(1);
    await expect(kos).toBeVisible();
    await ikiGenislikte(page, 'Senaryolar (süzgeç)', async () => { await expect(page.getByRole('button', { name: 'Bu talebin senaryolarını koş' })).toBeVisible(); });
    await page.getByRole('button', { name: 'Filtreleri temizle' }).click();
    await expect(kos).toBeHidden();

    // Servis senaryoları: TALEP-101 → iki senaryo; TALEP-202 seçeneği yok.
    await page.goto(`/#/servisler/s/${servisId}`);
    await expect(page.locator('tr[data-senaryo]').first()).toBeVisible();
    const servisTalep = page.getByRole('combobox', { name: 'Talep', exact: true });
    await expect(servisTalep.locator('option')).toHaveText(['Tümü', 'TALEP-101']);
    await servisTalep.selectOption('TALEP-101');
    await expect(page.locator('tr[data-senaryo]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Bu talebin senaryolarını koş' })).toBeVisible();

    // Uçtan uca akışlar.
    await page.goto('/#/akislar');
    await expect(page.getByRole('heading', { name: 'Uçtan uca akışlar', level: 2 })).toBeVisible();
    const akisTalep = page.getByRole('combobox', { name: 'Talep', exact: true });
    await expect(akisTalep.locator('option')).toHaveText(['Tümü', 'TALEP-101', 'TALEP-404']);
    await akisTalep.selectOption('TALEP-404');
    await expect(page.getByRole('row', { name: /Sipariş uçtan uca/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bu talebin senaryolarını koş' })).toBeVisible();
    await ikiGenislikte(page, 'Uçtan uca akışlar (süzgeç)', async () => { await expect(page.getByRole('row', { name: /Sipariş uçtan uca/ })).toBeVisible(); });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('"Bu talebin senaryolarını koş": koşu diyaloğu, CANLI onayı (vazgeç → istek yok), TEST\'te ekran + servis + uçtan uca gerçek koşu', async () => {
    test.setTimeout(300_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/senaryolar');
    await page.getByRole('combobox', { name: 'Talep', exact: true }).selectOption('TALEP-101');
    await page.getByRole('button', { name: 'Bu talebin senaryolarını koş' }).click();
    const diyalog = page.getByRole('dialog', { name: '"TALEP-101" talebinin senaryolarını koş?' });
    await expect(diyalog).toBeVisible();
    const liste = diyalog.getByRole('list', { name: 'Çalıştırılacak senaryolar' });
    // TEST (varsayılan): ekran senaryosu, iki servis senaryosu ve uçtan uca akış.
    await expect(liste.getByRole('listitem')).toHaveCount(4);
    await expect(liste).toContainText('Ekran · ');
    await expect(liste).toContainText('Servis (Ornek) · Sipariş sorgu');
    await expect(liste).toContainText('Servis (Ornek) · Sipariş iptal');
    await expect(liste).toContainText('Uçtan uca · Sipariş uçtan uca');
    // CANLI: ekran senaryosu ve akış bu ortamda koşamaz (nedeniyle listelenir); Başlat → tek tip CANLI onayı; vazgeçilince istek yok.
    await diyalog.getByLabel('Ortam', { exact: true }).selectOption({ label: 'CANLI (Canlı)' });
    await expect(liste.getByRole('listitem')).toHaveCount(2);
    await expect(diyalog.locator('.atlananlar-listesi')).toContainText('2 senaryo CANLI ortamında atlanır');
    await tasmaYok(page, 'talep koşu diyaloğu');
    const once = soap.istekler.length;
    await diyalog.getByRole('button', { name: '2 senaryoyu başlat' }).click();
    const canliOnayi = page.getByRole('dialog', { name: 'CANLI ortam' });
    await expect(canliOnayi).toBeVisible();
    await canliOnayi.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(canliOnayi).toBeHidden();
    await page.waitForTimeout(500);
    expect(soap.istekler.length).toBe(once);

    // TEST: gerçek koşu (ekran → servis → uçtan uca, sırayla).
    await page.getByRole('button', { name: 'Bu talebin senaryolarını koş' }).click();
    await expect(diyalog).toBeVisible();
    await diyalog.getByLabel('Ortam', { exact: true }).selectOption({ label: 'TEST' });
    await diyalog.getByRole('button', { name: '4 senaryoyu başlat' }).click();
    await expect(page.getByText(/"TALEP-101" talebinin koşusu bitti: 1 ekran, 2 servis, 1 uçtan uca/)).toBeVisible({ timeout: 240_000 });
    // Servis istekleri: iki servis senaryosu + akıştaki bir adım.
    expect(soap.istekler.length - once).toBe(3);
    const { matris } = await basarili(`/platform/kapsam-matrisi?projeId=${projeId}&ortamId=${TEST}`);
    const satirlar = (matris.satirlar as Nesne[]).filter((r) => r.talep === 'TALEP-101');
    expect(satirlar.map((r) => `${r.tur}:${r.sonuc}`).sort()).toEqual(['ekran:basarili', 'servis:basarili', 'servis:basarili', 'uctanUca:basarili']);
    expect(satirlar.every((r) => r.ortamAdi === 'TEST')).toBe(true);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('Kapsam matrisi ekranı: tablo, ortam süzgeci, CSV ve PDF indirme; 1440 / 390 px taşma yok', async () => {
    test.setTimeout(120_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/sonuclar/raporlar');
    await page.getByRole('link', { name: 'Kapsam matrisi' }).click();
    await expect(page).toHaveURL(/#\/sonuclar\/raporlar\/kapsam$/);
    await expect(page.getByRole('heading', { name: 'Kapsam matrisi', level: 2 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Raporlar' })).toHaveAttribute('aria-selected', 'true');
    const talepler = page.getByRole('table', { name: 'Talepler' });
    await expect(talepler.getByRole('rowheader')).toHaveText(['TALEP-101', 'TALEP-303', 'TALEP-404']);
    const matris = page.getByRole('table', { name: 'Talep × senaryo' });
    await expect(matris.locator('tbody tr[data-talep="TALEP-101"]')).toHaveCount(4);
    await expect(matris.locator('tbody tr[data-talep="TALEP-101"]').first()).toContainText('Başarılı');
    // Ortam süzgeci: CANLI'da hiç koşu yok → hepsi "Koşmadı".
    await page.getByRole('combobox', { name: 'Ortam' }).selectOption({ label: 'CANLI' });
    await expect(matris.getByText('Başarılı')).toHaveCount(0);
    await expect(page.locator('.kapsam-ozeti')).toContainText('0 başarılı');
    await page.getByRole('combobox', { name: 'Ortam' }).selectOption({ label: 'Tüm ortamlar' });
    await expect(page.locator('.kapsam-ozeti')).toContainText('6 başarılı');
    // CSV ve PDF (tarayıcıda indirilir; sunucu diske yazmaz).
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV indir' }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^nobetci-kapsam-matrisi-.+\.csv$/);
    const csvMetni = readFileSync(await csv.path(), 'utf8');
    expect(csvMetni.replace(/^﻿/, '').split('\r\n')[0]).toBe('Talep;Tür;Senaryo;Ekran / servis;Son sonuç;Tarih;Ortam');
    expect(csvMetni).toContain('TALEP-101;Uçtan uca akış;Sipariş uçtan uca;;Başarılı;');
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF indir' }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^nobetci-kapsam-matrisi-.+\.pdf$/);
    expect(readFileSync(await pdf.path()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await ikiGenislikte(page, 'Kapsam matrisi', async () => { await expect(page.getByRole('table', { name: 'Talep × senaryo' })).toBeVisible(); });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
