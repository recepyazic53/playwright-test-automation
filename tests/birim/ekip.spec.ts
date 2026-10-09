// KORUMA TESTLERİ — Ayarlar > Ekip (ekip.mjs): dosyayı açabilecek kullanıcı adları ve roller. Liste boşken herkes açar (ad yazılırsa
// o kişi ilk Admin olur); liste doluysa listede olmayan ad "Yetkili değilsiniz" alır ve kasa kilitli kalır. Ekip bölümü ve uçları
// yalnız Admin'e açıktır; girişteki ad ekip paylaşımında "kim yaptı" adı olur.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { ekipUyeleriKaydet, ekipUyeleriOku, girisDenetle } from '../../scripts/platform/ekip.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('ekip listesi: boşken ilk ad Admin olur; doluyken yalnız listedekiler; kayıt kuralları', async () => {
  const klasor = geciciKlasor('ekip');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Ekip-Parolasi-1', { kdf: HIZLI_KDF });
    expect(girisDenetle(vt, '')).toEqual({ ad: '', rol: 'admin' });
    expect(ekipUyeleriOku(vt)).toEqual([]);
    expect(girisDenetle(vt, ' Recep ')).toEqual({ ad: 'Recep', rol: 'admin' });
    expect(ekipUyeleriOku(vt)).toEqual([{ ad: 'Recep', rol: 'admin' }]);
    expect(girisDenetle(vt, 'recep')).toEqual({ ad: 'Recep', rol: 'admin' });
    expect(girisDenetle(vt, 'Ayşe')).toBeNull();
    expect(girisDenetle(vt, '')).toBeNull();
    expect(ekipUyeleriKaydet(vt, [{ ad: 'Recep', rol: 'admin' }, { ad: 'Ayşe', rol: 'kullanici' }], 'Recep')).toHaveLength(2);
    expect(girisDenetle(vt, 'AYŞE')).toEqual({ ad: 'Ayşe', rol: 'kullanici' });
    expect(() => ekipUyeleriKaydet(vt, [{ ad: 'Ayşe', rol: 'admin' }], 'Recep')).toThrow('Kendinizi listeden silemez');
    expect(() => ekipUyeleriKaydet(vt, [{ ad: 'Recep', rol: 'kullanici' }], 'Recep')).toThrow('en az bir Admin');
    expect(() => ekipUyeleriKaydet(vt, [{ ad: 'Recep', rol: 'admin' }, { ad: 'recep', rol: 'kullanici' }], 'Recep')).toThrow('birden fazla');
    expect(() => ekipUyeleriKaydet(vt, [{ ad: 'Recep', rol: 'patron' }], 'Recep')).toThrow('Admin ya da Kullanıcı');
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'ekip-uyeleri'")?.deger_json)).toMatch(/^kasa:v1:/);
  } finally { vt.kapat(); klasor.temizle(); }
});

