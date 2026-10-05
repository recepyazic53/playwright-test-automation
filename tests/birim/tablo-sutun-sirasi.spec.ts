// KORUMA TESTLERİ — Test verisi tablo düzenleyicisinde sütun sırası: başlıktaki ← / → düğmeleri ("“Telefon” sütununu sola al"),
// tutamaktan sürükle-bırak (bırakma yeri çizgiyle), başlıkta Alt + ← / →. Sıra tablonun sıralı sütun dizisidir; Kaydet'le yazılır,
// "Değişiklikleri geri al" ile döner. Değerler, gizli işareti ve karşılıklar sütunla birlikte gider; ${Tablo.Sütun} adla bağlı
// olduğundan koşu sıra değişince de aynı değeri gönderir. Bağlam tablosunda taşıma yok. Yalnız 127.0.0.1 (sahte SOAP sunucusu).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Locator } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;

test.describe('tablo sütun sırası', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Sira-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let servisId = '';
  let kisiId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const kisi = async () => ((await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.id === kisiId) as Nesne;
  const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;
  /** Bağlı senaryo: Telefon (karşılıklı) ve Parola (gizli) adla başvurulur; ikinci kişi TC ile seçilir. */
  const kos = async (tabloSecimleri?: Nesne) => {
    await basarili('/platform/servis/senaryo/dene', {
      projeId, servisId, ortamId: testOrtami, baslik: 'Sıra', icerik: { operasyon: 'Siparis', kontroller: [], tabloSecimleri,
        govde: zarf('<IdentityNumber>${Kişi.TC}</IdentityNumber><Name>${Kişi.Ad}</Name><Phone>${Kişi.Telefon}</Phone><Password>${Kişi.Parola}</Password>') }
    });
    return String(soap.istekler.at(-1)?.govde ?? '');
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'tablo-sutun-sirasi-'));
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Sıra Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi })).id);
    kisiId = (await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Kişi', tur: 'kayit',
      sutunlar: [{ ad: 'TC' }, { ad: 'Ad' }, { ad: 'Telefon', karsiliklar: { '5550000001': { servis: '+905550000001' } } }, { ad: 'Parola', gizli: true }],
      satirlar: [
        { ad: 'birinci', degerler: { TC: SAHTE_TC, Ad: 'Ayşe', Telefon: '5550000001', Parola: 'gizli-1' } },
        { ad: 'ikinci', degerler: { TC: '00000000000', Ad: 'Mehmet', Telefon: '5550000002', Parola: 'gizli-2' } }]
    })).tablo.id;
    // İki alanlı bağlam tablosu (profillerden türer; sırası saklanmaz).
    await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad: 'varsayilan', alanlar: { subeKodu: '9001', bolge: 'B1' }, ortamId: null });
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  const ac = async (genislik = 1440) => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/veri');
    await page.getByRole('navigation', { name: 'Tablolar' }).getByRole('button', { name: /^Kişi \d+ sütun/ }).click();
    const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
    await expect(duz.getByLabel('1. satır TC')).toHaveValue(SAHTE_TC);
    return { baglam, page, duz, hatalar };
  };
  const basliklar = (duz: Locator) => duz.locator('thead th.veri-sutunu input[data-rol="ad"]');
  const sira = async (duz: Locator) => basliklar(duz).evaluateAll((l) => l.map((x) => (x as HTMLInputElement).value));
  /** 1. satırın hücreleri soldan sağa (satır adı ve ortam hariç). */
  const ilkSatir = (duz: Locator) => duz.locator('tbody tr').first().locator('td:not(.sira):not(.satir-adi-sutunu):not(.ortam-sutunu):not(.eylem) input')
    .evaluateAll((l) => l.map((x) => (x as HTMLInputElement).value));

  test('← / → düğmeleri: erişilebilir adlar, uçta devre dışı; değerler sütunla gider; odak aynı düğmede; geri al', async () => {
    const { baglam, page, duz, hatalar } = await ac();
    expect(await sira(duz)).toEqual(['TC', 'Ad', 'Telefon', 'Parola']);
    await expect(duz.getByRole('button', { name: '“TC” sütununu sola al' })).toBeDisabled();
    await expect(duz.getByRole('button', { name: '“Parola” sütununu sağa al' })).toBeDisabled();
    const sola = duz.getByRole('button', { name: '“Telefon” sütununu sola al' });
    await sola.click();
    expect(await sira(duz)).toEqual(['TC', 'Telefon', 'Ad', 'Parola']);
    await expect(sola).toBeFocused();
    expect(await ilkSatir(duz)).toEqual([SAHTE_TC, '5550000001', 'Ayşe', '']);
    await expect(duz.getByLabel('2. satır Telefon')).toHaveValue('5550000002');
    await expect(duz.getByText('kaydedilmemiş değişiklik')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '“Telefon” sütunu 2. sıraya taşındı' })).toHaveCount(1);
    // Ad yazıldıkça düğme adı güncellenir.
    await duz.getByLabel('3. sütunun adı').fill('Adı');
    await expect(duz.getByRole('button', { name: '“Adı” sütununu sağa al' })).toBeVisible();
    await duz.getByLabel('3. sütunun adı').fill('Ad');
    // Sağa al: soldaki sütun ilk sıradan çıkar; ilk sıraya gelen sütunun "sola al"ı devre dışı olur, odak "sağa al"da kalır.
    await duz.getByRole('button', { name: '“TC” sütununu sağa al' }).click();
    expect(await sira(duz)).toEqual(['Telefon', 'TC', 'Ad', 'Parola']);
    await expect(duz.getByRole('button', { name: '“TC” sütununu sağa al' })).toBeFocused();
    await expect(duz.getByRole('button', { name: '“Telefon” sütununu sola al' })).toBeDisabled();
    // Geri al: kayıtlı sıra döner.
    await duz.getByRole('button', { name: 'Değişiklikleri geri al' }).click();
    expect(await sira(duz)).toEqual(['TC', 'Ad', 'Telefon', 'Parola']);
    expect(await ilkSatir(duz)).toEqual([SAHTE_TC, 'Ayşe', '5550000001', '']);
    await expect(duz.getByText('kayıtlı', { exact: true })).toBeVisible();
    expect((await kisi()).sutunlar.map((s: Nesne) => s.ad)).toEqual(['TC', 'Ad', 'Telefon', 'Parola']);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('klavye (Alt + ← / →) ve sürükle-bırak (bırakma çizgisi); gizli ve karşılık sütunla gider; Kaydet + yeniden aç', async () => {
    // Sürükle-bırakta kaynak ve hedef başlık aynı anda görünsün diye geniş pencere (dar ekranda tablo kendi içinde kayar).
    const { baglam, page, duz, hatalar } = await ac(1920);
    const telefonOnce = await kos({ [`${kisiId}|`]: { TC: '00000000000' } });
    const birinciOnce = await kos();
    expect(telefonOnce).toContain('<Phone>5550000002</Phone><Password>gizli-2</Password>');
    expect(birinciOnce).toContain('<Phone>+905550000001</Phone><Password>gizli-1</Password>');
    // Klavye: "Ad" başlığı odaktayken Alt + → sağa, Alt + ← sola; odak aynı sütunun adında kalır.
    await duz.getByLabel('2. sütunun adı').focus();
    await page.keyboard.press('Alt+ArrowRight');
    expect(await sira(duz)).toEqual(['TC', 'Telefon', 'Ad', 'Parola']);
    await expect(duz.getByLabel('3. sütunun adı')).toBeFocused();
    await expect(duz.getByLabel('3. sütunun adı')).toHaveValue('Ad');
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await sira(duz)).toEqual(['Ad', 'TC', 'Telefon', 'Parola']);
    await expect(duz.getByLabel('1. sütunun adı')).toBeFocused();
    // İlk sütunda Alt + ← bir şey yapmaz.
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await sira(duz)).toEqual(['Ad', 'TC', 'Telefon', 'Parola']);
    // Sürükle-bırak: "Parola" tutamağı "TC" başlığının sol yarısına → TC'nin önüne; bırakmadan önce çizgi görünür.
    // (Ad kutusunda value niteliği yok, yalnız özelliği var; sütun konumu sıradan bulunur.)
    const th = async (ad: string) => duz.locator('thead th.veri-sutunu').nth((await sira(duz)).indexOf(ad));
    const kutu = async (l: Locator) => { const b = await l.boundingBox(); if (!b) throw new Error('kutu yok'); return b; };
    const tc = await th('TC');
    await tc.scrollIntoViewIfNeeded();
    const kaynak = await kutu((await th('Parola')).locator('.sutun-tutamagi'));
    const hedef = await kutu(tc);
    await page.mouse.move(kaynak.x + kaynak.width / 2, kaynak.y + kaynak.height / 2);
    await page.mouse.down();
    await page.mouse.move(hedef.x + 20, hedef.y + 20, { steps: 8 });
    await page.mouse.move(hedef.x + 12, hedef.y + 20, { steps: 2 });
    await expect(tc).toHaveClass(/birak-once/);
    expect(await tc.evaluate((e) => getComputedStyle(e, '::before').content)).not.toBe('none');
    await page.mouse.up();
    expect(await sira(duz)).toEqual(['Ad', 'Parola', 'TC', 'Telefon']);
    await expect(duz.locator('.birak-once, .birak-sonra, .surukleniyor')).toHaveCount(0);
    // Sağ yarıya bırakmak: arkasına ("Ad" → "Telefon"un arkasına).
    const telefon = await th('Telefon');
    const kaynak2 = await kutu((await th('Ad')).locator('.sutun-tutamagi'));
    const hedef2 = await kutu(telefon);
    await page.mouse.move(kaynak2.x + kaynak2.width / 2, kaynak2.y + kaynak2.height / 2);
    await page.mouse.down();
    await page.mouse.move(hedef2.x + hedef2.width - 20, hedef2.y + 20, { steps: 8 });
    await page.mouse.move(hedef2.x + hedef2.width - 12, hedef2.y + 20, { steps: 2 });
    await expect(telefon).toHaveClass(/birak-sonra/);
    await page.mouse.up();
    expect(await sira(duz)).toEqual(['Parola', 'TC', 'Telefon', 'Ad']);
    // Gizli işareti ve karşılıklar sütunla birlikte gitti; değerler doğru sütunda.
    await expect(duz.getByLabel('1. sütun gizli')).toBeChecked();
    await expect(duz.getByLabel('2. sütun gizli')).not.toBeChecked();
    await expect(duz.getByRole('button', { name: '3. sütunun karşılıkları (1)' })).toBeVisible();
    await expect(duz.getByRole('button', { name: /^1\. sütunun karşılıkları/ })).toHaveCount(0);
    await expect(duz.getByLabel('1. satır Parola')).toHaveAttribute('type', 'password');
    expect(await ilkSatir(duz)).toEqual(['', SAHTE_TC, '5550000001', 'Ayşe']);
    // Kaydet: yalnız sütun sırası değişti (satır gönderilmez, değer kaybolmaz).
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect(duz.getByText('kayıtlı', { exact: true })).toBeVisible();
    const t = await kisi();
    expect(t.sutunlar).toEqual([
      { ad: 'Parola', gizli: true, tip: 'metin' }, { ad: 'TC', gizli: false, tip: 'metin' },
      { ad: 'Telefon', gizli: false, tip: 'metin', karsiliklar: { '5550000001': { servis: '+905550000001' } } }, { ad: 'Ad', gizli: false, tip: 'metin' }]);
    expect(t.satirlar.map((r: Nesne) => [r.ad, r.degerler, r.doluGizli])).toEqual([
      ['birinci', { Parola: null, TC: SAHTE_TC, Telefon: '5550000001', Ad: 'Ayşe' }, ['Parola']],
      ['ikinci', { Parola: null, TC: '00000000000', Telefon: '5550000002', Ad: 'Mehmet' }, ['Parola']]]);
    // Yeniden aç: sıra korunur, değerler doğru sütunda.
    await page.reload();
    await page.getByRole('navigation', { name: 'Tablolar' }).getByRole('button', { name: /^Kişi \d+ sütun/ }).click();
    await expect(duz.getByLabel('1. satır TC')).toHaveValue(SAHTE_TC);
    expect(await sira(duz)).toEqual(['Parola', 'TC', 'Telefon', 'Ad']);
    await expect(duz.getByLabel('2. satır Ad', { exact: true })).toHaveValue('Mehmet');
    await expect(duz.getByLabel('1. satır Parola')).toHaveAttribute('placeholder', '•••• kayıtlı');
    // Sütuna (adla) bağlı senaryo: sıra değişince koşu aynı değerleri gönderir (karşılık ve gizli değer dahil).
    expect(await kos({ [`${kisiId}|`]: { TC: '00000000000' } })).toBe(telefonOnce);
    expect(await kos()).toBe(birinciOnce);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('390 px: başlık denetimleri taşmaz, tablo kendi içinde yana kayar; bağlam tablosunda taşıma yok', async () => {
    const { baglam, page, duz, hatalar } = await ac(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const kap = duz.locator('.veri-tablosu-kap');
    expect(await kap.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
    // Her başlıkta denetimler başlık kutusunun içinde.
    const tasan = await duz.locator('thead th.veri-sutunu').evaluateAll((l) => l.filter((th) => {
      const k = th.getBoundingClientRect();
      return [...th.querySelectorAll('.sutun-tasima, .sutun-tasima button')].some((x) => { const r = x.getBoundingClientRect(); return r.left < k.left - 1 || r.right > k.right + 1; });
    }).length);
    expect(tasan).toBe(0);
    // Sağa almak yatay kaydırmayı bozmaz: düğme görünür alana gelip tıklanır.
    await duz.getByRole('button', { name: '“Telefon” sütununu sağa al' }).click();
    expect(await sira(duz)).toEqual(['Parola', 'TC', 'Ad', 'Telefon']);
    await duz.getByRole('button', { name: 'Değişiklikleri geri al' }).click();
    // Bağlam tablosu: sıra profillerden türer, taşıma denetimi gösterilmez.
    await page.getByRole('navigation', { name: 'Tablolar' }).getByRole('button', { name: /^Şube/ }).click();
    await expect(duz.getByLabel('1. sütunun adı')).toHaveValue('subeKodu');
    await expect(duz.getByRole('button', { name: /sütununu (sola|sağa) al$/ })).toHaveCount(0);
    await expect(duz.locator('.sutun-tutamagi')).toHaveCount(0);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
