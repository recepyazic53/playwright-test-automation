// KORUMA TESTLERİ — Test verisi tabloları (Ayarlar > Test verisi > Tablolar): tablo = sütunlar + satırlar (birlikte geçerli
// değerler). Saklama mevcut test verisi tablolarında: her değer diskte şifreli, gizli sütun hiçbir yanıtta dönmez; sütun adı
// değişince değerler taşınır; mevcut satırın adı (eski senaryolar adıyla seçer) korunur. Arayüz: ızgara düzenleme,
// yapıştırarak içe alma (başlık satırı sütun olur), gizli hücre, kaydedilmemiş değişiklikte tablo değiştirme onayı.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniAc } from '../../scripts/platform/veritabani/baglanti.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { sahteXlsx } from './xlsx-fikstur';

type Nesne = Record<string, any>;

test.describe('test verisi tabloları', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Tablo-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let vtYolu = '';
  let projeId = '';
  let testOrtami = '';
  let girisId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const tablolar = async () => (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'tablolar-'));
    vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Tablo Projesi' })).proje.id);
    testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true })).ortam.id);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('tablo kaydedilir: değerler diskte şifreli, gizli sütun yanıtta yok; ortam satırı', async () => {
    const r = await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Servis girişi', sutunlar: [{ ad: 'Kanal' }, { ad: 'Kullanıcı' }, { ad: 'Parola', gizli: true }],
      satirlar: [
        { degerler: { Kanal: '10001', Kullanıcı: '10001001', Parola: 'gizli-1' } },
        { degerler: { Kanal: '10001', Kullanıcı: '10001002', Parola: 'gizli-2' } },
        { ortamId: testOrtami, degerler: { Kanal: '10002', Kullanıcı: '10002001', Parola: 'gizli-3' } }
      ]
    });
    girisId = r.tablo.id;
    expect(r.tablo.sutunlar).toEqual([{ ad: 'Kanal', gizli: false, tip: 'metin' }, { ad: 'Kullanıcı', gizli: false, tip: 'metin' }, { ad: 'Parola', gizli: true, tip: 'metin' }]);
    expect(r.tablo.satirlar.map((x: Nesne) => x.degerler)).toEqual([
      { Kanal: '10001', Kullanıcı: '10001001', Parola: null }, { Kanal: '10001', Kullanıcı: '10001002', Parola: null }, { Kanal: '10002', Kullanıcı: '10002001', Parola: null }]);
    expect(r.tablo.satirlar[0].doluGizli).toEqual(['Parola']);
    expect(r.tablo.satirlar[2].ortamId).toBe(testOrtami);
    expect(JSON.stringify(await tablolar())).not.toContain('gizli-1');
    // Diskte düz metin yok (tüm değerler kasa zarfı).
    const vt = await veritabaniAc(vtYolu, { saltOkunur: true });
    try {
      const ham = vt.tumu('SELECT degerler_json FROM test_verisi_profilleri').map((x) => String(x.degerler_json)).join('\n');
      expect(ham).not.toContain('10001001');
      expect(ham).not.toContain('gizli-1');
      expect(ham).toContain('kasa:v1');
    } finally { vt.kapat(); }
  });

  test('karşılıklar: değerin sayfa / servis değeri saklanır (diskte şifreli); verilmezse korunur, {} siler; gizli sütunda yok', async () => {
    const kaydet = (sutunlar: Nesne[], satirlar?: Nesne[], id?: string) => basarili('/platform/tablo/kaydet', { projeId, id, ad: 'Rota kapsamı', sutunlar, satirlar });
    let t = (await kaydet([{ ad: 'Kapsam', karsiliklar: { 'DÜNYA': { sayfa: '1', servis: 'WORLDWIDE-X' }, 'AVRUPA': { sayfa: '2' }, 'BOŞ': { sayfa: ' ', servis: '' } } }, { ad: 'Anahtar', gizli: true, karsiliklar: { a: { sayfa: 'b' } } }],
      [{ degerler: { Kapsam: 'DÜNYA', Anahtar: 'k1' } }, { degerler: { Kapsam: 'AVRUPA', Anahtar: 'k2' } }])).tablo;
    expect(t.sutunlar).toEqual([{ ad: 'Kapsam', gizli: false, tip: 'metin', karsiliklar: { 'DÜNYA': { sayfa: '1', servis: 'WORLDWIDE-X' }, 'AVRUPA': { sayfa: '2' } } }, { ad: 'Anahtar', gizli: true, tip: 'metin' }]);
    const vt = await veritabaniAc(vtYolu, { saltOkunur: true });
    try {
      const ham = vt.tumu('SELECT alanlar_json FROM test_verisi_turleri').map((x) => String(x.alanlar_json)).join('\n');
      expect(ham).not.toContain('WORLDWIDE-X');
      expect(ham).not.toContain('DÜNYA');
    } finally { vt.kapat(); }
    // Karşılık verilmeden kaydedilince (ör. satır ekleme, sütun adı değişikliği) korunur; {} siler.
    t = (await kaydet([{ ad: 'Kapsam alanı', eskiAd: 'Kapsam' }, { ad: 'Anahtar', gizli: true }], [{ degerler: { 'Kapsam alanı': 'ASYA' } }], t.id)).tablo;
    expect(t.sutunlar[0].karsiliklar).toEqual({ 'DÜNYA': { sayfa: '1', servis: 'WORLDWIDE-X' }, 'AVRUPA': { sayfa: '2' } });
    t = (await kaydet([{ ad: 'Kapsam alanı', karsiliklar: {} }, { ad: 'Anahtar', gizli: true }], [], t.id)).tablo;
    expect(t.sutunlar[0].karsiliklar).toBeUndefined();
    const red = await api('/platform/tablo/kaydet', { projeId, id: t.id, ad: 'Rota kapsamı', sutunlar: [{ ad: 'Kapsam alanı', karsiliklar: ['x'] }] });
    expect(red.mesaj).toContain('karşılıkları geçersiz');
    await basarili('/platform/tablo/sil', { projeId, id: t.id });
  });

  test('sütun adı değişince değerler taşınır; boş gizli hücre kayıtlı değeri korur; satır silinir; ad ve karakter kuralları', async () => {
    const [t] = await tablolar();
    const r = await basarili('/platform/tablo/kaydet', {
      projeId, id: girisId, ad: 'Servis girişi',
      sutunlar: [{ ad: 'Kanal', eskiAd: 'Kanal' }, { ad: 'Kullanıcı adı', eskiAd: 'Kullanıcı' }, { ad: 'Parola', eskiAd: 'Parola', gizli: true }],
      satirlar: [{ id: t.satirlar[0].id, ortamId: null, degerler: { Kanal: '10001', 'Kullanıcı adı': '10001009', Parola: null } }],
      silinenSatirlar: [t.satirlar[1].id]
    });
    expect(r.tablo.satirlar.map((x: Nesne) => x.degerler['Kullanıcı adı'])).toEqual(['10001009', '10002001']);
    expect(r.tablo.satirlar[0].doluGizli).toEqual(['Parola']);
    // Hatalar: aynı ad, yasak karakter, tekrar eden sütun.
    expect((await api('/platform/tablo/kaydet', { projeId, ad: 'servis GİRİŞİ', sutunlar: [{ ad: 'A' }] })).mesaj).toContain('zaten var');
    expect((await api('/platform/tablo/kaydet', { projeId, ad: 'Kişi.X', sutunlar: [{ ad: 'A' }] })).mesaj).toContain('geçersiz');
    expect((await api('/platform/tablo/kaydet', { projeId, ad: 'Yeni', sutunlar: [{ ad: 'A' }, { ad: 'a' }] })).mesaj).toContain('tekrar ediyor');
  });

  test('eski kayıt: satır düzenlenince adı (ör. tc1) korunur; parola adlı eski alan gizli sayılır', async () => {
    const turId = String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Kişi', alanlar: [{ ad: 'tcKimlikNo' }, { ad: 'parola' }] })).id);
    const p = await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad: 'tc1', degerler: { tcKimlikNo: '10000000146', parola: 'x' } });
    const kisi = (await tablolar()).find((x) => x.id === turId) as Nesne;
    expect(kisi.sutunlar).toEqual([{ ad: 'tcKimlikNo', gizli: false, tip: 'metin' }, { ad: 'parola', gizli: true, tip: 'metin' }]);
    expect(kisi.satirlar[0].degerler).toEqual({ tcKimlikNo: '10000000146', parola: null });
    await basarili('/platform/tablo/kaydet', { projeId, id: turId, ad: 'Kişi', sutunlar: kisi.sutunlar.map((s: Nesne) => ({ ...s, eskiAd: s.ad })),
      satirlar: [{ id: p.profil.id, degerler: { tcKimlikNo: '20000000046', parola: null } }] });
    const profiller = (await basarili(`/platform/test-verisi-profilleri?projeId=${projeId}`)).profiller as Nesne[];
    expect(profiller.find((x) => x.id === p.profil.id)?.ad).toBe('tc1');
  });

  test('bağlam profilleri tablo olarak: listelenir, satır adı zorunlu, sütun / ad değişikliği profillere yazılır', async () => {
    await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad: 'varsayilan', alanlar: { subeKodu: '9001' }, ortamId: null });
    await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad: 'ikinci', alanlar: { subeKodu: '9002' }, ortamId: testOrtami });
    // Diğer ekranlar (bağlama) bağlam tablolarını görmez; Tablolar ekranı görür.
    expect((await tablolar()).some((x) => x.baglam)).toBe(false);
    const hepsi = (await basarili(`/platform/tablolar?projeId=${projeId}&baglam=1`)).tablolar as Nesne[];
    const sube = hepsi.find((x) => x.baglam && x.ad === 'Şube') as Nesne;
    expect(sube.sutunlar).toEqual([{ ad: 'subeKodu', gizli: false, tip: 'metin' }]);
    expect(sube.satirlar.map((r: Nesne) => [r.ad, r.degerler.subeKodu, r.ortamId])).toEqual([['ikinci', '9002', testOrtami], ['varsayilan', '9001', null]]);
    // Satır adı zorunlu.
    const red = await api('/platform/tablo/kaydet', { projeId, id: sube.id, ad: 'Şube', sutunlar: [{ ad: 'subeKodu', eskiAd: 'subeKodu' }], satirlar: [{ degerler: { subeKodu: '9003' } }] });
    expect(red.mesaj).toContain('adı boş');
    // Sütun adı değişir + yeni satır: profillere yazılır (koşucu bağlam profillerinden okur).
    await basarili('/platform/tablo/kaydet', { projeId, id: sube.id, ad: 'Şube', sutunlar: [{ ad: 'subePartaji', eskiAd: 'subeKodu' }],
      satirlar: [{ ad: 'ucuncu', ortamId: null, degerler: { subePartaji: '9003' } }] });
    const profiller = (await basarili(`/platform/baglam-profilleri?projeId=${projeId}`)).profiller as Nesne[];
    expect(profiller.map((p) => [p.ad, p.alanlar]).sort()).toEqual([['ikinci', { subePartaji: '9002' }], ['ucuncu', { subePartaji: '9003' }], ['varsayilan', { subePartaji: '9001' }]]);
    expect(profiller.find((p) => p.ad === 'ikinci')?.ortamId).toBe(testOrtami);
  });

  test('arayüz: ızgarada düzenle, yapıştırarak yeni tablo, gizli hücre; kaydedilmemiş değişiklikte tablo değiştirme onayı', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/test-verisi');
    // Test verisi yalnız tablolardan oluşur (eski Kayıtlar / Değer listeleri sekmeleri yok).
    await expect(page.getByRole('tab', { name: /Kayıtlar|Değer listeleri/ })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Tablolar' });
    await nav.getByRole('button', { name: /^Servis girişi/ }).click();
    const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
    await expect(duz.getByLabel('1. satır Kanal')).toHaveValue('10001');
    await expect(duz.getByLabel('1. satır Parola')).toHaveAttribute('type', 'password');
    await expect(duz.getByLabel('1. satır Parola')).toHaveAttribute('placeholder', '•••• kayıtlı');
    // Hücre düzenle + satır ekle → Kaydet.
    await duz.getByLabel('2. satır Kullanıcı adı').fill('10002002');
    await duz.getByRole('button', { name: 'Satır', exact: true }).click();
    await duz.getByLabel('3. satır Kanal').fill('10003');
    await duz.getByLabel('3. satır Kullanıcı adı').fill('10003001');
    await duz.getByLabel('3. satır Parola').fill('gizli-9');
    await expect(duz.getByText('kaydedilmemiş değişiklik')).toBeVisible();
    // Kaydetmeden başka tabloya geçmek onay ister.
    await nav.getByRole('button', { name: /^Kişi \d+ sütun/ }).click(); // (grup başlığı "Kişi ve kayıt verileri" ile karışmasın)
    const onay = page.getByRole('dialog', { name: 'Değişiklikleriniz kaydedilmeyecek' });
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect(duz.getByText('kayıtlı', { exact: true })).toBeVisible();
    let t = (await tablolar()).find((x) => x.id === girisId) as Nesne;
    expect(t.satirlar.map((x: Nesne) => x.degerler['Kullanıcı adı'])).toEqual(['10001009', '10002002', '10003001']);
    expect(t.satirlar[2].doluGizli).toEqual(['Parola']);
    // Yeni tablo: yapıştırılan ilk satır sütun adları olur.
    await nav.getByRole('button', { name: 'Yeni tablo' }).click();
    await duz.getByLabel('Tablo adı').fill('Ülke seçenekleri');
    await duz.getByText('Excel\'den yapıştır').click();
    await duz.getByLabel('Yapıştırılacak satırlar').fill('Kapsam\tAlternatif\tÜlke\nDÜNYA\tVİZE TÜM DÜNYA\tALMANYA\nAVRUPA\tVİZE SCHENGEN\tİTALYA');
    await duz.getByRole('button', { name: 'Yapıştırılanları ekle' }).click();
    await expect(duz.getByLabel('2. satır Ülke')).toHaveValue('İTALYA');
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect(nav.getByRole('button', { name: /^Ülke seçenekleri/ })).toContainText('3 sütun · 2 satır');
    t = (await tablolar()).find((x) => x.ad === 'Ülke seçenekleri') as Nesne;
    expect(t.sutunlar.map((s: Nesne) => s.ad)).toEqual(['Kapsam', 'Alternatif', 'Ülke']);
    // Excel (.xlsx): başlık satırı sütunlarla eşleşir, satır eklenir.
    await duz.getByLabel('Excel ya da CSV dosyası').setInputFiles({ name: 'ulkeler.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: sahteXlsx([['Kapsam', 'Alternatif', 'Ülke'], ['AVRUPA', 'ROTA PAKET', 'İSPANYA']]) });
    await expect(duz.getByLabel('3. satır Ülke')).toHaveValue('İSPANYA');
    // Arama.
    await duz.getByLabel('Satırlarda ara').fill('schengen');
    await expect(duz.locator('tbody tr')).toHaveCount(1);
    // Satır adı (senaryoda satırı adıyla seçmek için) düzenlenir.
    await duz.getByLabel('Satırlarda ara').fill('');
    await duz.getByLabel('1. satır adı').fill('dunya-vize');
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect(duz.getByText('kayıtlı', { exact: true })).toBeVisible();
    t = (await tablolar()).find((x) => x.ad === 'Ülke seçenekleri') as Nesne;
    expect(t.satirlar[0].ad).toBe('dunya-vize');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: sütunun karşılıkları penceresi — tablodaki değerler; sayfa / servis değeri girilir, aranır, kaydedilir; gizli sütunda yok', async () => {
    test.setTimeout(60_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/test-verisi');
    const nav = page.getByRole('navigation', { name: 'Tablolar' });
    const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
    await nav.getByRole('button', { name: /^Servis girişi/ }).click();
    await expect(duz.getByRole('button', { name: /^3\. sütunun karşılıkları/ })).toHaveCount(0);   // Parola: gizli
    await nav.getByRole('button', { name: /^Ülke seçenekleri/ }).click();
    await duz.getByRole('button', { name: '1. sütunun karşılıkları' }).click();
    const p = page.getByRole('dialog', { name: '"Kapsam" değerlerinin karşılıkları' });
    await expect(p.locator('tbody th')).toHaveText(['DÜNYA', 'AVRUPA']);
    await p.getByLabel('DÜNYA sayfa değeri').fill('1');
    await p.getByLabel('DÜNYA servis değeri').fill('WORLD');
    await p.getByLabel('Değerlerde ara').fill('avr');
    await expect(p.locator('tbody th')).toHaveText(['AVRUPA']);
    await p.getByLabel('AVRUPA sayfa değeri').fill('2');
    await expect(p.getByText('2 değer · 2 karşılık tanımlı')).toBeVisible();
    await p.getByRole('button', { name: 'Tamam' }).click();
    await expect(duz.getByRole('button', { name: '1. sütunun karşılıkları (2)' })).toBeVisible();
    await expect(duz.getByText('kaydedilmemiş değişiklik')).toBeVisible();
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect(duz.getByText('kayıtlı', { exact: true })).toBeVisible();
    const t = (await tablolar()).find((x) => x.ad === 'Ülke seçenekleri') as Nesne;
    expect(t.sutunlar[0].karsiliklar).toEqual({ 'DÜNYA': { sayfa: '1', servis: 'WORLD' }, 'AVRUPA': { sayfa: '2' } });
    // Vazgeç değiştirmez.
    await duz.getByRole('button', { name: '1. sütunun karşılıkları (2)' }).click();
    await p.getByLabel('DÜNYA sayfa değeri').fill('9');
    await p.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(duz.getByText('kayıtlı', { exact: true })).toBeVisible();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