test.describe('kasa açılışı ve Ayarlar > Ekip', () => {
  const PAROLA = `Gecici-EkipUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ekip-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('ilk ad Admin; listede olmayan "Yetkili değilsiniz" (kasa kilitli kalır); Kullanıcı Ekip bölümünü görmez', async () => {
    test.setTimeout(120_000);
    // İlk açan (ad yazarak) Admin olur; durum kişiyi ve rolü verir.
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA, kullaniciAdi: 'Recep' })).basarili).toBe(true);
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Ekip Projesi' });
    expect((await nobetciApi(nobetci, '/platform/durum')).kullanici).toMatchObject({ ad: 'Recep', rol: 'admin', ekipVar: true });
    expect((await nobetciApi(nobetci, '/platform/ekip/kaydet', { uyeler: [{ ad: 'Recep', rol: 'admin' }, { ad: 'Ayşe', rol: 'kullanici' }] })).basarili).not.toBe(false);
    // Ekip paylaşımında "kim yaptı" adı girişteki ad.
    expect((await nobetciApi(nobetci, '/platform/ortak/durum')).kullaniciAdi).toBe('Recep');
    // Listede olmayan: 403 YETKISIZ, kasa kilitli.
    await nobetciApi(nobetci, '/platform/kasa/kilitle', { tamamen: true });
    const red = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA, kullaniciAdi: 'Mehmet' });
    expect(red).toMatchObject({ basarili: false, kod: 'YETKISIZ' });
    expect(String(red.mesaj)).toContain('Yetkili değilsiniz');
    expect((await nobetciApi(nobetci, '/platform/durum') as { kasa: { acik: boolean } }).kasa.acik).toBe(false);
    // Kullanıcı rolü: Ekip uçları reddedilir.
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA, kullaniciAdi: 'ayşe' })).basarili).toBe(true);
    expect(await nobetciApi(nobetci, '/platform/ekip')).toMatchObject({ basarili: false, kod: 'YETKISIZ' });
    expect(await nobetciApi(nobetci, '/platform/ekip/kaydet', { uyeler: [] })).toMatchObject({ basarili: false, kod: 'YETKISIZ' });

    // Arayüz: kilit ekranında kullanıcı adı; Kullanıcı Ayarlar'da Ekip'i görmez, Admin görür ve düzenler.
    await nobetciApi(nobetci, '/platform/kasa/kilitle', { tamamen: true });
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Kullanıcı adı', exact: true }).fill('Mehmet');
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByRole('button', { name: 'Kilidi aç' }).click();
    await expect(page.getByText('Yetkili değilsiniz')).toBeVisible();
    await page.getByRole('textbox', { name: 'Kullanıcı adı', exact: true }).fill('Ayşe');
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByRole('button', { name: 'Kilidi aç' }).click();
    await page.goto('/#/ayarlar/guvenlik');
    const altNav = page.getByRole('navigation', { name: 'Ayarlar bölümleri' });
    await expect(altNav.getByRole('link', { name: 'Güvenlik' })).toBeVisible();
    await expect(altNav.getByRole('link', { name: 'Ekip' })).toHaveCount(0);
    await nobetciApi(nobetci, '/platform/kasa/kilitle', { tamamen: true });
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Kullanıcı adı', exact: true })).toHaveValue('Ayşe');
    await page.getByRole('textbox', { name: 'Kullanıcı adı', exact: true }).fill('Recep');
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByRole('button', { name: 'Kilidi aç' }).click();
    await page.goto('/#/ayarlar/ekip');
    const kart = page.getByRole('group', { name: 'Ekip' });
    await expect(kart).toContainText('Giriş yapan: Recep');
    await kart.getByRole('button', { name: 'Kişi ekle' }).click();
    await kart.getByLabel('3. kişinin kullanıcı adı').fill('Mehmet');
    await kart.getByRole('button', { name: 'Kaydet' }).click();
    await expect.poll(async () => ((await nobetciApi(nobetci, '/platform/ekip')).uyeler as Array<{ ad: string }>).map((u) => u.ad)).toEqual(['Recep', 'Ayşe', 'Mehmet']);
    await expect(kart.getByRole('button', { name: 'Recep: sil' })).toBeDisabled();
    expect(hatalar).toEqual([]);
  });

  test('Ayarlar kartları başlığıyla kapalı başlar, tıklayınca açılır, açık olan hatırlanır', async () => {
    test.setTimeout(60_000);
    // Bu test tek başına da koşabilsin: kasa Recep (Admin) ile açık.
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA, kullaniciAdi: 'Recep' });
    if (!((await nobetciApi(nobetci, '/platform/projeler')).projeler as unknown[]).length) await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Kart Projesi' });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    // Otomasyonda kartlar açık başlar; bu test kullanıcının gördüğü varsayılanı (kapalı) dener.
    await baglam.addInitScript(() => { try { localStorage.setItem('nobetci.ayarKartlariVarsayilan', 'kapali'); } catch { /* yok */ } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/guvenlik');
    const form = page.getByRole('form', { name: 'Maskeleme' });
    const dugme = form.getByRole('button', { name: 'Maskeleme: aç / kapat' });
    await expect(dugme).toHaveAttribute('aria-expanded', 'false');
    await expect(form.getByLabel('Ek gizli adlar (her satıra bir ad)')).toBeHidden();
    await form.getByRole('heading', { name: /Maskeleme/ }).click();
    await expect(dugme).toHaveAttribute('aria-expanded', 'true');
    await expect(form.getByLabel('Ek gizli adlar (her satıra bir ad)')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('form', { name: 'Maskeleme' }).getByLabel('Ek gizli adlar (her satıra bir ad)')).toBeVisible();
    await page.getByRole('form', { name: 'Maskeleme' }).getByRole('button', { name: 'Maskeleme: aç / kapat' }).click();
    await expect(page.getByRole('form', { name: 'Maskeleme' }).getByLabel('Ek gizli adlar (her satıra bir ad)')).toBeHidden();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('Düzenle formu tıklanan satırın hemen altında ve açık gelir; "Ortam ekle" formu listenin altında', async () => {
    test.setTimeout(60_000);
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA, kullaniciAdi: 'Recep' });
    let projeler = (await nobetciApi(nobetci, '/platform/projeler')).projeler as Array<{ id: string }>;
    if (!projeler.length) { await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Kart Projesi' }); projeler = (await nobetciApi(nobetci, '/platform/projeler')).projeler as Array<{ id: string }>; }
    const projeId = projeler[0].id;
    for (const [ad, varsayilan] of [['TESTX', true], ['UATX', false]] as const) {
      await nobetciApi(nobetci, '/platform/ortam/kaydet', { projeId, ad, tabanUrl: `http://127.0.0.1:9/${ad.toLowerCase()}/`, varsayilan, riskli: false });
    }
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    await baglam.addInitScript(() => { try { localStorage.setItem('nobetci.ayarKartlariVarsayilan', 'kapali'); } catch { /* yok */ } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/proje');
    const ortamKarti = page.locator('.kart').filter({ has: page.getByRole('heading', { name: /^Ortamlar/ }) });
    await ortamKarti.getByRole('heading', { name: /^Ortamlar/ }).click();
    await page.getByRole('button', { name: 'UATX: düzenle' }).click();
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Ortamı düzenle: UATX' }) });
    await expect(form.getByLabel('Ortam adı')).toBeVisible();
    // Form, UATX satırının hemen altındaki satırda; satır "düzenleniyor".
    expect(await form.evaluate((f) => {
      const kap = f.closest('li.kayit-duzenleme');
      const onceki = kap?.previousElementSibling;
      return Boolean(kap && onceki?.classList.contains('duzenleniyor') && onceki.textContent?.includes('UATX'));
    })).toBe(true);
    await form.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.locator('li.duzenleniyor')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ortam ekle' }).click();
    const yeni = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Yeni ortam' }) });
    await expect(yeni.getByLabel('Ortam adı')).toBeVisible();
    // Yeni ortam formu listenin altında (liste içinde değil).
    expect(await yeni.evaluate((f) => !f.closest('li') && Boolean(f.parentElement?.previousElementSibling?.matches('ul.kayit-listesi')))).toBe(true);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
