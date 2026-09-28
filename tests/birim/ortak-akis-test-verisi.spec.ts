// UÇTAN UCA (yerel) — Ortak akışın "Test verisi" sekmesi: alan → tablo sütunu bağı ortak akışta bir kez kurulur ve onu kullanan
// ekranlara VARSAYILAN olarak geçer; ekran kendi bağıyla ezebilir, "Ortak akışa dön" ile varsayılana döner. Etkin bağ
// (tablolar/ekran-baglari.mjs > etkinAlanBaglari) senaryo formunda ("Tablodan" seçenekleri) ve koşuda (${Tablo.Sütun} satır seçimi)
// kullanılır. Ortak akış paketinin testVerisi bağları ortak akışın ayarlarına yazılır.
// Güvenlik: uygulama 127.0.0.1'deki örnek fikstürün GİRİŞSİZ sayfasıdır (/acik-siparis/); ayrı Nöbetçi örneği, geçici veritabanı.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { OrnekBasvuruUygulamasi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Ortak-Veri-${randomBytes(6).toString('hex')}`;
const ORTAK_ANAHTAR = 'teslimat-ortak';
const TABLO = 'Müşteri kayıtları';

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortamId = '';
let ortakId = '';
let ekranId = '';
let tabloId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Nesne> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
const baglar = async (id: string): Promise<Nesne> => (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${id}`)) as Nesne;

/** Ortak akış: teslimat seçimi + kaydet; paketinde kayıt tablosu ve teslimat alanının bağı. */
function ortakPaketi(): Nesne {
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: ORTAK_ANAHTAR, ad: 'Teslimat (ortak)' }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [] },
    model: {
      semaSurumu: 2, tur: 'ortakAkis', id: ORTAK_ANAHTAR, ad: 'Teslimat (ortak)', aciklama: 'Teslimat kısmı (nötr fikstür).', kosullar: {},
      adimlar: [{
        id: 'teslimat', sira: 1, baslik: 'Teslimat seçilir, sipariş kaydedilir',
        bolumler: [{ id: 'teslimatBolumu', baslik: 'Teslimat', alanlar: [{
          id: 'teslimatSecimi', tip: 'secim', etiket: { ekran: 'Teslimat' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'teslimatSecimi' },
          konum: { secici: '#teslimat', kirilganlik: 'dusuk' }, secenekler: [{ deger: 'dar', metin: 'Dar' }, { deger: 'genis', metin: 'Geniş' }], seceneklerDurumu: 'tam'
        }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Siparisi kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Siparis oluşturuldu', secici: '#siparis-sonuc' } }
      }],
      senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
    },
    senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [TABLO] }, bilinmeyenler: [],
    testVerisi: {
      tablolar: [{ ad: TABLO, tur: 'kayit', sutunlar: [{ ad: 'Ad' }, { ad: 'Teslimat' }], satirlar: [['Ayşe Deneme', 'dar'], ['Ali Deneme', 'genis']] }],
      baglantilar: [{ alanId: 'teslimatSecimi', tablo: TABLO, sutun: 'Teslimat' }]
    }
  };
}

/** Ortak akışı kullanan ekran (girişsiz sayfa): müşteri adı → Devam → ortak akış (teslimat + kaydet). */
function ekranPaketi(): Nesne {
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'ortakli-siparis', ad: 'Ortaklı Sipariş', urlYolu: '/acik-siparis/' }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [] },
    model: {
      semaSurumu: 2, tur: 'ekran', id: 'ortakli-siparis', ad: 'Ortaklı Sipariş', aciklama: 'Ortak akışı kullanan ekran (nötr fikstür).', ekranUrl: '/acik-siparis/', girisGerekmez: true,
      specDosyasi: 'tests/scenarios/ortakli-siparis/ortakli-siparis.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (ortakli-siparis)' },
      kosullar: {},
      adimlar: [
        {
          id: 'musteri', sira: 1, baslik: 'Müşteri bilgisi girilir',
          bolumler: [{ id: 'musteriBolumu', baslik: 'Müşteri', alanlar: [{
            id: 'musteriAdi', tip: 'metin', etiket: { ekran: 'Ad Soyad' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'musteriAdi' }, konum: { secici: '#musteriAd', kirilganlik: 'dusuk' }
          }] }],
          kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#teslimat' } }
        },
        { id: 'teslimatAdimi', sira: 2, baslik: 'Teslimat', ortakAkis: { dosya: `${ORTAK_ANAHTAR}.model.json` } }
      ],
      senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
      urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
    },
    senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'ortak-akis-veri-'));
  uygulama = new OrnekBasvuruUygulamasi({ totp: false });
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Ortak Veri Projesi' })).proje.id);
  ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

async function sayfa(): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 1000 }, colorScheme: 'dark' });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}
function agKontrol(istekler: string[]): void {
  expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
}

test('ortak akış paketinin testVerisi bağı ortak akışın ayarlarına yazılır; kullanan ekrana varsayılan olarak geçer (ekranın kendi bağı yok)', async () => {
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: ortakPaketi(), senaryoIndeksleri: [], ortamIdleri: [],
    testVerisi: { tablolar: { [TABLO]: { islem: 'yeni' } }, baglantilar: ['teslimatSecimi'] }
  });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ekranPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
  ortakId = String(ekranlar.find((e) => e.anahtar === ORTAK_ANAHTAR)?.id);
  ekranId = String(ekranlar.find((e) => e.anahtar === 'ortakli-siparis')?.id);
  tabloId = String(((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.ad === TABLO)?.id);
  const o = await baglar(ortakId);
  expect(o).toMatchObject({ ortakAkis: true, baglar: { teslimatSecimi: { tablo: tabloId, sutun: 'Teslimat' } }, ortakBaglar: {} });
  // Ortak akışın kendi alanları listelenir (ortak akış kendi başına koşmaz ama bağlanır).
  expect((o.girdiler as Nesne[]).map((g) => g.id)).toEqual(['teslimatSecimi']);
  const e = await baglar(ekranId);
  expect(e.ortakAkis).toBe(false);
  expect(e.baglar).toEqual({});
  expect(e.ortakBaglar).toEqual({ teslimatSecimi: { tablo: tabloId, sutun: 'Teslimat', ortakAkis: { id: ortakId, ad: 'Teslimat (ortak)' } } });
  // Senaryo formu: ortak akıştan gelen bağla teslimat alanının seçenekleri tablodan ("Tablodan").
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne;
  const liste = (form.degerListeleri as Nesne[]).find((l) => l.hedef?.alan === 'teslimatSecimi');
  expect(liste, JSON.stringify(form.degerListeleri)).toBeTruthy();
  expect(liste?.baglanti).toMatchObject({ tablo: TABLO, sutun: 'Teslimat' });
  // Tablolar ekranı: tablo, ortak akış bağıyla onu kullanan ekranda da kullanılıyor sayılır.
  const tv = await api(`/platform/tablolar?projeId=${projeId}&baglam=1`);
  expect((tv.ekranKullanimi as Nesne)[tabloId]).toEqual(expect.arrayContaining(['Teslimat (ortak)', 'Ortaklı Sipariş']));
});

test('koşu: ortak akışın bağı ${Tablo.Sütun} satır seçiminde kullanılır (teslimat "genis" → aynı satırın Ad\'ı)', async () => {
  test.setTimeout(120_000);
  const yeni = await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId, baslik: 'Ortak bağla satır', ortamIdleri: [ortamId],
    veri: { baslik: 'Ortak bağla satır', musteriAdi: `\${${TABLO}.Ad}`, teslimatSecimi: 'genis' }
  });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  // Bağ olmasaydı ilk satır (Ayşe) seçilirdi; ortak akışın bağıyla teslimat değeri "genis" olan satır seçildi.
  expect(uygulama.acikSiparisler.at(-1)).toMatchObject({ musteriAd: 'Ali Deneme', teslimat: 'genis' });
});

test('arayüz: ortak akışta Test verisi sekmesi (bağ kaydı, senaryo dönüşümleri yok); ekranda "Ortak akıştan" işareti, ezme ve "Ortak akışa dön"', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await sayfa();
  // Ortak akış sayfası.
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ortakId)}`);
  await page.getByRole('tab', { name: 'Test verisi' }).click();
  const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
  await expect(kart.getByText(/bağlar onu kullanan tüm ekranlara varsayılan olarak geçer/)).toBeVisible();
  await expect(kart.getByRole('button', { name: 'Değerleri tabloya bağla…' })).toHaveCount(0);
  await expect(kart.getByRole('button', { name: 'Kişi alanlarını tabloya bağla…' })).toHaveCount(0);
  const ortakSecim = kart.getByRole('combobox', { name: 'Teslimat tablo sütunu' });
  await expect(ortakSecim.locator('option:checked')).toHaveText(`${TABLO} → Teslimat`);
  await ortakSecim.selectOption({ label: '— bağlı değil —' });
  await expect(kart.getByText('✓ Kaydedildi')).toBeVisible();
  expect((await baglar(ortakId)).baglar).toEqual({});
  expect((await baglar(ekranId)).ortakBaglar).toEqual({});
  await ortakSecim.selectOption({ label: `${TABLO} → Teslimat` });
  await expect(kart.getByText('✓ Kaydedildi')).toBeVisible();
  await expect.poll(async () => (await baglar(ortakId)).baglar).toEqual({ teslimatSecimi: { tablo: tabloId, sutun: 'Teslimat' } });

  // Kullanan ekran: bağ ortak akıştan gelir; değiştirilince ekrana özel olur; "Ortak akışa dön" ekran bağını siler.
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
  const ekranKarti = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
  const secim = ekranKarti.getByRole('combobox', { name: 'Teslimat tablo sütunu' });
  await expect(secim.locator('option:checked')).toHaveText(`${TABLO} → Teslimat`);
  await expect(ekranKarti.getByText('Ortak akıştan: Teslimat (ortak)')).toBeVisible();
  await secim.selectOption({ label: `${TABLO} → Ad` });
  await expect(ekranKarti.getByText('✓ Kaydedildi')).toBeVisible();
  await expect.poll(async () => (await baglar(ekranId)).baglar).toEqual({ teslimatSecimi: { tablo: tabloId, sutun: 'Ad' } });
  await expect(ekranKarti.getByText('ekrana özel', { exact: true })).toBeVisible();
  await expect(ekranKarti.getByText('Ortak akıştan: Teslimat (ortak)')).toHaveCount(0);
  // Ekrana özel bağ ortak akışınkini ezer (senaryo formunda da).
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne;
  expect((form.degerListeleri as Nesne[]).find((l) => l.hedef?.alan === 'teslimatSecimi')?.baglanti).toMatchObject({ tablo: TABLO, sutun: 'Ad' });
  await ekranKarti.getByRole('button', { name: 'Teslimat: ortak akışa dön' }).click();
  await expect.poll(async () => (await baglar(ekranId)).baglar).toEqual({});
  await expect(ekranKarti.getByText('Ortak akıştan: Teslimat (ortak)')).toBeVisible();
  await expect(secim.locator('option:checked')).toHaveText(`${TABLO} → Teslimat`);
  agKontrol(istekler);
  await page.close();
});
