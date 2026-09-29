// KORUMA TESTLERİ — SENARYO FORMUNDA KAYIT GRUBU: aynı kayıt tablosuna bağlı alanlar tek grup ("Hazır kişi (tablodan)" / "Yeni (elle
// gir)"). Hazır: satır seçilince gruptaki tüm alanlar o satırdan özet olarak dolar (ham ${…} ve tam gizli değer görünmez; gizli sütunda
// yalnız sunucunun kısmi maskesi); "Bir kişi daha ekle" → her satır ayrı test (veriKosulari 'secili'); "Koşula uyan tüm satırlar" →
// koşullar grubun içinde ('tumu'). Saklama eski biçimle aynı (${Tablo.Sütun} + tabloSecimleri + veriKosulari). Yeni: düz girdiler,
// tarihte "Tablodan" yok. Eski biçimli ve karışık senaryolar doğru açılır; 3 sütunlu satırda tarih alanı komşusuna binmez, 390 px
// taşma yok; kaydedilen senaryo 127.0.0.1'deki sahte sayfaya seçilen satırın değerlerini yazar. Yeni + "Bu kaydı tabloya da ekle":
// senaryoyla tek işlemde tabloya satır (aynı değerlerle satır varsa o kullanılır; hata olursa hiçbiri yazılmaz). Ayrı Nöbetçi, geçici veritabanı;
// dış istek yok. Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kismiMaske } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const EKRAN = 'Kayıt formu';
const KIMLIK_1 = '10000000146';
const KIMLIK_2 = 'ABC';

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});

