// KORUMA TESTLERİ — OTOMATİK EŞLEŞTİR (Ekran > Test verisi > "Otomatik eşleştir…"): bağlantısız alanlar için tablo sütunu önerisi
// (alan adı / kişi türü / model seçeneklerinin sütun değerleriyle örtüşmesi), önizlemede hiçbir şey yazılmaz, tek onayla uygulama, geri alma
// (yalnız eşleştirilen alanlar; elle kurulan bağlara dokunulmaz). Seçenekleri ekran modelinde tanımlı alanlar "bağlı değil" demez.
// Ayrı Nöbetçi, 127.0.0.1, geçici veritabanı; dış istek yok. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { akisModeli, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

test.describe('otomatik eşleştir (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Otomatik-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let klasor = '';
  let projeId = '';
  let ekranId = '';
  let kisiTablosu = '';
  let subeTablosu = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const baglar = async () => (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar as Nesne;
  const oneriler = async () => ((await basarili('/platform/ekran/otomatik-eslestir', { projeId, ekranId })).onizleme as Nesne).oneriler as Nesne[];

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    klasor = mkdtempSync(join(tmpdir(), 'otomatik-eslestir-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Mağaza' });
    ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    kisiTablosu = tabloKaydet(vt, { projeId, ad: 'Müşteri kişileri', sutunlar: [{ ad: 'Kimlik no', gizli: true }, { ad: 'Telefon' }, { ad: 'E-posta' }, { ad: 'Ad' }], satirlar: [
      { ad: 'kisi-1', degerler: { 'Kimlik no': '10000000146', Telefon: '5550000001', 'E-posta': 'ayse@ornek.test', Ad: 'Ayşe' } }
    ] });
    subeTablosu = tabloKaydet(vt, { projeId, ad: 'Şubeler', sutunlar: [{ ad: 'Şube adı' }], satirlar: [{ degerler: { 'Şube adı': 'Merkez' } }, { degerler: { 'Şube adı': 'Kadıköy' } }, { degerler: { 'Şube adı': 'Beşiktaş' } }] });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const paket = akisPaketi({ anahtar: 'uyelik-formu', ad: 'Üyelik formu' });
    const model = akisModeli() as Nesne;
    model.id = 'uyelik-formu';
    model.ad = 'Üyelik formu';
    const alan = (id: string, etiket: string, ek: Nesne = {}): Nesne => ({ id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek });
    (model.adimlar[0].bolumler[0].alanlar as Nesne[]).push(
      alan('uyeKimlikNo', 'T.C. Kimlik No', { hassas: true }), alan('uyeTelefon', 'Cep telefonu'), alan('uyeEposta', 'E-posta'), alan('uyeAd', 'Ad'),
      alan('serbestNot', 'Serbest not'),
      alan('subeSecimi', 'Şubemiz', { tip: 'secim', seceneklerDurumu: 'tam', secenekler: [{ deger: 'm', metin: 'Merkez' }, { deger: 'k', metin: 'Kadıköy' }, { deger: 'b', metin: 'Beşiktaş' }] })
    );
    paket.model = model;
    const ortamId = String(((await api(`/platform/ortamlar?projeId=${projeId}`)).ortamlar as Nesne[])?.[0]?.id ?? '');
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: ortamId ? [ortamId] : [] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'Üyelik formu')?.id);
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('önizleme: ad / kişi türü / seçenek örtüşmesine göre öneri, güven ve neden; hiçbir şey yazılmaz', async () => {
    const o = await oneriler();
    const bul = (id: string) => o.find((x) => x.alanId === id);
    expect(bul('uyeKimlikNo')).toMatchObject({ tablo: { id: kisiTablosu }, sutun: 'Kimlik no', guven: 'yuksek', onerilenSecim: true });
    expect(bul('uyeTelefon')).toMatchObject({ sutun: 'Telefon', guven: 'yuksek' });
    expect(bul('uyeEposta')).toMatchObject({ sutun: 'E-posta', guven: 'yuksek' });
    expect(bul('uyeAd')).toMatchObject({ sutun: 'Ad', guven: 'yuksek' });
    // Ad benzemez ama modeldeki 3 seçeneğin 3'ü de sütunda var: orta güven, varsayılan işaretsiz.
    expect(bul('subeSecimi')).toMatchObject({ tablo: { id: subeTablosu }, sutun: 'Şube adı', guven: 'orta', onerilenSecim: false });
    expect(bul('serbestNot')).toBeUndefined();
    expect(JSON.stringify(o).includes('5550000001')).toBe(false);
    expect(await baglar()).toEqual({});
    // Seçenekleri modelde tanımlı alan "bağlı değil" uyarısı gerektirmez (arayüze giden işaret).
    const g = ((await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).girdiler as Nesne[]);
    expect(g.find((x) => x.id === 'subeSecimi')?.modeldeSecenek).toBe(true);
    expect(g.find((x) => x.id === 'uyeTelefon')?.modeldeSecenek).toBeUndefined();
  });

  test('uygula: seçilen alanlar bağlanır; önceki bağlar döner; geri al yalnız o alanları eski hâline getirir', async () => {
    // Elle kurulmuş bağ: otomatik eşleştirme ve geri alma ona dokunmaz.
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { serbestNot: { tablo: subeTablosu, sutun: 'Şube adı' } } });
    await expect(api('/platform/ekran/otomatik-eslestir', { projeId, ekranId, onay: true, secimler: [] })).resolves.toMatchObject({ basarili: false });
    expect(await baglar()).toEqual({ serbestNot: { tablo: subeTablosu, sutun: 'Şube adı' } });
    const y = await basarili('/platform/ekran/otomatik-eslestir', { projeId, ekranId, onay: true, secimler: ['uyeTelefon', 'uyeEposta', 'uyeKimlikNo'] });
    expect(y.baglanan).toBe(3);
    expect(y.onceki).toEqual({ serbestNot: { tablo: subeTablosu, sutun: 'Şube adı' } });
    expect(await baglar()).toEqual({
      serbestNot: { tablo: subeTablosu, sutun: 'Şube adı' }, uyeTelefon: { tablo: kisiTablosu, sutun: 'Telefon' },
      uyeEposta: { tablo: kisiTablosu, sutun: 'E-posta' }, uyeKimlikNo: { tablo: kisiTablosu, sutun: 'Kimlik no' }
    });
    // Bağlı alan bir daha önerilmez.
    expect((await oneriler()).map((x) => x.alanId)).not.toContain('uyeTelefon');
    await basarili('/platform/ekran/otomatik-eslestir/geri-al', { projeId, ekranId, alanlar: ['uyeTelefon', 'uyeEposta', 'uyeKimlikNo'], onceki: y.onceki });
    expect(await baglar()).toEqual({ serbestNot: { tablo: subeTablosu, sutun: 'Şube adı' } });
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: {} });
  });

  test('arayüz: pencere önerileri güvenle gösterir; "Eşleştir" → "Geri al"; seçenekleri modelde olan alan "bağlı değil" demez; 390px taşma yok', async () => {
    const tarayici = await chromium.launch();
    try {
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
      const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
      // Seçenekleri modelde tanımlı alan: "bağlı değil" uyarısı yok; en alttaki kapalı "Bağlamak gerekmeyen alanlar" bölümünde.
      await kart.getByRole('button', { name: /^Bağlamak gerekmeyen alanlar, \d+ alan, kapalı$/ }).click();
      const sube = kart.getByRole('combobox', { name: 'Şubemiz tablo sütunu' });
      await expect(sube.locator('option:checked')).toHaveText('— seçenekler ekranda tanımlı (bağlamak gerekmez) —');
      await expect(kart.getByRole('combobox', { name: 'Cep telefonu tablo sütunu' }).locator('option:checked')).toHaveText('— bağlı değil —');
      await kart.getByRole('button', { name: 'Otomatik eşleştir…' }).click();
      const d = page.getByRole('dialog', { name: 'Otomatik eşleştir' });
      const tablo = d.getByRole('table', { name: 'Önerilen eşleşmeler' });
      await expect(tablo).toBeVisible();
      await expect(tablo.locator('tr[data-alan="uyeTelefon"]')).toContainText('Müşteri kişileri → Telefon');
      await expect(tablo.locator('tr[data-alan="subeSecimi"]')).toContainText('orta');
      await expect(d.getByRole('checkbox', { name: 'Cep telefonu: eşleştir' })).toBeChecked();
      await expect(d.getByRole('checkbox', { name: 'Şubemiz: eşleştir' })).not.toBeChecked();
      expect((await d.innerText()).includes('5550000001')).toBe(false);
      await page.setViewportSize({ width: 390, height: 844 });
      const olcum = await page.evaluate(() => { const x = document.querySelector('dialog[open]') as HTMLElement; return { sayfa: document.documentElement.scrollWidth - innerWidth, diyalog: x.scrollWidth - x.clientWidth }; });
      expect(olcum.sayfa).toBeLessThanOrEqual(2);
      expect(olcum.diyalog).toBeLessThanOrEqual(2);
      await page.setViewportSize({ width: 1280, height: 900 });
      await d.getByRole('button', { name: 'Eşleştir', exact: true }).click();
      await expect(d.getByText(/alan tablo sütunlarına bağlandı/)).toBeVisible();
      await expect.poll(async () => Object.keys(await baglar()).sort()).toEqual(['uyeAd', 'uyeEposta', 'uyeKimlikNo', 'uyeTelefon']);
      await d.getByRole('button', { name: 'Geri al' }).click();
      await expect.poll(async () => baglar()).toEqual({});
      expect(hatalar).toEqual([]);
      await baglam.close();
    } finally { await tarayici.close(); }
  });
});
