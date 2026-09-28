// UÇTAN UCA (yerel) — senaryo tasarım yardımcısının model tarafı: ekran paketi "sinirlar"ı kabul eder (istek metni ister);
// akış tasarımcısında yeniden kaydetmek sınırları ve modelin diğer alan anahtarlarını korur; "Sınırlar" düzenleyicisi (anında
// doğrulama, kayıt, kaldırma); ekran ayrıntısında "Senaryo önerileri" bağlantısı; senaryo formunda "Bilerek boş bırak".
// Ayrı Nöbetçi (127.0.0.1), geçici veritabanı; dış istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { MESAJLAR } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { INCELEME_KURALLARI } from '../../scripts/platform/ekranlar/paket-istekleri.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { akisSiparisModeli, siparisPaketi, TELEFON } from './senaryo-onerileri-fikstur';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-OneriAkis-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortamId = '';
let ekranId = '';

const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
/** Güncel modelin alanı (id ile). */
async function modelAlani(id: string): Promise<Nesne> {
  const d = await basarili(`/platform/ekran?projeId=${projeId}&id=${ekranId}`);
  const alanlar = (d.model.adimlar as Nesne[]).flatMap((a) => (a.bolumler || []).flatMap((b: Nesne) => b.alanlar));
  return alanlar.find((a: Nesne) => a.id === id) as Nesne;
}
const tasarim = async () => basarili(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&akisId=ana`);
const kaydet = (bloklar: Nesne[], onay = true) => api('/platform/ekran/akis/kaydet', { projeId, ekranId, akisId: 'ana', ad: 'Ana akış', bloklar, onay });
const tamam = async (bloklar: Nesne[]) => { const y = await kaydet(bloklar); expect(y.basarili, JSON.stringify(y)).not.toBe(false); };
const tarih = () => { const t = new Date(); t.setDate(t.getDate() + 5); return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`; };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'oneri-akis-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Sınır Projesi' })).proje.id);
  ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('ekran paketi "sinirlar"ı kabul eder; istek metni sınırları yalnız sayfada belliyse ister', async () => {
  expect(INCELEME_KURALLARI).toContain('sinirlar\'ına yaz');
  expect(INCELEME_KURALLARI).toContain('belli değilse yazma, tahmin etme');
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: siparisPaketi(akisSiparisModeli()), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  ekranId = String(liste.ekranlar.find((e) => e.ad === 'Sipariş akışı')?.id);
  expect((await modelAlani('adet')).sinirlar).toEqual({ enAz: 1, enCok: 10 });
  // Hatalı sınır paketi reddeder.
  const bozuk = akisSiparisModeli();
  bozuk.id = 'bozuk-siparis';
  bozuk.adimlar[0].bolumler[0].alanlar[1].sinirlar = { enAz: 5, enCok: 2 };
  const r = await api('/platform/sayfa-paketi/ekle', { projeId, paket: siparisPaketi(bozuk), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  expect(r.basarili).toBe(false);
  expect((r.hatalar as Nesne[]).map((x) => x.mesaj).join('\n')).toContain('"enAz" "enCok"tan büyük olamaz');
});

test('akış tasarımcısı: aynen kaydetmek sınırları ve diğer alan anahtarlarını korur; düzenleme / kaldırma / hatalı kural', async () => {
  const t = await tasarim();
  const grup = (t.bloklar as Nesne[]).find((b) => b.tur === 'alanlar' && b.alanlar.includes('adet')) as Nesne;
  expect(grup.sinirlar).toMatchObject({ adet: { enAz: 1, enCok: 10 }, urunAdi: { enAzUzunluk: 3, enCokUzunluk: 10 } });
  const onceki = await modelAlani('adet');
  await tamam(t.bloklar);
  const sonra = await modelAlani('adet');
  for (const k of ['sinirlar', 'birim', 'notlar', 'dogrulama', 'varsayilan', 'zorunlu', 'konum', 'eslesme']) expect(sonra[k], k).toEqual(onceki[k]);
  expect((await modelAlani('teslimatTarihi')).sinirlar).toEqual({ enAz: 'bugun+1', enCok: 'bugun+30' });

  // Sınır bilgisi gönderilmeyen blok (eski istemci): mevcut kural korunur.
  const sinirsiz = (t.bloklar as Nesne[]).map((b) => { const { sinirlar: _s, ...geri } = b; return geri; });
  await tamam(sinirsiz);
  expect((await modelAlani('adet')).sinirlar).toEqual({ enAz: 1, enCok: 10 });

  // Düzenle / kaldır.
  const duzenli = (t.bloklar as Nesne[]).map((b) => (b === grup || (b.tur === 'alanlar' && b.alanlar.includes('adet'))
    ? { ...b, sinirlar: { ...b.sinirlar, adet: { enAz: 2, enCok: 5, artis: 1 }, urunAdi: null } } : b));
  await tamam(duzenli);
  expect((await modelAlani('adet')).sinirlar).toEqual({ enAz: 2, enCok: 5, artis: 1 });
  expect(await modelAlani('urunAdi')).not.toHaveProperty('sinirlar');

  // Hatalı kural: blok hatası olarak döner (kaydedilmez).
  const hatali = duzenli.map((b) => (b.tur === 'alanlar' && b.alanlar.includes('adet') ? { ...b, sinirlar: { adet: { enAz: 9, enCok: 3 } } } : b));
  const r = await kaydet(hatali, false);
  expect(r.basarili).toBe(false);
  expect((r.hatalar as Nesne[]).map((x) => x.mesaj)).toContain('“Adet” sınırları: "enAz" "enCok"tan büyük olamaz');
  expect((await modelAlani('adet')).sinirlar).toEqual({ enAz: 2, enCok: 5, artis: 1 });
});

test('arayüz: "Sınırlar" düzenleyicisi anında doğrular, kaydeder; ekran ayrıntısında "Senaryo önerileri" bağlantısı', async () => {
  test.setTimeout(60_000);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto(`/#/ekranlar/e/${ekranId}`);
  const baglanti = page.getByRole('link', { name: 'Senaryo önerileri' });
  await expect(baglanti).toHaveAttribute('href', `#/senaryolar/oneriler/${ekranId}`);
  await page.goto(`/#/ekranlar/e/${ekranId}/akis`);
  await page.getByRole('button', { name: 'Düzenle' }).click();
  // Sayı alanı: özet düğmede; seçim alanında sınır düğmesi yok.
  await expect(page.getByRole('button', { name: 'Adet: sınırlar' })).toHaveText(/2–5/);
  await expect(page.getByRole('button', { name: 'Kategori: sınırlar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Adet: sınırlar' }).click();
  const duzenleyici = page.getByRole('group', { name: 'Adet: sınırlar' });
  await duzenleyici.getByLabel('En az').fill('20');
  await expect(duzenleyici.getByRole('alert')).toContainText('"enAz" "enCok"tan büyük olamaz');
  await duzenleyici.getByRole('button', { name: 'Sınırları kaydet' }).click();
  await expect(duzenleyici).toBeVisible(); // hatalıyken kapanmaz
  await duzenleyici.getByLabel('En az').fill('1');
  await duzenleyici.getByLabel('En çok').fill('8');
  await duzenleyici.getByRole('button', { name: 'Sınırları kaydet' }).click();
  await expect(page.getByRole('button', { name: 'Adet: sınırlar' })).toHaveText(/1–8/);
  // Tarih alanı: sabit tarih ya da bugün±N.
  await page.getByRole('button', { name: 'Teslimat tarihi: sınırlar' }).click();
  const tarihDuz = page.getByRole('group', { name: 'Teslimat tarihi: sınırlar' });
  await expect(tarihDuz.getByLabel('En geç')).toHaveValue('bugun+30');
  await tarihDuz.getByLabel('En geç').fill('yarın');
  await expect(tarihDuz.getByRole('alert')).toContainText('"enCok" tarihte');
  await tarihDuz.getByLabel('En geç').fill('31.12.2027');
  await tarihDuz.getByRole('button', { name: 'Sınırları kaydet' }).click();
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await expect.poll(async () => (await modelAlani('adet')).sinirlar).toEqual({ enAz: 1, enCok: 8, artis: 1 });
  expect((await modelAlani('teslimatTarihi')).sinirlar).toEqual({ enAz: 'bugun+1', enCok: '31.12.2027' });
  expect((await modelAlani('adet')).birim).toBe('adet');
  expect(hatalar).toEqual([]);
  await baglam.close();
});

test('senaryo formu: "Bilerek boş bırak" alanı temizler ve kapatır; kayıtta bilerekBos, kaldırınca alan yeniden düzenlenir', async () => {
  test.setTimeout(60_000);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto(`/#/senaryolar/yeni/${ekranId}`);
  await expect(page.getByRole('heading', { name: 'Yeni senaryo', level: 2 })).toBeVisible();
  const adet = page.locator('[data-alan="adet"] input[type="number"]');
  await adet.fill('3');
  // Yalnız zorunlu alanlarda sunulur.
  await expect(page.locator('[data-alan="siparisNotu"]').getByRole('checkbox', { name: 'Bilerek boş bırak' })).toHaveCount(0);
  await page.locator('[data-alan="adet"]').getByRole('checkbox', { name: 'Bilerek boş bırak' }).check();
  await expect(adet).toHaveValue('');
  await expect(adet).toBeDisabled();
  await expect(page.locator('[data-alan="adet"]')).toContainText(MESAJLAR.bilerekBos('Adet'));
  await expect(page.locator('[data-alan="adet"]')).toContainText('koşucu bu alana değer yazmaz');
  await page.getByPlaceholder('ör. bağlam / kapsam / beklenen sonuç…').fill('Adet boş bırakılır');
  await page.locator('[data-alan="urunAdi"] input:not([type="checkbox"])').fill('Kalem');
  await page.locator('[data-alan="kategori"] select').selectOption('kitap');
  await page.locator('[data-alan="teslimatTarihi"] input:not([type="checkbox"])').fill(tarih());
  await page.locator('[data-alan="telefon"] input:not([type="checkbox"])').fill(TELEFON);
  await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
  await expect(page.getByRole('heading', { name: /Sipariş akışı/, level: 2 })).toBeVisible();
  const liste = ((await basarili(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[]);
  const id = liste.find((s) => s.baslik === 'Adet boş bırakılır')?.id as string;
  const kayit = (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo;
  expect(kayit.veri.bilerekBos).toEqual(['adet']);
  expect(kayit.veri).not.toHaveProperty('adet');

  // Düzenle: işaret açık gelir; kaldırınca alan açılır, değer yazılır, liste kalkar.
  await page.goto(`/#/senaryolar/duzenle/${id}`);
  const kutu = page.locator('[data-alan="adet"]').getByRole('checkbox', { name: 'Bilerek boş bırak' });
  await expect(kutu).toBeChecked();
  await expect(adet).toBeDisabled();
  await kutu.uncheck();
  await expect(adet).toBeEnabled();
  await adet.fill('4');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect.poll(async () => (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo.veri).toMatchObject({ adet: 4 });
  expect((await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo.veri).not.toHaveProperty('bilerekBos');
  expect(hatalar).toEqual([]);
  await baglam.close();
});