function kayitModeli(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'kayit-formu', ad: EKRAN, aciklama: 'Kayıt grubu fikstürü (değerler sahte).', ekranUrl: '/kayit', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'Kayıt bilgileri',
      bolumler: [{ id: 'kisi', baslik: 'Başvuran (1. satır)', alanlar: [
        alan('dogumTarihi', 'tarih', 'Doğum tarihi', { bicim: 'gg.aa.yyyy' }),
        alan('telefon', 'metin', 'Telefon'),
        alan('kimlikNo', 'metin', 'Kimlik no', { hassas: true })
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

function kayitPaketi(): Nesne {
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'kayit-formu', ad: EKRAN, urlYolu: '/kayit' }, olusturan: 'birim testi', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [] },
    model: kayitModeli(), senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
    bilinmeyenler: []
  };
}

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Kayıt</title></head><body>
<label>Doğum <input id="dogumTarihi" type="text"></label>
<label>Telefon <input id="telefon" type="text"></label>
<label>Kimlik <input id="kimlikNo" type="text"></label>
<button id="gonder" type="button">Gönder</button><p id="sonuc"></p>
<script>
document.getElementById('gonder').addEventListener('click', async () => {
  const v = (id) => document.getElementById(id).value;
  await fetch('/kaydet', { method: 'POST', body: JSON.stringify({ dogumTarihi: v('dogumTarihi'), telefon: v('telefon'), kimlikNo: v('kimlikNo') }) });
  document.getElementById('sonuc').textContent = 'Kaydedildi';
});
</script></body></html>`;

test.describe('kayıt grubu: Hazır / Yeni (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kayit-${randomBytes(6).toString('hex')}`;
  const gelenler: Nesne[] = [];
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let vtYolu = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let tabloId = '';
  const satir: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const senaryoAl = async (id: string) => (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;
  const senaryoKaydet = async (baslik: string, veri: Nesne, ek: Nesne = {}) => String((await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId, baslik, ortamIdleri: [ortamId], kosuyaDahil: false, veri: { baslik, ...veri }, ...ek
  })).id);
  const senaryoIdBul = async (baslik: string) => {
    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    return String(liste.find((x) => x.baslik === baslik)?.id ?? '');
  };
  const REF = { dogumTarihi: '${Kişi.Doğum tarihi}', telefon: '${Kişi.Telefon}', kimlikNo: '${Kişi.Kimlik no}' };
  const tasmaYok = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  async function sayfaAc(adres: string, genislik = 1600): Promise<{ page: Page; hatalar: string[] }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(adres);
    await expect(page.locator('.kayit-grubu')).toBeVisible({ timeout: 20_000 });
    return { page, hatalar };
  }
  const grup = (page: Page) => page.locator('.kayit-grubu');
  const hazir = (page: Page) => grup(page).getByRole('radio', { name: 'Hazır kişi (tablodan)' });
  const yeni = (page: Page) => grup(page).getByRole('radio', { name: 'Yeni (elle gir)' });
  const ilkSatir = (page: Page) => grup(page).locator('select[data-kayit-satiri="0"]');
  const alanKap = (page: Page, id: string): Locator => page.locator(`[data-alan="${id}"]`);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kayit-grubu-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/kayit') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
      if (i.yol === '/kaydet' && i.yontem === 'POST') { gelenler.push(JSON.parse(i.govde) as Nesne); return { tur: 'application/json', govde: '{}' }; }
      return { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Kayıt Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: kayitPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === EKRAN)?.id);
    // "Kişi" kayıt tablosu: gizli "Kimlik no" sütunu; iki satır.
    await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Kişi', sutunlar: [{ ad: 'Doğum tarihi' }, { ad: 'Telefon' }, { ad: 'Kimlik no', gizli: true }],
      satirlar: [
        { ad: 'Ayşe', degerler: { 'Doğum tarihi': '01.02.1990', Telefon: '5321112233', 'Kimlik no': KIMLIK_1 } },
        { ad: 'Mehmet', degerler: { 'Doğum tarihi': '03.04.1985', Telefon: '5334445566', 'Kimlik no': KIMLIK_2 } }
      ]
    });
    const t = ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((x) => x.ad === 'Kişi') as Nesne;
    tabloId = String(t.id);
    for (const r of t.satirlar as Nesne[]) satir[String(r.ad)] = String(r.id);
    await basarili('/platform/ekran/alan-baglari/kaydet', {
      projeId, ekranId, baglar: {
        dogumTarihi: { tablo: tabloId, sutun: 'Doğum tarihi' }, telefon: { tablo: tabloId, sutun: 'Telefon' }, kimlikNo: { tablo: tabloId, sutun: 'Kimlik no' }
      }
    });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sunucu: satır seçimi ucu gizli sütunda yalnız kısmi maske döner (tam değer yok; 4 karakterden kısa değer tam maske); form bağlamı kayıt bağlarını verir', async () => {
    expect(kismiMaske(KIMLIK_1)).toBe('1•••••••••6');
    expect(kismiMaske(KIMLIK_2)).toBe('•••');
    expect(kismiMaske('abcd')).toBe('a••d');
    const secim = await api(`/platform/tablolar?projeId=${projeId}&secim=1`);
    const metin = JSON.stringify(secim);
    expect(metin).not.toContain(KIMLIK_1);
    expect(metin).not.toContain(`"${KIMLIK_2}"`);
    const t = (secim.tablolar as Nesne[]).find((x) => x.ad === 'Kişi') as Nesne;
    const r = Object.fromEntries((t.satirlar as Nesne[]).map((x) => [x.ad, x]));
    expect(r.Ayşe.gizliMaskeleri).toEqual({ 'Kimlik no': '1•••••••••6' });
    expect(r.Mehmet.gizliMaskeleri).toEqual({ 'Kimlik no': '•••' });
    expect(r.Ayşe.degerler['Kimlik no']).toBeNull();
    expect(r.Ayşe.degerler.Telefon).toBe('5321112233');
    // Normal uçta maske de yok (Tablolar ekranı davranışı değişmez).
    const normal = JSON.stringify(await api(`/platform/tablolar?projeId=${projeId}`));
    expect(normal).not.toContain(KIMLIK_1);
    expect(normal).not.toContain('1•••••••••6');
    const baglam = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`);
    expect(baglam.kayitBaglari).toEqual({
      dogumTarihi: { tablo: 'Kişi', sutun: 'Doğum tarihi', gizli: false }, telefon: { tablo: 'Kişi', sutun: 'Telefon', gizli: false },
      kimlikNo: { tablo: 'Kişi', sutun: 'Kimlik no', gizli: true }
    });
    expect(baglam.kayitTablolari).toEqual(['Kişi']);
  });

  test('yeni senaryo: grup başında Hazır / Yeni; Yeni\'de düz girdiler ve tarihte Tablodan yok; Hazır\'da satır seçilince üç alan özet (gizli ve ham ${…} yok); kaydet → ${…} + tabloSecimleri', async () => {
    test.setTimeout(120_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    await expect(grup(page)).toContainText('Kişi');
    await expect(yeni(page)).toBeChecked();
    await expect(hazir(page)).not.toBeChecked();
    // Yeni: düz girdiler; tarih alanında yalnız Sabit tarih / Bugüne göre.
    await expect(alanKap(page, 'telefon').locator('input')).toBeVisible();
    await expect(alanKap(page, 'kimlikNo').locator('input[type="password"]')).toBeVisible();
    await expect(alanKap(page, 'dogumTarihi').getByRole('radio', { name: 'Sabit tarih' })).toBeVisible();
    await expect(alanKap(page, 'dogumTarihi').getByRole('radio', { name: 'Tablodan' })).toHaveCount(0);
    await expect(alanKap(page, 'telefon').getByRole('button', { name: /Tablodan/ })).toHaveCount(0);
    // Hazır: satır listesi (satır adı + gizli sütunun kısmi maskesi); seçilince üç alan o satırdan.
    await hazir(page).check();
    await expect(ilkSatir(page)).toBeVisible();
    await expect(ilkSatir(page)).toHaveValue('');
    await expect(ilkSatir(page).locator('option', { hasText: 'Koşula uyan tüm satırlar' })).toHaveCount(1);
    await ilkSatir(page).selectOption({ label: 'Ayşe — Kimlik no 1•••••••••6' });
    await expect(alanKap(page, 'telefon').locator('output.kayit-ozeti')).toContainText('5321112233');
    await expect(alanKap(page, 'dogumTarihi').locator('output.kayit-ozeti')).toContainText('01.02.1990');
    await expect(alanKap(page, 'kimlikNo').locator('output.kayit-ozeti')).toContainText('1•••••••••6 (gizli)');
    await expect(grup(page).getByRole('status')).toHaveAttribute('data-test-sayisi', '1');
    await grup(page).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: test.info().outputPath('kayit-grubu-hazir.png') });
    const govde = await page.locator('.form-sutunu').innerText();
    expect(govde).not.toContain('${');
    expect(await page.content()).not.toContain(KIMLIK_1);
    // Grubu olan tablo alttaki "Satır seçimi" kartında tekrar etmez.
    await expect(page.locator('.satir-secimi-karti')).toBeHidden();
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Hazır kişi');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(() => senaryoIdBul('Hazır kişi'), { timeout: 15_000 }).not.toBe('');
    const s = await senaryoAl(await senaryoIdBul('Hazır kişi'));
    expect(s.veri).toMatchObject(REF);
    expect(s.tabloSecimleri).toEqual({ [`${tabloId}|`]: { 'Doğum tarihi': '01.02.1990', Telefon: '5321112233' } });
    expect(s.veriKosulari ?? null).toBeNull();
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('yeniden aç: aynı satır seçili; "Bir kişi daha ekle" → her satır ayrı test (secili); "Koşula uyan tüm satırlar" → koşullar grubun içinde (tumu); 390 px taşma yok', async () => {
    test.setTimeout(150_000);
    const id = await senaryoIdBul('Hazır kişi');
    let { page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${id}`);
    await expect(hazir(page)).toBeChecked();
    await expect(ilkSatir(page)).toHaveValue(`s:${satir['Ayşe']}`);
    await grup(page).getByRole('button', { name: 'Bir kişi daha ekle' }).click();
    const ikinci = grup(page).locator('select[data-kayit-satiri="1"]');
    await expect(ikinci).toHaveValue(`s:${satir['Mehmet']}`);
    await expect(grup(page).getByRole('status')).toHaveAttribute('data-test-sayisi', '2');
    await expect(alanKap(page, 'telefon').locator('output.kayit-ozeti')).toContainText('2 satırın her biri ayrı test');
    // Tahmini test sayısı alttaki kartta (birleşim / sayı).
    await expect(page.locator('.satir-secimi-karti [data-tahmini-test]')).toHaveAttribute('data-tahmini-test', '2');
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(ikinci).toBeVisible();
    await tasmaYok(page);
    expect(await grup(page).evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
    await grup(page).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: test.info().outputPath('kayit-grubu-coklu-telefon.png') });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect.poll(async () => (await senaryoAl(id)).veriKosulari, { timeout: 15_000 }).toEqual({ gruplar: { [`${tabloId}|`]: { kip: 'secili', satirlar: [satir['Ayşe'], satir['Mehmet']] } } });
    expect((await senaryoAl(id)).tabloSecimleri).toEqual({ [`${tabloId}|`]: { 'Doğum tarihi': '01.02.1990', Telefon: '5321112233' } });
    expect(hatalar).toEqual([]);
    await page.context().close();
    // Eski "seçili satırların her biri" biçimi aynen açılır; × ile tek satıra inince çoklu ayar kalkar.
    ({ page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${id}`));
    await expect(grup(page).locator('select[data-kayit-satiri="1"]')).toHaveValue(`s:${satir['Mehmet']}`);
    await grup(page).getByRole('button', { name: 'Kişi: 2. satırı kaldır' }).click();
    await expect(grup(page).locator('select[data-kayit-satiri="1"]')).toHaveCount(0);
    await expect(grup(page).getByRole('status')).toHaveAttribute('data-test-sayisi', '1');
    // Koşula uyan tüm satırlar: koşul düzenleyici grubun içinde, "+ ekle" yok.
    await ilkSatir(page).selectOption('tumu');
    await expect(grup(page).locator('details.kosul-duzenleyici')).toHaveAttribute('open', '');
    await expect(grup(page).getByRole('combobox', { name: 'Kişi → Telefon koşulu' })).toBeVisible();
    await expect(grup(page).getByRole('status')).toContainText('Şu an 2 satır uyuyor');
    await expect(grup(page).getByRole('button', { name: 'Bir kişi daha ekle' })).toHaveCount(0);
    await grup(page).getByRole('combobox', { name: 'Kişi → Telefon koşulu' }).selectOption('5334445566');
    await expect(grup(page).getByRole('status')).toContainText('Şu an 1 satır uyuyor');
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect.poll(async () => (await senaryoAl(id)).veriKosulari, { timeout: 15_000 }).toEqual({ gruplar: { [`${tabloId}|`]: { kip: 'tumu' } } });
    expect((await senaryoAl(id)).tabloSecimleri).toEqual({ [`${tabloId}|`]: { Telefon: '5334445566' } });
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('eski biçimli senaryo: ${…} + satır seçimiyle Hazır ve doğru satır; seçimsiz "Koşuda ilk uygun satır"; Yeni\'ye geçince düz girdi ve kayıt düz değer', async () => {
    test.setTimeout(120_000);
    const eski = await senaryoKaydet('Eski biçim', REF, { tabloSecimleri: { [`${tabloId}|`]: { 'Doğum tarihi': '03.04.1985', Telefon: '5334445566' } } });
    let { page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${eski}`);
    await expect(hazir(page)).toBeChecked();
    await expect(ilkSatir(page)).toHaveValue(`s:${satir['Mehmet']}`);
    await expect(alanKap(page, 'kimlikNo').locator('output.kayit-ozeti')).toContainText('••• (gizli)');
    await page.context().close();
    const secimsiz = await senaryoKaydet('Seçimsiz', REF);
    ({ page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${secimsiz}`));
    await expect(hazir(page)).toBeChecked();
    await expect(ilkSatir(page)).toHaveValue('');
    await expect(alanKap(page, 'telefon').locator('output.kayit-ozeti')).toContainText('5321112233');
    await expect(alanKap(page, 'telefon').locator('output.kayit-ozeti')).toContainText('koşuda uyan ilk satır');
    // Yeni: alanlar düz girdi (değerler temizlenir), tarihte Tablodan yok.
    await yeni(page).check();
    await expect(alanKap(page, 'telefon').locator('input')).toHaveValue('');
    await expect(alanKap(page, 'dogumTarihi').getByRole('radio', { name: 'Tablodan' })).toHaveCount(0);
    await alanKap(page, 'dogumTarihi').getByRole('textbox').fill('05.06.1970');
    await alanKap(page, 'telefon').locator('input').fill('5550001122');
    await alanKap(page, 'kimlikNo').locator('input[type="password"]').fill('12345');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect.poll(async () => (await senaryoAl(secimsiz)).veri.telefon, { timeout: 15_000 }).toBe('5550001122');
    const v = (await senaryoAl(secimsiz)).veri;
    expect(v.dogumTarihi).toBe('05.06.1970');
    expect(JSON.stringify(v)).not.toContain('${');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('karışık grup açıkça gösterilir; 3 sütunlu satırda tarih alanı (3 seçenek) komşusuna binmez; Hazır seçilince tutarlı', async () => {
    test.setTimeout(120_000);
    const id = await senaryoKaydet('Karışık', { dogumTarihi: '01.01.2000', telefon: REF.telefon, kimlikNo: REF.kimlikNo });
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${id}`);
    await expect(grup(page).locator('.kayit-karisik')).toContainText('Bu grupta bazı alanlar elle girilmiş');
    await expect(hazir(page)).not.toBeChecked();
    await expect(yeni(page)).not.toBeChecked();
    // Tablodan alınan alan ham ${…} yerine rozet.
    await expect(alanKap(page, 'telefon').locator('.tablodan-deger')).toContainText('Tablodan: Kişi › Telefon');
    // 3 sütunlu satır: üç alan aynı satırda; tarih alanı ve içeriği komşusuna binmez.
    const kutu = async (l: Locator) => { const b = await l.boundingBox(); expect(b).not.toBeNull(); return b!; };
    const tarih = await kutu(alanKap(page, 'dogumTarihi'));
    const tel = await kutu(alanKap(page, 'telefon'));
    const kimlik = await kutu(alanKap(page, 'kimlikNo'));
    expect(Math.abs(tarih.y - tel.y)).toBeLessThan(2);
    expect(Math.abs(tel.y - kimlik.y)).toBeLessThan(2);
    expect(tarih.x + tarih.width).toBeLessThanOrEqual(tel.x);
    const girdi = await kutu(alanKap(page, 'dogumTarihi').locator('.tarih-girdisi'));
    expect(girdi.x + girdi.width).toBeLessThanOrEqual(tarih.x + tarih.width + 0.5);
    for (const parca of await alanKap(page, 'dogumTarihi').locator('.tarih-girdisi > :visible').all()) {
      const b = await kutu(parca);
      expect(b.x + b.width).toBeLessThanOrEqual(tel.x);
    }
    // Kip seçimi tek satır (segment) ya da dar sütunda açılır liste; segment görünüyorsa tek satırda.
    const segment = alanKap(page, 'dogumTarihi').locator('.tarih-kipi');
    if (await segment.isVisible()) {
      const ys = await segment.locator('label').evaluateAll((l) => l.map((x) => Math.round(x.getBoundingClientRect().top)));
      expect(new Set(ys).size).toBe(1);
    } else {
      await expect(alanKap(page, 'dogumTarihi').getByRole('combobox', { name: 'Doğum tarihi: tarih nasıl verilsin' })).toBeVisible();
    }
    await page.screenshot({ path: test.info().outputPath('kayit-grubu-karisik.png') });
    await hazir(page).check();
    await expect(grup(page).locator('.kayit-karisik')).toHaveCount(0);
    await expect(alanKap(page, 'dogumTarihi').locator('output.kayit-ozeti')).toContainText('01.02.1990');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect.poll(async () => (await senaryoAl(id)).veri.dogumTarihi, { timeout: 15_000 }).toBe(REF.dogumTarihi);
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('koşu: Hazır ile kaydedilen senaryo seçilen satırın değerlerini sayfaya yazar (gizli değer dahil)', async () => {
    test.setTimeout(180_000);
    const id = await senaryoKaydet('Koşulacak hazır kişi', REF, { tabloSecimleri: { [`${tabloId}|`]: { 'Doğum tarihi': '03.04.1985', Telefon: '5334445566' } } });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: id, ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(gelenler.at(-1)).toEqual({ dogumTarihi: '03.04.1985', telefon: '5334445566', kimlikNo: KIMLIK_2 });
  });

  // --- Yeni (elle gir) + "Bu kaydı tabloya da ekle" ---------------------------------------------------------------------
  const YENI_KIMLIK = '98765432109';
  const kisiTablosu = async () => ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((x) => x.ad === 'Kişi') as Nesne;
  const YENI_GRUP = [{ tablo: 'Kişi', etiket: '', alanlar: [{ anahtar: 'dogumTarihi', sutun: 'Doğum tarihi' }, { anahtar: 'telefon', sutun: 'Telefon' }, { anahtar: 'kimlikNo', sutun: 'Kimlik no' }] }];
  const tabloyaEkle = (page: Page) => grup(page).getByRole('checkbox', { name: 'Bu kaydı “Kişi” tablosuna da ekle' });
  const satirAdiKutusu = (page: Page) => grup(page).getByRole('textbox', { name: 'Satır adı' });

  test('Yeni + "tabloya da ekle": satır adıyla kaydet → tabloda yeni satır (gizli şifreli), senaryo ${…} + satır seçimi; yeniden açılınca Hazır ve o satır; 390 px taşma yok', async () => {
    test.setTimeout(150_000);
    const satirSayisi = ((await kisiTablosu()).satirlar as Nesne[]).length;
    let { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    await expect(yeni(page)).toBeChecked();
    await expect(tabloyaEkle(page)).toBeVisible();
    await expect(tabloyaEkle(page)).not.toBeChecked();
    await expect(satirAdiKutusu(page)).toBeHidden();
    // Hazır'da kutu yok.
    await hazir(page).check();
    await expect(tabloyaEkle(page)).toHaveCount(0);
    await yeni(page).check();
    await alanKap(page, 'dogumTarihi').getByRole('textbox').fill('07.08.1995');
    await alanKap(page, 'telefon').locator('input').fill('5557778899');
    await alanKap(page, 'kimlikNo').locator('input[type="password"]').fill(YENI_KIMLIK);
    await tabloyaEkle(page).check();
    await expect(satirAdiKutusu(page)).toBeVisible();
    await satirAdiKutusu(page).focus();
    // Öneri gizli olmayan ilk değerlerden (gizli değer öneriye girmez).
    await expect(satirAdiKutusu(page)).toHaveAttribute('placeholder', 'Boşsa: 07.08.1995 5557778899');
    await satirAdiKutusu(page).fill('ÖRNEK KİŞİ 2');
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(satirAdiKutusu(page)).toBeVisible();
    await tasmaYok(page);
    expect(await grup(page).evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
    await grup(page).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: test.info().outputPath('kayit-grubu-tabloya-ekle-telefon.png') });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Tabloya eklenen kişi');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect(page.locator('#bildirimler')).toContainText('“ÖRNEK KİŞİ 2” Kişi tablosuna eklendi; senaryo bu satırı kullanıyor.', { timeout: 15_000 });
    await expect(page.locator('#bildirimler')).not.toContainText(YENI_KIMLIK);
    expect(hatalar).toEqual([]);
    await page.context().close();
    // Tabloda yeni satır: ortam = senaryonun tek ortamı; gizli sütun yanıtta yok, diskte düz yok.
    const t = await kisiTablosu();
    expect((t.satirlar as Nesne[]).length).toBe(satirSayisi + 1);
    const r = (t.satirlar as Nesne[]).find((x) => x.ad === 'ÖRNEK KİŞİ 2') as Nesne;
    expect(r.degerler).toEqual({ 'Doğum tarihi': '07.08.1995', Telefon: '5557778899', 'Kimlik no': null });
    expect(r.doluGizli).toEqual(['Kimlik no']);
    expect(r.ortamId).toBe(ortamId);
    satir['ÖRNEK KİŞİ 2'] = String(r.id);
    expect(readFileSync(vtYolu).includes(Buffer.from(YENI_KIMLIK))).toBe(false);
    // Senaryo satıra başvurur.
    const id = await senaryoIdBul('Tabloya eklenen kişi');
    const s = await senaryoAl(id);
    expect(s.veri).toMatchObject(REF);
    expect(s.tabloSecimleri).toEqual({ [`${tabloId}|`]: { 'Doğum tarihi': '07.08.1995', Telefon: '5557778899' } });
    for (const y of [s, await api(`/platform/tablolar?projeId=${projeId}&secim=1`), await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)]) {
      expect(JSON.stringify(y)).not.toContain(YENI_KIMLIK);
    }
    // Yeniden aç: Hazır, o satır seçili; gizli değer yalnız kısmi maske.
    ({ page, hatalar } = await sayfaAc(`/#/senaryolar/duzenle/${id}`));
    await expect(hazir(page)).toBeChecked();
    await expect(ilkSatir(page)).toHaveValue(`s:${satir['ÖRNEK KİŞİ 2']}`);
    await expect(alanKap(page, 'kimlikNo').locator('output.kayit-ozeti')).toContainText('9•••••••••9 (gizli)');
    await expect(alanKap(page, 'telefon').locator('output.kayit-ozeti')).toContainText('5557778899');
    expect(await page.content()).not.toContain(YENI_KIMLIK);
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('aynı değerlerle tekrar: yeni satır eklenmez, mevcut satır kullanılır (bilgi); yanıtta gizli değer yok', async () => {
    const once = ((await kisiTablosu()).satirlar as Nesne[]).length;
    const y = await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Aynı kişi', ortamIdleri: [ortamId], kosuyaDahil: false,
      veri: { baslik: 'Aynı kişi', dogumTarihi: '07.08.1995', telefon: '5557778899', kimlikNo: YENI_KIMLIK },
      yeniTabloSatirlari: [{ ...YENI_GRUP[0], satirAdi: 'Başka ad' }]
    });
    expect(y.tabloSatirlari).toEqual([{ tablo: 'Kişi', etiket: '', satirId: satir['ÖRNEK KİŞİ 2'], satirAdi: 'ÖRNEK KİŞİ 2', yeni: false }]);
    expect(JSON.stringify(y)).not.toContain(YENI_KIMLIK);
    expect(((await kisiTablosu()).satirlar as Nesne[]).length).toBe(once);
    const s = await senaryoAl(String(y.id));
    expect(s.veri).toMatchObject(REF);
    expect(s.tabloSecimleri).toEqual({ [`${tabloId}|`]: { 'Doğum tarihi': '07.08.1995', Telefon: '5557778899' } });
  });

  test('tek işlem: tablo eklemesi (aynı adlı satır / ayırt edilemeyen satır) ya da senaryo kaydı başarısızsa hiçbiri yazılmaz; hata metninde gizli değer yok', async () => {
    const once = ((await kisiTablosu()).satirlar as Nesne[]).length;
    const dene = (baslik: string, veri: Nesne, ek: Nesne) => api('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik, ortamIdleri: [ortamId], kosuyaDahil: false, veri: { baslik, ...veri }, ...ek
    });
    // 1) Aynı adlı satır (tablo kuralı) → senaryo da yazılmaz.
    let y = await dene('Adı çakışan', { dogumTarihi: '09.09.1999', telefon: '5550009988', kimlikNo: '11122233344' }, { yeniTabloSatirlari: [{ ...YENI_GRUP[0], satirAdi: 'ayşe' }] });
    expect(y.basarili).toBe(false);
    expect(String(y.mesaj)).toContain('"ayşe" adında bir satır zaten var');
    expect(JSON.stringify(y)).not.toContain('11122233344');
    expect(await senaryoIdBul('Adı çakışan')).toBe('');
    // 2) Açık değerleri Ayşe ile aynı, gizli değer farklı → ayırt edilemez; hiçbir şey yazılmaz.
    y = await dene('Ayırt edilemeyen', { dogumTarihi: '01.02.1990', telefon: '5321112233', kimlikNo: '55566677788' }, { yeniTabloSatirlari: [{ ...YENI_GRUP[0], satirAdi: 'Ayşe 2' }] });
    expect(y.basarili).toBe(false);
    expect(String(y.mesaj)).toContain('ayırt edilemez');
    expect(JSON.stringify(y)).not.toContain('55566677788');
    expect(JSON.stringify(y)).not.toContain(KIMLIK_1);
    expect(await senaryoIdBul('Ayırt edilemeyen')).toBe('');
    // 3) Tablo satırı eklendikten SONRA senaryo kaydı hata verir (geçersiz satır seçimi) → tablo satırı da geri alınır.
    y = await dene('Sonradan bozulan', { dogumTarihi: '10.10.2000', telefon: '5551112233', kimlikNo: '99988877766' }, {
      yeniTabloSatirlari: [{ ...YENI_GRUP[0], satirAdi: 'Geri alınacak' }], tabloSecimleri: { [`${tabloId}|diger`]: { 'Olmayan sütun': 'x' } }
    });
    expect(y.basarili).toBe(false);
    expect(await senaryoIdBul('Sonradan bozulan')).toBe('');
    const t = await kisiTablosu();
    expect((t.satirlar as Nesne[]).length).toBe(once);
    expect((t.satirlar as Nesne[]).some((x) => x.ad === 'Geri alınacak')).toBe(false);
    expect(readFileSync(vtYolu).includes(Buffer.from('99988877766'))).toBe(false);
  });
});
